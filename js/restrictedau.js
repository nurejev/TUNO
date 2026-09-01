// ======================================================================
// T23 — Restricted AUs (BETA). Create and manage restricted management
// administrative units.
//   https://learn.microsoft.com/entra/identity/role-based-access-control/admin-units-restricted-management
//
// An administrative unit created with isMemberManagementRestricted: true
// takes its members OUT of reach of every tenant-wide role. Only a
// principal holding a role SCOPED TO THAT UNIT can change them — Global
// Administrator and Privileged Role Administrator can manage the unit
// itself, but not the objects inside it. That is the whole point, and it
// is what T22 files a migrated group into.
//
// Ported from ENCA's T27, and DELIBERATELY NARROWER. ENCA's version is
// wound through its Conditional Access baseline: per-persona vaults named
// from CA numbers, a baseline checklist, a group→persona map, prefix
// scans over CAB-SEC/CAD-SEC naming, CA policy reference counts. None of
// that came across — TUNO has no CA baseline and inventing one here would
// be importing a vocabulary the tool cannot honour. What is here is the
// generic half: list, create, edit, delete, members, scoped
// administrators.
//
// THREE FACTS THE UI IS BUILT AROUND, all of them Entra's and none of
// them obvious:
//
//  1. THE FLAG IS IMMUTABLE. isMemberManagementRestricted is set at
//     creation and can never be added to or removed from an existing
//     unit. So "convert this one" is not a thing: the editor changes the
//     name and the description and says so.
//
//  2. A UNIT WITH NO SCOPED ADMINISTRATOR IS A VAULT NOBODY CAN OPEN.
//     Tenant-wide roles are blocked BY DESIGN, so somebody has to hold a
//     role scoped to it or its members are unmanageable by everyone. This
//     tool therefore grants one AT CREATION and defaults it to the person
//     creating the unit, which is very nearly always the right answer.
//
//  3. A ROLE-ASSIGNABLE GROUP INSIDE A RESTRICTED UNIT IS FROZEN. A
//     role-assignable group admits only GA/PRA; a restricted unit blocks
//     exactly those two; neither can be assigned at unit scope. Nobody
//     can change that group's members at all. It is shown as 🧊 frozen
//     and the way out is T22.
//
// AND ONE FACT ABOUT THE DIRECTORY: writes here are NOT read-your-writes.
// Entra replicates eventually, so a re-read straight after a member add
// faithfully reports the old state and a naive "mutate, clear cache,
// re-read" makes the UI undo itself in front of the operator. settle()
// below is the answer, ported because it was paid for.
// ======================================================================
const RestrictedAu = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();

  // v1.0 nests administrative units under /directory — the same thing that
  // broke T22 at beta 10506. One constant, shared by both tools.
  const AU = "/directory/administrativeUnits";

  const SCOPES = {
    read: ["AdministrativeUnit.Read.All"],
    write: ["AdministrativeUnit.ReadWrite.All"],
    rolesRead: ["RoleManagement.Read.Directory"],
    roleWrite: ["RoleManagement.ReadWrite.Directory"],
  };

  // The roles worth offering at unit scope. Anything else is a trip to the
  // portal, where the whole catalogue is visible and the consequences of an
  // unusual choice are somebody else's to explain.
  const ROLE_TEMPLATES = [
    { id: "fdd7a751-b60b-444a-984c-02652fe8fa1c", name: "Groups Administrator" },
    { id: "fe930be7-5e62-47db-91af-98c3a49a38b1", name: "User Administrator" },
    { id: "729827e3-9c14-49f7-bb1b-9608f156bbb8", name: "Helpdesk Administrator" },
    { id: "4d6ac14f-3453-41d0-bef9-a3e0c569773a", name: "License Administrator" },
  ];
  const GROUPS_ADMIN = ROLE_TEMPLATES[0].id;

  const isRestricted = (au) => au && au.isMemberManagementRestricted === true;

  // ---------------------------------------------------------------- read --
  async function list() {
    const aus = await Graph.readAll(
      `${AU}?$select=id,displayName,description,visibility,isMemberManagementRestricted&$top=999`,
      { scopes: SCOPES.read, retry: true });
    // Restricted first, then by name: the tool is about the restricted ones
    // and an alphabetical mix buries them among units it does not manage.
    return aus.slice().sort((a, b) =>
      (isRestricted(b) ? 1 : 0) - (isRestricted(a) ? 1 : 0)
      || String(a.displayName || "").localeCompare(String(b.displayName || "")));
  }

  // Members, read through the two CASTS rather than one $select.
  //
  // The lesson from T22 at 10508: $select on a directoryObject collection can
  // come back with no @odata.type at all, so splitting members by type is
  // reading a property that may never arrive. The casts ask the directory
  // instead — and the group cast is also the only way to get
  // isAssignableToRole, which is what makes the 🧊 frozen state visible.
  async function members(auId) {
    const id = encodeURIComponent(auId);
    const [users, groups] = await Promise.all([
      Graph.readAll(`${AU}/${id}/members/microsoft.graph.user?$select=id,displayName,userPrincipalName&$top=999`,
        { scopes: SCOPES.read, retry: true }).catch(() => []),
      Graph.readAll(`${AU}/${id}/members/microsoft.graph.group?$select=id,displayName,isAssignableToRole&$top=999`,
        { scopes: SCOPES.read, retry: true }).catch(() => []),
    ]);
    return [
      ...groups.map((g) => ({ id: g.id, name: g.displayName || g.id, kind: "group",
        roleAssignable: g.isAssignableToRole === true })),
      ...users.map((u) => ({ id: u.id, name: u.displayName || u.id, kind: "user",
        upn: u.userPrincipalName || "" })),
    ].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  }

  // /directoryRoles lists only ACTIVATED roles, so a role this tool has just
  // activated is absent from a cached read — and a role id nobody can name
  // prints as a GUID rather than as an invented label.
  let roleNames = null;
  const forgetRoleNames = () => { roleNames = null; };
  async function roleName(roleId) {
    if (!roleNames) {
      roleNames = new Map();
      try {
        (await Graph.readAll("/directoryRoles?$select=id,displayName,roleTemplateId",
          { scopes: SCOPES.rolesRead, retry: true }))
          .forEach((r) => roleNames.set(lc(r.id), r.displayName || r.id));
      } catch { /* names are a nicety; the ids still work */ }
    }
    if (roleNames.has(lc(roleId))) return roleNames.get(lc(roleId));
    try {
      const r = await Graph.get(`/directoryRoles/${encodeURIComponent(roleId)}?$select=id,displayName`,
        { scopes: SCOPES.rolesRead });
      const n = (r && r.displayName) || roleId;
      roleNames.set(lc(roleId), n);
      return n;
    } catch { return roleId; }
  }

  async function scopedAdmins(auId) {
    const rows = await Graph.readAll(`${AU}/${encodeURIComponent(auId)}/scopedRoleMembers`,
      { scopes: SCOPES.rolesRead, retry: true });
    const out = [];
    for (const r of rows) {
      out.push({
        id: r.id,
        roleId: r.roleId,
        role: await roleName(r.roleId),
        principal: (r.roleMemberInfo && (r.roleMemberInfo.displayName || r.roleMemberInfo.userPrincipalName || r.roleMemberInfo.id)) || "—",
      });
    }
    return out.sort((a, b) => a.role.localeCompare(b.role) || a.principal.localeCompare(b.principal));
  }

  // Everything about one unit. Members and administrators fail INDEPENDENTLY:
  // a 403 on the scoped-role read is the common case for an account that can
  // see the unit but not its grants, and losing the member list to it would
  // be reporting less than was actually readable.
  async function detail(auId) {
    const d = { members: [], scoped: [], membersError: "", scopedError: "" };
    try { d.members = await members(auId); } catch (e) { d.membersError = GroupUse.shortErr(e); }
    try { d.scoped = await scopedAdmins(auId); } catch (e) { d.scopedError = GroupUse.shortErr(e); }
    return d;
  }

  // --------------------------------------------------------------- write --
  function buildPayload(form) {
    const errors = [];
    const name = String(form.name || "").trim();
    if (!name) errors.push("A display name is required.");
    if (name.length > 256) errors.push("Keep the display name to 256 characters or less.");
    if (form.creating && form.restricted && !String(form.admin || "").trim()) {
      errors.push("Name a scoped administrator. A restricted unit blocks every tenant-wide role, so one created with nobody scoped to it is a vault nobody can open — including you.");
    }
    if (errors.length) return { ok: false, errors };
    const payload = { displayName: name, description: String(form.description || "").trim() || null };
    // ONLY at creation, and only when asked. The flag is immutable, so a
    // PATCH carrying it is at best ignored and at worst a 400 about a
    // property the caller had no business sending.
    if (form.creating && form.restricted) payload.isMemberManagementRestricted = true;
    return { ok: true, errors, payload };
  }

  const create = (payload) => Graph.post(AU, payload, { scopes: SCOPES.write });
  const rename = (auId, payload) => Graph.patch(`${AU}/${encodeURIComponent(auId)}`,
    { displayName: payload.displayName, description: payload.description }, { scopes: SCOPES.write });
  // Deleting the unit does NOT delete its members. They lose the shield and
  // become manageable tenant-wide again — which is a real change and the
  // reason the confirm is typed rather than clicked.
  const remove = (auId) => Graph.del(`${AU}/${encodeURIComponent(auId)}`, { scopes: SCOPES.write });

  const addMember = (auId, objectId) => Graph.post(
    `${AU}/${encodeURIComponent(auId)}/members/$ref`,
    { "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${objectId}` },
    { scopes: SCOPES.write });
  const removeMember = (auId, objectId) => Graph.del(
    `${AU}/${encodeURIComponent(auId)}/members/${encodeURIComponent(objectId)}/$ref`,
    { scopes: SCOPES.write });

  // The scoped grant needs the ACTIVATED directory-role object id, not the
  // template id. A role never used in this tenant is not in /directoryRoles
  // until it is activated, and activating it is a write.
  async function ensureDirectoryRole(templateId) {
    try {
      const roles = await Graph.readAll("/directoryRoles?$select=id,roleTemplateId",
        { scopes: SCOPES.rolesRead, retry: true });
      const hit = roles.find((r) => lc(r.roleTemplateId) === lc(templateId));
      if (hit) return hit.id;
    } catch { /* fall through to the activation */ }
    try {
      const act = await Graph.post("/directoryRoles", { roleTemplateId: templateId }, { scopes: SCOPES.roleWrite });
      forgetRoleNames();
      if (act && act.id) return act.id;
    } catch (e) {
      // "Already exists" from a race is not a failure — re-read and use it.
      if (!/conflicting object|already exist/i.test((e && e.message) || "")) throw e;
      const roles = await Graph.readAll("/directoryRoles?$select=id,roleTemplateId", { scopes: SCOPES.rolesRead });
      const hit = roles.find((r) => lc(r.roleTemplateId) === lc(templateId));
      if (hit) return hit.id;
    }
    throw new Error("The directory role could not be activated in this tenant.");
  }

  // Several principals at once: one comma/semicolon/newline-separated box is
  // the obvious way to ask for a break-glass pair, and granting the same
  // person twice is a 400 nobody needs to read.
  const adminList = (raw) => [...new Set(String(raw || "").split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean))];

  async function grantScoped(auId, roleTemplateId, who) {
    const term = String(who || "").trim();
    if (!term) throw new Error("No principal named.");
    const user = Graph.isGuid(term)
      ? { id: term }
      : await Graph.get(`/users/${encodeURIComponent(term)}?$select=id,displayName`, { scopes: Graph.SCOPES.directory });
    if (!user || !user.id) throw new Error(`No user matches “${term}”.`);
    const roleId = await ensureDirectoryRole(roleTemplateId);
    try {
      const r = await Graph.post(`${AU}/${encodeURIComponent(auId)}/scopedRoleMembers`,
        { roleId, roleMemberInfo: { id: user.id } }, { scopes: SCOPES.roleWrite });
      forgetRoleNames();
      return { ok: true, id: r && r.id };
    } catch (e) {
      // CONFLICT IS SUCCESS. "They already hold that role here" is the state
      // the caller asked for, and reporting it as a failure makes a
      // re-run look broken.
      if (/conflicting object|already exist/i.test((e && e.message) || "")) return { ok: true, already: true };
      throw e;
    }
  }
  const revokeScoped = (auId, grantId) => Graph.del(
    `${AU}/${encodeURIComponent(auId)}/scopedRoleMembers/${encodeURIComponent(grantId)}`,
    { scopes: SCOPES.roleWrite });

  // ------------------------------------------------ eventual consistency --
  // ENTRA WRITES ARE NOT READ-YOUR-WRITES, and this is the single most
  // surprising thing about managing a directory from a browser. A re-read
  // straight after a member add faithfully reports the old state, so the
  // optimistic row the operator just watched appear vanishes again — and
  // then comes back a few seconds later if they happen to refresh. ENCA
  // paid for this helper; it is ported rather than rediscovered.
  //
  // apply()   makes the optimistic change to the local model
  // reread()  fetches the truth
  // settled() says whether the truth agrees yet
  //
  // Backs off 500 / 1200 / 2500ms, restoring the optimistic view each time
  // the directory disagrees, and reports honestly if it never catches up.
  const SETTLE_WAITS = [500, 1200, 2500];
  async function settle({ apply, reread, settled, render }) {
    apply();
    render && render();
    for (const wait of SETTLE_WAITS) {
      await new Promise((r) => setTimeout(r, wait));
      let truth = null;
      try { truth = await reread(); } catch { /* a failed poll is not an answer */ }
      if (truth && settled(truth)) { render && render(); return true; }
      apply();
      render && render();
    }
    return false;
  }

  // --------------------------------------------------------------- report --
  const mdCell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  function toMd(aus, details, meta = {}) {
    const restricted = aus.filter(isRestricted);
    const L = [`# Restricted management administrative units — ${mdCell(meta.tenant || "tenant")}`, "",
      `**Generated by:** ${mdCell(meta.build || "")}  `,
      `**When:** ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "",
      `- Administrative units: **${aus.length}** — ${restricted.length} restricted, ${aus.length - restricted.length} ordinary`, ""];
    for (const au of aus) {
      const d = (details || {})[au.id] || {};
      L.push(`## ${mdCell(au.displayName)}${isRestricted(au) ? " 🔒 (restricted)" : ""}`, "");
      if (au.description) L.push(mdCell(au.description), "");
      if (d.members) {
        L.push(d.members.length ? `- **Members (${d.members.length})**` : "- **Members:** none — this unit shields nothing yet.");
        for (const m of d.members) {
          const frozen = isRestricted(au) && m.kind === "group" && m.roleAssignable;
          L.push(`  - ${mdCell(m.name)} _(${m.kind})_`
            + (frozen ? " — ⚠ **frozen**: role-assignable inside a restricted unit, so nobody can change its members" : ""));
        }
      }
      if (d.membersError) L.push(`- ⚠ members could not be read: ${mdCell(d.membersError)}`);
      if (d.scoped) {
        L.push(d.scoped.length
          ? `- **Who may manage them (${d.scoped.length})**`
          : "- **Who may manage them:** ⚠ nobody. No role is scoped to this unit, so its members cannot be changed by anyone.");
        for (const r of d.scoped) L.push(`  - ${mdCell(r.principal)} — ${mdCell(r.role)}`);
      }
      if (d.scopedError) L.push(`- ⚠ scoped administrators could not be read: ${mdCell(d.scopedError)}`);
      L.push(`- <sub>id \`${mdCell(au.id)}\`${au.visibility ? ` · visibility: ${mdCell(au.visibility)}` : ""}</sub>`, "");
    }
    L.push("---", "",
      "The `isMemberManagementRestricted` flag is immutable — an existing unit cannot be converted either way.",
      "Members of a restricted unit can only be managed by principals holding a role scoped to that unit;",
      "tenant-level administrators, Global Administrator included, can read but not modify them.");
    return L.join("\n");
  }

  return {
    AU, SCOPES, ROLE_TEMPLATES, GROUPS_ADMIN, isRestricted,
    list, members, detail, scopedAdmins, roleName, forgetRoleNames,
    buildPayload, create, rename, remove,
    addMember, removeMember,
    ensureDirectoryRole, grantScoped, revokeScoped, adminList,
    settle, toMd, lc,
  };
})();


// ======================================================================
// T23 — the screen. One list, one card per unit, everything read lazily:
// a tenant with forty units should not pay forty member reads to answer
// "which units are restricted".
// ======================================================================
const RestrictedAuTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let aus = null;                 // the unit list
  const detail = {};              // id -> { members, scoped, … }, lazily
  const open = new Set();         // which cards are expanded
  let filter = "restricted";      // "restricted" | "all"
  let search = "";
  let editing = null;             // the unit being edited, or null for create
  let deleting = null;
  let busy = false;

  const prog = (m, n, of) => TunoProgress.show("raBody", "raProg", m, n, of);
  const signedInUpn = () => {
    const el = $("tenantUser");
    const v = el ? String(el.textContent || "").trim() : "";
    return /@/.test(v) ? v : "";
  };
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const toast = (el, html) => { if (el) el.innerHTML = html; };

  // ------------------------------------------------------------- read -----
  async function read() {
    if (busy) return;
    busy = true;
    $("raBody").innerHTML = "";
    try {
      prog("Reading administrative units…");
      await Graph.ensureScopes(RestrictedAu.SCOPES.read);
      aus = await RestrictedAu.list();
      Object.keys(detail).forEach((k) => delete detail[k]);
      open.clear();
      prog("");
      render();
    } catch (e) {
      prog("");
      const m = GroupUse.shortErr(e, 400);
      $("raBody").innerHTML = `<div class="list-card"><p class="mini" style="color:var(--off);margin:0">
        <b>Could not read the administrative units.</b> ${esc(m)}</p>
        ${/\b(401|403)\b|Insufficient privileges|Authorization_RequestDenied/i.test(m)
          ? `<p class="mini muted" style="margin:8px 0 0">Needs <code>AdministrativeUnit.Read.All</code>, consented for the app by an administrator.
             Graph also gates this on the signed-in account: reading administrative units wants a directory role, and
             <b>Privileged Role Administrator</b> is the least privileged one that can manage restricted units at all.</p>` : ""}</div>`;
    } finally { busy = false; }
  }

  async function loadDetail(id) {
    if (detail[id]) return detail[id];
    detail[id] = await RestrictedAu.detail(id);
    return detail[id];
  }

  // ------------------------------------------------------------ render ----
  function render() {
    if (!aus) return;
    const restricted = aus.filter(RestrictedAu.isRestricted);
    const q = RestrictedAu.lc(search.trim());
    const shown = (filter === "restricted" ? restricted : aus)
      .filter((a) => !q || RestrictedAu.lc(a.displayName).includes(q) || RestrictedAu.lc(a.id).includes(q));

    const chips = `
      <button class="gu-stat act ${filter === "restricted" ? "on" : ""}" data-raf="restricted"><b>${restricted.length}</b> restricted</button>
      <button class="gu-stat act ${filter === "all" ? "on" : ""}" data-raf="all"><b>${aus.length}</b> all units</button>`;

    // A unit nobody is scoped to is the finding this tool exists to surface,
    // so it is counted at the top — but ONLY over units whose administrators
    // have actually been read. Counting unread units as "nobody" would turn
    // a lazy read into a false alarm.
    const known = restricted.filter((a) => detail[a.id] && !detail[a.id].scopedError);
    const naked = known.filter((a) => !detail[a.id].scoped.length);

    // The chips and the search pin (10543, the layout round — T19's rule):
    // .toolbar is sticky by the shared CSS, so re-filtering after a long
    // unit list never means scrolling back.
    $("raBody").innerHTML = `
      <div class="toolbar">${chips}<input type="text" id="raSearch" value="${esc(search)}" placeholder="Filter by name or object id…" style="flex:1;min-width:200px"></div>
      <div class="list-card">
        ${naked.length ? `<p class="mini" style="margin:0 0 10px;color:var(--off)">⚠ <b>${naked.length} restricted unit${naked.length === 1 ? " has" : "s have"} no scoped administrator</b>
          — ${esc(naked.map((a) => a.displayName).join(", "))}. Tenant-wide roles are blocked by design, so nobody can change what is inside ${naked.length === 1 ? "it" : "them"}.</p>` : ""}
        ${shown.length ? shown.map(card).join("") : '<p class="mini muted" style="margin:0">Nothing matches.</p>'}
      </div>`;
  }

  function card(au) {
    const isOpen = open.has(au.id);
    const d = detail[au.id];
    const r = RestrictedAu.isRestricted(au);
    return `<div class="list-card" style="margin:10px 0 0;padding:14px 16px">
      <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <b>${r ? "🔒 " : ""}${esc(au.displayName || au.id)}</b>
          ${r ? '<span class="tag grant">restricted</span>' : '<span class="tag">ordinary</span>'}
          ${au.description ? `<div class="mini muted">${esc(au.description)}</div>` : ""}
          <div class="mini muted"><code>${esc(au.id)}</code></div>
        </div>
        <div class="tb-actions" style="margin:0">
          <button class="btn sm" data-raopen="${esc(au.id)}">${isOpen ? "Hide" : "Members & admins"}</button>
          <button class="btn sm" data-raedit="${esc(au.id)}">Edit</button>
          <button class="btn sm" data-radel="${esc(au.id)}">Delete</button>
        </div>
      </div>
      ${isOpen ? (d ? cardDetail(au, d) : '<p class="mini muted" style="margin:10px 0 0">Reading…</p>') : ""}
    </div>`;
  }

  function cardDetail(au, d) {
    const r = RestrictedAu.isRestricted(au);
    const mem = d.membersError
      ? `<p class="mini" style="margin:0;color:var(--off)">Members could not be read: ${esc(d.membersError)}</p>`
      : d.members.length
        ? d.members.map((m) => `<p class="mini" style="margin:0 0 3px">
            ${m.kind === "group" ? "👥" : "👤"} ${esc(m.name)}
            ${r && m.kind === "group" && m.roleAssignable
              ? '<span class="tag block" title="Role-assignable AND inside a restricted unit — a role-assignable group admits only Global Administrator or Privileged Role Administrator, and a restricted unit blocks exactly those two. Nobody can change its members. 🔄 Group migration is the way out.">🧊 frozen</span>' : ""}
            <button class="btn sm" data-ramrm="${esc(au.id)}|${esc(m.id)}" title="Remove from this unit">✕</button></p>`).join("")
        : '<p class="mini muted" style="margin:0">No members — this unit shields nothing yet.</p>';

    const adm = d.scopedError
      ? `<p class="mini" style="margin:0;color:var(--off)">Scoped administrators could not be read: ${esc(d.scopedError)}</p>`
      : d.scoped.length
        ? d.scoped.map((s) => `<p class="mini" style="margin:0 0 3px">👤 ${esc(s.principal)} — <b>${esc(s.role)}</b>
            <button class="btn sm" data-rasrm="${esc(au.id)}|${esc(s.id)}" title="Revoke this scoped grant">✕</button></p>`).join("")
        : `<p class="mini" style="margin:0;color:${r ? "var(--off)" : "var(--muted)"}">${r
            ? "⚠ Nobody. Tenant-wide roles are blocked here by design, so this unit's members cannot be changed by anyone until somebody is scoped to it."
            : "None."}</p>`;

    return `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
      <div style="display:grid;grid-template-columns:1fr;gap:14px">
        <div>
          <p class="mini" style="margin:0 0 6px"><b>Members</b> <span class="muted">${d.members.length}</span></p>
          <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
            <input type="text" data-raaddbox="${esc(au.id)}" placeholder="Group name, user UPN or object id…" style="flex:1;min-width:220px">
            <button class="btn sm" data-raadd="${esc(au.id)}">+ Add</button>
          </div>
          ${mem}
        </div>
        <div>
          <p class="mini" style="margin:0 0 6px"><b>Who may manage them</b> <span class="muted">${d.scoped.length}</span></p>
          <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
            <select data-rarole="${esc(au.id)}" style="min-width:190px">
              ${RestrictedAu.ROLE_TEMPLATES.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}
            </select>
            <input type="text" data-raadminbox="${esc(au.id)}" value="${esc(signedInUpn())}" placeholder="UPN, or several separated by ;" style="flex:1;min-width:220px">
            <button class="btn sm" data-raadmin="${esc(au.id)}">Grant</button>
          </div>
          ${adm}
        </div>
      </div>
      <div class="mini" data-ramsg="${esc(au.id)}" style="margin-top:8px"></div>
    </div>`;
  }

  // ------------------------------------------------------------ actions ---
  async function toggle(id) {
    if (open.has(id)) { open.delete(id); render(); return; }
    open.add(id);
    render();
    try { await loadDetail(id); } catch { /* detail() absorbs its own */ }
    render();
  }

  const msgEl = (id) => document.querySelector(`[data-ramsg="${id}"]`);

  async function addMember(auId) {
    const box = document.querySelector(`[data-raaddbox="${auId}"]`);
    const term = box ? box.value.trim() : "";
    if (!term || busy) return;
    busy = true;
    try {
      await Graph.ensureScopes(RestrictedAu.SCOPES.write);
      toast(msgEl(auId), '<span class="muted">Looking it up…</span>');
      const obj = await resolve(term);
      await RestrictedAu.addMember(auId, obj.id);
      if (box) box.value = "";
      const added = { id: obj.id, name: obj.name, kind: obj.kind, roleAssignable: !!obj.roleAssignable };
      const ok = await RestrictedAu.settle({
        apply: () => { if (!detail[auId].members.some((m) => m.id === obj.id)) detail[auId].members.push(added); },
        reread: () => RestrictedAu.members(auId),
        settled: (list) => list.some((m) => m.id === obj.id),
        render,
      });
      if (ok) { detail[auId].members = await RestrictedAu.members(auId); render(); }
      toast(msgEl(auId), ok
        ? `<span style="color:var(--on)">Added ${esc(obj.name)}.</span>`
        : `<span style="color:var(--report)">Added ${esc(obj.name)} — the directory has not caught up yet. It replicates within a minute or so; ⟳ Refresh then.</span>`);
    } catch (e) {
      const m = GroupUse.shortErr(e, 300);
      toast(msgEl(auId), `<span style="color:var(--off)">${esc(m)}</span>`
        + (/\b403\b|Insufficient privileges|Authorization_RequestDenied/i.test(m)
          ? '<span class="muted"> — changing the members of a restricted unit needs a role SCOPED TO THIS UNIT, or Privileged Role Administrator. Consent alone does not open it.</span>' : ""));
    } finally { busy = false; }
  }

  // A UPN goes to /users; anything else is tried as a group by exact name,
  // then as an object id. Nothing is guessed at: an ambiguous name is
  // refused rather than resolved to whichever came back first.
  async function resolve(term) {
    if (/@/.test(term)) {
      const u = await Graph.get(`/users/${encodeURIComponent(term)}?$select=id,displayName`, { scopes: Graph.SCOPES.directory });
      return { id: u.id, name: u.displayName || term, kind: "user" };
    }
    if (Graph.isGuid(term)) {
      try {
        const g = await Graph.get(`/groups/${encodeURIComponent(term)}?$select=id,displayName,isAssignableToRole`, { scopes: Graph.SCOPES.groups });
        return { id: g.id, name: g.displayName || term, kind: "group", roleAssignable: g.isAssignableToRole === true };
      } catch { /* try it as a user */ }
      const u = await Graph.get(`/users/${encodeURIComponent(term)}?$select=id,displayName`, { scopes: Graph.SCOPES.directory });
      return { id: u.id, name: u.displayName || term, kind: "user" };
    }
    const hits = await Graph.readAll(Graph.odata`/groups?$filter=displayName eq '${term}'`
      + "&$select=id,displayName,isAssignableToRole&$top=5", { scopes: Graph.SCOPES.groups });
    if (!hits.length) throw new Error(`No group is called “${term}”. Use the exact name, an object id, or a user's UPN.`);
    if (hits.length > 1) throw new Error(`“${term}” matches ${hits.length} groups — use the object id.`);
    return { id: hits[0].id, name: hits[0].displayName, kind: "group", roleAssignable: hits[0].isAssignableToRole === true };
  }

  async function removeMember(auId, objId) {
    if (busy) return;
    busy = true;
    try {
      await Graph.ensureScopes(RestrictedAu.SCOPES.write);
      await RestrictedAu.removeMember(auId, objId);
      const ok = await RestrictedAu.settle({
        apply: () => { detail[auId].members = detail[auId].members.filter((m) => m.id !== objId); },
        reread: () => RestrictedAu.members(auId),
        settled: (list) => !list.some((m) => m.id === objId),
        render,
      });
      toast(msgEl(auId), ok ? '<span style="color:var(--on)">Removed.</span>'
        : '<span style="color:var(--report)">Removed — the directory is still catching up.</span>');
    } catch (e) {
      toast(msgEl(auId), `<span style="color:var(--off)">${esc(GroupUse.shortErr(e, 300))}</span>`);
    } finally { busy = false; }
  }

  async function grant(auId) {
    const box = document.querySelector(`[data-raadminbox="${auId}"]`);
    const sel = document.querySelector(`[data-rarole="${auId}"]`);
    const people = RestrictedAu.adminList(box ? box.value : "");
    if (!people.length || busy) return;
    busy = true;
    try {
      await Graph.ensureScopes([...RestrictedAu.SCOPES.roleWrite, ...Graph.SCOPES.directory]);
      const results = [];
      for (const p of people) {
        toast(msgEl(auId), `<span class="muted">Granting ${esc(p)}…</span>`);
        try { const r = await RestrictedAu.grantScoped(auId, sel.value, p); results.push({ p, ok: true, already: r.already }); }
        catch (e) { results.push({ p, ok: false, error: GroupUse.shortErr(e, 200) }); }
      }
      detail[auId].scoped = await RestrictedAu.scopedAdmins(auId);
      if (box) box.value = "";
      render();
      const bad = results.filter((r) => !r.ok);
      toast(msgEl(auId),
        `<span style="color:var(--on)">Granted ${results.filter((r) => r.ok && !r.already).length}.</span>`
        + (results.some((r) => r.already) ? ` <span class="muted">${results.filter((r) => r.already).length} already held it.</span>` : "")
        + (bad.length ? ` <span style="color:var(--off)">${esc(bad.map((b) => `${b.p}: ${b.error}`).join("; "))}</span>` : ""));
    } catch (e) {
      toast(msgEl(auId), `<span style="color:var(--off)">${esc(GroupUse.shortErr(e, 300))}</span>`);
    } finally { busy = false; }
  }

  async function revoke(auId, grantId) {
    if (busy) return;
    busy = true;
    try {
      await Graph.ensureScopes(RestrictedAu.SCOPES.roleWrite);
      await RestrictedAu.revokeScoped(auId, grantId);
      detail[auId].scoped = detail[auId].scoped.filter((s) => s.id !== grantId);
      render();
      const left = detail[auId].scoped.length;
      toast(msgEl(auId), left ? '<span style="color:var(--on)">Revoked.</span>'
        : '<span style="color:var(--off)">Revoked — and NOBODY is scoped to this unit now. Its members cannot be changed by anyone until someone is.</span>');
    } catch (e) {
      toast(msgEl(auId), `<span style="color:var(--off)">${esc(GroupUse.shortErr(e, 300))}</span>`);
    } finally { busy = false; }
  }

  // ------------------------------------------------- create / edit / del --
  function openEditor(au) {
    editing = au || null;
    $("raEditTitle").textContent = au ? "Edit administrative unit" : "New restricted administrative unit";
    $("raName").value = au ? (au.displayName || "") : "";
    $("raDesc").value = au ? (au.description || "") : "";
    $("raEditWarn").innerHTML = "";
    $("raEditFlag").innerHTML = au
      ? `<p class="mini muted" style="margin:0"><b>The restricted-management flag cannot be changed.</b>
         <code>isMemberManagementRestricted</code> is set when a unit is created and is immutable — this unit is
         <b>${RestrictedAu.isRestricted(au) ? "restricted" : "ordinary"}</b> and will stay that way. To change it,
         rename this one aside and create a replacement.</p>
         <p class="mini muted" style="margin:6px 0 0">Scoped administrators are not edited here — open the unit's
         <b>Members &amp; admins</b> panel for those.</p>`
      : `<label class="chk" style="display:inline-flex;gap:8px;align-items:center">
           <input type="checkbox" id="raNewRestricted" checked> Restricted management
         </label>
         <p class="mini muted" style="margin:6px 0 0">Set at creation and <b>never changeable afterwards</b>. Restricted means
           only a principal holding a role scoped to this unit may change its members — tenant-wide administrators,
           Global Administrator included, are reduced to read.</p>
         <label class="mini" style="display:block;margin:12px 0 4px">Scoped administrator <span class="muted">— granted Groups Administrator on the new unit</span></label>
         <input type="text" id="raNewAdmin" value="${esc(signedInUpn())}" placeholder="admin@contoso.com">
         <p class="mini muted" style="margin:6px 0 0"><b>Prefilled with you, because whoever creates the unit is its administrator by default.</b>
           A restricted unit blocks every tenant-wide role, so one created with nobody scoped to it is a vault nobody
           can open. Change it to grant someone else instead.</p>`;
    $("raEditModal").classList.add("open");
    setTimeout(() => $("raName").focus(), 30);
  }
  const closeEditor = () => { $("raEditModal").classList.remove("open"); editing = null; };

  async function save() {
    if (busy) return;
    const creating = !editing;
    const restricted = creating && $("raNewRestricted") && $("raNewRestricted").checked;
    const admin = creating && $("raNewAdmin") ? $("raNewAdmin").value.trim() : "";
    const built = RestrictedAu.buildPayload({
      name: $("raName").value, description: $("raDesc").value, creating, restricted, admin,
    });
    if (!built.ok) {
      $("raEditWarn").innerHTML = built.errors.map((x) => `<p class="mini" style="margin:0 0 4px;color:var(--off)">${esc(x)}</p>`).join("");
      return;
    }
    busy = true;
    const btn = $("raEditSave");
    const label = btn.textContent;
    btn.textContent = "Saving…"; btn.disabled = true;
    try {
      const want = creating && restricted && admin
        ? [...RestrictedAu.SCOPES.write, ...RestrictedAu.SCOPES.roleWrite, ...Graph.SCOPES.directory]
        : RestrictedAu.SCOPES.write;
      await Graph.ensureScopes([...new Set(want)]);
      let note = "";
      if (creating) {
        const made = await RestrictedAu.create(built.payload);
        // THE GRANT IS PART OF THE CREATE, not a follow-up somebody might
        // forget. A failure here leaves a real unit that nobody can open —
        // said out loud rather than swallowed, because the fix is one grant.
        if (restricted && admin && made && made.id) {
          try { await RestrictedAu.grantScoped(made.id, RestrictedAu.GROUPS_ADMIN, admin); }
          catch (e) { note = `The unit was created, but ${esc(admin)} could NOT be scoped to it: ${esc(GroupUse.shortErr(e, 200))}. Nobody can manage its members until someone is.`; }
        }
      } else {
        await RestrictedAu.rename(editing.id, built.payload);
      }
      closeEditor();
      await read();
      if (note) $("raBody").insertAdjacentHTML("afterbegin",
        `<div class="list-card" style="border-color:var(--off);margin-bottom:12px"><p class="mini" style="margin:0;color:var(--off)">⚠ ${note}</p></div>`);
    } catch (e) {
      $("raEditWarn").innerHTML = `<p class="mini" style="margin:0;color:var(--off)">${esc(GroupUse.shortErr(e, 400))}</p>`;
    } finally { btn.textContent = label; btn.disabled = false; busy = false; }
  }

  function openDelete(au) {
    deleting = au;
    $("raDelDesc").innerHTML = `<b>${esc(au.displayName || au.id)}</b><br><code>${esc(au.id)}</code>`;
    $("raDelConfirm").value = "";
    $("raDelGo").disabled = true;
    $("raDelModal").classList.add("open");
  }
  const closeDelete = () => { $("raDelModal").classList.remove("open"); deleting = null; };

  async function doDelete() {
    if (!deleting || busy) return;
    busy = true;
    try {
      await Graph.ensureScopes(RestrictedAu.SCOPES.write);
      await RestrictedAu.remove(deleting.id);
      closeDelete();
      await read();
    } catch (e) {
      $("raDelDesc").insertAdjacentHTML("beforeend",
        `<p class="mini" style="margin:8px 0 0;color:var(--off)">${esc(GroupUse.shortErr(e, 300))}</p>`);
    } finally { busy = false; }
  }

  // --------------------------------------------------------------- init ---
  function init() {
    const run = $("raRun");
    if (!run) return;
    run.addEventListener("click", read);
    $("raNew").addEventListener("click", () => openEditor(null));
    $("raMd").addEventListener("click", async () => {
      if (!aus) return;
      const btn = $("raMd"), label = btn.textContent;
      btn.disabled = true;
      try {
        // The export states what it found, so it READS what it has not yet:
        // a document listing "members: none" for units nobody opened would
        // be a report of the UI's laziness rather than of the tenant.
        for (let i = 0; i < aus.length; i++) {
          btn.textContent = `Reading ${i + 1}/${aus.length}…`;
          await loadDetail(aus[i].id);
        }
        download("tuno-restricted-aus.md", RestrictedAu.toMd(aus, detail, {
          tenant: (($("tenantName") || {}).textContent || "").trim(),
          build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
        }));
      } finally { btn.textContent = label; btn.disabled = false; }
    });

    $("raBody").addEventListener("click", (e) => {
      const f = e.target.closest("[data-raf]");
      if (f) { filter = f.dataset.raf; render(); return; }
      const t = e.target.closest("[data-raopen]");
      if (t) { toggle(t.dataset.raopen); return; }
      const ed = e.target.closest("[data-raedit]");
      if (ed) { openEditor(aus.find((a) => a.id === ed.dataset.raedit)); return; }
      const del = e.target.closest("[data-radel]");
      if (del) { openDelete(aus.find((a) => a.id === del.dataset.radel)); return; }
      const add = e.target.closest("[data-raadd]");
      if (add) { addMember(add.dataset.raadd); return; }
      const mrm = e.target.closest("[data-ramrm]");
      if (mrm) { const [a, o] = mrm.dataset.ramrm.split("|"); removeMember(a, o); return; }
      const gr = e.target.closest("[data-raadmin]");
      if (gr) { grant(gr.dataset.raadmin); return; }
      const srm = e.target.closest("[data-rasrm]");
      if (srm) { const [a, g] = srm.dataset.rasrm.split("|"); revoke(a, g); return; }
    });
    $("raBody").addEventListener("input", (e) => {
      if (e.target.id !== "raSearch") return;
      const v = e.target.value, pos = e.target.selectionStart;
      search = v;
      render();
      const back = $("raSearch");
      if (back) { back.value = v; back.focus(); try { back.setSelectionRange(pos, pos); } catch { /* not text */ } }
    });

    $("raEditSave").addEventListener("click", save);
    $("raEditCancel").addEventListener("click", closeEditor);
    $("raDelCancel").addEventListener("click", closeDelete);
    $("raDelGo").addEventListener("click", doDelete);
    // Typed, not clicked: deleting a unit does not delete its members, but it
    // does strip the shield from every one of them at once.
    $("raDelConfirm").addEventListener("input", (e) => {
      $("raDelGo").disabled = e.target.value.trim().toUpperCase() !== "DELETE";
    });
    [["raEditModal", closeEditor], ["raDelModal", closeDelete]].forEach(([id, close]) => {
      const m = $(id);
      if (m) m.addEventListener("click", (e) => { if (e.target.id === id) close(); });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if ($("raEditModal") && $("raEditModal").classList.contains("open")) closeEditor();
      if ($("raDelModal") && $("raDelModal").classList.contains("open")) closeDelete();
    });
  }

  return { init, read, render, openEditor, _state: () => ({ aus, detail, open, filter, search }) };
})();

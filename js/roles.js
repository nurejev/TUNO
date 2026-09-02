// ======================================================================
// T07 — Intune role assignments (BETA). Who can change Intune, in one page.
//
// After Ugur Koc's get-intune-role-assignments.ps1 (MIT). The shape of the
// question is his: every role definition, built-in and custom, each assignment
// under it, who is in it, and what it is scoped to — because the portal makes
// you click into one role at a time, which is why nobody audits this.
//
// ONE ROUND TRIP INSTEAD OF TWO PER MEMBER. The original resolves a member by
// PROBING: GET /users/{id}, and if that 404s, GET /groups/{id}. Two round trips
// per principal in the common case where the member is a group, on a surface
// where a hundred members across a dozen assignments is ordinary. Every member
// id in the whole report goes through directoryObjects/getByIds here — a
// thousand at a time, in one call, and the response says what TYPE each object
// is, so there is nothing to probe. That is Graph.resolveNames(), already in
// the read layer for exactly this.
//
// TWO THINGS THE ORIGINAL DOES NOT READ, both of which change the answer:
//
//   * SCOPE TAGS. An assignment can be limited to a set of scope tags, which
//     is how a tenant gives a regional helpdesk a role over only its own
//     devices. A report of "who holds Policy and Profile Manager" that omits
//     the tags overstates every scoped assignment.
//
//   * WHAT THE SCOPE ACTUALLY IS. scopeType says allDevices, allLicensedUsers
//     or resourceScope; resourceScopes names the groups. The original prints
//     resourceScopes and falls back to the literal string "All" when it is
//     empty — which is right often enough to be dangerous, because an empty
//     resourceScopes with scopeType resourceScope is Graph declining to say,
//     not a tenant-wide grant. It is reported as unstated here.
//
// AND THE THING NEITHER SAYS, which is the most important sentence on the
// screen: THIS IS INTUNE RBAC ONLY. The Entra directory roles — Global
// Administrator, Intune Administrator — grant full Intune access and do not
// appear in /deviceManagement/roleAssignments at all. An access review that
// reads this report as "everyone who can change Intune" is missing the people
// with the most access. Said on screen and in every export.
//
// The flags at the bottom are OBSERVATIONS, not a score. A concentration is
// worth looking at; whether it is wrong depends on a tenant this tool cannot
// see. Nothing here is graded.
//
// Reads only.
// ======================================================================
const Roles = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const S = () => Graph.SCOPES;
  // RBAC to read the roles; the directory to turn member GUIDs into names.
  // Both are asked for once, on the click, before anything is read.
  const SCOPES = () => [...new Set([...S().rbac, ...S().directory])];

  // Who is IN the group an assignment names — ENCA's CA-groups member read,
  // ported (its loadMembers, one group at a time): transitiveMembers so
  // nesting is flattened to the people who EFFECTIVELY hold the role, users
  // only — a device or service principal in the group does not hold Intune
  // RBAC and would only pad the count. Same 500 cap as ENCA and for the same
  // reason: a 10k group would stall the view, and the total is honest about
  // what the cap hid. Reads under the directory scopes this tool already
  // asks for — no new permission.
  const MEMBER_CAP = 500;
  async function groupMembers(id) {
    const ms = await Graph.readAll(`/groups/${encodeURIComponent(id)}/transitiveMembers/microsoft.graph.user`
      + `?$select=id,displayName,userPrincipalName,accountEnabled&$top=999`, { scopes: S().directory, retry: true });
    return {
      total: ms.length,
      capped: ms.length > MEMBER_CAP,
      members: ms.slice(0, MEMBER_CAP).map((m) => ({
        id: m.id, name: m.displayName || m.id, upn: m.userPrincipalName || "",
        disabled: m.accountEnabled === false,
      })),
    };
  }

  // What the role ALLOWS — the permission grid the portal shows one blade at
  // a time. The run's $select drops rolePermissions deliberately (they are
  // large and most readers never ask), so ONE definition is re-read here, on
  // the click, under the RBAC scope the run already asked. Actions arrive as
  // "Microsoft.Intune_ManagedDevices_Read": the middle segment is the
  // portal's category, the rest is the action, and the grouping below is
  // exactly that split. INTUNE RBAC IS AN ALLOW LIST — anything not named is
  // not granted — and the rare notAllowed entries are shown as denials
  // rather than silently subtracted.
  function parseActions(def) {
    const allowed = new Set(), denied = new Set();
    ((def && def.rolePermissions) || []).forEach((rp) => ((rp && rp.resourceActions) || []).forEach((ra) => {
      ((ra && ra.allowedResourceActions) || []).forEach((a) => allowed.add(String(a)));
      ((ra && ra.notAllowedResourceActions) || []).forEach((a) => denied.add(String(a)));
    }));
    const label = (s) => String(s || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    const cats = new Map();
    const add = (raw, ok) => {
      const parts = String(raw).split("_");
      const cat = parts.length > 1 ? label(parts[1]) : "Other";
      const act = parts.length > 2 ? label(parts.slice(2).join(" ")) : (parts[1] ? label(parts[1]) : raw);
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat).push({ action: act, raw, allowed: ok });
    };
    allowed.forEach((a) => add(a, true));
    denied.forEach((a) => add(a, false));
    const groups = [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, actions]) => ({ category, actions: actions.sort((x, y) => x.action.localeCompare(y.action)) }));
    return { groups, totalAllowed: allowed.size, totalDenied: denied.size };
  }
  async function roleSettings(id) {
    const def = await Graph.readOne(`/deviceManagement/roleDefinitions/${encodeURIComponent(id)}?$select=id,displayName,rolePermissions`,
      { scopes: S().rbac, beta: true });
    return parseActions(def);
  }

  const read = (path, scopes) => Graph.readAll(path, { scopes: scopes || S().rbac, beta: true, retry: true });
  const short = (e, max) => {
    const m = String((e && e.message) || e || "").split(" · ")[0];
    const cap = max || 180;
    return m.length > cap ? m.slice(0, cap - 3) + "…" : m;
  };

  // ---------------------------------------------------------- judgement --
  //
  // WHICH BUILT-IN ROLES COUNT AS HIGH-PRIVILEGE IS A JUDGEMENT, so it is
  // written down rather than hidden in a threshold. These four are on the list
  // because of what they can do to a tenant, not because of how they sound:
  //
  //   Intune Role Administrator   can change who holds every other role,
  //                               including this one
  //   Policy and Profile Manager  can change any configuration or compliance
  //                               policy, so can change what every device does
  //   Endpoint Security Manager   security baselines, compliance and the
  //                               security tasks that act on devices
  //   Help Desk Operator          remote actions, which include wipe and retire
  //
  // The count that makes a role "many members" is here for the same reason: it
  // is arbitrary, it is stated on screen, and it is a prompt to look rather
  // than a finding.
  const HIGH_PRIVILEGE = [
    "intune role administrator",
    "policy and profile manager",
    "endpoint security manager",
    "help desk operator",
  ];
  const MANY_MEMBERS = 10;

  const SCOPE_TYPE_LABEL = {
    resourcescope: "Specific groups",
    alldevices: "All devices",
    alllicensedusers: "All users",
    alldevicesandlicensedusers: "All devices and users",
  };

  // ---------------------------------------------------------------- run --
  async function run(opts) {
    const o = opts || {};
    const status = o.onStatus || (() => {});
    const out = {
      roles: [], assignments: [], failed: [], notes: [],
      scopeTags: [], scopeTagError: null,
      nameError: null, resolved: 0, unresolved: 0,
      showEmpty: !!o.showEmpty,
    };

    status("Reading role definitions…");
    let defs = [];
    try {
      // $select keeps this to what the report uses. rolePermissions are large
      // and nothing here prints them.
      defs = await read("/deviceManagement/roleDefinitions?$select=id,displayName,description,isBuiltIn");
    } catch (e) {
      // Without the definitions there is no report — every assignment would be
      // filed under an unknown role, which is what the original produced before
      // its 1.2 fix.
      throw e;
    }

    status(`Reading role assignments…`);
    let list = [];
    try { list = await read("/deviceManagement/roleAssignments"); }
    catch (e) { throw e; }

    // THE N+1, AND IT IS UNAVOIDABLE. The list endpoint does not link an
    // assignment to its role definition and does not carry members — the
    // original discovered this too and fetches each assignment individually.
    // Bounded concurrency rather than a loop with a sleep, and an assignment
    // that cannot be read is recorded rather than dropped.
    status(`Reading ${list.length} assignment${list.length === 1 ? "" : "s"} in detail…`);
    let done = 0;
    const detail = await Graph.pool(list, async (a) => {
      const id = encodeURIComponent(a.id);
      // The scope-tag expand is namespaced because roleScopeTags hangs off the
      // DERIVED type, not off roleAssignment. Some tenants answer 400 to the
      // combined expand; the role definition matters more, so the fallback
      // asks for that alone and the tags are named from the catalogue below.
      const full = `/deviceManagement/roleAssignments/${id}?$expand=roleDefinition,microsoft.graph.deviceAndAppManagementRoleAssignment/roleScopeTags`;
      const plain = `/deviceManagement/roleAssignments/${id}?$expand=roleDefinition`;
      let r = null, degraded = false;
      try { r = await Graph.readOne(full, { scopes: S().rbac, beta: true }); }
      catch (e) {
        r = await Graph.readOne(plain, { scopes: S().rbac, beta: true });
        degraded = true;
      }
      status(`Reading assignments — ${++done}/${list.length}`);
      return { r, degraded };
    }, 6);

    // The scope-tag catalogue, read once. It names roleScopeTagIds wherever
    // the expand did not answer, so a degraded assignment still shows its tags
    // rather than a row of GUIDs.
    status("Reading scope tags…");
    try { out.scopeTags = await read("/deviceManagement/roleScopeTags?$select=id,displayName,isBuiltIn"); }
    catch (e) { out.scopeTagError = short(e); }
    const tagName = (id) => {
      const t = out.scopeTags.find((x) => String(x.id) === String(id));
      return t ? (t.displayName || t.id) : String(id);
    };

    const need = new Set();
    const assignments = [];
    detail.forEach((res, i) => {
      const base = list[i];
      if (res.error) {
        out.failed.push({ id: base.id, name: base.displayName || base.id, error: short(res.error) });
        return;
      }
      const a = (res.value && res.value.r) || {};
      if (res.value && res.value.degraded) out.notes.push(`Scope tags for “${base.displayName || base.id}” came from the tag list rather than the assignment — the tenant refused the expand.`);
      const def = a.roleDefinition || null;
      const members = (a.members || []).map(String);
      const scopeGroups = (a.resourceScopes || []).map(String);
      const scopeMembers = (a.scopeMembers || []).map(String);
      members.forEach((m) => need.add(m));
      scopeGroups.forEach((m) => need.add(m));
      scopeMembers.forEach((m) => need.add(m));
      const tags = (a.roleScopeTags || []).map((t) => ({ id: t.id, name: t.displayName || t.id }));
      const tagIds = (a.roleScopeTagIds || []).map(String);
      assignments.push({
        id: a.id || base.id,
        name: a.displayName || base.displayName || a.id || base.id,
        description: a.description || base.description || "",
        roleId: def ? def.id : "",
        roleName: def ? (def.displayName || def.id) : "",
        roleUnknown: !def,
        members, scopeGroups, scopeMembers,
        scopeType: lc(a.scopeType || (scopeGroups.length ? "resourceScope" : "")),
        tags: tags.length ? tags : tagIds.map((id) => ({ id, name: tagName(id) })),
      });
    });

    // ONE CALL FOR EVERY PRINCIPAL IN THE REPORT. The original probes users
    // then groups, per member, which is up to two round trips each.
    if (need.size) {
      status(`Naming ${need.size} principal${need.size === 1 ? "" : "s"}…`);
      const look = await Graph.resolveNames([...need], { types: ["user", "group", "servicePrincipal"] });
      out.nameError = look.error || null;
      out.resolved = look.resolved || 0;
      const entry = (id) => {
        const e = look.entry(id);
        // An id that resolves to nothing is DELETED or invisible to this
        // account, and either way the GUID is more useful than a blank —
        // it is at least searchable in the portal.
        return e ? { id, name: e.name, type: e.type, upn: e.upn || e.mail || "" }
          : { id, name: id, type: "unresolved", upn: "" };
      };
      assignments.forEach((a) => {
        a.memberObjects = a.members.map(entry);
        a.scopeGroupObjects = a.scopeGroups.map(entry);
        a.scopeMemberObjects = a.scopeMembers.map(entry);
      });
      out.unresolved = assignments.reduce((n, a) => n + a.memberObjects.filter((m) => m.type === "unresolved").length, 0);
    } else {
      assignments.forEach((a) => { a.memberObjects = []; a.scopeGroupObjects = []; a.scopeMemberObjects = []; });
    }

    // Assignments under their definitions, definitions in one order whether or
    // not anything is assigned to them.
    const byId = new Map();
    defs.forEach((d) => byId.set(String(d.id), {
      id: d.id, name: d.displayName || d.id, description: d.description || "",
      builtIn: !!d.isBuiltIn, assignments: [],
    }));
    const orphans = [];
    assignments.forEach((a) => {
      const r = byId.get(String(a.roleId));
      if (r) r.assignments.push(a);
      else orphans.push(a);
    });
    out.roles = [...byId.values()].sort((a, b) =>
      (a.builtIn === b.builtIn ? 0 : a.builtIn ? -1 : 1) || String(a.name).localeCompare(String(b.name)));
    // An assignment whose role definition could not be resolved is kept and
    // shown under a role that says so. Dropping it would take a live grant off
    // an access review.
    if (orphans.length) {
      out.roles.push({ id: "", name: "Role could not be identified", description: "These assignments exist and grant access; Graph did not return a role definition for them.", builtIn: false, unknownRole: true, assignments: orphans });
    }
    out.assignments = assignments;
    out.observations = observations(out);
    return out;
  }

  // ------------------------------------------------------- observations --
  //
  // Facts worth a second look, in the tenant's own terms. NOT a score, and
  // deliberately not ranked: whether a concentration is wrong depends on
  // things this tool cannot see, and a number would invite somebody to chase
  // it rather than read it.
  function observations(out) {
    const obs = [];
    for (const role of out.roles) {
      const high = role.builtIn && HIGH_PRIVILEGE.includes(lc(role.name));
      const allMembers = new Set();
      for (const a of role.assignments) {
        (a.members || []).forEach((m) => allMembers.add(lc(m)));

        const st = a.scopeType;
        if (st === "alldevices" || st === "alldevicesandlicensedusers") {
          obs.push({ kind: "all-devices", role: role.name, assignment: a.name,
            text: `“${a.name}” is scoped to ${SCOPE_TYPE_LABEL[st]}. Everyone in it holds ${role.name} over the whole estate rather than over a subset.` });
        } else if (!a.scopeGroups.length && !a.tags.length) {
          // Graph declining to say is not the same as a tenant-wide grant, and
          // the original's fallback to the literal string "All" blurs the two.
          obs.push({ kind: "scope-unstated", role: role.name, assignment: a.name,
            text: `“${a.name}” came back with no scope groups and no scope tags. That is Graph not stating the scope rather than a confirmed tenant-wide grant — check it in the portal before treating it as either.` });
        }

        if (!a.members.length) {
          obs.push({ kind: "empty-assignment", role: role.name, assignment: a.name,
            text: `“${a.name}” has no members, so it grants nobody anything today. It is still a live assignment and adding one member to it grants ${role.name}.` });
        }
      }

      if (high && allMembers.size >= MANY_MEMBERS) {
        obs.push({ kind: "many-members", role: role.name,
          text: `${role.name} is a built-in role with broad reach and has ${allMembers.size} distinct members across ${role.assignments.length} assignment${role.assignments.length === 1 ? "" : "s"}. ${MANY_MEMBERS} is the number this tool starts mentioning it at; it is arbitrary and it is not a finding.` });
      }

      // Everyone who holds the role holds it through ONE group. Worth seeing:
      // whoever can change that group's membership can grant the role, and
      // that person may not hold the role themselves.
      const objs = role.assignments.flatMap((a) => a.memberObjects || []);
      const groups = objs.filter((m) => m.type === "group");
      if (objs.length && groups.length === objs.length && new Set(groups.map((g) => lc(g.id))).size === 1) {
        obs.push({ kind: "single-group", role: role.name,
          text: `Everyone who holds ${role.name} holds it through one group, “${groups[0].name}”. Whoever can change that group's membership can grant this role, and they do not need to hold it themselves.` });
      }
    }
    if (out.unresolved) {
      obs.push({ kind: "unresolved", text: `${out.unresolved} member${out.unresolved === 1 ? "" : "s"} could not be resolved to a name. Either the object was deleted and the assignment still names it, or this account cannot see it — the GUID is shown, because it is at least searchable in the portal.` });
    }
    if (out.nameError) {
      obs.push({ kind: "unresolved", text: `Names could not be resolved at all (${out.nameError}). Every member below is a GUID, and this report cannot tell you who any of them are.` });
    }
    return obs;
  }

  // -------------------------------------------------------------- totals --
  function totals(out) {
    const withA = out.roles.filter((r) => r.assignments.length);
    const members = new Set();
    out.assignments.forEach((a) => (a.members || []).forEach((m) => members.add(lc(m))));
    return {
      roles: out.roles.length,
      builtIn: out.roles.filter((r) => r.builtIn).length,
      custom: out.roles.filter((r) => !r.builtIn && !r.unknownRole).length,
      withAssignments: withA.length,
      empty: out.roles.length - withA.length,
      assignments: out.assignments.length,
      members: members.size,
      unresolved: out.unresolved,
      failed: out.failed.length,
      observations: (out.observations || []).length,
    };
  }

  // Roles for display: empty ones are a fact worth seeing rather than a row
  // worth hiding, which is why they are a toggle and not a filter.
  const shown = (out, showEmpty) => out.roles.filter((r) => showEmpty || r.assignments.length);

  const scopeLabel = (a) => {
    if (a.scopeType && SCOPE_TYPE_LABEL[a.scopeType] && a.scopeType !== "resourcescope") return SCOPE_TYPE_LABEL[a.scopeType];
    if (a.scopeGroupObjects && a.scopeGroupObjects.length) return a.scopeGroupObjects.map((g) => g.name).join(", ");
    return "not stated by Graph";
  };

  // ------------------------------------------------------------- exports --
  //
  // The sentence that has to be in every one of them: this is Intune RBAC and
  // nothing else. A reader who takes it for the whole answer is missing the
  // accounts with the most access.
  const ENTRA_CAVEAT = "THIS IS INTUNE RBAC ONLY. Entra directory roles — Global Administrator, Intune Administrator — grant full access to Intune and do not appear in deviceManagement/roleAssignments at all, so they are not in this report. An access review that treats this as the complete list of who can change Intune is missing the accounts with the most access.";

  function meta(out, opts) {
    const o = opts || {};
    return {
      showEmpty: !!o.showEmpty,
      tenant: o.tenant || null,
      when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
    };
  }

  function caveats(out) {
    const L = [ENTRA_CAVEAT];
    if (out.failed.length) L.push(`${out.failed.length} assignment${out.failed.length === 1 ? "" : "s"} could not be read. They exist and they grant access; this report cannot say to whom.`);
    if (out.nameError) L.push(`Member names could not be resolved (${out.nameError}) — every principal below is a GUID.`);
    else if (out.unresolved) L.push(`${out.unresolved} member${out.unresolved === 1 ? " id" : " ids"} resolved to nothing: deleted, or invisible to this account. The GUID is shown rather than a blank.`);
    if (out.scopeTagError) L.push(`The scope tag list could not be read (${out.scopeTagError}), so a tag shown only as a GUID is a name that could not be looked up rather than a tag without one.`);
    if (out.notes.length) L.push(...out.notes);
    return L;
  }

  function markdown(out, m) {
    const t = totals(out);
    const L = [];
    L.push(`# Intune role assignments`, "");
    L.push(`Generated ${m.when} by TUNO ${m.build}${m.tenant && m.tenant.domain ? ` · ${mdCell(m.tenant.domain)}` : ""}`, "");
    L.push(`| | |`, `|---|---|`);
    L.push(`| Roles | ${t.roles} (${t.builtIn} built-in, ${t.custom} custom) |`);
    L.push(`| Roles with assignments | ${t.withAssignments} |`);
    L.push(`| Roles with none | ${t.empty}${m.showEmpty ? " (shown below)" : " (hidden — switch them on to list them)"} |`);
    L.push(`| Assignments | ${t.assignments} |`);
    L.push(`| Distinct members | ${t.members} |`);
    L.push("");
    caveats(out).forEach((c) => L.push(`> ${mdCell(c)}`, ""));

    for (const r of shown(out, m.showEmpty)) {
      L.push(`## ${mdCell(r.name)} ${r.unknownRole ? "" : r.builtIn ? "(built-in)" : "(custom)"}`, "");
      if (r.description) L.push(mdCell(r.description), "");
      if (!r.assignments.length) { L.push("_No assignments._", ""); continue; }
      for (const a of r.assignments) {
        L.push(`### ${mdCell(a.name)}`, "");
        L.push(`- Scope: ${mdCell(scopeLabel(a))}`);
        L.push(`- Scope tags: ${a.tags.length ? a.tags.map((x) => mdCell(x.name)).join(", ") : "none"}`);
        if (a.description) L.push(`- ${mdCell(a.description)}`);
        L.push("");
        if (!a.memberObjects.length) { L.push(`_No members._`, ""); continue; }
        L.push(`| Member | Type | Sign-in / mail |`, `|---|---|---|`);
        a.memberObjects.forEach((mm) => L.push(`| ${mdCell(mm.name)} | ${mdCell(mm.type)} | ${mdCell(mm.upn)} |`));
        L.push("");
      }
    }

    if ((out.observations || []).length) {
      L.push(`## Worth a look`, "");
      L.push(`Observations, not findings. Whether any of these is wrong depends on things this report cannot see, so nothing here is scored.`, "");
      out.observations.forEach((o) => L.push(`- ${mdCell(o.text)}`));
      L.push("");
    }
    if (out.failed.length) {
      L.push(`## Could not be read`, "");
      out.failed.forEach((f) => L.push(`- **${mdCell(f.name)}** — ${mdCell(f.error)}`));
      L.push("");
    }
    L.push(`---`, ``, `After Ugur Koc's [Get Intune Role Assignments](https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/security/get-intune-role-assignments.ps1) (MIT). Member names are resolved through directoryObjects/getByIds in one batched call rather than probing users then groups per member. Reimplemented in browser-side JavaScript against Microsoft Graph.`);
    return L.join("\n");
  }

  // One row per MEMBER, because that is what an access review reads. An
  // assignment with nobody in it still gets a line — an empty grant is a fact,
  // and a row missing from a CSV is a fact nobody sees.
  function csv(out, m) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = [["Role", "RoleType", "Assignment", "AssignmentId", "Member", "MemberType", "MemberSignIn", "MemberId", "Scope", "ScopeType", "ScopeTags"].join(",")];
    for (const r of shown(out, m.showEmpty)) {
      const type = r.unknownRole ? "Unknown" : r.builtIn ? "Built-in" : "Custom";
      if (!r.assignments.length) { L.push([r.name, type, "No assignments", "", "", "", "", "", "", "", ""].map(q).join(",")); continue; }
      for (const a of r.assignments) {
        const tags = a.tags.map((x) => x.name).join("; ");
        if (!a.memberObjects.length) {
          L.push([r.name, type, a.name, a.id, "No members", "", "", "", scopeLabel(a), a.scopeType || "", tags].map(q).join(","));
          continue;
        }
        a.memberObjects.forEach((mm) =>
          L.push([r.name, type, a.name, a.id, mm.name, mm.type, mm.upn, mm.id, scopeLabel(a), a.scopeType || "", tags].map(q).join(",")));
      }
    }
    return L.join("\n");
  }

  const REPORT_CSS = `
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#f4f5fa;color:#1f2330}
header{padding:18px 26px;background:#1f2933;color:#fff}h1{margin:0;font-size:19px}
.meta{color:#c8d1d9;font-size:12px;margin-top:4px}
.cards{display:flex;gap:12px;padding:14px 26px;background:#fff;border-bottom:1px solid #e6e6ee;flex-wrap:wrap}
.card{background:#f7f8fc;border:1px solid #e6e6ee;border-radius:10px;padding:10px 16px;min-width:120px}
.card .n{font-size:22px;font-weight:700}.card .l{font-size:11px;color:#6b7280;text-transform:uppercase}
.card.zero .n{color:#9aa0ab}.card.warn .n{color:#b04a3a}
main{padding:18px 26px;max-width:1400px}
.note{background:#fff8e6;border:1px solid #f0dca8;border-radius:8px;padding:10px 14px;margin:0 0 10px;font-size:13px}
.note.bad{background:#fdeceb;border-color:#f2c4bf}
section.area{background:#fff;border:1px solid #e6e6ee;border-radius:10px;margin-bottom:16px;overflow:hidden}
section.area>h2{margin:0;padding:12px 18px;font-size:15px;background:#f1f2f8;border-bottom:1px solid #e6e6ee}
section.area>h2 span{font-weight:400;color:#6b7280;font-size:12px}
.asg{padding:12px 18px;border-bottom:1px solid #f4f4f8}
.asg:last-child{border-bottom:0}
.asg h3{margin:0 0 4px;font-size:13px}
.asg .sc{color:#6b7280;font-size:12px;margin-bottom:6px}
table{border-collapse:collapse;width:100%;font-size:13px}
thead th{background:#f7f8fc;padding:6px 10px;text-align:left;border-bottom:1px solid #e6e6ee;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
td{padding:6px 10px;border-bottom:1px solid #f4f4f8;vertical-align:top}
tr:last-child td{border-bottom:0}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600}
.pill.b{background:#e8eefc;color:#2b4c9b}.pill.c{background:#f0e6fb;color:#5b3a8e}
.pill.tag{background:#e6f4ea;color:#1e7e34}.pill.none{background:#f1f2f8;color:#6b7280}
ul.obs{margin:0;padding-left:20px;font-size:13px}ul.obs li{margin-bottom:6px}
footer{padding:14px 26px;color:#6b7280;font-size:12px}
footer a{color:#2b4c9b}`;

  function html(out, m) {
    const t = totals(out);
    const notes = caveats(out).map((c, i) => `<p class="note${i === 0 ? " bad" : ""}">${esc(c)}</p>`).join("");
    const roles = shown(out, m.showEmpty).map((r) => `
      <section class="area">
        <h2>${esc(r.name)} <span class="pill ${r.builtIn ? "b" : "c"}">${r.unknownRole ? "unknown" : r.builtIn ? "built-in" : "custom"}</span>
          <span>${r.assignments.length} assignment${r.assignments.length === 1 ? "" : "s"}</span></h2>
        ${r.assignments.length ? r.assignments.map((a) => `
          <div class="asg">
            <h3>${esc(a.name)}</h3>
            <div class="sc">Scope: ${esc(scopeLabel(a))} · Scope tags: ${a.tags.length ? a.tags.map((x) => `<span class="pill tag">${esc(x.name)}</span>`).join(" ") : '<span class="pill none">none</span>'}</div>
            ${a.memberObjects.length
    ? `<table><thead><tr><th>Member</th><th style="width:120px">Type</th><th style="width:280px">Sign-in / mail</th></tr></thead><tbody>${a.memberObjects.map((mm) => `<tr><td><b>${esc(mm.name)}</b></td><td>${esc(mm.type)}</td><td>${esc(mm.upn)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="sc">No members. The assignment is live; adding one member to it grants this role.</div>`}
          </div>`).join("") : `<div class="asg"><div class="sc">No assignments.</div></div>`}
      </section>`).join("");

    const obs = (out.observations || []).length ? `
      <section class="area"><h2>Worth a look <span>${out.observations.length}</span></h2>
        <div class="asg"><div class="sc">Observations, not findings. Whether any of these is wrong depends on things this report cannot see, so nothing here is scored.</div>
        <ul class="obs">${out.observations.map((o) => `<li>${esc(o.text)}</li>`).join("")}</ul></div></section>` : "";

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Intune role assignments</title><style>${REPORT_CSS}</style></head><body>
<header><h1>Intune role assignments</h1>
  <div class="meta">${m.tenant && m.tenant.domain ? esc(m.tenant.domain) + " · " : ""}generated ${esc(m.when)} by TUNO ${esc(m.build)}</div></header>
<div class="cards">
  <div class="card"><div class="n">${t.roles}</div><div class="l">Roles</div></div>
  <div class="card${t.withAssignments ? "" : " zero"}"><div class="n">${t.withAssignments}</div><div class="l">With assignments</div></div>
  <div class="card${t.empty ? "" : " zero"}"><div class="n">${t.empty}</div><div class="l">With none</div></div>
  <div class="card${t.assignments ? "" : " zero"}"><div class="n">${t.assignments}</div><div class="l">Assignments</div></div>
  <div class="card${t.members ? "" : " zero"}"><div class="n">${t.members}</div><div class="l">Distinct members</div></div>
  <div class="card${t.unresolved ? " warn" : " zero"}"><div class="n">${t.unresolved}</div><div class="l">Unresolved</div></div>
  <div class="card${t.observations ? " warn" : " zero"}"><div class="n">${t.observations}</div><div class="l">Worth a look</div></div>
</div>
<main>${notes}${obs}${roles || '<section class="area"><h2>Nothing found</h2><div class="asg"><div class="sc">No role definitions came back.</div></div></section>'}</main>
<footer>After Ugur Koc's <a href="https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/security/get-intune-role-assignments.ps1">Get Intune Role Assignments</a> (MIT). Member names are resolved through <code>directoryObjects/getByIds</code> in one batched call rather than probing users then groups per member. Reimplemented in browser-side JavaScript against Microsoft Graph — no code was copied.</footer>
</body></html>`;
  }

  return {
    SCOPES, HIGH_PRIVILEGE, MANY_MEMBERS, SCOPE_TYPE_LABEL, ENTRA_CAVEAT,
    MEMBER_CAP, groupMembers, roleSettings, parseActions,
    run, observations, totals, shown, scopeLabel, caveats,
    meta, markdown, csv, html,
  };
})();


// ======================================================================
// T07 — the screen. Kept apart from the engine above so the read and the
// observations can be tested without a DOM.
// ======================================================================
const RolesTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let out = null, running = false;
  // Group members read on demand, cached per group id so a second look is
  // instant. A run or reset invalidates it — the tenant may have moved.
  const groupCache = new Map();
  // Same deal for role permission sets, keyed on the role definition id.
  const permCache = new Map();
  // Open role folds, keyed on role ids — the T03 rule; survives re-renders
  // and the empty-roles toggle. Reset on a new read.
  const open = new Set();   // kept for export parity; the rail selects now
  // MASTER-DETAIL (10550, Mihai's spec — the roles on the left, what the
  // role has on the right; his words are the pick, no mockup round).
  let selRole = "overview";

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // Inverted at 10417 with the dimmed folds: empty roles are SHOWN by
  // default (one membership change from live is a fact worth seeing), and
  // the checkbox now HIDES them for tenants where fourteen idle built-ins
  // are noise. showEmpty() keeps its name and callers: it answers "should
  // empty roles be shown", which is now the checkbox NOT being ticked.
  const showEmpty = () => !($("rbEmpty") && $("rbEmpty").checked);
  const prog = (m) => TunoProgress.show("rbBody", "rbProg", m);   // ENCA-style centred card (10397)
  const showExports = (on) => ["rbMd", "rbCsv", "rbHtml"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; });

  function fail(e) {
    const err = (typeof e === "string") ? null : e;
    const msg = err ? String(err.message || err).slice(0, 400) : String(e);
    let extra = "";
    if (err && err.kind === "admin") {
      extra = `<p class="mini" style="margin:8px 0 0">This needs an administrator to consent once for the whole tenant. ${err.consentUrl ? `<a href="${esc(err.consentUrl)}" target="_blank" rel="noopener">Open the admin-consent page →</a>` : ""}</p>`;
    } else if (err && err.kind === "consent") {
      extra = `<p class="mini" style="margin:8px 0 0">Nothing was read. Run it again and accept the permission prompt${err.consentUrl ? `, or have an administrator <a href="${esc(err.consentUrl)}" target="_blank" rel="noopener">consent for the tenant</a>` : ""}.</p>`;
    }
    $("rbBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(msg)}</b></div>${extra}</div>`;
    showExports(false);
    prog("");
  }

  async function run() {
    if (running) return;
    running = true;
    $("rbRun").disabled = true;
    showExports(false);
    $("rbBody").innerHTML = "";
    try {
      prog("Checking permissions…");
      await Graph.ensureScopes(Roles.SCOPES());
      open.clear();
      groupCache.clear();
      permCache.clear();
      closeGroupModal();
      out = await Roles.run({ showEmpty: showEmpty(), onStatus: prog });
      selRole = "overview";
      prog("");
      render();
      showExports(true);
    } catch (e) { fail(e); }
    finally { running = false; $("rbRun").disabled = false; }
  }

  // Empty roles are a toggle rather than a re-read: the read already has them,
  // and asking the tenant again to change what is displayed would be rude.
  function tenantHint() {
    const n = $("tenantName"), u = $("tenantUser");
    return { domain: (n && n.textContent) || "", signedInAs: (u && u.textContent) || "" };
  }
  const meta = () => Roles.meta(out, { showEmpty: showEmpty(), tenant: tenantHint() });

  // The 10413 layout (build 10417, third of four). Stat cards over the old
  // strip; each ROLE is a folded card that unfolds in place to its
  // assignments and member tables. Empty roles are no longer hidden behind
  // the toggle: they fold in DIMMED, because a role with nobody in it is one
  // membership change from being live and hiding it was the old compromise.
  // The toggle survives as "hide empty roles" for tenants where fourteen
  // built-ins are noise — same element, same id, inverted reading.
  function render() {
    const t = Roles.totals(out);
    const card = (label, n, sub, cls) => `<div class="au-card"><div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></div>`;
    const cards = `<div class="au-cards">
      ${card("Roles", t.builtIn + t.custom, `${t.builtIn} built-in · ${t.custom} custom`)}
      ${card("Assignments", t.assignments, `${t.withAssignments} role${t.withAssignments === 1 ? "" : "s"} carry them`)}
      ${card("Members", t.members, t.unresolved ? `${t.unresolved} unresolved` : "all resolved to names")}
      ${card("Empty roles", t.empty, "one membership change from live", t.empty ? "" : "ok")}
      ${card("Worth a look", t.observations, "observations — deliberately no score", t.observations ? "bad" : "ok")}
      ${t.failed ? card("Could not be read", t.failed, "they grant access; to whom is unknown", "bad") : ""}
    </div>`;

    const notes = Roles.caveats(out).map((c, i) =>
      i === 0 ? `<div class="gu-fail"><b>Intune RBAC only.</b><span class="why">${esc(c.replace(/^THIS IS INTUNE RBAC ONLY\. /, ""))}</span></div>`
        : `<p class="mini muted">${esc(c)}</p>`).join("");

    const obs = (out.observations || []).length ? `<div class="list-card">
      <h4 style="margin:0 0 4px">Worth a look <span class="mini muted">${out.observations.length}</span></h4>
      <p class="mini muted" style="margin:0 0 10px"><b>Observations, not findings, and deliberately not scored.</b> Whether any of these is wrong depends on things this report cannot see — a number here would invite somebody to chase it rather than read it.</p>
      ${out.observations.map((o) => `<div class="gu-fail gu-skip">${esc(o.text)}</div>`).join("")}
    </div>` : "";

    const failed = out.failed.length ? `<div class="list-card">
      <h4 style="margin:0 0 4px">Could not be read</h4>
      <p class="mini muted" style="margin:0 0 10px"><b>These assignments exist and they grant access.</b> This report cannot say to whom.</p>
      ${out.failed.map((f) => `<div class="gu-fail"><b>${esc(f.name)}</b> — ${esc(f.error)}</div>`).join("")}
    </div>` : "";

    // ---- master-detail: the rail lists the roles, the pane is the role ----
    const shownRoles = Roles.shown(out, showEmpty());
    if (selRole !== "overview" && !shownRoles.some((r) => r.id === selRole)) selRole = "overview";
    const node = (id, label, right, cls, dim) => `<div class="ep-node${selRole === id ? " active" : ""}${dim ? " dim" : ""}" data-rbrole="${esc(id)}" role="button" tabindex="0"${dim ? ' style="opacity:.55"' : ""}>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span><span class="mini" style="margin-left:auto;white-space:nowrap">${right}</span></div>`;
    const rail = node("overview", "📋 Overview", `${t.observations || ""}`, "", false)
      + '<p class="mini muted" style="margin:2px 10px 6px">members per role · dim is empty</p><hr>'
      + shownRoles.map((r) => {
        const memberCount = r.assignments.reduce((n, a) => n + a.memberObjects.length, 0);
        const empty = !r.assignments.length;
        return node(r.id, `${r.builtIn ? "" : "✳ "}${esc(r.name)}`, empty ? "empty" : `${memberCount}`, "", empty);
      }).join("");

    let pane;
    if (selRole === "overview") {
      pane = `<div class="list-card" style="margin-top:0">${notes}
        <p class="mini muted" style="margin:0 0 10px">Pick a role on the left for its assignments and members — custom roles wear ✳, empty roles fold in dimmed rather than hiding, because one membership change from live is a fact worth seeing.</p>
        <p class="mini muted" style="margin:10px 0 0">After Ugur Koc's <a href="https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/security/get-intune-role-assignments.ps1" target="_blank" rel="noopener">Get Intune Role Assignments</a> (MIT). Member names are resolved through <code>directoryObjects/getByIds</code> in one batched call rather than probing <code>/users/{id}</code> then <code>/groups/{id}</code> per member, which is what the original does and costs up to two round trips each.</p></div>` + obs + failed;
    } else {
      const r = shownRoles.find((x) => x.id === selRole);
      const empty = !r.assignments.length;
      const memberCount = r.assignments.reduce((n, a) => n + a.memberObjects.length, 0);
      pane = `<div class="list-card" style="margin-top:0">
        <div class="au-ev-h" style="margin:0 0 6px">
          <b>${esc(r.name)}</b>
          <span class="au-op ${r.unknownRole ? "other" : r.builtIn ? "action" : "create"}">${r.unknownRole ? "unknown" : r.builtIn ? "built-in" : "custom"}</span>
          ${empty ? `<span class="gu-how exc">empty</span>` : ""}
          ${r.unknownRole ? "" : `<button class="btn sm" data-rbperm="${esc(r.id)}" data-rbpermname="${esc(r.name)}" title="What this role ALLOWS — the portal's permission grid on one page, read on the click. Intune RBAC is an allow list: anything not named is not granted.">⚙ permissions</button>`}
          <span class="au-when mini muted">${r.assignments.length} assignment${r.assignments.length === 1 ? "" : "s"}${memberCount ? ` · ${memberCount} member${memberCount === 1 ? "" : "s"}` : ""}</span>
        </div>
        ${r.description ? `<p class="mini muted" style="margin:0 0 10px">${esc(r.description)}</p>` : ""}
        <div class="au-detail" style="margin:0;border:0;padding:0">
        ${r.assignments.length ? r.assignments.map((a) => `
          <div style="margin:0 0 12px">
            <div class="mini"><b>${esc(a.name)}</b> — scope: ${esc(Roles.scopeLabel(a))} · tags: ${a.tags.length ? a.tags.map((x) => `<span class="gu-stat zero">${esc(x.name)}</span>`).join(" ") : "none"}</div>
            ${a.memberObjects.length
    ? `<div class="gu-tw"><table class="cg-table"><thead><tr><th>Member</th><th style="width:120px">Type</th><th style="width:280px">Sign-in / mail</th></tr></thead>
         <tbody>${a.memberObjects.map((mm) => `<tr><td><b>${esc(mm.name)}</b>${mm.type === "group" ? ` <button class="btn sm" data-rbgrp="${esc(mm.id)}" data-rbgrpname="${esc(mm.name)}" title="Who is in it — every user, nested groups flattened. Read on the click; the report stays as read.">👥 members</button>` : ""}</td><td class="mini">${esc(mm.type)}</td><td class="mini">${esc(mm.upn)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="mini muted" style="margin:4px 0 0">No members. The assignment is live — adding one member to it grants this role.</p>`}
          </div>`).join("") : `<p class="mini muted" style="margin:0">No assignments. Nobody holds this role today — and it is one membership change from being a live grant.</p>`}
        </div>
      </div>`;
    }

    $("rbBody").innerHTML = cards + `<div class="ep-wrap"><div class="ep-rail" style="max-height:70vh;overflow:auto">${rail}</div><div class="ep-main">${pane}</div></div>`;

    $("rbBody").querySelectorAll("[data-rbrole]").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.closest("a,code,button")) return;
      selRole = el.dataset.rbrole;
      render();
    }));
  }

  // ---- who is in that group: ENCA's per-group scan, behind ENCA's modal ----
  // The role report deliberately shows the assignment AS WRITTEN — a group
  // member is a group, because whoever can change ITS membership can grant
  // the role without holding it. The modal answers the next question, "and
  // who is that today", read live on the click rather than during the run:
  // most groups never get asked, and the ones that do deserve a live answer.
  function memberList(got) {
    const rows = got.members.map((m) => `<tr><td><b>${esc(m.name)}</b>${m.disabled ? ' <span class="tag block">disabled</span>' : ""}</td><td class="mini">${esc(m.upn)}</td></tr>`).join("");
    return `${got.total ? `<div class="gu-tw"><table class="cg-table"><thead><tr><th>User</th><th style="width:300px">Sign-in</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p class="mini muted" style="margin:0"><b>No users.</b> Transitive membership was read and no user is in it — the group may be empty, or hold only devices or service principals, which do not hold Intune RBAC and are not listed.</p>`}
      ${got.capped ? `<p class="mini muted" style="margin:8px 0 0">Showing the first ${Roles.MEMBER_CAP} of ${got.total} — the total is the honest number, the list is capped so the view survives it.</p>` : ""}
      <p class="mini muted" style="margin:8px 0 0">Every user who holds the role <b>through this group</b>, nested groups flattened. Whoever can change this group's membership can change this list — and they do not need to hold the role themselves.</p>`;
  }

  async function openGroupModal(id, name) {
    $("rbModalTitle").textContent = `👥 ${name}`;
    $("rbModalSub").innerHTML = `<code>${esc(id)}</code>`;
    $("rbModal").classList.add("open");
    const done = (got) => {
      $("rbModalSub").innerHTML = `${got.total} user${got.total === 1 ? "" : "s"}, nested groups flattened · <code>${esc(id)}</code>`;
      $("rbModalBody").innerHTML = memberList(got);
    };
    const cached = groupCache.get(id);
    if (cached) { done(cached); return; }
    $("rbModalBody").innerHTML = `<p class="mini muted" style="margin:0">Reading the transitive members…</p>`;
    try {
      const got = await Roles.groupMembers(id);
      groupCache.set(id, got);
      // The person may have closed the modal or opened another group while
      // the read ran — only paint if this group is still the one asked for.
      if ($("rbModal").classList.contains("open") && $("rbModalSub").innerHTML.includes(id)) done(got);
    } catch (e) {
      if ($("rbModal").classList.contains("open") && $("rbModalSub").innerHTML.includes(id))
        $("rbModalBody").innerHTML = `<div class="gu-fail"><b>The members could not be read.</b><span class="why">${esc(String((e && e.message) || e).slice(0, 300))}</span></div>`;
    }
  }

  const closeGroupModal = () => $("rbModal").classList.remove("open");

  // ---- what the role allows: the permission grid, one modal instead of a
  // portal blade per category. Same shape as the members peek: read on the
  // click, cached per role per run, the report untouched.
  function permList(got) {
    if (!got.groups.length) return `<p class="mini muted" style="margin:0"><b>No actions.</b> The definition carries no permissions — a member of this role can do nothing through it.</p>`;
    const chip = (a) => `<span class="gu-how ${a.allowed ? "inc" : "exc"}" title="${esc(a.raw)}">${esc(a.action)}${a.allowed ? "" : " — denied"}</span>`;
    return got.groups.map((g) => `<div class="gu-src">
        <h5>${esc(g.category)} <span class="mini muted">${g.actions.length}</span></h5>
        <p class="mini" style="margin:0;display:flex;flex-wrap:wrap;gap:6px">${g.actions.map(chip).join(" ")}</p>
      </div>`).join("")
      + `<p class="mini muted" style="margin:12px 0 0"><b>Intune RBAC is an allow list.</b> Anything not named here is not granted — there is no implicit read behind these actions. Hover an action for the raw name Graph uses.</p>`;
  }

  async function openPermModal(id, name) {
    $("rbModalTitle").textContent = `⚙ ${name}`;
    $("rbModalSub").innerHTML = `<code>${esc(id)}</code>`;
    $("rbModal").classList.add("open");
    const done = (got) => {
      $("rbModalSub").innerHTML = `${got.totalAllowed} allowed action${got.totalAllowed === 1 ? "" : "s"}${got.totalDenied ? ` · ${got.totalDenied} denied` : ""} · <code>${esc(id)}</code>`;
      $("rbModalBody").innerHTML = permList(got);
    };
    const cached = permCache.get(id);
    if (cached) { done(cached); return; }
    $("rbModalBody").innerHTML = `<p class="mini muted" style="margin:0">Reading the role definition…</p>`;
    try {
      const got = await Roles.roleSettings(id);
      permCache.set(id, got);
      if ($("rbModal").classList.contains("open") && $("rbModalSub").innerHTML.includes(id)) done(got);
    } catch (e) {
      if ($("rbModal").classList.contains("open") && $("rbModalSub").innerHTML.includes(id))
        $("rbModalBody").innerHTML = `<div class="gu-fail"><b>The permissions could not be read.</b><span class="why">${esc(String((e && e.message) || e).slice(0, 300))}</span></div>`;
    }
  }

  function exportAs(fmt) {
    if (fmt === "md") return download("Intune-role-assignments.md", Roles.markdown(out, meta()), "text/markdown");
    if (fmt === "csv") return download("Intune-role-assignments.csv", Roles.csv(out, meta()), "text/csv");
    return download("Intune-role-assignments.html", Roles.html(out, meta()), "text/html");
  }

  function reset() {
    out = null;
    groupCache.clear();
    permCache.clear();
    closeGroupModal();
    $("rbBody").innerHTML = "";
    prog("");
    showExports(false);
    if ($("rbEmpty")) $("rbEmpty").checked = false;
  }

  function init() {
    if (!$("rbRun")) return;
    $("rbRun").addEventListener("click", run);
    $("rbReset").addEventListener("click", reset);
    // Toggling empty roles re-renders what has already been read. Asking the
    // tenant again to change what is on screen would be rude.
    $("rbEmpty").addEventListener("change", () => { if (out) render(); });
    $("rbMd").addEventListener("click", () => exportAs("md"));
    $("rbCsv").addEventListener("click", () => exportAs("csv"));
    $("rbHtml").addEventListener("click", () => exportAs("html"));
    // Delegated: the member tables are rebuilt on every render, the handler
    // is not — the guModal wiring, same shape.
    $("rbBody").addEventListener("click", (e) => {
      const b = e.target.closest("[data-rbgrp]");
      if (b) { openGroupModal(b.dataset.rbgrp, b.dataset.rbgrpname || b.dataset.rbgrp); return; }
      const p = e.target.closest("[data-rbperm]");
      if (p) openPermModal(p.dataset.rbperm, p.dataset.rbpermname || p.dataset.rbperm);
    });
    $("rbModalClose").addEventListener("click", closeGroupModal);
    $("rbModal").addEventListener("click", (e) => { if (e.target.id === "rbModal") closeGroupModal(); });
  }

  return { init, run, reset, render, exportAs, showEmpty, openGroupModal, openPermModal };
})();

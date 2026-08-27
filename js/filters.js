// ======================================================================
// T14 — Assignment filters (R21). After Alper Atar's IntuneShade (MIT).
//
// Assignment filters are load-bearing and invisible: T06 can only say "may
// reach it" because a filter is in the way, T11 re-serialises them so an
// edit does not drop one — but nothing in TUNO showed the filters
// themselves. The portal shows a filter's rule; it does not show WHAT
// BREAKS IF YOU CHANGE IT.
//
// TWO HALVES, TWO POSTURES.
//   READ: every filter with its platform and rule, and — as a separate,
//   optional read — per-filter USAGE: which assignments on which policies
//   reference it. The usage read is T02's own analyze() over its own
//   SOURCES table (the T06 rule: the day this tool grows a second endpoint
//   list is the day it starts reporting "unused" about a surface it never
//   read). Until it runs, the usage column is ABSENT, NOT EMPTY.
//
//   WRITE: create, edit, delete — the third thing in TUNO that writes, and
//   it gets T11's rules unchanged: the write scope asked at the click and
//   never before; every edit preceded by a FRESH READ with a drift stop (a
//   filter modified since it was loaded is refused, never overwritten);
//   every write followed by a read-back, so "done" is the tenant's word;
//   delete confirmed by TYPING the filter's name.
//
// AND THE RULE THIS TOOL EXISTS FOR: DELETE IS REFUSED WHILE USAGE IS
// NON-ZERO. Deleting a filter still referenced by an assignment silently
// widens that assignment to the whole target group — the worst kind of
// change, one that makes policy reach MORE devices by removing something.
// The gate is not the session's cached scan: immediately before a delete
// the filter's own payload associations are re-read from the tenant
// ($expand=payloads), and if that read fails the delete is refused too —
// "could not verify zero usage" is not zero usage.
// ======================================================================
const Filters = (() => {
  "use strict";

  const S = () => Graph.SCOPES;
  const FILTER_SELECT = "id,displayName,description,platform,rule,assignmentFilterManagementType,lastModifiedDateTime";

  // PAYLOADS COME WITH THE FILTER (10491). Graph's own word for this
  // navigation property is "associated assignments for a specific filter" —
  // the used-by answer was one $expand away the whole time, and the column
  // sat empty behind an opt-in nine-surface sweep. It carries payloadId,
  // payloadType, groupId and assignmentFilterType per reference: everything
  // except the policy's NAME, which is the one thing the sweep still adds.
  // So the COUNT is now free and always present, and the scan's job shrinks
  // to turning ids into names.
  async function list() {
    return Graph.readAll(`${Graph.BETA}/deviceManagement/assignmentFilters?$select=${FILTER_SELECT}&$expand=payloads`, {
      scopes: S().config, retry: true,
    });
  }

  // The payloadType enum, in the words the portal uses. An unrecognised
  // value is passed through rather than guessed at — a new Intune surface
  // should read as itself, not as "other".
  const PAYLOAD_LABEL = {
    deviceconfigurationandcompliance: "Configuration / compliance",
    application: "Application",
    enrollmentconfiguration: "Enrolment configuration",
    windows10xapp: "Windows app",
    deviceconfiguration: "Device configuration",
    devicemanagmentconfigurationandcompliance: "Configuration / compliance",
    devicemanagementconfigurationandcompliance: "Configuration / compliance",
  };
  const payloadLabel = (t) => PAYLOAD_LABEL[String(t || "").toLowerCase()] || String(t || "unknown type");

  // Every reference a filter carries, off the payloads it arrived with.
  function refsOf(f) {
    return ((f && f.payloads) || []).map((p) => ({
      payloadId: String(p.payloadId || "").toLowerCase(),
      type: payloadLabel(p.payloadType),
      groupId: String(p.groupId || "").toLowerCase(),
      mode: String(p.assignmentFilterType || "").toLowerCase() === "exclude" ? "exclude" : "include",
    }));
  }

  // Usage over T02's sources: one sweep-shaped read (match-all ids,
  // tenant-wide included because tenant-wide assignments carry filters too),
  // rows grouped by the filter they reference.
  async function usage(onStatus) {
    const res = await GroupUse.analyze({
      ids: null, via: new Map(), groupId: null,
      sourceIds: GroupUse.allSourceIds(), tenantWide: true, onStatus,
    });
    const by = new Map();
    const names = new Map();      // payloadId -> policy name, for the payload rows
    for (const r of res.rows) {
      if (r.id) names.set(String(r.id).toLowerCase(), r.name);
      if (!r.filterId) continue;
      let e = by.get(r.filterId);
      if (!e) by.set(r.filterId, e = []);
      e.push({ policy: r.name, source: r.sourceLabel, how: r.how, mode: r.filterMode || "" });
    }
    return { by, names, failed: res.failed, ran: res.ran };
  }

  // The fresh association check that gates a delete. Distinct from usage():
  // this is ONE read, of THIS filter, NOW — because the decision is being
  // taken now, not when the scan ran.
  async function associations(id) {
    const r = await Graph.readOne(`${Graph.BETA}/deviceManagement/assignmentFilters/${id}?$expand=payloads`, {
      scopes: S().config,
    });
    return (r && r.payloads) || [];
  }

  // null for a filter the tenant does not have — "gone" is an answer here
  // (the drift stop and the delete read-back both need it), not an error.
  async function readOne(id) {
    try {
      return await Graph.readOne(`${Graph.BETA}/deviceManagement/assignmentFilters/${id}?$select=${FILTER_SELECT}`, {
        scopes: S().config,
      });
    } catch (e) { if (e && e.kind === "notfound") return null; throw e; }
  }

  // ---- writes — T11's pipeline, sized for one object ----
  async function create(body) {
    const created = await Graph.post(`${Graph.BETA}/deviceManagement/assignmentFilters`, body, { scopes: S().profiles });
    // read-back: "created" is the tenant's word
    const back = await readOne(created && created.id);
    if (!back) throw new Error("The create returned, but the filter could not be read back — check the portal before assuming either outcome.");
    return back;
  }

  async function update(id, loadedStamp, patchBody) {
    // fresh read first — the drift stop
    const now = await readOne(id);
    if (!now) throw new Error("The filter no longer exists — nothing was written.");
    if (loadedStamp && now.lastModifiedDateTime && now.lastModifiedDateTime !== loadedStamp) {
      const e = new Error("DRIFTED — this filter changed after it was loaded here. Nothing was written: re-open it and decide against the current rule, not the remembered one.");
      e.drifted = true;
      throw e;
    }
    await Graph.patch(`${Graph.BETA}/deviceManagement/assignmentFilters/${id}`, patchBody, { scopes: S().profiles });
    const back = await readOne(id);
    if (!back) throw new Error("The update returned, but the filter could not be read back — check the portal.");
    for (const k of Object.keys(patchBody)) {
      if (String(back[k] ?? "") !== String(patchBody[k] ?? "")) {
        throw new Error(`Verify failed: the tenant's ${k} does not match what was sent. The write may have partially applied — check the portal.`);
      }
    }
    return back;
  }

  async function remove(id) {
    // THE GATE — fresh, per-filter, from the tenant, at the moment of the act.
    let assoc;
    try { assoc = await associations(id); }
    catch (e) {
      throw new Error(`REFUSED — usage could not be verified (${(e && e.message) || e}). "Could not check" is not "zero": a filter deleted while assignments reference it silently widens every one of them.`);
    }
    if (assoc.length) {
      const err = new Error(`REFUSED — ${assoc.length} assignment${assoc.length === 1 ? "" : "s"} still reference this filter. Deleting it would silently widen ${assoc.length === 1 ? "that assignment" : "each of them"} to the whole target group. Remove the references first.`);
      err.inUse = assoc;
      throw err;
    }
    await Graph.del(`${Graph.BETA}/deviceManagement/assignmentFilters/${id}`, { scopes: S().profiles });
    // read-back: deleted means the tenant no longer has it
    if (await readOne(id)) throw new Error("The delete returned, but the filter is still readable — check the portal.");
    return true;
  }

  const PLATFORMS = [
    ["windows10AndLater", "Windows"],
    ["macOS", "macOS"],
    ["iOS", "iOS/iPadOS"],
    ["androidForWork", "Android Enterprise"],
    ["android", "Android device administrator"],
    ["androidAOSP", "Android (AOSP)"],
    ["androidMobileApplicationManagement", "Android MAM"],
    ["iOSMobileApplicationManagement", "iOS MAM"],
    ["windowsMobileApplicationManagement", "Windows MAM"],
  ];
  const platformLabel = (p) => (PLATFORMS.find((x) => x[0] === p) || [null, p])[1];

  // ---- exports ----
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  function markdown(filters, use) {
    const L = [];
    L.push("# Intune assignment filters", "");
    L.push(`Generated ${new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC")} by TUNO ${typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""}`, "");
    // Used by is always a column now (10491) — it comes off the filter's own
    // payloads, not the scan.
    L.push(`| Filter | Platform | Type | Used by | Rule |`);
    L.push(`|---|---|---|---|---|`);
    for (const f of filters) {
      const rule = String(f.rule || "");
      L.push(`| ${mdCell(f.displayName)} | ${mdCell(platformLabel(f.platform))} | ${mdCell(f.assignmentFilterManagementType || "devices")} | ${refsOf(f).length} | \`${mdCell(rule.slice(0, 160))}${rule.length > 160 ? "…" : ""}\` |`);
    }
    L.push("");
    if (use) {
      if (use.failed.length) L.push(`> **${use.failed.length} surfaces could not be read** (${use.failed.map((f) => f.label).join(", ")}) — the counts above are unaffected; the policy names below are what is missing.`, "");
      for (const f of filters) {
        const u = use.by.get(f.id);
        if (!u || !u.length) continue;
        L.push(`## ${mdCell(f.displayName)} — ${u.length} reference${u.length === 1 ? "" : "s"}`, "");
        L.push(`| Policy | Surface | Assignment | Mode |`, `|---|---|---|---|`);
        u.forEach((x) => L.push(`| ${mdCell(x.policy)} | ${mdCell(x.source)} | ${mdCell(x.how)} | ${mdCell(x.mode || "include")} |`));
        L.push("");
      }
    } else {
      L.push(`> Usage was not scanned, so the POLICY NAMES behind each reference are absent. The reference counts in the table above came from the filters themselves and are complete.`, "");
    }
    return L.join("\n");
  }

  return { list, usage, associations, readOne, create, update, remove, PLATFORMS, platformLabel, payloadLabel, refsOf, markdown };
})();


// ======================================================================
// T14 — the screen.
// ======================================================================
const FiltersTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let filters = null, use = null, running = false;
  let editing = null;   // { id, stamp } while the form edits an existing filter
  // Build 10394: the references chip FILTERS (only filters something uses),
  // and a row's used-by count EXPANDS into the references themselves. Both
  // exist only after a scan — before it, usage is absent, and a filter on
  // an absent column would be a filter on nothing.
  let usedOnly = false;
  const openUse = new Set();
  const groupNames = new Map();   // groupId -> display name, for the payload rows

  // n and of are passed through (10491) — GroupUse's onStatus supplies them
  // and this dropped both on the floor, so the scan's bar was indeterminate
  // while the sweep knew exactly where it was.
  function prog(msg, n, of) { TunoProgress.show("afBody", "afProg", msg, n, of); }   // ENCA-style centred card (10397)
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function read() {
    if (running) return;
    running = true; $("afRead").disabled = true;
    try {
      await Graph.ensureScopes(Graph.SCOPES.config);
      prog("Reading assignment filters…");
      filters = (await Filters.list()).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
      // The payloads name the GROUP each reference targets by id. A row of
      // GUIDs is not an answer, so they are resolved once for the whole
      // list — and a failure leaves the ids visible rather than the row
      // blank, because "which group" unanswered is better than absent.
      groupNames.clear();
      const gids = [...new Set(filters.flatMap((f) => Filters.refsOf(f).map((r) => r.groupId).filter(Boolean)))];
      if (gids.length) {
        prog(`Naming ${gids.length} targeted group${gids.length === 1 ? "" : "s"}…`);
        try {
          await Graph.ensureScopes(Graph.SCOPES.directory);
          const look = await Graph.resolveNames(gids, { types: ["group"] });
          gids.forEach((g) => groupNames.set(g, look(g)));
        } catch (e) { /* ids stay visible — unknown, not absent */ }
      }
      prog("");
      render();
      $("afMd").style.display = "";
      $("afScan").style.display = "";
      $("afNew").style.display = "";
    } catch (e) { failCard(e); }
    finally { running = false; $("afRead").disabled = false; }
  }

  async function scanUsage() {
    if (running || !filters) return;
    running = true; $("afScan").disabled = true;
    try {
      await Graph.ensureScopes([...new Set([...GroupUse.scopesFor(GroupUse.allSourceIds()), ...Graph.SCOPES.groups])]);
      use = await Filters.usage(prog);
      prog("");
      render();
    } catch (e) { failCard(e); }
    finally { running = false; $("afScan").disabled = false; }
  }

  function failCard(e) {
    $("afBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
    prog("");
  }

  function render() {
    const stat = (n, label) => `<span class="gu-stat ${n ? "" : "zero"}"><b>${n}</b> ${esc(label)}</span>`;
    const scanned = !!use;
    // THE COUNT IS NO LONGER BEHIND THE SCAN (10491). Every filter arrived
    // with its payloads — Graph's own "associated assignments" — so used-by
    // is answered on the first read. What the scan still buys is the policy
    // NAMES behind those payload ids, and the cross-check that the two
    // agree.
    const refs = (f) => Filters.refsOf(f);
    const shown = filters.filter((f) => !usedOnly || refs(f).length);
    const rows = shown.map((f) => {
      const u = refs(f);
      const open = openUse.has(f.id) && u.length;
      return `<tr>
        <td><b>${esc(f.displayName)}</b>${f.description ? `<div class="mini muted">${esc(f.description)}</div>` : ""}</td>
        <td class="mini">${esc(Filters.platformLabel(f.platform))}</td>
        <td class="mini">${esc(f.assignmentFilterManagementType || "devices")}</td>
        ${u.length
          ? `<td class="gu-num"><a href="#" data-afuse="${esc(f.id)}" title="Show the ${u.length} assignment${u.length === 1 ? "" : "s"} referencing this filter"><b>${u.length}</b> ${open ? "▾" : "▸"}</a></td>`
          : `<td class="gu-num gu-zero" title="Graph returned no associated assignments for this filter">0</td>`}
        <td class="mini"><code style="overflow-wrap:anywhere">${esc(String(f.rule || "").slice(0, 160))}${String(f.rule || "").length > 160 ? "…" : ""}</code></td>
        <td class="af-acts">
          <button class="btn sm" data-afedit="${esc(f.id)}">✏️ Edit</button>
          <button class="btn sm" data-afdel="${esc(f.id)}" title="Refused while any assignment references this filter">🗑 Delete</button>
        </td></tr>${open ? `<tr class="af-userow"><td colspan="6">
          ${u.map((x) => {
            // The policy NAME if the scan has run, the id if not — and the
            // GROUP the assignment targets, named where the directory read
            // answered. A row of GUIDs was the old shape of this answer.
            const nm = (scanned && use.names && use.names.get(x.payloadId)) || "";
            const grp = x.groupId ? (groupNames.get(x.groupId) || `group ${x.groupId.slice(0, 8)}…`) : "tenant-wide";
            return `<span class="gu-stat"><b>${esc(nm || `policy ${String(x.payloadId).slice(0, 8)}…`)}</b> · ${esc(x.type)} · ${esc(grp)} · ${esc(x.mode)}</span>`;
          }).join(" ")}
          ${scanned ? "" : `<div class="mini muted" style="margin-top:6px">Policy names need the usage scan — the references themselves came with the filters.</div>`}
        </td></tr>` : ""}`;
    }).join("");

    const usageNote = scanned
      ? (use.failed.length ? `<div class="gu-fail"><b>${use.failed.length} surfaces could not be read</b> (${use.failed.map((f) => esc(f.label)).join(", ")})<span class="why">The used-by counts came from the filters themselves and are unaffected; the POLICY NAMES on the unread surfaces are what is missing.</span></div>` : "")
      : `<p class="mini muted"><b>Used-by is Graph's own answer</b> — every filter arrives with its associated assignments, so the column is filled by the first read. <b>Scan usage</b> adds the policy names behind those references, which the filter object does not carry.</p>`;

    const refCount = filters.reduce((n, f) => n + Filters.refsOf(f).length, 0);
    $("afBody").innerHTML = `<div class="gu-sticky">
      <span class="gu-who">Assignment filters${usedOnly ? ` <span class="mini muted">— only filters something uses</span>` : ""}</span>
      <div class="gu-sum">${stat(filters.length, "filters")}${scanned
        ? `<a href="#" data-afrefs class="gu-stat ${usedOnly ? "af-on" : ""} ${refCount ? "" : "zero"}" title="${usedOnly ? "Show every filter again" : "Show only the filters something references"}"><b>${refCount}</b> references</a>`
        : `<a href="#" data-afrefs class="gu-stat ${usedOnly ? "af-on" : ""} ${refCount ? "" : "zero"}" title="${usedOnly ? "Show every filter again" : "Show only the filters something references"}"><b>${refCount}</b> references</a>`}</div>
    </div>
    <div class="list-card">
      ${usageNote}
      <div class="gu-tw"><table class="cg-table af-table"><thead><tr>
        <th style="width:24%">Filter</th><th style="width:130px">Platform</th><th style="width:70px">Type</th><th class="gu-num" style="width:66px">Used by</th><th>Rule</th><th style="width:132px"></th>
      </tr></thead><tbody>${rows || `<tr><td colspan="6" class="mini">No assignment filters exist in this tenant.</td></tr>`}</tbody></table></div>
    </div>
    <div id="afFormWrap"></div>`;
  }

  // ---- the form (create + edit share it; editing carries the drift stamp) ----
  function openForm(f) {
    editing = f ? { id: f.id, stamp: f.lastModifiedDateTime } : null;
    const wrap = $("afFormWrap");
    wrap.innerHTML = `<div class="list-card wi-form">
      <h4 style="margin:0 0 8px">${f ? `✏️ Edit “${esc(f.displayName)}”` : "＋ New assignment filter"} <span class="tag block">writes to the tenant</span></h4>
      ${f ? `<p class="mini muted" style="margin:0 0 10px">Loaded as of ${esc(f.lastModifiedDateTime || "unknown")}. If anybody changes it before you apply, the write is <b>refused as drifted</b> — decide against the current rule, not a remembered one.</p>` : ""}
      <div class="wi-grid">
        <label class="wi-f"><span>Name <b class="req">*</b></span><input id="afFName" value="${esc(f ? f.displayName : "")}"></label>
        <label class="wi-f"><span>Platform ${f ? '<span class="mini muted">fixed after creation</span>' : ""}</span>
          <select id="afFPlatform" ${f ? "disabled" : ""}>${Filters.PLATFORMS.map(([v, l]) => `<option value="${v}" ${f && f.platform === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      </div>
      <label class="wi-f" style="margin-top:10px"><span>Description</span><input id="afFDesc" value="${esc(f ? f.description || "" : "")}"></label>
      <label class="wi-f" style="margin-top:10px"><span>Rule <b class="req">*</b> <span class="mini muted">Intune filter syntax — validated by the tenant on apply, refusals shown in its own words</span></span>
        <textarea id="afFRule" rows="3" spellcheck="false" style="font-family:monospace">${esc(f ? f.rule || "" : "")}</textarea></label>
      <div class="tb-actions" style="margin-top:12px">
        <button class="btn primary" id="afFApply">${f ? "Apply the edit" : "Create the filter"}</button>
        <button class="btn" id="afFCancel">Cancel</button>
      </div>
      <div id="afFMsg" class="mini" style="margin-top:10px"></div>
    </div>`;
    wrap.scrollIntoView({ block: "nearest" });
    $("afFCancel").addEventListener("click", () => { editing = null; wrap.innerHTML = ""; });
    $("afFApply").addEventListener("click", applyForm);
  }

  async function applyForm() {
    const msg = $("afFMsg");
    const name = $("afFName").value.trim(), rule = $("afFRule").value.trim();
    if (!name || !rule) { msg.innerHTML = `<b>Name and rule are required.</b>`; return; }
    $("afFApply").disabled = true;
    try {
      await Graph.ensureScopes(Graph.SCOPES.profiles);   // the write scope, at the click
      if (editing) {
        msg.textContent = "Fresh read, then writing…";
        const back = await Filters.update(editing.id, editing.stamp, { displayName: name, description: $("afFDesc").value.trim(), rule });
        msg.innerHTML = `<b>Verified by read-back:</b> the tenant now carries this rule (modified ${esc(back.lastModifiedDateTime || "")}).`;
      } else {
        msg.textContent = "Creating…";
        await Filters.create({ displayName: name, description: $("afFDesc").value.trim(), platform: $("afFPlatform").value, rule });
        msg.innerHTML = `<b>Created and read back.</b> New filters reference nothing yet — assignments opt in to a filter, never the other way round.`;
      }
      editing = null;
      await refreshList();
    } catch (e) {
      msg.innerHTML = `<div class="gu-fail"><b>${esc((e && e.message) || e)}</b>${e && e.drifted ? `<span class="why">Nothing was written.</span>` : ""}</div>`;
    } finally { $("afFApply").disabled = false; }
  }

  async function refreshList() {
    filters = (await Filters.list()).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
    use = null;   // the scan's POLICY NAMES described the tenant before the write — absent again, not stale
    openUse.clear();
    // usedOnly survives (10491): it filters on the payload counts, which are
    // re-read with the filters and are therefore never stale. Only the names
    // went away.
    render();
  }

  // ---- delete: typed name, then the fresh association gate in Filters.remove ----
  function confirmDelete(f) {
    const wrap = $("afFormWrap");
    wrap.innerHTML = `<div class="list-card wi-form">
      <h4 style="margin:0 0 8px">🗑 Delete “${esc(f.displayName)}” <span class="tag block">writes to the tenant</span></h4>
      <p class="mini muted" style="margin:0 0 10px">Immediately before deleting, this filter's payload associations are <b>re-read from the tenant</b>. Any reference refuses the delete — a filter deleted while assignments use it silently widens each of them to the whole target group. “Could not check” also refuses.</p>
      <label class="wi-f"><span>Type the filter's name to confirm</span><input id="afDelName" autocomplete="off" spellcheck="false"></label>
      <div class="tb-actions" style="margin-top:12px">
        <button class="btn primary" id="afDelGo" disabled>Delete it</button>
        <button class="btn" id="afDelCancel">Cancel</button>
      </div>
      <div id="afDelMsg" class="mini" style="margin-top:10px"></div>
    </div>`;
    wrap.scrollIntoView({ block: "nearest" });
    $("afDelName").addEventListener("input", () => { $("afDelGo").disabled = $("afDelName").value.trim() !== f.displayName; });
    $("afDelCancel").addEventListener("click", () => { wrap.innerHTML = ""; });
    $("afDelGo").addEventListener("click", async () => {
      const msg = $("afDelMsg");
      $("afDelGo").disabled = true;
      try {
        await Graph.ensureScopes(Graph.SCOPES.profiles);
        msg.textContent = "Checking usage in the tenant, then deleting…";
        await Filters.remove(f.id);
        msg.innerHTML = `<b>Deleted, and the read-back agrees.</b>`;
        await refreshList();
      } catch (e) {
        msg.innerHTML = `<div class="gu-fail"><b>${esc((e && e.message) || e)}</b>${e && e.inUse ? `<span class="why">${e.inUse.slice(0, 10).map((p) => esc(p.payloadType || p.payloadId || "assignment")).join(", ")}${e.inUse.length > 10 ? "…" : ""}</span>` : ""}</div>`;
        $("afDelGo").disabled = false;
      }
    });
  }

  function init() {
    if (!$("afRead")) return;
    $("afRead").addEventListener("click", read);
    $("afScan").addEventListener("click", scanUsage);
    $("afNew").addEventListener("click", () => openForm(null));
    $("afMd").addEventListener("click", () => download("Intune-assignment-filters.md", Filters.markdown(filters, use), "text/markdown"));
    $("afBody").addEventListener("click", (e) => {
      const ed = e.target.closest("[data-afedit]");
      if (ed) { const f = filters.find((x) => x.id === ed.dataset.afedit); if (f) openForm(f); return; }
      const dl = e.target.closest("[data-afdel]");
      if (dl) { const f = filters.find((x) => x.id === dl.dataset.afdel); if (f) confirmDelete(f); return; }
      // the references chip filters; a row's count expands (build 10394)
      const rc = e.target.closest("[data-afrefs]");
      if (rc) { e.preventDefault(); usedOnly = !usedOnly; render(); return; }
      const uc = e.target.closest("[data-afuse]");
      if (uc) {
        e.preventDefault();
        openUse.has(uc.dataset.afuse) ? openUse.delete(uc.dataset.afuse) : openUse.add(uc.dataset.afuse);
        render();
      }
    });
  }

  return { init };
})();

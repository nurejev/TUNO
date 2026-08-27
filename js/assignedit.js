// ======================================================================
// T11 — Assignment editor (BETA). Add and remove assignments in bulk —
// the thing every admin wants and the portal makes slow.
//
// After Maxime Guillemin's Intune-Toolkit (MIT), whose surface map and
// question this is. THE WRITE DISCIPLINE IS TUNO'S OWN, and it is stricter
// than his because a browser tool's whole argument is that it cannot do
// much harm:
//
//   * THIS IS THE SECOND THING IN TUNO THAT WRITES, and the first that
//     writes at scale. T01 creates one profile after a read that refuses to
//     overwrite; this changes what lands on real devices, in bulk, and the
//     mistake it enables is not a duplicate policy but a policy reaching
//     the wrong population — invisible until somebody's laptop behaves
//     differently.
//   * FOUR SURFACES, ALL UNDER THE ONE WRITE SCOPE the registration already
//     declares (DeviceManagementConfiguration.ReadWrite.All): device
//     configurations, settings catalog, compliance, administrative
//     templates. Scripts and applications are deliberately ABSENT — each
//     would be a NEW write scope, and adding a write scope is a decision
//     to take in the open (the R18 rule), not a side effect of a feature.
//   * /assign REPLACES the whole assignment list. There is no "add one"
//     API: the tool reads the current list, edits its copy, and writes the
//     whole list back. Everything it does not touch must survive the round
//     trip byte-for-meaning — targets are re-serialised to exactly the
//     fields the API accepts, filters included.
//   * THE PIPELINE IS: read → plan → BACKUP → confirm → apply → VERIFY.
//     The plan lists every operation with the group NAME and its member
//     count. The backup (current assignments of every affected policy, as
//     a file) is taken automatically and applying is locked until it is.
//     Removals are confirmed separately from additions — by typing the
//     group's name. Every write is preceded by a FRESH read: if the
//     tenant's list no longer matches what the plan was computed from,
//     that policy is skipped as DRIFTED rather than overwritten, because
//     replacing a list somebody else just edited is how two admins erase
//     each other. And every write is followed by a read-back that checks
//     the tenant now says what was intended.
//   * WRITES NEVER RETRY (the graph.js rule): a timed-out POST may have
//     landed, and the verify read answers that instead of a resend.
//   * No delete, no rename. The Toolkit has both behind its own "Advanced
//     Actions" toggle; neither belongs here. If TUNO ever deletes a
//     policy it will be its own decision, not one inherited.
//
// Two refusals borrowed from T09's findings, applied BEFORE the mistake:
// adding an include to a policy that EXCLUDES the same group is refused
// (it would create the include+exclude contradiction T09 flags), and
// "exclude a group this policy includes" is answered with "remove the
// include instead" — an exclusion on top of an include is a contradiction,
// not a removal.
// ======================================================================
const AssignEdit = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();
  const S = () => Graph.SCOPES;
  const READ = () => S().config;
  const WRITE = () => S().profiles;

  // The four surfaces. `assign` is the action path; every one of them takes
  // { assignments: [...] } and REPLACES the list.
  const SURFACES = [
    { id: "deviceConfig", label: "Device configuration", icon: "⚙️", nameField: "displayName",
      list: "/deviceManagement/deviceConfigurations?$expand=assignments",
      assign: (id) => `/deviceManagement/deviceConfigurations/${id}/assign`,
      read1: (id) => `/deviceManagement/deviceConfigurations/${id}/assignments` },
    { id: "settingsCatalog", label: "Settings catalog", icon: "🎛", nameField: "name",
      list: "/deviceManagement/configurationPolicies?$expand=assignments",
      assign: (id) => `/deviceManagement/configurationPolicies/${id}/assign`,
      read1: (id) => `/deviceManagement/configurationPolicies/${id}/assignments` },
    { id: "compliance", label: "Compliance policy", icon: "✅", nameField: "displayName",
      list: "/deviceManagement/deviceCompliancePolicies?$expand=assignments",
      assign: (id) => `/deviceManagement/deviceCompliancePolicies/${id}/assign`,
      read1: (id) => `/deviceManagement/deviceCompliancePolicies/${id}/assignments` },
    { id: "admx", label: "Administrative template", icon: "📋", nameField: "displayName",
      list: "/deviceManagement/groupPolicyConfigurations?$expand=assignments",
      assign: (id) => `/deviceManagement/groupPolicyConfigurations/${id}/assign`,
      read1: (id) => `/deviceManagement/groupPolicyConfigurations/${id}/assignments` },
  ];
  const surfaceById = (id) => SURFACES.find((s) => s.id === id) || null;

  // ------------------------------------------------------------ serialise --
  // Exactly the fields the assign action accepts on a target — nothing that
  // came back from a read (id, source, sourceId) may go forward, and nothing
  // the admin configured (the filter!) may be dropped. Losing a filter on an
  // untouched assignment would silently widen it, which is the worst thing
  // this tool could possibly do.
  function cleanTarget(t) {
    const o = { "@odata.type": t["@odata.type"] };
    if (t.groupId) o.groupId = t.groupId;
    if (t.deviceAndAppManagementAssignmentFilterId) o.deviceAndAppManagementAssignmentFilterId = t.deviceAndAppManagementAssignmentFilterId;
    const fm = t.deviceAndAppManagementAssignmentFilterType;
    if (fm && lc(fm) !== "none") o.deviceAndAppManagementAssignmentFilterType = fm;
    return o;
  }
  const cleanAssignments = (list) => (list || []).map((a) => ({ target: cleanTarget(a.target || {}) }));
  // Canonical string for set comparison — drift and verify both hang off it.
  const sig = (list) => cleanAssignments(list)
    .map((a) => JSON.stringify(Object.keys(a.target).sort().reduce((o, k) => (o[k] = a.target[k], o), {})))
    .sort().join("\n");

  const isInclude = (a) => lc((a.target || {})["@odata.type"]).includes("groupassignmenttarget") && !lc((a.target || {})["@odata.type"]).includes("exclusion");
  const isExclude = (a) => lc((a.target || {})["@odata.type"]).includes("exclusiongroupassignmenttarget");
  const targets = (a) => lc((a.target || {}).groupId || "");
  // THE FILTER IS PART OF THE ASSIGNMENT'S IDENTITY (10494). The noop check
  // compared @odata.type and groupId only, so "add an include for SG-Pilot"
  // reported ALREADY ASSIGNED against an existing include for SG-Pilot that
  // is narrowed by a filter — two assignments that reach different machines,
  // called the same by the one check standing between the operator and a
  // write that silently does nothing. It goes the other way too: adding a
  // FILTER to a group already targeted without one was a noop, so the filter
  // never landed.
  const filterSig = (a) => {
    const f = Docs.filterOfTarget(a && a.target);
    return f ? `${f.id}|${f.mode}` : "";
  };
  const wantSig = (filter) => (filter && filter.id
    ? `${lc(filter.id)}|${filter.mode === "exclude" ? "exclude" : "include"}`
    : "");
  const filterWord = (sig) => (sig ? `⚑ ${sig.split("|")[0].slice(0, 8)}… (${sig.split("|")[1]})` : "no filter");
  // Tenant-wide targets (build 10404, Toolkit parity). Graph has exactly two,
  // and NO exclusion variant of either — that asymmetry drives the refusals.
  const TW_TYPE = {
    allDevices: "#microsoft.graph.allDevicesAssignmentTarget",
    allUsers: "#microsoft.graph.allLicensedUsersAssignmentTarget",
  };
  const isTW = (a, kind) => lc((a.target || {})["@odata.type"])
    .includes(kind === "allDevices" ? "alldevicesassignmenttarget" : "alllicensedusersassignmenttarget");

  // ------------------------------------------------------------------ read --
  async function readPolicies(surfaceIds, onStatus) {
    const out = [], failed = [];
    for (const sf of SURFACES) {
      if (surfaceIds && !surfaceIds.includes(sf.id)) continue;
      try {
        onStatus && onStatus(`${sf.label} — listing…`);
        const items = await Graph.readAll(sf.list, { scopes: READ(), beta: true, retry: true });
        for (const it of items) {
          out.push({
            surface: sf.id, surfaceLabel: sf.label, icon: sf.icon,
            id: it.id, name: it[sf.nameField] || it.displayName || it.name || it.id,
            assignments: it.assignments || [],
          });
        }
      } catch (e) { failed.push({ id: sf.id, label: sf.label, error: GroupUse.shortErr(e) }); }
    }
    out.sort((a, b) => a.surfaceLabel.localeCompare(b.surfaceLabel) || a.name.localeCompare(b.name));
    return { policies: out, failed };
  }

  // ------------------------------------------------------------------ plan --
  // action: "add-include" | "add-exclude" | "remove". Returns one op per
  // policy: change|noop|refused, each with its reason — a plan that hides
  // its noops invites "why did nothing happen", and one that hides its
  // refusals invites doing the refused thing by hand.
  // `group` may instead carry { tenantWide: "allDevices"|"allUsers",
  // displayName } — the Toolkit's other two targets. `filter` is
  // { id, mode } or null, and rides only on ADDS: a removal takes the whole
  // assignment with it, filter included, and "remove just the filter" would
  // be an edit wearing a removal's name.
  function planFor(policies, action, group, filter) {
    const tw = group.tenantWide || null;
    const gid = lc(group.id);
    const withFilter = (t) => {
      if (filter && filter.id) {
        t.deviceAndAppManagementAssignmentFilterId = filter.id;
        t.deviceAndAppManagementAssignmentFilterType = filter.mode === "exclude" ? "exclude" : "include";
      }
      return t;
    };
    const ops = [];
    for (const p of policies) {
      const before = p.assignments || [];
      let op = null;
      if (tw) {
        const has = before.some((a) => isTW(a, tw));
        const want = wantSig(filter);
        const sameF = before.some((a) => isTW(a, tw) && filterSig(a) === want);
        if (action === "add-include") {
          if (sameF) op = { change: "noop", reason: `already targets ${group.displayName}${want ? " through the same filter" : ""}` };
          else if (has) op = { change: "refused", reason: `this policy already targets ${group.displayName}, but with ${filterWord(before.filter((a) => isTW(a, tw)).map(filterSig)[0])} rather than ${filterWord(want)}. Graph holds one tenant-wide target, so this is an EDIT, not an add — remove the existing target first if the change is intended. Reported rather than performed, because the two reach different machines.` };
          else op = { change: "modify", after: cleanAssignments(before).concat([{ target: withFilter({ "@odata.type": TW_TYPE[tw] }) }]) };
        } else if (action === "add-exclude") {
          op = { change: "refused", reason: `Graph has no tenant-wide exclusion — ${group.displayName} can only be a target, never an exception. An exclusion names a group.` };
        } else {
          if (!has) op = { change: "noop", reason: `no ${group.displayName} target on this policy` };
          else op = { change: "modify", after: cleanAssignments(before.filter((a) => !isTW(a, tw))), removes: "tenant-wide target" };
        }
      } else {
        const hasInc = before.some((a) => isInclude(a) && targets(a) === gid);
        const hasExc = before.some((a) => isExclude(a) && targets(a) === gid);
        const want = wantSig(filter);
        const incSame = before.some((a) => isInclude(a) && targets(a) === gid && filterSig(a) === want);
        const excSame = before.some((a) => isExclude(a) && targets(a) === gid && filterSig(a) === want);
        const incHave = before.filter((a) => isInclude(a) && targets(a) === gid).map(filterSig)[0] || "";
        const excHave = before.filter((a) => isExclude(a) && targets(a) === gid).map(filterSig)[0] || "";
        if (action === "add-include") {
          if (incSame) op = { change: "noop", reason: `already assigned to this group${want ? " through the same filter" : ""}` };
          else if (hasInc) op = { change: "refused", reason: `this policy already includes this group, but with ${filterWord(incHave)} rather than ${filterWord(want)} — the two reach different machines, so this is an EDIT rather than an add. Remove the existing include first if the change is intended.` };
          else if (hasExc) op = { change: "refused", reason: "this policy EXCLUDES the group — adding an include would create the include+exclude contradiction the health tool flags. Remove the exclusion first if that is really the intent." };
          else op = { change: "modify", after: cleanAssignments(before).concat([{ target: withFilter({ "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: group.id }) }]) };
        } else if (action === "add-exclude") {
          if (excSame) op = { change: "noop", reason: `already excluded${want ? " through the same filter" : ""}` };
          else if (hasExc) op = { change: "refused", reason: `this policy already excludes this group, but with ${filterWord(excHave)} rather than ${filterWord(want)} — remove the existing exclusion first if the change is intended.` };
          else if (hasInc) op = { change: "refused", reason: "this policy INCLUDES the group — an exclusion on top of an include is a contradiction, not a removal. Use “remove group” to take the include away." };
          else op = { change: "modify", after: cleanAssignments(before).concat([{ target: withFilter({ "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: group.id }) }]) };
        } else if (action === "remove") {
          if (!hasInc && !hasExc) op = { change: "noop", reason: "no assignment names this group" };
          else op = { change: "modify", after: cleanAssignments(before.filter((a) => targets(a) !== gid)),
            removes: before.filter((a) => targets(a) === gid).map((a) => (isExclude(a) ? "exclusion" : "include")).join(", ") };
        }
      }
      ops.push({
        policy: p, action, group,
        before: cleanAssignments(before), beforeSig: sig(before),
        ...op,
      });
    }
    return {
      ops,
      changes: ops.filter((o) => o.change === "modify"),
      noops: ops.filter((o) => o.change === "noop"),
      refused: ops.filter((o) => o.change === "refused"),
      action, group, filter: (filter && filter.id) ? filter : null,
    };
  }

  // ---------------------------------------------------------------- backup --
  // The way back, taken BEFORE anything is sent. Restoring is: for each
  // policy, POST /assign with its `assignments` array from this file.
  function backupJson(plan) {
    return JSON.stringify({
      tool: "TUNO T11 assignment editor",
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
      takenUtc: new Date().toISOString(),
      note: "Current assignments of every policy this plan would change, captured BEFORE applying. To restore one: POST the surface's /assign action with { assignments: [...] } exactly as recorded here.",
      action: plan.action, group: { id: plan.group.id, name: plan.group.displayName },
      policies: plan.changes.map((o) => ({
        surface: o.policy.surface, id: o.policy.id, name: o.policy.name,
        assignments: o.before,
      })),
    }, null, 2);
  }

  // ----------------------------------------------------------------- apply --
  // Sequential, never parallel: writes to a tenant are not a place for a
  // pool. Per op: FRESH READ → drift check → write → VERIFY read-back.
  async function applyPlan(plan, opts) {
    const o = opts || {};
    const status = o.onStatus || (() => {});
    const results = [];
    let stopped = false;
    for (const op of plan.changes) {
      if (stopped) { results.push({ op, skipped: "stopped after an earlier failure" }); continue; }
      const sf = surfaceById(op.policy.surface);
      const label = `${op.policy.name}`;
      try {
        // 1. the tenant as it is NOW, not as it was at dry-run time
        status(`${label} — checking the tenant has not moved…`);
        const now = await Graph.readAll(sf.read1(op.policy.id), { scopes: READ(), beta: true, retry: true });
        if (sig(now) !== op.beforeSig) {
          results.push({ op, drifted: true, error: "the assignments changed since the plan was made — not overwriting somebody else's edit" });
          if (o.stopOnFail) stopped = true;
          continue;
        }
        // 2. the write — full replacement, no retry
        status(`${label} — writing…`);
        await Graph.post(Graph.BETA + sf.assign(op.policy.id), { assignments: op.after }, { scopes: WRITE() });
        // 3. read it back: the tenant's word, not the request's status code
        status(`${label} — verifying…`);
        let verified = false, verifyError = "";
        try {
          const after = await Graph.readAll(sf.read1(op.policy.id), { scopes: READ(), beta: true, retry: true });
          verified = sig(after) === sig(op.after);
          if (!verified) verifyError = "the read-back does not match what was sent — check the policy in the portal";
        } catch (e) { verifyError = "the write went through but the verify read failed: " + GroupUse.shortErr(e); }
        results.push({ op, ok: true, verified, verifyError });
      } catch (e) {
        results.push({ op, error: GroupUse.shortErr(e, 300) });
        if (o.stopOnFail) stopped = true;
      }
    }
    return { results, stopped };
  }

  return {
    SURFACES, surfaceById, READ, WRITE,
    cleanTarget, cleanAssignments, sig, readPolicies, planFor, backupJson, applyPlan,
  };
})();

// ======================================================================
// T11 — the screen. The gates live HERE: backup before apply, removals
// typed, additions ticked. The engine refuses nothing about order — the
// screen is what enforces the pipeline, and the tests check both.
// ======================================================================
const AssignEditTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let read = null;          // { policies, failed }
  let plan = null;          // planFor() result + group meta
  let groupMeta = null;     // { group, members }
  let backupTaken = false;  // for THIS plan
  let busy = false;

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const prog = (m) => TunoProgress.show("aeList", "aeProg", m);   // ENCA-style centred card (10397)

  // The SELECTION lives here, not in the DOM (build 10390). It used to be
  // read off the checkboxes, which meant every filter keystroke re-rendered
  // the table and silently dropped every tick — with a surface rail that
  // would have made cross-surface picking impossible. Checkboxes render
  // FROM this set and write INTO it; picked() never looks at the DOM.
  const sel = new Set();
  const keyOf = (p) => `${p.surface}|${p.id}`;
  const picked = () => (read ? read.policies.filter((p) => sel.has(keyOf(p))) : []);

  // Which surface the rail has active — the Intune Toolkit's shape: pick
  // the section on the left, filter on top, list beside it.
  let surfView = "all";

  // The floating selection bar (build 10400): visible exactly while the
  // tick-set is non-empty. The operation belongs to the selection.
  function syncSelbar() {
    const bar = $("aeSelbar");
    if (!bar) return;
    bar.classList.toggle("visible", sel.size > 0 && !!read);
    const c = $("aeSelCount");
    if (c) c.textContent = `${sel.size} selected`;
  }

  function renderSurfaces() {
    const side = $("aeSurfSide");
    if (!side) return;
    const count = (id) => read.policies.filter((p) => id === "all" || p.surface === id).length;
    const selCount = (id) => read.policies.filter((p) => (id === "all" || p.surface === id) && sel.has(keyOf(p))).length;
    const item = (id, icon, label) => `<button data-aesurf="${esc(id)}" class="${surfView === id ? "active" : ""}">
      <span>${esc(icon)} ${esc(label)}</span>
      <span class="mini ${selCount(id) ? "" : "muted"}">${selCount(id) ? `${selCount(id)} ✓ · ` : ""}${count(id)}</span></button>`;
    side.innerHTML = item("all", "🗂", "All surfaces") +
      AssignEdit.SURFACES.map((s) => item(s.id, s.icon, s.label)).join("") +
      (read.failed.length ? `<p class="mini muted" style="margin:8px 6px 0">${read.failed.map((f) => esc(f.label)).join(", ")} could not be read — not listed, not editable this run.</p>` : "");
    side.style.display = "";
    // the split is single-column until the rail exists — without this the
    // hidden rail left the LIST in the 230px rail column (build 10405)
    const split = side.closest(".ae-split");
    if (split) split.classList.add("has-rail");
  }

  function renderPolicies() {
    const q = lcq($("aeFilter").value);
    const list = read.policies
      .filter((p) => surfView === "all" || p.surface === surfView)
      .filter((p) => !q || lcq(p.name).includes(q) || lcq(p.surfaceLabel).includes(q));
    const rows = list.map((p) => `<tr>
        <td style="width:34px"><input type="checkbox" data-aepol="${esc(keyOf(p))}" ${sel.has(keyOf(p)) ? "checked" : ""}></td>
        <td><b>${esc(p.name)}</b></td><td>${esc(p.icon)} ${esc(p.surfaceLabel)}</td>
        <td>${p.assignments.length} assignment${p.assignments.length === 1 ? "" : "s"}</td></tr>`).join("");
    const picks = sel.size ? `<p class="mini ae-picks" style="margin:8px 0 0"><b>${sel.size} selected</b> across all surfaces — the selection survives filtering and switching surfaces.</p>` : "";
    $("aeList").innerHTML = `<div style="overflow-x:auto"><table class="plist"><thead><tr><th></th><th>Policy</th><th>Surface</th><th>Assigned</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="mini">Nothing on this surface matches the filter.</td></tr>`}</tbody></table></div>${picks}`;
    renderSurfaces();
    syncSelbar();
    $("aePlanWrap").style.display = "";
  }
  const lcq = (s) => String(s || "").toLowerCase();

  function invalidatePlan() {
    plan = null; groupMeta = null; backupTaken = false;
    $("aePlanOut").innerHTML = ""; $("aeApplyWrap").style.display = "none"; $("aeResults").innerHTML = "";
  }

  async function dryRun() {
    if (busy) return;
    busy = true; invalidatePlan();
    try {
      const pols = picked();
      if (!pols.length) throw new Error("Tick at least one policy.");
      const action = document.querySelector("[data-aeact].active").dataset.aeact;
      // the target: a group, or one of Graph's two tenant-wide targets
      // (build 10404 — Toolkit parity)
      const tsel = (document.querySelector("[data-aetarget].active") || {}).dataset?.aetarget || "group";
      let group, members = null;
      if (tsel === "group") {
        prog("Finding the group…");
        await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
        group = await GroupUse.resolveGroup($("aeGroup").value);
        members = await GroupUse.memberCount(group.id);
      } else {
        group = { id: "", displayName: tsel === "allDevices" ? "All devices" : "All users", tenantWide: tsel };
      }
      const filter = $("aeFilterSel") && $("aeFilterSel").value && action !== "remove"
        ? { id: $("aeFilterSel").value, mode: $("aeFilterMode").value }
        : null;
      groupMeta = { group, members };
      plan = AssignEdit.planFor(pols, action, group, filter);
      prog("");
      renderPlan();
    } catch (e) { prog(""); $("aePlanOut").innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`; }
    finally { busy = false; }
  }

  const ACTION_LABEL = { "add-include": "add an include of", "add-exclude": "add an exclusion of", remove: "remove" };

  function renderPlan() {
    const g = groupMeta;
    const dyn = g.group.membershipRule ? ` <span class="gu-how exc">dynamic</span>` : "";
    const memberLine = g.group.tenantWide
      ? `<b>THE WHOLE TENANT</b> — every ${g.group.tenantWide === "allDevices" ? "managed device" : "licensed user"} it has, now and every one it gains later`
      : g.members == null
        ? `<b>member count unknown</b> — the read failed, so the blast radius is unknown too`
        : g.members === 0
          ? `<b>0 members</b> — ${plan.action === "remove" ? "" : "assigning to an empty group configures NOTHING until somebody joins it"}`
          : `<b>${g.members}</b> direct member${g.members === 1 ? "" : "s"}`;
    const filterLine = plan.filter
      ? ` The add carries <b>assignment filter</b> “${esc((($("aeFilterSel") || {}).selectedOptions || [{}])[0].textContent || plan.filter.id)}” (${esc(plan.filter.mode)}) — the filter narrows the reach, and the service evaluates it, not this tool.`
      : "";
    const row = (o, cls, extra) => `<tr class="${cls || ""}">
      <td><b>${esc(o.policy.name)}</b></td><td>${esc(o.policy.surfaceLabel)}</td>
      <td>${o.before.length} → ${o.after ? o.after.length : o.before.length}</td><td class="mini">${esc(extra || o.reason || "")}</td></tr>`;
    const removals = plan.action === "remove" && plan.changes.length;
    $("aePlanOut").innerHTML = `<div class="list-card" style="margin-top:12px">
      <p class="mini" style="margin:0 0 8px">This plan will <b>${ACTION_LABEL[plan.action]}</b> “<b>${esc(g.group.displayName)}</b>”${dyn} — ${memberLine} — on <b>${plan.changes.length}</b> polic${plan.changes.length === 1 ? "y" : "ies"}.${filterLine} ${plan.noops.length ? `${plan.noops.length} skipped as already correct.` : ""} ${plan.refused.length ? `<b>${plan.refused.length} REFUSED</b> — see below.` : ""}</p>
      <div style="overflow-x:auto"><table class="plist"><thead><tr><th>Policy</th><th>Surface</th><th>Assignments</th><th>Note</th></tr></thead><tbody>
        ${plan.changes.map((o) => row(o, "", o.removes ? `removes the ${o.removes}` : "")).join("")}
        ${plan.refused.map((o) => row(o, "", "REFUSED: " + o.reason)).join("")}
        ${plan.noops.map((o) => row(o, "", "no change: " + o.reason)).join("")}
      </tbody></table></div>
      <p class="mini muted" style="margin:8px 0 0">The assign call <b>replaces the whole assignment list</b>. Everything untouched is re-sent exactly as read, filters included, and each policy is re-read at apply time — one whose assignments changed in the meantime is skipped as drifted rather than overwritten.</p>
    </div>`;
    if (plan.changes.length) {
      $("aeApplyWrap").style.display = "";
      $("aeBackupBtn").disabled = false;
      $("aeApplyBtn").disabled = true;
      $("aeConfirmWrap").innerHTML = removals
        ? `<label class="wi-f" style="margin-top:8px"><span>Removals are confirmed by TYPING the group's name</span>
            <input id="aeConfirmText" placeholder="Type “${esc(g.group.displayName)}” to allow the removal…" autocomplete="off" spellcheck="false"></label>`
        : `<label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin-top:8px">
            <input type="checkbox" id="aeConfirmTick"> I have read the plan — ${plan.changes.length} polic${plan.changes.length === 1 ? "y" : "ies"}, group “${esc(g.group.displayName)}”${g.members != null ? `, ${g.members} member${g.members === 1 ? "" : "s"}` : ""}</label>`;
      $("aeGate").textContent = "① Take the backup, ② confirm, ③ apply. The apply button stays locked until both.";
      wireGate();
    }
  }

  function gateOk() {
    if (!backupTaken) return false;
    const txt = $("aeConfirmText"), tick = $("aeConfirmTick");
    if (txt) return txt.value.trim() === groupMeta.group.displayName;
    return !!(tick && tick.checked);
  }
  function wireGate() {
    const update = () => { $("aeApplyBtn").disabled = !gateOk(); };
    const txt = $("aeConfirmText"), tick = $("aeConfirmTick");
    if (txt) txt.addEventListener("input", update);
    if (tick) tick.addEventListener("change", update);
  }

  async function apply() {
    if (busy || !plan || !gateOk()) return;
    busy = true;
    try {
      // The write scope is asked for HERE, on this click, never earlier —
      // reading and planning must be possible without ever holding it.
      await Graph.ensureScopes(AssignEdit.WRITE());
      const r = await AssignEdit.applyPlan(plan, { onStatus: prog, stopOnFail: $("aeStop").checked });
      prog("");
      const row = (x) => {
        const o = x.op;
        let st, note = "";
        if (x.skipped) { st = `<span class="mini muted">skipped</span>`; note = x.skipped; }
        else if (x.drifted) { st = `<span class="gu-how exc">drifted — not written</span>`; note = x.error; }
        else if (x.error) { st = `<span class="gu-how exc">FAILED</span>`; note = x.error; }
        else if (x.ok && x.verified) st = `<span class="gu-how inc">written · verified</span>`;
        else { st = `<span class="gu-how exc">written · NOT verified</span>`; note = x.verifyError; }
        return `<tr><td><b>${esc(o.policy.name)}</b></td><td>${esc(o.policy.surfaceLabel)}</td><td>${st}</td><td class="mini">${esc(note)}</td></tr>`;
      };
      const okN = r.results.filter((x) => x.ok && x.verified).length;
      $("aeResults").innerHTML = `<div class="list-card" style="margin-top:12px">
        <div class="gu-sum">
          <span class="gu-stat ${okN ? "" : "zero"}"><b>${okN}</b> written &amp; verified</span>
          <span class="gu-stat ${r.results.length - okN ? "" : "zero"}" ${r.results.length - okN ? 'style="border-color:var(--off)"' : ""}><b>${r.results.length - okN}</b> not clean</span>
          ${r.stopped ? `<span class="gu-stat" style="border-color:var(--off)">stopped early</span>` : ""}
        </div>
        <div style="overflow-x:auto;margin-top:8px"><table class="plist"><thead><tr><th>Policy</th><th>Surface</th><th>Result</th><th>Note</th></tr></thead><tbody>${r.results.map(row).join("")}</tbody></table></div>
        <p class="mini muted" style="margin:8px 0 0">Every “verified” is the tenant's own read-back, not the write's status code. The backup file from step ① is the way back for all of it.</p></div>`;
      // A used plan is a spent plan — the tenant has moved, by us.
      plan = null; backupTaken = false; $("aeApplyWrap").style.display = "none"; $("aePlanOut").innerHTML = "";
    } catch (e) { prog(""); $("aeResults").innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`; }
    finally { busy = false; }
  }

  async function readAll() {
    if (busy) return;
    busy = true; invalidatePlan();
    try {
      // Groups ride along with the read consent (build 10404): the dry run
      // needs the scope anyway, and asking here means the group box suggests
      // from the tenant from the first keystroke instead of after the first
      // dry run.
      await Graph.ensureScopes([...new Set([...AssignEdit.READ(), ...Graph.SCOPES.groups])]);
      read = await AssignEdit.readPolicies(null, prog);
      sel.clear(); surfView = "all";   // a fresh read is a fresh decision
      prog(`${read.policies.length} policies read.`);
      renderPolicies();
      // T14's own filter list fills the dropdown — same read scope, one
      // request, and a tenant without filters simply keeps "No filter".
      try {
        if (typeof Filters !== "undefined") {
          const fl = await Filters.list();
          $("aeFilterSel").innerHTML = `<option value="">No filter</option>` +
            fl.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)))
              .map((f) => `<option value="${esc(f.id)}">${esc(f.displayName)} (${esc(Filters.platformLabel(f.platform))})</option>`).join("");
        }
      } catch { /* filters are an option, not a requirement — the dropdown stays at No filter */ }
    } catch (e) { prog(""); $("aeList").innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`; }
    finally { busy = false; }
  }

  function init() {
    if (!$("aeRead")) return;
    $("aeRead").addEventListener("click", readAll);
    $("aeFilter").addEventListener("input", () => read && renderPolicies());
    // the surface rail and the tick-set (both build 10390)
    $("aeSurfSide").addEventListener("click", (e) => {
      const b = e.target.closest("[data-aesurf]");
      if (b && read) { surfView = b.dataset.aesurf; renderPolicies(); }
    });
    $("aeList").addEventListener("change", (e) => {
      const c = e.target.closest("[data-aepol]");
      if (!c) return;
      c.checked ? sel.add(c.dataset.aepol) : sel.delete(c.dataset.aepol);
      // the rail's ✓ counts and the selected line follow WITHOUT a table
      // re-render — re-rendering on every tick would throw away the scroll
      // position on a 300-row list, which makes bulk ticking miserable
      renderSurfaces();
      syncSelbar();
      let line = $("aeList").querySelector(":scope > p.ae-picks");
      if (!sel.size) { if (line) line.remove(); return; }
      if (!line) { line = document.createElement("p"); line.className = "mini ae-picks"; line.style.margin = "8px 0 0"; $("aeList").appendChild(line); }
      line.innerHTML = `<b>${sel.size} selected</b> across all surfaces — the selection survives filtering and switching surfaces.`;
    });
    // The bar's controls follow the choice (build 10404): removals carry no
    // filter (they take the whole assignment, filter included), and a
    // tenant-wide target has no group box to fill.
    const syncBarControls = () => {
      const action = (document.querySelector("[data-aeact].active") || {}).dataset?.aeact;
      const tsel = (document.querySelector("[data-aetarget].active") || {}).dataset?.aetarget || "group";
      $("aeGroup").style.display = tsel === "group" ? "" : "none";
      const filterable = action !== "remove";
      $("aeFilterSel").style.display = filterable ? "" : "none";
      $("aeFilterMode").style.display = filterable && $("aeFilterSel").value ? "" : "none";
    };
    $("aeActSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-aeact]"); if (!b) return;
      [...$("aeActSeg").children].forEach((x) => x.classList.toggle("active", x === b));
      syncBarControls();
      invalidatePlan();
    });
    $("aeTargetSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-aetarget]"); if (!b) return;
      [...$("aeTargetSeg").children].forEach((x) => x.classList.toggle("active", x === b));
      syncBarControls();
      invalidatePlan();
    });
    $("aeFilterSel").addEventListener("change", () => { syncBarControls(); invalidatePlan(); });
    $("aeFilterMode").addEventListener("change", invalidatePlan);
    syncBarControls();
    $("aeGroup").addEventListener("input", invalidatePlan);
    $("aeDryRun").addEventListener("click", dryRun);
    $("aeSelClear").addEventListener("click", () => { sel.clear(); invalidatePlan(); renderPolicies(); });
    $("aeBackupBtn").addEventListener("click", () => {
      if (!plan) return;
      download(`assignments-before-${new Date().toISOString().slice(0, 10)}.json`, AssignEdit.backupJson(plan));
      backupTaken = true;
      $("aeGate").textContent = "Backup taken. Confirm, then apply.";
      $("aeApplyBtn").disabled = !gateOk();
    });
    $("aeApplyBtn").addEventListener("click", apply);
  }

  return { init };
})();

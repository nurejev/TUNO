// ======================================================================
// T28 — 📡 LANDING (build 10689). Mihai, 7 Oct: "need a solution to
// report assigned policies in the waves for the users and groups. i need
// to make sure that the policies are landing on the users and devices.
// which of the new policies have landed or are in error or in conflict"
// — option A off the mockup canvas ("T28 Landing check — options"):
// a rail node under CHECK & RECOVER, tenant side only.
//
// WHAT IT ANSWERS. Intune's own check-in status per new policy, per
// device and user — the "Device and user check-in status" report behind
// the portal's View report (DeviceStatusesByConfigurationProfile, read
// through the cached-report API, one report per policy) — JOINED to the
// wave model: every member of a wave the policy includes is EXPECTED to
// report it, minus the policy's excluded groups. So the pane can say,
// per policy and per wave, how many landed, are pending, in error, in
// conflict, not applicable — and, which the portal never says, which
// members have NO status at all.
//
//   landed    Intune reports Succeeded
//   pending   Pending — the device has not checked in for it yet
//   error     Error — the setting failed to apply
//   conflict  Conflict — another policy sets the same setting differently
//   na        Not applicable — the device cannot take the setting
//   none      no row at all: the member is in the wave but Intune has not
//             targeted it (membership not propagated yet, a filter, or a
//             user who has not signed in anywhere). Shown with the device's
//             last check-in, never called a failure outright.
//   excluded  in an excluded group of the policy — not expected
//   extra     Intune reports it, but it is in no wave the policy includes
//             (a pilot group, another assignment)
//
// A status row says Conflict but not with what. When any conflict is
// reported, T12's setting-level read (ConflictDevices.read, settings on)
// names the setting, and the ⚔️ pairs name the old policy the device is
// also in conflict on — explainConflicts() attaches both.
//
// Status words first, codes second. The report's PolicyStatus comes as a
// code with a *_loc column in words; the words decide. Without words the
// code is read by Graph's complianceStatus enum (1 notApplicable,
// 2 compliant, 3 remediated, 4 nonCompliant, 5 error, 6 conflict,
// 7 notAssigned, 0 unknown) and the model says so (codeBased) — never
// "landed" from a number nobody checked.
//
// Reads only. Nothing here writes to the tenant: the cached report
// configuration is a short-lived server-side object that expires by itself.
// ======================================================================
const MdeLanding = (() => {
  "use strict";
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const enc = encodeURIComponent;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;
  const csvCell = (s) => { const v = String(s == null ? "" : s); return /[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

  const REPORT = "DeviceStatusesByConfigurationProfile";
  const SELECT = ["PolicyId", "PolicyName", "IntuneDeviceId", "DeviceName", "UPN", "PolicyStatus", "PspdpuLastModifiedTimeUtc", "UnifiedPolicyType", "UnifiedPolicyPlatformType", "AssignmentFilterIds"];
  const PAGE = 500;
  const POLL_MS = 1500, POLL_MAX = 80;

  // The states, in the order the pane and the report list them. `rank`
  // orders a member's worst state: a conflict outranks an error outranks a
  // pending row outranks a missing one outranks "not applicable" outranks
  // landed.
  const STATE = {
    landed:   { key: "landed",   label: "landed",         glyph: "✓", rank: 0, problem: false },
    na:       { key: "na",       label: "not applicable", glyph: "n/a", rank: 1, problem: false },
    none:     { key: "none",     label: "no status",      glyph: "◌", rank: 2, problem: true },
    pending:  { key: "pending",  label: "pending",        glyph: "…", rank: 3, problem: true },
    error:    { key: "error",    label: "error",          glyph: "✕", rank: 4, problem: true },
    conflict: { key: "conflict", label: "conflict",       glyph: "⚔", rank: 5, problem: true },
    unreadable: { key: "unreadable", label: "status unreadable", glyph: "?", rank: 2, problem: true },
    excluded: { key: "excluded", label: "excluded",       glyph: "⊘", rank: -1, problem: false },
  };
  const ORDER = ["landed", "pending", "none", "error", "conflict", "na", "unreadable"];
  const CODE = { 0: "pending", 1: "na", 2: "landed", 3: "landed", 4: "error", 5: "error", 6: "conflict", 7: "pending" };

  function wordState(w) {
    const s = lc(w).replace(/[^a-z]/g, "");
    if (!s) return null;
    if (/^(succeeded|success|compliant|remediated|applied)$/.test(s)) return "landed";
    if (/^(pending|inprogress|notevaluated|unknown|notassigned)$/.test(s)) return "pending";
    if (/^(error|failed|failure|noncompliant)$/.test(s)) return "error";
    if (/^conflict$/.test(s)) return "conflict";
    if (/^(notapplicable|na)$/.test(s)) return "na";
    return null;
  }
  // One report row → { state, word, code }. Words from any *_loc or
  // status column win; a bare number is read by the enum and flagged.
  function stateOf(row) {
    const pick = ConflictDevices.pick;
    const loc = pick(row, ["PolicyStatus_loc", "AssignmentStatus_loc", "Status_loc"]);
    let word = typeof loc === "string" ? loc : "";
    if (!wordState(word)) {
      word = "";
      for (const k of Object.keys(row || {})) {
        if (!/status|state/i.test(k)) continue;
        const v = row[k];
        if (typeof v === "string" && wordState(v)) { word = v; break; }
      }
    }
    const raw = pick(row, ["PolicyStatus", "AssignmentStatus", "Status"]);
    const code = Number.isFinite(Number(raw)) && raw !== "" && raw !== null ? Number(raw) : null;
    if (word) return { state: wordState(word), word, code, byCode: false };
    if (code !== null && CODE[code] !== undefined) return { state: CODE[code], word: `code ${code}`, code, byCode: true };
    return { state: "unreadable", word: raw == null ? "" : String(raw), code, byCode: false };
  }

  // --------------------------------------------------------------- scope --
  // Which waves each new policy includes (its reach, through the wave
  // rows), which groups it excludes, and what to read for it. A policy's
  // audience comes from its name (- D - / - U -); a name that says nothing
  // takes the kind of the waves it includes.
  function scope(newP, waveRows) {
    const waves = (waveRows || []).filter((w) => w.role === "wave" && w.id);
    const byId = new Map(waves.map((w) => [lc(w.id), w]));
    const policies = (newP || []).map((P) => {
      const inc = P.reach && P.reach.inc ? [...P.reach.inc] : [];
      const exc = P.reach && P.reach.exc ? [...P.reach.exc] : [];
      const incWaves = inc.map((id) => byId.get(lc(id))).filter(Boolean);
      const tenantWide = (P.item && P.item.assignments || []).some((a) => a.kind === "All devices" || a.kind === "All users");
      const filtered = (P.item && P.item.assignments || []).some((a) => a.kind !== "Excluded" && a.filterId);
      let audience = P.audience || null;
      if (!audience) {
        const kinds = new Set(incWaves.map((w) => w.audience));
        audience = kinds.size === 1 ? [...kinds][0] : (kinds.size > 1 ? "both" : null);
      }
      return { P, key: P.key, id: lc(P.id), name: P.name, audience, waves: incWaves,
        regions: [...new Set(incWaves.map((w) => w.region))], excludes: exc.map(lc), tenantWide, filtered,
        assigned: inc.length > 0 || tenantWide };
    });
    const userWaves = new Map(), deviceWaves = new Map();
    for (const p of policies) for (const w of p.waves) (w.audience === "user" ? userWaves : deviceWaves).set(lc(w.id), w);
    const excludeGroups = new Set();
    for (const p of policies) for (const id of p.excludes) excludeGroups.add(id);
    return { policies, userWaves: [...userWaves.values()], deviceWaves: [...deviceWaves.values()], excludeGroups: [...excludeGroups] };
  }

  // --------------------------------------------------------------- reads --
  const EV = { ConsistencyLevel: "eventual" };
  const GS = () => Graph.SCOPES.groups;
  // The waves' members, transitively: users of the user waves, devices of
  // the device waves, and both kinds of every excluded group.
  async function readMembers(sc, opts) {
    const o = opts || {};
    const say = (m) => { if (typeof o.onStatus === "function") o.onStatus(m); };
    // excludedBy: per excluded group, who is in it — a policy holds out only
    // the members of ITS excluded groups
    const out = { users: new Map(), devices: new Map(), excludedBy: new Map(), errors: [] };
    const readUsers = (id) => Graph.readAll(`/groups/${enc(id)}/transitiveMembers/microsoft.graph.user?$select=id,userPrincipalName&$count=true&$top=999`, { scopes: GS(), headers: EV, retry: true });
    const readDevices = (id) => Graph.readAll(`/groups/${enc(id)}/transitiveMembers/microsoft.graph.device?$select=id,deviceId,displayName&$count=true&$top=999`, { scopes: GS(), headers: EV, retry: true });
    let n = 0;
    const total = sc.userWaves.length + sc.deviceWaves.length + sc.excludeGroups.length * 2;
    const step = (what) => say(`Reading the wave members — ${++n} of ${total} (${what})…`);
    const ur = await Graph.pool(sc.userWaves, async (w) => { const r = await readUsers(w.id); step(w.name); return r; }, 4);
    ur.forEach((r, i) => { const w = sc.userWaves[i]; if (r.error) out.errors.push(`${w.name}: ${(r.error && r.error.message) || r.error}`); else out.users.set(lc(w.id), (r.value || []).map((u) => ({ id: lc(u.id), upn: u.userPrincipalName || "" }))); });
    const dr = await Graph.pool(sc.deviceWaves, async (w) => { const r = await readDevices(w.id); step(w.name); return r; }, 4);
    dr.forEach((r, i) => { const w = sc.deviceWaves[i]; if (r.error) out.errors.push(`${w.name}: ${(r.error && r.error.message) || r.error}`); else out.devices.set(lc(w.id), (r.value || []).map((d) => ({ id: lc(d.id), deviceId: lc(d.deviceId || ""), name: d.displayName || "" }))); });
    const xr = await Graph.pool(sc.excludeGroups, async (id) => {
      const u = await readUsers(id).catch(() => null); step("exclusions");
      const d = await readDevices(id).catch(() => null); step("exclusions");
      return { u, d };
    }, 4);
    xr.forEach((r, i) => {
      const x = { users: new Set(), userIds: new Set(), devices: new Set(), deviceIds: new Set() };
      out.excludedBy.set(lc(sc.excludeGroups[i]), x);
      if (r.error || !r.value) return;
      for (const u of r.value.u || []) { x.users.add(lc(u.userPrincipalName)); x.userIds.add(lc(u.id)); }
      for (const d of r.value.d || []) { x.devices.add(lc(d.deviceId || "")); x.deviceIds.add(lc(d.id)); }
    });
    say("");
    return out;
  }
  // The Windows devices in Intune — the Intune id ↔ Entra device id bridge
  // and the last check-in. A caller that read them already (👥) hands them in.
  async function readManaged(opts) {
    const o = opts || {};
    if (Array.isArray(o.managed)) return o.managed;
    if (typeof o.onStatus === "function") o.onStatus("Reading the devices in Intune…");
    const all = await Graph.readAll(`/deviceManagement/managedDevices?$select=id,deviceName,userId,userPrincipalName,azureADDeviceId,lastSyncDateTime,operatingSystem`, { scopes: Graph.SCOPES.devices, retry: true });
    return (all || []).filter((m) => lc(m.operatingSystem) === "windows");
  }

  // ------------------------------------------- the shapes of the read --
  // Mihai's first live run on PVM (7 Oct 2026, beta 10692): EVERY new policy
  // answered 400 "An error has occurred." — Graph's reports service refusing
  // the cached-report create as 10689 shaped it (reportName and metadata in
  // the body, a bare PolicyId filter), and the cockpit printed that once per
  // policy. Microsoft documents the report's columns and filter columns but
  // not the portal's exact body, so since 10694 the read tries the documented
  // shapes in order ON THE FIRST POLICY ONLY and keeps the first one the
  // tenant answers for the rest:
  //   cached       the three-step pattern exactly as Microsoft Learn's own
  //                example has it — id, filter, orderBy, select; no reportName,
  //                no metadata; getCachedReport repeats filter and select
  //   cached-base  the same with the policy base types in the filter — the
  //                four the portal's per-device report names. PolicyBaseTypeName
  //                is a FILTER column of this report and not an output column:
  //                a store selector, which some tenants want named.
  //   action       getConfigurationPolicyNonComplianceReport with the PolicyId
  //                filter — the documented report action T12's device read
  //                uses, the one call PROVEN to answer on PVM (its rows carry
  //                PolicyStatus with the _loc words).
  // A refusal moves to the next shape only when it is the tenant refusing the
  // report — a 4xx/5xx from Graph, or a configuration Intune fails to build.
  // An auth, consent, throttle or network error is the error, for every
  // shape. When the first policy is refused in every form the second is
  // probed (one deleted policy must not condemn the read); when that one is
  // refused too, the rest are not asked — one answer, said once, never fifty.
  const SHAPES = ["cached", "cached-base", "action"];
  const SHAPE_LABEL = { cached: "cached report, PolicyId", "cached-base": "cached report, PolicyId + policy base type", action: "getConfigurationPolicyNonComplianceReport" };
  const R_ACTION = "getConfigurationPolicyNonComplianceReport";
  const BASE_TYPES = ["Microsoft.Management.Services.Api.DeviceConfiguration", "DeviceManagementConfigurationPolicy", "DeviceConfigurationAdmxPolicy", "Microsoft.Management.Services.Api.DeviceManagementIntent"];
  const odata = (s) => String(s == null ? "" : s).replace(/'/g, "''");
  const policyFilter = (policyId, withBase) => `(PolicyId eq '${odata(policyId)}')${withBase ? ` and (${BASE_TYPES.map((t) => `(PolicyBaseTypeName eq '${t}')`).join(" or ")})` : ""}`;
  // "400 An error has occurred." — the status in front, so a refusal can be
  // told from a timeout at a glance
  const errText = (e) => `${e && e.status ? `${e.status} ` : ""}${(e && e.message) || String(e)}`;
  const refusal = (e) => !!e && (e.kind === "graph" || e.kind === "notfound" || e.reportFailed === true);
  const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Pages of one { Schema, Values } answer, by top/skip, until the
  // TotalRowCount is reached (a short page is not the end while rows are
  // still due) — the cached report's and the action's alike.
  async function readPages(ask) {
    const rows = [];
    let total = null;
    for (let skip = 0, pages = 0; ; skip += PAGE) {
      const resp = await ask(skip);
      const page = ConflictDevices.rowsOf(resp);
      rows.push(...page);
      if (resp && typeof resp === "object" && Number.isFinite(resp.TotalRowCount)) total = resp.TotalRowCount;
      if (!page.length || (total !== null ? rows.length >= total : page.length < PAGE)) break;
      if (++pages > 200) throw new Error("Stopped after 200 pages of the status report.");
    }
    return rows;
  }
  // The cached report: create the configuration (a PolicyId filter, the
  // columns), wait for it to complete, then page getCachedReport.
  async function readCached(policyId, opts, withBase) {
    const o = opts || {};
    const base = `${Graph.BETA}/deviceManagement/reports/`;
    const id = `${REPORT}_${uuid()}`;
    const filter = policyFilter(policyId, withBase);
    let conf = await Graph.post(base + "cachedReportConfigurations", { id, filter, orderBy: [], select: SELECT }, { scopes: o.scopes, retry: true });
    const cid = (conf && conf.id) || id;
    let status = lc(conf && conf.status);
    for (let i = 0; status !== "completed" && i < POLL_MAX; i++) {
      if (status === "failed") { const e = new Error(`Intune could not build the status report (${cid}).`); e.reportFailed = true; throw e; }
      await sleep(o.pollMs !== undefined ? o.pollMs : POLL_MS);
      conf = await Graph.get(`${base}cachedReportConfigurations('${enc(cid)}')`, { scopes: o.scopes, retry: true });
      status = lc(conf && conf.status);
    }
    // a report that never completes is the tenant not answering in this
    // form — the next form is tried, rather than every policy waiting it out
    if (status !== "completed") { const e = new Error(`The status report did not complete in time (${cid}).`); e.reportFailed = true; throw e; }
    return readPages((skip) => Graph.post(base + "getCachedReport", { id: cid, filter, orderBy: [], select: SELECT, skip, top: PAGE }, { scopes: o.scopes, retry: true }));
  }
  // The report action, T12's way: a read sent as POST, one call per page.
  async function readAction(policyId, opts) {
    const o = opts || {};
    return readPages((skip) => Graph.post(`${Graph.BETA}/deviceManagement/reports/${R_ACTION}`, { filter: policyFilter(policyId, false), top: PAGE, skip }, { scopes: o.scopes, retry: true }));
  }
  const readShape = (shape, policyId, opts) => shape === "action" ? readAction(policyId, opts) : readCached(policyId, opts, shape === "cached-base");
  // One policy's check-in status in one shape — the first by default.
  async function readPolicyStatus(policyId, opts) {
    const o = opts || {};
    return readShape(o.shape || SHAPES[0], policyId, o);
  }
  // The first policy of a read: the shapes in order until one answers.
  // { shape, rows, tried } — `tried` names each refusal before the answer.
  async function probeStatus(policyId, opts) {
    const o = opts || {};
    const tried = [];
    for (const shape of SHAPES) {
      try { const rows = await readShape(shape, policyId, o); return { shape, rows, tried }; }
      catch (e) {
        if (!refusal(e)) throw e;
        tried.push({ shape, error: errText(e) });
      }
    }
    const e = new Error(`Intune refused the check-in status report in every form tried — ${tried.map((t) => `${SHAPE_LABEL[t.shape]}: ${t.error}`).join("; ")}`);
    e.tried = tried;
    throw e;
  }
  // Every new policy's rows, shaped: { policyId, intuneId, name, upn, state,
  // word, code, byCode, when, filters }. A policy whose report failed is
  // listed in `failed`, never counted as "nothing reported". `shape` is the
  // form the tenant answered, `tried` the refusals before it.
  async function readStatus(policies, opts) {
    const o = opts || {};
    const say = (m) => { if (typeof o.onStatus === "function") o.onStatus(m); };
    const pick = ConflictDevices.pick;
    const out = { byPolicy: new Map(), failed: new Map(), rows: 0, codeBased: false, at: Date.now(), shape: o.shape || null, tried: [] };
    const list = (policies || []).filter((p) => p.assigned);
    let done = 0;
    const take = (p, rows) => {
      const shaped = (rows || []).map((row) => {
        const st = stateOf(row);
        if (st.byCode) out.codeBased = true;
        return { policyId: p.id, intuneId: lc(pick(row, ["IntuneDeviceId", "DeviceId"]) || ""), name: String(pick(row, ["DeviceName"]) || ""),
          upn: lc(pick(row, ["UPN", "UserPrincipalName"]) || ""), state: st.state, word: st.word, code: st.code, byCode: st.byCode,
          when: String(pick(row, ["PspdpuLastModifiedTimeUtc", "LastModifiedDateTime"]) || ""), filters: String(pick(row, ["AssignmentFilterIds"]) || "") };
      });
      out.rows += shaped.length;
      out.byPolicy.set(p.id, shaped);
    };
    say(`Reading Intune's check-in status — 0 of ${list.length} policies…`);
    // the first policy settles the shape (10694); a second is probed when
    // the first is refused in every form; the rest follow the answer
    let rest = list;
    if (!out.shape) {
      rest = [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        try {
          const r = await probeStatus(p.id, { scopes: o.scopes, pollMs: o.pollMs });
          out.shape = r.shape; out.tried = r.tried; take(p, r.rows);
          say(`Reading Intune's check-in status — ${++done} of ${list.length} policies…`);
          rest = list.slice(i + 1);
          break;
        } catch (e) {
          out.failed.set(p.id, errText(e));
          out.tried = e.tried || out.tried;
          if (!e.tried || i >= 1) { for (const q of list.slice(i + 1)) out.failed.set(q.id, errText(e)); break; }
        }
      }
    }
    const res = await Graph.pool(rest, async (p) => {
      const rows = await readPolicyStatus(p.id, { scopes: o.scopes, pollMs: o.pollMs, shape: out.shape || SHAPES[0] });
      say(`Reading Intune's check-in status — ${++done} of ${list.length} policies…`);
      return rows;
    }, 3);
    res.forEach((r, i) => {
      const p = rest[i];
      if (r.error) { out.failed.set(p.id, errText(r.error)); return; }
      take(p, r.value || []);
    });
    say("");
    return out;
  }
  // The failures, said once each: "52 of 52 policies — 400 An error has
  // occurred." — grouped by what Intune answered, never a wall of the same
  // sentence. Up to three distinct failures name their policies.
  function failedSummary(failed, policies, total) {
    const list = failed || [];
    if (!list.length) return "";
    const nameOf = (id) => { const p = (policies || []).find((x) => x.id === id); return p ? p.name : id; };
    const groups = new Map();
    for (const f of list) { const g = groups.get(f.error) || []; g.push(f.id); groups.set(f.error, g); }
    const n = total || list.length;
    return [...groups.entries()].map(([error, ids]) => ids.length <= 3 && groups.size <= 3
      ? `${ids.map(nameOf).join(", ")} — ${error}`
      : `${ids.length} of ${plural(n, "policy", "policies")} — ${error}`).join("; ");
  }
  // How the status was read, when it was not the first form: the refusals
  // and the form that answered, so a count can be checked against the
  // portal's View report before it is trusted.
  function shapeNote(model) {
    // no form answered: the failure summary says so; there is nothing to compare
    if (!model || !model.shape || !(model.shapeTried || []).length) return "";
    const tried = model.shapeTried.map((t) => `${SHAPE_LABEL[t.shape] || t.shape}: ${t.error}`).join("; ");
    const via = model.shape === "action" ? `the status was read through ${R_ACTION}, the documented report action T12's device read uses` : `the status was read as a ${SHAPE_LABEL[model.shape]}`;
    return `Intune refused the check-in status report as first asked (${tried}) — ${via}. Compare one policy's counts with the portal's View report before trusting the totals.`;
  }

  // ---------------------------------------------------------------- join --
  const worstOf = (states) => states.reduce((w, s) => (STATE[s] && (!w || STATE[s].rank > STATE[w].rank) ? s : w), null);
  const newest = (rows) => rows.slice().sort((a, b) => (Date.parse(b.when || "") || 0) - (Date.parse(a.when || "") || 0))[0];
  const emptyCounts = () => ({ expected: 0, landed: 0, pending: 0, none: 0, error: 0, conflict: 0, na: 0, unreadable: 0, excluded: 0, extra: 0, leak: 0, staleEx: 0, held: 0 });
  const bump = (c, state) => { if (state in c) c[state]++; };

  function join(sc, members, managed, status, opts) {
    const o = opts || {};
    const now = o.now || Date.now();
    const byIntune = new Map(), byAad = new Map();
    for (const m of managed || []) { if (m.id) byIntune.set(lc(m.id), m); if (m.azureADDeviceId) byAad.set(lc(m.azureADDeviceId), m); }
    // the members, once each, with every region they are in
    const devices = new Map(), users = new Map();
    for (const w of sc.deviceWaves) {
      for (const d of members.devices.get(lc(w.id)) || []) {
        const m = d.deviceId ? byAad.get(d.deviceId) : null;
        const key = m ? `d:${lc(m.id)}` : `aad:${d.deviceId || d.id}`;
        let e = devices.get(key);
        if (!e) {
          e = { key, kind: "device", name: (m && m.deviceName) || d.name || d.deviceId, upn: lc((m && m.userPrincipalName) || ""), intuneId: m ? lc(m.id) : "", aadId: d.deviceId, objectId: d.id,
            lastSync: (m && m.lastSyncDateTime) || null, inIntune: !!m, regions: new Set(), waves: new Set(), per: new Map() };
          devices.set(key, e);
        }
        e.regions.add(w.region); e.waves.add(w.name);
      }
    }
    for (const w of sc.userWaves) {
      for (const u of members.users.get(lc(w.id)) || []) {
        const key = `u:${lc(u.upn) || u.id}`;
        let e = users.get(key);
        if (!e) {
          e = { key, kind: "user", name: u.upn || u.id, upn: lc(u.upn), userId: u.id, regions: new Set(), waves: new Set(), per: new Map() };
          users.set(key, e);
        }
        e.regions.add(w.region); e.waves.add(w.name);
      }
    }
    const regions = [...new Set(sc.policies.flatMap((p) => p.regions))];
    // 10697 (Mihai, 8 Oct, Hans Katsman: "user is in the exclusion list, but
    // also in the landed in the pilot list and gets policies"): the ⊘
    // exclusion groups' members, handed in by the caller — a member in the
    // exclusion group of their kind that a policy does NOT exclude is REACHED
    // THOUGH EXCLUDED (the policy's assignments lack the group): a leak, said
    // per policy with the group's name. And a member a policy does exclude
    // for whom Intune still reports a state is said with the time: the
    // device has to check in before the status goes.
    const X = o.exclusion || null;
    const inExclusion = (e) => !X ? false : e.kind === "device" ? !!((e.objectId && X.devices.has(lc(e.objectId))) || (e.aadId && X.deviceIds.has(lc(e.aadId)))) : !!((e.userId && X.users.has(lc(e.userId))) || (e.upn && X.upns.has(lc(e.upn))));
    const exName = (e) => X ? (e.kind === "device" ? X.names.device : X.names.user) || "the ⊘ exclusion group" : "";
    // 10702 (one hold-back): the ⏸ hold-back pair's members, the same shape —
    // a held-back member that is still a wave member has a route into the
    // wave the hold-back did not cover (a direct membership, a group nested
    // deeper): reached though held back, said per policy with the group
    const H = o.holdBack || null;
    const inHold = (e) => !H ? false : e.kind === "device" ? !!((e.objectId && H.devices.has(lc(e.objectId))) || (e.aadId && H.deviceIds.has(lc(e.aadId)))) : !!((e.userId && H.users.has(lc(e.userId))) || (e.upn && H.upns.has(lc(e.upn))));
    const holdName = (e) => H ? (e.kind === "device" ? H.names.device : H.names.user) || "the ⏸ hold-back group" : "";
    const xb = members.excludedBy || new Map();
    const excludedFor = (e, p) => p.excludes.some((g) => { const x = xb.get(lc(g)); return !!x && (e.kind === "device" ? (x.devices.has(e.aadId) || x.deviceIds.has(e.objectId)) : (x.users.has(e.upn) || x.userIds.has(lc(e.userId)))); });
    const policies = sc.policies.map((p) => {
      const cells = new Map(regions.map((r) => [r, emptyCounts()]));
      const total = emptyCounts();
      const failed = status.failed.get(p.id) || null;
      const rows = status.byPolicy.get(p.id) || [];
      const seenDev = new Set(), seenUpn = new Set();
      const want = new Set(p.regions);
      const inRegion = (e) => [...e.regions].some((r) => want.has(r));
      const count = (e, state) => {
        for (const r of e.regions) if (want.has(r)) bump(cells.get(r), state === "excluded" ? "excluded" : state);
        bump(total, state === "excluded" ? "excluded" : state);
        if (state !== "excluded") { for (const r of e.regions) if (want.has(r)) cells.get(r).expected++; total.expected++; }
      };
      const put = (e, st) => {
        // a member the policy reaches although the ⊘ group holds them
        if (st.state !== "excluded" && inExclusion(e)) { st.leak = exName(e); total.leak++; for (const r of e.regions) if (want.has(r)) cells.get(r).leak++; }
        else if (st.state !== "excluded" && inHold(e)) { st.leak = holdName(e); st.held = true; total.leak++; total.held++; for (const r of e.regions) if (want.has(r)) { cells.get(r).leak++; cells.get(r).held++; } }
        // excluded by the policy, yet a state is still reported
        if (st.state === "excluded" && st.rows && st.rows.length) { const n = newest(st.rows); if (n.state !== "na") { st.stale = { state: n.state, when: n.when }; total.staleEx++; } }
        e.per.set(p.key, st); count(e, st.state);
      };
      if (p.audience !== "user") {
        for (const e of devices.values()) {
          if (!inRegion(e)) continue;
          const mine = e.intuneId ? rows.filter((r) => r.intuneId === e.intuneId) : [];
          if (excludedFor(e, p)) { mine.forEach((r) => seenDev.add(r.intuneId)); put(e, { state: "excluded", rows: mine }); continue; }
          if (failed) { put(e, { state: "unreadable", word: "report failed", rows: [] }); continue; }
          mine.forEach((r) => seenDev.add(r.intuneId));
          if (!mine.length) { put(e, { state: "none", rows: [], inIntune: e.inIntune }); continue; }
          const n = newest(mine);
          put(e, { state: worstOf(mine.map((r) => r.state)) || n.state, word: n.word, code: n.code, when: n.when, rows: mine });
        }
      }
      if (p.audience === "user" || p.audience === "both") {
        for (const e of users.values()) {
          if (!inRegion(e)) continue;
          const mine = e.upn ? rows.filter((r) => r.upn === e.upn) : [];
          if (excludedFor(e, p)) { mine.forEach((r) => seenUpn.add(r.upn)); put(e, { state: "excluded", rows: mine }); continue; }
          if (failed) { put(e, { state: "unreadable", word: "report failed", rows: [] }); continue; }
          mine.forEach((r) => seenUpn.add(r.upn));
          if (!mine.length) { put(e, { state: "none", rows: [] }); continue; }
          const n = newest(mine);
          put(e, { state: worstOf(mine.map((r) => r.state)) || n.state, word: n.word, code: n.code, when: n.when, rows: mine, devices: mine.length });
        }
      }
      // reported, but in no wave the policy includes
      const extras = rows.filter((r) => {
        const devKnown = seenDev.has(r.intuneId), upnKnown = seenUpn.has(r.upn);
        if (p.audience === "user") return !upnKnown;
        if (p.audience === "both") return !devKnown && !upnKnown;
        return !devKnown;
      });
      total.extra = extras.length;
      return { P: p.P, key: p.key, id: p.id, name: p.name, audience: p.audience, regions: p.regions, waves: p.waves, tenantWide: p.tenantWide, filtered: p.filtered, assigned: p.assigned,
        cells, total, failed, extras, reported: rows.length };
    });
    const list = [...devices.values(), ...users.values()].map((e) => {
      const states = [...e.per.values()].map((s) => s.state).filter((s) => s !== "excluded");
      e.worst = worstOf(states);
      e.leaks = [...e.per.values()].filter((s) => s.leak).length;
      e.staleEx = [...e.per.values()].filter((s) => s.stale).length;
      e.problems = states.filter((s) => STATE[s] && STATE[s].problem).length + e.leaks + e.staleEx;
      e.landed = states.filter((s) => s === "landed").length;
      e.regionList = [...e.regions].sort();
      return e;
    });
    const summary = emptyCounts();
    for (const p of policies) for (const k of Object.keys(summary)) summary[k] += p.total[k];
    summary.problems = summary.pending + summary.none + summary.error + summary.conflict + summary.unreadable + summary.leak + summary.staleEx;
    summary.members = list.length;
    summary.devices = devices.size;
    summary.users = users.size;
    const failed = [...status.failed.entries()].map(([id, error]) => ({ id, error }));
    return { at: status.at || now, regions, policies, members: list, summary, codeBased: !!status.codeBased, failed,
      failedText: failedSummary(failed, policies, policies.filter((p) => p.assigned).length),
      shape: status.shape || null, shapeTried: status.tried || [],
      memberErrors: members.errors || [], readRows: status.rows || 0 };
  }

  // Conflicts explained (T12's setting-level read, and the ⚔️ pairs): per
  // (policy key, Intune device id) the settings Intune names, and the old
  // policies of that new policy's pairs the device is in conflict on too.
  function explainConflicts(model, read, pairs) {
    if (!model || !read) return model;
    const byPolDev = new Map();
    const k = (pid, did) => `${lc(pid)}|${lc(did)}`;
    for (const s of read.settingRows || []) { const key = k(s.policyId, s.deviceId); if (!byPolDev.has(key)) byPolDev.set(key, { settings: [], others: [] }); if (s.name && !byPolDev.get(key).settings.includes(s.name)) byPolDev.get(key).settings.push(s.name); }
    const devConf = new Set((read.deviceRows || []).map((r) => k(r.policyId, r.deviceId)));
    for (const p of model.policies) {
      const olds = (pairs || []).filter((pr) => pr.N && lc(pr.N.id) === p.id && pr.type !== "duplicate").map((pr) => pr.O);
      for (const e of model.members) {
        const st = e.per.get(p.key);
        if (!st || st.state !== "conflict") continue;
        const ids = e.kind === "device" ? [e.intuneId] : (st.rows || []).map((r) => r.intuneId);
        const settings = new Set(), others = new Set();
        for (const id of ids) {
          const x = byPolDev.get(k(p.id, id));
          if (x) x.settings.forEach((s) => settings.add(s));
          for (const O of olds) if (devConf.has(k(O.id, id))) others.add(O.name);
        }
        st.settings = [...settings]; st.others = [...others];
      }
    }
    model.explained = true;
    return model;
  }

  // --------------------------------------------------------------- views --
  // One line per member saying what to make of it.
  function verdict(e, model) {
    const probs = [];
    for (const p of model.policies) {
      const st = e.per.get(p.key);
      if (!st) continue;
      if (st.leak && st.held) probs.push(`⏸ ${p.name} — in ${st.leak} (held back), yet still a member of the wave: a route into it is still open — ⏸ Hold-back names the routes; reached, ${STATE[st.state] ? STATE[st.state].label : st.state}${st.when ? ` at ${st.when}` : ""}`);
      else if (st.leak) probs.push(`⊘ ${p.name} — in ${st.leak}, but the policy does not exclude that group: reached, ${STATE[st.state] ? STATE[st.state].label : st.state}${st.when ? ` at ${st.when}` : ""}`);
      if (st.stale) probs.push(`⊘ ${p.name} — excluded, yet Intune still reports ${STATE[st.stale.state] ? STATE[st.stale.state].label : st.stale.state}${st.stale.when ? ` at ${st.stale.when}` : ""}: the device has to check in before the status goes; if it stays, check the assignment`);
      if (!STATE[st.state] || !STATE[st.state].problem) continue;
      const short = p.name;
      if (st.state === "conflict") probs.push(`⚔ ${short}${st.settings && st.settings.length ? ` — ${st.settings.join(", ")}` : ""}${st.others && st.others.length ? ` — also in conflict on ${st.others.join(", ")}` : ""}`);
      else if (st.state === "error") probs.push(`✕ ${short}${st.word && !/^error$/i.test(st.word) ? ` — ${st.word}` : ""}`);
      else if (st.state === "pending") probs.push(`… ${short} — pending, the device has not checked in for it yet`);
      else if (st.state === "none") probs.push(`◌ ${short} — no status${e.kind === "device" && !e.inIntune ? "; the device is in the group but not in Intune" : ""}${p.filtered ? "; the assignment carries a filter" : ""}`);
      else if (st.state === "unreadable") probs.push(`? ${short} — ${st.word || "status unreadable"}`);
    }
    const excl = [...e.per.values()].filter((s) => s.state === "excluded").length;
    if (probs.length && (e.leaks || e.staleEx) && !e.worst) return { state: "excluded", text: probs.join(" · ") };
    if (!probs.length) {
      if (excl && excl === e.per.size) return { state: "excluded", text: "excluded from every new policy it would get (⊘)" };
      const n = e.per.size - excl;
      return { state: "landed", text: n ? `landed — ${plural(n, "policy", "policies")} reported Succeeded${excl ? `, ${excl} excluded` : ""}` : "nothing expected" };
    }
    return { state: e.worst, text: probs.join(" · ") };
  }
  function memberRows(model, opts) {
    const o = opts || {};
    const q = lc(o.q || "").trim();
    let list = model.members.filter((e) => !o.region || e.regions.has(o.region));
    if (o.filter && o.filter !== "all") {
      if (o.filter === "problems") list = list.filter((e) => e.problems > 0);
      else if (o.filter === "leak") list = list.filter((e) => e.leaks > 0 || e.staleEx > 0);
      else if (o.filter === "excluded") list = list.filter((e) => [...e.per.values()].some((s) => s.state === "excluded"));
      else list = list.filter((e) => [...e.per.values()].some((s) => s.state === o.filter));
    }
    if (q) list = list.filter((e) => lc(e.name).includes(q) || lc(e.upn).includes(q));
    return list.sort((a, b) => (b.problems - a.problems) || ((STATE[b.worst] ? STATE[b.worst].rank : -1) - (STATE[a.worst] ? STATE[a.worst].rank : -1)) || String(a.name).localeCompare(String(b.name)));
  }
  function csv(model) {
    const rows = [["Member", "Kind", "User", "Regions", "Last check-in", "Policy", "Scope", "State", "Intune says", "Last report", "Detail"]];
    for (const e of model.members) {
      for (const p of model.policies) {
        const st = e.per.get(p.key);
        if (!st) continue;
        const detail = st.state === "conflict" ? [(st.settings || []).join("; "), (st.others || []).length ? `also on ${(st.others || []).join("; ")}` : ""].filter(Boolean).join(" — ") : st.state === "none" && e.kind === "device" && !e.inIntune ? "not in Intune" : "";
        rows.push([e.name, e.kind, e.upn || "", e.regionList.join(" "), e.lastSync || "", p.name, p.audience || "", STATE[st.state] ? STATE[st.state].label : st.state, st.word || "", st.when || "", detail]);
      }
    }
    for (const p of model.policies) for (const r of p.extras) rows.push([r.name || r.intuneId, "device", r.upn, "", "", p.name, p.audience || "", "extra (not a wave member)", r.word || "", r.when || "", ""]);
    return toCsv(rows);
  }

  return { REPORT, R_ACTION, SHAPES, SHAPE_LABEL, SELECT, STATE, ORDER, CODE, stateOf, wordState, scope, readMembers, readManaged, readPolicyStatus, probeStatus, readStatus, failedSummary, shapeNote, join, explainConflicts, verdict, memberRows, csv, worstOf };
})();

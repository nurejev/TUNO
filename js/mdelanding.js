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

  // One policy's check-in status, through the cached-report API: create the
  // configuration (the report name, a PolicyId filter, the columns), wait
  // for it to complete, then page getCachedReport.
  const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function readPolicyStatus(policyId, opts) {
    const o = opts || {};
    const base = `${Graph.BETA}/deviceManagement/reports/`;
    const id = `${REPORT}_${uuid()}`;
    const body = { id, reportName: REPORT, filter: `(PolicyId eq '${String(policyId).replace(/'/g, "''")}')`, select: SELECT, orderBy: [], metadata: "" };
    let conf = await Graph.post(base + "cachedReportConfigurations", body, { scopes: o.scopes, retry: true });
    const cid = (conf && conf.id) || id;
    let status = lc(conf && conf.status);
    for (let i = 0; status !== "completed" && i < POLL_MAX; i++) {
      if (status === "failed") throw new Error(`Intune could not build the status report (${cid}).`);
      await sleep(o.pollMs !== undefined ? o.pollMs : POLL_MS);
      conf = await Graph.get(`${base}cachedReportConfigurations('${enc(cid)}')`, { scopes: o.scopes, retry: true });
      status = lc(conf && conf.status);
    }
    if (status !== "completed") throw new Error(`The status report did not complete in time (${cid}).`);
    const rows = [];
    let total = null;
    for (let skip = 0, pages = 0; ; skip += PAGE) {
      const resp = await Graph.post(base + "getCachedReport", { id: cid, skip, top: PAGE, search: "", orderBy: [], select: SELECT }, { scopes: o.scopes, retry: true });
      const page = ConflictDevices.rowsOf(resp);
      rows.push(...page);
      if (resp && typeof resp === "object" && Number.isFinite(resp.TotalRowCount)) total = resp.TotalRowCount;
      if (!page.length || (total !== null ? rows.length >= total : page.length < PAGE)) break;
      if (++pages > 200) throw new Error("Stopped after 200 pages of the status report.");
    }
    return rows;
  }
  // Every new policy's rows, shaped: { policyId, intuneId, name, upn, state,
  // word, code, byCode, when, filters }. A policy whose report failed is
  // listed in `failed`, never counted as "nothing reported".
  async function readStatus(policies, opts) {
    const o = opts || {};
    const say = (m) => { if (typeof o.onStatus === "function") o.onStatus(m); };
    const pick = ConflictDevices.pick;
    const out = { byPolicy: new Map(), failed: new Map(), rows: 0, codeBased: false, at: Date.now() };
    const list = (policies || []).filter((p) => p.assigned);
    let done = 0;
    say(`Reading Intune's check-in status — 0 of ${list.length} policies…`);
    const res = await Graph.pool(list, async (p) => {
      const rows = await readPolicyStatus(p.id, { scopes: o.scopes, pollMs: o.pollMs });
      say(`Reading Intune's check-in status — ${++done} of ${list.length} policies…`);
      return rows;
    }, 3);
    res.forEach((r, i) => {
      const p = list[i];
      if (r.error) { out.failed.set(p.id, (r.error && r.error.message) || String(r.error)); return; }
      const shaped = (r.value || []).map((row) => {
        const st = stateOf(row);
        if (st.byCode) out.codeBased = true;
        return { policyId: p.id, intuneId: lc(pick(row, ["IntuneDeviceId", "DeviceId"]) || ""), name: String(pick(row, ["DeviceName"]) || ""),
          upn: lc(pick(row, ["UPN", "UserPrincipalName"]) || ""), state: st.state, word: st.word, code: st.code, byCode: st.byCode,
          when: String(pick(row, ["PspdpuLastModifiedTimeUtc", "LastModifiedDateTime"]) || ""), filters: String(pick(row, ["AssignmentFilterIds"]) || "") };
      });
      out.rows += shaped.length;
      out.byPolicy.set(p.id, shaped);
    });
    say("");
    return out;
  }

  // ---------------------------------------------------------------- join --
  const worstOf = (states) => states.reduce((w, s) => (STATE[s] && (!w || STATE[s].rank > STATE[w].rank) ? s : w), null);
  const newest = (rows) => rows.slice().sort((a, b) => (Date.parse(b.when || "") || 0) - (Date.parse(a.when || "") || 0))[0];
  const emptyCounts = () => ({ expected: 0, landed: 0, pending: 0, none: 0, error: 0, conflict: 0, na: 0, unreadable: 0, excluded: 0, extra: 0 });
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
      const put = (e, st) => { e.per.set(p.key, st); count(e, st.state); };
      if (p.audience !== "user") {
        for (const e of devices.values()) {
          if (!inRegion(e)) continue;
          if (excludedFor(e, p)) { put(e, { state: "excluded", rows: [] }); continue; }
          if (failed) { put(e, { state: "unreadable", word: "report failed", rows: [] }); continue; }
          const mine = e.intuneId ? rows.filter((r) => r.intuneId === e.intuneId) : [];
          mine.forEach((r) => seenDev.add(r.intuneId));
          if (!mine.length) { put(e, { state: "none", rows: [], inIntune: e.inIntune }); continue; }
          const n = newest(mine);
          put(e, { state: worstOf(mine.map((r) => r.state)) || n.state, word: n.word, code: n.code, when: n.when, rows: mine });
        }
      }
      if (p.audience === "user" || p.audience === "both") {
        for (const e of users.values()) {
          if (!inRegion(e)) continue;
          if (excludedFor(e, p)) { put(e, { state: "excluded", rows: [] }); continue; }
          if (failed) { put(e, { state: "unreadable", word: "report failed", rows: [] }); continue; }
          const mine = e.upn ? rows.filter((r) => r.upn === e.upn) : [];
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
      e.problems = states.filter((s) => STATE[s] && STATE[s].problem).length;
      e.landed = states.filter((s) => s === "landed").length;
      e.regionList = [...e.regions].sort();
      return e;
    });
    const summary = emptyCounts();
    for (const p of policies) for (const k of Object.keys(summary)) summary[k] += p.total[k];
    summary.problems = summary.pending + summary.none + summary.error + summary.conflict + summary.unreadable;
    summary.members = list.length;
    summary.devices = devices.size;
    summary.users = users.size;
    return { at: status.at || now, regions, policies, members: list, summary, codeBased: !!status.codeBased, failed: [...status.failed.entries()].map(([id, error]) => ({ id, error })),
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
      if (!st || !STATE[st.state] || !STATE[st.state].problem) continue;
      const short = p.name;
      if (st.state === "conflict") probs.push(`⚔ ${short}${st.settings && st.settings.length ? ` — ${st.settings.join(", ")}` : ""}${st.others && st.others.length ? ` — also in conflict on ${st.others.join(", ")}` : ""}`);
      else if (st.state === "error") probs.push(`✕ ${short}${st.word && !/^error$/i.test(st.word) ? ` — ${st.word}` : ""}`);
      else if (st.state === "pending") probs.push(`… ${short} — pending, the device has not checked in for it yet`);
      else if (st.state === "none") probs.push(`◌ ${short} — no status${e.kind === "device" && !e.inIntune ? "; the device is in the group but not in Intune" : ""}${p.filtered ? "; the assignment carries a filter" : ""}`);
      else if (st.state === "unreadable") probs.push(`? ${short} — ${st.word || "status unreadable"}`);
    }
    const excl = [...e.per.values()].filter((s) => s.state === "excluded").length;
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

  return { REPORT, SELECT, STATE, ORDER, CODE, stateOf, wordState, scope, readMembers, readManaged, readPolicyStatus, readStatus, join, explainConflicts, verdict, memberRows, csv, worstOf };
})();

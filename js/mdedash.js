// ======================================================================
// T28 — 📊 DASHBOARD (build 10703). Mihai, 10 Oct: "need a dashboard for
// the t28 mde roll out tool. with piecharts or other visual repesentations
// of the rollout status … how many users and devices are onboarded, the
// evedence how many are reportting the config status … which policies are
// in conflic with each other … sometimes intune give a confic, but doen
// mention the 2 polcies in confic, the tool than needs to find and match it
// self then based on the settings" — option A off the mockup canvas "T28 ·
// Rollout dashboard" ("i want option A"), and "make the dashboard easy
// exportable to html".
//
// FOUR QUESTIONS, ONE PAGE, each a donut over the project's waves:
//   ① MDE onboarded · devices — the device waves' members (transitive, -vdi-
//     left out) against Defender's device inventory (DeviceInfo, 30 days,
//     matched on the Entra device id, else the short name): Onboarded · Can
//     be onboarded · Not seen by Defender · Unsupported / insufficient info.
//   ② MDE onboarded · users — the user waves' members and their Windows
//     devices by Intune primary user: every device onboarded · some · none ·
//     no Windows device.
//   ③ Evidence — of the devices in a live wave (one a new policy includes),
//     how many REPORT a result for every new policy they should get, for
//     some, for none (Intune's check-in status, the 📡 Verification read).
//     Pending and no status are waiting, not results.
//   ④ Results — the worst state of each device that reported anything:
//     conflict > error > pending > landed (not applicable is landed).
// A table per wave puts the same four side by side, and the pairs of
// policies in conflict follow, each with HOW T28 KNOWS:
//   named      Intune reports the conflict on BOTH policies on the device
//   matched    Intune reports it on one policy (or on a collection — the ASR
//              rules) and names no partner: the one policy that sets one of
//              its settings — per ASR RULE — to another value and shares a
//              target is the partner. Settings decide; names never do.
//   candidates more than one such policy — listed, not chosen
//   predicted  no device has reported it yet; the settings differ and the
//              two reach (or will reach) the same wave
//   unresolved Intune reports a conflict no Intune policy explains (Defender
//              security settings management, GPO, co-management …)
// New against new is compared too (two new policies setting one ASR rule to
// Off and Block), shown only where the two share a target or a device says so
// — the update rings differ on purpose and never meet.
//
// Reads: ONE new read — the waves' members (every wave, not only the live
// ones) and Defender's device inventory (one advanced-hunting query,
// ThreatHunting.Read.All, already T28's for the logon lookup). Everything
// else is what T28 already holds: the policy model and its pairs, 📡's
// check-in status, the 🖥 device conflict read. Nothing here writes.
//
// The page is DOM-free HTML so the same text is the screen and the export:
// html(model, { app: true }) in T28, exportHtml(model, meta) a self-contained
// file — inline CSS, light and dark, no script — for people without TUNO.
// ======================================================================
const MdeDash = (() => {
  "use strict";
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : (many || one + "s")}`;
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const pct = (n, of) => { if (!of) return "—"; const p = (n / of) * 100; return p > 0 && p < 0.5 ? "<1%" : `${Math.round(p)}%`; };
  const csvCell = (s) => { const v = String(s == null ? "" : s); return /[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const short = (name) => lc(String(name || "").split(".")[0]);
  const isAvd = (name) => (typeof MdeMembers !== "undefined" && MdeMembers.isAvdName ? MdeMembers.isAvdName(name) : /-vdi-/i.test(String(name || "")));

  // The four answers' states, in donut order. `color` names a --dash-*
  // variable (css/t28v2.css, and the export's own <style>); a state is
  // never said by colour alone — the glyph and the label ride along.
  const ONB = [
    { key: "onboarded", label: "Onboarded", color: "ok", glyph: "✓" },
    { key: "can", label: "Can be onboarded", color: "warn", glyph: "…" },
    { key: "notseen", label: "Not seen by Defender", color: "err", glyph: "✕" },
    { key: "unsupported", label: "Unsupported", color: "none", glyph: "◌" },
  ];
  const USR = [
    { key: "all", label: "Every device onboarded", color: "ok", glyph: "✓" },
    { key: "some", label: "Some devices", color: "warn", glyph: "…" },
    { key: "none", label: "No device onboarded", color: "err", glyph: "✕" },
    { key: "nodevice", label: "No Windows device", color: "none", glyph: "◌" },
  ];
  const REP = [
    { key: "all", label: "Reports every new policy", color: "ok", glyph: "✓" },
    { key: "some", label: "Reports some", color: "warn", glyph: "…" },
    { key: "none", label: "Nothing reported yet", color: "none", glyph: "◌" },
  ];
  const RES = [
    { key: "landed", label: "Landed", color: "ok", glyph: "✓" },
    { key: "pending", label: "Pending", color: "warn", glyph: "…" },
    { key: "error", label: "Error", color: "err", glyph: "✕" },
    { key: "conflict", label: "Conflict", color: "conf", glyph: "≠" },
  ];
  const TIER = {
    named: { label: "Named by Intune", why: "both policies report the conflict on the device" },
    matched: { label: "Matched by T28", why: "Intune names no partner — the one policy that sets the setting differently and shares a target" },
    candidates: { label: "Candidates", why: "more than one policy sets the setting differently — listed, not chosen" },
    predicted: { label: "Predicted", why: "no device has reported it yet; the settings differ and the two reach (or will reach) the same wave" },
    unresolved: { label: "Unresolved", why: "Intune reports a conflict no Intune policy explains" },
  };
  const VERDICT_WORD = {
    can: "shared targets", may: "different groups — may share members", staged: "the new policy is not assigned yet",
    resolved: "excluded already", idle: "one side reaches nobody",
  };

  // ------------------------------------------------- the Defender read --
  // One row per Defender device that is Windows 10/11, its newest state in
  // 30 days (advanced hunting keeps 30). Matched to a wave device on the
  // Entra device id; a device Defender knows without one (discovered, not
  // joined) by its short name.
  function onboardingKql(days) {
    const d = days || 30;
    return [
      "DeviceInfo",
      `| where Timestamp > ago(${d}d)`,
      '| where OSPlatform startswith "Windows1"',
      "| summarize arg_max(Timestamp, DeviceName, AadDeviceId, OnboardingStatus, SensorHealthState, OSPlatform) by DeviceId",
      "| project DeviceId, DeviceName, AadDeviceId, OnboardingStatus, SensorHealthState, OSPlatform, LastSeen = Timestamp",
    ].join("\n");
  }
  function statusOf(row) {
    const s = lc(row && row.OnboardingStatus).replace(/[^a-z]/g, "");
    if (s === "onboarded") return "onboarded";
    if (s === "canbeonboarded") return "can";
    return "unsupported";   // Unsupported, Insufficient info, anything new
  }
  // rows -> { byAad, byName, rows } ; the newest row wins per key
  function defenderIndex(rows) {
    const byAad = new Map(), byName = new Map();
    const newer = (a, b) => !a || String(b.LastSeen || "") > String(a.LastSeen || "");
    for (const r of rows || []) {
      const aad = lc(r.AadDeviceId || "");
      if (aad) { if (newer(byAad.get(aad), r)) byAad.set(aad, r); }
      else { const n = short(r.DeviceName); if (n && newer(byName.get(n), r)) byName.set(n, r); }
    }
    return { byAad, byName, rows: (rows || []).length };
  }
  async function readDefender(opts) {
    const o = opts || {};
    if (typeof o.onStatus === "function") o.onStatus("Asking Defender for its device inventory…");
    const d = o.days || 30;
    const r = await Graph.post("/security/runHuntingQuery", { Query: onboardingKql(d), Timespan: `P${d}D` }, { scopes: Graph.SCOPES.hunting });
    return defenderIndex((r && r.results) || []);
  }

  // ------------------------------------------------------- the waves --
  // Every existing wave group, as MdeLanding.readMembers takes them — the
  // live waves and the ones not started, so ① and ② cover the project.
  function waveScope(waveRows) {
    const w = (waveRows || []).filter((x) => x.role === "wave" && x.exists && x.id);
    const one = (x) => ({ id: lc(x.id), name: x.name, region: x.region });
    return { userWaves: w.filter((x) => x.audience === "user").map(one), deviceWaves: w.filter((x) => x.audience === "device").map(one), excludeGroups: [], policies: [] };
  }
  async function readWaves(waveRows, opts) {
    return MdeLanding.readMembers(waveScope(waveRows), opts);
  }
  // region -> distinct new policies that include one of its wave groups
  function liveOf(waveRows) {
    const out = new Map();
    for (const w of waveRows || []) {
      if (w.role !== "wave" || !w.exists) continue;
      const s = out.get(w.region) || new Set();
      for (const N of w.newIncluding || []) s.add(N.key || N.id);
      out.set(w.region, s);
    }
    return new Map([...out.entries()].map(([r, s]) => [r, s.size]));
  }

  // ------------------------------------------- new against new (10703) --
  // MdeRollout.compare pairs every new policy with every old one; two NEW
  // policies setting one setting (one ASR rule) differently are a conflict
  // inside the baseline itself. Same keys, same values as compare uses.
  function newPairs(newP) {
    const out = [];
    const cat = (newP || []).filter((P) => P.format === "catalog" && P.settings && P.settings.size);
    for (let i = 0; i < cat.length; i++) for (let j = i + 1; j < cat.length; j++) {
      const A = cat[i], B = cat[j], diffs = [], sames = [];
      const [small, big] = A.settings.size <= B.settings.size ? [A.settings, B.settings] : [B.settings, A.settings];
      for (const k of small.keys()) {
        if (!big.has(k)) continue;
        const a = A.settings.get(k), b = B.settings.get(k);
        const row = { key: k, name: a.name || b.name, aValue: a.value, bValue: b.value, aDisplay: a.display, bDisplay: b.display };
        (a.value === b.value ? sames : diffs).push(row);
      }
      if (!diffs.length && !sames.length) continue;
      let reach;
      if (A.reach.none || B.reach.none) reach = { verdict: "staged", why: VERDICT_WORD.staged };
      else { const v = Conflict.verdictPair(A.reach, B.reach); reach = { verdict: v.verdict === "cannot" ? "idle" : v.verdict, why: v.reason }; }
      out.push({ id: `${A.key}~${B.key}`, A, B, diffs, sames, type: diffs.length ? "conflict" : "duplicate", reach });
    }
    return out;
  }

  // ------------------------------------------------------------ model --
  // input: {
  //   regions      the project's regions, in the rules' order
  //   waves        MdeLanding.readMembers over waveScope() — or null (not read)
  //   defender     defenderIndex() — or null (not read / refused)
  //   managed      Intune managed devices (id, deviceName, userId,
  //                userPrincipalName, azureADDeviceId, lastSyncDateTime,
  //                operatingSystem) — or null
  //   landing      MdeLanding.join's model — or null
  //   live         liveOf(waveRows)
  //   pairs        MdeRollout.compare's pairs (new × old)
  //   newPairs     newPairs(newP)
  //   newIds       lc ids of the new policies
  //   devIdx       MdeRollout.deviceIndex(ConflictDevices.read) — or null
  //   held         { users, devices } in the ⏸ hold-back — or null
  // }
  // opt: { region } — null for every wave
  function model(input, opt) {
    const I = input || {}, o = opt || {};
    const regions = (I.regions || []).slice();
    const region = o.region && regions.includes(o.region) ? o.region : null;
    const base = population(I);
    const blocks = (r) => ({ devices: devicesBlock(I, base, r), users: usersBlock(I, base, r), evidence: evidenceBlock(I, r), results: resultsBlock(I, r) });
    const top = blocks(region);
    const waves = regions.map((r) => Object.assign({ region: r, live: (I.live && I.live.get(r)) || 0 }, blocks(r)));
    return Object.assign({ region, regions, waves, conflicts: conflictModel(I, base, region), held: I.held || null,
      known: { waves: !!I.waves, defender: !!I.defender, managed: !!I.managed, landing: !!I.landing, devIdx: !!I.devIdx } }, top);
  }

  // the wave members, once each, with the regions they are in
  function population(I) {
    const devices = new Map(), users = new Map(), avd = new Set();
    const W = I.waves;
    if (W) {
      for (const [wid, list] of W.devices || new Map()) {
        const region = regionOfWave(I, wid);
        for (const d of list || []) {
          if (isAvd(d.name)) { avd.add(lc(d.deviceId || d.id)); continue; }
          const k = lc(d.deviceId || d.id);
          let e = devices.get(k);
          if (!e) devices.set(k, e = { key: k, aad: lc(d.deviceId || ""), objectId: lc(d.id), name: d.name || d.deviceId || d.id, regions: new Set() });
          if (region) e.regions.add(region);
        }
      }
      for (const [wid, list] of W.users || new Map()) {
        const region = regionOfWave(I, wid);
        for (const u of list || []) {
          const k = lc(u.id);
          let e = users.get(k);
          if (!e) users.set(k, e = { key: k, id: lc(u.id), upn: u.upn || u.id, regions: new Set() });
          if (region) e.regions.add(region);
        }
      }
    }
    const managedByAad = new Map(), managedById = new Map(), devicesOfUser = new Map();
    for (const m of I.managed || []) {
      if (m.id) managedById.set(lc(m.id), m);
      if (m.azureADDeviceId) managedByAad.set(lc(m.azureADDeviceId), m);
      if (lc(m.operatingSystem) !== "windows" || !m.userId || isAvd(m.deviceName)) continue;
      const k = lc(m.userId);
      if (!devicesOfUser.has(k)) devicesOfUser.set(k, []);
      devicesOfUser.get(k).push(m);
    }
    // the Defender answer per wave device, and its regions by Intune id
    // (the conflict read names devices by their Intune id)
    const regionsByIntune = new Map();
    for (const e of devices.values()) {
      e.row = defRow(I.defender, e.aad, e.name);
      e.status = I.defender ? (e.row ? statusOf(e.row) : "notseen") : null;
      e.silent = e.status === "onboarded" && !!e.row && !!e.row.SensorHealthState && !/^active$/i.test(String(e.row.SensorHealthState));
      const m = e.aad ? managedByAad.get(e.aad) : null;
      e.upn = m ? m.userPrincipalName || "" : "";
      e.lastSync = m ? m.lastSyncDateTime || null : null;
      if (m && m.id) regionsByIntune.set(lc(m.id), e.regions);
    }
    for (const e of (I.landing && I.landing.members) || []) if (e.kind === "device" && e.intuneId && !regionsByIntune.has(e.intuneId)) regionsByIntune.set(e.intuneId, e.regions);
    return { devices, users, avd, managedByAad, managedById, devicesOfUser, regionsByIntune };
  }
  // waveList: waveScope()'s user and device waves, each with its region
  function regionOfWave(I, wid) {
    const w = (I.waveList || []).find((x) => lc(x.id) === lc(wid));
    return w ? w.region : "";
  }
  function defRow(D, aad, name) {
    if (!D) return null;
    return (aad && D.byAad.get(aad)) || D.byName.get(short(name)) || null;
  }
  const inRegion = (e, region) => !region || (e.regions && e.regions.has(region));
  const zero = (defs) => Object.fromEntries(defs.map((d) => [d.key, 0]));

  function devicesBlock(I, base, region) {
    const list = [...base.devices.values()].filter((e) => inRegion(e, region));
    const counts = zero(ONB);
    let silent = 0;
    if (I.defender) for (const e of list) { counts[e.status]++; if (e.silent) silent++; }
    return { known: !!I.waves && !!I.defender, wavesKnown: !!I.waves, total: list.length, counts, silent, list };
  }
  function usersBlock(I, base, region) {
    const list = [...base.users.values()].filter((e) => inRegion(e, region)).map((u) => {
      const devs = (base.devicesOfUser.get(u.id) || []).map((m) => {
        const row = defRow(I.defender, lc(m.azureADDeviceId || ""), m.deviceName);
        return { name: m.deviceName || m.id, status: I.defender ? (row ? statusOf(row) : "notseen") : null };
      });
      const on = devs.filter((d) => d.status === "onboarded").length;
      const cat = !devs.length ? "nodevice" : on === devs.length ? "all" : on ? "some" : "none";
      return Object.assign({}, u, { devs, on, cat });
    });
    const counts = zero(USR);
    const known = !!I.waves && !!I.defender && !!I.managed;
    if (known) for (const u of list) counts[u.cat]++;
    return { known, total: list.length, counts, list };
  }
  // a member's own policies: expected (not excluded), reported (a result),
  // waiting (pending, no status, unreadable), and the worst of what came back
  const RESULT = new Set(["landed", "na", "error", "conflict"]);
  function memberEvidence(e) {
    const states = [...e.per.values()].map((s) => s.state).filter((s) => s !== "excluded");
    const reported = states.filter((s) => RESULT.has(s));
    const worst = states.includes("conflict") ? "conflict" : states.includes("error") ? "error"
      : states.some((s) => !RESULT.has(s)) ? "pending" : "landed";
    return { expected: states.length, reported: reported.length, worst };
  }
  function landingMembers(I, kind, region) {
    return ((I.landing && I.landing.members) || []).filter((e) => e.kind === kind && inRegion(e, region) && !(kind === "device" && isAvd(e.name)))
      .map((e) => Object.assign({ e }, memberEvidence(e))).filter((x) => x.expected > 0);
  }
  function evidenceBlock(I, region) {
    const list = landingMembers(I, "device", region);
    const counts = zero(REP);
    for (const x of list) counts[x.reported === x.expected ? "all" : x.reported ? "some" : "none"]++;
    const users = landingMembers(I, "user", region);
    return { known: !!I.landing, total: list.length, counts, list, users: { total: users.length, all: users.filter((x) => x.reported === x.expected).length } };
  }
  function resultsBlock(I, region) {
    const list = landingMembers(I, "device", region).filter((x) => x.reported > 0);
    const counts = zero(RES);
    for (const x of list) counts[x.worst]++;
    return { known: !!I.landing, total: list.length, counts, list };
  }

  // ---------------------------------------------------------- conflicts --
  function conflictModel(I, base, region) {
    const idx = I.devIdx || null;
    const newIds = new Set((I.newIds || []).map(lc));
    const all = [];
    for (const pr of I.pairs || []) {
      if (pr.type === "duplicate") continue;
      all.push({ id: pr.id, kind: "old", a: pr.O, b: pr.N, type: pr.type, exact: pr.type === "conflict", verdict: pr.reach.verdict, why: pr.reach.why,
        rows: pr.diffs.map((d) => ({ name: d.name, a: d.oldDisplay, b: d.newDisplay })), same: pr.sames.length, common: pr.common || [] });
    }
    for (const np of I.newPairs || []) {
      if (np.type !== "conflict") continue;
      all.push({ id: np.id, kind: "new", a: np.A, b: np.B, type: "conflict", exact: true, verdict: np.reach.verdict, why: np.reach.why,
        rows: np.diffs.map((d) => ({ name: d.name, a: d.aDisplay, b: d.bDisplay })), same: np.sames.length, common: [] });
    }
    const dups = (I.pairs || []).filter((p) => p.type === "duplicate").length + (I.newPairs || []).filter((p) => p.type === "duplicate").length;
    const regionOk = (did) => !region || ((base.regionsByIntune.get(did) || new Set()).has(region));
    const bad = (id) => !!idx && (idx.failed.has(lc(id)) || idx.blind.has(lc(id)));
    const on = (id) => (idx && idx.byPolicy.get(lc(id))) || new Set();
    for (const p of all) { p.named = new Set(); p.matched = new Set(); p.cands = new Set(); p.unknown = bad(p.a.id) || bad(p.b.id); }
    if (idx) {
      for (const p of all) for (const d of on(p.a.id)) if (on(p.b.id).has(d)) p.named.add(d);
    }
    // the devices Intune reports in conflict on a NEW policy, and how each is explained
    const unresolved = new Map(), candidates = new Map(), conflicted = new Set();
    if (idx) {
      for (const nid of newIds) {
        if (bad(nid)) continue;
        const partners = all.filter((p) => (lc(p.a.id) === nid || lc(p.b.id) === nid) && /^(can|may)$/.test(p.verdict) && !p.unknown);
        for (const d of on(nid)) {
          conflicted.add(d);
          if (partners.some((p) => p.named.has(d))) continue;
          const other = (p) => (lc(p.a.id) === nid ? p.b : p.a);
          const silent = partners.filter((p) => !on(other(p).id).has(d));
          // a single partner is named only when the settings were compared one
          // by one (an other-format pair stays a candidate)
          const can = silent.filter((p) => p.verdict === "can");
          const pick = can.length === 1 && can[0].exact ? can : !can.length && silent.length === 1 && silent[0].exact ? silent : null;
          if (pick) { pick[0].matched.add(d); continue; }
          if (silent.length) { silent.forEach((p) => p.cands.add(d)); candidates.set(d, silent.map((p) => other(p).name)); continue; }
          const dv = idx.devices.get(d) || {};
          const pol = (I.policyNames && I.policyNames.get(nid)) || nid;
          const u = unresolved.get(d) || { id: d, name: dv.name || d, upn: dv.upn || "", when: dv.when || "", policies: [] };
          u.policies.push(pol); unresolved.set(d, u);
        }
      }
    }
    const inR = (set) => [...set].filter(regionOk);
    const pairs = all.map((p) => {
      const named = inR(p.named), matched = inR(p.matched).filter((d) => !p.named.has(d)), cands = inR(p.cands);
      const devices = new Set([...named, ...matched]);
      let tier = null;
      if (named.length) tier = "named";
      else if (matched.length) tier = "matched";
      else if (cands.length) tier = "candidates";
      else if (p.kind === "old" ? /^(can|may|staged)$/.test(p.verdict) : p.verdict === "can") tier = "predicted";
      return Object.assign(p, { tier, devices: devices.size, deviceIds: [...devices], namedN: named.length, matchedN: matched.length, candN: cands.length });
    }).filter((p) => p.tier).sort((x, y) => (y.devices - x.devices) || (rankTier(x.tier) - rankTier(y.tier)) || (y.rows.length - x.rows.length) || String(x.a.name).localeCompare(String(y.a.name)));
    const unres = [...unresolved.values()].filter((u) => regionOk(u.id));
    return { known: !!idx, devices: inR(conflicted).length, pairs, unresolved: unres, candidates: [...candidates.entries()].filter(([d]) => regionOk(d)).map(([d, names]) => ({ id: d, name: ((idx && idx.devices.get(d)) || {}).name || d, names })),
      duplicates: dups, devIndex: idx ? idx.devices : new Map(), summaryError: idx ? idx.summaryError : "" };
  }
  const rankTier = (t) => ["named", "matched", "candidates", "predicted"].indexOf(t);

  // ------------------------------------------------------------- render --
  // Same HTML on the screen (o.app: buttons, the open list, the folded
  // pairs) and in the export (o.app false: every list and pair as a
  // <details>, nothing to click that needs a script).
  function donutSvg(defs, counts, total, aria) {
    const segs = defs.filter((d) => counts[d.key] > 0);
    const GAP = segs.length > 1 ? 0.6 : 0;
    let start = 0;
    const arcs = segs.map((d) => {
      const L = (counts[d.key] / total) * 100, a = Math.max(L - GAP, 0.3);
      const c = `<circle cx="74" cy="74" r="56" fill="none" stroke-width="18" pathLength="100" stroke-dasharray="${a.toFixed(2)} 100" stroke-dashoffset="${(-(start + GAP / 2)).toFixed(2)}" transform="rotate(-90 74 74)" style="stroke:var(--dash-${d.color})"><title>${esc(`${d.label} · ${fmt(counts[d.key])} · ${pct(counts[d.key], total)}`)}</title></circle>`;
      start += L;
      return c;
    });
    if (!arcs.length) arcs.push('<circle cx="74" cy="74" r="56" fill="none" stroke-width="18" style="stroke:var(--dash-track)"></circle>');
    return `<svg class="dash-svg" viewBox="0 0 148 148" role="img" aria-label="${esc(aria)}">${arcs.join("")}</svg>`;
  }
  const legend = (defs, counts, total) => `<ul class="dash-leg">${defs.map((d) => `<li><i class="dash-sw" style="background:var(--dash-${d.color})"></i><span>${d.glyph} ${esc(d.label)}</span><b>${fmt(counts[d.key])}</b><small>${pct(counts[d.key], total)}</small></li>`).join("")}</ul>`;
  function bar(defs, counts, total, title) {
    if (!total) return '<span class="mini muted">—</span>';
    const spans = defs.filter((d) => counts[d.key] > 0).map((d) => `<span style="width:${((counts[d.key] / total) * 100).toFixed(1)}%;background:var(--dash-${d.color})"></span>`).join("");
    return `<div class="dash-cell"><div class="dash-bar" title="${esc(title || defs.map((d) => `${fmt(counts[d.key])} ${d.label.toLowerCase()}`).join(" · "))}">${spans}</div><b>${pct(counts[defs[0].key], total)}</b></div>`;
  }
  // a card that has its answer, or says why not
  function card(c, o) {
    const B = c.block;
    let body;
    if (B.known && B.total) {
      body = `<div class="dash-donut">${donutSvg(c.defs, B.counts, B.total, c.aria)}<div class="dash-center"><b>${pct(B.counts[c.defs[0].key], B.total)}</b><small>${esc(c.caption)}</small></div></div>${legend(c.defs, B.counts, B.total)}`;
      if (c.link && c.link.n && o.app) body += `<button type="button" class="t28-link" data-dash-list="${c.link.list}"${o.list === c.link.list ? ' aria-expanded="true"' : ""}>${esc(c.link.text)} →</button>`;
    } else if (B.known || (c.zeroKnown && c.zeroKnown(B))) {
      body = `<p class="dash-wait">${esc(c.empty)}</p>`;
    } else {
      const st = c.state || {};
      const btn = o.app && st.consent ? `<button type="button" class="btn" data-dash-consent="${esc(st.consent)}">${esc(st.consentText || "Allow this read")}</button>` : "";
      body = `<p class="dash-wait${st.bad ? " bad" : ""}">${esc(st.text || "Not read yet.")}</p>${btn}`;
    }
    return `<section class="t28-panel dash-card" aria-label="${esc(c.title)}"><h4>${esc(c.title)}</h4>${body}<p class="dash-src">${esc(c.src)}${c.extra ? ` ${esc(c.extra)}` : ""}</p></section>`;
  }
  const regionsText = (set) => [...(set || [])].sort().join(", ");
  const when = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC" : ""; };
  const ONB_WORD = Object.fromEntries(ONB.map((d) => [d.key, `${d.glyph} ${d.label}`]));
  const RES_WORD = Object.fromEntries(RES.map((d) => [d.key, `${d.glyph} ${d.label}`]));
  const USR_WORD = Object.fromEntries(USR.map((d) => [d.key, `${d.glyph} ${d.label}`]));

  // the drill-down lists: { title, head, rows } — the screen shows one, the export all
  function lists(m, I) {
    const pname = new Map(((I && I.landing && I.landing.policies) || []).map((p) => [p.key, p.name]));
    const devOff = m.devices.list.filter((e) => e.status && e.status !== "onboarded").sort((a, b) => ONB.findIndex((d) => d.key === b.status) - ONB.findIndex((d) => d.key === a.status) || a.name.localeCompare(b.name));
    const silent = m.devices.list.filter((e) => e.silent);
    const usersOff = m.users.list.filter((u) => u.cat !== "all").sort((a, b) => USR.findIndex((d) => d.key === b.cat) - USR.findIndex((d) => d.key === a.cat) || String(a.upn).localeCompare(String(b.upn)));
    const evid = m.evidence.list.filter((x) => x.reported < x.expected).sort((a, b) => a.reported - b.reported || a.e.name.localeCompare(b.e.name));
    const conf = m.results.list.filter((x) => x.worst === "conflict" || x.worst === "error").sort((a, b) => (a.worst === b.worst ? a.e.name.localeCompare(b.e.name) : a.worst === "conflict" ? -1 : 1));
    const polsIn = (e, state) => [...e.per.entries()].filter(([, s]) => s.state === state).map(([k]) => pname.get(k) || k);
    return {
      devices: { title: `Wave devices not onboarded · ${fmt(devOff.length)}${silent.length ? ` — and ${fmt(silent.length)} onboarded with a silent sensor` : ""}`, head: ["Device", "Waves", "Defender", "Last seen by Defender", "Primary user", "Intune check-in"],
        rows: devOff.concat(silent).map((e) => [e.name, regionsText(e.regions), e.silent ? `✓ Onboarded — sensor ${String(e.row.SensorHealthState).toLowerCase()}` : ONB_WORD[e.status], e.row ? when(e.row.LastSeen) : "", e.upn, when(e.lastSync)]) },
      users: { title: `Users not fully onboarded · ${fmt(usersOff.length)}`, head: ["User", "Waves", "State", "Windows devices (Defender)"],
        rows: usersOff.map((u) => [u.upn, regionsText(u.regions), USR_WORD[u.cat], u.devs.map((d) => `${d.name}: ${(ONB.find((x) => x.key === d.status) || { label: "?" }).label}`).join(" · ")]) },
      evidence: { title: `Live devices not reporting every new policy · ${fmt(evid.length)}`, head: ["Device", "Waves", "Reported", "Worst so far", "Intune check-in"],
        rows: evid.map((x) => [x.e.name, regionsText(x.e.regions), `${x.reported} of ${x.expected}`, x.reported ? RES_WORD[x.worst] : "◌ nothing yet", when(x.e.lastSync)]) },
      conflict: { title: `Devices in conflict or error · ${fmt(conf.length)}`, head: ["Device", "Waves", "Result", "Policies"],
        rows: conf.map((x) => [x.e.name, regionsText(x.e.regions), RES_WORD[x.worst], polsIn(x.e, x.worst).join(" · ")]) },
    };
  }
  function listTable(L, cap) {
    const rows = cap ? L.rows.slice(0, cap) : L.rows;
    if (!L.rows.length) return '<p class="mini muted">Nobody — nothing to list.</p>';
    return `<div class="t28-table-wrap"><table class="cg-table dash-table"><thead><tr>${L.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<b>${esc(c)}</b>` : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${cap && L.rows.length > cap ? `<p class="mini muted">First ${fmt(cap)} of ${fmt(L.rows.length)} — the CSV and the HTML export hold all.</p>` : ""}`;
  }
  function tierBadge(t) { return `<span class="dash-tier ${t}" title="${esc(TIER[t].why)}">${esc(TIER[t].label)}</span>`; }
  function pairRow(p, o) {
    const kind = p.kind === "new" ? "new ⇄ new" : "old ⇄ new";
    const first = p.rows.slice(0, 2).map((r) => `${r.name}: ${r.a} ≠ ${r.b}`).join(" · ");
    const what = p.type === "review" ? `other format — ${esc((p.common || []).join(", "))}` : `${plural(p.rows.length, "setting")}${p.same ? ` · ${fmt(p.same)} the same` : ""}<div class="mini muted">${esc(first)}${p.rows.length > 2 ? " …" : ""}</div>`;
    const max = o.maxDevices || 1;
    const dev = p.unknown ? '<span class="mini" title="One of the two reports could not be read">unknown</span>'
      : p.devices ? `<div class="dash-devbar"><span style="width:${Math.max(4, Math.round((p.devices / max) * 100))}px"></span><b>${fmt(p.devices)}</b></div>`
        : `<span class="mini muted">${p.tier === "candidates" ? `${fmt(p.candN)} as a candidate` : "none reported"}</span>`;
    const how = `${tierBadge(p.tier)}<div class="mini muted">${esc(p.tier === "predicted" ? (VERDICT_WORD[p.verdict] || p.why || "") : p.tier === "matched" ? "Intune names no partner — found from the settings" : p.tier === "named" && p.matchedN ? `${fmt(p.matchedN)} more matched by T28` : TIER[p.tier].why)}</div>`;
    const open = o.app ? o.open && o.open.has(p.id) : false;
    const names = `<div class="dash-pair"><b>${esc(p.a.name)}</b><span>⇄ ${esc(p.b.name)} <small>· ${kind}</small></span></div>`;
    const toggle = o.app ? `<button type="button" class="t28-link dash-fold" data-dash-pair="${esc(p.id)}" aria-expanded="${open ? "true" : "false"}">${open ? "▴" : "▾"}</button>` : "";
    const row = `<tr><td>${toggle}</td><td>${names}</td><td>${what}</td><td>${dev}</td><td>${how}</td></tr>`;
    const detail = pairDetail(p, o);
    if (o.app) return row + (open ? `<tr class="dash-detail"><td></td><td colspan="4">${detail}</td></tr>` : "");
    return row + `<tr class="dash-detail"><td></td><td colspan="4"><details><summary>Settings and devices</summary>${detail}</details></td></tr>`;
  }
  function pairDetail(p, o) {
    const idx = (o.conflicts && o.conflicts.devIndex) || new Map();
    const devName = (d) => { const x = idx.get(d) || {}; return `${x.name || d}${x.upn ? ` · ${x.upn}` : ""}`; };
    const rows = p.rows.length ? `<table class="cg-table dash-table"><thead><tr><th>Setting</th><th>${esc(p.kind === "new" ? p.a.name : "Old")}</th><th>${esc(p.kind === "new" ? p.b.name : "New")}</th></tr></thead><tbody>${p.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.a)}</td><td>${esc(r.b)}</td></tr>`).join("")}</tbody></table>` : "";
    const named = [...p.named].filter((d) => p.deviceIds.includes(d)), matched = p.deviceIds.filter((d) => !p.named.has(d));
    const devs = (label, list) => list.length ? `<p class="mini"><b>${esc(label)}</b> ${list.slice(0, 50).map((d) => esc(devName(d))).join(" · ")}${list.length > 50 ? ` · +${fmt(list.length - 50)} more` : ""}</p>` : "";
    return `${rows}${devs("Named by Intune:", named)}${devs("Matched by T28:", matched)}${p.why ? `<p class="mini muted">Reach: ${esc(p.why)}</p>` : ""}`;
  }
  function conflictsSection(m, o) {
    const C = m.conflicts;
    const shown = o.app && !o.allPairs ? C.pairs.slice(0, 10) : C.pairs;
    const maxDevices = Math.max(1, ...C.pairs.map((p) => p.devices));
    const live = C.pairs.filter((p) => p.devices).length, pred = C.pairs.filter((p) => p.tier === "predicted").length;
    const sub = [`${plural(live, "pair")} on ${plural(C.devices, "device")} in conflict`, C.unresolved.length ? `${plural(C.unresolved.length, "device")} unresolved` : "", C.candidates.length ? `${plural(C.candidates.length, "device")} with several candidates` : "", pred ? `${plural(pred, "pair")} predicted` : "", C.duplicates ? `${plural(C.duplicates, "duplicate pair")} (same values — clean-up)` : ""].filter(Boolean).join(" · ");
    const head = `<div class="t28-panel-head"><div><h4>Policies in conflict</h4><p class="mini muted">${C.known ? esc(sub) : "Device reports not read yet — the pairs below come from the settings alone."}</p></div>${o.app ? '<button type="button" class="btn" data-mrpane="conflicts">Open Conflicts →</button>' : ""}</div>`;
    if (!C.pairs.length && !C.unresolved.length) return `<section class="t28-panel dash-conf">${head}<p class="mini">No pair of policies sets a setting differently where they meet.</p></section>`;
    const unres = C.unresolved.length ? `<tr><td></td><td><div class="dash-pair"><b>Unresolved</b><span>Intune reports a conflict no Intune policy explains</span></div></td><td class="mini">${esc([...new Set(C.unresolved.flatMap((u) => u.policies))].slice(0, 3).join(" · "))}</td><td><div class="dash-devbar"><span class="none" style="width:${Math.max(4, Math.round((C.unresolved.length / maxDevices) * 100))}px"></span><b>${fmt(C.unresolved.length)}</b></div></td><td>${tierBadge("unresolved")}<div class="mini muted">Check Defender security settings management or GPO</div></td></tr>` : "";
    const more = o.app && C.pairs.length > shown.length ? `<button type="button" class="t28-link" data-dash-allpairs>Show all ${fmt(C.pairs.length)} pairs</button>` : "";
    const legendRow = `<div class="dash-tiers">${["named", "matched", "candidates", "predicted", "unresolved"].map((t) => `<span>${tierBadge(t)} ${esc(TIER[t].why)}</span>`).join("")}</div>`;
    const unresList = C.unresolved.length && !o.app ? `<details><summary>Unresolved devices · ${fmt(C.unresolved.length)}</summary>${listTable({ head: ["Device", "User", "Reported in conflict on"], rows: C.unresolved.map((u) => [u.name, u.upn, u.policies.join(" · ")]) })}</details>` : "";
    return `<section class="t28-panel dash-conf">${head}<div class="t28-table-wrap"><table class="cg-table dash-table"><thead><tr><th></th><th>Policy ⇄ policy</th><th>What differs</th><th>Devices</th><th>How T28 knows</th></tr></thead><tbody>${shown.map((p) => pairRow(p, Object.assign({}, o, { maxDevices, conflicts: C }))).join("")}${unres}</tbody></table></div>${more}${unresList}${legendRow}</section>`;
  }
  function wavesSection(m, o) {
    const countries = o.countries || new Map();
    const row = (w) => {
      const cs = countries.get(w.region) || [];
      const chips = cs.length ? (o.app ? `<details class="dash-countries"><summary>${plural(cs.length, "country", "countries")}</summary>${cs.map((c) => `<button type="button" class="t28-link" data-project-country="${esc(c.key)}">${esc(c.country)}</button>`).join(" ")}</details>` : `<div class="mini muted">${esc(cs.map((c) => c.country).join(", "))}</div>`) : "";
      const state = w.live ? `<span class="dash-state live">Live · ${plural(w.live, "new policy", "new policies")}</span>` : '<span class="dash-state">Not started</span>';
      const d = w.devices, u = w.users, ev = w.evidence, r = w.results;
      return `<tr><td><b>${esc(w.region)}</b>${chips}</td><td>${state}</td><td class="dash-num">${d.wavesKnown ? `${fmt(d.total)} · ${fmt(u.total)}` : "—"}</td>
        <td>${d.known ? bar(ONB, d.counts, d.total) : '<span class="mini muted">—</span>'}</td><td>${u.known ? bar(USR, u.counts, u.total) : '<span class="mini muted">—</span>'}</td>
        <td>${w.live && ev.known ? bar(REP, ev.counts, ev.total) : `<span class="mini muted">${w.live ? "—" : "not assigned yet"}</span>`}</td><td>${w.live && r.known ? bar(RES, r.counts, r.total) : '<span class="mini muted">—</span>'}</td></tr>`;
    };
    return `<section class="t28-panel"><div class="t28-panel-head"><h4>Wave by wave</h4><span class="mini muted">The same colours as the donuts · hover a bar for its counts</span></div>${o.waveNote ? `<p class="dash-wait bad">${esc(o.waveNote)}</p>` : ""}<div class="t28-table-wrap"><table class="cg-table dash-table dash-waves"><thead><tr><th>Wave</th><th>State</th><th>Devices · users</th><th>Onboarded · devices</th><th>Onboarded · users</th><th>Reporting</th><th>Results</th></tr></thead><tbody>${m.waves.map(row).join("")}</tbody></table></div></section>`;
  }
  // the whole page body. o: { app, list, open, allPairs, countries, states, tenant, times }
  function html(m, opt) {
    const o = opt || {};
    const S = o.states || {};
    const D = m.devices, U = m.users, E = m.evidence, R = m.results;
    const cards = [
      card({ title: "MDE onboarded · devices", defs: ONB, block: D, caption: `${fmt(D.counts.onboarded)} of ${fmt(D.total)}`, aria: `Devices in the waves: ${ONB.map((d) => `${fmt(D.counts[d.key])} ${d.label.toLowerCase()}`).join(", ")}, of ${fmt(D.total)}`,
        link: { list: "devices", n: D.total - D.counts.onboarded + D.silent, text: `Open the ${[D.total - D.counts.onboarded ? `${fmt(D.total - D.counts.onboarded)} not onboarded` : "", D.silent ? `${fmt(D.silent)} with a silent sensor` : ""].filter(Boolean).join(" and ")}` }, empty: "No device in the device waves yet.", zeroKnown: (B) => B.known,
        state: S.devices, src: "Defender's device inventory (30 days) against the device waves' members, on the Entra device id. -vdi- devices are left out.", extra: D.silent ? `${fmt(D.silent)} onboarded with a sensor that is not active.` : "" }, o),
      card({ title: "MDE onboarded · users", defs: USR, block: U, caption: `${fmt(U.counts.all)} of ${fmt(U.total)}`, aria: `Users in the waves: ${USR.map((d) => `${fmt(U.counts[d.key])} ${d.label.toLowerCase()}`).join(", ")}, of ${fmt(U.total)}`,
        link: { list: "users", n: U.total - U.counts.all, text: `Open the ${fmt(U.total - U.counts.all)} users` }, empty: "No user in the user waves yet.",
        state: S.users, src: "The user waves' members and their Windows devices by Intune primary user, each against Defender." }, o),
      card({ title: "Evidence · reporting config status", defs: REP, block: E, caption: `${fmt(E.counts.all)} of ${fmt(E.total)}`, aria: `Live devices: ${REP.map((d) => `${fmt(E.counts[d.key])} ${d.label.toLowerCase()}`).join(", ")}, of ${fmt(E.total)}`,
        link: { list: "evidence", n: E.total - E.counts.all, text: `Open the ${fmt(E.total - E.counts.all)} not reporting fully` }, empty: "No live wave yet — no new policy includes a wave.",
        state: S.landing, src: "Devices in a live wave, Intune's check-in status per new policy (📡). Pending and no status are waiting, not results.", extra: E.users.total ? `Users: ${fmt(E.users.all)} of ${fmt(E.users.total)} report every user policy.` : "" }, o),
      card({ title: "Results · reporting devices", defs: RES, block: R, caption: `${fmt(R.counts.landed)} landed`, aria: `Reporting devices, worst state: ${RES.map((d) => `${fmt(R.counts[d.key])} ${d.label.toLowerCase()}`).join(", ")}, of ${fmt(R.total)}`,
        link: { list: "conflict", n: R.counts.conflict + R.counts.error, text: `Open the ${fmt(R.counts.conflict + R.counts.error)} in conflict or error` }, empty: "No device has reported a result yet.",
        state: S.landing, src: "Each device's worst state over the new policies it reported. Not applicable counts as landed." }, o),
    ];
    const chips = o.app ? `<div class="dash-chips" role="group" aria-label="Wave filter"><button type="button" class="fchip${m.region ? "" : " active"}" data-dash-region="" aria-pressed="${m.region ? "false" : "true"}">All waves</button>${m.waves.map((w) => `<button type="button" class="fchip${m.region === w.region ? " active" : ""}" data-dash-region="${esc(w.region)}" aria-pressed="${m.region === w.region ? "true" : "false"}">${esc(w.region)}${w.live ? " <small>live</small>" : ""}</button>`).join("")}</div>` : (m.region ? `<p class="mini"><b>Wave: ${esc(m.region)}</b></p>` : "");
    const held = m.held && (m.held.users || m.held.devices) ? `<p class="dash-hold"><b>⏸ ${plural(m.held.devices, "device")} · ${plural(m.held.users, "user")} held back</b> — out of the waves, not in the counts above.${o.app ? ' <button type="button" class="t28-link" data-mrpane="exceptionhome">Open Hold-back →</button>' : ""}</p>` : "";
    const L = lists(m, o.input);
    const openList = o.app && o.list && L[o.list] ? `<section class="t28-panel dash-list" aria-label="${esc(L[o.list].title)}"><div class="t28-panel-head"><h4>${esc(L[o.list].title)}</h4><button type="button" class="btn" data-dash-list="">Close</button></div>${listTable(L[o.list], 300)}</section>` : "";
    const allLists = !o.app ? `<section class="t28-panel"><h4>Lists</h4>${["devices", "users", "evidence", "conflict"].map((k) => `<details><summary>${esc(L[k].title)}</summary>${listTable(L[k])}</details>`).join("")}</section>` : "";
    return `<div class="dash">${chips}<div class="dash-grid">${cards.join("")}</div>${held}${openList}${wavesSection(m, o)}${conflictsSection(m, o)}${allLists}<p class="mini muted dash-foot">Group membership, policy assignment and reported application are separate checks: a wave member is a target, not proof a device applied the setting. A read time is not a device check-in time. Missing evidence stays unknown — never counted as a failure or a success.</p></div>`;
  }

  // ---------------------------------------------------------------- CSV --
  // one row per wave device and per wave user — what each answer said
  function csv(m) {
    const out = [["kind", "name", "user", "waves", "mde_onboarding", "sensor", "defender_last_seen", "policies_expected", "policies_reported", "worst_result"]];
    const ev = new Map(m.evidence.list.map((x) => [lc(x.e.aadId || ""), x]));
    for (const e of m.devices.list) {
      const x = ev.get(e.aad);
      out.push(["device", e.name, e.upn, regionsText(e.regions), e.status ? (ONB.find((d) => d.key === e.status) || {}).label : "not read", e.row ? e.row.SensorHealthState || "" : "", e.row ? when(e.row.LastSeen) : "",
        x ? x.expected : "", x ? x.reported : "", x && x.reported ? x.worst : ""]);
    }
    for (const u of m.users.list) out.push(["user", u.upn, u.upn, regionsText(u.regions), m.users.known ? (USR.find((d) => d.key === u.cat) || {}).label : "not read", "", "", "", "", ""]);
    return toCsv(out);
  }

  // ------------------------------------------------------------- export --
  // A self-contained page for people without TUNO (Mihai, 10 Oct: "or make
  // the dashboard easy exportable to html"): the same body, every list and
  // pair folded open-able, no script, light and dark by the reader's system.
  // It carries device and user names — said in its own footer.
  const CSS = `:root{--ink:#12331f;--muted:#5f7a67;--line:#dbe7de;--bg:#f2f7f3;--card:#fff;--soft:#eaf3ec;--green:#1e4729;
--dash-ok:#3f7a24;--dash-warn:#dcaa14;--dash-err:#c8601f;--dash-conf:#a3274f;--dash-none:#a7b5ac;--dash-track:#e4ece6;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--ink:#eaf3ec;--muted:#8ca991;--line:#26402f;--bg:#0c1811;--card:#14261a;--soft:#1a2f21;--green:#7fc98f;
--dash-ok:#5fb873;--dash-warn:#d4ad3a;--dash-err:#e07a3a;--dash-conf:#e5629a;--dash-none:#6b7d71;--dash-track:#22362a;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:24px 16px}h1{font-size:26px;letter-spacing:-.5px;margin:4px 0}.eyebrow{font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;color:var(--muted);margin:0}
.meta,.mini{font-size:12px;color:var(--muted)}.muted{color:var(--muted)}b{font-weight:600}
.t28-panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 16px;min-width:0}.t28-panel h4{margin:0 0 10px;font-size:15px}
.t28-panel-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;margin-bottom:10px}.t28-panel-head h4{margin:0}
.t28-table-wrap{overflow-x:auto}.cg-table{width:100%;border-collapse:collapse;font-size:12.5px}.cg-table th{text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:7px 8px;border-bottom:1px solid var(--line)}
.cg-table td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}details{margin:8px 0}summary{cursor:pointer;font-weight:600}
@media print{details{display:block}body{background:#fff}}
${"" /* the dashboard's own rules, shared with css/t28v2.css */}
.dash-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:12px}@media(max-width:1100px){.dash-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.dash-grid{grid-template-columns:minmax(0,1fr)}}
.dash-card{display:flex;flex-direction:column;gap:10px;margin:0}.dash-card h4{margin:0;font-size:13.5px}
.dash-donut{position:relative;width:148px;height:148px;margin:0 auto}.dash-svg{display:block;width:148px;height:148px}
.dash-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.dash-center b{font-size:28px;font-weight:700;line-height:1}.dash-center small{font-size:11.5px;color:var(--muted);margin-top:4px}
.dash-leg{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.dash-leg li{display:grid;grid-template-columns:12px minmax(0,1fr) auto 36px;gap:8px;align-items:center;font-size:12.5px}
.dash-leg b{text-align:right;font-variant-numeric:tabular-nums}.dash-leg small{text-align:right;color:var(--muted)}.dash-sw{display:block;width:10px;height:10px;border-radius:3px}
.dash-src{font-size:11px;color:var(--muted);margin:0;border-top:1px solid var(--line);padding-top:8px}.dash-wait{color:var(--muted);font-size:12.5px}
.dash-hold{font-size:12.5px;margin:4px 0 14px}.dash-cell{display:flex;align-items:center;gap:8px;min-width:110px}.dash-cell b{min-width:34px;text-align:right}
.dash-bar{display:flex;gap:2px;height:10px;flex:1 1 auto;min-width:60px}.dash-bar span{display:block;height:10px}.dash-bar span:first-child{border-radius:4px 0 0 4px}.dash-bar span:last-child{border-radius:0 4px 4px 0}
.dash-state{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:999px;background:var(--soft);white-space:nowrap}.dash-state.live{color:var(--green)}
.dash-pair{display:flex;flex-direction:column;gap:2px}.dash-pair span{color:var(--muted);font-size:12px}
.dash-devbar{display:flex;align-items:center;gap:8px}.dash-devbar span{display:block;height:10px;border-radius:0 4px 4px 0;background:var(--dash-conf)}.dash-devbar span.none{background:var(--dash-none)}
.dash-tier{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid var(--line);white-space:nowrap}
.dash-tier.named{border-color:var(--dash-ok)}.dash-tier.matched{border-color:#5b8ad0}.dash-tier.candidates,.dash-tier.predicted{border-color:var(--dash-warn)}.dash-tier.unresolved{border-style:dashed}
.dash-conf .cg-table th:first-child,.dash-conf .cg-table td:first-child{width:8px;padding-right:0}
.dash-tiers{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:var(--muted);margin-top:10px}.dash-num{white-space:nowrap;font-variant-numeric:tabular-nums}`;
  function exportHtml(m, meta, input) {
    const mt = meta || {};
    const stamp = (t) => t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "not read";
    const times = (mt.times || []).map(([label, t]) => `${esc(label)} ${esc(stamp(t))}`).join(" · ");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(`MDE rollout dashboard — ${mt.tenant || "tenant"}`)}</title><style>${CSS}</style></head><body><div class="wrap">
<p class="eyebrow">MDE rollout · dashboard</p><h1>${esc(mt.tenant || "MDE rollout")}</h1>
<p class="meta">Generated ${esc(stamp(mt.now || Date.now()))} · ${esc(mt.build || "")} · TUNO T28 MDE rollout${m.region ? ` · wave ${esc(m.region)}` : " · every wave"}</p>
${times ? `<p class="meta">Read: ${times}</p>` : ""}
${html(m, { app: false, countries: mt.countries, input })}
<p class="meta">A snapshot, read only: it does not update and cannot change anything. It names devices and users — share it like the tenant data it is.</p>
</div></body></html>`;
  }

  return { ONB, USR, REP, RES, TIER, onboardingKql, statusOf, defenderIndex, readDefender, waveScope, readWaves, liveOf, newPairs, model, memberEvidence, lists, html, csv, exportHtml, CSS };
})();

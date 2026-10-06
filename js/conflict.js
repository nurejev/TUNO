// ======================================================================
// T12 — Setting conflict scan (R20). After Alper Atar's IntuneShade (MIT),
// which checks what TUNO so far did not: THE SAME SETTING CONFIGURED TO
// DIFFERENT VALUES IN TWO POLICIES. T09 finds assignment-shaped
// contradictions; this finds value-shaped ones.
//
// THE READ IS T05's, NOT A SECOND COPY. Docs.collect() already reads the
// three configuration surfaces with their settings and assignments — the
// same N+1, the same redaction, the same failure honesty — and the first
// time a surface was read here with different rules, the two tools would
// have started disagreeing about the same tenant.
//
// WHAT "THE SAME SETTING" MEANS, per surface, and honestly:
//   * Settings catalog — the setting DEFINITION ID, which is Microsoft's
//     canonical identity. Exact.
//   * Administrative templates — the definition's display name plus its
//     category path, which is as canonical as ADMX gets here.
//   * Device configurations — the typed property name WITHIN ONE POLICY
//     TYPE. Two different types that drive the same CSP are NOT matched:
//     that would be display-name matching, the thing this tool must never
//     do, and the screen says so rather than quietly under-reporting.
//   A collision that spans two surfaces (a catalog policy and a legacy
//   device configuration writing the same CSP) is therefore NOT detected,
//   and the screen says that too.
//
// ONE STEP PAST THE ORIGINAL: a collision is only a conflict if the two
// policies can MEET ON A DEVICE. IntuneShade flags every same-setting
// difference; most are deliberate — a kiosk baseline and a knowledge-worker
// baseline disagreeing is the tenant working. Verdicts:
//   * CAN collide — overlapping reach: a shared included group, or a
//     tenant-wide target meeting anything with reach.
//   * MAY collide — different groups (different groups can share members),
//     or an assignment filter in the way. May, never yes — the R03 rule.
//   * CANNOT collide — one side reaches nobody BY CONSTRUCTION: no
//     includes and no tenant-wide target. The only "cannot" a browser can
//     honestly claim; disjoint-looking groups are still "may".
//
// A REDACTED VALUE IS NOT COMPARED. Two secrets both reading "[redacted]"
// are not known to be equal, and a conflict row printing them would be a
// disclosure engine. They are counted and named as not-compared.
//
// Reads only. No write scope is reachable from this file.
// ======================================================================
const Conflict = (() => {
  "use strict";

  const SECTIONS = ["settingsCatalog", "deviceConfigurations", "admx"];
  const VERDICT_ORDER = { can: 0, may: 1, cannot: 2 };

  // ---- identity ----
  function keyOf(sectionId, item, row) {
    if (sectionId === "settingsCatalog") return row.defId ? `sc|${row.defId}` : null;
    if (sectionId === "admx") return `admx|${row.category || ""}|${row.name}`;
    // A profile's own name and description are not settings: two profiles
    // "disagreeing" on them is every pair of profiles there is (10686 — the
    // group-first layout put them at the top of every block, and IntuneShade
    // leaves them out for the same reason).
    if (sectionId === "deviceConfigurations") return /^(display name|description)$/i.test(String(row.name)) ? null : `dc|${item.type}|${row.name}`;
    return null;
  }

  // ---- reach ----
  function reachOf(item) {
    const inc = new Set(), exc = new Set();
    // Group names, where the read resolved them (10686 — IntuneShade names
    // the group that brings two policies together; so does this now).
    const names = new Map();
    let tenantWide = false, filtered = false, allDevices = false, allUsers = false;
    for (const a of item.assignments || []) {
      // A filter on an EXCLUSION does not cap what this policy reaches
      // (10490) — it narrows what is kept out. The "can collide, may not"
      // verdict this tool prints is about capped reach, so only a filter on
      // a non-excluded target sets it. Same rule as Docs.filterReachOf.
      if (a.filterId && a.kind !== "Excluded") filtered = true;
      if (a.groupId && a.name && a.name !== a.groupId) names.set(a.groupId, a.name);
      if (a.kind === "Included" && a.groupId) inc.add(a.groupId);
      else if (a.kind === "Excluded" && a.groupId) exc.add(a.groupId);
      else if (a.kind === "All devices" || a.kind === "All users") {
        tenantWide = true;
        if (a.kind === "All devices") allDevices = true; else allUsers = true;
      }
    }
    return { inc, exc, names, tenantWide, allDevices, allUsers, filtered, none: !tenantWide && inc.size === 0 };
  }

  // The verdict for one PAIR of policies. `cannot` only where one side
  // reaches nobody by construction; a filter caps `can` down to `may`.
  function verdictPair(ra, rb) {
    if (ra.none || rb.none) return { verdict: "cannot", reason: "one policy has no include and no tenant-wide target — it reaches nobody as assigned" };
    const filterCap = (v, why) => (ra.filtered || rb.filtered)
      ? { verdict: "may", reason: `${why}, but an assignment filter sits in between and a browser cannot evaluate it` }
      : { verdict: "can", reason: why };
    const shared = [...ra.inc].filter((g) => rb.inc.has(g) && !ra.exc.has(g) && !rb.exc.has(g));
    if (shared.length) {
      const nm = (g) => (ra.names && ra.names.get(g)) || (rb.names && rb.names.get(g)) || "";
      const named = shared.map(nm).filter(Boolean);
      const v = filterCap(null, named.length
        ? `both include ${named.slice(0, 3).join(", ")}${shared.length > 3 ? ` and ${shared.length - 3} more` : ""}`
        : "both include the same group");
      return Object.assign(v, { groups: named });
    }
    if (ra.tenantWide && rb.tenantWide) return filterCap(null, "both target the whole tenant");
    if (ra.tenantWide || rb.tenantWide) return filterCap(null, "one targets the whole tenant and the other has reach");
    return { verdict: "may", reason: "different groups — different groups can share members, and this scan cannot see membership" };
  }

  // ---- the scan, over a Docs.collect() result ----
  function detect(res) {
    const byKey = new Map();
    let redactedSkipped = 0;
    for (const sec of res.sections) {
      for (const item of sec.items) {
        for (const row of item.rows || []) {
          if (row.redacted) { redactedSkipped++; continue; }
          const key = keyOf(sec.id, item, row);
          if (!key) continue;
          let e = byKey.get(key);
          if (!e) byKey.set(key, e = { key, section: sec.id, sectionLabel: sec.label, icon: sec.icon, label: row.name, policies: new Map() });
          let p = e.policies.get(item.id);
          if (!p) e.policies.set(item.id, p = { id: item.id, name: item.name, platform: item.platform, item, values: [] });
          p.values.push(String(row.value));
        }
      }
    }

    const conflicts = [];
    let comparedSettings = 0;
    for (const e of byKey.values()) {
      if (e.policies.size < 2) continue;
      comparedSettings++;
      const pols = [...e.policies.values()].map((p) => ({ ...p, value: [...new Set(p.values)].sort().join(" · "), reach: reachOf(p.item) }));
      const distinct = new Set(pols.map((p) => p.value));
      if (distinct.size < 2) continue;   // agreement is not a finding

      // strongest verdict among pairs that actually DISAGREE
      let best = null;
      for (let i = 0; i < pols.length; i++) for (let j = i + 1; j < pols.length; j++) {
        if (pols[i].value === pols[j].value) continue;
        const v = verdictPair(pols[i].reach, pols[j].reach);
        if (!best || VERDICT_ORDER[v.verdict] < VERDICT_ORDER[best.verdict]) best = v;
      }
      conflicts.push({
        key: e.key, section: e.section, sectionLabel: e.sectionLabel, icon: e.icon, label: e.label,
        verdict: best.verdict, reason: best.reason,
        policies: pols.map((p) => ({ id: p.id, name: p.name, platform: p.platform, value: p.value,
          none: p.reach.none, filtered: p.reach.filtered, tenantWide: p.reach.tenantWide, reach: p.reach })),
      });
    }
    conflicts.sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]
      || b.policies.length - a.policies.length || a.label.localeCompare(b.label));
    return { conflicts, comparedSettings, redactedSkipped,
      totals: {
        can: conflicts.filter((c) => c.verdict === "can").length,
        may: conflicts.filter((c) => c.verdict === "may").length,
        cannot: conflicts.filter((c) => c.verdict === "cannot").length,
      } };
  }

  // ---- the group-first layout (build 10686, layout round B) ----
  //
  // Mihai, 6 Oct, comparing with IntuneShade: "is better in form that we get
  // the group conflicting". So the GROUP is the heading: a block per group
  // that two disagreeing policies both reach, and under it a line per
  // setting with every reaching policy's value. Who reaches a group:
  //   * a policy that INCLUDES it and does not exclude it, and
  //   * a tenant-wide policy that does not exclude it (said: "via All
  //     devices") — the whole tenant reaches every group.
  // Tenant-wide policies that disagree among themselves get the All devices
  // / All users block. A collision placed in no block is a "may" (different
  // groups, shared members unknowable) or a "cannot" (reaches nobody) and
  // lands in that closing block — never dropped, never promoted.
  // A line is "may" when a reaching side is filtered (a filter caps can).
  function blocksByGroup(conflicts, ctx) {
    const c0 = ctx || {};
    const nameOf = (g, r) => (r && r.names && r.names.get(g)) || (c0.groupName ? c0.groupName(g) : "") || g;
    const blocks = new Map();
    const blockFor = (key, mk) => { let b = blocks.get(key); if (!b) blocks.set(key, b = Object.assign({ key, lines: [] }, mk())); return b; };
    const placed = new Set();
    for (const c of conflicts) {
      const ps = c.policies.filter((p) => p.reach);
      const keys = new Map();   // block key → { mk, members }
      const groups = new Set();
      ps.forEach((p) => p.reach.inc.forEach((g) => groups.add(g)));
      for (const g of groups) {
        const members = ps.filter((p) => !p.reach.exc.has(g) && (p.reach.inc.has(g) || p.reach.tenantWide));
        const nameRef = (members.find((p) => p.reach.names && p.reach.names.get(g)) || {}).reach;
        keys.set(`g|${g}`, { mk: () => ({ kind: "group", id: g, name: nameOf(g, nameRef), count: c0.groupCount ? c0.groupCount(g) : null }),
          members: members.map((p) => ({ p, via: p.reach.inc.has(g) ? "" : (p.reach.allDevices ? "All devices" : "All users") })) });
      }
      for (const [k, flag, label] of [["all-devices", "allDevices", "All devices"], ["all-users", "allUsers", "All users"]]) {
        const members = ps.filter((p) => p.reach[flag]);
        keys.set(k, { mk: () => ({ kind: "tenant", id: k, name: label, count: null }), members: members.map((p) => ({ p, via: "" })) });
      }
      for (const [k, v] of keys) {
        if (v.members.length < 2 || new Set(v.members.map((m) => m.p.value)).size < 2) continue;
        const b = blockFor(k, v.mk);
        const filt = (p) => !!(p.filtered || p.reach.filtered);
        b.lines.push({ conflict: c, verdict: v.members.some((m) => filt(m.p)) ? "may" : "can",
          sides: v.members.map((m) => ({ id: m.p.id, name: m.p.name, value: m.p.value, via: m.via, filtered: filt(m.p) })) });
        placed.add(c.key);
      }
    }
    const rest = conflicts.filter((c) => !placed.has(c.key));
    const out = [...blocks.values()].sort((a, b) => b.lines.length - a.lines.length || a.name.localeCompare(b.name));
    const tail = (v, name, why) => {
      const lines = rest.filter((c) => c.verdict === v).map((c) => ({ conflict: c, verdict: v,
        sides: c.policies.map((p) => ({ id: p.id, name: p.name, value: p.value, via: "", filtered: p.filtered, none: p.none })) }));
      if (lines.length) out.push({ key: `rest|${v}`, kind: v, id: v, name, why, count: null, lines });
    };
    // A "can" always shares a group or a tenant-wide target, which placed it
    // above; one that somehow was not placed is kept visible, never lost.
    tail("can", "Can collide — not placed in a group", "");
    tail("may", "May collide — no shared group", "different groups, which can share members, or a filter in between");
    tail("cannot", "Cannot collide", "one side reaches nobody as assigned");
    return out;
  }

  // The same lines keyed by POLICY PAIR — "these two policies disagree on
  // these settings" — the view to read when deciding which policy to fix.
  function blocksByPair(conflicts) {
    const blocks = new Map();
    for (const c of conflicts) {
      const ps = c.policies;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        if (ps[i].value === ps[j].value) continue;
        const [a, b] = [ps[i], ps[j]].sort((x, y) => String(x.name).localeCompare(String(y.name)));
        const k = `${a.id}|${b.id}`;
        let blk = blocks.get(k);
        if (!blk) blocks.set(k, blk = { key: `p|${k}`, kind: "pair", id: k, name: `${a.name} ⟷ ${b.name}`, count: null, lines: [] });
        blk.lines.push({ conflict: c, verdict: verdictPair(a.reach || reachOf({}), b.reach || reachOf({})).verdict,
          sides: [{ id: a.id, name: a.name, value: a.value, via: "" }, { id: b.id, name: b.name, value: b.value, via: "" }] });
      }
    }
    return [...blocks.values()].sort((x, y) => y.lines.length - x.lines.length || x.name.localeCompare(y.name));
  }

  // ---- exports ----
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  function meta(collectRes) {
    return { when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
      // when the tenant was read, where that differs (the cache, 10523)
      read: collectRes && collectRes.readAt ? new Date(collectRes.readAt).toISOString().replace("T", " ").replace(/\..*/, " UTC") : "" };
  }
  const V_LABEL = { can: "CAN collide", may: "may collide", cannot: "cannot collide" };
  function markdown(scan, collectRes, m) {
    const L = [];
    L.push("# Intune setting conflicts", "");
    L.push(`Generated ${m.when} by TUNO ${m.build}${m.read ? ` · tenant read ${m.read}` : ""}`, "");
    L.push(`${scan.conflicts.length} conflicting settings across ${scan.comparedSettings} settings configured by more than one policy. Verdicts: ${scan.totals.can} can collide, ${scan.totals.may} may, ${scan.totals.cannot} cannot.`, "");
    L.push(`> **A verdict is about group targeting.** "Can collide" means overlapping reach as assigned; which value wins on a device is Intune's conflict resolution, not this report. "May" is may — filters and shared members cannot be evaluated in a browser. A collision spanning two surfaces (settings catalog vs a legacy device configuration on the same CSP) is not detected.`, "");
    if (scan.redactedSkipped) L.push(`> ${scan.redactedSkipped} redacted values (secrets) were not compared — two secrets are never known to be equal here.`, "");
    if (collectRes.failed.length) L.push(`> **Unread surfaces: ${collectRes.failed.map((f) => f.label).join(", ")}.** Conflicts there are unknown, not absent.`, "");
    for (const v of ["can", "may", "cannot"]) {
      const list = scan.conflicts.filter((c) => c.verdict === v);
      if (!list.length) continue;
      L.push(`## ${V_LABEL[v]} (${list.length})`, "");
      for (const c of list) {
        L.push(`### ${mdCell(c.label)}  _(${mdCell(c.sectionLabel)})_`, "");
        L.push(`_${mdCell(c.reason)}_`, "");
        L.push(`| Policy | Platform | Value |`, `|---|---|---|`);
        c.policies.forEach((p) => L.push(`| ${mdCell(p.name)}${p.none ? " ⚠ reaches nobody" : ""}${p.filtered ? " · filtered" : ""} | ${mdCell(p.platform)} | ${mdCell(p.value)} |`));
        L.push("");
      }
    }
    return L.join("\n");
  }
  function csv(scan, ctx) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    // `groups` (10686, round B): the groups the colliding policies meet in —
    // appended last, so a sheet reading the old columns keeps working.
    const where = new Map();
    for (const b of blocksByGroup(scan.conflicts, ctx)) {
      if (b.kind !== "group" && b.kind !== "tenant") continue;
      for (const ln of b.lines) { const k = ln.conflict.key; if (!where.has(k)) where.set(k, []); where.get(k).push(b.name); }
    }
    const L = ["verdict,setting,surface,policy,platform,value,reason,groups"];
    for (const c of scan.conflicts) for (const p of c.policies) {
      L.push([c.verdict, q(c.label), q(c.sectionLabel), q(p.name), q(p.platform), q(p.value), q(c.reason), q((where.get(c.key) || []).join(" · "))].join(","));
    }
    return L.join("\n");
  }

  return { SECTIONS, detect, keyOf, reachOf, verdictPair, blocksByGroup, blocksByPair, markdown, csv, meta, V_LABEL };
})();


// ======================================================================
// T12 — ON DEVICES (build 10686). Mihai, 6 Oct: "a tool to find all
// devices with a conflict, and list the conflict and with which policies
// the conflict are". Mockup round: option A — a second view in T12, not a
// new tool, because the engine above already knows which policies set the
// same setting, and that is half of the answer.
//
// THE OTHER HALF IS WHAT INTUNE SAYS. Predicted is about assignments; this
// view is about what devices REPORTED. Three documented report actions,
// read only, each one call per page:
//   1. getConfigurationPolicyNonComplianceSummaryReport — every policy with
//      its count of devices in conflict (the portal's "Configuration policy
//      assignment failures"). Only policies with a count are drilled into.
//   2. getConfigurationPolicyNonComplianceReport, per such policy — the
//      devices, keeping the rows whose status says Conflict.
//   3. getConfigurationSettingNonComplianceReport, per such policy — the
//      settings Intune itself flags. Optional: a refusal here costs the
//      "Intune flags" column, never the device list.
//
// WHO IS ON THE OTHER SIDE. Graph does not name the other policy for the
// settings catalog. So it is computed, and only claimed when exact: two
// policies BOTH reported in conflict on the SAME device that BOTH set the
// same setting (the engine's own identity — definition id, ADMX
// definition, typed property) to DIFFERENT values. That is a named
// collision. A setting Intune flags that no such pair explains is listed
// with the device's other conflicting policies as CANDIDATES, never as the
// answer. A device with no explanation at all says "other side unresolved".
//
// THE REPORT SHAPE IS READ, NOT ASSUMED. These actions answer
// { Schema: [{ Column }], Values: [[…]] } and Microsoft does not document
// the columns. So rows are zipped from the schema, every column is looked
// up by a list of known names, and the status is a CONFLICT only when a
// status column SAYS "conflict" (the *_loc text). A report whose status
// cannot be read is said on the screen — not treated as "no conflicts".
//
// Reads only. No write scope is reachable from this file.
// ======================================================================
const ConflictDevices = (() => {
  "use strict";

  const BASE = "/deviceManagement/reports/";
  const R_SUMMARY = "getConfigurationPolicyNonComplianceSummaryReport";
  const R_DEVICES = "getConfigurationPolicyNonComplianceReport";
  const R_SETTINGS = "getConfigurationSettingNonComplianceReport";
  const PAGE = 500;
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const norm = (s) => lc(s).replace(/[^a-z0-9]/g, "");

  // { Schema, Values } → [{ column: value }]. Tolerates an already-shaped
  // `value` array and a missing schema (empty answer).
  function rowsOf(resp) {
    if (!resp) return [];
    if (typeof resp === "string") { try { resp = JSON.parse(resp); } catch (e) { return []; } }
    const cols = (resp.Schema || resp.schema || []).map((c) => c.Column || c.column || c.name || "");
    const vals = resp.Values || resp.values;
    if (Array.isArray(vals) && cols.length) {
      return vals.map((v) => { const o = {}; cols.forEach((c, i) => { o[c] = Array.isArray(v) ? v[i] : (v || {})[c]; }); return o; });
    }
    if (Array.isArray(resp.value)) return resp.value;
    return [];
  }

  // First column that exists, by exact name (any case), then by pattern.
  function pick(row, names, re) {
    if (!row) return undefined;
    const keys = Object.keys(row);
    for (const n of names) {
      const k = keys.find((x) => lc(x) === lc(n));
      if (k !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }
    if (re) { const k = keys.find((x) => re.test(x)); if (k !== undefined) return row[k]; }
    return undefined;
  }

  // CONFLICT only where a status column says so, in words.
  function statusOf(row) {
    let seen = false;
    for (const k of Object.keys(row || {})) {
      if (!/status|state/i.test(k)) continue;
      const v = row[k];
      if (typeof v === "string" && /[a-z]/i.test(v)) {
        seen = true;
        if (/conflict/i.test(v)) return "conflict";
      }
    }
    return seen ? "other" : "unreadable";
  }

  const policyIdOf = (r) => lc(pick(r, ["PolicyId", "PolicyBaseId", "ProfileId"]) || "");
  const deviceIdOf = (r) => lc(pick(r, ["IntuneDeviceId", "DeviceId", "ManagedDeviceId"]) || "");
  const deviceNameOf = (r) => String(pick(r, ["DeviceName", "ManagedDeviceName"]) || "");
  const upnOf = (r) => String(pick(r, ["UPN", "UserPrincipalName", "UserEmail", "UserName"]) || "");
  const whenOf = (r) => String(pick(r, ["PspdpuLastModifiedTimeUtc", "LastModifiedDateTime", "LastReportedDateTime"], /time|date/i) || "");
  const conflictCountOf = (r) => {
    const v = pick(r, ["NumberOfConflictDevices", "ConflictDevices", "ConflictCount"], /conflict/i);
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Every page of one report action. `top`/`skip` paging, stopped by a
  // short page or the TotalRowCount, capped like readAll.
  async function readReport(name, body, opts) {
    const o = opts || {};
    const out = [];
    let total = null;
    for (let skip = 0, pages = 0; ; skip += PAGE) {
      // A report action is a READ sent as POST, so it may retry like one:
      // nothing is created, and a throttled page is simply asked again.
      const resp = await Graph.post(Graph.BETA + BASE + name, Object.assign({}, body || {}, { top: PAGE, skip }),
        { scopes: o.scopes, retry: true });
      const rows = rowsOf(resp);
      out.push(...rows);
      if (resp && typeof resp === "object" && Number.isFinite(resp.TotalRowCount)) total = resp.TotalRowCount;
      if (rows.length < PAGE || (total !== null && out.length >= total)) break;
      if (++pages > 200) throw new Error(`Stopped after 200 pages of ${name}.`);
    }
    return out;
  }

  const filterFor = (policyId) => `(PolicyId eq '${String(policyId).replace(/'/g, "''")}')`;

  // The tenant's policies by id, from the collection the predicted view
  // uses — names come from here first, the report second.
  function policyIndex(collectRes) {
    const m = new Map();
    for (const sec of (collectRes && collectRes.sections) || []) {
      for (const it of sec.items || []) m.set(lc(it.id), { id: it.id, name: it.name, section: sec.id, sectionLabel: sec.label, platform: it.platform || "" });
    }
    return m;
  }

  // ---- the read ----
  async function read(opts) {
    const o = opts || {};
    const say = (m) => { if (typeof o.onStatus === "function") o.onStatus(m); };
    const scopes = o.scopes;
    const out = { policies: [], deviceRows: [], settingRows: [], summaryError: null, summaryBlind: false,
      policyErrors: [], settingErrors: [], statusUnreadable: [] };

    say("Reading which policies have devices in conflict…");
    let candidates = [];
    try {
      const sum = await readReport(R_SUMMARY, {}, { scopes });
      const counted = sum.map((r) => ({ id: policyIdOf(r), name: String(pick(r, ["PolicyName", "ProfileName", "DisplayName"]) || ""), n: conflictCountOf(r) }))
        .filter((p) => p.id);
      out.summaryBlind = counted.length > 0 && counted.every((p) => p.n === null);
      candidates = out.summaryBlind ? counted : counted.filter((p) => p.n > 0);
    } catch (e) {
      out.summaryError = (e && e.message) || String(e);
      // Without the summary, every policy in the collection is a candidate:
      // slower, never blind.
      candidates = [...policyIndex(o.collectRes).values()].map((p) => ({ id: lc(p.id), name: p.name, n: null }));
    }
    // `only` (10687, T28): a caller that cares about some policies — T28's
    // new and old sets — asks for those and no others. With a summary, the
    // ones it counts in conflict; without one, every one asked for.
    if (Array.isArray(o.only)) {
      const want = new Map(o.only.map((x) => [lc(x.id || x), x]));
      candidates = out.summaryError || out.summaryBlind
        ? [...want.entries()].map(([id, x]) => ({ id, name: x.name || id, n: null }))
        : candidates.filter((p) => want.has(p.id));
    }
    out.policies = candidates;

    let done = 0;
    const devRes = await Graph.pool(candidates, async (p) => {
      const rows = await readReport(R_DEVICES, { filter: filterFor(p.id) }, { scopes });
      say(`Reading the devices in conflict… ${++done} of ${candidates.length} policies`);
      return rows;
    }, 4);
    const hit = [];
    for (const r of devRes) {
      if (r.error) { out.policyErrors.push({ id: r.item.id, name: r.item.name, error: (r.error && r.error.message) || String(r.error) }); continue; }
      let any = false, readable = false;
      for (const row of r.value || []) {
        const st = statusOf(row);
        if (st !== "unreadable") readable = true;
        if (st !== "conflict") continue;
        const id = deviceIdOf(row);
        if (!id) continue;
        any = true;
        out.deviceRows.push({ policyId: r.item.id, policyName: String(pick(row, ["PolicyName"]) || r.item.name || ""),
          deviceId: id, deviceName: deviceNameOf(row), upn: upnOf(row), when: whenOf(row) });
      }
      if ((r.value || []).length && !readable) out.statusUnreadable.push({ id: r.item.id, name: r.item.name });
      if (any) hit.push(r.item);
    }

    done = 0;
    // `settings: false` (10687): a caller that already knows which setting
    // the pair shares (T28) skips the per-setting report.
    const setRes = o.settings === false ? [] : await Graph.pool(hit, async (p) => {
      const rows = await readReport(R_SETTINGS, { filter: filterFor(p.id) }, { scopes });
      say(`Reading which settings collide… ${++done} of ${hit.length} policies`);
      return rows;
    }, 4);
    for (const r of setRes) {
      if (r.error) { out.settingErrors.push({ id: r.item.id, name: r.item.name, error: (r.error && r.error.message) || String(r.error) }); continue; }
      for (const row of r.value || []) {
        if (statusOf(row) !== "conflict") continue;
        out.settingRows.push({ policyId: r.item.id, deviceId: deviceIdOf(row),
          name: String(pick(row, ["SettingName", "SettingNm", "SettingDisplayName"]) || ""),
          settingId: lc(pick(row, ["SettingId", "SettingDefinitionId", "SettingInstancePath"]) || "") });
      }
    }
    say("");
    return out;
  }

  // ---- the join: devices, their conflicting policies, named collisions ----
  // `scan` is Conflict.detect() over the same collection.
  function explain(reported, scan, collectRes) {
    const pIdx = policyIndex(collectRes);
    const nameOf = (id, fallback) => (pIdx.get(lc(id)) || {}).name || fallback || id;
    const devices = new Map();
    for (const r of reported.deviceRows) {
      let d = devices.get(r.deviceId);
      if (!d) devices.set(r.deviceId, d = { id: r.deviceId, name: r.deviceName, upn: r.upn, when: r.when, policies: new Map(), findings: [] });
      if (!d.name && r.deviceName) d.name = r.deviceName;
      if (!d.upn && r.upn) d.upn = r.upn;
      if (r.when && r.when > d.when) d.when = r.when;
      d.policies.set(lc(r.policyId), { id: r.policyId, name: nameOf(r.policyId, r.policyName) });
    }

    // the engine's collisions, as sets of policy ids → per-policy values
    const collisions = ((scan && scan.conflicts) || []).map((c) => ({
      c, byId: new Map(c.policies.map((p) => [lc(p.id), p])),
      defId: c.key.startsWith("sc|") ? lc(c.key.slice(3)) : "", label: lc(c.label), norm: norm(c.label),
    }));

    for (const d of devices.values()) {
      const here = d.policies;
      const explained = new Set();   // policyId|setting
      for (const col of collisions) {
        const sides = [...here.keys()].filter((id) => col.byId.has(id)).map((id) => col.byId.get(id));
        if (sides.length < 2 || new Set(sides.map((s) => s.value)).size < 2) continue;
        // the group both sides include — how the two met (round B: the
        // group is the answer). Tenant-wide said as such; none named when
        // they meet through different groups.
        const rs = sides.map((sd) => sd.reach).filter(Boolean);
        let via = [];
        if (rs.length === sides.length) {
          const shared = [...rs[0].inc].filter((g) => rs.every((r) => (r.inc.has(g) || r.tenantWide) && !r.exc.has(g)));
          via = shared.map((g) => { const r = rs.find((x) => x.names && x.names.get(g)); return r ? r.names.get(g) : ""; }).filter(Boolean);
          if (!via.length && rs.every((r) => r.allDevices)) via = ["All devices"];
          else if (!via.length && rs.every((r) => r.allUsers)) via = ["All users"];
        }
        d.findings.push({ kind: "named", setting: col.c.label, section: col.c.sectionLabel, icon: col.c.icon, via,
          sides: sides.map((s) => ({ id: s.id, name: s.name, value: s.value })) });
        sides.forEach((s) => { explained.add(`${lc(s.id)}|${col.defId || col.label}`); explained.add(`${lc(s.id)}|${col.label}`); explained.add(`${lc(s.id)}|~${col.norm}`); });
      }
      // what Intune flags on this device (or for the policy, where the
      // setting report carries no device) that no pair above explains
      const flagged = reported.settingRows.filter((s) => here.has(lc(s.policyId)) && (!s.deviceId || s.deviceId === d.id));
      const seen = new Set();
      for (const s of flagged) {
        const pid = lc(s.policyId);
        const nm = lc(s.name);
        const idHit = s.settingId && [...explained].some((k) => k.startsWith(pid + "|") && (s.settingId.includes(k.slice(pid.length + 1)) || k.slice(pid.length + 1).includes(s.settingId)));
        // a legacy profile's typed property ("passwordMinimumLength") and the
        // documenter's label for it ("Password minimum length") are one name
        // once spaces and case are gone
        if (idHit || explained.has(`${pid}|${nm}`) || explained.has(`${pid}|~${norm(s.name)}`) || (s.settingId && explained.has(`${pid}|~${norm(s.settingId)}`))) continue;
        const k = `${pid}|${nm || s.settingId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        d.findings.push({ kind: "flagged", setting: s.name || s.settingId || "(setting not named)", section: "",
          sides: [{ id: s.policyId, name: here.get(pid).name, value: "" }],
          candidates: [...here.values()].filter((p) => lc(p.id) !== pid).map((p) => p.name) });
      }
      d.unresolved = !d.findings.length;
    }

    const list = [...devices.values()].map((d) => Object.assign(d, { policies: [...d.policies.values()] }))
      .sort((a, b) => (a.unresolved - b.unresolved) || b.findings.length - a.findings.length || a.name.localeCompare(b.name));
    const settings = new Set(), pols = new Set();
    list.forEach((d) => { d.policies.forEach((p) => pols.add(lc(p.id))); d.findings.forEach((f) => settings.add(lc(f.setting))); });
    return {
      devices: list,
      totals: { devices: list.length, policies: pols.size, settings: settings.size,
        named: list.filter((d) => d.findings.some((f) => f.kind === "named")).length,
        unresolved: list.filter((d) => d.unresolved || !d.findings.some((f) => f.kind === "named")).length },
      reported,
    };
  }

  // ---- exports ----
  const q = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
  const mdCell = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
  function csv(res) {
    const L = ["device,user,last_report,setting,surface,kind,policy,value,other_conflicting_policies"];
    for (const d of res.devices) {
      if (!d.findings.length) {
        L.push([q(d.name), q(d.upn), q(d.when), q(""), q(""), "unresolved", q(d.policies.map((p) => p.name).join(" · ")), q(""), q("")].join(","));
        continue;
      }
      for (const f of d.findings) for (const s of f.sides) {
        L.push([q(d.name), q(d.upn), q(d.when), q(f.setting), q(f.section), f.kind, q(s.name), q(s.value), q((f.candidates || []).join(" · "))].join(","));
      }
    }
    return L.join("\n");
  }
  function markdown(res, m) {
    const L = ["# Intune devices in conflict", ""];
    L.push(`Generated ${m.when} by TUNO ${m.build}`, "");
    L.push(`${res.totals.devices} devices report a conflict, across ${res.totals.policies} policies and ${res.totals.settings} settings. ${res.totals.named} with the colliding policies named; ${res.totals.unresolved} where the other side is not named exactly.`, "");
    L.push("> **Named** means two policies both reported in conflict on this device set the same setting to different values. **Flagged** is a setting Intune reports in conflict whose other side TUNO cannot identify exactly — the device's other conflicting policies are listed as candidates, not as the answer.", "");
    const r = res.reported;
    if (r.summaryError) L.push(`> The summary report could not be read (${mdCell(r.summaryError)}); every policy was asked instead.`, "");
    if (r.policyErrors.length) L.push(`> **Not read:** ${r.policyErrors.map((p) => mdCell(p.name || p.id)).join(", ")} — devices in conflict there are unknown, not absent.`, "");
    for (const d of res.devices) {
      L.push(`## ${mdCell(d.name || d.id)}${d.upn ? ` — ${mdCell(d.upn)}` : ""}`, "");
      L.push(`Policies in conflict: ${d.policies.map((p) => mdCell(p.name)).join(", ")}`, "");
      if (!d.findings.length) { L.push("_Other side unresolved — no pair of these policies sets the same setting differently, and Intune named no setting._", ""); continue; }
      L.push("| Setting | Kind | Policy | Value | Candidates |", "|---|---|---|---|---|");
      for (const f of d.findings) for (const s of f.sides) L.push(`| ${mdCell(f.setting)} | ${f.kind} | ${mdCell(s.name)} | ${mdCell(s.value)} | ${mdCell((f.candidates || []).join(", "))} |`);
      L.push("");
    }
    return L.join("\n");
  }

  return { rowsOf, pick, statusOf, read, explain, csv, markdown, R_SUMMARY, R_DEVICES, R_SETTINGS };
})();


// ======================================================================
// T12 — the screen. The engine above is DOM-free for the headless suite.
// ======================================================================
const ConflictTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let scan = null, collectRes = null, running = false;
  let cfPlat = "all";   // the conflict list's platform filter (build 10524)
  // THE STICKY CHIPS (10542, the layout round, T19's fix): verdict chips +
  // the platform select in a sticky .toolbar, so re-filtering after a long
  // conflict list never means scrolling back. Chips and cards are two faces
  // of one filter.
  let cfVerdict = null;
  // Open conflict folds, keyed on section|setting — stable across renders,
  // reset on a new scan.
  const open = new Set();

  // ON DEVICES (build 10686) — the second view. Its own result, filter and
  // open set, so switching views never loses either side's answer.
  let view = "predicted";
  // Layout round B (10686): the group is the heading. By setting is the
  // old folded list; By policy pair is the "which policy do I fix" read.
  let cfMode = "group";
  const blkOpen = new Set();
  let blkTouched = false;
  let devRes = null;
  let dvKind = null, dvQuery = "";

  function prog(msg) { TunoProgress.show("cfBody", "cfProg", msg); }   // ENCA-style centred card (10397)
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function showExports(on) { ["cfMd", "cfCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); }

  async function run() {
    if (view === "devices") return runDevices();
    if (running) return;
    running = true; $("cfRun").disabled = true; showExports(false); $("cfBody").innerHTML = ""; open.clear();
    try {
      // "filters" joins the union at 10488: collect() names assignment
      // filters and that read is RBAC-scoped, so without it a tenant with
      // one filtered assignment triggers a gestureless consent popup in the
      // middle of a read the tool has already declared permitted.
      await Graph.ensureScopes([...new Set([...Docs.scopesFor(Conflict.SECTIONS), ...Docs.scopesFor(["filters"]), ...Graph.SCOPES.groups])]);
      landRes(await Docs.collect({ sections: Conflict.SECTIONS, onStatus: prog }));
      prog("");
    } catch (e) {
      $("cfBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
      prog("");
    } finally { running = false; $("cfRun").disabled = false; }
  }

  // One landing for both fetch paths (build 10523) — the click above and
  // the shared cache below — so the two cannot drift in what they reset.
  function landRes(r) {
    collectRes = r;
    scan = Conflict.detect(collectRes);
    cfPlat = "all";   // a fresh scan is a fresh question
    cfVerdict = null;
    blkOpen.clear(); blkTouched = false;
    if (view !== "predicted") return;   // landed for the device view's join
    render();
    showExports(true);
  }

  // ---- On devices (10686) ----
  // The collection the join needs: the predicted view's own when it has
  // one, the shared cache next, a read last — the same three-surface read,
  // never a second copy of it.
  async function collectionForDevices() {
    if (collectRes) return collectRes;
    const c = typeof PolicyCache !== "undefined" && PolicyCache.get();
    if (c) {
      landRes(Object.assign({}, c, {
        sections: c.sections.filter((x) => Conflict.SECTIONS.includes(x.id)),
        failed: c.failed.filter((f) => Conflict.SECTIONS.includes(f.id)),
        partial: c.partial.filter((x) => Conflict.SECTIONS.includes(x.id)),
      }));
      return collectRes;
    }
    landRes(await Docs.collect({ sections: Conflict.SECTIONS, onStatus: prog }));
    return collectRes;
  }

  async function runDevices() {
    if (running) return;
    running = true; $("cfRun").disabled = true; showExports(false); $("cfBody").innerHTML = ""; blkOpen.clear(); blkTouched = false;
    try {
      const reportScopes = [...new Set([...Graph.SCOPES.config, ...Graph.SCOPES.devices])];
      await Graph.ensureScopes([...new Set([...Docs.scopesFor(Conflict.SECTIONS), ...Docs.scopesFor(["filters"]), ...Graph.SCOPES.groups, ...reportScopes])]);
      const col = await collectionForDevices();
      const reported = await ConflictDevices.read({ collectRes: col, onStatus: prog, scopes: reportScopes });
      devRes = ConflictDevices.explain(reported, scan, col);
      dvKind = null; dvQuery = "";
      prog("");
      if (view === "devices") { render(); showExports(true); }
    } catch (e) {
      $("cfBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
      prog("");
    } finally { running = false; $("cfRun").disabled = false; }
  }

  function setView(v) {
    if (v === view) return;
    view = v;
    blkOpen.clear(); blkTouched = false;
    $("cfView").querySelectorAll("[data-cfview]").forEach((b) => b.classList.toggle("active", b.dataset.cfview === v));
    $("cfRun").textContent = v === "devices" ? "🖥 Find devices in conflict" : "⚔️ Scan for conflicts";
    const note = $("cfViewNote"); if (note) note.style.display = v === "devices" ? "" : "none";
    const has = v === "devices" ? !!devRes : !!scan;
    if (has) render(); else $("cfBody").innerHTML = "";
    showExports(has);
    if (v === "predicted" && !scan) onShow();
  }

  function renderDevices() {
    const R = devRes, rep = R.reported;
    const card = (label, n, sub, cls) => `<div class="au-card"><div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></div>`;
    const cards = `<div class="au-cards">
      ${card("Devices in conflict", R.totals.devices, "reported by Intune", R.totals.devices ? "bad" : "ok")}
      ${card("Policies involved", R.totals.policies, "in conflict on at least one device")}
      ${card("Settings colliding", R.totals.settings, "named or flagged")}
      ${card("Other side not named", R.totals.unresolved, "devices with candidates only", R.totals.unresolved ? "" : "ok")}
      ${rep.policyErrors.length ? card("Policies unread", rep.policyErrors.length, "devices there are unknown, not absent", "bad") : ""}
    </div>`;

    const notes = [];
    notes.push(`<p class="mini muted"><b>Named means exact.</b> Two policies that are both reported in conflict on the device and set the same setting — by definition id, ADMX definition or typed property, the ⚔️ Predicted view's identity — to different values. A setting Intune flags that no such pair explains is listed with the device's other conflicting policies as <b>candidates</b>, never as the answer: Graph does not name the other policy, and a collision across surfaces (settings catalog vs a legacy profile on the same CSP) cannot be matched exactly.</p>`);
    if (rep.summaryError) notes.push(`<div class="gu-fail"><b>The conflict summary could not be read.</b><span class="why">${esc(rep.summaryError)} — every policy was asked one by one instead.</span></div>`);
    if (rep.summaryBlind) notes.push(`<p class="mini muted"><b>The summary carried no conflict count</b>, so every policy in it was asked.</p>`);
    if (rep.policyErrors.length) notes.push(`<div class="gu-fail"><b>${rep.policyErrors.length} polic${rep.policyErrors.length === 1 ? "y" : "ies"} could not be read: ${rep.policyErrors.slice(0, 5).map((p) => esc(p.name || p.id)).join(", ")}${rep.policyErrors.length > 5 ? "…" : ""}.</b><span class="why">Devices in conflict there are unknown, not absent. ${esc(rep.policyErrors[0].error)}</span></div>`);
    if (rep.settingErrors.length) notes.push(`<p class="mini muted"><b>Intune's per-setting report could not be read for ${rep.settingErrors.length} polic${rep.settingErrors.length === 1 ? "y" : "ies"}</b> — named collisions still stand; flagged settings there are missing.</p>`);
    if (rep.statusUnreadable.length) notes.push(`<div class="gu-fail"><b>The status of ${rep.statusUnreadable.length} polic${rep.statusUnreadable.length === 1 ? "y's" : "ies'"} devices could not be read: ${rep.statusUnreadable.slice(0, 5).map((p) => esc(p.name || p.id)).join(", ")}.</b><span class="why">The report answered without a status in words, so nothing there was counted as a conflict — unknown, not clean.</span></div>`);
    if (collectRes && collectRes.failed.length) notes.push(`<p class="mini muted"><b>${collectRes.failed.map((f) => esc(f.label)).join(", ")} could not be read</b> — collisions there cannot be named.</p>`);

    const qn = lc(dvQuery);
    const named = (d) => d.findings.some((f) => f.kind === "named");
    const shown = R.devices.filter((d) => (!dvKind || (dvKind === "named" ? named(d) : !named(d)))
      && (!qn || lc(d.name).includes(qn) || lc(d.upn).includes(qn) || d.policies.some((p) => lc(p.name).includes(qn))
        || d.findings.some((f) => lc(f.setting).includes(qn))));

    const dvBlock = (d, i) => {
      const when = d.when ? (() => { try { return new Date(d.when).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return d.when; } })() : "";
      const nNamed = d.findings.filter((f) => f.kind === "named").length;
      const head = `🖥 <b>${esc(d.name || d.id)}</b> <span class="mini muted">${esc(d.upn)}${when ? ` · ${esc(when)}` : ""}</span>
        <span class="gu-how ${named(d) ? "exc" : "priv"}">${named(d) ? `${nNamed} named` : (d.findings.length ? "candidates only" : "other side unresolved")}</span>
        <span class="mini muted">in conflict: ${d.policies.map((p) => esc(p.name)).join(" · ")}</span>`;
      const line = (f) => f.kind === "named"
        ? `<div class="cf-line"><div><b>${esc(f.icon || "")} ${esc(f.setting)}</b><div class="mini muted">${esc(f.section)}${(f.via || []).length ? ` · 🔗 both include ${f.via.map(esc).join(", ")}` : ""}</div></div>
            <div class="cf-vals">${sidesHtml(f.sides)}</div>${pillOf("named")}</div>`
        : `<div class="cf-line"><div><b>${esc(f.setting)}</b><div class="mini muted">flagged by Intune</div></div>
            <div class="cf-vals">${sidesHtml(f.sides)}<span class="mini">${(f.candidates || []).length ? `— other side not named exactly. Candidates on this device: ${f.candidates.map(esc).join(", ")}.` : "— no other policy is in conflict on this device: the other side may be on a surface this scan does not read (a legacy endpoint security intent, a custom OMA-URI, or Group Policy)."}</span></div>${pillOf("flagged")}</div>`;
      const lines = d.findings.length ? d.findings.map(line).join("")
        : `<div class="cf-line"><div class="mini" style="grid-column:1/-1">No pair of these policies sets the same setting to different values in what was read, and Intune named no setting. Open the device in 🖥 Device analyzer for its own report.</div></div>`;
      return blockHtml({ key: `dv|${d.id}` }, isOpenBlk(`dv|${d.id}`, i), head, lines, named(d) ? "" : "warn");
    };

    const nOf = (k) => R.devices.filter((d) => !k || (k === "named" ? named(d) : !named(d))).length;
    const chip = (k, label) => `<button class="fchip${dvKind === k ? " active" : ""}" data-dvkind="${k || ""}" type="button">${label} (${nOf(k)})</button>`;
    const toolbar = R.devices.length ? `<div class="toolbar">
      <span class="chip-filter">${chip(null, "All")}${chip("named", "⚔️ Named")}${chip("open", "❓ Not named")}</span>
      <label class="search"><input id="dvSearch" type="search" placeholder="Device, user, policy or setting" value="${esc(dvQuery)}"></label>
    </div>` : "";
    const body = R.devices.length
      ? (shown.map(dvBlock).join("") || `<p class="mini" style="margin-top:10px">Nothing matches — clear the search or the chips and the list comes back.</p>`)
      : `<p class="mini" style="margin-top:10px"><b>No device reports a conflict</b> across ${rep.policies.length} polic${rep.policies.length === 1 ? "y" : "ies"} asked${rep.policyErrors.length || rep.statusUnreadable.length ? " — on the policies that could be read" : ""}.</p>`;
    $("cfBody").innerHTML = cards + toolbar + `<div class="list-card">${notes.join("")}
      ${R.devices.length ? `<p class="mini muted" style="margin:8px 0 0">A block per device, the colliding settings under it with each policy's value — and the group both policies include, where they share one. Click a heading to fold it.</p>` : ""}
      <div style="margin-top:10px">${body}</div></div>`;
    $("cfBody").querySelectorAll("[data-dvkind]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.dvkind || null;
      dvKind = (dvKind === k) ? null : k;
      render();
    }));
    wireBlocks();
  }

  // The warm start (build 10523): opening the scan runs it over the shared
  // cache when one is held — the DETECTION is local arithmetic, so a warm
  // open costs no read at all. The cache is the WHOLE collection; this tool
  // scans its three surfaces of it, and the subset keeps the resolver, the
  // filter names and the group counts by reference (one collection, three
  // views). ⚔️ Scan the tenant stays the fresh read. A cold cache changes
  // nothing.
  function onShow() {
    if (scan || running) return;
    const c = typeof PolicyCache !== "undefined" && PolicyCache.get();
    if (!c) return;
    landRes(Object.assign({}, c, {
      sections: c.sections.filter((s) => Conflict.SECTIONS.includes(s.id)),
      failed: c.failed.filter((f) => Conflict.SECTIONS.includes(f.id)),
      partial: c.partial.filter((p) => Conflict.SECTIONS.includes(p.id)),
    }));
  }

  // The 10413 layout (build 10418, last of the four). Stat cards over the
  // strip, and each conflict is a FOLDED row: closed, it says the setting,
  // the verdict and how many policies; open, it shows the comparison the
  // finding exists for — every policy's value and reach, side by side in a
  // grid. Open set keyed on conflict keys, the T03 rule.
  const lc = (x) => String(x == null ? "" : x).toLowerCase();

  // ONE BLOCK SHAPE for both views (10686, round B): the heading is the
  // answer — a group, a device, a pair — and each line is a setting with
  // every side's value inline. Folds on the heading; the first block of a
  // fresh answer opens by itself, after that the person decides.
  const V_PILL = { can: ["delete", "Can"], may: ["update", "May"], cannot: ["create", "Cannot"], named: ["delete", "Named"], flagged: ["update", "Flagged"] };
  const pillOf = (k) => `<span class="au-op ${V_PILL[k][0]}">${V_PILL[k][1]}</span>`;
  function sideHtml(sd) {
    return `<span class="cf-side"><b>${esc(sd.name)}</b>${sd.via ? ` <span class="gu-how priv">via ${esc(sd.via)}</span>` : ""}${sd.filtered ? ' <span class="gu-how priv">filtered</span>' : ""}${sd.none ? ' <span class="gu-how exc">reaches nobody</span>' : ""}${sd.value !== "" && sd.value !== undefined ? ` = <code>${esc(sd.value)}</code>` : ""}</span>`;
  }
  const sidesHtml = (sides) => sides.map(sideHtml).join('<span class="cf-vs">⟷</span>');
  function blockHtml(b, isOpen, head, linesHtml, cls) {
    return `<div class="cf-blk ${cls || ""}${isOpen ? " open" : ""}" data-cfblk="${esc(b.key)}">
      <div class="cf-bh"><span class="cf-chev">▸</span>${head}</div>
      ${isOpen ? `<div class="cf-lines">${linesHtml}</div>` : ""}</div>`;
  }
  const isOpenBlk = (key, i) => blkOpen.has(key) || (!blkTouched && i === 0);
  function wireBlocks() {
    $("cfBody").querySelectorAll("[data-cfblk] > .cf-bh").forEach((h) => h.addEventListener("click", () => {
      const el = h.parentElement, k = el.dataset.cfblk;
      // the first block was open by default — make that explicit before
      // the first toggle, so closing it closes it
      if (!blkTouched) { const first = $("cfBody").querySelector("[data-cfblk]"); if (first) blkOpen.add(first.dataset.cfblk); blkTouched = true; }
      blkOpen.has(k) ? blkOpen.delete(k) : blkOpen.add(k);
      render();
    }));
  }

  function render() {
    if (view === "devices") return renderDevices();
    const card = (label, n, sub, cls) => `<div class="au-card"><div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></div>`;
    const cards = `<div class="au-cards">
      ${card("Can collide", scan.totals.can, "overlapping reach, different values", scan.totals.can ? "bad" : "ok")}
      ${card("May collide", scan.totals.may, "a filter or shared membership decides", scan.totals.may ? "" : "ok")}
      ${card("Cannot collide", scan.totals.cannot, "no overlapping reach as assigned")}
      ${card("Settings set by &gt;1 policy", scan.comparedSettings, "what was actually compared")}
      ${collectRes.failed.length ? card("Surfaces unread", collectRes.failed.length, "conflicts there are unknown, not absent", "bad") : ""}
    </div>`;

    const notes = [];
    notes.push(`<p class="mini muted"><b>A verdict is about group targeting, and "may" is may.</b> Can collide means overlapping reach as assigned — which value wins on a device is Intune's own conflict resolution. Different groups are never "cannot": different groups can share members, and a browser cannot see membership. An assignment filter caps any verdict at may. A collision that spans two surfaces — a settings-catalog policy and a legacy device configuration driving the same CSP — is <b>not detected</b>, and within device configurations only policies of the same type are compared, because matching across types by display name is the mistake this tool exists to avoid.</p>`);
    if (scan.redactedSkipped) notes.push(`<p class="mini muted"><b>${scan.redactedSkipped} redacted values were not compared.</b> Secrets pass the documenter's redaction gate before this tool sees them; two values both reading “redacted” are not known to be equal, and a conflict row printing them would be a disclosure.</p>`);
    if (collectRes.failed.length) notes.push(`<div class="gu-fail"><b>${collectRes.failed.map((f) => esc(f.label)).join(", ")} could not be read.</b><span class="why">Conflicts there are unknown, not absent.</span></div>`);

    const fold = (c) => {
      const key = `${c.sectionLabel}|${c.label}`;
      const isOpen = open.has(key);
      const cls = c.verdict === "can" ? "bad" : c.verdict === "may" ? "warn" : "ok";
      const head = `<div class="au-ev-h">
          <b>${esc(c.icon)} ${esc(c.label)}</b>
          <span class="au-op ${c.verdict === "can" ? "delete" : c.verdict === "may" ? "update" : "create"}">${esc(Conflict.V_LABEL[c.verdict])}</span>
          <span class="au-when mini muted">${esc(c.sectionLabel)}</span></div>
        <div class="mini muted au-ev-m">${c.policies.length} polic${c.policies.length === 1 ? "y" : "ies"} · ${esc(c.reason)} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>`;
      const detail = !isOpen ? "" : `<div class="au-detail"><div class="au-2col">
        ${c.policies.map((p) => `<div>
          <b>${esc(p.name)}</b>${p.none ? ' <span class="gu-how exc" title="No include and no tenant-wide target">reaches nobody</span>' : ""}${p.filtered ? ' <span class="gu-how priv">filtered</span>' : ""}${p.tenantWide ? ' <span class="gu-how priv">tenant-wide</span>' : ""}
          <div class="mini muted">${esc(p.platform)}</div>
          <div class="mini" style="margin-top:4px">value: <code>${esc(p.value)}</code></div>
        </div>`).join("")}
      </div></div>`;
      return `<div class="au-fold ${cls} ${isOpen ? "open" : ""}" data-cffold="${esc(key)}"><div class="au-ev-card">${head}${detail}</div></div>`;
    };

    // The platform filter (build 10524): a conflict wears the platforms of
    // the POLICIES in it — the documenter's platform strings, carried on
    // each compared policy since the scan was born. Narrows the LIST; the
    // verdict cards keep counting the whole scan, said in the title.
    const platsOfConflict = (c) => [...new Set(c.policies.flatMap((p) =>
      String(p.platform || "").split(",").map((x) => x.trim()).filter(Boolean)))];
    const platsHere = [...new Set(scan.conflicts.flatMap(platsOfConflict))].sort();
    const platCount = (p) => scan.conflicts.filter((c) => platsOfConflict(c).includes(p)).length;
    const shownConflicts = scan.conflicts.filter((c) => (cfPlat === "all" || platsOfConflict(c).includes(cfPlat))
      && (!cfVerdict || c.verdict === cfVerdict));
    const platSelHtml = platsHere.length > 1
      ? `<label class="sel-filter" style="margin:0 0 8px" title="Narrows the conflict list to one platform's policies. The verdict cards above keep counting the whole scan.">
          <span>Platform</span>
          <select id="cfPlatform">${[["all", `All platforms (${scan.conflicts.length})`]].concat(platsHere.map((p) => [p, `${p} (${platCount(p)})`]))
            .map(([v, l]) => `<option value="${esc(v)}"${v === cfPlat ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
        </label>` : "";

    let listHtml = "";
    if (cfMode === "setting") listHtml = shownConflicts.map(fold).join("");
    else {
      const resolver = typeof collectRes.resolver === "function" ? collectRes.resolver : null;
      const counts = collectRes.groupCounts || {};
      const blocks = cfMode === "pair" ? Conflict.blocksByPair(shownConflicts)
        : Conflict.blocksByGroup(shownConflicts, {
          groupName: (g) => { const n = resolver ? resolver(g) : ""; return n && n !== g ? n : ""; },
          groupCount: (g) => (Number.isFinite(counts[g]) ? counts[g] : null),
        });
      const lineHtml = (ln) => `<div class="cf-line"><div><b>${esc(ln.conflict.icon)} ${esc(ln.conflict.label)}</b><div class="mini muted">${esc(ln.conflict.sectionLabel)}</div></div>
        <div class="cf-vals">${sidesHtml(ln.sides)}</div>${pillOf(ln.verdict)}</div>`;
      const ICON = { group: "👥", tenant: "🌐", pair: "⚔️", can: "⚔️", may: "❓", cannot: "✅" };
      listHtml = blocks.map((b, i) => {
        const pols = new Set(b.lines.flatMap((l) => l.sides.map((sd) => sd.id))).size;
        const worst = b.lines.some((l) => l.verdict === "can") ? "" : b.lines.some((l) => l.verdict === "may") ? "may" : "cannot";
        const head = `${ICON[b.kind] || "👥"} <b>${esc(b.name)}</b>${b.count !== null && b.count !== undefined ? ` <span class="mini muted">${b.count} member${b.count === 1 ? "" : "s"}</span>` : ""}
          <span class="gu-how ${worst ? "priv" : "exc"}">${b.lines.length} setting${b.lines.length === 1 ? "" : "s"} collide</span>
          <span class="mini muted">${cfMode === "pair" ? "" : `${pols} polic${pols === 1 ? "y" : "ies"}`}${b.why ? ` · ${esc(b.why)}` : ""}</span>`;
        return blockHtml(b, isOpenBlk(b.key, i), head, b.lines.map(lineHtml).join(""), worst);
      }).join("");
    }
    const body = scan.conflicts.length
      ? (listHtml
        || `<p class="mini" style="margin-top:10px">No ${esc(cfPlat)} conflicts — clear the platform filter and the list comes back.</p>`)
      : `<p class="mini" style="margin-top:10px"><b>No setting is configured to different values by overlapping policies</b> — across ${scan.comparedSettings} settings that more than one policy configures${collectRes.failed.length ? ", on the surfaces that could be read" : ""}.</p>`;

    // Where the collection came from is part of the answer (10523): a scan
    // over a cached read says so and says when.
    let src = "";
    if (collectRes.readAt) {
      let t = ""; try { t = new Date(collectRes.readAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { t = ""; }
      src = `<p class="mini muted" style="margin:0 0 8px">Scanned over ${collectRes.fromWarm ? "the sign-in read" : "the shared read"} at ${esc(t)} — ⚔️ Scan the tenant re-reads.</p>`;
    }
    const nOf = (v) => scan.conflicts.filter((c) => (cfPlat === "all" || platsOfConflict(c).includes(cfPlat)) && c.verdict === v).length;
    const chip = (v, label) => `<button class="fchip${cfVerdict === v ? " active" : ""}" data-cfverdict="${v || ""}" type="button">${label} (${v ? nOf(v) : scan.conflicts.length})</button>`;
    // Slot order (10664): the verdict chips and the platform select are both
    // filters, so the chips sit in a .chip-filter and keep their place before
    // the select instead of being sorted after it.
    const modeBtn = (m, label) => `<button type="button" data-cfmode="${m}" class="${cfMode === m ? "active" : ""}">${label}</button>`;
    const toolbar = scan.conflicts.length ? `<div class="toolbar">
      <span class="seg">${modeBtn("group", "👥 By group")}${modeBtn("setting", "🎛 By setting")}${modeBtn("pair", "⚔️ By policy pair")}</span>
      <span class="chip-filter">${chip(null, "All")}${chip("can", "⚔️ Can collide")}${chip("may", "❓ May")}${chip("cannot", "✅ Cannot")}</span>
      ${platSelHtml.replace('style="margin:0 0 8px"', 'style="margin:0"')}
    </div>` : "";
    $("cfBody").innerHTML = src + cards + toolbar + `<div class="list-card">${notes.join("")}
      ${scan.conflicts.length ? `<p class="mini muted" style="margin:8px 0 0">${cfMode === "setting" ? "Click a conflict for the side-by-side comparison — every policy's value and reach." : cfMode === "group" ? "Each group that two disagreeing policies both reach, with every colliding setting and each policy's value. A tenant-wide policy reaches every group it does not exclude — said as <i>via All devices</i>. Click a heading to fold it." : "Each pair of policies that disagree, with the settings they disagree on."} The chips stay put while the list scrolls.</p>` : ""}
      <div style="margin-top:10px">${body}</div></div>`;
    wireBlocks();
    $("cfBody").querySelectorAll("[data-cfmode]").forEach((b) => b.addEventListener("click", () => {
      if (cfMode === b.dataset.cfmode) return;
      cfMode = b.dataset.cfmode; blkOpen.clear(); blkTouched = false;
      render();
    }));
    $("cfBody").querySelectorAll("[data-cfverdict]").forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.cfverdict || null;
      cfVerdict = (cfVerdict === v) ? null : v;
      render();
    }));

    $("cfBody").querySelectorAll("[data-cffold]").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.closest("a,code")) return;
      const k = el.dataset.cffold;
      open.has(k) ? open.delete(k) : open.add(k);
      render();
    }));
  }

  function exportAs(fmt) {
    const m = Conflict.meta(collectRes);
    if (view === "devices") {
      if (fmt === "md") return download("Intune-devices-in-conflict.md", ConflictDevices.markdown(devRes, m), "text/markdown");
      return download("Intune-devices-in-conflict.csv", ConflictDevices.csv(devRes), "text/csv");
    }
    if (fmt === "md") return download("Intune-setting-conflicts.md", Conflict.markdown(scan, collectRes, m), "text/markdown");
    const resolver = typeof collectRes.resolver === "function" ? collectRes.resolver : null;
    return download("Intune-setting-conflicts.csv", Conflict.csv(scan, { groupName: (g) => { const n = resolver ? resolver(g) : ""; return n && n !== g ? n : ""; } }), "text/csv");
  }

  function init() {
    if (!$("cfRun")) return;
    // the warm start (build 10523) — registered, so app.js stays ignorant of tools
    (window.TunoScreenHooks = window.TunoScreenHooks || {})["screen-conflict"] = onShow;
    $("cfRun").addEventListener("click", run);
    // Delegated from the static host — cfBody is rebuilt on every render.
    $("cfBody").addEventListener("change", (e) => {
      const ps = e.target.closest("#cfPlatform");
      if (ps) { cfPlat = ps.value; render(); }
    });
    // The device search keeps focus across the re-render it causes.
    $("cfBody").addEventListener("input", (e) => {
      const si = e.target.closest("#dvSearch");
      if (!si) return;
      dvQuery = si.value;
      const pos = si.selectionStart;
      render();
      const n = $("dvSearch"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* type=search may refuse */ } }
    });
    const vs = $("cfView");
    if (vs) vs.addEventListener("click", (e) => { const b = e.target.closest("[data-cfview]"); if (b) setView(b.dataset.cfview); });
    $("cfMd").addEventListener("click", () => exportAs("md"));
    $("cfCsv").addEventListener("click", () => exportAs("csv"));
  }

  return { init, run, setView };
})();

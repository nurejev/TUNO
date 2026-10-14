// ======================================================================
// T30 — 📏 OS floor keeper (build 10705). After James Robinson's
// IntuneComplianceMaintainer (SkipToTheEndpoint, MIT; vendored verbatim in
// vendor/intune-compliance-maintainer/, upstream commit 8264d95).
//
// Mihai, 14 Oct 2026: "make this a tool in TUNO" — off the mockup canvas
// "TUNO · OS floor keeper": Plan · Rules · Unattended · Journal.
//
// What the script does, kept: the minimum OS version in compliance and
// app-protection policies follows the newest release one CADENCE behind —
// iOS / iPadOS / macOS from endoflife.date (the latest patch of a major and
// its date), Android the oldest maintained release plus the monthly
// security patch level (dated the 1st), Windows the newest quality updates
// in the Graph Windows Update catalog per build, written as build ranges or
// a minimum version. A floor never goes down unless that is allowed.
//
// What TUNO changes, and why:
//   * NOTHING IS WRITTEN WITHOUT A TICK. The script's dry run is the plan;
//     the write is the ticked rows, one policy at a time through the run
//     ledger, each re-read first (a value that moved since the plan is
//     skipped, never overwritten) and read back after.
//   * FORCE IS PER ROW. The script's $ForceApply forces every platform; a
//     ◷ row here is forced by ticking it, alone.
//   * ONE ROW PER SETTING. The script reports the OS version and Android's
//     patch level as one result; they are two settings and two rows here,
//     and Android's OS row needs no cadence (it is the oldest MAINTAINED
//     release — nothing new to wait for).
//   * AN APPLE MAJOR CAN BE HELD. The script follows the newest major; the
//     rules can keep iOS, iPadOS or macOS on the previous major's latest
//     patch until it is moved on. No script variable exists for that, so
//     the runbook export says it is left out.
//   * POLICIES ARE PICKED FROM THE TENANT, not pasted as GUIDs.
//   * EVERY WRITE IS JOURNALLED with its old value, and can be set back.
//
// The engine (OsFloor) is DOM-free for the headless suite; the screen is
// OsFloorTool below it.
// ======================================================================
const OsFloor = (() => {
  "use strict";

  const DAY = 86400000;
  const EOL_BASE = "https://endoflife.date/api/v1/products/";
  const VENDOR = "vendor/intune-compliance-maintainer/";

  // Compliance policy types → the platform whose floor they carry. An iOS
  // compliance policy covers iPhone and iPad alike; which release it
  // follows (iOS or iPadOS) is a rule per policy, iOS by default.
  const COMPLIANCE_TYPES = {
    "#microsoft.graph.iosCompliancePolicy": "iOS",
    "#microsoft.graph.macOSCompliancePolicy": "macOS",
    "#microsoft.graph.androidWorkProfileCompliancePolicy": "Android",
    "#microsoft.graph.androidDeviceOwnerCompliancePolicy": "Android",
    "#microsoft.graph.androidCompliancePolicy": "Android",
    "#microsoft.graph.aospDeviceOwnerCompliancePolicy": "Android",
    "#microsoft.graph.windows10CompliancePolicy": "Windows",
  };
  // App protection: the collection, the platform, the type a write names.
  const APP_COLLECTIONS = [
    { coll: "iosManagedAppProtections", platform: "iOS", type: "#microsoft.graph.iosManagedAppProtection" },
    { coll: "androidManagedAppProtections", platform: "Android", type: "#microsoft.graph.androidManagedAppProtection" },
    { coll: "windowsManagedAppProtections", platform: "Windows", type: "#microsoft.graph.windowsManagedAppProtection" },
  ];
  const PLATFORMS = ["iOS", "iPadOS", "macOS", "Android", "Windows"];
  const EOL_SLUG = { iOS: "ios", iPadOS: "ipados", macOS: "macos", Android: "android" };

  // ---- rules: the script's variables, plus TUNO's ------------------------
  function defaultRules() {
    return {
      cadenceDays: 14,
      allowDowngrade: false,
      track: { iOS: "newest", iPadOS: "newest", macOS: "newest" },
      androidMin: "",
      androidPatch: true,
      win: { builds: ["26100", "26200"], classification: "security", count: 1, allowNewer: false, mode: "Ranges", appTarget: "Lowest" },
      scope: {},          // policyKey -> { on, track: "iOS" | "iPadOS" }
    };
  }
  function normRules(r) {
    const d = defaultRules(), x = r && typeof r === "object" ? r : {};
    const w = Object.assign({}, d.win, x.win || {});
    w.builds = (Array.isArray(w.builds) ? w.builds : d.win.builds).map((b) => String(b).trim()).filter((b) => /^\d{5}$/.test(b));
    w.count = Math.max(1, Math.min(12, parseInt(w.count, 10) || 1));
    if (w.classification !== "nonSecurity") w.classification = "security";
    if (w.mode !== "MinimumVersion") w.mode = "Ranges";
    if (w.appTarget !== "Highest") w.appTarget = "Lowest";
    w.allowNewer = !!w.allowNewer;
    const cad = parseInt(x.cadenceDays, 10);
    return {
      cadenceDays: Number.isFinite(cad) && cad >= 0 && cad <= 365 ? cad : d.cadenceDays,
      allowDowngrade: !!x.allowDowngrade,
      track: Object.assign({}, d.track, x.track || {}),
      androidMin: String(x.androidMin || "").trim(),
      androidPatch: x.androidPatch === undefined ? true : !!x.androidPatch,
      win: w,
      scope: Object.assign({}, x.scope || {}),
    };
  }

  // ---- versions ----------------------------------------------------------
  // [version] semantics: numeric segments, missing ones count as 0, so
  // 26.7 == 26.7.0 < 26.7.1. A non-numeric value compares as text.
  function cmpVer(a, b) {
    const pa = String(a == null ? "" : a).trim(), pb = String(b == null ? "" : b).trim();
    if (!/^\d+(\.\d+)*$/.test(pa) || !/^\d+(\.\d+)*$/.test(pb)) return pa < pb ? -1 : pa > pb ? 1 : 0;
    const x = pa.split(".").map(Number), y = pb.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d < 0 ? -1 : 1;
    }
    return 0;
  }
  const cmpText = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
  const isBlank = (v) => v === null || v === undefined || v === "";
  // Date-like, not `instanceof Date`: a date from another realm (a test, a
  // frame) is still a date.
  const isDate = (d) => !!d && typeof d.getTime === "function" && !isNaN(d.getTime());
  const ymd = (d) => (isDate(d) ? new Date(d.getTime()).toISOString().slice(0, 10) : "");
  const addDays = (d, n) => (d ? new Date(d.getTime() + n * DAY) : null);
  const asDate = (s) => { const d = new Date(s); return isNaN(d.getTime()) ? null : d; };

  // ---- release data: endoflife.date -------------------------------------
  // /api/v1/products/<slug>/ → result.releases[]: name, releaseDate,
  // isMaintained, latest { name, date }. The script reads the newest one
  // through /releases/latest; the list carries the same objects and the
  // previous major beside it.
  function releasesOf(json) {
    const r = json && json.result;
    const list = (r && Array.isArray(r.releases)) ? r.releases : (r && r.name ? [r] : []);
    return list.slice().sort((a, b) => cmpText(b.releaseDate || "", a.releaseDate || "") || cmpVer(b.name, a.name));
  }
  // An Apple platform: the newest major's latest patch, or the previous
  // major's when the rule holds it back. Cadence counts from the PATCH date.
  function appleRelease(json, track, cadenceDays) {
    const rel = releasesOf(json);
    if (!rel.length) return { error: "endoflife.date returned no releases" };
    const pick = track === "previous" ? rel[1] : rel[0];
    if (!pick) return { error: "there is no previous major to hold on" };
    const latest = pick.latest || {};
    const version = latest.name || pick.name;
    const released = asDate(latest.date || pick.releaseDate);
    return { version: String(version), major: String(pick.name), released, effective: addDays(released, cadenceDays),
      newestMajor: String(rel[0].name), held: track === "previous" };
  }
  // Android: the oldest MAINTAINED release (or the override, refused when it
  // is no longer maintained — as the script throws), and the patch level of
  // the 1st of this month, effective after the cadence.
  function androidRelease(json, override, cadenceDays, now) {
    const rel = releasesOf(json).filter((r) => r.isMaintained === true);
    if (!rel.length) return { error: "endoflife.date lists no maintained Android release" };
    rel.sort((a, b) => cmpVer(a.name, b.name));
    let pick = rel[0];
    if (override) {
      pick = rel.find((r) => String(r.name) === String(override));
      if (!pick) return { error: `Android ${override} is not a maintained release — maintained: ${rel.map((r) => r.name).join(", ")}` };
    }
    const n = isDate(now) ? new Date(now.getTime()) : new Date();
    const first = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
    return { version: String(pick.name), maintained: rel.map((r) => String(r.name)), patch: ymd(first), released: first, effective: addDays(first, cadenceDays) };
  }

  // ---- release data: the Windows Update catalog --------------------------
  // The script's own request, unchanged: the newest N quality updates of the
  // chosen classification with their product revisions (10.0.<build>.<ubr>).
  function catalogPath(win) {
    const t = "microsoft.graph.windowsUpdates.qualityUpdateCatalogEntry";
    return `/admin/windows/updates/catalog/entries?$select=${t}/productRevisions&$expand=${t}/productRevisions`
      + `&$filter=${t}/qualityUpdateClassification eq '${win.classification === "nonSecurity" ? "nonSecurity" : "security"}'`
      + `&$orderby=releaseDateTime desc&$top=${win.count}`;
  }
  function windowsRelease(entries, win, cadenceDays) {
    const revs = [];
    for (const e of entries || []) {
      const r = e["microsoft.graph.windowsUpdates.qualityUpdateCatalogEntry/productRevisions"] || e.productRevisions || [];
      for (const x of r) revs.push(x);
    }
    const ranges = [], per = [];
    let released = null;
    for (const b of win.builds) {
      const vs = revs.filter((r) => new RegExp(`^10\\.0\\.${b}\\.`).test(String(r.id || "")))
        .sort((a, c) => cmpText(a.releaseDateTime || "", c.releaseDateTime || "") || cmpVer(a.id, c.id));
      if (!vs.length) { per.push({ build: b, missing: true }); continue; }
      const lo = vs[0], hi = vs[vs.length - 1];
      const d = asDate(hi.releaseDateTime);
      if (d && (!released || d > released)) released = d;
      ranges.push({ "@odata.type": "microsoft.graph.operatingSystemVersionRange",
        description: `${hi.product || "Windows"} - ${hi.version || b}`.trim(),
        lowestVersion: String(lo.id), highestVersion: win.allowNewer ? `10.0.${b}.9999` : String(hi.id) });
      per.push({ build: b, lowest: String(lo.id), highest: String(hi.id), released: d, label: hi.version || "" });
    }
    if (!ranges.length) return { error: entries && entries.length ? `the catalog's newest ${win.count} update${win.count === 1 ? "" : "s"} carry none of builds ${win.builds.join(", ")}` : "the catalog returned no quality updates", per };
    const lows = ranges.map((r) => r.lowestVersion).sort(cmpVer);
    const highs = ranges.map((r) => r.highestVersion).sort(cmpVer);
    return {
      ranges, per, released, effective: addDays(released, cadenceDays),
      minimum: lows[lows.length - 1],                                   // the script's HighestLowest
      app: win.appTarget === "Highest" ? highs[highs.length - 1] : lows[0], // HighestHighest | LowestLowest
    };
  }
  function rangeText(ranges) {
    const items = (Array.isArray(ranges) ? ranges : []).filter((r) => r && r.lowestVersion && r.highestVersion)
      .map((r) => `${r.lowestVersion}–${r.highestVersion}`);
    return items.length ? items.join(" · ") : "";
  }
  // Ranges compare by build: lower when any build's lowest would move down.
  function cmpRanges(cur, tgt) {
    if (rangeText(cur) === rangeText(tgt)) return 0;
    const lowOf = (rs, b) => { const r = (rs || []).find((x) => new RegExp(`^10\\.0\\.${b}\\.`).test(String(x.lowestVersion || ""))); return r ? r.lowestVersion : null; };
    for (const t of tgt || []) {
      const b = (String(t.lowestVersion).split(".")[2]) || "";
      const c = lowOf(cur, b);
      if (c && cmpVer(c, t.lowestVersion) > 0) return 1;
    }
    return -1;
  }

  // ---- the inventory ------------------------------------------------------
  const policyKey = (kind, id) => `${kind}|${id}`;
  function inventory(compliance, apps) {
    const out = [];
    for (const p of compliance || []) {
      const platform = COMPLIANCE_TYPES[p["@odata.type"]];
      if (!platform) continue;
      out.push({ key: policyKey("compliance", p.id), kind: "compliance", id: p.id, name: p.displayName || p.id, platform,
        odataType: p["@odata.type"], path: `/deviceManagement/deviceCompliancePolicies/${encodeURIComponent(p.id)}`, raw: p });
    }
    for (const a of apps || []) {
      const c = APP_COLLECTIONS.find((x) => x.coll === a.__coll);
      if (!c) continue;
      out.push({ key: policyKey("app", a.id), kind: "app", id: a.id, name: a.displayName || a.id, platform: c.platform,
        odataType: a["@odata.type"] || c.type, path: `/deviceAppManagement/${c.coll}/${encodeURIComponent(a.id)}`, coll: c.coll, raw: a });
    }
    const rank = (p) => PLATFORMS.indexOf(p.platform);
    return out.sort((a, b) => rank(a) - rank(b) || (a.kind === b.kind ? 0 : a.kind === "compliance" ? -1 : 1) || a.name.localeCompare(b.name));
  }
  // The release an inventory item follows: iOS-type policies by their rule.
  function trackOf(item, rules) {
    if (item.platform !== "iOS") return item.platform;
    const s = rules.scope[item.key];
    return s && s.track === "iPadOS" ? "iPadOS" : "iOS";
  }
  const inScope = (item, rules) => !!(rules.scope[item.key] && rules.scope[item.key].on);

  // ---- the plan: one row per setting --------------------------------------
  // state: up (will update) · wait (not yet — tick to force) · meets ·
  // lower (would lower, kept) · nodata · error
  function outcome(c, effective, now, rules) {
    if (c === 0) return "meets";
    if (c > 0 && !rules.allowDowngrade) return "lower";
    if (effective && now < effective) return "wait";
    return "up";
  }
  function plan(inv, releases, rulesIn, nowIn) {
    const rules = normRules(rulesIn);
    const now = isDate(nowIn) ? new Date(nowIn.getTime()) : new Date();
    const rows = [];
    const push = (item, field, label, cur, tgt, rel, extra) => {
      const base = { key: `${item.key}|${field}`, policyKey: item.key, kind: item.kind, id: item.id, name: item.name, platform: item.platform,
        track: trackOf(item, rules), odataType: item.odataType, path: item.path, field, label, nowRaw: cur, targetRaw: tgt,
        released: rel && rel.released ? rel.released : null, effective: null, why: "" };
      Object.assign(base, extra || {});
      rows.push(base);
      return base;
    };
    for (const item of inv) {
      if (!inScope(item, rules)) continue;
      const p = item.raw || {};
      const track = trackOf(item, rules);
      const rel = releases[track] || { error: track === "Windows" ? "the Windows Update catalog was not read — it is read for Windows policies in scope; press Read again" : "release data not read — press Read again" };
      const noData = (field, label, cur) => push(item, field, label, cur, null, null, { state: "nodata", why: rel.error || "no release data" });

      if (item.platform === "Windows") {
        if (item.kind === "compliance" && rules.win.mode === "Ranges") {
          const cur = Array.isArray(p.validOperatingSystemBuildRanges) ? p.validOperatingSystemBuildRanges : [];
          if (rel.error) { noData("validOperatingSystemBuildRanges", "build ranges", cur); continue; }
          const c = cmpRanges(cur, rel.ranges);
          push(item, "validOperatingSystemBuildRanges", "build ranges", cur, rel.ranges, rel,
            { ranges: true, effective: rel.effective, state: outcome(c, rel.effective, now, rules),
              why: c > 0 ? "a build's lowest version would move down" : "" });
          continue;
        }
        const field = item.kind === "app" ? "minimumRequiredOsVersion" : "osMinimumVersion";
        const cur = isBlank(p[field]) ? null : String(p[field]);
        if (rel.error) { noData(field, "minimum OS", cur); continue; }
        const tgt = item.kind === "app" ? rel.app : rel.minimum;
        const c = cur === null ? -1 : cmpVer(cur, tgt);
        push(item, field, "minimum OS", cur, tgt, rel, { effective: rel.effective, state: outcome(c, rel.effective, now, rules),
          why: c > 0 ? `${cur} is above the target — left as it is` : "" });
        continue;
      }

      const osField = item.kind === "app" ? "minimumRequiredOsVersion" : "osMinimumVersion";
      const cur = isBlank(p[osField]) ? null : String(p[osField]);
      if (rel.error) noData(osField, "minimum OS", cur);
      else {
        const c = cur === null ? -1 : cmpVer(cur, rel.version);
        const eff = item.platform === "Android" ? null : rel.effective;
        push(item, osField, "minimum OS", cur, rel.version, rel, { effective: eff, state: outcome(c, eff, now, rules),
          why: c > 0 ? `${cur} is above the target — left as it is`
            : item.platform === "Android" ? (rules.androidMin ? `Android ${rules.androidMin}, set in the rules` : "the oldest maintained release")
            : rel.held ? `held on ${rel.major} — the newest major is ${rel.newestMajor}` : "" });
      }
      if (item.platform === "Android" && rules.androidPatch) {
        const pf = item.kind === "app" ? "minimumRequiredPatchVersion" : "minAndroidSecurityPatchLevel";
        if (!(pf in p) && item.kind === "compliance") continue;   // a type without the setting
        const pc = isBlank(p[pf]) ? null : String(p[pf]).slice(0, 10);
        if (rel.error) { noData(pf, "security patch level", pc); continue; }
        const c = pc === null ? -1 : cmpText(pc, rel.patch);
        push(item, pf, "security patch level", pc, rel.patch, rel, { effective: rel.effective, state: outcome(c, rel.effective, now, rules),
          why: c > 0 ? `${pc} is newer than the target — left as it is` : "" });
      }
    }
    for (const r of rows) {
      r.now = r.ranges ? (rangeText(r.nowRaw) || "—") : (isBlank(r.nowRaw) ? "—" : String(r.nowRaw));
      r.target = r.targetRaw === null ? "—" : r.ranges ? rangeText(r.targetRaw) : String(r.targetRaw);
      r.tickable = r.state === "up" || r.state === "wait";
    }
    return rows;
  }
  const STATE = {
    up: { glyph: "↑", label: "Will update", cls: "up" },
    wait: { glyph: "◷", label: "Not yet", cls: "wait" },
    meets: { glyph: "=", label: "Already meets", cls: "meets" },
    lower: { glyph: "↓", label: "Would lower", cls: "lower" },
    nodata: { glyph: "!", label: "No data", cls: "err" },
    error: { glyph: "!", label: "Error", cls: "err" },
  };
  const defaultTicks = (rows) => new Set(rows.filter((r) => r.state === "up").map((r) => r.key));

  // ---- the write: one PATCH per policy, the ticked settings together ------
  function groups(rows, ticks) {
    const by = new Map();
    for (const r of rows) {
      if (!ticks.has(r.key) || !r.tickable) continue;
      if (!by.has(r.policyKey)) by.set(r.policyKey, { policyKey: r.policyKey, kind: r.kind, id: r.id, name: r.name, platform: r.platform, odataType: r.odataType, path: r.path, rows: [] });
      by.get(r.policyKey).rows.push(r);
    }
    return [...by.values()];
  }
  function patchBody(g) {
    const body = { "@odata.type": g.odataType };
    for (const r of g.rows) body[r.field] = r.ranges ? (r.targetRaw || []) : (isBlank(r.targetRaw) ? null : r.targetRaw);
    return body;
  }
  // A patch level is a date; Graph may hand it back with a time on it.
  const same = (r, v, want) => {
    if (r.ranges) return rangeText(v) === rangeText(want);
    if (isBlank(v) && isBlank(want)) return true;
    const n = /Patch/.test(r.field) ? 10 : 99;
    return String(v == null ? "" : v).slice(0, n) === String(want == null ? "" : want).slice(0, n);
  };
  // Before: every setting still holds what the plan read. After: every
  // setting holds what was written.
  const drifted = (g, live) => g.rows.filter((r) => !same(r, live[r.field], r.nowRaw));
  const missed = (g, live) => g.rows.filter((r) => !same(r, live[r.field], r.targetRaw));

  // ---- the journal ---------------------------------------------------------
  function journalEntries(g, by, when, setBack) {
    return g.rows.map((r) => ({ when, by: by || "", policy: g.name, platform: g.platform, kind: g.kind, id: g.id, path: g.path, odataType: g.odataType,
      field: r.field, label: r.label, ranges: !!r.ranges, from: r.nowRaw, to: r.targetRaw, fromText: r.now, toText: r.target, setBack: !!setBack }));
  }
  // A journal entry as a one-row group that writes its old value again: the
  // plan's "now" is what was written, the target what it replaced.
  function groupOfEntry(e) {
    const row = { key: `${e.kind}|${e.id}|${e.field}`, field: e.field, label: e.label, ranges: e.ranges,
      nowRaw: e.to, targetRaw: e.from, now: e.toText, target: e.fromText, tickable: true };
    return { policyKey: `${e.kind}|${e.id}`, kind: e.kind, id: e.id, name: e.policy, platform: e.platform, odataType: e.odataType, path: e.path, rows: [row] };
  }

  // Floor changes in the Intune audit log (T03's read, 30 days): any actor —
  // TUNO, the runbook's managed identity, someone in the portal.
  const FLOOR_FIELDS = /^(osminimumversion|validoperatingsystembuildranges|minandroidsecuritypatchlevel|minimumrequiredosversion|minimumrequiredpatchversion)\b/i;
  function floorChanges(auditRows) {
    const out = [];
    for (const a of auditRows || []) {
      const ch = (a.changes || []).filter((c) => FLOOR_FIELDS.test(String(c.path || "").split(/[.[]/)[0]));
      if (!ch.length) continue;
      out.push({ when: a.when, by: a.actor, byKind: a.actorKind, policy: a.name, ok: a.ok,
        changes: ch.map((c) => ({ field: c.path, from: c.from, to: c.to })) });
    }
    return out;
  }

  // ---- the runbook export --------------------------------------------------
  const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
  function configBlock(rulesIn, inv, tenantId) {
    const rules = normRules(rulesIn);
    const comp = { iOS: [], iPadOS: [], macOS: [], Android: [], Windows: [] };
    const app = { iOS: [], iPadOS: [], Android: [], Windows: [] };
    for (const it of inv || []) {
      if (!inScope(it, rules)) continue;
      const t = trackOf(it, rules);
      (it.kind === "compliance" ? comp : app)[t].push(`${psq(it.id)}  # ${String(it.name).replace(/[\r\n]+/g, " ")}`);
    }
    const table = (o) => Object.keys(o).map((k) => o[k].length
      ? `  ${k.padEnd(7)} = @(\n${o[k].map((l) => `    ${l}`).join("\n").replace(/  #/g, ",  #").replace(/,  #([^\n]*)$/, "  #$1")}\n  )`
      : `  ${k.padEnd(7)} = @()`).join("\n");
    const held = Object.keys(rules.track).filter((k) => rules.track[k] === "previous");
    const L = [
      "# --------------------------- Authentication ---------------------------",
      "# Written by TUNO's 📏 OS floor keeper from its Rules. Azure Automation,",
      "# system-assigned managed identity — grant it the three Graph app roles",
      "# with Grant-ManagedIdentityGraphPermissions.ps1 first.",
      `$AuthMode              = "ManagedIdentity"`,
      `$TenantId              = "${tenantId || "<tenant-id>"}"`,
      `$ClientId              = ""`,
      `$CertThumbprint        = ""`,
      `$ClientSecret          = ""`,
      "",
      "# Optional: clientId of user-assigned managed identity",
      `$UserAssignedClientId  = ""`,
      "",
      "# Optional Key Vault lookups (leave blank to skip)",
      `$KeyVaultName          = ""`,
      `$KeyVaultSecretName    = ""`,
      "",
      "# --------------------------- Environment Configuration ---------------------------",
      "# Cadence: days after update release before enforcing via policy",
      `$CadenceDays           = ${rules.cadenceDays}`,
      "",
      "# Policy IDs to update (per platform) — picked in TUNO",
      "$CompliancePolicies = @{",
      table(comp),
      "}",
      "$AppProtectionPolicies = @{",
      table(app),
      "}",
      "",
      "# Windows-specific settings",
      `$WindowsBuildNumbers          = @(${rules.win.builds.map((b) => `"${b}"`).join(",")})`,
      `$WindowsUpdateClassification  = "${rules.win.classification}"`,
      `$WindowsNumberOfUpdates       = ${rules.win.count}`,
      `$WindowsAllowNewerBuilds      = $${rules.win.allowNewer ? "true" : "false"}`,
      `$WindowsComplianceMode        = "${rules.win.mode}"`,
      `$WindowsAppProtectionTarget   = "${rules.win.appTarget}"`,
      "",
      "# Android-specific settings",
      `$AndroidMinimumVersion        = "${rules.androidMin}"`,
      "",
      "# --------------------------- Safety ---------------------------",
      "# Allow lowering existing minimum (if set)? Default false",
      `$AllowDowngrade        = $${rules.allowDowngrade ? "true" : "false"}`,
      "",
      "# Dry run (report only, no changes) — leave it on for the first week and",
      "# compare its output with TUNO's Plan before turning it off.",
      `$DryRun                = $true`,
      "",
      "# Force apply even if cadence/effective date not reached",
      `$ForceApply            = $false`,
      "",
    ];
    const left = [];
    if (held.length) left.push(`# NOT EXPORTED: TUNO holds ${held.join(", ")} on the previous major. The script always follows the newest major.`);
    if (!rules.androidPatch) left.push("# NOT EXPORTED: TUNO leaves Android's patch level alone. The script always sets it on Android policies.");
    left.push("# NOT EXPORTED: TUNO forces single rows ahead of the cadence; $ForceApply forces every platform.");
    return L.concat(left, [""]).join("\n");
  }
  // The vendored script with its configuration region replaced — everything
  // from the Authentication banner to the Script Variables banner.
  function runbook(scriptText, rules, inv, tenantId, meta) {
    const s = String(scriptText || "");
    const a = s.indexOf("# --------------------------- Authentication");
    const b = s.indexOf("# --------------------------- Script Variables");
    if (a < 0 || b < a) throw new Error("the vendored script's configuration banners were not found — it has changed shape; refusing to guess where the settings go");
    const stamp = `# Configuration exported by TUNO ${meta && meta.build ? meta.build : ""} on ${meta && meta.when ? meta.when : ""}${meta && meta.by ? ` by ${meta.by}` : ""}.\n`;
    return s.slice(0, a) + stamp + configBlock(rules, inv, tenantId) + "\n" + s.slice(b);
  }

  // ---- export ---------------------------------------------------------------
  function csv(rows) {
    const q = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const L = ["platform,release,type,policy,setting,current,target,outcome,effective,why"];
    for (const r of rows) L.push([r.platform, r.track, r.kind === "app" ? "App protection" : "Compliance", q(r.name), r.field, q(r.now), q(r.target),
      (STATE[r.state] || {}).label || r.state, ymd(r.effective), q(r.why)].join(","));
    return L.join("\n");
  }

  // ---- the demo tenant's release data (Graph's demo router serves Graph only) --
  function demoEol(slug, now) {
    const n = isDate(now) ? new Date(now.getTime()) : new Date();
    const d = (days) => ymd(new Date(n.getTime() - days * DAY));
    const apple = (cur, prev) => ({ result: { releases: [
      { name: cur, releaseDate: d(30), isMaintained: true, latest: { name: `${cur}.0.1`, date: d(20) } },
      { name: prev, releaseDate: d(395), isMaintained: true, latest: { name: `${prev}.7.1`, date: d(9) } },
    ] } });
    if (slug === "macos") return apple("27", "26");
    if (slug === "android") return { result: { releases: [
      { name: "16", releaseDate: d(120), isMaintained: true }, { name: "15", releaseDate: d(480), isMaintained: true },
      { name: "14", releaseDate: d(860), isMaintained: true }, { name: "13", releaseDate: d(1220), isMaintained: true },
      { name: "12", releaseDate: d(1590), isMaintained: false } ] } };
    return apple("27", "26");
  }

  return {
    DAY, EOL_BASE, VENDOR, COMPLIANCE_TYPES, APP_COLLECTIONS, PLATFORMS, EOL_SLUG, STATE,
    defaultRules, normRules, cmpVer, releasesOf, appleRelease, androidRelease, catalogPath, windowsRelease, rangeText, cmpRanges,
    policyKey, inventory, trackOf, inScope, plan, defaultTicks, groups, patchBody, drifted, missed,
    journalEntries, groupOfEntry, floorChanges, configBlock, runbook, csv, demoEol, ymd,
  };
})();


// ======================================================================
// T30 — the screen: a rail of Plan · Rules · Unattended · Journal.
// ======================================================================
const OsFloorTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let pane = "plan", running = false, writing = false;
  let inv = null, invErrors = [], releases = {}, rows = [], ticks = new Set(), filter = "All", readAt = null;
  let audit = null, auditErr = "", auditBusy = false, lastResult = null, readTenant = null;
  let eolCache = {};     // endoflife.date's answers, kept so a rule change recomputes without a re-read

  const tenant = () => (typeof Graph !== "undefined" && Graph.tenantId && Graph.tenantId()) || (typeof Graph !== "undefined" && Graph.isDemo && Graph.isDemo() ? "demo" : "none");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window — kept for this session only */ } },
  };
  const RK = () => `tuno.osfloor.rules:${tenant()}`;
  const JK = () => `tuno.osfloor.journal:${tenant()}`;
  let rules = null;
  const loadRules = () => { rules = OsFloor.normRules(store.get(RK(), null)); return rules; };
  const saveRules = () => store.set(RK(), rules);
  const journal = () => store.get(JK(), []);
  const addJournal = (entries) => store.set(JK(), entries.concat(journal()).slice(0, 300));

  function prog(msg) { if (typeof TunoProgress !== "undefined") TunoProgress.show("ofBody", "ofProg", msg); else if ($("ofProg")) $("ofProg").textContent = msg || ""; }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const fmtD = (d) => (d ? d.toISOString().slice(0, 10) : "—");
  const shortD = (d) => (d ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "—");

  // ---- the read ------------------------------------------------------------
  async function fetchEol(slug) {
    if (Graph.isDemo && Graph.isDemo()) return OsFloor.demoEol(slug, new Date());
    const res = await fetch(`${OsFloor.EOL_BASE}${slug}/`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`endoflife.date answered ${res.status}`);
    return res.json();
  }
  async function readReleases(needed) {
    const out = {};
    const r = rules;
    for (const t of ["iOS", "iPadOS", "macOS"]) {
      prog(`Reading ${t} releases from endoflife.date…`);
      try { eolCache[t] = await fetchEol(OsFloor.EOL_SLUG[t]); out[t] = OsFloor.appleRelease(eolCache[t], r.track[t], r.cadenceDays); }
      catch (e) { out[t] = { error: `endoflife.date could not be read (${String((e && e.message) || e).slice(0, 160)}) — is endoflife.date in the page's connect-src?` }; }
    }
    {
      prog("Reading Android releases from endoflife.date…");
      try { eolCache.Android = await fetchEol("android"); out.Android = OsFloor.androidRelease(eolCache.Android, r.androidMin, r.cadenceDays, new Date()); }
      catch (e) { out.Android = { error: `endoflife.date could not be read (${String((e && e.message) || e).slice(0, 160)})` }; }
    }
    if (needed.has("Windows")) {
      prog("Reading the Windows Update catalog…");
      try {
        await Graph.ensureScopes(Graph.SCOPES.windowsUpdates);
        const j = await Graph.get(Graph.BETA + OsFloor.catalogPath(r.win), { scopes: Graph.SCOPES.windowsUpdates, retry: true });
        out.Windows = OsFloor.windowsRelease((j && j.value) || [], r.win, r.cadenceDays);
      } catch (e) {
        const m = String((e && e.message) || e).slice(0, 200);
        out.Windows = { error: /403|forbidden|authoriz/i.test(m)
          ? `the Windows Update catalog refused the read (${m}) — it needs WindowsUpdates.ReadWrite.All, an Intune Administrator or Windows Update deployment role, and a Windows Enterprise E3/E5-class licence in the tenant`
          : `the Windows Update catalog could not be read (${m})` };
      }
    }
    return out;
  }
  function neededTracks() {
    const s = new Set();
    for (const it of inv || []) if (OsFloor.inScope(it, rules)) s.add(OsFloor.trackOf(it, rules));
    return s;
  }
  async function readPolicies() {
    invErrors = [];
    prog("Reading compliance policies…");
    let comp = [];
    try { comp = await Graph.readAll("/deviceManagement/deviceCompliancePolicies", { scopes: Graph.SCOPES.config, beta: true, retry: true }); }
    catch (e) { invErrors.push(`Compliance policies could not be read — ${String((e && e.message) || e).slice(0, 200)}`); }
    const apps = [];
    for (const c of OsFloor.APP_COLLECTIONS) {
      prog(`Reading ${c.platform} app protection…`);
      try {
        const list = await Graph.readAll(`/deviceAppManagement/${c.coll}`, { scopes: Graph.SCOPES.apps, beta: true, retry: true });
        for (const a of list) apps.push(Object.assign({}, a, { __coll: c.coll }));
      } catch (e) { invErrors.push(`${c.platform} app protection could not be read — ${String((e && e.message) || e).slice(0, 200)}`); }
    }
    inv = OsFloor.inventory(comp, apps);
  }
  async function run() {
    if (running || writing) return;
    running = true; $("ofRun").disabled = true; lastResult = null;
    try {
      loadRules();
      await Graph.ensureScopes([...new Set([...Graph.SCOPES.config, ...Graph.SCOPES.apps])]);
      await readPolicies();
      releases = await readReleases(neededTracks());
      readAt = new Date(); readTenant = tenant();
      replan(true);
      prog("");
      if (!Object.keys(rules.scope).some((k) => rules.scope[k] && rules.scope[k].on)) pane = "rules";
      render();
    } catch (e) {
      prog("");
      $("ofBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
    } finally { running = false; $("ofRun").disabled = false; }
  }
  function replan(resetTicks) {
    rows = inv ? OsFloor.plan(inv, releases, rules, new Date()) : [];
    if (resetTicks) ticks = OsFloor.defaultTicks(rows);
    else ticks = new Set([...ticks].filter((k) => rows.some((r) => r.key === k && r.tickable)));
    if ($("ofCsv")) $("ofCsv").style.display = rows.length ? "" : "none";
  }

  // ---- the write ------------------------------------------------------------
  async function writeGroups(gs, opts) {
    const setBack = !!(opts && opts.setBack);   // labels only: the group already carries the old value as its target
    const host = $("ofLedger");
    const by = (Graph.accountUpn && Graph.accountUpn()) || "";
    const L = RunLedger.create(host, { unit: gs.length === 1 ? "policy" : "policies", title: setBack ? "setting back" : "raising the floor",
      items: gs.map((g) => ({ label: g.name, sub: g.rows.map((r) => `${r.label}: ${r.now} → ${r.target}`).join(" · ") })) });
    const res = { done: 0, failed: 0, skipped: 0 };
    for (let i = 0; i < gs.length; i++) {
      if (L.stopped) { L.skip(i, "stopped"); res.skipped++; continue; }
      const g = gs[i];
      L.start(i);
      try {
        const before = await Graph.get(Graph.BETA + g.path, { scopes: g.kind === "app" ? Graph.SCOPES.apps : Graph.SCOPES.config, retry: true });
        const moved = OsFloor.drifted(g, before);
        if (moved.length) { L.skip(i, `${moved.map((r) => r.label).join(", ")} changed since it was read — read again`); res.skipped++; continue; }
        await Graph.patch(Graph.BETA + g.path, OsFloor.patchBody(g), { scopes: g.kind === "app" ? Graph.SCOPES.appProtectionWrite : Graph.SCOPES.profiles });
        const after = await Graph.get(Graph.BETA + g.path, { scopes: g.kind === "app" ? Graph.SCOPES.apps : Graph.SCOPES.config, retry: true });
        const miss = OsFloor.missed(g, after);
        addJournal(OsFloor.journalEntries(g, by, new Date().toISOString(), setBack));
        if (miss.length) { L.fail(i, `written, but the read-back shows ${miss.map((r) => `${r.label} ${OsFloor.rangeText(after[r.field]) || after[r.field] || "empty"}`).join(", ")}`); res.failed++; continue; }
        L.done(i, "written · read back"); res.done++;
        const item = (inv || []).find((x) => x.key === g.policyKey);
        if (item) for (const r of g.rows) item.raw[r.field] = after[r.field];
      } catch (e) {
        L.fail(i, String((e && e.message) || e).slice(0, 240)); res.failed++;
      }
    }
    L.finish({});
    return res;
  }
  async function apply() {
    if (writing || running) return;
    const gs = OsFloor.groups(rows, ticks);
    if (!gs.length) return;
    writing = true;
    try {
      if (gs.some((g) => g.kind === "compliance")) await Graph.ensureScopes(Graph.SCOPES.profiles);
      if (gs.some((g) => g.kind === "app")) await Graph.ensureScopes(Graph.SCOPES.appProtectionWrite);
      $("ofLedger").hidden = false;
      lastResult = await writeGroups(gs);
      if (typeof PolicyCache !== "undefined" && PolicyCache.invalidate) PolicyCache.invalidate();
      replan(false);
      ticks = new Set();
      renderPane();
    } catch (e) {
      lastResult = { error: String((e && e.message) || e) };
      renderPane();
    } finally { writing = false; }
  }
  async function setBack(idx) {
    if (writing || running) return;
    const e = journal()[idx];
    if (!e) return;
    writing = true;
    try {
      await Graph.ensureScopes(e.kind === "app" ? Graph.SCOPES.appProtectionWrite : Graph.SCOPES.profiles);
      $("ofLedger").hidden = false;
      lastResult = await writeGroups([OsFloor.groupOfEntry(e)], { setBack: true });
      if (inv) replan(false);
      renderPane();
    } catch (er) { lastResult = { error: String((er && er.message) || er) }; renderPane(); }
    finally { writing = false; }
  }
  async function readAudit() {
    if (auditBusy) return;
    auditBusy = true; auditErr = ""; renderPane();
    try {
      await Graph.ensureScopes(Audit.SCOPES());
      const r = await Audit.fetchEvents({ window: "30d" });
      audit = OsFloor.floorChanges(r.rows);
    } catch (e) { auditErr = String((e && e.message) || e).slice(0, 240); }
    finally { auditBusy = false; renderPane(); }
  }

  // ---- the runbook ---------------------------------------------------------
  async function exportRunbook() {
    try {
      const res = await fetch(OsFloor.VENDOR + "IntuneComplianceMaintainer.ps1");
      if (!res.ok) throw new Error(`the vendored script could not be fetched (${res.status})`);
      const meta = { build: typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "", when: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", by: (Graph.accountUpn && Graph.accountUpn()) || "" };
      download("IntuneComplianceMaintainer.ps1", OsFloor.runbook(await res.text(), rules, inv || [], Graph.tenantId && Graph.tenantId(), meta), "text/plain");
    } catch (e) { lastResult = { error: String((e && e.message) || e) }; renderPane(); }
  }

  // ---- render ----------------------------------------------------------------
  function render() {
    if (!rules) loadRules();
    const inScopeN = (inv || []).filter((it) => OsFloor.inScope(it, rules)).length;
    const counts = { up: 0, wait: 0, err: 0 };
    for (const r of rows) { if (r.state === "up") counts.up++; else if (r.state === "wait") counts.wait++; else if (r.state === "nodata") counts.err++; }
    const node = (id, icon, label, right, bad) => `<div class="ep-node${pane === id ? " active" : ""}" data-ofpane="${id}" role="button" tabindex="0">
      <span>${icon} ${label}</span><span class="ep-n${bad ? " gap" : ""}">${right}</span></div>`;
    const rail = node("plan", "📏", "Plan", inv ? `${counts.up} due${counts.wait ? ` · ${counts.wait} waiting` : ""}` : "not read", counts.err > 0)
      + node("rules", "⚙️", "Rules", inv ? `${inScopeN} of ${inv.length} in scope` : "", false)
      + node("unattended", "⏱", "Unattended", "runbook", false)
      + node("journal", "🕓", "Journal", `${journal().length}`, false);
    $("ofBody").innerHTML = `<div class="ep-wrap of-wrap"><div class="ep-rail">${rail}</div><div class="ep-main"><div id="ofPane"></div><div id="ofLedger" hidden></div></div></div>`;
    $("ofBody").querySelectorAll("[data-ofpane]").forEach((n) => {
      const go = () => { pane = n.dataset.ofpane; render(); };
      n.addEventListener("click", go);
      n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    renderPane();
  }
  function renderPane() {
    const host = $("ofPane");
    if (!host) return;
    host.innerHTML = { plan: planHtml, rules: rulesHtml, unattended: unattendedHtml, journal: journalHtml }[pane]();
    wire(host);
  }
  const notRead = (what) => `<div class="list-card"><p class="mini muted" style="margin:0">${what} Press <b>📏 Read policies and releases</b> above — nothing is read until then, and nothing is written until you tick rows and press Apply.</p></div>`;

  function cards() {
    const tracks = OsFloor.PLATFORMS.filter((t) => releases[t]);
    if (!tracks.length) return "";
    const now = new Date();
    return `<div class="of-cards">${tracks.map((t) => {
      const r = releases[t];
      if (r.error) return `<div class="of-card bad"><h4>${t}</h4><p class="mini">${esc(r.error)}</p></div>`;
      const ver = t === "Windows" ? r.per.filter((p) => !p.missing).map((p) => p.highest.replace(/^10\.0\./, "")).join(" · ") : t === "Android" ? `${r.version} · patch ${r.patch.slice(0, 7)}` : r.version;
      const eff = r.effective, rel = r.released;
      const span = Math.max(1, rules.cadenceDays);
      const pct = !eff || !rel ? 100 : Math.max(0, Math.min(100, Math.round(((now - rel) / OsFloor.DAY) / span * 100)));
      const due = !eff || now >= eff;
      return `<div class="of-card"><h4>${t} <span class="of-st ${due ? "up" : "wait"}">${due ? "Due" : "Waiting"}</span></h4>
        <dl class="of-kv"><dt>Newest</dt><dd>${esc(ver)}</dd><dt>Released</dt><dd>${shortD(rel)}</dd><dt>Floor from</dt><dd>${shortD(eff)}</dd></dl>
        <div class="of-track" role="img" aria-label="${due ? "cadence passed" : `day ${Math.round(pct * span / 100)} of ${span}`}"><span class="${due ? "up" : "wait"}" style="width:${pct}%"></span></div>
        <span class="mini muted">${due ? "cadence passed" : `day ${Math.round(pct * span / 100)} of ${span}`}${r.held ? ` · held on ${esc(r.major)}` : ""}</span></div>`;
    }).join("")}</div>`;
  }
  function planHtml() {
    if (!inv) return notRead("The plan compares each policy's minimum OS with the newest release one cadence back.");
    const parts = [];
    if (lastResult && lastResult.error) parts.push(`<div class="list-card"><div class="gu-fail"><b>${esc(lastResult.error)}</b></div></div>`);
    else if (lastResult) parts.push(`<div class="of-done" role="status"><b>${lastResult.done} ${lastResult.done === 1 ? "policy" : "policies"} updated</b>${lastResult.failed ? ` · ${lastResult.failed} failed` : ""}${lastResult.skipped ? ` · ${lastResult.skipped} skipped` : ""} — in the 🕓 Journal with the old values, each one can be set back from there.</div>`);
    for (const m of invErrors) parts.push(`<div class="list-card"><div class="gu-fail"><b>${esc(m)}</b><span class="why">Those policies are missing from the plan — unknown, not up to date.</span></div></div>`);
    parts.push(`<p class="mini muted of-src">Release data: endoflife.date and the Windows Update catalog · read ${readAt ? readAt.toLocaleString() : "—"} · cadence ${rules.cadenceDays} days</p>`);
    parts.push(cards());
    if (!rows.length) {
      parts.push(`<div class="list-card"><p class="mini muted" style="margin:0">${(inv || []).length ? `No policy is in scope yet — tick the ones this tool may maintain under <a href="#" data-ofgo="rules">⚙️ Rules</a>, then read again.` : "The tenant has no iOS, macOS, Android or Windows compliance or app protection policy this tool can maintain."}</p></div>`);
      return parts.join("");
    }
    const plats = ["All"].concat(OsFloor.PLATFORMS.filter((p) => rows.some((r) => r.platform === p)));
    const shown = rows.filter((r) => filter === "All" || r.platform === filter);
    const tickN = [...ticks].length, forceN = rows.filter((r) => ticks.has(r.key) && r.state === "wait").length;
    parts.push(`<div class="list-card">
      <div class="of-head"><h4 style="margin:0">Plan · ${rows.length} setting${rows.length === 1 ? "" : "s"} in ${new Set(rows.map((r) => r.policyKey)).size} polic${new Set(rows.map((r) => r.policyKey)).size === 1 ? "y" : "ies"}</h4>
      <div class="toolbar" role="group" aria-label="Platform">${plats.map((p) => `<button class="fchip${filter === p ? " active" : ""}" type="button" data-offilter="${p}" aria-pressed="${filter === p}">${p}</button>`).join("")}</div></div>
      <div class="gu-tw"><table class="cg-table of-table"><thead><tr><th style="width:34px" aria-label="Apply"></th><th>Policy</th><th>Setting</th><th>Now → target</th><th>Outcome</th><th style="width:80px">From</th></tr></thead><tbody>
      ${shown.map((r) => { const s = OsFloor.STATE[r.state]; return `<tr>
        <td><input type="checkbox" data-oftick="${esc(r.key)}" aria-label="Apply ${esc(r.name)} ${esc(r.label)}" ${ticks.has(r.key) ? "checked" : ""} ${r.tickable && !writing ? "" : "disabled"}></td>
        <td><b>${esc(r.name)}</b><div class="mini muted">${esc(r.track)} · ${r.kind === "app" ? "App protection" : "Compliance"}</div></td>
        <td><code class="mini">${esc(r.field)}</code></td>
        <td class="of-ver">${esc(r.now)} <span class="muted" aria-hidden="true">→</span> <b>${esc(r.target)}</b></td>
        <td><span class="of-st ${s.cls}">${s.glyph} ${s.label}</span>${r.why ? `<div class="mini muted of-why">${esc(r.why)}</div>` : ""}</td>
        <td class="mini">${r.state === "up" || r.state === "wait" ? shortD(r.effective) || "now" : "—"}</td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="mini muted of-legend"><span class="of-st up">↑ Will update</span> cadence passed, target higher · <span class="of-st wait">◷ Not yet</span> release younger than the cadence — tick to force · <span class="of-st meets">= Already meets</span> · <span class="of-st lower">↓ Would lower</span> kept, lowering is off · <span class="of-st err">! No data</span></p>
    </div>
    <div class="of-bar"><span><b>${tickN} ticked</b>${forceN ? ` · ${forceN} forced ahead of the cadence` : ""} · nothing is written until Apply</span>
      <button class="btn primary" type="button" id="ofApply" ${tickN && !writing ? "" : "disabled"}>✏️ Apply ${tickN}</button></div>`);
    return parts.join("");
  }
  function rulesHtml() {
    const r = rules;
    const seg = (name, val, opts) => `<span class="of-seg" role="group">${opts.map(([v, l]) => `<button type="button" class="${val === v ? "active" : ""}" data-ofrule="${name}" data-ofval="${v}" aria-pressed="${val === v}">${esc(l)}</button>`).join("")}</span>`;
    const rel = (t) => releases[t] && !releases[t].error ? releases[t] : null;
    const major = (t, which) => { const x = rel(t); return x ? (which === "newest" ? x.newestMajor : "") : ""; };
    const scope = !inv ? `<p class="mini muted" style="margin:0">Read the tenant first — the policies appear here to pick from.</p>`
      : !inv.length ? `<p class="mini muted" style="margin:0">No compliance or app protection policy this tool can maintain.</p>`
      : `<div class="gu-tw"><table class="cg-table"><thead><tr><th style="width:34px" aria-label="In scope"></th><th>Policy</th><th>Type</th><th>Follows</th></tr></thead><tbody>
        ${OsFloor.PLATFORMS.filter((p) => inv.some((it) => it.platform === p)).map((p) => `<tr class="of-grp"><td colspan="4">${p}</td></tr>`
          + inv.filter((it) => it.platform === p).map((it) => { const s = r.scope[it.key] || {}; return `<tr>
            <td><input type="checkbox" data-ofscope="${esc(it.key)}" aria-label="In scope: ${esc(it.name)}" ${s.on ? "checked" : ""}></td>
            <td>${esc(it.name)}</td><td class="mini">${it.kind === "app" ? "App protection" : "Compliance"}</td>
            <td class="mini">${it.platform === "iOS" ? `<select data-oftrack="${esc(it.key)}" aria-label="Release followed by ${esc(it.name)}"><option${s.track === "iPadOS" ? "" : " selected"}>iOS</option><option${s.track === "iPadOS" ? " selected" : ""}>iPadOS</option></select>` : esc(it.platform)}</td></tr>`; }).join("")).join("")}
      </tbody></table></div>`;
    return `<div class="of-cols">
      <div class="list-card"><h4>Timing and safety</h4>
        <label class="of-row"><span>Cadence <span class="mini muted">days after a release before it becomes the floor</span></span><input type="number" min="0" max="365" value="${r.cadenceDays}" data-ofnum="cadenceDays" style="width:90px"></label>
        <label class="of-row"><span>Allow lowering a floor <span class="mini muted">off: a floor set above the target stays (↓ Would lower)</span></span><input type="checkbox" data-ofbool="allowDowngrade" ${r.allowDowngrade ? "checked" : ""}></label>
        <p class="mini muted" style="margin:6px 0 0">Forcing ahead of the cadence is per row: tick a ◷ row on the plan.</p>
      </div>
      <div class="list-card"><h4>Apple</h4>
        ${["iOS", "iPadOS", "macOS"].map((t) => `<div class="of-row"><span>${t} <span class="mini muted">major to follow</span></span>${seg(`track.${t}`, r.track[t], [["newest", `Newest${major(t, "newest") ? ` (${major(t, "newest")})` : ""}`], ["previous", "Previous"]])}</div>`).join("")}
        <p class="mini muted" style="margin:6px 0 0">Previous keeps the floor on the last patch of the major before the newest — a TUNO rule; the script always follows the newest.</p>
      </div>
      <div class="list-card"><h4>Android</h4>
        <label class="of-row"><span>Minimum OS <span class="mini muted">blank: the oldest maintained release</span></span><input type="text" value="${esc(r.androidMin)}" data-oftext="androidMin" placeholder="${rel("Android") ? esc(rel("Android").maintained[0]) : "e.g. 14"}" style="width:90px"></label>
        <label class="of-row"><span>Security patch level <span class="mini muted">the 1st of the month, after the cadence</span></span><input type="checkbox" data-ofbool="androidPatch" ${r.androidPatch ? "checked" : ""}></label>
      </div>
      <div class="list-card"><h4>Windows</h4>
        <label class="of-row"><span>Builds <span class="mini muted">comma-separated, e.g. 26100 (24H2), 26200 (25H2)</span></span><input type="text" value="${esc(r.win.builds.join(", "))}" data-oftext="win.builds" style="width:160px"></label>
        <div class="of-row"><span>Write as</span>${seg("win.mode", r.win.mode, [["Ranges", "Build ranges"], ["MinimumVersion", "Minimum version"]])}</div>
        <div class="of-row"><span>Updates</span>${seg("win.classification", r.win.classification, [["security", "Security"], ["nonSecurity", "Non-security"]])}</div>
        <label class="of-row"><span>How many recent updates count as compliant</span><input type="number" min="1" max="12" value="${r.win.count}" data-ofnum="win.count" style="width:90px"></label>
        <label class="of-row"><span>Allow newer builds <span class="mini muted">a range's top becomes .9999</span></span><input type="checkbox" data-ofbool="win.allowNewer" ${r.win.allowNewer ? "checked" : ""}></label>
        <div class="of-row"><span>App protection takes</span>${seg("win.appTarget", r.win.appTarget, [["Lowest", "Lowest"], ["Highest", "Highest"]])}</div>
        <p class="mini muted" style="margin:6px 0 0">A change to builds, updates or the count needs a fresh read of the catalog — <b>Read again</b>.</p>
      </div>
    </div>
    <div class="list-card"><h4>Policies in scope${inv ? ` · ${inv.filter((it) => OsFloor.inScope(it, r)).length} of ${inv.length}` : ""}</h4>
      <p class="mini muted" style="margin:0 0 8px">Only these are planned and written. Kept per tenant in this browser, and carried into the runbook export.</p>${scope}</div>`;
  }
  function unattendedHtml() {
    const block = OsFloor.configBlock(rules, inv || [], (Graph.tenantId && Graph.tenantId()) || "");
    const err = lastResult && lastResult.error ? `<div class="list-card"><div class="gu-fail"><b>${esc(lastResult.error)}</b></div></div>` : "";
    return `${err}<div class="of-cols">
      <div class="list-card"><h4>Run it on a schedule</h4>
        <p class="mini" style="margin:0 0 8px">TUNO only works while someone is signed in. For a daily run, export these rules into the original script and let Azure Automation run it with a managed identity.</p>
        <ol class="of-steps mini">
          <li>Create an Automation Account with a system-assigned managed identity.</li>
          <li>Run <code>Grant-ManagedIdentityGraphPermissions.ps1</code> once: it gives the identity <code>DeviceManagementConfiguration.ReadWrite.All</code>, <code>DeviceManagementApps.ReadWrite.All</code> and <code>WindowsUpdates.ReadWrite.All</code> as application permissions.</li>
          <li>Import the exported <code>IntuneComplianceMaintainer.ps1</code> as a PowerShell runbook (it needs <code>Az.Accounts</code>).</li>
          <li>Link a daily schedule. The export keeps <code>$DryRun = $true</code>: compare a week of its output with the 📏 Plan here, then turn it off.</li>
        </ol>
        <p class="of-warn mini">The managed identity can change every compliance and app protection policy in the tenant, and a runbook writes everything in scope — there are no ticks.</p>
        <div class="tb-actions"><button class="btn primary" type="button" id="ofRunbook">⭳ Runbook (.ps1)</button>
          <a class="btn" href="${OsFloor.VENDOR}Grant-ManagedIdentityGraphPermissions.ps1" download>⭳ Grant script</a>
          <button class="btn" type="button" id="ofBlock">⭳ Config block only</button></div>
        <p class="mini muted" style="margin:8px 0 0">The script is James Robinson's <a href="https://github.com/SkipToTheEndpoint/IntuneComplianceMaintainer" target="_blank" rel="noopener">IntuneComplianceMaintainer</a> (MIT), shipped unchanged with TUNO; the export replaces its configuration section and nothing else.</p>
      </div>
      <div class="list-card"><h4>Config block · from your Rules</h4>${inv ? "" : `<p class="mini muted" style="margin:0 0 8px">No policies yet — read the tenant first and tick them under ⚙️ Rules.</p>`}<pre class="of-pre">${esc(block)}</pre></div>
    </div>`;
  }
  function journalHtml() {
    const j = journal();
    const v = (e, x) => (e.ranges ? OsFloor.rangeText(x) || "—" : (x == null || x === "" ? "—" : String(x)));
    const mine = j.length ? `<div class="gu-tw"><table class="cg-table"><thead><tr><th style="width:150px">When</th><th>By</th><th>Policy</th><th>Setting</th><th>Old → new</th><th style="width:110px"></th></tr></thead><tbody>
      ${j.map((e, i) => `<tr><td class="mini">${esc(String(e.when).slice(0, 16).replace("T", " "))}</td><td class="mini">TUNO${e.by ? ` · ${esc(e.by)}` : ""}</td><td>${esc(e.policy)}<div class="mini muted">${esc(e.platform)} · ${e.kind === "app" ? "App protection" : "Compliance"}</div></td>
        <td><code class="mini">${esc(e.field)}</code></td><td class="of-ver">${esc(v(e, e.from))} → <b>${esc(v(e, e.to))}</b>${e.setBack ? ` <span class="mini muted">(set back)</span>` : ""}</td>
        <td><button class="btn" type="button" data-ofback="${i}" ${writing ? "disabled" : ""}>↩ Set back</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="mini muted" style="margin:0">Nothing written from this browser yet.</p>`;
    const a = auditBusy ? `<p class="mini muted">Reading 30 days of the Intune audit log…</p>`
      : auditErr ? `<div class="gu-fail"><b>The audit log could not be read.</b><span class="why">${esc(auditErr)}</span></div>`
      : !audit ? `<p class="mini muted" style="margin:0 0 8px">A runbook's changes, and anyone's in the portal, are in the Intune audit log — not here until read.</p>`
      : !audit.length ? `<p class="mini muted">No floor setting changed in the last 30 days.</p>`
      : `<div class="gu-tw"><table class="cg-table"><thead><tr><th style="width:150px">When</th><th>By</th><th>Policy</th><th>Old → new</th></tr></thead><tbody>
        ${audit.map((x) => `<tr><td class="mini">${esc(String(x.when).slice(0, 16).replace("T", " "))}</td><td class="mini">${esc(x.by)}${x.byKind === "app" ? ` <span class="of-st meets">app</span>` : ""}</td><td>${esc(x.policy)}</td>
          <td class="mini">${x.changes.map((c) => `<code>${esc(c.field)}</code> ${esc(typeof c.from === "object" ? JSON.stringify(c.from) : c.from == null ? "—" : c.from)} → <b>${esc(typeof c.to === "object" ? JSON.stringify(c.to) : c.to == null ? "—" : c.to)}</b>`).join("<br>")}</td></tr>`).join("")}
      </tbody></table></div>`;
    return `<div class="list-card"><h4>Written by TUNO, from this browser (${j.length})</h4>
      <p class="mini muted" style="margin:0 0 8px">Every write with the value it replaced. ↩ Set back writes the old value again — refused when the policy has changed since.</p>${mine}</div>
      <div class="list-card"><div class="of-head"><h4 style="margin:0">Every floor change in the audit log · 30 days</h4><button class="btn" type="button" id="ofAudit" ${auditBusy ? "disabled" : ""}>🕓 Read the audit log</button></div>${a}</div>`;
  }

  function setRule(path, val) {
    const parts = path.split(".");
    let o = rules;
    while (parts.length > 1) o = o[parts.shift()];
    o[parts[0]] = val;
    rules = OsFloor.normRules(rules);
    saveRules();
    // Release choices that need no re-read are applied at once.
    if (inv) {
      if (/^track\./.test(path) || path === "cadenceDays" || path === "androidMin" || path === "win.appTarget" || path === "win.allowNewer") recomputeLocal(path);
      replan(false);
    }
  }
  // Apple tracks, the cadence, Android's minimum: recomputed from what was
  // read. Windows only moves its effective date — new builds, updates or a
  // count need the catalog again, and the Rules pane says so.
  function recomputeLocal() {
    for (const t of ["iOS", "iPadOS", "macOS"]) if (eolCache[t]) releases[t] = OsFloor.appleRelease(eolCache[t], rules.track[t], rules.cadenceDays);
    if (eolCache.Android) releases.Android = OsFloor.androidRelease(eolCache.Android, rules.androidMin, rules.cadenceDays, new Date());
    if (releases.Windows && !releases.Windows.error && releases.Windows.released) releases.Windows.effective = new Date(releases.Windows.released.getTime() + rules.cadenceDays * OsFloor.DAY);
  }

  function wire(host) {
    host.querySelectorAll("[data-offilter]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.offilter; renderPane(); }));
    host.querySelectorAll("[data-oftick]").forEach((c) => c.addEventListener("change", () => { if (c.checked) ticks.add(c.dataset.oftick); else ticks.delete(c.dataset.oftick); renderPane(); }));
    host.querySelectorAll("[data-ofgo]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); pane = a.dataset.ofgo; render(); }));
    const ap = host.querySelector("#ofApply"); if (ap) ap.addEventListener("click", apply);
    host.querySelectorAll("[data-ofscope]").forEach((c) => c.addEventListener("change", () => {
      const k = c.dataset.ofscope; rules.scope[k] = Object.assign({}, rules.scope[k] || {}, { on: c.checked }); saveRules(); if (inv) replan(false);
    }));
    host.querySelectorAll("[data-oftrack]").forEach((s) => s.addEventListener("change", () => {
      const k = s.dataset.oftrack; rules.scope[k] = Object.assign({}, rules.scope[k] || {}, { track: s.value }); saveRules(); if (inv) replan(false);
    }));
    host.querySelectorAll("[data-ofrule]").forEach((b) => b.addEventListener("click", () => { setRule(b.dataset.ofrule, b.dataset.ofval); render(); }));
    host.querySelectorAll("[data-ofnum]").forEach((i) => i.addEventListener("change", () => { setRule(i.dataset.ofnum, parseInt(i.value, 10)); render(); }));
    host.querySelectorAll("[data-ofbool]").forEach((i) => i.addEventListener("change", () => { setRule(i.dataset.ofbool, i.checked); render(); }));
    host.querySelectorAll("[data-oftext]").forEach((i) => i.addEventListener("change", () => {
      const p = i.dataset.oftext;
      setRule(p, p === "win.builds" ? i.value.split(/[\s,;]+/).filter(Boolean) : i.value);
      render();
    }));
    const rb = host.querySelector("#ofRunbook"); if (rb) rb.addEventListener("click", exportRunbook);
    const bl = host.querySelector("#ofBlock"); if (bl) bl.addEventListener("click", () => download("IntuneComplianceMaintainer-config.ps1", OsFloor.configBlock(rules, inv || [], (Graph.tenantId && Graph.tenantId()) || ""), "text/plain"));
    host.querySelectorAll("[data-ofback]").forEach((b) => b.addEventListener("click", () => setBack(+b.dataset.ofback)));
    const au = host.querySelector("#ofAudit"); if (au) au.addEventListener("click", readAudit);
  }

  function init() {
    if (!$("ofRun")) return;
    $("ofRun").addEventListener("click", run);
    $("ofCsv").addEventListener("click", () => download("OS-floor-plan.csv", OsFloor.csv(rows), "text/csv"));
    // A sign-out, or another tenant: forget what was read.
    const reset = () => { inv = null; rows = []; releases = {}; eolCache = {}; ticks = new Set(); audit = null; lastResult = null; rules = null; readTenant = null; pane = "plan"; };
    window.addEventListener("tuno:signout", reset);
    $("toolOsFloor").addEventListener("click", () => { if (readTenant && readTenant !== tenant()) reset(); if (!rules) loadRules(); render(); });
  }

  return { init, run, render, apply, state: () => ({ inv, rows, ticks, releases, rules, pane, journal: journal() }) };
})();

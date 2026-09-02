// ======================================================================
// T24 — 🍎 macOS baseline (BETA, R35). Match the tenant's macOS policies
// against the CloudFellows macOS baseline, ENCA's Baseline Policies tool
// turned Intune-side-out.
//
// THE NAMING CONVENTION, learned from the reference export itself
// (cloudfellows.dev, 2026-09-01) rather than assumed:
//
//   MACOS - DCP - Apple Firewall - D - Enable MACOS Firewall - R26.6 - v3.0
//   └────┘                                                     └────┘ └──┘
//   prefix            the identity is the NAME                release version
//
// R26.x IS THE BASELINE RELEASE — the same release line ENCA's catalog
// carries (its CA baseline is R26.6 too) — worn by every policy, NOT a
// per-policy number. So the stable identity is the NAME with the release
// tag and version stripped and separators normalised; release and
// version together order two sightings of the same policy: releases
// compare first (a policy still at R26.4 is outdated next to the R26.6
// catalog whatever its version says), versions break the tie,
// segment-wise (ENCA's cmpVersion verbatim — 3.0.10 > 3.0.9). The first
// cut of this tool matched on "R26.xx" as an ENCA-style per-policy
// number; the reference export collapsed 83 policies onto two numbers
// and buried the mistake in a duplicate flag — the identity model was
// rebuilt against the real convention the same day.
//
// THE CATALOG comes from the baseline tenant, cloudfellows.dev — the
// cfdev convention (TunoTenant.isCfdev(), worn in the header badge): on
// that tenant, and only there, this tool offers EXPORT, which writes
// the catalog file from the tenant's own MACOS policies — names,
// releases, versions AND the raw bodies, one file for all three acts.
// Everywhere else the tool consumes a catalog: the bundled reference
// export (BASELINE_MACOS, js/macbaselineData.js) or a loaded file.
//
// BUCKETS: ok / outdated / ahead / unversioned / missing / extra —
// ENCA's, minus the number-clash bucket its number identity needed and
// a name identity cannot produce. IMPORT rides T04-restore's create
// pipeline for the three restorable areas, and T14's OWN Filters.create
// for assignment filters (the baseline's enrolment filters are
// load-bearing); both create-only, canonical names, everything
// unassigned. SCRIPTS are identified but NOT importable from the
// catalog: the shared read returns script metadata without the body,
// and a script without its body cannot be put back — restore's own
// rule, said on the row instead of half-honoured.
// ======================================================================
const MacBaseline = (() => {
  "use strict";

  // ---- the naming convention ----
  // THE RELEASE TAG IS A DATE: Ryy.m — 26 is the year, the x the month
  // (Mihai's rule): R26.6 is June 2026, R26.12 December, and next January
  // is R27.1, which is why releases are compared year-first rather than as
  // decimals (26.12 comes AFTER 26.6, and R27.1 after both).
  const releaseOf = (name) => {
    const m = /\bR(\d{2})\.(\d{1,2})\b/i.exec(name || "");
    return m ? { y: +m[1], m: +m[2] } : null;
  };
  // The bundled R26-era catalog stored the release as a bare month number;
  // everything is normalised through here so both shapes read as one.
  const normRel = (rel, name) => {
    if (rel && typeof rel === "object" && "y" in rel) return rel;
    if (typeof rel === "number") return { y: 26, m: rel };
    if (typeof rel === "string" && /^\d{2}\.\d{1,2}$/.test(rel)) { const [y, m] = rel.split(".").map(Number); return { y, m }; }
    return releaseOf(name);
  };
  const relCmp = (a, b) => (a.y - b.y) || (a.m - b.m);
  // This month's tag — what a re-cut of the baseline stamps on its names.
  const currentRelease = () => { const d = new Date(); return { y: d.getUTCFullYear() % 100, m: d.getUTCMonth() + 1 }; };
  const versionOf = (name) => {
    const t = String(name || "").trim();
    const end = /v\s?(\d+(?:\.\d+)*)\s*$/i.exec(t);
    if (end) return end[1];
    const any = /\bv(\d+(?:\.\d+)+)\b/i.exec(t);
    return any ? any[1] : null;
  };
  const looksBaseline = (name) => /^\s*MACOS\b/i.test(name || "") && releaseOf(name) != null;
  // The identity: the name minus the release tag and the version, with
  // separators and whitespace normalised — "DCP-" and "DCP -" are the same
  // policy, because the reference tenant itself spells both.
  const keyOf = (name) => String(name || "")
    .replace(/-?\s*\bR\d{2}\.\d{1,2}\b\s*/gi, " ")
    .replace(/-?\s*v\d+(?:\.\d+)*\s*$/i, " ")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim().toLowerCase();
  const relLabel = (rel) => { const r = normRel(rel); return r ? `R${r.y}.${r.m}` : "—"; };

  // -1 a<b, 0 equal, 1 a>b — segment-wise, so 3.0.10 > 3.0.9 (ENCA, verbatim)
  function cmpVersion(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }
  // Release first, version as the tie-break. Returns -1/0/1, or null when
  // the releases tie and either side has no version — "unversioned", never
  // a guess.
  function cmpRelVer(aRel, aVer, bRel, bVer) {
    const a = normRel(aRel), b = normRel(bRel);
    if (a && b && relCmp(a, b) !== 0) return relCmp(a, b) < 0 ? -1 : 1;
    if (aVer && bVer) return cmpVersion(aVer, bVer);
    return null;
  }

  const STATUS = {
    ok: { icon: "✓", label: "Up to date", cls: "ok", order: 3 },
    outdated: { icon: "⬆", label: "Outdated", cls: "warn", order: 1 },
    ahead: { icon: "⬇", label: "Newer than baseline", cls: "info", order: 4 },
    unversioned: { icon: "?", label: "Version unknown", cls: "info", order: 5 },
    missing: { icon: "✗", label: "Missing", cls: "bad", order: 0 },
    extra: { icon: "＋", label: "Not in baseline", cls: "info", order: 6 },
  };

  // ---- catalogs ----
  function bundled() {
    return (typeof BASELINE_MACOS !== "undefined" && BASELINE_MACOS && Array.isArray(BASELINE_MACOS.policies))
      ? BASELINE_MACOS : null;
  }
  function parseCatalog(text) {
    let j;
    try { j = JSON.parse(text); } catch { throw new Error("Not JSON — the baseline file is the tool's own export."); }
    if (!j || j.kind !== "tuno-macos-baseline") throw new Error("Not a macOS baseline file — the `kind` field is missing or wrong.");
    if (!Array.isArray(j.policies)) throw new Error("The baseline file carries no policies array.");
    for (const p of j.policies) {
      if (!p.name || !looksBaseline(p.name)) throw new Error(`A catalog policy does not wear the convention: "${String(p.name || "(unnamed)").slice(0, 80)}"`);
    }
    return j;
  }

  // ---- compare tenant policies against the catalog ----
  // vms: [{ id, name, section }] — every policy read, any section.
  function compare(vms, cat) {
    const byKey = new Map();
    for (const p of vms) {
      if (!looksBaseline(p.name)) continue;
      const k = keyOf(p.name);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(p);
    }
    const rows = [];
    for (const b of cat.policies) {
      const k = keyOf(b.name);
      const bRel = normRel(b.release, b.name);
      const bVer = b.version || versionOf(b.name);
      const hits = byKey.get(k) || [];
      if (!hits.length) {
        rows.push({ key: k, baseline: b, bRel, bVer, tenant: null, status: "missing" });
        continue;
      }
      const scored = hits.map((p) => {
        const tRel = releaseOf(p.name), tVer = versionOf(p.name);
        const c = cmpRelVer(tRel, tVer, bRel, bVer);
        const status = c === null ? "unversioned" : c === 0 ? "ok" : c < 0 ? "outdated" : "ahead";
        return { p, tRel, tVer, status };
      }).sort((a, b2) => STATUS[b2.status].order - STATUS[a.status].order);
      const best = scored[0];
      rows.push({
        key: k, baseline: b, bRel, bVer,
        tenant: best.p, tRel: best.tRel, tVer: best.tVer,
        status: best.status,
        duplicates: hits.length > 1 ? hits.length : 0,
      });
      byKey.delete(k);
    }
    for (const [k, hits] of byKey) {
      rows.push({ key: k, baseline: null, tenant: hits[0], tRel: releaseOf(hits[0].name), tVer: versionOf(hits[0].name), status: "extra", duplicates: hits.length > 1 ? hits.length : 0 });
    }
    rows.sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || String(a.key).localeCompare(String(b.key)));
    const counts = {};
    rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return {
      rows, counts, catalog: cat,
      baselineTotal: cat.policies.length,
      covered: rows.filter((r) => r.baseline && r.tenant).length,
    };
  }

  // ---- export (the baseline tenant's act) ----
  const AREA_OF_SECTION = {
    deviceConfigurations: "DeviceConfigurations",
    settingsCatalog: "SettingsCatalog",
    compliance: "CompliancePolicies",
    admx: "AdmxPolicies",
    filters: "AssignmentFilters",   // T14's own create path, not restore's
  };
  function buildExport(res, tenantName) {
    const policies = [], skipped = [];
    for (const sec of res.sections || []) {
      for (const it of sec.items || []) {
        if (!looksBaseline(it.name)) continue;
        const raw = (sec.raw || []).find((r) => String(r.id).toLowerCase() === String(it.id).toLowerCase()) || null;
        const area = AREA_OF_SECTION[sec.id] || null;
        if (!raw) { skipped.push({ name: it.name, why: "raw body not in the read — export from a cache-backed read" }); continue; }
        const body = Object.assign({}, raw);
        delete body.__detail; delete body.__detailError;
        if (sec.id === "settingsCatalog" && Array.isArray(raw.__detail)) body.settings = raw.__detail;
        if (sec.id === "admx" && Array.isArray(raw.__detail)) body.definitionValues = raw.__detail;
        // A script whose body did not survive the read cannot be imported —
        // restore's own rule, decided at export so the file says it.
        const scriptNoBody = sec.id === "scripts" && !body.scriptContent;
        policies.push({
          key: keyOf(it.name), name: it.name,
          release: releaseOf(it.name), version: versionOf(it.name),
          section: sec.id, sectionLabel: sec.label, area,
          importable: !!area && !scriptNoBody,
          body,
        });
      }
    }
    policies.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    const dupKeys = [...new Set(policies.filter((p, i) => policies.findIndex((x) => x.key === p.key) !== i).map((p) => p.key))];
    return {
      file: {
        kind: "tuno-macos-baseline",
        release: "R26",
        exported: new Date().toISOString(),
        tenant: tenantName || "",
        build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
        policies,
      },
      skipped,
      duplicateKeys: dupKeys,
    };
  }

  // ---- import entries: three roads, each honest about itself ----
  // restore-area policies ride T04-restore's pipeline; assignment filters
  // ride T14's Filters.create; everything else is refused with its reason.
  function importEntries(cat, wanted) {
    const entries = [], filters = [], refused = [];
    for (const p of cat.policies) {
      if (wanted && !wanted.has(keyOf(p.name))) continue;
      if (p.importable === false || !p.body) {
        refused.push({ name: p.name, why: p.body
          ? (p.section === "scripts" ? "the reference read carries no script body — a script without its body cannot be put back"
            : `its surface (${p.sectionLabel || p.section || "unknown"}) has no create path here`)
          : "no body in the catalog" });
        continue;
      }
      if (p.area === "AssignmentFilters") {
        filters.push({ name: p.name, body: {
          displayName: p.body.displayName || p.name,
          description: p.body.description || "",
          platform: p.body.platform,
          rule: p.body.rule,
          ...(p.body.assignmentFilterManagementType ? { assignmentFilterManagementType: p.body.assignmentFilterManagementType } : {}),
        } });
        continue;
      }
      if (!p.area) { refused.push({ name: p.name, why: `its surface (${p.sectionLabel || p.section || "unknown"}) has no create path here` }); continue; }
      entries.push({ area: p.area, entry: { area: p.area, name: p.name, obj: p.body, sourceId: p.body.id || "" }, newName: p.name });
    }
    return { entries, filters, refused };
  }

  // ---- upstream: Microsoft's intune-my-macs (build 10527) ----------------
  // The dev tenant's watch on https://github.com/microsoft/intune-my-macs.
  // THE APP NEVER FETCHES IT: the CSP allows Graph and nothing else, and
  // that rule does not bend for a read-only repo — the zip is downloaded by
  // the BROWSER (a link is navigation, not a request the page makes) and
  // loaded as a file, T04-restore's own JSZip pattern.
  //
  // MATCHING IS BY CONTENT, never by name: upstream names ("FileVault
  // Encryption") share nothing with the convention, but the policies are
  // Graph-shaped — settings-catalog exports and compliance policies — so a
  // settings-catalog policy IS its set of settingDefinitionIds and a
  // compliance policy IS the set of properties it configures. Exact overlap
  // is "same", a half-or-better overlap is a match whose DIFF is shown
  // (their ids we lack, our ids they lack), anything else is NEW — a
  // control our baseline does not have. Exact identity or it is not
  // claimed; 50% is the claim threshold, said here.
  const UPSTREAM_ZIP_URL = "https://github.com/microsoft/intune-my-macs/archive/refs/heads/main.zip";
  const UPSTREAM_MIN_OVERLAP = 0.5;

  function defIdsOf(kind, body) {
    if (kind === "settingsCatalog") {
      return new Set((body.settings || [])
        .map((s) => (s.settingInstance || s || {}).settingDefinitionId)
        .filter(Boolean));
    }
    // compliance: the properties it configures (non-null, non-bookkeeping)
    const META = new Set(["id", "displayName", "name", "description", "@odata.type", "roleScopeTagIds",
      "scheduledActionsForRule", "createdDateTime", "lastModifiedDateTime", "version", "assignments", "assignments@odata.context"]);
    return new Set(Object.keys(body).filter((k) => !META.has(k) && body[k] !== null && body[k] !== undefined));
  }

  // files: [{ path, text }] from the zip. BOM-stripped here, because the
  // upstream repo's own JSON files carry a UTF-8 BOM — found by parsing
  // them, not by assuming.
  function parseUpstream(files) {
    const policies = [], skipped = [];
    let seenOther = 0;
    for (const f of files || []) {
      const path = String(f.path || "");
      if (!/\/macOS\//i.test("/" + path)) continue;
      if (/\.(mobileconfig|sh|zsh|ps1|pkg)$/i.test(path)) { seenOther++; continue; }
      if (!/\.json$/i.test(path)) continue;
      let j;
      try { j = JSON.parse(String(f.text || "").replace(/^\uFEFF/, "")); }
      catch { skipped.push({ path, why: "does not parse as JSON" }); continue; }
      const name = j.name || j.displayName || "";
      const folder = (path.split("/").slice(-2, -1)[0] || "").trim();
      if (Array.isArray(j.settings) && j.settings.length && /macos/i.test(String(j.platforms || ""))) {
        policies.push({ kind: "settingsCatalog", name, path, folder, body: j, defIds: [...defIdsOf("settingsCatalog", j)] });
      } else if (/CompliancePolicy$/i.test(String(j["@odata.type"] || ""))) {
        policies.push({ kind: "compliance", name, path, folder, body: j, defIds: [...defIdsOf("compliance", j)] });
      } else {
        skipped.push({ path, why: "not a settings-catalog or compliance policy export" });
      }
    }
    return { policies, skipped, seenOther };
  }

  // ---- the per-policy diff, VALUE-AWARE (build 10529) ------------------
  // Identity matching stays on id sets, but "covered" must mean covered:
  // the same setting id carrying a DIFFERENT VALUE is a change, and a
  // changelog that missed it would bless drift. Values are compared as
  // normalised JSON of the settingInstance (template references stripped —
  // two tenants legitimately differ there); compliance properties compare
  // directly. Display values are extracted where the shape allows and fall
  // back to a JSON snippet — a snippet is honest, a guess is not.
  const stripTemplateRefs = (o) => {
    if (Array.isArray(o)) return o.map(stripTemplateRefs);
    if (o && typeof o === "object") {
      const out = {};
      for (const k of Object.keys(o).sort()) {
        if (k === "settingInstanceTemplateReference" || k === "settingValueTemplateReference" || k === "id") continue;
        out[k] = stripTemplateRefs(o[k]);
      }
      return out;
    }
    return o;
  };
  const displayValue = (inst) => {
    const i = inst || {};
    if (i.simpleSettingValue && i.simpleSettingValue.value !== undefined) return String(i.simpleSettingValue.value);
    if (i.choiceSettingValue && i.choiceSettingValue.value !== undefined) return String(i.choiceSettingValue.value).split("_").pop();
    const j = JSON.stringify(stripTemplateRefs(i));
    return j.length > 80 ? j.slice(0, 77) + "…" : j;
  };
  function diffPolicies(kind, upBody, ourBody) {
    const added = [], removed = [], changed = [];
    if (kind === "settingsCatalog") {
      const instOf = (body) => {
        const m = new Map();
        for (const s of body.settings || []) {
          const i = s.settingInstance || s;
          if (i && i.settingDefinitionId) m.set(i.settingDefinitionId, i);
        }
        return m;
      };
      const up = instOf(upBody), ours = instOf(ourBody);
      for (const [id, i] of up) {
        if (!ours.has(id)) { added.push({ id, theirs: displayValue(i) }); continue; }
        if (JSON.stringify(stripTemplateRefs(i)) !== JSON.stringify(stripTemplateRefs(ours.get(id)))) {
          changed.push({ id, ours: displayValue(ours.get(id)), theirs: displayValue(i) });
        }
      }
      for (const [id, i] of ours) if (!up.has(id)) removed.push({ id, ours: displayValue(i) });
    } else {
      const upIds = defIdsOf("compliance", upBody), ourIds = defIdsOf("compliance", ourBody);
      for (const k of upIds) {
        if (!ourIds.has(k)) { added.push({ id: k, theirs: JSON.stringify(upBody[k]) }); continue; }
        if (JSON.stringify(upBody[k]) !== JSON.stringify(ourBody[k])) changed.push({ id: k, ours: JSON.stringify(ourBody[k]), theirs: JSON.stringify(upBody[k]) });
      }
      for (const k of ourIds) if (!upIds.has(k)) removed.push({ id: k, ours: JSON.stringify(ourBody[k]) });
    }
    return { added, removed, changed };
  }

  const overlap = (A, B) => {
    if (!A.size || !B.size) return 0;
    let hit = 0;
    for (const x of A) if (B.has(x)) hit++;
    return hit / Math.min(A.size, B.size);
  };

  // ups: parseUpstream().policies · cat: the active catalog.
  // Every upstream policy lands in one of: same / differs / new.
  function matchUpstream(ups, cat) {
    const SECTION_OF_KIND = { settingsCatalog: "settingsCatalog", compliance: "compliance" };
    const ours = (cat.policies || []).map((p) => ({
      p, ids: defIdsOf(p.section === "compliance" ? "compliance" : "settingsCatalog", p.body || {}),
    }));
    return ups.map((u) => {
      const uIds = new Set(u.defIds);
      let best = null, bestScore = 0;
      for (const o of ours) {
        if (o.p.section !== SECTION_OF_KIND[u.kind]) continue;
        const s = overlap(uIds, o.ids);
        if (s > bestScore) { best = o; bestScore = s; }
      }
      if (!best || bestScore < UPSTREAM_MIN_OVERLAP) return { up: u, status: "new", match: null, score: 0 };
      const diff = diffPolicies(u.kind, u.body, best.p.body || {});
      const status = diff.added.length || diff.removed.length || diff.changed.length ? "differs" : "same";
      return { up: u, status, match: best.p, score: bestScore, diff,
        theirsOnly: diff.added.map((x) => x.id), oursOnly: diff.removed.map((x) => x.id) };
    });
  }

  // A proposed canonical name — a STARTING POINT for the rename field, not
  // a decision: the middle words are Mihai's to curate before anything is
  // created. New policies start at v1.0; a differing match proposes the
  // matched policy's own name with the minor version bumped.
  // A proposed canonical name stamps THE CURRENT RELEASE (this year, this
  // month — the re-cut's date) and increases the version: new controls
  // start at v1.0; a differing match keeps the matched policy's identity,
  // re-stamps its release tag to now, and bumps the minor version. All of
  // it a STARTING POINT for the rename field — the middle words are
  // Mihai's to curate before anything is created.
  function proposeName(row) {
    const now = currentRelease();
    const tag = `R${now.y}.${now.m}`;
    if (row.status === "differs" && row.match) {
      let name = String(row.match.name).replace(/\bR\d{2}\.\d{1,2}\b/i, tag);
      const m = /^(.*?)(?:\s*-\s*v(\d+))(?:\.(\d+))?((?:\.\d+)*)\s*$/i.exec(name);
      if (m) return `${m[1]} - v${m[2]}.${(+(m[3] || 0)) + 1}`;
      return name;
    }
    const type = row.up.kind === "compliance" ? "CMP" : "DCP";
    const cat9 = row.up.folder && !/configurations|macos/i.test(row.up.folder)
      ? row.up.folder.replace(/\b\w/g, (c) => c.toUpperCase()) : "Device Configuration";
    const base = String(row.up.name || "Unnamed").replace(/\s*-\s*R\d{2}\.\d+.*$/i, "").trim();
    return `MACOS - ${type} - ${cat9} - D - ${base} - ${tag} - v1.0`;
  }

  // The create body for an upstream policy under its curated name —
  // restore's shapes, so Restore.plan/apply take it unchanged.
  function upstreamEntry(row, newName) {
    const u = row.up;
    const area = u.kind === "compliance" ? "CompliancePolicies" : "SettingsCatalog";
    const obj = Object.assign({}, u.body);
    if (u.kind === "settingsCatalog") { obj.name = newName; delete obj.displayName; }
    else obj.displayName = newName;
    return { area, entry: { area, name: newName, obj, sourceId: obj.id || "" }, newName };
  }

  // The upstream changelog: what is new, per policy — the same diff the
  // screen shows, written down for the record and the release notes.
  function upstreamMarkdown(rows, meta) {
    const L = [];
    L.push("# intune-my-macs vs the CloudFellows macOS baseline", "");
    L.push(`Generated ${new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC")} by TUNO ${typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""}${meta && meta.catalog ? ` · catalog ${meta.catalog}` : ""}`, "");
    const n = { same: 0, differs: 0, new: 0 };
    rows.forEach((r) => { n[r.status]++; });
    L.push(`${n.new} new to the baseline · ${n.differs} matched with differences · ${n.same} covered.`, "");
    const cell = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    for (const r of rows.filter((x) => x.status === "new")) {
      L.push(`## NEW — ${cell(r.up.name)}`, "");
      L.push(`${r.up.kind === "compliance" ? "Compliance policy" : "Settings catalog policy"} · ${r.up.defIds.length} setting${r.up.defIds.length === 1 ? "" : "s"} — the whole policy is new to the baseline.`, "");
    }
    for (const r of rows.filter((x) => x.status === "differs")) {
      L.push(`## CHANGED — ${cell(r.up.name)}`, "");
      L.push(`Matches **${cell(r.match.name)}** (${Math.round(r.score * 100)}% by content).`, "");
      if (r.diff.added.length) { L.push(`**They set, we do not:**`); r.diff.added.forEach((d) => L.push(`- \`${cell(d.id)}\` = ${cell(d.theirs)}`)); L.push(""); }
      if (r.diff.changed.length) { L.push(`**Different values:**`); r.diff.changed.forEach((d) => L.push(`- \`${cell(d.id)}\`: ours ${cell(d.ours)} → theirs ${cell(d.theirs)}`)); L.push(""); }
      if (r.diff.removed.length) { L.push(`**We set, they do not:**`); r.diff.removed.forEach((d) => L.push(`- \`${cell(d.id)}\` = ${cell(d.ours)}`)); L.push(""); }
    }
    if (n.same) L.push(`## Covered`, "", rows.filter((x) => x.status === "same").map((r) => `- ${cell(r.up.name)} = **${cell(r.match.name)}**`).join("\n"), "");
    return L.join("\n");
  }

  return {
    releaseOf, normRel, relCmp, currentRelease, versionOf, looksBaseline, keyOf, relLabel, cmpVersion, cmpRelVer,
    STATUS, bundled, parseCatalog, compare, buildExport, importEntries, AREA_OF_SECTION,
    UPSTREAM_ZIP_URL, UPSTREAM_MIN_OVERLAP, defIdsOf, parseUpstream, matchUpstream, proposeName, upstreamEntry,
    diffPolicies, upstreamMarkdown,
  };
})();

// ======================================================================
// T24 — the screen. Warm-starts from the shared cache like T19; export
// renders ONLY on the baseline tenant (the cfdev convention — said here,
// where it lives, not a hidden mode); import is T04-restore's dry-run →
// apply plus T14's filter creates, write scopes asked at the click.
// ======================================================================
const MacBaselineTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let res = null;            // the collect result (cache-served or fresh)
  // The four acts are four TABS (build 10528, Mihai's layout): compare and
  // import everywhere; export and upstream only on the baseline tenant.
  let mode = "compare";
  let cat = null;            // the active catalog (bundled or loaded)
  let catSource = "";        // "bundled" | "file"
  let cmp = null;            // compare() result
  let planned = null, plannedFilters = null, running = false;

  const prog = (m) => TunoProgress.show("mbBody", "mbProg", m);
  const download = (name, text, type) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const isCfdev = () => { const t = window.TunoTenant; return !!(t && t.isCfdev && t.isCfdev()); };
  const tenantName = () => { const n = $("tenantName"); return (n && n.textContent) || ""; };

  const vms = () => {
    const out = [];
    // Assignment filters ride along: the documenter's thirteen surfaces
    // include the filters section, so the baseline's enrolment filters are
    // in the same collection as everything else — one read, one identity.
    for (const sec of (res && res.sections) || []) {
      for (const it of sec.items || []) out.push({ id: it.id, name: it.name, section: sec.id, sectionLabel: sec.label });
    }
    return out;
  };

  function activeCatalog() {
    if (cat) return cat;
    const b = MacBaseline.bundled();
    if (b) { cat = b; catSource = "bundled"; }
    return cat;
  }

  function land(r, sourceNote) {
    res = r;
    const c = activeCatalog();
    // a comparison needs both sides — a catalog alone renders as the
    // baseline LIST, its tenant columns waiting, never as "missing"
    cmp = (r && c) ? MacBaseline.compare(vms(), c) : null;
    render(sourceNote);
  }

  // The rail (10552): the 10528 seg grown into the shared ep-rail chrome,
  // each node carrying the state of its act — the compare's worst count,
  // whether the upstream zip is loaded and how much of it wants review.
  function renderSeg() {
    const el = $("mbSeg");
    if (!el) return;
    const c = activeCatalog();
    const node = (k, icon, label, right, bad) => `<div class="ep-node${mode === k ? " active" : ""}" data-mbmode="${k}" role="button" tabindex="0">
      <span>${icon} ${label}</span><span class="mini" style="margin-left:auto;white-space:nowrap${bad ? ";color:var(--off)" : ""}">${right}</span></div>`;
    const worst = cmp ? (cmp.counts.missing || 0) + (cmp.counts.outdated || 0) : null;
    const upBad = upstream ? upstream.rows.filter((r) => r.status !== "same").length : null;
    el.innerHTML = [
      node("compare", "🍎", "Compare", cmp ? (worst ? `${worst} to fix` : "in step") : c ? `${c.policies.length}` : "—", worst > 0),
      ...(isCfdev() ? [node("export", "🧬", "Export", res ? "ready" : "read first", false)] : []),
      node("import", "📥", "Import", c ? `${c.policies.length}` : "no catalog", !c),
      ...(isCfdev() ? [node("upstream", "🍏", "Upstream", upstream === null ? "load the zip" : upBad ? `${upBad} to review` : "covered", upBad > 0)] : []),
    ].join("");
  }

  function render(sourceNote) {
    if (sourceNote) lastSource = sourceNote;
    renderSeg();
    const c = activeCatalog();
    const parts = [];
    if (lastSource) parts.push(`<p class="mini muted" style="margin:0 0 8px">${lastSource}</p>`);

    // the catalog line rides every tab — which baseline this screen speaks for
    if (c) {
      parts.push(`<p class="mini muted" style="margin:0 0 10px">Catalog: <b>${esc(c.release || "R26")}</b> · ${c.policies.length} policies · ${catSource === "file" ? `loaded from a file${c.tenant ? ` (exported from ${esc(c.tenant)}${c.exported ? `, ${esc(String(c.exported).slice(0, 10))}` : ""})` : ""}` : `the bundled reference export${c.tenant ? ` from ${esc(c.tenant)}` : ""}${c.exported ? ` (${esc(String(c.exported).slice(0, 10))})` : ""}`}.</p>`);
    } else {
      parts.push(`<div class="list-card"><p class="mini" style="margin:0"><b>No catalog is bundled with this build.</b> Load a baseline file under 📥 Import — or, on the baseline tenant, 🧬 export one. Until a catalog is present this screen can only list which policies WEAR the convention, not judge them.</p></div>`);
    }

    if (mode === "compare") {
      if (cmp) {
        const card = (k) => {
          const st = MacBaseline.STATUS[k], n = cmp.counts[k] || 0;
          if (!n && !["missing", "outdated", "ok"].includes(k)) return "";
          return `<div class="au-card"><div class="au-card-l">${st.icon} ${esc(st.label)}</div><div class="au-card-n ${n ? st.cls : ""}">${n}</div><div class="au-card-s">${k === "missing" ? "in the baseline, not here" : k === "extra" ? "wears the convention, not in the baseline" : ""}</div></div>`;
        };
        parts.push(`<div class="au-cards">${["missing", "outdated", "ok", "ahead", "unversioned", "extra"].map(card).join("")}</div>`);
        const relver = (rel, ver) => `${esc(MacBaseline.relLabel(rel))}${ver ? ` · v${esc(ver)}` : ""}`;
        const row = (r) => {
          const st = MacBaseline.STATUS[r.status];
          return `<tr>
            <td class="mini">${r.baseline ? esc(r.baseline.name) : `<span class="muted">—</span>`}</td>
            <td class="mini">${r.tenant ? esc(r.tenant.name) : `<span class="gu-how exc">missing</span>`}${r.duplicates ? ` <span class="gu-how priv" title="${r.duplicates} policies carry this identity — a leftover copy; judged on the best">×${r.duplicates}</span>` : ""}</td>
            <td class="mini">${r.baseline ? relver(r.bRel, r.bVer) : "—"}</td>
            <td class="mini">${r.tenant ? relver(r.tRel, r.tVer) : "—"}</td>
            <td><span class="gu-how ${st.cls === "bad" ? "exc" : st.cls === "ok" ? "inc" : ""}">${st.icon} ${esc(st.label)}</span></td>
          </tr>`;
        };
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">The baseline, line by line (${cmp.covered} of ${cmp.baselineTotal} covered)</h4>
          <p class="mini muted" style="margin:0 0 8px">The identity is the NAME with the release tag and version stripped; releases compare first — R26.6 is June 2026, the year then the month — and versions break the tie. Worst first.</p>
          <div class="gu-tw"><table class="cg-table"><thead><tr><th>Baseline policy</th><th>This tenant</th><th style="width:120px">Baseline</th><th style="width:120px">Tenant</th><th style="width:170px">Status</th></tr></thead>
          <tbody>${cmp.rows.map(row).join("") || `<tr><td colspan="5" class="mini">The catalog is empty.</td></tr>`}</tbody></table></div></div>`);
      } else if (c && !res) {
        // THE BASELINE IS ALWAYS SHOWN (build 10530, Mihai's rule): the
        // catalog is known before any read, so its rows render at once —
        // and the tenant columns say NOT READ, never missing, because
        // unknown is not a verdict in this house.
        const relver = (rel, ver) => `${esc(MacBaseline.relLabel(rel))}${ver ? ` · v${esc(ver)}` : ""}`;
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">The baseline, line by line (${c.policies.length})</h4>
          <p class="mini muted" style="margin:0 0 8px">🍎 Read the tenant fills the right-hand columns — until then this tenant's side is unknown, not missing.</p>
          <div class="gu-tw"><table class="cg-table"><thead><tr><th>Baseline policy</th><th>This tenant</th><th style="width:120px">Baseline</th><th style="width:120px">Tenant</th><th style="width:170px">Status</th></tr></thead>
          <tbody>${c.policies.map((b2) => `<tr>
            <td class="mini">${esc(b2.name)}</td>
            <td class="mini muted">—</td>
            <td class="mini">${relver(MacBaseline.normRel(b2.release, b2.name), b2.version || MacBaseline.versionOf(b2.name))}</td>
            <td class="mini muted">—</td>
            <td class="mini muted">not read</td>
          </tr>`).join("") || `<tr><td colspan="5" class="mini">The catalog is empty.</td></tr>`}</tbody></table></div></div>`);
      } else if (res && !c) {
        const worn = vms().filter((v) => MacBaseline.looksBaseline(v.name));
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">Policies wearing the convention (${worn.length})</h4>
          ${worn.length ? `<ul class="mini" style="margin:6px 0 0">${worn.map((w) => `<li>${esc(w.name)} <span class="muted">(${esc(MacBaseline.relLabel(MacBaseline.releaseOf(w.name)))}${MacBaseline.versionOf(w.name) ? ` · v${esc(MacBaseline.versionOf(w.name))}` : " · no version in the name"})</span></li>`).join("")}</ul>` : `<p class="mini muted" style="margin:0">None — no policy name starts with MACOS and carries an Ryy.m release tag.</p>`}</div>`);
      }
      if (res && res.failed && res.failed.length) {
        parts.push(`<div class="gu-fail"><b>${res.failed.length} surface${res.failed.length === 1 ? "" : "s"} could not be read</b><span class="why">${res.failed.map((f) => esc(f.label)).join(", ")} — a baseline policy living there would read as missing, so these rows are floors, not verdicts.</span></div>`);
      }
    }

    if (mode === "export") {
      // reachable only on the baseline tenant — the tab does not render elsewhere
      parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">🧬 Export the baseline <span class="mini muted">— this IS the baseline tenant</span></h4>
        <p class="mini muted" style="margin:0 0 8px">Writes the catalog file from this tenant's MACOS policies — names, releases, versions and the raw bodies, so the one file drives identification and import everywhere else. Bundle it into the build as js/macbaselineData.js when it is the new reference.</p>
        ${res ? `<button class="btn primary" id="mbExport">⬇ Export the baseline file</button>` : `<p class="mini muted" style="margin:0">🍎 Read the tenant first — the export is cut from the read.</p>`}
        <span class="mini muted" id="mbExportNote"></span></div>`);
    }

    if (mode === "import") {
      const importReady = c && c.policies.some((p) => p.body && p.importable !== false);
      parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">📥 Import the baseline <span class="tag block">writes to the tenant</span></h4>
        <p class="mini muted" style="margin:0 0 8px">Create-only, two proven pipelines: policies through the Backup tool's restore (dry run, collision stop per name, read-back verify) and assignment filters through 🧩 T14's own create. Everything arrives <b>unassigned</b> — reach is ✏️ the editor's act, taken deliberately afterwards. Created policies keep their <b>canonical baseline names</b>, no prefix — the name is the identity this screen matches on. Scripts are identified but not importable from the catalog: the reference read carries no script bodies, and a script without its body cannot be put back.</p>
        <div class="tb-actions">
          <label class="btn">📄 Load a baseline file<input type="file" id="mbFile" accept=".json" style="display:none"></label>
          <button class="btn" id="mbDry" ${importReady ? "" : "disabled title=\"The active catalog carries nothing importable — load a baseline export file.\""}>🔍 Dry run — create what is missing</button>
        </div>
        <div id="mbPlan" style="margin-top:10px"></div></div>`);
    }

    if (mode === "upstream") {
      parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">🍏 Upstream — Microsoft's intune-my-macs <span class="tag block">writes to the tenant</span></h4>
        <p class="mini muted" style="margin:0 0 8px">Watch <code>github.com/microsoft/intune-my-macs</code> for controls our baseline lacks. The app never fetches it — the content-security policy allows Graph and nothing else, and that rule does not bend for a read-only repo: <b>download the zip yourself</b> (the link is plain navigation), then load it here. Matching is by <b>content, never name</b>: a settings-catalog policy is its set of setting definition ids, a compliance policy the properties it configures — identical sets are <b>same</b>, a half-or-better overlap is a <b>match with its diff shown</b>, anything else is <b>new</b>. New and changed controls get an editable canonical name and can be created in THIS tenant — curate, then 🧬 re-export the baseline.</p>
        <div class="tb-actions">
          <a class="btn" href="${esc(MacBaseline.UPSTREAM_ZIP_URL)}" target="_blank" rel="noopener">⬇ Get the latest (zip, from GitHub)</a>
          <label class="btn">📄 Load the intune-my-macs zip<input type="file" id="mbUpZip" accept=".zip" style="display:none"></label>
        </div>
        <p class="mini muted" id="mbUpNote" style="margin:8px 0 0"></p></div>`);
    }

    $("mbBody").innerHTML = parts.join("");
    // The upstream RESULTS live in their own host and are only shown on
    // their tab — hidden, not destroyed, so ticks and edited names survive
    // switching tabs (the restore picker's rule, applied to tabs).
    const up = $("mbUpstream");
    if (up) up.style.display = mode === "upstream" ? "" : "none";
    wire();
  }

  function wire() {
    const ex = $("mbExport");
    if (ex) ex.addEventListener("click", () => {
      const built = MacBaseline.buildExport(res, tenantName());
      if (!built.file.policies.length) { $("mbExportNote").textContent = "Nothing to export — no policy wears the convention."; return; }
      download(`tuno-macos-baseline-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(built.file, null, 2));
      $("mbExportNote").textContent = `${built.file.policies.length} policies exported`
        + (built.duplicateKeys.length ? ` · DUPLICATE IDENTITIES: ${built.duplicateKeys.join("; ")} — a leftover copy in the tenant; fix it before bundling` : "")
        + (built.skipped.length ? ` · ${built.skipped.length} skipped (${built.skipped.map((s) => s.why)[0]})` : "");
    });
    const fi = $("mbFile");
    if (fi) fi.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        cat = MacBaseline.parseCatalog(await f.text());
        catSource = "file";
        cmp = res ? MacBaseline.compare(vms(), cat) : null;
        render();
      } catch (err) {
        $("mbPlan").innerHTML = `<div class="gu-fail"><b>${esc((err && err.message) || err)}</b></div>`;
      }
    });
    const dry = $("mbDry");
    if (dry) dry.addEventListener("click", dryRun);
    const uz = $("mbUpZip");
    if (uz) uz.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) await loadUpstreamZip(f);
    });
  }

  // ------------------------------------------------ the upstream watch --
  // Rendered into its OWN host (#mbUpstream): the curation table's ticks
  // and edited names are DOM state, and mbBody re-renders would silently
  // drop them — the restore picker's rule.
  let upstream = null;   // { rows, skipped, seenOther, when }
  let lastSource = "";   // the source note rides re-renders and tab switches

  async function loadUpstreamZip(file) {
    const c = activeCatalog();
    if (!c) { $("mbUpNote").textContent = "Load or bundle a baseline catalog first — a diff needs both sides."; return; }
    try {
      $("mbUpNote").textContent = "Reading the zip…";
      const z = await JSZip.loadAsync(file);
      const jobs = [];
      z.forEach((path, zf) => {
        if (!zf.dir && /\.json$/i.test(path)) jobs.push(zf.async("string").then((t) => ({ path, text: t })));
        else if (!zf.dir && /\.(mobileconfig|sh|zsh|ps1|pkg)$/i.test(path)) jobs.push(Promise.resolve({ path, text: "" }));
      });
      const files = await Promise.all(jobs);
      const parsed = MacBaseline.parseUpstream(files);
      if (!parsed.policies.length) { $("mbUpNote").textContent = "No comparable policies in the zip — is this the intune-my-macs archive?"; return; }
      upstream = {
        rows: MacBaseline.matchUpstream(parsed.policies, c),
        skipped: parsed.skipped, seenOther: parsed.seenOther,
        when: new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      };
      $("mbUpNote").textContent = "";
      renderUpstream();
      renderSeg();   // the rail's upstream node now knows the zip is in
    } catch (e) {
      $("mbUpNote").textContent = `The zip could not be read: ${(e && e.message) || e}`;
    }
  }

  function renderUpstream() {
    if (!upstream) return;
    const n = { same: 0, differs: 0, new: 0 };
    upstream.rows.forEach((r) => { n[r.status]++; });
    const order = { new: 0, differs: 1, same: 2 };
    const rows = [...upstream.rows].sort((a, b) => order[a.status] - order[b.status] || String(a.up.name).localeCompare(String(b.up.name)));
    const idShort = (x) => String(x).split("_").pop();
    // THE SUMMARY SPEAKS THE TOOL'S OWN LANGUAGE (build 10529, "fix this
    // layout"): the same au-cards the Compare tab uses, not a strip of
    // chips this tool uses nowhere else.
    const card = (label, num, sub, cls) => `<div class="au-card"><div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${num}</div><div class="au-card-s">${sub}</div></div>`;
    const cards = `<div class="au-cards">
      ${card("＋ New to us", n.new, "controls the baseline lacks", n.new ? "bad" : "")}
      ${card("≠ Matched, differs", n.differs, "same control, different settings or values", n.differs ? "warn" : "")}
      ${card("✓ Covered", n.same, "setting for setting, value for value", "ok")}
      ${card("Seen, not comparable", upstream.seenOther || 0, "scripts and profiles — no policy body to diff")}
    </div>`;
    // the per-policy what's new: a native fold, open only when asked
    const whatsNew = (r) => {
      if (r.status === "same") return r.match ? `<div class="mini muted" style="margin-top:4px">= <b>${esc(r.match.name)}</b></div>` : "";
      if (r.status === "new") return `<div class="mini muted" style="margin-top:4px">every one of its ${r.up.defIds.length} setting${r.up.defIds.length === 1 ? "" : "s"} is new to the baseline</div>`;
      const d = r.diff;
      const li = (x, tail) => `<li><code title="${esc(x.id)}">${esc(idShort(x.id))}</code>${tail}</li>`;
      return `<details class="mini" style="margin-top:4px"><summary style="cursor:pointer">what's new — ${d.added.length} added · ${d.changed.length} changed · ${d.removed.length} only ours (matches <b>${esc(r.match.name)}</b>, ${Math.round(r.score * 100)}% by content)</summary>
        <ul style="margin:6px 0 0">
          ${d.added.map((x) => li(x, ` — they set ${esc(x.theirs)}`)).join("")}
          ${d.changed.map((x) => li(x, ` — ours ${esc(x.ours)} → theirs ${esc(x.theirs)}`)).join("")}
          ${d.removed.map((x) => li(x, ` — only in the baseline (${esc(x.ours)})`)).join("")}
        </ul></details>`;
    };
    const row = (r, i) => {
      const act = r.status !== "same";
      const badge = r.status === "new" ? `<span class="gu-how exc">new</span>`
        : r.status === "differs" ? `<span class="gu-how">differs</span>`
          : `<span class="gu-how inc">✓</span>`;
      return `<tr>
        <td style="width:30px">${act ? `<input type="checkbox" data-uptick="${i}" ${r.status === "new" ? "checked" : ""}>` : ""}</td>
        <td class="mini"><b>${esc(r.up.name)}</b> ${badge}<div class="mini muted">${esc(r.up.kind === "compliance" ? "compliance" : "settings catalog")} · ${r.up.defIds.length} setting${r.up.defIds.length === 1 ? "" : "s"}</div>${whatsNew(r)}</td>
        <td>${act ? `<input data-upname="${i}" value="${esc(MacBaseline.proposeName(r))}" style="width:100%">` : ""}</td>
      </tr>`;
    };
    $("mbUpstream").innerHTML = `<div class="list-card">
      <h4 style="margin:0 0 6px">🍏 intune-my-macs vs the baseline <span class="mini muted">— loaded ${esc(upstream.when)}</span></h4>
      ${cards}
      <p class="mini muted" style="margin:10px 0 4px">Tick what belongs in the baseline and curate the name — proposals stamp <b>${esc(MacBaseline.relLabel(MacBaseline.currentRelease()))}</b> with the version increased; created here unassigned, then 🧬 re-export.</p>
      ${upstream.skipped.length ? `<p class="mini muted" style="margin:0 0 8px">${upstream.skipped.length} file(s) skipped: ${esc(upstream.skipped.map((sk) => sk.path.split("/").pop()).slice(0, 3).join(", "))}${upstream.skipped.length > 3 ? "…" : ""}</p>` : ""}
      <div class="tb-actions" style="margin:8px 0 8px">
        <button class="btn" id="mbUpAll">☑ Select all</button>
        <button class="btn" id="mbUpNone">☐ Select none</button>
        <span class="mini muted" id="mbUpCount"></span>
        <button class="btn" id="mbUpMd" title="The whole comparison as Markdown — what is new, per policy, for the release notes">📝 What's new (Markdown)</button>
      </div>
      <div class="gu-tw"><table class="cg-table" style="table-layout:fixed;width:100%"><colgroup><col style="width:34px"><col style="width:56%"><col></colgroup>
        <thead><tr><th><input type="checkbox" id="mbUpMaster" title="Select or deselect every row below"></th><th>Upstream policy — and what's new in it</th><th>Canonical name (edit before creating)</th></tr></thead>
        <tbody>${rows.map(row).join("")}</tbody></table></div>
      <div id="mbUpPlan" style="margin-top:10px"></div>
    </div>
    <div class="ae-selbar" id="mbUpBar"><b id="mbUpBarCount"></b>
      <button class="btn primary" id="mbUpDry">🔍 Dry run the ticked <span class="tag block">plans writes</span></button>
      <button class="ae-selbar-x" id="mbUpBarX" title="Clear the selection">✕</button></div>`;
    // stable index → row mapping for the dry run
    $("mbUpstream").dataset.order = JSON.stringify(rows.map((r) => upstream.rows.indexOf(r)));
    $("mbUpDry").addEventListener("click", upDryRun);
    // select all / none (Mihai's ask) — three faces of one selection: the
    // header master checkbox, the two buttons, and the row ticks, kept in
    // step so none of them can lie about the others
    const ticks = () => [...$("mbUpstream").querySelectorAll("[data-uptick]")];
    const master = $("mbUpMaster");
    // FOUR faces of one selection (the 10549 pattern): master box, the
    // all/none buttons above the table (the 10533 rule — never below it),
    // the row ticks, and the floating bar carrying the dry run, so a long
    // curation list never puts the action a scroll away.
    const syncMaster = () => {
      const t = ticks(), on = t.filter((c) => c.checked).length;
      master.checked = on > 0 && on === t.length;
      master.indeterminate = on > 0 && on < t.length;
      const c2 = $("mbUpCount"); if (c2) c2.textContent = t.length ? `${on} of ${t.length} ticked` : "";
      const bar = $("mbUpBar");
      if (bar) {
        bar.classList.toggle("visible", on > 0);
        const bc = $("mbUpBarCount"); if (bc) bc.textContent = `${on} polic${on === 1 ? "y" : "ies"} ticked`;
      }
    };
    const setAll = (v) => { ticks().forEach((c) => { c.checked = v; }); syncMaster(); };
    master.addEventListener("change", () => setAll(master.checked));
    $("mbUpAll").addEventListener("click", () => setAll(true));
    $("mbUpNone").addEventListener("click", () => setAll(false));
    $("mbUpBarX").addEventListener("click", () => setAll(false));
    $("mbUpstream").addEventListener("change", (e) => { if (e.target.closest("[data-uptick]")) syncMaster(); });
    syncMaster();
    $("mbUpMd").addEventListener("click", () => {
      const c = activeCatalog();
      download(`intune-my-macs-vs-baseline-${new Date().toISOString().slice(0, 10)}.md`,
        MacBaseline.upstreamMarkdown(rows, { catalog: c ? `${c.release || "R26"} (${c.policies.length} policies)` : "" }), "text/markdown");
    });
  }

  let upPlanned = null;
  async function upDryRun() {
    if (running || !upstream) return;
    running = true; $("mbUpDry").disabled = true; $("mbUpPlan").innerHTML = "";
    try {
      const order = JSON.parse($("mbUpstream").dataset.order || "[]");
      const picked = [], badNames = [];
      $("mbUpstream").querySelectorAll("[data-uptick]").forEach((cb) => {
        if (!cb.checked) return;
        const i = +cb.dataset.uptick;
        const r = upstream.rows[order[i]];
        const nameEl = $("mbUpstream").querySelector(`[data-upname="${i}"]`);
        const name = (nameEl && nameEl.value || "").trim();
        // the point is inclusion in the baseline — a name that does not wear
        // the convention would be invisible to the very screen above
        if (!MacBaseline.looksBaseline(name)) { badNames.push(name || r.up.name); return; }
        picked.push(MacBaseline.upstreamEntry(r, name));
      });
      if (badNames.length) {
        $("mbUpPlan").innerHTML = `<div class="gu-fail"><b>${badNames.length} name${badNames.length === 1 ? " does" : "s do"} not wear the convention</b><span class="why">MACOS prefix, an Ryy.m release tag and a version — without them the policy would be invisible to the comparison above. Fix: ${esc(badNames[0])}</span></div>`;
        return;
      }
      if (!picked.length) { $("mbUpPlan").innerHTML = `<p class="mini muted" style="margin:0">Nothing ticked.</p>`; return; }
      prog("Checking what already exists…");
      await Graph.ensureScopes(Graph.SCOPES.config);
      const names = await Restore.existingNames([...new Set(picked.map((x) => x.area))], (m) => prog(m));
      upPlanned = Restore.plan(picked, names);
      prog("");
      const nCreate = upPlanned.filter((p) => !p.collided).length;
      $("mbUpPlan").innerHTML = `
        <p class="mini" style="margin:0 0 8px"><b>${nCreate} to create</b> · ${upPlanned.length - nCreate} already present (the collision stop)</p>
        <div class="gu-tw"><table class="cg-table"><thead><tr><th>Will be created as</th><th style="width:180px">Surface</th><th style="width:200px">Operation</th></tr></thead>
        <tbody>${upPlanned.map((p) => `<tr><td class="mini"><b>${esc(p.target)}</b></td><td class="mini">${esc(Restore.AREA_INFO[p.area].label)}</td><td class="mini${p.collided ? '" style="color:var(--off)' : ""}">${p.collided ? "skip — a policy already wears this name" : "create, unassigned"}</td></tr>`).join("")}</tbody></table></div>
        ${nCreate ? `<div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="mbUpApply">✍ Create ${nCreate} in THIS tenant <span class="tag block">writes to the tenant</span></button></div>` : ""}
        <div id="mbUpResult" style="margin-top:10px"></div>`;
      const ap = $("mbUpApply");
      if (ap) ap.addEventListener("click", upApply);
    } catch (e) {
      prog("");
      $("mbUpPlan").innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
    } finally { running = false; const d = $("mbUpDry"); if (d) d.disabled = false; }
  }

  async function upApply() {
    if (running || !upPlanned) return;
    running = true; $("mbUpApply").disabled = true;
    try {
      await Graph.ensureScopes(Graph.SCOPES.profiles);
      const results = await Restore.apply(upPlanned, (m) => prog(m));
      prog("");
      const good = results.filter((r) => r.outcome === "created").length;
      const bad = results.filter((r) => r.outcome === "failed").length;
      $("mbUpResult").innerHTML = `
        <p class="mini" style="margin:0 0 6px"><b>${good} created</b>${bad ? ` · <b style="color:var(--off)">${bad} failed</b>` : ""} — unassigned, in this tenant only. Now 🍎 Read the tenant, judge them in the comparison, and 🧬 re-export: the export becomes the new baseline, versions increased, wearing this month's release.</p>
        ${results.filter((r) => r.outcome === "failed").map((r) => `<div class="gu-fail"><b>${esc(r.target || "")}</b><span class="why">${esc(r.detail || "")}</span></div>`).join("")}`;
      if (typeof PolicyCache !== "undefined") PolicyCache.invalidate();
      upPlanned = null;
    } catch (e) {
      prog("");
      $("mbUpResult").innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      const ap = $("mbUpApply"); if (ap) ap.disabled = false;
    } finally { running = false; }
  }

  async function dryRun() {
    if (running) return;
    const c = activeCatalog();
    if (!c) return;
    running = true; $("mbDry").disabled = true; $("mbPlan").innerHTML = "";
    try {
      const { entries, filters, refused } = MacBaseline.importEntries(c, null);
      if (!entries.length && !filters.length) { $("mbPlan").innerHTML = `<div class="gu-fail"><b>Nothing importable.</b><span class="why">${refused.length ? esc(refused[0].why) : "The catalog carries no policy bodies."}</span></div>`; return; }
      prog("Checking what already exists…");
      // the read scope is enough for the dry run — the writes are asked at Apply
      await Graph.ensureScopes(Graph.SCOPES.config);
      const names = entries.length ? await Restore.existingNames([...new Set(entries.map((x) => x.area))], (m) => prog(m)) : {};
      planned = entries.length ? Restore.plan(entries, names) : [];
      // filters: the collision check is T14's own list, fresh
      let haveFilters = new Set();
      if (filters.length) {
        prog("Reading the tenant's assignment filters…");
        try { haveFilters = new Set((await Filters.list()).map((f) => String(f.displayName || "").toLowerCase())); }
        catch (e) { throw new Error(`The tenant's filters could not be read (${(e && e.message) || e}) — the filter half of the plan would be a guess, so there is no plan.`); }
      }
      plannedFilters = filters.map((f) => ({ ...f, collided: haveFilters.has(String(f.body.displayName).toLowerCase()) }));
      prog("");
      const rows = [
        ...planned.map((p) => `<tr><td class="mini"><b>${esc(p.newName)}</b></td><td class="mini">${esc(Restore.AREA_INFO[p.area].label)}</td><td class="mini${p.collided ? '" style="color:var(--off)' : ""}">${p.collided ? "skip — a policy already wears this name" : "create, unassigned"}</td></tr>`),
        ...plannedFilters.map((f) => `<tr><td class="mini"><b>${esc(f.body.displayName)}</b></td><td class="mini">Assignment filter (T14's create)</td><td class="mini${f.collided ? '" style="color:var(--off)' : ""}">${f.collided ? "skip — a filter already wears this name" : "create"}</td></tr>`),
      ].join("");
      const nCreate = planned.filter((p) => !p.collided).length + plannedFilters.filter((f) => !f.collided).length;
      const nSkip = planned.filter((p) => p.collided).length + plannedFilters.filter((f) => f.collided).length;
      $("mbPlan").innerHTML = `
        <p class="mini" style="margin:0 0 8px"><b>${nCreate} to create</b> · ${nSkip} already present (the collision stop — present is the point, not a problem)${refused.length ? ` · ${refused.length} not importable (${esc(refused[0].why)})` : ""}</p>
        <div class="gu-tw"><table class="cg-table"><thead><tr><th>Baseline policy</th><th style="width:200px">Path</th><th style="width:220px">Operation</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${nCreate ? `<div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="mbApply">✍ Create ${nCreate} object${nCreate === 1 ? "" : "s"} <span class="tag block">writes to the tenant</span></button></div>` : ""}
        <div id="mbResult" style="margin-top:10px"></div>`;
      const ap = $("mbApply");
      if (ap) ap.addEventListener("click", apply);
    } catch (e) {
      prog("");
      $("mbPlan").innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
    } finally { running = false; const d = $("mbDry"); if (d) d.disabled = false; }
  }

  async function apply() {
    if (running || (!planned && !plannedFilters)) return;
    running = true; $("mbApply").disabled = true;
    try {
      // the write scope, at the click that writes
      await Graph.ensureScopes(Graph.SCOPES.profiles);
      const results = planned && planned.length ? await Restore.apply(planned, (m) => prog(m)) : [];
      const filterResults = [];
      for (const f of plannedFilters || []) {
        if (f.collided) { filterResults.push({ target: f.body.displayName, outcome: "skipped", detail: "name existed at dry run" }); continue; }
        try {
          prog(`${f.body.displayName} — creating the filter…`);
          await Filters.create(f.body);   // T14's create: POST + read-back
          filterResults.push({ target: f.body.displayName, outcome: "created", detail: "verified by read-back" });
        } catch (e) {
          filterResults.push({ target: f.body.displayName, outcome: "failed", detail: String((e && e.message) || e) });
        }
      }
      prog("");
      const all = [...results, ...filterResults];
      const good = all.filter((r) => r.outcome === "created").length;
      const bad = all.filter((r) => r.outcome === "failed").length;
      $("mbResult").innerHTML = `
        <p class="mini" style="margin:0 0 6px"><b>${good} created</b>${bad ? ` · <b style="color:var(--off)">${bad} failed</b>` : ""} — everything unassigned; ✏️ the Assignment editor is where reach begins.</p>
        ${all.filter((r) => r.outcome === "failed").map((r) => `<div class="gu-fail"><b>${esc(r.target || "")}</b><span class="why">${esc(r.detail || "")}</span></div>`).join("")}`;
      if (typeof PolicyCache !== "undefined") PolicyCache.invalidate();
      planned = null; plannedFilters = null;
    } catch (e) {
      prog("");
      $("mbResult").innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      const ap = $("mbApply"); if (ap) ap.disabled = false;
    } finally { running = false; }
  }

  // ---- read: through the shared cache, T19's shape ----
  async function run(attach) {
    if (running) return;
    running = true; $("mbRun").disabled = true; $("mbBody").innerHTML = "";
    try {
      let r;
      if (attach && PolicyCache.reading()) {
        prog("Reading the tenant…");
        r = await PolicyCache.read(prog);
      } else {
        prog("Checking permissions…");
        await Graph.ensureScopes(PolicyCache.scopesNeeded());
        r = await PolicyCache.refresh(prog);
      }
      prog("");
      land(r, attach ? srcNote() : "");
    } catch (e) {
      prog("");
      $("mbBody").innerHTML = `<div class="gu-fail"><b>The read failed.</b><span class="why">${esc((e && e.message) || e)}</span></div>`;
    } finally { running = false; $("mbRun").disabled = false; }
  }
  const srcNote = () =>
    `From ${PolicyCache.fromSignIn() ? "the sign-in read" : "the shared read"} at ${esc(PolicyCache.timeLabel())} — 🍎 Read the tenant re-reads.`;

  function onShow() {
    if (res || running) return;
    const c = PolicyCache.get();
    if (c) { land(c, srcNote()); return; }
    if (PolicyCache.reading()) { run(true); return; }
    // no cache, no read running: the baseline still shows (10530) — the
    // catalog is bundled knowledge, and the read only fills the tenant side
    render();
  }

  function init() {
    if (!$("mbRun")) return;
    (window.TunoScreenHooks = window.TunoScreenHooks || {})["screen-macbaseline"] = onShow;
    $("mbRun").addEventListener("click", () => run(false));
    // the tabs — a seg, the house switcher
    $("mbSeg").addEventListener("click", (e) => {
      const b2 = e.target.closest("[data-mbmode]");
      if (!b2 || b2.dataset.mbmode === mode) return;
      mode = b2.dataset.mbmode;
      render();
    });
    renderSeg();
  }

  return { init, _setForTest: (r, c, m) => { cat = c || null; catSource = c ? "file" : ""; mode = m || "compare"; land(r, ""); } };
})();

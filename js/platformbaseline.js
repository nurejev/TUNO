// ======================================================================
// Platform baseline — ENCA's Baseline Policies machinery turned
// Intune-side-out, ONCE, for every platform that wears the convention.
//
// Until build 10571 this file's content lived in js/macbaseline.js as T24
// alone. Mihai's ask ("the OpenIntuneBaseline should get the same
// treatment as the macOS baseline") would have meant a second thousand-line
// copy with MACOS swapped for Win — the exact duplication the house rules
// forbid for T05's collect and TunoProgress. So the machinery moved here
// and each platform became a SPEC: prefix, screen ids, upstream repo,
// name proposal. T24 (🍎 macOS, spec in js/macbaseline.js) and T27 (🪟
// Windows, spec in js/winbaseline.js) are the same code with different
// nouns. The exports T24's tests knew are unchanged, name for name.
//
// THE NAMING CONVENTION, learned from the reference exports rather than
// assumed:
//
//   MACOS - DCP - Apple Firewall - D - Enable MACOS Firewall - R26.6 - v3.0
//   Win - SEC - App Control for Business - D - AllowAll - R26.6 - v3.0
//   └───┘                                                    └────┘ └──┘
//   prefix            the identity is the NAME               release version
//
// R26.x IS THE BASELINE RELEASE — a DATE, yy.m (Mihai's rule): R26.6 is
// June 2026, worn by every policy of that cut, NOT a per-policy number.
// The stable identity is the NAME with the release tag and version
// stripped and separators normalised; release and version together
// order two sightings: releases compare first (year, then month),
// versions break the tie segment-wise (ENCA's cmpVersion verbatim).
//
// TWO CATALOGS PER PLATFORM (build 10571, ENCA's Joey Verlinden treatment):
//
//   🧬 CloudFellows — the baseline tenant's own export (cfdev convention:
//      exported on cloudfellows.dev and only there), read from the app's
//      own baseline/<platform>/catalog.json (10575) or loaded as a file.
//   🧩 the COMMUNITY baseline — OpenIntuneBaseline for Windows,
//      intune-my-macs for macOS — read from baseline/community/<id>/
//      catalog.json, cut verbatim from the author's repo
//      (names kept, Mihai's rule: "OIB is a community baseline and can be
//      updated through TUNO or the deployer from OIB itself; by keeping the
//      name it can be used as such"), compared on open and importable on
//      ANY tenant, exactly as ENCA compares against and imports Joey's.
//      The community catalog is ALSO the upstream: on the baseline tenant
//      the Upstream act can read it without a zip.
//
// A community policy's identity is its own: OpenIntuneBaseline v3.8 stamps
// an OIBID:<guid> into every description and tracks it in
// PolicyManifest.json ("please do not remove"), so a deployed OIB policy is
// identified by that token FIRST — a renamed copy still identifies — and
// by the name key second. intune-my-macs has no token and no versions in
// its names, so its policies match by name and land as PRESENT (ENCA's
// bucket for a baseline that does not version its names: being there is
// the whole test).
//
// BUCKETS: ok / outdated / ahead / present / unversioned / missing / extra.
// IMPORT rides T04-restore's create pipeline for the restorable areas and
// T14's OWN Filters.create for assignment filters; create-only, names kept,
// everything unassigned. SCRIPTS and DRIVER-UPDATE PROFILES are identified
// but not importable (no body, or no create path) — said on the row.
// ======================================================================
const PlatformBaseline = (() => {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ---------------------------------------------------------------- engine
  function engine(spec) {
    // ---- the naming convention ----
    const releaseOf = (name) => {
      const m = /\bR(\d{2})\.(\d{1,2})\b/i.exec(name || "");
      return m ? { y: +m[1], m: +m[2] } : null;
    };
    // The bundled R26-era macOS catalog stored the release as a bare month
    // number; everything is normalised through here so both shapes read as one.
    const normRel = (rel, name) => {
      if (rel && typeof rel === "object" && "y" in rel) return rel;
      if (typeof rel === "number") return { y: 26, m: rel };
      if (typeof rel === "string" && /^\d{2}\.\d{1,2}$/.test(rel)) { const [y, m] = rel.split(".").map(Number); return { y, m }; }
      return releaseOf(name);
    };
    const relCmp = (a, b) => (a.y - b.y) || (a.m - b.m);
    const currentRelease = () => { const d = new Date(); return { y: d.getUTCFullYear() % 100, m: d.getUTCMonth() + 1 }; };
    const versionOf = (name) => {
      const t = String(name || "").trim();
      const end = /v\s?(\d+(?:\.\d+)*)\s*$/i.exec(t);
      if (end) return end[1];
      const any = /\bv(\d+(?:\.\d+)+)\b/i.exec(t);
      return any ? any[1] : null;
    };
    // the CloudFellows convention: the platform prefix AND an Ryy.m tag
    const looksBaseline = (name) => spec.prefixRe.test(name || "") && releaseOf(name) != null;
    const keyOf = (name) => String(name || "")
      .replace(/-?\s*\bR\d{2}\.\d{1,2}\b\s*/gi, " ")
      .replace(/-?\s*v\d+(?:\.\d+)*\s*$/i, " ")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim().toLowerCase();
    const relLabel = (rel) => { const r = normRel(rel); return r ? `R${r.y}.${r.m}` : "—"; };

    function cmpVersion(a, b) {
      const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x < y ? -1 : 1;
      }
      return 0;
    }
    function cmpRelVer(aRel, aVer, bRel, bVer) {
      const a = normRel(aRel), b = normRel(bRel);
      if (a && b && relCmp(a, b) !== 0) return relCmp(a, b) < 0 ? -1 : 1;
      if (aVer && bVer) return cmpVersion(aVer, bVer);
      return null;
    }

    const STATUS = {
      missing: { icon: "✗", label: "Missing", cls: "bad", order: 0 },
      outdated: { icon: "⬆", label: "Outdated", cls: "warn", order: 1 },
      differs: { icon: "≠", label: "Differs", cls: "warn", order: 2 },     // same control, different settings or values (content match, 10576)
      present: { icon: "✓", label: "Present", cls: "ok", order: 3 },
      ok: { icon: "✓", label: "Up to date", cls: "ok", order: 4 },
      ahead: { icon: "⬇", label: "Newer than baseline", cls: "info", order: 5 },
      unversioned: { icon: "?", label: "Version unknown", cls: "info", order: 6 },
      extra: { icon: "＋", label: "Not in baseline", cls: "info", order: 7 },
    };

    // content overlap, the one rule for "this is the same control": hits over
    // the smaller set — the Upstream act's and, since 10576, the community
    // comparison's
    function overlap(A, B) {
      if (!A.size || !B.size) return 0;
      let hit = 0;
      for (const x of A) if (B.has(x)) hit++;
      return hit / Math.min(A.size, B.size);
    }

    // ---- catalogs ----
    // THE FOLDER IS THE CATALOG (build 10575, Mihai: "why is baseline/windows
    // in the repo not read as the catalog?"). Until 10574 the same catalog
    // was written twice — js/<platform>baselineData.js for the app and
    // baseline/<platform>/ for people — kept equal only because one function
    // wrote both. Now the app reads baseline/<platform>/catalog.json and
    // baseline/community/<id>/catalog.json from ITS OWN ORIGIN when a
    // baseline tool opens: connect-src 'self' already allows it, ?v= busts
    // the cache like any asset, and 1.7 MB leaves every page load. The
    // engine holds what the loader read; the screen's loadCatalogs() fills it.
    let bundledCat = null, communityCat = null;
    const setBundled = (c) => { bundledCat = (c && c.kind === spec.kind && Array.isArray(c.policies)) ? c : null; return bundledCat; };
    const setCommunity = (c) => { communityCat = (c && c.kind === "tuno-community-baseline" && Array.isArray(c.policies)) ? c : null; return communityCat; };
    function bundled() { return bundledCat; }
    // the community catalog — the same shape the Upstream act builds from a
    // zip (buildCommunity), so one file drives compare, import and upstream
    function community() { return communityCat; }
    // the two same-origin reads, once per session; a miss is reported, not
    // treated as "no baseline" — the screen says the file could not be read
    async function loadCatalogs(build) {
      const v = build ? `?v=${encodeURIComponent(build)}` : "";
      const read = async (path) => {
        try {
          const r = await fetch(path + v, { cache: "default" });
          if (!r.ok) return { error: `${path} answered ${r.status}` };
          return { cat: await r.json() };
        } catch (e) { return { error: `${path}: ${(e && e.message) || e}` }; }
      };
      const [b, c] = await Promise.all([read(spec.catalogPath), read(spec.communityPath)]);
      const errors = [];
      if (b.cat) { if (!setBundled(b.cat)) errors.push(`${spec.catalogPath} is not a ${spec.platform} baseline catalog`); } else errors.push(b.error);
      if (c.cat) { if (!setCommunity(c.cat)) errors.push(`${spec.communityPath} is not a community catalog`); } else errors.push(c.error);
      return { bundled: bundledCat, community: communityCat, errors };
    }
    const isCommunity = (cat) => !!(cat && cat.kind === "tuno-community-baseline");
    // does this name wear THIS catalog's convention? CloudFellows: prefix +
    // Ryy.m; a community catalog says so itself (OIB: "Win - OIB"); a
    // catalog with no convention (intune-my-macs) claims nothing by name —
    // its policies match by exact key only, and there is no "extra" bucket
    // because there is nothing to detect
    function catLooks(cat, name) {
      if (!isCommunity(cat)) return looksBaseline(name);
      if (!cat.nameRe) return false;
      try { return new RegExp(cat.nameRe, "i").test(name || ""); } catch { return false; }
    }
    // the author's own identity token in a description: "OIBID:<guid>"
    const tokenOf = (cat, description) => {
      if (!cat || !cat.idToken || !description) return null;
      const m = new RegExp(`\\b${cat.idToken}:\\s*([0-9a-f-]{8,})`, "i").exec(String(description));
      return m ? m[1].toUpperCase() : null;
    };
    function parseCatalog(text) {
      let j;
      try { j = JSON.parse(text); } catch { throw new Error("Not JSON — the baseline file is the tool's own export."); }
      if (!j || j.kind !== spec.kind) throw new Error(`Not a ${spec.platform} baseline file — the \`kind\` field is missing or wrong.`);
      if (!Array.isArray(j.policies)) throw new Error("The baseline file carries no policies array.");
      for (const p of j.policies) {
        if (!p.name || !looksBaseline(p.name)) throw new Error(`A catalog policy does not wear the convention: "${String(p.name || "(unnamed)").slice(0, 80)}"`);
      }
      return j;
    }

    // ---- compare tenant policies against the catalog ----
    // vms: [{ id, name, section, description }] — every policy read, any section.
    function compare(vms, cat) {
      const comm = isCommunity(cat);
      const byKey = new Map(), byTok = new Map();
      for (const p of vms) {
        const tok = comm ? tokenOf(cat, p.description) : null;
        if (tok) { if (!byTok.has(tok)) byTok.set(tok, []); byTok.get(tok).push(p); }
        // by name: the CloudFellows convention, a community convention, or —
        // for a catalog with none — an exact key the catalog itself carries
        const named = comm ? (cat.nameRe ? catLooks(cat, p.name) : true) : looksBaseline(p.name);
        if (!named) continue;
        const k = keyOf(p.name);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(p);
      }
      const consumed = new Set();
      const rows = [];
      // ONE IDENTITY, TWO VERSIONS IN THE CATALOG (build 10573, found on
      // cloudfellows.dev): a re-cut policy kept beside its old copy is
      // exported twice under one key, and the tenant carries both copies.
      // Handing every copy to the first catalog row made it "newer than
      // baseline" and left the second row "missing" — and the import then
      // created nothing, because the "missing" name already existed. So
      // when a key appears more than once in the catalog, each row takes
      // the tenant copy that wears ITS OWN release and version first; only
      // what is left over is judged by score.
      const catKeyCount = new Map();
      for (const b of cat.policies) { const k = keyOf(b.name); catKeyCount.set(k, (catKeyCount.get(k) || 0) + 1); }
      const sameRelVer = (b, bRel, bVer, p) =>
        cmpRelVer(comm ? null : releaseOf(p.name), versionOf(p.name), bRel, bVer) === 0 && !!(bVer || (!comm && bRel));
      for (const b of cat.policies) {
        const k = keyOf(b.name);
        const bRel = comm ? null : normRel(b.release, b.name);
        const bVer = b.version || versionOf(b.name);
        const bTok = comm && b.oibId ? String(b.oibId).toUpperCase() : null;
        const catDup = (catKeyCount.get(k) || 0) > 1;
        // the token wins: a renamed copy still identifies; a name hit that
        // carries a DIFFERENT token belongs to that other policy
        let hits = bTok ? (byTok.get(bTok) || []).slice() : [];
        for (const p of byKey.get(k) || []) {
          const t = comm ? tokenOf(cat, p.description) : null;
          if (t && bTok && t !== bTok) continue;
          if (t && !bTok) continue;
          if (!hits.includes(p)) hits.push(p);
        }
        hits = hits.filter((p) => !consumed.has(p));
        if (catDup) {
          // this row's own version, if the tenant has it; otherwise leave
          // every copy to the rows that still want theirs
          const exact = hits.filter((p) => sameRelVer(b, bRel, bVer, p));
          if (exact.length) hits = exact;
          else if (hits.some((p) => cat.policies.some((b2) => b2 !== b && keyOf(b2.name) === k && sameRelVer(b2, comm ? null : normRel(b2.release, b2.name), b2.version || versionOf(b2.name), p)))) {
            hits = hits.filter((p) => !cat.policies.some((b2) => b2 !== b && keyOf(b2.name) === k && sameRelVer(b2, comm ? null : normRel(b2.release, b2.name), b2.version || versionOf(b2.name), p)));
          }
        }
        if (!hits.length) {
          rows.push({ key: k, baseline: b, bRel, bVer, tenant: null, status: "missing", catDup });
          continue;
        }
        const scored = hits.map((p) => {
          const tRel = comm ? null : releaseOf(p.name), tVer = versionOf(p.name);
          let status;
          if (!bVer && !comm) status = "unversioned";
          else if (!bVer) status = "present";           // ENCA: this baseline does not version its names
          else {
            const c = cmpRelVer(tRel, tVer, bRel, bVer);
            status = c === null ? "unversioned" : c === 0 ? "ok" : c < 0 ? "outdated" : "ahead";
          }
          return { p, tRel, tVer, status, byToken: !!(bTok && tokenOf(cat, p.description) === bTok) };
        }).sort((a, b2) => STATUS[b2.status].order - STATUS[a.status].order);
        const best = scored[0];
        hits.forEach((p) => consumed.add(p));
        rows.push({
          key: k, baseline: b, bRel, bVer,
          tenant: best.p, tRel: best.tRel, tVer: best.tVer,
          status: best.status, byToken: best.byToken, catDup,
          duplicates: hits.length > 1 ? hits.length : 0,
        });
      }
      // BY CONTENT, THIRD (build 10576, Mihai on cloudfellows.dev: "the compare
      // should match on settings, not on name"): a tenant that deployed the
      // community baseline under its OWN names — the CloudFellows tenant does
      // exactly that — matched nothing by token or name and read 72 missing.
      // So a catalog row still missing after the token and name passes is
      // matched the way the Upstream act matches: a settings-catalog policy
      // IS its set of setting definition ids, a compliance or configuration
      // policy the properties it configures; half-or-better overlap claims
      // it (UPSTREAM_MIN_OVERLAP, one rule). The verdict then reads the
      // version off the tenant's name and diffs the settings: same version,
      // same settings → up to date; same version, different values → DIFFERS
      // with the diff on the row; lower/higher → outdated / newer.
      if (comm) {
        const kindOfRow = (b) => b.kind || (b.section === "compliance" ? "compliance" : b.section === "deviceConfigurations" ? "deviceConfig" : "settingsCatalog");
        const secOfKind = { settingsCatalog: "settingsCatalog", compliance: "compliance", deviceConfig: "deviceConfigurations" };
        const pool = vms.filter((p) => p.body && !consumed.has(p)).map((p) => ({ p, ids: null }));
        const idsOf = (o, kind) => { if (!o.ids) o.ids = defIdsOf(kind, o.p.body); return o.ids; };
        for (const r of rows) {
          if (r.status !== "missing" || !r.baseline || !r.baseline.body) continue;
          const b = r.baseline, kind = kindOfRow(b), sec = secOfKind[kind];
          if (!sec) continue;
          const bIds = defIdsOf(kind, b.body);
          if (!bIds.size) continue;
          let best = null, bestScore = 0;
          for (const o of pool) {
            if (o.p.section !== sec || consumed.has(o.p)) continue;
            const sc = overlap(bIds, idsOf(o, kind));
            if (sc > bestScore) { best = o; bestScore = sc; }
          }
          if (!best || bestScore < UPSTREAM_MIN_OVERLAP) continue;
          consumed.add(best.p);
          const diff = diffPolicies(kind, b.body, best.p.body);
          const same = !diff.added.length && !diff.removed.length && !diff.changed.length;
          const tVer = versionOf(best.p.name);
          let status;
          if (r.bVer && tVer && cmpVersion(tVer, r.bVer) !== 0) status = cmpVersion(tVer, r.bVer) < 0 ? "outdated" : "ahead";
          else if (same) status = r.bVer ? "ok" : "present";
          else status = "differs";
          Object.assign(r, { tenant: best.p, tRel: null, tVer, status, byContent: true, score: bestScore, diff, duplicates: 0 });
        }
      }
      // wears the convention (or carries the token), not in the catalog —
      // only claimable when the catalog HAS a convention to wear
      if (!comm || cat.nameRe || cat.idToken) {
        const extras = new Map();
        for (const [k, hits] of byKey) {
          const left = hits.filter((p) => !consumed.has(p));
          if (!left.length) continue;
          if (comm && !cat.nameRe) continue;
          extras.set(k, left);
        }
        for (const [tok, hits] of byTok) {
          const left = hits.filter((p) => !consumed.has(p));
          if (!left.length) continue;
          const k = keyOf(left[0].name) || tok;
          if (!extras.has(k)) extras.set(k, left);
        }
        for (const [k, hits] of extras) {
          hits.forEach((p) => consumed.add(p));
          rows.push({ key: k, baseline: null, tenant: hits[0], tRel: comm ? null : releaseOf(hits[0].name), tVer: versionOf(hits[0].name), status: "extra", duplicates: hits.length > 1 ? hits.length : 0 });
        }
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
    // one identity, the newest — shared by the export and by a re-cut of a
    // catalog file that was exported before this rule existed
    function dedupeCatalog(policies) {
      const byKey = new Map();
      for (const p of policies) { const k = p.key || keyOf(p.name); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(p); }
      const kept = [], superseded = [];
      for (const [k, list] of byKey) {
        if (list.length === 1) { kept.push(list[0]); continue; }
        const sorted = list.slice().sort((a, b) => -(cmpRelVer(normRel(a.release, a.name), a.version || versionOf(a.name), normRel(b.release, b.name), b.version || versionOf(b.name)) || 0));
        const keep = sorted[0];
        kept.push(keep);
        superseded.push({ key: k, kept: keep.name, dropped: sorted.slice(1).map((p) => p.name) });
      }
      kept.sort((a, b) => String(a.key || keyOf(a.name)).localeCompare(String(b.key || keyOf(b.name))));
      return { kept, superseded };
    }
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
      // THE CATALOG HOLDS EACH IDENTITY ONCE — THE NEWEST (build 10574). A
      // re-cut kept beside its old copy on the baseline tenant is the
      // tenant's housekeeping, not a feature of the baseline: the newest
      // release+version is kept, the rest recorded as superseded so the
      // README and the data-file header can say what was left out. An
      // exact duplicate (same release and version) keeps the first seen.
      const { kept, superseded } = dedupeCatalog(policies);
      const dupKeys = superseded.map((x) => x.key);
      return {
        file: {
          kind: spec.kind,
          release: "R26",
          exported: new Date().toISOString(),
          tenant: tenantName || "",
          build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
          policies: kept,
        },
        skipped,
        duplicateKeys: dupKeys,
        superseded,
      };
    }

    // ---- the repo folder: the export as files a repository can hold ----
    // Mihai (10574): "make it a markdown or something that I can easily put
    // in a folder in the repo to be used as the baseline". One zip, unzipped
    // at the repo root: baseline/<platform>/<section>/<policy>.json, a
    // README.md index, the catalog file, and the data file the app bundles —
    // so the folder and the bundle are cut from one export and cannot drift.
    const safeFile = (name) => String(name).replace(/[\/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 150);
    const SECTION_DIR = { settingsCatalog: "SettingsCatalog", deviceConfigurations: "DeviceConfiguration", compliance: "CompliancePolicies", admx: "AdministrativeTemplates", filters: "AssignmentFilters", scripts: "Scripts", updates: "UpdateProfiles" };
    function repoFolder(built) {
      const plat = spec.platform.toLowerCase();
      const dir = `baseline/${plat}`;
      const file = built.file;
      const files = {};
      for (const p of file.policies) files[`${dir}/${SECTION_DIR[p.section] || p.section}/${safeFile(p.name)}.json`] = JSON.stringify(p.body, null, 2) + "\n";
      files[`${dir}/catalog.json`] = JSON.stringify(file, null, 1) + "\n";
      const L = [];
      L.push(`# CloudFellows ${spec.platform} baseline — ${file.release}`, "");
      L.push(`Exported from **${file.tenant || "the baseline tenant"}** on ${file.exported.slice(0, 10)} by TUNO ${file.build} (🧬 Export on the baseline tenant, the cfdev convention). ${file.policies.length} policies, each identity once — the newest release and version.`, "");
      L.push(`The naming convention is the identity: \`${spec.prefix} - <type> - <area> - <D|U> - <description> - Ryy.m - vX.Y\` — \`Ryy.m\` is the release the policy was cut in (year, then month), the version orders re-cuts within it.`, "");
      L.push(`\`catalog.json\` **is the catalog the app reads** — TUNO fetches \`${spec.catalogPath}\` from its own origin when the ${spec.icon} ${spec.label} opens; there is no other copy. The per-policy files under the section folders are the same bodies, one per file, for reading and diffing in the repository. Written by the app (🧬 Export → 📁 Repo folder), never by hand.`, "");
      const sections = [...new Set(file.policies.map((p) => p.section))];
      for (const sec of sections) {
        const rows = file.policies.filter((p) => p.section === sec);
        L.push(`## ${rows[0].sectionLabel || sec} (${rows.length})`, "");
        L.push("| Policy | Release | Version | Importable |", "| --- | --- | --- | --- |");
        for (const p of rows) L.push(`| ${p.name.replace(/\|/g, "\\|")} | ${relLabel(p.release)} | ${p.version ? `v${p.version}` : "—"} | ${p.importable ? "yes" : (p.section === "scripts" ? "no — no script body in the read" : "no")} |`);
        L.push("");
      }
      if (built.superseded.length) {
        L.push(`## Superseded on the tenant at export time (${built.superseded.length})`, "");
        L.push("Older copies still present beside their re-cut — left out of the catalog; 🧹 Housekeeping on the baseline tenant retires them.", "");
        for (const x of built.superseded) L.push(`- **${x.kept}** supersedes ${x.dropped.map((d) => `\`${d}\``).join(", ")}`);
        L.push("");
      }
      if (built.skipped.length) {
        L.push(`## Skipped (${built.skipped.length})`, "");
        for (const x of built.skipped) L.push(`- ${x.name} — ${x.why}`);
        L.push("");
      }
      files[`${dir}/README.md`] = L.join("\n");
      return files;
    }
    // the community folder: baseline/community/<id>/ — the catalog the app
    // reads plus a README naming the repo, the commit and how to re-cut
    function communityFolder(cat) {
      const dir = spec.communityPath.replace(/\/catalog\.json$/, "");
      const files = {};
      files[`${dir}/catalog.json`] = JSON.stringify(cat, null, 1) + "\n";
      files[`${dir}/README.md`] = [
        `# ${cat.label} — the ${spec.platform} community baseline`, "",
        `Cut verbatim from ${cat.url}${cat.commit ? ` at commit \`${cat.commit}\`` : ""}${cat.release ? ` (release ${cat.release}${cat.released ? `, ${cat.released}` : ""})` : ""} by ${cat.author || "the community"}. ${cat.policies.length} policies, names and descriptions the author's own${cat.idToken ? `, each carrying its \`${cat.idToken}\`` : ""}.`, "",
        `\`catalog.json\` **is the catalog the app reads** — TUNO fetches \`${spec.communityPath}\` from its own origin when ${spec.icon} ${spec.label} opens. Written by the app: on the baseline tenant, ${spec.upstream.icon} Upstream → fetch or load the repository → ⬇ Community catalog folder (zip), unzipped at the repository root. Never edited by hand.`, "",
        `| Section | Policies |`, `| --- | --- |`,
        ...Object.entries(cat.policies.reduce((a, p) => (a[p.sectionLabel || p.section] = (a[p.sectionLabel || p.section] || 0) + 1, a), {})).map(([k, n]) => `| ${k} | ${n} |`), "",
      ].join("\n");
      return files;
    }
    // ---- housekeeping: the copies a re-cut left behind (10574) ----
    // Every identity the tenant carries more than once: the newest release
    // and version is KEPT, the rest are offered for deletion. An older copy
    // that still has assignments is listed but refused — deleting it would
    // take reach away that the new copy does not have; move the reach in
    // ✏️ the editor first. An exact duplicate (same release and version)
    // keeps the one with assignments, else the first created.
    const DELETE_PATH = {
      settingsCatalog: "/deviceManagement/configurationPolicies",
      deviceConfigurations: "/deviceManagement/deviceConfigurations",
      compliance: "/deviceManagement/deviceCompliancePolicies",
      admx: "/deviceManagement/groupPolicyConfigurations",
    };
    function housekeeping(vms) {
      const byKey = new Map();
      for (const p of vms) {
        if (!looksBaseline(p.name)) continue;
        const k = keyOf(p.name);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(p);
      }
      const groups = [];
      for (const [k, list] of byKey) {
        if (list.length < 2) continue;
        const nAsg = (p) => (p.assignments || []).length;
        const sorted = list.slice().sort((a, b) =>
          -(cmpRelVer(releaseOf(a.name), versionOf(a.name), releaseOf(b.name), versionOf(b.name)) || 0)
          || (nAsg(b) - nAsg(a))
          || String(a.created || "").localeCompare(String(b.created || "")));
        const keep = sorted[0];
        const retire = sorted.slice(1).map((p) => ({
          p, name: p.name, section: p.section, sectionLabel: p.sectionLabel, assignments: nAsg(p),
          rel: releaseOf(p.name), ver: versionOf(p.name), path: DELETE_PATH[p.section] || null,
          refused: nAsg(p) ? `assigned to ${nAsg(p)} target${nAsg(p) === 1 ? "" : "s"} — move the reach to the kept copy in ✏️ the editor first` : !DELETE_PATH[p.section] ? `its surface (${p.sectionLabel || p.section}) has no delete path here — retire it in the portal` : "",
        }));
        groups.push({ key: k, keep, keepRel: releaseOf(keep.name), keepVer: versionOf(keep.name), keepAssignments: nAsg(keep), retire });
      }
      groups.sort((a, b) => String(a.key).localeCompare(String(b.key)));
      return groups;
    }

    // ---- import entries: three roads, each honest about itself ----
    function importEntries(cat, wanted) {
      const entries = [], filters = [], refused = [];
      for (const p of cat.policies) {
        if (wanted && !wanted.has(keyOf(p.name))) continue;
        if (p.importable === false || !p.body) {
          refused.push({ name: p.name, why: p.body
            ? (p.section === "scripts" ? "the reference read carries no script body — a script without its body cannot be put back"
              : p.section === "driverUpdates" ? "driver update profiles have no create path here — deploy them with the author's deployer"
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

    // ---- upstream: the community repo ---------------------------------
    // THE APP NEVER FETCHES IT: the CSP allows Graph and nothing else, and
    // that rule does not bend for a read-only repo — the zip is downloaded
    // by the BROWSER (a link is navigation) and loaded as a file, T04-
    // restore's own JSZip pattern. MATCHING IS BY CONTENT, never by name:
    // a settings-catalog policy IS its set of settingDefinitionIds, a
    // compliance or device-configuration policy the properties it
    // configures. Exact overlap is "same", half-or-better a match whose
    // DIFF is shown, anything else NEW. 50% is the claim threshold, said here.
    const UPSTREAM_ZIP_URL = spec.upstream.zipUrl;
    const UPSTREAM_MIN_OVERLAP = 0.5;

    const META = new Set(["id", "displayName", "name", "description", "@odata.type", "roleScopeTagIds",
      "scheduledActionsForRule", "createdDateTime", "lastModifiedDateTime", "version", "assignments", "assignments@odata.context",
      "supportsScopeTags", "deviceManagementApplicabilityRuleOsEdition", "deviceManagementApplicabilityRuleOsVersion",
      "deviceManagementApplicabilityRuleDeviceMode", "inventorySyncStatus"]);
    function defIdsOf(kind, body) {
      if (kind === "settingsCatalog") {
        return new Set((body.settings || [])
          .map((s) => (s.settingInstance || s || {}).settingDefinitionId)
          .filter(Boolean));
      }
      // compliance / device configuration: the properties it configures
      return new Set(Object.keys(body).filter((k) => !META.has(k) && !/@odata\./.test(k) && !k.startsWith("#") && body[k] !== null && body[k] !== undefined));
    }

    // A community export (IntuneManagement's, intune-my-macs') is a Graph
    // READ with the reading's annotations still on it — @odata.id, editLink,
    // per-property @odata.type, the action stubs (#microsoft.graph.assign),
    // navigation links. None of that is the policy; a create body carrying
    // it is refused by Graph. Cleaned by RULE, once, here — the same
    // cleaner runs when the catalog is bundled and when a zip is loaded, so
    // the two roads cannot disagree.
    const DROP = new Set(["id", "createdDateTime", "lastModifiedDateTime", "version", "assignments", "roleScopeTagIds",
      "supportsScopeTags", "settingCount", "priorityMetaData", "creationSource", "isAssigned", "inventorySyncStatus",
      "deviceReporting", "newUpdates", "driverInventories"]);
    const pruneNulls = (o) => {
      if (Array.isArray(o)) return o.map(pruneNulls);
      if (o && typeof o === "object") {
        const out = {};
        for (const [k, v] of Object.entries(o)) {
          if (v === null || v === undefined) continue;
          if (/@odata\.(id|editLink|context|etag|count|nextLink|associationLink|navigationLink)$/i.test(k)) continue;
          if (/@odata\.type$/i.test(k) && k !== "@odata.type") continue;   // a property's type annotation, not the object's
          if (k.startsWith("#")) continue;
          out[k] = pruneNulls(v);
        }
        return out;
      }
      return o;
    };
    function cleanBody(kind, raw) {
      const src = raw || {};
      const out = {};
      for (const [k, v] of Object.entries(src)) {
        if (DROP.has(k)) continue;
        if (/@odata\./.test(k) && k !== "@odata.type") continue;
        if (k.startsWith("#")) continue;
        if (v === null || v === undefined) continue;
        out[k] = v;
      }
      if (kind === "settingsCatalog") {
        out.settings = (src.settings || [])
          .map((s) => ({ settingInstance: pruneNulls(s.settingInstance || s) }))
          .filter((s) => s.settingInstance && s.settingInstance.settingDefinitionId);
        if (out.templateReference) out.templateReference = pruneNulls(out.templateReference);
        if (!out.name && out.displayName) { out.name = out.displayName; delete out.displayName; }
      } else {
        for (const k of Object.keys(out)) if (out[k] && typeof out[k] === "object") out[k] = pruneNulls(out[k]);
        if (!out.displayName && out.name) { out.displayName = out.name; delete out.name; }
      }
      return out;
    }

    // What an upstream file IS, from its shape — never from its folder name.
    const SECTION_OF_KIND = { settingsCatalog: "settingsCatalog", compliance: "compliance", deviceConfig: "deviceConfigurations", driverUpdate: "driverUpdates" };
    const LABEL_OF_KIND = { settingsCatalog: "Settings catalog policies", compliance: "Compliance policies", deviceConfig: "Device configuration profiles", driverUpdate: "Driver update profiles" };
    const AREA_OF_KIND = { settingsCatalog: "SettingsCatalog", compliance: "CompliancePolicies", deviceConfig: "DeviceConfigurations", driverUpdate: null };
    function kindOf(j) {
      const t = String(j["@odata.type"] || "");
      if (Array.isArray(j.settings) && j.settings.length && spec.upstream.platformRe.test(String(j.platforms || ""))) return "settingsCatalog";
      if (/CompliancePolicy$/i.test(t)) return "compliance";
      if (/windowsDriverUpdateProfile$/i.test(t)) return "driverUpdate";
      if (/^#microsoft\.graph\.\w+(Configuration|Profile)$/i.test(t) && (j.displayName || j.name)) return "deviceConfig";
      return null;
    }

    // files: [{ path, text }] from the zip. BOM-stripped here, because the
    // upstream repos' own JSON files may carry a UTF-8 BOM — found by parsing
    // them, not by assuming. A manifest (OIB's PolicyManifest.json) rides
    // along as metadata rather than as a policy.
    function parseUpstream(files) {
      const policies = [], skipped = [];
      let seenOther = 0, manifest = null;
      for (const f of files || []) {
        const path = String(f.path || "");
        // the author's manifest sits BESIDE the policy folders, not in them
        if (spec.upstream.manifestRe && spec.upstream.manifestRe.test("/" + path)) {
          try { const mj = JSON.parse(String(f.text || "").replace(/^\uFEFF/, "")); if (mj && Array.isArray(mj.policies)) manifest = mj; }
          catch { skipped.push({ path, why: "the manifest does not parse as JSON" }); }
          continue;
        }
        if (!spec.upstream.pathRe.test("/" + path)) continue;
        if (spec.upstream.otherRe.test(path)) { seenOther++; continue; }
        if (!/\.json$/i.test(path)) continue;
        let j;
        try { j = JSON.parse(String(f.text || "").replace(/^\uFEFF/, "")); }
        catch { skipped.push({ path, why: "does not parse as JSON" }); continue; }
        const kind = kindOf(j || {});
        if (!kind) { skipped.push({ path, why: "not a settings-catalog, compliance or device-configuration policy export" }); continue; }
        const name = j.name || j.displayName || "";
        const folder = (path.split("/").slice(-2, -1)[0] || "").trim();
        const body = cleanBody(kind, j);
        policies.push({ kind, name, path, folder, body, defIds: [...defIdsOf(kind, body)], oibId: tokenOf({ idToken: spec.upstream.idToken }, j.description) });
      }
      return { policies, skipped, seenOther, manifest };
    }

    // The community catalog FILE — built from a parsed zip, the shape the
    // bundled js/<community>Data.js carries. Names verbatim, tokens kept.
    function buildCommunity(parsed, meta) {
      const m = parsed.manifest || null;
      const byId = new Map((m ? m.policies : []).map((p) => [String(p.oibId || "").toUpperCase(), p]));
      const policies = parsed.policies.map((u) => {
        const mp = u.oibId ? byId.get(u.oibId) : null;
        return {
          name: u.name, key: keyOf(u.name), version: versionOf(u.name), release: null,
          section: SECTION_OF_KIND[u.kind], sectionLabel: LABEL_OF_KIND[u.kind], area: AREA_OF_KIND[u.kind],
          importable: !!AREA_OF_KIND[u.kind],
          kind: u.kind, folder: u.folder, path: u.path,
          ...(u.oibId ? { oibId: u.oibId } : {}),
          ...(mp ? { scope: mp.scope || "", addedIn: mp.addedIn || "", status: mp.status || "", licenseRequirements: mp.licenseRequirements || "", skuRequirements: mp.skuRequirements || "" } : {}),
          body: u.body,
        };
      }).sort((a, b) => String(a.key).localeCompare(String(b.key)));
      return {
        kind: "tuno-community-baseline",
        id: spec.upstream.id, platform: spec.platform,
        label: spec.upstream.label, icon: spec.upstream.icon, author: spec.upstream.author,
        url: spec.upstream.url, importerUrl: spec.upstream.importerUrl || null,
        nameRe: spec.upstream.nameRe || null, idToken: spec.upstream.idToken || null,
        release: (m && m.oibVersion) || (meta && meta.release) || "",
        released: (m && m.generatedDate) || (meta && meta.released) || "",
        commit: (meta && meta.commit) || "",
        generated: new Date().toISOString(),
        build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
        policies,
      };
    }
    // the bundled community catalog, read as if it were a loaded zip — so the
    // Upstream act on the baseline tenant needs no download for the release
    // TUNO already carries
    function communityAsUpstream(cat) {
      return (cat && cat.policies || []).map((p) => ({
        kind: p.kind || (p.section === "compliance" ? "compliance" : p.section === "deviceConfigurations" ? "deviceConfig" : "settingsCatalog"),
        name: p.name, path: p.path || "", folder: p.folder || "", body: p.body || {},
        defIds: [...defIdsOf(p.kind || (p.section === "compliance" ? "compliance" : "settingsCatalog"), p.body || {})],
        oibId: p.oibId || null,
      }));
    }

    // ---- the per-policy diff, VALUE-AWARE ---------------------------------
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
        const upIds = defIdsOf(kind, upBody), ourIds = defIdsOf(kind, ourBody);
        for (const k of upIds) {
          if (!ourIds.has(k)) { added.push({ id: k, theirs: JSON.stringify(upBody[k]) }); continue; }
          if (JSON.stringify(upBody[k]) !== JSON.stringify(ourBody[k])) changed.push({ id: k, ours: JSON.stringify(ourBody[k]), theirs: JSON.stringify(upBody[k]) });
        }
        for (const k of ourIds) if (!upIds.has(k)) removed.push({ id: k, ours: JSON.stringify(ourBody[k]) });
      }
      return { added, removed, changed };
    }


    // ups: parseUpstream().policies · cat: the active CloudFellows catalog.
    function matchUpstream(ups, cat) {
      const ours = (cat.policies || []).map((p) => ({
        p, ids: defIdsOf(p.section === "settingsCatalog" ? "settingsCatalog" : "compliance", p.body || {}),
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

    // A proposed canonical name — a STARTING POINT for the rename field.
    // Stamps the CURRENT release; new controls start at v1.0; a differing
    // match keeps the matched identity, re-stamps the release, bumps the minor.
    function proposeName(row) {
      const now = currentRelease();
      const tag = `R${now.y}.${now.m}`;
      if (row.status === "differs" && row.match) {
        let name = String(row.match.name).replace(/\bR\d{2}\.\d{1,2}\b/i, tag);
        const m = /^(.*?)(?:\s*-\s*v(\d+))(?:\.(\d+))?((?:\.\d+)*)\s*$/i.exec(name);
        if (m) return `${m[1]} - v${m[2]}.${(+(m[3] || 0)) + 1}`;
        return name;
      }
      return spec.proposeName(row, tag);
    }

    function upstreamEntry(row, newName) {
      const u = row.up;
      const area = AREA_OF_KIND[u.kind] || "SettingsCatalog";
      const obj = Object.assign({}, u.body);
      if (u.kind === "settingsCatalog") { obj.name = newName; delete obj.displayName; }
      else obj.displayName = newName;
      return { area, entry: { area, name: newName, obj, sourceId: obj.id || "" }, newName };
    }

    function upstreamMarkdown(rows, meta) {
      const L = [];
      L.push(`# ${spec.upstream.label} vs the CloudFellows ${spec.platform} baseline`, "");
      L.push(`Generated ${new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC")} by TUNO ${typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""}${meta && meta.catalog ? ` · catalog ${meta.catalog}` : ""}`, "");
      const n = { same: 0, differs: 0, new: 0 };
      rows.forEach((r) => { n[r.status]++; });
      L.push(`${n.new} new to the baseline · ${n.differs} matched with differences · ${n.same} covered.`, "");
      const cell = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      const kindLabel = (k) => k === "compliance" ? "Compliance policy" : k === "deviceConfig" ? "Device configuration profile" : "Settings catalog policy";
      for (const r of rows.filter((x) => x.status === "new")) {
        L.push(`## NEW — ${cell(r.up.name)}`, "");
        L.push(`${kindLabel(r.up.kind)} · ${r.up.defIds.length} setting${r.up.defIds.length === 1 ? "" : "s"} — the whole policy is new to the baseline.`, "");
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

    // ---- rename: stamp the release from the last-modified date (10572) ----
    // Mihai's ask for the baseline tenant: every policy that wears the
    // prefix and a version but NO release tag is proposed a tag cut from
    // its last-modified date — "Win - DCP - Microsoft Office - D - Security
    // - v3.6", modified 8 Jan 2026, becomes "… - R26.1 - v3.6". A PROPOSAL,
    // editable before anything is written: last-modified means last
    // TOUCHED (an assignment edit moves it too), which is not always the
    // month the policy was cut. The community baseline's own names are
    // never proposed — keeping them is what lets its deployer maintain them.
    const releaseOfDate = (iso) => { const d = new Date(iso || ""); return isNaN(d) ? null : { y: d.getUTCFullYear() % 100, m: d.getUTCMonth() + 1 }; };
    const stampRelease = (name, rel) => String(name).replace(/\s*-\s*(v\s?\d+(?:\.\d+)*)\s*$/i, (m, v) => ` - R${rel.y}.${rel.m} - ${v.replace(/\s+/g, "")}`);
    // where a rename is written, per surface — the same endpoints restore
    // creates on; filters go through T14's own update
    const RENAME_PATH = {
      settingsCatalog: { endpoint: "/deviceManagement/configurationPolicies", field: "name" },
      deviceConfigurations: { endpoint: "/deviceManagement/deviceConfigurations", field: "displayName" },
      compliance: { endpoint: "/deviceManagement/deviceCompliancePolicies", field: "displayName" },
      admx: { endpoint: "/deviceManagement/groupPolicyConfigurations", field: "displayName" },
      filters: { endpoint: null, field: "displayName", viaFilters: true },
    };
    function renameProposals(vms, community) {
      const commRe = community && community.nameRe ? new RegExp(community.nameRe, "i") : null;
      const out = [];
      for (const p of vms) {
        if (!spec.prefixRe.test(p.name || "")) continue;
        if (releaseOf(p.name)) continue;                       // already stamped
        const base = { p, name: p.name, section: p.section, sectionLabel: p.sectionLabel, modified: p.modified || "" };
        if (commRe && commRe.test(p.name)) { out.push({ ...base, status: "community", why: `${community.label}'s own name — kept, so its deployer can still maintain it` }); continue; }
        const ver = versionOf(p.name);
        if (!ver) { out.push({ ...base, status: "noversion", why: "no version at the end of the name — nothing to put the tag before" }); continue; }
        const rel = releaseOfDate(p.modified);
        if (!rel) { out.push({ ...base, status: "nodate", ver, why: "the read carries no last-modified date for it" }); continue; }
        const path = RENAME_PATH[p.section] || null;
        out.push({ ...base, status: path ? "propose" : "nopath", ver, rel, proposed: stampRelease(p.name, rel), path,
          why: path ? "" : `its surface (${p.sectionLabel || p.section}) has no rename path here — rename it in the portal` });
      }
      return out.sort((a, b) => (a.status === "propose" ? 0 : 1) - (b.status === "propose" ? 0 : 1) || String(a.name).localeCompare(String(b.name)));
    }

    // ---- fetch the upstream repo IN THE BROWSER (10572) ----
    // Mihai: "the new policies are fetched directly without a manual zip
    // download". GitHub's API and raw.githubusercontent.com answer with
    // CORS, so the tree is read with two API calls (the branch commit, then
    // its tree) and each policy file with one raw read — no zip, no
    // download. Plain fetch, NO token: Graph.call refuses any host but
    // graph.microsoft.com and this never goes through it. The CSP's
    // connect-src widened for exactly these two hosts (SECURITY.md).
    // GitHub's anonymous limit is 60 API calls an hour per address — the
    // raw reads do not count against it — and a refusal is reported with
    // its reset time; the zip road and the bundle remain.
    async function fetchUpstream(onStatus) {
      const g = spec.upstream.github;
      const status = (m) => onStatus && onStatus(m);
      const api = async (u) => {
        const r = await fetch(u, { headers: { Accept: "application/vnd.github+json" } });
        if (r.status === 403 || r.status === 429) {
          const reset = +r.headers.get("x-ratelimit-reset") || 0;
          const when = reset ? new Date(reset * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "later";
          throw new Error(`GitHub refused the read (${r.status}) — the anonymous limit is 60 API calls an hour per address and it resets at ${when}. The zip road and the bundled catalog still work.`);
        }
        if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${u.replace(/^https:\/\/api\.github\.com/, "")}`);
        return r.json();
      };
      status(`Asking github.com for the latest ${g.owner}/${g.repo} commit…`);
      const c = await api(`https://api.github.com/repos/${g.owner}/${g.repo}/commits/${encodeURIComponent(g.branch)}`);
      const sha = c.sha, treeSha = c.commit && c.commit.tree && c.commit.tree.sha;
      const date = String((c.commit && c.commit.committer && c.commit.committer.date) || "").slice(0, 10);
      if (!sha || !treeSha) throw new Error("GitHub's commit answer carried no tree — nothing read.");
      status(`Reading the tree at ${sha.slice(0, 7)}…`);
      const t = await api(`https://api.github.com/repos/${g.owner}/${g.repo}/git/trees/${treeSha}?recursive=1`);
      if (t.truncated) throw new Error("GitHub truncated the tree listing — the repository is larger than one page; use the zip road.");
      const prefix = `${g.repo}-${g.branch}/`;
      const wanted = (t.tree || []).filter((e) => e.type === "blob").map((e) => e.path)
        .filter((p) => (spec.upstream.manifestRe && spec.upstream.manifestRe.test("/" + prefix + p)) || (spec.upstream.pathRe.test("/" + prefix + p) && /\.json$/i.test(p)));
      if (!wanted.length) throw new Error("The tree carries no policy files under the expected folder — has the repository moved?");
      const files = [];
      let done = 0;
      const pull = async (p) => {
        const r = await fetch(`https://raw.githubusercontent.com/${g.owner}/${g.repo}/${sha}/${p.split("/").map(encodeURIComponent).join("/")}`);
        if (!r.ok) throw new Error(`raw.githubusercontent.com answered ${r.status} for ${p}`);
        files.push({ path: prefix + p, text: await r.text() });
        status(`Reading ${++done}/${wanted.length} files…`);
      };
      const queue = wanted.slice();
      await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => { while (queue.length) await pull(queue.shift()); }));
      // the "seen, not comparable" count comes from the tree, not from reads
      const seenOther = (t.tree || []).filter((e) => e.type === "blob" && spec.upstream.pathRe.test("/" + prefix + e.path) && spec.upstream.otherRe.test(e.path)).length;
      return { files, commit: sha, date, seenOther, url: `https://github.com/${g.owner}/${g.repo}/tree/${sha.slice(0, 7)}` };
    }

    // ---- the gap report (ENCA's blMd, Intune-side-out) ----
    const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    function toMd(cmp, tenantName) {
      const cat = cmp.catalog, comm = isCommunity(cat);
      const relver = (rel, ver) => comm ? (ver ? `v${ver}` : "—") : `${relLabel(rel)}${ver ? ` · v${ver}` : ""}`;
      const L = [];
      L.push(`# ${spec.platform} baseline gap — ${mdEsc(tenantName || "tenant")} vs ${mdEsc(comm ? `${cat.label} ${cat.release}` : `the CloudFellows ${spec.platform} baseline ${cat.release || "R26"}`)}`, "");
      L.push(typeof Brand !== "undefined" && Brand.generatedBy ? Brand.generatedBy() : `Generated by TUNO ${typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""}`);
      if (comm && cat.url) L.push(`Baseline source: ${cat.url}${cat.commit ? ` (commit ${String(cat.commit).slice(0, 7)})` : ""}`);
      L.push("");
      L.push(`- Coverage: **${cmp.covered} of ${cmp.baselineTotal}** baseline policies present in the tenant.`);
      ["missing", "outdated", "differs", "ok", "present", "ahead", "unversioned", "extra"].forEach((k) => { if (cmp.counts[k]) L.push(`- ${STATUS[k].label}: **${cmp.counts[k]}**`); });
      const toImport = cmp.rows.filter((r) => r.status === "missing" || r.status === "outdated");
      L.push(`- Import would add or update **${toImport.length}** policies.`, "");
      L.push("| Status | Baseline policy | In this tenant | Baseline | Tenant |");
      L.push("| --- | --- | --- | --- | --- |");
      for (const r of cmp.rows) {
        L.push(`| ${STATUS[r.status].label} | ${mdEsc(r.baseline ? r.baseline.name : "—")} | ${mdEsc(r.tenant ? r.tenant.name : "—")}${r.duplicates ? ` (×${r.duplicates})` : ""}${r.byToken ? ` (by ${cat.idToken})` : ""}${r.byContent ? ` (by content, ${Math.round(r.score * 100)}%)` : ""} | ${r.baseline ? relver(r.bRel, r.bVer) : "—"} | ${r.tenant ? relver(r.tRel, r.tVer) : "—"} |`);
        if (r.status === "differs" && r.diff) {
          r.diff.added.forEach((d) => L.push(`|  | ↳ they set \`${mdEsc(d.id)}\` = ${mdEsc(d.theirs)} |  |  |  |`));
          r.diff.changed.forEach((d) => L.push(`|  | ↳ \`${mdEsc(d.id)}\`: tenant ${mdEsc(d.ours)} → baseline ${mdEsc(d.theirs)} |  |  |  |`));
          r.diff.removed.forEach((d) => L.push(`|  | ↳ only in the tenant: \`${mdEsc(d.id)}\` = ${mdEsc(d.ours)} |  |  |  |`));
        }
      }
      L.push("");
      if (toImport.length) {
        L.push("## Would be imported or updated", "");
        for (const r of toImport) L.push(`- **${mdEsc(r.baseline.name)}**${r.status === "outdated" ? ` — currently ${mdEsc(relver(r.tRel, r.tVer))}` : " — not present"}`);
        L.push("");
      }
      return L.join("\n");
    }

    return {
      spec,
      releaseOf, normRel, relCmp, currentRelease, versionOf, looksBaseline, keyOf, relLabel, cmpVersion, cmpRelVer,
      STATUS, bundled, community, isCommunity, catLooks, tokenOf, parseCatalog, compare, buildExport, importEntries, AREA_OF_SECTION,
      UPSTREAM_ZIP_URL, UPSTREAM_MIN_OVERLAP, defIdsOf, cleanBody, kindOf, parseUpstream, buildCommunity, communityAsUpstream,
      matchUpstream, proposeName, upstreamEntry, diffPolicies, upstreamMarkdown, toMd,
      releaseOfDate, stampRelease, RENAME_PATH, renameProposals, fetchUpstream,
      dedupeCatalog, repoFolder, communityFolder, housekeeping, DELETE_PATH,
      setBundled, setCommunity, loadCatalogs,
    };
  }

  // ---------------------------------------------------------------- screen
  // Warm-starts from the shared cache like T19; export renders ONLY on the
  // baseline tenant (the cfdev convention — said here, where it lives);
  // import is T04-restore's dry-run → apply plus T14's filter creates,
  // write scopes asked at the click. Every DOM id is spec.ids + suffix, so
  // T24 keeps its mb* ids (and its tests) and T27 gets wb*.
  function screen(spec, E) {
    const $ = (id) => document.getElementById(id);
    const P = spec.ids;
    const ID = (s) => P + s;

    let res = null;            // the collect result (cache-served or fresh)
    let mode = "compare";      // compare · export · import · upstream
    let catId = null;          // "cfdev" | "community" — which catalog the screen speaks for
    let fileCat = null;        // a loaded CloudFellows baseline file replaces the bundled slot
    let cmp = null;            // compare() result
    let planned = null, plannedFilters = null, running = false;
    let lastWrite = null;      // the last import's failures, shown on the Import pane after the re-read
    let catalogsLoaded = null; // the one same-origin read of the two catalog files, per session
    let catalogErrors = [];

    const prog = (m) => TunoProgress.show(ID("Body"), ID("Prog"), m);
    const download = (name, text, type) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
      a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    const isCfdev = () => { const t = window.TunoTenant; return !!(t && t.isCfdev && t.isCfdev()); };
    const tenantName = () => { const n = $("tenantName"); return (n && n.textContent) || ""; };

    // the bodies ride along for the surfaces the content match reads (10576):
    // the raw object from the shared read, with the settings the read fetched
    const BODY_SECTIONS = new Set(["settingsCatalog", "compliance", "deviceConfigurations"]);
    const vms = () => {
      const out = [];
      for (const sec of (res && res.sections) || []) {
        const rawById = BODY_SECTIONS.has(sec.id) ? new Map((sec.raw || []).map((r) => [String(r.id).toLowerCase(), r])) : null;
        for (const it of sec.items || []) {
          let body = null;
          const raw = rawById ? rawById.get(String(it.id).toLowerCase()) : null;
          if (raw) {
            body = Object.assign({}, raw); delete body.__detail; delete body.__detailError;
            if (sec.id === "settingsCatalog" && Array.isArray(raw.__detail)) body.settings = raw.__detail;
          }
          out.push({ id: it.id, name: it.name, section: sec.id, sectionLabel: sec.label, description: it.description || "", modified: it.modified || "", created: it.created || "", assignments: it.assignments || [], body });
        }
      }
      return out;
    };

    // ---- the two catalogs ----
    const cfCatalog = () => fileCat || E.bundled();
    const cfSource = () => fileCat ? "file" : E.bundled() ? "bundled" : "";
    // the community catalog: fetched from github.com this session (10572),
    // else the bundle
    let fetchedCat = null;
    const communityCatalog = () => fetchedCat || E.community();
    const catalogs = () => {
      const out = [];
      const cf = cfCatalog();
      if (cf) out.push({ id: "cfdev", cat: cf, icon: "🧬", label: `CloudFellows ${cf.release || "R26"}`, sub: cfSource() === "file" ? "loaded file" : "bundled" });
      const co = communityCatalog();
      if (co) out.push({ id: "community", cat: co, icon: co.icon || "🧩", label: `${co.label}${co.release ? ` v${co.release}` : ""}`, sub: fetchedCat ? "fetched from github.com" : "community" });
      return out;
    };
    function activeCatalog() {
      const list = catalogs();
      if (!list.length) return null;
      if (!catId || !list.some((c) => c.id === catId)) catId = list[0].id;
      return list.find((c) => c.id === catId).cat;
    }
    const recompare = () => { const c = activeCatalog(); cmp = (res && c) ? E.compare(vms(), c) : null; };

    function land(r, sourceNote) {
      res = r;
      const rh = $(ID("Rename")); if (rh) { delete rh.dataset.for; rh.innerHTML = ""; }
      const hh = $(ID("Housekeeping")); if (hh) { delete hh.dataset.for; hh.innerHTML = ""; }
      recompare();
      render(sourceNote);
    }

    // The rail: each node carrying the state of its act.
    function renderSeg() {
      const el = $(ID("Seg"));
      if (!el) return;
      const c = activeCatalog();
      const node = (k, icon, label, right, bad) => `<div class="ep-node${mode === k ? " active" : ""}" data-${P}mode="${k}" role="button" tabindex="0">
        <span>${icon} ${label}</span><span class="mini" style="margin-left:auto;white-space:nowrap${bad ? ";color:var(--off)" : ""}">${right}</span></div>`;
      const worst = cmp ? (cmp.counts.missing || 0) + (cmp.counts.outdated || 0) + (cmp.counts.differs || 0) : null;
      const upBad = upstream ? upstream.rows.filter((r) => r.status !== "same").length : null;
      const rn = res ? E.renameProposals(vms(), communityCatalog()).filter((r) => r.status === "propose").length : null;
      const hk = res ? E.housekeeping(vms()).reduce((a, g) => a + g.retire.length, 0) : null;
      el.innerHTML = [
        node("compare", spec.icon, "Compare", cmp ? (worst ? `${worst} to fix` : "in step") : c ? `${c.policies.length}` : "—", worst > 0),
        ...(isCfdev() ? [node("export", "🧬", "Export", res ? "ready" : "read first", false)] : []),
        node("import", "📥", "Import", c ? `${c.policies.length}` : "no catalog", !c),
        ...(isCfdev() ? [node("upstream", spec.upstream.icon, "Upstream", upstream === null ? "fetch or load" : upBad ? `${upBad} to review` : "covered", upBad > 0)] : []),
        ...(isCfdev() ? [node("rename", "✏️", "Rename", res ? (rn ? `${rn} to stamp` : "all stamped") : "read first", rn > 0)] : []),
        ...(isCfdev() ? [node("housekeeping", "🧹", "Housekeeping", res ? (hk ? `${hk} old cop${hk === 1 ? "y" : "ies"}` : "tidy") : "read first", hk > 0)] : []),
      ].join("");
    }

    // the catalog seg — ENCA's blCatalog, ported: which baseline this screen
    // speaks for, on the two acts that consume one (compare, import)
    function catalogSeg() {
      const list = catalogs();
      if (!list.length) return "";
      return `<div class="seg" id="${ID("Cat")}" style="margin:0 0 10px">${list.map((c) =>
        `<button class="${c.id === catId ? "active" : ""}" data-${P}cat="${c.id}" title="${esc(c.sub)}">${c.icon} ${esc(c.label)} <span class="mini">· ${c.cat.policies.length}</span></button>`).join("")}</div>`;
    }
    function catalogLine(c) {
      if (E.isCommunity(c)) {
        const bundle = E.community();
        return `<p class="mini muted" style="margin:0 0 10px">Community baseline: <b>${esc(c.label)}${c.release ? ` v${esc(c.release)}` : ""}</b>${c.released ? ` (${esc(c.released)})` : ""} by ${esc(c.author || "the community")} — <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(String(c.url).replace(/^https?:\/\//, ""))}</a>${c.commit ? ` @ ${esc(String(c.commit).slice(0, 7))}` : ""} · ${c.policies.length} policies, names kept verbatim${c.idToken ? `, identified by their ${esc(c.idToken)} first` : ""}.${c.importerUrl ? ` The author's own deployer: <a href="${esc(c.importerUrl)}" target="_blank" rel="noopener">${esc(String(c.importerUrl).replace(/^https?:\/\//, ""))}</a>.` : ""}
          ${fetchedCat ? `<b>Fetched from github.com this session</b>${bundle ? ` — the bundle is v${esc(bundle.release || "?")} @ ${esc(String(bundle.commit || "").slice(0, 7))}` : ""}. <button class="btn sm" id="${ID("FetchRevert")}">↩ Back to the bundle</button>` : `<button class="btn sm" id="${ID("Fetch")}" title="Read the repository directly — two GitHub API calls and one raw read per policy, no token, no zip">🌐 Fetch the latest from github.com</button>`}
          <span class="mini" id="${ID("FetchNote")}"></span></p>`;
      }
      return `<p class="mini muted" style="margin:0 0 10px">Catalog: <b>${esc(c.release || "R26")}</b> · ${c.policies.length} policies · ${cfSource() === "file" ? `loaded from a file${c.tenant ? ` (exported from ${esc(c.tenant)}${c.exported ? `, ${esc(String(c.exported).slice(0, 10))}` : ""})` : ""}` : `the bundled reference export${c.tenant ? ` from ${esc(c.tenant)}` : ""}${c.exported ? ` (${esc(String(c.exported).slice(0, 10))})` : ""}`}.</p>`;
    }

    const CFDEV_ONLY = new Set(["export", "upstream", "rename", "housekeeping"]);
    function render(sourceNote) {
      if (sourceNote) lastSource = sourceNote;
      if (CFDEV_ONLY.has(mode) && !isCfdev()) mode = "compare";
      const c = activeCatalog();
      renderSeg();
      const parts = [];
      if (lastSource) parts.push(`<p class="mini muted" style="margin:0 0 8px">${lastSource}</p>`);

      if (mode === "compare" || mode === "import") parts.push(catalogSeg());
      if (c) parts.push(catalogLine(c));
      else parts.push(`<div class="list-card"><p class="mini" style="margin:0">${isCfdev()
        ? `<b>No CloudFellows catalog could be read — and this is the tenant that makes it.</b> ${esc(spec.readLabel)}, ✏️ Rename what lacks its tag, 🧹 retire the old copies, then 🧬 Export → Repo folder: unzipped at the repo root it becomes ${esc(spec.catalogPath)}, the file this screen reads.`
        : `<b>No catalog could be read from ${esc(spec.catalogPath)}.</b> Load a baseline file under 📥 Import. Until a catalog is present this screen can only list which policies WEAR the convention, not judge them.`}${catalogErrors.length ? `<br><span class="mini muted">${catalogErrors.map(esc).join(" · ")}</span>` : ""}</p></div>`);

      const comm = E.isCommunity(c);
      const relver = (rel, ver) => comm ? (ver ? `v${esc(ver)}` : `<span class="muted">—</span>`) : `${esc(E.relLabel(rel))}${ver ? ` · v${esc(ver)}` : ""}`;

      if (mode === "compare") {
        if (cmp) {
          const card = (k) => {
            const st = E.STATUS[k], n = cmp.counts[k] || 0;
            if (!n && !["missing", "outdated", comm && !cmp.counts.ok ? "present" : "ok"].includes(k)) return "";
            return `<div class="au-card"><div class="au-card-l">${st.icon} ${esc(st.label)}</div><div class="au-card-n ${n ? st.cls : ""}">${n}</div><div class="au-card-s">${k === "missing" ? "in the baseline, not here" : k === "extra" ? "wears the convention, not in the baseline" : k === "present" ? "this baseline does not version its names" : k === "differs" ? "same control, different values" : ""}</div></div>`;
          };
          parts.push(`<div class="au-cards">${["missing", "outdated", "differs", "ok", "present", "ahead", "unversioned", "extra"].map(card).join("")}</div>`);
          const row = (r) => {
            const st = E.STATUS[r.status];
            return `<tr>
              <td class="mini">${r.baseline ? esc(r.baseline.name) : `<span class="muted">—</span>`}${r.baseline && r.baseline.licenseRequirements ? ` <span class="gu-how priv" title="Licence the author names for this policy">${esc(r.baseline.licenseRequirements)}</span>` : ""}${r.catDup ? ` <span class="gu-how priv" title="The catalog carries this identity more than once — a re-cut kept beside its old copy on the baseline tenant. Each row is judged against the tenant copy wearing its own release and version. Retire the old copy, then re-export.">2+ versions in the catalog</span>` : ""}</td>
              <td class="mini">${r.tenant ? esc(r.tenant.name) : `<span class="gu-how exc">missing</span>`}${r.byToken ? ` <span class="gu-how inc" title="Identified by the ${esc(c.idToken)} token in its description — the name did not have to match">${esc(c.idToken)}</span>` : ""}${r.byContent ? ` <span class="gu-how priv" title="Matched by content — ${Math.round(r.score * 100)}% of the smaller set of settings in common; the name did not have to match">content ${Math.round(r.score * 100)}%</span>` : ""}${r.duplicates ? ` <span class="gu-how priv" title="${r.duplicates} policies carry this identity — a leftover copy; judged on the best">×${r.duplicates}</span>` : ""}${r.status === "differs" && r.diff ? `<details class="mini" style="margin-top:4px"><summary style="cursor:pointer">what differs — ${r.diff.added.length} they set · ${r.diff.changed.length} changed · ${r.diff.removed.length} only here</summary><ul style="margin:6px 0 0">${r.diff.added.map((d) => `<li><code title="${esc(d.id)}">${esc(String(d.id).split("_").pop())}</code> — baseline sets ${esc(d.theirs)}</li>`).join("")}${r.diff.changed.map((d) => `<li><code title="${esc(d.id)}">${esc(String(d.id).split("_").pop())}</code> — here ${esc(d.ours)} → baseline ${esc(d.theirs)}</li>`).join("")}${r.diff.removed.map((d) => `<li><code title="${esc(d.id)}">${esc(String(d.id).split("_").pop())}</code> — only here (${esc(d.ours)})</li>`).join("")}</ul></details>` : ""}</td>
              <td class="mini">${r.baseline ? relver(r.bRel, r.bVer) : "—"}</td>
              <td class="mini">${r.tenant ? relver(r.tRel, r.tVer) : "—"}</td>
              <td><span class="gu-how ${st.cls === "bad" ? "exc" : st.cls === "ok" ? "inc" : ""}">${st.icon} ${esc(st.label)}</span></td>
            </tr>`;
          };
          parts.push(`<div class="list-card"><div class="tb-actions" style="margin:0 0 6px"><h4 style="margin:0;flex:1">The baseline, line by line (${cmp.covered} of ${cmp.baselineTotal} covered)</h4><button class="btn" id="${ID("Md")}" title="The gap, written down — ENCA's gap report, Intune-side-out">📝 Gap report (Markdown)</button></div>
            <p class="mini muted" style="margin:0 0 8px">${comm
              ? `The identity is ${c.idToken ? `the <b>${esc(c.idToken)}</b> token in the description first, then ` : ""}the name with the version stripped${c.nameRe ? "" : " (this baseline has no naming convention, so by name only an exact one counts)"}, then <b>the content</b> — a settings-catalog policy is its set of setting definition ids, a compliance or configuration policy the properties it configures; half-or-better overlap claims a policy whatever it is called, and its settings are then diffed value for value; versions compare segment-wise${c.policies.some((p) => p.version) ? "" : ", and a baseline that does not version its names is judged on presence alone"}. Worst first.`
              : `The identity is the NAME with the release tag and version stripped; releases compare first — R26.6 is June 2026, the year then the month — and versions break the tie. Worst first.`}</p>
            <div class="gu-tw"><table class="cg-table"><thead><tr><th>Baseline policy</th><th>This tenant</th><th style="width:120px">Baseline</th><th style="width:120px">Tenant</th><th style="width:170px">Status</th></tr></thead>
            <tbody>${cmp.rows.map(row).join("") || `<tr><td colspan="5" class="mini">The catalog is empty.</td></tr>`}</tbody></table></div></div>`);
        } else if (c && !res) {
          // THE BASELINE IS ALWAYS SHOWN (build 10530, Mihai's rule): the
          // catalog is known before any read, so its rows render at once —
          // and the tenant columns say NOT READ, never missing.
          parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">The baseline, line by line (${c.policies.length})</h4>
            <p class="mini muted" style="margin:0 0 8px">${esc(spec.readLabel)} fills the right-hand columns — until then this tenant's side is unknown, not missing.</p>
            <div class="gu-tw"><table class="cg-table"><thead><tr><th>Baseline policy</th><th>This tenant</th><th style="width:120px">Baseline</th><th style="width:120px">Tenant</th><th style="width:170px">Status</th></tr></thead>
            <tbody>${c.policies.map((b2) => `<tr>
              <td class="mini">${esc(b2.name)}</td>
              <td class="mini muted">—</td>
              <td class="mini">${relver(comm ? null : E.normRel(b2.release, b2.name), b2.version || E.versionOf(b2.name))}</td>
              <td class="mini muted">—</td>
              <td class="mini muted">not read</td>
            </tr>`).join("") || `<tr><td colspan="5" class="mini">The catalog is empty.</td></tr>`}</tbody></table></div></div>`);
        } else if (res && !c) {
          const worn = vms().filter((v) => E.looksBaseline(v.name));
          parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">Policies wearing the convention (${worn.length})</h4>
            ${worn.length ? `<ul class="mini" style="margin:6px 0 0">${worn.map((w) => `<li>${esc(w.name)} <span class="muted">(${esc(E.relLabel(E.releaseOf(w.name)))}${E.versionOf(w.name) ? ` · v${esc(E.versionOf(w.name))}` : " · no version in the name"})</span></li>`).join("")}</ul>` : `<p class="mini muted" style="margin:0">None — no policy name starts with ${esc(spec.prefix)} and carries an Ryy.m release tag.</p>`}</div>`);
        }
        if (res && res.failed && res.failed.length) {
          parts.push(`<div class="gu-fail"><b>${res.failed.length} surface${res.failed.length === 1 ? "" : "s"} could not be read</b><span class="why">${res.failed.map((f) => esc(f.label)).join(", ")} — a baseline policy living there would read as missing, so these rows are floors, not verdicts.</span></div>`);
        }
      }

      if (mode === "export") {
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">🧬 Export the baseline <span class="mini muted">— this IS the baseline tenant</span></h4>
          <p class="mini muted" style="margin:0 0 8px">Writes the catalog from this tenant's ${esc(spec.prefix)} policies — names, releases, versions and the raw bodies, so the one file drives identification and import everywhere else. <b>The folder is the catalog</b>: unzip 📁 Repo folder at the repository root and ${esc(spec.catalogPath)} — the file every tenant's ${esc(spec.label)} reads from the site — is the new reference on the next push.</p>
          ${res ? `<div class="tb-actions"><button class="btn primary" id="${ID("ExportZip")}" title="baseline/${esc(spec.platform.toLowerCase())}/ with catalog.json, one JSON per policy and a README index — unzip at the repo root">📁 Repo folder (zip)</button><button class="btn" id="${ID("Export")}">⬇ Catalog file (JSON)</button></div>` : `<p class="mini muted" style="margin:0">${esc(spec.readLabel)} first — the export is cut from the read.</p>`}
          <p class="mini muted" style="margin:8px 0 0">Each identity is exported <b>once, the newest</b> — an older copy still on the tenant is listed as superseded in the README, and 🧹 Housekeeping retires it.</p>
          <span class="mini muted" id="${ID("ExportNote")}"></span></div>`);
      }

      if (mode === "import") {
        const importReady = c && c.policies.some((p) => p.body && p.importable !== false);
        const nRefused = c ? c.policies.filter((p) => !p.body || p.importable === false).length : 0;
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">📥 Import the baseline <span class="tag block">writes to the tenant</span></h4>
          <p class="mini muted" style="margin:0 0 8px">Create-only, and only <b>what the comparison calls missing or outdated</b> — a policy found by token, name or content is present whatever it is called here. Two proven pipelines: policies through the Backup tool's restore (dry run, collision stop per name, read-back verify) and assignment filters through 🧩 T14's own create. Everything arrives <b>unassigned</b> — reach is ✏️ the editor's act, taken deliberately afterwards. ${comm
            ? `Created policies keep the <b>author's own names and descriptions</b>, verbatim${c.idToken ? ` — the ${esc(c.idToken)} token included, so ${esc(c.label)}'s own deployer can update them later as if it had created them` : ""}.${nRefused ? ` ${nRefused} of the ${c.policies.length} cannot be created here (${esc((E.importEntries(c, null).refused[0] || {}).why || "no create path")}) and are said so on the row.` : ""}`
            : `Created policies keep their <b>canonical baseline names</b>, no prefix — the name is the identity this screen matches on. Scripts are identified but not importable from the catalog: the reference read carries no script bodies, and a script without its body cannot be put back.`}</p>
          <div class="tb-actions">
            ${comm ? "" : `<label class="btn">📄 Load a baseline file<input type="file" id="${ID("File")}" accept=".json" style="display:none"></label>`}
            <button class="btn" id="${ID("Dry")}" ${importReady ? "" : "disabled title=\"The active catalog carries nothing importable — load a baseline export file.\""}>🔍 Dry run — create what is missing</button>
          </div>
          <div id="${ID("Plan")}" style="margin-top:10px">${lastWrite && lastWrite.failedHtml ? `<p class="mini" style="margin:0 0 6px">From the last import:</p>${lastWrite.failedHtml}` : ""}</div></div>`);
      }

      if (mode === "upstream") {
        const co = communityCatalog();
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">${spec.upstream.icon} Upstream — ${esc(spec.upstream.label)} <span class="tag block">writes to the tenant</span> <span class="mini muted">— cloudfellows.dev only, because it authors the baseline</span></h4>
          <p class="mini muted" style="margin:0 0 8px">Watch <code>${esc(spec.upstream.repo)}</code> for controls our baseline lacks. The app never fetches it — the content-security policy allows Graph and nothing else: <b>download the zip yourself</b> (the link is plain navigation), then load it here${co ? ` — or start from the <b>bundled ${esc(co.label)}${co.release ? ` v${esc(co.release)}` : ""}</b>, the release this build already carries` : ""}. Matching is by <b>content, never name</b>: a settings-catalog policy is its set of setting definition ids, a compliance or configuration policy the properties it configures — identical sets are <b>same</b>, a half-or-better overlap is a <b>match with its diff shown</b>, anything else is <b>new</b>. New and changed controls get an editable canonical name and can be created in THIS tenant — curate, then 🧬 re-export the baseline.</p>
          <div class="tb-actions">
            <button class="btn primary" id="${ID("UpFetch")}" title="Read the repository directly — two GitHub API calls and one raw read per policy, no token, no zip">🌐 Fetch the latest from github.com</button>
            <a class="btn" href="${esc(E.UPSTREAM_ZIP_URL)}" target="_blank" rel="noopener">⬇ Get the zip instead</a>
            <label class="btn">📄 Load the ${esc(spec.upstream.label)} zip<input type="file" id="${ID("UpZip")}" accept=".zip" style="display:none"></label>
            ${co ? `<button class="btn" id="${ID("UpBundled")}" title="Read the bundled community catalog as the upstream — no download">${co.icon || "🧩"} Use the bundled ${esc(co.label)}${co.release ? ` v${esc(co.release)}` : ""}</button>` : ""}
          </div>
          <p class="mini muted" id="${ID("UpNote")}" style="margin:8px 0 0"></p></div>`);
      }

      if (mode === "housekeeping") {
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">🧹 Housekeeping <span class="tag block">deletes from the tenant</span> <span class="mini muted">— cloudfellows.dev only, because it authors the baseline</span></h4>
          <p class="mini muted" style="margin:0 0 8px">Every identity this tenant carries <b>more than once</b> — a re-cut kept beside its old copy. The newest release and version is <b>kept</b>; the older copies are offered for deletion, ticked by default. An older copy that still has <b>assignments is refused</b>: deleting it would take reach away the kept copy does not have — move the reach in ✏️ the editor first. Dry run reads each policy again before anything is deleted (still there, still that name, still unassigned); every delete is verified by a read-back that fails. <b>📦 Back up first</b> — a deleted policy does not come back from here.</p>
          ${res ? "" : `<p class="mini muted" style="margin:0">${esc(spec.readLabel)} first — the list is cut from the read.</p>`}</div>`);
      }

      if (mode === "rename") {
        const co = communityCatalog();
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">✏️ Stamp the release <span class="tag block">writes to the tenant</span> <span class="mini muted">— cloudfellows.dev only, because it authors the baseline</span></h4>
          <p class="mini muted" style="margin:0 0 8px">Every policy that starts with <code>${esc(spec.prefix)}</code> and ends in a version but carries <b>no <code>Ryy.m</code> release tag</b> is proposed one, cut from its <b>last-modified date</b> (year, then month, UTC) and put before the version — <code>${esc(spec.prefix)} - DCP - Microsoft Office - D - Security - v3.6</code> modified in January 2026 becomes <code>… - R26.1 - v3.6</code>. A proposal, not a verdict: last-modified means last <i>touched</i> — an assignment edit moves it too — so every name is editable before anything is written. ${co && co.nameRe ? `<b>${esc(co.label)}'s own names are never proposed</b>: keeping them is what lets its deployer maintain them.` : ""} Renames are PATCHes on the policy's own surface (T14's update for filters), each read back and verified; the comparison above re-reads afterwards.</p>
          ${res ? "" : `<p class="mini muted" style="margin:0">${esc(spec.readLabel)} first — the list is cut from the read.</p>`}</div>`);
      }

      $(ID("Body")).innerHTML = parts.join("");
      const up = $(ID("Upstream"));
      if (up) up.style.display = mode === "upstream" && isCfdev() ? "" : "none";
      // the rename table has its own host too — proposals are DOM state
      const rh = $(ID("Rename"));
      if (rh) {
        rh.style.display = mode === "rename" && isCfdev() ? "" : "none";
        if (mode === "rename" && isCfdev() && res && !rh.dataset.for) renderRename();
      }
      const hh = $(ID("Housekeeping"));
      if (hh) {
        hh.style.display = mode === "housekeeping" && isCfdev() ? "" : "none";
        if (mode === "housekeeping" && isCfdev() && res && !hh.dataset.for) renderHousekeeping();
      }
      wire();
    }

    function wire() {
      const seg = $(ID("Cat"));
      if (seg) seg.addEventListener("click", (e) => {
        const b = e.target.closest(`[data-${P}cat]`); if (!b || b.dataset[`${P}cat`] === catId) return;
        catId = b.dataset[`${P}cat`];
        planned = null; plannedFilters = null;   // a plan belongs to the catalog it was made for
        recompare(); render();
      });
      const md = $(ID("Md"));
      if (md) md.addEventListener("click", () => {
        if (!cmp) return;
        download(`tuno-${spec.platform.toLowerCase()}-baseline-gap-${new Date().toISOString().slice(0, 10)}.md`, E.toMd(cmp, tenantName()), "text/markdown");
      });
      const ez = $(ID("ExportZip"));
      if (ez) ez.addEventListener("click", async () => {
        const built = E.buildExport(res, tenantName());
        if (!built.file.policies.length) { $(ID("ExportNote")).textContent = "Nothing to export — no policy wears the convention."; return; }
        try {
          const z = new JSZip();
          const files = E.repoFolder(built);
          for (const [path, text] of Object.entries(files)) z.file(path, text);
          const blob = await z.generateAsync({ type: "blob" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = `tuno-${spec.platform.toLowerCase()}-baseline-repo-${new Date().toISOString().slice(0, 10)}.zip`; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          $(ID("ExportNote")).textContent = `${built.file.policies.length} policies as baseline/${spec.platform.toLowerCase()}/`
            + (built.superseded.length ? ` · ${built.superseded.length} identit${built.superseded.length === 1 ? "y" : "ies"} exported once, older copies listed as superseded — 🧹 Housekeeping retires them` : "")
            + (built.skipped.length ? ` · ${built.skipped.length} skipped (${built.skipped.map((x) => x.why)[0]})` : "");
        } catch (e) { $(ID("ExportNote")).textContent = `The zip could not be written: ${(e && e.message) || e}`; }
      });
      const ex = $(ID("Export"));
      if (ex) ex.addEventListener("click", () => {
        const built = E.buildExport(res, tenantName());
        if (!built.file.policies.length) { $(ID("ExportNote")).textContent = "Nothing to export — no policy wears the convention."; return; }
        download(`tuno-${spec.platform.toLowerCase()}-baseline-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(built.file, null, 2));
        $(ID("ExportNote")).textContent = `${built.file.policies.length} policies exported, each identity once`
          + (built.superseded.length ? ` · ${built.superseded.length} older cop${built.superseded.length === 1 ? "y" : "ies"} left out as superseded — 🧹 Housekeeping retires them` : "")
          + (built.skipped.length ? ` · ${built.skipped.length} skipped (${built.skipped.map((s) => s.why)[0]})` : "");
      });
      const fi = $(ID("File"));
      if (fi) fi.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          fileCat = E.parseCatalog(await f.text());
          catId = "cfdev";
          recompare(); render();
        } catch (err) {
          $(ID("Plan")).innerHTML = `<div class="gu-fail"><b>${esc((err && err.message) || err)}</b></div>`;
        }
      });
      const dry = $(ID("Dry"));
      if (dry) dry.addEventListener("click", dryRun);
      const uz = $(ID("UpZip"));
      if (uz) uz.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) await loadUpstreamZip(f);
      });
      const uf = $(ID("UpFetch"));
      if (uf) uf.addEventListener("click", () => fetchForUpstream());
      const cf1 = $(ID("Fetch"));
      if (cf1) cf1.addEventListener("click", () => fetchForCatalog());
      const cr = $(ID("FetchRevert"));
      if (cr) cr.addEventListener("click", () => { fetchedCat = null; planned = null; plannedFilters = null; recompare(); render(); });
      const ub = $(ID("UpBundled"));
      if (ub) ub.addEventListener("click", () => {
        const co = communityCatalog(), cf = cfCatalog();
        if (!co) return;
        if (!cf) { $(ID("UpNote")).textContent = "Load or bundle a CloudFellows catalog first — a diff needs both sides."; return; }
        landUpstream({ policies: E.communityAsUpstream(co), skipped: [], seenOther: 0, manifest: null }, cf, `bundled ${co.label}${co.release ? ` v${co.release}` : ""}`, false);
      });
    }

    // ------------------------------------------------ the upstream watch --
    let upstream = null;   // { rows, skipped, seenOther, when, parsed, from }
    let lastSource = "";

    // writable: a loaded zip can be written back out as the next community
    // catalog file; the bundled catalog cannot — it IS that file already
    function landUpstream(parsed, cf, from, writable) {
      upstream = {
        rows: E.matchUpstream(parsed.policies, cf),
        skipped: parsed.skipped, seenOther: parsed.seenOther, parsed: writable ? parsed : null, from,
        when: new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      };
      $(ID("UpNote")).textContent = "";
      renderUpstream();
      renderSeg();
    }
    async function loadUpstreamZip(file) {
      const cf = cfCatalog();
      if (!cf) { $(ID("UpNote")).textContent = "Load or bundle a CloudFellows catalog first — a diff needs both sides."; return; }
      try {
        $(ID("UpNote")).textContent = "Reading the zip…";
        const z = await JSZip.loadAsync(file);
        const jobs = [];
        z.forEach((path, zf) => {
          if (!zf.dir && /\.json$/i.test(path)) jobs.push(zf.async("string").then((t) => ({ path, text: t })));
          else if (!zf.dir && spec.upstream.otherRe.test(path)) jobs.push(Promise.resolve({ path, text: "" }));
        });
        const files = await Promise.all(jobs);
        const parsed = E.parseUpstream(files);
        if (!parsed.policies.length) { $(ID("UpNote")).textContent = `No comparable policies in the zip — is this the ${spec.upstream.label} archive?`; return; }
        landUpstream(parsed, cf, `the loaded zip${parsed.manifest && parsed.manifest.oibVersion ? ` (v${parsed.manifest.oibVersion})` : ""}`, true);
      } catch (e) {
        $(ID("UpNote")).textContent = `The zip could not be read: ${(e && e.message) || e}`;
      }
    }

    function renderUpstream() {
      if (!upstream) return;
      const n = { same: 0, differs: 0, new: 0 };
      upstream.rows.forEach((r) => { n[r.status]++; });
      const order = { new: 0, differs: 1, same: 2 };
      const rows = [...upstream.rows].sort((a, b) => order[a.status] - order[b.status] || String(a.up.name).localeCompare(String(b.up.name)));
      const idShort = (x) => String(x).split("_").pop();
      const card = (label, num, sub, cls) => `<div class="au-card"><div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${num}</div><div class="au-card-s">${sub}</div></div>`;
      const cards = `<div class="au-cards">
        ${card("＋ New to us", n.new, "controls the baseline lacks", n.new ? "bad" : "")}
        ${card("≠ Matched, differs", n.differs, "same control, different settings or values", n.differs ? "warn" : "")}
        ${card("✓ Covered", n.same, "setting for setting, value for value", "ok")}
        ${card("Seen, not comparable", upstream.seenOther || 0, "scripts and profiles — no policy body to diff")}
      </div>`;
      const kindLabel = (k) => k === "compliance" ? "compliance" : k === "deviceConfig" ? "device configuration" : k === "driverUpdate" ? "driver update profile" : "settings catalog";
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
        const act = r.status !== "same" && r.up.kind !== "driverUpdate";
        const badge = r.status === "new" ? `<span class="gu-how exc">new</span>`
          : r.status === "differs" ? `<span class="gu-how">differs</span>`
            : `<span class="gu-how inc">✓</span>`;
        return `<tr>
          <td style="width:30px">${act ? `<input type="checkbox" data-uptick="${i}" ${r.status === "new" ? "checked" : ""}>` : ""}</td>
          <td class="mini"><b>${esc(r.up.name)}</b> ${badge}<div class="mini muted">${esc(kindLabel(r.up.kind))} · ${r.up.defIds.length} setting${r.up.defIds.length === 1 ? "" : "s"}${r.up.kind === "driverUpdate" ? " · no create path here" : ""}</div>${whatsNew(r)}</td>
          <td>${act ? `<input data-upname="${i}" value="${esc(E.proposeName(r))}" style="width:100%">` : ""}</td>
        </tr>`;
      };
      const host = $(ID("Upstream"));
      host.innerHTML = `<div class="list-card">
        <h4 style="margin:0 0 6px">${spec.upstream.icon} ${esc(spec.upstream.label)} vs the baseline <span class="mini muted">— ${esc(upstream.from || "loaded")}, ${esc(upstream.when)}</span></h4>
        ${cards}
        <p class="mini muted" style="margin:10px 0 4px">Tick what belongs in the baseline and curate the name — proposals stamp <b>${esc(E.relLabel(E.currentRelease()))}</b> with the version increased; created here unassigned, then 🧬 re-export.</p>
        ${upstream.skipped.length ? `<p class="mini muted" style="margin:0 0 8px">${upstream.skipped.length} file(s) skipped: ${esc(upstream.skipped.map((sk) => sk.path.split("/").pop()).slice(0, 3).join(", "))}${upstream.skipped.length > 3 ? "…" : ""}</p>` : ""}
        <div class="tb-actions" style="margin:8px 0 8px">
          <button class="btn" id="${ID("UpAll")}">☑ Select all</button>
          <button class="btn" id="${ID("UpNone")}">☐ Select none</button>
          <span class="mini muted" id="${ID("UpCount")}"></span>
          <button class="btn" id="${ID("UpMd")}" title="The whole comparison as Markdown — what is new, per policy, for the release notes">📝 What's new (Markdown)</button>
          ${upstream.parsed ? `<button class="btn" id="${ID("UpCatalog")}" title="Write this upstream as ${esc(spec.communityPath.replace(/\/catalog\.json$/, "/"))} — unzip at the repo root and it is the community catalog every tenant reads">📁 Community catalog folder (zip)</button>` : ""}
        </div>
        <div class="gu-tw"><table class="cg-table" style="table-layout:fixed;width:100%"><colgroup><col style="width:34px"><col style="width:56%"><col></colgroup>
          <thead><tr><th><input type="checkbox" id="${ID("UpMaster")}" title="Select or deselect every row below"></th><th>Upstream policy — and what's new in it</th><th>Canonical name (edit before creating)</th></tr></thead>
          <tbody>${rows.map(row).join("")}</tbody></table></div>
        <div id="${ID("UpPlan")}" style="margin-top:10px"></div>
      </div>
      <div class="ae-selbar" id="${ID("UpBar")}"><b id="${ID("UpBarCount")}"></b>
        <button class="btn primary" id="${ID("UpDry")}">🔍 Dry run the ticked <span class="tag block">plans writes</span></button>
        <button class="btn primary" id="${ID("UpApply")}" style="display:none">✍ Create in THIS tenant <span class="tag block">writes to the tenant</span></button>
        <button class="ae-selbar-x" id="${ID("UpBarX")}" title="Clear the selection">✕</button></div>`;
      host.dataset.order = JSON.stringify(rows.map((r) => upstream.rows.indexOf(r)));
      $(ID("UpDry")).addEventListener("click", upDryRun);
      $(ID("UpApply")).addEventListener("click", upApply);
      const ticks = () => [...host.querySelectorAll("[data-uptick]")];
      const master = $(ID("UpMaster"));
      // FOUR faces of one selection (the 10549 pattern): master box, the
      // all/none buttons above the table, the row ticks, and the floating
      // bar carrying dry run → create (10556) for the selection it was made for.
      const syncMaster = () => {
        const t = ticks(), on = t.filter((c) => c.checked).length;
        master.checked = on > 0 && on === t.length;
        master.indeterminate = on > 0 && on < t.length;
        const c2 = $(ID("UpCount")); if (c2) c2.textContent = t.length ? `${on} of ${t.length} ticked` : "";
        const bar = $(ID("UpBar"));
        if (bar) {
          bar.classList.toggle("visible", on > 0);
          const live = upPlanned && upPlanKey === upSelectionKey();
          const nCreate = live ? upPlanned.filter((p) => !p.collided).length : 0;
          const bc = $(ID("UpBarCount"));
          if (bc) bc.textContent = live ? `${on} ticked · ${nCreate} to create` : `${on} polic${on === 1 ? "y" : "ies"} ticked`;
          const dry = $(ID("UpDry")), ap = $(ID("UpApply"));
          if (dry) {
            dry.classList.toggle("primary", !live);
            dry.innerHTML = live ? `🔍 Dry run again` : `🔍 Dry run the ticked <span class="tag block">plans writes</span>`;
          }
          if (ap) {
            ap.style.display = live && nCreate ? "" : "none";
            ap.innerHTML = `✍ Create ${nCreate} in THIS tenant <span class="tag block">writes to the tenant</span>`;
          }
          const stale = $(ID("UpStale"));
          if (stale) stale.style.display = upPlanned && !live ? "" : "none";
        }
      };
      syncUpBar = syncMaster;
      const setAll = (v) => { ticks().forEach((c) => { c.checked = v; }); syncMaster(); };
      master.addEventListener("change", () => setAll(master.checked));
      $(ID("UpAll")).addEventListener("click", () => setAll(true));
      $(ID("UpNone")).addEventListener("click", () => setAll(false));
      $(ID("UpBarX")).addEventListener("click", () => setAll(false));
      host.addEventListener("change", (e) => { if (e.target.closest("[data-uptick]")) syncMaster(); });
      host.addEventListener("input", (e) => { if (e.target.closest("[data-upname]")) syncMaster(); });
      syncMaster();
      $(ID("UpMd")).addEventListener("click", () => {
        const cf = cfCatalog();
        download(`${spec.upstream.id}-vs-baseline-${new Date().toISOString().slice(0, 10)}.md`,
          E.upstreamMarkdown(rows, { catalog: cf ? `${cf.release || "R26"} (${cf.policies.length} policies)` : "" }), "text/markdown");
      });
      const uc = $(ID("UpCatalog"));
      if (uc) uc.addEventListener("click", async () => {
        const f = upstream.fetched || {};
        const file = E.buildCommunity(upstream.parsed, { release: f.date || (E.community() ? E.community().release : ""), released: f.date || "", commit: f.commit || "" });
        try {
          const z = new JSZip();
          for (const [path, text] of Object.entries(E.communityFolder(file))) z.file(path, text);
          const blob = await z.generateAsync({ type: "blob" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = `tuno-${spec.upstream.id}-community-repo-${new Date().toISOString().slice(0, 10)}.zip`; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        } catch (e) { $(ID("UpNote")).textContent = `The zip could not be written: ${(e && e.message) || e}`; }
      });
    }

    let upPlanned = null;
    let upPlanKey = null;
    let syncUpBar = () => {};
    function upSelectionKey() {
      const host = $(ID("Upstream"));
      if (!host) return "";
      const parts = [];
      host.querySelectorAll("[data-uptick]").forEach((cb) => {
        if (!cb.checked) return;
        const i = cb.dataset.uptick;
        const nameEl = host.querySelector(`[data-upname="${i}"]`);
        parts.push(`${i}=${((nameEl && nameEl.value) || "").trim()}`);
      });
      return parts.join("\n");
    }
    async function upDryRun() {
      if (running || !upstream) return;
      running = true; $(ID("UpDry")).disabled = true; $(ID("UpPlan")).innerHTML = "";
      upPlanned = null; upPlanKey = null; syncUpBar();
      try {
        const host = $(ID("Upstream"));
        const order = JSON.parse(host.dataset.order || "[]");
        const picked = [], badNames = [];
        host.querySelectorAll("[data-uptick]").forEach((cb) => {
          if (!cb.checked) return;
          const i = +cb.dataset.uptick;
          const r = upstream.rows[order[i]];
          const nameEl = host.querySelector(`[data-upname="${i}"]`);
          const name = (nameEl && nameEl.value || "").trim();
          if (!E.looksBaseline(name)) { badNames.push(name || r.up.name); return; }
          picked.push(E.upstreamEntry(r, name));
        });
        if (badNames.length) {
          $(ID("UpPlan")).innerHTML = `<div class="gu-fail"><b>${badNames.length} name${badNames.length === 1 ? " does" : "s do"} not wear the convention</b><span class="why">${esc(spec.prefix)} prefix, an Ryy.m release tag and a version — without them the policy would be invisible to the comparison above. Fix: ${esc(badNames[0])}</span></div>`;
          return;
        }
        if (!picked.length) { $(ID("UpPlan")).innerHTML = `<p class="mini muted" style="margin:0">Nothing ticked.</p>`; return; }
        prog("Checking what already exists…");
        await Graph.ensureScopes(Graph.SCOPES.config);
        const names = await Restore.existingNames([...new Set(picked.map((x) => x.area))], (m) => prog(m));
        upPlanned = Restore.plan(picked, names);
        upPlanKey = upSelectionKey();
        prog("");
        const nCreate = upPlanned.filter((p) => !p.collided).length;
        $(ID("UpPlan")).innerHTML = `
          <p class="mini" style="margin:0 0 8px"><b>${nCreate} to create</b> · ${upPlanned.length - nCreate} already present (the collision stop)${nCreate ? ` — <b>✍ Create ${nCreate} in THIS tenant</b> is in the bar below` : ""}</p>
          <p class="mini" id="${ID("UpStale")}" style="display:none;margin:0 0 8px;color:var(--report)">The selection changed since this dry run — dry run again before creating.</p>
          <div class="gu-tw"><table class="cg-table"><thead><tr><th>Will be created as</th><th style="width:180px">Surface</th><th style="width:200px">Operation</th></tr></thead>
          <tbody>${upPlanned.map((p) => `<tr><td class="mini"><b>${esc(p.target)}</b></td><td class="mini">${esc(Restore.AREA_INFO[p.area].label)}</td><td class="mini${p.collided ? '" style="color:var(--off)' : ""}">${p.collided ? "skip — a policy already wears this name" : "create, unassigned"}</td></tr>`).join("")}</tbody></table></div>
          <div id="${ID("UpResult")}" style="margin-top:10px"></div>`;
      } catch (e) {
        prog("");
        $(ID("UpPlan")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const d = $(ID("UpDry")); if (d) d.disabled = false; syncUpBar(); }
    }

    async function upApply() {
      if (running || !upPlanned) return;
      if (upPlanKey !== upSelectionKey()) { syncUpBar(); return; }
      running = true; $(ID("UpApply")).disabled = true;
      try {
        await Graph.ensureScopes(Graph.SCOPES.profiles);
        const results = await Restore.apply(upPlanned, (m) => prog(m));
        prog("");
        const good = results.filter((r) => r.outcome === "created").length;
        const bad = results.filter((r) => r.outcome === "failed").length;
        $(ID("UpResult")).innerHTML = `
          <p class="mini" style="margin:0 0 6px"><b>${good} created</b>${bad ? ` · <b style="color:var(--off)">${bad} failed</b>` : ""} — unassigned, in this tenant only. Now ${esc(spec.readLabel)}, judge them in the comparison, and 🧬 re-export: the export becomes the new baseline, versions increased, wearing this month's release.</p>
          ${results.filter((r) => r.outcome === "failed").map((r) => `<div class="gu-fail"><b>${esc(r.target || "")}</b><span class="why">${esc(r.detail || "")}</span></div>`).join("")}`;
        if (typeof PolicyCache !== "undefined") PolicyCache.invalidate();
        upPlanned = null; upPlanKey = null;
        rereadAfter(`${spec.upstream.icon} Upstream: <b>${good} created</b>${bad ? `, <b style="color:var(--off)">${bad} failed</b>` : ""}, unassigned — the Upstream pane keeps the details`);
      } catch (e) {
        prog("");
        $(ID("UpResult")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const ap = $(ID("UpApply")); if (ap) ap.disabled = false; syncUpBar(); }
    }

    // ------------------------------------------------ the github.com fetch --
    let fetching = false;
    async function fetchForUpstream() {
      const cf = cfCatalog();
      if (!cf) { $(ID("UpNote")).textContent = "Load or bundle a CloudFellows catalog first — a diff needs both sides."; return; }
      if (fetching) return;
      fetching = true; const b = $(ID("UpFetch")); if (b) b.disabled = true;
      try {
        const got = await E.fetchUpstream((m) => { const n = $(ID("UpNote")); if (n) n.textContent = m; });
        const parsed = E.parseUpstream(got.files);
        parsed.seenOther = got.seenOther;
        if (!parsed.policies.length) { $(ID("UpNote")).textContent = "The repository carries no comparable policies under the expected folder."; return; }
        landUpstream(parsed, cf, `github.com @ ${got.commit.slice(0, 7)} (${got.date})`, true);
        upstream.fetched = { commit: got.commit, date: got.date };
      } catch (e) {
        const n = $(ID("UpNote")); if (n) n.textContent = `Not fetched: ${(e && e.message) || e}`;
      } finally { fetching = false; const b2 = $(ID("UpFetch")); if (b2) b2.disabled = false; }
    }
    async function fetchForCatalog() {
      if (fetching) return;
      fetching = true; const b = $(ID("Fetch")); if (b) b.disabled = true;
      try {
        const got = await E.fetchUpstream((m) => { const n = $(ID("FetchNote")); if (n) n.textContent = m; });
        const parsed = E.parseUpstream(got.files);
        parsed.seenOther = got.seenOther;
        if (!parsed.policies.length) throw new Error("the repository carries no comparable policies under the expected folder");
        fetchedCat = E.buildCommunity(parsed, { commit: got.commit, released: got.date, release: got.date });
        catId = "community"; planned = null; plannedFilters = null;
        recompare(); render();
      } catch (e) {
        const n = $(ID("FetchNote")); if (n) n.textContent = `Not fetched: ${(e && e.message) || e}`;
        const b2 = $(ID("Fetch")); if (b2) b2.disabled = false;
      } finally { fetching = false; }
    }

    // ------------------------------------------------ the rename act ------
    // Its own host (#<ids>Rename): ticks and edited names are DOM state.
    let rnPlanned = null, rnPlanKey = null, syncRnBar = () => {};
    function rnSelectionKey() {
      const host = $(ID("Rename"));
      if (!host) return "";
      const parts = [];
      host.querySelectorAll("[data-rntick]").forEach((cb) => {
        if (!cb.checked) return;
        const el = host.querySelector(`[data-rnname="${cb.dataset.rntick}"]`);
        parts.push(`${cb.dataset.rntick}=${((el && el.value) || "").trim()}`);
      });
      return parts.join("\n");
    }
    function renderRename() {
      const host = $(ID("Rename"));
      if (!host || !res) return;
      const rows = E.renameProposals(vms(), communityCatalog());
      host.dataset.for = String(rows.length);
      rnPlanned = null; rnPlanKey = null;
      const n = rows.filter((r) => r.status === "propose").length;
      const row = (r, i) => {
        const act = r.status === "propose";
        const when = r.modified ? esc(String(r.modified).slice(0, 10)) : "—";
        return `<tr>
          <td style="width:30px">${act ? `<input type="checkbox" data-rntick="${i}" checked>` : ""}</td>
          <td class="mini"><b>${esc(r.name)}</b><div class="mini muted">${esc(r.sectionLabel || r.section)} · modified ${when}${act ? ` → <b>${esc(E.relLabel(r.rel))}</b>` : ""}${r.why ? ` · ${esc(r.why)}` : ""}</div></td>
          <td>${act ? `<input data-rnname="${i}" value="${esc(r.proposed)}" style="width:100%">` : `<span class="mini muted">${r.status === "community" ? "kept" : "not proposed"}</span>`}</td>
        </tr>`;
      };
      host.innerHTML = `<div class="list-card">
        <h4 style="margin:0 0 6px">✏️ ${n} to stamp <span class="mini muted">— of ${rows.length} unstamped ${esc(spec.prefix)} names on the read</span></h4>
        ${rows.length ? "" : `<p class="mini muted" style="margin:0">Every ${esc(spec.prefix)} policy already carries its release tag.</p>`}
        <div class="tb-actions" style="margin:8px 0 8px">
          <button class="btn" id="${ID("RnAll")}">☑ Select all</button>
          <button class="btn" id="${ID("RnNone")}">☐ Select none</button>
          <span class="mini muted" id="${ID("RnCount")}"></span>
        </div>
        <div class="gu-tw"><table class="cg-table" style="table-layout:fixed;width:100%"><colgroup><col style="width:34px"><col style="width:50%"><col></colgroup>
          <thead><tr><th><input type="checkbox" id="${ID("RnMaster")}" title="Select or deselect every row below"></th><th>Policy now — surface, last modified, the tag it earns</th><th>New name (edit before renaming)</th></tr></thead>
          <tbody>${rows.map(row).join("")}</tbody></table></div>
        <div id="${ID("RnPlan")}" style="margin-top:10px"></div>
      </div>
      <div class="ae-selbar" id="${ID("RnBar")}"><b id="${ID("RnBarCount")}"></b>
        <button class="btn primary" id="${ID("RnDry")}">🔍 Dry run the ticked <span class="tag block">plans writes</span></button>
        <button class="btn primary" id="${ID("RnApply")}" style="display:none">✍ Rename in THIS tenant <span class="tag block">writes to the tenant</span></button>
        <button class="ae-selbar-x" id="${ID("RnBarX")}" title="Clear the selection">✕</button></div>`;
      host.dataset.rows = JSON.stringify(rows.map((r) => ({ id: r.p.id, name: r.name, section: r.section, modified: r.modified, status: r.status })));
      const ticks = () => [...host.querySelectorAll("[data-rntick]")];
      const master = $(ID("RnMaster"));
      const sync = () => {
        const t = ticks(), on = t.filter((c) => c.checked).length;
        master.checked = on > 0 && on === t.length; master.indeterminate = on > 0 && on < t.length;
        const c2 = $(ID("RnCount")); if (c2) c2.textContent = t.length ? `${on} of ${t.length} ticked` : "";
        const bar = $(ID("RnBar")); if (!bar) return;
        bar.classList.toggle("visible", on > 0);
        const live = rnPlanned && rnPlanKey === rnSelectionKey();
        const nDo = live ? rnPlanned.filter((p) => !p.refused).length : 0;
        $(ID("RnBarCount")).textContent = live ? `${on} ticked · ${nDo} to rename` : `${on} polic${on === 1 ? "y" : "ies"} ticked`;
        const dry = $(ID("RnDry")), ap = $(ID("RnApply"));
        dry.classList.toggle("primary", !live);
        dry.innerHTML = live ? `🔍 Dry run again` : `🔍 Dry run the ticked <span class="tag block">plans writes</span>`;
        ap.style.display = live && nDo ? "" : "none";
        ap.innerHTML = `✍ Rename ${nDo} in THIS tenant <span class="tag block">writes to the tenant</span>`;
        const stale = $(ID("RnStale")); if (stale) stale.style.display = rnPlanned && !live ? "" : "none";
      };
      syncRnBar = sync;
      const setAll = (v) => { ticks().forEach((c) => { c.checked = v; }); sync(); };
      master.addEventListener("change", () => setAll(master.checked));
      $(ID("RnAll")).addEventListener("click", () => setAll(true));
      $(ID("RnNone")).addEventListener("click", () => setAll(false));
      $(ID("RnBarX")).addEventListener("click", () => setAll(false));
      host.addEventListener("change", (e) => { if (e.target.closest("[data-rntick]")) sync(); });
      host.addEventListener("input", (e) => { if (e.target.closest("[data-rnname]")) sync(); });
      $(ID("RnDry")).addEventListener("click", rnDryRun);
      $(ID("RnApply")).addEventListener("click", rnApply);
      sync();
    }
    function rnPicked() {
      const host = $(ID("Rename"));
      const rows = JSON.parse(host.dataset.rows || "[]");
      const picked = [];
      host.querySelectorAll("[data-rntick]").forEach((cb) => {
        if (!cb.checked) return;
        const i = +cb.dataset.rntick;
        const el = host.querySelector(`[data-rnname="${i}"]`);
        picked.push({ ...rows[i], newName: ((el && el.value) || "").trim(), path: E.RENAME_PATH[rows[i].section] });
      });
      return picked;
    }
    async function rnDryRun() {
      if (running) return;
      running = true; $(ID("RnDry")).disabled = true; $(ID("RnPlan")).innerHTML = "";
      rnPlanned = null; rnPlanKey = null; syncRnBar();
      try {
        const picked = rnPicked();
        if (!picked.length) { $(ID("RnPlan")).innerHTML = `<p class="mini muted" style="margin:0">Nothing ticked.</p>`; return; }
        prog("Checking the new names are free…");
        await Graph.ensureScopes(Graph.SCOPES.config);
        const areas = [...new Set(picked.map((p) => E.AREA_OF_SECTION[p.section]).filter((a) => a && a !== "AssignmentFilters"))];
        const names = areas.length ? await Restore.existingNames(areas, (m) => prog(m)) : {};
        let filterNames = new Set();
        if (picked.some((p) => p.section === "filters")) {
          prog("Reading the tenant's assignment filters…");
          filterNames = new Set((await Filters.list()).map((f) => String(f.displayName || "").toLowerCase()));
        }
        prog("");
        const seen = new Map();
        rnPlanned = picked.map((p) => {
          const target = p.newName, lc = target.toLowerCase();
          let refused = "";
          if (!target) refused = "empty name";
          else if (!E.looksBaseline(target)) refused = `does not wear the convention — ${spec.prefix} prefix, an Ryy.m tag and a version`;
          else if (target === p.name) refused = "unchanged";
          else if (seen.has(lc)) refused = `the same name is proposed for “${seen.get(lc)}”`;
          else if (p.section === "filters" ? filterNames.has(lc) : (names[E.AREA_OF_SECTION[p.section]] || new Set()).has(lc)) refused = "a policy already wears this name (the collision stop)";
          if (!refused) seen.set(lc, p.name);
          return { ...p, target, refused };
        });
        rnPlanKey = rnSelectionKey();
        const nDo = rnPlanned.filter((p) => !p.refused).length;
        $(ID("RnPlan")).innerHTML = `
          <p class="mini" style="margin:0 0 8px"><b>${nDo} to rename</b> · ${rnPlanned.length - nDo} refused${nDo ? ` — <b>✍ Rename ${nDo} in THIS tenant</b> is in the bar below` : ""}</p>
          <p class="mini" id="${ID("RnStale")}" style="display:none;margin:0 0 8px;color:var(--report)">The selection changed since this dry run — dry run again before renaming.</p>
          <div class="gu-tw"><table class="cg-table"><thead><tr><th>From</th><th>To</th><th style="width:220px">Operation</th></tr></thead>
          <tbody>${rnPlanned.map((p) => `<tr><td class="mini">${esc(p.name)}</td><td class="mini"><b>${esc(p.target)}</b></td><td class="mini${p.refused ? '" style="color:var(--off)' : ""}">${p.refused ? `skip — ${esc(p.refused)}` : `PATCH ${esc(p.path.field)}${p.path.viaFilters ? " (T14's update)" : ""}`}</td></tr>`).join("")}</tbody></table></div>
          <div id="${ID("RnResult")}" style="margin-top:10px"></div>`;
      } catch (e) {
        prog("");
        $(ID("RnPlan")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const d = $(ID("RnDry")); if (d) d.disabled = false; syncRnBar(); }
    }
    async function rnApply() {
      if (running || !rnPlanned) return;
      if (rnPlanKey !== rnSelectionKey()) { syncRnBar(); return; }
      running = true; $(ID("RnApply")).disabled = true;
      const results = [];
      try {
        await Graph.ensureScopes(Graph.SCOPES.profiles);
        for (const p of rnPlanned) {
          if (p.refused) { results.push({ ...p, outcome: "skipped", detail: p.refused }); continue; }
          try {
            prog(`${p.target} — renaming…`);
            if (p.path.viaFilters) {
              await Filters.update(p.id, p.modified || null, { displayName: p.target });
            } else {
              const url = `${Graph.BETA}${p.path.endpoint}/${encodeURIComponent(p.id)}`;
              await Graph.patch(url, { [p.path.field]: p.target }, { scopes: Graph.SCOPES.profiles });
              const back = await Graph.readOne(url, { scopes: Graph.SCOPES.profiles });
              if (!back || String(back[p.path.field] || "") !== p.target) throw new Error("the rename returned, but the read-back does not carry the new name — check the portal");
            }
            results.push({ ...p, outcome: "renamed", detail: "verified by read-back" });
          } catch (e) {
            results.push({ ...p, outcome: "failed", detail: String((e && e.message) || e) });
          }
        }
        prog("");
        const good = results.filter((r) => r.outcome === "renamed").length, bad = results.filter((r) => r.outcome === "failed").length;
        $(ID("RnResult")).innerHTML = `
          <p class="mini" style="margin:0 0 6px"><b>${good} renamed</b>${bad ? ` · <b style="color:var(--off)">${bad} failed</b>` : ""} — re-reading the tenant; the list is cut again from the fresh read.</p>
          ${results.filter((r) => r.outcome === "failed").map((r) => `<div class="gu-fail"><b>${esc(r.name)}</b><span class="why">${esc(r.detail)}</span></div>`).join("")}`;
        if (typeof PolicyCache !== "undefined") PolicyCache.invalidate();
        rnPlanned = null; rnPlanKey = null;
        rereadAfter(`✏️ Rename: <b>${good} renamed</b>${bad ? `, <b style="color:var(--off)">${bad} failed</b>` : ""}`);
      } catch (e) {
        prog("");
        $(ID("RnResult")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const ap = $(ID("RnApply")); if (ap) ap.disabled = false; syncRnBar(); }
    }

    // ------------------------------------------------ housekeeping --------
    let hkPlanned = null, hkPlanKey = null, syncHkBar = () => {};
    function hkSelectionKey() {
      const host = $(ID("Housekeeping"));
      if (!host) return "";
      return [...host.querySelectorAll("[data-hktick]")].filter((cb) => cb.checked).map((cb) => cb.dataset.hktick).join(",");
    }
    function renderHousekeeping() {
      const host = $(ID("Housekeeping"));
      if (!host || !res) return;
      const groups = E.housekeeping(vms());
      host.dataset.for = String(groups.length);
      hkPlanned = null; hkPlanKey = null;
      const flat = []; groups.forEach((g) => g.retire.forEach((r) => flat.push({ g, r })));
      const relver = (rel, ver) => `${esc(E.relLabel(rel))}${ver ? ` · v${esc(ver)}` : ""}`;
      let i = 0;
      const rows = groups.map((g) => `
        <tr><td></td><td class="mini" colspan="2"><b>${esc(g.keep.name)}</b> <span class="gu-how inc">keep</span> <span class="mini muted">${relver(g.keepRel, g.keepVer)} · ${esc(g.keep.sectionLabel || g.keep.section)}${g.keepAssignments ? ` · assigned to ${g.keepAssignments}` : " · unassigned"}</span></td></tr>
        ${g.retire.map((r) => { const idx = i++; return `<tr>
          <td style="width:30px">${r.refused ? "" : `<input type="checkbox" data-hktick="${idx}" checked>`}</td>
          <td class="mini" style="padding-left:24px">${esc(r.name)} <span class="gu-how ${r.refused ? "priv" : "exc"}">${r.refused ? "kept" : "retire"}</span><div class="mini muted">${relver(r.rel, r.ver)} · ${esc(r.sectionLabel || r.section)}${r.refused ? ` · ${esc(r.refused)}` : r.assignments ? "" : " · unassigned"}</div></td>
          <td class="mini muted">${r.refused ? "" : "DELETE"}</td></tr>`; }).join("")}`).join("");
      host.innerHTML = `<div class="list-card">
        <h4 style="margin:0 0 6px">🧹 ${flat.filter((x) => !x.r.refused).length} to retire <span class="mini muted">— ${groups.length} identit${groups.length === 1 ? "y" : "ies"} carried more than once</span></h4>
        ${groups.length ? "" : `<p class="mini muted" style="margin:0">Every identity is carried once — nothing to tidy.</p>`}
        <div class="tb-actions" style="margin:8px 0 8px">
          <button class="btn" id="${ID("HkAll")}">☑ Select all</button>
          <button class="btn" id="${ID("HkNone")}">☐ Select none</button>
          <span class="mini muted" id="${ID("HkCount")}"></span>
        </div>
        <div class="gu-tw"><table class="cg-table" style="table-layout:fixed;width:100%"><colgroup><col style="width:34px"><col><col style="width:90px"></colgroup>
          <thead><tr><th><input type="checkbox" id="${ID("HkMaster")}" title="Select or deselect every row below"></th><th>Kept copy — then the older copies under it</th><th>Op</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <div id="${ID("HkPlan")}" style="margin-top:10px"></div>
      </div>
      <div class="ae-selbar" id="${ID("HkBar")}"><b id="${ID("HkBarCount")}"></b>
        <button class="btn primary" id="${ID("HkDry")}">🔍 Dry run the ticked <span class="tag block">plans deletes</span></button>
        <button class="btn primary" id="${ID("HkApply")}" style="display:none">🗑 Delete in THIS tenant <span class="tag block">deletes from the tenant</span></button>
        <button class="ae-selbar-x" id="${ID("HkBarX")}" title="Clear the selection">✕</button></div>`;
      host.dataset.rows = JSON.stringify(flat.map((x) => ({ id: x.r.p.id, name: x.r.name, section: x.r.section, path: x.r.path, keep: x.g.keep.name })));
      const ticks = () => [...host.querySelectorAll("[data-hktick]")];
      const master = $(ID("HkMaster"));
      const sync = () => {
        const t = ticks(), on = t.filter((c) => c.checked).length;
        master.checked = on > 0 && on === t.length; master.indeterminate = on > 0 && on < t.length;
        const c2 = $(ID("HkCount")); if (c2) c2.textContent = t.length ? `${on} of ${t.length} ticked` : "";
        const bar = $(ID("HkBar")); if (!bar) return;
        bar.classList.toggle("visible", on > 0);
        const live = hkPlanned && hkPlanKey === hkSelectionKey();
        const nDo = live ? hkPlanned.filter((p) => !p.refused).length : 0;
        $(ID("HkBarCount")).textContent = live ? `${on} ticked · ${nDo} to delete` : `${on} cop${on === 1 ? "y" : "ies"} ticked`;
        const dry = $(ID("HkDry")), ap = $(ID("HkApply"));
        dry.classList.toggle("primary", !live);
        dry.innerHTML = live ? `🔍 Dry run again` : `🔍 Dry run the ticked <span class="tag block">plans deletes</span>`;
        ap.style.display = live && nDo ? "" : "none";
        ap.innerHTML = `🗑 Delete ${nDo} in THIS tenant <span class="tag block">deletes from the tenant</span>`;
        const stale = $(ID("HkStale")); if (stale) stale.style.display = hkPlanned && !live ? "" : "none";
      };
      syncHkBar = sync;
      const setAll = (v) => { ticks().forEach((c) => { c.checked = v; }); sync(); };
      master.addEventListener("change", () => setAll(master.checked));
      $(ID("HkAll")).addEventListener("click", () => setAll(true));
      $(ID("HkNone")).addEventListener("click", () => setAll(false));
      $(ID("HkBarX")).addEventListener("click", () => setAll(false));
      host.addEventListener("change", (e) => { if (e.target.closest("[data-hktick]")) sync(); });
      $(ID("HkDry")).addEventListener("click", hkDryRun);
      $(ID("HkApply")).addEventListener("click", hkApply);
      sync();
    }
    // the fresh per-policy read before a delete: still there, still that
    // name, still unassigned — the tenant may have moved since the read
    async function hkFresh(p) {
      const url = `${Graph.BETA}${p.path}/${encodeURIComponent(p.id)}`;
      const now = await Graph.readOne(url, { scopes: Graph.SCOPES.config });
      if (!now) return { refused: "already gone" };
      const nameNow = now.name || now.displayName || "";
      if (nameNow !== p.name) return { refused: `the policy is now named “${nameNow}” — not the copy that was planned` };
      let asg = [];
      try { asg = await Graph.readAll(`${url}/assignments`, { scopes: Graph.SCOPES.config }); } catch { asg = null; }
      if (asg === null) return { refused: "its assignments could not be read — not deleting a policy whose reach is unknown" };
      if (asg.length) return { refused: `assigned to ${asg.length} target${asg.length === 1 ? "" : "s"} since the read — move the reach first` };
      return { refused: "" };
    }
    async function hkDryRun() {
      if (running) return;
      running = true; $(ID("HkDry")).disabled = true; $(ID("HkPlan")).innerHTML = "";
      hkPlanned = null; hkPlanKey = null; syncHkBar();
      try {
        const host = $(ID("Housekeeping"));
        const rows = JSON.parse(host.dataset.rows || "[]");
        const picked = [...host.querySelectorAll("[data-hktick]")].filter((cb) => cb.checked).map((cb) => rows[+cb.dataset.hktick]);
        if (!picked.length) { $(ID("HkPlan")).innerHTML = `<p class="mini muted" style="margin:0">Nothing ticked.</p>`; return; }
        await Graph.ensureScopes(Graph.SCOPES.config);
        const out = [];
        for (let i = 0; i < picked.length; i++) {
          const p = picked[i];
          prog(`${p.name} — reading again (${i + 1}/${picked.length})…`);
          const f = p.path ? await hkFresh(p) : { refused: "no delete path here" };
          out.push({ ...p, refused: f.refused });
        }
        prog("");
        hkPlanned = out; hkPlanKey = hkSelectionKey();
        const nDo = out.filter((p) => !p.refused).length;
        $(ID("HkPlan")).innerHTML = `
          <p class="mini" style="margin:0 0 8px"><b>${nDo} to delete</b> · ${out.length - nDo} refused${nDo ? ` — <b>🗑 Delete ${nDo} in THIS tenant</b> is in the bar below` : ""}</p>
          <p class="mini" id="${ID("HkStale")}" style="display:none;margin:0 0 8px;color:var(--report)">The selection changed since this dry run — dry run again before deleting.</p>
          <div class="gu-tw"><table class="cg-table"><thead><tr><th>Old copy</th><th>Kept copy</th><th style="width:260px">Operation</th></tr></thead>
          <tbody>${out.map((p) => `<tr><td class="mini">${esc(p.name)}</td><td class="mini">${esc(p.keep)}</td><td class="mini${p.refused ? '" style="color:var(--off)' : ""}">${p.refused ? `skip — ${esc(p.refused)}` : "DELETE, verified by a read-back that fails"}</td></tr>`).join("")}</tbody></table></div>
          <div id="${ID("HkResult")}" style="margin-top:10px"></div>`;
      } catch (e) {
        prog("");
        $(ID("HkPlan")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const d = $(ID("HkDry")); if (d) d.disabled = false; syncHkBar(); }
    }
    async function hkApply() {
      if (running || !hkPlanned) return;
      if (hkPlanKey !== hkSelectionKey()) { syncHkBar(); return; }
      running = true; $(ID("HkApply")).disabled = true;
      const results = [];
      try {
        await Graph.ensureScopes(Graph.SCOPES.profiles);
        for (const p of hkPlanned) {
          if (p.refused) { results.push({ ...p, outcome: "skipped", detail: p.refused }); continue; }
          try {
            // the tenant may have moved since the dry run: read THIS one again
            prog(`${p.name} — checking again…`);
            const f = await hkFresh(p);
            if (f.refused) { results.push({ ...p, outcome: "skipped", detail: `${f.refused} (at delete time)` }); continue; }
            const url = `${Graph.BETA}${p.path}/${encodeURIComponent(p.id)}`;
            prog(`${p.name} — deleting…`);
            await Graph.del(url, { scopes: Graph.SCOPES.profiles });
            let back = null;
            try { back = await Graph.readOne(url, { scopes: Graph.SCOPES.config }); } catch { back = null; }
            if (back) throw new Error("the delete returned, but the policy still reads back — check the portal");
            results.push({ ...p, outcome: "deleted", detail: "verified gone" });
          } catch (e) {
            results.push({ ...p, outcome: "failed", detail: String((e && e.message) || e) });
          }
        }
        prog("");
        const good = results.filter((r) => r.outcome === "deleted").length, bad = results.filter((r) => r.outcome === "failed").length;
        $(ID("HkResult")).innerHTML = `
          <p class="mini" style="margin:0 0 6px"><b>${good} deleted</b>${bad ? ` · <b style="color:var(--off)">${bad} failed</b>` : ""} — re-reading the tenant.</p>
          ${results.filter((r) => r.outcome !== "deleted").map((r) => `<div class="gu-fail"><b>${esc(r.name)}</b><span class="why">${esc(r.detail)}</span></div>`).join("")}`;
        if (typeof PolicyCache !== "undefined") PolicyCache.invalidate();
        hkPlanned = null; hkPlanKey = null;
        rereadAfter(`🧹 Housekeeping: <b>${good} deleted</b>${bad ? `, <b style="color:var(--off)">${bad} failed</b>` : ""}`);
      } catch (e) {
        prog("");
        $(ID("HkResult")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const ap = $(ID("HkApply")); if (ap) ap.disabled = false; syncHkBar(); }
    }

    async function dryRun() {
      if (running) return;
      const c = activeCatalog();
      if (!c) return;
      running = true; $(ID("Dry")).disabled = true; $(ID("Plan")).innerHTML = "";
      try {
        // WHAT THE COMPARISON CALLS MISSING OR OUTDATED (10576) — not the whole
        // catalog. A policy matched by token, name or content is present,
        // whatever it is called here; creating it again would make a copy.
        const wanted = cmp && cmp.catalog === c ? new Set(cmp.rows.filter((r) => r.baseline && (r.status === "missing" || r.status === "outdated")).map((r) => r.key)) : null;
        const { entries, filters, refused } = E.importEntries(c, wanted);
        if (!entries.length && !filters.length) { $(ID("Plan")).innerHTML = wanted && !wanted.size ? `<p class="mini" style="margin:0"><b>Nothing to create</b> — the comparison found every baseline policy present, by token, name or content.</p>` : `<div class="gu-fail"><b>Nothing importable.</b><span class="why">${refused.length ? esc(refused[0].why) : "The catalog carries no policy bodies."}</span></div>`; return; }
        prog("Checking what already exists…");
        await Graph.ensureScopes(Graph.SCOPES.config);
        const names = entries.length ? await Restore.existingNames([...new Set(entries.map((x) => x.area))], (m) => prog(m)) : {};
        planned = entries.length ? Restore.plan(entries, names) : [];
        let haveFilters = new Set();
        if (filters.length) {
          prog("Reading the tenant's assignment filters…");
          try { haveFilters = new Set((await Filters.list()).map((f) => String(f.displayName || "").toLowerCase())); }
          catch (e) { throw new Error(`The tenant's filters could not be read (${(e && e.message) || e}) — the filter half of the plan would be a guess, so there is no plan.`); }
        }
        plannedFilters = filters.map((f) => ({ ...f, collided: haveFilters.has(String(f.body.displayName).toLowerCase()) }));
        prog("");
        const rows = [
          ...planned.map((p) => `<tr><td class="mini"><b>${esc(p.target)}</b></td><td class="mini">${esc(Restore.AREA_INFO[p.area].label)}</td><td class="mini${p.collided ? '" style="color:var(--off)' : ""}">${p.collided ? "skip — a policy already wears this name" : "create, unassigned"}</td></tr>`),
          ...plannedFilters.map((f) => `<tr><td class="mini"><b>${esc(f.body.displayName)}</b></td><td class="mini">Assignment filter (T14's create)</td><td class="mini${f.collided ? '" style="color:var(--off)' : ""}">${f.collided ? "skip — a filter already wears this name" : "create"}</td></tr>`),
        ].join("");
        const nCreate = planned.filter((p) => !p.collided).length + plannedFilters.filter((f) => !f.collided).length;
        const nSkip = planned.filter((p) => p.collided).length + plannedFilters.filter((f) => f.collided).length;
        $(ID("Plan")).innerHTML = `
          <p class="mini" style="margin:0 0 8px"><b>${nCreate} to create</b> · ${nSkip} already present (the collision stop — present is the point, not a problem)${refused.length ? ` · ${refused.length} not importable (${esc(refused[0].why)})` : ""}${wanted ? ` · ${c.policies.length - wanted.size} of ${c.policies.length} left alone — the comparison found them present` : ""}</p>
          <div class="gu-tw"><table class="cg-table"><thead><tr><th>Baseline policy</th><th style="width:200px">Path</th><th style="width:220px">Operation</th></tr></thead><tbody>${rows}</tbody></table></div>
          ${nCreate ? `<div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="${ID("Apply")}">✍ Create ${nCreate} object${nCreate === 1 ? "" : "s"} <span class="tag block">writes to the tenant</span></button></div>` : ""}
          <div id="${ID("Result")}" style="margin-top:10px"></div>`;
        const ap = $(ID("Apply"));
        if (ap) ap.addEventListener("click", apply);
      } catch (e) {
        prog("");
        $(ID("Plan")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const d = $(ID("Dry")); if (d) d.disabled = false; }
    }

    async function apply() {
      if (running || (!planned && !plannedFilters)) return;
      running = true; $(ID("Apply")).disabled = true;
      try {
        await Graph.ensureScopes(Graph.SCOPES.profiles);
        const results = planned && planned.length ? await Restore.apply(planned, (m) => prog(m)) : [];
        const filterResults = [];
        for (const f of plannedFilters || []) {
          if (f.collided) { filterResults.push({ target: f.body.displayName, outcome: "skipped", detail: "name existed at dry run" }); continue; }
          try {
            prog(`${f.body.displayName} — creating the filter…`);
            await Filters.create(f.body);
            filterResults.push({ target: f.body.displayName, outcome: "created", detail: "verified by read-back" });
          } catch (e) {
            filterResults.push({ target: f.body.displayName, outcome: "failed", detail: String((e && e.message) || e) });
          }
        }
        prog("");
        const all = [...results, ...filterResults];
        const good = all.filter((r) => r.outcome === "created").length;
        const bad = all.filter((r) => r.outcome === "failed").length;
        const failedHtml = all.filter((r) => r.outcome === "failed").map((r) => `<div class="gu-fail"><b>${esc(r.target || "")}</b><span class="why">${esc(r.detail || "")}</span></div>`).join("");
        $(ID("Result")).innerHTML = `
          <p class="mini" style="margin:0 0 6px"><b>${good} created</b>${bad ? ` · <b style="color:var(--off)">${bad} failed</b>` : ""} — everything unassigned; ✏️ the Assignment editor is where reach begins. Re-reading the tenant…</p>${failedHtml}`;
        if (typeof PolicyCache !== "undefined") PolicyCache.invalidate();
        planned = null; plannedFilters = null;
        lastWrite = { failedHtml };
        mode = "compare";   // the fresh comparison is the point of the re-read; failures stay on the Import pane
        rereadAfter(`📥 Import: <b>${good} created</b>${bad ? `, <b style="color:var(--off)">${bad} failed</b> (listed under Import)` : ""}, unassigned`);
      } catch (e) {
        prog("");
        $(ID("Result")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
        const ap = $(ID("Apply")); if (ap) ap.disabled = false;
      } finally { running = false; }
    }

    // ---- read: through the shared cache, T19's shape ----
    // note: a line kept on the source note through the re-read — the
    // outcome of the write that caused it, so a fresh comparison never
    // silently replaces "15 created"
    async function run(attach, note) {
      if (running) return;
      running = true; $(ID("Run")).disabled = true; $(ID("Body")).innerHTML = "";
      try {
        await ensureCatalogs();
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
        land(r, note ? `${note} — re-read at ${esc(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }))}, so the comparison below is the tenant as it is now.` : attach ? srcNote() : "");
      } catch (e) {
        prog("");
        $(ID("Body")).innerHTML = `<div class="gu-fail"><b>The read failed.</b><span class="why">${esc((e && e.message) || e)}</span></div>`;
      } finally { running = false; $(ID("Run")).disabled = false; }
    }
    // AFTER A WRITE, THE TENANT IS RE-READ (build 10573 — Mihai: "just did a
    // create missing… nothing changes, still saying missing"). Invalidating
    // the cache is not enough: the screen kept comparing the read it had.
    // ENCA's Baseline Policies re-reads after its import for the same reason.
    // `running` is still held by the write when this is scheduled, so it
    // waits a tick for the write to let go.
    const rereadAfter = (note) => { setTimeout(() => { if (!running) run(false, note); }, 0); };
    const srcNote = () =>
      `From ${PolicyCache.fromSignIn() ? "the sign-in read" : "the shared read"} at ${esc(PolicyCache.timeLabel())} — ${esc(spec.readLabel)} re-reads.`;

    // the "autocheck" (ENCA's: compare on open, no button) — a cached read
    // is compared the moment the screen shows; the baseline renders regardless
    // the catalogs come from the site itself, once — the first open waits
    // for them (a same-origin read, cached after that), so the baseline is
    // still always shown, a moment later than when it rode a <script> tag
    function ensureCatalogs() {
      if (catalogsLoaded) return catalogsLoaded;
      catalogsLoaded = E.loadCatalogs(typeof APP_BUILD !== "undefined" ? APP_BUILD.build : "").then((r) => {
        catalogErrors = r.errors || [];
        recompare();
        return r;
      });
      return catalogsLoaded;
    }
    async function onShow() {
      if (res || running) return;
      $(ID("Body")).innerHTML = `<p class="mini muted" style="margin:0">Reading the catalogs from ${esc(spec.catalogPath)} and ${esc(spec.communityPath)}…</p>`;
      await ensureCatalogs();
      if (res || running) return;
      const c = PolicyCache.get();
      if (c) { land(c, srcNote()); return; }
      if (PolicyCache.reading()) { run(true); return; }
      render();
    }

    function init() {
      if (!$(ID("Run"))) return;
      (window.TunoScreenHooks = window.TunoScreenHooks || {})[spec.screen] = onShow;
      $(ID("Run")).addEventListener("click", () => run(false));
      $(ID("Seg")).addEventListener("click", (e) => {
        const b2 = e.target.closest(`[data-${P}mode]`);
        if (!b2 || b2.dataset[`${P}mode`] === mode) return;
        mode = b2.dataset[`${P}mode`];
        render();
      });
      renderSeg();
    }

    return {
      init,
      // r: collect result · c: a CloudFellows catalog (or null for the bundled one) · m: mode · k: catalog id
      _setForTest: (r, c, m, k) => { fileCat = c || null; mode = m || "compare"; catId = k || null; land(r, ""); },
      _catalogsForTest: (b, c) => { E.setBundled(b); E.setCommunity(c); catalogsLoaded = Promise.resolve({}); },
    };
  }

  return { engine, screen, esc };
})();

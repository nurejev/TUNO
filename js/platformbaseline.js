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
      // Schema 2 writes the release as the string it is read as — "R26.6".
      // Schema 1 wrote "26.6", and the first macOS catalog a bare month.
      // All three shapes read as one release here, so an old file still
      // compares correctly against a new one.
      if (typeof rel === "string") {
        const m = /^\s*R?(\d{2})\.(\d{1,2})\s*$/i.exec(rel);
        if (m) return { y: +m[1], m: +m[2] };
      }
      return releaseOf(name);
    };
    const relCmp = (a, b) => (a.y - b.y) || (a.m - b.m);
    const currentRelease = () => { const d = new Date(); return { y: d.getUTCFullYear() % 100, m: d.getUTCMonth() + 1 }; };
    // "v3.7" — and, leniently, the typos seen on cloudfellows.dev (10586):
    // "v.3.7", "vv3.6.1"; the stamp writes the clean form back
    const versionOf = (name) => {
      const t = String(name || "").trim();
      const end = /v{1,2}\.?\s?(\d+(?:\.\d+)*)\s*$/i.exec(t);
      if (end) return end[1];
      const any = /\bv(\d+(?:\.\d+)+)\b/i.exec(t);
      return any ? any[1] : null;
    };
    // the CloudFellows convention: the platform prefix AND an Ryy.m tag
    const looksBaseline = (name) => spec.prefixRe.test(name || "") && releaseOf(name) != null;
    const keyOf = (name) => String(name || "")
      .replace(/-?\s*\bR\d{2}\.\d{1,2}\b\s*/gi, " ")
      .replace(/-?\s*v{1,2}\.?\s?\d+(?:\.\d+)*\s*$/i, " ")
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

    // ================================================================
    // THE CANONICAL BODY — ONE CLEANER, ONE HASH (§6.2, findings 5 and 9)
    // ================================================================
    // Until build 10589 there were THREE cleaners that all meant "the
    // policy without the tenant's bookkeeping on it": cleanBody() for a
    // community import, the delete-list in buildExport() for the catalog,
    // and defIdsOf()'s META set for the diff. Three rules for one idea is
    // three chances to disagree — and they did: the catalog kept
    // `createdDateTime` and `settingCount`, which is tenant metadata
    // published in a repository (finding 5), while the diff quietly
    // ignored both.
    //
    // canonicalBody(section, body) is now that one rule. The content hash,
    // the content diff, the export cleaner and the tests all read it, so a
    // field that leaks into the catalog changes the hash and the test that
    // recomputes the hash says so.
    //
    // WHAT COMES OFF, AND WHY:
    //   the tenant's bookkeeping — id, createdDateTime, lastModifiedDateTime,
    //     version (Graph's own row counter, not our vX.Y.Z), assignments,
    //     roleScopeTagIds, supportsScopeTags, priority, isAssigned,
    //     settingCount, creationSource and the rest of the reporting fields
    //   the READING's annotations — @odata.context/etag/count/id/editLink and
    //     the navigation links, the #microsoft.graph.* action stubs
    //   the TEMPLATE's bookkeeping — templateDisplayVersion, and the
    //     settingInstance/settingValue template references, which name the
    //     template revision the tenant happened to author against
    //   THE NAME AND THE DESCRIPTION. This is the one that looks wrong and
    //     is the whole point: "two policies with the same hash are the same
    //     CONTENT, whatever they are called" (§2). A renamed copy has to
    //     hash the same or Housekeeping cannot find it, and a community
    //     policy re-named on the tenant has to hash the same or Compare
    //     cannot match it. The name is the KEY's job, not the hash's.
    //   nulls, everywhere — Graph answers null for properties a profile
    //     does not use, and a body that omits them is the same policy.
    //
    // WHAT STAYS: @odata.type (it says what kind of profile this is — the
    // anchor the similarity match uses), and for scripts the script itself,
    // decoded from base64 and with its line endings normalised so the same
    // script saved on Windows and on a Mac is one script.
    const CANON_DROP = new Set([
      "id", "name", "displayName", "description",
      "createdDateTime", "lastModifiedDateTime", "version", "assignments",
      "roleScopeTagIds", "supportsScopeTags", "priority", "isAssigned",
      "settingCount", "creationSource", "priorityMetaData", "inventorySyncStatus",
      "deviceReporting", "newUpdates", "driverInventories", "lastModifiedBy",
      "settingInstanceTemplateReference", "settingValueTemplateReference",
      "templateDisplayVersion", "displayVersion",
    ]);
    const isAnnotation = (k) => /@odata\.(context|etag|count|id|editLink|nextLink|associationLink|navigationLink)$/i.test(k)
      || (/@odata\.type$/i.test(k) && k !== "@odata.type")   // a PROPERTY's type annotation, not the object's
      || k.startsWith("#");
    // base64 in, text out — and the same text whatever wrote it. A script
    // whose content cannot be decoded is kept as it came, so a change to it
    // still changes the hash.
    const decodeScript = (v) => {
      const s = String(v ?? "");
      if (!s) return "";
      let text = s;
      try {
        const dec = (typeof atob === "function") ? atob(s)
          : (typeof Buffer !== "undefined") ? Buffer.from(s, "base64").toString("utf8") : null;
        if (dec !== null && /^[A-Za-z0-9+/\r\n=]+$/.test(s)) text = dec;
      } catch { /* not base64 — compare what is there */ }
      return text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
    };
    function canonValue(v) {
      if (Array.isArray(v)) return v.map(canonValue).filter((x) => x !== undefined);
      if (v && typeof v === "object") {
        const out = {};
        for (const k of Object.keys(v).sort()) {
          if (CANON_DROP.has(k) || isAnnotation(k)) continue;
          const cv = canonValue(v[k]);
          if (cv === undefined) continue;
          out[k] = cv;
        }
        return out;
      }
      return (v === null || v === undefined) ? undefined : v;
    }
    function canonicalBody(section, body) {
      const src = body || {};
      const out = canonValue(src) || {};
      if (src["@odata.type"]) out["@odata.type"] = src["@odata.type"];   // the anchor survives the drop list
      if (section === "settingsCatalog") {
        const list = Array.isArray(src.settings) ? src.settings : [];
        out.settings = list
          .map((s) => canonValue((s && s.settingInstance) || s) || {})
          .filter((i) => i && i.settingDefinitionId)
          .sort((a, b) => String(a.settingDefinitionId).localeCompare(String(b.settingDefinitionId)));
        if (!out.settings.length) delete out.settings;
      } else if (section === "admx") {
        const list = Array.isArray(src.definitionValues) ? src.definitionValues : [];
        const dv = list.map(canonValue).filter(Boolean)
          .sort((a, b) => String((a.definition || {}).id || "").localeCompare(String((b.definition || {}).id || "")));
        if (dv.length) out.definitionValues = dv; else delete out.definitionValues;
      }
      if (src.scriptContent !== undefined) out.scriptContent = decodeScript(src.scriptContent);
      if (src.detectionScriptContent !== undefined) out.detectionScriptContent = decodeScript(src.detectionScriptContent);
      if (src.remediationScriptContent !== undefined) out.remediationScriptContent = decodeScript(src.remediationScriptContent);
      return out;
    }
    // Keys are already sorted by canonValue, so a plain stringify is stable.
    const canonicalJson = (section, body) => JSON.stringify(canonicalBody(section, body));
    // SHA-256 over that text. crypto.subtle is the browser's own — no
    // library, and the same digest the tests recompute.
    async function hashBody(section, body) {
      const text = canonicalJson(section, body);
      const subtle = (typeof crypto !== "undefined" && crypto.subtle) || null;
      if (!subtle) return "";                       // no subtle crypto: no hash, and the caller says so
      const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
      return "sha256:" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // Hash a list of { id, section, body } in one pass, answering a Map by
    // id. A body the read never fetched hashes to "" — unknown, never equal.
    async function hashAll(list) {
      const out = new Map();
      for (const p of list || []) {
        if (!p || !p.body) { out.set(p && p.id, ""); continue; }
        try { out.set(p.id, await hashBody(p.section, p.body)); }
        catch { out.set(p.id, ""); }
      }
      return out;
    }

    // The D/U token the convention carries, which is what Import reads to
    // pick a PRE-PILOT group (§8.3). It is a SEGMENT of the name, never a
    // letter found inside a word: "Win - SEC - Defender - D - Real-time …"
    // has one, "… - Update - …" does not.
    const duOf = (name) => {
      const seg = String(name || "").split(/\s+-\s+/).map((s) => s.trim().toUpperCase());
      return seg.includes("D") ? "D" : seg.includes("U") ? "U" : "";
    };

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

    // ---- SCHEMA 2, AND A LOADER THAT REFUSES (§7.3, finding 9) ----
    // Schema 1 checked two things: `kind` was a string it liked and
    // `policies` was an array. Everything else — the platform, which
    // catalog this claims to be, whether a policy's section is one this
    // tool can even write to, whether the bodies are the bodies that were
    // exported — was taken on trust from a JSON file that a person can
    // hand-edit and that Import creates policies from. That is the whole
    // of finding 9.
    //
    // Schema 2 answers all of it, and separates three things schema 1 ran
    // together in one "release: R26" string that was HARDCODED at export:
    //   release    — the newest Ryy.m among the exported policies, DERIVED,
    //                with releaseMix beside it so an accidental mix of cuts
    //                is visible rather than averaged away
    //   sourceDate — when the upstream a community catalog was cut from was
    //                itself published
    //   exported   — when this file was written
    //
    // A file that fails the shape checks is REFUSED WHOLE: no partial
    // load, first three reasons printed. A policy whose body does not
    // recompute to its own hash is not refused — the rest of the catalog
    // is honest — but that row is flagged `tampered` and can never be
    // imported, because a body edited after export is not the baseline.
    const CATALOG_SCHEMA = 2;
    const COMMUNITY_KIND = "tuno-community";
    const platformId = () => String(spec.platformId || spec.platform).toLowerCase();
    const catalogIds = () => [spec.catalogId, ...(spec.communityIds || [])].filter(Boolean);
    const sectionIds = () => spec.sections || [];
    function shapeErrors(c) {
      const e = [];
      if (!c || typeof c !== "object") { e.push("the file is not a JSON object"); return e; }
      if (c.schema !== CATALOG_SCHEMA) e.push(`schema is ${JSON.stringify(c.schema)}, this build reads schema ${CATALOG_SCHEMA} — re-cut the catalog with 🧬 Export`);
      if (c.kind !== spec.kind && c.kind !== COMMUNITY_KIND) e.push(`kind is ${JSON.stringify(c.kind)}, expected "${spec.kind}" or "${COMMUNITY_KIND}"`);
      if (String(c.platform || "").toLowerCase() !== platformId()) e.push(`platform is ${JSON.stringify(c.platform)} — this is the ${spec.platform} baseline`);
      if (!catalogIds().includes(c.catalogId)) e.push(`catalogId ${JSON.stringify(c.catalogId)} is not one this tool reads (${catalogIds().join(", ")})`);
      if (!Array.isArray(c.policies)) { e.push("there is no policies array"); return e; }
      const secs = sectionIds();
      c.policies.forEach((p, i) => {
        const where = `policy ${i + 1} (${String((p && p.name) || "unnamed").slice(0, 60)})`;
        if (!p || typeof p !== "object") { e.push(`${where}: not an object`); return; }
        if (!p.name) e.push(`${where}: no name`);
        if (secs.length && !secs.includes(p.section)) e.push(`${where}: section ${JSON.stringify(p.section)} is not one this tool covers`);
        if (p.body !== undefined && (!p.body || typeof p.body !== "object" || Array.isArray(p.body))) e.push(`${where}: body is not an object`);
      });
      return e;
    }
    // Recompute every hash the file carries. A row whose body no longer
    // matches its own hash is marked and refused for import from here on.
    async function verifyHashes(c) {
      let tampered = 0, unhashed = 0;
      for (const p of (c && c.policies) || []) {
        delete p.tampered;
        if (!p.body) { continue; }
        if (!p.hash) { unhashed++; continue; }
        const h = await hashBody(p.section, p.body);
        if (!h) { unhashed++; continue; }             // no subtle crypto — say nothing rather than accuse
        if (h !== p.hash) { p.tampered = true; p.importable = false; tampered++; }
      }
      return { tampered, unhashed };
    }
    // The one door every catalog comes through — the same-origin read, the
    // uploaded file and a freshly fetched community cut.
    async function loadCatalog(obj) {
      const errs = shapeErrors(obj);
      if (errs.length) {
        const err = new Error(errs.slice(0, 3).join(" · ") + (errs.length > 3 ? ` · (+${errs.length - 3} more)` : ""));
        err.errors = errs;
        throw err;
      }
      const seen = await verifyHashes(obj);
      obj.__verify = seen;
      return obj;
    }
    const setBundled = (c) => { bundledCat = (c && c.kind === spec.kind && Array.isArray(c.policies)) ? c : null; return bundledCat; };
    const setCommunity = (c) => { communityCat = (c && c.kind === COMMUNITY_KIND && Array.isArray(c.policies)) ? c : null; return communityCat; };
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
      // The site's own files go through the SAME loader an uploaded file
      // does (finding 9). A catalog committed to the repository is not
      // more trustworthy than one handed over — it is the same JSON, and
      // the last person to touch it was a script.
      const take = async (got, path, set, what) => {
        if (!got.cat) { errors.push(got.error); return; }
        try {
          const cat = await loadCatalog(got.cat);
          if (!set(cat)) errors.push(`${path} is not a ${what}`);
        } catch (e) { errors.push(`${path} was refused: ${(e && e.message) || e}`); }
      };
      await take(b, spec.catalogPath, setBundled, `${spec.platform} baseline catalog`);
      await take(c, spec.communityPath, setCommunity, "community catalog");
      return { bundled: bundledCat, community: communityCat, errors };
    }
    const isCommunity = (cat) => !!(cat && cat.kind === COMMUNITY_KIND);
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
    // An uploaded file: the same door, plus the convention check that only
    // a CloudFellows catalog owes (a community catalog wears its author's
    // names, which is the point of it).
    async function parseCatalog(text) {
      let j;
      try { j = JSON.parse(text); } catch { throw new Error("Not JSON — the baseline file is the tool's own export."); }
      const cat = await loadCatalog(j);
      if (cat.kind === spec.kind) {
        const rogue = (cat.policies || []).find((p) => !looksBaseline(p.name));
        if (rogue) throw new Error(`A catalog policy does not wear the convention: "${String(rogue.name || "(unnamed)").slice(0, 80)}"`);
      }
      return cat;
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
    async function buildExport(res, tenantName) {
      const policies = [], skipped = [];
      const surfaces = {};
      for (const sec of res.sections || []) {
        for (const it of sec.items || []) {
          if (!looksBaseline(it.name)) continue;
          const raw = (sec.raw || []).find((r) => String(r.id).toLowerCase() === String(it.id).toLowerCase()) || null;
          const area = AREA_OF_SECTION[sec.id] || null;
          if (!raw) { skipped.push({ name: it.name, why: "raw body not in the read — export from a cache-backed read" }); continue; }
          const body = Object.assign({}, raw);
          delete body.__detail; delete body.__detailError; delete body.__surface;
          if (sec.id === "settingsCatalog" && Array.isArray(raw.__detail)) body.settings = raw.__detail;
          if (sec.id === "admx" && Array.isArray(raw.__detail)) body.definitionValues = raw.__detail;
          const scriptNoBody = sec.id === "scripts" && !body.scriptContent;
          surfaces[sec.id] = (surfaces[sec.id] || 0) + 1;
          const rel = releaseOf(it.name);
          policies.push({
            key: keyOf(it.name), name: it.name,
            release: rel ? `R${rel.y}.${rel.m}` : "", version: versionOf(it.name),
            section: sec.id, sectionLabel: sec.label, area,
            du: duOf(it.name),
            // THE DESCRIPTION RIDES ON THE ROW, NOT IN THE BODY. It is not
            // content — two policies whose settings agree are the same
            // policy however they are described, and the hash has to say
            // so — but it is not disposable either: OpenIntuneBaseline
            // stamps its OIBID token into it, and an import that dropped
            // the token would create a policy OIB's own deployer could
            // never recognise again (§8.2). So it travels beside the body
            // and Import puts it back.
            description: String((body && body.description) || ""),
            // THE BODY IS CLEANED BEFORE IT IS PUBLISHED (finding 5). The
            // catalog goes into a public repository; the tenant's own ids,
            // timestamps, assignments and scope tags are not the baseline
            // and have no business travelling with it. The hash is taken
            // over exactly what is written, so a test that recomputes it
            // catches a leak the moment one is reintroduced.
            body: canonicalBody(sec.id, body),
            importable: !!area && !scriptNoBody,
          });
        }
      }
      for (const p of policies) p.hash = await hashBody(p.section, p.body);
      policies.sort((a, b) => String(a.key).localeCompare(String(b.key)));
      // THE CATALOG HOLDS EACH IDENTITY ONCE — THE NEWEST (build 10574). A
      // re-cut kept beside its old copy on the baseline tenant is the
      // tenant's housekeeping, not a feature of the baseline: the newest
      // release+version is kept, the rest recorded as superseded so the
      // README and the data-file header can say what was left out. An
      // exact duplicate (same release and version) keeps the first seen.
      const { kept, superseded } = dedupeCatalog(policies);
      const dupKeys = superseded.map((x) => x.key);
      const { release, mix } = releaseOfSet(kept);
      return {
        file: {
          schema: CATALOG_SCHEMA,
          kind: spec.kind,
          platform: platformId(),
          catalogId: spec.catalogId,
          // DERIVED, NEVER HARDCODED (finding 9). Until 10589 this said
          // "R26" because a person typed it in 2026; a catalog cut in
          // January 2027 would still have said R26. The release is the
          // NEWEST Ryy.m the exported policies actually wear, and
          // releaseMix prints the distribution beside it — so an
          // accidental mix ("R26.6 ×80, R26.4 ×2") is a thing you can see
          // rather than an average that hides it.
          release,
          releaseMix: mix,
          sourceDate: "",                    // a CloudFellows cut has no upstream to date
          exported: new Date().toISOString(),
          tenant: tenantName || "",
          build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
          surfaces,
          policies: kept,
        },
        skipped,
        duplicateKeys: dupKeys,
        superseded,
      };
    }
    // The newest release worn by a set, with the census beside it.
    function releaseOfSet(list) {
      const mix = {};
      let best = null;
      for (const p of list || []) {
        const r = normRel(p.release, p.name);
        if (!r) continue;
        const label = `R${r.y}.${r.m}`;
        mix[label] = (mix[label] || 0) + 1;
        if (!best || relCmp(r, best) > 0) best = r;
      }
      return { release: best ? `R${best.y}.${best.m}` : "", mix };
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
      // THE PER-POLICY FILE IS THE ROW, NOT ONLY THE BODY (build 10589).
      // The canonical body has no name in it — that is deliberate, it is
      // what lets a renamed copy hash the same — so a file holding only
      // the body would be an anonymous blob whose identity lived in its
      // filename. These files exist to be read and diffed in the
      // repository, so each one says what it is: the name, key, release,
      // version, surface, D/U token and the hash, then the body.
      for (const p of file.policies) {
        files[`${dir}/${SECTION_DIR[p.section] || p.section}/${safeFile(p.name)}.json`] = JSON.stringify({
          name: p.name, key: p.key, release: p.release, version: p.version,
          section: p.section, sectionLabel: p.sectionLabel, area: p.area, du: p.du,
          description: p.description || "", importable: p.importable, hash: p.hash, body: p.body,
        }, null, 2) + "\n";
      }
      files[`${dir}/catalog.json`] = JSON.stringify(file, null, 1) + "\n";
      const L = [];
      const mix = Object.entries(file.releaseMix || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(", ");
      L.push(`# CloudFellows ${spec.platform} baseline — ${file.release || "(no release tag)"}`, "");
      L.push(`Exported from **${file.tenant || "the reference tenant"}** on ${file.exported.slice(0, 10)} by TUNO ${file.build} (🧬 Export on the reference tenant, the cfdev convention). ${file.policies.length} policies, each identity once — the newest release and version.`, "");
      // THE RELEASE IS DERIVED, AND THE MIX IS PRINTED (finding 9). "R26.6"
      // is the newest cut any exported policy wears, not a number somebody
      // typed; the census beside it is how an accidental mix of cuts
      // becomes visible instead of being averaged into one label.
      L.push(`Schema ${file.schema} · catalog \`${file.catalogId}\` · release **${file.release || "—"}** derived from the policies themselves${mix ? ` (${mix})` : ""}. Every body is the canonical body — the tenant's ids, timestamps, assignments and scope tags are stripped before export — and every policy carries the SHA-256 of that body, which the loader recomputes on read.`, "");
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
        `Cut verbatim from ${cat.url}${cat.commit ? ` at commit \`${cat.commit}\`` : ""}${cat.release ? ` (release ${cat.release}${cat.sourceDate ? `, published ${cat.sourceDate}` : ""})` : ""} by ${cat.author || "the community"}. ${cat.policies.length} policies, names and descriptions the author's own${cat.idToken ? `, each carrying its \`${cat.idToken}\`` : ""}.`, "",
        `Schema ${cat.schema} · catalog \`${cat.catalogId}\` · read into this repository on ${String(cat.exported || "").slice(0, 10)}. Three dates, never one string: \`release\` is the author's own version, \`sourceDate\` is when THEIR cut was published, \`exported\` is when it was read here. Every body is the canonical body and carries the SHA-256 the loader recomputes.`, "",
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
      scripts: null,   // its own surface, stamped by the read
      updates: null,
    };
    const deletePathFor = (p) => (p.section in DELETE_PATH) ? (DELETE_PATH[p.section] || p.surface || null) : null;
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
          rel: releaseOf(p.name), ver: versionOf(p.name), path: deletePathFor(p),
          refused: nAsg(p) ? `assigned to ${nAsg(p)} target${nAsg(p) === 1 ? "" : "s"} — move the reach to the kept copy in ✏️ the editor first` : !deletePathFor(p) ? `its surface (${p.sectionLabel || p.section}) has no delete path here — retire it in the portal` : "",
        }));
        groups.push({ key: k, keep, keepRel: releaseOf(keep.name), keepVer: versionOf(keep.name), keepAssignments: nAsg(keep), retire });
      }
      groups.sort((a, b) => String(a.key).localeCompare(String(b.key)));
      return groups;
    }

    // ---- import entries: three roads, each honest about itself ----
    function importEntries(cat, wanted) {
      const entries = [], filters = [], refused = [];
      // The canonical body has no name and no description in it (§6.2), so
      // the create body is rebuilt here: the body as published, plus the
      // description the row carried — Restore.bodyFor stamps the name.
      const createBody = (p) => Object.assign({}, p.body, p.description ? { description: p.description } : {});
      for (const p of cat.policies) {
        if (wanted && !wanted.has(keyOf(p.name))) continue;
        if (p.tampered) {
          refused.push({ name: p.name, why: "its body does not match the hash the catalog carries — edited after export, so it is not the baseline" });
          continue;
        }
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
            displayName: p.name,
            description: p.description || "",
            platform: p.body.platform,
            rule: p.body.rule,
            ...(p.body.assignmentFilterManagementType ? { assignmentFilterManagementType: p.body.assignmentFilterManagementType } : {}),
          } });
          continue;
        }
        if (!p.area) { refused.push({ name: p.name, why: `its surface (${p.sectionLabel || p.section || "unknown"}) has no create path here` }); continue; }
        entries.push({ area: p.area, entry: { area: p.area, name: p.name, obj: createBody(p), sourceId: "" }, newName: p.name });
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
    async function buildCommunity(parsed, meta) {
      const m = parsed.manifest || null;
      const byId = new Map((m ? m.policies : []).map((p) => [String(p.oibId || "").toUpperCase(), p]));
      const surfaces = {};
      const policies = parsed.policies.map((u) => {
        const mp = u.oibId ? byId.get(u.oibId) : null;
        const section = SECTION_OF_KIND[u.kind];
        surfaces[section] = (surfaces[section] || 0) + 1;
        return {
          name: u.name, key: keyOf(u.name), version: versionOf(u.name), release: null,
          section, sectionLabel: LABEL_OF_KIND[u.kind], area: AREA_OF_KIND[u.kind],
          du: duOf(u.name),
          // the author's own description, token and all — off the body so
          // the hash is content, on the row so Import can put it back
          description: String((u.body && u.body.description) || ""),
          importable: !!AREA_OF_KIND[u.kind],
          kind: u.kind, folder: u.folder, path: u.path,
          ...(u.oibId ? { oibId: u.oibId } : {}),
          ...(mp ? { scope: mp.scope || "", addedIn: mp.addedIn || "", status: mp.status || "", licenseRequirements: mp.licenseRequirements || "", skuRequirements: mp.skuRequirements || "" } : {}),
          body: canonicalBody(section, u.body),
        };
      }).sort((a, b) => String(a.key).localeCompare(String(b.key)));
      for (const p of policies) p.hash = await hashBody(p.section, p.body);
      return {
        schema: CATALOG_SCHEMA,
        kind: COMMUNITY_KIND,
        platform: platformId(),
        catalogId: spec.upstream.id,
        id: spec.upstream.id,
        label: spec.upstream.label, icon: spec.upstream.icon, author: spec.upstream.author,
        url: spec.upstream.url, importerUrl: spec.upstream.importerUrl || null,
        nameRe: spec.upstream.nameRe || null, idToken: spec.upstream.idToken || null,
        // three fields, not one string (finding 9): the author's own
        // release, the day THEIR cut was published, and when we read it
        release: (m && m.oibVersion) || (meta && meta.release) || "",
        sourceDate: (m && m.generatedDate) || (meta && meta.sourceDate) || "",
        commit: (meta && meta.commit) || "",
        exported: new Date().toISOString(),
        build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
        surfaces,
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
    const stampRelease = (name, rel) => String(name).replace(/\s*-\s*v{1,2}\.?\s?(\d+(?:\.\d+)*)\s*$/i, (m, v) => ` - R${rel.y}.${rel.m} - v${v}`);
    // where a rename is written, per surface — the same endpoints restore
    // creates on; filters go through T14's own update
    // Sections that fold several endpoints into one list carry the surface
    // each item came from (the read stamps it, 10586) — the write goes back
    // where the item lives. Derived types (device configurations, enrolment
    // configurations, Autopilot profiles) PATCH with their @odata.type.
    const RENAME_PATH = {
      settingsCatalog: { endpoint: "/deviceManagement/configurationPolicies", field: "name" },
      deviceConfigurations: { endpoint: "/deviceManagement/deviceConfigurations", field: "displayName", typed: true },
      compliance: { endpoint: "/deviceManagement/deviceCompliancePolicies", field: "displayName", typed: true },
      admx: { endpoint: "/deviceManagement/groupPolicyConfigurations", field: "displayName" },
      scripts: { endpoint: null, field: "displayName", bySurface: true },
      updates: { endpoint: null, field: "displayName", bySurface: true },
      enrolment: { endpoint: "/deviceManagement/deviceEnrollmentConfigurations", field: "displayName", typed: true },
      autopilot: { endpoint: "/deviceManagement/windowsAutopilotDeploymentProfiles", field: "displayName", typed: true },
      filters: { endpoint: null, field: "displayName", viaFilters: true },
    };
    // the concrete path for one policy: its section's, or its own surface
    function renamePathFor(p) {
      const base = RENAME_PATH[p.section] || null;
      if (!base) return null;
      if (base.bySurface) return p.surface ? { endpoint: p.surface, field: base.field, typed: false } : null;
      return { endpoint: base.endpoint, field: base.field, typed: !!base.typed, viaFilters: !!base.viaFilters };
    }
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
        const path = renamePathFor(p);
        out.push({ ...base, status: path ? "propose" : "nopath", ver, rel, proposed: stampRelease(p.name, rel), path, odataType: p.odataType || "",
          why: path ? "" : (RENAME_PATH[p.section] && RENAME_PATH[p.section].bySurface
            ? "the read did not say which endpoint this item came from — re-read the tenant (the surface rides along since build 10586)"
            : `its surface (${p.sectionLabel || p.section}) has no rename path here — rename it in the portal`) });
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
      L.push(`# ${spec.platform} baseline gap — ${mdEsc(tenantName || "tenant")} vs ${mdEsc(comm ? `${cat.label} ${cat.release}` : `the CloudFellows ${spec.platform} baseline ${cat.release || "(no release)"}`)}`, "");
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
      CATALOG_SCHEMA, COMMUNITY_KIND, canonicalBody, canonicalJson, hashBody, hashAll, duOf,
      shapeErrors, verifyHashes, loadCatalog, releaseOfSet,
      UPSTREAM_ZIP_URL, UPSTREAM_MIN_OVERLAP, defIdsOf, cleanBody, kindOf, parseUpstream, buildCommunity, communityAsUpstream,
      matchUpstream, proposeName, upstreamEntry, diffPolicies, upstreamMarkdown, toMd,
      releaseOfDate, stampRelease, RENAME_PATH, renamePathFor, renameProposals, fetchUpstream,
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

    // ---- SESSION STATE: EVERYTHING THIS TENANT TOLD US, IN ONE OBJECT ----
    // (T24/T27 design finding 1, build 10588.) Until now each of these was
    // a `let` of its own, and sign-out cleared none of them: PolicyCache
    // was emptied, but a screen that had already landed a read kept ITS
    // copy — the comparison, the plans, the fetched catalog, the upstream
    // rows — and went on rendering the previous tenant's policies to
    // whoever signed in next. On a consultancy laptop that is the wrong
    // customer's estate on the screen.
    //
    // So every field that came from A TENANT lives here, the object is
    // KEYED BY THE TENANT ID that produced it, and there is exactly one
    // place that says what tenant-derived state is: add a field to the
    // factory and sign-out drops it for free. Fields that are NOT
    // tenant-derived deliberately stay outside — `mode` and `catId` are
    // this person's place in the screen, `catalogsLoaded` is the site's
    // own baseline/ folder, and `running` is a re-entrancy latch.
    const blankSession = (tid) => ({
      tenantId: tid || "",
      res: null,             // the collect result (cache-served or fresh)
      cmp: null,             // compare() result
      fileCat: null,         // a loaded CloudFellows baseline file replaces the bundled slot
      fetchedCat: null,      // the community catalog fetched from github.com this session
      upstream: null,        // { rows, skipped, seenOther, when, parsed, from }
      planned: null, plannedFilters: null,
      hashes: null,          // policy id -> content hash, computed when the read lands
      upPlanned: null, upPlanKey: null,
      rnPlanned: null, rnPlanKey: null,
      hkPlanned: null, hkPlanKey: null,
      lastWrite: null,       // the last import's failures, shown on the Import pane after the re-read
      lastSource: "",
    });
    const currentTenantId = () => { const t = window.TunoTenant; return (t && t.tenantId && t.tenantId()) || ""; };
    let S = blankSession(currentTenantId());
    // The tenant changed under us (sign-out and back in, or the demo): the
    // state that named the old one is not adjusted, it is dropped.
    function reset() {
      S = blankSession(currentTenantId());
      mode = "compare";   // the acts a new tenant may not have are not left on the table
      for (const h of ["Body", "Upstream", "Rename", "Housekeeping"]) {
        const el = $(ID(h));
        if (el) { delete el.dataset.for; delete el.dataset.rows; delete el.dataset.order; el.innerHTML = ""; }
      }
      renderSeg();        // the rail names the tenant, so it is repainted with it
    }
    // A plan is a promise about ONE tenant. Apply re-asks before it writes:
    // between the dry run and the click somebody may have signed out and
    // into somewhere else, and the ids in the plan mean nothing there.
    const wrongTenant = () => S.tenantId !== currentTenantId();
    const tenantMovedHtml = () =>
      `<div class="gu-fail"><b>The signed-in tenant changed since this plan was made.</b><span class="why">The plan names ${esc(S.tenantId || "no tenant")}; this session is now ${esc(currentTenantId() || "signed out")}. Nothing was written — read this tenant and plan again.</span></div>`;
    // The reference-tenant gate is a UX gate, not a security boundary — but
    // the acts it hides still ask again at the click, because the pane may
    // have been drawn before the org read answered, or on a tenant that is
    // no longer the signed-in one.
    const refusedHtml = (act) =>
      `<div class="gu-fail"><b>${esc(act)} is refused here.</b><span class="why">It authors the baseline, so it runs on the reference tenant only, and this session is not on it. Nothing was written.</span></div>`;

    let mode = "compare";      // compare · export · import · upstream
    let catId = null;          // "cfdev" | "community" — which catalog the screen speaks for
    let running = false;
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
      for (const sec of (S.res && S.res.sections) || []) {
        const rawById = new Map((sec.raw || []).map((r) => [String(r.id).toLowerCase(), r]));
        for (const it of sec.items || []) {
          let body = null;
          const raw = rawById.get(String(it.id).toLowerCase()) || null;
          if (raw && BODY_SECTIONS.has(sec.id)) {
            body = Object.assign({}, raw); delete body.__detail; delete body.__detailError; delete body.__surface;
            if (sec.id === "settingsCatalog" && Array.isArray(raw.__detail)) body.settings = raw.__detail;
          }
          out.push({ id: it.id, name: it.name, section: sec.id, sectionLabel: sec.label, description: it.description || "", modified: it.modified || "", created: it.created || "", assignments: it.assignments || [], body,
            // The content hash of this policy as the tenant holds it —
            // computed ONCE when the read lands (crypto.subtle is async and
            // compare() is not), and carried on every view of it since.
            hash: (S.hashes && S.hashes.get(it.id)) || "",
            du: E.duOf(it.name),
            surface: (raw && raw.__surface) || "", odataType: (raw && raw["@odata.type"]) || "" });
        }
      }
      return out;
    };

    // ---- the two catalogs ----
    const cfCatalog = () => S.fileCat || E.bundled();
    const cfSource = () => S.fileCat ? "file" : E.bundled() ? "bundled" : "";
    // the community catalog: fetched from github.com this session (10572),
    // else the bundle
    const communityCatalog = () => S.fetchedCat || E.community();
    const catalogs = () => {
      const out = [];
      const cf = cfCatalog();
      if (cf) out.push({ id: "cfdev", cat: cf, icon: "🧬", label: `CloudFellows ${cf.release || "(no release)"}`, sub: cfSource() === "file" ? "loaded file" : "bundled" });
      const co = communityCatalog();
      if (co) out.push({ id: "community", cat: co, icon: co.icon || "🧩", label: `${co.label}${co.release ? ` v${co.release}` : ""}`, sub: S.fetchedCat ? "fetched from github.com" : "community" });
      return out;
    };
    function activeCatalog() {
      const list = catalogs();
      if (!list.length) return null;
      if (!catId || !list.some((c) => c.id === catId)) catId = list[0].id;
      return list.find((c) => c.id === catId).cat;
    }
    const recompare = () => { const c = activeCatalog(); S.cmp = (S.res && c) ? E.compare(vms(), c) : null; };

    async function land(r, sourceNote) {
      // The read names the tenant it came from. Everything downstream —
      // every plan, every ceremony — inherits that name from here.
      S.tenantId = currentTenantId();
      S.res = r;
      // HASH THE TENANT ONCE, HERE (§6.2). crypto.subtle is asynchronous
      // and compare(), housekeeping() and the diff are not — so this is
      // the one await, taken where the read lands, and every later view
      // reads the answer off the session rather than recomputing it.
      S.hashes = await E.hashAll(vms());
      const rh = $(ID("Rename")); if (rh) { delete rh.dataset.for; rh.innerHTML = ""; }
      const hh = $(ID("Housekeeping")); if (hh) { delete hh.dataset.for; hh.innerHTML = ""; }
      recompare();
      render(sourceNote);
    }

    // WHICH TENANT THIS RAIL IS TALKING ABOUT (design §4, build 10588).
    // The acts below it create, rename and delete policies; the one thing
    // the rail owes the person reading it is that they never have to guess
    // whose tenant that is. So the identity sits at the top of the rail —
    // the org name, the immutable tenant ID under it, and the `reference
    // tenant` badge when this is the tenant that authors the baseline.
    //
    // The ID is not decoration. It is the value CFDEV_TENANT_IDS wants
    // (js/app.js, finding 7): sign in to cloudfellows.dev, read the GUID
    // here, paste it there, and the display-name half of the gate goes.
    function tenantLine() {
      const t = window.TunoTenant || {};
      const gate = (t.gate && t.gate()) || { on: false, by: "name", id: "", name: "", domain: "" };
      const who = gate.name || gate.domain || "";
      return `<div class="ep-node" style="cursor:default;align-items:flex-start;flex-direction:column;gap:2px" aria-hidden="true">
        <span class="mini" style="font-weight:600">${who ? esc(who) : `<span class="muted">not signed in</span>`}</span>
        <span class="mini muted" style="word-break:break-all;font-family:var(--mono,monospace)" title="The tenant's immutable Entra ID — what the reference-tenant gate compares, and what this screen's session state is keyed on">${gate.id ? esc(gate.id) : "—"}</span>
        ${gate.on ? `<span class="gu-how inc" title="${gate.by === "id"
          ? "Matched on the immutable tenant ID — a display name cannot claim this."
          : "Matched on the UPN domain and org display name, because CFDEV_TENANT_IDS in js/app.js is still empty. Paste the ID above into it to close the gate."}">reference tenant${gate.by === "id" ? "" : " (by name)"}</span>` : ""}
      </div>`;
    }

    // The rail: each node carrying the state of its act.
    function renderSeg() {
      const el = $(ID("Seg"));
      if (!el) return;
      const c = activeCatalog();
      const node = (k, icon, label, right, bad) => `<div class="ep-node${mode === k ? " active" : ""}" data-${P}mode="${k}" role="button" tabindex="0">
        <span>${icon} ${label}</span><span class="mini" style="margin-left:auto;white-space:nowrap${bad ? ";color:var(--off)" : ""}">${right}</span></div>`;
      const worst = S.cmp ? (S.cmp.counts.missing || 0) + (S.cmp.counts.outdated || 0) + (S.cmp.counts.differs || 0) : null;
      const upBad = S.upstream ? S.upstream.rows.filter((r) => r.status !== "same").length : null;
      const rn = S.res ? E.renameProposals(vms(), communityCatalog()).filter((r) => r.status === "propose").length : null;
      const hk = S.res ? E.housekeeping(vms()).reduce((a, g) => a + g.retire.length, 0) : null;
      el.innerHTML = [
        tenantLine(),
        node("compare", spec.icon, "Compare", S.cmp ? (worst ? `${worst} to fix` : "in step") : c ? `${c.policies.length}` : "—", worst > 0),
        ...(isCfdev() ? [node("export", "🧬", "Export", S.res ? "ready" : "read first", false)] : []),
        node("import", "📥", "Import", c ? `${c.policies.length}` : "no catalog", !c),
        ...(isCfdev() ? [node("upstream", spec.upstream.icon, "Upstream", S.upstream === null ? "fetch or load" : upBad ? `${upBad} to review` : "covered", upBad > 0)] : []),
        ...(isCfdev() ? [node("rename", "✏️", "Rename", S.res ? (rn ? `${rn} to stamp` : "all stamped") : "read first", rn > 0)] : []),
        ...(isCfdev() ? [node("housekeeping", "🧹", "Housekeeping", S.res ? (hk ? `${hk} old cop${hk === 1 ? "y" : "ies"}` : "tidy") : "read first", hk > 0)] : []),
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
        return `<p class="mini muted" style="margin:0 0 10px">Community baseline: <b>${esc(c.label)}${c.release ? ` v${esc(c.release)}` : ""}</b>${c.sourceDate ? ` (${esc(c.sourceDate)})` : ""} by ${esc(c.author || "the community")} — <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(String(c.url).replace(/^https?:\/\//, ""))}</a>${c.commit ? ` @ ${esc(String(c.commit).slice(0, 7))}` : ""} · ${c.policies.length} policies, names kept verbatim${c.idToken ? `, identified by their ${esc(c.idToken)} first` : ""}.${c.importerUrl ? ` The author's own deployer: <a href="${esc(c.importerUrl)}" target="_blank" rel="noopener">${esc(String(c.importerUrl).replace(/^https?:\/\//, ""))}</a>.` : ""}
          ${S.fetchedCat ? `<b>Fetched from github.com this session</b>${bundle ? ` — the bundle is v${esc(bundle.release || "?")} @ ${esc(String(bundle.commit || "").slice(0, 7))}` : ""}. <button class="btn sm" id="${ID("FetchRevert")}">↩ Back to the bundle</button>` : `<button class="btn sm" id="${ID("Fetch")}" title="Read the repository directly — two GitHub API calls and one raw read per policy, no token, no zip">🌐 Fetch the latest from github.com</button>`}
          <span class="mini" id="${ID("FetchNote")}"></span></p>`;
      }
      return `<p class="mini muted" style="margin:0 0 10px">Catalog: <b>${esc(c.release || "(no release)")}</b>${c.releaseMix && Object.keys(c.releaseMix).length > 1 ? ` <span class="gu-how priv" title="The release is the newest cut any policy in this catalog wears; more than one cut is present, and this is the census">${esc(Object.entries(c.releaseMix).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} \u00d7${n}`).join(", "))}</span>` : ""} · ${c.policies.length} policies · ${cfSource() === "file" ? `loaded from a file${c.tenant ? ` (exported from ${esc(c.tenant)}${c.exported ? `, ${esc(String(c.exported).slice(0, 10))}` : ""})` : ""}` : `the bundled reference export${c.tenant ? ` from ${esc(c.tenant)}` : ""}${c.exported ? ` (${esc(String(c.exported).slice(0, 10))})` : ""}`}.</p>`;
    }

    const CFDEV_ONLY = new Set(["export", "upstream", "rename", "housekeeping"]);
    function render(sourceNote) {
      if (sourceNote) S.lastSource = sourceNote;
      if (CFDEV_ONLY.has(mode) && !isCfdev()) mode = "compare";
      const c = activeCatalog();
      renderSeg();
      const parts = [];
      if (S.lastSource) parts.push(`<p class="mini muted" style="margin:0 0 8px">${S.lastSource}</p>`);

      if (mode === "compare" || mode === "import") parts.push(catalogSeg());
      if (c) parts.push(catalogLine(c));
      else parts.push(`<div class="list-card"><p class="mini" style="margin:0">${isCfdev()
        ? `<b>No CloudFellows catalog could be read — and this is the tenant that makes it.</b> ${esc(spec.readLabel)}, ✏️ Rename what lacks its tag, 🧹 retire the old copies, then 🧬 Export → Repo folder: unzipped at the repo root it becomes ${esc(spec.catalogPath)}, the file this screen reads.`
        : `<b>No catalog could be read from ${esc(spec.catalogPath)}.</b> Load a baseline file under 📥 Import. Until a catalog is present this screen can only list which policies WEAR the convention, not judge them.`}${catalogErrors.length ? `<br><span class="mini muted">${catalogErrors.map(esc).join(" · ")}</span>` : ""}</p></div>`);

      const comm = E.isCommunity(c);
      const relver = (rel, ver) => comm ? (ver ? `v${esc(ver)}` : `<span class="muted">—</span>`) : `${esc(E.relLabel(rel))}${ver ? ` · v${esc(ver)}` : ""}`;

      if (mode === "compare") {
        if (S.cmp) {
          const card = (k) => {
            const st = E.STATUS[k], n = S.cmp.counts[k] || 0;
            if (!n && !["missing", "outdated", comm && !S.cmp.counts.ok ? "present" : "ok"].includes(k)) return "";
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
          parts.push(`<div class="list-card"><div class="tb-actions" style="margin:0 0 6px"><h4 style="margin:0;flex:1">The baseline, line by line (${S.cmp.covered} of ${S.cmp.baselineTotal} covered)</h4><button class="btn" id="${ID("Md")}" title="The gap, written down — ENCA's gap report, Intune-side-out">📝 Gap report (Markdown)</button></div>
            <p class="mini muted" style="margin:0 0 8px">${comm
              ? `The identity is ${c.idToken ? `the <b>${esc(c.idToken)}</b> token in the description first, then ` : ""}the name with the version stripped${c.nameRe ? "" : " (this baseline has no naming convention, so by name only an exact one counts)"}, then <b>the content</b> — a settings-catalog policy is its set of setting definition ids, a compliance or configuration policy the properties it configures; half-or-better overlap claims a policy whatever it is called, and its settings are then diffed value for value; versions compare segment-wise${c.policies.some((p) => p.version) ? "" : ", and a baseline that does not version its names is judged on presence alone"}. Worst first.`
              : `The identity is the NAME with the release tag and version stripped; releases compare first — R26.6 is June 2026, the year then the month — and versions break the tie. Worst first.`}</p>
            <div class="gu-tw"><table class="cg-table"><thead><tr><th>Baseline policy</th><th>This tenant</th><th style="width:120px">Baseline</th><th style="width:120px">Tenant</th><th style="width:170px">Status</th></tr></thead>
            <tbody>${S.cmp.rows.map(row).join("") || `<tr><td colspan="5" class="mini">The catalog is empty.</td></tr>`}</tbody></table></div></div>`);
        } else if (c && !S.res) {
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
        } else if (S.res && !c) {
          const worn = vms().filter((v) => E.looksBaseline(v.name));
          parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">Policies wearing the convention (${worn.length})</h4>
            ${worn.length ? `<ul class="mini" style="margin:6px 0 0">${worn.map((w) => `<li>${esc(w.name)} <span class="muted">(${esc(E.relLabel(E.releaseOf(w.name)))}${E.versionOf(w.name) ? ` · v${esc(E.versionOf(w.name))}` : " · no version in the name"})</span></li>`).join("")}</ul>` : `<p class="mini muted" style="margin:0">None — no policy name starts with ${esc(spec.prefix)} and carries an Ryy.m release tag.</p>`}</div>`);
        }
        if (S.res && S.res.failed && S.res.failed.length) {
          parts.push(`<div class="gu-fail"><b>${S.res.failed.length} surface${S.res.failed.length === 1 ? "" : "s"} could not be read</b><span class="why">${S.res.failed.map((f) => esc(f.label)).join(", ")} — a baseline policy living there would read as missing, so these rows are floors, not verdicts.</span></div>`);
        }
      }

      if (mode === "export") {
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">🧬 Export the baseline <span class="mini muted">— this IS the baseline tenant</span></h4>
          <p class="mini muted" style="margin:0 0 8px">Writes the catalog from this tenant's ${esc(spec.prefix)} policies — names, releases, versions and the raw bodies, so the one file drives identification and import everywhere else. <b>The folder is the catalog</b>: unzip 📁 Repo folder at the repository root and ${esc(spec.catalogPath)} — the file every tenant's ${esc(spec.label)} reads from the site — is the new reference on the next push.</p>
          ${S.res ? `<div class="tb-actions"><button class="btn primary" id="${ID("ExportZip")}" title="baseline/${esc(spec.platform.toLowerCase())}/ with catalog.json, one JSON per policy and a README index — unzip at the repo root">📁 Repo folder (zip)</button><button class="btn" id="${ID("Export")}">⬇ Catalog file (JSON)</button></div>` : `<p class="mini muted" style="margin:0">${esc(spec.readLabel)} first — the export is cut from the read.</p>`}
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
          <div id="${ID("Plan")}" style="margin-top:10px">${S.lastWrite && S.lastWrite.failedHtml ? `<p class="mini" style="margin:0 0 6px">From the last import:</p>${S.lastWrite.failedHtml}` : ""}</div></div>`);
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
          ${S.res ? "" : `<p class="mini muted" style="margin:0">${esc(spec.readLabel)} first — the list is cut from the read.</p>`}</div>`);
      }

      if (mode === "rename") {
        const co = communityCatalog();
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">✏️ Stamp the release <span class="tag block">writes to the tenant</span> <span class="mini muted">— cloudfellows.dev only, because it authors the baseline</span></h4>
          <p class="mini muted" style="margin:0 0 8px">Every policy that starts with <code>${esc(spec.prefix)}</code> and ends in a version but carries <b>no <code>Ryy.m</code> release tag</b> is proposed one, cut from its <b>last-modified date</b> (year, then month, UTC) and put before the version — <code>${esc(spec.prefix)} - DCP - Microsoft Office - D - Security - v3.6</code> modified in January 2026 becomes <code>… - R26.1 - v3.6</code>. A proposal, not a verdict: last-modified means last <i>touched</i> — an assignment edit moves it too — so every name is editable before anything is written. ${co && co.nameRe ? `<b>${esc(co.label)}'s own names are never proposed</b>: keeping them is what lets its deployer maintain them.` : ""} Renames are PATCHes on the policy's own surface (T14's update for filters), each read back and verified; the comparison above re-reads afterwards.</p>
          ${S.res ? "" : `<p class="mini muted" style="margin:0">${esc(spec.readLabel)} first — the list is cut from the read.</p>`}</div>`);
      }

      $(ID("Body")).innerHTML = parts.join("");
      const up = $(ID("Upstream"));
      if (up) up.style.display = mode === "upstream" && isCfdev() ? "" : "none";
      // the rename table has its own host too — proposals are DOM state
      const rh = $(ID("Rename"));
      if (rh) {
        rh.style.display = mode === "rename" && isCfdev() ? "" : "none";
        if (mode === "rename" && isCfdev() && S.res && !rh.dataset.for) renderRename();
      }
      const hh = $(ID("Housekeeping"));
      if (hh) {
        hh.style.display = mode === "housekeeping" && isCfdev() ? "" : "none";
        if (mode === "housekeeping" && isCfdev() && S.res && !hh.dataset.for) renderHousekeeping();
      }
      wire();
    }

    function wire() {
      const seg = $(ID("Cat"));
      if (seg) seg.addEventListener("click", (e) => {
        const b = e.target.closest(`[data-${P}cat]`); if (!b || b.dataset[`${P}cat`] === catId) return;
        catId = b.dataset[`${P}cat`];
        S.planned = null; S.plannedFilters = null;   // a plan belongs to the catalog it was made for
        recompare(); render();
      });
      const md = $(ID("Md"));
      if (md) md.addEventListener("click", () => {
        if (!S.cmp) return;
        download(`tuno-${spec.platform.toLowerCase()}-baseline-gap-${new Date().toISOString().slice(0, 10)}.md`, E.toMd(S.cmp, tenantName()), "text/markdown");
      });
      const ez = $(ID("ExportZip"));
      if (ez) ez.addEventListener("click", async () => {
        const built = await E.buildExport(S.res, tenantName());
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
      if (ex) ex.addEventListener("click", async () => {
        const built = await E.buildExport(S.res, tenantName());
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
          S.fileCat = await E.parseCatalog(await f.text());
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
      if (cr) cr.addEventListener("click", () => { S.fetchedCat = null; S.planned = null; S.plannedFilters = null; recompare(); render(); });
      const ub = $(ID("UpBundled"));
      if (ub) ub.addEventListener("click", () => {
        const co = communityCatalog(), cf = cfCatalog();
        if (!co) return;
        if (!cf) { $(ID("UpNote")).textContent = "Load or bundle a CloudFellows catalog first — a diff needs both sides."; return; }
        landUpstream({ policies: E.communityAsUpstream(co), skipped: [], seenOther: 0, manifest: null }, cf, `bundled ${co.label}${co.release ? ` v${co.release}` : ""}`, false);
      });
    }

    // ------------------------------------------------ the upstream watch --
    // (S.upstream and S.lastSource live in the session object above.)

    // writable: a loaded zip can be written back out as the next community
    // catalog file; the bundled catalog cannot — it IS that file already
    function landUpstream(parsed, cf, from, writable) {
      S.upstream = {
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
      if (!S.upstream) return;
      const n = { same: 0, differs: 0, new: 0 };
      S.upstream.rows.forEach((r) => { n[r.status]++; });
      const order = { new: 0, differs: 1, same: 2 };
      const rows = [...upstream.rows].sort((a, b) => order[a.status] - order[b.status] || String(a.up.name).localeCompare(String(b.up.name)));
      const idShort = (x) => String(x).split("_").pop();
      const card = (label, num, sub, cls) => `<div class="au-card"><div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${num}</div><div class="au-card-s">${sub}</div></div>`;
      const cards = `<div class="au-cards">
        ${card("＋ New to us", n.new, "controls the baseline lacks", n.new ? "bad" : "")}
        ${card("≠ Matched, differs", n.differs, "same control, different settings or values", n.differs ? "warn" : "")}
        ${card("✓ Covered", n.same, "setting for setting, value for value", "ok")}
        ${card("Seen, not comparable", S.upstream.seenOther || 0, "scripts and profiles — no policy body to diff")}
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
        <h4 style="margin:0 0 6px">${spec.upstream.icon} ${esc(spec.upstream.label)} vs the baseline <span class="mini muted">— ${esc(S.upstream.from || "loaded")}, ${esc(S.upstream.when)}</span></h4>
        ${cards}
        <p class="mini muted" style="margin:10px 0 4px">Tick what belongs in the baseline and curate the name — proposals stamp <b>${esc(E.relLabel(E.currentRelease()))}</b> with the version increased; created here unassigned, then 🧬 re-export.</p>
        ${S.upstream.skipped.length ? `<p class="mini muted" style="margin:0 0 8px">${S.upstream.skipped.length} file(s) skipped: ${esc(S.upstream.skipped.map((sk) => sk.path.split("/").pop()).slice(0, 3).join(", "))}${S.upstream.skipped.length > 3 ? "…" : ""}</p>` : ""}
        <div class="tb-actions" style="margin:8px 0 8px">
          <button class="btn" id="${ID("UpAll")}">☑ Select all</button>
          <button class="btn" id="${ID("UpNone")}">☐ Select none</button>
          <span class="mini muted" id="${ID("UpCount")}"></span>
          <button class="btn" id="${ID("UpMd")}" title="The whole comparison as Markdown — what is new, per policy, for the release notes">📝 What's new (Markdown)</button>
          ${S.upstream.parsed ? `<button class="btn" id="${ID("UpCatalog")}" title="Write this upstream as ${esc(spec.communityPath.replace(/\/catalog\.json$/, "/"))} — unzip at the repo root and it is the community catalog every tenant reads">📁 Community catalog folder (zip)</button>` : ""}
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
      host.dataset.order = JSON.stringify(rows.map((r) => S.upstream.rows.indexOf(r)));
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
          const live = S.upPlanned && S.upPlanKey === upSelectionKey();
          const nCreate = live ? S.upPlanned.filter((p) => !p.collided).length : 0;
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
          if (stale) stale.style.display = S.upPlanned && !live ? "" : "none";
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
          E.upstreamMarkdown(rows, { catalog: cf ? `${cf.release || "(no release)"} (${cf.policies.length} policies)` : "" }), "text/markdown");
      });
      const uc = $(ID("UpCatalog"));
      if (uc) uc.addEventListener("click", async () => {
        const f = S.upstream.fetched || {};
        const file = await E.buildCommunity(S.upstream.parsed, { release: f.date || (E.community() ? E.community().release : ""), sourceDate: f.date || "", commit: f.commit || "" });
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
      if (running || !S.upstream) return;
      running = true; $(ID("UpDry")).disabled = true; $(ID("UpPlan")).innerHTML = "";
      S.upPlanned = null; S.upPlanKey = null; syncUpBar();
      try {
        const host = $(ID("Upstream"));
        const order = JSON.parse(host.dataset.order || "[]");
        const picked = [], badNames = [];
        host.querySelectorAll("[data-uptick]").forEach((cb) => {
          if (!cb.checked) return;
          const i = +cb.dataset.uptick;
          const r = S.upstream.rows[order[i]];
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
        S.upPlanned = Restore.plan(picked, names);
        S.upPlanKey = upSelectionKey();
        prog("");
        const nCreate = S.upPlanned.filter((p) => !p.collided).length;
        $(ID("UpPlan")).innerHTML = `
          <p class="mini" style="margin:0 0 8px"><b>${nCreate} to create</b> · ${S.upPlanned.length - nCreate} already present (the collision stop)${nCreate ? ` — <b>✍ Create ${nCreate} in THIS tenant</b> is in the bar below` : ""}</p>
          <p class="mini" id="${ID("UpStale")}" style="display:none;margin:0 0 8px;color:var(--report)">The selection changed since this dry run — dry run again before creating.</p>
          <div class="gu-tw"><table class="cg-table"><thead><tr><th>Will be created as</th><th style="width:180px">Surface</th><th style="width:200px">Operation</th></tr></thead>
          <tbody>${S.upPlanned.map((p) => `<tr><td class="mini"><b>${esc(p.target)}</b></td><td class="mini">${esc(Restore.AREA_INFO[p.area].label)}</td><td class="mini${p.collided ? '" style="color:var(--off)' : ""}">${p.collided ? "skip — a policy already wears this name" : "create, unassigned"}</td></tr>`).join("")}</tbody></table></div>
          <div id="${ID("UpResult")}" style="margin-top:10px"></div>`;
      } catch (e) {
        prog("");
        $(ID("UpPlan")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const d = $(ID("UpDry")); if (d) d.disabled = false; syncUpBar(); }
    }

    async function upApply() {
      if (running || !S.upPlanned) return;
      if (S.upPlanKey !== upSelectionKey()) { syncUpBar(); return; }
      // THE PLAN NAMES A TENANT (finding 1) and this act names a tenant
      // KIND (finding 7) — both are re-asked here, at the click, not
      // trusted from when the pane was drawn.
      if (wrongTenant()) { $(ID("UpPlan")).innerHTML = tenantMovedHtml(); S.upPlanned = null; S.upPlanKey = null; syncUpBar(); return; }
      if (!isCfdev()) { $(ID("UpPlan")).innerHTML = refusedHtml("Upstream"); S.upPlanned = null; S.upPlanKey = null; syncUpBar(); return; }
      running = true; $(ID("UpApply")).disabled = true;
      try {
        await Graph.ensureScopes(Graph.SCOPES.profiles);
        const results = await Restore.apply(S.upPlanned, (m) => prog(m));
        prog("");
        const good = results.filter((r) => r.outcome === "created").length;
        const bad = results.filter((r) => r.outcome === "failed").length;
        $(ID("UpResult")).innerHTML = `
          <p class="mini" style="margin:0 0 6px"><b>${good} created</b>${bad ? ` · <b style="color:var(--off)">${bad} failed</b>` : ""} — unassigned, in this tenant only. Now ${esc(spec.readLabel)}, judge them in the comparison, and 🧬 re-export: the export becomes the new baseline, versions increased, wearing this month's release.</p>
          ${results.filter((r) => r.outcome === "failed").map((r) => `<div class="gu-fail"><b>${esc(r.target || "")}</b><span class="why">${esc(r.detail || "")}</span></div>`).join("")}`;
        if (typeof PolicyCache !== "undefined") PolicyCache.invalidate();
        S.upPlanned = null; S.upPlanKey = null;
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
        S.upstream.fetched = { commit: got.commit, date: got.date };
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
        S.fetchedCat = await E.buildCommunity(parsed, { commit: got.commit, sourceDate: got.date, release: got.date });
        catId = "community"; S.planned = null; S.plannedFilters = null;
        recompare(); render();
      } catch (e) {
        const n = $(ID("FetchNote")); if (n) n.textContent = `Not fetched: ${(e && e.message) || e}`;
        const b2 = $(ID("Fetch")); if (b2) b2.disabled = false;
      } finally { fetching = false; }
    }

    // ------------------------------------------------ the rename act ------
    // Its own host (#<ids>Rename): ticks and edited names are DOM state.
    let syncRnBar = () => {};
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
      if (!host || !S.res) return;
      const rows = E.renameProposals(vms(), communityCatalog());
      host.dataset.for = String(rows.length);
      S.rnPlanned = null; S.rnPlanKey = null;
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
      host.dataset.rows = JSON.stringify(rows.map((r) => ({ id: r.p.id, name: r.name, section: r.section, modified: r.modified, status: r.status, path: r.path || null, odataType: r.odataType || "" })));
      const ticks = () => [...host.querySelectorAll("[data-rntick]")];
      const master = $(ID("RnMaster"));
      const sync = () => {
        const t = ticks(), on = t.filter((c) => c.checked).length;
        master.checked = on > 0 && on === t.length; master.indeterminate = on > 0 && on < t.length;
        const c2 = $(ID("RnCount")); if (c2) c2.textContent = t.length ? `${on} of ${t.length} ticked` : "";
        const bar = $(ID("RnBar")); if (!bar) return;
        bar.classList.toggle("visible", on > 0);
        const live = S.rnPlanned && S.rnPlanKey === rnSelectionKey();
        const nDo = live ? S.rnPlanned.filter((p) => !p.refused).length : 0;
        $(ID("RnBarCount")).textContent = live ? `${on} ticked · ${nDo} to rename` : `${on} polic${on === 1 ? "y" : "ies"} ticked`;
        const dry = $(ID("RnDry")), ap = $(ID("RnApply"));
        dry.classList.toggle("primary", !live);
        dry.innerHTML = live ? `🔍 Dry run again` : `🔍 Dry run the ticked <span class="tag block">plans writes</span>`;
        ap.style.display = live && nDo ? "" : "none";
        ap.innerHTML = `✍ Rename ${nDo} in THIS tenant <span class="tag block">writes to the tenant</span>`;
        const stale = $(ID("RnStale")); if (stale) stale.style.display = S.rnPlanned && !live ? "" : "none";
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
        picked.push({ ...rows[i], newName: ((el && el.value) || "").trim() });
      });
      return picked;
    }
    async function rnDryRun() {
      if (running) return;
      running = true; $(ID("RnDry")).disabled = true; $(ID("RnPlan")).innerHTML = "";
      S.rnPlanned = null; S.rnPlanKey = null; syncRnBar();
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
        S.rnPlanned = picked.map((p) => {
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
        S.rnPlanKey = rnSelectionKey();
        const nDo = S.rnPlanned.filter((p) => !p.refused).length;
        $(ID("RnPlan")).innerHTML = `
          <p class="mini" style="margin:0 0 8px"><b>${nDo} to rename</b> · ${S.rnPlanned.length - nDo} refused${nDo ? ` — <b>✍ Rename ${nDo} in THIS tenant</b> is in the bar below` : ""}</p>
          <p class="mini" id="${ID("RnStale")}" style="display:none;margin:0 0 8px;color:var(--report)">The selection changed since this dry run — dry run again before renaming.</p>
          <div class="gu-tw"><table class="cg-table"><thead><tr><th>From</th><th>To</th><th style="width:220px">Operation</th></tr></thead>
          <tbody>${S.rnPlanned.map((p) => `<tr><td class="mini">${esc(p.name)}</td><td class="mini"><b>${esc(p.target)}</b></td><td class="mini${p.refused ? '" style="color:var(--off)' : ""}">${p.refused ? `skip — ${esc(p.refused)}` : `PATCH ${esc(p.path.field)}${p.path.viaFilters ? " (T14's update)" : ` on ${esc(String(p.path.endpoint).split("/").pop())}`}`}</td></tr>`).join("")}</tbody></table></div>
          <div id="${ID("RnResult")}" style="margin-top:10px"></div>`;
      } catch (e) {
        prog("");
        $(ID("RnPlan")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const d = $(ID("RnDry")); if (d) d.disabled = false; syncRnBar(); }
    }
    async function rnApply() {
      if (running || !S.rnPlanned) return;
      if (S.rnPlanKey !== rnSelectionKey()) { syncRnBar(); return; }
      if (wrongTenant()) { $(ID("RnPlan")).innerHTML = tenantMovedHtml(); S.rnPlanned = null; S.rnPlanKey = null; syncRnBar(); return; }
      if (!isCfdev()) { $(ID("RnPlan")).innerHTML = refusedHtml("Rename"); S.rnPlanned = null; S.rnPlanKey = null; syncRnBar(); return; }
      running = true; $(ID("RnApply")).disabled = true;
      const results = [];
      try {
        await Graph.ensureScopes(Graph.SCOPES.profiles);
        for (const p of S.rnPlanned) {
          if (p.refused) { results.push({ ...p, outcome: "skipped", detail: p.refused }); continue; }
          try {
            prog(`${p.target} — renaming…`);
            if (p.path.viaFilters) {
              await Filters.update(p.id, p.modified || null, { displayName: p.target });
            } else {
              const url = `${Graph.BETA}${p.path.endpoint}/${encodeURIComponent(p.id)}`;
              const patch = { [p.path.field]: p.target };
              if (p.path.typed && p.odataType) patch["@odata.type"] = p.odataType;   // derived types say what they are
              await Graph.patch(url, patch, { scopes: Graph.SCOPES.profiles });
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
        S.rnPlanned = null; S.rnPlanKey = null;
        rereadAfter(`✏️ Rename: <b>${good} renamed</b>${bad ? `, <b style="color:var(--off)">${bad} failed</b>` : ""}`);
      } catch (e) {
        prog("");
        $(ID("RnResult")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const ap = $(ID("RnApply")); if (ap) ap.disabled = false; syncRnBar(); }
    }

    // ------------------------------------------------ housekeeping --------
    let syncHkBar = () => {};
    function hkSelectionKey() {
      const host = $(ID("Housekeeping"));
      if (!host) return "";
      return [...host.querySelectorAll("[data-hktick]")].filter((cb) => cb.checked).map((cb) => cb.dataset.hktick).join(",");
    }
    function renderHousekeeping() {
      const host = $(ID("Housekeeping"));
      if (!host || !S.res) return;
      const groups = E.housekeeping(vms());
      host.dataset.for = String(groups.length);
      S.hkPlanned = null; S.hkPlanKey = null;
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
        const live = S.hkPlanned && S.hkPlanKey === hkSelectionKey();
        const nDo = live ? S.hkPlanned.filter((p) => !p.refused).length : 0;
        $(ID("HkBarCount")).textContent = live ? `${on} ticked · ${nDo} to delete` : `${on} cop${on === 1 ? "y" : "ies"} ticked`;
        const dry = $(ID("HkDry")), ap = $(ID("HkApply"));
        dry.classList.toggle("primary", !live);
        dry.innerHTML = live ? `🔍 Dry run again` : `🔍 Dry run the ticked <span class="tag block">plans deletes</span>`;
        ap.style.display = live && nDo ? "" : "none";
        ap.innerHTML = `🗑 Delete ${nDo} in THIS tenant <span class="tag block">deletes from the tenant</span>`;
        const stale = $(ID("HkStale")); if (stale) stale.style.display = S.hkPlanned && !live ? "" : "none";
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
      S.hkPlanned = null; S.hkPlanKey = null; syncHkBar();
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
        S.hkPlanned = out; S.hkPlanKey = hkSelectionKey();
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
      if (running || !S.hkPlanned) return;
      if (S.hkPlanKey !== hkSelectionKey()) { syncHkBar(); return; }
      // A DELETE gets the check first, before anything else it does.
      if (wrongTenant()) { $(ID("HkPlan")).innerHTML = tenantMovedHtml(); S.hkPlanned = null; S.hkPlanKey = null; syncHkBar(); return; }
      if (!isCfdev()) { $(ID("HkPlan")).innerHTML = refusedHtml("Housekeeping"); S.hkPlanned = null; S.hkPlanKey = null; syncHkBar(); return; }
      running = true; $(ID("HkApply")).disabled = true;
      const results = [];
      try {
        await Graph.ensureScopes(Graph.SCOPES.profiles);
        for (const p of S.hkPlanned) {
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
        S.hkPlanned = null; S.hkPlanKey = null;
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
        const wanted = S.cmp && S.cmp.catalog === c ? new Set(S.cmp.rows.filter((r) => r.baseline && (r.status === "missing" || r.status === "outdated")).map((r) => r.key)) : null;
        const { entries, filters, refused } = E.importEntries(c, wanted);
        if (!entries.length && !filters.length) { $(ID("Plan")).innerHTML = wanted && !wanted.size ? `<p class="mini" style="margin:0"><b>Nothing to create</b> — the comparison found every baseline policy present, by token, name or content.</p>` : `<div class="gu-fail"><b>Nothing importable.</b><span class="why">${refused.length ? esc(refused[0].why) : "The catalog carries no policy bodies."}</span></div>`; return; }
        prog("Checking what already exists…");
        await Graph.ensureScopes(Graph.SCOPES.config);
        const names = entries.length ? await Restore.existingNames([...new Set(entries.map((x) => x.area))], (m) => prog(m)) : {};
        S.planned = entries.length ? Restore.plan(entries, names) : [];
        let haveFilters = new Set();
        if (filters.length) {
          prog("Reading the tenant's assignment filters…");
          try { haveFilters = new Set((await Filters.list()).map((f) => String(f.displayName || "").toLowerCase())); }
          catch (e) { throw new Error(`The tenant's filters could not be read (${(e && e.message) || e}) — the filter half of the plan would be a guess, so there is no plan.`); }
        }
        S.plannedFilters = filters.map((f) => ({ ...f, collided: haveFilters.has(String(f.body.displayName).toLowerCase()) }));
        prog("");
        // every creatable row ticked (10586, Mihai: "this should have a select /
        // deselect option"); the button counts what is ticked
        const rows = [
          ...planned.map((p, i) => `<tr><td style="width:30px">${p.collided ? "" : `<input type="checkbox" data-imtick="p${i}" checked>`}</td><td class="mini"><b>${esc(p.target)}</b></td><td class="mini">${esc(Restore.AREA_INFO[p.area].label)}</td><td class="mini${p.collided ? '" style="color:var(--off)' : ""}">${p.collided ? "skip — a policy already wears this name" : "create, unassigned"}</td></tr>`),
          ...plannedFilters.map((f, i) => `<tr><td style="width:30px">${f.collided ? "" : `<input type="checkbox" data-imtick="f${i}" checked>`}</td><td class="mini"><b>${esc(f.body.displayName)}</b></td><td class="mini">Assignment filter (T14's create)</td><td class="mini${f.collided ? '" style="color:var(--off)' : ""}">${f.collided ? "skip — a filter already wears this name" : "create"}</td></tr>`),
        ].join("");
        const nCreate = S.planned.filter((p) => !p.collided).length + S.plannedFilters.filter((f) => !f.collided).length;
        const nSkip = S.planned.filter((p) => p.collided).length + S.plannedFilters.filter((f) => f.collided).length;
        $(ID("Plan")).innerHTML = `
          <p class="mini" style="margin:0 0 8px"><b>${nCreate} to create</b> · ${nSkip} already present (the collision stop — present is the point, not a problem)${refused.length ? ` · ${refused.length} not importable (${esc(refused[0].why)})` : ""}${wanted ? ` · ${c.policies.length - wanted.size} of ${c.policies.length} left alone — the comparison found them present` : ""}</p>
          ${nCreate ? `<div class="tb-actions" style="margin:0 0 8px"><button class="btn" id="${ID("ImAll")}">☑ Select all</button><button class="btn" id="${ID("ImNone")}">☐ Select none</button><span class="mini muted" id="${ID("ImCount")}"></span></div>` : ""}
          <div class="gu-tw"><table class="cg-table"><thead><tr><th style="width:30px">${nCreate ? `<input type="checkbox" id="${ID("ImMaster")}" title="Select or deselect every row below">` : ""}</th><th>Baseline policy</th><th style="width:200px">Path</th><th style="width:220px">Operation</th></tr></thead><tbody>${rows}</tbody></table></div>
          ${nCreate ? `<div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="${ID("Apply")}">✍ Create ${nCreate} object${nCreate === 1 ? "" : "s"} <span class="tag block">writes to the tenant</span></button></div>` : ""}
          <div id="${ID("Result")}" style="margin-top:10px"></div>`;
        const plan = $(ID("Plan"));
        const ticks = () => [...plan.querySelectorAll("[data-imtick]")];
        const master = $(ID("ImMaster"));
        const syncIm = () => {
          const t = ticks(), on = t.filter((x) => x.checked).length;
          if (master) { master.checked = on > 0 && on === t.length; master.indeterminate = on > 0 && on < t.length; }
          const cnt = $(ID("ImCount")); if (cnt) cnt.textContent = t.length ? `${on} of ${t.length} ticked` : "";
          const ap2 = $(ID("Apply"));
          if (ap2) { ap2.disabled = !on; ap2.innerHTML = `✍ Create ${on} object${on === 1 ? "" : "s"} <span class="tag block">writes to the tenant</span>`; }
        };
        const setAll = (v) => { ticks().forEach((x) => { x.checked = v; }); syncIm(); };
        if (master) master.addEventListener("change", () => setAll(master.checked));
        const ia = $(ID("ImAll")); if (ia) ia.addEventListener("click", () => setAll(true));
        const inn = $(ID("ImNone")); if (inn) inn.addEventListener("click", () => setAll(false));
        plan.addEventListener("change", (e) => { if (e.target.closest("[data-imtick]")) syncIm(); });
        syncIm();
        const ap = $(ID("Apply"));
        if (ap) ap.addEventListener("click", apply);
      } catch (e) {
        prog("");
        $(ID("Plan")).innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
      } finally { running = false; const d = $(ID("Dry")); if (d) d.disabled = false; }
    }

    async function apply() {
      if (running || (!S.planned && !S.plannedFilters)) return;
      // only the ticked rows are created; the rest of the plan is left as it was
      const on = new Set([...$(ID("Plan")).querySelectorAll("[data-imtick]")].filter((x) => x.checked).map((x) => x.dataset.imtick));
      const doPolicies = (S.planned || []).filter((p, i) => !p.collided && on.has(`p${i}`));
      const doFilters = (S.plannedFilters || []).filter((f, i) => !f.collided && on.has(`f${i}`));
      if (!doPolicies.length && !doFilters.length) return;
      // Import runs on every tenant, so there is no kind to re-check — but
      // the plan still names one tenant, and this is where that is proved.
      if (wrongTenant()) { $(ID("Result")).innerHTML = tenantMovedHtml(); S.planned = null; S.plannedFilters = null; return; }
      running = true; $(ID("Apply")).disabled = true;
      try {
        await Graph.ensureScopes(Graph.SCOPES.profiles);
        const results = doPolicies.length ? await Restore.apply(doPolicies, (m) => prog(m)) : [];
        const filterResults = [];
        for (const f of doFilters) {
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
        S.planned = null; S.plannedFilters = null;
        S.lastWrite = { failedHtml };
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
        await land(r, note ? `${note} — re-read at ${esc(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }))}, so the comparison below is the tenant as it is now.` : attach ? srcNote() : "");
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
      // THE SESSION IS MADE HERE, AND IT IS KEYED BY THE TENANT (finding 1).
      // The sign-out event drops it, but this is the second latch and the
      // one that cannot be missed: if the screen opens holding a read that
      // a DIFFERENT tenant produced — a sign-out the listener never saw, a
      // demo entered from a signed-in session — the state goes before a
      // single row of it is rendered.
      if (S.tenantId && S.tenantId !== currentTenantId()) reset();
      if (S.res || running) return;
      $(ID("Body")).innerHTML = `<p class="mini muted" style="margin:0">Reading the catalogs from ${esc(spec.catalogPath)} and ${esc(spec.communityPath)}…</p>`;
      await ensureCatalogs();
      if (S.res || running) return;
      const c = PolicyCache.get();
      if (c) { await land(c, srcNote()); return; }
      if (PolicyCache.reading()) { run(true); return; }
      render();
    }

    function init() {
      if (!$(ID("Run"))) return;
      (window.TunoScreenHooks = window.TunoScreenHooks || {})[spec.screen] = onShow;
      // SIGN-OUT DROPS THE TENANT'S DATA (finding 1). app.js fires the
      // event and knows nothing about who listens; the tool registers
      // beside the state it owns, so a tool added later cannot be
      // forgotten in app.js's sign-out handler.
      window.addEventListener("tuno:signout", reset);
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
      init, reset,
      // what the session is holding, for the tests and for nothing else
      _session: () => S,
      // r: collect result · c: a CloudFellows catalog (or null for the bundled one) · m: mode · k: catalog id
      _setForTest: async (r, c, m, k) => { S.fileCat = c || null; mode = m || "compare"; catId = k || null; await land(r, ""); },
      _catalogsForTest: (b, c) => { E.setBundled(b); E.setCommunity(c); catalogsLoaded = Promise.resolve({}); },
    };
  }

  return { engine, screen, esc };
})();

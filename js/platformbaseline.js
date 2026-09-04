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

    // ONE STATUS VOCABULARY (§6.3, build 10590). The old set had `ok` and
    // `present` saying the same thing in two words because one catalog
    // versioned its names and the other did not, and no word at all for
    // "the tenant carries this twice". Nine words now, each with exactly
    // one meaning, and the table below is the only place they are defined.
    const STATUS = {
      missing: { icon: "✗", label: "Missing", cls: "bad", order: 0, attention: true, why: "in the catalog, not in this tenant" },
      outdated: { icon: "⬆", label: "Outdated", cls: "warn", order: 1, attention: true, why: "the tenant's copy is older than the catalog's" },
      differs: { icon: "≠", label: "Differs", cls: "warn", order: 2, attention: true, why: "same identity and version, different settings — someone edited one side" },
      duplicate: { icon: "⧉", label: "Duplicate", cls: "warn", order: 3, attention: true, why: "the same content under a second name in this tenant" },
      review: { icon: "?", label: "Review", cls: "warn", order: 4, attention: true, why: "two candidates matched almost equally well — not claimed, decide by hand" },
      ahead: { icon: "⬇", label: "Ahead", cls: "info", order: 5, attention: true, why: "the tenant's copy is newer than the catalog's" },
      unversioned: { icon: "…", label: "Unversioned", cls: "info", order: 6, attention: false, why: "wears the prefix but carries no release and no version — ✏️ Rename gives it one" },
      extra: { icon: "＋", label: "Not in the catalog", cls: "info", order: 7, attention: false, why: "wears the convention here, but the catalog does not carry it" },
      match: { icon: "✓", label: "Match", cls: "ok", order: 8, attention: false, why: "same identity, same version, same settings" },
    };
    const ATTENTION = Object.keys(STATUS).filter((k) => STATUS[k].attention);

    // ---- similarity: Jaccard, anchored, one-to-one (§6.1.4, finding 8) ----
    // The old score was hits over the SMALLER set, which is not a
    // similarity at all: a one-setting policy inside a hundred-setting one
    // scores 1.0 and was claimed as the same control. Jaccard divides by
    // the UNION, so containment is not identity — 1 of 100 scores 0.01.
    //
    // Three more rules, because a number alone still overclaims:
    //   ANCHOR      — the two must be the same KIND of thing: the same
    //                 settings-catalog template family, or the same
    //                 @odata.type. A compliance policy never matches a
    //                 configuration profile however alike their properties.
    //   ONE-TO-ONE  — a tenant policy is claimed by ONE catalog row, the
    //                 highest scorer, and is then out of the pool.
    //   REVIEW      — if the runner-up for the same row is within 0.05 of
    //                 the winner, nothing is claimed: the row reads
    //                 `review` and a person decides. A coin-flip dressed
    //                 as a match is worse than an unanswered question.
    const SIMILARITY_MIN = 0.6;
    const REVIEW_MARGIN = 0.05;
    function jaccard(A, B) {
      if (!A.size || !B.size) return 0;
      let hit = 0;
      for (const x of A) if (B.has(x)) hit++;
      return hit / (A.size + B.size - hit);
    }
    // what kind of thing this is — the anchor two candidates must share
    function anchorOf(section, body) {
      const b = body || {};
      if (section === "settingsCatalog") {
        const t = (b.templateReference && b.templateReference.templateId) || "";
        return `sc:${String(t).toLowerCase()}`;
      }
      return `t:${String(b["@odata.type"] || section || "").toLowerCase()}`;
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

    // ================================================================
    // COMPARE — one matcher, one vocabulary, both catalog kinds (§6.1)
    // ================================================================
    // vms: [{ id, name, section, description, body, hash, du }] — every
    // policy the read returned, whatever surface it lives on.
    //
    // THE ORDER IS THE POINT, and it runs the same way for the repo
    // catalog and for a community one — until 10590 the content and
    // similarity passes ran for community catalogs ONLY, so a repo policy
    // renamed on a tenant read as `missing` and Import made a second copy
    // of it.
    //
    //   1 TOKEN    — the author's own identity in the description
    //                (OIBID:<guid>). Beats everything: a renamed copy
    //                still identifies.
    //   2 KEY      — keyOf(name) equal. The convention IS the identity.
    //   3 HASH     — the canonical bodies are byte-equal. Catches a copy
    //                renamed on the tenant, whatever it is called now.
    //   4 SIMILARITY — Jaccard over what the policy configures, anchored,
    //                one-to-one, with `review` for a near tie (finding 8).
    //
    // Each pass only sees what the passes before it did not claim, and a
    // tenant policy is claimed exactly once.
    function compare(vms, cat) {
      const comm = isCommunity(cat);
      const consumed = new Set();
      const rows = [];
      const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
      const byTok = new Map(), byKey = new Map(), byHash = new Map();
      for (const p of vms) {
        const tok = comm ? tokenOf(cat, p.description) : null;
        if (tok) { p.__tok = tok; push(byTok, tok, p); }
        push(byKey, keyOf(p.name), p);
        if (p.hash) push(byHash, p.hash, p);
      }
      const free = (list) => (list || []).filter((p) => !consumed.has(p));

      // ONE IDENTITY, TWO VERSIONS IN THE CATALOG (build 10573, found on
      // cloudfellows.dev): a re-cut kept beside its old copy is exported
      // twice under one key and the tenant carries both. Each row takes
      // the tenant copy wearing ITS OWN release and version first; what is
      // left over is judged by the passes below.
      const catKeyCount = new Map();
      for (const b of cat.policies) { const k = keyOf(b.name); catKeyCount.set(k, (catKeyCount.get(k) || 0) + 1); }
      const relOf = (b) => comm ? null : normRel(b.release, b.name);
      const verOf = (b) => b.version || versionOf(b.name);
      const sameRelVer = (b, p) =>
        cmpRelVer(comm ? null : releaseOf(p.name), versionOf(p.name), relOf(b), verOf(b)) === 0 && !!(verOf(b) || (!comm && relOf(b)));

      // ---- passes 1-3, per catalog row ----
      const unmatched = [];
      for (const b of cat.policies) {
        const k = keyOf(b.name);
        const bRel = relOf(b), bVer = verOf(b);
        const bTok = comm && b.oibId ? String(b.oibId).toUpperCase() : null;
        const row = { key: k, baseline: b, bRel, bVer, tenant: null, status: "missing", catDup: (catKeyCount.get(k) || 0) > 1 };

        // 1 — the token
        let hits = bTok ? free(byTok.get(bTok)) : [];
        let how = hits.length ? "token" : "";
        // 2 — the key. A name hit carrying a DIFFERENT token belongs to
        // that other policy, and a token-bearing policy is never claimed
        // by a catalog row that has no token of its own.
        if (!hits.length) {
          hits = free(byKey.get(k)).filter((p) => {
            if (!comm) return true;
            if (p.__tok && bTok) return p.__tok === bTok;
            return !p.__tok;
          });
          if (hits.length) how = "key";
        }
        if (hits.length && row.catDup) {
          const exact = hits.filter((p) => sameRelVer(b, p));
          if (exact.length) hits = exact;
          else {
            const claimedElsewhere = (p) => cat.policies.some((b2) => b2 !== b && keyOf(b2.name) === k && sameRelVer(b2, p));
            if (hits.some(claimedElsewhere)) hits = hits.filter((p) => !claimedElsewhere(p));
          }
        }
        // 3 — the content hash. Same bodies, whatever the names.
        if (!hits.length && b.hash) {
          hits = free(byHash.get(b.hash));
          if (hits.length) { hits = [hits[0]]; how = "hash"; }
        }
        if (!hits.length) { unmatched.push(row); rows.push(row); continue; }
        hits.forEach((p) => consumed.add(p));
        Object.assign(row, verdict(b, bRel, bVer, hits[0], comm, how));
        row.duplicates = hits.length > 1 ? hits.length : 0;
        rows.push(row);
      }

      // ---- pass 4: similarity, one-to-one, with review (finding 8) ----
      const pool = vms.filter((p) => p.body && !consumed.has(p))
        .map((p) => ({ p, ids: defIdsOf(kindOfSection(p.section), p.body), anchor: anchorOf(p.section, p.body) }))
        .filter((o) => o.ids.size);
      if (pool.length) {
        for (const row of unmatched) {
          const b = row.baseline;
          if (!b || !b.body) continue;
          const bIds = defIdsOf(kindOfSection(b.section), b.body);
          if (!bIds.size) continue;
          const bAnchor = anchorOf(b.section, b.body);
          const scored = pool
            .filter((o) => !consumed.has(o.p) && o.p.section === b.section && o.anchor === bAnchor)
            .map((o) => ({ o, s: jaccard(bIds, o.ids) }))
            .filter((x) => x.s >= SIMILARITY_MIN)
            .sort((a, c) => c.s - a.s);
          if (!scored.length) continue;
          // A NEAR TIE IS NOT A MATCH. Two candidates within 0.05 of each
          // other is a question, and the row asks it rather than guessing.
          if (scored.length > 1 && (scored[0].s - scored[1].s) < REVIEW_MARGIN) {
            row.status = "review";
            row.candidates = scored.slice(0, 3).map((x) => ({ name: x.o.p.name, score: x.s }));
            continue;
          }
          const best = scored[0];
          consumed.add(best.o.p);
          Object.assign(row, verdict(b, row.bRel, row.bVer, best.o.p, comm, "similarity"));
          row.score = best.s;
        }
      }

      // ---- what the tenant has that the catalog does not ----
      // `extra`  — wears the convention (or carries the token) and is not
      //            in the catalog.
      // `duplicate` — the same canonical body under a SECOND name in this
      //            tenant (§6.3). One of them is the copy a re-cut left
      //            behind, and 🧹 Housekeeping is where it goes.
      const claimable = (p) => comm ? (!!p.__tok || (cat.nameRe ? catLooks(cat, p.name) : false)) : looksBaseline(p.name);
      const seenHash = new Map();
      for (const r of rows) if (r.tenant && r.tenant.hash) seenHash.set(r.tenant.hash, r);
      for (const p of vms) {
        if (consumed.has(p)) continue;
        const twin = p.hash ? seenHash.get(p.hash) : null;
        if (twin && keyOf(p.name) !== keyOf(twin.tenant.name)) {
          consumed.add(p);
          rows.push({ key: keyOf(p.name), baseline: twin.baseline, bRel: twin.bRel, bVer: twin.bVer,
            tenant: p, tRel: comm ? null : releaseOf(p.name), tVer: versionOf(p.name),
            status: "duplicate", how: "hash", twinOf: twin.tenant.name });
          continue;
        }
        if (!claimable(p)) continue;
        consumed.add(p);
        const tRel = comm ? null : releaseOf(p.name), tVer = versionOf(p.name);
        rows.push({ key: keyOf(p.name), baseline: null, tenant: p, tRel, tVer,
          status: (!comm && !tRel && !tVer) ? "unversioned" : "extra" });
      }

      rows.sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || String(a.key).localeCompare(String(b.key)));
      const counts = {};
      Object.keys(STATUS).forEach((k) => { counts[k] = 0; });
      rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
      return {
        rows, counts, catalog: cat,
        baselineTotal: cat.policies.length,
        covered: rows.filter((r) => r.baseline && r.tenant).length,
        attention: rows.filter((r) => STATUS[r.status].attention).length,
      };
    }

    // Which of defIdsOf's three shapes a section is read as.
    const kindOfSection = (s) => s === "settingsCatalog" ? "settingsCatalog" : s === "admx" ? "settingsCatalog" : "compliance";

    // The verdict on one matched pair — the only place a status is decided
    // for a policy that IS present.
    function verdict(b, bRel, bVer, p, comm, how) {
      const tRel = comm ? null : releaseOf(p.name), tVer = versionOf(p.name);
      const out = { tenant: p, tRel, tVer, how, byToken: how === "token", byContent: how === "hash" || how === "similarity" };
      // The tenant copy WEARS THE PREFIX and carries neither a release nor
      // a version: Rename is the act, and no version comparison is possible
      // or honest. A copy found by content under some unrelated name is not
      // unversioned — it is matched, and its name is Rename's business
      // separately.
      if (!comm && spec.prefixRe.test(p.name || "") && !tRel && !tVer) { out.status = "unversioned"; return out; }
      const contentSame = (b.hash && p.hash) ? b.hash === p.hash : null;
      out.contentSame = contentSame;
      if (contentSame === false && b.body && p.body) out.diff = diffPolicies(kindOfSection(b.section), b.body, p.body);
      const c = cmpRelVer(tRel, tVer, bRel, bVer);
      if (c === null) { out.status = contentSame === false ? "differs" : "match"; return out; }
      if (c < 0) { out.status = "outdated"; return out; }
      if (c > 0) { out.status = "ahead"; return out; }
      out.status = contentSame === false ? "differs" : "match";
      return out;
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
    // ================================================================
    // EXPORT FAILS CLOSED (§4.4, finding 2, build 10592)
    // ================================================================
    // Export used to run on whatever the read had. A surface that 403'd,
    // a settings read that threw, a body that came back empty — none of it
    // stopped the export, so the catalog committed to the repository could
    // be QUIETLY SHORT, and every other tenant would then read that short
    // catalog as the baseline and see policies as `missing` that the
    // reference tenant has had all along. A catalog cut from a partial
    // read is worse than no catalog: it is confidently wrong, and it
    // spreads.
    //
    // So Export is disabled while anything is unknown, and it says
    // exactly what — per surface, expected against read, with the rows
    // that carry a detail error or an empty body named. The fix is always
    // the same and is always the user's: read the tenant again.
    const bodyLooksEmpty = (secId, raw) => {
      if (!raw) return true;
      if (secId === "settingsCatalog") return !Array.isArray(raw.__detail) || raw.__detail.length === 0;
      if (secId === "admx") return !Array.isArray(raw.__detail) || raw.__detail.length === 0;
      // every other surface: the body IS the object, so "empty" means it
      // carries nothing but the identity fields the list read returns
      return Object.keys(raw).filter((k) => !/^(id|__|@odata)/.test(k) && k !== "displayName" && k !== "name").length === 0;
    };
    // One row's reason it cannot be exported, or "" — the same rule the
    // table paints red and the button reads.
    function rowIssue(secId, it, raw) {
      if (!raw) return "no body in the read — export from a cache-backed read";
      if (raw.__detailError) return `its settings could not be read: ${raw.__detailError}`;
      if (bodyLooksEmpty(secId, raw)) return "its body came back empty — it would be exported as a policy that configures nothing";
      return "";
    }
    // What the read knows, surface by surface, and what stops the export.
    function exportReadiness(res) {
      const surfaces = [], blockers = [];
      for (const sec of (res && res.sections) || []) {
        const raws = new Map((sec.raw || []).map((r) => [String(r.id).toLowerCase(), r]));
        let baseline = 0, bad = 0;
        for (const it of sec.items || []) {
          if (!looksBaseline(it.name)) continue;
          baseline++;
          const why = rowIssue(sec.id, it, raws.get(String(it.id).toLowerCase()) || null);
          if (why) { bad++; blockers.push({ kind: "row", label: it.name, why, section: sec.id }); }
        }
        surfaces.push({ id: sec.id, label: sec.label, expected: (sec.items || []).length, read: (sec.raw || []).length, baseline, bad });
      }
      for (const f of (res && res.failed) || []) blockers.push({ kind: "surface", label: f.label, why: f.error || "the surface could not be read" });
      for (const p of (res && res.partial) || []) blockers.push({ kind: "surface", label: p.label, why: (p.notes || []).join("; ") || "read in part" });
      return { surfaces, blockers, ready: blockers.length === 0 };
    }

    // `wanted` — the ids ticked on the Export table, or null for all of
    // them (§4.4's per-row and per-section selection).
    async function buildExport(res, tenantName, wanted) {
      const policies = [], skipped = [];
      const surfaces = {};
      for (const sec of res.sections || []) {
        for (const it of sec.items || []) {
          if (!looksBaseline(it.name)) continue;
          if (wanted && !wanted.has(String(it.id))) continue;
          const raw = (sec.raw || []).find((r) => String(r.id).toLowerCase() === String(it.id).toLowerCase()) || null;
          const area = AREA_OF_SECTION[sec.id] || null;
          const issue = rowIssue(sec.id, it, raw);
          if (issue) { skipped.push({ name: it.name, why: issue }); continue; }
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
      // SAME CONTENT, DIFFERENT IDENTITY — NOT FOLDED (§4.4). Two policies
      // with one key are one identity re-cut, and the newest wins. Two
      // policies with the same HASH under DIFFERENT keys are a different
      // problem: somebody made a copy and renamed it, and which of the two
      // names is the baseline is not a question an export can answer. Both
      // are kept, both are listed, and Housekeeping is where it is settled
      // — in the tenant, by a person, before the next cut.
      const byHash = new Map();
      for (const p of kept) { if (!p.hash) continue; if (!byHash.has(p.hash)) byHash.set(p.hash, []); byHash.get(p.hash).push(p); }
      const duplicates = [...byHash.values()].filter((g) => g.length > 1).map((g) => ({ hash: g[0].hash, names: g.map((p) => p.name) }));
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
        duplicates,
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
      if ((built.duplicates || []).length) {
        L.push(`## Same content under two names (${built.duplicates.length})`, "");
        L.push("Both are kept — which name is the baseline is not a question an export can answer. 🧹 Housekeeping settles it in the tenant, then re-cut.", "");
        for (const d of built.duplicates) L.push(`- ${d.names.map((n) => `\`${n}\``).join(" and ")} have identical canonical bodies`);
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

    // ================================================================
    // THE PRE-PILOT ASSIGNMENT (§8.3, build 10591)
    // ================================================================
    // Import has always created everything unassigned, on the argument
    // that reach is the Assignment editor's act. That is right for reach
    // in general and wrong for the one case this tool exists for: a
    // baseline arriving on a new tenant is going to a PILOT first, every
    // time, and making somebody open a second tool to say so for eighty
    // policies is the tool refusing to finish its own sentence.
    //
    // So there is exactly one assignment Import will make: the two
    // PRE-PILOT groups, by their exact display names, chosen by the
    // policy's own D/U token. Device policies go to the device group,
    // user policies to the user group, and a policy whose token cannot be
    // read goes NOWHERE until a person picks one on the row.
    //
    // The groups are looked up, never created, and a missing group is a
    // WARNING, not a stop: the policies are still created, unassigned,
    // and the plan says so before anything is written. An import that
    // refuses to run because a group is absent would be the tool putting
    // its own convenience ahead of the thing being asked for.
    const PILOT_GROUPS = { D: "INT-SEC-D-PRE-PILOT", U: "INT-SEC-U-PRE-PILOT" };
    // Surfaces where D is the only honest answer: a policy that cannot
    // target a user at all is a device policy, and asking is theatre.
    const DEVICE_ONLY_SECTIONS = new Set(["autopilot", "enrolment", "esp", "scripts", "remediations", "customAttributes", "filters", "updates", "driverUpdates"]);
    // the D/U for one catalog row: its own token, then its surface, then
    // nothing — and nothing means the row asks (§8.3)
    const duFor = (p) => p.du || (DEVICE_ONLY_SECTIONS.has(p.section) ? "D" : "");
    // Where an assignment is POSTed, per area. Filters have none — an
    // assignment filter is not assigned, it is referenced by assignments.
    const ASSIGN_PATH = {
      SettingsCatalog: (id) => `/deviceManagement/configurationPolicies/${id}/assign`,
      DeviceConfigurations: (id) => `/deviceManagement/deviceConfigurations/${id}/assign`,
      CompliancePolicies: (id) => `/deviceManagement/deviceCompliancePolicies/${id}/assign`,
      AdmxPolicies: (id) => `/deviceManagement/groupPolicyConfigurations/${id}/assign`,
    };
    const assignPathFor = (area, id) => (ASSIGN_PATH[area] ? ASSIGN_PATH[area](id) : null);
    // Look the two groups up by EXACT display name. Not found is an
    // answer, not an error: the caller warns and imports unassigned.
    async function findPilotGroups() {
      const out = { D: null, U: null, error: "" };
      try {
        for (const k of ["D", "U"]) {
          const name = PILOT_GROUPS[k];
          const r = await Graph.readAll(Graph.odata`/groups?$filter=displayName eq '${name}'` + "&$select=id,displayName",
            { scopes: Graph.SCOPES.groups, retry: true });
          const hit = (r || []).find((g) => String(g.displayName) === name);
          if (hit) out[k] = { id: hit.id, displayName: hit.displayName };
        }
      } catch (e) { out.error = String((e && e.message) || e); }
      return out;
    }
    async function assignToGroup(area, id, groupId) {
      const path = assignPathFor(area, id);
      if (!path) throw new Error("this surface has no assign action here");
      await Graph.post(Graph.BETA + path, {
        assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId } }],
      }, { scopes: Graph.SCOPES.profiles });
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


    // A proposed canonical name — a STARTING POINT for the rename field.
    // Takes a policy-shaped row ({ name, section, folder, du }); the SPEC
    // knows what its platform's convention looks like. The release stamped
    // is `rel` when the caller has one (a community cut is dated by its
    // sourceDate, §8.5) and this month otherwise.
    function proposeName(row, rel) {
      const r = rel || currentRelease();
      return spec.proposeName(row || {}, `R${r.y}.${r.m}`);
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
    // `rows` is what the person is LOOKING AT (§4.1) — the filtered table,
    // not the whole comparison. A report that quietly widens the filters is
    // a different document from the screen it claims to print, and the
    // person sending it on would not know.
    const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    function toMd(cmp, tenantName, rows) {
      const cat = cmp.catalog, comm = isCommunity(cat);
      const list = rows || cmp.rows;
      const relver = (rel, ver) => comm ? (ver ? `v${ver}` : "—") : `${relLabel(rel)}${ver ? ` · v${ver}` : ""}`;
      const L = [];
      L.push(`# ${spec.platform} baseline gap — ${mdEsc(tenantName || "tenant")} vs ${mdEsc(comm ? `${cat.label} ${cat.release}` : `the CloudFellows ${spec.platform} baseline ${cat.release || "(no release)"}`)}`, "");
      L.push(typeof Brand !== "undefined" && Brand.generatedBy ? Brand.generatedBy() : `Generated by TUNO ${typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""}`);
      if (comm && cat.url) L.push(`Baseline source: ${cat.url}${cat.commit ? ` (commit ${String(cat.commit).slice(0, 7)})` : ""}`);
      L.push("");
      L.push(`- Coverage: **${cmp.covered} of ${cmp.baselineTotal}** catalog policies present in the tenant.`);
      Object.keys(STATUS).sort((a, b) => STATUS[a].order - STATUS[b].order)
        .forEach((k) => { if (cmp.counts[k]) L.push(`- ${STATUS[k].label}: **${cmp.counts[k]}** — ${STATUS[k].why}`); });
      const toImport = list.filter((r) => r.baseline && !r.baseline.tampered && (r.status === "missing" || r.status === "outdated"));
      L.push(`- Import would create **${toImport.length}** of the rows below.`);
      if (list.length !== cmp.rows.length) L.push(`- **${list.length} of ${cmp.rows.length} rows** are printed here: this is the filtered table, exactly as it was on the screen.`);
      L.push("");
      L.push("| Status | Catalog policy | In this tenant | Surface | Catalog | Tenant |");
      L.push("| --- | --- | --- | --- | --- | --- |");
      for (const r of list) {
        const sec = (r.baseline && r.baseline.sectionLabel) || (r.tenant && r.tenant.sectionLabel) || "";
        const note = [r.byToken ? `by ${cat.idToken}` : "", r.how === "hash" ? "by content" : "",
          r.how === "similarity" ? `${Math.round((r.score || 0) * 100)}% alike` : "",
          r.duplicates ? `×${r.duplicates}` : "", r.twinOf ? `same content as ${r.twinOf}` : ""].filter(Boolean).join(", ");
        L.push(`| ${STATUS[r.status].label} | ${mdEsc(r.baseline ? r.baseline.name : "—")} | ${mdEsc(r.tenant ? r.tenant.name : "—")}${note ? ` (${mdEsc(note)})` : ""} | ${mdEsc(sec)} | ${r.baseline ? relver(comm ? null : r.bRel, r.bVer) : "—"} | ${r.tenant ? relver(comm ? null : r.tRel, r.tVer) : "—"} |`);
        if (r.status === "differs" && r.diff) {
          r.diff.added.forEach((d) => L.push(`|  | ↳ the catalog sets \`${mdEsc(d.id)}\` = ${mdEsc(d.theirs)} |  |  |  |  |`));
          r.diff.changed.forEach((d) => L.push(`|  | ↳ \`${mdEsc(d.id)}\`: tenant ${mdEsc(d.ours)} → catalog ${mdEsc(d.theirs)} |  |  |  |  |`));
          r.diff.removed.forEach((d) => L.push(`|  | ↳ only in the tenant: \`${mdEsc(d.id)}\` = ${mdEsc(d.ours)} |  |  |  |  |`));
        }
        if (r.status === "review" && r.candidates) {
          r.candidates.forEach((x) => L.push(`|  | ↳ candidate: ${mdEsc(x.name)} (${Math.round(x.score * 100)}%) |  |  |  |  |`));
        }
      }
      L.push("");
      if (toImport.length) {
        L.push("## Import would create", "");
        for (const r of toImport) L.push(`- **${mdEsc(r.baseline.name)}**${r.status === "outdated" ? ` — this tenant has ${mdEsc(relver(comm ? null : r.tRel, r.tVer))}, the catalog has ${mdEsc(relver(comm ? null : r.bRel, r.bVer))}; a NEW copy is created and the old one left for Housekeeping` : " — not present"}`);
        L.push("");
      }
      return L.join("\n");
    }

    return {
      spec,
      releaseOf, normRel, relCmp, currentRelease, versionOf, looksBaseline, keyOf, relLabel, cmpVersion, cmpRelVer,
      STATUS, bundled, community, isCommunity, catLooks, tokenOf, parseCatalog, compare, buildExport, importEntries, AREA_OF_SECTION,
      CATALOG_SCHEMA, COMMUNITY_KIND, canonicalBody, canonicalJson, hashBody, hashAll, duOf,
      exportReadiness, rowIssue, bodyLooksEmpty,
      shapeErrors, verifyHashes, loadCatalog, releaseOfSet,
      SIMILARITY_MIN, REVIEW_MARGIN, ATTENTION, jaccard, anchorOf, kindOfSection,
      PILOT_GROUPS, DEVICE_ONLY_SECTIONS, duFor, assignPathFor, findPilotGroups, assignToGroup,
      defIdsOf, cleanBody, kindOf, parseUpstream, buildCommunity,
      proposeName, diffPolicies, toMd,
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
      planned: null, plannedFilters: null,
      hashes: null,          // policy id -> content hash, computed when the read lands
      pilot: null,           // the two PRE-PILOT groups, as the dry run found them
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
      for (const h of ["Body", "Rename", "Housekeeping"]) {
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

    let mode = "compare";      // compare · import · rename · export · housekeeping · help
    // No assignment is the default (§4.2): reach is a decision, and the
    // tool does not make it for you by starting with it switched on.
    let assignMode = "none";   // none | pilot
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
      // NATIVE BUTTONS (finding 10). The rail was <div role="button"
      // tabindex="0"> with a click handler, which looks right and is not:
      // Enter and Space did nothing, so the whole tool was mouse-only. A
      // <button> gets both keys, the focus ring and the disabled state for
      // free, and aria-selected says which one is on the table.
      const node = (k, icon, label, right, bad) => `<button type="button" class="ep-node${mode === k ? " active" : ""}" data-${P}mode="${k}" aria-selected="${mode === k}" style="width:100%;border:none;background:none;font:inherit;color:inherit;text-align:left">
        <span>${icon} ${label}</span><span class="ep-n${bad ? " gap" : ""}">${right}</span></button>`;
      const att = S.cmp ? S.cmp.attention : null;
      const rn = S.res ? E.renameProposals(vms(), communityCatalog()).filter((r) => r.status === "propose").length : null;
      const hk = S.res ? E.housekeeping(vms()).reduce((a, g) => a + g.retire.length, 0) : null;
      el.innerHTML = [
        tenantLine(),
        node("compare", "🔍", "Compare", S.cmp ? (att ? `${att} to fix` : "in step") : c ? `${c.policies.length}` : "—", att > 0),
        node("import", "📥", "Import", S.cmp ? `${importable().length} to create` : c ? `${c.policies.length}` : "no catalog", !c),
        node("rename", "✏️", "Rename", S.res ? (rn ? `${rn} to stamp` : "all stamped") : "read first", rn > 0),
        ...(isCfdev() ? [node("export", "📤", "Export", S.res ? "ready" : "read first", false)] : []),
        node("housekeeping", "🧹", "Housekeeping", S.res ? (hk ? `${hk} old cop${hk === 1 ? "y" : "ies"}` : "tidy") : "read first", hk > 0),
        `<hr>`,
        node("help", "❓", "How it works", "", false),
      ].join("");
    }

    // ---- the source picker (§4.1) ----
    // ONE PICKER, NOT TWO SCREENS. Compare and Upstream were separate
    // screens with separate reports and separate plans, which is how
    // "compare says X, upstream says Y" became a thing anyone had to
    // resolve. There is one table now, one matcher, one vocabulary, and
    // this picker says which catalog it is comparing against.
    function sourcePicker() {
      const list = catalogs();
      if (!list.length) return "";
      const btn = (c) => `<button type="button" class="${c.id === catId ? "active" : ""}" data-${P}cat="${c.id}" aria-selected="${c.id === catId}" title="${esc(c.sub)}">${c.icon} ${esc(c.label)} <span class="mini">· ${c.cat.policies.length}</span></button>`;
      return `<div class="seg" id="${ID("Cat")}" style="margin:0 0 10px">${list.map(btn).join("")}
        <button type="button" data-${P}cat="file" aria-selected="${catId === "file"}" class="${catId === "file" ? "active" : ""}" title="Compare against a catalog file you have — an export from another tenant, or an older cut">📄 File…</button>
        <input type="file" id="${ID("File")}" accept=".json" style="display:none"></div>`;
    }
    function catalogLine(c) {
      if (E.isCommunity(c)) {
        const bundle = E.community();
        const when = c.sourceDate ? `published ${esc(c.sourceDate)}` : "no publication date";
        return `<p class="mini muted" style="margin:0 0 10px">${esc(c.label)}${c.release ? ` <b>v${esc(c.release)}</b>` : ""} by ${esc(c.author || "the community")} — ${when}, ${c.policies.length} policies, <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(String(c.url).replace(/^https?:\/\//, ""))}</a>${c.commit ? ` @ ${esc(String(c.commit).slice(0, 7))}` : ""}.
          ${S.fetchedCat
            ? `<b>Read live from github.com this session.</b>${bundle ? ` The copy in the repository is v${esc(bundle.release || "?")}, ${esc(bundle.sourceDate || "undated")}.` : ""} <button class="btn sm" id="${ID("FetchRevert")}">↩ Use the repository's copy</button>${isCfdev() ? ` <button class="btn sm" id="${ID("CommZip")}" title="Write this cut as ${esc(spec.communityPath.replace(/\/catalog\.json$/, "/"))} — unzip at the repo root and it becomes the copy every tenant reads">📁 Community folder (zip)</button>` : ""}`
            // SAY WHAT THE BUTTON DOES (finding 12). "Fetch latest" used to
            // sit next to prose about zips and content-security policy that
            // described a road the button does not take.
            : `<button class="btn sm" id="${ID("Fetch")}">🌐 Fetch latest from github.com</button> <span class="muted">reads ${esc(spec.upstream.repo)} directly — two API calls and one read per policy, no token, no download — and compares against that instead of the copy in this repository.</span>`}
          <span class="mini" id="${ID("FetchNote")}"></span></p>`;
      }
      const mix = (c.releaseMix && Object.keys(c.releaseMix).length > 1)
        ? ` <span class="gu-how priv" title="The release is the newest cut any policy here wears; more than one is present, and this is the census">${esc(Object.entries(c.releaseMix).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(", "))}</span>` : "";
      return `<p class="mini muted" style="margin:0 0 10px">Release <b>${esc(c.release || "(none)")}</b>${mix} · ${c.policies.length} policies · ${cfSource() === "file"
        ? `loaded from a file${c.tenant ? ` (exported from ${esc(c.tenant)}${c.exported ? `, ${esc(String(c.exported).slice(0, 10))}` : ""})` : ""}`
        : `${esc(spec.catalogPath)}${c.tenant ? `, exported from ${esc(c.tenant)}` : ""}${c.exported ? ` on ${esc(String(c.exported).slice(0, 10))}` : ""}`}${c.__verify && c.__verify.tampered ? ` · <span class="gu-how exc">${c.__verify.tampered} body did not match its hash</span>` : ""}.</p>`;
    }

    // ---- the filters (§4.1). Not tenant state: a person's place in the
    // screen, kept across a re-read the way a scroll position is.
    let filters = new Set(E.ATTENTION);
    let q = "", secFilter = "", duFilter = "";
    const filteredRows = () => {
      if (!S.cmp) return [];
      const needle = q.trim().toLowerCase();
      return S.cmp.rows.filter((r) => {
        if (filters.size && !filters.has(r.status)) return false;
        if (secFilter && sectionOf(r) !== secFilter) return false;
        if (duFilter && duOfRow(r) !== duFilter) return false;
        if (!needle) return true;
        const hay = [r.baseline && r.baseline.name, r.tenant && r.tenant.name, r.key,
          r.baseline && r.baseline.sectionLabel, r.tenant && r.tenant.sectionLabel].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(needle);
      });
    };
    const sectionOf = (r) => (r.baseline && r.baseline.section) || (r.tenant && r.tenant.section) || "";
    const sectionLabelOf = (r) => (r.baseline && r.baseline.sectionLabel) || (r.tenant && r.tenant.sectionLabel) || sectionOf(r);
    const duOfRow = (r) => (r.baseline && r.baseline.du) || (r.tenant && r.tenant.du) || "";
    // What Import would create — the ONE definition, read by the rail, the
    // Import pane and the plan (finding 4).
    const importable = () => (S.cmp ? S.cmp.rows.filter((r) => r.baseline && !r.baseline.tampered && (r.status === "missing" || r.status === "outdated")) : []);

    const CFDEV_ONLY = new Set(["export"]);
    function render(sourceNote) {
      if (sourceNote) S.lastSource = sourceNote;
      if (CFDEV_ONLY.has(mode) && !isCfdev()) mode = "compare";
      const c = activeCatalog();
      renderSeg();
      const parts = [];
      if (S.lastSource) parts.push(`<p class="mini muted" style="margin:0 0 8px">${S.lastSource}</p>`);

      const comm = E.isCommunity(c);
      if (mode === "compare" || mode === "import") parts.push(sourcePicker());
      if (c) { if (mode === "compare" || mode === "import") parts.push(catalogLine(c)); }
      else parts.push(`<div class="list-card"><p class="mini" style="margin:0">${isCfdev()
        ? `<b>No catalog could be read — and this is the tenant that makes it.</b> ${esc(spec.readLabel)}, ✏️ Rename what lacks its tag, 🧹 retire the old copies, then 📤 Export → Repo folder: unzipped at the repo root it becomes ${esc(spec.catalogPath)}, the file this screen reads.`
        : `<b>No catalog could be read from ${esc(spec.catalogPath)}.</b> Pick 📄 File… above and load one. Until a catalog is present this screen can only list which policies WEAR the convention, not judge them.`}${catalogErrors.length ? `<br><span class="mini muted">${catalogErrors.map(esc).join(" · ")}</span>` : ""}</p></div>`);

      if (mode === "compare") {
        if (S.cmp) {
          // STATUS CARDS ARE FILTERS (finding 11). They were a read-only
          // scoreboard above a table of every row in the catalog — a
          // hundred and forty lines, no way to narrow them, and the
          // explanation of the matching rules standing between the cards
          // and the answer. Clicking a card toggles its rows; the default
          // is everything that needs attention, which is the question
          // anyone opens this screen with.
          const card = (k) => {
            const st = E.STATUS[k], n = S.cmp.counts[k] || 0;
            const on = filters.has(k);
            return `<button type="button" class="au-card${on ? " active" : ""}" data-${P}filter="${k}" aria-pressed="${on}" title="${esc(st.why)}" style="text-align:left;font:inherit;color:inherit;cursor:pointer${on ? "" : ";opacity:.55"}">
              <div class="au-card-l">${st.icon} ${esc(st.label)}</div><div class="au-card-n ${n ? st.cls : ""}">${n}</div><div class="au-card-s">${esc(st.why)}</div></button>`;
          };
          const sections = [...new Set(S.cmp.rows.map(sectionOf).filter(Boolean))].sort();
          parts.push(`<div class="au-cards" id="${ID("Cards")}">${Object.keys(E.STATUS).sort((a, b) => E.STATUS[a].order - E.STATUS[b].order).map(card).join("")}</div>
            <div class="list-card">
              <div class="ep-bar">
                <input id="${ID("Q")}" placeholder="Search name, key or area…" value="${esc(q)}">
                <select id="${ID("Sec")}"><option value="">Every surface</option>${sections.map((s) => `<option value="${esc(s)}"${s === secFilter ? " selected" : ""}>${esc(sectionLabelOf(S.cmp.rows.find((r) => sectionOf(r) === s)))}</option>`).join("")}</select>
                <select id="${ID("Du")}"><option value="">D and U</option><option value="D"${duFilter === "D" ? " selected" : ""}>D — device</option><option value="U"${duFilter === "U" ? " selected" : ""}>U — user</option></select>
                <button class="btn" id="${ID("Clear")}">Show everything</button>
                <span class="spacer" style="flex:1"></span>
                <button class="btn" id="${ID("Md")}" title="The rows you are looking at, as Markdown — exactly the filtered table">📝 Gap report</button>
              </div>
              <div class="gu-tw"><table class="cg-table"><thead><tr>
                <th style="width:150px">Status</th><th>Catalog ↔ this tenant</th><th style="width:130px">Surface</th>
                <th style="width:110px">Catalog</th><th style="width:110px">Tenant</th><th style="width:120px">Content</th><th style="width:80px"></th>
              </tr></thead><tbody id="${ID("CmpRows")}"></tbody></table></div>
              <p class="mini muted" id="${ID("CmpFoot")}" style="margin:8px 0 0"></p>
            </div>`);
        } else if (c && !S.res) {
          // THE BASELINE IS ALWAYS SHOWN (build 10530, Mihai's rule): the
          // catalog is known before any read, so its rows render at once —
          // and the tenant columns say NOT READ, never missing.
          parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">The catalog, line by line (${c.policies.length})</h4>
            <p class="mini muted" style="margin:0 0 8px">${esc(spec.readLabel)} fills the right-hand columns — until then this tenant's side is unknown, not missing.</p>
            <div class="gu-tw"><table class="cg-table"><thead><tr><th>Catalog policy</th><th style="width:130px">Surface</th><th style="width:110px">Catalog</th><th style="width:110px">Tenant</th></tr></thead>
            <tbody>${c.policies.map((b2) => `<tr>
              <td class="mini">${esc(b2.name)}</td>
              <td class="mini muted">${esc(b2.sectionLabel || b2.section || "")}</td>
              <td class="mini">${esc(b2.release || "—")}${b2.version ? ` · v${esc(b2.version)}` : ""}</td>
              <td class="mini muted">not read</td>
            </tr>`).join("") || `<tr><td colspan="4" class="mini">The catalog is empty.</td></tr>`}</tbody></table></div></div>`);
        } else if (S.res && !c) {
          const worn = vms().filter((v) => E.looksBaseline(v.name));
          parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">Policies wearing the convention (${worn.length})</h4>
            ${worn.length ? `<ul class="mini" style="margin:6px 0 0">${worn.map((w) => `<li>${esc(w.name)} <span class="muted">(${esc(E.relLabel(E.releaseOf(w.name)))}${E.versionOf(w.name) ? ` · v${esc(E.versionOf(w.name))}` : " · no version in the name"})</span></li>`).join("")}</ul>` : `<p class="mini muted" style="margin:0">None — no policy name starts with ${esc(spec.prefix)} and carries an Ryy.m release tag.</p>`}</div>`);
        }
        if (S.res && S.res.failed && S.res.failed.length) {
          parts.push(`<div class="gu-fail"><b>${S.res.failed.length} surface${S.res.failed.length === 1 ? "" : "s"} could not be read</b><span class="why">${S.res.failed.map((f) => esc(f.label)).join(", ")} — a baseline policy living there would read as missing, so these rows are floors, not verdicts.</span></div>`);
        }
      }

      if (mode === "help") parts.push(helpHtml());

      if (mode === "export") {
        const ready = S.res ? E.exportReadiness(S.res) : null;
        const all = S.res ? vms() : [];
        const wearing = all.filter((v) => E.looksBaseline(v.name));
        const notWearing = all.filter((v) => !E.looksBaseline(v.name) && spec.prefixRe.test(v.name || ""));
        const raws = new Map();
        for (const sec of (S.res && S.res.sections) || []) for (const r of sec.raw || []) raws.set(String(r.id).toLowerCase(), r);
        const bySec = new Map();
        for (const v of wearing) { if (!bySec.has(v.section)) bySec.set(v.section, []); bySec.get(v.section).push(v); }

        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">📤 Export the catalog <span class="mini muted">— the reference tenant authors it, so only here</span></h4>
          <p class="mini muted" style="margin:0 0 8px">Cuts the catalog from this tenant's ${esc(spec.prefix)} policies. Bodies go through the canonical cleaner first — ids, timestamps, assignments and scope tags come off — and each carries the SHA-256 of what is written. <b>The folder is the catalog</b>: unzip 📁 Repo folder at the repository root and ${esc(spec.catalogPath)} is the new reference on the next push. Each identity is exported <b>once, the newest</b>; the release is derived from the policies, never typed.</p>
          ${!S.res ? `<p class="mini muted" style="margin:0">${esc(spec.readLabel)} first — the export is cut from the read.</p>` : `
            <div class="gu-tw"><table class="cg-table"><thead><tr><th>Surface</th><th style="width:110px">Read</th><th style="width:130px">Wears ${esc(spec.prefix)}</th><th style="width:130px">Not exportable</th></tr></thead><tbody>
              ${ready.surfaces.filter((s) => s.baseline || s.bad).map((s) => `<tr><td class="mini">${esc(s.label)}</td><td class="mini">${s.read} of ${s.expected}</td><td class="mini">${s.baseline}</td><td class="mini${s.bad ? '" style="color:var(--off)' : ""}">${s.bad || "—"}</td></tr>`).join("") || `<tr><td colspan="4" class="mini muted">No policy on any surface wears the convention.</td></tr>`}
            </tbody></table></div>
            ${ready.ready ? "" : `<div class="gu-fail"><b>Export is disabled: this read is incomplete.</b><span class="why">A catalog cut from a partial read is confidently wrong and every other tenant would then read it as the baseline. ${ready.blockers.slice(0, 6).map((b) => `<br>• <b>${esc(b.label)}</b> — ${esc(b.why)}`).join("")}${ready.blockers.length > 6 ? `<br>• …and ${ready.blockers.length - 6} more` : ""}<br><br>${esc(spec.readLabel)} again; if a surface keeps failing it is a permission, not a glitch.</span></div>`}
            <div class="tb-actions" style="margin:10px 0 0">
              <button class="btn primary" id="${ID("ExportZip")}" ${ready.ready ? "" : "disabled"} title="baseline/${esc(spec.platform.toLowerCase())}/ with catalog.json, one JSON per policy and a README index — unzip at the repo root">📁 Repo folder (zip)</button>
              <button class="btn" id="${ID("Export")}" ${ready.ready ? "" : "disabled"}>⬇ Catalog file (JSON)</button>
              <button class="btn" id="${ID("ExAll")}">☑ Select all</button>
              <button class="btn" id="${ID("ExNone")}">☐ Select none</button>
              <span class="mini muted" id="${ID("ExCount")}"></span>
            </div>
            <span class="mini muted" id="${ID("ExportNote")}"></span>
            <div class="gu-tw" style="margin-top:10px"><table class="cg-table"><thead><tr><th style="width:30px"><input type="checkbox" id="${ID("ExMaster")}" checked></th><th>Policy</th><th style="width:110px">Release</th><th style="width:90px">Version</th><th style="width:60px">D/U</th></tr></thead><tbody>
              ${[...bySec.entries()].map(([secId, list]) => `
                <tr><td><input type="checkbox" data-${P}exsec="${esc(secId)}" checked title="Every policy on this surface"></td><td class="mini" colspan="4"><b>${esc(list[0].sectionLabel || secId)}</b> <span class="muted">(${list.length})</span></td></tr>
                ${list.map((v) => {
                  const why = E.rowIssue(secId, v, raws.get(String(v.id).toLowerCase()) || null);
                  return `<tr${why ? ` style="color:var(--off)"` : ""}>
                    <td style="padding-left:20px">${why ? "" : `<input type="checkbox" data-${P}extick="${esc(v.id)}" data-${P}exsecof="${esc(secId)}" checked>`}</td>
                    <td class="mini" style="padding-left:20px">${esc(v.name)}${why ? ` <span class="gu-how exc">${esc(why)}</span>` : ""}</td>
                    <td class="mini">${esc(E.relLabel(E.releaseOf(v.name)))}</td>
                    <td class="mini">${E.versionOf(v.name) ? `v${esc(E.versionOf(v.name))}` : `<span class="muted">—</span>`}</td>
                    <td class="mini">${esc(v.du || "")}</td></tr>`;
                }).join("")}`).join("") || `<tr><td colspan="5" class="mini muted">Nothing wears the convention yet.</td></tr>`}
            </tbody></table></div>
            ${notWearing.length ? `<h4 style="margin:16px 0 6px">Wears <code>${esc(spec.prefix)}</code> but not the convention (${notWearing.length})</h4>
              <p class="mini muted" style="margin:0 0 6px">Not exported — a policy with no release tag has no place in an ordered catalog. <button class="btn sm" id="${ID("ExRename")}">✏️ Rename first</button></p>
              <ul class="mini muted" style="margin:0">${notWearing.slice(0, 40).map((v) => `<li>${esc(v.name)}</li>`).join("")}${notWearing.length > 40 ? `<li>…and ${notWearing.length - 40} more</li>` : ""}</ul>` : ""}
          `}</div>`);
      }

      if (mode === "import") {
        // PLAN FROM THE COMPARISON, NOT FROM THE CATALOG (finding 4). The
        // plan used to be built from the catalog and filtered afterwards;
        // now the rows themselves are the plan, and a row that is not
        // `missing` or `outdated` carries the reason it cannot be.
        const gap = importable();
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">📥 Import <span class="tag block">writes to the tenant</span></h4>
          <p class="mini muted" style="margin:0 0 8px">Creates only what the comparison calls <b>missing</b> or <b>outdated</b> — nothing else is importable, and every other row says why on itself. A policy found by token, name, content or similarity is present whatever it is called here; creating it again would make a copy. An <b>outdated</b> row creates a NEW copy under the catalog name and leaves the old one for 🧹 Housekeeping — Import never edits a policy's content. ${comm
            ? `Names and descriptions are the author's own, verbatim${c && c.idToken ? ` — the ${esc(c.idToken)} token included, so ${esc(c.label)}'s own deployer can update them later as if it had created them` : ""}.`
            : `Names are the catalog's — the name is the identity this screen matches on.`}</p>
          <fieldset style="border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin:0 0 10px">
            <legend class="mini muted" style="padding:0 6px">Where the created policies land</legend>
            <label class="mini" style="display:block"><input type="radio" name="${ID("Asg")}" value="none"${assignMode === "none" ? " checked" : ""}> <b>No assignment</b> — created and reaching nobody. Reach is ✏️ the Assignment editor's act, taken afterwards.</label>
            <label class="mini" style="display:block;margin-top:4px"><input type="radio" name="${ID("Asg")}" value="pilot"${assignMode === "pilot" ? " checked" : ""}> <b>Assign to the pilot groups</b> — device policies to <code>${esc(E.PILOT_GROUPS.D)}</code>, user policies to <code>${esc(E.PILOT_GROUPS.U)}</code>, chosen by the policy's own D/U token. The groups are looked up at dry run and never created; a missing one is a warning and the import still runs, unassigned.</label>
          </fieldset>
          <div class="tb-actions">
            <button class="btn" id="${ID("Dry")}" ${gap.length ? "" : "disabled"}>🔍 Dry run — ${gap.length} to create</button>
          </div>
          ${S.cmp ? "" : `<p class="mini muted" style="margin:8px 0 0">${esc(spec.readLabel)} first — the plan is cut from the comparison.</p>`}
          <div id="${ID("Plan")}" style="margin-top:10px">${S.lastWrite && S.lastWrite.failedHtml ? `<p class="mini" style="margin:0 0 6px">From the last import:</p>${S.lastWrite.failedHtml}` : ""}</div></div>`);
      }

      if (mode === "housekeeping") {
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">🧹 Housekeeping <span class="tag block">deletes from the tenant</span></h4>
          <p class="mini muted" style="margin:0 0 8px">The copies a re-cut left behind. Every identity this tenant carries <b>more than once</b>: the newest release and version is kept, the older copies are offered for deletion and ticked. An older copy that still has <b>assignments is refused</b> — deleting it would take reach away the kept copy does not have; move the reach in ✏️ the Assignment editor first. Dry run reads each policy again before anything is deleted, and every delete is verified by a read-back that fails to find it. <b>📦 Back up first</b> — a deleted policy does not come back from here.</p>
          ${S.res ? "" : `<p class="mini muted" style="margin:0">${esc(spec.readLabel)} first — the list is cut from the read.</p>`}</div>`);
      }

      if (mode === "rename") {
        const co = communityCatalog();
        parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">✏️ Rename <span class="tag block">writes to the tenant</span></h4>
          <p class="mini muted" style="margin:0 0 8px">Brings names into the convention. A policy that starts with <code>${esc(spec.prefix)}</code> and ends in a version but carries <b>no <code>Ryy.m</code> release tag</b> is proposed one, cut from its <b>last-modified date</b> — a proposal, not a verdict: last-modified means last <i>touched</i>, so every name is editable before it is written. ${co && co.nameRe ? `<b>${esc(co.label)}'s own names are never proposed</b>: keeping them is what lets its deployer maintain them.` : ""} Each rename is a PATCH on the policy's own surface, re-checked for drift and for a name collision immediately before it is written, then verified by reading it back.</p>
          ${S.res ? "" : `<p class="mini muted" style="margin:0">${esc(spec.readLabel)} first — the list is cut from the read.</p>`}</div>`);
      }

      $(ID("Body")).innerHTML = parts.join("");
      if (mode === "compare" && S.cmp) renderCompareTable();
      // the rename table has its own host — proposals are DOM state that a
      // re-render of the body would silently drop
      const rh = $(ID("Rename"));
      if (rh) {
        rh.style.display = mode === "rename" ? "" : "none";
        if (mode === "rename" && S.res && !rh.dataset.for) renderRename();
      }
      const hh = $(ID("Housekeeping"));
      if (hh) {
        hh.style.display = mode === "housekeeping" ? "" : "none";
        if (mode === "housekeeping" && S.res && !hh.dataset.for) renderHousekeeping();
      }
      wire();
    }

    // ---- the table, drawn on its own so the toolbar never re-renders ----
    // T15's rule: a control that re-renders while you are typing in it
    // eats the keystroke. The search box, the two selects and the cards
    // are painted by render(); only the rows below them are repainted
    // when a filter moves.
    function renderCompareTable() {
      const host = $(ID("CmpRows"));
      if (!host || !S.cmp) return;
      const c = S.cmp.catalog, comm = E.isCommunity(c);
      const rows = filteredRows();
      const relver = (rel, ver) => {
        const r = rel ? esc(E.relLabel(rel)) : "";
        return (r && r !== "—" ? r : "") + (ver ? `${r && r !== "—" ? " · " : ""}v${esc(ver)}` : "") || `<span class="muted">—</span>`;
      };
      const how = (r) => r.byToken ? `<span class="gu-how inc" title="Identified by the ${esc(c.idToken || "author's")} token in its description — the name did not have to match">${esc(c.idToken || "token")}</span>`
        : r.how === "hash" ? `<span class="gu-how priv" title="The canonical bodies are byte-equal — the same policy under another name">by content</span>`
          : r.how === "similarity" ? `<span class="gu-how priv" title="Matched by similarity — ${Math.round((r.score || 0) * 100)}% of the union of what the two configure, and the same template family">${Math.round((r.score || 0) * 100)}% alike</span>` : "";
      const content = (r) => {
        if (!r.tenant || !r.baseline) return `<span class="muted">—</span>`;
        if (r.contentSame === true) return `<span class="gu-how inc">identical</span>`;
        if (r.contentSame === false) {
          const d = r.diff || { added: [], changed: [], removed: [] };
          return `<button type="button" class="gu-how" data-${P}diff="${esc(r.key)}" style="cursor:pointer;border:none;font:inherit" title="${d.added.length} the catalog sets and this tenant does not · ${d.changed.length} different values · ${d.removed.length} only here">↗ ${d.added.length + d.changed.length + d.removed.length} differ</button>`;
        }
        return `<span class="muted" title="One side has no body in this read, so the two cannot be compared">not compared</span>`;
      };
      host.innerHTML = rows.map((r) => {
        const st = E.STATUS[r.status];
        const cat = r.baseline ? esc(r.baseline.name) : `<span class="muted">not in the catalog</span>`;
        const ten = r.tenant ? esc(r.tenant.name) : `<span class="gu-how exc">not in this tenant</span>`;
        return `<tr>
          <td class="mini"><span class="gu-how ${st.cls === "bad" ? "exc" : st.cls === "ok" ? "inc" : ""}" title="${esc(st.why)}">${st.icon} ${esc(st.label)}</span></td>
          <td class="mini">${cat}${r.baseline && r.baseline.tampered ? ` <span class="gu-how exc" title="This body does not match the hash the catalog carries — edited after export, so it is not the baseline and cannot be imported">tampered</span>` : ""}
            <div class="mini muted">↔ ${ten} ${how(r)}${r.duplicates ? ` <span class="gu-how priv" title="${r.duplicates} policies carry this identity — judged on the best">×${r.duplicates}</span>` : ""}${r.twinOf ? ` <span class="mini muted">— same content as “${esc(r.twinOf)}”</span>` : ""}${r.candidates ? ` <span class="mini muted">— ${r.candidates.map((x) => `${esc(x.name)} (${Math.round(x.score * 100)}%)`).join(" or ")}</span>` : ""}</div></td>
          <td class="mini muted">${esc(sectionLabelOf(r))}${duOfRow(r) ? ` · ${esc(duOfRow(r))}` : ""}</td>
          <td class="mini">${r.baseline ? relver(comm ? null : r.bRel, r.bVer) : `<span class="muted">—</span>`}</td>
          <td class="mini">${r.tenant ? relver(comm ? null : r.tRel, r.tVer) : `<span class="muted">—</span>`}</td>
          <td class="mini">${content(r)}</td>
          <td class="mini"><button type="button" class="btn sm" data-${P}pop="${esc(r.key)}" title="What this policy configures, setting by setting — the documenter's own popout">⚙</button></td>
        </tr>`;
      }).join("") || `<tr><td colspan="7" class="mini muted">No row matches these filters.${filters.size ? " The cards above are filters — click one to add its rows back." : ""}</td></tr>`;
      const foot = $(ID("CmpFoot"));
      if (foot) foot.textContent = `${rows.length} of ${S.cmp.rows.length} rows · ${S.cmp.covered} of ${S.cmp.baselineTotal} catalog policies present in this tenant · ${S.cmp.attention} need attention.`;
    }

    // ---- ❓ How it works: ONE source for the words (finding 12) ----
    // index.html used to carry its own prose about these tools, written at
    // 10530 and never revised, so the page said the comparison matched by
    // name while the code had matched by content since 10576. The screen
    // now says it, once, from the SPEC — and index.html says nothing about
    // it at all.
    function helpHtml() {
      const h = spec.help || {};
      const sec = (title, body) => `<h4 style="margin:16px 0 6px">${title}</h4><p class="mini muted" style="margin:0">${body}</p>`;
      return `<div class="list-card">
        <h4 style="margin:0 0 6px">❓ How ${esc(spec.label)} works</h4>
        <p class="mini" style="margin:0">${h.overview || ""}</p>
        ${sec("The identity", h.identity || "")}
        ${sec("How a policy is matched", `In this order, and a tenant policy is claimed exactly once. <b>1 The author's token</b> — a community baseline that stamps its own id into the description is identified by it first, so a renamed copy still identifies. <b>2 The name</b>, with the release tag and version stripped and separators normalised. <b>3 The content</b> — the canonical body hashed with SHA-256; two policies with the same hash are the same policy whatever they are called. <b>4 Similarity</b> — the Jaccard overlap of what the two configure, at least ${Math.round(E.SIMILARITY_MIN * 100)}% of their union, and only between two policies of the same kind. If the runner-up is within ${Math.round(E.REVIEW_MARGIN * 100)} points of the winner nothing is claimed and the row reads <b>Review</b>: a coin-flip dressed as a match is worse than an open question.`)}
        ${sec("What the statuses mean", `<ul style="margin:6px 0 0">${Object.keys(E.STATUS).sort((a, b) => E.STATUS[a].order - E.STATUS[b].order).map((k) => `<li><b>${E.STATUS[k].icon} ${esc(E.STATUS[k].label)}</b> — ${esc(E.STATUS[k].why)}</li>`).join("")}</ul>`)}
        ${sec("What each act does", `<b>📥 Import</b> creates what is <i>missing</i> or <i>outdated</i>, and nothing else; content is never patched, so an outdated row gets a new copy and the old one is Housekeeping's. <b>✏️ Rename</b> brings names into the convention, re-checking drift and collisions immediately before each write. <b>📤 Export</b> cuts the catalog, on the reference tenant only, and refuses to run on an incomplete read. <b>🧹 Housekeeping</b> deletes older copies and same-content duplicates, never an assigned one, and verifies each delete by failing to read it back.`)}
        ${sec("Where the catalogs come from", `<b>${esc(spec.catalogPath)}</b> — this site's own copy of the reference tenant's export, written by 📤 Export and never by hand. <b>${esc(spec.communityPath)}</b> — ${esc(spec.upstream.label)} by ${esc(spec.upstream.author)}, cut verbatim from ${esc(spec.upstream.repo)}; <i>Fetch latest</i> reads that repository live instead. <b>📄 File…</b> — any catalog export you have. Every one of them goes through the same strict loader: a file whose schema, platform, catalog id or sections do not check out is refused whole, and a policy whose body no longer matches its hash is flagged and can never be imported.`)}
        ${h.extra ? sec("On this platform", h.extra) : ""}
        <p class="mini muted" style="margin:16px 0 0">The reference tenant is ${isCfdev() ? "<b>this one</b>" : "not this one"} — it is gated on the tenant's immutable Entra ID, and it is a convenience gate, not a security boundary: what a tenant will actually let you do is decided by Graph permissions.</p>
      </div>`;
    }

    function wire() {
      // ---- the source picker ----
      const seg = $(ID("Cat"));
      if (seg) seg.addEventListener("click", (e) => {
        const b = e.target.closest(`[data-${P}cat]`);
        if (!b) return;
        const want = b.dataset[`${P}cat`];
        if (want === "file") { const fi = $(ID("File")); if (fi) fi.click(); return; }
        if (want === catId) return;
        catId = want;
        S.planned = null; S.plannedFilters = null;   // a plan belongs to the catalog it was made for
        recompare(); render();
      });
      const fi = $(ID("File"));
      if (fi) fi.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const note = (html) => { const b = $(ID("Body")); if (b) b.insertAdjacentHTML("afterbegin", html); };
        try {
          S.fileCat = await E.parseCatalog(await f.text());
          catId = "cfdev";
          recompare(); render();
        } catch (err) {
          render();
          note(`<div class="gu-fail"><b>That file was refused, whole.</b><span class="why">${esc((err && err.message) || err)} — nothing from it was loaded.</span></div>`);
        }
      });
      // ---- the filters ----
      const cards = $(ID("Cards"));
      if (cards) cards.addEventListener("click", (e) => {
        const b = e.target.closest(`[data-${P}filter]`);
        if (!b) return;
        const k = b.dataset[`${P}filter`];
        if (filters.has(k)) filters.delete(k); else filters.add(k);
        render();
      });
      const qi = $(ID("Q"));
      if (qi) qi.addEventListener("input", () => { q = qi.value; renderCompareTable(); });
      const sf = $(ID("Sec"));
      if (sf) sf.addEventListener("change", () => { secFilter = sf.value; renderCompareTable(); });
      const df = $(ID("Du"));
      if (df) df.addEventListener("change", () => { duFilter = df.value; renderCompareTable(); });
      const cl = $(ID("Clear"));
      if (cl) cl.addEventListener("click", () => { filters = new Set(); q = ""; secFilter = ""; duFilter = ""; render(); });
      // ---- the row acts: ⚙ the popout, ↗ the diff ----
      const rowsHost = $(ID("CmpRows"));
      if (rowsHost) rowsHost.addEventListener("click", (e) => {
        const pop = e.target.closest(`[data-${P}pop]`);
        if (pop) { openPopout(pop.dataset[`${P}pop`], false); return; }
        const dif = e.target.closest(`[data-${P}diff]`);
        if (dif) openPopout(dif.dataset[`${P}diff`], true);
      });
      // THE GAP REPORT PRINTS WHAT YOU ARE LOOKING AT (§4.1), not the whole
      // table — a report that ignores the filters above it is a different
      // document from the one on the screen.
      const md = $(ID("Md"));
      if (md) md.addEventListener("click", () => {
        if (!S.cmp) return;
        download(`tuno-${spec.platform.toLowerCase()}-baseline-gap-${new Date().toISOString().slice(0, 10)}.md`,
          E.toMd(S.cmp, tenantName(), filteredRows()), "text/markdown");
      });
      // THE READ IS RE-CHECKED AT THE CLICK, not only when the pane was
      // painted (finding 2). A re-read can land between the two, and a
      // disabled button is a hint, never the enforcement.
      const exportGuard = () => {
        const r = E.exportReadiness(S.res);
        if (r.ready) return true;
        $(ID("ExportNote")).innerHTML = `<span style="color:var(--off)"><b>Not exported — the read is incomplete.</b> ${esc(r.blockers[0].label)}: ${esc(r.blockers[0].why)}${r.blockers.length > 1 ? ` (and ${r.blockers.length - 1} more)` : ""}. Read the tenant again.</span>`;
        return false;
      };
      // what the export left out, said on the note line rather than buried
      const exportTail = (built) =>
        (built.superseded.length ? ` · ${built.superseded.length} identit${built.superseded.length === 1 ? "y" : "ies"} exported once, older copies listed as superseded — 🧹 Housekeeping retires them` : "")
        + ((built.duplicates || []).length ? ` · ${built.duplicates.length} pair${built.duplicates.length === 1 ? "" : "s"} share content under different names, listed in the README and NOT folded — settle them in 🧹 Housekeeping, then re-cut` : "")
        + (built.skipped.length ? ` · ${built.skipped.length} skipped (${built.skipped.map((x) => x.why)[0]})` : "");

      // ---- export: the per-row and per-section selection (§4.4) ----
      const exTicks = () => [...document.querySelectorAll(`[data-${P}extick]`)];
      const exWanted = () => new Set(exTicks().filter((c) => c.checked).map((c) => c.dataset[`${P}extick`]));
      const exSync = () => {
        const t = exTicks(), on = t.filter((c) => c.checked).length;
        const m = $(ID("ExMaster"));
        if (m) { m.checked = on > 0 && on === t.length; m.indeterminate = on > 0 && on < t.length; }
        document.querySelectorAll(`[data-${P}exsec]`).forEach((sc) => {
          const sec = sc.dataset[`${P}exsec`];
          const mine = t.filter((c) => c.dataset[`${P}exsecof`] === sec);
          const n = mine.filter((c) => c.checked).length;
          sc.checked = n > 0 && n === mine.length;
          sc.indeterminate = n > 0 && n < mine.length;
        });
        const c2 = $(ID("ExCount")); if (c2) c2.textContent = t.length ? `${on} of ${t.length} policies ticked` : "";
        for (const id of ["ExportZip", "Export"]) {
          const b = $(ID(id));
          if (b && !b.hasAttribute("data-locked")) b.disabled = b.disabled ? b.disabled : !on;
        }
      };
      const exMaster = $(ID("ExMaster"));
      if (exMaster) exMaster.addEventListener("change", () => { exTicks().forEach((c) => { c.checked = exMaster.checked; }); exSync(); });
      const exAll = $(ID("ExAll"));
      if (exAll) exAll.addEventListener("click", () => { exTicks().forEach((c) => { c.checked = true; }); exSync(); });
      const exNone = $(ID("ExNone"));
      if (exNone) exNone.addEventListener("click", () => { exTicks().forEach((c) => { c.checked = false; }); exSync(); });
      const exBody = $(ID("Body"));
      if (exBody && mode === "export") exBody.addEventListener("change", (e) => {
        const sc = e.target.closest(`[data-${P}exsec]`);
        if (sc) { exTicks().filter((c) => c.dataset[`${P}exsecof`] === sc.dataset[`${P}exsec`]).forEach((c) => { c.checked = sc.checked; }); }
        if (sc || e.target.closest(`[data-${P}extick]`)) exSync();
      });
      const exRn = $(ID("ExRename"));
      if (exRn) exRn.addEventListener("click", () => { mode = "rename"; render(); });
      if (mode === "export" && S.res) exSync();

      // ---- export ----
      const ez = $(ID("ExportZip"));
      if (ez) ez.addEventListener("click", async () => {
        if (!isCfdev()) { $(ID("ExportNote")).innerHTML = refusedHtml("Export"); return; }
        if (!exportGuard()) return;
        const built = await E.buildExport(S.res, tenantName(), exWanted());
        if (!built.file.policies.length) { $(ID("ExportNote")).textContent = "Nothing to export — no policy wears the convention."; return; }
        try {
          const z = new JSZip();
          for (const [p, text] of Object.entries(E.repoFolder(built))) z.file(p, text);
          const blob = await z.generateAsync({ type: "blob" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = `tuno-${spec.platform.toLowerCase()}-baseline-repo-${new Date().toISOString().slice(0, 10)}.zip`; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          $(ID("ExportNote")).textContent = `${built.file.policies.length} policies as baseline/${spec.platform.toLowerCase()}/, release ${built.file.release}` + exportTail(built)
            + (built.superseded.length ? ` · ${built.superseded.length} identit${built.superseded.length === 1 ? "y" : "ies"} exported once, older copies listed as superseded — 🧹 Housekeeping retires them` : "")
            + (built.skipped.length ? ` · ${built.skipped.length} skipped (${built.skipped.map((x) => x.why)[0]})` : "");
        } catch (e) { $(ID("ExportNote")).textContent = `The zip could not be written: ${(e && e.message) || e}`; }
      });
      const ex = $(ID("Export"));
      if (ex) ex.addEventListener("click", async () => {
        if (!isCfdev()) { $(ID("ExportNote")).innerHTML = refusedHtml("Export"); return; }
        if (!exportGuard()) return;
        const built = await E.buildExport(S.res, tenantName(), exWanted());
        if (!built.file.policies.length) { $(ID("ExportNote")).textContent = "Nothing to export — no policy wears the convention."; return; }
        download(`tuno-${spec.platform.toLowerCase()}-baseline-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(built.file, null, 2));
        $(ID("ExportNote")).textContent = `${built.file.policies.length} policies exported, each identity once, release ${built.file.release}` + exportTail(built)
          + (built.superseded.length ? ` · ${built.superseded.length} older cop${built.superseded.length === 1 ? "y" : "ies"} left out as superseded` : "")
          + (built.skipped.length ? ` · ${built.skipped.length} skipped (${built.skipped.map((s) => s.why)[0]})` : "");
      });
      const dry = $(ID("Dry"));
      if (dry) dry.addEventListener("click", dryRun);
      // Changing where the policies land invalidates the plan that was made
      // for the other answer — the groups were looked up under it.
      document.getElementsByName(ID("Asg")).forEach((r) => r.addEventListener("change", () => {
        if (!r.checked) return;
        assignMode = r.value;
        S.planned = null; S.plannedFilters = null; S.pilot = null;
        const p = $(ID("Plan")); if (p) p.innerHTML = `<p class="mini muted" style="margin:0">Dry run again — the plan was made for the other answer.</p>`;
      }));
      // ---- the community line ----
      const cf1 = $(ID("Fetch"));
      if (cf1) cf1.addEventListener("click", () => fetchForCatalog());
      const cr = $(ID("FetchRevert"));
      if (cr) cr.addEventListener("click", () => { S.fetchedCat = null; S.planned = null; S.plannedFilters = null; recompare(); render(); });
      const cz = $(ID("CommZip"));
      if (cz) cz.addEventListener("click", async () => {
        const co = communityCatalog();
        if (!co) return;
        try {
          const z = new JSZip();
          for (const [p, text] of Object.entries(E.communityFolder(co))) z.file(p, text);
          const blob = await z.generateAsync({ type: "blob" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = `tuno-${spec.upstream.id}-community-repo-${new Date().toISOString().slice(0, 10)}.zip`; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        } catch (e) { const n = $(ID("FetchNote")); if (n) n.textContent = `The zip could not be written: ${(e && e.message) || e}`; }
      });
    }

    // ---- ⚙ the per-policy settings view (§10, T19's own popout) ----
    // ONE RENDERER. Docs.popoutHtml is the template T05, T11 and T19 all
    // use; this feeds it from the same read they do, or from the catalog
    // body when the policy is not in the tenant at all. A `differs` row
    // opens on the diff instead, because that is the question that row is.
    function popoutSec(section, label) {
      const s = (typeof Docs !== "undefined" && Docs.sectionById(section)) || null;
      return { label: label || (s && s.label) || section, endpoint: (s && s.endpoint) || section, icon: (s && s.icon) || "" };
    }
    function rowsFromBody(section, body) {
      if (typeof Docs === "undefined") return [];
      try {
        if (section === "settingsCatalog") return Docs.catalogRows(body.settings || []);
        if (section === "admx") return Docs.admxRows(body.definitionValues || []);
        return Docs.flatten(body);
      } catch { return []; }
    }
    function openPopout(key, wantDiff) {
      const r = S.cmp && S.cmp.rows.find((x) => x.key === key);
      if (!r) return;
      const host = $(ID("PopBody"));
      if (!host) return;
      const foot = `<div class="gu-m-foot"><div class="spacer"></div><button class="btn primary" id="${ID("PopClose")}">Close</button></div>`;
      let inner = "";
      if (wantDiff && r.diff) {
        const cell = (x) => esc(String(x.id).split("_").pop());
        inner = `<div class="gu-m-head"><h3>${esc((r.baseline && r.baseline.name) || (r.tenant && r.tenant.name) || "")}</h3>
            <div class="mini muted">What differs between the catalog's copy and this tenant's — the canonical bodies, value for value.</div></div>
          <div class="gu-m-body"><div class="gu-tw"><table class="cg-table"><thead><tr><th>Setting</th><th>The catalog</th><th>This tenant</th></tr></thead><tbody>
            ${r.diff.added.map((d) => `<tr><td class="mini"><code title="${esc(d.id)}">${cell(d)}</code></td><td class="mini">${esc(d.theirs)}</td><td class="mini muted">not set</td></tr>`).join("")}
            ${r.diff.changed.map((d) => `<tr><td class="mini"><code title="${esc(d.id)}">${cell(d)}</code></td><td class="mini">${esc(d.theirs)}</td><td class="mini">${esc(d.ours)}</td></tr>`).join("")}
            ${r.diff.removed.map((d) => `<tr><td class="mini"><code title="${esc(d.id)}">${cell(d)}</code></td><td class="mini muted">not set</td><td class="mini">${esc(d.ours)}</td></tr>`).join("")}
          </tbody></table></div></div>`;
      } else if (r.tenant && S.res) {
        // the tenant's own documented item — the same object T05 renders
        let found = null;
        for (const sec of S.res.sections || []) {
          const it = (sec.items || []).find((x) => String(x.id) === String(r.tenant.id));
          if (it) { found = { sec, it }; break; }
        }
        inner = found
          ? Docs.popoutHtml(found.sec, found.it)
          : `<div class="gu-m-head"><h3>${esc(r.tenant.name)}</h3></div><div class="gu-m-body"><p class="mini muted">This policy is not in the read any more — re-read the tenant.</p></div>`;
      } else if (r.baseline) {
        const b = r.baseline;
        inner = Docs.popoutHtml(popoutSec(b.section, b.sectionLabel), {
          name: b.name, platform: spec.platform, type: b.sectionLabel || b.section,
          modified: "", description: b.description || "", assignments: [],
          rows: rowsFromBody(b.section, b.body || {}), detailError: "",
        });
        inner = inner.replace('<div class="gu-m-body">',
          `<div class="gu-m-body"><p class="mini muted" style="margin:0 0 10px">This policy is <b>not in this tenant</b> — what follows is the catalog's copy of it, which is what 📥 Import would create.</p>`);
      }
      host.innerHTML = inner + foot;
      $(ID("Pop")).classList.add("open");
      const close = () => { $(ID("Pop")).classList.remove("open"); document.removeEventListener("keydown", onEsc); };
      const onEsc = (e) => { if (e.key === "Escape") close(); };
      $(ID("PopClose")).addEventListener("click", close);
      $(ID("Pop")).onclick = (e) => { if (e.target === $(ID("Pop"))) close(); };
      document.addEventListener("keydown", onEsc);
    }

    // ------------------------------------------------ the github.com fetch --
    let fetching = false;
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

    // ================================================================
    // IMPORT — the plan IS the comparison's gap (finding 4, §4.2, §8.3)
    // ================================================================
    // The plan used to be built from the whole catalog and filtered
    // afterwards, which is how an `ahead` row — a policy the tenant has a
    // NEWER copy of — could reach the create pipeline. It is built from
    // the rows now: `missing` and `outdated`, nothing else, and every
    // other row carries its own reason on the Compare table.
    //
    // An `outdated` row creates a NEW copy under the catalog's name and
    // leaves the older one where it is. Import never PATCHes content: a
    // policy the tenant has been running is not silently rewritten, and
    // 🧹 Housekeeping is where the superseded copy goes, deliberately,
    // afterwards.
    async function dryRun() {
      if (running) return;
      const c = activeCatalog();
      if (!c) return;
      running = true; $(ID("Dry")).disabled = true; $(ID("Plan")).innerHTML = "";
      S.planned = null; S.plannedFilters = null;
      try {
        const gap = importable();
        if (!gap.length) {
          $(ID("Plan")).innerHTML = `<p class="mini" style="margin:0"><b>Nothing to create.</b> The comparison found every catalog policy present — by token, name, content or similarity.</p>`;
          return;
        }
        const wanted = new Set(gap.map((r) => r.key));
        const { entries, filters, refused } = E.importEntries(c, wanted);
        if (!entries.length && !filters.length) {
          $(ID("Plan")).innerHTML = `<div class="gu-fail"><b>Nothing importable.</b><span class="why">${refused.length ? esc(refused[0].why) : "The catalog carries no policy bodies for the rows that are missing."}</span></div>`;
          return;
        }
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

        // THE GROUPS ARE LOOKED UP AT DRY RUN, NOT AT APPLY (§8.3) — so
        // "the group is not there" is something the plan tells you before
        // you click the button, not a surprise in the results.
        S.pilot = null;
        if (assignMode === "pilot") {
          prog("Looking up the PRE-PILOT groups…");
          await Graph.ensureScopes(Graph.SCOPES.groups);
          S.pilot = await E.findPilotGroups();
        }
        prog("");
        const rowOf = (name) => gap.find((r) => r.baseline && r.baseline.name === name) || null;
        const duOfName = (name) => { const r = rowOf(name); return r && r.baseline ? E.duFor(r.baseline) : ""; };
        const missingGroups = S.pilot ? Object.keys(E.PILOT_GROUPS).filter((k) => !S.pilot[k]) : [];

        const duCell = (id, du) => assignMode !== "pilot" ? `<span class="muted">—</span>`
          : du ? `<span class="gu-how ${du === "D" ? "inc" : "priv"}" title="${du === "D" ? "A device policy — the device pilot group" : "A user policy — the user pilot group"}">${du}</span>`
            // NO GUESS. A policy whose token cannot be read is not assumed
            // to be a device policy: the row asks, and cannot be applied
            // until it is answered.
            : `<select data-${P}du="${esc(id)}" class="mini"><option value="">needs D/U</option><option value="D">D — device</option><option value="U">U — user</option></select>`;

        const pRows = S.planned.map((p, i) => {
          const du = duOfName(p.target);
          return `<tr><td style="width:30px">${p.collided ? "" : `<input type="checkbox" data-imtick="p${i}" data-imdu="${esc(du)}" checked>`}</td>
            <td class="mini"><b>${esc(p.target)}</b>${rowOf(p.target) && rowOf(p.target).status === "outdated" ? ` <span class="gu-how">a NEW copy — the older one stays for 🧹 Housekeeping</span>` : ""}</td>
            <td class="mini">${esc(Restore.AREA_INFO[p.area].label)}</td>
            <td class="mini">${duCell(`p${i}`, du)}</td>
            <td class="mini${p.collided ? '" style="color:var(--off)' : ""}">${p.collided ? "skip — a policy already wears this name" : "create"}</td></tr>`;
        });
        const fRows = S.plannedFilters.map((f, i) => `<tr><td style="width:30px">${f.collided ? "" : `<input type="checkbox" data-imtick="f${i}" data-imdu="D" checked>`}</td>
          <td class="mini"><b>${esc(f.body.displayName)}</b></td><td class="mini">Assignment filter (T14's create)</td>
          <td class="mini"><span class="muted">not assignable</span></td>
          <td class="mini${f.collided ? '" style="color:var(--off)' : ""}">${f.collided ? "skip — a filter already wears this name" : "create"}</td></tr>`);
        const nCreate = S.planned.filter((p) => !p.collided).length + S.plannedFilters.filter((f) => !f.collided).length;
        const nSkip = S.planned.filter((p) => p.collided).length + S.plannedFilters.filter((f) => f.collided).length;

        $(ID("Plan")).innerHTML = `
          <p class="mini" style="margin:0 0 8px"><b>${nCreate} to create</b> · ${nSkip} already wear the name (the collision stop)${refused.length ? ` · ${refused.length} not importable (${esc(refused[0].why)})` : ""} · ${c.policies.length - wanted.size} of ${c.policies.length} left alone, because the comparison found them present.</p>
          ${missingGroups.length ? `<div class="gu-fail"><b>${missingGroups.map((k) => E.PILOT_GROUPS[k]).join(" and ")} ${missingGroups.length === 1 ? "was" : "were"} not found in this tenant.</b><span class="why">The policies are still created — unassigned. TUNO does not create groups, and it does not refuse an import because one is missing. Make the group and assign in ✏️ the Assignment editor, or re-run this after creating it.</span></div>` : ""}
          ${S.pilot && S.pilot.error ? `<div class="gu-fail"><b>The groups could not be read.</b><span class="why">${esc(S.pilot.error)} — the import will create everything unassigned.</span></div>` : ""}
          <div class="tb-actions" style="margin:0 0 8px">
            <button class="btn" id="${ID("ImAll")}">☑ Select all</button>
            <button class="btn" id="${ID("ImNone")}">☐ Select none</button>
            <button class="btn" id="${ID("ImD")}">Select D</button>
            <button class="btn" id="${ID("ImU")}">Select U</button>
            <span class="mini muted" id="${ID("ImCount")}"></span>
          </div>
          <div class="gu-tw"><table class="cg-table"><thead><tr>
            <th style="width:30px">${nCreate ? `<input type="checkbox" id="${ID("ImMaster")}" title="Select or deselect every row below">` : ""}</th>
            <th>Catalog policy</th><th style="width:190px">Surface</th><th style="width:130px">Pilot group</th><th style="width:200px">Operation</th>
          </tr></thead><tbody>${pRows.join("")}${fRows.join("")}</tbody></table></div>
          <p class="mini muted" id="${ID("ImWarn")}" style="margin:8px 0 0"></p>
          ${nCreate ? `<div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="${ID("Apply")}">✍ Create <span class="tag block">writes to the tenant</span></button></div>` : ""}
          <div id="${ID("Result")}" style="margin-top:10px"></div>`;

        const plan = $(ID("Plan"));
        const ticks = () => [...plan.querySelectorAll("[data-imtick]")];
        const duOf = (cb) => {
          const sel = plan.querySelector(`[data-${P}du="${cb.dataset.imtick}"]`);
          return sel ? sel.value : (cb.dataset.imdu || "");
        };
        const master = $(ID("ImMaster"));
        const syncIm = () => {
          const t = ticks(), on = t.filter((x) => x.checked);
          if (master) { master.checked = on.length > 0 && on.length === t.length; master.indeterminate = on.length > 0 && on.length < t.length; }
          const cnt = $(ID("ImCount")); if (cnt) cnt.textContent = t.length ? `${on.length} of ${t.length} ticked` : "";
          // A TICKED ROW WITH NO D/U CANNOT BE APPLIED (§8.3). It is not
          // dropped quietly and it is not guessed at — the button says so.
          const blocked = assignMode === "pilot" ? on.filter((cb) => !duOf(cb)).length : 0;
          const warn = $(ID("ImWarn"));
          if (warn) warn.innerHTML = blocked
            ? `<span style="color:var(--off)"><b>${blocked} ticked row${blocked === 1 ? " has" : "s have"} no D/U.</b> Pick device or user on the row, or switch to “No assignment” above — a policy whose target is a guess is not one this tool will assign.</span>`
            : (assignMode === "pilot" ? `Device policies go to <b>${esc(E.PILOT_GROUPS.D)}</b>, user policies to <b>${esc(E.PILOT_GROUPS.U)}</b>. One assignment per created policy; a failure to assign is reported on the row and never rolled back.` : "");
          const ap2 = $(ID("Apply"));
          if (ap2) {
            ap2.disabled = !on.length || blocked > 0;
            ap2.innerHTML = `✍ Create ${on.length} object${on.length === 1 ? "" : "s"}${assignMode === "pilot" && !blocked ? ", assigned to the pilot groups" : ""} <span class="tag block">writes to the tenant</span>`;
          }
        };
        const setAll = (v, du) => { ticks().forEach((x) => { if (!du || duOf(x) === du) x.checked = v; }); syncIm(); };
        if (master) master.addEventListener("change", () => setAll(master.checked));
        $(ID("ImAll")).addEventListener("click", () => setAll(true));
        $(ID("ImNone")).addEventListener("click", () => setAll(false));
        $(ID("ImD")).addEventListener("click", () => { setAll(false); setAll(true, "D"); });
        $(ID("ImU")).addEventListener("click", () => { setAll(false); setAll(true, "U"); });
        plan.addEventListener("change", (e) => { if (e.target.closest("[data-imtick]") || e.target.closest(`[data-${P}du]`)) syncIm(); });
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
      const plan = $(ID("Plan"));
      const ticked = [...plan.querySelectorAll("[data-imtick]")].filter((x) => x.checked);
      const on = new Set(ticked.map((x) => x.dataset.imtick));
      const duBy = new Map(ticked.map((cb) => {
        const sel = plan.querySelector(`[data-${P}du="${cb.dataset.imtick}"]`);
        return [cb.dataset.imtick, sel ? sel.value : (cb.dataset.imdu || "")];
      }));
      const doPolicies = (S.planned || []).map((p, i) => ({ p, key: `p${i}` })).filter((x) => !x.p.collided && on.has(x.key));
      const doFilters = (S.plannedFilters || []).map((f, i) => ({ f, key: `f${i}` })).filter((x) => !x.f.collided && on.has(x.key));
      if (!doPolicies.length && !doFilters.length) return;
      if (wrongTenant()) { $(ID("Result")).innerHTML = tenantMovedHtml(); S.planned = null; S.plannedFilters = null; return; }
      if (assignMode === "pilot" && doPolicies.some((x) => !duBy.get(x.key))) return;   // the button is already disabled; belt and braces
      running = true; $(ID("Apply")).disabled = true;
      try {
        await Graph.ensureScopes(Graph.SCOPES.profiles);
        const results = doPolicies.length ? await Restore.apply(doPolicies.map((x) => x.p), (m) => prog(m)) : [];
        // ---- the assignment, one POST per created policy (§8.3) ----
        // AFTER the create, never inside it: a create that succeeded and an
        // assignment that failed is a policy that exists and reaches
        // nobody, which is reported as exactly that and NOT rolled back —
        // deleting a policy because its assignment failed would be a
        // second, larger, write to fix a smaller one.
        const assigned = new Map();
        if (assignMode === "pilot" && S.pilot) {
          for (let i = 0; i < results.length; i++) {
            const r = results[i], x = doPolicies[i];
            if (!r || r.outcome !== "created" || !r.newId) continue;
            const du = duBy.get(x.key);
            const g = du ? S.pilot[du] : null;
            if (!g) { assigned.set(r.target, du ? `created, not assigned — ${E.PILOT_GROUPS[du]} is not in this tenant` : "created, not assigned — no D/U"); continue; }
            try {
              prog(`${r.target} — assigning to ${g.displayName}…`);
              await E.assignToGroup(x.p.area, r.newId, g.id);
              assigned.set(r.target, `assigned to ${g.displayName}`);
            } catch (e) {
              assigned.set(r.target, `created, NOT assigned — ${GroupUse.shortErr(e, 160)}`);
            }
          }
        }
        const filterResults = [];
        for (const { f } of doFilters) {
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
        const notAssigned = [...assigned.entries()].filter(([, v]) => /not assigned/i.test(v));
        const failedHtml = all.filter((r) => r.outcome === "failed").map((r) => `<div class="gu-fail"><b>${esc(r.target || "")}</b><span class="why">${esc(r.detail || "")}</span></div>`).join("")
          + notAssigned.map(([t, v]) => `<div class="gu-fail"><b>${esc(t)}</b><span class="why">${esc(v)} — the policy exists and reaches nobody; assign it in ✏️ the Assignment editor.</span></div>`).join("");
        $(ID("Result")).innerHTML = `
          <p class="mini" style="margin:0 0 6px"><b>${good} created</b>${bad ? ` · <b style="color:var(--off)">${bad} failed</b>` : ""}${assignMode === "pilot" ? ` · ${[...assigned.values()].filter((v) => /^assigned/.test(v)).length} assigned to a pilot group${notAssigned.length ? `, <b style="color:var(--off)">${notAssigned.length} not assigned</b>` : ""}` : " — unassigned, as asked"}. Re-reading the tenant…</p>${failedHtml}`;
        if (typeof PolicyCache !== "undefined") PolicyCache.invalidate();
        S.planned = null; S.plannedFilters = null;
        S.lastWrite = { failedHtml };
        mode = "compare";   // the fresh comparison is the point of the re-read
        rereadAfter(`📥 Import: <b>${good} created</b>${bad ? `, <b style="color:var(--off)">${bad} failed</b> (listed under Import)` : ""}${assignMode === "pilot" ? "" : ", unassigned"}`);
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

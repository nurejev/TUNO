// ======================================================================
// T24 — 🍎 macOS baseline (BETA, R35). Match the tenant's macOS policies
// against the CloudFellows macOS baseline, ENCA's Baseline Policies tool
// turned Intune-side-out.
//
// THE NAMING CONVENTION IS THE IDENTITY, exactly as ENCA's CA numbers:
// a baseline policy's name starts with MACOS, carries a release number
// R26.xx, and ends with a version — e.g.
//   "MACOS R26.03 FileVault enforcement v1.2"
// The R26.xx NUMBER is the stable identity (the descriptive middle and
// the version move between releases; the number never does), and the
// version is compared segment-wise, so v1.0.10 sorts above v1.0.9 —
// ENCA's cmpVersion, ported verbatim.
//
// THE CATALOG comes from the BASELINE TENANT, cloudfellows.dev — the
// cfdev convention (TunoTenant.isCfdev(), the one tenant gate, worn in
// the header badge): on that tenant, and only there, this tool offers
// EXPORT, which writes the catalog file from the tenant's own MACOS
// policies — names, numbers, versions AND the raw policy bodies, so the
// same file drives all three acts. Everywhere else the tool consumes a
// catalog: the bundled one (BASELINE_MACOS, regenerated from the
// reference export, like ENCA's baselineData.js) or a loaded file.
//
// THE BUCKETS ARE ENCA'S, verbatim: ok / outdated / ahead / unversioned
// / missing / conflict (number clash corroborated by name tokens) /
// extra. IMPORT rides T04-restore's OWN create pipeline (Restore.plan /
// Restore.apply — collision stop, dry run first, per-area bodies,
// read-back verify) with ONE deliberate departure: the created policy
// keeps its CANONICAL baseline name, no [Restored] prefix — the name IS
// the identity this tool matches on, and a prefixed baseline would read
// as missing forever. Everything arrives unassigned, as restore always
// has; reaching devices is T11's act, taken deliberately afterwards.
//
// Reads ride the shared policy cache (10520). The import writes under
// the config write scope T04-restore already holds — no new scope.
// ======================================================================
const MacBaseline = (() => {
  "use strict";

  // ---- the naming convention ----
  const numOf = (name) => { const m = /\bR26\.(\d{1,3})\b/i.exec(name || ""); return m ? +m[1] : null; };
  const versionOf = (name) => {
    const t = String(name || "").trim();
    const end = /v\s?(\d+(?:\.\d+)*)\s*$/i.exec(t);
    if (end) return end[1];
    const any = /\bv(\d+(?:\.\d+)+)\b/i.exec(t);
    return any ? any[1] : null;
  };
  const looksBaseline = (name) => /^\s*MACOS\b/i.test(name || "") && numOf(name) != null;
  const numLabel = (num) => `R26.${String(num).padStart(2, "0")}`;

  // -1 a<b, 0 equal, 1 a>b — segment-wise, so 1.0.10 > 1.0.9 (ENCA, verbatim)
  function cmpVersion(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  // ---- corroboration (ENCA's, minus the CA personas macOS does not have) --
  // A number match must be backed by the name: the descriptive tokens must
  // overlap, or the row is a number clash between two baselines, not a match.
  const STOP = new Set(["macos", "the", "and", "or", "for", "to", "of", "a", "policy", "profile", "baseline"]);
  function tokens(name) {
    return new Set(String(name || "").toLowerCase()
      .replace(/\br26\.\d{1,3}\b/g, " ")        // the number is compared separately
      .replace(/\bv?\d+(\.\d+)*\b/g, " ")       // versions
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t)));
  }
  function similarity(a, b) {
    const A = tokens(a), B = tokens(b);
    if (!A.size || !B.size) return 0;
    let hit = 0;
    for (const t of A) if (B.has(t)) hit++;
    return hit / Math.min(A.size, B.size);
  }
  const MIN_SIMILARITY = 0.25;
  function mismatchReason(baselineName, tenantName) {
    const sim = similarity(baselineName, tenantName);
    if (sim < MIN_SIMILARITY) return `the names have almost nothing in common (${Math.round(sim * 100)}% overlap)`;
    return null;
  }

  // ---- the buckets (ENCA, verbatim) ----
  const STATUS = {
    ok: { icon: "✓", label: "Up to date", cls: "ok", order: 3 },
    outdated: { icon: "⬆", label: "Outdated", cls: "warn", order: 1 },
    ahead: { icon: "⬇", label: "Newer than baseline", cls: "info", order: 4 },
    present: { icon: "✓", label: "Present", cls: "ok", order: 2 },
    unversioned: { icon: "?", label: "Version unknown", cls: "info", order: 5 },
    missing: { icon: "✗", label: "Missing", cls: "bad", order: 0 },
    conflict: { icon: "⚠", label: "Number clash", cls: "warn", order: 0.5 },
    extra: { icon: "＋", label: "Not in baseline", cls: "info", order: 6 },
  };

  // ---- catalogs ----
  // Bundled first (BASELINE_MACOS, js/macbaselineData.js — regenerated from
  // the cloudfellows.dev reference export, never fetched at runtime: the CSP
  // only allows Graph, and a baseline must not change under you mid-session).
  // A loaded export file replaces it for the session, and says so.
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
      if (typeof p.num !== "number" || !p.name) throw new Error("A catalog policy is missing its number or name — the file is damaged.");
    }
    return j;
  }

  // ---- compare tenant policies against the catalog (ENCA's shape) ----
  // vms: [{ id, name, section, platform }] — every policy read, any section.
  function compare(vms, cat) {
    const byNum = new Map();
    for (const p of vms) {
      if (!looksBaseline(p.name)) continue;
      const n = numOf(p.name);
      if (!byNum.has(n)) byNum.set(n, []);
      byNum.get(n).push(p);
    }
    const rows = [];
    for (const b of cat.policies) {
      const hits = byNum.get(b.num) || [];
      if (!hits.length) {
        rows.push({ num: b.num, baseline: b, tenant: null, status: "missing" });
        continue;
      }
      const scored = hits.map((p) => {
        const tv = versionOf(p.name);
        const why = mismatchReason(b.name, p.name);
        if (why) return { p, tv, status: "conflict", why };
        let status;
        if (tv && b.version) {
          const c = cmpVersion(tv, b.version);
          status = c === 0 ? "ok" : c < 0 ? "outdated" : "ahead";
        } else if (!b.version) {
          status = "present";
        } else {
          status = "unversioned";
        }
        return { p, tv, status };
      }).sort((a, b2) => STATUS[b2.status].order - STATUS[a.status].order);
      const best = scored[0];
      rows.push({
        num: b.num, baseline: b, tenant: best.p, tenantVersion: best.tv,
        status: best.status, why: best.why || null,
        duplicates: hits.length > 1 ? hits.length : 0,
      });
      byNum.delete(b.num);
    }
    for (const [num, hits] of byNum) {
      rows.push({ num, baseline: null, tenant: hits[0], tenantVersion: versionOf(hits[0].name), status: "extra", duplicates: hits.length > 1 ? hits.length : 0 });
    }
    rows.sort((a, b) => a.num - b.num);
    const counts = {};
    rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return {
      rows, counts, catalog: cat,
      baselineTotal: cat.policies.length,
      covered: rows.filter((r) => r.baseline && r.tenant && r.status !== "conflict").length,
    };
  }

  // ---- export (the baseline tenant's act) ----
  // Sections that can round-trip through T04-restore's create pipeline.
  const AREA_OF_SECTION = {
    deviceConfigurations: "DeviceConfigurations",
    settingsCatalog: "SettingsCatalog",
    compliance: "CompliancePolicies",
    admx: "AdmxPolicies",
  };
  // res: a Docs.collect result WITH raw (the shared cache keeps it). Every
  // policy whose name wears the convention is exported — name, number,
  // version, section AND the raw body, so one file drives identify + import.
  function buildExport(res, tenantName) {
    const policies = [], skipped = [];
    for (const sec of res.sections || []) {
      for (const it of sec.items || []) {
        if (!looksBaseline(it.name)) continue;
        const raw = (sec.raw || []).find((r) => String(r.id).toLowerCase() === String(it.id).toLowerCase()) || null;
        const area = AREA_OF_SECTION[sec.id] || null;
        if (!raw) { skipped.push({ name: it.name, why: "raw body not in the read — export from a cache-backed read" }); continue; }
        // Normalise to T04-restore's body shape: the detail read (__detail)
        // is where the settings-catalog settings and the ADMX definition
        // values actually live — the list object carries neither.
        const body = Object.assign({}, raw);
        delete body.__detail; delete body.__detailError;
        if (sec.id === "settingsCatalog" && Array.isArray(raw.__detail)) body.settings = raw.__detail;
        if (sec.id === "admx" && Array.isArray(raw.__detail)) body.definitionValues = raw.__detail;
        policies.push({
          num: numOf(it.name), name: it.name, version: versionOf(it.name),
          section: sec.id, sectionLabel: sec.label, area,
          importable: !!area,
          body,
        });
      }
    }
    policies.sort((a, b) => a.num - b.num);
    const dup = policies.filter((p, i) => policies.findIndex((x) => x.num === p.num) !== i).map((p) => numLabel(p.num));
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
      duplicateNums: [...new Set(dup)],
    };
  }

  // ---- import entries (T04-restore's shapes, canonical names) ----
  // The one departure from restore: NO prefix. The name is the identity this
  // tool matches on; "[Restored] MACOS R26.03 …" would read as missing
  // forever. Create-only and the collision stop are unchanged — a policy
  // already wearing the name is skipped, which is exactly what "present"
  // means one screen up.
  function importEntries(cat, wanted) {
    const entries = [], refused = [];
    for (const p of cat.policies) {
      if (wanted && !wanted.has(p.num)) continue;
      if (!p.area || !p.body) { refused.push({ name: p.name, why: p.area ? "no body in the catalog" : `its surface (${p.sectionLabel || p.section || "unknown"}) has no create path here — T04-restore's four areas only` }); continue; }
      entries.push({ area: p.area, entry: { area: p.area, name: p.name, obj: p.body, sourceId: p.body.id || "" }, newName: p.name });
    }
    return { entries, refused };
  }

  return {
    numOf, versionOf, looksBaseline, numLabel, cmpVersion, tokens, similarity, mismatchReason,
    STATUS, bundled, parseCatalog, compare, buildExport, importEntries, AREA_OF_SECTION, MIN_SIMILARITY,
  };
})();

// ======================================================================
// T24 — the screen. Warm-starts from the shared cache like T19; export
// renders ONLY on the baseline tenant (the cfdev convention — said here,
// where it lives, not a hidden mode); import is T04-restore's dry-run →
// apply, with the write scope asked at the click.
// ======================================================================
const MacBaselineTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let res = null;            // the collect result (cache-served or fresh)
  let cat = null;            // the active catalog (bundled or loaded)
  let catSource = "";        // "bundled" | "file"
  let cmp = null;            // compare() result
  let planned = null, running = false;

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
    for (const sec of (res && res.sections) || []) {
      for (const it of sec.items || []) out.push({ id: it.id, name: it.name, section: sec.id, sectionLabel: sec.label, platform: it.platform });
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
    cmp = c ? MacBaseline.compare(vms(), c) : null;
    render(sourceNote);
  }

  function render(sourceNote) {
    const c = activeCatalog();
    const parts = [];
    if (sourceNote) parts.push(`<p class="mini muted" style="margin:0 0 8px">${sourceNote}</p>`);

    // the catalog line — which baseline this screen is comparing against
    if (c) {
      parts.push(`<p class="mini muted" style="margin:0 0 10px">Catalog: <b>${esc(c.release || "R26")}</b> · ${c.policies.length} policies · ${catSource === "file" ? `loaded from a file${c.tenant ? ` (exported from ${esc(c.tenant)}${c.exported ? `, ${esc(String(c.exported).slice(0, 10))}` : ""})` : ""}` : "bundled with this build"}.</p>`);
    } else {
      parts.push(`<div class="list-card"><p class="mini" style="margin:0"><b>No catalog is bundled with this build yet.</b> Load a baseline file below — or, on the baseline tenant, export one. Until a catalog is present this screen can only list which policies WEAR the convention, not judge them.</p></div>`);
    }

    if (cmp) {
      const card = (k) => {
        const s = MacBaseline.STATUS[k], n = cmp.counts[k] || 0;
        if (!n && !["missing", "outdated", "ok"].includes(k)) return "";
        return `<div class="au-card"><div class="au-card-l">${s.icon} ${esc(s.label)}</div><div class="au-card-n ${n ? s.cls : ""}">${n}</div><div class="au-card-s">${k === "missing" ? "in the baseline, not here" : k === "extra" ? "numbered here, not in the baseline" : ""}</div></div>`;
      };
      parts.push(`<div class="au-cards">${["missing", "outdated", "conflict", "present", "ok", "ahead", "unversioned", "extra"].map(card).join("")}</div>`);
      const row = (r) => {
        const s = MacBaseline.STATUS[r.status];
        return `<tr>
          <td class="mini"><b>${esc(MacBaseline.numLabel(r.num))}</b></td>
          <td class="mini">${r.baseline ? `${esc(r.baseline.name)}` : `<span class="muted">—</span>`}</td>
          <td class="mini">${r.tenant ? esc(r.tenant.name) : `<span class="gu-how exc">missing</span>`}${r.duplicates ? ` <span class="gu-how priv" title="${r.duplicates} policies carry this number — judged on the best match">×${r.duplicates}</span>` : ""}</td>
          <td class="mini">${r.baseline && r.baseline.version ? esc(r.baseline.version) : "—"} / ${r.tenantVersion ? esc(r.tenantVersion) : "—"}</td>
          <td><span class="gu-how ${s.cls === "bad" ? "exc" : s.cls === "ok" ? "inc" : ""}" ${r.why ? `title="${esc(r.why)}"` : ""}>${s.icon} ${esc(s.label)}</span></td>
        </tr>`;
      };
      parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">The baseline, line by line (${cmp.covered} of ${cmp.baselineTotal} covered)</h4>
        <div class="gu-tw"><table class="cg-table"><thead><tr><th style="width:78px">Number</th><th>Baseline policy</th><th>This tenant</th><th style="width:110px">Version b/t</th><th style="width:170px">Status</th></tr></thead>
        <tbody>${cmp.rows.map(row).join("") || `<tr><td colspan="5" class="mini">The catalog is empty.</td></tr>`}</tbody></table></div></div>`);
    } else if (res && !c) {
      const worn = vms().filter((v) => MacBaseline.looksBaseline(v.name));
      parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">Policies wearing the convention (${worn.length})</h4>
        ${worn.length ? `<ul class="mini" style="margin:6px 0 0">${worn.map((w) => `<li>${esc(w.name)} <span class="muted">(${esc(MacBaseline.numLabel(MacBaseline.numOf(w.name)))}${MacBaseline.versionOf(w.name) ? ` · v${esc(MacBaseline.versionOf(w.name))}` : " · no version in the name"})</span></li>`).join("")}</ul>` : `<p class="mini muted" style="margin:0">None — no policy name starts with MACOS and carries an R26.xx number.</p>`}</div>`);
    }

    // failed surfaces: unknown, never absent
    if (res && res.failed && res.failed.length) {
      parts.push(`<div class="gu-fail"><b>${res.failed.length} surface${res.failed.length === 1 ? "" : "s"} could not be read</b><span class="why">${res.failed.map((f) => esc(f.label)).join(", ")} — a baseline policy living there would read as missing, so these rows are floors, not verdicts.</span></div>`);
    }

    // ---- the baseline tenant's act: export (cfdev convention) ----
    if (isCfdev() && res) {
      parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">🧬 Export the baseline <span class="mini muted">— this IS the baseline tenant</span></h4>
        <p class="mini muted" style="margin:0 0 8px">Writes the catalog file from this tenant's MACOS R26.xx policies — names, numbers, versions and the raw bodies, so the one file drives identification and import everywhere else. Bundle it into the build as js/macbaselineData.js when it is the new reference.</p>
        <button class="btn primary" id="mbExport">⬇ Export the baseline file</button>
        <span class="mini muted" id="mbExportNote"></span></div>`);
    }

    // ---- import ----
    parts.push(`<div class="list-card"><h4 style="margin:0 0 6px">📥 Import the baseline <span class="tag block">writes to the tenant</span></h4>
      <p class="mini muted" style="margin:0 0 8px">Create-only, T04-restore's own pipeline: a dry run first, a collision stop per name, everything arriving <b>unassigned</b> — reaching devices is ✏️ the editor's act, taken deliberately afterwards. The one departure from restore: created policies keep their <b>canonical baseline names</b>, no prefix — the name is the identity this screen matches on.</p>
      <div class="tb-actions">
        <label class="btn">📄 Load a baseline file<input type="file" id="mbFile" accept=".json" style="display:none"></label>
        <button class="btn" id="mbDry" ${c && c.policies.some((p) => p.body) ? "" : "disabled title=\"The active catalog carries no policy bodies — load a baseline export file.\""}>🔍 Dry run — create what is missing</button>
      </div>
      <div id="mbPlan" style="margin-top:10px"></div></div>`);

    $("mbBody").innerHTML = parts.join("");
    wire();
  }

  function wire() {
    const ex = $("mbExport");
    if (ex) ex.addEventListener("click", () => {
      const built = MacBaseline.buildExport(res, tenantName());
      if (!built.file.policies.length) { $("mbExportNote").textContent = "Nothing to export — no policy wears the convention."; return; }
      download(`tuno-macos-baseline-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(built.file, null, 2));
      $("mbExportNote").textContent = `${built.file.policies.length} policies exported`
        + (built.duplicateNums.length ? ` · DUPLICATE NUMBERS: ${built.duplicateNums.join(", ")} — fix the tenant before bundling` : "")
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
  }

  async function dryRun() {
    if (running) return;
    const c = activeCatalog();
    if (!c) return;
    running = true; $("mbDry").disabled = true; $("mbPlan").innerHTML = "";
    try {
      const { entries, refused } = MacBaseline.importEntries(c, null);
      if (!entries.length) { $("mbPlan").innerHTML = `<div class="gu-fail"><b>Nothing importable.</b><span class="why">${refused.length ? esc(refused[0].why) : "The catalog carries no policy bodies."}</span></div>`; return; }
      prog("Checking what already exists…");
      // the read scope is enough for the dry run — the write is asked at Apply
      await Graph.ensureScopes(Graph.SCOPES.config);
      const names = await Restore.existingNames([...new Set(entries.map((x) => x.area))], (m) => prog(m));
      planned = Restore.plan(entries, names);
      prog("");
      const n = { create: planned.filter((p) => !p.collided).length, skip: planned.filter((p) => p.collided).length };
      $("mbPlan").innerHTML = `
        <p class="mini" style="margin:0 0 8px"><b>${n.create} to create</b> · ${n.skip} already present (the collision stop — present is the point, not a problem)${refused.length ? ` · ${refused.length} not importable (${esc(refused[0].why)})` : ""}</p>
        <div class="gu-tw"><table class="cg-table"><thead><tr><th>Baseline policy</th><th style="width:170px">Surface</th><th style="width:200px">Operation</th></tr></thead>
        <tbody>${planned.map((p) => `<tr><td class="mini"><b>${esc(p.newName)}</b></td><td class="mini">${esc(Restore.AREA_INFO[p.area].label)}</td><td class="mini${p.collided ? '" style="color:var(--off)' : ""}">${p.collided ? "skip — a policy already wears this name" : "create, unassigned"}</td></tr>`).join("")}</tbody></table></div>
        ${n.create ? `<div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="mbApply">✍ Create ${n.create} polic${n.create === 1 ? "y" : "ies"} <span class="tag block">writes to the tenant</span></button></div>` : ""}
        <div id="mbResult" style="margin-top:10px"></div>`;
      const ap = $("mbApply");
      if (ap) ap.addEventListener("click", apply);
    } catch (e) {
      prog("");
      $("mbPlan").innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
    } finally { running = false; const d = $("mbDry"); if (d) d.disabled = false; }
  }

  async function apply() {
    if (running || !planned) return;
    running = true; $("mbApply").disabled = true;
    try {
      // the write scope, at the click that writes — T04-restore's own areas
      await Graph.ensureScopes(Graph.SCOPES.profiles);
      const results = await Restore.apply(planned, (m) => prog(m));
      prog("");
      const good = results.filter((r) => r.outcome === "created").length;
      const bad = results.filter((r) => r.outcome === "failed").length;
      $("mbResult").innerHTML = `
        <p class="mini" style="margin:0 0 6px"><b>${good} created</b>${bad ? ` · <b style="color:var(--off)">${bad} failed</b>` : ""} — everything unassigned; ✏️ the Assignment editor is where reach begins.</p>
        ${results.filter((r) => r.outcome === "failed").map((r) => `<div class="gu-fail"><b>${esc(r.target || "")}</b><span class="why">${esc(r.detail || "")}</span></div>`).join("")}`;
      // the tenant moved, by us — the shared cache describes the tenant before it
      if (typeof PolicyCache !== "undefined") PolicyCache.invalidate();
      planned = null;
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
    if (PolicyCache.reading()) run(true);
  }

  function init() {
    if (!$("mbRun")) return;
    (window.TunoScreenHooks = window.TunoScreenHooks || {})["screen-macbaseline"] = onShow;
    $("mbRun").addEventListener("click", () => run(false));
  }

  return { init, _setForTest: (r, c) => { cat = c || null; catSource = c ? "file" : ""; land(r, ""); } };
})();

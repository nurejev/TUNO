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
    if (sectionId === "deviceConfigurations") return `dc|${item.type}|${row.name}`;
    return null;
  }

  // ---- reach ----
  function reachOf(item) {
    const inc = new Set(), exc = new Set();
    let tenantWide = false, filtered = false;
    for (const a of item.assignments || []) {
      // A filter on an EXCLUSION does not cap what this policy reaches
      // (10490) — it narrows what is kept out. The "can collide, may not"
      // verdict this tool prints is about capped reach, so only a filter on
      // a non-excluded target sets it. Same rule as Docs.filterReachOf.
      if (a.filterId && a.kind !== "Excluded") filtered = true;
      if (a.kind === "Included" && a.groupId) inc.add(a.groupId);
      else if (a.kind === "Excluded" && a.groupId) exc.add(a.groupId);
      else if (a.kind === "All devices" || a.kind === "All users") tenantWide = true;
    }
    return { inc, exc, tenantWide, filtered, none: !tenantWide && inc.size === 0 };
  }

  // The verdict for one PAIR of policies. `cannot` only where one side
  // reaches nobody by construction; a filter caps `can` down to `may`.
  function verdictPair(ra, rb) {
    if (ra.none || rb.none) return { verdict: "cannot", reason: "one policy has no include and no tenant-wide target — it reaches nobody as assigned" };
    const filterCap = (v, why) => (ra.filtered || rb.filtered)
      ? { verdict: "may", reason: `${why}, but an assignment filter sits in between and a browser cannot evaluate it` }
      : { verdict: "can", reason: why };
    const shared = [...ra.inc].filter((g) => rb.inc.has(g) && !ra.exc.has(g) && !rb.exc.has(g));
    if (shared.length) return filterCap(null, "both include the same group");
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
          none: p.reach.none, filtered: p.reach.filtered, tenantWide: p.reach.tenantWide })),
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
  function csv(scan) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["verdict,setting,surface,policy,platform,value,reason"];
    for (const c of scan.conflicts) for (const p of c.policies) {
      L.push([c.verdict, q(c.label), q(c.sectionLabel), q(p.name), q(p.platform), q(p.value), q(c.reason)].join(","));
    }
    return L.join("\n");
  }

  return { SECTIONS, detect, keyOf, reachOf, verdictPair, markdown, csv, meta, V_LABEL };
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
  // Open conflict folds, keyed on section|setting — stable across renders,
  // reset on a new scan.
  const open = new Set();

  function prog(msg) { TunoProgress.show("cfBody", "cfProg", msg); }   // ENCA-style centred card (10397)
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function showExports(on) { ["cfMd", "cfCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); }

  async function run() {
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
    render();
    showExports(true);
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
  function render() {
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
    const shownConflicts = scan.conflicts.filter((c) => cfPlat === "all" || platsOfConflict(c).includes(cfPlat));
    const platSelHtml = platsHere.length > 1
      ? `<label class="sel-filter" style="margin:0 0 8px" title="Narrows the conflict list to one platform's policies. The verdict cards above keep counting the whole scan.">
          <span>Platform</span>
          <select id="cfPlatform">${[["all", `All platforms (${scan.conflicts.length})`]].concat(platsHere.map((p) => [p, `${p} (${platCount(p)})`]))
            .map(([v, l]) => `<option value="${esc(v)}"${v === cfPlat ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
        </label>` : "";

    const body = scan.conflicts.length
      ? (shownConflicts.map(fold).join("")
        || `<p class="mini" style="margin-top:10px">No ${esc(cfPlat)} conflicts — clear the platform filter and the list comes back.</p>`)
      : `<p class="mini" style="margin-top:10px"><b>No setting is configured to different values by overlapping policies</b> — across ${scan.comparedSettings} settings that more than one policy configures${collectRes.failed.length ? ", on the surfaces that could be read" : ""}.</p>`;

    // Where the collection came from is part of the answer (10523): a scan
    // over a cached read says so and says when.
    let src = "";
    if (collectRes.readAt) {
      let t = ""; try { t = new Date(collectRes.readAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { t = ""; }
      src = `<p class="mini muted" style="margin:0 0 8px">Scanned over ${collectRes.fromWarm ? "the sign-in read" : "the shared read"} at ${esc(t)} — ⚔️ Scan the tenant re-reads.</p>`;
    }
    $("cfBody").innerHTML = src + cards + `<div class="list-card">${notes.join("")}
      ${scan.conflicts.length ? `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:8px">${platSelHtml}<p class="mini muted" style="margin:0">Click a conflict for the side-by-side comparison — every policy's value and reach.</p></div>` : ""}
      <div style="margin-top:10px">${body}</div></div>`;

    $("cfBody").querySelectorAll("[data-cffold]").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.closest("a,code")) return;
      const k = el.dataset.cffold;
      open.has(k) ? open.delete(k) : open.add(k);
      render();
    }));
  }

  function exportAs(fmt) {
    const m = Conflict.meta(collectRes);
    if (fmt === "md") return download("Intune-setting-conflicts.md", Conflict.markdown(scan, collectRes, m), "text/markdown");
    return download("Intune-setting-conflicts.csv", Conflict.csv(scan), "text/csv");
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
    $("cfMd").addEventListener("click", () => exportAs("md"));
    $("cfCsv").addEventListener("click", () => exportAs("csv"));
  }

  return { init, run };
})();

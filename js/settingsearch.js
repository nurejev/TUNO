// ======================================================================
// T10 — Settings search (BETA). "Which policies configure BitLocker, and to
// what value?" — answered from the setting DEFINITIONS, not the policy names.
//
// The last piece of Ugur Koc's IntuneAssignmentChecker (MIT) worth having.
// T05 searches the settings of policies it has already read, which finds a
// setting only if you already know which policy holds it; this searches the
// other way round, against the settings-catalog definition catalog — the
// full list of what CAN be configured, roughly seventeen thousand
// definitions, which is Microsoft's and not the tenant's.
//
// TWO READS, DELIBERATELY SEPARATE:
//
//   1. THE CATALOG — /deviceManagement/configurationSettings, read once per
//      session and held in memory. It is large, it changes as Microsoft
//      ships settings, and it is the same for every tenant. Nothing about
//      YOUR tenant is in it.
//   2. THE TENANT'S POLICIES — settings-catalog policies plus their
//      settings, the same N+1 T04 pays, pooled. Only after this read can
//      the tool say WHO sets a definition and TO WHAT — and until it has
//      run, the usage column says "policies not read", because an absent
//      answer and a zero are different things.
//
// VALUES GO THROUGH T05'S REDACTION GATE, and this is not optional. A
// settings search is precisely the tool somebody uses to hunt for
// "password", and a result table that printed the values of secret-bearing
// settings would be a disclosure engine with a search box. Docs.redactValue
// is the SAME gate the documenter uses — one implementation, because a
// second copy is a second place for a pre-shared key to escape (the T06
// lesson, applied to redaction).
//
// Search matches every token against name, id, keywords and description —
// prefix and substring, ranked: a name that starts with the term beats a
// name that contains it beats a keyword hit beats a description hit.
// Reads only, one scope: DeviceManagementConfiguration.Read.All.
// ======================================================================
const SettingSearch = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const S = () => Graph.SCOPES;
  const SCOPES = () => S().config;

  // ------------------------------------------------------------- the catalog --
  // Held at module level: one read per session. `catalog` null means "not
  // read", never "empty" — the distinction every TUNO tool keeps.
  let catalog = null;          // [{id, name, description, keywords, categoryId, platform}]
  let categories = null;       // id -> name
  let catalogWhen = null;

  const PLATFORM_LABEL = (p) => {
    const v = lc(p);
    if (v.includes("windows")) return "Windows";
    if (v.includes("mac")) return "macOS";
    if (v.includes("ios")) return "iOS/iPadOS";
    if (v.includes("android")) return "Android";
    if (v.includes("linux")) return "Linux";
    return "";
  };

  async function loadCatalog(onStatus) {
    if (catalog) return { count: catalog.length, cached: true, when: catalogWhen };
    onStatus && onStatus("Reading setting categories…");
    const cats = {};
    try {
      (await Graph.readAll("/deviceManagement/configurationCategories?$select=id,displayName", { scopes: SCOPES(), beta: true, retry: true }))
        .forEach((c) => { cats[c.id] = c.displayName || c.id; });
    } catch { /* categories are labels, not the answer — a search works without them */ }
    categories = cats;

    onStatus && onStatus("Reading the definition catalog — this is one read of roughly seventeen thousand definitions…");
    const raw = await Graph.readAll(
      "/deviceManagement/configurationSettings?$select=id,displayName,description,keywords,categoryId,applicability",
      {
        scopes: SCOPES(), beta: true, retry: true,
        onPage: (n) => onStatus && onStatus(`Reading the definition catalog — ${n} definitions…`),
      });
    catalog = raw.map((d) => ({
      id: d.id,
      name: d.displayName || d.id,
      description: d.description || "",
      keywords: (d.keywords || []).join(" "),
      categoryId: d.categoryId || "",
      platform: PLATFORM_LABEL(d.applicability && d.applicability.platform),
      // one lower-cased haystack per field, built once — search runs on every
      // keystroke and 17k×toLowerCase per keypress is how a page dies
      _name: lc(d.displayName || d.id), _id: lc(d.id),
      _kw: lc((d.keywords || []).join(" ")), _desc: lc(d.description || ""),
    }));
    catalogWhen = new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC");
    return { count: catalog.length, cached: false, when: catalogWhen };
  }

  const catalogState = () => (catalog ? { count: catalog.length, when: catalogWhen } : null);
  const categoryOf = (d) => (categories && categories[d.categoryId]) || "";
  const resetCatalog = () => { catalog = null; categories = null; catalogWhen = null; };

  // ---------------------------------------------------------------- search --
  // Every token must match SOMEWHERE; the rank is the best field it matched.
  // An empty query is no results, not all results — seventeen thousand rows
  // is not an answer to anything.
  function search(query, opts) {
    if (!catalog) throw new Error("The catalog has not been read yet.");
    const o = opts || {};
    const tokens = lc(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return { hits: [], total: 0, tokens };
    const scored = [];
    for (const d of catalog) {
      if (o.platform && d.platform && d.platform !== o.platform) continue;
      let score = 0, dead = false;
      for (const t of tokens) {
        if (d._name.startsWith(t)) score += 4;
        else if (d._name.includes(t)) score += 3;
        else if (d._kw.includes(t)) score += 2;
        else if (d._id.includes(t) || d._desc.includes(t)) score += 1;
        else { dead = true; break; }
      }
      if (!dead) scored.push({ d, score });
    }
    scored.sort((a, b) => b.score - a.score || a.d._name.localeCompare(b.d._name));
    const cap = o.cap || 100;
    return { hits: scored.slice(0, cap).map((x) => x.d), total: scored.length, tokens, capped: scored.length > cap };
  }

  // ------------------------------------------------- the tenant's policies --
  // defId -> [{policyId, policyName, value, redacted}]. Also null-vs-read.
  let usage = null;
  let usagePolicies = 0, usageFailed = [];
  let usageWhen = null;

  // Walk one settingInstance and collect every (definitionId, value) pair it
  // carries — CHILDREN INCLUDED, because a choice setting's children are real
  // definitions of their own and "which policies configure X" must find X
  // when it is somebody's child. Every value passes the redaction gate.
  function pairsFromInstance(inst, out) {
    if (!inst || typeof inst !== "object") return out;
    const id = inst.settingDefinitionId || "";
    const red = (v) => {
      const r = Docs.redactValue(id, v);
      return { value: r == null ? "" : String(r), redacted: r === Docs.REDACTED || r === Docs.OMITTED };
    };
    if (inst.simpleSettingValue && inst.simpleSettingValue.value !== undefined) {
      out.push({ defId: id, ...red(inst.simpleSettingValue.value) });
    } else if (inst.choiceSettingValue) {
      const v = String(inst.choiceSettingValue.value || "").split("_").pop();
      out.push({ defId: id, ...red(v) });
      (inst.choiceSettingValue.children || []).forEach((c) => pairsFromInstance(c, out));
    } else if (Array.isArray(inst.simpleSettingCollectionValue)) {
      const joined = inst.simpleSettingCollectionValue.map((x) => x && x.value).filter((x) => x !== undefined).join(", ");
      out.push({ defId: id, ...red(joined) });
    } else if (Array.isArray(inst.groupSettingCollectionValue)) {
      out.push({ defId: id, value: `${inst.groupSettingCollectionValue.length} group(s)`, redacted: false });
      inst.groupSettingCollectionValue.forEach((g) => (g.children || []).forEach((c) => pairsFromInstance(c, out)));
    } else if (inst.choiceSettingCollectionValue) {
      (Array.isArray(inst.choiceSettingCollectionValue) ? inst.choiceSettingCollectionValue : []).forEach((cv) => {
        out.push({ defId: id, ...red(String(cv.value || "").split("_").pop()) });
        (cv.children || []).forEach((c) => pairsFromInstance(c, out));
      });
    } else if (id) {
      out.push({ defId: id, value: "", redacted: false });
    }
    return out;
  }

  async function loadUsage(onStatus) {
    onStatus && onStatus("Listing settings-catalog policies…");
    const policies = await Graph.readAll("/deviceManagement/configurationPolicies?$select=id,name,platforms,settingCount",
      { scopes: SCOPES(), beta: true, retry: true });
    usagePolicies = policies.length; usageFailed = [];
    const idx = new Map();
    let done = 0;
    onStatus && onStatus(`Reading settings of ${policies.length} policies…`);
    const results = await Graph.pool(policies, async (p) => {
      const settings = await Graph.readAll(`/deviceManagement/configurationPolicies/${p.id}/settings`,
        { scopes: SCOPES(), beta: true, retry: true });
      onStatus && onStatus(`Reading settings — ${++done}/${policies.length} policies`);
      return settings;
    }, 6);
    results.forEach((r, i) => {
      const p = policies[i];
      if (r.error) { usageFailed.push({ id: p.id, name: p.name || p.id, error: GroupUse.shortErr(r.error) }); return; }
      const pairs = [];
      (r.value || []).forEach((s) => pairsFromInstance(s.settingInstance, pairs));
      for (const pair of pairs) {
        if (!pair.defId) continue;
        if (!idx.has(pair.defId)) idx.set(pair.defId, []);
        idx.get(pair.defId).push({ policyId: p.id, policyName: p.name || p.id, value: pair.value, redacted: pair.redacted });
      }
    });
    usage = idx;
    usageWhen = new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC");
    return { policies: usagePolicies, failed: usageFailed, definitionsSet: idx.size, when: usageWhen };
  }

  // null = not read; [] = read and nobody sets it. The caller renders those
  // differently, which is the whole point of keeping them apart.
  const usageOf = (defId) => (usage ? (usage.get(defId) || []) : null);
  const usageState = () => (usage ? { policies: usagePolicies, failed: usageFailed, when: usageWhen } : null);
  const resetUsage = () => { usage = null; usagePolicies = 0; usageFailed = []; usageWhen = null; };

  // ---------------------------------------------------------------- export --
  function markdown(query, res, m) {
    const L = [];
    L.push(`# Settings search — “${mdCell(query)}”`, "");
    L.push(`Generated ${m.when} by TUNO ${m.build}. ${res.total} definition${res.total === 1 ? "" : "s"} match${res.total === 1 ? "es" : ""}${res.capped ? `, first ${res.hits.length} listed` : ""}. Secret-bearing values are redacted and that cannot be switched off.`, "");
    const u = usageState();
    L.push(u
      ? `Tenant usage read ${u.when} across ${u.policies} settings-catalog policies${u.failed.length ? ` (${u.failed.length} could not be read — their settings are missing from the usage column)` : ""}.`
      : `**Tenant usage was not read** — the “set by” column is absent, not empty.`, "");
    L.push(`| Setting | Platform | Category | ${u ? "Set by |" : ""}`, `|---|---|---|${u ? "---|" : ""}`);
    for (const d of res.hits) {
      const use = usageOf(d.id);
      const setBy = use === null ? "" : (use.length
        ? use.map((x) => `${mdCell(x.policyName)} = ${x.redacted ? "🔒 [redacted]" : mdCell(x.value || "(configured)")}`).join("; ")
        : "_nothing in the tenant sets it_");
      L.push(`| ${mdCell(d.name)} | ${d.platform || "—"} | ${mdCell(categoryOf(d))} | ${u ? setBy + " |" : ""}`);
    }
    L.push("", `---`, ``, `After Ugur Koc's [Intune Assignment Checker](https://github.com/ugurkocde/IntuneAssignmentChecker) (MIT). Redaction is the documenter's gate — one implementation, on purpose.`);
    return L.join("\n");
  }

  const meta = () => ({
    when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
    build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
  });

  return {
    SCOPES, loadCatalog, catalogState, resetCatalog, categoryOf, search,
    loadUsage, usageOf, usageState, resetUsage, pairsFromInstance,
    markdown, meta, PLATFORM_LABEL,
  };
})();

// ======================================================================
// T10 — the screen. Search runs as you type against the in-memory catalog;
// nothing after the two reads touches the tenant.
// ======================================================================
const SettingSearchTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  let lastRes = null, lastQuery = "", busy = false;

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const prog = (m) => { $("ssProg").textContent = m || ""; };

  function renderState() {
    const c = SettingSearch.catalogState(), u = SettingSearch.usageState();
    $("ssState").innerHTML = [
      c ? `<span class="gu-stat"><b>${c.count}</b> definitions in the catalog</span>` : `<span class="gu-stat zero">catalog not read</span>`,
      u ? `<span class="gu-stat"><b>${u.policies}</b> policies read${u.failed.length ? ` · <b>${u.failed.length}</b> failed` : ""}</span>`
        : `<span class="gu-stat zero">tenant usage not read — “set by” will be absent, not empty</span>`,
    ].join(" ");
    $("ssSearchWrap").style.display = c ? "" : "none";
    $("ssUsageBtn").textContent = u ? "↻ Re-read tenant usage" : "② Read the tenant's policies (who sets what)";
  }

  function renderHits() {
    const q = $("ssQuery").value;
    lastQuery = q;
    if (!SettingSearch.catalogState()) return;
    const platform = $("ssPlatform").value;
    let res;
    try { res = SettingSearch.search(q, { platform: platform || null }); }
    catch { return; }
    lastRes = res;
    $("ssMd").style.display = res.hits.length ? "" : "none";
    if (!q.trim()) { $("ssBody").innerHTML = ""; return; }
    const u = SettingSearch.usageState();
    const rows = res.hits.map((d) => {
      const use = SettingSearch.usageOf(d.id);
      let setBy;
      if (use === null) setBy = `<span class="mini muted">not read</span>`;
      else if (!use.length) setBy = `<span class="mini muted">nothing sets it</span>`;
      else setBy = use.map((x) => `<div><b>${esc(x.policyName)}</b> = ${x.redacted ? `<span class="gu-how exc">🔒 redacted</span>` : `<code>${esc(x.value || "(configured)")}</code>`}</div>`).join("");
      return `<tr>
        <td><b>${esc(d.name)}</b><div class="mini muted">${esc(SettingSearch.categoryOf(d))}</div><div class="mini muted" style="word-break:normal;overflow-wrap:anywhere"><code>${esc(d.id)}</code></div></td>
        <td>${esc(d.platform || "—")}</td>
        <td class="mini">${esc(d.description).slice(0, 300)}${d.description.length > 300 ? "…" : ""}</td>
        <td>${setBy}</td></tr>`;
    }).join("");
    $("ssBody").innerHTML = `<div class="list-card">
      <p class="mini muted" style="margin:0 0 8px"><b>${res.total}</b> of the catalog match${res.capped ? ` — first ${res.hits.length} shown, narrow the search for the rest` : ""}.${u ? "" : " The “set by” column is <b>absent, not empty</b> — read the tenant's policies to fill it."}</p>
      <div style="overflow-x:auto"><table class="plist"><thead><tr><th>Setting</th><th>Platform</th><th>Description</th><th>Set by</th></tr></thead>
      <tbody>${rows || ""}</tbody></table></div>
      ${!res.hits.length ? `<p class="mini" style="margin-top:8px">Nothing in the catalog matches “${esc(q)}”.</p>` : ""}</div>`;
  }

  async function readCatalog() {
    if (busy) return;
    busy = true;
    try {
      await Graph.ensureScopes(SettingSearch.SCOPES());
      const r = await SettingSearch.loadCatalog(prog);
      prog(r.cached ? `Catalog already in memory (${r.count} definitions, read ${r.when}).` : "");
      renderState(); renderHits();
    } catch (e) { prog(""); $("ssBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div></div>`; }
    finally { busy = false; }
  }

  async function readUsage() {
    if (busy) return;
    busy = true;
    try {
      await Graph.ensureScopes(SettingSearch.SCOPES());
      SettingSearch.resetUsage();
      const r = await SettingSearch.loadUsage(prog);
      prog(r.failed.length ? `${r.failed.length} of ${r.policies} policies could not be read — their settings are missing from the usage column.` : "");
      renderState(); renderHits();
    } catch (e) { prog(""); $("ssBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div></div>`; }
    finally { busy = false; }
  }

  function init() {
    if (!$("ssCatalogBtn")) return;
    renderState();
    $("ssCatalogBtn").addEventListener("click", readCatalog);
    $("ssUsageBtn").addEventListener("click", readUsage);
    $("ssQuery").addEventListener("input", renderHits);
    $("ssPlatform").addEventListener("change", renderHits);
    $("ssMd").addEventListener("click", () => {
      if (lastRes) download("settings-search.md", SettingSearch.markdown(lastQuery, lastRes, SettingSearch.meta()), "text/markdown");
    });
  }

  return { init };
})();

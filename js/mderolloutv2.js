// T28 — MDE rollout, the screen (MdeRolloutV2Tool). The V2 design of
// build 10660 (overview, grouped rail, risk decisions, group backups,
// run files) and, since build 10661, the only T28 screen: the original
// "Existing" controller and the version switch are gone. The engine is
// MdeRollout in js/mderollout.js (the V2 file carried a byte-identical
// copy of it as MdeRolloutV2 until 10661). See docs/T28-V2.md.

// ======================================================================
// T28 — the screen: a rail, one pane per job (10632, layout B), and the
// report workspace (10637) — one saved report preview, picked from the
// rail's report nodes since 10638. The GATES live here, the T11 way: a plan is cut from a
// FRESH read of the policies it touches, the backup is taken before Apply
// unlocks, removals are typed, additions ticked, and every write goes
// through AssignEdit.applyPlan (drift check → write → verify) on the run
// ledger. The engine above refuses nothing about sequence; this does.
// ======================================================================
const MdeRolloutV2Tool = (() => {
  "use strict";
  const M = MdeRollout;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;

  // ----------------------------------------------------------- state --
  let res = null;              // the shared read (PolicyCache / Docs.collect, keepRaw)
  let model = null, pairs = [], retire = [], waveRows = [];
  let templates = new Map(), found = null, dupes = [], kinds = new Map(), labels = new Map();
  let cfg = M.normConfig(null);
  let pane = "overview";
  const view = { cat: null, state: null, status: "act", q: "" };
  const sel = new Set();       // policy keys (New / Old panes)
  const selPairs = new Set();  // pair ids (Conflicts pane)
  const selWaves = new Set();  // missing wave names (Waves pane)
  const selRename = new Set(); // wave names found under an earlier name (Waves pane, 10635)
  let rollRegions = null;      // rollout actions: the regions ticked (null = every region)
  const pilotTiersOff = new Set(); // 🧪 Pilots as the bar's target (10675): the tiers UNticked, by key
  // 👥 Wave members (10634): its own read, its own selection, its own plan kind
  // 📑 Reports (10635): the last run of each, and the conflict checks of this session
  const reps = { assign: null, config: null, conflicts: null, checks: [], busy: "", selected: "assign", error: "" };
  const mem = { input: null, model: null, loading: false, region: null, unmapped: false,
    sel: new Set(), open: new Set(), opts: { fill: true, nestUsers: true, nestDevices: true, removals: false },
    // 🕳 Left out (10642): the view, the country its user list is narrowed
    // to (a row key, null = the whole wave) and the device reason shown
    left: false, leftCountry: null, leftReason: null,
    // 🧪 Pilots (10647): the view, its tile filter and the members ticked
    pil: false, pilState: null, pilSel: new Set(),
    // 🔎 Defender logons (10648): per user id, the devices found; who was
    // looked up; the running line and the last error
    logons: new Map(), looked: new Set(), logBusy: "", logError: "" };
  // ⊘ Exclusions (10639, layout A off the mockup): its own read, search,
  // the looked-up card and its ticks, and the "excluded now" rows ticked
  const ex = { base: null, loading: false, error: "", q: "", searching: false, results: null, note: "", card: null, cardLoading: false, cardError: "",
    ticks: new Set(), sel: new Set(), keepOld: true,
    // 📋 a list (10651, option A off the mockup): the mode, the pasted text,
    // the looked-up list and its ticks, the running line and the last error
    mode: "one", listText: "", list: null, lticks: new Set(), listBusy: false, listNote: "", listErr: "" };
  // 🎛 Adjust settings (10657, option B off the mockup): the modes asked for,
  // per matrix row key, and the pane's filter
  const asr = { edits: new Map(), filter: "all" };
  const open = new Set();      // expanded rows
  let plan = null;             // composed plan + meta
  // Where the plan panel opens (10639, Mihai: the dry run "appears at the
  // bottom, not visible" — option A off the mockup): right under the card
  // whose button made it, by that card's id; null = under the pane.
  let planAnchor = null;
  let ruleSaved = "";          // the last save's word, kept across re-renders (10642)
  let backupTaken = false;
  let v2ExpectedMembers = null;
  let v2Binding = null, v2MemberBackup = null, v2Risk = null, v2Imported = null;
  let v2AllowLeftOut = false;
  const runs = [];             // this session's writes
  let running = false, busy = false, enriching = "";
  let filterList = null;       // all assignment filters, for the bar

  const prog = (m) => TunoProgress.show("mvBody", "mvProg", m);
  // THE PLAN PANEL IS ONE NODE, held here for the life of the page. It is
  // seated under the active pane on every render; holding the reference
  // means clearing or re-rendering the body can never destroy it (the warm
  // start renders before the first click, and 🚀 Read the tenant clears the
  // body — the node went with it until it was held).
  let PLAN = null;
  const planEl = () => PLAN || (PLAN = document.getElementById("mvPlan"));
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const tenantName = () => { const n = $("tenantName"); return (n && n.textContent) || ""; };


  function v2Context() { return { tenantId: TunoTenant.tenantId() || "demo", config: JSON.stringify(cfg), allowLeftOut: v2AllowLeftOut }; }
  function v2Bind() {
    backupTaken = false;
    v2Binding = JSON.stringify(v2Context());
    v2MemberBackup = null; v2Risk = null;
    v2ExpectedMembers = plan && plan.members ? T28V2Safety.capture(plan.ops).then((snapshot) => ({ snapshot }), (error) => ({ error })) : null;
  }
  function v2Risks() {
    if (!plan) return [];
    const issues = [];
    for (const o of plan.changes || []) {
      const r = retire.find((x) => x.O.key === `${o.policy.surface}|${lc(o.policy.id)}`);
      if (!r || !(o.details || []).some((d) => d.change === "modify" && (d.action === "remove" || d.action === "add-exclude"))) continue;
      if (r.verdict !== "covered" || r.reach !== "can") issues.push(`${o.policy.name}: retirement ${r.verdict}, assignment reach ${r.reach}. Review every missing/different setting and the affected targets.`);
    }
    const rank = { off: 0, audit: 1, warn: 2, block: 3 };
    for (const x of plan.items || []) for (const c of x.changes || []) if (rank[c.to] < rank[c.from]) issues.push(`${x.name}: ${c.name} ${c.from} → ${c.to} reduces enforcement.`);
    if (plan.kind === "asr" && v2AllowLeftOut) issues.push("The ASR exception for Leave out policies is enabled. Confirm this scope deliberately.");
    if (plan.kind === "edgeext") for (const x of plan.items || []) for (const c of x.changes || []) if (c.list === "force" && c.op === "remove" && extNameOf(c.entry.id).status !== "404") issues.push(`${x.name}: ${extNameOf(c.entry.id).name || c.entry.id} comes off Installed silently — Edge uninstalls it from every reached user at the next policy refresh.`);
    return issues;
  }
  function v2Gate() {
    if (!v2Binding || v2Binding !== JSON.stringify(v2Context())) return false;
    const risks = v2Risks();
    if (!risks.length) return true;
    const reason = $("mvRiskReason"), tick = $("mvRiskAccept");
    if (!reason || reason.value.trim().length < 20 || !tick || !tick.checked) return false;
    v2Risk = { issues: risks, reason: reason.value.trim(), acceptedAt: new Date().toISOString(), tenantId: v2Context().tenantId };
    return true;
  }
  function v2AttachGate() {
    if (!plan || !planEl()) return;
    const risks = v2Risks();
    const update = () => { for (const id of ["mvApply", "mvMemApply"]) if ($(id)) $(id).disabled = !gateOk(); };
    if (risks.length) {
      const box = document.createElement("div"); box.className = "v2-risk";
      box.innerHTML = `<b>Review required before applying</b><ul>${risks.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><label class="wi-f"><span>Reason for accepting this risk (at least 20 characters)</span><textarea id="mvRiskReason" rows="2"></textarea></label><label class="chk"><input id="mvRiskAccept" type="checkbox"> I accept these listed risks for this plan and tenant.</label>`;
      const applyButton = $("mvApply") || $("mvMemApply");
      if (applyButton) applyButton.parentElement.before(box);
      box.addEventListener("input", update); box.addEventListener("change", update);
    }
    if (plan.members && $("mvMemApply")) {
      const b = document.createElement("button"); b.className = "btn"; b.type = "button"; b.textContent = "③ Download group backup"; b.id = "mvMemberBackup";
      $("mvMemApply").parentElement.before(b);
      const p = plan;
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          const expected = await v2ExpectedMembers;
          if (!expected || expected.error) throw (expected && expected.error) || new Error("No group preflight available.");
          const snapshot = expected.snapshot;
          if (!await T28V2Safety.unchanged(snapshot)) throw new Error("Group membership changed since the plan. Re-read and re-plan.");
          if (plan !== p || v2Binding !== JSON.stringify(v2Context())) throw new Error("The plan changed. Create a new plan.");
          v2MemberBackup = snapshot;
          download(`t28-v2-groups-before-${stamp()}.json`, JSON.stringify({ schema: "tuno.t28.v2.group-backup/1", tenantId: v2Context().tenantId, at: new Date().toISOString(), plan: p, membership: snapshot }, null, 2));
          backupTaken = true; b.textContent = "③ Group backup downloaded"; update();
        } catch (e) { b.textContent = "Backup failed — " + GroupUse.shortErr(e, 120); backupTaken = false; update(); }
        finally { if (b.isConnected) b.disabled = false; }
      });
    }
  }
  function v2Overview() {
    const missing = waveRows.filter((w) => w.lookedUp && !w.exists && !w.legacy).length;
    const unknown = !found || model.missing.length > 0;
    const gaps = retire.filter((r) => r.verdict !== "covered" || r.reach !== "can").length;
    const todo = mem.model ? mem.model.rows.filter((r) => r.ug && (!r.inSync || r.ugNested === false || r.dgNested === false)).length : null;
    const cards = [
      ["waves", "1 · Prepare groups", unknown ? "Unknown / partial read" : missing ? `${missing} missing` : "Groups found", "Check names, group kinds and regions before adding members."],
      ["members", "2 · Review members", todo === null ? "Not read" : `${todo} countries to review`, "Review device mapping evidence, stale devices and pilot transitions."],
      ["new", "3 · Assign the new set", `${model.newP.length} policies`, "Create a fresh assignment plan for the selected scope."],
      ["retire", "4 · Review old coverage", `${gaps} require review`, "Coverage of settings and assignment reach are separate checks."],
      ["conflicts", "5 · Exclude old policies", `${pairs.filter(M.needsAction).length} conflicts`, "Unproven retirement coverage requires a recorded risk decision."],
      ["reports", "6 · Check evidence", "Device application unverified", "Generate reports and verify device outcomes in Intune / Defender."]
    ];
    return `<div class="v2-overview"><div class="v2-hero"><span class="tag new">T28 · BETA</span><h3>Prepare → roll out → verify</h3><p>Tenant: <b>${esc(tenantName() || v2Context().tenantId)}</b>. This is a live Graph workflow: every write goes through the gates of its pane.</p><p class="mini">${unknown ? "Read is incomplete: do not infer readiness from missing rows." : "Policy and group data loaded."} Device compliance and applied protection remain unverified until checked separately.</p></div><div class="v2-grid">${cards.map(([id,title,status,help]) => `<button class="v2-card" data-mrpane="${id}"><span>${esc(title)}</span><strong>${esc(status)}</strong><small>${esc(help)}</small><span class="v2-card-link">Open →</span></button>`).join("")}</div><div class="list-card"><h4>Working alongside the existing version</h4><p class="mini">Both versions write to the same tenant. V2 has separate naming rules and session state. Re-read after switching or after another admin changes the tenant. Switching versions clears pending plans.</p><button class="btn" data-mrpane="rules">Review V2 naming rules</button> <button class="btn" data-mrpane="recovery">Download run files</button></div></div>`;
  }
  function v2Export() {
    const data = { schema: "tuno.t28.v2.run-bundle/1", build: APP_BUILD.build, exportedAt: new Date().toISOString(), tenantId: v2Context().tenantId, tenantName: tenantName(), rules: cfg, runs };
    download(`t28-v2-runs-${stamp()}.json`, JSON.stringify(data, null, 2), "application/json");
  }
  async function v2Import(file) {
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("Run file exceeds 25 MB.");
      const data = JSON.parse(await file.text());
      T28V2Safety.validateBundle(data, v2Context().tenantId);
      v2Imported = data;
    } catch (e) { v2Imported = { error: String(e.message || e) }; }
    render();
  }
  function v2Recovery() {
    return `<div class="list-card"><h3>Portable run files</h3><p>Export after every live run. This file contains tenant-bound rules, backups, actual write results and risk decisions. Keep it with your change record.</p><button class="btn" data-v2-export>Download session JSON</button><p class="mini">Undo in Changes this session creates a new plan. Only verified member operations are reversed; uncertain writes require a fresh read and manual reconciliation first. Import below inspects a saved run file and performs no tenant writes. Automatic restore after reloading is not implemented in this beta.</p><label class="wi-f"><span>Inspect an exported run file from this tenant</span><input type="file" id="mvImportRuns" accept=".json,application/json"></label>${v2Imported ? v2Imported.error ? `<div class="v2-risk">${esc(v2Imported.error)}</div>` : `<h4>Imported record · ${esc(v2Imported.exportedAt)}</h4><p class="mini">${v2Imported.runs.length} runs. Imported rules are not applied.</p>${v2Imported.runs.map((r) => `<div class="v2-import-row"><b>${esc(r.title)}</b><p class="mini">${esc(r.kind)} · ${Number(r.ok) || 0} verified · ${Number(r.bad) || 0} require review</p>${(r.lines || []).map((l) => `<p class="mini">${esc(l)}</p>`).join("")}</div>`).join("")}` : ""}</div>`;
  }

  // ------------------------------------------------------ per-tenant cfg --
  // The naming rules are this tenant's convention, so they are kept per
  // tenant — in this browser only. localStorage can be absent (private
  // window) or throw; the defaults are then simply the rules.
  const tenantKey = () => lc((typeof TunoTenant !== "undefined" && TunoTenant.tenantId()) || "default");
  const cfgKey = () => `tuno.t28.v2.rules.${tenantKey()}`;
  // 10661: the original T28 screen kept its rules under tuno.t28.rules.<tenant>.
  // It is gone, so a tenant with no V2 rules yet starts from those saved rules
  // (same engine, same shape) instead of the defaults, and they are saved
  // under the V2 key once. The old key is read, never written or removed.
  const legacyCfgKey = () => `tuno.t28.rules.${tenantKey()}`;
  let cfgCarried = false;
  function loadCfg() {
    cfgCarried = false;
    try {
      let raw = window.localStorage.getItem(cfgKey());
      if (!raw) {
        const old = window.localStorage.getItem(legacyCfgKey());
        if (old) { raw = old; cfgCarried = true; }
      }
      cfg = M.normConfig(raw ? JSON.parse(raw) : null);
      if (cfgCarried) { try { window.localStorage.setItem(cfgKey(), JSON.stringify(cfg)); } catch { /* private window */ } }
    }
    catch { cfg = M.normConfig(null); cfgCarried = false; }
    extLoadStored();   // 🧩 (10678): the approved list and the names given by hand, per tenant like the rules
  }
  function saveCfg(c) {
    cfg = M.normConfig(c);
    try { window.localStorage.setItem(cfgKey(), JSON.stringify(cfg)); return true; } catch { return false; }
  }

  // --------------------------------------------------------- names --
  // One map of group names for everything this screen prints: the read's
  // resolved names, the kinds read, the wave lookup, and every group a plan
  // named — so a verified write can be patched into the model with names.
  const names = new Map();
  function learnNames() {
    if (!model) return;
    for (const P of model.policies) for (const a of P.item.assignments || []) if (a.groupId && a.name && a.name !== a.groupId) names.set(lc(a.groupId), a.name);
    for (const [id, k] of kinds) if (k && k.name && k.name !== id) names.set(id, k.name);
    if (found) for (const g of found.values()) if (g && g.id) names.set(lc(g.id), g.displayName);
  }
  const nameOf = (id) => names.get(lc(id)) || id;

  // ----------------------------------------------------------- derive --
  // Everything below the read, recomputed together so no pane shows a
  // verdict the others have moved past.
  function derive() {
    model = M.build(res, cfg, templates);
    learnNames();
    const twins = M.twinIndex(model.cfg, found);
    pairs = M.compare(model, twins);
    const ctx = { kinds, waves: M.wavePool(model.cfg, found), twins, names, fixWith: cfg.fixWith, regions: rollRegions, cfg: model.cfg, pairs, found };
    pairs.forEach((pr) => { pr.proposal = M.proposalFor(pr, ctx); });
    retire = M.retirement(model);
    waveRows = M.waves(model, found, kinds, pairs);
    // selections that no longer exist are dropped, never silently kept
    for (const k of [...sel]) if (!model.byKey.has(k)) sel.delete(k);
    for (const id of [...selPairs]) if (!pairs.some((p) => p.id === id && M.needsAction(p))) selPairs.delete(id);
    if (asr.edits.size) { const keys = new Set(MdeAsr.matrix(model).filter((r) => r.editable).map((r) => r.key)); for (const k of [...asr.edits.keys()]) if (!keys.has(k)) asr.edits.delete(k); }
    // the wave members follow the rules and the wave lookup
    if (mem.input) memCompute();
  }

  // -------------------------------------------------------------- run --
  async function run(attach) {
    if (running || busy || mem.loading) return;
    running = true; $("mvRun").disabled = true;
    reps.error = "";
    try {
      loadCfg();
      if (!attach) { if (pane !== "reports") $("mvBody").innerHTML = ""; clearPlan(); }
      else { const o = $("mvBody").querySelector(":scope > .mr-offer"); if (o) o.remove(); }
      if (attach && PolicyCache.reading()) res = await PolicyCache.read(prog);
      else if (attach && PolicyCache.get()) res = PolicyCache.get();
      else {
        await Graph.ensureScopes([...new Set([...PolicyCache.scopesNeeded(), ...Graph.SCOPES.groups])]);
        res = await PolicyCache.refresh(prog);
      }
      prog("Reading the legacy endpoint security templates…");
      try { templates = await M.readTemplates(); } catch { templates = new Map(); }
      prog("Looking up the wave groups…");
      try { const f = await M.findGroups(cfg.lookup, prog); found = f.found; dupes = f.dupes; } catch { found = null; dupes = []; }
      derive();
      prog("");
      render();
      showExports(true);
      // Kinds and setting names follow the first paint: the lists are
      // useful at once, and the proposals sharpen when the kinds land.
      await enrich();
      return true;
    } catch (e) {
      prog("");
      if (pane === "reports") reps.error = `Tenant read failed: ${GroupUse.shortErr(e, 250)}`;
      $("mvBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div></div>`;
      return false;
    } finally { running = false; $("mvRun").disabled = false; if (pane === "reports" && model) render(); }
  }

  async function enrich() {
    if (!model) return;
    const act = pairs.filter(M.needsAction);
    const ids = new Set();
    model.newP.forEach((N) => N.reach.inc.forEach((g) => ids.add(g)));
    act.forEach((pr) => pr.O.reach.inc.forEach((g) => ids.add(g)));
    if (found) for (const g of found.values()) if (g && g.id) ids.add(lc(g.id));
    try {
      enriching = "reading group kinds…"; renderStatus();
      kinds = await M.readKinds([...ids], (m) => { enriching = m; renderStatus(); }, kinds);
    } catch { /* kinds stay unknown and the proposals say so */ }
    const polIds = [...new Set(act.flatMap((pr) => [pr.N, pr.O]).filter((P) => P.sectionId === "settingsCatalog").map((P) => P.id))];
    try {
      enriching = "reading setting names…"; renderStatus();
      labels = await M.readLabels(polIds, (m) => { enriching = m; renderStatus(); }, labels);
    } catch { /* ids stay ids */ }
    enriching = "";
    derive();
    render();
  }
  function renderStatus() { const el = $("mvEnrich"); if (el) el.textContent = enriching ? `⏳ ${enriching}` : ""; }

  function showExports(on) { ["mvMd", "mvCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); $("mvGlobalExport").hidden = !on || pane === "reports"; }
  // 10644 (Mihai: "clicking the tool should offer to read the tenant, and
  // not start automatically"). Opening T28 reads nothing. The screen offers
  // the read: a fresh one, or the sign-in read when TUNO already holds it.
  // Either way the tenant is only read on the click.
  function onShow() {
    if (model || running) return;
    offerRead();
  }
  function offerRead() {
    const body = $("mvBody");
    if (!body) return;
    const held = PolicyCache.get(), busy = PolicyCache.reading();
    const t = held ? PolicyCache.timeLabel() : "";
    const alt = held
      ? `<button class="btn" data-mrread="attach">Use the ${PolicyCache.fromSignIn() ? "sign-in" : "shared"} read from ${esc(t)}</button>`
      : busy ? `<button class="btn" data-mrread="attach">Wait for the sign-in read</button>` : "";
    body.innerHTML = `<div class="list-card mr-offer">
      <h3>Nothing is read yet</h3>
      <p class="mini">Reading takes the policies and their assignments, the legacy security templates and the wave groups. It changes nothing: T28 writes only when you apply a plan.</p>
      <div class="mr-offer-acts"><button class="btn primary" data-mrread="fresh">↻ Read the tenant</button>${alt}</div>
      ${held ? `<p class="mini muted">The ${PolicyCache.fromSignIn() ? "sign-in" : "shared"} read is the tenant as it was at ${esc(t)}. ↻ Read the tenant reads it now.</p>`
        : busy ? `<p class="mini muted">TUNO is still reading the tenant from the sign-in. Waiting for it saves a second read.</p>` : ""}
    </div>`;
  }
  function reset() {
    v2Imported = null; v2AllowLeftOut = false; pane = "overview";
    res = null; model = null; pairs = []; retire = []; waveRows = []; found = null; dupes = [];
    kinds = new Map(); labels = new Map(); names.clear(); sel.clear(); selPairs.clear(); selWaves.clear(); selRename.clear(); open.clear();
    runs.length = 0; filterList = null; clearPlan();
    reps.assign = null; reps.config = null; reps.conflicts = null; reps.checks.length = 0; reps.busy = ""; reps.selected = "assign"; reps.error = "";
    mem.input = null; mem.model = null; mem.loading = false; mem.region = null; mem.unmapped = false; mem.sel.clear(); mem.open.clear();
    mem.left = false; mem.leftCountry = null; mem.leftReason = null; mem.pil = false; mem.pilState = null; mem.pilSel.clear();
    mem.logons.clear(); mem.looked.clear(); mem.logBusy = ""; mem.logError = "";
    Object.assign(ex, { base: null, loading: false, error: "", q: "", searching: false, results: null, note: "", card: null, cardLoading: false, cardError: "" });
    ex.ticks.clear(); ex.sel.clear(); planAnchor = null;
    Object.assign(cs, { extra: null, error: "", scope: "all", ticks: null, sig: "", confirm: "", mapOk: "" }); csCache = null;
    Object.assign(rv, { q: "", searching: false, results: null, note: "", card: null, cardLoading: false, cardError: "", reason: "", error: "" }); rv.ticks.clear(); rv.sel.clear();
    asr.edits.clear(); asr.filter = "all";
    ext.edits.clear(); ext.names.clear(); ext.list = null; ext.policyKey = null; ext.filter = "all"; ext.q = ""; ext.hits = null; ext.note = ""; ext.err = ""; ext.looking = ""; ext.routeMsg = "";
    if ($("mvBody")) $("mvBody").innerHTML = "";
    showExports(false); syncSelbar();
  }

  // ------------------------------------------------------------ chips --
  const chip = (cls, text, title) => `<span class="${cls}"${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</span>`;
  const genChip = (P) => chip(M.GEN[P.generation].cls, M.GEN[P.generation].label);
  const catIcons = (P) => P.cats.map((c) => { const m = M.catMeta(c); return `<span title="${esc(m.label)}">${m.icon}</span>`; }).join(" ");
  const assignChips = (P) => (P.item.assignments || []).length
    ? P.item.assignments.map((a) => `<span class="gu-how ${a.kind === "Excluded" ? "exc" : "inc"}"${a.filterId ? ` title="assignment filter — evaluated by the service, not here"` : ""}>${esc(Docs.assignmentText(a))}</span>`).join(" ")
    : `<span class="mini muted">not assigned</span>`;
  const kindWord = (id) => { const k = kinds.get(lc(id)); return k ? `${k.kind}${k.source && k.source !== "members" ? ` (by ${k.source})` : ""}` : "kind not read"; };
  const audChip = (P) => P.audience ? `<span title="${esc(`A ${M.AUD[P.audience].label} policy by its name (${M.AUD[P.audience].tag}) — it takes the ${M.AUD[P.audience].label} wave groups`)}">${M.AUD[P.audience].icon} ${esc(M.AUD[P.audience].label)}</span> · ` : "";
  const polLink = (P) => `<a href="#" data-mropen="${esc(P.key)}" title="Open the policy — settings and assignments">${esc(P.name)}</a>`;

  // ------------------------------------------------------------- rail --
  // Layout B restored at 10638 (Mihai: "the other layout was better, but
  // only the reports layout needed adjustment" — option A off the mockup):
  // the rail, one level, every count in view; 📑 Reports opens into its
  // three reports, each with its state, and the preview takes the main column.
  function railHtml() {
    const act = pairs.filter(M.needsAction);
    const gaps = retire.filter((r) => r.verdict === "gap").length;
    const missing = waveRows.filter((w) => w.lookedUp && !w.exists && !w.legacy).length;
    const toRename = waveRows.filter((w) => w.legacy && !w.exists).length;
    const node = (id, icon, label, n, bad) => `<div class="ep-node${pane === id && id !== "reports" ? " active" : ""}${id === "reports" && pane === "reports" ? " mr-open" : ""}" data-mrpane="${id}" role="button" tabindex="0">
      <span>${icon} ${esc(label)}</span>${n !== null && n !== undefined ? `<span class="ep-n${bad ? " gap" : ""}">${esc(n)}</span>` : ""}</div>`;
    const made = REPORTS.filter((x) => reps[x.id]).length;
    const repNode = (x) => {
      const r = reps[x.id];
      const st = reps.busy === x.id ? "running…" : !r ? "not generated" : reportStale(x.id) ? "regenerate" : x.id === "conflicts" && r.summary ? `${r.summary.act} to act · ${shortTime(r.at)}` : `generated ${shortTime(r.at)}`;
      const bad = r && (reportStale(x.id) || (x.id === "conflicts" && r.summary && r.summary.act > 0));
      return `<div class="ep-node mr-rep-node${pane === "reports" && reps.selected === x.id ? " active" : ""}" data-mrreport="${x.id}" role="button" tabindex="0">
        <span>${x.icon} ${esc(x.title)}</span><span class="mr-rep-state${bad ? " gap" : ""}">${esc(st)}</span></div>`;
    };
    return [
      node("overview", "◉", "Rollout overview", null),
      `<div class="v2-rail-label">PREPARE</div>`,
      node("new", "🎯", "New policies", model.newP.length),
      node("conflicts", "⚔️", "Conflicts with old", act.length, act.length > 0),
      (() => { const rows = MdeAsr.matrix(model); const diff = rows.filter((r) => r.P && MdeAsr.verdict(r.now, r.baseline) === "differs").length; return node("asr", "🎛", "Adjust settings", asr.edits.size ? `${asr.edits.size} ✎` : diff ? `${diff} ≠ baseline` : "✓", diff > 0 && !asr.edits.size); })(),
      // 🧩 (10678): the Edge extensions policy's two lists — its own node, nothing in the header
      (() => { const P = extPolicy(); if (!P) return node("edgeext", "🧩", "Edge extensions", "none", false); const now = extNow(P); const bad = extIdsOf(now).filter((id) => extNameOf(id).status === "404").length; return node("edgeext", "🧩", "Edge extensions", ext.edits.size ? `${ext.edits.size} ✎` : bad ? `${bad} ⚠` : `${now.force.length} · ${now.allow.length}`, bad > 0 && !ext.edits.size); })(),
      node("old", "🗄", "Old policies", model.oldP.length),
      node("retire", "🧹", "Retirement check", gaps ? `${gaps} gap${gaps === 1 ? "" : "s"}` : "✓", gaps > 0),
      `<div class="v2-rail-label">ROLLOUT</div>`,
      node("waves", "🌊", "Wave groups", toRename ? `${toRename} to rename` : missing ? `${missing} missing` : waveRows.length, missing > 0 || toRename > 0),
      (() => { const st = memStale(); return node("members", "👥", "Wave members", st ? st.label : null, st ? st.bad : false); })(),
      // 🔄 / ↩ (10679): the static country groups and the way back to the old set
      (() => { const sm = csModel(); return node("countrysync", "🔄", "Country groups", sm ? (sm.drift ? `${sm.drift} drift` : "✓") : null, !!(sm && sm.stale)); })(),
      (() => { const n = exNow(); return node("exclusions", "⊘", "Exclusions", n ? (n.half ? `${n.half} half` : `${n.users} · ${n.devices}`) : null, !!(n && n.half)); })(),
      (() => { const sm = csModel(); return node("revert", "↩", "Revert", sm ? `${sm.revertUsers.size} · ${sm.revertDevices.size}` : null, false); })(),
      "<hr>",
      `<div class="v2-rail-label">CHECK & RECOVER</div>`,
      node("recovery", "⭳", "Run files", runs.length),
      node("reports", "📑", "Reports", `${made} of ${REPORTS.length}`),
      REPORTS.map(repNode).join(""),
      node("changes", "📜", "Changes this session", runs.length),
      node("rules", "⚙️", "Naming rules", null),
      node("how", "❓", "How it works", null),
      "<hr>",
      node("out", "🚫", "Out of scope", model.outP.length),
    ].join("");
  }

  // -------------------------------------------------------- toolbars --
  const fchip = (attr, val, label, n, active) => `<button class="fchip${active ? " active" : ""}" type="button" ${attr}="${esc(val)}">${esc(label)}${n !== undefined ? ` (${n})` : ""}</button>`;
  function catChips(list, catsOf) {
    const counts = {};
    list.forEach((x) => catsOf(x).forEach((c) => { counts[c] = (counts[c] || 0) + 1; }));
    const ids = M.CAT_IDS.filter((c) => counts[c]);
    return fchip("data-mrcat", "", "All", list.length, !view.cat)
      + ids.map((c) => { const m = M.catMeta(c); return fchip("data-mrcat", c, `${m.icon} ${m.label}`, counts[c], view.cat === c); }).join("");
  }
  const searchBox = () => `<input class="btn" id="mvQ" type="search" placeholder="Filter by policy or group…" value="${esc(view.q)}" style="min-width:220px;text-align:left" autocomplete="off" spellcheck="false">`;
  const matchQ = (P) => !view.q || lc(P.name).includes(lc(view.q)) || (P.item.assignments || []).some((a) => lc(a.name).includes(lc(view.q)));

  // ------------------------------------------------------ pane: lists --
  function policyPane(list, which) {
    const collisions = (P) => pairs.filter((pr) => M.needsAction(pr) && (which === "new" ? pr.N === P : pr.O === P));
    const retOf = (P) => retire.find((r) => r.O === P);
    const stateOk = (P) => !view.state || (view.state === "assigned" ? P.state === "assigned" : view.state === "unassigned" ? P.state !== "assigned" : collisions(P).length > 0);
    const shown = list.filter((P) => (!view.cat || P.cats.includes(view.cat)) && stateOk(P) && matchQ(P));
    const n = (f) => list.filter(f).length;
    const tb = `<div class="toolbar">${catChips(list, (P) => P.cats)}</div>
      <div class="toolbar">
        ${fchip("data-mrstate", "", "Any state", undefined, !view.state)}
        ${fchip("data-mrstate", "assigned", "Assigned", n((P) => P.state === "assigned"), view.state === "assigned")}
        ${fchip("data-mrstate", "unassigned", "Not assigned", n((P) => P.state !== "assigned"), view.state === "unassigned")}
        ${fchip("data-mrstate", "collides", "⚔️ Collides", n((P) => collisions(P).length > 0), view.state === "collides")}
        ${searchBox()}
      </div>`;
    const editable = which !== "out";
    const allOn = shown.length && shown.filter((P) => P.surface).every((P) => sel.has(P.key));
    const rows = shown.map((P) => {
      const col = collisions(P);
      const worst = col.length ? col.slice().sort((a, b) => M.VERDICT[a.reach.verdict].rank - M.VERDICT[b.reach.verdict].rank)[0] : null;
      const r = which === "old" ? retOf(P) : null;
      const pick = editable && P.surface
        ? `<input type="checkbox" data-mrpick="${esc(P.key)}"${sel.has(P.key) ? " checked" : ""} aria-label="select">`
        : editable ? `<span class="mini muted" title="This surface is not one the Assignment editor's engine writes">—</span>` : "";
      return `<tr>
        ${editable ? `<td style="width:26px">${pick}</td>` : ""}
        <td><b>${polLink(P)}</b><div class="mini muted">${genChip(P)} ${audChip(P)}${esc(P.kind)}${P.scopeWhy ? ` · <span title="In scope: ${esc(P.scopeWhy)}">${/name/.test(P.scopeWhy) ? "➕ by name" : "🔗 shares a setting"}</span>` : ""}${P.outWhy ? ` · <span title="Out of scope: ${esc(P.outWhy)} — never compared, planned or pulled in">➖ left out by name</span> <button class="btn mr-incl" type="button" data-mrinclude="${esc(P.name)}" title="Take this name off ⚙️ Leave out for this tenant — it is in scope again">➕ include</button>` : ""}${P.mdeManaged ? ` · <span title="Also delivered by MDE security settings management — device groups only, no filters">🛰 MDE-managed</span>` : ""}${P.detailError ? ` · <span style="color:var(--off)">settings unreadable</span>` : ""}</div></td>
        <td style="white-space:nowrap">${catIcons(P)}</td>
        <td class="mini">${assignChips(P)}</td>
        <td class="mini">${which === "out" ? "" : col.length
          ? `<a href="#" data-mrgo="${esc(P.key)}">${chip(M.VERDICT[worst.reach.verdict].cls, `${col.length} × ${M.VERDICT[worst.reach.verdict].label}`)}</a>`
          : `<span class="muted">none</span>`}${r ? `<div style="margin-top:4px">${chip(M.RETIRE[r.verdict].cls, M.RETIRE[r.verdict].label)}</div>` : ""}</td>
      </tr>`;
    }).join("");
    const heads = which === "new" ? "Colliding old policies" : which === "old" ? "Collides with · retirement" : "";
    const intro = {
      new: `The new set — names starting with ${cfg.newPrefixes.map((p) => `<b>${esc(p)}</b>`).join(", ")}. Tick policies and use the bar below to include a wave group (or exclude, or remove), with an assignment filter if you want one.`,
      old: "Everything MDE-related that is neither new nor out of scope. Tick old policies to add an exclusion by hand; the ⚔️ pane proposes them for you.",
      out: `Out of scope by prefix (${cfg.outPrefixes.map((p) => `<b>${esc(p)}</b>`).join(", ")}), and the ${cfg.leaveOut.length} names under ⚙️ <b>Leave out</b> (marked ➖ — <b>➕ include</b> puts one back in scope for this tenant). Listed so nothing is hidden, never compared, never proposed.`,
    }[which];
    return `${tb}
      <div class="list-card" style="margin-top:0">
        <p class="mini muted" style="margin:0 0 10px">${intro}</p>
        ${shown.length ? `<div style="overflow-x:auto"><table class="cg-table">
          <colgroup>${editable ? `<col style="width:30px">` : ""}<col style="width:34%"><col style="width:64px"><col><col style="width:20%"></colgroup>
          <thead><tr>${editable ? `<th><input type="checkbox" data-mrpickall="${which}"${allOn ? " checked" : ""} aria-label="select all shown"></th>` : ""}<th>Policy</th><th>Area</th><th>Assignments</th><th>${heads}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">Nothing matches the filters.</p>`}
      </div>`;
  }

  // -------------------------------------------------- pane: conflicts --
  const STATUS = [
    ["act", "Needs action", (p) => M.needsAction(p)],
    ["can", "⚔️ Can collide", (p) => p.type !== "duplicate" && p.reach.verdict === "can"],
    ["may", "❓ May", (p) => p.type !== "duplicate" && p.reach.verdict === "may"],
    ["staged", "⏳ Staged", (p) => p.type !== "duplicate" && p.reach.verdict === "staged"],
    ["review", "🔎 Other format", (p) => p.type === "review"],
    ["duplicate", "🟰 Same value", (p) => p.type === "duplicate"],
    ["resolved", "✅ Resolved", (p) => p.reach.verdict === "resolved"],
    ["all", "All", () => true],
  ];
  const settingLine = (d) => {
    const name = M.labelName(labels, d);
    const nv = M.labelValue(labels, d.key, d.newValue) || d.newDisplay;
    const ov = M.labelValue(labels, d.key, d.oldValue) || d.oldDisplay;
    return { name, nv: d.redacted ? d.newDisplay : nv, ov: d.redacted ? d.oldDisplay : ov };
  };
  // 🧪 one tick for every plan that puts the waves in (⚔️, ⚡①, ⚡③, the
  // bar's 🌊 Waves) — kept per tenant with the rules (10645)
  const pilotTick = () => `<label class="chk mr-piltick" title="${esc(`Pilot groups (⚙️): ${cfg.pilotGroups.join(", ") || "none"}. They come off a new policy's includes and an old policy's exclusions once every wave is in the one and out of the other — a pilot member outside a wave goes back to the old policy until their wave has them.`)}"><input type="checkbox" data-mrpilots${cfg.pilotGroupsOff ? " checked" : ""}> 🧪 take the pilot groups off</label>`;
  const canFixPair = (pr) => M.needsAction(pr) && pr.proposal && (pr.proposal.steps.some((s) => s.supported !== false) || !!(pr.proposal.includes && pr.proposal.includes.length) || !!(pr.proposal.pilots && pr.proposal.pilots.steps.length));
  function proposalHtml(pr) {
    const p = pr.proposal;
    if (!p) return "";
    const pil = p.pilots || { steps: [], kept: [] };
    const pilHtml = (side) => { const st = pil.steps.filter((x) => x.side === side), kp = pil.kept.filter((x) => x.side === side);
      return (st.length ? `<div style="margin:2px 0">${st.map((x) => chip("au-op update", `− remove ${side === "new" ? "include" : "exclusion"} ${x.groupName}`)).join(" ")} <span class="mini muted">🧪 pilot: the waves take over</span></div>` : "")
        + (kp.length ? `<div class="mini" style="color:var(--report)" title="${esc(kp.map((x) => x.why).join("\n"))}">🧪 ${esc(kp.map((x) => x.groupName).join(", "))} stay${kp.length === 1 ? "s" : ""} <span style="cursor:help">ⓘ</span></div>` : ""); };
    if (!p.steps.length && !(p.includes && p.includes.length) && !pil.steps.length) return `<span class="mini muted">${esc(p.none)}</span>${p.byWaves && p.rest && p.rest.length && !/own groups/.test(p.none) ? `<div class="mini muted">the new policy's own groups (${esc(p.rest.join(", "))}) still meet it</div>` : ""}`;
    const sub = (t) => p.byWaves ? `<div class="mr-fixsub">${t}</div>` : "";
    const newSide = pilHtml("new");
    const incl = (p.includes && p.includes.length) || newSide ? `${sub("on the new policy, in the same plan")}${(p.includes || []).map((x) => `<div style="margin:2px 0">${chip("au-op create", `+ include ${x.groupName}`)} <span class="mini muted">not in it yet</span></div>`).join("")}${newSide}` : "";
    const rest = p.byWaves && p.rest && p.rest.length ? `<div class="mini muted" style="margin-top:4px" title="Switch to 'the new policy's groups' to exclude those">the new policy's own groups (${esc(p.rest.join(", "))}) are left as they are</div>` : "";
    const oldSide = pilHtml("old");
    return (p.steps.length ? sub("on the old policy") : sub("on the old policy — every wave is out already")) + p.steps.map((s) => {
      const verb = s.action === "remove" ? "remove include" : "exclude";
      const cls = s.supported === false ? "au-op delete" : s.action === "remove" ? "au-op update" : "gu-how exc";
      const tk = [...M.effectiveTargets(pr.O, kinds).kinds].filter((k) => k !== "empty").join("/") || "unknown";
      const warn = s.supported === false ? `<div class="mini" style="color:var(--off)" title="${esc(s.why)}">✖ not supported — ${esc(s.kind)} group vs a ${esc(tk)}-targeted policy${s.missingTwin ? ` · create <a href="#" data-mrpane="waves">${esc(s.missingTwin)}</a> first` : ""} <span style="cursor:help">ⓘ</span></div>`
        : s.supported === null ? `<div class="mini" style="color:var(--report)" title="${esc(s.why)}">⚠ kind not certain <span style="cursor:help">ⓘ</span></div>` : "";
      const notes = s.notes.length ? `<div class="mini muted">${s.notes.map((n) => /^planned/.test(n) ? "planned wave" : /^twin:/.test(n) ? `twin of ${s.twinOf}` : /^target kind from/.test(n) ? "target kind from the name" : /contradiction/.test(n) ? "old policy includes it → include removed" : /MDE security settings/.test(n) ? "🛰 device groups only" : /included in the same plan/.test(n) ? "joins the new policy in this plan" : n).map((n, i) => `<span title="${esc(s.notes[i])}">${esc(n)}</span>`).join(" · ")}</div>` : "";
      return `<div style="margin:2px 0">${chip(cls, `${s.action === "remove" ? "−" : "⊘"} ${verb} ${s.groupName}`)} <span class="mini muted">${esc(s.kind)} group</span>${warn}${notes}</div>`;
    }).join("") + oldSide + incl + rest;
  }
  function conflictsPane() {
    const filt = (STATUS.find((s) => s[0] === view.status) || STATUS[0])[2];
    const counts = Object.fromEntries(STATUS.map(([id, , f]) => [id, pairs.filter(f).length]));
    const shown = pairs.filter((p) => filt(p) && (!view.cat || p.cats.includes(view.cat))
      && (!view.q || lc(p.O.name).includes(lc(view.q)) || lc(p.N.name).includes(lc(view.q))));
    const tb = `<div class="toolbar">${STATUS.map(([id, label]) => fchip("data-mrstatus", id, label, counts[id], view.status === id)).join("")}</div>
      <div class="toolbar">${catChips(pairs.filter(filt), (p) => p.cats)}${searchBox()}</div>`;
    // grouped by OLD policy — the object the fix writes to
    const groups = new Map();
    for (const pr of shown) { if (!groups.has(pr.O.key)) groups.set(pr.O.key, []); groups.get(pr.O.key).push(pr); }
    const body = [...groups.values()].map((list) => {
      const O = list[0].O;
      const fixable = list.filter(canFixPair);
      const allOn = fixable.length && fixable.every((pr) => selPairs.has(pr.id));
      const tk = [...M.targetKinds(O, kinds)].join(" + ") || "no includes";
      const head = `<tr class="mr-oldhead"><td style="width:26px">${fixable.length ? `<input type="checkbox" data-mrpairall="${esc(O.key)}"${allOn ? " checked" : ""} aria-label="select every fix on this old policy">` : ""}</td>
        <td colspan="4"><b>${polLink(O)}</b> ${genChip(O)} <span class="mini muted">${esc(O.kind)} · targets: ${esc(tk)}${O.mdeManaged ? " · 🛰 MDE-managed" : ""}</span>
        <div class="mini" style="margin-top:4px">${assignChips(O)}</div></td></tr>`;
      const rows = list.map((pr) => {
        const canFix = canFixPair(pr);
        const isOpen = open.has(pr.id);
        const lines = pr.type === "review"
          ? `<span class="mini">${pr.common.map((c) => { const m = M.catMeta(c); return `${m.icon} ${esc(m.label)}`; }).join(", ")} in both — the old one is <i>${esc(pr.O.kind)}</i>, which cannot be matched setting by setting; compare them in the portal</span>`
          : (pr.diffs.length ? pr.diffs : pr.sames).slice(0, 3).map((d) => { const s = settingLine(d); return `<div class="mini"><b>${esc(s.name)}</b>: ${esc(s.nv)} ${pr.diffs.length ? "→" : "="} ${esc(s.ov)}</div>`; }).join("")
            + ((pr.diffs.length || pr.sames.length) > 3 ? `<div class="mini muted">+${(pr.diffs.length || pr.sames.length) - 3} more</div>` : "");
        const more = pr.type !== "review" ? `<a href="#" class="mini" data-mrfold="${esc(pr.id)}">${isOpen ? "▴ less" : `▾ ${pr.diffs.length} different · ${pr.sames.length} same`}</a>` : "";
        const detail = !isOpen ? "" : `<tr><td></td><td colspan="4"><div class="ep-brief" style="margin:0">
            <div style="overflow-x:auto"><table class="cg-table mini"><thead><tr><th>Setting</th><th>New</th><th>Old</th><th></th></tr></thead><tbody>
            ${pr.diffs.concat(pr.sames).map((d) => { const s = settingLine(d); const same = pr.sames.includes(d); return `<tr><td>${esc(s.name)}</td><td>${esc(s.nv)}</td><td>${esc(s.ov)}</td><td>${same ? chip("au-op other", "same") : chip("au-op delete", "different")}</td></tr>`; }).join("")}
            </tbody></table></div>
            <p class="mini muted" style="margin:8px 0 0">New policy targets: ${assignChips(pr.N)}</p>
            <p class="mini muted" style="margin:4px 0 0">Reach: ${esc(pr.reach.why)}.</p></div></td></tr>`;
        return `<tr>
          <td>${canFix ? `<input type="checkbox" data-mrpair="${esc(pr.id)}"${selPairs.has(pr.id) ? " checked" : ""} aria-label="select this fix">` : ""}</td>
          <td class="mini">${polLink(pr.N)}<div>${catIcons(pr.N)} ${chip(M.TYPE[pr.type].cls, M.TYPE[pr.type].label)}</div></td>
          <td>${lines}${more}</td>
          <td class="mini" title="${esc(pr.reach.why)}">${chip(M.VERDICT[pr.reach.verdict].cls, M.VERDICT[pr.reach.verdict].label)}<div class="muted" style="margin-top:3px">${esc(M.VERDICT[pr.reach.verdict].short)}</div></td>
          <td>${proposalHtml(pr)}</td>
        </tr>${detail}`;
      }).join("");
      return head + rows;
    }).join("");
    const unsupported = pairs.filter((p) => M.needsAction(p) && p.proposal && p.proposal.steps.some((s) => s.supported === false)).length;
    return `${tb}
      <div class="list-card" style="margin-top:0">
        <div class="mr-fixwith"><span class="mini"><b>Proposed fix excludes:</b></span><span class="seg" role="group" aria-label="What a proposed fix excludes"><button type="button" class="${cfg.fixWith === "waves" ? "active" : ""}" data-mrfixwith="waves">🌊 the waves</button><button type="button" class="${cfg.fixWith === "groups" ? "active" : ""}" data-mrfixwith="groups">the new policy's groups</button></span>
          ${cfg.fixWith === "waves" ? `<span class="mini muted">Regions: ${esc(rollRegions ? [...rollRegions].join(" · ") || "none" : "every region")} <a href="#" data-mrpane="waves">(🌊)</a></span>${pilotTick()}` : ""}</div>
        <p class="mini muted" style="margin:0 0 6px">Old policies that set a setting a new policy sets — grouped by the old policy, because that is where the fix is written. ${cfg.fixWith === "waves"
          ? "The proposed fix takes the <b>waves</b> of the new policy's kind out of the old policy — and includes a wave in the new policy in the same plan where it is not in yet, so a wave never leaves the old policy ahead of the new one (⚡① and ⚡③ for one conflict). The new policy's own other groups are left as they are."
          : "The proposed fix excludes the <b>new policy's include groups</b> from the old policy, so those devices take the new settings alone."} Tick fixes and use the bar: <b>② Dry run</b> reads the policies fresh and shows every change before anything is written.</p>
        ${unsupported ? `<p class="mini" style="margin:0 0 6px;color:var(--off)">✖ ${plural(unsupported, "collision")} can only be fixed with an exclusion Intune does not support (user group ↔ device group). Those steps are shown, never written — create the wave's device/user twin in 🌊 (it is proposed instead once it exists), or use an assignment filter on the new policy.</p>` : ""}
        <p class="mini muted" id="mvEnrich" style="margin:0 0 6px">${enriching ? `⏳ ${esc(enriching)}` : ""}</p>
        ${shown.length ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30px"><col style="width:24%"><col style="width:30%"><col style="width:15%"><col></colgroup><thead><tr><th></th><th>New policy</th><th>Settings (new → old)</th><th>Reach</th><th>Proposed fix</th></tr></thead><tbody>${body}</tbody></table></div>`
          : `<p class="mini muted" style="margin:0">${pairs.length ? "Nothing with this status." : "No old policy sets a setting the new set sets — nothing collides."}</p>`}
      </div>`;
  }

  // ------------------------------------------------- pane: retirement --
  function retirePane() {
    const counts = {};
    retire.forEach((r) => { counts[r.verdict] = (counts[r.verdict] || 0) + 1; });
    const REACH = { can: "yes — shared targets", may: "maybe — different groups", cannot: "no", none: "no covering new policy is assigned" };
    const stOk = (r) => !view.state || (view.state === "assigned" ? r.O.state === "assigned" : r.O.state !== "assigned");
    const rows = retire.filter((r) => matchQ(r.O) && (!view.cat || r.O.cats.includes(view.cat)) && stOk(r)).map((r) => {
      const isOpen = open.has("ret|" + r.O.key);
      const detail = !isOpen || r.O.format !== "catalog" ? "" : `<tr><td colspan="5"><div class="ep-brief" style="margin:0"><div style="overflow-x:auto"><table class="cg-table mini">
        <thead><tr><th>Setting</th><th>Old value</th><th>In the new set</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr><td>${esc(M.labelName(labels, x) || x.name)}</td><td>${esc(x.oldDisplay)}</td><td>${x.news.length
          ? x.news.map((n) => `${n.same ? "✓" : "≠"} ${esc(n.name)} = ${esc(n.display)}`).join("<br>")
          : `<b style="color:var(--off)">nowhere — retiring removes this</b>`}</td></tr>`).join("")}
        </tbody></table></div></div></td></tr>`;
      return `<tr>
        <td>${chip(M.RETIRE[r.verdict].cls, M.RETIRE[r.verdict].label)}</td>
        <td><b>${polLink(r.O)}</b><div class="mini muted">${genChip(r.O)} ${esc(r.O.kind)} · ${r.O.state === "assigned" ? "assigned" : "not assigned"}</div></td>
        <td class="mini">${r.O.format === "catalog" ? `${r.same} same · ${r.diff} different · <b${r.none ? ' style="color:var(--off)"' : ""}>${r.none} missing</b>${r.rows.length ? ` · <a href="#" data-mrfold="ret|${esc(r.O.key)}">${isOpen ? "▴" : "▾"} settings</a>` : ""}` : `${plural(r.O.settingCount, "setting")} · compare by hand`}</td>
        <td class="mini">${r.covering.length ? r.covering.map((c) => polLink(c)).join("<br>") : `<span class="muted">none</span>`}</td>
        <td class="mini">${r.O.state !== "assigned" ? `<span class="muted">old one is not assigned — retiring it changes no device</span>` : esc(REACH[r.reach])}</td></tr>${detail}`;
    }).join("");
    const na = retire.filter((r) => r.O.state === "assigned").length;
    return `<div class="toolbar">${catChips(retire.map((r) => r.O), (P) => P.cats)}</div>
      <div class="toolbar">${fchip("data-mrstate", "", "Any state", undefined, !view.state)}${fchip("data-mrstate", "assigned", "Assigned — retiring changes devices", na, view.state === "assigned")}${fchip("data-mrstate", "unassigned", "Not assigned", retire.length - na, view.state === "unassigned")}${searchBox()}</div>
      <div class="list-card" style="margin-top:0">
        <p class="mini muted" style="margin:0 0 10px">Before an old policy is unassigned, every setting it carries is looked up in the new set. <b>Gap</b>: at least one setting exists in no new policy — retiring the old policy removes it from those devices. <b>Values differ</b>: the new set sets it, differently — confirm that is the intent. The last column asks whether the covering new policies reach the old policy's targets at all.</p>
        <div class="au-cards" style="margin-bottom:10px">${["gap", "differs", "manual", "covered"].map((v) => `<div class="au-card"><div class="au-card-l">${esc(M.RETIRE[v].label)}</div><div class="au-card-n ${v === "gap" && counts.gap ? "bad" : v === "covered" ? "ok" : ""}">${counts[v] || 0}</div></div>`).join("")}</div>
        ${rows ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:15%"><col style="width:27%"><col style="width:19%"><col style="width:23%"><col></colgroup><thead><tr><th>Verdict</th><th>Old policy</th><th>Its settings in the new set</th><th>Covering new policies</th><th>Do they reach its targets?</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">No old policies.</p>`}
      </div>`;
  }

  // ------------------------------------------------------ pane: waves --
  function wavesPane() {
    const rowHtml = (w) => {
      const dup = dupes.find((d) => lc(d.name) === lc(w.name));
      const status = !w.lookedUp ? `<span class="muted">not looked up</span>`
        : dup ? chip("au-op delete", `${dup.count} groups share this name`)
        : w.exists ? chip("au-op create", "exists") + (w.legacyToo.length ? `<div class="mini" style="color:var(--report)" title="Left alone — rename or delete it in Entra if it is a leftover">also a group named ${esc(w.legacyToo.join(", "))}</div>` : "")
        : w.legacy ? chip("au-op update", "old name") + `<div class="mini muted">as ${esc(w.legacy.name)}</div>` : chip("gu-how priv", "missing");
      const pick = w.legacy && !w.exists ? `<input type="checkbox" data-mrrename="${esc(w.name)}"${selRename.has(w.name) ? " checked" : ""} aria-label="rename this group">`
        : w.lookedUp && !w.exists ? `<input type="checkbox" data-mrwave="${esc(w.name)}"${selWaves.has(w.name) ? " checked" : ""} aria-label="create this group">` : "";
      const k = w.id ? kinds.get(w.id) : null;
      const members = k && (k.users != null || k.devices != null) ? `${k.users || 0} users · ${k.devices || 0} devices` : "";
      const off = w.exists && w.kind !== w.audience && (w.kind === "user" || w.kind === "device" || w.kind === "mixed");
      const aud = M.AUD[w.audience];
      const readKind = !w.exists || w.kind === w.audience ? ""
        : ` · <span${off ? ` style="color:var(--off)" title="Named for ${esc(aud.label)}s, but it holds ${esc(w.kind)} members"` : ""}>read: ${esc(w.kind)}</span>${w.kindSource && w.kindSource !== "members" ? ` <span class="muted">(${esc(w.kindSource)})</span>` : ""}`;
      const kindCell = `${aud.icon} ${esc(aud.label)}${readKind}${members ? `<div class="muted">${esc(members)}</div>` : ""}`;
      let newCell;
      if (!w.exists) newCell = "—";
      else if (w.role === "exclusion") {
        const rest = w.fits.filter((N) => N.surface && !N.reach.exc.has(w.id)).length;
        newCell = `excluded from ${w.newExcluding.length} / ${w.fits.length}${rest ? ` · <a href="#" data-mrexcl="${esc(w.name)}">exclude from the rest →</a>` : ""}`;
      } else {
        const rest = w.fits.filter((N) => N.surface && !N.reach.inc.has(w.id)).length;
        newCell = !w.fits.length && !w.newIncluding.length ? `<span class="muted">no ${esc(aud.tag)} policy in the new set</span>` : `${w.newIncluding.length} / ${w.fits.length}${rest ? ` · <a href="#" data-mrwaveinc="${esc(w.name)}">include in the rest →</a>` : ""}`;
      }
      if (w.misfit.length) newCell += `<div style="color:var(--off)" title="${esc(w.misfit.map((N) => N.name).join("\n"))}">✖ in ${plural(w.misfit.length, `${w.audience === "user" ? "device" : "user"} policy`, `${w.audience === "user" ? "device" : "user"} policies`)} — use its twin there</div>`;
      const oldCell = w.role === "exclusion" ? `<span class="muted">—</span>` : w.exists ? (w.pending.length ? (() => {
        const fixable = new Set(pairs.filter((pr) => M.needsAction(pr) && pr.N.reach.inc.has(w.id) && pr.proposal && pr.proposal.steps.some((st) => (st.groupId === w.id || st.twinOfId === w.id) && st.supported !== false)).map((pr) => pr.O.key)).size;
        return `${plural(w.pending.length, "old policy", "old policies")}${fixable ? ` · <a href="#" data-mrwavefix="${esc(w.id)}">select the ${fixable} fixable →</a>` : ""}${fixable < w.pending.length ? `<div style="color:var(--off)">${w.pending.length - fixable} need ${w.twinId ? "an assignment filter" : `${esc(w.twin)} (create it here)`}</div>` : ""}`;
      })() : `<span class="muted">none</span>`) : "—";
      return `<tr><td style="width:26px">${pick}</td>
        <td><b>${esc(w.name)}</b><div class="mini muted">${w.id ? `<code data-selall>${esc(w.id)}</code>` : ""}</div></td>
        <td>${status}</td>
        <td class="mini">${kindCell}</td>
        <td class="mini">${newCell}</td>
        <td class="mini">${oldCell}</td></tr>`;
    };
    const head = (label, sub) => `<tr class="mr-oldhead"><td colspan="6"><b>${esc(label)}</b>${sub ? ` <span class="mini muted">${esc(sub)}</span>` : ""}</td></tr>`;
    let rows = "";
    const regions = [...new Set(waveRows.filter((w) => w.role === "wave").map((w) => w.region))];
    for (const r of regions) {
      const pair = waveRows.filter((w) => w.role === "wave" && w.region === r);
      const miss = pair.filter((w) => w.lookedUp && !w.exists).length;
      rows += head(`🌊 ${r}`, miss ? `${miss} of 2 missing` : "") + pair.map(rowHtml).join("");
    }
    const excl = waveRows.filter((w) => w.role === "exclusion");
    if (excl.length) rows += head("⛔ Exclusion groups", "who stays off the new policies") + excl.map(rowHtml).join("");
    const nSel = selWaves.size;
    return `${rolloutCard()}<div class="list-card" style="margin-top:0">
      <p class="mini muted" style="margin:0 0 10px">The rollout's groups, from the ⚙️ naming rules: per region a <b>device</b> wave for the <code>- D -</code> policies and a <b>user</b> wave for the <code>- U -</code> ones, plus one device and one user <b>exclusion</b> group to exclude from the new policies. A missing one can be created here as an <b>assigned (static) security group</b> — empty, not mail-enabled, not role-assignable — the same payload T22 creates, <b>owned by you</b>: Graph does not make an admin the owner of a security group they create, so you are named owner in the create and the owners are read back. Membership is yours to fill (Entra, or 🔄 T22). Each group is looked up again by name right before it is created, so a group made meanwhile is never made twice.</p>
      <p class="mini" style="margin:0 0 10px;color:var(--report)">⚠ Intune does not exclude a user group from a policy assigned to device groups, or the reverse — it does not evaluate user-to-device relationships (Microsoft Learn, assignment support matrix). So the ⚔️ pane excludes the wave of the old policy's kind: a device-targeted old policy gets the region's device wave, even when the new policy included the user wave.</p>
      <div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30px"><col style="width:27%"><col style="width:12%"><col style="width:17%"><col style="width:20%"><col></colgroup><thead><tr><th></th><th>Group</th><th>Status</th><th>For · kind</th><th title="New policies of this group's kind (or whose name does not say) that include it — or, for an exclusion group, exclude it">New policies</th><th>Old to exclude it</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="tb-actions" style="margin-top:12px">
        <label class="chk" style="margin:0"><input type="checkbox" id="mvWaveOk"${nSel ? "" : " disabled"}> Create ${plural(nSel, "group")} in this tenant</label>
        <button class="btn primary" id="mvWaveCreate" disabled>🌊 Create the selected groups</button>
      </div>
      <p class="mini muted" style="margin:8px 0 0">Asks for Group.ReadWrite.All at this click (T22's scope). Owner: you, the signed-in admin. Description: “${esc(cfg.waveDescription)}” (waves) · “${esc(cfg.exclusionDescription)}” (exclusion groups).</p>
      ${waveRows.some((w) => w.legacy && !w.exists) ? `<div class="mr-rename">
        <p class="mini" style="margin:0 0 8px"><b>✏️ Groups under an earlier name.</b> The waves are named <code>${esc(cfg.waveDevicePrefix)}&lt;region&gt;</code> and <code>${esc(cfg.waveUserPrefix)}&lt;region&gt;</code> now, the exclusion groups <code>${esc(cfg.exclusionDevice || "—")}</code> and <code>${esc(cfg.exclusionUser || "—")}</code>; the ticked ones above are renamed in the tenant — display name and mail nickname. The object id stays, so every policy assignment and every nesting stays exactly as it is; Intune shows the new name. Undo from 📜 renames them back.</p>
        <div class="tb-actions">
          <label class="chk" style="margin:0"><input type="checkbox" id="mvRenameOk"${selRename.size ? "" : " disabled"}> Rename ${plural(selRename.size, "group")} in this tenant</label>
          <button class="btn primary" id="mvRenameGo" disabled>✏️ Rename to the new names</button>
          <a href="#" data-mrrenameall="1" class="mini">tick all ${waveRows.filter((w) => w.legacy && !w.exists).length}</a>
        </div></div>` : ""}
      <div id="mvWaveLedger"></div>
    </div>`;
  }

  // ---------------------------------------------------- pane: changes --
  function changesPane() {
    if (!runs.length) return `<div class="list-card" style="margin-top:0"><p class="mini muted" style="margin:0">Nothing written in this session yet. Every apply lands here with its backup, and can be undone from here — the undo is itself a plan, cut against the tenant as it is at that moment.</p></div>`;
    return runs.slice().reverse().map((r, i) => {
      const idx = runs.length - 1 - i;
      return `<div class="list-card" style="margin-top:${i ? 12 : 0}px">
        <h4 style="margin:0 0 4px">${esc(r.title)} <span class="mini muted">${esc(new Date(r.at).toLocaleTimeString())}</span></h4>
        <p class="mini" style="margin:0 0 6px">${r.ok} written &amp; verified · ${r.bad} not clean${r.stopped ? " · stopped early" : ""}${r.kind === "groups" || r.kind === "members" || r.kind === "rename" ? "" : ` · ${plural(r.backup.policies.length, "policy", "policies")} in the backup`}</p>
        <ul class="mini" style="margin:0 0 8px;padding-left:18px">${r.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        ${r.kind === "rename" ? (r.done && r.done.length ? `<div class="tb-actions"><button class="btn" data-mrrenback="${idx}">↶ Rename back</button></div>` : "") : r.kind === "groups" ? "" : r.kind === "members" ? (r.done && r.done.some((d) => d.type !== "create") ? `<div class="tb-actions"><button class="btn" data-mrundo="${idx}">↶ Undo this run — plan it</button></div>` : "") : `<div class="tb-actions"><button class="btn" data-mrrunbk="${idx}">⭳ Backup file</button><button class="btn" data-mrundo="${idx}">↶ Undo this run — plan it</button></div>`}
      </div>`;
    }).join("");
  }

  // ------------------------------------------------------ pane: rules --
  function rulesPane() {
    const carried = cfgCarried ? `<p class="mini" style="margin:0 0 10px"><b>Carried over.</b> These rules came from the rules the original T28 screen saved for this tenant in this browser (it was removed in build 10661). Check them before the next rollout step.</p>` : "";
    const ta = (id, list) => `<textarea id="${id}" rows="${Math.max(3, list.length + 1)}" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12.5px">${esc(list.join("\n"))}</textarea>`;
    const count = (g) => model.policies.filter((P) => P.generation === g).length;
    return `<div class="list-card" style="margin-top:0">${carried}
      <p class="mini muted" style="margin:0 0 12px">A policy's generation is read from its NAME. One prefix per line; case, spaces and dash kinds do not matter, and a prefix ends on a boundary (<code>WIN-SEC</code> does not claim <code>WIN-SECURITY</code>). Order of the verdict: out of scope first, then <code>(TO-BE-REMOVED)</code> (old, retiring), then new, then old. Kept for this tenant in this browser.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
        <label class="wi-f"><span>🎯 New set — name starts with</span>${ta("mvRuleNew", cfg.newPrefixes)}</label>
        <label class="wi-f"><span>🚫 Out of scope — name starts with</span>${ta("mvRuleOut", cfg.outPrefixes)}</label>
        <label class="wi-f"><span>🌊 Wave regions — one per line</span>${ta("mvRuleWaves", cfg.waveRegions)}</label>
      </div>
      <p class="mini muted" style="margin:14px 0 6px"><b>👥 Wave members.</b> Countries per region, one region per line: <code>Euro: *NL-Breda, GB, BE, NL</code> — a <b>*</b> marks a pilot, which leads its wave. A suffix is the end of the country user group's name; two letters map to ISO3 for the device group, anything else needs a line under the suffixes.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
        <label class="wi-f"><span>Country user groups start with</span><input id="mvRuleCtyPre" value="${esc(mcfg().countryPrefix)}"></label>
        <label class="wi-f"><span>Device groups start with</span><input id="mvRuleDgrpPre" value="${esc(mcfg().deviceGroupPrefix)}"></label>
      </div>
      <p class="mini muted" style="margin:12px 0 6px"><b>How a device finds its country.</b> ① the Intune primary user, then — when that person is in no country group, or there is none — ② the last logged-on user Intune reports, ③ the person with the most interactive logons in Defender (both within the days below, only people in a country group, AVD names skipped), ④ the Entra owner, ⑤ the code the name starts with. A device whose primary user is in a country stays there; when someone of another country logs on to it, 👥 says "check the primary user".</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center">
        <label class="chk" style="margin:0"><input type="checkbox" id="mvRuleIntLog"${mcfg().useIntuneLogons ? " checked" : ""}> ② Intune last logged-on user</label>
        <label class="chk" style="margin:0"><input type="checkbox" id="mvRuleDefLog"${mcfg().useDefenderLogons ? " checked" : ""}> ③ Defender logons <span class="muted">(ThreatHunting.Read.All)</span></label>
        <label class="chk" style="margin:0"><input type="checkbox" id="mvRuleUsersDev"${mcfg().useUsersDevices ? " checked" : ""}> a user's other devices too <span class="muted">(Entra owner / registered user, active; logons) — in each user's country</span></label>
        <label class="wi-f" style="margin:0;display:flex;gap:6px;align-items:center"><span>within</span><input id="mvRuleLogDays" type="number" min="1" max="30" value="${mcfg().logonDays}" style="width:70px"><span>days</span></label>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-top:10px">
        <label class="wi-f"><span>🌍 Countries per region</span><textarea id="mvRuleMap" rows="${Math.max(4, mcfg().countryMap.length + 1)}" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12.5px">${esc(MdeMembers.formatMap(mcfg().countryMap, mcfg().pilots))}</textarea></label>
        <label class="wi-f"><span>Device-group suffix per non-ISO2 suffix</span><textarea id="mvRuleSfx" rows="${Math.max(4, Object.keys(mcfg().deviceSuffixes).length + 1)}" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12.5px">${esc(MdeMembers.formatOverrides(mcfg().deviceSuffixes))}</textarea></label>
      </div>
      <label class="wi-f" style="margin-top:12px"><span>➕ Also in the target list — exact policy names, one per line. They are in scope although nothing in them is an MDE area, and an old policy that sets one of their settings is pulled in too.</span>${ta("mvRuleAlso", cfg.alsoInScope)}</label>
      <label class="wi-f" style="margin-top:12px"><span>➖ Leave out of the target list — exact policy names, one per line. They are out of scope (🚫) whatever their prefix or content: never compared, planned or pulled in by a shared setting. A name in both lists is left out.</span>${ta("mvRuleLeave", cfg.leaveOut)}</label>
      <label class="wi-f" style="margin-top:12px"><span>🧪 Pilot groups — exact group names, one per line. With the 🧪 tick on (⚔️ and ⚡), they come off a new policy's includes and an old policy's exclusions once every wave is in the one and out of the other. In the policies' bar, 🧪 Pilots puts them on a ticked policy or takes them off it, like the waves: a - D - policy takes the device names, a - U - one the user names, by tier (Pilot, Pre-Pilot).</span>${ta("mvRulePilots", cfg.pilotGroups)}</label>
      <p class="mini muted" style="margin:12px 0 6px">Each region is a PAIR: the device wave (prefix + region) for the <code>- D -</code> policies and the user wave for the <code>- U -</code> ones. Now: ${cfg.groups.filter((g) => g.role === "wave").map((g) => `<code>${esc(g.name)}</code>`).join(" ")}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
        <label class="wi-f"><span>🖥 Device wave prefix</span><input id="mvRuleDgPre" value="${esc(cfg.waveDevicePrefix)}"></label>
        <label class="wi-f"><span>👤 User wave prefix</span><input id="mvRuleUgPre" value="${esc(cfg.waveUserPrefix)}"></label>
        <label class="wi-f"><span>⛔🖥 Device exclusion group</span><input id="mvRuleExD" value="${esc(cfg.exclusionDevice)}"></label>
        <label class="wi-f"><span>⛔👤 User exclusion group</span><input id="mvRuleExU" value="${esc(cfg.exclusionUser)}"></label>
      </div>
      <label class="wi-f" style="margin-top:12px"><span>Description for a wave group this tool creates</span><input id="mvRuleDesc" value="${esc(cfg.waveDescription)}"></label>
      <label class="wi-f" style="margin-top:12px"><span>Description for an exclusion group this tool creates</span><input id="mvRuleExDesc" value="${esc(cfg.exclusionDescription)}"></label>
      <div class="tb-actions" style="margin-top:12px">
        <button class="btn primary" id="mvRuleSave">Save and re-sort</button>
        <button class="btn" id="mvRuleReset">Back to the defaults</button>
      </div>
      <p class="mini muted" id="mvRuleMsg" style="margin:8px 0 0">${esc(ruleSaved)}Now: ${count("new")} new · ${count("old")} old · ${count("retiring")} TO-BE-REMOVED · ${count("out")} out of scope.</p>
    </div>`;
  }

  function howPane() {
    return `<div class="list-card" style="margin-top:0"><div class="mini" style="line-height:1.55">
      <p style="margin:0 0 8px"><b>The read.</b> The shared policy read (settings catalog, legacy endpoint security intents, device configurations, administrative templates) — the same one T05, T11, T19 and T26 use — plus the legacy templates' names, the wave groups by name, and each involved group's kind. In scope is what 🧭 T20 classifies as endpoint security, MDE or Edge, plus any policy setting an MDE-area setting (BitLocker, WHfB, App Control…), and custom OMA-URIs under those CSPs. Opening the tool reads nothing: it offers ↻ Read the tenant, and the sign-in read when TUNO already holds one.</p>
      <p style="margin:0 0 8px"><b>Collisions.</b> A new and an old policy collide when both set the same setting (the settingDefinitionId; ASR per rule — a one-rule WIN-SEC policy meets that rule inside an old all-rules policy, including the old "guid=mode" string form). <b>Different value</b> is a conflict Intune reports on the device and resolves by applying neither; <b>same value</b> is double management, harmless until one side changes. A legacy template or ADMX cannot be compared setting by setting and meets the new set by category (<b>other format</b>). Reach is 🔗 T12's verdict — <b>can</b> (shared group or tenant-wide), <b>may</b> (different groups, or a filter), plus <b>staged</b> (the new policy is not assigned yet) and <b>resolved</b> (every group the new policy includes is already excluded from the old one).</p>
      <p style="margin:0 0 8px"><b>The fix.</b> Exclude the new policy's include groups from the old policy. Where the old policy already includes that group, the include is removed instead (an exclusion on an include is a contradiction). Where the new policy is not assigned yet, the existing wave groups of its kind are proposed (a <code>- D -</code> policy's device waves, a <code>- U -</code> policy's user waves), marked planned. Where a wave would be excluded from an old policy of the OTHER kind — Intune's unsupported user ↔ device mix — the same region's twin is proposed instead, and excluding the twin counts as resolved.</p>
      <p style="margin:0 0 8px"><b>Wave members</b> (👥 pane). The country user groups are nested in the user wave of their region, from the country table under ⚙️. One assigned device group per country (<code>INT-SG-D-&lt;ISO3&gt;</code>) holds the Windows devices whose Intune primary user is in that country group; it is nested in the device wave. Every read shows what the device group is missing and what no longer belongs. A device with no primary user takes its Entra owner's country, else the ISO3 its name starts with. A primary user in no country group of the table (10659) — often a DELETED user, whose UPN Entra renamed to <code>&lt;object id&gt;&lt;old UPN&gt;</code> — is looked up: a deleted one by the old UPN (the live account), a live one by id. The device then takes the live account's country group when it is in one, else the ISO3 its name starts with (BGD…, IDN…, PHL…), else the user's usage location; what none of those places is listed under 🕳 with the reason.</p>
      <p style="margin:0 0 8px"><b>Left out</b> (👥 → 🕳). The Windows devices the waves do not reach — the count — and, listed but not counted, a country's users with no Windows device by Intune primary user: they are in the user wave through their country group (the list says so, or that the group is not nested yet), the card says which other devices Intune has for them, and a Windows device they get later joins the country device group at the next 👥 read → Apply. <b>🔎 Find their logons in Defender</b> asks Defender advanced hunting (<code>DeviceLogonEvents</code>, 30 days, one query per 200 users; matched by on-premises SID or account name) which devices they logged on to, and says what each is: in Intune under another primary user (it follows that person's country), in Entra but not Intune (no wave reaches it), or Defender only (no Entra object). Read-only; it needs <code>ThreatHunting.Read.All</code> and Security Reader, and ⧉ Copy the KQL gives the same query for the Defender portal. The devices counted: a country's devices with no Entra object or in the device exclusion group, and — for the whole tenant — the Windows devices whose primary user is in no country group of the table, or who have none. A country row's "N users have none" opens it on that country; the CSV has everyone.</p>
      <p style="margin:0 0 8px"><b>Pilot members</b> (👥 → 🧪). One row per person in the pilot groups (⚙️): a pilot user, or the Intune primary user of a pilot device, with every Windows device of theirs and the country and wave they belong to. <b>Ready for the wave</b>: tick a person whose country is known and the plan takes them and their devices out of every pilot group and puts each device in its country device group (created first when missing; a device leaves its pilot group only once its add read back clean; a ⊘ excluded device is taken out of the pilot but never added). Until the country is nested in its wave they are ordinary members of it — the old policies reach them again — and then they move with everybody else. <b>⚠ Before their waves go live</b> lists the policies that cover a pilot group but not the wave: fix those before nesting the country. Members with no person to follow (no primary user, not in Intune, a nested group) are listed and never planned.</p>
      <p style="margin:0 0 8px"><b>Exclusions</b> (⊘ pane, on the rail). Search a user or a device: a user comes with their Windows devices (Intune primary user), a device with its primary user, and each with what reaches it — the in-scope policies whose groups include it and do not exclude it (an exclusion wins over an include of the same kind; assignment filters are not evaluated). Users go into the user exclusion group (the <code>- U -</code> policies), devices into the device one (the <code>- D -</code> policies). Because ⚡③ takes the waves out of the old policies, an excluded wave device would get neither set, so it is also taken out of its country device group: it leaves the wave, the old policies reach it again, and 👥 keeps it out. A user cannot leave a dynamic country group; the card says what that leaves. <b>Excluded now</b> lists both groups and flags a user whose recent device is not excluded (half).</p>
      <p style="margin:0 0 8px"><b>🔄 Country groups</b> (10679). The waves nest <b>static</b> groups only: per country a user group <code>INT-SG-U-&lt;ISO3&gt;</code> beside the device group <code>INT-SG-D-&lt;ISO3&gt;</code>, the code being the device group's own (the ⚙️ table). Both static groups are <b>created, filled and nested in 👥 Wave members</b>, side by side (10680) — 🔄 creates nothing. <b>⇄ Swap</b>, per wave, for a country an earlier build nested through its dynamic <code>PVM-UG-CORP-MEM-USERS-*</code> group: tops the static user group up, nests it, reads back that every user of the dynamic group is in it, and only then takes the dynamic group out of the wave — no policy moves. <b>Sync</b> keeps both pairs from the sources (users: transitive members; devices: 👥's primary-user rule): adds ticked, leavers never ticked, and whoever is in the Revert groups held back — a re-include takes a tick per row and a confirm line naming the count and the wave. A member of Revert that no source holds any more is offered for the Revert clean-up. The head shows the drift (read now) and the last sync (this browser), in the warning colour after 14 days.</p>
      <p style="margin:0 0 8px"><b>↩ Revert</b> (10679). A user, a device or the pair (the default) leaves its wave: into <code>INT-SG-U-MDE-Revert</code> / <code>INT-SG-D-MDE-Revert</code> first, then — only once that read back — out of its static country group, with a reason kept with the run. The dry run shows per policy which new ones drop off and which old ones take over, and warns on neither (a gap) or both (a conflict). A user still reached through a dynamic group is refused until their wave is swapped. The Revert groups are assigned to nothing: they are the held-back list, in the tenant. <b>Reverted now</b> puts members back (into their country group, then out of Revert). An excluded member (⊘) stays in the wave and skips the new policies; a reverted one is out of the wave.</p>
      <p style="margin:0 0 8px"><b>Also in the target list.</b> Policies named under ⚙️ are in scope although nothing in them is an MDE area — the OIB Device Security and Windows Update for Business policies. An old settings-catalog policy that sets one of their settings is pulled in, so its conflict shows. <b>Left out</b> works the other way: a name there is out of scope (🚫, marked ➖) whatever its prefix or content, and nothing pulls it back in.</p>
      <p style="margin:0 0 8px"><b>The rollout actions</b> (🌊 pane) are the same writes in bulk: ① every existing wave into each new policy of its kind, ② the exclusion group of the kind each new policy is assigned to, ③ the fixes above restricted to waves. Each is one plan — fresh read, backup, confirm, read-back, undo — and lists what it left out and why. In 🎯 and 🗄, the bar's <b>🌊 Waves</b> target does ① or ③ for the ticked policies only: each gets the waves of its kind, in the ticked regions.</p>
      <p style="margin:0 0 8px"><b>🧪 Pilots</b> (the tick in ⚔️ and ⚡, the names under ⚙️). When a plan completes the swap — every wave of the kind in the new policy and out of the old one — the pilot groups come off both: the new policy's pilot includes and the old policy's pilot exclusions, in the same plan. A pilot member in a wave keeps the new policy through the wave; one outside a wave is back on the old policy until their wave has them. A side that cannot go yet stays, with the reason: a new policy keeps a pilot while an old policy it collides with still excludes it (else neither), and an old policy keeps a pilot exclusion while a new policy it collides with still includes it (else both). <b>🧪 Pilots in the policies' bar</b> (10675): with a policy ticked, the bar's 🧪 Pilots target puts the pilot groups on it or takes them off, like the waves — a - D - policy takes the device names, a - U - one the user names, by tier (the ticks in the bar: Pilot, Pre-Pilot); the dry run shows what each group counts and what is left out, and nothing else on the policy is touched.</p>
      <p style="margin:0 0 8px"><b>What is refused.</b> Intune does not support excluding user groups from a policy assigned to device groups, or the reverse — "Intune doesn't evaluate user-to-device group relationships" (<a href="https://learn.microsoft.com/intune/device-configuration/assign-device-profile#exclude-groups-from-a-policy-assignment" target="_blank" rel="noopener">Microsoft Learn: Assign policies — support matrix</a>). Such a step is shown with its reason and never written. Devices managed by <b>MDE security settings management</b> (not enrolled in Intune) take assignments by device group only, and assignment filters do not apply to them (<a href="https://learn.microsoft.com/defender-endpoint/endpoint-security-policies-configure" target="_blank" rel="noopener">Learn</a>) — flagged as 🛰.</p>
      <p style="margin:0 0 8px"><b>The write.</b> ✏️ T11's engine: a dry run reads every touched policy fresh; ③ the backup file is taken before ④ Apply unlocks; each policy is re-read at apply time and skipped as drifted if somebody changed it meanwhile; every write is read back. Each run lands in 📜 Changes this session with its backup and an undo. Settings are never changed by these plans — only assignments.</p>
      <p style="margin:0 0 8px"><b>🎛 Adjust settings</b> (on the rail). One row per ASR rule and new-set policy carrying it, with its mode now and 🦠 T15's MDE baseline beside it. Change a mode (or <b>Set shown to baseline</b>), ② Dry run: each policy is read fresh and a rule whose mode moved since the read is left out as drifted. ③ the backup (the policies and all their settings, as read), confirm, ④ Apply: each policy is re-read, skipped if it changed since the dry run, written as a whole with only the chosen modes changed (the settings catalog takes a policy's settings only as a whole-policy PUT), and read back. Only the new set's settings-catalog policies, only a rule the policy already carries — a rule no new policy carries is listed, never created. Old and out-of-scope policies (AVD among them) are never edited here. Warn is not offered for the two rules that do not support it (LSASS, Office code injection). The run and its undo land in 📜.</p>
      <p style="margin:0 0 8px"><b>🧩 Edge extensions</b> (on the rail, 10678). The new set's settings-catalog policy that carries Edge's <b>Installed silently</b> list (the force list: on every user the policy reaches, not removable by them, and it wins over the block list) or its <b>Exempt from the block list</b> list (users may install those themselves). Each row is named by the Edge Add-ons store from its ID, through a lookup route set on the pane — the store sends no CORS headers, so a page here cannot call it: a self-hosted instance forwards a path, or a relay URL is set (its host must also be in the page's connect-src). Without a route the pane runs in paste mode: an ID, an Edge store link or a Chrome Web Store link (which gets the Chrome update URL behind the ID) is always accepted, with the name as typed or as the list gave it, marked unverified. The two Edge Copilot components OIB ships in the force list are 🔒 built-in and kept; an ID the store answers 404 to is ⚠ a finding, never a guess. 📋 the approved list (TSV / CSV with a header, or one name per line; kept per tenant in this browser) is matched to the store by name — a unique hit names a row, several hits ask for a pick, none asks for the ID — and added in one go as exempt or silent, rows moved one by one. ② Dry run reads the policy fresh, lists every change with what the reached users get, the likely impact and the way back; ③ the backup (the policy and all its settings), confirm, ④ Apply: re-read and skipped as drifted when it changed, written as a whole with only the two collections changed, read back; the run and its undo in 📜. Taking a live silent install away is a recorded risk: Edge uninstalls it from every reached user.</p>
      <p style="margin:0"><b>Temporary.</b> Built for one rollout, beta only, never promoted — listed under Help's "Staying on this channel".</p>
    </div></div>`;
  }

  // ------------------------------------------------------------ render --
  function render() {
    if (!model) return;
    $("mvRun").disabled = running || !!reps.busy || mem.loading;
    const missing = model.missing.length ? `<div class="list-card" style="margin-top:0;margin-bottom:12px"><p class="mini" style="margin:0;color:var(--report)">⚠ Not in this read: ${model.missing.map((m) => `${esc(m.id)} (${esc(m.error)})`).join("; ")} — policies there are not listed or compared.</p></div>` : "";
    const src = PolicyCache.get() === res ? `From ${PolicyCache.fromSignIn() ? "the sign-in read" : "the shared read"} at ${esc(PolicyCache.timeLabel())}. ` : "";
    const head = `<p class="mini muted" style="margin:0 0 10px">${src}${model.newP.length} new · ${model.oldP.length} old · ${model.outP.length} out of scope. An assignment is a target, not proof a device applied the setting.</p>`;
    let main;
    if (pane === "overview") main = v2Overview();
    else if (pane === "recovery") main = v2Recovery();
    else if (pane === "new") main = policyPane(model.newP, "new");
    else if (pane === "old") main = policyPane(model.oldP, "old");
    else if (pane === "out") main = policyPane(model.outP, "out");
    else if (pane === "retire") main = retirePane();
    else if (pane === "waves") main = wavesPane();
    else if (pane === "members") main = membersPane();
    else if (pane === "exclusions") main = exclusionsPane();
    else if (pane === "countrysync") main = countrySyncPane();
    else if (pane === "revert") main = revertPane();
    else if (pane === "reports") main = reportsPane();
    else if (pane === "changes") main = changesPane();
    else if (pane === "rules") main = rulesPane();
    else if (pane === "how") main = howPane();
    else if (pane === "asr") main = asrPane();
    else if (pane === "edgeext") main = extPane();
    else main = conflictsPane();
    // The plan panel is ONE node, kept across renders and re-seated under the
    // pane — a pane switch or a filter keystroke must not throw a half-made
    // plan (or a running ledger) away, and it belongs in the main column,
    // not under the rail.
    const pl = planEl();
    if (pl) pl.remove();
    $("mvGlobalExport").hidden = pane === "reports";
    $("mvBody").innerHTML = `<div class="ep-wrap"><div class="ep-rail mr-navigation">${railHtml()}</div><div class="ep-main">${missing}${pane === "reports" ? "" : head}${main}<div id="mvPlanSeat"></div></div></div>`;
    if (pl) seatPlan(pl);
    syncSelbar();
  }

  // ------------------------------------------------------------ selbar --
  const barMode = () => (pane === "conflicts" ? "fixes" : (pane === "new" || pane === "old") ? "policies" : null);
  function syncSelbar() {
    const bar = $("mvSelbar");
    if (!bar) return;
    const mode = barMode();
    const n = mode === "fixes" ? selPairs.size : mode === "policies" ? [...sel].filter((k) => model && model.byKey.has(k)).length : 0;
    bar.classList.toggle("visible", !!model && !!mode && n > 0);
    $("mvSelCount").textContent = mode === "fixes" ? `${plural(n, "fix", "fixes")} selected` : `${plural(n, "policy", "policies")} selected`;
    $("mvBarPolicies").style.display = mode === "policies" ? "contents" : "none";
    $("mvBarFixes").style.display = mode === "fixes" ? "" : "none";
    const act = barAction(), tgt = barTarget();
    // 10645: the fixes take no typed group. The box is the policy actions'
    // (it keeps what was typed there), and in the fixes it used to REPLACE
    // every proposal and drop the "+ include" half: Mihai's LAPS dry run
    // excluded INT-SG-D-WAVE-BAMSCA only, ahead of the new policy.
    $("mvGroup").style.display = mode === "policies" && tgt === "group" ? "" : "none";
    const wv = $("mvBarWaves");
    if (wv) { wv.style.display = mode === "policies" && tgt === "waves" ? "" : "none"; wv.textContent = `each policy's kind · ${rollRegions ? [...rollRegions].join(", ") || "no region" : "every region"}`; }
    // 🧪 (10653, Mihai: "add include should only add include, or there
    // should be an option to also remove the others"; option A off the
    // mockup): the waves go in alone unless this is ticked
    const pl = $("mvBarPilotsL");
    if (pl) pl.style.display = mode === "policies" && tgt === "waves" && act !== "remove" && (cfg.pilotGroups || []).length ? "" : "none";
    // 🧪 Pilots as the target (10675): one tick per tier, all on by default
    const pt = $("mvBarPilotTiers");
    if (pt) { const on = mode === "policies" && tgt === "pilots"; pt.style.display = on ? "" : "none"; if (on) pt.innerHTML = pilotTierChips(); }
    $("mvGroup").placeholder = "Group name or object ID…";
    if (mode === "fixes") $("mvBarFixes").textContent = fixSummary();
    const filterable = mode === "policies" && act !== "remove";
    $("mvFilterSel").style.display = filterable ? "" : "none";
    $("mvFilterMode").style.display = filterable && $("mvFilterSel").value ? "" : "none";
    $("mvDryRun").textContent = mode === "fixes" ? "② Dry run the fixes" : "② Dry run";
    if (filterable && filterList === null) loadFilters();
  }
  const barAction = () => { const b = document.querySelector("#mvActSeg [data-mract].active"); return b ? b.dataset.mract : "add-include"; };
  const barTarget = () => { const b = document.querySelector("#mvTargetSeg [data-mrtarget].active"); return b ? b.dataset.mrtarget : "group"; };
  async function loadFilters() {
    filterList = [];
    try {
      filterList = await Filters.list();
      AssignEdit.setFilterNames(filterList);
      $("mvFilterSel").innerHTML = `<option value="">No filter</option>` + filterList.slice()
        .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)))
        .map((f) => `<option value="${esc(f.id)}">${esc(f.displayName)} (${esc(Filters.platformLabel(f.platform))})</option>`).join("");
    } catch { /* the bar keeps "No filter" */ }
  }
  function setSeg(segId, attr, val) {
    [...$(segId).querySelectorAll(`[${attr}]`)].forEach((b) => b.classList.toggle("active", b.getAttribute(attr) === val));
  }

  // ---------------------------------------------------------- dry run --
  // A plan belongs to the pane it was made on (10647, Mihai: "fix the
  // layout when going to help, the plan below shouldn't be there"): on
  // another pane it is hidden, not dropped — it is back on return.
  let planPane = null;
  function clearPlan() {
    v2Binding = null; v2MemberBackup = null; v2Risk = null; plan = null; backupTaken = false; planPane = pane; if (planEl()) planEl().innerHTML = ""; }
  function planError(msg) { planEl().innerHTML = `<div class="list-card" style="margin-top:12px;padding:16px 18px"><div class="gu-fail"><b>${esc(msg)}</b></div></div>`; }
  // Seat the plan node under the card that made it (planAnchor) when that
  // card is on screen, else under the pane. Called by render() and by the
  // launchers before their first progress line, so "reading…" shows there.
  function seatPlan(node) {
    const pl = node || planEl();
    if (!pl) return;
    pl.style.display = planPane && planPane !== pane ? "none" : "";
    const a = planAnchor ? document.getElementById(planAnchor) : null;
    if (a && $("mvBody").contains(a)) a.after(pl);
    else if ($("mvPlanSeat")) $("mvPlanSeat").appendChild(pl);
  }
  // Scroll the plan's heading into view below the sticky header AND the
  // pane's own sticky toolbar (👥's region chips), which would cover it.
  const showPlan = () => {
    const pl = planEl();
    if (!pl || !pl.scrollIntoView) return;
    let nav = 106;
    try { nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sticky-nav")) || 106; } catch { /* the default */ }
    const tb = $("mvBody") ? $("mvBody").querySelector(".toolbar") : null;
    const extra = tb && tb.getBoundingClientRect ? tb.getBoundingClientRect().height : 0;
    pl.style.scrollMarginTop = `${Math.round(nav + extra + 12)}px`;
    pl.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  async function dryRun() {
    if (busy || !model) return;
    busy = true; planAnchor = null; clearPlan(); seatPlan();
    try {
      const mode = barMode();
      if (mode === "fixes") await dryRunFixes();
      else if (mode === "policies") await dryRunPolicies();
    } catch (e) { planError(GroupUse.shortErr(e, 300)); }
    finally { busy = false; }
  }

  async function dryRunPolicies() {
    const pols = [...sel].map((k) => model.byKey.get(k)).filter((P) => P && P.surface);
    if (!pols.length) throw new Error("Tick at least one policy.");
    const action = barAction(), tgt = barTarget();
    if (tgt === "waves") return dryRunPolicyWaves(pols, action);
    if (tgt === "pilots") return dryRunPolicyPilots(pols, action);
    let group, members = null, gk = null;
    if (tgt === "group") {
      await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
      const g = await GroupUse.resolveGroup($("mvGroup").value);
      group = { id: g.id, displayName: g.displayName, membershipRule: g.membershipRule };
      names.set(lc(g.id), g.displayName);
      members = await GroupUse.memberCount(g.id);
      kinds = await M.readKinds([g.id], null, kinds);
      gk = kinds.get(lc(g.id));
    } else {
      if (action === "add-exclude") throw new Error("Graph has no tenant-wide exclusion — an exclusion names a group.");
      group = { id: "", displayName: tgt === "allDevices" ? "All devices" : "All users", tenantWide: tgt };
    }
    const filter = action !== "remove" && $("mvFilterSel").value ? { id: $("mvFilterSel").value, mode: $("mvFilterMode").value } : null;
    const fresh = await M.readFresh(pols, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
    const steps = [], unread = [];
    for (const P of pols) {
      const f = fresh.get(`${P.surface}|${lc(P.id)}`);
      if (!f) { unread.push(P.name); continue; }
      const notes = [];
      if (action === "add-exclude" && gk) {
        const s = M.exclusionSupport(gk.kind, M.effectiveTargets(P, kinds).kinds);
        if (s.ok === false) notes.push(`✖ ${s.why}`);
        else if (s.ok === null) notes.push(`⚠ ${s.why}`);
      }
      // a "- D -" policy given a user group (or the reverse) — allowed, but
      // not the wave it was named for (10633)
      const tkind = tgt === "allDevices" ? "device" : tgt === "allUsers" ? "user" : gk && (gk.kind === "user" || gk.kind === "device") ? gk.kind : null;
      if (action === "add-include" && P.audience && tkind && tkind !== P.audience) notes.push(`⚠ a ${P.audience} policy by its name (${M.AUD[P.audience].tag}) given a ${tkind} ${tgt === "group" ? "group" : "target"} — the ${P.audience} wave is the one meant for it`);
      if (P.mdeManaged && (tgt === "allUsers" || (gk && gk.kind === "user"))) notes.push("🛰 MDE security settings management honours device groups only");
      if (P.mdeManaged && filter) notes.push("🛰 assignment filters do not apply to MDE-managed devices");
      steps.push({ policy: f, action, group, filter, note: notes.join(" · ") });
    }
    const p = M.composePlan(steps);
    const word = { "add-include": "Include", "add-exclude": "Exclude", remove: "Remove" }[action];
    plan = Object.assign(p, {
      title: `${word} ${group.displayName}${filter ? " (with a filter)" : ""} — ${plural(pols.length, "policy", "policies")}`,
      head: { tool: "TUNO T28 MDE rollout", action, group: { id: group.id, name: group.displayName } },
      memberLine: group.tenantWide ? `<b>the whole tenant</b> — every ${group.tenantWide === "allDevices" ? "managed device" : "licensed user"}, now and later`
        : members == null ? "member count unknown" : `${members} direct member${members === 1 ? "" : "s"}${gk ? ` · ${gk.kind} group` : ""}${group.membershipRule ? " · dynamic" : ""}`,
      unread, skipped: [],
    });
    renderPlan();
  }

  // 🌊 Waves as the bar's target (10645, Mihai: "the option to add or
  // exclude the waves beside a single group"): each ticked policy gets the
  // waves of ITS kind — a - D - policy the device waves, a - U - one the user
  // waves — in the regions ticked in 🌊. Including them in a new policy, or
  // taking them out of an old one, can complete the swap: the 🧪 pilots then
  // come off both sides, as in ⚡① and ⚡③.
  async function dryRunPolicyWaves(pols, action) {
    await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
    const filter = action !== "remove" && $("mvFilterSel").value ? { id: $("mvFilterSel").value, mode: $("mvFilterMode").value } : null;
    const inRegion = (r) => !rollRegions || rollRegions.has(r);
    const wants = [], skipped = [], used = new Set();
    for (const P of pols) {
      const k = M.policyKind(P, kinds);
      if (!k.kind) { skipped.push(`${P.name}: its name says neither "- D -" nor "- U -" and its targets do not say either (${k.source}) — use a single group`); continue; }
      for (const g of model.cfg.groups.filter((x) => x.role === "wave" && x.audience === k.kind && inRegion(x.region))) {
        const hit = found && found.get(lc(g.name));
        if (!hit || !hit.id) { skipped.push(`${g.name} does not exist — create it in 🌊 first`); continue; }
        const id = lc(hit.id);
        if (action === "add-include" && P.reach.inc.has(id)) continue;
        if (action === "add-exclude" && P.reach.exc.has(id)) continue;
        if (action === "remove" && !P.reach.inc.has(id) && !P.reach.exc.has(id)) continue;
        const notes = [];
        if (action === "add-exclude") {
          const s = M.exclusionSupport(k.kind, M.effectiveTargets(P, kinds).kinds);
          if (s.ok === false) { skipped.push(`${P.name} ⊘ ${g.name}: ${s.why}`); continue; }
          if (s.ok === null) notes.push(`⚠ ${s.why}`);
          if (P.reach.inc.has(id)) { skipped.push(`${P.name} ⊘ ${g.name}: it INCLUDES the wave — an exclusion on top would be a contradiction; use Remove`); continue; }
        }
        if (P.mdeManaged && filter) notes.push("🛰 assignment filters do not apply to MDE-managed devices");
        if (k.source === "targets") notes.push(`${k.kind} policy by its targets`);
        wants.push({ P, groupId: id, groupName: hit.displayName || g.name, action, filter, note: notes.join(" · ") });
        used.add(hit.displayName || g.name);
      }
    }
    // 🧪 the pilot groups come off only when the bar's tick says so (10653):
    // Add include only adds. The ⚔️ / ⚡ tick (cfg.pilotGroupsOff) is theirs.
    let pilots = { steps: [], kept: [] };
    const pilotsOn = !!($("mvBarPilots") && $("mvBarPilots").checked);
    if (action !== "remove" && (model.cfg.pilotGroups || []).length) {
      pilots = M.pilotsFor(wants.concat(pols.map((P) => ({ P, groupId: "", action: "none" }))), Object.assign(rolloutCtx(), { cfg: Object.assign({}, model.cfg, { pilotGroupsOff: true }) }), true);
      if (pilotsOn) for (const st of pilots.steps) if (!wants.some((x) => x.P === st.P && x.groupId === st.groupId && x.action === "remove")) wants.push({ P: st.P, groupId: st.groupId, groupName: st.groupName, action: "remove", filter: null, note: st.note, pilot: true });
    }
    const stay = !pilotsOn && pilots.steps.length
      ? [`🧪 ${plural(pilots.steps.length, "pilot assignment")} stay${pilots.steps.length === 1 ? "s" : ""} on (${[...new Set(pilots.steps.map((x) => x.groupName))].join(", ")}): this plan only ${action === "add-include" ? "adds the waves" : "excludes the waves"}. Tick “🧪 also take the pilot groups off” in the bar to take ${pilots.steps.length === 1 ? "it" : "them"} off as well.`]
      : [];
    const uniqSkip = [...new Set(skipped)].concat(pilotsOn ? pilots.kept.map((k) => `🧪 ${k.why}`) : []).concat(stay);
    if (!wants.length) { plan = null; planError(`Nothing to do: the waves are already ${action === "add-include" ? "in" : action === "add-exclude" ? "excluded from" : "off"} these policies${uniqSkip.length ? ". Left out: " + uniqSkip.join(" · ") : ""}.`); return; }
    const targets = [...new Map(wants.map((x) => [x.P.key, x.P])).values()];
    const fresh = await M.readFresh(targets, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
    const steps = [], unread = [];
    for (const x of wants) {
      const f = fresh.get(`${x.P.surface}|${lc(x.P.id)}`);
      if (!f) { if (!unread.includes(x.P.name)) unread.push(x.P.name); continue; }
      steps.push({ policy: f, action: x.action, group: { id: x.groupId, displayName: x.groupName }, filter: x.filter || null, note: x.note });
    }
    const p = M.composePlan(steps);
    const word = { "add-include": "Include", "add-exclude": "Exclude", remove: "Remove" }[action];
    const regions = rollRegions ? [...rollRegions] : null;
    plan = Object.assign(p, {
      title: `${word} the waves${regions ? ` (${regions.join(", ")})` : ""} — ${plural(pols.length, "policy", "policies")}${pilotsOn && pilots.steps.length ? `, ${plural(pilots.steps.length, "pilot assignment")} off` : ""}`,
      head: { tool: "TUNO T28 MDE rollout", action: `${action}-waves`, regions: regions || "all", groups: [...used] },
      memberLine: `${plural(used.size, "wave group")}: ${[...used].map(esc).join(", ")}`,
      unread, skipped: uniqSkip, skippedTitle: "Left out, with the reason:",
    });
    renderPlan();
  }

  // 🧪 Pilots as the bar's target (10675, Mihai: "add or remove the pilot
  // users just as with the waves — selecting a policy and the option
  // should be there … it is about the pilot groups"): the pilot groups
  // under ⚙️, by tier (M.pilotTiers — INT-SG-D-Win-Pilot + INT-SG-U-Win-Pilot
  // are one tier), each ticked policy taking the half of ITS kind, as the
  // waves do. Looked up by exact name at the dry run (the names live in the
  // config, never the ids), their kinds read from the tenant with the name
  // as the fallback. Add include adds, Add exclude excludes, Remove takes
  // whichever assignment is there; nothing else on the policy is touched,
  // and the ⚔️ / ⚡ pilots-off logic stays theirs.
  function pilotTierChips() {
    const tiers = M.pilotTiers(cfg.pilotGroups || []);
    if (!tiers.length) return `<span style="color:var(--report)">no pilot groups under ⚙️ — add their exact names first</span>`;
    const half = (g) => g.audience === "device" ? "D" : g.audience === "user" ? "U" : "?";
    return `<span class="muted">each policy's kind ·</span> ` + tiers.map((t) => `<label class="chk" style="margin:0 6px 0 0;display:inline-flex;align-items:center;gap:4px" title="${esc(t.groups.map((g) => `${g.name} (${g.audience})`).join(" · "))}"><input type="checkbox" data-mrtier="${esc(t.key)}"${pilotTiersOff.has(t.key) ? "" : " checked"}> 🧪 ${esc(t.label)} <span class="muted">(${t.groups.map(half).join(" · ")})</span></label>`).join("");
  }
  async function dryRunPolicyPilots(pols, action) {
    const tiers = M.pilotTiers(model.cfg.pilotGroups || []);
    if (!tiers.length) throw new Error("No pilot groups under ⚙️ — add their exact names (one per line) first.");
    const on = tiers.filter((t) => !pilotTiersOff.has(t.key));
    if (!on.length) throw new Error("Tick at least one pilot tier in the bar.");
    await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
    const filter = action !== "remove" && $("mvFilterSel").value ? { id: $("mvFilterSel").value, mode: $("mvFilterMode").value } : null;
    const wantNames = on.flatMap((t) => t.groups.map((g) => g.name));
    planEl().innerHTML = `<p class="mini muted">Looking up the pilot groups…</p>`;
    const f = await M.findGroups(wantNames, null);
    const ids = [...f.found.values()].filter((g) => g && g.id).map((g) => lc(g.id));
    try { kinds = await M.readKinds(ids, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; }, kinds); } catch { /* the names decide */ }
    const wants = [], skipped = [], used = new Map();
    for (const d of f.dupes) skipped.push(`${d.name}: ${d.count} groups share that name — rename one in the portal first`);
    for (const P of pols) {
      const k = M.policyKind(P, kinds);
      if (!k.kind) { skipped.push(`${P.name}: its name says neither "- D -" nor "- U -" and its targets do not say either (${k.source}) — use a single group`); continue; }
      for (const t of on) for (const g of t.groups) {
        const hit = f.found.get(lc(g.name));
        if (hit === undefined) { skipped.push(`${g.name}: the lookup failed — try again`); continue; }
        if (!hit || !hit.id) { skipped.push(`${g.name} does not exist in this tenant — check the name under ⚙️`); continue; }
        const id = lc(hit.id), gk = kinds.get(id);
        const kind = gk && (gk.kind === "user" || gk.kind === "device") ? gk.kind : g.audience;
        if (kind === "unknown") { skipped.push(`${g.name}: neither a device nor a user group by its name or its members — it is offered to no policy`); continue; }
        if (kind !== k.kind) continue;   // the other half of the tier is for the other kind of policy
        const name = hit.displayName || g.name;
        if (action === "add-include" && P.reach.inc.has(id)) { skipped.push(`${P.name}: already includes ${name}`); continue; }
        if (action === "add-exclude" && P.reach.exc.has(id)) { skipped.push(`${P.name}: already excludes ${name}`); continue; }
        if (action === "remove" && !P.reach.inc.has(id) && !P.reach.exc.has(id)) { skipped.push(`${P.name}: ${name} is not on it`); continue; }
        const notes = [];
        if (action === "add-exclude") {
          const s = M.exclusionSupport(kind, M.effectiveTargets(P, kinds).kinds);
          if (s.ok === false) { skipped.push(`${P.name} ⊘ ${name}: ${s.why}`); continue; }
          if (s.ok === null) notes.push(`⚠ ${s.why}`);
          if (P.reach.inc.has(id)) { skipped.push(`${P.name} ⊘ ${name}: it INCLUDES the pilot group — an exclusion on top would be a contradiction; use Remove`); continue; }
        }
        if (P.mdeManaged && filter) notes.push("🛰 assignment filters do not apply to MDE-managed devices");
        if (k.source === "targets") notes.push(`${k.kind} policy by its targets`);
        if (gk && gk.kind !== kind) notes.push(`${name} read as ${gk.kind} (${gk.source}) — its name says ${g.audience}`);
        wants.push({ P, groupId: id, groupName: name, action, filter, note: notes.join(" · ") });
        used.set(id, { name, kind, gk });
      }
    }
    const uniqSkip = [...new Set(skipped)];
    if (!wants.length) { plan = null; planError(`Nothing to do: the pilot groups are already ${action === "add-include" ? "in" : action === "add-exclude" ? "excluded from" : "off"} these policies${uniqSkip.length ? ". Left out: " + uniqSkip.join(" · ") : ""}.`); return; }
    const targets = [...new Map(wants.map((x) => [x.P.key, x.P])).values()];
    const fresh = await M.readFresh(targets, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
    const steps = [], unread = [];
    for (const x of wants) {
      const fr = fresh.get(`${x.P.surface}|${lc(x.P.id)}`);
      if (!fr) { if (!unread.includes(x.P.name)) unread.push(x.P.name); continue; }
      steps.push({ policy: fr, action: x.action, group: { id: x.groupId, displayName: x.groupName }, filter: x.filter || null, note: x.note });
    }
    const p = M.composePlan(steps);
    const word = { "add-include": "Include", "add-exclude": "Exclude", remove: "Remove" }[action];
    const labels = on.map((t) => t.label);
    const count = (u) => u.gk && (u.gk.users != null || u.gk.devices != null)
      ? ` · ${u.kind === "user" ? plural(u.gk.users || 0, "user") : plural(u.gk.devices || 0, "device")}` : "";
    plan = Object.assign(p, {
      title: `${word} the pilot groups (${labels.join(", ")})${filter ? " (with a filter)" : ""} — ${plural(pols.length, "policy", "policies")}`,
      head: { tool: "TUNO T28 MDE rollout", action: `${action}-pilots`, tiers: labels, groups: [...used.values()].map((u) => u.name) },
      memberLine: `${plural(used.size, "pilot group")}: ${[...used.values()].map((u) => `${esc(u.name)}${esc(count(u))}`).join(", ")} — ${action === "remove" ? "their assignments on these policies come off; putting them back is this bar with Add include" : action === "add-include" ? "their members get these policies at their next check-in; taking them off again is this bar with Remove" : "their members are kept out of these policies; lifting that is this bar with Remove"}`,
      unread, skipped: uniqSkip, skippedTitle: "Left out, with the reason:",
    });
    renderPlan();
  }

  // The fixes' writes, one entry per (policy, group, action): two new
  // policies that ask for the same exclusion on the same old policy ask
  // once. In waves mode the pilots come off where the plan completes the
  // swap (10645) — worked out over the whole selection, not pair by pair.
  function fixWants(chosen) {
    const want = new Map(), skipped = [];
    for (const pr of chosen) {
      const O = pr.O, N = pr.N;
      if (!O.surface) { skipped.push(`${O.name}: not a surface the engine writes`); continue; }
      const incs = pr.proposal.includes || [];
      if (incs.length && !N.surface) { skipped.push(`${N.name}: not a surface the engine writes — its waves are not included, so they are not excluded from ${O.name} either`); continue; }
      for (const s of pr.proposal.steps) {
        if (s.supported === false) { skipped.push(`${O.name} ⊘ ${s.groupName}: ${s.why}`); continue; }
        const k = `${O.key}|${s.groupId}|${s.action}`;
        if (!want.has(k)) want.set(k, { O, groupId: s.groupId, groupName: s.groupName, action: s.action, note: [s.supported === null ? `⚠ ${s.why}` : "", ...s.notes].filter(Boolean).join(" · ") });
      }
      // 🌊 waves mode: the wave into the new policy in the same plan (10643)
      for (const x of incs) {
        const k = `${N.key}|${x.groupId}|add-include`;
        if (!want.has(k)) want.set(k, { O: N, groupId: x.groupId, groupName: x.groupName, action: "add-include", note: `the wave into the new policy — it leaves ${O.name} in the same plan` });
      }
    }
    let pilots = { steps: [], kept: [] };
    if (cfg.fixWith === "waves" && model.cfg.pilotGroupsOff !== false) {
      const touch = chosen.flatMap((pr) => [{ P: pr.N, groupId: "", action: "none" }, { P: pr.O, groupId: "", action: "none" }]);
      pilots = M.pilotsFor([...want.values()].map((x) => ({ P: x.O, groupId: x.groupId, action: x.action })).concat(touch),
        { cfg: model.cfg, kinds, twins: M.twinIndex(model.cfg, found), names, found, pairs }, false);
      for (const st of pilots.steps) {
        const k = `${st.P.key}|${st.groupId}|remove`;
        if (!want.has(k)) want.set(k, { O: st.P, groupId: st.groupId, groupName: st.groupName, action: "remove", note: st.note, pilot: true });
      }
    }
    return { want, skipped, pilots };
  }
  // what the bar's dry run will do, said in the bar (10645)
  function fixSummary() {
    if (!model) return "";
    const chosen = pairs.filter((pr) => selPairs.has(pr.id));
    if (!chosen.length) return "";
    const xs = [...fixWants(chosen).want.values()];
    const outs = xs.filter((x) => !x.pilot && x.action !== "add-include"), ins = xs.filter((x) => x.action === "add-include"), pil = xs.filter((x) => x.pilot);
    const pols = (list) => new Set(list.map((x) => x.O.key)).size;
    const parts = [];
    if (outs.length) parts.push(`${plural(outs.length, "group")} out of ${plural(pols(outs), "old policy", "old policies")}`);
    if (ins.length) parts.push(`${plural(ins.length, "wave")} into ${plural(pols(ins), "new policy", "new policies")}`);
    if (pil.length) parts.push(`🧪 ${plural(pil.length, "pilot assignment")} off`);
    return parts.length ? `→ ${parts.join(" · ")}` : "→ nothing writable in this selection";
  }
  async function dryRunFixes() {
    const chosen = pairs.filter((pr) => selPairs.has(pr.id));
    if (!chosen.length) throw new Error("Tick at least one fix.");
    await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
    const { want, skipped, pilots } = fixWants(chosen);
    const olds = [...new Map([...want.values()].map((x) => [x.O.key, x.O])).values()];
    if (!olds.length) { plan = null; planError(`Nothing writable in this selection.${skipped.length ? " Skipped: " + skipped.join(" · ") : ""}`); return; }
    const fresh = await M.readFresh(olds, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
    const steps = [], unread = [];
    for (const x of want.values()) {
      const f = fresh.get(`${x.O.surface}|${lc(x.O.id)}`);
      if (!f) { if (!unread.includes(x.O.name)) unread.push(x.O.name); continue; }
      steps.push({ policy: f, action: x.action, group: { id: x.groupId, displayName: x.groupName }, filter: null, note: x.note });
    }
    const p = M.composePlan(steps);
    const kept = pilots.kept.map((k) => `🧪 ${k.why}`);
    plan = Object.assign(p, {
      title: `Fix ${plural(chosen.length, "collision")} — ${plural(olds.length, "policy", "policies")}${cfg.fixWith === "waves" ? ", with the waves" : ""}${pilots.steps.length ? `, ${plural(pilots.steps.length, "pilot assignment")} off` : ""}`,
      head: { tool: "TUNO T28 MDE rollout", action: "fix-collisions", pairs: chosen.map((pr) => ({ newPolicy: pr.N.name, oldPolicy: pr.O.name })) },
      memberLine: "", unread, skipped: skipped.concat(kept),
      skippedTitle: kept.length ? "Not in the plan, with the reason:" : undefined,
    });
    renderPlan();
  }

  const STEP_WORD = { "add-include": "include", "add-exclude": "exclude", remove: "remove", restore: "restore" };
  function renderPlan() {
    v2Bind();
    const p = plan;
    const stepHtml = (o) => o.details.map((d) => {
      const cls = d.change === "modify" ? (d.action === "remove" ? "au-op update" : "au-op create") : d.change === "refused" ? "au-op delete" : "au-op other";
      const word = d.change === "modify" ? STEP_WORD[d.action] : d.change === "refused" ? "refused" : "no change";
      return `<div>${chip(cls, `${word} ${d.group.displayName || ""}${d.filter ? " ⚑" : ""}`)}${d.reason ? ` <span class="mini muted">${esc(d.reason)}</span>` : ""}${d.note ? `<div class="mini" style="color:var(--report)">${esc(d.note)}</div>` : ""}</div>`;
    }).join("");
    const row = (o) => `<tr><td><b>${esc(o.policy.name)}</b></td><td class="mini">${esc(o.policy.surfaceLabel)}</td><td>${stepHtml(o)}</td><td class="mini" style="white-space:nowrap">${o.before.length} → ${o.after.length}</td></tr>`;
    const removal = p.hasRemoval;
    planEl().innerHTML = `<div class="list-card" style="margin-top:14px;padding:16px 18px">
      <h4 style="margin:0 0 6px">② Plan — ${esc(p.title)}</h4>
      <p class="mini" style="margin:0 0 8px"><b>${plural(p.changes.length, "policy", "policies")}</b> will change${p.memberLine ? ` · ${p.memberLine}` : ""}. ${p.noops.length ? `${p.noops.length} already as asked.` : ""} ${p.refused.length ? `<b>${p.refused.length} refused</b> — see the reasons.` : ""}</p>
      ${p.skipped.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>${esc(p.skippedTitle || "Not in the plan — Intune does not support these exclusions:")}</b><span class="why">${p.skipped.map(esc).join("<br>")}</span></div>` : ""}
      ${p.unread.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>Could not read the current assignments of:</b><span class="why">${p.unread.map(esc).join(", ")} — left out rather than written blind.</span></div>` : ""}
      <div style="overflow-x:auto"><table class="cg-table"><thead><tr><th>Policy</th><th>Surface</th><th>Steps</th><th>Assignments</th></tr></thead><tbody>
        ${p.changes.map(row).join("")}${p.refused.map(row).join("")}${p.noops.map(row).join("")}
      </tbody></table></div>
      <p class="mini muted" style="margin:8px 0 0">The assign call replaces a policy's whole list — everything untouched is re-sent exactly as read, filters included. Each policy is re-read at apply time; one that changed since this dry run is skipped as drifted, not overwritten.</p>
      ${p.changes.length ? `<div style="margin-top:12px">
        <div class="tb-actions"><button class="btn" id="mvBackup">③ ⭳ Take the backup <span class="mini">— the current assignments, as a file</span></button></div>
        ${removal ? `<label class="wi-f" style="margin-top:8px"><span>This plan REMOVES assignments — type <b>REMOVE</b> to allow it</span><input id="mvConfirmText" placeholder="REMOVE" autocomplete="off" spellcheck="false"></label>`
          : `<label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="mvConfirmTick"> I have read the plan — ${plural(p.changes.length, "policy", "policies")}</label>`}
        <label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin:8px 0 0 14px"><input type="checkbox" id="mvStop" checked> Stop at the first failure</label>
        <div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="mvApply" disabled>④ Apply — write to the tenant</button><button class="btn" id="mvDiscard">Discard the plan</button></div>
        <p id="mvGate" class="mini muted" style="margin:8px 0 0">Take the backup, confirm, apply. Apply stays locked until both.</p>
      </div>` : `<div class="tb-actions" style="margin-top:10px"><button class="btn" id="mvDiscard">Close</button></div>`}
      <div id="mvLedger"></div>
    </div>`;
    const upd = () => { const b = $("mvApply"); if (b) b.disabled = !gateOk(); };
    if ($("mvConfirmText")) $("mvConfirmText").addEventListener("input", upd);
    if ($("mvConfirmTick")) $("mvConfirmTick").addEventListener("change", upd);
    if ($("mvBackup")) $("mvBackup").addEventListener("click", () => {
      download(`t28-assignments-before-${stamp()}.json`, AssignEdit.backupOf(plan.changes, plan.head));
      backupTaken = true; $("mvGate").textContent = "Backup taken. Confirm, then apply."; upd();
    });
    if ($("mvApply")) $("mvApply").addEventListener("click", apply);
    $("mvDiscard").addEventListener("click", clearPlan);
    v2AttachGate();
    showPlan();
  }
  function gateOk() {
    if (!plan || !backupTaken || !v2Gate()) return false;
    const t = $("mvConfirmText"), k = $("mvConfirmTick");
    if (t) return t.value.trim() === "REMOVE";
    return !!(k && k.checked);
  }

  // ------------------------------------------------------------- apply --
  async function apply() {
    if (busy || !gateOk()) return;
    busy = true;
    const p = plan;
    try {
      await Graph.ensureScopes(AssignEdit.WRITE());
      if (plan !== p || !gateOk()) throw new Error("Plan context changed. Create a new plan.");
      $("mvApply").disabled = true;
      const L = RunLedger.create($("mvLedger"), {
        unit: "policies", title: p.title,
        items: p.changes.map((o) => ({ label: o.policy.name, sub: o.details.filter((d) => d.change === "modify").map((d) => `${STEP_WORD[d.action]} ${d.group.displayName || ""}`).join(" · ") })),
      });
      const r = await AssignEdit.applyPlan(p, { onStatus: () => {}, stopOnFail: $("mvStop").checked, ledger: L });
      L.finish();
      const ok = r.results.filter((x) => x.ok && x.verified);
      for (const x of ok) M.patchAssignments(model, x.op.policy.surface, x.op.policy.id, x.op.after, names, res.filters);
      runs.push({
        at: Date.now(), title: p.title, kind: p.undo ? "undo" : "assign",
        ok: ok.length, bad: r.results.length - ok.length, stopped: r.stopped,
        risk: v2Risk, backup: JSON.parse(AssignEdit.backupOf(p.changes, p.head)),
        lines: r.results.map((x) => `${x.op.policy.name}: ${x.ok && x.verified ? "written · verified" : x.drifted ? "drifted — not written" : x.skipped ? "skipped" : x.ok ? "written · NOT verified" : "failed — " + (x.error || "")}`),
      });
      // The shared read now describes the tenant BEFORE this write; the
      // model here was patched from the verified read-backs only.
      PolicyCache.invalidate();
      plan = null; backupTaken = false;
      derive();
      selPairs.clear();
      render();
      const note = document.createElement("p");
      note.className = "mini muted"; note.style.margin = "8px 0 0";
      note.textContent = `${ok.length} written & verified. The verdicts above moved with the verified writes; 🧭 Read the tenant for a full re-read. The run and its undo are in 📜 Changes this session.`;
      $("mvLedger").appendChild(note);
      const disc = $("mvDiscard"); if (disc) disc.textContent = "Close";
    } catch (e) {
      const el = document.createElement("div"); el.className = "gu-fail"; el.innerHTML = `<b>${esc(GroupUse.shortErr(e, 300))}</b>`;
      $("mvLedger").appendChild(el);
    } finally { busy = false; }
  }

  async function undoRun(idx) {
    const r = runs[idx];
    if (!r || busy) return;
    if (r.kind === "members") { memDryRun(r); return; }
    if (r.kind === "settings") { pane = "asr"; render(); asrDryRun(MdeAsr.reverse(r.done), `Undo: ${r.title}`); return; }
    if (r.kind === "edgeext") { pane = "edgeext"; render(); extDryRun(MdeEdgeExt.reverse(r.done), `Undo: ${r.title}`); return; }
    busy = true; planAnchor = null; clearPlan(); seatPlan();
    try {
      await Graph.ensureScopes(AssignEdit.READ());
      const pols = r.backup.policies.map((b) => ({ surface: b.surface, id: b.id, name: b.name }));
      const fresh = await M.readFresh(pols, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
      const p = M.undoPlan(r.backup.policies, fresh);
      plan = Object.assign(p, { title: `Undo: ${r.title}`, head: { tool: "TUNO T28 MDE rollout", action: "undo", of: r.title }, memberLine: "", unread: pols.filter((x) => !fresh.has(`${x.surface}|${lc(x.id)}`)).map((x) => x.name), skipped: [] });
      renderPlan();
    } catch (e) { planError(GroupUse.shortErr(e, 300)); }
    finally { busy = false; }
  }


  // ----------------------------------------------- 🎛 adjust settings --
  // (10657, option B off t28-adjust-settings-mockups.html) The engine is
  // MdeAsr; this is the pane, the plan and the write.
  const MODE_WORD = { off: "Off", audit: "Audit", warn: "Warn", block: "Block" };
  const modeWord = (m) => MODE_WORD[m] || (m ? String(m) : "—");
  function asrRows() {
    const rows = MdeAsr.matrix(model).map((r) => r.leftOut && !v2AllowLeftOut ? Object.assign({}, r, { editable: false, why: "Left out by naming rules; enable the explicit ASR exception to edit." }) : r);
    const f = asr.filter;
    return { all: rows, shown: rows.filter((r) => f === "all" ? true
      : f === "differs" ? (r.P && MdeAsr.verdict(asr.edits.get(r.key) || r.now, r.baseline) === "differs")
      : f === "edited" ? asr.edits.has(r.key)
      : f === "none" ? !r.P : true).filter((r) => !view.q || lc(r.name).includes(lc(view.q)) || (r.P && lc(r.P.name).includes(lc(view.q)))) };
  }
  function asrPane() {
    const { all, shown } = asrRows();
    const n = (f) => all.filter(f).length;
    const pend = MdeAsr.planOf(all, asr.edits);
    const nChanges = pend.reduce((a, o) => a + o.changes.length, 0);
    const base = typeof Defender !== "undefined" && Defender.MDE_BASELINE ? Defender.MDE_BASELINE : null;
    const vchip = (r, want) => {
      if (!r.P) return chip("gu-how exc", "not in the new set");
      if (want !== r.now) return chip("au-op update", `${modeWord(r.now)} → ${modeWord(want)}`);
      const v = MdeAsr.verdict(r.now, r.baseline);
      return v === "match" ? chip("au-op create", "matches") : v === "differs" ? chip("au-op delete", "≠ baseline") : chip("gu-how exc", "no baseline");
    };
    const body = shown.map((r) => {
      const want = asr.edits.get(r.key) || r.now;
      const cell = !r.P ? `<span class="mini muted">—</span>`
        : !r.editable ? `<span title="${esc(r.why)}">${esc(modeWord(r.now))} <span class="mini muted">🔒</span></span>`
        : `<select class="btn mr-asrsel" data-mrasr="${esc(r.key)}" aria-label="${esc(`Mode for ${r.name} in ${r.P.name}`)}">${MdeAsr.modesFor(r.slug).map((m) => `<option value="${m}"${m === want ? " selected" : ""}>${modeWord(m)}${m === r.now ? " (now)" : ""}</option>`).join("")}</select>`;
      return `<tr class="${want !== r.now ? "mr-asr-edited" : ""}">
        <td class="mr-asr-rule" data-label="Rule">${esc(r.name)}${MdeAsr.NO_WARN.has(r.slug) ? ` <span class="mini muted" title="Warn is not supported for this rule (Microsoft Learn, ASR rule modes)">no warn</span>` : ""}</td>
        <td class="mini mr-asr-pol" data-label="Policy">${r.P ? polLink(r.P) + (r.leftOut ? ` <span class="muted" title="Under ⚙️ Leave out: not compared or planned in the other panes — its settings are still edited here">➖</span>` : "") : `<span class="muted" title="${esc(r.why)}">no new policy</span>`}${r.P && !r.editable ? `<div class="mini muted">${esc(r.why)}</div>` : ""}</td>
        <td class="mr-asr-now" data-label="Now" style="white-space:nowrap">${esc(r.P ? modeWord(r.now) : "—")}</td>
        <td class="mr-asr-new" data-label="New" style="white-space:nowrap">${cell}</td>
        <td class="mr-asr-base" data-label="Baseline" style="white-space:nowrap">${esc(r.baseline ? modeWord(r.baseline) : "—")}</td>
        <td class="mr-asr-v" style="white-space:nowrap">${vchip(r, want)}</td></tr>`;
    }).join("");
    const canBase = shown.filter((r) => r.editable && r.baseline && r.baseline !== (asr.edits.get(r.key) || r.now) && MdeAsr.modesFor(r.slug).includes(r.baseline)).length;
    // (10658, Mihai: "I cannot see the field in mobile") — under 760px
    // each row is a card: rule, policy, then Now · New · Baseline in one
    // line, so the mode picker is never scrolled off the side.
    return `<div class="toolbar">
        ${fchip("data-mrasrf", "all", "ASR rules", all.length, asr.filter === "all")}
        ${fchip("data-mrasrf", "differs", "≠ Baseline", n((r) => r.P && MdeAsr.verdict(asr.edits.get(r.key) || r.now, r.baseline) === "differs"), asr.filter === "differs")}
        ${fchip("data-mrasrf", "edited", "✎ Changed here", asr.edits.size, asr.filter === "edited")}
        ${fchip("data-mrasrf", "none", "Not in the new set", n((r) => !r.P), asr.filter === "none")}
        ${searchBox()}
      </div>
      <div class="list-card" id="mvAsrCard" style="margin-top:0">
        <p class="mini muted" style="margin:0 0 8px">The ASR rule modes of the <b>new set</b> — one row per rule and policy carrying it. Baseline: ${base ? `<b>${esc(base.name)}</b> (${esc(base.source)}), the one 🦠 T15 checks` : "not loaded"}. Pick a mode, ② Dry run, then the usual gates. ➖ marks a policy under ⚙️ Leave out. V2 locks these rows unless you explicitly enable the ASR exception below. Old and out-of-scope policies (AVD among them) are never edited here — T15 counts every reaching policy, so an AVD-only policy still shows there as a conflict.</p>
        <label class="chk"><input id="mvLeftOutOpt" type="checkbox"${v2AllowLeftOut ? " checked" : ""}> Allow editing new-prefix ASR policies marked Leave out, for this session</label>
        <div class="tb-actions" style="margin:0 0 8px"><button class="btn" id="mvAsrBase"${canBase ? "" : " disabled"}>Set shown to baseline${canBase ? ` · ${canBase}` : ""}</button><button class="btn" id="mvAsrClear"${asr.edits.size ? "" : " disabled"}>Clear changes</button></div>
        ${shown.length ? `<div style="overflow-x:auto"><table class="cg-table mr-asr-table">
          <colgroup><col style="width:24%"><col><col style="width:70px"><col style="width:118px"><col style="width:80px"><col style="width:130px"></colgroup>
          <thead><tr><th>Rule</th><th>Policy (new set)</th><th>Now</th><th>New</th><th>Baseline</th><th></th></tr></thead>
          <tbody>${body}</tbody></table></div>` : `<p class="mini muted" style="margin:0">Nothing matches the filters.</p>`}
        ${nChanges ? `<div class="mr-asrbar" role="region" aria-label="Pending mode changes"><b>${plural(nChanges, "change")} in ${plural(pend.length, "policy", "policies")}</b><span class="mini">devices reached by ${pend.length === 1 ? "it" : "them"} take the new mode at their next sync</span><span style="margin-left:auto"></span><button class="btn" id="mvAsrDiscard">Discard</button><button class="btn primary" id="mvAsrDry">② Dry run →</button></div>` : ""}
      </div>`;
  }
  const asrPolUrl = (id) => `/deviceManagement/configurationPolicies/${encodeURIComponent(id)}`;
  async function asrReadOne(id) {
    const policy = await Graph.get(Graph.BETA + asrPolUrl(id), { scopes: Graph.SCOPES.config, retry: true });
    const settings = await Graph.readAll(`${asrPolUrl(id)}/settings?$expand=settingDefinitions&$top=1000`, { scopes: Graph.SCOPES.config, beta: true, retry: true });
    return { policy, settings };
  }
  // list: [{ id, key, name, changes: [{ slug, name, from, to }] }]
  async function asrDryRun(list, title) {
    if (busy || !model) return;
    busy = true; planAnchor = "mvAsrCard"; clearPlan(); seatPlan();
    try {
      await Graph.ensureScopes(Graph.SCOPES.config);
      const items = [], unread = [], drifted = [];
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        planEl().innerHTML = `<p class="mini muted" style="margin-top:12px">Reading ${esc(o.name)} fresh… (${i + 1} of ${list.length})</p>`;
        let fr;
        try { fr = await asrReadOne(o.id); } catch (e) { unread.push(`${o.name} — ${GroupUse.shortErr(e, 120)}`); continue; }
        const keep = [];
        for (const c of o.changes) {
          const cur = MdeAsr.modeIn(fr.settings, c.slug);
          if (cur === c.to) continue;                 // already as asked
          if (cur !== c.from) { drifted.push(`${o.name} · ${c.name}: ${modeWord(cur)} in the tenant, ${modeWord(c.from)} when read`); continue; }
          keep.push(c);
        }
        if (keep.length) items.push({ id: o.id, key: o.key, name: o.name, changes: keep, policy: fr.policy, settings: fr.settings, lastMod: fr.policy && fr.policy.lastModifiedDateTime });
      }
      plan = { kind: "asr", title: title || `Adjust ${plural(items.reduce((a, x) => a + x.changes.length, 0), "ASR rule mode")}`, items, unread, drifted, undo: /^Undo:/.test(title || "") };
      renderAsrPlan();
    } catch (e) { planError(GroupUse.shortErr(e, 300)); }
    finally { busy = false; }
  }
  function asrDryRunEdits() {
    const pend = MdeAsr.planOf(MdeAsr.matrix(model), asr.edits);
    if (!pend.length) return;
    asrDryRun(pend.map((o) => ({ id: o.P.id, key: o.P.key, name: o.P.name, changes: o.changes })));
  }
  function renderAsrPlan() {
    v2Bind();
    const p = plan;
    const n = p.items.reduce((a, x) => a + x.changes.length, 0);
    const rows = p.items.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${x.changes.map((c) => `<div>${esc(c.name)}: ${chip("au-op update", `${modeWord(c.from)} → ${modeWord(c.to)}`)}</div>`).join("")}</td><td class="mini">${(x.settings || []).length}</td></tr>`).join("");
    planEl().innerHTML = `<div class="list-card" style="margin-top:14px;padding:16px 18px">
      <h4 style="margin:0 0 6px">② Plan — ${esc(p.title)}</h4>
      <p class="mini" style="margin:0 0 8px"><b>${plural(n, "mode change")}</b> in <b>${plural(p.items.length, "policy", "policies")}</b>.</p>
      ${p.drifted.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>Left out — the tenant moved since the read:</b><span class="why">${p.drifted.map(esc).join("<br>")}</span></div>` : ""}
      ${p.unread.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>Could not read fresh:</b><span class="why">${p.unread.map(esc).join("<br>")} — left out rather than written blind.</span></div>` : ""}
      ${p.items.length ? `<div style="overflow-x:auto"><table class="cg-table"><thead><tr><th>Policy</th><th>Mode changes</th><th>Settings re-sent</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="mini muted" style="margin:8px 0 0">The settings catalog takes a policy's settings only as a whole: each policy is written with every setting re-sent exactly as read, the modes above changed. Each is re-read at apply time and skipped as drifted if it changed since this dry run, then read back.</p>
      <div style="margin-top:12px">
        <div class="tb-actions"><button class="btn" id="mvBackup">③ ⭳ Take the backup <span class="mini">— the policies and all their settings, as a file</span></button></div>
        <label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="mvConfirmTick"> I have read the plan — ${plural(p.items.length, "policy", "policies")}</label>
        <label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin:8px 0 0 14px"><input type="checkbox" id="mvStop" checked> Stop at the first failure</label>
        <div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="mvApply" disabled>④ Apply — write to the tenant</button><button class="btn" id="mvDiscard">Discard the plan</button></div>
        <p id="mvGate" class="mini muted" style="margin:8px 0 0">Take the backup, confirm, apply. Apply stays locked until both.</p>
      </div>` : `<p class="mini muted" style="margin:0">Nothing to write — every change is already in the tenant or left out above.</p><div class="tb-actions" style="margin-top:10px"><button class="btn" id="mvDiscard">Close</button></div>`}
      <div id="mvLedger"></div>
    </div>`;
    const upd = () => { const b = $("mvApply"); if (b) b.disabled = !gateOk(); };
    if ($("mvConfirmTick")) $("mvConfirmTick").addEventListener("change", upd);
    if ($("mvBackup")) $("mvBackup").addEventListener("click", () => {
      download(`t28-settings-before-${stamp()}.json`, asrBackup(p));
      backupTaken = true; $("mvGate").textContent = "Backup taken. Confirm, then apply."; upd();
    });
    if ($("mvApply")) $("mvApply").addEventListener("click", asrApply);
    $("mvDiscard").addEventListener("click", clearPlan);
    v2AttachGate();
    showPlan();
  }
  const asrBackup = (p) => JSON.stringify({ tool: "TUNO T28 MDE rollout", action: "adjust ASR rule modes", title: p.title, at: new Date().toISOString(),
    tenant: tenantName(), policies: p.items.map((x) => ({ id: x.id, name: x.name, policy: x.policy, settings: x.settings })) }, null, 2);
  async function asrApply() {
    if (busy || !gateOk() || !plan || plan.kind !== "asr") return;
    busy = true;
    const p = plan;
    try {
      await Graph.ensureScopes(AssignEdit.WRITE());
      if (plan !== p || !gateOk()) throw new Error("Plan context changed. Create a new plan.");
      $("mvApply").disabled = true;
      const L = RunLedger.create($("mvLedger"), { unit: "policies", title: p.title,
        items: p.items.map((x) => ({ label: x.name, sub: x.changes.map((c) => `${c.name}: ${modeWord(c.from)} → ${modeWord(c.to)}`).join(" · ") })) });
      const stopOnFail = $("mvStop") && $("mvStop").checked;
      const done = [], lines = [];
      let okN = 0, halt = false;
      for (let i = 0; i < p.items.length; i++) {
        const x = p.items[i];
        if (L.stopped || halt) { L.skip(i, L.stopped ? "stopped" : "stopped at the first failure"); lines.push(`${x.name}: skipped`); continue; }
        L.start(i);
        try {
          const fr = await asrReadOne(x.id);
          const moved = (fr.policy && fr.policy.lastModifiedDateTime) !== x.lastMod || x.changes.some((c) => MdeAsr.modeIn(fr.settings, c.slug) !== c.from);
          if (moved) { L.skip(i, "changed in the tenant since the dry run — not written", "drifted"); lines.push(`${x.name}: drifted — not written`); continue; }
          const w = MdeAsr.withModes(fr.settings, x.changes);
          if (w.missing.length) { L.fail(i, `rule not found: ${w.missing.join(", ")}`, "not written"); lines.push(`${x.name}: not written — rule not found`); halt = stopOnFail; continue; }
          await Graph.put(Graph.BETA + asrPolUrl(x.id), MdeAsr.putBody(fr.policy, w.settings), { scopes: AssignEdit.WRITE() });
          const back = await Graph.readAll(`${asrPolUrl(x.id)}/settings?$expand=settingDefinitions&$top=1000`, { scopes: Graph.SCOPES.config, beta: true, retry: true });
          const P = model.byKey.get(x.key);
          if (P && P.raw) P.raw.__detail = back;
          const summary = x.changes.map((c) => `${c.name} ${modeWord(c.from)} → ${modeWord(c.to)}`).join("; ");
          if (MdeAsr.verified(back, x.changes)) {
            L.done(i, "", "written · verified"); okN++;
            done.push({ id: x.id, key: x.key, name: x.name, changes: x.changes });
            lines.push(`${x.name}: ${summary} — written · verified`);
          } else { L.fail(i, "the read-back does not show the new mode", "written · NOT verified"); lines.push(`${x.name}: ${summary} — written · NOT verified`); halt = stopOnFail; }
        } catch (e) { const why = GroupUse.shortErr(e, 200); L.fail(i, why); lines.push(`${x.name}: failed — ${why}`); halt = stopOnFail; }
      }
      L.finish();
      runs.push({ at: Date.now(), title: p.title, kind: "settings", ok: okN, bad: p.items.length - okN, stopped: L.stopped,
        risk: v2Risk, backup: JSON.parse(asrBackup(p)), done, lines });
      PolicyCache.invalidate();
      for (const d of done) for (const c of d.changes) asr.edits.delete(`${d.key}|${c.slug}`);
      plan = null; backupTaken = false;
      derive();
      render();
      const note = document.createElement("p");
      note.className = "mini muted"; note.style.margin = "8px 0 0";
      note.textContent = `${okN} written & verified. The rows above read the verified settings; devices take the new modes at their next sync. The run and its undo are in 📜 Changes this session.`;
      $("mvLedger").appendChild(note);
      const disc = $("mvDiscard"); if (disc) disc.textContent = "Close";
    } catch (e) {
      const el = document.createElement("div"); el.className = "gu-fail"; el.innerHTML = `<b>${esc(GroupUse.shortErr(e, 300))}</b>`;
      $("mvLedger").appendChild(el);
    } finally { busy = false; }
  }
  function asrSetBaseline() {
    const { shown } = asrRows();
    for (const r of shown) {
      if (!r.editable || !r.baseline || !MdeAsr.modesFor(r.slug).includes(r.baseline)) continue;
      if (r.baseline === r.now) asr.edits.delete(r.key); else asr.edits.set(r.key, r.baseline);
    }
    clearPlan(); render();
  }
  function openAsr() { pane = "asr"; view.cat = null; view.state = null; view.q = ""; render(); }

  // ----------------------------------------------- 🧩 edge extensions --
  // (10678, option A off the mockup round — its own rail node, nothing in
  // the header: "only show them on left rail") The engine is MdeEdgeExt,
  // the store is TunoAddons; this is the pane, the plan and the write.
  //
  // The policy: the new set's settings-catalog policy carrying the Edge
  // force list or allow list (one at PVM: Win - OIB - SC - Microsoft Edge
  // - U - Extensions - v3.1.2; a select appears when there are more). Its
  // two lists are rows; a row's name is the store's answer for its ID,
  // 🔒 built-in for the two Copilot components, ⚠ not in the store for
  // an ID the store answers 404 to. The approved list (TSV / CSV, kept per
  // tenant in this browser) is matched to the store by name, by the ID a
  // column or the operator gives when the name search does not decide it;
  // "if the store cannot be called, the option to self insert the right id
  // should be there" — an ID or a store link is always accepted, with the
  // name unverified until a route answers.
  const ext = { policyKey: null, list: null, edits: new Map(), filter: "all", q: "", hits: null, searching: false, note: "", err: "",
    names: new Map(), looking: "", routeMsg: "", bulk: "allow" };
  const EXTL = MdeEdgeExt.LISTS;
  const extListKey = () => `tuno.t28.edgeext.list.${tenantKey()}`;
  const extNamesKey = () => `tuno.t28.edgeext.names.${tenantKey()}`;
  function extLoadStored() {
    try {
      const raw = window.localStorage.getItem(extListKey());
      ext.list = raw ? JSON.parse(raw) : null;
      if (ext.list && !ext.list.ids) ext.list.ids = {};
    } catch { ext.list = null; }
    try {
      const raw = window.localStorage.getItem(extNamesKey());
      const given = raw ? JSON.parse(raw) : {};
      for (const id of Object.keys(given || {})) if (!ext.names.has(id)) ext.names.set(id, { status: "unverified", name: String(given[id]), source: "operator" });
    } catch { /* nothing kept */ }
  }
  function extSaveList() {
    try { if (ext.list) window.localStorage.setItem(extListKey(), JSON.stringify(ext.list)); else window.localStorage.removeItem(extListKey()); return true; } catch { return false; }
  }
  function extSaveName(id, name) {
    ext.names.set(lc(id), { status: "unverified", name, source: "operator" });
    try {
      const raw = window.localStorage.getItem(extNamesKey());
      const given = raw ? JSON.parse(raw) : {};
      given[lc(id)] = name;
      window.localStorage.setItem(extNamesKey(), JSON.stringify(given));
    } catch { /* this browser would not keep it */ }
  }
  function extPolicies() {
    if (!model) return [];
    return model.policies.filter((P) => P.sectionId === "settingsCatalog" && MdeAsr.inNewSet(P, model.cfg) && P.raw && MdeEdgeExt.isEdgeExtPolicy(P.raw.__detail || []));
  }
  function extPolicy() {
    const list = extPolicies();
    if (!list.length) return null;
    const hit = ext.policyKey ? list.find((P) => P.key === ext.policyKey) : null;
    return hit || list[0];
  }
  const extNow = (P) => MdeEdgeExt.listsIn(P && P.raw ? P.raw.__detail || [] : []);
  const extModified = (P) => (P.raw && P.raw.lastModifiedDateTime) || (P.item && P.item.lastModifiedDateTime) || "";
  // What is known about an ID: the store's answer, 🔒 built-in, an
  // operator's or the list's name (unverified), or nothing but the ID.
  function extNameOf(id) {
    const k = lc(id);
    if (MdeEdgeExt.isBuiltIn(k)) return { status: "builtin", name: MdeEdgeExt.BUILT_IN[k] };
    const n = ext.names.get(k);
    if (n) return n;
    const c = typeof TunoAddons !== "undefined" ? TunoAddons._cached(`id:${k}`) : null;
    if (c) { ext.names.set(k, Object.assign({ source: "store" }, c)); return ext.names.get(k); }
    return { status: "unknown", name: "" };
  }
  const extIdsOf = (now) => [...new Set([].concat(now.force, now.allow).map((e) => e.id).filter(MdeEdgeExt.isId))];
  // Ask the store for every ID it has not answered yet — only with a route.
  // Sequential, cached a day by TunoAddons; the pane shows the running line.
  async function extLookup(ids, force) {
    if (!TunoAddons.hasRoute()) return;
    const todo = ids.filter((id) => { const n = extNameOf(id); return force ? n.status !== "builtin" : (n.status === "unknown" || n.status === "unverified" || n.status === "error"); });
    if (!todo.length) return;
    for (let i = 0; i < todo.length; i++) {
      ext.looking = `Looking up ${i + 1} of ${todo.length} in the store…`;
      const el = $("mvExtLooking"); if (el) el.textContent = ext.looking;
      try {
        const a = await TunoAddons.detail(todo[i]);
        // a 404 keeps the name the operator or the list gave — the store
        // knows nothing about it, the operator may
        const prev = ext.names.get(todo[i]);
        ext.names.set(todo[i], Object.assign({ source: "store" }, a, a.status === "404" && prev && prev.name ? { name: prev.name, source: prev.source } : {}));
      } catch (e) { const prev = ext.names.get(todo[i]); ext.names.set(todo[i], { status: "error", name: prev && prev.name ? prev.name : "", source: prev ? prev.source : "", err: GroupUse.shortErr(e, 160) }); }
    }
    ext.looking = "";
    if (pane === "edgeext") render();
  }
  // The approved list's Edge rows against the store: a row with an ID
  // column keeps it; else the name is searched and MdeEdgeExt.matchHits
  // decides; several hits are kept for the operator to pick from.
  async function extResolve(force) {
    if (!ext.list || !TunoAddons.hasRoute()) return;
    const rows = ext.list.parsed.rows.filter((r) => r.edge);
    const todo = rows.filter((r) => force || !(ext.list.ids[r.key] && ext.list.ids[r.key].id) && !(ext.list.ids[r.key] && ext.list.ids[r.key].hits));
    if (!todo.length) return;
    for (let i = 0; i < todo.length; i++) {
      const r = todo[i];
      ext.looking = `Searching the store for ${i + 1} of ${todo.length}: ${r.name}…`;
      const el = $("mvExtLooking"); if (el) el.textContent = ext.looking;
      if (r.id) { ext.list.ids[r.key] = { id: r.id, how: "column" }; continue; }
      try {
        const hits = await TunoAddons.search(r.name);
        const m = MdeEdgeExt.matchHits(r.name, hits);
        ext.list.ids[r.key] = m ? { id: m.id, how: "store", name: m.name } : { id: "", how: "none", hits: hits.slice(0, 6).map((h) => ({ id: h.id, name: h.name, developer: h.developer })) };
        if (m) ext.names.set(m.id, { status: "ok", source: "store", name: m.name, developer: m.developer, rating: m.rating, ratings: m.ratings });
      } catch (e) { ext.list.ids[r.key] = { id: "", how: "error", err: GroupUse.shortErr(e, 160) }; }
    }
    ext.looking = "";
    extSaveList();
    const ids = Object.values(ext.list.ids).map((x) => x.id).filter(MdeEdgeExt.isId);
    if (pane === "edgeext") render();
    await extLookup(ids, false);
  }
  async function extListFile(f) {
    if (!f) return;
    let text = "";
    try {
      text = typeof f.text === "function" ? await f.text() : await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => rej(r.error); r.readAsText(f); });
    } catch (e) { ext.err = `${f.name} could not be read: ${GroupUse.shortErr(e, 160)}`; render(); return; }
    extListText(text, f.name);
  }
  function extListText(text, name) {
    const parsed = MdeEdgeExt.parseApproved(text);
    if (!parsed.total) { ext.err = `Nothing to read in ${name || "the pasted text"} — a header row with an Extension column, or one name per line.`; render(); return; }
    ext.list = { name: name || "pasted list", at: new Date().toISOString(), parsed, ids: {} };
    ext.err = "";
    extSaveList();
    render();
    extResolve(false);
  }
  // The row an approved entry is matched to: the ID it resolved to, and
  // where that ID stands against the policy and the plan.
  function extRowState(r, now, planned) {
    const res = (ext.list.ids || {})[r.key] || null;
    const id = res && MdeEdgeExt.isId(res.id) ? res.id : "";
    const inForce = id && now.force.some((e) => e.id === id), inAllow = id && now.allow.some((e) => e.id === id);
    const add = id ? planned.changes.find((c) => c.op === "add" && c.entry.id === id) : null;
    const same = id ? ext.list.parsed.rows.find((x) => x !== r && x.edge && (ext.list.ids[x.key] || {}).id === id) : null;
    return { res, id, inForce, inAllow, add, same, name: id ? extNameOf(id) : null };
  }
  const extStatusChip = (n) => n.status === "ok" ? chip("au-op create", "✓ store") : n.status === "builtin" ? chip("au-op other", "🔒 built-in")
    : n.status === "404" ? chip("au-op delete", "⚠ not in the store") : n.status === "unverified" ? chip("au-op update", "unverified") : n.status === "error" ? chip("au-op delete", "lookup failed") : chip("au-op other", "name unknown");
  const extStoreWord = (e) => { const s = MdeEdgeExt.storeOf(e); return s === "edge" ? "Edge Add-ons" : s === "chrome" ? "🌐 Chrome Web Store" : "own update URL"; };
  const extCode = (id) => `<code class="mr-extid">${esc(id)}</code>`;
  function extNameCell(id, e, listName) {
    const n = extNameOf(id);
    const sub = [];
    if (n.status === "ok") sub.push([n.developer, n.version ? `v${n.version}` : "", n.installs != null ? `${n.installs.toLocaleString()} users` : "", n.rating != null && n.ratings ? `★ ${n.rating} (${n.ratings})` : ""].filter(Boolean).join(" · "));
    if (n.status === "builtin") sub.push("Edge's own component, OIB's default — kept under a block list of *");
    if (n.status === "404") sub.push(e && MdeEdgeExt.storeOf(e) === "chrome" ? "⚠ not in the Edge store — a Chrome Web Store entry; Edge's policy text limits forced installs outside its own store to domain-joined Windows, so prove it on a pilot device" : "⚠ not in the Edge store — the store answers 404: retired, unlisted, or another store's ID without its update URL; it installs nothing here");
    if (n.status === "unverified") sub.push(n.source === "list" ? "the name from the approved list — not verified by the store" : n.source === "slug" ? "the name from the link — not verified by the store" : "named by hand — not verified by the store");
    if (n.status === "error") sub.push(`the store could not be asked: ${n.err || ""}`);
    if (n.status === "unknown") sub.push(TunoAddons.hasRoute() ? "not looked up yet" : "no lookup route — name it below, or set a route");
    const title = n.name ? `<b>${esc(n.name)}</b>` : `<b class="muted">${esc(id)}</b>`;
    const nameBox = n.status === "unknown" || n.status === "unverified" || n.status === "error"
      ? `<div class="mr-extname"><input type="text" data-mrextname="${esc(id)}" value="${esc(n.status === "unverified" && n.source === "operator" ? n.name : "")}" placeholder="Name this ID…" aria-label="${esc(`Name for ${id}`)}" spellcheck="false"></div>` : "";
    return `${title}${sub.length ? `<div class="mini muted">${esc(sub.join(" · "))}</div>` : ""}${nameBox}`;
  }
  function extApprovedOf(id) {
    if (!ext.list) return null;
    for (const r of ext.list.parsed.rows) { const x = ext.list.ids[r.key]; if (x && x.id === lc(id) && r.edge) return r; }
    return null;
  }
  function extPane() {
    const pols = extPolicies();
    const P = extPolicy();
    const routeLine = () => {
      const r = TunoAddons.route();
      return `<div class="mr-extroute"><span class="mini">🔎 Store lookup route</span><input id="mvExtRoute" type="text" value="${esc(r)}" placeholder="/addons or https://…" aria-label="Store lookup route" spellcheck="false"><button class="btn" id="mvExtRouteSave">Save</button>${r ? `<button class="btn" id="mvExtLookupAll" title="Ask the store again for every ID on this pane">↻ Look up every name</button>` : ""}<span class="mini muted" id="mvExtRouteMsg">${esc(ext.routeMsg || (r ? `${TunoAddons.crossOrigin(r) ? "cross-origin — its host must be in the page's connect-src" : "same origin"} · answers cached a day` : "none — paste mode: IDs and store links are accepted, names stay unverified"))}</span></div>`;
    };
    if (!P) return `<div class="list-card" style="margin-top:0">
        <p class="mini muted" style="margin:0 0 10px">No Edge extensions policy in the new set: none of its settings-catalog policies carries <b>Control which extensions are installed silently</b> or <b>Allow specific extensions to be installed</b>. The OIB one is <code>Win - OIB - SC - Microsoft Edge - U - Extensions</code>; a policy under ⚙️ Leave out is still found here, one with another prefix is not.</p>
        ${routeLine()}
      </div>`;
    const now = extNow(P);
    const planned = MdeEdgeExt.planOf(now, ext.edits);
    const chg = planned.changes;
    const count = (f) => f.length;
    const ids = extIdsOf(now);
    const findings = ids.filter((id) => { const n = extNameOf(id); return n.status === "404"; }).length;
    const notApproved = ext.list ? ids.filter((id) => !MdeEdgeExt.isBuiltIn(id) && !extApprovedOf(id)).length : 0;
    const pickPol = pols.length > 1 ? `<label class="mini" style="display:inline-flex;gap:6px;align-items:center">Policy <select id="mvExtPol" class="btn" style="padding:2px 6px">${pols.map((x) => `<option value="${esc(x.key)}"${x === P ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>` : "";
    const q = lc(view.q);
    const matchRow = (id) => !q || lc(id).includes(q) || lc(extNameOf(id).name).includes(q);
    const f = ext.filter;
    const showList = (k) => f === "all" || f === k || f === "edited" || f === "findings" || f === "notapproved";
    // one table per list: the entries as they are, then the pending adds
    const table = (k) => {
      const have = now[k];
      const adds = chg.filter((c) => c.list === k && c.op === "add");
      const rows = [];
      for (const e of have) {
        const key = MdeEdgeExt.keyOf(k, e.id);
        const ed = ext.edits.get(key);
        const n = extNameOf(e.id);
        const removed = ed && ed.op === "remove";
        if (f === "edited" && !removed) continue;
        if (f === "findings" && n.status !== "404") continue;
        if (f === "notapproved" && (MdeEdgeExt.isBuiltIn(e.id) || !ext.list || extApprovedOf(e.id))) continue;
        if (!matchRow(e.id)) continue;
        const appr = ext.list ? (MdeEdgeExt.isBuiltIn(e.id) ? `<span class="mini muted">— not a store extension</span>` : extApprovedOf(e.id) ? chip("gu-how inc", "✓ approved") : chip("gu-how exc", "✗ not in the list")) : `<span class="mini muted">no list loaded</span>`;
        const otherEd = ext.edits.get(MdeEdgeExt.keyOf(k === "force" ? "allow" : "force", e.id));
        const moved = removed && otherEd && otherEd.op === "add";
        const change = n.status === "builtin" ? `<span class="mini muted" title="Edge's own component — kept">keep 🔒</span>`
          : `<select class="btn mr-extsel${removed ? " off" : ""}" data-mrextchg="${esc(key)}" aria-label="${esc(`Change for ${n.name || e.id}`)}"><option value="keep"${!removed ? " selected" : ""}>keep (now)</option><option value="remove"${removed && !moved ? " selected" : ""}>remove${k === "force" ? (n.status === "404" ? " — installs nothing today" : " — uninstalls it") : " — blocks it again"}</option><option value="move"${moved ? " selected" : ""}>move to ${k === "force" ? "exempt" : "installed silently"}</option></select>`;
        rows.push(`<tr class="${removed ? "mr-ext-removed" : ""}${n.status === "404" ? " mr-ext-finding" : ""}">
          <td>${extNameCell(e.id, e, k)}</td>
          <td>${extCode(MdeEdgeExt.formatEntry(e))}</td>
          <td class="mini" style="white-space:nowrap">${n.status === "builtin" ? "🔒 built-in" : n.status === "404" ? `<span style="color:var(--off)">⚠ 404</span>` : esc(extStoreWord(e))}</td>
          <td>${appr}</td>
          <td>${change}</td></tr>`);
      }
      for (const c of adds) {
        const n = extNameOf(c.entry.id);
        if (f === "findings" && n.status !== "404") continue;
        if (f === "notapproved" && (!ext.list || extApprovedOf(c.entry.id))) continue;
        if (!matchRow(c.entry.id)) continue;
        const key = MdeEdgeExt.keyOf(k, c.entry.id);
        const other = k === "force" ? "allow" : "force";
        rows.push(`<tr class="mr-ext-added${n.status === "404" ? " mr-ext-finding" : ""}">
          <td>${extNameCell(c.entry.id, c.entry, k)}</td>
          <td>${extCode(MdeEdgeExt.formatEntry(c.entry))}</td>
          <td class="mini" style="white-space:nowrap">${n.status === "404" ? `<span style="color:var(--off)">⚠ 404</span>` : esc(extStoreWord(c.entry))}</td>
          <td>${ext.list ? (extApprovedOf(c.entry.id) ? chip("gu-how inc", "✓ approved") : chip("gu-how priv", "not in the list")) : `<span class="mini muted">no list loaded</span>`}</td>
          <td><select class="btn mr-extsel on" data-mrextchg="${esc(key)}" aria-label="${esc(`Change for ${n.name || c.entry.id}`)}"><option value="add" selected>add ✎ — ${k === "force" ? "installed silently" : "exempt"}</option><option value="addother">add — ${other === "force" ? "install silently" : "exempt"} instead</option><option value="drop">don't add</option></select></td></tr>`);
      }
      const after = planned.after[k].length;
      const head = `<div class="mr-exthead"><h4 style="margin:0">${EXTL[k].icon} ${esc(EXTL[k].word)}</h4><span class="mini muted">${esc(EXTL[k].setting)} · ${have.length} now${after !== have.length ? ` → ${after} after` : ""} · ${k === "force" ? "goes on every user the policy reaches; they cannot remove it; it wins over the block list" : "users may install these themselves; nothing is installed for them"}${!now.on[k] && !have.length ? " · the setting is off in the policy — the first add turns it on" : ""}</span></div>`;
      return `${head}${rows.length ? `<div style="overflow-x:auto"><table class="cg-table mr-ext-table">
          <colgroup><col style="width:30%"><col><col style="width:130px"><col style="width:130px"><col style="width:200px"></colgroup>
          <thead><tr><th>Extension (store name)</th><th>ID · update URL</th><th>Store</th><th>Approved</th><th>Change</th></tr></thead>
          <tbody>${rows.join("")}</tbody></table></div>` : `<p class="mini muted" style="margin:6px 0 0">${have.length || adds.length ? "Nothing matches the filter." : "Empty."}</p>`}`;
    };
    // the approved list card
    const listCard = () => {
      if (!ext.list) return `<div class="list-card" id="mvExtListCard">
          <div class="mr-exthead"><h4 style="margin:0">📋 Approved extensions</h4><span class="mini muted">a TSV or CSV with a header row (Extension, Browser, Installed, Band, ApPo…) — or one name per line; Edge rows only count</span></div>
          ${ext.err ? `<div class="gu-fail" style="margin:8px 0"><b>${esc(ext.err)}</b></div>` : ""}
          <div class="mr-exsearch" style="margin-top:8px"><label class="btn" for="mvExtFile">⭱ Load a list (TSV · CSV · TXT)</label><input type="file" id="mvExtFile" accept=".tsv,.csv,.txt,text/plain,text/csv,text/tab-separated-values" style="position:absolute;left:-9999px"><span class="mini muted">or paste below and press Ctrl/⌘ + Enter</span></div>
          <textarea id="mvExtListText" rows="4" placeholder="Extension&#9;Browser&#9;Installed&#9;Band&#9;ApPo&#10;Tango – Document and Automate Your Processes&#9;Edge&#9;2&#9;Allow - ApPo&#9;Yes" style="width:100%;margin-top:8px;font-family:ui-monospace,Consolas,monospace;font-size:12px"></textarea>
          <p class="mini muted" style="margin:8px 0 0">Kept for this tenant in this browser once loaded. The list drives the plan, never the tenant: nothing is written until ② Dry run and ④ Apply.</p>
        </div>`;
      const L = ext.list, rowsE = L.parsed.rows.filter((r) => r.edge);
      const st = rowsE.map((r) => extRowState(r, now, planned));
      const named = st.filter((s) => s.id && s.name && (s.name.status === "ok" || s.name.status === "builtin")).length;
      const byId = st.filter((s) => s.id && s.res && (s.res.how === "column" || s.res.how === "operator" || s.res.how === "pick")).length;
      const gone = st.filter((s) => s.id && s.name && s.name.status === "404").length;
      const open = st.filter((s) => !s.id).length;
      const addable = st.filter((s) => s.id && !s.inForce && !s.inAllow && !s.add && !s.same && !(s.name && s.name.status === "404")).length;
      const rowHtml = (r, s) => {
        const hits = s.res && s.res.hits ? s.res.hits : [];
        const store = s.id
          ? `${extStatusChip(s.name)} ${s.name.name ? `<b>${esc(s.name.name)}</b> ` : ""}${s.name.developer ? `<span class="mini muted">${esc(s.name.developer)} · </span>` : ""}${extCode(s.id)}${s.res.how === "column" ? ` <span class="mini muted">from the list's ID column</span>` : s.res.how === "operator" ? ` <span class="mini muted">pasted</span>` : s.res.how === "pick" ? ` <span class="mini muted">picked</span>` : ""}${s.name.status === "404" ? ` <span class="mini" style="color:var(--off)">— the store answers 404; it cannot be installed from a list</span>` : ""}`
          : `${s.res && s.res.how === "error" ? chip("au-op delete", "lookup failed") + ` <span class="mini muted">${esc(s.res.err || "")}</span>` : hits.length ? chip("au-op update", "❓ pick") + ` <span class="mini muted">${hits.length} hits:</span> ` + hits.map((h) => `<button type="button" class="mr-extpick" data-mrextpick="${esc(r.key)}" data-mrextpickid="${esc(h.id)}" title="${esc(h.id)}">${esc(h.name)}<span class="muted"> · ${esc(h.developer)}</span></button>`).join(" ")
            : s.res && s.res.how === "none" ? chip("au-op update", "❓ no store match") + ` <span class="mini muted">the store search misses unlisted extensions — paste the ID or the store link</span>` : TunoAddons.hasRoute() ? `<span class="mini muted">not searched yet</span>` : chip("au-op other", "no route") + ` <span class="mini muted">paste the ID or the store link</span>`}
            <div class="mr-extname"><input type="text" data-mrextrowid="${esc(r.key)}" placeholder="ID or store link…" aria-label="${esc(`ID for ${r.name}`)}" spellcheck="false"></div>`;
        const plan = !s.id ? `<span class="mini muted">— unresolved</span>`
          : s.same ? `<span class="mini muted">same ID as ${esc(s.same.name)}</span>`
          : s.inForce && s.inAllow ? `<span class="mini muted">already in both lists</span>` : s.inForce ? `<span class="mini muted">already installed silently</span>` : s.inAllow ? `<span class="mini muted">already exempt</span>`
          : s.add ? chip("au-op update", `+ ${s.add.list === "force" ? "installed silently" : "exempt"}`) + ` <button type="button" class="btn mr-extmini" data-mrextdrop="${esc(MdeEdgeExt.keyOf(s.add.list, s.id))}" title="Take it out of the plan">✕</button>`
          : s.name.status === "404" ? `<span class="mini muted">— not offered</span>`
          : `<button type="button" class="btn mr-extmini" data-mrextadd="allow" data-mrextaddid="${esc(s.id)}">+ exempt</button> <button type="button" class="btn mr-extmini" data-mrextadd="force" data-mrextaddid="${esc(s.id)}">+ silent</button>`;
        return `<tr><td><b>${esc(r.name)}</b>${r.closest ? `<div class="mini muted">${esc(r.closest)}</div>` : ""}</td><td class="mini muted" style="white-space:nowrap">${r.installed != null ? `×${esc(r.installed)}` : ""}</td><td class="mini muted">${esc([r.band, r.appo].filter(Boolean).join(" · "))}</td><td>${store}</td><td style="white-space:nowrap">${plan}</td></tr>`;
      };
      const shown = rowsE.map((r, i) => [r, st[i]]).filter(([r, s]) => !q || lc(r.name).includes(q) || lc(s.id).includes(q)).sort((a, b) => (b[0].installed || 0) - (a[0].installed || 0));
      return `<div class="list-card" id="mvExtListCard">
          <div class="mr-exthead"><h4 style="margin:0">📋 Approved extensions</h4><span class="mini muted">${esc(L.name)} · ${plural(L.parsed.total, "row")} · loaded ${esc(new Date(L.at).toLocaleString())} · kept in this browser for this tenant</span>
            <span class="tb-actions"><label class="btn" for="mvExtFile">⭱ Load another list</label><input type="file" id="mvExtFile" accept=".tsv,.csv,.txt,text/plain,text/csv,text/tab-separated-values" style="position:absolute;left:-9999px">${TunoAddons.hasRoute() ? `<button class="btn" id="mvExtResolve" title="Search the store again for every Edge row">↻ Match again</button>` : ""}<button class="btn" id="mvExtListClear">Clear</button></span></div>
          <div class="mr-extchips">${chip("au-op create", `${rowsE.length} Edge rows`)} ${chip("au-op create", `${named} named by the store`)} ${byId ? chip("au-op create", `${byId} by ID`) + " " : ""}${open ? chip("au-op update", `${open} to resolve`) + " " : ""}${gone ? chip("au-op delete", `${gone} gone from the store`) + " " : ""}${L.parsed.chrome ? chip("au-op other", `${L.parsed.chrome} Chrome rows — not this policy`) : ""}</div>
          ${ext.err ? `<div class="gu-fail" style="margin:8px 0"><b>${esc(ext.err)}</b></div>` : ""}
          <p class="mini muted" style="margin:0 0 8px">Each Edge row is searched in the store by name: a unique hit names it, several hits ask you to pick, none asks for the ID or the store link — the store search misses unlisted extensions (UiPath's, Microsoft Multimedia Redirection among them), and an ID is named by the store the moment it is pasted. ${TunoAddons.hasRoute() ? "" : "Without a route, paste the ID or the store link in each row; the list's name is used, unverified."}</p>
          ${shown.length ? `<div style="overflow-x:auto"><table class="cg-table mr-ext-table">
            <colgroup><col style="width:28%"><col style="width:60px"><col style="width:150px"><col><col style="width:190px"></colgroup>
            <thead><tr><th>Approved extension (list)</th><th>Seen on</th><th>Band · ApPo</th><th>In the store</th><th>In the plan</th></tr></thead>
            <tbody>${shown.map(([r, s]) => rowHtml(r, s)).join("")}</tbody></table></div>` : `<p class="mini muted" style="margin:0">${rowsE.length ? "Nothing matches the filter." : "No Edge rows in this list."}</p>`}
          <div class="mr-extbulk"><span>Add the <b>${addable}</b> named approved extensions not in the policy yet as</span><select id="mvExtBulk" class="btn" style="padding:2px 6px"><option value="allow"${ext.bulk === "allow" ? " selected" : ""}>exempt from the block list — users may install them</option><option value="force"${ext.bulk === "force" ? " selected" : ""}>installed silently — on every user, cannot be removed</option></select><button class="btn" id="mvExtBulkGo"${addable ? "" : " disabled"}>➕ Add to the plan</button><span class="mini muted">— then move single rows between the lists below.</span></div>
        </div>`;
    };
    // the add box: a store search, or a pasted ID / link
    const addCard = () => {
      const pasted = MdeEdgeExt.fromInput(ext.q);
      const hits = (ext.hits || []).map((h) => {
        const inF = now.force.some((e) => e.id === h.id), inA = now.allow.some((e) => e.id === h.id);
        const add = chg.find((c) => c.op === "add" && c.entry.id === h.id);
        const state = inF && inA ? "already in both lists" : inF ? "already installed silently" : inA ? "already exempt" : add ? `already in the plan — ${add.list === "force" ? "installed silently" : "exempt"}` : "";
        return `<div class="mr-exhit mr-exthit"><b>${esc(h.name)}</b><span class="muted">${esc([h.developer, h.rating != null && h.ratings ? `★ ${h.rating} (${h.ratings})` : ""].filter(Boolean).join(" · "))}</span>${extCode(h.id)}<span class="mr-extacts">${state ? chip("au-op update", state) : `<button type="button" class="btn mr-extmini" data-mrextadd="allow" data-mrextaddid="${esc(h.id)}" data-mrextaddname="${esc(h.name)}">+ exempt</button><button type="button" class="btn mr-extmini" data-mrextadd="force" data-mrextaddid="${esc(h.id)}" data-mrextaddname="${esc(h.name)}">+ install silently</button>`}<a class="mini" href="https://microsoftedge.microsoft.com/addons/detail/${esc(h.id)}" target="_blank" rel="noopener">store ↗</a></span></div>`;
      }).join("");
      const pasteLine = pasted ? (() => {
        const n = extNameOf(pasted.id);
        const inF = now.force.some((e) => e.id === pasted.id), inA = now.allow.some((e) => e.id === pasted.id);
        const add = chg.find((c) => c.op === "add" && c.entry.id === pasted.id);
        const state = inF && inA ? "already in both lists" : inF ? "already installed silently" : inA ? "already exempt" : add ? `already in the plan — ${add.list === "force" ? "installed silently" : "exempt"}` : "";
        return `<div class="mr-exhit mr-exthit on"><b>${esc(n.name || (pasted.slug ? MdeEdgeExt.slugName(pasted.slug) : pasted.id))}</b>${extStatusChip(n)}<span class="muted">${pasted.store === "chrome" ? "Chrome Web Store link — the entry carries the Chrome update URL" : pasted.store === "edge" ? "Edge Add-ons" : "own update URL"}</span>${extCode(MdeEdgeExt.formatEntry(pasted))}<span class="mr-extacts">${state ? chip("au-op update", state) : `<button type="button" class="btn mr-extmini" data-mrextadd="allow" data-mrextaddid="${esc(pasted.id)}" data-mrextaddurl="${esc(pasted.updateUrl)}" data-mrextaddname="${esc(n.name || (pasted.slug ? MdeEdgeExt.slugName(pasted.slug) : ""))}" data-mrextaddsrc="${pasted.slug ? "slug" : ""}">+ exempt</button><button type="button" class="btn mr-extmini" data-mrextadd="force" data-mrextaddid="${esc(pasted.id)}" data-mrextaddurl="${esc(pasted.updateUrl)}" data-mrextaddname="${esc(n.name || (pasted.slug ? MdeEdgeExt.slugName(pasted.slug) : ""))}" data-mrextaddsrc="${pasted.slug ? "slug" : ""}">+ install silently</button>`}</span></div>`;
      })() : "";
      return `<div class="list-card" id="mvExtAddCard">
          <div class="mr-exthead"><h4 style="margin:0">🔎 Add an extension</h4><span class="mini muted">search the Edge Add-ons store by name, or paste an ID (32 letters a–p), an Edge store link or a Chrome Web Store link — a Chrome one gets <code>;${esc(MdeEdgeExt.CHROME_UPDATE)}</code> behind the ID, the way Edge's force list wants it</span></div>
          <div class="mr-exsearch" style="margin-top:8px"><input id="mvExtQ" type="search" placeholder="${TunoAddons.hasRoute() ? "Name, ID or store link…" : "ID or store link… (no lookup route — set one above to search by name)"}" value="${esc(ext.q)}" autocomplete="off" spellcheck="false" aria-label="Search the store or paste an ID"><button class="btn primary" id="mvExtGo"${ext.searching || (!pasted && !TunoAddons.hasRoute()) ? " disabled" : ""}>${ext.searching ? "Searching…" : pasted ? "Look it up" : "Search the store"}</button></div>
          ${ext.note ? `<p class="mini muted" style="margin:6px 0 0">${esc(ext.note)}</p>` : ""}
          ${pasteLine || hits ? `<div class="mr-exresults">${pasteLine}${hits}</div>` : ""}
        </div>`;
    };
    const bar = chg.length ? `<div class="mr-asrbar" role="region" aria-label="Pending list changes"><b>${plural(chg.length, "change")} in 1 policy</b><span class="mini">${[chg.filter((c) => c.op === "remove").length ? plural(chg.filter((c) => c.op === "remove").length, "removal") : "", chg.filter((c) => c.op === "add" && c.list === "force").length ? plural(chg.filter((c) => c.op === "add" && c.list === "force").length, "silent install") : "", chg.filter((c) => c.op === "add" && c.list === "allow").length ? plural(chg.filter((c) => c.op === "add" && c.list === "allow").length, "exemption") : ""].filter(Boolean).join(" · ")} — users reached take the new lists at their next policy refresh</span><span style="margin-left:auto"></span><button class="btn" id="mvExtDiscard">Discard</button><button class="btn primary" id="mvExtDry">② Dry run →</button></div>` : "";
    return `<div class="toolbar">
        ${fchip("data-mrextf", "all", "Both lists", count(now.force) + count(now.allow) + chg.filter((c) => c.op === "add").length, f === "all")}
        ${fchip("data-mrextf", "force", `${EXTL.force.icon} Installed silently`, planned.after.force.length, f === "force")}
        ${fchip("data-mrextf", "allow", `${EXTL.allow.icon} Exempt from the block list`, planned.after.allow.length, f === "allow")}
        ${fchip("data-mrextf", "edited", "✎ Changed here", chg.length, f === "edited")}
        ${fchip("data-mrextf", "findings", "⚠ Findings", findings, f === "findings")}
        ${ext.list ? fchip("data-mrextf", "notapproved", "✗ Not approved", notApproved, f === "notapproved") : ""}
        ${searchBox()}
      </div>
      <div class="list-card" id="mvExtCard" style="margin-top:0">
        <div class="mr-exthead"><h3 style="margin:0;font-size:15px">${polLink(P)}</h3>${pickPol}<span class="mini muted">${genChip(P)} ${audChip(P)}settings catalog${extModified(P) ? ` · last modified ${esc(new Date(extModified(P)).toLocaleString())}` : ""}${P.generation !== "new" ? ` · <span title="Under ⚙️ Leave out: not compared or planned in the other panes — its lists are still edited here">➖</span>` : ""}</span><span class="mini">${assignChips(P)}</span></div>
        <p class="mini muted" style="margin:8px 0 0">The two lists of this policy, each row named by the Edge Add-ons store from its ID. <b>${esc(EXTL.force.word)}</b> is Edge's force list: it goes on every user the policy reaches and they cannot remove it; it also wins over the block list. <b>${esc(EXTL.allow.word)}</b> only lets a user install that extension themselves. An ID the store does not know is a finding, not a guess. Change a row, add from the approved list or the store, then <b>② Dry run</b>: the policy is read fresh and every change is shown before anything is written. 🔒 Block list: ${now.on.block ? `<code>${esc(now.block.map((e) => e.raw).join(", ") || "on")}</code>${now.block.some((e) => e.raw === "*") ? " — everything blocked" : ""}` : "off"} · external extensions ${now.external === null ? "not set" : now.external ? "blocked" : "allowed"} — read, never edited here.</p>
        ${routeLine()}
        <p class="mini muted" id="mvExtLooking" style="margin:6px 0 0${ext.looking ? "" : ";display:none"}">${esc(ext.looking)}</p>
      </div>
      ${listCard()}
      ${showList("force") ? `<div class="list-card" id="mvExtForce">${table("force")}</div>` : ""}
      ${showList("allow") ? `<div class="list-card" id="mvExtAllow">${table("allow")}</div>` : ""}
      ${addCard()}
      ${bar}`;
  }
  // an add from a hit, a pasted entry or the approved list
  function extAdd(list, id, updateUrl, name, source) {
    const k = lc(id);
    if (!MdeEdgeExt.isId(k)) return;
    const other = list === "force" ? "allow" : "force";
    ext.edits.delete(MdeEdgeExt.keyOf(other, k));
    ext.edits.set(MdeEdgeExt.keyOf(list, k), { op: "add", entry: { id: k, updateUrl: updateUrl || "" } });
    const n = extNameOf(k);
    if (name && (n.status === "unknown")) ext.names.set(k, { status: "unverified", name, source: source || "list" });
    clearPlan();
    if (TunoAddons.hasRoute() && (n.status === "unknown" || n.status === "unverified")) extLookup([k], false);
  }
  function extChange(key, value) {
    const [list, id] = key.split("|");
    const P = extPolicy(); if (!P) return;
    const now = extNow(P);
    const other = list === "force" ? "allow" : "force";
    const have = now[list].find((e) => e.id === id);
    if (have) {
      // an entry the policy has: keep, remove, or move to the other list
      ext.edits.delete(MdeEdgeExt.keyOf(list, id));
      ext.edits.delete(MdeEdgeExt.keyOf(other, id));
      if (value === "remove") ext.edits.set(MdeEdgeExt.keyOf(list, id), { op: "remove", entry: { id, updateUrl: have.updateUrl } });
      if (value === "move") { ext.edits.set(MdeEdgeExt.keyOf(list, id), { op: "remove", entry: { id, updateUrl: have.updateUrl } }); if (!now[other].some((e) => e.id === id)) ext.edits.set(MdeEdgeExt.keyOf(other, id), { op: "add", entry: { id, updateUrl: have.updateUrl } }); }
    } else {
      // a pending add: keep it, move it to the other list, or drop it
      const ed = ext.edits.get(MdeEdgeExt.keyOf(list, id));
      if (!ed) return;
      if (value === "drop") ext.edits.delete(MdeEdgeExt.keyOf(list, id));
      if (value === "addother") { ext.edits.delete(MdeEdgeExt.keyOf(list, id)); if (!now[other].some((e) => e.id === id)) ext.edits.set(MdeEdgeExt.keyOf(other, id), ed); }
    }
    clearPlan();
  }
  async function extSearch() {
    const P = extPolicy(); if (!P || ext.searching) return;
    const pasted = MdeEdgeExt.fromInput(ext.q);
    ext.hits = null; ext.note = "";
    if (pasted) {
      if (!TunoAddons.hasRoute()) { ext.note = "No lookup route — the ID is accepted as pasted; name it after adding, or set a route."; render(); return; }
      ext.searching = true; render();
      try { const a = await TunoAddons.detail(pasted.id); ext.names.set(pasted.id, Object.assign({ source: "store" }, a)); ext.note = a.status === "ok" ? `The store names it: ${a.name}.` : "The store does not know this ID (404)."; }
      catch (e) { ext.note = `Lookup failed: ${GroupUse.shortErr(e, 200)}`; }
      finally { ext.searching = false; render(); }
      return;
    }
    if (!ext.q.trim()) return;
    if (!TunoAddons.hasRoute()) { ext.note = "No lookup route — a name cannot be searched. Paste the ID or the store link, or set a route above."; render(); return; }
    ext.searching = true; render();
    try {
      const hits = await TunoAddons.search(ext.q);
      ext.hits = hits;
      ext.note = hits.length ? `${plural(hits.length, "hit")} for “${ext.q.trim()}” — an extension already in a list or in the plan is shown, not offered twice.` : `No hits for “${ext.q.trim()}” — the store search misses unlisted extensions; paste the ID or the store link instead.`;
    } catch (e) { ext.note = `Search failed: ${GroupUse.shortErr(e, 200)}`; }
    finally { ext.searching = false; render(); const q = $("mvExtQ"); if (q) q.focus(); }
  }
  // the plan: read the policy fresh, keep every change that still applies
  async function extDryRun(changes, title) {
    const P = extPolicy();
    if (busy || !model || !P) return;
    busy = true; planAnchor = "mvExtCard"; clearPlan(); seatPlan();
    try {
      await Graph.ensureScopes(Graph.SCOPES.config);
      planEl().innerHTML = `<p class="mini muted" style="margin-top:12px">Reading ${esc(P.name)} fresh…</p>`;
      let fr;
      try { fr = await asrReadOne(P.id); } catch (e) { plan = { kind: "edgeext", title: title || "Adjust the Edge extension lists", items: [], unread: [`${P.name} — ${GroupUse.shortErr(e, 120)}`], drifted: [], undo: /^Undo:/.test(title || "") }; renderExtPlan(); return; }
      const now = MdeEdgeExt.listsIn(fr.settings);
      const edits = changes ? MdeEdgeExt.editsOf(changes) : ext.edits;
      const planned = MdeEdgeExt.planOf(now, edits);
      const drifted = [];
      // an edit that no longer applies — the tenant moved since the read
      for (const [key, ed] of edits) {
        const [list, id] = key.split("|");
        const has = now[list].some((e) => e.id === id);
        if (ed.op === "remove" && !has) drifted.push(`${extNameOf(id).name || id}: no longer in ${EXTL[list].word} — removed by somebody else`);
        if (ed.op === "add" && has) drifted.push(`${extNameOf(id).name || id}: already in ${EXTL[list].word}`);
      }
      const items = planned.changes.length ? [{ id: P.id, key: P.key, name: P.name, policy: fr.policy, settings: fr.settings, lastMod: fr.policy && fr.policy.lastModifiedDateTime, before: now, after: planned.after, changes: planned.changes }] : [];
      plan = { kind: "edgeext", title: title || `Adjust the Edge extension lists · ${P.name}`, items, unread: [], drifted, undo: /^Undo:/.test(title || "") };
      renderExtPlan();
    } catch (e) { planError(GroupUse.shortErr(e, 300)); }
    finally { busy = false; }
  }
  const extChangeLine = (c) => { const n = extNameOf(c.entry.id); return `${c.op === "add" ? "+" : "−"} ${n.name || c.entry.id} (${EXTL[c.list].word})`; };
  function renderExtPlan() {
    v2Bind();
    const p = plan;
    const n = p.items.reduce((a, x) => a + x.changes.length, 0);
    const P = extPolicy();
    const reach = P ? assignChips(P) : "";
    const rows = p.items.map((x) => x.changes.map((c) => {
      const nm = extNameOf(c.entry.id);
      const what = c.list === "force"
        ? (c.op === "add" ? (nm.status === "404" ? "nothing — the store does not know this ID, so Edge installs nothing" : "installed in their Edge at the next policy refresh · they cannot remove or disable it") : (nm.status === "404" ? "nothing changes on any device — it never installed" : "uninstalled from their Edge at the next policy refresh"))
        : (c.op === "add" ? "may install it from the store themselves · nothing is installed for them" : "blocked again — disabled where a user installed it");
      return `<tr><td>${esc(EXTL[c.list].word)}</td><td>${chip(c.op === "add" ? "au-op create" : "au-op delete", c.op === "add" ? "+ add" : "− remove")}</td><td>${nm.name ? `<b>${esc(nm.name)}</b> ` : ""}${extCode(MdeEdgeExt.formatEntry(c.entry))}${nm.status === "404" ? `<div class="mini" style="color:var(--off)">⚠ not in the Edge store</div>` : nm.status === "unverified" ? `<div class="mini muted">name unverified</div>` : ""}</td><td class="mini muted">${esc(what)}</td></tr>`;
    }).join("")).join("");
    const removesLive = p.items.reduce((a, x) => a + x.changes.filter((c) => c.list === "force" && c.op === "remove" && extNameOf(c.entry.id).status !== "404").length, 0);
    const addsForce = p.items.reduce((a, x) => a + x.changes.filter((c) => c.list === "force" && c.op === "add").length, 0);
    const addsAllow = p.items.reduce((a, x) => a + x.changes.filter((c) => c.list === "allow" && c.op === "add").length, 0);
    const removesAllow = p.items.reduce((a, x) => a + x.changes.filter((c) => c.list === "allow" && c.op === "remove").length, 0);
    planEl().innerHTML = `<div class="list-card" style="margin-top:14px;padding:16px 18px">
      <h4 style="margin:0 0 6px">② Plan — ${esc(p.title)}</h4>
      <p class="mini" style="margin:0 0 8px"><b>${plural(n, "change")}</b> in <b>${plural(p.items.length, "policy", "policies")}</b>${p.items.length ? ` · read fresh · last modified ${esc(p.items[0].lastMod ? new Date(p.items[0].lastMod).toLocaleString() : "unknown")} · ${plural((p.items[0].settings || []).length, "setting")} re-sent, the two lists changed` : ""}.</p>
      ${p.drifted.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>Left out — the tenant moved since the read:</b><span class="why">${p.drifted.map(esc).join("<br>")}</span></div>` : ""}
      ${p.unread.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>Could not read fresh:</b><span class="why">${p.unread.map(esc).join("<br>")} — left out rather than written blind.</span></div>` : ""}
      ${p.items.length ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:170px"><col style="width:90px"><col><col style="width:34%"></colgroup><thead><tr><th>List</th><th>Change</th><th>Extension</th><th>What the reached users get</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="mr-extbox warn"><b>Likely impact</b><div class="mini muted">Reaches ${reach}. The settings catalog takes a policy's settings only as a whole: the policy is re-sent with every setting exactly as read, the two lists changed; the block list and the external-extensions block ride along untouched. Edge applies the lists at its next policy refresh after the Intune sync — minutes to hours, not at once.${addsForce ? ` <b>Silent installs:</b> the ${plural(addsForce, "added extension")} appear${addsForce === 1 ? "s" : ""} in every reached user's Edge and cannot be removed or disabled by them; the force list also wins over the block list.` : ""}${removesLive ? ` <b>Removals:</b> ${plural(removesLive, "extension")} ${removesLive === 1 ? "is" : "are"} uninstalled from every reached user's Edge at the next refresh.` : ""}${addsAllow ? ` <b>Exemptions:</b> the ${plural(addsAllow, "added extension")} become${addsAllow === 1 ? "s" : ""} installable by the user; nothing is installed for them.` : ""}${removesAllow ? ` <b>Exemptions taken away:</b> ${plural(removesAllow, "extension")} ${removesAllow === 1 ? "is" : "are"} blocked again and disabled where a user installed ${removesAllow === 1 ? "it" : "them"}.` : ""}</div></div>
      <div class="mr-extbox ok"><b>The way back</b><div class="mini muted">③ takes the backup — the policy and all its settings, as a file. After the apply, 📜 Changes this session holds this run with an <b>Undo</b> that writes the previous lists back through the same pipeline — fresh read, drift check, read-back. An undo takes a silent install away again (uninstalled at the next refresh) and puts an exemption back under the block list. A policy that changed in the tenant since this dry run is skipped as drifted, never overwritten.</div></div>
      <div style="margin-top:12px">
        <div class="tb-actions"><button class="btn" id="mvBackup">③ ⭳ Take the backup <span class="mini">— the policy and all its settings, as a file</span></button></div>
        <label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="mvConfirmTick"> I have read the plan — ${plural(p.items.length, "policy", "policies")}</label>
        <label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin:8px 0 0 14px"><input type="checkbox" id="mvStop" checked> Stop at the first failure</label>
        <div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="mvApply" disabled>④ Apply — write to the tenant</button><button class="btn" id="mvDiscard">Discard the plan</button></div>
        <p id="mvGate" class="mini muted" style="margin:8px 0 0">Take the backup, confirm, apply. Apply stays locked until both.</p>
      </div>` : `<p class="mini muted" style="margin:0">Nothing to write — every change is already in the tenant or left out above.</p><div class="tb-actions" style="margin-top:10px"><button class="btn" id="mvDiscard">Close</button></div>`}
      <div id="mvLedger"></div>
    </div>`;
    const upd = () => { const b = $("mvApply"); if (b) b.disabled = !gateOk(); };
    if ($("mvConfirmTick")) $("mvConfirmTick").addEventListener("change", upd);
    if ($("mvBackup")) $("mvBackup").addEventListener("click", () => {
      download(`t28-edge-extensions-before-${stamp()}.json`, extBackup(p));
      backupTaken = true; $("mvGate").textContent = "Backup taken. Confirm, then apply."; upd();
    });
    if ($("mvApply")) $("mvApply").addEventListener("click", extApply);
    $("mvDiscard").addEventListener("click", clearPlan);
    v2AttachGate();
    showPlan();
  }
  const extBackup = (p) => JSON.stringify({ tool: "TUNO T28 MDE rollout", action: "adjust Edge extension lists", title: p.title, at: new Date().toISOString(),
    tenant: tenantName(), policies: p.items.map((x) => ({ id: x.id, name: x.name, policy: x.policy, settings: x.settings, lists: { before: { force: x.before.force.map(MdeEdgeExt.formatEntry), allow: x.before.allow.map(MdeEdgeExt.formatEntry) }, after: { force: x.after.force.map(MdeEdgeExt.formatEntry), allow: x.after.allow.map(MdeEdgeExt.formatEntry) } } })) }, null, 2);
  async function extApply() {
    if (busy || !gateOk() || !plan || plan.kind !== "edgeext") return;
    busy = true;
    const p = plan;
    try {
      await Graph.ensureScopes(AssignEdit.WRITE());
      if (plan !== p || !gateOk()) throw new Error("Plan context changed. Create a new plan.");
      $("mvApply").disabled = true;
      const L = RunLedger.create($("mvLedger"), { unit: "policies", title: p.title,
        items: p.items.map((x) => ({ label: x.name, sub: x.changes.map(extChangeLine).join(" · ") })) });
      const stopOnFail = $("mvStop") && $("mvStop").checked;
      const done = [], lines = [];
      let okN = 0, halt = false;
      for (let i = 0; i < p.items.length; i++) {
        const x = p.items[i];
        if (L.stopped || halt) { L.skip(i, L.stopped ? "stopped" : "stopped at the first failure"); lines.push(`${x.name}: skipped`); continue; }
        L.start(i);
        try {
          const fr = await asrReadOne(x.id);
          const nowL = MdeEdgeExt.listsIn(fr.settings);
          const moved = (fr.policy && fr.policy.lastModifiedDateTime) !== x.lastMod || !MdeEdgeExt.same(nowL.force, x.before.force) || !MdeEdgeExt.same(nowL.allow, x.before.allow);
          if (moved) { L.skip(i, "changed in the tenant since the dry run — not written", "drifted"); lines.push(`${x.name}: drifted — not written`); continue; }
          const w = MdeEdgeExt.withLists(fr.settings, x.after);
          if (w.missing.length) { L.fail(i, `setting not found: ${w.missing.join(", ")}`, "not written"); lines.push(`${x.name}: not written — setting not found`); halt = stopOnFail; continue; }
          await Graph.put(Graph.BETA + asrPolUrl(x.id), MdeEdgeExt.putBody(fr.policy, w.settings), { scopes: AssignEdit.WRITE() });
          const back = await Graph.readAll(`${asrPolUrl(x.id)}/settings?$expand=settingDefinitions&$top=1000`, { scopes: Graph.SCOPES.config, beta: true, retry: true });
          const P = model.byKey.get(x.key);
          if (P && P.raw) P.raw.__detail = back;
          const summary = x.changes.map(extChangeLine).join("; ");
          if (MdeEdgeExt.verified(back, x.after)) {
            L.done(i, "", "written · verified"); okN++;
            done.push({ id: x.id, key: x.key, name: x.name, changes: x.changes });
            lines.push(`${x.name}: ${summary} — written · verified`);
          } else { L.fail(i, "the read-back does not show the new lists", "written · NOT verified"); lines.push(`${x.name}: ${summary} — written · NOT verified`); halt = stopOnFail; }
        } catch (e) { const why = GroupUse.shortErr(e, 200); L.fail(i, why); lines.push(`${x.name}: failed — ${why}`); halt = stopOnFail; }
      }
      L.finish();
      runs.push({ at: Date.now(), title: p.title, kind: "edgeext", ok: okN, bad: p.items.length - okN, stopped: L.stopped,
        risk: v2Risk, backup: JSON.parse(extBackup(p)), done: done.length ? done[0].changes : [], lines });
      PolicyCache.invalidate();
      for (const d of done) for (const c of d.changes) ext.edits.delete(MdeEdgeExt.keyOf(c.list, c.entry.id));
      plan = null; backupTaken = false;
      derive();
      render();
      const note = document.createElement("p");
      note.className = "mini muted"; note.style.margin = "8px 0 0";
      note.textContent = `${okN} written & verified. The lists above read the verified settings; users take the new lists at their next policy refresh. The run and its undo are in 📜 Changes this session.`;
      $("mvLedger").appendChild(note);
      const disc = $("mvDiscard"); if (disc) disc.textContent = "Close";
    } catch (e) {
      const el = document.createElement("div"); el.className = "gu-fail"; el.innerHTML = `<b>${esc(GroupUse.shortErr(e, 300))}</b>`;
      $("mvLedger").appendChild(el);
    } finally { busy = false; }
  }
  function openEdgeExt() {
    pane = "edgeext"; view.cat = null; view.state = null; view.q = "";
    render();
    const P = extPolicy();
    if (P) { extLookup(extIdsOf(extNow(P)), false); extResolve(false); }
  }

  // -------------------------------------------------- rollout actions --
  function rolloutCtx() {
    return { kinds, found: found || new Map(), twins: M.twinIndex(model.cfg, found), names, pairs, regions: rollRegions };
  }
  async function dryRunRollout(which) {
    if (busy || !model) return;
    busy = true; planAnchor = "mvRollCard"; clearPlan(); seatPlan(); showPlan();
    try {
      const r = M.rolloutWants(which, model, rolloutCtx());
      if (!r.wants.length) { plan = null; planError(`Nothing to do: ${M.ROLLOUT[which].label.toLowerCase()} is already in place${r.skipped.length ? ". Left out: " + r.skipped.join(" · ") : ""}.`); return; }
      await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
      const fresh = await M.readFresh(r.policies, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
      const steps = [], unread = [];
      for (const x of r.wants) {
        const f = fresh.get(`${x.P.surface}|${lc(x.P.id)}`);
        if (!f) { if (!unread.includes(x.P.name)) unread.push(x.P.name); continue; }
        steps.push({ policy: f, action: x.action, group: { id: x.groupId, displayName: x.groupName }, filter: null, note: x.note });
      }
      const p = M.composePlan(steps);
      const regions = rollRegions ? [...rollRegions] : null;
      plan = Object.assign(p, {
        title: `${M.ROLLOUT[which].label}${regions ? ` (${regions.join(", ")})` : ""}`,
        head: { tool: "TUNO T28 MDE rollout", action: `rollout-${which}`, regions: regions || "all" },
        memberLine: "", unread, skipped: r.skipped, skippedTitle: "Left out, with the reason:",
      });
      renderPlan();
    } catch (e) { planError(GroupUse.shortErr(e, 300)); }
    finally { busy = false; }
  }
  function rolloutCard() {
    const regions = [...new Set(model.cfg.groups.filter((g) => g.role === "wave").map((g) => g.region))];
    const on = (r) => !rollRegions || rollRegions.has(r);
    const chips = regions.map((r) => fchip("data-mrroll-region", r, `${on(r) ? "✓ " : ""}${r}`, undefined, on(r))).join("");
    const ctx = rolloutCtx();
    const line = (which, n, what, hint) => {
      const r = M.rolloutWants(which, model, ctx);
      const count = r.wants.length ? `<b>${plural(r.wants.length, what)}</b> on ${plural(r.policies.length, "policy", "policies")}` : `<span class="muted">${r.skipped.length ? "nothing to plan" : "nothing to do — in place"}</span>`;
      return `<tr><td style="width:30px"><b>${n}</b></td>
        <td><b>${esc(M.ROLLOUT[which].label)}</b><div class="mini muted">${hint}</div></td>
        <td class="mini">${count}${r.skipped.length ? `<div style="color:var(--report)" title="${esc(r.skipped.join("\n"))}">${!r.wants.length && r.skipped.length === 1 ? esc(r.skipped[0]) : `${plural(r.skipped.length, "left out", "left out")} <span style="cursor:help">ⓘ</span>`}</div>` : ""}</td>
        <td style="text-align:right"><button class="btn" style="white-space:nowrap" data-mrroll="${which}"${r.wants.length ? "" : " disabled"}>Dry run →</button></td></tr>`;
    };
    const touched = new Set(M.rolloutWants("excludeWaves", model, ctx).policies.map((P) => P.key));
    const gaps = retire.filter((x) => x.verdict === "gap" && touched.has(x.O.key)).length;
    return `<div class="list-card" id="mvRollCard" style="margin-top:0;margin-bottom:12px">
      <h4 style="margin:0 0 4px">⚡ Rollout actions</h4>
      <p class="mini muted" style="margin:0 0 8px">One plan per step, over every new or colliding old policy at once — each through the same dry run, backup, confirm and read-back as a single fix, and each undoable from 📜. The device waves go to the <code>- D -</code> policies, the user waves to the <code>- U -</code> ones.</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 8px"><span class="mini muted">Regions:</span>${chips}${pilotTick()}</div>
      <table class="cg-table"><colgroup><col style="width:30px"><col><col style="width:24%"><col style="width:110px"></colgroup><tbody>
        ${line("includeWaves", "①", "include", `Every existing wave of the ticked regions into each new policy of its kind. Membership decides who moves, so the groups can all be in place before a wave is filled.${cfg.pilotGroupsOff ? " 🧪 With every wave in a new policy and out of its old ones, the pilot groups come off both." : ""}`)}
        ${line("excludeExclusion", "②", "exclusion", `${esc(model.cfg.exclusionDevice || "—")} from the <code>- D -</code> policies, ${esc(model.cfg.exclusionUser || "—")} from the <code>- U -</code> ones — whoever stays on the old set.`)}
        ${line("excludeWaves", "③", "change", `The ⚔️ pane's proposals, waves only: a wave leaves an old policy only where a new policy that sets the same settings includes it (or its twin), never ahead of it.${cfg.pilotGroupsOff ? " 🧪 Where that completes the swap, the pilot groups come off both sides." : ""}${gaps ? ` <span style="color:var(--off)">${plural(gaps, "of these old policies has", "of these old policies have")} a 🧹 gap — settings the new set does not carry; wave members lose them.</span>` : ""}`)}
      </tbody></table>
    </div>`;
  }

  // ---------------------------------------------------- 👥 wave members --
  // Layout A off the mockup (Mihai's pick, 10634): per wave, one row per
  // country — its user group, its Windows devices by primary user, its
  // INT-SG-D device group with the sync diff, and its place in the wave.
  const mcfg = () => cfg.members || MdeMembers.normConfig(null);
  function memWaves() {
    const out = new Map();
    const byRegion = new Map();
    for (const g of cfg.groups) if (g.role === "wave") {
      if (!byRegion.has(lc(g.region))) byRegion.set(lc(g.region), { user: null, device: null, userName: "", deviceName: "" });
      const w = byRegion.get(lc(g.region));
      const hit = found ? found.get(lc(g.name)) : null;
      if (g.audience === "user") { w.userName = g.name; w.user = hit || null; } else { w.deviceName = g.name; w.device = hit || null; }
    }
    for (const [k, v] of byRegion) out.set(k, v);
    return out;
  }
  function memCompute() { if (mem.input) mem.model = MdeMembers.compute(mcfg(), mem.input, memWaves()); }
  // 10682 (option B of the coverage round): how long the groups have gone
  // without a sync, on the rail — the countries with something to add or
  // remove, by the oldest sync this browser recorded for them
  function memStale() {
    if (!mem.model) return null;
    const todo = mem.model.rows.filter((r) => r.ug && (!r.inSync || r.ugNested === false || r.dgNested === false));
    if (!todo.length) return { label: "✓", bad: false, rows: [] };
    const synced = readJson(syncKey()), days = mcfg().syncStaleDays || 14, now = Date.now();
    const drift = todo.filter((r) => !r.inSync);
    const age = (r) => { const t = Date.parse(synced[r.key] || ""); return Number.isFinite(t) ? Math.floor((now - t) / 86400000) : null; };
    const stale = drift.filter((r) => { const a = age(r); return a === null || a >= days; });
    const synced0 = drift.map(age).filter((a) => a !== null);
    const oldest = synced0.length ? Math.max(...synced0) : null;
    const adds = drift.reduce((a, r) => a + r.add.length + (r.uAdd ? r.uAdd.length : 0), 0);
    const label = drift.length ? `${oldest === null ? "never synced" : `${oldest} d`} · ${adds.toLocaleString()} to add` : `${todo.length} to do`;
    return { label, bad: stale.length > 0, rows: stale.map((r) => ({ r, age: age(r) })) };
  }
  async function memRead() {
    if (mem.loading) return;
    mem.loading = true; clearPlan(); render();
    try {
      await Graph.ensureScopes([...new Set([...Graph.SCOPES.groups, ...Graph.SCOPES.devices, ...Graph.SCOPES.deviceObjects, ...Graph.SCOPES.directory, ...(mcfg().useDefenderLogons ? Graph.SCOPES.hunting : [])])]);
      const waves = [...memWaves().values()].flatMap((w) => [w.user, w.device]).filter(Boolean);
      mem.input = await MdeMembers.readInput(mcfg(), waves, (m) => { const el = $("mvMemProg"); if (el) el.textContent = m; }, new Set(cfg.lookup.map(lc)), exGroups().device, cfg.pilotGroups);
      // 🔄 / ↩ (10679): the static user groups and the Revert pair, read
      // with the country groups — a reverted device is held like an excluded one
      try {
        cs.extra = await MdeRevert.readExtra(mcfg(), MdeMembers.countryRows(mcfg()), (m) => { const el = $("mvMemProg"); if (el) el.textContent = m; });
        mem.input.reverted = new Set(cs.extra.revertDevices.keys());
        // 👥 plans the static user groups too (10680) — the same maps, shared,
        // so a run's patch moves both panes
        Object.assign(mem.input, { userGroups: cs.extra.userGroups, userMembers: cs.extra.userMembers, revertUsers: cs.extra.revertUsers });
        cs.error = "";
      } catch (e) { cs.extra = null; cs.error = `The static country groups and the Revert groups could not be read: ${GroupUse.shortErr(e, 240)}`; }
      memCompute();
      if (!mem.region && mem.model.regions.length) mem.region = mem.model.regions[0].region;
    } catch (e) {
      mem.model = null; mem.input = null; cs.extra = null;
      mem.error = GroupUse.shortErr(e, 300);
    } finally { mem.loading = false; render(); }
  }
  const memRowSel = (r) => mem.sel.has(r.key);
  function memCell(r) {
    const g = r.dg;
    if (!r.deviceGroupName) return `<span class="au-op delete" title="${esc(r.iso3Source)}">no device-group name</span><div class="mini muted">${esc(r.iso3Source)}</div>`;
    const name = `<b>${esc(r.deviceGroupName)}</b>`;
    if (!g) return `${name} ${chip("gu-how priv", "to create")}<div class="mini">${r.want.size ? `<span style="color:var(--on);font-weight:700">+${r.want.size}</span> to fill` : `<span class="muted">no devices to put in it</span>`}</div>`;
    const diff = r.inSync ? `<span class="muted">in sync · ${r.have.size} in</span>` : `${r.add.length ? `<span style="color:var(--on);font-weight:700">+${r.add.length}</span>` : ""}${r.add.length && r.remove.length ? " · " : ""}${r.remove.length ? `<span style="color:var(--off);font-weight:700" title="${esc(r.removeNames.join("\n"))}">−${r.remove.length}</span>` : ""} <span class="muted">· ${r.have.size} in</span>`;
    return `${name} ${chip("au-op create", "exists")}<div class="mini">${diff}</div>`;
  }
  // 👤 the static user group beside the device group (10680)
  function memUserCell(r) {
    if (!r.uRead) return `<span class="muted" title="${esc(cs.error || "")}">not read</span>`;
    if (!r.userGroupStatic) return `<span class="au-op delete" title="${esc(r.iso3Source)}">no code</span>`;
    const name = `<b>${esc(r.userGroupStatic)}</b>`;
    const held = r.uHeld ? ` <span class="muted" title="In ${esc(mcfg().revertUser)} — held back">· ${r.uHeld} held</span>` : "";
    if (r.batch && !r.batch.finished) return `${name} ${r.sug ? chip("au-op create", "exists") : chip("gu-how priv", "batch 1 creates it")}<div class="mini">🧪 filled by batches · <b>${r.batch.inCount}</b> of ${r.batch.N} in${held}</div>`;
    if (!r.sug) return `${name} ${chip("gu-how priv", "to create")}<div class="mini">${r.uWant.size ? `<span style="color:var(--on);font-weight:700">+${r.uWant.size}</span> to fill` : `<span class="muted">no users to put in it</span>`}${held}</div>`;
    const ok = !r.uAdd.length && !r.uRemove.length;
    const diff = ok ? `<span class="muted">in sync · ${r.uHave.size} in</span>` : `${r.uAdd.length ? `<span style="color:var(--on);font-weight:700">+${r.uAdd.length}</span>` : ""}${r.uAdd.length && r.uRemove.length ? " · " : ""}${r.uRemove.length ? `<span style="color:var(--off);font-weight:700">−${r.uRemove.length}</span>` : ""} <span class="muted">· ${r.uHave.size} in</span>`;
    return `${name} ${chip("au-op create", "exists")}<div class="mini">${diff}${held}</div>`;
  }
  function memNestCell(r) {
    const one = (icon, nested, wave, waveName, what) => {
      if (!wave) return `<div>${icon} <span class="muted" title="${esc(waveName)} does not exist — create it in 🌊">no wave group</span></div>`;
      if (nested) return `<div>${icon} ${chip("au-op create", `✓ ${what} wave`)}</div>`;
      if (nested === null) return `<div>${icon} <span class="muted">—</span></div>`;
      return `<div>${icon} ${chip("au-op other", "offer")}</div>`;
    };
    const userSide = r.batch && !r.batch.finished && r.wave.user
      ? `<div>👤 ${chip("gu-how priv", `🧪 ${r.batch.inCount} of ${r.batch.N} users`)} <span class="muted">${r.batch.next ? `batch ${r.batch.next.n} of ${r.batch.K} next` : "all in — finish"}</span></div>`
      : r.ugNestedSrc && !r.ugNestedStatic && r.wave.user
        ? `<div>👤 ${chip("au-op other", "✓ user wave · dynamic")} <a href="#" data-mrpane="countrysync" class="mini" title="${esc(r.ug.displayName)} is nested, not ${esc(r.userGroupStatic || "the static group")}">⇄ swap in 🔄</a></div>`
        : one("👤", r.ug ? (r.ugNested || (r.uRead && r.userGroupStatic && (r.sug || r.uWant.size) ? false : null)) : null, r.wave.user, r.wave.userName, "user");
    return userSide
      + one("🖥", r.dg ? r.dgNested : (r.deviceGroupName && r.want.size ? false : null), r.wave.device, r.wave.deviceName, "device");
  }
  // How the Windows devices found their country (10682): one line, each
  // source counted, the two logon steps marked when they were not read
  function memPlacedLine(m) {
    const P = m.placedBy || {}, R = m.logonRead || {}, C = mcfg();
    const step = (n, label, on, read) => `<span style="white-space:nowrap">${on === false ? `<s class="muted">${label}</s>` : read === false ? `<span style="color:var(--off)" title="not read — see Partly read above">${label} ✗</span>` : `${label} <b>${(n || 0).toLocaleString()}</b>`}</span>`;
    return `<p class="mini" style="margin:0 0 10px;display:flex;flex-wrap:wrap;gap:6px 14px" title="Each Windows device goes to the first step that places it: primary user, then the last logged-on user (Intune), then Defender logons (within ${C.logonDays} days, a person in a country group), then the Entra owner, then the code the name starts with. ⚙️ switches the logon steps.">
      <span class="muted">Devices placed by:</span>
      ${step((P.primary || 0) + (P.real || 0), "① primary user")}
      ${step(P.lastlogon, "② Intune last logon", C.useIntuneLogons, R.intune)}
      ${step(P.defender, "③ Defender logons", C.useDefenderLogons, R.defender)}
      ${step((P.owner || 0) + (P.location || 0), "④ Entra owner")}
      ${step((P.name || 0) + (P.userloc || 0), "⑤ name / location")}
      ${m.rows.some((r) => r.problems.check) ? `<span style="color:var(--report)">⚠ ${m.rows.reduce((a, r) => a + r.problems.check, 0)} where another country's user logs on — check the primary user</span>` : ""}
      ${C.useUsersDevices ? `<span title="A Windows device that is a user's (Entra owner or registered user, active in ${C.logonDays} days, or a logon) also goes into that user's country">+ ${(m.alsoCount || 0).toLocaleString()} as a user's other device</span>` : ""}
      ${m.skip && m.skip.size ? `<span>⊝ ${m.skip.size} unticked</span>` : ""}
      ${m.pinned && m.pinned.size ? `<span>📌 ${m.pinned.size} pinned</span>` : ""}</p>`;
  }
  function memDetail(r) {
    // 10683: a user's devices sit together, each with a tick — untick to keep
    // it out (⊝ the skip group); the primary user's own device cannot be
    const edits = mem.skipEdits || new Map();
    const inOn = (d) => (edits.has(d.objId) ? !edits.get(d.objId) : !d.skipped);
    const rows = r.devices.slice().sort((a, b) => (!a.objId) - (!b.objId) || lc(a.upn).localeCompare(lc(b.upn)) || a.name.localeCompare(b.name)).slice(0, 200).map((d) => {
      const wb = r.batch && !r.batch.finished && d.objId && !d.held && !r.want.has(d.objId) ? r.batch.batches.find((b) => b.users.some((u) => u.id === d.userId)) : null;
      const st = !d.objId ? chip("au-op delete", d.problem) : wb ? `<span class="muted">🧪 waits for batch ${wb.n}</span>` : d.held ? `${chip("gu-how priv", "⊘ excluded")} <span class="muted">${r.have.has(d.objId) ? "take out — stays on the old set" : "kept out — on the old set"}</span>` : r.have.has(d.objId) ? `<span class="muted">in group</span>` : `<b style="color:var(--on)">add</b>`;
      // 10655: a device with no primary user says what placed it
      // 10659: a primary user outside the country groups — the deleted one's
      // live account, else the device's name, else the user's usage location
      const who = !d.via || d.via === "primary" ? esc(d.upn)
        : d.outside ? `${esc(d.upn)}${d.deletedUser ? ` ${chip("gu-how priv", "deleted primary user")}` : ""} · ${chip("gu-how", d.via === "real" ? "live account in this country group" : d.via === "userloc" ? `by usage location ${d.usageLocation}` : `by name ${String(d.name).slice(0, 3).toUpperCase()}`)}`
        : d.via === "also" ? `${esc(d.upn)} · ${chip("gu-how", `their device too · ${(d.also || []).map((v) => v === "entra" ? "Entra" : v === "logon" ? "Intune logon" : "Defender").join(" + ")}${d.logon && d.logon.at ? ` · ${ago(d.logon.at)}` : ""}`)}${d.logon && d.logon.primary ? `<div class="muted">primary user ${esc(d.logon.primary)}</div>` : ""}`
        : d.via === "lastlogon" || d.via === "defender" ? `${esc(d.upn)} · ${chip("gu-how", d.via === "lastlogon" ? `by last logon${d.logon && d.logon.at ? ` · ${ago(d.logon.at)}` : ""}` : `by Defender logons${d.logon && d.logon.n ? ` · ${d.logon.n}×` : ""}`)}${d.logon && d.logon.primary ? `<div class="muted">primary user ${esc(d.logon.primary)} — in no country</div>` : ""}`
        : `<span class="muted">none</span> · ${chip("gu-how", d.via === "owner" ? `by Entra owner ${d.owner}` : d.via === "location" ? `by ${d.owner}'s usage location` : `by name ${String(d.name).slice(0, 3).toUpperCase()}`)}`;
      const extra = `${d.check ? `<div style="color:var(--report)">⚠ ${esc(d.check.upn)} (${esc(d.check.country)}) logs on here — check the primary user</div>` : ""}${d.pinned ? `<div>${chip("gu-how priv", "📌 pinned")}</div>` : ""}`;
      const lockIn = !d.objId || d.via === "primary" || d.via === "real";
      const tickIn = `<input type="checkbox" data-mrskip="${esc(d.objId || "")}"${inOn(d) ? " checked" : ""}${lockIn ? " disabled" : ""} title="${lockIn ? (d.objId ? "its Intune primary user places it here — change the primary user in Intune to move it" : "no Entra object") : "untick to keep this device out of every country group (⊝ skip)"}" aria-label="include ${esc(d.name)}">`;
      return `<tr class="${inOn(d) ? "" : "mr-exdis"}"><td>${tickIn}</td><td>${esc(d.name)}${d.nameSays ? `<div class="mini" style="color:var(--report)">the name says ${esc(d.nameSays)}</div>` : ""}${!inOn(d) ? `<div class="mini muted">⊝ unticked${edits.has(d.objId) ? " (pending)" : ""}</div>` : ""}</td><td class="mini">${who}${extra}</td><td class="mini">${d.lastSync ? esc(new Date(d.lastSync).toLocaleDateString()) : "—"}${d.stale ? ` ${chip("gu-how priv", `stale > ${mcfg().staleDays} d`)}` : ""}</td><td class="mini">${st}${d.others.length ? `<div style="color:${d.pilotOverlap || d.shared ? "var(--muted)" : "var(--report)"}">also in ${esc(d.others.join(", "))}${d.pilotOverlap ? " — pilot overlap, expected" : d.shared ? " — a user's device there too" : ""}</div>` : ""}</td></tr>`;
    }).join("");
    const rem = r.remove.length ? `<p class="mini" style="margin:8px 0 0;color:var(--off)">In ${esc(r.deviceGroupName)} but the primary user is no longer in ${esc(r.userGroupName)} (${r.remove.length}): ${esc(r.removeNames.slice(0, 12).join(", "))}${r.remove.length > 12 ? " …" : ""} — removed only with “apply removals” ticked.</p>` : "";
    return `<tr><td colspan="7" style="padding:0 8px 8px 36px">${r.pilot ? batchPanel(r) : ""}<div class="mr-detail">
      <b>${esc(r.country)} — ${plural(r.devices.length, "Windows device")}</b> · ${plural(r.usersNoDevice, "user")} without one${r.problems.noEntra ? ` · <span style="color:var(--off)">${r.problems.noEntra} without an Entra object (cannot be a member)</span>` : ""}${r.problems.stale ? ` · ${r.problems.stale} stale` : ""}${r.problems.multi ? ` · <span style="color:var(--report)">${r.problems.multi} also in another country group</span>` : ""}${r.problems.pilot ? ` · <span class="muted">${r.problems.pilot} also in ${r.pilot ? "its country group" : "the pilot"} (expected)</span>` : ""}${r.problems.held ? ` · <span class="muted">${r.problems.held} in the device exclusion group — kept out, on the old set</span>` : ""}${r.problems.byOwner || r.problems.byName - r.problems.byOutside > 0 ? ` · <span class="muted">no primary user: ${[r.problems.byOwner ? `${r.problems.byOwner} by Entra owner` : "", r.problems.byName - r.problems.byOutside > 0 ? `${r.problems.byName - r.problems.byOutside} by name` : ""].filter(Boolean).join(", ")}</span>` : ""}${r.problems.byReal || r.problems.byOutside ? ` · <span class="muted">primary user outside the country groups: ${[r.problems.byReal ? `${r.problems.byReal} by the deleted user's live account` : "", r.problems.byOutside ? `${r.problems.byOutside} by name or usage location` : ""].filter(Boolean).join(", ")}</span>` : ""}${r.problems.nameOther ? ` · <span style="color:var(--report)">${r.problems.nameOther} named for another country — the user decides</span>` : ""}
      ${r.devices.length ? `<div style="overflow-x:auto;margin-top:6px"><table class="cg-table"><thead><tr><th title="Ticked: in this country's device group">In</th><th>Device</th><th>User</th><th>Last sync</th><th>Plan</th></tr></thead><tbody>${rows}</tbody></table></div>${edits.size ? `<div class="mr-mbar" style="margin-top:8px"><span>⊝ ${[...edits.values()].filter(Boolean).length} to untick · ${[...edits.values()].filter((v) => !v).length} to tick again</span><button class="btn primary" data-mrskipdry="1">② Dry run</button></div>` : ""}${r.devices.length > 200 ? `<p class="mini muted" style="margin:4px 0 0">First 200 of ${r.devices.length} — ⭳ CSV has them all.</p>` : ""}` : ""}
      ${rem}${r.notes.length ? `<p class="mini" style="margin:6px 0 0;color:var(--report)">${r.notes.map(esc).join("<br>")}</p>` : ""}
    </div></td></tr>`;
  }
  // 🧪 A pilot in batches (10640, option A off the mockup): its users go
  // straight into the user wave a batch at a time, its device group follows
  // them, and Finish nests the group. The plan opens under this panel.
  const upnShort = (u) => String(u.upn || u.id).split("@")[0];
  function batchPanel(r) {
    if (r.migrated) return `<div class="mr-batch" id="mvBatch-${esc(r.key)}"><b>🧪 Migrated into ${esc(r.parentCountry || "its country")}</b><p class="mini muted" style="margin:4px 0 0">Its users and devices are in the wave through ${esc(r.parentCountry || "their country")}. ${r.dg ? `<code>${esc(r.dg.displayName)}</code> is left in place, out of the wave. ` : ""}An undo of that run in 📜 puts the pilot back in its batches.</p></div>`;
    const on = !!r.batch;
    const toggle = `<label class="chk" style="margin:0"><input type="checkbox" data-mrbatchtoggle="${esc(r.suffix)}"${on ? " checked" : ""}${r.batch && r.batch.finished ? " disabled" : ""}> add this pilot in ${mcfg().batchCount} batches</label>`;
    if (!on) return `<div class="mr-batch" id="mvBatch-${esc(r.key)}"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><b>🧪 Pilot</b>${toggle}<span class="mini muted">Off: the whole group goes into the wave at once (nest user group).</span></div></div>`;
    const b = r.batch;
    const pct = b.N ? Math.round(100 * b.inCount / b.N) : 100;
    const stateChip = (x) => x.state === "in" ? chip("au-op create", "in") : x.state === "next" ? chip("gu-how priv", x.inHere ? `next · ${x.inHere} of ${x.size} in` : "next") : x.state === "empty" ? `<span class="muted">—</span>` : `<span class="muted">waiting</span>`;
    const rows = b.batches.map((x) => `<tr${x.state === "next" ? ` class="mr-selrow"` : ""}><td><b>${x.n}</b></td>
      <td>${x.size}${x.users.length ? ` <span class="muted">${esc(upnShort(x.users[0]))}${x.users.length > 1 ? ` … ${esc(upnShort(x.users[x.users.length - 1]))}` : ""}</span>` : ""}</td>
      <td>${x.devices.length}${x.devices.some((d) => !d.objId || d.held) ? ` <span class="muted" title="${esc(x.devices.filter((d) => !d.objId || d.held).map((d) => `${d.name}: ${d.held ? "excluded" : d.problem}`).join("\n"))}">(${x.devices.filter((d) => !d.objId || d.held).length} left out)</span>` : ""}</td>
      <td>${stateChip(x)}</td>
      <td style="text-align:right">${x.state === "next" ? `<button class="btn primary" data-mrbatch="${esc(r.key)}"${busy || !r.wave.user ? " disabled" : ""}>Batch ${x.n} → dry run</button>` : ""}</td></tr>`).join("");
    const allIn = !b.next;
    return `<div class="mr-batch" id="mvBatch-${esc(r.key)}">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between"><b>🧪 Pilot in ${b.K} batches</b>${toggle}</div>
      ${b.finished ? `<p class="mini" style="margin:6px 0 0">${chip("au-op create", "finished")} ${esc(r.ugNestedStatic ? r.userGroupStatic : r.userGroupName)} is nested in ${esc(r.wave.userName)} — new users come in with the 🔄 sync.</p>` : `
      <p class="mini muted" style="margin:4px 0 8px">Each batch is an even part of the users not yet in the wave, sorted by UPN, and each user's Windows devices go with them. The next batch is cut from whoever is still left, so users who join or leave the group in between are counted in. The users go into <code>${esc(r.userGroupStatic || "the static user group")}</code> (created on batch 1 and nested in <code>${esc(r.wave.userName || "the user wave")}</code>) — never straight into the wave; <code>${esc(r.deviceGroupName || "the device group")}</code> holds only the devices of users already in.${b.direct.length ? ` ${plural(b.direct.length, "user")} put in directly by an earlier build move into the static group with the next batch.` : ""}</p>
      <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-end;margin-bottom:6px"><div><div class="mini muted">Progress</div><b>${b.inCount} of ${b.N} users</b> <span class="mini muted">· ${b.batches.filter((x) => x.state === "in").length} of ${b.batches.filter((x) => x.size).length} batches</span><div class="mr-meter"><i style="width:${pct}%"></i></div></div>
        ${b.inOther ? `<div class="mini muted">${plural(b.inOther, "user is", "users are")} in the wave already through ${esc(b.viaNames.join(", ") || "another group")} — not in the batches</div>` : ""}</div>
      ${b.N ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:56px"><col><col style="width:18%"><col style="width:18%"><col style="width:170px"></colgroup><thead><tr><th>Batch</th><th>Users</th><th>Devices</th><th>State</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">No user of this group is left to batch.</p>`}
      ${r.parentKey && r.outsideParent && r.outsideParent.length ? `<div class="mr-migrate"><span class="mini" style="color:var(--report)">🧪 Not migratable into ${esc(r.parentCountry)}: ${plural(r.outsideParent.length, "user of the pilot is", "users of the pilot are")} not in ${esc(r.parentCountry)} (${esc(r.outsideParent.slice(0, 3).join(", "))}${r.outsideParent.length > 3 ? " …" : ""}) — they would leave the wave.</span></div>` : ""}
      ${r.parentKey && !(r.outsideParent && r.outsideParent.length) ? `<div class="mr-migrate"><button class="btn" data-mrmigrate="${esc(r.key)}"${busy || !r.wave.user ? " disabled" : ""}>🧪 Migrate to the wave with ${esc(r.parentCountry)} →</button><span class="mini muted">${esc(r.parentCountry)} goes live and the pilot ends: everyone in ${esc(r.country)} comes in through ${esc(r.parentCountry)}${b.N - b.inCount > 0 ? ` (${b.N - b.inCount} not in a batch yet, at once)` : ""}; the users put in directly come out${r.dgNested ? ` and ${esc(r.deviceGroupName)} leaves the device wave` : ""}, each once ${esc(r.parentCountry)}'s step is read back.</span></div>` : ""}
      <div class="tb-actions" style="margin-top:8px"><button class="btn" data-mrbatchcsv="${esc(r.key)}">⭳ CSV of the batches</button>
        ${allIn ? `<button class="btn primary" data-mrbatchfin="${esc(r.key)}"${busy || !r.wave.user ? " disabled" : ""}>🧪 Finish →</button><span class="mini muted">puts everyone left in ${esc(r.userGroupStatic || "the static user group")}, nests it if needed, and takes the users put in directly out once it read back</span>` : `<span class="mini muted">The last batch finishes the pilot: everyone is in ${esc(r.userGroupStatic || "the static user group")}.</span>`}</div>`}
    </div>`;
  }
  // 🧪 (10656, option B off the mockup) the pilot's own button: its country
  // goes live (as ticked in the table with every step on) and the pilot is
  // migrated in the same plan. The plan opens under the panel.
  function migrateDryRun(key) {
    if (busy || !mem.model) return;
    const c = mem.model.rows.find((x) => x.key === key);
    if (!c || !c.parentKey) return;
    planAnchor = `mvBatch-${key}`; clearPlan(); seatPlan();
    const par = mem.model.rows.find((x) => x.key === c.parentKey);
    const p = MdeMembers.planOps(mem.model, new Set([c.parentKey]), { fill: true, nestUsers: true, nestDevices: true, removals: false }, mcfg());
    plan = Object.assign(p, { members: true, title: `${par ? par.country : "Its country"} goes live · 🧪 ${c.country} migrated to the wave` });
    renderMemPlan();
  }
  function batchDryRun(key, finish) {
    if (busy || !mem.model) return;
    planAnchor = `mvBatch-${key}`; clearPlan(); seatPlan();
    const r = mem.model.rows.find((x) => x.key === key);
    const p = finish ? MdeMembers.planFinish(mem.model, key, mcfg()) : MdeMembers.planBatch(mem.model, key, mcfg());
    plan = Object.assign(p, { members: true, title: finish ? `Pilot ${r ? r.country : key} — finish` : `Pilot ${r ? r.country : key} — batch ${p.batch || ""} of ${mcfg().batchCount}` });
    renderMemPlan();
  }
  // 🕳 Left out (10642, layout A off the mockup): who and what the waves
  // do not reach — per wave for a country's users and devices, tenant-wide
  // for the Windows devices no country holds.
  function leftCounts(m) {
    const L = m.leftOut, R = mem.region || (m.regions[0] && m.regions[0].region);
    const inR = (x) => x.region === R;
    const users = new Set(L.users.filter(inR).map((u) => u.id)).size;
    const noEntra = L.noEntra.filter(inR).length, held = L.held.filter(inR).length;
    // 10645 (Mihai: "keep the list, don't count it"): MDE here is Windows,
    // so Left out counts Windows devices only. The users with no Windows
    // device stay listed — they are in the user wave through their country
    // group, and a Windows device they get later is picked up by the sync.
    return { R, users, noEntra, held, noCountry: L.noCountry.length, noPrimary: L.noPrimary.length, total: noEntra + held + L.noCountry.length + L.noPrimary.length };
  }
  const osHas = (h) => { const e = Object.entries(h || {}); return e.length ? e.map(([os, n]) => chip("gu-how", `${os} ${n}`)).join(" ") : chip("gu-how priv", "nothing in Intune"); };
  const LEFT_WHY = {
    noCountry: { label: "primary user in no country group of the table", tile: "Windows devices whose primary user is in no country group of the table" },
    noPrimary: { label: "no primary user, owner or country code", tile: "Windows devices with no primary user, no Entra owner in a country and no country code in the name" },
    noEntra: { label: "no Entra object", tile: "no Entra object — they cannot be group members" },
    held: { label: "⊘ excluded — stays on the old set", tile: "in the device exclusion group — on the old set" },
  };
  function leftOutHtml(m, lo) {
    const L = m.leftOut, R = lo.R, CAP = 300;
    const tile = (key, n, label, on) => `<button type="button" class="mr-tile mr-lotile${on ? " on" : ""}" data-mrmemleftwhy="${key}"><b>${n.toLocaleString()}</b><span>${esc(label)}</span></button>`;
    const users = L.users.filter((u) => u.region === R && (!mem.leftCountry || u.rowKey === mem.leftCountry));
    const countries = [...new Map(L.users.filter((u) => u.region === R).map((u) => [u.rowKey, u.country])).entries()]
      .map(([k, c]) => ({ k, c, n: L.users.filter((u) => u.region === R && u.rowKey === k).length })).sort((a, b) => b.n - a.n);
    const cchips = countries.length > 1 ? `<div class="toolbar mr-lobar">${fchip("data-mrmemleftrow", "", `All · ${lo.users.toLocaleString()}`, undefined, !mem.leftCountry)}${countries.map((x) => fchip("data-mrmemleftrow", x.k, `${x.c} · ${x.n.toLocaleString()}`, undefined, mem.leftCountry === x.k)).join("")}</div>` : "";
    const cgName = (k) => { const r = m.rows.find((x) => x.key === k); return r ? r.userGroupName : ""; };
    // "the users still need to be in the right groups" / "if they get a
    // Windows device later, it should be added" (10645): say where the user
    // stands, and what happens to a device they get
    const rowOf = new Map(m.rows.map((r) => [r.key, r]));
    const standing = (u) => {
      const r = rowOf.get(u.rowKey);
      if (!r) return "";
      const wn = r.wave && r.wave.userName ? r.wave.userName : "the user wave";
      const inWave = r.ugNested || (r.batch && r.batch.inWave && r.batch.inWave.has(u.id));
      const now = inWave ? `<span style="color:var(--on)">✓ in <code>${esc(wn)}</code></span> through ${esc(r.userGroupName)}`
        : r.batch ? `⏳ pilot batch — not in <code>${esc(wn)}</code> yet (🧪 batches)` : `<span style="color:var(--off)">✗ not in <code>${esc(wn)}</code> yet</span> — nest ${esc(r.userGroupName)} (👥 countries)`;
      const later = r.deviceGroupName ? `<div class="muted">a Windows device they get joins <code>${esc(r.deviceGroupName)}</code> at the next 👥 read → Apply</div>` : "";
      return now + later;
    };
    // 🔎 Defender logons (10648): a column once any user in view was looked up
    const showLog = users.some((u) => mem.looked.has(u.id));
    const LOGCOL = { intune: "var(--on)", entra: "var(--report)", defender: "var(--off)", avd: "var(--muted)" };
    const logCell = (u) => {
      if (!mem.looked.has(u.id)) return `<span class="muted">not looked up</span>`;
      const l = mem.logons.get(u.id) || [];
      if (!l.length) return `<span class="muted">no logon on a Defender device in 30 days — web or mobile only, or a device Defender does not see</span>`;
      // 10654: AVD (VDI in the name) is named, muted, marked out of scope
      const only = l.every((x) => x.outOfScope) ? `<div class="muted" style="margin-bottom:2px">only AVD — no device in scope</div>` : "";
      // 📌 (10682): a device with an Entra object can be pinned to the user's country
      const r = rowOf.get(u.rowKey);
      const pinBtn = (x) => !x.outOfScope && x.aad && (x.kind === "intune" || x.kind === "entra") && r && r.dg ? ` <button class="btn" data-mrpin="${esc(u.id)}|${esc(x.aad)}|${esc(x.device)}" title="Into ${esc(mcfg().pinnedDevice)} and ${esc(r.deviceGroupName)}; a sync keeps it there">📌 Pin to ${esc(r.deviceGroupName)}</button>` : "";
      return only + l.slice(0, 3).map((x) => `<div style="margin:2px 0${x.outOfScope ? ";opacity:.75" : ""}"><b>${esc(x.device)}</b> <span class="muted">· ${esc(ago(x.last))} · ${plural(x.logons, "logon")}</span>${pinBtn(x)}<div style="color:${LOGCOL[x.kind]}">${esc(x.what)}</div></div>`).join("") + (l.length > 3 ? `<div class="muted">+ ${l.length - 3} more — in the CSV</div>` : "");
    };
    const urows = users.slice(0, CAP).map((u) => `<tr><td>${esc(u.upn)}</td><td class="mini">${esc(u.country)}</td><td class="mini">${osHas(u.has)}</td>${showLog ? `<td class="mini">${logCell(u)}</td>` : ""}<td class="mini">${standing(u)}</td></tr>`).join("");
    const logBar = users.length ? `<div class="toolbar" style="margin:4px 0 6px">
        <button class="btn" data-mrlogons="1"${mem.logBusy ? " disabled" : ""} title="One Defender advanced-hunting query for these users: the devices they logged on to (interactive, RDP, unlock) in the last 30 days. Needs ThreatHunting.Read.All and Security Reader (or a Defender role with advanced hunting).">🔎 Find their logons in Defender (30 days) · ${plural(users.length, "user")}</button>
        <button class="btn" data-mrlogonkql="1" title="The same query, to run in the Defender portal (Hunting → Advanced hunting)">⧉ Copy the KQL</button>
        <span class="mini muted" id="mvLogProg">${esc(mem.logBusy)}</span>
      </div>${mem.logError ? `<div class="gu-fail" style="margin-bottom:8px"><b>${esc(mem.logError)}</b></div>` : ""}` : "";
    const why = mem.leftReason;
    const devs = [].concat(
      (!why || why === "noEntra") ? L.noEntra.filter((d) => d.region === R).map((d) => Object.assign({ k: "noEntra" }, d)) : [],
      (!why || why === "held") ? L.held.filter((d) => d.region === R).map((d) => Object.assign({ k: "held" }, d)) : [],
      (!why || why === "noCountry") ? L.noCountry.map((d) => Object.assign({ k: "noCountry" }, d)) : [],
      (!why || why === "noPrimary") ? L.noPrimary.map((d) => Object.assign({ k: "noPrimary" }, d)) : []);
    const whyChip = (d) => d.k === "held" ? chip("gu-how", LEFT_WHY.held.label) : d.k === "noEntra" ? chip("au-op delete", d.why || LEFT_WHY.noEntra.label) : chip("gu-how priv", LEFT_WHY[d.k].label);
    const drows = devs.slice(0, CAP).map((d) => `<tr><td><b>${esc(d.name)}</b>${d.country ? `<div class="mini muted">${esc(d.country)}</div>` : ""}</td><td class="mini">${esc(d.upn || "—")}${d.deleted ? ` ${chip("gu-how priv", "deleted primary user")}` : ""}</td><td class="mini">${whyChip(d)}${d.detail ? `<div class="muted" style="margin-top:2px">${esc(d.detail)}</div>` : ""}</td><td class="mini">${d.lastSync ? esc(new Date(d.lastSync).toLocaleDateString()) : "—"}${d.stale ? ` ${chip("gu-how priv", "stale")}` : ""}</td></tr>`).join("");
    return `<div class="list-card" style="margin-top:0">
      <p class="mini muted" style="margin:0 0 8px">Windows devices the waves do not reach, with the reason — that is the count. The users and a country's devices are for 🌊 <b>${esc(R)}</b>; the devices no country holds are for the whole tenant. The users with no Windows device are listed, not counted: they are in the user wave through their country group, and a Windows device they get later joins its country device group at the next 👥 read → Apply. <a href="#" data-mrmemleft="1">← back to the countries</a></p>
      <div class="mr-tiles">
        ${tile("users", lo.users, `users with no Windows device — not counted (they are in the user wave)`, !mem.leftReason)}
        ${tile("noCountry", lo.noCountry, LEFT_WHY.noCountry.tile, mem.leftReason === "noCountry")}
        ${tile("noPrimary", lo.noPrimary, LEFT_WHY.noPrimary.tile, mem.leftReason === "noPrimary")}
        ${tile("noEntra", lo.noEntra, LEFT_WHY.noEntra.tile, mem.leftReason === "noEntra")}
        ${lo.held ? tile("held", lo.held, LEFT_WHY.held.tile, mem.leftReason === "held") : ""}
      </div>
      <h4 style="margin:14px 0 6px">Users with no Windows device <span class="mini muted" style="font-weight:400">— by Intune primary user${mem.leftCountry ? ` · ${esc(cgName(mem.leftCountry))}` : ""}</span></h4>
      ${cchips}
      ${logBar}
      ${users.length ? `<div style="overflow-x:auto"><table class="cg-table"${showLog ? ' style="min-width:780px"' : ""}><colgroup>${showLog ? `<col style="width:20%"><col style="width:9%"><col style="width:14%"><col style="width:31%"><col>` : `<col style="width:32%"><col style="width:13%"><col style="width:27%"><col>`}</colgroup><thead><tr><th>User</th><th>Country</th><th style="white-space:normal">${showLog ? "Other devices" : "Their other devices"}</th>${showLog ? `<th style="white-space:normal">Logged on to · Defender, 30 days</th>` : ""}<th>Their groups</th></tr></thead><tbody>${urows}</tbody></table></div>${users.length > CAP ? `<p class="mini muted" style="margin:4px 0 0">First ${CAP} of ${users.length.toLocaleString()} — ⭳ CSV has them all.</p>` : ""}`
        : `<p class="mini muted" style="margin:0">Every user of ${mem.leftCountry ? "this country" : "this wave's countries"} has a Windows device.</p>`}
      <h4 style="margin:16px 0 6px">Windows devices no country device group will hold${why ? ` <span class="mini muted" style="font-weight:400">— ${esc(LEFT_WHY[why].label)} · <a href="#" data-mrmemleftwhy="all">show every reason</a></span>` : ""}</h4>
      ${devs.length ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:28%"><col style="width:28%"><col><col style="width:16%"></colgroup><thead><tr><th>Device</th><th>Primary user</th><th>Why</th><th>Last sync</th></tr></thead><tbody>${drows}</tbody></table></div>${devs.length > CAP ? `<p class="mini muted" style="margin:4px 0 0">First ${CAP} of ${devs.length.toLocaleString()} — ⭳ CSV has them all.</p>` : ""}`
        : `<p class="mini muted" style="margin:0">None.</p>`}
      <div class="tb-actions" style="margin-top:10px"><button class="btn" id="mvMemLeftCsv">⭳ CSV — left out, ${esc(R)}</button><span class="mini muted">Users and ${esc(R)}'s devices, plus the devices no country holds.</span></div>
      ${pinnedHtml(m)}
    </div>`;
  }
  // 📌 the pinned devices (10682): where each sits, unpin by tick
  function pinnedHtml(m) {
    const P = m.pinned || new Set();
    if (!P.size) return `<p class="mini muted" style="margin:12px 0 0">📌 No device is pinned. A device found by 🔎 for a user above can be pinned to the user's country device group; a sync keeps it there.</p>`;
    const where = new Map();
    for (const r of m.rows) for (const id of r.pinnedIn || []) where.set(id, (where.get(id) || []).concat(r.deviceGroupName));
    const ent = new Map(((mem.input && mem.input.entra) || []).map((e) => [lc(e.id), e]));
    const rows = [...P].map((id) => `<tr><td><input type="checkbox" data-mrunpin="${esc(id)}"${mem.unpin && mem.unpin.has(id) ? " checked" : ""} aria-label="unpin"></td><td class="mini"><b>${esc((ent.get(id) || {}).displayName || id)}</b></td><td class="mini">${(where.get(id) || []).map((n) => `<code>${esc(n)}</code>`).join(" ") || `<span class="muted">in no country device group</span>`}</td></tr>`).join("");
    const n = mem.unpin ? mem.unpin.size : 0;
    return `<h4 style="margin:16px 0 6px">📌 Pinned · ${P.size} <span class="mini muted" style="font-weight:400">— <code>${esc((m.pinnedGroup && m.pinnedGroup.name) || mcfg().pinnedDevice)}</code>, assigned to nothing</span></h4>
      <div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30px"><col style="width:40%"><col></colgroup><thead><tr><th></th><th>Device</th><th>In</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="tb-actions" style="margin-top:8px"><button class="btn" id="mvUnpinDry"${n ? "" : " disabled"}>Unpin ${plural(n, "device")} → dry run</button><span class="mini muted">Out of the pinned group; a 👥 run with “apply removals” then takes it out of the country group if no rule places it there.</span></div>`;
  }
  function skipDryRun() {
    if (busy || !mem.model || !mem.input || !mem.skipEdits || !mem.skipEdits.size) return;
    planAnchor = null; clearPlan(); seatPlan();
    const S = [...mem.skipEdits].filter(([, v]) => v).map(([k]) => k), I = [...mem.skipEdits].filter(([, v]) => !v).map(([k]) => k);
    const p = MdeMembers.planSkip(mem.model, mem.input, S, I, mcfg());
    plan = Object.assign(p, { members: true, title: `⊝ ${[S.length ? `untick ${plural(S.length, "device")}` : "", I.length ? `tick ${plural(I.length, "device")} again` : ""].filter(Boolean).join(" · ")}` });
    renderMemPlan();
  }
  function pinDryRun(userId, aad, name) {
    if (busy || !mem.model || !mem.input) return;
    planAnchor = null; clearPlan(); seatPlan();
    const p = MdeMembers.planPin(mem.model, mem.input, [{ userId, aad, name }], mcfg());
    plan = Object.assign(p, { members: true, title: `📌 Pin ${name}` });
    renderMemPlan();
  }
  function unpinDryRun() {
    if (busy || !mem.model || !mem.unpin || !mem.unpin.size) return;
    planAnchor = null; clearPlan(); seatPlan();
    const p = MdeMembers.planUnpin(mem.model, [...mem.unpin]);
    plan = Object.assign(p, { members: true, title: `📌 Unpin ${plural(mem.unpin.size, "device")}` });
    renderMemPlan();
  }
  // 🔎 the users in the Left out view as it stands: its wave, and the
  // country chip when one is on (all of them, not only the rows shown)
  function leftUsersInView() {
    const m = mem.model;
    if (!m) return [];
    const R = mem.region || (m.regions[0] && m.regions[0].region);
    return m.leftOut.users.filter((u) => u.region === R && (!mem.leftCountry || u.rowKey === mem.leftCountry));
  }
  async function lookupLogons() {
    const users = leftUsersInView();
    if (!users.length || mem.logBusy) return;
    mem.logError = ""; mem.logBusy = "Asking Defender…"; render();
    try {
      await Graph.ensureScopes(Graph.SCOPES.hunting);
      const res = await MdeMembers.readLogons(users, (msg) => { mem.logBusy = msg; const el = $("mvLogProg"); if (el) el.textContent = msg; });
      const found = MdeMembers.logonsFor(mem.input, mem.model.rows, users, res);
      for (const [id, list] of found) { mem.logons.set(id, list); mem.looked.add(id); }
    } catch (e) {
      const denied = e && (e.status === 401 || e.status === 403 || /consent|Forbidden|Authorization|insufficient/i.test(String(e.message || e)));
      mem.logError = denied
        ? "Defender refused the query. It needs ThreatHunting.Read.All (admin consent) and, for the signed-in admin, Security Reader or a Defender role with advanced hunting. ⧉ Copy the KQL runs the same query in the Defender portal."
        : `The Defender query failed: ${GroupUse.shortErr(e, 240)}`;
    } finally { mem.logBusy = ""; render(); }
  }
  function copyLogonKql() {
    const users = leftUsersInView();
    if (!users.length) return;
    const q = MdeMembers.logonKql(users);
    const done = () => { const el = $("mvLogProg"); if (el) el.textContent = `Copied — the query for ${plural(users.length, "user")}; paste it into Defender → Hunting → Advanced hunting.`; };
    const fallback = () => { download(`MDE-logons-${mem.region || "all"}-${stamp()}.kql`, q, "text/plain"); const el = $("mvLogProg"); if (el) el.textContent = "Saved as a .kql file — the clipboard was not available."; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(q).then(done, fallback);
      else fallback();
    } catch { fallback(); }
  }

  // 🧪 PILOTS (10647; per person and "ready for the wave" since 10649, Mihai:
  // "select the user, and it then should be removed from the pilot groups
  // and the device should be moved to the right group. The user is then
  // ready for the wave"; option A off the mockup — back to their country,
  // they wait for the wave). One row per person: a pilot user, or the
  // Intune primary user of a pilot device, with every Windows device of
  // theirs. Tick a person whose country is known; the plan takes them and
  // their devices out of every pilot group and puts each device in its
  // country device group. Until the country is nested in its wave they are
  // ordinary members of it — the old policies reach them again.
  //
  // ⚠ Before the waves go live: where a new policy includes a pilot group
  // but not the wave, or an old policy excludes a pilot group but not the
  // wave (or its twin), the people of that wave will lose a new policy or
  // gain an old one WHEN THE WAVE GOES LIVE. Shown, per wave, so it is fixed
  // first (⚔️ / ⚡); it does not stop anyone from going back to their
  // country now. Keyed "pilot group id|wave id".
  function pilotBlocks(pm) {
    const out = new Map();
    if (!model || !pm) return out;
    const twins = M.twinIndex(model.cfg, found);
    const keys = new Set(pm.members.filter((x) => x.waveId).flatMap((x) => x.groups.map((g) => `${g.id}|${x.waveId}`)));
    for (const k of keys) {
      const [gid, wid] = k.split("|");
      const gn = (pm.groups.find((g) => g.id === gid) || {}).name || nameOf(gid);
      const wn = nameOf(wid);
      const why = [];
      for (const N of model.newP) if (N.reach.inc.has(gid) && !N.reach.tenantWide && !N.reach.inc.has(wid)) why.push(`${N.name} includes ${gn} but not ${wn}`);
      for (const O of model.oldP) if (O.reach.exc.has(gid)) {
        const t = twins.get(wid), tid = t && t.twinId ? lc(t.twinId) : null;
        if (!O.reach.exc.has(wid) && !(tid && O.reach.exc.has(tid))) why.push(`${O.name} excludes ${gn} but not ${wn}`);
      }
      if (why.length) out.set(k, why);
    }
    return out;
  }
  function pilotsHtml(m) {
    const pm = m.pilots;
    const people = pm.people || [], loose = pm.loose || [];
    for (const k of [...mem.pilSel]) if (!people.some((p) => p.key === k && p.state === "ready")) mem.pilSel.delete(k);
    const ready = people.filter((p) => p.state === "ready"), none = people.filter((p) => p.state !== "ready");
    const inWave = ready.filter((p) => p.ugNested && p.dgNested);
    const tile = (st, num, label) => `<button type="button" class="mr-tile mr-lotile${mem.pilState === st ? " on" : ""}" data-mrpilstate="${st || ""}"><b>${num.toLocaleString()}</b><span>${esc(label)}</span></button>`;
    const show = (p) => !mem.pilState || (mem.pilState === "ready" ? p.state === "ready" : mem.pilState === "none" ? p.state !== "ready" : mem.pilState === "loose" ? false : true);
    const shown = people.filter(show);
    const allBlocks = [...new Set([...pilotBlocks(pm).values()].flat())];
    const gnames = (list) => list.length ? list.map((g) => esc(g.name)).join("<br>") : `<span class="muted">not in a pilot group</span>`;
    const after = (p, d) => {
      if (p.state !== "ready") return "";
      if (!d) return p.userPilots.length ? `${chip("au-op update", "− out of the pilot")} <span class="muted">stays in ${esc(p.userGroupName)}</span>` : `<span class="muted">not in a pilot group — stays in ${esc(p.userGroupName)}</span>`;
      if (d.noEntra) return `<span class="muted">no Entra object — cannot be a member of any group</span>`;
      const out = d.pilots.length ? chip("au-op update", "− out of the pilot") + " " : "";
      if (d.held) return `${out}<span class="muted">⊘ kept on the old set — not added</span>`;
      if (d.inGroup) return `${out}<span class="muted">already in ${esc(p.deviceGroupName)}</span>`;
      return `${out}${chip("au-op create", `+ into ${p.deviceGroupName}`)}${p.dg ? "" : ` <span class="muted">(created first)</span>`}`;
    };
    const CAP = 300;
    const trs = shown.slice(0, CAP).map((p) => {
      const sel = mem.pilSel.has(p.key);
      const head = `<tr class="${sel ? "mr-selrow" : ""}"><td>${p.state === "ready" ? `<input type="checkbox" data-mrpilsel="${esc(p.key)}"${sel ? " checked" : ""} aria-label="select">` : `<span class="muted" title="${esc(p.why || "")}">—</span>`}</td>
        <td><b>${esc(p.upn)}</b><div class="mini muted">user${p.userPilots.length ? "" : " · not in a pilot group itself"}</div></td>
        <td class="mini">${gnames(p.userPilots)}</td>
        <td class="mini">${p.country ? `${esc(p.country)} → <code>${esc(p.waveUserName || "")}</code>${p.ugNested ? ` <span style="color:var(--on)">✓ nested</span>` : ` <span class="muted">not nested yet</span>`}` : `<span class="muted">—</span>`}</td>
        <td class="mini">${p.state === "ready" ? after(p, null) : `${chip("au-op delete", "✗ stays")} <span class="muted">${esc(p.why)}</span>`}</td></tr>`;
      const devs = p.devices.map((d) => `<tr class="${sel ? "mr-selrow" : ""}"><td></td>
        <td class="mini" style="padding-left:22px">↳ <b>${esc(d.name)}</b> <span class="muted">device</span></td>
        <td class="mini">${gnames(d.pilots)}</td>
        <td class="mini">${p.deviceGroupName ? `→ <code>${esc(p.deviceGroupName)}</code>${p.dgNested ? ` <span style="color:var(--on)">✓ nested</span>` : ""}` : ""}</td>
        <td class="mini">${after(p, d)}</td></tr>`).join("");
      return head + (devs || (p.state === "ready" ? `<tr><td></td><td class="mini muted" colspan="4" style="padding-left:22px">↳ no Windows device by Intune primary user</td></tr>` : ""));
    }).join("");
    const looseRows = (!mem.pilState || mem.pilState === "loose") && loose.length ? `<h4 style="margin:14px 0 6px">Pilot members with no person to follow <span class="mini muted" style="font-weight:400">— listed, never planned</span></h4>
      <div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30%"><col style="width:22%"><col></colgroup><thead><tr><th>Member</th><th>Pilot group</th><th>Why it stays</th></tr></thead><tbody>
      ${loose.map((x) => `<tr><td><b>${esc(x.name)}</b><div class="mini muted">${esc(x.kind)}</div></td><td class="mini">${x.groups.map((g) => esc(g.name)).join("<br>")}</td><td class="mini muted">${esc(x.why || "")}</td></tr>`).join("")}</tbody></table></div>` : "";
    const sel = people.filter((p) => mem.pilSel.has(p.key));
    const prev = sel.length ? MdeMembers.planPilotsReady(pm, sel.map((p) => p.key), mcfg()) : null;
    const nAdd = prev ? prev.ops.filter((o) => o.type === "add").reduce((a, o) => a + o.ids.length, 0) : 0;
    const nCreate = prev ? prev.ops.filter((o) => o.type === "create").length : 0;
    const selTxt = sel.length ? `→ out of the pilot${nAdd ? ` · ${plural(nAdd, "device")} into their country group` : ""}${nCreate ? ` · ${plural(nCreate, "device group")} created` : ""}` : "tick the people to make ready for their wave";
    const readyShown = shown.filter((p) => p.state === "ready");
    const allOn = readyShown.length && readyShown.every((p) => mem.pilSel.has(p.key));
    return `<div class="list-card mr-stickyhost" style="margin-top:0" id="mvPilCard">
      <p class="mini muted" style="margin:0 0 8px">One row per person in the pilot groups (⚙️: ${pm.groups.map((g) => `<code>${esc(g.name)}</code>`).join(" ") || "none found"}) — the user, and their Windows devices by Intune primary user. <b>Tick a person to make them ready for their wave</b>: out of every pilot group, and each device into its country device group. Until their country is nested in its wave they are ordinary members of it, so the <b>old policies reach them again</b>; when it is nested, they move with everybody else.${pm.missing.length ? ` <span style="color:var(--report)">Not in this tenant: ${pm.missing.map(esc).join(", ")}.</span>` : ""}</p>
      <div class="mr-tiles">
        ${tile(null, people.length, `people in the pilot · ${plural(people.reduce((a, p) => a + p.devices.filter((d) => d.pilots.length).length, 0), "device")} and ${plural(people.filter((p) => p.userPilots.length).length, "user")} in pilot groups`)}
        ${tile("ready", ready.length, `can be made ready — their country is known${inWave.length ? ` (${inWave.length} already in a live wave)` : ""}`)}
        ${tile("none", none.length, "✗ no country — they stay in the pilot")}
        ${loose.length ? tile("loose", loose.length, "members with no person: no primary user, not in Intune, a nested group") : ""}
      </div>
      ${allBlocks.length ? `<div class="mini" style="margin:6px 0 10px"><b>⚠ Before their waves go live:</b> <span style="color:var(--report)">${plural(allBlocks.length, "policy covers", "policies cover")} a pilot group but not the wave — fix it in ⚔️ or ⚡ before nesting the country, or those people lose a new policy or get an old one back:</span><div style="color:var(--report)">${allBlocks.slice(0, 6).map(esc).join("<br>")}${allBlocks.length > 6 ? `<br>… ${allBlocks.length - 6} more` : ""}</div></div>` : ""}
      ${mem.pilState === "loose" ? "" : shown.length ? `<div style="overflow-x:auto"><table class="cg-table" style="min-width:820px"><colgroup><col style="width:30px"><col style="width:28%"><col style="width:17%"><col style="width:22%"><col></colgroup>
        <thead><tr><th>${readyShown.length ? `<input type="checkbox" data-mrpilall="1"${allOn ? " checked" : ""} aria-label="select everybody whose country is known">` : ""}</th><th>Person · devices</th><th>Pilot groups</th><th>Country → wave</th><th>After the plan</th></tr></thead><tbody>${trs}</tbody></table></div>${shown.length > CAP ? `<p class="mini muted" style="margin:4px 0 0">First ${CAP} of ${shown.length.toLocaleString()}.</p>` : ""}`
        : `<p class="mini muted" style="margin:0">${people.length ? "Nobody in this state." : "The pilot groups have nobody to follow."}</p>`}
      ${looseRows}
      <div class="mr-mbar" id="mvPilBar">
        <b>${plural(sel.length, "person", "people")}</b>
        <span class="mini">${esc(selTxt)}</span>
        <button class="btn primary" id="mvPilDry"${sel.length ? "" : " disabled"}>② Dry run</button>
      </div>
      <p class="mini muted" style="margin:8px 0 0">Order: a missing country device group is created → the devices go into it (read back) → each device leaves its pilot group only once its add read back clean → the users leave theirs. Every run lands in 📜 with an undo that puts them back in the pilot and takes the devices out of the country group again.</p>
    </div>`;
  }
  function pilotDryRun() {
    if (busy || !mem.model || !mem.model.pilots) return;
    planAnchor = "mvPilBar"; clearPlan(); seatPlan();
    const pm = mem.model.pilots;
    const keys = (pm.people || []).filter((p) => mem.pilSel.has(p.key)).map((p) => p.key);
    const p = MdeMembers.planPilotsReady(pm, keys, mcfg());
    plan = Object.assign(p, { members: true, title: `Ready for the wave — ${plural(keys.length, "person", "people")}` });
    renderMemPlan();
  }

  function membersPane() {
    const intro = `<p class="mini muted" style="margin:0 0 10px">Per wave, per country, two <b>static</b> groups: <code>${esc(mcfg().userGroupPrefix)}&lt;ISO3&gt;</code> holding the users of <code>${esc(mcfg().countryPrefix)}…</code> as direct members goes into the user wave, and <code>${esc(mcfg().deviceGroupPrefix)}&lt;ISO3&gt;</code> holding the Windows devices whose <b>Intune primary user</b> is in that country group goes into the device wave. The dynamic country groups are never nested. Both are synced, not filled once: every read shows what to add and what to remove; whoever is in ↩ Revert is held back. The country table is under ⚙️ Naming rules.</p>`;
    if (mem.loading) return `<div class="list-card" style="margin-top:0">${intro}<p class="mini" id="mvMemProg">Reading…</p></div>`;
    if (!mem.model) return `<div class="list-card" style="margin-top:0">${intro}
      ${mem.error ? `<div class="gu-fail" style="margin-bottom:10px"><b>${esc(mem.error)}</b></div>` : ""}
      <div class="tb-actions"><button class="btn primary" id="mvMemRead">👥 Read the country groups and devices</button></div>
      <p class="mini muted" style="margin:8px 0 0">Reads the country groups and their users, every Windows device in Intune and in Entra, the ${esc(mcfg().deviceGroupPrefix)}* groups and what is nested in the waves. Read-only; a large tenant takes a minute.</p></div>`;
    const m = mem.model;
    const regionChip = (rg) => fchip("data-mrmemregion", rg.region, `🌊 ${rg.region} · ${rg.rows.length}`, undefined, !mem.unmapped && mem.region === rg.region);
    const lo = leftCounts(m);
    const chips = `<div class="toolbar">${m.regions.map(regionChip).join("")}<span style="width:1px;height:20px;background:var(--border);margin:0 4px"></span>${fchip("data-mrmemunmapped", "1", `⚠ Not in any wave · ${m.unmapped.length}`, undefined, mem.unmapped)}${fchip("data-mrmemleft", "1", `🕳 Left out · ${lo.total.toLocaleString()}`, undefined, mem.left && !mem.unmapped && !mem.pil)}${m.pilots ? fchip("data-mrpilview", "1", `🧪 Pilots · ${(m.pilots.people || []).length.toLocaleString()}`, undefined, mem.pil) : ""}<button class="btn" id="mvMemRead" style="margin-left:auto">↻ Read again</button><button class="btn" id="mvMemCsv">⭳ CSV</button></div>`;
    const top = `${m.failed.length ? `<div class="gu-fail" style="margin-bottom:10px"><b>Partly read:</b><span class="why">${m.failed.map(esc).join("<br>")}</span></div>` : ""}`;
    if (mem.pil && m.pilots) return `${chips}${top}${pilotsHtml(m)}`;
    if (mem.left && !mem.unmapped) return `${chips}${top}${leftOutHtml(m, lo)}`;
    if (mem.unmapped) {
      const suffixOf = (g) => g.displayName.slice(mcfg().countryPrefix.length);
      const regionOpts = m.regions.map((x) => `<option value="${esc(x.region)}">${esc(x.region)}</option>`).join("");
      const rows = m.unmapped.map((u, i) => `<tr><td><b>${esc(u.group.displayName)}</b><div class="mini muted">${esc(u.group.membershipRule || "")}</div></td><td class="mini">${u.dynamic ? "dynamic" : "assigned"}</td><td class="mini">${u.overlaps ? `<span style="color:var(--report)">overlaps ${esc(u.overlaps)} — as a pilot that is expected; otherwise nesting both counts people twice</span>` : `<span class="muted">not in the country table</span>`}</td>
        <td class="mini"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><select id="mvPilotRegion${i}" aria-label="wave">${regionOpts}</select><button class="btn" data-mrmempilot="${esc(suffixOf(u.group))}" data-mrpilotsel="mvPilotRegion${i}">🧪 Add as pilot</button></div><div class="muted" style="margin-top:3px">device group ${esc(mcfg().deviceGroupPrefix + MdeMembers.suggestDeviceSuffix(suffixOf(u.group)))}</div></td></tr>`).join("");
      return `${chips}${top}<div class="list-card" style="margin-top:0"><p class="mini muted" style="margin:0 0 10px">Groups starting with <code>${esc(mcfg().countryPrefix)}</code> that the country table does not name. They are listed, never nested. <b>🧪 Add as pilot</b> puts one at the head of a wave (its own device group, named below) — for a pilot that goes in before the rest of the region. The table stays editable under ⚙️ Naming rules.</p>
        ${rows ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:36%"><col style="width:9%"><col style="width:25%"><col></colgroup><thead><tr><th>Group · rule</th><th>Type</th><th>Why it is here</th><th>Put it in a wave</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">None — every group with the prefix is in a wave.</p>`}</div>`;
    }
    const rg = m.regions.find((x) => x.region === mem.region) || m.regions[0];
    if (!rg) return `${chips}<div class="list-card" style="margin-top:0"><p class="mini muted" style="margin:0">The country table is empty — fill it under ⚙️ Naming rules.</p></div>`;
    const inTenant = rg.rows.filter((r) => r.ug), absent = rg.rows.filter((r) => !r.ug);
    const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
    const meter = (label, name, a, b, extra) => `<div><div class="mini muted">${esc(name || label)}</div><b>${a} of ${b}</b> <span class="mini muted">${extra}</span><div class="mr-meter"><i style="width:${pct(a, b)}%"></i></div></div>`;
    const selectable = inTenant.filter((r) => !(r.inSync && r.ugNested && r.dgNested) && !r.migrated);
    const allOn = selectable.length && selectable.every(memRowSel);
    const rows = inTenant.map((r) => {
      const done = r.inSync && r.ugNested && r.dgNested;
      return `<tr class="${memRowSel(r) ? "mr-selrow" : ""}"><td>${r.migrated ? `<span title="Migrated into ${esc(r.parentCountry)} — in the wave through it">—</span>` : done ? `<span title="In sync and in both waves">✓</span>` : `<input type="checkbox" data-mrmemsel="${esc(r.key)}"${memRowSel(r) ? " checked" : ""} aria-label="select">`}</td>
        <td><a href="#" data-mrmemopen="${esc(r.key)}"><b>${esc(r.country)}</b></a>${r.pilot ? ` <span class="gu-how priv" title="A pilot group: it goes into the wave before the rest of the region. It may overlap a country group; its devices then sit in both device groups.">${r.migrated ? `🧪 migrated into ${esc(r.parentCountry)}` : `🧪 pilot${r.batch && !r.batch.finished ? " · in batches" : ""}`}</span>` : ""}${(() => { const kids = r.pilot ? [] : inTenant.filter((c) => c.pilot && c.parentKey === r.key && c.batch && !c.migrated && !(c.outsideParent || []).length); return kids.length ? ` <span class="gu-how" title="Going live brings every user of the pilot in through this group; the plan then takes the pilot's own route down">🧪 going live migrates ${esc(kids.map((c) => c.country).join(", "))}</span>` : ""; })()}<div class="mini muted">${esc(r.userGroupName)}</div></td>
        <td class="mini" style="text-align:right">${r.users.toLocaleString()}</td>
        <td class="mini" style="text-align:right">${r.devices.length.toLocaleString()}${r.usersNoDevice ? `<div class="muted"><a href="#" data-mrmemleftrow="${esc(r.key)}" title="🕳 who they are, and what Intune has for them">${plural(r.usersNoDevice, "user has", "users have")} none</a></div>` : ""}${r.problems.noEntra || r.problems.multi ? `<div style="color:var(--report)">${r.problems.noEntra + r.problems.multi} to look at</div>` : ""}</td>
        <td class="mini">${memUserCell(r)}</td>
        <td class="mini">${memCell(r)}</td>
        <td class="mini">${memNestCell(r)}</td></tr>${mem.open.has(r.key) ? memDetail(r) : ""}`;
    }).join("");
    const nSel = inTenant.filter(memRowSel).length;
    const o = mem.opts;
    const preview = MdeMembers.planOps(m, new Set(inTenant.filter(memRowSel).map((r) => r.key)), o, mcfg());
    const count = (t) => preview.ops.filter((x) => x.type === t);
    const adds = count("add").filter((x) => x.memberKind !== "user").reduce((a, x) => a + x.ids.length, 0);
    const uAdds = count("add").filter((x) => x.memberKind === "user").reduce((a, x) => a + x.ids.length, 0);
    const summary = nSel ? [count("create").length ? `create ${count("create").length}` : "", uAdds ? `add ${uAdds.toLocaleString()} user${uAdds === 1 ? "" : "s"}` : "", adds ? `add ${adds.toLocaleString()} device${adds === 1 ? "" : "s"}` : "", count("remove").length ? `remove ${count("remove").reduce((a, x) => a + x.ids.length, 0)}` : "", count("nest").length ? `nest ${count("nest").length} group${count("nest").length === 1 ? "" : "s"} into ${rg.region}` : ""].filter(Boolean).join(" · ") || "nothing to do for these" : "tick countries to plan";
    const tick = (id, key, label) => `<label class="chk" style="margin:0"><input type="checkbox" id="${id}" data-mrmemopt="${key}"${o[key] ? " checked" : ""}> ${label}</label>`;
    return `${chips}${top}<div class="list-card mr-stickyhost" style="margin-top:0">
      ${intro}
      <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end;margin-bottom:10px">
        ${meter("user wave", rg.wave.userName, rg.ugNested, inTenant.length, `country groups nested · ${rg.users.toLocaleString()} users`)}
        ${meter("device wave", rg.wave.deviceName, rg.dgNested, inTenant.length, `device groups nested · ${rg.devices.toLocaleString()} devices`)}
        <div class="mini muted" style="margin-left:auto">Read ${esc(new Date(m.readAt).toLocaleTimeString())} · Windows only · <a href="#" data-mrmemleftwhy="noPrimary">${m.noPrimary.toLocaleString()} of ${m.managedCount.toLocaleString()} in no country</a></div>
      </div>
      ${memPlacedLine(m)}
      ${(() => { const st = memStale(); return st && st.rows.length ? `<p class="mini" style="margin:0 0 10px;color:var(--report)">⏳ Not synced in ${mcfg().syncStaleDays} days and drifted: ${st.rows.slice(0, 8).map((x) => `${esc(x.r.country)} (${x.age === null ? "never" : `${x.age} d`})`).join(", ")}${st.rows.length > 8 ? ` +${st.rows.length - 8}` : ""} — tick them and ② Dry run.</p>` : ""; })()}
      ${inTenant.length ? `<div style="overflow-x:auto"><table class="cg-table mr-memtable"><colgroup><col style="width:30px"><col style="width:20%"><col style="width:7%"><col style="width:11%"><col style="width:20%"><col style="width:20%"><col></colgroup>
        <thead><tr><th><input type="checkbox" data-mrmemall="1"${allOn ? " checked" : ""} aria-label="select all in this wave"></th><th>Country · user group</th><th style="text-align:right">Users</th><th style="text-align:right">Win devices</th><th>User group · sync</th><th>Device group · sync</th><th>In the wave</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">None of this wave's country groups is in the tenant.</p>`}
      ${absent.length ? `<p class="mini muted" style="margin:8px 0 0">Not in this tenant: ${absent.map((r) => `<code>${esc(r.userGroupName)}</code>`).join(" ")}</p>` : ""}
      <div class="mr-mbar">
        <b>${plural(nSel, "country", "countries")}</b>
        ${tick("mvMemFill", "fill", "create &amp; fill groups")}
        ${tick("mvMemNestU", "nestUsers", "nest user groups")}
        ${tick("mvMemNestD", "nestDevices", "nest device groups")}
        ${tick("mvMemRem", "removals", "apply removals")}
        <span class="mini" id="mvMemSum">${esc(summary)}</span>
        <button class="btn primary" id="mvMemDry"${nSel ? "" : " disabled"}>② Dry run</button>
      </div>
      <p class="mini muted" style="margin:8px 0 0">Order per country: create → fill the device and user groups (20 per request, then read back) → remove (only when ticked) → nest the two static groups. A device group is nested only after it exists; a large nest is warned about (Microsoft Learn: “Don't make large group nesting changes all at once.”).</p>
    </div>`;
  }
  async function memDryRun(undoOf) {
    if (busy || (!mem.model && !(undoOf && undoOf.exclusions))) return;
    planAnchor = null; clearPlan(); seatPlan();
    let p;
    if (undoOf) p = MdeMembers.inverseOf(undoOf.done);
    else p = MdeMembers.planOps(mem.model, new Set(mem.model.rows.filter((r) => r.region === mem.region && mem.sel.has(r.key)).map((r) => r.key)), mem.opts, mcfg());
    plan = Object.assign(p, { members: true, runKind: undoOf ? (undoOf.runKind === "revert" ? "revert" : null) : p.runKind, exclusions: !!(undoOf && undoOf.exclusions), pilotsUndo: !!(undoOf && undoOf.pilots), unmigrate: undoOf && undoOf.migrate && undoOf.migrate.length ? undoOf.migrate : null,
      title: undoOf ? `Undo: ${undoOf.title}` : `Wave members — ${plural(new Set(p.ops.map((x) => x.key)).size, "country", "countries")}${p.migrate && p.migrate.length ? ` · 🧪 ${p.migrate.map((m) => m.country).join(", ")} migrated to the wave` : ""}` });
    renderMemPlan();
  }
  const OP_WORD = { create: "create group", add: "add devices", remove: "remove devices", nest: "nest", unnest: "take out", swapcheck: "check the sets" };
  const opWord = (x) => (x.type === "add" || x.type === "remove") && x.memberKind === "user" ? (x.type === "add" ? "add users" : "remove users") : OP_WORD[x.type];
  const opLabel = (x) => x.type === "create" ? `${x.name}` : x.type === "add" || x.type === "remove" ? `${x.group.name} · ${x.label}` : x.type === "swapcheck" ? `every user of ${x.source.name} is in ${x.target.name}, and it is in ${x.wave.name} — else ${x.source.name} stays` : `${x.child.name} → ${x.parent.name}`;
  function renderMemPlan() {
    v2Bind();
    const p = plan;
    const country = (x) => { if (x.who || p.exclusions || p.pilotsReady || p.pilotsUndo) return x.who || ""; const r = mem.model && mem.model.rows.find((y) => y.key === x.key); return r ? r.country : x.key; };
    const rows = p.ops.map((x) => `<tr><td class="mini">${esc(country(x))}</td><td>${chip(x.type === "remove" || x.type === "unnest" ? "au-op delete" : x.type === "create" ? "gu-how priv" : "au-op create", opWord(x))}</td><td class="mini">${esc(opLabel(x))}${x.type === "nest" && x.size ? ` <span class="muted">(${plural(x.size, x.kind === "user" ? "user" : "device")})</span>` : ""}</td></tr>`).join("");
    planEl().innerHTML = `<div class="list-card" style="margin-top:14px;padding:16px 18px">
      <h4 style="margin:0 0 6px">② Plan — ${esc(p.title)}</h4>
      <p class="mini" style="margin:0 0 8px"><b>${plural(p.ops.length, "step")}</b>, run in this order and each read back.</p>
      ${p.warnings.length ? `<div class="gu-fail" style="margin-bottom:8px;border-color:var(--report)"><b>Large or lasting changes:</b><span class="why">${p.warnings.map(esc).join("<br>")}${p.warnings.some((w) => /at once/.test(w)) ? "<br>Microsoft Learn: “Don't make large group nesting changes all at once.” Intune re-evaluates every member." : ""}</span></div>` : ""}
      ${p.skipped.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>Left out, with the reason:</b><span class="why">${p.skipped.map(esc).join("<br>")}</span></div>` : ""}
      ${rows ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:18%"><col style="width:16%"><col></colgroup><thead><tr><th>${p.exclusions || p.pilotsReady || p.pilotsUndo ? "Who" : "Country"}</th><th>Step</th><th>What</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">Nothing to write.</p>`}
      ${p.runKind === "revert" && p.reason ? `<p class="mini" style="margin:8px 0 0"><b>Reason:</b> “${esc(p.reason)}”</p>` : ""}
      <p class="mini muted" style="margin:8px 0 0">${p.runKind === "waveswap"
        ? "Likely impact: none — the static group holds the same users, so the wave's membership and every policy stay as they are. A country whose check finds a difference keeps its dynamic group and is said in the ledger. Way back: 📜 Undo re-nests the dynamic group and takes the static one out (a group this run created is left in place)."
        : p.runKind === "groupsync"
        ? "Likely impact: an added member gets the new MDE policies at its next Intune check-in (the old ones leave once ⚡③ excluded the wave); a removed one goes back to the old set. Reverted members stay out unless re-included with the confirm. Way back: 📜 Undo — the inverse of what was written."
        : p.runKind === "revert"
        ? "Likely impact: at the next Intune check-in the new MDE policies come off and the old ones apply — ASR sits at “not configured” until the old policy lands. A member leaves its country group only once it is in Revert (read back), so a sync never takes it back in by accident. Way back: ↩ Back into the wave under Reverted now, or 📜 Undo."
        : p.pilotsReady
        ? "Out of the pilot, these people are ordinary members of their country: until it is nested in its wave the new policies stop reaching them and the old ones reach them again; when it is nested they move with everybody else. A device leaves its pilot group only once its add to the country group read back clean. Every run lands in 📜 with an undo that puts them back in the pilot (a device group this run created is left in place, empty after the undo)."
        : p.exclusions
        ? "The exclusion groups are excluded from the new policies (⚡②): a member added here stops receiving them. A device taken out of its country device group leaves the wave, so the old policies reach it again. Every run lands in 📜 with an exact undo."
        : `Nesting links a group into a wave: its members start receiving what the wave is assigned (and, once ⚡③ ran, leave the old policies). Every run lands in 📜 with an exact undo.${p.migrate && p.migrate.length ? ` 🧪 ${p.migrate.map((m) => `${m.country} is migrated into ${m.into}`).join("; ")}: its users come in through ${p.migrate.map((m) => m.into).join(", ")}, and each step that takes the pilot's own route down waits until the step it depends on read back clean. Once they all did, the pilot is listed as migrated; the undo puts it back in its batches.` : ""}${p.unmigrate ? " 🧪 Once every step reads back clean, the pilot is back in its batches." : ""}`}</p>
      ${p.ops.length ? `<div style="margin-top:12px">
        ${p.hasRemoval ? `<label class="wi-f" style="margin-top:8px"><span>This plan REMOVES members or takes groups out of a wave — type <b>REMOVE</b> to allow it</span><input id="mvConfirmText" placeholder="REMOVE" autocomplete="off" spellcheck="false"></label>`
          : `<label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="mvConfirmTick"> I have read the plan — ${plural(p.ops.length, "step")}</label>`}
        <div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="mvMemApply" disabled>④ Apply — write to the tenant</button><button class="btn" id="mvDiscard">Discard the plan</button></div>
      </div>` : `<div class="tb-actions" style="margin-top:10px"><button class="btn" id="mvDiscard">Close</button></div>`}
      <div id="mvLedger"></div>
    </div>`;
    const ok = () => gateOk();
    const upd = () => { const b = $("mvMemApply"); if (b) b.disabled = !ok(); };
    if ($("mvConfirmText")) $("mvConfirmText").addEventListener("input", upd);
    if ($("mvConfirmTick")) $("mvConfirmTick").addEventListener("change", upd);
    if ($("mvMemApply")) $("mvMemApply").addEventListener("click", () => { if (ok()) applyMem(); });
    $("mvDiscard").addEventListener("click", clearPlan);
    v2AttachGate();
    showPlan();
  }
  async function applyMem() {
    if (busy || !plan || !plan.members || !gateOk()) return;
    busy = true;
    const p = plan;
    try {
      await Graph.ensureScopes(GroupMigrate.SCOPES.groupWrite);
      if (!v2MemberBackup || !await T28V2Safety.unchanged(v2MemberBackup)) throw new Error("Group membership changed after the backup. Discard this plan, read again and make a new plan.");
      if (plan !== p || !gateOk()) throw new Error("Plan context changed. Make a fresh plan.");
      $("mvMemApply").disabled = true;
      const preSkipped = [];
      let me = null;
      if (p.ops.some((x) => x.type === "create")) { try { me = await M.readMe(); } catch { me = null; } }
      const L = RunLedger.create($("mvLedger"), { unit: "steps", title: p.title, items: p.ops.map((x) => ({ label: `${opWord(x)} · ${opLabel(x)}`, sub: x.who || "" })) });
      const r = await MdeMembers.applyOps(p.ops, { ledger: L, me });
      L.finish();
      const createdGroups = [...r.created.entries()].map(([name, id]) => ({ id, displayName: p.ops.find((x) => x.type === "create" && lc(x.name) === name) ? p.ops.find((x) => x.type === "create" && lc(x.name) === name).name : name, groupTypes: [] }));
      const actualDone = T28V2Safety.actualOps(r, v2MemberBackup);
      const verifiedDone = T28V2Safety.verifiedOps(Object.assign({}, r, { done: actualDone }));
      const uncertain = actualDone.length !== verifiedDone.length;
      const pinMade = createdGroups.find((g) => lc(g.displayName) === lc(mcfg().pinnedDevice));
      const skipMade = createdGroups.find((g) => lc(g.displayName) === lc(mcfg().skipDevice));
      if (mem.input && skipMade) { mem.input.skipGroup = { id: lc(skipMade.id), name: skipMade.displayName }; if (!mem.input.skip) mem.input.skip = new Set(); }
      if (mem.input && pinMade) { mem.input.pinnedGroup = { id: lc(pinMade.id), name: pinMade.displayName }; if (!mem.input.pinned) mem.input.pinned = new Set(); }
      if (mem.input) MdeMembers.patchInput(mem.input, verifiedDone, createdGroups);
      if (cs.extra) MdeRevert.patch(cs.extra, mem.input, verifiedDone, mcfg());
      if (uncertain) { mem.input = null; mem.model = null; cs.extra = null; }
      if (found) for (const g of createdGroups) names.set(lc(g.id), g.displayName);
      memCompute();
      // ⊘ (10639): the exclusion lists move with the run, and the open card
      // is read again so what reaches it is the tenant's answer
      if (ex.base) MdeExclude.patchBase(ex.base, verifiedDone);
      if (uncertain) { ex.base = null; ex.list = null; }
      // 🧪 a pilot migrated into its country (10656): listed as migrated once
      // every step of its migration read back clean; an undo of that run
      // puts it back in batches
      const clean = (j) => r.results[j] && r.results[j].ok && r.results[j].verified;
      const migrated = (p.migrate || []).filter((m) => m.ops.every(clean));
      const unmigrate = p.unmigrate && r.results.length && r.results.every((x) => x.ok && x.verified) ? p.unmigrate : [];
      if (migrated.length || unmigrate.length) {
        const c = mcfg(), has = (list, x) => list.some((y) => lc(y) === lc(x));
        const outOf = migrated.map((m) => m.suffix), back = unmigrate.map((m) => m.suffix);
        saveCfg(Object.assign({}, cfg, { members: Object.assign({}, c, {
          batched: c.batched.filter((x) => !has(outOf, x)).concat(back.filter((x) => !has(c.batched, x))),
          migrated: c.migrated.filter((x) => !has(back, x)).concat(outOf.filter((x) => !has(c.migrated, x))) }) }));
        memCompute();
      }
      const okN = r.results.filter((x) => x.ok && x.verified).length;
      csAfterRun(p, r, verifiedDone);
      // 👥 runs move "last synced" too (10682): every country whose steps all read back clean
      if (!p.runKind && !p.exclusions && !p.pilotsReady && !p.pins && !p.skips && mem.model) {
        const keys = new Set(mem.model.rows.map((x) => x.key)), okBy = new Map();
        p.ops.forEach((op, i) => { if (keys.has(op.key)) okBy.set(op.key, (okBy.has(op.key) ? okBy.get(op.key) : true) && !!(r.results[i] && r.results[i].ok && r.results[i].verified)); });
        const synced = readJson(syncKey()), at = new Date().toISOString();
        for (const [k, v] of okBy) if (v) synced[k] = at;
        writeJson(syncKey(), synced);
      }
      runs.push({ at: Date.now(), title: p.title, kind: "members", runKind: p.runKind || null, reason: p.reason || undefined, exclusions: !!p.exclusions, ok: okN, bad: r.results.length - okN, stopped: L.stopped, backup: { policies: [], membership: v2MemberBackup }, risk: v2Risk,
        done: verifiedDone, uncertainDone: actualDone.filter((x) => !verifiedDone.includes(x)), pilots: !!p.pilotsReady, migrate: migrated, lines: r.results.map((x) => `${opWord(x.op)} · ${opLabel(x.op)}${x.op.who ? ` (${x.op.who})` : ""}: ${x.ok ? (x.verified ? "done · verified" : "done · NOT verified") : (x.skipped ? "skipped" : "failed — " + (x.note || ""))}`).concat(preSkipped) });
      plan = null;
      // 📋 (10651): the list's rows move with any run; a list run starts
      // its ticks again (what failed is ticked for another go)
      if (ex.list) {
        MdeExclude.patchList(ex.list, verifiedDone, exGroups());
        if (p.bulk) ex.lticks = MdeExclude.listTicks(ex.list);
        else { const can = MdeExclude.listTicks(ex.list); for (const k of [...ex.lticks]) if (!can.has(k) && exListLocked(k)) ex.lticks.delete(k); }
      }
      if (p.exclusions) { ex.sel.clear(); if (!p.bulk && ex.card) setTimeout(() => exPick(ex.card.pick, true), 0); }
      else if (p.pilotsReady) mem.pilSel.clear();
      else if (p.pins) { if (mem.unpin) mem.unpin.clear(); }
      else if (p.skips) { if (mem.skipEdits) mem.skipEdits.clear(); }
      else mem.sel.clear();
      const ledger = $("mvLedger").innerHTML;
      render();
      planEl().innerHTML = `<div class="list-card" style="margin-top:14px;padding:16px 18px"><h4 style="margin:0 0 6px">${esc(p.title)} — done</h4><div id="mvLedger">${ledger}</div><p class="mini muted" style="margin:8px 0 0">${preSkipped.length ? `<span style="color:var(--report)">${preSkipped.map(esc).join("<br>")}</span><br>` : ""}${okN} of ${r.results.length} steps written &amp; verified. The rows above moved with them; ↻ Read again for the tenant's own view. The run and its undo are in 📜 Changes this session.</p></div>`;
    } catch (e) {
      const el = document.createElement("div"); el.className = "gu-fail"; el.innerHTML = `<b>${esc(GroupUse.shortErr(e, 300))}</b>`;
      $("mvLedger").appendChild(el);
    } finally { busy = false; }
  }

  // ------------------------------------------- 🔄 country groups (10679) --
  // Mihai (5 Oct 2026): the user groups mirror the device groups — a static
  // INT-SG-U-<ISO3> beside every INT-SG-D-<ISO3> — the waves nest only those,
  // and one 🔄 sync keeps both pairs from the PVM-UG sources, holding back
  // whoever ↩ Revert put on the old set. The read is 👥's (memRead) plus
  // MdeRevert.readExtra; the engine is js/mderevert.js.
  const cs = { extra: null, error: "", scope: "all", ticks: null, sig: "", confirm: "", mapOk: "" };
  const rv = { q: "", searching: false, results: null, note: "", card: null, cardLoading: false, cardError: "", ticks: new Set(), reason: "", sel: new Set(), error: "" };
  const syncKey = () => `tuno.t28.groupsync.${tenantKey()}`;
  const reasonsKey = () => `tuno.t28.revert.reasons.${tenantKey()}`;
  const readJson = (k) => { try { return JSON.parse(window.localStorage.getItem(k) || "{}") || {}; } catch { return {}; } };
  const writeJson = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
  let csCache = null;
  function csModel() {
    if (!mem.model || !mem.input || !cs.extra) return null;
    const sig = `${mem.model.readAt}|${cs.extra.readAt}|${runs.length}|${mem.model.rows.map((r) => `${r.add.length}.${r.remove.length}.${r.have.size}.${r.ugNested}`).join()}|${cs.extra.revertUsers.size}.${cs.extra.revertDevices.size}|${[...cs.extra.userMembers.values()].map((s) => s.size).join()}`;
    if (!csCache || csCache.sig !== sig) csCache = { sig, v: MdeRevert.model(mcfg(), mem.model, mem.input, cs.extra, { lastSynced: readJson(syncKey()), reasons: readJson(reasonsKey()) }) };
    return csCache.v;
  }
  function csItems(sm) {
    const items = MdeRevert.syncItems(sm, cs.scope);
    const sig = `${cs.scope}|${items.map((x) => x.key).join()}`;
    if (!cs.ticks || cs.sig !== sig) { cs.ticks = MdeRevert.defaultSyncTicks(items); cs.sig = sig; cs.confirm = ""; }
    return items;
  }
  function csAge(iso) {
    if (!iso) return "never (this browser)";
    return ago(iso);
  }
  function countrySyncPane() {
    const C = mcfg();
    const intro = `<p class="mini muted" style="margin:0 0 10px">The waves nest <b>static</b> groups only: per country <code>${esc(C.userGroupPrefix)}&lt;ISO3&gt;</code> for the users and <code>${esc(C.deviceGroupPrefix)}&lt;ISO3&gt;</code> for their Windows devices, filled from <code>${esc(C.countryPrefix)}*</code> (users: transitive members; devices: 👥's rule — Intune primary user). Whoever is in <code>${esc(C.revertUser)}</code> / <code>${esc(C.revertDevice)}</code> is held back: a sync never puts them back without a tick and a confirm. Nothing is written without ② Dry run, ③ backup and ④ Apply.</p>`;
    if (!mem.model || !cs.extra) return `<div class="list-card" style="margin-top:0">${intro}
      ${cs.error ? `<div class="gu-fail" style="margin-bottom:10px"><b>${esc(cs.error)}</b></div>` : ""}${mem.error ? `<div class="gu-fail" style="margin-bottom:10px"><b>${esc(mem.error)}</b></div>` : ""}
      ${mem.loading ? `<p class="mini" id="mvMemProg" style="margin:0">Reading…</p>` : `<div class="tb-actions"><button class="btn primary" id="mvCsRead">🔄 Read the country groups</button></div><p class="mini muted" style="margin:8px 0 0">Reads the country user groups and their users, the Windows devices, the static user and device groups, the waves and the Revert pair — the same read as 👥 Wave members. Read-only.</p>`}</div>`;
    const sm = csModel();
    // the mapping per ISO3 (§1)
    const mapRows = MdeRevert.mapping(MdeMembers.countryRows(C), C).map((x) => `<tr><td class="mini">${esc(x.region)}</td><td class="mini"><code>${esc(x.source)}</code>${x.pilot ? " 🧪" : ""}</td>
      <td class="mini">${x.user ? `<code>${esc(x.user)}</code>` : `<span style="color:var(--off)">${esc(x.why)}</span>`}</td><td class="mini">${x.device ? `<code>${esc(x.device)}</code>` : "—"}</td></tr>`).join("");
    const unm = mem.model.unmapped || [];
    const mapping = `<div class="list-card" id="mvCsMap" style="margin-top:0">
      <h4 style="margin:0 0 6px">Mapping per ISO3</h4>
      <p class="mini muted" style="margin:0 0 8px">The code is the device group's own — the country table and its suffix overrides under ⚙️, never a second list. A site group keeps its own pair (NL-Breda → NLD-BREDA).</p>
      <details><summary class="mini">${plural(MdeMembers.countryRows(C).length, "source group")}${unm.length ? ` · <b style="color:var(--report)">${plural(unm.length, "unmapped group")}</b>` : ""}</summary>
      <div style="overflow-x:auto;margin-top:6px"><table class="cg-table"><thead><tr><th>Wave</th><th>Source</th><th>User group</th><th>Device group</th></tr></thead><tbody>${mapRows}</tbody></table></div>
      ${unm.length ? `<p class="mini" style="margin:8px 0 0"><b>Not mapped — never guessed:</b> ${unm.map((u) => `<code>${esc(u.group.displayName)}</code>`).join(" ")}. Map one under ⚙️ (or 👥 → ⚠ Not in any wave) to give it a pair.</p>` : ""}</details>
      <p class="mini muted" style="margin:8px 0 0">The groups are created in one place — <a href="#" data-mrpane="members">👥 Wave members</a>, user and device side by side. This pane creates nothing.</p></div>`;
    if (!sm) return `<div class="list-card" style="margin-top:0">${intro}</div>${mapping}`;
    // the waves (§1 swap) and the per-ISO3 head (§2): last synced, drift
    const regions = sm.regions.map((g) => {
      const rows = g.rows.map((r) => {
        const route = r.sourceNested && r.staticNested ? chip("gu-how priv", "both") : r.sourceNested ? chip("au-op other", "dynamic") : r.staticNested ? chip("au-op create", "static") : `<span class="muted">not in the wave</span>`;
        const ug = r.ug ? `<code>${esc(r.ug.name)}</code> <span class="muted">${r.userHave}</span>` : r.userGroupName ? `<code>${esc(r.userGroupName)}</code> <a href="#" data-mrpane="members" class="mini">create in 👥</a>` : `<span style="color:var(--off)">no code</span>`;
        const d = r.drift ? `<b style="color:${r.stale ? "var(--report)" : "var(--on)"}">${r.drift}</b>` : `<span class="muted">0</span>`;
        const held = r.user.held.length + r.device.held.length;
        return `<tr><td class="mini">${esc(r.country)}${r.pilot ? " 🧪" : ""}<div class="muted">${esc(r.source.name)} · ${r.sourceCount}</div></td><td class="mini">${ug}</td><td class="mini">${route}</td>
          <td class="mini"${r.stale ? ` style="color:var(--report)" title="More than ${C.syncStaleDays} days, and it has drifted"` : ""}>${esc(csAge(r.lastSynced))}</td><td class="mini">${d}${held ? ` <span class="muted">· ${held} held</span>` : ""}</td></tr>`;
      }).join("");
      return `<div style="margin-top:10px"><div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><b>🌊 ${esc(g.region)}</b><span class="mini muted">${esc((g.wave && g.wave.userName) || "")} — ${g.toSwap ? `${plural(g.toSwap, "dynamic group")} still nested` : "static only"}</span>
        <button class="btn" data-mrcsswap="${esc(g.region)}"${g.toSwap ? "" : " disabled"} style="margin-left:auto">⇄ Swap to static → dry run</button></div>
        <div style="overflow-x:auto;margin-top:6px"><table class="cg-table"><colgroup><col style="width:28%"><col style="width:26%"><col style="width:14%"><col style="width:16%"><col></colgroup><thead><tr><th>Country · source</th><th>Static user group</th><th>In the user wave</th><th>Last synced</th><th>Drift</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }).join("");
    const waves = `<div class="list-card" id="mvCsWaves" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><h4 style="margin:0">Waves</h4><span class="mini muted">read ${esc(new Date(sm.readAt).toLocaleTimeString())} · drift: <b>${sm.drift}</b>${sm.stale ? ` · <b style="color:var(--report)">${plural(sm.stale, "country", "countries")} not synced in ${C.syncStaleDays} days</b>` : ""} <button class="btn" id="mvCsRead">↻ Read again</button></span></div>
      <p class="mini muted" style="margin:6px 0 0"><b>⇄ Swap</b>, per wave, for a country still nested through its dynamic group: its static user group (created and filled in 👥) is topped up and nested, the wave's users are read back, and only when every user of the dynamic group is in the static one does the dynamic group come out. Effective membership is identical, so no policy moves; a difference stops that country before the unnest and says who. <b>Last synced</b> is this browser's record; the drift is read now.</p>
      ${regions}</div>`;
    // the sync preview (§2)
    const items = csItems(sm);
    const scopeOpts = [`<option value="all"${cs.scope === "all" ? " selected" : ""}>All countries</option>`].concat(sm.rows.filter((r) => r.iso3).map((r) => `<option value="${esc(r.key)}"${cs.scope === r.key ? " selected" : ""}>${esc(r.iso3)} · ${esc(r.country)}${r.drift ? ` (${r.drift})` : ""}</option>`)).join("");
    const sec = (dir, title, help) => {
      const list = items.filter((x) => x.dir === dir);
      if (!list.length) return "";
      const on = list.filter((x) => cs.ticks.has(x.key)).length;
      const rows = list.slice(0, 400).map((x) => `<tr class="${cs.ticks.has(x.key) ? "mr-selrow" : ""}"><td><input type="checkbox" data-mrcstick="${esc(x.key)}"${cs.ticks.has(x.key) ? " checked" : ""} aria-label="${esc(x.name)}"></td>
        <td class="mini">${x.kind === "user" ? "👤" : "💻"} ${esc(x.name)}</td><td class="mini"><code>${esc(x.group || "—")}</code>${x.row ? ` <span class="muted">${esc(x.row.country)}</span>` : ""}</td>
        <td class="mini">${x.reason ? `“${esc(x.reason)}”` : ""}${x.why ? `<span class="muted">${x.reason ? " · " : ""}${esc(x.why)}</span>` : ""}</td></tr>`).join("");
      return `<details open style="margin-top:10px"><summary><b>${esc(title)}</b> <span class="mini muted">${on} of ${list.length} ticked — ${esc(help)}</span></summary>
        <div style="overflow-x:auto;margin-top:6px"><table class="cg-table"><colgroup><col style="width:30px"><col style="width:32%"><col style="width:30%"><col></colgroup><tbody>${rows}</tbody></table></div>${list.length > 400 ? `<p class="mini muted">… and ${list.length - 400} more (CSV in 👥)</p>` : ""}</details>`;
    };
    const line = MdeRevert.reincludeLine(items, cs.ticks);
    const sync = `<div class="list-card" id="mvCsSync" style="margin-top:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><h4 style="margin:0">🔄 Sync</h4><select id="mvCsScope" aria-label="Which countries" style="max-width:320px">${scopeOpts}</select><span class="mini muted">users and devices together</span></div>
      ${(() => { const miss = sm.rows.filter((r) => (cs.scope === "all" || r.key === cs.scope) && r.iso3 && (!r.ug || !r.dg) && (r.sourceCount || r.device.add.length)); return miss.length ? `<p class="mini" style="margin:8px 0 0;color:var(--report)">${plural(miss.length, "country", "countries")} without ${miss.length === 1 ? "its" : "their"} static groups yet (${esc(miss.slice(0, 6).map((r) => r.iso3).join(", "))}${miss.length > 6 ? " …" : ""}) — create &amp; fill them in <a href="#" data-mrpane="members">👥 Wave members</a>; this sync only keeps existing groups in step.</p>` : ""; })()}
      ${sm.failed.length ? `<div class="gu-fail" style="margin-top:8px"><b>Partly read:</b><span class="why">${sm.failed.slice(0, 5).map(esc).join("<br>")}</span></div>` : ""}
      ${items.length ? [sec("add", "Add", "ticked by default"), sec("leave", "Remove — leavers", "never ticked by default: a removal changes what policies the member gets"),
        sec("heldin", "Remove — held, still in", "in Revert or ⊘, yet in a country group"), sec("reinc", "Reverted, held back", "never ticked by default; re-including one needs the confirm below"),
        sec("clean", "Revert clean-up", "in Revert, in no country any more")].join("") : `<p class="mini muted" style="margin:8px 0 0">In sync — nothing to add or remove${cs.scope === "all" ? "" : " for this country"}.</p>`}
      ${line ? `<label class="chk" style="margin:10px 0 0;color:var(--report)"><input type="checkbox" id="mvCsConfirm"${cs.confirm === line ? " checked" : ""}> ${esc(line)}</label>` : ""}
      <div class="mr-mbar"><span class="mini">${plural(cs.ticks.size, "member")} ticked</span><button class="btn primary" id="mvCsDry"${cs.ticks.size ? "" : " disabled"}>② Dry run</button></div></div>`;
    return `<div class="list-card" style="margin-top:0">${intro}</div>${mapping}${waves}${sync}`;
  }
  async function csRead() {
    cs.error = "";
    await memRead();
  }
  function csSyncDry() {
    const sm = csModel();
    if (busy || !sm) return;
    planAnchor = "mvCsSync"; clearPlan(); seatPlan();
    const items = csItems(sm);
    const scopeRows = cs.scope === "all" ? sm.rows.map((r) => r.key) : [cs.scope];
    const p = MdeRevert.planSync(sm, items, cs.ticks, { confirm: cs.confirm, scopeRows });
    if (p.refused) { planError(p.refused); showPlan(); return; }
    const r = sm.rows.find((x) => x.key === cs.scope);
    plan = Object.assign(p, { members: true, title: `🔄 Country groups — ${r ? `${r.iso3} · ${r.country}` : "all countries"}` });
    renderMemPlan();
  }
  function csSwapDry(region) {
    const sm = csModel();
    if (busy || !sm) return;
    planAnchor = "mvCsWaves"; clearPlan(); seatPlan();
    const p = MdeRevert.planSwap(sm, region);
    if (p.refused) { planError(p.refused); showPlan(); return; }
    plan = Object.assign(p, { members: true, title: `⇄ Swap ${region} to static user groups` });
    renderMemPlan();
  }

  // ------------------------------------------------------- ↩ revert (10679) --
  // §3: a user, a device, or the pair — out of their static country group,
  // into the Revert group, in one run with a reason. The search and the
  // device list are ⊘'s (MdeExclude); what reaches them, before and after,
  // is T28's reach model, per policy.
  function rvCtx(ticks) {
    const sm = csModel();
    return {
      ticks: ticks || rv.ticks, rows: mem.model ? mem.model.rows : [], cfg: mcfg(),
      revert: cs.extra ? cs.extra.revert : {}, revertUsers: cs.extra ? cs.extra.revertUsers : new Map(), revertDevices: cs.extra ? cs.extra.revertDevices : new Map(),
      reason: rv.reason, sm,
      userWaveIds: new Set(waveRows.filter((w) => w.role === "wave" && w.audience === "user" && w.id).map((w) => w.id)),
      deviceWaveIds: new Set(waveRows.filter((w) => w.role === "wave" && w.audience === "device" && w.id).map((w) => w.id)),
    };
  }
  async function rvRead() {
    rv.error = "";
    if (!mem.model || !cs.extra) await memRead();
    if (!ex.base) await exRead();
    if (!mem.model || !cs.extra) rv.error = cs.error || mem.error || "The country groups could not be read.";
    render();
  }
  async function rvSearch() {
    const input = $("mvRvQ");
    rv.q = input ? input.value : rv.q;
    if (!ex.base) await exRead();
    if (!ex.base || rv.searching) return;
    rv.searching = true; rv.note = ""; render();
    try {
      const r = await MdeExclude.search(rv.q, ex.base, exOpt());
      rv.results = r.results;
      rv.note = r.note || [r.failed.length ? `Partly searched — ${r.failed.join("; ")}` : "", !r.results.length ? `Nothing found for “${r.term}”.` : ""].filter(Boolean).join(" ");
    } catch (e) { rv.results = []; rv.note = GroupUse.shortErr(e, 240); }
    finally { rv.searching = false; render(); const q = $("mvRvQ"); if (q) q.focus(); }
  }
  async function rvPick(pick, quiet) {
    if (!ex.base) return;
    rv.cardLoading = true; rv.cardError = ""; if (!quiet) rv.card = null; render();
    try {
      await Graph.ensureScopes(MdeExclude.scopes());
      rv.card = await MdeRevert.lookup(pick, ex.base, exOpt());
      for (const [id, n] of rv.card.names) if (!names.has(id)) names.set(id, n);
      rv.ticks = MdeRevert.defaultTicks(rv.card);
    } catch (e) { rv.cardError = GroupUse.shortErr(e, 300); }
    finally { rv.cardLoading = false; render(); }
  }
  function rvDryRun() {
    if (busy || !rv.card) return;
    planAnchor = "mvRvCard"; clearPlan(); seatPlan();
    const p = MdeRevert.planRevert(rv.card, rvCtx());
    const who = rv.card.user ? rv.card.user.displayName : (rv.card.devices.find((d) => d.searched) || rv.card.devices[0] || {}).name || "";
    plan = Object.assign(p, { members: true, title: `↩ Revert — ${who}` });
    renderMemPlan();
  }
  function rvUndoDry() {
    const sm = csModel();
    if (busy || !sm || !rv.sel.size) return;
    planAnchor = "mvRvNow"; clearPlan(); seatPlan();
    const items = [...rv.sel].map((k) => {
      const [t, id] = [k.slice(0, 1), k.slice(2)];
      if (t === "u") { const u = sm.revertUsers.get(id); return { kind: "user", id, name: u ? u.upn : id }; }
      const d = sm.revertDevices.get(id); return { kind: "device", id, name: d ? d.name : id };
    });
    const p = MdeRevert.planUnrevert(sm, items);
    plan = Object.assign(p, { members: true, title: `↩ Back into the wave — ${plural(items.length, "member")}` });
    renderMemPlan();
  }
  function rvCardHtml() {
    if (rv.cardError) return `<div class="gu-fail" style="margin-top:12px"><b>${esc(rv.cardError)}</b></div>`;
    if (!rv.card) return rv.cardLoading ? `<p class="mini muted" style="margin:10px 0 0">Reading their groups…</p>` : "";
    const c = rv.card, C = mcfg(), ctx = rvCtx();
    const N = MdeRevert.countryNames(ctx.rows, C);
    const tick = (key, on, dis, label) => `<input type="checkbox" data-mrrvtick="${esc(key)}"${on ? " checked" : ""}${dis ? " disabled" : ""} aria-label="${esc(label)}">`;
    const cg = (list, map) => (list || []).filter((g) => map.has(lc(g.name))).map((g) => g.name);
    const u = c.user;
    const uRev = u && ctx.revertUsers.has(u.id);
    const dynOf = (groups) => (mem.model ? mem.model.rows : []).filter((r) => r.ug && r.ugNested && groups && groups.has(lc(r.ug.id))).map((r) => r.ug.displayName);
    const userHtml = u ? `<div class="mr-expc" style="margin-top:12px">
      <h4 style="margin:0 0 6px"><label style="display:flex;gap:8px;align-items:center">${tick(`u:${u.id}`, rv.ticks.has(`u:${u.id}`), uRev || u.unread, "revert the user")} 👤 ${esc(u.displayName)}</label></h4>
      <dl class="mr-exkv">
        <dt>UPN</dt><dd>${esc(u.upn || "—")}</dd>
        <dt>Static country group</dt><dd>${cg(u.direct, N.user).map((n) => `<code>${esc(n)}</code>`).join(" ") || (u.direct ? "none" : "not read")}</dd>
        <dt>Wave</dt><dd>${u.groups ? (wavesIn(u.groups, "user").map((r) => `🌊 ${esc(r)}`).join(", ") || "none") : "not read"}${dynOf(u.groups).length ? ` <span style="color:var(--report)">through ${esc(dynOf(u.groups).join(", "))} (dynamic) — ⇄ swap it in 🔄 first</span>` : ""}</dd>
        <dt>Now</dt><dd>${uRev ? chip("au-op create", "reverted") : `<span class="muted">not reverted</span>`}${u.excluded ? ` ${chip("gu-how priv", "⊘ excluded")}` : ""}</dd>
      </dl></div>` : "";
    const drows = c.devices.map((d) => {
      const dRev = d.objId && ctx.revertDevices.has(d.objId);
      return `<tr class="${rv.ticks.has(d.key) ? "mr-selrow" : ""}"><td>${tick(d.key, rv.ticks.has(d.key), !d.objId || dRev, `revert ${d.name}`)}</td><td class="mini">💻 ${esc(d.name)}${d.searched ? " ⟵" : ""}</td>
        <td class="mini">${esc(ago(d.lastSync))}${d.stale ? " · stale" : ""}</td><td class="mini">${cg(d.direct, N.device).map((n) => `<code>${esc(n)}</code>`).join(" ") || `<span class="muted">${esc(d.problem || "in no country device group")}</span>`}</td>
        <td class="mini">${dRev ? chip("au-op create", "reverted") : ""}${d.excluded ? ` ${chip("gu-how priv", "⊘")}` : ""}</td></tr>`;
    }).join("");
    const as = MdeRevert.assess(c, model, ctx);
    const pol = (list) => list.length ? list.map((P) => esc(P.name)).join("<br>") : `<span class="muted">—</span>`;
    const verdict = (x) => x.state === "gap" ? `<b style="color:var(--off)">⚠ neither set — a gap</b>` : x.state === "both" ? `<b style="color:var(--off)">⚠ both sets — a conflict</b>` : x.state === "none" ? `<span class="muted">not in a static country group — nothing changes</span>` : `<span style="color:var(--on)">old set takes over</span>`;
    const arows = as.map((x) => `<tr><td class="mini">${x.kind === "user" ? "👤" : "💻"} ${esc(x.kind === "user" ? x.obj.displayName : x.obj.name)}${x.leaves.length ? `<div class="muted">out of ${esc(x.leaves.map((g) => g.name).join(", "))}</div>` : ""}</td><td class="mini">${pol(x.drops)}</td><td class="mini">${pol(x.takes)}</td><td class="mini">${verdict(x)}</td></tr>`).join("");
    const p0 = MdeRevert.planRevert(c, ctx);
    const n = p0.ops.filter((o) => o.type === "add").reduce((a, o) => a + o.ids.length, 0);
    const why = !n && rv.ticks.size && p0.skipped.length ? `<span style="color:var(--report)">Nothing to revert — ${esc(p0.skipped[0])}${p0.skipped.length > 1 ? ` (+${p0.skipped.length - 1})` : ""}</span>` : "";
    return `<div id="mvRvCard">
      ${c.failed.length ? `<div class="gu-fail" style="margin-top:12px"><b>Partly read:</b><span class="why">${c.failed.map(esc).join("<br>")}</span></div>` : ""}
      ${userHtml}
      ${c.devices.length ? `<div style="overflow-x:auto;margin-top:10px"><table class="cg-table"><colgroup><col style="width:30px"><col><col style="width:16%"><col style="width:30%"><col style="width:90px"></colgroup><thead><tr><th></th><th>Device</th><th>Last sync</th><th>Country device group</th><th></th></tr></thead><tbody>${drows}</tbody></table></div>` : `<p class="mini muted" style="margin:8px 0 0">No Windows device in Intune has this user as its primary user.</p>`}
      <p class="mini muted" style="margin:6px 0 0">Ticked by default: the pair — ${c.pick.type === "user" ? `the user and their devices that synced in the last ${exOpt().staleDays} days` : "the device and its primary user"}. Reverting one side only leaves a mix of new device-scoped and old user-scoped policies.</p>
      ${arows ? `<h4 style="margin:12px 0 6px">What changes, per policy</h4><div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:28%"><col style="width:26%"><col style="width:26%"><col></colgroup><thead><tr><th>Who</th><th>New policies that drop off</th><th>Old policies that take over</th><th>After</th></tr></thead><tbody>${arows}</tbody></table></div>
        <p class="mini muted" style="margin:6px 0 0">T28's reach model: an exclusion wins over an include of its kind; assignment filters are not evaluated. Likely impact: the next Intune check-in removes the new MDE policies and applies the old ones — ASR sits at “not configured” until the old policy lands.</p>` : ""}
      <label class="wi-f" style="margin-top:10px"><span>Reason — kept with the run and shown in the 🔄 sync preview</span><input id="mvRvReason" value="${esc(rv.reason)}" placeholder="e.g. LOB app blocked by the new ASR rules — ticket 4711" autocomplete="off"></label>
      <div class="mr-mbar" id="mvRvBar"><span>${n ? `<b>${plural(n, "member")}</b> → ${esc(C.revertUser)} / ${esc(C.revertDevice)}, out of their country group` : why || "tick the user or a device"}</span><button class="btn primary" id="mvRvDry"${n ? "" : " disabled"}>② Dry run</button></div>
    </div>`;
  }
  function rvNowHtml() {
    const sm = csModel();
    if (!sm) return "";
    const reasons = readJson(reasonsKey());
    const C = mcfg();
    const row = (k, icon, name, sub) => `<tr class="${rv.sel.has(k) ? "mr-selrow" : ""}"><td><input type="checkbox" data-mrrvsel="${esc(k)}"${rv.sel.has(k) ? " checked" : ""} aria-label="select"></td><td class="mini">${icon} ${esc(name)}${sub ? `<div class="muted">${esc(sub)}</div>` : ""}</td><td class="mini">${reasons[k.slice(2)] ? `“${esc(reasons[k.slice(2)].reason)}” <span class="muted">${esc(shortDate(reasons[k.slice(2)].at))}</span>` : `<span class="muted">no reason recorded in this browser</span>`}</td></tr>`;
    const rows = [...sm.revertUsers.values()].map((u) => row(`u:${u.id}`, "👤", u.name || u.upn, u.upn !== u.name ? u.upn : "")).concat([...sm.revertDevices.values()].map((d) => row(`d:${d.id}`, "💻", d.name, ""))).join("");
    return `<div class="list-card" id="mvRvNow" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><h4 style="margin:0">Reverted now</h4>
        <span class="mini muted">${esc(sm.revert.user ? sm.revert.user.displayName : C.revertUser)} <b>${sm.revertUsers.size}</b> · ${esc(sm.revert.device ? sm.revert.device.displayName : C.revertDevice)} <b>${sm.revertDevices.size}</b>${!sm.revert.user || !sm.revert.device ? " · created by the first revert" : ""}</span></div>
      ${rows ? `<div style="overflow-x:auto;margin-top:8px"><table class="cg-table"><colgroup><col style="width:30px"><col style="width:40%"><col></colgroup><thead><tr><th></th><th>Member</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="tb-actions" style="margin-top:8px"><button class="btn" id="mvRvUndoDry"${rv.sel.size ? "" : " disabled"}>↩ Back into the wave — ${plural(rv.sel.size, "member")} → dry run</button><span class="mini muted">Out of Revert, back into their country group. Or untick them in a later 🔄 sync with the confirm.</span></div>`
        : `<p class="mini muted" style="margin:8px 0 0">Nobody is reverted.</p>`}</div>`;
  }
  function revertPane() {
    const C = mcfg();
    const intro = `<p class="mini muted" style="margin:0 0 10px">Take a user and/or device out of their wave so the <b>old</b> MDE policies reach them again: out of their static country group (<code>${esc(C.userGroupPrefix)}&lt;ISO3&gt;</code> / <code>${esc(C.deviceGroupPrefix)}&lt;ISO3&gt;</code>) and into <code>${esc(C.revertUser)}</code> / <code>${esc(C.revertDevice)}</code>, in one run, with a reason. The Revert groups are assigned to nothing; they are the list 🔄 holds back, in the tenant, so another admin's sync holds them back too. <b>⊘ Exclude</b> is different: an excluded member stays in the wave and skips the new policies.</p>`;
    if (!mem.model || !cs.extra || !ex.base) return `<div class="list-card" style="margin-top:0">${intro}
      ${rv.error ? `<div class="gu-fail" style="margin-bottom:10px"><b>${esc(rv.error)}</b></div>` : ""}
      ${mem.loading || ex.loading ? `<p class="mini" id="mvMemProg" style="margin:0">Reading…</p><p class="mini muted" id="mvExProg" style="margin:0"></p>` : `<div class="tb-actions"><button class="btn primary" id="mvRvRead">↩ Read the country groups, Revert and the devices</button></div><p class="mini muted" style="margin:8px 0 0">The 🔄 read plus the Windows devices in Intune (their primary users). Read-only.</p>`}</div>`;
    const hits = (rv.results || []).map((h, i) => `<button type="button" class="mr-exhit${rv.card && rv.card.pick === h ? " on" : ""}" data-mrrvpick="${i}">
        <span class="mr-exk${h.type === "device" ? " d" : ""}">${h.type === "user" ? "USER" : "DEVICE"}</span><b>${esc(h.type === "user" ? h.displayName : h.name)}</b>
        <span class="muted">${esc(h.type === "user" ? h.upn : (h.primary ? `primary user ${h.primary}` : h.managed ? "no primary user" : "not in Intune"))}</span>
        <span class="mr-exr">${h.type === "user" ? plural(h.devices, "Windows device") : esc(h.os || "")}${h.stale ? " · stale" : ""}</span></button>`).join("");
    return `<div class="list-card mr-stickyhost" style="margin-top:0">${intro}
      <div class="mr-exsearch"><input id="mvRvQ" type="search" placeholder="Search a user or device…" value="${esc(rv.q)}" autocomplete="off" spellcheck="false" aria-label="Search a user or device"><button class="btn primary" id="mvRvGo"${rv.searching ? " disabled" : ""}>${rv.searching ? "Searching…" : "Search"}</button></div>
      ${rv.note ? `<p class="mini muted" style="margin:6px 0 0">${esc(rv.note)}</p>` : ""}
      ${hits ? `<div class="mr-exresults">${hits}</div>` : ""}
      ${rvCardHtml()}
    </div>${rvNowHtml()}`;
  }
  // After a verified run: what the Revert and 🔄 panes keep in this browser
  // (the reasons, the last sync per country) and the open card read again.
  function csAfterRun(p, r, verifiedDone) {
    const C = mcfg();
    if (p.runKind === "groupsync") {
      const synced = readJson(syncKey()), at = new Date().toISOString();
      MdeRevert.syncedRows(p, r.results).forEach((k) => { synced[k] = at; });
      writeJson(syncKey(), synced);
      cs.ticks = null; cs.confirm = "";
    }
    if (p.runKind === "revert" || p.runKind === "groupsync") {
      const reasons = readJson(reasonsKey());
      for (const d of verifiedDone) {
        if (d.type !== "add" && d.type !== "remove") continue;
        const isRev = [C.revertUser, C.revertDevice].some((n) => lc(n) === lc(d.group.name));
        if (!isRev) continue;
        for (const id of d.ids) { if (d.type === "add") reasons[lc(id)] = { reason: p.reason || "", at: new Date().toISOString() }; else delete reasons[lc(id)]; }
      }
      writeJson(reasonsKey(), reasons);
    }
    if (p.runKind === "revert") { rv.sel.clear(); if (rv.card) setTimeout(() => rvPick(rv.card.pick, true), 0); }
  }

  // -------------------------------------------------------- ⊘ exclusions --
  // Layout A off the mockup (10639): a header button opened this pane — the
  // button left the header at 10678 (Mihai: "only show them on left rail"),
  // the rail node is the way in — with
  // the cursor in the search. Search a user or a device, get both (the user
  // with their Windows devices, or the device with its primary user) and
  // what reaches each, tick, dry run. The plan opens under the card.
  const exOpt = () => ({ staleDays: mcfg().staleDays || 30 });
  function exGroups() {
    const pick = (aud) => { const w = waveRows.find((x) => x.role === "exclusion" && x.audience === aud); return w ? (w.group || (w.legacy && w.legacy.group) || null) : null; };
    return { user: pick("user"), device: pick("device") };
  }
  function exCtx(ticks) {
    const G = exGroups();
    return {
      groups: G, ticks: ticks || ex.ticks, keepOld: ex.keepOld,
      exUserId: G.user ? lc(G.user.id) : null, exDeviceId: G.device ? lc(G.device.id) : null,
      deviceWaveIds: new Set(waveRows.filter((w) => w.role === "wave" && w.audience === "device" && w.id).map((w) => w.id)),
      deviceGroupPrefix: mcfg().deviceGroupPrefix,
      skipIds: new Set(waveRows.map((w) => w.group || (w.legacy && w.legacy.group)).filter(Boolean).map((g) => lc(g.id))),
    };
  }
  let exNowCache = null;
  const exNow = () => {
    if (!ex.base) return null;
    const sig = `${ex.base.readAt}|${ex.base.users.length}|${ex.base.devices.length}|${ex.base.users.map((u) => u.id).join()}|${ex.base.devices.map((d) => d.id).join()}`;
    if (!exNowCache || exNowCache.sig !== sig) exNowCache = { sig, v: MdeExclude.excludedNow(ex.base, exOpt()) };
    return exNowCache.v;
  };
  async function exRead() {
    if (ex.loading) return;
    ex.loading = true; ex.error = ""; render();
    try {
      await Graph.ensureScopes(MdeExclude.scopes());
      ex.base = await MdeExclude.readBase(exGroups(), (m) => { const el = $("mvExProg"); if (el) el.textContent = m; });
    } catch (e) { ex.base = null; ex.error = GroupUse.shortErr(e, 300); }
    finally { ex.loading = false; render(); }
  }
  async function exSearch() {
    const input = $("mvExQ");
    ex.q = input ? input.value : ex.q;
    if (!ex.base) await exRead();
    if (!ex.base || ex.searching) return;
    ex.searching = true; ex.note = ""; render();
    try {
      const r = await MdeExclude.search(ex.q, ex.base, exOpt());
      ex.results = r.results;
      ex.note = r.note || [r.failed.length ? `Partly searched — ${r.failed.join("; ")}` : "", !r.results.length ? `Nothing found for “${r.term}”.` : ""].filter(Boolean).join(" ");
    } catch (e) { ex.results = []; ex.note = GroupUse.shortErr(e, 240); }
    finally { ex.searching = false; render(); const q = $("mvExQ"); if (q) q.focus(); }
  }
  // quiet: re-read after a run — the ticks the admin set are rebuilt from
  // the new state (what is excluded now is not offered again)
  async function exPick(pick, quiet) {
    if (!ex.base) return;
    ex.cardLoading = true; ex.cardError = ""; if (!quiet) ex.card = null; render();
    try {
      await Graph.ensureScopes(MdeExclude.scopes());
      ex.card = await MdeExclude.lookup(pick, ex.base, exOpt());
      for (const [id, n] of ex.card.names) if (!names.has(id)) names.set(id, n);
      ex.ticks = MdeExclude.defaultTicks(ex.card);
    } catch (e) { ex.cardError = GroupUse.shortErr(e, 300); }
    finally { ex.cardLoading = false; render(); }
  }
  function exDryRun() {
    if (busy || !ex.card) return;
    planAnchor = "mvExCard"; clearPlan(); seatPlan();
    const p = MdeExclude.planAdd(ex.card, exCtx());
    const who = ex.card.user ? ex.card.user.displayName : (ex.card.devices.find((d) => d.searched) || ex.card.devices[0] || {}).name || "";
    plan = Object.assign(p, { members: true, title: `Exclusion — ${who}` });
    renderMemPlan();
  }
  function exRemoveDryRun() {
    const n = exNow();
    if (busy || !n) return;
    const rows = n.rows.filter((r) => ex.sel.has(r.key));
    if (!rows.length) return;
    planAnchor = "mvExNow"; clearPlan(); seatPlan();
    const p = MdeExclude.planRemove(rows, exGroups());
    plan = Object.assign(p, { members: true, title: `Out of the exclusion groups — ${plural(rows.length, "row")}` });
    renderMemPlan();
  }
  const gName = (id) => names.get(lc(id)) || (ex.card && ex.card.names.get(lc(id))) || id;
  const shortDate = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? new Date(t).toLocaleDateString() : "never"; };
  const ago = (iso) => { const t = Date.parse(iso || ""); if (!Number.isFinite(t)) return "never"; const h = Math.round((Date.now() - t) / 3600000); return h < 1 ? "under an hour ago" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`; };
  // the waves (by region) an object is in, from its transitive groups
  const wavesIn = (groups, aud) => waveRows.filter((w) => w.role === "wave" && w.audience === aud && w.id && groups && groups.has(w.id)).map((w) => w.region);
  function exReachHtml(rows) {
    if (!rows.length) return "";
    const via = (list, gen) => { const ids = [...new Set(list.flatMap((x) => x.via))].slice(0, 3); return ids.length ? `${gen} via ${ids.map((id) => /^All /.test(id) ? id : gName(id)).join(", ")}` : ""; };
    const why = (a) => [
      a.new.length ? `${a.new.length} new ${via(a.new, "")}` : "",
      a.keptOut.new.length ? `kept out of ${a.keptOut.new.length} new ${via(a.keptOut.new, "")}` : "",
      a.old.length ? `${a.old.length} old ${via(a.old, "")}` : "",
      a.keptOut.old.length ? `kept out of ${a.keptOut.old.length} old ${via(a.keptOut.old, "")}` : "",
    ].filter(Boolean).map((x) => x.replace(/\s+$/, "")).join(" · ") || "nothing in scope reaches it";
    const filt = (a) => a.new.concat(a.old).some((x) => x.filtered) ? ` <span class="muted" title="An assignment filter sits on an include — a browser cannot evaluate it">· filtered</span>` : "";
    const lines = rows.map((r) => {
      const label = r.kind === "user" ? `👤 ${esc(r.obj.displayName)} <span class="muted">(- U - policies)</span>` : `💻 ${esc(r.obj.name)} <span class="muted">(- D - policies)</span>`;
      const after = r.after ? `<tr class="mr-exafter"><td class="mini">→ after the run</td><td class="mini"><b>${r.after.new.length}</b></td><td class="mini"><b${r.between ? ` style="color:var(--off)"` : ""}>${r.after.old.length}${r.between ? " ⚠" : ""}</b></td>
        <td class="mini">${r.between ? `<b style="color:var(--off)">Falls between the sets: nothing in scope reaches it</b>${r.kind === "user" ? " — the user stays in the dynamic country group, so in the user wave, which the old - U - policies exclude. T28 cannot take a user out of a dynamic group." : ""}` : r.leaves && r.leaves.length ? `out of ${esc(r.leaves.map((g) => g.name).join(", "))} — leaves the wave, back on the old set` : esc(why(r.after))}</td></tr>` : "";
      return `<tr><td class="mini">${label}</td><td class="mini" style="color:var(--on);font-weight:700">${r.before.new.length}</td><td class="mini">${r.before.old.length}</td><td class="mini">${esc(why(r.before))}${filt(r.before)}</td></tr>${after}`;
    }).join("");
    return `<div class="list-card mr-exreach" style="margin-top:12px"><h4 style="margin:0 0 6px">What reaches them <span class="mini muted" style="font-weight:400">— in-scope policies, from the last read · assignment filters are not evaluated</span></h4>
      <div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30%"><col style="width:64px"><col style="width:64px"><col></colgroup><thead><tr><th>Who</th><th>New</th><th>Old</th><th>Why</th></tr></thead><tbody>${lines}</tbody></table></div></div>`;
  }
  function exCardHtml() {
    if (ex.cardLoading && !ex.card) return `<div class="list-card" style="margin-top:12px"><p class="mini" style="margin:0">Reading the user, the devices and their groups…</p></div>`;
    if (ex.cardError) return `<div class="list-card" style="margin-top:12px"><div class="gu-fail"><b>${esc(ex.cardError)}</b></div></div>`;
    const c = ex.card;
    if (!c) return "";
    const G = exGroups();
    const u = c.user;
    const tick = (key, on, dis, label) => `<input type="checkbox" data-mrextick="${esc(key)}"${on ? " checked" : ""}${dis ? " disabled" : ""} aria-label="${esc(label)}">`;
    const countryOf = (groups) => [...(groups || [])].map(gName).filter((n) => lc(n).startsWith(lc(mcfg().countryPrefix)));
    const userHtml = u ? `<div class="mr-expc">
        <h4 style="margin:0 0 6px"><label style="display:flex;gap:8px;align-items:center">${tick(`u:${u.id}`, ex.ticks.has(`u:${u.id}`), u.excluded || !G.user, "exclude the user")} 👤 ${esc(u.displayName)}</label></h4>
        <dl class="mr-exkv">
          <dt>UPN</dt><dd>${esc(u.upn || "—")}</dd>
          <dt>Country group</dt><dd>${esc(countryOf(u.groups).join(", ") || (u.groups ? "none" : "not read"))}</dd>
          <dt>Wave</dt><dd>${u.groups ? (wavesIn(u.groups, "user").map((r) => `🌊 ${esc(r)}`).join(", ") || "none") : "not read"}</dd>
          <dt>User exclusion</dt><dd>${u.excluded ? chip("au-op create", "excluded") : G.user ? `<span class="muted">not in</span>${ex.ticks.has(`u:${u.id}`) ? " → will be added" : ""}` : `<span style="color:var(--off)">${esc(cfg.exclusionUser)} does not exist — create it in 🌊</span>`}</dd>
        </dl></div>`
      : `<div class="mr-expc"><h4 style="margin:0 0 6px">👤 No primary user</h4><p class="mini muted" style="margin:0">Intune names no primary user for this device${c.devices[0] && !c.devices[0].managed ? " — it is an Entra device Intune does not manage" : ""}.</p></div>`;
    const drows = c.devices.map((d) => {
      const can = !d.excluded && d.objId && G.device;
      const cg = MdeExclude.countryGroupsOf(d, exCtx()).map((g) => g.name);
      const waves = wavesIn(d.groups, "device");
      const st = d.excluded ? chip("au-op create", "excluded") : `<span class="muted">no</span>`;
      return `<tr class="${ex.ticks.has(d.key) ? "mr-selrow" : ""}${!d.objId ? " mr-exdis" : ""}"><td>${tick(d.key, ex.ticks.has(d.key), !can, `exclude ${d.name}`)}</td>
        <td><b>${esc(d.name)}</b>${d.searched ? ` <span class="gu-how priv">searched</span>` : ""}<div class="mini muted">${esc(d.os ? `Windows ${d.os}`.replace(/^Windows Windows/, "Windows") : (d.managed ? "Windows" : ""))}${d.disabled ? " · disabled in Entra" : ""}</div>${d.problem ? `<div class="mini" style="color:var(--off)">${esc(d.problem)}</div>` : ""}</td>
        <td class="mini">${d.managed ? `${esc(ago(d.lastSync))}${d.stale ? ` ${chip("gu-how priv", "stale")}` : ""}` : `<span class="muted">not in Intune</span>`}</td>
        <td class="mini">${esc(cg.join(", ") || "—")}${waves.length ? `<div>${waves.map((r) => `🌊 ${esc(r)}`).join(", ")}</div>` : ""}</td>
        <td class="mini">${st}</td></tr>`;
    }).join("");
    const devHtml = `<div class="mr-expc"><h4 style="margin:0 0 6px">💻 ${u ? `${esc(u.displayName)}'s Windows devices` : "The device"} <span class="mini muted" style="font-weight:400">(Intune primary user)</span></h4>
      ${c.devices.length ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30px"><col><col style="width:18%"><col style="width:28%"><col style="width:92px"></colgroup><thead><tr><th></th><th>Device</th><th>Last sync</th><th>Group · wave</th><th>Excluded</th></tr></thead><tbody>${drows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">No Windows device in Intune has this user as its primary user.</p>`}
      <p class="mini muted" style="margin:6px 0 0">${c.pick.type === "user" ? `Ticked: the user and every device that synced in the last ${exOpt().staleDays} days.` : "Ticked: the device you searched — its user stays as they are unless you tick them."} Stale devices are shown, not ticked.</p></div>`;
    const rows = MdeExclude.assess(c, model, exCtx());
    const plan0 = MdeExclude.planAdd(c, exCtx());
    const nU = plan0.ops.filter((x) => x.type === "add" && x.memberKind === "user").reduce((a, x) => a + x.ids.length, 0);
    const nD = plan0.ops.filter((x) => x.type === "add" && x.memberKind === "device").reduce((a, x) => a + x.ids.length, 0);
    const nOut = plan0.ops.filter((x) => x.type === "remove").reduce((a, x) => a + x.ids.length, 0);
    const sum = nU || nD ? [nU ? `<b>${plural(nU, "user")}</b> → ${esc(G.user ? G.user.displayName : "")}` : "", nD ? `<b>${plural(nD, "device")}</b> → ${esc(G.device ? G.device.displayName : "")}` : "", nOut ? `${plural(nOut, "device")} out of the country device group` : ""].filter(Boolean).join(" · ") : "tick the user or a device";
    return `<div id="mvExCard">
      ${c.failed.length ? `<div class="gu-fail" style="margin-top:12px"><b>Partly read:</b><span class="why">${c.failed.map(esc).join("<br>")}</span></div>` : ""}
      <div class="mr-expair">${userHtml}${devHtml}</div>
      ${exReachHtml(rows)}
      <div class="mr-mbar" id="mvExBar"><span>${sum}</span>
        <label class="chk" style="margin:0" title="⚔️ action ③ takes the waves out of the old policies — a wave device excluded from the new set would get neither"><input type="checkbox" id="mvExKeep"${ex.keepOld ? " checked" : ""}> keep devices on the old set (out of their country device group)</label>
        <button class="btn primary" id="mvExDry"${nU || nD ? "" : " disabled"}>② Dry run</button></div>
      ${ex.cardLoading ? `<p class="mini muted" style="margin:6px 0 0">Reading again…</p>` : ""}
    </div>`;
  }
  function exNowHtml() {
    const n = exNow();
    if (!n) return "";
    const G = exGroups();
    const rows = n.rows.map((r) => {
      const who = r.user ? `👤 ${esc(r.user.displayName)} ${r.user.excluded ? chip("au-op create", "excluded") : `<span class="muted mini">not excluded</span>`}${r.user.upn && r.user.upn !== r.user.displayName ? `<div class="mini muted">${esc(r.user.upn)}</div>` : ""}` : `<span class="muted">no primary user</span>`;
      const devs = r.devices.length ? r.devices.map((d) => `<div>💻 ${esc(d.name)} ${d.excluded ? chip("au-op create", "excluded") : chip("gu-how priv", d.stale ? "not excluded · stale" : "not excluded")}</div>`).join("") : `<span class="muted">no Windows device</span>`;
      const state = r.state === "half" ? `<b style="color:var(--off)">half: the - D - policies still reach ${esc(r.missing.map((d) => d.name).join(", "))}</b> <button class="btn" data-mrexfix="${esc(r.key)}">+ add device</button>`
        : r.state === "both" ? "both" : r.state === "user" ? `<span class="muted">user, no Windows device</span>` : `<span class="muted">device only</span>`;
      return `<tr class="${ex.sel.has(r.key) ? "mr-selrow" : ""}"><td><input type="checkbox" data-mrexsel="${esc(r.key)}"${ex.sel.has(r.key) ? " checked" : ""} aria-label="select"></td><td class="mini">${who}</td><td class="mini">${devs}</td><td class="mini">${state}</td></tr>`;
    }).join("");
    return `<div class="list-card" id="mvExNow" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><h4 style="margin:0">Excluded now</h4>
        <span class="mini muted">${esc(G.user ? G.user.displayName : cfg.exclusionUser)} <b>${n.users}</b> · ${esc(G.device ? G.device.displayName : cfg.exclusionDevice)} <b>${n.devices}</b> · read ${esc(new Date(ex.base.readAt).toLocaleTimeString())} <button class="btn" id="mvExRead">↻ Read again</button></span></div>
      ${rows ? `<div style="overflow-x:auto;margin-top:8px"><table class="cg-table"><colgroup><col style="width:30px"><col style="width:28%"><col style="width:30%"><col></colgroup><thead><tr><th></th><th>User</th><th>Their devices</th><th>State</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="tb-actions" style="margin-top:8px"><button class="btn" id="mvExRemDry"${ex.sel.size ? "" : " disabled"}>Take ${plural(ex.sel.size, "row")} out → dry run</button><span class="mini muted">Direct members only. A removal is typed: REMOVE.</span></div>`
        : `<p class="mini muted" style="margin:8px 0 0">Nobody is in the exclusion groups.</p>`}
    </div>`;
  }
  // ---------------------------------------------- ⊘ 📋 a list (10651) --
  // Mihai: "the exclusion should get a bulk add user and device"; option A
  // off the mockup — paste a list. One plan for the whole list, the same
  // steps as one card's, merged per group.
  const exListCards = () => (ex.list ? ex.list.items.filter((x) => x.card).map((x) => x.card) : []);
  // the tickable keys of the list, and whether a key's object can no
  // longer be ticked (in the exclusion group already, no Entra object)
  function exListCan() {
    const G = exGroups(), out = new Set();
    for (const c of exListCards()) {
      if (c.user && !c.user.excluded && G.user) out.add(`u:${c.user.id}`);
      c.devices.forEach((d) => { if (!d.excluded && d.objId && G.device) out.add(d.key); });
    }
    return out;
  }
  const exListLocked = (k) => !exListCan().has(k);
  async function exListRun() {
    const t = $("mvExListText"); if (t) ex.listText = t.value;
    const parsed = MdeExclude.parseList(ex.listText);
    if (!parsed.lines.length || ex.listBusy) return;
    if (!ex.base) await exRead();
    if (!ex.base) return;
    if (plan && plan.bulk && !busy) clearPlan();
    ex.listBusy = true; ex.listErr = ""; ex.listNote = `Looking up ${plural(parsed.lines.length, "line")}…`; render();
    try {
      await Graph.ensureScopes(MdeExclude.scopes());
      const L = await MdeExclude.resolveList(parsed.lines, ex.base, exOpt(), (m) => { if (!m) return; ex.listNote = m; const el = $("mvExListProg"); if (el) el.textContent = m; });
      L.truncated = parsed.truncated ? parsed.total : 0;
      for (const it of L.items) if (it.card) for (const [id, n] of it.card.names) if (!names.has(id)) names.set(id, n);
      ex.list = L; ex.lticks = MdeExclude.listTicks(L); ex.listNote = "";
    } catch (e) { ex.listErr = GroupUse.shortErr(e, 300); ex.listNote = ""; }
    finally { ex.listBusy = false; render(); }
  }
  async function exListFile(f) {
    if (!f) return;
    let text = "";
    try {
      text = typeof f.text === "function" ? await f.text() : await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => rej(r.error); r.readAsText(f); });
    } catch (e) { ex.listErr = `${f.name} could not be read: ${GroupUse.shortErr(e, 160)}`; render(); return; }
    const p = MdeExclude.parseList(text);
    ex.listText = p.values.join("\n");
    ex.listErr = p.total ? "" : `Nothing to look up in ${f.name}.`;
    ex.listNote = p.total ? `${f.name}: ${plural(p.total, "line")}${p.column ? ` from the column “${p.column}”` : ""} — check them, then Look them up.` : "";
    render();
    const ta = $("mvExListText"); if (ta) ta.focus();
  }
  function exListDryRun() {
    if (busy || !ex.list) return;
    planAnchor = "mvExList"; clearPlan(); seatPlan();
    const p = MdeExclude.planAddMany(exListCards(), exCtx(ex.lticks));
    plan = Object.assign(p, { members: true, title: `Exclusions — a list of ${plural(ex.list.items.length, "line")}` });
    renderMemPlan();
  }
  function exListHtml() {
    const G = exGroups();
    const parsed = MdeExclude.parseList(ex.listText);
    const L = ex.list;
    const ctx = exCtx(ex.lticks);
    const can = exListCan();
    const tick = (key, label) => `<input type="checkbox" data-mrexltick="${esc(key)}"${ex.lticks.has(key) && can.has(key) ? " checked" : ""}${can.has(key) ? "" : " disabled"} aria-label="${esc(label)}">`;
    const xChip = chip("au-op create", "excluded");
    const cty = mcfg().countryPrefix;
    const countryOf = (direct) => (direct || []).map((g) => g.name).filter((n) => lc(n).startsWith(lc(cty))).map((n) => MdeMembers.countryName(n.slice(cty.length)) || n);
    const devInto = (d, groups) => ex.lticks.has(d.key) && can.has(d.key)
      ? `${chip("au-op create", `+ ${G.device.displayName}`)}${ex.keepOld ? groups.map((g) => ` ${chip("au-op delete", `− out of ${g}`)}`).join("") : ""}` : "";
    const devNow = (d, groups) => d.excluded ? xChip : groups.length ? `in ${esc(groups.join(", "))}` : d.direct ? `<span class="muted">no country device group</span>` : d.objId ? `<span class="muted">groups not read</span>` : "—";
    const devLine = (d) => `${d.managed ? `last sync ${esc(ago(d.lastSync))}` : "not in Intune"}${d.stale ? ` ${chip("gu-how priv", "stale")}${ex.lticks.has(d.key) ? "" : ` <span class="muted">— not ticked</span>`}` : ""}${d.problem ? `<div style="color:var(--off)">${esc(d.problem)}</div>` : ""}`;
    const rows = !L ? "" : L.items.map((it) => {
      const line = `<b>${esc(it.line)}</b>`;
      const c = it.card;
      if (c && c.user) {
        const u = c.user, country = countryOf(u.direct);
        const uRow = `<tr class="${ex.lticks.has(`u:${u.id}`) && can.has(`u:${u.id}`) ? "mr-selrow" : ""}"><td>${tick(`u:${u.id}`, `exclude ${u.displayName}`)}</td>
          <td>${line} <span class="mini muted">user · ${esc(u.displayName)}${country.length ? ` · ${esc(country.join(", "))}` : ""}${c.devices.length ? "" : " · no Windows device"}</span></td>
          <td class="mini">${u.excluded ? xChip : "not excluded"}</td>
          <td class="mini">${ex.lticks.has(`u:${u.id}`) && can.has(`u:${u.id}`) ? chip("au-op create", `+ ${G.user.displayName}`) : ""}</td></tr>`;
        return uRow + c.devices.map((d) => {
          const groups = MdeExclude.countryGroupsOf(d, ctx).map((g) => g.name);
          return `<tr class="mr-exsubrow${ex.lticks.has(d.key) && can.has(d.key) ? " mr-selrow" : ""}"><td>${tick(d.key, `exclude ${d.name}`)}</td>
            <td class="mini mr-exsub">↳ <b>${esc(d.name)}</b> · ${devLine(d)}</td><td class="mini">${devNow(d, groups)}</td><td class="mini">${devInto(d, groups)}</td></tr>`;
        }).join("");
      }
      if (c) {
        const d = c.devices[0];
        if (!d) return "";
        const groups = MdeExclude.countryGroupsOf(d, ctx).map((g) => g.name);
        const who = d.upn ? `primary user ${esc(d.upn)}` : d.managed ? "no primary user" : "in Entra, not in Intune";
        return `<tr class="${ex.lticks.has(d.key) && can.has(d.key) ? "mr-selrow" : ""}"><td>${tick(d.key, `exclude ${d.name}`)}</td>
          <td>${line} <span class="mini muted">device · ${who}</span><div class="mini">${devLine(d)}</div>${it.note ? `<div class="mini muted">${esc(it.note)}</div>` : ""}</td>
          <td class="mini">${devNow(d, groups)}</td><td class="mini">${devInto(d, groups)}</td></tr>`;
      }
      const why = it.kind === "many" ? `${chip("gu-how priv", it.what === "users" ? `${it.count} users answer to this address` : `${it.count} devices have this name`)} <button type="button" class="btn" data-mrexone="${esc(it.line)}">🔎 open it in One at a time</button>`
        : it.kind === "notwin" ? `${chip("gu-how priv", "not a Windows device")} <span class="muted">${esc(it.note)} — nothing here targets it</span>`
        : it.kind === "listed" ? `<span class="muted">already in this list — with ${esc(it.note)}</span>`
        : it.kind === "error" ? `${chip("au-op delete", "could not be read")} <span class="muted">${esc(it.note)}</span>`
        : chip("gu-how priv", it.line.includes("@") ? "no user has this UPN or e-mail" : "no device in Intune or Entra has this name");
      return `<tr class="mr-exnomatch"><td class="muted">—</td><td>${line}</td><td class="mini" colspan="2">${why}</td></tr>`;
    }).join("");
    let table = "";
    if (L) {
      const k = (x) => L.items.filter((i) => i.kind === x).length;
      const sum = [`${plural(L.items.length, "line")}`, k("user") ? plural(k("user"), "user") : "", k("device") ? plural(k("device"), "device") : "",
        k("none") ? `${k("none")} no match` : "", k("many") ? `${k("many")} with several matches` : "", k("notwin") ? `${k("notwin")} not Windows` : "",
        k("listed") ? `${k("listed")} twice` : "", k("error") ? `${k("error")} not read` : ""].filter(Boolean).join(" · ");
      const allOn = can.size > 0 && [...can].every((x) => ex.lticks.has(x));
      const p0 = MdeExclude.planAddMany(exListCards(), ctx);
      const n = p0.counts;
      const bar = n.users || n.devices ? `<b>${[n.users ? plural(n.users, "user") : "", n.devices ? plural(n.devices, "device") : ""].filter(Boolean).join(" · ")}</b> → the exclusion groups${n.out ? ` · ${plural(n.out, "device")} out of their country group` : ""}` : "tick a user or a device";
      table = `<p class="mini" style="margin:12px 0 6px"><b>${esc(sum)}</b> <span class="muted">· looked up ${esc(new Date(L.readAt).toLocaleTimeString())}</span></p>
        ${L.truncated ? `<div class="gu-fail" style="margin-bottom:8px;border-color:var(--report)"><b>Only the first ${MdeExclude.MAX_LINES} of ${L.truncated} lines were looked up.</b><span class="why">Split the list, and look up the rest after this one.</span></div>` : ""}
        ${L.failed.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>Partly read:</b><span class="why">${L.failed.slice(0, 5).map(esc).join("<br>")}${L.failed.length > 5 ? `<br>… and ${L.failed.length - 5} more` : ""}</span></div>` : ""}
        <div style="overflow-x:auto"><table class="cg-table mr-exlist-t"><colgroup><col style="width:30px"><col><col style="width:20%"><col style="width:30%"></colgroup>
          <thead><tr><th><input type="checkbox" id="mvExListAll"${allOn ? " checked" : ""}${can.size ? "" : " disabled"} aria-label="tick everything that can be"></th><th>Line → match</th><th>Now</th><th>Into the exclusion groups</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="mini muted" style="margin:6px 0 0">A user comes with their Windows devices (Intune primary user); the ones that synced in the last ${exOpt().staleDays} days are ticked. A device comes alone — its user is named, not ticked.</p>
        <div class="mr-mbar" id="mvExListBar"><span>${bar}</span>
          <label class="chk" style="margin:0" title="⚔️ action ③ takes the waves out of the old policies — a wave device excluded from the new set would get neither"><input type="checkbox" id="mvExKeep"${ex.keepOld ? " checked" : ""}> keep devices on the old set (out of their country device group)</label>
          <button class="btn primary" id="mvExListDry"${n.users || n.devices ? "" : " disabled"}>② Dry run</button></div>`;
    }
    return `<div id="mvExList">
      <textarea id="mvExListText" class="mr-exlisttext" rows="6" spellcheck="false" autocomplete="off" placeholder="anna.bakker@contoso.com&#10;jan.devries@contoso.com; LT-NL-0233&#10;KIOSK-NL-01" aria-label="Users and devices, one per line">${esc(ex.listText)}</textarea>
      <div class="tb-actions" style="margin-top:8px;align-items:center">
        <button class="btn primary" id="mvExListGo"${ex.listBusy || !parsed.lines.length ? " disabled" : ""}>${ex.listBusy ? "Looking up…" : `Look them up · ${plural(parsed.lines.length, "line")}`}</button>
        <label class="btn mr-exfile" title="A .csv with a UPN, e-mail or device name column, or a .txt with one per line">⭱ .csv / .txt<input type="file" id="mvExListFile" accept=".csv,.txt,text/csv,text/plain"></label>
        <span class="mini muted" id="mvExListProg">${esc(ex.listNote)}</span>
      </div>
      ${ex.listErr ? `<div class="gu-fail" style="margin-top:8px"><b>${esc(ex.listErr)}</b></div>` : ""}
      ${table}
    </div>`;
  }
  function exclusionsPane() {
    const G = exGroups();
    const groupsLine = `Users go to <code>${esc(G.user ? G.user.displayName : cfg.exclusionUser)}</code> (the <code>- U -</code> policies), devices to <code>${esc(G.device ? G.device.displayName : cfg.exclusionDevice)}</code> (the <code>- D -</code> ones). An excluded device also leaves its country device group, so it stays on the old set.`;
    const intro = ex.mode === "list" && ex.base
      ? `<p class="mini muted" style="margin:0 0 10px">Paste UPNs, e-mail addresses or device names — one per line, or separated by commas or semicolons — or drop a .csv or .txt file. <b>Look them up</b> matches each line exactly: a UPN or e-mail to a user, a name to a device. ${groupsLine}</p>`
      : `<p class="mini muted" style="margin:0 0 10px">Search a user (name, UPN, e-mail) or a device (name). A user comes with their Windows devices, a device with its primary user, and each with what reaches it. ${groupsLine}</p>`;
    const missingG = [!G.user ? cfg.exclusionUser : "", !G.device ? cfg.exclusionDevice : ""].filter(Boolean);
    const warn = missingG.length ? `<div class="gu-fail" style="margin-bottom:10px;border-color:var(--report)"><b>${missingG.map(esc).join(" and ")} ${missingG.length === 1 ? "does" : "do"} not exist.</b><span class="why">Create ${missingG.length === 1 ? "it" : "them"} in <a href="#" data-mrpane="waves">🌊 Wave groups</a> first; until then that side cannot be added.</span></div>` : "";
    if (!ex.base) return `<div class="list-card" style="margin-top:0">${intro}${warn}
      ${ex.error ? `<div class="gu-fail" style="margin-bottom:10px"><b>${esc(ex.error)}</b></div>` : ""}
      ${ex.loading ? `<p class="mini" id="mvExProg" style="margin:0">Reading…</p>` : `<div class="tb-actions"><button class="btn primary" id="mvExRead">⊘ Read the exclusion groups and devices</button></div><p class="mini muted" style="margin:8px 0 0">Reads both exclusion groups and every Windows device in Intune (its primary user). Read-only.</p>`}</div>`;
    const res0 = ex.results || [];
    const hits = res0.map((h, i) => `<button type="button" class="mr-exhit${ex.card && ex.card.pick === h ? " on" : ""}" data-mrexpick="${i}">
        <span class="mr-exk${h.type === "device" ? " d" : ""}">${h.type === "user" ? "USER" : "DEVICE"}</span><b>${esc(h.type === "user" ? h.displayName : h.name)}</b>
        <span class="muted">${esc(h.type === "user" ? h.upn : (h.primary ? `primary user ${h.primary}` : h.managed ? "no primary user" : "not in Intune"))}</span>
        <span class="mr-exr">${h.type === "user" ? `${plural(h.devices, "Windows device")}` : esc(h.os || "")}${h.excluded ? ` · <b style="color:var(--on)">excluded</b>` : ""}${h.stale ? " · stale" : ""}</span></button>`).join("");
    const modes = `<div class="mr-fixwith"><span class="seg" role="group" aria-label="One at a time or a list"><button type="button" class="${ex.mode === "list" ? "" : "active"}" data-mrexmode="one">🔎 One at a time</button><button type="button" class="${ex.mode === "list" ? "active" : ""}" data-mrexmode="list">📋 A list</button></span><span class="mini muted">${ex.mode === "list" ? "UPN · e-mail · device name — one per line, or , ;" : "name · UPN · e-mail · device name"}</span></div>`;
    if (ex.mode === "list") return `<div class="list-card mr-stickyhost" style="margin-top:0">${modes}${intro}${warn}${exListHtml()}</div>${exNowHtml()}`;
    return `<div class="list-card mr-stickyhost" style="margin-top:0">${modes}${intro}${warn}
      <div class="mr-exsearch"><input id="mvExQ" type="search" placeholder="Search a user or device…" value="${esc(ex.q)}" autocomplete="off" spellcheck="false" aria-label="Search a user or device"><button class="btn primary" id="mvExGo"${ex.searching ? " disabled" : ""}>${ex.searching ? "Searching…" : "Search"}</button></div>
      ${ex.note ? `<p class="mini muted" style="margin:6px 0 0">${esc(ex.note)}</p>` : ""}
      ${hits ? `<div class="mr-exresults">${hits}</div>` : ""}
      ${exCardHtml()}
    </div>${exNowHtml()}`;
  }
  function openExclusions() {
    pane = "exclusions"; view.cat = null; view.state = null; view.q = "";
    render();
    const focus = () => { const x = $(ex.mode === "list" ? "mvExListText" : "mvExQ"); if (x) x.focus(); };
    focus();
    if (!ex.base && !ex.loading) exRead().then(focus);
  }

  // ---------------------------------------------------------- 📑 reports --
  // Three reports, each a self-contained HTML page and a CSV (MdeReports).
  const repMeta = () => ({ tenant: tenantName(), readAt: res && res.readAt, build: typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "", now: Date.now() });
  const repCtx = () => ({ cfg, waveRows, kinds, labels, mem: mem.model, retire, runs, labelName: M.labelName, labelValue: M.labelValue, catMeta: M.catMeta, RETIRE: M.RETIRE });
  function runAssignReport() {
    if (reps.busy || running || busy) return;
    reps.error = "";
    const ctx = repCtx();
    const cov = MdeReports.coverage(model, ctx);
    reps.assign = { at: Date.now(), html: MdeReports.assignmentsHtml(model, ctx, repMeta()), csv: MdeReports.assignmentsCsv(model, ctx), cov, ...reportSnapshot() };
    render();
  }
  async function runConfigReport() {
    if (reps.busy || running || busy || mem.loading) return;
    reps.error = "";
    reps.busy = "config"; render();
    try {
      if (!mem.model) {
        const back = pane;
        await memRead();
        pane = back;
      }
      let owners = new Map();
      try { owners = await MdeReports.readOwners(waveRows.filter((w) => w.exists).map((w) => w.group)); } catch { owners = new Map(); }
      const ctx = Object.assign(repCtx(), { owners });
      reps.config = { at: Date.now(), html: MdeReports.configHtml(model, ctx, repMeta()), csv: MdeReports.configCsv(model, ctx), members: !!mem.model, membersAt: mem.model && mem.model.readAt, ownersAt: Date.now(), ...reportSnapshot() };
    } catch (e) { reps.error = `Configuration report failed: ${GroupUse.shortErr(e, 250)}`; }
    finally { reps.busy = ""; render(); }
  }
  async function runConflictCheck() {
    if (reps.busy || running || busy) return;
    reps.error = "";
    reps.busy = "conflicts"; render();
    try {
      const refreshed = await run(false); // a fresh read, never relabel an old model as fresh
      if (!refreshed || !model) { reps.error = "Fresh read failed. The previous report, if any, is retained; no new check was saved."; return; }
      const summary = MdeReports.conflictSummary(pairs, M.needsAction);
      const prev = reps.checks.length ? reps.checks[reps.checks.length - 1] : null;
      const diff = MdeReports.conflictDiff(prev, summary);
      reps.checks.push(Object.assign({ at: Date.now() }, summary));
      const ctx = { labels, labelName: M.labelName, labelValue: M.labelValue, VERDICT: M.VERDICT, TYPE: M.TYPE, needsAction: M.needsAction, summary, diff };
      reps.conflicts = { at: Date.now(), html: MdeReports.conflictsHtml(pairs, ctx, repMeta()), csv: M.csv(pairs), summary, diff, ...reportSnapshot() };
    } catch (e) { reps.error = `Conflict check failed: ${GroupUse.shortErr(e, 250)}`; }
    finally { reps.busy = ""; pane = "reports"; render(); }
  }
  const REPORTS = [
    { id: "assign", icon: "📋", title: "Assignments", source: "Current policy snapshot", description: "Coverage by wave, plus every assignment with its target, group kind, members, filter and rollout role." },
    { id: "config", icon: "🧾", title: "Deployment configuration", source: "Policies, members & owners", description: "Naming rules, wave groups, members, policy settings, retirement evidence and changes this session." },
    { id: "conflicts", icon: "⚔️", title: "Conflict check", source: "Fresh tenant read", description: "Compare the new and old settings, their reach and proposed fixes. Each check shows what changed since the previous check this session." },
  ];
  const reportTime = (at) => at ? new Date(at).toLocaleString() : "Not read";
  const shortTime = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  // A saved report predates the current read, rules, member read or writes.
  function reportStale(id) {
    const r = reps[id];
    return !!r && (r.source !== res || r.rules !== JSON.stringify(cfg) || r.runCount !== runs.length || (id !== "conflicts" && r.memberSource !== mem.model));
  }
  const reportSnapshot = () => ({ readAt: res && res.readAt, source: res, memberSource: mem.model, rules: JSON.stringify(cfg), runCount: runs.length,
    missing: (model.missing || []).map((x) => x.id) });
  // Preview the exact saved export, not the current mutable policy model.
  // The HTML is generated by MdeReports, which escapes every tenant value.
  function reportPreview(report, id) {
    const holder = document.createElement("div");
    holder.innerHTML = report.html;
    const wrap = holder.querySelector(".wrap");
    if (!wrap) return "";
    const drop = (el) => { if (el) el.remove(); };   // (no optional chaining — house rule)
    drop(wrap.querySelector("h1"));
    drop(wrap.querySelector(".meta"));
    // Long exception lists are evidence, not another wall above the matrix.
    for (const note of [...wrap.querySelectorAll(".note")]) {
      if (note.textContent.length < 300) continue;
      const fold = document.createElement("details"); fold.className = "mr-report-section";
      const summary = document.createElement("summary");
      summary.textContent = note.textContent.split(":")[0];
      note.replaceWith(fold); fold.append(summary, note);
    }
    if (id === "assign") {
      const coverage = wrap.querySelector("table");
      if (coverage) {
        const groups = document.createElement("div");
        const rows = [...coverage.rows];
        let groupTable = null;
        for (const row of rows.slice(1)) {
          if (row.classList.contains("head")) {
            const fold = document.createElement("details"); fold.className = "mr-report-group";
            fold.open = !groups.children.length;
            const summary = document.createElement("summary"); summary.textContent = row.textContent;
            groupTable = document.createElement("table"); groupTable.appendChild(rows[0].cloneNode(true));
            fold.append(summary, groupTable); groups.appendChild(fold);
          } else if (groupTable) groupTable.appendChild(row.cloneNode(true));
        }
        if (groups.children.length) coverage.replaceWith(groups);
      }
    }
    const footer = wrap.lastElementChild;
    let section = null;
    let firstSection = true;
    for (const child of [...wrap.children]) {
      if (child.tagName === "H2") {
        section = document.createElement("details");
        section.className = "mr-report-section";
        // The useful first result stays visible; supporting evidence folds.
        section.open = firstSection;
        firstSection = false;
        const summary = document.createElement("summary");
        summary.textContent = child.textContent;
        child.replaceWith(section); section.appendChild(summary);
      } else if (section && child !== footer) section.appendChild(child);
    }
    // Tables scroll within the report; long names remain intact.
    for (const table of [...wrap.querySelectorAll("table")]) {
      if (table.parentElement.closest("table")) continue;
      const scroll = document.createElement("div"); scroll.className = "mr-report-table";
      scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Report table — scroll horizontally for all columns"); scroll.tabIndex = 0;
      table.replaceWith(scroll); scroll.appendChild(table);
    }
    return `<div class="mr-document" data-report-preview="${id}">${wrap.innerHTML}</div>`;
  }
  function reportsPane() {
    const def = REPORTS.find((r) => r.id === reps.selected) || REPORTS[0];
    const r = reps[def.id];
    const stale = reportStale(def.id);
    const exports = r ? `<details class="mr-export"><summary class="btn">Export ▾</summary><div class="mr-export-menu"><button class="btn" data-mrrepopen="${def.id}">Open report in new tab</button><button class="btn" data-mrrep="${def.id}" data-mrrepfmt="html">HTML report</button><button class="btn" data-mrrep="${def.id}" data-mrrepfmt="csv">${def.id === "config" ? "Policy settings CSV" : def.id === "conflicts" ? "Collisions CSV" : "Assignments CSV"}</button></div></details>` : "";
    const metadata = r ? `<div class="mr-report-meta"><span><b>Policy data</b> ${esc(reportTime(r.readAt))}</span><span><b>Generated</b> ${esc(reportTime(r.at))}</span>${r.membersAt ? `<span><b>Members</b> ${esc(reportTime(r.membersAt))}</span>` : ""}${r.ownersAt ? `<span><b>Owners attempted</b> ${esc(reportTime(r.ownersAt))}</span>` : ""}</div>` : "";
    const warning = stale ? `<p class="mr-report-notice">This saved report predates the current policy/member read, rules or session changes. Generate it again to update the preview and exports.</p>` : "";
    const missing = r && r.missing.length ? `<p class="mr-report-notice">Incomplete policy read: ${r.missing.map(esc).join(", ")}. These surfaces are not included in this report.</p>` : "";
    const memberWarning = r && def.id === "config" && !r.members ? `<p class="mr-report-notice">Wave members could not be read; that report section is incomplete.</p>` : "";
    const jump = r && def.id === "conflicts" ? `<p class="mini mr-report-jump"><a href="#" data-mrpane="conflicts">Open Conflicts to review proposed changes →</a></p>` : "";
    return `<section id="mvReportPanel" class="mr-report-panel" aria-label="${esc(def.title)}"><div class="mr-report-heading"><div><h3>${def.icon} ${esc(def.title)}</h3><p class="mini">${esc(def.description)} <span class="muted">· ${esc(def.source)} · the latest of each report is kept for this session</span></p></div><div class="tb-actions"><button class="btn primary" id="mvRep_${def.id}"${reps.busy || running || busy || mem.loading ? " disabled" : ""}>${reps.busy === def.id ? "Running…" : def.id === "conflicts" ? "Run fresh check" : r ? "↻ Generate again" : "Generate report"}</button>${exports}</div></div>${metadata}${warning}${missing}${memberWarning}${reps.error ? `<p class="mr-report-notice" role="alert">${esc(reps.error)}</p>` : ""}${jump}${r ? reportPreview(r, def.id) : `<div class="mr-report-empty"><h4>No report generated yet</h4><p>${esc(def.id === "conflicts" ? "Run a fresh read to check conflicts. This does not apply changes." : def.id === "config" ? "Generate from the current policy snapshot. Wave members are read if needed, and owners are requested when you generate." : "Generate from the current policy snapshot. Refresh the tenant first if you need newer data.")}</p></div>`}</section>`;
  }
  function openReport(id) {
    const r = reps[id];
    if (!r) return;
    const url = URL.createObjectURL(new Blob([r.html], { type: "text/html" }));
    const win = window.open(url, "_blank", "noopener");
    if (!win) download(`MDE-rollout-${id}-${stamp()}.html`, r.html, "text/html");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ----------------------------------------------------- rename waves --
  // (10635) Groups still carrying an earlier wave name: PATCH the name, read
  // it back, and log the run so 📜 can rename them back.
  async function renameWaves(list, back) {
    if (busy) return;
    busy = true;
    try {
      await Graph.ensureScopes(GroupMigrate.SCOPES.groupWrite);
      if ($("mvRenameGo")) $("mvRenameGo").disabled = true;
      const L = RunLedger.create($("mvWaveLedger") || planEl(), { unit: "groups", title: back ? "renaming back" : "renaming rollout groups", items: list.map((x) => ({ label: `${x.from} → ${x.to}`, sub: "display name + mail nickname" })) });
      const done = [], lines = [];
      let okN = 0;
      for (let i = 0; i < list.length; i++) {
        const x = list[i];
        if (L.stopped) { L.skip(i, "stopped"); lines.push(`${x.from}: skipped`); continue; }
        L.start(i);
        try {
          const r = await M.renameGroup({ id: x.id, displayName: x.from }, x.to);
          if (!r.ok) { L.fail(i, r.why, "not renamed"); lines.push(`${x.from}: ${r.why}`); continue; }
          if (found) { found.set(lc(x.to), r.group); if (found.get(lc(x.from)) && lc(found.get(lc(x.from)).id) === lc(x.id)) found.set(lc(x.from), null); }
          names.set(lc(x.id), x.to);
          done.push({ id: x.id, from: x.from, to: x.to });
          if (r.verified) { L.done(i, r.note, "renamed · verified"); okN++; lines.push(`${x.from} → ${x.to}: renamed · verified${r.note ? " — " + r.note : ""}`); }
          else { L.fail(i, "the read-back does not show the new name yet", "renamed · NOT verified"); lines.push(`${x.from} → ${x.to}: renamed · not verified`); }
        } catch (e) { const why = GroupUse.shortErr(e, 200); L.fail(i, why); lines.push(`${x.from}: failed — ${why}`); }
      }
      L.finish();
      selRename.clear();
      derive();
      runs.push({ at: Date.now(), title: back ? `Rename ${plural(list.length, "group")} back` : `Rename ${plural(list.length, "rollout group")}`, kind: "rename", ok: okN, bad: list.length - okN, stopped: L.stopped, backup: { policies: [] }, done, lines });
      const ledger = ($("mvWaveLedger") || planEl()).innerHTML;
      render();
      if ($("mvWaveLedger")) $("mvWaveLedger").innerHTML = ledger;
    } catch (e) {
      const el = $("mvWaveLedger"); if (el) el.innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
    } finally { busy = false; }
  }

  // ----------------------------------------------------- create waves --
  async function createWaves() {
    if (busy || !selWaves.size || !$("mvWaveOk").checked) return;
    busy = true;
    const list = [...selWaves];
    try {
      await Graph.ensureScopes(GroupMigrate.SCOPES.groupWrite);
      $("mvWaveCreate").disabled = true;
      // the creator is the owner (10633): who is signed in, in this tenant
      let me = null;
      try { me = await M.readMe(); } catch { me = null; }
      const L = RunLedger.create($("mvWaveLedger"), { unit: "groups", title: "creating rollout groups", items: list.map((n) => { const d = cfg.groups.find((g) => lc(g.name) === lc(n)); return { label: n, sub: `${d ? `${d.audience} ${d.role === "exclusion" ? "exclusion" : "wave"} · ` : ""}assigned security group` }; }) });
      const lines = [];
      let okN = 0;
      for (let i = 0; i < list.length; i++) {
        if (L.stopped) { L.skip(i, "stopped"); lines.push(`${list[i]}: skipped`); continue; }
        L.start(i, "checking the name…");
        try {
          const def = cfg.groups.find((g) => lc(g.name) === lc(list[i]));
          const r = await M.createWave(list[i], def && def.role === "exclusion" ? cfg.exclusionDescription : cfg.waveDescription, me);
          const who = me ? (me.userPrincipalName || me.displayName || "you") : "";
          if (r.skipped) { L.skip(i, r.why); lines.push(`${list[i]}: ${r.why}`); }
          else if (!r.verified) { L.fail(i, r.verifyError, "created · NOT verified"); lines.push(`${list[i]}: created · not verified — ${r.verifyError}`); }
          else if (me && !r.ownerVerified) { L.fail(i, `created, but you are not its owner — ${r.ownerNote || "the owners read does not list you"}. Add yourself in Entra (Groups → Owners).`, "created · owner NOT set"); lines.push(`${list[i]}: created · verified, owner NOT set — ${r.ownerNote}`); }
          else { L.done(i, r.ownerNote || "", me ? "created · verified · owner: you" : "created · verified"); okN++; lines.push(`${list[i]}: created · verified${me ? ` · owner ${who}` : " · owner not read (the signed-in user could not be read)"} (${r.group.id})`); }
          if (found && r.group) found.set(lc(list[i]), r.group);
          if (r.group && r.group.id) names.set(lc(r.group.id), r.group.displayName || list[i]);
        } catch (e) { const why = GroupUse.shortErr(e, 200); L.fail(i, why); lines.push(`${list[i]}: failed — ${why}`); }
      }
      L.finish();
      selWaves.clear();
      // the new groups are empty assigned groups — their kind comes from the name until someone joins
      const ids = list.map((n) => found && found.get(lc(n))).filter((g) => g && g.id).map((g) => lc(g.id));
      try { kinds = await M.readKinds(ids, null, kinds); } catch { /* kinds stay by name */ }
      derive();
      runs.push({ at: Date.now(), title: `Create ${plural(list.length, "rollout group")}`, kind: "groups", ok: okN, bad: list.length - okN, stopped: L.stopped, backup: { policies: [] }, lines });
      const ledger = $("mvWaveLedger").innerHTML;
      render();
      if ($("mvWaveLedger")) $("mvWaveLedger").innerHTML = ledger;
    } catch (e) {
      const el = $("mvWaveLedger"); if (el) el.innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
    } finally { busy = false; }
  }

  // ------------------------------------------------------------ popout --
  function openPolicy(key) {
    const P = model && model.byKey.get(key);
    if (!P) return;
    const editable = typeof AssignEditTool !== "undefined" && AssignEditTool.canEdit && AssignEditTool.canEdit(P.sectionId);
    $("mvPopBody").innerHTML = `${Docs.popoutHtml(P.sec, P.item)}
      <div class="gu-m-foot">
        ${editable ? `<button class="btn" id="mvPopEdit" title="Open ✏️ the Assignment editor with this policy selected">✏️ Assignment editor</button>` : ""}
        <div class="spacer"></div>
        <button class="btn primary" id="mvPopClose">Close</button>
      </div>`;
    $("mvPop").classList.add("open");
    $("mvPopClose").addEventListener("click", closePolicy);
    if (editable) $("mvPopEdit").addEventListener("click", () => { closePolicy(); AssignEditTool.openWith(P.sectionId, P.id); });
    $("mvPop").onclick = (e) => { if (e.target === $("mvPop")) closePolicy(); };
    document.addEventListener("keydown", onEsc);
  }
  function closePolicy() { $("mvPop").classList.remove("open"); document.removeEventListener("keydown", onEsc); }
  function onEsc(e) { if (e.key === "Escape") closePolicy(); }

  // ------------------------------------------------------------ export --
  function exportAs(fmt) {
    if (!model) return;
    if (fmt === "md") return download(`MDE-rollout-${stamp()}.md`, M.markdown(model, pairs, retire, waveRows, { tenant: tenantName(), readAt: res && res.readAt, build: typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "" }), "text/markdown");
    return download(`MDE-rollout-collisions-${stamp()}.csv`, M.csv(pairs), "text/csv");
  }

  // -------------------------------------------------------------- init --
  function init() {
    const workspace = document.getElementById("t28Workspace2");
    if (workspace) for (const event of ["click", "input", "change"]) workspace.addEventListener(event, (e) => {
      if ((busy || running || mem.loading || reps.busy) && !e.target.closest(".stop")) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    if (!$("mvRun")) return;
    planEl();
    $("mvRun").addEventListener("click", () => run(false));
    $("mvMd").addEventListener("click", () => exportAs("md"));
    $("mvCsv").addEventListener("click", () => exportAs("csv"));
    const body = $("mvBody");
    const focusOn = (sel) => { const el = body.querySelector(sel); if (el) el.focus(); };
    const go = (p) => { if (p === "edgeext") { openEdgeExt(); focusOn(`.mr-navigation [data-mrpane="${p}"]`); return; } pane = p; view.cat = null; view.state = null; view.q = ""; render(); focusOn(`.mr-navigation [data-mrpane="${p}"]`); };
    body.addEventListener("change", (e) => { if (e.target.id === "mvLeftOutOpt") { v2AllowLeftOut = e.target.checked; asr.edits.clear(); clearPlan(); render(); } if (e.target.id === "mvImportRuns") v2Import(e.target.files[0]); });
    body.addEventListener("click", (e) => {
      // 10683 (Mihai: "button not working" — ⭳ CSV): flat-icons wraps a
      // button's icon and words in span.fi-run, so a click on the words has
      // that span as its target and every t.id check missed. A click inside
      // an icon run is the button's.
      const t = (e.target.closest && e.target.closest(".fi-run, .enca-icon-slot") && e.target.closest("button, a, [role=button]")) || e.target;
      if (t.closest("[data-v2-export]")) { v2Export(); return; }
      const rdb = t.closest("[data-mrread]"); if (rdb) { run(rdb.dataset.mrread === "attach"); return; }
      const reportChoice = t.closest("[data-mrreport]");
      if (reportChoice) { reps.selected = reportChoice.dataset.mrreport; reps.error = ""; pane = "reports"; render(); focusOn(`[data-mrreport="${reps.selected}"]`); return; }
      const nd = t.closest("[data-mrpane]"); if (nd) { e.preventDefault(); go(nd.dataset.mrpane); return; }
      const op = t.closest("[data-mropen]"); if (op) { e.preventDefault(); openPolicy(op.dataset.mropen); return; }
      const c = t.closest("[data-mrcat]"); if (c) { view.cat = c.dataset.mrcat || null; render(); return; }
      const st = t.closest("[data-mrstate]"); if (st) { view.state = st.dataset.mrstate || null; render(); return; }
      const ss = t.closest("[data-mrstatus]"); if (ss) { view.status = ss.dataset.mrstatus; render(); return; }
      const fo = t.closest("[data-mrfold]"); if (fo) { e.preventDefault(); const k = fo.dataset.mrfold; open.has(k) ? open.delete(k) : open.add(k); render(); return; }
      const gg = t.closest("[data-mrgo]"); if (gg) { e.preventDefault(); const P = model.byKey.get(gg.dataset.mrgo); pane = "conflicts"; view.status = "act"; view.cat = null; view.q = P ? P.name : ""; render(); return; }
      const wi = t.closest("[data-mrwaveinc]"); if (wi) {
        e.preventDefault();
        const w = waveRows.find((x) => x.name === wi.dataset.mrwaveinc);
        sel.clear();
        (w ? w.fits : model.newP).filter((N) => N.surface && !(w && w.id && N.reach.inc.has(w.id))).forEach((N) => sel.add(N.key));
        pane = "new"; view.cat = null; view.state = null; view.q = "";
        setSeg("mvActSeg", "data-mract", "add-include"); setSeg("mvTargetSeg", "data-mrtarget", "group");
        $("mvGroup").value = w ? w.name : "";
        render(); return;
      }
      const xe = t.closest("[data-mrexcl]"); if (xe) {
        e.preventDefault();
        const w = waveRows.find((x) => x.name === xe.dataset.mrexcl);
        sel.clear();
        (w ? w.fits : []).filter((N) => N.surface && !(w.id && N.reach.exc.has(w.id))).forEach((N) => sel.add(N.key));
        pane = "new"; view.cat = null; view.state = null; view.q = "";
        setSeg("mvActSeg", "data-mract", "add-exclude"); setSeg("mvTargetSeg", "data-mrtarget", "group");
        $("mvGroup").value = w ? w.name : "";
        render(); return;
      }
      const wf = t.closest("[data-mrwavefix]"); if (wf) {
        e.preventDefault();
        const gid = lc(wf.dataset.mrwavefix);
        selPairs.clear();
        pairs.filter((pr) => M.needsAction(pr) && pr.N.reach.inc.has(gid) && pr.proposal && pr.proposal.steps.some((s) => (s.groupId === gid || s.twinOfId === gid) && s.supported !== false)).forEach((pr) => selPairs.add(pr.id));
        pane = "conflicts"; view.status = "act"; view.cat = null; view.q = ""; $("mvGroup").value = "";
        render(); return;
      }
      const bk = t.closest("[data-mrrunbk]"); if (bk) { const r = runs[Number(bk.dataset.mrrunbk)]; if (r) download(`t28-assignments-before-${stamp()}.json`, JSON.stringify(r.backup, null, 2), "application/json"); return; }
      const un = t.closest("[data-mrundo]"); if (un) { undoRun(Number(un.dataset.mrundo)); return; }
      // 🎛 Adjust settings (10657)
      const af = t.closest("[data-mrasrf]"); if (af) { asr.filter = af.dataset.mrasrf; render(); return; }
      if (t.id === "mvAsrBase") { asrSetBaseline(); return; }
      if (t.id === "mvAsrClear" || t.id === "mvAsrDiscard") { asr.edits.clear(); clearPlan(); render(); return; }
      if (t.id === "mvAsrDry") { asrDryRunEdits(); return; }
      // 🧩 Edge extensions (10678)
      const xtf = t.closest("[data-mrextf]"); if (xtf) { ext.filter = xtf.dataset.mrextf; render(); return; }
      if (t.id === "mvExtDiscard") { ext.edits.clear(); clearPlan(); render(); return; }
      if (t.id === "mvExtDry") { extDryRun(null, null); return; }
      if (t.id === "mvExtGo") { extSearch(); return; }
      if (t.id === "mvExtRouteSave") {
        const c = TunoAddons.checkRoute($("mvExtRoute") ? $("mvExtRoute").value : "");
        if (!c.ok) { ext.routeMsg = c.why; const m = $("mvExtRouteMsg"); if (m) m.textContent = c.why; return; }
        TunoAddons.setRoute(c.value); ext.routeMsg = c.value ? "Saved for this browser." : "Route removed — paste mode."; ext.hits = null; ext.note = "";
        render();
        const P = extPolicy(); if (P && c.value) { extLookup(extIdsOf(extNow(P)), true); extResolve(false); }
        return;
      }
      if (t.id === "mvExtLookupAll") { const P = extPolicy(); if (P) { extLookup(extIdsOf(extNow(P)).concat([...ext.edits.values()].map((e) => e.entry.id)), true); extResolve(true); } return; }
      if (t.id === "mvExtResolve") { if (ext.list) { for (const k of Object.keys(ext.list.ids)) if (ext.list.ids[k].how !== "operator" && ext.list.ids[k].how !== "pick" && ext.list.ids[k].how !== "column") delete ext.list.ids[k]; extResolve(true); } return; }
      if (t.id === "mvExtListClear") { ext.list = null; ext.err = ""; extSaveList(); clearPlan(); render(); return; }
      const xa = t.closest("[data-mrextadd]"); if (xa) { extAdd(xa.dataset.mrextadd, xa.dataset.mrextaddid, xa.dataset.mrextaddurl || "", xa.dataset.mrextaddname || (extApprovedOf(xa.dataset.mrextaddid) ? extApprovedOf(xa.dataset.mrextaddid).name : ""), xa.dataset.mrextaddsrc || "list"); render(); return; }
      const xd = t.closest("[data-mrextdrop]"); if (xd) { ext.edits.delete(xd.dataset.mrextdrop); clearPlan(); render(); return; }
      const xtp = t.closest("[data-mrextpick]"); if (xtp) {
        if (!ext.list) return;
        const h = ((ext.list.ids[xtp.dataset.mrextpick] || {}).hits || []).find((x) => x.id === xtp.dataset.mrextpickid);
        ext.list.ids[xtp.dataset.mrextpick] = { id: xtp.dataset.mrextpickid, how: "pick", name: h ? h.name : "" };
        if (h) ext.names.set(h.id, { status: "ok", source: "store", name: h.name, developer: h.developer });
        extSaveList(); render(); extLookup([xtp.dataset.mrextpickid], false); return;
      }
      if (t.id === "mvExtBulkGo") {
        if (!ext.list) return;
        const P = extPolicy(); if (!P) return;
        const now = extNow(P), planned = MdeEdgeExt.planOf(now, ext.edits);
        for (const r of ext.list.parsed.rows.filter((x) => x.edge)) {
          const s = extRowState(r, now, planned);
          if (!s.id || s.inForce || s.inAllow || s.add || s.same || (s.name && s.name.status === "404")) continue;
          extAdd(ext.bulk, s.id, "", r.name, "list");
        }
        render(); return;
      }
      if (t.id === "mvRep_assign") { runAssignReport(); return; }
      if (t.id === "mvRep_config") { runConfigReport(); return; }
      if (t.id === "mvRep_conflicts") { runConflictCheck(); return; }
      const ro = t.closest("[data-mrrepopen]"); if (ro) { openReport(ro.dataset.mrrepopen); return; }
      const rd = t.closest("[data-mrrep]"); if (rd) {
        const r = reps[rd.dataset.mrrep]; if (!r) return;
        const name = { assign: "assignments", config: "configuration", conflicts: "conflict-check" }[rd.dataset.mrrep];
        if (rd.dataset.mrrepfmt === "csv") download(`MDE-rollout-${name}-${stamp()}.csv`, r.csv, "text/csv");
        else download(`MDE-rollout-${name}-${stamp()}.html`, r.html, "text/html");
        return;
      }
      const mr = t.closest("[data-mrmemregion]"); if (mr) { mem.region = mr.dataset.mrmemregion; mem.unmapped = false; mem.pil = false; mem.leftCountry = null; clearPlan(); render(); return; }
      if (t.closest("[data-mrmemunmapped]")) { mem.unmapped = !mem.unmapped; if (mem.unmapped) { mem.left = false; mem.pil = false; } render(); return; }
      // 🕳 left out (10642)
      if (t.closest("[data-mrmemleft]")) { e.preventDefault(); mem.left = mem.pil ? true : !mem.left; mem.pil = false; mem.unmapped = false; mem.leftCountry = null; mem.leftReason = null; render(); return; }
      // 🧪 pilots (10647)
      if (t.closest("[data-mrpilview]")) { e.preventDefault(); mem.pil = !mem.pil; if (mem.pil) { mem.left = false; mem.unmapped = false; } clearPlan(); render(); return; }
      const ps = t.closest("[data-mrpilstate]"); if (ps) { mem.pilState = ps.dataset.mrpilstate || null; render(); return; }
      if (t.id === "mvPilDry") { pilotDryRun(); return; }
      const lr = t.closest("[data-mrmemleftrow]"); if (lr) {
        e.preventDefault();
        const k = lr.dataset.mrmemleftrow || null;
        const r = k && mem.model ? mem.model.rows.find((x) => x.key === k) : null;
        if (r) mem.region = r.region;
        mem.left = true; mem.unmapped = false; mem.leftCountry = k; mem.leftReason = null; render(); return;
      }
      const lw = t.closest("[data-mrmemleftwhy]"); if (lw) {
        e.preventDefault();
        const k = lw.dataset.mrmemleftwhy;
        mem.left = true; mem.unmapped = false; mem.leftReason = k === "users" || k === "all" ? null : k;
        if (k === "users") mem.leftCountry = null;
        render(); return;
      }
      if (t.closest("[data-mrlogons]")) { lookupLogons(); return; }
      const pn = t.closest("[data-mrpin]"); if (pn) { const [u, a, ...nm] = pn.dataset.mrpin.split("|"); pinDryRun(u, a, nm.join("|")); return; }
      if (t.id === "mvUnpinDry") { unpinDryRun(); return; }
      if (t.closest("[data-mrskipdry]")) { skipDryRun(); return; }
      if (t.closest("[data-mrlogonkql]")) { copyLogonKql(); return; }
      if (t.id === "mvMemLeftCsv") { if (mem.model) download(`MDE-left-out-${mem.region || "all"}-${stamp()}.csv`, MdeMembers.leftOutCsv(mem.model, mem.region, mem.logons), "text/csv"); return; }
      const mo = t.closest("[data-mrmemopen]"); if (mo) { e.preventDefault(); const k = mo.dataset.mrmemopen; mem.open.has(k) ? mem.open.delete(k) : mem.open.add(k); render(); return; }
      const ap = t.closest("[data-mrmempilot]"); if (ap) {
        const sel = $(ap.dataset.mrpilotsel);
        const region = sel ? sel.value : (mem.model && mem.model.regions[0] ? mem.model.regions[0].region : "");
        const suffix = ap.dataset.mrmempilot;
        saveCfg(Object.assign({}, cfg, { members: MdeMembers.addPilot(mcfg(), suffix, region) }));
        mem.region = region; mem.unmapped = false; mem.sel.clear(); mem.sel.add(lc(suffix));
        memCompute(); clearPlan(); render(); return;
      }
      if (t.id === "mvMemRead") { memRead(); return; }
      // 🧪 pilot batches (10640)
      const bt = t.closest("[data-mrbatch]"); if (bt) { batchDryRun(bt.dataset.mrbatch, false); return; }
      const bf = t.closest("[data-mrbatchfin]"); if (bf) { batchDryRun(bf.dataset.mrbatchfin, true); return; }
      const mg = t.closest("[data-mrmigrate]"); if (mg) { migrateDryRun(mg.dataset.mrmigrate); return; }
      const bc = t.closest("[data-mrbatchcsv]"); if (bc) { const r = mem.model && mem.model.rows.find((x) => x.key === bc.dataset.mrbatchcsv); if (r) download(`MDE-pilot-batches-${r.suffix}-${stamp()}.csv`, MdeMembers.batchCsv(r), "text/csv"); return; }
      // 🔄 / ↩ (10679)
      if (t.id === "mvCsRead") { csRead(); return; }
      if (t.id === "mvCsDry") { csSyncDry(); return; }
      const sw = t.closest("[data-mrcsswap]"); if (sw) { csSwapDry(sw.dataset.mrcsswap); return; }
      if (t.id === "mvRvRead") { rvRead(); return; }
      if (t.id === "mvRvGo") { rvSearch(); return; }
      if (t.id === "mvRvDry") { rvDryRun(); return; }
      if (t.id === "mvRvUndoDry") { rvUndoDry(); return; }
      const rp = t.closest("[data-mrrvpick]"); if (rp) { const h = (rv.results || [])[Number(rp.dataset.mrrvpick)]; if (h) rvPick(h); return; }
      // ⊘ exclusions (10639)
      if (t.id === "mvExRead") { exRead(); return; }
      if (t.id === "mvExGo") { exSearch(); return; }
      if (t.id === "mvExDry") { exDryRun(); return; }
      if (t.id === "mvExRemDry") { exRemoveDryRun(); return; }
      // 📋 a list (10651)
      const xm = t.closest("[data-mrexmode]"); if (xm) {
        if (ex.mode !== xm.dataset.mrexmode) { ex.mode = xm.dataset.mrexmode; if (plan && !busy && (planAnchor === "mvExCard" || planAnchor === "mvExList")) clearPlan(); render(); const f = $(ex.mode === "list" ? "mvExListText" : "mvExQ"); if (f) f.focus(); }
        return;
      }
      if (t.id === "mvExListGo") { exListRun(); return; }
      if (t.id === "mvExListDry") { exListDryRun(); return; }
      const xo = t.closest("[data-mrexone]"); if (xo) {
        ex.mode = "one"; ex.q = xo.dataset.mrexone;
        if (plan && !busy && planAnchor === "mvExList") clearPlan();
        render(); exSearch(); return;
      }
      const xp = t.closest("[data-mrexpick]"); if (xp) { const h = (ex.results || [])[Number(xp.dataset.mrexpick)]; if (h) exPick(h); return; }
      const xf = t.closest("[data-mrexfix]"); if (xf) {
        const n = exNow(); const r = n && n.rows.find((x) => x.key === xf.dataset.mrexfix);
        if (r && r.user) { ex.mode = "one"; exPick({ type: "user", id: r.user.id, displayName: r.user.displayName, upn: r.user.upn }); const top = $("mvExQ"); if (top && top.scrollIntoView) top.scrollIntoView({ block: "center" }); }
        return;
      }
      if (t.id === "mvMemDry") { memDryRun(); return; }
      if (t.id === "mvMemCsv") { if (mem.model) download(`MDE-wave-members-${stamp()}.csv`, MdeMembers.csv(mem.model), "text/csv"); return; }
      const rr = t.closest("[data-mrroll-region]"); if (rr) {
        const all = [...new Set(model.cfg.groups.filter((g) => g.role === "wave").map((g) => g.region))];
        const cur = rollRegions ? new Set(rollRegions) : new Set(all);
        const r = rr.dataset.mrrollRegion;
        cur.has(r) ? cur.delete(r) : cur.add(r);
        rollRegions = cur.size === all.length ? null : cur;
        derive(); render(); return;   // the ⚔️ wave proposals follow the regions (10643)
      }
      const ra = t.closest("[data-mrroll]"); if (ra) { dryRunRollout(ra.dataset.mrroll); return; }
      if (t.id === "mvWaveCreate") { createWaves(); return; }
      if (t.id === "mvRenameGo") {
        if (!$("mvRenameOk") || !$("mvRenameOk").checked) return;
        const list = waveRows.filter((w) => selRename.has(w.name) && w.legacy && !w.exists).map((w) => ({ id: w.legacy.group.id, from: w.legacy.name, to: w.name }));
        if (list.length) renameWaves(list, false);
        return;
      }
      if (t.closest("[data-mrrenameall]")) { e.preventDefault(); waveRows.filter((w) => w.legacy && !w.exists).forEach((w) => selRename.add(w.name)); render(); return; }
      const rb = t.closest("[data-mrrenback]"); if (rb) {
        const r = runs[Number(rb.dataset.mrrenback)];
        if (r && r.done && r.done.length) { pane = "waves"; render(); renameWaves(r.done.map((d) => ({ id: d.id, from: d.to, to: d.from })), true); }
        return;
      }
      if (t.id === "mvRuleSave") {
        const lines = (id) => $(id).value.split(/\r?\n/);
        const before = cfg.lookup.join("\n");
        const prevPre = { device: cfg.waveDevicePrefix, user: cfg.waveUserPrefix, exD: cfg.exclusionDevice, exU: cfg.exclusionUser };
        // 10682: the logon steps change what is read — a change re-reads too
        const prefixes = () => `${mcfg().countryPrefix}|${mcfg().deviceGroupPrefix}|${mcfg().useIntuneLogons}|${mcfg().useDefenderLogons}|${mcfg().useUsersDevices}|${mcfg().logonDays}`;
        const beforePre = prefixes();
        const okSaved = saveCfg({ newPrefixes: lines("mvRuleNew"), outPrefixes: lines("mvRuleOut"), waveRegions: lines("mvRuleWaves"),
          waveDevicePrefix: $("mvRuleDgPre").value, waveUserPrefix: $("mvRuleUgPre").value,
          exclusionDevice: $("mvRuleExD").value, exclusionUser: $("mvRuleExU").value,
          waveDescription: $("mvRuleDesc").value, exclusionDescription: $("mvRuleExDesc").value, alsoInScope: lines("mvRuleAlso"), alsoInScopeSeed: cfg.alsoInScopeSeed, leaveOut: lines("mvRuleLeave"), leaveOutSeed: cfg.leaveOutSeed,
          fixWith: cfg.fixWith, pilotGroups: lines("mvRulePilots"), pilotGroupsOff: cfg.pilotGroupsOff,
          renameExclusionFrom: {
            device: cfg.renameExclusionFrom.device.concat(prevPre.exD && lc($("mvRuleExD").value.trim()) !== lc(prevPre.exD) ? [prevPre.exD] : []),
            user: cfg.renameExclusionFrom.user.concat(prevPre.exU && lc($("mvRuleExU").value.trim()) !== lc(prevPre.exU) ? [prevPre.exU] : []),
          },
          renameFrom: {
            device: cfg.renameFrom.device.concat(lc($("mvRuleDgPre").value.trim()) !== lc(prevPre.device) ? [prevPre.device] : []),
            user: cfg.renameFrom.user.concat(lc($("mvRuleUgPre").value.trim()) !== lc(prevPre.user) ? [prevPre.user] : []),
          },
          members: Object.assign({}, mcfg(), { countryPrefix: $("mvRuleCtyPre").value, deviceGroupPrefix: $("mvRuleDgrpPre").value,
            useIntuneLogons: !!($("mvRuleIntLog") && $("mvRuleIntLog").checked), useDefenderLogons: !!($("mvRuleDefLog") && $("mvRuleDefLog").checked), useUsersDevices: !!($("mvRuleUsersDev") && $("mvRuleUsersDev").checked), logonDays: $("mvRuleLogDays") ? +$("mvRuleLogDays").value : 30,
            countryMap: MdeMembers.parseMap($("mvRuleMap").value), pilots: MdeMembers.parsePilots($("mvRuleMap").value), deviceSuffixes: MdeMembers.parseOverrides($("mvRuleSfx").value) }) });
        (async () => {
          if (cfg.lookup.join("\n") !== before) { try { const f = await M.findGroups(cfg.lookup); found = f.found; dupes = f.dupes; } catch { found = null; } }
          // a new prefix means other groups — the members read is redone, not recomputed
          if (prefixes() !== beforePre) { mem.input = null; mem.model = null; mem.sel.clear(); }
          derive(); render();
          ruleSaved = `${okSaved ? "Saved for this tenant." : "Applied for this session — this browser would not keep it."} `;
          $("mvRuleMsg").textContent = `${ruleSaved}${model.newP.length} new · ${model.oldP.length} old · ${model.outP.length} out of scope.`;
          enrich();   // a changed scope brings groups whose kinds were never read
        })();
        return;
      }
      if (t.id === "mvRuleReset") { saveCfg(null); derive(); render(); enrich(); return; }
      // ⚔️ what a proposed fix excludes (10643)
      const fw = t.closest("[data-mrfixwith]"); if (fw) {
        if (cfg.fixWith !== fw.dataset.mrfixwith) { saveCfg(Object.assign({}, cfg, { fixWith: fw.dataset.mrfixwith })); clearPlan(); derive(); render(); }
        return;
      }
      // ➕ include (10642): a policy left out by name is taken off the list
      const inc = t.closest("[data-mrinclude]"); if (inc) {
        const nm = M.normName(inc.dataset.mrinclude);
        saveCfg(Object.assign({}, cfg, { leaveOut: cfg.leaveOut.filter((n) => M.normName(n) !== nm) }));
        // new pairs bring groups whose kinds were never read — read them
        derive(); render(); enrich(); return;
      }
    });
    body.addEventListener("keydown", (e) => {
      if (e.target.id === "mvExQ" && e.key === "Enter") { e.preventDefault(); exSearch(); return; }
      if (e.target.id === "mvRvQ" && e.key === "Enter") { e.preventDefault(); rvSearch(); return; }
      if (e.target.id === "mvExtQ" && e.key === "Enter") { e.preventDefault(); extSearch(); return; }
      if (e.target.id === "mvExtRoute" && e.key === "Enter") { e.preventDefault(); const b = $("mvExtRouteSave"); if (b) b.click(); return; }
      if (e.target.id === "mvExtListText") { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); extListText(e.target.value, "pasted list"); } return; }
      if (e.target.id === "mvExListText") { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exListRun(); } return; }
      if (e.key !== "Enter" && e.key !== " ") return;
      const rep = e.target.closest("[data-mrreport]");
      if (rep) { e.preventDefault(); rep.click(); return; }
      const nd = e.target.closest("[data-mrpane]");
      if (nd && nd.tagName !== "A") { e.preventDefault(); go(nd.dataset.mrpane); }
    });
    // 📋 a .csv / .txt dropped on the list box (10651)
    body.addEventListener("dragover", (e) => { if (e.target.id === "mvExListText") e.preventDefault(); });
    body.addEventListener("drop", (e) => {
      if (e.target.id !== "mvExListText") return;
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault(); exListFile(f);
    });
    body.addEventListener("input", (e) => {
      if (e.target.id === "mvExQ") { ex.q = e.target.value; return; }
      if (e.target.id === "mvRvQ") { rv.q = e.target.value; return; }
      if (e.target.id === "mvRvReason") { rv.reason = e.target.value; if (plan && plan.runKind === "revert" && !busy) clearPlan(); return; }
      if (e.target.id === "mvExtQ") { ext.q = e.target.value; const b = $("mvExtGo"); if (b && !ext.searching) { const pasted = MdeEdgeExt.fromInput(ext.q); b.disabled = !pasted && !TunoAddons.hasRoute(); b.textContent = pasted ? "Look it up" : "Search the store"; } return; }
      if (e.target.id === "mvExListText") {
        ex.listText = e.target.value;
        const b = $("mvExListGo"), n = MdeExclude.parseList(ex.listText).lines.length;
        if (b && !ex.listBusy) { b.textContent = `Look them up · ${plural(n, "line")}`; b.disabled = !n; }
        return;
      }
      if (e.target.id !== "mvQ") return;
      view.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const q = $("mvQ"); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch { /* search inputs in some engines */ } }
    });
    body.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.mrasr) {
        const r = MdeAsr.matrix(model).find((x) => x.key === t.dataset.mrasr);
        if (r) { if (t.value === r.now) asr.edits.delete(r.key); else asr.edits.set(r.key, t.value); }
        clearPlan(); render();
        const again = body.querySelector(`[data-mrasr="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(t.dataset.mrasr) : t.dataset.mrasr}"]`); if (again) again.focus();
        return;
      }
      // 🧩 Edge extensions (10678)
      if (t.dataset.mrextchg) { extChange(t.dataset.mrextchg, t.value); render(); const again = body.querySelector(`[data-mrextchg="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(t.dataset.mrextchg) : t.dataset.mrextchg}"]`); if (again) again.focus(); return; }
      if (t.id === "mvExtFile") { const f = t.files && t.files[0]; t.value = ""; extListFile(f); return; }
      if (t.dataset.mrextname !== undefined) { const v = t.value.trim(); if (v) extSaveName(t.dataset.mrextname, v); render(); return; }
      if (t.dataset.mrextrowid !== undefined) {
        const p = MdeEdgeExt.fromInput(t.value);
        if (!p) { t.value = ""; ext.err = "That is not an ID (32 letters a–p) or a store link."; render(); return; }
        if (!ext.list) return;
        const r = ext.list.parsed.rows.find((x) => x.key === t.dataset.mrextrowid);
        ext.list.ids[t.dataset.mrextrowid] = { id: p.id, how: "operator", updateUrl: p.updateUrl };
        if (r && extNameOf(p.id).status === "unknown") ext.names.set(p.id, { status: "unverified", name: p.slug ? MdeEdgeExt.slugName(p.slug) : r.name, source: p.slug ? "slug" : "list" });
        ext.err = ""; extSaveList(); render(); extLookup([p.id], false); return;
      }
      if (t.id === "mvExtPol") { ext.policyKey = t.value; ext.edits.clear(); clearPlan(); openEdgeExt(); return; }
      if (t.id === "mvExtBulk") { ext.bulk = t.value; return; }
      if (t.dataset.mrpick) { t.checked ? sel.add(t.dataset.mrpick) : sel.delete(t.dataset.mrpick); clearPlan(); syncSelbar(); return; }
      if (t.dataset.mrpickall) {
        const list = t.dataset.mrpickall === "new" ? model.newP : model.oldP;
        body.querySelectorAll("[data-mrpick]").forEach((c) => { c.checked = t.checked; t.checked ? sel.add(c.dataset.mrpick) : sel.delete(c.dataset.mrpick); });
        if (!list) return;
        clearPlan(); syncSelbar(); return;
      }
      if (t.dataset.mrpair) { t.checked ? selPairs.add(t.dataset.mrpair) : selPairs.delete(t.dataset.mrpair); clearPlan(); syncSelbar(); return; }
      // 🧪 pilot members (10647)
      if (t.dataset.mrpilsel) { t.checked ? mem.pilSel.add(t.dataset.mrpilsel) : mem.pilSel.delete(t.dataset.mrpilsel); clearPlan(); render(); return; }
      if (t.dataset.mrpilall) {
        const rows = (mem.model.pilots.people || []).filter((p) => p.state === "ready");
        rows.forEach((p) => t.checked ? mem.pilSel.add(p.key) : mem.pilSel.delete(p.key));
        clearPlan(); render(); return;
      }
      // 🧪 the pilot tick (10645)
      if (t.hasAttribute("data-mrpilots")) { saveCfg(Object.assign({}, cfg, { pilotGroupsOff: t.checked })); clearPlan(); derive(); render(); syncSelbar(); return; }
      if (t.dataset.mrpairall) {
        pairs.filter((pr) => pr.O.key === t.dataset.mrpairall && M.needsAction(pr) && pr.proposal && pr.proposal.steps.some((s) => s.supported !== false))
          .forEach((pr) => (t.checked ? selPairs.add(pr.id) : selPairs.delete(pr.id)));
        clearPlan(); render(); return;
      }
      if (t.dataset.mrwave) {
        t.checked ? selWaves.add(t.dataset.mrwave) : selWaves.delete(t.dataset.mrwave);
        const ok = $("mvWaveOk"); if (ok) { ok.disabled = !selWaves.size; if (!selWaves.size) ok.checked = false; }
        const lbl = ok && ok.parentElement; if (lbl) lbl.lastChild.textContent = ` Create ${plural(selWaves.size, "group")} in this tenant`;
        $("mvWaveCreate").disabled = !(selWaves.size && ok && ok.checked);
        return;
      }
      if (t.id === "mvWaveOk") { $("mvWaveCreate").disabled = !(selWaves.size && t.checked); }
      if (t.dataset.mrrename) { t.checked ? selRename.add(t.dataset.mrrename) : selRename.delete(t.dataset.mrrename); render(); return; }
      if (t.id === "mvRenameOk") { $("mvRenameGo").disabled = !(selRename.size && t.checked); }
      if (t.dataset.mrmemsel) { t.checked ? mem.sel.add(t.dataset.mrmemsel) : mem.sel.delete(t.dataset.mrmemsel); clearPlan(); render(); return; }
      if (t.dataset.mrmemall && mem.model) {
        mem.model.rows.filter((r) => r.region === mem.region && r.ug && !(r.inSync && r.ugNested && r.dgNested)).forEach((r) => (t.checked ? mem.sel.add(r.key) : mem.sel.delete(r.key)));
        clearPlan(); render(); return;
      }
      if (t.dataset.mrmemopt) { mem.opts[t.dataset.mrmemopt] = t.checked; clearPlan(); render(); return; }
      if (t.dataset.mrbatchtoggle) {
        const sfx = t.dataset.mrbatchtoggle;
        const cur = mcfg().batched.filter((x) => lc(x) !== lc(sfx));
        saveCfg(Object.assign({}, cfg, { members: Object.assign({}, mcfg(), { batched: t.checked ? cur.concat(sfx) : cur }) }));
        memCompute(); clearPlan(); render(); return;
      }
      if (t.dataset.mrskip) {
        if (!mem.skipEdits) mem.skipEdits = new Map();
        const id = t.dataset.mrskip, d0 = mem.model && mem.model.rows.flatMap((r) => r.devices).find((d) => d.objId === id);
        const wasSkipped = !!(d0 && d0.skipped);
        if (t.checked === !wasSkipped) mem.skipEdits.delete(id); else mem.skipEdits.set(id, !t.checked);
        clearPlan(); render(); return;
      }
      if (t.dataset.mrunpin) { if (!mem.unpin) mem.unpin = new Set(); t.checked ? mem.unpin.add(t.dataset.mrunpin) : mem.unpin.delete(t.dataset.mrunpin); clearPlan(); render(); return; }
      if (t.dataset.mrextick) { t.checked ? ex.ticks.add(t.dataset.mrextick) : ex.ticks.delete(t.dataset.mrextick); clearPlan(); render(); return; }
      // 🔄 / ↩ (10679)
      if (t.dataset.mrcstick && cs.ticks) { t.checked ? cs.ticks.add(t.dataset.mrcstick) : cs.ticks.delete(t.dataset.mrcstick); cs.confirm = ""; clearPlan(); render(); return; }
      if (t.id === "mvCsConfirm") { const sm = csModel(); cs.confirm = t.checked && sm ? MdeRevert.reincludeLine(csItems(sm), cs.ticks) : ""; clearPlan(); render(); return; }
      if (t.id === "mvCsScope") { cs.scope = t.value || "all"; cs.ticks = null; clearPlan(); render(); return; }
      if (t.dataset.mrrvtick) { t.checked ? rv.ticks.add(t.dataset.mrrvtick) : rv.ticks.delete(t.dataset.mrrvtick); clearPlan(); render(); return; }
      if (t.dataset.mrrvsel) { t.checked ? rv.sel.add(t.dataset.mrrvsel) : rv.sel.delete(t.dataset.mrrvsel); clearPlan(); render(); return; }
      if (t.dataset.mrexsel) { t.checked ? ex.sel.add(t.dataset.mrexsel) : ex.sel.delete(t.dataset.mrexsel); clearPlan(); render(); return; }
      if (t.id === "mvExKeep") { ex.keepOld = t.checked; clearPlan(); render(); return; }
      if (t.dataset.mrexltick) { t.checked ? ex.lticks.add(t.dataset.mrexltick) : ex.lticks.delete(t.dataset.mrexltick); clearPlan(); render(); return; }
      if (t.id === "mvExListAll") { const can = exListCan(); if (t.checked) can.forEach((k) => ex.lticks.add(k)); else ex.lticks.clear(); clearPlan(); render(); return; }
      if (t.id === "mvExListFile") { const f = t.files && t.files[0]; t.value = ""; exListFile(f); return; }
    });
    // the bar
    $("mvActSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-mract]"); if (!b) return; setSeg("mvActSeg", "data-mract", b.dataset.mract); clearPlan(); syncSelbar(); });
    $("mvTargetSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-mrtarget]"); if (!b) return; setSeg("mvTargetSeg", "data-mrtarget", b.dataset.mrtarget); clearPlan(); syncSelbar(); });
    $("mvFilterSel").addEventListener("change", () => { clearPlan(); syncSelbar(); });
    $("mvFilterMode").addEventListener("change", clearPlan);
    $("mvGroup").addEventListener("input", clearPlan);
    $("mvDryRun").addEventListener("click", dryRun);
    if ($("mvBarPilots")) $("mvBarPilots").addEventListener("change", clearPlan);
    if ($("mvBarPilotTiers")) $("mvBarPilotTiers").addEventListener("change", (e) => { const t = e.target.closest("[data-mrtier]"); if (!t) return; if (t.checked) pilotTiersOff.delete(t.dataset.mrtier); else pilotTiersOff.add(t.dataset.mrtier); clearPlan(); });
    $("mvSelClear").addEventListener("click", () => { if (barMode() === "fixes") selPairs.clear(); else sel.clear(); clearPlan(); render(); });
    if (typeof Suggest !== "undefined" && Suggest.attach) Suggest.attach($("mvGroup"), { kind: "group" });
    (window.TunoScreenHooks = window.TunoScreenHooks || {})["screen-mderollout"] = onShow;
    window.addEventListener("tuno:signout", reset);
  }

  return {
    init, run, onShow,
    // headless: hand the screen a read and drive it without Graph
    _setForTest: (r, t, f, k) => { res = r; templates = t || new Map(); found = f || null; kinds = k || new Map(); loadCfg(); derive(); render(); },
    _state: () => ({ pane, model, pairs, retire, waveRows, plan, sel, selPairs, runs, cfg, rollRegions, pilotTiersOff, mem, reps, ex, asr, ext, cs, rv, csModel, planAnchor, running, busy, enriching }),
    _pane: (p) => { pane = p; render(); },
  };
})();

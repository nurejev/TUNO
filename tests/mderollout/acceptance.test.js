// T28 — THE ACCEPTANCE WALK (build 10729, Phase 4 of the 15 Oct rebuild
// plan): docs/T28-ACCEPTANCE.md as code. In the demo tenant an engineer
// takes the Euro wave (NL Breda's wave) through the five stages from the
// 🌊 Wave screen — reading only what the spine says, clicking only Open
// stage and the buttons on the pane it opens — and after every stage the
// spine has to agree with the tenant without a refresh. Where the plan's
// gates stand (confirm line, read tick, backup, risk, REMOVE) the walk
// passes them the way the engineer does.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, label) {
  const end = Date.now() + (ms || 20000);
  for (;;) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; if (Date.now() > end) { console.error("timeout: " + (label || "")); return false; } await sleep(25); }
}
function boot() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const files = [...html.matchAll(/<script src="(js\/[^"?]+)\?v=\d+"><\/script>/g)].map((m) => m[1]);
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://nurejev.github.io/tuno-beta/" });
  const w = dom.window;
  w.crypto = w.crypto || {};
  if (!w.crypto.getRandomValues) w.crypto.getRandomValues = (a) => { for (let i = 0; i < a.length; i++) a[i] = 1; return a; };
  w.alert = () => {};
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  const store = new Map();
  Object.defineProperty(w, "localStorage", { value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, configurable: true });
  w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
  w.msal = undefined;
  w.fetch = () => Promise.reject(new Error("no network in tests"));
  const fidb = require("fake-indexeddb"); w.indexedDB = fidb.indexedDB; w.IDBKeyRange = fidb.IDBKeyRange;
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,TUNO_DEMO_GRAPH,T28Spine});";
  const realErr = console.error, realLog = console.log, realWarn = console.warn;
  console.error = () => {}; console.log = () => {}; console.warn = () => {};
  let err = null;
  try { w.eval(src + "\n" + bridge); } catch (e) { err = e; }
  console.error = realErr; console.log = realLog; console.warn = realWarn;
  if (err) throw err;
  w.Graph.ensureScopes = async () => true;
  w.Graph.silentScopes = async () => true;
  w.TUNO_DEMO_GRAPH.LATENCY_MS = 0;
  return { w };
}

async function run() {
  const { w } = boot();
  const D = w.document, $ = (id) => D.getElementById(id);
  const T = w.MdeRolloutV2Tool, st = () => T._state();
  const G = (n) => w.TUNO_DEMO_GRAPH.T.GROUPS.find((g) => g.displayName === n);
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  const idle = () => until(() => { const s = st(); return s.model && !s.running && !s.busy && !s.enriching && !s.project.starting && !s.project.task && !s.project.timer && !s.reps.busy && !s.mem.loading && !s.ex.loading && !s.ld.busy && !s.dv.busy && !s.ob.busy; }, 60000, "idle");
  await until(() => { const s = st(); return s.model && s.project.attempted.size === 5 && s.mem.model && s.cs.extra && s.tm.all; }, 60000, "project read");
  await idle();
  const check = (el, on) => { el.checked = on; el.dispatchEvent(new w.Event("change", { bubbles: true })); };
  // the gates, as the engineer passes them — members plans and policy plans alike
  async function gates() {
    const t = $("mvConfirmText"); if (t) { t.value = "REMOVE"; t.dispatchEvent(new w.Event("input", { bubbles: true })); }
    for (const id of ["mvBulkConfirm", "mvConfirmTick"]) { const k = $(id); if (k && !k.checked) check(k, true); }
    const r = $("mvRiskReason"), a = $("mvRiskAccept");
    if (r && a && !a.checked) { r.value = "Acceptance walk — accepted."; r.dispatchEvent(new w.Event("input", { bubbles: true })); check(a, true); }
    const b = $("mvMemberBackup") || $("mvBackup");
    if (b && !b.disabled) { b.click(); await until(() => /downloaded|failed/.test(b.textContent) || !($("mvMemberBackup") || $("mvBackup")) || ($("mvMemApply") && !$("mvMemApply").disabled) || ($("mvApply") && !$("mvApply").disabled), 10000, "backup"); }
    const r2 = $("mvRiskReason"), a2 = $("mvRiskAccept");
    if (r2 && a2 && !a2.checked) { r2.value = "Acceptance walk — accepted."; r2.dispatchEvent(new w.Event("input", { bubbles: true })); check(a2, true); }
  }
  async function apply() {
    const n = st().runs.length;
    await gates();
    const btn = () => $("mvMemApply") || $("mvApply");
    ok(`④ Apply unlocks — ${st().plan && st().plan.title}`, await until(() => btn() && !btn().disabled, 10000, "apply"));
    btn().click();
    await until(() => st().runs.length === n + 1, 20000, "run");
    return st().runs[n];
  }
  const spine = () => T._spine();
  const stage = (id) => spine().stages.find((s) => s.id === id);
  const openStage = async () => { const b = D.querySelector(".t28-next [data-mrstage]"); ok("the spine offers Open stage for the next step", !!b, spine().next && spine().next.text); if (b) { b.click(); await sleep(100); } };

  // ---------------------------------------------------- the wave screen --
  D.querySelector('.mr-navigation [data-mrpane="wavehome"]').click(); await sleep(100);
  const euro = D.querySelector('[data-mrspine-region="Euro"]'); euro.click(); await sleep(100);
  ok("the engineer lands on the Euro wave: five stages, Set up is where it starts (the hold-back pair and the test groups are not there yet)", st().pane === "spine" && T._region() === "Euro" && spine().current === "setup" && /to create/.test(stage("setup").detail), JSON.stringify(spine().stages.map((s) => [s.id, s.state, s.detail])));

  // ----------------------------------------------- stage 1 · Set up --
  ok("the next step says what to make and where (⚡ ⓪)", /⚡ ⓪|🌊/.test(spine().next.text) && spine().next.pane === "waves");
  await openStage();
  ok("Open stage opened 🌊 Wave groups & test members", st().pane === "waves");
  D.querySelector("[data-mrrollgroups]").click();
  await until(() => st().plan && st().plan.holdGroups, 5000, "⓪ plan");
  const r1 = await apply();
  ok("⚡ ⓪ created the project's groups and nested Euro's test members: every step verified", r1.ok > 0 && r1.bad === 0 && G("INT-SG-U-MDE-HoldBack") && G("INT-SG-U-WAVE-Euro-Test"), JSON.stringify(r1.lines));
  D.querySelector('.mr-navigation [data-mrpane="wavehome"]').click(); await sleep(150);
  await until(() => stage("setup").state === "ok", 15000, "set up ok");
  ok("back on the spine, without a refresh: Set up is ✓ and Members is current", stage("setup").state === "ok" && spine().current === "members", JSON.stringify(spine().stages.map((s) => [s.id, s.state, s.detail])));

  // ---------------------------------------------- stage 2 · Members --
  ok("Members says which countries are open, with their counts", /of 3 countries nested|in batches/.test(stage("members").detail) && stage("members").lines.some((l) => /Netherlands|Germany/.test(l.text) && /users/.test(l.text)), stage("members").detail);
  await openStage();
  ok("Open stage opened 👥 Country groups", st().pane === "members");
  // the engineer fills every open country of the wave (NL Breda the pilot, the Netherlands, Germany), removals included
  D.querySelector('[data-mrmemregion="Euro"]') && D.querySelector('[data-mrmemregion="Euro"]').click(); await sleep(100);
  const openKeys = st().mem.model.rows.filter((r) => r.region === "Euro" && (r.uWant.size || r.want.size)).map((r) => r.key);
  for (const k of openKeys) { const c = D.querySelector(`[data-mrmemsel="${k}"]`); if (c && !c.checked) check(c, true); }
  const rem = $("mvMemRem"); if (rem && !rem.checked) rem.click(); await sleep(100);
  $("mvMemDry").click();
  await until(() => st().plan && st().plan.members && st().plan.ops.length, 5000, "members plan");
  const r2 = await apply();
  ok("👥 created and filled the wave's country groups, removals included, every step verified; the Netherlands' user group waits for the ⇄ swap (its dynamic group still carries the wave)", r2.bad === 0 && r2.ok >= 6 && G("INT-SG-U-MDE-NLD") && (G("INT-SG-U-MDE-NLD")._users || []).length === 2 && (G("INT-SG-U-MDE-DEU").memberOf || []).includes(G("INT-SG-U-WAVE-Euro").id), JSON.stringify(r2.lines));
  // the pilot: NL Breda overlaps the Netherlands, so the 👥 run migrated it into its country (10656) — the spine must say so, not ask for batches
  const openRow = D.querySelector('[data-mrmemopen="nl-breda"]'); if (openRow) { openRow.click(); await sleep(150); }
  ok("the pilot's panel says it was migrated into the Netherlands, with the way back in 📜", /Migrated into Netherlands/.test($("mvBody").textContent) && /puts the pilot back/.test($("mvBody").textContent));
  // the Netherlands: ⇄ swap the dynamic group for the static one (🔄 Sync country groups)
  D.querySelector('.mr-navigation [data-mrpane="wavehome"]').click(); await sleep(150);
  const nlLine = stage("members").lines.find((l) => /^Netherlands/.test(l.text));
  ok("the spine says the Netherlands' dynamic group still carries the wave — ⇄ swap", nlLine && !nlLine.ok && /⇄ swap/.test(nlLine.text), nlLine && nlLine.text);
  T._pane("countrysync"); await sleep(100);
  if ($("mvCsRead")) { $("mvCsRead").click(); await until(() => st().cs.extra && st().mem.model && !st().mem.loading, 15000, "cs read"); }
  const swap = D.querySelector('[data-mrcsswap="Euro"]');
  ok("🔄 offers ⇄ Swap Euro", !!swap && !swap.disabled);
  if (swap) { swap.click(); await until(() => st().plan && st().plan.ops && st().plan.ops.length, 5000, "swap plan"); const r5 = await apply(); ok("⇄ swapped: the static Netherlands group nested, the dynamic one out", r5.bad === 0 && (G("INT-SG-U-MDE-NLD").memberOf || []).includes(G("INT-SG-U-WAVE-Euro").id), JSON.stringify(r5.lines)); }
  D.querySelector('.mr-navigation [data-mrpane="wavehome"]').click(); await sleep(150);
  const mLines = stage("members").lines;
  ok("the spine agrees without a refresh: the Netherlands, Germany and France ✓, the pilot ✓ 'in the wave through Netherlands', the countries with nobody to place ✓, nothing left open", mLines.filter((l) => /Netherlands|Germany|France/.test(l.text)).every((l) => l.ok) && mLines.some((l) => /NL Breda/.test(l.text) && l.ok && /through Netherlands/.test(l.text)) && mLines.every((l) => l.ok), JSON.stringify(mLines));
  // 🗑 10733 (Mihai, 21 Oct: "the pilot-breda should now be fully decommissioned and onboarded in nl. the hold backs stays"):
  // with the Netherlands live and the pilot migrated, the spine's next step is retiring the pilot
  ok("the spine's next step: 🗑 Retire NL Breda (migrated, its groups still in the tenant)", stage("members").state === "todo" && /🗑 Retire NL Breda/.test(spine().next.text) && /1 pilot to retire/.test(stage("members").detail), JSON.stringify([stage("members").state, stage("members").detail, spine().next]));
  const holdU = () => (G("INT-SG-U-MDE-HoldBack")._users || []).slice().sort().join(), holdD = () => (G("INT-SG-D-MDE-HoldBack")._devices || G("INT-SG-D-MDE-HoldBack")._members || []).slice().sort().join();
  const holdBefore = [holdU(), holdD()];
  await openStage();
  ok("Open stage opened 👥 Country groups for the retire", st().pane === "members");
  if (!$("mvBatch-nl-breda")) { const o = D.querySelector('[data-mrmemopen="nl-breda"]'); if (o) { o.click(); await sleep(150); } }
  const ret = D.querySelector('[data-mrretire="nl-breda"]');
  ok("the pilot's panel offers 🗑 Retire NL Breda", !!ret && !ret.disabled && /Retire NL Breda/.test(ret.textContent));
  if (ret) {
    ret.click();
    await until(() => st().plan && st().plan.retire, 5000, "retire plan");
    const rp = st().plan;
    // the demo's pilot has a device group only (no static user group was made for it): that one is taken out of the device wave the migration left it in, emptied and deleted
    ok("the retire plan: the pilot's device group out of the wave, emptied, deleted — a confirm line naming it, nothing else written", rp && rp.retire && rp.ops.every((o) => o.retire) && rp.ops.map((o) => o.type).join() === "unnest,remove,deletegroup" && rp.ops.filter((o) => o.type === "deletegroup").map((o) => o.group.name).join() === "INT-SG-D-MDE-NLD-BREDA"
      && /retire the pilot NL Breda: delete INT-SG-D-MDE-NLD-BREDA/.test(rp.confirmLine) && rp.ops.every((o) => /MDE-NLD-BREDA$/.test((o.group || o.child).name)), rp && JSON.stringify({ ops: rp.ops.map((o) => [o.type, (o.group || o.child).name]), skipped: rp.skipped, c: rp.confirmLine }));
    const r6 = await apply();
    ok("🗑 applied: both pilot groups deleted and read back gone, every step verified", r6.bad === 0 && !G("INT-SG-U-MDE-NLD-BREDA") && !G("INT-SG-D-MDE-NLD-BREDA"), JSON.stringify(r6.lines));
    ok("…the rules list NL-Breda as retired, no longer migrated or batched; the table forgets it", st().cfg.members.retired.includes("NL-Breda") && !st().cfg.members.migrated.includes("NL-Breda") && !st().cfg.members.batched.includes("NL-Breda")
      && !st().mem.model.rows.some((r) => r.key === "nl-breda") && st().mem.model.unmapped.some((u) => u.retired && /NL-Breda$/.test(u.group.displayName)));
    ok("…the hold-back pair untouched, the Netherlands still live", holdU() === holdBefore[0] && holdD() === holdBefore[1] && (G("INT-SG-U-MDE-NLD").memberOf || []).includes(G("INT-SG-U-WAVE-Euro").id));
  }
  D.querySelector('.mr-navigation [data-mrpane="wavehome"]').click(); await sleep(150);
  ok("Members is ✓ and Assign is current", stage("members").state === "ok" && spine().current === "assign" && !stage("members").lines.some((l) => /NL Breda/.test(l.text)), JSON.stringify(spine().stages.map((s) => [s.id, s.state, s.detail])));

  // ----------------------------------------------- stage 3 · Assign --
  ok("Assign says how many new policies still lack the wave", stage("assign").lines.some((l) => /① include/.test(l.text)), JSON.stringify(stage("assign")));
  await openStage();
  ok("Open stage opened the ⚡ actions (🌊 pane)", st().pane === "waves");
  const inc = D.querySelector('[data-mrroll="includeWaves"]');
  if (inc && !inc.disabled) {
    inc.click(); await until(() => st().plan && st().plan.changes, 10000, "include plan");
    const r4 = await apply();
    ok("⚡ ① included the waves in the new policies: written, logged with its backup", r4.ok + r4.bad >= 1 && r4.backup && r4.backup.action === "rollout-includeWaves", JSON.stringify(r4.lines));
  } else ok("⚡ ① had nothing to plan — the waves are already in every new policy", !!inc);
  D.querySelector('.mr-navigation [data-mrpane="wavehome"]').click(); await sleep(150);
  ok("the spine's Assign line moved with the run (fewer policies to plan, or in place)", stage("assign").lines[0] && !/undefined/.test(stage("assign").lines[0].text), stage("assign").lines[0] && stage("assign").lines[0].text);

  // ----------------------------------------------- stage 4 · Verify --
  const v = stage("verify");
  ok("Verify reads from 📡 and says what the wave's devices report, or that nothing reported yet", ["ok", "todo", "wait"].includes(v.state) && v.detail.length > 0, JSON.stringify(v));
  [...D.querySelectorAll(".t28-stage")].find((e) => /4 · Verify/.test(e.textContent)).querySelector("[data-mrstage]").click(); await sleep(100);
  ok("Open stage opened 📡 Verify", st().pane === "landing");

  // ------------------------------------------- stage 5 · Exceptions --
  D.querySelector('.mr-navigation [data-mrpane="wavehome"]').click(); await sleep(100);
  const before = stage("exceptions").detail;
  [...D.querySelectorAll(".t28-stage")].find((e) => /5 · Exceptions/.test(e.textContent)).querySelector("[data-mrstage]").click(); await sleep(100);
  ok("Open stage opened ⏸ Hold-back", st().pane === "revert");
  // hold back one user of the Netherlands — Eva
  if ($("mvRvRead")) { $("mvRvRead").click(); }
  await until(() => $("mvRvQ"), 15000, "hold-back search box");
  $("mvRvQ").value = "eva"; $("mvRvQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  $("mvRvQ").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await until(() => D.querySelector("[data-mrrvpick]"), 10000, "search hits");
  D.querySelector("[data-mrrvpick]").click();
  await until(() => st().rv.card && $("mvRvCard"), 10000, "the card");
  if ($("mvRvReason")) { $("mvRvReason").value = "Acceptance walk — LOB app blocked"; $("mvRvReason").dispatchEvent(new w.Event("input", { bubbles: true })); }
  const hb = $("mvRvDry");
  if (hb) {
    hb.click(); await until(() => st().plan && st().plan.runKind === "revert", 5000, "hold-back plan");
    const r5 = await apply();
    ok("⏸ held Eva back: out of every route into the wave, into the hold-back pair, verified", r5.bad === 0 && r5.ok > 0 && (G("INT-SG-U-MDE-HoldBack")._users || []).length === 1, JSON.stringify(r5.lines));
    D.querySelector('.mr-navigation [data-mrpane="wavehome"]').click(); await sleep(150);
    // 10733: 2, not 3 — with NL Breda retired Eva is counted once (NL), no longer again through the pilot's source
    ok("the spine's Exceptions counts her and her device", /2 members held back/.test(stage("exceptions").detail) && /1 member held back/.test(before), stage("exceptions").detail + " (was: " + before + ")");
  } else ok("the hold-back pane offers the dry run", false, D.body.textContent.slice(0, 200));

  // ----------------------------------------------------- the journal --
  D.querySelector('.mr-navigation [data-mrpane="journal"]').click(); await sleep(100);
  T._pane("changes"); await sleep(100);
  ok("📜 holds every run of the walk with its backup, and ↶ Undo on the ones that can be undone", st().runs.length >= 4 && st().runs.every((r) => r.backup) && D.querySelectorAll("[data-mrundo]").length >= 2, JSON.stringify([st().runs.length, D.querySelectorAll("[data-mrundo]").length, st().runs.map((r) => r.title)]));

  console.log(`T28 acceptance walk: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exit(1); });

// T28 — ⊘→⏸ Migrate exclusions on the screen (build 10702), driven end to
// end in DEMO mode: the Hold-back area and its sub-nav, the pane's read,
// ① Nina out of the ⊘ user group (under its pre-10636 name) into the
// hold-back pair the run creates, behind the confirm line, her laptop said
// as the half pair; ② nothing to take off (no demo policy names the pair);
// ③ the pair deleted — then the rules forget it, ⊘ leaves the sub-nav and
// ⚡② says retired. And the go-broad gate on a policies plan.
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
  for (;;) {
    let v = false; try { v = fn(); } catch { v = false; }
    if (v) return true;
    if (Date.now() > end) { console.error("timeout: " + (label || "")); return false; }
    await sleep(25);
  }
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
  Object.defineProperty(w, "localStorage", { value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  }, configurable: true });
  w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
  w.msal = undefined;
  w.fetch = () => Promise.reject(new Error("no network in tests"));
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,TUNO_DEMO_GRAPH,MdeRevert,TOOL_VERSIONS});";
  const realErr = console.error, realLog = console.log, realWarn = console.warn;
  console.error = () => {}; console.log = () => {}; console.warn = () => {};
  let err = null;
  try { w.eval(src + "\n" + bridge); } catch (e) { err = e; }
  console.error = realErr; console.log = realLog; console.warn = realWarn;
  if (err) throw err;
  w.Graph.ensureScopes = async () => true;
  w.Graph.silentScopes = async () => true;
  w.TUNO_DEMO_GRAPH.LATENCY_MS = 0;
  return { w, files, store };
}

async function run() {
  const { w, files, store } = boot();
  const D = w.document;
  const $ = (id) => D.getElementById(id);
  const st = () => w.MdeRolloutV2Tool._state();
  ok("T28's note names build 10702", /build 10702/.test(w.TOOL_VERSIONS.toolMdeRollout.note));
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  await until(() => { const s = w.MdeRolloutV2Tool._state(); return s.model && s.project.attempted.size === 5 && !s.project.starting && !s.project.task && !s.project.timer && !s.running && !s.enriching; }, 30000, "automatic project reads");
  await until(() => $("mvBody").querySelector(".ep-rail"), 30000, "rail");
  const idle = () => until(() => { const s = st(); return !s.running && !s.busy && !s.enriching && !s.project.starting && !s.project.task && !s.project.timer && !s.reps.busy; }, 30000, "idle");
  await idle();
  const node = (p) => { w.MdeRolloutV2Tool._pane(p); return D.querySelector(`[data-mrpane="${p}"]`); };
  const sub = (p) => D.querySelector(`.t28-subnav [data-mrpane="${p}"]`);
  async function gates() {
    const t = $("mvConfirmText"); if (t) { t.value = "REMOVE"; t.dispatchEvent(new w.Event("input", { bubbles: true })); }
    const k = $("mvConfirmTick"); if (k && !k.checked) { k.checked = true; k.dispatchEvent(new w.Event("change", { bubbles: true })); }
    const bc = $("mvBulkConfirm"); if (bc && !bc.checked) { bc.checked = true; bc.dispatchEvent(new w.Event("change", { bubbles: true })); }
    const r = $("mvRiskReason"), a = $("mvRiskAccept");
    if (r && a && !a.checked) { r.value = "Accepted by the headless suite for this demo plan."; r.dispatchEvent(new w.Event("input", { bubbles: true })); a.checked = true; a.dispatchEvent(new w.Event("change", { bubbles: true })); }
    const b = $("mvMemberBackup");
    if (b && !b.disabled) { b.click(); await until(() => /downloaded|failed/.test($("mvMemberBackup").textContent), 10000, "backup"); }
  }
  async function apply() {
    const n = st().runs.length;
    await gates();
    ok(`④ Apply unlocks (${st().plan && st().plan.title})`, await until(() => $("mvMemApply") && !$("mvMemApply").disabled, 10000, "apply"));
    $("mvMemApply").click();
    await until(() => st().runs.length === n + 1, 15000, "run");
    return st().runs[n];
  }
  const G = (n) => w.TUNO_DEMO_GRAPH.T.GROUPS.find((g) => g.displayName === n);

  // ------------------------------------------------------- the area --
  node("exceptionhome").click();
  ok("the rail says ⏸ Hold-back; the home says one hold-back and offers the migration while the pair exists", /⏸ Hold-back/.test(D.querySelector("#mvBody .ep-rail").textContent) && /One hold-back/.test($("mvBody").textContent) && !!sub("exmigrate") && !!sub("exclusions") && /legacy/.test(sub("exclusions").textContent));
  ok("the sub-nav: ⏸ Hold-back first, the migration and the legacy ⊘ after it", sub("revert").compareDocumentPosition(sub("exmigrate")) & 4 && sub("exmigrate").compareDocumentPosition(sub("exclusions")) & 4);

  // -------------------------------------------------------- the read --
  node("exmigrate").click();
  await idle();
  ok("⊘→⏸ opens — its read offered, or already in from the automatic reads", st().pane === "exmigrate" && (!!$("mvExmRead") || !!$("mvExmCard")));
  if ($("mvExmRead")) $("mvExmRead").click();
  ok("the read lands: the exclusions, the hold-back, the wave scan", await until(() => st().ex.base && st().cs.extra && st().ex.scan && !st().ex.loading && !st().mem.loading && $("mvExmCard"), 20000, "exm read"));
  const card = () => $("mvExmCard").textContent;
  ok("the tiles: Nina in the ⊘ user group (its earlier name), no device group, nobody held back yet; the half pair said", /PVM-UG-MDE-Exclusion/.test(card()) && /half pair/.test(card()) && st().ex.base.users.length === 1 && !st().ex.base.groups.device);
  ok("① is offered, ② has nothing (no policy names the pair), ③ waits", !$("mvExmMembers").disabled && $("mvExmPolicies").disabled && $("mvExmDelete").disabled && /① and ② first/.test(card()));

  // ---------------------------------------------------------- ① members --
  $("mvExmReason").value = "one hold-back — 8 Oct"; $("mvExmReason").dispatchEvent(new w.Event("input", { bubbles: true }));
  $("mvExmMembers").click();
  const mp = st().plan;
  ok("① the plan: create both hold-back groups, Nina into the user one, out of ⊘ after the add — run kind exmigrate", mp && mp.runKind === "exmigrate" && mp.migrateExclusion
    && mp.ops.map((o) => `${o.type}:${o.name || o.group.name}`).join() === "create:INT-SG-U-MDE-HoldBack,create:INT-SG-D-MDE-HoldBack,add:INT-SG-U-MDE-HoldBack,remove:PVM-UG-MDE-Exclusion" && mp.ops[3].needsOk.join() === "2" && mp.ops[3].fromExclusion, mp && mp.ops.map((o) => `${o.type}:${o.name || o.group.name}`).join());
  ok("…the confirm line names the move; the half pair and the reason are in the plan; REMOVE typed", /move 1 user from ⊘ Exclusion to ⏸ Hold-back; the exclusion groups are emptied/.test($("mvPlan").textContent) && /not in ⊘ and not held back by this run/.test($("mvPlan").textContent) && /one hold-back — 8 Oct/.test($("mvPlan").textContent) && !!$("mvConfirmText") && !!$("mvBulkConfirm"));
  const r1 = await apply();
  const nina = w.TUNO_DEMO_GRAPH.T.USERS.find((u) => /Nina/.test(u.displayName)).id;
  ok("applied: four steps verified; Nina in INT-SG-U-MDE-HoldBack, the ⊘ group empty", r1.ok === 4 && r1.runKind === "exmigrate" && G("INT-SG-U-MDE-HoldBack") && G("INT-SG-U-MDE-HoldBack")._users.includes(nina) && !(G("PVM-UG-MDE-Exclusion")._users || []).length, JSON.stringify(r1.lines));
  const reasons = JSON.parse(store.get([...store.keys()].find((k) => /^tuno\.t28\.revert\.reasons\./.test(k))) || "{}");
  ok("…her reason is kept in this browser like a hold-back's", reasons[nina] && reasons[nina].reason === "one hold-back — 8 Oct");
  ok("the pane moved with it: ⊘ empty, 1 held back, ③ offered", await until(() => $("mvExmCard") && !$("mvExmDelete").disabled && st().cs.extra.revertUsers.size === 1, 15000, "after ①"));

  // ---------------------------------------------------------- ③ delete --
  $("mvExmDelete").click();
  const dp = st().plan;
  ok("③ the plan: the one existing group deleted; permanent, said; REMOVE typed", dp && dp.deleteExclusion && dp.ops.map((o) => `${o.type}:${o.group.name}`).join() === "deletegroup:PVM-UG-MDE-Exclusion" && /Permanent/.test($("mvPlan").textContent) && /DELETES groups/.test($("mvPlan").textContent));
  const r3 = await apply();
  ok("applied: deleted and read back (404); the group is gone from the tenant", r3.ok === 1 && !G("PVM-UG-MDE-Exclusion"), JSON.stringify(r3.lines));
  const retired = await until(() => !st().cfg.exclusionUser && !st().cfg.exclusionDevice, 5000, "retired");
  ok("the rules forgot the pair: ⊘ off the sub-nav, ⚡② retired, the pane left for ⏸", retired && !sub("exmigrate") && !sub("exclusions") && st().pane === "revert", `${retired} ${!!sub("exmigrate")} ${!!sub("exclusions")} ${st().pane}`);
  node("waves").click();
  ok("⚡② says retired", /Retired \(10702\)/.test($("mvRollCard").textContent));
  ok("📜 holds the two runs, both exmigrate", st().runs.filter((r) => r.runKind === "exmigrate").length === 2);

  // ------------------------------------------------- the go-broad gate --
  ok("the hold-back holds Nina, so a tenant-wide plan on a new policy would gate", st().cs.extra.revertUsers.size === 1);
  const plan = { changes: [{ policy: Object.assign({}, st().model.newP[0]), details: [{ change: "modify", action: "add-include", group: { tenantWide: "allDevices", displayName: "All devices" }, removes: "" }] }] };
  const gate = w.MdeRolloutV2Tool._holdGate ? w.MdeRolloutV2Tool._holdGate(plan) : null;
  ok("holdGateOf names the policy and the held-back counts", gate && gate.users === 1 && gate.devices === 0 && /goes to All devices/.test(gate.why), JSON.stringify(gate));
  const plan2 = { changes: [{ policy: Object.assign({}, st().model.newP[0]), details: [{ change: "modify", action: "add-include", group: { id: "x", displayName: "INT-SG-D-WAVE-Euro" }, removes: "" }] }] };
  ok("…a wave include on a new policy does not", w.MdeRolloutV2Tool._holdGate(plan2) === null);

  console.log(`T28 ⊘→⏸ migrate exclusions screen: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  w.close();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

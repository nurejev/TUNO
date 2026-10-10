// T28 — 🔄 Country groups and ↩ Revert on the screen (build 10679), driven
// end to end in DEMO mode: the rail nodes, the read, the mapping (10680:
// the groups are created in 👥 Wave members only — user and device together),
// ⇄ the Euro swap (create → fill → nest → check → unnest, read back), the
// 🔄 sync (adds ticked, leavers not), ↩ a revert of Eva and her laptop with
// a reason, the sync holding them back (a re-include refused without the
// confirm), and the way back from Reverted now.
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
  ok("T28's note names build 10679 and its version moved past 0.31", /build 10679/.test(w.TOOL_VERSIONS.toolMdeRollout.note) && parseFloat(w.TOOL_VERSIONS.toolMdeRollout.v.replace(/^0\./, "")) >= 32);
  ok("the page loads js/mderevert.js after js/mdeexclude.js", files.includes("js/mderevert.js") && files.indexOf("js/mderevert.js") > files.indexOf("js/mdeexclude.js"));
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  await until(() => { const s = w.MdeRolloutV2Tool._state(); return s.model && s.project.attempted.size === 5 && !s.project.starting && !s.project.task && !s.project.timer && !s.running && !s.enriching; }, 30000, "automatic project reads");
  await until(() => $("mvBody").querySelector(".ep-rail"), 30000, "rail");
  const idle = () => until(() => { const s = st(); return !s.running && !s.busy && !s.enriching && !s.project.starting && !s.project.task && !s.project.timer && !s.reps.busy; }, 30000, "idle");
  await idle();
  const node = (p) => { w.MdeRolloutV2Tool._pane(p); return D.querySelector(`[data-mrpane="${p}"]`); };
  ok("the rail: 🔄 Country groups after 👥, ↩ Revert after ⊘", !!node("countrysync") && !!node("revert")
    && node("members").compareDocumentPosition(node("countrysync")) & 4 && node("exclusions").compareDocumentPosition(node("revert")) & 4);
  async function gates() {
    const t = $("mvConfirmText"); if (t) { t.value = "REMOVE"; t.dispatchEvent(new w.Event("input", { bubbles: true })); }
    const k = $("mvConfirmTick"); if (k && !k.checked) { k.checked = true; k.dispatchEvent(new w.Event("change", { bubbles: true })); }
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
  const check = (el, on) => { el.checked = on; el.dispatchEvent(new w.Event("change", { bubbles: true })); };

  // ------------------------------------------------------- 🔄 the read --
  node("countrysync").click();
  ok("🔄 opens and offers its read", st().pane === "countrysync" && !!$("mvCsRead"));
  $("mvCsRead").click();
  ok("the read lands: the country groups and the extra (static groups, Revert)", await until(() => st().cs.extra && st().mem.model && !st().mem.loading, 15000, "cs read"));
  ok("the mapping per ISO3 is shown, and says the groups are created in 👥 (10680)", /INT-SG-U-NLD/.test($("mvCsMap").textContent) && /INT-SG-D-NLD/.test($("mvCsMap").textContent) && !$("mvCsMapOk") && /created in one place/.test($("mvCsMap").textContent));
  ok("the head per country: NL's source is still dynamic in the Euro wave, never synced; its static group to create in 👥", /dynamic/.test($("mvCsWaves").textContent) && /never/.test($("mvCsWaves").textContent) && /create in 👥/.test($("mvCsWaves").textContent));
  const swapBtn = () => D.querySelector('[data-mrcsswap="Euro"]');
  ok("⇄ Swap Euro is offered", swapBtn() && !swapBtn().disabled);
  swapBtn().click();
  ok("10680: 🔄 creates nothing — without INT-SG-U-NLD the swap plans nothing for NL and points at 👥", st().plan && !st().plan.ops.length && /INT-SG-U-NLD does not exist — create & fill it in 👥 Wave members/.test($("mvPlan").textContent));

  // ------------------------------------------- 👥 creates both groups --
  node("members").click();
  ok("👥 shows the static user group beside the device group: INT-SG-U-NLD to create, NL in the wave through its dynamic group", st().pane === "members" && /User group · sync/.test($("mvBody").textContent) && /INT-SG-U-NLD/.test($("mvBody").textContent) && /user wave · dynamic/.test($("mvBody").textContent));
  check(D.querySelector('[data-mrmemsel="nl"]'), true);
  $("mvMemDry").click();
  const mp = st().plan;
  ok("👥 NL: INT-SG-U-NLD created and filled beside the device group's top-up; no second user nest, the swap named", mp && mp.ops.some((o) => o.type === "create" && o.name === "INT-SG-U-NLD") && mp.ops.some((o) => o.type === "add" && o.memberKind === "user" && o.ids.length === 2)
    && !mp.ops.some((o) => o.type === "nest" && o.kind === "user") && mp.skipped.some((x) => /⇄ swap/.test(x)), mp && JSON.stringify(mp.ops.map((o) => o.type)));
  const mr = await apply();
  const G = (n) => w.TUNO_DEMO_GRAPH.T.GROUPS.find((g) => g.displayName === n);
  ok("applied: INT-SG-U-NLD holds Eva and Milan", mr.ok === mp.ops.length && G("INT-SG-U-NLD") && G("INT-SG-U-NLD")._users.length === 2);

  // ------------------------------------------------------------ ⇄ swap --
  node("countrysync").click();
  swapBtn().click();
  const sp = st().plan;
  ok("the swap plan: nest INT-SG-U-NLD, check, unnest the PVM group", sp && sp.runKind === "waveswap" && sp.ops.map((o) => o.type).join() === "nest,swapcheck,unnest" && sp.ops[2].child.name === "PVM-UG-CORP-MEM-USERS-NL", sp && sp.ops.map((o) => o.type).join());
  ok("…its impact and way back are said, and the unnest is typed", /Likely impact: none/.test($("mvPlan").textContent) && /Way back/.test($("mvPlan").textContent) && !!$("mvConfirmText") && /check the sets/.test($("mvPlan").textContent));
  const sr = await apply();
  ok("applied: three steps written and verified, the check among them", sr.ok === 3 && sr.runKind === "waveswap", JSON.stringify(sr.lines));
  ok("the tenant: INT-SG-U-NLD sits in the Euro user wave; the PVM group does not", (G("INT-SG-U-NLD").memberOf || []).includes(G("INT-SG-U-WAVE-Euro").id) && !(G("PVM-UG-CORP-MEM-USERS-NL").memberOf || []).includes(G("INT-SG-U-WAVE-Euro").id));
  ok("the head moved with it: NL static, nothing left to swap in Euro", st().pane === "countrysync" && /static/.test($("mvCsWaves").textContent) && swapBtn().disabled);

  // ------------------------------------------------------------ 🔄 sync --
  const items = w.MdeRevert.syncItems(st().csModel(), "all");
  ok("the sync preview: Alex's laptop in INT-SG-D-NLD is a leaver, unticked; countries without groups point at 👥", items.some((x) => x.dir === "leave" && x.kind === "device") && [...st().cs.ticks].every((k) => k.startsWith("add|")) && /create &amp; fill them|create & fill them/.test($("mvCsSync").innerHTML));
  const nlScope = $("mvCsScope");
  nlScope.value = "nl"; nlScope.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("a per-ISO3 scope: NL only", st().cs.scope === "nl" && w.MdeRevert.syncItems(st().csModel(), "nl").every((x) => x.row.key === "nl"));
  const lv = w.MdeRevert.syncItems(st().csModel(), "nl").find((x) => x.dir === "leave");
  check(D.querySelector(`[data-mrcstick="${lv.key}"]`), true);
  $("mvCsDry").click();
  const syp = st().plan;
  ok("the NL sync plan: the leaver out by $batch, typed", syp && syp.runKind === "groupsync" && syp.ops.length === 1 && syp.ops[0].type === "remove" && syp.ops[0].batch && !!$("mvConfirmText") && /🔄 Country groups — NLD/.test(syp.title));
  const syr = await apply();
  ok("applied and read back; NL's last sync is stamped in this browser", syr.ok === syp.ops.length && syr.runKind === "groupsync" && JSON.parse(store.get([...store.keys()].find((k) => /^tuno\.t28\.groupsync\./.test(k))) || "{}").nl);

  // ---------------------------------------------------------- ↩ revert --
  node("revert").click();
  ok("↩ Revert opens and offers its read", st().pane === "revert" && (!!$("mvRvRead") || !!st().ex.base));
  if ($("mvRvRead")) $("mvRvRead").click();
  ok("…the devices are read and the search is there", await until(() => st().ex.base && $("mvRvQ"), 15000, "rv read"));
  $("mvRvQ").value = "eva"; $("mvRvQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  $("mvRvQ").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok("search finds Eva", await until(() => D.querySelector("[data-mrrvpick]"), 10000, "rv hits"));
  D.querySelector("[data-mrrvpick]").click();
  ok("her card: the pair ticked — Eva and WS-FIN-0142", await until(() => st().rv.card && $("mvRvCard"), 10000, "rv card") && st().rv.ticks.has(`u:${st().rv.card.user.id}`) && [...st().rv.ticks].some((k) => k.startsWith("m:")));
  ok("…her country user group is the static one, and what changes is shown per policy", /INT-SG-U-NLD/.test($("mvRvCard").textContent) && /What changes, per policy/.test($("mvRvCard").textContent));
  $("mvRvReason").value = "Finance LOB app blocked by ASR — ticket 4711"; $("mvRvReason").dispatchEvent(new w.Event("input", { bubbles: true }));
  $("mvRvDry").click();
  const rp = st().plan;
  ok("the revert plan: create both Revert groups, add, then out of INT-SG-U-NLD and INT-SG-D-NLD", rp && rp.runKind === "revert" && rp.ops.map((o) => `${o.type}:${o.name || o.group.name}`).join() === "create:INT-SG-U-MDE-HoldBack,add:INT-SG-U-MDE-HoldBack,remove:INT-SG-U-NLD,create:INT-SG-D-MDE-HoldBack,add:INT-SG-D-MDE-HoldBack,remove:INT-SG-D-NLD", rp && rp.ops.map((o) => `${o.type}:${o.name || o.group.name}`).join());
  ok("…the reason is in the plan, the removal typed", /ticket 4711/.test($("mvPlan").textContent) && !!$("mvConfirmText"));
  const rr = await apply();
  ok("applied: six steps verified", rr.ok === 6 && rr.runKind === "revert" && rr.reason === "Finance LOB app blocked by ASR — ticket 4711");
  ok("the tenant: Eva in INT-SG-U-MDE-HoldBack, out of INT-SG-U-NLD; her laptop likewise", G("INT-SG-U-MDE-HoldBack")._users.includes(w.TUNO_DEMO_GRAPH.T.USERS.find((u) => u.displayName === "Eva Employee").id)
    && !G("INT-SG-U-NLD")._users.includes(w.TUNO_DEMO_GRAPH.T.USERS.find((u) => u.displayName === "Eva Employee").id) && G("INT-SG-D-MDE-HoldBack")._devices.length === 1 && !G("INT-SG-D-NLD")._devices.includes(G("INT-SG-D-MDE-HoldBack")._devices[0]));
  ok("Reverted now lists them with the reason; the rail counts 1 · 1", await until(() => /Held back now/.test($("mvRvNow").textContent) && /ticket 4711/.test($("mvRvNow").textContent), 5000, "rv now") && st().cs.extra.revertUsers.size === 1 && st().cs.extra.revertDevices.size === 1);

  // ----------------------------------------------- the sync holds them back --
  node("countrysync").click();
  const sm2 = st().csModel();
  const it2 = w.MdeRevert.syncItems(sm2, st().cs.scope);
  const re = it2.filter((x) => x.dir === "reinc");
  ok("🔄 now holds Eva and her laptop back, with the reason, unticked", re.length === 2 && re.every((x) => !st().cs.ticks.has(x.key)) && /Held back/.test($("mvCsSync").textContent) && /ticket 4711/.test($("mvCsSync").textContent));
  re.forEach((x) => check(D.querySelector(`[data-mrcstick="${x.key}"]`), true));
  ok("ticking them shows the confirm line naming the count and the wave", !!$("mvCsConfirm") && /re-include 1 user and 1 device in wave Euro; they lose the old MDE policies/.test($("mvCsSync").textContent));
  $("mvCsDry").click();
  ok("the dry run refuses without the confirm", !st().plan && /re-include 1 user and 1 device/.test($("mvPlan").textContent));
  check($("mvCsConfirm"), true);
  $("mvCsDry").click();
  ok("with the confirm: back into the country groups, out of Revert after each add", st().plan && st().plan.ops.filter((o) => o.type === "remove" && /MDE-Revert/.test(o.group.name)).every((o) => o.needsOk && o.needsOk.length));

  // ---------------------------------------------------- the way back --
  node("revert").click();
  const evaKey = [...st().csModel().revertUsers.keys()].map((id) => `u:${id}`)[0];
  check(D.querySelector(`[data-mrrvsel="${evaKey}"]`), true);
  $("mvRvUndoDry").click();
  const up = st().plan;
  ok("↩ Back into the wave: into INT-SG-U-NLD, then out of Revert", up && up.ops.map((o) => `${o.type}:${o.group.name}`).join() === "add:INT-SG-U-NLD,remove:INT-SG-U-MDE-HoldBack" && up.ops[1].needsOk.join() === "0");
  const ur = await apply();
  const eva = w.TUNO_DEMO_GRAPH.T.USERS.find((u) => u.displayName === "Eva Employee").id;
  const reasons = JSON.parse(store.get([...store.keys()].find((k) => /^tuno\.t28\.revert\.reasons\./.test(k))) || "{}");
  ok("applied: Eva back in INT-SG-U-NLD, out of Revert, her reason gone; the laptop still reverted", ur.ok === 2 && !G("INT-SG-U-MDE-HoldBack")._users.length && G("INT-SG-U-NLD")._users.includes(eva) && !reasons[eva] && Object.keys(reasons).length === 1);
  ok("📜 lists the five runs with their kinds", [null, "waveswap", "groupsync", "revert", "revert"].every((k, i) => (st().runs[i].runKind || null) === k));

  console.log(`T28 revert & country groups screen: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  w.close();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

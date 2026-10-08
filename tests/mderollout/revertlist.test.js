// T28 — ↩ Revert, the list (build 10685), driven end to end in DEMO mode:
// Mihai (6 Oct 2026): "revert should also be possible in bulk" — option C
// off the mockup. ＋ Add on a search card, a pasted list (a miss said), the
// pair per entry, one merged plan, the confirm line that gates ④ Apply
// (his pick: "confirm line always"), the list emptying after the run, a
// group's members as a third way in, and Clear.
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
  await until(() => { const s = w.MdeRolloutV2Tool._state(); return s.model && s.project.attempted.size === 4 && !s.project.starting && !s.project.task && !s.project.timer && !s.running && !s.enriching; }, 30000, "automatic project reads");
  await until(() => $("mvBody").querySelector(".ep-rail"), 30000, "rail");
  const idle = () => until(() => { const s = st(); return !s.running && !s.busy && !s.enriching && !s.project.starting && !s.project.task && !s.project.timer && !s.reps.busy; }, 30000, "idle");
  await idle();
  const node = (p) => { w.MdeRolloutV2Tool._pane(p); return D.querySelector(`[data-mrpane="${p}"]`); };
  async function gates(opts) {
    const o = opts || {};
    const t = $("mvConfirmText"); if (t) { t.value = "REMOVE"; t.dispatchEvent(new w.Event("input", { bubbles: true })); }
    const k = $("mvConfirmTick"); if (k && !k.checked) { k.checked = true; k.dispatchEvent(new w.Event("change", { bubbles: true })); }
    const r = $("mvRiskReason"), a = $("mvRiskAccept");
    if (r && a && !a.checked) { r.value = "Accepted by the headless suite for this demo plan."; r.dispatchEvent(new w.Event("input", { bubbles: true })); a.checked = true; a.dispatchEvent(new w.Event("change", { bubbles: true })); }
    const b = $("mvMemberBackup");
    if (b && !b.disabled) { b.click(); await until(() => /downloaded|failed/.test($("mvMemberBackup").textContent), 10000, "backup"); }
    const c = $("mvBulkConfirm"); if (c && !o.noConfirm && !c.checked) { c.checked = true; c.dispatchEvent(new w.Event("change", { bubbles: true })); }
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
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
  const G = (n) => w.TUNO_DEMO_GRAPH.T.GROUPS.find((g) => g.displayName === n);
  const U = (n) => w.TUNO_DEMO_GRAPH.T.USERS.find((u) => u.displayName === n).id;

  // the static NL groups (👥) and the Euro swap (🔄), as in revertscreen
  node("countrysync").click();
  $("mvCsRead").click();
  await until(() => st().cs.extra && st().mem.model && !st().mem.loading, 15000, "cs read");
  node("members").click();
  check(D.querySelector('[data-mrmemsel="nl"]'), true);
  $("mvMemDry").click();
  await apply();
  node("countrysync").click();
  D.querySelector('[data-mrcsswap="Euro"]').click();
  const sr = await apply();
  ok("set-up: INT-SG-U-NLD holds Eva and Milan and sits in the Euro user wave", sr.runKind === "waveswap" && G("INT-SG-U-NLD")._users.length === 2);

  // ---------------------------------------------------- ↩ the list --
  node("revert").click();
  if ($("mvRvRead")) $("mvRvRead").click();
  ok("↩ Revert reads, and offers 🔎 One at a time and 📋 The list", await until(() => st().ex.base && $("mvRvQ"), 15000, "rv read") && !!D.querySelector('[data-mrrvmode="list"]') && st().rv.mode === "one");
  // ＋ Add from a card
  type($("mvRvQ"), "milan");
  $("mvRvQ").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await until(() => D.querySelector("[data-mrrvpick]"), 10000, "hits");
  D.querySelector("[data-mrrvpick]").click();
  await until(() => st().rv.card && $("mvRvAdd"), 10000, "card");
  $("mvRvAdd").click();
  ok("＋ Add to the list on Milan's card: the list has him, the mode chip counts 1", st().rv.list.length === 1 && st().rv.list[0].key === `u:${U("Milan Medewerker").toLowerCase()}` && /The list · 1/.test(D.querySelector('[data-mrrvmode="list"]').textContent));
  D.querySelector('[data-mrrvmode="list"]').click();
  ok("📋 The list: paste and group ways in, the list shown", st().rv.mode === "list" && !!$("mvRvListText") && !!D.querySelector('[data-mrrvsrc="group"]') && /The list · 1 entry/.test($("mvRvList").textContent));
  type($("mvRvListText"), "eva@contoso.com\nmilan@contoso.com\nnobody@contoso.com");
  ok("the add button counts the lines", /＋ Add · 3 lines/.test($("mvRvListGo").textContent) && !$("mvRvListGo").disabled);
  $("mvRvListGo").click();
  ok("looked up: Eva added, Milan replaced (not doubled), nobody@ not added and said why", await until(() => !st().rv.listBusy && st().rv.list.length === 2, 15000, "list")
    && st().rv.misses.length === 1 && /no user has this UPN/.test($("mvRvList").textContent) && /1 line not added/.test($("mvRvList").textContent));
  ok("each entry is the pair: user and laptop ticked, in INT-SG-U-NLD / INT-SG-D-NLD", st().rv.list.every((e) => e.ticks.has(`u:${e.card.user.id}`) && [...e.ticks].some((k) => k.startsWith("m:")))
    && /INT-SG-U-NLD/.test($("mvRvList").textContent) && /INT-SG-D-NLD/.test($("mvRvList").textContent));
  ok("the per-policy view is counted for the whole list", /What changes, per policy — counted/.test($("mvRvList").textContent));
  ok("the list is kept in this browser as lines", JSON.parse(store.get([...store.keys()].find((k) => /^tuno\.t28\.revert\.list\./.test(k)))).lines.length === 2);
  // untick and tick a member
  const lt = D.querySelector("[data-mrrvltick]");
  check(lt, false);
  ok("a tick moves the bar's count", /1 user/.test($("mvRvListBar").textContent));
  check(D.querySelector(`[data-mrrvltick="${lt.dataset.mrrvltick}"]`), true);
  ok("…and back", /2 users · 2 devices/.test($("mvRvListBar").textContent) && /Euro/.test($("mvRvListBar").textContent));
  type($("mvRvReason"), "Finance LOB app blocked by ASR — ticket 4800");
  $("mvRvListDry").click();
  const p = st().plan;
  const sig = p && p.ops.map((o) => `${o.type}:${o.name || o.group.name}:${(o.ids || []).length}`).join(" ");
  ok("one plan for the list: both Revert groups created, one add each, one removal per country group", p && p.bulk && sig === "create:INT-SG-U-MDE-HoldBack:0 create:INT-SG-D-MDE-HoldBack:0 add:INT-SG-U-MDE-HoldBack:2 add:INT-SG-D-MDE-HoldBack:2 remove:INT-SG-U-NLD:2 remove:INT-SG-D-NLD:2", sig);
  ok("the confirm line names the counts and the wave", !!$("mvBulkConfirm") && /hold back 2 users and 2 devices in wave Euro; they lose the new MDE policies/.test($("mvPlan").textContent) && /ticket 4800/.test($("mvPlan").textContent));
  await gates({ noConfirm: true });
  ok("④ Apply stays locked without the confirm line, REMOVE typed and the backup taken", await until(() => $("mvMemApply"), 3000, "apply btn") && (await new Promise((r) => setTimeout(r, 200)), $("mvMemApply").disabled));
  check($("mvBulkConfirm"), true);
  ok("…and unlocks with it", await until(() => !$("mvMemApply").disabled, 5000, "unlock"));
  const n0 = st().runs.length;
  $("mvMemApply").click();
  await until(() => st().runs.length === n0 + 1, 15000, "run");
  const rr = st().runs[n0];
  ok("applied: six steps verified, run kind revert, the reason kept", rr.ok === 6 && rr.runKind === "revert" && rr.reason === "Finance LOB app blocked by ASR — ticket 4800");
  ok("the tenant: Eva and Milan in INT-SG-U-MDE-HoldBack, out of INT-SG-U-NLD; their laptops in the device Revert group, out of INT-SG-D-NLD",
    G("INT-SG-U-MDE-HoldBack")._users.length === 2 && !G("INT-SG-U-NLD")._users.length && G("INT-SG-D-MDE-HoldBack")._devices.length === 2 && !G("INT-SG-D-MDE-HoldBack")._devices.some((d) => (G("INT-SG-D-NLD")._devices || []).includes(d)));
  ok("the list empties itself: both entries reverted, said; Reverted now lists them with the reason", await until(() => !st().rv.list.length, 5000, "list empty")
    && /2 entries reverted and taken off the list/.test($("mvRvList").textContent) && /ticket 4800/.test($("mvRvNow").textContent));
  const reasons = JSON.parse(store.get([...store.keys()].find((k) => /^tuno\.t28\.revert\.reasons\./.test(k))) || "{}");
  ok("each member's reason is kept in this browser", Object.values(reasons).filter((x) => /4800/.test(x.reason)).length === 4);

  // 👥 members of a group, then the way back
  D.querySelector('[data-mrrvsrc="group"]').click();
  type($("mvRvGroup"), "PVM-UG-CORP-MEM-USERS-NL");
  $("mvRvGroupGo").click();
  ok("👥 a group's members go on the list (looked up like lines)", await until(() => !st().rv.listBusy && st().rv.list.length >= 2, 15000, "group") && st().rv.list.every((e) => e.source === "group: PVM-UG-CORP-MEM-USERS-NL"));
  ok("…already reverted: shown so, and nothing left to revert", /held back/.test($("mvRvList").textContent) && $("mvRvListDry").disabled);
  $("mvRvListClear").click();
  ok("Clear empties the list and the browser's copy", !st().rv.list.length && !JSON.parse(store.get([...store.keys()].find((k) => /^tuno\.t28\.revert\.list\./.test(k)))).lines.length);

  console.log(`T28 revert — the list: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  w.close();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

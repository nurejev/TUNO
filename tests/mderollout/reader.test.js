// T28 — the single reader (build 10722, Phase 2.2 of the 15 Oct rebuild
// plan). Graph.readCache: within one read generation, identical list reads
// flagged cache: true are answered once and shared (each caller gets its
// own copy); a failed read is not kept; reads without the flag, or outside
// a generation, never share; a new generation starts clean. The controller
// starts a generation at a refresh, at a hand ↻ and after every write,
// and the finished strip says how many lists were read and how many
// shared. The demo tenant proves the sharing end to end: the managed
// devices are read once for 👥, ⊘ and 📡.
const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch { /* not yet */ } await sleep(60); } console.error("timeout: " + what); return false; }

function boot() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const files = [...html.matchAll(/<script src="(js\/[^"?]+)\?v=\d+"><\/script>/g)].map((m) => m[1]);
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://localhost/", pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  const store = new Map();
  Object.defineProperty(w, "localStorage", { value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, configurable: true });
  w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
  w.msal = undefined;
  w.fetch = () => Promise.reject(new Error("no network in tests"));
  const fidb = require("fake-indexeddb"); w.indexedDB = fidb.indexedDB; w.IDBKeyRange = fidb.IDBKeyRange;
  w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n") + ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,TUNO_DEMO_GRAPH});");
  w.TUNO_DEMO_GRAPH.LATENCY_MS = 0;
  return w;
}

async function run() {
  const w = boot();
  const G = w.Graph, RC = G.readCache;

  // ------------------------------------------------------ the cache --
  // in the demo tenant (no sign-in), counted through the cache's own stats
  const D = w.document, $ = (id) => D.getElementById(id);
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  RC.clear();
  const L = "/groups?$filter=" + encodeURIComponent("startswith(displayName,'INT-SG-U-WAVE')") + "&$select=id,displayName&$top=999";
  const a1 = await G.readAll(L, { cache: true }), a2 = await G.readAll(L, { cache: true });
  ok("no generation: nothing is kept, even with the flag", a1.length > 0 && a2.length === a1.length && RC.stats().key === null && RC.stats().entries === 0);
  RC.begin("gen-1");
  const r1 = await G.readAll(L, { cache: true }), r2 = await G.readAll(L, { cache: true });
  ok("in a generation the second read is answered from the first — one read, one hit, two callers", RC.stats().reads === 1 && RC.stats().hits === 1 && r1.length === a1.length && r2.length === a1.length);
  r1.push({ id: "mine" });
  ok("each caller gets its own copy", r2.length === a1.length && (await G.readAll(L, { cache: true })).length === a1.length);
  await G.readAll(L, {}); await G.readAll(L, { cache: false });
  ok("without the flag nothing is shared (the stats do not move)", RC.stats().reads === 1 && RC.stats().hits === 2);
  const F = "/groups/00000000-0000-0000-0000-000000000000/members/microsoft.graph.user?$select=id&$top=999";
  let threw = 0;
  for (let i = 0; i < 2; i++) { try { await G.readAll(F, { cache: true }); } catch { threw++; } }
  ok("a failed read is not kept — the next caller reads again and fails again", threw === 2 && !RC.map.has(F) && RC.stats().reads === 3);
  const L2 = L.replace("WAVE", "MDE");
  const [p1, p2] = await Promise.all([G.readAll(L2, { cache: true }), G.readAll(L2, { cache: true })]);
  ok("two callers in flight at once share the one read", RC.stats().reads === 4 && RC.stats().hits === 3 && p1.length === p2.length);
  RC.begin("gen-1"); ok("begin with the same key keeps the generation", RC.stats().entries > 0 && RC.stats().key === "gen-1");
  RC.begin("gen-2"); ok("a new key starts clean", RC.stats().entries === 0 && RC.stats().hits === 0 && RC.stats().reads === 0);
  RC.clear(); ok("clear ends the generation", RC.stats().key === null);

  // ------------------------------------------- the controller, in demo --
  $("toolMdeRollout").click();
  await sleep(150);
  const T = w.MdeRolloutV2Tool, st = () => T._state();
  await until(() => { const s = st(); return s.model && s.project.attempted.size === 5 && !s.project.starting && !s.project.task && !s.project.timer && !s.running && !s.enriching; }, 60000, "project read");
  await until(() => !st().running && !st().busy && !st().enriching && !st().project.task && !st().project.timer && !st().reps.busy && !st().ex.scanBusy && !st().mem.loading && !st().ex.loading, 30000, "idle");
  const rc = T._readCache();
  ok("the automatic project read is one generation: lists were read, and the panes shared some", /^t28:/.test(rc.key) && rc.reads > 10 && rc.hits > 0, JSON.stringify(rc));
  ok("the managed devices were read ONCE for 👥, ⊘ and 📡", [...w.Graph.readCache.map.keys()].filter((k) => /deviceManagement\/managedDevices\?\$select=/.test(k)).length === 1 && st().mem.input && st().ex.base && st().ex.base.managed.length > 0, [...w.Graph.readCache.map.keys()].filter((k) => /managedDevices/.test(k)).join(" | ").slice(0, 300));
  ok("⊘ sees only Windows devices although the shared list is unfiltered", st().ex.base.managed.every((m) => /windows/i.test(m.operatingSystem || "")));
  const gen0 = T._readGen();
  T._pane("overview"); await sleep(100);
  ok("the finished strip says how many lists were read and shared", /lists read, \d+ shared/.test(D.getElementById("mvBody").textContent) || /lists read/.test(D.body.textContent), D.body.textContent.match(/\d+ lists read[^·]*/) && D.body.textContent.match(/\d+ lists read[^·]*/)[0]);
  // a hand ↻ in 👥 is a fresh generation
  T._pane("members"); await sleep(100);
  $("mvMemRead").click();
  await until(() => st().mem.model && !st().mem.loading, 20000, "members re-read");
  ok("a hand ↻ Read starts a new generation (nothing stale is served)", T._readGen() === gen0 + 1 && T._readCache().key.endsWith(`:${gen0 + 1}`));

  console.log(`T28 single reader: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exit(1); });

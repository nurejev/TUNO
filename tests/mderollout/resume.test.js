// T28 — ↷ Resume a run that stopped (build 10723, Phase 2.3 of the 15 Oct
// rebuild plan). In the demo: a 👥 plan for the Netherlands and Germany
// where the tenant throttles Germany's device group and never lets up —
// the run stops there (10710), the steps after it are skipped as stopped,
// what was done stays. 📜 offers ↷ Resume on that run; the resume plan
// holds exactly the steps not done, goes through the whole contract (a
// new backup, the confirm line, Apply) and finishes the job; the record
// says which run it resumed. A clean run offers no resume.
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
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,MdeMembers,TUNO_DEMO_GRAPH,T28Plan});";
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
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  await until(() => { const s = st(); return s.model && s.project.attempted.size === 5 && !s.project.starting && !s.project.task && !s.project.timer && !s.running && !s.enriching && s.mem.model && s.cs.extra; }, 60000, "project read");
  const idle = () => until(() => { const s = st(); return !s.running && !s.busy && !s.enriching && !s.project.task && !s.project.timer && !s.reps.busy && !s.mem.loading && !s.ex.loading; }, 30000, "idle");
  await idle();
  async function gates() {
    const t = $("mvConfirmText"); if (t) { t.value = "REMOVE"; t.dispatchEvent(new w.Event("input", { bubbles: true })); }
    const b1 = $("mvBulkConfirm"); if (b1 && !b1.checked) { b1.checked = true; b1.dispatchEvent(new w.Event("change", { bubbles: true })); }
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
    await until(() => st().runs.length === n + 1, 20000, "run");
    return st().runs[n];
  }
  const check = (el, on) => { el.checked = on; el.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const G = (n) => w.TUNO_DEMO_GRAPH.T.GROUPS.find((g) => g.displayName === n);

  // ------------------------------------- a plan for two countries --
  T._pane("members"); await sleep(100);
  check(D.querySelector('[data-mrmemsel="nl"]'), true);
  check(D.querySelector('[data-mrmemsel="de"]'), true);
  $("mvMemDry").click();
  ok("👥 plans the Netherlands and Germany: creates, adds and nests", await until(() => st().plan && st().plan.ops.length >= 6, 5000, "plan") && st().plan.ops.some((o) => o.type === "add" && /DEU/.test(o.group.name || o.group.ref || "")), JSON.stringify(st().plan && st().plan.ops.map((o) => `${o.type}:${o.name || (o.group && (o.group.name || o.group.ref)) || (o.child && o.child.name)}`)));
  const planned = st().plan.ops.length;
  // the tenant throttles Germany's device adds and never lets up; the waits are not slept
  w.MdeMembers._setWait(async () => {});
  const realPatch = w.Graph.patch;
  w.Graph.patch = async (p, body, o) => {
    const gid = p.split("/")[2];
    const g = w.TUNO_DEMO_GRAPH.T.GROUPS.find((x) => x.id === gid);
    if (g && /INT-SG-D-MDE-DEU/.test(g.displayName) && body && body["members@odata.bind"]) { const e = new Error("The tenant is throttling this request — retry in 30s."); e.kind = "throttled"; e.status = 429; e.retryAfter = "30"; throw e; }
    return realPatch(p, body, o);
  };
  const r1 = await apply();
  ok("the run stops at Germany's device group — the step before it done, the steps after it skipped as stopped, said on the run", r1.stopped === true && r1.ok > 0 && r1.ok < planned && /throttled — stopped/.test(r1.lines.join("\n")) && r1.lines.some((l) => /skipped/.test(l)), JSON.stringify(r1.lines));
  ok("the run record carries the planned steps and what was done (10721)", Array.isArray(r1.ops) && r1.ops.length === planned && Array.isArray(r1.done) && r1.done.length === r1.ok);
  w.Graph.patch = realPatch;

  // ----------------------------------------------- 📜 offers ↷ Resume --
  T._pane("changes"); await sleep(100);
  const idx = st().runs.length - 1;
  const rsBtn = D.querySelector(`[data-mrresume="${idx}"]`);
  ok("📜 offers ↷ Resume on the stopped run, beside ↶ Undo", !!rsBtn && !!D.querySelector(`[data-mrundo="${idx}"]`) && /Resume this run — plan the steps left/.test(rsBtn.textContent));
  rsBtn.click();
  await until(() => st().plan && st().plan.resumeOf, 5000, "resume plan");
  const rp = st().plan;
  const left = r1.ops.filter((op) => !r1.done.some((d) => w.T28Plan.opKey(d) === w.T28Plan.opKey(op)));
  ok("the resume plan holds exactly the steps not done, in order, each pointing at a group by id (a created group's ref resolved), as a members plan in 👥 with the run's title", st().pane === "members" && rp.members && rp.ops.length === left.length && rp.ops.every((o, i) => o.type === left[i].type && (o.ids || []).join() === (left[i].ids || []).join()) && rp.ops.filter((o) => (o.group || o.child) && (o.group || o.child).ref && r1.done.some((d) => d.type === "create" && d.name === (o.group || o.child).ref)).every((o) => (o.group || o.child).id) && rp.ops.some((o) => o.type === "create") && rp.title === `Resume: ${r1.title}` && rp.resumeOf === r1.id, JSON.stringify([rp.ops.length, left.length]));
  ok("…the confirm line says where it picks up, the impact says a new backup and the hold-back are read again", new RegExp(`resume the run from step ${planned - left.length + 1} of ${planned}`).test($("mvPlan").textContent) && /reads the groups again/.test($("mvPlan").textContent) && !!$("mvBulkConfirm"));
  // through the whole contract: backup, gates, apply
  const r2 = await apply();
  ok("the resume finishes the job: every step left done and verified, nothing done twice, the record names the run it resumed", r2.ok === left.length && r2.bad === 0 && !r2.stopped && r2.resumeOf === r1.id && /^Resume: /.test(r2.title), JSON.stringify(r2.lines));
  ok("the tenant: Germany's device group filled, both countries' groups nested in the Euro waves", (G("INT-SG-D-MDE-DEU")._devices || []).length >= 1 && (G("INT-SG-D-MDE-DEU").memberOf || []).includes(G("INT-SG-D-WAVE-Euro").id) && (G("INT-SG-U-MDE-DEU").memberOf || []).includes(G("INT-SG-U-WAVE-Euro").id), JSON.stringify([G("INT-SG-D-MDE-DEU") && G("INT-SG-D-MDE-DEU")._devices, G("INT-SG-D-MDE-DEU") && G("INT-SG-D-MDE-DEU").memberOf]));
  T._pane("changes"); await sleep(100);
  ok("a clean run offers no resume; the stopped run stops offering it once its resume read back clean (10728); ↶ Undo stays on both", !D.querySelector(`[data-mrresume="${idx + 1}"]`) && !D.querySelector(`[data-mrresume="${idx}"]`) && !!D.querySelector(`[data-mrundo="${idx + 1}"]`));

  console.log(`T28 resume: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exit(1); });

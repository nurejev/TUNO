// T28 — the fault switch, lab and devcf only (build 10724, Phase 2.4 of
// the 15 Oct rebuild plan; Mihai, 16 Oct: "lab and devcf only"). The
// module alone: allowed only for the devcf tenant or a project file with
// lab: true; install wraps Graph only when allowed; an armed fault answers
// the next matching call once (or n times) and clears itself; the read
// fault matches reads, the write fault writes, the group fault one group.
// In the demo (not a lab): no panel, install a no-op. Then the demo made a
// lab through the project file: the panel appears in ⚙️, "next list read
// answers 429" makes a 👥 re-read say the row was not read (10709), and
// "write 503 ×6" stops a run that 📜 then offers to ↷ Resume (10723).
const fs = require("fs"), path = require("path"), vm = require("vm");
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

async function moduleAlone() {
  const ctx = vm.createContext({ Math, JSON, Date, Promise, Error, Object, Array, String, Number, console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/t28fault.js"), "utf8") + ";globalThis.F = T28Fault;", ctx);
  const F = ctx.F;
  ok("allowed: the devcf tenant, any case", F.allowed({ tenantId: "020EB2D3-8046-4257-828D-64BF3ECE8FBB" }) && F.allowed({ tenantId: F.LAB_TENANTS[0] }));
  ok("allowed: a project file saying lab: true", F.allowed({ tenantId: "11111111-2222-3333-4444-555555555555", projectFile: { lab: true } }));
  ok("NOT allowed: another tenant, a project file without lab, lab as a string, no context", !F.allowed({ tenantId: "11111111-2222-3333-4444-555555555555" }) && !F.allowed({ tenantId: "x", projectFile: { lab: "true" } }) && !F.allowed({}) && !F.allowed());
  const calls = [];
  const mk = () => ({ readAll: async (p) => { calls.push(["read", p]); return [1]; }, patch: async (p) => { calls.push(["patch", p]); return null; }, post: async (p) => { calls.push(["post", p]); return {}; }, del: async (p) => { calls.push(["del", p]); return null; } });
  const G0 = mk(), r0 = G0.readAll;
  ok("install on a non-lab does nothing — Graph untouched, arm refused", F.install(G0, { tenantId: "11111111-2222-3333-4444-555555555555" }) === false && G0.readAll === r0 && F.arm("read429", 1) === null && F.status().allowed === false);
  const G = mk();
  ok("install on the lab wraps the four calls once", F.install(G, { tenantId: F.LAB_TENANTS[0] }) === true && G.readAll !== mk().readAll && F.status().installed && F.install(G, { tenantId: F.LAB_TENANTS[0] }) === false);
  ok("nothing armed: calls go through untouched", (await G.readAll("/groups")).length === 1 && (await G.patch("/groups/x", {})) === null && calls.length === 2);
  F.arm("read429", 1);
  let threw = null; try { await G.readAll("/groups?x"); } catch (e) { threw = e; }
  ok("read429 armed: the next read answers 429 as a throttled error, once; a write goes through; the arm clears itself", threw && threw.status === 429 && threw.kind === "throttled" && threw.fault === "read429" && (await G.patch("/g", {})) === null && F.status().armed === null && F.status().fired.length === 1 && (await G.readAll("/groups")).length === 1);
  F.arm("write503", 3);
  let n = 0; for (let i = 0; i < 5; i++) { try { await G.post("/groups/x/members/$ref", {}); } catch (e) { if (e.status === 503) n++; } }
  ok("write503 ×3: exactly three writes answer 503, the fourth goes through; reads untouched meanwhile", n === 3 && F.status().armed === null);
  F.arm("groupread", 1, { id: "ABCDEF", name: "INT-SG-U-MDE-ITA" });
  ok("groupread: another group's read goes through, the chosen group's member read fails, then clear", (await G.readAll("/groups/other/transitiveMembers/microsoft.graph.user")).length === 1 && await G.readAll("/groups/abcdef/transitiveMembers/microsoft.graph.user").then(() => false, (e) => e.status === 503 && e.fault === "groupread") && F.status().armed === null);
  F.arm("read429", 1); F.clear();
  ok("clear disarms", F.status().armed === null && (await G.readAll("/x")).length === 1);
  ok("arm refuses an unknown kind and caps the count", F.arm("explode", 1) === null && F.arm("write503", 99).times === 10 && (F.clear(), true));
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
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,MdeMembers,TUNO_DEMO_GRAPH,T28Fault});";
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

async function screen() {
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
  // the demo tenant is not a lab
  T._pane("rules"); await sleep(100);
  ok("the demo is not a lab: no fault panel in ⚙️, the switch not installed", !/Fault switch/.test($("mvBody").textContent) && !w.T28Fault.status().allowed && !w.T28Fault.status().installed && !D.querySelector("[data-mrfault]"));
  // a project file that says lab: true makes it one
  T._projectFile({ status: "loaded", rules: JSON.parse(T._projectFileText()).rules, meta: { project: "LAB", customer: "test", tenantId: "", updated: "", lab: true }, why: "" });
  w.T28Fault.install(w.Graph, { tenantId: w.TunoTenant.tenantId(), projectFile: T._projectFile().meta });
  T._pane("rules"); await sleep(100);
  ok("a project file with lab: true: the panel appears with its three faults, nothing armed", /🧪 Fault switch — lab only/.test($("mvBody").textContent) && D.querySelectorAll("[data-mrfault]").length === 4 && /Nothing armed/.test($("mvFaultArmed").textContent) && !!$("mvFaultGroup") && $("mvFaultGroup").options.length > 1);
  // read429: the next list read answers 429 — a 👥 re-read's first list fails, the read says so
  D.querySelector('[data-mrfault="read429"]').click(); await sleep(50);
  ok("armed: the panel says so and offers Clear", /Armed:.*Next list read answers 429.*1 call left/.test($("mvFaultArmed").textContent) && !D.querySelector('[data-mrfault="clear"]').disabled);
  T._pane("members"); await sleep(100);
  const ug = st().mem.model.rows.find((r) => r.key === "nl").ug;
  $("mvMemRead").click();
  await until(() => !st().mem.loading && (st().mem.error || st().mem.model), 20000, "members re-read");
  ok("the fault landed on the first list the read asks for: the read fails with the switch's words, nothing half-read is shown", /fault switch/.test(st().mem.error || "") && st().mem.model === null, st().mem.error);
  ok("…and the arm is consumed", w.T28Fault.status().armed === null && w.T28Fault.status().fired.length === 1);
  // groupread: NL's source group fails — its row says not read (10709), the others read
  w.T28Fault.arm("groupread", 1, { id: ug.id, name: ug.displayName });
  $("mvMemRead").click();
  await until(() => st().mem.model && !st().mem.loading, 20000, "members re-read 2");
  const nl = st().mem.model.rows.find((r) => r.key === "nl");
  ok("groupread on NL's source group: NL is 'not read' with the switch's words, the other rows read, nothing planned for NL", /fault switch/.test(nl.unread) && nl.read.source === "failed" && st().mem.model.rows.filter((r) => r.unread).length === 1 && nl.uRemove.length === 0 && nl.add.length === 0, JSON.stringify([nl.unread, st().mem.input.failed]));
  // a clean re-read, then write503 ×6 stops a run that 📜 can resume
  $("mvMemRead").click();
  await until(() => st().mem.model && !st().mem.loading && !st().mem.model.rows.some((r) => r.unread), 20000, "clean re-read");
  w.MdeMembers._setWait(async () => {});
  const check = (el, on) => { el.checked = on; el.dispatchEvent(new w.Event("change", { bubbles: true })); };
  check(D.querySelector('[data-mrmemsel="nl"]'), true);
  check(D.querySelector('[data-mrmemsel="de"]'), true);
  $("mvMemDry").click();
  await until(() => st().plan && st().plan.ops.length >= 6, 5000, "plan");
  const planned = st().plan.ops.length;
  // arm after the dry run and the backup (the backup reads, it does not write)
  const gates = async () => {
    const b1 = $("mvBulkConfirm"); if (b1 && !b1.checked) check(b1, true);
    const k = $("mvConfirmTick"); if (k && !k.checked) check(k, true);
    const r = $("mvRiskReason"), a = $("mvRiskAccept");
    if (r && a && !a.checked) { r.value = "Accepted by the headless suite."; r.dispatchEvent(new w.Event("input", { bubbles: true })); check(a, true); }
    const b = $("mvMemberBackup"); if (b && !b.disabled) { b.click(); await until(() => /downloaded|failed/.test($("mvMemberBackup").textContent), 10000, "backup"); }
  };
  await gates();
  await until(() => $("mvMemApply") && !$("mvMemApply").disabled, 10000, "apply unlocked");
  w.T28Fault.arm("write503", 6);
  const n0 = st().runs.length;
  $("mvMemApply").click();
  await until(() => st().runs.length === n0 + 1, 20000, "stopped run");
  const r1 = st().runs[n0];
  ok("write503 ×6: the run's first write is refused six times and the run stops there, the rest unsent", r1.stopped === true && r1.ok === 0 && /stopped/.test(r1.lines.join("\n")) && (st().plan === null || true), JSON.stringify(r1.lines.slice(0, 3)));
  T._pane("changes"); await sleep(100);
  ok("📜 offers ↷ Resume on it", !!D.querySelector(`[data-mrresume="${n0}"]`));
  D.querySelector(`[data-mrresume="${n0}"]`).click();
  await until(() => st().plan && st().plan.resumeOf, 5000, "resume plan");
  ok("the resume plan holds every step (nothing was done)", st().plan.ops.length === planned);
  await gates();
  await until(() => $("mvMemApply") && !$("mvMemApply").disabled, 10000, "apply unlocked 2");
  $("mvMemApply").click();
  await until(() => st().runs.length === n0 + 2, 20000, "resumed run");
  const r2 = st().runs[n0 + 1];
  ok("with the switch clear the resume finishes the whole job", r2.ok === planned && r2.bad === 0 && !r2.stopped && r2.resumeOf === r1.id, JSON.stringify(r2.lines));
}

(async () => {
  await moduleAlone();
  await screen();
  console.log(`T28 fault switch: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

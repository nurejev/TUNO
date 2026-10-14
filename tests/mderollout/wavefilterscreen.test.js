// T28 — ⚡④ W365/AVD filter on the waves, in the demo (build 10706).
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
  const bridge = ";Object.assign(window,{MdeRollout,Graph,PolicyCache,MdeRolloutV2Tool,MdeMembers,MdeTest,TUNO_DEMO_GRAPH,TOOL_VERSIONS});";
  const realErr = console.error, realLog = console.log, realWarn = console.warn;
  console.error = () => {}; console.log = () => {}; console.warn = () => {};
  let err = null;
  try { w.eval(src + "\n" + bridge); } catch (e) { err = e; }
  console.error = realErr; console.log = realLog; console.warn = realWarn;
  if (err) throw err;
  w.Graph.ensureScopes = async () => true;
  w.Graph.silentScopes = async () => true;
  w.TUNO_DEMO_GRAPH.LATENCY_MS = 0;
  return { w, files };
}

async function run() {
  const { w } = boot();
  const D = w.document, $ = (id) => D.getElementById(id);
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  const st = () => w.MdeRolloutV2Tool._state();
  await until(() => { const s = st(); return s.model && s.project.attempted.size === 5 && !s.project.starting && !s.project.task && !s.project.timer && !s.running && !s.enriching; }, 60000, "project read");
  await until(() => !st().running && !st().busy && !st().enriching && !st().project.task && !st().project.timer, 30000, "idle");
  w.MdeRolloutV2Tool._pane("waves");
  const card = () => $("mvRollCard");
  const btnRead = () => D.querySelector("[data-mrrollfilter]");
  ok("⚡ has row ④ after ②, before ③, not checked yet", !!card() && /④/.test(card().textContent) && /Exclude W365\/AVD by filter on the waves/.test(card().textContent)
    && card().textContent.indexOf("Exclude W365/AVD") < card().textContent.indexOf("Exclude the waves from the colliding") && /not checked yet/.test(card().textContent) && !!btnRead(), card() && card().textContent.slice(0, 600));
  ok("…the ⚙️ field carries the default name", (() => { w.MdeRolloutV2Tool._pane("rules"); const i = $("mvRuleFilter"); w.MdeRolloutV2Tool._pane("waves"); return !i || i.value === "PVM-DG-CORP-FILTER-W365/AVD"; })());
  // the demo tenant has no such filter: the check says so and names none near
  btnRead().click();
  ok("check without the filter: not found, no dry run", await until(() => /not found among/.test(card().textContent), 10000, "not found") && !D.querySelector("[data-mrroll='filterWaves']"));
  // add it, then check again
  w.TUNO_DEMO_GRAPH.T.FILTERS.push({ id: "f0000000-0000-4000-8000-0000000000a5", displayName: "PVM-DG-CORP-FILTER-W365/AVD", description: "", platform: "windows10AndLater",
    rule: '(device.deviceName -contains "-vdi-") or (device.model -startsWith "Cloud PC")', assignmentFilterManagementType: "devices", lastModifiedDateTime: new Date().toISOString(), payloads: [] });
  btnRead().click();
  ok("check again: the filter found and named, counts shown", await until(() => /Filter PVM-DG-CORP-FILTER-W365\/AVD/.test(card().textContent), 10000, "found"), card().textContent.slice(0, 800));
  const dry = D.querySelector("[data-mrroll='filterWaves']");
  ok("…the dry run is on, with rows to set", dry && !dry.disabled && /without a filter/.test(card().textContent));
  dry.click();
  ok("dry run: a plan of set-filter steps, a tick (no REMOVE), the confirm line names the filter", await until(() => $("mvApply") || /Nothing/.test(($("mvPlan") || {}).textContent || ""), 15000, "plan")
    && st().plan && st().plan.changes.length > 0 && st().plan.changes.every((o) => o.details.every((d) => d.action === "set-filter")) && !!$("mvConfirmTick") && !$("mvConfirmText")
    && /PVM-DG-CORP-FILTER-W365\/AVD<\/b> in Exclude mode|PVM-DG-CORP-FILTER-W365\/AVD in Exclude mode/.test($("mvPlan").textContent), ($("mvPlan") || {}).textContent);
  $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  $("mvBackup").click();
  { const r = $("mvRiskReason"), t = $("mvRiskAccept");
    if (r && t && !t.checked) { r.value = "Accepted by the headless suite for this demo plan."; r.dispatchEvent(new w.Event("input", { bubbles: true })); t.checked = true; t.dispatchEvent(new w.Event("change", { bubbles: true })); } }
  await until(() => !$("mvApply").disabled, 10000, "apply enabled");
  const n0 = st().runs.length;
  $("mvApply").click();
  ok("applied: the run on 📜 with its backup, one line per policy written (the demo does not persist assign writes, so no read-back)", await until(() => st().runs.length === n0 + 1, 20000, "run")
    && st().runs[n0].backup.policies.length > 0 && st().runs[n0].lines.every((l) => /written/.test(l)), JSON.stringify(st().runs[n0] && st().runs[n0].lines));
}

run().then(() => {
  console.log(`T28 wave filter (screen): ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

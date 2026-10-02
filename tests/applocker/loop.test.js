// T01 — the loop is the spine (build 10677, Option B, Mihai's pick on 2 Oct):
// one rail in loop order, lit from state; Next computed from the same state;
// one session across the two pane sets; an enforced profile picked at the
// audit step is pulled into the draft and the rail goes to stage 6 instead of
// refusing. Driven in DEMO mode through the whole app, with a slim cut of the
// real VNMPF5ZASH6 scan bundle of 2 Oct 2026 (device on the audit profile,
// 0 blocked · 1,103 would be blocked · 1,346 allowed).
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
  w.alert = () => {}; w.confirm = () => true;
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
  const bridge = ";Object.assign(window,{TOOL_VERSIONS,Graph,PolicyCache,AppLockerTool,TUNO_DEMO_GRAPH,APP_BUILD});";
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
const COL = (type, mode, rules) => `<RuleCollection Type="${type}" EnforcementMode="${mode}">${rules}</RuleCollection>`;
const PATH = (id, name, p) => `<FilePathRule Id="${id}" Name="${name}" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="${p}"/></Conditions></FilePathRule>`;
const G = "f2d3b90f-5a8e-4d28-9d48-20e0a2bb1bbd";
const enforced = () => ({ id: "enf-1", displayName: "Win - SEC - Device Security - D - AppLocker (Enforced) - R27.1 - V4.0.2", description: "", lastModifiedDateTime: "2026-10-01T10:00:00Z", omaSettings: [
  { "@odata.type": "#microsoft.graph.omaSettingString", displayName: "EXE", omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/AppLocker-${G}/EXE/Policy`, value: COL("Exe", "Enabled", PATH("a1", "Program Files", "%PROGRAMFILES%\\*") + PATH("a2", "Windows", "%WINDIR%\\*")) },
  { "@odata.type": "#microsoft.graph.omaSettingString", displayName: "MSI", omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/AppLocker-${G}/MSI/Policy`, value: COL("Msi", "Enabled", PATH("b1", "All MSI", "*.*")) },
  { "@odata.type": "#microsoft.graph.omaSettingString", displayName: "Script", omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/AppLocker-${G}/Script/Policy`, value: COL("Script", "Enabled", PATH("c1", "Scripts", "%PROGRAMFILES%\\*")) },
  { "@odata.type": "#microsoft.graph.omaSettingString", displayName: "StoreApps", omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/AppLocker-${G}/StoreApps/Policy`, value: COL("Appx", "Enabled", "") },
] });

async function run() {
  const { w } = boot();
  const D = w.document, $ = (id) => D.getElementById(id);
  const L = w.AppLockerTool._loop, T = w.AppLockerTool._tenant;
  const nodes = () => [...D.querySelectorAll("#alRail [data-alstage]")];
  const stage = (n) => L.loopStages().stages.find((x) => x.n === n);

  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolAppLocker").click();
  await sleep(200);

  // ------------------------------------------------- the empty table --
  ok("the rail is the loop: six stages and Help, in order, nothing else", nodes().length === 7 && nodes().map((b) => b.dataset.alstage).join("") === "1234567" && /1 · Draft/.test(nodes()[0].textContent) && /6 · Enforce/.test(nodes()[5].textContent) && /Help and scripts/.test(nodes()[6].textContent));
  ok("the two-workspace switcher is gone", $("alWorkspaces") && $("alWorkspaces").innerHTML === "");
  let s = L.loopStages();
  ok("with nothing loaded, stage 1 is now and Next says how to get a draft", s.now === 1 && stage(1).status === "now" && /Next: create a draft, pull the deployed profile, or import one/.test(s.next) && stage(2).status === "wait" && stage(3).status === "wait");
  ok("the status line carries that Next", /Next: create a draft/.test($("alStatus").textContent));

  // ------------------------------------------- the real bundle, slimmed --
  const text = fs.readFileSync(path.join(__dirname, "fixtures/scan-VNMPF5ZASH6-slim.json"), "utf8");
  const file = new w.File([text], "TunoAppLockerScan-VNMPF5ZASH6-20261002-1416.json", { type: "application/json" });
  const inp = $("alFile"); Object.defineProperty(inp, "files", { value: [file] }); inp.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the scan bundle loads", await until(() => L.loopStages().stages[2].status === "done", 15000, "bundle"));
  s = L.loopStages();
  ok("2 Audit in tenant is done from the device's own effective policy: the Intune grouping, all collections AuditOnly", stage(2).status === "done" && /live on VNMPF5ZASH6 · AppLocker-f2d3b90f/.test(stage(2).fact), stage(2).fact);
  ok("3 Harvest is done with the device, the time and the event count", stage(3).status === "done" && /VNMPF5ZASH6 · 2026-10-02 07:16 UTC · 2449 events/.test(stage(3).fact), stage(3).fact);
  ok("4 Analyze shows the three lights' counts but waits for a draft", stage(4).status === "wait" && /0 blocked · 1103 would be blocked · 1346 allowed/.test(stage(4).fact), stage(4).fact);
  ok("Next is still the draft — the evidence is in, the policy is not", s.now === 1 && /create a draft, pull the deployed profile/.test(s.next));
  ok("the rail says it: ✓ on 2 and 3, ◉ on 1", /✓ 2 · Audit in tenant/.test(nodes()[1].textContent) && /✓ 3 · Harvest/.test(nodes()[2].textContent) && /◉ 1 · Draft/.test(nodes()[0].textContent));

  // ------------------------------------------- a draft: the loop moves --
  L.goStage(1);
  ok("stage 1 goes to the create side's start screen", L.workspace() === "create" && $("alPaneEvidence") && D.querySelector(".al-node.active") && /1 · Draft/.test(D.querySelector(".al-node.active").textContent));
  $("alNew").click();
  await sleep(100);
  s = L.loopStages();
  ok("with a draft, 1 is done and the loop stands at 4: the would-be-blocked executions are the work", stage(1).status === "done" && (stage(4).status === "now" || stage(4).status === "done") && (s.now === 4 || s.now === 5), JSON.stringify({ s1: stage(1).status, s4: stage(4).status, now: s.now }));
  ok("Next names the 1103 (or, judged, the update in place)", /Next: judge the 1103 would-be-blocked executions/.test(s.next) || /Next: update the audit policy in place/.test(s.next), s.next);
  ok("5 and 6 wait their turn", stage(5).status !== "done" && stage(6).status === "wait");

  // ------------------------------------------------ stage clicks --
  nodes()[5].click();
  ok("clicking 6 Enforce lands on the create side's Deploy, with 6 lit", L.workspace() === "create" && L.stageOn() === 6 && /6 · Enforce/.test(D.querySelector(".al-node.active").textContent));
  nodes()[6].click();
  ok("Help and scripts is the seventh node", /Help and scripts/.test(D.querySelector(".al-node.active").textContent));
  nodes()[2].click();
  ok("3 Harvest is the evidence screen, where the tenant card and the imports live", L.stageOn() === 3 && $("alPaneEvidence").style.display !== "none");

  // -------------------------------- the enforced profile at the audit step --
  const realHydrate = w.Graph.hydrateOmaSettings;
  w.Graph.hydrateOmaSettings = async (p) => ({ profile: p, errors: [] });
  let threw = null;
  try { await w.AppLockerTool._audit.selectAuditProfile(enforced()); } catch (e) { threw = e; }
  ok("an enforced profile picked at the audit step is not refused", threw === null, threw && threw.message);
  ok("…it is pulled into the draft, enforced, under its grouping", T.policy() && T.policy().collections.length === 4 && T.policy().collections.every((c) => c.mode === "Enabled") && T.adopted() && T.adopted().enforced === true && /Intune profile · Win - SEC/.test(L.loopStages().stages[0].fact) === false);
  ok("…the rail goes to stage 6 on the create side and the note says why", L.stageOn() === 6 && L.workspace() === "create" && /is the enforced profile — stage 6's/.test(L.note()) && /enforced profile/.test($("alStatus").textContent));
  ok("…and 6 reads ready: a pulled enforced profile with nothing changed is a maintenance update", stage(6).status === "ready" && /maintenance update/.test(stage(6).fact), stage(6).fact);
  w.Graph.hydrateOmaSettings = realHydrate;

  // ----------------------------------------------- one session --
  L.goStage(4);
  const before = JSON.stringify(T.policy());
  L.goStage(1);
  ok("moving between stages keeps the one draft and the evidence (no session swap)", JSON.stringify(T.policy()) === before && stage(3).status === "done");

  console.log(`applocker/loop: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

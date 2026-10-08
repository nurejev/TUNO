// T28 project cockpit: automatic reads, complete navigation, lifecycle and report freshness.
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
  const bridge = ";Object.assign(window,{TOOL_VERSIONS,Graph,PolicyCache,MdeRollout,AssignEdit,TUNO_DEMO_GRAPH,MdeMembers,MdeRevert,MdeLanding,MdeReports,ConflictDevices,MdeAsr,MdeRolloutV2Tool,T28V2Safety,TunoTenant});";
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
  const { w, store } = boot(), D = w.document, $ = (id) => D.getElementById(id), tool = w.MdeRolloutV2Tool, st = () => tool._state();
  const idle = () => until(() => st().model && st().project.attempted.size === 4 && !st().project.starting && !st().project.task && !st().project.timer && !st().running && !st().reps.busy, 30000, "automatic project idle");
  const click = (sel) => { const el = D.querySelector(sel); if (!el) throw new Error("Missing UI: " + sel); el.click(); };
  $("demoLink").click(); await until(() => w.PolicyCache.get(), 20000, "sign in");
  let reads = 0, writes = 0;
  const refresh = w.PolicyCache.refresh, memberRead = w.MdeMembers.readInput;
  w.PolicyCache.refresh = (...args) => { reads++; return refresh(...args); };
  for (const k of ["patch", "del"]) { const f = w.Graph[k]; if (f) w.Graph[k] = (...args) => { writes++; return f(...args); }; }
  $("toolMdeRollout").click(); await idle();
  ok("all five sources load without a read button", ["policies","members","exclusions","landing","devices"].every((k) => /ready|partial/.test(st().project.sources[k].state)) && !!st().mem.model && !!st().ex.base && !!st().ld.model && !!st().dv.idx);
  ok("opening shares sign-in policies and writes nothing", reads === 0 && writes === 0 && st().runs.length === 0);
  const nav = () => [...D.querySelectorAll(".mr-navigation > [data-mrpane]")].map((e) => e.dataset.mrpane);
  ok("five areas, in approved order", nav().join() === "overview,wavehome,new,exceptionhome,journal");
  for (const [area, children] of Object.entries({overview:["overview","attention"],wavehome:["wavehome","members","countrysync","waves","landing"],new:["new","old","conflicts","asr","edgeext","retire","out"],exceptionhome:["exceptionhome","exclusions","revert"],journal:["journal","changes","reports","recovery"]})) {
    click(`.mr-navigation [data-mrpane="${area}"]`);
    for (const child of children) { click(`.t28-subnav [data-mrpane="${child}"]`); ok("existing area reachable: " + child, st().pane === child && $("mvBody").textContent.length > 100); }
  }
  click('.mr-navigation [data-mrpane="overview"]'); click('[data-project-country="nl"]');
  ok("country link opens its workspace", st().pane === "wavehome" && st().project.country === "nl" && /Netherlands/.test($("mvBody").textContent));
  for (const tab of ["members","policies","verification","exceptions","evidence"]) { click(`[data-project-wtab="${tab}"]`); ok("country tab " + tab, st().project.waveTab === tab); }
  click('[data-project-wtab="verification"]');
  ok("country verification matches devices by IDs", /WS-FIN-0142/.test($("mvBody").textContent) && /WS-ENG-0221/.test($("mvBody").textContent));
  click('[data-project-wtab="policies"]');
  ok("country policy view discloses whole-wave scope", /whole wave/.test($("mvBody").textContent) && /AV Configuration/.test($("mvBody").textContent));
  click('.mr-navigation [data-mrpane="exceptionhome"]');
  ok("one hold-back: hold back / resume, and the migration of the ⊘ pair while it exists", /One hold-back/.test($("mvBody").textContent) && /Hold back or resume/.test($("mvBody").textContent) && /Migrate the exclusions/.test($("mvBody").textContent) && /Resume = back into the wave/.test($("mvBody").textContent));
  click('.mr-navigation [data-mrpane="journal"]');click('.t28-subnav [data-mrpane="reports"]');
  for (const id of ["assign","config","conflicts","landing"]) { click(`[data-mrreport="${id}"]`); await until(() => st().reps[id] && !st().reps.busy, 15000, id+" automatic report"); ok(id+" has automatic preview, HTML and CSV", !!st().reps[id] && st().reps[id].csv.length > 0 && !!D.querySelector(`[data-report-preview="${id}"]`) && !!D.querySelector(`[data-mrrep="${id}"][data-mrrepfmt="html"]`)); }
  ok("report browsing needs no extra full-policy scan", reads === 0 && writes === 0);
  await idle(); const oldReport = st().reps.landing;
  st().ld.at += 1000; tool._pane("reports");
  await until(() => st().reps.landing !== oldReport, 10000, "stale report replaced");
  ok("a newer device read automatically replaces the landing report", st().reps.landing !== oldReport && st().reps.landing.statusAt === st().ld.at);
  await idle(); const before = st().mem.input;
  w.TunoScreenHooks["screen-mderollout"](); await idle();
  ok("revisit does not repeat the inventory read", st().mem.input === before);
  click('.mr-navigation [data-mrpane="wavehome"]'); click('.t28-subnav [data-mrpane="waves"]'); click('[data-mrroll="includeWaves"]');
  await until(() => st().plan && !st().busy, 10000, "prepared plan");
  const heldPlan = st().plan, heldDevices = st().dv.at;
  st().project.attempted.delete("devices");
  tool._pane("overview"); await sleep(100);
  ok("background reads preserve a prepared plan", st().plan === heldPlan && st().dv.at === heldDevices && !st().project.task);
  $("mvDiscard").click(); await idle();
  ok("discard releases the next queued source", !st().plan && st().dv.at > heldDevices);
  // Failed background reads are visible and are attempted once, never an endless retry.
  let failedReads = 0;
  w.MdeMembers.readInput = async () => { failedReads++; throw new Error("membership denied in fixture"); };
  $("mvRun").click(); await idle();
  ok("refresh rereads once and failed membership stays unknown", reads === 1 && failedReads === 1 && !st().mem.model && st().project.sources.members.state === "failed");
  click('.mr-navigation [data-mrpane="overview"]'); click("[data-project-details]");
  ok("read failure is visible in source details and attention list", /membership denied in fixture/.test($("mvBody").textContent) && /Membership unavailable/.test($("mvBody").textContent) && st().projectFindings().some((f) => f.id === "source-members"));
  await sleep(100); ok("failed automatic source is not retried indefinitely", failedReads === 1);
  // Delayed read: navigation is usable, a permission popup is never automatic,
  // and a response from the previous tenant cannot re-populate a reset project.
  let release;
  w.MdeMembers.readInput = (...args) => new Promise((resolve) => { release = async () => resolve(await memberRead(...args)); });
  $("mvRun").click(); await until(() => release, 15000, "delayed members");
  click('.mr-navigation [data-mrpane="journal"]');
  ok("navigation stays usable while background evidence loads", st().pane === "journal" && !!st().project.task);
  w.dispatchEvent(new w.Event("tuno:signout")); await release(); await sleep(100);
  ok("late read cannot restore a signed-out tenant", !st().model && !st().mem.model && !st().project.active && st().project.attempted.size === 0);
  w.MdeMembers.readInput = memberRead;
  w.Graph.silentScopes = async () => false;
  w.TunoScreenHooks["screen-mderollout"](); await sleep(50);
  ok("missing silent permission requires an explicit connect action", !st().model && st().project.sources.policies.state === "consent" && !!D.querySelector("[data-project-connect]"));
  w.close();
  console.log(`T28 project: ${passed} passed, ${failed} failed`); process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exit(1); });

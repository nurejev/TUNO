// T28 reading strip and rail dots (build 10695, option C off the mockup): the
// five automatic sources as steps while a read runs, folded to ticks after,
// the live lines moving the strip without a render, a dot per rail area.
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
  const { w } = boot(), D = w.document, $ = (id) => D.getElementById(id), tool = w.MdeRolloutV2Tool, st = () => tool._state();
  const idle = () => until(() => st().model && st().project.attempted.size === 4 && !st().project.starting && !st().project.task && !st().project.timer && !st().running && !st().reps.busy && !st().ld.busy && !st().dv.busy && !st().mem.loading, 30000, "automatic project idle");
  const strip = () => D.querySelector("#mvBody .t28-strip");
  const dots = () => [...D.querySelectorAll("#mvBody .mr-navigation > .ep-node")].map((n) => `${n.dataset.mrpane}:${(n.querySelector(".t28-dot") || { className: "none" }).className.replace("t28-dot", "").trim()}${n.querySelector(".t28-dotw") ? "/" + n.querySelector(".t28-dotw").textContent : ""}`);
  $("demoLink").click(); await until(() => w.PolicyCache.get(), 20000, "sign in");

  // the pure helpers
  ok("a live line's n-of-N becomes a fraction ('12 of 43', '4/5', a thousands separator); a line without one is null", st().lineFrac("Reading the wave members — 12 of 43 (Euro)…") === 12 / 43 && st().lineFrac("Reading the devices in conflict… 4/5 policies") === 0.8 && st().lineFrac("Reading Intune's check-in status — 1,000 of 2,000 policies…") === 0.5 && st().lineFrac("Reading the legacy templates…") === null && st().lineFrac("") === null);

  // hold the member read so the strip can be seen mid-read
  let release; const gate = new Promise((r) => { release = r; });
  const memberRead = w.MdeMembers.readInput;
  w.MdeMembers.readInput = async (cfg, waves, onStatus, ...rest) => { onStatus("Reading the wave members — 12 of 43 (Euro)…"); await gate; return memberRead(cfg, waves, onStatus, ...rest); };
  $("toolMdeRollout").click();
  await until(() => st().project.sources.members && st().project.sources.members.state === "reading" && strip(), 20000, "members reading");
  await sleep(30);
  const S = strip();
  ok("while reading: the strip under the data line, policies ticked with what it found, members lit with its live line and its own bar, the three others queued with what they will ask", !!S && !/done/.test(S.className) && /Reading the tenant — Country members/.test(S.textContent) && S.querySelector(".t28-step.done .n").textContent.includes("Policies & wave groups") && /\d+ new · \d+ old · \d+ waves/.test(S.querySelector(".t28-step.done .d").textContent) && S.querySelector('.t28-step.now [data-prjline="members"]').textContent === "Reading the wave members — 12 of 43 (Euro)…" && S.querySelectorAll(".t28-step:not(.done):not(.now)").length === 3 && /policies to ask/.test(S.textContent) && /pairs? to ask Intune about/.test(S.textContent));
  ok("…the step's bar and the overall bar follow the live line (12 of 43 of step 2 of 5)", S.querySelector('[data-prjbar="members"]').style.width === "28%" && S.querySelector("[data-prjall]").style.width === `${Math.round(((1 + 12 / 43) / 5) * 100)}%`);
  ok("…the Refresh button says where the read is", $("mvRun").textContent === "⟳ Reading… 1 of 5" && $("mvRun").disabled);
  ok("…the rail dots: Overview and Waves wait for members, Policies for conflicts, Exceptions for exclusions, Journal is green already", dots().join() === "overview:wait/members,wavehome:wait/members,new:wait/conflicts,exceptionhome:wait/exclusions,journal:ok/");
  // a new live line moves the strip without a render
  const before = $("mvBody").innerHTML.length;
  st().projectLine("members", "Reading the wave members — 40 of 43 (Americas)…");
  ok("a live line moves the lit step's text and bars in place — no render", strip() === S && S.querySelector('[data-prjline="members"]').textContent === "Reading the wave members — 40 of 43 (Americas)…" && S.querySelector('[data-prjbar="members"]').style.width === "93%" && S.querySelector("[data-prjall]").style.width === `${Math.round(((1 + 40 / 43) / 5) * 100)}%`);
  ok("…a line for a source that is not reading is ignored", (st().projectLine("landing", "x"), !S.querySelector('[data-prjline="landing"]')));
  ok("…the elapsed time ticks while a read runs", !!st().project.ticker && /\d:\d\d so far/.test(S.textContent));
  release(); await idle(); await sleep(30);
  const F = strip();
  ok("finished: the strip folds to one row of ticks with times and the total time, every rail dot green, the button back to Refresh", !!F && /done/.test(F.className) && F.querySelectorAll(".t28-ticks span.ok").length === 5 && /Policies & wave groups \d/.test(F.textContent) && /^\d+:\d\d$/.test(F.querySelector("small").textContent) && dots().join() === "overview:ok/,wavehome:ok/,new:ok/,exceptionhome:ok/,journal:ok/" && $("mvRun").textContent === "↻ Refresh project" && !st().project.ticker);
  ok("…each source kept when it started and how long it took", ["policies", "members", "exclusions", "landing", "devices"].every((k) => { const s = st().project.sources[k]; return s && s.startedAt && s.at >= s.startedAt; }));

  // a partial source: the check-in status refused in every form
  w.MdeMembers.readInput = memberRead;
  const post = w.Graph.post;
  w.Graph.post = async (url, ...a) => { if (/cachedReportConfigurations$|NonComplianceReport$/.test(url) && !/Summary/.test(url)) { const e = new Error("An error has occurred."); e.kind = "graph"; e.status = 400; throw e; } return post(url, ...a); };
  $("mvRun").click(); await until(() => !st().project.sources.landing || st().project.sources.landing.state === "reading" || st().project.starting, 5000, "refresh started");
  ok("a Refresh starts the strip again from step one", !!strip() && !/done/.test(strip().className));
  await idle(); await sleep(30);
  const P = strip();
  ok("a partial source folds with its answer, in the warning colour, and the areas that depend on it carry an amber dot saying so (the device action refused too, so Policies as well)", !!P && /done/.test(P.className) && P.querySelector(".t28-ticks span.part") && /Check-in status .* — Partial: Check-in status unreadable for .*400 An error has occurred/.test(P.querySelector(".t28-ticks span.part").textContent) && dots().join() === "overview:bad/partial,wavehome:bad/partial,new:bad/partial,exceptionhome:ok/,journal:ok/");
  w.Graph.post = post;
  // the strip and the dots are not drawn for a screen handed a read without the project (the older suites' _setForTest)
  tool._setForTest(w.PolicyCache.get());
  w.close();
  console.log(`T28 reading strip: ${passed} passed, ${failed} failed`); process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exit(1); });

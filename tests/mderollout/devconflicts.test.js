// T28 — ⚔️ Conflicts with old: the 🖥 On devices column (build 10687,
// Mihai picked option A off the mockup). T12's device read, limited to the
// new and old policies: a pair's count is the devices Intune reports in
// Conflict on BOTH of its policies; "was N → 0 cleared" after a fix; the
// 📑 conflict check carries the column, a device list and a CSV column.
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
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,MdeRollout,MdeReports,ConflictDevices,TUNO_DEMO_GRAPH,TOOL_VERSIONS});";
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
  const M = w.MdeRollout;

  // ------------------------------------------------------------ engine --
  const pr = (id, n, o, type) => ({ id, N: { id: n, name: "N" + n }, O: { id: o, name: "O" + o }, type });
  const idx = M.deviceIndex({ deviceRows: [
    { policyId: "A", deviceId: "d1", deviceName: "PC1", upn: "u1", when: "2026-10-01T10:00:00Z" },
    { policyId: "b", deviceId: "d1", deviceName: "PC1", upn: "u1", when: "2026-10-02T10:00:00Z" },
    { policyId: "a", deviceId: "d2", deviceName: "PC2" },
    { policyId: "c", deviceId: "d2", deviceName: "PC2" },
  ], policyErrors: [{ id: "x" }], statusUnreadable: [{ id: "y" }] });
  ok("the index: devices per policy (ids in any case), the newest report kept", idx.byPolicy.get("a").size === 2 && idx.devices.get("d1").when === "2026-10-02T10:00:00Z");
  const C = M.deviceCounts([pr("p1", "a", "b", "conflict"), pr("p2", "a", "c", "review"), pr("p3", "a", "b", "duplicate"), pr("p4", "a", "x", "conflict"), pr("p5", "y", "b", "conflict"), pr("p6", "c", "b", "conflict")], idx);
  ok("a pair counts the devices in conflict on BOTH policies, exactly for a different value", C.get("p1").n === 1 && C.get("p1").ids[0] === "d1" && C.get("p1").exact);
  ok("an other-format pair counts too, but as a hint", C.get("p2").n === 1 && !C.get("p2").exact);
  ok("a same-value pair is not counted", !C.has("p3"));
  ok("a policy whose report failed makes the pair UNKNOWN, never 0", /could not be read/.test(C.get("p4").unknown));
  ok("…and so does a report with no status in words", /no status in words/.test(C.get("p5").unknown));
  ok("no device on both: 0", C.get("p6").n === 0);
  ok("no read: no counts", M.deviceCounts([pr("p1", "a", "b", "conflict")], null).size === 0);
  const csvRows = M.csv([Object.assign(pr("p1", "a", "b", "conflict"), { O: { id: "b", name: "Ob", generation: "old" }, diffs: [{ name: "S", newDisplay: "1", oldDisplay: "0" }], sames: [], reach: { verdict: "can", why: "" } })], C).split("\r\n");
  ok("the collisions CSV gains a devices column, last, only when devices were read", /Devices in conflict on both$/.test(csvRows[0]) && /,1$/.test(csvRows[1]) && !/Devices in conflict/.test(M.csv([]).split("\r\n")[0]));

  // ------------------------------------------------------------ screen --
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("T28's note names build 10687", /build 10687/.test(w.TOOL_VERSIONS.toolMdeRollout.note));
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  $("mvBody").querySelector('[data-mrread="attach"]').click();
  await until(() => $("mvBody").querySelector(".ep-rail"), 30000, "rail");
  const st = () => w.MdeRolloutV2Tool._state();
  await until(() => !st().running && !st().busy && !st().enriching, 30000, "idle");
  w.MdeRolloutV2Tool._pane("conflicts");
  const av = () => st().pairs.find((p) => /AV Configuration - v3.3/.test(p.N.name) && /ENDSEC-WIN-AV-PRD/.test(p.O.name));
  ok("the demo's antivirus pair is a different-value collision", !!av() && av().type === "conflict");
  ok("before a read: the column says 'not read', no 🖥 chip, the button offered", /🖥 On devices/.test($("mvBody").textContent) && /not read/.test($("mvBody").textContent) && !D.querySelector('[data-mrstatus="ondev"]') && !!D.querySelector("[data-mrdvread]"));
  D.querySelector("[data-mrdvread]").click();
  ok("🖥 Read device reports reads", await until(() => st().dv.idx && !st().dv.busy, 20000, "device read"));
  const c1 = st().devCounts().get(av().id);
  ok("the antivirus pair: 2 devices in conflict on both (WS-ENG-0308 is on the new one only)", c1 && c1.n === 2 && c1.exact);
  const row = () => [...$("mvBody").querySelectorAll("tr")].find((tr) => tr.querySelector(`[data-mrfold="dv|${av().id}"]`));
  ok("the row shows '2 devices' with a fold", !!row() && /2 devices/.test(row().textContent));
  // two collisions: the AV pair, and the same new policy against "WIN —
  // Legacy exception set" (real-time protection 1 vs 0), which T12's demo
  // also reports in conflict on those two devices
  ok("the 🖥 On devices chip appears, counting the collisions on devices", /🖥 On devices \(2\)/.test(D.querySelector('[data-mrstatus="ondev"]').textContent));
  ok("the status line says when and what a count is", /device reports read at/.test($("mvDevStatus").textContent) && /on both policies/.test($("mvDevStatus").textContent));
  row().querySelector(`[data-mrfold="dv|${av().id}"]`).click();
  const body = () => $("mvBody").textContent;
  ok("▾ show lists the two devices with their users", /WS-FIN-0142/.test(body()) && /WS-ENG-0221/.test(body()) && /eva@contoso\.com/.test(body()) && !/WS-ENG-0308/.test(body()));
  D.querySelector('[data-mrstatus="ondev"]').click();
  ok("the chip narrows the table to the collisions on devices", [...$("mvBody").querySelectorAll("[data-mrfold^='dv|']")].length === 2);
  D.querySelector('[data-mrstatus="act"]').click();

  // a fix lands: the old policy no longer reports those devices
  w.TUNO_DEMO_GRAPH.T.CONFLICT_REPORT[av().O.id].devices = [];
  D.querySelector("[data-mrdvread]").click();
  await until(() => st().dv.prev && !st().dv.busy, 20000, "second read");
  ok("after a fix: '0 — cleared', 'was 2'", st().devCounts().get(av().id).n === 0 && /0 — cleared/.test(body()) && /was 2/.test(body()));
  ok("…and the chip counts only the collision still on devices", /🖥 On devices \(1\)/.test(D.querySelector('[data-mrstatus="ondev"]').textContent));

  // the 📑 conflict check reads the devices too
  w.TUNO_DEMO_GRAPH.T.CONFLICT_REPORT[av().O.id].devices = [[av().O.id === "x" ? "" : "33333333-0000-4000-8000-000000000001", "Conflict"]];
  D.querySelector('[data-mrpane="reports"]').click();
  D.querySelector('[data-mrreport="conflicts"]').click();
  $("mvRep_conflicts").click();
  ok("the conflict check finishes", await until(() => st().reps.conflicts && !st().reps.busy, 30000, "conflict check"));
  const html = st().reps.conflicts.html;
  ok("its report has the 🖥 On devices column and the device list", /<th[^>]*>🖥 On devices<\/th>/.test(html) && /Devices in conflict on both policies/.test(html) && /WS-FIN-0142/.test(html));
  ok("…a tile counting device conflicts", /device conflicts on both/.test(html));
  ok("…and the CSV its devices column", /Devices in conflict on both/.test(st().reps.conflicts.csv.split("\r\n")[0]));

  console.log(`T28 on devices: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  w.close();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

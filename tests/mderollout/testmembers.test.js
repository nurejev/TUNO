// T28 — 🧪 Test members per wave (build 10688, Mihai: "need a option per
// wave to add testusers and devices based on a import csv file"; option A —
// a test group per wave nested in it, one file per wave). The engine
// (js/mdetest.js) and the screen in demo mode: CSV with both columns, the
// lookup, the flags, the plan (create → add → nest), apply through 👥's
// gates, the read-back, a removal, and the undo.
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
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,MdeTest,TUNO_DEMO_GRAPH,TOOL_VERSIONS});";
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
  const { w, files } = boot();
  const T = w.MdeTest;
  ok("the page loads js/mdetest.js after js/mderevert.js", files.includes("js/mdetest.js") && files.indexOf("js/mdetest.js") > files.indexOf("js/mderevert.js"));

  // ------------------------------------------------------------ engine --
  const p1 = T.parse("UserPrincipalName;DeviceName\r\njan@x.nl;\r\nanna@x.nl;NLD5CD1\r\n;GBR5CD2\r\njan@x.nl;");
  ok("a CSV with BOTH a UPN and a device column gives both, deduplicated", p1.lines.join() === "jan@x.nl,anna@x.nl,NLD5CD1,GBR5CD2" && /UserPrincipalName \+ DeviceName/.test(p1.column));
  ok("one column, or plain lines: ⊘'s reader", T.parse("DeviceName\nPC1\nPC2").lines.join() === "PC1,PC2" && T.parse("a@b.c\nPC9").lines.join() === "a@b.c,PC9");
  const waveRows = [
    { role: "wave", region: "Euro", audience: "user", name: "INT-SG-U-WAVE-Euro", id: "wu", exists: true },
    { role: "wave", region: "Euro", audience: "device", name: "INT-SG-D-WAVE-Euro", id: "wd", exists: true },
    { role: "wave", region: "Asia", audience: "user", name: "INT-SG-U-WAVE-Asia", id: null, exists: false },
    { role: "exclusion", region: null, audience: "device", name: "INT-SG-D-MDE-Exclusion", id: "x", exists: true },
  ];
  const N = T.names(waveRows, "Euro");
  ok("the test groups are the wave's name plus -Test", N.user.name === "INT-SG-U-WAVE-Euro-Test" && N.device.name === "INT-SG-D-WAVE-Euro-Test");
  ok("regions: the waves only", T.regions(waveRows).join() === "Euro,Asia");
  const cfg = { revertUser: "INT-SG-U-MDE-Revert", revertDevice: "INT-SG-D-MDE-Revert" };
  const dev = (key, objId, name, o) => Object.assign({ key, objId, name, stale: false, direct: [] }, o || {});
  const items = [
    { line: "jan@x.nl", card: { pick: { type: "user" }, user: { id: "U1", displayName: "Jan", upn: "jan@x.nl", direct: [{ id: "g", name: "PVM-UG-CORP-MEM-USERS-US" }] }, devices: [dev("m1", "o1", "NLD5CD1"), dev("m2", "o2", "NLD5CD9", { stale: true }), dev("m3", "o3", "PVM-LT-VDI-0021")] } },
    { line: "rev@x.nl", card: { pick: { type: "user" }, user: { id: "U2", displayName: "Rev", upn: "rev@x.nl", direct: [{ id: "r", name: "INT-SG-U-MDE-Revert" }], excluded: false }, devices: [] } },
    { line: "GBR5CD2", card: { pick: { type: "device" }, user: null, devices: [dev("m4", "o4", "GBR5CD2", { searched: true, excluded: true })] } },
    { line: "nobody@x.nl", kind: "none" },
  ];
  const test0 = { user: { name: N.user.name, wave: { id: "wu", name: "INT-SG-U-WAVE-Euro", exists: true }, group: null, members: [], nested: false, dupes: 0 },
                  device: { name: N.device.name, wave: { id: "wd", name: "INT-SG-D-WAVE-Euro", exists: true }, group: null, members: [], nested: false, dupes: 0 } };
  const E = T.entries(items, test0, { cfg, region: "Euro", countryRegion: () => "Americas" });
  ok("one entry per found line", E.length === 3);
  ok("a device line brings the device alone", !E[2].user && E[2].devices.length === 1 && E[2].devices[0].listed);
  ok("a user brings their Windows devices; -vdi- and stale said", E[0].devices.length === 3 && E[0].devices[2].avd && E[0].devices[1].stale);
  ok("a Revert member and an Exclusion member are flagged", E[1].user.revert && E[2].devices[0].excluded);
  ok("a country in another wave is said, not refused", /Americas wave — added ahead of it/.test(E[0].note));
  const ticks = T.defaultTicks(E);
  ok("default ticks: the user and their fresh device; not -vdi-, not stale, not Revert; the excluded device yes",
    ticks.has("u:u1") && ticks.has("d:o1") && !ticks.has("d:o2") && !ticks.has("d:o3") && !ticks.has("u:u2") && ticks.has("d:o4"));
  ok("-vdi- cannot be ticked at all", !T.tickable.device(E[0].devices[2]) && T.tickable.device(E[0].devices[0]));
  const P = T.plan(test0, E, ticks, new Set(), "Euro");
  const types = P.ops.map((o) => `${o.type}${o.memberKind ? ":" + o.memberKind : o.kind ? ":" + o.kind : ""}`).join(",");
  ok("no test group yet: create → add → nest, user side then device side", types === "create,add:user,nest:user,create,add:device,nest:device", types);
  ok("…the nest puts the test group in its own wave, by reference", P.ops[2].parent.id === "wu" && P.ops[2].child.ref === "INT-SG-U-WAVE-Euro-Test");
  ok("…devices added: the fresh one and the line's device", P.ops[4].ids.join() === "o1,o4");
  ok("…the excluded device is warned about", P.warnings.some((x) => /⊘ exclusion group/.test(x)) && !P.hasRemoval && P.runKind === "testmembers");
  ok("…titled with what it adds", /Euro: \+1 user · \+2 devices/.test(P.title));
  const test1 = JSON.parse(JSON.stringify(test0));
  test1.user.group = { id: "tu", name: N.user.name }; test1.user.nested = true; test1.user.members = [{ id: "u9", name: "Old Tester", upn: "old@x.nl" }];
  test1.device.group = { id: "td", name: N.device.name }; test1.device.nested = false;
  const P2 = T.plan(test1, [], new Set(), new Set(["u9"]), "Euro");
  ok("existing groups: a ticked-out member is a removal; a group not nested is nested", P2.ops.map((o) => o.type).join() === "remove,nest" && P2.hasRemoval && P2.ops[0].ids.join() === "u9" && P2.ops[1].parent.id === "wd");
  const test2 = JSON.parse(JSON.stringify(test0)); test2.user.wave.exists = false;
  ok("a wave that does not exist yet: nothing written on that side, said", /does not exist yet/.test(T.plan(test2, E, ticks, new Set(), "Euro").skipped.join()));

  // ------------------------------------------------------------ screen --
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("T28's note names build 10688", /build 10688/.test(w.TOOL_VERSIONS.toolMdeRollout.note));
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  await until(() => { const s = w.MdeRolloutV2Tool._state(); return s.model && s.project.attempted.size === 4 && !s.project.starting && !s.project.task && !s.project.timer && !s.running && !s.enriching; }, 30000, "automatic project reads");
  await until(() => $("mvBody").querySelector(".ep-rail"), 30000, "rail");
  const st = () => w.MdeRolloutV2Tool._state();
  await until(() => !st().running && !st().busy && !st().enriching && !st().project.starting && !st().project.task && !st().project.timer && !st().reps.busy, 30000, "idle");
  w.MdeRolloutV2Tool._pane("waves");
  ok("🌊 has a 🧪 Test members column and a button per region", /🧪 Test members/.test($("mvBody").textContent) && !!D.querySelector('[data-mrtest="Euro"]'));
  D.querySelector('[data-mrtest="Euro"]').click();
  ok("the panel opens and reads Euro's test groups", await until(() => st().tm.test.get("Euro") && !st().tm.loading, 15000, "test read") && !!$("mvTmPanel"));
  ok("…none yet: said, with what the first apply does", /not created yet — the first apply creates it/.test($("mvTmPanel").textContent));
  const ta = $("mvTmText");
  ta.value = "UserPrincipalName,DeviceName\neva@contoso.com,\nmilan@contoso.com,\n,WS-HR-0031\nnobody@contoso.com,";
  ta.dispatchEvent(new w.Event("input", { bubbles: true }));
  ok("typing counts the lines on the button", /Look up · 4 lines/.test($("mvTmLookup").textContent));
  $("mvTmLookup").click();
  ok("the lookup lands", await until(() => st().tm.list.length && !st().tm.busy, 20000, "lookup"));
  const panel = () => $("mvTmPanel").textContent;
  ok("users with their devices, the device line, and the miss", /Eva Employee/.test(panel()) && /WS-FIN-0142/.test(panel()) && /WS-HR-0031/.test(panel()) && /1 line not found/.test(panel()), panel().slice(0, 600));
  ok("default ticks set", st().tm.ticks.size >= 3);
  $("mvTmDry").click();
  ok("② Dry run makes a test-members plan", await until(() => st().plan && st().plan.runKind === "testmembers", 5000, "plan") && /create group/.test($("mvPlan").textContent) && /nest/.test($("mvPlan").textContent));
  ok("…with the impact said", /no 👥 \/ 🔄 sync adds to it/.test($("mvPlan").textContent));
  const n = st().runs.length;
  const k = $("mvConfirmTick"); if (k) { k.checked = true; k.dispatchEvent(new w.Event("change", { bubbles: true })); }
  const r = $("mvRiskReason"), a = $("mvRiskAccept");
  if (r && a) { r.value = "Accepted by the headless suite for this demo plan."; r.dispatchEvent(new w.Event("input", { bubbles: true })); a.checked = true; a.dispatchEvent(new w.Event("change", { bubbles: true })); }
  const b = $("mvMemberBackup"); if (b) { b.click(); await until(() => /downloaded|failed/.test($("mvMemberBackup").textContent), 10000, "backup"); }
  ok("④ Apply unlocks", await until(() => $("mvMemApply") && !$("mvMemApply").disabled, 10000, "apply"));
  $("mvMemApply").click();
  ok("the run lands in 📜", await until(() => st().runs.length === n + 1, 15000, "run"));
  const run1 = st().runs[n];
  ok("…every step written and verified", run1.bad === 0 && run1.ok >= 6 && run1.runKind === "testmembers" && run1.region === "Euro", JSON.stringify(run1.lines));
  ok("the test groups are read again: members in, nested", await until(() => { const t = st().tm.test.get("Euro"); return t && t.user.group && t.user.nested && t.device.nested && t.user.members.length >= 2 && !st().tm.loading; }, 15000, "reread"));
  ok("the added lines leave the list", st().tm.list.length === 0);
  ok("🌊's column counts them — the device line added its device, not its user", /2 users in INT-SG-U-WAVE-Euro-Test/.test($("mvBody").textContent.replace(/\s+/g, " ")) && /3 devices in INT-SG-D-WAVE-Euro-Test/.test($("mvBody").textContent.replace(/\s+/g, " ")));

  // take one out again
  const milan = st().tm.test.get("Euro").user.members.find((m) => /Milan/.test(m.name));
  const rem = D.querySelector(`[data-mrtmrem="${milan.id}"]`);
  rem.checked = false; rem.dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mvTmDry").click();
  ok("unticking a member plans its removal behind REMOVE", await until(() => st().plan && st().plan.hasRemoval, 5000, "removal plan") && !!$("mvConfirmText"));

  console.log(`T28 test members: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  w.close();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

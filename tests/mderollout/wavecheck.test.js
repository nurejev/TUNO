// T28 — 🔎 Is this user in a wave? (build 10700, option B off the mockup).
// Mihai: "i also need a quick search verification if user is in the wave …
// these users can't use powershell. so in t28 … in the memberships and
// pilots section a search or something". The engine (js/mdewavecheck.js):
// the routes into a wave (direct, static, pilot, test, dynamic, nested
// deeper), the holds, the verdict (in / out / mixed / held yet in). The
// screen in demo mode: the box above 👥's table, an exact UPN picks itself,
// the card with the verdict and the rows, ⊘ opens with the person picked,
// a partial name lists the hits, the box emptied clears the card.
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
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,MdeWaveCheck,TUNO_DEMO_GRAPH,TOOL_VERSIONS});";
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
  const WC = w.MdeWaveCheck;
  ok("the page loads js/mdewavecheck.js after js/mdetest.js", files.indexOf("js/mdewavecheck.js") > files.indexOf("js/mdetest.js"));

  // ------------------------------------------------------------ engine --
  const G = (n) => `g${n}`;
  const waves = [
    { role: "wave", audience: "user", region: "Euro", name: "INT-SG-U-WAVE-Euro", id: G(20) },
    { role: "wave", audience: "device", region: "Euro", name: "INT-SG-D-WAVE-Euro", id: G(21) },
    { role: "wave", audience: "user", region: "Americas", name: "INT-SG-U-WAVE-Americas", id: G(22) },
    { role: "exclusion", audience: "user", name: "INT-SG-U-MDE-Exclusion", id: G(90) },
  ];
  const ctx = {
    waves, children: new Map([[G(20), new Set([G(41), G(42), G(43), G(44)])], [G(21), new Set([G(35)])], [G(22), new Set([G(50)])]]),
    dynamicIds: new Set([G(42)]), pilotIds: new Set([G(44), G(36)]), testSuffix: "-Test", names: new Map(),
    revertUsers: new Map([["u9", { id: "u9" }]]), revertDevices: new Map(), revertUserId: G(80), revertDeviceId: G(81), exUserId: G(90), exDeviceId: G(91),
    reasons: { u9: { reason: "laptop issues", at: "2026-10-06T09:00:00Z" } },
    model: { newP: [{ item: { assignments: [{ kind: "Included", groupId: G(20) }, { kind: "Excluded", groupId: G(90) }] } }, { item: { assignments: [{ kind: "Included", groupId: G(21) }] } }],
             oldP: [{ item: { assignments: [{ kind: "All users", groupId: null }, { kind: "Excluded", groupId: G(20) }] } }] },
  };
  const card = (user, devices) => ({ user, devices, names: new Map(), failed: [], readAt: 1 });
  const dev = (o) => Object.assign({ key: "m:x", objId: "d1", name: "LT-1", managed: true, stale: false, lastSync: null }, o);
  // Jan: in Euro through the static NL group AND a direct member; his laptop through INT-SG-D-NLD
  let M = WC.model(card({ id: "u1", displayName: "Jan", upn: "jan@x", groups: new Set([G(20), G(41), G(90) + "x"]), direct: [{ id: G(41), name: "INT-SG-U-NLD" }, { id: G(20), name: "INT-SG-U-WAVE-Euro" }, { id: "gx", name: "Other" }] },
    [dev({ groups: new Set([G(21), G(35)]), direct: [{ id: G(35), name: "INT-SG-D-NLD" }] })]), ctx);
  ok("in: the user through the static group and directly, the device through its country group", M.verdict.kind === "in" && /In the Euro waves/.test(M.verdict.text)
    && M.rows[0].waves[0].through.map((t) => `${t.kind}:${t.name}`).join() === "direct:INT-SG-U-WAVE-Euro,static:INT-SG-U-NLD" && M.rows[1].waves[0].through[0].kind === "static", JSON.stringify(M.rows.map((r) => r.waves)));
  ok("…a group that is not a child of the wave is not a route", !M.rows[0].waves[0].through.some((t) => t.name === "Other"));
  ok("…the verdict says the new policies reach them (the wave is assigned)", /the user and 1 device · the new MDE policies reach them/.test(M.verdict.sub) && M.rows[0].reach.new === 1 && M.rows[0].reach.keptOutOld === 1, M.verdict.sub);
  // Eva: through the dynamic source (not swapped); Omar: through a pilot and a test group
  M = WC.model(card({ id: "u2", displayName: "Eva", upn: "eva@x", groups: new Set([G(20), G(42)]), direct: [{ id: G(42), name: "PVM-UG-CORP-MEM-USERS-NL" }] }, []), ctx);
  ok("dynamic: the source nested in the wave is named as such", M.rows[0].waves[0].through[0].kind === "dynamic" && M.verdict.kind === "in" && /the user · /.test(M.verdict.sub));
  M = WC.model(card({ id: "u3", displayName: "Omar", upn: "o@x", groups: new Set([G(20), G(44), G(43)]), direct: [{ id: G(44), name: "INT-SG-U-NLD-BREDA" }, { id: G(43), name: "INT-SG-U-WAVE-Euro-Test" }] }, []), ctx);
  ok("pilot and test groups are named by kind", M.rows[0].waves[0].through.map((t) => t.kind).sort().join() === "pilot,test");
  // Pat: in the wave, but through none of his direct groups
  M = WC.model(card({ id: "u4", displayName: "Pat", upn: "p@x", groups: new Set([G(22)]), direct: [{ id: "gz", name: "Something" }] }, []), ctx);
  ok("nested deeper: in the wave through no direct group", M.rows[0].waves[0].through[0].kind === "deeper");
  // the wave's children unknown (👥 not read): a direct group is a candidate, marked
  M = WC.model(card({ id: "u1", displayName: "Jan", upn: "jan@x", groups: new Set([G(20), G(41)]), direct: [{ id: G(41), name: "INT-SG-U-NLD" }] }, []), Object.assign({}, ctx, { children: null }));
  ok("without the 👥 read a direct group is only a candidate route (maybe)", M.rows[0].waves[0].through[0].maybe === true && M.rows[0].waves[0].through[0].kind === "static");
  // mixed: the device in, the user not
  M = WC.model(card({ id: "u5", displayName: "Kim", upn: "k@x", groups: new Set(["gq"]), direct: [] }, [dev({ name: "LT-5", groups: new Set([G(21), G(35)]), direct: [{ id: G(35), name: "INT-SG-D-NLD" }] })]), ctx);
  ok("mixed: the device in the wave, the user not — the mix named", M.verdict.kind === "mixed" && /LT-5 in the Euro wave, Kim not/.test(M.verdict.text) && /new - D - policies on the device, the old - U - policies on the user/.test(M.verdict.sub), M.verdict.text);
  // out, with Revert and its reason; a stale device is shown, not judged
  M = WC.model(card({ id: "u9", displayName: "Rev", upn: "r@x", groups: new Set([G(80)]), direct: [] }, [dev({ name: "OLD-1", stale: true, groups: new Set([G(21), G(35)]), direct: [{ id: G(35), name: "INT-SG-D-NLD" }] })]), ctx);
  ok("out: held in Revert with the reason; the stale device in a wave does not change the verdict", M.verdict.kind === "out" && /⏸ held back/.test(M.verdict.sub) && M.rows[0].held.reverted && M.rows[0].held.reason.reason === "laptop issues" && M.rows[1].stale && M.rows[1].waves.length === 1, M.verdict.text);
  // held yet in: excluded and still in the wave
  M = WC.model(card({ id: "u6", displayName: "Hans", upn: "h@x", groups: new Set([G(20), G(41), G(90)]), direct: [{ id: G(41), name: "INT-SG-U-NLD" }] }, []), ctx);
  ok("held yet in a wave: ⊘ excluded and still in it — mixed, said", M.verdict.kind === "mixed" && /Hans is held, yet still in a wave/.test(M.verdict.text) && /⊘ excluded means/.test(M.verdict.sub) && M.rows[0].held.excluded && M.rows[0].reach.keptOutNew === 1);
  // in a wave that no new policy includes yet
  M = WC.model(card({ id: "u7", displayName: "Ann", upn: "a@x", groups: new Set([G(22), G(50)]), direct: [{ id: G(50), name: "INT-SG-U-USA" }] }, []), ctx);
  ok("in a wave no new policy includes: said, with ⚡ ①", M.verdict.kind === "in" && /no new policy includes the wave yet \(⚡ Rollout actions ①\)/.test(M.verdict.sub));
  // unread groups
  M = WC.model(card({ id: "u8", displayName: "Noa", upn: "n@x", groups: null, direct: null }, []), ctx);
  ok("groups not read: nothing judged", M.verdict.kind === "unread" && M.rows[0].unread);
  // autoPick
  const hits = [{ type: "user", displayName: "Jan de Vries", upn: "jan@x.nl", mail: "" }, { type: "device", name: "LT-1" }];
  ok("an exact UPN or device name picks itself; one hit picks itself; a partial name does not", WC.autoPick(hits, "JAN@x.nl") === hits[0] && WC.autoPick(hits, "lt-1") === hits[1] && WC.autoPick(hits, "jan") === null && WC.autoPick([hits[1]], "lt") === hits[1]);

  // ------------------------------------------------------------ screen --
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("T28's note names build 10700", /build 10700/.test(w.TOOL_VERSIONS.toolMdeRollout.note));
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  const st = () => w.MdeRolloutV2Tool._state();
  await until(() => { const s = st(); return s.model && s.project.attempted.size === 5 && !s.project.starting && !s.project.task && !s.project.timer && !s.running && !s.enriching && s.mem.model && s.ex.base && s.cs.extra; }, 60000, "project read");
  await until(() => !st().running && !st().busy && !st().enriching && !st().project.starting && !st().project.task && !st().project.timer && !st().reps.busy && !st().ex.scanBusy, 30000, "idle");
  w.MdeRolloutV2Tool._pane("members");
  ok("👥 has the box above the countries table, on the countries view", !!$("mvWcQ") && !!$("mvWcGo") && !!D.querySelector(".mr-memtable") && $("mvBody").querySelector(".mr-wc").compareDocumentPosition(D.querySelector(".mr-memtable")) & 4);
  $("mvWcQ").value = "eva@contoso.com"; $("mvWcQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  $("mvWcQ").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok("Enter checks: an exact UPN picks itself, the card comes with the verdict", await until(() => st().wc.model && !st().wc.busy, 20000, "eva check") && !!$("mvWcCard") && !st().wc.results
    && /In the Euro waves/.test($("mvWcCard").textContent) && st().wc.model.verdict.kind === "in", st().wc.error);
  const rows = st().wc.model.rows;
  ok("Eva: in INT-SG-U-WAVE-Euro through the dynamic NL source; her laptop in INT-SG-D-WAVE-Euro through INT-SG-D-NLD (static)", rows.length === 2 && rows[0].waves[0].name === "INT-SG-U-WAVE-Euro" && rows[0].waves[0].through[0].name === "PVM-UG-CORP-MEM-USERS-NL" && rows[0].waves[0].through[0].kind === "dynamic"
    && rows[1].name === "WS-FIN-0142" && rows[1].waves[0].through[0].name === "INT-SG-D-NLD" && rows[1].waves[0].through[0].kind === "static", JSON.stringify(rows.map((r) => r.waves)));
  ok("…the card shows the chips, the reach and the buttons", /dynamic/.test($("mvWcCard").textContent) && /static/.test($("mvWcCard").textContent) && /13 old/.test($("mvWcCard").textContent)
    && !!D.querySelector('[data-mrwcgo="exclusions"]') && !!D.querySelector('[data-mrwcgo="revert"]') && !!D.querySelector("[data-mrwcopen]") && /open Netherlands ↓/.test($("mvWcCard").textContent), $("mvWcCard").textContent.slice(0, 300));
  ok("…the countries table is still under it", !!D.querySelector(".mr-memtable") && !!$("mvMemSum"));
  D.querySelector("[data-mrwcopen]").click();
  ok("open <country> opens that row in 👥", st().mem.open.has(D.querySelector("[data-mrwcopen]").dataset.mrwcopen) && st().mem.region === "Euro");
  // a partial name: the hits
  $("mvWcQ").value = "WS-FIN"; $("mvWcQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  $("mvWcGo").click();
  ok("a partial name lists the hits to pick from, the previous card gone", await until(() => st().wc.results && !st().wc.busy, 20000, "hits") && st().wc.results.length === 2 && !$("mvWcCard") && D.querySelectorAll("[data-mrwcpick]").length === 2 && /Pick one/.test($("mvBody").textContent));
  D.querySelector("[data-mrwcpick]").click();
  ok("a hit picked: the device's card, with its primary user", await until(() => st().wc.model && !st().wc.busy, 20000, "pick") && st().wc.pick.type === "device" && st().wc.model.rows.some((r) => r.kind === "user") && !st().wc.results);
  // Nina: excluded, in no wave
  $("mvWcQ").value = "nina"; $("mvWcQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  $("mvWcGo").click();
  ok("Nina: one hit picks itself — not in a wave, ⊘ excluded", await until(() => st().wc.model && !st().wc.busy && st().wc.model.rows[0].name === "Nina Nieuw", 20000, "nina") && st().wc.model.verdict.kind === "out" && /⊘ excluded and in no wave/.test(st().wc.model.verdict.sub) && /⊘ excluded/.test($("mvWcCard").textContent));
  // ⊘ opens with the person picked
  D.querySelector('[data-mrwcgo="exclusions"]').click();
  ok("⊘ Exclude → opens the ⊘ pane with Nina's card", await until(() => st().pane === "exclusions" && st().ex.card && !st().ex.cardLoading, 20000, "ex card") && st().ex.card.user.displayName === "Nina Nieuw" && !!$("mvExCard"));
  w.MdeRolloutV2Tool._pane("members");
  ok("back in 👥 the check is still there", !!$("mvWcCard") && /Nina Nieuw/.test($("mvWcCard").textContent));
  $("mvWcQ").value = ""; $("mvWcQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  ok("the box emptied clears the card; the table stays", !$("mvWcCard") && !st().wc.model && !!D.querySelector(".mr-memtable"));
  // every 👥 view carries the box
  w.MdeRolloutV2Tool._state().mem.left = true; w.MdeRolloutV2Tool._pane("members");
  ok("🕳 Left out has the box too", !!$("mvWcQ"));
  st().mem.left = false;
  ok("the help names it", /Is this user in a wave\?/.test($("mvBody").textContent) || (w.MdeRolloutV2Tool._pane("how"), /Is this user in a wave/.test($("mvBody").textContent)));
}

run().then(() => {
  console.log(`T28 wave check: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

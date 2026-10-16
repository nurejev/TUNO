// T28 — ⚡ ⓪ Create the project's groups (build 10701). Mihai: "create also
// a option bulk create all the revert groups" — every group T28 otherwise
// creates on first use, in one plan: the ↩ Revert pair, 📌 Pinned, ⊝ Skip
// and the 🧪 test groups of the ticked regions, nested in their wave.
// The planner (MdeMembers.planHoldGroups) DOM-free, then the row in the
// demo: its count, the dry run, the apply, the row saying "in place".
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
  // 10716: a browser database for the run bundles
  const fidb = require("fake-indexeddb"); w.indexedDB = fidb.indexedDB; w.IDBKeyRange = fidb.IDBKeyRange;
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,MdeMembers,MdeTest,TUNO_DEMO_GRAPH,TOOL_VERSIONS,T28State,T28Runs,TunoTenant});";
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
  const MM = w.MdeMembers;
  const cfg = MM.normConfig(null);

  // ----------------------------------------------------------- planner --
  const side = (name, wave, group, nested, dupes) => ({ name, wave, group, nested: !!nested, dupes: dupes || 0, members: group ? [{ id: "u1" }] : [] });
  const euro = { user: side("INT-SG-U-WAVE-Euro-Test", { id: "wu", name: "INT-SG-U-WAVE-Euro", exists: true }, null), device: side("INT-SG-D-WAVE-Euro-Test", { id: "wd", name: "INT-SG-D-WAVE-Euro", exists: true }, { id: "tg", name: "INT-SG-D-WAVE-Euro-Test" }, false) };
  const amer = { user: side("INT-SG-U-WAVE-Americas-Test", { id: null, name: "INT-SG-U-WAVE-Americas", exists: false }, null), device: side("INT-SG-D-WAVE-Americas-Test", { id: "wda", name: "INT-SG-D-WAVE-Americas", exists: true }, { id: "tga", name: "INT-SG-D-WAVE-Americas-Test" }, true) };
  const asia = { user: side("INT-SG-U-WAVE-Asia-Test", { id: "wua", name: "INT-SG-U-WAVE-Asia", exists: true }, null, false, 2), device: side(null, null, null) };
  let p = MM.planHoldGroups(cfg, { revert: { user: null, device: { id: "rd", displayName: cfg.revertDevice } }, pinnedGroup: null, skipGroup: { id: "sk", name: cfg.skipDevice }, stateGroup: { id: "stg", name: cfg.stateGroup }, tests: new Map([["Euro", euro], ["Americas", amer], ["Asia", asia]]), regions: null });
  const names = p.ops.map((o) => `${o.type}:${o.type === "create" ? o.name : o.child.name + "→" + o.parent.name}`);
  ok("nothing in place: the user Revert group, Pinned, Euro's test pair (the device one exists — nested only)", names.join("|") === "create:INT-SG-U-MDE-HoldBack|create:INT-SG-D-MDE-Pinned|create:INT-SG-U-WAVE-Euro-Test|nest:INT-SG-U-WAVE-Euro-Test→INT-SG-U-WAVE-Euro|nest:INT-SG-D-WAVE-Euro-Test→INT-SG-D-WAVE-Euro", names.join("|"));
  ok("…what exists is said as in place, the nested Americas device test group included (the 🗂 anchor group too, 10715)", p.inPlace.join() === "INT-SG-D-MDE-HoldBack,INT-SG-D-MDE-Skip,INT-SG-TUNO-T28-State,INT-SG-D-WAVE-Americas-Test", p.inPlace.join());
  ok("…a missing wave and a duplicated name are left out with the reason", p.skipped.length === 2 && /INT-SG-U-WAVE-Americas-Test: INT-SG-U-WAVE-Americas does not exist yet — create it in 🌊 first/.test(p.skipped[0]) && /INT-SG-U-WAVE-Asia-Test: 2 groups carry this name/.test(p.skipped[1]), p.skipped.join("\n"));
  ok("…the descriptions: Revert's, Pinned's, the test group's with the wave's name; the nest after its create by ref", p.ops[0].description === cfg.revertDescription && p.ops[1].description === cfg.pinnedDescription && /test members of INT-SG-U-WAVE-Euro/.test(p.ops[2].description) && p.ops[3].child.ref === "INT-SG-U-WAVE-Euro-Test" && p.ops[4].child.id === "tg" && p.ops[4].size === 1);
  ok("…the title and counts; no REMOVE, run kind holdgroups", /create 3 · nest 2/.test(p.title) && p.counts.create === 3 && p.counts.nest === 2 && !p.hasRemoval && p.runKind === "holdgroups" && p.ops.every((o) => o.key === "holdgroups" && o.who));
  p = MM.planHoldGroups(cfg, { revert: { user: null, device: null }, pinnedGroup: null, skipGroup: null, stateGroup: null, tests: new Map([["Euro", euro], ["Americas", amer]]), regions: new Set(["Americas"]) });
  ok("the ticked regions decide which test groups: Euro unticked, nothing of it; without the anchor group it is created too (10715)", p.ops.filter((o) => /Euro/.test(o.name || o.child.name)).length === 0 && p.ops.filter((o) => o.type === "create").length === 5 && p.ops.some((o) => o.type === "create" && o.name === "INT-SG-TUNO-T28-State" && o.who === "🗂 state" && /open extension/.test(o.description)));
  p = MM.planHoldGroups(cfg, { revert: { user: { id: "ru" }, device: { id: "rd" } }, pinnedGroup: { id: "p" }, skipGroup: { id: "s" }, stateGroup: { id: "stg" }, tests: new Map([["Americas", { user: amer.user, device: amer.device }]]), regions: new Set(["Americas"]) });
  ok("everything in place: no step, said", p.ops.length === 0 && /all in place/.test(p.title) && p.inPlace.length === 6);

  // ------------------------------------------------------------ screen --
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("T28's note names build 10701", /build 10701/.test(w.TOOL_VERSIONS.toolMdeRollout.note));
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  const st = () => w.MdeRolloutV2Tool._state();
  await until(() => { const s = st(); return s.model && s.project.attempted.size === 5 && !s.project.starting && !s.project.task && !s.project.timer && !s.running && !s.enriching && s.mem.model && s.cs.extra && s.tm.all; }, 60000, "project read");
  await until(() => !st().running && !st().busy && !st().enriching && !st().project.task && !st().project.timer && !st().reps.busy && !st().ex.scanBusy, 30000, "idle");
  w.MdeRolloutV2Tool._pane("waves");
  const card = () => $("mvRollCard");
  ok("⚡ has the row ⓪ before ①, with the count", !!card() && /⓪/.test(card().textContent) && card().textContent.indexOf("Create the project's groups") < card().textContent.indexOf("Include the waves") && !!D.querySelector("[data-mrrollgroups]") && !D.querySelector("[data-mrrollgroups]").disabled
    && /groups to create/.test(card().textContent), card().textContent.slice(0, 400));
  const G = () => w.TUNO_DEMO_GRAPH.T.GROUPS;
  const has = (n) => G().some((g) => g.displayName === n);
  ok("in the demo tenant none of them exists yet", !has("INT-SG-U-MDE-HoldBack") && !has("INT-SG-D-MDE-HoldBack") && !has("INT-SG-D-MDE-Pinned") && !has("INT-SG-D-MDE-Skip") && !has("INT-SG-U-WAVE-Euro-Test") && !has("INT-SG-TUNO-T28-State"));
  // 10715: without the anchor group the project's state is in this browser, said in ⚙️
  const T28 = w.MdeRolloutV2Tool;
  ok("🗂 the project's state is in this browser only, said in ⚙️ with the way out", T28._state28().status === "browser" && !T28._state28().group && (T28._pane("rules"), /Project state — in this browser only/.test($("mvBody").textContent) && /Create INT-SG-TUNO-T28-State with ⚡ ⓪/.test($("mvBody").textContent)));
  w.MdeRolloutV2Tool._pane("waves");
  D.querySelector("[data-mrrollgroups]").click();
  ok("the dry run: four hold groups, Euro's test pair created and nested; the other regions' waves do not exist — left out", await until(() => st().plan && st().plan.holdGroups, 10000, "plan")
    && st().plan.ops.filter((o) => o.type === "create").map((o) => o.name).join() === "INT-SG-U-MDE-HoldBack,INT-SG-D-MDE-HoldBack,INT-SG-D-MDE-Pinned,INT-SG-D-MDE-Skip,INT-SG-TUNO-T28-State,INT-SG-U-WAVE-Euro-Test,INT-SG-D-WAVE-Euro-Test"
    && st().plan.ops.filter((o) => o.type === "nest").length === 2 && st().plan.skipped.some((x) => /INT-SG-U-WAVE-Americas-Test: INT-SG-U-WAVE-Americas does not exist yet/.test(x)), JSON.stringify(st().plan && st().plan.ops.map((o) => o.name || o.child.name)));
  ok("…it opens under the ⚡ card, a tick confirms (no REMOVE), the impact says empty groups", card().nextElementSibling === $("mvPlan") && !!$("mvConfirmTick") && !$("mvConfirmText") && /none on any device — empty groups/.test($("mvPlan").textContent) && /For/.test($("mvPlan").textContent));
  $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  // the V2 gates: a risk line when asked, the group backup (③) before ④
  { const r = $("mvRiskReason"), t = $("mvRiskAccept");
    if (r && t && !t.checked) { r.value = "Accepted by the headless suite for this demo plan."; r.dispatchEvent(new w.Event("input", { bubbles: true })); t.checked = true; t.dispatchEvent(new w.Event("change", { bubbles: true })); }
    const b = $("mvMemberBackup"); if (b && !b.disabled) { b.click(); } }
  await until(() => !$("mvMemApply").disabled, 10000, "apply enabled");
  const n0 = st().runs.length;
  $("mvMemApply").click();
  ok("applied: the seven groups exist in the tenant, the test pair nested in the Euro waves, the run on 📜", await until(() => st().runs.length === n0 + 1, 15000, "run") && st().runs[n0].runKind === "holdgroups" && st().runs[n0].ok === 9 && has("INT-SG-TUNO-T28-State")
    && has("INT-SG-U-MDE-HoldBack") && has("INT-SG-D-MDE-HoldBack") && has("INT-SG-D-MDE-Pinned") && has("INT-SG-D-MDE-Skip") && has("INT-SG-U-WAVE-Euro-Test") && has("INT-SG-D-WAVE-Euro-Test")
    && (G().find((g) => g.displayName === "INT-SG-U-WAVE-Euro-Test").memberOf || []).includes(G().find((g) => g.displayName === "INT-SG-U-WAVE-Euro").id), JSON.stringify(st().runs[n0] && st().runs[n0].lines));
  ok("…the Revert groups are known to ↩ and 🔄 without a re-read, Pinned and Skip to 👥", st().cs.extra.revert.user && st().cs.extra.revert.device && st().mem.input.pinnedGroup && st().mem.input.skipGroup);
  await until(() => st().tm.all && st().tm.test.get("Euro") && st().tm.test.get("Euro").user.group, 15000, "tests re-read");
  w.MdeRolloutV2Tool._pane("waves");
  ok("the row now says in place, the button off", /nothing to do — 7 groups in place|in place/.test(card().textContent) && D.querySelector("[data-mrrollgroups]").disabled, card().textContent.slice(0, 500));

  // ------------------------------------ 10715: the state in the tenant --
  const anchor = () => G().find((g) => g.displayName === "INT-SG-TUNO-T28-State");
  const extOf = () => (anchor()._ext || {})["nl.limonit.tuno.t28"];
  const stateText = () => { const m = extOf(); if (!m) return null; let t = ""; for (let i = 1; i <= (m.parts || 0); i++) t += ((anchor()._ext || {})[`nl.limonit.tuno.t28.p${i}`] || {}).data || ""; return t; };
  ok("after ⓪ the anchor group is read and this browser's state written to its open extensions — the meta names the parts, ⚙️ says in the tenant", await until(() => T28._state28().status === "tenant" && extOf(), 10000, "state written") && T28._state28().group.id === anchor().id.toLowerCase() && extOf().parts >= 1 && extOf().v === 2 && /^\d{4}-/.test(extOf().at) && stateText().length === extOf().bytes && (T28._pane("rules"), /Project state — in the tenant/.test($("mvBody").textContent)));
  const written = JSON.parse(stateText());
  ok("the state carries the project's decisions, not the rules and not the history (2 KB cap, 10719): no prefixes, no names, no run lines", written.v === 1 && !("history" in written) && !("newPrefixes" in written) && !written.rulesState.newPrefixes && !written.rulesState.revertUser);
  // a decision made here lands in the tenant after the debounce
  const c2 = JSON.parse(JSON.stringify(st().cfg)); c2.members.batched = ["NL-Breda", "IT"]; T28._saveCfg(c2);
  ok("a change (IT batched) is written to the tenant within seconds", await until(() => { const t = stateText(); return t && JSON.parse(t).members.batched.join() === "NL-Breda,IT"; }, 8000, "state update") && T28._state28().last.members.batched.join() === "NL-Breda,IT");
  // a second browser: the keys gone, the open reads them back
  const K = w.T28State.keysFor(w.TunoTenant.tenantId());   // the demo tenant's id, as the tool keys its storage
  for (const k of Object.values(K)) w.localStorage.removeItem(k);
  w.localStorage.setItem(K.rules, JSON.stringify(Object.assign({}, c2, { members: Object.assign({}, c2.members, { batched: [] }) })));
  await T28._stateRead();
  ok("another browser: the tenant's state is applied over its empty keys — IT is batched here too", st().cfg.members.batched.join() === "NL-Breda,IT" && T28._state28().status === "tenant" && JSON.parse(w.localStorage.getItem(K.rules)).members.batched.join() === "NL-Breda,IT");
  // a read that fails keeps the browser's copy and says so
  const realGet = w.Graph.get;
  w.Graph.get = async (p0, o) => { if (/extensions\/nl\.limonit\.tuno\.t28/.test(p0)) { const e = new Error("503 Service Unavailable"); e.kind = "throttled"; e.status = 503; throw e; } return realGet(p0, o); };
  await T28._stateRead();
  ok("a failed state read is said (error), the browser's copy stays in use, nothing written", T28._state28().status === "error" && /503/.test(T28._state28().why) && st().cfg.members.batched.join() === "NL-Breda,IT");
  w.Graph.get = realGet;
  await T28._stateRead();
  ok("…and the next read is back in the tenant", T28._state28().status === "tenant");

  // ------------------------------- 10716: the runs survive in the browser --
  const RS = T28._runsStore();
  ok("every run of this session went to the browser's database as it was logged, with who did it", RS.where === "indexeddb" && RS.saved >= st().runs.length && st().runs.length >= 1 && st().runs.every((r) => r.id && r.by !== undefined), JSON.stringify([RS, st().runs.length]));
  const before = st().runs.map((r) => [r.id, r.title, r.ok, r.done && r.done.length]);
  const stored = await w.T28Runs.list(w.TunoTenant.tenantId());
  ok("the database holds the same runs: titles, counts, the done steps (the undo's source) and the backup", stored.length === before.length && stored.every((r, i) => r.id === before[i][0] && r.title === before[i][1] && r.ok === before[i][2] && (r.done || []).length === before[i][3]) && stored.some((r) => r.backup && Array.isArray(r.backup.membership)));
  // "a refresh": the array emptied and loaded back from the database
  st().runs.length = 0;
  await T28._loadRuns();
  ok("after a reload the runs come back in order and the history is not fed twice", st().runs.map((r) => r.id).join() === before.map((b) => b[0]).join() && st().project.savedRuns === st().runs.length);
  T28._pane("changes");
  ok("📜 says where the runs live and still offers ↶ Undo for the member run", /kept in this browser's database/.test($("mvBody").textContent) && !!D.querySelector("[data-mrundo]") && new RegExp(before[0][1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test($("mvBody").textContent));
}

run().then(() => {
  console.log(`T28 hold groups: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

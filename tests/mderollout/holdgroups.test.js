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
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,MdeMembers,MdeTest,TUNO_DEMO_GRAPH,TOOL_VERSIONS});";
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
  let p = MM.planHoldGroups(cfg, { revert: { user: null, device: { id: "rd", displayName: cfg.revertDevice } }, pinnedGroup: null, skipGroup: { id: "sk", name: cfg.skipDevice }, tests: new Map([["Euro", euro], ["Americas", amer], ["Asia", asia]]), regions: null });
  const names = p.ops.map((o) => `${o.type}:${o.type === "create" ? o.name : o.child.name + "→" + o.parent.name}`);
  ok("nothing in place: the user Revert group, Pinned, Euro's test pair (the device one exists — nested only)", names.join("|") === "create:INT-SG-U-MDE-HoldBack|create:INT-SG-D-MDE-Pinned|create:INT-SG-U-WAVE-Euro-Test|nest:INT-SG-U-WAVE-Euro-Test→INT-SG-U-WAVE-Euro|nest:INT-SG-D-WAVE-Euro-Test→INT-SG-D-WAVE-Euro", names.join("|"));
  ok("…what exists is said as in place, the nested Americas device test group included", p.inPlace.join() === "INT-SG-D-MDE-HoldBack,INT-SG-D-MDE-Skip,INT-SG-D-WAVE-Americas-Test", p.inPlace.join());
  ok("…a missing wave and a duplicated name are left out with the reason", p.skipped.length === 2 && /INT-SG-U-WAVE-Americas-Test: INT-SG-U-WAVE-Americas does not exist yet — create it in 🌊 first/.test(p.skipped[0]) && /INT-SG-U-WAVE-Asia-Test: 2 groups carry this name/.test(p.skipped[1]), p.skipped.join("\n"));
  ok("…the descriptions: Revert's, Pinned's, the test group's with the wave's name; the nest after its create by ref", p.ops[0].description === cfg.revertDescription && p.ops[1].description === cfg.pinnedDescription && /test members of INT-SG-U-WAVE-Euro/.test(p.ops[2].description) && p.ops[3].child.ref === "INT-SG-U-WAVE-Euro-Test" && p.ops[4].child.id === "tg" && p.ops[4].size === 1);
  ok("…the title and counts; no REMOVE, run kind holdgroups", /create 3 · nest 2/.test(p.title) && p.counts.create === 3 && p.counts.nest === 2 && !p.hasRemoval && p.runKind === "holdgroups" && p.ops.every((o) => o.key === "holdgroups" && o.who));
  p = MM.planHoldGroups(cfg, { revert: { user: null, device: null }, pinnedGroup: null, skipGroup: null, tests: new Map([["Euro", euro], ["Americas", amer]]), regions: new Set(["Americas"]) });
  ok("the ticked regions decide which test groups: Euro unticked, nothing of it", p.ops.filter((o) => /Euro/.test(o.name || o.child.name)).length === 0 && p.ops.filter((o) => o.type === "create").length === 4);
  p = MM.planHoldGroups(cfg, { revert: { user: { id: "ru" }, device: { id: "rd" } }, pinnedGroup: { id: "p" }, skipGroup: { id: "s" }, tests: new Map([["Americas", { user: amer.user, device: amer.device }]]), regions: new Set(["Americas"]) });
  ok("everything in place: no step, said", p.ops.length === 0 && /all in place/.test(p.title) && p.inPlace.length === 5);

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
  ok("in the demo tenant none of them exists yet", !has("INT-SG-U-MDE-HoldBack") && !has("INT-SG-D-MDE-HoldBack") && !has("INT-SG-D-MDE-Pinned") && !has("INT-SG-D-MDE-Skip") && !has("INT-SG-U-WAVE-Euro-Test"));
  D.querySelector("[data-mrrollgroups]").click();
  ok("the dry run: four hold groups, Euro's test pair created and nested; the other regions' waves do not exist — left out", await until(() => st().plan && st().plan.holdGroups, 10000, "plan")
    && st().plan.ops.filter((o) => o.type === "create").map((o) => o.name).join() === "INT-SG-U-MDE-HoldBack,INT-SG-D-MDE-HoldBack,INT-SG-D-MDE-Pinned,INT-SG-D-MDE-Skip,INT-SG-U-WAVE-Euro-Test,INT-SG-D-WAVE-Euro-Test"
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
  ok("applied: the six groups exist in the tenant, the test pair nested in the Euro waves, the run on 📜", await until(() => st().runs.length === n0 + 1, 15000, "run") && st().runs[n0].runKind === "holdgroups" && st().runs[n0].ok === 8
    && has("INT-SG-U-MDE-HoldBack") && has("INT-SG-D-MDE-HoldBack") && has("INT-SG-D-MDE-Pinned") && has("INT-SG-D-MDE-Skip") && has("INT-SG-U-WAVE-Euro-Test") && has("INT-SG-D-WAVE-Euro-Test")
    && (G().find((g) => g.displayName === "INT-SG-U-WAVE-Euro-Test").memberOf || []).includes(G().find((g) => g.displayName === "INT-SG-U-WAVE-Euro").id), JSON.stringify(st().runs[n0] && st().runs[n0].lines));
  ok("…the Revert groups are known to ↩ and 🔄 without a re-read, Pinned and Skip to 👥", st().cs.extra.revert.user && st().cs.extra.revert.device && st().mem.input.pinnedGroup && st().mem.input.skipGroup);
  await until(() => st().tm.all && st().tm.test.get("Euro") && st().tm.test.get("Euro").user.group, 15000, "tests re-read");
  w.MdeRolloutV2Tool._pane("waves");
  ok("the row now says in place, the button off", /nothing to do — 6 groups in place|in place/.test(card().textContent) && D.querySelector("[data-mrrollgroups]").disabled, card().textContent.slice(0, 500));
}

run().then(() => {
  console.log(`T28 hold groups: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

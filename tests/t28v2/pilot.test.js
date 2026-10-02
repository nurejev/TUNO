// T28 — 🧪 Pilots as the policies' bar target (build 10675, Mihai: "add or
// remove the pilot users just as with the waves … selecting a policy and the
// option should be there … it is about the pilot groups"). The pilot groups
// under ⚙️ are paired into tiers by their - D - / - U - token (the engine's
// pilotTiers), a ticked policy takes the half of its kind, and the bar's
// dry run puts them on or takes them off like a wave — nothing else on the
// policy touched. Driven in DEMO mode through the whole app, with the four
// PVM pilot names resolved by a stubbed lookup (the demo tenant has none).
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
  const bridge = ";Object.assign(window,{TOOL_VERSIONS,Graph,PolicyCache,MdeRollout,MdeRolloutV2Tool,AssignEdit,TUNO_DEMO_GRAPH,MdeMembers,MdeAsr});";
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

const PVM = ["INT-SG-D-Win-Pilot", "INT-SG-D-Win-Pre-Pilot", "INT-SG-U-Win-Pre-Pilot", "INT-SG-U-Win-Pilot"];
const ID = { "INT-SG-D-Win-Pilot": "22222222-0000-4000-8000-000000000071", "INT-SG-U-Win-Pilot": "22222222-0000-4000-8000-000000000072",
  "INT-SG-D-Win-Pre-Pilot": "22222222-0000-4000-8000-000000000073", "INT-SG-U-Win-Pre-Pilot": "22222222-0000-4000-8000-000000000074" };

async function run() {
  const { w } = boot();
  const D = w.document, $ = (id) => D.getElementById(id);
  const tool = w.MdeRolloutV2Tool, st = () => tool._state();
  const idle = () => until(() => !st().running && !st().busy && !st().enriching, 30000, "idle");

  // ------------------------------------------------------ the engine --
  const T = w.MdeRollout.pilotTiers(PVM);
  ok("the four PVM names make two tiers, in config order", T.length === 2 && T[0].label === "Win-Pilot" && T[1].label === "Win-Pre-Pilot", JSON.stringify(T));
  ok("each tier has a device half and a user half", T.every((t) => t.groups.length === 2 && t.groups.some((g) => g.audience === "device") && t.groups.some((g) => g.audience === "user")));
  ok("the halves keep their exact names", T[0].groups.map((g) => g.name).sort().join("|") === "INT-SG-D-Win-Pilot|INT-SG-U-Win-Pilot" && T[1].groups.map((g) => g.name).sort().join("|") === "INT-SG-D-Win-Pre-Pilot|INT-SG-U-Win-Pre-Pilot");
  const T2 = w.MdeRollout.pilotTiers(["INT-SG-D-Win-Pilot", "INT-SG-U-Win-Pilot", "SEC-Pilot-Ring0", " INT-SG-D-Win-Pilot ", ""]);
  ok("a name with no - D - / - U - token is a tier of its own, offered to no kind; blanks and repeats are dropped", T2.length === 2 && T2[1].label === "SEC-Pilot-Ring0" && T2[1].groups.length === 1 && T2[1].groups[0].audience === "unknown" && T2[0].groups.length === 2, JSON.stringify(T2));
  ok("a dash kind or a case difference does not split a tier", w.MdeRollout.pilotTiers(["INT-SG-D-Win-Pilot", "int-sg-u-win–pilot"]).length === 1);
  ok("other token spellings pair too (UG / DG)", (() => { const t = w.MdeRollout.pilotTiers(["PVM-DG-Pilot", "PVM-UG-Pilot"]); return t.length === 1 && t[0].groups.length === 2 && t[0].label === "Pilot"; })());
  ok("no names, no tiers", w.MdeRollout.pilotTiers([]).length === 0 && w.MdeRollout.pilotTiers(null).length === 0);

  // ----------------------------------------------------- the screen --
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  const offer = $("mvBody").querySelector('[data-mrread="attach"]');
  ok("T28 offers the held read", !!offer);
  offer.click();
  ok("the read finishes and the rail renders", await until(() => $("mvBody").querySelector(".ep-rail"), 30000, "rail"));
  await idle();
  ok("the ⚙️ pilot names are the four PVM groups by default", st().cfg.pilotGroups.join("|") === PVM.join("|"), st().cfg.pilotGroups.join("|"));
  const seg = $("mvTargetSeg");
  ok("the bar's target seg offers 🧪 Pilots beside 🌊 Waves", !!seg.querySelector('[data-mrtarget="pilots"]') && seg.querySelector('[data-mrtarget="pilots"]').previousElementSibling.dataset.mrtarget === "waves");
  ok("the rules pane and How it works say what 🧪 Pilots in the bar does", (() => { tool._pane("rules"); const a = /🧪 Pilots puts them on a ticked policy/.test($("mvBody").textContent); tool._pane("how"); const b = /Pilots in the policies' bar/.test($("mvBody").textContent); return a && b; })());

  tool._pane("new");
  const edge = st().model.newP.find((p) => /Microsoft Edge/.test(p.name));
  ok("the demo has the unassigned - D - Edge policy to plan on", !!edge && edge.audience === "device" && edge.reach.inc.size === 0);
  const pick = D.querySelector(`[data-mrpick="${edge.key}"]`);
  pick.checked = true; pick.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("ticking a policy shows the bar in policy mode", $("mvSelbar").classList.contains("visible") && $("mvBarPolicies").style.display === "contents");
  ok("…with the tier ticks hidden while the target is a group", $("mvBarPilotTiers").style.display === "none");
  seg.querySelector('[data-mrtarget="pilots"]').click();
  const ticks = () => [...$("mvBarPilotTiers").querySelectorAll("[data-mrtier]")];
  ok("🧪 Pilots shows one tick per tier, both on, and hides the group box and the waves' pilots-off tick", $("mvBarPilotTiers").style.display !== "none" && ticks().length === 2 && ticks().every((t) => t.checked)
    && /Win-Pilot/.test($("mvBarPilotTiers").textContent) && /Win-Pre-Pilot/.test($("mvBarPilotTiers").textContent) && $("mvGroup").style.display === "none" && $("mvBarPilotsL").style.display === "none");
  ok("the ticks say each tier is a D and a U half", /\(D · U\)/.test($("mvBarPilotTiers").textContent) || /\(U · D\)/.test($("mvBarPilotTiers").textContent), $("mvBarPilotTiers").textContent);

  // The lookup, stubbed: the demo tenant has no PVM pilot groups. The bar's
  // dry run goes through MdeRollout.findGroups and .readKinds by name, so
  // the stub stands in for the tenant and nothing else is faked.
  const realFind = w.MdeRollout.findGroups, realKinds = w.MdeRollout.readKinds;
  let looked = null;
  w.MdeRollout.findGroups = async (names) => { looked = names.slice(); const found = new Map(); for (const n of names) found.set(n.toLowerCase(), ID[n] ? { id: ID[n], displayName: n } : null); return { found, dupes: [] }; };
  w.MdeRollout.readKinds = async (ids, onStatus, known) => {
    const m = new Map(known || []);
    for (const id of ids) { const name = Object.keys(ID).find((k) => ID[k].toLowerCase() === id.toLowerCase()); if (!name) continue; const dev = /-D-/.test(name); m.set(id.toLowerCase(), { kind: dev ? "device" : "user", source: "members", name, users: dev ? null : 8, devices: dev ? 12 : null }); }
    return m;
  };

  $("mvDryRun").click();
  ok("an include plan is cut for the ticked policy", await until(() => st().plan && st().plan.changes.length === 1, 10000, "pilot include plan"));
  ok("the lookup asked for every name of the ticked tiers, not the ids", looked && looked.length === 4 && PVM.every((n) => looked.includes(n)));
  const after = () => st().plan.changes[0].after.filter((a) => a.target && /groupAssignmentTarget$/.test(a.target["@odata.type"])).map((a) => a.target.groupId.toLowerCase());
  ok("a - D - policy gets the DEVICE halves of both tiers and neither user group", after().length === 2 && after().includes(ID["INT-SG-D-Win-Pilot"]) && after().includes(ID["INT-SG-D-Win-Pre-Pilot"]) && !after().some((id) => id === ID["INT-SG-U-Win-Pilot"] || id === ID["INT-SG-U-Win-Pre-Pilot"]), after().join(","));
  ok("the plan names the tiers and the action", /Include the pilot groups \(Win-Pilot, Win-Pre-Pilot\)/.test(st().plan.title) && st().plan.head.action === "add-include-pilots" && st().plan.head.tiers.join("|") === "Win-Pilot|Win-Pre-Pilot");
  ok("…and says what each group counts and when it lands", /INT-SG-D-Win-Pilot · 12 devices/.test($("mvPlan").textContent) && /next check-in/.test($("mvPlan").textContent) && /Remove/.test($("mvPlan").textContent), $("mvPlan").textContent.slice(0, 400));
  ok("nothing is left out, so no left-out box", !/Left out/.test($("mvPlan").textContent));

  // Untick a tier: only the other one goes
  const pre = ticks().find((t) => /pre/.test(t.dataset.mrtier));
  pre.checked = false; pre.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("unticking a tier clears the plan and is remembered", !st().plan && st().pilotTiersOff.size === 1);
  $("mvDryRun").click();
  ok("the dry run now takes the one ticked tier only", await until(() => st().plan && st().plan.changes.length === 1, 10000, "one-tier plan") && after().length === 1 && after()[0] === ID["INT-SG-D-Win-Pilot"] && /\(Win-Pilot\)/.test(st().plan.title));
  pre.checked = true; pre.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("ticking it back forgets the untick", st().pilotTiersOff.size === 0);

  // Remove with nothing assigned: nothing to do, never a write
  D.querySelector('#mvActSeg [data-mract="remove"]').click();
  $("mvDryRun").click();
  ok("Remove on a policy without the pilot groups is nothing to do, with each group named", await until(() => /Nothing to do/.test($("mvPlan").textContent), 10000, "remove no-op") && st().plan === null && /INT-SG-D-Win-Pilot is not on it/.test($("mvPlan").textContent));
  D.querySelector('#mvActSeg [data-mract="add-include"]').click();

  // A name the tenant does not have is said, the rest still planned
  w.MdeRollout.findGroups = async (names) => { const found = new Map(); for (const n of names) found.set(n.toLowerCase(), ID[n] && !/Pre-Pilot/.test(n) ? { id: ID[n], displayName: n } : null); return { found, dupes: [] }; };
  $("mvDryRun").click();
  ok("a missing pilot group is left out with its name and the ⚙️ hint; the found half still goes", await until(() => st().plan && st().plan.changes.length === 1, 10000, "missing-group plan")
    && /INT-SG-D-Win-Pre-Pilot does not exist in this tenant — check the name under ⚙️/.test($("mvPlan").textContent) && after().length === 1);
  w.MdeRollout.findGroups = realFind; w.MdeRollout.readKinds = realKinds;

  // Apply the first plan through V2's gates: the run lands on the ledger
  w.MdeRollout.findGroups = async (names) => { const found = new Map(); for (const n of names) found.set(n.toLowerCase(), ID[n] ? { id: ID[n], displayName: n } : null); return { found, dupes: [] }; };
  w.MdeRollout.readKinds = async (ids, o, known) => new Map(known || []);
  $("mvDryRun").click();
  await until(() => st().plan && st().plan.changes.length === 1, 10000, "plan to apply");
  const runsBefore = st().runs.length;
  $("mvBackup").click(); $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  const r = $("mvRiskReason"), t = $("mvRiskAccept");
  if (r && t && !t.checked) { r.value = "Accepted by the headless suite for this demo plan."; r.dispatchEvent(new w.Event("input", { bubbles: true })); t.checked = true; t.dispatchEvent(new w.Event("change", { bubbles: true })); }
  await until(() => $("mvApply") && !$("mvApply").disabled, 10000, "apply unlocked");
  $("mvApply").click();
  ok("the include is applied on the ledger, titled for the pilot groups, with its backup", await until(() => st().runs.length === runsBefore + 1, 10000, "pilot run")
    && /Include the pilot groups/.test(st().runs[runsBefore].title) && st().runs[runsBefore].backup && st().runs[runsBefore].backup.action === "add-include-pilots");
  w.MdeRollout.findGroups = realFind; w.MdeRollout.readKinds = realKinds;

  // No pilot names under ⚙️: the bar says so instead of guessing
  tool._pane("new");
  const cfg0 = st().cfg;
  st().model.cfg.pilotGroups = [];
  Object.assign(cfg0, { pilotGroups: [] });
  seg.querySelector('[data-mrtarget="pilots"]').click();
  ok("with no pilot names the bar says to add them under ⚙️", /no pilot groups under ⚙️/.test($("mvBarPilotTiers").textContent) && ticks().length === 0);
  $("mvDryRun").click();
  ok("…and a dry run refuses with the same reason", await until(() => /No pilot groups under ⚙️/.test($("mvPlan").textContent), 10000, "no-names refusal"));

  console.log(`t28v2/pilot: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run().catch((e) => { console.error(e); process.exitCode = 1; });

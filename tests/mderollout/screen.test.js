// T28 — MDE rollout screen (build 10632), driven end to end in DEMO mode:
// the whole app booted from index.html's own script list (so the load
// order is the page's), signed in through the demo link, the tile opened,
// the tenant read, every pane rendered, a fix dry-run through the gates
// and applied on the run ledger, a manual include planned, and the wave
// groups created and read back.
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
  const bridge = ";Object.assign(window,{TOOL_VERSIONS,Graph,PolicyCache,MdeRollout,MdeRolloutTool,AssignEdit,TUNO_DEMO_GRAPH});";
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
  const D = w.document;
  const $ = (id) => D.getElementById(id);
  ok("the page loads the tool's script, before app.js", files.includes("js/mderollout.js") && files.indexOf("js/mderollout.js") < files.indexOf("js/app.js"));
  ok("T28 is registered as tool 28, beta 0.x", w.TOOL_VERSIONS.toolMdeRollout && w.TOOL_VERSIONS.toolMdeRollout.t === 28 && /^0\./.test(w.TOOL_VERSIONS.toolMdeRollout.v));
  const tile = $("toolMdeRollout");
  ok("the tile exists, says temporary and writes-to-the-tenant", tile && /temporary/.test(tile.textContent) && tile.querySelector(".tag.block"));

  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await sleep(60);
  tile.click();
  await sleep(10);
  ok("the tile opens the screen", $("screen-mderollout").classList.contains("active"));

  $("mrRun").click();
  ok("the read finishes and the rail renders", await until(() => $("mrBody").querySelector(".ep-rail"), 30000, "rail"));
  // enrichment (kinds, labels) follows the first paint
  ok("group kinds and setting names settle", await until(() => !/⏳/.test(($("mrEnrich") || { textContent: "" }).textContent) && w.MdeRolloutTool._state().pairs.some((p) => p.proposal && p.proposal.steps.some((s) => s.kind === "user")), 30000, "enrich"));
  const st = () => w.MdeRolloutTool._state();
  const S = st();
  const names = (list) => list.map((p) => p.name);
  ok("the new set is sorted by name prefix", names(S.model.newP).includes("Win - OIB - ES - Defender Antivirus - D - AV Configuration - v3.3")
    && names(S.model.newP).some((n) => /^WIN-SEC-AttackSurface/.test(n)) && names(S.model.newP).includes("Win - OIB - SC - Microsoft Edge - D - Security - v3.7"));
  ok("AVD is out of scope, not old", names(S.model.outP).some((n) => /^AVD/.test(n)) && !names(S.model.oldP).some((n) => /^AVD/.test(n)));
  ok("the assigned legacy intent is in the old set", names(S.model.oldP).includes("PVM Legacy — Defender antivirus (intent)"));
  const pair = (o, n) => S.pairs.find((p) => p.O.name === o && p.N.name.startsWith(n));
  const av = pair("(TO-BE-REMOVED)PVM-DG-CORP-ENDSEC-WIN-AV-PRD", "Win - OIB - ES - Defender Antivirus");
  ok("old AV conflicts with new AV on cloud block level and PUA", av && av.type === "conflict" && av.diffs.length === 2);
  ok("…and its DEVICE-wave exclusion is supported (old targets a dynamic DEVICE group)", av.proposal.steps.length === 1 && av.proposal.steps[0].supported === true && av.proposal.steps[0].groupName === "PVM-DG-MDE-WAVE-Euro");
  const asr = pair("PVM-DG-CORP-ENDSEC-WIN-ASR-PRD", "WIN-SEC-AttackSurface");
  ok("old ASR meets the one-rule policy on that rule only", asr && asr.diffs.length === 1 && /obfuscated/i.test(asr.diffs[0].name));
  ok("…and against its USER-targeted policy the wave's USER twin is proposed", asr.proposal.steps[0].supported === true && asr.proposal.steps[0].action === "add-exclude"
    && asr.proposal.steps[0].groupName === "PVM-UG-MDE-WAVE-Euro" && asr.proposal.steps[0].twinOf === "PVM-DG-MDE-WAVE-Euro");
  ok("the - D - policies are read as device policies", S.model.newP.filter((p) => / - D - |-D-/.test(p.name)).every((p) => p.audience === "device"));
  const edgeStaged = S.pairs.find((p) => p.O.name === "(TO-BE-REMOVED)PVM-DG-DEVCONF-CORP-WIN-EDGE-Security - v3.0" && /Microsoft Edge/.test(p.N.name));
  ok("a staged - D - policy is planned with the DEVICE wave only", edgeStaged.proposal.steps.length === 1 && edgeStaged.proposal.steps[0].groupName === "PVM-DG-MDE-WAVE-Euro" && edgeStaged.proposal.steps[0].planned);
  const edge = pair("(TO-BE-REMOVED)PVM-DG-DEVCONF-CORP-WIN-EDGE-Security - v3.0", "Win - OIB - SC - Microsoft Edge");
  ok("the unassigned new Edge policy is staged against the old one", edge && edge.reach.verdict === "staged");
  ok("the legacy intent meets the new AV policy by category", S.pairs.some((p) => p.O.name === "PVM Legacy — Defender antivirus (intent)" && p.type === "review"));
  ok("setting names come from the definitions, not the ids", /cloud/i.test(av.diffs.map((d) => w.MdeRollout.labelName(new Map(), d)).join(" ")) || av.diffs.some((d) => /Cloud/.test(D.getElementById("mrBody").textContent)));

  // ---------------------------------------------------------- panes --
  const paneText = (p) => { w.MdeRolloutTool._pane(p); return $("mrBody").textContent; };
  ok("Conflicts groups by old policy and shows the twin", /twin of PVM-DG-MDE-WAVE-Euro/.test(paneText("conflicts")) && /PVM-DG-CORP-ENDSEC-WIN-ASR-PRD/.test($("mrBody").textContent));
  ok("New lists the new set", /Win - OIB - ES - Defender Antivirus/.test(paneText("new")) && !/AVD - SEC/.test($("mrBody").textContent));
  ok("Old lists the old set with its retirement verdict", /PVM-DG-CORP-ENDSEC-WIN-ASR-PRD/.test(paneText("old")));
  ok("Retirement names the WHfB gap", /GAP/.test(paneText("retire")) && /WHFB/.test($("mrBody").textContent));
  const wt = paneText("waves");
  ok("Waves: the Euro pair exists; four pairs and both exclusion groups are missing", /PVM-UG-MDE-WAVE-Euro/.test(wt) && /PVM-DG-MDE-WAVE-Euro/.test(wt)
    && st().waveRows.filter((x) => !x.exists).length === 10 && st().waveRows.find((x) => x.name === "PVM-DG-MDE-WAVE-Euro").exists && st().waveRows.find((x) => x.name === "PVM-UG-MDE-WAVE-Euro").exists);
  ok("Waves groups the rows by region, then the exclusion groups", D.querySelectorAll("#mrBody tr.mr-oldhead").length === 6 && /Exclusion groups/.test(wt) && /PVM-DG-MDE-Exclusion/.test(wt) && /PVM-UG-MDE-Exclusion/.test(wt));
  ok("Waves says Intune does not mix user and device groups", /does not exclude a user group/.test(wt));
  ok("the device wave counts the - D - policies it is in", /2 \/ 3/.test(D.querySelector('[data-mrwaveinc="PVM-DG-MDE-WAVE-Euro"]').parentElement.textContent));
  ok("Out of scope lists AVD", /AVD - SEC - Defender Antivirus/.test(paneText("out")));
  ok("Rules shows the three prefixes", /WIN-SEC/.test($("mrBody").querySelector("#mrRuleNew") ? $("mrRuleNew").value : paneText("rules")));
  ok("How it works cites the support matrix", /support matrix/.test(paneText("how")));

  // ---------------------------------------------- fix: dry run → apply --
  w.MdeRolloutTool._pane("conflicts");
  const box = D.querySelector(`[data-mrpair="${asr.id}"]`);
  ok("a supported fix has a tick box", !!box);
  ok("the device-wave fix on the old AV policy has one too", !!D.querySelector(`[data-mrpair="${av.id}"]`));
  box.checked = true; box.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the bar appears in fix mode", $("mrSelbar").classList.contains("visible") && /1 fix selected/.test($("mrSelCount").textContent) && $("mrBarFixes").style.display !== "none");
  $("mrDryRun").click();
  ok("the dry run renders a plan", await until(() => $("mrApply") || /Nothing writable/.test($("mrPlan").textContent), 10000, "plan"));
  const plan = st().plan;
  ok("the plan excludes the wave from the old ASR policy", plan && plan.changes.length === 1 && plan.changes[0].after.some((a) => /exclusion/i.test(a.target["@odata.type"])));
  ok("apply is locked before the backup", $("mrApply").disabled);
  $("mrConfirmTick").checked = true; $("mrConfirmTick").dispatchEvent(new w.Event("change"));
  ok("…and still locked with only the tick", $("mrApply").disabled);
  $("mrBackup").click();
  ok("backup + tick unlock apply", !$("mrApply").disabled);
  $("mrApply").click();
  ok("the run lands in the session log", await until(() => st().runs.length === 1, 10000, "run"));
  ok("the ledger rendered one row per policy", $("mrLedger").querySelectorAll(".rl-row").length === 1 || $("mrPlan").querySelectorAll(".rl-row").length === 1);
  ok("the run records its backup", st().runs[0].backup.policies.length === 1 && st().runs[0].backup.tool === "TUNO T28 MDE rollout");

  // ---------------------------------------------- manual include plan --
  w.MdeRolloutTool._pane("new");
  const edgeKey = st().model.newP.find((p) => /Microsoft Edge/.test(p.name)).key;
  const pick = D.querySelector(`[data-mrpick="${edgeKey}"]`);
  pick.checked = true; pick.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the bar switches to policy mode", $("mrSelbar").classList.contains("visible") && $("mrBarPolicies").style.display === "contents");
  $("mrGroup").value = "PVM-UG-MDE-WAVE-Euro";
  $("mrDryRun").click();
  ok("an include plan is cut", await until(() => st().plan && st().plan.changes.length === 1, 10000, "include plan"));
  ok("…warning that a - D - policy is given a user group", /the device wave is the one meant for it/.test($("mrPlan").textContent));
  ok("the include targets the wave group", st().plan.changes[0].after.some((a) => a.target.groupId && /groupAssignmentTarget/.test(a.target["@odata.type"])));
  // a removal plan asks for the typed word
  D.querySelector('#mrActSeg [data-mract="remove"]').click();
  $("mrDryRun").click();
  await until(() => st().plan, 10000, "remove plan");
  ok("removing a group that is not assigned is a no-op, never a write", st().plan.changes.length === 0 && st().plan.noops.length === 1);
  D.querySelector('#mrActSeg [data-mract="add-include"]').click();
  $("mrSelClear").click();
  ok("clearing the selection hides the bar", !$("mrSelbar").classList.contains("visible"));

  // -------------------------------------------------- create waves --
  w.MdeRolloutTool._pane("waves");
  const wb = D.querySelector('[data-mrwave="PVM-UG-MDE-WAVE-Americas"]');
  ok("a missing wave has a tick box", !!wb);
  wb.checked = true; wb.dispatchEvent(new w.Event("change", { bubbles: true }));
  const xb = D.querySelector('[data-mrwave="PVM-DG-MDE-Exclusion"]');
  ok("a missing exclusion group has a tick box", !!xb);
  xb.checked = true; xb.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("create stays locked until the confirm tick", $("mrWaveCreate").disabled);
  $("mrWaveOk").checked = true; $("mrWaveOk").dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the tick unlocks create", !$("mrWaveCreate").disabled);
  $("mrWaveCreate").click();
  ok("the wave is created and read back", await until(() => st().runs.length === 2, 10000, "wave run") && /created · verified/.test(st().runs[1].lines.join(" ")));
  ok("…and now exists", st().waveRows.find((x) => x.name === "PVM-UG-MDE-WAVE-Americas").exists);
  const exRow = st().waveRows.find((x) => x.name === "PVM-DG-MDE-Exclusion");
  ok("the exclusion group is created in the same run, with the exclusion description", exRow.exists && /exclusion/i.test(exRow.group.description || "") && /PVM-DG-MDE-Exclusion: created · verified/.test(st().runs[1].lines.join("\n")));
  ok("…read as a device group by its name while empty", exRow.kind === "device");
  ok("an existing exclusion group offers to exclude it from the new policies", !!D.querySelector('[data-mrexcl="PVM-DG-MDE-Exclusion"]'));
  ok("…owned by the signed-in admin (read back)", /owner alex\.admin@contoso\.com/.test(st().runs[1].lines.join(" ")));
  ok("a second create of the same name is skipped, not duplicated", (await w.MdeRollout.createWave("PVM-UG-MDE-WAVE-Americas", "")).skipped === true);

  // --------------------------------------- rollout actions (10633) --
  w.MdeRolloutTool._pane("waves");
  ok("the 🌊 pane leads with the three rollout actions", /Rollout actions/.test($("mrBody").textContent) && D.querySelectorAll("[data-mrroll]").length === 3);
  D.querySelector('[data-mrroll="includeWaves"]').click();
  ok("① include: a plan is cut", await until(() => st().plan, 10000, "rollout include plan"));
  ok("…the device wave into the unassigned - D - Edge policy, the others already hold it", st().plan.changes.length === 1 && /Microsoft Edge/.test(st().plan.changes[0].policy.name)
    && st().plan.changes[0].after.some((a) => a.target.groupId === "11111111-0000-4000-8000-000000000021"));
  ok("…and the waves that do not exist are left out, named", /Left out/.test($("mrPlan").textContent) && /PVM-DG-MDE-WAVE-Americas does not exist/.test($("mrPlan").textContent));
  $("mrBackup").click(); $("mrConfirmTick").checked = true; $("mrConfirmTick").dispatchEvent(new w.Event("change"));
  $("mrApply").click();
  // (the demo's /assign is simulated and does not keep the write, so the read-back says NOT verified — as it does for every T11 write in demo)
  ok("…applied on the ledger and logged with its backup", await until(() => st().runs.length === 3, 10000, "rollout include run") && /Include the waves/.test(st().runs[2].title)
    && st().runs[2].ok + st().runs[2].bad === 1 && st().runs[2].backup.policies.length === 1 && st().runs[2].backup.action === "rollout-includeWaves");
  w.MdeRolloutTool._pane("waves");
  D.querySelector('[data-mrroll="excludeExclusion"]').click();
  ok("② exclude: the device exclusion group from the three - D - policies", await until(() => st().plan, 10000, "rollout exclusion plan")
    && st().plan.changes.length === 3 && st().plan.changes.every((o) => o.details.some((d) => d.action === "add-exclude" && d.group.displayName === "PVM-DG-MDE-Exclusion")));
  w.MdeRolloutTool._pane("waves");
  D.querySelector('[data-mrroll="excludeWaves"]').click();
  ok("③ the waves out of the colliding old policies — waves only", await until(() => st().plan, 10000, "rollout wave-exclusion plan")
    && st().plan.changes.length >= 1 && st().plan.changes.every((o) => o.details.filter((d) => d.change === "modify").every((d) => /MDE-WAVE/.test(d.group.displayName))));
  w.MdeRolloutTool._pane("waves");
  D.querySelector('[data-mrroll-region="Euro"]').click();
  ok("unticking a region narrows the actions", !!st().rollRegions && !st().rollRegions.has("Euro") && D.querySelector('[data-mrroll="excludeWaves"]').disabled);
  D.querySelector('[data-mrroll-region="Euro"]').click();
  ok("ticking it back restores every region", st().rollRegions === null);
  w.MdeRolloutTool._pane("waves");

  // ----------------------------------------------------- rules pane --
  w.MdeRolloutTool._pane("rules");
  $("mrRuleOut").value = "AVD\nWinServ\nPVM-DG-CORP-ENDSEC-WIN-ASR";
  $("mrRuleSave").click();
  ok("saving the rules re-sorts the generations", await until(() => st().model.outP.some((p) => p.name === "PVM-DG-CORP-ENDSEC-WIN-ASR-PRD"), 5000, "rules"));
  const key = "tuno.t28.rules." + String((w.TunoTenant && w.TunoTenant.tenantId()) || "default").toLowerCase();
  ok("…and keeps them for this tenant", /PVM-DG-CORP-ENDSEC-WIN-ASR/.test(w.localStorage.getItem(key) || ""), key);
  $("mrRuleReset").click();
  ok("reset brings the defaults back", st().cfg.outPrefixes.join("|") === "AVD|WinServ|Win-Serv");
  w.MdeRolloutTool._pane("rules");
  ok("rules show the regions and the four group-name fields", /Euro/.test($("mrRuleWaves").value) && $("mrRuleDgPre").value === "PVM-DG-MDE-WAVE-" && $("mrRuleExU").value === "PVM-UG-MDE-Exclusion");

  // ----------------------------- a re-read never loses the plan panel --
  // (found in a real browser: the warm start renders before the first
  // click, 🚀 Read the tenant clears the body, and the panel went with it)
  $("mrRun").click();
  await until(() => $("mrBody").querySelector(".ep-rail"), 30000, "re-read");
  await sleep(50);
  w.MdeRolloutTool._pane("conflicts");
  const again = D.querySelector("[data-mrpair]");
  again.checked = true; again.dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mrGroup").value = "";   // the include test above left its group in the bar
  $("mrDryRun").click();
  ok("after a second read the dry run still has somewhere to land", await until(() => D.getElementById("mrPlan") && D.getElementById("mrPlan").isConnected && /② Plan/.test(D.getElementById("mrPlan").textContent), 10000, "plan after re-read"));
  ok("…and the panel sits in the main column", !!D.querySelector(".ep-main #mrPlan"));

  // ------------------------------------------------------- exports --
  const md = w.MdeRollout.markdown(st().model, st().pairs, st().retire, st().waveRows, { tenant: "Contoso" });
  ok("the markdown export carries the four sections", /## Wave and exclusion groups/.test(md) && /## New policies/.test(md) && /## Old policies colliding/.test(md) && /## Retirement check/.test(md));
}

run().then(() => {
  console.log(`mderollout-screen: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
}).catch((e) => { console.error(e); process.exit(1); });

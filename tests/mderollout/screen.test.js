// T28 — MDE rollout screen (build 10632), driven end to end in DEMO mode:
// the whole app booted from index.html's own script list (so the load
// order is the page's), signed in through the demo link, the tile opened,
// (10644: opening offers the read and starts nothing)
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
  const bridge = ";Object.assign(window,{TOOL_VERSIONS,Graph,PolicyCache,MdeRollout,MdeRolloutTool,AssignEdit,TUNO_DEMO_GRAPH,MdeMembers});";
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
  // 10644 (Mihai: "clicking the tool should offer to read the tenant, and
  // not start automatically"): opening T28 asks the tenant for nothing.
  const reads = { refresh: 0, read: 0 };
  const realRefresh = w.PolicyCache.refresh, realRead = w.PolicyCache.read;
  w.PolicyCache.refresh = (...a) => { reads.refresh++; return realRefresh(...a); };
  w.PolicyCache.read = (...a) => { reads.read++; return realRead(...a); };
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  tile.click();
  await sleep(10);
  ok("the tile opens the screen", $("screen-mderollout").classList.contains("active"));
  await sleep(150);
  const offer = () => $("mrBody").querySelector(".mr-offer");
  ok("opening reads nothing: no model, no rail, no read started", !w.MdeRolloutTool._state().model && !$("mrBody").querySelector(".ep-rail") && reads.refresh === 0 && reads.read === 0, JSON.stringify(reads));
  ok("it offers the read instead: ↻ Read the tenant, and says reading writes nothing", !!offer() && !!offer().querySelector('[data-mrread="fresh"]') && /changes nothing/.test(offer().textContent));
  const useHeld = offer() && offer().querySelector('[data-mrread="attach"]');
  ok("with the sign-in read held, it also offers that read, with its time", !!useHeld && /sign-in read from \d/.test(useHeld.textContent) && useHeld.textContent.includes(w.PolicyCache.timeLabel()));
  ok("the ⊘ header button stays hidden until something is read", $("mrExclude").hidden);
  w.TunoScreenHooks["screen-mderollout"]();
  await sleep(50);
  ok("opening it again still only offers", !!offer() && !w.MdeRolloutTool._state().model && reads.refresh === 0);

  offer().querySelector('[data-mrread="attach"]').click();
  ok("the read finishes and the rail renders", await until(() => $("mrBody").querySelector(".ep-rail"), 30000, "rail"));
  ok("using the sign-in read asks for no fresh read, and the offer is gone", reads.refresh === 0 && !offer() && /From the sign-in read at/.test($("mrBody").textContent), JSON.stringify(reads));
  w.TunoScreenHooks["screen-mderollout"]();
  ok("once read, opening the screen again keeps the read", !!$("mrBody").querySelector(".ep-rail") && !offer());
  w.PolicyCache.refresh = realRefresh; w.PolicyCache.read = realRead;
  // 10642 (Mihai: "should be default excluded with the option to include if
  // needed"): the demo's one-rule ASR policy is on the default leave-out
  // list — 🚫 shows it with ➕ include, which puts it back in scope. The
  // rest of this suite works with it included.
  const stE = () => w.MdeRolloutTool._state();
  const ASR = "WIN-SEC-AttackSurfaceReduction-D-02_Block execution of potentially obfuscated scripts-v1.0";
  ok("by default the ASR one-rule policy is out of scope, left out by name", stE().model.outP.some((P) => P.name === ASR && P.outWhy) && !stE().model.newP.some((P) => P.name === ASR) && stE().cfg.leaveOut.length === 78);
  w.MdeRolloutTool._pane("out");
  ok("🚫 marks it and offers ➕ include", /➖ left out by name/.test($("mrBody").textContent) && !!D.querySelector(`[data-mrinclude="${ASR}"]`));
  D.querySelector(`[data-mrinclude="${ASR}"]`).click();
  ok("➕ include: back among the new policies, off the list for this tenant", stE().model.newP.some((P) => P.name === ASR) && stE().cfg.leaveOut.length === 77 && !stE().cfg.leaveOut.includes(ASR));
  w.MdeRolloutTool._pane("conflicts");
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
  ok("…and its DEVICE-wave exclusion is supported (old targets a dynamic DEVICE group)", av.proposal.steps.length === 1 && av.proposal.steps[0].supported === true && av.proposal.steps[0].groupName === "INT-SG-D-WAVE-Euro");
  const asr = pair("PVM-DG-CORP-ENDSEC-WIN-ASR-PRD", "WIN-SEC-AttackSurface");
  ok("old ASR meets the one-rule policy on that rule only", asr && asr.diffs.length === 1 && /obfuscated/i.test(asr.diffs[0].name));
  ok("…and against its USER-targeted policy the wave's USER twin is proposed", asr.proposal.steps[0].supported === true && asr.proposal.steps[0].action === "add-exclude"
    && asr.proposal.steps[0].groupName === "INT-SG-U-WAVE-Euro" && asr.proposal.steps[0].twinOf === "INT-SG-D-WAVE-Euro");
  ok("the - D - policies are read as device policies", S.model.newP.filter((p) => / - D - |-D-/.test(p.name)).every((p) => p.audience === "device"));
  const edgeStaged = S.pairs.find((p) => p.O.name === "(TO-BE-REMOVED)PVM-DG-DEVCONF-CORP-WIN-EDGE-Security - v3.0" && /Microsoft Edge/.test(p.N.name));
  // 10643: ⚔️ proposes the waves by default — the wave out of the old
  // policy and, since the staged policy has not got it, into the new one
  // in the same plan
  ok("a staged - D - policy gets the DEVICE wave only: out of the old policy and into the new one", edgeStaged.proposal.byWaves && edgeStaged.proposal.steps.length === 1 && edgeStaged.proposal.steps[0].groupName === "INT-SG-D-WAVE-Euro"
    && edgeStaged.proposal.steps[0].needsInclude && edgeStaged.proposal.includes.map((x) => x.groupName).join() === "INT-SG-D-WAVE-Euro");
  const edge = pair("(TO-BE-REMOVED)PVM-DG-DEVCONF-CORP-WIN-EDGE-Security - v3.0", "Win - OIB - SC - Microsoft Edge");
  ok("the unassigned new Edge policy is staged against the old one", edge && edge.reach.verdict === "staged");
  ok("the legacy intent meets the new AV policy by category", S.pairs.some((p) => p.O.name === "PVM Legacy — Defender antivirus (intent)" && p.type === "review"));
  ok("setting names come from the definitions, not the ids", /cloud/i.test(av.diffs.map((d) => w.MdeRollout.labelName(new Map(), d)).join(" ")) || av.diffs.some((d) => /Cloud/.test(D.getElementById("mrBody").textContent)));

  const named = S.model.newP.find((p) => /Audit and Event Logging/.test(p.name));
  ok("a policy named in the target list is new and in scope, and says why (10634)", named && /by name/.test(named.scopeWhy) && named.cats.includes("hard"));
  const audOld = S.model.oldP.find((p) => p.name === "PVM-DG-CORP-WIN-AUDIT-PRD");
  ok("…and an old audit policy setting the same setting is pulled in as a conflict", audOld && /sets a setting/.test(audOld.scopeWhy) && S.pairs.some((p) => p.N === named && p.O === audOld && p.type === "conflict"));

  // ---------------------------------------------------------- panes --
  const paneText = (p) => { w.MdeRolloutTool._pane(p); return $("mrBody").textContent; };
  ok("Conflicts groups by old policy and shows the twin", /twin of INT-SG-D-WAVE-Euro/.test(paneText("conflicts")) && /PVM-DG-CORP-ENDSEC-WIN-ASR-PRD/.test($("mrBody").textContent));
  ok("New lists the new set", /Win - OIB - ES - Defender Antivirus/.test(paneText("new")) && !/AVD - SEC/.test($("mrBody").textContent));
  ok("Old lists the old set with its retirement verdict", /PVM-DG-CORP-ENDSEC-WIN-ASR-PRD/.test(paneText("old")));
  ok("Retirement names the WHfB gap", /GAP/.test(paneText("retire")) && /WHFB/.test($("mrBody").textContent));
  const wt = paneText("waves");
  ok("Waves: the Euro pair exists; four pairs and both exclusion groups are missing", /INT-SG-U-WAVE-Euro/.test(wt) && /INT-SG-D-WAVE-Euro/.test(wt)
    && st().waveRows.filter((x) => !x.exists).length === 10 && st().waveRows.find((x) => x.name === "INT-SG-D-WAVE-Euro").exists && st().waveRows.find((x) => x.name === "INT-SG-U-WAVE-Euro").exists);
  ok("Waves groups the rows by region, then the exclusion groups", D.querySelectorAll("#mrBody tr.mr-oldhead").length === 6 && /Exclusion groups/.test(wt) && /INT-SG-D-MDE-Exclusion/.test(wt) && /INT-SG-U-MDE-Exclusion/.test(wt));
  ok("Waves says Intune does not mix user and device groups", /does not exclude a user group/.test(wt));
  ok("the device wave counts the - D - policies it is in (the named audit policy included)", /3 \/ 4/.test(D.querySelector('[data-mrwaveinc="INT-SG-D-WAVE-Euro"]').parentElement.textContent));
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

  // ------------------------------------ ⚔️ fix with the waves (10643) --
  // Mihai: "conflict with old: offer to add the wave groups to the old
  // policies" — option A (one switch, the waves by default) and "yes, same
  // plan": a wave the new policy has not got is included there too.
  w.MdeRolloutTool._pane("conflicts");
  ok("⚔️ carries the switch, on the waves, and says what goes into the new policy", !!D.querySelector('[data-mrfixwith="waves"].active') && /Proposed fix excludes/.test($("mrBody").textContent)
    && /\+ include INT-SG-D-WAVE-Euro/.test($("mrBody").textContent) && /on the new policy, in the same plan/.test($("mrBody").textContent));
  const eBox = D.querySelector(`[data-mrpair="${edgeStaged.id}"]`);
  eBox.checked = true; eBox.dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mrGroup").value = "";
  $("mrDryRun").click();
  ok("the dry run writes both sides: the wave out of the old Edge policy and into the new one", await until(() => st().plan && st().plan.changes, 10000, "wave fix plan") && st().plan.changes.length === 2
    && st().plan.changes.some((o) => /PVM-DG-DEVCONF-CORP-WIN-EDGE/.test(o.policy.name) && o.details.some((d) => d.action === "add-exclude" && d.group.displayName === "INT-SG-D-WAVE-Euro"))
    && st().plan.changes.some((o) => /Microsoft Edge - D/.test(o.policy.name) && o.details.some((d) => d.action === "add-include" && d.group.displayName === "INT-SG-D-WAVE-Euro")), st().plan && JSON.stringify(st().plan.changes.map((o) => o.policy.name)));
  $("mrDiscard").click();
  D.querySelector('[data-mrfixwith="groups"]').click();
  const edgeG = st().pairs.find((p) => p.id === edgeStaged.id);
  ok("switched to the new policy's groups: the staged pair borrows the wave, planned, as before", edgeG.proposal && !edgeG.proposal.byWaves && edgeG.proposal.steps[0].planned && st().cfg.fixWith === "groups");
  D.querySelector('[data-mrfixwith="waves"]').click();
  ok("…and back to the waves", st().cfg.fixWith === "waves" && st().pairs.find((p) => p.id === edgeStaged.id).proposal.byWaves);
  const eBox2 = D.querySelector(`[data-mrpair="${edgeStaged.id}"]`);
  if (eBox2 && eBox2.checked) { eBox2.checked = false; eBox2.dispatchEvent(new w.Event("change", { bubbles: true })); }

  // ---------------------------------------------- manual include plan --
  w.MdeRolloutTool._pane("new");
  const edgeKey = st().model.newP.find((p) => /Microsoft Edge/.test(p.name)).key;
  const pick = D.querySelector(`[data-mrpick="${edgeKey}"]`);
  pick.checked = true; pick.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the bar switches to policy mode", $("mrSelbar").classList.contains("visible") && $("mrBarPolicies").style.display === "contents");
  $("mrGroup").value = "INT-SG-U-WAVE-Euro";
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
  const wb = D.querySelector('[data-mrwave="INT-SG-U-WAVE-Americas"]');
  ok("a missing wave has a tick box", !!wb);
  wb.checked = true; wb.dispatchEvent(new w.Event("change", { bubbles: true }));
  const xb = D.querySelector('[data-mrwave="INT-SG-D-MDE-Exclusion"]');
  ok("a missing exclusion group has a tick box", !!xb);
  xb.checked = true; xb.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("create stays locked until the confirm tick", $("mrWaveCreate").disabled);
  $("mrWaveOk").checked = true; $("mrWaveOk").dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the tick unlocks create", !$("mrWaveCreate").disabled);
  $("mrWaveCreate").click();
  ok("the wave is created and read back", await until(() => st().runs.length === 2, 10000, "wave run") && /created · verified/.test(st().runs[1].lines.join(" ")));
  ok("…and now exists", st().waveRows.find((x) => x.name === "INT-SG-U-WAVE-Americas").exists);
  const exRow = st().waveRows.find((x) => x.name === "INT-SG-D-MDE-Exclusion");
  ok("the exclusion group is created in the same run, with the exclusion description", exRow.exists && /exclusion/i.test(exRow.group.description || "") && /INT-SG-D-MDE-Exclusion: created · verified/.test(st().runs[1].lines.join("\n")));
  ok("…read as a device group by its name while empty", exRow.kind === "device");
  ok("an existing exclusion group offers to exclude it from the new policies", !!D.querySelector('[data-mrexcl="INT-SG-D-MDE-Exclusion"]'));
  ok("…owned by the signed-in admin (read back)", /owner alex\.admin@contoso\.com/.test(st().runs[1].lines.join(" ")));
  ok("a second create of the same name is skipped, not duplicated", (await w.MdeRollout.createWave("INT-SG-U-WAVE-Americas", "")).skipped === true);

  // --------------------------------------- rollout actions (10633) --
  w.MdeRolloutTool._pane("waves");
  ok("the 🌊 pane leads with the three rollout actions", /Rollout actions/.test($("mrBody").textContent) && D.querySelectorAll("[data-mrroll]").length === 3);
  D.querySelector('[data-mrroll="includeWaves"]').click();
  ok("① include: a plan is cut", await until(() => st().plan, 10000, "rollout include plan"));
  ok("…the device wave into the unassigned - D - Edge policy, the others already hold it", st().plan.changes.length === 1 && /Microsoft Edge/.test(st().plan.changes[0].policy.name)
    && st().plan.changes[0].after.some((a) => a.target.groupId === "11111111-0000-4000-8000-000000000021"));
  ok("…and the waves that do not exist are left out, named", /Left out/.test($("mrPlan").textContent) && /INT-SG-D-WAVE-Americas does not exist/.test($("mrPlan").textContent));
  $("mrBackup").click(); $("mrConfirmTick").checked = true; $("mrConfirmTick").dispatchEvent(new w.Event("change"));
  $("mrApply").click();
  // (the demo's /assign is simulated and does not keep the write, so the read-back says NOT verified — as it does for every T11 write in demo)
  ok("…applied on the ledger and logged with its backup", await until(() => st().runs.length === 3, 10000, "rollout include run") && /Include the waves/.test(st().runs[2].title)
    && st().runs[2].ok + st().runs[2].bad === 1 && st().runs[2].backup.policies.length === 1 && st().runs[2].backup.action === "rollout-includeWaves");
  w.MdeRolloutTool._pane("waves");
  D.querySelector('[data-mrroll="excludeExclusion"]').click();
  ok("② exclude: the device exclusion group from the four - D - policies", await until(() => st().plan, 10000, "rollout exclusion plan")
    && st().plan.changes.length === 4 && st().plan.changes.every((o) => o.details.some((d) => d.action === "add-exclude" && d.group.displayName === "INT-SG-D-MDE-Exclusion")));
  // 10639 (Mihai: the dry run "appears at the bottom, not visible"; option A)
  ok("the plan opens right under the rollout card, not under the wave table", $("mrRollCard").nextElementSibling === $("mrPlan") && st().planAnchor === "mrRollCard");
  w.MdeRolloutTool._pane("waves");
  D.querySelector('[data-mrroll="excludeWaves"]').click();
  ok("③ the waves out of the colliding old policies — waves only", await until(() => st().plan, 10000, "rollout wave-exclusion plan")
    && st().plan.changes.length >= 1 && st().plan.changes.every((o) => o.details.filter((d) => d.change === "modify").every((d) => /-WAVE-/.test(d.group.displayName))));
  w.MdeRolloutTool._pane("waves");
  D.querySelector('[data-mrroll-region="Euro"]').click();
  ok("unticking a region narrows the actions", !!st().rollRegions && !st().rollRegions.has("Euro") && D.querySelector('[data-mrroll="excludeWaves"]').disabled);
  D.querySelector('[data-mrroll-region="Euro"]').click();
  ok("ticking it back restores every region", st().rollRegions === null);
  w.MdeRolloutTool._pane("waves");

  // --------------------------------------- 👥 wave members (10634) --
  w.MdeRolloutTool._pane("members");
  ok("the members pane starts with its own read button", !!$("mrMemRead") && /Intune primary user/.test($("mrBody").textContent));
  $("mrMemRead").click();
  ok("the members read lands", await until(() => D.querySelector("[data-mrmemregion]"), 20000, "members read"));
  const mm = () => st().mem.model;
  const mrow = (k) => mm().rows.find((r) => r.key === k);
  ok("Euro first: the table's 15 countries plus the NL-Breda pilot, 4 of them in the demo tenant", st().mem.region === "Euro" && mm().regions[0].rows.length === 16 && mm().regions[0].rows.filter((r) => r.ug).length === 4);
  ok("the NL-Breda pilot leads the Euro wave with its own device group; its overlap with NL is expected", mm().regions[0].rows[0].key === "nl-breda" && mrow("nl-breda").pilot && mrow("nl-breda").deviceGroupName === "INT-SG-D-NLD-BREDA"
    && mrow("nl-breda").devices.length === 1 && mrow("nl-breda").problems.multi === 0 && mrow("nl-breda").problems.pilot === 1 && /🧪 pilot/.test($("mrBody").textContent));
  ok("NL: INT-SG-D-NLD exists, nested in both waves, out of sync by +1 / −1", mrow("nl").dg && mrow("nl").ugNested && mrow("nl").dgNested && mrow("nl").add.length === 1 && mrow("nl").remove.length === 1 && mrow("nl").removeNames[0] === "WS-ENG-0221");
  ok("DE: two Windows devices by primary user, one stale; INT-SG-D-DEU to create", !mrow("de").dg && mrow("de").want.size === 2 && mrow("de").problems.stale === 1 && mrow("de").deviceGroupName === "INT-SG-D-DEU");
  ok("FR: a Mac-only user — no Windows device, nothing to create", mrow("fr").devices.length === 0 && mrow("fr").usersNoDevice === 1);
  ok("the Polish city groups are named POL-WAW / POL-SKARB", mrow("pol-warszawa").deviceGroupName === "INT-SG-D-POL-WAW" && mrow("pol-skarb").deviceGroupName === "INT-SG-D-POL-SKARB");
  ok("devices with no primary user are counted", mm().noPrimary === 2 && /2 of \d+ have no primary user/.test($("mrBody").textContent));
  ok("PL is not in any wave", mm().unmapped.map((u) => u.group.displayName).join() === "PVM-UG-CORP-MEM-USERS-PL");
  // 🕳 Left out (10642, Mihai: "I need a way to know who is getting left
  // out"; layout A): Sam (FR) has only a Mac; svc-legacyapp's laptop has a
  // primary user in no country group; two Windows devices have no user.
  ok("the members read covers every platform — what a user with no Windows device has", mm().leftOut.users.some((u) => u.upn === "sam@contoso.com" && u.has.macOS === 1));
  ok("the toolbar offers 🕳 Left out with its count", /🕳 Left out · 4/.test($("mrBody").textContent), (/🕳 Left out · \d+/.exec($("mrBody").textContent) || [""])[0]);
  const frRow = D.querySelector('[data-mrmemleftrow="fr"]');
  ok("a country's '1 user has none' links there", !!frRow && /1 user has none/.test(frRow.textContent));
  frRow.click();
  ok("…opening the view on that country: Sam, and his other devices", st().mem.left && st().mem.leftCountry === "fr" && /sam@contoso\.com/.test($("mrBody").textContent) && /macOS 1/.test($("mrBody").textContent) && /the user wave only/.test($("mrBody").textContent));
  ok("the devices no country holds, with the reason", /WS-SALES-0077/.test($("mrBody").textContent) && /primary user in no country group of the table/.test($("mrBody").textContent)
    && /WS-OLD-0009/.test($("mrBody").textContent) && /no primary user/.test($("mrBody").textContent));
  D.querySelector('[data-mrmemleftwhy="noPrimary"]').click();
  ok("a tile narrows the devices to its reason", st().mem.leftReason === "noPrimary" && !/WS-SALES-0077/.test($("mrBody").textContent) && /WS-OLD-0009/.test($("mrBody").textContent));
  let loCsv = null; const dl0 = w.URL.createObjectURL;
  ok("the CSV names users and devices with the reason", (() => { const c = w.MdeMembers.leftOutCsv(mm(), "Euro"); loCsv = c; return /^Kind,Region,Country,User,Device,Why/.test(c) && /user,Euro,France,sam@contoso\.com,,no Windows device.*macOS 1/.test(c) && /WS-SALES-0077,primary user in no country group/.test(c); })(), loCsv);
  D.querySelector('[data-mrmemleft]').click();
  ok("the chip again goes back to the countries", !st().mem.left && !!D.querySelector('[data-mrmemopen="nl"]'));
  D.querySelector('[data-mrmemopen="nl"]').click();
  ok("a country opens to its devices", /WS-FIN-0187/.test($("mrBody").textContent) && /no longer in PVM-UG-CORP-MEM-USERS-NL/.test($("mrBody").textContent));
  const tickMem = (k) => { const b = D.querySelector(`[data-mrmemsel="${k}"]`); b.checked = true; b.dispatchEvent(new w.Event("change", { bubbles: true })); };
  tickMem("de");
  ok("ticking a country fills the bar", /create 1 · add 2 devices · nest 2 groups into Euro/.test($("mrMemSum").textContent), $("mrMemSum").textContent);
  $("mrMemDry").click();
  ok("the dry run: create → add → nest → nest", await until(() => st().plan && st().plan.members, 5000, "members plan") && st().plan.ops.map((o) => o.type).join() === "create,add,nest,nest");
  ok("no removals, so a tick confirms", !!$("mrConfirmTick") && $("mrMemApply").disabled);
  $("mrConfirmTick").checked = true; $("mrConfirmTick").dispatchEvent(new w.Event("change"));
  $("mrMemApply").click();
  const nRuns = st().runs.length;
  ok("applied: DE's device group exists, filled, and both groups are in the Euro waves", await until(() => st().runs.length === nRuns + 1 || st().runs.some((r) => r.kind === "members"), 10000, "members run")
    && mrow("de").dg && mrow("de").inSync && mrow("de").ugNested && mrow("de").dgNested, JSON.stringify(st().runs[st().runs.length - 1].lines));
  const mrun = st().runs.filter((r) => r.kind === "members").pop();
  ok("the run is logged with every step verified", mrun.ok === 4 && mrun.bad === 0 && /INT-SG-D-DEU/.test(mrun.lines.join()));
  // undo from 📜
  w.MdeRolloutTool._pane("changes");
  D.querySelector(`[data-mrundo="${st().runs.indexOf(mrun)}"]`).click();
  ok("undo plans the reverse: take out, take out, remove the added devices", await until(() => st().plan && st().plan.members && /Undo/.test(st().plan.title), 5000, "undo plan") && st().plan.ops.map((o) => o.type).join() === "unnest,unnest,remove" && st().plan.hasRemoval);
  ok("…with the created group left in place, said", /left in place/.test($("mrPlan").textContent));
  $("mrConfirmText").value = "REMOVE"; $("mrConfirmText").dispatchEvent(new w.Event("input"));
  $("mrMemApply").click();
  ok("undone: DE is out of both waves and its group is empty again", await until(() => mrow("de").ugNested === false && mrow("de").dgNested === false && mrow("de").have.size === 0, 10000, "undo applied"));
  // removals only when ticked
  w.MdeRolloutTool._pane("members");
  tickMem("nl");
  $("mrMemRem").checked = true; $("mrMemRem").dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mrMemDry").click();
  ok("with 'apply removals' the NL plan removes the US laptop, typed REMOVE required", await until(() => st().plan && st().plan.members, 5000, "nl plan") && st().plan.ops.some((o) => o.type === "remove" && /WS-ENG-0221/.test(o.label)) && !!$("mrConfirmText"));
  $("mrDiscard").click();
  $("mrMemRem").checked = false; $("mrMemRem").dispatchEvent(new w.Event("change", { bubbles: true }));
  D.querySelector('[data-mrmemregion="Americas"]').click();
  ok("Americas: the US row, and no device wave for it yet", st().mem.region === "Americas" && mrow("us").ug && mrow("us").wave.device === null && /no wave group/.test($("mrBody").textContent));
  D.querySelector("[data-mrmemunmapped]").click();
  ok("the 'not in any wave' list offers 🧪 Add as pilot, with the device group it would get", /not in the country table/.test($("mrBody").textContent) && !!D.querySelector('[data-mrmempilot="PL"]') && /INT-SG-D-POL/.test($("mrBody").textContent));
  D.querySelector('[data-mrmempilot="PL"]').click();
  ok("adding PL as a pilot puts it first in the chosen wave, starred, selected, and kept for the tenant", st().mem.region === "Euro" && mm().regions[0].rows[0].key === "pl" && mrow("pl").pilot && st().mem.sel.has("pl")
    && st().cfg.members.pilots.includes("PL") && !mm().unmapped.length);

  // ------------------------------------------------ 📑 reports (10635) --
  // 10638 (option A off the mockup): the rail is back; the three reports
  // are its child nodes, each with its state; no second column, no tabs.
  ok("one navigation: the rail, with the three reports as child nodes and no top tabs", D.querySelectorAll(".ep-rail [data-mrreport]").length === 3
    && !D.querySelector(".mr-tabs, .mr-subtabs, .mr-report-list") && /0 of 3/.test(D.querySelector('[data-mrpane="reports"]').textContent)
    && [...D.querySelectorAll(".mr-rep-state")].every((x) => /not generated/.test(x.textContent)));
  const railOrder = [...D.querySelectorAll(".ep-rail [data-mrpane], .ep-rail [data-mrreport]")].map((x) => x.dataset.mrpane || "·" + x.dataset.mrreport);
  ok("…placed right under 📑 Reports", railOrder.indexOf("reports") >= 0 && railOrder.slice(railOrder.indexOf("reports") + 1, railOrder.indexOf("reports") + 4).join() === "·assign,·config,·conflicts");
  ok("…and every pane keeps its count in view", /\d/.test(D.querySelector('[data-mrpane="new"]').textContent) && /\d/.test(D.querySelector('[data-mrpane="old"]').textContent) && /\d/.test(D.querySelector('[data-mrpane="out"]').textContent));
  D.querySelector('[data-mrreport="config"]').dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok("a report node opens its report from the keyboard, straight into the main column", st().pane === "reports" && st().reps.selected === "config" && !!$("mrRep_config")
    && D.querySelector('[data-mrreport="config"]').classList.contains("active") && D.querySelector('[data-mrpane="reports"]').classList.contains("mr-open"));
  D.querySelector('[data-mrreport="assign"]').click();
  w.MdeRolloutTool._pane("reports");
  ok("reports offers three persistent choices and only one generator", D.querySelectorAll("[data-mrreport]").length === 3 && !!$("mrRep_assign") && !$("mrRep_config") && !$("mrRep_conflicts"));
  $("mrRep_assign").click();
  const R = () => st().reps;
  ok("the assignments report: a coverage matrix on the screen, HTML and CSV to take away", !!R().assign && /Coverage — waves per policy/.test(R().assign.html) && /INT-SG-D-WAVE-Euro/.test(R().assign.html)
    && R().assign.csv.startsWith("Policy,Generation,For,Type,Categories,Assignment,Target") && /Coverage — waves per policy/.test($("mrBody").textContent) && !!D.querySelector('[data-mrrep="assign"][data-mrrepfmt="csv"]'));
  const euroCol = R().assign.cov.regions.indexOf("Euro");
  const avCov = R().assign.cov.rows.find((x) => /Defender Antivirus - D - AV/.test(x.P.name));
  ok("…where the new AV policy includes the Euro device wave", euroCol >= 0 && avCov.cells[euroCol].inc.join() === "device");
  ok("…and each group carries its role in the rollout", /🌊 Euro device wave/.test(R().assign.csv));
  const coverageGroups = [...D.querySelectorAll(".mr-report-group")];
  ok("coverage keeps new policies visible and folds old policies without dropping their rows", coverageGroups.length === 2 && coverageGroups[0].open && !coverageGroups[1].open
    && coverageGroups[0].querySelectorAll("tr").length === st().model.newP.length + 1 && coverageGroups[1].querySelectorAll("tr").length === st().model.oldP.length + 1);
  const savedAssign = R().assign;
  D.querySelector('[data-mrreport="config"]').click();
  ok("switching reports preserves the saved assignment snapshot and hides its preview", R().assign === savedAssign && !D.querySelector('[data-report-preview="assign"]') && !!$("mrRep_config"));
  $("mrRep_config").click();
  ok("the configuration report: rules, groups with owners, members, settings, retirement, this session's changes", await until(() => R().config, 10000, "config report")
    && ["1 · Rules", "2 · Wave and exclusion groups", "3 · Wave members", "4 · New policies", "5 · Old policies", "7 · Changes this session"].every((h) => R().config.html.includes(h))
    && /alex\.admin@contoso\.com/.test(R().config.html) && /INT-SG-D-NLD/.test(R().config.html) && /Win - OIB - SC - Device Security - D - Audit and Event Logging/.test(R().config.html), R().config && R().config.html.length);
  ok("…with every setting in its CSV", R().config.csv.startsWith("Policy,Generation,Type,Setting,Value") && R().config.csv.split("\r\n").length > 10);
  ok("configuration preview retains all seven report sections and no document styles", D.querySelectorAll('[data-report-preview="config"] > .mr-report-section').length === 7 && !D.querySelector('[data-report-preview] style'));
  ok("configuration has an inline preview with full names and separate timestamps", !!D.querySelector('[data-report-preview="config"]') && /Owners attempted/.test($("mrBody").textContent) && R().config.readAt === st().model.readAt);
  D.querySelector('[data-mrreport="conflicts"]').click();
  $("mrRep_conflicts").click();
  ok("the report selector remains available during a fresh check and prevents concurrent refresh", D.querySelectorAll("[data-mrreport]").length === 3 && $("mrRun").disabled);
  ok("the conflict check reads the tenant fresh and counts what needs action", await until(() => R().conflicts, 30000, "conflict check") && R().conflicts.summary.act > 0 && R().checks.length === 1 && /conflict check/i.test(R().conflicts.html) && st().pane === "reports");
  ok("the rail says how many need action, on the conflict check's own node", /\d+ to act/.test(D.querySelector('[data-mrreport="conflicts"]').textContent)
    && D.querySelector('[data-mrreport="conflicts"] .mr-rep-state').classList.contains("gap") && /[23] of 3/.test(D.querySelector('[data-mrpane="reports"]').textContent));
  D.querySelector('[data-mrreport="assign"]').click();
  ok("…and the rail marks the older report for regenerating", /regenerate/.test(D.querySelector('[data-mrreport="assign"]').textContent));
  ok("an older report is marked stale after a fresh check and retains its original data", /saved report predates/.test($("mrBody").textContent) && R().assign === savedAssign && R().assign.html === savedAssign.html);
  D.querySelector('[data-mrreport="conflicts"]').click();
  const before = R().conflicts.summary.act;
  $("mrRep_conflicts").click();
  ok("a second check says what moved since the first", await until(() => R().checks.length === 2, 30000, "second check") && R().conflicts.diff && Array.isArray(R().conflicts.diff.fixed) && R().conflicts.summary.act === before && /Since the check at/.test($("mrBody").textContent));

  const savedConflict = R().conflicts;
  const refresh = w.PolicyCache.refresh;
  w.PolicyCache.refresh = async () => { throw new Error("simulated read failure"); };
  $("mrRep_conflicts").click();
  await until(() => !R().busy, 10000, "failed check");
  ok("a failed fresh read keeps the old report and does not add a successful check", R().conflicts === savedConflict && R().checks.length === 2 && /Fresh read failed/.test($("mrBody").textContent));
  w.PolicyCache.refresh = refresh;

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
  ok("rules show the country table (pilot starred) and the device-group suffixes", /Euro: \*NL-Breda, GB, BE, NL/.test($("mrRuleMap").value) && /POL-Warszawa = POL-WAW/.test($("mrRuleSfx").value) && /Delivery Optimisation/.test($("mrRuleAlso").value));
  ok("rules show the regions and the four group-name fields", /Euro/.test($("mrRuleWaves").value) && $("mrRuleDgPre").value === "INT-SG-D-WAVE-" && $("mrRuleExU").value === "INT-SG-U-MDE-Exclusion");

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

  // --------------------------------------- rename to INT-SG (10635) --
  w.MdeRolloutTool._pane("waves");
  const amD = () => st().waveRows.find((x) => x.name === "INT-SG-D-WAVE-Americas");
  ok("the Americas device wave is found under its old name, offered for rename", amD().legacy && amD().legacy.name === "PVM-DG-MDE-WAVE-Americas" && /old name/.test($("mrBody").textContent) && !!D.querySelector('[data-mrrename="INT-SG-D-WAVE-Americas"]'));
  ok("the rail says there are groups to rename (the Americas device wave and the user exclusion group)", /2 to rename/.test(D.querySelector('[data-mrpane="waves"]').textContent));
  const exU = () => st().waveRows.find((x) => x.name === "INT-SG-U-MDE-Exclusion");
  ok("the user exclusion group is found under its old name too", exU().legacy && exU().legacy.name === "PVM-UG-MDE-Exclusion" && !!D.querySelector('[data-mrrename="INT-SG-U-MDE-Exclusion"]'));
  const rnx = D.querySelector('[data-mrrename="INT-SG-U-MDE-Exclusion"]'); rnx.checked = true; rnx.dispatchEvent(new w.Event("change", { bubbles: true }));
  const rnb = D.querySelector('[data-mrrename="INT-SG-D-WAVE-Americas"]'); rnb.checked = true; rnb.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("rename stays locked until its own tick", $("mrRenameGo").disabled);
  $("mrRenameOk").checked = true; $("mrRenameOk").dispatchEvent(new w.Event("change", { bubbles: true }));
  const nr = st().runs.length;
  $("mrRenameGo").click();
  ok("renamed in the tenant: the same objects, the new names, read back", await until(() => st().runs.length === nr + 1, 10000, "rename run") && amD().exists && amD().id === "11111111-0000-4000-8000-000000000036"
    && exU().exists && exU().id === "11111111-0000-4000-8000-000000000037" && st().runs[nr].ok === 2 && /renamed · verified/.test(st().runs[nr].lines.join()));
  w.MdeRolloutTool._pane("changes");
  D.querySelector(`[data-mrrenback="${nr}"]`).click();
  ok("📜 renames them back", await until(() => st().runs.length === nr + 2, 10000, "rename back") && amD().legacy && !amD().exists && exU().legacy && /back/.test(st().runs[nr + 1].title));
  w.MdeRolloutTool._pane("waves");

  // ------------------------------------------------ ⊘ exclusions (10639) --
  // Mihai: "search a user or device, get both info, and get offered to be
  // added to the 2 exclusion groups". Layout A: the header button opens the
  // rail pane. The user exclusion group is still under its old name here
  // (renamed back above) and Nina is in it — her Windows laptop is not.
  ok("the header button is there once the tenant is read", $("mrExclude") && !$("mrExclude").hidden);
  $("mrExclude").click();
  ok("it opens ⊘ Exclusions and reads the exclusion groups and devices", st().pane === "exclusions" && await until(() => st().ex.base, 10000, "exclusion base") && !!$("mrExQ"));
  ok("the rail says one user is half-excluded", /1 half/.test(D.querySelector('[data-mrpane="exclusions"]').textContent) && D.querySelector('[data-mrpane="exclusions"] .ep-n').classList.contains("gap"));
  ok("Excluded now: Nina, half — her laptop still gets the - D - policies, with + add device", /Excluded now/.test($("mrExNow").textContent) && /Nina Nieuw/.test($("mrExNow").textContent)
    && /half: the - D - policies still reach WS-ENG-0308/.test($("mrExNow").textContent) && !!D.querySelector("[data-mrexfix]"));
  $("mrExQ").value = "eva"; $("mrExQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  $("mrExQ").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok("Enter searches: Eva the user, by name", await until(() => st().ex.results && st().ex.results.some((r) => r.type === "user" && r.displayName === "Eva Employee"), 10000, "search eva"));
  const evaHit = st().ex.results.findIndex((r) => r.type === "user" && r.displayName === "Eva Employee");
  D.querySelector(`[data-mrexpick="${evaHit}"]`).click();
  ok("picking her reads both sides: the user and her Windows laptop", await until(() => st().ex.card && !st().ex.cardLoading, 10000, "eva card")
    && st().ex.card.user.upn === "eva@contoso.com" && st().ex.card.devices.map((d) => d.name).join() === "WS-FIN-0142");
  const evaDev = st().ex.card.devices[0];
  ok("…ticked by default: Eva and the laptop", st().ex.ticks.has(`u:${st().ex.card.user.id}`) && st().ex.ticks.has(evaDev.key));
  ok("…the card names her country group, her wave and the laptop's device group", /PVM-UG-CORP-MEM-USERS-NL/.test($("mrExCard").textContent) && /INT-SG-D-NLD/.test($("mrExCard").textContent) && /🌊 Euro/.test($("mrExCard").textContent));
  ok("what reaches them, before and after — the laptop goes back on the old set", /What reaches them/.test($("mrExCard").textContent) && /out of INT-SG-D-NLD — leaves the wave, back on the old set/.test($("mrExCard").textContent));
  $("mrExDry").click();
  ok("the dry run: the user into the user group, the laptop into the device group, then out of INT-SG-D-NLD",
    !!st().plan && st().plan.exclusions && st().plan.ops.length === 3 && st().plan.ops[0].group.name === "PVM-UG-MDE-Exclusion" && st().plan.ops[1].group.name === "INT-SG-D-MDE-Exclusion" && st().plan.ops[2].type === "remove" && st().plan.ops[2].group.name === "INT-SG-D-NLD");
  ok("…and it opens under the card, above Excluded now", $("mrExCard").nextElementSibling === $("mrPlan") && /Who/.test($("mrPlan").textContent) && /Eva Employee/.test($("mrPlan").textContent));
  ok("an exclusion is an addition: a tick, not a typed REMOVE", !!$("mrConfirmTick") && !$("mrConfirmText"));
  $("mrConfirmTick").checked = true; $("mrConfirmTick").dispatchEvent(new w.Event("change"));
  const xr = st().runs.length;
  $("mrMemApply").click();
  ok("applied and read back: three steps verified, on 📜", await until(() => st().runs.length === xr + 1, 10000, "exclusion run") && st().runs[xr].ok === 3 && st().runs[xr].exclusions);
  const demoG = (n) => w.TUNO_DEMO_GRAPH.T.GROUPS.find((g) => g.id === `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`);
  ok("in the tenant: Eva in the user group, the laptop in the device group and out of INT-SG-D-NLD", demoG(37)._users.includes("22222222-0000-4000-8000-000000000002")
    && w.TUNO_DEMO_GRAPH.T.GROUPS.find((g) => g.displayName === "INT-SG-D-MDE-Exclusion")._devices.includes("33333333-0000-4000-8000-000000000101") && !demoG(35)._devices.includes("33333333-0000-4000-8000-000000000101"));
  ok("the lists move with the run, and the card reads again", await until(() => st().ex.card && !st().ex.cardLoading && st().ex.card.user.excluded, 10000, "card again")
    && st().ex.base.users.length === 2 && st().ex.base.devices.length === 1 && /Eva Employee/.test($("mrExNow").textContent));
  w.MdeRolloutTool._pane("changes");
  D.querySelector(`[data-mrundo="${xr}"]`).click();
  ok("📜 undo: the inverse, a typed REMOVE", await until(() => st().plan && /Undo/.test(st().plan.title), 10000, "undo plan") && st().plan.exclusions && !!$("mrConfirmText") && st().plan.ops.length === 3);
  $("mrConfirmText").value = "REMOVE"; $("mrConfirmText").dispatchEvent(new w.Event("input"));
  $("mrMemApply").click();
  ok("…and the tenant is back as it was", await until(() => st().runs.length === xr + 2, 10000, "undo run") && !demoG(37)._users.includes("22222222-0000-4000-8000-000000000002") && demoG(35)._devices.includes("33333333-0000-4000-8000-000000000101")
    && st().ex.base.users.length === 1 && st().ex.base.devices.length === 0);
  // Excluded now → take out (Nina)
  w.MdeRolloutTool._pane("exclusions");
  const nsel = D.querySelector("[data-mrexsel]"); nsel.checked = true; nsel.dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mrExRemDry").click();
  ok("taking a row out is a typed removal, planned under Excluded now", !!st().plan && st().plan.hasRemoval && st().plan.ops[0].fromExclusion && $("mrExNow").nextElementSibling === $("mrPlan") && !!$("mrConfirmText"));
  $("mrDiscard").click();

  // ------------------------------------------- ⚙️ leave out (10639) --
  w.MdeRolloutTool._pane("rules");
  ok("the rules have a Leave-out box beside Also-in", !!$("mrRuleLeave") && /Leave out of the target list/.test($("mrBody").textContent));
  const avName = st().model.newP.find((P) => /Defender Antivirus - D - AV/.test(P.name)).name;
  $("mrRuleLeave").value = avName;
  $("mrRuleSave").click();
  ok("a policy left out by name is out of scope, marked ➖", await until(() => st().model.outP.some((P) => P.name === avName), 5000, "left out") && !st().model.newP.some((P) => P.name === avName));
  w.MdeRolloutTool._pane("out");
  ok("…and the 🚫 pane says why", /➖ left out by name/.test($("mrBody").textContent));
  w.MdeRolloutTool._pane("rules");
  $("mrRuleLeave").value = ""; $("mrRuleSave").click();
  ok("clearing the box brings it back", await until(() => st().model.newP.some((P) => P.name === avName), 5000, "back in"));

  // ------------------------------------------ 🧪 pilot batches (10640) --
  // Mihai: "split the adding of the pilot group in 4 even batches of users
  // and devices" — option A. The demo's Breda group is given four more
  // users for this (Eva is in the wave through NL already).
  const TT = w.TUNO_DEMO_GRAPH.T;
  TT.GROUPS.find((g) => g.displayName === "PVM-UG-CORP-MEM-USERS-NL-Breda")._users = ["22222222-0000-4000-8000-000000000001", "22222222-0000-4000-8000-000000000002",
    "22222222-0000-4000-8000-000000000004", "22222222-0000-4000-8000-000000000005", "22222222-0000-4000-8000-000000000007"];
  w.MdeRolloutTool._pane("members");
  $("mrMemRead").click();
  ok("the members read again", await until(() => st().mem.model && !st().mem.loading && D.querySelector("[data-mrmemregion]"), 20000, "members re-read"));
  const br = () => st().mem.model.rows.find((r) => r.key === "nl-breda");
  ok("NL-Breda is added in batches: four users to batch in four parts, Eva already in through NL", br().batch && br().batch.N === 4 && br().batch.sizes.join() === "1,1,1,1" && br().batch.inOther === 1 && br().batch.next.n === 1);
  ok("the row says it", /🧪 pilot · in batches/.test($("mrBody").textContent) && /0 of 4 users/.test($("mrBody").textContent));
  D.querySelector('[data-mrmemopen="nl-breda"]').click();
  ok("the pilot row opens on its batch panel", !!$("mrBatch-nl-breda") && /Pilot in 4 batches/.test($("mrBatch-nl-breda").textContent) && !!D.querySelector('[data-mrbatch="nl-breda"]'));
  D.querySelector('[data-mrbatch="nl-breda"]').click();
  ok("batch 1 → dry run: Alex into the user wave, INT-SG-D-NLD-BREDA created, filled with his laptop and nested", !!st().plan && st().plan.ops.map((o) => o.type).join() === "add,create,add,nest"
    && st().plan.ops[0].group.name === "INT-SG-U-WAVE-Euro" && st().plan.ops[0].ids.join() === "22222222-0000-4000-8000-000000000001" && st().plan.ops[1].name === "INT-SG-D-NLD-BREDA"
    && st().plan.ops[2].ids.join() === "33333333-0000-4000-8000-000000000107");
  ok("…and the plan opens under the batch panel", $("mrBatch-nl-breda").nextElementSibling === $("mrPlan") && /batch 1 of 4/.test($("mrPlan").textContent));
  $("mrConfirmTick").checked = true; $("mrConfirmTick").dispatchEvent(new w.Event("change"));
  const brun = st().runs.length;
  $("mrMemApply").click();
  ok("applied: every step done and verified", await until(() => st().runs.length === brun + 1, 15000, "batch run") && st().runs[brun].ok === 4, st().runs[brun] && st().runs[brun].lines.join(" | "));
  const brG = () => TT.GROUPS.find((g) => g.displayName === "INT-SG-D-NLD-BREDA");
  ok("in the tenant: Alex a direct member of the user wave; the new device group holds his laptop and sits in the device wave",
    (TT.GROUPS.find((g) => g.displayName === "INT-SG-U-WAVE-Euro")._users || []).includes("22222222-0000-4000-8000-000000000001")
    && brG() && brG()._devices.includes("33333333-0000-4000-8000-000000000107") && brG().memberOf.includes("11111111-0000-4000-8000-000000000021"));
  ok("the panel moves on: 1 of 4 in, batch 2 next", br().batch.inCount === 1 && br().batch.batches[0].state === "in" && br().batch.next.n === 2);
  ok("the regular sync would not nest the pilot group while it is batched", w.MdeMembers.planOps(st().mem.model, new Set(["nl-breda"]), { fill: true, nestUsers: true, nestDevices: true }, st().cfg.members).skipped.some((x) => /added in batches/.test(x)));
  const tg = D.querySelector('[data-mrbatchtoggle="NL-Breda"]'); tg.checked = false; tg.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the batches can be switched off for a pilot (kept per tenant)", br().batch === null && !st().cfg.members.batched.includes("NL-Breda"));
  const tg2 = D.querySelector('[data-mrbatchtoggle="NL-Breda"]'); tg2.checked = true; tg2.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("…and on again, with the progress intact", br().batch && br().batch.inCount === 1);

  // ------------------------------------------------------- exports --
  const md = w.MdeRollout.markdown(st().model, st().pairs, st().retire, st().waveRows, { tenant: "Contoso" });
  ok("the markdown export carries the four sections", /## Wave and exclusion groups/.test(md) && /## New policies/.test(md) && /## Old policies colliding/.test(md) && /## Retirement check/.test(md));

  // ------------------------------------------- the offer, cold (10644) --
  const heldGet = w.PolicyCache.get, heldReading = w.PolicyCache.reading, rf = w.PolicyCache.refresh;
  let fresh = 0;
  w.PolicyCache.refresh = (...a) => { fresh++; return rf(...a); };
  w.PolicyCache.get = () => null; w.PolicyCache.reading = () => false;
  w.dispatchEvent(new w.Event("tuno:signout"));
  w.TunoScreenHooks["screen-mderollout"]();
  ok("cold, with no read held: only ↻ Read the tenant is offered", !!offer() && !!offer().querySelector('[data-mrread="fresh"]') && !offer().querySelector('[data-mrread="attach"]') && fresh === 0);
  w.PolicyCache.reading = () => true;
  w.TunoScreenHooks["screen-mderollout"]();
  ok("while the sign-in read still runs, it offers to wait for it", /Wait for the sign-in read/.test(offer().textContent) && fresh === 0);
  w.PolicyCache.get = heldGet; w.PolicyCache.reading = heldReading;
  offer().querySelector('[data-mrread="fresh"]').click();
  ok("↻ Read the tenant in the offer reads the tenant fresh", await until(() => $("mrBody").querySelector(".ep-rail"), 30000, "fresh rail") && fresh === 1 && !offer());
  w.PolicyCache.refresh = rf;
}

run().then(() => {
  console.log(`mderollout-screen: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
}).catch((e) => { console.error(e); process.exit(1); });

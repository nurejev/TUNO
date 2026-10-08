// T28 — MDE rollout screen (build 10632; since 10661 the V2 screen of 10660,
// MdeRolloutV2Tool with its mv* ids — the original screen's suite, ported
// check for check, plus V2's gates answered where a plan asks for them),
// driven end to end in DEMO mode:
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
  const offer = () => $("mvBody").querySelector(".mr-offer");
  // V2's gates (10660; the only T28 screen since 10661): a plan that excludes
  // or removes on an old policy whose retirement is not proven, or lowers an
  // ASR mode, asks for a recorded risk decision (a reason of 20+ characters
  // and the accept tick); a member plan also asks for the group backup
  // download before Apply. v2Gates() answers whichever the plan asks for.
  async function v2Gates() {
    const r = $("mvRiskReason"), t = $("mvRiskAccept");
    if (r && t && !t.checked) {
      r.value = "Accepted by the headless suite for this demo plan.";
      r.dispatchEvent(new w.Event("input", { bubbles: true }));
      t.checked = true; t.dispatchEvent(new w.Event("change", { bubbles: true }));
    }
    const b = $("mvMemberBackup"), a = $("mvMemApply");
    if (b && a && a.disabled && !b.disabled) { b.click(); await until(() => !$("mvMemApply") || !$("mvMemApply").disabled, 10000, "group backup"); }
  }
  const idle = () => until(() => { const s = w.MdeRolloutV2Tool._state(); return s.model && !s.running && !s.busy && !s.enriching && !s.project.starting && !s.project.task && !s.project.timer && !s.reps.busy; }, 30000, "idle");
  await until(() => w.MdeRolloutV2Tool._state().project.attempted.size === 4, 30000, "automatic sources");
  await idle();
  ok("opening attaches the sign-in read automatically", !!w.MdeRolloutV2Tool._state().model && reads.refresh === 0 && !offer(), JSON.stringify(reads));
  ok("five project areas replace the flat rail", D.querySelectorAll(".mr-navigation > [data-mrpane]").length === 5);
  w.TunoScreenHooks["screen-mderollout"](); await idle();
  ok("reopening keeps the current read", reads.refresh === 0 && !!w.MdeRolloutV2Tool._state().model);
  w.PolicyCache.refresh = realRefresh; w.PolicyCache.read = realRead;
  // 10642 (Mihai: "should be default excluded with the option to include if
  // needed"): the demo's one-rule ASR policy is on the default leave-out
  // list — 🚫 shows it with ➕ include, which puts it back in scope. The
  // rest of this suite works with it included.
  const stE = () => w.MdeRolloutV2Tool._state();
  const ASR = "WIN-SEC-AttackSurfaceReduction-D-02_Block execution of potentially obfuscated scripts-v1.0";
  ok("by default the ASR one-rule policy is out of scope, left out by name", stE().model.outP.some((P) => P.name === ASR && P.outWhy) && !stE().model.newP.some((P) => P.name === ASR) && stE().cfg.leaveOut.length === 78);
  w.MdeRolloutV2Tool._pane("out");
  ok("🚫 marks it and offers ➕ include", /➖ left out by name/.test($("mvBody").textContent) && !!D.querySelector(`[data-mrinclude="${ASR}"]`));
  D.querySelector(`[data-mrinclude="${ASR}"]`).click();
  ok("➕ include: back among the new policies, off the list for this tenant", stE().model.newP.some((P) => P.name === ASR) && stE().cfg.leaveOut.length === 77 && !stE().cfg.leaveOut.includes(ASR));
  w.MdeRolloutV2Tool._pane("conflicts");
  // enrichment (kinds, labels) follows the first paint
  ok("group kinds and setting names settle", await until(() => !/⏳/.test(($("mvEnrich") || { textContent: "" }).textContent) && w.MdeRolloutV2Tool._state().pairs.some((p) => p.proposal && p.proposal.steps.some((s) => s.kind === "user")), 30000, "enrich"));
  const st = () => w.MdeRolloutV2Tool._state();
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
  ok("setting names come from the definitions, not the ids", /cloud/i.test(av.diffs.map((d) => w.MdeRollout.labelName(new Map(), d)).join(" ")) || av.diffs.some((d) => /Cloud/.test(D.getElementById("mvBody").textContent)));

  const named = S.model.newP.find((p) => /Audit and Event Logging/.test(p.name));
  ok("a policy named in the target list is new and in scope, and says why (10634)", named && /by name/.test(named.scopeWhy) && named.cats.includes("hard"));
  const audOld = S.model.oldP.find((p) => p.name === "PVM-DG-CORP-WIN-AUDIT-PRD");
  ok("…and an old audit policy setting the same setting is pulled in as a conflict", audOld && /sets a setting/.test(audOld.scopeWhy) && S.pairs.some((p) => p.N === named && p.O === audOld && p.type === "conflict"));

  // ---------------------------------------------------------- panes --
  const paneText = (p) => { w.MdeRolloutV2Tool._pane(p); return $("mvBody").textContent; };
  ok("Conflicts groups by old policy and shows the twin", /twin of INT-SG-D-WAVE-Euro/.test(paneText("conflicts")) && /PVM-DG-CORP-ENDSEC-WIN-ASR-PRD/.test($("mvBody").textContent));
  ok("New lists the new set", /Win - OIB - ES - Defender Antivirus/.test(paneText("new")) && !/AVD - SEC/.test($("mvBody").textContent));
  ok("Old lists the old set with its retirement verdict", /PVM-DG-CORP-ENDSEC-WIN-ASR-PRD/.test(paneText("old")));
  ok("Retirement names the WHfB gap", /GAP/.test(paneText("retire")) && /WHFB/.test($("mvBody").textContent));
  const wt = paneText("waves");
  ok("Waves: the Euro pair exists; four pairs and both exclusion groups are missing", /INT-SG-U-WAVE-Euro/.test(wt) && /INT-SG-D-WAVE-Euro/.test(wt)
    && st().waveRows.filter((x) => !x.exists).length === 10 && st().waveRows.find((x) => x.name === "INT-SG-D-WAVE-Euro").exists && st().waveRows.find((x) => x.name === "INT-SG-U-WAVE-Euro").exists);
  ok("Waves groups the rows by region, then the exclusion groups", D.querySelectorAll("#mvBody tr.mr-oldhead").length === 6 && /Exclusion groups/.test(wt) && /INT-SG-D-MDE-Exclusion/.test(wt) && /INT-SG-U-MDE-Exclusion/.test(wt));
  ok("Waves says Intune does not mix user and device groups", /does not exclude a user group/.test(wt));
  ok("the device wave counts the - D - policies it is in (the named audit policy included)", /3 \/ 4/.test(D.querySelector('[data-mrwaveinc="INT-SG-D-WAVE-Euro"]').parentElement.textContent));
  ok("Out of scope lists AVD", /AVD - SEC - Defender Antivirus/.test(paneText("out")));
  ok("Rules shows the three prefixes", /WIN-SEC/.test($("mvBody").querySelector("#mvRuleNew") ? $("mvRuleNew").value : paneText("rules")));
  ok("How it works cites the support matrix", /support matrix/.test(paneText("how")));

  // ---------------------------------------------- fix: dry run → apply --
  w.MdeRolloutV2Tool._pane("conflicts");
  const box = D.querySelector(`[data-mrpair="${asr.id}"]`);
  ok("a supported fix has a tick box", !!box);
  ok("the device-wave fix on the old AV policy has one too", !!D.querySelector(`[data-mrpair="${av.id}"]`));
  box.checked = true; box.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the bar appears in fix mode", $("mvSelbar").classList.contains("visible") && /1 fix selected/.test($("mvSelCount").textContent) && $("mvBarFixes").style.display !== "none");
  $("mvDryRun").click();
  ok("the dry run renders a plan", await until(() => $("mvApply") || /Nothing writable/.test($("mvPlan").textContent), 10000, "plan"));
  const plan = st().plan;
  ok("the plan excludes the wave from the old ASR policy", plan && plan.changes.length === 1 && plan.changes[0].after.some((a) => /exclusion/i.test(a.target["@odata.type"])));
  ok("apply is locked before the backup", $("mvApply").disabled);
  $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  ok("…and still locked with only the tick", $("mvApply").disabled);
  $("mvBackup").click();
  ok("V2 asks for a risk decision before excluding on an old policy whose retirement is not proven", !!$("mvRiskReason") && $("mvApply").disabled);
  await v2Gates();
  ok("backup + tick + the recorded risk decision unlock apply", !$("mvApply").disabled);
  await v2Gates(); $("mvApply").click();
  ok("the run lands in the session log", await until(() => st().runs.length === 1, 10000, "run"));
  ok("the ledger rendered one row per policy", $("mvLedger").querySelectorAll(".rl-row").length === 1 || $("mvPlan").querySelectorAll(".rl-row").length === 1);
  ok("the run records its backup", st().runs[0].backup.policies.length === 1 && st().runs[0].backup.tool === "TUNO T28 MDE rollout");

  // ------------------------------------ ⚔️ fix with the waves (10643) --
  // Mihai: "conflict with old: offer to add the wave groups to the old
  // policies" — option A (one switch, the waves by default) and "yes, same
  // plan": a wave the new policy has not got is included there too.
  w.MdeRolloutV2Tool._pane("conflicts");
  ok("⚔️ carries the switch, on the waves, and says what goes into the new policy", !!D.querySelector('[data-mrfixwith="waves"].active') && /Proposed fix excludes/.test($("mvBody").textContent)
    && /\+ include INT-SG-D-WAVE-Euro/.test($("mvBody").textContent) && /on the new policy, in the same plan/.test($("mvBody").textContent));
  const eBox = D.querySelector(`[data-mrpair="${edgeStaged.id}"]`);
  eBox.checked = true; eBox.dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mvGroup").value = "";
  $("mvDryRun").click();
  ok("the dry run writes both sides: the wave out of the old Edge policy and into the new one", await until(() => st().plan && st().plan.changes, 10000, "wave fix plan") && st().plan.changes.length === 2
    && st().plan.changes.some((o) => /PVM-DG-DEVCONF-CORP-WIN-EDGE/.test(o.policy.name) && o.details.some((d) => d.action === "add-exclude" && d.group.displayName === "INT-SG-D-WAVE-Euro"))
    && st().plan.changes.some((o) => /Microsoft Edge - D/.test(o.policy.name) && o.details.some((d) => d.action === "add-include" && d.group.displayName === "INT-SG-D-WAVE-Euro")), st().plan && JSON.stringify(st().plan.changes.map((o) => o.policy.name)));
  $("mvDiscard").click();
  D.querySelector('[data-mrfixwith="groups"]').click();
  const edgeG = st().pairs.find((p) => p.id === edgeStaged.id);
  ok("switched to the new policy's groups: the staged pair borrows the wave, planned, as before", edgeG.proposal && !edgeG.proposal.byWaves && edgeG.proposal.steps[0].planned && st().cfg.fixWith === "groups");
  D.querySelector('[data-mrfixwith="waves"]').click();
  ok("…and back to the waves", st().cfg.fixWith === "waves" && st().pairs.find((p) => p.id === edgeStaged.id).proposal.byWaves);
  const eBox2 = D.querySelector(`[data-mrpair="${edgeStaged.id}"]`);
  if (eBox2 && eBox2.checked) { eBox2.checked = false; eBox2.dispatchEvent(new w.Event("change", { bubbles: true })); }

  // ---------------------------------------------- manual include plan --
  w.MdeRolloutV2Tool._pane("new");
  const edgeKey = st().model.newP.find((p) => /Microsoft Edge/.test(p.name)).key;
  const pick = D.querySelector(`[data-mrpick="${edgeKey}"]`);
  pick.checked = true; pick.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the bar switches to policy mode", $("mvSelbar").classList.contains("visible") && $("mvBarPolicies").style.display === "contents");
  $("mvGroup").value = "INT-SG-U-WAVE-Euro";
  $("mvDryRun").click();
  ok("an include plan is cut", await until(() => st().plan && st().plan.changes.length === 1, 10000, "include plan"));
  ok("…warning that a - D - policy is given a user group", /the device wave is the one meant for it/.test($("mvPlan").textContent));
  ok("the include targets the wave group", st().plan.changes[0].after.some((a) => a.target.groupId && /groupAssignmentTarget/.test(a.target["@odata.type"])));
  // a removal plan asks for the typed word
  D.querySelector('#mvActSeg [data-mract="remove"]').click();
  $("mvDryRun").click();
  await until(() => st().plan, 10000, "remove plan");
  ok("removing a group that is not assigned is a no-op, never a write", st().plan.changes.length === 0 && st().plan.noops.length === 1);
  D.querySelector('#mvActSeg [data-mract="add-include"]').click();
  $("mvSelClear").click();
  ok("clearing the selection hides the bar", !$("mvSelbar").classList.contains("visible"));

  // -------------------------------------------------- create waves --
  w.MdeRolloutV2Tool._pane("waves");
  const wb = D.querySelector('[data-mrwave="INT-SG-U-WAVE-Americas"]');
  ok("a missing wave has a tick box", !!wb);
  wb.checked = true; wb.dispatchEvent(new w.Event("change", { bubbles: true }));
  const xb = D.querySelector('[data-mrwave="INT-SG-D-MDE-Exclusion"]');
  ok("a missing exclusion group has a tick box", !!xb);
  xb.checked = true; xb.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("create stays locked until the confirm tick", $("mvWaveCreate").disabled);
  $("mvWaveOk").checked = true; $("mvWaveOk").dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the tick unlocks create", !$("mvWaveCreate").disabled);
  $("mvWaveCreate").click();
  ok("the wave is created and read back", await until(() => st().runs.length === 2, 10000, "wave run") && /created · verified/.test(st().runs[1].lines.join(" ")));
  ok("…and now exists", st().waveRows.find((x) => x.name === "INT-SG-U-WAVE-Americas").exists);
  const exRow = st().waveRows.find((x) => x.name === "INT-SG-D-MDE-Exclusion");
  ok("the exclusion group is created in the same run, with the exclusion description", exRow.exists && /exclusion/i.test(exRow.group.description || "") && /INT-SG-D-MDE-Exclusion: created · verified/.test(st().runs[1].lines.join("\n")));
  ok("…read as a device group by its name while empty", exRow.kind === "device");
  ok("an existing exclusion group offers to exclude it from the new policies", !!D.querySelector('[data-mrexcl="INT-SG-D-MDE-Exclusion"]'));
  ok("…owned by the signed-in admin (read back)", /owner alex\.admin@contoso\.com/.test(st().runs[1].lines.join(" ")));
  ok("a second create of the same name is skipped, not duplicated", (await w.MdeRollout.createWave("INT-SG-U-WAVE-Americas", "")).skipped === true);

  // --------------------------------------- rollout actions (10633) --
  w.MdeRolloutV2Tool._pane("waves");
  ok("the 🌊 pane leads with the three rollout actions", /Rollout actions/.test($("mvBody").textContent) && D.querySelectorAll("[data-mrroll]").length === 3);
  D.querySelector('[data-mrroll="includeWaves"]').click();
  ok("① include: a plan is cut", await until(() => st().plan, 10000, "rollout include plan"));
  ok("…the device wave into the unassigned - D - Edge policy, the others already hold it", st().plan.changes.length === 1 && /Microsoft Edge/.test(st().plan.changes[0].policy.name)
    && st().plan.changes[0].after.some((a) => a.target.groupId === "11111111-0000-4000-8000-000000000021"));
  ok("…and the waves that do not exist are left out, named", /Left out/.test($("mvPlan").textContent) && /INT-SG-D-WAVE-Americas does not exist/.test($("mvPlan").textContent));
  $("mvBackup").click(); $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  await v2Gates(); $("mvApply").click();
  // (the demo's /assign is simulated and does not keep the write, so the read-back says NOT verified — as it does for every T11 write in demo)
  ok("…applied on the ledger and logged with its backup", await until(() => st().runs.length === 3, 10000, "rollout include run") && /Include the waves/.test(st().runs[2].title)
    && st().runs[2].ok + st().runs[2].bad === 1 && st().runs[2].backup.policies.length === 1 && st().runs[2].backup.action === "rollout-includeWaves");
  w.MdeRolloutV2Tool._pane("waves");
  D.querySelector('[data-mrroll="excludeExclusion"]').click();
  ok("② exclude: the device exclusion group from the four - D - policies", await until(() => st().plan, 10000, "rollout exclusion plan")
    && st().plan.changes.length === 4 && st().plan.changes.every((o) => o.details.some((d) => d.action === "add-exclude" && d.group.displayName === "INT-SG-D-MDE-Exclusion")));
  // 10639 (Mihai: the dry run "appears at the bottom, not visible"; option A)
  ok("the plan opens right under the rollout card, not under the wave table", $("mvRollCard").nextElementSibling === $("mvPlan") && st().planAnchor === "mvRollCard");
  w.MdeRolloutV2Tool._pane("waves");
  D.querySelector('[data-mrroll="excludeWaves"]').click();
  ok("③ the waves out of the colliding old policies — waves only", await until(() => st().plan, 10000, "rollout wave-exclusion plan")
    && st().plan.changes.length >= 1 && st().plan.changes.every((o) => o.details.filter((d) => d.change === "modify").every((d) => /-WAVE-/.test(d.group.displayName))));
  w.MdeRolloutV2Tool._pane("waves");
  D.querySelector('[data-mrroll-region="Euro"]').click();
  ok("unticking a region narrows the actions", !!st().rollRegions && !st().rollRegions.has("Euro") && D.querySelector('[data-mrroll="excludeWaves"]').disabled);
  D.querySelector('[data-mrroll-region="Euro"]').click();
  ok("ticking it back restores every region", st().rollRegions === null);
  w.MdeRolloutV2Tool._pane("waves");

  // --------------------------------------- 👥 wave members (10634) --
  w.MdeRolloutV2Tool._pane("members");
  ok("the members pane starts with its own read button", !!$("mvMemRead") && /Intune primary user/.test($("mvBody").textContent));
  $("mvMemRead").click();
  ok("the members read lands", await until(() => D.querySelector("[data-mrmemregion]"), 20000, "members read"));
  const mm = () => st().mem.model;
  const mrow = (k) => mm().rows.find((r) => r.key === k);
  ok("Euro first: the table's 15 countries plus the NL-Breda pilot, 4 of them in the demo tenant", st().mem.region === "Euro" && mm().regions[0].rows.length === 16 && mm().regions[0].rows.filter((r) => r.ug).length === 4);
  ok("the NL-Breda pilot leads the Euro wave with its own device group; its overlap with NL is expected", mm().regions[0].rows[0].key === "nl-breda" && mrow("nl-breda").pilot && mrow("nl-breda").deviceGroupName === "INT-SG-D-NLD-BREDA"
    && mrow("nl-breda").devices.length === 1 && mrow("nl-breda").problems.multi === 0 && mrow("nl-breda").problems.pilot === 1 && /🧪 pilot/.test($("mvBody").textContent));
  ok("NL: INT-SG-D-NLD exists, nested in both waves, out of sync by +1 / −1", mrow("nl").dg && mrow("nl").ugNested && mrow("nl").dgNested && mrow("nl").add.length === 1 && mrow("nl").remove.length === 1 && mrow("nl").removeNames[0] === "WS-ENG-0221");
  ok("DE: two Windows devices by primary user, one stale; INT-SG-D-DEU to create", !mrow("de").dg && mrow("de").want.size === 2 && mrow("de").problems.stale === 1 && mrow("de").deviceGroupName === "INT-SG-D-DEU");
  ok("FR: a Mac-only user — no Windows device, nothing to create", mrow("fr").devices.length === 0 && mrow("fr").usersNoDevice === 1);
  ok("the Polish city groups are named POL-WAW / POL-SKARB", mrow("pol-warszawa").deviceGroupName === "INT-SG-D-POL-WAW" && mrow("pol-skarb").deviceGroupName === "INT-SG-D-POL-SKARB");
  ok("devices with no primary user, owner or country code are counted — and the header says how a country is found (10655)", mm().noPrimary === 2 && /2 of \d+ in no country/.test($("mvBody").textContent)
    && /Devices placed by:[\s\S]*① primary user[\s\S]*② Intune last logon[\s\S]*③ Defender logons[\s\S]*④ Entra owner[\s\S]*⑤ name \/ location/.test($("mvBody").textContent) && !mm().failed.some((f) => /owner/.test(f)));
  ok("PL is not in any wave", mm().unmapped.map((u) => u.group.displayName).join() === "PVM-UG-CORP-MEM-USERS-PL");
  // 10683 (Mihai: "button not working"): a click on the words of ⭳ CSV — the
  // span flat-icons wraps them in — is the button's
  {
    let blobs = 0; const realUrl = w.URL.createObjectURL; w.URL.createObjectURL = () => { blobs++; return "blob:x"; };
    // flat-icons wraps the icon and the words in span.fi-run in a browser; do the same here
    let run = $("mvMemCsv").querySelector(".fi-run");
    if (!run) { run = D.createElement("span"); run.className = "fi-run"; while ($("mvMemCsv").firstChild) run.appendChild($("mvMemCsv").firstChild); $("mvMemCsv").appendChild(run); }
    (run || $("mvMemCsv")).dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    w.URL.createObjectURL = realUrl;
    ok("⭳ CSV: a click on its words downloads the CSV", !!run && blobs === 1, `run=${!!run} blobs=${blobs}`);
    ok("…and the stylesheet lets such a click through to the button", /button \.fi-run[^{]*\{pointer-events:none\}/.test(fs.readFileSync(path.join(ROOT, "css/flat-icons.css"), "utf8")));
  }
  // 🕳 Left out (10642, Mihai: "I need a way to know who is getting left
  // out"; layout A): Sam (FR) has only a Mac; svc-legacyapp's laptop has a
  // primary user in no country group; two Windows devices have no user.
  ok("the members read covers every platform — what a user with no Windows device has", mm().leftOut.users.some((u) => u.upn === "sam@contoso.com" && u.has.macOS === 1));
  // 10645 (Mihai: "keep the list, don't count it"): the count is Windows
  // devices only — WS-SALES-0077 and the two with no primary user; Sam is
  // listed, not counted
  ok("the toolbar offers 🕳 Left out with its count — Windows devices only", /🕳 Left out · 3/.test($("mvBody").textContent), (/🕳 Left out · \d+/.exec($("mvBody").textContent) || [""])[0]);
  const frRow = D.querySelector('[data-mrmemleftrow="fr"]');
  ok("a country's '1 user has none' links there", !!frRow && /1 user has none/.test(frRow.textContent));
  frRow.click();
  ok("…opening the view on that country: Sam, and his other devices", st().mem.left && st().mem.leftCountry === "fr" && /sam@contoso\.com/.test($("mvBody").textContent) && /macOS 1/.test($("mvBody").textContent) && /not counted/.test($("mvBody").textContent));
  // "the users still need to be in the right groups" / "if they get a
  // Windows device later, it should be added" (10645)
  ok("…with where Sam stands: in the Euro user wave through the France group, or not yet, and where a Windows device of his would go",
    (mrow("fr").ugNested ? /✓ in INT-SG-U-WAVE-Euro through PVM-UG-CORP-MEM-USERS-FR/ : /✗ not in INT-SG-U-WAVE-Euro yet — nest PVM-UG-CORP-MEM-USERS-FR/).test($("mvBody").textContent)
    && /a Windows device they get joins INT-SG-D-FRA at the next 👥 read → Apply/.test($("mvBody").textContent), $("mvBody").textContent.slice(0, 0));
  // 🔎 (10648, Mihai: "if a user has no device in Entra and Intune, try to
  // search in Defender … on which device the user has logged in"; option A)
  ok("🔎 the users list offers the Defender lookup and the KQL, and has no logon column yet", !!D.querySelector("[data-mrlogons]") && !!D.querySelector("[data-mrlogonkql]") && !/Logged on to · Defender/.test($("mvBody").textContent));
  const samId = mm().leftOut.users.find((u) => u.upn === "sam@contoso.com").id;
  let huntBody = null; const realPost = w.Graph.post;
  w.Graph.post = (p, b, o) => { if (/runHuntingQuery/.test(p)) huntBody = b; return realPost(p, b, o); };
  D.querySelector("[data-mrlogons]").click();
  ok("🔎 one hunting query for the users in view (France: Sam), 30 days, matched by account name", await until(() => st().mem.looked.has(samId), 10000, "logons")
    && huntBody && huntBody.Timespan === "P30D" && /DeviceLogonEvents/.test(huntBody.Query) && /let names = dynamic\(\["sam"\]\)/.test(huntBody.Query), huntBody && huntBody.Query);
  ok("🔎 …a column says where he logged on and what each device is: Eva's laptop in Intune, a lab PC Defender alone sees",
    /Logged on to · Defender, 30 days/.test($("mvBody").textContent) && /ws-fin-0142/i.test($("mvBody").textContent) && /in Intune — primary user eva@contoso\.com/.test($("mvBody").textContent)
    && /lab-pc-07/.test($("mvBody").textContent) && /Defender only — no Entra object/.test($("mvBody").textContent));
  ok("🔎 the CSV carries it", /ws-fin-0142 \(in Intune — primary user eva@contoso\.com/.test(w.MdeMembers.leftOutCsv(mm(), "Euro", st().mem.logons)));
  const samLog = st().mem.logons.get(samId) || [];
  ok("🔎 an AVD host (VDI in the name) is named but out of scope, after the devices that count though it is the newest (10654)", samLog.length === 3 && samLog[2].device === "cto-vdi-03" && samLog[2].outOfScope
    && /cto-vdi-03/.test($("mvBody").textContent) && /⊘ AVD \(-vdi- in the name\) — out of scope, excluded/.test($("mvBody").textContent)
    && /cto-vdi-03 \(⊘ AVD/.test(w.MdeMembers.leftOutCsv(mm(), "Euro", st().mem.logons)));
  D.querySelector("[data-mrlogonkql]").click();
  ok("⧉ with no clipboard, the KQL is saved as a file", await until(() => /Saved as a \.kql file/.test($("mvLogProg").textContent), 3000, "kql"));
  w.Graph.post = async (p) => { if (/runHuntingQuery/.test(p)) { const e = new Error("Forbidden"); e.status = 403; throw e; } return realPost(p); };
  st().mem.looked.clear(); st().mem.logons.clear();
  D.querySelector("[data-mrlogons]").click();
  ok("🔎 refused: says what it needs, and points at the KQL", await until(() => /ThreatHunting\.Read\.All/.test($("mvBody").textContent) && /Security Reader/.test($("mvBody").textContent), 5000, "denied"));
  w.Graph.post = realPost;
  ok("🔎 the scope is taken in the open (R18): graph.js, the registration script and SECURITY.md", /hunting: \["ThreatHunting\.Read\.All"\]/.test(fs.readFileSync(path.join(ROOT, "js/graph.js"), "utf8"))
    && /"ThreatHunting\.Read\.All"/.test(fs.readFileSync(path.join(ROOT, "New-TunoAppRegistration.ps1"), "utf8")) && /`ThreatHunting\.Read\.All`/.test(fs.readFileSync(path.join(ROOT, "SECURITY.md"), "utf8")));
  ok("the devices no country holds, with the reason", /WS-SALES-0077/.test($("mvBody").textContent) && /primary user in no country group of the table/.test($("mvBody").textContent)
    && /WS-OLD-0009/.test($("mvBody").textContent) && /no primary user/.test($("mvBody").textContent));
  D.querySelector('[data-mrmemleftwhy="noPrimary"]').click();
  ok("a tile narrows the devices to its reason", st().mem.leftReason === "noPrimary" && !/WS-SALES-0077/.test($("mvBody").textContent) && /WS-OLD-0009/.test($("mvBody").textContent));
  let loCsv = null; const dl0 = w.URL.createObjectURL;
  ok("the CSV names users and devices with the reason", (() => { const c = w.MdeMembers.leftOutCsv(mm(), "Euro"); loCsv = c; return /^Kind,Region,Country,User,Device,Why/.test(c) && /user,Euro,France,sam@contoso\.com,,no Windows device.*macOS 1/.test(c) && /WS-SALES-0077,primary user in no country group/.test(c); })(), loCsv);
  D.querySelector('[data-mrmemleft]').click();
  ok("the chip again goes back to the countries", !st().mem.left && !!D.querySelector('[data-mrmemopen="nl"]'));
  D.querySelector('[data-mrmemopen="nl"]').click();
  ok("a country opens to its devices", /WS-FIN-0187/.test($("mvBody").textContent) && /no longer in PVM-UG-CORP-MEM-USERS-NL/.test($("mvBody").textContent));
  const tickMem = (k) => { const b = D.querySelector(`[data-mrmemsel="${k}"]`); b.checked = true; b.dispatchEvent(new w.Event("change", { bubbles: true })); };
  tickMem("de");
  // 10698: Nina (DE) is in the user exclusion group — held out of INT-SG-U-DEU, so one user, not two
  ok("ticking a country fills the bar — 10680: the static user group beside the device group; 10698: the excluded user held back", /create 2 · add 1 user · add 2 devices · nest 2 groups into Euro/.test($("mvMemSum").textContent), $("mvMemSum").textContent);
  $("mvMemDry").click();
  ok("the dry run: create → add for INT-SG-D-DEU and INT-SG-U-DEU, then nest both static groups", await until(() => st().plan && st().plan.members, 5000, "members plan") && st().plan.ops.map((o) => o.type).join() === "create,add,create,add,nest,nest"
    && st().plan.ops[4].child.ref === "INT-SG-U-DEU" && st().plan.ops[2].name === "INT-SG-U-DEU");
  ok("…and the plan says who is held back and why (10698: the ⊘ user exclusion group)", st().plan.warnings.some((x) => /Germany: 1 user is held back, not added — 1 in the ⊘ user exclusion group/.test(x)), JSON.stringify(st().plan.warnings));
  ok("no removals, so a tick confirms", !!$("mvConfirmTick") && $("mvMemApply").disabled);
  $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  await v2Gates(); $("mvMemApply").click();
  const nRuns = st().runs.length;
  ok("applied: DE's device group exists, filled, and both groups are in the Euro waves", await until(() => st().runs.length === nRuns + 1 || st().runs.some((r) => r.kind === "members"), 10000, "members run")
    && mrow("de").dg && mrow("de").inSync && mrow("de").ugNested && mrow("de").dgNested, JSON.stringify(st().runs[st().runs.length - 1].lines));
  const mrun = st().runs.filter((r) => r.kind === "members").pop();
  ok("the run is logged with every step verified", mrun.ok === 6 && mrun.bad === 0 && /INT-SG-D-DEU/.test(mrun.lines.join()));
  // undo from 📜
  w.MdeRolloutV2Tool._pane("changes");
  D.querySelector(`[data-mrundo="${st().runs.indexOf(mrun)}"]`).click();
  ok("undo plans the reverse: take out, take out, remove the added users and devices", await until(() => st().plan && st().plan.members && /Undo/.test(st().plan.title), 5000, "undo plan") && st().plan.ops.map((o) => o.type).join() === "unnest,unnest,remove,remove" && st().plan.hasRemoval);
  ok("…with the created group left in place, said", /left in place/.test($("mvPlan").textContent));
  $("mvConfirmText").value = "REMOVE"; $("mvConfirmText").dispatchEvent(new w.Event("input"));
  await v2Gates(); $("mvMemApply").click();
  ok("undone: DE is out of both waves and its group is empty again", await until(() => mrow("de").ugNested === false && mrow("de").dgNested === false && mrow("de").have.size === 0, 10000, "undo applied"));
  // removals only when ticked
  w.MdeRolloutV2Tool._pane("members");
  tickMem("nl");
  $("mvMemRem").checked = true; $("mvMemRem").dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mvMemDry").click();
  ok("with 'apply removals' the NL plan removes the US laptop, typed REMOVE required", await until(() => st().plan && st().plan.members, 5000, "nl plan") && st().plan.ops.some((o) => o.type === "remove" && /WS-ENG-0221/.test(o.label)) && !!$("mvConfirmText"));
  $("mvDiscard").click();
  $("mvMemRem").checked = false; $("mvMemRem").dispatchEvent(new w.Event("change", { bubbles: true }));
  D.querySelector('[data-mrmemregion="Americas"]').click();
  ok("Americas: the US row, and no device wave for it yet", st().mem.region === "Americas" && mrow("us").ug && mrow("us").wave.device === null && /no wave group/.test($("mvBody").textContent));
  D.querySelector("[data-mrmemunmapped]").click();
  ok("the 'not in any wave' list offers 🧪 Add as pilot, with the device group it would get", /not in the country table/.test($("mvBody").textContent) && !!D.querySelector('[data-mrmempilot="PL"]') && /INT-SG-D-POL/.test($("mvBody").textContent));
  D.querySelector('[data-mrmempilot="PL"]').click();
  ok("adding PL as a pilot puts it first in the chosen wave, starred, selected, and kept for the tenant", st().mem.region === "Euro" && mm().regions[0].rows[0].key === "pl" && mrow("pl").pilot && st().mem.sel.has("pl")
    && st().cfg.members.pilots.includes("PL") && !mm().unmapped.length);

  // ------------------------------------------------ 📑 reports (10635) --
  // 10638 (option A off the mockup): the rail is back; the three reports
  // are its child nodes, each with its state; no second column, no tabs.
  w.MdeRolloutV2Tool._pane("reports");
  ok("four reports live in Journal's report selector", D.querySelectorAll(".t28-report-nav [data-mrreport]").length === 4 && D.querySelector('.mr-navigation [data-mrpane="journal"].active'));
  D.querySelector('[data-mrreport="config"]').dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok("a report node opens its report from the keyboard, straight into the main column", st().pane === "reports" && st().reps.selected === "config" && !!$("mvRep_config")
    && D.querySelector('[data-mrreport="config"]').classList.contains("active") && D.querySelector('[data-mrpane="reports"]').classList.contains("active"));
  D.querySelector('[data-mrreport="assign"]').click();
  w.MdeRolloutV2Tool._pane("reports");
  ok("reports offers four persistent choices and only one generator", D.querySelectorAll("[data-mrreport]").length === 4 && !!$("mvRep_assign") && !$("mvRep_config") && !$("mvRep_conflicts") && !$("mvRep_landing"));
  $("mvRep_assign").click();
  const R = () => st().reps;
  ok("the assignments report: a coverage matrix on the screen, HTML and CSV to take away", !!R().assign && /Coverage — waves per policy/.test(R().assign.html) && /INT-SG-D-WAVE-Euro/.test(R().assign.html)
    && R().assign.csv.startsWith("Policy,Generation,For,Type,Categories,Assignment,Target") && /Coverage — waves per policy/.test($("mvBody").textContent) && !!D.querySelector('[data-mrrep="assign"][data-mrrepfmt="csv"]'));
  const euroCol = R().assign.cov.regions.indexOf("Euro");
  const avCov = R().assign.cov.rows.find((x) => /Defender Antivirus - D - AV/.test(x.P.name));
  ok("…where the new AV policy includes the Euro device wave", euroCol >= 0 && avCov.cells[euroCol].inc.join() === "device");
  ok("…and each group carries its role in the rollout", /🌊 Euro device wave/.test(R().assign.csv));
  const coverageGroups = [...D.querySelectorAll(".mr-report-group")];
  ok("coverage keeps new policies visible and folds old policies without dropping their rows", coverageGroups.length === 2 && coverageGroups[0].open && !coverageGroups[1].open
    && coverageGroups[0].querySelectorAll("tr").length === st().model.newP.length + 1 && coverageGroups[1].querySelectorAll("tr").length === st().model.oldP.length + 1);
  const savedAssign = R().assign;
  D.querySelector('[data-mrreport="config"]').click();
  ok("switching reports preserves the saved assignment snapshot and hides its preview", R().assign === savedAssign && !D.querySelector('[data-report-preview="assign"]') && !!$("mvRep_config"));
  $("mvRep_config").click();
  ok("the configuration report: rules, groups with owners, members, settings, retirement, this session's changes", await until(() => R().config, 10000, "config report")
    && ["1 · Rules", "2 · Wave and exclusion groups", "3 · Wave members", "4 · New policies", "5 · Old policies", "7 · Changes this session"].every((h) => R().config.html.includes(h))
    && /alex\.admin@contoso\.com/.test(R().config.html) && /INT-SG-D-NLD/.test(R().config.html) && /Win - OIB - SC - Device Security - D - Audit and Event Logging/.test(R().config.html), R().config && R().config.html.length);
  ok("…with every setting in its CSV", R().config.csv.startsWith("Policy,Generation,Type,Setting,Value") && R().config.csv.split("\r\n").length > 10);
  ok("configuration preview retains all seven report sections and no document styles", D.querySelectorAll('[data-report-preview="config"] > .mr-report-section').length === 7 && !D.querySelector('[data-report-preview] style'));
  ok("configuration has an inline preview with full names and separate timestamps", !!D.querySelector('[data-report-preview="config"]') && /Owners attempted/.test($("mvBody").textContent) && R().config.readAt === st().model.readAt);
  D.querySelector('[data-mrreport="conflicts"]').click();
  $("mvRep_conflicts").click();
  ok("the report selector remains available during a fresh check and prevents concurrent refresh", D.querySelectorAll("[data-mrreport]").length === 4 && $("mvRun").disabled);
  ok("the conflict check reads the tenant fresh and counts what needs action", await until(() => R().conflicts, 30000, "conflict check") && R().conflicts.summary.act > 0 && R().checks.length === 1 && /conflict check/i.test(R().conflicts.html) && st().pane === "reports");
  ok("the conflict report selector shows its action count", /\d+ to act/.test(D.querySelector('[data-mrreport="conflicts"]').textContent));
  D.querySelector('[data-mrreport="assign"]').click();
  ok("…and the rail marks the older report for regenerating", /Updating on opening/.test(D.querySelector('[data-mrreport="assign"]').textContent));
  ok("an older report is marked stale after a fresh check and retains its original data", /saved report predates/.test($("mvBody").textContent) && R().assign === savedAssign && R().assign.html === savedAssign.html);
  D.querySelector('[data-mrreport="conflicts"]').click();
  const before = R().conflicts.summary.act;
  $("mvRep_conflicts").click();
  ok("a second check says what moved since the first", await until(() => R().checks.length === 2, 30000, "second check") && R().conflicts.diff && Array.isArray(R().conflicts.diff.fixed) && R().conflicts.summary.act === before && /Since the check at/.test($("mvBody").textContent));

  const savedConflict = R().conflicts;
  const refresh = w.PolicyCache.refresh;
  w.PolicyCache.refresh = async () => { throw new Error("simulated read failure"); };
  $("mvRep_conflicts").click();
  await until(() => !R().busy, 10000, "failed check");
  ok("a failed fresh read keeps the old report and does not add a successful check", R().conflicts === savedConflict && R().checks.length === 2 && /Fresh read failed/.test($("mvBody").textContent));
  w.PolicyCache.refresh = refresh;

  // ----------------------------------------------------- rules pane --
  w.MdeRolloutV2Tool._pane("rules");
  $("mvRuleOut").value = "AVD\nWinServ\nPVM-DG-CORP-ENDSEC-WIN-ASR";
  $("mvRuleSave").click();
  ok("saving the rules re-sorts the generations", await until(() => st().model.outP.some((p) => p.name === "PVM-DG-CORP-ENDSEC-WIN-ASR-PRD"), 5000, "rules"));
  // V2 keeps its rules under tuno.t28.v2.rules.<tenant>; the original
  // screen's key (tuno.t28.rules.<tenant>) is only ever read, once, to carry
  // its rules over (10661) — never written.
  const tid = String((w.TunoTenant && w.TunoTenant.tenantId()) || "default").toLowerCase();
  const key = "tuno.t28.v2.rules." + tid;
  ok("…and keeps them for this tenant, under the V2 key", /PVM-DG-CORP-ENDSEC-WIN-ASR/.test(w.localStorage.getItem(key) || ""), key);
  ok("…and never writes the original screen's key", w.localStorage.getItem("tuno.t28.rules." + tid) === null);
  $("mvRuleReset").click();
  ok("reset brings the defaults back", st().cfg.outPrefixes.join("|") === "AVD|WinServ|Win-Serv");
  w.MdeRolloutV2Tool._pane("rules");
  ok("rules show the country table (pilot starred) and the device-group suffixes", /Euro: \*NL-Breda, GB, BE, NL/.test($("mvRuleMap").value) && /POL-Warszawa = POL-WAW/.test($("mvRuleSfx").value) && /Delivery Optimisation/.test($("mvRuleAlso").value));
  ok("rules show the regions and the four group-name fields", /Euro/.test($("mvRuleWaves").value) && $("mvRuleDgPre").value === "INT-SG-D-WAVE-" && $("mvRuleExU").value === "INT-SG-U-MDE-Exclusion");

  // ----------------------------- a re-read never loses the plan panel --
  // (found in a real browser: the warm start renders before the first
  // click, 🚀 Read the tenant clears the body, and the panel went with it)
  $("mvRun").click();
  await until(() => $("mvBody").querySelector(".ep-rail"), 30000, "re-read");
  await idle();
  w.MdeRolloutV2Tool._pane("conflicts");
  const again = D.querySelector("[data-mrpair]");
  again.checked = true; again.dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mvGroup").value = "";   // the include test above left its group in the bar
  $("mvDryRun").click();
  ok("after a second read the dry run still has somewhere to land", await until(() => D.getElementById("mvPlan") && D.getElementById("mvPlan").isConnected && /② Plan/.test(D.getElementById("mvPlan").textContent), 10000, "plan after re-read"));
  ok("…and the panel sits in the main column", !!D.querySelector(".ep-main #mvPlan"));

  // --------------------------------------- rename to INT-SG (10635) --
  w.MdeRolloutV2Tool._pane("waves");
  const amD = () => st().waveRows.find((x) => x.name === "INT-SG-D-WAVE-Americas");
  ok("the Americas device wave is found under its old name, offered for rename", amD().legacy && amD().legacy.name === "PVM-DG-MDE-WAVE-Americas" && /old name/.test($("mvBody").textContent) && !!D.querySelector('[data-mrrename="INT-SG-D-WAVE-Americas"]'));
  ok("both legacy groups can be selected for rename", D.querySelectorAll("[data-mrrename]").length === 2);
  const exU = () => st().waveRows.find((x) => x.name === "INT-SG-U-MDE-Exclusion");
  ok("the user exclusion group is found under its old name too", exU().legacy && exU().legacy.name === "PVM-UG-MDE-Exclusion" && !!D.querySelector('[data-mrrename="INT-SG-U-MDE-Exclusion"]'));
  const rnx = D.querySelector('[data-mrrename="INT-SG-U-MDE-Exclusion"]'); rnx.checked = true; rnx.dispatchEvent(new w.Event("change", { bubbles: true }));
  const rnb = D.querySelector('[data-mrrename="INT-SG-D-WAVE-Americas"]'); rnb.checked = true; rnb.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("rename stays locked until its own tick", $("mvRenameGo").disabled);
  $("mvRenameOk").checked = true; $("mvRenameOk").dispatchEvent(new w.Event("change", { bubbles: true }));
  const nr = st().runs.length;
  $("mvRenameGo").click();
  ok("renamed in the tenant: the same objects, the new names, read back", await until(() => st().runs.length === nr + 1, 10000, "rename run") && amD().exists && amD().id === "11111111-0000-4000-8000-000000000036"
    && exU().exists && exU().id === "11111111-0000-4000-8000-000000000037" && st().runs[nr].ok === 2 && /renamed · verified/.test(st().runs[nr].lines.join()));
  w.MdeRolloutV2Tool._pane("changes");
  D.querySelector(`[data-mrrenback="${nr}"]`).click();
  ok("📜 renames them back", await until(() => st().runs.length === nr + 2, 10000, "rename back") && amD().legacy && !amD().exists && exU().legacy && /back/.test(st().runs[nr + 1].title));
  w.MdeRolloutV2Tool._pane("waves");

  // ------------------------------------------------ ⊘ exclusions (10639) --
  // Mihai: "search a user or device, get both info, and get offered to be
  // added to the 2 exclusion groups". Layout A: the header button opens the
  // rail pane. The user exclusion group is still under its old name here
  // (renamed back above) and Nina is in it — her Windows laptop is not.
  w.MdeRolloutV2Tool._pane("exceptionhome");
  ok("the rail node is there once the tenant is read (10678: no header button)", !!D.querySelector('[data-mrpane="exclusions"]') && !$("mvExclude"));
  D.querySelector('[data-mrpane="exclusions"]').click();
  await until(() => st().pane === "exclusions", 5000, "exclusions pane");
  if (!st().ex.base && !st().ex.loading) $("mvExRead").click();
  ok("it opens ⊘ Exclusions and reads the exclusion groups and devices", st().pane === "exclusions" && await until(() => st().ex.base, 10000, "exclusion base") && !!$("mvExQ"));
  ok("partial exclusions remain visible", /half/.test($("mvExNow").textContent));
  ok("Excluded now: Nina, half — her laptop still gets the - D - policies, with + add device", /Excluded now/.test($("mvExNow").textContent) && /Nina Nieuw/.test($("mvExNow").textContent)
    && /half: the - D - policies still reach WS-ENG-0308/.test($("mvExNow").textContent) && !!D.querySelector("[data-mrexfix]"));
  $("mvExQ").value = "eva"; $("mvExQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  $("mvExQ").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok("Enter searches: Eva the user, by name", await until(() => st().ex.results && st().ex.results.some((r) => r.type === "user" && r.displayName === "Eva Employee"), 10000, "search eva"));
  const evaHit = st().ex.results.findIndex((r) => r.type === "user" && r.displayName === "Eva Employee");
  D.querySelector(`[data-mrexpick="${evaHit}"]`).click();
  ok("picking her reads both sides: the user and her Windows laptop", await until(() => st().ex.card && !st().ex.cardLoading, 10000, "eva card")
    && st().ex.card.user.upn === "eva@contoso.com" && st().ex.card.devices.map((d) => d.name).join() === "WS-FIN-0142");
  const evaDev = st().ex.card.devices[0];
  ok("…ticked by default: Eva and the laptop", st().ex.ticks.has(`u:${st().ex.card.user.id}`) && st().ex.ticks.has(evaDev.key));
  ok("…the card names her country group, her wave and the laptop's device group", /PVM-UG-CORP-MEM-USERS-NL/.test($("mvExCard").textContent) && /INT-SG-D-NLD/.test($("mvExCard").textContent) && /🌊 Euro/.test($("mvExCard").textContent));
  ok("what reaches them, before and after — the laptop goes back on the old set", /What reaches them/.test($("mvExCard").textContent) && /out of INT-SG-D-NLD — leaves the wave, back on the old set/.test($("mvExCard").textContent));
  $("mvExDry").click();
  ok("the dry run: the user into the user group, the laptop into the device group, then out of INT-SG-D-NLD",
    !!st().plan && st().plan.exclusions && st().plan.ops.length === 3 && st().plan.ops[0].group.name === "PVM-UG-MDE-Exclusion" && st().plan.ops[1].group.name === "INT-SG-D-MDE-Exclusion" && st().plan.ops[2].type === "remove" && st().plan.ops[2].group.name === "INT-SG-D-NLD");
  ok("…and it opens under the card, above Excluded now", $("mvExCard").nextElementSibling === $("mvPlan") && /Who/.test($("mvPlan").textContent) && /Eva Employee/.test($("mvPlan").textContent));
  ok("an exclusion is an addition: a tick, not a typed REMOVE", !!$("mvConfirmTick") && !$("mvConfirmText"));
  $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  const xr = st().runs.length;
  await v2Gates(); $("mvMemApply").click();
  ok("applied and read back: three steps verified, on 📜", await until(() => st().runs.length === xr + 1, 10000, "exclusion run") && st().runs[xr].ok === 3 && st().runs[xr].exclusions);
  const demoG = (n) => w.TUNO_DEMO_GRAPH.T.GROUPS.find((g) => g.id === `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`);
  ok("in the tenant: Eva in the user group, the laptop in the device group and out of INT-SG-D-NLD", demoG(37)._users.includes("22222222-0000-4000-8000-000000000002")
    && w.TUNO_DEMO_GRAPH.T.GROUPS.find((g) => g.displayName === "INT-SG-D-MDE-Exclusion")._devices.includes("33333333-0000-4000-8000-000000000101") && !demoG(35)._devices.includes("33333333-0000-4000-8000-000000000101"));
  ok("the lists move with the run, and the card reads again", await until(() => st().ex.card && !st().ex.cardLoading && st().ex.card.user.excluded, 10000, "card again")
    && st().ex.base.users.length === 2 && st().ex.base.devices.length === 1 && /Eva Employee/.test($("mvExNow").textContent));
  // 🔎 In a wave anyway (10698): the run scans the waves again — Eva is
  // excluded now, yet in the Euro user wave through the dynamic NL group
  ok("🔎 the scan runs again after the run and finds Eva in the Euro user wave through PVM-UG-CORP-MEM-USERS-NL", await until(() => st().ex.scan && !st().ex.scanBusy && st().ex.scan.rows.length === 1, 10000, "scan after run")
    && st().ex.scan.rows[0].name === "Eva Employee" && st().ex.scan.rows[0].routes.length === 1 && st().ex.scan.rows[0].routes[0].group.name === "PVM-UG-CORP-MEM-USERS-NL" && st().ex.scan.rows[0].routes[0].dynamic, JSON.stringify(st().ex.scan && st().ex.scan.rows));
  ok("…the card under Excluded now says so: 1 excluded user in a wave, the route dynamic — nothing to take out here", $("mvExNow").nextElementSibling === $("mvExScan") && /1 excluded user and 0 excluded devices is in a wave/.test($("mvExScan").textContent)
    && /dynamic — cannot be taken out/.test($("mvExScan").textContent) && $("mvExScanDry").disabled && /take 0 members out/.test($("mvExScanDry").textContent), $("mvExScan").textContent.slice(0, 400));
  ok("…and Needs attention carries the finding", st().projectFindings().some((x) => x.id === "exscan" && /1 excluded member is still in a wave/.test(x.title) && x.to === "exclusions"));
  w.MdeRolloutV2Tool._pane("changes");
  D.querySelector(`[data-mrundo="${xr}"]`).click();
  ok("📜 undo: the inverse, a typed REMOVE", await until(() => st().plan && /Undo/.test(st().plan.title), 10000, "undo plan") && st().plan.exclusions && !!$("mvConfirmText") && st().plan.ops.length === 3);
  $("mvConfirmText").value = "REMOVE"; $("mvConfirmText").dispatchEvent(new w.Event("input"));
  await v2Gates(); $("mvMemApply").click();
  ok("…and the tenant is back as it was", await until(() => st().runs.length === xr + 2, 10000, "undo run") && !demoG(37)._users.includes("22222222-0000-4000-8000-000000000002") && demoG(35)._devices.includes("33333333-0000-4000-8000-000000000101")
    && st().ex.base.users.length === 1 && st().ex.base.devices.length === 0);
  ok("🔎 the undo scans again: nobody excluded is in a wave, no finding", await until(() => st().ex.scan && !st().ex.scanBusy && st().ex.scan.rows.length === 0, 10000, "scan after undo") && !st().projectFindings().some((x) => x.id === "exscan"));
  // Excluded now → take out (Nina)
  w.MdeRolloutV2Tool._pane("exclusions");
  const nsel = D.querySelector("[data-mrexsel]"); nsel.checked = true; nsel.dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mvExRemDry").click();
  ok("taking a row out is a typed removal, planned under Excluded now", !!st().plan && st().plan.hasRemoval && st().plan.ops[0].fromExclusion && $("mvExNow").nextElementSibling === $("mvPlan") && !!$("mvConfirmText"));
  $("mvDiscard").click();

  // ------------------------------------------ ⊘ 📋 a list (10651) --
  // Mihai: "the exclusion should get a bulk add user and device"; option A
  // off the mockup. Eva by UPN, Alex's laptop by name, Nina (in already —
  // her Windows laptop is not), a line nobody answers to, a Mac, and Eva's
  // laptop again on its own line.
  ok("the pane has a switch: One at a time | A list", !!D.querySelector('[data-mrexmode="one"].active') && !!D.querySelector('[data-mrexmode="list"]'));
  D.querySelector('[data-mrexmode="list"]').click();
  ok("A list: a box, Look them up, a .csv / .txt button — and no search", st().ex.mode === "list" && !!$("mvExListText") && !!$("mvExListGo") && $("mvExListGo").disabled && !!$("mvExListFile") && !$("mvExQ") && !!$("mvExNow"));
  $("mvExListText").value = "eva@contoso.com\nWS-ENG-0221; nina@contoso.com\nnobody@contoso.com, MB-DES-0012\nWS-FIN-0142\nEVA@contoso.com";
  $("mvExListText").dispatchEvent(new w.Event("input", { bubbles: true }));
  ok("typing counts the lines on the button (a repeat counted once), the box keeps its focus", /Look them up · 6 lines/.test($("mvExListGo").textContent) && !$("mvExListGo").disabled && st().ex.listText.includes("MB-DES-0012"));
  $("mvExListGo").click();
  ok("Look them up: every line answered", await until(() => st().ex.list && !st().ex.listBusy, 10000, "list lookup") && st().ex.list.items.length === 6);
  const li = (line) => st().ex.list.items.find((x) => x.line === line);
  ok("…Eva by UPN, with her laptop; Alex's laptop by name; Nina", li("eva@contoso.com").kind === "user" && li("eva@contoso.com").card.devices.map((d) => d.name).join() === "WS-FIN-0142"
    && li("WS-ENG-0221").kind === "device" && li("nina@contoso.com").kind === "user" && li("nina@contoso.com").card.user.excluded);
  ok("…no match, a Mac, and Eva's laptop again under her line", li("nobody@contoso.com").kind === "none" && li("MB-DES-0012").kind === "notwin" && li("WS-FIN-0142").kind === "listed");
  const lt = $("mvExList").textContent;
  ok("the table: Line → match, Now, Into the exclusion groups", /Line → match/.test(lt) && /Into the exclusion groups/.test(lt) && /6 lines · 2 users · 1 device · 1 no match · 1 not Windows · 1 twice/.test(lt));
  ok("…Eva's country, her laptop in INT-SG-D-NLD, and what the run does to it", /user · Eva Employee · Netherlands/.test(lt) && /in INT-SG-D-NLD/.test(lt) && /\+ INT-SG-D-MDE-Exclusion/.test(lt) && /− out of INT-SG-D-NLD/.test(lt));
  ok("…Nina is in already, her laptop is not", /excluded/.test(D.querySelector(`[data-mrexltick="u:${li("nina@contoso.com").card.user.id}"]`).closest("tr").textContent) && D.querySelector(`[data-mrexltick="u:${li("nina@contoso.com").card.user.id}"]`).disabled
    && D.querySelector(`[data-mrexltick="${li("nina@contoso.com").card.devices[0].key}"]`).checked);
  ok("…the Mac and the line nobody answers to say why", /not a Windows device/.test(lt) && /no user has this UPN or e-mail/.test(lt) && /already in this list — with eva@contoso\.com/.test(lt));
  ok("the bar: 1 user · 3 devices → the exclusion groups · 2 out of their country group", /1 user · 3 devices/.test($("mvExListBar").textContent) && /2 devices out of their country group/.test($("mvExListBar").textContent) && !$("mvExListDry").disabled);
  // untick Alex's laptop, then everything, then back
  const alexT = D.querySelector(`[data-mrexltick="${li("WS-ENG-0221").card.devices[0].key}"]`);
  alexT.checked = false; alexT.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("a tick moves the bar", /1 user · 2 devices/.test($("mvExListBar").textContent) && /1 device out of/.test($("mvExListBar").textContent));
  $("mvExListAll").checked = false; $("mvExListAll").dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the header box clears every tick", st().ex.lticks.size === 0 && $("mvExListDry").disabled && /tick a user or a device/.test($("mvExListBar").textContent));
  $("mvExListAll").checked = true; $("mvExListAll").dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("…and ticks everything that can be", /1 user · 3 devices/.test($("mvExListBar").textContent) && $("mvExListAll").checked);
  $("mvExListDry").click();
  ok("the dry run: ONE plan — the user, the devices, then out of INT-SG-D-NLD", !!st().plan && st().plan.bulk && st().plan.exclusions && st().plan.ops.length === 3
    && st().plan.ops[0].group.name === "PVM-UG-MDE-Exclusion" && st().plan.ops[0].ids.length === 1
    && st().plan.ops[1].group.name === "INT-SG-D-MDE-Exclusion" && st().plan.ops[1].ids.length === 3
    && st().plan.ops[2].type === "remove" && st().plan.ops[2].group.name === "INT-SG-D-NLD" && st().plan.ops[2].ids.length === 2);
  ok("…under the list, above Excluded now, confirmed by a tick", $("mvExList").nextElementSibling === $("mvPlan") && /a list of 6 lines/.test($("mvPlan").textContent) && /3 devices/.test($("mvPlan").textContent) && !!$("mvConfirmTick"));
  $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  const lr = st().runs.length;
  await v2Gates(); $("mvMemApply").click();
  ok("applied and read back: three steps verified, on 📜", await until(() => st().runs.length === lr + 1, 10000, "list run") && st().runs[lr].ok === 3 && st().runs[lr].exclusions);
  const exD = () => w.TUNO_DEMO_GRAPH.T.GROUPS.find((g) => g.displayName === "INT-SG-D-MDE-Exclusion");
  const D_ = (n) => `33333333-0000-4000-8000-${String(n).padStart(12, "0")}`;
  ok("in the tenant: Eva in the user group; three laptops in the device group; Eva's and Alex's out of INT-SG-D-NLD", demoG(37)._users.includes("22222222-0000-4000-8000-000000000002")
    && [101, 107, 109].every((n) => exD()._devices.includes(D_(n))) && !demoG(35)._devices.includes(D_(101)) && !demoG(35)._devices.includes(D_(107)));
  ok("the list moved with the run: in already, nothing ticked; Excluded now has them", li("eva@contoso.com").card.user.excluded && li("WS-ENG-0221").card.devices[0].excluded && st().ex.lticks.size === 0
    && $("mvExListDry").disabled && st().ex.base.devices.length === 3 && /Eva Employee/.test($("mvExNow").textContent));
  w.MdeRolloutV2Tool._pane("changes");
  D.querySelector(`[data-mrundo="${lr}"]`).click();
  ok("📜 undo: the inverse, a typed REMOVE", await until(() => st().plan && /Undo/.test(st().plan.title), 10000, "list undo plan") && st().plan.ops.length === 3 && !!$("mvConfirmText"));
  $("mvConfirmText").value = "REMOVE"; $("mvConfirmText").dispatchEvent(new w.Event("input"));
  await v2Gates(); $("mvMemApply").click();
  ok("…the tenant is back, and so is the list", await until(() => st().runs.length === lr + 2, 10000, "list undo run") && !demoG(37)._users.includes("22222222-0000-4000-8000-000000000002")
    && demoG(35)._devices.includes(D_(101)) && demoG(35)._devices.includes(D_(107)) && !exD()._devices.length
    && !li("eva@contoso.com").card.user.excluded && li("eva@contoso.com").card.devices[0].direct.some((g) => g.name === "INT-SG-D-NLD"));
  w.MdeRolloutV2Tool._pane("exclusions");
  // a file dropped on the box: a CSV narrowed to its UPN column
  const drop = new w.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: { files: [new w.File(["displayName,userPrincipalName\nMilan,milan@contoso.com\nPriya,priya@contoso.com\n"], "people.csv", { type: "text/csv" })] } });
  $("mvExListText").dispatchEvent(drop);
  ok("a .csv dropped on the box: its UPN column fills it, and it says so", await until(() => /milan@contoso\.com\npriya@contoso\.com/.test(st().ex.listText), 5000, "csv drop")
    && $("mvExListText").value === "milan@contoso.com\npriya@contoso.com" && /people\.csv: 2 lines from the column “userPrincipalName”/.test($("mvExListProg").textContent));
  D.querySelector('[data-mrexmode="one"]').click();
  ok("back to One at a time: the search again, the list kept", st().ex.mode === "one" && !!$("mvExQ") && !$("mvExListText") && !!st().ex.list);

  // ------------------------------------------- ⚙️ leave out (10639) --
  w.MdeRolloutV2Tool._pane("rules");
  ok("the rules have a Leave-out box beside Also-in", !!$("mvRuleLeave") && /Leave out of the target list/.test($("mvBody").textContent));
  const avName = st().model.newP.find((P) => /Defender Antivirus - D - AV/.test(P.name)).name;
  $("mvRuleLeave").value = avName;
  $("mvRuleSave").click();
  ok("a policy left out by name is out of scope, marked ➖", await until(() => st().model.outP.some((P) => P.name === avName), 5000, "left out") && !st().model.newP.some((P) => P.name === avName));
  w.MdeRolloutV2Tool._pane("out");
  ok("…and the 🚫 pane says why", /➖ left out by name/.test($("mvBody").textContent));
  w.MdeRolloutV2Tool._pane("rules");
  $("mvRuleLeave").value = ""; $("mvRuleSave").click();
  ok("clearing the box brings it back", await until(() => st().model.newP.some((P) => P.name === avName), 5000, "back in"));

  // ------------------------------------------ 🧪 pilot batches (10640) --
  // Mihai: "split the adding of the pilot group in 4 even batches of users
  // and devices" — option A. The demo's Breda group is given four more
  // users for this (Eva is in the wave through NL already).
  const TT = w.TUNO_DEMO_GRAPH.T;
  TT.GROUPS.find((g) => g.displayName === "PVM-UG-CORP-MEM-USERS-NL-Breda")._users = ["22222222-0000-4000-8000-000000000001", "22222222-0000-4000-8000-000000000002",
    "22222222-0000-4000-8000-000000000004", "22222222-0000-4000-8000-000000000005", "22222222-0000-4000-8000-000000000007"];
  w.MdeRolloutV2Tool._pane("members");
  $("mvMemRead").click();
  ok("the members read again", await until(() => st().mem.model && !st().mem.loading && D.querySelector("[data-mrmemregion]"), 20000, "members re-read"));
  const br = () => st().mem.model.rows.find((r) => r.key === "nl-breda");
  ok("NL-Breda is added in batches: four users to batch in four parts, Eva already in through NL", br().batch && br().batch.N === 4 && br().batch.sizes.join() === "1,1,1,1" && br().batch.inOther === 1 && br().batch.next.n === 1);
  ok("the row says it", /🧪 pilot · in batches/.test($("mvBody").textContent) && /0 of 4 users/.test($("mvBody").textContent));
  D.querySelector('[data-mrmemopen="nl-breda"]').click();
  ok("the pilot row opens on its batch panel", !!$("mvBatch-nl-breda") && /Pilot in 4 batches/.test($("mvBatch-nl-breda").textContent) && !!D.querySelector('[data-mrbatch="nl-breda"]'));
  D.querySelector('[data-mrbatch="nl-breda"]').click();
  ok("batch 1 → dry run (10681): INT-SG-U-NLD-BREDA created with Alex in it and nested; INT-SG-D-NLD-BREDA created, filled with his laptop and nested", !!st().plan && st().plan.ops.map((o) => o.type).join() === "create,add,nest,create,add,nest"
    && st().plan.ops[0].name === "INT-SG-U-NLD-BREDA" && st().plan.ops[1].ids.join() === "22222222-0000-4000-8000-000000000001" && st().plan.ops[2].parent.name === "INT-SG-U-WAVE-Euro" && st().plan.ops[3].name === "INT-SG-D-NLD-BREDA"
    && st().plan.ops[4].ids.join() === "33333333-0000-4000-8000-000000000107", st().plan && st().plan.ops.map((o) => o.type).join());
  ok("…and the plan opens under the batch panel", $("mvBatch-nl-breda").nextElementSibling === $("mvPlan") && /batch 1 of 4/.test($("mvPlan").textContent));
  $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  const brun = st().runs.length;
  await v2Gates(); $("mvMemApply").click();
  ok("applied: every step done and verified", await until(() => st().runs.length === brun + 1, 15000, "batch run") && st().runs[brun].ok === 6, st().runs[brun] && st().runs[brun].lines.join(" | "));
  const brG = () => TT.GROUPS.find((g) => g.displayName === "INT-SG-D-NLD-BREDA");
  ok("in the tenant: Alex in INT-SG-U-NLD-BREDA, which sits in the user wave (not a direct wave member); the new device group holds his laptop and sits in the device wave",
    (TT.GROUPS.find((g) => g.displayName === "INT-SG-U-NLD-BREDA")._users || []).includes("22222222-0000-4000-8000-000000000001") && (TT.GROUPS.find((g) => g.displayName === "INT-SG-U-NLD-BREDA").memberOf || []).includes("11111111-0000-4000-8000-000000000020")
    && !(TT.GROUPS.find((g) => g.displayName === "INT-SG-U-WAVE-Euro")._users || []).includes("22222222-0000-4000-8000-000000000001")
    && brG() && brG()._devices.includes("33333333-0000-4000-8000-000000000107") && brG().memberOf.includes("11111111-0000-4000-8000-000000000021"));
  ok("the panel moves on: 1 of 4 in, batch 2 next", br().batch.inCount === 1 && br().batch.batches[0].state === "in" && br().batch.next.n === 2);
  ok("the regular sync neither fills nor nests the pilot's user group while it is batched", !w.MdeMembers.planOps(st().mem.model, new Set(["nl-breda"]), { fill: true, nestUsers: true, nestDevices: true }, st().cfg.members).ops.some((o) => o.memberKind === "user" || o.kind === "user"));
  const tg = D.querySelector('[data-mrbatchtoggle="NL-Breda"]'); tg.checked = false; tg.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the batches can be switched off for a pilot (kept per tenant)", br().batch === null && !st().cfg.members.batched.includes("NL-Breda"));
  const tg2 = D.querySelector('[data-mrbatchtoggle="NL-Breda"]'); tg2.checked = true; tg2.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("…and on again, with the progress intact", br().batch && br().batch.inCount === 1);

  // 🧪 migrate to the wave (10656, Mihai: "the NL-Breda users should be
  // excluded when NL goes live, or better there should be a migrate to wave
  // for the pilot users"; option B). NL is live in the demo already.
  ok("a pilot with users outside its country is not migratable, and says why", /Not migratable into Netherlands: 4 users of the pilot are not in Netherlands/.test($("mvBatch-nl-breda").textContent) && !D.querySelector('[data-mrmigrate="nl-breda"]'));
  // as in PVM, every Breda user is also in NL
  const nlG = TT.GROUPS.find((g) => g.displayName === "PVM-UG-CORP-MEM-USERS-NL");
  const nlUsersBefore = nlG._users ? nlG._users.slice() : undefined;
  nlG._users = [...new Set((nlG._users || []).concat(TT.GROUPS.find((g) => g.displayName === "PVM-UG-CORP-MEM-USERS-NL-Breda")._users))];
  $("mvMemRead").click();
  ok("the members read again, Breda inside NL", await until(() => st().mem.model && !st().mem.loading && br() && br().outsideParent.length === 0, 20000, "members re-read (NL ⊇ Breda)"));
  await idle();
  if (!$("mvBatch-nl-breda")) D.querySelector('[data-mrmemopen="nl-breda"]').click();
  ok("the pilot knows its country, the panel offers the migration, and NL's row says going live migrates it", br().parentKey === "nl" && !!D.querySelector('[data-mrmigrate="nl-breda"]')
    && /Migrate to the wave with Netherlands/.test($("mvBatch-nl-breda").textContent) && /going live migrates NL Breda/.test($("mvBody").textContent));
  D.querySelector('[data-mrmigrate="nl-breda"]').click();
  const migOps = () => st().plan.ops.filter((o) => o.migrate);
  ok("the plan: INT-SG-U-NLD-BREDA out of the user wave (Alex in through NL), INT-SG-D-NLD-BREDA out of the device wave — typed, under the panel",
    !!st().plan && /Netherlands goes live · 🧪 NL Breda migrated to the wave/.test(st().plan.title) && migOps().length === 2
    && migOps()[0].type === "unnest" && migOps()[0].child.name === "INT-SG-U-NLD-BREDA" && migOps()[0].parent.name === "INT-SG-U-WAVE-Euro"
    && migOps()[1].type === "unnest" && migOps()[1].child.name === "INT-SG-D-NLD-BREDA" && !!$("mvConfirmText") && $("mvBatch-nl-breda").nextElementSibling === $("mvPlan")
    && /NL Breda is migrated into Netherlands/.test($("mvPlan").textContent), st().plan && JSON.stringify(st().plan.ops.map((o) => [o.type, o.label || (o.child && o.child.name)])));
  $("mvConfirmText").value = "REMOVE"; $("mvConfirmText").dispatchEvent(new w.Event("input"));
  const migRun = st().runs.length;
  await v2Gates(); $("mvMemApply").click();
  ok("applied: every step verified, the migration on 📜", await until(() => st().runs.length === migRun + 1, 15000, "migrate run") && st().runs[migRun].bad === 0 && st().runs[migRun].migrate.length === 1, st().runs[migRun] && st().runs[migRun].lines.join(" | "));
  const brU = () => TT.GROUPS.find((g) => g.displayName === "INT-SG-U-NLD-BREDA");
  ok("in the tenant: INT-SG-U-NLD-BREDA and INT-SG-D-NLD-BREDA are out of the waves, left in place",
    !(brU().memberOf || []).includes("11111111-0000-4000-8000-000000000020") && brG() && !brG().memberOf.includes("11111111-0000-4000-8000-000000000021"));
  ok("the pilot is migrated: out of the batches, listed as migrated, not selectable", st().cfg.members.migrated.includes("NL-Breda") && !st().cfg.members.batched.includes("NL-Breda") && br().migrated && br().batch === null
    && /🧪 migrated into Netherlands/.test($("mvBody").textContent) && !D.querySelector('[data-mrmemsel="nl-breda"]') && /Migrated into Netherlands/.test(($("mvBatch-nl-breda") || { textContent: "" }).textContent));
  w.MdeRolloutV2Tool._pane("changes");
  D.querySelector(`[data-mrundo="${migRun}"]`).click();
  ok("📜 undo: the inverse, typed", await until(() => st().plan && /Undo/.test(st().plan.title), 10000, "migrate undo plan") && !!$("mvConfirmText") && st().plan.unmigrate && st().plan.unmigrate.length === 1);
  $("mvConfirmText").value = "REMOVE"; $("mvConfirmText").dispatchEvent(new w.Event("input"));
  await v2Gates(); $("mvMemApply").click();
  ok("…the pilot is back in its batches, and the tenant as it was", await until(() => st().runs.length === migRun + 2, 15000, "migrate undo run") && st().cfg.members.batched.includes("NL-Breda") && !st().cfg.members.migrated.includes("NL-Breda")
    && br().batch && (brU().memberOf || []).includes("11111111-0000-4000-8000-000000000020") && brG().memberOf.includes("11111111-0000-4000-8000-000000000021"));
  if (nlUsersBefore) nlG._users = nlUsersBefore; else delete nlG._users;
  w.MdeRolloutV2Tool._pane("members");
  $("mvMemRead").click();
  ok("the members read again, as before", await until(() => st().mem.model && !st().mem.loading && br() && br().outsideParent.length === 4, 20000, "members re-read (restored)"));
  await idle();

  // ------------------------------------------------------- exports --
  const md = w.MdeRollout.markdown(st().model, st().pairs, st().retire, st().waveRows, { tenant: "Contoso" });
  ok("the markdown export carries the four sections", /## Wave and exclusion groups/.test(md) && /## New policies/.test(md) && /## Old policies colliding/.test(md) && /## Retirement check/.test(md));

  // ------------------------------- 🧪 pilots off; the bar's box (10645) --
  // Mihai's LAPS dry run excluded one wave only: the bar's group box still
  // held a group typed for a policy action, and in the fixes it replaced
  // every proposal. The fixes take no typed group now. And "when adding the
  // wave groups to new policies remove the pilot groups" (option A: both
  // sides) — a pilot group on the new AV policy and excluded from the old one.
  const pilotId = TT.G(38);
  TT.GROUPS.push({ id: pilotId, displayName: "INT-SG-D-Win-Pilot", description: "MDE pilot devices.", groupTypes: [], securityEnabled: true, mailEnabled: false,
    isAssignableToRole: false, membershipRule: null, createdDateTime: new Date().toISOString(), memberCount: 3, _kind: "device" });
  const avNewT = TT.CONFIG_POLICIES.find((p) => /Defender Antivirus - D - AV Configuration/.test(p.name));
  const avOldT = TT.CONFIG_POLICIES.find((p) => p.name === "(TO-BE-REMOVED)PVM-DG-CORP-ENDSEC-WIN-AV-PRD");
  const tgt = (type) => ({ "@odata.type": `#microsoft.graph.${type}`, groupId: pilotId, deviceAndAppManagementAssignmentFilterId: null, deviceAndAppManagementAssignmentFilterType: "none" });
  avNewT.assignments.push({ id: `${pilotId}_inc`, source: "direct", target: tgt("groupAssignmentTarget") });
  avOldT.assignments.push({ id: `${pilotId}_exc`, source: "direct", target: tgt("exclusionGroupAssignmentTarget") });
  $("mvRun").click();
  await sleep(50);
  ok("re-read with the pilot on both AV policies", await until(() => !st().reps.busy && $("mvBody").querySelector(".ep-rail") && st().model && st().model.newP.some((P) => P.reach.inc.has(pilotId)), 30000, "pilot read"));
  await idle();
  const avP = () => st().pairs.find((p) => p.O.name === "(TO-BE-REMOVED)PVM-DG-CORP-ENDSEC-WIN-AV-PRD" && /Defender Antivirus - D/.test(p.N.name));
  const avPil = avP().proposal.pilots;
  ok("⚔️ the AV fix takes the pilot off both sides: the new policy's include, the old policy's exclusion", avPil && avPil.steps.map((x) => `${x.side}:${x.groupName}`).sort().join() === "new:INT-SG-D-Win-Pilot,old:INT-SG-D-Win-Pilot", avPil && JSON.stringify(avPil.kept.map((k) => k.why)));
  w.MdeRolloutV2Tool._pane("conflicts");
  ok("…shown in the proposal, with the tick", /− remove include INT-SG-D-Win-Pilot/.test($("mvBody").textContent) && /− remove exclusion INT-SG-D-Win-Pilot/.test($("mvBody").textContent) && !!D.querySelector("[data-mrpilots]:checked"));
  D.querySelectorAll("[data-mrpair]:checked").forEach((b) => { b.checked = false; b.dispatchEvent(new w.Event("change", { bubbles: true })); });
  const avBox = D.querySelector(`[data-mrpair="${avP().id}"]`);
  avBox.checked = true; avBox.dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mvGroup").value = "INT-SG-D-WAVE-Euro";   // a leftover from a policy action
  ok("the fixes bar has no group box, and says what the dry run will do", $("mvGroup").style.display === "none" && /→ .*out of 1 old policy.*🧪 2 pilot assignments off/.test($("mvBarFixes").textContent), $("mvBarFixes").textContent);
  $("mvDryRun").click();
  ok("the dry run follows the proposal, not the box: the pilot off both policies", await until(() => st().plan && st().plan.changes, 10000, "pilot plan")
    && st().plan.changes.some((o) => o.policy.name === avOldT.name && o.details.some((d) => d.action === "remove" && d.group.id === pilotId && d.removes === "exclusion"))
    && st().plan.changes.some((o) => o.policy.name === avNewT.name && o.details.some((d) => d.action === "remove" && d.group.id === pilotId && d.removes === "include"))
    && /pilot assignments off/.test(st().plan.title), st().plan && st().plan.title);
  $("mvDiscard").click();
  D.querySelector("[data-mrpilots]").click();
  ok("the tick off: no pilot steps, kept for the tenant", st().cfg.pilotGroupsOff === false && !avP().proposal.pilots.steps.length && !/pilot assignment/.test($("mvBarFixes").textContent));
  D.querySelector("[data-mrpilots]").click();
  ok("…and on again", st().cfg.pilotGroupsOff === true && avP().proposal.pilots.steps.length === 2);
  avBox.checked = false; D.querySelector(`[data-mrpair="${avP().id}"]`).checked = false; D.querySelector(`[data-mrpair="${avP().id}"]`).dispatchEvent(new w.Event("change", { bubbles: true }));
  // ⚡① reaches the pilots too: the AV policy has its wave, the old one has it out
  w.MdeRolloutV2Tool._pane("waves");
  const r1 = w.MdeRollout.rolloutWants("includeWaves", st().model, { kinds: new Map(), found: null, twins: new Map(), names: new Map(st().model.policies.flatMap((P) => (P.item.assignments || []).map((a) => [String(a.groupId || "").toLowerCase(), a.name]))), pairs: st().pairs });
  ok("⚡① lists the pilot removals where the swap is complete, or says why not", r1.wants.some((x) => x.action === "remove" && x.groupId === pilotId) || r1.skipped.some((x) => /INT-SG-D-Win-Pilot/.test(x)));

  // 🌊 Waves beside a single group in the policy bar (Mihai: "the option
  // to add or exclude the waves beside a single group")
  w.MdeRolloutV2Tool._pane("new");
  const edgeN = st().model.newP.find((p) => /Microsoft Edge - D - Security/.test(p.name));
  D.querySelectorAll("[data-mrpick]:checked").forEach((b) => { b.checked = false; b.dispatchEvent(new w.Event("change", { bubbles: true })); });
  const pk = D.querySelector(`[data-mrpick="${edgeN.key}"]`);
  pk.checked = true; pk.dispatchEvent(new w.Event("change", { bubbles: true }));
  D.querySelector('#mvActSeg [data-mract="add-include"]').click();
  D.querySelector('#mvTargetSeg [data-mrtarget="waves"]').click();
  ok("the bar offers 🌊 Waves beside Group: no group box, the kind and regions said", $("mvGroup").style.display === "none" && $("mvBarWaves").style.display !== "none" && /each policy's kind/.test($("mvBarWaves").textContent));
  $("mvDryRun").click();
  ok("🌊 Waves → include: the - D - policy gets the device waves, not the user waves", await until(() => st().plan && st().plan.changes, 10000, "waves plan")
    && /Include the waves/.test(st().plan.title) && st().plan.changes.length === 1
    && st().plan.changes[0].details.filter((d) => d.action === "add-include").map((d) => d.group.displayName).every((n) => /^INT-SG-D-WAVE-/.test(n))
    && st().plan.changes[0].details.some((d) => d.group.displayName === "INT-SG-D-WAVE-Euro"), st().plan && JSON.stringify(st().plan.changes.map((o) => o.details.map((d) => d.group.displayName))));
  $("mvDiscard").click();
  // 🧪 Add include only adds (10653, Mihai: "add include, should only add
  // include or there should be an option to also remove the others";
  // option A off the mockup): the pilots come off only with the bar's tick
  const avN = st().model.newP.find((p) => /Defender Antivirus - D - AV Configuration/.test(p.name));
  // Edge (no wave yet) and the AV policy (Euro in, the pilot on). Where the
  // pilot may come off is ⚔️'s business (pilotsFor, tested above); here the
  // bar is held to what it does with the answer, so the answer is fixed.
  const realPF = w.MdeRollout.pilotsFor;
  w.MdeRollout.pilotsFor = () => ({ steps: [{ P: avN, groupId: pilotId, groupName: "INT-SG-D-Win-Pilot", side: "new", note: "pilot: the waves take over" }], kept: [] });
  const pkAv = D.querySelector(`[data-mrpick="${avN.key}"]`);
  pkAv.checked = true; pkAv.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the bar has the pilot tick beside 🌊 Waves, off — whatever ⚔️'s own tick says", $("mvBarPilotsL").style.display !== "none" && !$("mvBarPilots").checked && st().cfg.pilotGroupsOff === true);
  const removes = () => st().plan.changes.flatMap((o) => o.details.filter((d) => d.action === "remove"));
  $("mvDryRun").click();
  ok("tick off (the default): the waves in, nothing removed, no REMOVE to type", await until(() => st().plan && st().plan.changes, 10000, "add-only plan")
    && removes().length === 0 && st().plan.changes.every((o) => o.details.every((d) => d.action === "add-include")) && !/pilot assignment/.test(st().plan.title) && !$("mvConfirmText"));
  ok("…and the pilot kept on is said, with the tick to use", (st().plan.skipped || []).some((x) => /1 pilot assignment stays on \(INT-SG-D-Win-Pilot\)/.test(x) && /also take the pilot groups off/.test(x)), JSON.stringify(st().plan.skipped));
  $("mvDiscard").click();
  $("mvBarPilots").checked = true; $("mvBarPilots").dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mvDryRun").click();
  ok("tick on: the pilot comes off the AV policy as well, typed REMOVE", await until(() => st().plan && st().plan.changes, 10000, "pilot-on plan")
    && removes().some((d) => d.group.id === pilotId) && /1 pilot assignment off/.test(st().plan.title) && !!$("mvConfirmText"));
  w.MdeRollout.pilotsFor = realPF;
  $("mvBarPilots").checked = false; $("mvBarPilots").dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("a change of the tick drops the plan it no longer matches", !st().plan && !$("mvDiscard"));
  D.querySelector('#mvActSeg [data-mract="remove"]').click();
  ok("Remove has no pilot tick", $("mvBarPilotsL").style.display === "none");
  D.querySelector('#mvActSeg [data-mract="add-include"]').click();
  D.querySelector('#mvTargetSeg [data-mrtarget="group"]').click();
  ok("back to Group: the box returns", $("mvGroup").style.display !== "none" && $("mvBarWaves").style.display === "none" && $("mvBarPilotsL").style.display === "none");

  // ------------------------- 🧪 pilots: ready for the wave (10647, 10649) --
  // Mihai: "select the user, and it then should be removed from the pilot
  // groups and the device should be moved to the right group. The user is
  // then ready for the wave" — option A: back to their country, they wait.
  const deRow = mrow("de");
  const deDev = deRow.devices.find((d) => d.objId && !d.held);
  const deUserId = deDev.userId;
  const noPrim = TT.DEVICES.find((d) => d.operatingSystem === "Windows" && !d.userId && d.azureADDeviceId);
  const gPilD = TT.GROUPS.find((g) => g.id === pilotId);
  gPilD._devices = [deDev.objId].concat(noPrim ? [noPrim.azureADDeviceId] : []);
  const pilotUId = TT.G(39);
  TT.GROUPS.push({ id: pilotUId, displayName: "INT-SG-U-Win-Pilot", description: "MDE pilot users.", groupTypes: [], securityEnabled: true, mailEnabled: false,
    isAssignableToRole: false, membershipRule: null, createdDateTime: new Date().toISOString(), memberCount: 1, _kind: "user", _users: [deUserId] });
  w.MdeRolloutV2Tool._pane("members");
  $("mvMemRead").click();
  ok("👥 read again, with the pilot groups", await until(() => !st().mem.loading && mm() && mm().pilots && mm().pilots.people.length >= 1, 20000, "pilot people"));
  const person = () => mm().pilots.people.find((p) => p.userId === deUserId);
  const devOf = () => person() && person().devices.find((d) => d.id === deDev.objId);
  ok("one row per person: the German pilot user with their laptop, both in a pilot group, country known",
    person() && person().state === "ready" && person().userPilots.map((g) => g.id).join() === pilotUId && devOf() && devOf().pilots.map((g) => g.id).join() === pilotId
    && person().deviceGroupName === "INT-SG-D-DEU" && !devOf().inGroup, JSON.stringify(mm().pilots.people.map((p) => [p.upn, p.state])));
  ok("a pilot device with no primary user has no person — listed as loose", !noPrim || mm().pilots.loose.some((x) => x.id === noPrim.azureADDeviceId));
  D.querySelector("[data-mrpilview]").click();
  ok("🧪 Pilots opens per person: the device under its user, and what the plan would do",
    st().mem.pil && /Person · devices/.test($("mvBody").textContent) && /− out of the pilot/.test($("mvBody").textContent) && /\+ into INT-SG-D-DEU/.test($("mvBody").textContent));
  ok("⚠ the policy gaps are a warning for when the wave goes live, not a block", /Before their waves go live/.test($("mvBody").textContent)
    && /PVM-DG-CORP-ENDSEC-WIN-AV-PRD excludes INT-SG-D-Win-Pilot but not INT-SG-D-WAVE-Euro/.test($("mvBody").textContent) && !!D.querySelector(`[data-mrpilsel="p|${deUserId}"]`));
  const tickP = (k) => { const b = D.querySelector(`[data-mrpilsel="${k}"]`); b.checked = true; b.dispatchEvent(new w.Event("change", { bubbles: true })); };
  tickP(`p|${deUserId}`);
  ok("the bar says it: out of the pilot, one device into its country group", /1 person/.test($("mvPilBar").textContent) && /out of the pilot · 1 device into their country group/.test($("mvPilBar").textContent), $("mvPilBar").textContent);
  $("mvPilDry").click();
  const pOps = () => st().plan.ops;
  ok("the dry run: the laptop into INT-SG-D-DEU, then out of the device pilot (only once that add is clean), then the user out of the user pilot",
    st().plan && st().plan.pilotsReady && pOps().map((o) => o.type).join() === "add,remove,remove" && pOps()[0].group.name === "INT-SG-D-DEU" && pOps()[0].ids.join() === deDev.objId
    && pOps()[1].group.id === pilotId && pOps()[1].needsOk.join() === "0" && pOps()[2].group.id === pilotUId && pOps()[2].memberKind === "user" && !!$("mvConfirmText"),
    st().plan && JSON.stringify(pOps().map((o) => [o.type, o.group && o.group.name])));
  ok("…and it says what that means until the wave: the old policies reach them again", /old ones reach them again/.test($("mvPlan").textContent));
  ok("…the plan opens under the pilots' bar", $("mvPilBar").nextElementSibling === $("mvPlan"));
  w.MdeRolloutV2Tool._pane("how");
  ok("on another pane the plan is hidden (Mihai: \"the plan below shouldn't be there\")", $("mvPlan").style.display === "none" && !!st().plan);
  w.MdeRolloutV2Tool._pane("members");
  ok("…and back on its own pane", $("mvPlan").style.display !== "none" && !!st().plan && $("mvPilBar").nextElementSibling === $("mvPlan"));
  $("mvConfirmText").value = "REMOVE"; $("mvConfirmText").dispatchEvent(new w.Event("input"));
  const pRuns = st().runs.length;
  await v2Gates(); $("mvMemApply").click();
  const deuG = () => TT.GROUPS.find((g) => g.displayName === "INT-SG-D-DEU");
  ok("applied: the laptop is in INT-SG-D-DEU, out of the device pilot; the user out of the user pilot; the person is gone from the list", await until(() => st().runs.length === pRuns + 1, 10000, "ready run")
    && st().runs[pRuns].ok === 3 && (deuG()._devices || []).includes(deDev.objId) && !gPilD._devices.includes(deDev.objId)
    && !(TT.GROUPS.find((g) => g.id === pilotUId)._users || []).includes(deUserId) && !person(), st().runs[pRuns] && st().runs[pRuns].lines.join(" | "));
  ok("…and the countries view moved with it: DE's device group holds the laptop", mrow("de").have.has(deDev.objId));
  w.MdeRolloutV2Tool._pane("changes");
  D.querySelector(`[data-mrundo="${pRuns}"]`).click();
  ok("undo plans the reverse: back into both pilots, out of the country group", await until(() => st().plan && /Undo/.test(st().plan.title), 5000, "ready undo") && st().plan.ops.map((o) => o.type).sort().join() === "add,add,remove");
  $("mvConfirmText").value = "REMOVE"; $("mvConfirmText").dispatchEvent(new w.Event("input"));
  await v2Gates(); $("mvMemApply").click();
  ok("undone: in the pilots again, out of INT-SG-D-DEU, listed again", await until(() => gPilD._devices.includes(deDev.objId) && (TT.GROUPS.find((g) => g.id === pilotUId)._users || []).includes(deUserId) && !(deuG()._devices || []).includes(deDev.objId) && !!person(), 10000, "ready undo applied"));

  // ------------------------------------ 🎛 adjust settings (10657) --
  const ASRD = "device_vendor_msft_policy_config_defender_attacksurfacereductionrules";
  const OBFS = "blockexecutionofpotentiallyobfuscatedscripts";
  const obfPol = TT.CONFIG_POLICIES.find((p) => /^WIN-SEC-AttackSurfaceReduction-D-02/.test(p.name));
  const obfMode = () => { const r = w.MdeAsr.findRule(obfPol._settings, OBFS); return r ? w.MdeAsr.modeOfValue(OBFS, r.choiceSettingValue.value) : null; };
  const oldPol = TT.CONFIG_POLICIES.find((p) => p.name === "PVM-DG-CORP-ENDSEC-WIN-ASR-PRD");
  const oldBefore = JSON.stringify(oldPol._settings);
  w.MdeRolloutV2Tool._pane("new");
  ok("🎛 its rail node is there once the tenant is read (10678: no header button)", !!D.querySelector('[data-mrpane="asr"]') && !$("mvAsr"));
  D.querySelector('[data-mrpane="asr"]').click();
  ok("🎛 it opens its own pane, on the rail", st().pane === "asr" && !!$("mvBody").querySelector('.t28-subnav [data-mrpane="asr"].active') && !!$("mvAsrCard"));
  const sel = () => $("mvBody").querySelector(`[data-mrasr$="|${OBFS}"]`);
  const obfGen = () => st().model.policies.find((p) => p.id === obfPol.id).generation;
  ok("🎛 the one-rule WIN-SEC policy is listed, Block now (➕ included earlier in this run, so not marked left out)", !!sel() && sel().value === "block" && obfGen() === "new" && !/➖/.test(sel().closest("tr").textContent));
  ok("🎛 mobile (10658): the mode picker's cell is labelled for the card layout, beside Now and Baseline", sel().closest("td").dataset.label === "New" && !!sel().closest("tr").querySelector('td[data-label="Now"]') && !!sel().closest("tr").querySelector('td[data-label="Baseline"]'));
  ok("🎛 mobile (10658): below 760px the table becomes cards", /@media \(max-width:760px\)\{[^]*?\.mr-asr-table tr\{display:grid/.test(require("fs").readFileSync(require("path").join(ROOT, "css/app.css"), "utf8")));
  ok("🎛 the old all-rules policy is not listed", !/PVM-DG-CORP-ENDSEC-WIN-ASR-PRD/.test($("mvAsrCard").textContent));
  ok("🎛 Block against the baseline's Audit reads ≠ baseline", /≠ baseline/.test(sel().closest("tr").textContent));
  sel().value = "audit"; sel().dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("🎛 a change shows the bar: 1 change in 1 policy", st().asr.edits.size === 1 && /1 change in 1 policy/.test($("mvBody").querySelector(".mr-asrbar").textContent));
  $("mvAsrDry").click();
  ok("🎛 the dry run reads fresh and plans Block → Audit, under the card", await until(() => st().plan && st().plan.kind === "asr", 8000, "asr plan") && st().plan.items.length === 1 && st().plan.items[0].changes[0].to === "audit" && /Block → Audit/.test($("mvPlan").textContent));
  ok("🎛 Apply is locked before the backup and the tick", $("mvApply").disabled);
  $("mvBackup").click(); $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  await v2Gates();
  ok("🎛 …and unlocked after both (and a risk decision where a mode goes down)", !$("mvApply").disabled);
  await v2Gates(); $("mvApply").click();
  ok("🎛 applied: the demo tenant holds Audit, verified, the run in 📜", await until(() => obfMode() === "audit" && st().runs.some((r) => r.kind === "settings" && r.ok === 1), 8000, "asr apply"));
  ok("🎛 the other policy's settings were not touched", JSON.stringify(oldPol._settings) === oldBefore);
  ok("🎛 the row reads Audit now and the edit is gone", !st().asr.edits.size && sel().value === "audit" && /matches/.test(sel().closest("tr").textContent));
  const aRun = st().runs.findIndex((r) => r.kind === "settings");
  w.MdeRolloutV2Tool._pane("changes");
  D.querySelector(`[data-mrundo="${aRun}"]`).click();
  ok("🎛 undo plans Audit → Block on the 🎛 pane", await until(() => st().plan && st().plan.kind === "asr" && /Undo/.test(st().plan.title), 8000, "asr undo") && st().pane === "asr" && st().plan.items[0].changes[0].to === "block");
  $("mvBackup").click(); $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  await v2Gates(); $("mvApply").click();
  ok("🎛 undone: Block again in the demo tenant", await until(() => obfMode() === "block" && st().runs.filter((r) => r.kind === "settings").length === 2, 8000, "asr undo applied"));
  // drift: the tenant moves between the dry run and apply → skipped, not written
  sel().value = "warn"; sel().dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mvAsrDry").click();
  await until(() => st().plan && st().plan.kind === "asr" && !/Undo/.test(st().plan.title), 8000, "asr plan 2");
  w.MdeAsr.findRule(obfPol._settings, OBFS).choiceSettingValue.value = `${ASRD}_${OBFS}_off`;
  obfPol.lastModifiedDateTime = new Date(Date.now() + 1000).toISOString();
  $("mvBackup").click(); $("mvConfirmTick").checked = true; $("mvConfirmTick").dispatchEvent(new w.Event("change"));
  await v2Gates(); $("mvApply").click();
  ok("🎛 a policy changed since the dry run is skipped as drifted, not written", await until(() => st().runs.filter((r) => r.kind === "settings").length === 3, 8000, "asr drift") && obfMode() === "off" && /drifted/.test(st().runs[st().runs.length - 1].lines.join()));
  w.MdeAsr.findRule(obfPol._settings, OBFS).choiceSettingValue.value = `${ASRD}_${OBFS}_block`;

  // A cold project reads automatically; no permission means a visible connect step.
  const heldGet = w.PolicyCache.get, heldReading = w.PolicyCache.reading, rf = w.PolicyCache.refresh;
  let fresh = 0;
  w.PolicyCache.refresh = (...a) => { fresh++; return rf(...a); };
  w.PolicyCache.get = () => null; w.PolicyCache.reading = () => false;
  w.dispatchEvent(new w.Event("tuno:signout"));
  w.TunoScreenHooks["screen-mderollout"]();
  await until(() => st().project.attempted.size === 4, 30000, "cold sources"); await idle();
  ok("cold open automatically reads policies once", !!st().model && fresh === 1);
  w.PolicyCache.get = heldGet; w.PolicyCache.reading = heldReading; w.PolicyCache.refresh = rf;

}

run().then(() => {
  console.log(`mderollout-screen: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
}).catch((e) => { console.error(e); process.exit(1); });

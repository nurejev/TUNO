// T28 V2 — the gates V2 added in 10660 (risk decisions, group backups and
// drift checks, verified-only member updates, run files), driven in DEMO
// mode through the whole app. Since 10661 V2 is the only T28 screen: there
// is no version switch, the tile opens V2, and the original screen's saved
// naming rules are carried over once (the second scenario below). The
// screen's full regression suite is tests/mderollout/screen.test.js.
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
  const bridge = ";Object.assign(window,{TOOL_VERSIONS,Graph,PolicyCache,MdeRollout,AssignEdit,TUNO_DEMO_GRAPH,MdeMembers,MdeAsr,MdeRolloutV2Tool,T28V2Safety,TunoTenant});";
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
  const { w, store } = boot(), D = w.document, $ = (id) => D.getElementById(id);
  const tool = w.MdeRolloutV2Tool, st = () => tool._state();
  const idle = () => until(() => !st().running && !st().busy && !st().enriching, 15000, "V2 idle");
  const change = (el, value) => { if (el.type === "checkbox") el.checked = value; else el.value = value; el.dispatchEvent(new w.Event(el.type === "checkbox" ? "change" : "input", { bubbles: true })); };
  const originalUrl = w.location.href;
  // Since 10674 T28 lives in workspace 02 Projects, and the shell says so in
  // the address (?ws=projects, js/workspaces.js). That is the side, not T28:
  // T28 itself never changes the address, which is what these checks hold.
  const sansWs = (u) => { const x = new w.URL(u); x.searchParams.delete("ws"); return x.href; };
  const ids = [...D.querySelectorAll("[id]")].map((e) => e.id);
  ok("every DOM id is unique", ids.length === new Set(ids).size);
  ok("there is no version switch and no original screen (10661)", !$("t28Version1") && !$("t28Version2") && !$("t28Workspace1") && !!$("t28Workspace2") && !$("t28Workspace2").hidden);
  ok("the original controller and V2's engine copy are gone; V2 runs on the one engine", w.eval('typeof MdeRolloutTool === "undefined" && typeof MdeRolloutV2 === "undefined"') === true && typeof w.MdeRollout.build === "function");
  $("demoLink").click();
  await until(() => w.PolicyCache.get(), 20000, "demo sign in");
  $("toolMdeRollout").click();
  ok("the tile opens the V2 screen without changing URL", sansWs(w.location.href) === originalUrl && $("screen-mderollout").classList.contains("active") && !$("t28Workspace2").hidden);
  ok("the screen hook is V2's own", typeof w.TunoScreenHooks["screen-mderollout"] === "function" && !w.TunoScreenHooks["screen-mderollout-v2"]);
  ok("opening has no implicit tenant read", !st().model && !!$("mvBody").querySelector(".mr-offer"));
  $("mvBody").querySelector('[data-mrread="attach"]').click();
  await until(() => st().model, 20000, "V2 model"); await idle();
  ok("V2 starts on the overview", st().pane === "overview" && !!$("mvBody").querySelector(".v2-overview"));
  ok("overview does not invent applied protection", /Device compliance and applied protection remain unverified/.test($("mvBody").textContent));
  ok("all six workflow steps are navigable", $("mvBody").querySelectorAll(".v2-card[data-mrpane]").length === 6);
  for (const p of ["new", "old", "retire", "waves", "members", "exclusions", "reports", "changes", "rules", "how", "out", "asr", "edgeext", "recovery"]) {
    tool._pane(p); ok(`V2 pane ${p} renders`, !!$("mvBody").textContent.trim());
  }
  const ASR = "WIN-SEC-AttackSurfaceReduction-D-02_Block execution of potentially obfuscated scripts-v1.0";
  const OBFS = "blockexecutionofpotentiallyobfuscatedscripts";
  tool._pane("asr");
  ok("Leave out ASR rows locked by default", !$("mvBody").querySelector(`[data-mrasr$="|${OBFS}"]`));
  change($("mvLeftOutOpt"), true);
  let select = $("mvBody").querySelector(`[data-mrasr$="|${OBFS}"]`);
  ok("explicit ASR exception unlocks row", !!select);
  select.value = "audit"; select.dispatchEvent(new w.Event("change", { bubbles: true }));
  $("mvAsrDry").click(); await until(() => st().plan && st().plan.kind === "asr", 10000, "ASR plan");
  change($("mvConfirmTick"), true); $("mvBackup").click();
  ok("backup and confirmation do not bypass reduced-enforcement gate", $("mvApply").disabled && /reduces enforcement/.test($("mvPlan").textContent));
  change($("mvRiskReason"), "test"); change($("mvRiskAccept"), true);
  ok("short risk reason keeps Apply locked", $("mvApply").disabled);
  change($("mvRiskReason"), "Approved change for a controlled audit pilot.");
  ok("recorded reason and explicit acceptance unlock Apply", !$("mvApply").disabled);
  $("mvApply").click(); await until(() => st().runs.some((r) => r.kind === "settings"), 10000, "ASR apply");
  ok("real controller writes simulated Graph and records risk decision", st().runs[0].kind === "settings" && st().runs[0].ok === 1 && st().runs[0].risk.reason.includes("controlled audit"));
  // Include this policy using V2's naming rules; the original defaults stay intact.
  tool._pane("out"); $("mvBody").querySelector(`[data-mrinclude="${ASR}"]`).click();
  ok("V2 rule change stored under its own tenant key, the original key never written", [...store.keys()].some((k) => k.startsWith("tuno.t28.v2.rules.")) && ![...store.keys()].some((k) => k.startsWith("tuno.t28.rules.")) && !st().cfg.leaveOut.includes(ASR));
  // Retirement gates for an old ASR policy with settings not covered by new set.
  tool._pane("old");
  const old = st().model.oldP.find((p) => /PVM-DG-CORP-ENDSEC-WIN-ASR-PRD/.test(p.name));
  change($("mvBody").querySelector(`[data-mrpick="${old.key}"]`), true);
  $("mvActSeg").querySelector('[data-mract="add-exclude"]').click();
  change($("mvGroup"), st().waveRows.find((x) => x.exists && x.kind === "user").group.id);
  $("mvDryRun").click(); await until(() => st().plan, 10000, "retirement plan");
  ok("old exclusion with unproven coverage has a risk gate", !!$("mvRiskReason") && /retirement/.test($("mvPlan").textContent));
  $("mvDiscard").click();
  // Member backup, apply, and exact delta undo using the existing Graph demo.
  tool._pane("members"); $("mvMemRead").click();
  await until(() => st().mem.model && !st().mem.loading, 15000, "members read");
  const tick = $("mvBody").querySelector('[data-mrmemsel="de"]'); change(tick, true);
  $("mvMemDry").click(); await until(() => st().plan && st().plan.members, 10000, "member plan");
  change($("mvConfirmTick"), true);
  ok("members require backup in addition to confirmation", $("mvMemApply").disabled);
  $("mvMemberBackup").click(); await until(() => !$("mvMemApply").disabled, 10000, "group backup");
  ok("membership backup unlocks Apply", !$("mvMemApply").disabled);
  $("mvMemApply").click(); await until(() => st().runs.some((r) => r.kind === "members"), 15000, "member apply");
  const mr = st().runs.find((r) => r.kind === "members");
  ok("all member steps verified", mr.ok === 4 && mr.bad === 0, JSON.stringify(mr.lines));
  ok("new group reference resolved in verified done", mr.done.some((d) => d.type === "add") && mr.done.some((d) => d.type === "nest" && d.child.id));
  ok("member backup retained with run", Array.isArray(mr.backup.membership) && mr.backup.membership.length > 0);
  tool._pane("changes"); $("mvBody").querySelector(`[data-mrundo="${st().runs.indexOf(mr)}"]`).click();
  await until(() => st().plan && /Undo/.test(st().plan.title), 10000, "member undo plan");
  ok("undo is planned from actual verified deltas", st().plan.ops.map((o) => o.type).join() === "unnest,unnest,remove");
  change($("mvConfirmText"), "REMOVE"); $("mvMemberBackup").click(); await until(() => !$("mvMemApply").disabled, 10000, "undo backup");
  $("mvMemApply").click(); await until(() => st().runs.filter((r) => r.kind === "members").length === 2, 10000, "undo write");
  ok("member undo also verified", st().runs.filter((r) => r.kind === "members")[1].bad === 0);
  // Membership drift after backup blocks all writes at Apply.
  tool._pane("members"); change($("mvBody").querySelector('[data-mrmemsel="de"]'), true);
  $("mvMemDry").click(); await until(() => st().plan && st().plan.members, 10000, "drift plan");
  change($("mvConfirmTick"), true); $("mvMemberBackup").click(); await until(() => !$("mvMemApply").disabled, 10000, "drift backup");
  const unchanged = w.T28V2Safety.unchanged;
  w.T28V2Safety.unchanged = async () => false;
  $("mvMemApply").click(); await until(() => !st().busy && /Group membership changed/.test($("mvLedger").textContent), 10000, "drift rejection");
  ok("group drift blocks writing and preserves the run count", st().runs.length === 3 && /Group membership changed/.test($("mvLedger").textContent));
  w.T28V2Safety.unchanged = unchanged; $("mvDiscard").click();
  // A pending plan is discarded explicitly; nothing switches it away any more.
  tool._pane("waves"); $("mvBody").querySelector('[data-mrroll="includeWaves"]').click();
  await until(() => st().plan && !st().busy, 10000, "pending plan");
  $("mvDiscard").click();
  ok("Discard clears the pending plan", !st().plan);
  ok("same URL after a complete session", sansWs(w.location.href) === originalUrl);
  ok("…on workspace 02, where T28 lives (10674)", w.document.body.dataset.ws === "projects" && new w.URL(w.location.href).searchParams.get("ws") === "projects");
  tool._pane("recovery");
  ok("run files explicitly explain reload restore limitation", /Automatic restore after reloading is not implemented/.test($("mvBody").textContent));
  const imports = { schema: "tuno.t28.v2.run-bundle/1", tenantId: w.TunoTenant.tenantId() || "demo", exportedAt: "2026-09-30", runs: [{ title: "<img src=x onerror=alert(1)>", kind: "members", lines: ["<script>bad()</script>"] }] };
  Object.defineProperty($("mvImportRuns"), "files", { value: [{ size: 100, text: async () => JSON.stringify(imports) }] });
  $("mvImportRuns").dispatchEvent(new w.Event("change", { bubbles: true }));
  await until(() => /Imported record/.test($("mvBody").textContent), 5000, "import");
  ok("import renders text without injecting markup", !$("mvBody").querySelector("img,script") && /onerror/.test($("mvBody").textContent));
  ok("import does not populate live undo history", st().runs.length === 3);
  // A successful write with failed read-back must invalidate readiness.
  tool._pane("members");
  change($("mvBody").querySelector('[data-mrmemsel="de"]'), true);
  $("mvMemDry").click(); await until(() => st().plan && st().plan.members, 10000, "uncertain plan");
  const uncertainOp = st().plan.ops.find((o) => o.type === "nest" && o.child.id);
  const realApply = w.MdeMembers.applyOps;
  w.MdeMembers.applyOps = async () => ({ created: new Map(), results: [{ op: uncertainOp, ok: true, verified: false }], done: [{ ...uncertainOp }] });
  change($("mvConfirmTick"), true); $("mvMemberBackup").click(); await until(() => !$("mvMemApply").disabled, 10000, "uncertain backup");
  $("mvMemApply").click(); await until(() => st().runs.length === 4, 10000, "uncertain result");
  w.MdeMembers.applyOps = realApply;
  ok("uncertain member result clears readiness and cached inventory", st().mem.model === null && st().mem.input === null);
  ok("uncertain writes are recorded separately and omitted from blind undo", st().runs[3].done.length === 0 && st().runs[3].uncertainDone.length === 1);
  w.dispatchEvent(new w.Event("tuno:signout"));
  ok("signout clears T28's tenant state", !st().model && st().runs.length === 0);
  w.close();
  await carryOver();
}
// 10661: the original screen kept its naming rules under
// tuno.t28.rules.<tenant>. A tenant with no V2 rules yet starts from those
// (same engine, same shape), saved under the V2 key once and said on the
// Naming rules pane; V2's own rules win when both exist; the old key is
// never written.
async function carryOver() {
  for (const both of [false, true]) {
    const { w, store } = boot(), D = w.document, $ = (id) => D.getElementById(id);
    const tool = w.MdeRolloutV2Tool, st = () => tool._state();
    $("demoLink").click();
    await until(() => w.PolicyCache.get(), 20000, "demo sign in (carry-over)");
    const tid = String(w.TunoTenant.tenantId() || "default").toLowerCase();
    const old = w.MdeRollout.normConfig(null);
    old.newPrefixes = old.newPrefixes.concat(["WIN-CARRIED"]);
    const oldRaw = JSON.stringify(old);
    store.set("tuno.t28.rules." + tid, oldRaw);
    if (both) { const own = w.MdeRollout.normConfig(null); own.newPrefixes = own.newPrefixes.concat(["WIN-OWN"]); store.set("tuno.t28.v2.rules." + tid, JSON.stringify(own)); }
    $("toolMdeRollout").click();
    $("mvBody").querySelector('[data-mrread="attach"]').click();
    await until(() => st().model, 20000, "carry-over read");
    await until(() => !st().running && !st().busy && !st().enriching, 15000, "carry-over idle");
    tool._pane("rules");
    if (!both) {
      ok("no V2 rules yet: the original screen's saved rules are carried over", st().cfg.newPrefixes.includes("WIN-CARRIED"));
      ok("…saved once under the V2 key", /WIN-CARRIED/.test(store.get("tuno.t28.v2.rules." + tid) || ""));
      ok("…and the Naming rules pane says so", /Carried over/.test($("mvBody").textContent));
    } else {
      ok("V2's own rules win over the original screen's", st().cfg.newPrefixes.includes("WIN-OWN") && !st().cfg.newPrefixes.includes("WIN-CARRIED"));
      ok("…and nothing claims a carry-over", !/Carried over/.test($("mvBody").textContent));
    }
    ok(`the original screen's key is left exactly as it was (${both ? "both keys" : "old key only"})`, store.get("tuno.t28.rules." + tid) === oldRaw);
    w.close();
  }
  console.log(`T28 V2 workspace: ${passed} passed, ${failed} failed`); process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

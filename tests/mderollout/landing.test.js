// T28 — 📡 Landing (build 10689, Mihai 7 Oct: "make sure that the
// policies are landing on the users and devices. which of the new policies
// have landed or are in error or in conflict" — option A off the mockup
// canvas). Intune's check-in status per new policy (one cached report
// each) joined to the waves' members: per policy and per wave the counts,
// per member a chip per policy and a verdict; conflicts explained by T12's
// setting read and the ⚔️ pairs; a fourth 📑 report with a CSV.
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
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,MdeRollout,MdeReports,MdeLanding,ConflictDevices,TUNO_DEMO_GRAPH,TOOL_VERSIONS});";
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
  const L = w.MdeLanding;
  ok("index.html loads js/mdelanding.js before the T28 screen", files.indexOf("js/mdelanding.js") > -1 && files.indexOf("js/mdelanding.js") < files.indexOf("js/mderolloutv2.js"));

  // ------------------------------------------------------------ states --
  ok("words win: a _loc column in words decides", L.stateOf({ PolicyStatus: 6, PolicyStatus_loc: "Conflict" }).state === "conflict" && !L.stateOf({ PolicyStatus: 6, PolicyStatus_loc: "Conflict" }).byCode);
  ok("…any status column in words does too", L.stateOf({ AssignmentStatus: "Succeeded" }).state === "landed" && L.stateOf({ Status: "Not applicable" }).state === "na" && L.stateOf({ PolicyStatus: "Pending" }).state === "pending" && L.stateOf({ PolicyStatus: "Error" }).state === "error");
  const c = L.stateOf({ PolicyStatus: 2 });
  ok("a bare code is read by the complianceStatus enum and flagged byCode", c.state === "landed" && c.byCode && /code 2/.test(c.word) && L.stateOf({ PolicyStatus: 5 }).state === "error" && L.stateOf({ PolicyStatus: 7 }).state === "pending" && L.stateOf({ PolicyStatus: 1 }).state === "na");
  ok("an unknown code or no status at all is unreadable, never landed", L.stateOf({ PolicyStatus: 42 }).state === "unreadable" && L.stateOf({ DeviceName: "x" }).state === "unreadable");

  // ------------------------------------------------------------- scope --
  const wave = (id, name, role, audience, region) => ({ id, name, role, audience, region, exists: true });
  const waveRows = [wave("wu", "INT-SG-U-WAVE-Euro", "wave", "user", "Euro"), wave("wd", "INT-SG-D-WAVE-Euro", "wave", "device", "Euro"), wave("wd2", "INT-SG-D-WAVE-Italy", "wave", "device", "Italy"), wave("xd", "INT-SG-D-MDE-Exclusion", "exclusion", "device", "")];
  const pol = (id, name, audience, inc, exc, extra) => Object.assign({ id, key: `settingsCatalog|${id}`, name, audience, reach: { inc: new Set(inc), exc: new Set(exc) }, item: { assignments: inc.map((g) => ({ kind: "Included", groupId: g })).concat(exc.map((g) => ({ kind: "Excluded", groupId: g }))) } }, extra || {});
  const PD = pol("pd", "Win - OIB - SC - Firewall - D - v3.1", "device", ["wd"], ["xd"]);
  const PU = pol("pu", "Win - OIB - SC - Microsoft Edge - U - Extensions - v3.1.2", "user", ["wu"], []);
  const PX = pol("px", "Win - OIB - SC - Something - v1", null, ["wd", "wd2"], []);
  const PN = pol("pn", "Win - OIB - SC - Staged - D - v1", "device", [], []);
  PX.item.assignments[0].filterId = "f1";
  const sc = L.scope([PD, PU, PX, PN], waveRows);
  ok("scope: a policy's waves come from its reach through the wave rows, its excludes from the reach too", sc.policies[0].waves.length === 1 && sc.policies[0].waves[0].name === "INT-SG-D-WAVE-Euro" && sc.policies[0].excludes[0] === "xd" && sc.policies[0].regions[0] === "Euro");
  ok("…a nameless audience takes the kind of the waves it includes, and a filtered assignment is flagged", sc.policies[2].audience === "device" && sc.policies[2].regions.join(",") === "Euro,Italy" && sc.policies[2].filtered);
  ok("…an unassigned policy is not assigned; the waves and exclusion groups to read are collected once", !sc.policies[3].assigned && sc.userWaves.length === 1 && sc.deviceWaves.length === 2 && sc.excludeGroups.join() === "xd");

  // -------------------------------------------------------------- join --
  const members = { users: new Map([["wu", [{ id: "u1", upn: "Eva@x.com" }, { id: "u2", upn: "milan@x.com" }]]]),
    devices: new Map([["wd", [{ id: "o1", deviceId: "aad1", name: "PC1" }, { id: "o2", deviceId: "aad2", name: "PC2" }, { id: "o3", deviceId: "aad3", name: "PC3" }]], ["wd2", [{ id: "o4", deviceId: "aad4", name: "IT4" }]]]),
    excludedBy: new Map([["xd", { users: new Set(), userIds: new Set(), devices: new Set(["aad2"]), deviceIds: new Set() }]]), errors: [] };
  const managed = [{ id: "i1", deviceName: "PC1", azureADDeviceId: "aad1", userPrincipalName: "eva@x.com", lastSyncDateTime: "2026-10-07T10:00:00Z" },
    { id: "i2", deviceName: "PC2", azureADDeviceId: "aad2", userPrincipalName: "p@x.com", lastSyncDateTime: "2026-10-07T09:00:00Z" },
    { id: "i4", deviceName: "IT4", azureADDeviceId: "aad4", userPrincipalName: "it@x.com", lastSyncDateTime: "2026-10-01T09:00:00Z" },
    { id: "i9", deviceName: "PILOT9", azureADDeviceId: "aad9", userPrincipalName: "pilot@x.com", lastSyncDateTime: "2026-10-07T08:00:00Z" }];
  const row = (pid, iid, name, upn, state, when) => ({ policyId: pid, intuneId: iid, name, upn, state, word: state, code: null, byCode: false, when: when || "", filters: "" });
  const status = { at: 1000, rows: 7, codeBased: false, failed: new Map([["px", "403 denied"]]), byPolicy: new Map([
    ["pd", [row("pd", "i1", "PC1", "eva@x.com", "landed", "2026-10-07T09:50:00Z"), row("pd", "i9", "PILOT9", "pilot@x.com", "landed")]],
    ["pu", [row("pu", "i1", "PC1", "eva@x.com", "landed", "2026-10-07T09:50:00Z"), row("pu", "i2", "PC2", "eva@x.com", "pending", "2026-10-07T09:55:00Z"), row("pu", "i9", "PILOT9", "pilot@x.com", "conflict")]],
  ]) };
  const m = L.join(sc, members, managed, status, { now: 2000 });
  const P = (id) => m.policies.find((p) => p.id === id);
  const E = (name) => m.members.find((e) => e.name === name);
  ok("regions come from the policies' waves, in order", m.regions.join(",") === "Euro,Italy");
  const cd = P("pd").cells.get("Euro");
  ok("device policy, Euro: PC1 landed, PC3 (in the group, not in Intune) has no status, PC2 excluded — expected 2, never counting the excluded", cd.expected === 2 && cd.landed === 1 && cd.none === 1 && cd.excluded === 1 && P("pd").cells.get("Italy").expected === 0);
  ok("…PILOT9 reported but in no wave: an extra", P("pd").extras.length === 1 && P("pd").extras[0].name === "PILOT9" && P("pd").total.extra === 1);
  ok("…a device in the group with no Intune record says so", E("PC3").per.get(PD.key).state === "none" && E("PC3").inIntune === false && /not in Intune/.test(L.verdict(E("PC3"), m).text));
  const su = E("Eva@x.com").per.get(PU.key);
  ok("user policy: a user's state is the worst of their devices (landed + pending → pending), the rows kept", su.state === "pending" && su.rows.length === 2 && su.devices === 2);
  ok("…a user with no row at all has no status; the policy's extra is the pilot's row", E("milan@x.com").per.get(PU.key).state === "none" && P("pu").extras.length === 1 && P("pu").total.expected === 2);
  ok("a policy whose report failed makes every member unreadable, never 0, and is listed — PC2 is excluded only from the policy that excludes its group", E("PC1").per.get(PX.key).state === "unreadable" && E("PC2").per.get(PX.key).state === "unreadable" && E("PC2").per.get(PD.key).state === "excluded" && m.failed.length === 1 && P("px").failed === "403 denied" && m.summary.unreadable === 4);
  ok("an unassigned policy expects nobody", P("pn").total.expected === 0 && !E("PC1").per.has(PN.key));
  ok("the summary adds up, with problems = pending + none + error + conflict + unreadable", m.summary.expected === 8 && m.summary.landed === 1 && m.summary.pending === 1 && m.summary.none === 2 && m.summary.problems === 1 + 2 + 4 && m.summary.devices === 4 && m.summary.users === 2);
  const worst = (e) => e.worst;
  ok("a member's worst state ranks conflict > error > pending > none > n/a > landed", worst(E("Eva@x.com")) === "pending" && L.worstOf(["landed", "conflict", "error"]) === "conflict" && L.worstOf(["na", "landed"]) === "na" && L.worstOf([]) === null);
  const probs = L.memberRows(m, { filter: "problems" });
  ok("memberRows: problems first, filtered by region and by search", probs.every((e) => e.problems > 0) && L.memberRows(m, { region: "Italy" }).length === 1 && L.memberRows(m, { q: "pc1" }).length === 1 && L.memberRows(m, { filter: "excluded" })[0].name === "PC2");
  const csv = L.csv(m).split("\r\n");
  ok("the CSV: a header, one row per member × expected policy, then the extras", /^Member,Kind,User,Regions,Last check-in,Policy,Scope,State,Intune says,Last report,Detail$/.test(csv[0]) && csv.length === 1 + 9 + 2 && csv.some((l) => /PILOT9,device,.*extra \(not a wave member\)/.test(l)) && csv.some((l) => /^PC3,device,.*,no status,/.test(l)));

  // ---------------------------------------------------- explain conflicts --
  const status2 = { at: 1, rows: 1, codeBased: false, failed: new Map(), byPolicy: new Map([["pd", [row("pd", "i1", "PC1", "eva@x.com", "conflict")]]]) };
  const m2 = L.join(sc, members, managed, status2);
  const pairs = [{ id: "pr1", type: "conflict", N: { id: "pd", name: PD.name }, O: { id: "old1", name: "OLD-FW" } }, { id: "pr2", type: "conflict", N: { id: "pd", name: PD.name }, O: { id: "old2", name: "OLD-OTHER" } }];
  L.explainConflicts(m2, { settingRows: [{ policyId: "pd", deviceId: "i1", name: "Enable the firewall" }], deviceRows: [{ policyId: "old1", deviceId: "i1" }] }, pairs);
  const st2 = m2.members.find((e) => e.name === "PC1").per.get(PD.key);
  ok("a conflict row gets the setting (T12's read) and the old policy the device is also in conflict on (the pairs) — not the one it is not", st2.settings.join() === "Enable the firewall" && st2.others.join() === "OLD-FW" && m2.explained);
  ok("…and the verdict names both", /⚔ .*Firewall.* — Enable the firewall — also in conflict on OLD-FW/.test(L.verdict(m2.members.find((e) => e.name === "PC1"), m2).text));

  // ----------------------------------------------- the cached-report poll --
  {
    const G = w.Graph, realPost = G.post, realGet = G.get;
    const calls = [];
    let polls = 0;
    G.post = async (url, body) => {
      calls.push(["POST", url, body]);
      if (/cachedReportConfigurations$/.test(url)) return { id: body.id, status: "notStarted" };
      if (/getCachedReport$/.test(url)) return body.skip === 0
        ? { TotalRowCount: 3, Schema: [{ Column: "IntuneDeviceId" }, { Column: "PolicyStatus" }, { Column: "PolicyStatus_loc" }], Values: [["a", 2, "Succeeded"], ["b", 6, "Conflict"]] }
        : { TotalRowCount: 3, Schema: [{ Column: "IntuneDeviceId" }, { Column: "PolicyStatus" }, { Column: "PolicyStatus_loc" }], Values: [["c", 5, "Error"]] };
      return realPost(url, body);
    };
    G.get = async (url) => { calls.push(["GET", url]); return { id: "x", status: ++polls < 2 ? "inProgress" : "completed" }; };
    const L0 = L; const PAGE = 500;
    const rows = await L0.readPolicyStatus("p-1", { pollMs: 0 });
    const create = calls.find((c) => c[0] === "POST" && /cachedReportConfigurations$/.test(c[1]));
    ok("the read creates a cached report for the policy (the report name, a PolicyId filter, the columns)", !!create && create[2].reportName === L.REPORT && /\(PolicyId eq 'p-1'\)/.test(create[2].filter) && create[2].select.includes("PolicyStatus") && new RegExp(`^${L.REPORT}_`).test(create[2].id));
    ok("…polls the configuration until completed", calls.filter((c) => c[0] === "GET").length === 2 && /cachedReportConfigurations\('/.test(calls.find((c) => c[0] === "GET")[1]));
    ok("…then pages getCachedReport by top/skip until the TotalRowCount is reached (a short page is not the end while rows are still due)", rows.length === 3 && calls.filter((c) => /getCachedReport$/.test(c[1])).length === 2 && calls.filter((c) => /getCachedReport$/.test(c[1]))[1][2].skip === PAGE);
    ok("…rows come back as objects by column", rows[1].PolicyStatus_loc === "Conflict" && rows[2].IntuneDeviceId === "c");
    G.post = realPost; G.get = realGet;
  }

  // ------------------------------------------------------------ screen --
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("T28's note names build 10689", /build 10689/.test(w.TOOL_VERSIONS.toolMdeRollout.note));
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  $("mvBody").querySelector('[data-mrread="attach"]').click();
  await until(() => $("mvBody").querySelector(".ep-rail"), 30000, "rail");
  const st = () => w.MdeRolloutV2Tool._state();
  await until(() => !st().running && !st().busy && !st().enriching, 30000, "idle");
  const body = () => $("mvBody").textContent;
  ok("the rail has 📡 Landing under Check & recover, without a count before a read", !!D.querySelector('.mr-navigation [data-mrpane="landing"]') && !D.querySelector('.mr-navigation [data-mrpane="landing"] .ep-n'));
  D.querySelector('.mr-navigation [data-mrpane="landing"]').click();
  ok("the pane opens with the read button and nothing read", st().pane === "landing" && !!D.querySelector("[data-mrldread]") && /Nothing read yet/.test(body()));
  D.querySelector("[data-mrldread]").click();
  ok("📡 Read the status reads", await until(() => st().ld.model && !st().ld.busy, 30000, "landing read"));
  const LM = st().ld.model;
  const byName = (re) => LM.policies.find((p) => re.test(p.name));
  const av = byName(/Defender Antivirus - D - AV Configuration/), audit = byName(/Audit and Event Logging/), edge = byName(/Microsoft Edge - D - Security/);
  ok("the demo's Euro device wave holds Eva's and Alex's laptops (through INT-SG-D-NLD): 2 devices; no user-scoped policy in the new set, so no users are read", LM.summary.devices === 2 && LM.summary.users === 0 && LM.regions.join() === "Euro" && LM.members.every((e) => e.kind === "device"));
  ok("antivirus: both in Conflict (as T12's report says), WS-ENG-0308 reported but in no wave — an extra", av && av.cells.get("Euro").expected === 2 && av.cells.get("Euro").conflict === 2 && av.extras.length === 1 && /WS-ENG-0308/.test(av.extras[0].name));
  ok("audit: Eva's in Error, Alex's has NO status at all", audit && audit.cells.get("Euro").error === 1 && audit.cells.get("Euro").none === 1);
  ok("the staged Edge policy expects nobody", edge && edge.total.expected === 0 && !edge.assigned);
  ok("the summary: 4 expected (2 devices × 2 assigned policies), none landed, 4 to look at, 1 extra", LM.summary.expected === 4 && LM.summary.landed === 0 && LM.summary.problems === 4 && LM.summary.conflict === 2 && LM.summary.extra === 1);
  const alex = LM.members.find((e) => e.name === "WS-ENG-0221"), eva = LM.members.find((e) => e.name === "WS-FIN-0142");
  ok("the conflicts are explained: the old policies the devices are also in conflict on (the old antivirus policy and the legacy exception set, as T12's report says)", LM.explained && alex && alex.per.get(av.key).others.includes("(TO-BE-REMOVED)PVM-DG-CORP-ENDSEC-WIN-AV-PRD") && alex.per.get(av.key).others.includes("WIN — Legacy exception set") && eva.per.get(av.key).others.length === 2);
  const vAlex = w.MdeLanding.verdict(alex, LM).text;
  ok("Alex's verdict names the conflict with the old policy and the audit policy with no status", /⚔ .*AV Configuration.*also in conflict on \(TO-BE-REMOVED\)PVM-DG-CORP-ENDSEC-WIN-AV-PRD/.test(vAlex) && /◌ .*Audit and Event Logging.* — no status/.test(vAlex));
  ok("Eva's names the conflict and the error", /⚔ .*AV Configuration/.test(w.MdeLanding.verdict(eva, LM).text) && /✕ .*Audit and Event Logging/.test(w.MdeLanding.verdict(eva, LM).text));
  ok("the rail counts what is to look at", /4 to look at/.test(D.querySelector('.mr-navigation [data-mrpane="landing"]').textContent));
  ok("the pane: tiles, the matrix with the Euro column, 0 / 2 with ⚔ 2 for antivirus, ✕ 1 and ◌ 1 for audit", D.querySelectorAll("[data-mrldfilter].mr-tile").length >= 7 && /🌊 Euro/.test(body()) && /0<\/b> \/ 2/.test($("mvBody").innerHTML) && /⚔ 2/.test(body()) && /✕ 1/.test(body()) && /◌ 1/.test(body()));
  ok("…the member table lists both devices, problems first, with a verdict", /WS-ENG-0221/.test(body()) && /WS-FIN-0142/.test(body()) && /also in conflict on/.test(body()));
  const fold = D.querySelector('[data-mrfold^="ld|"]');
  fold.click();
  ok("the antivirus extra folds open and names WS-ENG-0308", /Reported, not a wave member: .*WS-ENG-0308/.test(body()));
  D.querySelector('[data-mrldfilter="error"]').click();
  ok("the error filter shows Eva's laptop only", st().ld.filter === "error" && /WS-FIN-0142/.test(body()) && !/WS-ENG-0221/.test($("mvBody").querySelectorAll(".cg-table")[1].textContent));
  D.querySelector('[data-mrldfilter="none"]').click();
  ok("the no-status filter shows Alex's only", /WS-ENG-0221/.test($("mvBody").querySelectorAll(".cg-table")[1].textContent) && !/WS-FIN-0142/.test($("mvBody").querySelectorAll(".cg-table")[1].textContent));
  D.querySelector('[data-mrldfilter="problems"]').click();
  $("mvLdQ").value = "fin"; $("mvLdQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  ok("the search narrows the members", st().ld.q === "fin" && !/WS-ENG-0221/.test($("mvBody").querySelectorAll(".cg-table")[1].textContent) && /WS-FIN-0142/.test(body()));
  $("mvLdQ").value = ""; $("mvLdQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  const csvD = w.MdeLanding.csv(LM).split("\r\n");
  ok("the CSV has 2 devices × 2 assigned policies + 1 extra rows", csvD.length === 1 + 4 + 1);

  // the 📑 report, from the model in hand
  $("mvLdReport").click();
  ok("📑 Save as report lands in Reports with the landing check selected", await until(() => st().reps.landing && !st().reps.busy, 20000, "report") && st().pane === "reports" && st().reps.selected === "landing");
  const html = st().reps.landing.html;
  ok("its page: the tiles, the matrix, 'To look at (2 members)', the extra and how to read it", /MDE rollout — landing check/.test(html) && /To look at \(2 members\)/.test(html) && /Reported, but not a wave member \(1\)/.test(html) && /How to read it/.test(html) && /WS-ENG-0308/.test(html) && /<th>🌊 Euro<\/th>/.test(html));
  ok("…and the CSV travels with it; the rail lists 4 reports", st().reps.landing.csv === w.MdeLanding.csv(LM) && /4 of 4|of 4/.test(D.querySelector('.mr-navigation [data-mrpane="reports"]').textContent) && !!D.querySelector('[data-mrreport="landing"]'));
  ok("the metadata names when the status was read", /Status read/.test(body()));

  // a fix lands: Alex's laptop now reports the audit policy; the reports
  // pane's button reads again and regenerates
  const TT = w.TUNO_DEMO_GRAPH.T;
  TT.LANDING_REPORT[audit.P.id] = TT.LANDING_REPORT[audit.P.id].concat([["33333333-0000-4000-8000-000000000007", "Succeeded"]]);
  const before = st().reps.landing.at;
  await sleep(5);
  $("mvRep_landing").click();
  ok("Read again & generate re-reads and regenerates", await until(() => st().reps.landing && st().reps.landing.at !== before && !st().reps.busy && !st().ld.busy, 30000, "second read") && st().ld.model.summary.none === 0 && st().ld.model.summary.landed === 1);
  ok("…and the rail now says 3 to look at", /3 to look at/.test(D.querySelector('.mr-navigation [data-mrpane="landing"]').textContent));

  // a failed report is said, never counted as 0
  w.TUNO_DEMO_GRAPH.DENIED.push(/getCachedReport/);
  w.MdeRolloutV2Tool._pane("landing");
  D.querySelector("[data-mrldread]").click();
  await until(() => !st().ld.busy, 30000, "denied read");
  ok("a refused status report: every assigned policy is 'report failed', the members unreadable, the notice shown", st().ld.model && st().ld.model.failed.length === 2 && st().ld.model.summary.unreadable === 4 && /could not be read for 2 policies/.test(body()));
  w.TUNO_DEMO_GRAPH.DENIED.pop();

  console.log(`T28 landing: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  w.close();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

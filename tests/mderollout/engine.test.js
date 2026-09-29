// T28 — MDE rollout engine (build 10632). DOM-free: naming rules, scope,
// setting comparison, reach verdicts, proposals, the group-kind support
// matrix, composed plans, undo, retirement, waves, exports — and one apply
// through T11's engine with Graph stubbed, so the composed op is proven to
// be the shape applyPlan writes and verifies.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), { runScripts: "outside-only" });
const w = dom.window;
const files = ["js/version.js", "js/graph.js", "js/progress.js", "js/groupuse.js", "js/document.js", "js/overview.js",
  "js/conflict.js", "js/endpointsec.js", "js/filterrules.js", "js/endpointposture.js", "js/assignedit.js",
  "js/groupmigrate.js", "js/mderollout.js"];
w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
  + "\n;Object.assign(window, {MdeRollout, AssignEdit, Docs, Graph, Conflict, EndpointSec, EndpointPosture, GroupMigrate});");
const M = w.MdeRollout, AE = w.AssignEdit, Docs = w.Docs;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name); }
}

// ---------------------------------------------------------------- fixtures --
const G = (n) => `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`;
const inc = (g, f, ft) => ({ target: Object.assign({ "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: g },
  f ? { deviceAndAppManagementAssignmentFilterId: f, deviceAndAppManagementAssignmentFilterType: ft || "include" } : {}) });
const exc = (g) => ({ target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: g } });
const allDev = () => ({ target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } });
const allUsers = () => ({ target: { "@odata.type": "#microsoft.graph.allLicensedUsersAssignmentTarget" } });
const choice = (defId, value, children) => ({ settingInstance: {
  "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
  settingDefinitionId: defId, choiceSettingValue: { value, children: children || [] } } });
const simple = (defId, value) => ({ settingInstance: {
  "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
  settingDefinitionId: defId, simpleSettingValue: { value } } });
const coll = (defId, vals) => ({ settingInstance: {
  "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
  settingDefinitionId: defId, simpleSettingCollectionValue: vals.map((v) => ({ value: v })) } });
const RTP = "device_vendor_msft_policy_config_defender_allowrealtimemonitoring";
const CBL = "device_vendor_msft_policy_config_defender_cloudblocklevel";
const PUA = "device_vendor_msft_policy_config_defender_puaprotection";
const EXCL = "device_vendor_msft_policy_config_defender_excludedpaths";
const ASR = "device_vendor_msft_policy_config_defender_attacksurfacereductionrules";
const OBF = "blockexecutionofpotentiallyobfuscatedscripts";
const OBF_GUID = "5beb7efe-fd9a-4556-801d-275e5ffc04cc";
const EDGE = "device_vendor_msft_policy_config_microsoft_edgev77.3~policy~microsoft_edge~smartscreen_preventsmartscreenpromptoverride";
const WIFI = "device_vendor_msft_policy_config_wifi_allowautoconnecttowifisensehotspots";

const names = new Map([[G(1), "PVM-DG-CORP-ALL-WIN"], [G(2), "PVM-UG-MDE-WAVE-Euro"], [G(3), "PVM-UG-MDE-WAVE-Americas"], [G(4), "PVM-DG-MDE-EXCLUDED"]]);
function mapItem(raw, extra) {
  const assignments = (raw.assignments || []).map((a) => {
    const m = Docs.assignmentOf(a);
    if (m.groupId) m.name = names.get(m.groupId) || m.groupId;
    return m;
  });
  return Object.assign({ id: raw.id, name: raw.name || raw.displayName, templateFamily: (raw.templateReference || {}).templateFamily || "",
    type: String(raw["@odata.type"] || "").replace(/^#?microsoft\.graph\./, ""), assignments,
    rows: raw.__detail && raw.name ? Docs.catalogRows(raw.__detail) : [], detailError: null }, extra || {});
}
const cp = (id, name, fam, settings, assignments, tech) => ({ id, name, technologies: tech || "mdm",
  templateReference: fam ? { templateFamily: fam } : undefined, assignments: assignments || [], __detail: settings || [] });
function resOf(sections) {
  // raw deliberately REVERSED against the sorted mapped items: the engine
  // must join by id, not by index (collect sorts the mapped list only)
  return { sections: sections.map((s) => ({ id: s.id, label: s.id, icon: "", endpoint: "/x",
    items: s.raw.map((r) => mapItem(r)).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    raw: s.raw.slice().reverse() })), failed: [], readAt: 1 };
}

const NEW_AV = cp("n1", "Win - OIB - ES - Defender Antivirus - D - AV Configuration - v3.3", "endpointSecurityAntivirus",
  [choice(RTP, `${RTP}_1`), choice(CBL, `${CBL}_4`), choice(PUA, `${PUA}_1`), coll(EXCL, ["C:\\b", "C:\\a"])], [inc(G(2))]);
const NEW_ASR = cp("n2", `WIN-SEC-AttackSurfaceReduction-D-02_Block execution of potentially obfuscated scripts-v1.0`, "endpointSecurityAttackSurfaceReductionRules",
  [choice(ASR, `${ASR}_1`, [choice(`${ASR}_${OBF}`, `${ASR}_${OBF}_block`).settingInstance])], [inc(G(2))]);
const NEW_EDGE = cp("n3", "Win - OIB - SC - Microsoft Edge - D - Security - v3.7", null, [choice(EDGE, `${EDGE}_1`)], []);
const OLD_AV = cp("o1", "(TO-BE-REMOVED)PVM-DG-CORP-ENDSEC-WIN-AV-PRD", "endpointSecurityAntivirus",
  [choice(RTP, `${RTP}_1`), choice(CBL, `${CBL}_2`), coll(EXCL, ["C:\\a", "C:\\b"])], [inc(G(1))]);
const OLD_ASR = cp("o2", "PVM-DG-CORP-ENDSEC-WIN-ASR-PRD", "endpointSecurityAttackSurfaceReductionRules",
  // the LEGACY string form on the parent — must meet the per-rule child
  [simple(ASR, `${OBF_GUID}=2`)], [allDev(), exc(G(2))]);
const OLD_EDGE = cp("o3", "PVM-DG-DEVCONF-CORP-WIN-EDGE-Security - v3.0", null, [choice(EDGE, `${EDGE}_0`)], [inc(G(1))]);
const OUT_AV = cp("x1", "AVD - SEC - Defender Antivirus - D - AV Configuration - v3.7", "endpointSecurityAntivirus",
  [choice(RTP, `${RTP}_0`)], [inc(G(1))]);
const WIFI_P = cp("u1", "WIN - Corporate Wi-Fi", null, [choice(WIFI, `${WIFI}_0`)], [inc(G(1))]);
const OLD_WHFB = cp("o4", "(TO-BE-REMOVED)PVM-DG-ENSEC-ACCPROT-WHFB-v3.2", "endpointSecurityAccountProtection",
  [choice("device_vendor_msft_passportforwork_{tenantid}_policies_usepassportforwork", "device_vendor_msft_passportforwork_{tenantid}_policies_usepassportforwork_true")], [inc(G(1))]);
const INTENT = { id: "i1", displayName: "PVM Legacy AV intent", templateId: "TMPL-AV", assignments: [inc(G(1))], __detail: [{ definitionId: "deviceConfiguration--x_defenderScanType", valueJson: '"quick"' }] };
const TEMPLATES = new Map([["tmpl-av", { id: "TMPL-AV", displayName: "Microsoft Defender Antivirus" }]]);
const CUSTOM = { id: "d1", "@odata.type": "#microsoft.graph.windows10CustomConfiguration", displayName: "PVM OMA Defender RTP",
  assignments: [inc(G(1))], omaSettings: [{ omaUri: "./Device/Vendor/MSFT/Policy/Config/Defender/AllowRealtimeMonitoring", value: 0, "@odata.type": "#microsoft.graph.omaSettingInteger" },
    { omaUri: "./Device/Vendor/MSFT/Policy/Config/WiFi/AllowWiFi", value: 1 }] };
const EP_LEGACY = { id: "d2", "@odata.type": "#microsoft.graph.windows10EndpointProtectionConfiguration", displayName: "PVM EP legacy",
  assignments: [inc(G(1))], firewallBlockStatefulFTP: false, defenderScanType: "userDefined", bitLockerEncryptDevice: true, xboxServicesLiveAuthManagerServiceStartupMode: "manual" };
const GEN_NOPE = { id: "d3", "@odata.type": "#microsoft.graph.windows10GeneralConfiguration", displayName: "PVM Restrictions",
  assignments: [inc(G(1))], defenderScanType: "userDefined", defenderRequireRealTimeMonitoring: false, passwordRequired: true };

function fullRes() {
  return resOf([
    { id: "settingsCatalog", raw: [NEW_AV, NEW_ASR, NEW_EDGE, OLD_AV, OLD_ASR, OLD_EDGE, OUT_AV, WIFI_P, OLD_WHFB] },
    { id: "intents", raw: [INTENT] },
    { id: "deviceConfigurations", raw: [CUSTOM, EP_LEGACY, GEN_NOPE] },
    { id: "admx", raw: [] },
  ]);
}

async function run() {
  // -------------------------------------------------------- generations --
  const cfg = M.normConfig({});
  ok("defaults carry the three new prefixes", cfg.newPrefixes.join("|") === "Win - OIB|WIN-SEC|WIN-DCP");
  ok("defaults carry the five wave groups", cfg.waves.length === 5 && cfg.waves.includes("PVM-UG-MDE-WAVE-Asia-Pacific"));
  ok("normConfig trims, dedupes and drops blanks", M.normConfig({ newPrefixes: [" A ", "A", "", "B"] }).newPrefixes.join("|") === "A|B");
  ok("normConfig keeps an explicitly empty list empty", M.normConfig({ outPrefixes: [] }).outPrefixes.length === 0);
  const gen = (n) => M.generationOf(n, cfg);
  ok("Win - OIB … is new", gen("Win - OIB - ES - Defender Antivirus - D - AV Configuration - v3.3") === "new");
  ok("WIN-SEC-… is new", gen("WIN-SEC-AttackSurfaceReduction-D-01_Block Adobe Reader") === "new");
  ok("WIN-DCP-… is new", gen("WIN-DCP-DeviceConfiguration-D-x") === "new");
  ok("spacing and case do not matter (win-oib)", gen("win-oib-ES-thing") === "new");
  ok("an en dash is a dash", gen("Win – OIB – ES") === "new");
  ok("a prefix ends on a boundary (WIN-SECURITY is not WIN-SEC)", gen("WIN-SECURITY-baseline") === "old");
  ok("(TO-BE-REMOVED) is retiring", gen("(TO-BE-REMOVED)PVM-DG-CORP-ENDSEC-WIN-AV-PRD") === "retiring");
  ok("a new-named policy marked for removal is on its way out", gen("(TO-BE-REMOVED)Win - OIB - ES - x") === "retiring");
  ok("AVD is out of scope", gen("AVD-SEC-DefenderAntivirus-D-AvConfiguration-v1.0") === "out" && gen("AVD - SEC - Defender Antivirus") === "out");
  ok("WinServ / Win-Serv are out of scope", gen("WinServ-SEC-AV") === "out" && gen("Win-Serv - Firewall") === "out");
  ok("out of scope wins over the removal marker", gen("(TO-BE-REMOVED)AVD-DCP-x") === "out");
  ok("everything else is old", gen("PVM-DG-CORP-ENDSEC-WIN-AV-PRD") === "old");
  ok("AVDx is not AVD (boundary)", gen("AVDX-thing") === "old");

  // ----------------------------------------------------------- settings --
  const rowsNew = w.EndpointSec.flattenSettings(NEW_ASR.__detail);
  const sNew = M.settingsOf(rowsNew);
  const sOld = M.settingsOf(w.EndpointSec.flattenSettings(OLD_ASR.__detail));
  ok("an ASR child becomes asr|<slug> with its mode", sNew.has(`asr|${OBF}`) && sNew.get(`asr|${OBF}`).value === "block");
  ok("the legacy guid=mode string meets the same key", sOld.has(`asr|${OBF}`) && sOld.get(`asr|${OBF}`).value === "audit");
  ok("the ASR parent row itself is not a comparable setting", ![...sNew.keys()].some((k) => k === ASR));
  const sAv = M.settingsOf(w.EndpointSec.flattenSettings(NEW_AV.__detail));
  ok("choice values compare on their tail", sAv.get(RTP).value === "1" && sAv.get(CBL).value === "4");
  ok("collections compare sorted", sAv.get(EXCL).value === "c:\\a; c:\\b");
  ok("categories come from the id", sAv.get(RTP).cat === "av" && M.catOfKey(EDGE) === "edge" && M.catOfKey(`asr|${OBF}`) === "asr");
  ok("OMA-URI key equals the catalog id", M.omaKey("./Device/Vendor/MSFT/Policy/Config/Defender/AllowRealtimeMonitoring") === RTP);
  ok("user-less ./Vendor path gains device_", M.omaKey("./Vendor/MSFT/Policy/Config/Defender/X") === "device_vendor_msft_policy_config_defender_x");
  ok("firewall CSP path maps too", M.omaKey("./Vendor/MSFT/Firewall/MdmStore/DomainProfile/EnableFirewall") === "vendor_msft_firewall_mdmstore_domainprofile_enablefirewall");
  const oma = M.omaSettings([{ omaUri: "./Device/Vendor/MSFT/Policy/Config/Defender/X", value: "s3cret", isEncrypted: true }]);
  ok("an encrypted OMA value is never compared or shown", oma.get("device_vendor_msft_policy_config_defender_x").value === "(encrypted)" && /not compared/.test(oma.get("device_vendor_msft_policy_config_defender_x").display));
  ok("legacy property categories", M.catOfLegacyProp("defenderAttackSurfaceReductionExcludedPaths") === "asr" && M.catOfLegacyProp("defenderScanType") === "av" && M.catOfLegacyProp("passwordRequired") === null);
  ok("isConfigured ignores the not-configured spellings", !M.isConfigured("userDefined") && !M.isConfigured(false) && !M.isConfigured([]) && M.isConfigured(true) && M.isConfigured("quick"));

  // -------------------------------------------------------------- model --
  const model = M.build(fullRes(), cfg, TEMPLATES);
  const P = (id) => model.policies.find((p) => p.id === id);
  ok("raw joined by id, not index — settings land on the right policy", P("n1").settings.get(CBL).value === "4" && P("o1").settings.get(CBL).value === "2");
  ok("new set = n1 n2 n3", model.newP.map((p) => p.id).sort().join() === "n1,n2,n3");
  ok("out of scope kept apart", model.outP.map((p) => p.id).join() === "x1");
  ok("a Wi-Fi settings-catalog policy is not in scope", !P("u1"));
  ok("an Edge settings-catalog policy is in scope (edge)", P("n3") && P("n3").cats.includes("edge"));
  ok("WHfB account protection is in scope", P("o4") && P("o4").cats.includes("acct"));
  ok("legacy intent classified by its template", P("i1") && P("i1").cats.includes("av") && P("i1").format === "legacy");
  ok("custom OMA-URI keeps only MDE-area settings and compares 1:1", P("d1") && P("d1").format === "catalog" && P("d1").settings.size === 1 && P("d1").settings.get(RTP).value === "0");
  ok("legacy EP profile scoped by its configured properties", P("d2") && P("d2").cats.includes("disk") && !P("d2").cats.includes("av"));
  ok("device restrictions with no configured Defender property is out", !P("d3"));
  ok("surfaces map to T11's engine", P("n1").surface === "settingsCatalog" && P("i1").surface === "intents" && P("d1").surface === "deviceConfig");
  ok("reach is T12's shape", P("n1").reach.inc.has(G(2)) && P("o2").reach.tenantWide && P("o2").reach.exc.has(G(2)));

  // ------------------------------------------------------------ compare --
  const pairs = M.compare(model);
  const pr = (n, o) => pairs.find((x) => x.N.id === n && x.O.id === o);
  ok("AV new vs old: conflict on cloud block level", pr("n1", "o1") && pr("n1", "o1").type === "conflict" && pr("n1", "o1").diffs.some((d) => d.key === CBL));
  ok("the shared real-time setting is listed as same", pr("n1", "o1").sames.some((d) => d.key === RTP));
  ok("exclusion lists in a different order are the same value", pr("n1", "o1").sames.some((d) => d.key === EXCL));
  ok("one-rule ASR meets the legacy all-rules string on that rule", pr("n2", "o2") && pr("n2", "o2").diffs.length === 1 && pr("n2", "o2").diffs[0].key === `asr|${OBF}`);
  ok("custom OMA RTP 0 conflicts with catalog RTP 1", pr("n1", "d1") && pr("n1", "d1").type === "conflict");
  ok("legacy intent meets the AV policy by category (review)", pr("n1", "i1") && pr("n1", "i1").type === "review" && pr("n1", "i1").common.includes("av"));
  ok("out of scope never pairs", !pairs.some((x) => x.O.id === "x1" || x.N.id === "x1"));
  ok("no pair without a shared setting (ASR vs Edge)", !pr("n2", "o3"));
  ok("conflicts sort before reviews", pairs.findIndex((x) => x.type === "review") > pairs.findIndex((x) => x.type === "conflict"));

  // -------------------------------------------------------------- reach --
  ok("different groups: may", pr("n1", "o1").reach.verdict === "may");
  ok("old on All devices already excluding the new policy's group: resolved", pr("n2", "o2").reach.verdict === "resolved");
  ok("unassigned new policy: staged", pr("n3", "o3").reach.verdict === "staged");
  const shared = M.pairReach({ reach: w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: "g" }] }) },
    { reach: w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: "g" }] }) });
  ok("same include group: can", shared.verdict === "can");
  const idle = M.pairReach({ reach: w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: "g" }] }) },
    { reach: w.Conflict.reachOf({ assignments: [] }) });
  ok("old reaching nobody: idle", idle.verdict === "idle");
  ok("needsAction: conflict/may yes, resolved no, duplicate no", M.needsAction(pr("n1", "o1")) && !M.needsAction(pr("n2", "o2")));

  // ---------------------------------------------------------- kinds --
  ok("dynamic device rule is device", w.MdeRollout.kindOfGroup({ membershipRule: '(device.deviceOSType -eq "Windows")' }).kind === "device");
  ok("dynamic user rule is user", M.kindOfGroup({ membershipRule: '(user.country -eq "NL")' }).kind === "user");
  ok("counts decide an assigned group", M.kindOfGroup({ displayName: "x" }, 3, 0).kind === "user" && M.kindOfGroup({ displayName: "x" }, 0, 2).kind === "device" && M.kindOfGroup({ displayName: "x" }, 1, 1).kind === "mixed");
  const emptyUG = M.kindOfGroup({ displayName: "PVM-UG-MDE-WAVE-Euro" }, 0, 0);
  ok("an empty UG group is a user group by name, and says so", emptyUG.kind === "user" && /name/.test(emptyUG.source));
  ok("an empty group with no hint is empty", M.kindOfGroup({ displayName: "Wave 1" }, 0, 0).kind === "empty");
  ok("matrix: user group from device-targeted policy is NOT supported", M.exclusionSupport("user", new Set(["device"])).ok === false);
  ok("matrix: device from device is supported", M.exclusionSupport("device", new Set(["device"])).ok === true);
  ok("matrix: unknown target kind is a question, not a yes", M.exclusionSupport("user", new Set(["unknown"])).ok === null);
  ok("matrix: mixed group is refused", M.exclusionSupport("mixed", new Set(["user"])).ok === false);

  // ------------------------------------------------------------ proposals --
  const kinds = new Map([[G(1), { kind: "device", source: "members" }], [G(2), { kind: "user", source: "name (group is empty)" }], [G(3), { kind: "user", source: "members" }]]);
  const ctx = { kinds, waveIds: [G(2), G(3)], names };
  const p1 = M.proposalFor(pr("n1", "o1"), ctx);
  ok("proposal excludes the new policy's include group from the old one", p1.steps.length === 1 && p1.steps[0].groupId === G(2) && p1.steps[0].action === "add-exclude");
  ok("user wave from a device-targeted old policy is flagged NOT supported", p1.steps[0].supported === false && /support matrix/.test(p1.steps[0].why));
  const kindsU = new Map([[G(1), { kind: "user" }], [G(2), { kind: "user" }]]);
  ok("user wave from a user-targeted old policy is supported", M.proposalFor(pr("n1", "o1"), { kinds: kindsU, names }).steps[0].supported === true);
  ok("a resolved pair proposes nothing", M.proposalFor(pr("n2", "o2"), ctx).steps.length === 0);
  const staged = M.proposalFor(pr("n3", "o3"), ctx);
  ok("a staged pair borrows the existing wave groups, marked planned", staged.steps.length === 2 && staged.steps.every((s) => s.planned));
  ok("staged with no wave groups says what to do", /wave/.test(M.proposalFor(pr("n3", "o3"), { kinds, waveIds: [], names }).none));
  // old policy that INCLUDES the wave: remove, not exclude
  const oldIncl = Object.assign({}, pr("n1", "o1"), { O: Object.assign({}, P("o1"), { reach: w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: G(2) }] }), item: { assignments: [{ kind: "Included", groupId: G(2) }] } }) });
  oldIncl.reach = { verdict: "can", why: "" };
  const pi = M.proposalFor(oldIncl, ctx);
  ok("an old policy including the wave gets remove, with the reason", pi.steps[0].action === "remove" && /contradiction/.test(pi.steps[0].notes.join(" ")));
  const wideNew = Object.assign({}, pr("n1", "o1"), { N: Object.assign({}, P("n1"), { reach: w.Conflict.reachOf({ assignments: [{ kind: "All devices" }] }) }) });
  ok("a new policy on All devices has no group to exclude — said", M.proposalFor(wideNew, ctx).steps.length === 0 && /whole tenant/.test(M.proposalFor(wideNew, ctx).none));
  const mdeOld = Object.assign({}, pr("n1", "o1"), { O: Object.assign({}, P("o1"), { mdeManaged: true }) });
  ok("MDE-managed old policy + user group carries the device-groups-only note", M.proposalFor(mdeOld, ctx).steps[0].notes.some((n) => /DEVICE groups only/.test(n)));

  // ---------------------------------------------------------- compose --
  const pol = (id, assignments) => ({ surface: "settingsCatalog", surfaceLabel: "Settings catalog", id, name: id, assignments });
  const A = pol("pa", [inc(G(1)), allDev()]);
  const plan = M.composePlan([
    { policy: A, action: "add-exclude", group: { id: G(2), displayName: "wave A" } },
    { policy: A, action: "add-exclude", group: { id: G(3), displayName: "wave B" } },
    { policy: pol("pb", [inc(G(2))]), action: "add-exclude", group: { id: G(2), displayName: "wave A" } },
    { policy: pol("pc", [exc(G(2))]), action: "add-exclude", group: { id: G(2), displayName: "wave A" } },
    { policy: pol("pd", [inc(G(2))]), action: "remove", group: { id: G(2), displayName: "wave A" } },
  ]);
  const opA = plan.ops.find((o) => o.policy.id === "pa");
  ok("two steps on one policy compose into one op", opA.change === "modify" && opA.after.length === 4 && opA.details.length === 2);
  ok("the composed op keeps the untouched targets", opA.after.some((a) => a.target["@odata.type"].includes("allDevices")) && opA.after.some((a) => a.target.groupId === G(1)));
  ok("beforeSig is the untouched list's signature", opA.beforeSig === AE.sig(A.assignments));
  ok("T11's refusal survives composition (exclude on an include)", plan.refused.some((o) => o.policy.id === "pb") && /contradiction/.test(plan.refused.find((o) => o.policy.id === "pb").details[0].reason));
  ok("an exclusion already in place is a noop", plan.noops.some((o) => o.policy.id === "pc"));
  ok("hasRemoval set by a real removal", plan.hasRemoval === true && plan.changes.some((o) => o.policy.id === "pd"));

  // ------------------------------------------------------ apply via T11 --
  const store = new Map([["pa", A.assignments.slice()]]);
  const posted = [];
  w.Graph.readAll = async (p) => { const id = /configurationPolicies\/([^/]+)\/assignments/.exec(p)[1]; return JSON.parse(JSON.stringify(store.get(id) || [])); };
  w.Graph.post = async (p, body) => { const id = /configurationPolicies\/([^/]+)\/assign$/.exec(p)[1]; posted.push({ id, body }); store.set(id, body.assignments); return null; };
  const r = await AE.applyPlan({ changes: [opA] }, {});
  ok("applyPlan writes the composed op and verifies the read-back", r.results.length === 1 && r.results[0].ok && r.results[0].verified);
  ok("the POST body is { assignments: [ { target } … ] }", posted.length === 1 && posted[0].body.assignments.length === 4 && posted[0].body.assignments.every((a) => a.target && !a.id));
  // drift: the tenant moved after the plan was cut
  store.set("pa", [inc(G(1))]);
  const r2 = await AE.applyPlan({ changes: [opA] }, {});
  ok("a policy changed since the plan is skipped as drifted, not overwritten", r2.results[0].drifted === true);

  // --------------------------------------------------------------- undo --
  const fresh = new Map([["settingsCatalog|pa", pol("pa", opA.after)]]);
  const u = M.undoPlan([{ surface: "settingsCatalog", id: "pa", name: "pa", assignments: AE.bodyAssignments(null, opA.before) }], fresh);
  ok("undo plans the recorded list against the tenant as it is now", u.changes.length === 1 && AE.sig(u.changes[0].after) === AE.sig(A.assignments) && u.changes[0].beforeSig === AE.sig(opA.after));
  const u2 = M.undoPlan([{ surface: "settingsCatalog", id: "pa", name: "pa", assignments: opA.after }], fresh);
  ok("undo of a list already in place is a noop", u2.changes.length === 0 && u2.noops.length === 1);

  // ------------------------------------------------------- retirement --
  const ret = M.retirement(model);
  const rt = (id) => ret.find((x) => x.O.id === id);
  ok("old AV: covered, values differ (cloud block level)", rt("o1").verdict === "differs" && rt("o1").diff === 1 && rt("o1").none === 0);
  ok("WHfB with no new replacement is a GAP", rt("o4").verdict === "gap" && rt("o4").none === 1);
  ok("legacy intent is a manual review with its covering new AV policy", rt("i1").verdict === "manual" && rt("i1").covering.some((c) => c.id === "n1"));
  ok("gaps sort first", ret[0].verdict === "gap");

  // -------------------------------------------------------------- waves --
  const found = new Map([["pvm-ug-mde-wave-euro", { id: G(2), displayName: "PVM-UG-MDE-WAVE-Euro" }], ["pvm-ug-mde-wave-americas", null]]);
  const wv = M.waves(model, found, kinds, pairs);
  const euro = wv.find((x) => x.name === "PVM-UG-MDE-WAVE-Euro");
  ok("an existing wave lists the new policies that include it", euro.exists && euro.newIncluding.map((p) => p.id).sort().join() === "n1,n2");
  ok("…and the colliding old policies still to exclude it", euro.pending.some((p) => p.id === "o1") && !euro.pending.some((p) => p.id === "o2"));
  ok("a missing wave is said missing", wv.find((x) => x.name === "PVM-UG-MDE-WAVE-Americas").exists === false);
  ok("a wave never looked up is not called missing", wv.find((x) => x.name === "PVM-UG-MDE-WAVE-Italy").lookedUp === false);

  // -------------------------------------------------------------- patch --
  ok("patchAssignments moves the verdict locally", M.patchAssignments(model, "settingsCatalog", "o1", [inc(G(1)), exc(G(2))], names, new Map()));
  const pairs2 = M.compare(model);
  ok("after excluding the wave, the AV pair is resolved", pairs2.find((x) => x.N.id === "n1" && x.O.id === "o1").reach.verdict === "resolved");

  // ------------------------------------------------------------ exports --
  pairs.forEach((x) => { x.proposal = M.proposalFor(x, ctx); });
  const md = M.markdown(model, pairs, ret, wv, { tenant: "Contoso | Ltd", readAt: Date.UTC(2026, 8, 29), build: "v1" });
  ok("markdown names the new set, the waves and the gap", md.includes("Win - OIB - ES - Defender Antivirus") && md.includes("PVM-UG-MDE-WAVE-Euro") && md.includes("GAP"));
  ok("markdown escapes pipes in cells", md.includes("Contoso \\| Ltd"));
  ok("markdown says the unsupported exclusion", /NOT SUPPORTED/.test(md));
  const c = M.csv(pairs);
  ok("csv has a header and quotes commas", c.split("\r\n")[0].startsWith("Old policy,") && /"[^"]*,[^"]*"/.test(c));

  // -------------------------------------------------- the shared engine --
  const last = AE.SURFACES[AE.SURFACES.length - 1];
  ok("AssignEdit gains the legacy intents surface, appended last", last.id === "intents" && last.section === "intents"
    && last.assign("x") === "/deviceManagement/intents/x/assign" && last.read1("x") === "/deviceManagement/intents/x/assignments");
  ok("the first surface is still device configuration (index readers)", AE.SURFACES[0].id === "deviceConfig");
  const bj = JSON.parse(AE.backupJson({ action: "add-include", group: { id: "g", displayName: "G" }, changes: [opA] }));
  ok("T11's backup file keeps its header and key order", Object.keys(bj).join() === "tool,build,takenUtc,note,action,group,policies" && bj.tool === "TUNO T11 assignment editor");
  const bo = JSON.parse(AE.backupOf([opA], { tool: "TUNO T28 MDE rollout", run: "x" }));
  ok("backupOf writes the same policies block under another header", bo.tool === "TUNO T28 MDE rollout" && bo.policies[0].assign === "/deviceManagement/configurationPolicies/pa/assign" && bo.policies[0].assignments.length === 2);
}

run().then(() => {
  console.log(`mderollout-engine: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exitCode = 1; });

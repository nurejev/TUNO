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
  "js/groupmigrate.js", "js/mdemembers.js", "js/mdereports.js", "js/mdeexclude.js", "js/mderollout.js", "js/mderolloutv2.js"];
w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
  + "\n;Object.assign(window, {MdeRolloutV2, MdeMembers, AssignEdit, Docs, Graph, Conflict, EndpointSec, EndpointPosture, GroupMigrate});");
const M = w.MdeRolloutV2, AE = w.AssignEdit, Docs = w.Docs;
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

const names = new Map([[G(1), "PVM-DG-CORP-ALL-WIN"], [G(2), "INT-SG-U-WAVE-Euro"], [G(3), "INT-SG-U-WAVE-Americas"], [G(4), "PVM-DG-MDE-EXCLUDED"]]);
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
  // the fixtures use the one-rule ASR policy, which is on the default
  // leave-out list since 10642 — taken off it here, as ➕ include does
  const cfg = M.normConfig({ leaveOut: [], leaveOutSeed: M.DEFAULTS.leaveOutSeed });
  ok("by default the one-rule ASR policy is left out (10642)", M.generationOf(NEW_ASR.name, M.normConfig({})) === "out" && M.generationOf(NEW_ASR.name, cfg) === "new");
  ok("defaults carry the three new prefixes", cfg.newPrefixes.join("|") === "Win - OIB|WIN-SEC|WIN-DCP");
  ok("defaults carry five regions", cfg.waveRegions.join("|") === "Euro|Americas|Asia-Pacific|Italy|BAMSCA");
  ok("each region is a device + user pair, then the two exclusion groups (12 names)", cfg.waves.length === 12
    && cfg.waves.slice(0, 2).join("|") === "INT-SG-D-WAVE-Euro|INT-SG-U-WAVE-Euro"
    && cfg.waves.includes("INT-SG-U-WAVE-Asia-Pacific") && cfg.waves.includes("INT-SG-D-WAVE-BAMSCA")
    && cfg.waves.slice(-2).join("|") === "INT-SG-D-MDE-Exclusion|INT-SG-U-MDE-Exclusion");
  ok("the pair members name each other as twins", cfg.groups[0].twin === "INT-SG-U-WAVE-Euro" && cfg.groups[1].twin === "INT-SG-D-WAVE-Euro" && cfg.groups[0].audience === "device" && cfg.groups[1].audience === "user");
  ok("exclusion groups carry their role and audience", cfg.groups.filter((g) => g.role === "exclusion").map((g) => g.audience).join() === "device,user");
  const mig = M.normConfig({ waves: ["PVM-UG-MDE-WAVE-Euro", "PVM-UG-MDE-WAVE-Italy"] });
  ok("a 10632 config (full UG names) migrates to regions", mig.waveRegions.join("|") === "Euro|Italy" && mig.waves.includes("INT-SG-D-WAVE-Italy"));
  ok("a blank exclusion name drops that group", !M.normConfig({ exclusionUser: "" }).waves.includes("INT-SG-U-MDE-Exclusion") && M.normConfig({ exclusionUser: "" }).waves.includes("INT-SG-D-MDE-Exclusion"));
  ok("custom prefixes build the names", M.normConfig({ waveRegions: ["NL"], waveDevicePrefix: "X-DG-", waveUserPrefix: "X-UG-" }).waves.slice(0, 2).join("|") === "X-DG-NL|X-UG-NL");
  ok("audience: \" - D - \" is device", M.audienceOf("Win - OIB - ES - Defender Antivirus - D - AV Configuration - v3.3") === "device");
  ok("audience: -D- without spaces is device", M.audienceOf("WIN-SEC-AttackSurfaceReduction-D-02_Block x") === "device");
  ok("audience: \" - U - \" and -u- are user", M.audienceOf("Win - OIB - ES - Edge - U - Sync") === "user" && M.audienceOf("win-sec-x-u-y") === "user");
  ok("audience: WIN-DCP and PVM-DG-… are not a D", M.audienceOf("WIN-DCP-DeviceConfiguration-x") === null && M.audienceOf("PVM-DG-CORP-ENDSEC-WIN-AV-PRD") === null);
  ok("audience: both or neither is null", M.audienceOf("X - D - Y - U - Z") === null && M.audienceOf("Plain name") === null);
  ok("audience survives the TO-BE-REMOVED marker", M.audienceOf("(TO-BE-REMOVED) Old - U - thing") === "user");
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
  ok("dynamic device rule is device", w.MdeRolloutV2.kindOfGroup({ membershipRule: '(device.deviceOSType -eq "Windows")' }).kind === "device");
  ok("dynamic user rule is user", M.kindOfGroup({ membershipRule: '(user.country -eq "NL")' }).kind === "user");
  ok("counts decide an assigned group", M.kindOfGroup({ displayName: "x" }, 3, 0).kind === "user" && M.kindOfGroup({ displayName: "x" }, 0, 2).kind === "device" && M.kindOfGroup({ displayName: "x" }, 1, 1).kind === "mixed");
  const emptyUG = M.kindOfGroup({ displayName: "INT-SG-U-WAVE-Euro" }, 0, 0);
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

  // ------------------------------------------- 🌊 fix with the waves (10643) --
  // Mihai: "conflict with old: offer to add the wave groups to the old
  // policies" — option A, and "yes, same plan" for the include.
  const lcW = (x) => String(x).toLowerCase();
  const wvw = (id, audience, region) => ({ id: lcW(id), audience, region, name: `wave ${region} ${audience}` });
  const namesW = new Map([...names, [lcW(G(7)), "INT-SG-D-WAVE-Euro"], [lcW(G(8)), "INT-SG-D-WAVE-Americas"], [lcW(G(9)), "INT-SG-U-WAVE-Euro"]]);
  const wctx = { kinds: new Map([[lcW(G(7)), { kind: "device" }], [lcW(G(8)), { kind: "device" }], [lcW(G(9)), { kind: "user" }], [G(1), { kind: "device" }], [G(2), { kind: "user" }]]), names: namesW, fixWith: "waves",
    waves: [wvw(G(7), "device", "Euro"), wvw(G(8), "device", "Americas"), wvw(G(9), "user", "Euro")] };
  // a - D - new policy on a pilot group, an old one on All devices
  const Nd = Object.assign({}, P("n1"), { name: "Win - OIB - ES - Windows LAPS - D - LAPS - v3.6", audience: "device", reach: w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: "gpilot" }, { kind: "Included", groupId: lcW(G(7)) }] }) });
  const Od = Object.assign({}, P("o1"), { reach: w.Conflict.reachOf({ assignments: [{ kind: "All devices" }] }), item: { assignments: [{ kind: "All devices" }] } });
  const wp = M.proposalFor({ id: "x", N: Nd, O: Od, type: "conflict", reach: { verdict: "can", why: "" } }, wctx);
  ok("waves mode: the device waves out of the old policy — not the pilot group, not the user wave", wp.byWaves && wp.steps.map((x) => x.groupName).join() === "INT-SG-D-WAVE-Euro,INT-SG-D-WAVE-Americas" && wp.steps.every((x) => x.action === "add-exclude" && x.supported === true));
  ok("…the wave the new policy has not got is included in the same plan", wp.includes.map((x) => x.groupName).join() === "INT-SG-D-WAVE-Americas" && wp.steps.find((x) => /Americas/.test(x.groupName)).needsInclude && !wp.steps.find((x) => /Euro/.test(x.groupName)).needsInclude);
  ok("…and the new policy's own other group is named, left alone", wp.rest.join() === "gpilot");
  const wpR = M.proposalFor({ id: "x", N: Nd, O: Od, type: "conflict", reach: { verdict: "can", why: "" } }, Object.assign({}, wctx, { regions: new Set(["Euro"]) }));
  ok("…the ticked regions narrow it", wpR.steps.map((x) => x.groupName).join() === "INT-SG-D-WAVE-Euro" && wpR.includes.length === 0);
  const OdEx = Object.assign({}, Od, { reach: w.Conflict.reachOf({ assignments: [{ kind: "All devices" }, { kind: "Excluded", groupId: lcW(G(7)) }, { kind: "Excluded", groupId: lcW(G(8)) }] }) });
  const wpDone = M.proposalFor({ id: "x", N: Object.assign({}, Nd, { reach: w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: lcW(G(7)) }, { kind: "Included", groupId: lcW(G(8)) }, { kind: "Included", groupId: "gpilot" }] }) }), O: OdEx, type: "conflict", reach: { verdict: "can", why: "" } }, wctx);
  ok("…in place: nothing to do, and the pilot group still meeting the old policy is said", wpDone.steps.length === 0 && wpDone.includes.length === 0 && /waves are in place/.test(wpDone.none) && /gpilot/.test(wpDone.none));
  ok("groups mode is unchanged: the new policy's include groups", M.proposalFor({ id: "x", N: Nd, O: Od, type: "conflict", reach: { verdict: "can", why: "" } }, Object.assign({}, wctx, { fixWith: "groups" })).steps.map((x) => x.groupId).sort().join() === ["gpilot", lcW(G(7))].sort().join());
  ok("the default is the waves; 'groups' is kept", M.normConfig({}).fixWith === "waves" && M.normConfig({ fixWith: "groups" }).fixWith === "groups");

  // ---------------------------------------------- 🧪 pilots off (10645) --
  // Mihai: "when adding the wave groups to new policies remove the pilot
  // groups" — option A (both sides), in ⚔️ and ⚡.
  ok("the four pilot groups are the default, the tick is on, and both are kept", M.normConfig({}).pilotGroups.join() === "INT-SG-D-Win-Pilot,INT-SG-D-Win-Pre-Pilot,INT-SG-U-Win-Pre-Pilot,INT-SG-U-Win-Pilot"
    && M.normConfig({}).pilotGroupsOff === true && M.normConfig({ pilotGroupsOff: false, pilotGroups: ["X"] }).pilotGroupsOff === false && M.normConfig({ pilotGroups: ["X"] }).pilotGroups.join() === "X");
  const cfgPil = M.normConfig({});
  const namesP = new Map([...namesW, ["gpd", "INT-SG-D-Win-Pilot"], ["gpre", "INT-SG-D-Win-Pre-Pilot"], ["gpu", "INT-SG-U-Win-Pilot"]]);
  const NdP = Object.assign({}, P("n1"), { name: "Win - OIB - ES - Windows LAPS - D - LAPS - v3.6", audience: "device", generation: "new", surface: "settingsCatalog",
    reach: w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: "gpd" }, { kind: "Included", groupId: lcW(G(7)) }] }) });
  const OdP = Object.assign({}, P("o1"), { generation: "old", surface: "settingsCatalog",
    reach: w.Conflict.reachOf({ assignments: [{ kind: "All devices" }, { kind: "Excluded", groupId: "gpd" }, { kind: "Excluded", groupId: "gpre" }] }) });
  const prP = { id: "p", N: NdP, O: OdP, type: "conflict", reach: { verdict: "can", why: "" } };
  const pctx = Object.assign({}, wctx, { names: namesP, cfg: cfgPil, pairs: [prP] });
  const wpP = M.proposalFor(prP, pctx);
  const pSide = (x, side) => x.steps.filter((st) => st.side === side).map((st) => st.groupName).sort().join();
  ok("⚔️ every wave in, every wave out: the pilot comes off the new policy and the pilot exclusions off the old one, in the same fix",
    pSide(wpP.pilots, "new") === "INT-SG-D-Win-Pilot" && pSide(wpP.pilots, "old") === "INT-SG-D-Win-Pilot,INT-SG-D-Win-Pre-Pilot" && wpP.pilots.steps.every((st) => st.action === "remove") && !wpP.pilots.kept.length);
  const wpPR = M.proposalFor(prP, Object.assign({}, pctx, { regions: new Set(["Euro"]) }));
  ok("…with a region unticked, the pilots stay on both sides, and say which wave is missing", !wpPR.pilots.steps.length && wpPR.pilots.kept.length === 3
    && wpPR.pilots.kept.every((k) => /INT-SG-D-WAVE-Americas/.test(k.why)));
  ok("…the tick off: nothing about pilots", !M.proposalFor(prP, Object.assign({}, pctx, { cfg: M.normConfig({ pilotGroupsOff: false }) })).pilots.steps.length);
  // another new policy on the same old one still includes the pilot, and
  // has no waves: the old side keeps that pilot's exclusion (else a pilot
  // member outside a wave gets both), so the new side keeps the pilot too
  // (else neither). The Pre-Pilot exclusion, which no new policy includes, goes.
  const N3P = Object.assign({}, P("n2"), { name: "Win - OIB - ES - Account - D - Other", audience: "device", generation: "new", surface: "settingsCatalog",
    reach: w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: "gpd" }] }) });
  const pairs3 = [prP, { id: "q", N: N3P, O: OdP, type: "conflict", reach: { verdict: "can", why: "" } }];
  const fxP = M.proposalFor(prP, Object.assign({}, pctx, { pairs: pairs3 })).pilots;
  ok("each side needs the other: a colliding new policy still on the pilot keeps it on both sides", fxP.steps.map((st) => `${st.side}:${st.groupName}`).join() === "old:INT-SG-D-Win-Pre-Pilot"
    && fxP.kept.some((k) => k.side === "old" && /still includes it — its members outside a wave would get both/.test(k.why)) && fxP.kept.some((k) => k.side === "new" && /still excludes it — its members outside a wave would get neither/.test(k.why)));
  ok("a pilot-only fix is still a fix (the waves already in place)", (() => {
    const Nin = Object.assign({}, NdP, { reach: w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: "gpd" }, { kind: "Included", groupId: lcW(G(7)) }, { kind: "Included", groupId: lcW(G(8)) }] }) });
    const Oout = Object.assign({}, OdP, { reach: w.Conflict.reachOf({ assignments: [{ kind: "All devices" }, { kind: "Excluded", groupId: "gpd" }, { kind: "Excluded", groupId: lcW(G(7)) }, { kind: "Excluded", groupId: lcW(G(8)) }] }) });
    const prI = { id: "i", N: Nin, O: Oout, type: "conflict", reach: { verdict: "can", why: "" } };
    const x = M.proposalFor(prI, Object.assign({}, pctx, { pairs: [prI] }));
    return !x.steps.length && !x.includes.length && x.pilots.steps.length === 2 && !x.none;
  })());
  // ⚡①: the waves into the new policy — and, where the old policy already
  // has them out, the pilots off both sides (wide: the colliding old ones too)
  const cfgR = M.normConfig({ waveRegions: ["Euro", "Americas"] });
  const foundR = new Map(cfgR.groups.map((g, i) => [lcW(g.name), { id: `w${i}`, displayName: g.name }]));
  const devW = cfgR.groups.filter((g) => g.role === "wave" && g.audience === "device").map((g) => foundR.get(lcW(g.name)).id);
  const namesR = new Map([...namesP, ...cfgR.groups.map((g) => [foundR.get(lcW(g.name)).id, g.name])]);
  const NR = Object.assign({}, NdP, { reach: w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: "gpd" }] }) });
  const OR = Object.assign({}, OdP, { reach: w.Conflict.reachOf({ assignments: [{ kind: "All devices" }, { kind: "Excluded", groupId: "gpd" }].concat(devW.map((id) => ({ kind: "Excluded", groupId: id }))) }) });
  const modelR = { cfg: cfgR, newP: [NR], oldP: [OR], policies: [NR, OR] };
  const r1 = M.rolloutWants("includeWaves", modelR, { kinds: new Map(), found: foundR, twins: M.twinIndex(cfgR, foundR), names: namesR, pairs: [{ id: "r", N: NR, O: OR, type: "conflict", reach: { verdict: "can", why: "" } }] });
  ok("⚡① the device waves in, and the pilot off the new policy and off the old one's exclusions", r1.wants.filter((x) => x.action === "add-include").map((x) => x.groupId).sort().join() === devW.slice().sort().join()
    && r1.wants.filter((x) => x.action === "remove").map((x) => `${x.P === NR ? "new" : "old"}:${x.groupName}`).sort().join() === "new:INT-SG-D-Win-Pilot,old:INT-SG-D-Win-Pilot", JSON.stringify(r1.wants.map((x) => [x.action, x.groupName])));
  const OR2 = Object.assign({}, OR, { reach: w.Conflict.reachOf({ assignments: [{ kind: "All devices" }, { kind: "Excluded", groupId: "gpd" }] }) });
  const r1b = M.rolloutWants("includeWaves", Object.assign({}, modelR, { oldP: [OR2], policies: [NR, OR2] }), { kinds: new Map(), found: foundR, twins: M.twinIndex(cfgR, foundR), names: namesR, pairs: [{ id: "r", N: NR, O: OR2, type: "conflict", reach: { verdict: "can", why: "" } }] });
  ok("⚡① with the waves still on the old policy: the pilots stay, and the reason is listed", !r1b.wants.some((x) => x.action === "remove") && r1b.skipped.some((x) => /stays excluded on .* not out of it after this plan/.test(x)) && r1b.skipped.some((x) => /stays on .*still excludes it/.test(x)));

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
  const found = new Map([["int-sg-u-wave-euro", { id: G(2), displayName: "INT-SG-U-WAVE-Euro" }], ["int-sg-u-wave-americas", null]]);
  const wv = M.waves(model, found, kinds, pairs);
  const euro = wv.find((x) => x.name === "INT-SG-U-WAVE-Euro");
  ok("an existing wave lists the new policies that include it", euro.exists && euro.newIncluding.map((p) => p.id).sort().join() === "n1,n2");
  ok("…and the colliding old policies still to exclude it", euro.pending.some((p) => p.id === "o1") && !euro.pending.some((p) => p.id === "o2"));
  ok("a missing wave is said missing", wv.find((x) => x.name === "INT-SG-U-WAVE-Americas").exists === false);
  ok("a wave never looked up is not called missing", wv.find((x) => x.name === "INT-SG-U-WAVE-Italy").lookedUp === false);

  // ------------------------------------ wave pairs: twins (10633) --
  ok("a policy carries its audience", P("n1").audience === "device" && P("n2").audience === "device" && P("o1").audience === null);
  const G5 = G(5);
  names.set(G5, "INT-SG-D-WAVE-Euro");
  const found2 = new Map([["int-sg-u-wave-euro", { id: G(2), displayName: "INT-SG-U-WAVE-Euro" }], ["int-sg-d-wave-euro", { id: G5, displayName: "INT-SG-D-WAVE-Euro" }],
    ["int-sg-d-mde-exclusion", null], ["int-sg-u-mde-exclusion", { id: G(6), displayName: "INT-SG-U-MDE-Exclusion" }]]);
  const twins = M.twinIndex(model.cfg, found2);
  ok("twinIndex maps each wave to its twin's id", twins.get(G(2)).twinId === G5 && twins.get(G5).twinId === G(2) && !twins.has(G(6)));
  const kinds2 = new Map([[G(1), { kind: "device", source: "members" }], [G(2), { kind: "user", source: "members" }], [G5, { kind: "device", source: "name (group is empty)" }]]);
  const tp = M.proposalFor(pr("n1", "o1"), { kinds: kinds2, twins, names });
  ok("a user wave vs a device-targeted old policy: its DEVICE twin is proposed", tp.steps.length === 1 && tp.steps[0].groupId === G5 && tp.steps[0].supported === true && tp.steps[0].twinOf === "INT-SG-U-WAVE-Euro" && tp.steps[0].twinOfId === G(2));
  ok("…with the reason in a note", tp.steps[0].notes.some((n) => /^twin:/.test(n) && /cannot mix/.test(n)));
  const twinsNoDg = M.twinIndex(model.cfg, new Map([["int-sg-u-wave-euro", { id: G(2) }], ["int-sg-d-wave-euro", null]]));
  const mp = M.proposalFor(pr("n1", "o1"), { kinds: kinds2, twins: twinsNoDg, names });
  ok("a missing twin: still refused, and the twin is named to create", mp.steps[0].supported === false && mp.steps[0].missingTwin === "INT-SG-D-WAVE-Euro" && /create it/.test(mp.steps[0].why));
  const kindsU2 = new Map([[G(1), { kind: "user" }], [G(2), { kind: "user" }]]);
  ok("a user wave vs a user-targeted old policy keeps the user wave", M.proposalFor(pr("n1", "o1"), { kinds: kindsU2, twins, names }).steps[0].groupId === G(2));
  const pool = M.wavePool(model.cfg, found2);
  ok("wavePool lists existing waves with their audience, not exclusion groups", pool.length === 2 && pool.some((x) => x.id === G5 && x.audience === "device") && !pool.some((x) => x.id === G(6)));
  const st2 = M.proposalFor(pr("n3", "o3"), { kinds: kinds2, waves: pool, twins, names });
  ok("a staged \" - D - \" policy is planned with the DEVICE wave only", st2.steps.length === 1 && st2.steps[0].groupId === G5 && st2.steps[0].planned);
  const oByName = Object.assign({}, P("o1"), { audience: "device" });
  const et = M.effectiveTargets(oByName, new Map());
  ok("unknown include kinds: the old policy's name decides the target kind, and says so", et.byName && [...et.kinds].join() === "device");
  ok("known include kinds win over the name", M.effectiveTargets(Object.assign({}, P("o1"), { audience: "user" }), kinds2).byName === false);
  const byNamePr = Object.assign({}, pr("n1", "o1"), { O: oByName });
  const bn = M.proposalFor(byNamePr, { kinds: new Map([[G(2), { kind: "user" }]]), twins, names });
  ok("…and the twin is chosen from it", bn.steps[0].groupId === G5 && bn.steps[0].notes.some((n) => /from the old policy's name/.test(n)));
  const rN = w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: G(2) }] });
  const rO = w.Conflict.reachOf({ assignments: [{ kind: "Included", groupId: G(1) }, { kind: "Excluded", groupId: G5 }] });
  const rv = M.pairReach({ reach: rN }, { reach: rO }, twins);
  ok("an old policy excluding the wave's twin is resolved, by twin", rv.verdict === "resolved" && rv.byTwin === true);
  ok("without the twin map it is not", M.pairReach({ reach: rN }, { reach: rO }).verdict !== "resolved");
  const wv2 = M.waves(model, found2, kinds2, pairs);
  ok("waves: one row per group, 12 by default", wv2.length === 12 && wv2.filter((x) => x.role === "exclusion").length === 2);
  const dgE = wv2.find((x) => x.name === "INT-SG-D-WAVE-Euro"), ugE = wv2.find((x) => x.name === "INT-SG-U-WAVE-Euro");
  ok("a device wave fits the - D - policies", dgE.fits.some((N) => N.id === "n1") && dgE.twinId === G(2));
  ok("a user wave included in - D - policies is a misfit", ugE.misfit.map((N) => N.id).sort().join() === "n1,n2" && !ugE.fits.some((N) => N.id === "n1"));
  const exU = wv2.find((x) => x.name === "INT-SG-U-MDE-Exclusion"), exD = wv2.find((x) => x.name === "INT-SG-D-MDE-Exclusion");
  ok("exclusion groups: exists / missing, and no outstanding old-policy work", exU.exists && !exD.exists && exD.lookedUp && exU.pending.length === 0);
  const md2 = M.markdown(model, pairs, M.retirement(model), wv2, {});
  ok("markdown lists the pairs and exclusion groups", md2.includes("INT-SG-D-WAVE-Euro") && md2.includes("INT-SG-U-MDE-Exclusion") && /\| exclusion \|/.test(md2));
  // ------------------------------------------ rollout actions (10633) --
  ok("policyKind: the name first", M.policyKind(P("n1"), kinds2).kind === "device" && M.policyKind(P("n1"), kinds2).source === "name");
  ok("policyKind: no D/U in the name → the targets, when one kind", M.policyKind(P("o1"), kinds2).kind === "device" && M.policyKind(P("o1"), kinds2).source === "targets");
  ok("policyKind: unassigned and unnamed → unknown", M.policyKind(Object.assign({}, P("n3"), { audience: null }), kinds2).kind === null);
  const rctx = (extra) => Object.assign({ kinds: kinds2, found: found2, twins, names, pairs }, extra || {});
  const iw = M.rolloutWants("includeWaves", model, rctx());
  ok("① include: the device wave into every - D - new policy not holding it", iw.wants.length === 3 && iw.wants.every((x) => x.groupId === G5 && x.action === "add-include") && iw.policies.map((p) => p.id).sort().join() === "n1,n2,n3");
  ok("① never the user wave into a - D - policy", !iw.wants.some((x) => x.groupId === G(2)));
  ok("① a wave that does not exist is named to create", iw.skipped.some((x) => /INT-SG-D-WAVE-Americas does not exist/.test(x)));
  ok("① regions narrow it (and the other regions' missing waves go quiet)", M.rolloutWants("includeWaves", model, rctx({ regions: new Set(["Euro"]) })).skipped.length === 0
    && M.rolloutWants("includeWaves", model, rctx({ regions: new Set(["Italy"]) })).wants.length === 0);
  const ex0 = M.rolloutWants("excludeExclusion", model, rctx());
  ok("② a missing device exclusion group: not planned, the group named", !ex0.wants.some((x) => x.P.id === "n3") && ex0.skipped.some((x) => /INT-SG-D-MDE-Exclusion does not exist/.test(x)));
  ok("② a - D - policy assigned to a USER group takes the USER exclusion group (support matrix), and says why", ex0.wants.filter((x) => x.groupId === G(6)).map((x) => x.P.id).sort().join() === "n1,n2" && /assigned to user groups/.test(ex0.wants[0].note));
  const found3 = new Map(found2); found3.set("int-sg-d-mde-exclusion", { id: G(7), displayName: "INT-SG-D-MDE-Exclusion" });
  const ex1 = M.rolloutWants("excludeExclusion", model, rctx({ found: found3 }));
  ok("② once it exists, the device exclusion group from the - D - policy on device targets", ex1.wants.length === 3 && ex1.wants.find((x) => x.P.id === "n3").groupId === G(7) && ex1.wants.every((x) => x.action === "add-exclude"));
  const pairsP = M.compare(model, twins); pairsP.forEach((x) => { x.proposal = M.proposalFor(x, { kinds: kinds2, twins, names, waves: M.wavePool(model.cfg, found2) }); });
  const xw = M.rolloutWants("excludeWaves", model, rctx({ pairs: pairsP }));
  ok("③ the waves leave the colliding old policies — the device twin from the device-targeted one", xw.wants.some((x) => x.P.id === "o1" && x.groupId === G5 && /twin of/.test(x.note)));
  ok("③ only waves, only old policies", xw.wants.every((x) => (x.groupId === G5 || x.groupId === G(2)) && M.isOld(x.P)));
  ok("③ a region not ticked is left alone", M.rolloutWants("excludeWaves", model, rctx({ pairs: pairsP, regions: new Set(["Italy"]) })).wants.length === 0);
  ok("rollout wants are deduped per policy, group and action", new Set(xw.wants.map((x) => `${x.P.key}|${x.groupId}|${x.action}`)).size === xw.wants.length);
  // 10643: with the ⚔️ waves mode, ③ still never takes a wave out ahead of
  // the new policy — a step that needs the include is left to ⚔️ / ①
  const pairsW = M.compare(model, twins); pairsW.forEach((x) => { x.proposal = M.proposalFor(x, { kinds: kinds2, twins, names, waves: M.wavePool(model.cfg, found2), fixWith: "waves" }); });
  const xwW = M.rolloutWants("excludeWaves", model, rctx({ pairs: pairsW }));
  const ahead = pairsW.flatMap((x) => x.proposal.steps || []).filter((st) => st.needsInclude);
  ok("③ in waves mode skips a wave the new policy has not got, and says so", ahead.length > 0 && xwW.skipped.some((x) => /does not include it yet/.test(x))
    && !xwW.wants.some((x) => ahead.some((st) => st.groupId === x.groupId && pairsW.some((p) => p.O === x.P && p.proposal.steps.includes(st)))));
  names.delete(G5);

  // -------------------------------------------------------------- patch --
  ok("patchAssignments moves the verdict locally", M.patchAssignments(model, "settingsCatalog", "o1", [inc(G(1)), exc(G(2))], names, new Map()));
  const pairs2 = M.compare(model);
  ok("after excluding the wave, the AV pair is resolved", pairs2.find((x) => x.N.id === "n1" && x.O.id === "o1").reach.verdict === "resolved");

  // ------------------------------------------------------------ exports --
  pairs.forEach((x) => { x.proposal = M.proposalFor(x, ctx); });
  const md = M.markdown(model, pairs, ret, wv, { tenant: "Contoso | Ltd", readAt: Date.UTC(2026, 8, 29), build: "v1" });
  ok("markdown names the new set, the waves and the gap", md.includes("Win - OIB - ES - Defender Antivirus") && md.includes("INT-SG-U-WAVE-Euro") && md.includes("GAP"));
  ok("markdown escapes pipes in cells", md.includes("Contoso \\| Ltd"));
  ok("markdown says the unsupported exclusion", /NOT SUPPORTED/.test(md));
  const c = M.csv(pairs);
  ok("csv has a header and quotes commas", c.split("\r\n")[0].startsWith("Old policy,") && /"[^"]*,[^"]*"/.test(c));

  // ------------------------------- also in scope by name (10634) --
  ok("the ten named OIB policies are in the target list by default", M.normConfig({}).alsoInScope.length === 10 && M.normConfig({}).alsoInScope.some((n) => /Delivery Optimisation/.test(n))
    && M.normConfig({}).alsoInScope.includes("Win - OIB - SC - Device Security - U - Windows Spotlight and Org Messages - v3.0"));
  // 10652 (Mihai: "add the to be include"): five more Device Security
  // policies; a config saved before gets them merged in once
  const FIVE = M.DEFAULTS.alsoInScope.slice(0, 5);
  const savedAlso = M.normConfig({ alsoInScope: FIVE.concat(["WIN - OIB - SC - Device Security - D - User Rights - v3.7", "Mine - D - x"]) });
  ok("a config savedAlso before 10652 gets the five new names once, its own kept, no double by dash or case", savedAlso.alsoInScope.length === 11 && savedAlso.alsoInScope.includes("Mine - D - x")
    && savedAlso.alsoInScope.includes("Win - OIB - SC - Device Security - D - Windows Package Manager - v3.5") && !savedAlso.alsoInScope.includes("Win - OIB - SC - Device Security - D - User Rights - v3.7")
    && savedAlso.alsoInScopeSeed === M.DEFAULTS.alsoInScopeSeed);
  const takenOff = M.normConfig(JSON.parse(JSON.stringify(Object.assign({}, savedAlso, { alsoInScope: savedAlso.alsoInScope.filter((n) => !/Sandbox/.test(n)) }))));
  ok("…a name taken off by hand after that stays off", takenOff.alsoInScope.length === 10 && !takenOff.alsoInScope.some((n) => /Sandbox/.test(n)));
  ok("their settings are Device security", ["device_vendor_msft_policy_config_windowssandbox_allownetworking", "device_vendor_msft_dmclient_provider_{providerid}_configrefresh_enabled",
    "device_vendor_msft_policy_config_desktopappinstaller_enableappinstaller", "user_vendor_msft_policy_config_experience_allowwindowsspotlight",
    "user_vendor_msft_policy_config_experience_enableorganizationalmessages", "device_vendor_msft_policy_config_userrights_debugprograms"].every((k) => M.catOfKey(k) === "hard"));
  const AUD = "device_vendor_msft_policy_config_audit_accountlogon_auditcredentialvalidation";
  const DO = "device_vendor_msft_policy_config_deliveryoptimization_dodownloadmode";
  ok("audit settings are Device security, delivery optimisation Updates & telemetry", M.catOfKey(AUD) === "hard" && M.catOfKey(DO) === "upd" && M.catMeta("hard").label === "Device security");
  const NAMED = cp("n9", "Win - OIB - SC - Device Security - D - Audit and Event Logging - v3.7", null, [choice(AUD, `${AUD}_3`)], [inc(G(1))]);
  const NAMED_DO = cp("n8", "Win - OIB - SC - Windows Update for Business - D - Delivery Optimisation - v3.0", null, [choice(DO, `${DO}_1`)], []);
  const OLD_AUDIT = cp("o9", "PVM-DG-CORP-WIN-AUDIT-PRD", null, [choice(AUD, `${AUD}_1`)], [inc(G(1))]);
  const OIB_OTHER = cp("n7", "Win - OIB - SC - Something Unrelated - D - v1", null, [choice(WIFI, `${WIFI}_1`)], []);
  const m2 = M.build(resOf([{ id: "settingsCatalog", raw: [NEW_AV, NAMED, NAMED_DO, OLD_AUDIT, WIFI_P, OIB_OTHER] }, { id: "intents", raw: [] }, { id: "deviceConfigurations", raw: [] }, { id: "admx", raw: [] }]), {}, TEMPLATES);
  const P2 = (id) => m2.policies.find((p) => p.id === id);
  ok("a named policy is in scope and new, and says why", P2("n9") && P2("n9").generation === "new" && /by name/.test(P2("n9").scopeWhy) && P2("n9").cats.includes("hard"));
  ok("the Delivery Optimisation policy is in scope as Updates & telemetry", P2("n8") && P2("n8").cats.includes("upd"));
  ok("an old policy setting the same audit setting is pulled in, and says why", P2("o9") && P2("o9").generation === "old" && /sets a setting/.test(P2("o9").scopeWhy));
  ok("an unrelated old policy and an unnamed OIB policy outside the MDE areas stay out", !P2("u1") && !P2("n7"));
  const pa = M.compare(m2).find((x) => x.N.id === "n9" && x.O.id === "o9");
  ok("…and the pair is a setting conflict", pa && pa.type === "conflict" && pa.diffs[0].key === AUD);
  ok("the name match ignores case and dash spacing", !!M.build(resOf([{ id: "settingsCatalog", raw: [cp("n6", "WIN - OIB - SC - Device Security - D - Security Hardening - v3.7", null, [choice(AUD, `${AUD}_1`)], [])] }, { id: "intents", raw: [] }, { id: "deviceConfigurations", raw: [] }, { id: "admx", raw: [] }]), {}, TEMPLATES).policies.find((p) => p.id === "n6"));

  // ------------------------------------- wave names, rename (10635) --
  const c10 = M.normConfig({});
  ok("the waves are INT-SG-D-WAVE-<region> / INT-SG-U-WAVE-<region>", c10.waves.slice(0, 2).join("|") === "INT-SG-D-WAVE-Euro|INT-SG-U-WAVE-Euro");
  ok("each wave remembers its earlier name, and the lookup asks for both", c10.groups[0].oldNames.join() === "PVM-DG-MDE-WAVE-Euro" && c10.lookup.includes("PVM-UG-MDE-WAVE-Italy") && c10.lookup.includes("INT-SG-U-WAVE-Italy"));
  const saved = M.normConfig({ waveDevicePrefix: "PVM-DG-MDE-WAVE-", waveUserPrefix: "PVM-UG-MDE-WAVE-" });
  ok("a config saved with the old DEFAULT names moves to the new ones", saved.waveDevicePrefix === "INT-SG-D-WAVE-" && saved.waveUserPrefix === "INT-SG-U-WAVE-");
  ok("a prefix chosen by hand stays", M.normConfig({ waveDevicePrefix: "X-D-" }).waveDevicePrefix === "X-D-");
  ok("a changed prefix is remembered as a rename source", M.normConfig({ waveDevicePrefix: "Y-D-", renameFrom: { device: ["X-D-"] } }).groups[0].oldNames.join() === "PVM-DG-MDE-WAVE-Euro,X-D-Euro");
  const foundOld = new Map([["pvm-dg-mde-wave-euro", { id: G(7), displayName: "PVM-DG-MDE-WAVE-Euro" }], ["int-sg-d-wave-euro", null], ["int-sg-u-wave-euro", { id: G(8), displayName: "INT-SG-U-WAVE-Euro" }], ["pvm-ug-mde-wave-euro", { id: G(9), displayName: "PVM-UG-MDE-WAVE-Euro" }]]);
  const wr = M.waves(model, foundOld, new Map(), pairs);
  const dW = wr.find((x) => x.name === "INT-SG-D-WAVE-Euro"), uW = wr.find((x) => x.name === "INT-SG-U-WAVE-Euro");
  ok("a wave only under its old name: not 'exists', offered for rename", !dW.exists && dW.legacy && dW.legacy.name === "PVM-DG-MDE-WAVE-Euro" && dW.legacy.group.id === G(7));
  ok("a wave under its new name, with an old-named group too: exists, the other said", uW.exists && !uW.legacy && uW.legacyToo.join() === "PVM-UG-MDE-WAVE-Euro");
  ok("a group name with a U / D segment reads as user / device", M.kindFromName("INT-SG-U-WAVE-Euro") === "user" && M.kindFromName("INT-SG-D-WAVE-Euro") === "device" && M.kindFromName("INT-SG-D-NLD") === "device");
  // renameGroup with Graph stubbed
  const gcalls = [];
  let taken = [], refuseNick = false, stored = { id: G(7), displayName: "PVM-DG-MDE-WAVE-Euro", securityEnabled: true };
  w.Graph.readAll = async (p) => { gcalls.push(["GETALL", p]); return taken; };
  w.Graph.patch = async (p, body) => { gcalls.push(["PATCH", p, Object.keys(body).join()]); if (refuseNick && body.mailNickname) throw new Error("Invalid value specified for property 'mailNickname'"); stored = Object.assign({}, stored, body); return null; };
  w.Graph.readOne = async () => stored;
  const rn = await M.renameGroup({ id: G(7), displayName: "PVM-DG-MDE-WAVE-Euro" }, "INT-SG-D-WAVE-Euro");
  ok("rename: display name and mail nickname in one PATCH, read back", rn.ok && rn.verified && gcalls.some((c) => c[0] === "PATCH" && c[2] === "displayName,mailNickname") && stored.displayName === "INT-SG-D-WAVE-Euro" && rn.from === "PVM-DG-MDE-WAVE-Euro");
  taken = [{ id: G(99), displayName: "INT-SG-D-WAVE-Italy" }];
  const rn2 = await M.renameGroup({ id: G(7), displayName: "x" }, "INT-SG-D-WAVE-Italy");
  ok("rename refused when another group has the name", !rn2.ok && /exists already/.test(rn2.why));
  taken = []; refuseNick = true; gcalls.length = 0;
  const rn3 = await M.renameGroup({ id: G(7), displayName: "INT-SG-D-WAVE-Euro" }, "INT-SG-D-WAVE-Asia-Pacific");
  ok("a refused mail nickname: the name alone, and said", rn3.ok && rn3.verified && /nickname/.test(rn3.note) && gcalls.filter((c) => c[0] === "PATCH").length === 2);

  // ------------------------------ exclusion group names (10636) --
  const c11 = M.normConfig({});
  ok("the exclusion groups are INT-SG-D-MDE-Exclusion / INT-SG-U-MDE-Exclusion, their old names looked up", c11.exclusionDevice === "INT-SG-D-MDE-Exclusion" && c11.exclusionUser === "INT-SG-U-MDE-Exclusion"
    && c11.groups.find((g) => g.name === "INT-SG-U-MDE-Exclusion").oldNames.join() === "PVM-UG-MDE-Exclusion" && c11.lookup.includes("PVM-DG-MDE-Exclusion"));
  ok("a config saved with the old default exclusion names moves along; a name typed by hand stays", M.normConfig({ exclusionDevice: "PVM-DG-MDE-Exclusion" }).exclusionDevice === "INT-SG-D-MDE-Exclusion" && M.normConfig({ exclusionUser: "MY-EXCL" }).exclusionUser === "MY-EXCL");
  const fx = new Map([["pvm-ug-mde-exclusion", { id: G(37), displayName: "PVM-UG-MDE-Exclusion" }]]);
  const exRow = M.waves(model, fx, new Map(), pairs).find((x) => x.name === "INT-SG-U-MDE-Exclusion");
  ok("an exclusion group under its old name is offered for rename", !exRow.exists && exRow.legacy && exRow.legacy.group.id === G(37));

  // ------------------------------------------- wave group: the owner --
  // (10633, Mihai: "creator is owner") — Graph does not make an admin the
  // owner of a security group it creates, so the create names the owner
  // and the owners read decides.
  {
    const ME = { id: "aaaaaaaa-0000-4000-8000-000000000001", userPrincipalName: "admin@x" };
    const run = async (opts) => {
      const posts = []; const owners = new Map(); let n = 0;
      w.Graph.readAll = async (p) => {
        if (/^\/groups\?\$filter/.test(p)) return [];
        const m = /^\/groups\/([^/?]+)\/owners/.exec(p); if (m) return (owners.get(m[1]) || []).map((id) => ({ id }));
        return [];
      };
      w.Graph.readOne = async (p) => ({ id: "g1", displayName: "INT-SG-U-WAVE-X", securityEnabled: true });
      w.Graph.post = async (p, body) => {
        posts.push({ p, body: JSON.parse(JSON.stringify(body)) });
        if (p === "/groups") {
          if (opts.refuseOwner && body["owners@odata.bind"]) throw new Error("A non-admin user cannot add self as owner");
          owners.set("g1", opts.dropOwner ? [] : (body["owners@odata.bind"] || []).map((u) => u.split("/").pop()));
          return { id: "g1", displayName: body.displayName };
        }
        if (/owners\/\$ref$/.test(p)) { if (!opts.refRefused) owners.set("g1", [body["@odata.id"].split("/").pop()]); return null; }
        return null;
      };
      const r = await w.MdeRolloutV2.createWave("INT-SG-U-WAVE-X", "d", ME);
      return { r, posts };
    };
    const a1 = await run({});
    ok("the create names the signed-in admin as owner", a1.posts[0].body["owners@odata.bind"][0].endsWith(ME.id) && a1.r.ownerVerified === true && a1.posts.length === 1);
    ok("…and keeps T22's payload rules", a1.posts[0].body.securityEnabled === true && a1.posts[0].body.mailEnabled === false && a1.posts[0].body.isAssignableToRole === false);
    const a2 = await run({ refuseOwner: true });
    ok("a refusal about the owner is retried without it, and said", a2.posts.filter((x) => x.p === "/groups").length === 2 && !a2.posts[1].body["owners@odata.bind"] && /refused/.test(a2.r.ownerNote));
    ok("…then the owner is added by $ref and read back", a2.posts.some((x) => /owners\/\$ref$/.test(x.p)) && a2.r.ownerVerified === true);
    const a3 = await run({ dropOwner: true, refRefused: true });
    ok("an owner the tenant does not confirm is reported, not claimed", a3.r.created && a3.r.ownerVerified === false && /did not take/.test(a3.r.ownerNote));
    let threw = false;
    w.Graph.post = async () => { throw new Error("Invalid value for mailNickname"); };
    try { await w.MdeRolloutV2.createWave("INT-SG-U-WAVE-X", "d", ME); } catch { threw = true; }
    ok("a refusal about anything else is NOT retried", threw);
  }

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

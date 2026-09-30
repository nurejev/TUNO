// T28 — 🎛 Adjust settings engine (build 10657): MdeAsr, DOM-free. The
// matrix over a real MdeRollout.build model (new set only, a rule no new
// policy carries, the legacy string form not editable, old/out never
// listed), the baseline from T15, Warn refused where Learn says so, the
// edit on both parent shapes without mutating the read, the PUT body, the
// plan, the read-back check and the undo.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), { runScripts: "outside-only" });
const w = dom.window;
const files = ["js/version.js", "js/graph.js", "js/progress.js", "js/groupuse.js", "js/document.js", "js/overview.js",
  "js/conflict.js", "js/defender.js", "js/endpointsec.js", "js/filterrules.js", "js/endpointposture.js", "js/assignedit.js",
  "js/groupmigrate.js", "js/mdemembers.js", "js/mdereports.js", "js/mdeexclude.js", "js/mdeasr.js", "js/mderollout.js"];
w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
  + "\n;Object.assign(window, {MdeRollout, MdeAsr, Docs, Defender, EndpointSec});");
const M = w.MdeRollout, A = w.MdeAsr, Docs = w.Docs;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name); }
}

const ASR = "device_vendor_msft_policy_config_defender_attacksurfacereductionrules";
const OBF = "blockexecutionofpotentiallyobfuscatedscripts";
const LSASS = "blockcredentialstealingfromwindowslocalsecurityauthoritysubsystem";
const DRV = "blockabuseofexploitedvulnerablesigneddrivers";
const choiceI = (defId, value, children) => ({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
  settingDefinitionId: defId, choiceSettingValue: { value, children: children || [] } });
// Graph's real shape: the ASR parent is a group collection
const groupAsr = (rules) => ({ id: "0", settingDefinitions: [{ id: ASR, displayName: "ASR rules" }], settingInstance: {
  "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance", settingDefinitionId: ASR,
  settingInstanceTemplateReference: { settingInstanceTemplateId: "tpl-asr" },
  groupSettingCollectionValue: [{ children: rules.map(([slug, mode]) => choiceI(`${ASR}_${slug}`, `${ASR}_${slug}_${mode}`)) }] } });
// the demo's shape: a choice parent with children
const choiceAsr = (rules) => ({ settingInstance: choiceI(ASR, `${ASR}_1`, rules.map(([slug, mode]) => choiceI(`${ASR}_${slug}`, `${ASR}_${slug}_${mode}`))) });
const legacyAsr = (s) => ({ settingInstance: { "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance", settingDefinitionId: ASR, simpleSettingValue: { value: s } } });

const cp = (id, name, settings) => ({ id, name, technologies: "mdm,microsoftSense", platforms: "windows10", description: "d", roleScopeTagIds: ["0", "7"],
  templateReference: { templateId: "tpl-1", templateFamily: "endpointSecurityAttackSurfaceReductionRules", templateDisplayName: "ASR" },
  assignments: [], __detail: settings });
function mapItem(raw) {
  return { id: raw.id, name: raw.name, templateFamily: raw.templateReference.templateFamily, type: "", assignments: [], rows: Docs.catalogRows(raw.__detail), detailError: null };
}
const resOf = (raw) => ({ sections: [{ id: "settingsCatalog", label: "sc", icon: "", endpoint: "/x", items: raw.map(mapItem), raw },
  { id: "intents", items: [], raw: [] }, { id: "deviceConfigurations", items: [], raw: [] }, { id: "admx", items: [], raw: [] }], failed: [], readAt: 1 });

const NEW_OBF = cp("n1", "WIN-SEC-AttackSurfaceReduction-D-02_Block execution of potentially obfuscated scripts-v1.0", [groupAsr([[OBF, "block"]])]);
const NEW_DRV = cp("n2", "WIN-SEC-AttackSurfaceReduction-D-16_Block abuse of exploited vulnerable signed drivers-v1.0", [choiceAsr([[DRV, "block"]])]);
const NEW_LSA = cp("n3", "WIN-SEC-AttackSurfaceReduction-D-04_Block credential stealing-v1.0", [groupAsr([[LSASS, "block"]])]);
const NEW_LEG = cp("n4", "WIN-SEC-AttackSurfaceReduction-D-99_Legacy string-v1.0", [legacyAsr("d4f940ab-401b-4efc-aadc-ad5f3c50688a=1")]);
const OLD = cp("o1", "PVM-DG-CORP-ENDSEC-WIN-ASR-PRD", [groupAsr([[OBF, "audit"], [DRV, "audit"]])]);
const AVD = cp("x1", "AVD-SEC-AttackSurfaceReduction-D-ASR-Rules(audit)-v1.0", [groupAsr([[OBF, "audit"]])]);
const raws = [NEW_OBF, NEW_DRV, NEW_LSA, NEW_LEG, OLD, AVD];
const before = JSON.stringify(raws);
const model = M.build(resOf(raws), {}, new Map());
const rows = A.matrix(model);

// ---- the matrix ----
ok("one row per documented rule at least", rows.length >= w.EndpointSec.ASR_RULES.length);
ok("only new-set policies are listed — never the old one or AVD", rows.every((r) => !r.P || /^WIN-SEC/.test(r.P.name)) && !rows.some((r) => r.P && /^(o1|x1)$/.test(r.P.id)));
ok("the one-rule WIN-SEC policies ⚙️ Leave out holds by default are in the new set here", model.byKey.get("settingsCatalog|n1").generation === "out" && A.inNewSet(model.byKey.get("settingsCatalog|n1"), model.cfg));
ok("…and marked as left out of the comparison", rows.find((r) => r.P && r.P.id === "n1").leftOut === true && rows.find((r) => r.P && r.P.id === "n4").leftOut === false);
ok("an AVD name never qualifies, left out or not", !A.inNewSet(model.byKey.get("settingsCatalog|x1"), model.cfg));
const obf = rows.find((r) => r.P && r.P.id === "n1" && r.slug === OBF);
ok("the obfuscated-scripts row reads Block from the group-collection shape", obf && obf.now === "block" && obf.editable);
const drv = rows.find((r) => r.P && r.P.id === "n2" && r.slug === DRV);
ok("the drivers row reads Block from the choice-parent shape", drv && drv.now === "block" && drv.editable);
ok("the baseline is T15's: drivers expected audit", drv.baseline === "audit" && A.baselineOf(DRV) === w.Defender.MDE_BASELINE.asr.find((x) => x[1] === DRV)[3]);
ok("verdict: block against audit differs, audit matches", A.verdict("block", "audit") === "differs" && A.verdict("audit", "audit") === "match" && A.verdict(null, "audit") === "none");
const web = rows.find((r) => r.slug === "blockwebshellcreationforservers");
ok("a rule no new policy carries is one row, P null, not editable", web && !web.P && !web.editable && /never created/.test(web.why));
const leg = rows.find((r) => r.P && r.P.id === "n4");
ok("the legacy guid=mode string is listed but not editable", leg && leg.now === "block" && !leg.editable && /legacy/.test(leg.why));

// ---- modes ----
ok("Warn is offered for the drivers rule", A.modesFor(DRV).includes("warn"));
ok("Warn is NOT offered for LSASS or Office code injection (Learn)", !A.modesFor(LSASS).includes("warn") && !A.modesFor("blockofficeapplicationsfrominjectingcodeintootherprocesses").includes("warn") && A.modesFor(LSASS).length === 3);

// ---- the plan ----
const edits = new Map([[obf.key, "audit"], [drv.key, "block"], [rows.find((r) => r.P && r.P.id === "n3").key, "warn"], [leg.key, "audit"], [web.key, "audit"]]);
const plan = A.planOf(rows, edits);
ok("only real, allowed changes on editable rows: one policy, obf block → audit", plan.length === 1 && plan[0].P.id === "n1" && plan[0].changes.length === 1 && plan[0].changes[0].from === "block" && plan[0].changes[0].to === "audit");

// ---- the edit ----
for (const [raw, slug] of [[NEW_OBF, OBF], [NEW_DRV, DRV]]) {
  const out = A.withModes(raw.__detail, [{ slug, from: "block", to: "audit" }]);
  ok(`${slug}: the copy carries audit`, A.modeIn(out.settings, slug) === "audit" && !out.missing.length);
  ok(`${slug}: the read itself is untouched`, A.modeIn(raw.__detail, slug) === "block");
}
ok("a rule the policy does not carry is reported missing, nothing invented", A.withModes(NEW_OBF.__detail, [{ slug: DRV, from: "block", to: "audit" }]).missing[0] === DRV);
ok("nothing in the input read was mutated", JSON.stringify(raws) === before);

// ---- the PUT body ----
const edited = A.withModes(NEW_OBF.__detail, [{ slug: OBF, to: "audit" }]).settings;
const body = A.putBody({ id: "n1", name: NEW_OBF.name, description: "d", platforms: "windows10", technologies: "mdm,microsoftSense", roleScopeTagIds: ["0", "7"],
  templateReference: { templateId: "tpl-1", templateFamily: "x", templateDisplayName: "y" }, lastModifiedDateTime: "z", "@odata.context": "c" }, edited);
ok("the body carries the policy's own properties and scope tags", body.name === NEW_OBF.name && body.platforms === "windows10" && body.technologies === "mdm,microsoftSense" && body.roleScopeTagIds.join() === "0,7");
ok("the template reference is the id only", body.templateReference && body.templateReference.templateId === "tpl-1" && Object.keys(body.templateReference).length === 1);
ok("no read-only fields at the top", !("id" in body) && !("lastModifiedDateTime" in body) && !("@odata.context" in body));
ok("each setting is typed, without its id or the definitions expansion", body.settings.length === 1 && body.settings[0]["@odata.type"] === "#microsoft.graph.deviceManagementConfigurationSetting"
  && !("id" in body.settings[0]) && !("settingDefinitions" in body.settings[0]));
ok("the instance template reference is re-sent as read", body.settings[0].settingInstance.settingInstanceTemplateReference.settingInstanceTemplateId === "tpl-asr");
ok("…and the new mode is in it", A.modeIn(body.settings, OBF) === "audit");

// ---- read-back and undo ----
ok("verified: the read-back shows every change", A.verified(edited, [{ slug: OBF, to: "audit" }]) && !A.verified(NEW_OBF.__detail, [{ slug: OBF, to: "audit" }]));
const rev = A.reverse([{ id: "n1", key: "k", name: "n", changes: [{ slug: OBF, name: "o", from: "block", to: "audit" }] }]);
ok("the undo swaps each change", rev[0].changes[0].from === "audit" && rev[0].changes[0].to === "block" && rev[0].id === "n1");

console.log(`mderollout-asr: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

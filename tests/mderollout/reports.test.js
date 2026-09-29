// T28 — reports engine (build 10635). DOM-free: the group roles, the
// coverage matrix (which wave each policy includes or excludes, per region),
// the assignment CSV, the configuration report's sections, the conflict
// summary and what moved between two checks — and that every name in the
// HTML is escaped.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), { runScripts: "outside-only" });
const w = dom.window;
const files = ["js/version.js", "js/graph.js", "js/progress.js", "js/groupuse.js", "js/document.js", "js/overview.js",
  "js/conflict.js", "js/endpointsec.js", "js/filterrules.js", "js/endpointposture.js", "js/assignedit.js",
  "js/groupmigrate.js", "js/mdemembers.js", "js/mdereports.js", "js/mderollout.js"];
w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
  + "\n;Object.assign(window, {MdeRollout, MdeReports, MdeMembers, Docs});");
const M = w.MdeRollout, RP = w.MdeReports, Docs = w.Docs;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}

const G = (n) => `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`;
const inc = (g) => ({ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: g } });
const exc = (g) => ({ target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: g } });
const choice = (defId, value) => ({ settingInstance: { "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance", settingDefinitionId: defId, choiceSettingValue: { value, children: [] } } });
const RTP = "device_vendor_msft_policy_config_defender_allowrealtimemonitoring";
const CBL = "device_vendor_msft_policy_config_defender_cloudblocklevel";
const names = new Map([[G(1), "PVM-DG-CORP-ALL-WIN"], [G(21), "INT-SG-D-WAVE-Euro"], [G(20), "INT-SG-U-WAVE-Euro"], [G(40), "PVM-DG-MDE-Exclusion"]]);
function mapItem(raw) {
  const assignments = (raw.assignments || []).map((a) => { const m = Docs.assignmentOf(a); if (m.groupId) { m.name = names.get(m.groupId) || m.groupId; m.memberCount = 7; } return m; });
  return { id: raw.id, name: raw.name, templateFamily: (raw.templateReference || {}).templateFamily || "", type: "", assignments, rows: Docs.catalogRows(raw.__detail), detailError: null };
}
const cp = (id, name, settings, assignments) => ({ id, name, technologies: "mdm", templateReference: { templateFamily: "endpointSecurityAntivirus" }, assignments, __detail: settings });
const raws = [
  cp("n1", "Win - OIB - ES - Defender Antivirus - D - AV <b>x</b> - v3.3", [choice(RTP, `${RTP}_1`), choice(CBL, `${CBL}_4`)], [inc(G(21)), exc(G(40))]),
  cp("n2", "Win - OIB - ES - Defender Antivirus - D - Unassigned - v1", [choice(CBL, `${CBL}_4`)], []),
  cp("o1", "PVM-DG-CORP-ENDSEC-WIN-AV-PRD", [choice(RTP, `${RTP}_1`), choice(CBL, `${CBL}_2`)], [inc(G(1)), exc(G(21))]),
];
const res = { sections: [
  { id: "settingsCatalog", label: "s", icon: "", endpoint: "/x", items: raws.map(mapItem), raw: raws },
  { id: "intents", items: [], raw: [] }, { id: "deviceConfigurations", items: [], raw: [] }, { id: "admx", items: [], raw: [] },
], failed: [], readAt: Date.UTC(2026, 8, 29, 10) };

async function run() {
  const model = M.build(res, {}, new Map());
  const found = new Map([["int-sg-d-wave-euro", { id: G(21), displayName: "INT-SG-D-WAVE-Euro" }], ["int-sg-u-wave-euro", { id: G(20), displayName: "INT-SG-U-WAVE-Euro" }], ["pvm-dg-mde-exclusion", { id: G(40), displayName: "PVM-DG-MDE-Exclusion" }]]);
  const twins = M.twinIndex(model.cfg, found);
  const pairs = M.compare(model, twins);
  pairs.forEach((p) => { p.proposal = M.proposalFor(p, { kinds: new Map(), twins, waves: M.wavePool(model.cfg, found), names }); });
  const waveRows = M.waves(model, found, new Map(), pairs);
  const ctx = { cfg: model.cfg, waveRows, kinds: new Map([[G(1), { kind: "device" }]]), labels: new Map(), mem: null, retire: M.retirement(model), runs: [],
    labelName: M.labelName, labelValue: M.labelValue, catMeta: M.catMeta, RETIRE: M.RETIRE };

  // ------------------------------------------------------------ roles --
  const idx = RP.roleIndex(ctx);
  ok("a wave and an exclusion group each carry their role", idx.get(G(21)).role === "wave" && idx.get(G(21)).region === "Euro" && idx.get(G(21)).audience === "device" && idx.get(G(40)).role === "exclusion");
  const memRows = { rows: [{ ug: { id: G(30) }, dg: { id: G(35) }, country: "Netherlands", region: "Euro", pilot: false }, { ug: { id: G(34) }, dg: null, country: "NL Breda", region: "Euro", pilot: true }] };
  const idx2 = RP.roleIndex(Object.assign({}, ctx, { mem: memRows }));
  ok("country user groups and device groups too, a pilot said", /Netherlands — Euro/.test(idx2.get(G(30)).label) && idx2.get(G(35)).role === "devicegroup" && /pilot/.test(idx2.get(G(34)).label));

  // --------------------------------------------------------- coverage --
  const cov = RP.coverage(model, ctx);
  const row = (id) => cov.rows.find((x) => x.P.id === id);
  const e = cov.regions.indexOf("Euro");
  ok("coverage: one column per region", cov.regions.join("|") === "Euro|Americas|Asia-Pacific|Italy|BAMSCA");
  ok("the new AV policy includes the Euro device wave and excludes the device exclusion group", row("n1").cells[e].inc.join() === "device" && row("n1").exclusion.join() === "device");
  ok("the old AV policy excludes the Euro device wave", row("o1").cells[e].exc.join() === "device" && !row("o1").cells[e].inc.length);
  ok("an unassigned policy says so", row("n2").assigned === false);

  // ------------------------------------------------------ assignments --
  const csv = RP.assignmentsCsv(model, ctx);
  const lines = csv.split("\r\n");
  ok("the CSV: a header, a line per assignment, 'not assigned' for none", lines[0].startsWith("Policy,Generation,For,Type") && lines.some((l) => /Unassigned.*not assigned/.test(l)) && lines.filter((l) => /AV-PRD/.test(l)).length === 2);
  ok("…with kind, member count and role", lines.some((l) => /PVM-DG-CORP-ALL-WIN,device,7,,/.test(l)) && lines.some((l) => /🌊 Euro device wave/.test(l)));
  const html = RP.assignmentsHtml(model, ctx, { tenant: "Contoso <Ltd>", readAt: res.readAt, build: "v1" });
  ok("the HTML page is whole and escapes every name", html.startsWith("<!doctype html>") && html.includes("AV &lt;b&gt;x&lt;/b&gt;") && !html.includes("<b>x</b>") && html.includes("Contoso &lt;Ltd&gt;"));
  ok("…and names a new policy in no wave", /New policies in no wave/.test(html) && /Unassigned - v1/.test(html));

  // ---------------------------------------------------- configuration --
  const conf = RP.configHtml(model, ctx, { tenant: "Contoso" });
  ok("the configuration report has its seven sections", ["1 · Rules", "2 · Wave and exclusion groups", "3 · Wave members", "4 · New policies", "5 · Old policies", "6 · Out of scope", "7 · Changes this session"].every((h) => conf.includes(h)));
  ok("…says when the wave members were not read", /were not read/.test(conf));
  ok("…lists the new policy's settings with their values", /Cloud ?block ?level|cloudblocklevel/i.test(conf) && /Also in the target list/.test(conf));
  const conf2 = RP.configHtml(model, Object.assign({}, ctx, { owners: new Map([[G(21), ["alex@contoso.com"]]]) }), {});
  ok("…and a wave group's owners", /alex@contoso\.com/.test(conf2));
  const ccsv = RP.configCsv(model, ctx);
  ok("the configuration CSV has a line per setting", ccsv.split("\r\n")[0] === "Policy,Generation,Type,Setting,Value,Category,Setting id" && ccsv.split("\r\n").length >= 6);

  // -------------------------------------------------------- conflicts --
  const s1 = RP.conflictSummary(pairs, M.needsAction);
  ok("the summary counts collisions", s1.total === pairs.length && typeof s1.act === "number");
  ok("first check: no diff", RP.conflictDiff(null, s1) === null);
  const s0 = { ids: ["x~gone", ...s1.ids.slice(1)], at: 5 };
  const d = RP.conflictDiff(s0, Object.assign({}, s1, { ids: s1.ids }));
  ok("a diff: what no longer needs action, and what is new", d.fixed.join() === "x~gone" && d.added.length === (s1.ids.length ? 1 : 0) && d.at === 5);
  const ch = RP.conflictsHtml(pairs, { labels: new Map(), labelName: M.labelName, labelValue: M.labelValue, VERDICT: M.VERDICT, TYPE: M.TYPE, needsAction: M.needsAction, summary: s1, diff: d }, {});
  ok("the conflicts page carries the tiles and the diff", /need action/.test(ch) && /no longer need action/.test(ch));
  const none = RP.conflictsHtml([], { needsAction: M.needsAction, summary: RP.conflictSummary([], M.needsAction), diff: null }, {});
  ok("nothing to act on is said plainly", /Nothing needs action/.test(none) && /First check/.test(none));
}

run().then(() => {
  console.log(`mderollout-reports: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), { runScripts: "outside-only" });
const w = dom.window;
const files = ["js/version.js", "js/graph.js", "js/progress.js", "js/document.js", "js/overview.js",
  "js/endpointsec.js", "js/filterrules.js", "js/endpointposture.js"];
w.eval(files.map((f) => fs.readFileSync(f.endsWith("endpointposture.js") && process.env.T20_SOURCE
  ? process.env.T20_SOURCE : path.join(ROOT, f), "utf8")).join("\n;\n")
  + "\n;Object.assign(window, {EndpointPosture, EndpointPostureTool, Docs, Graph});");
const EP = w.EndpointPosture;
// An unfinished asynchronous export must not let Node exit as a passing suite.
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name); }
}
const row = (defId, value) => ({ defId, value, name: defId });
const wide = [{ kind: "All devices" }];
const group = [{ kind: "Included", groupId: "a" }];
const policy = (rows, assignments = wide, extra = {}) => ({
  id: "p1", name: "Example policy", templateFamily: "endpointSecurityAntivirus",
  rows, assignments, ...extra,
});
const impacts = (p) => EP.analyzeImpact(Array.isArray(p) ? p : [p]);
const hasRule = (p, id) => impacts(p).some((i) => i.rule === id);
const rt = row("device_vendor_msft_policy_config_defender_allowrealtimemonitoring", "1");
const asr = "device_vendor_msft_policy_config_defender_attacksurfacereductionrules";
const brief = (p, opts = {}) => EP.briefMd(impacts(p), { deviceCount: 100, counts: { a: 20 }, ...opts });

async function run() {
  ok("ASR collection enabled is not a blocking rule", !hasRule(policy([row(asr, "1")]), "asrblock"));
  ok("ASR exclusion text is not a blocking rule", !hasRule(policy([row(asr + "_blockofficeapps_perruleexclusions", "1")]), "asrblock"));
  ok("a blocking ASR leaf is detected", hasRule(policy([row(asr + "_blockofficeapps", "1")]), "asrblock"));
  ok("an audit ASR leaf does not claim blocking", !hasRule(policy([row(asr + "_blockofficeapps", "2")]), "asrblock"));
  ok("numeric warn mode is detected", hasRule(policy([row(asr + "_blockofficeapps", "6")]), "asrwarn"));
  ok("one ASR rule does not promise USB restrictions or unaffected macros",
    !/USB|keep working/.test(brief(policy([row(asr + "_blockofficeapps", "1")]))));
  ok("disabled Hello does not generate a Hello statement",
    !hasRule(policy([row("device_vendor_msft_passportforwork_tenant_usepassportforwork", "0")], wide,
      { templateFamily: "endpointSecurityAccountProtection" }), "acct"));
  ok("account protection family alone is not Hello",
    !hasRule(policy([], wide, { templateFamily: "endpointSecurityAccountProtection" }), "acct"));
  ok("enabled Hello setting generates statement",
    hasRule(policy([row("device_vendor_msft_passportforwork_tenant_usepassportforwork", "true")]), "acct"));
  ok("EDR family with offboarding does not promise reporting",
    !hasRule(policy([row("device_vendor_msft_windowsadvancedthreatprotection_offboarding", "blob")], wide,
      { templateFamily: "endpointSecurityEndpointDetectionAndResponse" }), "edr"));
  ok("onboarding setting generates expected effect",
    hasRule(policy([row("device_vendor_msft_windowsadvancedthreatprotection_onboarding", "[redacted]")]), "edr"));
  ok("unreadable policy never generates a positive statement",
    impacts(policy([rt], wide, { detailError: "403" })).length === 0);
  const sites = policy([row("device_microsoft_edge_preventsmartscreenpromptoverride", "1")]);
  const downloads = policy([row("device_microsoft_edge_preventsmartscreenpromptoverrideforfiles", "1")]);
  ok("site override does not claim download override", hasRule(sites, "edgeoverride") && !hasRule(sites, "edgefileoverride"));
  ok("download override does not claim site override", !hasRule(downloads, "edgeoverride") && hasRule(downloads, "edgefileoverride"));
  const pw = brief(policy([row("device_microsoft_edge_passwordmanagerenabled", 0)]));
  ok("numeric zero is preserved", pw.includes("Edge stops offering to save passwords"));
  ok("saved passwords remain usable", pw.includes("Previously saved passwords can still be used") && !pw.includes("stop filling"));
  const bde = brief(policy([row("device_vendor_msft_bitlocker_requiredeviceencryption", "1")]));
  ok("encryption requirement does not guarantee silence or escrow", !/encrypt silently|stored centrally|no slowdown/.test(bde));
  const app = brief(policy([row("device_vendor_msft_policy_config_applicationcontrolv2_xmlupload", "AllowAll")], wide,
    { templateFamily: "endpointSecurityApplicationControl" }));
  ok("App Control mode alone does not promise an allowlist", !/Only approved software runs|arbitrary downloaded software/.test(app));
  const audit = brief(policy([{ ...row("appcontrol", "audit"), audit: true }], wide,
    { templateFamily: "endpointSecurityApplicationControl" }));
  ok("audit does not guarantee everything runs", !/everything still runs|Nothing changes for you today/.test(audit));

  const r = (ps, counts = { a: 80, b: 80 }, n = 100, opts) => EP.deviceReach(ps, counts, n, opts);
  let reach = r([policy([rt], [...group, { kind: "Included", groupId: "b" }])]);
  ok("overlapping group totals never become device counts", reach.reached === null && reach.memberTotal === 160);
  ok("unknown group coverage says why", EP.reachLine(reach, 100).includes("group overlap"));
  ok("group coverage never prints fleet percentage", !brief(policy([rt], group)).includes("% of the fleet"));
  reach = r([policy([rt], group)], { a: null });
  ok("unreadable group is unknown", reach.reached === null && reach.unknownGroups === 1);
  reach = r([policy([rt])]);
  ok("unfiltered All devices gives assignment count", reach.reached === 100 && reach.exact);
  ok("assignment count is not device application evidence", EP.enforcedLine(reach, 100).includes("not verified device application"));
  reach = r([policy([rt], [...wide, { kind: "Excluded", groupId: "b" }])]);
  ok("unread exclusions cannot claim all devices", reach.reached === null && !reach.exact);
  reach = r([policy([rt], [{ kind: "All users" }])]);
  ok("All users does not mean all Windows devices", reach.reached === null);
  reach = r([policy([rt], [...wide, { kind: "Excluded", groupId: "b" }]), policy([rt], wide, { id: "p2" })]);
  ok("separate unrestricted policy can establish full assignment", reach.reached === 100 && reach.exact);
  const filter = { kind: "All devices", filterId: "f1", filterName: "Pilot", filterType: "include",
    filterRule: '(device.deviceName -startsWith "pilot")' };
  const devices = [{ id: "1", deviceName: "pilot-1" }, { id: "2", deviceName: "other" }];
  reach = r([policy([rt], [filter])], {}, 2, { devices });
  ok("evaluated All devices filter counts its subset", reach.reached === 1 && reach.exact);
  reach = r([policy([rt], [filter, ...group])], { a: 1 }, 2, { devices });
  ok("filtered set plus unknown group is a floor", reach.reached === 1 && reach.atLeast && !reach.exact);
  reach = r([policy([rt], [filter])], {}, 3, { devices });
  ok("incomplete inventory refuses a filter count", reach.reached === null);
  reach = r([policy([rt], [{ ...filter, filterRule: "unsupported" }, ...wide])]);
  ok("an unfiltered wide target dominates an unreadable filter in either order", reach.reached === 100 && reach.exact);
  reach = r([policy([rt])], {}, null);
  ok("unread inventory stays unknown", reach.reached === null);
  ok("missing matched policies do not prove missing device protection",
    EP.reachLine(r([]), 100).includes("does not prove the control is absent"));

  let text = brief(policy([rt], []));
  ok("unassigned policy has no invented fleet destination", text.includes("destination unconfirmed") && !/fleet total is the intention|all 100/.test(text));
  text = brief(policy([rt], [{ kind: "Excluded", groupId: "a" }]));
  ok("excluded-only is distinguished from no assignment", text.includes("exclusions but no included target"));
  const interim = policy([rt], group, { name: "(TO-BE-REMOVED) pilot" });
  text = brief(interim);
  ok("retirement without replacement reports risk rather than no change",
    text.includes("protection may be lost") && !text.includes("NO CHANGE"));
  text = brief([interim, policy([rt], [], { id: "p2", name: "Replacement" })]);
  ok("staged replacement is conditional", text.includes("before retiring the interim policy") && !text.includes("replacement takes over"));
  ok("retired interim is omitted", impacts(policy([rt], [], { name: "(TO-BE-REMOVED) retired" })).length === 0);

  const unread = policy([], [], { id: "u1", name: "Unread <policy>", detailError: "403" });
  const warnings = EP.readWarnings({ sec: { items: [unread] }, partial: [{}], filterError: "403", deviceCountError: "403" });
  ok("read failures produce named warnings", warnings.length === 4 && warnings[0].includes("Unread <policy>"));
  const options = { tenantName: "Example & Co", deviceCount: 100, counts: { a: 20 },
    readAt: Date.parse("2026-09-16T09:00:00Z"), warnings };
  const sample = impacts([policy([rt], group), policy([row("device_microsoft_edge_passwordmanagerenabled", "0")], [])]);
  const md = EP.briefMd(sample, options);
  ok("Markdown carries warning and read time", md.includes(warnings[0]) && md.includes("2026-09-16T09:00:00.000Z"));
  ok("scope and privacy are explicit", md.includes("Legacy intent settings") && md.includes("file samples")
    && !md.includes("none of this reads"));
  ok("current and future restrictions remain conditional", md.includes("only after rollout is confirmed"));
  ok("empty brief does not assert a clean estate", EP.briefMd([], options).includes("No supported user-impact statements"));

  // Use the shipped ZIP implementation and parse the actual OOXML.
  w.JSZip = require(path.join(ROOT, "vendor/jszip.min.js"));
  const zip = EP.briefDocx(sample, options);
  const xml = await zip.file("word/document.xml").async("string");
  const parsed = new w.DOMParser().parseFromString(xml, "application/xml");
  ok("Word XML is well formed", parsed.getElementsByTagName("parsererror").length === 0);
  const word = Array.from(parsed.getElementsByTagName("w:t")).map((n) => n.textContent).join("\n");
  ok("Word carries the same warnings and read time", word.includes(warnings[0]) && word.includes("2026-09-16T09:00:00.000Z"));
  ok("Word preserves tenant punctuation", word.includes("Example & Co"));
  for (const item of sample) {
    ok("both exports carry expected effect for " + item.rule, md.includes(item.text) && word.includes(item.text));
    const rollout = EP.rolloutLine(item, options.counts, options.deviceCount);
    if (rollout) ok("both exports carry rollout for " + item.rule, md.includes(rollout) && word.includes(rollout));
  }

  const tool = w.EndpointPostureTool;
  tool.init();
  const docs = [policy([rt], group), unread];
  const state = { docs, sec: { items: docs }, byNode: {}, intents: [], checks: [], impact: impacts(docs),
    groupCounts: { a: 20 }, groupCountErrors: 0, deviceCount: 100, devices: null,
    when: options.readAt, partial: [], filterError: null };
  EP.NODES.forEach((n) => { state.byNode[n.id] = []; });
  tool._setForTest(state);
  w.document.querySelector('[data-epnode="impact"]').click();
  const pane = w.document.querySelector("#screen-posture #epBody").textContent;
  ok("pane uses assigned wording and unknown group coverage", pane.includes("Currently assigned policies") && pane.includes("device coverage unknown"));
  ok("pane preserves incomplete-read warning", pane.includes("Unread <policy>"));
  const opts = tool._briefOpts();
  ok("all export actions use the read context", opts.readAt === options.readAt && opts.warnings[0].includes("Unread <policy>"));
  if (process.env.T20_SAMPLE_DIR) {
    fs.mkdirSync(process.env.T20_SAMPLE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.T20_SAMPLE_DIR, "T20-example-brief.md"), md);
    const bytes = await zip.generateAsync({ type: "uint8array" });
    fs.writeFileSync(path.join(process.env.T20_SAMPLE_DIR, "T20-example-brief.docx"), Buffer.from(bytes));
  }
  console.log("endpointposture-brief: " + passed + " passed, " + failed + " failed");
  w.close();
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); w.close(); process.exitCode = 1; });

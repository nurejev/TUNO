// T28 — ⚡④ the W365/AVD filter on the wave includes (build 10706, Mihai:
// "i need a option to exclude PVM-DG-CORP-FILTER-W365/AVD from all the
// groups. so first a check then the option to add the exclusion filter";
// picks: device AND user waves, one filter by that exact name, in ⚡ Rollout
// actions now). DOM-free: the default name, the check's states, the plan's
// wants (none → set, set → in place, other → reported never overwritten,
// excluded waves not touched), the filter refusals, and T11's set-filter
// op — the exact target Graph receives, everything else re-sent as read.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), { runScripts: "outside-only" });
const w = dom.window;
const files = ["js/version.js", "js/graph.js", "js/progress.js", "js/groupuse.js", "js/document.js", "js/overview.js",
  "js/conflict.js", "js/endpointsec.js", "js/filterrules.js", "js/endpointposture.js", "js/assignedit.js",
  "js/groupmigrate.js", "js/mdemembers.js", "js/mdereports.js", "js/mdeexclude.js", "js/mderollout.js"];
w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
  + "\n;Object.assign(window, {MdeRollout, AssignEdit, Docs, Conflict});");
const M = w.MdeRollout, AE = w.AssignEdit;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const lc = (s) => String(s || "").toLowerCase();

// config
const cfg = M.normConfig({ waveRegions: ["Euro", "Italy"] });
ok("the default filter name is Mihai's", cfg.waveFilterName === "PVM-DG-CORP-FILTER-W365/AVD");
ok("a saved name is kept, blank falls back", M.normConfig({ waveFilterName: " X-F " }).waveFilterName === "X-F" && M.normConfig({ waveFilterName: "" }).waveFilterName === "PVM-DG-CORP-FILTER-W365/AVD");
ok("ROLLOUT names the step", /W365\/AVD/.test(M.ROLLOUT.filterWaves.label));

const found = new Map(cfg.groups.map((g, i) => [lc(g.name), { id: `w${i}`, displayName: g.name }]));
const id = (name) => found.get(lc(name)).id;
const DE = id("INT-SG-D-WAVE-Euro"), UE = id("INT-SG-U-WAVE-Euro"), DI = id("INT-SG-D-WAVE-Italy"), UI = id("INT-SG-U-WAVE-Italy");
const F = { id: "F1", displayName: "PVM-DG-CORP-FILTER-W365/AVD", platform: "windows10AndLater", assignmentFilterManagementType: "devices" };
const inc = (g, f, mode) => ({ target: Object.assign({ "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: g }, f ? { deviceAndAppManagementAssignmentFilterId: f, deviceAndAppManagementAssignmentFilterType: mode || "exclude" } : {}) });
const exc = (g) => ({ target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: g } });
const pol = (name, list, extra) => {
  const item = { assignments: list.map((a) => w.Docs.assignmentOf(a)) };
  return Object.assign({ key: name, id: name, name, surface: "settingsCatalog", surfaceLabel: "Settings catalog", generation: "new", audience: /- U -/.test(name) ? "user" : "device",
    item, raw: { assignments: list, platforms: "windows10" }, reach: w.Conflict.reachOf(item), mdeManaged: false }, extra || {});
};
const Pd = pol("Win - OIB - ES - AV - D - Settings", [inc(DE), inc(DI, "F1", "exclude"), inc("gpilot")]);
const Pu = pol("Win - OIB - SC - Edge - U - Extensions", [inc(UE), inc(UI, "F9", "include")]);
const Pmde = pol("Win - OIB - ES - FW - D - Rules", [inc(DE)], { mdeManaged: true });
const Pold = Object.assign(pol("Old AV", [{ target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } }, exc(DE)]), { generation: "old" });
const PexOnly = pol("Win - OIB - ES - ASR - D - Rules", [exc(DE)]);
const model = { cfg, newP: [Pd, Pu, Pmde, PexOnly], oldP: [Pold], policies: [Pd, Pu, Pmde, PexOnly, Pold] };
const ctx = (o) => Object.assign({ kinds: new Map(), found, twins: new Map(), names: new Map(), pairs: [], regions: null, filter: F }, o || {});

// the check
const chk = M.waveFilterCheck(model, ctx());
const st = (P, g) => (chk.rows.find((r) => r.P === P && r.groupId === g) || {}).state;
ok("device and user waves both checked", st(Pd, DE) === "none" && st(Pu, UE) === "none");
ok("the filter in Exclude mode is in place", st(Pd, DI) === "set");
ok("another filter (or Include mode) is 'other'", st(Pu, UI) === "other");
ok("a non-wave include is not a row", !chk.rows.some((r) => r.groupId === "gpilot"));
ok("an excluded wave is not a row; an old policy is not checked", !chk.rows.some((r) => r.P === PexOnly || r.P === Pold));
ok("counts", chk.counts.set === 1 && chk.counts.none === 3 && chk.counts.other === 1 && chk.counts.policies === 3, JSON.stringify(chk.counts));
ok("regions narrow the check", M.waveFilterCheck(model, ctx({ regions: new Set(["Italy"]) })).rows.length === 2);

// the plan's wants
const r = M.rolloutWants("filterWaves", model, ctx());
const keys = r.wants.map((x) => `${x.P.name}|${x.groupName}|${x.action}`).sort();
ok("wants: the three wave includes with no filter, set-filter", keys.join(";") === ["Win - OIB - ES - AV - D - Settings|INT-SG-D-WAVE-Euro|set-filter", "Win - OIB - ES - FW - D - Rules|INT-SG-D-WAVE-Euro|set-filter", "Win - OIB - SC - Edge - U - Extensions|INT-SG-U-WAVE-Euro|set-filter"].join(";"), keys.join(";"));
ok("each want carries the filter in Exclude mode", r.wants.every((x) => x.filter && x.filter.id === "F1" && x.filter.mode === "exclude"));
ok("another filter is reported, not planned", r.skipped.some((s) => /Edge - U - Extensions · INT-SG-U-WAVE-Italy: another filter on the wave — one filter per assignment/.test(s)), r.skipped.join(" | "));
ok("an MDE-attached policy is flagged", r.wants.find((x) => x.P === Pmde).note.includes("Defender-only devices ignore assignment filters"));
ok("no filter found → nothing planned, said why", (() => { const x = M.rolloutWants("filterWaves", model, ctx({ filter: null })); return !x.wants.length && /not found in Intune's assignment filters/.test(x.skipped.join()); })());
ok("a non-Windows filter is refused", (() => { const x = M.rolloutWants("filterWaves", model, ctx({ filter: Object.assign({}, F, { platform: "iOS" }) })); return !x.wants.length && /Windows 10 and later/.test(x.skipped.join()); })());
ok("an app filter is refused", (() => { const x = M.rolloutWants("filterWaves", model, ctx({ filter: Object.assign({}, F, { assignmentFilterManagementType: "apps" }) })); return !x.wants.length && /managed-device filter/.test(x.skipped.join()); })());
ok("a non-Windows policy is left out", (() => {
  const Pmac = pol("Win - OIB - X - D - Mac", [inc(DE)]); Pmac.raw.platforms = "macOS";
  const x = M.rolloutWants("filterWaves", Object.assign({}, model, { newP: [Pmac] }), ctx()); return !x.wants.length && /platform macos/.test(x.skipped.join());
})());

// T11's set-filter op on the fresh list
AE.setFilterNames([{ id: "F1", displayName: "PVM-DG-CORP-FILTER-W365/AVD" }, { id: "F9", displayName: "Other" }]);
const base = { surface: "settingsCatalog", surfaceLabel: "Settings catalog", id: "p", name: "p" };
const run = (list, g, f) => AE.planFor([Object.assign({}, base, { assignments: list })], "set-filter", { id: g, displayName: g }, f === undefined ? { id: "F1", mode: "exclude" } : f).ops[0];
const o1 = run([inc("g1"), exc("g2"), inc("g3", "F9", "include")], "g1");
ok("none → modify: the filter on that include only", o1.change === "modify"
  && JSON.stringify(o1.after.find((a) => a.target.groupId === "g1").target) === JSON.stringify({ "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g1", deviceAndAppManagementAssignmentFilterId: "F1", deviceAndAppManagementAssignmentFilterType: "exclude" }), JSON.stringify(o1.after));
ok("everything else re-sent exactly as read (the other filter too)", o1.after.length === 3
  && o1.after.find((a) => a.target.groupId === "g3").target.deviceAndAppManagementAssignmentFilterId === "F9"
  && /exclusion/i.test(o1.after.find((a) => a.target.groupId === "g2").target["@odata.type"]));
ok("already set → noop", run([inc("g1", "F1", "exclude")], "g1").change === "noop");
const o3 = run([inc("g1", "F9", "include")], "g1");
ok("another filter → refused, both named", o3.change === "refused" && /Other/.test(o3.reason) && /PVM-DG-CORP-FILTER-W365\/AVD/.test(o3.reason) && /REPLACE/.test(o3.reason), o3.reason);
ok("an exclusion → refused (no filter on an exclusion)", /no filter on an exclusion/.test(run([exc("g1")], "g1").reason) && run([exc("g1")], "g1").change === "refused");
ok("not assigned → noop", run([inc("g2")], "g1").change === "noop");
ok("no filter given → refused", run([inc("g1")], "g1", null).change === "refused");
ok("tenant-wide → refused", AE.planFor([Object.assign({}, base, { assignments: [] })], "set-filter", { tenantWide: "allDevices", displayName: "All devices" }, { id: "F1", mode: "exclude" }).ops[0].change === "refused");

// composed: the plan T28 applies, never a removal
const p = M.composePlan([{ policy: Object.assign({}, base, { assignments: [inc("g1"), inc("g2")] }), action: "set-filter", group: { id: "g1", displayName: "g1" }, filter: { id: "F1", mode: "exclude" } },
  { policy: Object.assign({}, base, { assignments: [inc("g1"), inc("g2")] }), action: "set-filter", group: { id: "g2", displayName: "g2" }, filter: { id: "F1", mode: "exclude" } }]);
ok("composed: one op per policy, both includes filtered, not a removal (no typed REMOVE)", p.ops.length === 1 && p.changes.length === 1 && !p.hasRemoval
  && p.changes[0].after.every((a) => a.target.deviceAndAppManagementAssignmentFilterType === "exclude"));
const u = M.undoPlan([{ surface: "settingsCatalog", id: "p", assignments: [inc("g1"), inc("g2")] }], new Map([["settingsCatalog|p", Object.assign({}, base, { assignments: p.changes[0].after })]]));
ok("undo puts the includes back without the filter", u.changes.length === 1 && u.changes[0].after.every((a) => !a.target.deviceAndAppManagementAssignmentFilterId));

console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

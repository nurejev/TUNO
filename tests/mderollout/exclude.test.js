// T28 — ⊘ exclusions engine (build 10639). DOM-free, Graph stubbed: the
// "excluded now" rows (half-excluded users, devices with no excluded
// user), the search (Graph's users and devices plus the Intune list
// matched here), the lookup (the user's devices, their Entra objects and
// groups), the default ticks, what reaches an object before and after —
// the device that would fall between the sets, and the one kept on the old
// set — the plans, the base patched by a run; and MdeMembers holding an
// excluded device out of its country device group. Also the ⚙️ "Leave out"
// list (10639).
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
  + "\n;Object.assign(window, {MdeRollout, MdeMembers, MdeExclude, Graph, Docs});");
const X = w.MdeExclude, MM = w.MdeMembers, M = w.MdeRollout, Docs = w.Docs;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const NOW = Date.UTC(2026, 8, 30, 12);
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const G = (n) => `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = (n) => `22222222-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = (n) => `33333333-0000-4000-8000-${String(n).padStart(12, "0")}`;   // Entra device id
const O = (n) => `44444444-0000-4000-8000-${String(n).padStart(12, "0")}`;   // Entra object id

// Jan (U1): two Windows laptops, one stale. Nina (U2) is excluded, her
// recent laptop is not — half. A kiosk (no primary user) is excluded.
const managed = [
  { id: "m1", deviceName: "LT-NL-0412", userId: U(1), userPrincipalName: "jan.devries@contoso.com", azureADDeviceId: A(1), lastSyncDateTime: ago(0.1), osVersion: "10.0.26100" },
  { id: "m2", deviceName: "LT-NL-0388", userId: U(1), userPrincipalName: "jan.devries@contoso.com", azureADDeviceId: A(2), lastSyncDateTime: ago(41), osVersion: "10.0.22631" },
  { id: "m3", deviceName: "WS-ENG-0308", userId: U(2), userPrincipalName: "nina@contoso.com", azureADDeviceId: A(3), lastSyncDateTime: ago(1), osVersion: "10.0.26100" },
  { id: "m4", deviceName: "KIOSK-NL-01", userId: "", userPrincipalName: "", azureADDeviceId: A(4), lastSyncDateTime: ago(2), osVersion: "10.0.19045" },
  { id: "m5", deviceName: "LT-JDV-TEST", userId: U(1), userPrincipalName: "jan.devries@contoso.com", azureADDeviceId: "", lastSyncDateTime: ago(9), osVersion: "" },
];
const groups = { user: { id: G(90), displayName: "INT-SG-U-MDE-Exclusion" }, device: { id: G(91), displayName: "INT-SG-D-MDE-Exclusion" } };
const base = () => ({ managed: managed.map((m) => Object.assign({}, m)), users: [{ id: U(2), displayName: "Nina Nieuw", userPrincipalName: "nina@contoso.com" }],
  devices: [{ id: O(4), deviceId: A(4), displayName: "KIOSK-NL-01" }], groups, readAt: NOW });

// A model: a new AV policy on the Euro device wave, excluding the device
// exclusion group; a new - U - policy on the Euro user wave; an old AV
// policy on all corporate Windows devices, excluding the Euro device wave
// (⚔️ ③); an old - U - policy on All users, excluding the user wave.
const inc = (g) => ({ kind: "Included", groupId: g, name: g });
const exc = (g) => ({ kind: "Excluded", groupId: g, name: g });
const pol = (key, name, gen, assignments) => ({ key, name, generation: gen, item: { assignments } });
const model = {
  newP: [pol("n1", "Win - OIB - ES - Defender Antivirus - D - AV - v3.3", "new", [inc(G(21)), exc(G(91))]),
         pol("n2", "Win - OIB - SC - Edge - U - Security - v3.7", "new", [inc(G(20)), exc(G(90))])],
  oldP: [pol("o1", "PVM-DG-CORP-ENDSEC-WIN-AV-PRD", "old", [inc(G(1)), exc(G(21))]),
         pol("o2", "PVM-UG-CORP-EDGE-PRD", "old", [{ kind: "All users", groupId: null, name: "All users" }, exc(G(20))])],
};
const ctx = (ticks, keepOld) => ({ groups, ticks, keepOld, exUserId: G(90), exDeviceId: G(91), deviceWaveIds: new Set([G(21)]), deviceGroupPrefix: "INT-SG-D-",
  skipIds: new Set([G(20), G(21), G(90), G(91)]) });

async function run() {
  // ------------------------------------------------------ excluded now --
  const n = X.excludedNow(base(), { now: NOW, staleDays: 30 });
  ok("the counts: one user, one device excluded", n.users === 1 && n.devices === 1);
  const nina = n.rows.find((r) => r.user && r.user.displayName === "Nina Nieuw");
  ok("Nina is half-excluded: her recent laptop is not in the device group", nina.state === "half" && nina.missing.map((d) => d.name).join() === "WS-ENG-0308" && n.half === 1);
  const kiosk = n.rows.find((r) => r.devices.some((d) => d.name === "KIOSK-NL-01"));
  ok("the kiosk is a device-only row, with no user", kiosk.state === "device" && kiosk.user === null && kiosk.devices[0].excluded);
  ok("half rows come first", n.rows[0].state === "half");

  // ----------------------------------------------------------- search --
  const calls = [];
  w.Graph.get = async (p, o) => {
    calls.push([p, o && o.headers]);
    if (p.startsWith("/users?")) return { value: [{ id: U(1), displayName: "Jan de Vries", userPrincipalName: "jan.devries@contoso.com", mail: "jan.devries@contoso.com" }] };
    if (p.startsWith("/devices?")) return { value: [] };
    const d = /^\/devices\(deviceId='([^']+)'\)/.exec(p);
    if (d) { const id = decodeURIComponent(d[1]); if (id === A(2)) { const e = new Error("Resource not found"); e.status = 404; e.kind = "notfound"; throw e; } return { id: O(Number(id.slice(-2))), deviceId: id, displayName: "x" }; }
    throw new Error("unexpected " + p);
  };
  const s = await X.search('jan "de', base(), { now: NOW });
  const usersCall = calls.find((c) => c[0].startsWith("/users?"));
  const q = decodeURIComponent(usersCall[0]);
  ok("$search: displayName, UPN and mail clauses, the quote escaped, ConsistencyLevel eventual", /"displayName:jan \\"de" OR "userPrincipalName:jan \\"de" OR "mail:jan \\"de"/.test(q) && usersCall[1] && usersCall[1].ConsistencyLevel === "eventual");
  const s2 = await X.search("0412", base(), { now: NOW });
  const hit = s2.results.find((r) => r.type === "device" && r.name === "LT-NL-0412");
  ok("a device name part is matched in the Intune list when Graph's search finds nothing", !!hit && hit.primary === "jan.devries@contoso.com" && hit.managed);
  ok("one character is not a search", (await X.search("j", base())).results.length === 0);
  const s3 = await X.search("nina@", base(), { now: NOW });
  ok("a UPN part brings the primary user in from the Intune list", s3.results.some((r) => r.type === "user" && r.upn === "nina@contoso.com" && r.excluded));

  // ----------------------------------------------------------- lookup --
  w.Graph.readAll = async (p) => {
    if (p.startsWith(`/users/${encodeURIComponent(U(1))}/transitiveMemberOf`)) return [{ id: G(20), displayName: "INT-SG-U-WAVE-Euro" }, { id: G(22), displayName: "PVM-UG-CORP-MEM-USERS-NL" }];
    if (p.startsWith(`/devices/${encodeURIComponent(O(1))}/transitiveMemberOf`)) return [{ id: G(1), displayName: "PVM-DG-CORP-ALL-WIN" }, { id: G(35), displayName: "INT-SG-D-NLD" }, { id: G(21), displayName: "INT-SG-D-WAVE-Euro" }];
    if (p.startsWith(`/devices/${encodeURIComponent(O(1))}/memberOf`)) return [{ id: G(1), displayName: "PVM-DG-CORP-ALL-WIN" }, { id: G(35), displayName: "INT-SG-D-NLD" }];
    return [];
  };
  const card = await X.lookup(s.results.find((r) => r.type === "user"), base(), { now: NOW, staleDays: 30 });
  ok("a user comes with their Windows devices", card.user.displayName === "Jan de Vries" && card.devices.map((d) => d.name).sort().join() === "LT-JDV-TEST,LT-NL-0388,LT-NL-0412");
  const d412 = card.devices.find((d) => d.name === "LT-NL-0412"), d388 = card.devices.find((d) => d.name === "LT-NL-0388"), dTest = card.devices.find((d) => d.name === "LT-JDV-TEST");
  ok("each device's Entra object is read by its device id", d412.objId === O(1).toLowerCase());
  ok("a device with no Entra object, or no device id, says it cannot be a member", /no Entra device object/.test(d388.problem) && /not joined to Entra/.test(dTest.problem));
  ok("the user's and the device's groups are read (transitive, and the device's direct ones)", card.user.groups.has(G(20).toLowerCase()) && d412.groups.has(G(21).toLowerCase()) && d412.direct.map((g) => g.name).join() === "PVM-DG-CORP-ALL-WIN,INT-SG-D-NLD");
  const ticks = X.defaultTicks(card);
  ok("default ticks: the user and the recent device with an Entra object", ticks.has(`u:${U(1).toLowerCase()}`) && ticks.has(d412.key) && !ticks.has(d388.key) && ticks.size === 2);
  const dcard = await X.lookup(s2.results.find((r) => r.name === "LT-NL-0412"), base(), { now: NOW });
  ok("a device comes with its primary user (and that user's other devices); only the device is ticked", dcard.user && dcard.user.upn === "jan.devries@contoso.com" && dcard.devices.find((d) => d.searched).name === "LT-NL-0412"
    && X.defaultTicks(dcard).size === 1);

  // ------------------------------------------------------------ reach --
  const rows = X.assess(card, model, ctx(ticks, false));
  const ru = rows.find((r) => r.kind === "user"), rd = rows.find((r) => r.kind === "device" && r.obj.name === "LT-NL-0412");
  ok("before: the user gets the new - U - policy and is kept out of the old one", ru.before.new.length === 1 && ru.before.old.length === 0 && ru.before.keptOut.old.length === 1);
  ok("before: the laptop gets the new AV policy and is kept out of the old one by its wave", rd.before.new.length === 1 && rd.before.old.length === 0 && rd.before.keptOut.old[0].via.includes(G(21).toLowerCase()));
  ok("without 'keep on the old set' the laptop falls between the sets", rd.after.new.length === 0 && rd.after.old.length === 0 && rd.between);
  ok("…and so does the user — a dynamic group cannot be left", ru.between);
  const rows2 = X.assess(card, model, ctx(ticks, true));
  const rd2 = rows2.find((r) => r.kind === "device" && r.obj.name === "LT-NL-0412");
  ok("kept on the old set: out of INT-SG-D-NLD, out of the wave, the old AV policy reaches it again", rd2.after.new.length === 0 && rd2.after.old.length === 1 && !rd2.between && rd2.leaves.map((g) => g.name).join() === "INT-SG-D-NLD");
  ok("a country device group is a direct INT-SG-D- group — never a wave or a rollout group", X.countryGroupsOf({ direct: [{ id: G(21), name: "INT-SG-D-WAVE-Euro" }, { id: G(91), name: "INT-SG-D-MDE-Exclusion" }, { id: G(35), name: "INT-SG-D-NLD" }] }, ctx(ticks, true)).map((g) => g.name).join() === "INT-SG-D-NLD");
  const filt = X.reachOf({ newP: [pol("f", "x", "new", [Object.assign(inc(G(1)), { filterId: "f1" })])], oldP: [] }, new Set([G(1)]), "device");
  ok("a filtered include is said", filt.new[0].filtered === true);
  ok("All devices reaches a device, not a user", X.reachOf({ newP: [pol("a", "x", "new", [{ kind: "All devices" }])], oldP: [] }, new Set(), "device").new.length === 1
    && X.reachOf({ newP: [pol("a", "x", "new", [{ kind: "All devices" }])], oldP: [] }, new Set(), "user").new.length === 0);

  // ------------------------------------------------------------ plans --
  const p = X.planAdd(card, ctx(ticks, true));
  ok("the plan: the user into the user group, the laptop into the device group, then out of INT-SG-D-NLD", p.ops.length === 3
    && p.ops[0].type === "add" && p.ops[0].memberKind === "user" && p.ops[0].group.id === G(90).toLowerCase()
    && p.ops[1].type === "add" && p.ops[1].memberKind === "device" && p.ops[1].ids.join() === O(1).toLowerCase()
    && p.ops[2].type === "remove" && p.ops[2].group.name === "INT-SG-D-NLD" && /back on the old set/.test(p.ops[2].label));
  ok("…an addition, confirmed by a tick (no typed REMOVE)", p.hasRemoval === false && p.exclusions === true);
  const t2 = new Set(ticks); t2.add(d388.key);
  ok("a ticked device with no Entra object is left out with the reason", /no Entra device object/.test(X.planAdd(card, ctx(t2, true)).skipped.join()));
  ok("no keep-on-old-set: no removal step", X.planAdd(card, ctx(ticks, false)).ops.every((o) => o.type === "add"));
  const noGroups = X.planAdd(card, Object.assign(ctx(ticks, true), { groups: {} }));
  ok("a missing exclusion group is named, nothing planned", noGroups.ops.length === 0 && /create it in 🌊/.test(noGroups.skipped.join()));
  const rp = X.planRemove([nina, kiosk], groups);
  ok("taking rows out: the user and the excluded device, typed REMOVE", rp.hasRemoval && rp.ops.length === 2 && rp.ops.every((o) => o.fromExclusion) && rp.ops[0].memberKind === "user" && rp.ops[1].ids.join() === O(4).toLowerCase());

  // ------------------------------------------------- a run, and its undo --
  const b = base();
  X.patchBase(b, [{ type: "add", group: { id: G(91) }, ids: [O(1).toLowerCase()], memberKind: "device", objs: [{ id: O(1).toLowerCase(), deviceId: A(1).toLowerCase(), displayName: "LT-NL-0412" }] },
    { type: "remove", group: { id: G(90) }, ids: [U(2).toLowerCase()], memberKind: "user" }]);
  ok("the base moves with the run", b.devices.some((d) => d.displayName === "LT-NL-0412") && b.users.length === 0);
  const inv = MM.inverseOf([{ type: "add", key: "k", group: { id: G(90), name: "INT-SG-U-MDE-Exclusion" }, ids: [U(1)], memberKind: "user", who: "Jan" }]);
  ok("the undo of a user added is a user removed, from the same group", inv.ops[0].type === "remove" && inv.ops[0].memberKind === "user" && /1 user this run added/.test(inv.ops[0].label) && inv.hasRemoval);

  // the read-back asks for users when users were written
  const reads = [];
  w.Graph.patch = async () => null;
  w.Graph.readAll = async (pp) => { reads.push(pp); return [{ id: U(1) }]; };
  const r = await MM.applyOps([{ type: "add", key: "k", group: { id: G(90), name: "x" }, ids: [U(1).toLowerCase()], label: "Jan", memberKind: "user", who: "Jan", objs: [{ id: U(1).toLowerCase() }] }], {});
  ok("a user add is read back as users, and verified", /members\/microsoft\.graph\.user\?/.test(reads[0]) && r.results[0].verified && r.done[0].memberKind === "user" && r.done[0].objs.length === 1);

  // ------------------------------------- 👥 holds excluded devices back --
  const mcfg = MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["NL"] }] });
  const input = {
    countryGroups: [{ id: G(22), displayName: "PVM-UG-CORP-MEM-USERS-NL" }], deviceGroups: [{ id: G(35), displayName: "INT-SG-D-NLD" }],
    managed: [managed[0], managed[2]], entra: [{ id: O(1), deviceId: A(1), displayName: "LT-NL-0412" }, { id: O(3), deviceId: A(3), displayName: "WS-ENG-0308" }],
    usersByGroup: new Map([[G(22).toLowerCase(), [{ id: U(1) }, { id: U(2) }]]]),
    deviceMembers: new Map([[G(35).toLowerCase(), new Set([O(1).toLowerCase()])]]), waveChildren: new Map(),
    held: new Set([O(1).toLowerCase()]), heldGroup: { id: G(91).toLowerCase(), name: "INT-SG-D-MDE-Exclusion" }, failed: [], readAt: NOW,
  };
  const mm = MM.compute(mcfg, input, new Map(), NOW);
  const nl = mm.rows.find((x) => x.suffix === "NL");
  ok("👥: an excluded device is not wanted in its country group, and is offered for removal", !nl.want.has(O(1).toLowerCase()) && nl.remove.join() === O(1).toLowerCase() && /\(excluded\)/.test(nl.removeNames[0]) && nl.problems.held === 1);
  ok("…the other device is still added", nl.add.join() === O(3).toLowerCase());
  MM.patchInput(input, [{ type: "remove", group: { id: G(91) }, ids: [O(1).toLowerCase()], memberKind: "device" }]);
  ok("taking it out of the exclusion group lets the sync want it again", !input.held.has(O(1).toLowerCase()) && MM.compute(mcfg, input, new Map(), NOW).rows.find((x) => x.suffix === "NL").want.has(O(1).toLowerCase()));

  // ------------------------------------------- ⚙️ leave out (10639) --
  const cfg = M.normConfig({ leaveOut: ["  Win - OIB - ES - Defender Antivirus - D - AV Test - v1  ", ""] });
  ok("the leave-out list is kept, trimmed, empty lines dropped", cfg.leaveOut.length === 1 && cfg.leaveOut[0] === "Win - OIB - ES - Defender Antivirus - D - AV Test - v1");
  ok("a name left out is out of scope whatever its prefix — dashes and spaces folded", M.generationOf("Win – OIB – ES – Defender Antivirus – D – AV Test – v1", cfg) === "out"
    && M.generationOf("Win - OIB - ES - Defender Antivirus - D - AV Other - v1", cfg) === "new");
  ok("the default list is empty", M.normConfig(null).leaveOut.length === 0);
  const both = M.normConfig({ alsoInScope: ["Win - OIB - SC - X - D - Y - v1"], leaveOut: ["Win - OIB - SC - X - D - Y - v1"] });
  ok("a name in both lists is left out", M.generationOf("Win - OIB - SC - X - D - Y - v1", both) === "out");
}

run().then(() => {
  console.log(`mderollout-exclude: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

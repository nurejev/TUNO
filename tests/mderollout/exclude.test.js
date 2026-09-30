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

  // ------------------------------------------- 📋 a list (10651) --
  // Mihai: "the exclusion should get a bulk add user and device"; option A
  // off the mockup — paste a list.
  const pl = X.parseList("jan.devries@contoso.com\nLT-NL-0412, KIOSK-NL-01;  \"Nina Nieuw\" <nina@contoso.com>\n\nJAN.DEVRIES@contoso.com\tmailto:ghost@contoso.com");
  ok("a pasted list: lines, commas, semicolons and tabs; an Outlook address and mailto: unwrapped; deduplicated case-insensitively",
    pl.lines.join("|") === "jan.devries@contoso.com|LT-NL-0412|KIOSK-NL-01|nina@contoso.com|ghost@contoso.com" && !pl.column && !pl.truncated);
  const csv = X.parseList("﻿Device name,Primary user UPN,OS\r\nLT-NL-0412,jan.devries@contoso.com,Windows\r\nWS-ENG-0308,nina@contoso.com,Windows\r\n");
  ok("a CSV with a header: ONE column — the device name before the UPN (an Intune export is a device list)", csv.column === "Device name" && csv.lines.join() === "LT-NL-0412,WS-ENG-0308");
  ok("…a UPN column, else an e-mail column", X.parseList("displayName;userPrincipalName;mail\nJan;jan@x.com;j@x.com").lines.join() === "jan@x.com"
    && X.parseList("Name,Email\nJan,j@x.com").lines.join() === "j@x.com");
  const big = X.parseList(Array.from({ length: X.MAX_LINES + 3 }, (_, i) => `u${i}@x.com`).join("\n"));
  ok("more than the limit: the first ones, and the total said", big.lines.length === X.MAX_LINES && big.total === X.MAX_LINES + 3 && big.truncated && big.values.length === X.MAX_LINES + 3);

  // match: users by UPN or e-mail (7 of each per request), devices by
  // exact name in Intune, then in Entra
  const managed2 = managed.concat([
    { id: "m6", deviceName: "LT-DE-01", userId: U(3), userPrincipalName: "eva@contoso.com", azureADDeviceId: A(6), lastSyncDateTime: ago(1), osVersion: "10.0.26100" },
    { id: "m7", deviceName: "LT-DE-01", userId: U(4), userPrincipalName: "ali@contoso.com", azureADDeviceId: A(7), lastSyncDateTime: ago(2), osVersion: "10.0.26100" },
    { id: "m8", deviceName: "LT-NL-0233", userId: U(5), userPrincipalName: "piet@contoso.com", azureADDeviceId: A(8), lastSyncDateTime: ago(90), osVersion: "10.0.19045" },
    { id: "m9", deviceName: "LT-NL-0233", userId: U(5), userPrincipalName: "piet@contoso.com", azureADDeviceId: A(9), lastSyncDateTime: ago(1), osVersion: "10.0.26100" },
  ]);
  const base2 = () => Object.assign(base(), { managed: managed2.map((m) => Object.assign({}, m)) });
  const lcalls = [];
  const users = [{ id: U(1), displayName: "Jan de Vries", userPrincipalName: "jan.devries@contoso.com", mail: "jan@contoso.com" },
    { id: U(2), displayName: "Nina Nieuw", userPrincipalName: "nina@contoso.com", mail: "nina@contoso.com" },
    { id: U(8), displayName: "Two A", userPrincipalName: "two.a@contoso.com", mail: "team@contoso.com" }, { id: U(9), displayName: "Two B", userPrincipalName: "two.b@contoso.com", mail: "team@contoso.com" }];
  const entra = [{ id: O(20), deviceId: A(20), displayName: "MB-DES-0007", operatingSystem: "MacMDM" }, { id: O(21), deviceId: A(21), displayName: "HYB-NL-9", operatingSystem: "Windows", operatingSystemVersion: "10.0.26100" },
    { id: O(3), deviceId: A(3), displayName: "ws-eng-0308-entra", operatingSystem: "Windows" }];
  const inList = (q, prop) => { const m = new RegExp(`${prop} in \\(([^)]*)\\)`).exec(q); return m ? [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'").toLowerCase()) : []; };
  w.Graph.readAll = async (p) => {
    lcalls.push(p);
    const q = decodeURIComponent(p);
    if (p.startsWith("/users?")) { const v = inList(q, "userPrincipalName"), m = inList(q, "mail"); return users.filter((u) => v.includes(u.userPrincipalName.toLowerCase()) || m.includes(u.mail.toLowerCase())); }
    if (p.startsWith("/devices?")) { const v = inList(q, "displayName"); return entra.filter((d) => v.includes(d.displayName.toLowerCase())); }
    if (p.startsWith(`/users/${encodeURIComponent(U(1))}/memberOf`)) return [{ id: G(22), displayName: "PVM-UG-CORP-MEM-USERS-NL" }];
    if (/\/devices\/[^/]+\/memberOf/.test(p)) return [{ id: G(35), displayName: "INT-SG-D-NLD" }];
    if (/transitiveMemberOf/.test(p)) throw new Error("a list reads direct groups only");
    return [];
  };
  w.Graph.get = async (p) => {
    const d = /^\/devices\(deviceId='([^']+)'\)/.exec(p);
    if (d) { const id = decodeURIComponent(d[1]); return { id: O(Number(id.slice(-2))), deviceId: id, displayName: "x" }; }
    throw new Error("a list reads no user by id: " + p);
  };
  const lines = ["jan.devries@contoso.com", "nina@contoso.com", "team@contoso.com", "ghost@contoso.com", "LT-NL-0412", "LT-DE-01", "LT-NL-0233", "MB-DES-0007", "HYB-NL-9", "KIOSK-NL-01", "nothing-here", "o'brien@contoso.com", "ws-eng-0308-entra"];
  const status = [];
  const L = await X.resolveList(lines, base2(), { now: NOW, staleDays: 30 }, (m) => status.push(m));
  const it = (line) => L.items.find((x) => x.line === line);
  const uq = lcalls.filter((p) => p.startsWith("/users?")).map(decodeURIComponent);
  ok("users: one request per seven lines, UPN or e-mail, quotes doubled", uq.length === 1 && /userPrincipalName in \('jan\.devries@contoso\.com',.*'o''brien@contoso\.com'\) or mail in \(/.test(uq[0]));
  ok("a UPN is a user", it("jan.devries@contoso.com").kind === "user" && it("jan.devries@contoso.com").card.user.displayName === "Jan de Vries");
  ok("an e-mail two users carry is several — 🔎 decides", it("team@contoso.com").kind === "many" && it("team@contoso.com").count === 2 && it("team@contoso.com").what === "users");
  ok("no user and no device: none", it("ghost@contoso.com").kind === "none" && it("nothing-here").kind === "none" && it("o'brien@contoso.com").kind === "none");
  ok("a device name is matched exactly in the Intune list", it("KIOSK-NL-01").kind === "device" && it("KIOSK-NL-01").card.devices[0].name === "KIOSK-NL-01");
  ok("two Intune records that both synced lately: several", it("LT-DE-01").kind === "many" && it("LT-DE-01").count === 2);
  ok("a re-enrolment (one recent record, one stale): the recent one, the other said", it("LT-NL-0233").kind === "device" && it("LT-NL-0233").card.devices[0].managedId === "m9" && /1 older Intune record/.test(it("LT-NL-0233").note));
  const dq = lcalls.filter((p) => p.startsWith("/devices?")).map(decodeURIComponent);
  ok("only the names Intune does not know go to Entra, in one request", dq.length === 1 && /displayName in \('MB-DES-0007','HYB-NL-9','nothing-here','ws-eng-0308-entra'\)/.test(dq[0]));
  ok("an Entra device that is not Windows is said", it("MB-DES-0007").kind === "notwin" && /MacMDM/.test(it("MB-DES-0007").note));
  ok("an Entra-only Windows device is a match, by its object", it("HYB-NL-9").kind === "device" && it("HYB-NL-9").card.devices[0].objId === O(21).toLowerCase() && !it("HYB-NL-9").card.devices[0].managed);
  ok("an Entra name whose device IS in Intune is taken as the Intune device (here: Nina's, so under her line)", it("ws-eng-0308-entra").pick.managedId === "m3" && it("ws-eng-0308-entra").kind === "listed" && it("ws-eng-0308-entra").note === "nina@contoso.com");
  ok("a device off a list comes alone — its user named, not read", it("LT-NL-0233").card.user === null && it("LT-NL-0233").card.devices.length === 1 && it("LT-NL-0233").card.devices[0].upn === "piet@contoso.com");
  ok("a device that is also under its user's line says so", it("LT-NL-0412").kind === "listed" && it("LT-NL-0412").note === "jan.devries@contoso.com" && !it("LT-NL-0412").card);
  const jc = it("jan.devries@contoso.com").card;
  ok("light: the user's and each device's DIRECT groups only (no transitive read)", jc.user.direct.map((g) => g.name).join() === "PVM-UG-CORP-MEM-USERS-NL" && !jc.user.groups
    && jc.devices.find((d) => d.name === "LT-NL-0412").direct.map((g) => g.name).join() === "INT-SG-D-NLD" && !lcalls.some((p) => /transitiveMemberOf/.test(p)));
  ok("the progress is said", status.some((m) => /Looking up users/.test(m)) && status.some((m) => /Reading groups/.test(m)));
  const lt = X.listTicks(L);
  const n412 = jc.devices.find((d) => d.name === "LT-NL-0412"), n388 = jc.devices.find((d) => d.name === "LT-NL-0388");
  ok("the ticks: each card's defaults — Jan and his recent laptop, not the stale one; Nina's laptop (she is in already); the devices", lt.has(`u:${U(1).toLowerCase()}`) && lt.has(n412.key) && !lt.has(n388.key)
    && !lt.has(`u:${U(2).toLowerCase()}`) && lt.has("m:m3") && lt.has("m:m9") && lt.has(`e:${O(21).toLowerCase()}`) && !lt.has("m:m4"));
  const mp = X.planAddMany(L.items.filter((x) => x.card).map((x) => x.card), ctx(lt, true));
  ok("one plan, merged per group: users, then devices, then out of the country device group", mp.ops.length === 3 && mp.bulk && mp.exclusions && !mp.hasRemoval
    && mp.ops[0].type === "add" && mp.ops[0].memberKind === "user" && mp.ops[0].ids.join() === U(1).toLowerCase()
    && mp.ops[1].type === "add" && mp.ops[1].memberKind === "device" && mp.ops[1].ids.length === 4 && mp.ops[1].objs.length === 4 && mp.ops[1].who === "4 devices"
    && mp.ops[2].type === "remove" && mp.ops[2].group.name === "INT-SG-D-NLD" && mp.ops[2].ids.length === 4 && mp.ops[2].label === "LT-NL-0412, WS-ENG-0308, LT-NL-0233, HYB-NL-9 — out of the wave, back on the old set");
  ok("…its counts are the bar's", mp.counts.users === 1 && mp.counts.devices === 4 && mp.counts.out === 4);
  const five = X.planAddMany(["A", "B", "C", "D", "E"].map((n, i) => ({ pick: { type: "device" }, user: null, devices: [{ key: `k${i}`, name: `PC-${n}`, objId: O(60 + i).toLowerCase(), deviceId: "", excluded: false, direct: [] }] })), ctx(new Set(["k0", "k1", "k2", "k3", "k4"]), true));
  ok("…a long step names three and counts the rest", five.ops.length === 1 && five.ops[0].label === "PC-A, PC-B, PC-C and 2 more" && five.ops[0].ids.length === 5);
  ok("the kiosk, already in, is skipped with the reason if ticked", /KIOSK-NL-01: already in/.test(X.planAddMany([it("KIOSK-NL-01").card], ctx(new Set(["m:m4"]), true)).skipped.join()));
  // the run moves the list
  X.patchList(L, mp.ops.map((o) => Object.assign({}, o)), groups);
  ok("after the run: Jan and the four devices excluded, out of INT-SG-D-NLD, nothing ticked by default", jc.user.excluded && n412.excluded && !n412.direct.some((g) => g.name === "INT-SG-D-NLD")
    && X.listTicks(L).size === 0);
  X.patchList(L, MM.inverseOf(mp.ops).ops, groups);
  ok("…and the undo moves it back", !jc.user.excluded && !n412.excluded && n412.direct.some((g) => g.name === "INT-SG-D-NLD") && X.listTicks(L).size === lt.size);

  // ------------------------------------------- ⚙️ leave out (10639) --
  const cfg = M.normConfig({ leaveOut: ["  Win - OIB - ES - Defender Antivirus - D - AV Test - v1  ", ""], leaveOutSeed: M.DEFAULTS.leaveOutSeed });
  ok("the leave-out list is kept, trimmed, empty lines dropped", cfg.leaveOut.length === 1 && cfg.leaveOut[0] === "Win - OIB - ES - Defender Antivirus - D - AV Test - v1");
  ok("a name left out is out of scope whatever its prefix — dashes and spaces folded", M.generationOf("Win – OIB – ES – Defender Antivirus – D – AV Test – v1", cfg) === "out"
    && M.generationOf("Win - OIB - ES - Defender Antivirus - D - AV Other - v1", cfg) === "new");
  // 10642 (Mihai: "should be default excluded with the option to include")
  const def = M.normConfig(null);
  ok("the default list: Mihai's 77 names and Ring 3 Production", def.leaveOut.length === 78 && def.leaveOut.includes("Win - OIB - ES - Defender Antivirus Updates - Ring 3 - Production - v3.4")
    && def.leaveOut.includes("WIN-SEC-AccountProtection-D-LUGM-NLD-v1.0"));
  ok("…each of them out of scope by default, however it is typed in Intune", M.generationOf("WIN-SEC-AttackSurfaceReduction-D-02_Block execution of potentially obfuscated scripts-v1.0", def) === "out"
    && M.generationOf("WIN-SEC-AttackSurfaceReduction-D-18_Block rebooting machine in Safe Mode - v.1.0", def) === "out" && M.generationOf("Win - OIB - ES - Encryption - D - BitLocker (OS Disk) - v3.0", def) === "out"
    && M.generationOf("Win - OIB - ES - Defender Antivirus - D - AV Configuration - v3.3", def) === "new");
  const old10639 = M.normConfig({ leaveOut: ["Win - OIB - SC - Z - D - Mine - v1"] });
  ok("a config saved before 10642 gets the defaults merged in once, and keeps its own", old10639.leaveOut.length === 79 && old10639.leaveOut.includes("Win - OIB - SC - Z - D - Mine - v1") && old10639.leaveOutSeed === M.DEFAULTS.leaveOutSeed);
  const included = M.normConfig(Object.assign({}, def, { leaveOut: def.leaveOut.filter((n) => !/LUGM-NLD/.test(n)) }));
  ok("➕ include takes a name off for good — the seed stops it coming back", included.leaveOut.length === 77 && !included.leaveOut.some((n) => /LUGM-NLD/.test(n))
    && M.generationOf("WIN-SEC-AccountProtection-D-LUGM-NLD-v1.0", M.normConfig(JSON.parse(JSON.stringify(included)))) === "new");
  const both = M.normConfig({ alsoInScope: ["Win - OIB - SC - X - D - Y - v1"], leaveOut: ["Win - OIB - SC - X - D - Y - v1"], leaveOutSeed: M.DEFAULTS.leaveOutSeed });
  ok("a name in both lists is left out", M.generationOf("Win - OIB - SC - X - D - Y - v1", both) === "out");
}

run().then(() => {
  console.log(`mderollout-exclude: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

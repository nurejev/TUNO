// T28 — AVD out of scope everywhere (build 10684, Mihai: "t28, always
// exclude devices with -vdi- in the name. they are out of scope"). DOM-free:
// the rule itself, no placement step places one (primary user, logons, a
// user's other devices, owner, name), one already in a country device group
// is a removal, a pin keeps none, a pin or pilot refuses one, Left out names
// it on the user.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), { runScripts: "outside-only" });
const w = dom.window;
const files = ["js/version.js", "js/graph.js", "js/progress.js", "js/groupuse.js", "js/document.js", "js/overview.js",
  "js/conflict.js", "js/endpointsec.js", "js/filterrules.js", "js/endpointposture.js", "js/assignedit.js",
  "js/groupmigrate.js", "js/mdemembers.js", "js/mdereports.js", "js/mdeexclude.js", "js/mderevert.js", "js/mderollout.js"];
w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n") + "\n;Object.assign(window, {MdeMembers, Graph});");
const MM = w.MdeMembers;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}

const now = Date.parse("2026-10-06T12:00:00Z"), day = 86400000, iso = (t) => new Date(t).toISOString();
const uNL = "bbbbbbbb-0000-4000-8000-00000000000e";
// the rule
ok("-vdi- in the name, any case, is AVD", MM.isAvdName("NLD-VDI-017") && MM.isAvdName("pvm-vdi-03.corp.local") && MM.isAvdName("x-vDi-1"));
ok("vdi without the dashes is not", !MM.isAvdName("NLDVDI01") && !MM.isAvdName("VDI-01") && !MM.isAvdName("NLD-VDI") && !MM.isAvdName("NLD5CD5502ZZQ") && !MM.isAvdName(""));

const input = {
  countryGroups: [{ id: "gnl", displayName: "PVM-UG-CORP-MEM-USERS-NL" }],
  deviceGroups: [{ id: "dnl", displayName: "INT-SG-D-NLD" }],
  usersByGroup: new Map([["gnl", [{ id: uNL, userPrincipalName: "nina@x" }]]]),
  managed: [
    { id: "m1", deviceName: "NLD5CD1", userId: uNL, userPrincipalName: "nina@x", azureADDeviceId: "a1", lastSyncDateTime: iso(now), operatingSystem: "Windows" },          // her laptop
    { id: "m2", deviceName: "NLD-VDI-002", userId: uNL, userPrincipalName: "nina@x", azureADDeviceId: "a2", lastSyncDateTime: iso(now), operatingSystem: "Windows" },      // ① primary user, AVD
    { id: "m3", deviceName: "NLD-VDI-003", userId: "", azureADDeviceId: "a3", lastSyncDateTime: iso(now), operatingSystem: "Windows" },                                   // ⑤ name says NLD, AVD
    { id: "m4", deviceName: "POOL-04", userId: "", azureADDeviceId: "a4", lastSyncDateTime: iso(now), operatingSystem: "Windows" },                                        // Entra calls it -vdi-, logons say Nina
    { id: "m5", deviceName: "NLD-VDI-005", userId: "", azureADDeviceId: "a5", lastSyncDateTime: iso(now), operatingSystem: "Windows" },                                   // already in the group and pinned
  ],
  entra: [{ id: "e1", deviceId: "a1", displayName: "NLD5CD1", approximateLastSignInDateTime: iso(now) }, { id: "e2", deviceId: "a2", displayName: "NLD-VDI-002", approximateLastSignInDateTime: iso(now) },
    { id: "e3", deviceId: "a3", displayName: "NLD-VDI-003", approximateLastSignInDateTime: iso(now) }, { id: "e4", deviceId: "a4", displayName: "nld-vdi-pool-04", approximateLastSignInDateTime: iso(now) },
    { id: "e5", deviceId: "a5", displayName: "NLD-VDI-005", approximateLastSignInDateTime: iso(now) }],
  entraUsers: new Map([["e2", new Set([uNL])], ["e4", new Set([uNL])]]),
  deviceMembers: new Map([["dnl", new Set(["e1", "e5"])]]),
  waveChildren: new Map(), waveUsers: new Map(), owners: new Map(), primaryUsers: new Map(),
  intuneLogons: new Map([["m4", [{ userId: uNL, at: iso(now - day) }]], ["m3", [{ userId: uNL, at: iso(now - day) }]]]),
  defLogons: [], pinned: new Set(["e5"]), pinnedGroup: { id: "gpin", name: "INT-SG-D-MDE-Pinned" },
  logonRead: { intune: true, defender: null }, failed: [], readAt: now,
};
const cfg = MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["NL"] }], pilots: [], batched: [] });
const waves = new Map([["euro", { user: null, device: null, userName: "U", deviceName: "D" }]]);
const m = MM.compute(cfg, input, waves, now);
const NL = m.rows.find((r) => r.suffix === "NL");
const names = NL.devices.map((d) => d.name).join();
ok("no step places an AVD device — primary user, a logon, a user's other device, the name, an Entra name with -vdi-", names === "NLD5CD1", names);
ok("only the laptop is wanted", [...NL.want].join() === "e1", [...NL.want].join());
ok("an AVD device already in the group, pinned too, is a removal — the pin does not keep it", NL.remove.join() === "e5" && !NL.pinnedIn.length && NL.avdIn.join() === "e5" && NL.problems.avd === 1
  && /NLD-VDI-005 \(AVD — -vdi- in the name, out of scope\)/.test(NL.removeNames.join()));
ok("the model counts them, and those still in a group", m.avd.count === 4 && m.avd.inGroups === 1 && m.avd.names.includes("POOL-04"), JSON.stringify(m.avd));
ok("AVD devices are not 'no primary user' or 'no country' leftovers", !m.leftOut.noPrimary.some((d) => /VDI|POOL/.test(d.name)) && !m.leftOut.noCountry.some((d) => /VDI|POOL/.test(d.name)));
ok("the input is not changed", input.managed.length === 5);

// a user whose only Windows device is AVD: left out, with it named
const only = Object.assign({}, input, { managed: [input.managed[1]], entraUsers: new Map(), intuneLogons: new Map(), deviceMembers: new Map([["dnl", new Set()]]), pinned: new Set() });
const m2 = MM.compute(cfg, only, waves, now);
const lu = m2.leftOut.users.find((u) => u.upn === "nina@x");
ok("a user with only an AVD device is left out, the AVD named", lu && lu.has["AVD (-vdi-, out of scope)"] === 1);

// pin refuses
const pp = MM.planPin(m, input, [{ userId: uNL, aad: "a3", name: "NLD-VDI-003" }, { userId: uNL, aad: "a4", name: "POOL-04" }], cfg);
ok("a pin refuses an AVD device, by its name or its Entra name", !pp.ops.length && pp.skipped.length === 2 && pp.skipped.every((x) => /-vdi- in the name/.test(x)), pp.skipped.join(" | "));

// a pilot group holding an AVD device: out of scope, never planned
const withPilot = Object.assign({}, input, { pilots: [{ id: "gp", name: "INT-SG-D-Win-Pilot", users: [], devices: [{ id: "e2", deviceId: "a2", name: "NLD-VDI-002" }], groups: [] }], pilotsMissing: [] });
const m3 = MM.compute(cfg, withPilot, waves, now);
const pm = m3.pilots.members.find((x) => x.id === "e2");
ok("an AVD device in a pilot group: out of scope, never planned", pm && pm.state === "none" && pm.avd && /-vdi- in the name/.test(pm.why) && !m3.pilots.people.some((p) => p.devices.some((d) => d.id === "e2")));

console.log(`mderollout-vdi: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

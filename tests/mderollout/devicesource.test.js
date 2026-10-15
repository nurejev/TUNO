// T28 — ⚙️ devices from Entra (build 10708). DOM-free. The lab seam for a
// tenant whose devices are Entra objects only (the P2719 lab in devcf: 44
// devices, no Intune): with deviceSource "entra" the Windows devices in
// Entra are the devices — one row per object, no primary user, the Entra id
// as the id — Intune is not read (not the devices, not ② its logons), the
// registered owner (④) and the name (⑤) place them, and the model says so.
// With the default "intune" nothing changes: the same read as before.
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

// a lab tenant: two country groups, two owners, three Entra Windows devices
// (no managedDevice behind any of them), one with no owner at all
const uNL = "bbbbbbbb-0000-4000-8000-00000000000e", uDE = "aaaaaaaa-0000-4000-8000-00000000000d";
const ENTRA = [
  { id: "E1", deviceId: "D1", displayName: "NLD5CD001P27", accountEnabled: true, approximateLastSignInDateTime: null },
  { id: "E2", deviceId: "D2", displayName: "GER5CD002P27", accountEnabled: true, approximateLastSignInDateTime: null },
  { id: "E3", deviceId: "D3", displayName: "XYZ5CD003P27", accountEnabled: true, approximateLastSignInDateTime: null },
];
const OWNERS = { E1: [{ id: uNL, userPrincipalName: "p2719.nina@lab", usageLocation: "NL" }], E2: [{ id: uDE, userPrincipalName: "p2719.dirk@lab", usageLocation: "DE" }], E3: [] };
function fakeGraph(reads) {
  w.Graph.readAll = async (p) => {
    reads.push(p);
    const d = decodeURIComponent(p);
    if (/^\/groups\?\$filter=startswith\(displayName,'P2719-UG-CORP-MEM-USERS-'\)/.test(d)) return [{ id: "gnl", displayName: "P2719-UG-CORP-MEM-USERS-NL" }, { id: "gde", displayName: "P2719-UG-CORP-MEM-USERS-DE" }];
    if (/^\/groups\?\$filter=startswith\(displayName,'P2719-SG-D-'\)/.test(d)) return [];
    if (/^\/devices\?\$filter=operatingSystem eq 'Windows'&\$count=true/.test(d)) return ENTRA;
    if (/^\/devices\?.*\$expand=/.test(d)) return ENTRA.map((e) => ({ id: e.id, registeredOwners: OWNERS[e.id], registeredUsers: OWNERS[e.id] }));
    const o = /^\/devices\/(E\d)\/registeredOwners\/microsoft\.graph\.user/.exec(d);
    if (o) return OWNERS[o[1]];
    if (/^\/groups\/gnl\/transitiveMembers\/microsoft\.graph\.user/.test(d)) return [{ id: uNL, userPrincipalName: "p2719.nina@lab" }];
    if (/^\/groups\/gde\/transitiveMembers\/microsoft\.graph\.user/.test(d)) return [{ id: uDE, userPrincipalName: "p2719.dirk@lab" }];
    if (/managedDevices/.test(d)) return [{ id: "m-should-not-be-read", deviceName: "INTUNE-ONLY", userId: uNL, azureADDeviceId: "D9", operatingSystem: "Windows" }];
    return [];
  };
  w.Graph.get = async () => { throw new w.Graph.GraphError("notfound", "not in this test"); };
  w.Graph.post = async () => ({ results: [] });
}
const base = { countryPrefix: "P2719-UG-CORP-MEM-USERS-", deviceGroupPrefix: "P2719-SG-D-", userGroupPrefix: "P2719-SG-U-",
  countryMap: [{ region: "Euro", suffixes: ["NL", "DE"] }], deviceSuffixes: { DE: "GER" }, pilots: [], batched: [],
  useIntuneLogons: true, useDefenderLogons: false, pinnedDevice: "P2719-SG-D-MDE-Pinned", skipDevice: "P2719-SG-D-MDE-Skip" };

async function run() {
  // ---------------------------------------------------------- config --
  ok("the default is Intune: the tool as it was", MM.normConfig(null).deviceSource === "intune" && MM.normConfig({ deviceSource: "whatever" }).deviceSource === "intune");
  ok("\"entra\" is the one other value, any case", MM.normConfig({ deviceSource: "Entra" }).deviceSource === "entra");

  // ------------------------------------------------- the read, entra --
  {
    const reads = [];
    fakeGraph(reads);
    const cfg = MM.normConfig(Object.assign({}, base, { deviceSource: "entra" }));
    const inp = await MM.readInput(cfg, [], null, null, null, []);
    ok("devices from Entra: Intune is not asked — not for the devices, not for ② its logons", !reads.some((p) => /managedDevices/.test(p)), reads.filter((p) => /managedDevices/.test(p)).join());
    ok("…every Windows device in Entra is a device row: the Entra id as the id, the device id as azureADDeviceId, no primary user, no last sync", inp.managed.length === 3 && inp.managed.every((m) => m.fromEntra && !m.userId && m.lastSyncDateTime === null && m.operatingSystem === "Windows")
      && inp.managed[0].id === "e1" && inp.managed[0].azureADDeviceId === "D1" && inp.managed[0].deviceName === "NLD5CD001P27", JSON.stringify(inp.managed[0]));
    ok("…managedAll is the same list (there is no other platform to count)", inp.managedAll === inp.managed);
    ok("…every one is an orphan, so its registered owner is read (rule ④)", ["E1", "E2", "E3"].every((e) => reads.some((p) => new RegExp(`^/devices/${e}/registeredOwners/`).test(p))) && inp.owners.get("e1").upn === "p2719.nina@lab" && inp.owners.get("e2").usageLocation === "DE" && !inp.owners.has("e3"));
    ok("…the input says where the devices came from", inp.deviceSource === "entra");

    // ------------------------------------------------------- compute --
    const now = Date.parse("2026-10-15T12:00:00Z");
    const waves = new Map([["euro", { user: null, device: null, userName: "P2719-SG-U-WAVE-Euro", deviceName: "P2719-SG-D-WAVE-Euro" }]]);
    const m = MM.compute(cfg, inp, waves, now);
    const NL = m.rows.find((r) => r.suffix === "NL"), DE = m.rows.find((r) => r.suffix === "DE");
    const dev = (row, name) => row && row.devices.find((d) => d.name === name);
    ok("④ the owner in a country group places the device: Nina's in NL, Dirk's in DE", dev(NL, "NLD5CD001P27") && dev(NL, "NLD5CD001P27").via === "owner" && dev(DE, "GER5CD002P27") && dev(DE, "GER5CD002P27").via === "owner");
    ok("…with the Entra object id, so the group add has an id", dev(NL, "NLD5CD001P27").objId === "e1" && !dev(NL, "NLD5CD001P27").problem);
    ok("…and the device groups to create are named by the country", NL.deviceGroupName === "P2719-SG-D-NLD" && DE.deviceGroupName === "P2719-SG-D-GER" && NL.want.has("e1") && DE.want.has("e2"));
    ok("a device with no owner and a name of no country is in no country", m.noPrimary === 1 && !m.rows.some((r) => r.devices.some((d) => d.name === "XYZ5CD003P27")));
    ok("the placed-by count: ④ owner 2, ① and ② nothing; the model says devices from Entra", m.placedBy.owner === 2 && !m.placedBy.primary && !m.placedBy.lastlogon && m.managedCount === 3 && m.deviceSource === "entra", JSON.stringify(m.placedBy));
    ok("no user is left out — each has a device through the owner rule", !m.leftOut.users.length, JSON.stringify(m.leftOut.users));
  }

  // ------------------------------------------------ the read, intune --
  {
    const reads = [];
    fakeGraph(reads);
    const cfg = MM.normConfig(Object.assign({}, base, { deviceSource: "intune" }));
    const inp = await MM.readInput(cfg, [], null, null, null, []);
    ok("devices from Intune (the default): managedDevices is read, as before, and the Entra list only decorates", reads.some((p) => /^\/deviceManagement\/managedDevices\?/.test(p)) && inp.managed.length === 1 && inp.managed[0].deviceName === "INTUNE-ONLY" && !inp.managed[0].fromEntra && inp.entra.length === 3);
    ok("…and ② Intune's logons are read when switched on", reads.some((p) => /managedDevices\?\$filter=.*usersLoggedOn/.test(decodeURIComponent(p))));
    ok("…the input says so", inp.deviceSource === "intune");
  }
}

run().then(() => {
  console.log(`mderollout-devicesource: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

// T28 — wave members engine (build 10634). DOM-free: the country table and
// its naming (ISO2 → ISO3, the Polish city groups, UAE), the device join by
// Intune primary user, the sync diff, the plan (order, skips, warnings), the
// undo, and the writes with Graph stubbed — 20 per PATCH, the one-by-one
// fallback when a member is in already, the retry while a new group
// replicates, nest / unnest, the read-back.
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
  + "\n;Object.assign(window, {MdeRollout, MdeMembers, Graph});");
const MM = w.MdeMembers;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}

async function run() {
  // ------------------------------------------------------------ config --
  const cfg = MM.normConfig(null);
  const allSuffixes = cfg.countryMap.flatMap((r) => r.suffixes);
  ok("the sheet's table: five regions, 39 country groups, the NL-Breda pilot, and SK, KZ, LAGOS", cfg.countryMap.map((r) => r.region).join("|") === "Euro|Americas|Asia-Pacific|Italy|BAMSCA" && allSuffixes.length === 43);
  ok("SK in Euro, KZ and LAGOS in BAMSCA, each with a device group", cfg.countryMap[0].suffixes.includes("SK") && cfg.countryMap[4].suffixes.includes("KZ") && cfg.countryMap[4].suffixes.includes("LAGOS")
    && MM.countryRows(cfg).find((r) => r.suffix === "SK").deviceGroupName === "INT-SG-D-SVK" && MM.countryRows(cfg).find((r) => r.suffix === "KZ").deviceGroupName === "INT-SG-D-KAZ" && MM.countryRows(cfg).find((r) => r.suffix === "LAGOS").deviceGroupName === "INT-SG-D-NGA-LAGOS");
  ok("NL-Breda is the Euro wave's pilot by default, with its own device group", cfg.pilots.join() === "NL-Breda" && cfg.countryMap[0].suffixes[0] === "NL-Breda" && MM.countryRows(cfg)[0].deviceGroupName === "INT-SG-D-NLD-BREDA" && MM.countryRows(cfg)[0].pilot === true);
  ok("a star in the table marks a pilot, and round-trips", MM.parsePilots("Euro: *NL-Breda, GB\nItaly: *IT-SELECTION, IT").join() === "NL-Breda,IT-SELECTION" && MM.parseMap("Euro: *NL-Breda, GB")[0].suffixes.join() === "NL-Breda,GB" && /Euro: \*NL-Breda, GB/.test(MM.formatMap(cfg.countryMap, cfg.pilots)));
  ok("a suggested device-group suffix: ISO3 of the leading code, the rest upper-cased", MM.suggestDeviceSuffix("NL-Breda") === "NLD-BREDA" && MM.suggestDeviceSuffix("IT-SELECTION") === "ITA-SELECTION" && MM.suggestDeviceSuffix("LAGOS") === "LAGOS");
  const added = MM.addPilot(MM.normConfig({ pilots: [] , countryMap: [{ region: "Italy", suffixes: ["IT"] }], deviceSuffixes: {} }), "IT-SELECTION", "Italy");
  ok("addPilot: first in the region, starred, with a device-group suffix", added.countryMap[0].suffixes.join() === "IT-SELECTION,IT" && added.pilots.join() === "IT-SELECTION" && added.deviceSuffixes["IT-SELECTION"] === "ITA-SELECTION");
  const moved = MM.addPilot(cfg, "GB", "Italy");
  ok("addPilot on a mapped suffix moves it, never duplicates it", moved.countryMap.flatMap((r) => r.suffixes).filter((x) => x === "GB").length === 1 && moved.countryMap.find((r) => r.region === "Italy").suffixes[0] === "GB");
  ok("Brazil is in BAMSCA and Canada in Americas, as the sheet has them", cfg.countryMap.find((r) => r.region === "BAMSCA").suffixes.includes("BR") && cfg.countryMap.find((r) => r.region === "Americas").suffixes.includes("CA"));
  ok("defaults: INT-SG-D- and the country prefix", cfg.deviceGroupPrefix === "INT-SG-D-" && cfg.countryPrefix === "PVM-UG-CORP-MEM-USERS-");
  const map = MM.parseMap("Euro: GB, BE NL\nAmericas: US\n\nno colon here\nEuro: DE");
  ok("parseMap: one region per line, commas or spaces, repeated regions merged, junk ignored", map.length === 2 && map[0].suffixes.join() === "GB,BE,NL,DE" && map[1].suffixes.join() === "US");
  ok("formatMap round-trips", MM.formatMap(MM.parseMap(MM.formatMap(cfg.countryMap))) === MM.formatMap(cfg.countryMap));
  ok("parseOverrides: suffix = code, upper-cased", JSON.stringify(MM.parseOverrides("POL-Warszawa = pol-waw\nbad line\nUAE=ARE")) === JSON.stringify({ "POL-Warszawa": "POL-WAW", UAE: "ARE" }));

  // ------------------------------------------------------------ naming --
  ok("ISO2 → ISO3", MM.iso3Of("GB").code === "GBR" && MM.iso3Of("nl").code === "NLD" && MM.iso3Of("KR").code === "KOR" && MM.iso3Of("ZA").code === "ZAF");
  ok("the Polish city groups take their own suffixes (Mihai: two groups, short suffix)", MM.iso3Of("POL-Warszawa", cfg.deviceSuffixes).code === "POL-WAW" && MM.iso3Of("POL-SKARB", cfg.deviceSuffixes).code === "POL-SKARB");
  ok("UAE is not ISO2 — its override makes it ARE", MM.iso3Of("UAE", cfg.deviceSuffixes).code === "ARE");
  ok("an unknown suffix has no code, and says where to set one", MM.iso3Of("DEM-ITAPIT", cfg.deviceSuffixes).code === null && /⚙️/.test(MM.iso3Of("DEM-ITAPIT", cfg.deviceSuffixes).source));
  const rows = MM.countryRows(cfg);
  const row = (s) => rows.find((r) => r.suffix === s);
  ok("country rows carry both group names", row("NL").userGroupName === "PVM-UG-CORP-MEM-USERS-NL" && row("NL").deviceGroupName === "INT-SG-D-NLD" && row("POL-SKARB").deviceGroupName === "INT-SG-D-POL-SKARB");
  ok("a country name for the row", row("GB").country === "United Kingdom" && row("UAE").country === "United Arab Emirates");
  const dup = MM.countryRows(MM.normConfig({ countryMap: [{ region: "A", suffixes: ["NL"] }, { region: "B", suffixes: ["NL", "DE"] }] }));
  ok("a suffix under two regions is kept in the first, and said", dup.filter((r) => r.suffix === "NL").length === 1 && dup[0].region === "A" && /also listed under B/.test(dup[0].notes.join()));
  const clash = MM.countryRows(MM.normConfig({ countryMap: [{ region: "A", suffixes: ["PL", "POL-X"] }], deviceSuffixes: { "POL-X": "POL" } }));
  ok("two suffixes on one device group are said, not merged silently", clash.every((r) => /also the device group/.test(r.notes.join())));

  // ----------------------------------------------------------- compute --
  const G = (n) => `g${n}`;
  const now = Date.parse("2026-09-29T12:00:00Z");
  const day = 86400000;
  const iso = (t) => new Date(t).toISOString();
  const input = {
    countryGroups: [
      { id: G(1), displayName: "PVM-UG-CORP-MEM-USERS-NL", groupTypes: ["DynamicMembership"] },
      { id: G(2), displayName: "PVM-UG-CORP-MEM-USERS-DE", groupTypes: ["DynamicMembership"] },
      { id: G(3), displayName: "PVM-UG-CORP-MEM-USERS-NL-Breda", groupTypes: ["DynamicMembership"] },
      { id: G(4), displayName: "PVM-UG-CORP-MEM-USERS-PL", groupTypes: ["DynamicMembership"] },
    ],
    deviceGroups: [{ id: G(10), displayName: "INT-SG-D-NLD" }],
    usersByGroup: new Map([[G(1), [{ id: "u1" }, { id: "u2" }, { id: "u5" }]], [G(2), [{ id: "u3" }, { id: "u5" }]], [G(3), [{ id: "u1" }]]]),
    managed: [
      { id: "m1", deviceName: "NL-1", userId: "u1", azureADDeviceId: "A1", lastSyncDateTime: iso(now - day) },
      { id: "m2", deviceName: "NL-2", userId: "u2", azureADDeviceId: "A2", lastSyncDateTime: iso(now - 40 * day) },
      { id: "m3", deviceName: "DE-1", userId: "u3", azureADDeviceId: "A3", lastSyncDateTime: iso(now) },
      { id: "m4", deviceName: "DE-NOENTRA", userId: "u3", azureADDeviceId: "A9", lastSyncDateTime: iso(now) },
      { id: "m5", deviceName: "BOTH", userId: "u5", azureADDeviceId: "A5", lastSyncDateTime: iso(now) },
      { id: "m6", deviceName: "SHARED", userId: "", azureADDeviceId: "A6", lastSyncDateTime: iso(now) },
    ],
    entra: [{ id: "E1", deviceId: "A1", displayName: "NL-1" }, { id: "E2", deviceId: "A2", displayName: "NL-2" }, { id: "E3", deviceId: "A3", displayName: "DE-1" },
      { id: "E5", deviceId: "A5", displayName: "BOTH" }, { id: "E6", deviceId: "A6", displayName: "SHARED" }, { id: "E7", deviceId: "A7", displayName: "OLD-US" }],
    deviceMembers: new Map([[G(10), new Set(["e1", "e7"])]]),
    waveChildren: new Map([["wu", new Set([G(1)])], ["wd", new Set([G(10)])]]),
    failed: [], readAt: now,
  };
  const waves = new Map([["euro", { user: { id: "WU", displayName: "INT-SG-U-WAVE-Euro" }, device: { id: "WD", displayName: "INT-SG-D-WAVE-Euro" }, userName: "INT-SG-U-WAVE-Euro", deviceName: "INT-SG-D-WAVE-Euro" }]]);
  const model = MM.compute(cfg, input, waves, now);
  const NL = model.rows.find((r) => r.suffix === "NL"), DE = model.rows.find((r) => r.suffix === "DE"), GB = model.rows.find((r) => r.suffix === "GB");
  ok("devices by Intune primary user, joined to the Entra object", NL.devices.map((d) => d.objId).sort().join() === "e1,e2,e5" && NL.want.size === 3);
  ok("a stale device is marked, not dropped", NL.devices.find((d) => d.name === "NL-2").stale === true && NL.problems.stale === 1);
  ok("a device with no Entra object cannot be a member, and says so", DE.devices.find((d) => d.name === "DE-NOENTRA").objId === null && DE.problems.noEntra === 1 && !DE.want.has(null));
  ok("a device whose user is in two country groups is flagged on both", NL.devices.find((d) => d.name === "BOTH").others.join() === "PVM-UG-CORP-MEM-USERS-DE" && DE.problems.multi === 1);
  ok("the sync diff: +2 to add, −1 to remove (primary user no longer in the country)", NL.add.sort().join() === "e2,e5" && NL.remove.join() === "e7" && NL.removeNames.join() === "OLD-US" && !NL.inSync);
  ok("nesting read from the wave's members", NL.ugNested === true && NL.dgNested === true && DE.ugNested === false && DE.dgNested === null);
  ok("a missing device group is 'to create' with its wanted set", DE.dg === null && DE.want.size === 2 && DE.add.length === 2);
  ok("a country group not in the tenant is a row without a group", GB.ug === null && GB.users === 0);
  ok("devices with no primary user are counted, not guessed", model.noPrimary === 1 && model.managedCount === 6);

  // 10655 (Mihai: "in the users without devices I see no primary user on
  // the device, but in Entra I get a device name"; "the 3 letter code the
  // device name starts with is the country"; option A — the primary user,
  // then the Entra owner, then the name)
  const inO = Object.assign({}, input, {
    managed: input.managed.concat([
      { id: "m7", deviceName: "NLD5CD5502ZZQ", userId: "", azureADDeviceId: "A11", lastSyncDateTime: iso(now) },   // owner u2 (NL)
      { id: "m8", deviceName: "DEU-LT-9", userId: "", azureADDeviceId: "A12", lastSyncDateTime: iso(now) },        // no owner → name DEU
      { id: "m9", deviceName: "X-HALL-1", userId: "", azureADDeviceId: "A13", lastSyncDateTime: iso(now) },        // owner in no group, usage location DE
      { id: "m10", deviceName: "KIOSK-2", userId: "", azureADDeviceId: "A14", lastSyncDateTime: iso(now) },        // nothing → left out
      { id: "m11", deviceName: "DEU-LT-7", userId: "u1", azureADDeviceId: "A15", lastSyncDateTime: iso(now) },     // a Dutch user, a German name
      { id: "m12", deviceName: "POL8H2", userId: "", azureADDeviceId: "A16", lastSyncDateTime: iso(now) },         // POL: Poland is split in cities — no single group
    ]),
    entra: input.entra.concat([{ id: "E11", deviceId: "A11", displayName: "NLD5CD5502ZZQ" }, { id: "E12", deviceId: "A12", displayName: "DEU-LT-9" }, { id: "E13", deviceId: "A13", displayName: "X-HALL-1" },
      { id: "E14", deviceId: "A14", displayName: "KIOSK-2" }, { id: "E15", deviceId: "A15", displayName: "DEU-LT-7" }, { id: "E16", deviceId: "A16", displayName: "POL8H2" }]),
    usersByGroup: new Map([[G(1), [{ id: "u1" }, { id: "u2" }, { id: "u5" }, { id: "u6", userPrincipalName: "u6@x" }]], [G(2), [{ id: "u3" }, { id: "u5" }]], [G(3), [{ id: "u1" }]]]),
    owners: new Map([["e11", { id: "u6", upn: "u6@x", usageLocation: "NL" }], ["e13", { id: "u9", upn: "u9@x", usageLocation: "DE" }], ["e6", { id: "zz", upn: "zz@x", usageLocation: "" }]]),
  });
  const mo = MM.compute(cfg, inO, waves, now);
  const NLo = mo.rows.find((r) => r.suffix === "NL"), DEo = mo.rows.find((r) => r.suffix === "DE"), BRo = mo.rows.find((r) => r.suffix === "NL-Breda");
  const dev = (row, name) => row.devices.find((d) => d.name === name);
  ok("no primary user: its Entra owner's country group takes it, said as by owner", dev(NLo, "NLD5CD5502ZZQ") && dev(NLo, "NLD5CD5502ZZQ").via === "owner" && dev(NLo, "NLD5CD5502ZZQ").owner === "u6@x" && NLo.want.has("e11")
    && /Entra owner u6@x/.test(MM.VIA_TEXT(dev(NLo, "NLD5CD5502ZZQ"))));
  ok("…an owner in no country group: their usage location", dev(DEo, "X-HALL-1") && dev(DEo, "X-HALL-1").via === "location" && DEo.want.has("e13"));
  ok("…no owner: the ISO3 the name starts with (a dash after it or not)", dev(DEo, "DEU-LT-9") && dev(DEo, "DEU-LT-9").via === "name");
  ok("…an owner in no group and no usage location falls to the name; nothing in the name, or a code with no single device group (POL: cities), is left out",
    !mo.rows.some((r) => dev(r, "SHARED") || dev(r, "KIOSK-2") || dev(r, "POL8H2")) && mo.noPrimary === 3 && mo.placed === 3 && mo.leftOut.noPrimary.map((d) => d.name).sort().join() === "KIOSK-2,POL8H2,SHARED");
  const inIND = Object.assign({}, inO, { managed: [{ id: "i1", deviceName: "IND5CD5502ZZQ", userId: "", azureADDeviceId: "AI", lastSyncDateTime: iso(now) }], entra: [{ id: "EI", deviceId: "AI", displayName: "IND5CD5502ZZQ" }], owners: new Map() });
  ok("Mihai's example: IND5CD5502ZZQ, no primary user and no owner read — India, by name", MM.compute(cfg, inIND, waves, now).rows.find((r) => r.suffix === "IN").devices.some((d) => d.name === "IND5CD5502ZZQ" && d.via === "name"));
  ok("…a pilot group never takes a device by owner location or name, only through its users", !dev(BRo, "DEU-LT-9") && !dev(BRo, "X-HALL-1"));
  ok("the owner is no longer a user with no Windows device", !mo.leftOut.users.some((u) => u.id === "u6") && NLo.usersNoDevice === 0);
  ok("a primary user always wins; a name for another country is said, not acted on", dev(NLo, "DEU-LT-7") && dev(NLo, "DEU-LT-7").via === "primary" && dev(NLo, "DEU-LT-7").nameSays === "Germany" && !dev(DEo, "DEU-LT-7")
    && NLo.problems.nameOther === 1 && NLo.problems.byOwner === 1 && DEo.problems.byName === 1);
  ok("the CSV says by what", /NLD5CD5502ZZQ,,.*,Entra owner u6@x \(no Intune primary user\)/.test(MM.csv(mo)) && /DEU-LT-9,,.*its name \(DEU…\)/.test(MM.csv(mo)) && /DEU-LT-7,.*the name says Germany,Intune primary user/.test(MM.csv(mo)));
  // 10659 (Mihai: "these devices have a username in their primary user.
  // extract that name and find the real user"; "in the devicename the
  // country is there … mix and match"): a primary user in no country group
  ok("a deleted user's UPN gives the live one back", MM.realUpnOf("06a64d5023c34c48bc7dda39ce1096caNausad.Ahmed@perfettivanmelle.com") === "Nausad.Ahmed@perfettivanmelle.com"
    && MM.realUpnOf("Nausad.Ahmed@perfettivanmelle.com") === "" && MM.realUpnOf("") === "");
  const BD = "06a64d5023c34c48bc7dda39ce1096caNausad.Ahmed@perfettivanmelle.com";
  const inR = Object.assign({}, input, {
    managed: input.managed.concat([
      { id: "r1", deviceName: "BGD5CD5302DG8", userId: "dead1", userPrincipalName: BD, azureADDeviceId: "R1", lastSyncDateTime: iso(now) },          // deleted, live account not in a group → name BGD
      { id: "r2", deviceName: "5CG0521757", userId: "dead2", userPrincipalName: "1b4ca89aabcc47d9b8f8c21d84955435Scott.Swanson@x.com", azureADDeviceId: "R2", lastSyncDateTime: iso(now) }, // deleted, live account in NL → NL
      { id: "r3", deviceName: "DEU5CD1", userId: "dead3", userPrincipalName: "2fdebda7561244f39a0986596fe3132aAnn@x.com", azureADDeviceId: "R3", lastSyncDateTime: iso(now) },      // deleted, live account in NL, name says DEU → the live account wins
      { id: "r4", deviceName: "5CG9999", userId: "live4", userPrincipalName: "Rocio@x.com", azureADDeviceId: "R4", lastSyncDateTime: iso(now) },                                   // live, no group, usage location DE → DE
      { id: "r5", deviceName: "5CG8888", userId: "dead5", userPrincipalName: "3c4ee60cbc77440da8bcbcd22eef46f1Nobody@x.com", azureADDeviceId: "R5", lastSyncDateTime: iso(now) },  // deleted, no live account, no code → left out
    ]),
    entra: input.entra.concat(["R1", "R2", "R3", "R4", "R5"].map((a) => ({ id: "E" + a, deviceId: a, displayName: a }))),
    usersByGroup: new Map([[G(1), [{ id: "u1" }, { id: "u2" }, { id: "u5" }, { id: "live2", userPrincipalName: "Scott.Swanson@x.com" }, { id: "live3", userPrincipalName: "Ann@x.com" }]], [G(2), [{ id: "u3" }, { id: "u5" }]], [G(3), [{ id: "u1" }]]]),
    primaryUsers: new Map([
      ["dead1", { deleted: true, realUpn: "Nausad.Ahmed@perfettivanmelle.com", id: "live1", upn: "Nausad.Ahmed@perfettivanmelle.com", usageLocation: "", found: true }],
      ["dead2", { deleted: true, realUpn: "Scott.Swanson@x.com", id: "live2", upn: "Scott.Swanson@x.com", usageLocation: "US", found: true }],
      ["dead3", { deleted: true, realUpn: "Ann@x.com", id: "live3", upn: "Ann@x.com", usageLocation: "", found: true }],
      ["live4", { deleted: false, realUpn: "", id: "live4", upn: "Rocio@x.com", usageLocation: "DE", found: true }],
      ["dead5", { deleted: true, realUpn: "Nobody@x.com", id: "", upn: "Nobody@x.com", usageLocation: "", found: false }],
    ]),
  });
  const mr = MM.compute(cfg, inR, waves, now);
  const rowR = (s) => mr.rows.find((r) => r.suffix === s);
  const devR = (s, n) => (rowR(s) ? rowR(s).devices : []).find((d) => d.name === n);
  ok("BGD5CD5302DG8: deleted primary user, live account in no group — Bangladesh by name, the live UPN shown", devR("BD", "BGD5CD5302DG8") && devR("BD", "BGD5CD5302DG8").via === "name"
    && devR("BD", "BGD5CD5302DG8").upn === "Nausad.Ahmed@perfettivanmelle.com" && devR("BD", "BGD5CD5302DG8").deletedUser && rowR("BD").want.has("er1"));
  ok("…a deleted user whose live account is in a country group: that country, by the live account", devR("NL", "5CG0521757") && devR("NL", "5CG0521757").via === "real" && devR("NL", "5CG0521757").userId === "live2");
  ok("…the live account wins over the name", devR("NL", "DEU5CD1") && devR("NL", "DEU5CD1").via === "real" && !devR("DE", "DEU5CD1") && devR("NL", "DEU5CD1").nameSays === "Germany");
  ok("…no code in the name: the live user's usage location", devR("DE", "5CG9999") && devR("DE", "5CG9999").via === "userloc");
  ok("…nothing to go on: still left out, with the live UPN and why", mr.leftOut.noCountry.map((d) => d.name).join() === "5CG8888" && mr.leftOut.noCountry[0].upn === "Nobody@x.com"
    && /no live account/.test(mr.leftOut.noCountry[0].detail) && /no country code in the name/.test(mr.leftOut.noCountry[0].detail));
  ok("…a live account with a device through a deleted one is not a user with no Windows device", !mr.leftOut.users.some((u) => u.id === "live2"));
  ok("…the CSV says by what", /BGD5CD5302DG8,Nausad\.Ahmed@perfettivanmelle\.com,.*deleted primary user — its name \(BGD…\)/.test(MM.csv(mr)) && /5CG0521757,Scott\.Swanson@x\.com,.*live account Scott\.Swanson@x\.com is in this country group/.test(MM.csv(mr)));
  // no lookup at all (a read that failed): the UPN itself still gives the name, and the device name still places it
  const mr2 = MM.compute(cfg, Object.assign({}, inR, { primaryUsers: new Map() }), waves, now);
  ok("…without the lookup the device name still places it, with the live UPN", mr2.rows.find((r) => r.suffix === "BD").devices.some((d) => d.name === "BGD5CD5302DG8" && d.upn === "Nausad.Ahmed@perfettivanmelle.com"));

  ok("groups with the prefix the table does not name are listed", model.unmapped.map((u) => u.group.displayName).join() === "PVM-UG-CORP-MEM-USERS-PL");
  const unm = MM.compute(MM.normConfig({ pilots: [], countryMap: [{ region: "Euro", suffixes: ["NL", "DE"] }] }), input, waves, now).unmapped;
  ok("…and a group extending a mapped one (NL-Breda ⊂ NL) is flagged as an overlap", unm.find((u) => /Breda/.test(u.group.displayName)).overlaps === "PVM-UG-CORP-MEM-USERS-NL");
  const BR = model.rows.find((r) => r.suffix === "NL-Breda");
  ok("the pilot row leads Euro, and its overlap with NL is expected, not a problem", model.regions[0].rows[0] === BR && BR.pilot && BR.devices[0].pilotOverlap === true && BR.problems.multi === 0 && BR.problems.pilot === 1 && NL.problems.pilot === 1 && NL.problems.multi === 1);
  const euro = model.regions.find((r) => r.region === "Euro");
  ok("region totals: what is nested, and how many it brings", euro.ugNested === 1 && euro.dgNested === 1 && euro.users === 3 && euro.devices === 2);

  // --------------------------------------------------------------- plan --
  const all = { fill: true, nestUsers: true, nestDevices: true, removals: false };
  const p1 = MM.planOps(model, new Set(["nl", "de", "gb"]), all, cfg);
  const kinds = (key) => p1.ops.filter((o) => o.key === key).map((o) => o.type).join(",");
  ok("NL (exists, nested): only the adds — removals wait for the tick", kinds("nl") === "add" && p1.ops.find((o) => o.key === "nl").ids.sort().join() === "e2,e5");
  ok("DE, static user groups unread: create → add → nest device; the user nest waits for the read (10680: never the dynamic group)", kinds("de") === "create,add,nest" && p1.skipped.some((x) => /Germany.*static user groups were not read/.test(x)), kinds("de"));
  // 10680 (Mihai: "users groups should be created here next to the device
  // groups. then the option to nest the groups to the wave groups"): with
  // the static user groups read, 👥 creates and fills INT-SG-U-<ISO3> beside
  // the device group and nests the static group, never the source
  {
    const inS = Object.assign({}, input, { userGroups: new Map(), userMembers: new Map(), revertUsers: new Map([["u3", {}]]) });
    const mS = MM.compute(cfg, inS, waves, now);
    const de = mS.rows.find((r) => r.key === "de");
    ok("10680: DE's static user group to create, its users to fill, the reverted one held", de.userGroupStatic === "INT-SG-U-DEU" && !de.sug && de.uAdd.join() === "u5" && de.uHeld === 1 && !de.inSync);
    const pS = MM.planOps(mS, new Set(["de"]), all, cfg);
    const k = pS.ops.map((o) => `${o.type}:${o.name || (o.group && (o.group.name || o.group.ref)) || (o.child && (o.child.name || o.child.ref))}`).join();
    ok("10680: create + fill INT-SG-D-DEU and INT-SG-U-DEU, then nest both static groups", k === "create:INT-SG-D-DEU,add:INT-SG-D-DEU,create:INT-SG-U-DEU,add:INT-SG-U-DEU,nest:INT-SG-U-DEU,nest:INT-SG-D-DEU", k);
    ok("10680: the user nest is the static group, never the PVM source; the Revert hold is warned", pS.ops.filter((o) => o.type === "nest")[0].child.ref === "INT-SG-U-DEU" && !pS.ops.some((o) => o.child && o.child.id === G(2)) && pS.warnings.some((x) => /held back/.test(x)));
    const inN = Object.assign({}, inS, { userGroups: new Map([["int-sg-u-nld", { id: "su-nl", displayName: "INT-SG-U-NLD" }]]), userMembers: new Map([["su-nl", new Set(["u1", "u9"])]]), revertUsers: new Map() });
    const nl = MM.compute(cfg, inN, waves, now).rows.find((r) => r.key === "nl");
    ok("10680: NL nested through its dynamic group is said as such; the static group syncs (+u2 +u5 −u9)", nl.ugNestedSrc && !nl.ugNestedStatic && nl.ugNested && nl.uAdd.join() === "u2,u5" && nl.uRemove.join() === "u9");
    const pN = MM.planOps(MM.compute(cfg, inN, waves, now), new Set(["nl"]), Object.assign({}, all, { removals: true }), cfg);
    ok("10680: NL: add u2 and u5, remove u9 by $batch, no second nest — the swap is named", pN.ops.some((o) => o.type === "add" && o.memberKind === "user" && o.ids.join() === "u2,u5") && pN.ops.some((o) => o.type === "remove" && o.memberKind === "user" && o.batch && o.ids.join() === "u9")
      && !pN.ops.some((o) => o.type === "nest" && o.kind === "user") && pN.skipped.some((x) => /⇄ swap/.test(x)));
  }
  const deNest = p1.ops.filter((o) => o.key === "de" && o.type === "nest");
  ok("the device nest points at the group the run creates", deNest[0].child.ref === "INT-SG-D-DEU" && deNest[0].parent.id === "wd");
  ok("the created group's description names its country group", /PVM-UG-CORP-MEM-USERS-DE/.test(p1.ops.find((o) => o.type === "create").description));
  ok("a country group not in the tenant is left out, with the reason", p1.skipped.some((s) => /United Kingdom.*not in this tenant/.test(s)));
  ok("no removal without the tick; the tick adds it", !p1.hasRemoval && MM.planOps(model, new Set(["nl"]), Object.assign({}, all, { removals: true }), cfg).ops.some((o) => o.type === "remove" && o.ids.join() === "e7"));
  const noWave = MM.planOps(MM.compute(cfg, input, new Map(), now), new Set(["de"]), all, cfg);
  ok("no wave group: the nest is left out and 🌊 is named", noWave.ops.every((o) => o.type !== "nest") && noWave.skipped.filter((s) => /create it in 🌊/.test(s)).length === 2);
  const nestOnly = MM.planOps(model, new Set(["de"]), { fill: false, nestUsers: false, nestDevices: true }, cfg);
  ok("nesting a device group that does not exist, without create & fill: left out, said", !nestOnly.ops.length && /tick "create & fill"/.test(nestOnly.skipped.join()));
  const big = MM.planOps(model, new Set(["de"]), all, Object.assign({}, cfg, { largeNest: 1 }));
  ok("a large nest is warned about", big.warnings.some((x) => /at once/.test(x)));
  const emptyIn = Object.assign({}, input, { usersByGroup: new Map([[G(1), []], [G(2), []]]) });
  const pe = MM.planOps(MM.compute(cfg, emptyIn, waves, now), new Set(["de"]), all, cfg);
  ok("a country with no Windows devices gets no empty device group", !pe.ops.some((o) => o.type === "create") && /not created/.test(pe.skipped.join()));

  // --------------------------------------------------------------- undo --
  const inv = MM.inverseOf([{ type: "create", key: "de", name: "INT-SG-D-DEU", id: "new" }, { type: "add", key: "de", group: { id: "new", name: "INT-SG-D-DEU" }, ids: ["e3"] },
    { type: "remove", key: "nl", group: { id: G(10), name: "INT-SG-D-NLD" }, ids: ["e7"] }, { type: "nest", key: "de", parent: { id: "wd" }, child: { id: "new" }, kind: "device" }]);
  ok("undo reverses what the run did, last first; created groups stay and are said", inv.ops.map((o) => o.type).join() === "unnest,add,remove" && inv.ops[1].ids.join() === "e7" && /left in place/.test(inv.warnings.join()) && inv.hasRemoval);

  // ------------------------------------------------------------- writes --
  MM._setWait(async () => {});
  const calls = [];
  const members = new Map([["g1", new Set()], ["wd", new Set()], ["wu", new Set()]]);
  let refuseOnce = 0;
  w.Graph.patch = async (p, body) => {
    calls.push(["PATCH", p, body["members@odata.bind"].length]);
    if (refuseOnce > 0) { refuseOnce--; throw new Error("The source resource object or one of the objects being referenced don't exist."); }
    const gid = p.split("/").pop();
    const ids = body["members@odata.bind"].map((r) => r.split("/").pop());
    if (ids.some((id) => members.get(gid).has(id.toLowerCase()))) throw new Error("One or more added object references already exist for the following modified properties: 'members'.");
    ids.forEach((id) => members.get(gid).add(id.toLowerCase()));
    return null;
  };
  w.Graph.post = async (p, body) => {
    calls.push(["POST", p]);
    const gid = p.split("/")[2];
    const id = String(body["@odata.id"]).split("/").pop().toLowerCase();
    if (members.get(gid).has(id)) throw new Error("One or more added object references already exist");
    members.get(gid).add(id);
    return null;
  };
  w.Graph.del = async (p) => { calls.push(["DELETE", p]); const [, , gid, , id] = p.split("/"); members.get(gid).delete(decodeURIComponent(id).toLowerCase()); return null; };
  w.Graph.readAll = async (p) => { const gid = p.split("/")[2]; return [...(members.get(gid) || [])].map((id) => ({ id })); };
  const ids45 = Array.from({ length: 45 }, (_, i) => `d${i}`);
  const r1 = await MM.addMembers("g1", ids45);
  ok("45 devices go in three PATCHes of at most 20", r1.done.length === 45 && calls.filter((c) => c[0] === "PATCH").map((c) => c[2]).join() === "20,20,5");
  calls.length = 0;
  const r2 = await MM.addMembers("g1", ["d1", "x1", "x2"]);
  ok("a chunk refused because one is in already goes one by one; the one in counts as done", r2.done.sort().join() === "d1,x1,x2" && calls.filter((c) => c[0] === "POST").length === 3);
  calls.length = 0; refuseOnce = 2;
  const r3 = await MM.addMembers("g1", ["y1"]);
  ok("a new group that has not replicated yet is retried", r3.done.join() === "y1" && calls.filter((c) => c[0] === "PATCH").length === 3);
  const r4 = await MM.removeMembers("g1", ["y1", "x1"]);
  ok("removes go one DELETE each", r4.done.length === 2 && !members.get("g1").has("y1"));

  // applyOps: create (stubbed), fill, nest — the ledger's order, read back
  let createdWith = null;
  w.MdeRollout.createWave = async (name, desc, me) => { createdWith = { name, desc, me }; members.set("newg", new Set()); return { created: true, group: { id: "newg", displayName: name }, verified: true, ownerVerified: true }; };
  const events = [];
  const ledger = { stopped: false, start: (i) => events.push(`start${i}`), done: (i, n, l) => events.push(`done${i}:${l}`), fail: (i, why, l) => events.push(`fail${i}:${l || why}`), skip: (i) => events.push(`skip${i}`) };
  // the runner's own checks, on the step shape the plan used to make before
  // 10680 (a user nest of a group by id beside the created device group)
  const planDE0 = MM.planOps(model, new Set(["de"]), all, cfg);
  const planDE = { ops: planDE0.ops.slice(0, 2).concat([{ type: "nest", key: "de", parent: { id: "wu", name: "INT-SG-U-WAVE-Euro" }, child: { id: G(2), name: "PVM-UG-CORP-MEM-USERS-DE" }, kind: "user" }], planDE0.ops.slice(2)) };
  const res = await MM.applyOps(planDE.ops, { ledger, me: { id: "me" } });
  ok("the group is created with the signed-in admin as owner", createdWith && createdWith.name === "INT-SG-D-DEU" && createdWith.me.id === "me");
  ok("every step done and verified", res.results.length === 4 && res.results.every((x) => x.ok && x.verified), JSON.stringify(res.results.map((x) => x.note)));
  ok("the fill went to the created group, the nest linked it into the device wave", members.get("newg").has("e3") && members.get("wd").has("newg") && members.get("wu").has(G(2)));
  ok("the run's record is what it did — the undo's input", res.done.map((d) => d.type).join() === "create,add,nest,nest" && res.done[1].group.id === "newg");
  // a failed create stops what depends on it, not the rest
  w.MdeRollout.createWave = async () => { throw new Error("Insufficient privileges"); };
  const res2 = await MM.applyOps(planDE.ops, { ledger });
  ok("a refused create fails its fill and its device nest; the user nest still runs", !res2.results[0].ok && !res2.results[1].ok && /not created/.test(res2.results[1].note) && res2.results[2].ok && !res2.results[3].ok);
  // 10649: a step that needs an earlier one clean is skipped when it was not
  members.set("pil", new Set(["d7"]));
  const res3 = await MM.applyOps([{ type: "create", key: "x", name: "INT-SG-D-XXX", description: "" }, { type: "add", key: "x", group: { ref: "INT-SG-D-XXX", name: "INT-SG-D-XXX" }, ids: ["d7"] },
    { type: "remove", key: "p", group: { id: "pil", name: "INT-SG-D-Win-Pilot" }, ids: ["d7"], needsOk: [1] }], { ledger });
  ok("needsOk: the add never happened, so the device stays in the pilot", !res3.results[2].ok && res3.results[2].skipped && /depends/.test(res3.results[2].note) && members.get("pil").has("d7"));
  w.MdeRollout.createWave = async (name) => { members.set("newx", new Set()); return { created: true, group: { id: "newx", displayName: name }, verified: true, ownerVerified: true }; };
  const res4 = await MM.applyOps([{ type: "create", key: "x", name: "INT-SG-D-XXX", description: "" }, { type: "add", key: "x", group: { ref: "INT-SG-D-XXX", name: "INT-SG-D-XXX" }, ids: ["d7"] },
    { type: "remove", key: "p", group: { id: "pil", name: "INT-SG-D-Win-Pilot" }, ids: ["d7"], needsOk: [1] }], { ledger, me: { id: "me" } });
  ok("needsOk: …and once it read back clean, the device leaves the pilot", res4.results.every((x) => x.ok) && members.get("newx").has("d7") && !members.get("pil").has("d7"));

  // patchInput moves the model without a re-read
  const inp2 = JSON.parse(JSON.stringify({ deviceGroups: [] }));
  inp2.deviceMembers = new Map(); inp2.waveChildren = new Map();
  MM.patchInput(inp2, [{ type: "add", group: { id: "NEWG" }, ids: ["E3"] }, { type: "nest", parent: { id: "WD" }, child: { id: "NEWG" } }], [{ id: "NEWG", displayName: "INT-SG-D-DEU" }]);
  ok("patchInput: the created group, its members and its nest", inp2.deviceGroups.length === 1 && inp2.deviceMembers.get("newg").has("e3") && inp2.waveChildren.get("wd").has("newg"));

  // ------------------------------------------- 🧪 pilot batches (10640) --
  // Mihai: "split the adding of the pilot group in 4 even batches of users
  // and devices" — option A: users straight into the wave, the device group
  // follows them, the group nested at the end.
  ok("the default: NL-Breda in 4 batches", cfg.batched.join() === "NL-Breda" && cfg.batchCount === 4 && MM.normConfig({ batchCount: 99 }).batchCount === 4);
  const bUsers = Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, userPrincipalName: `user${String(i).padStart(2, "0")}@contoso.com` }));
  const bInput = {
    countryGroups: [{ id: "gnl", displayName: "PVM-UG-CORP-MEM-USERS-NL" }, { id: "gbr", displayName: "PVM-UG-CORP-MEM-USERS-NL-Breda" }],
    deviceGroups: [],
    usersByGroup: new Map([["gbr", bUsers.concat([{ id: "u1", userPrincipalName: "a-first@contoso.com" }])], ["gnl", [{ id: "u1" }]]]),
    managed: bUsers.map((u, i) => ({ id: `mb${i}`, deviceName: `BR-${i}`, userId: u.id, azureADDeviceId: `AB${i}`, lastSyncDateTime: iso(now) }))
      .concat([{ id: "mx", deviceName: "BR-NOENTRA", userId: "b1", azureADDeviceId: "ABX", lastSyncDateTime: iso(now) }]),
    entra: bUsers.map((u, i) => ({ id: `EB${i}`, deviceId: `AB${i}`, displayName: `BR-${i}` })),
    deviceMembers: new Map(), waveChildren: new Map([["wu", new Set(["gnl"])]]), waveUsers: new Map([["wu", new Set()]]),
    userGroups: new Map(), userMembers: new Map(), revertUsers: new Map(),   // 10681: the static user groups read
    failed: [], readAt: now,
  };
  const bcfg = MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["NL-Breda", "NL"] }], pilots: ["NL-Breda"] });
  let bm = MM.compute(bcfg, bInput, waves, now);
  let BRr = bm.rows.find((r) => r.suffix === "NL-Breda");
  ok("ten users to batch; the one in the wave through NL is left out of the batches", BRr.batch.N === 10 && BRr.batch.inOther === 1 && BRr.batch.viaNames.join() === "PVM-UG-CORP-MEM-USERS-NL");
  ok("four even parts: 3, 3, 2, 2 — sorted by UPN", BRr.batch.sizes.join() === "3,3,2,2" && BRr.batch.batches[0].users.map((u) => u.upn.slice(0, 6)).join() === "user00,user01,user02");
  ok("batch 1 is next, the rest wait", BRr.batch.next.n === 1 && BRr.batch.batches.slice(1).every((b) => b.state === "waiting"));
  ok("the device group follows its users: nothing is wanted before batch 1", BRr.want.size === 0 && BRr.devices.length === 11);
  const pb = MM.planBatch(bm, BRr.key, bcfg);
  // 10681 (Mihai, off batch 1's plan: "the breda pilot. where is user groups
  // creation?"): a batch goes into the pilot's STATIC user group, created on
  // batch 1 and nested in the user wave — never straight into the wave
  ok("batch 1: INT-SG-U-NLD-BREDA created, three users in it, nested in the user wave; the device group created, filled, nested", pb.ops.map((o) => o.type).join() === "create,add,nest,create,add,nest"
    && pb.ops[0].name === "INT-SG-U-NLD-BREDA" && pb.ops[1].memberKind === "user" && pb.ops[1].group.ref === "INT-SG-U-NLD-BREDA" && pb.ops[1].ids.join() === "b0,b1,b2"
    && pb.ops[2].child.ref === "INT-SG-U-NLD-BREDA" && pb.ops[2].parent.name === "INT-SG-U-WAVE-Euro" && pb.ops[2].needsOk.join() === "0,1"
    && pb.ops[4].ids.join() === "eb0,eb1,eb2" && pb.ops[5].parent.name === "INT-SG-D-WAVE-Euro" && pb.batch === 1 && !pb.hasRemoval, pb.ops.map((o) => o.type).join());
  ok("…nothing goes straight into the wave", !pb.ops.some((o) => o.type === "add" && o.group.name === "INT-SG-U-WAVE-Euro"));
  ok("…a batch device with no Entra object is left out with the reason", pb.skipped.some((x) => /BR-NOENTRA/.test(x)));
  const regular = MM.planOps(bm, new Set([BRr.key]), all, bcfg);
  ok("the regular sync neither nests nor fills a batched pilot's user group", regular.skipped.some((x) => /added in batches/.test(x)) && !regular.ops.some((o) => o.memberKind === "user" || o.kind === "user"));
  // the run lands: the static group made, filled and nested; the device group likewise
  bInput.userGroups.set("int-sg-u-nld-breda", { id: "sbr", displayName: "INT-SG-U-NLD-BREDA" }); bInput.userMembers.set("sbr", new Set(["b0", "b1", "b2"])); bInput.waveChildren.get("wu").add("sbr");
  bInput.deviceGroups.push({ id: "gdb", displayName: "INT-SG-D-NLD-BREDA" }); bInput.deviceMembers.set("gdb", new Set(["eb0", "eb1", "eb2"])); bInput.waveChildren.set("wd", new Set(["gdb"]));
  bm = MM.compute(bcfg, bInput, waves, now); BRr = bm.rows.find((r) => r.suffix === "NL-Breda");
  ok("after batch 1: 3 of 10 in through the static group, batch 2 next, both groups in sync", BRr.batch.inCount === 3 && BRr.batch.staticNested && BRr.batch.batches[0].state === "in" && BRr.batch.next.n === 2 && BRr.inSync && BRr.dgNested && !BRr.batch.finished);
  // a user leaves the group before batch 2: the next batch is cut from who is left
  bInput.usersByGroup.set("gbr", bInput.usersByGroup.get("gbr").filter((u) => u.id !== "b9"));
  bm = MM.compute(bcfg, bInput, waves, now); BRr = bm.rows.find((r) => r.suffix === "NL-Breda");
  ok("someone leaves: nine to batch, the parts become 3, 2, 2, 2 and batch 1 stays in", BRr.batch.N === 9 && BRr.batch.sizes.join() === "3,2,2,2" && BRr.batch.batches[0].state === "in" && BRr.batch.next.n === 2 && BRr.batch.next.toAdd.length === 2);
  const pb2 = MM.planBatch(bm, BRr.key, bcfg);
  ok("batch 2: two users into the existing static group, no create, no second nest", pb2.ops.filter((o) => o.memberKind === "user").map((o) => `${o.type}:${o.group.id}:${o.ids.join("+")}`).join() === "add:sbr:b3+b4" && !pb2.ops.some((o) => o.type === "create" || (o.type === "nest" && o.kind === "user")));
  // every batch in → finished, nothing left to do
  ["b3", "b4", "b5", "b6", "b7", "b8"].forEach((id) => bInput.userMembers.get("sbr").add(id));
  bm = MM.compute(bcfg, bInput, waves, now); BRr = bm.rows.find((r) => r.suffix === "NL-Breda");
  ok("all in the static group: finished, no next batch, the device group wants every device", BRr.batch.finished && !BRr.batch.next && BRr.batch.inCount === 9 && MM.planBatch(bm, BRr.key, bcfg).ops.length === 0 && BRr.want.size === 9);
  // an earlier build put batches straight into the wave: they move into the static group
  const legIn = Object.assign({}, bInput, { userGroups: new Map(), userMembers: new Map(), waveChildren: new Map([["wu", new Set(["gnl"])], ["wd", new Set(["gdb"])]]), waveUsers: new Map([["wu", new Set(["b0", "b1", "b2"])]]) });
  let legM = MM.compute(bcfg, legIn, waves, now), legR = legM.rows.find((r) => r.suffix === "NL-Breda");
  ok("legacy: three put in directly count as in; batch 2 is next", legR.batch.inCount === 3 && legR.batch.next.n === 2 && legR.batch.direct.length === 3);
  const pl = MM.planBatch(legM, legR.key, bcfg);
  ok("legacy batch 2: the static group gets batches 1 and 2, is nested, then the three come out of the wave's direct members — typed", pl.ops.slice(0, 4).map((o) => o.type).join() === "create,add,nest,remove" && pl.ops[1].ids.length === 5
    && pl.ops[3].group.name === "INT-SG-U-WAVE-Euro" && pl.ops[3].ids.join() === "b0,b1,b2" && pl.ops[3].needsOk.join() === "2" && pl.hasRemoval);
  ["b3", "b4", "b5", "b6", "b7", "b8"].forEach((id) => legIn.waveUsers.get("wu").add(id));
  legM = MM.compute(bcfg, legIn, waves, now); legR = legM.rows.find((r) => r.suffix === "NL-Breda");
  const pf = MM.planFinish(legM, legR.key, bcfg);
  ok("legacy finish: create and fill INT-SG-U-NLD-BREDA, nest it, then the nine direct users out once all read back — typed", pf.ops.map((o) => o.type).join() === "create,add,nest,remove" && pf.ops[0].name === "INT-SG-U-NLD-BREDA" && pf.ops[1].ids.length === 10
    && pf.ops[2].child.ref === "INT-SG-U-NLD-BREDA" && pf.ops[2].needsOk.join() === "0,1" && pf.ops[3].memberKind === "user" && pf.ops[3].ids.length === 9 && pf.ops[3].needsOk.join() === "0,1,2" && pf.hasRemoval);
  // a static group filled whole by an earlier "create & fill", not in the wave: cut back before the nest
  const fInput = Object.assign({}, legIn, { userGroups: new Map([["int-sg-u-nld-breda", { id: "sbr", displayName: "INT-SG-U-NLD-BREDA" }]]), userMembers: new Map([["sbr", new Set(bUsers.map((u) => u.id).concat("u1"))]]), waveUsers: new Map([["wu", new Set()]]) });
  const fm = MM.compute(bcfg, fInput, waves, now), FR = fm.rows.find((r) => r.suffix === "NL-Breda");
  const pfill = MM.planBatch(fm, FR.key, bcfg);
  ok("a static group filled whole and not nested: batch 1 takes the rest out first, so the nest brings in batch 1 only", FR.batch.inCount === 0 && pfill.ops[0].type === "remove" && pfill.ops[0].group.id === "sbr" && pfill.ops[0].ids.length === 8
    && pfill.ops[1].type === "nest" && pfill.ops[1].needsOk.join() === "0" && pfill.hasRemoval, pfill.ops.map((o) => o.type).join());
  ok("the batches CSV: a header and one line per user, with their devices", MM.batchCsv(BRr).split("\r\n").length === 10 && /^Batch,State,User,Devices/.test(MM.batchCsv(BRr)) && /user00@contoso\.com,BR-0/.test(MM.batchCsv(BRr)));
  MM.patchInput(bInput, [{ type: "remove", group: { id: "WU" }, ids: ["b0"], memberKind: "user" }]);
  ok("patchInput moves a wave's direct users", !bInput.waveUsers.get("wu").has("b0"));
  ok("not batched: a pilot is nested whole, as before", MM.compute(MM.normConfig({ countryMap: bcfg.countryMap, pilots: ["NL-Breda"], batched: [] }), bInput, waves, now).rows.find((r) => r.suffix === "NL-Breda").batch === null);

  // --------------------------- 🧪 migrate the pilot at go-live (10656) --
  // Mihai: "the NL-Breda users should be excluded when NL goes live, or
  // better there should be a migrate to wave for the pilot users"; option B.
  const mUsers = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, userPrincipalName: `m${i}@contoso.com` }));
  const mInput = {
    countryGroups: [{ id: "gnl", displayName: "PVM-UG-CORP-MEM-USERS-NL" }, { id: "gbr", displayName: "PVM-UG-CORP-MEM-USERS-NL-Breda" }],
    deviceGroups: [{ id: "gdb", displayName: "INT-SG-D-NLD-BREDA" }],
    usersByGroup: new Map([["gbr", mUsers.slice(0, 6)], ["gnl", mUsers]]),
    managed: mUsers.map((u, i) => ({ id: `mm${i}`, deviceName: `NL-${i}`, userId: u.id, azureADDeviceId: `AM${i}`, lastSyncDateTime: iso(now) })),
    entra: mUsers.map((u, i) => ({ id: `EM${i}`, deviceId: `AM${i}`, displayName: `NL-${i}` })),
    deviceMembers: new Map([["gdb", new Set(["em0", "em1"])]]), waveChildren: new Map([["wu", new Set()], ["wd", new Set(["gdb"])]]), waveUsers: new Map([["wu", new Set(["m0", "m1"])]]),
    userGroups: new Map(), userMembers: new Map(), revertUsers: new Map(),   // 10680: the static user groups read
    failed: [], readAt: now,
  };
  const mcfgB = MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["NL-Breda", "NL"] }], pilots: ["NL-Breda"] });
  let mmod = MM.compute(mcfgB, mInput, waves, now);
  const mBR = mmod.rows.find((r) => r.suffix === "NL-Breda"), mNL = mmod.rows.find((r) => r.suffix === "NL");
  ok("🧪 the pilot knows the country it overlaps", mBR.parentKey === mNL.key && mBR.parentCountry === "Netherlands" && !mBR.migrated && mBR.batch.inCount === 2 && mBR.batch.N === 6);
  const mp = MM.planOps(mmod, new Set([mNL.key]), all, mcfgB);
  const ix = (f) => mp.ops.findIndex(f);
  const uNest = ix((o) => o.type === "nest" && o.kind === "user" && o.key === mNL.key), dNest = ix((o) => o.type === "nest" && o.kind === "device" && o.key === mNL.key), dAdd = ix((o) => o.type === "add" && o.memberKind !== "user" && o.key === mNL.key);
  const rmU = mp.ops.find((o) => o.migrate && o.type === "remove"), unD = mp.ops.find((o) => o.migrate && o.type === "unnest");
  ok("🧪 NL goes live: NL's own steps first, then Breda migrated — its direct users out once NL's user group is read back in the wave",
    uNest >= 0 && dNest >= 0 && dAdd >= 0 && rmU && rmU.ids.sort().join() === "m0,m1" && rmU.memberKind === "user" && rmU.group.name === "INT-SG-U-WAVE-Euro" && rmU.needsOk.join() === String(uNest) && mp.ops.indexOf(rmU) > uNest);
  ok("🧪 …and INT-SG-D-NLD-BREDA out of the device wave once INT-SG-D-NLD is filled and nested", unD && unD.kind === "device" && unD.child.name === "INT-SG-D-NLD-BREDA" && unD.needsOk.sort().join() === [dNest, dAdd].sort().join());
  ok("🧪 …the waiting users said, typed REMOVE, the migration named for the screen", mp.warnings.some((w) => /4 NL Breda users not in a batch yet come in with Netherlands at once/.test(w)) && mp.hasRemoval
    && mp.migrate.length === 1 && mp.migrate[0].suffix === "NL-Breda" && mp.migrate[0].into === "Netherlands" && mp.migrate[0].ops.length === 2, JSON.stringify(mp.warnings));
  const mpNo = MM.planOps(mmod, new Set([mNL.key]), Object.assign({}, all, { nestUsers: false }), mcfgB);
  ok("🧪 NL's user group not going in: no migration, and why", !mpNo.ops.some((o) => o.migrate) && mpNo.skipped.some((x) => /migrated into the wave only when PVM-UG-CORP-MEM-USERS-NL goes into it/.test(x)) && !mpNo.migrate.length);
  // NL already live (the button on Breda's panel): the migration alone, with nothing to wait on
  mInput.waveChildren.get("wu").add("gnl");
  mInput.deviceGroups.push({ id: "gnld", displayName: "INT-SG-D-NLD" }); mInput.deviceMembers.set("gnld", new Set(mUsers.map((u, i) => `em${i}`))); mInput.waveChildren.get("wd").add("gnld");
  mmod = MM.compute(mcfgB, mInput, waves, now);
  const mp2 = MM.planOps(mmod, new Set([mmod.rows.find((r) => r.suffix === "NL").key]), all, mcfgB);
  ok("🧪 NL already live (through its dynamic group): Breda's two steps with nothing to wait on, beside INT-SG-U-NLD created and filled (10680)", mp2.ops.filter((o) => o.migrate).length === 2 && mp2.ops.filter((o) => o.migrate).every((o) => !o.needsOk)
    && mp2.ops.filter((o) => !o.migrate).map((o) => `${o.type}:${o.name || o.group.ref}`).join() === "create:INT-SG-U-NLD,add:INT-SG-U-NLD" && !mp2.warnings.some((w) => /not in a batch yet/.test(w)));
  const migCfg = MM.normConfig(Object.assign({}, mcfgB, { batched: [], migrated: ["NL-Breda"] }));
  const mm3 = MM.compute(migCfg, mInput, waves, now);
  ok("🧪 migrated: listed, never planned again", mm3.rows.find((r) => r.suffix === "NL-Breda").migrated && MM.planOps(mm3, new Set(mm3.rows.map((r) => r.key)), all, migCfg).skipped.some((x) => /migrated into Netherlands/.test(x))
    && !MM.planOps(mm3, new Set(mm3.rows.map((r) => r.key)), all, migCfg).ops.some((o) => o.key === "nl-breda"));
  ok("🧪 the default has nothing migrated", MM.normConfig(null).migrated.length === 0);
  mInput.usersByGroup.set("gbr", mUsers.slice(0, 6).concat([{ id: "x9", userPrincipalName: "outside@contoso.com" }]));
  const mm4 = MM.compute(mcfgB, mInput, waves, now), mp4 = MM.planOps(mm4, new Set(["nl"]), all, mcfgB);
  ok("🧪 a pilot user the country does not hold: no migration — they would leave the wave — and why", mm4.rows.find((r) => r.suffix === "NL-Breda").outsideParent.join() === "outside@contoso.com"
    && !mp4.ops.some((o) => o.migrate) && !mp4.migrate.length && mp4.skipped.some((x) => /not migrated — 1 of its users is not in PVM-UG-CORP-MEM-USERS-NL \(outside@contoso\.com\)/.test(x)));

  // ------------------------------------------------ 🕳 left out (10642) --
  const lInput = {
    countryGroups: [{ id: "gnl", displayName: "PVM-UG-CORP-MEM-USERS-NL" }], deviceGroups: [],
    usersByGroup: new Map([["gnl", [{ id: "u1", userPrincipalName: "u1@x" }, { id: "u7", userPrincipalName: "u7@x" }, { id: "u8", userPrincipalName: "u8@x" }]]]),
    managedAll: [
      { id: "w1", deviceName: "WIN-U1", userId: "u1", azureADDeviceId: "A1", lastSyncDateTime: iso(now), operatingSystem: "Windows" },
      { id: "w11", deviceName: "WIN-U1-NOENTRA", userId: "u1", azureADDeviceId: "AX", lastSyncDateTime: iso(now), operatingSystem: "Windows" },
      { id: "mac7", deviceName: "MAC-U7", userId: "u7", azureADDeviceId: "A7", lastSyncDateTime: iso(now), operatingSystem: "macOS" },
      { id: "ios7", deviceName: "IPHONE-U7", userId: "u7", azureADDeviceId: "", lastSyncDateTime: iso(now), operatingSystem: "iOS" },
      { id: "w9", deviceName: "WIN-U9", userId: "u9", userPrincipalName: "u9@x", azureADDeviceId: "A9", lastSyncDateTime: iso(now), operatingSystem: "Windows" },
      { id: "w10", deviceName: "WIN-NOUSER", userId: "", azureADDeviceId: "A10", lastSyncDateTime: iso(now - 60 * day), operatingSystem: "Windows" },
    ],
    entra: [{ id: "E1", deviceId: "A1" }, { id: "E9", deviceId: "A9" }, { id: "E10", deviceId: "A10" }],
    deviceMembers: new Map(), waveChildren: new Map(), waveUsers: new Map(), held: new Set(["e1"]), failed: [], readAt: now,
  };
  lInput.managed = lInput.managedAll.filter((m) => m.operatingSystem === "Windows");
  const lm = MM.compute(MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["NL"] }], pilots: [], batched: [] }), lInput, new Map(), now);
  const LO = lm.leftOut;
  ok("left out: the country's users with no Windows device, with what Intune has for them", LO.users.map((u) => u.upn).join() === "u7@x,u8@x" && LO.users[0].has.macOS === 1 && LO.users[0].has.iOS === 1 && Object.keys(LO.users[1].has).length === 0 && LO.users[0].country === "Netherlands");
  ok("…a Windows device whose primary user is in no country group", LO.noCountry.map((d) => d.name).join() === "WIN-U9");
  ok("…a Windows device with no primary user (stale said)", LO.noPrimary.map((d) => d.name).join() === "WIN-NOUSER" && LO.noPrimary[0].stale);
  ok("…a country's device with no Entra object, and one in the exclusion group", LO.noEntra.map((d) => d.name).join() === "WIN-U1-NOENTRA" && LO.held.map((d) => d.name).join() === "WIN-U1");
  const loc = MM.leftOutCsv(lm, "Euro");
  ok("the left-out CSV: a line per user and device, with the reason", loc.split("\r\n").length === 7 && /u7@x,,no Windows device \(Intune primary user\),macOS 1 · iOS 1/.test(loc) && /u8@x,,no Windows device.*nothing in Intune/.test(loc) && /WIN-NOUSER,no primary user/.test(loc));

  // ------------------------------------------------------ 🧪 pilots (10647) --
  // Mihai: "identify the pilot users and devices to a wave … remove them
  // from the pilot and be sure that they are then in their wave" (option A)
  const pIn = Object.assign({}, input, {
    pilots: [
      { id: "p1", name: "INT-SG-D-Win-Pilot", users: [], groups: [{ id: "gx", name: "NESTED-PILOT" }],
        devices: [{ id: "e1", deviceId: "a1", name: "NL-1" }, { id: "e2", deviceId: "a2", name: "NL-2" }, { id: "e3", deviceId: "a3", name: "DE-1" }, { id: "e6", deviceId: "a6", name: "SHARED" }] },
      { id: "p2", name: "INT-SG-U-Win-Pilot", devices: [{ id: "e1", deviceId: "a1", name: "NL-1" }], groups: [],
        users: [{ id: "u1", upn: "u1@x", name: "U1" }, { id: "u3", upn: "u3@x", name: "U3" }, { id: "u9", upn: "u9@x", name: "U9" }] }],
    pilotsMissing: ["INT-SG-U-Win-Pre-Pilot"] });
  const pm = MM.compute(cfg, pIn, waves, now).pilots;
  const pmx = (kind, id) => pm.members.find((x) => x.kind === kind && x.id === id);
  ok("🧪 a pilot device in its country device group, nested in the device wave: in, through INT-SG-D-NLD, both pilot groups named once",
    pmx("device", "e1").state === "in" && pmx("device", "e1").waveName === "INT-SG-D-WAVE-Euro" && /INT-SG-D-NLD/.test(pmx("device", "e1").via) && pmx("device", "e1").groups.map((g) => g.name).join() === "INT-SG-D-Win-Pilot,INT-SG-U-Win-Pilot");
  ok("🧪 a device its group wants but does not hold yet: waiting, the next Apply adds it", pmx("device", "e2").state === "wait" && /not in INT-SG-D-NLD yet — the next 👥 Apply adds it/.test(pmx("device", "e2").why));
  ok("🧪 a device whose country has no device group: waiting, said", pmx("device", "e3").state === "wait" && /INT-SG-D-DEU does not exist yet/.test(pmx("device", "e3").why));
  ok("🧪 no primary user, or a nested group: no wave", pmx("device", "e6").state === "none" && /no Intune primary user/.test(pmx("device", "e6").why) && pmx("group", "gx").state === "none" && /nested group/.test(pmx("group", "gx").why));
  ok("🧪 users: in through the nested country group; waiting when it is not nested; none outside the table",
    pmx("user", "u1").state === "in" && /PVM-UG-CORP-MEM-USERS-NL/.test(pmx("user", "u1").via) && pmx("user", "u1").waveName === "INT-SG-U-WAVE-Euro"
    && pmx("user", "u3").state === "wait" && /PVM-UG-CORP-MEM-USERS-DE is not nested in INT-SG-U-WAVE-Euro yet/.test(pmx("user", "u3").why)
    && pmx("user", "u9").state === "none" && /no country group/.test(pmx("user", "u9").why));
  ok("🧪 a pilot group missing from the tenant is said", pm.missing.join() === "INT-SG-U-Win-Pre-Pilot");
  // 10649 (Mihai: "select the user, and it then should be removed from the
  // pilot groups and the device should be moved to the right group"; A)
  const pp1 = (k) => pm.people.find((p) => p.key === k);
  ok("🧪 one row per person: pilot users, and the primary users of pilot devices, with every Windows device of theirs",
    pm.people.map((p) => p.userId).sort().join() === "u1,u2,u3,u9" && pp1("p|u1").devices.map((d) => d.name).join() === "NL-1" && pp1("p|u1").devices[0].pilots.length === 2
    && pp1("p|u3").devices.map((d) => d.name).sort().join() === "DE-1,DE-NOENTRA" && pp1("p|u2").userPilots.length === 0 && pp1("p|u2").devices[0].pilots[0].name === "INT-SG-D-Win-Pilot");
  ok("🧪 a person with a country is ready; one in no country group stays; a device with no primary user and a nested group are loose",
    pp1("p|u1").state === "ready" && pp1("p|u1").deviceGroupName === "INT-SG-D-NLD" && pp1("p|u3").state === "ready" && !pp1("p|u3").dg
    && pp1("p|u9").state === "none" && /no country group/.test(pp1("p|u9").why) && pm.loose.map((x) => x.id).sort().join() === "e6,gx");
  const pr = MM.planPilotsReady(pm, ["p|u1", "p|u2", "p|u3", "p|u9"], cfg);
  const prOp = (f) => pr.ops.findIndex(f);
  const iAddNL = prOp((o) => o.type === "add" && o.group.name === "INT-SG-D-NLD"), iCreateDE = prOp((o) => o.type === "create" && o.name === "INT-SG-D-DEU"), iAddDE = prOp((o) => o.type === "add" && o.group.name === "INT-SG-D-DEU");
  ok("🧪 ready for the wave: NL-2 into INT-SG-D-NLD; INT-SG-D-DEU created, then DE-1 into it; NL-1 already there is not added again",
    iAddNL >= 0 && pr.ops[iAddNL].ids.join() === "e2" && iCreateDE >= 0 && iAddDE > iCreateDE && pr.ops[iAddDE].ids.join() === "e3" && !pr.ops.some((o) => o.type === "add" && o.ids.includes("e1")));
  ok("🧪 …the devices leave their pilot groups after the adds, each waiting for its own country's add; NL-1 (already in) waits for nothing",
    pr.ops.filter((o) => o.type === "remove" && o.memberKind === "device").every((o) => pr.ops.indexOf(o) > iAddDE)
    && pr.ops.find((o) => o.type === "remove" && o.ids.includes("e3")).needsOk.join() === String(iAddDE)
    && pr.ops.find((o) => o.type === "remove" && o.ids.includes("e2")).needsOk.join() === String(iAddNL)
    && pr.ops.filter((o) => o.type === "remove" && o.ids.includes("e1")).every((o) => !o.needsOk) && pr.ops.filter((o) => o.type === "remove" && o.ids.includes("e1")).length === 2);
  ok("🧪 …the users leave the user pilot last; the person with no country is left out with the reason; it removes, so REMOVE is typed",
    pr.ops[pr.ops.length - 1].memberKind === "user" && pr.ops[pr.ops.length - 1].ids.sort().join() === "u1,u3" && pr.skipped.length === 1 && /no country group/.test(pr.skipped[0]) && pr.hasRemoval && pr.pilotsReady);
  MM.patchInput(pIn, [{ type: "remove", group: { id: "p1", name: "INT-SG-D-Win-Pilot" }, ids: ["e1"], memberKind: "device" }], []);
  const pm2 = MM.compute(cfg, pIn, waves, now).pilots;
  ok("🧪 a verified removal moves the list: e1 now only in the user pilot", pm2.members.find((x) => x.id === "e1").groups.map((g) => g.name).join() === "INT-SG-U-Win-Pilot");
  MM.patchInput(pIn, [{ type: "add", group: { id: "p1", name: "INT-SG-D-Win-Pilot" }, ids: ["e1"], memberKind: "device", objs: [{ id: "e1", name: "NL-1" }] }], []);
  ok("🧪 …and an undo puts it back, with its name", MM.compute(cfg, pIn, waves, now).pilots.members.find((x) => x.id === "e1").groups.length === 2 && pIn.pilots[0].devices.some((d) => d.id === "e1" && d.name === "NL-1"));
  ok("🧪 no pilot groups configured or read: no pilot view", MM.compute(cfg, input, waves, now).pilots === null);

  // ------------------------------------------------------ 🔎 logons (10648) --
  const kql = MM.logonKql([{ id: "x1", upn: "Jan.Smit@x.com", sid: "S-1-5-21-9", sam: "JSMIT" }, { id: "x2", upn: 'o"b@x.com' }]);
  ok("🔎 the KQL: SIDs and names (sAMAccountName and the UPN's prefix, lower case), quotes escaped, 30 days, successful interactive logons",
    /let sids = dynamic\(\["S-1-5-21-9"\]\);/.test(kql) && /let names = dynamic\(\["jsmit", "jan\.smit", "o\\"b"\]\);/.test(kql) && /ago\(30d\)/.test(kql) && /ActionType == "LogonSuccess"/.test(kql) && /"Unlock"/.test(kql) && /AccountSid in~ \(sids\)/.test(kql), kql);
  const hunt = [
    { AccountName: "jsmit", AccountSid: "", DeviceId: "d1", DeviceName: "nl-1.corp.local", LastLogon: iso(now - 3 * day), Logons: 2, AadDeviceId: "A1" },
    { AccountName: "whatever", AccountSid: "S-1-5-21-9", DeviceId: "d1", DeviceName: "nl-1.corp.local", LastLogon: iso(now - day), Logons: 5, AadDeviceId: "A1" },
    { AccountName: "jan.smit", AccountSid: "", DeviceId: "d6", DeviceName: "SHARED", LastLogon: iso(now - 2 * day), Logons: 1, AadDeviceId: "A6" },
    { AccountName: "jan.smit", AccountSid: "", DeviceId: "d7", DeviceName: "old-us.corp.local", LastLogon: iso(now - 4 * day), Logons: 1, AadDeviceId: "A7" },
    { AccountName: "jan.smit", AccountSid: "", DeviceId: "d9", DeviceName: "lab-9", LastLogon: iso(now - 5 * day), Logons: 4, AadDeviceId: "" },
    { AccountName: "someone.else", AccountSid: "", DeviceId: "d3", DeviceName: "de-1", LastLogon: iso(now), Logons: 9, AadDeviceId: "A3" },
  ];
  const lg = MM.logonsFor(input, model.rows, [{ id: "x1", upn: "Jan.Smit@x.com", sid: "S-1-5-21-9", sam: "JSMIT" }, { id: "x3", upn: "nobody@x.com" }], hunt).get("x1");
  ok("🔎 one line per device (a SID and a name match on one device add up), newest first, nobody else's logons", lg.map((x) => x.device).join() === "nl-1,SHARED,old-us,lab-9" && lg[0].logons === 7 && lg[0].last === iso(now - day));
  ok("🔎 a device in Intune under another primary user, already in the wave through its country's device group", lg[0].kind === "intune" && lg[0].inWave && /primary user .* \(Netherlands\), in the wave through INT-SG-D-NLD/.test(lg[0].what), lg[0].what);
  ok("🔎 in Intune with no primary user: no wave", lg[1].kind === "intune" && /no primary user — no wave/.test(lg[1].what));
  ok("🔎 in Entra, not in Intune: no wave reaches it; Defender alone: no Entra object", lg[2].kind === "entra" && /not in Intune: no wave reaches it/.test(lg[2].what) && lg[3].kind === "defender" && /no Entra object/.test(lg[3].what));
  ok("🔎 a user with no logon found gets an empty list", MM.logonsFor(input, model.rows, [{ id: "x3", upn: "nobody@x.com" }], hunt).get("x3").length === 0);
  // 10654 (Mihai: "devices with vdi in the name should be excluded. Named
  // but excluded, because that's AVD and out of scope")
  const huntVdi = hunt.concat([
    { AccountName: "jan.smit", AccountSid: "", DeviceId: "v1", DeviceName: "PVM-VDI-017.corp.local", LastLogon: iso(now), Logons: 30, AadDeviceId: "A1" },
    { AccountName: "vdi.only", AccountSid: "", DeviceId: "v2", DeviceName: "avd-Vdi-nl-3", LastLogon: iso(now - day), Logons: 3, AadDeviceId: "" }]);
  const lgV = MM.logonsFor(input, model.rows, [{ id: "x1", upn: "Jan.Smit@x.com", sid: "S-1-5-21-9", sam: "JSMIT" }, { id: "x4", upn: "vdi.only@x.com" }], huntVdi);
  const j = lgV.get("x1");
  ok("🔎 a VDI device is named but out of scope — whatever Intune says of its id — and listed after the devices that count, however recent", j.length === 5 && j[4].device === "PVM-VDI-017" && j[4].kind === "avd" && j[4].outOfScope
    && /AVD \(VDI in the name\) — out of scope, excluded/.test(j[4].what) && j.slice(0, 4).every((x) => !x.outOfScope) && j[0].device === "nl-1");
  ok("🔎 a user seen only on VDI: every line out of scope, any case", lgV.get("x4").length === 1 && lgV.get("x4")[0].outOfScope && MM.isAvdName("x-vDi-1") && !MM.isAvdName("LT-NL-0412"));

  // --------------------------------------------------------------- csv --
  const c = MM.csv(model);
  // 10659: readInput looks the outside primary users up — a deleted one by
  // the UPN in its name, a live one by id; a user gone from Entra is said
  {
    const reads = [];
    const DEAD = "06a64d5023c34c48bc7dda39ce1096caNausad.Ahmed@perfettivanmelle.com";
    w.Graph.readAll = async (p) => {
      reads.push(p);
      if (/managedDevices/.test(p)) return [
        { id: "m1", deviceName: "BGD5CD5302DG8", userId: "dead1", userPrincipalName: DEAD, operatingSystem: "Windows" },
        { id: "m2", deviceName: "BGDDHA52", userId: "dead1", userPrincipalName: DEAD, operatingSystem: "Windows" },
        { id: "m3", deviceName: "MEXPF4PTVGN", userId: "live2", userPrincipalName: "antonio@x.com", operatingSystem: "Windows" },
        { id: "m4", deviceName: "5CGGONE", userId: "gone3", userPrincipalName: "gone@x.com", operatingSystem: "Windows" }];
      if (/^\/users\?/.test(p)) return /Nausad\.Ahmed/.test(decodeURIComponent(p)) ? [{ id: "LIVE1", userPrincipalName: "Nausad.Ahmed@perfettivanmelle.com", usageLocation: "BD", accountEnabled: true }] : [];
      return [];
    };
    const gets = [];
    w.Graph.get = async (p) => { gets.push(p); if (/live2/.test(p)) return { id: "live2", userPrincipalName: "antonio@x.com", usageLocation: "MX" }; const e = new w.Graph.GraphError("notfound", "User not found."); throw e; };
    const inp = await MM.readInput(cfg, [], null, null, null, []);
    const pu = inp.primaryUsers;
    ok("readInput: the deleted user is looked up once, by the UPN its name carries", reads.filter((p) => /^\/users\?/.test(p)).length === 1 && /userPrincipalName eq 'Nausad\.Ahmed@perfettivanmelle\.com'/.test(decodeURIComponent(reads.find((p) => /^\/users\?/.test(p)))));
    ok("…found: the live account's id and usage location", pu.get("dead1").deleted && pu.get("dead1").found && pu.get("dead1").id === "live1" && pu.get("dead1").usageLocation === "BD");
    ok("…a live primary user by id, with their usage location", gets.some((p) => /\/users\/live2\?/.test(p)) && pu.get("live2").deleted === false && pu.get("live2").usageLocation === "MX");
    ok("…a user Entra no longer has is marked gone, not an error", pu.get("gone3").deleted === true && pu.get("gone3").found === false && !inp.failed.some((f) => /primary user/.test(f)));
  }

  ok("csv: one line per device, the removals too", c.split("\r\n")[0].startsWith("Region,Country,User group,Device group,Device") && /OLD-US.*to remove/.test(c) && /DE-NOENTRA.*no Entra object/.test(c));
}

run().then(() => {
  console.log(`mderollout-members: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

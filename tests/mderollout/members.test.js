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
  ok("DE: create → add → nest user → nest device, in that order", kinds("de") === "create,add,nest,nest");
  const deNest = p1.ops.filter((o) => o.key === "de" && o.type === "nest");
  ok("the device nest points at the group the run creates", deNest[1].child.ref === "INT-SG-D-DEU" && deNest[1].parent.id === "wd" && deNest[0].child.id === G(2));
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
  const planDE = MM.planOps(model, new Set(["de"]), all, cfg);
  const res = await MM.applyOps(planDE.ops, { ledger, me: { id: "me" } });
  ok("the group is created with the signed-in admin as owner", createdWith && createdWith.name === "INT-SG-D-DEU" && createdWith.me.id === "me");
  ok("every step done and verified", res.results.length === 4 && res.results.every((x) => x.ok && x.verified), JSON.stringify(res.results.map((x) => x.note)));
  ok("the fill went to the created group, the nest linked it into the device wave", members.get("newg").has("e3") && members.get("wd").has("newg") && members.get("wu").has(G(2)));
  ok("the run's record is what it did — the undo's input", res.done.map((d) => d.type).join() === "create,add,nest,nest" && res.done[1].group.id === "newg");
  // a failed create stops what depends on it, not the rest
  w.MdeRollout.createWave = async () => { throw new Error("Insufficient privileges"); };
  const res2 = await MM.applyOps(planDE.ops, { ledger });
  ok("a refused create fails its fill and its device nest; the user nest still runs", !res2.results[0].ok && !res2.results[1].ok && /not created/.test(res2.results[1].note) && res2.results[2].ok && !res2.results[3].ok);

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
  ok("batch 1: three users into the user wave, the device group created and filled with their devices, nested in the device wave", pb.ops.map((o) => o.type).join() === "add,create,add,nest"
    && pb.ops[0].memberKind === "user" && pb.ops[0].group.name === "INT-SG-U-WAVE-Euro" && pb.ops[0].ids.join() === "b0,b1,b2"
    && pb.ops[2].ids.join() === "eb0,eb1,eb2" && pb.ops[3].parent.name === "INT-SG-D-WAVE-Euro" && pb.batch === 1 && !pb.hasRemoval);
  ok("…a batch device with no Entra object is left out with the reason", pb.skipped.some((x) => /BR-NOENTRA/.test(x)));
  ok("the regular sync does not nest a batched pilot's user group", MM.planOps(bm, new Set([BRr.key]), all, bcfg).skipped.some((x) => /added in batches/.test(x)));
  // the run lands: users in, device group made and filled
  bInput.waveUsers.get("wu").add("b0"); bInput.waveUsers.get("wu").add("b1"); bInput.waveUsers.get("wu").add("b2");
  bInput.deviceGroups.push({ id: "gdb", displayName: "INT-SG-D-NLD-BREDA" }); bInput.deviceMembers.set("gdb", new Set(["eb0", "eb1", "eb2"])); bInput.waveChildren.set("wd", new Set(["gdb"]));
  bm = MM.compute(bcfg, bInput, waves, now); BRr = bm.rows.find((r) => r.suffix === "NL-Breda");
  ok("after batch 1: 3 of 10 in, batch 2 next, the device group in sync", BRr.batch.inCount === 3 && BRr.batch.batches[0].state === "in" && BRr.batch.next.n === 2 && BRr.inSync && BRr.dgNested);
  // a user leaves the group before batch 2: the next batch is cut from who is left
  bInput.usersByGroup.set("gbr", bInput.usersByGroup.get("gbr").filter((u) => u.id !== "b9"));
  bm = MM.compute(bcfg, bInput, waves, now); BRr = bm.rows.find((r) => r.suffix === "NL-Breda");
  ok("someone leaves: nine to batch, the parts become 3, 2, 2, 2 and batch 1 stays in", BRr.batch.N === 9 && BRr.batch.sizes.join() === "3,2,2,2" && BRr.batch.batches[0].state === "in" && BRr.batch.next.n === 2 && BRr.batch.next.toAdd.length === 2);
  // every batch in → finish
  ["b3", "b4", "b5", "b6", "b7", "b8"].forEach((id) => bInput.waveUsers.get("wu").add(id));
  bm = MM.compute(bcfg, bInput, waves, now); BRr = bm.rows.find((r) => r.suffix === "NL-Breda");
  ok("all in: no next batch", !BRr.batch.next && BRr.batch.inCount === 9 && MM.planBatch(bm, BRr.key, bcfg).ops.length === 0);
  const pf = MM.planFinish(bm, BRr.key);
  ok("finish: nest the pilot group, then take its direct users out — typed", pf.ops[0].type === "nest" && pf.ops[0].child.name === "PVM-UG-CORP-MEM-USERS-NL-Breda" && pf.ops[1].type === "remove" && pf.ops[1].memberKind === "user" && pf.ops[1].ids.length === 9 && pf.hasRemoval);
  bInput.waveChildren.get("wu").add("gbr");
  bm = MM.compute(bcfg, bInput, waves, now); BRr = bm.rows.find((r) => r.suffix === "NL-Breda");
  ok("nested: finished, and the device group wants every device of the group again", BRr.batch.finished && BRr.want.size === 9);
  ok("the batches CSV: a header and one line per user, with their devices", MM.batchCsv(BRr).split("\r\n").length === 10 && /^Batch,State,User,Devices/.test(MM.batchCsv(BRr)) && /user00@contoso\.com,BR-0/.test(MM.batchCsv(BRr)));
  MM.patchInput(bInput, [{ type: "remove", group: { id: "WU" }, ids: ["b0"], memberKind: "user" }]);
  ok("patchInput moves a wave's direct users", !bInput.waveUsers.get("wu").has("b0"));
  ok("not batched: a pilot is nested whole, as before", MM.compute(MM.normConfig({ countryMap: bcfg.countryMap, pilots: ["NL-Breda"], batched: [] }), bInput, waves, now).rows.find((r) => r.suffix === "NL-Breda").batch === null);

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
  const pp = MM.planPilotsOut(pm, ["device|e1", "user|u1", "device|e3"]);
  ok("🧪 the plan only removes: e1 out of both pilot groups, u1 out of the user pilot; DE-1 left out with its reason",
    pp.ops.length === 3 && pp.ops.every((o) => o.type === "remove") && pp.hasRemoval
    && pp.ops.filter((o) => o.memberKind === "device").map((o) => o.group.id).sort().join() === "p1,p2" && pp.ops.find((o) => o.memberKind === "user").ids.join() === "u1"
    && pp.skipped.length === 1 && /DE-1: .*INT-SG-D-DEU/.test(pp.skipped[0]));
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

  // --------------------------------------------------------------- csv --
  const c = MM.csv(model);
  ok("csv: one line per device, the removals too", c.split("\r\n")[0].startsWith("Region,Country,User group,Device group,Device") && /OLD-US.*to remove/.test(c) && /DE-NOENTRA.*no Entra object/.test(c));
}

run().then(() => {
  console.log(`mderollout-members: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

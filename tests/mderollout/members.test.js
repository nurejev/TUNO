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
  "js/groupmigrate.js", "js/mdemembers.js", "js/mderollout.js"];
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
  ok("the sheet's table: five regions, 39 country groups", cfg.countryMap.map((r) => r.region).join("|") === "Euro|Americas|Asia-Pacific|Italy|BAMSCA" && allSuffixes.length === 39);
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
    usersByGroup: new Map([[G(1), [{ id: "u1" }, { id: "u2" }, { id: "u5" }]], [G(2), [{ id: "u3" }, { id: "u5" }]]]),
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
  const waves = new Map([["euro", { user: { id: "WU", displayName: "PVM-UG-MDE-WAVE-Euro" }, device: { id: "WD", displayName: "PVM-DG-MDE-WAVE-Euro" }, userName: "PVM-UG-MDE-WAVE-Euro", deviceName: "PVM-DG-MDE-WAVE-Euro" }]]);
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
  ok("groups with the prefix the table does not name are listed; NL-Breda overlaps NL", model.unmapped.map((u) => u.group.displayName).join() === "PVM-UG-CORP-MEM-USERS-NL-Breda,PVM-UG-CORP-MEM-USERS-PL" && model.unmapped[0].overlaps === "PVM-UG-CORP-MEM-USERS-NL");
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

  // --------------------------------------------------------------- csv --
  const c = MM.csv(model);
  ok("csv: one line per device, the removals too", c.split("\r\n")[0].startsWith("Region,Country,User group,Device group,Device") && /OLD-US.*to remove/.test(c) && /DE-NOENTRA.*no Entra object/.test(c));
}

run().then(() => {
  console.log(`mderollout-members: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

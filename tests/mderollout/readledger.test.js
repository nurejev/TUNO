// T28 — the READ LEDGER (build 10709, Phase 0 finding R1 of the 15 Oct
// rebuild plan: "failed group read → 'empty group' → plans removals"). A
// group whose read failed is not an empty group: the row plans no adds, no
// removals and no nest, the dry run names it, 🔄's leavers are empty for
// it, and an unread ⊘ pair refuses adds like an unread hold-back does.
// DOM-free: MdeMembers.compute / planOps and MdeRevert.model on fixtures.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), { runScripts: "outside-only" });
const w = dom.window;
const files = ["js/version.js", "js/graph.js", "js/progress.js", "js/groupuse.js", "js/document.js", "js/overview.js",
  "js/conflict.js", "js/endpointsec.js", "js/filterrules.js", "js/endpointposture.js", "js/assignedit.js",
  "js/groupmigrate.js", "js/mdemembers.js", "js/mdereports.js", "js/mdeexclude.js", "js/mderevert.js", "js/mderollout.js"];
w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
  + "\n;Object.assign(window, {MdeRollout, MdeMembers, MdeRevert, Graph});");
const MM = w.MdeMembers, MR = w.MdeRevert;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}

function run() {
  const cfg = MM.normConfig(null);
  const G = (n) => `g${n}`;
  const now = Date.parse("2026-10-15T12:00:00Z");
  const iso = (t) => new Date(t).toISOString();
  const base = () => ({
    countryGroups: [
      { id: G(1), displayName: "PVM-UG-CORP-MEM-USERS-NL", groupTypes: ["DynamicMembership"] },
      { id: G(2), displayName: "PVM-UG-CORP-MEM-USERS-DE", groupTypes: ["DynamicMembership"] },
      { id: G(5), displayName: "PVM-UG-CORP-MEM-USERS-IT", groupTypes: ["DynamicMembership"] },
    ],
    deviceGroups: [{ id: G(10), displayName: "INT-SG-D-MDE-NLD" }, { id: G(12), displayName: "INT-SG-D-MDE-ITA" }],
    usersByGroup: new Map([[G(1), [{ id: "u1" }, { id: "u2" }]], [G(2), [{ id: "u3" }]], [G(5), [{ id: "u7" }, { id: "u8" }]]]),
    managed: [
      { id: "m1", deviceName: "NLD-1", userId: "u1", azureADDeviceId: "A1", lastSyncDateTime: iso(now) },
      { id: "m2", deviceName: "NLD-2", userId: "u2", azureADDeviceId: "A2", lastSyncDateTime: iso(now) },
      { id: "m3", deviceName: "DEU-1", userId: "u3", azureADDeviceId: "A3", lastSyncDateTime: iso(now) },
      { id: "m7", deviceName: "ITA-1", userId: "u7", azureADDeviceId: "A7", lastSyncDateTime: iso(now) },
      { id: "m8", deviceName: "ITA-2", userId: "u8", azureADDeviceId: "A8", lastSyncDateTime: iso(now) },
    ],
    entra: [{ id: "E1", deviceId: "A1", displayName: "NLD-1" }, { id: "E2", deviceId: "A2", displayName: "NLD-2" }, { id: "E3", deviceId: "A3", displayName: "DEU-1" },
      { id: "E7", deviceId: "A7", displayName: "ITA-1" }, { id: "E8", deviceId: "A8", displayName: "ITA-2" }, { id: "E9", deviceId: "A9", displayName: "ITA-OLD" }],
    deviceMembers: new Map([[G(10), new Set(["e1"])], [G(12), new Set(["e7", "e8", "e9"])]]),
    waveChildren: new Map([["wu", new Set([G(1)])], ["wd", new Set([G(10)])], ["wui", new Set()], ["wdi", new Set()]]),
    userGroups: new Map([["int-sg-u-mde-nld", { id: "su-nl", displayName: "INT-SG-U-MDE-NLD" }], ["int-sg-u-mde-ita", { id: "su-it", displayName: "INT-SG-U-MDE-ITA" }]]),
    userMembers: new Map([["su-nl", new Set(["u1"])], ["su-it", new Set(["u7", "u8", "u9"])]]),
    revertUsers: new Map(), staticUnread: new Map(), unread: new Map(),
    failed: [], readAt: now,
  });
  const waves = new Map([
    ["euro", { user: { id: "WU", displayName: "INT-SG-U-WAVE-Euro" }, device: { id: "WD", displayName: "INT-SG-D-WAVE-Euro" }, userName: "INT-SG-U-WAVE-Euro", deviceName: "INT-SG-D-WAVE-Euro" }],
    ["italy", { user: { id: "WUI", displayName: "INT-SG-U-WAVE-Italy" }, device: { id: "WDI", displayName: "INT-SG-D-WAVE-Italy" }, userName: "INT-SG-U-WAVE-Italy", deviceName: "INT-SG-D-WAVE-Italy" }],
  ]);
  const ALL = { fill: true, nestUsers: true, nestDevices: true, removals: true };
  const row = (m, s) => m.rows.find((r) => r.suffix === s);

  // ------------------------------------------------------- clean read --
  const clean = MM.compute(cfg, base(), waves, now);
  const IT = row(clean, "IT");
  ok("clean read: the ledger says ok on every read group", IT.read.source === "ok" && IT.read.static === "ok" && IT.read.devices === "ok" && IT.read.wave === "ok" && IT.unread === "");
  ok("clean read: Italy's static group would lose u9 and its device group would lose ITA-OLD (the plan as before 10709)", IT.uRemove.join() === "u9" && IT.remove.join() === "e9");
  const pClean = MM.planOps(clean, new Set(["it"]), ALL, cfg);
  ok("clean read: the removals and the nests are planned", pClean.ops.filter((o) => o.type === "remove").length === 2 && pClean.ops.filter((o) => o.type === "nest").length === 2 && !pClean.skipped.some((x) => /not read/.test(x)));

  // ------------------------------------------ the SOURCE read failed (R1) --
  {
    const inp = base();
    inp.usersByGroup.delete(G(5));                                   // what readInput leaves when the read failed…
    inp.unread.set(G(5), "429 Too Many Requests after 5 retries");   // …and what 10709 records
    const m = MM.compute(cfg, inp, waves, now);
    const it = row(m, "IT");
    ok("source read failed: the ledger says so, with why", it.read.source === "failed" && /429/.test(it.unread) && /PVM-UG-CORP-MEM-USERS-IT/.test(it.unread));
    ok("source read failed: NOT 'remove all of Italy' — no user removals, no device removals, no adds", it.uRemove.length === 0 && it.remove.length === 0 && it.uAdd.length === 0 && it.add.length === 0);
    ok("source read failed: the row is not 'in sync' either", it.uInSync === false && !it.inSync);
    const p = MM.planOps(m, new Set(["it", "nl"]), ALL, cfg);
    ok("source read failed: the dry run names the row and asks for a new read", p.skipped.some((x) => /⚠ Italy \(PVM-UG-CORP-MEM-USERS-IT\): not read \(.*429.*\).*no removals or nesting.*Read again/.test(x)), p.skipped.join("|"));
    ok("source read failed: nothing is planned on Italy — no remove, no nest, no add", !p.ops.some((o) => o.key === "it"));
    ok("source read failed: the other rows plan as usual (NL still adds u2 and NLD-2)", p.ops.some((o) => o.key === "nl" && o.type === "add" && o.memberKind === "user" && o.ids.join() === "u2") && p.ops.some((o) => o.key === "nl" && o.type === "add" && !o.memberKind && o.ids.join() === "e2"));
    // 🔄 Country groups: the same read feeds MdeRevert.model — no leavers
    const X = { userGroups: inp.userGroups, userMembers: inp.userMembers, upn: new Map(), revert: {}, revertUsers: new Map(), revertDevices: new Map(), failed: [], unread: new Map() };
    const rm = MR.model(cfg, m, inp, X, { now });
    const rit = rm.rows.find((r) => r.suffix === "IT");
    ok("🔄 source read failed: the leaver list is empty, not 'everyone leaves'; the row carries why", rit && rit.user.leave.length === 0 && rit.device.leave.length === 0 && rit.user.add.length === 0 && /429/.test(rit.unread));
    const rnl = rm.rows.find((r) => r.suffix === "NL");
    ok("🔄 source read failed: NL still syncs (+u2)", rnl && rnl.user.add.map((u) => u.id).join() === "u2" && rnl.unread === "");
  }

  // ------------------------------------------ the STATIC read failed (R1) --
  {
    const inp = base();
    inp.userMembers.delete("su-it");
    inp.staticUnread.set("su-it", "503 Service Unavailable");
    const m = MM.compute(cfg, inp, waves, now);
    const it = row(m, "IT");
    ok("static read failed: the ledger says so", it.read.static === "failed" && it.read.source === "ok" && /INT-SG-U-MDE-ITA: 503/.test(it.unread));
    ok("static read failed: no user adds (they may be in already) and no user removals; the devices are untouched too", it.uAdd.length === 0 && it.uRemove.length === 0 && it.add.length === 0 && it.remove.length === 0);
    const p = MM.planOps(m, new Set(["it"]), ALL, cfg);
    ok("static read failed: named in the dry run, nothing planned", p.skipped.some((x) => /⚠ Italy.*INT-SG-U-MDE-ITA: 503/.test(x)) && !p.ops.some((o) => o.key === "it"));
    const X = { userGroups: inp.userGroups, userMembers: inp.userMembers, upn: new Map(), revert: {}, revertUsers: new Map(), revertDevices: new Map(), failed: [], unread: inp.staticUnread };
    const rit = MR.model(cfg, m, inp, X, { now }).rows.find((r) => r.suffix === "IT");
    ok("🔄 static read failed: no adds, no leavers", rit.user.add.length === 0 && rit.user.leave.length === 0 && /503/.test(rit.unread));
  }

  // ------------------------------------------ the DEVICE read failed (R1) --
  {
    const inp = base();
    inp.deviceMembers.delete(G(12));
    inp.unread.set(G(12), "timeout");
    const m = MM.compute(cfg, inp, waves, now);
    const it = row(m, "IT");
    ok("device group read failed: the ledger says so; the whole row waits for a new read (one unread group is enough)", it.read.devices === "failed" && it.read.static === "ok" && it.add.length === 0 && it.remove.length === 0 && it.uRemove.length === 0 && it.uAdd.length === 0);
    const p = MM.planOps(m, new Set(["it"]), ALL, cfg);
    ok("device group read failed: named, nothing planned on the row", p.skipped.some((x) => /⚠ Italy.*INT-SG-D-MDE-ITA: timeout/.test(x)) && !p.ops.some((o) => o.key === "it"));
  }

  // ------------------------------------------- the WAVE read failed (R1) --
  {
    const inp = base();
    inp.waveChildren.delete("wui");
    inp.unread.set("wui", "403 Forbidden");   // readInput keys the ledger by lower-cased id
    const m = MM.compute(cfg, inp, waves, now);
    const it = row(m, "IT");
    ok("wave read failed: the ledger says so, the row itself is read", it.read.wave === "failed" && it.unread === "" && it.waveUnread.user === "403 Forbidden" && it.waveUnread.device === "");
    const p = MM.planOps(m, new Set(["it"]), ALL, cfg);
    ok("wave read failed: the user nest is refused and named (its children are unknown); the device nest into the read wave goes", p.skipped.some((x) => /INT-SG-U-WAVE-Italy's members were not read \(403/.test(x)) && !p.ops.some((o) => o.type === "nest" && o.kind === "user") && p.ops.some((o) => o.type === "nest" && o.kind === "device"));
  }

  // ------------------------------------------------- the ⊘ read failed --
  {
    const inp = base();
    inp.heldUnread = "INT-SG-U-MDE-Exclusion: 429";
    const ctx = { users: new Set(), devices: new Set(), exempt: { ids: new Set(), names: new Set() }, hold: { ids: new Set(), names: new Set() }, unread: inp.heldUnread, nameOf: () => "" };
    const g = MR.guardHeld([{ type: "add", key: "nl", group: { id: "su-nl", name: "INT-SG-U-MDE-NLD" }, ids: ["u2"], memberKind: "user", label: "1 user", objs: [{ id: "u2" }] }], ctx);
    ok("⊘ read failed (readInput's heldUnread feeds the guard): a plan that adds is refused", !!g.refused && /429/.test(g.refused));
  }

  console.log(`T28 read ledger: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run();

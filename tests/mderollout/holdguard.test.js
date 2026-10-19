// T28 — ⏸ the hold-back guard (build 10707, Mihai 15 Oct: "make sure that
// when users are put in hold-back and a rollout gets re-run these user are
// not added again!"). DOM-free: MdeRevert.guardHeld — the one last check
// every members plan passes — strips held-back users and devices from every
// add into the rollout (the hold-back / ⊘ / ⊝ groups exempt), lets the
// deliberate ways back in through (a hold-back or resume plan, 🔄's confirmed
// re-include, a plan that takes the same member out of the hold-back),
// remaps the steps that waited on a dropped one, and refuses a plan that adds
// anyone while the hold-back could not be read. MdeMembers.compute: a
// held-back user's devices are held with them (the Hans Katsman case).
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
  + "\n;Object.assign(window, {MdeRollout, MdeMembers, MdeRevert, MdeExclude, Graph, Conflict});");
const MM = w.MdeMembers, MR = w.MdeRevert;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}

function run() {
  // ------------------------------------------------------------ guard --
  const HOLD = { ids: new Set(["hb-u", "hb-d"]), names: new Set(["int-sg-u-mde-holdback", "int-sg-d-mde-holdback"]) };
  const EX = { ids: new Set(["hb-u", "hb-d", "ex-u", "skip-d"]), names: new Set(["int-sg-u-mde-holdback", "int-sg-d-mde-holdback", "int-sg-d-mde-skip"]) };
  const names = { "user|u1": "hans@pvm", "device|e1": "NLD1 (its user is held back)" };
  const ctx = (o) => Object.assign({ users: new Set(["u1"]), devices: new Set(["e1", "e7"]), exempt: EX, hold: HOLD, unread: "", nameOf: (k, id) => names[`${k}|${id}`] || "" }, o || {});
  const ug = { id: "su-nld", name: "INT-SG-U-MDE-NLD" }, dg = { id: "dg-nld", name: "INT-SG-D-MDE-NLD" };

  const orig = [{ type: "add", key: "nl", group: ug, ids: ["u1", "u3"], memberKind: "user", label: "2 users of X", objs: [{ id: "u1" }, { id: "u3" }] }];
  let g = MR.guardHeld(orig, ctx());
  ok("a held-back user is taken out of an add into a country group; the rest still goes", g.ops.length === 1 && g.ops[0].ids.join() === "u3" && g.ops[0].objs.map((x) => x.id).join() === "u3");
  ok("…said in Left out, by name, and counted", g.skipped.length === 1 && /INT-SG-U-MDE-NLD: hans@pvm — held back/.test(g.skipped[0]) && g.stripped.users === 1 && /1 held back left out/.test(g.ops[0].label));
  ok("the plan handed in is not changed", orig[0].ids.join() === "u1,u3" && orig[0].label === "2 users of X");

  g = MR.guardHeld([{ type: "add", key: "nl", group: dg, ids: ["e1"], label: "1 device" }, { type: "remove", key: "pilot", group: { id: "dg-pilot", name: "INT-SG-D-MDE-NLD-BREDA" }, ids: ["e1"], memberKind: "device", needsOk: [0] }, { type: "add", key: "x", group: dg, ids: ["e3"], needsOk: [1] }], ctx());
  ok("an add of held-back members only is dropped (a device op without memberKind is a device op)", g.ops.length === 2 && g.ops[0].type === "remove" && g.ops[1].ids.join() === "e3");
  ok("…a step that waited on it waits on nothing; later indexes are remapped", g.ops[0].needsOk === undefined && g.ops[1].needsOk.join() === "0");
  ok("…a held-back user's device is named so", /NLD1 \(its user is held back\)/.test(g.skipped[0]) && g.stripped.devices === 1);

  g = MR.guardHeld([{ type: "add", key: "hb", group: { id: "hb-u", name: "INT-SG-U-MDE-HoldBack" }, ids: ["u1"], memberKind: "user" }, { type: "add", key: "ex", group: { id: "ex-u", name: "⊘" }, ids: ["u1"], memberKind: "user" }, { type: "add", key: "s", group: { id: "skip-d", name: "skip" }, ids: ["e1"] }], ctx());
  ok("adds into the hold-back, ⊘ and ⊝ groups are never stripped", g.ops.length === 3 && !g.skipped.length);
  g = MR.guardHeld([{ type: "create", name: "INT-SG-D-MDE-HoldBack" }, { type: "add", group: { ref: "INT-SG-D-MDE-HoldBack", name: "INT-SG-D-MDE-HoldBack" }, ids: ["e1"] }], ctx());
  ok("…nor into a hold-back group the same plan creates (by its name)", g.ops.length === 2 && !g.skipped.length);

  g = MR.guardHeld([{ type: "add", group: ug, ids: ["u1"], memberKind: "user" }], ctx({ allowAll: true }));
  ok("a hold-back / resume plan passes as made", g.ops.length === 1 && g.ops[0].ids.join() === "u1");
  g = MR.guardHeld([{ type: "add", group: ug, ids: ["u1", "u3"], memberKind: "user", allowHeld: ["u1"] }], ctx());
  ok("a member re-included with 🔄's confirm line (allowHeld) goes in", g.ops[0].ids.join() === "u1,u3" && !g.skipped.length);
  g = MR.guardHeld([{ type: "add", group: ug, ids: ["u1"], memberKind: "user" }, { type: "remove", group: { id: "hb-u", name: "INT-SG-U-MDE-HoldBack" }, ids: ["u1"], memberKind: "user" }], ctx());
  ok("a plan that takes the same member out of the hold-back (an undo, a resume) puts them back", g.ops.length === 2 && g.ops[0].ids.join() === "u1");
  g = MR.guardHeld([{ type: "add", group: ug, ids: ["u1"], memberKind: "user" }, { type: "remove", group: { id: "ex-u", name: "⊘" }, ids: ["u1"], memberKind: "user" }], ctx());
  ok("…out of a group that is not in hold (here ⊘) does not count — the tool hands ⊘ in while it lives", g.ops.length === 1 && g.ops[0].type === "remove");

  g = MR.guardHeld([{ type: "add", group: ug, ids: ["u3"], memberKind: "user" }], ctx({ unread: "403 Forbidden" }));
  ok("the hold-back unread: a plan adding anyone to the rollout is refused, the reason said", /could not be read \(403 Forbidden\)/.test(g.refused) && /Read again/.test(g.refused));
  g = MR.guardHeld([{ type: "remove", group: ug, ids: ["u3"], memberKind: "user" }, { type: "add", group: { id: "hb-u" }, ids: ["u3"], memberKind: "user" }], ctx({ unread: "x" }));
  ok("…a plan that only removes, or adds to the hold-back itself, is not", !g.refused);
  g = MR.guardHeld([{ type: "add", group: ug, ids: ["u3"], memberKind: "user" }], ctx({ unread: "x", allowAll: true }));
  ok("…nor a hold-back or resume plan", !g.refused);
  const same = [{ type: "add", group: ug, ids: ["u3"], memberKind: "user" }];
  ok("nothing held: the very same list comes back", MR.guardHeld(same, ctx()).ops === same);

  // --------------------------------------------------- compute pairing --
  const cfg = MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["NL"] }], pilots: [], batched: [] });
  const now = Date.parse("2026-10-15T12:00:00Z");
  const iso = (t) => new Date(t).toISOString();
  const input = {
    countryGroups: [{ id: "src-nl", displayName: "PVM-UG-CORP-MEM-USERS-NL", groupTypes: ["DynamicMembership"] }],
    deviceGroups: [{ id: "dg-nld", displayName: "INT-SG-D-MDE-NLD" }],
    usersByGroup: new Map([["src-nl", [{ id: "u1", userPrincipalName: "hans@x" }, { id: "u2", userPrincipalName: "bob@x" }, { id: "u3", userPrincipalName: "cat@x" }]]]),
    managed: [
      { id: "m1", deviceName: "NLD1", userId: "u1", azureADDeviceId: "a1", lastSyncDateTime: iso(now) },
      { id: "m2", deviceName: "NLD2", userId: "u2", azureADDeviceId: "a2", lastSyncDateTime: iso(now) },
      { id: "m3", deviceName: "NLD3", userId: "u3", azureADDeviceId: "a3", lastSyncDateTime: iso(now) },
    ],
    entra: [{ id: "e1", deviceId: "a1", displayName: "NLD1" }, { id: "e2", deviceId: "a2", displayName: "NLD2" }, { id: "e3", deviceId: "a3", displayName: "NLD3" }],
    deviceMembers: new Map([["dg-nld", new Set(["e1"])]]),
    waveChildren: new Map([["wd-euro", new Set(["dg-nld"])]]), waveUsers: new Map(),
    held: new Set(), reverted: new Set(),
    revertUsers: new Map([["u1", { id: "u1", upn: "hans@x" }], ["u2", { id: "u2", upn: "bob@x" }]]),
    failed: [], readAt: now,
  };
  const waves = new Map([["euro", { user: { id: "wu-euro", displayName: "INT-SG-U-WAVE-Euro" }, device: { id: "wd-euro", displayName: "INT-SG-D-WAVE-Euro" }, userName: "INT-SG-U-WAVE-Euro", deviceName: "INT-SG-D-WAVE-Euro" }]]);
  const mm = MM.compute(cfg, input, waves, now);
  const nl = mm.rows.find((r) => r.suffix === "NL");
  const d = (id) => nl.devices.find((x) => x.objId === id);
  ok("a held-back user's device is held with them (only the user in ⏸)", d("e1").held && d("e1").heldByUser && !d("e1").reverted);
  ok("…in its country device group: taken out, said why", nl.remove.includes("e1") && nl.removeNames.some((n) => /NLD1 \(its user is held back\)/.test(n)));
  ok("…not in it: never added on a re-run", !nl.add.includes("e2") && d("e2").heldByUser);
  ok("…a device of a user not held back is still added", nl.add.includes("e3") && !d("e3").held);
  const sm = MR.model(cfg, mm, input, { userGroups: new Map(), userMembers: new Map(), upn: new Map(), revert: {}, revertUsers: input.revertUsers, revertDevices: new Map(), failed: [] }, { now });
  const srow = sm.rows.find((r) => r.key === nl.key);
  ok("🔄 lists the device as held in, because of its user", srow.device.heldIn.some((x) => x.id === "e1" && x.why === "user held back"));

  // ------------------------------- 10713 (R5): no nest over held members --
  // NL's device group still holds e1 (its user is held back) and is not
  // nested yet; the static user group INT-SG-U-MDE-NLD holds hans (held back)
  {
    const inp = Object.assign({}, input, { waveChildren: new Map([["wd-euro", new Set()], ["wu-euro", new Set()]]),
      userGroups: new Map([["int-sg-u-mde-nld", { id: "su-nld", displayName: "INT-SG-U-MDE-NLD" }]]), userMembers: new Map([["su-nld", new Set(["u1", "u3"])]]) });
    const m5 = MM.compute(cfg, inp, waves, now);
    const r5 = m5.rows.find((r) => r.suffix === "NL");
    ok("compute says who is held back yet still in: hans in INT-SG-U-MDE-NLD, NLD1 in INT-SG-D-MDE-NLD", r5.uHeldIn.join() === "u1" && r5.heldIn.join() === "e1");
    const nestOnly = { fill: false, nestUsers: true, nestDevices: true, removals: false };
    const p5 = MM.planOps(m5, new Set(["nl"]), nestOnly, cfg);
    ok("a nest of a group that still holds held-back members is refused, both sides named with the count", !p5.ops.some((o) => o.type === "nest") && p5.skipped.some((x) => /⏸ Netherlands.*INT-SG-U-MDE-NLD still holds 1 held back — take them out first/.test(x)) && p5.skipped.some((x) => /⏸ Netherlands.*INT-SG-D-MDE-NLD still holds 1 held back/.test(x)), p5.skipped.join("|"));
    const p6 = MM.planOps(m5, new Set(["nl"]), Object.assign({}, nestOnly, { removals: true }), cfg);
    const idx = (t, k) => p6.ops.findIndex((o) => o.type === t && (k ? o.memberKind === k || o.kind === k : true));
    ok("with 'apply removals' ticked the held ones go out first and the nest follows, waiting for that step (needsOk)", p6.ops.filter((o) => o.type === "nest").length === 2
      && p6.ops.some((o) => o.type === "remove" && o.memberKind === "user" && o.ids.includes("u1")) && p6.ops.some((o) => o.type === "remove" && !o.memberKind && o.ids.includes("e1"))
      && p6.ops[idx("nest", "user")].needsOk.join() === String(p6.ops.findIndex((o) => o.type === "remove" && o.memberKind === "user"))
      && p6.ops[idx("nest", "device")].needsOk.join() === String(p6.ops.findIndex((o) => o.type === "remove" && !o.memberKind)), JSON.stringify(p6.ops.map((o) => [o.type, o.memberKind || o.kind, o.needsOk])));
    const inp2 = Object.assign({}, inp, { revertUsers: new Map(), userMembers: new Map([["su-nld", new Set(["u3"])]]) });
    const p7 = MM.planOps(MM.compute(cfg, inp2, waves, now), new Set(["nl"]), nestOnly, cfg);
    ok("no hold-back → the nests plan as before, no refusal, no needsOk", p7.ops.filter((o) => o.type === "nest").length === 2 && p7.ops.every((o) => o.type !== "nest" || !o.needsOk) && !p7.skipped.some((x) => /still holds/.test(x)));
  }

  // ------------------------------------------------ readExtra unread --
  const realReadAll = w.Graph.readAll;
  w.Graph.readAll = async (p) => { if (/displayName eq 'INT-SG-U-MDE-HoldBack'/.test(decodeURIComponent(p))) throw new Error("403 Forbidden"); return []; };
  return MR.readExtra(cfg, MM.countryRows(cfg), () => {}).then((X) => {
    w.Graph.readAll = realReadAll;
    ok("readExtra: a hold-back group that could not be read says so (holdUnread), it is not an empty one", /INT-SG-U-MDE-HoldBack: 403 Forbidden/.test(X.holdUnread) && X.revertUsers.size === 0);
  });
}

Promise.resolve(run()).then(() => {
  console.log(`T28 hold-back guard: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}, (e) => { console.error(e); process.exitCode = 1; });

// T28 — 🧪 migrate and 🗑 retire a pilot (build 10733). Mihai, 21 Oct 2026:
// "we are now live with the netherland, so the pilot-breda should now be
// fully decommissioned and onboarded in nl. the hold backs stays" — and
// "i could not find the migrate breda" (the button lived only in the
// unfinished batches). DOM-free: the migration for a finished or unbatched
// pilot, planRetire's refusals and its plan, the retired config (the table
// forgets the pilot, the hold-back stays out of NL), addPilot starting over.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), { runScripts: "outside-only" });
const w = dom.window;
const files = ["js/version.js", "js/graph.js", "js/progress.js", "js/groupuse.js", "js/document.js", "js/overview.js",
  "js/conflict.js", "js/endpointsec.js", "js/filterrules.js", "js/endpointposture.js", "js/assignedit.js",
  "js/groupmigrate.js", "js/mdemembers.js", "js/mdereports.js", "js/mdeexclude.js", "js/mderollout.js", "js/t28spine.js", "js/t28state.js"];
w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
  + "\n;Object.assign(window, {MdeRollout, MdeMembers, Graph, T28Spine: typeof T28Spine !== 'undefined' ? T28Spine : null});");
const MM = w.MdeMembers;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const now = Date.parse("2026-10-21T08:00:00Z");
const iso = (t) => new Date(t).toISOString();
const waves = new Map([["euro", { user: { id: "WU", displayName: "INT-SG-U-WAVE-Euro" }, device: { id: "WD", displayName: "INT-SG-D-WAVE-Euro" }, userName: "INT-SG-U-WAVE-Euro", deviceName: "INT-SG-D-WAVE-Euro" }]]);
const all = { fill: true, nestUsers: true, nestDevices: true, removals: false };

// NL live through its STATIC groups; Breda's pilot finished and still in the
// wave through its own static groups; m5 (a Breda user) is held back, with
// their device em5 — neither is in any country group.
function fixture() {
  const users = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, userPrincipalName: `m${i}@contoso.com` }));
  const breda = ["m0", "m1", "m2", "m3", "m4"], nl = ["m0", "m1", "m2", "m3", "m4", "m6", "m7"];
  return {
    countryGroups: [{ id: "gnl", displayName: "PVM-UG-CORP-MEM-USERS-NL", groupTypes: ["DynamicMembership"] }, { id: "gbr", displayName: "PVM-UG-CORP-MEM-USERS-NL-Breda", groupTypes: ["DynamicMembership"] }],
    deviceGroups: [{ id: "gdb", displayName: "INT-SG-D-MDE-NLD-BREDA" }, { id: "gdn", displayName: "INT-SG-D-MDE-NLD" }],
    usersByGroup: new Map([["gbr", users.slice(0, 6)], ["gnl", users]]),
    managed: users.map((u, i) => ({ id: `mm${i}`, deviceName: `NLD-${i}`, userId: u.id, azureADDeviceId: `AM${i}`, lastSyncDateTime: iso(now) })),
    entra: users.map((u, i) => ({ id: `EM${i}`, deviceId: `AM${i}`, displayName: `NLD-${i}` })),
    deviceMembers: new Map([["gdb", new Set(breda.map((x) => `e${x}`))], ["gdn", new Set(nl.map((x) => `e${x}`))]]),
    userGroups: new Map([["int-sg-u-mde-nld-breda", { id: "sbr", displayName: "INT-SG-U-MDE-NLD-BREDA" }], ["int-sg-u-mde-nld", { id: "snl", displayName: "INT-SG-U-MDE-NLD" }]]),
    userMembers: new Map([["sbr", new Set(breda)], ["snl", new Set(nl)]]),
    waveChildren: new Map([["wu", new Set(["sbr", "snl"])], ["wd", new Set(["gdb", "gdn"])]]), waveUsers: new Map([["wu", new Set()]]),
    revertUsers: new Map([["m5", { id: "m5" }]]), reverted: new Set(["em5"]), held: new Set(),
    failed: [], readAt: now,
  };
}
const base = { countryMap: [{ region: "Euro", suffixes: ["NL-Breda", "NL"] }], pilots: ["NL-Breda"] };

async function run() {
  // ------------------------------------------- 🧪 migrate, any pilot state --
  for (const [label, batched] of [["in batches", ["NL-Breda"]], ["not batched", []]]) {
    const cfg = MM.normConfig(Object.assign({}, base, { batched }));
    const input = fixture(), m = MM.compute(cfg, input, waves, now);
    const BR = m.rows.find((r) => r.suffix === "NL-Breda"), NL = m.rows.find((r) => r.suffix === "NL");
    ok(`${label}: Breda knows NL, NL is live, Breda holds no one NL does not`, BR.parentKey === NL.key && NL.ugNested && !BR.outsideParent.length && !BR.migrated && (batched.length ? !!BR.batch : BR.batch === null), JSON.stringify({ b: BR.batch && { f: BR.batch.finished, N: BR.batch.N }, o: BR.outsideParent }));
    const p = MM.planOps(m, new Set([NL.key]), all, cfg);
    const mig = p.ops.filter((o) => o.migrate);
    ok(`${label}: 🧪 Migrate plans Breda's two routes out of the waves, nothing to wait on (NL is live)`, mig.map((o) => `${o.type}:${o.kind}:${o.child.name}`).join() === "unnest:user:INT-SG-U-MDE-NLD-BREDA,unnest:device:INT-SG-D-MDE-NLD-BREDA" && mig.every((o) => !o.needsOk)
      && p.migrate.length === 1 && p.migrate[0].suffix === "NL-Breda" && p.migrate[0].into === "Netherlands" && p.migrate[0].ops.length === 2, JSON.stringify(p.ops.map((o) => o.type + ":" + (o.child ? o.child.name : o.group && o.group.name))));
    ok(`${label}: …and NL's own steps never take the held-back user in`, !p.ops.some((o) => o.type === "add" && (o.ids || []).includes("m5")) && !NL.uWant.has("m5") && !NL.want.has("em5"));
  }

  // ------------------------------------------------- 🗑 retire: refusals --
  const migCfg = MM.normConfig(Object.assign({}, base, { batched: [], migrated: ["NL-Breda"] }));
  let input = fixture();
  // not migrated yet
  {
    const cfg = MM.normConfig(Object.assign({}, base, { batched: [] }));
    const m = MM.compute(cfg, input, waves, now), p = MM.planRetire(m, input, "nl-breda", null, cfg);
    ok("🗑 not migrated: refused — migrate first", !p.ops.length && p.skipped.some((x) => /not migrated into Netherlands yet — 🧪 Migrate first/.test(x)) && !p.retire, JSON.stringify(p.skipped));
  }
  // migrated in the rules but a route still up (the migration left the
  // device side when NL's device group was not in the wave yet)
  {
    const m = MM.compute(migCfg, input, waves, now), p = MM.planRetire(m, input, "nl-breda", null, migCfg);
    const t = p.ops.map((o) => `${o.type}:${o.child ? o.child.name : o.group.name}${o.needsOk ? "<" + o.needsOk.join("+") : ""}`).join();
    ok("🗑 a route still up: taken out of the waves first, then emptied and deleted", t === "unnest:INT-SG-U-MDE-NLD-BREDA,unnest:INT-SG-D-MDE-NLD-BREDA,remove:INT-SG-U-MDE-NLD-BREDA<0,deletegroup:INT-SG-U-MDE-NLD-BREDA<2,remove:INT-SG-D-MDE-NLD-BREDA<1,deletegroup:INT-SG-D-MDE-NLD-BREDA<4"
      && p.warnings.some((w) => /still carry the pilot's own group — taken out first/.test(w)) && p.retire.ops.join() === "3,5", t);
    const inp3 = fixture(); inp3.waveChildren.get("wd").delete("gdn");
    const m3 = MM.compute(migCfg, inp3, waves, now);
    ok("🗑 the pilot's device group still in the wave and NL's not: refused — nest NL's first", !MM.planRetire(m3, inp3, "nl-breda", null, migCfg).ops.length && MM.planRetire(m3, inp3, "nl-breda", null, migCfg).skipped.some((x) => /INT-SG-D-MDE-NLD-BREDA is still in INT-SG-D-WAVE-Euro and INT-SG-D-MDE-NLD is not — nest INT-SG-D-MDE-NLD in it first/.test(x)));
  }
  // migrated: the routes are out of the waves
  input.waveChildren.get("wu").delete("sbr"); input.waveChildren.get("wd").delete("gdb");
  {
    const m = MM.compute(migCfg, input, waves, now);
    ok("🗑 a country is not retired", MM.planRetire(m, input, "nl", null, migCfg).skipped.some((x) => /a country, not a pilot/.test(x)));
    // a Breda user NL's sync would take in but has not yet
    const inp2 = fixture(); inp2.waveChildren.get("wu").delete("sbr"); inp2.waveChildren.get("wd").delete("gdb"); inp2.userMembers.get("snl").delete("m3"); inp2.deviceMembers.get("gdn").delete("em2");
    const m2 = MM.compute(migCfg, inp2, waves, now), p2 = MM.planRetire(m2, inp2, "nl-breda", null, migCfg);
    ok("🗑 a member NL does not hold yet: refused — fill NL first, user and device named", !p2.ops.length
      && p2.skipped.some((x) => /1 user is in INT-SG-U-MDE-NLD-BREDA but not yet in INT-SG-U-MDE-NLD \(m3@contoso\.com\) — fill Netherlands first/.test(x))
      && p2.skipped.some((x) => /1 device is in INT-SG-D-MDE-NLD-BREDA but not yet in INT-SG-D-MDE-NLD \(NLD-2\)/.test(x)), JSON.stringify(p2.skipped));
    // on an assignment
    const pm = { newP: [{ name: "Win - OIB - ES - Defender Antivirus - D - AV Configuration - v3.6", item: { assignments: [{ groupId: "gdb", intent: "include" }] } }], oldP: [] };
    const p3 = MM.planRetire(m, input, "nl-breda", pm, migCfg);
    ok("🗑 a pilot group still on an assignment: refused, the policy named", !p3.ops.length && p3.skipped.some((x) => /INT-SG-D-MDE-NLD-BREDA: still on 1 assignment \(Win - OIB - ES - Defender Antivirus/.test(x)), JSON.stringify(p3.skipped));
    // NL not live
    const inp4 = fixture(); inp4.waveChildren.get("wu").clear(); inp4.waveChildren.get("wd").delete("gdb");
    const m4 = MM.compute(migCfg, inp4, waves, now);
    ok("🗑 NL not in the wave: refused", MM.planRetire(m4, inp4, "nl-breda", null, migCfg).skipped.some((x) => /Netherlands is not live yet/.test(x)));
    // unread
    const inp5 = fixture(); inp5.waveChildren.get("wu").delete("sbr"); inp5.waveChildren.get("wd").delete("gdb"); inp5.failed = ["INT-SG-U-MDE-NLD-BREDA"];
  }

  // ------------------------------------------------- 🗑 retire: the plan --
  {
    // the held-back user is still in Breda's static group (an old route)
    input.userMembers.get("sbr").add("m5");
    const m = MM.compute(migCfg, input, waves, now);
    const pm = { newP: [{ name: "Win - OIB - X", item: { assignments: [{ groupId: "WU", intent: "include" }] } }], oldP: [] };
    const p = MM.planRetire(m, input, "nl-breda", pm, migCfg);
    const t = p.ops.map((o) => `${o.type}:${o.group.name}${o.ids ? ":" + o.ids.length : ""}${o.needsOk ? "<" + o.needsOk.join("+") : ""}`).join();
    ok("🗑 the plan: each group emptied, then deleted once its removal read back", t === "remove:INT-SG-U-MDE-NLD-BREDA:6,deletegroup:INT-SG-U-MDE-NLD-BREDA<0,remove:INT-SG-D-MDE-NLD-BREDA:5,deletegroup:INT-SG-D-MDE-NLD-BREDA<2", t);
    ok("🗑 …the retire record names the deletions, the confirm line the groups and counts", p.retire && p.retire.suffix === "NL-Breda" && p.retire.into === "Netherlands" && p.retire.ops.join() === "1,3" && p.hasRemoval
      && /retire the pilot NL Breda: delete INT-SG-U-MDE-NLD-BREDA and INT-SG-D-MDE-NLD-BREDA \(6 users, 5 devices, all in Netherlands or held back\)/.test(p.confirmLine), p.confirmLine);
    ok("🗑 …the held-back member in a pilot group said, kept by the hold-back", p.warnings.some((w) => /1 held-back member is still in a pilot group .* the hold-back keeps them/.test(w)));
    ok("🗑 …permanence and the way back said; the hold-back pair is never written", p.warnings.some((w) => /Deleting a group is permanent/.test(w) && /hold-back pair are not touched/.test(w))
      && !p.ops.some((o) => /HoldBack/i.test(o.group.name)) && p.ops.every((o) => ["sbr", "gdb"].includes(o.group.id)));
    ok("🗑 …every step is a retire step for NL Breda", p.ops.every((o) => o.retire && o.who === "NL Breda · retire" && o.key === "nl-breda"));
    const inv = MM.inverseOf([{ type: "unnest", key: "nl-breda", parent: { id: "wd", name: "INT-SG-D-WAVE-Euro" }, child: { id: "gdb", name: "INT-SG-D-MDE-NLD-BREDA" }, kind: "device" },
      { type: "remove", key: "nl-breda", group: { id: "gdb", name: "INT-SG-D-MDE-NLD-BREDA" }, ids: ["em0"], memberKind: "device" }, { type: "deletegroup", key: "nl-breda", group: { id: "gdb", name: "INT-SG-D-MDE-NLD-BREDA" } }]);
    ok("📜 undo of a retire: nothing to write back into a deleted group, and it says so", inv.ops.length === 0 && inv.warnings.some((x) => /INT-SG-D-MDE-NLD-BREDA\) cannot be brought back/.test(x)), JSON.stringify(inv));
    // a leaver still in the pilot group: removed with it, said
    const inp = fixture(); inp.waveChildren.get("wu").delete("sbr"); inp.waveChildren.get("wd").delete("gdb"); inp.userMembers.get("sbr").add("gone1");
    const pl = MM.planRetire(MM.compute(migCfg, inp, waves, now), inp, "nl-breda", pm, migCfg);
    ok("🗑 a leaver in the pilot group (in no NL source): goes with the group, said", pl.ops.length === 4 && pl.ops[0].ids.includes("gone1") && pl.warnings.some((w) => /1 user in INT-SG-U-MDE-NLD-BREDA is in no Netherlands source any more/.test(w)), JSON.stringify(pl.warnings));
    // policies not read: planned, with the warning
    ok("🗑 policies not read: planned, the assignment check said", MM.planRetire(m, input, "nl-breda", null, migCfg).warnings.some((w) => /policies are not read/.test(w)));
    // groups already gone
    const inp6 = fixture(); inp6.waveChildren.get("wu").delete("sbr"); inp6.waveChildren.get("wd").delete("gdb"); inp6.userGroups.delete("int-sg-u-mde-nld-breda"); inp6.deviceGroups = inp6.deviceGroups.filter((g) => g.id !== "gdb");
    ok("🗑 both groups already gone: nothing to delete, said", MM.planRetire(MM.compute(migCfg, inp6, waves, now), inp6, "nl-breda", null, migCfg).skipped.some((x) => /does not exist — nothing left to delete|do not exist — nothing left to delete/.test(x)));
  }

  // -------------------------------------------- retired: the table forgets --
  {
    const retCfg = MM.normConfig(Object.assign({}, base, { batched: [], migrated: [], retired: ["NL-Breda"] }));
    ok("retired: normConfig keeps it, the default retires nothing", retCfg.retired.join() === "NL-Breda" && MM.normConfig(null).retired.length === 0);
    ok("retired: countryRows skips the pilot, NL stays", MM.countryRows(retCfg).map((r) => r.suffix).join() === "NL");
    const inp = fixture(); inp.waveChildren.get("wu").delete("sbr"); inp.waveChildren.get("wd").delete("gdb");
    inp.userGroups.delete("int-sg-u-mde-nld-breda"); inp.deviceGroups = inp.deviceGroups.filter((g) => g.id !== "gdb"); inp.userMembers.delete("sbr"); inp.deviceMembers.delete("gdb");
    const m = MM.compute(retCfg, inp, waves, now), NL = m.rows.find((r) => r.suffix === "NL");
    ok("retired: one row (NL), the Breda source listed as a retired overlap of NL", m.rows.length === 1 && m.unmapped.length === 1 && m.unmapped[0].retired && m.unmapped[0].overlaps === "PVM-UG-CORP-MEM-USERS-NL", JSON.stringify(m.unmapped));
    ok("retired: the hold-back stays — m5 is not wanted by NL, NL is in sync and nested", !NL.uWant.has("m5") && !NL.uAdd.length && !NL.uRemove.length && NL.uHeld === 1 && NL.ugNested && !NL.want.has("em5"), JSON.stringify({ add: NL.uAdd, rem: NL.uRemove, held: NL.uHeld }));
    ok("retired: a later plan for NL writes nothing for Breda", !MM.planOps(m, new Set(["nl"]), all, retCfg).ops.some((o) => /BREDA/.test(JSON.stringify(o))));
    const again = MM.addPilot(retCfg, "NL-Breda", "Euro");
    ok("retired: 🧪 Add as pilot again starts it over (no longer retired or migrated)", !again.retired.length && again.pilots.includes("NL-Breda") && MM.countryRows(again)[0].suffix === "NL-Breda");
  }

  // --------------------------------------------------- the spine says it --
  if (w.T28Spine && w.T28Spine.stages) {
    const rowsOf = (extra) => [Object.assign({ country: "Netherlands", ugNested: true, dgNested: true, uInSync: true, inSync: true, unread: "", pilot: false, batched: false, migrated: false, users: 7, devices: 7, uAdd: 0, add: 0, uRemove: 0, remove: 0 }),
      Object.assign({ country: "NL Breda", ugNested: false, dgNested: false, uInSync: true, inSync: true, unread: "", pilot: true, batched: false, migrated: false, parentCountry: "Netherlands", users: 5, devices: 5, uAdd: 0, add: 0, uRemove: 0, remove: 0 }, extra)];
    const st = (rows) => { const out = w.T28Spine.stages({ region: "Euro", membersRead: true, rows }); return (out.stages || out).find((s) => s.id === "members"); };
    const s1 = st(rowsOf({ ugNested: true, dgNested: true, canMigrate: true, parentLive: true }));
    ok("spine: NL live and Breda not migrated → Members says migrate next", s1 && s1.state === "todo" && /🧪 Migrate NL Breda into Netherlands/.test(s1.next.text), JSON.stringify(s1 && { st: s1.state, n: s1.next }));
    const s2 = st(rowsOf({ migrated: true }));
    ok("spine: migrated → Members says retire next", s2 && s2.state === "todo" && /🗑 Retire NL Breda/.test(s2.next.text), JSON.stringify(s2 && { st: s2.state, n: s2.next }));
    const s3 = st([rowsOf({})[0]]);
    ok("spine: retired (the row gone) → Members is done", s3 && s3.state === "ok", JSON.stringify(s3 && s3.state));
  } else ok("T28Spine.stages is exported", false);
}

run().then(() => {
  console.log(`mderollout-retire: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

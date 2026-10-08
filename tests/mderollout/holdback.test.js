// T28 — ⏸ one hold-back (build 10702). DOM-free: the pair's new names (an
// earlier ↩ Revert name in the saved rules becomes the default; a pair still
// named so in the tenant is found, used as is and said), a hold-back that
// clears EVERY static route into a wave (country group, 🧪 test group, 📌
// pin, the wave itself), ⊘→⏸ Migrate exclusions (① the members plan off the
// 🔎 scan's routes, behind a confirm line; ② ⚡'s removeExclusion wants; ③
// the deletion, refused while a group holds anyone or sits on an
// assignment), the rename and delete steps of applyOps, and their undo.
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
const MM = w.MdeMembers, MR = w.MdeRevert, M = w.MdeRollout;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const lc = (s) => String(s).toLowerCase();

async function run() {
  // ------------------------------------------------------------- names --
  const cfg = MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["NL-Breda", "NL", "GB"] }], pilots: ["NL-Breda"], batched: [] });
  ok("the pair is INT-SG-U/D-MDE-HoldBack; its wording says hold-back", cfg.revertUser === "INT-SG-U-MDE-HoldBack" && cfg.revertDevice === "INT-SG-D-MDE-HoldBack" && /hold-back/.test(cfg.revertDescription) && /⏸/.test(cfg.revertDescription));
  ok("an earlier ↩ Revert name saved in the rules becomes the default", MM.normConfig({ revertUser: "INT-SG-U-MDE-Revert", revertDevice: "int-sg-d-mde-revert" }).revertUser === "INT-SG-U-MDE-HoldBack" && MM.normConfig({ revertDevice: "int-sg-d-mde-revert" }).revertDevice === "INT-SG-D-MDE-HoldBack");
  ok("…any other name is kept", MM.normConfig({ revertUser: "X-HOLD" }).revertUser === "X-HOLD");
  ok("HOLD_OLD names the earlier pair", MM.HOLD_OLD.user.join() === "INT-SG-U-MDE-Revert" && MM.HOLD_OLD.device.join() === "INT-SG-D-MDE-Revert");
  ok("⚡ ⓪ creates the pair under the new name, for ⏸", (() => { const p = MM.planHoldGroups(cfg, { revert: {}, pinnedGroup: {}, skipGroup: {} }); return p.ops.filter((o) => o.type === "create").map((o) => `${o.name}|${o.who}`).join() === "INT-SG-U-MDE-HoldBack|⏸ Hold-back,INT-SG-D-MDE-HoldBack|⏸ Hold-back"; })());

  // readExtra: the tenant still has the ↩ Revert pair → used as is, legacy said
  const realReadAll = w.Graph.readAll;
  w.Graph.readAll = async (p) => {
    if (/startswith\(displayName,'INT-SG-U-'\)/.test(p)) return [];
    const q = decodeURIComponent(p);
    if (/eq 'INT-SG-U-MDE-HoldBack'/.test(q) || /eq 'INT-SG-D-MDE-HoldBack'/.test(q)) return [];
    if (/eq 'INT-SG-U-MDE-Revert'/.test(q)) return [{ id: "RV-U", displayName: "INT-SG-U-MDE-Revert" }];
    if (/eq 'INT-SG-D-MDE-Revert'/.test(q)) return [{ id: "RV-D", displayName: "INT-SG-D-MDE-Revert" }];
    if (/\/groups\/RV-U\/members/.test(p)) return [{ id: "u2", userPrincipalName: "bob@x", displayName: "Bob" }];
    if (/\/groups\/RV-D\/members/.test(p)) return [{ id: "e2", deviceId: "a2", displayName: "NLD2" }];
    return [];
  };
  w.Graph.pool = async (items, fn) => Promise.all(items.map((x) => fn(x).then((value) => ({ value })).catch((error) => ({ error }))));
  const extra = await MR.readExtra(cfg, MM.countryRows(cfg), () => {});
  ok("a pair still named ↩ Revert is found and used as is — and said as legacy", extra.revert.user && extra.revert.user.id === "RV-U" && extra.revert.device.id === "RV-D" && extra.revert.legacy.user === "INT-SG-U-MDE-Revert" && extra.revert.legacy.device === "INT-SG-D-MDE-Revert" && extra.revertUsers.has("u2") && extra.revertDevices.has("e2"));
  w.Graph.readAll = async (p) => /eq 'INT-SG-U-MDE-HoldBack'/.test(decodeURIComponent(p)) ? [{ id: "HB-U", displayName: "INT-SG-U-MDE-HoldBack" }] : /eq 'INT-SG-D-MDE-HoldBack'/.test(decodeURIComponent(p)) ? [{ id: "HB-D", displayName: "INT-SG-D-MDE-HoldBack" }] : [];
  const extra2 = await MR.readExtra(cfg, MM.countryRows(cfg), () => {});
  ok("…under the new name: no legacy", extra2.revert.user.id === "HB-U" && !extra2.revert.legacy.user && !extra2.revert.legacy.device);
  w.Graph.readAll = realReadAll;

  // ------------------------------------------------- every route (⏸) --
  const rows = [
    { key: "nl", region: "Euro", country: "Netherlands", suffix: "NL", iso3: "NLD", userGroupName: "PVM-UG-CORP-MEM-USERS-NL", deviceGroupName: "INT-SG-D-NLD", ug: { id: "src-nl", displayName: "PVM-UG-CORP-MEM-USERS-NL" }, ugNested: false, wave: { user: { id: "wu", displayName: "INT-SG-U-WAVE-Euro" }, userName: "INT-SG-U-WAVE-Euro" } },
    { key: "nlb", region: "Euro", country: "NL-Breda", suffix: "NL-Breda", iso3: "NLD-BREDA", pilot: true, userGroupName: "PVM-UG-CORP-MEM-USERS-NL-Breda", deviceGroupName: "INT-SG-D-NLD-BREDA", ug: { id: "src-nlb", displayName: "PVM-UG-CORP-MEM-USERS-NL-Breda" }, ugNested: false, wave: { user: { id: "wu", displayName: "INT-SG-U-WAVE-Euro" }, userName: "INT-SG-U-WAVE-Euro" } },
  ];
  const routes = new Map([["int-sg-u-wave-euro", { kind: "user", label: "wave Euro (direct member)", region: "Euro" }], ["int-sg-d-wave-euro", { kind: "device", label: "wave Euro (direct member)", region: "Euro" }],
    ["int-sg-u-wave-euro-test", { kind: "user", label: "🧪 test group Euro", region: "Euro" }], ["int-sg-d-wave-euro-test", { kind: "device", label: "🧪 test group Euro", region: "Euro" }], ["int-sg-d-mde-pinned", { kind: "device", label: "📌 pinned group", region: "" }]]);
  const ctx = { ticks: new Set(["u:u1", "m:m1"]), rows, cfg, revert: { user: { id: "HB-U", displayName: "INT-SG-U-MDE-HoldBack" }, device: { id: "HB-D", displayName: "INT-SG-D-MDE-HoldBack" } }, revertUsers: new Map(), revertDevices: new Map(), reason: "Outlook add-in", routes };
  const card = { pick: { type: "user" }, names: new Map(), failed: [],
    user: { id: "u1", displayName: "Hans", upn: "hans@x", groups: new Set(["wu", "su-nlb", "t-u"]), direct: [{ id: "su-nlb", name: "INT-SG-U-NLD-BREDA" }, { id: "t-u", name: "INT-SG-U-WAVE-Euro-Test" }, { id: "wu", name: "INT-SG-U-WAVE-Euro" }, { id: "other", name: "PVM-UG-Finance" }] },
    devices: [{ key: "m:m1", objId: "e1", deviceId: "a1", name: "NLD1", stale: false, direct: [{ id: "dg-nlb", name: "INT-SG-D-NLD-BREDA" }, { id: "pin", name: "INT-SG-D-MDE-Pinned" }, { id: "t-d", name: "INT-SG-D-WAVE-Euro-Test" }], groups: new Set(["dg-nlb", "pin", "t-d"]) }] };
  const u = card.user, d = card.devices[0];
  ok("routesOf: the country group, the 🧪 test group and the wave itself for a user — not a group outside the rollout", MR.routesOf(u.direct, "user", MR.countryNames(rows, cfg), ctx).map((g) => g.name).join() === "INT-SG-U-NLD-BREDA,INT-SG-U-WAVE-Euro-Test,INT-SG-U-WAVE-Euro");
  ok("…the country group, the 📌 pin and the 🧪 test group for a device", MR.routesOf(d.direct, "device", MR.countryNames(rows, cfg), ctx).map((g) => g.name).join() === "INT-SG-D-NLD-BREDA,INT-SG-D-MDE-Pinned,INT-SG-D-WAVE-Euro-Test");
  const p = MR.planRevert(card, ctx);
  const rem = p.ops.filter((o) => o.type === "remove");
  ok("⏸ one person: into the pair, then out of EVERY route, each after the add of its kind", p.runKind === "revert" && p.ops.filter((o) => o.type === "add").length === 2
    && rem.map((o) => o.group.name).join() === "INT-SG-U-NLD-BREDA,INT-SG-U-WAVE-Euro-Test,INT-SG-U-WAVE-Euro,INT-SG-D-NLD-BREDA,INT-SG-D-MDE-Pinned,INT-SG-D-WAVE-Euro-Test"
    && rem.every((o) => o.needsOk && o.needsOk.length === 1 && p.ops[o.needsOk[0]].type === "add" && p.ops[o.needsOk[0]].memberKind === o.memberKind), p.ops.map((o) => `${o.type}:${o.group && o.group.name}`).join());
  ok("…the step says which route goes", rem.some((o) => /out of the 🧪 test group Euro/.test(o.label)) && rem.some((o) => /out of the 📌 pinned group/.test(o.label)) && rem.some((o) => /out of the wave Euro \(direct member\)/.test(o.label)) && rem.some((o) => /out of the country group/.test(o.label)));
  const none = MR.planRevert({ pick: { type: "user" }, names: new Map(), failed: [], user: { id: "u5", displayName: "Nobody", upn: "n@x", groups: new Set(), direct: [{ id: "x", name: "PVM-UG-Finance" }] }, devices: [] }, Object.assign({}, ctx, { ticks: new Set(["u:u5"]) }));
  ok("in no route at all: nothing to hold back, said with the routes it looked at", !none.ops.length && /in no static route into a user wave \(country group, pilot, 🧪 test group, the wave itself\)/.test(none.skipped[0]));
  ok("the bulk line says hold back", MR.bulkLine({ users: 2, devices: 1 }, ["Euro"]) === "hold back 2 users and 1 device in wave Euro; they lose the new MDE policies");
  const many = MR.planRevertMany([{ key: "u:u1", card, ticks: new Set(["u:u1", "m:m1"]) }], ctx);
  ok("the list: a 🧪 / wave route counts its region in the confirm line, and names the route as its 'who'", many.waves.join() === "Euro" && many.ops.some((o) => o.type === "remove" && o.who === "🧪 test group Euro") && /hold back 1 user and 1 device in wave Euro/.test(many.confirmLine));
  const both = MR.planRevert(Object.assign({}, card, { user: Object.assign({}, u, { excluded: true }) }), ctx);
  ok("also in ⊘: the note points at the migration, not at ⊘", both.warnings.some((x) => /also in the ⊘ exclusion group/.test(x) && /Migrate exclusions/.test(x)));

  // -------------------------------------------- ⊘→⏸ migrate (①) --
  const base = { users: [{ id: "u1", displayName: "Hans", userPrincipalName: "hans@x" }, { id: "u2", displayName: "Bob", userPrincipalName: "bob@x" }], devices: [{ id: "e1", deviceId: "a1", displayName: "NLD1" }, { id: "e3", deviceId: "a3", displayName: "ITA3" }],
    groups: { user: { id: "EX-U", displayName: "INT-SG-U-MDE-Exclusion" }, device: { id: "EX-D", displayName: "INT-SG-D-MDE-Exclusion" } }, managed: [] };
  const wave = { id: "wu", name: "INT-SG-U-WAVE-Euro", region: "Euro", audience: "user" }, waveD = { id: "wd", name: "INT-SG-D-WAVE-Euro", region: "Euro", audience: "device" };
  const scan = { rows: [
    { key: "user:u1", kind: "user", id: "u1", name: "Hans", upn: "hans@x", via: null, routes: [{ wave, group: { id: "su-nlb", name: "INT-SG-U-NLD-BREDA" }, direct: true, dynamic: false, deep: false }] },
    { key: "user:u2", kind: "user", id: "u2", name: "Bob", upn: "bob@x", via: null, routes: [{ wave, group: { id: "src-nl", name: "PVM-UG-CORP-MEM-USERS-NL" }, direct: true, dynamic: true, deep: false }, { wave, group: null, direct: true, dynamic: false, deep: false }] },
    { key: "user:u9", kind: "user", id: "u9", name: "Nested Nick", upn: "nick@x", via: "PVM-UG-Legacy-Exclusions", routes: [{ wave, group: { id: "su-nld", name: "INT-SG-U-NLD" }, direct: true, dynamic: false, deep: false }] },
    { key: "device:e1", kind: "device", id: "e1", name: "NLD1", deviceId: "a1", via: null, routes: [{ wave: waveD, group: { id: "dg-nlb", name: "INT-SG-D-NLD-BREDA" }, direct: true, dynamic: false, deep: false }, { wave: waveD, group: { id: "t-d", name: "INT-SG-D-WAVE-Euro-Test" }, direct: false, dynamic: false, deep: true }] },
  ] };
  const now = { rows: [{ key: "u:u1", state: "half", user: { displayName: "Hans" }, missing: [{ name: "NLD1-B" }] }], users: 2, devices: 2, half: 1 };
  const mctx = { cfg, rows, routes, reason: "one hold-back", revert: { user: { id: "RV-U", displayName: "INT-SG-U-MDE-Revert" }, device: null, legacy: { user: "INT-SG-U-MDE-Revert", device: null } }, revertUsers: new Map([["u2", { id: "u2" }]]), revertDevices: new Map() };
  const mp = MR.planMigrate({ base, scan, now }, mctx);
  const T = (o) => `${o.type}:${o.group ? o.group.name || o.group.ref : o.name}${o.type === "rename" ? `→${o.to}` : ""}${o.ids ? ":" + o.ids.join("+") : ""}${o.needsOk ? "@" + o.needsOk.join("+") : ""}`;
  ok("① rename the legacy pair first, create the missing side, add whoever is not held back yet, then out of every static route and out of ⊘ — each after the add of its kind",
    mp.ops.map(T).join(" ") === "rename:INT-SG-U-MDE-Revert→INT-SG-U-MDE-HoldBack create:INT-SG-D-MDE-HoldBack add:INT-SG-U-MDE-HoldBack:u1@ add:INT-SG-D-MDE-HoldBack:e1+e3@ remove:INT-SG-U-NLD-BREDA:u1@2 remove:INT-SG-U-WAVE-Euro:u2@2 remove:INT-SG-D-NLD-BREDA:e1@3 remove:INT-SG-U-MDE-Exclusion:u1+u2@2 remove:INT-SG-D-MDE-Exclusion:e1+e3@3".replace(/@ /g, " "), mp.ops.map(T).join(" "));
  ok("…run kind exmigrate, the reason on the adds, removals typed, the ⊘ removals marked fromExclusion", mp.runKind === "exmigrate" && mp.migrateExclusion && mp.hasRemoval && mp.ops.filter((o) => o.type === "add").every((o) => o.reason === "one hold-back") && mp.ops.filter((o) => o.fromExclusion).length === 2);
  ok("…a dynamic route and a deeper nesting are said, not written; a member ⊘ holds through a nested group is said", mp.skipped.some((s) => /Bob: in INT-SG-U-WAVE-Euro through PVM-UG-CORP-MEM-USERS-NL — a dynamic group/.test(s)) && mp.skipped.some((s) => /NLD1: .*nested deeper/.test(s)) && mp.skipped.some((s) => /Nested Nick: in ⊘ through PVM-UG-Legacy-Exclusions/.test(s)));
  ok("…already held back: only taken out of ⊘; the half pair is warned about", mp.warnings.some((x) => /bob@x is already held back — only taken out of ⊘/.test(x)) && mp.warnings.some((x) => /Hans: NLD1-B is not in ⊘ and not held back by this run/.test(x)));
  ok("…the counts and the confirm line", mp.counts.users === 2 && mp.counts.devices === 2 && mp.waves.join() === "Euro" && mp.confirmLine === "move 2 users and 2 devices from ⊘ Exclusion to ⏸ Hold-back in wave Euro; the exclusion groups are emptied");
  const noScan = MR.planMigrate({ base, scan: null, now }, mctx);
  ok("no scan yet: refused, nothing planned", !noScan.ops.length && /not scanned/.test(noScan.refused));
  const empty = MR.planMigrate({ base: { users: [], devices: [], groups: base.groups }, scan: { rows: [] }, now: null }, mctx);
  ok("an empty pair: nothing to move, ③ is next", !empty.ops.some((o) => o.type === "add" || o.type === "remove") && empty.skipped.some((s) => /Both exclusion groups are empty/.test(s)) && !empty.confirmLine);

  // ---------------------------------------- ⊘→⏸ ② ⚡ removeExclusion --
  const cfgR = M.normConfig({ waveRegions: ["Euro"] });
  const found = new Map(cfgR.groups.map((g, i) => [lc(g.name), { id: `g${i}`, displayName: g.name }]));
  const exU = found.get(lc(cfgR.exclusionUser)).id, exD = found.get(lc(cfgR.exclusionDevice)).id;
  const P = (name, audience, assignments) => ({ key: name, name, audience, surface: "settingsCatalog", reach: w.Conflict.reachOf({ assignments }), item: { assignments } });
  const modelR = { cfg: cfgR, newP: [P("Win - D - AV", "device", [{ kind: "Included", groupId: "wd" }, { kind: "Excluded", groupId: exD }]), P("Win - U - Edge", "user", [{ kind: "Included", groupId: "wu" }]), P("Win - D - ASR", "device", [{ kind: "Included", groupId: exD }])],
    oldP: [P("Old - D - AV", "device", [{ kind: "All devices" }, { kind: "Excluded", groupId: exU }])] };
  const r = M.rolloutWants("removeExclusion", modelR, { kinds: new Map(), found, twins: M.twinIndex(cfgR, found), names: new Map(), pairs: [] });
  ok("② every policy, new or old, whose assignments name the pair — an include too, said", r.wants.map((x) => `${x.P.name}|${x.groupName}|${x.action}`).sort().join() === "Old - D - AV|INT-SG-U-MDE-Exclusion|remove,Win - D - ASR|INT-SG-D-MDE-Exclusion|remove,Win - D - AV|INT-SG-D-MDE-Exclusion|remove"
    && r.wants.find((x) => x.P.name === "Win - D - ASR").note === "it INCLUDED the exclusion group" && M.ROLLOUT.removeExclusion.verb === "remove", JSON.stringify(r.wants.map((x) => [x.P.name, x.groupName])));
  const r0 = M.rolloutWants("removeExclusion", modelR, { kinds: new Map(), found: new Map(), twins: new Map(), names: new Map(), pairs: [] });
  ok("…a pair that does not exist: nothing to take off, said", !r0.wants.length && r0.skipped.length === 2 && /does not exist — nothing to take off/.test(r0.skipped[0]));

  // ------------------------------------------------ ⊘→⏸ ③ delete --
  const pm = { newP: [P("Win - D - AV", "device", [{ kind: "Excluded", groupId: "EX-D" }])], oldP: [] };
  const d1 = MR.planDeleteExclusion({ base }, pm, cfgR);
  ok("③ refused while a group holds anyone", !d1.ops.length && d1.skipped.some((s) => /INT-SG-U-MDE-Exclusion: still holds 2 users — ① Members first/.test(s)) && d1.skipped.some((s) => /INT-SG-D-MDE-Exclusion: still holds 2 devices/.test(s)));
  const d2 = MR.planDeleteExclusion({ base: Object.assign({}, base, { users: [], devices: [] }) }, pm, cfgR);
  ok("…the empty user group is deleted; the device one waits for ② (still on an assignment)", d2.ops.map((o) => `${o.type}:${o.group.name}`).join() === "deletegroup:INT-SG-U-MDE-Exclusion" && d2.skipped.some((s) => /INT-SG-D-MDE-Exclusion: still on 1 assignment \(Win - D - AV\) — ② Policies first/.test(s)) && d2.deleteExclusion && d2.runKind === "exmigrate" && d2.hasRemoval);
  const d3 = MR.planDeleteExclusion({ base: Object.assign({}, base, { users: [], devices: [] }) }, { newP: [], oldP: [] }, cfgR);
  ok("…both, once empty and off every assignment; permanent, said", d3.ops.length === 2 && d3.warnings.some((x) => /permanent/i.test(x) && /cannot undo/.test(x)));
  const d4 = MR.planDeleteExclusion({ base: { users: [], devices: [], groups: {} } }, pm, cfgR);
  ok("…a pair already gone: nothing to delete", !d4.ops.length && d4.skipped.length === 2);

  // ------------------------------------------ applyOps: rename, delete --
  const calls = [];
  let exists = true;
  w.Graph.readAll = async (p) => { calls.push(["readAll", p]); return /\/members\/microsoft\.graph\.device/.test(p) && exists && /EX-D/.test(p) ? [{ id: "e1" }] : []; };
  w.Graph.get = async (p) => { calls.push(["get", p]); if (/\/groups\/EX-U/.test(p) && !exists) { const e = new Error("not found"); e.status = 404; e.kind = "notfound"; throw e; } return { id: "x", displayName: "INT-SG-U-MDE-HoldBack" }; };
  w.Graph.del = async (p) => { calls.push(["del", p]); if (/\/groups\/EX-U$/.test(p)) exists = false; return null; };
  w.Graph.patch = async (p, body) => { calls.push(["patch", p, body.displayName]); return null; };
  // the rename is MdeRollout.renameGroup's (🌊's, read back there) — stubbed to its contract
  w.MdeRollout.renameGroup = async (g, to) => { calls.push(["patch", `/groups/${g.id}`, to]); return { ok: true, verified: true, note: "", group: { id: g.id, displayName: to } }; };
  const ra = await MM.applyOps([{ type: "rename", key: "exmigrate", group: { id: "RV-U", name: "INT-SG-U-MDE-Revert" }, from: "INT-SG-U-MDE-Revert", to: "INT-SG-U-MDE-HoldBack" }, { type: "deletegroup", key: "exmigrate", group: { id: "EX-D", name: "INT-SG-D-MDE-Exclusion" } }, { type: "deletegroup", key: "exmigrate", group: { id: "EX-U", name: "INT-SG-U-MDE-Exclusion" } }], {});
  ok("rename: PATCH, read back, in the done list with from and to", ra.results[0].ok && ra.results[0].verified && calls.some((c) => c[0] === "patch" && /RV-U/.test(c[1]) && c[2] === "INT-SG-U-MDE-HoldBack") && ra.done.some((d) => d.type === "rename" && d.from === "INT-SG-U-MDE-Revert" && d.to === "INT-SG-U-MDE-HoldBack"), JSON.stringify(ra.results[0]));
  ok("delete: a group that still holds anyone is read and left alone", !ra.results[1].ok && /still holds 1 member — not deleted/.test(ra.results[1].note) && !calls.some((c) => c[0] === "del" && /EX-D/.test(c[1])));
  ok("…an empty one is deleted and the read-back's 404 verifies it", ra.results[2].ok && ra.results[2].verified && calls.some((c) => c[0] === "del" && /\/groups\/EX-U$/.test(c[1])) && ra.done.some((d) => d.type === "deletegroup" && d.group.name === "INT-SG-U-MDE-Exclusion"));
  const inv = MM.inverseOf(ra.done);
  ok("undo: the rename is renamed back; the deletion has no way back, said", inv.ops.length === 1 && inv.ops[0].type === "rename" && inv.ops[0].from === "INT-SG-U-MDE-HoldBack" && inv.ops[0].to === "INT-SG-U-MDE-Revert" && inv.warnings.some((x) => /INT-SG-U-MDE-Exclusion\) cannot be brought back/.test(x)));
  const ex3 = { userGroups: new Map(), userMembers: new Map(), upn: new Map(), revert: { user: { id: "RV-U", displayName: "INT-SG-U-MDE-Revert" }, device: null, legacy: { user: "INT-SG-U-MDE-Revert", device: null } }, revertUsers: new Map(), revertDevices: new Map() };
  MR.patch(ex3, null, ra.done, cfg);
  ok("patch: the renamed pair is known under its new name, legacy no more", ex3.revert.user.displayName === "INT-SG-U-MDE-HoldBack" && ex3.revert.legacy.user === null);

  console.log(`T28 one hold-back: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

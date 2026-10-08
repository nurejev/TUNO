// T28 — ↩ Revert and 🔄 country groups engine (build 10679). DOM-free: the
// CC→ISO3 mapping (the device groups' own, several sources and unmapped
// groups), the sync diff (adds, leavers, held back — a reverted member is
// never in the default write set, and the confirm is enforced), the swap
// (its check stops the unnest when the sets differ), the revert / undo pair
// with the paired user and device, and the run kinds the ledger records.
// 10685: the list — many people, one merged plan behind a confirm line.
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
  + "\n;Object.assign(window, {MdeRollout, MdeMembers, MdeRevert, MdeExclude, Graph});");
const MM = w.MdeMembers, MR = w.MdeRevert;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}

async function run() {
  // ------------------------------------------------------------ mapping --
  const cfg = MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["NL-Breda", "NL", "GB", "DE"] }, { region: "Americas", suffixes: ["US", "DEM-X"] }], pilots: ["NL-Breda"], batched: [] });
  ok("defaults: INT-SG-U-, the Revert pair, 14 days", cfg.userGroupPrefix === "INT-SG-U-" && cfg.revertUser === "INT-SG-U-MDE-HoldBack" && cfg.revertDevice === "INT-SG-D-MDE-HoldBack" && cfg.syncStaleDays === 14);
  ok("normConfig keeps them", MM.normConfig(JSON.parse(JSON.stringify(Object.assign({}, cfg, { syncStaleDays: 7, revertUser: "X-R" })))).syncStaleDays === 7 && MM.normConfig({ revertUser: "X-R" }).revertUser === "X-R");
  const rowsT = MM.countryRows(cfg);
  const map = MR.mapping(rowsT, cfg);
  const m = (s) => map.find((x) => x.suffix === s);
  ok("CC→ISO3 is the device group's: GB → INT-SG-U-GBR beside INT-SG-D-GBR", m("GB").user === "INT-SG-U-GBR" && m("GB").device === "INT-SG-D-GBR" && m("GB").iso3 === "GBR");
  ok("a site group mirrors its device group: NL-Breda → INT-SG-U-NLD-BREDA", m("NL-Breda").user === "INT-SG-U-NLD-BREDA" && m("NL-Breda").device === "INT-SG-D-NLD-BREDA");
  ok("several sources in one country each keep their own pair (NL and NL-Breda)", m("NL").user === "INT-SG-U-NLD" && m("NL-Breda").user !== m("NL").user);
  ok("a suffix with no code is listed, never guessed", m("DEM-X").user === null && m("DEM-X").device === null && /⚙️/.test(m("DEM-X").why));
  ok("the mapping's signature moves with the table", MR.mappingSig(rowsT, cfg) !== MR.mappingSig(MM.countryRows(MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["GB"] }] })), cfg));

  // ------------------------------------------------------------- model --
  const now = Date.parse("2026-10-05T12:00:00Z");
  const iso = (t) => new Date(t).toISOString();
  const day = 86400000;
  const input = {
    countryGroups: [
      { id: "src-nl", displayName: "PVM-UG-CORP-MEM-USERS-NL", groupTypes: ["DynamicMembership"] },
      { id: "src-gb", displayName: "PVM-UG-CORP-MEM-USERS-GB", groupTypes: ["DynamicMembership"] },
      { id: "src-odd", displayName: "PVM-UG-CORP-MEM-USERS-XX", groupTypes: ["DynamicMembership"] },
    ],
    deviceGroups: [{ id: "dg-nld", displayName: "INT-SG-D-NLD" }, { id: "dg-gbr", displayName: "INT-SG-D-GBR" }],
    usersByGroup: new Map([["src-nl", [{ id: "u1", userPrincipalName: "ann@x" }, { id: "u2", userPrincipalName: "bob@x" }, { id: "u3", userPrincipalName: "cat@x" }]], ["src-gb", [{ id: "u4", userPrincipalName: "dan@x" }]]]),
    managed: [
      { id: "m1", deviceName: "NLD1", userId: "u1", azureADDeviceId: "a1", lastSyncDateTime: iso(now) },
      { id: "m2", deviceName: "NLD2", userId: "u2", azureADDeviceId: "a2", lastSyncDateTime: iso(now) },
      { id: "m3", deviceName: "NLD3", userId: "u3", azureADDeviceId: "a3", lastSyncDateTime: iso(now - 2 * day) },
      { id: "m4", deviceName: "GBR4", userId: "u4", azureADDeviceId: "a4", lastSyncDateTime: iso(now) },
    ],
    entra: [{ id: "e1", deviceId: "a1", displayName: "NLD1" }, { id: "e2", deviceId: "a2", displayName: "NLD2" }, { id: "e3", deviceId: "a3", displayName: "NLD3" }, { id: "e4", deviceId: "a4", displayName: "GBR4" }, { id: "e9", deviceId: "a9", displayName: "NLD9-GONE" }],
    deviceMembers: new Map([["dg-nld", new Set(["e1", "e9"])], ["dg-gbr", new Set(["e4"])]]),
    waveChildren: new Map([["wu-euro", new Set(["src-nl", "su-gbr"])], ["wd-euro", new Set(["dg-nld", "dg-gbr"])]]),
    waveUsers: new Map([["wu-euro", new Set()]]),
    held: new Set(),
    reverted: new Set(["e2"]),
    failed: [], readAt: now,
  };
  const waves = new Map([["euro", { user: { id: "wu-euro", displayName: "INT-SG-U-WAVE-Euro" }, device: { id: "wd-euro", displayName: "INT-SG-D-WAVE-Euro" }, userName: "INT-SG-U-WAVE-Euro", deviceName: "INT-SG-D-WAVE-Euro" }],
    ["americas", { user: null, device: null, userName: "INT-SG-U-WAVE-Americas", deviceName: "INT-SG-D-WAVE-Americas" }]]);
  const mm = MM.compute(cfg, input, waves, now);
  const nl = mm.rows.find((r) => r.suffix === "NL");
  ok("the 👥 device rule is reused: a reverted device is held — not wanted, flagged", !nl.want.has("e2") && nl.devices.find((d) => d.objId === "e2").reverted && nl.devices.find((d) => d.objId === "e2").held && nl.problems.reverted === 1);
  ok("…and a non-reverted device is still added (e3), a gone one removed (e9)", nl.add.includes("e3") && nl.remove.includes("e9"));
  const extra = {
    userGroups: new Map([["int-sg-u-gbr", { id: "su-gbr", displayName: "INT-SG-U-GBR" }]]),
    userMembers: new Map([["su-gbr", new Set(["u4", "u8"])]]),
    upn: new Map([["u8", "eve@x"]]),
    revert: { user: { id: "rv-u", displayName: "INT-SG-U-MDE-HoldBack" }, device: { id: "rv-d", displayName: "INT-SG-D-MDE-HoldBack" } },
    revertUsers: new Map([["u2", { id: "u2", upn: "bob@x", name: "Bob" }], ["u7", { id: "u7", upn: "gone@x", name: "Gone" }]]),
    revertDevices: new Map([["e2", { id: "e2", deviceId: "a2", name: "NLD2" }], ["e7", { id: "e7", deviceId: "", name: "OLD7" }]]),
    failed: [], readAt: now,
  };
  const sm = MR.model(cfg, mm, input, extra, { now, lastSynced: { gb: iso(now - 20 * day) }, reasons: { u2: { reason: "kiosk app breaks under ASR" } } });
  const R = (s) => sm.rows.find((r) => r.suffix === s);
  ok("NL: no static user group yet — all three non-reverted users are adds, Bob held back", !R("NL").ug && R("NL").user.add.map((u) => u.id).join() === "u1,u3" && R("NL").user.held.map((u) => u.id).join() === "u2");
  ok("…the held-back user carries the reason the revert stored", R("NL").user.held[0].reason === "kiosk app breaks under ASR");
  ok("NL devices: e3 add, e9 a leaver, e2 held back (reverted, not in the group)", R("NL").device.add.map((d) => d.id).join() === "e3" && R("NL").device.leave.map((d) => d.id).join() === "e9" && R("NL").device.held.map((d) => d.id).join() === "e2");
  ok("GB: the static group holds eve, who left the source — a leaver", R("GB").user.leave.map((u) => u.upn).join() === "eve@x" && !R("GB").user.add.length);
  ok("swap state: NL's source is nested, GB is swapped (static nested)", R("NL").sourceNested && !R("NL").staticNested && R("GB").staticNested && !R("GB").sourceNested);
  ok("the Revert clean-up: members no country holds any more", sm.cleanup.users.map((u) => u.id).join() === "u7" && sm.cleanup.devices.map((d) => d.id).join() === "e7");
  ok("staleness: GB synced 20 days ago with drift → stale (14 days)", R("GB").stale && R("GB").drift > 0 && sm.stale >= 1);

  // ------------------------------------------------------------ 🔄 sync --
  // 10680 (Mihai: "the group creations should be one and the same … at the
  // wave members, keep it there — user and device, same place"): 🔄 creates
  // nothing. NL has no static user group in sm — its user lines are not
  // offered; the rest of the tests run with INT-SG-U-NLD existing, empty.
  ok("10680: a country with no static user group offers no user lines in 🔄", !MR.syncItems(sm, "all").some((x) => x.kind === "user" && x.row && x.row.key === "nl" && x.dir !== "leave"));
  ok("10680: …and a plan never creates one", !MR.planSync(sm, MR.syncItems(sm, "all"), MR.defaultSyncTicks(MR.syncItems(sm, "all")), {}).ops.some((o) => o.type === "create"));
  const extraN = Object.assign({}, extra, { userGroups: new Map([...extra.userGroups, ["int-sg-u-nld", { id: "su-nld", displayName: "INT-SG-U-NLD" }]]), userMembers: new Map([...extra.userMembers, ["su-nld", new Set()]]) });
  const smN = MR.model(cfg, mm, input, extraN, { now, lastSynced: { gb: iso(now - 20 * day) }, reasons: { u2: { reason: "kiosk app breaks under ASR" } } });
  const items = MR.syncItems(smN, "all");
  const ticks = MR.defaultSyncTicks(items);
  const k = (dir, kind, row, id) => `${dir}|${kind}|${row}|${id}`;
  ok("the default write set: adds only", [...ticks].every((x) => x.startsWith("add|")) && ticks.has(k("add", "u", "nl", "u1")) && ticks.has(k("add", "d", "nl", "e3")));
  ok("a reverted member is never in the default write set", !ticks.has(k("reinc", "u", "nl", "u2")) && !ticks.has(k("reinc", "d", "nl", "e2")) && items.some((x) => x.key === k("reinc", "u", "nl", "u2")));
  ok("leavers and the clean-up are offered, unticked", items.some((x) => x.key === k("leave", "u", "gb", "u8")) && !ticks.has(k("leave", "u", "gb", "u8")) && items.some((x) => x.key === k("clean", "u", "-", "u7")) && !ticks.has(k("clean", "u", "-", "u7")));
  ok("a per-ISO3 scope shows that row only, and no clean-up", MR.syncItems(smN, "gb").every((x) => x.row && x.row.key === "gb"));
  const p1 = MR.planSync(smN, items, ticks, {});
  ok("the default plan: add ann and cat to INT-SG-U-NLD, add NLD3 — no create, no removal", !p1.refused && p1.runKind === "groupsync" && !p1.ops.some((o) => o.type === "create")
    && p1.ops[0].type === "add" && p1.ops[0].ids.join() === "u1,u3" && p1.ops[0].group.id === "su-nld" && p1.ops.some((o) => o.type === "add" && o.memberKind === "device" && o.ids.join() === "e3") && !p1.hasRemoval);
  const t2 = new Set(ticks); t2.add(k("reinc", "u", "nl", "u2")); t2.add(k("reinc", "d", "nl", "e2"));
  const line = MR.reincludeLine(items, t2);
  ok("the confirm names the count and the wave", line === "re-include 1 user and 1 device in wave Euro; they lose the old MDE policies", line);
  const p2 = MR.planSync(smN, items, t2, {});
  ok("a ticked re-include without the confirm is refused", !!p2.refused && /re-include 1 user and 1 device/.test(p2.refused) && !p2.ops.length);
  const p3 = MR.planSync(smN, items, t2, { confirm: "re-include 1 user in wave Euro; they lose the old MDE policies" });
  ok("a confirm for another count does not count", !!p3.refused);
  const p4 = MR.planSync(smN, items, t2, { confirm: line });
  const rvU = p4.ops.find((o) => o.type === "remove" && o.group.id === "rv-u");
  const addU = p4.ops.findIndex((o) => o.type === "add" && o.memberKind === "user");
  ok("with the confirm: Bob into INT-SG-U-NLD and out of Revert only after that add (needsOk)", !p4.refused && p4.ops[addU].ids.includes("u2") && rvU && rvU.ids.join() === "u2" && rvU.needsOk.join() === String(addU) && rvU.batch);
  const t3 = new Set([k("leave", "u", "gb", "u8"), k("clean", "u", "-", "u7"), k("clean", "d", "-", "e7")]);
  const p5 = MR.planSync(smN, items, t3, {});
  ok("leavers out of the country group and the clean-up out of Revert, by $batch", p5.ops.length === 3 && p5.ops.every((o) => o.type === "remove" && o.batch) && p5.ops[0].group.id === "su-gbr" && p5.ops[1].group.id === "rv-u" && p5.ops[2].group.id === "rv-d" && p5.hasRemoval);

  // ------------------------------------------------------------ ⇄ swap --
  const sm0 = MR.model(cfg, mm, input, Object.assign({}, extra, { revertUsers: new Map(), revertDevices: new Map() }), { now });
  const sw0 = MR.planSwap(sm0, "Euro");
  ok("10680: no INT-SG-U-NLD yet — the swap creates nothing and points at 👥", !sw0.ops.some((o) => o.key === "nl") && sw0.skipped.some((x) => /INT-SG-U-NLD does not exist — create & fill it in 👥 Wave members/.test(x)));
  const sm2 = MR.model(cfg, mm, input, Object.assign({}, extraN, { revertUsers: new Map(), revertDevices: new Map() }), { now });
  const sw = MR.planSwap(sm2, "Euro");
  const nlOps = sw.ops.filter((o) => o.key === "nl");
  ok("NL: top up → nest → check → unnest, in that order", nlOps.map((o) => o.type).join() === "add,nest,swapcheck,unnest" && sw.runKind === "waveswap");
  ok("the unnest waits for the check, the check for the fill and nest", nlOps[3].needsOk.join() === String(sw.ops.indexOf(nlOps[2])) && nlOps[2].needsOk.length === 2 && nlOps[3].child.id === "src-nl" && nlOps[3].parent.id === "wu-euro");
  ok("GB is already swapped — said, not planned", sw.skipped.some((s) => /GB|United Kingdom/.test(s) && /already swapped/.test(s)) && !sw.ops.some((o) => o.key === "gb"));
  const swHeld = MR.planSwap(smN, "Euro");
  ok("a source with a reverted user is not swapped: the wave would change", !swHeld.ops.some((o) => o.key === "nl") && swHeld.skipped.some((s) => /HoldBack/.test(s)));

  // applyOps runs the check: equal sets → the unnest runs; different → it does not
  const members = new Map([["wu-euro", new Set(["src-nl"])], ["su-nld", new Set()], ["src-nl", new Set(["u1", "u2", "u3"])]]);
  const calls = [];
  w.Graph.readAll = async (p) => {
    let mt = /^\/groups\/([^/]+)\/transitiveMembers\/microsoft\.graph\.user/.exec(p);
    if (mt) return [...(members.get(mt[1]) || [])].map((id) => ({ id, userPrincipalName: `${id}@x` }));
    mt = /^\/groups\/([^/]+)\/members\/microsoft\.graph\.(user|device|group)/.exec(p);
    if (mt) return [...(members.get(mt[1]) || [])].filter((id) => mt[2] === "group" ? /^(su|src)-/.test(id) : !/^(su|src)-/.test(id)).map((id) => ({ id }));
    if (/^\/groups\?\$filter/.test(p)) return [];
    return [];
  };
  w.Graph.patch = async (p, body) => { const gid = p.split("/")[2]; calls.push(["PATCH", gid]); body["members@odata.bind"].forEach((r) => members.get(gid).add(r.split("/").pop())); return null; };
  w.Graph.post = async (p, body) => { const gid = p.split("/")[2]; calls.push(["POST", gid]); members.get(gid).add(body["@odata.id"].split("/").pop()); return null; };
  w.Graph.del = async (p) => { const [, , gid, , id] = p.split("/"); calls.push(["DELETE", gid, id]); members.get(gid).delete(decodeURIComponent(id)); return null; };
  w.Graph.batch = async (reqs) => { const out = {}; for (const r of reqs) { const [, , gid, , id] = r.url.split("/"); calls.push(["BATCH-DELETE", gid, id]); members.get(gid).delete(decodeURIComponent(id)); out[r.id] = { body: null }; } return out; };
  const swapOps = (fill) => [
    { type: "add", key: "nl", group: { id: "su-nld", name: "INT-SG-U-NLD" }, ids: fill, memberKind: "user" },
    { type: "nest", key: "nl", parent: { id: "wu-euro", name: "INT-SG-U-WAVE-Euro" }, child: { id: "su-nld", name: "INT-SG-U-NLD" }, kind: "user" },
    { type: "swapcheck", key: "nl", source: { id: "src-nl", name: "PVM-UG-CORP-MEM-USERS-NL" }, target: { id: "su-nld", name: "INT-SG-U-NLD" }, wave: { id: "wu-euro", name: "INT-SG-U-WAVE-Euro" }, needsOk: [0, 1] },
    { type: "unnest", key: "nl", parent: { id: "wu-euro", name: "INT-SG-U-WAVE-Euro" }, child: { id: "src-nl", name: "PVM-UG-CORP-MEM-USERS-NL" }, kind: "user", needsOk: [2] },
  ];
  let r = await MM.applyOps(swapOps(["u1", "u3"]), {});
  ok("the sets differ (u2 missing): the check fails with the difference, the unnest is not run", !r.results[2].ok && /1 user reach/.test(r.results[2].note) && /u2@x/.test(r.results[2].note) && r.results[3].skipped && members.get("wu-euro").has("src-nl"));
  ok("…and the done list has no check, so the undo is the add and the nest", r.done.map((d) => d.type).join() === "add,nest" && MM.inverseOf(r.done).ops.map((o) => o.type).join() === "unnest,remove");
  members.set("wu-euro", new Set(["src-nl"])); members.set("su-nld", new Set());
  r = await MM.applyOps(swapOps(["u1", "u2", "u3"]), {});
  ok("equal sets: checked, then the dynamic group comes out of the wave", r.results.every((x) => x.ok && x.verified) && !members.get("wu-euro").has("src-nl") && members.get("wu-euro").has("su-nld") && /3 users/.test(r.results[2].note));
  ok("the way back (§1): re-nest the source, take the static group out", MM.inverseOf(r.done).ops.map((o) => `${o.type}:${(o.child && o.child.id) || ""}`).slice(0, 2).join() === "nest:src-nl,unnest:su-nld");

  // ---------------------------------------------------------- ↩ revert --
  const card = {
    pick: { type: "user", id: "u1" }, failed: [], names: new Map(),
    user: { id: "u1", displayName: "Ann", upn: "ann@x", groups: new Set(["su-nld", "wu-euro", "src-nl"]), direct: [{ id: "su-nld", name: "INT-SG-U-NLD" }, { id: "src-nl", name: "PVM-UG-CORP-MEM-USERS-NL" }] },
    devices: [
      { key: "m:m1", name: "NLD1", objId: "e1", deviceId: "a1", stale: false, groups: new Set(["dg-nld", "wd-euro"]), direct: [{ id: "dg-nld", name: "INT-SG-D-NLD" }] },
      { key: "m:m5", name: "NLD5-OLD", objId: "e5", deviceId: "a5", stale: true, groups: new Set(["dg-nld", "wd-euro"]), direct: [{ id: "dg-nld", name: "INT-SG-D-NLD" }] },
    ],
  };
  const t = MR.defaultTicks(card);
  ok("the pair by default: the user and their recent device, not the stale one", t.has("u:u1") && t.has("m:m1") && !t.has("m:m5"));
  const dcard = Object.assign({}, card, { pick: { type: "device", managedId: "m1" }, devices: card.devices.map((d, i) => Object.assign({}, d, { searched: i === 0 })) });
  const td = MR.defaultTicks(dcard);
  ok("a device picked: only the device by default", !td.has("u:u1") && td.has("m:m1") && td.size === 1);
  const ctx = { ticks: t, rows: mm.rows, cfg, revert: { user: null, device: { id: "rv-d", displayName: "INT-SG-D-MDE-HoldBack" } }, revertUsers: new Map(), revertDevices: new Map(), reason: "LOB app blocked" };
  const pr = MR.planRevert(card, ctx);
  ok("revert: create the user Revert group, add, then out of INT-SG-U-NLD after the add", pr.runKind === "revert" && pr.ops.map((o) => o.type).join() === "create,add,remove,add,remove"
    && pr.ops[0].name === "INT-SG-U-MDE-HoldBack" && pr.ops[2].group.name === "INT-SG-U-NLD" && pr.ops[2].needsOk.join() === "1" && pr.ops[4].group.name === "INT-SG-D-NLD" && pr.ops[4].needsOk.join() === "3");
  ok("…the dynamic source group is never touched", !pr.ops.some((o) => o.group && o.group.id === "src-nl"));
  ok("…the reason rides on every step", pr.ops.filter((o) => o.type !== "create").every((o) => o.reason === "LOB app blocked"));
  const und = MM.inverseOf(pr.ops.filter((o) => o.type !== "create").map((o) => Object.assign({}, o, { group: o.group.ref ? { id: "rv-u", name: o.group.name } : o.group })));
  ok("undo: back into the country groups, out of Revert", und.ops.map((o) => `${o.type}:${o.group.name}`).join() === "add:INT-SG-D-NLD,remove:INT-SG-D-MDE-HoldBack,add:INT-SG-U-NLD,remove:INT-SG-U-MDE-HoldBack");
  const pu = MR.planRevert(card, Object.assign({}, ctx, { ticks: new Set(["u:u1"]) }));
  ok("one side only: the mix is warned about", pu.warnings.some((x) => /Only the user is held back/.test(x) && /NLD1/.test(x)));
  const pdv = MR.planRevert(card, Object.assign({}, ctx, { ticks: new Set(["m:m1"]) }));
  ok("…the device side alone too", pdv.warnings.some((x) => /Only the device is held back/.test(x)));
  const dynCard = Object.assign({}, card, { user: Object.assign({}, card.user, { groups: new Set(["src-nl", "wu-euro"]), direct: [{ id: "src-nl", name: "PVM-UG-CORP-MEM-USERS-NL" }] }) });
  const pdyn = MR.planRevert(dynCard, Object.assign({}, ctx, { ticks: new Set(["u:u1"]) }));
  ok("a user in the wave only through the dynamic source: swap first, nothing written", !pdyn.ops.length && pdyn.skipped.some((x) => /swap Euro/.test(x) && /INT-SG-U-NLD/.test(x)));
  const pex = MR.planRevert(Object.assign({}, card, { user: Object.assign({}, card.user, { excluded: true }) }), ctx);
  ok("Revert vs ⊘ Exclude: a member in both gets the note", pex.warnings.some((x) => /also in the ⊘ exclusion group/.test(x)));
  const pnr = MR.planRevert(card, Object.assign({}, ctx, { reason: "" }));
  ok("no reason: warned, still planned", pnr.ops.length && pnr.warnings.some((x) => /No reason/.test(x)));
  const pal = MR.planRevert(card, Object.assign({}, ctx, { revertUsers: new Map([["u1", {}]]), revertDevices: new Map([["e1", {}]]) }));
  ok("already reverted: skipped", !pal.ops.length && pal.skipped.length === 2);

  // undo from the Reverted list (§3 way back)
  const un = MR.planUnrevert(sm, [{ kind: "user", id: "u2", name: "bob@x" }, { kind: "device", id: "e2", name: "NLD2" }, { kind: "user", id: "u7", name: "gone@x" }]);
  ok("unrevert: NLD2 back into INT-SG-D-NLD, then both out of Revert; Bob waits for INT-SG-U-NLD", un.ops.map((o) => `${o.type}:${o.group.name}`).join() === "add:INT-SG-D-NLD,remove:INT-SG-U-MDE-HoldBack,remove:INT-SG-D-MDE-HoldBack"
    && un.skipped.some((x) => /bob@x/.test(x) && /INT-SG-U-NLD/.test(x)) && un.ops[1].ids.join() === "u7" && un.warnings.some((x) => /gone@x/.test(x)));

  // ------------------------------------------------------------ assess --
  const pm = { newP: [{ key: "n1", name: "WIN-SEC ASR - D", item: { assignments: [{ kind: "Included", groupId: "wd-euro" }] } }, { key: "n2", name: "WIN-SEC AV - U", item: { assignments: [{ kind: "Included", groupId: "wu-euro" }] } }],
    oldP: [{ key: "o1", name: "Old ASR", item: { assignments: [{ kind: "All devices" }, { kind: "Excluded", groupId: "wd-euro" }] } }] };
  const as = MR.assess(card, pm, Object.assign({}, ctx, { userWaveIds: new Set(["wu-euro"]), deviceWaveIds: new Set(["wd-euro"]) }));
  const dv = as.find((x) => x.kind === "device"), us = as.find((x) => x.kind === "user");
  ok("dry run per policy: the device drops the new ASR policy and the old one takes over", dv.drops.map((P) => P.name).join() === "WIN-SEC ASR - D" && dv.takes.map((P) => P.name).join() === "Old ASR" && dv.state === "ok");
  ok("a user with no old - U - policy: nothing reaches them after — a gap", us.drops.map((P) => P.name).join() === "WIN-SEC AV - U" && us.state === "gap");
  const pm2 = { newP: pm.newP.concat([{ key: "n3", name: "WIN-SEC FW - D all", item: { assignments: [{ kind: "All devices" }] } }]), oldP: pm.oldP };
  ok("both sets after: a conflict", MR.assess(card, pm2, Object.assign({}, ctx, { userWaveIds: new Set(["wu-euro"]), deviceWaveIds: new Set(["wd-euro"]) })).find((x) => x.kind === "device").state === "both");

  // ---------------------------------------------- ↩ the list (10685) --
  // Mihai: "revert should also be possible in bulk" — option C, one list,
  // one merged plan behind a confirm line.
  const bob = { pick: { type: "user", id: "u2" }, failed: [], names: new Map(),
    user: { id: "u2", displayName: "Bob", upn: "bob@x", groups: new Set(["su-nld", "wu-euro"]), direct: [{ id: "su-nld", name: "INT-SG-U-NLD" }] },
    devices: [{ key: "m:m2", name: "NLD2", objId: "e2", deviceId: "a2", stale: false, groups: new Set(["dg-nld", "wd-euro"]), direct: [{ id: "dg-nld", name: "INT-SG-D-NLD" }] }] };
  const uma = { pick: { type: "device", managedId: "m9" }, failed: [], names: new Map(),
    user: { id: "u9", displayName: "Uma", upn: "uma@x", groups: new Set(["su-usa"]), direct: [{ id: "su-usa", name: "INT-SG-U-USA" }] },
    devices: [{ key: "m:m9", name: "USA9", objId: "e9", deviceId: "a9", stale: false, searched: true, groups: new Set(["dg-usa"]), direct: [{ id: "dg-usa", name: "INT-SG-D-USA" }] }] };
  const L = [];
  MR.listAdd(L, card, null, { source: "search" });
  MR.listAdd(L, bob, null, { line: "bob@x", source: "paste" });
  MR.listAdd(L, uma, null, { line: "USA9", source: "paste" });
  MR.listAdd(L, bob, new Set(["u:u2"]), { line: "bob@x", source: "paste" });
  ok("the list: one entry per person, keyed by the user — added twice is replaced, not doubled", L.length === 3 && L.map((e) => e.key).join() === "u:u1,u:u2,m:m9" && L[1].ticks.size === 1);
  MR.listAdd(L, bob, null, { line: "bob@x", source: "paste" });
  ok("a user entry includes recent devices; a device entry leaves its user unticked", L[1].ticks.has("u:u2") && L[1].ticks.has("m:m2") && !L[2].ticks.has("u:u9") && L[2].ticks.has("m:m9") && !L[0].ticks.has("m:m5"));
  L[2].ticks.add("u:u9"); // explicit opt-in: retain the existing full pair-plan regressions
  const sameOwner = [];
  MR.listAdd(sameOwner, uma);
  MR.listAdd(sameOwner, Object.assign({}, uma, { devices: [Object.assign({}, uma.devices[0], { key: "m:second", objId: "second" })] }));
  ok("two selected devices with the same primary user remain two entries", sameOwner.length === 2 && sameOwner.every((e) => e.ticks.size === 1 && !e.ticks.has("u:u9")));
  const lctx = Object.assign({}, ctx, { reason: "  SAP GUI blocked — MDE_P-2719 " });
  const pl = MR.planRevertMany(L, lctx);
  const sig = pl.ops.map((o) => `${o.type}:${o.name || o.group.name}:${(o.ids || []).join("+")}${o.needsOk ? `@${o.needsOk.join("+")}` : ""}`).join(" ");
  ok("one plan: the user Revert group created once, one add per Revert group, one removal per country group after the add of its kind",
    sig === "create:INT-SG-U-MDE-HoldBack: add:INT-SG-U-MDE-HoldBack:u1+u2+u9 add:INT-SG-D-MDE-HoldBack:e1+e2+e9 remove:INT-SG-U-NLD:u1+u2@1 remove:INT-SG-U-USA:u9@1 remove:INT-SG-D-NLD:e1+e2@2 remove:INT-SG-D-USA:e9@2", sig);
  ok("…the counts, the waves and the confirm line naming both", pl.bulk && pl.counts.users === 3 && pl.counts.devices === 3 && pl.waves.join() === "Americas,Euro"
    && pl.confirmLine === "hold back 3 users and 3 devices in waves Americas, Euro; they lose the new MDE policies", pl.confirmLine);
  ok("…the reason (trimmed) on every write, the run kind revert, removals typed", pl.ops.filter((o) => o.type !== "create").every((o) => o.reason === "SAP GUI blocked — MDE_P-2719") && pl.runKind === "revert" && pl.hasRemoval && pl.reason === "SAP GUI blocked — MDE_P-2719");
  ok("…a removal of several goes by $batch", pl.ops.find((o) => o.group && o.group.name === "INT-SG-D-NLD").batch && !pl.ops.find((o) => o.group && o.group.name === "INT-SG-D-USA").batch);
  ok("the line reads like 🔄's: one wave, one kind", MR.bulkLine({ users: 1, devices: 0 }, ["Euro"]) === "hold back 1 user in wave Euro; they lose the new MDE policies");
  const pl2 = MR.planRevertMany([L[0], { key: "u:u1x", card: dynCard, ticks: new Set(["u:u1"]) }], Object.assign({}, lctx, { reason: "" }));
  ok("a person reached through a dynamic group is left out with the reason; the rest still planned; no reason warned once",
    pl2.skipped.some((x) => /swap Euro/.test(x)) && pl2.ops.some((o) => o.type === "add") && pl2.warnings.filter((x) => /No reason/.test(x)).length === 1);
  const pl3 = MR.planRevertMany(L, Object.assign({}, lctx, { revertUsers: new Map([["u1", {}], ["u2", {}], ["u9", {}]]), revertDevices: new Map([["e1", {}], ["e2", {}], ["e9", {}]]) }));
  ok("everyone already reverted: nothing to write, no confirm line", !pl3.ops.length && !pl3.confirmLine && pl3.skipped.length === 6);
  const actx = Object.assign({}, lctx, { userWaveIds: new Set(["wu-euro"]), deviceWaveIds: new Set(["wd-euro"]) });
  const lt = MR.listTicks(card, pm, actx);
  ok("a member the dry run would leave with neither set (a gap) starts unticked", !lt.has("u:u1") && lt.has("m:m1"));
  const am = MR.assessMany([{ key: "u:u1", card, ticks: MR.defaultTicks(card) }, L[1]], pm, actx);
  const asr = am.policies.find((x) => x.P.name === "WIN-SEC ASR - D"), old = am.policies.find((x) => x.P.name === "Old ASR");
  ok("the dry run counted per policy: the new ASR drops off 2 devices, the old takes over 2; the gaps named", asr.drops.device === 2 && old.takes.device === 2 && am.gaps.map((g) => g.name).join() === "ann@x,bob@x" && am.members === 4);
  ok("listDone: an entry whose ticked members are all in Revert now leaves the list", MR.listDone(L, { revertUsers: new Map([["u1", {}], ["u9", {}]]), revertDevices: new Map([["e1", {}], ["e9", {}]]) }).join() === "u:u1,m:m9");
  ok("listLines: what rebuilds it after a reload — the UPN, else the device", MR.listLines(L).join() === "ann@x,bob@x,uma@x" && MR.listLines([{ card: { user: null, devices: [{ name: "KIOSK-1" }] } }]).join() === "KIOSK-1");
  const realReadAll = w.Graph.readAll;
  w.Graph.readAll = async (p) => /\/groups\?\$filter/.test(p) ? [{ id: "G-FIN", displayName: "PVM-UG-Finance-Italy" }]
    : /transitiveMembers\/microsoft\.graph\.user/.test(p) ? [{ id: "u7", userPrincipalName: "gio@x" }, { id: "u8", userPrincipalName: "lia@x" }]
    : /members\/microsoft\.graph\.device/.test(p) ? [{ id: "e7", displayName: "ITA7" }] : [];
  const gl = await MR.groupLines("pvm-ug-finance-italy");
  const gl0 = await MR.groupLines("");
  w.Graph.readAll = async () => [];
  const gl1 = await MR.groupLines("Nope");
  w.Graph.readAll = realReadAll;
  ok("👥 a group's members as lines: its users' UPNs and its devices' names, the group only read", gl.group.id === "g-fin" && gl.lines.join() === "gio@x,lia@x,ITA7" && gl.users === 2 && gl.devices === 1);
  ok("…no name, or no such group: said, nothing read into the list", !gl0.group && /Type/.test(gl0.note) && !gl1.group && /No group is named “Nope”/.test(gl1.note));

  // ------------------------------------------------------------- patch --
  const ex2 = { userGroups: new Map(), userMembers: new Map(), upn: new Map(), revert: { user: null, device: null }, revertUsers: new Map(), revertDevices: new Map() };
  const in2 = { reverted: new Set() };
  MR.patch(ex2, in2, [{ type: "create", name: "INT-SG-U-MDE-HoldBack", id: "rv-u2" }, { type: "add", group: { id: "rv-u2", name: "INT-SG-U-MDE-HoldBack" }, ids: ["u1"], memberKind: "user", objs: [{ id: "u1", userPrincipalName: "ann@x" }] },
    { type: "add", group: { id: "rv-d2", name: "INT-SG-D-MDE-HoldBack" }, ids: ["e1"], memberKind: "device" }, { type: "create", name: "INT-SG-U-NLD", id: "su-n" }, { type: "add", group: { id: "su-n", name: "INT-SG-U-NLD" }, ids: ["u3"], memberKind: "user" }], cfg);
  ok("a verified run folds in: Revert members, the held device, a new static group", ex2.revertUsers.get("u1").upn === "ann@x" && ex2.revertDevices.has("e1") && in2.reverted.has("e1") && ex2.userMembers.get("su-n").has("u3") && ex2.revert.user.id === "rv-u2");
  ok("syncedRows: a row whose steps all verified moves its last sync", MR.syncedRows({ ops: [{ key: "nl" }, { key: "gb" }], rows: ["nl", "gb", "de"] }, [{ ok: true, verified: true }, { ok: false }]).join() === "nl,de");

  // $batch removal through MdeMembers.removeMembers
  members.set("g-b", new Set(["x1", "x2", "x3"]));
  calls.length = 0;
  const rb = await MM.removeMembers("g-b", ["x1", "x2"], null, { batch: true });
  ok("removals by $batch: one call per twenty, a 404 counted as done", rb.done.join() === "x1,x2" && calls.every((c) => c[0] === "BATCH-DELETE") && !members.get("g-b").has("x1"));
  w.Graph.batch = async (reqs) => ({ 0: { error: "Not found", status: 404 }, 1: { error: "Insufficient privileges", status: 403 } });
  const rb2 = await MM.removeMembers("g-b", ["x3", "x4"], null, { batch: true });
  ok("…a refusal is a failure with its reason", rb2.done.join() === "x3" && rb2.failed[0].id === "x4" && /Insufficient/.test(rb2.failed[0].why));

  console.log(`T28 revert & country groups: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

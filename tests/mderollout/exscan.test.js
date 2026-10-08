// T28 — ⊘ 🔎 In a wave anyway (build 10698). DOM-free, Graph stubbed.
// Mihai: "make sure that there is check that excluded users never (in a
// nested exclusion group) never gets in the wave through a other nested
// group. it should be removed or there should be a option in the
// exclusion overview to do a scan check and remove the users."
// The scan: who the exclusion groups hold transitively (a nested group's
// members named by that group), matched against every wave's transitive
// members, the route in per hit (direct, through a static child, through
// a dynamic child, nested deeper), the waves without a hit left alone;
// the plan: one removal per static group and kind, the dynamic and the
// deeper routes left out with the reason. And the 👥 sync holding an
// excluded user out of the static country user group (MdeMembers), the
// 🔄 model listing one still in it to leave (MdeRevert).
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
  + "\n;Object.assign(window, {MdeRollout, MdeMembers, MdeExclude, MdeRevert, Graph});");
const X = w.MdeExclude, MM = w.MdeMembers, RV = w.MdeRevert;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const G = (n) => `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = (n) => `22222222-0000-4000-8000-${String(n).padStart(12, "0")}`;
const O = (n) => `44444444-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lc = (s) => String(s).toLowerCase();

// The exclusion groups: Nina (U2) a direct member of the user group, a
// lab group nested in it holding Omar (U3); the kiosk (O4) in the device
// group. The Euro user wave: Nina a direct member AND in the static
// INT-SG-U-DEU; Omar in the dynamic FR source and in the 🧪 test group.
// The Euro device wave: the kiosk two levels down (INT-SG-D-NLD holds a
// sub-group that holds it). Americas: nobody excluded.
const groups = { user: { id: G(90), displayName: "INT-SG-U-MDE-Exclusion" }, device: { id: G(91), displayName: "INT-SG-D-MDE-Exclusion" } };
const base = { managed: [], users: [{ id: U(2), displayName: "Nina Nieuw", userPrincipalName: "nina@contoso.com" }],
  devices: [{ id: O(4), deviceId: "aad-4", displayName: "KIOSK-NL-01" }], groups, readAt: 1 };
const waves = [
  { role: "wave", audience: "user", region: "Euro", id: lc(G(20)), name: "INT-SG-U-WAVE-Euro" },
  { role: "wave", audience: "device", region: "Euro", id: lc(G(21)), name: "INT-SG-D-WAVE-Euro" },
  { role: "wave", audience: "user", region: "Americas", id: lc(G(22)), name: "INT-SG-U-WAVE-Americas" },
  { role: "wave", audience: "device", region: "Americas", id: null, name: "INT-SG-D-WAVE-Americas" },
  { role: "exclusion", audience: "user", id: lc(G(90)), name: "INT-SG-U-MDE-Exclusion" },
];
const nina = { id: U(2), displayName: "Nina Nieuw", userPrincipalName: "nina@contoso.com" };
const omar = { id: U(3), displayName: "Omar Lab", userPrincipalName: "omar@contoso.com" };
const kiosk = { id: O(4), deviceId: "aad-4", displayName: "KIOSK-NL-01" };
const TENANT = {
  // transitive members per group and kind
  transitive: {
    [`${lc(G(90))}|user`]: [nina, omar], [`${lc(G(91))}|device`]: [kiosk],
    [`${lc(G(95))}|user`]: [omar],
    [`${lc(G(20))}|user`]: [nina, omar, { id: U(5), displayName: "Jan", userPrincipalName: "jan@contoso.com" }],
    [`${lc(G(41))}|user`]: [nina, { id: U(5) }], [`${lc(G(42))}|user`]: [omar], [`${lc(G(43))}|user`]: [omar],
    [`${lc(G(21))}|device`]: [kiosk, { id: O(5), displayName: "LT-1" }], [`${lc(G(35))}|device`]: [kiosk, { id: O(5) }],
    [`${lc(G(22))}|user`]: [{ id: U(8), displayName: "Pat" }],
  },
  direct: {
    [`${lc(G(20))}|user`]: [nina], [`${lc(G(41))}|user`]: [nina, { id: U(5) }], [`${lc(G(42))}|user`]: [omar], [`${lc(G(43))}|user`]: [omar],
    [`${lc(G(21))}|device`]: [], [`${lc(G(35))}|device`]: [{ id: O(5) }],
  },
  children: {
    [lc(G(90))]: [{ id: G(95), displayName: "INT-SG-U-MDE-Exclusion-Lab", groupTypes: [] }], [lc(G(91))]: [],
    [lc(G(20))]: [{ id: G(41), displayName: "INT-SG-U-DEU", groupTypes: [] }, { id: G(42), displayName: "PVM-UG-CORP-MEM-USERS-FR", groupTypes: ["DynamicMembership"], membershipRule: '(user.usageLocation -eq "FR")' }, { id: G(43), displayName: "INT-SG-U-WAVE-Euro-Test", groupTypes: [] }],
    [lc(G(21))]: [{ id: G(35), displayName: "INT-SG-D-NLD", groupTypes: [] }],
    [lc(G(22))]: [{ id: G(44), displayName: "INT-SG-U-USA", groupTypes: [] }],
  },
};
let reads = [];
w.Graph.readAll = async (p, o) => {
  reads.push([p, o]);
  let m = /^\/groups\/([^/]+)\/transitiveMembers\/microsoft\.graph\.(user|device)\?/.exec(p);
  if (m) { const k = `${lc(decodeURIComponent(m[1]))}|${m[2]}`; if (!(k in TENANT.transitive)) throw Object.assign(new Error("Resource not found"), { status: 404 }); return TENANT.transitive[k].map((x) => Object.assign({}, x)); }
  m = /^\/groups\/([^/]+)\/members\/microsoft\.graph\.(user|device)\?/.exec(p);
  if (m) return (TENANT.direct[`${lc(decodeURIComponent(m[1]))}|${m[2]}`] || []).map((x) => ({ id: x.id }));
  m = /^\/groups\/([^/]+)\/members\/microsoft\.graph\.group\?/.exec(p);
  if (m) return (TENANT.children[lc(decodeURIComponent(m[1]))] || []).map((x) => Object.assign({}, x));
  throw new Error("unexpected read " + p);
};

async function run() {
  const lines = [];
  const S = await X.scanWaves(base, waves, {}, (m) => lines.push(m));
  ok("the exclusion groups are read transitively, with the ConsistencyLevel header", reads.some(([p, o]) => /groups\/.*transitiveMembers\/microsoft\.graph\.user\?\$select=id,displayName,userPrincipalName&\$count=true/.test(p) && o.headers && o.headers.ConsistencyLevel === "eventual"));
  ok("…and Omar, in the lab group nested in the exclusion group, is excluded through it", S.excluded.users === 2 && S.nested.user.length === 1 && S.nested.user[0].name === "INT-SG-U-MDE-Exclusion-Lab");
  ok("the waves with an id are scanned; the Americas device wave (no group) is not", S.waves === 3 && !reads.some(([p]) => /INT-SG-D-WAVE-Americas/.test(p)));
  ok("Americas: no excluded member in it — its children are not read", !reads.some(([p]) => p.startsWith(`/groups/${lc(G(22))}/members/microsoft.graph.group`)) && !reads.some(([p]) => p.startsWith(`/groups/${lc(G(44))}`)));
  ok("three excluded members are in a wave: two users, one device", S.rows.length === 3 && S.users === 2 && S.devices === 1 && S.rows.map((r) => r.kind).join() === "user,user,device");
  const N = S.rows.find((r) => r.id === lc(U(2))), Om = S.rows.find((r) => r.id === lc(U(3))), K = S.rows.find((r) => r.id === lc(O(4)));
  ok("Nina: a direct member of the Euro user wave, and in it through INT-SG-U-DEU (static)", N && N.routes.length === 2 && N.routes[0].direct && N.routes[0].group === null && N.routes[1].group.name === "INT-SG-U-DEU" && !N.routes[1].dynamic && !N.routes[1].deep && N.via === null, JSON.stringify(N && N.routes));
  ok("Omar: through the dynamic FR source, and through the 🧪 test group; excluded through the lab group", Om && Om.via === "INT-SG-U-MDE-Exclusion-Lab" && Om.routes.length === 2 && Om.routes[0].group.name === "PVM-UG-CORP-MEM-USERS-FR" && Om.routes[0].dynamic && Om.routes[1].group.name === "INT-SG-U-WAVE-Euro-Test" && !Om.routes[1].dynamic && Om.routes[1].direct, JSON.stringify(Om && Om.routes));
  ok("the kiosk: in the Euro device wave through INT-SG-D-NLD, nested deeper than it", K && K.routes.length === 1 && K.routes[0].group.name === "INT-SG-D-NLD" && K.routes[0].deep && !K.routes[0].direct && K.name === "KIOSK-NL-01", JSON.stringify(K && K.routes));
  ok("the status line names the wave being read", lines.some((l) => /Reading the waves… 1 of 3/.test(l)) && lines.some((l) => /nested groups included/.test(l)));
  ok("nothing failed", S.failed.length === 0, S.failed.join("; "));

  // ------------------------------------------------------------- plan --
  const P = X.planScan(S.rows);
  ok("the plan: Nina out of the wave itself and out of INT-SG-U-DEU, Omar out of the test group — three removals", P.ops.length === 3 && P.ops.every((o) => o.type === "remove" && o.key === "exscan")
    && P.ops.map((o) => o.group.name).join() === "INT-SG-U-WAVE-Euro,INT-SG-U-DEU,INT-SG-U-WAVE-Euro-Test" && P.ops[0].ids[0] === lc(U(2)) && P.ops[2].ids[0] === lc(U(3)), JSON.stringify(P.ops.map((o) => [o.group.name, o.ids])));
  ok("…each a typed REMOVE, as an exclusion run, of users", P.hasRemoval && P.exclusions && P.runKind === "exscan" && P.ops.every((o) => o.memberKind === "user" && o.objs[0].userPrincipalName));
  ok("the dynamic route is left out with the reason (⚡ ②)", P.skipped.some((x) => /Omar Lab: in INT-SG-U-WAVE-Euro through PVM-UG-CORP-MEM-USERS-FR — a dynamic group; its rule would put them back\. The exclusion has to hold on the policies \(⚡ ②\)/.test(x)), P.skipped.join("\n"));
  ok("the deeper nesting is left out with the group to open", P.skipped.some((x) => /KIOSK-NL-01: in INT-SG-D-WAVE-Euro through INT-SG-D-NLD, nested deeper than that group — take them out of the inner group in Entra/.test(x)));
  ok("the title counts members, not removals", P.title === "⊘ Out of the waves — 2 users" && P.counts.users === 2 && P.counts.devices === 0, P.title);
  ok("the warning says the sync holds them from now on", P.warnings.some((x) => /not put back by the 👥 \/ 🔄 sync/.test(x)));
  const P2 = X.planScan(S.rows, new Set([`user:${lc(U(3))}`]));
  ok("ticks narrow the plan: Omar only — one removal, one dynamic route said", P2.ops.length === 1 && P2.ops[0].group.name === "INT-SG-U-WAVE-Euro-Test" && P2.skipped.length === 1 && P2.title === "⊘ Out of the waves — 1 user");
  ok("nothing ticked: nothing to take out, no REMOVE", X.planScan(S.rows, new Set()).ops.length === 0 && !X.planScan(S.rows, new Set()).hasRemoval && /nothing to take out/.test(X.planScan(S.rows, new Set()).title));

  // ---------------------------------------------- a wave that fails --
  reads = [];
  const bad = waves.map((x) => x.id === lc(G(21)) ? Object.assign({}, x, { id: lc(G(99)) }) : x);
  const S2 = await X.scanWaves(base, bad, {}, () => {});
  ok("a wave that cannot be read is said, the others still scanned", S2.failed.length === 1 && /INT-SG-D-WAVE-Euro: /.test(S2.failed[0]) && S2.rows.length === 2);
  ok("no exclusion group: nothing excluded, nothing scanned past the waves", (await X.scanWaves({ users: [], devices: [], groups: {}, managed: [] }, waves, {}, () => {})).rows.length === 0);

  // ------------------------------- 👥 the sync holds an excluded user --
  // MdeMembers.readInput reads the user exclusion group transitively, and
  // compute keeps its users out of the static country user group (10680's
  // uWant / uRemove), as it holds a reverted user.
  const held = { id: G(91), displayName: "INT-SG-D-MDE-Exclusion" }, heldUser = { id: G(90), displayName: "INT-SG-U-MDE-Exclusion" };
  reads = [];
  w.Graph.readAll = async (p, o) => {
    reads.push([p, o]);
    if (/transitiveMembers\/microsoft\.graph\.user/.test(p) && p.includes(lc(G(90)))) return [nina, omar];
    if (/transitiveMembers\/microsoft\.graph\.device/.test(p) && p.includes(lc(G(91)))) return [kiosk];
    if (/^\/groups\?/.test(p)) return [];
    if (/managedDevices/.test(p)) return [];
    if (/^\/devices/.test(p)) return [];
    return [];
  };
  w.Graph.pool = async (items, fn) => { const out = []; for (const it of items) { try { out.push({ value: await fn(it) }); } catch (e) { out.push({ error: e }); } } return out; };
  const cfg = MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["DE"] }], pilots: [], batched: [] });
  const input = await MM.readInput(cfg, [], () => {}, new Set(), held, [], heldUser);
  ok("readInput reads both exclusion groups transitively", reads.some(([p, o]) => p.startsWith(`/groups/${lc(G(90))}/transitiveMembers/microsoft.graph.user`) && o.headers.ConsistencyLevel === "eventual")
    && reads.some(([p, o]) => p.startsWith(`/groups/${lc(G(91))}/transitiveMembers/microsoft.graph.device`) && o.headers.ConsistencyLevel === "eventual"));
  ok("…into held (devices) and excludedUsers (users), with the groups named", input.held.has(lc(O(4))) && input.excludedUsers.size === 2 && input.excludedUsers.get(lc(U(3))).upn === "omar@contoso.com" && input.heldUserGroup.id === lc(G(90)) && input.heldGroup.id === lc(G(91)));
  // compute: Germany's source holds Nina (excluded) and Jan; the static group holds Nina already
  const de = { id: G(6), displayName: "PVM-UG-CORP-MEM-USERS-DE", groupTypes: ["DynamicMembership"] };
  const sug = { id: G(41), displayName: "INT-SG-U-DEU", groupTypes: [] };
  const cfg2 = cfg;
  const inp = Object.assign(input, { countryGroups: [de], usersByGroup: new Map([[lc(G(6)), [nina, { id: U(5), userPrincipalName: "jan@contoso.com" }]]]),
    userGroups: new Map([[lc("INT-SG-U-DEU"), sug]]), userMembers: new Map([[lc(G(41)), new Set([lc(U(2))])]]), revertUsers: new Map(), deviceGroups: [], deviceMembers: new Map(), waveChildren: new Map(), waveUsers: new Map(), managed: [], managedAll: [], entra: [] });
  const wavesMap = new Map([["euro", { user: { id: lc(G(20)), displayName: "INT-SG-U-WAVE-Euro" }, device: null, userName: "INT-SG-U-WAVE-Euro", deviceName: "INT-SG-D-WAVE-Euro" }]]);
  const model = MM.compute(cfg2, inp, wavesMap);
  const row = model.rows.find((r) => r.iso3 === "DEU");
  ok("👥: the excluded user is not wanted in INT-SG-U-DEU and, in it, is to be removed — held like a reverted one", row && !row.uWant.has(lc(U(2))) && row.uWant.has(lc(U(5))) && row.uRemove.includes(lc(U(2))) && row.uHeld === 1 && row.uExcluded === 1, row && JSON.stringify([[...row.uWant], row.uRemove, row.uHeld]));
  const plan = MM.planOps(model, new Set([row.key]), { fill: true, removals: true }, cfg2);
  ok("…the plan removes her from the static group and says why she is held", plan.ops.some((o) => o.type === "remove" && o.memberKind === "user" && o.ids.includes(lc(U(2)))) && plan.warnings.some((x) => /Germany: 1 user is held back, not added — 1 in the ⊘ user exclusion group/.test(x)), JSON.stringify(plan.warnings));
  // 🔄: she is listed to leave with the ⊘ reason; Omar (not in the group) is not offered back
  const extra = { userGroups: inp.userGroups, userMembers: inp.userMembers, upn: new Map(), revert: {}, revertUsers: new Map(), revertDevices: new Map(), failed: [], readAt: 1 };
  const rm = RV.model(cfg2, model, inp, extra, {});
  const rr = rm.rows.find((r) => r.iso3 === "DEU");
  ok("🔄: the excluded user still in the static group is held in, to leave, with the ⊘ reason", rr && rr.user.heldIn.length === 1 && rr.user.heldIn[0].why === "excluded" && rr.user.held.length === 0 && rr.user.add.length === 1
    && RV.syncItems(rm).some((l) => l.dir === "heldin" && l.kind === "user" && /⊘ excluded — kept on the old set/.test(l.why)), rr && JSON.stringify(rr.user));
  // a run that adds Omar to the exclusion group moves the input along
  MM.patchInput(inp, [{ type: "add", group: { id: G(90), name: "INT-SG-U-MDE-Exclusion" }, ids: [U(5)], objs: [{ id: U(5), displayName: "Jan", userPrincipalName: "jan@contoso.com" }] }], []);
  ok("patchInput: an add to the user exclusion group holds that user too", inp.excludedUsers.has(lc(U(5))) && inp.excludedUsers.get(lc(U(5))).upn === "jan@contoso.com");
  MM.patchInput(inp, [{ type: "remove", group: { id: G(90), name: "INT-SG-U-MDE-Exclusion" }, ids: [U(5)] }], []);
  ok("…and a removal lets them go", !inp.excludedUsers.has(lc(U(5))));
}

run().then(() => {
  console.log(`mderollout-exscan: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exit(1); });

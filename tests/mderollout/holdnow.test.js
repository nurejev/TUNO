// T28 — the hold-back read again right before writing (build 10712, Phase 0
// findings R3 and R4 of the 15 Oct rebuild plan). R4: readExtra reads the
// ⏸ pair TRANSITIVELY, so a group nested in the hold-back holds its members
// back. R3: MdeRevert.readHoldNow reads the pair again, transitively, with
// names, and throws rather than answering "nobody" when a read fails — the
// caller (applyMem) refuses the apply; the guard run on its answer drops
// whoever was put in the hold-back after the 👥 read. The screen half is in
// revertscreen.test.js. Graph stubbed.
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

async function run() {
  const cfg = MM.normConfig(null);
  const urls = [];
  // the tenant: the hold-back user group holds Bob directly and Cara through a nested group
  w.Graph.readAll = async (p) => {
    urls.push(p);
    const q = decodeURIComponent(p);
    if (/startswith\(displayName,'INT-SG-U-MDE-'\)/.test(q)) return [];
    if (/eq 'INT-SG-U-MDE-HoldBack'/.test(q)) return [{ id: "HB-U", displayName: "INT-SG-U-MDE-HoldBack" }];
    if (/eq 'INT-SG-D-MDE-HoldBack'/.test(q)) return [{ id: "HB-D", displayName: "INT-SG-D-MDE-HoldBack" }];
    if (/\/groups\/HB-U\/transitiveMembers\/microsoft\.graph\.user/.test(p)) return [{ id: "u-bob", userPrincipalName: "bob@x", displayName: "Bob" }, { id: "u-cara", userPrincipalName: "cara@x", displayName: "Cara (via nested group)" }];
    if (/\/groups\/HB-U\/members\//.test(p)) return [{ id: "u-bob", userPrincipalName: "bob@x", displayName: "Bob" }];
    if (/\/groups\/HB-D\/transitiveMembers\/microsoft\.graph\.device/.test(p)) return [{ id: "e-1", deviceId: "a1", displayName: "NLD-1" }];
    if (/\/groups\/HB-D\/members\//.test(p)) return [];
    return [];
  };
  w.Graph.pool = async (items, fn) => Promise.all(items.map((x) => fn(x).then((value) => ({ value })).catch((error) => ({ error }))));

  // ---------------------------------------------- R4: transitive read --
  const extra = await MR.readExtra(cfg, MM.countryRows(cfg), () => {});
  ok("readExtra reads the hold-back pair transitively: Cara, held through a nested group, is held back", extra.revertUsers.has("u-cara") && extra.revertUsers.has("u-bob") && extra.revertDevices.has("e-1"));
  ok("…with the consistency header and $count the transitive read needs", urls.some((p) => /HB-U\/transitiveMembers.*\$count=true/.test(p)) && !urls.some((p) => /HB-[UD]\/members\//.test(p)));

  // ------------------------------------------ R3: readHoldNow --
  const now = await MR.readHoldNow([{ id: "HB-U", kind: "user", name: "INT-SG-U-MDE-HoldBack" }, { id: "HB-D", kind: "device" }, { id: "", kind: "user" }]);
  ok("readHoldNow: both sets, transitive, two groups read, names for the message", now.users.has("u-bob") && now.users.has("u-cara") && now.devices.has("e-1") && now.read === 2 && now.names.get("user|u-cara") === "cara@x" && now.names.get("device|e-1") === "NLD-1");
  // the guard on the fresh answer drops the newly held one
  const ctx = { users: new Set(["u-bob"]), devices: new Set(), exempt: { ids: new Set(["hb-u", "hb-d"]), names: new Set() }, hold: { ids: new Set(["hb-u", "hb-d"]), names: new Set() }, unread: "", nameOf: () => "" };
  now.users.forEach((id) => ctx.users.add(id));
  const g = MR.guardHeld([{ type: "add", key: "nl", group: { id: "su-nl", name: "INT-SG-U-MDE-NLD" }, ids: ["u-cara", "u-dan"], memberKind: "user", label: "2 users", objs: [{ id: "u-cara" }, { id: "u-dan" }] }], ctx);
  ok("the guard on the fresh read: Cara (held since the plan) is dropped, Dan still goes", g.ops.length === 1 && g.ops[0].ids.join() === "u-dan" && g.stripped.users === 1 && g.skipped.length === 1);

  // a failed read is an error, never an empty hold-back
  w.Graph.readAll = async (p) => { if (/HB-U/.test(p)) { const e = new Error("429 Too Many Requests"); e.kind = "throttled"; throw e; } return []; };
  let threw = "";
  try { await MR.readHoldNow([{ id: "HB-U", kind: "user" }]); } catch (e) { threw = e.message; }
  ok("a hold-back that cannot be read right before writing throws (the apply is refused), it is not an empty one", /429/.test(threw));
  w.Graph.readAll = async () => null;
  threw = "";
  try { await MR.readHoldNow([{ id: "HB-U", kind: "user", name: "INT-SG-U-MDE-HoldBack" }]); } catch (e) { threw = e.message; }
  ok("a read that returns nothing is a failure too, naming the group", /INT-SG-U-MDE-HoldBack/.test(threw));

  console.log(`T28 hold-back read at apply: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

// T28 — 🌊 create and rename through the plan (build 10711, Phase 0 finding
// R7 of the 15 Oct rebuild plan: "createWaves and renameWaves bypass every
// engine (checkbox → write)"). DOM-free: MdeMembers.planWaves /
// planRenameWaves build the ops, the confirm line names every group, a
// group found meanwhile is "in place", and applyOps writes nothing before
// the plan and stops where a write fails. Graph stubbed.
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
  + "\n;Object.assign(window, {MdeRollout, MdeMembers, Graph});");
const MM = w.MdeMembers, M = w.MdeRollout;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}

async function run() {
  const defs = [
    { name: "INT-SG-D-WAVE-Euro", role: "wave", audience: "device", region: "Euro" },
    { name: "INT-SG-U-WAVE-Euro", role: "wave", audience: "user", region: "Euro" },
    { name: "INT-SG-D-MDE-Exclusion", role: "exclusion", audience: "device" },
  ];
  const desc = { wave: "MDE rollout wave.", exclusion: "MDE rollout exclusion." };

  // ------------------------------------------------------------ create --
  const p = MM.planWaves(["INT-SG-D-WAVE-Euro", "INT-SG-D-MDE-Exclusion", "INT-SG-U-WAVE-Euro"], defs, desc, (n) => n === "INT-SG-U-WAVE-Euro");
  ok("one create per ticked group that does not exist; a group found meanwhile is in place, not made twice", p.ops.map((o) => o.type).join() === "create,create" && p.inPlace.join() === "INT-SG-U-WAVE-Euro");
  ok("a wave gets the wave description, an exclusion group the exclusion one; the For column says which", p.ops[0].description === desc.wave && p.ops[1].description === desc.exclusion && p.ops[0].who === "device wave" && p.ops[1].who === "device exclusion");
  ok("the plan is a members plan with its own run kind, no removal, a title with the count", p.members && p.waves && p.runKind === "waves" && p.hasRemoval === false && p.title === "Create 2 rollout groups");
  ok("the confirm line names every group", /create 2 assigned security groups in this tenant: INT-SG-D-WAVE-Euro, INT-SG-D-MDE-Exclusion/.test(p.confirmLine));
  const none = MM.planWaves(["INT-SG-U-WAVE-Euro"], defs, desc, () => true);
  ok("nothing to create → no ops, no confirm line", none.ops.length === 0 && none.confirmLine === "" && none.inPlace.length === 1);

  // ------------------------------------------------------------ rename --
  const r = MM.planRenameWaves([{ id: "G1", from: "PVM-DG-MDE-WAVE-Euro", to: "INT-SG-D-WAVE-Euro" }, { id: "", from: "x", to: "y" }], false);
  ok("one rename op per group with an id, old → new, the group's id carried", r.ops.length === 1 && r.ops[0].type === "rename" && r.ops[0].group.id === "g1" && r.ops[0].from === "PVM-DG-MDE-WAVE-Euro" && r.ops[0].to === "INT-SG-D-WAVE-Euro");
  ok("its run kind, title and confirm line", r.runKind === "renamewaves" && r.renameWaves && r.title === "Rename 1 rollout group" && /rename 1 group in this tenant.*PVM-DG-MDE-WAVE-Euro → INT-SG-D-WAVE-Euro/.test(r.confirmLine));
  ok("the way back is a rename plan too", /back/.test(MM.planRenameWaves([{ id: "G1", from: "b", to: "a" }], true).title));
  const inv = MM.inverseOf([{ type: "rename", key: "waves", group: { id: "g1", name: "INT-SG-D-WAVE-Euro" }, from: "PVM-DG-MDE-WAVE-Euro", to: "INT-SG-D-WAVE-Euro" }]);
  ok("📜 the inverse of a rename renames back", inv.ops.length === 1 && inv.ops[0].type === "rename" && inv.ops[0].from === "INT-SG-D-WAVE-Euro" && inv.ops[0].to === "PVM-DG-MDE-WAVE-Euro");

  // -------------------------------------------- nothing written early --
  const posts = [], made = new Map();   // a tiny tenant: id → group, owners from the create
  w.Graph.post = async (pth, body) => {
    posts.push([pth, body]);
    if (pth === "/groups") { const g = { id: `new-${made.size + 1}`, displayName: body.displayName, securityEnabled: true, mailEnabled: false, owners: (body["owners@odata.bind"] || []).map((x) => x.split("/").pop()) }; made.set(g.id, g); return { id: g.id, displayName: g.displayName }; }
    return null;
  };
  w.Graph.patch = async (pth, body) => { posts.push([pth, body]); return null; };
  w.Graph.readAll = async (pth) => { const m = /\/groups\/([^/?]+)\/owners/.exec(pth); return m && made.get(m[1]) ? made.get(m[1]).owners.map((id) => ({ id })) : []; };
  w.Graph.readOne = async (pth) => { const m = /\/groups\/([^/?]+)/.exec(pth); return m && made.get(m[1]) ? made.get(m[1]) : null; };
  w.Graph.get = w.Graph.readOne;
  ok("building the plan sends nothing", posts.length === 0);
  const L = { stopped: false, start() {}, skip() {}, fail() {}, done() {}, progress() {} };
  const res = await MM.applyOps(p.ops, { ledger: L, me: { id: "me-1" } });
  ok("apply: one POST /groups per step, owner named in the create, each read back", posts.filter((x) => x[0] === "/groups").length === 2 && posts.every((x) => x[0] !== "/groups" || x[1]["owners@odata.bind"]) && res.done.filter((d) => d.type === "create").length === 2, JSON.stringify(posts.map((x) => x[0])));
  ok("the created groups are known by name for the steps after (created map)", res.created.get("int-sg-d-wave-euro") === "new-1" && res.created.get("int-sg-d-mde-exclusion") === "new-2");

  // ------------------------------------------- a failure stops cleanly --
  posts.length = 0;
  let n = 0;
  const post0 = w.Graph.post;
  w.Graph.post = async (pth, body) => { if (pth === "/groups" && ++n === 1) { const e = new Error("Another object with the same value for property mailNickname already exists."); e.status = 400; throw e; } return post0(pth, body); };
  const res2 = await MM.applyOps(p.ops, { ledger: L, me: null });
  ok("a refused create fails its step with the tenant's words; the next step still runs on its own", res2.results[0].ok === false && /mailNickname/.test(res2.results[0].note) && res2.results[1].ok === true);

  console.log(`T28 wave create & rename: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

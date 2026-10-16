// T28 — member writes under throttling (build 10710, Phase 0 finding R2 of
// the 15 Oct rebuild plan: "no back-off on throttled member writes"). A 429
// (or a 503) on a chunk waits Retry-After — else 2 · 4 · 8 · 16 · 30 s — and
// retries the SAME chunk; it is never worked around with twenty single POSTs
// into the throttle; after five waits the run stops where it is, the rest of
// the list unsent and said so; a timeout is never resent (its outcome is
// unknown). applyOps stops the run after such a step and keeps what was
// done in the undo. Graph stubbed; the waits recorded, not slept.
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
const MM = w.MdeMembers;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const throttle = (retryAfter) => { const e = new Error(`The tenant is throttling this request${retryAfter ? ` — retry in ${retryAfter}s` : ""}.`); e.kind = "throttled"; e.status = 429; e.retryAfter = retryAfter == null ? null : String(retryAfter); return e; };
const timeout = () => { const e = new Error("The request did not complete (network error). It may or may not have reached the tenant."); e.kind = "network"; return e; };

async function run() {
  const waits = [];
  MM._setWait(async (ms) => { waits.push(ms); });
  const calls = [];
  const members = new Map([["g1", new Set()], ["g2", new Set(["r1", "r2", "r3"])], ["g3", new Set()]]);
  let script = [];   // per PATCH: an error to throw, or null
  w.Graph.patch = async (p, body) => {
    const ids = body["members@odata.bind"].map((r) => r.split("/").pop().toLowerCase());
    calls.push(["PATCH", ids.length]);
    const e = script.length ? script.shift() : null;
    if (e) throw e;
    ids.forEach((id) => members.get(p.split("/").pop()).add(id));
    return null;
  };
  w.Graph.post = async (p) => { calls.push(["POST", p]); return null; };
  w.Graph.del = async (p) => {
    calls.push(["DELETE", p]);
    const e = script.length ? script.shift() : null;
    if (e) throw e;
    const [, , gid, , id] = p.split("/"); members.get(gid).delete(decodeURIComponent(id).toLowerCase()); return null;
  };
  w.Graph.readAll = async (p) => { const gid = p.split("/")[2]; return [...(members.get(gid) || [])].map((id) => ({ id })); };

  // ------------------------------------------ 429 twice, then it goes --
  script = [throttle(3), throttle(null)];
  const ids25 = Array.from({ length: 25 }, (_, i) => `d${i}`);
  const r1 = await MM.addMembers("g1", ids25);
  ok("429 → wait → the SAME chunk again: 20 + 20 + 20 then 5, four PATCHes, no POST", calls.map((c) => c[0] === "PATCH" ? c[1] : "POST").join() === "20,20,20,5" && !calls.some((c) => c[0] === "POST"), calls.join("|"));
  ok("Retry-After is the wait (3 s + the cushion); without it the ladder continues (second wait 4 s)", waits.length === 2 && waits[0] === 3250 && waits[1] === 4250, waits.join());
  ok("everything went in, nothing failed, the run is not stopped", r1.done.length === 25 && r1.failed.length === 0 && r1.stopped === "");
  calls.length = 0; waits.length = 0;

  // ------------------------------------------- the throttle never lifts --
  script = [null, throttle(null), throttle(null), throttle(null), throttle(null), throttle(null), throttle(null), throttle(null)];
  const ids45 = Array.from({ length: 45 }, (_, i) => `e${i}`);
  const r2 = await MM.addMembers("g1", ids45);
  ok("the first chunk goes; the second is tried 1 + 5 times, then the run stops — the third chunk is NOT sent", calls.map((c) => c[1]).join() === "20,20,20,20,20,20,20" && r2.done.length === 20, calls.join("|"));
  ok("the back-off ladder without Retry-After: 2 · 4 · 8 · 16 · 30 s", waits.join() === "2250,4250,8250,16250,30250", waits.join());
  ok("the unsent ids are failed with 'stopped', named by chunk; never twenty single POSTs", r2.failed.length === 25 && /throttled — stopped at chunk 2 of 3/.test(r2.failed[0].why) && /Nothing after it was sent/.test(r2.stopped) && !calls.some((c) => c[0] === "POST"));
  calls.length = 0; waits.length = 0;

  // ------------------------------------------------ a timeout: unknown --
  script = [timeout()];
  const r3 = await MM.addMembers("g1", ["t1", "t2"]);
  ok("a timeout is not retried and not sent one by one: outcome unknown, the ids failed with that, no wait", calls.length === 1 && r3.done.length === 0 && /outcome unknown/.test(r3.stopped) && r3.failed.length === 2 && waits.length === 0);
  calls.length = 0;

  // ------------------------------------------- the other refusals stay --
  script = [new Error("One or more added object references already exist for the following modified properties: 'members'.")];
  const r4 = await MM.addMembers("g1", ["d1", "n1"]);
  ok("a chunk refused because a member is in already still goes one by one (unchanged)", r4.done.length === 2 && calls.filter((c) => c[0] === "POST").length === 2);
  calls.length = 0;

  // --------------------------------------------- removals, one by one --
  script = [throttle(1), null, throttle(null), throttle(null), throttle(null), throttle(null), throttle(null), throttle(null)];
  const r5 = await MM.removeMembers("g2", ["r1", "r2", "r3"]);
  ok("a throttled DELETE waits and retries the same member; the one the throttle never lifts on stops the run, the rest unsent", r5.done.join() === "r1" && r5.failed.map((f) => f.id).join() === "r2,r3" && /stopped at member 2 of 3/.test(r5.stopped) && calls.filter((c) => c[0] === "DELETE").length === 8, calls.join("|") + " " + JSON.stringify(r5));
  calls.length = 0; waits.length = 0; script = [];

  // --------------------------------------- applyOps stops after a stop --
  script = [null, throttle(null), throttle(null), throttle(null), throttle(null), throttle(null), throttle(null)];
  const ops = [
    { type: "add", key: "a", group: { id: "g3", name: "INT-SG-D-AAA" }, ids: Array.from({ length: 30 }, (_, i) => `a${i}`), label: "30 devices" },
    { type: "add", key: "b", group: { id: "g1", name: "INT-SG-D-BBB" }, ids: ["b1"], label: "1 device" },
    { type: "nest", key: "b", parent: { id: "wd", name: "INT-SG-D-WAVE-Euro" }, child: { id: "g1", name: "INT-SG-D-BBB" }, kind: "device", size: 1 },
  ];
  const skips = [], fails = [];
  const L = { stopped: false, start() {}, skip: (i, why) => skips.push([i, why]), fail: (i, why, label) => fails.push([i, why, label]), done() {}, progress() {} };
  const ra = await MM.applyOps(ops, { ledger: L });
  ok("applyOps: the first add did 20 then stopped; the add and the nest after it are skipped as stopped, not sent", ra.stopped && ra.results[0].ok === false && ra.results[1].skipped && /stopped/.test(ra.results[1].note) && ra.results[2].skipped && calls.filter((c) => c[0] === "PATCH").length === 7, JSON.stringify(ra.results.map((r) => [r.ok, r.skipped, r.note])));
  ok("what was done stays in the undo (20 devices), labelled STOPPED in the ledger", ra.done.length === 1 && ra.done[0].ids.length === 20 && fails[0] && /STOPPED/.test(fails[0][2]) && skips.length === 2);

  // ------------------------------ 10725: creates and nests get the same patience --
  calls.length = 0; waits.length = 0;
  const made = new Map();
  let createFaults = [throttle(2), throttle(null)];
  w.Graph.post = async (p, body) => {
    calls.push(["POST", p]);
    if (p === "/groups") { const e = createFaults.shift(); if (e) throw e; const g = { id: `new-${made.size + 1}`, displayName: body.displayName, securityEnabled: true, mailEnabled: false, owners: [] }; made.set(g.id, g); return { id: g.id, displayName: g.displayName }; }
    if (/members\/\$ref$/.test(p)) { const e = createFaults.shift(); if (e) throw e; return null; }
    return null;
  };
  w.Graph.readOne = async (p) => { const m = /\/groups\/([^/?]+)/.exec(p); return m && made.get(m[1]) ? made.get(m[1]) : null; };
  w.Graph.get = w.Graph.readOne;
  w.Graph.readAll = async (p) => { const m = /\/groups\/([^/?]+)\/owners/.exec(p); if (m) return []; if (/members\/microsoft\.graph\.group/.test(p)) return [{ id: "new-1" }]; return []; };
  const Lc = { stopped: false, start() {}, skip() {}, fail() {}, done() {}, progress() {} };
  const rc = await MM.applyOps([{ type: "create", key: "x", name: "INT-SG-D-XXX", description: "" }], { ledger: Lc, me: null });
  ok("a create that is throttled twice waits (2 s, then 4 s) and sends the SAME POST again until it goes", rc.results[0].ok === true && calls.filter((c) => c[0] === "POST" && c[1] === "/groups").length === 3 && waits.join() === "2250,4250", JSON.stringify([rc.results[0], waits]));
  calls.length = 0; waits.length = 0; createFaults = [throttle(null), throttle(null), throttle(null), throttle(null), throttle(null), throttle(null), throttle(null)];
  const rc2 = await MM.applyOps([{ type: "create", key: "y", name: "INT-SG-D-YYY", description: "" }, { type: "nest", key: "y", parent: { id: "wd", name: "WAVE" }, child: { ref: "INT-SG-D-YYY", name: "INT-SG-D-YYY" }, kind: "device", size: 0 }], { ledger: Lc, me: null });
  ok("a create whose throttle never lifts (1 + 5 tries) stops the run; the nest after it is skipped as stopped, never sent", rc2.results[0].ok === false && /throttled — stopped at step 1 of 2/.test(rc2.results[0].note) && rc2.results[1].skipped && /stopped/.test(rc2.results[1].note) && rc2.stopped && calls.filter((c) => c[0] === "POST" && c[1] === "/groups").length === 6 && waits.length === 5, JSON.stringify([rc2.results.map((r) => [r.ok, r.skipped, r.note]), calls.length]));
  calls.length = 0; waits.length = 0; createFaults = [throttle(1), null];
  const rc3 = await MM.applyOps([{ type: "nest", key: "z", parent: { id: "wd", name: "WAVE" }, child: { id: "new-1", name: "INT-SG-D-XXX" }, kind: "device", size: 0 }], { ledger: Lc, me: null });
  ok("a nest that is throttled once waits and goes", rc3.results[0].ok === true && waits.join() === "1250" && calls.filter((c) => /members\/\$ref$/.test(c[1])).length === 2, JSON.stringify([rc3.results[0], waits]));

  console.log(`T28 throttle: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

// T28 — the Plan contract (build 10721, Phase 2.1 of the 15 Oct rebuild
// plan). js/t28plan.js alone, every dependency stubbed: run refuses before
// writing when the backup is missing, stale or the plan changed; re-reads
// the hold-back and drops the newly held (refusing when nobody is left or
// the re-read fails); applies, verifies and reports; record builds the run
// 📜 keeps; resume plans the steps a stopped run did not do.
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "../..");
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const ctx = vm.createContext({ Math, JSON, Date, Promise, Error, Object, Array, String, Number, Set, Map, console });
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/t28plan.js"), "utf8") + ";globalThis.P = T28Plan;", ctx);
const P = ctx.P;

const addOp = (ids, extra) => Object.assign({ type: "add", key: "nl", group: { id: "su-nl", name: "INT-SG-U-NLD" }, ids, memberKind: "user", label: `${ids.length} users`, objs: ids.map((id) => ({ id })) }, extra || {});
function deps(over) {
  const calls = [];
  const d = {
    calls,
    ensureScopes: async (sc) => { calls.push(["scopes", sc]); },
    writeScopes: ["Group.ReadWrite.All"],
    backup: [{ id: "su-nl", kind: "user", members: ["u1"] }],
    unchanged: async () => true,
    stillCurrent: () => true,
    holdBackGroups: () => [{ id: "hb-u", kind: "user" }],
    readHoldNow: async () => ({ users: new Set(), devices: new Set(), names: new Map(), read: 1 }),
    guardCtx: () => ({ users: new Set(), devices: new Set(), nameOf: () => "", unread: "" }),
    guardHeld: (ops, c) => {
      // the real guard's shape: drop held ids, count them
      let users = 0; const skipped = [];
      const out = ops.map((o) => { if (o.type !== "add" || o.memberKind !== "user") return o; const keep = o.ids.filter((id) => !c.users.has(id)); for (const id of o.ids) if (c.users.has(id)) { users++; skipped.push(`${o.group.name}: ${c.nameOf("user", id) || id} — held back (⏸), not added`); } return keep.length ? Object.assign({}, o, { ids: keep }) : null; }).filter(Boolean);
      return { ops: out, stripped: { users, devices: 0 }, skipped, refused: "" };
    },
    readMe: async () => ({ id: "me" }),
    ledger: (p) => { const L = { stopped: false, finish: () => { calls.push(["finish"]); }, items: p.ops.length }; calls.push(["ledger", p.ops.length]); return L; },
    applyOps: async (ops, o) => { calls.push(["apply", ops.map((x) => x.type + ":" + (x.ids || [x.name]).join("+")), !!o.me]); return { results: ops.map((op) => ({ op, ok: true, verified: true })), done: ops, created: new Map(ops.filter((x) => x.type === "create").map((x) => [x.name.toLowerCase(), "new-" + x.name])), stopped: "" }; },
    actualOps: (r) => r.done,
    verifiedOps: (r) => r.done,
  };
  return Object.assign(d, over || {});
}
const words = { opWord: (o) => o.type, opLabel: (o) => `${o.group ? o.group.name : o.name} · ${o.label || ""}`, backupOf: () => ({ policies: [], membership: [1] }) };

async function main() {
  // ---------------------------------------------------- refusals first --
  let threw = "";
  try { await P.run({ ops: [addOp(["u2"])] }, deps({ backup: null })); } catch (e) { threw = e.message; }
  ok("no backup → refused before anything is written", /changed after the backup/.test(threw));
  const d0 = deps({ unchanged: async () => false });
  threw = ""; try { await P.run({ ops: [addOp(["u2"])] }, d0); } catch (e) { threw = e.message; }
  ok("targets changed since the backup → refused, nothing applied", /changed after the backup/.test(threw) && !d0.calls.some((c) => c[0] === "apply"));
  const d1 = deps({ stillCurrent: () => false });
  threw = ""; try { await P.run({ ops: [addOp(["u2"])] }, d1); } catch (e) { threw = e.message; }
  ok("the plan on screen is not this one any more → refused", /Plan context changed/.test(threw) && !d1.calls.some((c) => c[0] === "apply"));
  const d2 = deps({ readHoldNow: async () => { throw Object.assign(new Error("429"), { kind: "throttled" }); } });
  threw = ""; try { await P.run({ ops: [addOp(["u2"])] }, d2); } catch (e) { threw = e.message; }
  ok("the hold-back cannot be re-read → refused, named, nothing written", /hold-back could not be read right before writing \(429\)/.test(threw) && !d2.calls.some((c) => c[0] === "apply"));
  const d3 = deps({ readHoldNow: async () => ({ users: new Set(["u2"]), devices: new Set(), names: new Map([["user|u2", "milan@x"]]), read: 1 }) });
  threw = ""; try { await P.run({ ops: [addOp(["u2"])] }, d3); } catch (e) { threw = e.message; }
  ok("everyone the plan would add is held back now → refused", /Everyone this plan would add is held back/.test(threw) && !d3.calls.some((c) => c[0] === "apply"));

  // --------------------------------------------- the happy path, named --
  const d4 = deps({ readHoldNow: async () => ({ users: new Set(["u2"]), devices: new Set(), names: new Map([["user|u2", "milan@x"]]), read: 1 }) });
  const plan = { title: "Wave members — 1 country", runKind: null, ops: [addOp(["u2", "u3"]), { type: "create", name: "INT-SG-D-NLD", key: "nl" }] };
  const out = await P.run(plan, d4);
  ok("the order: scopes, (backup check), hold-back re-read, ledger, apply, finish", d4.calls.map((c) => c[0]).join() === "scopes,ledger,apply,finish", d4.calls.map((c) => c[0]).join());
  ok("the newly held member is dropped from the add and named; the rest goes; the create asks for the owner", out.ops[0].ids.join() === "u3" && out.preSkipped.length === 2 && /milan@x — held back/.test(out.preSkipped[0]) && /grew by 1 member/.test(out.preSkipped[1]) && d4.calls.find((c) => c[0] === "apply")[2] === true && plan.ops === out.ops);
  ok("verify: created groups by name, done and verified, okN, not uncertain, not stopped", out.createdGroups.length === 1 && out.createdGroups[0].displayName === "INT-SG-D-NLD" && out.createdGroups[0].id === "new-INT-SG-D-NLD" && out.verifiedDone.length === 2 && out.okN === 2 && out.uncertain === false && out.stopped === "");
  const d5 = deps({ verifiedOps: (r) => r.done.slice(0, 1) });
  const out5 = await P.run({ title: "t", ops: [addOp(["u2"]), addOp(["u4"], { group: { id: "su-de", name: "INT-SG-U-GER" } })] }, d5);
  ok("a step done but not verified makes the run uncertain", out5.uncertain === true && out5.verifiedDone.length === 1 && out5.actualDone.length === 2);
  const d6 = deps({ applyOps: async (ops) => ({ results: [{ op: ops[0], ok: false, skipped: false, note: "20 added, then throttled — stopped at chunk 2 of 3" }, { op: ops[1], ok: false, skipped: true, note: "stopped — throttled" }], done: [], created: new Map(), stopped: "throttled — stopped at chunk 2 of 3" }) });
  const out6 = await P.run({ title: "t", ops: [addOp(["u2"]), addOp(["u4"], { group: { id: "su-de", name: "INT-SG-U-GER" } })] }, d6);
  ok("a stopped run is reported as stopped, with the stop reason", /throttled — stopped/.test(out6.stopped) && out6.okN === 0);
  const d7 = deps();
  const out7 = await P.run({ title: "revert", runKind: "revert", ops: [addOp(["u2"])] }, d7);
  ok("a revert plan skips the hold-back re-read (it writes to the hold-back itself)", out7.okN === 1 && !d7.calls.some((c) => c[0] === "hold"));

  // ------------------------------------------------------- the record --
  const rec = P.record(plan, out, words, { region: "Euro", risk: "accepted" });
  ok("record: the run 📜 keeps — title, kind, ok / bad, backup, done, uncertainDone, the ops, lines with the ⏸ notes, the extras", rec.title === plan.title && rec.kind === "members" && rec.ok === 2 && rec.bad === 0 && rec.backup.membership[0] === 1 && rec.done.length === 2 && rec.uncertainDone.length === 0 && rec.ops === plan.ops && rec.lines.length === 4 && /add · INT-SG-U-NLD/.test(rec.lines[0]) && /done · verified/.test(rec.lines[0]) && /held back since the read/.test(rec.lines[2]) && rec.region === "Euro" && rec.risk === "accepted" && typeof rec.at === "number");
  const rec6 = P.record({ title: "t", ops: [addOp(["u2"]), addOp(["u4"])] }, out6, words);
  ok("record of a stopped run: stopped true, the failed step's note, the skipped step said as skipped", rec6.stopped === true && rec6.bad === 2 && /failed — 20 added, then throttled/.test(rec6.lines[0]) && /skipped/.test(rec6.lines[1]));

  // -------------------------------------------------------- resume --
  const stoppedRun = { id: "run-1", title: "Wave members — 2 countries", runKind: null, ops: [addOp(["u2"]), addOp(["u4"], { group: { id: "su-de", name: "INT-SG-U-GER" } }), { type: "nest", key: "de", parent: { id: "wu", name: "WAVE" }, child: { id: "su-de", name: "INT-SG-U-GER" }, kind: "user" }], done: [addOp(["u2"])] };
  const rs = P.resume(stoppedRun);
  ok("resume: the steps not done, in order, as a new plan through the whole contract", rs && rs.ops.length === 2 && rs.ops[0].group.name === "INT-SG-U-GER" && rs.ops[1].type === "nest" && rs.title === "Resume: Wave members — 2 countries" && rs.resumeOf === "run-1" && rs.members === true && !rs.hasRemoval);
  ok("…the confirm line says where it picks up", /resume the run from step 2 of 3: 2 steps still to write/.test(rs.confirmLine));
  ok("a run with everything done, or without saved ops, has nothing to resume", P.resume({ ops: stoppedRun.ops, done: stoppedRun.ops }) === null && P.resume({ title: "old (10716)", done: [] }) === null);
  ok("opKey tells ops apart by kind, target and members, and ignores order of ids", P.opKey(addOp(["u2", "u3"])) === P.opKey(addOp(["u3", "u2"])) && P.opKey(addOp(["u2"])) !== P.opKey(addOp(["u2"], { group: { id: "su-de" } })) && P.opKey({ type: "nest", parent: { id: "A" }, child: { ref: "x" } }) === "nest|a|x");

  // ------------------------------------------- runItems (10725) --
  const items = [{ id: "p1", key: "k1", name: "Policy one", changes: [1], lastMod: "a" }, { id: "p2", key: "k2", name: "Policy two", changes: [1], lastMod: "b" }, { id: "p3", key: "k3", name: "Policy three", changes: [1], lastMod: "c" }];
  const log = [];
  const L2 = { stopped: false, start: (i) => log.push(["start", i]), skip: (i, w) => log.push(["skip", i, w]), fail: (i, w, l) => log.push(["fail", i, w, l]), done: (i, w, l) => log.push(["done", i, l]), finish: () => log.push(["finish"]) };
  const base = (over) => Object.assign({
    ensureScopes: async () => {}, writeScopes: ["x"], stillCurrent: () => true, ledger: () => L2, stopOnFail: false,
    readFresh: async (x) => ({ policy: { lastModifiedDateTime: x.lastMod }, settings: [] }),
    drifted: (x, fr) => fr.policy.lastModifiedDateTime !== x.lastMod,
    prepare: () => ({ settings: [], missing: [] }), write: async () => {}, readBack: async () => ["back"], verified: () => true, summary: (x) => `${x.name} changed`, notVerifiedWhy: "no", missingWord: "rule",
  }, over || {});
  const ri = await P.runItems({ items }, base());
  ok("runItems: every item read fresh, written, read back, verified — done, lines, okN; the ledger walked start → done, then finished", ri.okN === 3 && ri.done.length === 3 && ri.lines.every((l) => /written · verified/.test(l)) && !ri.stopped && log.filter((e) => e[0] === "done").length === 3 && log[log.length - 1][0] === "finish");
  log.length = 0;
  const ri2 = await P.runItems({ items }, base({ readFresh: async (x) => ({ policy: { lastModifiedDateTime: x.id === "p2" ? "moved" : x.lastMod }, settings: [] }) }));
  ok("a policy that drifted since the dry run is skipped as drifted, not written; the others go", ri2.okN === 2 && /drifted — not written/.test(ri2.lines[1]) && log.some((e) => e[0] === "skip" && e[1] === 1 && /changed in the tenant/.test(e[2])));
  log.length = 0;
  const ri3 = await P.runItems({ items }, base({ stopOnFail: true, prepare: (x) => ({ settings: [], missing: x.id === "p1" ? ["Block abc"] : [] }) }));
  ok("stop on fail: a rule not found fails its step and the rest is skipped as stopped at the first failure", ri3.okN === 0 && ri3.stopped && /not written — rule not found/.test(ri3.lines[0]) && ri3.lines[1] === "Policy two: skipped" && ri3.lines[2] === "Policy three: skipped");
  const ri4 = await P.runItems({ items }, base({ verified: (x) => x.id !== "p3" }));
  ok("a write that does not read back is 'written · NOT verified' and not counted done", ri4.okN === 2 && /written · NOT verified/.test(ri4.lines[2]) && ri4.done.length === 2);
  const ri5 = await P.runItems({ items }, base({ write: async (x) => { if (x.id === "p2") throw new Error("503 boom"); } }));
  ok("a write that throws fails that item with the error; the others go", ri5.okN === 2 && /failed — 503 boom/.test(ri5.lines[1]));
  let threw2 = ""; try { await P.runItems({ items }, base({ stillCurrent: () => false })); } catch (e) { threw2 = e.message; }
  ok("the plan on screen changed → refused before anything is written", /Plan context changed/.test(threw2));

  console.log(`T28 plan contract: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

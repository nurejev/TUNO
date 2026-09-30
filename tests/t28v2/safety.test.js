const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const ROOT = path.join(__dirname, "../..");
let rows = [{ id: "A" }, { id: "b" }], reads = 0, fail = false;
const context = vm.createContext({ Graph: { SCOPES: { groups: ["Group.Read.All"] }, readAll: async () => { reads++; if (fail) throw new Error("denied"); return rows; } } });
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/t28v2safety.js"), "utf8") + ";globalThis.S = T28V2Safety;", context);
const S = context.S;
let passed = 0;
function ok(name, predicate) { assert(predicate, name); passed++; }
async function run() {
  const ops = [{ type: "add", key: "nl", group: { id: "G" }, ids: ["c"] }, { type: "remove", group: { id: "G" }, ids: ["a"] }];
  let snap = await S.capture(ops);
  ok("capture deduplicates affected group/kind", snap.length === 1 && reads === 1);
  ok("snapshot normalizes ids and orders members", JSON.stringify(snap[0].members) === '["a","b"]');
  ok("unchanged membership passes", await S.unchanged(snap));
  rows = [{ id: "b" }, { id: "A" }]; ok("different Graph order is not drift", await S.unchanged(snap));
  rows = [{ id: "a" }, { id: "b" }, { id: "c" }]; ok("member addition rejects old plan", !await S.unchanged(snap));
  rows = [{ id: "a" }]; ok("member removal rejects old plan", !await S.unchanged(snap));
  fail = true;
  let rejected = false; try { await S.unchanged(snap); } catch { rejected = true; }
  ok("failed preflight read fails closed", rejected); fail = false;
  rows = null; rejected = false; try { await S.capture(ops); } catch { rejected = true; }
  ok("incomplete read is not interpreted as empty", rejected); rows = [];
  const newSnap = await S.capture([{ type: "create", name: "new" }, { type: "add", group: { ref: "new" }, ids: ["x"] }]);
  ok("newly created groups do not request a nonexistent id", newSnap.length === 0);
  const done = { type: "add", key: "nl", group: { id: "G" }, ids: ["c"] };
  let result = { done: [done], results: [{ op: ops[0], ok: true, verified: false }] };
  ok("unverified writes never become verified membership", S.verifiedOps(result).length === 0);
  result.results[0].verified = true;
  ok("verified write becomes recorded delta", S.verifiedOps(result).length === 1);
  result.results[0].ok = false;
  ok("partial failure excluded from blind undo", S.verifiedOps(result).length === 0);
  const newOp = { type: "add", key: "de", group: { ref: "new" }, ids: ["x"] };
  result = { done: [{ ...newOp, group: { id: "newid" } }], results: [{ op: newOp, ok: true, verified: true }], created: new Map([["new", "newid"]]) };
  ok("created group references resolve for verified operations", S.verifiedOps(result).length === 1);
  const baseline = [{ id: "g", kind: "device", members: ["a", "b"] }, { id: "p", kind: "group", members: ["child"] }];
  const actual = S.actualOps({ done: [{ type: "add", group: { id: "g" }, ids: ["a", "c"] }, { type: "remove", group: { id: "g" }, ids: ["b", "d"] }, { type: "nest", parent: { id: "p" }, child: { id: "child" } }, { type: "unnest", parent: { id: "p" }, child: { id: "absent" } }] }, baseline);
  ok("undo omits a pre-existing member", actual[0].ids.join() === "c");
  ok("undo omits removing an already absent member", actual[1].ids.join() === "b");
  ok("undo never removes pre-existing nesting", actual.length === 2);
  const valid = { schema: "tuno.t28.v2.run-bundle/1", tenantId: "tenantA", runs: [{ title: "run", kind: "members", lines: ["verified"] }] };
  ok("same tenant bundle validates", S.validateBundle(valid, "tenanta"));
  rejected = false; try { S.validateBundle(valid, "tenantb"); } catch { rejected = true; }
  ok("cross tenant import is rejected", rejected);
  rejected = false; try { S.validateBundle({ ...valid, schema: "wrong" }, "tenanta"); } catch { rejected = true; }
  ok("unknown file schema rejected", rejected);
  rejected = false; try { S.validateBundle({ ...valid, runs: [{ title: "run", kind: "members", lines: [null] }] }, "tenanta"); } catch { rejected = true; }
  ok("invalid record rejected before render", rejected);
  console.log(`T28 V2 safety: ${passed} passed`);
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

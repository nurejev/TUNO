// T28 — the project's state in the tenant (build 10715, Phase 1.3 of the
// 15 Oct rebuild plan). js/t28state.js alone, DOM-free, with a stubbed
// Graph and a stubbed localStorage: collect takes the state keys and
// nothing else, apply writes the tenant's copy over the browser's and says
// what changed, read says "not found" on a 404 and throws on anything
// else, write POSTs the first time and PATCHes after.
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "../..");
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const store = new Map();
const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const calls = [];
let getAnswer = null;
const Graph = {
  SCOPES: { groups: ["Group.Read.All"] },
  get: async (p) => { calls.push(["GET", p]); if (getAnswer instanceof Error) throw getAnswer; return getAnswer; },
  post: async (p, body) => { calls.push(["POST", p, body]); return Object.assign({ id: body.extensionName }, body); },
  patch: async (p, body) => { calls.push(["PATCH", p, body]); return null; },
};
const ctx = vm.createContext({ window: { localStorage }, Graph, GroupMigrate: { SCOPES: { groupWrite: ["Group.ReadWrite.All"] } } });
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/t28state.js"), "utf8") + ";globalThis.S = T28State;", ctx);
const S = ctx.S;

async function run() {
  const T = "020eb2d3-tenant";
  const K = S.keysFor(T);
  ok("the keys are per tenant, lower-cased", K.rules === "tuno.t28.v2.rules.020eb2d3-tenant" && K.reasons === "tuno.t28.revert.reasons.020eb2d3-tenant" && S.keysFor("ABC").history === "tuno.t28.project.history.abc");

  // ----------------------------------------------------------- collect --
  store.set(K.rules, JSON.stringify({ newPrefixes: ["Win - OIB"], revertUser: "INT-SG-U-MDE-HoldBack", fixWith: "groups", pilotGroupsOff: false, exclusionDevice: "", exclusionUser: "", members: { countryMap: [1, 2], batched: ["NL-Breda"], migrated: ["NL-Breda"] } }));
  store.set(K.reasons, JSON.stringify({ "u1": "VIP, waits for Q1" }));
  store.set(K.groupsync, JSON.stringify({ nl: 1792000000000 }));
  store.set(K.edgeList, JSON.stringify(["abc", "def"]));
  const st = S.collect(T);
  ok("collect takes the STATE of the rules blob — fixWith, pilotGroupsOff, a retired ⊘ pair, batched, migrated — and none of the rules", st.rulesState.fixWith === "groups" && st.rulesState.pilotGroupsOff === false && st.rulesState.exclusionDevice === "" && st.members.batched.join() === "NL-Breda" && st.members.migrated.join() === "NL-Breda" && !("newPrefixes" in st.rulesState) && !("revertUser" in st.rulesState) && !("countryMap" in st.members));
  ok("…and the other keys as they are; an absent key is null; the history is NOT in the tenant copy (10719)", st.reasons.u1 === "VIP, waits for Q1" && st.groupsync.nl === 1792000000000 && st.edgeList.join() === "abc,def" && st.revertList === null && !("history" in st) && st.v === 1);
  ok("the line says what the project decided", /1 batched/.test(S.line(st)) && /1 migrated/.test(S.line(st)) && /⊘ retired/.test(S.line(st)) && /1 hold-back reasons/.test(S.line(st)) && /1 sync stamps/.test(S.line(st)) && /Edge list of 2/.test(S.line(st)) && !/history/.test(S.line(st)));
  ok("same() compares what would be written", S.same(st, S.collect(T)) && !S.same(st, Object.assign({}, st, { reasons: {} })));

  // ------------------------------------------------------------- apply --
  const fromTenant = { v: 1, rulesState: { fixWith: "waves", exclusionDevice: "INT-SG-D-MDE-Exclusion", exclusionUser: "INT-SG-U-MDE-Exclusion" }, members: { batched: ["NL-Breda", "IT"] }, reasons: { u1: "VIP, waits for Q1", u2: "left the company" }, groupsync: { nl: 1792000000000 }, edgeList: ["abc", "def"] };
  const changed = S.apply(T, fromTenant);
  const rules = JSON.parse(store.get(K.rules));
  ok("apply writes the tenant's state over the browser's keys and says which changed", changed.join() === "rules,reasons" && rules.fixWith === "waves" && rules.members.batched.join() === "NL-Breda,IT" && rules.exclusionDevice === "INT-SG-D-MDE-Exclusion" && JSON.parse(store.get(K.reasons)).u2 === "left the company", changed.join());
  ok("…and leaves the rules themselves and the untouched keys alone", rules.newPrefixes.join() === "Win - OIB" && rules.revertUser === "INT-SG-U-MDE-HoldBack" && rules.members.countryMap.join() === "1,2" && rules.members.migrated.join() === "NL-Breda" && rules.pilotGroupsOff === false && store.get(K.groupsync) === JSON.stringify({ nl: 1792000000000 }));
  ok("applying the same state again changes nothing", S.apply(T, fromTenant).length === 0);
  ok("apply with nothing is a no-op", S.apply(T, null).length === 0 && S.apply(T, "x").length === 0);

  // -------------------------------------------------------------- read --
  getAnswer = Object.assign(new Error("Not Found"), { kind: "notfound", status: 404 });
  const r404 = await S.read("G1");
  ok("read: a 404 is 'no extension yet', not an error", r404.found === false && r404.state === null && /\/groups\/G1\/extensions\/nl\.limonit\.tuno\.t28$/.test(calls[0][1]));
  getAnswer = { id: S.EXT, state: JSON.stringify(Object.assign({ history: [{ title: "old" }] }, fromTenant)), at: "2026-10-16T07:00:00Z", by: "adm@x", v: 1 };
  const r = await S.read("G1");
  ok("read: a 10715 single-extension state still parses, with at / by / v; its history is dropped", r.found && r.state.members.batched.join() === "NL-Breda,IT" && r.at === "2026-10-16T07:00:00Z" && r.by === "adm@x" && r.v === 1 && r.parts === 0 && !("history" in r.state));
  // 10719: the state in PARTS (Graph caps an open extension at 2 KB)
  const big = Object.assign({}, fromTenant, { reasons: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`user-${i}`, `reason number ${i} for the hold-back, written by hand`])) });
  const text = JSON.stringify(big), n = Math.ceil(text.length / S.PART);
  const answers = { [`/groups/G1/extensions/${S.EXT}`]: { id: S.EXT, at: "2026-10-16T08:00:00Z", by: "adm@x", v: 2, parts: n, bytes: text.length } };
  for (let i = 0; i < n; i++) answers[`/groups/G1/extensions/${S.EXT}.p${i + 1}`] = { data: text.slice(i * S.PART, (i + 1) * S.PART) };
  Graph.get = async (p) => { calls.push(["GET", p]); if (!answers[p]) throw Object.assign(new Error("Not Found"), { kind: "notfound", status: 404 }); return answers[p]; };
  const rp = await S.read("G1");
  ok("read: meta then the parts, joined and parsed", n >= 3 && rp.found && rp.parts === n && Object.keys(rp.state.reasons).length === 60 && rp.state.members.batched.join() === "NL-Breda,IT" && rp.v === 2);
  delete answers[`/groups/G1/extensions/${S.EXT}.p2`];
  threw = "";
  try { await S.read("G1"); } catch (e) { threw = e.message; }
  ok("read: a missing part is an error (incomplete), never a partial state", /incomplete/.test(threw) && new RegExp(`${n - 1} of ${n} parts`).test(threw));
  Graph.get = async (p) => { calls.push(["GET", p]); if (getAnswer instanceof Error) throw getAnswer; return getAnswer; };
  getAnswer = Object.assign(new Error("429 Too Many Requests"), { kind: "throttled", status: 429 });
  threw = "";
  try { await S.read("G1"); } catch (e) { threw = e.message; }
  ok("read: any other failure throws — an unread state is never an empty one", /429/.test(threw));
  getAnswer = { id: S.EXT, state: "{not json", at: "", by: "", v: 1 };
  threw = "";
  try { await S.read("G1"); } catch (e) { threw = e.message; }
  ok("read: an unreadable state throws, saying so", /not readable JSON/.test(threw));

  // ------------------------------------------------------------- write --
  calls.length = 0;
  const w1 = await S.write("G1", st, "adm@x", false);
  const posts = calls.filter((c) => c[0] === "POST");
  ok("write: the first time POSTs the part(s) first and the meta last — the meta names the parts, each part carries ≤ PART chars of the JSON", posts.length === 2 && posts[0][2].extensionName === `${S.EXT}.p1` && posts[0][2].data.length <= S.PART && JSON.parse(posts[0][2].data).members.batched.join() === "NL-Breda" && posts[1][2].extensionName === S.EXT && posts[1][2].parts === 1 && posts[1][2].by === "adm@x" && posts[1][2].v === 2 && w1.created === true && w1.parts === 1 && /^\d{4}-/.test(w1.at));
  calls.length = 0;
  const w2 = await S.write("G1", st, "adm@x", { parts: 1 });
  ok("write: after that PATCHes the part and the meta by name", calls.length === 2 && calls[0][0] === "PATCH" && calls[0][1] === `/groups/G1/extensions/${S.EXT}.p1` && calls[1][0] === "PATCH" && calls[1][1] === `/groups/G1/extensions/${S.EXT}` && !("extensionName" in calls[1][2]) && w2.created === false);
  calls.length = 0;
  const w3 = await S.write("G1", big, "adm@x", { parts: 1 });
  ok("write: a state that grew PATCHes the part it had and POSTs the new ones, then the meta with the new count", w3.parts === n && calls.filter((c) => c[0] === "PATCH" && /\.p1$/.test(c[1])).length === 1 && calls.filter((c) => c[0] === "POST").length === n - 1 && calls[calls.length - 1][1] === `/groups/G1/extensions/${S.EXT}` && calls[calls.length - 1][2].parts === n);
  Graph.del = async (p) => { calls.push(["DELETE", p]); return null; };
  calls.length = 0;
  const w4 = await S.write("G1", st, "adm@x", { parts: n });
  ok("write: a state that shrank deletes the parts beyond the new count, after the meta", w4.parts === 1 && calls.filter((c) => c[0] === "DELETE").length === n - 1 && calls.findIndex((c) => c[0] === "DELETE") > calls.findIndex((c) => c[1] === `/groups/G1/extensions/${S.EXT}`));
  threw = "";
  try { await S.write("G1", { pad: "x".repeat(S.PART * (S.MAX_PARTS + 1)) }, "adm@x", false); } catch (e) { threw = e.message; }
  ok("write: a state beyond MAX_PARTS is refused before anything is written", /too large/.test(threw));

  console.log(`T28 project state: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

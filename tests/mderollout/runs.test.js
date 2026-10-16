// T28 — run bundles in IndexedDB (build 10716, Phase 1.4 of the 15 Oct
// rebuild plan). js/t28runs.js alone, with fake-indexeddb standing in for
// the browser's database and, in a second context, no database at all so
// the localStorage fallback is exercised: save stamps id / tenant / v and
// keeps the shape, list is per tenant oldest first, a run is JSON (no
// functions, no cycles), remove and clear work, the cap holds.
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "../..");
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const { indexedDB, IDBKeyRange } = require("fake-indexeddb");
const mkStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
function boot(withIdb) {
  const ctx = vm.createContext(Object.assign({ window: { localStorage: mkStore() }, Math, JSON, Date, Promise, Error, Object, Array, String, Number, setTimeout }, withIdb ? { indexedDB, IDBKeyRange } : {}));
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/t28runs.js"), "utf8") + ";globalThis.R = T28Runs;", ctx);
  return { R: ctx.R, ls: ctx.window.localStorage };
}
const run = (at, title, extra) => Object.assign({ at, title, kind: "members", runKind: "groupsync", ok: 2, bad: 0, stopped: false, lines: ["a: done · verified"], backup: { policies: [], membership: [{ id: "g1", kind: "user", members: ["u1"] }] }, done: [{ type: "add", group: { id: "g1", name: "INT-SG-U-NLD" }, ids: ["u2"], memberKind: "user", objs: [{ id: "u2" }] }] }, extra || {});

async function main() {
  // ----------------------------------------------------------- IndexedDB --
  const { R } = boot(true);
  ok("where says indexeddb when the browser has one", R.where() === "indexeddb");
  const r1 = await R.save("TENANT-A", run(1000, "first", { fn: () => 1, cycle: null }));
  ok("save stamps an id and says where it went", /^tenant-a:1000:/.test(r1.id) && r1.where === "indexeddb");
  const r2 = await R.save("tenant-a", run(2000, "second"));
  await R.save("tenant-b", run(1500, "other tenant"));
  const la = await R.list("Tenant-A");
  ok("list is per tenant (case-insensitive), oldest first, the shape kept — done steps, backup, lines", la.length === 2 && la[0].title === "first" && la[1].title === "second" && la[1].id === r2.id && la[0].done[0].ids.join() === "u2" && la[0].backup.membership[0].members.join() === "u1" && la[0].lines[0] === "a: done · verified");
  ok("a run is stored as JSON: functions dropped, tenant lower-cased, v 1", !("fn" in la[0]) && la[0].tenant === "tenant-a" && la[0].v === 1);
  const again = await R.save("tenant-a", Object.assign({}, la[0], { title: "first (saved again)" }));
  ok("saving a run that has an id updates it in place", again.id === la[0].id && (await R.list("tenant-a")).length === 2 && (await R.list("tenant-a"))[0].title === "first (saved again)");
  ok("remove takes one out", await R.remove(r2.id) && (await R.list("tenant-a")).length === 1);
  ok("clear forgets a tenant's runs and nobody else's", (await R.clear("tenant-a")) === 1 && (await R.list("tenant-a")).length === 0 && (await R.list("tenant-b")).length === 1);
  for (let i = 0; i < R.KEEP + 5; i++) await R.save("tenant-c", run(10000 + i, `run ${i}`));
  const lc = await R.list("tenant-c");
  ok("list returns the newest KEEP runs", lc.length === R.KEEP && lc[lc.length - 1].title === `run ${R.KEEP + 4}`);

  // ------------------------------------------------- no database at all --
  const { R: F, ls } = boot(false);
  ok("where says localstorage without IndexedDB", F.where() === "localstorage");
  const f1 = await F.save("tenant-z", run(1, "fallback"));
  ok("save goes to localStorage, said as such", f1.where === "localstorage" && !!ls.getItem("tuno.t28.runs.tenant-z"));
  for (let i = 0; i < 60; i++) await F.save("tenant-z", run(100 + i, `fb ${i}`));
  const fl = await F.list("tenant-z");
  ok("the fallback keeps the last 50, oldest first", fl.length === 50 && fl[0].title === "fb 10" && fl[49].title === "fb 59");
  ok("remove is a no-op there (false), clear drops the key", (await F.remove(f1.id)) === false && (await F.clear("tenant-z")) === 0 && !ls.getItem("tuno.t28.runs.tenant-z"));

  console.log(`T28 run bundles: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

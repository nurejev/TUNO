// ======================================================================
// Run ledger (js/runledger.js, ENCA's, build 10605) — and the batch writers
// that drive it: T11's applyPlan, T04's restore and assignment import,
// T25's apply, T22's archived cleanup.
//
// Two things are defended. The ledger itself: every row is on the screen
// before the first write, a row turns as it lands, the footer counts agree
// with the rows, Stop skips the rest and finish() closes the box. And the
// contract the engines keep with it: what an engine pushes into `results`
// is what the row says — done/fail/skip per row, in the row's own index —
// and Stop is honoured BETWEEN rows, never mid-write.
//
// Run with `npm test`, or alone:  node tests/runledger/runledger.test.js
// ======================================================================
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch { console.error("jsdom is not installed. Run `npm install` at the repository root first."); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log("  ✗ " + n + (x ? "  → " + x : "")); } };
const head = (t) => console.log("\n" + t);

// A window with the ledger and the engines under test, and NOTHING else —
// the engines are exercised against a fake Graph, so the boot stays small.
// ONE eval per window: a `const` declared in one eval is invisible to the
// next (the harness lesson), so the sources and the bridge go in together,
// and the fakes the sources expect are set up FIRST.
function boot(files, names, pre) {
  const dom = new JSDOM("<!doctype html><body><div id=host></div></body>", { runScripts: "outside-only", url: "https://nurejev.github.io/tuno-beta/" });
  const w = dom.window;
  w.Element.prototype.scrollIntoView = w.Element.prototype.scrollIntoView || function () {};
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  w.eval((pre || "") + "\n;\n" + src + `\n;Object.assign(window, {${names.join(",")}});`);
  return w;
}

// The fake ledger the engine contract is checked against: records every
// call in order, exposes `stopped` like the real one.
function fakeLedger() {
  const calls = [];
  let stopped = false;
  return {
    calls,
    get stopped() { return stopped; },
    stopAfter(n) { this._stopAfter = n; },
    start(i, st) { calls.push(["start", i, st]); if (this._stopAfter !== undefined && calls.filter((c) => c[0] === "start").length > this._stopAfter) stopped = true; },
    done(i, note, st) { calls.push(["done", i, note, st]); },
    fail(i, why, st) { calls.push(["fail", i, why, st]); },
    skip(i, why, st) { calls.push(["skip", i, why, st]); },
    finish() { calls.push(["finish"]); },
  };
}

(async () => {

// =====================================================================
head("The ledger — the whole list first, then one row at a time");
{
  const w = boot(["js/runledger.js"], ["RunLedger"]);
  const host = w.document.getElementById("host");
  let stopCalled = 0;
  const L = w.RunLedger.create(host, { unit: "policies", title: "adding G", items: [{ label: "A", sub: "s1" }, "B", { label: "C" }], onStop: () => stopCalled++ });
  const rows = () => [...host.querySelectorAll(".rl-row")];
  ok("every item is a row before anything starts", rows().length === 3);
  ok("all rows wait", rows().every((r) => r.classList.contains("pend")) && rows()[0].querySelector(".st").textContent === "waiting");
  ok("the header counts the unit", host.querySelector(".rl-hd b").textContent === "3 policies");
  ok("the title rides along", host.querySelector(".rl-hd .mini").textContent === "adding G");
  ok("a string item is a label", rows()[1].querySelector(".lbl").textContent.trim() === "B");
  ok("the sub prints small", rows()[0].querySelector(".lbl small").textContent === "s1");
  ok("Stop is offered", !!host.querySelector(".rl-ft .stop"));

  L.start(0, "checking…");
  ok("start marks the row as working with its phrase", rows()[0].classList.contains("work") && rows()[0].querySelector(".st").textContent === "checking…");
  L.start(0, "writing…");
  ok("a second start re-phrases the same row", rows()[0].querySelector(".st").textContent === "writing…" && rows().filter((r) => r.classList.contains("work")).length === 1);
  L.done(0, "", "written · verified");
  ok("done turns the row green with the verdict", rows()[0].classList.contains("done") && rows()[0].querySelector(".st").textContent === "written · verified" && rows()[0].querySelector(".ic").textContent === "✓");
  ok("the footer counts it", host.querySelector('[data-k="done"]').textContent === "1 done" && host.querySelector('[data-k="pend"]').textContent === "2 waiting");
  ok("the bar moved", host.querySelector(".rl-bar i").style.width === "33%");
  L.start(1); L.fail(1, "403 from Graph");
  ok("fail turns the row red, reason inline", rows()[1].classList.contains("fail") && rows()[1].querySelector(".lbl small").textContent === "403 from Graph" && rows()[1].querySelector(".ic").textContent === "✗");
  ok("the footer counts the failure", host.querySelector('[data-k="fail"]').textContent === "1 failed");
  ok("the header says so too", /1 failed/.test(host.querySelector(".rl-hd .n").textContent));
  ok("the bar wears the failure", host.querySelector(".rl-bar i").classList.contains("has-fail"));
  const html = rows()[1].querySelector(".lbl").innerHTML;
  L.skip(2, "<b>x</b> & y", "collided");
  ok("a note is escaped, never markup", rows()[2].querySelector(".lbl small").textContent === "<b>x</b> & y" && !rows()[2].querySelector(".lbl b"), html);
  ok("skip is the third state", rows()[2].classList.contains("skip") && rows()[2].querySelector(".st").textContent === "collided");

  host.querySelector(".rl-ft .stop").click();
  ok("Stop flips the flag and calls back", L.stopped === true && stopCalled === 1);
  ok("Stop says it is stopping after this one", /Stopping/.test(host.querySelector(".rl-ft .stop").textContent) && host.querySelector(".rl-ft .stop").disabled);

  L.finish();
  ok("finish closes the box", host.querySelector(".rl").classList.contains("finished") && host.querySelector(".rl").classList.contains("has-fail"));
  ok("finish removes Stop", !host.querySelector(".rl-ft .stop"));
  ok("nothing is left waiting", host.querySelector('[data-k="pend"]').textContent === "0 waiting");
}

// =====================================================================
head("finish() names what was never reached, and stopped is not failed");
{
  const w = boot(["js/runledger.js"], ["RunLedger"]);
  const host = w.document.getElementById("host");
  const L = w.RunLedger.create(host, { unit: "groups", items: ["A", "B", "C"], onStop: false });
  ok("onStop:false hides Stop", !host.querySelector(".rl-ft .stop"));
  L.start(0); L.done(0);
  L.finish();
  const rows = [...host.querySelectorAll(".rl-row")];
  ok("unreached rows are skipped, not failed", rows[1].classList.contains("skip") && rows[2].classList.contains("skip"));
  ok("and say 'not reached'", rows[1].querySelector(".lbl small").textContent === "not reached");
  ok("a clean run is not has-fail", !host.querySelector(".rl").classList.contains("has-fail"));
  let reported = 0, retried = null;
  const L2 = w.RunLedger.create(host, { unit: "x", items: ["A", "B"] });
  L2.start(0); L2.fail(0, "no"); L2.start(1); L2.done(1);
  L2.finish({ report: () => reported++, retry: (idx) => { retried = idx; } });
  host.querySelector("[data-rl-report]").click();
  host.querySelector("[data-rl-retry]").click();
  ok("finish offers Report and Retry-the-failed when asked", reported === 1 && JSON.stringify(retried) === "[0]");
  const L3 = w.RunLedger.create(host, { unit: "x", items: ["A"] });
  L3.start(0); L3.done(0);
  L3.finish({ retry: () => {} });
  ok("Retry is not offered when nothing failed", !host.querySelector("[data-rl-retry]"));
}

// =====================================================================
head("T11 applyPlan drives the ledger row by row and honours Stop");
{
  // the engine's neighbours, faked
  const w = boot(["js/assignedit.js"], ["AssignEdit"], `
    window.GroupUse = { shortErr: (e, n) => String((e && e.message) || e).slice(0, n || 200) };
    window.PolicyCache = { invalidate() {} };
    window.calls = [];
    window.Graph = {
      BETA: "https://graph.microsoft.com/beta", SCOPES: { profiles: [], config: [] },
      readAll: async (p) => { window.calls.push(["read", p]); return window.tenant[p] || []; },
      post: async (p, body) => { window.calls.push(["post", p]); if (/fail/.test(p)) throw new Error("403 refused"); window.tenant[p.replace("/assign", "/assignments").replace("https://graph.microsoft.com/beta", "")] = body.assignments; return {}; },
      ensureScopes: async () => true,
    };
  `);
  const sf = w.AssignEdit.SURFACES[0];
  const mk = (id, name) => ({ policy: { id, name, surface: sf.id, surfaceLabel: sf.label }, before: [], beforeSig: w.AssignEdit.sig([]), after: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g1" } }], change: "modify" });
  const plan = { changes: [mk("p1", "One"), mk("p-fail", "Two"), mk("p3", "Three")] };
  w.tenant = {};
  const L = fakeLedger();
  const r = await w.AssignEdit.applyPlan(plan, { ledger: L });
  const seq = L.calls.map((c) => c[0] + c[1]).join(" ");
  ok("each row starts, then settles, in its own index", /^start0( start0)* done0 start1( start1)* fail1 start2( start2)* done2$/.test(seq), seq);
  ok("the verdict is the row's own", L.calls.find((c) => c[0] === "done" && c[1] === 0)[3] === "written · verified");
  ok("the failure carries Graph's reason", /403 refused/.test(L.calls.find((c) => c[0] === "fail")[2]));
  ok("results and rows agree", r.results.length === 3 && r.results[0].ok && r.results[1].error && r.results[2].ok);
  ok("stopOnFail is not implied by a ledger", !r.stopped);

  // Stop between rows: pressed while row 0 is in flight, row 0 finishes,
  // rows 1 and 2 are skipped as 'stopped', nothing is posted for them
  w.tenant = {}; w.calls = [];
  const L2 = fakeLedger(); L2.stopAfter(0);
  const r2 = await w.AssignEdit.applyPlan({ changes: [mk("p1", "One"), mk("p2", "Two"), mk("p3", "Three")] }, { ledger: L2 });
  ok("the row in flight finishes", r2.results[0].ok && L2.calls.some((c) => c[0] === "done" && c[1] === 0));
  ok("the rest are skipped as stopped", r2.results[1].skipped === "stopped" && r2.results[2].skipped === "stopped" && r2.stopped);
  ok("and never written", w.calls.filter((c) => c[0] === "post").length === 1);
  ok("the ledger heard the skips", L2.calls.filter((c) => c[0] === "skip").map((c) => c[1]).join(",") === "1,2");

  // drift is a failure on the row, worded as such, and stopOnFail still
  // skips the rest with the OLD reason
  w.tenant = { "/deviceManagement/deviceConfigurations/p1/assignments": [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "other" } }] };
  const L3 = fakeLedger();
  const r3 = await w.AssignEdit.applyPlan({ changes: [mk("p1", "One"), mk("p2", "Two")] }, { ledger: L3, stopOnFail: true });
  const drift = L3.calls.find((c) => c[0] === "fail");
  ok("drift fails the row with 'drifted — not written'", r3.results[0].drifted && drift && drift[3] === "drifted — not written", JSON.stringify(drift));
  ok("stopOnFail skips the rest with its own reason", r3.results[1].skipped === "stopped after an earlier failure" && L3.calls.find((c) => c[0] === "skip")[2] === "stopped after an earlier failure");
  ok("no ledger is fine — the engine still works", (await w.AssignEdit.applyPlan({ changes: [mk("p9", "Nine")] }, {})).results[0].ok);
}

// =====================================================================
head("T25 apply, T04 restore/import, T22 archived cleanup keep the same contract");
{
  // T25 — every outcome reaches the ledger through one exit
  const w = boot(["js/devicecleanup.js"], ["DeviceCleanup"], `
    window.GroupUse = { shortErr: (e) => String((e && e.message) || e) };
    window.Graph = { SCOPES: { deviceObjects: [], deviceObjectsWrite: [] },
      readOne: async (p) => { const id = /devices\\/([^?]+)/.exec(p)[1]; return window.dev[id] === undefined ? null : window.dev[id]; },
      patch: async (p, body) => { const id = /devices\\/([^?]+)/.exec(p)[1]; if (id === "d-fail") throw new Error("403 forbidden"); window.dev[id] = Object.assign({}, window.dev[id], body); },
      del: async () => {} };
  `);
  const old = new Date(Date.now() - 200 * 864e5).toISOString();
  w.dev = { d1: { id: "d1", accountEnabled: true, approximateLastSignInDateTime: old }, "d-fail": { id: "d-fail", accountEnabled: true, approximateLastSignInDateTime: old }, "d-woke": { id: "d-woke", accountEnabled: true, approximateLastSignInDateTime: new Date().toISOString() } };
  const ops = [{ kind: "disable", d: { id: "d1", displayName: "One" } }, { kind: "disable", d: { id: "d-fail", displayName: "Two" } }, { kind: "disable", d: { id: "d-woke", displayName: "Three" } }, { kind: "disable", d: { id: "gone", displayName: "Four" } }];
  const L = fakeLedger();
  const res = await w.DeviceCleanup.apply(ops, { ledger: L, thresholds: { disableDays: 90, deleteDays: 180 } });
  const kinds = L.calls.filter((c) => c[0] !== "start").map((c) => `${c[0]}${c[1]}`).join(" ");
  ok("T25: disabled → done, failed → fail, woke/gone → skip, each on its own row", kinds === "done0 fail1 skip2 skip3", kinds);
  ok("T25: the row says what the result says", L.calls.find((c) => c[0] === "done")[3] === "disabled" && res[0].outcome === "disabled" && /403/.test(L.calls.find((c) => c[0] === "fail")[2]));
  const L2 = fakeLedger(); L2.stopAfter(0);
  w.dev.d1.accountEnabled = true;
  const res2 = await w.DeviceCleanup.apply([ops[0], ops[0]], { ledger: L2, thresholds: { disableDays: 90, deleteDays: 180 } });
  ok("T25: Stop is honoured between devices", res2[0].outcome === "disabled" && res2[1].outcome === "skipped" && res2[1].detail === "stopped");

  // T04 restore — collided rows skip, creates land, Stop between objects
  const w2 = boot(["js/restore.js"], ["Restore"], `
    window.Graph = { BETA: "https://graph.microsoft.com/beta", SCOPES: { profiles: [], scriptsWrite: [] },
      readAll: async () => [], readOne: async (p) => ({ id: p.split("/").pop() }),
      post: async (p, body) => { if (/fail/.test(body.displayName || "")) throw new Error("400 bad body"); return { id: "new-" + (body.displayName || "x") }; },
      del: async () => {} };
  `);
  const area = Object.keys(w2.Restore.AREA_INFO).find((a) => a !== "AdmxPolicies" && a !== "PlatformScripts");
  const P = (target, extra) => Object.assign({ area, target, collided: false, children: 0, entry: { obj: { displayName: target }, name: target, settings: 0 } }, extra || {});
  const L3 = fakeLedger();
  const r3 = await w2.Restore.apply([P("A"), P("B", { collided: true }), P("fail C")], null, L3);
  const k3 = L3.calls.filter((c) => c[0] !== "start").map((c) => `${c[0]}${c[1]}`).join(" ");
  ok("T04 restore: created → done, collided → skip, refused → fail", k3 === "done0 skip1 fail2" && r3[0].outcome === "created" && r3[1].outcome === "skipped" && r3[2].outcome === "failed", k3);
  const L4 = fakeLedger(); L4.stopAfter(0);
  const r4 = await w2.Restore.apply([P("A"), P("B")], null, L4);
  ok("T04 restore: Stop between objects", r4[0].outcome === "created" && r4[1].outcome === "skipped" && r4[1].detail === "stopped");
  ok("T04 restore: no ledger still restores", (await w2.Restore.apply([P("Z")], null))[0].outcome === "created");

  // T04 assignment import — the same shape as T11's loop
  const w3 = boot(["js/assignedit.js", "js/backup.js"], ["AssignEdit", "AssignImport"], `
    window.GroupUse = { shortErr: (e, n) => String((e && e.message) || e).slice(0, n || 200) };
    window.JSZip = function () {};
    window.Graph = { BETA: "https://graph.microsoft.com/beta", SCOPES: { profiles: [] },
      readAll: async () => [], post: async (p) => { if (/fail/.test(p)) throw new Error("403"); return {}; }, ensureScopes: async () => true };
  `);
  const sf3 = w3.AssignEdit.SURFACES[0];
  const op = (id) => ({ policy: { id, name: id }, surface: sf3.id, currentSig: w3.AssignEdit.sig([]), current: [], want: [] });
  const L5 = fakeLedger();
  const r5 = await w3.AssignImport.apply({ replace: [op("p1"), op("p-fail")] }, null, L5);
  const k5 = L5.calls.filter((c) => c[0] !== "start").map((c) => `${c[0]}${c[1]}`).join(" ");
  ok("T04 import: written → done, refused → fail", k5 === "done0 fail1" && r5[0].ok && r5[1].error, k5);

  // T22 archived cleanup
  const w4 = boot(["js/groupmigrate.js"], ["GroupMigrate"], `
    window.GroupUse = { shortErr: (e, n) => String((e && e.message) || e).slice(0, n || 200), scopesFor: () => [], allSourceIds: () => [] };
    window.AssignEdit = { READ: () => [], SURFACES: [] };
    window.Graph = { SCOPES: {}, del: async (p) => { if (/bad/.test(p)) throw new Error("404 gone already"); } };
  `);
  const L6 = fakeLedger();
  const r6 = await w4.GroupMigrate.deleteArchived({ deletable: [{ id: "a1", name: "A (migrated 2026-01-01)" }, { id: "bad", name: "B (migrated 2026-01-01)" }] }, { ledger: L6 });
  const k6 = L6.calls.filter((c) => c[0] !== "start").map((c) => `${c[0]}${c[1]}`).join(" ");
  ok("T22 archived: deleted → done, refused → fail", k6 === "done0 fail1" && r6[0].ok && !r6[1].ok, k6);
  const L7 = fakeLedger(); L7.stopAfter(0);
  const r7 = await w4.GroupMigrate.deleteArchived({ deletable: [{ id: "a1", name: "A" }, { id: "a2", name: "B" }] }, { ledger: L7 });
  ok("T22 archived: Stop between groups, and stopped is not failed", r7[0].ok && r7[1].stopped === true && !r7[1].ok);
}

// =====================================================================
head("The page loads the module before the tools that use it");
{
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const order = [...html.matchAll(/<script src="js\/([a-z.-]+)\?v=\d+"><\/script>/g)].map((m) => m[1]);
  const at = (f) => order.indexOf(f);
  ok("js/runledger.js is loaded", at("runledger.js") >= 0);
  for (const f of ["assignedit.js", "backup.js", "restore.js", "devicecleanup.js", "groupmigrate.js", "platformbaseline.js"]) {
    ok(`runledger.js comes before ${f}`, at("runledger.js") < at(f), `${at("runledger.js")} vs ${at(f)}`);
  }
  const css = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8");
  ok("the stylesheet carries the .rl rules", /\.rl-row\.work/.test(css) && /@keyframes rlspin/.test(css));
}

console.log(`\nrunledger: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

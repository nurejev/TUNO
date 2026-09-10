// ======================================================================
// T22 — the repoint runs every policy past a refusal (10608, ENCA 25318
// ported), an archived group still in policies is called out with the way
// out (25317), and a migration in flight guards the tab (25130).
//
// The engine is exercised against a fake Graph and a fake AssignEdit
// read; the screen parts that need a rendered list are held as source.
// Run with `npm test`, or alone:  node tests/groupmigrate/repoint.test.js
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

// One eval per window (the harness lesson): fakes first, then the sources,
// then the bridge onto window.
function boot() {
  const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", url: "https://nurejev.github.io/tuno-beta/" });
  const w = dom.window;
  const pre = `
    window.GroupUse = { shortErr: (e, n) => String((e && e.message) || e).slice(0, n || 200), scopesFor: () => [], allSourceIds: () => [],
      analyze: async () => ({ rows: [], failed: [] }) };
    window.calls = [];
    window.refuse = new Set();
    window.Graph = {
      BETA: "https://graph.microsoft.com/beta", SCOPES: { groups: [], profiles: [], config: [], directory: [] },
      readAll: async (p) => { window.calls.push(["read", p]); const m = /\\/([^/]+)\\/assignments/.exec(p); return (m && window.tenant[m[1]]) || []; },
      readOne: async () => null,
      post: async (p, body) => {
        window.calls.push(["post", p]);
        if (p === "/groups") return { id: "new-1", displayName: body.displayName };
        const m = /\\/([^/]+)\\/assign$/.exec(p);
        if (m && window.refuse.has(m[1])) throw new Error("403 Forbidden — the policy refused");
        if (m) window.tenant[m[1]] = body.assignments;
        return {};
      },
      patch: async (p) => { window.calls.push(["patch", p]); return {}; },
      del: async () => {},
      ensureScopes: async () => true,
    };
  `;
  const src = ["js/assignedit.js", "js/groupmigrate.js"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  w.eval(pre + "\n;\n" + src + "\n;Object.assign(window, { AssignEdit, GroupMigrate });");
  return w;
}

(async () => {

// =====================================================================
head("25318 — every policy is tried; the refusals are named and the migration carries on");
{
  const w = boot();
  const sf = w.AssignEdit.SURFACES[0];
  const tgt = (gid) => ({ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: gid } });
  const pol = (id, name) => ({ id, name, surface: sf.id, surfaceLabel: sf.label, icon: sf.icon, assignments: [tgt("old-1")] });
  const refs = { readError: "", failed: [], other: [], repointable: ["p1", "p2", "p3"].map((id, i) => ({ surface: sf.id, surfaceLabel: sf.label, id, name: `Policy ${i + 1}`, how: "assigned", policy: pol(id, `Policy ${i + 1}`) })) };
  w.tenant = { p1: [tgt("old-1")], p2: [tgt("old-1")], p3: [tgt("old-1")] };
  w.refuse.add("p2");
  const group = { id: "old-1", name: "Admins", roleAssignable: true, archived: false, description: "" };
  const p = w.GroupMigrate.plan(group, { toUnit: false, refs, members: { users: [], others: [], total: 0 }, roles: { ok: true, active: [], eligible: [] }, holding: { ok: true, units: [] } });
  ok("the plan is ok", p.ok, p.reason);
  const r = await w.GroupMigrate.apply(p, {});
  const posts = w.calls.filter((c) => c[0] === "post" && /\/assign$/.test(c[1])).map((c) => /\/([^/]+)\/assign$/.exec(c[1])[1]);
  ok("all three policies were tried, the refusal in the middle notwithstanding", posts.join(",") === "p1,p2,p3", posts.join(","));
  ok("the two that took the swap now name the new group", w.tenant.p1[0].target.groupId === "new-1" && w.tenant.p3[0].target.groupId === "new-1");
  ok("the refused one still names the archive", w.tenant.p2[0].target.groupId === "old-1");
  ok("the migration went through", r.ok === true && r.newId === "new-1");
  ok("refsMoved counts the two", r.refsMoved === 2 && r.refsTotal === 3);
  ok("the refusal is carried by name and reason", r.refsRefused.length === 1 && r.refsRefused[0].name === "Policy 2" && r.refsRefused[0].id === "p2" && /403/.test(r.refsRefused[0].error));
  ok("the warning says which and what to do next", /Policy 2/.test(r.warning) && /T11/.test(r.warning) && /Archived/.test(r.warning) && /Nothing is uncovered/.test(r.warning));
  ok("it is a warning, not an error — the run is not called failed", !r.error);
  const carry = r.log.find((l) => /carrying on with the unit step/.test(l.text));
  ok("the log says it carried on rather than stopped", !!carry && carry.ok === false);
  ok("nothing in the log says 'Stopped'", !r.log.some((l) => /^Stopped/.test(l.text)));
  const md = w.GroupMigrate.report(p, r, {});
  ok("the report's work list opens with the refused swap", /REFUSED the swap during this run/.test(md) && /\| Policy 2 \| 403/.test(md));
  ok("the report carries the warning as a callout", /> ⚠ 1 assignment could not be repointed/.test(md));

  // and with nothing refused, the old wording holds
  w.calls = []; w.refuse.clear();
  w.tenant = { p1: [tgt("old-1")], p2: [tgt("old-1")], p3: [tgt("old-1")] };
  const r2 = await w.GroupMigrate.apply(p, {});
  ok("a clean run has no warning and an empty refused list", r2.ok && !r2.warning && r2.refsRefused.length === 0 && r2.refsMoved === 3);
}

// =====================================================================
head("25317 / 25130 — the archived pane's callout, the T11 hand-off and the tab guard");
{
  const src = fs.readFileSync(path.join(ROOT, "js/groupmigrate.js"), "utf8");
  const screen = src.slice(src.indexOf("const GroupMigrateTool"));
  ok("referencesMany keeps the surface so a policy can be handed to T11", /e\.repointable\.push\(\{ surfaceLabel: p\.surfaceLabel, name: p\.name, id: p\.id, surface: p\.surface \}\)/.test(src));
  ok("a referenced archive says the repoint did not finish, under its name", /Still in policies — the repoint did not finish\./.test(screen));
  ok("the way out is on the row: T11 for the writable surfaces, by hand for the rest", /Swap the group in ✏️ T11 for/.test(screen) && /move by hand:/.test(screen));
  ok("the T11 link goes through openWith, only for a surface T11 writes", /function t11Link\(x\)/.test(screen) && /AssignEdit\.surfaceById\(x\.surface\)/.test(screen) && /if \(!sf \|\| !sf\.section/.test(screen) && /AssignEditTool\.openWith\(secId, id\)/.test(screen));
  ok("the click closes the modal first — the hand-off is a navigation", /const t11 = e\.target\.closest\("\[data-gmt11\]"\);[\s\S]{0,200}closeModal\(\);[\s\S]{0,80}AssignEditTool\.openWith/.test(screen));
  ok("the result panel lists the refused swaps with the same hand-off", /refused the swap and still name/.test(screen) && /data-gmt11/.test(screen));
  ok("the Overview's 'worth a look first' names archives still in policies", /still in policies<\/b> — a repoint that did not finish/.test(screen));
  ok("the State column says how many still name the archive", /still name the archive<\/span>/.test(screen) && /refsRefused: \(result\.refsRefused \|\| \[\]\)\.length/.test(screen));
  ok("a migration in flight guards the tab, and only then", /window\.addEventListener\("beforeunload", guard\)/.test(screen) && /finally \{ busy = false; window\.removeEventListener\("beforeunload", guard\); \}/.test(screen));
  ok("the guard is the browser's own prompt", /const guard = \(e\) => \{ e\.preventDefault\(\); e\.returnValue = ""; \};/.test(screen));
}

console.log(`\nrepoint: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

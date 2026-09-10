// ======================================================================
// T22 — disableNesting on the replacement (10609, ENCA's nesting work
// ported: cagroups.js NESTING block, assign.js confirmNesting, 25121 /
// 25166 / 25304 / 25307).
//
// What is defended: the state is read on v1.0 by name and never takes the
// list down; the create carries the property only when asked; what is
// reported is what was VERIFIED (read back), not what was requested; a
// tenant without the property keeps its group and says so; the scope is
// new, listed, and asked for only on the ticked path.
// Run with `npm test`, or alone:  node tests/groupmigrate/nesting.test.js
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

function boot() {
  const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", url: "https://nurejev.github.io/tuno-beta/" });
  const w = dom.window;
  const pre = `
    window.GroupUse = { shortErr: (e, n) => String((e && e.message) || e).slice(0, n || 200), scopesFor: () => [], allSourceIds: () => [],
      analyze: async () => ({ rows: [], failed: [] }) };
    window.calls = [];
    window.tenantKnowsNesting = true;   // flip to false for a directory without the property
    window.groupState = {};             // id -> disableNesting as the directory reports it
    window.createTakes = true;          // does the create body's disableNesting stick?
    window.Graph = {
      BETA: "https://graph.microsoft.com/beta", SCOPES: { groups: ["Group.Read.All"], groupMembers: ["GroupMember.Read.All"], profiles: [], config: [], directory: [] },
      readAll: async () => [],
      readOne: async () => null,
      get: async (p, o) => { window.calls.push(["get", p, o]); const m = /groups\\/([^?/]+)\\?\\$select=id,disableNesting/.exec(p); if (!m) return null;
        if (!window.tenantKnowsNesting) throw new Error("Request_BadRequest: Unexpected request made to property 'disableNesting' of resource 'Group'");
        return { id: m[1], disableNesting: window.groupState[m[1]] }; },
      batch: async (reqs, o) => { window.calls.push(["batch", reqs.length, o, reqs.map((r) => r.url).join(" ")]); const out = {};
        for (const r of reqs) { const id = /groups\\/([^?/]+)/.exec(r.url)[1];
          out[r.id] = window.tenantKnowsNesting ? { body: { id, disableNesting: window.groupState[id] } } : { error: "Unexpected request made to property 'disableNesting' of resource 'Group'", code: "Request_BadRequest", status: 400 }; }
        return out; },
      post: async (p, body, o) => { window.calls.push(["post", p, body, o]);
        if (p === "/groups") {
          if ("disableNesting" in body && !window.tenantKnowsNesting) throw new Error("Request_BadRequest: Unexpected request made to property 'disableNesting' of resource 'Group'");
          const id = "new-" + (Object.keys(window.groupState).length + 1);
          window.groupState[id] = ("disableNesting" in body && window.createTakes) ? true : (window.tenantKnowsNesting ? false : undefined);
          return { id, displayName: body.displayName };
        }
        return {}; },
      patch: async (p, body, o) => { window.calls.push(["patch", p, body, o]);
        const m = /groups\\/([^?/]+)$/.exec(p);
        if ("disableNesting" in body && !window.tenantKnowsNesting) throw new Error("Request_BadRequest: Unexpected request made to property 'disableNesting' of resource 'Group'");
        if (m && "disableNesting" in body && window.patchTakes !== false) window.groupState[m[1]] = true;
        return {}; },
      del: async () => {},
      ensureScopes: async () => true,
    };
  `;
  const src = ["js/assignedit.js", "js/groupmigrate.js"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  w.eval(pre + "\n;\n" + src + "\n;Object.assign(window, { AssignEdit, GroupMigrate });");
  return w;
}
const groupOf = (id) => ({ id, name: "Admins", roleAssignable: true, archived: false, description: "" });
const planOpts = (extra) => Object.assign({ toUnit: false, refs: { readError: "", failed: [], other: [], repointable: [] }, members: { users: [], others: [], total: 0 }, roles: { ok: true, active: [], eligible: [] }, holding: { ok: true, units: [] } }, extra || {});

(async () => {

// =====================================================================
head("The state is read by name, on v1.0, in one batch — and never takes the list down");
{
  const w = boot();
  w.groupState = { g1: true, g2: false, g3: undefined };
  const rows = [{ id: "g1" }, { id: "g2" }, { id: "g3" }];
  await w.GroupMigrate.loadNestingStates(rows);
  ok("disabled / allowed / unknown, per row", rows.map((r) => r.nesting).join(",") === "disabled,allowed,unknown", rows.map((r) => r.nesting).join(","));
  const b = w.calls.find((c) => c[0] === "batch");
  ok("one batch for the three, on the groups read scope", b && b[1] === 3 && b[2].scopes[0] === "Group.Read.All" && !b[2].beta);
  ok("the batch asks for the property by name", b[3].split(" ").every((u) => /\/groups\/g\d\?\$select=id,disableNesting$/.test(u)), b[3]);
  ok("nestingState reads the three answers", w.GroupMigrate.nestingState({ disableNesting: true }) === "disabled" && w.GroupMigrate.nestingState({ disableNesting: false }) === "allowed" && w.GroupMigrate.nestingState({}) === "unknown" && w.GroupMigrate.nestingState(null) === "unknown");
  ok("the tenant is still believed to support it", w.GroupMigrate.nestingSupported() === true);

  const w2 = boot();
  w2.tenantKnowsNesting = false;
  const rows2 = [{ id: "g1" }, { id: "g2" }];
  await w2.GroupMigrate.loadNestingStates(rows2);
  ok("a directory without the property leaves every row 'unreported' and throws nothing", rows2.every((r) => r.nesting === "unreported"));
  ok("…and the refusal is remembered for the session", w2.GroupMigrate.nestingSupported() === false);
  ok("the refusal is recognised by its wording, not by any 400", w2.GroupMigrate.nestingUnsupported(new Error("Request_BadRequest: Unexpected request made to property 'disableNesting' of resource 'Group'")) && !w2.GroupMigrate.nestingUnsupported(new Error("Request_BadRequest: displayName is required")));
  ok("the constant is off — not GA", w2.GroupMigrate.NESTING_GA === false);
  ok("NEST_V1 pins the property to v1.0", w2.GroupMigrate.NEST_V1("/groups/x") === "https://graph.microsoft.com/v1.0/groups/x");
}

// =====================================================================
head("Not ticked: the create does not carry the property, nothing is asked, the report says not requested");
{
  const w = boot();
  const p = w.GroupMigrate.plan(groupOf("old-1"), planOpts());
  ok("the plan does not ask for nesting by default", p.ok && p.nesting === false);
  ok("the create step says nothing about nesting", !/nesting/.test(p.steps.find((s) => s.key === "create").text));
  const r = await w.GroupMigrate.apply(p, {});
  const create = w.calls.find((c) => c[0] === "post" && c[1] === "/groups");
  ok("the create body has no disableNesting", create && !("disableNesting" in create[2]));
  ok("the create asked only for Group.ReadWrite.All", JSON.stringify(create[3].scopes) === JSON.stringify(["Group.ReadWrite.All"]));
  const nestPatch = (ww) => ww.calls.filter((c) => c[0] === "patch" && c[2] && "disableNesting" in c[2]);
  ok("nothing was read back or patched for it", !w.calls.some((c) => c[0] === "get") && nestPatch(w).length === 0);
  ok("the result says n/a", r.ok && r.nesting === "n/a");
  ok("the report says not requested", /\| Nesting on the new group \| _not requested_ \|/.test(w.GroupMigrate.report(p, r, {})));
}

// =====================================================================
head("Ticked: the create carries it, the read-back verifies it, the report says what was VERIFIED");
{
  const w = boot();
  const p = w.GroupMigrate.plan(groupOf("old-1"), planOpts({ nesting: true }));
  ok("the plan carries the tick", p.ok && p.nesting === true);
  ok("the create step says so, and says it is verified", /with nesting disabled, verified by reading the property back/.test(p.steps.find((s) => s.key === "create").text));
  const r = await w.GroupMigrate.apply(p, {});
  const create = w.calls.find((c) => c[0] === "post" && c[1] === "/groups");
  ok("the create body carries disableNesting: true", create && create[2].disableNesting === true);
  ok("the create asks for the nesting scope beside the group write", create[3].scopes.includes("Group-NestingSupport.ReadWrite.All") && create[3].scopes.includes("Group.ReadWrite.All"));
  ok("the property is read back on v1.0 by name", w.calls.some((c) => c[0] === "get" && /^https:\/\/graph\.microsoft\.com\/v1\.0\/groups\/new-1\?\$select=id,disableNesting$/.test(c[1])));
  const nestPatch = (ww) => ww.calls.filter((c) => c[0] === "patch" && c[2] && "disableNesting" in c[2]);
  ok("no PATCH when the create took it", nestPatch(w).length === 0);
  ok("the result is disabled — the read-back's word", r.ok && r.nesting === "disabled" && r.nestingError === "");
  ok("the log line says nesting disabled", r.log.some((l) => /Created “Admins” as a plain security group \(nesting disabled\)/.test(l.text)));
  ok("the report says disabled, verified", /\*\*disabled\*\* — verified by read-back/.test(w.GroupMigrate.report(p, r, {})));
  ok("nestingWord reads it out", w.GroupMigrate.nestingWord(r) === "nesting disabled");

  // the create did NOT take it: PATCH once, read again
  const w2 = boot();
  w2.createTakes = false;
  const p2 = w2.GroupMigrate.plan(groupOf("old-1"), planOpts({ nesting: true }));
  const r2 = await w2.GroupMigrate.apply(p2, {});
  const patch = nestPatch(w2)[0];
  ok("when the create did not take it, ONE PATCH on v1.0 with the nesting scope", patch && /v1\.0\/groups\/new-1$/.test(patch[1]) && patch[2].disableNesting === true && patch[3].scopes.includes("Group-NestingSupport.ReadWrite.All") && nestPatch(w2).length === 1);
  ok("and the second read-back confirms it", r2.ok && r2.nesting === "disabled");

  // neither took it: failed, reason kept, group kept
  const w3 = boot();
  w3.createTakes = false; w3.patchTakes = false;
  const p3 = w3.GroupMigrate.plan(groupOf("old-1"), planOpts({ nesting: true }));
  const r3 = await w3.GroupMigrate.apply(p3, {});
  ok("when nothing took it, the result is failed with the reason — and the group exists", r3.ok && r3.newId === "new-1" && r3.nesting === "failed" && /does not report disableNesting as set/.test(r3.nestingError));
  ok("the log says STILL ALLOWED, as a red line", r3.log.some((l) => l.ok === false && /STILL ALLOWED/.test(l.text)));
  ok("the report says STILL ALLOWED", /\*\*STILL ALLOWED\*\*/.test(w3.GroupMigrate.report(p3, r3, {})));
}

// =====================================================================
head("A tenant without the property keeps its group and says so");
{
  const w = boot();
  w.tenantKnowsNesting = false;
  const p = w.GroupMigrate.plan(groupOf("old-1"), planOpts({ nesting: true }));
  const r = await w.GroupMigrate.apply(p, {});
  const creates = w.calls.filter((c) => c[0] === "post" && c[1] === "/groups");
  ok("the create is retried WITHOUT the property, once", creates.length === 2 && "disableNesting" in creates[0][2] && !("disableNesting" in creates[1][2]));
  ok("the group is created", r.ok && r.newId === "new-1");
  ok("the result says unsupported, with the text", r.nesting === "unsupported" && /not generally available/.test(r.nestingError));
  ok("no PATCH and no read-back were spent proving it again", !w.calls.some((c) => c[0] === "patch" && c[2] && "disableNesting" in c[2]) && !w.calls.some((c) => c[0] === "get"));
  ok("the session remembers", w.GroupMigrate.nestingSupported() === false);
  ok("the log says not available in this tenant", r.log.some((l) => /not available in this tenant/.test(l.text)));
  const w4 = boot();
  w4.Graph.post = async (p, body) => { w4.calls.push(["post", p, body]); if (p === "/groups") throw new Error("Request_BadRequest: mailNickname is invalid"); return {}; };
  const p4 = w4.GroupMigrate.plan(groupOf("old-1"), planOpts({ nesting: true }));
  const r4 = await w4.GroupMigrate.apply(p4, {});
  ok("a create that fails for another reason is NOT retried, and the rename is rolled back", !r4.ok && w4.calls.filter((c) => c[0] === "post" && c[1] === "/groups").length === 1 && /rolled back/.test(r4.log[r4.log.length - 1].text));
}

// =====================================================================
head("The scope is new, listed, and asked for only on the ticked path");
{
  const w = boot();
  ok("SCOPES.nestWrite names the new scope with the group write beside it", JSON.stringify(w.GroupMigrate.SCOPES.nestWrite) === JSON.stringify(["Group-NestingSupport.ReadWrite.All", "Group.ReadWrite.All"]));
  ok("ALL_SCOPES (the 🔐 Grant button) includes it", w.GroupMigrate.ALL_SCOPES.includes("Group-NestingSupport.ReadWrite.All"));
  ok("READ_SCOPES does not", !w.GroupMigrate.READ_SCOPES().includes("Group-NestingSupport.ReadWrite.All"));
  const ps1 = fs.readFileSync(path.join(ROOT, "New-TunoAppRegistration.ps1"), "utf8");
  ok("the registration script declares it, in the open", /"Group-NestingSupport\.ReadWrite\.All"/.test(ps1) && /OPT-IN/.test(ps1));
  const src = fs.readFileSync(path.join(ROOT, "js/groupmigrate.js"), "utf8");
  const screen = src.slice(src.indexOf("const GroupMigrateTool"));
  ok("the screen asks for it at Migrate only when ticked", /if \(p\.nesting\) want\.push\(\.\.\.GroupMigrate\.SCOPES\.nestWrite\);/.test(screen));
  ok("the tick defaults to NESTING_GA and resets with the tool", /let nestIn = GroupMigrate\.NESTING_GA;/.test(screen) && /nestIn = GroupMigrate\.NESTING_GA; unitsError = "";/.test(screen));
  ok("the tick is disabled once the tenant said it lacks the property", /id="gmNest" \$\{nestIn \? "checked" : ""\} \$\{GroupMigrate\.nestingSupported\(\) \? "" : "disabled"\}/.test(screen));
  ok("the form says off by default and why", /<b>Off by default:<\/b> <code>disableNesting<\/code> is not generally available/.test(screen));
  ok("the list reads the state after it lands, and redraws", /GroupMigrate\.loadNestingStates\(list\.groups\)\.then/.test(screen));
  ok("the row wears the state and the chips filter on it", /nestMark\(g\)/.test(screen) && /nest: \{ label: \(\) => "🚫 nesting disabled"/.test(screen) && /nestallow: \{ label: \(\) => "↪ nesting allowed"/.test(screen));
  ok("the permission plan explains the scope", /set disableNesting on the replacement when 🚫 Disable nesting is ticked/.test(src));
}

console.log(`\nnesting: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

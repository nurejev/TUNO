// ======================================================================
// Two small ENCA deltas (10611): the policy id survives opening the card
// (25120) and a crumb that matches no tab says so on a non-production
// host (25172).
// Run with `npm test`, or alone:  node tests/shell/smalldeltas.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("smalldeltas");

run(async () => {

// =====================================================================
head("25120 — the id is in the popout head, and one click selects it");
{
  const w = boot();
  const D = w.document;
  const html = w.Docs.popoutHtml({ label: "Settings catalog", endpoint: "/deviceManagement/configurationPolicies" },
    { id: "0f1e2d3c-aaaa-bbbb-cccc-000000000001", name: "Win - SEC - Thing", assignments: [], rows: [], detailError: "" });
  ok("the head carries the id beside the source", /Source: <code>\/deviceManagement\/configurationPolicies<\/code> · ID: <code data-selall/.test(html));
  ok("the id is escaped like every other string", /0f1e2d3c-aaaa-bbbb-cccc-000000000001<\/code>/.test(html));
  const none = w.Docs.popoutHtml({ label: "x", endpoint: "/e" }, { id: "", name: "n", assignments: [], rows: [] });
  ok("no id, no ID label", !/ID: <code/.test(none));
  const host = D.createElement("div"); host.innerHTML = html; D.body.appendChild(host);
  const code = host.querySelector("[data-selall]");
  code.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const sel = w.getSelection();
  ok("a click selects the whole GUID", sel && String(sel).trim() === "0f1e2d3c-aaaa-bbbb-cccc-000000000001", String(sel));
  ok("the compact card in T19 still prints it too", /scard-foot">ID: \$\{esc\(it\.id\)\}/.test(fs.readFileSync(path.join(ROOT, "js/overview.js"), "utf8")));
}

// =====================================================================
head("25172 — a crumb that resolves to no tab is said, off production only");
{
  const src = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  ok("the quiet fallback now warns on a non-production host", /if \(name && !isProduction\(\)\) console\.warn\(`crumb\("\$\{name\}"\) matches no tool tab/.test(src));
  ok("an empty crumb (home) is not a warning", /if \(name && !isProduction\(\)\)/.test(src));
  // every crumb the tiles pass resolves — the check the warning exists for
  const w = boot();
  const warned = [];
  w.console.warn = (m) => warned.push(String(m));
  const D = w.document;
  D.getElementById("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  for (const tile of D.querySelectorAll(".tool[id^='tool']")) {
    if (tile.id === "toolRoadmap") continue;
    tile.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  }
  const bad = warned.filter((m) => /matches no tool tab/.test(m));
  ok("no tile's crumb misses its tab", bad.length === 0, bad.join(" | "));
}

});

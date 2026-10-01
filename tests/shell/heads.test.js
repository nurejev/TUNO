// ======================================================================
// Parity slice 2 (build 10663): one tool, one title, one place — ENCA's
// toolHead() (25352), ported.
//
//   1. Every tool head is an empty <h2 data-tool-head="toolX"> in the
//      markup, and its title and chips live in the tool's registry entry
//      (js/version.js) beside its number and version.
//   2. At startup each head is filled by toolHeadInner(): title, chips, and
//      the T-number + version stamp as part of the line — no map of screens
//      to tools, no MutationObserver re-stamping anything.
//   3. Chips are channel language: a production build (APP_BUILD.isBeta
//      false) leaves BETA / NEW / UPDATED out of every head by itself;
//      "writes to the tenant" and "temporary" stay.
//   4. The tool's name is one string across its head, its tab and its
//      crumb, so the four copies of the tool list cannot drift apart here.
//
// Run with `npm test`, or alone:  node tests/shell/heads.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("heads");

run(async () => {

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");

// =====================================================================
head("The markup — 28 empty heads, each naming its tool");
{
  const w = boot();
  const D = w.document;
  const T = w.TOOL_VERSIONS;
  const screens = [...D.querySelectorAll("section.screen.tool")];
  ok("28 tool screens", screens.length === 28, String(screens.length));
  const heads = [...D.querySelectorAll("[data-tool-head]")];
  ok("28 heads, one per tool screen", heads.length === 28 && screens.every((s) => s.querySelectorAll("[data-tool-head]").length === 1),
    screens.filter((s) => s.querySelectorAll("[data-tool-head]").length !== 1).map((s) => s.id).join(", "));
  ok("every head names a tool with a title and chips in the registry",
    heads.every((h) => T[h.dataset.toolHead] && T[h.dataset.toolHead].head && Array.isArray(T[h.dataset.toolHead].chips)),
    heads.filter((h) => !(T[h.dataset.toolHead] && T[h.dataset.toolHead].head)).map((h) => h.dataset.toolHead).join(", "));
  ok("no two heads name the same tool", new Set(heads.map((h) => h.dataset.toolHead)).size === heads.length);
  ok("the heads are h2, as TUNO's always were", heads.every((h) => h.tagName === "H2"));
  ok("no head carries an inline style", heads.every((h) => !h.hasAttribute("style")));
  // Raw markup, before any script: nothing typed into a head any more.
  const raw = [...html.matchAll(/<h2 data-tool-head="(tool[A-Za-z]+)">([\s\S]*?)<\/h2>/g)];
  ok("in index.html every head is empty — the registry writes it", raw.length === 28 && raw.every((m) => m[2] === ""),
    raw.filter((m) => m[2] !== "").map((m) => m[1]).join(", "));
  ok("27 heads open a .readme head card; 🚀 MDE rollout's sits in its workspace header",
    heads.filter((h) => h.parentElement.matches(".screen.tool > .readme")).length === 27
    && D.querySelector("#t28Workspace2 .mr-header [data-tool-head='toolMdeRollout']") !== null);
}

// =====================================================================
head("Filled at startup by toolHeadInner — the stamp is part of the line");
{
  const w = boot();
  const D = w.document;
  const T = w.TOOL_VERSIONS;
  const heads = [...D.querySelectorAll("[data-tool-head]")];
  // Compared as parsed markup: an & or a <tenant> in a title or a note is
  // escaped in the string and serialized back its own way by the DOM.
  const parsed = (s) => { const t = D.createElement("template"); t.innerHTML = s; return t.innerHTML; };
  const wrong = heads.filter((h) => h.innerHTML !== parsed(w.eval(`toolHeadInner(${JSON.stringify(h.dataset.toolHead)})`)));
  ok("every head reads exactly what toolHeadInner writes", wrong.length === 0, wrong.map((h) => h.dataset.toolHead).join(", "));
  ok("every head starts with its registry title", heads.every((h) => h.textContent.startsWith(T[h.dataset.toolHead].head)));
  const stamps = heads.map((h) => h.querySelectorAll(".tool-ver-head"));
  ok("one version stamp per head", stamps.every((s) => s.length === 1));
  ok("the stamp reads T-number · version", heads.every((h) => {
    const t = T[h.dataset.toolHead];
    return h.querySelector(".tool-ver-head").textContent === `T${String(t.t).padStart(2, "0")} · v${t.v}`;
  }));
  ok("🚀 MDE rollout has its stamp now (it never got one before 10663)",
    /^T28 · v/.test((D.querySelector("[data-tool-head='toolMdeRollout'] .tool-ver-head") || {}).textContent || ""));
  ok("the stamp's tooltip explains the permanent number", heads.every((h) => /this tool's permanent number/.test(h.querySelector(".tool-ver-head").title)));
  // The machinery this retires.
  ok("no screen-to-tool map in app.js", !/SCREEN_TOOL/.test(app));
  ok("no observer re-stamping heads", !/stampHeadVersion/.test(app));
  ok("app.js fills the heads from the registry", /querySelectorAll\("\[data-tool-head\]"\)/.test(app) && /toolHeadInner\(el\.dataset\.toolHead\)/.test(app));
}

// =====================================================================
head("Chips — one class per chip, and channel language");
{
  const w = boot();
  const D = w.document;
  const chip = (id, txt) => [...D.querySelectorAll(`[data-tool-head='${id}'] .tag`)].find((s) => s.textContent === txt);
  ok("BETA is a .tag.new", (chip("toolDefender", "BETA") || {}).className === "tag new");
  ok("writes to the tenant is a .tag.block", (chip("toolAssignEdit", "writes to the tenant") || {}).className === "tag block");
  ok("temporary is a plain .tag", (chip("toolMdeRollout", "temporary") || {}).className === "tag");
  const writers = ["toolDeviceCleanup", "toolGroupMigrate", "toolRestrictedAu", "toolMacBaseline", "toolWinBaseline", "toolFilters", "toolAssignEdit"];
  ok("the seven tools that write say so in their head", writers.every((id) => chip(id, "writes to the tenant")));
  ok("every head on this beta build says BETA", [...D.querySelectorAll("[data-tool-head]")].every((h) => chip(h.dataset.toolHead, "BETA")));

  // A production build: the same registry, no status chips in any head.
  const was = w.APP_BUILD.build;
  w.APP_BUILD.build = 13;
  const prod = (id) => w.eval(`toolHeadInner(${JSON.stringify(id)})`);
  ok("the build reads as production", w.APP_BUILD.isBeta === false);
  ok("production leaves BETA out of every head", Object.keys(w.TOOL_VERSIONS).filter((id) => w.TOOL_VERSIONS[id].head).every((id) => !/>BETA</.test(prod(id))));
  ok("and keeps writes to the tenant", />writes to the tenant</.test(prod("toolAssignEdit")));
  ok("and temporary", />temporary</.test(prod("toolMdeRollout")));
  w.TOOL_VERSIONS.toolLaps.chips = ["NEW"];
  ok("NEW and UPDATED are channel language too", !/>NEW</.test(prod("toolLaps")));
  w.APP_BUILD.build = was;
  ok("on beta the same chip shows", />NEW</.test(prod("toolLaps")));

  // An object chip carries its own class and tooltip, escaped.
  const obj = w.eval(`headChip({ txt: "until 1 Dec", cls: "warn", title: 'a "quoted" <b>tip</b>' })`);
  ok("an object chip takes its own class", /^<span class="tag warn"/.test(obj));
  ok("and its tooltip is escaped", /title="a &quot;quoted&quot; &lt;b&gt;tip&lt;\/b&gt;"/.test(obj));
  ok("toolHead() wraps the line in TUNO's h2", w.eval(`toolHead("toolDefender")`).startsWith('<h2 data-tool-head="toolDefender">🦠 Defender status'));
}

// =====================================================================
head("One name per tool — head, tab and crumb agree");
{
  const w = boot();
  const T = w.TOOL_VERSIONS;
  const crumbs = [...app.matchAll(/\$\("(tool[A-Za-z]+)"\)\.addEventListener\("click", \(\) => \{ crumb\("([^"]+)"\); show\("screen-/g)];
  const tools = crumbs.filter((m) => T[m[1]] && T[m[1]].head);
  ok("28 tiles open their screen with a crumb", tools.length === 28, String(tools.length));
  const off = tools.filter((m) => T[m[1]].head !== m[2]);
  ok("every crumb is the tool's head title", off.length === 0, off.map((m) => `${m[1]}: ${m[2]} ≠ ${T[m[1]].head}`).join(" | "));
  const tabsSrc = (app.match(/TOOL_TABS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || "";
  const tabs = [...tabsSrc.matchAll(/\["(tool[A-Za-z]+)", "([^"]+)"\]/g)].filter((m) => T[m[1]] && T[m[1]].head);
  ok("28 tools in the tab list", tabs.length === 28, String(tabs.length));
  const offTabs = tabs.filter((m) => T[m[1]].head !== m[2]);
  ok("every tab label is the tool's head title", offTabs.length === 0, offTabs.map((m) => `${m[1]}: ${m[2]} ≠ ${T[m[1]].head}`).join(" | "));
}

});

// ======================================================================
// Parity slice 12 (build 10673): two workspaces on one shell — ENCA 32407
// and 32430 on TUNO, round 1's D5 A (02's header a second green with a
// lemon rule).
//
//   1. A side is drawn only with a tool of its own. A page without one —
//      production, where no project tool goes — has one workspace: no chip,
//      no rail switch, no ⌘⇧2, no palette entry, and ?ws=projects lands on
//      01.
//   2. With a tile marked data-ws="projects": the chip and its menu, a row
//      per side; a switch changes the header colour, the context line, the
//      rail, Home (02's lead, its library open) and the address, and is
//      remembered.
//   3. Tabs survive a switch: the other side's tabs are hidden, not closed,
//      and come back with it; a switch away from the screen's tool goes
//      Home; Help belongs to both sides.
//   4. The screen decides the side: a tool of the other side opened by the
//      app — the sidebar's button as the palette uses it, a recent tool —
//      takes the side with it, quietly.
//   5. The palette's entry, sign-out, the stylesheet, the roadmap.
//
// Parity slice 13 (build 10674): 02 Projects in use.
//
//   6. 🚀 MDE rollout is 02's tool in the markup, and stays on beta; its
//      registry entry names its customer and end date, and its head and
//      card say both — "end date not set" until the date is named, "ended"
//      once it has passed.
//   7. Its carry-overs: the Assignment editor, Group Analyzer, Defender
//      status, Firewall & ASR coverage — on 02's rail and in its library,
//      "also in 01"; T28's jump into the Assignment editor stays in 02, and
//      a carry-over opened on 01 stays on 01. On a phone 02's bar is Home,
//      Rollout, Assign, Groups and All tools.
//
// The one-sided block strips every mark to stand in for production; the
// two-sided blocks keep the markup's (mark: true sets T28's again).
//
// Run with `npm test`, or alone:  node tests/shell/workspaces.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("workspaces");

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
const BETA = "https://nurejev.github.io/tuno-beta/";
// The shell after app.js, as index.html loads it, then the demo sign-in.
// mark: true puts T28 in 02; false takes every mark off (production).
const start = async (opts) => {
  const o = opts || {};
  const w = boot({ url: o.url || BETA, storage: o.storage });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const D = w.document;
  if (o.mark) D.getElementById("toolMdeRollout").setAttribute("data-ws", "projects");
  if (o.mark === false) D.querySelectorAll("#screen-home .tool[data-ws]").forEach((t) => t.removeAttribute("data-ws"));
  w.eval(read("js/flat-icons.js") + "\n;window.FlatIcons = FlatIcons;");
  w.eval(read("js/workspaces.js"));
  D.getElementById("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await tick(30);
  return w;
};
const key = (w, n) => w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: n === 1 ? "!" : "@", code: `Digit${n}`, ctrlKey: true, shiftKey: true, bubbles: true }));
const tabOf = (w, id) => { const b = w.document.querySelector(`#toolNav .toolnav-tab [data-nav="${id}"]`); return b ? b.closest(".toolnav-tab") : null; };
const shown = (w) => [...w.document.querySelectorAll("#toolNav .toolnav-tab")].filter((t) => !t.hidden).map((t) => t.querySelector("[data-nav]").dataset.nav);
const screen = (w) => (w.document.querySelector(".screen.active") || {}).id;
const rail = (w) => [...w.document.querySelectorAll("#wcRail button")].map((x) => (x.dataset.wcTool || (x.hasAttribute("data-wc-home") ? "home" : x.hasAttribute("data-wc-library") ? "library" : x.dataset.wcSwitch ? "switch:" + x.dataset.wcSwitch : "?")));

run(async () => {

// =====================================================================
head("One side: a page without a project tool has one workspace (production)");
{
  ok("in the markup, 02 holds one tile: 🚀 MDE rollout (slice 13)", [...read("index.html").matchAll(/<div class="tool[^"]*" id="(tool\w+)"[^>]*data-ws="projects"/g)].map((m) => m[1]).join() === "toolMdeRollout");
  const w = await start({ mark: false });
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("on 01", D.body.dataset.ws === "intune" && w.Workspaces.current() === "intune");
  ok("no chip and no menu", !$("wcWsChip") && !$("wcWsMenu"));
  ok("the rail's caption names the side; no switch", !D.querySelector(".wc-rail-switch") && /WORKSPACE\s*01 · Intune/.test(D.querySelector(".wc-rail-caption").textContent));
  ok("the palette offers no switch", w.Workspaces.paletteItems("", null).length === 0 && w.Workspaces.paletteItems("switch", null).length === 0);
  key(w, 2); await tick(10);
  ok("Ctrl/⌘ + Shift + 2 does nothing", D.body.dataset.ws === "intune");
  w.Workspaces.switch("projects"); await tick(10);
  ok("nor does asking for 02 by name", D.body.dataset.ws === "intune" && $("wcHeaderContext").textContent === "Intune / Workspace 01");
  ok("the address is left alone", w.location.search === "");
  const w2 = await start({ mark: false, url: BETA + "?ws=projects", storage: { "tuno.workspace": "projects" } });
  ok("?ws=projects and a remembered 02 land on 01", w2.document.body.dataset.ws === "intune" && w2.document.getElementById("wcHomeTitle").textContent === "Intune overview");
  ok("Home keeps 01's line and no 02 lead", w2.document.getElementById("wcWsLead").textContent === "");
}

// =====================================================================
head("Two sides: a tile of its own makes 02, and the chip switches");
{
  const w = await start({ mark: true });
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("starts on 01", D.body.dataset.ws === "intune" && $("wcWsNum").textContent === "01" && $("wcWsName").textContent === "Intune");
  ok("the chip sits between the wordmark and the context line", $("logoHome").nextElementSibling === $("wcWsChip").parentElement && $("wcWsChip").parentElement.nextElementSibling === $("wcHeaderContext"));
  ok("it is a menu button, closed", $("wcWsChip").getAttribute("aria-haspopup") === "menu" && $("wcWsChip").getAttribute("aria-expanded") === "false" && $("wcWsMenu").hidden === true);
  const rows = [...D.querySelectorAll("#wcWsMenu .wc-ws-row")];
  ok("a row per side, with its swatch and its keys", rows.map((r) => r.id + ":" + r.querySelector(".wc-ws-sw").textContent + ":" + r.querySelector("kbd").textContent).join() === "wcWsRow-intune:01:⌘⇧1,wcWsRow-projects:02:⌘⇧2", rows.map((r) => r.id).join());
  $("wcWsChip").click();
  ok("the chip opens the menu", $("wcWsMenu").hidden === false && $("wcWsChip").getAttribute("aria-expanded") === "true");
  const n01 = w.Workspaces && D.querySelectorAll("#screen-home .tools > .tool[id]").length - 1;
  ok("01's row is current and says what it holds", rows[0].classList.contains("cur") && rows[0].getAttribute("aria-current") === "true" && rows[0].querySelector(".wc-ws-open").textContent === `${n01} tools`, rows[0].querySelector(".wc-ws-open").textContent);
  ok("02's row: its project tools and carry-overs, beta only (round 1's switcher)", rows[1].querySelector(".wc-ws-open").textContent === "1 project tool, 4 carried over · beta only" && !rows[1].classList.contains("cur"), rows[1].querySelector(".wc-ws-open").textContent);
  ok("and the foot says what a switch keeps", /keeps the open tools of the other side/.test(D.querySelector("#wcWsMenu .wc-ws-foot").textContent));
  D.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok("Escape closes it", $("wcWsMenu").hidden === true && $("wcWsChip").getAttribute("aria-expanded") === "false");
  $("wcWsChip").click(); D.body.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok("so does a click elsewhere", $("wcWsMenu").hidden === true);
  $("wcWsChip").click(); rows[1].click(); await tick(10);
  ok("02's row switches, and the menu closes", D.body.dataset.ws === "projects" && $("wcWsMenu").hidden === true);
  ok("the chip and the context line say 02", $("wcWsNum").textContent === "02" && $("wcWsName").textContent === "Projects" && $("wcHeaderContext").textContent === "Projects / Workspace 02");
  ok("Home is 02's: the tenant over its title, its own lead", $("wcTenant").textContent === "Contoso B.V. · Workspace 02" && $("wcHomeTitle").textContent === "Projects" && /^Temporary tools for customer projects\. Each names its customer and the date it ends/.test($("wcWsLead").textContent));
  ok("its library starts open — no overview above it, as ENCA's 02", $("wcOverviewTools").hidden === false && $("wcToggleLibrary").textContent === "Hide");
  const groups = [...D.querySelectorAll("#wcOverviewTools .wc-tool-group")].map((g) => g.querySelector("summary").firstChild.textContent.trim() + ":" + [...g.querySelectorAll(".wc-tool")].map((c) => c.dataset.wcTool).join("+"));
  ok("its own tool first, then its carry-overs, then the app's own pages", groups.join(" | ") === "🚀 Project tools:toolMdeRollout | 🔗 Carried over from 01:toolAssignEdit+toolGroupUse+toolDefender+toolEndpointSec | ❓ About this app:toolChangelog+toolRoadmap+toolHelp" && $("wcLibraryCount").textContent === "All 8 tools", groups.join(" | "));
  await tick(30);   // the line icons draw on the next frame (js/flat-icons.js)
  ok("the project tools' group draws the rocket", (() => { const sm = D.querySelector('#wcOverviewTools .wc-tool-group summary[data-icon="rocket"]'); return sm && sm.querySelector("svg.enca-icon"); })());
  ok("the rail: Home, its own tool, its carry-overs, All tools, Help, and the switch to 01", rail(w).join() === "home,toolMdeRollout,toolAssignEdit,toolGroupUse,toolDefender,toolEndpointSec,library,toolHelp,switch:intune", rail(w).join());
  ok("in round 1's words: Rollout, Assign, Groups, Defender, ASR", [...D.querySelectorAll("#wcRail button[data-wc-tool] small")].map((x) => x.textContent).join() === "Rollout,Assign,Groups,Defender,ASR,Help");
  ok("the caption's switch says where you are", /^02 ⇄$/.test(D.querySelector(".wc-rail-switch").textContent.trim()) && D.querySelector(".wc-rail-switch").title === "Switch to 01 · Intune");
  ok("an empty Recent tools offers 02's first tool", /Open MDE rollout →/.test($("wcRecent").textContent) && $("wcRecent").querySelector('[data-wc-tool="toolMdeRollout"]'));
  ok("the address says 02", w.location.search === "?ws=projects");
  ok("and this browser remembers it", w.localStorage.getItem("tuno.workspace") === "projects");
  $("wcHeaderTools").click(); await tick(10);
  ok("All tools lists 02's tools", D.querySelectorAll("#wcTools .wc-tool").length === 8 && /8 tools · Workspace 02/.test($("wcResultCount").textContent));
  const s2 = $("wcSearch"); s2.value = "pvm"; s2.dispatchEvent(new w.Event("input"));
  ok("and finds a project tool by its customer", [...D.querySelectorAll("#wcTools .wc-tool")].map((c) => c.dataset.wcTool).join() === "toolMdeRollout");
  $("wcCloseLauncher").click();
  D.querySelector(".wc-rail-switch").click(); await tick(10);
  ok("the rail's switch goes back to 01", D.body.dataset.ws === "intune" && $("wcHomeTitle").textContent === "Intune overview" && w.location.search === "");
  ok("01's rail is its seven tools again, with the switch to 02", rail(w).join() === "home,toolOverview,toolGroupUse,toolDevice,toolPosture,toolAssignEdit,toolWinBaseline,toolAppLocker,library,toolHelp,switch:projects", rail(w).join());
  ok("and 01's library no longer lists the project tool", !D.querySelector('#wcOverviewTools [data-wc-tool="toolMdeRollout"]') && $("wcLibraryCount").textContent === `All ${n01} tools`);
  key(w, 2); await tick(10);
  ok("Ctrl/⌘ + Shift + 2 switches to 02", D.body.dataset.ws === "projects");
  key(w, 1); await tick(10);
  ok("and + 1 back to 01", D.body.dataset.ws === "intune");
}

// =====================================================================
head("The address and this browser say which side to open");
{
  const w = await start({ mark: true, url: BETA + "?ws=projects" });
  ok("?ws=projects opens on 02", w.document.body.dataset.ws === "projects" && w.document.getElementById("wcHomeTitle").textContent === "Projects");
  const w2 = await start({ mark: true, storage: { "tuno.workspace": "projects" } });
  ok("so does the side last used in this browser", w2.document.body.dataset.ws === "projects");
  const w3 = await start({ mark: true, url: BETA + "?ws=intune", storage: { "tuno.workspace": "projects" } });
  ok("and the address wins over the browser", w3.document.body.dataset.ws === "intune");
  const w4 = await start({ mark: true, url: BETA + "?brand=x&ws=projects" });
  w4.Workspaces.switch("intune"); await tick(10);
  ok("a switch keeps the other parameters", w4.location.search === "?brand=x");
  w4.Workspaces.switch("projects"); await tick(10);
  ok("and adds ?ws=projects beside them", w4.location.search === "?brand=x&ws=projects");
  const w5 = await start({ mark: true, storage: { "tuno.wcLibraryOpen:projects": "0", "tuno.workspace": "projects" } });
  ok("02's library remembers its own Hide", w5.document.getElementById("wcOverviewTools").hidden === true);
}

// =====================================================================
head("Tabs survive a switch");
{
  const w = await start({ mark: true });
  const D = w.document, $ = (id) => D.getElementById(id);
  $("side-toolOverview").click(); await tick(20);
  $("side-toolLaps").click(); await tick(20);
  ok("two 01 tools open, Windows LAPS audit on screen", shown(w).join() === "toolOverview,toolLaps" && screen(w) === "screen-laps");
  key(w, 2); await tick(30);
  ok("switching to 02 goes to 02's Home — LAPS is not a 02 tool", D.body.dataset.ws === "projects" && screen(w) === "screen-home");
  ok("01's tabs are hidden, not closed", tabOf(w, "toolOverview") && tabOf(w, "toolOverview").hidden && tabOf(w, "toolLaps").hidden && shown(w).length === 0);
  D.querySelector('#wcRail [data-wc-tool="toolMdeRollout"]').click(); await tick(30);
  ok("02's tool opens from its rail, its tab the only one shown", screen(w) === "screen-mderollout" && shown(w).join() === "toolMdeRollout");
  $("wcWsChip").click();
  const open = (id) => $("wcWsRow-" + id).querySelector(".wc-ws-open").textContent;
  ok("the menu counts each side's open tools", / · 2 open$/.test(open("intune")) && open("projects") === "1 project tool, 4 carried over · beta only · 1 open", open("intune") + " | " + open("projects"));
  $("wcWsChip").click();
  $("toolHelp").click(); await tick(30);
  ok("Help belongs to both sides: opened on 02, it stays 02", D.body.dataset.ws === "projects" && shown(w).join() === "toolMdeRollout,toolHelp");
  key(w, 1); await tick(30);
  ok("back on 01, Help stays on screen — it is 01's too", D.body.dataset.ws === "intune" && screen(w) === "screen-help");
  ok("01's tabs are back, 02's hidden, Help in both", shown(w).join() === "toolOverview,toolLaps,toolHelp" && tabOf(w, "toolMdeRollout").hidden);
  tabOf(w, "toolOverview").querySelector("[data-nav]").click(); await tick(30);
  ok("a tab kept through the switch opens its tool", screen(w) === "screen-overview" && D.body.dataset.ws === "intune");
  $("wcCloseAll").click(); await tick(30);
  ok("Close all tools closes both sides' tabs", !D.querySelector("#toolNav [data-close]"));
}

// =====================================================================
head("The screen decides the side");
{
  const w = await start({ mark: true });
  const D = w.document, $ = (id) => D.getElementById(id);
  $("side-toolMdeRollout").click(); await tick(30);
  ok("a 02 tool opened on 01 the way the palette opens it takes the shell to 02, on its screen", D.body.dataset.ws === "projects" && screen(w) === "screen-mderollout" && shown(w).join() === "toolMdeRollout");
  ok("the rail marks it", D.querySelector('#wcRail [data-wc-tool="toolMdeRollout"]').classList.contains("active"));
  ok("the address follows", w.location.search === "?ws=projects");
  $("side-toolDevice").click(); await tick(30);
  ok("and a 01 tool opened on 02 takes it back, on its screen", D.body.dataset.ws === "intune" && screen(w) === "screen-device" && !tabOf(w, "toolDevice").hidden && tabOf(w, "toolMdeRollout").hidden);
  $("wcHomeButton").click(); await tick(30);
  key(w, 2); await tick(30);
  ok("Recent tools are this session's, on both sides", [...D.querySelectorAll("#wcRecent .wc-recent")].map((b) => b.dataset.wcTool).join() === "toolDevice,toolMdeRollout");
  D.querySelector('#wcRecent [data-wc-tool="toolDevice"]').click(); await tick(30);
  ok("a recent 01 tool opened from 02's Home switches to 01 first", D.body.dataset.ws === "intune" && screen(w) === "screen-device");
}

// =====================================================================
head("The palette, and signing out");
{
  const w = await start({ mark: true });
  const D = w.document, $ = (id) => D.getElementById(id);
  const items = w.Workspaces.paletteItems("", null);
  ok("on 01 the palette offers the switch to 02", items.length === 1 && items[0].label === "⇄ Switch to 02 · Projects" && items[0].hint === "Workspace 02 — temporary tools for customer projects", items.map((i) => i.label + " / " + i.hint).join());
  items[0].go(); await tick(10);
  ok("which switches", D.body.dataset.ws === "projects");
  const back = w.Workspaces.paletteItems("", null);
  ok("and on 02 it offers 01", back.length === 1 && back[0].label === "⇄ Switch to 01 · Intune" && back[0].hint === "Workspace 01 — the Intune tools");
  ok("Workspaces.list names both", w.Workspaces.list().map((x) => x.num + " " + x.name).join() === "01 Intune,02 Projects");
  $("wcWsChip").click();
  $("acctBtn").click(); $("signOutBtn").click(); await tick(30);
  ok("signing out closes the menu", $("wcWsMenu").hidden === true && $("screen-login").classList.contains("active"));
  key(w, 1); await tick(10);
  ok("and the keys do nothing signed out", D.body.dataset.ws === "projects");
}

// =====================================================================
head("The stylesheet: 02's colour, the menu, hidden tabs, 02's lead");
{
  const css = read("css/workspaces.css");
  ok("02's header is a second green with a lemon rule under it (round 1, D5 A; ENCA 32430)", /body\.workspaces-shell\[data-ws="projects"\]\{--wc-brand:#1e4729\}/.test(css) && /body\.workspaces-shell\[data-ws="projects"\] header\{box-shadow:inset 0 -3px 0 var\(--lemon\)\}/.test(css));
  ok("the menu is ENCA's, the swatches the sides' colours", /\.wc-ws-menu\{position:absolute;top:calc\(100% \+ 8px\);left:0;width:340px/.test(css) && /\.wc-ws-sw-intune\{background:var\(--green-deep\)\}/.test(css) && /\.wc-ws-sw-projects\{background:#1e4729;box-shadow:inset 0 -3px 0 var\(--lemon\)\}/.test(css));
  ok("the rail's switch is ENCA's", /\.wc-rail-switch\{display:inline-flex!important/.test(css));
  ok("a hidden tab is gone, whatever the tab's own display says", /body\.workspaces-shell \.toolnav-tab\[hidden\]\{display:none!important\}/.test(css));
  ok("02 shows its own lead and neither 01's line nor the overview", /#wcWsLead\{display:none\}/.test(css) && /body\.workspaces-shell\[data-ws="projects"\] #wcHomeLead,body\.workspaces-shell\[data-ws="projects"\] #wcOverview\{display:none!important\}/.test(css) && /body\.workspaces-shell\[data-ws="projects"\] #wcWsLead\{display:block\}/.test(css));
  ok("on a phone the chip is its number", /@media\(max-width:700px\)\{\.wc-ws-chip span:not\(\.wc-ws-num\)\{display:none\}\.wc-ws-chip\{padding:6px 7px\}\}/.test(css));
  ok("and the menu is kept inside the window by the script, not ENCA's right:-40px (TUNO's chip sits mid-left)", !/\.wc-ws-menu\{left:auto;right:-40px\}/.test(css) && /function placeWsMenu\(\)/.test(read("js/workspaces.js")));
  const ws = read("js/workspaces.js");
  ok("only a drawn side is ever switched to", /if \(!WORKSPACES\[next\] \|\| sides\(\)\.indexOf\(next\) < 0\) return;/.test(ws));
  ok("no optional chaining", !/[\w)\]]\?\.[\w(\[]/.test(ws.replace(/\/\/.*$/gm, "").replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, "''")));
}

// =====================================================================
head("Slice 13: 🚀 MDE rollout is 02's, and names its customer and end date");
{
  const w = await start();
  const D = w.document, $ = (id) => D.getElementById(id);
  const T = w.TOOL_VERSIONS.toolMdeRollout;
  ok("its tile is 02's, with its rail label", $("toolMdeRollout").getAttribute("data-ws") === "projects" && $("toolMdeRollout").getAttribute("data-rail") === "Rollout");
  // The version is read, not pinned (10676): "0.29" here rotted on the first
  // T28 build after slice 13 — tuno-beta CI #56 at 10675. A project tool is
  // beta-only, so 0.x is the claim; the number itself is js/version.js's.
  ok("its registry entry names the customer, and the end date — not named yet (T28 0.x)", T.project && T.project.customer === "PVM" && T.project.ends === "" && /^0\.\d+$/.test(T.v));
  const projectTiles = [...D.querySelectorAll('#screen-home .tool[data-ws="projects"]')];
  ok("every project tool is temporary and names its customer, its end a date or not yet named", projectTiles.length > 0 && projectTiles.every((t) => { const v = w.TOOL_VERSIONS[t.id]; return v && v.project && v.project.customer && /^(\d{4}-\d{2}-\d{2})?$/.test(v.project.ends) && (v.chips || []).indexOf("temporary") >= 0; }));
  ok("and stays on beta (PROMOTE.staying)", w.PROMOTE.staying.some((x) => /T28/.test(x.title)));
  ok("every registry entry with a project is a tile in 02", Object.keys(w.TOOL_VERSIONS).filter((id) => w.TOOL_VERSIONS[id].project).every((id) => $(id) && $(id).getAttribute("data-ws") === "projects"));
  const hd = D.querySelector("[data-tool-head='toolMdeRollout']");
  ok("its head names the customer, then says the end date is not set", hd && hd.querySelector(".tag.cust") && hd.querySelector(".tag.cust").textContent === "PVM" && /^Customer: PVM/.test(hd.querySelector(".tag.cust").title) && hd.querySelector(".tag.noend") && hd.querySelector(".tag.noend").textContent === "end date not set");
  ok("on 01 it is not in the library", D.body.dataset.ws === "intune" && !D.querySelector('#wcOverviewTools [data-wc-tool="toolMdeRollout"]'));
  key(w, 2); await tick(30);
  const card = D.querySelector('#wcOverviewTools [data-wc-tool="toolMdeRollout"]');
  const chips = [...card.querySelectorAll("small .wc-chip")].map((c) => c.className.replace("wc-chip", "").trim() + ":" + c.textContent);
  const tileTags = [...$("toolMdeRollout").querySelectorAll("h3 .tag")].map((c) => c.className.replace("tag", "").trim() + ":" + c.textContent.trim());
  ok("its card: T28, the customer, the end, then the tile's tags (round 1's mockup)", /^T28/.test(card.querySelector("small").textContent) && chips[0] === "cust:PVM" && chips[1] === "noend:end date not set" && chips.slice(2).join() === tileTags.join(), chips.join());
  const pc = (src) => w.eval(src);
  ok("a named date reads ends …", (() => { const c = pc('projectChips({ customer: "X", ends: "2099-12-31" })'); return c[0].txt === "X" && c[1].txt === "ends 31 Dec 2099" && c[1].cls === "ends"; })());
  ok("a day that is over reads ended …, in the bad colours", (() => { const c = pc('projectChips({ customer: "X", ends: "2020-01-01" })'); return c[1].txt === "ended 1 Jan 2020" && c[1].cls === "ended"; })());
  ok("the date is over at the end of that day, in this browser's time", pc('projectChips({ ends: "2026-10-01" }, new Date(2026, 9, 1, 23, 59).getTime())')[0].cls === "ends" && pc('projectChips({ ends: "2026-10-01" }, new Date(2026, 9, 2, 0, 0).getTime())')[0].cls === "ended");
  ok("a date that is not a date is not set", pc('projectChips({ customer: "X", ends: "2026-13-01" })')[1].cls === "noend" && pc('projectChips({ customer: "X", ends: "31-12-2026" })')[1].cls === "noend");
  ok("a tool that is not a project tool has no project chips", pc('toolProject("toolLaps")') === null && !/tag cust/.test(pc('toolHeadInner("toolLaps")')));
  w.TOOL_VERSIONS.toolMdeRollout.project = { customer: "PVM", ends: "2099-12-31" };
  key(w, 1); await tick(10); key(w, 2); await tick(30);
  const c2 = [...D.querySelectorAll('#wcOverviewTools [data-wc-tool="toolMdeRollout"] small .wc-chip')].map((c) => c.className.replace("wc-chip", "").trim() + ":" + c.textContent);
  ok("named, the card says when it ends", c2[1] === "ends:ends 31 Dec 2099", c2.join());
  ok("and so does the head line", /<span class="tag ends"[^>]*>ends 31 Dec 2099<\/span>/.test(pc('toolHeadInner("toolMdeRollout")')));
}

// =====================================================================
head("Slice 13: the carry-overs, and T28's jump into the Assignment editor");
{
  const w = await start({ url: BETA + "?ws=projects" });
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("the link opens on 02", D.body.dataset.ws === "projects" && $("wcHomeTitle").textContent === "Projects");
  const carried = [...D.querySelectorAll("#wcOverviewTools .wc-tool-group")][1];
  ok("each carry-over says it is also in 01", [...carried.querySelectorAll(".wc-tool")].every((c) => { const a = c.querySelector("small .wc-chip.also"); return a && a.textContent === "also in 01" && /stays in 02/.test(a.title); }));
  ok("in a project's words", /where MDE rollout opens a policy/.test(carried.querySelector('[data-wc-tool="toolAssignEdit"]').textContent) && /a wave/.test(carried.querySelector('[data-wc-tool="toolDefender"]').textContent));
  D.querySelector('#wcRail [data-wc-tool="toolMdeRollout"]').click(); await tick(30);
  ok("T28 runs from 02", screen(w) === "screen-mderollout" && D.body.dataset.ws === "projects");
  // T28's policy popout opens the editor through AssignEditTool.openWith,
  // which clicks the editor's tile — the click made here
  $("toolAssignEdit").click(); await tick(30);
  ok("its jump to the Assignment editor stays in 02", D.body.dataset.ws === "projects" && screen(w) === "screen-assignedit" && shown(w).join() === "toolMdeRollout,toolAssignEdit", shown(w).join());
  ok("the rail marks Assign", D.querySelector('#wcRail [data-wc-tool="toolAssignEdit"]').classList.contains("active"));
  ok("that jump goes through the tile", /AssignEditTool\.openWith\(/.test(read("js/mderolloutv2.js")) && /const tile = \$\("toolAssignEdit"\);\s*if \(tile\) tile\.click\(\);/.test(read("js/assignedit.js")));
  key(w, 1); await tick(30);
  ok("the editor is 01's too: back on 01 it stays on screen, T28's tab hidden", D.body.dataset.ws === "intune" && screen(w) === "screen-assignedit" && shown(w).join() === "toolAssignEdit", shown(w).join());
  $("side-toolGroupUse").click(); await tick(30);
  ok("a carry-over opened on 01 stays on 01", D.body.dataset.ws === "intune" && screen(w) === "screen-groupuse");
  const css = read("css/workspaces.css"), app = read("css/app.css");
  ok("on a phone 02's bar drops Defender and ASR: Home, Rollout, Assign, Groups, All tools", /@media\(max-width:700px\)\{body\.workspaces-shell\[data-ws="projects"\] #wcRail \[data-wc-tool="toolDefender"\],body\.workspaces-shell\[data-ws="projects"\] #wcRail \[data-wc-tool="toolEndpointSec"\]\{display:none\}\}/.test(css));
  ok("the customer lemon on the deepest green, the end in blue — head and card", /\.wc-chip\.cust\{background:var\(--green-deep\);color:var\(--lemon\)/.test(css) && /\.wc-chip\.ends\{background:var\(--blue-bg\);color:var\(--blue\)\}/.test(css) && /\.tag\.cust\{background:var\(--green-deep\);[^}]*color:var\(--lemon\)\}/.test(app) && /\.tag\.ends\{background:var\(--blue-bg\)/.test(app));
  ok("not named in the warning colours, past in the bad ones", /\.tag\.noend\{background:var\(--warn-bg\)/.test(app) && /\.tag\.ended\{background:var\(--bad-bg\)/.test(app) && /\.wc-chip\.noend\{background:var\(--warn-bg\)/.test(css) && /\.wc-chip\.ended\{background:var\(--bad-bg\)/.test(css));
}

// =====================================================================
head("The roadmap and the house rules");
{
  const w = boot();
  const r41 = [...w.document.querySelectorAll(".rm-card")].find((c) => [...c.querySelectorAll("h4 .rm-ref")].some((r) => r.textContent === "R41"));
  const upTo = +((/slices 1–(\d+) · beta \d+/.exec(r41.querySelector("h4").textContent) || [])[1] || 0);
  ok("R41 counts slice 12", upTo >= 12 && /Slice 12, two workspaces \(beta 10673\)/.test(r41.textContent), String(upTo));
  ok("and slice 13", upTo >= 13 && /Slice 13, 02 Projects in use \(beta 10674\)/.test(r41.textContent));
  const r40 = [...w.document.querySelectorAll(".rm-card")].find((c) => [...c.querySelectorAll("h4 .rm-ref")].some((r) => r.textContent === "R40"));
  ok("R40 says where MDE rollout lives now", /Since beta 10674 it lives in 02 Projects/.test(r40.textContent));
  ok("Help's Getting around says what 02 is and how to switch", /02 Projects, holds the tools built for one customer's project/.test(w.document.getElementById("screen-help").textContent) && /Ctrl \+ Shift \+ 1 and 2/.test(w.document.getElementById("screen-help").textContent));
  const md = read("CLAUDE.md");
  ok("CLAUDE.md: a side needs a tool of its own, and production never gets one", /## Two workspaces: a side needs a tool of its own \(build 10673\)/.test(md) && /data-ws="projects"/.test(md));
  ok("CLAUDE.md: what 02 asks of a project tool — customer, end date, never promoted, carry-overs", /## A project tool: what 02 asks of it \(build 10674\)/.test(md) && /project: \{ customer, ends: "YYYY-MM-DD" \}/.test(md) && /WORKSPACES\.projects\.carry/.test(md));
}

});

// ======================================================================
// Parity slice 5 (build 10666): line icons in the chrome — ENCA's
// js/flat-icons.js and css/flat-icons.css (25406).
//
//   1. A leading emoji in the chrome is drawn as a line icon; the emoji
//      stays in the text as hidden text, so every label's textContent reads
//      exactly as before.
//   2. A tool's icon is its own: the tile, the sidebar, the tabs, the ＋
//      menu and the head all draw names[] by tool id, whatever the emoji.
//   3. What is not the chrome's stays text: unmapped emoji, a name that
//      runs on from the emoji, code, options, data-preserve-text.
//   4. What the tools render later is drawn too, and redrawn when they
//      change it.
//
// jsdom lays nothing out; the browser checks (no icon parted from its
// words, what is left as emoji) are in the build notes.
//
// Run with `npm test`, or alone:  node tests/shell/icons.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("icons");

const iconsJs = fs.readFileSync(path.join(ROOT, "js/flat-icons.js"), "utf8");
const iconsCss = fs.readFileSync(path.join(ROOT, "css/flat-icons.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
// The harness boots without js/flat-icons.js (it loads before app.js in
// index.html, and app.js starts it); evaluated here, bridged onto window.
const bootIcons = () => {
  const w = boot();
  w.scrollTo = () => {};   // show() restores each screen's scroll; jsdom has none
  w.eval(iconsJs + "\n;window.FlatIcons = FlatIcons;");
  return w;
};
// Signed in to the demo: the sidebar and the tab bar exist only signed in.
const demo = (w) => w.document.getElementById("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
// The shape an element draws (the inside of its first icon), and the shape
// a name or a tool draws, read back the same way.
const shapeOf = (w, el) => { const s = el && el.querySelector(".enca-icon"); return s ? s.innerHTML : ""; };
const inner = (w, markup) => { const d = w.document.createElement("div"); d.innerHTML = markup; return d.firstElementChild.innerHTML; };
const drawn = (w, name) => inner(w, w.FlatIcons.svg(name));
const toolShape = (w, id) => inner(w, w.FlatIcons.tool(id));

run(async () => {

// =====================================================================
head("Loaded where ENCA loads it — before app.js, its stylesheet after tool-layout.css");
{
  const at = (f) => html.indexOf(`src="js/${f}`);
  ok("js/flat-icons.js comes before js/app.js, which starts it", at("flat-icons.js") > 0 && at("flat-icons.js") < at("app.js"));
  const css = (f) => html.indexOf(`href="css/${f}`);
  ok("css/flat-icons.css follows css/tool-layout.css", css("tool-layout.css") > 0 && css("flat-icons.css") > css("tool-layout.css"));
  const ws = fs.readFileSync(path.join(ROOT, "js/workspaces.js"), "utf8"), app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  ok("js/workspaces.js starts it at the end of its own boot, as ENCA's does (10668)", /if \(typeof FlatIcons !== 'undefined'\) FlatIcons\.start\(\);\s*\}\)\(\);\s*$/.test(ws) && !/FlatIcons\.start\(\)/.test(app));
  ok("ENCA's sizes are kept: 18 px, 24 px in a heading, 28 px on a tile, 19 px in the sidebar",
    /\.enca-icon\{display:inline-block;width:18px;height:18px/.test(iconsCss) && /\.tool-ic \.enca-icon\{width:28px;height:28px\}/.test(iconsCss)
    && /\.sn-ic \.enca-icon\{width:19px;height:19px\}/.test(iconsCss) && /h2>\.fi-run>\.enca-icon-slot \.enca-icon/.test(iconsCss));
  ok("the kept emoji is never shown", /\.enca-icon-slot>\.fi-glyph\{display:none!important\}/.test(iconsCss));
}

// =====================================================================
head("Every tool has its own icon");
{
  const w = bootIcons();
  const D = w.document;
  const tiles = [...D.querySelectorAll("#screen-home .tool-tile")].map((t) => t.id);
  const grid = drawn(w, "grid");
  ok("32 tiles, each with a shape of its own (none falls back to the grid)", tiles.length === 32 && tiles.every((id) => toolShape(w, id) !== grid),
    tiles.filter((id) => toolShape(w, id) === grid).join(", "));
  ok("an unknown id draws the grid, as in ENCA", toolShape(w, "toolNope") === grid);
  ok("round 1's four: T06 a monitor, T20 a compass, T14 a funnel, T28 a rocket",
    /M8 20h8M12 16v4/.test(w.FlatIcons.tool("toolDevice")) && /m15\.5 8\.5-2 5-5 2 2-5z/.test(w.FlatIcons.tool("toolPosture"))
    && /M3 5h18l-7 8v6l-4 2v-8z/.test(w.FlatIcons.tool("toolFilters")) && /M12 2c3\.5 2\.5/.test(w.FlatIcons.tool("toolMdeRollout")));
  ok("the two 🛡 tools differ: T07 people, T23 a stop sign", w.FlatIcons.tool("toolRoles") === w.FlatIcons.svg("users") && w.FlatIcons.tool("toolRestrictedAu") === w.FlatIcons.svg("stop"));
}

// =====================================================================
head("The page is drawn, and its text reads as before");
{
  const w = bootIcons();
  const D = w.document;
  demo(w);
  await tick(20);
  const before = D.body.textContent;
  w.FlatIcons.start();
  ok("the body's text is unchanged, emoji and all", D.body.textContent === before, "length " + before.length + " → " + D.body.textContent.length);
  const tiles = [...D.querySelectorAll("#screen-home .tool-tile")];
  ok("every tile's icon is a line icon", tiles.every((t) => t.querySelectorAll(".tool-ic .enca-icon-slot .enca-icon").length === 1));
  ok("each one is the tool's own", tiles.every((t) => shapeOf(w, t.querySelector(".tool-ic")) === toolShape(w, t.id)),
    tiles.filter((t) => shapeOf(w, t.querySelector(".tool-ic")) !== toolShape(w, t.id)).map((t) => t.id).join(", "));
  const lapsIc = D.querySelector("#toolLaps .tool-ic");
  ok("the emoji stays in the slot as hidden text", lapsIc.querySelector(".fi-glyph").hidden === true && lapsIc.textContent === "🔑");
  ok("an icon that is the whole label is .fi-solo", lapsIc.querySelector(".enca-icon-slot").classList.contains("fi-solo"));
  ok("the svg is hidden from screen readers", lapsIc.querySelector("svg").getAttribute("aria-hidden") === "true");
  const heads = [...D.querySelectorAll("[data-tool-head]")];
  ok("27 tool heads draw their tool's icon first", heads.length >= 27 && heads.every((h) => {
    const run1 = h.firstElementChild; return run1 && run1.classList.contains("fi-run") && shapeOf(w, run1) === toolShape(w, h.dataset.toolHead);
  }), String(heads.length));
  const roles = D.querySelector('[data-tool-head="toolRoles"]');
  ok("🛡 Intune RBAC's head reads as it did", roles.textContent.indexOf("🛡 Intune RBAC") === 0);
  const secs = [...D.querySelectorAll("#screen-home .tool-sec h3")];
  ok("the six Home sections name their icon", secs.length === 6 && secs.every((h) => h.dataset.icon && shapeOf(w, h) === drawn(w, h.dataset.icon)));
  ok("🖥 Endpoint security draws round 1's shield, not T06's monitor", shapeOf(w, secs[0]) === drawn(w, "shield") && /^🖥 Endpoint security$/.test(secs[0].textContent));
  const side = D.getElementById("sideNav");
  const sideTools = [...side.querySelectorAll("button[data-nav]")], sideSecs = [...side.querySelectorAll("h4")];
  ok("the sidebar's 32 entries draw the tiles' icons", sideTools.length === 32 && sideTools.every((b) => shapeOf(w, b.querySelector(".sn-ic")) === shapeOf(w, D.querySelector(`#${b.dataset.nav} .tool-ic`))),
    String(sideTools.length));
  ok("its six sections carry the section icon", sideSecs.length === 6 && sideSecs.every((h) => h.dataset.icon && shapeOf(w, h) === drawn(w, h.dataset.icon)), String(sideSecs.length));
  ok("Overview draws the house", shapeOf(w, D.querySelector("#side-home .sn-ic")) === drawn(w, "home"));
}

// =====================================================================
head("What the tools render later is drawn too");
{
  const w = bootIcons();
  const D = w.document;
  demo(w);
  await tick(20);
  w.FlatIcons.start();
  D.getElementById("toolRestrictedAu").click();
  await tick(60);
  const tab = D.querySelector('#toolNav .toolnav-btn[data-nav="toolRestrictedAu"]');
  ok("a tab opened later draws its tool's icon", !!tab && shapeOf(w, tab) === drawn(w, "stop"), tab ? tab.innerHTML.slice(0, 80) : "no tab");
  ok("and reads as before", tab.textContent === "🛡 Restricted AUs");
  const help = D.querySelector("#toolNav [data-navhelp]");
  ok("the tab bar's ❓ Help draws the help icon", shapeOf(w, help) === drawn(w, "help") && help.textContent === "❓ Help");
  const host = D.createElement("div");
  D.getElementById("screen-home").appendChild(host);
  host.innerHTML = `<button id="fiA">⭳ Export MD</button><button id="fiB" title="Close the panel">✕</button><button id="fiC">🦄 Unicorns</button>
    <button id="fiD">🔑abc</button><label id="fiE"><input type="checkbox"> ⚙️ Configuration profiles</label><pre id="fiF">🔑 key</pre>
    <div data-preserve-text><button id="fiG">👥 Empty groups</button></div><select id="fiH"><option>🔑 key</option></select>
    <h3 id="fiI">📋 Compliance evidence</h3><h3 id="fiJ">📋 What's new</h3><th id="fiK">✏️ Assignment editor</th>`;
  await tick(60);
  const $ = (id) => D.getElementById(id);
  ok("a button rendered later is drawn", shapeOf(w, $("fiA")) === drawn(w, "download") && $("fiA").textContent === "⭳ Export MD");
  ok("its words follow the icon in one run", $("fiA").firstElementChild.className === "fi-run" && $("fiA").firstElementChild.lastChild.textContent === " Export MD");
  ok("an icon-only button is named by its title", $("fiB").getAttribute("aria-label") === "Close the panel" && $("fiB").querySelector(".fi-solo"));
  ok("an emoji with no line icon stays an emoji (ENCA would draw a grid)", !$("fiC").querySelector(".enca-icon"));
  ok("an emoji that runs into a word is not a marker", !$("fiD").querySelector(".enca-icon"));
  ok("a label with a tick box is drawn, the box untouched", shapeOf(w, $("fiE")) === drawn(w, "settings") && $("fiE").querySelector("input") && $("fiE").textContent === " ⚙️ Configuration profiles");
  ok("the variation selector stays with the kept emoji", $("fiE").querySelector(".fi-glyph").textContent === "⚙️");
  ok("code, data-preserve-text and options keep their emoji", !$("fiF").querySelector(".enca-icon") && !$("fiG").querySelector(".enca-icon") && !$("fiH").querySelector(".enca-icon"));
  ok("a heading that opens with a tool's head line takes that tool's icon", shapeOf(w, $("fiI")) === drawn(w, "flag") && shapeOf(w, $("fiJ")) === drawn(w, "file"));
  $("fiA").textContent = "⏳ Exporting…";
  await tick(60);
  ok("a label the tool rewrites is drawn again", shapeOf(w, $("fiA")) === drawn(w, "clock") && $("fiA").textContent === "⏳ Exporting…");
  const before = host.innerHTML;
  w.FlatIcons.apply(host);
  ok("drawing twice changes nothing", host.innerHTML === before);
}

// =====================================================================
head("The maps hold together");
{
  const w = bootIcons();
  const src = iconsJs;
  ok("no optional chaining (ENCA's two ?. rewritten)", !/\?\.[^\d]/.test(src.replace(/\/\/.*$/gm, "")));
  ok("the svg carries its own size, for a pasted selection", /<svg class="enca-icon" width="18" height="18"/.test(src));
  ok("ENCA's 🧪 (its what-if) is not mapped in TUNO", /delete glyphs\["🧪"\]/.test(src));
  const D = w.document;
  const host = D.createElement("div");
  D.body.appendChild(host);
  host.innerHTML = `<button>🧪 Create sample draft</button>`;
  w.FlatIcons.apply(host);
  ok("so 🧪 keeps its emoji", !host.querySelector(".enca-icon"));
}

});

// ======================================================================
// Parity slice 1 (build 10662): the shell's foundation, ported from ENCA.
//
//   1. The sticky stack is measured, and the demo bar is part of it
//      (ENCA's syncStickyTops + ResizeObserver; the bar is TUNO's own).
//   2. Every tool screen carries one frame (ENCA 25351), and the tiles carry
//      the class split that keeps tile styles off it (ENCA 25357).
//   3. Back covers every tool: the history set is read from the frame.
//   4. No optional chaining anywhere in js/ — the house rule, which 13
//      lines had broken by 10661.
//
// jsdom has no layout, so (1) checks the arithmetic with measured heights
// stubbed in; the geometry itself is checked in a real browser when the
// build is made (five widths, see the workplan).
//
// Run with `npm test`, or alone:  node tests/shell/foundation.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("foundation");

// ---------------------------------------------------------------------
// Optional chaining in CODE: `?.` outside strings, template text, comments
// and regular-expression literals, and not followed by a digit (`a?.5:b` is
// a conditional). A tokenizer rather than a grep, because the prose in this
// codebase asks questions in strings and comments ("why?.") and a grep
// would cry wolf until somebody stopped reading it. Template literals nest:
// `${ … }` is code again, until its own closing brace.
// ---------------------------------------------------------------------
function optionalChains(src) {
  const hits = [];
  const n = src.length;
  const word = /[A-Za-z0-9_$]/;
  const BEFORE_REGEX = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);
  const tpl = [];          // brace depth at each open `${`
  let i = 0, line = 1, braces = 0, last = "";
  // A `/` starts a regular expression where an operand is expected, and
  // divides where one has just ended.
  const regexOk = () => {
    if (!last) return true;
    if (word.test(last[0])) return BEFORE_REGEX.has(last);
    return last !== ")" && last !== "]" && last !== "}" && last !== "lit";
  };
  // i sits just after a ` or after the } closing a ${ … }; returns "expr"
  // when the template opens another ${, "end" at its closing `.
  const templateText = () => {
    while (i < n) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "\n") line++;
      if (c === "`") { i++; return "end"; }
      if (c === "$" && src[i + 1] === "{") { i += 2; return "expr"; }
      i++;
    }
    return "end";
  };
  const afterTemplate = (state) => {
    if (state === "expr") { tpl.push(braces); braces++; last = "{"; }
    else last = "lit";
  };
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === "﻿") { i++; continue; }
    if (c === "/" && c2 === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && c2 === "*") {
      const e = src.indexOf("*/", i + 2), end = e < 0 ? n : e + 2;
      for (let k = i; k < end; k++) if (src[k] === "\n") line++;
      i = end; continue;
    }
    if (c === "'" || c === "\"") {
      i++;
      while (i < n && src[i] !== c) { if (src[i] === "\\") i++; else if (src[i] === "\n") line++; i++; }
      i++; last = "lit"; continue;
    }
    if (c === "`") { i++; afterTemplate(templateText()); continue; }
    if (c === "{") { braces++; i++; last = "{"; continue; }
    if (c === "}") {
      braces--; i++;
      if (tpl.length && tpl[tpl.length - 1] === braces) { tpl.pop(); afterTemplate(templateText()); }
      else last = "}";
      continue;
    }
    if (c === "/") {
      if (regexOk()) {
        const start = i;
        let cls = false, closed = false;
        i++;
        while (i < n) {
          const r = src[i];
          if (r === "\\") { i += 2; continue; }
          if (r === "\n") break;
          if (cls) { if (r === "]") cls = false; }
          else if (r === "[") cls = true;
          else if (r === "/") { i++; closed = true; break; }
          i++;
        }
        if (closed) { while (i < n && word.test(src[i])) i++; last = "lit"; continue; }
        i = start + 1; last = "/"; continue;    // not a regex after all: a division
      }
      i++; last = "/"; continue;
    }
    if (c === "?" && c2 === "." && !/[0-9]/.test(src[i + 2] || "")) { hits.push(line); i += 2; last = "."; continue; }
    if ((c === "+" && c2 === "+") || (c === "-" && c2 === "-")) { i += 2; last = ")"; continue; }
    if (word.test(c)) { let j = i; while (j < n && word.test(src[j])) j++; last = src.slice(i, j); i = j; continue; }
    last = c; i++;
  }
  return hits;
}

run(async () => {

// =====================================================================
head("No optional chaining in js/ — house rule, cleared at 10662");
{
  // The tokenizer first: it must see code and nothing but code.
  const t = (s) => optionalChains(s).length;
  ok("finds a?.b, a?.[0] and f?.()", t("a?.b; a?.[0]; f?.();") === 3);
  ok("finds one inside a template expression", t("const s = `x ${a?.b} y`;") === 1);
  ok("finds one inside a nested template", t("const s = `x ${`in ${a?.b}`} y`;") === 1);
  ok("ignores strings", t("const s = 'a?.b' + \"c?.d\";") === 0);
  ok("ignores template text", t("const s = `why?.  ${x}  so?.`;") === 0);
  ok("ignores comments", t("// what?.\n/* and?.\n */ x = 1;") === 0);
  ok("ignores regular expressions", t("const r = /a?.b/g; const q = x.replace(/[?.]/, '');") === 0);
  ok("a conditional with a decimal is not a chain", t("const v = a ?.5 : 1;") === 0);
  ok("division is not a regex: a?.b after a / still counts", t("const r = total / 2; x = a?.b; y = 4 / z;") === 1);
  ok("a postfix ++ before a division", t("i++ / 2; a?.b;") === 1);
  ok("reports the line", optionalChains("x = 1;\n\ny = a?.b;")[0] === 3);

  const files = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).sort();
  ok("reads the whole of js/", files.length > 40, String(files.length));
  const found = [];
  for (const f of files) {
    const lines = optionalChains(fs.readFileSync(path.join(ROOT, "js", f), "utf8"));
    for (const l of lines) found.push(`js/${f}:${l}`);
  }
  ok("no ?. in any file under js/", found.length === 0, found.join(", "));
}

// =====================================================================
head("The frame — every tool screen is a .screen.tool (ENCA 25351)");
{
  const D = boot().document;
  const NON_TOOL = ["screen-login", "screen-home", "screen-changelog", "screen-roadmap", "screen-help"];
  const screens = [...D.querySelectorAll("main > section.screen")];
  const tools = screens.filter((s) => s.classList.contains("tool"));
  ok("29 tool screens carry the frame", tools.length === 29, String(tools.length));
  ok("the five pages that are not tools do not", NON_TOOL.every((id) => D.getElementById(id) && !D.getElementById(id).classList.contains("tool")));
  ok("every other screen is a tool screen", screens.length === tools.length + NON_TOOL.length, `${screens.length} screens`);

  // The head card: no inline spacing left for the frame to fight with.
  // T28's head is rendered by its controller, inside its workspace.
  const heads = tools.filter((s) => s.id !== "screen-mderollout").map((s) => s.firstElementChild);
  ok("27 heads are a .list-card.readme first child", heads.every((h) => h && h.classList.contains("list-card") && h.classList.contains("readme")), String(heads.length));
  ok("no head card carries an inline style", heads.every((h) => !h.hasAttribute("style")),
    heads.filter((h) => h.hasAttribute("style")).map((h) => h.parentElement.id).join(", "));
  const typed = [];
  for (const s of tools) for (const c of s.children) {
    const st = (c.getAttribute("style") || "").replace(/\s+/g, "");
    if (/(^|;)margin-top:(0|14px)(;|$)/.test(st)) typed.push(`${s.id} > #${c.id || c.className}`);
  }
  ok("no direct child types margin-top:0 or margin-top:14px any more", typed.length === 0, typed.join(", "));
  const bodies = [...D.querySelectorAll(".tool-body")];
  ok("22 results are .tool-body", bodies.length === 22, String(bodies.length));
  ok("each .tool-body is a direct child of a tool screen", bodies.every((b) => b.parentElement.matches("section.screen.tool")));

  // Tiles carry .tool-tile, and nothing but tiles and tool screens is .tool.
  const tiles = [...D.querySelectorAll(".tools > .tool")];
  ok("32 tiles (29 tools, What's new, Roadmap, Help)", tiles.length === 32, String(tiles.length));
  ok("every tile carries .tool-tile", tiles.every((t) => t.classList.contains("tool-tile")));
  const stray = [...D.querySelectorAll(".tool")].filter((e) => !tiles.includes(e) && !tools.includes(e));
  ok("no other element is .tool", stray.length === 0, stray.map((e) => e.id || e.className).join(", "));

  // And the stylesheet: tile rules are written against .tool-tile, so none
  // of them can land on a screen; the frame's own rules are there.
  const css = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const bare = css.split("\n").filter((l) => /(^|[\s,>+~(}])\.tool(?![-\w])/.test(l));
  ok("no stylesheet rule targets bare .tool", bare.length === 0, bare.join(" | "));
  ok("the frame owns the head card's spacing", /\.screen\.tool > \.readme,\s*\.screen\.tool > \.list-card:first-child\{margin-top:0\}/.test(css)
    && /\.screen\.tool > \.readme\{padding:20px 24px\}/.test(css));
  ok("the frame owns the result's spacing", /\.screen\.tool > \.tool-body\{margin-top:14px\}/.test(css));
}

// =====================================================================
head("Back covers every tool — the history set is read from the frame");
{
  const w = boot();
  const D = w.document;
  w.scrollTo = () => {};   // show() restores each screen's scroll; jsdom has none
  D.getElementById("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  ok("the demo lands on Home", D.querySelector(".screen.active") && D.querySelector(".screen.active").id === "screen-home");

  const missed = [], seen = [];
  for (const tile of D.querySelectorAll(".tools > .tool")) {
    tile.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    const active = D.querySelector(".screen.active");
    const state = w.history.state && w.history.state.screen;
    if (!active || state !== active.id) missed.push(`${tile.id} → ${active ? active.id : "nothing"} (history says ${state || "nothing"})`);
    else seen.push(active.id);
  }
  ok("every tile's screen pushed its own history entry", missed.length === 0, missed.join(" | "));
  const toolScreens = [...D.querySelectorAll("section.screen.tool")].map((s) => s.id);
  ok("all 29 tool screens were reached and recorded", toolScreens.every((id) => seen.includes(id)),
    toolScreens.filter((id) => !seen.includes(id)).join(", "));
  for (const id of ["screen-defender", "screen-endpointsec", "screen-posture", "screen-securescore", "screen-maa", "screen-laps", "screen-restrictedau", "screen-groupmigrate"]) {
    ok(`${id} is in the history now (missing until 10662)`, seen.includes(id));
  }

  // And Back walks them: open two tools, go back once, land on the first.
  const click = (id) => D.getElementById(id).dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  click("toolDefender");
  click("toolLaps");
  ok("LAPS is showing", D.querySelector(".screen.active").id === "screen-laps");
  const popped = new Promise((r) => w.addEventListener("popstate", () => setTimeout(r, 0), { once: true }));
  w.history.back();
  await Promise.race([popped, new Promise((r) => setTimeout(r, 1000))]);
  ok("Back from 🔑 LAPS lands on 🦠 Defender, not on the screen before it",
    D.querySelector(".screen.active").id === "screen-defender", D.querySelector(".screen.active").id);
}

// =====================================================================
head("The sticky stack is measured, demo bar included");
{
  const w = boot();
  const D = w.document;
  const bar = D.getElementById("demoBar"), header = D.querySelector("header"), nav = D.getElementById("toolNav");
  ok("the demo bar is the first element in the body", D.body.firstElementChild === bar);
  ok("…so it comes before the header and the tab bar",
    !!(bar.compareDocumentPosition(header) & w.Node.DOCUMENT_POSITION_FOLLOWING)
    && !!(bar.compareDocumentPosition(nav) & w.Node.DOCUMENT_POSITION_FOLLOWING));

  w.scrollTo = () => {};
  D.getElementById("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  ok("the demo shows the bar", bar.style.display !== "none" && D.body.classList.contains("demo-mode"));
  // The tab bar shows once a tool is open; Home alone has no tabs.
  D.getElementById("toolLaps").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok("an open tool shows the tab bar", nav.style.display !== "none");

  // jsdom lays nothing out: give the three boxes the heights a browser would.
  const rect = (h) => () => ({ height: h, width: 1440, top: 0, left: 0, right: 1440, bottom: h, x: 0, y: 0 });
  bar.getBoundingClientRect = rect(40);
  header.getBoundingClientRect = rect(58);
  nav.getBoundingClientRect = rect(46);
  Object.defineProperty(nav, "offsetParent", { get: () => D.body, configurable: true });
  const v = (name) => D.documentElement.style.getPropertyValue(name);
  w.dispatchEvent(new w.Event("resize"));
  ok("--demo-bar-h is the bar", v("--demo-bar-h") === "40px", v("--demo-bar-h"));
  ok("--sticky-header ends below the bar and the header", v("--sticky-header") === "98px", v("--sticky-header"));
  ok("--sticky-nav ends below the tab bar too", v("--sticky-nav") === "144px", v("--sticky-nav"));

  // A bar that wraps to two lines moves everything under it.
  bar.getBoundingClientRect = rect(62);
  w.dispatchEvent(new w.Event("resize"));
  ok("a two-line bar pushes the stack down with it", v("--sticky-header") === "120px" && v("--sticky-nav") === "166px", `${v("--sticky-header")} / ${v("--sticky-nav")}`);

  // Outside the demo the bar is hidden and counts for nothing.
  bar.style.display = "none";
  w.dispatchEvent(new w.Event("resize"));
  ok("no bar, no offset", v("--demo-bar-h") === "0px" && v("--sticky-header") === "58px" && v("--sticky-nav") === "104px",
    `${v("--demo-bar-h")} / ${v("--sticky-header")} / ${v("--sticky-nav")}`);

  // The stylesheet side: one rule names the bar; the sidebar builds on the
  // measured stack instead of its own 58px guess that forgot the tab bar.
  const css = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  ok("the sidebar's own demo offset is gone", !/body\.demo-mode \.sidenav\{/.test(css));
  ok("the sidebar pins at --sticky-nav", /\.sidenav\{position:fixed;left:0;top:var\(--sticky-nav,/.test(css));
  ok("the tab bar pins at --sticky-header", /\.toolnav\{position:sticky;top:var\(--sticky-header,/.test(css));
  ok("the header pins below the bar in the demo", /body\.demo-mode header\{top:var\(--demo-bar-h,/.test(css));
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  ok("the boxes are observed, not just measured on resize", /new ResizeObserver\(syncStickyTops\)/.test(app)
    && /\[\$\("demoBar"\), document\.querySelector\("header"\), \$\("toolNav"\)\]/.test(app));
}

});

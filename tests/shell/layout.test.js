// ======================================================================
// Parity slice 3 (build 10664): the folding tool head and the toolbar slot
// order — ENCA's js/tool-layout.js (25451) and the slot contract of 25351.
//
//   1. Every tool head card (.screen.tool > .readme) folds: a ▾ / ▸ button
//      at the end of its title hides the prose and keeps the title, chips
//      and stamp; the choice is remembered per screen.
//   2. A toolbar's controls sit in one order — find, scope, filter, window,
//      extras, actions — in the markup as well as on the screen.
//
// Run with `npm test`, or alone:  node tests/shell/layout.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("layout");

const layoutJs = fs.readFileSync(path.join(ROOT, "js/tool-layout.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
// The harness boots the app without js/tool-layout.js; it loads after
// app.js in index.html, so it is evaluated after the boot here.
const bootLayout = (before) => {
  const w = boot();
  if (before) before(w);
  w.eval(layoutJs);
  return w;
};

run(async () => {

// =====================================================================
head("Loaded where ENCA loads it — after app.js, its stylesheet after app.css");
{
  const css = html.indexOf('href="css/tool-layout.css'), app = html.indexOf('href="css/app.css');
  ok("css/tool-layout.css is linked, after css/app.css", css > app && app > 0);
  const js = html.indexOf('src="js/tool-layout.js'), appJs = html.indexOf('src="js/app.js');
  ok("js/tool-layout.js runs after js/app.js, which writes the heads", js > appJs && appJs > 0);
}

// =====================================================================
head("Every head card folds");
{
  const w = bootLayout();
  const D = w.document;
  const heads = [...D.querySelectorAll(".screen.tool > .readme")];
  ok("28 head cards are marked .wc-tool-head", heads.length === 28 && heads.every((h) => h.classList.contains("wc-tool-head")), String(heads.length));
  ok("each title is marked .wc-page-title", heads.every((h) => h.querySelector("h2.wc-page-title")));
  ok("each title carries exactly one fold button", heads.every((h) => h.querySelectorAll(".wc-head-fold").length === 1));
  ok("the button is the title's last child, after the version stamp", heads.every((h) => {
    const t = h.querySelector("h2"); return t.lastElementChild && t.lastElementChild.classList.contains("wc-head-fold")
      && t.lastElementChild.previousElementSibling && t.lastElementChild.previousElementSibling.classList.contains("tool-ver-head");
  }));
  ok("the button is a real button, open by default", heads.every((h) => {
    const b = h.querySelector(".wc-head-fold"); return b.tagName === "BUTTON" && b.type === "button" && b.textContent === "▾" && b.getAttribute("aria-expanded") === "true";
  }));
  ok("nothing is folded on a first visit", heads.every((h) => !h.classList.contains("wc-head-folded")));
  ok("🚀 MDE rollout has no head card, so no fold", !D.querySelector("#screen-mderollout .wc-head-fold"));

  const h = D.querySelector("#screen-defender > .readme"), b = h.querySelector(".wc-head-fold");
  b.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok("a click folds the head", h.classList.contains("wc-head-folded"));
  ok("the button turns to ▸ and says what it will do", b.textContent === "▸" && b.title === "Show what this tool does" && b.getAttribute("aria-expanded") === "false");
  ok("the choice is remembered for this screen", w.localStorage.getItem("tuno-head-fold:screen-defender") === "1");
  ok("other screens are untouched", w.localStorage.getItem("tuno-head-fold:screen-laps") === null && !D.querySelector("#screen-laps > .readme").classList.contains("wc-head-folded"));
  b.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok("a second click unfolds it and forgets the choice", !h.classList.contains("wc-head-folded") && w.localStorage.getItem("tuno-head-fold:screen-defender") === null && b.textContent === "▾");
}

// =====================================================================
head("A remembered fold is there on the next visit");
{
  const w = bootLayout((w0) => w0.localStorage.setItem("tuno-head-fold:screen-groupuse", "1"));
  const D = w.document;
  const h = D.querySelector("#screen-groupuse > .readme");
  ok("the head opens folded", h.classList.contains("wc-head-folded"));
  ok("its button says ▸", h.querySelector(".wc-head-fold").textContent === "▸");
  ok("the title and its stamp are still there", /Group Analyzer/.test(h.querySelector("h2").textContent) && h.querySelector(".tool-ver-head"));
  const css = fs.readFileSync(path.join(ROOT, "css/tool-layout.css"), "utf8");
  ok("the stylesheet hides the prose of a folded head", /\.wc-tool-head\.wc-head-folded p,/.test(css) && /\{display:none\}/.test(css));
  ok("and takes the title's bottom margin off", /\.wc-tool-head\.wc-head-folded \.wc-page-title\{margin-bottom:0\}/.test(css));
}

// =====================================================================
head("Toolbar slot order — find, scope, filter, window, extras, actions");
{
  const D = boot().document;
  const slot = (el) => {
    const c = el.classList;
    if (c.contains("search")) return 1;
    if (c.contains("seg") || c.contains("tb-scope")) return 2;
    if (c.contains("chip-filter") || c.contains("sel-filter")) return 3;
    if (c.contains("tb-win")) return 4;
    if (c.contains("tb-actions")) return 6;
    return 5;
  };
  const bars = [...D.querySelectorAll(".toolbar")];
  ok("the static toolbars are found", bars.length >= 2, String(bars.length));
  const wrong = bars.filter((b) => { const s = [...b.children].filter((c) => c.tagName !== "INPUT" || c.type !== "file").map(slot); return s.some((v, i) => i && v < s[i - 1]); });
  ok("every static toolbar is written in slot order", wrong.length === 0, wrong.map((b) => b.id || b.className).join(", "));
  const ov = [...D.getElementById("ovToolbar").children];
  ok("🗂 Policy overview: the search comes first, then the view switch", ov[0].classList.contains("search") && ov[1].id === "ovViewSeg");
  ok("its verdict chips are a .chip-filter", D.getElementById("ovChips").classList.contains("chip-filter"));
  const css = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8");
  ok("the stylesheet holds the order", /\.toolbar > \*\{order:5\}/.test(css) && /\.toolbar > \.search\{order:1;/.test(css)
    && /\.toolbar > \.seg,\.toolbar > \.tb-scope\{order:2\}/.test(css) && /\.toolbar > \.chip-filter,\.toolbar > \.sel-filter\{order:3\}/.test(css)
    && /\.toolbar > \.tb-win\{order:4\}/.test(css) && /\.toolbar > \.tb-actions\{order:6\}/.test(css));
  ok("the find box is a fixed width in a toolbar, not the slack", /\.toolbar > \.search\{order:1;flex:0 0 auto;width:clamp\(200px,26%,320px\)/.test(css));
}

});

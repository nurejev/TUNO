// ======================================================================
// Parity slice 4 (build 10665): dialogs hold focus, tiles open from the
// keyboard, and table columns resize — ENCA's js/accessibility.js (25357)
// and js/col-resize.js (32312).
//
//   1. An open dialog is a modal: role=dialog, aria-modal, named by its
//      heading; focus moves in, Tab stays in, the rest is inert, focus goes
//      back when it closes. Escape goes to the tools first; a dialog still
//      open after them closes through its own close button.
//   2. Every home tile's name is a button, and the tile ranking still finds
//      the name there.
//   3. A data table gets a grip per header and a ↺ in the last one; a
//      remembered width comes back fixed; a table whose <colgroup> sets its
//      widths, a matrix and data-noresize keep their layout.
//
// jsdom lays nothing out, so the focus checks stub getClientRects where a
// browser would have boxes. The drag itself is checked in a browser.
//
// Run with `npm test`, or alone:  node tests/shell/dialogs.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("dialogs");

const a11yJs = fs.readFileSync(path.join(ROOT, "js/accessibility.js"), "utf8");
const colJs = fs.readFileSync(path.join(ROOT, "js/col-resize.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
// Elements jsdom gives no boxes: pretend everything is laid out, as a browser
// would for an open dialog, so focusable() sees the buttons.
const withBoxes = (w) => { w.HTMLElement.prototype.getClientRects = function () { return [{ width: 10, height: 10 }]; }; };

run(async () => {

// =====================================================================
head("Loaded after app.js, in ENCA's order");
{
  const at = (f) => html.indexOf(`src="js/${f}`);
  ok("col-resize, accessibility, tool-layout follow app.js in that order",
    at("app.js") > 0 && at("app.js") < at("col-resize.js") && at("col-resize.js") < at("accessibility.js") && at("accessibility.js") < at("tool-layout.js"));
}

// =====================================================================
head("A dialog is a modal while it is open");
{
  const w = boot();
  const D = w.document;
  withBoxes(w);
  w.eval(a11yJs);
  const opener = D.getElementById("themeBtn");
  opener.focus();
  const bg = D.getElementById("rbModal"), panel = bg.querySelector(".modal");
  // js/roles.js is not in the test boot; wire its Close the way it does
  // (rbModalClose → closeGroupModal, which removes .open).
  D.getElementById("rbModalClose").addEventListener("click", () => bg.classList.remove("open"));
  bg.classList.add("open");
  await tick();
  ok("the panel is a dialog", panel.getAttribute("role") === "dialog" && panel.getAttribute("aria-modal") === "true");
  ok("named by its own heading", panel.getAttribute("aria-labelledby") === "rbModalTitle");
  ok("focus moved into it", panel.contains(D.activeElement), D.activeElement && (D.activeElement.id || D.activeElement.tagName));
  ok("the header and the other screens are inert", D.querySelector("header").inert === true && D.getElementById("screen-home").inert === true);
  ok("its own screen is not", D.getElementById("screen-roles").inert !== true && bg.inert !== true);
  const items = [...panel.querySelectorAll("button,a[href],input,select,textarea,[tabindex]")].filter((e) => !e.disabled && e.tabIndex >= 0);
  const lastItem = items[items.length - 1];
  lastItem.focus();
  const tab = new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  D.dispatchEvent(tab);
  ok("Tab on the last control wraps to the first", tab.defaultPrevented && D.activeElement === items[0]);
  const back = new w.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
  D.dispatchEvent(back);
  ok("Shift+Tab on the first wraps to the last", back.defaultPrevented && D.activeElement === lastItem);

  // 🛡 Intune RBAC's member list has no Escape of its own: the fallback
  // closes it through its Close button.
  D.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await tick();
  ok("Escape closes a dialog whose tool does not", !bg.classList.contains("open"));
  ok("the rest is no longer inert", D.querySelector("header").inert !== true && D.getElementById("screen-home").inert !== true);
  ok("focus went back to where it was", D.activeElement === opener);
}

// =====================================================================
head("Escape is the tools' first");
{
  const w = boot();
  const D = w.document;
  withBoxes(w);
  w.eval(a11yJs);
  const bg = D.getElementById("guModal");
  // 🔗 Group Analyzer registers its own Escape at init (js/groupuse.js):
  // it closes the dialog through closeGroupModal, not through a click.
  let closeClicks = 0;
  D.getElementById("guModalClose").addEventListener("click", () => closeClicks++);
  bg.classList.add("open");
  await tick();
  D.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await tick();
  ok("the tool's own Escape closed it", !bg.classList.contains("open"));
  ok("and the fallback did not click its Close as well", closeClicks === 0);
  ok("no Close button was added to any dialog", !D.querySelector(".dialog-close"));
}

// =====================================================================
head("Home tiles open from the keyboard");
{
  const w = boot();
  const D = w.document;
  w.eval(a11yJs);
  const tiles = [...D.querySelectorAll("#screen-home .tool")];
  ok("32 tiles carry a launch button", tiles.length === 32 && tiles.every((t) => t.querySelectorAll("h3 > .tool-launch").length === 1), String(tiles.length));
  ok("the button is the heading's first child and holds the name", tiles.every((t) => {
    const b = t.querySelector("h3 > .tool-launch"); return b === t.querySelector("h3").firstElementChild && b.textContent.length > 2 && b.type === "button";
  }));
  const named = tiles.filter((t) => w.TOOL_VERSIONS[t.id] && w.TOOL_VERSIONS[t.id].head);
  ok("a tool tile's button is its name, the same as its heading", named.length === 29 && named.every((t) => t.querySelector(".tool-launch").textContent === w.TOOL_VERSIONS[t.id].head.replace(/^\S+\s/, "")),
    named.filter((t) => t.querySelector(".tool-launch").textContent !== w.TOOL_VERSIONS[t.id].head.replace(/^\S+\s/, "")).map((t) => t.id + ": " + t.querySelector(".tool-launch").textContent).join(" | "));
  ok("its label says what it does", D.querySelector("#toolLaps .tool-launch").getAttribute("aria-label") === "Open Windows LAPS audit");
  ok("the heading kept its chips", D.querySelector("#toolDeviceCleanup h3 .tag") !== null);
  let routed = false;
  D.getElementById("toolLaps").addEventListener("click", () => { routed = true; });
  D.querySelector("#toolLaps .tool-launch").click();
  ok("a click on the button reaches the tile's own route", routed);
  ok("the logo is a button for the keyboard", D.getElementById("logoHome").tabIndex === 0 && D.getElementById("logoHome").getAttribute("role") === "button");
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  ok("the tile ranking reads the name from the launch button", /const b = h\.querySelector\("\.tool-launch"\);\s*if \(b\) return b\.textContent/.test(app));
}

// =====================================================================
head("Table columns resize — grips, remembered widths, and what keeps its layout");
{
  const w = boot();
  const D = w.document;
  // A remembered width for one table, under its id.
  w.localStorage.setItem("tuno-colw:crTest2", JSON.stringify({ sig: "Name|Kind|When", w: { Name: 300, Kind: 120, When: 90 } }));
  const host = D.createElement("div");
  host.innerHTML = `
    <table id="crTest1"><thead><tr><th>Policy</th><th>Surface</th><th>Modified</th></tr></thead><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>
    <table id="crTest2"><thead><tr><th>Name</th><th>Kind</th><th>When</th></tr></thead><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>
    <table id="crCols"><colgroup><col style="width:30px"><col></colgroup><thead><tr><th>✓</th><th>Name</th></tr></thead></table>
    <table id="crMatrix" class="mtable"><thead><tr><th>A</th><th>B</th></tr></thead></table>
    <table id="crNo" data-noresize><thead><tr><th>A</th><th>B</th></tr></thead></table>
    <table id="crOne"><thead><tr><th>Only</th></tr></thead></table>`;
  D.body.appendChild(host);
  w.eval(colJs);
  await tick(20);
  const t1 = D.getElementById("crTest1");
  ok("a data table gets a grip on every header", t1.querySelectorAll("th > .cr-grip").length === 3);
  ok("and a ↺ in the last header, hidden until resized", t1.querySelectorAll("th:last-child > .cr-reset").length === 1 && !t1.classList.contains("cr-custom"));
  ok("the grip says what it does", /Drag to resize this column · double-click to fit it/.test(t1.querySelector(".cr-grip").title));
  const t2 = D.getElementById("crTest2");
  ok("a remembered width comes back, fixed", t2.classList.contains("cr-custom") && t2.style.tableLayout === "fixed" && t2.querySelector("th").style.width === "300px");
  ok("stored under TUNO's own prefix", t2.dataset.crKey === "tuno-colw:crTest2");
  t2.querySelector(".cr-reset").click();
  ok("↺ puts the tool's layout back and forgets the width", !t2.classList.contains("cr-custom") && t2.style.tableLayout === "" && w.localStorage.getItem("tuno-colw:crTest2") === null);
  ok("a table whose <colgroup> sets its widths keeps its layout", !D.querySelector("#crCols .cr-grip"));
  ok("a matrix keeps its layout", !D.querySelector("#crMatrix .cr-grip"));
  ok("data-noresize keeps its layout", !D.querySelector("#crNo .cr-grip"));
  ok("a one-column table has nothing to resize", !D.querySelector("#crOne .cr-grip"));
  // Tools rebuild their tables from template strings: the observer finds the new one.
  host.insertAdjacentHTML("beforeend", `<table id="crLate"><thead><tr><th>X</th><th>Y</th></tr></thead></table>`);
  await tick(30);
  ok("a table rendered later gets its grips too", D.querySelectorAll("#crLate .cr-grip").length === 2);
}

});

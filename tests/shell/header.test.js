// ======================================================================
// The header (10607 — ENCA's 25258/25259 ported): the account button is
// the initials circle alone; tenant, signed-in user, Copy tenant ID,
// Branding settings and Sign out live in its menu; the Tools button is
// gone because the tab bar carries the home icon.
//
// The workspace shell (10668, parity slice 7 — ENCA's js/workspaces.js and
// css/workspaces.css): signed in, the header is branded (the mark on a
// medallion over the rail, the context line, All tools, the account button
// with the tenant's name — round 1, D2 B), the 88 px rail runs in work order
// (D1 A) and turns into a bottom bar on a phone, the strip of open tools
// wears the tools' icons, and All tools opens the library. The markup in
// index.html is unchanged: the shell is drawn over it once a session starts.
//
// Run with `npm test`, or alone:  node tests/shell/header.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("header");
const wsJs = fs.readFileSync(path.join(ROOT, "js/workspaces.js"), "utf8");
const iconsJs = fs.readFileSync(path.join(ROOT, "js/flat-icons.js"), "utf8");
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
// The harness boots without the shell (it loads after app.js in index.html);
// evaluated here, with the icons it draws with, then signed in to the demo.
const bootShell = async () => {
  const w = boot();
  w.scrollTo = () => {};
  w.eval(iconsJs + "\n;window.FlatIcons = FlatIcons;");
  w.eval(wsJs);
  w.document.getElementById("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await tick(30);
  return w;
};

run(async () => {

// =====================================================================
head("The markup: one account button, one menu, no Tools button");
{
  const w = boot();
  const D = w.document;
  ok("the Tools button is gone", !D.getElementById("homeBtn"));
  ok("the account button carries only the avatar", D.getElementById("acctBtn") && D.getElementById("acctBtn").children.length === 1 && D.getElementById("acctBtn").firstElementChild.id === "avatar");
  ok("it is a menu button", D.getElementById("acctBtn").getAttribute("aria-haspopup") === "menu" && D.getElementById("acctBtn").getAttribute("aria-expanded") === "false");
  const m = D.getElementById("acctMenu");
  ok("the menu starts hidden", m && m.hidden === true && m.getAttribute("role") === "menu");
  ok("tenant and signed-in user moved INTO the menu", m.contains(D.getElementById("tenantName")) && m.contains(D.getElementById("tenantUser")) && m.contains(D.getElementById("acctMenuName")));
  const rows = [...m.querySelectorAll("button[role=menuitem]")].map((b) => b.id);
  ok("the rows, in order: Copy tenant ID, Branding settings, Sign out", rows.join(",") === "copyTenantBtn,brandingBtn,signOutBtn", rows.join(","));
  ok("the reference-tenant badge stays beside the button, outside the menu", D.getElementById("cfdevBadge") && !m.contains(D.getElementById("cfdevBadge")) && D.getElementById("tenantBox").contains(D.getElementById("cfdevBadge")));
  ok("no ⚙ gear is injected when the row exists", !D.getElementById("selfhostGearBtn"));
  const css = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8");
  ok("the stylesheet dropped the Tools button rules", !/\.btn\.home-btn/.test(css));
  ok("and carries the account button and menu", /\.acct\{/.test(css) && /\.acct-menu\{position:fixed/.test(css) && /\.acct-menu-lbl/.test(css));
  ok("the narrow breakpoint no longer gives the tenant box its own row", !/\.tenant\{flex:1 1 100%/.test(css) && /\.acct-menu\{width:min\(280px/.test(css));
}

// =====================================================================
head("Signed in: the button fills, the menu opens and closes, Sign out clears it");
{
  const w = boot();
  const D = w.document;
  // the demo is a sign-in like any other, and needs no MSAL
  D.getElementById("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  ok("the tenant box shows", D.getElementById("tenantBox").style.display === "flex");
  ok("the initials are on the button", D.getElementById("avatar").textContent === "DM");
  ok("the menu names the tenant and the account", /Contoso/.test(D.getElementById("tenantName").textContent) && D.getElementById("tenantUser").textContent === "demo@contoso.onmicrosoft.com" && D.getElementById("acctMenuName").textContent === "Demo Mode");
  ok("the button's tooltip carries both", /Contoso[\s\S]*demo@contoso/.test(D.getElementById("acctBtn").title));
  ok("Copy tenant ID is offered when there is an id", D.getElementById("copyTenantBtn").style.display !== "none");
  const m = D.getElementById("acctMenu"), b = D.getElementById("acctBtn");
  b.click();
  ok("clicking the initials opens the menu", m.hidden === false && b.getAttribute("aria-expanded") === "true");
  b.click();
  ok("clicking again closes it", m.hidden === true && b.getAttribute("aria-expanded") === "false");
  b.click();
  D.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  ok("Escape closes it", m.hidden === true);
  b.click();
  await new Promise((r) => setTimeout(r, 5));
  D.body.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok("a click elsewhere closes it", m.hidden === true);
  b.click();
  D.getElementById("brandingBtn").click();
  ok("a row closes the menu", m.hidden === true);
  ok("Branding settings opened the dialog the gear used to", !!D.querySelector("#selfhostModal.open, .modal-bg.open"));
  // Copy tenant ID answers on its own row and keeps the menu until read
  w.navigator.clipboard = { writeText: async () => {} };
  b.click();
  D.getElementById("copyTenantBtn").click();
  await new Promise((r) => setTimeout(r, 5));
  ok("Copy tenant ID keeps the menu open and says so on the row", m.hidden === false && /copied/i.test(D.getElementById("copyTenantBtn").textContent));
  D.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  b.click();
  D.getElementById("signOutBtn").click();
  ok("Sign out hides the box and closes the menu", D.getElementById("tenantBox").style.display === "none" && m.hidden === true);
  ok("and lands on the sign-in screen", D.getElementById("screen-login").classList.contains("active"));
}

// =====================================================================
head("The shell loads where ENCA loads it");
{
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = (f) => html.indexOf(`href="css/${f}`), js = (f) => html.indexOf(`src="js/${f}`);
  ok("css/workspaces.css after app.css and before tool-layout.css", css("app.css") > 0 && css("app.css") < css("workspaces.css") && css("workspaces.css") < css("tool-layout.css"));
  ok("js/workspaces.js after accessibility.js and before tool-layout.js", js("accessibility.js") > 0 && js("accessibility.js") < js("workspaces.js") && js("workspaces.js") < js("tool-layout.js"));
  ok("no optional chaining in it (ENCA's eleven rewritten)", !/[\w)\]]\?\.[\w(\[]/.test(wsJs.replace(/\/\/.*$/gm, "").replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, "''")));
  const w = boot();
  w.eval(wsJs);
  ok("signed out there is no shell yet", !w.document.body.classList.contains("workspaces-shell") && !w.document.getElementById("wcRail"));
}

// =====================================================================
head("Signed in: the branded header");
{
  const w = await bootShell();
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("the body wears the shell, on workspace 01", D.body.classList.contains("workspaces-shell") && D.body.dataset.ws === "intune");
  ok("the mark and the product name are one brand inside the logo's link", $("logoHome").querySelector(".wc-brand") && $("logoHome").querySelector(".wc-brand").firstElementChild === $("brandLogo") && $("wcBrandName").textContent === "TUNO");
  ok("the context line says where you are", $("wcHeaderContext").textContent === "Intune / Workspace 01");
  ok("All tools sits in the header, with its icon", $("wcHeaderTools") && /All tools/.test($("wcHeaderTools").textContent) && $("wcHeaderTools").querySelector("svg"));
  ok("one workspace has no chip to switch with (slice 12 brings 02)", !$("wcWsChip"));
  const b = $("acctBtn");
  ok("the account button names the tenant before the initials (round 1, D2 B)", b.firstElementChild === $("wcAccountLabel") && b.lastElementChild === $("avatar") && $("wcAccountLabel").textContent === "Contoso B.V. · Demo");
  ok("and says so to a screen reader", b.getAttribute("aria-label") === "Contoso B.V. · Demo — account options");
  const rows = [...$("acctMenu").querySelectorAll("[role=menuitem]")].map((x) => x.id);
  ok("the menu gains Theme and Close all tools before Sign out", rows.join(",") === "copyTenantBtn,brandingBtn,themeBtn,wcCloseAll,signOutBtn", rows.join(","));
  ok("the theme button moved into the menu, labelled", $("acctMenu").contains($("themeBtn")) && /Theme/.test($("themeBtn").textContent));
  ok("the menu ends with what this session is", $("wcSessionNote").textContent === "Demo · changes are simulated");
}

// =====================================================================
head("The rail: Home, seven tools in work order, All tools, Help (round 1, D1 A)");
{
  const w = await bootShell();
  const D = w.document, $ = (id) => D.getElementById(id);
  const rail = $("wcRail");
  const items = [...rail.querySelectorAll("button")].map((x) => (x.dataset.wcTool || (x.hasAttribute("data-wc-home") ? "home" : x.hasAttribute("data-wc-library") ? "library" : "?")) + ":" + x.querySelector("small").textContent);
  ok("in this order", items.join(",") === "home:Home,toolOverview:Policies,toolGroupUse:Groups,toolDevice:Devices,toolPosture:Posture,toolAssignEdit:Assign,toolWinBaseline:Baseline,toolAppLocker:AppLocker,library:All tools,toolHelp:Help", items.join(","));
  ok("every entry is a line icon and a word", [...rail.querySelectorAll("button")].every((x) => x.querySelector("span > svg.enca-icon") && x.querySelector("small")));
  ok("the caption names the workspace", /WORKSPACE\s*01 · Intune/.test(rail.querySelector(".wc-rail-caption").textContent));
  ok("on Home, Home is the current entry", $("wcHomeButton").classList.contains("active") && $("wcHomeButton").getAttribute("aria-current") === "page");
  rail.querySelector('[data-wc-tool="toolOverview"]').click();
  await tick(30);
  ok("a shortcut opens its tool through the tile's own route", $("screen-overview").classList.contains("active"));
  ok("and becomes the current entry, Home no longer", rail.querySelector('[data-wc-tool="toolOverview"]').classList.contains("active") && !$("wcHomeButton").classList.contains("active"));
  const tab = D.querySelector('#toolNav .toolnav-tab [data-nav="toolOverview"]');
  ok("its tab wears the tool's icon and its name, without the emoji", tab && tab.querySelector("svg.enca-icon") && tab.querySelector("span").textContent === "Policy overview" && !/🗂/.test(tab.textContent));
  const ov = D.querySelector("#toolNav [data-navhome]");
  ok("the strip starts with Overview", ov && /Overview/.test(ov.textContent) && ov.querySelector("svg"));
  rail.querySelector("[data-wc-home]").click();
  await tick(30);
  ok("Home goes home", $("screen-home").classList.contains("active") && $("wcHomeButton").classList.contains("active"));
}

// =====================================================================
head("All tools opens the library");
{
  const w = await bootShell();
  const D = w.document, $ = (id) => D.getElementById(id);
  $("wcHeaderTools").click();
  await tick(10);
  ok("the library opens", $("wcLauncher").open === true);
  ok("every tool is in it, grouped as on Home", D.querySelectorAll("#wcTools .wc-tool").length === 31 && D.querySelectorAll("#wcTools section > h3").length === 6, String(D.querySelectorAll("#wcTools .wc-tool").length));
  ok("each card says what the tool does, in a line", [...D.querySelectorAll("#wcTools .wc-tool")].every((c) => c.querySelector("strong").textContent && c.querySelector("strong + span").textContent.length > 10));
  ok("a group keeps its section's icon", D.querySelector('#wcTools h3[data-icon="key"]') !== null);
  const s = $("wcSearch");
  s.value = "T18"; s.dispatchEvent(new w.Event("input"));
  ok("a T-number finds its tool", D.querySelectorAll("#wcTools .wc-tool").length === 1 && /Windows LAPS audit/.test(D.querySelector("#wcTools .wc-tool").textContent) && /1 tools · Workspace 01/.test($("wcResultCount").textContent));
  s.value = "nothing like this"; s.dispatchEvent(new w.Event("input"));
  ok("and nothing says so", /No tools match/.test($("wcTools").textContent));
  s.value = "laps"; s.dispatchEvent(new w.Event("input"));
  D.querySelector("#wcTools .wc-tool").click();
  await tick(30);
  ok("a card opens its tool and closes the library", $("screen-laps").classList.contains("active") && $("wcLauncher").open === false);
  ok("Close all tools in the menu closes the strip", (() => { $("wcCloseAll").click(); return !D.querySelector("#toolNav [data-close]"); })());
}

// =====================================================================
head("Signing out takes the shell down with the session");
{
  const w = await bootShell();
  const D = w.document, $ = (id) => D.getElementById(id);
  $("acctBtn").click();
  $("signOutBtn").click();
  await tick(30);
  ok("no session, no navigation (the stylesheet hides it without with-side)", !D.body.classList.contains("with-side") && $("screen-login").classList.contains("active"));
  ok("the theme button is back in the header", $("themeBtn").parentElement === D.querySelector("header .hwrap"));
}

// =====================================================================
head("The stylesheet");
{
  const css = fs.readFileSync(path.join(ROOT, "css/workspaces.css"), "utf8");
  const tl = fs.readFileSync(path.join(ROOT, "css/tool-layout.css"), "utf8");
  ok("an 88 px rail, the sidebar hidden under the shell", /--wc-rail-width:88px/.test(css) && /body\.workspaces-shell #sideNav\{display:none!important\}/.test(css));
  ok("the mark hangs over the header on a 60 px medallion (ENCA 25494)", /#brandLogo\{position:absolute;z-index:1;left:calc\(var\(--wc-rail-width\) \/ 2 - 30px\);bottom:-30px;box-sizing:border-box;width:60px;height:60px;/.test(css));
  ok("showing the mark's inner disc, light, dark and BETA (round 1's crop)", ["logo-medallion-light.svg", "logo-medallion-light-beta.svg", "logo-medallion-dark.svg", "logo-medallion-dark-beta.svg"].every((f) => css.indexOf(f) >= 0 && fs.existsSync(path.join(ROOT, "assets", f))));
  ok("under 700 px the rail is a bottom bar of Home, Policies, Groups, Devices, Assign and All tools", /#wcRail\{position:fixed;top:auto;bottom:0;width:100%;height:62px/.test(css)
    && /#wcRail \[data-wc-tool="toolPosture"\],#wcRail \[data-wc-tool="toolWinBaseline"\],#wcRail \[data-wc-tool="toolAppLocker"\],#wcRail \[data-wc-tool="toolHelp"\]\{display:none\}/.test(css));
  ok("no navigation before sign-in", /body\.workspaces-shell:not\(\.with-side\) #wcRail/.test(css));
  ok("the Assignment editor's selection pill clears the rail, not the old sidebar", /body\.workspaces-shell \.ae-selbar,body\.workspaces-shell\.with-side\.side-min \.ae-selbar\{left:calc\(var\(--wc-rail-width\) \+ 24px\);right:24px\}/.test(css));
  ok("the tool head is flat under the shell (ENCA's tool-layout rules)", /body\.workspaces-shell \.screen\.tool > \.wc-tool-head\{\s*background:transparent;border:0;/.test(tl));
  ok("Home's tile grid is not hidden yet (slice 8 replaces it)", !/#screen-home>:not\(#wcHome\)/.test(css));
}

});

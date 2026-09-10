// ======================================================================
// The header (10607 — ENCA's 25258/25259 ported): the account button is
// the initials circle alone; tenant, signed-in user, Copy tenant ID,
// Branding settings and Sign out live in its menu; the Tools button is
// gone because the tab bar carries the home icon.
//
// Run with `npm test`, or alone:  node tests/shell/header.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("header");

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

});

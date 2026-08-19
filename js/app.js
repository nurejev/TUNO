// ======================================================================
// App wiring — the TUNO shell, built as ENCA's sister: same layout, same
// branding mechanism, same sign-in model, same screen/history behaviour.
// Kept deliberately small: tools live in their own files (js/applocker.js);
// this file owns branding, theme, auth, navigation, changelog and Help.
// ======================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  let signedIn = false;

  // ---------- sticky stack: measured, not assumed (ENCA pattern) ----------
  function syncStickyTops() {
    const h = document.querySelector("header");
    const n = $("toolNav");
    const hh = h ? Math.round(h.getBoundingClientRect().height) : 58;
    const navVisible = n && n.style.display !== "none" && n.offsetParent !== null;
    const nh = navVisible ? Math.round(n.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--sticky-header", hh + "px");
    document.documentElement.style.setProperty("--sticky-nav", (hh + nh) + "px");
  }
  window.addEventListener("resize", syncStickyTops);
  syncStickyTops();

  // ---------- screens + browser history ----------
  const HISTORY_SCREENS = new Set(["screen-home", "screen-applocker", "screen-changelog", "screen-roadmap", "screen-help"]);
  let navSuppress = false;
  const screenScroll = {};
  let shownScreen = null;
  function show(id) {
    if (shownScreen && shownScreen !== id) screenScroll[shownScreen] = window.scrollY;
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
    (window.requestAnimationFrame || setTimeout)(syncStickyTops);
    if (shownScreen !== id) {
      const y = screenScroll[id] || 0;
      (window.requestAnimationFrame || setTimeout)(() => window.scrollTo(0, y));
    }
    shownScreen = id;
    if (navSuppress || !HISTORY_SCREENS.has(id)) return;
    if (history.state && history.state.screen === id) return;
    try { history.pushState({ screen: id }, "", location.pathname + location.search); }
    catch { /* file:// or a sandboxed frame refuses pushState — navigation still works */ }
  }
  window.addEventListener("popstate", (e) => {
    const target = (e.state && e.state.screen) || (signedIn ? "screen-home" : null);
    if (!target) return;
    navSuppress = true;
    try { show(target); } finally { navSuppress = false; }
  });

  // ---------- build stamp ----------
  (function showBuild() {
    if (typeof APP_BUILD === "undefined") return;
    const stamp = $("buildStamp"), foot = $("buildStampFoot");
    if (stamp) {
      stamp.textContent = APP_BUILD.stamp || `${APP_BUILD.label} · ${APP_BUILD.date}`;
      if (APP_BUILD.releasedUtc) {
        stamp.title = `Released ${APP_BUILD.releasedUtc}`
          + (APP_BUILD.timeZone ? ` — shown in your local time (${APP_BUILD.timeZone})` : " — shown in your local time")
          + ". Build number matches the asset version; if this is not the version you pushed, hard-refresh.";
      }
    }
    if (foot) {
      foot.textContent = APP_BUILD.label;
      foot.style.cursor = "pointer";
      foot.title = "See what's new";
      foot.addEventListener("click", () => { if (signedIn) openChangelog(); });
    }
    const toolNo = (t) => (t && t.t) ? `T${String(t.t).padStart(2, "0")}` : "";
    if (typeof TOOL_VERSIONS !== "undefined") {
      for (const [id, t] of Object.entries(TOOL_VERSIONS)) {
        const tile = $(id);
        if (!tile || tile.querySelector(".tool-ver")) continue;
        const tag = document.createElement("span");
        tag.className = "tool-ver";
        tag.textContent = `${toolNo(t)}${toolNo(t) ? " · " : ""}v${t.v}`;
        tag.title = `${toolNo(t) ? `${toolNo(t)} — this tool's permanent number, assigned in the order it entered ${BRANDING.name} and never reused.\n\n` : ""}${t.note ? `${t.note}\n\n` : ""}App build ${APP_BUILD.label}`;
        tile.appendChild(tag);
      }
    }
    console.info(`${BRANDING.name} ${APP_BUILD.full}`);
  })();

  // ---------- branding ----------
  let appliedBrandColors = [];
  function applyBranding(B) {
    if (!B) return;
    Brand.setActive(B);
    const set = (id, fn) => { const el = $(id); if (el) fn(el); };
    document.title = Brand.pageTitle;
    set("favicon", (el) => { if (B.favicon) el.href = B.favicon; });
    ["brandLogo", "brandLogoLogin"].forEach((id) => set(id, (el) => { if (B.logo) el.src = B.logo; el.alt = B.org || B.name; }));
    set("brandOrg", (el) => {
      const org = B.org || "";
      const tail = B.orgSplit && org.endsWith(B.orgSplit) ? B.orgSplit : "";
      el.innerHTML = tail ? `${esc(org.slice(0, org.length - tail.length))}<span>${esc(tail)}</span>` : esc(org);
    });
    set("brandTag", (el) => { el.textContent = B.name; });
    set("brandHost", (el) => { el.textContent = B.host || ""; el.style.display = B.host ? "" : "none"; });
    set("brandLoginTitle", (el) => { el.textContent = B.loginTitle || Brand.title; });
    set("brandLoginBlurb", (el) => { if (B.loginBlurb) el.textContent = B.loginBlurb; });
    set("brandFoot", (el) => { el.textContent = [B.copyright, B.name].filter(Boolean).join(" · "); });
    set("brandOrgLink", (el) => {
      if (!B.orgUrl) { el.style.display = "none"; return; }
      el.href = B.orgUrl;
      el.textContent = B.orgUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    });
    appliedBrandColors.forEach((k) => document.documentElement.style.removeProperty(k));
    appliedBrandColors = [];
    Object.entries(B.colors || {}).forEach(([k, v]) => {
      if (k.startsWith("--") && v) { document.documentElement.style.setProperty(k, v); appliedBrandColors.push(k); }
    });
  }
  applyBranding(BRANDING);

  // ---------- beta / preview ribbon ----------
  // The production deployment lives on BRANDING.host; any other origin (the
  // beta Pages site, a local dev server) is visibly not production.
  (function markNonProduction() {
    try {
      const prod = (BRANDING.host || "").toLowerCase();
      const here = location.hostname.toLowerCase();
      if (!prod || !here || here === prod) return;
      const r = document.createElement("div");
      r.textContent = "⚠ BETA — not production";
      r.style.cssText = "position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9999;" +
        "background:#b04a3a;color:#fff;font:800 13px/1 Inter,system-ui,sans-serif;padding:7px 22px;" +
        "border-radius:0 0 10px 10px;letter-spacing:.5px;box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none;white-space:nowrap";
      document.body.appendChild(r);
      document.title = "[BETA] " + document.title;
    } catch { /* cosmetic only */ }
  })();
  const isProduction = () => { try { return location.hostname.toLowerCase() === (BRANDING.host || "").toLowerCase(); } catch { return true; } };

  // ---------- theme ----------
  const THEME_KEY = "tuno-theme";
  const THEMES = [
    { id: "auto", ico: "🌗", label: "Auto (follows your device)" },
    { id: "light", ico: "☀️", label: "Light" },
    { id: "dark", ico: "🌙", label: "Dark" },
  ];
  function applyTheme(id) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    if (t.id === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t.id);
    const btn = $("themeBtn");
    if (btn) { btn.querySelector(".tico").textContent = t.ico; btn.title = `Theme: ${t.label}`; }
    try { t.id === "auto" ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, t.id); } catch { /* private mode */ }
    return t.id;
  }
  let theme = applyTheme((() => { try { return localStorage.getItem(THEME_KEY) || "auto"; } catch { return "auto"; } })());
  $("themeBtn").addEventListener("click", () => {
    theme = applyTheme(THEMES[(THEMES.findIndex((t) => t.id === theme) + 1) % THEMES.length].id);
  });

  // ---------- auth (MSAL, popup with redirect fallback — ENCA's model) ----------
  let msalApp = null, account = null;
  const authReady = () => !!(AUTH_CONFIG.clientId && /^[0-9a-f-]{36}$/i.test(AUTH_CONFIG.clientId));
  function authInit() {
    if (!authReady()) return Promise.resolve(false);
    // NOTHING in here may take the shell down: MSAL's constructor throws
    // SYNCHRONOUSLY in an environment without WebCrypto (old browser, some
    // embedded webviews), and an exception escaping this IIFE would kill the
    // navigation wiring and the tools with it. Degrade to a sign-in error.
    try { return authInitInner(); }
    catch (e) { console.error("MSAL init failed:", e); msalApp = null; return Promise.resolve(false); }
  }
  function authInitInner() {
    msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: AUTH_CONFIG.clientId,
        authority: AUTH_CONFIG.authority,
        redirectUri: window.location.origin + window.location.pathname,
        clientCapabilities: ["cp1"],
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    return msalApp.initialize()
      .then(() => msalApp.handleRedirectPromise())
      .then((res) => {
        if (res && res.account) { account = res.account; return true; }
        return false;
      })
      .catch((e) => { console.error("Redirect sign-in did not complete:", e); return false; });
  }
  function loginErr(msg) {
    const el = $("loginErr");
    el.style.display = "";
    el.textContent = msg;
  }
  async function signIn(useRedirect) {
    if (!authReady()) {
      loginErr("No app registration configured yet for this TUNO deployment — run New-TunoAppRegistration.ps1 and paste the Application (client) ID into js/authConfig.js (or js/authConfig.local.js).");
      return;
    }
    if (!msalApp) {
      loginErr("Sign-in is unavailable in this browser (MSAL could not initialize — usually a missing WebCrypto). Use a current browser over https.");
      return;
    }
    try {
      if (useRedirect) { await msalApp.loginRedirect({ scopes: AUTH_CONFIG.scopes, prompt: "select_account" }); return; }
      const res = await msalApp.loginPopup({ scopes: AUTH_CONFIG.scopes, prompt: "select_account" });
      account = res.account;
      enter();
    } catch (e) {
      loginErr("Sign-in failed: " + (e && e.message ? e.message : e));
    }
  }
  function enter() {
    signedIn = true;
    $("tenantName").textContent = (account && (account.tenantId ? account.username.split("@")[1] : "")) || "";
    $("tenantUser").textContent = account ? account.username : "";
    const nm = account && (account.name || account.username) || "?";
    $("avatar").textContent = nm.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
    $("tenantBox").classList.add("on");
    $("homeBtn").style.display = "";
    buildToolNav();
    show("screen-home");
  }
  $("signInBtn").addEventListener("click", () => signIn(false));
  $("noPopupLink").addEventListener("click", (e) => { e.preventDefault(); signIn(true); });
  $("signOutBtn").addEventListener("click", () => {
    const acc = account;
    account = null; signedIn = false;
    $("tenantBox").classList.remove("on");
    $("homeBtn").style.display = "none";
    $("toolNav").style.display = "none";
    show("screen-login");
    if (msalApp && acc) msalApp.logoutPopup({ account: acc }).catch(() => {});
  });
  authInit().then((cameBack) => { if (cameBack) enter(); });

  // ---------- tool tab bar (ENCA's browser-style tabs, ported verbatim) ----------
  // The tools, in home-grid order. Each carries the exact crumb string its tile
  // handler sets, so the active tab can be matched from crumb() regardless of
  // whether the tool was opened from the grid or a tab.
  const TOOL_TABS = [
    ["toolAppLocker", "🔐 AppLocker builder & validator"],
  ];
  // The app's own pages are tools too, but always sit last (after the +).
  TOOL_TABS.push(["toolChangelog", "📋 What's new"]);
  TOOL_TABS.push(["toolRoadmap", "🗺 Roadmap"]);
  TOOL_TABS.push(["toolHelp", "❓ Help"]);
  // Browser-style tabs: a tab exists only for a tool you have opened. Home shows
  // no tabs; opening a tool (from the grid or the + menu) adds one; the + opens
  // another. openTabs is the ordered set of open tool ids.
  let openTabs = [], activeTab = null;
  const labelFor = (id) => (TOOL_TABS.find((x) => x[0] === id) || [, id])[1];
  const idForCrumb = (name) => (TOOL_TABS.find((x) => x[1] === name) || [])[0] || null;

  function renderTabs() {
    const home = `<button class="toolnav-btn home ${activeTab ? "" : "active"}" data-navhome title="All tools" aria-label="All tools">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 10.6 12 3.2l9 7.4"/><path d="M5.2 9.4V20.4h13.6V9.4"/><path d="M9.6 20.4v-6.2h4.8v6.2"/>
      </svg></button>`;
    const tabs = openTabs.map((id) =>
      `<span class="toolnav-tab ${id === activeTab ? "active" : ""}">
        <button class="toolnav-btn" data-nav="${id}">${esc(labelFor(id))}</button>
        <button class="toolnav-x" data-close="${id}" title="Close tab">×</button>
      </span>`).join("");
    const add = `<button class="toolnav-btn add" data-navadd title="Open a tool in a new tab">＋</button>`;
    const help = `<button class="toolnav-btn help" data-navhelp title="How each tool works">❓ Help</button>`;
    // "close all" appears only when there's more than one tab to close at once
    const closeAll = openTabs.length > 1 ? `<button class="toolnav-btn closeall" data-navcloseall title="Close all tabs">✕ all</button>` : "";
    $("toolNav").innerHTML = `<div class="toolnav-inner">${home}${tabs}${add}${closeAll}${help}</div>`;
    // the bar only appears once a tool is open (empty at the tools home)
    $("toolNav").style.display = openTabs.length ? "block" : "none";
    syncStickyTops();
    // keep the tab you're on visible when the strip overflows
    const act = $("toolNav").querySelector(".toolnav-tab.active, .toolnav-btn.home.active");
    if (act && act.scrollIntoView) act.scrollIntoView({ inline: "nearest", block: "nearest" });
  }
  function buildToolNav() { openTabs = []; activeTab = null; renderTabs(); }

  function closeTab(id) {
    const i = openTabs.indexOf(id);
    if (i < 0) return;
    openTabs.splice(i, 1);
    if (activeTab === id) {
      const next = openTabs[i] || openTabs[i - 1] || null;   // neighbour, else last
      if (next) { $(next).click(); }                          // switch to it
      else { crumb(""); show("screen-home"); }
    } else { renderTabs(); }
  }

  // The + menu: pick any tool to open in a new tab.
  function openAddMenu(anchor) {
    closeAddMenu();
    const menu = document.createElement("div");
    menu.className = "toolnav-menu"; menu.id = "toolAddMenu";
    menu.innerHTML = TOOL_TABS.map(([id, label]) =>
      `<button data-nav="${id}" class="${openTabs.includes(id) ? "open" : ""}">${esc(label)}${openTabs.includes(id) ? " <span class='mini'>· open</span>" : ""}</button>`).join("");
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${Math.min(r.left, window.innerWidth - 280)}px`;
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-nav]"); if (!b) return;
      closeAddMenu(); $(b.dataset.nav).click();
    });
    setTimeout(() => document.addEventListener("click", closeAddMenu, { once: true }), 0);
  }
  function closeAddMenu() { const m = $("toolAddMenu"); if (m) m.remove(); }

  $("toolNav").addEventListener("click", (e) => {
    if (e.target.closest("[data-navhelp]")) { openHelp(); return; }
    if (e.target.closest("[data-navcloseall]")) { openTabs = []; activeTab = null; renderTabs(); show("screen-home"); return; }
    if (e.target.closest("[data-navhome]")) { crumb(""); show("screen-home"); return; }
    if (e.target.closest("[data-navadd]")) { openAddMenu(e.target.closest("[data-navadd]")); return; }
    const x = e.target.closest("[data-close]"); if (x) { e.stopPropagation(); closeTab(x.dataset.close); return; }
    const b = e.target.closest("[data-nav]");
    if (b) $(b.dataset.nav).click();   // reuse the tile's own handler (crumb, screen, setup)
  });

  // crumb(name) is called by every tool on entry: it registers/activates the tab.
  function crumb(name) {
    const id = name ? idForCrumb(name) : null;
    if (id) { if (!openTabs.includes(id)) openTabs.push(id); activeTab = id; }
    else { activeTab = null; }
    renderTabs();
  }
  $("homeBtn").addEventListener("click", () => { crumb(""); show("screen-home"); });
  // logo returns to the tools overview when signed in (does nothing on login)
  $("logoHome").addEventListener("click", () => { if (signedIn) { crumb(""); show("screen-home"); } });
  $("toolAppLocker").addEventListener("click", () => { crumb("🔐 AppLocker builder & validator"); show("screen-applocker"); });
  $("toolChangelog").addEventListener("click", () => openChangelog());
  $("toolRoadmap").addEventListener("click", () => { crumb("🗺 Roadmap"); show("screen-roadmap"); });
  $("toolHelp").addEventListener("click", () => openHelp());
  $("homeCount").textContent = `${Object.keys(TOOL_VERSIONS).length} tool${Object.keys(TOOL_VERSIONS).length === 1 ? "" : "s"}`;

  // ---------- changelog ----------
  const CL_KIND = { new: "New", improved: "Improved", fixed: "Fixed" };
  function clRelease(rel) {
    const order = { new: 0, improved: 1, fixed: 2 };
    const items = rel.items.slice().sort((a, b) => order[a.kind] - order[b.kind])
      .map((i) => `<li class="cl-i"><span class="cl-k ${i.kind}">${CL_KIND[i.kind]}</span><span><b>${esc(i.tool)}</b> — ${esc(i.text)}</span></li>`).join("");
    return `<div class="cl-rel"><div class="cl-h"><b>${esc(rel.title)}</b><span class="mini muted">build ${rel.build} · ${esc(rel.date)}</span></div><ul class="cl-list">${items}</ul></div>`;
  }
  function openChangelog() {
    crumb("📋 What's new");
    show("screen-changelog");
    $("clBody").innerHTML = (typeof CHANGELOG !== "undefined" ? CHANGELOG : []).map(clRelease).join("")
      || '<p class="mini">No changelog entries yet.</p>';
  }

  // ---------- help, incl. the promotion queue on non-production hosts ----------
  function openHelp() {
    crumb("❓ Help");
    show("screen-help");
    const box = $("helpPromote");
    if (!box) return;
    if (isProduction() || typeof PROMOTE === "undefined") { box.style.display = "none"; return; }
    box.style.display = "";
    const items = (PROMOTE.items || []).map((it) => `
      <tr><td><b>${it.n}</b></td><td>${esc(it.title)}<div class="mini muted">${esc((it.tools || []).join(", "))} · builds ${esc((it.builds || []).join(", "))}</div></td>
      <td><span class="sev ${it.risk === "high" ? "high" : it.risk === "medium" ? "medium" : "low"}">${esc(it.risk)}</span></td>
      <td class="mini">${esc(it.what)}<br><i>${esc(it.why)}</i></td></tr>`).join("");
    const staying = (PROMOTE.staying || []).map((s) => `<li class="mini"><b>${esc(s.title)}</b> — ${esc(s.why)}</li>`).join("");
    box.innerHTML = `<h3>🚚 Waiting for production <span class="mini muted">production is at ${esc(PROMOTE.productionBuild)} · this site runs ${esc(APP_BUILD.label)}</span></h3>
      <p class="mini muted">Hand-maintained (the app cannot read git) — if this table and js/changelog.js disagree, trust the changelog and the build numbers. Promoting an item is four steps; see the js/promote.js header.</p>
      ${items ? `<table class="plist"><thead><tr><th>#</th><th>What</th><th>Risk</th><th>Detail</th></tr></thead><tbody>${items}</tbody></table>` : '<p class="mini">The queue is empty — this channel and production match.</p>'}
      ${staying ? `<p class="mini" style="margin:10px 0 4px"><b>Deliberately staying on beta:</b></p><ul>${staying}</ul>` : ""}`;
  }

  // ---------- tools ----------
  if (typeof AppLockerTool !== "undefined") AppLockerTool.init();
})();

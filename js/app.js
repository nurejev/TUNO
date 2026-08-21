// ======================================================================
// App wiring — the TUNO shell, built as ENCA's sister: same layout, same
// branding mechanism, same sign-in model, same screen/history behaviour.
// Kept deliberately small: tools live in their own files (js/applocker.js);
// this file owns branding, theme, auth, navigation, changelog and Help.
// ======================================================================
// ======================================================================
// Fs — the near-fullscreen popout. Ported verbatim from ENCA.
//
// It MOVES the element into the panel and moves it back on close; it does
// not clone. A clone looks identical and does nothing, because every handler
// stays bound to the original — and the bug that produces is the worst kind,
// since the thing on screen is visibly correct.
//
// Two consequences worth knowing before using it:
//   * Park a STABLE element. A tool that re-renders by writing innerHTML into
//     a card can park that card safely — the element survives, only its
//     contents change, wherever it currently lives. Parking something the
//     renderer REPLACES leaves the marker comment in a destroyed subtree and
//     close() has nowhere to put it back.
//   * Sticky positioning is forced to static while parked, because a toolbar
//     that sticks to the page cannot stick inside a panel.
// ======================================================================
const Fs = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let open = false, slots = [];
  function park(el, host) {
    if (!el) return;
    const mark = document.createComment("fs");
    el.parentNode.insertBefore(mark, el);
    slots.push({ el, mark, sticky: el.style.position });
    el.style.position = "static";
    host.appendChild(el);
  }
  return {
    isOpen: () => open,
    open(title, { controls, body, onChange } = {}) {
      if (open) this.close();
      $("fsTitle").textContent = title;
      park(controls, $("fsControls"));
      park(body, $("fsBody"));
      $("fsModal").classList.add("show");
      document.body.style.overflow = "hidden";
      open = true; this._onChange = onChange;
      onChange && onChange(true);
    },
    close() {
      if (!open) return;
      slots.reverse().forEach(({ el, mark, sticky }) => {
        el.style.position = sticky || "";
        mark.parentNode.insertBefore(el, mark);
        mark.remove();
      });
      slots = [];
      $("fsModal").classList.remove("show");
      document.body.style.overflow = "";
      open = false;
      const cb = this._onChange; this._onChange = null;
      cb && cb(false);
    },
  };
})();

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
  const HISTORY_SCREENS = new Set(["screen-home", "screen-applocker", "screen-groupuse", "screen-whatif", "screen-health", "screen-setsearch", "screen-assignedit", "screen-device", "screen-roles", "screen-audit", "screen-backup", "screen-docs", "screen-changelog", "screen-roadmap", "screen-help"]);
  // Screens that get the wide shell.
  //
  // EMPTY ON PURPOSE (build 10321). Both tools used to opt in — T01 for its
  // audit-table-plus-code split, T02 for a five-column assignment table. The
  // result was that a tool screen jumped to 1680px while the tools home,
  // Help, What's new and the Roadmap all stayed at 1180, so moving between
  // them made the whole app appear to change size. One column width for
  // everything reads as one application; two reads as a bug.
  //
  // The mechanism stays because it costs nothing and the judgement may go the
  // other way on a future tool: add a screen id here and `show()` puts
  // `body.wide` on, which the stylesheet already understands. It is an unused
  // capability rather than dead code — but if it is still empty several builds
  // from now, delete it and the CSS with it.
  const WIDE_SCREENS = new Set([]);
  let navSuppress = false;
  const screenScroll = {};
  let shownScreen = null;
  function show(id) {
    if (shownScreen && shownScreen !== id) screenScroll[shownScreen] = window.scrollY;
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
    // Widens the SHELL rather than a split, so every card on the screen shares
    // one width. Nothing opts in as of 10321 — see WIDE_SCREENS above — so this
    // removes the class rather than adding it, which is what makes leaving a
    // once-wide screen narrow again.
    document.body.classList.toggle("wide", WIDE_SCREENS.has(id));
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
    // The mark is the PRODUCT's (TUNO office logo), not the org's — alt follows.
    ["brandLogo", "brandLogoLogin"].forEach((id) => set(id, (el) => { if (B.logo) el.src = B.logo; el.alt = B.name || B.org; }));
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
    // js/graph.js reaches MSAL through this rather than through the closure,
    // so a build without it (or with sign-in degraded) still loads.
    if (typeof Graph !== "undefined") Graph.useProvider({ getApp: () => msalApp, getAccount: () => account });
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
    openWhatsNewOverlay();
  }
  // Dismiss marks it seen; "Read the full list" hands over to the page, which
  // marks it seen itself. Escape and the backdrop close WITHOUT marking, so a
  // stray click does not lose the one showing you never got.
  const wn = $("whatsNew");
  if (wn) {
    wn.addEventListener("click", (e) => {
      if (e.target.closest("[data-wn-dismiss]")) { closeWhatsNew(true); return; }
      if (e.target.closest("[data-wn-open]")) { closeWhatsNew(false); openChangelog(); return; }
      if (e.target === wn) closeWhatsNew(false);           // backdrop
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && wn.style.display !== "none") closeWhatsNew(false);
    });
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
    ["toolGroupUse", "🔗 Group Analyzer"],
    ["toolWhatIf", "🔮 Assignment what-if"],
    ["toolHealth", "🩺 Assignment health"],
    ["toolAssignEdit", "✏️ Assignment editor"],
    ["toolDevice", "🖥 Device analyzer"],
    ["toolAudit", "🕓 Change audit"],
    ["toolBackup", "📦 Backup configuration"],
    ["toolDocs", "📄 Configuration documenter"],
    ["toolSetSearch", "🔦 Settings search"],
    ["toolRoles", "🛡 Role assignments"],
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
  $("toolGroupUse").addEventListener("click", () => { crumb("🔗 Group Analyzer"); show("screen-groupuse"); });
  $("toolAudit").addEventListener("click", () => { crumb("🕓 Change audit"); show("screen-audit"); });
  $("toolWhatIf").addEventListener("click", () => { crumb("🔮 Assignment what-if"); show("screen-whatif"); });
  $("toolHealth").addEventListener("click", () => { crumb("🩺 Assignment health"); show("screen-health"); });
  $("toolSetSearch").addEventListener("click", () => { crumb("🔦 Settings search"); show("screen-setsearch"); });
  $("toolAssignEdit").addEventListener("click", () => { crumb("✏️ Assignment editor"); show("screen-assignedit"); });
  $("toolDevice").addEventListener("click", () => { crumb("🖥 Device analyzer"); show("screen-device"); });
  $("toolRoles").addEventListener("click", () => { crumb("🛡 Role assignments"); show("screen-roles"); });
  $("toolBackup").addEventListener("click", () => { crumb("📦 Backup configuration"); show("screen-backup"); });
  $("toolDocs").addEventListener("click", () => { crumb("📄 Configuration documenter"); show("screen-docs"); });
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
    markChangelogSeen();
  }

  // ---------- "What's new" on sign-in ----------
  //
  // js/changelog.js has described itself as the source for "the What's new
  // overlay shown after sign-in" since TUNO was scaffolded from ENCA. There was
  // no overlay — the text came across with the file and the feature did not.
  //
  // The rules it follows:
  //   * Only what you have NOT seen. It lists the releases newer than the build
  //     recorded when you last looked, not the whole changelog.
  //   * NOTHING on a first visit. A new user does not need forty builds of
  //     history in front of the tools; the current build is recorded silently
  //     and the overlay starts working from the next release.
  //   * Reading the What's new page counts as seeing it, so the overlay does
  //     not reappear over something you just read.
  //   * localStorage, guarded — private mode throws, and a browser that cannot
  //     remember should show the overlay once per session rather than break.
  const CL_SEEN_KEY = "tuno.changelog.seen";
  const clSeen = () => { try { return Number(localStorage.getItem(CL_SEEN_KEY)) || 0; } catch { return 0; } };
  function markChangelogSeen() {
    try { localStorage.setItem(CL_SEEN_KEY, String(APP_BUILD.build)); } catch { /* private mode */ }
  }
  function unseenReleases() {
    if (typeof CHANGELOG === "undefined" || !CHANGELOG.length) return [];
    const since = clSeen();
    if (!since) { markChangelogSeen(); return []; }      // first visit — record, say nothing
    return CHANGELOG.filter((r) => r.build > since);
  }
  function openWhatsNewOverlay() {
    const rels = unseenReleases();
    const box = $("whatsNew");
    if (!box || !rels.length) return;
    const n = rels.reduce((t, r) => t + r.items.length, 0);
    $("whatsNewSub").textContent =
      `${n} change${n === 1 ? "" : "s"} across ${rels.length} build${rels.length === 1 ? "" : "s"}, since you last looked at build ${clSeen()}.`;
    $("whatsNewBody").innerHTML = rels.map(clRelease).join("");
    box.style.display = "";
    box.querySelector(".wn-card").focus();
  }
  function closeWhatsNew(seen) {
    const box = $("whatsNew");
    if (!box) return;
    box.style.display = "none";
    if (seen) markChangelogSeen();
  }
  // The overlay decides what to show from localStorage and the changelog, and
  // both are awkward to reach through MSAL. This is the seam the headless tests
  // drive; everything else about the app stays private to this closure.
  window.openWhatsNewOverlayForTest = openWhatsNewOverlay;

  // ---------- help, incl. the promotion queue on non-production hosts ----------
  function openHelp() {
    crumb("❓ Help");
    show("screen-help");
    const box = $("helpPromote");
    if (!box) return;
    if (isProduction() || typeof PROMOTE === "undefined") { box.style.display = "none"; return; }
    box.style.display = "";

    // Ported verbatim from ENCA's renderPromotionQueue: the table is read to
    // decide WHAT to promote (number, risk, builds), and each row carries its
    // own test checklist so a step can fail rather than be nodded through.
    const RISK = {
      high:   { label: "high",   cls: "block", note: "a real problem in production until it lands" },
      medium: { label: "medium", cls: "new",   note: "missing capability, nothing broken" },
      low:    { label: "low",    cls: "",      note: "convenience or documentation" },
    };
    const items = (PROMOTE.items || []).slice().sort((a, b) => a.n - b.n);

    box.innerHTML = `
      <h3>🚚 Waiting for production <span class="tag new">BETA CHANNEL</span></h3>
      <p>Production is <b>${esc(PROMOTE.productionBuild)}</b>; this site is <b>${esc(APP_BUILD.label)}</b>.
        <b>This is the gap, and only the gap</b> — what exists here and not there. Nothing that has already
        shipped appears below; for that, read <b>📋 What's new</b>. Each row is one promotable <b>change to the
        tools</b> with a <b>stable number</b>, so <i>“push number 3 to main”</i> means exactly one thing.
        Roadmap cards, changelog entries and this table itself are not listed: they describe the work rather
        than being it, and they travel with whatever promotion happens next.</p>
      <p class="mini muted" style="margin:-6px 0 10px"><b>Every row carries a test checklist.</b> <i>Why</i> says what the
        risk is and what would have to be true for the item to graduate; it does not say how to find out. The steps
        under <b>How to test it</b> do — each one names the tenant state it needs and the outcome you should see, so a
        step can fail rather than be nodded through. Where a check needs a tenant nobody has to hand, the step says
        so: knowing which check was skipped is worth more than a list that pretends all of them were run.</p>
      ${items.length ? `<div class="cg-tablewrap"><table class="cg-table">
        <thead><tr><th style="width:44px">#</th><th>Change</th><th style="width:90px">Risk</th><th style="width:120px">Beta builds</th></tr></thead>
        <tbody>${items.map((it) => {
          const r = RISK[it.risk] || RISK.low;
          const test = it.test || [];
          return `<tr>
            <td><b style="font-size:15px">${it.n}</b></td>
            <td><b>${esc(it.title)}</b>
              <div class="mini muted">${(it.tools || []).map(esc).join(" · ")}</div>
              <div class="mini" style="margin-top:4px">${esc(it.what)}</div>
              <div class="mini" style="margin-top:4px;color:var(--report)"><b>Why:</b> ${esc(it.why)}</div>
              ${test.length ? `<details class="pq-test"><summary class="mini"><b>How to test it</b> — ${test.length} step${test.length === 1 ? "" : "s"}</summary>
                <ol class="mini pq-steps">${test.map((t) => `<li>${esc(t)}</li>`).join("")}</ol></details>`
                : `<div class="mini" style="margin-top:4px;color:var(--off)"><b>How to test it:</b> not written — this item is not finished, and promoting it means promoting something nobody has said how to check.</div>`}
              <div class="mini muted" style="margin-top:4px">${(it.files || []).map((f) => `<code>${esc(f)}</code>`).join(" ")}</div></td>
            <td><span class="tag ${r.cls}">${r.label}</span><div class="mini muted" style="margin-top:4px">${r.note}</div></td>
            <td class="mini">${(it.builds || []).join(", ")}</td>
          </tr>`;
        }).join("")}</tbody></table></div>`
        : '<p class="mini">The queue is empty — this channel and production match.</p>'}
      ${(PROMOTE.staying || []).length ? `
        <h4 style="margin-top:18px">Staying on this channel</h4>
        <p class="mini muted" style="margin:0 0 6px">Also part of the gap, but permanently: these exist here and are not going to production.</p>
        <ul>${PROMOTE.staying.map((s) => `<li><b>${esc(s.title)}</b> — ${esc(s.why)}</li>`).join("")}</ul>` : ""}
      <p class="mini muted" style="margin-top:14px"><b>Promoting one of these is four steps, not one:</b> remove the row and bump the production build here; set the roadmap card on <b>main</b> to <code>live · build NNN</code>; set the <b>same card on this channel</b> to <code>live · beta NNNNN · production NNN</code>; and add the changelog entry on both. The third is the one that gets missed — each channel carries its own roadmap, so promoting touches main's copy and this one keeps claiming the work is beta-only.</p>
      <p class="help-x">This list is written by hand — the app is static files in a browser and cannot read git or diff two branches. It is maintained alongside <b>📋 What's new</b>; if an entry looks stale, trust the changelog and the build numbers over this table.</p>`;
  }

  // ---------- the popout ----------
  $("fsClose").addEventListener("click", () => Fs.close());
  $("fsModal").addEventListener("click", (e) => { if (e.target.id === "fsModal") Fs.close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && Fs.isOpen()) Fs.close(); });

  // ---------- tools ----------
  if (typeof AppLockerTool !== "undefined") AppLockerTool.init();
  if (typeof GroupUseTool !== "undefined") GroupUseTool.init();
  if (typeof AuditTool !== "undefined") AuditTool.init();
  if (typeof DeviceWhyTool !== "undefined") DeviceWhyTool.init();
  if (typeof WhatIfTool !== "undefined") WhatIfTool.init();
  if (typeof HealthTool !== "undefined") HealthTool.init();
  if (typeof SettingSearchTool !== "undefined") SettingSearchTool.init();
  if (typeof AssignEditTool !== "undefined") AssignEditTool.init();
  if (typeof RolesTool !== "undefined") RolesTool.init();
  if (typeof BackupTool !== "undefined") BackupTool.init();
  if (typeof DocsTool !== "undefined") DocsTool.init();
})();

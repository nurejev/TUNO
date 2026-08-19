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

  // ---------- navigation ----------
  const TOOL_SCREENS = { toolAppLocker: "screen-applocker", toolChangelog: "screen-changelog", toolRoadmap: "screen-roadmap", toolHelp: "screen-help" };
  function buildToolNav() {
    const nav = $("toolNav");
    nav.innerHTML = "";
    for (const [tileId, screen] of Object.entries(TOOL_SCREENS)) {
      const tile = $(tileId);
      if (!tile) continue;
      const h = tile.querySelector("h3");
      const b = document.createElement("button");
      b.textContent = h ? h.textContent.replace(/\s+/g, " ").trim() : tileId;
      b.addEventListener("click", () => tile.click());
      nav.appendChild(b);
    }
    nav.style.display = "";
    syncStickyTops();
  }
  for (const [tileId, screen] of Object.entries(TOOL_SCREENS)) {
    const tile = $(tileId);
    if (!tile) continue;
    tile.addEventListener("click", () => {
      if (screen === "screen-changelog") { openChangelog(); return; }
      if (screen === "screen-help") { openHelp(); return; }
      show(screen);
    });
  }
  $("homeBtn").addEventListener("click", () => show("screen-home"));
  $("logoHome").addEventListener("click", () => { if (signedIn) show("screen-home"); });
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
    show("screen-changelog");
    $("clBody").innerHTML = (typeof CHANGELOG !== "undefined" ? CHANGELOG : []).map(clRelease).join("")
      || '<p class="mini">No changelog entries yet.</p>';
  }

  // ---------- help, incl. the promotion queue on non-production hosts ----------
  function openHelp() {
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

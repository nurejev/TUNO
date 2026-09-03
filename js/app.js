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

  // ---------- tenant discovery (ENCA's, ported verbatim) ----------
  // Same list and same matching rules as ENCA's isBaselineTenant(): the
  // signed-in account's UPN domain against the tenant list — exact match, or a
  // subdomain of it, or the org display name carrying the first label. ENCA
  // calls these BASELINE_TENANTS because the CA baseline is built there; in
  // TUNO the same tenant unlocks the cfdev-only extras, so the name follows
  // the meaning here. A request marked "cfdev detect" is a feature gated on
  // this and nothing else.
  //
  // THE DIFFERENCE FROM ENCA IS CLOSED (build 10457): ENCA reads
  // /organization at sign-in and fills tenantName with the org's display
  // name, and now so does TUNO — readOrgAtSignIn() below, ported. The read
  // rides the SAME User.Read the sign-in already holds: Graph's own
  // permission table lists User.Read for GET /organization, answering
  // exactly id, displayName and verifiedDomains (everything else null),
  // which is precisely the three fields wanted. No new scope, no consent
  // popup — the token is the sign-in token, acquired silently, and a read
  // that fails leaves the UPN-domain header exactly as it was (ENCA's own
  // try/catch, ported with it). This wakes the org-name half of the cfdev
  // check, dormant since 10373, and gives every tool one place to get the
  // tenant's identity — TunoTenant.org() — instead of each paying its own
  // /organization read.
  let tenantName = "", tenantDomain = "";
  // Two entries because the tenant answers to two names: devcf.onmicrosoft.com
  // is what the sign-in UPN actually carries (the tenant's initial domain), and
  // cloudfellows.dev is the verified domain ENCA's list names — kept so a UPN
  // on the verified domain, or the org display name, still matches.
  const CFDEV_TENANTS = ["cloudfellows.dev", "devcf.onmicrosoft.com"];
  function isCfdevTenant() {
    const n = (tenantName || "").toLowerCase(), d = (tenantDomain || "").toLowerCase();
    return CFDEV_TENANTS.some((t) => d === t || d.endsWith("." + t) || n.includes(t.split(".")[0]));
  }
  // Tools live in their own files and gate cfdev-only features through this
  // seam rather than keeping a second copy of the list — the first time two
  // lists exist, one of them is wrong. The headless tests drive it too.
  // The org read at sign-in lands here — id, displayName, verifiedDomains,
  // the three fields User.Read answers. null until the read has answered
  // (or forever, if it could not), so a caller distinguishes "not read"
  // from "read and empty" the same way the tools distinguish unknown from
  // zero everywhere else.
  let orgInfo = null;
  window.TunoTenant = {
    isCfdev: isCfdevTenant,
    domain: () => tenantDomain,
    org: () => orgInfo,
    setOrgName: (n) => { tenantName = String(n || ""); },
    // for the headless tests only — the real values are set by enter()/sign out
    _setForTest: (d, n) => { tenantDomain = String(d || ""); tenantName = String(n || ""); },
  };

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
  const HISTORY_SCREENS = new Set(["screen-home", "screen-applocker", "screen-groupuse", "screen-whatif", "screen-health", "screen-setsearch", "screen-conflict", "screen-macbaseline", "screen-winbaseline", "screen-devicecleanup", "screen-compev", "screen-filters", "screen-assignedit", "screen-device", "screen-roles", "screen-audit", "screen-compliance", "screen-backup", "screen-overview", "screen-docs", "screen-changelog", "screen-roadmap", "screen-help"]);
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
    // Screen hooks (build 10520): a tool may warm-start from the shared
    // policy cache the moment its screen opens. Registered by the tool, not
    // hard-coded here, and a hook must never break navigation.
    const hook = window.TunoScreenHooks && window.TunoScreenHooks[id];
    if (hook) { try { hook(); } catch { /* the screen still shows */ } }
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
    // The version badge is on the home tile; it belongs on the tool's own
    // header too, which is where somebody actually is when they wonder what
    // changed — ENCA's stampHeadVersion, ported. The .tool-ver-head class has
    // sat in the stylesheet since the scaffold waiting for exactly this.
    // TUNO's header cards are static markup today, but heads MAY be
    // re-rendered by their tools, so observe rather than stamp once — the
    // stamped-already check is also what stops the observer looping.
    // ENCA maps head-element ids; TUNO's screens carry no head ids, so the
    // map is screen id -> tool id and the head is the first list-card's
    // heading — verified present for all nineteen at the time of the port.
    const SCREEN_TOOL = {
      "screen-applocker": "toolAppLocker", "screen-defender": "toolDefender",
      "screen-endpointsec": "toolEndpointSec", "screen-laps": "toolLaps",
      "screen-posture": "toolPosture", "screen-securescore": "toolSecureScore",
      "screen-groupuse": "toolGroupUse", "screen-audit": "toolAudit",
      "screen-compliance": "toolCompliance", "screen-whatif": "toolWhatIf",
      "screen-health": "toolHealth", "screen-setsearch": "toolSetSearch",
      "screen-conflict": "toolConflict", "screen-assignedit": "toolAssignEdit",
      "screen-macbaseline": "toolMacBaseline",
      "screen-winbaseline": "toolWinBaseline",
      "screen-devicecleanup": "toolDeviceCleanup",
      "screen-compev": "toolCompEv",
      "screen-device": "toolDevice", "screen-filters": "toolFilters",
      "screen-roles": "toolRoles", "screen-maa": "toolMaa",
      "screen-groupmigrate": "toolGroupMigrate",
      "screen-restrictedau": "toolRestrictedAu",
      "screen-backup": "toolBackup", "screen-overview": "toolOverview",
      "screen-docs": "toolDocs",
    };
    function stampHeadVersion(card, toolId) {
      const t = (typeof TOOL_VERSIONS !== "undefined" && TOOL_VERSIONS[toolId]) || null;
      if (!t || !t.v) return;
      const h = card.querySelector("h2, h3");
      if (!h || h.querySelector(".tool-ver-head")) return;   // also stops the observer looping
      const s = document.createElement("span");
      s.className = "tool-ver-head";
      s.textContent = `${toolNo(t)}${toolNo(t) ? " · " : ""}v${t.v}`;
      s.title = `${toolNo(t) ? `${toolNo(t)} — this tool's permanent number. It never changes and is never reused, so it means one thing across both channels, every build and any future language.\n\n` : ""}${t.note || ""}`.trim();
      h.appendChild(s);
    }
    Object.entries(SCREEN_TOOL).forEach(([sid, toolId]) => {
      const card = document.querySelector(`#${sid} .list-card`);
      if (!card) return;
      stampHeadVersion(card, toolId);
      new MutationObserver(() => stampHeadVersion(card, toolId)).observe(card, { childList: true, subtree: true });
    });
    console.info(`${BRANDING.name} ${APP_BUILD.full}`);
  })();

  // ---------- branding, including per-audience overrides ----------
  // ENCA's mechanism, ported with the self-host gear (js/selfhost.js). The
  // active look: BRANDING, unless a brand override is selected — via the
  // ?brand= query, a stored choice from earlier in the session, or the
  // signed-in account's UPN domain; the "selfhost" override (registered by
  // js/selfhost.js from the gear or /selfhost-branding.json) is the fallback
  // when nothing else is chosen.
  const BRAND_STORE = "tuno-brand";
  function activeOverrideKey() {
    const q = new URLSearchParams(location.search).get("brand");
    if (q != null) {
      try { q && typeof BrandOverrides !== "undefined" && BrandOverrides.byKey(q) ? sessionStorage.setItem(BRAND_STORE, q) : sessionStorage.removeItem(BRAND_STORE); } catch { /* private mode */ }
      return q;
    }
    try { const s = sessionStorage.getItem(BRAND_STORE); if (s) return s; } catch { /* private mode */ }
    return (typeof BrandOverrides !== "undefined" && BrandOverrides.byKey("selfhost")) ? "selfhost" : null;
  }
  function activeBrand() {
    if (typeof BRANDING === "undefined") return null;
    const o = typeof BrandOverrides !== "undefined" ? BrandOverrides.byKey(activeOverrideKey()) : null;
    return o ? Object.assign({}, BRANDING, o.brand, { colors: BRANDING.colors }) : BRANDING;
  }
  // Colour overrides land as inline :root properties; remember what we set so
  // switching back to the default look actually removes them.
  let appliedBrandColors = [];
  function applyBranding(B) {
    if (!B) return;
    // Publish before painting: activeBrand() hands back a MERGED COPY rather
    // than mutating the global BRANDING — anything reading the global directly
    // would keep showing the deployment's own logo under an override.
    Brand.setActive(B);
    const set = (id, fn) => { const el = $(id); if (el) fn(el); };
    document.title = Brand.pageTitle;
    set("favicon", (el) => { if (B.favicon) el.href = B.favicon; });
    // The mark is the PRODUCT's (TUNO office logo), not the org's — alt follows.
    ["brandLogo", "brandLogoLogin"].forEach((id) => set(id, (el) => {
      if (B.logo) el.src = B.logo;
      el.alt = B.name || B.org;
      // Wide wordmarks (the default marks are 1:1) keep their aspect: fix the
      // height the layout expects and let the width follow.
      if (B.logoWide) { el.style.height = id === "brandLogo" ? "34px" : "56px"; el.style.width = "auto"; }
      else { el.style.height = ""; el.style.width = ""; }
    }));
    // Dark mode swaps the DEFAULT logo via a CSS content: rule; flag the root
    // when an override is active so that rule stands down (see app.css).
    const oBrand = typeof BrandOverrides !== "undefined" ? BrandOverrides.byKey(activeOverrideKey()) : null;
    const oKey = oBrand ? oBrand.key : "";
    if (oKey) document.documentElement.setAttribute("data-brand", oKey);
    else document.documentElement.removeAttribute("data-brand");
    // Override palettes ship as a stylesheet, scoped per theme — explicit
    // light/dark via data-theme, auto via prefers-color-scheme — so both
    // modes get a palette designed for them (appended last, so it wins ties).
    document.getElementById("brandOverrideCss")?.remove();
    // The pre-paint boot stylesheet (js/selfhost-boot.js) hands over here:
    // its palette matches what this function is about to apply, but its
    // logo content:url rule would beat the src= this function sets, so it
    // must not outlive the authoritative branding pass.
    document.getElementById("selfhostBootCss")?.remove();
    if (oBrand) {
      const decl = (obj) => Object.entries(obj || {}).filter(([k, v]) => k.startsWith("--") && v)
        .map(([k, v]) => `${k}:${v}`).join(";");
      const both = decl(oBrand.brand.colors), L = decl(oBrand.brand.colorsLight), D = decl(oBrand.brand.colorsDark);
      const sel = `:root[data-brand="${oKey}"]`;
      const css = [
        both ? `${sel}{${both}}` : "",
        L ? `${sel}[data-theme="light"]{${L}}
@media (prefers-color-scheme: light){ ${sel}:not([data-theme="dark"]){${L}} }` : "",
        D ? `${sel}[data-theme="dark"]{${D}}
@media (prefers-color-scheme: dark){ ${sel}:not([data-theme="light"]){${D}} }` : "",
      ].filter(Boolean).join("\n");
      const tag = document.createElement("style");
      tag.id = "brandOverrideCss";
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    set("brandOrg", (el) => {
      // A wordmark logo already carries the name — drawing it again as text
      // next to it is redundant.
      el.style.display = B.hideOrgName ? "none" : "";
      const org = B.org || "";
      const tail = B.orgSplit && org.endsWith(B.orgSplit) ? B.orgSplit : "";
      el.innerHTML = tail ? `${esc(org.slice(0, org.length - tail.length))}<span>${esc(tail)}</span>` : esc(org);
    });
    set("brandTag", (el) => { el.textContent = B.name; });
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
  applyBranding(activeBrand());
  // Self-host branding can change after first paint — the deployment file
  // arrives async, and the ⚙ gear saves without a reload. Repainting resets
  // document.title, so the ribbon's channel tag has to be put back on.
  document.addEventListener("tuno:brand-updated", () => {
    applyBranding(activeBrand());
    const rb = $("betaRibbon");
    if (rb && rb.dataset.titleTag && !document.title.startsWith("[")) document.title = rb.dataset.titleTag + " " + document.title;
  });

  // ---------- beta / preview ribbon ----------
  // The production deployment lives on BRANDING.host; any other origin (the
  // beta Pages site, a local dev server) is visibly not production.
  (function markNonProduction() {
    try {
      const prod = (BRANDING.host || "").toLowerCase();
      const here = location.hostname.toLowerCase();
      if (!prod || !here || here === prod) return;
      const r = document.createElement("div");
      // The id and titleTag are the seam js/selfhost.js softens: a deployment
      // file turns this into the neutral SELF-HOSTED ribbon.
      r.id = "betaRibbon";
      r.dataset.titleTag = "[BETA]";
      r.textContent = "⚠ BETA — not production";
      r.style.cssText = "position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9999;" +
        "background:#b04a3a;color:#fff;font:800 13px/1 Inter,system-ui,sans-serif;padding:7px 22px;" +
        "border-radius:0 0 10px 10px;letter-spacing:.5px;box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none;white-space:nowrap";
      document.body.appendChild(r);
      document.title = "[BETA] " + document.title;
    } catch { /* cosmetic only */ }
  })();
  const isProduction = () => { try { return location.hostname.toLowerCase() === (BRANDING.host || "").toLowerCase(); } catch { return true; } };

  // ---------- "select all" for every surface picker ----------
  // Six tools render a .gu-areas grid of tick boxes and none of them offered a
  // way to clear the lot. Rather than six copies of the same button, the shell
  // adds one to each grid's heading row and drives it by dispatching a real
  // change event on every box — which is precisely what clicking them one at a
  // time does, so each tool's own listener updates its own state and nothing
  // here needs to know what that state is.
  //
  // Label follows ENCA's idiom for a toggle-all: it states what pressing it
  // will DO, not what is currently true.
  function initAreaPickers() {
    document.querySelectorAll(".gu-areas").forEach((box) => {
      const label = box.previousElementSibling;
      if (!label || box.dataset.allWired) return;
      box.dataset.allWired = "1";

      const row = document.createElement("div");
      row.className = "gu-areas-head";
      label.parentNode.insertBefore(row, label);
      row.appendChild(label);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn sm gu-areas-all";
      row.appendChild(btn);

      const boxes = () => [...box.querySelectorAll('input[type="checkbox"]')];
      const paint = () => {
        const all = boxes();
        if (!all.length) { btn.style.display = "none"; return; }
        btn.style.display = "";
        const on = all.filter((c) => c.checked).length;
        btn.textContent = on === all.length ? "\u2610 Deselect all" : `\u2611 Select all${on ? ` (${on}/${all.length})` : ""}`;
      };
      btn.addEventListener("click", () => {
        const all = boxes();
        const want = all.some((c) => !c.checked);      // any off -> turn everything on
        all.forEach((c) => {
          if (c.checked === want) return;              // no event for a box already right
          c.checked = want;
          c.dispatchEvent(new Event("change", { bubbles: true }));
        });
        paint();
      });
      // The tools re-render their own grids, so watch rather than assume.
      // GUARDED: MutationObserver is an enhancement here — it keeps the count
      // honest when a tool rebuilds its grid. Where it is missing, the button
      // still works and still repaints on change; what it loses is the repaint
      // after a re-render. An optional API must not be able to throw partway
      // through the shell's start-up and take everything below it with it.
      box.addEventListener("change", paint);
      if (typeof MutationObserver === "function") {
        new MutationObserver(paint).observe(box, { childList: true, subtree: true });
      }
      paint();
    });
  }
  initAreaPickers();

  // ---------- home sections: collapse, with what changed on top ----------
  // Ported verbatim from ENCA (js/app.js), storage key aside. The whole design
  // is theirs and the comments below are theirs; they record decisions that
  // were made by getting them wrong first, which is exactly the kind of thing
  // a reimplementation loses.
  //
  // The part worth reading twice: a NEW, BETA or UPDATED tile claims a visible
  // slot FIRST but does not enlarge the section, and flagged tiles are ranked
  // by RECENCY read from the changelog rather than by DOM order - so a tool
  // changed in this build outranks a BETA tag that has sat there for weeks.
  // Anything flagged that still does not fit is COUNTED ON THE BUTTON rather
  // than silently buried.
  const HOME_VISIBLE = 4;
  const HOME_KEY = "tuno-home-expanded";
  // The expanded/collapsed choice is remembered, but only WITHIN A BUILD. A
  // release that adds or changes tools has changed what the section contains,
  // so "show me all eleven" — decided against a different eleven, possibly
  // months ago — is no longer an answer to the question being asked. Left to
  // persist, it also silently defeats the point of putting what changed at the
  // top of a collapsed section: an expanded section has no top.
  //
  // The old format was a bare array. It is read once and discarded rather than
  // migrated: it carries no build, so there is no honest way to decide whether
  // it still applies, and one collapsed visit costs a click.
  const homeExpanded = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem(HOME_KEY) || "null");
      if (raw && !Array.isArray(raw) && raw.build === APP_BUILD.build) return new Set(raw.keys || []);
    } catch { /* unreadable or private mode */ }
    return new Set();
  })();
  const homeSave = () => {
    try { localStorage.setItem(HOME_KEY, JSON.stringify({ build: APP_BUILD.build, keys: [...homeExpanded] })); }
    catch { /* private mode */ }
  };

  function initHomeSections() {
    const grids = [...document.querySelectorAll("#screen-home .tools")];
    grids.forEach((grid, gi) => {
      const tiles = [...grid.children].filter((el) => el.classList.contains("tool"));
      if (tiles.length <= HOME_VISIBLE) return;               // nothing worth hiding
      // A section is keyed by the heading above it, not its index, so adding a
      // section later does not silently re-collapse a different one.
      const head = grid.previousElementSibling;
      const key = (head && head.querySelector("h3") ? head.querySelector("h3").textContent : `sec${gi}`).trim();
      const btn = document.createElement("button");
      btn.className = "btn home-more";
      // A tool that just shipped or just changed should not be behind the fold.
      // NEW, BETA and UPDATED tiles therefore claim the visible slots FIRST —
      // but they do not enlarge the section, because when a release touches six
      // tools that stopped the section collapsing at all. Order never changes;
      // only which tiles are shown.
      const flagged = (t) => !!t.querySelector(".tag.new, .tag.upd");
      // When more tiles are flagged than there are slots, DOM order decided who
      // got one — so a tool changed in the current build lost its place to a
      // BETA tag that had been sitting there for weeks, which is precisely
      // backwards. Rank the flagged by RECENCY instead, read from the changelog:
      // the build number of the newest entry naming that tool. The changelog
      // records tools by their display name, which is the tile's heading, so the
      // two are matched on that. A tool the changelog has never named sorts last
      // among the flagged rather than first — no date is not a recent date.
      const toolName = (t) => {
        const h = t.querySelector("h3");
        if (!h) return "";
        return [...h.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
      };
      const lastBuild = (() => {
        const cache = new Map();
        return (t) => {
          const name = toolName(t);
          if (!name) return -1;
          if (cache.has(name)) return cache.get(name);
          let best = -1;
          try {
            for (const entry of (typeof CHANGELOG !== "undefined" ? CHANGELOG : [])) {
              if ((entry.items || []).some((i) => String(i.tool || "").toLowerCase() === name.toLowerCase())) {
                best = Math.max(best, +entry.build || -1);
              }
            }
          } catch { /* changelog optional */ }
          cache.set(name, best);
          return best;
        };
      })();
      // most recently changed first; ties keep their authored order
      const byRecency = tiles.filter(flagged)
        .map((t, i) => ({ t, i, b: lastBuild(t) }))
        .sort((a, b) => b.b - a.b || a.i - b.i)
        .map((x) => x.t);
      const paint = () => {
        const open = homeExpanded.has(key);
        // The visible budget is HOME_VISIBLE in total. Flagged tiles claim those
        // slots FIRST — a release must be reachable without expanding — but they
        // no longer sit on top of the budget. With six flagged tiles in a section
        // that meant nothing collapsed at all, which is the opposite of the point.
        // Anything flagged that still does not fit is counted on the button, so it
        // is announced rather than silently buried.
        const keep = new Set();
        for (const t of byRecency) { if (keep.size >= HOME_VISIBLE) break; keep.add(t); }
        for (const t of tiles) { if (keep.size >= HOME_VISIBLE) break; keep.add(t); }
        const hidden = [];
        tiles.forEach((t) => {
          const show = open || keep.has(t);
          t.style.display = show ? "" : "none";
          // COLLAPSED: what changed goes first. A flagged tile claimed a visible
          // slot before this but kept its page position, so a flagged tile
          // sitting ninth was on screen and still read as an afterthought.
          // Order is a CSS property here, not a DOM move — nothing is
          // reparented, so expanding restores the authored order exactly, and
          // the grid's grouping (which is meaningful) survives untouched.
          // Newest first among the flagged, so the tile you are looking for is
          // the leftmost one rather than somewhere among the badges.
          const rank = byRecency.indexOf(t);
          t.style.order = open ? "" : (rank >= 0 ? String(rank - byRecency.length) : "");
          if (!show) hidden.push(t);
        });
        const buried = hidden.filter(flagged).length;
        btn.style.display = hidden.length || open ? "" : "none";
        btn.textContent = open
          ? "▲ Show fewer"
          : `▼ Show ${hidden.length} more${buried ? ` · ${buried} new, beta or updated` : ""}`;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      };
      btn.addEventListener("click", () => {
        homeExpanded.has(key) ? homeExpanded.delete(key) : homeExpanded.add(key);
        homeSave(); paint();
      });
      grid.insertAdjacentElement("afterend", btn);            // outside the grid, not a grid cell
      paint();
    });
  }
  initHomeSections();

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
  // One place that records the signed-in account, so the active account MSAL
  // uses for silent token acquisition can never drift from the one the UI
  // shows. js/graph.js reads `account` through the provider; acquireTokenSilent
  // needs the same one set active or it re-prompts.
  function adopt(acc) {
    account = acc;
    try { msalApp.setActiveAccount(acc); } catch { /* older msal-browser */ }
    return true;
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
        if (res && res.account) { return adopt(res.account); }

        // THERE IS ALWAYS A SIGN-IN — ENCA's model, restored (10376).
        //
        // handleRedirectPromise() returns an account only in the moments after
        // a redirect completes; that is the ONE path that enters directly,
        // because it is a sign-in finishing, not a refresh. Everything else —
        // an F5, a reopened tab, a cached session in sessionStorage — lands on
        // the sign-in screen and goes through a real interactive sign-in on
        // the click. 10361/10371 tried restoring the cached account so the
        // click could enter silently; that made entry a click-through rather
        // than an authentication, and the agreement is the opposite: entry to
        // a tool that can write to a tenant is authenticated every time, the
        // identity provider re-running its policy included. The cost (an MFA
        // prompt per entry) is ENCA's known, accepted cost.
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
      // ENCA's sign-in, verbatim: `prompt: "select_account"` on both paths, so
      // every entry is a fresh authorization — the chooser appears, and the
      // identity provider re-runs its policy, MFA included. 10361 removed the
      // prompt and 10371 added a cached-session short-circuit on top; both are
      // reversed here, because the agreement is that there is ALWAYS a
      // sign-in. Within the session, incremental consent still acquires
      // tokens silently — adopt() sets the active account for that.
      if (useRedirect) { await msalApp.loginRedirect({ scopes: AUTH_CONFIG.scopes, prompt: "select_account" }); return; }
      const res = await msalApp.loginPopup({ scopes: AUTH_CONFIG.scopes, prompt: "select_account" });
      adopt(res.account);
      enter();
    } catch (e) {
      loginErr("Sign-in failed: " + (e && e.message ? e.message : e));
    }
  }
  // ---------- demo mode ----------
  //
  // ENCA's entry, ported: ?demo=1, a link on the sign-in card, and a fake
  // identity in the tenant box. What is NOT ported is the eighty branches
  // behind it — Graph.useDemo() puts the whole tenant behind the read layer,
  // so from here down demo mode is just a sign-in that skips Microsoft.
  //
  // The banner is not decoration and must not be made dismissible. Every
  // number on every screen after this point is invented, and the one thing a
  // demo owes the person looking at it is that they never forget that.
  function loadDemo() {
    Graph.useDemo();
    signedIn = true;
    account = null;
    tenantDomain = "";
    tenantName = "Contoso B.V. (demo)";
    // The same org demo.js answers for /organization — set directly rather
    // than read, so TunoTenant.org() and the demo Graph cannot disagree
    // about who the pretend tenant is.
    orgInfo = { id: "d0e1f2a3-4b5c-6d7e-8f90-abcdef012345", displayName: tenantName, verifiedDomains: [] };
    $("tenantName").textContent = tenantName;
    $("tenantUser").textContent = "demo@contoso.onmicrosoft.com";
    $("avatar").textContent = "DM";
    $("cfdevBadge").style.display = "none";
    $("tenantBox").style.display = "flex";
    $("homeBtn").style.display = "";
    document.body.classList.add("demo-mode");
    const bar = $("demoBar");
    if (bar) {
      bar.style.display = "";
      // The bar wraps to two lines on a narrow window and the fixed sidebar
      // has to start below whatever height it actually is, so it is measured
      // rather than assumed — and re-measured on resize, because the wrap
      // point is exactly where somebody will be looking.
      const measure = () => document.documentElement.style.setProperty("--demo-bar-h", `${bar.offsetHeight}px`);
      measure();
      if (typeof ResizeObserver === "function") new ResizeObserver(measure).observe(bar);
      else window.addEventListener("resize", measure);
    }
    buildToolNav();
    renderSideNav();
    $("sideNav").style.display = "";
    document.body.classList.add("with-side");
    show("screen-home");
    // Demo signs in like any tenant, so it warms like any tenant — the
    // demo Graph answers the prefetch and the warm-start is showable.
    if (typeof PolicyCache !== "undefined") PolicyCache.warm();
  }

  // ---------- tenant identity at sign-in (ENCA's org read, ported) ----------
  // ENCA's loadTenant fetches /organization right after sign-in and puts the
  // org's display name in the header; this is that read, alone — TUNO has no
  // tenant-wide load to ride, so it rides enter() instead. Fire-and-forget:
  // the header shows the UPN domain immediately (what enter() always did)
  // and upgrades to the organization's display name when the read answers,
  // which on a warm token cache is the same paint. $select names exactly the
  // three properties User.Read is documented to answer; asking for more
  // would only get nulls back. A failure of any kind — offline, a guest
  // account, a token MSAL wants interaction for (never granted here: a
  // consent popup at sign-in is the one thing rule 1 of the Graph layer
  // exists to prevent, and the catch swallows it instead) — leaves the
  // header on the UPN domain and orgInfo null, which every caller treats as
  // "not read", never as an empty tenant.
  async function readOrgAtSignIn() {
    try {
      const j = await Graph.readOne("/organization?$select=id,displayName,verifiedDomains",
        { scopes: AUTH_CONFIG.scopes });
      const org = j && Array.isArray(j.value) ? j.value[0] : j;
      if (!signedIn || !org) return;   // signed out mid-flight, or nothing came back
      orgInfo = { id: org.id || "", displayName: org.displayName || "", verifiedDomains: org.verifiedDomains || [] };
      if (org.displayName) {
        tenantName = org.displayName;
        $("tenantName").textContent = tenantName;
        // The org-name half of the cfdev check just woke up — re-ask with
        // both halves in hand, the same call enter() made with one.
        $("cfdevBadge").style.display = isCfdevTenant() ? "inline-block" : "none";
      }
    } catch { /* ENCA's own hedge, ported: the org read is best-effort */ }
  }

  function enter() {
    signedIn = true;
    $("tenantName").textContent = (account && (account.tenantId ? account.username.split("@")[1] : "")) || "";
    tenantDomain = (account && account.username ? account.username.split("@")[1] : "") || "";
    // Extended behaviour is said where the tenant identity lives instead of
    // being a hidden mode — ENCA's rule, ported with the badge.
    $("cfdevBadge").style.display = isCfdevTenant() ? "inline-block" : "none";
    // Audience branding by who signed in: an account whose UPN matches a
    // BRAND_OVERRIDES entry gets that look even without ?brand=. The list
    // ships empty — the machinery arrives with the self-host gear.
    if (typeof BrandOverrides !== "undefined") {
      const bo = BrandOverrides.forUpn(account && account.username);
      if (bo && activeOverrideKey() !== bo.key) {
        try { sessionStorage.setItem(BRAND_STORE, bo.key); } catch { /* private mode */ }
        applyBranding(activeBrand());
      }
    }
    $("tenantUser").textContent = account ? account.username : "";
    const nm = account && (account.name || account.username) || "?";
    $("avatar").textContent = nm.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
    // ENCA's way, ported: the stylesheet keeps .tenant at display:none and the
    // app shows it directly. The previous classList.add("on") toggled a class
    // no CSS rule has ever mentioned, so the tenant identity — name, avatar,
    // the SIGN OUT button, the cfdev badge — never rendered for anybody.
    $("tenantBox").style.display = "flex";
    $("homeBtn").style.display = "";
    buildToolNav();
    // the sidebar and the wide shell exist only signed in — the sign-in
    // screen keeps its centred card
    renderSideNav();
    $("sideNav").style.display = "";
    document.body.classList.add("with-side");
    show("screen-home");
    openWhatsNewOverlay();
    readOrgAtSignIn();
    // The sign-in prefetch (build 10520) — fire-and-forget, and SILENT by
    // contract: PolicyCache.warm() reads the tenant only when the consent
    // already exists, so a first-time tenant sees no prompt it did not ask
    // for. Nothing on this path awaits it; the tools adopt the result when
    // their screens open.
    if (typeof PolicyCache !== "undefined") PolicyCache.warm();
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
    tenantDomain = ""; tenantName = ""; orgInfo = null;
    // The cache holds tenant data and the next sign-in may be a different
    // tenant — it does not survive the account that read it.
    if (typeof PolicyCache !== "undefined") PolicyCache.clear();
    $("cfdevBadge").style.display = "none";
    $("tenantBox").style.display = "none";
    $("homeBtn").style.display = "none";
    $("toolNav").style.display = "none";
    $("sideNav").style.display = "none";
    document.body.classList.remove("with-side");
    show("screen-login");
    // Clear the active account as well as the local one: leaving it set means
    // the next sign-in silently reuses the account somebody just signed out of,
    // which on a consultancy laptop is the wrong customer's tenant.
    if (msalApp) { try { msalApp.setActiveAccount(null); } catch { /* older msal-browser */ } }
    if (msalApp && acc) msalApp.logoutPopup({ account: acc }).catch(() => {});
  });
  const demoLink = $("demoLink");
  if (demoLink) demoLink.addEventListener("click", (e) => { e.preventDefault(); loadDemo(); });

  authInit().then((cameBack) => {
    // ?demo=1 is checked AFTER auth init and BEFORE the redirect short-circuit,
    // so a demo cannot be entered on top of a half-finished real sign-in.
    // It is deliberately not remembered anywhere: the URL is the only thing
    // that puts the app in demo mode, which makes "is this real?" a question
    // the address bar answers.
    try {
      if (new URLSearchParams(location.search).get("demo") === "1") { loadDemo(); return; }
    } catch { /* no URLSearchParams — fall through to the normal sign-in */ }
    // Only a COMPLETED interactive sign-in (the redirect flow landing back
    // here) enters directly — it is a sign-in finishing, not a refresh.
    // Everything else stays on the sign-in screen and signs in for real.
    if (cameBack) enter();
  });

  // ---------- tool tab bar (ENCA's browser-style tabs, ported verbatim) ----------
  // The tools, in home-grid order. Each carries the exact crumb string its tile
  // handler sets, so the active tab can be matched from crumb() regardless of
  // whether the tool was opened from the grid or a tab.
  const TOOL_TABS = [
    ["toolAppLocker", "🔐 AppLocker builder & validator"],
    ["toolDefender", "🦠 Defender status"],
    ["toolEndpointSec", "🧱 Firewall & ASR coverage"],
    ["toolLaps", "🔑 Windows LAPS audit"],
    ["toolPosture", "🧭 Endpoint security posture"],
    ["toolSecureScore", "📊 Secure Score visualizer"],
    ["toolGroupUse", "🔗 Group Analyzer"],
    ["toolWhatIf", "🔮 Assignment what-if"],
    ["toolHealth", "🩺 Assignment health"],
    ["toolAssignEdit", "✏️ Assignment editor"],
    ["toolFilters", "🧩 Assignment filters"],
    ["toolDevice", "🖥 Device analyzer"],
    ["toolCompliance", "📈 Compliance report"],
    ["toolAudit", "🕓 Change audit"],
    ["toolOverview", "🗂 Policy overview"],
    ["toolBackup", "📦 Backup configuration"],
    ["toolDocs", "📄 Configuration documenter"],
    ["toolCompEv", "📋 Compliance evidence"],
    ["toolSetSearch", "🔦 Settings search"],
    ["toolConflict", "⚔️ Setting conflict scan"],
    ["toolMacBaseline", "🍎 macOS baseline"],
    ["toolWinBaseline", "🪟 Windows baseline"],
    ["toolDeviceCleanup", "🧹 Entra device cleanup"],
    ["toolRoles", "🛡 Intune RBAC"],
    ["toolMaa", "🤝 Multi-admin approval"],
    ["toolRestrictedAu", "🛡 Restricted AUs"],
    ["toolGroupMigrate", "🔄 Group migration"],
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
    renderSideActive();   // the sidebar highlights whatever the tabs say is active
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

  // ---------- side navigation (build 10380) ----------
  // The sidebar is the console's map: every tool, grouped exactly as on the
  // home grid, reachable from anywhere once signed in. The tab bar stays and
  // the two do different jobs — the sidebar is where you CAN go, the tabs are
  // what you HAVE open.
  //
  // It is built by WALKING THE HOME GRID (section heading, then tile ids, in
  // document order), so there is no second copy of the grouping to fall out of
  // step when a tool is added. But the LABELS come from the tool list via
  // labelFor() — the same rule the tabs follow — because the old tab strip
  // scraped tile headings and dragged the NEW/BETA tag text into every label.
  // Collapsed (build 10387): an icon rail, names on hover. The state
  // survives a refresh the same guarded-localStorage way the theme does —
  // private mode throws, and a browser that cannot remember simply opens
  // expanded.
  const SIDE_KEY = "tuno.sideCollapsed";
  const sideStored = () => { try { return localStorage.getItem(SIDE_KEY) === "1"; } catch { return false; } };
  function setSideCollapsed(on) {
    document.body.classList.toggle("side-min", !!on);
    $("sideNav") && $("sideNav").classList.remove("peek");
    try { on ? localStorage.setItem(SIDE_KEY, "1") : localStorage.removeItem(SIDE_KEY); } catch { /* private mode */ }
    const t = $("sideToggle");
    if (t) { t.textContent = on ? "»" : "«"; t.title = on ? "Expand the sidebar" : "Collapse the sidebar — icons stay, names appear on hover"; }
    syncStickyTops();
  }
  function renderSideNav() {
    const secs = [];
    let cur = null;
    document.querySelectorAll("#screen-home .tool-sec, #screen-home .tool").forEach((el) => {
      if (el.classList.contains("tool-sec")) {
        const h = el.querySelector("h3");
        cur = { title: h ? h.textContent : "", ids: [] };
        secs.push(cur);
      } else if (cur && el.id) cur.ids.push(el.id);
    });
    // Every label is "<emoji> <name>" from the tool list; the split lets the
    // collapsed rail keep the icon and drop the text. The FULL label rides
    // every button as its title, so the collapsed rail's hover names cost
    // nothing and clip nowhere — a CSS tooltip inside an overflow:auto
    // sidebar would be cut off at the edge, which is why it is native.
    // The T number comes from TOOL_VERSIONS rather than being typed into the
    // label, because it is the tool's PERMANENT number and the one place it
    // is already recorded. Typing it here would let the menu and the tile
    // disagree, and a wrong T number is worse than none — the numbers are how
    // these tools get referred to out loud.
    const tNum = (id) => {
      const t = (typeof TOOL_VERSIONS !== "undefined" && TOOL_VERSIONS[id] || {}).t;
      return Number.isFinite(t) ? `T${String(t).padStart(2, "0")}` : "";
    };
    const item = (id) => {
      const label = labelFor(id);
      const sp = label.indexOf(" ");
      const [ic, txt] = sp > 0 ? [label.slice(0, sp), label.slice(sp + 1)] : ["·", label];
      const n = tNum(id);
      // The number rides in its OWN span, pushed to the right, rather than
      // being appended to the name. The rail is 240px and the names ellipsise;
      // appended, the number would be the first thing cut off on exactly the
      // longer names people need it for.
      return `<button data-nav="${id}" id="side-${id}" title="${esc(n ? `${label} (${n})` : label)}">`
        + `<span class="sn-ic">${esc(ic)}</span><span class="sn-txt">${esc(txt)}</span>`
        + (n ? `<span class="sn-t">${n}</span>` : "")
        + `</button>`;
    };
    $("sideNav").innerHTML =
      `<button class="sn-toggle" id="sideToggle" data-navtoggle>«</button>` +
      `<button data-navhome id="side-home" title="🏠 Overview"><span class="sn-ic">🏠</span><span class="sn-txt">Overview</span></button>` +
      secs.map((s) => `<h4 title="${esc(s.title)}">${esc(s.title)}</h4>` + s.ids.map(item).join("")).join("");
    setSideCollapsed(sideStored());
    renderSideActive();
  }
  // Active state follows the tabs' own truth (activeTab, set by crumb), so the
  // sidebar and the tab bar can never disagree about where you are.
  function renderSideActive() {
    const nav = $("sideNav"); if (!nav) return;
    nav.querySelectorAll("button.active").forEach((b) => b.classList.remove("active"));
    const on = activeTab ? nav.querySelector("#side-" + activeTab) : nav.querySelector("#side-home");
    if (on) on.classList.add("active");
  }
  $("sideNav").addEventListener("click", (e) => {
    if (e.target.closest("[data-navtoggle]")) { setSideCollapsed(!document.body.classList.contains("side-min")); return; }
    // picking a destination while peeked collapses the rail again — the
    // peek is a glance, not a state change (build 10391)
    if (e.target.closest("[data-navhome]")) { $("sideNav").classList.remove("peek"); crumb(""); show("screen-home"); return; }
    const b = e.target.closest("[data-nav]");
    if (b) { $("sideNav").classList.remove("peek"); $(b.dataset.nav).click(); }   // the tile's own handler: crumb, screen, setup
  });
  // The peek (build 10391): hovering the collapsed rail expands it as an
  // overlay; leaving closes it. The 120ms delay keeps a cursor merely
  // passing on its way to the content from flaring the rail open.
  let peekTimer = null;
  $("sideNav").addEventListener("mouseenter", () => {
    if (!document.body.classList.contains("side-min")) return;
    peekTimer = setTimeout(() => $("sideNav").classList.add("peek"), 120);
  });
  $("sideNav").addEventListener("mouseleave", () => {
    clearTimeout(peekTimer);
    $("sideNav").classList.remove("peek");
  });
  $("homeBtn").addEventListener("click", () => { crumb(""); show("screen-home"); });
  // logo returns to the tools overview when signed in (does nothing on login)
  $("logoHome").addEventListener("click", () => { if (signedIn) { crumb(""); show("screen-home"); } });
  $("toolAppLocker").addEventListener("click", () => { crumb("🔐 AppLocker builder & validator"); show("screen-applocker"); });
  $("toolDefender").addEventListener("click", () => { crumb("🦠 Defender status"); show("screen-defender"); });
  $("toolEndpointSec").addEventListener("click", () => { crumb("🧱 Firewall & ASR coverage"); show("screen-endpointsec"); });
  $("toolLaps").addEventListener("click", () => { crumb("🔑 Windows LAPS audit"); show("screen-laps"); });
  $("toolPosture").addEventListener("click", () => { crumb("🧭 Endpoint security posture"); show("screen-posture"); });
  $("toolSecureScore").addEventListener("click", () => { crumb("📊 Secure Score visualizer"); show("screen-securescore"); });
  $("toolGroupUse").addEventListener("click", () => { crumb("🔗 Group Analyzer"); show("screen-groupuse"); });
  $("toolAudit").addEventListener("click", () => { crumb("🕓 Change audit"); show("screen-audit"); });
  $("toolCompliance").addEventListener("click", () => { crumb("📈 Compliance report"); show("screen-compliance"); });
  $("toolWhatIf").addEventListener("click", () => { crumb("🔮 Assignment what-if"); show("screen-whatif"); });
  $("toolHealth").addEventListener("click", () => { crumb("🩺 Assignment health"); show("screen-health"); });
  $("toolSetSearch").addEventListener("click", () => { crumb("🔦 Settings search"); show("screen-setsearch"); });
  $("toolConflict").addEventListener("click", () => { crumb("⚔️ Setting conflict scan"); show("screen-conflict"); });
  $("toolMacBaseline").addEventListener("click", () => { crumb("🍎 macOS baseline"); show("screen-macbaseline"); });
  $("toolWinBaseline").addEventListener("click", () => { crumb("🪟 Windows baseline"); show("screen-winbaseline"); });
  $("toolDeviceCleanup").addEventListener("click", () => { crumb("🧹 Entra device cleanup"); show("screen-devicecleanup"); });
  $("toolCompEv").addEventListener("click", () => { crumb("📋 Compliance evidence"); show("screen-compev"); });
  $("toolAssignEdit").addEventListener("click", () => { crumb("✏️ Assignment editor"); show("screen-assignedit"); });
  $("toolDevice").addEventListener("click", () => { crumb("🖥 Device analyzer"); show("screen-device"); });
  $("toolFilters").addEventListener("click", () => { crumb("🧩 Assignment filters"); show("screen-filters"); });
  $("toolRoles").addEventListener("click", () => { crumb("🛡 Intune RBAC"); show("screen-roles"); });
  $("toolMaa").addEventListener("click", () => { crumb("🤝 Multi-admin approval"); show("screen-maa"); });
  $("toolRestrictedAu").addEventListener("click", () => { crumb("🛡 Restricted AUs"); show("screen-restrictedau"); });
  $("toolGroupMigrate").addEventListener("click", () => { crumb("🔄 Group migration"); show("screen-groupmigrate"); });
  $("toolBackup").addEventListener("click", () => { crumb("📦 Backup configuration"); show("screen-backup"); });
  $("toolOverview").addEventListener("click", () => { crumb("🗂 Policy overview"); show("screen-overview"); });
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
  // Section pills, ENCA's pattern. Buttons rather than #anchors because the
  // shell owns pushState and an in-page hash would land in the history handling;
  // the sticky-header offset is scroll-margin-top in the CSS.
  const toc = $("helpToc");
  if (toc) toc.addEventListener("click", (e) => {
    const pill = e.target.closest(".help-toc-pill");
    if (!pill) return;
    const target = document.getElementById(pill.dataset.target);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function openHelp() {
    crumb("❓ Help");
    show("screen-help");
    const box = $("helpPromote");
    if (!box) return;
    // The queue pill exists only where the queue does — a link to a hidden box
    // is a button that does nothing.
    const queuePill = $("helpTocPromote");
    if (isProduction() || typeof PROMOTE === "undefined") {
      box.style.display = "none";
      if (queuePill) queuePill.style.display = "none";
      return;
    }
    box.style.display = "";
    if (queuePill) queuePill.style.display = "";

    // Ported verbatim from ENCA's renderPromotionQueue: the table is read to
    // decide WHAT to promote (number, risk, builds), and each row carries its
    // own test checklist so a step can fail rather than be nodded through.
    const RISK = {
      high:   { label: "high",   cls: "block", note: "a real problem in production until it lands" },
      medium: { label: "medium", cls: "new",   note: "missing capability, nothing broken" },
      low:    { label: "low",    cls: "",      note: "convenience or documentation" },
    };
    const items = (PROMOTE.items || []).slice().sort((a, b) => a.n - b.n);
    // Ticks for the promotion order (10444). Persisted per item NUMBER, so a
    // tick survives reloads and dies with its item: numbers not in the queue
    // any more are pruned on render — a shipped item cannot stay ticked.
    // (Guarded: the pq test harness runs this block without a window.)
    const picked = (() => {
      try {
        const raw = new Set(JSON.parse(localStorage.getItem("TUNO_PQ_PICK") || "[]").map(Number));
        const live = new Set(items.map((i) => i.n));
        const kept = [...raw].filter((n) => live.has(n));
        if (kept.length !== raw.size) localStorage.setItem("TUNO_PQ_PICK", JSON.stringify(kept));
        return new Set(kept);
      } catch { return new Set(); }
    })();

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
      ${items.length ? `<div class="tb-actions" style="margin:0 0 8px">
        <span class="mini" id="pqPickCount"><b>${picked.size}</b> of ${items.length} ticked for promotion</span>
        <button class="btn sm" id="pqExport" ${picked.size ? "" : "disabled"}>⭳ Export promotion order</button>
        <button class="btn sm" id="pqClear" ${picked.size ? "" : "disabled"}>Clear ticks</button>
        <span class="mini muted">tick what you have verified, export, and hand the file to the working session — it is the order, not the verification</span>
      </div><div class="cg-tablewrap"><table class="cg-table">
        <thead><tr><th style="width:34px" title="Tick to include in the promotion order"></th><th style="width:44px">#</th><th>Change</th><th style="width:90px">Risk</th><th style="width:120px">Beta builds</th></tr></thead>
        <tbody>${items.map((it) => {
          const r = RISK[it.risk] || RISK.low;
          const test = it.test || [];
          return `<tr>
            <td><input type="checkbox" data-pqpick="${it.n}" ${picked.has(it.n) ? "checked" : ""} title="Include item ${it.n} in the promotion order"></td>
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

    // ---- the tick wiring (10444) — outside the block the pq harness runs ----
    const readPicks = () => {
      try { return JSON.parse(localStorage.getItem("TUNO_PQ_PICK") || "[]").map(Number); } catch { return []; }
    };
    const writePicks = (ns) => { try { localStorage.setItem("TUNO_PQ_PICK", JSON.stringify(ns)); } catch { /* private mode — ticks live for the session only */ } };
    const syncBar = () => {
      const ns = readPicks();
      const c = $("pqPickCount"), ex = $("pqExport"), cl = $("pqClear");
      if (c) c.innerHTML = `<b>${ns.length}</b> of ${(PROMOTE.items || []).length} ticked for promotion`;
      if (ex) ex.disabled = !ns.length;
      if (cl) cl.disabled = !ns.length;
    };
    box.querySelectorAll("[data-pqpick]").forEach((cb) => cb.addEventListener("change", () => {
      const n = Number(cb.dataset.pqpick);
      const ns = new Set(readPicks());
      cb.checked ? ns.add(n) : ns.delete(n);
      writePicks([...ns]);
      syncBar();
    }));
    const exBtn = $("pqExport");
    if (exBtn) exBtn.addEventListener("click", () => {
      try {
        const o = PROMOTE.buildOrder(readPicks(), APP_BUILD);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([o.text], { type: "text/markdown" }));
        a.download = o.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch (e) { alert(String((e && e.message) || e)); }
    });
    const clBtn = $("pqClear");
    if (clBtn) clBtn.addEventListener("click", () => {
      writePicks([]);
      box.querySelectorAll("[data-pqpick]").forEach((cb) => { cb.checked = false; });
      syncBar();
    });
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
  if (typeof ConflictTool !== "undefined") ConflictTool.init();
  if (typeof ComplianceTool !== "undefined") ComplianceTool.init();
  if (typeof FiltersTool !== "undefined") FiltersTool.init();
  if (typeof Suggest !== "undefined") Suggest.init();
  if (typeof AssignEditTool !== "undefined") AssignEditTool.init();
  if (typeof RolesTool !== "undefined") RolesTool.init();
  if (typeof DefenderTool !== "undefined") DefenderTool.init();
  if (typeof EndpointSecTool !== "undefined") EndpointSecTool.init();
  if (typeof EndpointPostureTool !== "undefined") EndpointPostureTool.init();
  if (typeof SecureScoreTool !== "undefined") SecureScoreTool.init();
  if (typeof TunoReport !== "undefined") TunoReport.init();
  if (typeof OverviewTool !== "undefined") OverviewTool.init();
  if (typeof MaaTool !== "undefined") MaaTool.init();
  if (typeof LapsTool !== "undefined") LapsTool.init();
  if (typeof BackupTool !== "undefined") BackupTool.init();
  if (typeof RestoreTool !== "undefined") RestoreTool.init();
  if (typeof MacBaselineTool !== "undefined") MacBaselineTool.init();
  if (typeof WinBaselineTool !== "undefined") WinBaselineTool.init();
  if (typeof DeviceCleanupTool !== "undefined") DeviceCleanupTool.init();
  if (typeof CompEvTool !== "undefined") CompEvTool.init();
  if (typeof DocsTool !== "undefined") DocsTool.init();
  if (typeof RestrictedAuTool !== "undefined") RestrictedAuTool.init();
  if (typeof GroupMigrateTool !== "undefined") GroupMigrateTool.init();

  // Tile chips from the queue + new/updated tiles lead their section
  // (10551, Mihai's ask). Derived on beta so they cannot rot; production
  // keeps its promotion-stamped chips and only gains the ordering.
  if (typeof PROMOTE !== "undefined" && PROMOTE.applyTileFlags) {
    PROMOTE.applyTileFlags(document, typeof TOOL_VERSIONS !== "undefined" ? TOOL_VERSIONS : {}, { beta: !isProduction() });
  }
})();

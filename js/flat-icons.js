// ======================================================================
// Flat line icons in the chrome — ENCA's js/flat-icons.js (25406, as at
// ENCA beta 32433), ported to TUNO at build 10666 (TUNO–ENCA parity
// slice 5; mockup round 1, D3 A: line icons).
//
// The emoji that opens a button, a label, a summary, a heading, a table
// header, a tile, a tab or a chip is drawn as a line icon in the text
// colour (one 24-unit grid, 1.65 stroke). Only that leading marker
// changes: names, tenant data and exports stay text.
//   FlatIcons.tool(id)  a tool's icon as markup (the rail and the library
//                       use it from slice 7);
//   FlatIcons.apply(el) draws one subtree now;
//   FlatIcons.start()   draws the page and keeps drawing what the tools
//                       render later.
//
// TUNO DIFFERENCES, all on purpose:
//   * THE EMOJI STAYS IN THE TEXT. ENCA takes it out of the text node;
//     here it moves into the icon's slot as hidden text, so textContent
//     reads exactly as before — the crumbs, the tile ranking, the dialogs'
//     close-button finder (js/accessibility.js) and every suite that reads
//     a label see the same string. Screen readers skip it, as they skip
//     the icon, and a space before it stays where it was.
//   * THE ICON AND ITS WORDS ARE ONE RUN (span.fi-run), so a flex or grid
//     label lays them out as the one line the emoji and its words were.
//   * ONLY A MAPPED EMOJI IS DRAWN. ENCA draws any other pictograph as a
//     grid square; TUNO leaves it as it is, so a marker with no line icon
//     keeps its meaning and a name that happens to open with an emoji
//     keeps it. ENCA's 🧪 (its what-if) is not mapped: TUNO's 🧪 is a test
//     or a pilot.
//   * A TOOL'S ICON IS ITS OWN, not its emoji's: the Home tile, the
//     sidebar, the tabs, the ＋ menu and the tool's head take names[] by
//     tool id, and a heading that opens with a tool's head line takes
//     that tool's icon — T07 and T23 share 🛡, T26 shares 📋 with What's new.
//   * A heading can name its shape (data-icon): the Home sections, whose
//     emoji belong to tools (🖥 is T06's), draw round 1's section icons.
//   * Shapes TUNO adds: monitor, compass, filter, rocket (round 1), and
//     tag, plus, eye for markers ENCA does not use.
//   * The ep-rail rows inside the tools (.ep-node) are drawn too, as ENCA
//     draws its own rails' rows; and a chip's icon is sized to the chip
//     (css/flat-icons.css), so a card keeps its height.
//   * The svg carries its own 18 px size, so a selection pasted into mail
//     or a document keeps small icons (the stylesheet sizes it on screen).
//   * The observer draws what changed — the subtrees the mutations name —
//     rather than the whole page on every frame: TUNO's tools re-render
//     big tables, and a run ledger ticks its clock every second.
//   * Started by js/workspaces.js, as in ENCA (since 10668; js/app.js
//     started it at 10666–10667).
// Rewritten without optional chaining (TUNO's house rule).
// ======================================================================
const FlatIcons = (() => {
  // ---- ENCA's shapes, verbatim ----
  const shapes = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    blocks: '<rect x="2.5" y="2.5" width="8.5" height="8.5" rx="1.5"/><rect x="13" y="2.5" width="8.5" height="8.5" rx="1.5"/><rect x="7.75" y="13" width="8.5" height="8.5" rx="1.5"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>', file: '<path d="M6 3h9l5 5v13H6zM15 3v6h5M9 13h8M9 17h8"/>', users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6M19 21v-4a6 6 0 0 0-2-4"/>', user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>', search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>', shield: '<path d="m12 3 9 3v6c0 5-9 9-9 9s-9-4-9-9V6zM8 12l3 3 5-6"/>', layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>', activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5M12 17h.01"/>', lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>', key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9M16 16l3-3M18 18l3-3"/>', globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>', link: '<path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0M16 9l2-2a4 4 0 0 0-5-5l-2 2" transform="translate(2 2)"/>', trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>', refresh: '<path d="M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5M4 14a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>', edit: '<path d="m15 3 6 6-12 12H3v-6zM12 6l6 6"/>', check: '<path d="m4 12 5 5L20 6"/>', warning: '<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>', stop: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>', settings: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>', folder: '<path d="M3 5h7l2 3h9v13H3z"/>', route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8h7"/>', moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>', box: '<path d="m12 3 9 5v10l-9 5-9-5V8zM3 8l9 5 9-5M12 13v10"/>', close: '<path d="m5 5 14 14M5 19 19 5"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 5 9 8 9-8"/>', phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>', flag: '<path d="M5 22V3h14l-3 5 3 5H5"/>', chart: '<path d="M3 3v18h18M7 16v-5M12 16V7M17 16V4"/>',
  };
  // ---- TUNO's shapes: round 1's four, and three markers ENCA does not use ----
  Object.assign(shapes, {
    monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    rocket: '<path d="M12 2c3.5 2.5 5 6.5 4.5 11L15 16H9l-1.5-3C7 8.5 8.5 4.5 12 2z"/><circle cx="12" cy="9.5" r="1.8"/><path d="M9 16l-2.5 3.5M15 16l2.5 3.5M12 18v3"/>',
    tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  });
  // ---- a tool's icon, by TUNO tool id (round 1, D3 A) ----
  const names = {
    toolAppLockerHarvest: "lock", toolAppLocker: "lock", toolDefender: "shield", toolEndpointSec: "blocks", toolLaps: "key", toolPosture: "compass", toolSecureScore: "chart", toolMdeRollout: "rocket",
    toolGroupUse: "link", toolDevice: "monitor", toolWhatIf: "route", toolHealth: "activity", toolAssignEdit: "edit", toolFilters: "filter",
    toolOverview: "file", toolBackup: "box", toolDocs: "folder", toolSetSearch: "search", toolMacBaseline: "layers", toolWinBaseline: "layers", toolConflict: "warning",
    toolCompEv: "flag", toolCompliance: "check", toolDeviceCleanup: "trash", toolAudit: "clock",
    toolRoles: "users", toolMaa: "user", toolRestrictedAu: "stop", toolGroupMigrate: "refresh",
    toolChangelog: "file", toolRoadmap: "flag", toolHelp: "help", overview: "grid", home: "home",
  };
  // ---- ENCA's emoji map, verbatim (its 🧩 is listed twice; the second wins, as in ENCA) ----
  const glyphs = {'🗂':'file','📁':'folder','📂':'folder','🚦':'activity','🕵':'user','🧬':'layers','👥':'users','👤':'user','❓':'help','🔍':'search','🔎':'search','🛡':'shield','🧪':'route','🫥':'box','🔗':'link','🚪':'stop','🕓':'clock','🔒':'lock','🔓':'lock','🧩':'blocks','🌐':'globe','🌍':'globe','🌎':'globe','🗣':'user','📥':'upload','↗':'arrow','📵':'phone','🧷':'users','📋':'file','🗺':'flag','🔑':'key','🌓':'moon','🌗':'moon','🌙':'moon','☀':'settings','🌞':'settings','💻':'box','🎫':'key','💪':'shield','📜':'file','♻':'refresh','⚙':'settings','⏱':'clock','⏳':'clock','📦':'box','✅':'check','✓':'check','✔':'check','⚠':'warning','⛔':'stop','🚫':'stop','🗑':'trash','✎':'edit','✏':'edit','🖊':'edit','💾':'download','📤':'download','⭳':'download','↓':'download','⟳':'refresh','🔄':'refresh','↻':'refresh','✨':'flag','📌':'flag','🔧':'settings','🧩':'box','🖧':'globe','📊':'chart','📈':'chart','✕':'close','✗':'close','⌂':'home','⊞':'grid','⤓':'download','⤒':'upload','🛂':'lock','📘':'file','📐':'layers','📧':'mail','🎚':'settings','🌊':'users','⚖':'layers','📖':'file','📚':'file','📝':'edit','🔐':'lock'};
  // ---- TUNO's emoji: its tools' own, then its other markers ----
  delete glyphs["🧪"];   // ENCA's what-if; TUNO's 🧪 is a test or a pilot, and keeps its emoji
  Object.assign(glyphs, {
    "🧩": "filter", "📈": "check", "🖥": "monitor", "💻": "monitor", "🦠": "shield", "🧱": "blocks", "🧭": "compass", "🔮": "route",
    "🩺": "activity", "🔦": "search", "⚔": "warning", "📄": "folder", "🍎": "layers", "🪟": "layers", "🧹": "trash", "🤝": "user", "🚀": "rocket",
    "🏠": "home", "⭱": "upload", "⚑": "flag", "🎯": "flag", "🎛": "settings", "📱": "phone", "🔁": "refresh", "📅": "clock", "🔬": "search",
    "🧮": "grid", "🛫": "arrow", "📟": "monitor", "📡": "activity", "🏷": "tag", "➕": "plus", "👁": "eye", "🙏": "users", "🍏": "phone",
  });
  const keys = Object.keys(glyphs);
  const PICTO = /^\p{Extended_Pictographic}(?:[︎️]|‍\p{Extended_Pictographic})*/u;

  function svg(name) { return `<svg class="enca-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[name] || shapes.grid}</svg>`; }
  // ENCA's selector, and TUNO's ep-rail rows (round 1, D4 A keeps that rail
  // inside the tools): a row's label is its own text or its first span.
  const selector = "button,label,summary,h1,h2,h3,h4,h5,th,.tool-ic,.sn-ic,.wc-tool-icon,.wc-recent>span:first-child,.tag,.fchip,.state,.workspace-source,.wo-h,.wi-h,.lo-ic,.bl-active b,.gu-who"
    + ",.ep-node,.ep-node>span:first-child";
  const skip = "pre,code,textarea,option,[data-preserve-text],.export-root,.pcard-head h3,.ld-title,#workspaceInspector>h2";

  // The tool an element is the icon or the label of: a tile's icon, a
  // sidebar icon, a tab or ＋ menu entry (data-nav), a tool's head.
  function toolOf(el) {
    if (el.classList.contains("tool-ic")) { const t = el.closest(".tool[id]"); return t ? t.id : ""; }
    if (el.classList.contains("sn-ic")) { const b = el.closest("[data-nav],[data-navhome]"); return b ? (b.getAttribute("data-nav") || "home") : ""; }
    return el.getAttribute("data-nav") || el.getAttribute("data-tool-head") || "";
  }
  // A heading that opens with a tool's head line ("🛡 Intune RBAC") is
  // about that tool. The head lines come from TOOL_VERSIONS (js/version.js),
  // longest first.
  let heads = null;
  function headShape(trim) {
    if (!heads) {
      heads = [];
      if (typeof TOOL_VERSIONS !== "undefined") {
        for (const id of Object.keys(TOOL_VERSIONS)) {
          const h = TOOL_VERSIONS[id] && TOOL_VERSIONS[id].head;
          if (h && names[id]) heads.push([h, names[id]]);
        }
      }
      heads.sort((a, b) => b[0].length - a[0].length);
    }
    for (const [h, shape] of heads) if (trim.startsWith(h) && (trim.length === h.length || /^[\s·—–(:,]/.test(trim.slice(h.length)))) return shape;
    return "";
  }
  // What a reader sees: the text without the hidden emoji.
  function visibleText(el) {
    let s = "";
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!(n.parentElement && n.parentElement.closest(".fi-glyph"))) s += n.textContent;
    return s.trim();
  }

  function draw(parent) {
    if (parent.closest(skip)) return;
    const own = toolOf(parent), named = parent.getAttribute("data-icon");
    let first = true;
    for (const node of [...parent.childNodes]) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const lead = first;
      first = false;
      // Only a leading UI marker is an icon; never transform arbitrary names/content.
      const text = node.textContent, trim = text.trimStart();
      const fixed = lead ? ((own && names[own]) || (named && shapes[named] ? named : "")) : "";
      let glyph = keys.find((g) => trim.startsWith(g));
      if (!glyph && fixed) { const m = trim.match(PICTO); glyph = m ? m[0] : ""; }
      if (!glyph) continue;
      const rest = trim.slice(glyph.length).replace(/^[︎️‍]/u, "");
      if (rest && !/^[\s·]/.test(rest)) continue;
      const shape = fixed || headShape(trim) || glyphs[glyph];
      const span = document.createElement("span");
      span.className = "enca-icon-slot";
      span.innerHTML = svg(shape);
      const kept = document.createElement("span");
      kept.className = "fi-glyph";
      kept.hidden = true;
      kept.textContent = trim.slice(0, trim.length - rest.length);
      span.appendChild(kept);
      // The icon and its words stay one run (.fi-run): in a flex or grid
      // label — T08's and T09's area cards are flex columns — an icon
      // beside a bare text node would become an item of its own.
      const run = document.createElement("span");
      run.className = "fi-run";
      const space = text.slice(0, text.length - trim.length);
      if (space) node.before(document.createTextNode(space));
      node.before(run);
      node.textContent = rest;
      run.append(span, node);
      if (!visibleText(parent)) {
        span.classList.add("fi-solo");
        if (parent.matches("button") && !parent.getAttribute("aria-label")) parent.setAttribute("aria-label", parent.title || shape || "Action");
      }
    }
  }
  function apply(root) {
    const el = root || document.body;
    if (!el || el.nodeType !== 1) return;
    if (el.matches(selector)) draw(el);
    el.querySelectorAll(selector).forEach(draw);
  }

  // What changed since the last frame, drawn once per frame.
  const OPTS = { childList: true, subtree: true, characterData: true };
  const frame = typeof requestAnimationFrame === "function" ? (f) => requestAnimationFrame(f) : (f) => setTimeout(f, 16);
  let pending = null;
  function flush() {
    const roots = pending;
    pending = null;
    observer.disconnect();
    roots.forEach((el) => {
      if (!el.isConnected) return;
      for (let up = el.parentElement; up; up = up.parentElement) if (roots.has(up)) return;   // an ancestor draws it
      apply(el);
    });
    observer.observe(document.body, OPTS);
  }
  const observer = new MutationObserver((records) => {
    if (!pending) { pending = new Set(); frame(flush); }
    for (const r of records) {
      const t = r.type === "characterData" ? r.target.parentElement : r.target;
      if (t) pending.add(t);
    }
  });
  function start() { apply(document.body); observer.observe(document.body, OPTS); }
  return { svg, tool: (id) => svg(names[id] || "grid"), apply, start };
})();

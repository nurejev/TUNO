// ======================================================================
// T19 — 🗂 Policy overview (R30). ENCA's list-policies view, Intune-side-out:
// every configured object in the tenant, in ONE flat set, with the thirteen
// surfaces as the filter.
//
// THE SURFACES LIVE IN A STICKY LEFT RAIL (build 10514) — T20's shape, Option
// A of a two-option mockup round. They shipped at 10458 as a horizontal grid
// of stat cards above the list, which read well and cost the top third of
// every screen; the rail gives them a permanent home and hands the full width
// to the answer. The rail wears T20's own .ep-rail / .ep-node classes rather
// than a second rail that drifts away from it — the TunoProgress argument,
// applied to a layout.
//
// OPTION B IS PARKED, NOT REJECTED: it kept a chip strip of counts above the
// list and let the rail carry names only, on the grounds that a rail row is a
// thin line of text and these counts are the tenant's shape at a glance. If
// the numbers read too quietly here, that strip is the change to make, and
// the rail stays either way. (.ov-surf* is left in the stylesheet: it is what
// Option B would put back.)
//
// THE READ IS T05's collect(), whole — the T12 rule, again: a second copy of
// thirteen-surface reading is how two tools start disagreeing about one
// tenant. Scopes are asked at the click (all thirteen surfaces' reads plus
// the directory read for group names — exactly what T05's own run asks), a
// card click opens THE SAME popout T05 opens (Docs.popoutHtml, extracted for
// this build so the template exists once), and the values on the cards have
// already passed the documenter's redaction gate because they are the
// documenter's rows.
//
// THE VERDICT ON A CARD IS THE HOUSE CLAIM, not a new one. "Assigned" means
// reaching somebody BY CONSTRUCTION (T12/T26): at least one include or
// tenant-wide target. "Excluded-only" is its own verdict, not a flavour of
// unassigned — the policy HAS assignments and every one of them says "not
// you", which is a different fault from nobody having been named at all
// (T09 makes the same distinction). An assignment filter caps reach at MAY,
// worn on the card, because the rule is evaluated by the service against
// inventory a browser cannot see. Per-device applicability and empty
// included groups are not evaluated here — the first is nobody's to
// evaluate from a tab, the second is 🩺 Assignment health's finding,
// pointed at rather than half-repeated.
//
// A surface that could not be read renders as a ⚠ rail row AND stays in the
// note above the list — named as unreadable, never silently absent, never
// zero — and it is not a filter, because filtering to a surface nobody read
// would be an empty grid pretending to be an answer. It keeps both homes
// deliberately: one red line in a rail is easier to skim past than the
// dashed card it replaced, and this is a finding rather than a decoration.
//
// ENCA's card classes (.scard, .state, .fchip) have lived unused in TUNO's
// stylesheet since the scaffold; this tool is the one that wears them.
// Reads only; no write scope is reachable from this file.
// ======================================================================
const OverviewTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lc = (s) => String(s || "").toLowerCase();

  let res = null, running = false;
  let surfFilter = "all", verdictFilter = "all";
  // Cards or list — T20's own seg (10477), ported rather than reinvented,
  // because two tools showing the same policies must offer the same two
  // faces or the eye has to relearn the screen. Cards default: the tenant
  // question ("what does this even have") is a scan, not a lookup. The
  // choice survives filtering and search, and resets on a fresh read.
  let view = "cards";

  // ---------------------------------------------------------- verdicts --
  const VERDICTS = [["all", "All"], ["assigned", "Assigned"], ["unassigned", "Unassigned"], ["excludedOnly", "Excluded-only"]];
  const VLABEL = Object.fromEntries(VERDICTS);
  // .state chip classes: green for reaching, red for nobody-named, amber for
  // the excluded-only contradiction — the same three colours the estate
  // tools use for good / gap / tension.
  const VCHIP = { assigned: "on", unassigned: "off", excludedOnly: "report" };

  function verdictOf(it) {
    const a = (it && it.assignments) || [];
    if (!a.length) return "unassigned";
    if (a.every((x) => x.kind === "Excluded")) return "excludedOnly";
    return "assigned";
  }
  // An assignment filter on any non-excluded target: reach becomes "may".
  const filterMay = (it) => ((it && it.assignments) || []).some((x) => x.kind !== "Excluded" && x.filterId);

  // ------------------------------------------------------------ shaping --
  const flat = () => {
    const out = [];
    if (res) for (const s of res.sections) for (const it of s.items) out.push({ sec: s, it, v: verdictOf(it) });
    return out;
  };
  const matches = (r, q) => {
    if (!q) return true;
    const { it, sec } = r;
    return lc(it.name).includes(q) || lc(it.type).includes(q) || lc(it.description).includes(q)
      || lc(it.platform).includes(q) || lc(sec.label).includes(q)
      || it.assignments.some((a) => lc(a.name).includes(q));
  };
  // Surface + search first (the chips count THIS set), verdict last.
  const surfed = (q) => flat().filter((r) => (surfFilter === "all" || r.sec.id === surfFilter) && matches(r, q));
  const shown = (q) => surfed(q).filter((r) => verdictFilter === "all" || r.v === verdictFilter);

  // -------------------------------------------------------------- cards --
  function reachCell(r) {
    const a = r.it.assignments;
    const exc = a.filter((x) => x.kind === "Excluded").length;
    const wide = a.some((x) => x.kind === "All devices" || x.kind === "All users");
    const inc = a.filter((x) => x.kind === "Included" || x.kind === "Other").length;
    // The filter is NAMED (10482). "⚑ filter — may" told a reader that
    // something narrowed this assignment and refused to say what; the
    // portal shows the name right beside the group, and so does this.
    const fl = (typeof Docs !== "undefined" && Docs.filtersOf) ? Docs.filtersOf(r.it) : [];
    const may = fl.length
      ? ` <span class="tag" title="${esc(fl.join("; "))}">⚑ ${esc(fl[0])}${fl.length > 1 ? ` +${fl.length - 1}` : ""} — may</span>`
      : (filterMay(r.it) ? ` <span class="tag">⚑ filter — may</span>` : "");
    if (r.v === "unassigned") return "nobody";
    if (r.v === "excludedOnly") return `nobody <span class="excl-note">(−${exc} excluded)</span>`;
    const base = wide ? `<span class="tag">tenant-wide</span>${inc ? ` + ${inc} group${inc === 1 ? "" : "s"}` : ""}`
      : `${inc} group${inc === 1 ? "" : "s"}`;
    return `${base}${exc ? ` <span class="excl-note">(−${exc})</span>` : ""}${may}`;
  }
  function includedCell(it) {
    const named = it.assignments.filter((x) => x.kind !== "Excluded");
    if (!named.length) return "—";
    const first = named[0].name || named[0].kind;
    return `${esc(first)}${named.length > 1 ? ` <span class="muted">+${named.length - 1}</span>` : ""}`;
  }
  function settingsCell(it) {
    if (it.detailError) return `<span style="color:var(--report)">unreadable</span>`;
    return it.rows.length ? `${it.rows.length} documented` : "—";
  }
  function card(r) {
    const { sec, it, v } = r;
    return `<div class="scard" data-open="${esc(sec.id)}|${esc(it.id)}">
      <div class="scard-top">
        <div class="scard-ic">${sec.icon || "🗂"}</div>
        <div class="scard-title"><h3>${esc(it.name)}</h3>
          <div class="mini"><span class="tag">${sec.icon || ""} ${esc(sec.label)}</span>${it.modified ? ` Modified ${esc(String(it.modified).slice(0, 10))}` : ""}</div></div>
        <div class="scard-right"><span class="state ${VCHIP[v]}">${VLABEL[v]}</span></div>
      </div>
      <div class="scard-grid">
        <div><label>Included</label><b>${includedCell(it)}</b></div>
        <div><label>Reach</label><b>${reachCell(r)}</b></div>
        <div><label>Platform</label><b>${esc(it.platform || "Not platform-specific")}</b></div>
        <div><label>Settings</label><b>${settingsCell(it)}</b></div>
      </div>
      <div class="scard-foot">ID: ${esc(it.id)}</div>
    </div>`;
  }

  // The list face: the same objects, one table row each — the house
  // .cg-table, a row click opening the same popout as a card click. The
  // columns are the card's own fields in the card's own order, plus the
  // surface, which a card carries as a chip and a row has nowhere else to
  // put.
  function row(r) {
    const { sec, it, v } = r;
    return `<tr class="ov-row" data-open="${esc(sec.id)}|${esc(it.id)}">
      <td><b>${esc(it.name)}</b></td>
      <td class="mini">${sec.icon || ""} ${esc(sec.label)}</td>
      <td class="mini">${includedCell(it)}</td>
      <td class="mini">${reachCell(r)}</td>
      <td class="mini">${esc(it.platform || "Not platform-specific")}</td>
      <td class="mini">${settingsCell(it)}</td>
      <td><span class="state ${VCHIP[v]}">${VLABEL[v]}</span></td>
    </tr>`;
  }

  // ------------------------------------------------------------- render --
  // THE SURFACES AS A RAIL (build 10514, Option A of a two-option mockup
  // round). They were a horizontal grid of cards above the list, which read
  // well and cost the top third of the screen on every tenant. T20 put its
  // nodes in a sticky left rail and the full width became the answer; this
  // is that, with T20's own classes rather than a second rail that drifts.
  //
  // OPTION B IS PARKED, NOT REJECTED. It kept a chip strip of counts above
  // the list and let the rail carry names only, because a rail row is a thin
  // line of text and these counts are the only at-a-glance read of the
  // tenant's shape. If the numbers turn out too quiet here, that strip is
  // the change — the rail stays either way.
  //
  // The unreadable surface keeps BOTH homes: a red rail row and the note
  // above the list. A surface that 403s must never read as empty, and one
  // red line in a rail is easier to skim past than a dashed card was.
  function renderSurfs() {
    const all = flat();
    const node = (id, icon, label, n, reach, extra) => {
      const nobody = n - reach;
      return `<div class="ep-node${surfFilter === id ? " active" : ""}" data-surf="${esc(id)}" role="button" tabindex="0"${extra || ""}>
        <span>${icon} ${esc(label)}</span>
        <span class="mini" style="margin-left:auto;white-space:nowrap">${n
          ? `<span class="ov-on">${reach}</span><span class="muted"> / ${n}</span>`
          : '<span class="muted">0</span>'}</span>
      </div>`;
    };
    const allReach = all.filter((r) => r.v === "assigned").length;
    const surf = res.sections.map((s) =>
      node(s.id, s.icon || "🗂", s.label, s.items.length,
        s.items.filter((i) => verdictOf(i) === "assigned").length)).join("");
    const failed = res.failed.map((f) => `<div class="ep-node" style="color:var(--off);cursor:default" title="${esc(f.error)}">
        <span>⚠ ${esc(f.label)}</span>
        <span class="mini" style="margin-left:auto">unread</span>
      </div>`).join("");
    $("ovRail").innerHTML =
      node("all", "🗂", "All surfaces", all.length, allReach)
      + '<p class="mini muted" style="margin:2px 10px 6px">assigned / configured</p><hr>'
      + surf + (failed ? "<hr>" + failed : "");
  }
  function renderChips(q) {
    const set = surfed(q);
    $("ovChips").innerHTML = VERDICTS.map(([k, label]) => {
      const n = k === "all" ? set.length : set.filter((r) => r.v === k).length;
      return `<button class="fchip${verdictFilter === k ? " active" : ""}" data-verdict="${k}">${label} (${n})</button>`;
    }).join("");
  }
  function renderCards(q) {
    const rows = shown(q);
    const host = $("ovCards");
    // The grid class comes off in list mode — a table dropped into a card
    // grid becomes one very narrow grid item, which is how this looked the
    // first time it was tried.
    host.classList.toggle("cards", view === "cards");
    host.innerHTML = !rows.length
      ? `<p class="mini muted" style="grid-column:1/-1">Nothing matches — the filters are the claim, not the tenant: clear a chip or the surface card and the objects come back.</p>`
      : view === "list"
        ? `<div class="cg-tablewrap" style="margin-top:0"><table class="cg-table"><thead><tr><th>Policy</th><th>Surface</th><th>Included</th><th>Reach</th><th>Platform</th><th>Settings</th><th>Verdict</th></tr></thead><tbody>${rows.map(row).join("")}</tbody></table></div>`
        : rows.map(card).join("");
    $("ovCount").textContent = `${rows.length} shown`;
  }
  function renderView() {
    const seg = $("ovViewSeg");
    if (!seg) return;
    seg.innerHTML = `<button type="button" data-ovview="cards" class="${view === "cards" ? "active" : ""}">🗂 Cards</button><button type="button" data-ovview="list" class="${view === "list" ? "active" : ""}">☰ List</button>`;
  }
  function render() {
    if (!res) return;
    const q = lc($("ovSearch").value.trim());
    renderSurfs(); renderView(); renderChips(q); renderCards(q);
  }

  // ------------------------------------------------------------- popout --
  function openPolicy(key) {
    const [secId, itemId] = String(key).split("|");
    const sec = res && res.sections.find((s) => s.id === secId);
    const it = sec && sec.items.find((x) => x.id === itemId);
    if (!it) return;
    $("ovModalBody").innerHTML = `
      ${Docs.popoutHtml(sec, it)}
      <div class="gu-m-foot">
        <div class="spacer"></div>
        <button class="btn primary" id="ovModalClose">Close</button>
      </div>`;
    $("ovModal").classList.add("open");
    $("ovModalClose").addEventListener("click", closePolicy);
    // Backdrop closes; clicking INSIDE must not — T05's rule, same reason.
    $("ovModal").onclick = (e) => { if (e.target === $("ovModal")) closePolicy(); };
    document.addEventListener("keydown", onEsc);
  }
  function closePolicy() {
    $("ovModal").classList.remove("open");
    document.removeEventListener("keydown", onEsc);
  }
  function onEsc(e) { if (e.key === "Escape") closePolicy(); }

  // ---------------------------------------------------------------- run --
  async function run() {
    if (running) return;
    running = true; $("ovRun").disabled = true;
    $("ovWrap").style.display = "none"; $("ovRail").innerHTML = ""; $("ovCards").innerHTML = ""; $("ovNotes").innerHTML = ""; $("ovBody").innerHTML = "";
    // The one way a read looks while it runs — TunoProgress, like every
    // other tool; 10458 shipped a hand-rolled text line, which is exactly
    // the divergence the shared implementation exists to prevent. The card
    // lives in #ovBody, a plain host, NOT in the .cards grid — a centred
    // progress card as a grid item would be the fifteenth subtly different
    // progress card.
    const prog = (m) => TunoProgress.show("ovBody", "ovProg", m);   // ENCA-style centred card (10397)
    try {
      prog("Checking permissions…");
      // The same union T05's own run asks: every surface's read scope plus
      // the directory read that names the groups. One consent moment for one
      // read of the whole tenant.
      await Graph.ensureScopes([...new Set([...Docs.scopesFor(Docs.allSectionIds()), ...Graph.SCOPES.directory])]);
      res = await Docs.collect({ onStatus: prog });
      surfFilter = "all"; verdictFilter = "all"; view = "cards"; $("ovSearch").value = "";
      const sum = Docs.summarize(res);
      const notes = [];
      notes.push(`${sum.total} object${sum.total === 1 ? "" : "s"} across ${sum.sections} surface${sum.sections === 1 ? "" : "s"}.`);
      if (res.failed.length) notes.push(`${res.failed.length} surface${res.failed.length === 1 ? "" : "s"} could not be read — shown as unreadable below, never as zero.`);
      if (res.partial.length) notes.push(`Partly read: ${res.partial.map((p) => esc(p.label)).join(", ")}.`);
      if (res.nameError) notes.push(`Group names could not be resolved (${esc(res.nameError)}) — assignments show GUIDs.`);
      if (res.filterError) notes.push(`Assignment filter names could not be read (${esc(res.filterError)}) — a filtered assignment says it is filtered and shows the id, never nothing.`);
      if (sum.noSettings) notes.push(`${sum.noSettings} listed without readable settings — said on the card, not omitted.`);
      $("ovNotes").innerHTML = `<p class="mini muted" style="margin:10px 0 0">${notes.join(" ")}</p>`;
      $("ovWrap").style.display = "";
      prog("");
      render();
    } catch (e) {
      prog("");
      $("ovNotes").innerHTML = `<div class="gu-fail" style="margin-top:12px"><b>The read failed.</b><span class="why">${esc((e && e.message) || e)}</span></div>`;
    } finally { running = false; $("ovRun").disabled = false; }
  }

  // --------------------------------------------------------------- init --
  function init() {
    if (!$("ovRun")) return;
    $("ovRun").addEventListener("click", run);
    // The search box lives in the STATIC toolbar and is never re-rendered —
    // typing must survive the list redrawing under it, T15's lesson.
    $("ovSearch").addEventListener("input", () => { const q = lc($("ovSearch").value.trim()); renderChips(q); renderCards(q); });
    $("ovChips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-verdict]"); if (!b) return;
      const k = b.getAttribute("data-verdict");
      verdictFilter = (verdictFilter === k && k !== "all") ? "all" : k;   // click again for everything
      render();
    });
    // The seg lives in the STATIC toolbar beside the search box, for the
    // same reason the search box does: it must not be re-rendered out from
    // under a click.
    $("ovViewSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-ovview]"); if (!b) return;
      const k = b.getAttribute("data-ovview");
      if (k === view) return;
      view = k;
      renderView(); renderCards(lc($("ovSearch").value.trim()));
    });
    $("ovRail").addEventListener("click", (e) => {
      const c = e.target.closest("[data-surf]"); if (!c) return;
      const k = c.getAttribute("data-surf");
      surfFilter = (surfFilter === k && k !== "all") ? "all" : k;         // click again for everything
      render();
    });
    $("ovCards").addEventListener("click", (e) => {
      const c = e.target.closest("[data-open]"); if (!c) return;
      openPolicy(c.getAttribute("data-open"));
    });
  }

  return {
    init, run,
    // pure seams, driven by the headless tests
    verdictOf, filterMay,
    _view: () => view,
    // for the headless tests only — the real res is set by run()
    _setForTest: (r) => { res = r; surfFilter = "all"; verdictFilter = "all"; view = "cards"; render(); },   // mirrors run()'s reset
    _state: () => ({ surfFilter, verdictFilter }),
  };
})();

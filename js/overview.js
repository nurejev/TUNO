// ======================================================================
// T19 — 🗂 Policy overview (R30). ENCA's list-policies view, Intune-side-out:
// every configured object in the tenant as clickable cards, in ONE flat grid,
// with the thirteen surfaces as stat cards on top that double as filters —
// Option B of the two-option mockup round, Mihai's pick.
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
// A surface that could not be read renders as its own ⚠ card — named as
// unreadable, never silently absent, never zero — and it is not a filter,
// because filtering to a surface nobody read would be an empty grid
// pretending to be an answer.
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

  // ------------------------------------------------------------- render --
  function renderSurfs() {
    const all = flat();
    const surf = res.sections.map((s) => {
      const reach = s.items.filter((i) => verdictOf(i) === "assigned").length;
      const nobody = s.items.length - reach;
      return `<div class="ov-surf${surfFilter === s.id ? " active" : ""}" data-surf="${esc(s.id)}" role="button" tabindex="0">
        <div class="ov-surf-ic">${s.icon || "🗂"}</div>
        <div><b>${esc(s.label)}</b><div class="mini">${s.items.length}${s.items.length ? ` · <span class="ov-on">${reach} assigned</span>${nobody ? ` · <span class="ov-off">${nobody} nobody</span>` : ""}` : ""}</div></div>
      </div>`;
    }).join("");
    const failed = res.failed.map((f) => `<div class="ov-surf ov-fail" title="${esc(f.error)}">
        <div class="ov-surf-ic">⚠</div>
        <div><b>${esc(f.label)}</b><div class="mini">could not be read — unknown, not zero</div></div>
      </div>`).join("");
    const allReach = all.filter((r) => r.v === "assigned").length;
    $("ovSurfs").innerHTML = `<div class="ov-surf${surfFilter === "all" ? " active" : ""}" data-surf="all" role="button" tabindex="0">
        <div class="ov-surf-ic">🗂</div>
        <div><b>All surfaces</b><div class="mini">${all.length} · <span class="ov-on">${allReach} assigned</span>${all.length - allReach ? ` · <span class="ov-off">${all.length - allReach} nobody</span>` : ""}</div></div>
      </div>${surf}${failed}`;
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
    $("ovCards").innerHTML = rows.length
      ? rows.map(card).join("")
      : `<p class="mini muted" style="grid-column:1/-1">Nothing matches — the filters are the claim, not the tenant: clear a chip or the surface card and the objects come back.</p>`;
    $("ovCount").textContent = `${rows.length} shown`;
  }
  function render() {
    if (!res) return;
    const q = lc($("ovSearch").value.trim());
    renderSurfs(); renderChips(q); renderCards(q);
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
    $("ovToolbar").style.display = "none"; $("ovSurfs").innerHTML = ""; $("ovCards").innerHTML = ""; $("ovNotes").innerHTML = ""; $("ovBody").innerHTML = "";
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
      surfFilter = "all"; verdictFilter = "all"; $("ovSearch").value = "";
      const sum = Docs.summarize(res);
      const notes = [];
      notes.push(`${sum.total} object${sum.total === 1 ? "" : "s"} across ${sum.sections} surface${sum.sections === 1 ? "" : "s"}.`);
      if (res.failed.length) notes.push(`${res.failed.length} surface${res.failed.length === 1 ? "" : "s"} could not be read — shown as unreadable below, never as zero.`);
      if (res.partial.length) notes.push(`Partly read: ${res.partial.map((p) => esc(p.label)).join(", ")}.`);
      if (res.nameError) notes.push(`Group names could not be resolved (${esc(res.nameError)}) — assignments show GUIDs.`);
      if (res.filterError) notes.push(`Assignment filter names could not be read (${esc(res.filterError)}) — a filtered assignment says it is filtered and shows the id, never nothing.`);
      if (sum.noSettings) notes.push(`${sum.noSettings} listed without readable settings — said on the card, not omitted.`);
      $("ovNotes").innerHTML = `<p class="mini muted" style="margin:10px 0 0">${notes.join(" ")}</p>`;
      $("ovToolbar").style.display = "";
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
    $("ovSurfs").addEventListener("click", (e) => {
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
    // for the headless tests only — the real res is set by run()
    _setForTest: (r) => { res = r; surfFilter = "all"; verdictFilter = "all"; render(); },
    _state: () => ({ surfFilter, verdictFilter }),
  };
})();

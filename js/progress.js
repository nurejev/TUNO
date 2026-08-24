// ======================================================================
// TunoProgress — the one way a read looks while it runs (build 10397).
//
// ENCA's shape: a centred card in the middle of the result area — spinner,
// the current step, and the cg-progress bar the stylesheet has carried
// since the scaffold without anything using it. Determinate when the
// caller knows n-of-of (a pooled N+1, a batched sweep), indeterminate
// when it only knows the step name.
//
// Every tool's prog() delegates here with its own body and line ids, so
// fourteen tools share ONE implementation — fourteen hand-rolled progress
// cards is how fourteen subtly different ones happen (the tab-strip
// lesson, the suggest lesson, the padding lesson; it keeps being true).
//
// TWO RULES, BOTH LOAD-BEARING:
//   * RESULTS ARE NEVER COVERED. The card only appears in an EMPTY body —
//     a tool that re-reads over existing results keeps its small text
//     line, because painting a spinner over an answer somebody is reading
//     is worse than a quiet line under it.
//   * AN EMPTY MESSAGE CLEARS. prog("") has always meant "done" in every
//     tool; here it removes the card and the line together, and a body
//     that got its results meanwhile is left exactly alone.
// ======================================================================
const TunoProgress = (() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  function show(bodyId, lineId, msg, n, of) {
    const line = lineId ? document.getElementById(lineId) : null;
    if (line) line.innerHTML = msg ? `${of ? `<b>${n}/${of}</b> · ` : ""}${esc(msg)}` : "";
    const body = bodyId ? document.getElementById(bodyId) : null;
    if (!body) return;
    let card = body.querySelector(":scope > .prog-card");
    if (!msg) { if (card) card.remove(); return; }
    // never cover results: only an empty body, or our own card, is taken
    if (!card && body.childElementCount) return;
    const pct = (Number.isFinite(of) && of > 0) ? Math.min(100, Math.max(2, Math.round((n / of) * 100))) : null;
    if (!card) {
      card = document.createElement("div");
      card.className = "list-card prog-card";
      body.appendChild(card);
    }
    card.innerHTML = `<div class="spinner"></div>
      <p class="mini" style="margin:0 0 10px">${esc(msg)}</p>
      <div class="cg-progress${pct == null ? " indet" : ""}"><div style="width:${pct == null ? 30 : pct}%"></div></div>
      ${pct != null ? `<p class="mini muted" style="margin:6px 0 0">${n} / ${of}</p>` : ""}`;
  }

  return { show };
})();

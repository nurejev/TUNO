// ======================================================================
// TunoReport — the Markdown report viewer (build 10478). ENCA's
// mdToHtml + showReport, ported verbatim from her app.js: a report a
// tool can write is a report you can READ before deciding to download
// it. The .md-view styles have sat in TUNO's stylesheet since the
// scaffold waiting for exactly this module — the T19 story again.
//
// THE RENDERER IS DELIBERATELY SMALL — headings, tables, lists, bold,
// italics, inline code, links, rules: the subset the reports actually
// emit. Everything is escaped FIRST and inline markup applied to the
// escaped text, so a policy name containing "<" can never become markup.
// [label](#tool:toolX) anchors are in-app jumps, resolved by the
// delegated click below; downloaded Markdown keeps a readable link
// either way.
//
// One viewer for every tool — the fifteenth subtly different report
// modal is how report modals go wrong (the progress-card lesson, again).
// ======================================================================
const TunoReport = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  function mdToHtml(md) {
    const inline = (s) => esc(s)
      .replace(/\[([^\]]+)\]\(#tool:([A-Za-z]+)\)/g,
        (m, label, tool) => `<a href="#" class="md-tool" data-tool="${tool}">${label}</a>`)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (m, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[\s(])_([^_]+)_(?=[\s.,)]|$)/g, "$1<i>$2</i>")
      .replace(/❌/g, '<span class="md-bad">❌</span>')
      .replace(/✅|✓/g, (m) => `<span class="md-ok">${m}</span>`);
    const lines = String(md || "").split("\n");
    const out = [];
    let list = null, table = null;
    const closeList = () => { if (list) { out.push(list === "ol" ? "</ol>" : "</ul>"); list = null; } };
    const closeTable = () => { if (table) { out.push("</tbody></table>"); table = null; } };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const row = /^\s*\|(.+)\|\s*$/.exec(ln);
      if (row) {
        const cells = row[1].split("|").map((c) => c.trim());
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
        if (!table) { out.push(`<table><thead><tr>${cells.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`); table = true; continue; }
        out.push(`<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
        continue;
      }
      closeTable();
      const h = /^(#{1,4})\s+(.*)$/.exec(ln);
      if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
      // A blockquote renders as the callout paragraph it is in the reports.
      const q = /^\s*>\s?(.*)$/.exec(ln);
      if (q) { closeList(); out.push(`<p class="md-quote">${inline(q[1])}</p>`); continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(ln)) { closeList(); out.push("<hr>"); continue; }
      const li = /^\s*[-*]\s+(.*)$/.exec(ln);
      if (li) { if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(li[1])}</li>`); continue; }
      const oli = /^\s*\d+\.\s+(.*)$/.exec(ln);
      if (oli) { if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(oli[1])}</li>`); continue; }
      closeList();
      if (ln.trim()) out.push(`<p>${inline(ln)}</p>`);
    }
    closeList(); closeTable();
    return out.join("\n");
  }

  // Show a report on screen AND keep it downloadable — the file name is
  // the one the tool's own export writes, so reading first costs nothing.
  let current = null;
  function show(title, filename, md) {
    current = { filename, md };
    $("rptTitle").textContent = title;
    $("rptBody").innerHTML = mdToHtml(md);
    $("rptBody").scrollTop = 0;
    $("reportModal").classList.add("open");
  }
  function close() { $("reportModal").classList.remove("open"); }
  function onEsc(e) { if (e.key === "Escape") close(); }

  function init() {
    if (!$("reportModal")) return;
    $("rptClose").addEventListener("click", close);
    $("reportModal").addEventListener("click", (e) => { if (e.target === $("reportModal")) close(); });
    document.addEventListener("keydown", (e) => { if ($("reportModal").classList.contains("open")) onEsc(e); });
    $("rptDownload").addEventListener("click", () => {
      if (!current) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([current.md], { type: "text/markdown;charset=utf-8" }));
      a.download = current.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    $("rptCopy").addEventListener("click", async () => {
      if (!current) return;
      const b = $("rptCopy"), was = b.textContent;
      try { await navigator.clipboard.writeText(current.md); b.textContent = "Copied ✓"; }
      catch (e) { b.textContent = "Could not copy — use Download"; }
      setTimeout(() => { b.textContent = was; }, 1600);
    });
    // [label](#tool:toolX) — the in-app jump: the tile's own click handler
    // is the one source of open-a-tool behaviour, so delegate to it.
    $("rptBody").addEventListener("click", (e) => {
      const t = e.target.closest(".md-tool");
      if (!t) return;
      e.preventDefault();
      const tile = document.getElementById(t.getAttribute("data-tool"));
      if (tile) { close(); tile.click(); }
    });
  }

  return { init, show, close, mdToHtml };
})();

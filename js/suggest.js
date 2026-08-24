// ======================================================================
// Suggest — tenant-backed autocomplete for every input that names a
// directory object (build 10388).
//
// One component, one registry. Six inputs across four tools take a group,
// a user or a device by name; before this, each was a blind text box and
// the first feedback was the run failing to resolve. Now they type-ahead
// from the tenant — ONE implementation, because six copies of a dropdown
// is how six subtly different dropdowns happen.
//
// THE CONSENT RULE IS UNCHANGED: nothing is read on a keystroke unless the
// scope is ALREADY IN HAND this session. An input whose scope has not been
// granted shows a single row offering to enable suggestions — the read
// happens on that click, TUNO's incremental model, never as a side effect
// of typing. A user who ignores the row loses nothing: the tools resolve
// typed names exactly as before.
//
// SUGGESTIONS ARE STARTSWITH, SERVER-SIDE, AND HONEST ABOUT IT. Graph's
// $filter startswith is what every directory object supports; contains is
// not, and faking it by downloading the directory would be a sync wearing
// an autocomplete's hat. A device found by serial or GUID will not suggest
// — the placeholder already says those work typed in full.
//
// THE MENU IS position:fixed ON BODY, not a child of the input's card —
// the sidebar taught this lesson: anything absolutely positioned inside an
// overflow container clips at the container's edge.
//
// What is picked: a group or device fills its DISPLAY NAME (what the tools
// resolve); a user fills the UPN, because two people can share a display
// name and a UPN is still readable. Object IDs keep working typed by hand.
// ======================================================================
const Suggest = (() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ---- fetchers: what each kind asks the tenant ----
  const KINDS = {
    group: {
      scopes: () => Graph.SCOPES.groups,
      label: "groups",
      fetch: async (q) => (await Graph.searchGroups(q)).slice(0, 8).map((g) => ({
        value: g.displayName || g.id,
        name: g.displayName || g.id,
        hint: [g.membershipRule ? "dynamic" : "", (g.id || "").slice(0, 8) + "…"].filter(Boolean).join(" · "),
      })),
    },
    user: {
      scopes: () => Graph.SCOPES.directory,
      label: "users",
      fetch: async (q) => {
        const r = await Graph.get(
          Graph.odata`/users?$filter=startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')` +
          `&$select=id,displayName,userPrincipalName&$top=8`, { scopes: Graph.SCOPES.directory });
        return ((r && r.value) || []).map((u) => ({
          value: u.userPrincipalName || u.displayName,
          name: u.displayName || u.userPrincipalName,
          hint: u.userPrincipalName || "",
        }));
      },
    },
    device: {
      scopes: () => Graph.SCOPES.deviceObjects,
      label: "devices",
      fetch: async (q) => {
        const r = await Graph.get(
          Graph.odata`/devices?$filter=startswith(displayName,'${q}')` +
          `&$select=id,displayName,operatingSystem&$top=8`, { scopes: Graph.SCOPES.deviceObjects });
        return ((r && r.value) || []).map((d) => ({
          value: d.displayName,
          name: d.displayName,
          hint: d.operatingSystem || "",
        }));
      },
    },
  };

  // ---- the one menu (shared — only one input has focus at a time) ----
  let menu = null, items = [], active = -1, current = null;
  function ensureMenu() {
    if (menu) return menu;
    menu = document.createElement("div");
    menu.className = "sug-menu";
    menu.style.display = "none";
    document.body.appendChild(menu);
    // mousedown, not click: click fires after blur has already closed us
    menu.addEventListener("mousedown", (e) => {
      const b = e.target.closest("[data-sug]");
      if (b) { e.preventDefault(); pick(+b.dataset.sug); }
      const en = e.target.closest("[data-sugenable]");
      if (en) { e.preventDefault(); enable(); }
    });
    return menu;
  }
  function close() { if (menu) menu.style.display = "none"; items = []; active = -1; }
  // Below the input when there is room, ABOVE it when there is not (build
  // 10402): the editor's group box lives in a bar at the bottom of the
  // viewport, and a menu opened downwards from there rendered off-screen —
  // which read as "autocomplete does not work" and was worse than a bug,
  // because the read had happened and the answer was invisible.
  function place(input) {
    const r = input.getBoundingClientRect();
    menu.style.left = `${Math.round(r.left)}px`;
    menu.style.minWidth = `${Math.round(r.width)}px`;
    const below = window.innerHeight - r.bottom;
    if (below < 300) {
      menu.style.top = "";
      menu.style.bottom = `${Math.round(window.innerHeight - r.top + 4)}px`;
    } else {
      menu.style.bottom = "";
      menu.style.top = `${Math.round(r.bottom + 4)}px`;
    }
  }
  function renderRows() {
    menu.innerHTML = items.map((it, i) =>
      `<button data-sug="${i}" class="${i === active ? "on" : ""}"><b>${esc(it.name)}</b>${it.hint ? ` <span class="mini muted">${esc(it.hint)}</span>` : ""}</button>`).join("");
    menu.style.display = items.length ? "block" : "none";
  }
  function renderEnable(kind) {
    menu.innerHTML = `<button data-sugenable><b>🔓 Enable suggestions</b> <span class="mini muted">reads ${esc(kind.label)} from the tenant — asks for ${esc(kind.scopes().join(", "))}</span></button>`;
    menu.style.display = "block";
  }

  function pick(i) {
    const it = items[i];
    if (!it || !current) return;
    const { input, opts } = current;
    if (opts.textarea) {
      // complete the CURRENT LINE — the compare box is one group per line
      const pos = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, pos), after = input.value.slice(pos);
      const ls = before.lastIndexOf("\n") + 1;
      const le = after.indexOf("\n");
      input.value = before.slice(0, ls) + it.value + (le === -1 ? "" : after.slice(le));
      const caret = ls + it.value.length;
      input.setSelectionRange(caret, caret);
    } else {
      input.value = it.value;
    }
    close();
    input.focus();
  }

  async function enable() {
    if (!current) return;
    const kind = KINDS[kindOf(current.opts)];
    try { await Graph.ensureScopes(kind.scopes()); query(current.input, current.opts); }
    catch { close(); }
  }

  const kindOf = (opts) => (typeof opts.kind === "function" ? opts.kind() : opts.kind);
  const termOf = (input, opts) => {
    if (!opts.textarea) return input.value.trim();
    const pos = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, pos);
    return before.slice(before.lastIndexOf("\n") + 1).trim();
  };

  let seq = 0;
  async function query(input, opts) {
    const kind = KINDS[kindOf(opts)];
    if (!kind || !Graph.signedIn()) return close();
    const term = termOf(input, opts);
    ensureMenu(); place(input);
    if (term.length < 2 || /^[0-9a-f-]{20,}$/i.test(term)) return close();   // ids resolve typed, not suggested
    if (!Graph.hasScopes(kind.scopes())) { current = { input, opts }; renderEnable(kind); return; }
    const my = ++seq;
    try {
      const got = await kind.fetch(term);
      if (my !== seq) return;   // a newer keystroke owns the menu
      current = { input, opts };
      items = got; active = -1;
      place(input);
      renderRows();
    } catch { close(); /* a failed suggestion is silence, never an error card */ }
  }

  const debounce = (fn, ms) => { let t = null; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function attach(input, opts) {
    const run = debounce(() => query(input, opts), 250);
    input.addEventListener("input", run);
    input.addEventListener("focus", run);
    input.addEventListener("blur", () => setTimeout(close, 150));
    input.addEventListener("keydown", (e) => {
      if (!menu || menu.style.display === "none" || !items.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, items.length - 1); renderRows(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); renderRows(); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); e.stopPropagation(); pick(active); }
      else if (e.key === "Escape") { close(); }
    }, true);   // capture: the tools' own Enter-to-run listeners must not fire while picking
  }

  // ---- the registry: every input that names a directory object ----
  // wfSubject's kind follows the User/Device segment live; everything else
  // is fixed. T01's pilot-group step keeps its own search — it already has
  // one, with the member count that step requires.
  function init() {
    const REG = [
      ["guTerm", { kind: "group" }],
      ["wfGroup", { kind: "group" }],
      ["aeGroup", { kind: "group" }],
      ["wfGroups", { kind: "group", textarea: true }],
      ["dvTerm", { kind: "device" }],
      ["wfSubject", { kind: () => (document.querySelector("#wfKindSeg .active") || {}).dataset?.wfkind === "device" ? "device" : "user" }],
    ];
    for (const [id, opts] of REG) {
      const el = document.getElementById(id);
      if (el) attach(el, opts);
    }
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
  }

  return { init, attach, KINDS, termOf };
})();

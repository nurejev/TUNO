// ======================================================================
// Parity slice 9 (build 10670): the command palette — ENCA's R03 (build
// 25006, the workspace entries 32407), TUNO's roadmap R38.
//
//   1. Ctrl/Cmd+K opens it once signed in; again, Escape and the backdrop
//      close it; signed out, and with Shift or Alt, the key is the browser's.
//   2. Tools: substrings, initials and T-numbers (an exact number first),
//      each row with its line icon and its name without the emoji; an empty
//      query lists the tools first, by name.
//   3. Arrows walk, Enter opens; a tool opens through its own tile.
//   4. Policies: the shared read, by name — as typed, punctuation and all —
//      with surface and platform; Enter opens 🗂 Policy overview on that
//      read with the policy's card.
//   5. A cold cache is said ("Read the tenant"), never searched around.
//   6. It is a named dialog, focus comes back when it closes, and the tool
//      library steps aside when it opens.
//   7. The roadmap and Help say so.
//
// Run with `npm test`, or alone:  node tests/shell/palette.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("palette");

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const appJs = read("js/app.js"), css = read("css/app.css"), html = read("index.html");
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
// The harness boots app.js without the shell, T19 or the dialog support
// (they load after it in index.html); evaluated here in their own order.
const start = async (opts) => {
  const o = opts || {};
  const w = boot();
  w.scrollTo = () => {};
  w.HTMLElement.prototype.getClientRects = function () { return [{ width: 10, height: 10 }]; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.eval(read("js/overview.js") + "\n;window.OverviewTool = OverviewTool;");
  w.OverviewTool.init();
  w.eval(read("js/flat-icons.js") + "\n;window.FlatIcons = FlatIcons;");
  w.eval(read("js/accessibility.js"));
  w.eval(read("js/workspaces.js"));
  if (o.cold) w.Graph.silentScopes = async () => false;     // no consent yet: no sign-in read
  if (o.signIn !== false) {
    w.document.getElementById("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
    if (o.cold) await tick(60);
    else for (let i = 0; i < 120 && !w.PolicyCache.get(); i++) await tick(50);
  }
  return w;
};
const press = (w, key, mods) => {
  const e = new w.KeyboardEvent("keydown", Object.assign({ key, bubbles: true, cancelable: true }, mods || {}));
  w.document.dispatchEvent(e);
  return e;
};
const isOpen = (w) => w.document.getElementById("cpModal").classList.contains("open");
const type = (w, q) => { const i = w.document.getElementById("cpInput"); i.value = q; i.dispatchEvent(new w.Event("input")); };
const rows = (w) => [...w.document.querySelectorAll("#cpList .cp-item")];
const names = (w) => rows(w).map((r) => r.querySelector("b").textContent);
// an svg string as the page serialises it, to compare with a row's icon
const norm = (w, h) => { const t = w.document.createElement("div"); t.innerHTML = h; return t.innerHTML; };

run(async () => {

// =====================================================================
head("The markup and the stylesheet are ENCA's");
{
  ok("one #cpModal, a .modal-bg with a .cp-modal panel", /<div class="modal-bg" id="cpModal">\s*<div class="modal cp-modal" aria-label="Command palette">/.test(html));
  ok("the input says what it finds, and is labelled", /<input id="cpInput" placeholder="Jump to a tool, or a policy by name…" autocomplete="off" spellcheck="false" aria-label="Command palette">/.test(html));
  ok("the foot names the keys and carries the scope note", /<kbd>↑<\/kbd><kbd>↓<\/kbd> move<\/span><span><kbd>↵<\/kbd> open<\/span><span><kbd>esc<\/kbd> close<\/span>/.test(html) && /id="cpScopeNote"/.test(html));
  ok("the palette sits high, as ENCA's does", /\.modal-bg\.cp-open\{align-items:flex-start;padding-top:12vh\}/.test(css) && /\.cp-modal\{max-width:620px;padding:0;overflow:hidden\}/.test(css));
  ok("a row's line icon is styled (TUNO)", /\.cp-item \.cp-ic\{display:inline-flex;flex:0 0 auto;color:var\(--muted\)\}/.test(css));
  ok("under the shell it still sits 12vh down, below the demo bar and clear of the ribbon (TUNO)", /body\.workspaces-shell \.modal-bg\.cp-open\{padding-top:calc\(var\(--demo-bar-h,0px\) \+ 12vh\)\}/.test(css));
  ok("on a phone a policy's surface goes under its name (TUNO)", /@media\(max-width:600px\)\{\.cp-item\.cp-pol\{flex-wrap:wrap;row-gap:3px\}/.test(css));
  ok("app.js carries ENCA's scorer: prefix 100, mid-word 60 down, initials 40 and 25", /if \(h\.startsWith\(s\) \|\| full\.startsWith\(s\)\) return 100;/.test(appJs) && /if \(initials\.startsWith\(s\)\) return 40;/.test(appJs) && /if \(initials\.includes\(s\)\) return 25;/.test(appJs));
}

// =====================================================================
head("Ctrl/Cmd+K: signed in only, and Shift or Alt stay the browser's");
{
  const w = await start({ signIn: false });
  const e = press(w, "k", { ctrlKey: true });
  ok("signed out, Ctrl+K does nothing and is not taken from the browser", !isOpen(w) && !e.defaultPrevented);
  const w2 = await start();
  const e2 = press(w2, "k", { ctrlKey: true });
  ok("signed in, Ctrl+K opens it", isOpen(w2) && e2.defaultPrevented);
  press(w2, "k", { ctrlKey: true });
  ok("Ctrl+K again closes it", !isOpen(w2));
  press(w2, "K", { metaKey: true });
  ok("⌘K opens it too (and a capital K)", isOpen(w2));
  press(w2, "Escape");
  ok("Escape closes it", !isOpen(w2));
  press(w2, "k", { ctrlKey: true });
  w2.document.getElementById("cpModal").dispatchEvent(new w2.MouseEvent("click", { bubbles: true }));
  ok("a click on the backdrop closes it", !isOpen(w2));
  press(w2, "k", { ctrlKey: true });
  w2.document.getElementById("cpInput").dispatchEvent(new w2.MouseEvent("click", { bubbles: true }));
  ok("a click inside does not", isOpen(w2));
  press(w2, "Escape");
  const e3 = press(w2, "k", { ctrlKey: true, shiftKey: true }), e4 = press(w2, "k", { ctrlKey: true, altKey: true });
  ok("Ctrl+Shift+K (Firefox's console) and Ctrl+Alt+K are left alone", !isOpen(w2) && !e3.defaultPrevented && !e4.defaultPrevented);
}

// =====================================================================
head("Tools: substrings, initials, T-numbers");
{
  const w = await start();
  press(w, "k", { ctrlKey: true });
  const first = () => names(w)[0];
  type(w, "gm"); ok("gm → Group migration (initials)", first() === "Group migration", first());
  type(w, "maa"); ok("maa → Multi-admin approval", first() === "Multi-admin approval", first());
  type(w, "asr"); ok("asr → Firewall & ASR coverage, before any policy", first() === "Firewall & ASR coverage" && rows(w)[0].querySelector(".cp-k").textContent === "Tool · T16", first());
  type(w, "laps"); ok("laps → Windows LAPS audit", first() === "Windows LAPS audit");
  for (const q of ["t17", "T17", "17"]) { type(w, q); ok(`${q} → T17, Multi-admin approval, the exact number first`, first() === "Multi-admin approval" && rows(w)[0].querySelector(".cp-k").textContent === "Tool · T17", first()); }
  type(w, "t5"); ok("t5 → T05 without the zero", first() === "Configuration documenter", first());
  type(w, "help"); ok("the app's own pages are tools too, without a number", names(w).indexOf("Help") >= 0 && rows(w)[names(w).indexOf("Help")].querySelector(".cp-k").textContent === "Tool");
  type(w, "");
  const tools = rows(w).filter((r) => /^Tool/.test(r.querySelector(".cp-k").textContent));
  // On beta 🚀 MDE rollout is in 02 (slice 13), so the switch to the other
  // side is an entry too — ENCA's 32407, first on an empty query as there.
  ok("an empty query lists the switch to the other side, then every tool, by name", names(w)[0] === "⇄ Switch to 02 · Projects" && rows(w)[0].querySelector(".cp-k").textContent === "Workspace 02 — temporary tools for customer projects"
    && tools.length === 31 && rows(w).slice(1, 32).every((r) => /^Tool/.test(r.querySelector(".cp-k").textContent))
    && names(w).slice(1, 32).join("|") === names(w).slice(1, 32).slice().sort((a, b) => a.localeCompare(b)).join("|"), names(w).slice(0, 4).join("|"));
  ok("every tool row leads with its line icon, and its name has no emoji", tools.every((r) => r.querySelector(".cp-ic svg.enca-icon")) && tools.every((r) => !/\p{Extended_Pictographic}/u.test(r.querySelector("b").textContent)));
  ok("the tool's own icon: Group migration's is the tool's", rows(w).find((r) => r.querySelector("b").textContent === "Group migration").querySelector(".cp-ic").innerHTML === norm(w, w.FlatIcons.tool("toolGroupMigrate")));
  ok("forty rows at most", rows(w).length <= 40);
}

// =====================================================================
head("Arrows walk, Enter opens — through the tool's own tile");
{
  const w = await start();
  press(w, "k", { ctrlKey: true });
  type(w, "assign");
  const n = rows(w).length;
  ok("the first row is selected", rows(w)[0].classList.contains("sel") && n > 1);
  press(w, "ArrowDown");
  ok("↓ moves down", rows(w)[1].classList.contains("sel") && !rows(w)[0].classList.contains("sel"));
  press(w, "ArrowUp"); press(w, "ArrowUp");
  ok("↑ from the top wraps to the last", rows(w)[n - 1].classList.contains("sel"));
  type(w, "group mig");
  press(w, "Enter");
  await tick(30);
  ok("Enter opens the tool and closes the palette", w.document.getElementById("screen-groupmigrate").classList.contains("active") && !isOpen(w));
  ok("as the tile would: its tab is open", !!w.document.querySelector('#toolNav [data-nav="toolGroupMigrate"]'));
  press(w, "k", { ctrlKey: true });
  type(w, "secure score");
  rows(w)[0].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick(30);
  ok("a click on a row opens it too", w.document.getElementById("screen-securescore").classList.contains("active") && !isOpen(w));
}

// =====================================================================
head("Policies: the shared read, by name, to the card in Policy overview");
{
  const w = await start();
  const res = w.PolicyCache.get();
  ok("the demo's sign-in read filled the shared cache", !!res);
  const all = res.sections.flatMap((s) => s.items.map((it) => ({ s, it })));
  press(w, "k", { ctrlKey: true });
  ok("the footer says how many policies, and when they were read", new RegExp(`^${all.length} policies searchable · read at \\S`).test(w.document.getElementById("cpScopeNote").textContent), w.document.getElementById("cpScopeNote").textContent);
  const pick = all.find((x) => /^[A-Za-z]/.test(x.it.name) && x.it.platforms && x.it.platforms.length);
  type(w, pick.it.name.slice(0, 14));
  const row = rows(w).find((r) => r.querySelector("b").textContent === pick.it.name);
  ok("part of a name finds the policy, shown exactly as read", !!row, pick.it.name);
  ok("its hint is its surface and platform", row && row.querySelector(".cp-k").textContent === [pick.s.label].concat(pick.it.platforms.slice(0, 2)).join(" · "), row && row.querySelector(".cp-k").textContent);
  ok("a policy row has the document icon", row && row.querySelector(".cp-ic").innerHTML === norm(w, w.FlatIcons.svg("file")));
  const punct = all.find((x) => /^[^A-Za-z0-9]/.test(x.it.name));
  if (punct) { type(w, punct.it.name.slice(0, 10)); ok("a name that opens with punctuation is found as typed", names(w).indexOf(punct.it.name) >= 0, punct.it.name.slice(0, 10)); }
  else ok("(the demo has no name opening with punctuation)", true);
  type(w, pick.it.name);
  const at = names(w).indexOf(pick.it.name);
  for (let i = 0; i < at; i++) press(w, "ArrowDown");
  press(w, "Enter");
  await tick(40);
  const D = w.document;
  ok("Enter opens Policy overview on the shared read", D.getElementById("screen-overview").classList.contains("active") && !isOpen(w));
  ok("with the policy's card open", D.getElementById("ovModal").classList.contains("open") && D.getElementById("ovModalBody").textContent.indexOf(pick.it.name) >= 0);
  ok("T19 says the read is the shared one", /From the sign-in read at/.test(D.getElementById("ovNotes").textContent));
  ok("no keystroke reached the tenant: the palette calls no Graph", !/Graph\.|fetch\(/.test(appJs.slice(appJs.indexOf("// ---------- Command palette"), appJs.indexOf("// ---------- tools ----------"))));
}

// =====================================================================
head("A cold cache is said, never searched around");
{
  const w = await start({ cold: true });
  ok("no consent yet: no sign-in read", !w.PolicyCache.get() && !w.PolicyCache.reading());
  press(w, "k", { ctrlKey: true });
  ok("the footer says policies come once the tenant is read", w.document.getElementById("cpScopeNote").textContent === "Policies once the tenant is read");
  type(w, "");
  ok("an empty query is the tools alone (and the switch to 02)", rows(w).length === 32 && rows(w).every((r) => /^(Tool|Workspace 02)/.test(r.querySelector(".cp-k").textContent)));
  type(w, "contoso baseline v9");
  ok("a name nobody can match yet offers the read instead of nothing", names(w).join("|") === "Read the tenant to search its policies" && rows(w)[0].querySelector(".cp-k").textContent === "Policy overview · T19");
  type(w, "laps");
  ok("and comes last after the tools that match", names(w)[0] === "Windows LAPS audit" && names(w)[names(w).length - 1] === "Read the tenant to search its policies");
  type(w, "contoso baseline v9");
  press(w, "Enter");
  await tick(30);
  ok("which opens Policy overview, where the read is one click", w.document.getElementById("screen-overview").classList.contains("active") && !!w.document.getElementById("ovRun"));
}

// =====================================================================
head("A named dialog; focus comes back; the library steps aside");
{
  const w = await start();
  const D = w.document;
  D.getElementById("wcHeaderTools").focus();
  press(w, "k", { ctrlKey: true });
  await tick(5);
  const panel = D.querySelector("#cpModal .cp-modal");
  ok("a modal dialog named Command palette (it has no heading)", panel.getAttribute("role") === "dialog" && panel.getAttribute("aria-modal") === "true" && panel.getAttribute("aria-label") === "Command palette");
  ok("focus is in the input", D.activeElement === D.getElementById("cpInput"));
  press(w, "Escape");
  await tick(5);
  ok("Escape gives focus back to where it was", D.activeElement === D.getElementById("wcHeaderTools"), D.activeElement && (D.activeElement.id || D.activeElement.tagName));
  const rb = D.getElementById("rbModal");
  rb.classList.add("open");
  await tick(5);
  ok("a dialog with a heading is still named by it (the RBAC member list)", rb.querySelector(".modal").getAttribute("aria-labelledby") === "rbModalTitle" && !rb.querySelector(".modal").hasAttribute("aria-label"));
  rb.classList.remove("open");
  await tick(5);
  D.getElementById("wcHeaderTools").click();
  await tick(5);
  ok("the tool library is open", D.getElementById("wcLauncher").open === true);
  press(w, "k", { metaKey: true });
  await tick(5);
  ok("⌘K closes it and opens the palette, which would otherwise sit under it", D.getElementById("wcLauncher").open === false && isOpen(w));
  const a11y = read("js/accessibility.js");
  ok("accessibility.js keeps a dialog's own aria-label", /else if\(!panel\.hasAttribute\('aria-label'\)\)panel\.setAttribute\('aria-label','Dialog'\);/.test(a11y));
}

// =====================================================================
head("The roadmap and Help say so");
{
  const w = boot();
  const D = w.document;
  const card = (ref) => [...D.querySelectorAll(".rm-card")].find((c) => [...c.querySelectorAll(".rm-ref")].some((r) => r.textContent === ref && r.parentElement.tagName === "H4"));
  const r38 = card("R38");
  ok("R38 is shipped, in beta today, live at 10670", r38 && r38.dataset.shipped === "1" && r38.closest(".rm-era.beta") && /live · beta 10670/.test(r38.querySelector("h4").textContent));
  ok("and has left Next", ![...D.querySelectorAll(".rm-era.next .rm-card .rm-ref")].some((r) => r.textContent === "R38"));
  // the tag counts the slices shipped so far, so it moves on with each one
  const upTo = +((/slices 1–(\d+) · beta \d+/.exec(card("R41").querySelector("h4").textContent) || [])[1] || 0);
  ok("R41 counts slice 9", upTo >= 9 && /Slice 9, the command palette \(beta 10670\)/.test(card("R41").textContent), String(upTo));
  ok("Help's Getting around names the keys", /Ctrl \+ K[\s\S]*⌘ \+ K on a Mac/.test(D.getElementById("screen-help").textContent));
}

});

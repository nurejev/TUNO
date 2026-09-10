// ======================================================================
// T23 catches up with ENCA's Restricted AUs (10610): the member and
// scoped-administrator boxes suggest from the tenant (25103), a ;-list
// completes the ENTRY being typed (25105), a migrated group's archived
// original is never offered as a member (25310), and a redraw keeps the
// scroll position (25130).
//
// Suggest is exercised against a fake Graph in jsdom; the T23 wiring is
// held as source. Run with `npm test`, or alone:
//   node tests/restrictedau/catchup.test.js
// ======================================================================
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch { console.error("jsdom is not installed. Run `npm install` at the repository root first."); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log("  ✗ " + n + (x ? "  → " + x : "")); } };
const head = (t) => console.log("\n" + t);

function boot() {
  const dom = new JSDOM('<!doctype html><body><input id="box"></body>', { runScripts: "outside-only", url: "https://nurejev.github.io/tuno-beta/" });
  const w = dom.window;
  const pre = `
    window.Graph = {
      SCOPES: { groups: ["Group.Read.All"], directory: ["User.Read.All", "Group.Read.All"], deviceObjects: [] },
      signedIn: () => true, hasScopes: () => true, ensureScopes: async () => true,
      odata: (strs, ...vals) => strs.reduce((a, s, i) => a + s + (i < vals.length ? String(vals[i]).replace(/'/g, "''") : ""), ""),
      searchGroups: async (q) => [
        { id: "g-live-0000", displayName: "CAB-Admins" },
        { id: "g-arch-0000", displayName: "CAB-Admins (migrated 2026-09-01)" },
        { id: "g-stat-0000", displayName: "CAB-Devs-static-2026" },
        { id: "g-more-0000", displayName: "CAB-Ops" },
      ].filter((g) => g.displayName.toLowerCase().startsWith(q.toLowerCase())),
      get: async (p) => ({ value: [{ id: "u1", displayName: "Tulip Ann", userPrincipalName: "tulip@contoso.com" }, { id: "u2", displayName: "Tulsa Bo", userPrincipalName: "tulsa@contoso.com" }].filter((u) => /startswith\\(displayName,'([^']*)'/.exec(p) && u.displayName.toLowerCase().startsWith(/startswith\\(displayName,'([^']*)'/.exec(p)[1].toLowerCase())) }),
    };
  `;
  const src = fs.readFileSync(path.join(ROOT, "js/suggest.js"), "utf8");
  w.eval(pre + "\n;\n" + src + "\n;Object.assign(window, { Suggest });");
  return w;
}
const setCaret = (el, v, pos) => { el.value = v; el.setSelectionRange(pos, pos); };

(async () => {

// =====================================================================
head("25105 — a ;-list searches the entry being typed and puts the pick back after what precedes it");
{
  const w = boot();
  const el = w.document.getElementById("box");
  const multi = { kind: "user", multi: true };
  setCaret(el, "a@x.com;tul", 11);
  ok("the term is the entry being typed, not the whole field", w.Suggest.termOf(el, multi) === "tul", w.Suggest.termOf(el, multi));
  setCaret(el, "a@x.com; tul", 12);
  ok("a space after the separator is not part of the term", w.Suggest.termOf(el, multi) === "tul");
  setCaret(el, "a@x.com, b@x.com", 7);
  ok("the caret decides which entry", w.Suggest.termOf(el, multi) === "a@x.com");
  ok("a plain box still searches the whole value", w.Suggest.termOf(el, { kind: "user" }) === "a@x.com, b@x.com");
  // pick: through the menu
  setCaret(el, "a@x.com; tul", 12);
  w.Suggest.attach(el, multi);
  el.dispatchEvent(new w.Event("input"));
  await new Promise((r) => setTimeout(r, 400));
  const menu = w.document.querySelector(".sug-menu");
  ok("the menu offers the users that start with the entry", menu && menu.style.display === "block" && /Tulip Ann/.test(menu.textContent) && /Tulsa Bo/.test(menu.textContent));
  menu.querySelector("[data-sug='0']").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  ok("the pick replaces ONLY that entry, keeping what precedes it", el.value === "a@x.com; tulip@contoso.com", el.value);
  ok("the caret sits after the pick", el.selectionStart === el.value.length);
  // an entry in the middle
  setCaret(el, "a@x.com; tul; c@x.com", 12);
  el.dispatchEvent(new w.Event("input"));
  await new Promise((r) => setTimeout(r, 400));
  menu.querySelector("[data-sug='1']").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  ok("a middle entry is replaced and the rest kept", el.value === "a@x.com; tulsa@contoso.com; c@x.com", el.value);
  // a plain box replaces the whole value, as before
  const el2 = w.document.createElement("input"); w.document.body.appendChild(el2);
  setCaret(el2, "tul", 3);
  w.Suggest.attach(el2, { kind: "user" });
  el2.dispatchEvent(new w.Event("input"));
  await new Promise((r) => setTimeout(r, 400));
  menu.querySelector("[data-sug='0']").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  ok("a plain box takes the pick as its whole value", el2.value === "tulip@contoso.com", el2.value);
  // the textarea rule is unchanged
  const ta = w.document.createElement("textarea"); w.document.body.appendChild(ta);
  ta.value = "one\ntw\nthree"; ta.setSelectionRange(6, 6);
  ok("a textarea still completes the current line", w.Suggest.termOf(ta, { kind: "group", textarea: true }) === "tw");
}

// =====================================================================
head("25310 — groups and users for the member box, and the archived original is never offered");
{
  const w = boot();
  const got = await w.Suggest.KINDS.groupUser.fetch("CAB");
  const names = got.map((x) => x.name);
  ok("groups are flagged as groups", got.length > 0 && got.every((x) => /group$/.test(x.hint)));
  ok("the live group is offered", names.includes("CAB-Admins"));
  ok("the '(migrated …)' original is not", !names.some((n) => /\(migrated /.test(n)), names.join(" | "));
  ok("nor a '-static-' conversion leftover", !names.some((n) => /-static-/.test(n)));
  ok("the other live group is there too", names.includes("CAB-Ops"));
  ok("the kind asks for the group and directory reads together", w.Suggest.KINDS.groupUser.scopes().includes("Group.Read.All") && w.Suggest.KINDS.groupUser.scopes().includes("User.Read.All"));
  const users = await w.Suggest.KINDS.groupUser.fetch("Tul");
  ok("a term that matches users lists them, flagged as users", users.length === 2 && users.every((x) => /user$/.test(x.hint)));
}

// =====================================================================
head("T23's wiring, and the scroll position through a redraw");
{
  const src = fs.readFileSync(path.join(ROOT, "js/restrictedau.js"), "utf8");
  ok("the member box suggests groups and users", /querySelectorAll\("\[data-raaddbox\]"\)\.forEach\(\(el\) => Suggest\.attach\(el, \{ kind: "groupUser" \}\)\)/.test(src));
  ok("the scoped-admin box suggests users, one entry at a time", /querySelectorAll\("\[data-raadminbox\]"\)\.forEach\(\(el\) => Suggest\.attach\(el, \{ kind: "user", multi: true \}\)\)/.test(src));
  ok("the create form's administrator box suggests users", /Suggest\.attach\(na, \{ kind: "user" \}\)/.test(src));
  ok("attached after each render, because the cards are rebuilt", /Attached after each render because the cards are rebuilt/.test(src));
  ok("the redraw keeps the scroll position", /const y = window\.scrollY;\s*\$\("raBody"\)\.innerHTML = `/.test(src) && /try \{ window\.scrollTo\(0, y\); \} catch/.test(src));
  ok("the tool still resolves what it is given — the boxes are not pickers", /keeps working — the boxes are not pickers/.test(src));
  const sug = fs.readFileSync(path.join(ROOT, "js/suggest.js"), "utf8");
  ok("Suggest reads T22's own ARCHIVE_SUFFIX when it is loaded, with a copy as the fallback", /GroupMigrate\.ARCHIVE_SUFFIX\) \|\| \//.test(sug));
}

console.log(`\nrestrictedau-catchup: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

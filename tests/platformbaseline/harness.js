// ======================================================================
// The platform baseline suites' shared boot (design finding 13, build 10595).
//
// TRACKED, AND THAT IS THE POINT. Every suite in this repository lived in
// _to_delete/ — untracked, on one laptop, and therefore not something a
// commit could be checked against by anyone else or by CI. The T24 review's
// last finding is that one, and these two suites are the first to move.
//
// THE WHOLE APP IS ONE eval PASS. `const` declarations do not survive
// separate eval()s in jsdom, so every source file is concatenated in the
// order index.html loads them and the module-scoped names are bridged onto
// window at the end. Boot once per block: the tools keep session state, and
// a suite that shared one window between blocks would be testing the order
// its own assertions happen to run in.
// ======================================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch {
  console.error("jsdom is not installed. Run `npm install` at the repository root first.");
  process.exit(2);
}

const FILES = [
  "js/branding.js", "js/selfhost.js", "js/version.js", "js/authConfig.js", "js/promote.js", "js/changelog.js",
  "js/msappcatalog.js", "js/demo.js", "js/graph.js", "js/suggest.js", "js/progress.js",
  "js/groupuse.js", "js/document.js", "js/policycache.js", "js/filterrules.js", "js/filters.js",
  "js/restore.js", "js/platformbaseline.js", "js/macbaseline.js", "js/winbaseline.js",
  "js/applocker.js", "js/app.js",
];

function boot() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://nurejev.github.io/tuno-beta/" });
  const w = dom.window;
  w.crypto = w.crypto || {};
  if (!w.crypto.getRandomValues) w.crypto.getRandomValues = (a) => { for (let i = 0; i < a.length; i++) a[i] = 1; return a; };
  if (!w.crypto.subtle) w.crypto.subtle = require("node:crypto").webcrypto.subtle;
  w.alert = () => {};
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
  const map = new Map();
  Object.defineProperty(w, "localStorage", { value: {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }, configurable: true });
  w.msal = undefined;              // MSAL degrades to a sign-in error, by design
  w.fetch = () => Promise.reject(new Error("no network in tests"));
  const src = FILES.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const bridge = ";Object.assign(window,{APP_BUILD,TOOL_VERSIONS,CHANGELOG,PROMOTE,Graph,PolicyCache,Docs,"
    + "PlatformBaseline,MacBaseline,MacBaselineTool,WinBaseline,WinBaselineTool,Restore,Filters});";
  const errs = [];
  const realErr = console.error, realLog = console.log;
  console.error = () => {}; console.log = () => {};      // MSAL's own init noise
  try { w.eval(src + "\n" + bridge); } catch (e) { errs.push(e.message); }
  console.error = realErr; console.log = realLog;
  if (errs.length) throw new Error("boot: " + errs[0]);
  w.Graph.ensureScopes = async () => true;
  w.Graph.silentScopes = async () => true;
  return w;
}

// A minimal collect() result the screen will accept, with one policy in it.
const readOf = (name, id) => ({
  sections: [{
    id: "settingsCatalog", label: "Settings catalog policies",
    items: [{ id: id || "p1", name, description: "", modified: "2026-06-02T00:00:00Z", created: "2026-06-01T00:00:00Z", assignments: [] }],
    raw: [{ id: id || "p1", name, __detail: [] }],
  }],
  failed: [],
});

const CAT = (kind, platform) => ({
  kind, platform, release: "R26.6", policies: [
    { key: "macos dcp apple firewall d enable macos firewall", name: "MACOS - DCP - Apple Firewall - D - Enable MACOS Firewall - R26.6 - v3.0",
      release: { y: 26, m: 6 }, version: "3.0", section: "settingsCatalog", sectionLabel: "Settings catalog policies",
      area: "SettingsCatalog", importable: true, body: { name: "x", settings: [] } },
  ],
});

// One counter per suite process; run() reports and sets the exit code.
function suite(name) {
  let pass = 0, fail = 0;
  const ok = (n, c, x) => { if (c) { pass++; } else { fail++; console.log("  ✗ " + n + (x ? "  → " + x : "")); } };
  const head = (t) => console.log("\n" + t);
  const run = (fn) => fn()
    .then(() => {
      console.log(`\n${name}: ${pass} passed, ${fail} failed\n`);
      process.exit(fail ? 1 : 0);
    })
    .catch((e) => { console.error(e); process.exit(1); });
  return { ok, head, run, ROOT, fs, path, boot, readOf, CAT };
}

module.exports = { suite, boot, readOf, CAT, ROOT, FILES };

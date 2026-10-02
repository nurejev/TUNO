// T01 — the tenant copy is the policy (build 10676, Mihai: "after deployment
// can't get the policy back in TUNO to analyze and adjust … errors after
// errors"; and his recap of the loop). The deployed profile is always
// reachable from Evidence, the description carries a one-line STAMP (never
// the XML), the last five drafts live in this browser, an already-enforced
// profile the draft only widens is a maintenance update instead of a first
// enforcement, the update in place takes the profile's mode from its values,
// and would-have-been-blocked is the middle light. Booted from index.html's
// own script list in demo mode, as the other suites are.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");

process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, label) {
  const end = Date.now() + (ms || 20000);
  for (;;) {
    let v = false; try { v = fn(); } catch { v = false; }
    if (v) return true;
    if (Date.now() > end) { console.error("timeout: " + (label || "")); return false; }
    await sleep(25);
  }
}
function boot() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const files = [...html.matchAll(/<script src="(js\/[^"?]+)\?v=\d+"><\/script>/g)].map((m) => m[1]);
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://nurejev.github.io/tuno-beta/" });
  const w = dom.window;
  w.crypto = w.crypto || {};
  if (!w.crypto.getRandomValues) w.crypto.getRandomValues = (a) => { for (let i = 0; i < a.length; i++) a[i] = 1; return a; };
  w.alert = () => {}; w.confirm = () => true;
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  const store = new Map();
  Object.defineProperty(w, "localStorage", { value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  }, configurable: true });
  w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
  w.msal = undefined;
  w.fetch = () => Promise.reject(new Error("no network in tests"));
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const bridge = ";Object.assign(window,{TOOL_VERSIONS,Graph,PolicyCache,AppLockerTool,TUNO_DEMO_GRAPH,APP_BUILD});";
  const realErr = console.error, realLog = console.log, realWarn = console.warn;
  console.error = () => {}; console.log = () => {}; console.warn = () => {};
  let err = null;
  try { w.eval(src + "\n" + bridge); } catch (e) { err = e; }
  console.error = realErr; console.log = realLog; console.warn = realWarn;
  if (err) throw err;
  w.Graph.ensureScopes = async () => true;
  w.Graph.silentScopes = async () => true;
  w.TUNO_DEMO_GRAPH.LATENCY_MS = 0;
  return { w, store };
}
const COL = (type, mode, rules) => `<RuleCollection Type="${type}" EnforcementMode="${mode}">${rules}</RuleCollection>`;
const PATH = (id, name, p, action) => `<FilePathRule Id="${id}" Name="${name}" Description="" UserOrGroupSid="S-1-1-0" Action="${action || "Allow"}"><Conditions><FilePathCondition Path="${p}"/></Conditions></FilePathRule>`;
const G = "7c1e9f2a-1111-4222-8333-444455556666";
const profile = (mode, extra) => Object.assign({ id: "p-1", displayName: `AppLocker ${mode === "Enabled" ? "(Enforced)" : "(AuditOnly)"} V2.0`, description: "Made by hand.", lastModifiedDateTime: "2026-10-01T10:00:00Z", omaSettings: [
  { "@odata.type": "#microsoft.graph.omaSettingString", displayName: "EXE", omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/${G}/EXE/Policy`, value: COL("Exe", mode, PATH("a1", "Program Files", "%PROGRAMFILES%\\*") + PATH("a2", "Windows", "%WINDIR%\\*")) },
  { "@odata.type": "#microsoft.graph.omaSettingString", displayName: "MSI", omaUri: `./Device/Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/${G}/MSI/Policy`, value: COL("Msi", mode, PATH("b1", "All MSI", "*.*")) },
  { "@odata.type": "#microsoft.graph.omaSettingStringXml", displayName: "Script", fileName: "Script.xml", omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/${G}/Script/Policy`, value: Buffer.from("\ufeff<?xml version=\"1.0\"?>" + COL("Script", mode, PATH("c1", "Scripts", "%PROGRAMFILES%\\*")), "utf8").toString("base64") },
  { "@odata.type": "#microsoft.graph.omaSettingString", displayName: "StoreApps", omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/${G}/StoreApps/Policy`, value: `<AppLockerPolicy Version="1">${COL("Appx", mode, "")}</AppLockerPolicy>` },
] }, extra || {});

async function run() {
  const { w, store } = boot();
  const D = w.document, $ = (id) => D.getElementById(id);
  const T = w.AppLockerTool._tenant;

  // ---------------------------------------------------- the stamp --
  ok("fnv1a is deterministic and eight hex characters", T.fnv1a("abc") === T.fnv1a("abc") && /^[0-9a-f]{8}$/.test(T.fnv1a("abc")) && T.fnv1a("abc") !== T.fnv1a("abd"));
  const oma = profile("Enabled").omaSettings.slice(0, 2);
  const st = T.t01Stamp(oma, G);
  ok("the stamp is one line: build, grouping, the collections, a rule count, the hash and a UTC minute", new RegExp(`^\\[TUNO T01 · build ${w.APP_BUILD.build} · ${G} · EXE MSI · 3 rules · fnv:[0-9a-f]{8} · \\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\dZ\\]$`).test(st) && st.length < 200, st);
  ok("stampDescription keeps the admin's text and replaces an older stamp in place", T.stampDescription("Ops owns this.\n[TUNO T01 · build 1 · x · fnv:0 · old]", st) === "Ops owns this.\n" + st && T.stampDescription("", st) === st);
  const stamped = profile("Enabled", { description: T.stampDescription("Ops owns this.", T.t01Stamp(profile("Enabled").omaSettings, G)) });
  const s1 = T.stampOf(stamped);
  ok("stampOf reads the stamp back and sees no drift when the values are the ones it hashed", s1 && s1.build === String(w.APP_BUILD.build) && s1.drift === false && s1.hash === T.fnv1a(stamped.omaSettings.map((x) => x.value).join("\n")));
  const edited = JSON.parse(JSON.stringify(stamped)); edited.omaSettings[0].value = edited.omaSettings[0].value.replace("Windows", "Windows edited");
  ok("…and drift when a value was edited in the portal since", T.stampOf(edited).drift === true);
  const masked = JSON.parse(JSON.stringify(stamped)); masked.omaSettings[1].value = "****";
  ok("…and does not judge drift on masked values", T.stampOf(masked).drift === null);
  ok("a profile without a stamp is said to have none", T.stampOf(profile("Enabled")) === null);

  // ------------------------------------------- the profile is the policy --
  const P = T.policyOfProfile(profile("AuditOnly"));
  ok("the four OMA-URI values reassemble into one policy — plain, base64 XML-file with a BOM and a declaration, ./Device/ prefix, a wrapped value", P.collections.length === 4 && P.collections.map((c) => c.type).sort().join() === "Appx,Exe,Msi,Script");
  ok("…with the modes and rules kept", P.collections.every((c) => c.mode === "AuditOnly") && P.collections.find((c) => c.type === "Exe").rules.length === 2 && P.collections.find((c) => c.type === "Script").rules.length === 1);
  ok("the mode a profile runs is read from its values before its name", T.deployedMode(profile("Enabled", { displayName: "no token here" })) === "Enforce" && T.deployedMode(profile("AuditOnly", { displayName: "AppLocker (Enforced) V9" })) === "Audit");
  const unread = profile("Enabled"); unread.omaSettings.forEach((x) => { x.value = null; });
  ok("…the name second, the table's choice last", T.deployedMode(unread) === "Enforce" && T.deployedMode(Object.assign(unread, { displayName: "plain" }), "Audit") === "Audit" && T.deployedMode(Object.assign(unread, { displayName: "plain" }), "Enforce") === "Enforce");

  // ------------------------------------------- the screen, in demo mode --
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolAppLocker").click();
  await sleep(200);
  const card = () => $("alTenantCard");
  ok("the tenant card is on Evidence before anything is loaded, with the read button", card() && card().style.display !== "none" && !!card().querySelector("#alTcRead") && /No drafts saved in this browser yet/.test(card().textContent), JSON.stringify({ display: card() && card().style.display, read: !!(card() && card().querySelector("#alTcRead")), signed: w.Graph.signedIn(), text: card() && card().textContent.slice(0, 160) }));
  const intuneBody = T.intuneProfile; // the deploy's body, from the draft
  $("alNew").click();
  await sleep(50);
  ok("an empty draft is on the table", !!T.policy());
  const body = T.intuneProfile("Audit");
  ok("the deploy's body carries the stamp as the last line of its description, never the XML", /\n\[TUNO T01 · build \d+ · [^\]]+\]$/.test(body.description) && !/<RuleCollection/.test(body.description) && body.omaSettings.every((x) => /^<RuleCollection/.test(x.value)));
  // the drafts ring
  const r1 = T.saveDraftNow();
  ok("💾 saves the draft under the tenant's key, as the Policy XML", r1.ok && T.readDrafts().length === 1 && [...store.keys()].some((k) => /^tuno\.t01\.drafts\./.test(k)) && /<AppLockerPolicy/.test(T.readDrafts()[0].xml));
  for (let i = 0; i < 6; i++) T.saveDraftNow({ profileName: `copy ${i}` });
  ok("the ring keeps the last five, newest first", T.readDrafts().length === 5 && T.readDrafts()[0].profileName === "copy 5");
  ok("the card lists them with Load, XML and forget", card().querySelectorAll(".al-tc-load").length === 5 && card().querySelectorAll(".al-tc-dl").length === 5 && card().querySelectorAll(".al-tc-del").length === 5);
  card().querySelector('.al-tc-del[data-i="4"]').click();
  ok("forgetting one takes it off the ring", T.readDrafts().length === 4);
  const before = T.exportXml();
  T.loadSavedDraft(T.readDrafts()[0]);
  ok("a saved draft loads back through the XML parser as the draft", T.exportXml() === before && !!T.policy());

  // ------------------------------------ maintenance of an enforced profile --
  const pulled = T.policyOfProfile(profile("Enabled"));
  w.AppLockerTool._tenant.setAdopted({ id: "p-1", displayName: "AppLocker (Enforced) V2.0", enforced: true, snapshot: JSON.parse(JSON.stringify(pulled)), stamp: null });
  // put the pulled policy on the table through the saved-draft road
  T.saveDraftNow(); // (the current draft; replaced below)
  const widen = JSON.parse(JSON.stringify(pulled));
  widen.collections.find((c) => c.type === "Exe").rules.push({ id: "n1", name: "Vendor app", description: "", sid: "S-1-1-0", action: "Allow", conditions: [{ kind: "path", path: "%PROGRAMFILES%\\Vendor\\App.exe" }], exceptions: [] });
  // adopt the widened draft as the policy on the table: loadSavedDraft parses XML, so hand it an XML of the widened draft
  const xmlOf = (pol) => `<AppLockerPolicy Version="1">${pol.collections.map((c) => COL(c.type, c.mode, c.rules.map((r) => PATH(r.id, r.name, r.conditions[0].path, r.action)).join(""))).join("")}</AppLockerPolicy>`;
  const keep = T.adopted();
  T.loadSavedDraft({ xml: xmlOf(widen), name: "widened", at: "2026-10-02T09:00:00Z", grouping: G, mode: "Enforce" });
  T.setAdopted(keep); // loading replaced the draft and forgot the origin, as it must; this test pins the origin back
  const m = T.maintenanceUpdate();
  ok("an enforced profile the draft only widens is a maintenance update: one allow rule added", m && m.added === 1 && m.id === "p-1", JSON.stringify(m));
  const r = T.readiness();
  ok("…so readiness is ready with no reasons and says so", r.ready && r.reasons.length === 0 && /Enforced in the tenant · maintenance update \(1 allow rule added\)/.test(r.label));
  ok("…and the gates are one green gate naming the profile", T.enforceGates().length === 1 && T.enforceGates()[0].ok && /AppLocker \(Enforced\) V2\.0/.test(T.enforceGates()[0].detail));
  const narrow = JSON.parse(JSON.stringify(widen));
  narrow.collections.find((c) => c.type === "Exe").rules.push({ id: "n2", name: "Block tool", description: "", sid: "S-1-1-0", action: "Deny", conditions: [{ kind: "path", path: "%OSDRIVE%\\tool.exe" }], exceptions: [] });
  T.loadSavedDraft({ xml: xmlOf(narrow), name: "narrowed", at: "2026-10-02T09:01:00Z", grouping: G, mode: "Enforce" });
  T.setAdopted(keep);
  ok("a Deny rule added is not maintenance — the audit-first gates are back", T.maintenanceUpdate() === null && !T.readiness().ready && T.enforceGates().length === 3);
  T.loadSavedDraft({ xml: xmlOf(pulled), name: "same", at: "2026-10-02T09:02:00Z", grouping: G, mode: "Enforce" });
  ok("replacing the draft forgets where it was pulled from", T.adopted() === null);
  T.setAdopted({ id: "p-1", displayName: "x", enforced: false, snapshot: JSON.parse(JSON.stringify(pulled)), stamp: null });
  ok("a pulled AUDIT profile is never maintenance", T.maintenanceUpdate() === null);

  // ----------------------------------------------------- the lights --
  const css = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8");
  const js = fs.readFileSync(path.join(ROOT, "js/applocker.js"), "utf8");
  ok("would-have-been-blocked (audit) wears the middle light, blocked the red one", /\.tag\.audit\{background:var\(--warn-bg2\)/.test(css) && /tag audit">△ would be blocked \(audit\)/.test(js) && /tag block">✕ BLOCKED/.test(js));
  ok("the DLL collection is still never shipped", /if \(col\.type === "Dll"\) continue;/.test(js));

  console.log(`applocker/deployed: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

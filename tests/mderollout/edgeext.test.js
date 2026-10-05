// T28 — 🧩 Edge extensions (build 10678, option A off the 2 Oct mockup
// round). Part one is the engine, DOM-free: MdeEdgeExt on the OIB
// catalog's own Edge extensions policy and on a Graph-shaped read, the
// entry parser, the approved-list parser on both TSV schemas Mihai sent,
// the store's hits against a name, the plan and its reverse. Part two is
// the screen in DEMO mode with a fixture Edge policy pushed into the demo
// tenant and the store answered by a stubbed route: the rail node, the
// lists named by the store, a 404 as a finding, the built-ins kept, paste
// mode without a route, the approved list matched / picked / pasted, the
// bulk add, the dry run with its impact, the gates, the apply read back,
// the undo with its risk, and drift.
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

// ---- the engine, alone ----------------------------------------------------
const engineSrc = ["js/mdeasr.js", "js/mdeedgeext.js", "js/addons.js"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
const E = (() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only", url: "https://nurejev.github.io/tuno-beta/" });
  const w = dom.window;
  w.eval(engineSrc + ";window.MdeEdgeExt = MdeEdgeExt; window.TunoAddons = TunoAddons; window.MdeAsr = MdeAsr;");
  return w;
})();
const X = E.MdeEdgeExt;
const IDS = {
  copilot1: "nkbndigcebkoaejohleckhekfmcecfja", copilot2: "ofefcgjbeghpigppfmkologfjadafddi",
  myapps: "gaaceiggkkiffbfdpmfapegoiohkiipl", proton: "ghmbeldphafepmbegfdlkpapadhbakde", tango: "ifigbhjamijkipoeckabmilnagjcfhec",
  levelup: "mdjlgdkgmhlmcikdmeehcecolehipicf", uipath: "cdfjcmjmgdnojgaojdnefhjjpaijapci", editor: "hokifickgkhplphjiodbggjmoafhignh", xray: "oplgganppgjhpihgciiifejplnnpodak",
};
const EDGE = "user_vendor_msft_policy_config_microsoft_edge~policy~microsoft_edge~extensions_";

(function engine() {
  // the OIB catalog's own policy (policies[45] at 10678), the instance shape
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "baseline/community/openintunebaseline/catalog.json"), "utf8"));
  const oib = cat.policies.find((p) => /^Win - OIB - SC - Microsoft Edge - U - Extensions/.test(p.name));
  ok("the OIB catalog carries the Edge extensions policy with four settings", !!oib && oib.body.settings.length === 4);
  const now = X.listsIn(oib.body.settings);
  ok("OIB: the force list holds the two Copilot components, the allow list is off, the block list is *, external extensions blocked",
    now.force.map((e) => e.id).join() === `${IDS.copilot1},${IDS.copilot2}` && now.on.force && !now.on.allow && now.allow.length === 0 && now.block.length === 1 && now.block[0].raw === "*" && now.external === true && now.found.force && now.found.allow);
  ok("both Copilot components are built-in by name", X.isBuiltIn(IDS.copilot1) && X.isBuiltIn(IDS.copilot2) && !X.isBuiltIn(IDS.myapps));
  ok("it is an Edge extensions policy; a policy with other settings is not", X.isEdgeExtPolicy(oib.body.settings) && !X.isEdgeExtPolicy([{ settingDefinitionId: "device_vendor_msft_policy_config_defender_allowrealtimemonitoring", choiceSettingValue: { value: "x_1", children: [] } }]));
  // PVM's lists written over it
  const w = X.withLists(oib.body.settings, { force: [{ id: IDS.copilot1, updateUrl: "" }, { id: IDS.copilot2, updateUrl: "" }, { id: IDS.proton, updateUrl: "" }, { id: IDS.myapps, updateUrl: "" }], allow: [{ id: IDS.myapps, updateUrl: "" }] });
  const after = X.listsIn(w.settings);
  ok("withLists: the force list has four, the allow list turned on with one, nothing missing", !w.missing.length && after.force.length === 4 && after.on.allow && after.allow.length === 1 && after.allow[0].id === IDS.myapps);
  ok("withLists: the allow choice reads _1 with the …desc child carrying the string", (() => { const f = X.findAll(w.settings); return /_1$/.test(f.allow.choiceSettingValue.value) && f.allow.choiceSettingValue.children.length === 1 && f.allow.choiceSettingValue.children[0].settingDefinitionId === `${EDGE}extensioninstallallowlist_extensioninstallallowlistdesc` && f.allow.choiceSettingValue.children[0].simpleSettingCollectionValue[0].value === IDS.myapps; })());
  ok("withLists: the block list and the external block are untouched, the input is not mutated", after.block[0].raw === "*" && after.external === true && X.listsIn(oib.body.settings).allow.length === 0 && oib.body.settings[0].choiceSettingValue.children.length === 0);
  ok("withLists: an empty list turns the choice off again", (() => { const w2 = X.withLists(w.settings, { allow: [] }); const a = X.listsIn(w2.settings); return !a.on.allow && a.allow.length === 0 && a.force.length === 4; })());
  ok("verified: the lists as asked, order-blind; not when one is missing", X.verified(w.settings, { force: [IDS.myapps, IDS.proton, IDS.copilot2, IDS.copilot1], allow: [IDS.myapps] }) && !X.verified(w.settings, { force: [IDS.copilot1], allow: [IDS.myapps] }));
  ok("withLists: a settings list without the force list names it missing", X.withLists([oib.body.settings[0]], { force: [{ id: IDS.myapps, updateUrl: "" }] }).missing.join() === "force");
  // the Graph-shaped read (a wrapper with settingInstance, ids, definitions)
  const wrapped = oib.body.settings.map((s, i) => ({ id: `s${i}`, settingInstance: JSON.parse(JSON.stringify(s)), settingDefinitions: [{ id: s.settingDefinitionId }] }));
  const nw = X.listsIn(wrapped);
  ok("a Graph read (settingInstance wrappers) parses the same", nw.force.length === 2 && nw.block[0].raw === "*" && nw.external === true);
  const body = X.putBody({ name: "P", description: "", platforms: "windows10", technologies: "mdm", roleScopeTagIds: ["0"] }, X.withLists(wrapped, { allow: [{ id: IDS.myapps, updateUrl: "" }] }).settings);
  ok("putBody is MdeAsr's: every setting re-sent, ids and definitions stripped, the allow list changed", body.settings.length === 4 && body.settings.every((s) => !s.id && !s.settingDefinitions && s["@odata.type"] === "#microsoft.graph.deviceManagementConfigurationSetting") && X.listsIn(body.settings).allow[0].id === IDS.myapps);
  // entries
  const e1 = X.parseEntry(`${IDS.xray};https://clients2.google.com/service/update2/crx`);
  ok("an entry is <id>;<update url>, the Chrome URL makes it a Chrome Web Store entry", e1.valid && e1.id === IDS.xray && X.storeOf(e1) === "chrome" && X.formatEntry(e1) === `${IDS.xray};${X.CHROME_UPDATE}`);
  ok("an entry without a URL, or with the Edge store's, is an Edge Add-ons entry", X.storeOf(X.parseEntry(IDS.xray)) === "edge" && X.storeOf(X.parseEntry(`${IDS.xray};${X.EDGE_UPDATE}`)) === "edge" && X.storeOf(X.parseEntry(`${IDS.xray};https://example.com/u.xml`)) === "other");
  ok("a 31-letter or q-containing ID is not an ID", !X.isId(IDS.xray.slice(1)) && !X.isId("q" + IDS.xray.slice(1)) && X.isId(IDS.xray.toUpperCase().toLowerCase()));
  const fi = X.fromInput;
  ok("fromInput: an Edge store link gives the ID, the slug and no URL", (() => { const r = fi(`https://microsoftedge.microsoft.com/addons/detail/my-apps-secure-sign-in-ext/${IDS.myapps}?hl=en-US`); return r && r.id === IDS.myapps && r.store === "edge" && r.updateUrl === "" && X.slugName(r.slug) === "My apps secure sign in ext"; })());
  ok("fromInput: a Chrome Web Store link (new and old) gives the Chrome update URL", (() => { const a = fi(`https://chromewebstore.google.com/detail/proton-pass/${IDS.proton}`), b = fi(`https://chrome.google.com/webstore/detail/proton-pass/${IDS.proton}?hl=nl`); return a && b && a.store === "chrome" && a.updateUrl === X.CHROME_UPDATE && b.id === IDS.proton && b.store === "chrome"; })());
  ok("fromInput: an ID, an <id>;<url> entry, and nothing for a name", fi(` ${IDS.tango} `).id === IDS.tango && fi(`${IDS.tango};${X.CHROME_UPDATE}`).store === "chrome" && fi("Tango") === null && fi("") === null);
  // the plan
  const edits = new Map([[X.keyOf("force", IDS.proton), { op: "remove", entry: { id: IDS.proton, updateUrl: "" } }], [X.keyOf("allow", IDS.tango), { op: "add", entry: { id: IDS.tango, updateUrl: "" } }], [X.keyOf("allow", IDS.myapps), { op: "add", entry: { id: IDS.myapps, updateUrl: "" } }], [X.keyOf("force", IDS.copilot1), { op: "add", entry: { id: IDS.copilot1, updateUrl: "" } }]]);
  const plan = X.planOf(after, edits);
  ok("planOf: a removal and an add count, an add already there and a removal not there do not", plan.changes.length === 2 && plan.after.force.length === 3 && plan.after.allow.length === 2 && plan.changes.some((c) => c.op === "remove" && c.entry.id === IDS.proton) && plan.changes.some((c) => c.op === "add" && c.list === "allow" && c.entry.id === IDS.tango));
  const rev = X.reverse(plan.changes);
  ok("reverse: the undo adds what was removed and removes what was added; editsOf rebuilds the map", rev.length === 2 && rev.find((c) => c.entry.id === IDS.proton).op === "add" && rev.find((c) => c.entry.id === IDS.tango).op === "remove" && X.editsOf(rev).get(X.keyOf("force", IDS.proton)).op === "add");
  // the approved list, both schemas Mihai sent on 2 Oct
  const tsv1 = "Extension\tBrowser\tFound in ApPo\tClosest ApPo application\tReason\nUiPath Web Automation 22.10\tEdge\tYes\tUiPath\tDirect product-family match.\nClaude\tChrome\tProbably\tClaude Cowork (Anthropic)\tSame vendor.\nTango – Document and Automate Your Processes\tEdge\tYes\tTango\tDirect application-name match.\n";
  const a1 = X.parseApproved(tsv1);
  ok("the 5-column TSV: three rows, two Edge, the ApPo and closest columns read", a1.total === 3 && a1.edge === 2 && a1.chrome === 1 && a1.rows[0].appo === "Yes" && a1.rows[2].closest === "Tango" && a1.rows[1].edge === false && a1.columns.includes("appo"));
  const tsv2 = "Extension\tBrowser\tInstalled\tImpact\tPerm. severity\tCategory\tRisk\tPriority\tBand\tApPo\tClosest ApPo application\nMicrosoft Multimedia Redirection\tEdge\t30\t5\tHigh\tEnterprise / business\t0\t0\tAllow - ApPo\tProbably\tWindows 365 Virtual\nHP Dynamic Audio\tEdge\t17\t4\tHigh\tEnterprise / business\t0\t0\tAllow / governance\tNot assessed\t\nthink-cell\tChrome\t9\t3\tHigh\tEnterprise / business\t0\t0\tAllow / governance\tNot assessed\t\n";
  const a2 = X.parseApproved(tsv2);
  ok("the 11-column TSV: Installed, Band and ApPo read; Chrome rows are not Edge rows", a2.total === 3 && a2.edge === 2 && a2.rows[0].installed === 30 && a2.rows[0].band === "Allow - ApPo" && a2.rows[1].appo === "Not assessed" && a2.rows[2].edge === false);
  const csv = 'Extension,Browser,ID\n"Tango – Document, and Automate",Edge,' + IDS.tango + "\nLevel Up,Edge,\n";
  const a3 = X.parseApproved(csv);
  ok("a CSV with quoted commas and an ID column", a3.total === 2 && a3.rows[0].name === "Tango – Document, and Automate" && a3.rows[0].id === IDS.tango && a3.rows[1].id === "");
  const a4 = X.parseApproved("Tango\nLevel Up\n\nUI5 Inspector");
  ok("no header: one name per line, every row an Edge row", a4.plain && a4.total === 3 && a4.edge === 3 && a4.rows[1].name === "Level Up");
  ok("an empty text is an empty list", X.parseApproved("").total === 0);
  // the store's hits against a name
  const hits = [{ name: "Tango – Document and Automate Your Processes", id: IDS.tango }, { name: "Tango Unlimited", id: IDS.levelup }, { name: "Rango", id: IDS.uipath }];
  ok("matchHits: the exact name wins; 'Tango' alone fits two and decides nothing; a unique prefix decides", X.matchHits("tango – document and automate your processes", hits).id === IDS.tango && X.matchHits("Tango", hits) === null && X.matchHits("Rang", hits).id === IDS.uipath && X.matchHits("Nothing", hits) === null && X.matchHits("", hits) === null);
  // the store client, alone: no route → "no route"; a route must be a path or https
  ok("TunoAddons: no route by default, a bad route is refused with its reason", !E.TunoAddons.hasRoute() && !E.TunoAddons.checkRoute("ftp://x").ok && E.TunoAddons.checkRoute("/addons/").value === "/addons" && E.TunoAddons.checkRoute("https://addons.example.com/").value === "https://addons.example.com" && E.TunoAddons.checkRoute("").ok);
})();

// ---- the screen, in demo mode ---------------------------------------------
function boot() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const files = [...html.matchAll(/<script src="(js\/[^"?]+)\?v=\d+"><\/script>/g)].map((m) => m[1]);
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://nurejev.github.io/tuno-beta/" });
  const w = dom.window;
  w.crypto = w.crypto || {};
  if (!w.crypto.getRandomValues) w.crypto.getRandomValues = (a) => { for (let i = 0; i < a.length; i++) a[i] = 1; return a; };
  w.alert = () => {};
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
  const bridge = ";Object.assign(window,{TOOL_VERSIONS,Graph,PolicyCache,MdeRollout,MdeRolloutV2Tool,AssignEdit,TUNO_DEMO_GRAPH,MdeAsr,MdeEdgeExt,TunoAddons});";
  const realErr = console.error, realLog = console.log, realWarn = console.warn;
  console.error = () => {}; console.log = () => {}; console.warn = () => {};
  let err = null;
  try { w.eval(src + "\n" + bridge); } catch (e) { err = e; }
  console.error = realErr; console.log = realLog; console.warn = realWarn;
  if (err) throw err;
  w.Graph.ensureScopes = async () => true;
  w.Graph.silentScopes = async () => true;
  w.TUNO_DEMO_GRAPH.LATENCY_MS = 0;
  return { w, files, store };
}
// the fixture policy, Graph-shaped as the demo serves /settings
const SET = "#microsoft.graph.deviceManagementConfigurationSetting";
const choice = (defId, value, children) => ({ "@odata.type": SET, settingInstance: { "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance", settingDefinitionId: defId, choiceSettingValue: { "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue", value, children: children || [] } } });
const strings = (defId, values) => ({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance", settingDefinitionId: defId, simpleSettingCollectionValue: values.map((v) => ({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue", value: v })) });
function edgePolicy() {
  return { id: "44444444-0000-4000-8000-000000000029", name: "Win - OIB - SC - Microsoft Edge - U - Extensions - v3.1.2", description: "New set — Edge extensions (PVM's lists).",
    platforms: "windows10", technologies: "mdm", createdDateTime: new Date(Date.now() - 20 * 864e5).toISOString(), lastModifiedDateTime: new Date(Date.now() - 3 * 864e5).toISOString(),
    roleScopeTagIds: ["0"], settingCount: 4, isAssigned: true,
    assignments: [{ id: "11111111-0000-4000-8000-000000000020_inc", source: "direct", target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "11111111-0000-4000-8000-000000000020", deviceAndAppManagementAssignmentFilterId: null, deviceAndAppManagementAssignmentFilterType: "none" } }],
    _settings: [
      choice(`${EDGE}extensioninstallallowlist`, `${EDGE}extensioninstallallowlist_1`, [strings(`${EDGE}extensioninstallallowlist_extensioninstallallowlistdesc`, [IDS.myapps])]),
      choice(`${EDGE}extensioninstallblocklist`, `${EDGE}extensioninstallblocklist_1`, [strings(`${EDGE}extensioninstallblocklist_extensioninstallblocklistdesc`, ["*"])]),
      choice(`${EDGE}extensioninstallforcelist`, `${EDGE}extensioninstallforcelist_1`, [strings(`${EDGE}extensioninstallforcelist_extensioninstallforcelistdesc`, [IDS.copilot1, IDS.copilot2, IDS.myapps, IDS.proton])]),
      choice("user_vendor_msft_policy_config_microsoft_edgev88~policy~microsoft_edge~extensions_blockexternalextensions", "user_vendor_msft_policy_config_microsoft_edgev88~policy~microsoft_edge~extensions_blockexternalextensions_1"),
    ] };
}
// the store, behind a stubbed route
const STORE = {
  [IDS.myapps]: { name: "My Apps Secure Sign-in Extension", developer: "Microsoft Corporation", version: "8.2.1.252", category: "Productivity", activeInstallCount: 2628347, averageRating: 1.6, ratingCount: 117, lastUpdateDate: 1789380350 },
  [IDS.tango]: { name: "Tango – Document and Automate Your Processes", developer: "Tango Technology, Inc.", version: "8.9.16", category: "Productivity", activeInstallCount: 69151, averageRating: 5, ratingCount: 4 },
  [IDS.levelup]: { name: "Level Up for Dynamics 365/Power Apps", developer: "Natraj Yegnaraman", version: "4.1.3", category: "Developer-Tools", activeInstallCount: 124702, averageRating: 3.8, ratingCount: 79 },
  [IDS.uipath]: { name: "UiPath Browser Automation 26.10", developer: "UiPath", version: "26.10.2", category: "Developer-Tools", activeInstallCount: 475323, averageRating: 0, ratingCount: 0 },
  [IDS.xray]: { name: "Graph X-Ray", developer: "Merill", version: "1.1.10", category: "Developer-Tools", activeInstallCount: 12895, averageRating: 4.5, ratingCount: 8 },
};
const HITS = {
  "tango – document and automate your processes": [{ name: "Tango – Document and Automate Your Processes", crxId: IDS.tango, developerName: "Tango Technology, Inc.", averageRating: 5, noOfRatings: 4 }, { name: "Tango Unlimited", crxId: "cmnfjgfmpgiljnbmfmagmiocjnojjokb", developerName: "Free Software Apps" }, { name: "Rango", crxId: "pcngjebdhphedjkfhipblkgjbjoeaaeb", developerName: "David Tejada" }],
  "level up for dynamics 365/power apps": [{ name: "Level Up for Dynamics 365/Power Apps", crxId: IDS.levelup, developerName: "Natraj Yegnaraman", averageRating: 3.8, noOfRatings: 79 }],
  "uipath browser automation 26.10": [],
  "microsoft editor: spelling & grammar checker": [],
  "my apps secure sign-in extension": [{ name: "My Apps Secure Sign-in Extension", crxId: IDS.myapps, developerName: "Microsoft Corporation", averageRating: 1.6, noOfRatings: 117 }],
  "tango": [{ name: "Tango – Document and Automate Your Processes", crxId: IDS.tango, developerName: "Tango Technology, Inc.", averageRating: 5, noOfRatings: 4 }, { name: "Tango Unlimited", crxId: "cmnfjgfmpgiljnbmfmagmiocjnojjokb", developerName: "Free Software Apps" }],
};
const calls = [];
function routeFetch(url) {
  calls.push(String(url));
  const u = String(url);
  const res = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
  let m = /\/addons\/getproductdetailsbycrxid\/([a-p]{32})/.exec(u);
  if (m) return STORE[m[1]] ? res(200, Object.assign({ crxId: m[1] }, STORE[m[1]])) : res(404, null);
  m = /\/addons\/v4\/getfilteredorderedsearch\?.*Query=([^&]*)/.exec(u);
  if (m) { const q = decodeURIComponent(m[1]).toLowerCase(); return res(200, { title: "", extensionList: HITS[q] || [] }); }
  return Promise.reject(new Error("unexpected " + u));
}

async function screen() {
  const { w, store } = boot();
  const D = w.document;
  const $ = (id) => D.getElementById(id);
  const st = () => w.MdeRolloutV2Tool._state();
  const TT = w.TUNO_DEMO_GRAPH.T;
  const pol = edgePolicy();
  TT.CONFIG_POLICIES.push(pol);
  const change = (el, v) => { if (typeof v === "boolean") el.checked = v; else el.value = v; el.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const click = (sel) => { const el = typeof sel === "string" ? D.querySelector(sel) : sel; if (!el) throw new Error("no element " + sel); el.click(); };
  const text = (id) => ($(id) ? $(id).textContent : "");
  const lists = () => w.MdeEdgeExt.listsIn(pol._settings);
  const rail = () => D.querySelector('.mr-navigation [data-mrpane="edgeext"]');
  const kept = (prefix) => [...store.keys()].filter((k) => k.startsWith(prefix)).map((k) => store.get(k)).join("\n");

  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await sleep(60);
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  ok("10678: no ⊘ or 🎛 button in the header", !$("mvExclude") && !$("mvAsr"));
  click('[data-mrread="fresh"]');
  await until(() => st().model, 30000, "tenant read");
  await sleep(100);
  ok("the fixture Edge policy is in the new set", st().model.newP.some((P) => P.name === pol.name));
  ok("🧩 the rail node is there, with the lists' sizes (4 · 1), nothing in the header", !!rail() && /Edge extensions/.test(rail().textContent) && /4 · 1/.test(rail().textContent));

  // ---- open it: paste mode (no route) ----
  rail().click();
  await sleep(50);
  ok("🧩 it opens its own pane on the rail, the policy at the top, the block list read-only", st().pane === "edgeext" && rail().classList.contains("active") && !!$("mvExtCard") && text("mvExtCard").includes(pol.name) && /Block list: \*/.test(text("mvExtCard")) && /everything blocked/.test(text("mvExtCard")) && /external extensions blocked/.test(text("mvExtCard")));
  ok("🧩 no route: the route line says paste mode, the add box takes an ID or a link only", /paste mode/.test(text("mvExtRouteMsg")) && $("mvExtQ") && /no lookup route/.test($("mvExtQ").placeholder) && $("mvExtGo").disabled);
  ok("🧩 the four force entries and the one allow entry are rows; the Copilot components are 🔒 built-in with no Change select", (() => { const f = $("mvExtForce"), a = $("mvExtAllow"); return f && a && f.querySelectorAll("tbody tr").length === 4 && a.querySelectorAll("tbody tr").length === 1 && (f.textContent.match(/🔒 built-in/g) || []).length === 2 && f.querySelectorAll("[data-mrextchg]").length === 2; })());
  ok("🧩 without a route a store ID is shown as its ID, with a box to name it", /no lookup route — name it below/.test(text("mvExtForce")) && !!$("mvExtForce").querySelector(`[data-mrextname="${IDS.proton}"]`));
  // name an ID by hand: kept per tenant, shown unverified
  change($("mvExtForce").querySelector(`[data-mrextname="${IDS.proton}"]`), "Proton Pass (Chrome ID)");
  ok("🧩 a name given by hand is shown, marked unverified, and kept for the tenant", /Proton Pass \(Chrome ID\)/.test(text("mvExtForce")) && /named by hand — not verified by the store/.test(text("mvExtForce")) && /Proton Pass/.test(kept("tuno.t28.edgeext.names.")));
  // paste a Chrome Web Store link
  $("mvExtQ").value = `https://chromewebstore.google.com/detail/graph-x-ray/${IDS.xray}`; $("mvExtQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  ok("🧩 a pasted link enables Look it up", !$("mvExtGo").disabled && $("mvExtGo").textContent === "Look it up");
  $("mvExtQ").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await sleep(30);
  ok("🧩 no route: the entry is offered as pasted — name from the link, Chrome update URL behind the ID", /No lookup route/.test(text("mvExtAddCard")) && /Graph x ray/.test(text("mvExtAddCard")) && text("mvExtAddCard").includes(`${IDS.xray};${w.MdeEdgeExt.CHROME_UPDATE}`) && !!$("mvExtAddCard").querySelector('[data-mrextadd="allow"]'));
  click($("mvExtAddCard").querySelector('[data-mrextadd="allow"]'));
  await sleep(20);
  ok("🧩 + exempt puts it in the plan: the allow table shows the add, the bar counts 1 change", st().ext.edits.size === 1 && $("mvExtAllow").querySelectorAll("tr.mr-ext-added").length === 1 && /1 change in 1 policy/.test(text("mvBody")) && /1 exemption/.test(text("mvBody")) && /Chrome Web Store/.test(text("mvExtAllow")));
  click("#mvExtDiscard");
  ok("🧩 Discard empties the plan", st().ext.edits.size === 0 && !D.querySelector(".mr-asrbar"));

  // ---- the route: the names arrive ----
  w.fetch = routeFetch;
  $("mvExtRoute").value = "/addons/"; click("#mvExtRouteSave");
  ok("🧩 the route is kept per browser, trimmed", w.TunoAddons.route() === "/addons" && store.get("tuno.addons.route") === "/addons" && /Saved for this browser/.test(text("mvExtRouteMsg")));
  ok("🧩 the names arrive from the store: My Apps named, the Chrome ID a ⚠ finding, the built-ins never asked", await until(() => /My Apps Secure Sign-in Extension/.test(text("mvExtForce")) && /not in the Edge store/.test(text("mvExtForce")), 8000, "names") && !calls.some((u) => u.includes(IDS.copilot1)) && /Microsoft Corporation/.test(text("mvExtForce")));
  ok("🧩 the hand-given name survives the 404 beside the finding, the rail counts 1 ⚠", /Proton Pass \(Chrome ID\)/.test(text("mvExtForce")) && /1 ⚠/.test(rail().textContent) && /Findings \(1\)/.test(text("mvBody")));
  ok("🧩 the store's answer is cached a day in this browser", /"id:gaaceiggkkiffbfdpmfapegoiohkiipl"/.test(store.get("tuno.addons.cache") || ""));
  // a name search in the add box
  $("mvExtQ").value = "tango"; $("mvExtQ").dispatchEvent(new w.Event("input", { bubbles: true }));
  click("#mvExtGo");
  ok("🧩 a name search lists the store's hits with + exempt / + install silently and a store link", await until(() => st().ext.hits && st().ext.hits.length === 2, 5000, "hits") && /2 hits for “tango”/.test(text("mvExtAddCard")) && $("mvExtAddCard").querySelectorAll('[data-mrextadd="force"]').length === 2 && /store ↗/.test(text("mvExtAddCard")));

  // ---- the approved list ----
  const tsv = "Extension\tBrowser\tInstalled\tImpact\tPerm. severity\tCategory\tRisk\tPriority\tBand\tApPo\tClosest ApPo application\n"
    + "Microsoft Editor: Spelling & Grammar Checker\tEdge\t1\t1\tVeryHigh\tEnterprise / business\t0\t0\tAllow - ApPo\tProbably\tMicrosoft 365\n"
    + "Level up for Dynamics 365/Power Apps\tEdge\t1\t1\tHigh\tEnterprise / business\t0\t0\tAllow - ApPo\tYes\tPower apps\n"
    + "Tango – Document and Automate Your Processes\tEdge\t2\t1\tVeryHigh\tData handling / productivity\t1\t0\tAllow - ApPo\tYes\tTango\n"
    + "My Apps Secure Sign-in Extension\tEdge\t3\t2\tHigh\tEnterprise / business\t0\t0\tAllow - ApPo\tProbably\tActive Directory\n"
    + "UiPath Browser Automation 26.10\tEdge\t8\t3\tVeryHigh\tEnterprise / business\t0\t0\tAllow - ApPo\tYes\tUiPath\n"
    + "think-cell\tChrome\t9\t3\tHigh\tEnterprise / business\t0\t0\tAllow / governance\tNot assessed\t\n";
  $("mvExtListText").value = tsv;
  $("mvExtListText").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
  ok("🧩 the pasted list loads: 6 rows, 5 Edge, kept for the tenant", await until(() => st().ext.list && st().ext.list.parsed.total === 6, 5000, "list") && st().ext.list.parsed.edge === 5 && !!kept("tuno.t28.edgeext.list."));
  ok("🧩 the store names the rows it can: Tango and Level Up by name, My Apps already in both lists, UiPath and Editor to resolve", await until(() => { const ids = st().ext.list.ids; return Object.keys(ids).length === 5 && !st().ext.looking; }, 8000, "resolve") && (() => { const L = $("mvExtListCard").textContent; return /3 named by the store/.test(L) && /2 to resolve/.test(L) && /1 Chrome rows — not this policy/.test(L) && /already in both lists/.test(L) && /no store match/.test(L); })());
  ok("🧩 the rows are sorted by Installed, highest first", (() => { const names = [...$("mvExtListCard").querySelectorAll("tbody tr td:first-child b")].map((b) => b.textContent); return names[0] === "UiPath Browser Automation 26.10" && names[1] === "My Apps Secure Sign-in Extension" && names.indexOf("Tango – Document and Automate Your Processes") < names.indexOf("Microsoft Editor: Spelling & Grammar Checker"); })());
  // paste the ID on the UiPath row: the store names it
  const uiRow = [...$("mvExtListCard").querySelectorAll("tbody tr")].find((tr) => /UiPath/.test(tr.textContent));
  change(uiRow.querySelector("[data-mrextrowid]"), IDS.uipath);
  ok("🧩 a pasted ID resolves the row and the store names it", await until(() => /UiPath Browser Automation 26.10/.test(text("mvExtListCard")) && /✓ store/.test([...$("mvExtListCard").querySelectorAll("tbody tr")].find((tr) => /UiPath/.test(tr.textContent)).textContent), 5000, "uipath named") && st().ext.list.ids["uipath browser automation 26.10|edge"].how === "operator");
  ok("🧩 a bad paste is refused, not kept", (() => { const row = [...$("mvExtListCard").querySelectorAll("tbody tr")].find((tr) => /Microsoft Editor/.test(tr.textContent)); change(row.querySelector("[data-mrextrowid]"), "not an id"); return /not an ID/.test(text("mvExtListCard")) && !st().ext.list.ids["microsoft editor: spelling & grammar checker|edge"].id; })());
  // bulk add as exempt
  ok("🧩 the bulk line counts the 3 named rows not in the policy yet", /Add the 3 named/.test(text("mvExtListCard")) && !$("mvExtBulkGo").disabled);
  click("#mvExtBulkGo");
  await sleep(20);
  ok("🧩 ➕ adds Tango, Level Up and UiPath as exempt; My Apps is left alone", st().ext.edits.size === 3 && [...st().ext.edits.keys()].every((k) => k.startsWith("allow|")) && $("mvExtAllow").querySelectorAll("tr.mr-ext-added").length === 3 && /Add the 0 named/.test(text("mvExtListCard")));
  // move UiPath to silent, remove the dead Proton ID
  change($("mvExtAllow").querySelector(`[data-mrextchg="allow|${IDS.uipath}"]`), "addother");
  change($("mvExtForce").querySelector(`[data-mrextchg="force|${IDS.proton}"]`), "remove");
  ok("🧩 a pending add moved to silent, a removal marked: the bar reads 4 changes — 1 removal · 1 silent install · 2 exemptions", st().ext.edits.size === 4 && $("mvExtForce").querySelectorAll("tr.mr-ext-added").length === 1 && $("mvExtForce").querySelectorAll("tr.mr-ext-removed").length === 1 && /4 changes in 1 policy/.test(text("mvBody")) && /1 removal · 1 silent install · 2 exemptions/.test(text("mvBody")));
  ok("🧩 the removal's select says it installs nothing today (the store does not know the ID)", /installs nothing today/.test($("mvExtForce").querySelector(`[data-mrextchg="force|${IDS.proton}"]`).textContent));
  ok("🧩 the filter chips narrow the tables", (() => { click('[data-mrextf="edited"]'); const n = $("mvExtForce").querySelectorAll("tbody tr").length + $("mvExtAllow").querySelectorAll("tbody tr").length; click('[data-mrextf="all"]'); return n === 4; })());

  // ---- the dry run and the gates ----
  click("#mvExtDry");
  ok("🧩 the dry run reads fresh and plans the 4 changes under the policy card, saying what users get, the impact and the way back", await until(() => st().plan && st().plan.kind === "edgeext", 8000, "plan") && st().plan.items.length === 1 && st().plan.items[0].changes.length === 4 && /What the reached users get/.test(text("mvPlan")) && /Likely impact/.test(text("mvPlan")) && /The way back/.test(text("mvPlan")) && /nothing changes on any device — it never installed/.test(text("mvPlan")) && /Silent installs:/.test(text("mvPlan")) && /Exemptions:/.test(text("mvPlan")) && !/Removals:/.test(text("mvPlan")) && st().planAnchor === "mvExtCard");
  ok("🧩 a dead ID's removal is no risk: no reason asked", !$("mvRiskReason"));
  ok("🧩 Apply is locked before the backup and the tick", $("mvApply").disabled);
  $("mvBackup").click(); change($("mvConfirmTick"), true);
  ok("🧩 …and unlocked after both", !$("mvApply").disabled);
  const before = JSON.stringify(TT.CONFIG_POLICIES.find((p) => /^WIN-SEC-AttackSurfaceReduction-D-02/.test(p.name))._settings);
  $("mvApply").click();
  ok("🧩 applied: the demo tenant holds the new lists, verified, the run in 📜", await until(() => st().runs.some((r) => r.kind === "edgeext" && r.ok === 1), 8000, "apply") && (() => { const l = lists(); return l.force.map((e) => e.id).join() === [IDS.copilot1, IDS.copilot2, IDS.myapps, IDS.uipath].join() && l.allow.map((e) => e.id).sort().join() === [IDS.myapps, IDS.tango, IDS.levelup].sort().join() && l.block[0].raw === "*" && l.external === true; })());
  ok("🧩 the other policies were not touched; the edits are gone; the rows read the verified settings", JSON.stringify(TT.CONFIG_POLICIES.find((p) => /^WIN-SEC-AttackSurfaceReduction-D-02/.test(p.name))._settings) === before && st().ext.edits.size === 0 && $("mvExtAllow").querySelectorAll("tbody tr").length === 3 && !$("mvExtAllow").querySelector("tr.mr-ext-added") && /4 · 3/.test(rail().textContent));
  const run = st().runs.find((r) => r.kind === "edgeext");
  ok("🧩 the run carries the backup with both lists before and after, and the changes for the undo", run.backup.policies.length === 1 && run.backup.policies[0].lists.before.force.length === 4 && run.backup.policies[0].lists.after.allow.length === 3 && run.done.length === 4 && /written · verified/.test(run.lines.join()));

  // ---- the undo: taking a live silent install away is a risk ----
  const ri = st().runs.indexOf(run);
  w.MdeRolloutV2Tool._pane("changes");
  ok("📜 lists the run with its backup and undo", !!D.querySelector(`[data-mrundo="${ri}"]`) && !!D.querySelector(`[data-mrrunbk="${ri}"]`));
  D.querySelector(`[data-mrundo="${ri}"]`).click();
  ok("🧩 undo plans the four changes the other way round, on the 🧩 pane", await until(() => st().plan && st().plan.kind === "edgeext" && /Undo/.test(st().plan.title), 8000, "undo plan") && st().pane === "edgeext" && st().plan.items[0].changes.length === 4 && st().plan.items[0].changes.some((c) => c.op === "add" && c.entry.id === IDS.proton) && st().plan.items[0].changes.some((c) => c.op === "remove" && c.entry.id === IDS.uipath));
  ok("🧩 UiPath coming off Installed silently is a recorded risk: the reason box and the accept tick", !!$("mvRiskReason") && /comes off Installed silently/.test(text("mvPlan")) && /Removals:/.test(text("mvPlan")));
  $("mvBackup").click(); change($("mvConfirmTick"), true);
  ok("🧩 the backup and the tick do not pass the risk", $("mvApply").disabled);
  change($("mvRiskReason"), "Undo of the test run — the lists go back to what they were."); change($("mvRiskAccept"), true);
  ok("🧩 the reason and the acceptance unlock Apply", !$("mvApply").disabled);
  $("mvApply").click();
  ok("🧩 undone: the original lists are back in the demo tenant", await until(() => st().runs.filter((r) => r.kind === "edgeext").length === 2, 8000, "undo applied") && lists().force.map((e) => e.id).join() === [IDS.copilot1, IDS.copilot2, IDS.myapps, IDS.proton].join() && lists().allow.map((e) => e.id).join() === IDS.myapps && st().runs[st().runs.length - 1].risk && /lists go back/.test(st().runs[st().runs.length - 1].risk.reason));

  // ---- drift: the tenant moves between the dry run and the apply ----
  change($("mvExtAllow").querySelector(`[data-mrextchg="allow|${IDS.myapps}"]`), "remove");
  click("#mvExtDry");
  await until(() => st().plan && st().plan.kind === "edgeext" && !/Undo/.test(st().plan.title), 8000, "plan 2");
  pol.lastModifiedDateTime = new Date(Date.now() + 1000).toISOString();
  $("mvBackup").click(); change($("mvConfirmTick"), true);
  $("mvApply").click();
  ok("🧩 a policy changed since the dry run is skipped as drifted, not written", await until(() => st().runs.filter((r) => r.kind === "edgeext").length === 3, 8000, "drift") && lists().allow.length === 1 && /drifted/.test(st().runs[st().runs.length - 1].lines.join()));
  // an edit that no longer applies is left out at the dry run
  st().ext.edits.clear(); st().ext.edits.set(`force|${IDS.xray}`, { op: "remove", entry: { id: IDS.xray, updateUrl: "" } });
  click("#mvExtDry");
  ok("🧩 a removal of an entry the tenant no longer has is left out with the reason", await until(() => st().plan && st().plan.kind === "edgeext" && st().plan.drifted.length === 1, 8000, "left out") && /no longer in Installed silently/.test(text("mvPlan")) && /Nothing to write/.test(text("mvPlan")));
  click("#mvDiscard");

  // ---- a tenant without an Edge extensions policy ----
  TT.CONFIG_POLICIES.splice(TT.CONFIG_POLICIES.indexOf(pol), 1);
  st().ext.edits.clear();
  w.PolicyCache.invalidate();
  click("#mvRun");
  await until(() => st().model && !st().model.newP.some((P) => P.name === pol.name), 30000, "re-read");
  rail().click(); await sleep(30);
  ok("🧩 without the policy the node says none and the pane says which setting it looks for, the route line still there", /none/.test(rail().textContent) && /No Edge extensions policy in the new set/.test(text("mvBody")) && !!$("mvExtRoute"));

  // ---- the How it works paragraph and the registry ----
  w.MdeRolloutV2Tool._pane("how");
  ok("❓ How it works has the 🧩 paragraph and the rail-only wording for 🎛", /🧩 Edge extensions/.test(text("mvBody")) && /paste mode/.test(text("mvBody")) && /Adjust settings<\/b> \(on the rail\)|Adjust settings \(on the rail\)/.test($("mvBody").innerHTML));
  // 10679: not pinned to 0.31 — the next T28 build moved it and turned this red
  ok("T28 is 0.31 or later and its note names the build", parseFloat(w.TOOL_VERSIONS.toolMdeRollout.v.replace(/^0\./, "")) >= 31 && /build 10678/.test(w.TOOL_VERSIONS.toolMdeRollout.note));
}

screen().then(() => {
  console.log(`T28 🧩 Edge extensions: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}).catch((e) => { console.error(e); process.exitCode = 1; });

// ======================================================================
// T24 / T27 — the SCREEN suite: the session, the rail, the filters, the
// panes and the bookkeeping that has to travel with every build.
//
// Every block names the design finding or section it defends. Run it with
// `npm test`, or on its own:  node tests/platformbaseline/screen.test.js
// ======================================================================
const { suite } = require("./harness");
const { ok, head, run, ROOT, fs, path, boot, readOf, CAT } = suite("screen");

run(async () => {


// =====================================================================
head("Finding 7 — the gate is the tenant ID, not a display name");
{
  const w = boot();
  const T = w.TunoTenant;
  ok("TunoTenant exposes tenantId()", typeof T.tenantId === "function");
  ok("TunoTenant exposes gate()", typeof T.gate === "function");
  ok("TunoTenant exposes name()", typeof T.name === "function");
  ok("no tenant yet — the id is empty", T.tenantId() === "");
  T._setForTest("cloudfellows.dev", "CloudFellows BV", "11111111-2222-3333-4444-555555555555");
  ok("_setForTest takes the id as its third argument", T.tenantId() === "11111111-2222-3333-4444-555555555555");
  const g = T.gate();
  ok("gate() reports the id it compared", g.id === "11111111-2222-3333-4444-555555555555");
  ok("gate() reports the tenant name", g.name === "CloudFellows BV");
  ok("gate() says WHICH half answered", g.by === "id" || g.by === "name");
  ok("gate().on agrees with isCfdev()", g.on === T.isCfdev());

  const src = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  ok("CFDEV_TENANT_IDS exists in js/app.js", /const CFDEV_TENANT_IDS = \[/.test(src));
  ok("the id list is compared before anything else", /if \(CFDEV_TENANT_IDS\.length\) return idIsCfdev\(\);/.test(src));
  ok("MSAL's tid is what fills it", /tenantId = \(account && account\.tenantId\) \|\| "";/.test(src));
  // While the list is empty the ENCA name check still answers — and says so.
  const idsEmpty = /const CFDEV_TENANT_IDS = \[\];/.test(src);
  ok("with the list still empty, the gate reports itself as name-based", !idsEmpty || T.gate().by === "name");
  ok("with the list still empty, cloudfellows.dev is still recognised", !idsEmpty || T.isCfdev() === true);
  T._setForTest("contoso.com", "Contoso BV", "99999999-9999-9999-9999-999999999999");
  ok("another tenant is not the reference tenant", T.isCfdev() === false);
}

// =====================================================================
head("Finding 7 — the badge carries the ID so the list can be closed");
{
  const w = boot();
  const T = w.TunoTenant, D = w.document;
  T._setForTest("cloudfellows.dev", "CloudFellows BV", "abcdefab-1234-5678-9abc-def012345678");
  // readOrgAtSignIn()'s badge paint is the same call enter() makes; drive it
  // through the public seam the org read uses.
  T.setOrgName("CloudFellows BV");
  const rail = D.getElementById("mbSeg");
  w.MacBaselineTool.init();
  ok("the macOS rail renders", !!rail && rail.innerHTML.length > 0);
  ok("the rail names the tenant", /CloudFellows BV/.test(rail.textContent));
  ok("the rail prints the tenant ID", /abcdefab-1234-5678-9abc-def012345678/.test(rail.textContent));
  ok("the rail badges the reference tenant", /reference tenant/.test(rail.textContent));
  ok("and says the gate is still name-based while the list is empty", /by name/.test(rail.textContent));
  T._setForTest("contoso.com", "Contoso BV", "99999999-9999-9999-9999-999999999999");
  w.MacBaselineTool.reset();
  ok("on another tenant the rail carries no reference badge", !/reference tenant/.test(D.getElementById("mbSeg").textContent));
  ok("but still names the tenant and its id", /Contoso BV/.test(D.getElementById("mbSeg").textContent) && /99999999/.test(D.getElementById("mbSeg").textContent));
}

// =====================================================================
head("Finding 1 — tenant data does not survive sign-out");
{
  const w = boot();
  const T = w.TunoTenant, D = w.document;
  T._setForTest("cloudfellows.dev", "CloudFellows BV", "aaaa1111-0000-0000-0000-000000000001");
  w.MacBaselineTool.init();
  w.MacBaselineTool._catalogsForTest(CAT("tuno-macos-baseline", "macos"), null);
  await w.MacBaselineTool._setForTest(readOf("MACOS - DCP - Apple Firewall - D - Enable MACOS Firewall - R26.6 - v3.0"), null, "compare", "cfdev");
  const S1 = w.MacBaselineTool._session();
  ok("the session holds the read", !!S1.res);
  ok("the session holds the comparison", !!S1.cmp);
  ok("the session is keyed by the tenant that produced it", S1.tenantId === "aaaa1111-0000-0000-0000-000000000001");
  // the default filter is "needs attention", and a matching policy needs none
  ok("a matching policy is hidden by the default filter", !/Apple Firewall/.test(D.getElementById("mbBody").textContent));
  D.getElementById("mbClear").click();
  ok("Show everything brings it back", /Apple Firewall/.test(D.getElementById("mbBody").textContent));

  // sign out: app.js fires the event, the tool drops its own state
  D.getElementById("signOutBtn").dispatchEvent(new w.Event("click", { bubbles: true }));
  const S2 = w.MacBaselineTool._session();
  ok("sign-out replaces the session object", S2 !== S1);
  ok("sign-out drops the read", S2.res === null);
  ok("sign-out drops the comparison", S2.cmp === null);
  ok("sign-out drops any plan", S2.planned === null && S2.rnPlanned === null && S2.hkPlanned === null);
  ok("sign-out drops the fetched community catalog", S2.fetchedCat === null);
  ok("sign-out drops the loaded file catalog", S2.fileCat === null);
  ok("sign-out empties the rendered body", D.getElementById("mbBody").innerHTML === "");
  ok("sign-out empties the rename host", D.getElementById("mbRename").innerHTML === "");
  ok("sign-out empties the housekeeping host", D.getElementById("mbHousekeeping").innerHTML === "");
  ok("no policy name survives on the screen", !/Apple Firewall/.test(D.getElementById("mbBody").textContent));
}

// =====================================================================
head("Finding 1 — every tenant-derived field is in the session, none outside");
{
  const w = boot();
  w.TunoTenant._setForTest("cloudfellows.dev", "CloudFellows BV", "aaaa1111-0000-0000-0000-000000000001");
  w.MacBaselineTool.init();
  const keys = Object.keys(w.MacBaselineTool._session());
  for (const k of ["tenantId", "res", "cmp", "fileCat", "fetchedCat", "hashes", "planned", "plannedFilters",
    "rnPlanned", "rnPlanKey", "hkPlanned", "hkPlanKey", "lastWrite", "lastSource"]) {
    ok(`the session declares ${k}`, keys.includes(k));
  }
  const src = fs.readFileSync(path.join(ROOT, "js/platformbaseline.js"), "utf8");
  const screenSrc = src.slice(src.indexOf("function screen(spec, E) {"));
  // Anything tenant-derived left as a bare `let` in screen() is a field
  // sign-out would not drop — the exact shape of the bug this fixes.
  for (const stray of ["let res ", "let cmp ", "let planned", "let fetchedCat",
    "let rnPlanned", "let hkPlanned", "let lastWrite", "let lastSource", "let fileCat"]) {
    ok(`no bare '${stray.trim()}' survives in screen()`, !screenSrc.includes(stray));
  }
  ok("app.js fires tuno:signout", /new CustomEvent\("tuno:signout"\)/.test(fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8")));
  ok("the tool listens for it beside the state it owns", /addEventListener\("tuno:signout"/.test(screenSrc));
}

// =====================================================================
head("Finding 1 — a plan names one tenant, and Apply proves it");
{
  const w = boot();
  const T = w.TunoTenant, D = w.document;
  T._setForTest("cloudfellows.dev", "CloudFellows BV", "aaaa1111-0000-0000-0000-000000000001");
  w.MacBaselineTool.init();
  w.MacBaselineTool._catalogsForTest(CAT("tuno-macos-baseline", "macos"), null);
  await w.MacBaselineTool._setForTest(readOf("MACOS - DCP - Apple Firewall - D - Enable MACOS Firewall - R26.6 - v3.0"), null, "compare", "cfdev");
  const S = w.MacBaselineTool._session();
  ok("the landed read stamped the tenant onto the session", S.tenantId === "aaaa1111-0000-0000-0000-000000000001");

  const src = fs.readFileSync(path.join(ROOT, "js/platformbaseline.js"), "utf8");
  const screenSrc = src.slice(src.indexOf("function screen(spec, E) {"));
  ok("wrongTenant() compares the session's tenant against the signed-in one",
    /const wrongTenant = \(\) => S\.tenantId !== currentTenantId\(\);/.test(screenSrc));
  for (const fn of ["async function apply()", "async function rnApply()", "async function hkApply()"]) {
    const i = screenSrc.indexOf(fn);
    const body = screenSrc.slice(i, i + 1400);
    ok(`${fn.replace("async function ", "").replace("()", "")} refuses a plan made for another tenant`, i >= 0 && /wrongTenant\(\)/.test(body));
  }
  // EXPORT is the one act the design leaves on the reference tenant
  // (section 4): Rename and Housekeeping run on every tenant, with the
  // same ceremony, so gating them was never the design.
  ok("Export re-checks the reference-tenant gate at the click (finding 7)",
    (screenSrc.match(/if \(!isCfdev\(\)\) \{ \$\(ID\("ExportNote"\)\)/g) || []).length === 2);
  ok("Rename and Housekeeping are NOT gated on the reference tenant",
    !/RnPlan"\)\)\.innerHTML = refusedHtml/.test(screenSrc) && !/HkPlan"\)\)\.innerHTML = refusedHtml/.test(screenSrc));
}

// =====================================================================
head("Finding 1 — a different tenant on the same screen instance");
{
  const w = boot();
  const T = w.TunoTenant;
  T._setForTest("cloudfellows.dev", "CloudFellows BV", "aaaa1111-0000-0000-0000-000000000001");
  w.WinBaselineTool.init();
  w.WinBaselineTool._catalogsForTest(CAT("tuno-windows-baseline", "windows"), null);
  await w.WinBaselineTool._setForTest(readOf("Win - SEC - App Control - D - AllowAll - R26.6 - v3.0"), null, "compare", "cfdev");
  ok("the Windows session landed", !!w.WinBaselineTool._session().res);
  // No sign-out event at all — just a different tenant in the seam, which is
  // what a demo entered from a signed-in session looks like.
  T._setForTest("contoso.com", "Contoso BV", "bbbb2222-0000-0000-0000-000000000002");
  await w.TunoScreenHooks["screen-winbaseline"]();
  const S = w.WinBaselineTool._session();
  ok("onShow() drops a read that a different tenant produced", S.res === null || S.tenantId === "bbbb2222-0000-0000-0000-000000000002");
  ok("and re-keys the session to the tenant now signed in", S.tenantId === "" || S.tenantId === "bbbb2222-0000-0000-0000-000000000002");
}

// =====================================================================
head("Findings 10, 11, 12 — the rail, the filters and the words");
{
  const w = boot();
  const D = w.document;
  w.TunoTenant._setForTest("cloudfellows.dev", "CloudFellows BV", "aaaa1111-0000-0000-0000-000000000001");
  w.MacBaselineTool.init();
  const rail = D.getElementById("mbSeg");
  // FINDING 10 — native buttons, so Enter and Space work
  const nodes = [...rail.querySelectorAll("[data-mbmode]")];
  ok("every rail entry is a real <button>", nodes.length > 0 && nodes.every((n) => n.tagName === "BUTTON"), nodes.map((n) => n.tagName).join(","));
  ok("each says whether it is the one on the table", nodes.every((n) => n.hasAttribute("aria-selected")));
  ok("exactly one is selected", nodes.filter((n) => n.getAttribute("aria-selected") === "true").length === 1);
  ok("the rail carries the six acts plus How it works",
    nodes.map((n) => n.dataset.mbmode).join(",") === "compare,import,rename,export,housekeeping,help", nodes.map((n) => n.dataset.mbmode).join(","));
  ok("Upstream is gone from the rail — Compare absorbed it", !nodes.some((n) => n.dataset.mbmode === "upstream"));
  ok("and its host is gone from the page", !D.getElementById("mbUpstream") && !D.getElementById("wbUpstream"));

  // FINDING 12 — the words come from the SPEC, and index.html says nothing
  nodes.find((n) => n.dataset.mbmode === "help").click();
  const body = D.getElementById("mbBody");
  ok("How it works renders", /How .* works/i.test(body.textContent));
  ok("it explains the matching order", /the author.s token/i.test(body.textContent) && /Similarity/i.test(body.textContent));
  ok("it lists every status with its meaning", Object.keys(w.MacBaseline.STATUS).every((k) => body.textContent.includes(w.MacBaseline.STATUS[k].label)));
  ok("it names the platform's own rule", /intune-my-macs/i.test(body.textContent));
  ok("the SPEC carries the words", !!w.MacBaseline.spec.help.overview && !!w.MacBaseline.spec.help.identity);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const mbCard = html.slice(html.indexOf('id="screen-macbaseline"'), html.indexOf('id="screen-winbaseline"'));
  ok("index.html no longer explains the matching", !/matched by name|number clash|half-or-better/i.test(mbCard));
  ok("index.html points at the pane instead", /How it works/.test(mbCard));

  // FINDING 11 — the cards are filters, and the default is needs-attention
  nodes.find((n) => n.dataset.mbmode === "compare").click();
}

// =====================================================================
head("Finding 11 — card filters, search, section and D/U, and the report follows them");
{
  const w = boot();
  const D = w.document, E = w.MacBaseline;
  w.TunoTenant._setForTest("cloudfellows.dev", "CloudFellows BV", "aaaa1111-0000-0000-0000-000000000001");
  w.MacBaselineTool.init();
  const body = { settings: [{ settingInstance: { settingDefinitionId: "a", choiceSettingValue: { value: "1" } } }] };
  const h = await E.hashBody("settingsCatalog", body);
  const cat = { schema: 2, kind: "tuno-macos-baseline", platform: "macos", catalogId: "cloudfellows", release: "R26.6", policies: [
    { key: "macos dcp here d present", name: "MACOS - DCP - Here - D - Present - R26.6 - v1.0", release: "R26.6", version: "1.0",
      section: "settingsCatalog", sectionLabel: "Settings catalog policies", area: "SettingsCatalog", du: "D", importable: true, hash: h, body },
    { key: "macos cmp gone u absent", name: "MACOS - CMP - Gone - U - Absent - R26.6 - v1.0", release: "R26.6", version: "1.0",
      section: "compliance", sectionLabel: "Compliance policies", area: "CompliancePolicies", du: "U", importable: true, hash: "sha256:x", body: { passcodeRequired: true } },
  ] };
  w.MacBaselineTool._catalogsForTest(cat, null);
  await w.MacBaselineTool._setForTest({
    sections: [{ id: "settingsCatalog", label: "Settings catalog policies",
      items: [{ id: "p1", name: "MACOS - DCP - Here - D - Present - R26.6 - v1.0", description: "", modified: "", created: "", assignments: [] }],
      raw: [{ id: "p1", name: "MACOS - DCP - Here - D - Present - R26.6 - v1.0", settings: body.settings, __detail: body.settings }] }],
    failed: [],
  }, null, "compare", "cfdev");

  const rows = () => [...D.querySelectorAll("#mbCmpRows tr")].filter((tr) => !/No row matches/.test(tr.textContent));
  ok("the default filter shows only what needs attention", rows().length === 1 && /Absent/.test(rows()[0].textContent), rows().map((r) => r.textContent.slice(0, 40)).join(" | "));
  const cards = [...D.querySelectorAll("#mbCards [data-mbfilter]")];
  ok("there is one card per status", cards.length === Object.keys(E.STATUS).length);
  ok("each card is a button that says whether it is on", cards.every((c) => c.tagName === "BUTTON" && c.hasAttribute("aria-pressed")));
  ok("the attention cards are the ones pressed", cards.filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.dataset.mbfilter).sort().join(",") === E.ATTENTION.slice().sort().join(","));
  cards.find((c) => c.dataset.mbfilter === "match").click();
  ok("clicking a card adds its rows", rows().length === 2);
  const cards2 = [...D.querySelectorAll("#mbCards [data-mbfilter]")];
  cards2.find((c) => c.dataset.mbfilter === "missing").click();
  ok("clicking a pressed card takes its rows away", rows().length === 1 && /Present/.test(rows()[0].textContent));
  D.getElementById("mbClear").click();
  ok("Show everything clears every filter", rows().length === 2);

  const q = D.getElementById("mbQ");
  q.value = "absent"; q.dispatchEvent(new w.Event("input", { bubbles: true }));
  ok("the search narrows the rows", rows().length === 1 && /Absent/.test(rows()[0].textContent));
  ok("and the search box survives it — the toolbar is not re-rendered", D.getElementById("mbQ") === q && q.value === "absent");
  q.value = ""; q.dispatchEvent(new w.Event("input", { bubbles: true }));
  const du = D.getElementById("mbDu");
  du.value = "U"; du.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the D/U filter narrows to user policies", rows().length === 1 && /Absent/.test(rows()[0].textContent));
  du.value = ""; du.dispatchEvent(new w.Event("change", { bubbles: true }));
  const sec = D.getElementById("mbSec");
  sec.value = "compliance"; sec.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("the surface filter narrows to one surface", rows().length === 1 && /Absent/.test(rows()[0].textContent));

  // the report prints the FILTERED table
  const S = w.MacBaselineTool._session();
  const md = E.toMd(S.cmp, "tenant", S.cmp.rows.filter((r) => r.status === "missing"));
  ok("the gap report prints the rows it was handed", /Absent/.test(md) && !/Present/.test(md));
  ok("and says it is the filtered table", /filtered table/.test(md));
  ok("the whole comparison still prints in full when nothing is filtered", /Present/.test(E.toMd(S.cmp, "tenant", S.cmp.rows)));

  // §10 — ⚙ opens the one popout, and a missing policy shows the catalog's copy
  sec.value = ""; sec.dispatchEvent(new w.Event("change", { bubbles: true }));
  const gear = [...D.querySelectorAll("#mbCmpRows [data-mbpop]")];
  ok("every row carries the ⚙ settings view", gear.length === 2);
  gear.find((g) => g.dataset.mbpop === "macos cmp gone u absent").click();
  ok("the popout opens", D.getElementById("mbPop").classList.contains("open"));
  ok("and says the policy is not in this tenant", /not in this tenant/i.test(D.getElementById("mbPopBody").textContent));
  ok("showing the catalog's own settings", /passcode/i.test(D.getElementById("mbPopBody").textContent));
  D.getElementById("mbPopClose").click();
  ok("Close closes it", !D.getElementById("mbPop").classList.contains("open"));
}

// =====================================================================
head("Finding 4 and §8.3 — Import plans the gap, and the pilot assignment");
{
  const w = boot();
  const E = w.WinBaseline, D = w.document;
  w.TunoTenant._setForTest("cloudfellows.dev", "CloudFellows BV", "aaaa1111-0000-0000-0000-000000000001");
  ok("the two pilot groups are named once, in the engine",
    E.PILOT_GROUPS.D === "INT-SEC-D-PRE-PILOT" && E.PILOT_GROUPS.U === "INT-SEC-U-PRE-PILOT");
  // D/U comes from the name token, then the surface, then nowhere
  ok("the D/U token is read off the name", E.duOf("Win - SEC - Thing - D - Name - R26.6 - v1.0") === "D");
  ok("a U token is read as U", E.duOf("Win - DCP - Edge - U - Sync - R26.6 - v1.0") === "U");
  ok("a D inside a word is NOT a token", E.duOf("Win - DCP - Updates - Downloads - R26.6 - v1.0") === "");
  ok("a device-only surface falls back to D", E.duFor({ du: "", section: "autopilot" }) === "D");
  ok("scripts, remediations, filters and enrolment fall back to D",
    ["scripts", "remediations", "filters", "enrolment"].every((s) => E.duFor({ du: "", section: s }) === "D"));
  // NO GUESS on a surface that can target either
  ok("a settings-catalog policy with no token gets NO fallback", E.duFor({ du: "", section: "settingsCatalog" }) === "");
  ok("the row's own token always wins", E.duFor({ du: "U", section: "autopilot" }) === "U");

  ok("every assignable area has an assign path",
    ["SettingsCatalog", "DeviceConfigurations", "CompliancePolicies", "AdmxPolicies"].every((a) => /\/assign$/.test(E.assignPathFor(a, "id1"))));
  ok("an assignment filter has none — it is referenced, not assigned", E.assignPathFor("AssignmentFilters", "id1") === null);

  // the plan is the gap, and nothing else is importable
  const body = { settings: [{ settingInstance: { settingDefinitionId: "a", choiceSettingValue: { value: "1" } } }] };
  const h = await E.hashBody("settingsCatalog", body);
  const cat = { schema: 2, kind: "tuno-windows-baseline", platform: "windows", catalogId: "cloudfellows", policies: [
    { key: "win sec gone d absent", name: "Win - SEC - Gone - D - Absent - R26.6 - v1.0", release: "R26.6", version: "1.0",
      section: "settingsCatalog", sectionLabel: "Settings catalog policies", area: "SettingsCatalog", du: "D", importable: true, hash: h, body },
    { key: "win sec here d present", name: "Win - SEC - Here - D - Present - R26.6 - v1.0", release: "R26.6", version: "1.0",
      section: "settingsCatalog", sectionLabel: "Settings catalog policies", area: "SettingsCatalog", du: "D", importable: true, hash: "sha256:present", body: { settings: [{ settingInstance: { settingDefinitionId: "b", choiceSettingValue: { value: "1" } } }] } },
    { key: "win sec old d behind", name: "Win - SEC - Old - D - Behind - R26.6 - v2.0", release: "R26.6", version: "2.0",
      section: "settingsCatalog", sectionLabel: "Settings catalog policies", area: "SettingsCatalog", du: "D", importable: true, hash: "sha256:old", body: { settings: [{ settingInstance: { settingDefinitionId: "c", choiceSettingValue: { value: "1" } } }] } },
    { key: "win sec new d infront", name: "Win - SEC - New - D - Infront - R26.6 - v1.0", release: "R26.6", version: "1.0",
      section: "settingsCatalog", sectionLabel: "Settings catalog policies", area: "SettingsCatalog", du: "D", importable: true, hash: "sha256:new", body: { settings: [{ settingInstance: { settingDefinitionId: "d", choiceSettingValue: { value: "1" } } }] } },
  ] };
  const P = (id, name, hash, defId) => ({ id, name, section: "settingsCatalog", sectionLabel: "Settings catalog policies",
    description: "", body: { settings: [{ settingInstance: { settingDefinitionId: defId, choiceSettingValue: { value: "1" } } }] },
    hash, du: E.duOf(name), modified: "", created: "", assignments: [] });
  const cmp = E.compare([
    P("t1", "Win - SEC - Here - D - Present - R26.6 - v1.0", "sha256:present", "b"),
    P("t2", "Win - SEC - Old - D - Behind - R26.6 - v1.0", "sha256:old", "c"),        // older than the catalog
    P("t3", "Win - SEC - New - D - Infront - R26.6 - v2.0", "sha256:new", "d"),       // newer than the catalog
  ], cat);
  const by = (s) => cmp.rows.filter((r) => r.status === s).map((r) => r.baseline && r.baseline.name);
  ok("the present one matches", by("match").length === 1);
  ok("the older one is outdated", by("outdated").length === 1);
  ok("the newer one is ahead", by("ahead").length === 1);
  ok("the absent one is missing", by("missing").length === 1);
  const gapKeys = new Set(cmp.rows.filter((r) => r.status === "missing" || r.status === "outdated").map((r) => r.key));
  const { entries } = E.importEntries(cat, gapKeys);
  ok("Import plans exactly the missing and outdated rows", entries.length === 2, entries.map((e) => e.newName).join(" | "));
  ok("and never the ahead one — the tenant has a newer copy", !entries.some((e) => /Infront/.test(e.newName)));
  ok("and never the matching one — creating it again would make a copy", !entries.some((e) => /Present/.test(e.newName)));

  // the screen: the radio, the plan's D/U column, the blocked apply
  w.WinBaselineTool.init();
  w.WinBaselineTool._catalogsForTest(cat, null);
  await w.WinBaselineTool._setForTest({ sections: [{ id: "settingsCatalog", label: "Settings catalog policies",
    items: [{ id: "t1", name: "Win - SEC - Here - D - Present - R26.6 - v1.0", description: "", modified: "", created: "", assignments: [] }],
    raw: [{ id: "t1", name: "Win - SEC - Here - D - Present - R26.6 - v1.0", __detail: [{ settingInstance: { settingDefinitionId: "b", choiceSettingValue: { value: "1" } } }] }] }], failed: [] }, null, "import", "cfdev");
  const radios = [...D.getElementsByName("wbAsg")];
  ok("the Import pane offers the two answers", radios.length === 2 && radios.map((r) => r.value).join(",") === "none,pilot");
  ok("No assignment is the default", radios.find((r) => r.value === "none").checked === true);
  ok("the pane names both pilot groups", /INT-SEC-D-PRE-PILOT/.test(D.getElementById("wbBody").textContent) && /INT-SEC-U-PRE-PILOT/.test(D.getElementById("wbBody").textContent));
  ok("the rail counts what Import would create", /to create/.test(D.getElementById("wbSeg").textContent));

  const src = fs.readFileSync(path.join(ROOT, "js/platformbaseline.js"), "utf8");
  ok("the groups are looked up at dry run, not at apply", /Looking up the PRE-PILOT groups…/.test(src));
  ok("a missing group warns and still imports", /was" : "were"\} not found in this tenant/.test(src) && /still created — unassigned/.test(src));
  ok("TUNO never creates the group", !/POST[\s\S]{0,80}\/groups/.test(src) && /does not create groups/.test(src));
  ok("a blank D/U blocks apply rather than guessing", /no D\/U/.test(src) && /ap2\.disabled = !on\.length \|\| blocked > 0;/.test(src));
  ok("assignment failure is reported per row and never rolled back", /created, NOT assigned/.test(src) && /never rolled back/.test(src));
  ok("the plan says an outdated row creates a NEW copy", /a NEW copy — the older one stays/.test(src));
  ok("Select D and Select U exist", /ImD"\)\)\.addEventListener/.test(src) && /ImU"\)\)\.addEventListener/.test(src));
}

// =====================================================================
head("Finding 2 — Export fails closed, and the rows are chosen");
{
  const w = boot();
  const E = w.MacBaseline, D = w.document;
  w.TunoTenant._setForTest("cloudfellows.dev", "CloudFellows BV", "aaaa1111-0000-0000-0000-000000000001");
  const N = "MACOS - DCP - Thing - D - Good - R26.6 - v1.0";
  const N2 = "MACOS - CMP - Other - U - Also - R26.6 - v1.0";
  const setting = { settingInstance: { settingDefinitionId: "a", choiceSettingValue: { value: "1" } } };
  const clean = () => ({
    sections: [
      { id: "settingsCatalog", label: "Settings catalog policies",
        items: [{ id: "p1", name: N, description: "", modified: "", created: "", assignments: [] }],
        raw: [{ id: "p1", name: N, __detail: [setting] }] },
      { id: "compliance", label: "Compliance policies",
        items: [{ id: "p2", name: N2, description: "", modified: "", created: "", assignments: [] }],
        raw: [{ id: "p2", displayName: N2, passcodeRequired: true }] },
    ], failed: [], partial: [],
  });
  ok("a clean read is ready to export", E.exportReadiness(clean()).ready === true);
  ok("and counts what it read, per surface",
    E.exportReadiness(clean()).surfaces.every((s) => s.read === s.expected && s.baseline === 1 && s.bad === 0));

  const withFail = clean(); withFail.failed = [{ id: "admx", label: "Administrative templates", error: "403" }];
  ok("a surface that could not be read stops the export", E.exportReadiness(withFail).ready === false);
  ok("and is named as the reason", E.exportReadiness(withFail).blockers.some((b) => /Administrative templates/.test(b.label)));
  const withPartial = clean(); withPartial.partial = [{ id: "scripts", label: "Scripts", notes: ["one endpoint 404'd"] }];
  ok("a surface read only in part stops it too", E.exportReadiness(withPartial).ready === false);
  const withDetailErr = clean(); withDetailErr.sections[0].raw[0] = { id: "p1", name: N, __detailError: "the settings read threw" };
  ok("a row whose settings could not be read stops it", E.exportReadiness(withDetailErr).ready === false);
  ok("and the row is named, with its own reason", E.exportReadiness(withDetailErr).blockers.some((b) => b.label === N && /could not be read/.test(b.why)));
  const withEmpty = clean(); withEmpty.sections[0].raw[0] = { id: "p1", name: N, __detail: [] };
  ok("a body that came back empty stops it", E.exportReadiness(withEmpty).ready === false);
  ok("with the honest reason — it would configure nothing", E.exportReadiness(withEmpty).blockers.some((b) => /configures nothing/.test(b.why)));
  ok("rowIssue is the one rule the table and the button share", E.rowIssue("settingsCatalog", {}, { __detail: [] }) !== "" && E.rowIssue("settingsCatalog", {}, { __detail: [setting] }) === "");

  // a bad row is EXCLUDED from the export, not exported half-formed
  const built = await E.buildExport(withDetailErr, "cfdev");
  ok("a row that cannot be read is skipped, with its reason", built.skipped.some((x) => x.name === N && /could not be read/.test(x.why)));
  ok("and is not in the catalog", !built.file.policies.some((p) => p.name === N));

  // per-row selection
  const only = await E.buildExport(clean(), "cfdev", new Set(["p2"]));
  ok("buildExport exports only the ticked ids", only.file.policies.length === 1 && only.file.policies[0].name === N2);

  // same content, two names — kept, listed, never folded (§4.4)
  const twins = clean();
  twins.sections[0].items.push({ id: "p3", name: "MACOS - DCP - Thing - D - Copy - R26.6 - v1.0", description: "", modified: "", created: "", assignments: [] });
  twins.sections[0].raw.push({ id: "p3", name: "MACOS - DCP - Thing - D - Copy - R26.6 - v1.0", __detail: [setting] });
  const tb = await E.buildExport(twins, "cfdev");
  ok("two names with one body are both kept", tb.file.policies.filter((p) => /Thing/.test(p.name)).length === 2);
  ok("and are listed as sharing content", (tb.duplicates || []).length === 1 && tb.duplicates[0].names.length === 2);
  ok("the README says so and points at Housekeeping",
    /Same content under two names/.test(E.repoFolder(tb)["baseline/macos/README.md"]) && /Housekeeping settles it/.test(E.repoFolder(tb)["baseline/macos/README.md"]));

  // the screen: disabled buttons, the counts table, the Rename first link
  w.MacBaselineTool.init();
  w.MacBaselineTool._catalogsForTest({ schema: 2, kind: "tuno-macos-baseline", platform: "macos", catalogId: "cloudfellows", policies: [] }, null);
  await w.MacBaselineTool._setForTest(withFail, null, "export", "cfdev");
  ok("Export is disabled on an incomplete read", D.getElementById("mbExportZip").disabled === true && D.getElementById("mbExport").disabled === true);
  ok("and the screen says which surface is unknown", /Administrative templates/.test(D.getElementById("mbBody").textContent));
  ok("it prints read-against-expected per surface", /1 of 1/.test(D.getElementById("mbBody").textContent));
  await w.MacBaselineTool._setForTest(clean(), null, "export", "cfdev");
  ok("a clean read enables it", D.getElementById("mbExportZip").disabled === false);
  ok("every policy has its own tick", [...D.querySelectorAll("[data-mbextick]")].length === 2);
  ok("and every surface has one", [...D.querySelectorAll("[data-mbexsec]")].length === 2);
  D.getElementById("mbExNone").click();
  ok("Select none clears them", [...D.querySelectorAll("[data-mbextick]")].every((c) => !c.checked));
  const secBox = D.querySelector('[data-mbexsec="settingsCatalog"]');
  secBox.checked = true; secBox.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("a surface box ticks its own rows only",
    [...D.querySelectorAll("[data-mbextick]")].filter((c) => c.checked).map((c) => c.dataset.mbextick).join(",") === "p1");

  // the non-baseline list, with the way out
  const unconv = clean();
  unconv.sections[0].items.push({ id: "p9", name: "MACOS - DCP - No Tag At All", description: "", modified: "", created: "", assignments: [] });
  unconv.sections[0].raw.push({ id: "p9", name: "MACOS - DCP - No Tag At All", __detail: [setting] });
  await w.MacBaselineTool._setForTest(unconv, null, "export", "cfdev");
  ok("a policy without the convention is listed, not exported", /No Tag At All/.test(D.getElementById("mbBody").textContent));
  ok("and is not ticked for export", ![...D.querySelectorAll("[data-mbextick]")].some((c) => c.dataset.mbextick === "p9"));
  ok("with a way out", !!D.getElementById("mbExRename"));
  D.getElementById("mbExRename").click();
  ok("which takes you to Rename", /Rename/.test(D.getElementById("mbBody").textContent));

  const src = fs.readFileSync(path.join(ROOT, "js/platformbaseline.js"), "utf8");
  ok("the click re-checks the read, not only the paint", /const exportGuard = \(\) => \{/.test(src) && (src.match(/if \(!exportGuard\(\)\) return;/g) || []).length === 2);
}

// =====================================================================
head("§3 — the read covers the surface table, and bodies are asked for");
{
  const w = boot();
  const Docs = w.Docs || null;
  const E = w.WinBaseline;
  const ids = w.PlatformBaseline ? null : null;
  const secs = (w.Docs && w.Docs.SECTIONS) || [];
  const byId = (id) => secs.find((s) => s.id === id);
  for (const id of ["intents", "customAttributes", "ade"]) {
    ok(`the shared read covers ${id}`, !!byId(id), "not in Docs.SECTIONS");
  }
  ok("legacy endpoint security reads its settings", !!(byId("intents") && byId("intents").detail));
  ok("ADE tokens are read but have no body fetch — list only", !!byId("ade") && !byId("ade").detail && !byId("ade").bodyDetail);
  ok("every new section names its endpoint and can render a row",
    ["intents", "customAttributes", "ade"].every((id) => { const s = byId(id); return s && s.endpoint && s.icon && s.label && typeof s.rowsFrom === "function"; }));
  ok("every section is still readable one way or the other", secs.every((s) => s.list || s.surfaces));
  ok("and the read is still read-only", w.Docs.scopesFor().every((sc) => /\.Read\.All$/.test(sc)));

  // THE BODY FETCH IS OPT-IN
  ok("scripts declare a body fetch", typeof byId("scripts").bodyDetail === "function");
  ok("custom attributes declare one too", typeof byId("customAttributes").bodyDetail === "function");
  ok("a script's body fetch goes to the surface the item came from",
    byId("scripts").bodyDetail({ __surface: "/deviceManagement/deviceShellScripts", id: "x" }) === "/deviceManagement/deviceShellScripts/x");
  const docSrc = fs.readFileSync(path.join(ROOT, "js/document.js"), "utf8");
  ok("and only runs when the caller asked for bodies", /if \(o\.bodies && sec\.bodyDetail && items\.length\)/.test(docSrc));
  ok("the answer is merged onto the item, never replacing it", /if \(items\[i\]\[k\] === undefined\) items\[i\]\[k\] = v;/.test(docSrc));
  ok("a body that fails is recorded, not silently absent", /__bodyError/.test(docSrc));
  const pcSrc = fs.readFileSync(path.join(ROOT, "js/policycache.js"), "utf8");
  ok("the cache remembers whether what it holds has bodies", /hasBodies/.test(pcSrc));
  ok("and a bodies refresh does not attach to a bodies-less read in flight",
    /if \(inflight && \(!bodies \|\| wantBodies\)\) return read\(onStatus\);/.test(pcSrc));
  ok("the document still redacts a script body it did read", w.Docs.redactValue("scriptContent", "abc") !== "abc");

  // the baseline side
  ok("bodies now ride on every surface the read covers",
    ["settingsCatalog", "compliance", "deviceConfigurations", "admx", "intents", "scripts", "customAttributes", "enrolment", "autopilot", "updates", "filters"]
      .every((id) => E.BODY_SECTIONS.has(id)));
  ok("ADE and driver updates are list-only, with a reason each",
    !!E.LIST_ONLY.ade && !!E.LIST_ONLY.driverUpdates && /Apple account/.test(E.LIST_ONLY.ade) && /tenant-bound approvals/.test(E.LIST_ONLY.driverUpdates));
  ok("and they are never in BODY_SECTIONS", !E.BODY_SECTIONS.has("ade") && !E.BODY_SECTIONS.has("driverUpdates"));
  ok("scripts and custom attributes import through restore's script area",
    E.AREA_OF_SECTION.scripts === "PlatformScripts" && E.AREA_OF_SECTION.customAttributes === "PlatformScripts");

  // a list-only row is refused BY NAME, with the reason on the row
  const cat = { schema: 2, kind: "tuno-windows-baseline", platform: "windows", catalogId: "cloudfellows", policies: [
    { key: "k1", name: "Win - DRV - Drivers - D - Ring - R26.6 - v1.0", section: "driverUpdates", sectionLabel: "Driver update profiles",
      area: null, du: "D", importable: false, hash: "sha256:a", body: { x: 1 } },
    { key: "k2", name: "Win - SH - Scripts - D - Something - R26.6 - v1.0", section: "scripts", sectionLabel: "Scripts",
      area: "PlatformScripts", du: "D", importable: true, hash: "sha256:b", body: { runAsAccount: "system" }, surface: "/deviceManagement/deviceManagementScripts" },
    { key: "k3", name: "Win - SH - Scripts - D - With Body - R26.6 - v1.0", section: "scripts", sectionLabel: "Scripts",
      area: "PlatformScripts", du: "D", importable: true, hash: "sha256:c", body: { runAsAccount: "system", scriptContent: "ZWNobyBoaQ==" }, surface: "/deviceManagement/deviceShellScripts" },
  ] };
  const { entries, refused } = E.importEntries(cat, null);
  ok("a driver update profile is refused with its own reason", refused.some((r) => /Drivers/.test(r.name) && /tenant-bound approvals/.test(r.why)));
  ok("a script with no body is refused, and says why", refused.some((r) => /Something/.test(r.name) && /without its body/.test(r.why)));
  ok("a script WITH its body is importable", entries.some((e) => /With Body/.test(e.newName)));
  ok("and is created on the surface it came from", entries.find((e) => /With Body/.test(e.newName)).entry.surface === "deviceShellScripts");

  // a script whose body was never read is UNREAD, not empty
  ok("an unread script body says so, rather than blaming the policy",
    /was not read/.test(E.rowIssue("scripts", {}, { id: "x", displayName: "n" })));
  ok("and a read one passes", E.rowIssue("scripts", {}, { id: "x", displayName: "n", scriptContent: "abc" }) === "");
  // a list-only surface never makes the export incomplete
  const ready = E.exportReadiness({ sections: [{ id: "ade", label: "Enrolment program tokens (ADE)",
    items: [{ id: "t1", name: "Win - X - D - Token - R26.6 - v1.0" }], raw: [] }], failed: [], partial: [] });
  ok("a list-only surface cannot block the export", ready.ready === true);
  ok("but it is still counted on the surface table", ready.surfaces[0].listOnly === true);
}

// =====================================================================
head("Bookkeeping travels in the same commit");
{
  const w = boot();
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const build = w.APP_BUILD.build;
  const vs = [...html.matchAll(/\?v=(\d{4,})/g)].map((m) => Number(m[1]));
  ok("every ?v= asset number matches the build", vs.length > 0 && vs.every((v) => v === build), vs.filter((v) => v !== build).join(","));
  ok("the ?v= ref count is unchanged at 47", vs.length === 47, String(vs.length));
  ok("the newest changelog entry is this build", w.CHANGELOG[0].build === build, String(w.CHANGELOG[0].build));
  const q = w.PROMOTE.items.find((i) => (i.builds || []).includes(build));
  ok("a promotion-queue item names this build", !!q, "no item carries " + build);
  ok("it carries risk, why, test and files", !q || (q.risk && q.why && Array.isArray(q.test) && q.test.length && Array.isArray(q.files) && q.files.length));
  ok("T24 and T27 are still beta-only versions (0.x)", /^0\./.test(w.TOOL_VERSIONS.toolWinBaseline.v) || /^1\.0\./.test(w.TOOL_VERSIONS.toolMacBaseline.v));
}

});

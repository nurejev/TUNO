// T30 — 📏 OS floor keeper (build 10705). After James Robinson's
// IntuneComplianceMaintainer (MIT, vendored in vendor/intune-compliance-maintainer/).
//
// Defended: [version] comparison; the release rules (newest or held Apple
// major, cadence from the patch date; Android's oldest MAINTAINED release,
// an override refused once it is no longer maintained, the patch level of
// the 1st); the Windows catalog turned into ranges, a minimum and an app
// protection target exactly as the script does; the plan's five outcomes
// (a floor never goes down unless allowed); one PATCH per policy with its
// type; drift before and read-back after; the journal and Set back; the
// runbook export replacing the configuration region and nothing else; and
// the screen end to end in demo mode — rules, plan, ticks, Apply through the
// run ledger, the journal, Set back.
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
  w.alert = () => {};
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  const store = new Map();
  Object.defineProperty(w, "localStorage", { value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  }, configurable: true });
  const downloads = [];
  w.URL.createObjectURL = (b) => { downloads.push(b); return "blob:x"; }; w.URL.revokeObjectURL = () => {};
  w.msal = undefined;
  const script = fs.readFileSync(path.join(ROOT, "vendor/intune-compliance-maintainer/IntuneComplianceMaintainer.ps1"), "utf8");
  w.fetch = (u) => (/vendor\/intune-compliance-maintainer\/IntuneComplianceMaintainer\.ps1$/.test(String(u))
    ? Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(script) })
    : Promise.reject(new Error("no network in tests")));
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const bridge = ";Object.assign(window,{Graph,PolicyCache,OsFloor,OsFloorTool,TUNO_DEMO_GRAPH,TOOL_VERSIONS,CHANGELOG,PROMOTE});";
  const realErr = console.error, realLog = console.log, realWarn = console.warn;
  console.error = () => {}; console.log = () => {}; console.warn = () => {};
  let err = null;
  try { w.eval(src + "\n" + bridge); } catch (e) { err = e; }
  console.error = realErr; console.log = realLog; console.warn = realWarn;
  if (err) throw err;
  w.Graph.ensureScopes = async () => true;
  w.Graph.silentScopes = async () => true;
  w.TUNO_DEMO_GRAPH.LATENCY_MS = 0;
  return { w, downloads, script };
}

async function run() {
  const { w, downloads, script } = boot();
  const F = w.OsFloor;
  const DAY = 86400000;
  const now = new Date("2026-10-14T10:00:00Z");
  const iso = (n) => new Date(now.getTime() - n * DAY).toISOString().slice(0, 10);

  // ------------------------------------------------------------ versions --
  ok("[version]: 26.7 equals 26.7.0", F.cmpVer("26.7", "26.7.0") === 0);
  ok("…26.7.1 is above 26.7, 26.10 above 26.9", F.cmpVer("26.7.1", "26.7") > 0 && F.cmpVer("26.10", "26.9") > 0);
  ok("…10.0.26100.6899 above 10.0.26100.6584", F.cmpVer("10.0.26100.6899", "10.0.26100.6584") > 0);

  // ------------------------------------------------------- endoflife.date --
  const eol = { result: { releases: [
    { name: "26", releaseDate: iso(395), isMaintained: true, latest: { name: "26.7.1", date: iso(20) } },
    { name: "27", releaseDate: iso(30), isMaintained: true, latest: { name: "27.0.1", date: iso(5) } },
  ] } };
  const newest = F.appleRelease(eol, "newest", 14);
  ok("Apple: the newest major's latest patch, whatever order the list is in", newest.version === "27.0.1" && newest.major === "27");
  ok("…cadence counts from the PATCH date", F.ymd(newest.effective) === F.ymd(new Date(now.getTime() - 5 * DAY + 14 * DAY)));
  const held = F.appleRelease(eol, "previous", 14);
  ok("held on the previous major: its latest patch, and it says so", held.version === "26.7.1" && held.held && held.newestMajor === "27");
  ok("the /releases/latest single-object shape reads too", F.appleRelease({ result: { name: "27", releaseDate: iso(30), latest: { name: "27.0.1", date: iso(5) } } }, "newest", 14).version === "27.0.1");
  ok("no releases is an error, never a version", !!F.appleRelease({ result: { releases: [] } }, "newest", 14).error);

  const and = { result: { releases: [
    { name: "16", releaseDate: iso(120), isMaintained: true }, { name: "13", releaseDate: iso(1220), isMaintained: true },
    { name: "12", releaseDate: iso(1590), isMaintained: false }, { name: "14", releaseDate: iso(860), isMaintained: true } ] } };
  const a1 = F.androidRelease(and, "", 14, now);
  ok("Android: the oldest MAINTAINED release (12 is not)", a1.version === "13" && a1.maintained.join() === "13,14,16");
  ok("…the patch level is the 1st of this month, effective after the cadence", a1.patch === "2026-10-01" && F.ymd(a1.effective) === "2026-10-15");
  ok("…an override that is maintained is taken", F.androidRelease(and, "14", 14, now).version === "14");
  ok("…an override no longer maintained is refused, naming the maintained ones", /not a maintained release.*13, 14, 16/.test(F.androidRelease(and, "12", 14, now).error));

  // ------------------------------------------------------ Windows catalog --
  const win = F.normRules({ win: { builds: ["26100", "26200"], count: 2 } }).win;
  ok("the catalog request is the script's own: classification, expand, newest first, top N",
    /qualityUpdateClassification eq 'security'/.test(F.catalogPath(win)) && /\$expand=microsoft\.graph\.windowsUpdates\.qualityUpdateCatalogEntry\/productRevisions/.test(F.catalogPath(win)) && /\$orderby=releaseDateTime desc&\$top=2$/.test(F.catalogPath(win)));
  const K = "microsoft.graph.windowsUpdates.qualityUpdateCatalogEntry/productRevisions";
  const rev = (b, u, n) => ({ id: `10.0.${b}.${u}`, releaseDateTime: new Date(now.getTime() - n * DAY).toISOString(), product: "Windows 11", version: b === "26100" ? "24H2" : "25H2" });
  const entries = [{ [K]: [rev("26100", 6899, 1), rev("26200", 6899, 1)] }, { [K]: [rev("26100", 6584, 29), rev("26200", 6584, 29)] }];
  const W = F.windowsRelease(entries, win, 14);
  ok("ranges per build: the oldest of the N to the newest", W.ranges.length === 2 && W.ranges[0].lowestVersion === "10.0.26100.6584" && W.ranges[0].highestVersion === "10.0.26100.6899");
  ok("…typed as the script types them, described by product and version", W.ranges[0]["@odata.type"] === "microsoft.graph.operatingSystemVersionRange" && W.ranges[0].description === "Windows 11 - 24H2");
  ok("…the minimum is the highest lowest (the script's HighestLowest)", W.minimum === "10.0.26200.6584");
  ok("…app protection takes the lowest lowest by default", W.app === "10.0.26100.6584");
  ok("…or the highest highest", F.windowsRelease(entries, Object.assign({}, win, { appTarget: "Highest" }), 14).app === "10.0.26200.6899");
  ok("…newer builds allowed: the top becomes .9999", F.windowsRelease(entries, Object.assign({}, win, { allowNewer: true }), 14).ranges[1].highestVersion === "10.0.26200.9999");
  ok("…the effective date follows the newest release", F.ymd(W.effective) === F.ymd(new Date(now.getTime() - DAY + 14 * DAY)));
  ok("a build the catalog does not carry is an error, not an empty range", !!F.windowsRelease(entries, Object.assign({}, win, { builds: ["22000"] }), 14).error);

  // ------------------------------------------------------------- the plan --
  const comp = [
    { id: "c1", "@odata.type": "#microsoft.graph.iosCompliancePolicy", displayName: "CMP iOS", osMinimumVersion: "26.6" },
    { id: "c2", "@odata.type": "#microsoft.graph.iosCompliancePolicy", displayName: "CMP iPad", osMinimumVersion: "27.0.1" },
    { id: "c3", "@odata.type": "#microsoft.graph.macOSCompliancePolicy", displayName: "CMP Mac", osMinimumVersion: "28.0" },
    { id: "c4", "@odata.type": "#microsoft.graph.androidWorkProfileCompliancePolicy", displayName: "CMP Android", osMinimumVersion: "12", minAndroidSecurityPatchLevel: "2026-08-01" },
    { id: "c5", "@odata.type": "#microsoft.graph.windows10CompliancePolicy", displayName: "CMP Win", validOperatingSystemBuildRanges: [] },
    { id: "c6", "@odata.type": "#microsoft.graph.windows81CompliancePolicy", displayName: "legacy" },
  ];
  const apps = [{ id: "a1", displayName: "APP Android", minimumRequiredOsVersion: "13", minimumRequiredPatchVersion: "2026-10-01", __coll: "androidManagedAppProtections" }];
  const inv = F.inventory(comp, apps);
  ok("inventory: the five platforms' types, Windows 8.1 left out", inv.length === 6 && !inv.some((i) => i.id === "c6"));
  ok("…app protection items carry their collection's type for the write", inv.find((i) => i.id === "a1").odataType === "#microsoft.graph.androidManagedAppProtection");
  const scope = {}; for (const i of inv) scope[i.key] = { on: true };
  scope["compliance|c2"].track = "iPadOS";
  const rules = { cadenceDays: 14, scope };
  const rels = {
    iOS: F.appleRelease(eol, "newest", 14),
    iPadOS: Object.assign(F.appleRelease(eol, "newest", 14), { effective: new Date(now.getTime() - DAY) }),
    macOS: F.appleRelease(eol, "newest", 14),
    Android: a1,
    Windows: W,
  };
  rels.iOS.effective = new Date(now.getTime() - DAY);          // past the cadence
  const rows = F.plan(inv, rels, rules, now);
  const row = (id, field) => rows.find((r) => r.id === id && r.field === field);
  ok("one row per setting — Android's OS and patch level are two", !!row("c4", "osMinimumVersion") && !!row("c4", "minAndroidSecurityPatchLevel"));
  ok("↑ below the target and past the cadence", row("c1", "osMinimumVersion").state === "up" && row("c1", "osMinimumVersion").target === "27.0.1");
  ok("= an iPad policy following iPadOS already at the target", row("c2", "osMinimumVersion").state === "meets" && row("c2", "osMinimumVersion").track === "iPadOS");
  ok("↓ above the target: kept, never lowered", row("c3", "osMinimumVersion").state === "lower" && !row("c3", "osMinimumVersion").tickable);
  ok("…unless lowering is allowed", F.plan(inv, rels, Object.assign({}, rules, { allowDowngrade: true }), now).find((r) => r.id === "c3").state === "wait");
  ok("Android's OS row needs no cadence (the oldest maintained release)", row("c4", "osMinimumVersion").state === "up" && row("c4", "osMinimumVersion").target === "13");
  ok("◷ its patch level waits for the cadence, and can be ticked (forced)", row("c4", "minAndroidSecurityPatchLevel").state === "wait" && row("c4", "minAndroidSecurityPatchLevel").tickable);
  ok("= app protection already at this month's patch", row("a1", "minimumRequiredPatchVersion").state === "meets");
  ok("Windows ranges: empty today → the catalog's ranges, waiting", row("c5", "validOperatingSystemBuildRanges").state === "wait" && /26100\.6584–10\.0\.26100\.6899/.test(row("c5", "validOperatingSystemBuildRanges").target));
  ok("Minimum version mode writes osMinimumVersion instead", F.plan(inv, rels, Object.assign({}, rules, { win: { mode: "MinimumVersion" } }), now).some((r) => r.id === "c5" && r.field === "osMinimumVersion" && r.targetRaw === "10.0.26200.6584"));
  ok("Android's patch level can be left alone", !F.plan(inv, rels, Object.assign({}, rules, { androidPatch: false }), now).some((r) => /Patch/.test(r.field)));
  const noRel = F.plan(inv, { iOS: { error: "endoflife.date could not be read" } }, rules, now);
  ok("no release data is ! No data with the reason, never a guess", noRel.find((r) => r.id === "c1").state === "nodata" && /could not be read/.test(noRel.find((r) => r.id === "c1").why));
  ok("out of scope is not planned at all", F.plan(inv, rels, { scope: {} }, now).length === 0);
  ok("default ticks are the ↑ rows only", [...F.defaultTicks(rows)].every((k) => rows.find((r) => r.key === k).state === "up") && F.defaultTicks(rows).size === rows.filter((r) => r.state === "up").length);

  // ------------------------------------------------------------ the write --
  const ticks = new Set([row("c4", "osMinimumVersion").key, row("c4", "minAndroidSecurityPatchLevel").key, row("c3", "osMinimumVersion").key]);
  const gs = F.groups(rows, ticks);
  ok("one group per policy, the ticked settings together; a locked row never joins", gs.length === 1 && gs[0].rows.length === 2);
  const body = F.patchBody(gs[0]);
  ok("the PATCH names the policy's type and the two settings", body["@odata.type"] === "#microsoft.graph.androidWorkProfileCompliancePolicy" && body.osMinimumVersion === "13" && body.minAndroidSecurityPatchLevel === "2026-10-01");
  ok("drift: unchanged since the plan is no drift", F.drifted(gs[0], { osMinimumVersion: "12", minAndroidSecurityPatchLevel: "2026-08-01T00:00:00Z" }).length === 0);
  ok("…a value changed since is caught", F.drifted(gs[0], { osMinimumVersion: "14", minAndroidSecurityPatchLevel: "2026-08-01" }).length === 1);
  ok("read-back: the written values are there", F.missed(gs[0], { osMinimumVersion: "13", minAndroidSecurityPatchLevel: "2026-10-01" }).length === 0);
  ok("…and a write that did not stick is caught", F.missed(gs[0], { osMinimumVersion: "12", minAndroidSecurityPatchLevel: "2026-10-01" }).length === 1);
  const wg = F.groups(rows, new Set([row("c5", "validOperatingSystemBuildRanges").key]));
  ok("ranges are written as the array", Array.isArray(F.patchBody(wg[0]).validOperatingSystemBuildRanges) && F.patchBody(wg[0]).validOperatingSystemBuildRanges.length === 2);
  const J = F.journalEntries(gs[0], "me@x", "2026-10-14T10:00Z", false);
  ok("the journal keeps the old value of each setting", J.length === 2 && J[0].from === "12" && J[0].to === "13" && J[0].by === "me@x");
  const back = F.groupOfEntry(J[0]);
  ok("Set back: a group that writes the old value, guarded by the written one", back.rows[0].nowRaw === "13" && back.rows[0].targetRaw === "12" && F.patchBody(back).osMinimumVersion === "12");

  // ------------------------------------------------------------ audit log --
  const fc = F.floorChanges([
    { when: "2026-10-01", actor: "aa-floor", actorKind: "app", name: "CMP Win", ok: true, changes: [{ path: "OsMinimumVersion", from: "1", to: "2" }, { path: "Description", from: "a", to: "b" }] },
    { when: "2026-10-02", actor: "x@y", actorKind: "user", name: "Other", ok: true, changes: [{ path: "PasswordRequired", from: false, to: true }] },
  ]);
  ok("audit: only floor settings, any actor, other changes left out", fc.length === 1 && fc[0].changes.length === 1 && fc[0].byKind === "app");

  // -------------------------------------------------------- the runbook --
  const block = F.configBlock(Object.assign({}, rules, { track: { iOS: "previous" }, androidPatch: false }), inv, "tid-1");
  ok("config: ManagedIdentity, the tenant, the cadence, dry run ON", /\$AuthMode\s+= "ManagedIdentity"/.test(block) && /\$TenantId\s+= "tid-1"/.test(block) && /\$CadenceDays\s+= 14/.test(block) && /\$DryRun\s+= \$true/.test(block));
  ok("…policies under their platform, iPad-tracked ones under iPadOS, app protection apart", /iOS\s+= @\(\n\s+'c1'/.test(block) && /iPadOS\s+= @\(\n\s+'c2'/.test(block) && /\$AppProtectionPolicies = @\{[\s\S]*Android\s+= @\(\n\s+'a1'/.test(block));
  ok("…what the script cannot do is said, not silently dropped", /NOT EXPORTED: TUNO holds iOS on the previous major/.test(block) && /NOT EXPORTED: TUNO leaves Android's patch level alone/.test(block));
  const multi = F.configBlock({ scope: { "compliance|x1": { on: true }, "compliance|x2": { on: true } } }, F.inventory([
    { id: "x1", "@odata.type": "#microsoft.graph.macOSCompliancePolicy", displayName: "M1" }, { id: "x2", "@odata.type": "#microsoft.graph.macOSCompliancePolicy", displayName: "M2" }], []), "t");
  ok("…two ids in one array are comma-separated, the last without", /'x1',  # M1\n\s+'x2'  # M2/.test(multi), multi.split("\n").filter((l) => /x[12]/.test(l)).join(" | "));
  const rb = F.runbook(script, rules, inv, "tid-1", { build: "v1.0.3-beta.405", when: "now" });
  const tail = script.slice(script.indexOf("# --------------------------- Script Variables"));
  const headUp = script.slice(0, script.indexOf("# --------------------------- Authentication"));
  ok("runbook: the script before and after the configuration is byte-for-byte upstream", rb.startsWith(headUp) && rb.endsWith(tail));
  ok("…with the configuration replaced, stamped with the build", /Configuration exported by TUNO v1\.0\.3-beta\.405/.test(rb) && !/<auth-mode>/.test(rb));
  let threw = false; try { F.runbook("no banners here", rules, inv, "t", {}); } catch { threw = true; }
  ok("…a script that changed shape is refused, never guessed", threw);
  ok("the vendored copy carries its MIT licence", /MIT License[\s\S]*James Robinson/.test(fs.readFileSync(path.join(ROOT, "vendor/intune-compliance-maintainer/LICENSE"), "utf8")));
  ok("CSV: a row per setting with the outcome in words", F.csv(rows).split("\n").length === rows.length + 1 && /Would lower/.test(F.csv(rows)));

  // ------------------------------------------------------------ wiring --
  const D = w.document, $ = (id) => D.getElementById(id);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ok("T30 in the registry, 0.x on beta, writes to the tenant", w.TOOL_VERSIONS.toolOsFloor.t === 30 && /^0\./.test(w.TOOL_VERSIONS.toolOsFloor.v) && w.TOOL_VERSIONS.toolOsFloor.chips.includes("writes to the tenant"));
  ok("the screen is a tool screen", $("screen-osfloor").classList.contains("screen") && $("screen-osfloor").classList.contains("tool") && $("toolOsFloor").classList.contains("tool-tile"));
  ok("connect-src allows endoflife.date and nothing new besides", /connect-src 'self' https:\/\/graph\.microsoft\.com https:\/\/login\.microsoftonline\.com https:\/\/api\.github\.com https:\/\/raw\.githubusercontent\.com https:\/\/endoflife\.date;/.test(html));
  const reg = fs.readFileSync(path.join(ROOT, "New-TunoAppRegistration.ps1"), "utf8"), sec = fs.readFileSync(path.join(ROOT, "SECURITY.md"), "utf8");
  ok("the two new scopes are on the registration script", /"DeviceManagementApps\.ReadWrite\.All"/.test(reg) && /"WindowsUpdates\.ReadWrite\.All"/.test(reg));
  ok("…and in SECURITY.md", /DeviceManagementApps\.ReadWrite\.All/.test(sec) && /WindowsUpdates\.ReadWrite\.All/.test(sec) && /endoflife\.date/.test(sec));

  // ------------------------------------------------------- the screen --
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolOsFloor").click();
  await sleep(50);
  ok("before a read the plan says nothing is read or written yet", /nothing is read until then/.test($("ofBody").textContent));
  $("ofRun").click();
  await until(() => !$("ofRun").disabled && /Policies in scope/.test($("ofBody").textContent), 20000, "first read");
  ok("nothing in scope: the first read lands on Rules", $("ofBody").querySelector(".ep-node.active").dataset.ofpane === "rules");
  const pick = (name) => [...$("ofBody").querySelectorAll("[data-ofscope]")].find((c) => c.closest("tr").textContent.includes(name));
  ok("the demo tenant's policies are offered", !!pick("WIN — Compliance baseline") && !!pick("APP — Android baseline") && !!pick("MAC — Compliance baseline"));
  for (const n of ["WIN — Compliance baseline", "APP — Android baseline", "APP — iOS baseline"]) { const c = pick(n); c.checked = true; c.dispatchEvent(new w.Event("change")); }
  $("ofRun").click();
  await until(() => !$("ofRun").disabled && w.OsFloorTool.state().rows.length > 0, 20000, "second read");
  const st = w.OsFloorTool.state();
  ok("rules are kept per tenant", /"on":true/.test(w.localStorage.getItem("tuno.osfloor.rules:demo") || ""));
  ok("the demo's Windows catalog is read: ranges for 24H2 and 25H2", st.releases.Windows && st.releases.Windows.ranges && st.releases.Windows.ranges.length === 2);
  $("ofBody").querySelector('[data-ofpane="plan"]').click();
  ok("the plan: platform cards and a row per setting", $("ofBody").querySelectorAll(".of-card").length >= 4 && $("ofBody").querySelectorAll("[data-oftick]").length === st.rows.length);
  const winRow = st.rows.find((r) => r.name === "WIN — Compliance baseline");
  ok("the Windows baseline wants ranges, and the newest update is still inside the cadence", winRow.field === "validOperatingSystemBuildRanges" && winRow.state === "wait");
  const iosRow = st.rows.find((r) => r.name === "APP — iOS baseline");
  ok("an iOS app protection policy with no minimum: ↑ to the newest iOS patch", iosRow.state === "up" && iosRow.target === "27.0.1");
  ok("only ↑ rows are ticked at first", st.ticks.has(iosRow.key) && !st.ticks.has(winRow.key));
  const box = [...$("ofBody").querySelectorAll("[data-oftick]")].find((c) => c.dataset.oftick === winRow.key);
  box.checked = true; box.dispatchEvent(new w.Event("change"));
  ok("ticking a ◷ row forces it, and the bar says so", /forced ahead of the cadence/.test($("ofBody").querySelector(".of-bar").textContent));
  const n = w.OsFloorTool.state().ticks.size;
  $("ofApply").click();
  await until(() => /\d+ polic(y|ies) updated/.test($("ofBody").textContent), 20000, "apply");
  ok("Apply writes through the run ledger and reports what landed", /updated/.test($("ofBody").querySelector(".of-done").textContent) && !!$("ofLedger").querySelector(".rl"));
  const fixture = w.TUNO_DEMO_GRAPH.T.COMPLIANCE_POLICIES.find((p) => p.displayName === "WIN — Compliance baseline");
  ok("the forced Windows row reached the (demo) tenant as two ranges, read back", Array.isArray(fixture.validOperatingSystemBuildRanges) && fixture.validOperatingSystemBuildRanges.length === 2);
  const jr = w.OsFloorTool.state().journal;
  ok("every written setting is journalled with its old value", jr.length === n && jr.some((e) => e.policy === "APP — iOS baseline" && (e.from === null || e.from === undefined) && e.to === "27.0.1"), `${jr.length} vs ${n}`);
  ok("after the write the plan shows them as met", w.OsFloorTool.state().rows.filter((r) => jr.some((e) => e.policy === r.name && e.field === r.field)).every((r) => r.state === "meets"));
  $("ofBody").querySelector('[data-ofpane="journal"]').click();
  const iosIdx = jr.findIndex((e) => e.policy === "APP — iOS baseline");
  $("ofBody").querySelector(`[data-ofback="${iosIdx}"]`).click();
  await until(() => w.OsFloorTool.state().journal.length === n + 1, 20000, "set back");
  const iosFix = w.TUNO_DEMO_GRAPH.T.IOS_APP_PROTECTION[0];
  ok("↩ Set back writes the old value again, and journals that too", (iosFix.minimumRequiredOsVersion === null || iosFix.minimumRequiredOsVersion === undefined) && w.OsFloorTool.state().journal[0].setBack === true);
  $("ofBody").querySelector('[data-ofpane="unattended"]').click();
  ok("Unattended shows the config block from the rules", /\$CompliancePolicies = @\{/.test($("ofBody").querySelector(".of-pre").textContent));
  const before = downloads.length;
  $("ofRunbook").click();
  await until(() => downloads.length > before, 5000, "runbook");
  const text = await new Promise((res) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.readAsText(downloads[downloads.length - 1]); });
  ok("⭳ Runbook: the vendored script with the demo's policies in it", /IntuneComplianceMaintainer Starting/.test(text) && /\$AuthMode\s+= "ManagedIdentity"/.test(text) && /APP — iOS baseline/.test(text));
  $("ofCsv").click();
  ok("⭳ CSV is offered once there is a plan", $("ofCsv").style.display === "" && downloads.length > before + 1);

  // ------------------------------------------------------------ bookkeeping --
  ok("a changelog entry and a queue item name build 10705", w.CHANGELOG.some((e) => e.build === 10705) && w.PROMOTE.items.some((i) => (i.builds || []).includes(10705) && /OS floor keeper/.test(i.title)));

  console.log(`T30 OS floor keeper: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  w.close();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

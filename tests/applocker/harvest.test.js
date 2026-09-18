// ======================================================================
// T01's harvest site (10613): the panel, the stamp into the events
// collector, the scope taken in the open, and the script's own contract.
// Run with `npm test`, or alone:  node tests/applocker/harvest.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("harvest");

const SCRIPT = fs.readFileSync(path.join(ROOT, "scripts/Get-TunoAppControlEvents.ps1"), "utf8");
const HELPER = fs.readFileSync(path.join(ROOT, "scripts/New-TunoHarvestUploaderApp.ps1"), "utf8");
const SCANNER = fs.readFileSync(path.join(ROOT, "scripts/Invoke-TunoAppLockerScan.ps1"), "utf8");
const SCAN_DETECT = fs.readFileSync(path.join(ROOT, "scripts/Detect-TunoAppLockerScan.ps1"), "utf8");
const CFG = { siteUrl: "https://contoso.sharepoint.com/sites/TUNO-AppControl-Harvest", tenantId: "11111111-2222-3333-4444-555555555555", clientId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", certSubject: "CN=TUNO Harvest Uploader" };

const nodeTextCodecs = (w) => { w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; };
const isGuidLike = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));

run(async () => {

// =====================================================================
head("the stamp fills the HARVEST TARGET block and touches nothing else");
{
  const w = boot();
  const H = w.AppLockerTool._harvest;
  const out = H.stampHarvestConfig(SCRIPT, CFG);
  ok("SiteUrl is set", /^\s*SiteUrl\s*=\s*'https:\/\/contoso\.sharepoint\.com\/sites\/TUNO-AppControl-Harvest'$/m.test(out));
  ok("TenantId is set", /^\s*TenantId\s*=\s*'11111111-2222-3333-4444-555555555555'$/m.test(out));
  ok("ClientId is set", /^\s*ClientId\s*=\s*'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'$/m.test(out));
  ok("CertSubject is set", /^\s*CertSubject\s*=\s*'CN=TUNO Harvest Uploader'$/m.test(out));
  ok("CertThumbprint, ClientSecret and Folder are left as they were", /^\s*CertThumbprint\s*=\s*''$/m.test(out) && /^\s*ClientSecret\s*=\s*''$/m.test(out) && /^\s*Folder\s*=\s*'Harvest'$/m.test(out));
  // Everything outside the block is byte-identical: split both at the block
  // and compare the halves.
  const cut = (s) => { const a = s.indexOf("$script:HarvestTarget = [pscustomobject]@{"); const b = s.indexOf("\n}", a); return [s.slice(0, a), s.slice(b)]; };
  const [b1, a1] = cut(SCRIPT), [b2, a2] = cut(out);
  ok("nothing before the block changed", b1 === b2);
  ok("nothing after the block changed", a1 === a2);
  ok("the script's own ScriptVersion survives", /\$script:ScriptVersion = '1\.3\.0'/.test(out));
  const quoted = H.stampHarvestConfig(SCRIPT, Object.assign({}, CFG, { certSubject: "CN=O'Brien" }));
  ok("a quote in a value is doubled the PowerShell way", /CertSubject\s*=\s*'CN=O''Brien'/.test(quoted));
  let threw = "";
  try { H.stampHarvestConfig("# an older script with no block\n$x = 1\n", CFG); } catch (e) { threw = e.message; }
  ok("a script without the block is refused, by name", /HARVEST TARGET block/.test(threw), threw);
}

// =====================================================================
head("the config is all-or-nothing, remembered per tenant");
{
  const w = boot();
  const H = w.AppLockerTool._harvest;
  w.TunoTenant._setForTest("contoso.com", "Contoso", CFG.tenantId);
  ok("nothing set: no config", H.harvestConfig() === null);
  const d = H.deployState().harvest;
  d.loadedFor = null;   // force a reload against the new tenant id
  w.localStorage.setItem("tuno.t01.harvest." + CFG.tenantId, JSON.stringify({ site: { url: CFG.siteUrl, id: "x", status: "succeeded" }, clientId: CFG.clientId, certSubject: "" }));
  ok("site + client id but no certificate subject: still no config", H.harvestConfig() === null);
  d.certSubject = CFG.certSubject;
  const c = H.harvestConfig();
  ok("all four present: the config", !!c && c.siteUrl === CFG.siteUrl && c.tenantId === CFG.tenantId && c.clientId === CFG.clientId && c.certSubject === CFG.certSubject);
  d.clientId = "not-a-guid";
  ok("a client id that is not a GUID does not count", H.harvestConfig() === null);
  // 10615: the secret is the other credential — and never persisted
  d.clientId = CFG.clientId; d.cred = "secret"; d.secret = "";
  ok("secret mode without a secret: no config", H.harvestConfig() === null);
  d.secret = "s3cr3t~value";
  const cs = H.harvestConfig();
  ok("secret mode: the config carries the secret and no certificate", !!cs && cs.clientSecret === "s3cr3t~value" && cs.certSubject === "");
  const saved = JSON.parse(w.localStorage.getItem("tuno.t01.harvest." + CFG.tenantId) || "{}");
  ok("localStorage never holds the secret", !JSON.stringify(saved).includes("s3cr3t"));
  const stamped = H.stampHarvestConfig(SCRIPT, cs);
  ok("the stamp writes ClientSecret and leaves CertSubject empty", /^\s*ClientSecret\s*=\s*'s3cr3t~value'$/m.test(stamped) && /^\s*CertSubject\s*=\s*''$/m.test(stamped));
  d.cred = "cert"; d.secret = "";
  // 10616: the admin-centre host is corrected, not sent
  {
    const D = w.document; w.Graph.useDemo();
    const dd = H.deployState().harvest; dd.site = null; dd.host = "https://contoso-admin.sharepoint.com"; dd.name = "TUNO-AppControl-Harvest";
    H.renderHarvest();
    await H.createHarvestSite();
    ok("an -admin host is refused before any call, and the box is corrected", dd.site === null && dd.host === "https://contoso.sharepoint.com" && /admin centre/.test((dd.error || {}).message || ""));
    dd.host = "https://contoso-my.sharepoint.com"; await H.createHarvestSite();
    ok("a -my host is refused as OneDrive", dd.site === null && /OneDrive host/.test((dd.error || {}).message || ""));
    dd.host = "https://contoso.sharepoint.com"; dd.error = null;
  }
  ok("the SharePoint host is guessed from the initial onmicrosoft.com domain", (() => {
    const real = w.TunoTenant.org;
    w.TunoTenant.org = () => ({ verifiedDomains: [{ name: "contoso.com", isInitial: false }, { name: "Contoso.onmicrosoft.com", isInitial: true }] });
    const g = H.guessSharePointHost(); w.TunoTenant.org = real; return g === "https://contoso.sharepoint.com";
  })());
}

// =====================================================================
head("the panel: signed out it explains, signed in it offers; the events pair says what it carries");
{
  const w = boot();
  const D = w.document;
  const panel = D.getElementById("alHarvestDetails");
  ok("the panel exists, between the downloads and the deploy panel", !!panel && panel.nextElementSibling && panel.nextElementSibling.id === "alRemedyDetails" && panel.previousElementSibling && panel.previousElementSibling.classList.contains("al-dl"));
  ok("its summary says it writes to the tenant", /writes to your tenant/.test(panel.querySelector("summary").textContent));
  const box = D.getElementById("alHarvestBox");
  ok("signed out: the scope is named and there is no button", /Sites\.Create\.All/.test(box.textContent) && !box.querySelector("button"));
  ok("the summary counts eleven companion scripts", /11 companion scripts/.test(D.querySelector(".al-dl-more summary").textContent));
  ok("the helper has its download row", !!D.querySelector('.al-dl-row a[href="scripts/New-TunoHarvestUploaderApp.ps1"]'));
  // Signed in (demo), the button appears and the events blurb names the state.
  w.Graph.useDemo();
  w.TunoTenant._setForTest("contoso.com", "Contoso", CFG.tenantId);
  w.AppLockerTool._harvest.renderHarvest();
  ok("signed in: the create button", !!D.getElementById("alHarvestCreate"));
  ok("the readiness line says what is missing first: the site", /Target incomplete:.*no site yet/.test(box.textContent));
  D.getElementById("alRemedyDetails").open = true;
  D.getElementById("alRemedyDetails").dispatchEvent(new w.Event("toggle"));
  const rb = D.getElementById("alRemedyBox");
  ok("the events pair says the target is not set", /Harvest target not set/.test(rb.textContent));
}

// =====================================================================
head("creating the events pair carries the target, BOM kept, detection untouched");
{
  const w = boot();
  nodeTextCodecs(w);
  const D = w.document;
  w.Graph.useDemo();
  w.TunoTenant._setForTest("contoso.com", "Contoso", CFG.tenantId);
  const d = w.AppLockerTool._harvest.deployState().harvest;
  d.loadedFor = CFG.tenantId; d.site = { url: CFG.siteUrl, id: "x", status: "succeeded" }; d.clientId = CFG.clientId; d.certSubject = CFG.certSubject;
  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  const files = {
    "Detect-TunoAppControlEvents.ps1": Buffer.concat([bom, Buffer.from("# detect\nexit 1\n", "utf8")]),
    "Get-TunoAppControlEvents.ps1": Buffer.concat([bom, Buffer.from(SCRIPT.replace(/^\uFEFF/, ""), "utf8")]),
  };
  w.fetch = async (url) => {
    const name = String(url).split("/").pop();
    const buf = files[name];
    if (!buf) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  let made = null;
  w.Graph.remediations = async () => [];
  w.Graph.createRemediation = async (b) => { made = b; return { id: "demo-1", displayName: b.displayName }; };
  D.getElementById("alRemedyDetails").open = true;
  D.getElementById("alRemedyDetails").dispatchEvent(new w.Event("toggle"));
  ok("with a target the events pair says so before the click", /Harvest target set/.test(D.getElementById("alRemedyBox").textContent));
  D.querySelector('.al-dep-remedy[data-pair="events"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  for (let i = 0; i < 50 && !made; i++) await new Promise((r) => setTimeout(r, 10));
  ok("the Remediation was created", !!made, made ? "" : "no createRemediation call");
  if (made) {
    const rem = Buffer.from(made.remediationScriptContent, "base64");
    ok("the remediation script keeps its BOM", rem[0] === 0xEF && rem[1] === 0xBB && rem[2] === 0xBF);
    const text = rem.slice(3).toString("utf8");
    ok("the target is stamped in", new RegExp(`SiteUrl\\s*=\\s*'${CFG.siteUrl.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}'`).test(text) && /ClientId\s*=\s*'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'/.test(text));
    ok("the detection script is the exact bytes served", Buffer.from(made.detectionScriptContent, "base64").equals(files["Detect-TunoAppControlEvents.ps1"]));
    ok("the description names the site", /Uploads each pass to https:\/\/contoso\.sharepoint\.com\/sites\/TUNO-AppControl-Harvest/.test(made.description));
    ok("the created box says the target was carried", /Harvest target carried/.test(D.getElementById("alRemedyBox").textContent));
  }
}

// =====================================================================
head("10615 — the uploader app from the panel (demo), secret shown once and never saved");
{
  const w = boot();
  const D = w.document;
  w.Graph.useDemo();
  w.TunoTenant._setForTest("contoso.com", "Contoso", CFG.tenantId);
  const H = w.AppLockerTool._harvest;
  const d = H.deployState().harvest;
  d.loadedFor = CFG.tenantId; d.site = { url: CFG.siteUrl, id: "x", status: "succeeded" }; d.cred = "secret";
  H.renderHarvest();
  ok("the app button is offered once a site exists", !!D.getElementById("alHarvestApp") && !D.getElementById("alHarvestApp").disabled);
  ok("the secret radio is on and the secret box is a password field", D.querySelector('input[name="alHarvestCred"][value="secret"]').checked && D.getElementById("alHarvestSecret").type === "password");
  await H.createHarvestApp();
  ok("the demo run fills the client id and a secret", isGuidLike(d.clientId) && /^demo~secret~/.test(d.secret));
  const box = D.getElementById("alHarvestBox");
  ok("the panel shows the secret once, with the vault warning", box.textContent.includes(d.secret) && /kept for this page session only/.test(box.textContent));
  ok("every step chip is done", /Sites\.Selected consent: granted/.test(box.textContent) && /write on the site: granted/.test(box.textContent) && /client secret: created/.test(box.textContent));
  ok("the readiness line is complete and names the secret route", /Harvest target complete/.test(box.textContent) && /client secret/.test(box.textContent));
  const saved = JSON.parse(w.localStorage.getItem("tuno.t01.harvest." + CFG.tenantId) || "{}");
  ok("the app record is remembered, the secret is not", saved.app && saved.app.appId === d.clientId && !JSON.stringify(saved).includes(d.secret));
  ok("the events pair says the target is set", (D.getElementById("alRemedyDetails").open = true, D.getElementById("alRemedyDetails").dispatchEvent(new w.Event("toggle")), /Harvest target set/.test(D.getElementById("alRemedyBox").textContent)));
}
// =====================================================================
head("the scope is taken in the open (R18), and the scripts keep their promises");
{
  const reg = fs.readFileSync(path.join(ROOT, "New-TunoAppRegistration.ps1"), "utf8");
  const sec = fs.readFileSync(path.join(ROOT, "SECURITY.md"), "utf8");
  const graph = fs.readFileSync(path.join(ROOT, "js/graph.js"), "utf8");
  ok("the registration script carries Sites.Create.All", /"Sites\.Create\.All",/.test(reg));
  ok("10615: the three uploader-app scopes are on the registration and in SECURITY.md", ["Application.ReadWrite.All", "AppRoleAssignment.ReadWrite.All", "Sites.FullControl.All"].every((sc) => reg.includes(`"${sc}",`) && sec.includes(sc)));
  ok("graph.js names them as their own SCOPES entries", /appsWrite: \["Application\.ReadWrite\.All"\]/.test(graph) && /appRoleWrite: \["AppRoleAssignment\.ReadWrite\.All"\]/.test(graph) && /sitesFull: \["Sites\.FullControl\.All"\]/.test(graph));
  ok("the uploader app asks for Sites.Selected (Application) and nothing else", /SITES_SELECTED_ROLE = "883ea226-0bf2-4a8f-9f9d-92c9162a727d"/.test(graph) && /resourceAccess: \[\{ id: roleId, type: "Role" \}\]/.test(fs.readFileSync(path.join(ROOT, "js/applocker.js"), "utf8")));
  ok("the collector takes a secret only when no certificate is configured, and never logs it", /if \(-not \$Cert\) \{/.test(SCRIPT) && /client_secret = \$Secret/.test(SCRIPT) && /client secret \(value not logged\)/.test(SCRIPT) && !/Write-Log[^\n]*ClientSecret\b/.test(SCRIPT));
  ok("SECURITY.md explains it as a write, and says the devices never hold TUNO's identity", /Sites\.Create\.All/.test(sec) && /devices never hold TUNO's identity/.test(sec));
  ok("graph.js names it as its own SCOPES entry, apart from the Intune writes", /sitesCreate: \["Sites\.Create\.All"\]/.test(graph));
  ok("createSite posts to /beta/sites with that scope and asks for the Location", /createSite = \(site\) => call\("POST", `\$\{BETA\}\/sites`, \{ body: site, scopes: SCOPES\.sitesCreate, withLocation: true \}\)/.test(graph));
  ok("the collector has the HARVEST TARGET block with empty defaults", /\$script:HarvestTarget = \[pscustomobject\]@\{\s*\n\s*SiteUrl\s*=\s*''/.test(SCRIPT));
  ok("the collector's HARVEST TARGET block ships with an EMPTY secret line", /^\s*ClientSecret\s*=\s*''$/m.test(SCRIPT) && /client_assertion/.test(SCRIPT));
  ok("the collector reads the registry override and the parameters", /HKLM:\\SOFTWARE\\TUNO\\Harvest/.test(SCRIPT) && /\[string\]\$HarvestSiteUrl/.test(SCRIPT));
  ok("the collector says which half wins", /parameters, then the registry,\s*\n\s*# then the embedded block/.test(SCRIPT));
  ok("an upload failure is a warning, not an exit 1", /\$HarvestNote = "harvest: upload FAILED - \$\(\$_\.Exception\.Message\)"\s*\n\s*Add-CollectWarning \$HarvestNote/.test(SCRIPT));
  ok("the helper asks Sites.Selected as an APPLICATION role and grants one site", /AllowedMemberTypes -contains 'Application'/.test(HELPER) && /\/sites\/\$siteId\/permissions/.test(HELPER));
  ok("the helper never writes the PFX password to disk", !/(Set-Content|Out-File|WriteAllText)[^\n]*plainPassword/.test(HELPER) && /shown ONCE, not saved anywhere/.test(HELPER));
  ok("the helper carries the two build numbers", /\$script:ScriptVersion = '1\.0\.0'/.test(HELPER) && /\$script:TunoBuild = \d+/.test(HELPER));
}

// =====================================================================
head("10617 — the scanner as a Remediation: HARVEST TARGET block, Remediation mode, the pair");
{
  const w = boot();
  const H = w.AppLockerTool._harvest;
  ok("the scanner is 1.13.0 with the HARVEST TARGET block and empty defaults", /\$script:ScriptVersion = '1\.13\.0'/.test(SCANNER) && /\$script:HarvestTarget = \[pscustomobject\]@\{\s*\n\s*SiteUrl\s*=\s*''/.test(SCANNER) && /^\s*ClientSecret\s*=\s*''$/m.test(SCANNER));
  const out = H.stampHarvestConfig(SCANNER, Object.assign({}, CFG, { certSubject: "", clientSecret: "s3cr3t~value" }));
  ok("the stamp fills the scanner's block the same way", /^\s*SiteUrl\s*=\s*'https:\/\/contoso\.sharepoint\.com\/sites\/TUNO-AppControl-Harvest'$/m.test(out) && /^\s*ClientSecret\s*=\s*'s3cr3t~value'$/m.test(out) && /^\s*CertSubject\s*=\s*''$/m.test(out));
  ok("Remediation mode is SYSTEM without -OutputPath, and only that", /\$PSBoundParameters\.ContainsKey\('OutputPath'\)\) -and\s*\n\s*\(\[System\.Security\.Principal\.WindowsIdentity\]::GetCurrent\(\)\.User\.Value -eq 'S-1-5-18'\)/.test(SCANNER));
  ok("in that mode the output goes to the house folder with a transcript, and the run ends in one line and exit 0", /IT-TOOLS\\LOGS\\AppLockerScan'/.test(SCANNER) && /Start-Transcript -Path \$script:TranscriptPath/.test(SCANNER) && /if \(\$script:RemediationMode\) \{\s*\n\s*try \{ Stop-Transcript \| Out-Null \} catch \{ \}\s*\n\s*Write-Output \("TUNO scan v\{0\} on \{1\}/.test(SCANNER) && /exit 0\s*\n\}\s*\n\$written\s*$/.test(SCANNER));
  ok("a fatal in that mode exits 1 with the line named", /Write-Output \("TUNO scan FAILED at line \{0\}: \{1\}"/.test(SCANNER) && /exit 1\s*\n\s*\}\s*\n\s*break/.test(SCANNER));
  ok("retention: 30 as a Remediation, 0 interactively, own names only", /if \(\$RetentionDays -lt 0\) \{ \$RetentionDays = \$\(if \(\$script:RemediationMode\) \{ 30 \} else \{ 0 \}\) \}/.test(SCANNER) && /Pattern = 'TunoAppLockerScan-\*\.json'/.test(SCANNER) && /-Keep @\(\$script:TranscriptPath\)/.test(SCANNER));
  // the housekeeping function is byte-identical across every remediation half
  const fn = (src) => { const a = src.indexOf("function Remove-TunoStaleOutput {"); return a < 0 ? null : src.slice(a, src.indexOf("\n}\n", a) + 3); };
  const clear = fs.readFileSync(path.join(ROOT, "scripts/Clear-TunoAppLockerPolicy.ps1"), "utf8");
  ok("Remove-TunoStaleOutput is byte-identical in the scanner, the collector and the cleanup", fn(SCANNER) !== null && fn(SCANNER) === fn(SCRIPT) && fn(SCANNER) === fn(clear));
  ok("the upload happens AFTER the bundle is on disk, and a failure is a warning", SCANNER.indexOf("[System.IO.File]::WriteAllText($bundlePath") < SCANNER.indexOf("$harvestCfg = Get-HarvestConfig") && /\$HarvestNote = "harvest: upload FAILED - \$\(\$_\.Exception\.Message\)"\s*\n\s*Add-ScanWarning \$HarvestNote/.test(SCANNER));
  ok("the scanner uploads its own bundle name and prunes only its own names", /Send-HarvestFile -SiteId \$siteId -RemotePath \("\{0\}\/\{1\}" -f \$deviceFolder, \(Split-Path -Leaf \$bundlePath\)\)/.test(SCANNER) && /\$it\.name -notlike 'TunoAppLockerScan-\*'/.test(SCANNER));
  ok("strict mode: absent properties are tested by name, not read", /PSObject\.Properties\.Name -contains 'file'/.test(SCANNER) && /PSObject\.Properties\.Name -contains 'access_token'/.test(SCANNER));
  ok("the secret is never written to the console or transcript", !/Write-(Info|Ok|Note|Host)[^\n]*\$harvestCfg\.ClientSecret/.test(SCANNER) && /client secret \(value not logged\)/.test(SCANNER));
  ok("the detection half looks for a bundle younger than 7 days in the same folder", /\$MaxAgeDays = 7/.test(SCAN_DETECT) && /IT-TOOLS\\LOGS\\AppLockerScan'/.test(SCAN_DETECT) && /Filter 'TunoAppLockerScan-\*\.json'/.test(SCAN_DETECT) && /exit 1/.test(SCAN_DETECT) && /exit 0\s*$/.test(SCAN_DETECT));
  ok("the detection half carries the two build numbers", /\$script:ScriptVersion = '1\.0\.0'/.test(SCAN_DETECT) && /\$script:TunoBuild = \d+/.test(SCAN_DETECT));
  ok("the scanner stays under Intune's 200 KB script limit", Buffer.byteLength(SCANNER, "utf8") < 200 * 1024, String(Buffer.byteLength(SCANNER, "utf8")));
  const P = H.REMEDY_PAIRS;
  ok("the deploy panel has a fourth pair, scan, carrying the harvest target", !!P.scan && P.scan.detect === "Detect-TunoAppLockerScan.ps1" && P.scan.remediate === "Invoke-TunoAppLockerScan.ps1" && P.scan.harvest === true && P.events.harvest === true && !P.cleanup.harvest && !P.ittools.harvest);
  ok("its blurb says the device is not changed and names the reference ring", /not changed/.test(P.scan.blurb) && /reference ring/.test(P.scan.blurb));
  const D = w.document;
  ok("Help & scripts has the detection row and the scanner's Remediation-mode note", !!D.querySelector('.al-dl-row a[href="scripts/Detect-TunoAppLockerScan.ps1"]') && /Remediation mode/.test(D.querySelector('.al-dl-row a[href="scripts/Invoke-TunoAppLockerScan.ps1"]').parentElement.nextElementSibling.textContent));
  const versions = fs.readFileSync(path.join(ROOT, "js/applocker.js"), "utf8");
  ok("SCRIPT_VERSIONS names both", /"Invoke-TunoAppLockerScan\.ps1":\s*\{ v: "1\.13\.0"/.test(versions) && /"Detect-TunoAppLockerScan\.ps1":\s*\{ v: "1\.0\.0"/.test(versions));
  ok("README has the rows", /Detect-TunoAppLockerScan\.ps1/.test(fs.readFileSync(path.join(ROOT, "scripts/README.md"), "utf8")));
}

// =====================================================================
head("10617 — 📁 From the harvest site: the read scope, the entrance, the listing, the import");
{
  const reg = fs.readFileSync(path.join(ROOT, "New-TunoAppRegistration.ps1"), "utf8");
  const sec = fs.readFileSync(path.join(ROOT, "SECURITY.md"), "utf8");
  const graph = fs.readFileSync(path.join(ROOT, "js/graph.js"), "utf8");
  ok("Sites.Read.All is on the registration and in SECURITY.md (R18)", /"Sites\.Read\.All",/.test(reg) && /`Sites\.Read\.All`/.test(sec));
  ok("graph.js names it as its own read entry, and the drive reads cost only that", /sitesRead: \["Sites\.Read\.All"\]/.test(graph) && /driveChildren = async \(siteId, folderPath\)/.test(graph) && !/driveChildren[\s\S]{0,600}scopes: SCOPES\.sitesFull/.test(graph.slice(graph.indexOf("const driveChildren"))));
  ok("the download uses the pre-authenticated URL with no token on it", /let dl = it && it\[DL\]/.test(graph) && /fetch\(dl, \{ method: "GET" \}\)/.test(graph));
  ok("10618: the item is read plain (no $select naming the annotation), content.downloadUrl is the second try, and the message names the SharePoint page", /drive\/items\/\$\{encodeURIComponent\(itemId\)\}`, \{ scopes: SCOPES\.sitesRead/.test(graph) && /\$select=id,content\.downloadUrl/.test(graph) && /open it in SharePoint/.test(graph) && !/\$select=[^`]*@microsoft\.graph\.downloadUrl/.test(graph));
  const w = boot();
  const D = w.document;
  const H = w.AppLockerTool._harvest;
  const btn = D.getElementById("alImportSp");
  ok("the entrance sits with the two upload buttons", !!btn && btn.previousElementSibling && btn.previousElementSibling.id === "alImportEv");
  ok("file kinds are told apart by name", H.harvestFileKind("TunoAppLockerScan-PC1-20260916-0900.json").kind === "scan" && H.harvestFileKind("AppControlEvents_Bundle_20260916-0301.json").kind === "events" && H.harvestFileKind("AppControlEvents_Report_20260916-0301.html").kind === "report" && !H.harvestFileKind("AppControlEvents_Report_20260916-0301.html").importable && H.harvestFileKind("other.json").importable);
  btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const card = D.getElementById("alHarvestFetch");
  ok("signed out: the card opens and asks for a sign-in, naming the read scope", card.style.display !== "none" && /Sign in first/.test(card.textContent) && /Sites\.Read\.All/.test(card.textContent) && !card.querySelector("#alHvRead"));
  btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok("a second click closes it", card.style.display === "none");
  // signed in (demo): the URL is prefilled from the harvest state, the site read lists devices, a device lists files newest first
  w.Graph.useDemo();
  w.TunoTenant._setForTest("contoso.com", "Contoso", CFG.tenantId);
  const d = H.deployState().harvest; d.loadedFor = CFG.tenantId; d.site = { url: CFG.siteUrl, id: "x", status: "succeeded" };
  H.evHarvest.siteUrl = "";
  btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  for (let i = 0; i < 50 && H.evHarvest.busy; i++) await new Promise((r) => setTimeout(r, 10));
  ok("the site URL is prefilled from the 📁 panel's site", D.getElementById("alHvUrl").value === CFG.siteUrl);
  ok("the site was read on opening and the device folders are listed", Array.isArray(H.evHarvest.devices) && H.evHarvest.devices.length === 2 && card.querySelectorAll("[data-hvdev]").length === 2);
  card.querySelector("[data-hvdev='0']").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  for (let i = 0; i < 50 && H.evHarvest.busy; i++) await new Promise((r) => setTimeout(r, 10));
  ok("a device's files are listed newest first", Array.isArray(H.evHarvest.files) && H.evHarvest.files.length === 4 && H.evHarvest.files[0].lastModifiedDateTime >= H.evHarvest.files[1].lastModifiedDateTime);
  const nw = H.harvestNewest();
  ok("the newest scan and events bundles are the two big buttons", nw.scan && /^TunoAppLockerScan-/.test(nw.scan.name) && nw.events && nw.events.name === "AppControlEvents_Bundle_20260916-0301.json" && /Import newest scan bundle/.test(card.textContent) && /Import newest events bundle/.test(card.textContent));
  ok("the report is opened, not imported", !card.querySelector(`[data-hvimport="demo-f3"]`));
  H.evHarvest.siteUrl = "https://contoso-admin.sharepoint.com/sites/x"; await H.harvestReadSite();
  ok("a URL that is not a /sites/ URL is refused before any call", !!H.evHarvest.error && /not a SharePoint site URL/.test(H.evHarvest.error.message) || (H.evHarvest.siteUrl = "nonsense", await H.harvestReadSite(), /not a SharePoint site URL/.test((H.evHarvest.error || {}).message || "")));
  // the import goes through importFile: hand the demo item real bundle text
  H.evHarvest.error = null; H.evHarvest.siteUrl = CFG.siteUrl; await H.harvestReadSite(); await H.harvestOpenDevice(H.evHarvest.devices[0]);
  w.Graph.isDemo = () => false;
  const eventsText = JSON.stringify({ schema: "tuno.applocker.events/1", generator: { generatedUtc: "2026-09-16T03:01:00Z" }, events: { available: true, daysBack: 30, summary: { total: 0, allowed: 0, audited: 0, blocked: 0 }, entries: [] } });
  w.Graph.driveItemText = async (siteId, itemId) => { if (itemId !== "demo-f2") throw new Error("wrong item " + itemId); return eventsText; };
  await H.harvestImport(H.evHarvest.files.find((f) => f.id === "demo-f2"));
  ok("importing the events bundle lands it on the table like an upload", !H.evHarvest.error && /Imported AppControlEvents_Bundle_20260916-0301\.json from REF-IMAGE-01/.test(card.textContent) && /📡 Events/.test(D.getElementById("alEvidence").textContent) && /loaded/.test(D.getElementById("alEvidence").textContent), (H.evHarvest.error || {}).message);
  w.Graph.driveItemText = async () => { const e = new w.Graph.GraphError("graph", "The download answered HTTP 403."); return Promise.reject(e); };
  await H.harvestImport(H.evHarvest.files[0]);
  ok("a failed download is shown on the card, nothing else changes", !!H.evHarvest.error && /HTTP 403/.test(H.evHarvest.error.message) && /Could not read the site/.test(card.textContent));
}

});

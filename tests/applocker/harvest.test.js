// ======================================================================
// T01's harvest site (10613): the panel, the stamp into the events
// collector, the scope taken in the open, and the script's own contract.
// Run with `npm test`, or alone:  node tests/applocker/harvest.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("harvest");

const SCRIPT = fs.readFileSync(path.join(ROOT, "scripts/Get-TunoAppControlEvents.ps1"), "utf8");
const HELPER = fs.readFileSync(path.join(ROOT, "scripts/New-TunoHarvestUploaderApp.ps1"), "utf8");
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
  ok("the summary counts ten companion scripts", /10 companion scripts/.test(D.querySelector(".al-dl-more summary").textContent));
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

});

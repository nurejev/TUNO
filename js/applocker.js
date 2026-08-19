// ======================================================================
// 🔐 AppLocker builder & validator (T01) — TUNO's first tool.
//
// Three halves in one screen:
//   1. AUDIT   — the AppLockerInspector check set, ported from Spencer
//                Alessi's Invoke-AppLockerInspector.ps1 (v0.1). Everything
//                that can be judged from the XML alone runs here; the NTFS
//                and SMB-share ACL reality checks need a filesystem and stay
//                in his PowerShell. The report SAYS which checks did not run
//                rather than pretending they did.
//   2. COVERAGE— the Microsoft-apps check: evaluate the catalog in
//                js/msappcatalog.js against the policy the way AppLocker
//                itself decides (deny beats allow, exceptions respected,
//                macros expanded, publisher fields matched) and answer, per
//                app: allowed / blocked / allowed only via a risky rule.
//   3. BUILDER — enforcement modes, default rules, publisher/path rules,
//                one-click fixes from the coverage rows, delete — and
//                export as policy XML that imports straight into a GPO.
//
// Everything runs in the browser. The XML never leaves the machine.
// ======================================================================
const AppLockerTool = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ---------- constants ----------
  const COLLECTIONS = ["Exe", "Msi", "Script", "Dll", "Appx"];
  const COLLECTION_LABEL = { Exe: "EXE — executables", Msi: "MSI — installers", Script: "Script", Dll: "DLL", Appx: "Packaged app (Appx)" };
  const MODES = ["NotConfigured", "AuditOnly", "Enabled"];
  const SEV_SCORE = { High: 3, Medium: 2, Low: 1, Info: 0 };
  const SEV_ORDER = ["High", "Medium", "Low", "Info"];

  const WELL_KNOWN_SIDS = {
    "S-1-1-0": "Everyone",
    "S-1-5-11": "Authenticated Users",
    "S-1-5-32-545": "BUILTIN\\Users",
    "S-1-5-32-544": "BUILTIN\\Administrators",
    "S-1-5-4": "Interactive",
    "S-1-5-18": "NT AUTHORITY\\SYSTEM",
    "S-1-5-19": "NT AUTHORITY\\LOCAL SERVICE",
    "S-1-5-20": "NT AUTHORITY\\NETWORK SERVICE",
    "S-1-5-32-546": "BUILTIN\\Guests",
  };
  const BROAD_SIDS = new Set(["S-1-1-0", "S-1-5-11", "S-1-5-32-545", "S-1-5-4"]);
  const ADMIN_SID = "S-1-5-32-544";
  const BROAD_NAME_RE = /^(Everyone|Authenticated Users|BUILTIN\\Users|Domain Users|Interactive)$/i;

  const sidName = (sid) => WELL_KNOWN_SIDS[sid] || (/-513$/.test(String(sid)) ? "Domain Users (by RID)" : sid);
  const isBroadSid = (sid) => BROAD_SIDS.has(sid) || /-513$/.test(String(sid)) || BROAD_NAME_RE.test(sidName(sid));
  const isAdminSid = (sid) => sid === ADMIN_SID;

  // ---------- state ----------
  let policy = null;        // { collections: Map-like array, sourceName }
  let findings = [];
  let coverage = [];
  let sevFilter = "all";
  let importedXmlName = "";
  let undoState = null;     // { snapshot, label } — one step back, see mutate()
  let fixOpen = null;       // findingKey() of the finding whose editor is open
  let shownFindings = [];   // the filtered rows render() last drew, for handlers
  let scan = null;          // the uploaded TUNO scan bundle, or null
  let scanSource = "";      // "generated-audit" | "generated-enforce" | "effective"
  let pane = "xml";         // which artefact the code panel is showing
  const intuneCfg = { displayName: "Win - Device Security - AppLocker", grouping: "Pilot", mode: "Audit" };

  // AppLocker rule-collection Type → the segment the AppLocker CSP expects in the
  // OMA-URI. Anything not in here has no CSP node and cannot be shipped by Intune.
  const OMA_TYPE = { Exe: "EXE", Msi: "MSI", Script: "Script", Dll: "DLL", Appx: "StoreApps" };
  const SCAN_SCHEMA_PREFIX = "tuno.applocker.scan/";

  const newGuid = () => ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

  // ================================================================
  // PARSE — AppLocker policy XML → model
  // ================================================================
  function parsePolicy(xmlText, sourceName) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("Not valid XML: " + doc.querySelector("parsererror").textContent.split("\n")[0]);
    const root = doc.querySelector("AppLockerPolicy");
    if (!root) throw new Error("No <AppLockerPolicy> root element — is this an AppLocker export? (GPO: Windows Settings → Security Settings → Application Control Policies → export; or Get-AppLockerPolicy -Effective -Xml)");
    const model = { sourceName: sourceName || "", collections: [] };
    root.querySelectorAll(":scope > RuleCollection").forEach((rc) => {
      const col = {
        type: rc.getAttribute("Type") || "(unknown)",
        mode: rc.getAttribute("EnforcementMode") || "NotConfigured",
        rules: [],
      };
      rc.querySelectorAll(":scope > FilePathRule, :scope > FilePublisherRule, :scope > FileHashRule").forEach((r) => {
        col.rules.push(parseRule(r));
      });
      model.collections.push(col);
    });
    return model;
  }

  function parseRule(r) {
    const rule = {
      nodeName: r.nodeName,                              // FilePathRule | FilePublisherRule | FileHashRule
      id: r.getAttribute("Id") || newGuid(),
      name: r.getAttribute("Name") || "(unnamed)",
      description: r.getAttribute("Description") || "",
      sid: r.getAttribute("UserOrGroupSid") || "",
      action: r.getAttribute("Action") || "Allow",
      conditions: [],
      exceptions: [],
    };
    const readCond = (c) => {
      if (c.nodeName === "FilePathCondition") return { kind: "path", path: c.getAttribute("Path") || "" };
      if (c.nodeName === "FilePublisherCondition") {
        const vr = c.querySelector("BinaryVersionRange");
        return {
          kind: "publisher",
          publisher: c.getAttribute("PublisherName") || "*",
          product: c.getAttribute("ProductName") || "*",
          binary: c.getAttribute("BinaryName") || "*",
          low: vr ? (vr.getAttribute("LowSection") || "*") : "*",
          high: vr ? (vr.getAttribute("HighSection") || "*") : "*",
        };
      }
      if (c.nodeName === "FileHashCondition") {
        return {
          kind: "hash",
          hashes: [...c.querySelectorAll("FileHash")].map((h) => ({
            type: h.getAttribute("Type") || "SHA256",
            data: h.getAttribute("Data") || "",
            file: h.getAttribute("SourceFileName") || "",
            length: h.getAttribute("SourceFileLength") || "",
          })),
        };
      }
      return null;
    };
    const conds = r.querySelector(":scope > Conditions");
    if (conds) [...conds.children].forEach((c) => { const p = readCond(c); if (p) rule.conditions.push(p); });
    const exc = r.querySelector(":scope > Exceptions");
    if (exc) [...exc.children].forEach((c) => { const p = readCond(c); if (p) rule.exceptions.push(p); });
    return rule;
  }

  // ================================================================
  // SERIALIZE — model → AppLocker policy XML
  // ================================================================
  function condXml(c) {
    if (c.kind === "path") return `<FilePathCondition Path="${esc(c.path)}"/>`;
    if (c.kind === "publisher") {
      return `<FilePublisherCondition PublisherName="${esc(c.publisher)}" ProductName="${esc(c.product)}" BinaryName="${esc(c.binary)}">` +
        `<BinaryVersionRange LowSection="${esc(c.low || "*")}" HighSection="${esc(c.high || "*")}"/></FilePublisherCondition>`;
    }
    if (c.kind === "hash") {
      return `<FileHashCondition>` + c.hashes.map((h) =>
        `<FileHash Type="${esc(h.type)}" Data="${esc(h.data)}" SourceFileName="${esc(h.file)}" SourceFileLength="${esc(h.length)}"/>`).join("") +
        `</FileHashCondition>`;
    }
    return "";
  }
  // ONE serialiser, three consumers: the live XML panel, the XML download, and the
  // OMA-URI values inside the Intune profile. The Intune export needs a single
  // <RuleCollection> at a possibly different enforcement mode, so the collection is
  // what is factored out — not copied. A second serialiser is how an export starts
  // disagreeing with the preview that was supposed to describe it.
  function collectionLines(col, pad, modeOverride) {
    const mode = modeOverride || col.mode;
    const out = [`${pad}<RuleCollection Type="${esc(col.type)}" EnforcementMode="${esc(mode)}">`];
    for (const r of col.rules) {
      out.push(`${pad}  <${r.nodeName} Id="${esc(r.id)}" Name="${esc(r.name)}" Description="${esc(r.description)}" UserOrGroupSid="${esc(r.sid)}" Action="${esc(r.action)}">`);
      out.push(`${pad}    <Conditions>${r.conditions.map(condXml).join("")}</Conditions>`);
      if (r.exceptions.length) out.push(`${pad}    <Exceptions>${r.exceptions.map(condXml).join("")}</Exceptions>`);
      out.push(`${pad}  </${r.nodeName}>`);
    }
    out.push(`${pad}</RuleCollection>`);
    return out;
  }
  function exportXml() {
    const lines = ['<AppLockerPolicy Version="1">'];
    for (const col of policy.collections) lines.push(...collectionLines(col, "  "));
    lines.push("</AppLockerPolicy>");
    return lines.join("\n");
  }

  // ================================================================
  // INTUNE — model → windows10CustomConfiguration
  //
  // AppLocker has no settings-catalog surface. The supported route is a custom
  // profile carrying one OMA-URI string per rule collection:
  //   ./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/<grouping>/<TYPE>/Policy
  //
  // The grouping is the policy's IDENTITY on the device: two profiles sharing a
  // grouping overwrite each other, two with different groupings are merged by the
  // CSP. That is the single most expensive thing to get wrong here, so the UI asks
  // for it rather than inventing one.
  //
  // DLL is forced to NotConfigured whatever the chosen mode. AppLocker evaluates
  // every DLL load: Enabled cripples the endpoint and even AuditOnly buries the
  // event log under Microsoft-signed System32 libraries, EDR AMSI providers and
  // .NET native images. The rules still ship — documented and inert — so the
  // collection can be switched on deliberately later instead of being invisible.
  // ================================================================
  const intuneGrouping = () => (intuneCfg.grouping || "").replace(/\s+/g, "");

  function intuneProfileName(mode) {
    const base = (intuneCfg.displayName || "AppLocker").trim();
    return `${base} (${mode === "Enforce" ? "Enforced" : "AuditOnly"})`;
  }

  function intuneProfile(mode) {
    const grouping = intuneGrouping();
    const target = mode === "Enforce" ? "Enabled" : "AuditOnly";
    const omaSettings = [];
    for (const col of policy.collections) {
      const omaType = OMA_TYPE[col.type];
      if (!omaType) continue;
      const collectionMode = col.type === "Dll" ? "NotConfigured" : target;
      omaSettings.push({
        "@odata.type": "#microsoft.graph.omaSettingString",
        displayName: omaType,
        description: `${col.type} rule collection — EnforcementMode ${collectionMode}`,
        omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/${grouping}/${omaType}/Policy`,
        value: collectionLines(col, "", collectionMode).join("\n"),
      });
    }
    return {
      "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
      displayName: intuneProfileName(mode),
      description: `AppLocker ${mode} policy built in ${BRANDING.name} ${APP_BUILD.label}${importedXmlName ? ` from ${importedXmlName}` : ""} on ${new Date().toISOString().slice(0, 10)}.`,
      omaSettings,
    };
  }
  const intuneJson = (mode) => JSON.stringify(intuneProfile(mode), null, 2);

  // Problems that would make the profile fail on import or land wrong on the
  // device. Shown next to the export rather than discovered in the portal.
  function intuneIssues() {
    const out = [];
    if (!policy) return out;
    if (!intuneGrouping()) out.push({ sev: "High", text: "The grouping is empty. The OMA-URI has no identity without it and the profile will not apply." });
    else if (!/^[A-Za-z0-9._-]+$/.test(intuneGrouping())) out.push({ sev: "Medium", text: "The grouping contains characters other than letters, digits, dot, dash and underscore. The CSP node name is part of a URI — keep it simple." });
    if (!(intuneCfg.displayName || "").trim()) out.push({ sev: "Medium", text: "The profile has no display name. Intune will accept it and nobody will ever find it again." });
    const unmapped = policy.collections.filter((c) => !OMA_TYPE[c.type]);
    if (unmapped.length) out.push({ sev: "Medium", text: `Collection${unmapped.length === 1 ? "" : "s"} ${unmapped.map((c) => c.type).join(", ")} ${unmapped.length === 1 ? "has" : "have"} no AppLocker CSP node and ${unmapped.length === 1 ? "is" : "are"} left out of the profile.` });
    const empty = policy.collections.filter((c) => OMA_TYPE[c.type] && c.type !== "Dll" && !c.rules.length);
    if (empty.length) out.push({ sev: "High", text: `Collection${empty.length === 1 ? "" : "s"} ${empty.map((c) => c.type).join(", ")} ship with ZERO rules. Enforced, that blocks the type outright on every device the profile reaches.` });
    return out;
  }

  // ================================================================
  // SCAN BUNDLE — Invoke-TunoAppLockerScan.ps1 output
  // ================================================================
  function parseBundle(jsonText, sourceName) {
    let b;
    try { b = JSON.parse(jsonText); }
    catch (e) { throw new Error("Not valid JSON: " + e.message); }
    if (!b || typeof b !== "object" || typeof b.schema !== "string" || !b.schema.startsWith(SCAN_SCHEMA_PREFIX)) {
      throw new Error("This JSON is not a TUNO scan bundle (no \"schema\": \"" + SCAN_SCHEMA_PREFIX + "1\" property). Run Invoke-TunoAppLockerScan.ps1 on the device and upload the file it writes.");
    }
    // Normalise the shapes the tool reads, so a bundle from a partial run (no
    // rule generation, no events, unreadable effective policy) renders as
    // "not collected" rather than throwing somewhere three sections down.
    b.writablePaths = Array.isArray(b.writablePaths) ? b.writablePaths : [];
    b.artifacts = Array.isArray(b.artifacts) ? b.artifacts : [];
    b.warnings = Array.isArray(b.warnings) ? b.warnings : [];
    b.sourceName = sourceName || "";
    return b;
  }

  // Which policy does a bundle hand the tool? The generated AUDIT policy when the
  // scan built one — audit first is the whole discipline — otherwise whatever the
  // device was actually running. Either can be swapped for the other afterwards.
  function bundleXml(b, which) {
    const gen = b.generatedPolicy;
    if (which === "generated-enforce" && gen && gen.enforceXml) return { xml: gen.enforceXml, source: "generated-enforce" };
    if (which === "effective" && b.effectivePolicy && b.effectivePolicy.xml) return { xml: b.effectivePolicy.xml, source: "effective" };
    if (which === "generated-audit" && gen && gen.auditXml) return { xml: gen.auditXml, source: "generated-audit" };
    if (gen && gen.auditXml) return { xml: gen.auditXml, source: "generated-audit" };
    if (b.effectivePolicy && b.effectivePolicy.xml) return { xml: b.effectivePolicy.xml, source: "effective" };
    return null;
  }
  const SCAN_SOURCE_LABEL = {
    "generated-audit": "the rule set the scan generated, in AuditOnly",
    "generated-enforce": "the rule set the scan generated, Enforced",
    "effective": "the policy the device was actually running",
  };

  // ---- scan-derived findings ----
  //
  // The XML alone cannot know that %PROGRAMFILES%\Vendor is world-writable; the
  // scan can, and that is the entire reason to upload it. Every verdict below is
  // reached with the SAME rule-evaluation used for the Microsoft coverage table —
  // deny beats allow, exceptions carve back out, macros expand — by probing a
  // hypothetical executable dropped into the directory. A second evaluator here
  // would be free to disagree with the one on screen.
  function evaluateProbePath(model, dirPath, collectionType) {
    const col = model.collections.find((c) => c.type === collectionType);
    if (!col || col.mode === "NotConfigured") return null;
    const art = { path: dirPath.replace(/\\+$/, "") + "\\tuno-probe.exe", publisher: { name: "", product: "*", binary: "*" } };
    for (const r of col.rules) {
      if (r.action !== "Allow" || isAdminSid(r.sid) || !isBroadSid(r.sid)) continue;
      if (ruleMatchesArtifact(r, art)) {
        // A deny for the same broad audience wins, exactly as on the endpoint.
        const denied = col.rules.some((d) => d.action === "Deny" && principalCovers(d.sid, r.sid) && ruleMatchesArtifact(d, art));
        if (!denied) return r;
      }
    }
    return null;
  }

  function analyzeScan(b, model) {
    const out = [];
    if (!b) return out;

    // 1. Writable directories that an allow rule still reaches.
    const reachable = [];
    for (const w of b.writablePaths) {
      const p = w.normalized || w.path;
      if (!p) continue;
      const rule = evaluateProbePath(model, p, "Exe");
      if (rule) reachable.push({ path: p, rule, grantees: w.grantees || [] });
    }
    for (const hit of reachable.slice(0, 40)) {
      const who = hit.grantees.map((g) => g.name || g.sid).filter(Boolean).slice(0, 3).join(", ");
      out.push({
        sev: "High", source: "scan", collection: "Exe", ruleType: "(scan)",
        rule: hit.rule.name, ruleId: hit.rule.id, principal: sidName(hit.rule.sid),
        cond: hit.path,
        reason: `The device scan found this directory is writable by ${who || "a non-administrative principal"}, and “${hit.rule.name}” allows execution from it for ${sidName(hit.rule.sid)}. A standard user can drop an executable here and run it.`,
        rec: "Add this path as an exception on that rule, or fix the ACL on the directory. The scan already emits the exception list — the generated policy in the bundle has it applied.",
        fix: { kind: "rule" },
      });
    }
    if (reachable.length > 40) {
      out.push({
        sev: "High", source: "scan", collection: "Exe", ruleType: "(scan)",
        cond: `${reachable.length - 40} further path(s)`,
        reason: `${reachable.length} writable directories are reachable through an allow rule in total; the first 40 are listed individually above.`,
        rec: "Use the generated policy from the bundle, which carries the full exception list, rather than patching them one at a time.",
      });
    }

    // 2. Unsigned executables sitting in those directories.
    const unsigned = b.artifacts.filter((a) => a && !a.signed);
    if (unsigned.length) {
      out.push({
        sev: "Medium", source: "scan", collection: "Exe", ruleType: "(scan)",
        cond: unsigned.slice(0, 4).map((a) => a.name).join(", ") + (unsigned.length > 4 ? `, +${unsigned.length - 4} more` : ""),
        reason: `${unsigned.length} unsigned executable(s) were found in user-writable locations. Nothing but a hash rule can allow them, and a hash rule stops working the moment the file is updated.`,
        rec: "Press the vendor to sign, relocate the application into a protected directory, or accept the hash rules and put their expiry on someone's calendar.",
      });
    }

    // 3. What the run could not see. Stated, not implied.
    if (b.machine && b.machine.elevated === false) {
      out.push({
        sev: "Medium", source: "scan", collection: "(scan)", ruleType: "(scan)",
        reason: "The scan did not run elevated, so directory ACLs and event logs were read incompletely. Absence of a finding below is not evidence of absence.",
        rec: "Re-run Invoke-TunoAppLockerScan.ps1 from an elevated PowerShell session.",
      });
    }
    if (b.machine && b.machine.appLockerCmdlets === false) {
      out.push({
        sev: "Low", source: "scan", collection: "(scan)", ruleType: "(scan)",
        reason: "The AppLocker module was not available on the scanned device, so publisher names were derived from certificate subjects rather than read from Get-AppLockerFileInformation.",
        rec: "Verify the publisher strings on the generated rules before enforcing. The artifact table marks which source produced each one.",
      });
    }

    // 4. What the endpoint has already refused.
    const ev = b.events;
    if (ev && ev.available && ev.summary && (ev.summary.blocked || ev.summary.audited)) {
      out.push({
        sev: ev.summary.blocked ? "High" : "Info", source: "scan", collection: "(scan)", ruleType: "(scan)",
        cond: `${ev.summary.blocked} blocked · ${ev.summary.audited} audited · ${ev.daysBack} days`,
        reason: `The device's AppLocker logs show ${ev.summary.blocked} execution(s) actually blocked and ${ev.summary.audited} that would have been blocked under enforcement, across ${ev.summary.distinctUsers} user(s).`,
        rec: ev.summary.blocked
          ? "Work through the blocked list below before touching enforcement anywhere else — these are real users who could not run something."
          : "Review the audited list below: each one becomes a blocked user the day this policy is enforced.",
      });
    }
    return out;
  }

  // ================================================================
  // AUDIT — the AppLockerInspector check set (XML-static subset)
  // ================================================================
  const PATH_RISKS = [
    { re: /^\*$|^\*\\|^[A-Z]:\\\*$|^%OSDRIVE%\\\*$/i, reason: "Wildcard or drive root", sev: "High" },
    { re: /^\\\\/, reason: "UNC/network path allowed", sev: "High" },
    { re: /\\Windows\\Temp(\\|$)|(^|\\)Temp(\\|$)/i, reason: "Temp folders are user-writable", sev: "High" },
    { re: /\\Users(\\|$)|%USERPROFILE%|%LOCALAPPDATA%|%APPDATA%|%HOMEPATH%|%TMP%|%TEMP%/i, reason: "User profile/AppData is writable", sev: "High" },
    { re: /\\(Downloads|Desktop|Documents)(\\|$)/i, reason: "Common user-writable folders", sev: "High" },
    { re: /\\Public(\\|$)/i, reason: "Public folders are shared/writable", sev: "Medium" },
    { re: /\\ProgramData(\\|$)/i, reason: "ProgramData often has writable subfolders", sev: "Medium" },
  ];

  const isProtectedPath = (p) => {
    const x = expandOne(p);
    if (/^[a-z]:\\windows\\temp(\\|$)/i.test(x)) return false;
    return /^[a-z]:\\program files( \(x86\))?\\/i.test(x) || /^[a-z]:\\windows(\\|$)/i.test(x);
  };

  // "C:\dir\*" with no other wildcard — a plain folder allow, not flagged
  function isSimpleDirWildcard(p) {
    const t = String(p || "").trim();
    if (!/\\\*$/.test(t) || /\?/.test(t)) return false;
    if (/^\*$|^\*\\|^[A-Z]:\\\*$|^%OSDRIVE%\\\*$/i.test(t)) return false;
    const prefix = t.slice(0, -2);
    return /^[A-Za-z]:\\.+$/.test(prefix) || /^%[^%]+%(\\.+)?$/.test(prefix) || /^\\\\[^\\]+\\[^\\]+(\\.+)?$/.test(prefix);
  }
  function wildcardAssessment(p) {
    if (!p || !/[*?]/.test(p)) return null;
    if (isSimpleDirWildcard(p)) return null;
    const m = /\*\.[a-z0-9]{2,4}|\*\.\*/i.exec(p);
    if (m) return { reason: `Wildcard extension pattern (${m[0]})`, sev: "Medium" };
    if (/\?/.test(p)) return { reason: "Single-character wildcard in path", sev: "Medium" };
    if (/(^|\\)[^\\]*\*[^\\]*($|\\)/.test(p)) return { reason: "Wildcard embedded inside a path component", sev: "Medium" };
    return null;
  }

  // ---- deny shadowing: an Allow fully covered by a Deny in the same
  // collection for a covering principal produces no findings ----
  const normPath = (p) => expandOne(p).trim().replace(/\\+$/, "").toLowerCase();
  function principalCovers(shadowSid, targetSid) {
    if (!shadowSid || !targetSid) return false;
    if (shadowSid === targetSid) return true;
    return shadowSid === "S-1-1-0"; // Everyone covers all
  }
  function pathCovers(shadowPath, targetPath) {
    const s = normPath(shadowPath), t = normPath(targetPath);
    if (!s || !t) return false;
    if (s === t) return true;
    if (isSimpleDirWildcard(shadowPath)) {
      const base = s.slice(0, -2).replace(/\\+$/, "");
      return t === base || t.startsWith(base + "\\");
    }
    return s === "*";
  }
  function publisherCovers(sc, tc) {
    if ((sc.publisher !== "*" && sc.publisher !== tc.publisher)) return false;
    if ((sc.product !== "*" && sc.product !== tc.product)) return false;
    if ((sc.binary !== "*" && sc.binary !== tc.binary)) return false;
    const loose = (v) => !v || v === "*";
    return (loose(sc.low) || sc.low === tc.low) && (loose(sc.high) || sc.high === tc.high);
  }
  function shadowedByDeny(rule, rules) {
    const rc = rule.conditions[0];
    if (!rc) return null;
    for (const cand of rules) {
      if (cand === rule || cand.action !== "Deny") continue;
      if (!principalCovers(cand.sid, rule.sid)) continue;
      const cc = cand.conditions[0];
      if (!cc || cc.kind !== rc.kind) continue;
      let covers = false;
      if (rc.kind === "path") covers = pathCovers(cc.path, rc.path);
      else if (rc.kind === "publisher") covers = publisherCovers(cc, rc);
      else if (rc.kind === "hash") covers = JSON.stringify(cc.hashes) === JSON.stringify(rc.hashes);
      if (covers) return cand;
    }
    return null;
  }

  function analyze(model) {
    const out = [];
    const F = (sev, p) => out.push(Object.assign({ sev }, p));
    const present = new Set(model.collections.map((c) => c.type));
    for (const t of COLLECTIONS) {
      if (!present.has(t)) F("Info", { collection: t, ruleType: "(collection)", reason: `Collection '${t}' is not present in this XML — on the endpoint that means NotConfigured (default-allow for this type) unless another policy layer carries it.`, rec: `If ${t} should be governed, add the collection with its default rules and set enforcement.`, fix: { kind: "addCollection", type: t } });
    }
    for (const col of model.collections) {
      if (col.mode === "NotConfigured") F("High", { collection: col.type, ruleType: "(collection)", reason: `Collection '${col.type}' is NotConfigured → default-allow for this type.`, rec: `Set EnforcementMode='Enabled' for '${col.type}' (or 'AuditOnly' during pilot).`, fix: { kind: "mode", type: col.type } });
      else if (col.mode === "AuditOnly") F("High", { collection: col.type, ruleType: "(collection)", reason: `Collection '${col.type}' is AuditOnly (no blocking).`, rec: `Switch '${col.type}' to 'Enabled'.` + (col.type === "Script" ? " Note: Script in AuditOnly will not enforce Constrained Language Mode." : ""), fix: { kind: "mode", type: col.type } });
      if (col.mode !== "NotConfigured" && !col.rules.length)
        F("Medium", { collection: col.type, ruleType: "(collection)", reason: `Collection '${col.type}' is ${col.mode} with ZERO rules — everything of this type is blocked (or would be, in audit).`, rec: `Add the default rules before enforcing, or this collection bricks the type entirely.`, fix: { kind: "defaults", type: col.type } });

      for (const r of col.rules) {
        const base = { collection: col.type, ruleType: r.nodeName, action: r.action, principal: sidName(r.sid), rule: r.name, ruleId: r.id };
        const broad = isBroadSid(r.sid), admin = isAdminSid(r.sid);
        const c = r.conditions[0];
        if (!c) continue;
        if (r.action === "Allow" && shadowedByDeny(r, col.rules)) continue;

        if (c.kind === "path") {
          const reasons = [], recs = []; let score = -1;
          const cond = c.path;
          if (r.action === "Allow") {
            for (const k of PATH_RISKS) {
              if (k.re.test(cond)) {
                let sev = k.sev;
                if (broad && !admin && sev === "Medium") sev = "High";
                reasons.push(k.reason);
                recs.push("Replace broad path Allow with Publisher or Hash rules limited to required binaries.", "Avoid allowing user-writable paths for non-admin principals.");
                score = Math.max(score, SEV_SCORE[sev]);
                break;
              }
            }
            if (/^[A-Z]:\\$|^%OSDRIVE%\\\*$/i.test(cond)) { reasons.push("Root of OS drive allowed"); recs.push("Never allow entire drives; scope to trusted directories only."); score = Math.max(score, SEV_SCORE.High); }
            const wa = wildcardAssessment(cond);
            if (wa) { reasons.push(wa.reason); recs.push("Use specific file paths or Publisher rules instead of risky wildcard patterns."); score = Math.max(score, SEV_SCORE[wa.sev]); }
            if (/^\\\\/.test(cond)) recs.push("Share and NTFS ACLs on the UNC target cannot be verified in the browser — run Invoke-AppLockerInspector.ps1 -TestSharePermissions on a domain host.");
            if (broad && !admin && (reasons.length)) { reasons.push("Principal is broad (Everyone/Authenticated Users/Users)"); recs.push("Restrict the principal to a minimal, purpose-built group."); score = Math.max(score, SEV_SCORE.Medium); }
            if (r.exceptions.length && score > 0) score -= 1;
          }
          if (reasons.length) {
            // Protected-location downgrade — same rule as the PowerShell when
            // NTFS rights are unknown: a broad allow on a non-wildcard path
            // under Program Files / Windows (minus Windows\Temp) reads Info.
            if (r.action === "Allow" && broad && !admin && !/[*?]/.test(expandOne(cond)) && isProtectedPath(cond)) {
              F("Info", Object.assign({}, base, { condType: "Path", cond, reason: "Broad principal allowed, but target is in a protected location (NTFS not verifiable in the browser — confirm it is not writable by broad principals)", rec: "No change needed if the file remains locked down; consider Publisher/Hash rules for defense-in-depth." }));
            } else {
              const sev = SEV_ORDER.find((s) => SEV_SCORE[s] <= Math.max(score, 0)) || "Info";
              F(sev, Object.assign({}, base, { condType: "Path", cond, reason: reasons.join("; "), rec: [...new Set(recs)].join(" "), fix: { kind: "rule" } }));
            }
          }
        } else if (c.kind === "publisher") {
          const reasons = [], recs = []; let score = -1;
          const cond = `Publisher='${c.publisher}'; Product='${c.product}'; Binary='${c.binary}'; VersionRange=[${c.low},${c.high}]`;
          if (r.action === "Allow") {
            if (!c.publisher || c.publisher === "*") { reasons.push("Any publisher allowed"); recs.push("Specify the exact trusted publisher (e.g. O=Vendor, C=…)."); score = Math.max(score, SEV_SCORE.High); }
            if (c.product === "*" && c.binary === "*") { reasons.push("Any product and any binary from the publisher are allowed"); recs.push("Constrain to specific Product and/or Binary where feasible."); score = Math.max(score, SEV_SCORE.Medium); }
            if (!c.high || c.high === "*") { reasons.push("No upper version bound"); recs.push("Specify an upper version bound or update allow rules as versions are vetted."); score = Math.max(score, SEV_SCORE.Medium); }
            if (broad && !admin) { reasons.push("Principal is broad (Everyone/Authenticated Users/Users)"); recs.push("Restrict the principal to a minimal, purpose-built group."); score = Math.max(score, SEV_SCORE.Medium); }
            if (r.exceptions.length && score > 0) score -= 1;
          }
          if (score >= 0 && reasons.length) {
            const sev = SEV_ORDER.find((s) => SEV_SCORE[s] <= score) || "Info";
            F(sev, Object.assign({}, base, { condType: "Publisher", cond, reason: reasons.join("; "), rec: [...new Set(recs)].join(" "), fix: { kind: "rule" } }));
          }
        } else if (c.kind === "hash") {
          const cond = "Hashes: " + (c.hashes.map((h) => h.file).filter(Boolean).join("; ") || "<no-hash-names>");
          if (r.action === "Allow" && broad && !admin) {
            F("Low", Object.assign({}, base, { condType: "Hash", cond, reason: "Allow-by-hash is tight, but principal is overly broad", rec: "Assign allow-by-hash to a narrower group where feasible.", fix: { kind: "rule" } }));
          }
        }
      }
    }
    out.sort((a, b) => SEV_SCORE[b.sev] - SEV_SCORE[a.sev] || String(a.collection).localeCompare(String(b.collection)));
    return out;
  }

  // ================================================================
  // EVALUATION — would this artifact run for a standard user?
  // ================================================================
  // Expand AppLocker path macros to one canonical lower-case form. AppLocker's
  // %PROGRAMFILES% matches BOTH Program Files trees, so expansion returns a
  // list of variants and matching tests the cross product.
  function expandVariants(p) {
    let s = String(p || "");
    const subs = [
      [/%SYSTEM32%/gi, ["c:\\windows\\system32"]],
      [/%WINDIR%/gi, ["c:\\windows"]],
      [/%PROGRAMFILES%/gi, ["c:\\program files", "c:\\program files (x86)"]],
      [/%OSDRIVE%/gi, ["c:"]],
    ];
    let variants = [s];
    for (const [re, reps] of subs) {
      const next = [];
      for (const v of variants) {
        if (re.test(v)) { re.lastIndex = 0; for (const rep of reps) next.push(v.replace(re, rep)); }
        else next.push(v);
      }
      variants = next;
    }
    return variants.map((v) => v.toLowerCase());
  }
  const expandOne = (p) => expandVariants(p)[0] || "";

  // pattern (may hold * and ?) → RegExp over a concrete path
  function patternToRegex(pat) {
    // The backslash MUST be in the escape class: "c:\program files" left
    // unescaped reads \p as a literal p and silently matches nothing.
    let x = pat.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    x = x.replace(/\*/g, "[^\u0000]*").replace(/\?/g, ".");
    return new RegExp("^" + x + "$", "i");
  }
  // An artifact path may itself carry * (Users\*, versioned folders):
  // instantiate ONE concrete example of it for matching.
  const concretize = (p) => p.replace(/\*/g, "exampleuser");

  function pathRuleMatches(rulePath, artifactPath) {
    let pats = expandVariants(rulePath);
    const targets = expandVariants(artifactPath).map(concretize);
    // trailing "\" means the folder and everything below; "dir\*" likewise
    pats = pats.map((p) => (/\\$/.test(p) ? p + "*" : p));
    for (const pat of pats) {
      const re = patternToRegex(pat);
      if (targets.some((t) => re.test(t))) return true;
    }
    return false;
  }
  function publisherRuleMatches(c, pub) {
    const eq = (a, b) => String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
    if (c.publisher !== "*" && !eq(c.publisher, pub.name)) return false;
    if (c.product !== "*" && !(pub.product === "*" || eq(c.product, pub.product))) return false;
    if (c.binary !== "*" && !(pub.binary === "*" || eq(c.binary, pub.binary))) return false;
    return true;
  }
  function ruleMatchesArtifact(r, art) {
    for (const c of r.conditions) {
      let hit = false;
      if (c.kind === "path") hit = pathRuleMatches(c.path, art.path);
      else if (c.kind === "publisher") hit = publisherRuleMatches(c, art.publisher || { name: "", product: "", binary: "" });
      // hash conditions cannot match a catalog artifact — no hash to compare
      if (!hit) continue;
      // exceptions carve the match back out
      const excepted = r.exceptions.some((e) => {
        if (e.kind === "path") return pathRuleMatches(e.path, art.path);
        if (e.kind === "publisher") return publisherRuleMatches(e, art.publisher || {});
        return false;
      });
      if (!excepted) return c;
    }
    return null;
  }

  function evaluateApp(model, app) {
    const col = model.collections.find((c) => c.type === app.collection);
    if (!col || col.mode === "NotConfigured") {
      return { status: "unenforced", detail: `The ${app.collection} collection is ${col ? "NotConfigured" : "absent"} — nothing of this type is restricted, so the app runs by default. The audit flags that separately.` };
    }
    const audit = col.mode === "AuditOnly";
    const perArt = app.artifacts.map((art) => {
      // The question is "would a STANDARD USER run it" — rules scoped to
      // BUILTIN\Administrators (the default All-files rule above all) do not
      // apply to a standard user and are set aside, noted only when they are
      // the sole thing that would have allowed the app.
      let denyBroad = null, denyCustom = null, allowBroad = null, allowCustom = null, allowAdmin = null;
      for (const r of col.rules) {
        const m = ruleMatchesArtifact(r, art);
        if (!m) continue;
        if (isAdminSid(r.sid)) { if (r.action === "Allow") allowAdmin = allowAdmin || r; continue; }
        const broad = isBroadSid(r.sid);
        if (r.action === "Deny") { if (broad) denyBroad = denyBroad || r; else denyCustom = denyCustom || r; }
        else { if (broad) allowBroad = allowBroad || { r, cond: m }; else allowCustom = allowCustom || { r, cond: m }; }
      }
      if (denyBroad) return { art, status: "blocked", why: `deny rule “${denyBroad.name}” (${sidName(denyBroad.sid)})` };
      if (allowBroad) {
        const versionBound = allowBroad.cond.kind === "publisher" && allowBroad.cond.high && allowBroad.cond.high !== "*";
        return { art, status: "allowed", rule: allowBroad.r, versionBound, denyCustom };
      }
      if (allowCustom) return { art, status: "conditional", rule: allowCustom.r, why: `only via “${allowCustom.r.name}”, scoped to ${sidName(allowCustom.r.sid)} — allowed only for members of that group` };
      return { art, status: "blocked", why: "no allow rule matches for a standard user — implicitly blocked" + (allowAdmin ? ` (“${allowAdmin.name}” allows it for Administrators only)` : "") };
    });
    const worst = perArt.find((a) => a.status === "blocked") ? "blocked"
      : perArt.find((a) => a.status === "conditional") ? "conditional" : "allowed";
    return { status: worst, audit, perArt };
  }

  function riskyRuleIds() {
    const ids = new Set();
    for (const f of findings) {
      if (f.sev === "High" || f.sev === "Medium") {
        // Findings carry the rule id since the fix work — match on it, and fall
        // back to the name only for findings that predate an id (none today).
        if (f.ruleId) { ids.add(f.ruleId); continue; }
        for (const col of policy.collections) for (const r of col.rules) if (r.name === f.rule && col.type === f.collection) ids.add(r.id);
      }
    }
    return ids;
  }

  // ================================================================
  // BUILDER
  // ================================================================
  function ensureCollection(type) {
    let col = policy.collections.find((c) => c.type === type);
    if (!col) { col = { type, mode: "NotConfigured", rules: [] }; policy.collections.push(col); }
    return col;
  }
  function mkRule(nodeName, name, sid, action, conditions, description) {
    return { nodeName, id: newGuid(), name, description: description || `Added by ${BRANDING.name} ${APP_BUILD.label}`, sid, action, conditions, exceptions: [] };
  }
  const DEFAULT_RULES = {
    Exe: [
      ["(Default Rule) All files located in the Program Files folder", "S-1-1-0", { kind: "path", path: "%PROGRAMFILES%\\*" }],
      ["(Default Rule) All files located in the Windows folder", "S-1-1-0", { kind: "path", path: "%WINDIR%\\*" }],
      ["(Default Rule) All files", "S-1-5-32-544", { kind: "path", path: "*" }],
    ],
    Msi: [
      ["(Default Rule) All digitally signed Windows Installer files", "S-1-1-0", { kind: "publisher", publisher: "*", product: "*", binary: "*", low: "*", high: "*" }],
      ["(Default Rule) All Windows Installer files in %systemdrive%\\Windows\\Installer", "S-1-1-0", { kind: "path", path: "%WINDIR%\\Installer\\*" }],
      ["(Default Rule) All Windows Installer files", "S-1-5-32-544", { kind: "path", path: "*.*" }],
    ],
    Script: [
      ["(Default Rule) All scripts located in the Program Files folder", "S-1-1-0", { kind: "path", path: "%PROGRAMFILES%\\*" }],
      ["(Default Rule) All scripts located in the Windows folder", "S-1-1-0", { kind: "path", path: "%WINDIR%\\*" }],
      ["(Default Rule) All scripts", "S-1-5-32-544", { kind: "path", path: "*" }],
    ],
    Dll: [
      ["(Default Rule) All DLLs located in the Program Files folder", "S-1-1-0", { kind: "path", path: "%PROGRAMFILES%\\*" }],
      ["(Default Rule) Microsoft Windows DLLs", "S-1-1-0", { kind: "path", path: "%WINDIR%\\*" }],
      ["(Default Rule) All DLLs", "S-1-5-32-544", { kind: "path", path: "*" }],
    ],
    Appx: [
      ["(Default Rule) All signed packaged apps", "S-1-1-0", { kind: "publisher", publisher: "*", product: "*", binary: "*", low: "0.0.0.0", high: "*" }],
    ],
  };
  function addDefaultRules(type) {
    const col = ensureCollection(type);
    let added = 0;
    for (const [name, sid, cond] of (DEFAULT_RULES[type] || [])) {
      if (col.rules.some((r) => r.name === name)) continue;
      col.rules.push(mkRule(cond.kind === "publisher" ? "FilePublisherRule" : "FilePathRule", name, sid, "Allow", [Object.assign({}, cond)], "Microsoft default rule"));
      added++;
    }
    return added;
  }
  function addFixForApp(app) {
    const col = ensureCollection(app.collection);
    const art = app.artifacts[0];
    if (app.fix.kind === "publisher" && art.publisher) {
      const p = art.publisher;
      const name = `${BRANDING.name}: allow ${app.name}`;
      if (col.rules.some((r) => r.name === name)) return false;
      col.rules.push(mkRule("FilePublisherRule", name, "S-1-1-0", "Allow",
        [{ kind: "publisher", publisher: p.name, product: p.product, binary: "*", low: "*", high: "*" }],
        `${app.name} — publisher allow added from the ${BRANDING.name} Microsoft coverage check. ${app.fix.note}`));
      return true;
    }
    const name = `${BRANDING.name}: allow ${app.name} (path)`;
    if (col.rules.some((r) => r.name === name)) return false;
    col.rules.push(mkRule("FilePathRule", name, "S-1-1-0", "Allow", [{ kind: "path", path: art.path }], app.fix.note));
    return true;
  }

  // ================================================================
  // FIX — turn a finding's recommendation into an action
  //
  // Two kinds of recommendation, and the difference is the whole design:
  //
  //   MECHANICAL — "set EnforcementMode='Enabled'", "add the default rules",
  //     "add the collection". The policy already contains everything needed,
  //     so the button applies it in one click.
  //
  //   JUDGEMENT — "replace this path Allow with a Publisher rule", "specify
  //     the exact trusted publisher", "specify an upper version bound",
  //     "restrict the principal to a purpose-built group". The tool CANNOT
  //     know the answer: no publisher is derivable from a path, no version is
  //     derivable from a wildcard, and the right group is a site decision.
  //     Inventing one would be the same sin as pretending the NTFS checks ran.
  //     So the button opens an editor prefilled from the offending rule and
  //     the admin supplies the missing fact.
  //
  // Every fix goes through mutate(), so every fix is one click from undone.
  // ================================================================
  const snapshot = () => JSON.parse(JSON.stringify(policy));

  // Run a policy mutation with an undo point. fn() returning false means
  // "nothing changed" — no undo point is burned and no re-render happens.
  function mutate(label, fn) {
    if (!policy) return false;
    const before = snapshot();
    if (fn() === false) return false;
    undoState = { snapshot: before, label };
    recompute();
    return true;
  }
  // A freshly loaded policy has nothing to undo back to, and any open editor
  // points at a rule from the policy that just went away.
  // A new policy means a new deploy panel — the collision check was run
  // against a name and grouping that may no longer be the ones on screen.
  //
  // WHAT SURVIVES: profiles already created in the tenant. They are facts,
  // not session state, and the whole walkthrough depends on remembering
  // them: create the audit profile, wait a month, upload the NEW scan, then
  // enforce. Wiping `created` on import meant the upload you were told to do
  // erased the evidence that step one had happened, and the Enforce gate
  // locked itself again asking for a profile that was already there.
  //
  // They are tagged with the name and grouping they were created under, and
  // only count as this policy's profile while those still match — otherwise
  // a "Created" line follows you onto an unrelated policy.
  function resetFixState() {
    undoState = null; fixOpen = null;
    deployState = Object.assign({}, deployState, {
      busy: "", checked: null, groups: null, picked: null, error: null, note: "",
    });
  }

  // The created profile belongs to what is on screen now, or it does not
  // count. Compared on the values the profile was actually created under.
  function createdFor(kind) {
    const c = deployState.created && deployState.created[kind];
    if (!c) return null;
    return (c._name === intuneProfileName(kind === "audit" ? "Audit" : "Enforce")
      && c._grouping === intuneGrouping()) ? c : null;
  }

  function undoLast() {
    if (!undoState) return;
    policy = undoState.snapshot;
    undoState = null;
    fixOpen = null;
    recompute();
  }

  // Stable across recompute() — findings are rebuilt on every mutation, so an
  // array index would point at a different finding by the time it is used.
  const findingKey = (f) => [f.collection, f.ruleId || f.ruleType, f.reason].join("¦");

  function findRuleFor(f) {
    const col = policy.collections.find((c) => c.type === f.collection);
    if (!col) return null;
    const rule = col.rules.find((r) => r.id === f.ruleId);
    return rule ? { col, rule } : null;
  }

  // What would the Fix button do for this finding? Returns null when the
  // finding has no actionable fix (the protected-location Info finding says
  // "no change needed" — it must not sprout a button that contradicts it).
  function planFix(f) {
    const fx = f.fix;
    if (!policy || !fx) return null;

    if (fx.kind === "addCollection") {
      return {
        mode: "auto", label: "Add collection",
        title: `Add the ${fx.type} collection with its default rules and set enforcement`,
        undoLabel: `added the ${fx.type} collection`,
        apply: () => {
          const col = ensureCollection(fx.type);
          addDefaultRules(fx.type);
          col.mode = col.rules.length ? "Enabled" : "AuditOnly";
        },
      };
    }

    if (fx.kind === "mode") {
      const col = policy.collections.find((c) => c.type === fx.type);
      if (!col) return null;
      // Enabling a collection that carries no rules blocks the type outright —
      // the audit says so itself two findings down. So a ruleless collection
      // gets the rules first, or AuditOnly, but never a straight Enable.
      if (!col.rules.length) {
        if (col.mode === "NotConfigured") return {
          mode: "auto", label: "Set AuditOnly",
          title: `'${fx.type}' has no rules — Enabled would block every ${fx.type}. AuditOnly starts the pilot without blocking; add rules, then enable.`,
          undoLabel: `set ${fx.type} to AuditOnly`,
          apply: () => { col.mode = "AuditOnly"; },
        };
        return {
          mode: "auto", label: "Add default rules first",
          title: `'${fx.type}' has no rules — enabling it now would block every ${fx.type}. Add the Microsoft default rules first.`,
          undoLabel: `added default rules to ${fx.type}`,
          apply: () => addDefaultRules(fx.type) > 0 ? undefined : false,
        };
      }
      return {
        mode: "auto", label: "Set Enabled",
        title: `Set EnforcementMode='Enabled' on '${fx.type}'`,
        undoLabel: `set ${fx.type} to Enabled`,
        apply: () => { col.mode = "Enabled"; },
      };
    }

    if (fx.kind === "defaults") {
      return {
        mode: "auto", label: "Add default rules",
        title: `Add the Microsoft default rules to '${fx.type}'`,
        undoLabel: `added default rules to ${fx.type}`,
        apply: () => addDefaultRules(fx.type) > 0 ? undefined : false,
      };
    }

    if (fx.kind === "rule") {
      const hit = findRuleFor(f);
      if (!hit) return null;   // rule already deleted or renamed out from under us
      return { mode: "editor", label: "Fix…", title: "Open this rule prefilled — the tool cannot guess the publisher, version or group for you", rule: hit.rule, col: hit.col };
    }
    return null;
  }

  // ---------- the prefilled editor ----------
  const SID_CHOICES = [
    ["S-1-1-0", "Everyone"],
    ["S-1-5-11", "Authenticated Users"],
    ["S-1-5-32-545", "BUILTIN\\Users"],
    ["S-1-5-32-544", "BUILTIN\\Administrators"],
  ];

  function fixEditorHtml(f, plan) {
    const r = plan.rule;
    const c = r.conditions[0] || {};
    const known = SID_CHOICES.some(([s]) => s === r.sid);
    const sidOpts = SID_CHOICES.map(([s, n]) => `<option value="${s}" ${r.sid === s ? "selected" : ""}>${esc(n)}</option>`).join("") +
      `<option value="__custom" ${known ? "" : "selected"}>Custom SID…</option>`;

    const approaches = c.kind === "path"
      ? [["path", "Tighten the path"], ["publisher", "Replace with a publisher rule"], ["delete", "Delete this rule"]]
      : c.kind === "publisher"
        ? [["publisher", "Constrain the publisher rule"], ["delete", "Delete this rule"]]
        : [["principal", "Narrow the principal only"], ["delete", "Delete this rule"]];

    const pub = c.kind === "publisher" ? c : { publisher: "", product: "*", binary: "*", low: "*", high: "*" };

    return `<div class="al-fixpanel" style="padding:12px 14px;border-left:3px solid var(--accent,#6b8afd)">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <b class="mini">Fix — ${esc(r.name)}</b>
        <span class="mini muted">${esc(sidName(r.sid))} · ${esc(c.kind || "")} · ${esc(r.action)}</span>
      </div>
      <p class="mini muted" style="margin:0 0 10px">${esc(f.rec)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select class="btn al-fx-approach">${approaches.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>
        <select class="btn al-fx-sid">${sidOpts}</select>
        <input class="btn al-fx-sidcustom" style="cursor:text;min-width:220px;${known ? "display:none" : ""}" placeholder="SID of the purpose-built group, e.g. S-1-5-21-…-1174" value="${known ? "" : esc(r.sid)}" spellcheck="false">
      </div>
      <div class="al-fx-pathrow" style="display:${c.kind === "path" ? "flex" : "none"};gap:8px;flex-wrap:wrap;margin-top:8px">
        <input class="btn al-fx-path" style="cursor:text;flex:1;min-width:300px" value="${esc(c.path || "")}" placeholder="Path" spellcheck="false">
      </div>
      <div class="al-fx-pubrow" style="display:${c.kind === "publisher" ? "flex" : "none"};gap:8px;flex-wrap:wrap;margin-top:8px">
        <input class="btn al-fx-pub" style="cursor:text;flex:2;min-width:300px" value="${esc(pub.publisher === "*" ? "" : pub.publisher)}" placeholder="Publisher — O=VENDOR, L=CITY, S=STATE, C=US (copy from the signed binary)" spellcheck="false">
        <input class="btn al-fx-prod" style="cursor:text;flex:1;min-width:150px" value="${esc(pub.product)}" placeholder="Product" spellcheck="false">
        <input class="btn al-fx-bin" style="cursor:text;flex:1;min-width:150px" value="${esc(pub.binary)}" placeholder="Binary" spellcheck="false">
        <input class="btn al-fx-low" style="cursor:text;width:120px" value="${esc(pub.low || "*")}" placeholder="Low version" spellcheck="false">
        <input class="btn al-fx-high" style="cursor:text;width:120px" value="${esc(pub.high || "*")}" placeholder="High version" spellcheck="false">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center">
        <button class="btn sm primary al-fx-apply">Apply fix</button>
        <button class="btn sm al-fx-cancel">Cancel</button>
        <span class="mini muted al-fx-hint"></span>
      </div>
    </div>`;
  }

  // Read the open editor out of the DOM and apply it to the rule.
  function applyFixEditor(f, plan, root) {
    const q = (sel) => root.querySelector(sel);
    const approach = q(".al-fx-approach").value;
    const rule = plan.rule, col = plan.col;

    if (approach === "delete") {
      return mutate(`deleted “${rule.name}”`, () => { col.rules = col.rules.filter((r) => r.id !== rule.id); });
    }

    let sid = q(".al-fx-sid").value;
    if (sid === "__custom") {
      sid = q(".al-fx-sidcustom").value.trim();
      if (!/^S-\d-\d+(-\d+)*$/i.test(sid)) { q(".al-fx-hint").textContent = "That does not look like a SID (S-1-5-21-…)."; return false; }
    }

    if (approach === "principal") {
      if (sid === rule.sid) { q(".al-fx-hint").textContent = "Principal unchanged — nothing to apply."; return false; }
      return mutate(`re-scoped “${rule.name}” to ${sidName(sid)}`, () => { rule.sid = sid; });
    }

    if (approach === "path") {
      const path = q(".al-fx-path").value.trim();
      if (!path) { q(".al-fx-hint").textContent = "A path rule needs a path."; return false; }
      if (path === (rule.conditions[0] || {}).path && sid === rule.sid) { q(".al-fx-hint").textContent = "Nothing changed."; return false; }
      return mutate(`tightened “${rule.name}”`, () => {
        rule.sid = sid;
        rule.nodeName = "FilePathRule";
        rule.conditions = [{ kind: "path", path }];
      });
    }

    // publisher
    const publisher = q(".al-fx-pub").value.trim();
    if (!publisher) { q(".al-fx-hint").textContent = "Give the exact publisher — that is the fact the audit says is missing."; return false; }
    const cond = {
      kind: "publisher",
      publisher,
      product: q(".al-fx-prod").value.trim() || "*",
      binary: q(".al-fx-bin").value.trim() || "*",
      low: q(".al-fx-low").value.trim() || "*",
      high: q(".al-fx-high").value.trim() || "*",
    };
    return mutate(`rewrote “${rule.name}” as a publisher rule`, () => {
      rule.sid = sid;
      rule.nodeName = "FilePublisherRule";
      rule.conditions = [cond];
    });
  }

  // ================================================================
  // MARKDOWN REPORT
  // ================================================================
  function markdown() {
    const L = [];
    L.push(`# AppLocker policy review${importedXmlName ? ` — ${importedXmlName}` : ""}`);
    L.push("");
    L.push(`> ${Brand.generatedBy("Generated")}`);
    L.push(`> Check set after Spencer Alessi's AppLockerInspector (v0.1).`);
    if (scan) {
      const m = scan.machine || {};
      L.push(`> Device scan included: ${m.name || "unknown device"} (${m.os || "unknown OS"}), taken ${String((scan.generator || {}).generatedUtc || "").replace("T", " ").slice(0, 16)} UTC${m.elevated === false ? " — NOT ELEVATED, so the ACL and event-log evidence is partial" : ""}.`);
    } else {
      L.push(`> No device scan was supplied. NTFS and SMB-share ACL checks require a filesystem and DID NOT RUN — run Invoke-TunoAppLockerScan.ps1 on a representative device and upload the bundle for those.`);
    }
    L.push("");
    L.push(`## Enforcement`);
    L.push("");
    L.push(`| Collection | Mode | Rules |`);
    L.push(`|---|---|---|`);
    for (const c of policy.collections) L.push(`| ${c.type} | ${c.mode} | ${c.rules.length} |`);
    L.push("");
    L.push(`## Findings (${findings.length})`);
    L.push("");
    if (!findings.length) L.push("No findings — the static checks are clean.");
    else {
      L.push(`| Severity | Source | Collection | Rule | Condition | Reason | Recommendation |`);
      L.push(`|---|---|---|---|---|---|---|`);
      const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      for (const f of findings) L.push(`| ${f.sev} | ${f.source === "scan" ? "device scan" : "policy XML"} | ${cell(f.collection)} | ${cell(f.rule || f.ruleType)} | ${cell(f.cond || "")} | ${cell(f.reason)} | ${cell(f.rec)} |`);
    }
    L.push("");

    if (scan) {
      const m = scan.machine || {};
      const ev = scan.events;
      L.push(`## Device scan`);
      L.push("");
      L.push(`| Fact | Value |`);
      L.push(`|---|---|`);
      L.push(`| Device | ${m.name || "—"} |`);
      L.push(`| OS | ${m.os || "—"} (build ${m.osBuild || "—"}) |`);
      L.push(`| Join state | ${m.join || "—"} |`);
      L.push(`| Elevated | ${m.elevated === false ? "**no — partial scan**" : "yes"} |`);
      L.push(`| Application Identity service | ${m.appIdentityService || "—"} |`);
      L.push(`| User-writable directories | ${scan.writablePaths.length} |`);
      L.push(`| Executables inventoried | ${scan.artifacts.length} (${scan.artifacts.filter((a) => a && !a.signed).length} unsigned) |`);
      if (ev && ev.available && ev.summary) L.push(`| AppLocker events (${ev.daysBack} days) | ${ev.summary.blocked} blocked, ${ev.summary.audited} audited, ${ev.summary.allowed} allowed |`);
      L.push("");
      if (scan.warnings.length) {
        L.push(`### What this scan could not see`);
        L.push("");
        for (const w of scan.warnings) L.push(`- ${w}`);
        L.push("");
      }
      const reach = scan.writablePaths.map((w) => ({ p: w.normalized || w.path, r: evaluateProbePath(policy, w.normalized || w.path, "Exe"), g: w.grantees || [] })).filter((x) => x.r);
      L.push(`### User-writable directories still reachable through an allow rule (${reach.length} of ${scan.writablePaths.length})`);
      L.push("");
      if (!reach.length) L.push("None — every writable directory the scan found is excepted or unreachable.");
      else {
        L.push(`| Path | Writable by | Allowed by |`);
        L.push(`|---|---|---|`);
        for (const x of reach.slice(0, 200)) L.push(`| ${x.p} | ${x.g.map((g) => g.name || g.sid).join(", ") || "—"} | ${x.r.name} |`);
        if (reach.length > 200) L.push(`| … | ${reach.length - 200} more | |`);
      }
      L.push("");
    }
    L.push(`## Microsoft app coverage`);
    L.push("");
    L.push(`| App | Verdict | Detail |`);
    L.push(`|---|---|---|`);
    for (const row of coverage) {
      const v = row.result;
      const detail = v.status === "unenforced" ? v.detail
        : (v.perArt || []).map((a) => `${a.art.path.split("\\").pop()}: ${a.status}${a.why ? ` (${a.why})` : ""}${a.rule ? ` via “${a.rule.name}”` : ""}`).join("; ");
      L.push(`| ${row.app.name} | ${v.status}${v.audit ? " (audit only)" : ""} | ${String(detail).replace(/\|/g, "\\|")} |`);
    }
    L.push("");
    return L.join("\n");
  }

  // ================================================================
  // RENDER
  // ================================================================
  const sevTag = (s) => `<span class="sev ${s.toLowerCase()}">${s}</span>`;
  const verdictTag = (v, audit) =>
    v === "allowed" ? `<span class="tag grant">✓ allowed${audit ? " · audit" : ""}</span>` :
    v === "blocked" ? `<span class="tag block">✕ ${audit ? "would be blocked (audit)" : "BLOCKED"}</span>` :
    v === "conditional" ? `<span class="tag new">△ group-scoped</span>` :
    `<span class="tag">— not enforced</span>`;

  function recompute() {
    // Static findings first, then the ones only a device scan can reach. They land
    // in one table on purpose: an admin does not care which half of the tool proved
    // that %PROGRAMFILES%\Vendor is a hole, only that it is one. `source` marks the
    // scan-derived rows so the table can say where each verdict came from.
    findings = analyze(policy).concat(analyzeScan(scan, policy));
    findings.sort((a, b) => SEV_SCORE[b.sev] - SEV_SCORE[a.sev] || String(a.collection).localeCompare(String(b.collection)));
    coverage = MS_APP_CATALOG.map((app) => ({ app, result: evaluateApp(policy, app) }));
    render();
  }

  // Minimal XML colouriser for the live panel. The string is escaped FIRST
  // and every pattern below matches only on the ESCAPED form (&lt;tag,
  // attr=&quot;value&quot;), so nothing carried in a policy — a rule name
  // containing an angle bracket, a path with an ampersand — can reach the
  // DOM as markup. Presentation only: exportXml() remains the source of
  // truth and is what Copy and Download hand over.
  function highlightXml(x) {
    return esc(x)
      .replace(/(&lt;\/?)([\w:.-]+)/g, '<span class="x-punct">$1</span><span class="x-tag">$2</span>')
      .replace(/([\w:.-]+)=(&quot;.*?&quot;)/g, '<span class="x-attr">$1</span><span class="x-punct">=</span><span class="x-val">$2</span>')
      .replace(/(\/?&gt;)/g, '<span class="x-punct">$1</span>');
  }

  // Same treatment for the Intune profile: escaped first, and the only patterns
  // that can produce a span match structural JSON punctuation. A rule name
  // carrying a brace renders as text.
  function highlightJson(x) {
    return esc(x)
      .replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)/g, '<span class="x-attr">$1</span><span class="x-punct">$2</span>')
      .replace(/:\s(&quot;(?:[^&]|&(?!quot;))*?&quot;)/g, ': <span class="x-val">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="x-tag">$1</span>');
  }

  // The code panel shows one of two artefacts, both rendered from the SAME
  // functions their Copy and Download buttons hand over — never from a second
  // serialiser kept in step by hand, which is how a preview starts lying about
  // what it is about to write.
  function renderCodePane() {
    const sub = $("alXmlSub"), code = $("alXmlCode"), name = $("alXmlName");
    if (!sub || !code) return;

    document.querySelectorAll(".al-pane-tab").forEach((t) => t.classList.toggle("active", t.dataset.pane === pane));
    const form = $("alIntuneForm");
    if (form) form.style.display = pane === "intune" ? "" : "none";

    if (!policy) {
      if (name) name.textContent = pane === "intune" ? "IntuneProfile.json" : "AppLockerPolicy.xml";
      sub.textContent = "";
      code.innerHTML = '<span class="al-xml-empty">No policy loaded.</span>';
      return;
    }

    if (pane === "intune") {
      if (name) name.textContent = intuneProfileName(intuneCfg.mode).replace(/[^A-Za-z0-9\-_.()]/g, "_") + ".json";
      const n = policy.collections.filter((c) => OMA_TYPE[c.type]).length;
      sub.textContent = `${n} OMA-URI setting${n === 1 ? "" : "s"} · grouping ${intuneGrouping() || "(none)"} · ${intuneCfg.mode}`;
      code.innerHTML = highlightJson(intuneJson(intuneCfg.mode));
      return;
    }

    if (name) name.textContent = "AppLockerPolicy.xml";
    const rules = policy.collections.reduce((n, c) => n + c.rules.length, 0);
    sub.textContent = `${rules} rule${rules === 1 ? "" : "s"} · ${policy.collections.length} collection${policy.collections.length === 1 ? "" : "s"}`;
    code.innerHTML = highlightXml(exportXml());
  }

  // ---- the device-scan evidence card ----
  function renderScanCard() {
    const host = $("alScan");
    if (!host) return;
    if (!scan) { host.style.display = "none"; host.innerHTML = ""; return; }
    host.style.display = "";

    const m = scan.machine || {};
    const ev = scan.events;
    const gen = scan.generatedPolicy;
    const unsigned = scan.artifacts.filter((a) => a && !a.signed).length;

    const fact = (k, v) => `<div><div class="mini muted">${esc(k)}</div><div class="mini"><b>${esc(v == null || v === "" ? "—" : String(v))}</b></div></div>`;

    const sources = [
      gen && gen.auditXml ? ["generated-audit", "Generated · AuditOnly"] : null,
      gen && gen.enforceXml ? ["generated-enforce", "Generated · Enforced"] : null,
      scan.effectivePolicy && scan.effectivePolicy.xml ? ["effective", "The device's effective policy"] : null,
    ].filter(Boolean);

    const topPaths = scan.writablePaths.slice(0, 12);
    const topEvents = ev && ev.entries
      ? ev.entries.filter((e) => e.verdict === "Blocked" || e.verdict === "Audited").slice(0, 12)
      : [];

    host.innerHTML = `
      <h3 style="margin:0 0 8px">🛰 Device scan <span class="mini muted">— evidence the XML alone cannot carry</span></h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px">
        ${fact("Device", m.name)}${fact("OS", m.os)}${fact("Joined", m.join)}
        ${fact("Scanned by", m.scannedBy)}${fact("Elevated", m.elevated === false ? "NO — partial scan" : "yes")}
        ${fact("Application Identity", m.appIdentityService)}
        ${fact("Writable directories", scan.writablePaths.length)}
        ${fact("Executables inventoried", scan.artifacts.length + (unsigned ? ` (${unsigned} unsigned)` : ""))}
        ${fact("Scan taken", scan.generator && scan.generator.generatedUtc ? String(scan.generator.generatedUtc).replace("T", " ").slice(0, 16) + " UTC" : "—")}
      </div>
      ${sources.length > 1 ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <span class="mini muted">Editing ${esc(SCAN_SOURCE_LABEL[scanSource] || scanSource)} —</span>
        ${sources.map(([v, l]) => `<button class="btn sm al-scan-src ${scanSource === v ? "primary" : ""}" data-src="${v}">${esc(l)}</button>`).join("")}
      </div>` : ""}
      ${scan.warnings.length ? `<div class="mini" style="margin-bottom:12px"><b>The scan recorded ${scan.warnings.length} warning${scan.warnings.length === 1 ? "" : "s"}:</b><ul style="margin:4px 0 0;padding-left:20px">${scan.warnings.slice(0, 6).map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
      ${topPaths.length ? `<h4 class="mini" style="margin:12px 0 6px">User-writable directories <span class="muted">— showing ${topPaths.length} of ${scan.writablePaths.length}</span></h4>
      <div style="overflow-x:auto"><table class="plist"><thead><tr><th>Path</th><th>Writable by</th><th>Reachable now?</th></tr></thead><tbody>
        ${topPaths.map((w) => {
          const p = w.normalized || w.path;
          const rule = evaluateProbePath(policy, p, "Exe");
          return `<tr><td class="mini" style="word-break:normal;overflow-wrap:anywhere">${esc(p)}</td>
            <td class="mini">${esc((w.grantees || []).map((g) => g.name || g.sid).join(", ") || "—")}</td>
            <td>${rule ? `<span class="tag block">✕ yes — via “${esc(rule.name)}”</span>` : `<span class="tag grant">✓ no</span>`}</td></tr>`;
        }).join("")}
      </tbody></table></div>` : `<p class="mini muted">No user-writable directories were found in the scanned roots. That is unusual — check the scan warnings above before believing it.</p>`}
      ${topEvents.length ? `<h4 class="mini" style="margin:14px 0 6px">Executions the endpoint refused <span class="muted">— last ${ev.daysBack} days, showing ${topEvents.length} of ${ev.summary.blocked + ev.summary.audited}</span></h4>
      <div style="overflow-x:auto"><table class="plist"><thead><tr><th>Verdict</th><th>File</th><th>Publisher</th><th>User</th><th>When</th></tr></thead><tbody>
        ${topEvents.map((e) => `<tr>
          <td>${e.verdict === "Blocked" ? '<span class="tag block">blocked</span>' : '<span class="tag new">would block</span>'}</td>
          <td class="mini" style="word-break:normal;overflow-wrap:anywhere">${esc(e.path || "—")}</td>
          <td class="mini">${esc(e.signed ? (e.publisher || "") : "not signed")}</td>
          <td class="mini">${esc(e.userName || e.userSid || "—")}</td>
          <td class="mini muted">${esc(String(e.timeUtc || "").replace("T", " ").slice(0, 16))}</td></tr>`).join("")}
      </tbody></table></div>` : (ev && ev.available ? `<p class="mini muted" style="margin-top:12px">No AppLocker events in the last ${esc(String(ev.daysBack))} days. Either no policy is applied on that device, or the Application Identity service is not running — the fact table above says which.</p>` : `<p class="mini muted" style="margin-top:12px">AppLocker event logs were not collected in this scan.</p>`)}`;
  }

  function render() {
    $("alEmpty").style.display = policy ? "none" : "";
    $("alBody").style.display = policy ? "" : "none";
    renderCodePane();
    renderDeploy();
    renderScanCard();
    if (!policy) return;
    const counts = { High: 0, Medium: 0, Low: 0, Info: 0 };
    findings.forEach((f) => counts[f.sev]++);
    const risky = riskyRuleIds();

    // ---- summary + enforcement ----
    $("alSummary").innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <b>${esc(importedXmlName || "New policy")}</b>
        <span class="mini muted">${policy.collections.reduce((n, c) => n + c.rules.length, 0)} rules in ${policy.collections.length} collections</span>
        <span class="spacer"></span>
        ${undoState ? `<button class="btn sm" id="alUndo" title="Undo: ${esc(undoState.label)}">↩ Undo — ${esc(undoState.label)}</button>` : ""}
        ${SEV_ORDER.map((s) => `<button class="btn sm al-sev ${sevFilter === s ? "active" : ""}" data-sev="${s}">${sevTag(s)} ${counts[s]}</button>`).join("")}
        <button class="btn sm al-sev ${sevFilter === "all" ? "active" : ""}" data-sev="all">All ${findings.length}</button>
      </div>`;
    $("alEnforce").innerHTML = `<h3 style="margin:0 0 8px">Enforcement per collection</h3>
      <table class="plist"><thead><tr><th>Collection</th><th>Mode</th><th>Rules</th><th></th></tr></thead><tbody>` +
      COLLECTIONS.map((t) => {
        const c = policy.collections.find((x) => x.type === t);
        return `<tr><td>${esc(COLLECTION_LABEL[t])}</td>
          <td>${c ? `<select class="btn al-mode" data-col="${t}">` + MODES.map((m) => `<option ${c.mode === m ? "selected" : ""}>${m}</option>`).join("") + `</select>` : `<span class="mini muted">absent</span>`}</td>
          <td>${c ? c.rules.length : "—"}</td>
          <td>${!c || !c.rules.some((r) => r.name.startsWith("(Default Rule)")) ? `<button class="btn sm al-defaults" data-col="${t}">＋ Add default rules</button>` : ""}</td></tr>`;
      }).join("") + `</tbody></table>`;

    // ---- findings ----
    const shown = findings.filter((f) => sevFilter === "all" || f.sev === sevFilter);
    $("alFindings").innerHTML = `<h3 style="margin:0 0 8px">Findings <span class="mini muted">— static checks; NTFS/share ACL checks need Invoke-AppLockerInspector.ps1 on a host</span></h3>` +
      (shown.length ? `<div style="overflow-x:auto"><table class="plist"><thead><tr><th></th><th>Collection</th><th>Rule</th><th>Condition</th><th>Reason</th><th>Recommendation</th><th></th></tr></thead><tbody>` +
        shown.map((f, i) => {
          const key = findingKey(f);
          const plan = planFix(f);
          const btn = plan
            ? `<button class="btn sm ${plan.mode === "auto" ? "primary" : ""} al-fixfind" data-i="${i}" title="${esc(plan.title)}">🔧 ${esc(plan.label)}</button>`
            : `<span class="mini muted" title="This finding's recommendation is 'no change needed' — nothing to apply">—</span>`;
          const mark = f.source === "scan" ? ` <span class="tag new" title="This verdict came from the device scan. The browser cannot read an ACL — the scan can, and did.">🛰</span>` : "";
          const row = `<tr><td>${sevTag(f.sev)}${mark}</td><td>${esc(f.collection)}</td><td>${esc(f.rule || f.ruleType)}<div class="mini muted">${esc(f.principal || "")}</div></td><td class="mini" style="min-width:160px;max-width:260px;word-break:normal;overflow-wrap:anywhere">${esc(f.cond || "")}</td><td class="mini">${esc(f.reason)}</td><td class="mini">${esc(f.rec)}</td><td style="white-space:nowrap">${btn}</td></tr>`;
          const editor = (plan && plan.mode === "editor" && fixOpen === key)
            ? `<tr class="al-fixrow" data-i="${i}"><td colspan="7" style="padding:0">${fixEditorHtml(f, plan)}</td></tr>`
            : "";
          return row + editor;
        }).join("") +
        `</tbody></table></div>` : `<p class="mini muted">Nothing at this severity.</p>`);
    // Handlers below index into `shown`, so it must outlive this function.
    shownFindings = shown;

    // ---- Microsoft coverage ----
    $("alCoverage").innerHTML = `<h3 style="margin:0 0 8px">Microsoft app coverage <span class="mini muted">— would a standard user still be able to run these?</span></h3>` +
      `<div style="overflow-x:auto"><table class="plist"><thead><tr><th>App</th><th>Verdict</th><th>Detail</th><th></th></tr></thead><tbody>` +
      coverage.map((row, i) => {
        const v = row.result;
        let detail;
        if (v.status === "unenforced") detail = esc(v.detail);
        else detail = (v.perArt || []).map((a) => {
          const file = a.art.path.split("\\").pop();
          let s = `<code>${esc(file)}</code> — ${a.status}`;
          if (a.why) s += ` <span class="mini muted">(${esc(a.why)})</span>`;
          if (a.rule) {
            s += ` via “${esc(a.rule.name)}”`;
            if (risky.has(a.rule.id)) s += ` <span class="tag new" title="The allow works, but the audit flags this rule — see Findings">⚠ risky rule</span>`;
            if (a.versionBound) s += ` <span class="mini muted">(version-bounded — verify the deployed version falls inside)</span>`;
            if (a.denyCustom) s += ` <span class="mini muted">(a group-scoped deny “${esc(a.denyCustom.name)}” also matches — members of ${esc(sidName(a.denyCustom.sid))} are blocked)</span>`;
          }
          return s;
        }).join("<br>");
        const canFix = v.status === "blocked" || v.status === "conditional";
        return `<tr><td><b>${esc(row.app.name)}</b>${row.app.critical ? "" : ""}<div class="mini muted" style="max-width:320px">${esc(row.app.context)}</div></td>
          <td>${verdictTag(v.status, v.audit)}</td><td class="mini">${detail}</td>
          <td>${canFix ? `<button class="btn sm primary al-fix" data-i="${i}" title="${esc(row.app.fix.note)}">🔧 Add allow rule</button>` : ""}</td></tr>`;
      }).join("") + `</tbody></table></div>`;

    // ---- rules / builder ----
    $("alRules").innerHTML = `<h3 style="margin:0 0 8px">Rules</h3>` +
      policy.collections.map((col) => col.rules.length ? `<h4 class="mini" style="margin:12px 0 6px">${esc(COLLECTION_LABEL[col.type] || col.type)} · ${esc(col.mode)}</h4>
        <div style="overflow-x:auto"><table class="plist"><tbody>` + col.rules.map((r) => {
          const c = r.conditions[0] || {};
          const cond = c.kind === "path" ? c.path : c.kind === "publisher" ? `${c.publisher} · ${c.product} · ${c.binary} [${c.low},${c.high}]` : c.kind === "hash" ? `${(c.hashes || []).length} hash(es)` : "";
          return `<tr><td style="width:70px">${r.action === "Deny" ? '<span class="tag block">Deny</span>' : '<span class="tag grant">Allow</span>'}</td>
            <td>${esc(r.name)}${risky.has(r.id) ? ' <span class="tag new">⚠ flagged</span>' : ""}<div class="mini muted">${esc(sidName(r.sid))} · ${esc(c.kind || "")}</div></td>
            <td class="mini" style="min-width:180px;max-width:340px;word-break:normal;overflow-wrap:anywhere">${esc(cond)}</td>
            <td style="width:40px"><button class="btn sm danger al-del" data-col="${esc(col.type)}" data-id="${esc(r.id)}" title="Remove this rule">🗑</button></td></tr>`;
        }).join("") + `</tbody></table></div>` : "").join("") +
      `<div class="list-card" style="margin-top:14px;padding:16px">
        <h4 style="margin:0 0 8px">＋ Add a rule</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="alNewCol" class="btn">${COLLECTIONS.map((t) => `<option>${t}</option>`).join("")}</select>
          <select id="alNewAction" class="btn"><option>Allow</option><option>Deny</option></select>
          <select id="alNewSid" class="btn">
            <option value="S-1-1-0">Everyone</option><option value="S-1-5-11">Authenticated Users</option>
            <option value="S-1-5-32-545">BUILTIN\\Users</option><option value="S-1-5-32-544">BUILTIN\\Administrators</option>
          </select>
          <select id="alNewKind" class="btn"><option value="path">Path</option><option value="publisher">Publisher</option></select>
        </div>
        <div id="alNewPathRow" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <input id="alNewPath" class="btn" style="cursor:text;flex:1;min-width:280px" placeholder="Path, e.g. %PROGRAMFILES%\\Vendor\\App.exe" spellcheck="false">
        </div>
        <div id="alNewPubRow" style="display:none;gap:8px;flex-wrap:wrap;margin-top:8px">
          <input id="alNewPub" class="btn" style="cursor:text;flex:2;min-width:280px" placeholder="Publisher, e.g. O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" spellcheck="false">
          <input id="alNewProd" class="btn" style="cursor:text;flex:1;min-width:160px" placeholder="Product (* for any)" value="*" spellcheck="false">
          <input id="alNewBin" class="btn" style="cursor:text;flex:1;min-width:160px" placeholder="Binary (* for any)" value="*" spellcheck="false">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center">
          <input id="alNewName" class="btn" style="cursor:text;flex:1;min-width:220px" placeholder="Rule name" spellcheck="false">
          <button class="btn primary" id="alNewAdd">Add rule</button>
        </div>
        <p class="mini muted" style="margin:8px 0 0">Publisher-first is the house style: a path allow is only as strong as the ACL on the folder, which this browser cannot see.</p>
      </div>`;

    wireDynamic();
  }

  function wireDynamic() {
    document.querySelectorAll(".al-sev").forEach((b) => b.addEventListener("click", () => { sevFilter = b.dataset.sev; render(); }));
    document.querySelectorAll(".al-mode").forEach((s) => s.addEventListener("change", () => {
      mutate(`set ${s.dataset.col} to ${s.value}`, () => { ensureCollection(s.dataset.col).mode = s.value; });
    }));
    document.querySelectorAll(".al-defaults").forEach((b) => b.addEventListener("click", () => {
      mutate(`added default rules to ${b.dataset.col}`, () => addDefaultRules(b.dataset.col) > 0 ? undefined : false);
    }));
    document.querySelectorAll(".al-fix").forEach((b) => b.addEventListener("click", () => {
      const app = coverage[+b.dataset.i].app;
      mutate(`added an allow rule for ${app.name}`, () => addFixForApp(app));
    }));
    // Swapping which policy from the bundle is on the table is a fresh load, not a
    // mutation: undoing your way back into a different source policy would be a
    // trap, so the undo stack is dropped with the switch.
    document.querySelectorAll(".al-scan-src").forEach((b) => b.addEventListener("click", () => {
      if (!scan || b.dataset.src === scanSource) return;
      const chosen = bundleXml(scan, b.dataset.src);
      if (!chosen) return;
      scanSource = chosen.source;
      policy = parsePolicy(chosen.xml, scan.sourceName);
      importedXmlName = `${scan.sourceName} — ${SCAN_SOURCE_LABEL[chosen.source]}`;
      loadFresh();
    }));
    document.querySelectorAll(".al-del").forEach((b) => b.addEventListener("click", () => {
      const col = policy.collections.find((c) => c.type === b.dataset.col);
      if (!col) return;
      const gone = col.rules.find((r) => r.id === b.dataset.id);
      mutate(`deleted “${gone ? gone.name : "rule"}”`, () => { col.rules = col.rules.filter((r) => r.id !== b.dataset.id); });
    }));

    // ---- findings: fix ----
    const undoBtn = $("alUndo");
    if (undoBtn) undoBtn.addEventListener("click", undoLast);

    document.querySelectorAll(".al-fixfind").forEach((b) => b.addEventListener("click", () => {
      const f = shownFindings[+b.dataset.i];
      if (!f) return;
      const plan = planFix(f);
      if (!plan) return;
      if (plan.mode === "auto") { fixOpen = null; mutate(plan.undoLabel, plan.apply); return; }
      const key = findingKey(f);
      fixOpen = fixOpen === key ? null : key;   // second click closes it
      render();
    }));
    document.querySelectorAll(".al-fixrow").forEach((row) => {
      const f = shownFindings[+row.dataset.i];
      if (!f) return;
      const plan = planFix(f);
      if (!plan || plan.mode !== "editor") return;
      const approach = row.querySelector(".al-fx-approach");
      const sync = () => {
        const v = approach.value;
        const set = (sel, on) => { const el = row.querySelector(sel); if (el) el.style.display = on ? "flex" : "none"; };
        set(".al-fx-pathrow", v === "path");
        set(".al-fx-pubrow", v === "publisher");
        const sid = row.querySelector(".al-fx-sid");
        if (sid) sid.disabled = v === "delete";
      };
      approach.addEventListener("change", sync);
      sync();
      const sidSel = row.querySelector(".al-fx-sid");
      sidSel.addEventListener("change", () => {
        row.querySelector(".al-fx-sidcustom").style.display = sidSel.value === "__custom" ? "" : "none";
      });
      row.querySelector(".al-fx-cancel").addEventListener("click", () => { fixOpen = null; render(); });
      row.querySelector(".al-fx-apply").addEventListener("click", () => {
        // Close BEFORE applying: applyFixEditor() calls mutate(), which
        // re-renders synchronously, and a still-open fixOpen would redraw the
        // editor over the result. On refusal nothing re-rendered, the reason is
        // already in .al-fx-hint, and the panel stays where it is.
        const wasOpen = fixOpen;
        fixOpen = null;
        if (applyFixEditor(f, plan, row) === false) fixOpen = wasOpen;
      });
    });
    const kind = $("alNewKind");
    if (kind) kind.addEventListener("change", () => {
      $("alNewPathRow").style.display = kind.value === "path" ? "flex" : "none";
      $("alNewPubRow").style.display = kind.value === "publisher" ? "flex" : "none";
    });
    const add = $("alNewAdd");
    if (add) add.addEventListener("click", () => {
      const k = $("alNewKind").value;
      const name = $("alNewName").value.trim() || "(unnamed rule)";
      const cond = k === "path"
        ? { kind: "path", path: $("alNewPath").value.trim() }
        : { kind: "publisher", publisher: $("alNewPub").value.trim() || "*", product: $("alNewProd").value.trim() || "*", binary: $("alNewBin").value.trim() || "*", low: "*", high: "*" };
      if (k === "path" && !cond.path) { alert("A path rule needs a path."); return; }
      const col = ensureCollection($("alNewCol").value);
      col.rules.push(mkRule(k === "path" ? "FilePathRule" : "FilePublisherRule", name, $("alNewSid").value, $("alNewAction").value, [cond]));
      recompute();
    });
  }

  // ---------- sample policy, for trying the tool without an export ----------
  const SAMPLE_XML = `<AppLockerPolicy Version="1">
  <RuleCollection Type="Exe" EnforcementMode="Enabled">
    <FilePathRule Id="921cc481-6e17-4653-8f75-050b80acca20" Name="(Default Rule) All files located in the Program Files folder" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%PROGRAMFILES%\\*"/></Conditions></FilePathRule>
    <FilePathRule Id="a61c8b2c-a319-4cd0-9690-d2177cad7b51" Name="(Default Rule) All files located in the Windows folder" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%WINDIR%\\*"/></Conditions></FilePathRule>
    <FilePathRule Id="fd686d83-a829-4351-8ff4-27c7de5755d2" Name="(Default Rule) All files" Description="" UserOrGroupSid="S-1-5-32-544" Action="Allow"><Conditions><FilePathCondition Path="*"/></Conditions></FilePathRule>
    <FilePathRule Id="7010c9ae-0ba0-4c25-9046-40b0146eb892" Name="Temp EXEs for the helpdesk tool" Description="TODO remove" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%OSDRIVE%\\Users\\*\\AppData\\Local\\Temp\\*.exe"/></Conditions></FilePathRule>
    <FilePublisherRule Id="b7af7102-efde-4369-8a89-7a6a392d1473" Name="Vendor - anything" Description="" UserOrGroupSid="S-1-5-11" Action="Allow"><Conditions><FilePublisherCondition PublisherName="O=CONTOSO, L=REDMOND, S=WASHINGTON, C=US" ProductName="*" BinaryName="*"><BinaryVersionRange LowSection="1.0.0.0" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>
  </RuleCollection>
  <RuleCollection Type="Msi" EnforcementMode="AuditOnly">
    <FilePublisherRule Id="b7bc4bdb-b9b9-4a89-9b1e-6d18c6a4c9d8" Name="(Default Rule) All digitally signed Windows Installer files" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePublisherCondition PublisherName="*" ProductName="*" BinaryName="*"><BinaryVersionRange LowSection="0.0.0.0" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>
  </RuleCollection>
  <RuleCollection Type="Script" EnforcementMode="NotConfigured"/>
  <RuleCollection Type="Appx" EnforcementMode="Enabled">
    <FilePublisherRule Id="a9e18c21-ff8f-43cf-b9fc-db40eed693ba" Name="(Default Rule) All signed packaged apps" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePublisherCondition PublisherName="*" ProductName="*" BinaryName="*"><BinaryVersionRange LowSection="0.0.0.0" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>
  </RuleCollection>
</AppLockerPolicy>`;

  // ---------- downloads ----------
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ================================================================
  // INIT — wire the static toolbar
  // ================================================================
  function loadFresh() {
    sevFilter = "all";
    resetFixState();
    recompute();
  }

  // One upload button, two file types. The scan bundle is JSON and carries the
  // policy INSIDE it, so asking the admin which button to press would be asking
  // them to know something the file already says.
  function importFile(text, name) {
    const looksJson = /\.json$/i.test(name) || /^\s*\{/.test(text);
    if (looksJson) {
      const b = parseBundle(text, name);
      const chosen = bundleXml(b);
      if (!chosen) throw new Error("That bundle carries no policy: the scan ran with -SkipRuleGeneration and the device's effective policy could not be read either. Re-run the scan without -SkipRuleGeneration.");
      scan = b;
      scanSource = chosen.source;
      policy = parsePolicy(chosen.xml, name);
      importedXmlName = `${name} — ${SCAN_SOURCE_LABEL[chosen.source]}`;
      return;
    }
    // A plain XML import clears any previous scan: the evidence belonged to the
    // other policy, and leaving it on screen would attach a device's ACLs to a
    // file that has nothing to do with it.
    scan = null;
    scanSource = "";
    policy = parsePolicy(text, name);
    importedXmlName = name;
  }

  // Same-origin so it works on both channels without hard-coding a host, and
  // survives the beta site living under a /tuno-beta/ path.
  const scriptUrl = (file) => new URL("scripts/" + file, document.baseURI).href;

  function flash(btn, text) {
    const was = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = was; }, 2000);
  }
  async function copyToClipboard(btn, text) {
    try { await navigator.clipboard.writeText(text); flash(btn, "✓ Copied"); }
    catch { flash(btn, "✗ Blocked — use Download"); }
  }

  function init() {
    $("alFile").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { importFile(await f.text(), f.name); loadFresh(); }
      catch (err) { alert("Import failed: " + err.message); }
      e.target.value = "";
    });
    $("alImport").addEventListener("click", () => $("alFile").click());
    $("alSample").addEventListener("click", () => {
      scan = null; scanSource = "";
      policy = parsePolicy(SAMPLE_XML, "sample policy");
      importedXmlName = "sample policy (deliberately flawed — for trying the tool)";
      loadFresh();
    });
    $("alNew").addEventListener("click", () => {
      scan = null; scanSource = "";
      policy = { sourceName: "", collections: [] };
      COLLECTIONS.forEach((t) => ensureCollection(t));
      importedXmlName = "new policy";
      loadFresh();
    });

    // ---- the code panel: which artefact, and its two buttons ----
    document.querySelectorAll(".al-pane-tab").forEach((t) => t.addEventListener("click", () => {
      pane = t.dataset.pane;
      renderCodePane();
    }));
    $("alXml").addEventListener("click", () => {
      if (!policy) return;
      if (pane === "intune") download(intuneProfileName(intuneCfg.mode).replace(/[^A-Za-z0-9\-_.()]/g, "_") + ".json", intuneJson(intuneCfg.mode), "application/json");
      else download("AppLockerPolicy-TUNO.xml", exportXml(), "application/xml");
    });
    // Clipboard access is refused outright in some contexts (no gesture, a
    // policy-locked browser). Say so on the button rather than appearing to
    // copy — the download is right next to it.
    $("alCopyXml").addEventListener("click", (e) => {
      if (!policy) return;
      copyToClipboard(e.currentTarget, pane === "intune" ? intuneJson(intuneCfg.mode) : exportXml());
    });
    $("alMd").addEventListener("click", () => { if (policy) download("applocker-review.md", markdown(), "text/markdown"); });

    // ---- the Intune profile form ----
    const bind = (id, key) => {
      const el = $(id);
      if (!el) return;
      el.value = intuneCfg[key];
      el.addEventListener("input", () => { intuneCfg[key] = el.value; renderCodePane(); });
      el.addEventListener("change", () => { intuneCfg[key] = el.value; renderCodePane(); });
    };
    bind("alIntuneName", "displayName");
    bind("alIntuneGrouping", "grouping");
    bind("alIntuneMode", "mode");
    // The deploy panel reads the same three fields, so it has to be redrawn
    // when they change — otherwise it offers to create a profile under a name
    // that is no longer on screen.
    ["alIntuneName", "alIntuneGrouping", "alIntuneMode"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", renderDeploy);
    });
    renderDeploy();

    // ---- the download panel ----
    const cmdFor = (file) => `irm ${scriptUrl(file)} -OutFile .\\${file}`;
    document.querySelectorAll(".al-dl-cmd").forEach((el) => { el.textContent = cmdFor(el.dataset.file); });
    document.querySelectorAll(".al-dl-copy").forEach((b) => b.addEventListener("click", (e) => {
      copyToClipboard(e.currentTarget, cmdFor(e.currentTarget.dataset.file));
    }));
  }

  // ================================================================
  // DEPLOY — the profile straight into the tenant
  // ================================================================
  // This is the only place TUNO writes to a customer tenant, and the rules
  // it works under are deliberately narrower than what Graph would allow:
  //
  //   * AUDIT FIRST, ALWAYS. The Enforce button does not become live because
  //     you feel ready. It becomes live when the audit profile exists in
  //     this tenant AND an uploaded scan shows nothing was blocked and
  //     nothing would have been. Until then it says which of the two is
  //     missing. That order is the whole discipline of the tool; a UI that
  //     lets you skip it is a UI that disagrees with its own instructions.
  //
  //   * NOTHING IS OVERWRITTEN. A profile with this name, or writing this
  //     grouping, stops the deploy and is reported. TUNO did not create it,
  //     so TUNO does not get to change it — the two would fight over one CSP
  //     node on the device and the loser is whichever synced last.
  //
  //   * ASSIGNMENT IS A SEPARATE ACT, and it names the group and says how
  //     many members it has before you confirm. Creating a profile changes
  //     nothing on any device; assigning it is the moment that stops being
  //     true, so the two are never one button.
  //
  // Nothing here retries. A POST that timed out may have created something.
  let deployState = {
    busy: "",             // what is in flight, for the button labels
    checked: null,        // the last preflight result
    created: null,        // { audit: profile, enforce: profile } as created THIS session
    assigned: null,       // { groupName, count }
    groups: null,         // last search result
    picked: null,         // { id, displayName, count }
    error: null,          // last GraphError, shown verbatim
    note: "",
  };

  const escq = (s) => esc(s);

  // Why the Enforce button is not available yet, or "" when it is. Written
  // as a sentence because it is shown as one.
  function enforceBlockedBecause() {
    const haveAudit = !!createdFor("audit")
      || !!(deployState.checked && deployState.checked.auditInTenant);
    if (!haveAudit) return "The AuditOnly profile has to exist in this tenant first — deploy it above, or point the grouping at the one that is already there.";
    const ev = scan && scan.events;
    if (!scan) return "Upload a scan bundle taken AFTER the audit profile had been applied for a while. Without it there is no evidence the audit was worked down, only a belief that it was.";
    if (!ev || !ev.available) return "The uploaded scan could not read the AppLocker event logs, so it cannot show whether anything was blocked. Re-run the scan elevated on a device the audit profile actually reached.";
    const s = ev.summary || {};
    if (s.blocked) return `The scan still shows ${s.blocked} execution(s) blocked. Those are real users who could not run something — work them to nothing before enforcing.`;
    if (s.audited) return `The scan shows ${s.audited} execution(s) that WOULD have been blocked under enforcement. Every one of them becomes a blocked user the day this is enforced.`;
    return "";
  }

  function renderDeploy() {
    const box = $("alDeploy");
    if (!box) return;
    const d = deployState;
    const noGraph = typeof Graph === "undefined";
    const signedIn = !noGraph && Graph.signedIn();
    const name = intuneProfileName("Audit");
    const grouping = intuneGrouping();
    const issues = intuneIssues().filter((i) => i.sev === "High");

    const err = d.error ? `<div class="al-dep-err">
        <b>${escq(d.error.kind === "admin" ? "The tenant refused this" : d.error.kind === "consent" ? "Consent was not granted" : d.error.kind === "throttled" ? "The tenant is throttling" : "Graph refused this")}.</b>
        <div style="margin-top:4px">${escq(d.error.message)}</div>
        ${d.error.code ? `<div class="mini muted" style="margin-top:4px">code <code>${escq(d.error.code)}</code>${d.error.requestId ? ` · request-id <code>${escq(d.error.requestId)}</code>` : ""}</div>` : ""}
        ${d.error.consentUrl ? `<div class="mini" style="margin-top:6px">An administrator of this tenant grants it once, here: <a href="${escq(d.error.consentUrl)}" target="_blank" rel="noopener">admin consent for TUNO</a>. Nothing is granted by opening the link — it shows what is being asked for first.</div>` : ""}
      </div>` : "";

    if (noGraph || !policy) { box.innerHTML = ""; return; }

    if (!signedIn) {
      box.innerHTML = `<div class="al-dep">
        <div class="al-dep-h"><b>D · Let TUNO do it</b> <span class="tag new">writes to your tenant</span></div>
        <p class="mini muted" style="margin:0">Sign in with an account in the tenant you want to change and this becomes a button. TUNO asks for <code>DeviceManagementConfiguration.ReadWrite.All</code> at the moment you press it, not at sign-in — reading an XML in your own browser should not buy the right to create configuration profiles.</p>
      </div>`;
      return;
    }

    const blocked = enforceBlockedBecause();
    const coll = d.checked && d.checked.collisions || [];

    box.innerHTML = `<div class="al-dep">
      <div class="al-dep-h"><b>D · Let TUNO do it</b> <span class="tag new">writes to your tenant</span></div>
      <p class="mini muted" style="margin:0 0 8px">Creates the profile shown in the <b>Intune profile</b> tab, in the tenant you are signed in to. Creating it changes nothing on any device — assignment is a separate step below, and it tells you how big the group is before it does anything.</p>

      ${issues.length ? `<div class="al-dep-err"><b>Fix this before deploying.</b>${issues.map((i) => `<div style="margin-top:4px">${escq(i.text)}</div>`).join("")}</div>` : ""}
      ${err}

      <div class="al-dep-row">
        <button class="btn primary" id="alDepAudit" ${d.busy || issues.length ? "disabled" : ""}>
          ${d.busy === "audit" ? "Creating…" : "🚀 Create the AuditOnly profile"}</button>
        <span class="mini muted">as <b>${escq(name)}</b>, grouping <b>${escq(grouping || "(none)")}</b></span>
      </div>

      ${coll.length ? `<div class="al-dep-err"><b>Stopped — this tenant already has ${coll.length} profile${coll.length === 1 ? "" : "s"} in the way.</b>
        <div class="mini" style="margin-top:4px">TUNO did not create ${coll.length === 1 ? "it" : "them"}, so it will not change ${coll.length === 1 ? "it" : "them"}. Rename yours, pick a different grouping, or deal with ${coll.length === 1 ? "it" : "them"} in the portal.</div>
        <ul class="mini al-list" style="margin-top:6px">${coll.map((c) => `<li><b>${escq(c.displayName)}</b> — ${escq(c.why)}${c.modified ? ` · last changed ${escq(String(c.modified).slice(0, 10))}` : ""}</li>`).join("")}</ul></div>` : ""}

      ${createdFor("audit") ? `<div class="al-dep-ok"><b>Created.</b> ${escq(createdFor("audit").displayName)} — id <code>${escq(createdFor("audit").id)}</code>. It is in the tenant and assigned to nobody.</div>` : ""}

      ${createdFor("audit") ? `
      <div class="al-dep-sub">
        <b class="mini">Assign it to a pilot group</b>
        <p class="mini muted" style="margin:2px 0 6px">This is the step that reaches devices. Small group, people you can talk to.</p>
        ${d.assigned ? `<div class="al-dep-ok">Assigned to <b>${escq(d.assigned.groupName)}</b>${d.assigned.count != null ? ` (${escq(String(d.assigned.count))} members)` : ""}.</div>` : `
        <div class="al-dep-row">
          <input id="alDepGroupQ" class="al-dep-in" placeholder="Start typing a group name" spellcheck="false" autocomplete="off">
          <button class="btn sm" id="alDepGroupFind" ${d.busy ? "disabled" : ""}>${d.busy === "groups" ? "Searching…" : "Find"}</button>
        </div>
        ${d.groups ? (d.groups.length ? `<ul class="mini al-dep-groups">${d.groups.map((g) => `<li><button class="btn sm al-dep-pick" data-id="${escq(g.id)}" data-name="${escq(g.displayName)}">${escq(g.displayName)}</button>${g.membershipRule ? ` <span class="tag new" title="A dynamic group — its membership can change without anyone touching this assignment">dynamic</span>` : ""}</li>`).join("")}</ul>`
          : `<p class="mini muted">No group starts with that.</p>`) : ""}
        ${d.picked ? `<div class="al-dep-confirm">
            <b>Assign ${escq(createdFor("audit").displayName)} to ${escq(d.picked.displayName)}?</b>
            <div class="mini" style="margin-top:2px">${d.picked.count == null ? "Member count could not be read." : `<b>${escq(String(d.picked.count))}</b> member${d.picked.count === 1 ? "" : "s"} will get this policy at their next sync.`}</div>
            <div class="al-dep-row" style="margin-top:6px">
              <button class="btn primary sm" id="alDepAssign" ${d.busy ? "disabled" : ""}>${d.busy === "assign" ? "Assigning…" : "Yes, assign it"}</button>
              <button class="btn sm" id="alDepCancel">Cancel</button>
            </div>
          </div>` : ""}`}
      </div>` : ""}

      <div class="al-dep-sub">
        <b class="mini">Then, later — the Enforce profile</b>
        ${blocked
          ? `<p class="mini al-dep-locked"><b>Not yet.</b> ${escq(blocked)}</p>
             <button class="btn sm" disabled>🔒 Create the Enforce profile</button>`
          : `<p class="mini">The audit profile is in this tenant and the uploaded scan shows nothing blocked and nothing that would have been. Same grouping, so it replaces the audit profile on the device rather than sitting alongside it.</p>
             <div class="al-dep-row"><button class="btn primary sm" id="alDepEnforce" ${d.busy ? "disabled" : ""}>${d.busy === "enforce" ? "Creating…" : "🚀 Create the Enforce profile"}</button></div>`}
        ${createdFor("enforce") ? `<div class="al-dep-ok">Created ${escq(createdFor("enforce").displayName)} — id <code>${escq(createdFor("enforce").id)}</code>, assigned to nobody. Assign it in the portal when the pilot has held.</div>` : ""}
      </div>

      <p class="mini muted" style="margin:8px 0 0">Whatever happens here, the <b>Application Identity</b> service still has to be running on the targets or AppLocker does nothing and logs nothing — and removing the assignment is the way back, so test that on the pilot group before the estate depends on it.</p>
    </div>`;

    wireDeploy();
  }

  function depFail(e) {
    deployState.busy = "";
    deployState.error = (e && e.name === "GraphError") ? e : { kind: "graph", message: (e && e.message) || String(e), code: "" };
    renderDeploy();
  }

  async function deployProfile(mode) {
    const d = deployState;
    d.error = null;
    d.busy = mode === "Audit" ? "audit" : "enforce";
    renderDeploy();
    try {
      // Read before write, every time — the tenant may have changed since
      // the last look, and this is the check that stops an overwrite.
      const existing = await Graph.customProfiles();
      const coll = Graph.collisions(existing, intuneProfileName(mode), intuneGrouping());
      d.checked = {
        collisions: coll,
        auditInTenant: existing.some((p) => (p.displayName || "").toLowerCase() === intuneProfileName("Audit").toLowerCase()),
      };
      if (coll.length) { d.busy = ""; renderDeploy(); return; }
      const made = await Graph.createProfile(intuneProfile(mode));
      // Tagged with what it was created under, so it stops counting the
      // moment the name or grouping on screen changes.
      made._name = intuneProfileName(mode);
      made._grouping = intuneGrouping();
      d.created = Object.assign({}, d.created, mode === "Audit" ? { audit: made } : { enforce: made });
      d.busy = "";
      renderDeploy();
    } catch (e) { depFail(e); }
  }

  function wireDeploy() {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on("alDepAudit", "click", () => deployProfile("Audit"));
    on("alDepEnforce", "click", () => deployProfile("Enforce"));
    on("alDepCancel", "click", () => { deployState.picked = null; renderDeploy(); });
    on("alDepGroupFind", "click", async () => {
      const q = ($("alDepGroupQ") || {}).value || "";
      if (!q.trim()) return;
      deployState.busy = "groups"; deployState.error = null; renderDeploy();
      try {
        deployState.groups = await Graph.searchGroups(q.trim());
        deployState.busy = "";
        renderDeploy();
        const box = $("alDepGroupQ"); if (box) { box.value = q; box.focus(); }
      } catch (e) { depFail(e); }
    });
    document.querySelectorAll(".al-dep-pick").forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.id, displayName = b.dataset.name;
      deployState.picked = { id, displayName, count: null };
      renderDeploy();
      // Best effort: a member count TUNO cannot read must not stop the
      // assignment, but it must not be reported as zero either.
      try { deployState.picked.count = Number(await Graph.memberCount(id)); } catch { deployState.picked.count = null; }
      renderDeploy();
    }));
    on("alDepAssign", "click", async () => {
      const d = deployState;
      if (!d.picked || !createdFor("audit")) return;
      d.busy = "assign"; d.error = null; renderDeploy();
      try {
        await Graph.assignProfile(createdFor("audit").id, d.picked.id);
        d.assigned = { groupName: d.picked.displayName, count: d.picked.count };
        d.picked = null; d.busy = "";
        renderDeploy();
      } catch (e) { depFail(e); }
    });
  }

  return { init };
})();

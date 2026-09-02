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

  // Is this collection actually restricting anything on the endpoint?
  //
  // "NotConfigured" is the trap: it does NOT mean off. Microsoft — "if any rules
  // exist in a rule collection that is 'not configured', the rules WILL be
  // enforced unless a policy with a higher precedence changes the enforcement
  // mode to Audit only." So a NotConfigured collection carrying rules behaves as
  // Enabled, and only an empty one lets everything through. Every evaluation in
  // this tool goes through here rather than testing the string, because getting
  // this backwards means telling an admin nothing is blocked while it is.
  const isEnforcing = (col) => !!col && (col.mode === "Enabled" || col.mode === "AuditOnly" || (col.mode === "NotConfigured" && col.rules.length > 0));
  const blocksOnMatch = (col) => !!col && (col.mode === "Enabled" || (col.mode === "NotConfigured" && col.rules.length > 0));
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
  // 10557: browser edits never travel into a scan. Count them, and when a
  // bundle load throws them away, say so where the bundle is described —
  // Mihai clicked the same three coverage fixes after every scan and asked
  // why the next scan "kept saying blocked".
  let editsSinceLoad = 0;
  let discardedEdits = 0;
  let findings = [];
  let coverage = [];
  let sevFilter = "all";
  let importedXmlName = "";
  let undoState = null;     // { snapshot, label } — one step back, see mutate()
  let fixOpen = null;       // findingKey() of the finding whose editor is open
  let shownFindings = [];   // the filtered rows render() last drew, for handlers
  let scan = null;          // the uploaded TUNO scan bundle, or null
  let scanSource = "";      // "generated-audit" | "generated-enforce" | "effective"
  let eventsEvidence = null; // the uploaded tuno.applocker.events bundle, or null.
  // Kept when the policy changes: the verdict column is computed LIVE against
  // whatever draft is on screen, so the evidence stays truthful across edits.
  let pane = "xml";         // which artefact the code panel is showing
  // The grouping default is GENERATED, not a word. Microsoft's guidance is that
  // groupings must be unique (removal breaks on duplicates — the CSP deletes
  // duplicate URIs) and recommends a random GUID; a bare GUID, though, is
  // unreadable in the cleanup log and the carry-over findings, so the house
  // format is a recognisable prefix plus the GUID. Deliberately NOT "Pilot" or
  // "Production": that distinction lives in the ASSIGNMENT (which group the one
  // profile is assigned to) and the MODE (audit or enforce, edited in place) —
  // encoding it in the grouping name is how two groupings end up merged on a
  // device that saw both.
  const newGrouping = () => "AppLocker-" + newGuid();
  // grouping is filled in just below newGuid's definition — calling it here
  // would be a use-before-init on the const.
  // The default carries the house naming scheme IN FULL, mode token included —
  // the field then shows exactly the name Intune will get, and the R/V release
  // suffix is edited in place rather than living in code. intuneProfileName()
  // swaps the (AuditOnly)/(Enforced) token for the mode being exported.
  const intuneCfg = { displayName: "Win - SEC - Device Security - AppLocker (AuditOnly) - R27.1 - V4.0", grouping: "", mode: "Audit" };

  // AppLocker rule-collection Type → the segment the AppLocker CSP expects in the
  // OMA-URI. Anything not in here has no CSP node and cannot be shipped by Intune.
  const OMA_TYPE = { Exe: "EXE", Msi: "MSI", Script: "Script", Dll: "DLL", Appx: "StoreApps" };
  const SCAN_SCHEMA_PREFIX = "tuno.applocker.scan/";
  // The fleet events bundle Get-TunoAppControlEvents.ps1 writes — same entry
  // shape as the scan bundle's events section, harvested from many devices by
  // the collection Remediation rather than from one reference machine.
  const EVENTS_SCHEMA_PREFIX = "tuno.applocker.events/";

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
  // THE GPO XML NEVER CARRIES AN EMPTY NotConfigured COLLECTION (10553). The
  // audit already flags one as High; the export now refuses it too, because
  // Microsoft documents the exact failure: Intune's Managed Installer policy
  // merges an AppLocker policy with a dummy rule into whatever is on the
  // device, and an empty NotConfigured collection merged with that one rule
  // becomes "NotConfigured with rules" — which AppLocker ENFORCES. Anything
  // not the dummy rule is then blocked, up to and including sign-in. The
  // collection is dropped from the file (absence is the only inert state);
  // a NotConfigured collection that carries rules is left as it is — that is
  // an audit finding for the admin to decide, not a silent rewrite.
  function exportableCollections() {
    return policy.collections.filter((c) => !(c.mode === "NotConfigured" && !c.rules.length));
  }
  function exportXml() {
    const lines = ['<AppLockerPolicy Version="1">'];
    for (const col of exportableCollections()) lines.push(...collectionLines(col, "  "));
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
  // DLL is OMITTED from the profile whatever the chosen mode (see intuneProfile
  // — this comment used to say "forced to NotConfigured", which the code never
  // did after the NotConfigured trap was understood). AppLocker evaluates every
  // DLL load: Enabled cripples the endpoint and even AuditOnly buries the event
  // log under Microsoft-signed System32 libraries, EDR AMSI providers and .NET
  // native images. Absence is the only inert state.
  // ================================================================
  let groupingMinted = false;
  const intuneGrouping = () => {
    // Minted ONCE, on first read (see the note at intuneCfg) — not at module
    // load, and never again after: a user who clears the field is saying
    // something, and refilling it would fight them mid-edit and make the
    // empty-grouping issue unreachable. The form input is synced here because
    // bind() copied the value before the mint existed.
    if (!intuneCfg.grouping && !groupingMinted) {
      groupingMinted = true;
      intuneCfg.grouping = newGrouping();
      const inp = document.getElementById("alIntuneGrouping");
      if (inp && !inp.value) inp.value = intuneCfg.grouping;
    }
    return (intuneCfg.grouping || "").replace(/\s+/g, "");
  };

  // The trailing version token in the house profile name — V4.0, v3.8,
  // V4.0.1 — incremented per loop iteration: two segments gain a third
  // (V4.0 → V4.0.1), three or more increment the last (V4.0.1 → V4.0.2).
  // The case of the V is kept; a name with no token is returned unchanged,
  // because inventing a version is worse than not having one.
  function bumpVersionInName(name) {
    const m = /^(.*[\s-][Vv])(\d+(?:\.\d+)*)$/.exec(String(name || "").trim());
    if (!m) return name;
    const seg = m[2].split(".");
    if (seg.length < 3) seg.push("1");
    else seg[seg.length - 1] = String(Number(seg[seg.length - 1]) + 1);
    return m[1] + seg.join(".");
  }

  function intuneProfileName(mode) {
    const base = (intuneCfg.displayName || "AppLocker").trim();
    const token = mode === "Enforce" ? "(Enforced)" : "(AuditOnly)";
    // The name field holds the FULL house name with the mode token inline
    // (Win - SEC - … - AppLocker (AuditOnly) - R27.1 - V4.0). Swap whichever
    // token it contains for the mode being exported, so Audit and Enforce still
    // get distinct names from one field — the collision checks depend on that.
    // A name without a token keeps the old behaviour: token appended at the end.
    if (/\((?:AuditOnly|Enforced)\)/i.test(base)) return base.replace(/\((?:AuditOnly|Enforced)\)/gi, token);
    return `${base} ${token}`;
  }

  function intuneProfile(mode) {
    const grouping = intuneGrouping();
    const target = mode === "Enforce" ? "Enabled" : "AuditOnly";
    const omaSettings = [];
    for (const col of policy.collections) {
      const omaType = OMA_TYPE[col.type];
      if (!omaType) continue;
      // DLL is OMITTED, not shipped as NotConfigured. Microsoft: "if any rules
      // exist in a rule collection that is 'not configured', the rules WILL be
      // enforced". Shipping DLL rules that way would enforce DLL control against
      // whatever the policy happened to contain — the opposite of the intent.
      // Absence is the only inert state.
      if (col.type === "Dll") continue;
      const collectionMode = target;
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
    // A hand-reusable word is exactly what produces two profiles sharing a
    // grouping — the case Microsoft says breaks removal. Warn, do not block:
    // the field is editable precisely so a deliberate choice stays possible.
    else if (/^(pilot|prod|production|test|tst|acc|acceptance|audit|auditonly|enforce|enforced|applocker|default|standard)$/i.test(intuneGrouping())) {
      out.push({ sev: "Medium", text: `The grouping '${intuneGrouping()}' is the kind of name that gets typed again. Groupings must be unique per profile — two profiles sharing one write the same CSP addresses, and unassigning one can delete the nodes the other depends on. Use the generated 'AppLocker-<guid>' (the ↻ button mints a fresh one); the pilot/production distinction belongs in the assignment and the mode, not in this name.` });
    }
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
    // 10553: writable FILES inside admin-only directories. Absent on older
    // bundles and on -SkipWritableFiles runs — the card says "not checked"
    // then, rather than the "0" that would read as a clean bill.
    b.writableFilesChecked = Array.isArray(b.writableFiles) && b.writableFilesChecked !== false;
    b.writableFiles = Array.isArray(b.writableFiles) ? b.writableFiles : [];
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
  // Does this bundle's generated set predate the Microsoft coverage rules
  // (script 1.10.0)? Read from the flag the script writes; fall back to the
  // script version for bundles written before the flag existed.
  function scanPredatesCoverage(b) {
    if (!b || !b.generatedPolicy || !b.generatedPolicy.auditXml) return false;
    if (typeof b.generatedPolicy.microsoftCoverage === "boolean") return false;
    const v = String((b.generator && b.generator.version) || "0").split(".").map((x) => parseInt(x, 10) || 0);
    return (v[0] || 0) < 1 || ((v[0] || 0) === 1 && (v[1] || 0) < 10);
  }
  const SCAN_SOURCE_LABEL = {
    "generated-audit": "the rule set the scan generated, in AuditOnly",
    "generated-enforce": "the rule set the scan generated, Enforced",
    "effective": "the policy the device was actually running",
  };

  // ================================================================
  // FLEET EVENTS BUNDLE — Get-TunoAppControlEvents.ps1 output
  // ================================================================
  function parseEventsBundle(b, sourceName) {
    const ev = (b && typeof b.events === "object" && b.events) || {};
    ev.entries = Array.isArray(ev.entries) ? ev.entries : [];
    ev.summary = (ev.summary && typeof ev.summary === "object") ? ev.summary : {};
    return {
      sourceName: sourceName || "",
      machine: (b.machine && typeof b.machine === "object") ? b.machine : {},
      generator: (b.generator && typeof b.generator === "object") ? b.generator : {},
      events: ev,
      codeIntegrity: (b.codeIntegrity && typeof b.codeIntegrity === "object") ? b.codeIntegrity : {},
      warnings: Array.isArray(b.warnings) ? b.warnings : [],
    };
  }

  // Which collection judges an event? The log names the family; the extension
  // splits EXE-and-DLL and MSI-and-Script into their actual collections.
  function eventCollectionType(en) {
    const log = String(en.log || "");
    const ext = ((/\.([a-z0-9]+)$/i.exec(String(en.path || "")) || [])[1] || "").toLowerCase();
    if (/packaged app/i.test(log)) return "Appx";
    if (/msi and script/i.test(log)) return (ext === "msi" || ext === "msp" || ext === "mst") ? "Msi" : "Script";
    if (/exe and dll/i.test(log)) return ext === "dll" ? "Dll" : "Exe";
    return "Exe";
  }

  // What the CURRENT draft would do with this event's file — same standard-user
  // model as evaluateProbePath: broad-audience allow rules only (a rule scoped
  // to some group proves nothing about an arbitrary user), deny beats allow,
  // exceptions honoured, all via the same matcher the rest of the tool uses.
  function draftVerdictForEvent(en) {
    if (!policy) return { s: "no-policy", text: "no policy loaded" };
    const type = eventCollectionType(en);
    const col = policy.collections.find((c) => c.type === type);
    if (!col || !col.rules.length) return { s: "no-rules", text: `the draft has no ${type} rules — nothing of this type is restricted` };
    const art = { path: String(en.path || ""), publisher: { name: en.publisher || "", product: en.product || "*", binary: en.binary || "*" } };
    // Events carry a FileHash where coverage artifacts do not, so hash
    // conditions are matched HERE and only here — ruleMatchesArtifact stays
    // hash-blind on purpose (nothing else has a hash to compare). Without
    // this, closing a gap with a hash rule would leave the row reading as a
    // gap forever. FileHashRule has no Exceptions element in the schema, so
    // there is no carve-out to honour.
    const norm = (x) => String(x || "").replace(/^SHA256\s*/i, "").replace(/^0x/i, "").toLowerCase();
    const evHash = norm(en.hash);
    const hits = (r) => !!ruleMatchesArtifact(r, art)
      || (!!evHash && r.conditions.some((c) => c.kind === "hash" && (c.hashes || []).some((h) => norm(h.data) === evHash)));
    for (const r of col.rules) {
      if (r.action !== "Allow" || isAdminSid(r.sid) || !isBroadSid(r.sid)) continue;
      if (hits(r)) {
        const denied = col.rules.some((d) => d.action === "Deny" && principalCovers(d.sid, r.sid) && hits(d));
        if (!denied) return { s: "allowed", text: `would run — allowed by “${r.name}”`, rule: r };
      }
    }
    return { s: "blocked", text: col.mode === "AuditOnly" ? "audited under the draft — blocked once enforced" : "stays blocked under the draft" };
  }

  // One row per (file, verdict), counted — a fleet bundle repeats the same
  // OneDrive updater ten thousand times and nobody reads ten thousand rows.
  function aggregateFleetEvents(entries) {
    const m = new Map();
    for (const en of entries) {
      if (en.verdict !== "Blocked" && en.verdict !== "Audited") continue;
      const key = (en.path || en.binary || en.eventId || "?") + "|" + en.verdict;
      let row = m.get(key);
      if (!row) {
        row = { path: String(en.path || ""), verdict: en.verdict, publisher: en.publisher || "", product: en.product || "",
          binary: en.binary || "", signed: !!en.signed, count: 0, users: new Set(), ids: new Set(), sample: en };
        m.set(key, row);
      }
      row.count++;
      if (en.userSid) row.users.add(en.userSid);
      if (en.eventId != null) row.ids.add(en.eventId);
    }
    return [...m.values()].sort((a, b) => (a.verdict === b.verdict ? b.count - a.count : a.verdict === "Blocked" ? -1 : 1));
  }

  // The recommendation, which is the point of the exercise. Two questions per
  // row: does the DRAFT already cover it (then the block belonged to the old
  // policy and there is nothing to do), and if not, does it LOOK like the
  // policy working (user-writable origin) or like a missing rule (machine
  // space)? Publisher rules are recommended over paths every time the file is
  // signed — a path into a profile is the hole AppLocker exists to close.
  function fleetEventRecommendation(row, dv) {
    if (dv.s === "no-policy") return "Load the policy draft (scan bundle or XML) and this column fills in.";
    if (dv.s === "allowed") return "Covered — nothing to add. The event came from the OLD policy on that device.";
    if (dv.s === "no-rules") return "Undecided in the draft: with no rules for this type, nothing is restricted. Decide the collection before enforcing.";
    const userArea = /(^|%OSDRIVE%|[a-z]:)\\users\\/i.test(row.path || "");
    if (userArea) {
      return row.signed
        ? "Stays blocked — it ran from a user-writable area, which is what this policy exists to stop. If the business needs it, deploy it to machine space or allow it by PUBLISHER; never a path into the profile."
        : "Stays blocked — unsigned, from a user-writable area. That is the policy working. Establish what it is before even considering a rule.";
    }
    return row.signed
      ? "Would still be blocked — likely a missing rule. It is signed: add a publisher rule."
      : "Would still be blocked and is UNSIGNED outside user space — add a hash rule only if it is legitimate, and ask why it is unsigned.";
  }

  // GAP / BY DESIGN / COVERED / UNDECIDED — the classification the gap report
  // and the fix buttons hang off. A "gap" is a file the fleet actually tried
  // to run that the draft would STILL block and that does not look like the
  // policy doing its job — machine space, not a user profile. A user-profile
  // block is BY DESIGN: closing it is a business decision, not a repair, so it
  // gets an offer worded as one rather than a recommendation.
  function fleetRowClass(row, dv) {
    // DLL events are SET ASIDE, not undecided — the generated policies omit
    // the DLL collection deliberately (absence is the only state that
    // restricts nothing), so every DLL load in the log is the record of that
    // decision, not a question waiting for an answer. They only classify
    // normally when the draft actually carries DLL rules, i.e. when somebody
    // has chosen to police DLL loads on purpose.
    if (eventCollectionType(row.sample) === "Dll") {
      const dllCol = policy && policy.collections.find((c) => c.type === "Dll");
      if (!dllCol || !dllCol.rules.length) return "dll";
    }
    if (dv.s === "no-policy" || dv.s === "no-rules") return "undecided";
    if (dv.s === "allowed") return "covered";
    return /(^|%OSDRIVE%|[a-z]:)\\users\\/i.test(row.path || "") ? "bydesign" : "gap";
  }

  // Which rule closes this row, best evidence first: PUBLISHER when the event
  // carries a signer (survives updates, follows the signer), HASH when it
  // carries only a hash (goes stale on the next file update, and says so),
  // exact PATH as the last resort (weak, and the rule's description says to
  // replace it). Never a directory path — a directory allow from event
  // evidence is how the hole gets rebuilt.
  function fleetFixPlan(row) {
    const type = eventCollectionType(row.sample);
    if (row.signed && row.publisher) return { kind: "publisher", type, label: "Allow by publisher" };
    if (String((row.sample && row.sample.hash) || "").trim()) return { kind: "hash", type, label: "Allow by hash" };
    if (row.path) return { kind: "path", type, label: "Allow this exact path" };
    return null;
  }

  function addFixForFleetRow(row) {
    const plan = fleetFixPlan(row);
    if (!plan) return false;
    const col = ensureCollection(plan.type);
    const base = row.binary || (row.path ? String(row.path).split("\\").pop() : "file");
    const name = `${BRANDING.name}: allow ${base} (fleet gap)`;
    if (col.rules.some((r) => r.name === name)) return false;
    const desc = `Closed from the fleet events evidence: ${row.count} ${String(row.verdict).toLowerCase()} event(s) for ${row.path || base}.`;
    if (plan.kind === "publisher") {
      col.rules.push(mkRule("FilePublisherRule", name, "S-1-1-0", "Allow",
        [{ kind: "publisher", publisher: row.publisher, product: row.product && row.product !== "-" ? row.product : "*", binary: "*", low: "*", high: "*" }],
        desc + " Publisher rule — survives updates, follows the signer."));
    } else if (plan.kind === "hash") {
      let h = String(row.sample.hash || "").replace(/^SHA256\s*/i, "").trim();
      if (!/^0x/i.test(h)) h = "0x" + h;
      col.rules.push(mkRule("FileHashRule", name, "S-1-1-0", "Allow",
        [{ kind: "hash", hashes: [{ type: "SHA256", data: h, file: base, length: "0" }] }],
        desc + " Hash rule from the event's FileHash — it goes STALE on the file's next update. SourceFileLength is 0 because the event does not carry it."));
    } else {
      col.rules.push(mkRule("FilePathRule", name, "S-1-1-0", "Allow",
        [{ kind: "path", path: row.path }],
        desc + " Exact-path rule, the weakest shape — the file was unsigned and the event carried no hash. Replace it with a publisher or hash rule once the file is in hand."));
    }
    return true;
  }

  // The gap report — the same judgement the card shows, as a document that can
  // sit in the change ticket: what the fleet ran into, what the draft already
  // answers, what stays blocked on purpose, and what needs a decision.
  function fleetGapReport() {
    const ev = eventsEvidence.events || {};
    const s = ev.summary || {};
    const ci = eventsEvidence.codeIntegrity || {};
    const m = eventsEvidence.machine || {};
    const rows = aggregateFleetEvents(ev.entries || []);
    const cls = { gap: [], bydesign: [], covered: [], undecided: [], dll: [] };
    for (const row of rows) {
      const dv = draftVerdictForEvent(row.sample);
      cls[fleetRowClass(row, dv)].push({ row, dv });
    }
    const cell = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const L = [];
    L.push(`# App Control gap report — ${m.name || "unknown device"}`);
    L.push("");
    L.push(`Generated by ${BRANDING.name} ${APP_BUILD.label} on ${new Date().toISOString().slice(0, 10)}, from ${eventsEvidence.sourceName || "an events bundle"} (${ev.daysBack || m.daysBack || "?"}-day window) judged against **${importedXmlName || "the loaded policy"}**.`);
    L.push("");
    L.push(`| | Count |`);
    L.push(`|---|---|`);
    L.push(`| Fleet events — blocked / audited / allowed | ${s.blocked ?? "?"} / ${s.audited ?? "?"} / ${s.allowed ?? "?"} |`);
    L.push(`| Distinct denied files | ${rows.length} |`);
    L.push(`| **GAPS — would still be blocked, machine space** | **${cls.gap.length}** |`);
    L.push(`| Blocked by design — user-writable origin | ${cls.bydesign.length} |`);
    L.push(`| Covered — the draft already allows it | ${cls.covered.length} |`);
    L.push(`| Undecided — no rules for the type${policy ? "" : " (no policy loaded)"} | ${cls.undecided.length} |`);
    L.push(`| DLL — set aside (the draft omits DLL on purpose) | ${cls.dll.length} |`);
    L.push(`| WDAC CodeIntegrity 3076 audit / 3077 block | ${ci.audit3076 ?? 0} / ${ci.block3077 ?? 0} |`);
    L.push("");
    const table = (list, withFix) => {
      L.push(`| File | Publisher | Events | Users | Under the draft |${withFix ? " Suggested fix |" : ""}`);
      L.push(`|---|---|---|---|---|${withFix ? "---|" : ""}`);
      for (const { row, dv } of list) {
        const plan = withFix ? fleetFixPlan(row) : null;
        L.push(`| ${cell(row.path || row.binary || "(no path)")} | ${cell(row.publisher || "unsigned")} | ${row.count}× ${row.verdict} | ${row.users.size} | ${cell(dv.text)} |${withFix ? ` ${plan ? cell(plan.label + " (" + plan.type + ")") : "no evidence to build a rule from"} |` : ""}`);
      }
      L.push("");
    };
    L.push(`## Gaps — need a decision before enforcing (${cls.gap.length})`);
    L.push("");
    if (!cls.gap.length) L.push("None. Every denied file is either covered by the draft or blocked by design.");
    else table(cls.gap, true);
    L.push("");
    L.push(`## Blocked by design (${cls.bydesign.length})`);
    L.push("");
    L.push("These ran from user-writable locations — the population AppLocker exists to stop. Allowing one is a business decision; if taken, deploy the software to machine space or allow it by publisher, never by a path into a profile.");
    L.push("");
    if (cls.bydesign.length) table(cls.bydesign, false);
    L.push(`## Covered by the draft (${cls.covered.length})`);
    L.push("");
    if (cls.covered.length) table(cls.covered, false);
    else L.push("None.");
    if (cls.undecided.length) {
      L.push("");
      L.push(`## Undecided (${cls.undecided.length})`);
      L.push("");
      L.push(policy ? "The draft has no rules for these types — nothing is restricted, so there is no verdict to give. Decide the collections before enforcing." : "No policy is loaded — load the draft this evidence should be judged against and regenerate this report.");
      L.push("");
      table(cls.undecided, false);
    }
    if (cls.dll.length) {
      L.push("");
      L.push(`## DLL — set aside (${cls.dll.length})`);
      L.push("");
      L.push("The draft omits the DLL collection deliberately: AppLocker evaluates every DLL load, and absence is the only state that restricts nothing. These events are the record of that decision, not gaps. They would classify normally only if the draft carried DLL rules.");
      L.push("");
      table(cls.dll, false);
    }
    // Microsoft app coverage rides in EVERY gap report (Mihai's rule): the
    // report is the change-ticket document, and "can a standard user still
    // run OneDrive" belongs in the same envelope as the gaps.
    L.push("");
    L.push(`## Microsoft app coverage`);
    L.push("");
    if (!policy || !coverage.length) {
      L.push("No policy loaded when this report was generated — load the draft and regenerate for the coverage verdicts.");
    } else {
      L.push(`| App | Verdict | Detail |`);
      L.push(`|---|---|---|`);
      for (const row of coverage) {
        const v = row.result;
        const det = v.status === "unenforced" ? v.detail
          : (v.perArt || []).map((a) => `${a.art.path.split("\\").pop()} — ${a.status}${a.rule ? ` via “${a.rule.name}”` : ""}`).join("; ");
        L.push(`| ${cell(row.app.name)} | ${cell(v.status)}${v.audit ? " (audit)" : ""} | ${cell(det)} |`);
      }
    }
    if ((eventsEvidence.warnings || []).length) {
      L.push("");
      L.push(`## What the collector could not see`);
      L.push("");
      for (const w of eventsEvidence.warnings) L.push(`- ${w}`);
    }
    L.push("");
    return L.join("\n");
  }

  // One classification pass over the whole bundle — the loop strip, the chips
  // and the gap report all read THIS, so their numbers cannot disagree.
  function fleetGapStats() {
    if (!eventsEvidence) return null;
    const rows = aggregateFleetEvents((eventsEvidence.events || {}).entries || []);
    const out = { rows: rows.length, gap: 0, bydesign: 0, covered: 0, undecided: 0, dll: 0 };
    for (const row of rows) {
      const c = fleetRowClass(row, draftVerdictForEvent(row.sample));
      out[c]++;
    }
    return out;
  }

  // The fleet's GAPS as FINDINGS — same table, same fix framework as every
  // other verdict. The two tables used to say the same kind of thing about
  // the same files in two places; an admin does not care whether the audit or
  // the fleet proved a file needs a decision, only that it does. Only gaps
  // become findings: covered is nothing to do, by-design is the policy
  // working, set-aside DLL is a decision already made — those stay as counts
  // on the evidence card and sections in the gap report.
  function analyzeFleetEvents() {
    const out = [];
    if (!eventsEvidence || !policy) return out;
    const rows = aggregateFleetEvents((eventsEvidence.events || {}).entries || []);
    // Gaps per collection first: a handful get a row and a fix each, a FLOOD
    // collapses into ONE finding with an expandable list. The flood is real —
    // one rule in a collection makes AppLocker enforce the whole collection,
    // so five DLL hash allows wake every other DLL load as a would-block —
    // but two hundred rows of it is a scroll, not a finding. Reported from
    // real use, verbatim: "now I have a whole list to scroll".
    const FLOOD = 8;
    const gapsByCol = new Map();
    for (const row of rows) {
      const dv = draftVerdictForEvent(row.sample);
      if (fleetRowClass(row, dv) !== "gap") continue;
      const t = eventCollectionType(row.sample);
      if (!gapsByCol.has(t)) gapsByCol.set(t, []);
      gapsByCol.get(t).push(row);
    }
    for (const [colType, colRows] of gapsByCol) {
      if (colRows.length > FLOOD) {
        const events = colRows.reduce((n, r2) => n + r2.count, 0);
        out.push({
          sev: "High", source: "fleet", collection: colType, ruleType: "(fleet)",
          rule: `${colRows.length} fleet-denied files`,
          cond: "",
          reason: `${colRows.length} distinct files (${events} events) would still be blocked from machine space under this draft. The ${colType} collection carries rules, so AppLocker enforces the WHOLE collection — everything not allowed is a block.`,
          rec: colType === "Dll"
            ? "Allowing DLLs one hash at a time is not a policy. Decide whether Dll should be governed at all: if not, remove the Dll rules and these return to set-aside; if yes, plan publisher-level allows for the platform. The list is expandable below."
            : "Work the list below by publisher where files are signed — one publisher rule closes many of these at once. The list is expandable below.",
          fleetGroup: colRows,
        });
        continue;
      }
      for (const row of colRows) {
        const plan = fleetFixPlan(row);
        out.push({
        sev: "High", source: "fleet",
        collection: eventCollectionType(row.sample),
        rule: row.binary || (row.path ? String(row.path).split("\\").pop() : "(fleet event)"),
        principal: row.publisher || "unsigned",
        cond: row.path || "",
        reason: `${row.count}× ${String(row.verdict).toLowerCase()} across the fleet window${row.users.size ? ` (${row.users.size} user${row.users.size === 1 ? "" : "s"})` : ""} — and the draft would still block it, from machine space.`,
        rec: plan ? (plan.kind === "publisher" ? "Signed — allow it by publisher, the rule that survives updates."
          : plan.kind === "hash" ? "Unsigned — allow by the event's hash. Hash rules go stale on the file's next update."
          : "Allow this exact path as a stopgap, then replace it with a publisher or hash rule.")
          : "The event carries no publisher, hash or path — no rule can be built from it. Decide by hand.",
          fix: plan ? { kind: "fleetAllow", row } : null,
        });
      }
    }
    return out;
  }

  // ---- pulling the deployed policy FROM THE TENANT ----
  //
  // The mid-loop return carries only the events bundle; the policy it should
  // be judged against is not a file on anyone's disk — it is the profile in
  // the tenant. So the evidence card can fetch it: list the custom profiles,
  // keep the ones carrying AppLocker OMA-URIs, and rebuild the policy from
  // the RuleCollection values they hold. The profile's NAME and GROUPING are
  // adopted into the Intune form, so a later export is an edit of the same
  // profile in place — and the deploy panel's collision stop will refuse to
  // create a duplicate beside it, which is exactly right.
  let evTenant = { busy: false, list: null, error: "" };

  const APPLOCKER_OMA_RE = /\/applocker\/applicationlaunchrestrictions\/([^/]+)\//i;
  const appLockerProfilesOf = (profiles) => profiles.filter((p) => (p.omaSettings || []).some((s) => APPLOCKER_OMA_RE.test(String(s.omaUri || ""))));

  // The policy a custom profile carries, rebuilt from its RuleCollection
  // values. Shared by adopt (which REPLACES the draft with it) and by the
  // compare (which holds it up beside the draft) — one reader, one answer.
  function policyOfProfile(p) {
    const settings = (p.omaSettings || []).filter((s) => APPLOCKER_OMA_RE.test(String(s.omaUri || "")));
    const values = settings.map((s) => String(s.value || "")).filter((v) => /<RuleCollection/i.test(v));
    if (!values.length) throw new Error("That profile's AppLocker settings carry no readable RuleCollection values — Graph may have withheld them. Export the policy from the portal instead.");
    const xml = `<AppLockerPolicy Version="1">\n${values.join("\n")}\n</AppLockerPolicy>`;
    return parsePolicy(xml, p.displayName || "tenant profile");
  }

  // ================================================================
  // COMPARE — the deployed profile against what TUNO would write (10560,
  // Mihai: "compare Intune policies vs to-be-deployed, only show the
  // differences"). The to-be-deployed side is NOT the draft as edited: it
  // is the Intune profile the deploy would send — same serialiser, same
  // mode, Dll omitted — parsed back the way a tenant profile is. Comparing
  // the draft itself would report differences the deploy never makes (the
  // Dll collection, an EnforcementMode the deploy overrides).
  //
  // A rule is the same rule when its Id matches; a rule whose Id the other
  // side lacks is matched by name + condition, because an export from the
  // portal re-mints Ids and the same rule must not read as a removal plus
  // an addition. What is compared is what AppLocker enforces: action,
  // principal, conditions, exceptions. A name or description change alone
  // is reported as a rename, never as a rule change.
  // ================================================================
  const condSig = (c) => !c ? "" : c.kind === "path" ? `path:${String(c.path || "").toLowerCase()}`
    : c.kind === "publisher" ? `pub:${[c.publisher, c.product, c.binary, c.low, c.high].map((x) => String(x || "*").toLowerCase()).join("|")}`
    : c.kind === "hash" ? `hash:${(c.hashes || []).map((h) => String(h.data || "").toLowerCase()).sort().join(",")}` : "?";
  const ruleSig = (r) => [r.action, r.sid, (r.conditions || []).map(condSig).sort().join(";"), (r.exceptions || []).map(condSig).sort().join(";")].join("#");
  const condText = (c) => !c ? "" : c.kind === "path" ? c.path
    : c.kind === "publisher" ? `${c.publisher} · ${c.product} · ${c.binary} [${c.low},${c.high}]`
    : c.kind === "hash" ? `${(c.hashes || []).length} hash(es)${(c.hashes || [])[0] && c.hashes[0].file ? ` — ${c.hashes[0].file}` : ""}` : "";
  function diffPolicies(deployed, draft) {
    const types = [...new Set([...(deployed.collections || []).map((c) => c.type), ...(draft.collections || []).map((c) => c.type)])];
    const out = { collections: [], added: 0, removed: 0, changed: 0, renamed: 0, modeChanges: 0 };
    for (const t of types) {
      const a = (deployed.collections || []).find((c) => c.type === t) || null;
      const b = (draft.collections || []).find((c) => c.type === t) || null;
      const col = { type: t, modeFrom: a ? a.mode : null, modeTo: b ? b.mode : null, added: [], removed: [], changed: [], renamed: [] };
      const ar = a ? a.rules.slice() : [], br = b ? b.rules.slice() : [];
      const usedB = new Set();
      for (const ra of ar) {
        let rb = br.find((x) => !usedB.has(x) && x.id && ra.id && x.id.toLowerCase() === ra.id.toLowerCase());
        if (!rb) rb = br.find((x) => !usedB.has(x) && x.name === ra.name && ruleSig(x) === ruleSig(ra));
        if (!rb) rb = br.find((x) => !usedB.has(x) && ruleSig(x) === ruleSig(ra) && x.nodeName === ra.nodeName);
        if (!rb) { col.removed.push(ra); continue; }
        usedB.add(rb);
        const what = [];
        if (ra.action !== rb.action) what.push(`action ${ra.action} → ${rb.action}`);
        if (ra.sid !== rb.sid) what.push(`principal ${sidName(ra.sid)} → ${sidName(rb.sid)}`);
        const ca = (ra.conditions || []).map(condSig).sort().join(";"), cb = (rb.conditions || []).map(condSig).sort().join(";");
        if (ca !== cb) what.push("condition");
        const ea = (ra.exceptions || []).map(condSig).sort().join(";"), eb = (rb.exceptions || []).map(condSig).sort().join(";");
        if (ea !== eb) what.push(`exceptions ${(ra.exceptions || []).length} → ${(rb.exceptions || []).length}`);
        if (what.length) col.changed.push({ before: ra, after: rb, what });
        else if (ra.name !== rb.name) col.renamed.push({ before: ra, after: rb });
      }
      for (const rb of br) if (!usedB.has(rb)) col.added.push(rb);
      const modeDiff = (a ? a.mode : "absent") !== (b ? b.mode : "absent");
      col.modeDiff = modeDiff;
      if (modeDiff || col.added.length || col.removed.length || col.changed.length || col.renamed.length) out.collections.push(col);
      out.added += col.added.length; out.removed += col.removed.length; out.changed += col.changed.length; out.renamed += col.renamed.length;
      if (modeDiff) out.modeChanges++;
    }
    out.same = !out.collections.length;
    return out;
  }
  // What the deploy would write, parsed back the way a tenant profile is —
  // so both sides of the compare went through the same reader.
  function toBeDeployedPolicy(mode) {
    return policyOfProfile(intuneProfile(mode));
  }
  function diffMarkdown(d, profileName, mode) {
    const L = [`# AppLocker — what would change in ${profileName}`, "", `_${d.same ? "No differences" : `${d.added} added · ${d.removed} removed · ${d.changed} changed · ${d.renamed} renamed · ${d.modeChanges} enforcement mode change(s)`} — deployed profile vs the ${mode} profile ${BRANDING.name} would write. Only differences are listed._`, ""];
    for (const c of d.collections) {
      L.push(`## ${COLLECTION_LABEL[c.type] || c.type}`, "");
      if (c.modeDiff) L.push(`- Enforcement mode: **${c.modeFrom || "absent"} → ${c.modeTo || "absent"}**`);
      c.added.forEach((r) => L.push(`- **+ added** ${r.name} — ${r.action} for ${sidName(r.sid)} — ${(r.conditions || []).map(condText).join("; ")}`));
      c.removed.forEach((r) => L.push(`- **− removed** ${r.name} — ${r.action} for ${sidName(r.sid)} — ${(r.conditions || []).map(condText).join("; ")}`));
      c.changed.forEach((x) => L.push(`- **~ changed** ${x.after.name} — ${x.what.join(", ")}${x.what.includes("condition") ? ` — was: ${(x.before.conditions || []).map(condText).join("; ")} — now: ${(x.after.conditions || []).map(condText).join("; ")}` : ""}`));
      c.renamed.forEach((x) => L.push(`- renamed: ${x.before.name} → ${x.after.name}`));
      L.push("");
    }
    return L.join("\n");
  }

  function adoptTenantProfile(p) {
    policy = policyOfProfile(p);
    scan = null; scanSource = "";
    importedXmlName = `${p.displayName || "profile"} — pulled from the tenant`;
    // Adopt the profile's identity so the export EDITS rather than duplicates.
    const m = APPLOCKER_OMA_RE.exec(String(settings[0].omaUri || ""));
    if (m && m[1]) intuneCfg.grouping = m[1];
    // The next export is the NEXT iteration of this profile, so its name gets
    // the next version — V4.0 in the tenant means V4.0.1 on the table. Typing
    // in the name field overrides this, and a name without a token stays put.
    if (p.displayName) intuneCfg.displayName = bumpVersionInName(p.displayName);
    // The form inputs were filled at init and do not follow intuneCfg by
    // themselves — sync them, the ↻ regroup button's own pattern, or the
    // screen keeps showing the name and grouping that just stopped being true.
    const ni = $("alIntuneName");
    if (ni) ni.value = intuneCfg.displayName;
    const gi = $("alIntuneGrouping");
    if (gi) gi.value = intuneCfg.grouping;
    loadFresh();
  }

  // Adopt only the deployed profile's IDENTITY — name (version-bumped) and
  // grouping — while the ADJUSTED draft on the table stays exactly as edited.
  // This is the mid-loop case: the rules you want are on screen, the address
  // they must land at is in the tenant. (adoptTenantProfile, by contrast,
  // REPLACES the draft with the tenant's rules.)
  function adoptTenantIdentity(p) {
    const setting = (p.omaSettings || []).find((s2) => APPLOCKER_OMA_RE.test(String(s2.omaUri || "")));
    const m = setting && APPLOCKER_OMA_RE.exec(String(setting.omaUri || ""));
    if (m && m[1]) intuneCfg.grouping = m[1];
    if (p.displayName) intuneCfg.displayName = bumpVersionInName(p.displayName);
    const ni = $("alIntuneName");
    if (ni) ni.value = intuneCfg.displayName;
    const gi = $("alIntuneGrouping");
    if (gi) gi.value = intuneCfg.grouping;
    renderCodePane();
    renderDeploy();
  }

  async function loadTenantProfiles() {
    evTenant.busy = true; evTenant.error = ""; evTenant.list = null;
    renderEventsCard();
    try {
      const all = await Graph.customProfiles();
      evTenant.list = appLockerProfilesOf(all);
    } catch (e) {
      evTenant.error = (e && e.message) || String(e);
    }
    evTenant.busy = false;
    renderEventsCard();
  }

  function renderEventsCard() {
    const host = $("alEvents");
    if (!host) return;
    if (!eventsEvidence) { host.style.display = "none"; host.innerHTML = ""; return; }
    host.style.display = "";

    const ev = eventsEvidence.events || {};
    const s = ev.summary || {};
    const ci = eventsEvidence.codeIntegrity || {};
    const m = eventsEvidence.machine || {};
    const gs = fleetGapStats() || { rows: 0, gap: 0, bydesign: 0, covered: 0, undecided: 0, dll: 0 };

    // No policy yet: the card leads with how to GET one, because that is the
    // question the person actually has at this moment — and the best answer
    // is usually sitting in the tenant.
    const noGraph = typeof Graph === "undefined";
    const signedIn = !noGraph && Graph.signedIn();
    const chooser = policy ? "" : `
      <div class="al-dep-ok" style="margin-bottom:10px"><b>Evidence loaded — now give it a policy to judge against.</b>
        <div class="mini" style="margin-top:4px">Two ways: <b>upload</b> the draft (scan bundle or policy XML, the 📂 button in step 2) — or <b>pull the deployed profile from the tenant</b>, which is where it actually lives mid-loop. Pulling adopts the profile's name and grouping, so a later export edits it in place instead of creating a twin.</div>
        <div style="margin-top:8px">
          ${noGraph ? "" : !signedIn
            ? `<span class="mini muted">Sign in (top right) and a button appears here to fetch the AppLocker profile.</span>`
            : `<button class="btn sm primary" id="alEvTenant" ${evTenant.busy ? "disabled" : ""}>${evTenant.busy ? "Reading the tenant…" : "⤓ Load the deployed AppLocker profile"}</button>`}
        </div>
        ${evTenant.error ? `<div class="al-dep-err mini" style="margin-top:8px">${esc(evTenant.error)}</div>` : ""}
        ${evTenant.list && !evTenant.list.length ? `<div class="mini muted" style="margin-top:8px">No custom profile in this tenant carries AppLocker OMA-URIs. Upload the draft instead.</div>` : ""}
        ${evTenant.list && evTenant.list.length ? `<ul class="mini al-list" style="margin-top:8px">${evTenant.list.map((p, i) => `<li><button class="btn sm al-ev-adopt" data-i="${i}">${esc(p.displayName || "(unnamed profile)")}</button>${p.lastModifiedDateTime ? ` <span class="muted">last changed ${esc(String(p.lastModifiedDateTime).slice(0, 10))}</span>` : ""}</li>`).join("")}</ul>` : ""}
      </div>`;

    const fact = (k, v) => `<div><div class="mini muted">${esc(k)}</div><div class="mini"><b>${esc(v == null || v === "" ? "—" : String(v))}</b></div></div>`;

    // ONE SUMMARY, NO SECOND TABLE. The gaps live in the Findings table with
    // everything else that needs a decision — two tables saying the same kind
    // of thing about the same files was the overview being long, said the
    // person reading it. Covered / by-design / set-aside stay as counts here
    // and as sections in the gap report.
    host.innerHTML = `
      <h3 style="margin:0 0 8px">📡 Fleet events evidence <span class="mini muted">— ${esc(eventsEvidence.sourceName || "events bundle")}</span>
        <button class="btn sm" id="alEvClear" style="float:right;margin-left:6px" title="Take this events evidence off the table. The policy stays.">✕ Clear</button>
        ${gs.rows ? `<button class="btn sm" id="alEvGapDl" style="float:right" title="Download the gap report as Markdown — summary, every section in detail, a suggested fix per gap">⭳ Gap report</button>` : ""}</h3>
      ${chooser}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:10px">
        ${fact("Device", m.name)}${fact("Window", (ev.daysBack || m.daysBack || "?") + " days")}
        ${fact("Blocked", s.blocked)}${fact("Audited (would block)", s.audited)}${fact("Allowed", s.allowed)}
        ${fact("WDAC 3076 audit", ci.audit3076)}${fact("WDAC 3077 block", ci.block3077)}
      </div>
      ${gs.rows ? `<div class="mini" style="margin-bottom:6px">
        ${policy ? `<b>${gs.gap}</b> gap${gs.gap === 1 ? "" : "s"} to close — ${gs.gap ? `they are in the <a href="#" id="alEvToFindings">Findings table</a> below, 📡-marked, each with a one-click fix` : "nothing the draft would still block from machine space"}.` : `<b>${gs.rows}</b> distinct denied files — load a policy and they are judged.`}
        ${gs.bydesign ? ` · ${gs.bydesign} blocked by design` : ""}${gs.covered ? ` · ${gs.covered} covered by the draft` : ""}${gs.undecided ? ` · ${gs.undecided} undecided` : ""}${gs.dll ? ` · ${gs.dll} DLL set aside` : ""}
        <span class="muted">— the gap report carries every group in full.</span>
      </div>` : `<p class="mini muted" style="margin:0">No blocked or audited events in the window — either the estate is quiet or the policy was not reaching these devices. The allowed count above says which.</p>`}
      ${(eventsEvidence.warnings || []).length ? `<div class="al-dep-err mini" style="margin-bottom:4px"><b>The collector could not see everything:</b><ul class="al-list" style="margin:4px 0 0">${eventsEvidence.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
    `;

    // Own wiring, renderRemedy's pattern: this card rebuilds its innerHTML on
    // every render, so the handlers must be attached here and nowhere else.
    const dl = host.querySelector("#alEvGapDl");
    if (dl) dl.addEventListener("click", () => {
      download(`AppControl-GapReport-${String(m.name || "device").replace(/[^A-Za-z0-9-]/g, "_")}.md`, fleetGapReport(), "text/markdown");
    });
    const jump = host.querySelector("#alEvToFindings");
    if (jump) jump.addEventListener("click", (e) => {
      e.preventDefault();
      const el = document.getElementById("alFindings");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const clr = host.querySelector("#alEvClear");
    if (clr) clr.addEventListener("click", () => {
      eventsEvidence = null; evTenant = { busy: false, list: null, error: "" };
      if (policy) loadFresh(); else render();
    });
    const tb = host.querySelector("#alEvTenant");
    if (tb) tb.addEventListener("click", loadTenantProfiles);
    host.querySelectorAll(".al-ev-adopt").forEach((b) => b.addEventListener("click", () => {
      const p = (evTenant.list || [])[+b.dataset.i];
      if (!p) return;
      try { adoptTenantProfile(p); }
      catch (e) { evTenant.error = e.message; renderEventsCard(); }
    }));
  }

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
    if (!isEnforcing(col)) return null;
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

  // What is ALREADY on the device that this policy will not touch?
  //
  // Deploying a policy does not clear what came before. Every AppLocker delivery
  // path adds rather than replaces: the CSP holds one node per grouping and type
  // with Add/Delete/Get/Replace access, so a profile carrying no DLL setting
  // leaves an existing DLL node exactly where it was; Group Policy merges, and
  // "doesn't overwrite or replace rules that are already present in a linked
  // GPO"; local policy persists until cleared.
  //
  // So a collection the device is running and this policy omits keeps running,
  // invisibly — and if it is NotConfigured with rules, it keeps BLOCKING while
  // the policy on screen looks like it has nothing to say about that type.
  // Nothing else in the tool could catch this: it needs the device's effective
  // policy, which only the scan can supply.
  function analyzeCarryOver(b, model) {
    const out = [];
    const eff = b && b.effectivePolicy;
    if (!eff || !eff.available || !eff.xml) return out;

    let live;
    try { live = parsePolicy(eff.xml, "effective"); }
    catch { return out; }

    for (const lc of live.collections) {
      if (!lc.rules.length) continue;                       // nothing on the device to carry over
      const mine = model.collections.find((c) => c.type === lc.type);
      if (mine && mine.rules.length) continue;              // this policy has its own say on that type

      // Two shapes, one consequence. ABSENT is unambiguous: nothing here touches
      // that node. EMPTY is worse, because it LOOKS deliberate — and whether it
      // clears anything depends on the delivery path. Via the CSP an empty
      // collection replaces the node and does clear it; via Group Policy the
      // policies merge and an empty collection adds nothing, so the device's
      // rules survive untouched.
      const empty = !!mine;
      const enforcing = lc.mode === "Enabled" || (lc.mode === "NotConfigured" && lc.rules.length > 0);
      out.push({
        sev: enforcing ? "High" : "Medium", source: "scan", collection: lc.type, ruleType: "(carry-over)",
        cond: `device: ${lc.rules.length} rule${lc.rules.length === 1 ? "" : "s"}, ${lc.mode}`,
        reason: `The device is already running a '${lc.type}' collection with ${lc.rules.length} rule${lc.rules.length === 1 ? "" : "s"}, and the policy on screen ${empty ? `carries an EMPTY '${lc.type}' collection` : `does NOT contain '${lc.type}' at all`} — deploying this will not reliably remove it. ` +
          (enforcing
            ? `Those rules are ENFORCING today${lc.mode === "NotConfigured" ? " (NotConfigured with rules means enforced)" : ""} and will go on enforcing afterwards, while this policy appears to say nothing about ${lc.type}.`
            : `Those rules are in ${lc.mode} today and will stay in ${lc.mode} afterwards.`) +
          (empty ? " An empty collection replaces the node over the Intune CSP, but Group Policy merges rather than replaces, so over GPO the device's rules survive it." : ""),
        rec: `Decide, rather than letting the delivery path decide. To KEEP it, put the '${lc.type}' rules into this policy so one artefact describes the whole device. To REMOVE it: unassign the Intune profile that owns it (Intune sends a Delete) or unlink the GPO carrying it, then run Clear-TunoAppLockerPolicy.ps1 — downloadable in step 5 — to sweep what unassignment leaves tattooed, and only then deploy this policy under a NEW grouping. Leaving it out here does nothing on its own, and cleanup without unassignment is a loop: the old policy returns at the next sync. The AppLocker CSP reboots the device on apply and on delete, so neither is silent.`,
      });
    }
    return out;
  }

  function analyzeScan(b, model) {
    const out = analyzeCarryOver(b, model);
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
      // Has the fix already been taken? Then the finding must SAY SO — after
      // an Apply that left the row looking identical, the report was 'the fix
      // is not working any more', verbatim. A finding whose fix is in the
      // draft changes state: Info, covered, with the expiry duty named.
      const typesU = [...new Set(unsigned.map((a) => a.collection || "Exe"))];
      const hashCovered = model && typesU.every((t) => {
        const colU = model.collections.find((c) => c.type === t);
        return colU && colU.rules.some((r) => r.name === `${BRANDING.name}: unsigned in writable locations (${t}, hash)`);
      });
      if (hashCovered) {
        out.push({
          sev: "Info", source: "scan", collection: typesU.join("/"), ruleType: "(scan)",
          cond: unsigned.slice(0, 4).map((a) => a.name).join(", ") + (unsigned.length > 4 ? `, +${unsigned.length - 4} more` : ""),
          reason: `${unsigned.length} unsigned executable(s) in user-writable locations are COVERED by the hash rules in this draft (see the Rules card).`,
          rec: "Done — but hash rules die the moment any of these files updates. Put the expiry on someone's calendar, and keep pressing the vendor to sign. Deleting the TUNO hash rules in the Rules card reopens this finding.",
        });
      } else {
        out.push({
          sev: "Medium", source: "scan", collection: "Exe", ruleType: "(scan)",
          cond: unsigned.slice(0, 4).map((a) => a.name).join(", ") + (unsigned.length > 4 ? `, +${unsigned.length - 4} more` : ""),
          reason: `${unsigned.length} unsigned executable(s) were found in user-writable locations. Nothing but a hash rule can allow them, and a hash rule stops working the moment the file is updated.`,
          rec: "Press the vendor to sign, relocate the application into a protected directory, or accept the hash rules and put their expiry on someone's calendar.",
          fix: { kind: "hashUnsigned", artifacts: unsigned.filter((a) => a.hash) },
        });
      }
    }

    // 3. Was this a reference machine? The single assumption everything else
    //    rests on. The generated policy says "what is on this machine is allowed
    //    and nothing else is" — sound from a clean image, and a way of handing
    //    back two years of accumulation from somebody's working laptop.
    const ref = b.referenceMachine;
    if (ref && ref.looksClean === false) {
      out.push({
        sev: "High", source: "scan", collection: "(scan)", ruleType: "(scan)",
        cond: `${ref.profileArtifacts} executable(s) in ${ref.profileCount} profile(s)`,
        reason: `The scanned device does not look like a clean reference machine — ${(ref.reasons || []).join("; ")}. Every rule generated from a user profile allows whatever was sitting in it.`,
        rec: "Re-scan a freshly built reference image with your standard applications installed and nobody working in it. If you keep this scan, review every rule sourced from a profile before enforcing — those are the ones that hand a standard user back the ability to run what they put in their own directory, which is the thing AppLocker is here to stop.",
      });
    } else if (ref && ref.looksClean === true && ref.profileCount > 0) {
      out.push({
        sev: "Info", source: "scan", collection: "(scan)", ruleType: "(scan)",
        cond: `${ref.profileArtifacts} executable(s) in ${ref.profileCount} profile(s)`,
        reason: "The scanned device looks like a clean reference machine, so the per-user applications found in the profile are the image's own and the rules built from them are a baseline rather than an accumulation.",
        rec: "No change needed. Re-scan the reference image whenever it is rebuilt, and treat any new profile rule as a change to the baseline rather than a fix.",
      });
    }

    // 4. What the run could not see. Stated, not implied.
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

    // 5. What the endpoint has already refused.
    const ev = b.events;
    if (ev && ev.available && ev.summary && (ev.summary.blocked || ev.summary.audited)) {
      out.push({
        sev: ev.summary.blocked ? "High" : "Info", source: "scan", collection: "(scan)", ruleType: "(scan)",
        cond: `${ev.summary.blocked} blocked · ${ev.summary.audited} audited · ${ev.daysBack} days`,
        reason: `The device's AppLocker logs show ${ev.summary.blocked} execution(s) actually blocked and ${ev.summary.audited} that would have been blocked under enforcement, across ${ev.summary.distinctUsers} user(s).`,
        rec: ev.summary.blocked
          ? "Work through the blocked and audited list — open it right here — before touching enforcement anywhere else: these are real users who could not run something."
          : "Review the audited list — open it right here: each one becomes a blocked user the day this policy is enforced.",
        // The renderer attaches the list this recommendation promises (10443):
        // a "below" that pointed at nothing was the complaint, verbatim.
        eventsList: true,
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
      // NotConfigured does NOT mean "off". Microsoft: "if any rules exist in a
      // rule collection that is 'not configured', the rules WILL be enforced ...
      // you should avoid using this value in your AppLocker policies." So the
      // verdict depends entirely on whether the collection carries rules, and
      // the two cases are opposites — one blocks nothing, the other blocks
      // silently while reading as 'not configured' to whoever opens the policy.
      if (col.mode === "NotConfigured" && col.rules.length) F("High", { collection: col.type, ruleType: "(collection)", reason: `Collection '${col.type}' is NotConfigured but carries ${col.rules.length} rule${col.rules.length === 1 ? "" : "s"} — which means those rules ARE ENFORCED. 'NotConfigured' does not mean off: Microsoft's own guidance is that a rule collection in this state is enforced unless a higher-precedence policy sets it to Audit only, and that the value should never be used deliberately.`, rec: `Decide and say so: 'AuditOnly' if you want these rules evaluated and logged without blocking, 'Enabled' if you want them enforced. Leaving it as NotConfigured means this collection is blocking today while reading as inactive to the next person who opens the policy.`, fix: { kind: "mode", type: col.type } });
      else if (col.mode === "NotConfigured") F("High", { collection: col.type, ruleType: "(collection)", reason: `Collection '${col.type}' is NotConfigured and carries no rules → nothing of this type is restricted.`, rec: `Add the rules this type needs and set 'AuditOnly' to start. Note that once rules exist, 'NotConfigured' stops meaning 'off' and starts meaning 'enforced' — so set the mode explicitly rather than leaving it.`, fix: { kind: "mode", type: col.type } });
      else if (col.mode === "AuditOnly") F("High", { collection: col.type, ruleType: "(collection)", reason: `Collection '${col.type}' is AuditOnly (no blocking).`, rec: `Stay in AuditOnly until the event log is clean across a full working month — a month-end, a patch cycle, a new starter — then enforce deliberately. Enforcing on the strength of a quiet week is how a policy takes out an estate.` + (col.type === "Script" ? " Note: Script in AuditOnly will not enforce Constrained Language Mode." : "") + (col.type === "Dll" ? " DLL is the one collection to think hardest about: AppLocker evaluates every DLL load, so enforcement costs application start time and audit alone floods the log." : ""), fix: { kind: "mode", type: col.type } });
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
          // The IT-TOOLS house folders are allowed BY CONVENTION — every policy
          // this tool generates carries these rules, so flagging them Medium on
          // every audit would be the tool arguing with its own defaults (the
          // 10315 lesson, again). The fact still gets stated, at Info, with the
          // condition that makes it safe: the ACL, which the device scan checks.
          if (r.action === "Allow" && DEFENDER_PLATFORM_RE.test(cond)) {
            F("Info", Object.assign({}, base, { condType: "Path", cond, reason: "Microsoft Defender platform folder, allowed by convention — the antivirus updates itself into ProgramData\\Microsoft\\Windows Defender\\Platform\\<version> and runs from there.", rec: "Keep it. The folder is writable by SYSTEM and TrustedInstaller only, and the alternative — a publisher rule on the Windows operating-system product — would allow every OS-signed binary from anywhere." }));
            continue;
          }
          if (r.action === "Allow" && IT_TOOLS_RE.test(cond)) {
            F("Info", Object.assign({}, base, { condType: "Path", cond, reason: "IT-TOOLS house folder, allowed by convention — IT-deployed applications and scripts land here, written by the Intune Management Extension as SYSTEM.", rec: "Safe exactly as long as the folder's ACL restricts writes to SYSTEM and Administrators. The device scan verifies that and raises a loud warning when it is not true; if a scan bundle is loaded and no such warning appears among the findings, the ACL was checked and held." }));
            continue;
          }
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
            // A rule that names BOTH a publisher and a product is the shape
            // Microsoft's own guidance recommends, and the shape this tool's
            // coverage fixes build. The two breadth heuristics below are written
            // for `Publisher='*'`-shaped rules and misfire on it:
            //
            //   * an upper version bound on a named vendor product BREAKS the
            //     rule at that vendor's next release — OneDrive self-updates
            //     weekly, so pinning it is worse than not pinning it;
            //   * narrowing the principal on something every user needs is not
            //     an improvement, it is a helpdesk ticket.
            //
            // Scoring them Medium made T01 flag the rule it had just recommended
            // and added itself, and mark it "risky" in the coverage table two
            // panels up. Both facts are still REPORTED — an unbounded allow is
            // worth knowing about — but at Info, which is what they are.
            const scoped = c.publisher && c.publisher !== "*" && c.product && c.product !== "*";

            if (!c.publisher || c.publisher === "*") { reasons.push("Any publisher allowed"); recs.push("Specify the exact trusted publisher (e.g. O=Vendor, C=…)."); score = Math.max(score, SEV_SCORE.High); }
            if (c.product === "*" && c.binary === "*") { reasons.push("Any product and any binary from the publisher are allowed"); recs.push("Constrain to specific Product and/or Binary where feasible."); score = Math.max(score, SEV_SCORE.Medium); }
            if (!c.high || c.high === "*") {
              if (scoped) {
                reasons.push("No upper version bound — any future release of this product from this publisher will run, a compromised update included");
                recs.push("Expected for a named vendor product: an upper bound would break the rule on the vendor's next release. Track the vendor's advisories rather than pinning a version.");
                score = Math.max(score, SEV_SCORE.Info);
              } else {
                reasons.push("No upper version bound");
                recs.push("Specify an upper version bound or update allow rules as versions are vetted.");
                score = Math.max(score, SEV_SCORE.Medium);
              }
            }
            if (broad && !admin && !scoped) { reasons.push("Principal is broad (Everyone/Authenticated Users/Users)"); recs.push("Restrict the principal to a minimal, purpose-built group."); score = Math.max(score, SEV_SCORE.Medium); }
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
    if (!isEnforcing(col)) {
      return { status: "unenforced", detail: `The ${app.collection} collection is ${col ? "NotConfigured with no rules" : "absent"} — nothing of this type is restricted, so the app runs by default. The audit flags that separately.` };
    }
    // A NotConfigured collection carrying rules BLOCKS — it does not audit. Only
    // an explicit AuditOnly evaluates without blocking.
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
  // The IT-TOOLS house rules: %ProgramData%\IT-TOOLS\Apps and \Scripts are where
  // IT-deployed tooling lands (written by IME as SYSTEM), and the convention is
  // that every Exe/Msi/Script policy allows them WITHOUT anyone having to
  // remember to add the rule. AppLocker has no %PROGRAMDATA% variable, so the
  // macro form is %OSDRIVE%\ProgramData. The rules are only as strong as the
  // ACL — SYSTEM and Administrators write, nobody else — and the scan checks
  // exactly that; the audit reports these paths at Info rather than flagging
  // the tool's own convention as a finding (the 10315 lesson).
  const IT_TOOLS_RULES = [
    ["TUNO: IT-TOOLS house folder (Apps)", "S-1-1-0", { kind: "path", path: "%OSDRIVE%\\ProgramData\\IT-TOOLS\\Apps\\*" }],
    ["TUNO: IT-TOOLS house folder (Scripts)", "S-1-1-0", { kind: "path", path: "%OSDRIVE%\\ProgramData\\IT-TOOLS\\Scripts\\*" }],
  ];
  const IT_TOOLS_RE = /\\ProgramData\\IT-TOOLS\\(Apps|Scripts)(\\|$)/i;
  // The Defender platform folder (10557): the one ProgramData path the
  // generated set allows on purpose — SYSTEM/TrustedInstaller-writable only,
  // and the alternative (a publisher rule on the OS product) is far worse.
  const DEFENDER_PLATFORM_RE = /\\ProgramData\\Microsoft\\Windows Defender\\Platform\\\*$/i;

  const DEFAULT_RULES = {
    Exe: [
      ["(Default Rule) All files located in the Program Files folder", "S-1-1-0", { kind: "path", path: "%PROGRAMFILES%\\*" }],
      ["(Default Rule) All files located in the Windows folder", "S-1-1-0", { kind: "path", path: "%WINDIR%\\*" }],
      ["(Default Rule) All files", "S-1-5-32-544", { kind: "path", path: "*" }],
      ...IT_TOOLS_RULES,
    ],
    Msi: [
      ["(Default Rule) All digitally signed Windows Installer files", "S-1-1-0", { kind: "publisher", publisher: "*", product: "*", binary: "*", low: "*", high: "*" }],
      ["(Default Rule) All Windows Installer files in %systemdrive%\\Windows\\Installer", "S-1-1-0", { kind: "path", path: "%WINDIR%\\Installer\\*" }],
      ["(Default Rule) All Windows Installer files", "S-1-5-32-544", { kind: "path", path: "*.*" }],
      ...IT_TOOLS_RULES,
    ],
    Script: [
      ["(Default Rule) All scripts located in the Program Files folder", "S-1-1-0", { kind: "path", path: "%PROGRAMFILES%\\*" }],
      ["(Default Rule) All scripts located in the Windows folder", "S-1-1-0", { kind: "path", path: "%WINDIR%\\*" }],
      ["(Default Rule) All scripts", "S-1-5-32-544", { kind: "path", path: "*" }],
      ...IT_TOOLS_RULES,
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
    // fix.path (10557): a catalog entry may name the folder to allow instead
    // of the artifact's own pattern — the Defender platform wants its
    // Platform folder, not a wildcard buried mid-path.
    col.rules.push(mkRule("FilePathRule", name, "S-1-1-0", "Allow", [{ kind: "path", path: app.fix.path || art.path }], app.fix.note));
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
  // The just-applied notice: a fix that lands must SAY so, visibly — the
  // sticky card header carries "✔ <what happened> · Undo" for a few seconds.
  // Reported from real use: a fix applied with no visible acknowledgement
  // reads as a fix that did nothing.
  let justApplied = null, justAppliedTimer = null;
  function mutate(label, fn) {
    if (!policy) return false;
    const before = snapshot();
    if (fn() === false) return false;
    undoState = { snapshot: before, label };
    justApplied = label;
    editsSinceLoad++;
    // a compare describes the draft it was made against; an edit makes it
    // stale, and a stale diff before an update in place is a lie
    deployState.diff = null;
    // Guarded: one headless harness evaluates this file in a bare VM context
    // without timers, and a notice that never fades is better than a crash.
    if (justAppliedTimer && typeof clearTimeout === "function") clearTimeout(justAppliedTimer);
    justAppliedTimer = typeof setTimeout === "function"
      ? setTimeout(() => { justApplied = null; justAppliedTimer = null; render(); }, 8000) : null;
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
      diff: null,   // a compare belongs to the draft it was made against (10560)
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

    // A fleet gap closes with the rule its own evidence suggests — publisher
    // when signed, hash when the event carries one, exact path last. Applied
    // through the same mutate/undo as every other fix.
    if (fx.kind === "hashUnsigned" && fx.artifacts.length) {
      // Applied once already? The rules this fix would add exist by name, so
      // Apply would add NOTHING — a button that silently does nothing was the
      // bug report, verbatim. No fix is offered when there is nothing to do.
      const types = [...new Set(fx.artifacts.map((a2) => a2.collection || "Exe"))];
      const allExist = types.every((t) => {
        const col2 = policy.collections.find((c) => c.type === t);
        return col2 && col2.rules.some((r2) => r2.name === `${BRANDING.name}: unsigned in writable locations (${t}, hash)`);
      });
      if (allExist) return null;
      return {
        mode: "editor", editor: "confirm", label: `Add hash rules (${fx.artifacts.length})…`,
        title: "Open the fix card — it lists the hashes before anything is added",
        preview: [`One FileHashRule per collection, ${fx.artifacts.length} SHA256 hash(es) inside:`]
          .concat(fx.artifacts.slice(0, 8).map((a2) => `${a2.name || a2.path} — ${String(a2.hash || "").slice(0, 24)}…`))
          .concat(fx.artifacts.length > 8 ? [`… and ${fx.artifacts.length - 8} more`] : [])
          .concat(["Everyone · Allow — these EXPIRE the moment any file updates; put it on someone's calendar."]),
        undoLabel: `added hash rules for ${fx.artifacts.length} unsigned executable(s)`,
        apply: () => {
          const groups = {};
          for (const a2 of fx.artifacts) {
            const t = a2.collection || "Exe";
            (groups[t] = groups[t] || []).push(a2);
          }
          let added = false;
          for (const t of Object.keys(groups)) {
            const col2 = ensureCollection(t);
            const name = `${BRANDING.name}: unsigned in writable locations (${t}, hash)`;
            if (col2.rules.some((r2) => r2.name === name)) continue;
            const norm2 = (x) => { let h = String(x || "").replace(/^SHA256\s*/i, "").trim(); return /^0x/i.test(h) ? h : "0x" + h; };
            col2.rules.push(mkRule("FileHashRule", name, "S-1-1-0", "Allow",
              [{ kind: "hash", hashes: groups[t].map((a2) => ({ type: "SHA256", data: norm2(a2.hash), file: a2.name || String(a2.path || "").split("\\").pop(), length: String(a2.sizeBytes || 0) })) }],
              `Hash allows for the unsigned executables the scan found in user-writable locations. THESE EXPIRE the moment any file updates — put it on someone's calendar, and press the vendor to sign.`));
            added = true;
          }
          return added;
        },
      };
    }

    if (fx.kind === "fleetAllow") {
      const plan = fleetFixPlan(fx.row);
      if (!plan) return null;
      const base = fx.row.binary || (fx.row.path ? String(fx.row.path).split("\\").pop() : "file");
      // A CONFIRM CARD, not an instant apply — the same design flow as every
      // other fix: click opens the card showing exactly the rule to be added,
      // Apply commits it. Reported from real use: two different fix flows on
      // one screen read as one of them being broken.
      const preview = plan.kind === "publisher"
        ? [`FilePublisherRule — ${BRANDING.name}: allow ${base} (fleet gap)`, `Publisher='${fx.row.publisher}'; Product='${fx.row.product && fx.row.product !== "-" ? fx.row.product : "*"}'; Binary='*'; VersionRange=[*,*]`, `Everyone · Allow · ${plan.type} collection`]
        : plan.kind === "hash"
          ? [`FileHashRule — ${BRANDING.name}: allow ${base} (fleet gap)`, `SHA256 ${String(fx.row.sample.hash || "").slice(0, 40)}…`, `Everyone · Allow · ${plan.type} collection — goes STALE on the file's next update`]
          : [`FilePathRule — ${BRANDING.name}: allow ${base} (fleet gap)`, `Path: ${fx.row.path}`, `Everyone · Allow · ${plan.type} collection — the weakest shape; replace with publisher or hash when the file is in hand`];
      return {
        mode: "editor", editor: "confirm", label: plan.label,
        title: "Open the fix card — it shows the exact rule before anything is added",
        preview,
        undoLabel: `allowed ${base} from the fleet evidence`,
        apply: () => addFixForFleetRow(fx.row),
      };
    }

    if (fx.kind === "addCollection") {
      return {
        mode: "auto", label: "Add collection",
        title: `Add the ${fx.type} collection with its default rules, in AuditOnly`,
        undoLabel: `added the ${fx.type} collection`,
        apply: () => {
          const col = ensureCollection(fx.type);
          addDefaultRules(fx.type);
          // AuditOnly, never Enabled. This used to land on Enabled as soon as any
          // default rule was added, which made "add the missing collection" a
          // one-click route to enforcing a collection nobody had ever audited —
          // the same decision the AuditOnly finding now refuses to make for you.
          col.mode = "AuditOnly";
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
      // NotConfigured → AuditOnly is the one mechanical step here. It changes
      // nothing on the endpoint except that the event log starts answering the
      // question the admin actually has.
      if (col.mode === "NotConfigured") {
        return {
          mode: "auto", label: "Set AuditOnly",
          title: `Start '${fx.type}' in AuditOnly — nothing is blocked, and the event log begins recording what would have been.`,
          undoLabel: `set ${fx.type} to AuditOnly`,
          apply: () => { col.mode = "AuditOnly"; },
        };
      }

      // AuditOnly → Enabled is NOT mechanical, and it is the most expensive
      // click in this tool. Audit exists to be WATCHED — across a month-end, a
      // patch cycle, a new starter — and no static check of an XML can know
      // whether that has happened. A one-click Enable here would be the tool
      // making the one decision it was built to slow down, which is also how a
      // fix chain ends somewhere nobody chose: NotConfigured → AuditOnly →
      // Enabled, three clicks, no evidence.
      return {
        mode: "editor", editor: "enforcement", col,
        label: "Enforce…",
        title: `'${fx.type}' is in AuditOnly. Whether it is ready to enforce is a judgement about your event log, not something this XML can settle — open this to make it deliberately.`,
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

  // The enforcement editor. Deliberately NOT a button: the whole point is that
  // the admin reads what has to be true and picks the mode themselves. It lists
  // the conditions rather than asserting them, because the tool cannot check any
  // of them from an XML file.
  function enforcementEditorHtml(f, plan) {
    const col = plan.col;
    const isDll = col.type === "Dll";
    const opts = MODES.map((m) => `<option value="${m}" ${col.mode === m ? "selected" : ""}>${m}</option>`).join("");
    return `<div class="al-fixpanel" style="padding:12px 14px;border-left:3px solid var(--accent,#6b8afd)">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <b class="mini">Enforcement — ${esc(COLLECTION_LABEL[col.type] || col.type)}</b>
        <span class="mini muted">currently ${esc(col.mode)} · ${col.rules.length} rule${col.rules.length === 1 ? "" : "s"}</span>
      </div>
      <p class="mini muted" style="margin:0 0 8px">There is no one-click Enable here on purpose. Nothing in the XML can tell the tool whether this collection is ready, so it asks you. Before moving to <b>Enabled</b>, all of these should be true:</p>
      <ul class="mini muted" style="margin:0 0 10px;padding-left:20px;line-height:1.7">
        <li>It has been in AuditOnly long enough to cover a <b>month-end, a patch cycle and a new starter</b> — not a quiet week.</li>
        <li>The 8003/8006 events on the pilot devices are down to <b>nothing you do not recognise</b>.</li>
        <li>The Microsoft coverage table above says <b>allowed</b> for everything your users need, including per-user OneDrive.</li>
        <li>You have tested that <b>removing the assignment</b> puts a device back, on a device you can still reach.</li>
      </ul>
      ${isDll ? `<p class="mini" style="margin:0 0 10px;color:var(--warn,#d08b28)"><b>DLL is a special case.</b> AppLocker evaluates every DLL load. Enabled measurably slows application start and blocks anything that loads a library from a writable path; even AuditOnly buries the log under Microsoft-signed System32 libraries, EDR AMSI providers and .NET native images. TUNO's scanner and Intune export leave the DLL collection <b>out of the policy entirely</b> — absence is the only state that restricts nothing, because a collection marked NotConfigured while carrying rules is enforced. Take DLL on as its own project, with the log volume and the start-up cost accepted deliberately.</p>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center">
        <select class="btn al-fx-mode">${opts}</select>
        <button class="btn sm primary al-fx-apply">Apply</button>
        <button class="btn sm al-fx-cancel">Cancel</button>
        <span class="mini muted al-fx-hint"></span>
      </div>
    </div>`;
  }

  function fixEditorHtml(f, plan) {
    if (plan.editor === "enforcement") return enforcementEditorHtml(f, plan);
    if (plan.editor === "confirm") {
      // The confirm card: the exact rule(s) about to be added, then Apply.
      return `<div class="al-fixpanel" style="padding:12px 14px;border-left:3px solid var(--accent,#6b8afd)">
        <div style="margin-bottom:6px"><b class="mini">Fix — ${esc(plan.label.replace(/…$/, ""))}</b></div>
        <p class="mini muted" style="margin:0 0 8px">${esc(f.rec)}</p>
        <div class="mini" style="margin:0 0 10px">${plan.preview.map((l) => `<div style="overflow-wrap:anywhere"><code>${esc(l)}</code></div>`).join("")}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn sm primary al-fx-apply">Apply</button>
          <button class="btn sm al-fx-cancel">Cancel</button>
          <span class="mini muted al-fx-hint"></span>
        </div></div>`;
    }
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

    if (plan.editor === "confirm") {
      const applied = mutate(plan.undoLabel, plan.apply);
      if (!applied) {
        // The one way a confirm apply comes back false is the dedupe: the
        // rule(s) it would add already exist by name from an earlier apply.
        q(".al-fx-hint").textContent = "Nothing to add — these rules already exist (from an earlier apply). Find them in the Rules card; delete them there first if you want to rebuild.";
      }
      return applied;
    }

    if (plan.editor === "enforcement") {
      const target = plan.col;
      const next = q(".al-fx-mode").value;
      if (next === target.mode) { q(".al-fx-hint").textContent = "Mode unchanged — nothing to apply."; return false; }
      return mutate(`set ${target.type} to ${next}`, () => { target.mode = next; });
    }

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
    // Applying with nothing changed used to rewrite the rule identically and
    // close the editor — which read as "fix applied" while the finding stayed.
    // Say what is actually missing instead.
    const b4 = rule.conditions[0] || {};
    if (rule.nodeName === "FilePublisherRule" && sid === rule.sid
      && b4.publisher === cond.publisher && b4.product === cond.product && b4.binary === cond.binary
      && b4.low === cond.low && b4.high === cond.high) {
      q(".al-fx-hint").textContent = "Nothing changed — for the version-bound finding, set High version to a real bound instead of *.";
      return false;
    }
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
      for (const f of findings) L.push(`| ${f.sev} | ${f.source === "scan" ? "device scan" : f.source === "fleet" ? "fleet events" : "policy XML"} | ${cell(f.collection)} | ${cell(f.rule || f.ruleType)} | ${cell(f.cond || "")} | ${cell(f.reason)} | ${cell(f.rec)} |`);
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
      L.push(`| AppLocker cmdlets | ${(m.appLockerSource === "native" ? "yes"
        : m.appLockerSource === "compat" ? "via Windows PowerShell compatibility"
        : m.appLockerSource === "compat-policy-only" ? "compatibility session — policy read only, publishers from certificates"
        : m.appLockerCmdlets ? "yes" : "NO — publishers derived from certificates")} |`);
      L.push(`| Application Identity service | ${m.appIdentityService || "—"} |`);
      L.push(`| User-writable directories | ${scan.writablePaths.length} |`);
      L.push(`| User-writable files in admin-only directories | ${scan.writableFilesChecked ? scan.writableFiles.length : "not checked (older scan or -SkipWritableFiles)"} |`);
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
      if (scan.writableFiles.length) {
        L.push(`### User-writable files inside directories a standard user cannot write to (${scan.writableFiles.length})`);
        L.push("");
        L.push("The directory is safe, the file is not: a path rule on the directory allows it and the directory walk cannot see it. Each is excepted from the default allow by its exact path and has its own rule if it was signed; the fix is the file's ACL.");
        L.push("");
        L.push(`| File | Writable by | Allowed now by |`);
        L.push(`|---|---|---|`);
        for (const f of scan.writableFiles.slice(0, 200)) {
          const p = f.normalized || f.path;
          const rule = evaluateProbePath(policy, p, f.collection || "Exe");
          L.push(`| ${p} | ${(f.grantees || []).map((g) => g.name || g.sid).join(", ") || "—"} | ${rule ? rule.name : "— (excepted or unreachable)"} |`);
        }
        if (scan.writableFiles.length > 200) L.push(`| … | ${scan.writableFiles.length - 200} more | |`);
        L.push("");
      }
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
    findings = analyze(policy).concat(analyzeScan(scan, policy)).concat(analyzeFleetEvents());
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
  // What a download contains. The whole policy is the default and the right
  // answer for a GPO import; a single collection is what Intune's MANUAL
  // OMA-URI route asks for, one value per rule collection, and getting it out
  // of here beats hand-cutting it from a file with five of them in.
  //
  // DLL is offered here even though the Intune PROFILE omits it: choosing it
  // deliberately is a different act from having it shipped without being
  // asked, and someone entering OMA-URIs by hand may well want it.
  function renderDlParts() {
    const sel = $("alDlPart");
    if (!sel) return;
    const keep = sel.value;
    const cols = policy ? policy.collections.filter((c) => c.rules.length || c.mode !== "NotConfigured") : [];
    sel.innerHTML = `<option value="all">Whole ${pane === "intune" ? "profile" : "policy"}</option>`
      + cols.map((c) => `<option value="${esc(c.type)}">${esc(COLLECTION_LABEL[c.type] || c.type)} only (${c.rules.length} rule${c.rules.length === 1 ? "" : "s"})</option>`).join("");
    // a collection that has gone away must not stay selected and silently
    // download something else
    sel.value = [...sel.options].some((o) => o.value === keep) ? keep : "all";
    sel.style.display = cols.length > 1 ? "" : "none";
  }

  function renderCodePane() {
    renderDlParts();
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

    // WHAT IS SHOWN IS WHAT DOWNLOADS. The part selector narrows both, or the
    // panel would display the whole policy while the button handed over one
    // collection — the same class of lie as a preview drifting from its file.
    const part = ($("alDlPart") || {}).value || "all";
    const one = part === "all" ? null : policy.collections.find((c) => c.type === part);

    if (pane === "intune") {
      // The issues list, ALL severities. The deploy panel filters to High
      // because it decides whether to block a write; here the question is "is
      // this profile right", and a Medium warning nobody can see — the
      // reusable-grouping one above all — is a warning that does not exist.
      const issuesBox = $("alIntuneIssues");
      if (issuesBox) {
        const iss = intuneIssues();
        issuesBox.innerHTML = iss.map((i) => `<div style="margin-top:4px">${i.sev === "High" ? "⛔" : "⚠️"} ${esc(i.text)}</div>`).join("");
        issuesBox.style.display = iss.length ? "" : "none";
      }
      const mode = intuneCfg.mode === "Enforce" ? "Enabled" : "AuditOnly";
      if (one) {
        if (name) name.textContent = `AppLocker-${one.type}-OMA-URI.xml`;
        sub.textContent = `the OMA-URI VALUE for ${esc(COLLECTION_LABEL[one.type] || one.type)} · grouping ${intuneGrouping() || "(none)"} · ${mode}`;
        code.innerHTML = highlightXml(collectionLines(one, "", mode).join("\n"));
        return;
      }
      if (name) name.textContent = intuneProfileName(intuneCfg.mode).replace(/[^A-Za-z0-9\-_.()]/g, "_") + ".json";
      const n = policy.collections.filter((c) => OMA_TYPE[c.type]).length;
      sub.textContent = `${n} OMA-URI setting${n === 1 ? "" : "s"} · grouping ${intuneGrouping() || "(none)"} · ${intuneCfg.mode}`;
      code.innerHTML = highlightJson(intuneJson(intuneCfg.mode));
      return;
    }

    if (one) {
      if (name) name.textContent = `AppLockerPolicy-${one.type}.xml`;
      sub.textContent = `${one.rules.length} rule${one.rules.length === 1 ? "" : "s"} · ${esc(COLLECTION_LABEL[one.type] || one.type)} only · ${esc(one.mode)}`;
      code.innerHTML = highlightXml(['<AppLockerPolicy Version="1">', ...collectionLines(one, "  "), "</AppLockerPolicy>"].join("\n"));
      return;
    }
    if (name) name.textContent = "AppLockerPolicy.xml";
    const rules = policy.collections.reduce((n, c) => n + c.rules.length, 0);
    const shipped = exportableCollections();
    const leftOut = policy.collections.length - shipped.length;
    sub.textContent = `${rules} rule${rules === 1 ? "" : "s"} · ${shipped.length} collection${shipped.length === 1 ? "" : "s"}`
      + (leftOut ? ` · ${leftOut} empty NotConfigured collection${leftOut === 1 ? "" : "s"} left out of the file (an empty NotConfigured collection merged with Intune's Managed Installer rule becomes an enforced one)` : "");
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
    const topFiles = scan.writableFiles.slice(0, 12);
    const topEvents = ev && ev.entries
      ? ev.entries.filter((e) => e.verdict === "Blocked" || e.verdict === "Audited").slice(0, 12)
      : [];

    host.innerHTML = `
      <h3 style="margin:0 0 8px">🛰 Device scan <span class="mini muted">— evidence the XML alone cannot carry</span></h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px">
        ${fact("Device", m.name)}${fact("OS", m.os)}${fact("Joined", m.join)}
        ${fact("Scanned by", m.scannedBy)}${fact("Elevated", m.elevated === false ? "NO — partial scan" : "yes")}
        ${fact("AppLocker cmdlets", (m.appLockerSource === "native" ? "yes"
        : m.appLockerSource === "compat" ? "via Windows PowerShell compatibility"
        : m.appLockerSource === "compat-policy-only" ? "compatibility session — policy read only, publishers from certificates"
        : m.appLockerCmdlets ? "yes" : "NO — publishers derived from certificates"))}
        ${fact("Application Identity", m.appIdentityService)}
        ${fact("Writable directories", scan.writablePaths.length)}
        ${fact("Writable files in admin-only dirs", scan.writableFilesChecked ? scan.writableFiles.length : "not checked")}
        ${fact("Executables inventoried", scan.artifacts.length + (unsigned ? ` (${unsigned} unsigned)` : "") + (scan.artifacts.some((a) => a && a.sniffedPe) ? ` · ${scan.artifacts.filter((a) => a && a.sniffedPe).length} PE by header, not by name` : ""))}
        ${fact("Scan taken", scan.generator && scan.generator.generatedUtc ? String(scan.generator.generatedUtc).replace("T", " ").slice(0, 16) + " UTC" : "—")}
      </div>
      ${(!scan.generatedPolicy || !scan.generatedPolicy.auditXml) ? `<div class="gu-fail" style="margin-bottom:12px">
        <b>This bundle carries NO generated rule set, so you are editing the policy the device was already running.</b>
        <span class="why">That is why the collections here are whatever Intune or Group Policy had put on the device \u2014 typically a sparse policy with a Dll collection and a placeholder rule \u2014 rather than the publisher-first set the scan builds from what it found.
        The scan reports this: rule generation is wrapped so a failure cannot cost you the evidence, and when it fails it writes the reason into the warnings below and prints it in red at the time. It also does not run at all under <code>-SkipRuleGeneration</code>.
        Re-run the scan, read that line, and upload the new bundle.</span></div>` : ""}
      ${sources.length > 1 ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <span class="mini muted">Editing ${esc(SCAN_SOURCE_LABEL[scanSource] || scanSource)} —</span>
        ${sources.map(([v, l]) => `<button class="btn sm al-scan-src ${scanSource === v ? "primary" : ""}" data-src="${v}">${esc(l)}</button>`).join("")}
      </div>` : ""}
      ${discardedEdits ? `<div class="gu-fail" style="margin-bottom:12px">
        <b>Loading this bundle replaced the draft you were editing — ${discardedEdits} edit${discardedEdits === 1 ? "" : "s"} since the last load ${discardedEdits === 1 ? "is" : "are"} gone.</b>
        <span class="why">A scan is made on the device and cannot know what was clicked in this browser: every bundle hands over the rule set the scan itself generated. Edits survive only by leaving the browser — export the XML, or deploy the profile — and a re-scan then finds them in the device's effective policy. Coverage fixes for OneDrive, classic Teams and the Defender platform no longer need clicking at all: since script v1.10.0 the generated set carries them.</span></div>` : ""}
      ${scanPredatesCoverage(scan) ? `<div class="gu-fail" style="margin-bottom:12px">
        <b>This bundle's rule set predates the Microsoft app coverage rules${scan.generator && scan.generator.version ? ` (script v${esc(scan.generator.version)})` : ""}.</b>
        <span class="why">Since script v1.10.0 the generated set carries standing allows for OneDrive, classic Teams and the Defender platform — the three the coverage check below turns red on every fresh scan. Download the current script from step 1 and scan again; until then the 🔧 Add allow rule buttons put the same three rules in by hand.</span></div>` : scan.generatedPolicy && scan.generatedPolicy.microsoftCoverage === false ? `<div class="mini" style="margin-bottom:12px"><b>Scanned with -NoMicrosoftCoverage</b> — the generated set leaves OneDrive, classic Teams and the Defender platform to the coverage check below, on purpose.</div>` : ""}
      ${scan.warnings.length ? `<div class="mini" style="margin-bottom:12px"><b>The scan recorded ${scan.warnings.length} warning${scan.warnings.length === 1 ? "" : "s"}:</b><ul style="margin:4px 0 0;padding-left:20px">${scan.warnings.slice(0, (!scan.generatedPolicy || !scan.generatedPolicy.auditXml) ? 20 : 6).map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
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
      ${topFiles.length ? `<h4 class="mini" style="margin:14px 0 6px">User-writable files inside admin-only directories <span class="muted">— showing ${topFiles.length} of ${scan.writableFiles.length}</span></h4>
      <p class="mini muted" style="margin:0 0 6px">The directory is safe, the file is not: the directory's allow rule covers it and the directory walk cannot see it. The scan excepted each by its exact path and gave it its own rule where it was signed. The fix is the file's ACL.</p>
      <div style="overflow-x:auto"><table class="plist"><thead><tr><th>File</th><th>Writable by</th><th>Reachable now?</th></tr></thead><tbody>
        ${topFiles.map((f) => {
          const p = f.normalized || f.path;
          const rule = evaluateProbePath(policy, p, f.collection || "Exe");
          return `<tr><td class="mini" style="word-break:normal;overflow-wrap:anywhere">${esc(p)}</td>
            <td class="mini">${esc((f.grantees || []).map((g) => g.name || g.sid).join(", ") || "—")}</td>
            <td>${rule ? `<span class="tag block">✕ yes — via “${esc(rule.name)}”</span>` : `<span class="tag grant">✓ no</span>`}</td></tr>`;
        }).join("")}
      </tbody></table></div>` : (scan.writableFilesChecked ? `<p class="mini muted" style="margin-top:10px">Every executable file in the admin-only directories has an admin-only ACL of its own — the check ran and found nothing.</p>` : `<p class="mini muted" style="margin-top:10px">Writable files were not checked in this scan (older scanner, or -SkipWritableFiles). Re-run with the current Invoke-TunoAppLockerScan.ps1 to close that gap.</p>`)}
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

  // A popout button for a section heading. It parks the CARD, not the table:
  // render() rewrites these cards by writing innerHTML INTO them, so the
  // element itself survives a re-render wherever it currently sits — a fix can
  // be applied while the panel is open and the table simply redraws inside it.
  // Parking the table would leave Fs holding a node the next render had
  // already thrown away.
  const fsBtn = (target, label) => (typeof Fs === "undefined" ? ""
    : `<button class="btn sm al-fs" data-fs="${target}" data-fslabel="${esc(label)}" style="float:right" title="Open ${esc(label)} full screen">\u26f6 Full screen</button>`);

  function render() {
    $("alEmpty").style.display = policy ? "none" : "";
    $("alBody").style.display = policy ? "" : "none";
    // The jump strip follows the body (10547) — visible only when there is
    // something to jump to, and the scan chip only when the scan card shows.
    if ($("alJump")) {
      $("alJump").style.display = policy ? "" : "none";
      const scanChip = $("alJump").querySelector('[data-aljumpopt]');
      if (scanChip) scanChip.style.display = ($("alScan") && $("alScan").style.display !== "none") ? "" : "none";
    }
    renderCodePane();
    renderDeploy();
    renderScanCard();
    renderEventsCard();
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
    // The Microsoft default rules are per COLLECTION, not per policy — Exe,
    // Msi, Script, Dll and Appx each get their own set, and a collection that
    // has none is a collection that blocks its whole file type the moment it
    // is enforced. So the state gets a column of its own that is always
    // there: "present" or a button, for every collection, rather than a
    // button that appears only when something is wrong and is otherwise
    // invisible. Adding them to every collection at once is one press,
    // because that is the usual answer.
    const hasDefaults = (c) => !!(c && c.rules.some((r) => r.name.startsWith("(Default Rule)")));
    const missingDefaults = COLLECTIONS.filter((t) => !hasDefaults(policy.collections.find((x) => x.type === t)));
    $("alEnforce").innerHTML = `<h3 style="margin:0 0 8px">Enforcement per collection
        ${missingDefaults.length > 1 ? `<button class="btn sm" id="alDefaultsAll" style="float:right" title="Add the Microsoft default rules to the ${missingDefaults.length} collections that have none">＋ Default rules everywhere</button>` : ""}</h3>
      <div style="overflow-x:auto"><table class="plist"><thead><tr><th>Collection</th><th>Mode</th><th>Rules</th><th>Default Windows rules</th></tr></thead><tbody>` +
      COLLECTIONS.map((t) => {
        const c = policy.collections.find((x) => x.type === t);
        return `<tr><td>${esc(COLLECTION_LABEL[t])}</td>
          <td>${c ? `<select class="btn al-mode" data-col="${t}">` + MODES.map((m) => `<option ${c.mode === m ? "selected" : ""}>${m}</option>`).join("") + `</select>` : `<span class="mini muted">absent</span>`}</td>
          <td>${c ? c.rules.length : "—"}</td>
          <td style="white-space:nowrap">${hasDefaults(c)
            ? `<span class="tag grant" title="This collection already carries the Microsoft default rules">✓ present</span>`
            : `<button class="btn sm al-defaults" data-col="${t}" title="Add the Microsoft default rules for ${esc(COLLECTION_LABEL[t])}${c ? "" : " — the collection does not exist yet and will be created"}">＋ Add</button>`}</td></tr>`;
      }).join("") + `</tbody></table></div>`;

    // ---- findings ----
    //
    // TWO RENDERINGS OF ONE LIST, switched by the CARD'S OWN WIDTH. Beside the
    // XML panel the card is roughly half a screen, and a six-column table in
    // half a screen wraps its Reason column into one word per line — five
    // hundred pixels of row height saying almost nothing. So the card carries
    // the full table AND a compact summary, and a container query shows
    // whichever fits: the summary in the narrow column, the table when the
    // card has room — stacked layout, wide windows, and above all the ⛶ Full
    // screen popout, which is where the recommendations and fix buttons live.
    // A container query rather than a resize listener because the card knows
    // its own width and render() should not need to care; browsers without
    // container queries keep the table, which is the status quo.
    const shown = findings.filter((f) => sevFilter === "all" || f.sev === sevFilter);

    // ONE CARD FOR RULES AND FINDINGS (10442, mockup round: option A). A
    // finding that is ABOUT a rule renders NESTED under that rule, inside the
    // per-collection rule tables; findings about nothing in particular — a
    // missing collection, a scan verdict on a directory, a fleet gap — keep
    // the table shape at the top. Two cards were two scrolls over one story:
    // here is a rule, and here is what is wrong with it.
    //
    // The index space is untouched: `shown` numbers EVERY filtered finding,
    // nested or not, and the al-fixfind/al-fixrow handlers keep reading
    // shownFindings[i] — a nested fix is the same fix in a different seat.
    const byRule = new Map();
    const topFindings = [];
    shown.forEach((f, i) => {
      const attached = f.ruleId && policy.collections.some((c) => c.rules.some((r) => r.id === f.ruleId));
      if (attached) {
        if (!byRule.has(f.ruleId)) byRule.set(f.ruleId, []);
        byRule.get(f.ruleId).push({ f, i });
      } else topFindings.push({ f, i });
    });

    const srcMark = (f, long) => f.source === "scan"
      ? ` <span class="tag new" title="${long ? "This verdict came from the device scan. The browser cannot read an ACL — the scan can, and did." : "From the device scan"}">🛰</span>`
      : f.source === "fleet" ? ` <span class="tag new" title="${long ? "This came from the fleet events evidence — a device actually tried to run it." : "From the fleet events"}">📡</span>` : "";

    const fixBits = (f, i) => {
      const key = findingKey(f);
      const plan = planFix(f);
      const btn = plan
        ? `<button class="btn sm al-fixfind" data-i="${i}" title="${esc(plan.title)}">🔧 ${esc(plan.label)}</button>`
        : "";
      const editor = (plan && plan.mode === "editor" && fixOpen === key)
        ? `<div class="al-fixrow" data-i="${i}">${fixEditorHtml(f, plan)}</div>`
        : "";
      return { plan, btn, editor };
    };

    const compact = shown.length ? `<div class="al-find-compact">` +
      shown.map((f) => `<div class="al-fc-row">
          <div class="al-fc-head">${sevTag(f.sev)}${srcMark(f)} <b>${esc(f.collection)}</b> <span class="mini muted">${esc(f.rule || f.ruleType)}</span></div>
          <div class="al-fc-reason mini">${esc(f.reason)}</div>
        </div>`).join("") +
      `<button class="btn al-fs al-fc-more" data-fs="alFindings" data-fslabel="Rules and findings">⛶ Open full screen for the recommendations and one-click fixes</button>
      </div>` : "";

    // The findings that belong to no rule keep the six-column table.
    const topTable = topFindings.length ? `<div class="al-find-table" style="overflow-x:auto"><table class="plist"><thead><tr><th style="width:74px"></th><th style="width:92px">Collection</th><th style="width:19%">Rule</th><th style="width:17%">Condition</th><th style="width:26%">Reason</th><th style="width:26%">Recommendation</th></tr></thead><tbody>` +
      topFindings.map(({ f, i }) => {
        const { plan, btn, editor } = fixBits(f, i);
        // The events finding PROMISES a list — so it carries one, expandable
        // in place: the scan's denied executions aggregated per file, exactly
        // the aggregation the fleet evidence uses.
        let evList = "";
        if (f.eventsList && scan && scan.events && Array.isArray(scan.events.entries)) {
          const agg = aggregateFleetEvents(scan.events.entries);
          if (agg.length) {
            const li = agg.slice(0, 40).map((r2) => `<li><code style="overflow-wrap:anywhere">${esc(r2.path || r2.binary || "(no path)")}</code> — <b>${r2.count}</b>× ${r2.verdict === "Blocked" ? "⛔ blocked" : "📝 audited"}${r2.users.size ? `, ${r2.users.size} user${r2.users.size === 1 ? "" : "s"}` : ""}${r2.publisher ? ` <span class="muted">· ${esc(r2.publisher)}</span>` : " <span class=\"muted\">· unsigned</span>"}</li>`).join("");
            evList = `<details class="al-evlist" style="margin-top:6px"><summary class="mini">▸ The audited and blocked list — ${agg.length} distinct file${agg.length === 1 ? "" : "s"}</summary>
              <ul class="mini al-list" style="margin:6px 0 0">${li}</ul>
              ${agg.length > 40 ? `<p class="mini muted" style="margin:4px 0 0">Showing the 40 most frequent of ${agg.length} — the Export MD report carries all of them.</p>` : ""}</details>`;
          }
        }
        // A flood finding carries its files as an expandable list — the same
        // shape as the audited list, one row instead of two hundred.
        let groupList = "";
        if (f.fleetGroup) {
          const li = f.fleetGroup.slice(0, 60).map((r2) => `<li><code style="overflow-wrap:anywhere">${esc(r2.path || r2.binary || "(no path)")}</code> — <b>${r2.count}</b>× ${r2.verdict === "Blocked" ? "⛔" : "📝"}${r2.publisher ? ` <span class="muted">· ${esc(r2.publisher)}</span>` : ""}</li>`).join("");
          groupList = `<details class="al-evlist" style="margin-top:6px"><summary class="mini">▸ The ${f.fleetGroup.length} files</summary>
            <ul class="mini al-list" style="margin:6px 0 0">${li}</ul>
            ${f.fleetGroup.length > 60 ? `<p class="mini muted" style="margin:4px 0 0">Showing 60 of ${f.fleetGroup.length} — the gap report carries all of them.</p>` : ""}</details>`;
        }
        const row = `<tr><td>${sevTag(f.sev)}${srcMark(f, true)}</td><td>${esc(f.collection)}</td><td style="overflow-wrap:anywhere">${esc(f.rule || f.ruleType)}<div class="mini muted">${esc(f.principal || "")}</div></td><td class="mini" style="word-break:normal;overflow-wrap:anywhere">${esc(f.cond || "")}</td><td class="mini">${esc(f.reason)}</td><td class="mini">${esc(f.rec)}${evList}${groupList}${plan ? `<div style="margin-top:6px">${btn}</div>` : `<span class="mini muted" title="This finding's recommendation is 'no change needed' — nothing to apply"></span>`}</td></tr>`;
        return row + (editor ? `<tr class="al-fixhost"><td colspan="6" style="padding:0">${editor}</td></tr>` : "");
      }).join("") +
      `</tbody></table></div>` : "";

    // The rules, per collection, each carrying its own findings — OUTSIDE the
    // container-query switch, because the rule list must stay reachable in the
    // narrow column where the findings table folds into the compact summary.
    const nestedCount = shown.length - topFindings.length;
    const rulesHtml = policy.collections.map((col) => col.rules.length ? `<h4 class="mini" style="margin:12px 0 6px">${esc(COLLECTION_LABEL[col.type] || col.type)} · ${esc(col.mode)}</h4>
        <div style="overflow-x:auto"><table class="plist"><tbody>` + col.rules.map((r) => {
          const c = r.conditions[0] || {};
          const cond = c.kind === "path" ? c.path : c.kind === "publisher" ? `${c.publisher} · ${c.product} · ${c.binary} [${c.low},${c.high}]` : c.kind === "hash" ? `${(c.hashes || []).length} hash(es)` : "";
          const mine = byRule.get(r.id) || [];
          const nested = mine.map(({ f, i }) => {
            const { plan, btn, editor } = fixBits(f, i);
            return `<div class="al-rule-find" style="margin-top:6px;padding:5px 9px;border-left:2px solid var(--warn-bd);background:var(--soft2)">
              ${sevTag(f.sev)}${srcMark(f, true)} <span class="mini">${esc(f.reason)}</span>
              ${f.cond && f.cond !== cond ? `<div class="mini muted" style="margin-top:2px;overflow-wrap:anywhere"><code>${esc(f.cond)}</code></div>` : ""}
              <div class="mini muted" style="margin-top:2px">${esc(f.rec)}</div>
              ${btn ? `<div style="margin-top:5px">${btn}</div>` : ""}${editor}</div>`;
          }).join("");
          return `<tr><td style="width:70px">${r.action === "Deny" ? '<span class="tag block">Deny</span>' : '<span class="tag grant">Allow</span>'}</td>
            <td>${esc(r.name)}<div class="mini muted">${esc(sidName(r.sid))} · ${esc(c.kind || "")}</div>${nested}</td>
            <td class="mini" style="min-width:180px;max-width:340px;word-break:normal;overflow-wrap:anywhere">${esc(cond)}</td>
            <td style="width:40px"><button class="btn sm danger al-del" data-col="${esc(col.type)}" data-id="${esc(r.id)}" title="Remove this rule">🗑</button></td></tr>`;
        }).join("") + `</tbody></table></div>` : "").join("");

    // Coverage is a SECTION of the same card since 10443 — it is the same
    // question from the app's side (which files does the draft answer for),
    // and a third card was a third scroll. Built here, injected below.
    const coverageHtml = '' +
      `<div style="overflow-x:auto"><table class="plist al-cov-table"><thead><tr><th style="width:34%">App</th><th style="width:110px">Verdict</th><th>Detail</th></tr></thead><tbody>` +
      coverage.map((row, i) => {
        const v = row.result;
        let detail;
        if (v.status === "unenforced") detail = esc(v.detail);
        else detail = (v.perArt || []).map((a) => {
          const file = a.art.path.split("\\").pop();
          let s2 = `<code>${esc(file)}</code> — ${a.status}`;
          if (a.why) s2 += ` <span class="mini muted">(${esc(a.why)})</span>`;
          if (a.rule) {
            s2 += ` via “${esc(a.rule.name)}”`;
            if (risky.has(a.rule.id)) s2 += ` <span class="tag new" title="The allow works, but the audit flags this rule — see its finding under the rule below">⚠ risky rule</span>`;
            if (a.versionBound) s2 += ` <span class="mini muted">(version-bounded — verify the deployed version falls inside)</span>`;
            if (a.denyCustom) s2 += ` <span class="mini muted">(a group-scoped deny “${esc(a.denyCustom.name)}” also matches — members of ${esc(sidName(a.denyCustom.sid))} are blocked)</span>`;
          }
          return s2;
        }).join("<br>");
        const canFix = v.status === "blocked" || v.status === "conditional";
        return `<tr><td><b>${esc(row.app.name)}</b><div class="mini muted">${esc(row.app.context)}</div></td>
          <td>${verdictTag(v.status, v.audit)}</td>
          <td class="mini" style="word-break:normal;overflow-wrap:anywhere">${detail}${canFix
            ? `<div style="margin-top:8px"><button class="btn sm al-fix" data-i="${i}" title="${esc(row.app.fix.note)}">🔧 Add allow rule</button></div>`
            : ""}</td></tr>`;
      }).join("") + `</tbody></table></div>`;

    // The header is STICKY: this card is the long one, and the reader should
    // always see whose card they are scrolled into.
    // THREE CARDS AGAIN (10451) — but not the three from before the merges.
    // The single card put three DIFFERENT table layouts under one roof, and
    // different layouts in one card read as a broken card; the split follows
    // the layouts. What the merges won stays won: findings nest under their
    // rules, one fix flow, sticky headers — now one per card — and the
    // ✔ Applied notice lands in whichever header is pinned above the fix.
    const appliedNote = justApplied ? `<div class="al-just mini" style="margin-top:4px;padding:4px 9px;border:1px solid var(--ok-bd);background:var(--ok-bg2);border-radius:8px;display:inline-block">✔ Applied: ${esc(justApplied)} <button class="btn sm al-just-undo" style="margin-left:6px">↩ Undo</button></div>` : "";
    const stickyHead = (host, title, note) => `<div class="al-merged-head"><h3 style="margin:0">${fsBtn(host, title)}${title} <span class="mini muted">— ${note}</span></h3>${appliedNote}</div>`;

    $("alFindings").innerHTML = stickyHead("alFindings", "Findings", "what needs a decision. NTFS/share ACL checks need Invoke-AppLockerInspector.ps1 on a host") +
      compact + topTable +
      (shown.length === 0 ? `<p class="mini muted">Nothing at this severity.</p>` : "") +
      (nestedCount ? `<p class="mini muted" style="margin:8px 0 0">${nestedCount} finding${nestedCount === 1 ? "" : "s"} about specific rules sit${nestedCount === 1 ? "s" : ""} nested in the <b>Rules</b> card below.</p>` : "");
    // Handlers below index into `shown`, so it must outlive this function.
    shownFindings = shown;

    $("alCoverage").innerHTML = stickyHead("alCoverage", "Microsoft app coverage", "would a standard user still be able to run these?") + coverageHtml;

    $("alRules").innerHTML = stickyHead("alRules", "Rules", nestedCount ? `${nestedCount} finding${nestedCount === 1 ? "" : "s"} nested under the rule${nestedCount === 1 ? "" : "s"} they are about` : "the policy's rules, per collection") + rulesHtml;
    // The add-rule form lives in its own host high in the column, not at the
    // bottom of the rules list. Same markup, same ids, wired by the same
    // wireDynamic() below — only its address changed.
    $("alAddRule").innerHTML = `<div class="list-card" style="padding:16px">
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
    document.querySelectorAll(".al-just-undo").forEach((b) => b.addEventListener("click", undoLast));
    document.querySelectorAll(".al-mode").forEach((s) => s.addEventListener("change", () => {
      mutate(`set ${s.dataset.col} to ${s.value}`, () => { ensureCollection(s.dataset.col).mode = s.value; });
    }));
    document.querySelectorAll(".al-defaults").forEach((b) => b.addEventListener("click", () => {
      mutate(`added default rules to ${b.dataset.col}`, () => addDefaultRules(b.dataset.col) > 0 ? undefined : false);
    }));
    // One undo point for the lot, not one per collection — it was one press.
    const dAll = $("alDefaultsAll");
    if (dAll) dAll.addEventListener("click", () => {
      mutate("added default rules to every collection that had none", () => {
        let added = 0;
        COLLECTIONS.forEach((t) => {
          const c = policy.collections.find((x) => x.type === t);
          if (!c || !c.rules.some((r) => r.name.startsWith("(Default Rule)"))) added += addDefaultRules(t);
        });
        return added > 0 ? undefined : false;
      });
    });
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
      // The enforcement editor has no approach/SID controls — only a mode select.
      // Everything below is guarded rather than assumed present.
      const approach = row.querySelector(".al-fx-approach");
      if (approach) {
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
      }
      const sidSel = row.querySelector(".al-fx-sid");
      if (sidSel) sidSel.addEventListener("change", () => {
        const custom = row.querySelector(".al-fx-sidcustom");
        if (custom) custom.style.display = sidSel.value === "__custom" ? "" : "none";
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
    editsSinceLoad = 0;
    resetFixState();
    recompute();
  }

  // One upload button, two file types. The scan bundle is JSON and carries the
  // policy INSIDE it, so asking the admin which button to press would be asking
  // them to know something the file already says.
  function importFile(text, name) {
    const looksJson = /\.json$/i.test(name) || /^\s*\{/.test(text);
    if (looksJson) {
      // Route by the schema the file DECLARES. Two JSON kinds arrive here: the
      // reference-machine scan bundle (which carries a policy and replaces what
      // is loaded) and the fleet events bundle (which is evidence ABOUT the
      // loaded policy and must not touch it). The events bundle often arrives
      // named .log — the collector writes it that way so Intune diagnostics
      // gathers it — which is why this sniffs content, never extension.
      let peek = null;
      try { peek = JSON.parse(text); } catch (e) { throw new Error("Not valid JSON: " + e.message); }
      if (peek && typeof peek.schema === "string" && peek.schema.startsWith(EVENTS_SCHEMA_PREFIX)) {
        eventsEvidence = parseEventsBundle(peek, name);
        return;
      }
      const b = parseBundle(text, name);
      const chosen = bundleXml(b);
      if (!chosen) throw new Error("That bundle carries no policy: the scan ran with -SkipRuleGeneration and the device's effective policy could not be read either. Re-run the scan without -SkipRuleGeneration.");
      // The bundle's policy REPLACES the draft. Edits made in the browser
      // since the last load are gone with it — a scan is made on the device
      // and cannot know them — and the scan card says so (10557).
      discardedEdits = policy ? editsSinceLoad : 0;
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
    discardedEdits = 0;
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

  function wireJump() {
    const j = $("alJump");
    if (!j) return;
    j.addEventListener("click", (e) => {
      const b = e.target.closest("[data-aljump]");
      if (!b) return;
      const el = $(b.dataset.aljump);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function init() {
    wireJump();
    $("alFile").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        importFile(await f.text(), f.name);
        // No alert for the events-first case any more: the evidence card lives
        // OUTSIDE the policy-only body now, renders immediately, and itself
        // offers the two ways to get a policy under the evidence — including
        // pulling the deployed profile from the tenant. The alert told people
        // to go hunt for a file the tenant already had.
        if (policy) loadFresh(); else render();
      }
      catch (err) { alert("Import failed: " + err.message); }
      e.target.value = "";
    });
    $("alImport").addEventListener("click", () => $("alFile").click());
    // The events entrance — same picker, same content-routed import. The
    // second button exists for the READER: two acts, two buttons.
    $("alImportEv").addEventListener("click", () => $("alFile").click());
    // Start over: everything off the table in one act — policy, scan, events
    // evidence, the tenant-pull state, the loop's manual marks, the undo
    // stack. Confirmed first because there is no undo past this, and the
    // confirm says the one thing that matters: nothing in the tenant moves.
    $("alReset").addEventListener("click", () => {
      if (!window.confirm("Start over? The loaded policy, scan and events evidence leave the table, and the loop's manual marks are cleared. Nothing in the tenant is touched.")) return;
      policy = null; scan = null; scanSource = ""; importedXmlName = "";
      eventsEvidence = null;
      evTenant = { busy: false, list: null, error: "" };
      try { localStorage.removeItem(LOOP_MANUAL_KEY); } catch { /* private mode */ }
      resetFixState();
      render();
    });
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
      const part = ($("alDlPart") || {}).value || "all";
      const col = part === "all" ? null : policy.collections.find((c) => c.type === part);
      if (part !== "all" && !col) return;

      if (pane === "intune") {
        if (!col) {
          download(intuneProfileName(intuneCfg.mode).replace(/[^A-Za-z0-9\-_.()]/g, "_") + ".json", intuneJson(intuneCfg.mode), "application/json");
          return;
        }
        // One collection from the Intune tab is the OMA-URI VALUE, not a
        // fragment of JSON — that string is what the portal asks you to paste
        // into a custom setting, so hand over exactly that.
        const mode = intuneCfg.mode === "Enforce" ? "Enabled" : "AuditOnly";
        download(`AppLocker-${col.type}-${intuneGrouping() || "Pilot"}-OMA-URI.xml`,
          collectionLines(col, "", mode).join("\n"), "application/xml");
        return;
      }
      if (!col) { download("AppLockerPolicy-TUNO.xml", exportXml(), "application/xml"); return; }
      // A single collection still ships as a whole AppLockerPolicy document.
      // A bare <RuleCollection> is not a policy and neither a GPO import nor
      // Set-AppLockerPolicy will take it.
      download(`AppLockerPolicy-TUNO-${col.type}.xml`,
        ['<AppLockerPolicy Version="1">', ...collectionLines(col, "  "), "</AppLockerPolicy>"].join("\n"),
        "application/xml");
    });
    // Clipboard access is refused outright in some contexts (no gesture, a
    // policy-locked browser). Say so on the button rather than appearing to
    // copy — the download is right next to it.
    // The popout. Delegated, because the section headings are rebuilt on every
    // render; the code panel's own button is static but goes through the same
    // path so there is one way in rather than two.
    const expand = (el, label) => {
      if (typeof Fs === "undefined" || !el) return;
      Fs.open(label, { body: el, onChange: (on) => { el.classList.toggle("fs-in", on); } });
    };
    document.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest(".al-fs");
      if (!b) return;
      expand($(b.dataset.fs), b.dataset.fslabel || "Full screen");
    });
    const dlSel = $("alDlPart");
    if (dlSel) dlSel.addEventListener("change", renderCodePane);

    const alEx = $("alExpand");
    if (alEx) alEx.addEventListener("click", () => {
      expand(document.querySelector(".al-xml"), pane === "intune" ? "Intune profile" : "Policy XML");
    });

    $("alCopyXml").addEventListener("click", (e) => {
      if (!policy) return;
      const part = ($("alDlPart") || {}).value || "all";
      const col = part === "all" ? null : policy.collections.find((c) => c.type === part);
      const mode = intuneCfg.mode === "Enforce" ? "Enabled" : "AuditOnly";
      copyToClipboard(e.currentTarget,
        pane === "intune"
          ? (col ? collectionLines(col, "", mode).join("\n") : intuneJson(intuneCfg.mode))
          : (col ? ['<AppLockerPolicy Version="1">', ...collectionLines(col, "  "), "</AppLockerPolicy>"].join("\n") : exportXml()));
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
    const bumpV = $("alIntuneBumpV");
    if (bumpV) bumpV.addEventListener("click", () => {
      intuneCfg.displayName = bumpVersionInName(intuneCfg.displayName);
      const inp = $("alIntuneName");
      if (inp) inp.value = intuneCfg.displayName;
      renderCodePane();
    });
    const regroup = $("alIntuneRegroup");
    if (regroup) regroup.addEventListener("click", () => {
      intuneCfg.grouping = newGrouping();
      const inp = $("alIntuneGrouping");
      if (inp) inp.value = intuneCfg.grouping;
      renderCodePane();
    });
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
    // The Remediation box lives in step 1 and needs no policy — render it now,
    // and re-render when its panel is opened, which is the moment the sign-in
    // state matters and may have changed since page load.
    renderRemedy();
    const remedyDetails = document.getElementById("alRemedyDetails");
    if (remedyDetails) remedyDetails.addEventListener("toggle", () => { if (remedyDetails.open) renderRemedy(); });

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
    updating: null,       // { id, name } — the in-place update awaiting its confirm
    updated: null,        // the profile updated in place THIS session
    diff: null,           // { id, name, mode, result, when } — the last compare (10560)
    error: null,          // last GraphError, shown verbatim
    note: "",
    // The Remediation pairs, keyed like REMEDY_PAIRS below. Names in the house
    // naming scheme, editable; created / coll are this session's state per pair.
    remedy: {
      cleanup: { name: "[REPAIR_TOOLS]Win - DHS - Device Security - D - Clear Applocker Settings - R27.1 - v3.8", created: null, coll: null },
      ittools: { name: "[REPAIR_TOOLS]Win - DHS - Device Security - D - Provision IT-TOOLS Folders - R27.1 - v1.1", created: null, coll: null },
      events: { name: "[REPAIR_TOOLS]Win - DHS - Device Security - D - Collect AppControl Events - R27.1 - v3.9", created: null, coll: null },
    },
  };

  // The Remediations T01 can create — one definition each. deployRemedyPair()
  // and renderRemedy() both read THIS table, so a third pair is one entry
  // here rather than a second copy of the deploy machinery. The two differ in
  // one thing that matters more than any field: the cleanup pair is scoped to
  // the migration window and unassigned after, the IT-TOOLS pair is a STANDING
  // assignment — its point is catching a folder that drifts writable later.
  const REMEDY_PAIRS = {
    cleanup: {
      detect: "Detect-TunoAppLockerPolicy.ps1",
      remediate: "Clear-TunoAppLockerPolicy.ps1",
      button: "Create the cleanup Remediation",
      blurb: `Creates one Remediation carrying <code>Detect-TunoAppLockerPolicy.ps1</code> and <code>Clear-TunoAppLockerPolicy.ps1</code> — the exact bytes this site serves — running as SYSTEM, 64-bit. Created <b>unassigned</b>: assignment (and its schedule) is a deliberate act in the portal, and this pair must be <b>scoped to the migration window and unassigned once the new policy is live</b> — left assigned, its detection reads the new policy as state to remove.`,
      description: `AppLocker migration cleanup, deployed from {SITE}. Detection: AppLocker state present (rules in the effective policy, or a tattooed SrpV2 key). Remediation: backs up, clears the local policy and the GPO tattoo, names cached MDM groupings, verifies, exit 1 when not clean. SCOPE THIS TO THE MIGRATION WINDOW and unassign it once the new policy is live — left assigned, the detection reads the new policy as state to remove.`,
      createdNote: `In the portal: Devices → Scripts and remediations → assign it to the MIGRATION group with a schedule, and put its unassignment date in the change ticket now — after the new policy lands, this pair would remove it.`,
    },
    ittools: {
      detect: "Detect-TunoItToolsFolders.ps1",
      remediate: "Initialize-TunoItToolsFolders.ps1",
      button: "Create the IT-TOOLS Remediation",
      blurb: `Creates one Remediation carrying <code>Detect-TunoItToolsFolders.ps1</code> and <code>Initialize-TunoItToolsFolders.ps1</code> — the folders provisioning as a detect-and-fix pair. Detection reports a device where the house folders are missing, where anyone outside SYSTEM and Administrators can write, or where SYSTEM itself cannot write (the house scripts log to <code>IT-TOOLS\\LOGS</code> as SYSTEM); remediation creates the folders, resets the ACL, and proves the log path by writing to it. Created <b>unassigned</b> — but unlike the cleanup pair this one is a <b>standing assignment</b>: leave it scheduled, because a folder that drifts writable after provisioning is exactly what it exists to catch. Assign it <b>before (or with) the audit profile</b>, never after the enforced one.`,
      description: `IT-TOOLS house-folder provisioning, deployed from {SITE}. Detection: a house folder is missing, writable by anyone outside SYSTEM/Administrators, or SYSTEM cannot write (logging). Remediation: creates %ProgramData%\\IT-TOOLS, \\Apps, \\Scripts and \\LOGS, disables inheritance, sets SYSTEM+Administrators full control and Users read-and-execute, verifies by ACL read-back AND by writing a log line, exit 1 when not clean. STANDING ASSIGNMENT: leave it scheduled — the standing AppLocker allows for these folders are only safe while this detection stays quiet.`,
      createdNote: `In the portal: Devices → Scripts and remediations → assign it to the estate that gets the AppLocker policy, with a recurring schedule, and LEAVE it assigned — this pair is the guard on the ACL the standing allow rules depend on, before the policy lands and after.`,
    },
    events: {
      detect: "Detect-TunoAppControlEvents.ps1",
      remediate: "Get-TunoAppControlEvents.ps1",
      button: "Create the events-collection Remediation",
      blurb: `Creates one Remediation carrying <code>Detect-TunoAppControlEvents.ps1</code> and <code>Get-TunoAppControlEvents.ps1</code> — the evidence pump. Its detection <b>always reports non-compliant on purpose</b>: the "remediation" IS the harvest, reading the CodeIntegrity and all four AppLocker logs into per-ID CSV/XML exports, an HTML report, and a <b>JSON events bundle this tool imports</b> — upload that bundle here and every blocked or audited event is matched against the draft on screen, with a recommendation per file. The report and bundle land in the Intune Management Extension Logs folder named <code>.log</code> so <b>Collect diagnostics</b> gathers them; MDE Live Response users zip them with <code>Compress-TunoAppControlReport.ps1</code>. Know the console cost: every device shows "Issue fixed" every pass — this pair's numbers mean "the collector ran", never "the device is fine".`,
      description: `App Control events collection, deployed from {SITE}. Detection: always non-compliant (the remediation IS the collection). Remediation: harvests CodeIntegrity and AppLocker events (30 days) into CSV/XML exports, an HTML report, and the TUNO JSON events bundle, all retrievable via Intune device diagnostics or MDE Live Response. Collection cadence pair - do not read its compliance numbers as device health, and unassign it when the campaign ends.`,
      createdNote: `In the portal: Devices → Scripts and remediations → assign it to the AUDIT ring with a recurring schedule (daily during the audit month is the usual cadence). Retrieve the harvest per device via Collect diagnostics, upload the <code>AppControlEvents_Bundle_*.log</code> file here, and the evidence card fills in. Unassign when the collection campaign ends — its "Issue fixed" numbers are cadence, not health.`,
    },
  };

  // Fetch a script from this site and base64 it the way deviceHealthScripts
  // wants. TextEncoder first: the scripts carry a BOM and non-ASCII box
  // characters, and btoa on raw text throws on anything outside Latin-1.
  async function fetchScriptB64(file) {
    const r = await fetch(new URL("scripts/" + file, document.baseURI).href, { cache: "no-store" });
    if (!r.ok) throw new Error(`Could not fetch ${file} from this site (HTTP ${r.status}).`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(bin);
  }

  async function deployRemedyPair(key) {
    const d = deployState;
    const p = REMEDY_PAIRS[key];
    const r = d.remedy[key];
    if (!p || !r) return;
    d.error = null;
    d.busy = "remedy-" + key;
    renderDeploy();
    try {
      const name = (r.name || "").trim();
      if (!name) throw new Error("The Remediation needs a name.");
      // Read before write — same rule as the profiles. TUNO never overwrites
      // a script it did not create; a same-name hit stops the deploy.
      const existing = await Graph.remediations();
      const coll = existing.filter((s) => String(s.displayName || "").trim().toLowerCase() === name.toLowerCase());
      r.coll = coll;
      if (coll.length) { d.busy = ""; renderDeploy(); return; }
      // The exact bytes this site serves, not a copy pasted into the code —
      // one source, the same discipline as the download buttons.
      const [detect, remediate] = await Promise.all([
        fetchScriptB64(p.detect),
        fetchScriptB64(p.remediate),
      ]);
      const made = await Graph.createRemediation({
        displayName: name,
        description: p.description.replace("{SITE}", `${BRANDING.name} ${APP_BUILD.label}`),
        publisher: BRANDING.name,
        runAsAccount: "system",
        runAs32Bit: false,
        enforceSignatureCheck: false,
        detectionScriptContent: detect,
        remediationScriptContent: remediate,
      });
      made._name = name;
      r.created = made;
      d.busy = "";
      renderDeploy();
    } catch (e) { depFail(e); }
  }

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

  // The Remediation deploy, in step 1's collapsed panel beside the downloads it
  // automates. Deliberately NOT gated on a loaded policy: a brownfield cleanup
  // happens BEFORE there is a policy worth uploading, and parking this in the
  // deploy panel hid it from exactly the person who needed it first.
  function renderRemedy() {
    const box = $("alRemedyBox");
    if (!box) return;
    const d = deployState;
    const noGraph = typeof Graph === "undefined";
    const signedIn = !noGraph && Graph.signedIn();

    if (!signedIn) {
      box.innerHTML = `<p class="mini muted" style="margin:0">Sign in with an account in the tenant you want to change and these become buttons. TUNO asks for <code>DeviceManagementScripts.ReadWrite.All</code> at the moment you press one — Remediations have their own write scope, separate from the one the profile deploy in step 5 uses, and it must be consented on the app registration first. The downloads above stay the manual route.</p>`;
      return;
    }

    const err = d.error && d.busy !== "audit" && d.busy !== "enforce" ? `<div class="al-dep-err">
        <b>${escq(d.error.kind === "admin" ? "The tenant refused this" : d.error.kind === "consent" ? "Consent was not granted" : d.error.kind === "throttled" ? "The tenant is throttling" : "Graph refused this")}.</b>
        <div style="margin-top:4px">${escq(d.error.message)}</div>
        ${d.error.code ? `<div class="mini muted" style="margin-top:4px">code <code>${escq(d.error.code)}</code>${d.error.requestId ? ` · request-id <code>${escq(d.error.requestId)}</code>` : ""}</div>` : ""}
      </div>` : "";

    box.innerHTML = err + Object.entries(REMEDY_PAIRS).map(([key, p], i) => {
      const r = d.remedy[key];
      return `<div${i ? ` style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"` : ""}>
      <p class="mini muted" style="margin:0 0 6px">${p.blurb}</p>
      <div class="al-dep-row">
        <input id="alDepRemedyName-${key}" class="al-dep-in al-dep-remedy-name" data-pair="${key}" style="flex:1;min-width:320px" value="${escq(r.name)}" spellcheck="false">
        <button class="btn primary sm al-dep-remedy" data-pair="${key}" ${d.busy ? "disabled" : ""}>${d.busy === "remedy-" + key ? "Creating…" : "🚀 " + escq(p.button)}</button>
      </div>
      ${r.coll && r.coll.length ? `<div class="al-dep-err"><b>Stopped — this tenant already has a Remediation named that.</b>
        <div class="mini" style="margin-top:4px">TUNO did not create it, so it will not change it. Rename yours, or deal with the existing one in the portal.</div>
        <ul class="mini al-list" style="margin-top:6px">${r.coll.map((c) => `<li><b>${escq(c.displayName)}</b>${c.lastModifiedDateTime ? ` · last changed ${escq(String(c.lastModifiedDateTime).slice(0, 10))}` : ""}</li>`).join("")}</ul></div>` : ""}
      ${r.created ? `<div class="al-dep-ok"><b>Created.</b> ${escq(r.created.displayName || r.created._name)} — id <code>${escq(r.created.id)}</code>, assigned to nobody. ${p.createdNote}</div>` : ""}
      </div>`;
    }).join("");

    box.querySelectorAll(".al-dep-remedy").forEach((b) => b.addEventListener("click", () => deployRemedyPair(b.dataset.pair)));
    box.querySelectorAll(".al-dep-remedy-name").forEach((el) => el.addEventListener("input", (e) => {
      const r = deployState.remedy[el.dataset.pair];
      if (!r) return;
      r.name = e.target.value;
      // A new name invalidates the last collision verdict — it was about the
      // old name, and a stop-box against a name nobody is using reads as a
      // refusal that is not happening.
      r.coll = null;
    }));
  }

  // ================================================================
  // THE AUDIT LOOP STRIP — the circle the page's 1→5 numbering hides.
  //
  // Seven stations, lit from what is actually loaded or known to be in the
  // tenant THIS SESSION — never from belief. The strip cannot see the tenant
  // without a sign-in and cannot see a portal edit at all, and says so in its
  // sublabels rather than guessing. "You are here" is the first station that
  // is not done, which is also the answer to "what do I do next".
  // ================================================================
  const LOOP_COLLAPSE_KEY = "tuno-al-loop-collapsed";
  const loopCollapsed = () => { try { return localStorage.getItem(LOOP_COLLAPSE_KEY) === "1"; } catch { return false; } };

  // Manual marks — for the stations a browser tab CANNOT verify (the portal
  // edit above all). Three rules keep them honest: EVIDENCE BEATS THE MARK in
  // both directions (a station the session can see as done ignores it, and
  // Gaps with open gaps stays amber however hard it is ticked); a manual done
  // renders DASHED with "marked by you", so a claim never dresses as evidence;
  // and marks persist per browser (guarded localStorage), because the portal
  // edit you did yesterday is still done after a refresh.
  const LOOP_MANUAL_KEY = "tuno-al-loop-manual";
  // 10460: marks are claims about ONE tenant. "Deploy audit · marked by you"
  // ticked against tenant A is not true of tenant B, so the marks carry the
  // tenant id they were made under (TunoTenant.org(), the 10457 sign-in
  // read) and CLEAR THEMSELVES the first time the strip renders under a
  // different one. Marks made signed OUT are adopted by the first tenant
  // that signs in — they were claims about the tenant the person had in
  // mind, and that is the one they then signed in to. The legacy shape
  // (bare marks, no tenant) reads as signed-out marks and migrates the
  // same way. Signed out entirely, marks keep working as before: a
  // browser that never signs in has exactly one tenant in mind.
  const loopTenantId = () => {
    try {
      const o = typeof TunoTenant !== "undefined" && TunoTenant.org && TunoTenant.org();
      return (o && o.id) || "";
    } catch { return ""; }
  };
  const loopManual = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(LOOP_MANUAL_KEY) || "{}") || {};
      const stored = raw && raw.marks ? raw : { tenant: "", marks: raw || {} };
      const t = loopTenantId();
      if (t && stored.tenant && stored.tenant !== t) { localStorage.removeItem(LOOP_MANUAL_KEY); return {}; }
      if (t && !stored.tenant && Object.keys(stored.marks).length) localStorage.setItem(LOOP_MANUAL_KEY, JSON.stringify({ tenant: t, marks: stored.marks }));
      return stored.marks || {};
    } catch { return {}; }
  };
  function loopToggleManual(key) {
    const m = loopManual();
    if (m[key]) delete m[key]; else m[key] = true;
    try { Object.keys(m).length ? localStorage.setItem(LOOP_MANUAL_KEY, JSON.stringify({ tenant: loopTenantId(), marks: m })) : localStorage.removeItem(LOOP_MANUAL_KEY); } catch { /* private mode */ }
  }

  function loopStations() {
    const signedIn = typeof Graph !== "undefined" && Graph.signedIn();
    const auditIn = !!(createdFor("audit") || (deployState.checked && deployState.checked.auditInTenant));
    const gs = fleetGapStats();
    const ruleCount = policy ? policy.collections.reduce((n, c) => n + c.rules.length, 0) : 0;
    const enforceWhy = policy ? enforceBlockedBecause() : "not there yet";
    const collectorMade = !!(deployState.remedy && deployState.remedy.events && deployState.remedy.events.created);
    return [
      { key: "scan", ico: "🖥", name: "Scan", done: !!scan, target: ".al-steps",
        sub: scan ? esc((scan.machine || {}).name || "bundle loaded") + " ✓" : "reference machine" },
      { key: "build", ico: "🛠", name: "Build", done: !!policy && ruleCount > 0, target: policy ? "#alSummary" : "#alEmpty",
        sub: policy ? ruleCount + " rules on the table" : "upload bundle or XML" },
      { key: "deploy", ico: "☁", name: "Deploy audit", done: auditIn, target: "#alDeploy",
        sub: auditIn ? "in the tenant ✓" : signedIn ? "not created yet" : "sign in to check" },
      { key: "collect", ico: "📡", name: "Collect", done: !!eventsEvidence, target: "#alRemedyDetails",
        sub: eventsEvidence ? "bundle uploaded ✓" : collectorMade ? "Remediation created — retrieve bundles" : "deploy the collector pair" },
      { key: "gaps", ico: "🕳", name: "Gaps", done: !!gs && gs.gap === 0, warn: !!gs && gs.gap > 0, target: eventsEvidence ? "#alEvents" : "#alRemedyDetails",
        sub: gs ? (gs.gap ? gs.gap + " open" : "0 open ✓") : "upload the events bundle" },
      { key: "update", ico: "↻", name: "Update profile", done: false, target: "#alDeploy",
        sub: gs && gs.gap === 0 ? "edit the tenant profile in place" : "after the gaps close" },
      { key: "enforce", ico: "🔒", name: "Enforce", done: enforceWhy === "", target: "#alEnforce",
        sub: enforceWhy === "" ? "gate open" : "gated" },
    ];
  }

  function renderLoopStrip() {
    const host = $("alLoop");
    if (!host) return;
    const st = loopStations();
    // Evidence beats the mark, both ways: a manual tick only lifts a station
    // the session cannot verify, and never one that is visibly amber.
    const manual = loopManual();
    for (const s of st) {
      s.manual = !s.done && !s.warn && !!manual[s.key];
      s.eff = s.done || s.manual;
    }
    const here = st.findIndex((s) => !s.eff);
    const collapsed = loopCollapsed();

    const summary = st.map((s, i) => `${s.name} ${s.done ? "✓" : s.manual ? "✓*" : s.warn ? "⚠ " + s.sub : i === here ? "←" : "·"}`).join("  ");
    host.innerHTML = `
      <div class="al-loop-head">
        <b>🔁 The audit loop</b>
        ${collapsed ? `<span class="al-loop-mini">${esc(summary)}</span>` : `<span class="al-loop-mini">the page reads top to bottom — the work goes around</span>`}
        <button class="btn sm al-loop-toggle" id="alLoopToggle" title="${collapsed ? "Expand the loop strip" : "Collapse to one line"}">${collapsed ? "▸" : "▾"}</button>
      </div>
      ${collapsed ? "" : `
      <div class="al-loop-row" style="margin-top:8px">
        ${st.map((s, i) => `${i ? `<span class="al-loop-arrow">→</span>` : ""}
          <span class="al-loop-wrap">
          <button class="al-loop-st ${s.eff ? "done" : s.warn ? "warn" : ""} ${s.manual ? "manual" : ""} ${i === here ? "here" : ""}" data-target="${esc(s.target)}" title="${i === here ? "You are here — click to jump" : "Jump to this part of the page"}">
            <span class="al-loop-ico">${s.ico}</span><span class="al-loop-name">${esc(s.name)}</span><span class="al-loop-sub">${s.sub}${s.manual ? " · marked by you" : ""}</span>
          </button>
          ${s.done || s.warn ? "" : `<button class="al-loop-mark ${s.manual ? "on" : ""}" data-key="${esc(s.key)}" title="${s.manual ? "Un-mark — this station goes back to waiting" : "Mark done by hand — for what this tab cannot see, like the portal edit. Shown dashed: a claim, not evidence. Marks belong to the tenant you are signed in to and clear on their own when a different tenant signs in."}">${s.manual ? "☑" : "☐"}</button>`}
          </span>`).join("")}
      </div>
      <div class="al-loop-back">↰ <span>Collect → Gaps → Update repeats until a full window shows <b>0 gaps</b> — that evidence is what the Enforce gate reads. Updating the profile happens in the portal (edit in place, same grouping); this strip cannot see it and does not pretend to.</span></div>`}
    `;

    const t = $("alLoopToggle");
    if (t) t.addEventListener("click", () => {
      try { loopCollapsed() ? localStorage.removeItem(LOOP_COLLAPSE_KEY) : localStorage.setItem(LOOP_COLLAPSE_KEY, "1"); } catch { /* private mode */ }
      renderLoopStrip();
    });
    host.querySelectorAll(".al-loop-st").forEach((b) => b.addEventListener("click", () => {
      const el = document.querySelector(b.dataset.target);
      if (!el) return;
      if (el.tagName === "DETAILS") el.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    host.querySelectorAll(".al-loop-mark").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      loopToggleManual(b.dataset.key);
      renderLoopStrip();
    }));
  }

  function renderDeploy() {
    renderRemedy();
    renderLoopStrip();
    const box = $("alDeploy");
    if (!box) return;
    const d = deployState;
    const noGraph = typeof Graph === "undefined";
    const signedIn = !noGraph && Graph.signedIn();
    if (noGraph || !policy) { box.innerHTML = ""; return; }
    // AFTER the early return: computing these is what mints the grouping, and
    // a build with no Graph should not mint identities it can never deploy.
    const name = intuneProfileName("Audit");
    const grouping = intuneGrouping();
    const issues = intuneIssues().filter((i) => i.sev === "High");

    const err = d.error ? `<div class="al-dep-err">
        <b>${escq(d.error.kind === "admin" ? "The tenant refused this" : d.error.kind === "consent" ? "Consent was not granted" : d.error.kind === "throttled" ? "The tenant is throttling" : "Graph refused this")}.</b>
        <div style="margin-top:4px">${escq(d.error.message)}</div>
        ${d.error.code ? `<div class="mini muted" style="margin-top:4px">code <code>${escq(d.error.code)}</code>${d.error.requestId ? ` · request-id <code>${escq(d.error.requestId)}</code>` : ""}</div>` : ""}
        ${d.error.consentUrl ? `<div class="mini" style="margin-top:6px">An administrator of this tenant grants it once, here: <a href="${escq(d.error.consentUrl)}" target="_blank" rel="noopener">admin consent for TUNO</a>. Nothing is granted by opening the link — it shows what is being asked for first.</div>` : ""}
      </div>` : "";

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
        <span class="mini muted">as ${(() => {
          const vm = /^(.*[\s-][Vv])(\d+(?:\.\d+)*)$/.exec(name);
          return vm
            ? `<b>${escq(vm[1])}</b><input id="alDepVer" class="al-dep-in al-dep-ver" value="${escq(vm[2])}" spellcheck="false" title="The version token in the profile name — edit it here, it moves in the name only, never in the grouping">`
            : `<b>${escq(name)}</b>`;
        })()}, grouping <b>${escq(grouping || "(none)")}</b></span>
      </div>
      <p class="mini muted" style="margin:6px 0 0"><b>The grouping is the policy's address on the device.</b> Same policy, next iteration → SAME grouping: edit the deployed profile in place (the version moves in the name, not the address). A new GUID deploys a second policy BESIDE the old one — the device merges both, and anything you removed keeps applying from the old address.
      <button class="btn sm" id="alDepCheckGroup" style="margin-left:6px" ${d.busy ? "disabled" : ""}>${d.busy === "groupcheck" ? "Checking…" : "🔎 Check against the tenant"}</button></p>
      ${d.checked && d.checked.tenantAppLocker && !tenantOtherGroupings().length ? `<p class="mini" style="margin:4px 0 0">✓ ${d.checked.tenantAppLocker.length
        ? `The grouping on screen matches the deployed profile${d.checked.tenantAppLocker[0] && d.checked.tenantAppLocker[0].id ? ` — <button class="btn sm al-dep-cmp" data-id="${escq(d.checked.tenantAppLocker[0].id)}" ${d.busy ? "disabled" : ""}>${d.busy === "compare" ? "Comparing…" : "⇄ Compare — differences only"}</button> <button class="btn sm al-dep-upd" data-id="${escq(d.checked.tenantAppLocker[0].id)}" data-name="${escq(d.checked.tenantAppLocker[0].displayName || "")}" ${d.busy ? "disabled" : ""}>✎ Update it in place</button> writes the adjusted rules and the new version name into it, assignments untouched` : " — the export edits it in place"}.`
        : "No AppLocker profile in this tenant yet — a fresh grouping is right for a first deployment."}</p>` : ""}
      ${d.diff ? diffHtml(d.diff) : ""}
      ${(() => {
        const tap = tenantOtherGroupings();
        return tap.length ? `<div class="al-dep-ok" style="margin-top:8px"><b>This tenant already runs AppLocker under a different grouping.</b>
          <div class="mini" style="margin-top:4px">Iterating on ${tap.length === 1 ? "that profile" : "one of them"}? Adopt its name and grouping — your ADJUSTED draft stays exactly as it is on screen, only the address and name change, and the export becomes an edit-in-place of the deployed profile.</div>
          <ul class="mini al-list" style="margin-top:6px">${tap.map((p, i) => `<li><button class="btn sm al-dep-adopt-id" data-i="${i}">⤓ Adopt identity</button> ${p.id ? `<button class="btn sm al-dep-cmp" data-id="${escq(p.id)}" ${d.busy ? "disabled" : ""}>⇄ Compare</button> ` : ""}<b>${escq(p.displayName || "(unnamed)")}</b>${p.lastModifiedDateTime ? ` · last changed ${escq(String(p.lastModifiedDateTime).slice(0, 10))}` : ""}</li>`).join("")}</ul></div>` : "";
      })()}

      ${coll.length ? `<div class="al-dep-err"><b>Stopped — this tenant already has ${coll.length} profile${coll.length === 1 ? "" : "s"} in the way.</b>
        <div class="mini" style="margin-top:4px">TUNO will not create a twin beside ${coll.length === 1 ? "it" : "them"}, and never overwrites anything without being told to.</div>
        <ul class="mini al-list" style="margin-top:6px">${coll.map((c) => `<li>${c.id ? `<button class="btn sm al-dep-cmp" data-id="${escq(c.id)}" ${d.busy ? "disabled" : ""}>⇄ Compare</button> <button class="btn sm al-dep-upd" data-id="${escq(c.id)}" data-name="${escq(c.displayName || "")}" ${d.busy ? "disabled" : ""}>✎ Update it in place</button> ` : ""}<b>${escq(c.displayName)}</b> — ${escq(c.why)}${c.modified ? ` · last changed ${escq(String(c.modified).slice(0, 10))}` : ""}</li>`).join("")}</ul>
        <div class="mini" style="margin-top:6px"><b>Iterating on it deliberately?</b> Then this stop is the system working. <b>Update it in place</b> writes the adjusted rules and the new version name into the deployed profile — same grouping, same profile, its assignments never move. Or do the same by hand: paste the <b>Intune profile</b> tab's values into the existing profile's OMA-URIs in the portal.</div></div>` : ""}
      ${d.updating ? `<div class="al-dep-confirm" style="margin-top:8px">
          <b>Update ${escq(d.updating.name)} in place?</b>
          <div class="mini" style="margin-top:2px">TUNO writes the rules on this table and the name <b>${escq(name)}</b> into the deployed profile. Its assignments stay exactly where they are — no second profile, nothing to move. Devices pick the change up at their next sync. This is the one edit TUNO makes to something it did not create, and it happens only on this confirmation.</div>
          <div class="al-dep-row" style="margin-top:6px">
            <button class="btn primary sm" id="alDepUpdYes" ${d.busy ? "disabled" : ""}>${d.busy === "update" ? "Updating…" : "Yes, update it"}</button>
            <button class="btn sm" id="alDepUpdNo">Cancel</button>
          </div></div>` : ""}
      ${d.updated ? `<div class="al-dep-ok"><b>Updated in place.</b> ${escq(d.updated.displayName)} — id <code>${escq(d.updated.id)}</code>. Same profile, same grouping, assignments untouched; devices get the new rules at their next sync.</div>` : ""}

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

  // The diff card — only what differs, per collection; the same-rules case
  // says so in one line, because "nothing" is the answer that matters most
  // before an update in place.
  function diffHtml(df) {
    const r = df.result;
    const ruleLine = (rule) => `<b>${escq(rule.name)}</b> <span class="muted">— ${escq(rule.action)} for ${escq(sidName(rule.sid))}</span><div class="mini muted" style="overflow-wrap:anywhere">${(rule.conditions || []).map((c) => escq(condText(c))).join("; ")}${(rule.exceptions || []).length ? ` · ${rule.exceptions.length} exception${rule.exceptions.length === 1 ? "" : "s"}` : ""}</div>`;
    const head = `<div class="al-dep-h" style="margin-top:10px"><b>⇄ ${escq(df.name)} vs the ${escq(df.mode)} profile TUNO would write</b> <span class="mini muted">differences only · compared ${escq(df.when.replace("T", " ").slice(0, 16))} UTC</span></div>`;
    if (r.same) return `<div class="al-dep-ok">${head}<div class="mini" style="margin-top:4px"><b>No differences.</b> Every collection, mode, rule, condition and exception matches — updating this profile would change nothing on any device.</div></div>`;
    const cols = r.collections.map((c) => `<div style="margin-top:8px"><b class="mini">${escq(COLLECTION_LABEL[c.type] || c.type)}</b>
      ${c.modeDiff ? `<div class="mini" style="margin-top:2px">Enforcement mode: <b>${escq(c.modeFrom || "absent")} → ${escq(c.modeTo || "absent")}</b>${c.modeTo === null ? " — the collection is not in the profile TUNO writes" : c.modeFrom === null ? " — the collection is new to the tenant" : ""}</div>` : ""}
      <ul class="mini al-list" style="margin-top:4px">
        ${c.added.map((x) => `<li><span class="tag grant">+ added</span> ${ruleLine(x)}</li>`).join("")}
        ${c.removed.map((x) => `<li><span class="tag block">− removed</span> ${ruleLine(x)}</li>`).join("")}
        ${c.changed.map((x) => `<li><span class="tag new">~ changed</span> <b>${escq(x.after.name)}</b> <span class="muted">— ${escq(x.what.join(", "))}</span>${x.what.includes("condition") ? `<div class="mini muted" style="overflow-wrap:anywhere">was: ${(x.before.conditions || []).map((k) => escq(condText(k))).join("; ")}<br>now: ${(x.after.conditions || []).map((k) => escq(condText(k))).join("; ")}</div>` : ""}</li>`).join("")}
        ${c.renamed.map((x) => `<li><span class="tag">renamed</span> <span class="muted">${escq(x.before.name)} →</span> <b>${escq(x.after.name)}</b> <span class="muted">— same rule, new name</span></li>`).join("")}
      </ul></div>`).join("");
    return `<div class="al-dep-sub" id="alDepDiff">${head}
      <p class="mini" style="margin:4px 0 0"><b>${r.added} added</b> · <b>${r.removed} removed</b> · <b>${r.changed} changed</b>${r.renamed ? ` · ${r.renamed} renamed` : ""}${r.modeChanges ? ` · ${r.modeChanges} enforcement mode change${r.modeChanges === 1 ? "" : "s"}` : ""} — everything not listed is identical.</p>
      ${cols}
      <div class="al-dep-row" style="margin-top:8px"><button class="btn sm" id="alDepDiffMd">⭳ Differences as Markdown</button></div>
    </div>`;
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
        // The tenant's AppLocker profiles, for the same-policy-same-grouping
        // guidance the panel renders — iterating on a deployed profile under
        // a FRESH guid is the mistake this catches.
        tenantAppLocker: appLockerProfilesOf(existing),
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

  // The tenant's AppLocker profiles under a DIFFERENT grouping than the one
  // on screen — the ones the adopt-identity offer is about. One filter,
  // used by the panel template and its wiring alike.
  function tenantOtherGroupings() {
    const g = String(intuneGrouping() || "").toLowerCase();
    return (deployState.checked && deployState.checked.tenantAppLocker || []).filter((p) => {
      const st = (p.omaSettings || []).find((s2) => APPLOCKER_OMA_RE.test(String(s2.omaUri || "")));
      const m = st && APPLOCKER_OMA_RE.exec(String(st.omaUri || ""));
      return m && m[1] && m[1].toLowerCase() !== g;
    });
  }

  // The grouping check stands alone: the adopt-identity offer must be
  // reachable BEFORE the deploy button is — a draft with open findings has
  // its deploy disabled, and that is exactly when someone is iterating.
  // COMPARE (10560): hold the deployed profile up against what the deploy
  // would write, and show only what differs. Re-reads the profile at the
  // click — the tenant may have moved since the grouping check.
  async function compareWithTenant(profileId) {
    const d = deployState;
    d.error = null; d.diff = null;
    d.busy = "compare";
    renderDeploy();
    try {
      const existing = await Graph.customProfiles();
      const target = existing.find((p) => p.id === profileId);
      if (!target) throw new Error("That profile is no longer in the tenant — someone deleted it since the check.");
      const mode = /Enforced/i.test(target.displayName || "") ? "Enforce" : "Audit";
      const deployed = policyOfProfile(target);
      const mine = toBeDeployedPolicy(mode);
      d.diff = { id: target.id, name: target.displayName || "(unnamed)", mode, result: diffPolicies(deployed, mine), when: new Date().toISOString() };
      d.busy = "";
      renderDeploy();
    } catch (e) { depFail(e); }
  }

  async function checkTenantGrouping() {
    const d = deployState;
    d.error = null;
    d.busy = "groupcheck";
    renderDeploy();
    try {
      const existing = await Graph.customProfiles();
      d.checked = Object.assign({}, d.checked, { tenantAppLocker: appLockerProfilesOf(existing) });
      d.busy = "";
      renderDeploy();
    } catch (e) { depFail(e); }
  }

  // UPDATE IN PLACE — the one deliberate exception to "TUNO never changes
  // what it did not create", and it exists because the alternative was worse:
  // the same-grouping stop told an iterating admin to go paste OMA-URI values
  // into the portal by hand, every loop. The rules: it runs only from the
  // stop-box's own confirm card, it re-reads the profile first (the tenant
  // may have changed since the stop), it keeps the DEPLOYED grouping — same
  // address, that is the whole point — and it replaces the omaSettings array
  // whole, so removals land. Assignments are not touched because the profile
  // object is not replaced; there is nothing to move.
  async function updateProfileInPlace() {
    const d = deployState;
    const u = d.updating;
    if (!u) return;
    d.error = null;
    d.busy = "update";
    renderDeploy();
    try {
      const existing = await Graph.customProfiles();
      const target = existing.find((p) => p.id === u.id);
      if (!target) throw new Error("That profile is no longer in the tenant — someone deleted it since the check. Re-run the deploy; there may be nothing in the way any more.");
      const mode = /Enforced/i.test(target.displayName || "") ? "Enforce" : "Audit";
      const body = intuneProfile(mode);
      // The deployed profile's own grouping wins — same address on the
      // device is what makes this an edit instead of a second policy.
      const st = (target.omaSettings || []).find((s2) => APPLOCKER_OMA_RE.test(String(s2.omaUri || "")));
      const m = st && APPLOCKER_OMA_RE.exec(String(st.omaUri || ""));
      if (m && m[1]) {
        body.omaSettings.forEach((s2) => { s2.omaUri = s2.omaUri.replace(/ApplicationLaunchRestrictions\/[^/]+\//, `ApplicationLaunchRestrictions/${m[1]}/`); });
        intuneCfg.grouping = m[1];
        const gi = $("alIntuneGrouping");
        if (gi) gi.value = m[1];
      }
      await Graph.patch(`/deviceManagement/deviceConfigurations/${encodeURIComponent(u.id)}`, body, { scopes: Graph.SCOPES.profiles });
      d.updated = { id: u.id, displayName: body.displayName };
      d.updating = null;
      // The stop was about the state before this write; after it, the profile
      // in the way IS the profile on screen. The next create-click re-reads
      // anyway — read before write does not bend.
      d.checked = Object.assign({}, d.checked, {
        collisions: [],
        auditInTenant: (d.checked && d.checked.auditInTenant) || mode === "Audit",
      });
      d.busy = "";
      renderDeploy();
      renderCodePane();
    } catch (e) { depFail(e); }
  }

  function wireDeploy() {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on("alDepCheckGroup", "click", checkTenantGrouping);
    document.querySelectorAll(".al-dep-cmp").forEach((b) => b.addEventListener("click", () => compareWithTenant(b.dataset.id)));
    on("alDepDiffMd", "click", () => {
      const df = deployState.diff; if (!df) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([diffMarkdown(df.result, df.name, df.mode)], { type: "text/markdown" }));
      a.download = `applocker-diff-${String(df.name).replace(/[^\w.-]+/g, "_")}.md`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    // The version token is editable where the name is shown: committing a
    // value moves it in the NAME only (the grouping never follows a version).
    const ver = $("alDepVer");
    if (ver) ver.addEventListener("change", () => {
      const v = ver.value.trim();
      if (!/^\d+(?:\.\d+)*$/.test(v)) { renderDeploy(); return; }
      intuneCfg.displayName = String(intuneCfg.displayName || "").replace(/([\s-][Vv])\d+(?:\.\d+)*$/, "$1" + v);
      const ni = $("alIntuneName");
      if (ni) ni.value = intuneCfg.displayName;
      renderCodePane();
      renderDeploy();
    });
    document.querySelectorAll(".al-dep-upd").forEach((b) => b.addEventListener("click", () => {
      deployState.updating = { id: b.dataset.id, name: b.dataset.name };
      renderDeploy();
    }));
    on("alDepUpdYes", "click", updateProfileInPlace);
    on("alDepUpdNo", "click", () => { deployState.updating = null; renderDeploy(); });
    document.querySelectorAll(".al-dep-adopt-id").forEach((b) => b.addEventListener("click", () => {
      const p = tenantOtherGroupings()[+b.dataset.i];
      if (p) adoptTenantIdentity(p);
    }));
    on("alDepAudit", "click", () => deployProfile("Audit"));
    on("alDepEnforce", "click", () => deployProfile("Enforce"));
    // The Remediation controls are wired by renderRemedy() itself — its box
    // renders on a different cadence, and wiring them here as well would
    // attach a second listener and double every click into two POSTs.
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

  return { init,
    // the compare engine, for the headless suite (10560)
    _diff: { parsePolicy, diffPolicies, policyOfProfile, diffMarkdown, condText, intuneProfile },
  };
})();

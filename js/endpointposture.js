// ======================================================================
// T20 — 🧭 Endpoint security posture (R31). The portal's Endpoint
// security blade, mirrored — Option B of the two-option mockup round,
// Mihai's pick. One read, three answers behind one rail:
//
//   * the DISCIPLINE NODES — every endpoint security policy in the
//     portal's own breakdown, T19's card language, plus two nodes the
//     portal does not have: settings catalog policies that configure
//     Defender (MDE) or Microsoft Edge without being endpoint security
//     templates, found by their setting definition ids;
//   * the IMPACT BRIEF — ENCA T32's translation layer, endpoint-side-out:
//     what a person will notice on their device, in end-user language,
//     every statement derived from a policy actually present and naming
//     the policies behind it, enforced-today and at-rollout never mixed;
//   * BEST PRACTICE — the ENCA MSLearn check shape (severity, what
//     Microsoft recommends, what the tenant has, remediation, the Learn
//     page) pointed at MDE and Edge. Checks are implemented independently
//     against learn.microsoft.com — the cross-check against ShadowDeploy
//     MDE (BUSL 1.1, not MIT) confirmed the defId families only; no code
//     or check text is taken from it.
//
// THE READ IS T05's collect(), settings catalog section — the T12/T19
// rule again: a second copy of the settings-catalog read (now with its
// per-policy settings) is how two tools start disagreeing about one
// tenant. collect() carries templateFamily since this build, so the
// discipline split reuses T16's own classifier (EndpointSec.disciplineOf)
// rather than a second family map. Legacy intents ride T16's intent read
// shape; the Windows device count is T16's denominator, same query.
//
// VERDICTS ARE THE HOUSE CLAIMS: OverviewTool.verdictOf — Assigned means
// reaching somebody BY CONSTRUCTION, excluded-only is its own finding,
// a filter caps reach at MAY. A best-practice check whose only correct
// configuration sits in a policy reaching nobody says NOT REACHING —
// configured is not enforced, and the difference is the finding.
//
// SETTING VALUES ARE THE DOCUMENTER'S ROWS — already through the
// redaction gate, choice values shortened to their last segment. A value
// the check set does not recognise is said to be unrecognised, never
// guessed: "open the policy" is an answer, a wrong verdict is not.
//
// Reads only, no new scope: the policy+settings read is the documenter's,
// intents ride the config read, the device count rides the device read,
// group names ride the directory read.
// ======================================================================
const EndpointPosture = (() => {
  "use strict";

  // ------------------------------------------------------------- rail --
  // The portal's Endpoint security manage nodes, in the portal's order,
  // then the two catalog nodes, then the two analyses.
  const NODES = [
    { id: "overview", icon: "🧭", label: "Overview", kind: "top" },
    { id: "av",      icon: "🦠", label: "Antivirus",                      kind: "disc", disc: "Antivirus" },
    { id: "disk",    icon: "🔐", label: "Disk encryption",                kind: "disc", disc: "Disk Encryption" },
    { id: "fw",      icon: "🧱", label: "Firewall",                       kind: "disc", disc: "Firewall" },
    { id: "edr",     icon: "📡", label: "Endpoint detection & response",  kind: "disc", disc: "EDR" },
    { id: "asr",     icon: "⚔️", label: "Attack surface reduction",       kind: "disc", disc: "Attack Surface Reduction" },
    { id: "acct",    icon: "👤", label: "Account protection",             kind: "disc", disc: "Account Protection" },
    { id: "appctl",  icon: "📵", label: "App Control for Business",       kind: "disc", disc: "App Control" },
    { id: "epm",     icon: "🧑‍💼", label: "Endpoint Privilege Management", kind: "disc", disc: "Endpoint Privilege Management" },
    { id: "mde",     icon: "🎛", label: "MDE in settings catalog",        kind: "catalog" },
    { id: "edge",    icon: "🌐", label: "Edge in settings catalog",       kind: "catalog" },
    { id: "impact",  icon: "🗣", label: "Impact brief",                   kind: "analysis" },
    { id: "bp",      icon: "🎓", label: "Best practice",                  kind: "analysis" },
    { id: "score",   icon: "📊", label: "Secure Score gaps",              kind: "analysis" },
  ];
  const nodeById = (id) => NODES.find((n) => n.id === id) || null;
  const DISC_NODE = {};
  NODES.forEach((n) => { if (n.disc) DISC_NODE[n.disc] = n.id; });

  // The catalog scans, by settingDefinitionId family. The families were
  // cross-checked against real exported policies; the checks themselves
  // are grounded on learn.microsoft.com, linked per check below.
  const MDE_RE = /(_policy_config_defender_|_defender_configuration_|windowsadvancedthreatprotection|vendor_msft_firewall_mdmstore|_policy_config_webthreatdefense_|windowsdefendersecuritycenter)/i;
  const EDGE_RE = /microsoft_edge/i;

  // -------------------------------------------------------- classify --
  // One doc item (the documenter's shape, carrying templateFamily and
  // rows since this build) -> the set of rail nodes it belongs to.
  // An endpoint security template goes to its discipline; anything else
  // is scanned for MDE / Edge definition ids — a policy that configures
  // both belongs to both, said rather than picked.
  function classify(doc) {
    const fam = String(doc.templateFamily || "");
    if (/^endpointSecurity/i.test(fam)) {
      const d = EndpointSec.disciplineOf(fam);
      return [DISC_NODE[d] || "otherdisc"];
    }
    const out = [];
    const rows = doc.rows || [];
    if (rows.some((r) => r.defId && MDE_RE.test(r.defId))) out.push("mde");
    if (rows.some((r) => r.defId && EDGE_RE.test(r.defId))) out.push("edge");
    return out;
  }

  // Legacy intents -> discipline node via T16's template-name classifier.
  function intentNode(templateName) {
    const d = EndpointSec.disciplineOfTemplateName(templateName || "");
    return d ? (DISC_NODE[d] || null) : null;
  }

  // ------------------------------------------------- setting matchers --
  // The documenter's rows: { name, value, defId } with choice values
  // shortened to their last segment ("block", "1", "mode" for _audit_mode).
  const rowsOf = (doc) => (doc && doc.rows) || [];
  const findRow = (doc, re) => rowsOf(doc).find((r) => r.defId && re.test(r.defId)) || null;
  const val = (doc, re) => { const r = findRow(doc, re); return r ? String(r.value || "").toLowerCase() : null; };
  const anyDoc = (docs, re) => docs.filter((d) => rowsOf(d).some((r) => r.defId && re.test(r.defId)));
  // Value tails, normalised: catalogRows keeps the last "_" segment, so
  // "..._audit_mode" arrives as "mode" — treated as audit, deliberately.
  const isOn = (v) => v === "1" || v === "true" || v === "allowed" || v === "enabled" || v === "on" || v === "yes";
  const isOff = (v) => v === "0" || v === "false" || v === "disabled" || v === "off" || v === "no";
  const isBlockV = (v) => v === "1" || v === "block" || v === "blocked" || v === "enable" || v === "enabled";
  const isAuditV = (v) => v === "2" || v === "audit" || v === "mode" || v === "auditmode";

  // The three reach states, spoken the brief's way.
  const STATE_WORD = { assigned: "enforced now", unassigned: "not assigned yet", excludedOnly: "excluded-only — reaches nobody" };
  const stateOf = (doc) => OverviewTool.verdictOf(doc);

  // ---------------------------------------------- interim (build 10480) --
  // Mihai's tenant convention: a policy with (TO-BE-REMOVED) in its name
  // is in place NOW and is PHASED OUT at rollout. That is a third
  // temporal state, and both analyses must speak it: a brief statement
  // carried only by interim policies is enforced today and STOPS at
  // rollout (unless a staged replacement exists), and a best-practice
  // check that passes only through interim policies is a pass with an
  // expiry date — flagged, never silently green.
  const isInterim = (doc) => /TO[-\s]?BE[-\s]?REMOVED/i.test(String((doc && doc.name) || ""));
  // App Control enforcement mode (10481) — read from the policy content,
  // never assumed: the OIB baseline ships WDAC policies whose XML says
  // "Enabled:Audit Mode", and an audit-mode policy blocks NOTHING. The
  // audit flag is stamped by the documenter's catalogRows from the RAW
  // value (the display row loses the word to tail-shortening and the
  // 300-char cap). No rows readable = unknown, said as unknown.
  const appctlMode = (doc) => {
    if (!doc || doc.detailError || !rowsOf(doc).length) return "unknown";
    return rowsOf(doc).some((r) => r.audit) ? "audit" : "enforce";
  };

  const stateWordOf = (doc) => {
    const st = stateOf(doc);
    if (st === "assigned" && isInterim(doc)) return "enforced now — interim, retired at rollout";
    return STATE_WORD[st];
  };

  // ------------------------------------------- device reach (build 10479) --
  // How many Intune Windows devices a finding's policies actually target,
  // and how many the tenant leaves out — TARGETS, NOT CHECK-INS: this is
  // assignment arithmetic, the same claim the rest of the house makes.
  // Tenant-wide is the whole Windows fleet; group targets are summed by
  // member count (Graph.memberCount, the AppLocker deploy's own seam) —
  // members as the groups are built, users or devices, overlaps NOT
  // deduplicated, exclusions NOT subtracted, a filter capping at may.
  // Every one of those limits is worn on the line, because a device
  // number that hides its arithmetic is how a claim becomes a lie.
  // `state` picks which of the statement's policies the arithmetic is about:
  // "assigned" is what is enforced NOW, "planned" is the staged policy that
  // is not assigned yet — the same sum over a different half of the same
  // list, so today and the destination cannot drift into two arithmetics.
  function deviceReach(docs, counts, deviceCount, opts) {
    const want = (opts && opts.state) || "assigned";
    const live = (docs || []).filter((d) => (want === "planned" ? stateOf(d) !== "assigned" : stateOf(d) === "assigned"));
    const out = { live: live.length, wide: false, groups: 0, reached: 0, missing: null, filtered: false, excludes: 0, unknownGroups: 0 };
    if (!live.length) { out.missing = deviceCount == null ? null : deviceCount; return out; }
    const ids = new Set();
    const fnames = new Map();
    for (const d of live) for (const a of (d.assignments || [])) {
      if (a.kind === "All devices" || a.kind === "All users") out.wide = true;
      else if (a.kind === "Included" && a.groupId) ids.add(String(a.groupId).toLowerCase());
      else if (a.kind === "Excluded") out.excludes++;
      if (a.filterId && a.kind !== "Excluded") {
        out.filtered = true;
        const k = `${String(a.filterId).toLowerCase()}|${String(a.filterType || "").toLowerCase()}`;
        if (!fnames.has(k)) fnames.set(k, (typeof Docs !== "undefined" && Docs.filterLabel) ? Docs.filterLabel(a) : "an assignment filter");
      }
    }
    out.groups = ids.size;
    out.filterNames = [...fnames.values()];
    // A FILTER ONLY EVER NARROWS. Include mode keeps the devices the rule
    // matches and drops the rest; exclude mode drops the ones it matches.
    // Either way the number a browser can compute is a CEILING, never the
    // reach — the service evaluates the rule against inventory this tab
    // cannot see. So a filtered target stops claiming a count and starts
    // claiming a bound, and the missing side flips with it: at most this
    // many reached means at least that many missed.
    out.cap = out.filtered;
    if (out.wide) {
      out.reached = deviceCount == null ? null : deviceCount;
      out.missing = deviceCount == null ? null : 0;
      return out;
    }
    let n = 0;
    for (const id of ids) {
      const c = counts ? counts[id] : null;
      if (c == null || !Number.isFinite(Number(c))) out.unknownGroups++;
      else n += Number(c);
    }
    // EVERY count unreadable is not a sum of zero — it is no sum at all.
    // 10479 returned reached = 0 here, which rendered as "~0 devices" with a
    // (floor) note beside it; a reader takes "~0" as a measurement and the
    // caveat as a footnote. Nothing was measured, so nothing is claimed.
    out.reached = (out.unknownGroups && out.unknownGroups === ids.size) ? null : n;
    out.missing = (deviceCount == null || out.reached == null) ? null : Math.max(0, deviceCount - n);
    return out;
  }

  // THE UNWRAP, AS A NAMED SEAM (10487) — because the bug it replaces was
  // invisible from every direction: Graph.pool hands back { item, value } on
  // success and { item, error } on failure, 10479 read the WRAPPER as the
  // count, and Number.isFinite was quietly false every single time. Nothing
  // threw. The screen simply said "~0 of 9969 · 9969 still missing (floor)"
  // about groups Graph had answered for perfectly well. A wrong number that
  // renders is worse than an exception, and the only defence is a test — so
  // the unwrap stopped living inside run() where no test can reach it.
  // A count is a NUMBER or it is unknown; unknown is COUNTED, never zero.
  function countsFrom(ids, results) {
    const counts = {};
    let errors = 0;
    (ids || []).forEach((id, i) => {
      const r = (results || [])[i];
      // TWO SHAPES OF FAILURE, and the second one nearly repeated the bug
      // this seam exists to prevent. pool() wraps a throw as { item, error },
      // but the worker catches its own errors and returns null — so a 403'd
      // group arrives as { item, value: null }, and Number(null) is 0. A
      // refused group would have contributed a confident zero to the sum
      // with no floor caveat raised: exactly 10479's failure wearing a new
      // hat. Absent is unknown BEFORE it is a number.
      const raw = (r && typeof r === "object" && "error" in r) ? undefined
        : (r && typeof r === "object" && "value" in r) ? r.value : r;
      const v = (raw === null || raw === undefined || raw === "") ? NaN : Number(raw);
      counts[id] = Number.isFinite(v) ? v : null;
      if (!Number.isFinite(v)) errors++;
    });
    return { counts, errors };
  }

  // The one sentence both the screen and the export speak.
  function reachLine(r, deviceCount) {
    const D = deviceCount;
    const caveats = [];
    if (r.wide) caveats.push("tenant-wide target");
    if (!r.wide && r.groups) caveats.push(`${r.groups} included group${r.groups === 1 ? "" : "s"} summed by member count — members as the groups are built, overlaps not deduplicated`);
    if (r.unknownGroups && r.reached != null && !r.cap) caveats.push(`${r.unknownGroups} group count${r.unknownGroups === 1 ? "" : "s"} unreadable, the sum is a floor`);
    else if (r.unknownGroups) caveats.push(`${r.unknownGroups} group count${r.unknownGroups === 1 ? "" : "s"} unreadable`);
    // Members are counted AS THE GROUPS ARE BUILT — a group of users, or two
    // groups holding the same machine, both push the sum past the fleet. A
    // bound larger than the thing it bounds is not a bound.
    if (r.reached != null && deviceCount != null && r.reached > deviceCount) caveats.push(`the sum exceeds the ${deviceCount}-device fleet — overlapping groups, or groups of users rather than devices, are counted once each`);
    if (r.excludes) caveats.push(`${r.excludes} exclusion${r.excludes === 1 ? "" : "s"} not subtracted`);
    if (r.filtered) caveats.push(`⚑ ${(r.filterNames && r.filterNames.length) ? r.filterNames.join("; ") : "an assignment filter"} narrows this — the service evaluates the rule against inventory a browser cannot see`);
    const cav = caveats.length ? ` (${caveats.join("; ")})` : "";
    if (!r.live || (r.reached === 0 && !r.unknownGroups)) {
      return D == null
        ? `0 devices targeted — and the Windows device count could not be read, so how many are missing is unknown, not zero`
        : `0 of ${D} enrolled Windows devices targeted — all ${D} are missing this control`;
    }
    // Reach unknown has two causes and they read differently: no member count
    // came back at all, or the fleet size did not. Neither is a number.
    if (r.reached == null) {
      return r.groups
        ? `${r.groups} group${r.groups === 1 ? "" : "s"} targeted — not one member count could be read, so how many devices this reaches is UNKNOWN, not zero${D == null ? "" : ` (the fleet is ${D})`}${cav}`
        : `the Windows device count could not be read — reach is unknown, not zero${cav}`;
    }
    if (D == null) return `${r.cap ? "at most " : "~"}${r.reached} devices targeted — the Windows device count could not be read, so how many are missing is unknown${cav}`;
    // Three verbs, and which one is honest depends on which way the
    // uncertainty leans. A FILTER caps: at most this many, so at least that
    // many missed. An UNREADABLE group count floors: at least this many, so
    // at most that many missed. Both at once has no useful bound in either
    // direction and says so rather than picking the flattering one.
    if (r.cap && r.unknownGroups) {
      return `${r.groups} group${r.groups === 1 ? "" : "s"} targeted of a ${D}-device fleet — bounded on neither side: ${r.unknownGroups} member count${r.unknownGroups === 1 ? "" : "s"} unreadable puts the sum low, and the filter puts it high. How many devices this reaches is not computable here${cav}`;
    }
    const verb = r.cap ? "at most " : r.unknownGroups ? "at least " : "~";
    const missing = `${r.cap ? "at least " : r.unknownGroups ? "at most " : ""}${r.missing}`;
    return `${verb}${r.reached} of ${D} enrolled Windows devices targeted · ${missing} not targeted — targets, not check-ins${cav}`;
  }

  // ------------------------------------------------------ impact brief --
  // One rule = one statement in the communication — T32's contract, the
  // wording translated from sign-ins to devices. `match` decides from a
  // policy's settings whether the statement is true of it; `expect` is
  // what the person notices, `lost` what stops being possible. End-user
  // language on purpose: the output is meant to be pasted into a
  // rollout mail, not read by an engineer.
  const RULES = [
    { id: "rt", icon: "🦠", title: "Files are checked the moment they arrive",
      match: (d) => isOn(val(d, /allowrealtimemonitoring/i)),
      expect: "Every file you download, open or copy is scanned automatically in the background. A malicious file is quarantined before it can run — you see a notification, not a question.",
      lost: null },
    { id: "cloud", icon: "☁️", title: "Unknown files get a second opinion",
      match: (d) => isOn(val(d, /allowcloudprotection/i)),
      expect: "A brand-new, never-seen file can be held for a few seconds while Microsoft's cloud analyses it. Rare, quick, and the reason brand-new malware does not get a head start.",
      lost: null },
    { id: "pua", icon: "🧩", title: "Bundled junkware is blocked",
      match: (d) => { const v = val(d, /puaprotection/i); return v !== null && isBlockV(v); },
      expect: "Installers that bundle toolbars, ad-injectors or 'PC optimizers' are blocked as potentially unwanted apps, even when they are not technically viruses.",
      lost: "Installing free-download bundles that carry adware alongside the app you wanted." },
    { id: "np", icon: "🕸", title: "Dangerous websites are blocked system-wide",
      match: (d) => { const v = val(d, /enablenetworkprotection/i); return v !== null && isBlockV(v); },
      expect: "Connections to known-malicious sites are blocked in every app, not just the browser. A blocked page shows a Windows notification naming the block.",
      lost: "Reaching phishing and malware-hosting sites from any application." },
    { id: "asrblock", icon: "⚔️", title: "Common attack tricks stop working",
      match: (d) => rowsOf(d).some((r) => /attacksurfacereductionrules/i.test(r.defId || "") && isBlockV(String(r.value || "").toLowerCase())),
      expect: "Office files cannot silently start programs, scripts from e-mail cannot launch downloads, and unsigned programs on USB sticks will not run. Normal documents and macros your team relies on keep working — these rules target behaviour, not file types.",
      lost: "Macro-driven installers, executable e-mail attachments, and running unsigned tools straight from a USB stick." },
    { id: "asrwarn", icon: "⚠️", title: "Some protections warn before they block",
      match: (d) => rowsOf(d).some((r) => /attacksurfacereductionrules/i.test(r.defId || "") && String(r.value || "").toLowerCase() === "warn"),
      expect: "For some rules you get a warning you can click through when you genuinely need to — the bypass lasts 24 hours and is visible to IT.",
      lost: null },
    { id: "bde", icon: "🔐", title: "The disk encrypts itself",
      match: (d) => isOn(val(d, /requiredeviceencryption/i)),
      expect: "Company Windows devices encrypt silently in the background — nothing to click, no slowdown you would notice. If a laptop is lost or stolen, the data on it stays locked; the recovery key is stored centrally, not your problem to keep.",
      lost: "Reading a lost or stolen laptop's disk by pulling it out — for anyone, including thieves." },
    { id: "fw", icon: "🧱", title: "Unsolicited network connections are refused",
      match: (d) => rowsOf(d).some((r) => /mdmstore_(domain|private|public)profile_enablefirewall/i.test(r.defId || "") && isOn(String(r.value || "").toLowerCase())),
      expect: "The Windows firewall is on and managed. Apps you use normally are unaffected; a new app that needs to accept incoming connections may need an IT-approved rule instead of a local exception.",
      lost: "Locally allowing an app through the firewall and having it stay that way." },
    { id: "edr", icon: "📡", title: "The security team can see and respond to threats",
      match: (d) => rowsOf(d).some((r) => /windowsadvancedthreatprotection/i.test(r.defId || "")) || /EndpointDetectionAndResponse/i.test(String(d.templateFamily || "")),
      expect: "Devices report security signals to Microsoft Defender for Endpoint so a real attack can be spotted and stopped centrally. It watches for attack behaviour — it is not a productivity or activity monitor.",
      lost: null },
    { id: "edgess", icon: "🌐", title: "Edge gives risky sites and downloads a red light",
      match: (d) => isOn(val(d, /_smartscreenenabled/i)),
      expect: "Microsoft Edge checks sites and downloads against a reputation service. A known-bad page or file gets a full-page warning; a genuinely needed blocked file goes via the helpdesk.",
      lost: null },
    { id: "edgeoverride", icon: "🚦", title: "The red light cannot be run",
      match: (d) => isOn(val(d, /preventsmartscreenpromptoverride(forfiles)?$/i)),
      expect: "SmartScreen warnings in Edge cannot be clicked through — the Continue anyway link is gone on flagged sites and downloads.",
      lost: "Bypassing a SmartScreen warning on your own judgement." },
    { id: "edgepw", icon: "🔑", title: "Edge stops offering to save passwords",
      match: (d) => { const v = val(d, /passwordmanagerenabled/i); return v !== null && isOff(v); },
      expect: "Edge no longer offers to remember passwords — use the company password manager instead. Already-saved passwords stop filling.",
      lost: "Keeping work passwords in the browser's own store." },
    { id: "acct", icon: "👤", title: "Signing in gets stronger than a password",
      match: (d) => /AccountProtection/i.test(String(d.templateFamily || "")) && !/LocalUsersAndGroups|LocalUserGroupMembership/i.test(String(d.templateName || "")),
      expect: "Windows Hello (PIN, fingerprint or face) becomes the way into the device — faster than a password and it never leaves the machine.",
      lost: null },
    { id: "appctl", icon: "📵", title: "Only approved software runs",
      match: (d) => /ApplicationControl/i.test(String(d.templateFamily || "")) && appctlMode(d) === "enforce",
      expect: "Devices in scope only run software the organization has approved. A new tool you need goes through IT rather than a download-and-run.",
      lost: "Installing and running arbitrary downloaded software on managed devices." },
    { id: "appctlaudit", icon: "🕵", title: "Approved-software control is inventorying, not blocking yet",
      match: (d) => /ApplicationControl/i.test(String(d.templateFamily || "")) && appctlMode(d) === "audit",
      expect: "App Control runs in audit mode: everything still runs, and what WOULD have been blocked is being recorded. Nothing changes for you today — the enforcement step comes later, announced separately.",
      lost: null },
    { id: "appctlunknown", icon: "❔", title: "Approved-software control whose mode could not be read",
      match: (d) => /ApplicationControl/i.test(String(d.templateFamily || "")) && appctlMode(d) === "unknown",
      expect: "An App Control policy exists but its content could not be read from here, so whether it blocks or only audits is unknown — verify in the portal before communicating either.",
      lost: null },
  ];

  function analyzeImpact(docs) {
    const items = [];
    for (const rule of RULES) {
      const hits = docs.filter((d) => {
        if (isInterim(d) && stateOf(d) !== "assigned") return false;   // retired interim: not today, not the plan (10481)
        try { return rule.match(d); } catch (e) { return false; }
      });
      if (!hits.length) continue;
      const states = { assigned: 0, unassigned: 0, excludedOnly: 0 };
      hits.forEach((d) => states[stateOf(d)]++);
      // The interim split (10480): a statement carried today ONLY by
      // (TO-BE-REMOVED) policies either hands over to a staged permanent
      // policy at rollout (transition) or simply STOPS (goesAway) — two
      // different sentences in a communication, never blurred.
      const live = hits.filter((d) => stateOf(d) === "assigned");
      const permLive = live.filter((d) => !isInterim(d));
      const interimLive = live.filter(isInterim);
      const staged = hits.filter((d) => stateOf(d) !== "assigned" && !isInterim(d));
      items.push({
        rule: rule.id, icon: rule.icon, title: rule.title,
        text: rule.expect, lost: rule.lost || null, states,
        liveNow: states.assigned > 0,
        interimOnly: !permLive.length && interimLive.length > 0,
        transition: !permLive.length && interimLive.length > 0 && staged.length > 0,
        goesAway: !permLive.length && interimLive.length > 0 && !staged.length,
        filtered: live.some((d) => OverviewTool.filterMay(d)),
        // Named, not just flagged (10484): "scoped by an assignment filter"
        // tells a communications reader that some machines are left out and
        // gives them no way to find out which.
        filterNames: [...new Set(live.flatMap((d) => (typeof Docs !== "undefined" && Docs.filtersOf ? Docs.filtersOf(d) : [])))],
        docs: hits,
        pols: hits.map((d) => ({ id: d.id, name: d.name, state: stateOf(d), word: stateWordOf(d) })),
      });
    }
    // What people notice first: what is live leads, losses sort before
    // observations inside each group — the T32 ordering, kept.
    items.sort((a, b) => (b.liveNow ? 1 : 0) - (a.liveNow ? 1 : 0) || (b.lost ? 1 : 0) - (a.lost ? 1 : 0));
    return items;
  }

  // The device sentence a LIVE brief statement wears (10480, Mihai's ask):
  // the target-group count against the whole fleet — the same arithmetic
  // as the findings' line, one implementation, spoken shorter.
  function impactReachLine(item, counts, deviceCount) {
    if (!item.liveNow) return null;
    const r = deviceReach(item.docs || [], counts, deviceCount);
    const nar = r.cap ? ` — ⚑ ${(r.filterNames && r.filterNames.length) ? r.filterNames.join("; ") : "an assignment filter"} narrows it, so the real number is smaller and a browser cannot compute it` : "";
    if (r.wide) {
      return deviceCount == null
        ? `enforced now tenant-wide (device count unreadable)${nar}`
        : `enforced now on ${r.cap ? "at most all" : "all"} ${deviceCount} enrolled Windows devices${nar}`;
    }
    if (r.reached == null) {
      return r.groups
        ? `enforced now on ${r.groups} targeted group${r.groups === 1 ? "" : "s"} — no member count could be read, so how many devices is unknown, not zero`
        : null;
    }
    // Bounded on NEITHER side when a filter caps a sum that is already
    // floored by an unreadable count: the filter pushes the true number
    // down, the missing groups push it up, and "at most" would be a ceiling
    // the real reach can exceed. reachLine refuses this case; so does this.
    if (r.cap && r.unknownGroups) {
      return `${r.groups} group${r.groups === 1 ? "" : "s"} targeted${deviceCount == null ? "" : ` of a ${deviceCount}-device fleet`} — ${r.unknownGroups} member count${r.unknownGroups === 1 ? "" : "s"} unreadable puts the sum low and the filter puts it high, so how many devices this reaches is not computable here${nar}`;
    }
    const D = deviceCount == null ? "an unknown number of" : deviceCount;
    const verb = r.cap ? "at most " : r.unknownGroups ? "at least " : "~";
    const miss = r.missing == null ? "" : ` · ${r.cap ? "at least " : r.unknownGroups ? "at most " : ""}${r.missing} not yet targeted`;
    const floor = r.unknownGroups && !r.cap ? " (some group counts unreadable — this counts up from the ones that were read)" : "";
    return `enforced now on ${verb}${r.reached} of ${D} enrolled Windows devices${miss} — targets, not check-ins${floor}${nar}`;
  }

  // WHERE THIS IS GOING — the other half of the brief's device sentence
  // (10486, Mihai's ask): "enforced now on N" answers today, and says
  // nothing about the destination, which is the only number a rollout
  // communication is actually about. Read off the statement's own
  // not-yet-assigned policies, so the plan is the tenant's plan and not an
  // assumption that everything ends up fleet-wide. A staged policy with no
  // assignment at all says exactly that, because "all 9969 at rollout" is a
  // guess wearing a number.
  function rolloutLine(item, counts, deviceCount) {
    const r = deviceReach(item.docs || [], counts, deviceCount, { state: "planned" });
    if (!r.live) return null;
    const nar = r.cap ? ` — ⚑ ${(r.filterNames && r.filterNames.length) ? r.filterNames.join("; ") : "an assignment filter"} narrows it, so the real number is smaller` : "";
    if (r.wide) {
      return deviceCount == null
        ? `at rollout: targets All devices (the fleet size could not be read)${nar}`
        : `at rollout: targets All devices — all ${deviceCount} enrolled Windows devices in total${nar}`;
    }
    if (!r.groups) {
      // EXCLUDED-ONLY IS NOT UNASSIGNED — T09's distinction, and the whole
      // house keeps it. A staged policy whose every target is an exclusion
      // HAS assignments and every one of them says "not you"; calling that
      // "no assignment yet" would report a configured contradiction as an
      // empty field waiting to be filled in.
      if (r.excludes) {
        return `at rollout: the staged policy carries ${r.excludes} exclusion${r.excludes === 1 ? "" : "s"} and no include — as targeted today it would reach nobody`;
      }
      // THE NUMBER LEADS, THE CAVEAT FOLLOWS. "Where is this going" is the
      // question a rollout communication exists to answer, and the fleet
      // total is the only honest figure available when the staged policy
      // has no target yet — so it is stated, and immediately labelled as an
      // intention rather than a reading. Burying it behind the caveat left
      // the brief with no destination number at all.
      return deviceCount == null
        ? `at rollout: destination unknown — the staged policy carries no assignment yet, and the fleet size could not be read either`
        : `at rollout: all ${deviceCount} enrolled Windows devices in total — the staged policy carries NO assignment yet, so the fleet total is the intention, not a reading`;
    }
    // Below here is defence, not a path a tenant reaches today: a policy
    // carrying an include target is "assigned" by construction, so a staged
    // one has no groups. Kept so that a future change to stateOf() cannot
    // silently turn a real destination into "no assignment yet".
    if (r.reached == null) return `at rollout: targets ${r.groups} group${r.groups === 1 ? "" : "s"} — no member count could be read, so the destination size is unknown, not zero`;
    if (r.cap && r.unknownGroups) {
      return `at rollout: targets ${r.groups} group${r.groups === 1 ? "" : "s"} — an unreadable member count puts the sum low and the filter puts it high, so the destination size is not computable here${nar}`;
    }
    const verb = r.cap ? "at most " : r.unknownGroups ? "at least " : "~";
    return `at rollout: targets ${r.groups} group${r.groups === 1 ? "" : "s"} — ${verb}${r.reached}${deviceCount == null ? "" : ` of ${deviceCount}`} enrolled Windows devices${nar}`;
  }

  // THE IT APPENDIX (R02). The brief above is END-USER language — it is
  // a communications draft, and that is a contract, not a style. Microsoft
  // Secure Score gaps are an administrator's document and would be noise
  // in a rollout mail, so they ride at the END, behind a heading that says
  // to cut them before sending. Appended only when the Secure Score has
  // actually been read: an absent correlation writes nothing rather than
  // an empty section implying nothing was found.
  const SCORE_CUT = `Everything below this line is for IT. Cut it before the brief is sent — it is administrator detail about the tenant's Microsoft Secure Score, not something to tell a person about their laptop.`;

  function briefMd(items, { tenantName, deviceCount = null, counts = null, corr = null, score = null } = {}) {
    const d = new Date().toISOString().slice(0, 10);
    const out = [];
    out.push(`# Endpoint security — what you will notice on your device`);
    out.push(`> ${tenantName || "This organization"} · generated ${d} from the endpoint security policies actually configured in the tenant. Draft for the communications team — review before sending.`);
    out.push(``);
    out.push(`These protections run on the device itself — they scan files, encrypt the disk and filter dangerous sites. They watch for attack behaviour: none of this reads your mail, documents or chats, and none of it measures how you work.`);
    out.push(``);
    const live = items.filter((i) => i.liveNow);
    const later = items.filter((i) => !i.liveNow);
    if (live.length) {
      out.push(`## Already enforced today`);
      for (const i of live) {
        const reach = impactReachLine(i, counts, deviceCount);
        const roll = rolloutLine(i, counts, deviceCount);
        const marks = [];
        if (i.transition) marks.push(`today through an interim policy — at rollout the staged replacement takes over`);
        if (i.filtered) marks.push(`scoped by ⚑ ${(i.filterNames && i.filterNames.length) ? i.filterNames.join("; ") : "an assignment filter"} — some devices, not all`);
        out.push(`- ${i.icon} **${i.title}** — ${i.text}${marks.length ? ` _(${marks.join("; ")})_` : ""}${reach ? `\n  - 📟 ${reach}` : ""}${roll ? `\n  - 🎯 ${roll}` : ""}`);
      }
      out.push(``);
    }
    if (later.length) {
      out.push(`## What changes at rollout`);
      out.push(`These policies exist but do not reach any device yet — they describe the plan, not today.${deviceCount != null ? ` The fleet they are heading for is ${deviceCount} enrolled Windows devices; each statement below says what its own staged policy actually targets.` : ""}`);
      for (const i of later) {
        const roll = rolloutLine(i, counts, deviceCount);
        out.push(`- ${i.icon} **${i.title}** — ${i.text}${roll ? `\n  - 🎯 ${roll}` : ""}`);
      }
      out.push(``);
    }
    const stops = items.filter((i) => i.goesAway);
    if (stops.length) {
      out.push(`## What stops at rollout`);
      out.push(`These protections run today only through interim (TO-BE-REMOVED) policies with no staged replacement — at rollout they go away. If that is not intended, stage the replacement before retiring the interim policy.`);
      for (const i of stops) out.push(`- ${i.icon} **${i.title}** — carried by ${i.pols.filter((p) => p.state === "assigned").map((p) => p.name).join("; ")}`);
      out.push(``);
    }
    const lost = items.filter((i) => i.lost);
    if (lost.length) {
      out.push(`## What will no longer be possible`);
      out.push(`Deliberate outcomes of the security design — each one closes a route attackers actively use.`);
      for (const i of lost) out.push(`- **${i.lost}** _(${i.liveNow ? "already in effect" : "at rollout"})_`);
      out.push(``);
    }
    out.push(`## If something you need is blocked`);
    out.push(`Contact the IT helpdesk with what you were doing and the message on screen. A block is almost always: a quarantined download, an attack-surface rule, a SmartScreen warning, or a firewall rule — every one has a controlled exception process.`);
    out.push(``);
    out.push(`---`);
    out.push(`### Appendix A — the policies behind each statement`);
    for (const i of items) out.push(`- ${i.icon} ${i.title}: ${i.pols.map((p) => `${p.name} [${p.word || STATE_WORD[p.state]}]`).join("; ")}`);
    if (corr) {
      out.push(``);
      out.push(`---`);
      out.push(`### Appendix B — for IT, not for the mail`);
      out.push(``);
      out.push(`> ${SCORE_CUT}`);
      out.push(``);
      out.push(scoreMd(corr, { tenantName, score }));
    }
    return out.join("\n");
  }

  // ---- Word (.docx) — T32's writer, text only, no images ----
  const X = (t) => String(t).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const P = (t, o = {}) => `<w:p><w:pPr>${o.h ? `<w:spacing w:before="${o.h === 1 ? 320 : 240}" w:after="120"/>` : `<w:spacing w:after="120"/>`}</w:pPr>` +
    (Array.isArray(t) ? t : [[t, o]]).map(([txt, ro = {}]) =>
      `<w:r><w:rPr>${ro.b || o.b || o.h ? "<w:b/>" : ""}${o.h ? `<w:sz w:val="${o.h === 1 ? 32 : 26}"/><w:color w:val="1F4729"/>` : ""}${ro.i ? "<w:i/>" : ""}</w:rPr><w:t xml:space="preserve">${X(txt)}</w:t></w:r>`).join("") + `</w:p>`;

  // The same correlation as scoreMd, written as Word paragraphs. The
  // Markdown version leans on tables and this writer has none, so the
  // pairs are written as sentences that carry BOTH names — the rule that
  // matters (a pairing a reader can check) survives the format change.
  function scoreDocxBody(corr, score) {
    const b = [];
    const s = score || {};
    b.push(P(`Appendix B — for IT, not for the mail`, { h: 2 }));
    b.push(P([[SCORE_CUT, { i: true }]]));
    b.push(P(`What Microsoft still scores against this tenant`, { h: 2 }));
    b.push(P(`Microsoft Secure Score${s.latest ? ` — ${s.latest.currentScore} of ${s.latest.maxScore} points, read ${String(s.latest.taken || "").slice(0, 10)}` : ""}. Secure Score reads the estate: what devices actually report. The checks read policy: what is configured and whether it reaches anybody. Where they disagree, the disagreement is the finding. ${corr.pointsOpen} points are still open across the endpoint controls below.`));
    const sect = (title, note, rows) => {
      if (!rows.length) return;
      b.push(P(title, { h: 2 }));
      b.push(P(note));
      rows.forEach((t) => b.push(P([[`• `, {}], [t[0], { b: true }], [t[1], {}]])));
    };
    sect(`Configured here, still unscored by Microsoft (${corr.contested.length})`,
      `The check passes and Microsoft still holds the points. That gap is almost never the policy: it is devices that have not onboarded to Defender for Endpoint, a licence the control needs, or machines that have not reported since the policy was written. Open these first — the work is already done and is not being counted.`,
      corr.contested.map((r) => [r.check.title, ` — Microsoft's ${r.open.map((c) => c.title).join("; ")}: ${r.points} point${r.points === 1 ? "" : "s"} still available.`]));
    sect(`Both readings agree it is open (${corr.confirmed.length})`,
      `A finding here and points there — two independent measurements of one weakness, and the least arguable items on the list.`,
      corr.confirmed.map((r) => [`${r.check.title} (${r.check.sev})`, ` — ${r.check.detail} Microsoft's ${r.open.map((c) => c.title).join("; ")}: ${r.points} point${r.points === 1 ? "" : "s"} still available.`]));
    sect(`Microsoft scores it, this tool has no check for it (${corr.msOnly.length})`,
      `Endpoint controls with points available that no check covers — a gap in the check set, shown rather than hidden, under Microsoft's own titles.`,
      corr.msOnly.slice(0, 25).map((c) => [c.title, ` — ${c.category}, ${c.points} point${c.points === 1 ? "" : "s"}, user impact ${c.userImpact || "not stated"}.`]));
    sect(`A finding here, full marks there (${corr.scored.length})`,
      `Microsoft is satisfied and this tool is not: the control it scores is broader or narrower than the check. The finding stands on its own evidence, it just has no points behind it.`,
      corr.scored.map((r) => [`${r.check.title} (${r.check.sev})`, ` — ${r.check.detail}`]));
    sect(`Not scored by Microsoft at all (${corr.tunoOnly.length})`,
      `Findings with no matching Secure Score control. Nothing here earns points, and every one is still real — App Control running in audit mode blocks nothing whatever the score says.`,
      corr.tunoOnly.map((r) => [`${r.check.title} (${r.check.sev})`, ` — ${r.check.detail}`]));
    b.push(P([[`Pairs are matched on Microsoft's own control id or published title, and every pair names both sides so a wrong match is visible rather than load-bearing. An unmatched control is listed under Microsoft's title instead of being dropped. ${corr.agreed} check${corr.agreed === 1 ? "" : "s"} agreed clean on both readings and ${corr.agreed === 1 ? "is" : "are"} not listed.`, { i: true }]]));
    return b;
  }

  function briefDocx(items, { tenantName, deviceCount = null, counts = null, corr = null, score = null } = {}) {
    if (typeof JSZip === "undefined") throw new Error("JSZip not loaded");
    const d = new Date().toISOString().slice(0, 10);
    const body = [];
    body.push(P(`Endpoint security — what you will notice on your device`, { h: 1 }));
    body.push(P(`${tenantName || "This organization"} · generated ${d} from the endpoint security policies actually configured in the tenant. Draft — review before sending.`));
    body.push(P(`These protections run on the device itself — they scan files, encrypt the disk and filter dangerous sites. They watch for attack behaviour: none of this reads your mail, documents or chats, and none of it measures how you work.`));
    const live = items.filter((i) => i.liveNow);
    const later = items.filter((i) => !i.liveNow);
    if (live.length) {
      body.push(P(`Already enforced today`, { h: 2 }));
      for (const i of live) {
        const reach = impactReachLine(i, counts, deviceCount);
        const marks = [];
        if (i.transition) marks.push("today through an interim policy — at rollout the staged replacement takes over");
        if (i.filtered) marks.push(`scoped by ${(i.filterNames && i.filterNames.length) ? i.filterNames.join("; ") : "an assignment filter"} — some devices, not all`);
        body.push(P([[`• ${i.title}: `, { b: true }], [i.text + (marks.length ? ` (${marks.join("; ")})` : ""), {}]]));
        if (reach) body.push(P([[`   ${reach}`, { i: true }]]));
        const roll = rolloutLine(i, counts, deviceCount);
        if (roll) body.push(P([[`   ${roll}`, { i: true }]]));
      }
    }
    if (later.length) {
      body.push(P(`What changes at rollout`, { h: 2 }));
      body.push(P(`These policies exist but do not reach any device yet — they describe the plan, not today.${deviceCount != null ? ` The fleet they are heading for is ${deviceCount} enrolled Windows devices; each statement below says what its own staged policy actually targets.` : ""}`));
      for (const i of later) {
        body.push(P([[`• ${i.title}: `, { b: true }], [i.text, {}]]));
        const roll = rolloutLine(i, counts, deviceCount);
        if (roll) body.push(P([[`   ${roll}`, { i: true }]]));
      }
    }
    const stops = items.filter((i) => i.goesAway);
    if (stops.length) {
      body.push(P(`What stops at rollout`, { h: 2 }));
      body.push(P(`These protections run today only through interim (TO-BE-REMOVED) policies with no staged replacement — at rollout they go away. If that is not intended, stage the replacement before retiring the interim policy.`));
      for (const i of stops) body.push(P([[`• ${i.title}`, { b: true }], [` — carried by ${i.pols.filter((p) => p.state === "assigned").map((p) => p.name).join("; ")}`, {}]]));
    }
    const lost = items.filter((i) => i.lost);
    if (lost.length) {
      body.push(P(`What will no longer be possible`, { h: 2 }));
      for (const i of lost) body.push(P([[`• ${i.lost}`, { b: true }], [` (${i.liveNow ? "already in effect" : "at rollout"})`, { i: true }]]));
    }
    body.push(P(`If something you need is blocked`, { h: 2 }));
    body.push(P(`Contact the IT helpdesk with what you were doing and the message on screen. A block is almost always: a quarantined download, an attack-surface rule, a SmartScreen warning, or a firewall rule — every one has a controlled exception process.`));
    body.push(P(`Appendix A — the policies behind each statement`, { h: 2 }));
    for (const i of items) body.push(P(`${i.title}: ${i.pols.map((p) => `${p.name} [${p.word || STATE_WORD[p.state]}]`).join("; ")}`));
    if (corr) scoreDocxBody(corr, score).forEach((p) => body.push(p));
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${body.join("\n")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1250" w:bottom="1080" w:left="1250"/></w:sectPr>
</w:body></w:document>`);
    return zip;
  }

  // ------------------------------------------------------ best practice --
  // The ENCA MSLearn check shape: id, node, severity, what Microsoft
  // recommends, remediation, the Learn page — and eval() returning a
  // verdict with evidence. Four verdicts:
  //   pass        — configured as recommended, in a policy reaching somebody
  //   notReaching — configured as recommended, but ONLY in policies that
  //                 reach nobody by construction (its own finding)
  //   misconfig   — configured against the recommendation
  //   gap         — nothing configures it at all
  // A value the matcher does not recognise is reported as unrecognised
  // with the policy named — never guessed into a verdict.
  //
  // helper: judge(docs-with-the-setting, good(v), bad(v)) applies the
  // reach split. Assigned-and-good beats everything; assigned-and-bad is
  // the misconfiguration; good-but-unassigned is notReaching.
  function judge(hits, re, good, bad) {
    const seen = [];
    let liveGood = null, liveBad = null, deadGood = null, unknown = null;
    for (const d of hits) {
      const v = val(d, re);
      if (v === null) continue;
      const st = stateOf(d);
      seen.push({ name: d.name, id: d.id, v, st });
      if (good(v)) { if (st === "assigned") liveGood = liveGood || d; else deadGood = deadGood || d; }
      else if (bad && bad(v)) { if (st === "assigned") liveBad = liveBad || d; }
      else unknown = unknown || { d, v };
    }
    return { seen, liveGood, liveBad, deadGood, unknown, docs: hits };
  }
  const ev = (seen) => seen.map((s) => `${s.name} = ${s.v} [${STATE_WORD[s.st]}]`).join("; ");

  function stdVerdict(j, wording) {
    if (j.liveGood) return { status: "pass", detail: `${wording.pass} ${ev(j.seen)}`, pols: j.seen, docs: j.docs };
    if (j.liveBad) return { status: "misconfig", detail: `${wording.bad} ${ev(j.seen)}`, pols: j.seen, docs: j.docs };
    if (j.deadGood) return { status: "notReaching", detail: `Configured as recommended, but only in a policy that reaches nobody by construction — configured is not enforced. ${ev(j.seen)}`, pols: j.seen, docs: j.docs };
    if (j.unknown) return { status: "unknown", detail: `Configured with a value this check does not recognise ("${j.unknown.v}") — open ${j.unknown.d.name} and read it there; a guess would be worse than a look.`, pols: j.seen, docs: j.docs };
    return { status: "gap", detail: wording.gap, pols: [], docs: [] };
  }

  const CHECKS = [
    // ── Antivirus ─────────────────────────────────────────────────────
    { id: "av-tamper", node: "av", sev: "critical", title: "Tamper protection is enforced",
      req: "Tamper protection keeps real-time protection, cloud protection and Defender's own service from being switched off by malware or a local admin. Microsoft: part of built-in protection, should be enabled.",
      fix: "Antivirus policy, Windows Security Experience profile: Tamper Protection = On.",
      doc: "https://learn.microsoft.com/defender-endpoint/prevent-changes-to-security-settings-with-tamper-protection",
      // THE DEFENDER CSP INVERTS THIS ONE: 0 is protection ON, 1 is OFF —
      // the opposite of every allow* setting. isOn/isOff would call an
      // explicit OFF a pass, so the mapping is spelled out here and only
      // the word forms are shared.
      eval: (ctx) => stdVerdict(judge(anyDoc(ctx.docs, /_tamperprotection/i), /_tamperprotection/i,
        (v) => v === "0" || v === "on" || v === "enabled" || v === "true" || v === "yes",
        (v) => v === "1" || v === "off" || v === "disabled" || v === "false" || v === "no"), {
        pass: "Enforced.", bad: "A policy sets tamper protection OFF —",
        gap: "No policy configures tamper protection. Defender's own settings can be switched off on any device by malware or a local admin." }) },
    { id: "av-rt", node: "av", sev: "critical", title: "Real-time protection is on",
      req: "Always-on scanning is the antivirus. Microsoft's always-on protection guidance: Allow Realtime Monitoring = Allowed, with behavior monitoring and on-access protection.",
      fix: "Antivirus policy: Allow Realtime Monitoring = Allowed, Allow Behavior Monitoring = Allowed, Allow On Access Protection = Allowed.",
      doc: "https://learn.microsoft.com/defender-endpoint/configure-real-time-protection-microsoft-defender-antivirus",
      eval: (ctx) => stdVerdict(judge(anyDoc(ctx.docs, /allowrealtimemonitoring/i), /allowrealtimemonitoring/i, isOn, isOff), {
        pass: "Enforced.", bad: "A policy sets real-time monitoring NOT ALLOWED —",
        gap: "No policy enforces real-time monitoring — devices run on local defaults, which any local admin can change." }) },
    { id: "av-cloud", node: "av", sev: "high", title: "Cloud protection is on",
      req: "Cloud-delivered protection plus block-at-first-sight is how a first-seen file gets caught. Microsoft: Allow Cloud Protection = Allowed, with sample submission.",
      fix: "Antivirus policy: Allow Cloud Protection = Allowed; Submit Samples Consent = send safe samples automatically.",
      doc: "https://learn.microsoft.com/defender-endpoint/cloud-protection-microsoft-defender-antivirus",
      eval: (ctx) => stdVerdict(judge(anyDoc(ctx.docs, /allowcloudprotection/i), /allowcloudprotection/i, isOn, isOff), {
        pass: "Enforced.", bad: "A policy turns cloud protection OFF —",
        gap: "No policy enforces cloud protection — block-at-first-sight has nothing to stand on." }) },
    { id: "av-pua", node: "av", sev: "medium", title: "PUA protection is set to Block",
      req: "Potentially unwanted applications (bundleware, ad-injectors) should be blocked, not audited. Microsoft: Block is the recommended option.",
      fix: "Antivirus policy: PUA Protection = Block.",
      doc: "https://learn.microsoft.com/defender-endpoint/detect-block-potentially-unwanted-apps-microsoft-defender-antivirus",
      eval: (ctx) => stdVerdict(judge(anyDoc(ctx.docs, /puaprotection/i), /puaprotection/i,
        (v) => v === "1" || v === "block", (v) => v === "0" || isAuditV(v) || isOff(v)), {
        pass: "Blocked.", bad: "PUA protection is configured but not blocking (off or audit) —",
        gap: "No policy configures PUA protection." }) },
    { id: "av-np", node: "av", sev: "high", title: "Network protection is in Block",
      req: "Network protection blocks connections to known-dangerous domains from every process. Audit observes; Block protects.",
      fix: "Antivirus policy: Enable Network Protection = Enabled (block mode). Roll audit → block, the ASR deployment shape.",
      doc: "https://learn.microsoft.com/defender-endpoint/enable-network-protection",
      eval: (ctx) => stdVerdict(judge(anyDoc(ctx.docs, /enablenetworkprotection/i), /enablenetworkprotection/i,
        (v) => v === "1" || v === "block" || v === "enabled", (v) => v === "0" || isAuditV(v) || isOff(v)), {
        pass: "Blocking.", bad: "Network protection is configured but not blocking (off or audit) —",
        gap: "No policy configures network protection." }) },
    { id: "av-updates", node: "av", sev: "low", title: "Defender update channels are managed",
      req: "Pinning platform/engine/intelligence update channels makes Defender updates deliberate instead of default — the gradual rollout process under your control.",
      fix: "Antivirus policy (Defender Update controls): set Platform, Engine and Security Intelligence update channels.",
      doc: "https://learn.microsoft.com/defender-endpoint/manage-gradual-rollout-process",
      eval: (ctx) => {
        const hits = anyDoc(ctx.docs, /_defender_configuration_(platform|engine|securityintelligence)updateschannel/i);
        if (!hits.length) return { status: "gap", detail: "No policy pins the Defender update channels — devices take the default gradual rollout. Low: a deliberate choice to leave default is defensible; say it somewhere.", pols: [], docs: [] };
        const live = hits.filter((d) => stateOf(d) === "assigned");
        return live.length ? { status: "pass", detail: `Managed: ${live.map((d) => d.name).join("; ")}`, pols: hits.map((d) => ({ name: d.name, st: stateOf(d) })), docs: hits }
          : { status: "notReaching", detail: `Configured only in policies reaching nobody: ${hits.map((d) => d.name).join("; ")}`, pols: [], docs: hits };
      } },
    // ── ASR ───────────────────────────────────────────────────────────
    { id: "asr-any", node: "asr", sev: "high", title: "ASR rules are configured at all",
      req: "Attack surface reduction rules target the behaviours ransomware actually uses. Microsoft recommends enabling all rules, standard-protection ones straight in Block.",
      fix: "Attack surface reduction policy: configure the rule set; audit-then-block for the non-standard rules.",
      doc: "https://learn.microsoft.com/defender-endpoint/attack-surface-reduction-rules-overview",
      eval: (ctx) => {
        const hits = anyDoc(ctx.docs, /attacksurfacereductionrules/i);
        if (!hits.length) return { status: "gap", detail: "No policy configures any ASR rule — the whole rule set is running on local defaults, which is off.", pols: [], docs: [] };
        const live = hits.filter((d) => stateOf(d) === "assigned");
        return live.length ? { status: "pass", detail: `Configured: ${live.map((d) => d.name).join("; ")}`, pols: [], docs: hits }
          : { status: "notReaching", detail: `ASR rules exist only in policies reaching nobody by construction: ${hits.map((d) => d.name).join("; ")}`, pols: [], docs: hits };
      } },
    { id: "asr-std", node: "asr", sev: "high", title: "The three standard-protection rules are in Block",
      req: "Microsoft: the standard-protection rules — vulnerable signed drivers, LSASS credential stealing, WMI event subscription persistence — can go to Block without prior audit (WMI: test first when Configuration Manager is in use).",
      fix: "Set the three standard-protection rules to Block; keep the rest on the audit → block path.",
      doc: "https://learn.microsoft.com/defender-endpoint/attack-surface-reduction-rules-overview",
      eval: (ctx) => {
        const STD = [
          [/blockabuseofexploitedvulnerablesigneddrivers/i, "vulnerable signed drivers"],
          [/blockcredentialstealingfromwindowslocalsecurityauthoritysubsystem/i, "LSASS credential stealing"],
          [/blockpersistencethroughwmieventsubscription/i, "WMI persistence"],
        ];
        const missing = [], weak = [], ok = [], matched = new Set();
        for (const [re, label] of STD) {
          let best = null; // block in assigned > block unassigned > other
          for (const d of ctx.docs) {
            const r = findRow(d, re);
            if (!r) continue;
            matched.add(d);
            const v = String(r.value || "").toLowerCase(); const st = stateOf(d);
            const rank = isBlockV(v) ? (st === "assigned" ? 3 : 2) : 1;
            if (!best || rank > best.rank) best = { rank, v, st, name: d.name };
          }
          if (!best) missing.push(label);
          else if (best.rank === 3) ok.push(label);
          else weak.push(`${label} (${best.v}${best.st === "assigned" ? "" : ", " + STATE_WORD[best.st]} — ${best.name})`);
        }
        if (!missing.length && !weak.length) return { status: "pass", detail: `All three in Block and reaching: ${ok.join(", ")}.`, pols: [], docs: [...matched] };
        if (missing.length === 3 && !ok.length && !weak.length) return { status: "gap", detail: "None of the three standard-protection rules is configured anywhere.", pols: [], docs: [] };
        return { status: "misconfig", detail: `${ok.length ? `In Block: ${ok.join(", ")}. ` : ""}${weak.length ? `Not blocking: ${weak.join("; ")}. ` : ""}${missing.length ? `Not configured: ${missing.join(", ")}.` : ""}`, pols: [], docs: [...matched] };
      } },
    // ── Disk encryption ───────────────────────────────────────────────
    { id: "bde-req", node: "disk", sev: "critical", title: "BitLocker is required",
      req: "Require Device Encryption is the setting that makes encryption happen rather than possible.",
      fix: "Disk encryption policy (BitLocker profile): Require Device Encryption = Enabled.",
      doc: "https://learn.microsoft.com/intune/device-configuration/endpoint-security/encrypt-bitlocker-windows",
      eval: (ctx) => stdVerdict(judge(anyDoc(ctx.docs, /requiredeviceencryption/i), /requiredeviceencryption/i, isOn, isOff), {
        pass: "Required.", bad: "A policy sets Require Device Encryption to disabled —",
        gap: "No policy requires device encryption — a lost laptop is a readable disk." }) },
    { id: "bde-silent", node: "disk", sev: "medium", title: "Silent BitLocker enablement is correctly shaped",
      req: "Silent enablement needs exactly: the third-party-encryption warning hidden, standard-user encryption allowed, and no TPM startup PIN/key (they require user interaction). Learn names all three.",
      fix: "Same BitLocker profile: Allow Warning For Other Disk Encryption = Disabled; Allow Standard User Encryption = Enabled; TPM startup PIN/key = Do not allow.",
      doc: "https://learn.microsoft.com/intune/device-configuration/endpoint-security/encrypt-bitlocker-windows#configure-silent-bitlocker-encryption",
      eval: (ctx) => {
        const base = anyDoc(ctx.docs, /requiredeviceencryption/i);
        if (!base.length) return { status: "gap", detail: "No BitLocker policy to shape — see the check above.", pols: [], docs: [] };
        const probs = [];
        for (const d of base) {
          const warn = val(d, /allowwarningforotherdiskencryption/i);
          if (warn === null || !isOff(warn)) probs.push(`${d.name}: third-party-encryption warning not hidden (silent enable breaks on the prompt)`);
          const su = val(d, /allowstandarduserencryption/i);
          if (su !== null && !isOn(su)) probs.push(`${d.name}: standard-user encryption not allowed`);
          const pin = val(d, /tpmstartuppin$/i);
          if (pin && /require/.test(pin)) probs.push(`${d.name}: a TPM startup PIN is required — silent enable cannot complete, and the user is asked at boot`);
        }
        return probs.length ? { status: "misconfig", detail: probs.join(". ") + ".", pols: [], docs: base }
          : { status: "pass", detail: "The silent-enable trio is in place on every BitLocker policy found.", pols: [], docs: base };
      } },
    // ── Firewall ──────────────────────────────────────────────────────
    { id: "fw-on", node: "fw", sev: "critical", title: "The firewall is enabled on all three profiles",
      req: "Domain, private and public profiles each carry their own enable switch — a profile left unmanaged is a profile a local admin can switch off.",
      fix: "Firewall policy: Enable Domain/Private/Public Network Firewall = true.",
      doc: "https://learn.microsoft.com/intune/device-configuration/endpoint-security/endpoint-security-firewall-policy",
      eval: (ctx) => {
        const PROFILES = ["domain", "private", "public"];
        const missing = [], off = [], dead = [], united = new Set();
        for (const p of PROFILES) {
          const re = new RegExp(`mdmstore_${p}profile_enablefirewall`, "i");
          const hits = anyDoc(ctx.docs, re);
          hits.forEach((d) => united.add(d));
          if (!hits.length) { missing.push(p); continue; }
          const live = hits.filter((d) => stateOf(d) === "assigned");
          const anyOn = (set) => set.some((d) => isOn(val(d, re)));
          if (live.length && anyOn(live)) continue;
          if (live.length) off.push(p); else if (anyOn(hits)) dead.push(p); else off.push(p);
        }
        if (!missing.length && !off.length && !dead.length) return { status: "pass", detail: "All three profiles enabled and reaching.", pols: [], docs: [...united] };
        if (missing.length === 3) return { status: "gap", detail: "No policy enables the firewall on any profile.", pols: [], docs: [] };
        return { status: "misconfig", detail: `${missing.length ? `Unmanaged profiles: ${missing.join(", ")}. ` : ""}${off.length ? `Configured but not on: ${off.join(", ")}. ` : ""}${dead.length ? `Enabled only in policies reaching nobody: ${dead.join(", ")}.` : ""}`, pols: [], docs: [...united] };
      } },
    { id: "fw-inbound", node: "fw", sev: "high", title: "Default inbound action is Block",
      req: "Block-by-default inbound with explicit allow rules is the firewall posture Microsoft's guidance assumes; an Allow default makes rules decorative.",
      fix: "Firewall policy, per profile: Default Inbound Action = Block.",
      doc: "https://learn.microsoft.com/intune/device-configuration/endpoint-security/endpoint-security-firewall-profile-settings",
      eval: (ctx) => stdVerdict(judge(anyDoc(ctx.docs, /defaultinboundaction/i), /defaultinboundaction/i,
        (v) => v === "1" || v === "block" || v === "blockinbound", (v) => v === "0" || v === "allow" || v === "allowinbound"), {
        pass: "Blocking by default.", bad: "A profile's default inbound action is ALLOW —",
        gap: "No policy sets the default inbound action — profiles run on local defaults." }) },
    // ── EDR ───────────────────────────────────────────────────────────
    { id: "edr-policy", node: "edr", sev: "critical", title: "An EDR policy reaches devices",
      req: "The EDR policy carries Defender for Endpoint onboarding — without it there is antivirus but no detection and response, and the portal shows nothing for these machines.",
      fix: "Endpoint detection and response policy from the Defender connector blob, assigned to the Windows fleet.",
      doc: "https://learn.microsoft.com/defender-endpoint/onboarding-endpoint-manager",
      eval: (ctx) => {
        const hits = ctx.docs.filter((d) => /EndpointDetectionAndResponse/i.test(String(d.templateFamily || "")) || rowsOf(d).some((r) => /windowsadvancedthreatprotection_onboarding/i.test(r.defId || "")));
        if (!hits.length) return { status: "gap", detail: "No EDR policy found — onboarding may still exist outside Intune, but nothing here carries it.", pols: [], docs: [] };
        const live = hits.filter((d) => stateOf(d) === "assigned");
        return live.length ? { status: "pass", detail: `Reaching: ${live.map((d) => d.name).join("; ")}`, pols: [], docs: hits }
          : { status: "notReaching", detail: `EDR policies exist but reach nobody by construction: ${hits.map((d) => d.name).join("; ")}`, pols: [], docs: hits };
      } },
    { id: "edr-samples", node: "edr", sev: "low", title: "Sample sharing is enabled",
      req: "Sample sharing lets Defender for Endpoint pull a suspicious file for deep analysis when investigation needs it.",
      fix: "EDR policy: Sample Sharing = All file samples.",
      doc: "https://learn.microsoft.com/intune/device-configuration/endpoint-security/endpoint-security-edr-policy",
      eval: (ctx) => stdVerdict(judge(anyDoc(ctx.docs, /_samplesharing/i), /_samplesharing/i,
        (v) => v === "1" || v === "all", (v) => v === "0" || v === "none" || isOff(v)), {
        pass: "Enabled.", bad: "Sample sharing is switched off —",
        gap: "No EDR policy sets sample sharing." }) },
    // ── Account protection / App Control ─────────────────────────────
    { id: "acct-any", node: "acct", sev: "medium", title: "Account protection is configured",
      req: "Windows Hello for Business or Credential Guard via an account protection policy takes sign-in beyond the password; LAPS covers the local admin (its audit is 🔑 T18's job, pointed at rather than repeated).",
      fix: "Account protection policy: Windows Hello for Business, or local user group membership as designed.",
      doc: "https://learn.microsoft.com/intune/device-configuration/endpoint-security/endpoint-security-account-protection-policy",
      eval: (ctx) => {
        const hits = ctx.docs.filter((d) => /AccountProtection/i.test(String(d.templateFamily || "")));
        const legacy = (ctx.intents || []).filter((i) => i.node === "acct");
        if (!hits.length && !legacy.length) return { status: "gap", detail: "No account protection policy — sign-in strength and local-group membership run unmanaged.", pols: [], docs: [] };
        const live = hits.filter((d) => stateOf(d) === "assigned");
        if (live.length) return { status: "pass", detail: `Reaching: ${live.map((d) => d.name).join("; ")}`, pols: [], docs: hits };
        if (legacy.some((i) => i.isAssigned)) return { status: "pass", detail: `Enforced through a legacy intent (${legacy.filter((i) => i.isAssigned).map((i) => i.name).join("; ")}) — the legacy surface says only assigned or not, so its device reach cannot be counted.`, pols: [], docs: hits };
        return { status: "notReaching", detail: `Account protection exists but reaches nobody: ${hits.map((d) => d.name).join("; ")}`, pols: [], docs: hits };
      } },
    { id: "appctl-any", node: "appctl", sev: "medium", title: "Application control exists somewhere",
      req: "App Control for Business (or AppLocker, which 🔐 T01 builds and validates) is the only category that stops unknown-but-not-yet-malicious software.",
      fix: "App Control for Business policy — or the AppLocker path via T01, deployed as its Intune profile.",
      doc: "https://learn.microsoft.com/windows/security/application-security/application-control/app-control-for-business/appcontrol",
      eval: (ctx) => {
        const hits = ctx.docs.filter((d) => /ApplicationControl/i.test(String(d.templateFamily || "")));
        if (!hits.length) return { status: "gap", detail: "No App Control policy in endpoint security. If AppLocker is deployed through a custom profile, this check cannot see it — T01 knows.", pols: [], docs: [] };
        const live = hits.filter((d) => stateOf(d) === "assigned");
        if (!live.length) return { status: "notReaching", detail: `App Control exists but reaches nobody: ${hits.map((d) => d.name).join("; ")}`, pols: [], docs: hits };
        // The MODE decides the verdict (10481): audit observes, enforce
        // controls, and unreadable content is unknown — never assumed.
        const enforcing = live.filter((d) => appctlMode(d) === "enforce");
        const auditing = live.filter((d) => appctlMode(d) === "audit");
        const unknown = live.filter((d) => appctlMode(d) === "unknown");
        if (enforcing.length) return { status: "pass", detail: `Enforcing: ${enforcing.map((d) => d.name).join("; ")}${auditing.length ? `. Also in audit: ${auditing.map((d) => d.name).join("; ")}` : ""}`, pols: [], docs: hits };
        if (auditing.length) return { status: "misconfig", detail: `Every reaching App Control policy is in AUDIT mode — inventory, not control: nothing is blocked today (${auditing.map((d) => d.name).join("; ")}). Deliberate during a rollout, but the brief and this check must not claim blocking until a policy enforces.`, pols: [], docs: hits };
        return { status: "unknown", detail: `Reaching App Control policies whose content could not be read (${unknown.map((d) => d.name).join("; ")}) — whether they block or audit is unknown; open them in the portal rather than trusting a guess.`, pols: [], docs: hits };
      } },
    // ── Edge ──────────────────────────────────────────────────────────
    { id: "edge-ss", node: "edge", sev: "high", title: "Edge SmartScreen is on and cannot be bypassed",
      req: "The Edge security baseline sets three: SmartScreen enabled, prompt override prevented for sites, and for downloads. Enabled-but-bypassable is advice, not protection.",
      fix: "Settings catalog (Microsoft Edge): SmartScreenEnabled, PreventSmartScreenPromptOverride, PreventSmartScreenPromptOverrideForFiles — all Enabled.",
      doc: "https://learn.microsoft.com/intune/device-security/security-baselines/ref-v2-edge-settings",
      eval: (ctx) => {
        const parts = [
          [/_smartscreenenabled/i, "SmartScreen"],
          [/preventsmartscreenpromptoverride(?!forfiles)/i, "site-warning override prevention"],
          [/preventsmartscreenpromptoverrideforfiles/i, "download-warning override prevention"],
        ];
        const missing = [], off = [], dead = [], united = new Set();
        for (const [re, label] of parts) {
          const hits2 = anyDoc(ctx.docs, re);
          hits2.forEach((d) => united.add(d));
          const j = judge(hits2, re, isOn, isOff);
          if (j.liveGood) continue;
          if (j.liveBad) off.push(label);
          else if (j.deadGood) dead.push(label);
          else missing.push(label);
        }
        if (!missing.length && !off.length && !dead.length) return { status: "pass", detail: "All three enforced.", pols: [], docs: [...united] };
        if (missing.length === 3) return { status: "gap", detail: "No policy configures Edge SmartScreen at all.", pols: [], docs: [] };
        return { status: "misconfig", detail: `${off.length ? `Disabled by policy: ${off.join(", ")}. ` : ""}${missing.length ? `Not configured: ${missing.join(", ")}. ` : ""}${dead.length ? `Configured only in policies reaching nobody: ${dead.join(", ")}.` : ""}`, pols: [], docs: [...united] };
      } },
    { id: "edge-pua", node: "edge", sev: "medium", title: "Edge blocks potentially unwanted downloads",
      req: "SmartScreenPuaEnabled extends SmartScreen to bundleware — the baseline default is Enabled.",
      fix: "Settings catalog (Microsoft Edge): SmartScreenPuaEnabled = Enabled.",
      doc: "https://learn.microsoft.com/intune/device-security/security-baselines/ref-v2-edge-settings",
      eval: (ctx) => stdVerdict(judge(anyDoc(ctx.docs, /smartscreenpuaenabled/i), /smartscreenpuaenabled/i, isOn, isOff), {
        pass: "Enforced.", bad: "Configured off —",
        gap: "Not configured anywhere." }) },
    { id: "edge-pw", node: "edge", sev: "low", title: "Edge's own password store is off",
      req: "The Edge baseline disables the browser password manager in favour of a managed vault. Low severity: a deliberate different choice is defensible — this check says what the baseline says.",
      fix: "Settings catalog (Microsoft Edge): PasswordManagerEnabled = Disabled.",
      doc: "https://learn.microsoft.com/intune/device-security/security-baselines/ref-v2-edge-settings",
      eval: (ctx) => stdVerdict(judge(anyDoc(ctx.docs, /passwordmanagerenabled/i), /passwordmanagerenabled/i, isOff, isOn), {
        pass: "Disabled, per the baseline.", bad: "Enabled by policy — the baseline says Disabled;",
        gap: "Not configured — users decide per profile." }) },
  ];

  function runChecks(ctx) {
    return CHECKS.map((c) => {
      let r;
      try { r = c.eval(ctx); }
      catch (e) { r = { status: "unknown", detail: `The check itself failed: ${String((e && e.message) || e).slice(0, 160)}`, pols: [], docs: [] }; }
      // The interim override (10480), ONE place instead of eighteen: a
      // PASS whose every reaching policy is (TO-BE-REMOVED) is a pass
      // with an expiry date — at rollout the interim policy retires and
      // this becomes a gap, unless a staged permanent policy stands
      // ready. Said as its own verdict, never worn as plain green.
      if (r.status === "pass") {
        const live = (r.docs || []).filter((d) => stateOf(d) === "assigned");
        if (live.length && live.every(isInterim)) {
          const staged = (r.docs || []).filter((d) => stateOf(d) !== "assigned" && !isInterim(d));
          r = Object.assign({}, r, {
            status: "interimOnly",
            detail: `Passes today ONLY through interim policies (${live.map((d) => d.name).join("; ")}) — retired at rollout. ${staged.length
              ? `A staged replacement exists (${staged.map((d) => d.name).join("; ")}): assign it before the interim policy goes.`
              : `No staged replacement found — at rollout this becomes the gap below the green.`} Original: ${r.detail}`,
          });
        }
      }
      return { id: c.id, node: c.node, sev: c.sev, title: c.title, req: c.req, fix: c.fix, doc: c.doc, ...r };
    });
  }
  const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  const BAD = new Set(["gap", "misconfig", "notReaching", "unknown", "interimOnly"]);
  const findings = (checks) => checks.filter((c) => BAD.has(c.status))
    .sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || a.title.localeCompare(b.title));

  function checksMd(checks, { tenantName, deviceCount = null, counts = null } = {}) {
    const d = new Date().toISOString().slice(0, 10);
    const out = [];
    out.push(`# Endpoint security — best-practice analysis`);
    out.push(`> ${tenantName || "This tenant"} · generated ${d}. Each check states what learn.microsoft.com recommends, what the tenant actually has, and the page it stands on. "Not reaching" means configured as recommended, but only in a policy that reaches nobody by construction.`);
    out.push(``);
    const bad = findings(checks);
    out.push(`**${bad.length} finding${bad.length === 1 ? "" : "s"}**, ${checks.filter((c) => c.status === "pass").length} passed, of ${checks.length} checks.`);
    out.push(``);
    const word = { gap: "GAP", misconfig: "MISCONFIGURED", notReaching: "NOT REACHING", unknown: "UNRECOGNISED VALUE", interimOnly: "PASS — INTERIM ONLY", pass: "PASS" };
    for (const c of [...bad, ...checks.filter((x) => x.status === "pass")]) {
      out.push(`## ${word[c.status]} · ${c.sev} — ${c.title}`);
      out.push(`- **Recommendation:** ${c.req}`);
      out.push(`- **This tenant:** ${c.detail}`);
      out.push(`- **Devices:** ${reachLine(deviceReach(c.docs || [], counts, deviceCount), deviceCount)}`);
      if (c.status !== "pass") out.push(`- **Remediation:** ${c.fix}`);
      out.push(`- **Source:** ${c.doc}`);
      out.push(``);
    }
    return out.join("\n");
  }

  // ================================================================== //
  // SECURE SCORE CORRELATION (R02 · T21)
  // ================================================================== //
  //
  // T20 reads POLICY: what the tenant has configured, and whether it
  // reaches anybody. Microsoft Secure Score reads the ESTATE: what the
  // devices actually report back. Those are two different questions and
  // they disagree constantly — a policy can be perfectly configured and
  // assigned tenant-wide while the score sits at zero, because the
  // machines have not onboarded, are not licensed, or have not checked
  // in since the policy was written. THE DISAGREEMENT IS THE FINDING,
  // and it is the one thing neither tool can say on its own.
  //
  // The score comes from T21's SecureScore.collect() — the one reader,
  // the T05 rule on a second surface. T20 never reads secureScores.
  //
  // ---- HOW A PAIR IS MADE, AND WHY IT IS SHOWN ----
  //
  // A check is tied to a Secure Score control by an EXPLICIT entry
  // below: a regex on Microsoft's control id, and/or one on the title
  // Microsoft publishes for it. Both are matched against Microsoft's own
  // words, never against ours.
  //
  // Control ids on this surface are not a documented contract — they are
  // provider strings that Microsoft renames — so a miss is designed to be
  // HARMLESS: an unmatched Microsoft gap falls into its own bucket and is
  // reported under Microsoft's title, and an unmatched T20 finding falls
  // into its own. Nothing is dropped by failing to match. What must never
  // happen is a WRONG pair, so every correlated row renders BOTH names —
  // the check's title and the control's title, side by side — and a
  // reader can see at a glance what was matched to what and say so if it
  // is wrong. A pairing you cannot check is a pairing you cannot trust.
  const SS_MAP = [
    { check: "av-tamper", id: /tamper/i,                                   title: /tamper protection/i },
    { check: "av-rt",     id: /realtime|real_time/i,                       title: /real[- ]?time protection/i },
    { check: "av-cloud",  id: /cloudprotection|blockatfirstsight|mapsreporting/i, title: /cloud[- ]delivered protection|block at first sight/i },
    { check: "av-pua",    id: /\bpua\b|potentiallyunwanted/i,              title: /potentially unwanted/i },
    { check: "av-np",     id: /networkprotection/i,                        title: /network protection/i },
    { check: "asr-any",   id: /attacksurfacereduction|(^|_)asr(_|$)/i,     title: /attack surface reduction/i },
    { check: "asr-std",   id: /attacksurfacereduction|(^|_)asr(_|$)/i,     title: /attack surface reduction rules/i },
    { check: "bde-req",   id: /bitlocker|diskencryption/i,                 title: /bitlocker|disk encryption/i },
    { check: "fw-on",     id: /firewall/i,                                 title: /firewall/i },
    { check: "fw-inbound", id: /firewall.*inbound|inbound.*firewall/i,     title: /inbound connections/i },
    { check: "edr-policy", id: /onboard|edrblockmode|sensor/i,             title: /onboard|endpoint detection|edr in block mode/i },
    { check: "edr-samples", id: /samplesubmission|samplesharing/i,         title: /sample submission|sample sharing/i },
    { check: "edge-ss",   id: /smartscreen/i,                              title: /smartscreen/i },
    { check: "edge-pua",  id: /edge.*(pua|unwanted)|unwanted.*edge/i,      title: /unwanted app.*(edge|browser)|edge.*unwanted/i },
  ];

  const matchesControl = (m, ctrl) =>
    (m.id && m.id.test(String(ctrl.id || ""))) || (m.title && m.title.test(String(ctrl.title || "")));

  // The verdicts a check can carry that mean "something is not right here".
  const isFinding = (c) => BAD.has(c.status);

  // correlate(checks, controls) — controls are T21's rows for the LATEST
  // reading (SecureScore.controlsFrom), full set, not pre-filtered: this
  // function needs the achieved ones to answer "Microsoft is satisfied
  // and we are not", which is as interesting as the reverse.
  //
  // Four buckets, plus the two agreements:
  //
  //   confirmed  — T20 has a finding AND Microsoft still holds points.
  //                Two independent readings of one weakness.
  //   contested  — T20 PASSES and Microsoft still holds points. The
  //                policy is right and the estate does not show it:
  //                onboarding, licensing, or devices that have not
  //                reported. This is the bucket worth opening first.
  //   scored     — T20 has a finding and Microsoft gives FULL marks.
  //                Microsoft's control is broader or narrower than the
  //                check; the finding stands, the points do not.
  //   msOnly     — an endpoint control Microsoft scores against the
  //                tenant that no T20 check covers. Named in full so a
  //                gap in the CHECK SET is visible rather than invisible.
  //   tunoOnly   — a T20 finding no Secure Score control matches.
  //                Microsoft does not score it; it is still real.
  //   agreed     — both clean. Counted, not listed.
  function correlate(checks, controls) {
    const all = (controls || []).filter((c) => !c.deprecated);
    const endpoint = all.filter((c) => ["Device", "Apps"].includes(c.category));
    const out = { confirmed: [], contested: [], scored: [], msOnly: [], tunoOnly: [], agreed: 0, matchedIds: new Set(), unscorable: [] };

    for (const c of (checks || [])) {
      const m = SS_MAP.find((x) => x.check === c.id);
      const hits = m ? all.filter((ctrl) => matchesControl(m, ctrl)) : [];
      hits.forEach((h) => out.matchedIds.add(String(h.id).toLowerCase()));
      // A matched control whose score could not be read says so rather
      // than counting as either satisfied or open — the house rule about
      // unknowns, applied to somebody else's number.
      const readable = hits.filter((h) => h.points != null);
      if (hits.length && !readable.length) { out.unscorable.push({ check: c, controls: hits }); continue; }
      const open = readable.filter((h) => h.points > 0.05);
      const points = Math.round(open.reduce((n, h) => n + h.points, 0) * 10) / 10;
      const row = { check: c, controls: readable, open, points };
      if (!hits.length) { if (isFinding(c)) out.tunoOnly.push(row); continue; }
      if (isFinding(c) && open.length) out.confirmed.push(row);
      else if (!isFinding(c) && open.length) out.contested.push(row);
      else if (isFinding(c)) out.scored.push(row);
      else out.agreed++;
    }

    out.msOnly = endpoint
      .filter((c) => c.points != null && c.points > 0.05 && !out.matchedIds.has(String(c.id).toLowerCase()))
      .sort((a, b) => b.points - a.points || a.rank - b.rank);

    const sev = (r) => SEV_ORDER[r.check.sev];
    out.confirmed.sort((a, b) => b.points - a.points || sev(a) - sev(b));
    out.contested.sort((a, b) => b.points - a.points || sev(a) - sev(b));
    out.scored.sort((a, b) => sev(a) - sev(b));
    out.tunoOnly.sort((a, b) => sev(a) - sev(b));
    out.pointsOpen = Math.round(
      ([...out.confirmed, ...out.contested].reduce((n, r) => n + r.points, 0)
        + out.msOnly.reduce((n, c) => n + c.points, 0)) * 10) / 10;
    out.matchedIds = [...out.matchedIds];
    return out;
  }

  // The Secure Score section, as Markdown. Shared by the Secure Score
  // node's own export, the impact brief's IT appendix and the Word
  // export, so all three say the same thing about one correlation.
  function scoreMd(corr, { tenantName, score } = {}) {
    const out = [];
    const s = score || {};
    out.push(`## What Microsoft still scores against this tenant`);
    out.push(``);
    out.push(`Microsoft Secure Score${s.latest ? ` — **${s.latest.currentScore} of ${s.latest.maxScore} points**, read ${String(s.latest.taken || "").slice(0, 10)}` : ""}. Secure Score reads **the estate**: what devices actually report. The checks above read **policy**: what is configured and whether it reaches anybody. Where the two disagree, the disagreement is the finding — neither tool can see it alone.`);
    out.push(``);
    out.push(`**${corr.pointsOpen} points** are still open across the endpoint controls below.`);
    out.push(``);

    if (corr.contested.length) {
      out.push(`### Configured here, still unscored by Microsoft (${corr.contested.length})`);
      out.push(``);
      out.push(`The check passes — the setting is right and reaches devices — and Microsoft still holds the points. That gap is almost never the policy: it is devices that have not onboarded to Defender for Endpoint, a licence the control needs, or machines that have not reported since the policy was written. **Open these first**: the work is already done and is not being counted.`);
      out.push(``);
      out.push(`| This tool's check | Microsoft's control | Points left |`);
      out.push(`| --- | --- | --- |`);
      corr.contested.forEach((r) => out.push(`| ✅ ${r.check.title} | ${r.open.map((c) => c.title).join("; ")} | ${r.points} |`));
      out.push(``);
    }
    if (corr.confirmed.length) {
      out.push(`### Both readings agree it is open (${corr.confirmed.length})`);
      out.push(``);
      out.push(`A finding here and points there. Two independent measurements of one weakness — these are the least arguable items on the list.`);
      out.push(``);
      out.push(`| This tool's check | What this tenant has | Microsoft's control | Points left |`);
      out.push(`| --- | --- | --- | --- |`);
      corr.confirmed.forEach((r) => out.push(`| ${r.check.sev} — ${r.check.title} | ${r.check.detail.replace(/\|/g, "/").slice(0, 220)} | ${r.open.map((c) => c.title).join("; ")} | ${r.points} |`));
      out.push(``);
    }
    if (corr.msOnly.length) {
      out.push(`### Microsoft scores it, this tool has no check for it (${corr.msOnly.length})`);
      out.push(``);
      out.push(`Endpoint controls with points available that no check above covers — a gap in the check set, shown rather than hidden. Listed under Microsoft's own titles and remediation.`);
      out.push(``);
      out.push(`| Improvement action | Category | Points | User impact |`);
      out.push(`| --- | --- | --- | --- |`);
      corr.msOnly.slice(0, 25).forEach((c) => out.push(`| ${c.title} | ${c.category} | ${c.points} | ${c.userImpact || "not stated"} |`));
      if (corr.msOnly.length > 25) out.push(`| _…and ${corr.msOnly.length - 25} more_ | | | |`);
      out.push(``);
    }
    if (corr.scored.length) {
      out.push(`### A finding here, full marks there (${corr.scored.length})`);
      out.push(``);
      out.push(`Microsoft is satisfied and this tool is not. The control it scores is broader or narrower than the check — the finding stands on its own evidence, it just has no points behind it.`);
      out.push(``);
      corr.scored.forEach((r) => out.push(`- **${r.check.title}** (${r.check.sev}) — ${r.check.detail.slice(0, 200)} _Microsoft's ${r.controls.map((c) => c.title).join("; ")} is at full score._`));
      out.push(``);
    }
    if (corr.tunoOnly.length) {
      out.push(`### Not scored by Microsoft at all (${corr.tunoOnly.length})`);
      out.push(``);
      out.push(`Findings with no matching Secure Score control. Nothing here earns points, and every one of them is still real — App Control running in audit mode blocks nothing whatever the score says.`);
      out.push(``);
      corr.tunoOnly.forEach((r) => out.push(`- **${r.check.title}** (${r.check.sev}) — ${r.check.detail.slice(0, 200)}`));
      out.push(``);
    }
    if (corr.unscorable.length) {
      out.push(`> ${corr.unscorable.length} matched control${corr.unscorable.length === 1 ? "" : "s"} had no readable score or ceiling and ${corr.unscorable.length === 1 ? "is" : "are"} counted as neither satisfied nor open: ${corr.unscorable.map((r) => r.check.title).join("; ")}.`);
      out.push(``);
    }
    out.push(`> Pairs are matched on Microsoft's own control id or published title, and every pair prints both names so a wrong match is visible rather than load-bearing. An unmatched control is listed under Microsoft's title instead of being dropped. ${corr.agreed} check${corr.agreed === 1 ? "" : "s"} agreed clean on both readings and ${corr.agreed === 1 ? "is" : "are"} not listed.`);
    return out.join("\n");
  }

  return {
    NODES, countsFrom, nodeById, classify, intentNode,
    RULES, analyzeImpact, impactReachLine, rolloutLine, briefMd, briefDocx,
    isInterim, stateWordOf, appctlMode,
    CHECKS, runChecks, findings, checksMd,
    deviceReach, reachLine,
    STATE_WORD, stateOf,
    // Secure Score correlation (R02)
    SS_MAP, correlate, scoreMd,
    // seams for the headless suite
    _match: { MDE_RE, EDGE_RE, isOn, isOff, isBlockV, isAuditV },
  };
})();

// ======================================================================
// T20 — the screen. Engine above is DOM-free for the headless suite.
// ======================================================================
const EndpointPostureTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let res = null, running = false, node = "overview", search = "";
  // The Secure Score is a SECOND read under a SECOND permission, so it is
  // opt-in and lives here rather than inside run(): T20's own read still
  // costs no new scope, and the tile keeps saying so honestly. Set by the
  // 📊 node's button; null until somebody asks for it.
  let score = null, corr = null, scoreErr = null, scoring = false;
  // Cards is the default — Mihai's call after seeing both: the card reads
  // better. The list is the same policies as one table row each, for the
  // long-node case (an Antivirus with seventeen policies scrolls as a
  // table, scans as a wall of cards). The choice sticks across nodes for
  // the session; a re-read resets it like every other filter.
  let view = "cards";

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------------------------------------------------------------- run --
  async function run() {
    if (running) return;
    running = true; $("epRun").disabled = true;
    ["epBriefMd", "epBriefDocx", "epChecksMd"].forEach((id) => { $(id).style.display = "none"; });
    $("epBody").innerHTML = "";
    const prog = (m, n, of) => TunoProgress.show("epBody", "epProg", m, n, of);
    try {
      prog("Checking permissions…");
      // "filters" joins the union at 10482: the documenter names assignment
      // filters in the same pass it names groups, and that read is RBAC-
      // scoped. Without it every filtered assignment would print an id.
      await Graph.ensureScopes([...new Set([...Docs.scopesFor(["settingsCatalog", "filters"]), ...Graph.SCOPES.devices, ...Graph.SCOPES.directory])]);

      // The documenter's own settings-catalog read: policies WITH their
      // settings rows, assignments named, values through the redaction gate.
      const col = await Docs.collect({ sections: ["settingsCatalog"], onStatus: prog });
      const sec = col.sections.find((s) => s.id === "settingsCatalog") || null;
      if (!sec) {
        const f = col.failed[0] || {};
        throw new Error(`The settings catalog could not be read${f.error ? ` — ${f.error}` : ""}. Everything here would be unknown, not zero.`);
      }

      // Legacy intents — T16's read shape: the intent, its template's name,
      // and isAssigned, which is all that surface says.
      prog("Reading legacy security intents…");
      let intents = [], intentsError = null, templatesError = null;
      try {
        const raw = await Graph.readAll(`${Graph.BETA}/deviceManagement/intents?$select=id,displayName,templateId,isAssigned`, { scopes: Graph.SCOPES.config, retry: true });
        let tpl = {};
        if (raw.length) {
          try {
            (await Graph.readAll(`${Graph.BETA}/deviceManagement/templates?$select=id,displayName`, { scopes: Graph.SCOPES.config, retry: true }))
              .forEach((t) => { tpl[t.id] = t.displayName || ""; });
          } catch (e) { templatesError = String((e && e.message) || e).slice(0, 200); }
        }
        intents = raw.map((it) => ({
          id: it.id, name: it.displayName || it.id, isAssigned: !!it.isAssigned,
          template: tpl[it.templateId] || "",
          node: templatesError ? null : EndpointPosture.intentNode(tpl[it.templateId]),
        }));
      } catch (e) { intentsError = String((e && e.message) || e).slice(0, 200); }

      prog("Counting Windows devices…");
      let deviceCount = null, deviceCountError = null;
      try {
        deviceCount = (await Graph.readAll(`${Graph.BETA}/deviceManagement/managedDevices?$filter=operatingSystem eq 'Windows'&$select=id&$top=999`, { scopes: Graph.SCOPES.devices, retry: true })).length;
      } catch (e) { deviceCountError = String((e && e.message) || e).slice(0, 200); }

      prog("Classifying…");
      const byNode = {}; EndpointPosture.NODES.forEach((n) => { byNode[n.id] = []; });
      byNode.otherdisc = [];
      const docs = [];
      for (const it of sec.items) {
        const nodes = EndpointPosture.classify(it);
        if (!nodes.length) continue;
        docs.push(it);
        nodes.forEach((n) => (byNode[n] || byNode.otherdisc).push(it));
      }
      const ctx = { docs, byNode, intents };

      // Group member counts for the device-reach lines (build 10479) —
      // Graph.memberCount, the AppLocker deploy's own seam, pooled the
      // documenter's way. A count that cannot be read is null: unknown,
      // not zero, and the reach line says the sum is a floor.
      const gids = [...new Set(docs.flatMap((d) => (d.assignments || [])
        .filter((a) => a.kind === "Included" && a.groupId)
        .map((a) => String(a.groupId).toLowerCase())))];
      const groupCounts = {};
      let groupCountErrors = 0;
      if (gids.length) {
        let done = 0;
        const rs = await Graph.pool(gids, async (id) => {
          prog(`Counting group members — ${++done}/${gids.length}…`);
          try { return Number(await Graph.memberCount(id)); } catch (e) { return null; }
        }, 6);
        const c = EndpointPosture.countsFrom(gids, rs);
        Object.assign(groupCounts, c.counts);
        groupCountErrors = c.errors;
      }
      // A fresh posture read invalidates the correlation: the checks it
      // was computed against no longer exist. Cleared rather than kept —
      // a matrix pairing new checks with an old score is a wrong screen.
      score = null; corr = null; scoreErr = null;
      res = {
        sec, docs, byNode, intents, intentsError, templatesError,
        deviceCount, deviceCountError, groupCounts, groupCountErrors,
        partial: col.partial || [], nameError: col.nameError || null, filterError: col.filterError || null,
        impact: EndpointPosture.analyzeImpact(docs),
        checks: EndpointPosture.runChecks(ctx),
        when: Date.now(),
      };
      node = "overview"; search = ""; view = "cards";
      prog("");
      ["epBriefMd", "epBriefDocx", "epChecksMd"].forEach((id) => { $(id).style.display = ""; });
      render();
    } catch (e) {
      prog("");
      $("epBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>The read failed.</b><span class="why">${esc((e && e.message) || e)}</span></div></div>`;
    } finally { running = false; $("epRun").disabled = false; }
  }

  // ------------------------------------------------------------- render --
  const railCount = (id) => {
    const n = (res.byNode[id] || []).length + res.intents.filter((i) => i.node === id).length;
    return n;
  };
  const railGap = (id) => {
    if (id === "bp") return EndpointPosture.findings(res.checks).length;
    const pols = res.byNode[id] || [];
    const legacyLive = res.intents.some((i) => i.node === id && i.isAssigned);
    if (!pols.length && !legacyLive) return railCount(id) === 0 ? -1 : 0; // -1: nothing at all
    const live = pols.some((d) => EndpointPosture.stateOf(d) === "assigned");
    return (live || legacyLive) ? 0 : -2; // -2: exists, reaches nobody
  };

  function renderRail() {
    const row = (n) => {
      if (n.kind === "analysis") {
        // The score node's badge is the number of correlated rows where
        // points are still open — and it stays EMPTY until the score has
        // been read, because a 0 there would read as "nothing open"
        // rather than "nobody looked". Those are different answers and
        // only one of them is dangerous.
        const g = n.id === "bp" ? EndpointPosture.findings(res.checks).length
          : n.id === "score" ? (corr ? corr.confirmed.length + corr.contested.length + corr.msOnly.length : 0)
          : 0;
        return `<div class="ep-node${node === n.id ? " active" : ""}" data-epnode="${n.id}" role="button" tabindex="0">${n.icon} ${esc(n.label)}${g ? `<span class="ep-n gap">${g} ⚠</span>` : `<span class="ep-n"></span>`}</div>`;
      }
      if (n.kind === "top") return `<div class="ep-node${node === n.id ? " active" : ""}" data-epnode="${n.id}" role="button" tabindex="0">${n.icon} ${esc(n.label)}<span class="ep-n"></span></div>`;
      const c = railCount(n.id), g = railGap(n.id);
      const badge = g === -1 ? `<span class="ep-n gap">0</span>` : g === -2 ? `<span class="ep-n gap">${c} ⚠</span>` : `<span class="ep-n">${c}</span>`;
      return `<div class="ep-node${node === n.id ? " active" : ""}" data-epnode="${n.id}" role="button" tabindex="0">${n.icon} ${esc(n.label)}${badge}</div>`;
    };
    const discs = EndpointPosture.NODES.filter((n) => n.kind === "disc");
    // EPM and the overflow bucket appear only when the tenant has them.
    const shownDiscs = discs.filter((n) => n.id !== "epm" || railCount("epm") > 0);
    const other = (res.byNode.otherdisc || []).length
      ? `<div class="ep-node${node === "otherdisc" ? " active" : ""}" data-epnode="otherdisc" role="button" tabindex="0">🗂 Other endpoint security<span class="ep-n">${res.byNode.otherdisc.length}</span></div>` : "";
    $("epRail").innerHTML = row(EndpointPosture.nodeById("overview"))
      + shownDiscs.map(row).join("") + other
      + `<hr>` + [EndpointPosture.nodeById("mde"), EndpointPosture.nodeById("edge")].map(row).join("")
      + `<hr>` + [EndpointPosture.nodeById("impact"), EndpointPosture.nodeById("bp"), EndpointPosture.nodeById("score")].map(row).join("");
  }

  // ---- node panes ----
  function paneOverview() {
    const discs = EndpointPosture.NODES.filter((n) => n.kind === "disc");
    const card = (n) => {
      const pols = res.byNode[n.id] || [];
      const live = pols.filter((d) => EndpointPosture.stateOf(d) === "assigned").length;
      const legacy = res.intents.filter((i) => i.node === n.id);
      const legacyLive = legacy.filter((i) => i.isAssigned).length;
      const covered = live > 0 || legacyLive > 0;
      const label = covered ? (live ? "covered" : "covered — legacy intent only")
        : (pols.length || legacy.length) ? "GAP — none reaches anybody" : "GAP — no policy";
      return `<button class="au-card au-card-btn" data-epnode="${n.id}" type="button">
        <div class="au-card-l">${n.icon} ${esc(n.label)}</div>
        <div class="au-card-n ${covered ? "ok" : "bad"}">${live + legacyLive}<span class="mini muted" style="font-size:13px;font-weight:normal">/${pols.length + legacy.length}</span></div>
        <div class="au-card-s">${esc(label)}</div></button>`;
    };
    const parts = [`<div class="au-cards">${discs.filter((n) => n.id !== "epm" || railCount("epm") > 0).map(card).join("")}</div>`];
    const bad = EndpointPosture.findings(res.checks);
    parts.push(`<div class="list-card"><p class="mini" style="margin:0">
      ${res.deviceCount !== null ? `<b>${res.deviceCount} Windows devices enrolled</b> — a gap above is that many machines on local defaults. ` : `The Windows device count could not be read${res.deviceCountError ? ` — ${esc(res.deviceCountError)}` : ""}: the denominator is unknown, not zero. `}
      ${res.docs.length} endpoint-security-relevant policies (${(res.byNode.mde || []).length} configuring Defender and ${(res.byNode.edge || []).length} configuring Edge from the plain settings catalog), ${res.intents.length} legacy intent${res.intents.length === 1 ? "" : "s"}.
      🎓 Best practice: <b${bad.length ? ` style="color:var(--off)"` : ""}>${bad.length} finding${bad.length === 1 ? "" : "s"}</b>, ${res.checks.filter((c) => c.status === "pass").length} passed.
      "Covered" is the house claim — assigned and reaching somebody by construction; per-device applicability is nobody's to evaluate from a tab, and whether an included group is empty is 🩺 Assignment health's finding.</p></div>`);
    if (res.intentsError) parts.push(`<div class="list-card"><p class="mini muted" style="margin:0">Legacy intents could not be read — ${esc(res.intentsError)}. Older tenants keep endpoint security there; that surface is unknown, not empty.</p></div>`);
    if (res.templatesError) parts.push(`<div class="list-card"><p class="mini muted" style="margin:0">Intent templates could not be read — ${esc(res.templatesError)}. Legacy intents are listed unclassified and count toward nothing.</p></div>`);
    if (res.nameError) parts.push(`<div class="list-card"><p class="mini muted" style="margin:0">Group names could not be resolved (${esc(res.nameError)}) — assignments show GUIDs.</p></div>`);
    if (res.filterError) parts.push(`<div class="list-card"><p class="mini muted" style="margin:0">Assignment filter names could not be read (${esc(res.filterError)}) — a filtered assignment still says it is filtered and shows the id. ${esc("DeviceManagementConfiguration.Read.All is what names them.")}</p></div>`);
    return parts.join("");
  }

  // The device numbers a single ASSIGNED policy's reach cell wears
  // (10481, Mihai's live-tenant ask): the target groups' member total
  // against the fleet, with what is still missing — the reach engine's
  // arithmetic, one policy at a time.
  function deviceBit(it) {
    if (!res || EndpointPosture.stateOf(it) !== "assigned") return "";
    const r = EndpointPosture.deviceReach([it], res.groupCounts, res.deviceCount);
    const D = res.deviceCount;
    if (r.wide) return D == null ? "" : ` · ${r.cap ? `at most all ${D}` : `all ${D}`} devices`;
    if (r.reached == null) return r.groups ? ` · member counts unreadable — reach unknown` : "";
    if (r.cap && r.unknownGroups) return ` · ${r.groups} group${r.groups === 1 ? "" : "s"}${D == null ? "" : ` of ${D}`} — not computable`;
    const verb = r.cap ? "at most " : r.unknownGroups ? "at least " : "~";
    const miss = r.missing != null ? ` · ${r.cap ? "at least " : r.unknownGroups ? "at most " : ""}${r.missing} still missing` : "";
    return ` · ${verb}${r.reached}${D != null ? ` of ${D}` : ""} devices${miss}`;
  }

  // T19's card, verbatim in shape — the scard classes have carried these
  // tools since the scaffold, and the popout is the documenter's own.
  function policyCard(it, icon, label) {
    const v = EndpointPosture.stateOf(it);
    const VLABEL = { assigned: "Assigned", unassigned: "Unassigned", excludedOnly: "Excluded-only" };
    const VCHIP = { assigned: "on", unassigned: "off", excludedOnly: "report" };
    const named = it.assignments.filter((x) => x.kind !== "Excluded");
    const exc = it.assignments.length - named.length;
    const wide = named.some((x) => x.kind === "All devices" || x.kind === "All users");
    const fl = Docs.filtersOf ? Docs.filtersOf(it) : [];
    const may = fl.length
      ? ` <span class="tag" title="${esc(fl.join("; "))}">⚑ ${esc(fl[0])}${fl.length > 1 ? ` +${fl.length - 1}` : ""} — may</span>`
      : (OverviewTool.filterMay(it) ? ` <span class="tag">⚑ filter — may</span>` : "");
    const reach = v === "unassigned" ? "nobody"
      : v === "excludedOnly" ? `nobody <span class="excl-note">(−${exc} excluded)</span>`
      : `${wide ? `<span class="tag">tenant-wide</span>${named.length - (wide ? 1 : 0) > 0 ? ` + groups` : ""}` : `${named.length} group${named.length === 1 ? "" : "s"}`}${exc ? ` <span class="excl-note">(−${exc})</span>` : ""}${esc(deviceBit(it))}${may}`;
    return `<div class="scard" data-epopen="${esc(it.id)}">
      <div class="scard-top">
        <div class="scard-ic">${icon}</div>
        <div class="scard-title"><h3>${esc(it.name)}</h3>
          <div class="mini"><span class="tag">${icon} ${esc(label)}</span>${it.templateName ? ` ${esc(it.templateName)}` : ""}${it.modified ? ` · Modified ${esc(String(it.modified).slice(0, 10))}` : ""}</div></div>
        <div class="scard-right"><span class="state ${VCHIP[v]}">${VLABEL[v]}</span></div>
      </div>
      <div class="scard-grid">
        <div><label>Included</label><b>${named.length ? `${esc(named[0].name || named[0].kind)}${named.length > 1 ? ` <span class="muted">+${named.length - 1}</span>` : ""}` : "—"}</b></div>
        <div><label>Reach</label><b>${reach}</b></div>
        <div><label>Platform</label><b>${esc(it.platform || "Windows")}</b></div>
        <div><label>Settings</label><b>${it.detailError ? `<span style="color:var(--report)">unreadable</span>` : it.rows.length ? `${it.rows.length} documented` : "—"}</b></div>
      </div>
      <div class="scard-foot">ID: ${esc(it.id)}</div>
    </div>`;
  }

  // The list face: the same policies, one table row each — the house
  // .cg-table, a row click opening the same popout as a card click.
  function policyRow(it) {
    const v = EndpointPosture.stateOf(it);
    const VLABEL = { assigned: "Assigned", unassigned: "Unassigned", excludedOnly: "Excluded-only" };
    const VCHIP = { assigned: "on", unassigned: "off", excludedOnly: "report" };
    const named = it.assignments.filter((x) => x.kind !== "Excluded");
    const exc = it.assignments.length - named.length;
    const wide = named.some((x) => x.kind === "All devices" || x.kind === "All users");
    const reach = v === "unassigned" ? "nobody"
      : v === "excludedOnly" ? `nobody (−${exc} excluded)`
      : `${wide ? "tenant-wide" : `${named.length} group${named.length === 1 ? "" : "s"}`}${exc ? ` (−${exc})` : ""}${deviceBit(it)}${(Docs.filtersOf ? Docs.filtersOf(it) : []).length ? ` · ⚑ ${Docs.filtersOf(it).join("; ")}` : (OverviewTool.filterMay(it) ? " · ⚑ may" : "")}`;
    return `<tr class="ep-row" data-epopen="${esc(it.id)}">
      <td><b>${esc(it.name)}</b></td>
      <td class="mini">${esc(it.templateName || "—")}</td>
      <td>${esc(reach)}</td>
      <td>${esc(it.platform || "Windows")}</td>
      <td>${it.detailError ? `<span style="color:var(--report)">unreadable</span>` : it.rows.length || "—"}</td>
      <td><span class="state ${VCHIP[v]}">${VLABEL[v]}</span></td>
    </tr>`;
  }

  function paneNode(id) {
    const n = EndpointPosture.nodeById(id) || { icon: "🗂", label: "Other endpoint security" };
    const q = search.trim().toLowerCase();
    const pols = (res.byNode[id] || []).filter((it) => !q || String(it.name).toLowerCase().includes(q) || it.rows.some((r) => (r.defId || "").toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q)));
    const legacy = res.intents.filter((i) => i.node === id);
    const parts = [];
    // The toolbar is a card like everything else on the page — a bare
    // input floating on the background read as unfinished (Mihai, on the
    // first live screenshot), and he is right: every other control on
    // this screen lives on a card.
    parts.push(`<div class="list-card ep-bar">
      <div class="seg" id="epViewSeg"><button type="button" data-epview="cards" class="${view === "cards" ? "active" : ""}">🗂 Cards</button><button type="button" data-epview="list" class="${view === "list" ? "active" : ""}">☰ List</button></div>
      <input id="epSearch" type="search" placeholder="Filter by name or setting id…" value="${esc(search)}">
      <span class="mini muted">${pols.length} shown</span></div>`);
    parts.push(!pols.length
      ? `<div class="list-card"><p class="mini muted" style="margin:0">No ${q ? "matching " : ""}policies here${q ? "" : " — which is itself the finding; 🎓 Best practice says what it costs"}.</p></div>`
      : view === "list"
        ? `<div class="cg-tablewrap" style="margin-top:0"><table class="cg-table"><thead><tr><th>Policy</th><th>Template</th><th>Reach</th><th>Platform</th><th>Settings</th><th>Verdict</th></tr></thead><tbody>${pols.map(policyRow).join("")}</tbody></table></div>`
        : `<div class="ep-cards">${pols.map((it) => policyCard(it, n.icon, n.label)).join("")}</div>`);
    if (legacy.length) {
      parts.push(`<div class="list-card"><h4 style="margin:0 0 4px">Legacy intents in this discipline</h4>
        ${legacy.map((i) => `<p class="mini" style="margin:4px 0">${esc(i.name)} — ${i.isAssigned ? "assigned" : "not assigned"} <span class="muted">(${esc(i.template) || "template unreadable"} · the legacy surface says only assigned or not — no assignment detail, no settings)</span></p>`).join("")}</div>`);
    }
    return parts.join("");
  }

  function paneImpact() {
    const items = res.impact;
    if (!items.length) return `<div class="list-card"><p class="mini muted" style="margin:0">No endpoint security policy matched any statement — there is nothing to brief, which is itself a finding.</p></div>`;
    const live = items.filter((i) => i.liveNow), later = items.filter((i) => !i.liveNow);
    const stops = items.filter((i) => i.goesAway);
    const item = (i) => {
      const reach = i.liveNow ? EndpointPosture.impactReachLine(i, res.groupCounts, res.deviceCount) : null;
      // TODAY AND THE DESTINATION, SIDE BY SIDE (10486). A live statement
      // that also has a staged policy behind it wears both lines: what is
      // enforced now, and what the rollout targets. A not-yet-live one
      // wears only the second — which is read off the staged policy's own
      // assignment rather than assumed to be the whole fleet.
      const rollout = EndpointPosture.rolloutLine(i, res.groupCounts, res.deviceCount);
      return `<div class="ep-brief${i.liveNow ? "" : " later"}">
      <b>${i.icon} ${esc(i.title)}</b>${i.filtered ? ` <span class="tag">⚑ ${esc((i.filterNames && i.filterNames.length) ? i.filterNames.join("; ") : "filtered")} — some devices, not all</span>` : ""}${i.transition ? ` <span class="tag">⏳ interim — staged replacement takes over</span>` : ""}${i.goesAway ? ` <span class="tag" style="color:var(--off)">⏳ interim — stops at rollout</span>` : ""}
      <p class="mini" style="margin:4px 0 6px">${esc(i.text)}</p>
      ${reach ? `<p class="mini" style="margin:0 0 4px"><b>📟</b> ${esc(reach)}</p>` : ""}
      ${rollout ? `<p class="mini" style="margin:0 0 6px${i.liveNow ? ";color:var(--muted)" : ""}"><b>🎯</b> ${esc(rollout)}</p>` : ""}
      ${i.lost ? `<p class="mini" style="margin:0 0 6px;color:var(--off)"><b>No longer possible:</b> ${esc(i.lost)}</p>` : ""}
      <p class="mini muted" style="margin:0">Behind it: ${i.pols.map((p) => `${esc(p.name)} <i>[${esc(p.word || EndpointPosture.STATE_WORD[p.state])}]</i>`).join("; ")}</p>
    </div>`;
    };
    return `<div class="list-card">
      <div style="display:flex;gap:10px;align-items:flex-start"><h4 style="margin:0 0 4px">🗣 What people will notice on their device</h4>
        <div class="spacer" style="flex:1"></div>
        <button class="btn" type="button" data-epbrief="1">👁 Read the full brief</button></div>
      <p class="mini muted" style="margin:0 0 12px">End-user language on purpose — this is a communication draft, not an engineer's view (that is the rest of this tool). Derived from the policies actually present; every statement names them. <b>Read the full brief</b> shows the finished document — intro, the blocked-what-now section, the appendix — exactly as the Markdown export writes it, readable before anything is downloaded; Word and Markdown exports sit above.</p>
      ${live.length ? `<h4 class="ep-h">Already enforced today</h4>${live.map(item).join("")}` : ""}
      ${later.length ? `<h4 class="ep-h">At rollout — these reach nobody yet</h4>${later.map(item).join("")}` : ""}
      ${stops.length ? `<h4 class="ep-h" style="color:var(--off)">Stops at rollout — interim only, no staged replacement</h4>
        <p class="mini muted" style="margin:0 0 8px">Carried today only by (TO-BE-REMOVED) policies. At rollout these protections go away — if that is not intended, stage the replacement before retiring the interim policy.</p>
        ${stops.map((i) => `<p class="mini" style="margin:4px 0">${i.icon} <b>${esc(i.title)}</b> — carried by ${i.pols.filter((p) => p.state === "assigned").map((p) => esc(p.name)).join("; ")}</p>`).join("")}` : ""}
    </div>`;
  }

  function paneBp() {
    const word = { gap: "GAP", misconfig: "MISCONFIGURED", notReaching: "NOT REACHING", unknown: "UNRECOGNISED", interimOnly: "PASS — INTERIM ONLY", pass: "PASS" };
    const cls = { gap: "off", misconfig: "off", notReaching: "report", unknown: "report", interimOnly: "report", pass: "on" };
    const bad = EndpointPosture.findings(res.checks);
    const pass = res.checks.filter((c) => c.status === "pass");
    const item = (c) => {
      const r = EndpointPosture.deviceReach(c.docs || [], res.groupCounts, res.deviceCount);
      const bad = c.status !== "pass" && (r.missing === null || r.missing > 0 || r.reached === 0);
      return `<div class="ep-check">
      <div class="ep-check-h"><span class="state ${cls[c.status]}">${word[c.status]}</span> <span class="ep-sev ${c.sev}">${c.sev}</span> <b>${esc(c.title)}</b></div>
      <p class="mini" style="margin:6px 0 0"><b>Microsoft:</b> ${esc(c.req)}</p>
      <p class="mini" style="margin:4px 0 0"><b>This tenant:</b> ${esc(c.detail)}</p>
      <p class="mini" style="margin:4px 0 0"><b>📟 Devices:</b> <span${bad ? ` style="color:var(--off)"` : ""}>${esc(EndpointPosture.reachLine(r, res.deviceCount))}</span></p>
      ${c.status !== "pass" ? `<p class="mini" style="margin:4px 0 0"><b>Remediation:</b> ${esc(c.fix)}</p>` : ""}
      <p class="mini muted" style="margin:4px 0 0"><a href="${esc(c.doc)}" target="_blank" rel="noopener">${esc(c.doc.replace("https://", ""))}</a></p>
    </div>`;
    };
    return `<div class="list-card"><h4 style="margin:0 0 4px">🎓 Best practice — measured against learn.microsoft.com</h4>
      <p class="mini muted" style="margin:0 0 12px">${bad.length} finding${bad.length === 1 ? "" : "s"}, ${pass.length} passed, of ${res.checks.length} checks. Checks read the documenter's setting rows — a value the check set does not recognise is said so, never guessed. <b>Not reaching</b> means configured as recommended, but only in a policy that reaches nobody by construction. <b>📟 Devices</b> is assignment arithmetic — tenant-wide is the Windows fleet, groups are summed by member count, and every limit of that sum is worn on the line: targets, not check-ins.${res.groupCountErrors ? ` ${res.groupCountErrors} group count${res.groupCountErrors === 1 ? "" : "s"} could not be read — those sums are floors.` : ""}</p>
      ${bad.map(item).join("")}${pass.length ? `<h4 class="ep-h">Passed</h4>${pass.map(item).join("")}` : ""}
    </div>`;
  }

  // ------------------------------------------------- Secure Score node --
  //
  // The read is T21's SecureScoreTool.readFor() — the one reader, asked
  // at THIS click under its own consent. Nothing is borrowed from a T21
  // screen that may be holding a result: this node would then be showing
  // numbers whose age it cannot state.
  async function readScore() {
    if (scoring || !res) return;
    scoring = true; render();
    const prog = (m) => { const p = $("epScoreProg"); if (p) p.textContent = m || ""; };
    try {
      if (typeof SecureScoreTool === "undefined") throw new Error("The Secure Score reader (T21) is not loaded on this page.");
      const s = await SecureScoreTool.readFor({ onStatus: prog });
      if (s.empty) { score = s; corr = null; scoreErr = null; }
      else { score = s; corr = EndpointPosture.correlate(res.checks, s.controls); scoreErr = null; }
    } catch (e) {
      scoreErr = String((e && e.message) || e);
      if (e && e.kind === "admin") scoreErr += " SecurityEvents.Read.All is an admin-consent permission in most tenants — an administrator grants it once for the whole tenant.";
      score = null; corr = null;
    } finally { scoring = false; render(); }
  }

  function paneScore() {
    if (scoring) {
      return `<div class="list-card"><div class="spinner"></div>
        <p class="mini" style="margin:10px 0 0" id="epScoreProg">Reading the tenant's Secure Score…</p></div>`;
    }
    if (!corr) {
      return `<div class="list-card">
        <h4 style="margin:0 0 4px">📊 Secure Score gaps</h4>
        <p class="mini" style="margin:0 0 10px">This tool reads <b>policy</b> — what is configured, and whether it reaches anybody. Microsoft Secure Score reads <b>the estate</b> — what the devices actually report back. They disagree constantly, and <b>the disagreement is the finding</b>: a policy can be perfectly configured, assigned tenant-wide and still score zero, because the machines have not onboarded, are not licensed, or have not reported since it was written. Neither reading can see that on its own.</p>
        <p class="mini muted" style="margin:0 0 12px"><b>This costs a permission the rest of the tool does not.</b> Everything else here runs on the 📄 documenter's read; the score needs <code>SecurityEvents.Read.All</code>, which is why it is a button rather than part of the run. The read is 📊 Secure Score visualizer's own — one reader, so this node and that tool can never disagree about one tenant.</p>
        ${scoreErr ? `<div class="gu-fail" style="margin-bottom:12px"><b>The Secure Score could not be read.</b><span class="why">${esc(scoreErr)}</span></div>` : ""}
        ${score && score.empty ? `<p class="mini" style="margin:0 0 12px"><b>This tenant has no Secure Score readings.</b> The read succeeded and returned an empty collection — Secure Score starts producing readings once the tenant has the licensed services it measures. There is nothing to correlate, and nothing is wrong.</p>` : ""}
        <button class="btn primary" type="button" data-epscore="1">📊 Read the Secure Score</button>
      </div>`;
    }

    const s = score.latest;
    const p = SecureScore.pct(s.currentScore, s.maxScore);
    const pair = (r, extra) => `<div class="ep-check">
      <div class="ep-check-h"><span class="ep-sev ${r.check.sev}">${r.check.sev}</span> <b>${esc(r.check.title)}</b> <span class="sc-pts">${r.points} pt${r.points === 1 ? "" : "s"}</span></div>
      <p class="mini" style="margin:6px 0 0"><b>This tool:</b> ${esc(r.check.detail)}</p>
      <p class="mini" style="margin:4px 0 0"><b>Microsoft's control:</b> ${esc((r.open.length ? r.open : r.controls).map((c) => `${c.title} (${c.score} of ${c.maxScore})`).join("; "))}</p>
      ${extra ? `<p class="mini muted" style="margin:4px 0 0">${extra}</p>` : ""}
      ${(r.open[0] && r.open[0].remediation) ? `<p class="mini" style="margin:4px 0 0"><b>Microsoft's remediation:</b> ${esc(r.open[0].remediation)}</p>` : ""}
    </div>`;

    const parts = [];
    parts.push(`<div class="list-card">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <h4 style="margin:0 0 4px">📊 Secure Score gaps — policy against the estate</h4>
        <div style="flex:1"></div>
        <button class="btn" type="button" data-epscoremd="1">👁 Read this as a report</button>
        <button class="btn" type="button" data-epscore="1">↻ Re-read</button>
      </div>
      <p class="mini" style="margin:0 0 6px"><b>${s.currentScore} of ${s.maxScore} points — ${p}%</b>, read ${esc(String(s.taken).slice(0, 10))}. <b>${corr.pointsOpen} points</b> still open across the endpoint controls below.</p>
      <p class="mini muted" style="margin:0">Pairs are matched on Microsoft's own control id or published title, and <b>every pair shows both names</b> — the check's and the control's — so a wrong match is visible rather than load-bearing. A control that matches nothing is listed under Microsoft's title instead of being dropped, so a miss can only ever under-correlate, never mis-correlate. ${corr.agreed} check${corr.agreed === 1 ? "" : "s"} agreed clean on both readings and ${corr.agreed === 1 ? "is" : "are"} not listed.${score.profileError ? ` <b>The control catalogue could not be read (${esc(score.profileError)})</b> — controls show raw ids and no remediation.` : ""}</p>
    </div>`);

    parts.push(`<div class="au-cards">
      <div class="au-card"><div class="au-card-l">🟠 Configured, unscored</div><div class="au-card-n ${corr.contested.length ? "bad" : "ok"}">${corr.contested.length}</div><div class="au-card-s">check passes, points still open</div></div>
      <div class="au-card"><div class="au-card-l">🔴 Both agree open</div><div class="au-card-n ${corr.confirmed.length ? "bad" : "ok"}">${corr.confirmed.length}</div><div class="au-card-s">a finding here and points there</div></div>
      <div class="au-card"><div class="au-card-l">📋 Microsoft only</div><div class="au-card-n ${corr.msOnly.length ? "bad" : "ok"}">${corr.msOnly.length}</div><div class="au-card-s">no check covers it yet</div></div>
      <div class="au-card"><div class="au-card-l">🧭 This tool only</div><div class="au-card-n ${corr.tunoOnly.length ? "bad" : "ok"}">${corr.tunoOnly.length}</div><div class="au-card-s">real, and unscored by Microsoft</div></div>
    </div>`);

    if (corr.contested.length) parts.push(`<div class="list-card">
      <h4 class="ep-h" style="margin:0 0 4px">🟠 Configured here, still unscored by Microsoft (${corr.contested.length})</h4>
      <p class="mini muted" style="margin:0 0 12px"><b>Open these first.</b> The check passes — the setting is right and it reaches devices — and Microsoft still holds the points. That gap is almost never the policy: it is devices that have not onboarded to Defender for Endpoint, a licence the control needs, or machines that have not reported since the policy was written. The work is already done and is not being counted.</p>
      ${corr.contested.map((r) => pair(r, "The policy side of this passes every check above. The points are being withheld by something outside Intune — start with onboarding and licensing, not with the policy.")).join("")}</div>`);

    if (corr.confirmed.length) parts.push(`<div class="list-card">
      <h4 class="ep-h" style="margin:0 0 4px">🔴 Both readings agree it is open (${corr.confirmed.length})</h4>
      <p class="mini muted" style="margin:0 0 12px">A finding here and points there — two independent measurements of one weakness, and the least arguable items on the list.</p>
      ${corr.confirmed.map((r) => pair(r, `Remediation from this tool: ${esc(r.check.fix)}`)).join("")}</div>`);

    if (corr.msOnly.length) parts.push(`<div class="list-card">
      <h4 class="ep-h" style="margin:0 0 4px">📋 Microsoft scores it, this tool has no check for it (${corr.msOnly.length})</h4>
      <p class="mini muted" style="margin:0 0 12px">Endpoint controls with points available that no check above covers — <b>a gap in the check set, shown rather than hidden</b>. Under Microsoft's own titles and remediation.</p>
      <div class="cg-tablewrap" style="margin-top:0"><table class="cg-table"><thead><tr><th>Improvement action</th><th>Category</th><th>Points</th><th>User impact</th><th>Remediation</th></tr></thead><tbody>
      ${corr.msOnly.map((c) => `<tr><td><b>${esc(c.title)}</b>${c.actionUrl ? ` <a href="${esc(c.actionUrl)}" target="_blank" rel="noopener noreferrer">↗</a>` : ""}</td><td>${esc(c.category)}</td><td>${c.points}</td><td>${esc(c.userImpact || "not stated")}</td><td class="mini">${esc(String(c.remediation || "—").slice(0, 240))}</td></tr>`).join("")}
      </tbody></table></div></div>`);

    if (corr.scored.length) parts.push(`<div class="list-card">
      <h4 class="ep-h" style="margin:0 0 4px">⚪ A finding here, full marks there (${corr.scored.length})</h4>
      <p class="mini muted" style="margin:0 0 12px">Microsoft is satisfied and this tool is not — the control it scores is broader or narrower than the check. The finding stands on its own evidence; it just has no points behind it.</p>
      ${corr.scored.map((r) => pair(r, "")).join("")}</div>`);

    if (corr.tunoOnly.length) parts.push(`<div class="list-card">
      <h4 class="ep-h" style="margin:0 0 4px">🧭 Not scored by Microsoft at all (${corr.tunoOnly.length})</h4>
      <p class="mini muted" style="margin:0 0 12px">Findings with no matching Secure Score control. Nothing here earns a point, and every one of them is still real — App Control running in audit mode blocks nothing whatever the score says.</p>
      ${corr.tunoOnly.map((r) => `<div class="ep-check"><div class="ep-check-h"><span class="ep-sev ${r.check.sev}">${r.check.sev}</span> <b>${esc(r.check.title)}</b></div>
        <p class="mini" style="margin:6px 0 0">${esc(r.check.detail)}</p>
        <p class="mini" style="margin:4px 0 0"><b>Remediation:</b> ${esc(r.check.fix)}</p></div>`).join("")}</div>`);

    if (corr.unscorable.length) parts.push(`<div class="list-card"><p class="mini muted" style="margin:0">${corr.unscorable.length} matched control${corr.unscorable.length === 1 ? "" : "s"} had no readable score or ceiling and ${corr.unscorable.length === 1 ? "is" : "are"} counted as neither satisfied nor open: ${esc(corr.unscorable.map((r) => r.check.title).join("; "))}.</p></div>`);

    return parts.join("");
  }

  function render() {
    if (!res) return;
    // The rail scaffold lives in #epBody only while there is a result —
    // an empty body is what lets TunoProgress own the read (its rule:
    // results are never covered, and only an empty body takes the card).
    if (!$("epRail")) {
      $("epBody").innerHTML = `<div class="ep-wrap"><div class="ep-rail" id="epRail"></div><div class="ep-main" id="epMain"></div></div>`;
    }
    renderRail();
    const main = node === "overview" ? paneOverview()
      : node === "impact" ? paneImpact()
      : node === "bp" ? paneBp()
      : node === "score" ? paneScore()
      : paneNode(node);
    $("epMain").innerHTML = main;
    const s = $("epSearch");
    if (s) {
      s.addEventListener("input", () => { search = s.value; const keep = s.selectionStart; render(); const s2 = $("epSearch"); if (s2) { s2.focus(); s2.setSelectionRange(keep, keep); } });
    }
  }

  // ------------------------------------------------------------- popout --
  function openPolicy(id) {
    const it = res && res.docs.find((x) => x.id === id);
    if (!it) return;
    const n = EndpointPosture.nodeById(node) || { icon: "🧭", label: "Endpoint security" };
    $("epModalBody").innerHTML = `
      ${Docs.popoutHtml({ icon: n.icon, label: n.label }, it)}
      <div class="gu-m-foot"><div class="spacer"></div><button class="btn primary" id="epModalClose">Close</button></div>`;
    $("epModal").classList.add("open");
    $("epModalClose").addEventListener("click", closePolicy);
    $("epModal").onclick = (e) => { if (e.target === $("epModal")) closePolicy(); };
    document.addEventListener("keydown", onEsc);
  }
  function closePolicy() { $("epModal").classList.remove("open"); document.removeEventListener("keydown", onEsc); }
  function onEsc(e) { if (e.key === "Escape") closePolicy(); }

  // --------------------------------------------------------------- init --
  function tenantName() {
    try { const o = window.TunoTenant && TunoTenant.org && TunoTenant.org(); return (o && o.displayName) || null; } catch (e) { return null; }
  }
  // The one place the brief's options are built, so the Markdown export,
  // the Word export and the on-screen report cannot drift into three
  // slightly different documents. `corr` is null until somebody reads the
  // Secure Score, and a null correlation writes no section at all.
  const briefOpts = () => ({ tenantName: tenantName(), deviceCount: res.deviceCount, counts: res.groupCounts, corr, score });

  async function exportBriefDocx() {
    try {
      const zip = EndpointPosture.briefDocx(res.impact, briefOpts());
      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "Endpoint-impact-brief.docx"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { alert(`Word export failed: ${(e && e.message) || e}`); }
  }
  // The finished document, on screen — TunoReport renders EXACTLY what
  // the Markdown export writes, same filename, so reading first costs
  // nothing and downloading holds no surprises.
  function openBrief() {
    if (!res) return;
    TunoReport.show("🗣 Endpoint impact brief", "Endpoint-impact-brief.md", EndpointPosture.briefMd(res.impact, briefOpts()));
  }

  function init() {
    if (!$("epRun")) return;
    $("epRun").addEventListener("click", run);
    $("epBriefMd").addEventListener("click", () => download("Endpoint-impact-brief.md", EndpointPosture.briefMd(res.impact, briefOpts()), "text/markdown"));
    $("epBriefDocx").addEventListener("click", exportBriefDocx);
    $("epChecksMd").addEventListener("click", () => download("Endpoint-best-practice.md", EndpointPosture.checksMd(res.checks, { tenantName: tenantName(), deviceCount: res.deviceCount, counts: res.groupCounts }), "text/markdown"));
    $("epBody").addEventListener("click", (e) => {
      const rb = e.target.closest("[data-epbrief]");
      if (rb) { openBrief(); return; }
      const sc = e.target.closest("[data-epscore]");
      if (sc) { readScore(); return; }
      const sm = e.target.closest("[data-epscoremd]");
      if (sm) {
        TunoReport.show("📊 Secure Score gaps", "Endpoint-secure-score-gaps.md",
          EndpointPosture.scoreMd(corr, { tenantName: tenantName(), score }));
        return;
      }
      const vb = e.target.closest("[data-epview]");
      if (vb) { const k = vb.getAttribute("data-epview"); if (k !== view) { view = k; render(); } return; }
      const nn = e.target.closest("[data-epnode]");
      if (nn) { const k = nn.getAttribute("data-epnode"); if (k !== node) { node = k; search = ""; render(); } return; }
      const c = e.target.closest("[data-epopen]");
      if (c) openPolicy(c.getAttribute("data-epopen"));
    });
  }

  return {
    init, run,
    // for the headless tests only — the real res is set by run()
    _setForTest: (r, sc) => {
      res = r; node = "overview"; search = ""; view = "cards";
      score = (sc && sc.score) || null;
      corr = (sc && sc.score && !sc.score.empty) ? EndpointPosture.correlate(r.checks, sc.score.controls) : null;
      scoreErr = null; scoring = false;
      render();
    },
    _state: () => ({ node, search, view, scored: !!corr }),
    _briefOpts: () => (res ? briefOpts() : null),
  };
})();

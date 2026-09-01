// ======================================================================
// T15 — Defender status (R25). After Ugur Koc's Get Defender Status
// Report (MIT), whose question is the one that becomes an incident ticket
// later: on which machines is Defender silently off or outdated?
//
// TWO READS, BOTH BETA — that is where Graph keeps protection state.
// The tenant's own rollup (deviceProtectionOverview) for context, then
// every Windows device's windowsProtectionState. THE PER-DEVICE READ IS
// THE WHOLE COST, and the original pays it one device at a time with a
// sleep between requests — minutes of a terminal doing nothing on a large
// tenant. Folded into $batch here, twenty a trip, the R12/R19 technique.
//
// THREE HONESTY RULES the classification lives by:
//   * A device that NEVER REPORTED protection state is its own bucket,
//     never healthy by omission — a machine Defender has never reported
//     on is exactly the machine this report exists to find. A state that
//     could not be READ is in the same bucket with its error stated,
//     because unknown is not clean (the T09 rule).
//   * DISABLED AND NOT-REPORTED ARE DIFFERENT ANSWERS. The original
//     counts a null the same as a false; here a protection flag the
//     device did not report is listed as not reported, not as disabled —
//     accusing a machine of running without tamper protection when it
//     simply did not say is the kind of overstatement audits repeat.
//   * THE ROLLUP AND THE PER-DEVICE SUMS CAN DISAGREE — Graph refreshes
//     the overview on its own schedule. Both are shown, labelled, never
//     quietly reconciled.
//
// Reads only, and no new scope: both endpoints sit under the device read
// T06 brought in (DeviceManagementManagedDevices.Read.All).
// ======================================================================
const Defender = (() => {
  "use strict";

  const S = () => Graph.SCOPES;
  const lc = (s) => String(s || "").toLowerCase();

  // The three protection booleans: false is a finding, null/undefined is
  // NOT REPORTED — listed separately, never counted as disabled.
  const FLAGS = [
    ["malwareProtectionEnabled", "Malware protection disabled", "malware protection"],
    ["realTimeProtectionEnabled", "Real-time protection disabled", "real-time protection"],
    ["tamperProtectionEnabled", "Tamper protection disabled", "tamper protection"],
  ];

  function findingsOf(st) {
    const issues = [], unreported = [];
    for (const [prop, label, short] of FLAGS) {
      if (st[prop] === false) issues.push(label);
      else if (st[prop] !== true) unreported.push(short);
    }
    if (st.signatureUpdateOverdue === true) issues.push("Signature update overdue");
    if (st.quickScanOverdue === true) issues.push("Quick scan overdue");
    if (st.fullScanOverdue === true) issues.push("Full scan overdue");
    if (st.rebootRequired === true) issues.push("Reboot required");
    if (st.deviceState && lc(st.deviceState) !== "clean") issues.push(`Device state: ${st.deviceState}`);
    return { issues, unreported };
  }

  const fmtWhen = (s) => String(s || "").replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "Z");

  function rowOf(device, st, readError) {
    const base = {
      id: device.id,
      name: device.deviceName || device.id,
      user: device.userPrincipalName || "",
      lastSync: device.lastSyncDateTime || "",
    };
    // The original's own test, kept: a state without lastReportedDateTime is a
    // state that was never reported. A read error lands in the same bucket
    // with the error stated — unknown, not healthy.
    if (readError || !st || !st.lastReportedDateTime) {
      return Object.assign(base, {
        bucket: "nostate",
        reason: readError ? `could not be read — ${String(readError).slice(0, 140)}` : "never reported protection state",
        issues: [], unreported: [],
        deviceState: "", realTime: null, tamper: null, malware: null, nis: null,
        signatureVersion: "", signatureOverdue: null, engineVersion: "", antiMalwareVersion: "",
        lastReported: "",
      });
    }
    const f = findingsOf(st);
    return Object.assign(base, {
      bucket: f.issues.length ? "issues" : "healthy",
      reason: "",
      issues: f.issues, unreported: f.unreported,
      deviceState: st.deviceState || "",
      realTime: st.realTimeProtectionEnabled === true ? true : st.realTimeProtectionEnabled === false ? false : null,
      tamper: st.tamperProtectionEnabled === true ? true : st.tamperProtectionEnabled === false ? false : null,
      malware: st.malwareProtectionEnabled === true ? true : st.malwareProtectionEnabled === false ? false : null,
      // NIS rides along for the baseline layer (10536) — read, not a finding:
      // the bucket semantics are unchanged, the baseline speaks it instead.
      nis: st.networkInspectionSystemEnabled === true ? true : st.networkInspectionSystemEnabled === false ? false : null,
      signatureVersion: st.signatureVersion || "",
      signatureOverdue: st.signatureUpdateOverdue === true,
      engineVersion: st.engineVersion || "",
      antiMalwareVersion: st.antiMalwareVersion || "",
      lastReported: st.lastReportedDateTime || "",
    });
  }

  async function report(opts) {
    const o = opts || {};
    const onStatus = o.onStatus || (() => {});
    const out = { overview: null, overviewError: null, devices: null, deviceError: null, totals: null };

    // The tenant rollup — cheap, immediate context, and allowed to fail
    // without taking the per-device answer with it.
    onStatus("Reading the tenant protection overview…");
    try { out.overview = await Graph.readOne("/deviceManagement/deviceProtectionOverview", { scopes: S().devices, beta: true }); }
    catch (e) { out.overviewError = String((e && e.message) || e).slice(0, 240); }

    onStatus("Reading Windows devices…");
    let windowsDevices;
    try {
      windowsDevices = await Graph.readAll(
        `${Graph.BETA}/deviceManagement/managedDevices?$filter=operatingSystem eq 'Windows'&$select=id,deviceName,userPrincipalName,lastSyncDateTime&$top=999`,
        { scopes: S().devices, retry: true },
      );
    } catch (e) {
      out.deviceError = String((e && e.message) || e).slice(0, 240);
      return out;
    }

    // The N+1, batched: one windowsProtectionState per device, twenty a trip.
    onStatus(`Reading protection state — ${windowsDevices.length} devices…`);
    const reqs = windowsDevices.map((d) => ({ id: String(d.id), url: `/deviceManagement/managedDevices/${d.id}/windowsProtectionState` }));
    const states = reqs.length ? await Graph.batch(reqs, {
      beta: true, scopes: S().devices,
      onProgress: (done, total) => onStatus(`Reading protection state — ${done}/${total}`),
    }) : {};

    const rows = windowsDevices.map((d) => {
      const r = states[String(d.id)];
      return rowOf(d, r && r.body, r && r.error);
    });
    // Worst first: most findings on top, then the unknowns, then the healthy.
    const rank = { issues: 0, nostate: 1, healthy: 2 };
    rows.sort((a, b) => rank[a.bucket] - rank[b.bucket] || (b.issues.length - a.issues.length) || a.name.localeCompare(b.name));

    out.devices = rows;
    out.totals = {
      windows: rows.length,
      healthy: rows.filter((r) => r.bucket === "healthy").length,
      issues: rows.filter((r) => r.bucket === "issues").length,
      nostate: rows.filter((r) => r.bucket === "nostate").length,
    };
    return out;
  }

  // ======================================================================
  // THE MDE-ACTIVE BASELINE MATCH (build 10536, Mihai's ask). The baseline
  // is the $baselineConfig embedded in Mihai's own Get-DefenderSettings.ps1
  // v2.0 (CloudFellows, 2025-10-28), which carries it from
  // Configure-MDEActive.ps1 — bundled here VERBATIM in meaning, the T24
  // provenance rule: re-cut this table from the script when the script
  // moves, never from memory.
  //
  // TWO LAYERS, because Graph splits the truth in two:
  //   * THE DEVICE LAYER — what machines actually report. Per-device
  //     windowsProtectionState answers only a few of the baseline's checks
  //     (real-time, malware/AV active, NIS); the rest simply are not in
  //     that surface, and a check Graph cannot see is NOT CHECKED, said
  //     rather than guessed.
  //   * THE POLICY LAYER — what the tenant intends. The AV and ASR
  //     settings-catalog policies are read WITH their settings and matched
  //     against the baseline's expected values — and a setting that sits
  //     only in a policy REACHING NOBODY is not enforcement (T20's rule):
  //     it reads "configured but reaches nobody", never "compliant".
  //     Reach is judged by EndpointSec.reachOf — the one reader, at call
  //     time, both files long loaded.
  //
  // HONESTY RULES the verdicts live by: not-configured and unreadable are
  // different answers; two reaching policies that disagree are a CONFLICT
  // (T12's territory, pointed at), not a coin toss; the baseline's own
  // CloudBlockLevel ambiguity (it stores 6 for HighPlus while its own
  // report calls 4 High+ and 6 zero tolerance) is carried as "4 or 6
  // satisfies", with the ambiguity printed; and NO SINGLE SCORE — a
  // compliance percentage flattens a conflict and a gap into the same
  // arithmetic, so this screen counts verdicts instead.
  // ======================================================================
  const DEF_PREFIX = "device_vendor_msft_policy_config_defender_";
  const ASR_PARENT = DEF_PREFIX + "attacksurfacereductionrules";
  const ASR_ACTION_WORD = { 0: "off", 1: "block", 2: "audit", 6: "warn" };

  const MDE_BASELINE = {
    name: "MDE-Active",
    source: "Get-DefenderSettings.ps1 v2.0 (CloudFellows, 2025-10-28)",
    // [guid, settings-catalog slug, name, expected action]
    asr: [
      ["56a863a9-875e-4185-98a7-b882c64b5ce5", "blockabuseofexploitedvulnerablesigneddrivers", "Block abuse of exploited vulnerable signed drivers", "audit"],
      ["7674ba52-37eb-4a4f-a9a1-f0f9a1619a2c", "blockadobereaderfromcreatingchildprocesses", "Block Adobe Reader from creating child processes", "block"],
      ["d4f940ab-401b-4efc-aadc-ad5f3c50688a", "blockallofficeapplicationsfromcreatingchildprocesses", "Block all Office applications from creating child processes", "audit"],
      ["9e6c4e1f-7d60-472f-ba1a-a39ef669e4b2", "blockcredentialstealingfromwindowslocalsecurityauthoritysubsystem", "Block credential stealing from LSASS", "block"],
      ["be9ba2d9-53ea-4cdc-84e5-9b1eeee46550", "blockexecutablecontentfromemailclientandwebmail", "Block executable content from email client and webmail", "block"],
      ["01443614-cd74-433a-b99e-2ecdc07bfc25", "blockexecutablefilesrunningunlesstheymeetprevalenceagetrustedlistcriterion", "Block executables unless they meet prevalence, age or trusted-list criteria", "block"],
      ["5beb7efe-fd9a-4556-801d-275e5ffc04cc", "blockexecutionofpotentiallyobfuscatedscripts", "Block execution of potentially obfuscated scripts", "audit"],
      ["d3e037e1-3eb8-44c8-a917-57927947596d", "blockjavascriptorvbscriptfromlaunchingdownloadedexecutablecontent", "Block JS/VBScript from launching downloaded executables", "audit"],
      ["3b576869-a4ec-4529-8536-b80a7769e899", "blockofficeapplicationsfromcreatingexecutablecontent", "Block Office applications from creating executable content", "audit"],
      ["75668c1f-73b5-4cf0-bb93-3ecf5cb7cc84", "blockofficeapplicationsfrominjectingcodeintootherprocesses", "Block Office applications from injecting code into other processes", "audit"],
      ["26190899-1602-49e8-8b27-eb1d0a1ce869", "blockofficecommunicationappfromcreatingchildprocesses", "Block Office communication app from creating child processes", "block"],
      ["e6db77e5-3df2-4cf1-b95a-636979351e5b", "blockpersistencethroughwmieventsubscription", "Block persistence through WMI event subscription", "block"],
      ["d1e49aac-8f56-4280-b9ba-993a6d77406c", "blockprocesscreationsfrompsexecandwmicommands", "Block process creations from PSExec and WMI commands", "audit"],
      ["b2b3f03d-6a65-4f7b-a9c7-1c7ef74a9ba4", "blockuntrustedunsignedprocessesthatrunfromusb", "Block untrusted/unsigned processes from USB", "block"],
      ["92e97fa1-2edf-4476-bdd6-9dd0b4dddc7b", "blockwin32apicallsfromofficemacros", "Block Win32 API calls from Office macros", "audit"],
      ["c1db55ab-c21a-4637-bb3f-a12568109d35", "useadvancedprotectionagainstransomware", "Use advanced protection against ransomware", "block"],
      ["33ddedf1-c6e0-47cb-833e-de6133960387", "blockrebootingmachineinsafemode", "Block rebooting machine in Safe Mode", "audit"],
      ["c0033c00-d16d-4114-a5a0-dc9b3a7d2ceb", "blockuseofcopiedorimpersonatedsystemtools", "Block use of copied or impersonated system tools", "audit"],
      ["a8f5898e-1dc8-49a9-9878-85004b8a61e6", "blockwebshellcreationforservers", "Block Webshell creation for Servers", "audit"],
    ],
    // [category, label, defId suffix under the Defender CSP, accepted tails, note]
    checks: [
      ["Core", "Real-time monitoring", "allowrealtimemonitoring", ["1"], ""],
      ["Core", "Behavior monitoring", "allowbehaviormonitoring", ["1"], ""],
      ["Core", "Intrusion prevention (NIS)", "allowintrusionpreventionsystem", ["1"], ""],
      ["Core", "Cloud protection (MAPS)", "allowcloudprotection", ["1"], "the baseline's MAPSReporting=Advanced collapses to on/off in the CSP"],
      ["Core", "Sample submission — send all", "submitsamplesconsent", ["3"], ""],
      ["Core", "Cloud block level — high plus or stricter", "cloudblocklevel", ["4", "6"], "the source script is at odds with itself: it stores 6 for HighPlus while its own report calls 4 High+ and 6 zero tolerance — either satisfies"],
      ["Network protection", "Network protection — block", "enablenetworkprotection", ["1"], ""],
      ["Advanced", "Script scanning", "allowscriptscanning", ["1"], ""],
      ["Advanced", "IOAV (downloaded file) protection", "allowioavprotection", ["1"], ""],
      ["Advanced", "Removable drive scanning", "allowfullscanremovabledrivescanning", ["1"], ""],
      ["Advanced", "Real-time scan direction — both", "realtimescandirection", ["0"], ""],
      ["Signature update", "Check signatures before scan", "checkforsignaturesbeforerunningscan", ["1"], ""],
      ["PUA", "PUA protection — block", "puaprotection", ["1"], ""],
    ],
    // Baseline settings with NO one-to-one settings-catalog setting — listed
    // rather than guessed at, because a check that cannot be read is not a
    // check that passed.
    unmapped: [
      "AllowDatagramProcessingOnWinServer", "AllowNetworkProtectionOnWinServer", "AllowNetworkProtectionDownLevel",
      "DisableTlsParsing", "AllowSwitchToAsyncInspection", "EnableDnsSinkhole", "EnableFileHashComputation",
      "UnknownThreatDefaultAction", "SignatureScheduleDay", "RandomizeScheduleTaskTime", "DisableBlockAtFirstSeen",
    ],
  };

  // Walk a settings-catalog setting instance, calling cb(defIdLower, value)
  // for every definition id that carries a value — choice, simple, and both
  // collection shapes, group children recursed.
  function walkInst(inst, cb) {
    if (!inst || typeof inst !== "object") return;
    const id = lc(inst.settingDefinitionId || "");
    if (inst.simpleSettingValue && id) cb(id, inst.simpleSettingValue.value);
    if (inst.choiceSettingValue) {
      if (id) cb(id, inst.choiceSettingValue.value);
      (inst.choiceSettingValue.children || []).forEach((c) => walkInst(c, cb));
    }
    if (Array.isArray(inst.groupSettingCollectionValue)) {
      inst.groupSettingCollectionValue.forEach((g) => (g.children || []).forEach((c) => walkInst(c, cb)));
    }
    if (Array.isArray(inst.simpleSettingCollectionValue) && id) {
      inst.simpleSettingCollectionValue.forEach((v) => cb(id, v && v.value));
    }
    if (Array.isArray(inst.choiceSettingCollectionValue)) {
      inst.choiceSettingCollectionValue.forEach((v) => {
        if (id && v) cb(id, v.value);
        ((v && v.children) || []).forEach((c) => walkInst(c, cb));
      });
    }
  }
  // A choice value is "<defId>_<tail>" — the tail is the answer. A simple
  // value is the answer itself.
  function tailOf(defId, v) {
    const s = lc(String(v ?? ""));
    return s.startsWith(defId + "_") ? s.slice(defId.length + 1) : String(v ?? "");
  }

  // defIdLower -> [{ policy, reaches, tail }]
  function settingsIndexOf(pols) {
    const ix = {};
    for (const P of pols) {
      if (!P.settings) continue;
      const reaches = P.reaches;
      for (const row of P.settings) {
        walkInst(row && row.settingInstance, (id, v) => {
          (ix[id] = ix[id] || []).push({ policy: P.name, reaches, tail: tailOf(id, v) });
        });
      }
    }
    return ix;
  }

  // One verdict for one expected value. `want` is the list of accepted tails.
  function evalEntries(entries, want) {
    const e = entries || [];
    if (!e.length) return { verdict: "notConfigured", found: [] };
    const reaching = e.filter((x) => x.reaches);
    if (!reaching.length) return { verdict: "unreachableOnly", found: e };
    const tails = [...new Set(reaching.map((x) => lc(x.tail)))];
    const hit = tails.some((t) => want.includes(t));
    if (tails.length > 1) return { verdict: "conflict", found: reaching };
    return { verdict: hit ? "match" : "deviate", found: reaching };
  }

  // The policy read behind the match: AV + ASR settings-catalog policies,
  // assignments expanded (reach is part of the verdict), settings read per
  // policy, pooled. Errors are per policy, never a lost report.
  async function baselineRead(onStatus) {
    onStatus && onStatus("Reading endpoint security policies…");
    const all = await Graph.readAll(`${Graph.BETA}/deviceManagement/configurationPolicies?$expand=assignments`, { scopes: S().config, retry: true });
    const rel = all.filter((p) => p.templateReference && /^endpointSecurity(Antivirus|AttackSurfaceReduction)/i.test(String(p.templateReference.templateFamily || "")));
    onStatus && onStatus(`Reading settings — ${rel.length} polic${rel.length === 1 ? "y" : "ies"}…`);
    const res = await Graph.pool(rel, (p) => Graph.readAll(`${Graph.BETA}/deviceManagement/configurationPolicies/${encodeURIComponent(p.id)}/settings?$top=1000`, { scopes: S().config, retry: true }), 4);
    return res.map((r) => ({
      name: (r.item && (r.item.name || r.item.id)) || "?",
      family: String((r.item.templateReference || {}).templateFamily || ""),
      reaches: EndpointSec.reachOf(r.item.assignments).kind === "reaches",
      settings: r.error ? null : r.value,
      error: r.error ? String((r.error && r.error.message) || r.error).slice(0, 160) : null,
    }));
  }

  // The match itself — pure over what was read, for the headless suite.
  function baselineMatch(pols, deviceRows) {
    const ix = settingsIndexOf(pols);
    const out = { baseline: MDE_BASELINE.name, source: MDE_BASELINE.source,
      policies: pols.map((p) => ({ name: p.name, family: p.family, reaches: p.reaches, error: p.error })),
      readErrors: pols.filter((p) => p.error).length,
      checks: [], asr: [], unmapped: MDE_BASELINE.unmapped.slice(), device: null, counts: null };

    for (const [category, label, suffix, want, note] of MDE_BASELINE.checks) {
      const r = evalEntries(ix[DEF_PREFIX + suffix], want);
      out.checks.push({ category, label, expected: want.join(" or "), note, verdict: r.verdict,
        found: r.found.map((f) => ({ policy: f.policy, value: f.tail, reaches: f.reaches })) });
    }

    // ASR: the per-rule catalog child first; the legacy parent's
    // "guid=action|guid=action" string as a second road to the same answer.
    const legacy = [];
    for (const e of ix[ASR_PARENT] || []) {
      for (const pair of String(e.tail).split("|")) {
        const m = /^\s*([0-9a-f-]{36})\s*=\s*(\d+)\s*$/i.exec(pair);
        if (m) legacy.push({ guid: lc(m[1]), policy: e.policy, reaches: e.reaches, tail: ASR_ACTION_WORD[Number(m[2])] || m[2] });
      }
    }
    for (const [guid, slug, name, expected] of MDE_BASELINE.asr) {
      const entries = (ix[ASR_PARENT + "_" + slug] || []).concat(legacy.filter((x) => x.guid === lc(guid)));
      const r = evalEntries(entries, [expected]);
      out.asr.push({ guid, name, expected, verdict: r.verdict,
        found: r.found.map((f) => ({ policy: f.policy, value: f.tail, reaches: f.reaches })) });
    }

    // The device layer — the three baseline expectations machines actually
    // report. A flag not reported is unknown; no state is its own answer.
    const flags = [["realTime", "real-time protection"], ["malware", "malware protection"], ["nis", "intrusion prevention (NIS)"]];
    const dl = { checked: 0, ok: 0, deviating: [], nostate: 0, notReported: {} };
    flags.forEach(([k]) => { dl.notReported[k] = 0; });
    for (const r of deviceRows || []) {
      if (r.bucket === "nostate") { dl.nostate++; continue; }
      dl.checked++;
      const bad = [];
      for (const [k, lab] of flags) {
        if (r[k] === false) bad.push(lab);
        else if (r[k] !== true) dl.notReported[k]++;
      }
      if (bad.length) dl.deviating.push({ name: r.name, user: r.user, which: bad });
      else dl.ok++;
    }
    out.device = dl;

    const tally = (rows) => {
      const c = { match: 0, deviate: 0, conflict: 0, notConfigured: 0, unreachableOnly: 0 };
      rows.forEach((r) => { c[r.verdict] = (c[r.verdict] || 0) + 1; });
      return c;
    };
    out.counts = { checks: tally(out.checks), asr: tally(out.asr) };
    return out;
  }

  // ---- exports ----
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  function meta() {
    return { when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "") };
  }
  const triState = (v) => v === true ? "on" : v === false ? "OFF" : "not reported";

  function markdown(rep, m) {
    const L = [];
    L.push("# Defender status report", "");
    L.push(`Generated ${m.when} by TUNO ${m.build}`, "");
    if (rep.deviceError) {
      L.push(`> **The Windows device list could not be read** — ${mdCell(rep.deviceError)}. Every per-device number below is unknown, not zero.`, "");
    } else if (rep.totals) {
      const t = rep.totals;
      L.push(`## Per device (${t.windows} Windows devices)`, "");
      L.push(`| Healthy | With findings | No state |`, `|---|---|---|`, `| ${t.healthy} | ${t.issues} | ${t.nostate} |`, "");
    }
    if (rep.overview) {
      const o = rep.overview;
      L.push(`## Graph's own rollup`, "");
      L.push(`Refreshed on its own schedule — it can disagree with the per-device sums above, and neither is quietly reconciled to the other.`, "");
      L.push(`| Reporting | Clean | Critical failures | Pending signatures | Pending restart | Inactive agent |`, `|---|---|---|---|---|---|`);
      L.push(`| ${o.totalReportedDeviceCount ?? "—"} | ${o.cleanDeviceCount ?? "—"} | ${o.criticalFailuresDeviceCount ?? "—"} | ${o.pendingSignatureUpdateDeviceCount ?? "—"} | ${o.pendingRestartDeviceCount ?? "—"} | ${o.inactiveThreatAgentDeviceCount ?? "—"} |`, "");
    } else if (rep.overviewError) {
      L.push(`## Graph's own rollup`, "", `> Could not be read — ${mdCell(rep.overviewError)}.`, "");
    }
    const withIssues = (rep.devices || []).filter((r) => r.bucket === "issues");
    if (withIssues.length) {
      L.push(`## Devices with findings (${withIssues.length}) — worst first`, "");
      L.push(`| Device | User | Findings | Signatures | Last reported |`, `|---|---|---|---|---|`);
      for (const r of withIssues) {
        L.push(`| ${mdCell(r.name)} | ${mdCell(r.user)} | ${mdCell(r.issues.join("; "))} | ${mdCell(r.signatureVersion)}${r.signatureOverdue ? " (overdue)" : ""} | ${mdCell(fmtWhen(r.lastReported))} |`);
      }
      L.push("");
    }
    const noState = (rep.devices || []).filter((r) => r.bucket === "nostate");
    if (noState.length) {
      L.push(`## No protection state (${noState.length}) — unknown, not healthy`, "");
      L.push(`A machine Defender has never reported on is exactly the machine this report exists to find.`, "");
      L.push(`| Device | User | Why | Last Intune sync |`, `|---|---|---|---|`);
      for (const r of noState) L.push(`| ${mdCell(r.name)} | ${mdCell(r.user)} | ${mdCell(r.reason)} | ${mdCell(fmtWhen(r.lastSync))} |`);
      L.push("");
    }
    const unrep = (rep.devices || []).filter((r) => r.unreported.length);
    if (unrep.length) {
      L.push(`> **${unrep.length} devices did not report every protection flag.** A flag the device did not report is listed as not reported, never counted as disabled — they are different answers.`, "");
    }
    if (rep.baseline) {
      const b = rep.baseline;
      const V = { match: "matches", deviate: "**DEVIATES**", conflict: "**CONFLICT — reaching policies disagree**",
        notConfigured: "not configured", unreachableOnly: "configured but **reaches nobody**" };
      const foundOf = (r) => r.found.length ? r.found.map((f) => `${f.value} (${mdCell(f.policy)}${f.reaches ? "" : ", reaches nobody"})`).join("; ") : "—";
      L.push(`## ${b.baseline} baseline match`, "");
      L.push(`Baseline: ${mdCell(b.source)}. Two layers — what the tenant's AV/ASR policies intend, and what devices report. A setting in a policy reaching nobody is not enforcement; unknown is never compliant.`, "");
      L.push(`### Policy layer — settings`, "", `| Category | Check | Expected | Verdict | Found |`, `|---|---|---|---|---|`);
      for (const r of b.checks) L.push(`| ${r.category} | ${mdCell(r.label)} | ${r.expected} | ${V[r.verdict]} | ${foundOf(r)} |`);
      L.push("", `### Policy layer — ASR rules`, "", `| Rule | Expected | Verdict | Found |`, `|---|---|---|---|`);
      for (const r of b.asr) L.push(`| ${mdCell(r.name)} | ${r.expected} | ${V[r.verdict]} | ${foundOf(r)} |`);
      const c = b.counts;
      L.push("", `Settings: ${c.checks.match} match, ${c.checks.deviate} deviate, ${c.checks.conflict} conflict, ${c.checks.notConfigured} not configured, ${c.checks.unreachableOnly} reach nobody. ASR rules: ${c.asr.match} match, ${c.asr.deviate} deviate, ${c.asr.conflict} conflict, ${c.asr.notConfigured} not configured, ${c.asr.unreachableOnly} reach nobody. No single score on purpose — a conflict and a gap are not the same finding.`, "");
      if (b.readErrors) L.push(`> ${b.readErrors} polic${b.readErrors === 1 ? "y's" : "ies'"} settings could not be read — their checks read from the rest, and absence there is unknown, not clean.`, "");
      const d = b.device;
      L.push(`### Device layer — what machines report`, "");
      L.push(`Graph's per-device state answers only three of the baseline's checks: real-time protection, malware protection, NIS. The rest are not in that surface — **not checked**, said rather than guessed.`, "");
      L.push(`${d.checked} devices checked: ${d.ok} match, ${d.deviating.length} deviate${d.nostate ? `, ${d.nostate} with no state (unknown, not compliant)` : ""}.`, "");
      if (d.deviating.length) {
        L.push(`| Device | User | Deviates on |`, `|---|---|---|`);
        for (const r of d.deviating) L.push(`| ${mdCell(r.name)} | ${mdCell(r.user)} | ${mdCell(r.which.join(", "))} |`);
        L.push("");
      }
      L.push(`Not checked (no one-to-one settings-catalog setting): ${b.unmapped.join(", ")}.`, "");
    }
    L.push(`---`, `Reads only, per-device state over Graph's beta surface. Why a machine has the configuration it has is the 🖥 Device analyzer's job.`);
    return L.join("\n");
  }

  function csv(rep) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["device,user,bucket,deviceState,realTimeProtection,tamperProtection,malwareProtection,networkInspection,signatureVersion,signatureOverdue,engineVersion,antiMalwareVersion,lastReported,lastIntuneSync,findings,reason"];
    for (const r of rep.devices || []) {
      L.push([q(r.name), q(r.user), r.bucket, q(r.deviceState), triState(r.realTime), triState(r.tamper), triState(r.malware), triState(r.nis),
        q(r.signatureVersion), r.signatureOverdue === null ? "" : String(!!r.signatureOverdue), q(r.engineVersion), q(r.antiMalwareVersion),
        q(fmtWhen(r.lastReported)), q(fmtWhen(r.lastSync)), q(r.issues.join("; ")), q(r.reason)].join(","));
    }
    return L.join("\n");
  }

  // ---- device search (build 10446) ------------------------------------
  // Pure and over THE FLEET ALREADY READ — the autocomplete's honesty is
  // that it can only suggest machines the report actually holds, so a
  // suggestion is a promise the row exists. Ranked: name-starts beats
  // name-contains beats user/id match. An empty query is no suggestions.
  function searchDevices(rep, query, cap) {
    const q = lc(String(query || "").trim());
    if (!q || !rep || !Array.isArray(rep.devices)) return [];
    const scored = [];
    for (const r of rep.devices) {
      const name = lc(r.name), user = lc(r.user), id = lc(r.id);
      let score = 0;
      if (name.startsWith(q)) score = 3;
      else if (name.includes(q)) score = 2;
      else if (user.includes(q) || id === q) score = 1;
      if (score) scored.push({ r, score });
    }
    scored.sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));
    return scored.slice(0, cap || 10).map((x) => x.r);
  }

  return { findingsOf, rowOf, report, markdown, csv, meta, triState, searchDevices,
    MDE_BASELINE, walkInst, tailOf, settingsIndexOf, evalEntries, baselineRead, baselineMatch };
})();


// ======================================================================
// T15 — the screen. Engine above is DOM-free for the headless suite.
// ======================================================================
const DefenderTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let rep = null, running = false, bucketFilter = null, baseRunning = false;
  // The live search term — a FILTER over the read fleet, with the dropdown
  // as a convenience on top of it. Cleared on every new read.
  let searchTerm = "";
  // Open folds keyed on DEVICE IDS — the T03 rule, so a re-render (or the
  // bucket filter) keeps them open.
  const open = new Set();

  function prog(msg) { TunoProgress.show("dfBody", "dfProg", msg); }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function showExports(on) { ["dfMd", "dfCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); }

  async function run() {
    if (running || baseRunning) return;
    running = true; $("dfRun").disabled = true; showExports(false); $("dfBody").innerHTML = ""; open.clear(); bucketFilter = null;
    searchTerm = ""; if ($("dfSearch")) { $("dfSearch").value = ""; } if ($("dfSearchWrap")) $("dfSearchWrap").style.display = "none"; closeSuggest();
    try {
      await Graph.ensureScopes(Graph.SCOPES.devices);
      rep = await Defender.report({ onStatus: prog });
      prog("");
      render();
      showExports(!rep.deviceError);
      if (!rep.deviceError && $("dfSearchWrap")) $("dfSearchWrap").style.display = "";
    } catch (e) {
      $("dfBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
      prog("");
    } finally { running = false; $("dfRun").disabled = false; }
  }

  // ---- the MDE baseline match (10536) ----------------------------------
  // One click does both halves: the fleet read if this session does not
  // hold one yet (the device layer needs it), then the policy read. A
  // fresh fleet read CLEARS the match rather than pairing new devices with
  // old policy answers — T20's correlation rule.
  async function runBaseline() {
    if (running || baseRunning) return;
    baseRunning = true; $("dfBase").disabled = true;
    try {
      // the policy read joins the ask at THIS click — config was never
      // part of the plain fleet read and stays out of it
      await Graph.ensureScopes([...new Set([...Graph.SCOPES.devices, ...Graph.SCOPES.config])]);
      if (!rep || rep.deviceError) {
        showExports(false); $("dfBody").innerHTML = ""; open.clear(); bucketFilter = null;
        searchTerm = ""; if ($("dfSearch")) $("dfSearch").value = ""; closeSuggest();
        rep = await Defender.report({ onStatus: prog });
      }
      const pols = await Defender.baselineRead(prog);
      rep.baseline = Defender.baselineMatch(pols, rep.devices || []);
      prog("");
      render();
      showExports(!rep.deviceError);
      if (!rep.deviceError && $("dfSearchWrap")) $("dfSearchWrap").style.display = "";
    } catch (e) {
      prog("");
      $("dfBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>` + $("dfBody").innerHTML;
    } finally { baseRunning = false; $("dfBase").disabled = false; }
  }

  const fmtWhen = (s) => esc(String(s || "").replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "Z"));
  const tri = (v) => v === true ? "on" : v === false ? "<b>OFF</b>" : "<span class=\"muted\">not reported</span>";

  function render() {
    const parts = [];

    if (rep.deviceError) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>The Windows device list could not be read.</b><span class="why">${esc(rep.deviceError)} — every per-device number is unknown, not zero.</span></div></div>`);
      $("dfBody").innerHTML = parts.join("");
      return;
    }

    // Cards double as bucket filters — the T09 pattern: click to narrow,
    // click again for everything.
    const t = rep.totals;
    const card = (id, label, n, sub, cls) => `<button class="au-card au-card-btn ${bucketFilter === id ? "active" : ""}" data-dfbucket="${id}" type="button">
      <div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></button>`;
    parts.push(`<div class="au-cards">
      ${card("healthy", "Healthy", t.healthy, `of ${t.windows} Windows devices`, t.healthy ? "ok" : "")}
      ${card("issues", "With findings", t.issues, "worst first below", t.issues ? "bad" : "ok")}
      ${card("nostate", "No state", t.nostate, "never reported or unreadable — unknown, not healthy", t.nostate ? "bad" : "ok")}
    </div>`);

    if (rep.overview) {
      const o = rep.overview;
      parts.push(`<div class="list-card">
        <h4 style="margin:0 0 4px">Graph's own rollup</h4>
        <p class="mini muted" style="margin:0 0 8px">Refreshed on Graph's schedule, not this page's — it <b>can disagree</b> with the per-device counts above, and neither is quietly reconciled to the other.</p>
        <p class="mini" style="margin:0">${o.totalReportedDeviceCount ?? "—"} reporting · ${o.cleanDeviceCount ?? "—"} clean · ${o.criticalFailuresDeviceCount ?? "—"} critical failures · ${o.pendingSignatureUpdateDeviceCount ?? "—"} pending signature update · ${o.pendingRestartDeviceCount ?? "—"} pending restart · ${o.inactiveThreatAgentDeviceCount ?? "—"} inactive agent</p>
      </div>`);
    } else if (rep.overviewError) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>The tenant rollup could not be read.</b><span class="why">${esc(rep.overviewError)} — the per-device answer below stands on its own.</span></div></div>`);
    }

    if (rep.baseline) parts.push(baselineCard(rep.baseline));

    const q = searchTerm.trim().toLowerCase();
    const shown = (rep.devices || []).filter((r) =>
      (!bucketFilter || r.bucket === bucketFilter)
      && (!q || r.name.toLowerCase().includes(q) || r.user.toLowerCase().includes(q) || r.id.toLowerCase() === q));
    const CAP = 200;
    const rows = shown.slice(0, CAP).map((r) => {
      const isOpen = open.has(r.id);
      const badge = r.bucket === "issues" ? `<span class="au-op delete">${r.issues.length} finding${r.issues.length === 1 ? "" : "s"}</span>`
        : r.bucket === "nostate" ? `<span class="gu-how priv" title="Unknown, not healthy">no state</span>`
        : `<span class="au-op create">healthy</span>`;
      const head = `<div class="au-ev-h">
          <b>${esc(r.name)}</b> ${badge}
          ${r.unreported.length ? `<span class="gu-how exc" title="A flag the device did not report is not a flag that is off">${r.unreported.length} not reported</span>` : ""}
          <span class="au-when mini muted">${esc(r.user)}</span>
        </div>
        <div class="mini muted au-ev-m">${r.bucket === "nostate" ? esc(r.reason) : `${esc(r.issues.slice(0, 3).join(" · ") || "no findings")}${r.issues.length > 3 ? ` · +${r.issues.length - 3} more` : ""}`} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>`;
      const detail = !isOpen ? "" : `<div class="au-detail">
        <div class="au-detail-grid mini">
          <span class="muted">Device state</span><span>${esc(r.deviceState) || "<span class=\"muted\">not reported</span>"}</span>
          <span class="muted">Real-time protection</span><span>${tri(r.realTime)}</span>
          <span class="muted">Tamper protection</span><span>${tri(r.tamper)}</span>
          <span class="muted">Malware protection</span><span>${tri(r.malware)}</span>
          <span class="muted">Network inspection (NIS)</span><span>${tri(r.nis)}</span>
          <span class="muted">Signatures</span><span>${esc(r.signatureVersion) || "—"}${r.signatureOverdue ? " · <b>update overdue</b>" : ""}</span>
          <span class="muted">Engine / platform</span><span>${esc(r.engineVersion) || "—"} / ${esc(r.antiMalwareVersion) || "—"}</span>
          <span class="muted">Last reported</span><span>${fmtWhen(r.lastReported) || "never"}</span>
          <span class="muted">Last Intune sync</span><span>${fmtWhen(r.lastSync) || "—"}</span>
        </div>
        ${r.issues.length ? `<ul class="mini au-diff">${r.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
        ${r.unreported.length ? `<p class="mini muted" style="margin:6px 0 0">Not reported by the device: ${esc(r.unreported.join(", "))} — listed as unknown, never counted as disabled.</p>` : ""}
        <p class="mini muted" style="margin:6px 0 0"><a href="#" data-dfdev="${esc(r.name)}">Open in the 🖥 Device analyzer</a> — why this machine has the configuration it has.</p>
      </div>`;
      const cls = r.bucket === "issues" ? "bad" : r.bucket === "nostate" ? "warn" : "ok";
      return `<div class="au-fold ${cls} ${isOpen ? "open" : ""}" data-dffold="${esc(r.id)}"><div class="au-ev-card">${head}${detail}</div></div>`;
    }).join("");

    parts.push(`<div class="list-card">
      <h4 style="margin:0 0 4px">Devices (${shown.length}${(bucketFilter || searchTerm) ? ` of ${rep.totals.windows}` : ""})</h4>
      ${searchTerm ? `<p class="mini muted" style="margin:0 0 6px">Filtered by search “${esc(searchTerm)}” — clear the box for the whole fleet.</p>` : ""}
      <p class="mini muted" style="margin:0 0 10px">Worst first — click a device for its full protection state. A flag the device did not report reads <i>not reported</i>, never <i>off</i>: they are different answers.</p>
      ${rows || `<p class="mini muted" style="margin:0">Nothing in this bucket.</p>`}
      ${shown.length > CAP ? `<p class="mini muted" style="margin:8px 0 0">Showing the worst ${CAP} of ${shown.length} — the CSV export carries all of them.</p>` : ""}
    </div>`);

    $("dfBody").innerHTML = parts.join("");

    $("dfBody").querySelectorAll("[data-dfbucket]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.dfbucket;
      bucketFilter = bucketFilter === k ? null : k;
      render();
    }));
  }

  // The baseline card — verdict chips per check, ASR folded into its own
  // table, the device layer's three answers, and the not-checked list said
  // out loud. No single score on purpose.
  function baselineCard(b) {
    const chip = (v) => v === "match" ? `<span class="au-op create">matches</span>`
      : v === "deviate" ? `<span class="au-op delete">deviates</span>`
      : v === "conflict" ? `<span class="au-op delete">conflict</span>`
      : v === "unreachableOnly" ? `<span class="gu-how priv" title="The setting exists, but only in a policy reaching nobody — that is not enforcement">reaches nobody</span>`
      : `<span class="gu-how exc">not configured</span>`;
    const foundOf = (r) => r.found.length
      ? r.found.map((f) => `${esc(f.value)} <span class="muted">(${esc(f.policy)}${f.reaches ? "" : " — reaches nobody"})</span>`).join("; ")
      : `<span class="muted">—</span>`;
    const rows = (list, label2) => list.map((r) => `<tr><td>${esc(r.category || "")}${r.category ? " · " : ""}${esc(r[label2])}${r.note ? ` <span class="gu-how exc" title="${esc(r.note)}">note</span>` : ""}</td><td>${esc(r.expected)}</td><td>${chip(r.verdict)}</td><td>${foundOf(r)}</td></tr>`).join("");
    const c = b.counts;
    const sum = (t) => `${t.match} match · ${t.deviate} deviate · ${t.conflict} conflict · ${t.notConfigured} not configured · ${t.unreachableOnly} reach nobody`;
    const d = b.device;
    const dev = d.deviating.slice(0, 20).map((x) => `<b>${esc(x.name)}</b> <span class="muted">(${esc(x.which.join(", "))})</span>`).join(", ");
    return `<div class="list-card">
      <h4 style="margin:0 0 4px">🧱 ${esc(b.baseline)} baseline match</h4>
      <p class="mini muted" style="margin:0 0 10px">Baseline: ${esc(b.source)}. Two layers — what the tenant's AV/ASR policies <b>intend</b>, and what devices <b>report</b>. A setting that lives only in a policy reaching nobody is not enforcement; a check Graph cannot see is not checked, said rather than guessed; and there is no single score on purpose — a conflict and a gap are not the same finding.</p>
      ${b.readErrors ? `<div class="gu-fail" style="margin:0 0 10px"><b>${b.readErrors} polic${b.readErrors === 1 ? "y's" : "ies'"} settings could not be read.</b><span class="why">Their checks read from the rest — absence there is unknown, not clean.</span></div>` : ""}
      <p class="mini" style="margin:0 0 6px"><b>Settings</b> — ${sum(c.checks)}</p>
      <div style="overflow-x:auto"><table class="cg-table mini"><tr><th>Check</th><th>Expected</th><th>Verdict</th><th>Found (policy)</th></tr>${rows(b.checks, "label")}</table></div>
      <p class="mini" style="margin:12px 0 6px"><b>ASR rules</b> — ${sum(c.asr)}</p>
      <div style="overflow-x:auto"><table class="cg-table mini"><tr><th>Rule</th><th>Expected</th><th>Verdict</th><th>Found (policy)</th></tr>${rows(b.asr, "name")}</table></div>
      <p class="mini" style="margin:12px 0 4px"><b>Device layer</b> — ${d.checked} devices checked on the three flags Graph reports (real-time, malware, NIS): ${d.ok} match, ${d.deviating.length} deviate${d.nostate ? `, ${d.nostate} with no state — unknown, not compliant` : ""}.</p>
      ${d.deviating.length ? `<p class="mini" style="margin:0 0 4px">${dev}${d.deviating.length > 20 ? ` <span class="muted">· +${d.deviating.length - 20} more — the MD export carries all of them</span>` : ""}</p>` : ""}
      <p class="mini muted" style="margin:8px 0 0">Not checked — no one-to-one settings-catalog setting: ${esc(b.unmapped.join(", "))}.</p>
    </div>`;
  }

  function exportAs(fmt) {
    const m = Defender.meta();
    if (fmt === "md") return download("Defender-status-report.md", Defender.markdown(rep, m), "text/markdown");
    return download("Defender-status-report.csv", Defender.csv(rep), "text/csv");
  }

  // ---- the autocomplete (10446) ----------------------------------------
  // Suggestions come from Defender.searchDevices over the fleet in memory —
  // no Graph call per keystroke, and nothing to suggest before a read.
  let sugIndex = -1;
  function closeSuggest() { const d = $("dfSuggest"); if (d) d.style.display = "none"; sugIndex = -1; }
  function renderSuggest() {
    const d = $("dfSuggest");
    if (!d || !rep) return;
    const hits = Defender.searchDevices(rep, $("dfSearch").value, 10);
    if (!hits.length) { closeSuggest(); return; }
    const badge = (r) => r.bucket === "issues" ? `<span class="au-op delete">${r.issues.length}</span>`
      : r.bucket === "nostate" ? `<span class="gu-how priv">no state</span>` : `<span class="au-op create">ok</span>`;
    d.innerHTML = hits.map((r, i) => `<button type="button" class="au-pop-item ${i === sugIndex ? "active" : ""}" data-dfsug="${esc(r.id)}" data-dfsugname="${esc(r.name)}">
      <b>${esc(r.name)}</b> ${badge(r)} <span class="mini muted">${esc(r.user)}</span></button>`).join("");
    d.style.display = "flex";
    d.querySelectorAll("[data-dfsug]").forEach((b) => b.addEventListener("mousedown", (e) => {
      // mousedown, not click — the input's blur would close the list first
      e.preventDefault();
      pickSuggestion(b.dataset.dfsug, b.dataset.dfsugname);
    }));
  }
  function pickSuggestion(id, name) {
    searchTerm = name;
    $("dfSearch").value = name;
    open.add(id);              // the point of finding it is reading it
    bucketFilter = null;       // a found device shows whatever its bucket
    closeSuggest();
    $("dfSearchClear").style.display = "";
    render();
  }

  function init() {
    if (!$("dfRun")) return;
    $("dfRun").addEventListener("click", run);
    if ($("dfBase")) $("dfBase").addEventListener("click", runBaseline);
    $("dfMd").addEventListener("click", () => exportAs("md"));
    $("dfCsv").addEventListener("click", () => exportAs("csv"));
    if ($("dfSearch")) {
      $("dfSearch").addEventListener("input", () => {
        searchTerm = $("dfSearch").value;
        $("dfSearchClear").style.display = searchTerm ? "" : "none";
        sugIndex = -1;
        renderSuggest();
        render();
      });
      $("dfSearch").addEventListener("keydown", (e) => {
        const d = $("dfSuggest");
        const items = d ? [...d.querySelectorAll("[data-dfsug]")] : [];
        if (e.key === "ArrowDown" && items.length) { e.preventDefault(); sugIndex = (sugIndex + 1) % items.length; renderSuggest(); }
        else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); sugIndex = (sugIndex - 1 + items.length) % items.length; renderSuggest(); }
        else if (e.key === "Enter" && sugIndex >= 0 && items[sugIndex]) { e.preventDefault(); pickSuggestion(items[sugIndex].dataset.dfsug, items[sugIndex].dataset.dfsugname); }
        else if (e.key === "Escape") closeSuggest();
      });
      $("dfSearch").addEventListener("blur", () => setTimeout(closeSuggest, 150));
      $("dfSearchClear").addEventListener("click", () => {
        searchTerm = ""; $("dfSearch").value = ""; $("dfSearchClear").style.display = "none";
        closeSuggest(); render();
      });
    }
    $("dfBody").addEventListener("click", (e) => {
      // A device opens in the Device analyzer through the tile's own handler —
      // the compliance report's rule: crumb, tab and sidebar all follow.
      const d = e.target.closest("[data-dfdev]");
      if (d) {
        e.preventDefault();
        const tile = $("toolDevice"), term = $("dvTerm"), go = $("dvRun");
        if (!tile || !term || !go) return;
        tile.click();
        term.value = d.dataset.dfdev;
        go.click();
        return;
      }
      const f = e.target.closest("[data-dffold]");
      if (!f || e.target.closest("a,code,button")) return;
      const id = f.dataset.dffold;
      open.has(id) ? open.delete(id) : open.add(id);
      render();
    });
  }

  return { init, run };
})();

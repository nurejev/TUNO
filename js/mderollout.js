// ======================================================================
// T28 — MDE rollout (temporary project tool, beta only)
//
// Built for one migration (Mihai, build 10632): a tenant replacing its
// old Defender / endpoint security policies with a new set, rolled out in
// WAVES. Four questions, one screen:
//
//   1. WHICH POLICIES ARE THE NEW SET, which are the old ones, and which
//      are out of scope? Decided by NAME — the new set starts with the
//      prefixes on the ⚙️ Naming rules pane ("Win - OIB", "WIN-SEC",
//      "WIN-DCP" by default), out of scope starts with "AVD" / "WinServ",
//      "(TO-BE-REMOVED)" is T20's interim convention, and everything else
//      is old. The rules are EDITABLE and kept per tenant, because a name
//      convention is the only thing that says which generation a policy
//      belongs to and every tenant spells its own.
//   2. WHICH OLD POLICIES COLLIDE WITH A NEW ONE? Setting by setting —
//      the same settingDefinitionId configured in both (ASR per RULE, so
//      a one-rule WIN-SEC policy meets the one rule it replaces in an old
//      all-rules policy), with the value on each side and whether the two
//      can reach the same devices. A legacy template or ADMX cannot be
//      matched setting by setting; it meets the new set by CATEGORY and
//      says so ("review").
//   3. WHAT FIXES IT? For a collision the proposal is the rollout's own
//      move: exclude the groups the NEW policy includes from the OLD one,
//      so those devices take the new settings alone. Proposals that
//      Intune does not support are refused where they are made — see
//      GROUP KINDS below.
//   4. IS AN OLD POLICY SAFE TO RETIRE? Every setting it carries is
//      looked up in the new set: same value, different value, or nowhere
//      (a GAP — retiring it removes the setting from those devices).
//
// NOTHING HERE IS A SECOND COPY. The read is the shared one (PolicyCache →
// Docs.collect, keepRaw); scope classification is T20's
// (EndpointPosture.classify / intentNode / isInterim); the settings
// flattener is T16's (EndpointSec.flattenSettings / asrRulesOf); the reach
// verdict is T12's (Conflict.reachOf / verdictPair); every assignment
// write is T11's engine (AssignEdit.planFor → applyPlan, fresh read, drift
// check, verify read-back, the run ledger); a wave group is created with
// T22's payload rules (GroupMigrate.mailNickname, its write scope). What
// is new is the COMPARISON of generations, the proposals, the group-kind
// check and the multi-group plan, and they live in the engine below so
// the headless suite can hold them to account.
//
// GROUP KINDS (Microsoft Learn, "Assign policies in Microsoft Intune",
// support matrix): excluding a USER group from a policy assigned to
// DEVICE groups — or the reverse — is NOT SUPPORTED: "Intune doesn't
// evaluate user-to-device group relationships, and devices of the
// included users aren't excluded." A proposal that would mix them is
// therefore refused, not offered, and says which kind each side is. Kind
// is read from the tenant: a dynamic group by its rule, an assigned group
// by counting its user and device members; an empty assigned group falls
// back to its name (UG / DG) and says it is a guess.
//
// MDE SECURITY SETTINGS MANAGEMENT (Learn, "Manage endpoint security
// policies in Microsoft Defender for Endpoint"): devices onboarded to
// Defender but not enrolled in Intune take assignments by DEVICE group
// only, and assignment filters do not apply to them. A policy whose
// `technologies` carry microsoftSense is flagged when a user group or a
// filter is involved.
//
// WRITES: assignments (DeviceManagementConfiguration.ReadWrite.All, at the
// Apply click, via AssignEdit) and new wave groups (Group.ReadWrite.All,
// at the Create click, T22's scope). Nothing is deleted, nothing renamed.
//
// TEMPORARY. Listed under Help's "Staying on this channel": it is never
// promoted, and it is removed when the rollout it was built for is done.
// ======================================================================
const MdeRollout = (() => {
  "use strict";

  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const uniq = (a) => [...new Set(a)];

  // ------------------------------------------------------------ config --
  // The defaults are the rollout this tool was built for. They are only
  // defaults: the ⚙️ pane edits them and they are kept per tenant.
  // Wave groups come in PAIRS per region (build 10633): a device group for
  // the "- D -" policies and a user group for the "- U -" ones, because
  // Intune assigns — and excludes — a policy by one kind of group. Two
  // exclusion groups (device + user) hold whoever stays on the old set.
  const DEFAULTS = Object.freeze({
    newPrefixes: ["Win - OIB", "WIN-SEC", "WIN-DCP"],
    outPrefixes: ["AVD", "WinServ", "Win-Serv"],
    waveRegions: ["Euro", "Americas", "Asia-Pacific", "Italy", "BAMSCA"],
    // Renamed at 10635 (Mihai: "the wave groups are named wrong — they need
    // to be INT-SG-D-WAVE-Euro or INT-SG-U-WAVE-Euro"). A group still under
    // an earlier name is found by it and offered for RENAME (🌊 pane) —
    // same object id, so every assignment and nesting stays as it is.
    waveDevicePrefix: "INT-SG-D-WAVE-",
    waveUserPrefix: "INT-SG-U-WAVE-",
    renameFrom: { device: ["PVM-DG-MDE-WAVE-"], user: ["PVM-UG-MDE-WAVE-"] },
    renameExclusionFrom: { device: ["PVM-DG-MDE-Exclusion"], user: ["PVM-UG-MDE-Exclusion"] },
    // Renamed at 10636 (Mihai: "PVM-DG-MDE-Exclusion and PVM-UG-MDE-Exclusion
    // should be INT-SG-D-MDE-Exclusion and INT-SG-U-MDE-Exclusion"); the old
    // names are found and offered for rename, like the waves.
    exclusionDevice: "INT-SG-D-MDE-Exclusion",
    exclusionUser: "INT-SG-U-MDE-Exclusion",
    waveDescription: "MDE rollout wave — created by TUNO (T28 MDE rollout).",
    exclusionDescription: "MDE rollout exclusion — members stay off the new MDE policies. Created by TUNO (T28 MDE rollout).",
    // Policies in the target list by NAME although nothing in them is an
    // MDE area (10634, Mihai: "add these policies to the new list").
    alsoInScope: [
      "Win - OIB - SC - Device Security - D - Audit and Event Logging - v3.7",
      "Win - OIB - SC - Device Security - D - Security Hardening - v3.7",
      "Win - OIB - SC - Device Security - D - Local Security Policies (24H2+) - v3.6.1",
      "Win - OIB - SC - Windows Update for Business - D - Delivery Optimisation - v3.0",
      "Win - OIB - SC - Windows Update for Business - D - Reports and Telemetry - v3.0",
    ],
    // Policies LEFT OUT by name (10639, Mihai: "also add a same for
    // excluding a policy") — out of scope whatever their prefix or content:
    // listed under 🚫, never compared, planned, or pulled in by a setting.
    // The default list (10642, Mihai: "should be default excluded with the
    // option to include if needed", and Ring 3 Production "also exclude");
    // ➕ include under 🚫 takes a name off it for the tenant.
    leaveOut: [
      "Win - OIB - ES - Encryption - D - BitLocker (OS Disk) - v3.0",
      "Win - OIB - ES - Encryption - U - Personal Data Encryption - v3.4",
      "Win - OIB - SC - Defender Antivirus - D - Additional Configuration - v3.5",
      "Win - OIB - SC - Device Security - D - Security Hardening - v3.6",
      "Win - OIB - SC - Device Security - U - Device Guard, Credential Guard and HVCI - v3.5",
      "Win - OIB - SC - Microsoft Edge - D - Security - v3.6.1",
      "Win - OIB - SC - Microsoft Edge - U - User Experience - v3.6",
      "WIN-DCP-DeviceConfiguration-D-ContactMonkeySettings-v2.0",
      "WIN-DCP-DeviceConfiguration-D-SharedDeviceSettings-GLO-v2.0",
      "WIN-DCP-DeviceConfiguration-U-BrowserDefaultSearchEngine-GLO-v1.0",
      "WIN-DCP-DeviceSecurity-D-MDE_Device_TAG-PILOT-v2.0",
      "WIN-DCP-DeviceSecurity-D-MDE_Device_TAG-PRE-PILOT-v2.0",
      "WIN-DCP-DeviceSecurity-D-MDE_Device_TAG-TUR-v2.0",
      "WIN-DCP-MicrosoftEdge-D-CustomEdgeSettings-GBR-v1.0",
      "WIN-DCP-MicrosoftEdge-D-CustomEdgeSettings-USA-v1.0",
      "WIN-DCP-MicrosoftEdge-D-CustomEdgeSettings-USA2-v1.0",
      "WIN-DCP-MicrosoftEdge-U-HomePageChange-BR-v1.0",
      "WIN-DCP-MicrosoftEdge-U-HomePageChange-DE-v1.0",
      "WIN-DCP-MicrosoftEdge-U-HomePageChange-ID-v3.0",
      "WIN-DCP-MicrosoftEdge-U-OpenSite_IE_Modus-GRC-v1.0",
      "WIN-DCP-MicrosoftEdge-U-ProfilesSign-InAndSync-v3.0.1",
      "WIN-SEC-AccountProtection-D-LUGM-ARE-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-BGA-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-BRA-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-CHE-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-CHN-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-CZE-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-DNK-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-ESP-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-FRA-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-GBR-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-GER-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-GRC-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-HKG-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-IDN-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-IND-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-ITA-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-KOR-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-LKA-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-MEX-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-NGA-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-NLD-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-PHL-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-POL-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-RDP-POL-Skarb-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-SGP-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-THA-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-TUR-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-USA-v1.0",
      "WIN-SEC-AccountProtection-D-LUGM-VNM-v1.0",
      "WIN-SEC-AppControlForBusiness-D-BlockBadScriptHost-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-01_Block Adobe Reader from creating child processes-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-02_Block execution of potentially obfuscated scripts-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-03_Block Win32 API calls from Office macros-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-04_Block credential stealing from the Windows local security authority subsystem (lsass.exe)",
      "WIN-SEC-AttackSurfaceReduction-D-05_Block executable files from running unless they meet a prevalence, age, or trusted list criterion-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-06_Block JavaScript or VBScript from launching downloaded executable content-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-07_Block Office communication application from creating child processes-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-08_Block all Office applications from creating child processes-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-09_Block untrusted and unsigned processes that run from USB-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-10_Block process creations originating from PSExec and WMI commands-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-11_Block persistence through WMI event subscription-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-12_Block Office applications from creating executable content-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-13_Block Office applications from injecting code into other processes-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-14_Use advanced protection against ransomware-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-15_Block executable content from email client and webmail-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-16_Block abuse of exploited vulnerable signed drivers-v1.0",
      "WIN-SEC-AttackSurfaceReduction-D-17_Block use of copied or impersonated system tools -v.1.0",
      "WIN-SEC-AttackSurfaceReduction-D-18_Block rebooting machine in Safe Mode - v.1.0",
      "WIN-SEC-AttackSurfaceReduction-U-BlockUSBDevices-v2.0",
      "WIN-SEC-DefenderFirewallRules-D-AllowICMP-POL-SKARB-v1.1",
      "WIN-SEC-DefenderFirewallRules-D-AllowMiracast-GLO-v1.2",
      "WIN-SEC-DefenderFirewallRules-D-AllowRDP-GLO-v1.1",
      "Win-SEC-EndpointDetectionAndResponse-D-OFFboardFromFile-v1.0",
      "Win-SEC-EndpointDetectionAndResponse-D-OnboardFromConnector-v1.1",
      "WIN-SEC-EndpointPrivilegeManagement-D-PilotSettings-v1.0",
      "WIN-SEC-EndpointPrivilegeManagement-D-VNM-v1.0",
      "Win - OIB - ES - Defender Antivirus Updates - Ring 3 - Production - v3.4",
    ],
    // bumped when the default list grows: a config saved before gets the
    // new defaults merged in once, then keeps what was included by hand
    leaveOutSeed: 10642,
    // 🧪 the pilot groups the waves take over (10645, Mihai: "when adding
    // the wave groups to new policies remove the pilot groups")
    pilotGroups: ["INT-SG-D-Win-Pilot", "INT-SG-D-Win-Pre-Pilot", "INT-SG-U-Win-Pre-Pilot", "INT-SG-U-Win-Pilot"],
  });
  const cleanList = (a) => uniq((a || []).map((x) => String(x == null ? "" : x).trim()).filter(Boolean));
  const str = (v, d) => { const t = String(v == null ? "" : v).trim(); return t || d; };
  // A region list from a build-10632 config, which kept full wave NAMES:
  // the tail after either wave prefix is the region.
  function regionsFromNames(list, cfg) {
    const pre = [cfg.waveUserPrefix, cfg.waveDevicePrefix, DEFAULTS.waveUserPrefix, DEFAULTS.waveDevicePrefix, ...DEFAULTS.renameFrom.user, ...DEFAULTS.renameFrom.device].map(lc);
    return cleanList((list || []).map((n) => {
      const x = String(n || "").trim();
      const p = pre.find((q) => q && lc(x).startsWith(q));
      return p ? x.slice(p.length) : x;
    }));
  }
  // Every group the rollout names, in display order: per region the device
  // wave then its user twin, then the two exclusion groups.
  function groupsOf(cfg) {
    const out = [];
    for (const region of cfg.waveRegions) {
      const d = `${cfg.waveDevicePrefix}${region}`, u = `${cfg.waveUserPrefix}${region}`;
      const old = (aud, now) => uniq(((cfg.renameFrom && cfg.renameFrom[aud]) || []).map((p) => `${p}${region}`)).filter((n) => lc(n) !== lc(now));
      out.push({ name: d, role: "wave", audience: "device", region, twin: u, oldNames: old("device", d) });
      out.push({ name: u, role: "wave", audience: "user", region, twin: d, oldNames: old("user", u) });
    }
    const oldEx = (aud, now) => uniq(((cfg.renameExclusionFrom && cfg.renameExclusionFrom[aud]) || [])).filter((n) => lc(n) !== lc(now));
    if (cfg.exclusionDevice) out.push({ name: cfg.exclusionDevice, role: "exclusion", audience: "device", region: "", twin: cfg.exclusionUser || "", oldNames: oldEx("device", cfg.exclusionDevice) });
    if (cfg.exclusionUser) out.push({ name: cfg.exclusionUser, role: "exclusion", audience: "user", region: "", twin: cfg.exclusionDevice || "", oldNames: oldEx("user", cfg.exclusionUser) });
    const seen = new Set();
    return out.filter((g) => !seen.has(lc(g.name)) && seen.add(lc(g.name)));
  }
  function normConfig(c) {
    const o = c || {};
    const cfg = {
      newPrefixes: cleanList(Array.isArray(o.newPrefixes) ? o.newPrefixes : DEFAULTS.newPrefixes),
      outPrefixes: cleanList(Array.isArray(o.outPrefixes) ? o.outPrefixes : DEFAULTS.outPrefixes),
      // a config saved with the pre-10635 DEFAULT names moves to the new ones
      // (those were never chosen, only inherited); a name chosen by hand stays
      waveDevicePrefix: (() => { const v = str(o.waveDevicePrefix, DEFAULTS.waveDevicePrefix); return DEFAULTS.renameFrom.device.some((p) => lc(p) === lc(v)) ? DEFAULTS.waveDevicePrefix : v; })(),
      waveUserPrefix: (() => { const v = str(o.waveUserPrefix, DEFAULTS.waveUserPrefix); return DEFAULTS.renameFrom.user.some((p) => lc(p) === lc(v)) ? DEFAULTS.waveUserPrefix : v; })(),
      renameFrom: {
        device: cleanList([...DEFAULTS.renameFrom.device, ...((o.renameFrom && o.renameFrom.device) || [])]),
        user: cleanList([...DEFAULTS.renameFrom.user, ...((o.renameFrom && o.renameFrom.user) || [])]),
      },
      // a config saved with the pre-10636 default exclusion names moves along
      exclusionDevice: o.exclusionDevice == null ? DEFAULTS.exclusionDevice : (DEFAULTS.renameExclusionFrom.device.some((n) => lc(n) === lc(String(o.exclusionDevice).trim())) ? DEFAULTS.exclusionDevice : String(o.exclusionDevice).trim()),
      exclusionUser: o.exclusionUser == null ? DEFAULTS.exclusionUser : (DEFAULTS.renameExclusionFrom.user.some((n) => lc(n) === lc(String(o.exclusionUser).trim())) ? DEFAULTS.exclusionUser : String(o.exclusionUser).trim()),
      renameExclusionFrom: {
        device: cleanList([...DEFAULTS.renameExclusionFrom.device, ...((o.renameExclusionFrom && o.renameExclusionFrom.device) || [])]),
        user: cleanList([...DEFAULTS.renameExclusionFrom.user, ...((o.renameExclusionFrom && o.renameExclusionFrom.user) || [])]),
      },
      waveDescription: str(o.waveDescription, DEFAULTS.waveDescription),
      exclusionDescription: str(o.exclusionDescription, DEFAULTS.exclusionDescription),
      alsoInScope: cleanList(Array.isArray(o.alsoInScope) ? o.alsoInScope : DEFAULTS.alsoInScope),
      leaveOut: cleanList(!Array.isArray(o.leaveOut) ? DEFAULTS.leaveOut
        : o.leaveOutSeed === DEFAULTS.leaveOutSeed ? o.leaveOut : o.leaveOut.concat(DEFAULTS.leaveOut)),
      leaveOutSeed: DEFAULTS.leaveOutSeed,
      // ⚔️ what a proposed fix excludes from the old policy (10643, Mihai:
      // "conflict with old: offer to add the wave groups to the old
      // policies"; option A off the mockup): the waves (default), or the
      // groups the new policy is assigned to now
      fixWith: o.fixWith === "groups" ? "groups" : "waves",
      // 🧪 pilot groups off both sides when the waves take over (10645;
      // option A off the mockup) — the names, and the tick (on by default)
      pilotGroups: cleanList(Array.isArray(o.pilotGroups) ? o.pilotGroups : DEFAULTS.pilotGroups),
      pilotGroupsOff: o.pilotGroupsOff !== false,
      // 👥 Wave members (10634): the country → region table and the device
      // group naming, kept with the rest of this tenant's rules
      members: typeof MdeMembers !== "undefined" ? MdeMembers.normConfig(o.members) : null,
    };
    cfg.waveRegions = Array.isArray(o.waveRegions) ? cleanList(o.waveRegions)
      : Array.isArray(o.waves) ? regionsFromNames(o.waves, cfg)
      : DEFAULTS.waveRegions.slice();
    cfg.groups = groupsOf(cfg);
    cfg.waves = cfg.groups.map((g) => g.name);   // the names the rollout uses
    // every name the tool looks up: the names, and the earlier names a
    // group may still carry in the tenant
    cfg.lookup = uniq(cfg.groups.flatMap((g) => [g.name].concat(g.oldNames || [])));
    return cfg;
  }

  // ------------------------------------------------------- generations --
  // Names are compared NORMALISED: case folded, every dash kind and the
  // spaces around it collapsed to one "-", so "Win - OIB - ES" and
  // "WIN-OIB-ES" are the same prefix. A prefix must end on a boundary —
  // "WIN-SEC" does not claim "WIN-SECURITY-…".
  const normName = (s) => lc(s).replace(/[‐-―_]/g, "-").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
  const RETIRE_LEAD = /^\s*\(\s*to[-\s]?be[-\s]?removed\s*\)\s*/i;
  const stripRetire = (name) => String(name || "").replace(RETIRE_LEAD, "");
  function hasPrefix(name, prefix) {
    const n = normName(stripRetire(name)), p = normName(prefix);
    if (!p || !n.startsWith(p)) return false;
    const next = n.charAt(p.length);
    return !next || !/[a-z0-9]/.test(next);
  }
  // Order matters and is the answer to three edge cases: out of scope wins
  // over everything (an AVD policy marked for removal is still AVD's
  // business); the interim marker wins over the new prefixes (a new-named
  // policy somebody already marked for removal is on its way OUT); only
  // then does a new prefix make a policy new.
  // a name under ⚙️ "Leave out" (10639) — the same exact-name match as the
  // "Also in" list, and it wins over it
  const isLeftOut = (name, cfg) => ((cfg && cfg.leaveOut) || []).some((n) => normName(n) === normName(name));
  function generationOf(name, cfg) {
    const c = cfg || DEFAULTS;
    if (isLeftOut(name, c)) return "out";
    if ((c.outPrefixes || []).some((p) => hasPrefix(name, p))) return "out";
    if (EndpointPosture.isInterim({ name })) return "retiring";
    if ((c.newPrefixes || []).some((p) => hasPrefix(name, p))) return "new";
    return "old";
  }
  const GEN = {
    new: { label: "New", cls: "au-op create" },
    old: { label: "Old", cls: "au-op delete" },
    retiring: { label: "Old · TO-BE-REMOVED", cls: "gu-how priv" },
    out: { label: "Out of scope", cls: "au-op other" },
  };
  const isOld = (p) => p.generation === "old" || p.generation === "retiring";
  // Who a policy is FOR, read from its name: " - D - " is a device policy,
  // " - U - " a user policy (any case, any dash). The normalised name folds
  // both to "-d-" / "-u-"; a one-letter segment is required, so "WIN-DCP"
  // is not a D. Both, or neither, is null — not guessed.
  function audienceOf(name) {
    const n = normName(stripRetire(name));
    const d = /(^|-)d(-|$)/.test(n), u = /(^|-)u(-|$)/.test(n);
    return d && !u ? "device" : u && !d ? "user" : null;
  }
  const AUD = { device: { icon: "🖥", label: "device", tag: "- D -" }, user: { icon: "👤", label: "user", tag: "- U -" } };

  // -------------------------------------------------------- categories --
  // T20's rail nodes are the vocabulary, so a category here reads the same
  // as a discipline in 🧭 Endpoint security posture.
  const CAT_IDS = ["av", "asr", "edr", "fw", "disk", "acct", "appctl", "epm", "edge", "mde", "hard", "upd", "other"];
  function catMeta(id) {
    const n = (typeof EndpointPosture !== "undefined" && EndpointPosture.nodeById(id)) || null;
    if (n) return { id, icon: n.icon, label: n.label };
    if (id === "other") return { id, icon: "🧩", label: "Other" };
    if (id === "hard") return { id, icon: "🔒", label: "Device security" };
    if (id === "upd") return { id, icon: "📡", label: "Updates & telemetry" };
    return { id, icon: "•", label: id };
  }
  const NODE_CAT = { otherdisc: "other" };
  // One setting id -> category. Ordered: the ASR family before the generic
  // Defender one, because ASR rules live under policy_config_defender_.
  function catOfKey(key) {
    const k = lc(key);
    if (/^asr\||attacksurfacereduction|controlledfolder|exploitguard|exploitprotection/.test(k)) return "asr";
    if (/windowsadvancedthreatprotection/.test(k)) return "edr";
    if (/firewall/.test(k)) return "fw";
    if (/bitlocker|fullvolumeencryption|diskencryption/.test(k)) return "disk";
    if (/microsoft_edge|smartscreen|webthreatdefense/.test(k)) return "edge";
    if (/passportforwork|deviceguard|localsecurityauthority|credentialguard|lsaprotect/.test(k)) return "acct";
    if (/applicationcontrol|appcontrol/.test(k)) return "appctl";
    if (/endpointprivilegemanagement|privilegemanagement/.test(k)) return "epm";
    if (/_defender_|defender_configuration|windowsdefendersecuritycenter|microsoftdefender/.test(k)) return "av";
    // Device security (10634): audit, local security options, hardening —
    // the OIB "Device Security" policies Mihai added to the target list.
    if (/_audit_|auditoptions|localpoliciessecurityoptions|userrights|mssecurityguide|msslegacy|_eventlogservice_|lanmanserver|lanmanworkstation|_remoteprocedurecall_|_security_|windowslogon|_credentialsui_|_credentialsdelegation_/.test(k)) return "hard";
    if (/deliveryoptimization|_update_|windowsupdate|allowtelemetry|configuretelemetry|diagnosticdata|limitdiagnosticlogcollection|limitdumpcollection/.test(k)) return "upd";
    return "other";
  }
  // Legacy typed properties (deviceConfigurations) -> category. Null = not
  // an MDE-area property, which is how a Device restrictions profile with
  // no Defender section stays out of scope.
  function catOfLegacyProp(name) {
    const n = String(name || "");
    if (/^defender(AttackSurface|GuardedFolders|GuardMyFolders|ExploitProtection|AdobeReader|Office|Script|Email|Untrusted|ProcessCreation|AdvancedRansom|Credential|BlockPersistence)/.test(n)) return "asr";
    if (/^(defender|windowsDefender)/.test(n)) return "av";
    if (/^firewall/.test(n)) return "fw";
    if (/^bitLocker/.test(n)) return "disk";
    if (/^smartScreen/.test(n)) return "edge";
    if (/^(deviceGuard|lanManager|localSecurityOptions|windowsHello)/.test(n)) return "acct";
    if (/^(advancedThreatProtection|allowSampleSharing|enableExpeditedTelemetry)/.test(n)) return "edr";
    return null;
  }
  function catOfAdmx(text) {
    const t = String(text || "");
    if (/Exploit Guard|Attack Surface|Controlled Folder/i.test(t)) return "asr";
    if (/Firewall/i.test(t)) return "fw";
    if (/BitLocker/i.test(t)) return "disk";
    if (/SmartScreen|Microsoft Edge/i.test(t)) return "edge";
    if (/Defender|Antivirus/i.test(t)) return "av";
    return null;
  }
  // "Configured" for a legacy typed property: Graph returns every property
  // of the type, most of them at their not-configured value.
  function isConfigured(v) {
    if (v === null || v === undefined || v === false || v === "") return false;
    if (typeof v === "string") return !/^(notconfigured|userdefined|devicedefault|none)$/i.test(v);
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).some((k) => !/^@odata/.test(k) && isConfigured(v[k]));
    return true;
  }

  // ---------------------------------------------------------- settings --
  // Keys and comparable values. A catalog setting is keyed on its
  // settingDefinitionId; an ASR rule on `asr|<slug>` through T16's
  // asrRulesOf, which reads both the per-rule children and the legacy
  // "guid=mode|…" string — so the two shapes of the same rule meet.
  const ASR_PREFIX = "device_vendor_msft_policy_config_defender_attacksurfacereductionrules";
  function normValue(r) {
    if (Array.isArray(r.raw)) return r.raw.map((x) => lc(String(x == null ? "" : x)).trim()).filter(Boolean).sort().join("; ");
    if (r.raw === null || r.raw === undefined) return lc(r.value).trim();
    const s = lc(String(r.raw)).trim();
    const pre = lc(r.defId) + "_";
    return s.startsWith(pre) ? s.slice(pre.length) : s;
  }
  // rows: EndpointSec.flattenSettings output. Returns Map key ->
  // { key, defId, name, value, display, cat }. `value` is what is compared;
  // `display` is what is shown (redacted through the documenter's one rule).
  function settingsOf(rows) {
    const out = new Map();
    const put = (key, defId, name, value, display) => {
      const k = lc(key);
      const e = out.get(k);
      if (e) {
        if (!e.vals.includes(value)) e.vals.push(value);
        if (!e.disp.includes(display)) e.disp.push(display);
      } else out.set(k, { key: k, defId: defId || "", name: name || k, vals: [value], disp: [display], cat: catOfKey(k) });
    };
    const list = rows || [];
    const asrRows = list.filter((r) => lc(r.defId).startsWith(ASR_PREFIX));
    if (asrRows.length && typeof EndpointSec !== "undefined") {
      const a = EndpointSec.asrRulesOf(asrRows);
      for (const rule of a.rules) {
        if (rule.mode) put(`asr|${rule.slug}`, `${ASR_PREFIX}_${rule.slug}`, `ASR · ${rule.name}`, lc(rule.mode), String(rule.mode));
        if (rule.exclusions && rule.exclusions.length) {
          const v = rule.exclusions.map((x) => lc(x).trim()).sort().join("; ");
          put(`asr|${rule.slug}|exclusions`, "", `ASR · ${rule.name} — per-rule exclusions`, v, rule.exclusions.join("; "));
        }
      }
      if (a.exclusions && a.exclusions.length) {
        put("asr|exclusions", "", "ASR · exclusions (all rules)", a.exclusions.map((x) => lc(x).trim()).sort().join("; "), a.exclusions.join("; "));
      }
    }
    for (const r of list) {
      if (!r || !r.defId || lc(r.defId).startsWith(ASR_PREFIX)) continue;
      const v = normValue(r);
      const shown = (typeof Docs !== "undefined" && Docs.redactValue) ? Docs.redactValue(String(r.defId), String(r.value)) : String(r.value);
      put(r.defId, r.defId, r.name, v, shown);
    }
    for (const e of out.values()) {
      e.value = e.vals.slice().sort().join(" · ");
      e.display = e.disp.join(" · ");
      e.redacted = typeof Docs !== "undefined" && Docs.REDACTED ? e.display.includes(Docs.REDACTED) : false;
      delete e.vals; delete e.disp;
    }
    return out;
  }
  // A custom OMA-URI names the same CSP node a catalog setting does, so it
  // is keyed the same way and compared 1:1:
  //   ./Device/Vendor/MSFT/Policy/Config/Defender/AllowRealtimeMonitoring
  //   -> device_vendor_msft_policy_config_defender_allowrealtimemonitoring
  function omaKey(uri) {
    let k = lc(String(uri || "").trim()).replace(/^\.?\/+/, "").replace(/\//g, "_");
    if (k.startsWith("vendor_msft_policy_")) k = "device_" + k;
    return k;
  }
  function omaSettings(omaList) {
    const out = new Map();
    for (const o of omaList || []) {
      if (!o || !o.omaUri) continue;
      const key = omaKey(o.omaUri);
      const secret = o.isEncrypted || /secret|password/i.test(String(o["@odata.type"] || ""));
      const value = secret ? "(encrypted)" : lc(String(o.value == null ? "" : o.value)).trim();
      out.set(key, { key, defId: key, name: o.displayName || o.omaUri, value, display: secret ? "(encrypted — not compared)" : String(o.value == null ? "" : o.value), cat: catOfKey(key), redacted: !!secret });
    }
    return out;
  }

  // ------------------------------------------------------------- scope --
  const SECTION_IDS = ["settingsCatalog", "intents", "deviceConfigurations", "admx"];
  // the surface T11's engine writes each section through
  function surfaceFor(sectionId) {
    const sf = (typeof AssignEdit !== "undefined") ? AssignEdit.SURFACES.find((s) => s.section === sectionId && !s.collection) : null;
    return sf || null;
  }
  const MDE_CATS = new Set(["av", "asr", "edr", "fw", "disk", "acct", "appctl", "epm", "edge"]);

  function basePolicy(sec, item, raw, cfg) {
    const sf = surfaceFor(sec.id);
    return {
      key: `${sec.id}|${item.id}`, id: item.id, name: item.name, sectionId: sec.id,
      surface: sf ? sf.id : null, surfaceLabel: sf ? sf.label : sec.label,
      generation: generationOf(item.name, cfg),
      audience: audienceOf(item.name),
      item, raw: raw || {}, sec,
      technologies: lc((raw && raw.technologies) || ""),
      mdeManaged: /microsoftsense/i.test(String((raw && raw.technologies) || "")),
      detailError: item.detailError || null,
      outWhy: isLeftOut(item.name, cfg) ? "left out by name (⚙️)" : "",
    };
  }
  function finish(p, cats, settings, format, kind) {
    p.cats = uniq(cats.filter(Boolean)).sort((a, b) => CAT_IDS.indexOf(a) - CAT_IDS.indexOf(b));
    p.settings = settings || new Map();
    p.settingCount = p.settings.size;
    p.format = format;           // "catalog" = comparable setting by setting; "legacy" = by category only
    p.kind = kind;
    p.reach = Conflict.reachOf(p.item);
    p.state = OverviewTool.verdictOf(p.item);     // assigned | unassigned | excludedOnly
    return p;
  }

  // how: "named" (in cfg.alsoInScope) or "shares" (an old policy setting a
  // setting a new policy sets) pulls in a policy the MDE test would leave out;
  // "leftout" (cfg.leaveOut, 10639) lists it under 🚫 whatever it holds, so a
  // name left out is seen to be left out.
  function fromCatalog(sec, item, raw, cfg, how) {
    const nodes = EndpointPosture.classify(item).map((n) => NODE_CAT[n] || n);
    const rows = EndpointSec.flattenSettings((raw && raw.__detail) || []);
    const settings = settingsOf(rows);
    const settingCats = [...settings.values()].map((s) => s.cat);
    // In scope when T20 would list it, or when it configures anything in an
    // MDE category — a settings-catalog BitLocker or WHfB policy collides
    // with the new set as surely as an antivirus one does.
    const mde = nodes.length || settingCats.some((c) => MDE_CATS.has(c));
    if (!mde && !how) return null;
    const fam = String(item.templateFamily || "");
    const kind = /^endpointSecurity/i.test(fam)
      ? `Endpoint security · ${EndpointSec.disciplineOf(fam)}`
      : fam === "baseline" ? "Security baseline" : "Settings catalog";
    const p = basePolicy(sec, item, raw, cfg);
    // T20's generic "MDE in settings catalog" node gives way to the specific
    // categories the settings name; it stays only when nothing more exact is known.
    const specific = uniq(nodes.filter((n) => n !== "mde").concat(settingCats.filter((c) => MDE_CATS.has(c))));
    if (!mde) {
      p.scopeWhy = how === "named" ? "in the target list by name (⚙️)" : how === "shares" ? "sets a setting a new policy sets" : "";
      return finish(p, uniq(settingCats).filter((c) => c !== "other").concat(settingCats.includes("other") ? ["other"] : []), settings, "catalog", kind);
    }
    return finish(p, specific.length ? specific : nodes, settings, "catalog", kind);
  }
  const isNamed = (name, cfg) => (cfg.alsoInScope || []).some((n) => normName(n) === normName(name));
  function fromIntent(sec, item, raw, cfg, templates) {
    const t = templates && raw && raw.templateId ? templates.get(lc(raw.templateId)) : null;
    const tName = (t && t.displayName) || "";
    const node = EndpointPosture.intentNode(tName);
    const cat = node ? (NODE_CAT[node] || node) : (/edge/i.test(tName) ? "edge" : "other");
    const p = basePolicy(sec, item, raw, cfg);
    p.template = tName || "(template not resolved)";
    // Intent settings are compared only by category: their definition ids
    // (deviceConfiguration--…_defenderX) name no settings-catalog setting.
    const n = ((raw && raw.__detail) || []).length;
    const res = finish(p, [cat], new Map(), "legacy", `Endpoint security (legacy)${tName ? ` · ${tName}` : ""}`);
    res.settingCount = n;
    return res;
  }
  function fromDeviceConfig(sec, item, raw, cfg) {
    const type = String(item.type || "");
    const r = raw || {};
    const cats = [];
    let kind = null, settings = null, format = "legacy", count = 0;
    if (type === "windows10CustomConfiguration") {
      settings = omaSettings(r.omaSettings);
      const mde = [...settings.values()].filter((s) => MDE_CATS.has(s.cat));
      if (!mde.length) return null;
      // only the MDE-area OMA settings take part; the rest of a custom
      // profile is somebody else's business
      settings = new Map(mde.map((s) => [s.key, s]));
      mde.forEach((s) => cats.push(s.cat));
      kind = "Custom OMA-URI"; format = "catalog";
    } else if (type === "windowsDefenderAdvancedThreatProtectionConfiguration") {
      cats.push("edr"); kind = "Legacy template · Defender for Endpoint";
      count = Object.keys(r).filter((k) => !/^(@odata|id$|displayName|description|createdDateTime|lastModifiedDateTime|version|assignments|roleScopeTagIds|supportsScopeTags|deviceManagementApplicability|__)/.test(k) && isConfigured(r[k])).length;
    } else if (type === "windows10EndpointProtectionConfiguration" || type === "windows10GeneralConfiguration") {
      for (const k of Object.keys(r)) {
        const c = catOfLegacyProp(k);
        if (c && isConfigured(r[k])) { cats.push(c); count++; }
      }
      if (!count) return null;
      kind = type === "windows10GeneralConfiguration" ? "Legacy template · Device restrictions (Defender section)" : "Legacy template · Endpoint protection";
    } else return null;
    const p = basePolicy(sec, item, raw, cfg);
    const res = finish(p, cats, settings, format, kind);
    if (format === "legacy") res.settingCount = count;
    return res;
  }
  function fromAdmx(sec, item, raw, cfg) {
    const cats = [];
    let n = 0;
    for (const dv of (raw && raw.__detail) || []) {
      const d = dv && dv.definition;
      if (!d) continue;
      const c = catOfAdmx(`${d.categoryPath || ""} ${d.displayName || ""}`);
      if (c) { cats.push(c); n++; }
    }
    if (!n) return null;
    const p = basePolicy(sec, item, raw, cfg);
    const res = finish(p, cats, new Map(), "legacy", "Administrative template");
    res.settingCount = n;
    return res;
  }

  // ------------------------------------------------------------- model --
  // res: a Docs.collect() result with keepRaw (the shared cache's).
  // templates: Map lc(templateId) -> { displayName } for the legacy intents.
  function build(res, cfgIn, templates) {
    const cfg = normConfig(cfgIn);
    const policies = [];
    const missing = [];
    const rest = [];   // settings-catalog policies the MDE test left out
    for (const secId of SECTION_IDS) {
      const sec = (res.sections || []).find((s) => s.id === secId);
      if (!sec) {
        const f = (res.failed || []).find((x) => x.id === secId);
        missing.push({ id: secId, error: f ? f.error : "not in this read" });
        continue;
      }
      // The raw copies are NOT in the mapped items' order (collect sorts the
      // mapped list by name), so they are joined by id — never by index.
      const rawById = new Map((sec.raw || []).map((r) => [lc(r.id), r]));
      for (const item of sec.items || []) {
        const raw = rawById.get(lc(item.id)) || {};
        let p = null;
        if (secId === "settingsCatalog") {
          p = fromCatalog(sec, item, raw, cfg, isLeftOut(item.name, cfg) ? "leftout" : isNamed(item.name, cfg) ? "named" : null);
          if (!p) rest.push({ sec, item, raw });
        }
        else if (secId === "intents") p = fromIntent(sec, item, raw, cfg, templates);
        else if (secId === "deviceConfigurations") p = fromDeviceConfig(sec, item, raw, cfg);
        else if (secId === "admx") p = fromAdmx(sec, item, raw, cfg);
        if (p) policies.push(p);
      }
    }
    // An OLD settings-catalog policy outside the MDE areas still collides
    // when it sets a setting a new policy sets (10634 — the Device Security
    // policies: audit, hardening, local security options). Pulled in, and
    // said why. New and out-of-scope names are not pulled this way.
    const newKeys = new Set();
    for (const P of policies) if (P.generation === "new") for (const k of P.settings.keys()) newKeys.add(k);
    if (newKeys.size) {
      for (const r of rest) {
        const g = generationOf(r.item.name, cfg);
        if (g !== "old" && g !== "retiring") continue;
        const rows = EndpointSec.flattenSettings((r.raw && r.raw.__detail) || []);
        if (![...settingsOf(rows).keys()].some((k) => newKeys.has(k))) continue;
        const p = fromCatalog(r.sec, r.item, r.raw, cfg, "shares");
        if (p) policies.push(p);
      }
    }
    policies.sort((a, b) => a.name.localeCompare(b.name));
    const byKey = new Map(policies.map((p) => [p.key, p]));
    return {
      cfg, policies, byKey, missing,
      newP: policies.filter((p) => p.generation === "new"),
      oldP: policies.filter(isOld),
      outP: policies.filter((p) => p.generation === "out"),
      readAt: res.readAt || 0,
    };
  }

  // ------------------------------------------------------------- reach --
  // T12's verdict, with the two answers a rollout needs that a scan does
  // not: "staged" (the new policy is not assigned yet — the collision is
  // waiting for it) and "resolved" (every group the new policy includes is
  // already excluded from the old one — the fix is in). T12's tenant-wide
  // branch does not look at exclusions, so a resolved All-devices old
  // policy would otherwise stay "can collide" forever.
  const VERDICT = {
    can: { label: "can collide", cls: "au-op delete", rank: 0, short: "shared targets" },
    may: { label: "may collide", cls: "gu-how priv", rank: 1, short: "different groups — may share members" },
    staged: { label: "staged", cls: "au-op update", rank: 2, short: "new policy not assigned yet — collides once it is" },
    resolved: { label: "resolved — excluded", cls: "au-op create", rank: 4, short: "the new policy's groups are excluded" },
    idle: { label: "old reaches nobody", cls: "au-op other", rank: 5, short: "nothing to fix" },
  };
  // twins (optional, build 10633): a wave counts as excluded when its
  // device/user twin is — the fix Intune allows for a policy of the other
  // kind. The verdict says so.
  function pairReach(N, O, twins) {
    const rN = N.reach, rO = O.reach;
    const twinOut = (g) => { const t = twins && twins.get(g); return !!(t && t.twinId && rO.exc.has(t.twinId)); };
    if (rO.none) return { verdict: "idle", why: "the old policy has no include and no tenant-wide target — it reaches nobody as assigned" };
    if (rN.none) return { verdict: "staged", why: "the new policy is not assigned yet — the collision waits for its first assignment wherever the old policy still reaches" };
    if (!rN.tenantWide && rN.inc.size && [...rN.inc].every((g) => rO.exc.has(g) || rN.exc.has(g))) {
      return { verdict: "resolved", why: "every group the new policy includes is excluded from the old one" };
    }
    if (!rN.tenantWide && rN.inc.size && [...rN.inc].every((g) => rO.exc.has(g) || rN.exc.has(g) || twinOut(g))) {
      return { verdict: "resolved", why: "every group the new policy includes is excluded from the old one — a wave through its device/user twin", byTwin: true };
    }
    const v = Conflict.verdictPair(rN, rO);
    return { verdict: v.verdict === "cannot" ? "idle" : v.verdict, why: v.reason };
  }

  // ------------------------------------------------------------ compare --
  const TYPE = {
    conflict: { label: "different value", cls: "au-op delete", rank: 0 },
    review: { label: "review — other format", cls: "au-op update", rank: 1 },
    duplicate: { label: "same value", cls: "au-op other", rank: 2 },
  };
  function compare(model, twins) {
    const pairs = [];
    for (const N of model.newP) {
      for (const O of model.oldP) {
        let type = null, diffs = [], sames = [], common = [];
        if (N.format === "catalog" && O.format === "catalog") {
          const [small, big] = N.settings.size <= O.settings.size ? [N.settings, O.settings] : [O.settings, N.settings];
          for (const k of small.keys()) {
            if (!big.has(k)) continue;
            const ns = N.settings.get(k), os = O.settings.get(k);
            const row = { key: k, name: ns.name || os.name, cat: ns.cat, newValue: ns.value, oldValue: os.value,
              newDisplay: ns.display, oldDisplay: os.display, redacted: !!(ns.redacted || os.redacted) };
            (ns.value === os.value ? sames : diffs).push(row);
          }
          if (!diffs.length && !sames.length) continue;
          type = diffs.length ? "conflict" : "duplicate";
        } else {
          common = N.cats.filter((c) => c !== "other" && O.cats.includes(c));
          if (!common.length) continue;
          type = "review";
        }
        const byName = (a, b) => String(a.name).localeCompare(String(b.name));
        diffs.sort(byName); sames.sort(byName);
        const cats = uniq((diffs.length ? diffs : sames).map((d) => d.cat).concat(common));
        pairs.push({ id: `${N.key}~${O.key}`, N, O, type, diffs, sames, common, cats, reach: pairReach(N, O, twins) });
      }
    }
    pairs.sort((a, b) => TYPE[a.type].rank - TYPE[b.type].rank
      || VERDICT[a.reach.verdict].rank - VERDICT[b.reach.verdict].rank
      || a.O.name.localeCompare(b.O.name) || a.N.name.localeCompare(b.N.name));
    return pairs;
  }
  // Does this pair want action? A different value that can (or will) meet
  // on a device, or a cross-format overlap that could. Same-value pairs are
  // double management, not a conflict; resolved and idle need nothing.
  const needsAction = (pr) => (pr.type === "conflict" || pr.type === "review")
    && (pr.reach.verdict === "can" || pr.reach.verdict === "may" || pr.reach.verdict === "staged");

  // --------------------------------------------------------- group kinds --
  // kinds: Map lc(groupId) -> { kind: user|device|mixed|empty|unknown, source, users, devices, name }
  // a one-letter U / D segment counts too (INT-SG-U-WAVE-…, INT-SG-D-…, 10635)
  const NAME_USER = /(^|[-_ .])(UG|USR|USERS?|U)([-_ .]|$)/i;
  const NAME_DEVICE = /(^|[-_ .])(DG|DEV|DEVICES?|D)([-_ .]|$)/i;
  function kindFromName(name) {
    if (NAME_USER.test(name || "")) return "user";
    if (NAME_DEVICE.test(name || "")) return "device";
    return "unknown";
  }
  function kindOfGroup(g, users, devices) {
    const rule = lc((g && g.membershipRule) || "");
    if (rule) {
      const u = /\buser\./.test(rule), d = /\bdevice\./.test(rule);
      return { kind: u && d ? "mixed" : d ? "device" : u ? "user" : "unknown", source: "dynamic rule" };
    }
    if (users == null && devices == null) return { kind: kindFromName(g && g.displayName), source: "name (counts unreadable)" };
    if (users && devices) return { kind: "mixed", source: "members" };
    if (users) return { kind: "user", source: "members" };
    if (devices) return { kind: "device", source: "members" };
    const byName = kindFromName(g && g.displayName);
    return { kind: byName === "unknown" ? "empty" : byName, source: byName === "unknown" ? "members" : "name (group is empty)" };
  }
  // What a policy is TARGETED at: the kinds of its include groups, plus the
  // tenant-wide targets (All devices is a device assignment, All users a
  // user one). Unknown kinds are carried so the check can say it guessed.
  function targetKinds(P, kinds) {
    const out = new Set();
    for (const a of P.item.assignments || []) {
      if (a.kind === "All devices") out.add("device");
      else if (a.kind === "All users") out.add("user");
      else if (a.kind === "Included" && a.groupId) {
        const k = kinds.get(lc(a.groupId));
        out.add(k ? k.kind : "unknown");
      }
    }
    return out;
  }
  // The kinds the support check uses. When nothing about the targets could
  // be read (every include group of unknown kind), the policy's own name
  // decides — "- D -" is a device policy — and says it did.
  function effectiveTargets(P, kinds) {
    const tk = targetKinds(P, kinds);
    const vals = [...tk];
    if (P.audience && (!vals.length || vals.every((k) => k === "unknown" || k === "empty"))) {
      return { kinds: new Set([P.audience]), byName: true };
    }
    return { kinds: tk, byName: false };
  }
  // The support matrix, as one function: may a group of kind `gk` be
  // excluded from a policy targeted at `tk`?
  function exclusionSupport(gk, tk) {
    const t = [...tk].filter((k) => k !== "empty");
    if (gk === "mixed") return { ok: false, why: "the group holds both users and devices — Intune evaluates an exclusion against one kind, so part of it is ignored" };
    if (gk === "unknown" || gk === "empty") return { ok: null, why: gk === "empty" ? "the group is empty and its name does not say whether it will hold users or devices" : "the group's kind could not be read" };
    if (!t.length) return { ok: null, why: "the old policy's include groups are empty or unreadable, so its target kind is unknown" };
    if (t.includes("mixed") || t.includes("unknown")) return { ok: null, why: "the old policy's targets are of mixed or unknown kind" };
    const mismatch = t.filter((k) => k !== gk);
    if (!mismatch.length) return { ok: true, why: "" };
    return { ok: false, why: `Intune does not support excluding a ${gk} group from a policy assigned to ${mismatch[0]} groups — it does not evaluate user-to-device relationships, so those ${gk === "user" ? "users' devices" : "devices' users"} are NOT excluded (Microsoft Learn: Assign policies, support matrix)` };
  }

  // ---------------------------------------------------------- proposals --
  // The rollout's fix for one pair: take the NEW policy's include groups
  // off the OLD one. An exclusion where the old policy already INCLUDES the
  // group would be T11's refused contradiction, so that group's include is
  // REMOVED instead — said, not silently swapped. A new policy that is not
  // assigned yet borrows the wave groups that exist, marked "planned".
  // ctx: { kinds: Map, waveIds: [lc id], names: Map lc id -> name }
  // ctx: { kinds: Map, waves: [{ id, audience }] (or waveIds: [lc id]),
  //        twins: Map lc id -> { name, audience, twinName, twinId|null },
  //        names: Map lc id -> name }
  // A wave excluded from an old policy of the OTHER kind is Intune's
  // unsupported mix; its twin (the same region's group of the right kind)
  // is proposed instead, and a missing twin is named so it can be created.
  function wavesProposal(pr, c, kinds, twins, nameOf) {
    const N = pr.N, O = pr.O;
    const pool = (c.waves || []).filter((w) => w && w.id && (!c.regions || c.regions.has(w.region)) && (!N.audience || !w.audience || w.audience === N.audience));
    const others = [...N.reach.inc].filter((g) => !pool.some((w) => w.id === g) && !O.reach.exc.has(g));
    const rest = others.map((g) => nameOf(g));
    if (!pool.length) return { steps: [], includes: [], rest, byWaves: true, none: `no ${N.audience ? `${N.audience} ` : ""}wave group exists${c.regions ? " in the ticked regions" : ""} — create the waves in 🌊, or switch to "the new policy's groups"` };
    // the waves the new policy does not include yet — included in the same
    // plan (a tenant-wide new policy reaches them already)
    const includes = N.reach.tenantWide ? [] : pool.filter((w) => !N.reach.inc.has(w.id)).map((w) => ({ groupId: w.id, groupName: nameOf(w.id), action: "add-include", region: w.region, audience: w.audience }));
    const twinOut = (id) => { const t = twins.get(id); return !!(t && t.twinId && O.reach.exc.has(t.twinId)); };
    const outs = pool.filter((w) => !O.reach.exc.has(w.id) && !twinOut(w.id)).map((w) => w.id);
    const steps = [];
    const tk = effectiveTargets(O, kinds);
    for (const g0 of outs) {
      const st = stepFor(g0, O, kinds, twins, nameOf, tk, false);
      if (!st || steps.some((s) => s.groupId === st.groupId)) continue;
      st.region = (pool.find((w) => w.id === g0) || {}).region || "";
      st.needsInclude = includes.some((x) => x.groupId === g0);
      if (st.needsInclude) st.notes.push("the new policy does not include this wave yet — it is included in the same plan");
      steps.push(st);
    }
    // 🧪 the pilots, as this fix alone would take them off (10645)
    const pw = [].concat(includes.map((x) => ({ P: N, groupId: x.groupId, action: "add-include" })),
      steps.filter((st) => st.supported !== false).map((st) => ({ P: O, groupId: st.groupId, action: st.action })));
    const pilots = c.cfg ? pilotsFor(pw.concat([{ P: N, groupId: "", action: "none" }, { P: O, groupId: "", action: "none" }]), c, false) : { steps: [], kept: [] };
    const none = steps.length || includes.length || pilots.steps.length ? "" : `the waves are in place — in the new policy and out of the old one${rest.length ? `; the new policy's own groups (${rest.join(", ")}) still meet the old one` : ""}`;
    return { steps, includes, rest, pilots, byWaves: true, none };
  }
  // One exclusion step on the old policy: the support matrix, the twin swap
  // and the include-to-remove rule, as proposalFor has always applied them.
  function stepFor(g0, O, kinds, twins, nameOf, et, planned) {
    const tk = et.kinds;
    const kindOf = (g) => { const k = kinds.get(lc(g)); if (k) return { kind: k.kind, source: k.source }; const t = twins.get(lc(g)); return t ? { kind: t.audience, source: "name (wave pair)" } : { kind: "unknown", source: "not read" }; };
    let g = g0;
    let k = kindOf(g);
    const incOnOld = O.reach.inc.has(g);
    let sup = incOnOld ? { ok: true, why: "" } : exclusionSupport(k.kind, tk);
    const notes = [];
    let twinOf = null, twinOfId = null, missingTwin = null;
    if (!incOnOld && sup.ok === false && twins.has(lc(g))) {
      const t = twins.get(lc(g));
      const want = [...tk].find((x) => x === "user" || x === "device");
      if (want && t.twinName && want !== k.kind) {
        if (t.twinId) {
          if (O.reach.exc.has(lc(t.twinId))) return null;
          twinOf = nameOf(g); twinOfId = lc(g);
          g = lc(t.twinId);
          k = kindOf(g);
          sup = O.reach.inc.has(g) ? { ok: true, why: "" } : exclusionSupport(k.kind, tk);
          notes.push(`twin: ${twinOf} is a ${t.audience} group and this old policy targets ${want} groups — Intune cannot mix the two, so the same wave's ${want} group is excluded instead`);
        } else {
          missingTwin = t.twinName;
          sup = { ok: false, why: `${sup.why}. Its ${want} twin ${t.twinName} does not exist yet — create it in 🌊 Wave groups and it is proposed here instead` };
        }
      }
    }
    const act = O.reach.inc.has(g) ? "remove" : "add-exclude";
    if (act === "remove") notes.push("the old policy INCLUDES this group — excluding it on top of the include would be a contradiction, so the include is removed instead");
    if (et.byName && act !== "remove") notes.push(`target kind from the old policy's name (${AUD[[...tk][0]] ? AUD[[...tk][0]].tag : ""}) — its include groups could not be read`);
    if (O.mdeManaged && k.kind === "user") notes.push("the old policy is also delivered by MDE security settings management, which honours DEVICE groups only — a user-group change does not reach MDE-only devices");
    if (planned) notes.push("planned: the new policy is not assigned yet — this is the wave group it is expected to get");
    return { groupId: lc(g), groupName: nameOf(g), action: act, kind: k.kind, kindSource: k.source, supported: sup.ok, why: sup.why, notes, planned, twinOf, twinOfId, missingTwin };
  }
  // 🧪 PILOTS OFF (10645, Mihai: "when adding the wave groups to new
  // policies remove the pilot groups"; option A off the mockup — both
  // sides). A pilot group comes off only once the waves have taken over its
  // job, and never so that a pilot member lands on NEITHER policy or on BOTH:
  //  * off a NEW policy's includes — when, after the plan, the new policy
  //    holds every wave of its kind (all regions, not only the ticked
  //    ones), and every old policy it collides with that excludes the pilot
  //    loses that exclusion in the same plan (else its members outside a
  //    wave would get neither);
  //  * off an OLD policy's exclusions — when, after the plan, every wave of
  //    each colliding new policy's kind is out of it, and every colliding new
  //    policy that includes the pilot loses it in the same plan (else its
  //    members outside a wave would get both).
  // A pilot member in a wave keeps the new policy through the wave; one
  // whose wave has not got them yet is back on the old policy until it does.
  // planned: { inc: Map P.key -> Set(id), exc: Map P.key -> Set(id) } — the
  // plan's own includes, and its excludes / include removals, per policy.
  // scope: { news: Set(N), olds: Set(O) } — the policies the plan touches.
  // ctx: { cfg, kinds, twins, names, waves (wavePool, every region) }.
  function pilotRemovals(ctx, pairs, planned, scope) {
    const c = ctx || {}, cfg = c.cfg || {};
    const out = { steps: [], kept: [] };
    if (cfg.pilotGroupsOff === false || !(cfg.pilotGroups || []).length) return out;
    const kinds = c.kinds || new Map(), twins = c.twins || new Map();
    const nameOf = (id) => (c.names && c.names.get(lc(id))) || id;
    const pilotNames = cfg.pilotGroups.map(normName);
    const isPilot = (id) => pilotNames.includes(normName(nameOf(id)));
    const pl = planned || {};
    const plIn = (P) => (pl.inc && pl.inc.get(P.key)) || new Set();
    const plOut = (P) => (pl.exc && pl.exc.get(P.key)) || new Set();
    const waves = (k) => (c.waves || []).filter((w) => w && w.id && w.audience === k).map((w) => lc(w.id));
    const kindOfN = (N) => policyKind(N, kinds).kind;
    const missingIn = (N) => { if (N.reach.tenantWide) return []; const k = kindOfN(N); if (!k) return null; const w = waves(k); return w.length ? w.filter((id) => !N.reach.inc.has(id) && !plIn(N).has(id)) : null; };
    const isOut = (O, id) => {
      if (O.reach.exc.has(id) || plOut(O).has(id)) return true;
      const t = twins.get(id), tid = t && t.twinId ? lc(t.twinId) : null;
      return !!(tid && (O.reach.exc.has(tid) || plOut(O).has(tid)));
    };
    const missingOut = (O, N) => { const k = kindOfN(N); if (!k) return null; const w = waves(k); return w.length ? w.filter((id) => !isOut(O, id)) : null; };
    const pairsOfN = (N) => pairs.filter((p) => p.N === N), pairsOfO = (O) => pairs.filter((p) => p.O === O);
    const rm = new Map(), keyOf = (P, id) => `${P.key}|${id}`;
    const keep = (P, id, side, why) => out.kept.push({ P, groupId: id, groupName: nameOf(id), side, why });
    const names = (ids) => ids.map(nameOf).join(", ");
    for (const N of (scope && scope.news) || []) {
      const pil = [...N.reach.inc].filter(isPilot);
      if (!pil.length) continue;
      const miss = missingIn(N);
      if (miss === null || miss.length) {
        pil.forEach((id) => keep(N, id, "new", `${nameOf(id)} stays on ${N.name}: ${miss === null ? "its kind (- D - / - U -) or its waves are not known" : `${names(miss)} ${miss.length === 1 ? "is" : "are"} not in it after this plan`} — the pilots come off once every wave is in`));
        continue;
      }
      pil.forEach((id) => rm.set(keyOf(N, id), { P: N, groupId: id, groupName: nameOf(id), side: "new" }));
    }
    for (const O of (scope && scope.olds) || []) {
      const pil = [...O.reach.exc].filter(isPilot);
      if (!pil.length) continue;
      let lag = null;
      for (const p of pairsOfO(O)) { const m = missingOut(O, p.N); if (m === null || m.length) { lag = { N: p.N, m }; break; } }
      if (lag) {
        pil.forEach((id) => keep(O, id, "old", `${nameOf(id)} stays excluded on ${O.name}: ${lag.m === null ? `the waves of ${lag.N.name} are not known` : `${names(lag.m)} ${lag.m.length === 1 ? "is" : "are"} not out of it after this plan`} — a pilot member in that wave would get it back`));
        continue;
      }
      pil.forEach((id) => rm.set(keyOf(O, id), { P: O, groupId: id, groupName: nameOf(id), side: "old" }));
    }
    // each side needs the other: drop until stable
    for (let changed = true; changed;) {
      changed = false;
      for (const [k, st] of rm) {
        let why = "";
        if (st.side === "new") {
          const o = pairsOfN(st.P).find((p) => p.O.reach.exc.has(st.groupId) && !rm.has(keyOf(p.O, st.groupId)));
          if (o) why = `${st.groupName} stays on ${st.P.name}: ${o.O.name} still excludes it — its members outside a wave would get neither policy`;
        } else {
          const n = pairsOfO(st.P).find((p) => p.N.reach.inc.has(st.groupId) && !rm.has(keyOf(p.N, st.groupId)));
          if (n) why = `${st.groupName} stays excluded on ${st.P.name}: ${n.N.name} still includes it — its members outside a wave would get both`;
        }
        if (why) { rm.delete(k); out.kept.push(Object.assign({}, st, { why })); changed = true; }
      }
    }
    out.steps = [...rm.values()].map((st) => Object.assign(st, { action: "remove",
      note: st.side === "new" ? "pilot: the waves take over" : "pilot: the waves take over — a member outside a wave is back on this policy until their wave has them" }));
    return out;
  }
  // The pilots for a plan's WANTS ({ P, groupId, action }): what the plan
  // includes and takes out per policy, and the policies in scope — the ones
  // it touches, and with `wide` (the ⚡ bulk plans) the policies they
  // collide with too, so an old policy's pilot exclusion can go with the
  // new policy's waves. ctx: { cfg, kinds, twins, names, found, pairs }.
  function pilotsFor(wants, ctx, wide) {
    const c = ctx || {};
    const pairs = c.pairs || [];
    const inc = new Map(), exc = new Map(), touched = new Set();
    const put = (m, P, id) => { if (!m.has(P.key)) m.set(P.key, new Set()); m.get(P.key).add(lc(id)); };
    for (const x of wants || []) {
      touched.add(x.P);
      if (x.action === "add-include") put(inc, x.P, x.groupId);
      else if (x.action === "add-exclude" || x.action === "remove") put(exc, x.P, x.groupId);
    }
    const news = new Set(), olds = new Set();
    for (const P of touched) (P.generation === "new" ? news : olds).add(P);
    if (wide) for (const pr of pairs) { if (touched.has(pr.N)) olds.add(pr.O); if (touched.has(pr.O)) news.add(pr.N); }
    const writable = (set) => new Set([...set].filter((P) => P.surface));
    return pilotRemovals({ cfg: c.cfg, kinds: c.kinds, twins: c.twins, names: c.names, waves: c.waves || wavePool(c.cfg || DEFAULTS, c.found) },
      pairs, { inc, exc }, { news: writable(news), olds: writable(olds) });
  }
  function proposalFor(pr, ctx) {
    const c = ctx || {};
    const kinds = c.kinds || new Map();
    const twins = c.twins || new Map();
    const nameOf = (id) => (c.names && c.names.get(lc(id))) || (twins.get(lc(id)) && twins.get(lc(id)).name) || id;
    if (!needsAction(pr)) return { steps: [], none: pr.type === "duplicate" ? "same value on both sides — no device conflict; nothing to exclude" : "no collision to fix" };
    const N = pr.N, O = pr.O;
    // 🌊 WAVES MODE (10643, option A): the fix takes the waves of the new
    // policy's kind (in the ticked regions) out of the old policy — and,
    // where the new policy does not include a wave yet, includes it there
    // in the same plan, so a wave never leaves the old policy ahead of the
    // new one (Mihai: "yes, same plan"). The new policy's own other groups
    // are left alone and named.
    if (c.fixWith === "waves") return wavesProposal(pr, c, kinds, twins, nameOf);
    if (N.reach.tenantWide) {
      return { steps: [], none: `the new policy targets ${N.reach.inc.size ? "a group and " : ""}the whole tenant (All devices / All users) — there is no group to exclude. Narrow the new policy to waves, or take the old policy's assignment away.` };
    }
    let groups = [...N.reach.inc].filter((g) => !O.reach.exc.has(g));
    let planned = false;
    if (!groups.length && pr.reach.verdict === "staged") {
      const pool = c.waves ? c.waves.filter((w) => w && w.id && (!N.audience || !w.audience || w.audience === N.audience)).map((w) => w.id)
        : (c.waveIds || []);
      groups = uniq(pool.map(lc)).filter((g) => !O.reach.exc.has(g));
      planned = true;
      if (!groups.length) return { steps: [], none: `the new policy is not assigned and no ${N.audience ? `${N.audience} ` : ""}wave group exists yet — create the wave groups (🌊) or assign the new policy first` };
    }
    if (!groups.length) return { steps: [], none: "every include group of the new policy is already excluded from the old one" };
    const et = effectiveTargets(O, kinds);
    const tk = et.kinds;
    const kindOf = (g) => { const k = kinds.get(lc(g)); if (k) return { kind: k.kind, source: k.source }; const t = twins.get(lc(g)); return t ? { kind: t.audience, source: "name (wave pair)" } : { kind: "unknown", source: "not read" }; };
    const steps = [];
    let twinSkipped = 0;
    for (const g0 of groups) {
      let g = g0;
      let k = kindOf(g);
      const incOnOld = O.reach.inc.has(g);
      let sup = incOnOld ? { ok: true, why: "" } : exclusionSupport(k.kind, tk);
      const notes = [];
      let twinOf = null, twinOfId = null, missingTwin = null;
      if (!incOnOld && sup.ok === false && twins.has(lc(g))) {
        const t = twins.get(lc(g));
        const want = [...tk].find((x) => x === "user" || x === "device");
        if (want && t.twinName && want !== k.kind) {
          if (t.twinId) {
            if (O.reach.exc.has(lc(t.twinId))) { twinSkipped++; continue; }
            twinOf = nameOf(g); twinOfId = lc(g);
            g = lc(t.twinId);
            k = kindOf(g);
            sup = O.reach.inc.has(g) ? { ok: true, why: "" } : exclusionSupport(k.kind, tk);
            notes.push(`twin: ${twinOf} is a ${t.audience} group and this old policy targets ${want} groups — Intune cannot mix the two, so the same wave's ${want} group is excluded instead`);
          } else {
            missingTwin = t.twinName;
            sup = { ok: false, why: `${sup.why}. Its ${want} twin ${t.twinName} does not exist yet — create it in 🌊 Wave groups and it is proposed here instead` };
          }
        }
      }
      const act = O.reach.inc.has(g) ? "remove" : "add-exclude";
      if (act === "remove") notes.push("the old policy INCLUDES this group — excluding it on top of the include would be a contradiction, so the include is removed instead");
      if (et.byName && act !== "remove") notes.push(`target kind from the old policy's name (${AUD[[...tk][0]] ? AUD[[...tk][0]].tag : ""}) — its include groups could not be read`);
      if (O.mdeManaged && k.kind === "user") notes.push("the old policy is also delivered by MDE security settings management, which honours DEVICE groups only — a user-group change does not reach MDE-only devices");
      if (planned) notes.push("planned: the new policy is not assigned yet — this is the wave group it is expected to get");
      if (steps.some((s) => s.groupId === lc(g))) continue;
      steps.push({ groupId: lc(g), groupName: nameOf(g), action: act, kind: k.kind, kindSource: k.source, supported: sup.ok, why: sup.why, notes, planned, twinOf, twinOfId, missingTwin });
    }
    if (!steps.length) return { steps: [], none: twinSkipped ? "the wave's twin of the old policy's kind is already excluded from it" : "every include group of the new policy is already excluded from the old one" };
    return { steps, none: "" };
  }
  // lc(group id) -> the wave pair it belongs to, for proposalFor.
  function twinIndex(cfg, found) {
    const out = new Map();
    if (!found) return out;
    const byName = new Map(cfg.groups.map((g) => [lc(g.name), g]));
    for (const g of cfg.groups) {
      const hit = found.get(lc(g.name));
      if (!hit || !hit.id || g.role !== "wave") continue;
      const tw = byName.get(lc(g.twin));
      const twHit = tw ? found.get(lc(tw.name)) : null;
      out.set(lc(hit.id), { name: g.name, audience: g.audience, region: g.region, twinName: g.twin, twinId: twHit && twHit.id ? lc(twHit.id) : null });
    }
    return out;
  }
  // Existing wave groups with their audience — the staged proposal's pool.
  function wavePool(cfg, found) {
    if (!found) return [];
    return cfg.groups.filter((g) => g.role === "wave").map((g) => { const hit = found.get(lc(g.name)); return hit && hit.id ? { id: lc(hit.id), audience: g.audience, name: g.name, region: g.region } : null; }).filter(Boolean);
  }

  // ---------------------------------------------- rollout actions --
  // Three bulk plans (build 10633, Mihai: "add the waves to the right
  // policies as an include, add the exclusion group to all the new
  // policies, auto exclude the waves from the old policies"). Each returns
  // WANTS — { P, groupId, groupName, action, note } — that the screen reads
  // fresh and composes through T11's planFor, so every refusal still holds;
  // and SKIPPED, each with its reason. Nothing here writes.
  //
  // A policy's kind: its name's "- D -" / "- U -" first; else what its
  // include groups are, when they are all one kind; else unknown (null).
  function policyKind(P, kinds) {
    if (P.audience) return { kind: P.audience, source: "name" };
    const t = [...targetKinds(P, kinds || new Map())].filter((k) => k !== "empty");
    if (t.length === 1 && (t[0] === "user" || t[0] === "device")) return { kind: t[0], source: "targets" };
    return { kind: null, source: t.length ? "mixed or unknown targets" : "not assigned" };
  }
  const ROLLOUT = {
    includeWaves: { label: "Include the waves in the new policies", verb: "include" },
    excludeExclusion: { label: "Exclude the exclusion groups from the new policies", verb: "exclude" },
    excludeWaves: { label: "Exclude the waves from the colliding old policies", verb: "exclude" },
  };
  // ctx: { kinds, found, twins, names, pairs, regions: Set|null (null = all) }
  function rolloutWants(which, model, ctx) {
    const c = ctx || {};
    const cfg = model.cfg, found = c.found || new Map(), kinds = c.kinds || new Map();
    const inRegion = (r) => !c.regions || c.regions.has(r);
    const idOf = (name) => { const g = found.get(lc(name)); return g && g.id ? lc(g.id) : null; };
    const wants = [], skipped = [], missing = new Set();
    const add = (P, id, name, action, note) => {
      if (!wants.some((x) => x.P === P && x.groupId === id && x.action === action)) wants.push({ P, groupId: id, groupName: name, action, note: note || "" });
    };
    if (which === "includeWaves") {
      const wavesOf = (kind) => cfg.groups.filter((g) => g.role === "wave" && g.audience === kind && inRegion(g.region));
      for (const N of model.newP) {
        if (!N.surface) { skipped.push(`${N.name}: not a surface the engine writes`); continue; }
        if (N.reach.tenantWide) { skipped.push(`${N.name}: assigned to the whole tenant — a wave adds nobody`); continue; }
        const k = policyKind(N, kinds);
        if (!k.kind) { skipped.push(`${N.name}: its name says neither "- D -" nor "- U -" and its targets do not say either — include a wave by hand (🎯 New policies)`); continue; }
        for (const g of wavesOf(k.kind)) {
          const id = idOf(g.name);
          if (!id) { missing.add(g.name); continue; }
          if (N.reach.inc.has(id)) continue;
          add(N, id, g.name, "add-include", k.source === "targets" ? `${k.kind} policy by its targets (the name says neither - D - nor - U -)` : "");
        }
      }
    } else if (which === "excludeExclusion") {
      for (const N of model.newP) {
        if (!N.surface) { skipped.push(`${N.name}: not a surface the engine writes`); continue; }
        // The exclusion group must be of the kind the policy is ASSIGNED to
        // (the support matrix); the name decides only while it is not.
        const t = [...targetKinds(N, kinds)].filter((x) => x === "user" || x === "device" || x === "mixed");
        if (t.length > 1 || t.includes("mixed")) { skipped.push(`${N.name}: assigned to both user and device groups — one exclusion group cannot cover both; exclude by hand`); continue; }
        const k = t.length ? { kind: t[0], source: N.audience && N.audience !== t[0] ? "targets-over-name" : N.audience ? "name" : "targets" } : policyKind(N, kinds);
        if (!k.kind) { skipped.push(`${N.name}: its name says neither "- D -" nor "- U -" and it is ${k.source} — exclude an exclusion group by hand`); continue; }
        const name = k.kind === "device" ? cfg.exclusionDevice : cfg.exclusionUser;
        if (!name) { skipped.push(`${N.name}: no ${k.kind} exclusion group is configured (⚙️)`); continue; }
        const id = idOf(name);
        if (!id) { missing.add(name); continue; }
        if (N.reach.exc.has(id)) continue;
        if (N.reach.inc.has(id)) { skipped.push(`${N.name}: it INCLUDES ${name} — an exclusion on top would be a contradiction`); continue; }
        const sup = exclusionSupport(k.kind, effectiveTargets(N, kinds).kinds);
        if (sup.ok === false) { skipped.push(`${N.name} ⊘ ${name}: ${sup.why}`); continue; }
        add(N, id, name, "add-exclude", [k.source === "targets" ? `${k.kind} policy by its targets` : k.source === "targets-over-name" ? `named ${AUD[N.audience].tag} but assigned to ${k.kind} groups — so the ${k.kind} exclusion group` : "", sup.ok === null && N.reach.inc.size ? `⚠ ${sup.why}` : ""].filter(Boolean).join(" · "));
      }
    } else if (which === "excludeWaves") {
      // The proposals, waves only: a wave leaves an old policy only where a
      // new policy that sets the same settings includes it (or its twin) —
      // never ahead of the new policy, which would leave its members with
      // neither.
      const waveIds = new Map();
      for (const g of cfg.groups) if (g.role === "wave") { const id = idOf(g.name); if (id) waveIds.set(id, g); }
      for (const pr of c.pairs || []) {
        if (!needsAction(pr) || !pr.proposal) continue;
        const O = pr.O;
        for (const st of pr.proposal.steps) {
          const g = waveIds.get(st.groupId) || (st.twinOfId && waveIds.get(st.twinOfId));
          if (!g || !inRegion(g.region)) continue;
          if (!O.surface) { skipped.push(`${O.name}: not a surface the engine writes`); break; }
          if (st.supported === false) { skipped.push(`${O.name} ⊘ ${st.groupName}: ${st.why}`); continue; }
          // waves mode proposes waves the new policy has not got yet — ③
          // still never takes a wave out ahead of it (① first, or ⚔️)
          if (st.needsInclude) { skipped.push(`${O.name} ⊘ ${st.groupName}: ${pr.N.name} does not include it yet — ⚡① first, or fix it in ⚔️ (same plan)`); continue; }
          add(O, st.groupId, st.groupName, st.action, [st.supported === null ? `⚠ ${st.why}` : "", st.twinOf ? `twin of ${st.twinOf}` : "", st.planned ? "planned — the new policy is not assigned yet" : ""].filter(Boolean).join(" · "));
        }
      }
    }
    // 🧪 ① and ③ each complete the swap for some policies: the pilots come
    // off where the waves have taken over (10645, option A — both sides)
    if ((which === "includeWaves" || which === "excludeWaves") && cfg.pilotGroupsOff !== false) {
      const pr = pilotsFor(wants.concat(model.newP.filter((N) => N.surface && which === "includeWaves").map((N) => ({ P: N, groupId: "", action: "none" }))), Object.assign({}, c, { cfg }), true);
      for (const st of pr.steps) add(st.P, st.groupId, st.groupName, "remove", st.note);
      for (const k of pr.kept) skipped.push(k.why);
    }
    for (const n of missing) skipped.push(`${n} does not exist — create it in 🌊 first`);
    return { wants, skipped: uniq(skipped), policies: uniq(wants.map((x) => x.P)) };
  }

  // ------------------------------------------------------- retirement --
  // Per old policy: is every setting it carries also in the new set?
  const RETIRE = {
    covered: { label: "covered", cls: "au-op create", rank: 3 },
    differs: { label: "covered · values differ", cls: "gu-how priv", rank: 1 },
    gap: { label: "GAP — not in any new policy", cls: "au-op delete", rank: 0 },
    manual: { label: "review — other format", cls: "au-op update", rank: 2 },
    unread: { label: "settings not readable", cls: "au-op other", rank: 4 },
  };
  function retirement(model) {
    const newIdx = new Map();
    for (const N of model.newP) for (const [k, s] of N.settings) {
      if (!newIdx.has(k)) newIdx.set(k, []);
      newIdx.get(k).push({ N, s });
    }
    const out = [];
    for (const O of model.oldP) {
      const covering = new Map();
      let same = 0, diff = 0, none = 0;
      const rows = [];
      if (O.format === "catalog") {
        for (const [k, s] of O.settings) {
          const hits = newIdx.get(k) || [];
          const st = !hits.length ? "none" : hits.some((h) => h.s.value === s.value) ? "same" : "diff";
          if (st === "same") same++; else if (st === "diff") diff++; else none++;
          hits.forEach((h) => covering.set(h.N.key, h.N));
          rows.push({ key: k, name: s.name, cat: s.cat, oldDisplay: s.display, state: st,
            news: hits.map((h) => ({ name: h.N.name, key: h.N.key, display: h.s.display, same: h.s.value === s.value })) });
        }
      } else {
        for (const N of model.newP) if (N.cats.some((c) => c !== "other" && O.cats.includes(c))) covering.set(N.key, N);
      }
      let verdict;
      if (O.format !== "catalog") verdict = "manual";
      else if (!O.settings.size) verdict = O.detailError ? "unread" : "covered";
      else if (!none && !diff) verdict = "covered";
      else if (!none) verdict = "differs";
      else verdict = "gap";
      // Do the covering new policies REACH where this one does? The best
      // T12 verdict among them — "covered" by an unassigned policy is a
      // gap waiting for the day this one is retired.
      let reach = "none";
      const rank = { can: 0, may: 1, cannot: 2, none: 3 };
      for (const N of covering.values()) {
        if (N.reach.none || O.reach.none) continue;
        const v = Conflict.verdictPair(N.reach, O.reach).verdict;
        if (rank[v] < rank[reach]) reach = v;
      }
      rows.sort((a, b) => ({ none: 0, diff: 1, same: 2 }[a.state] - { none: 0, diff: 1, same: 2 }[b.state]) || String(a.name).localeCompare(String(b.name)));
      out.push({ O, verdict, same, diff, none, rows, covering: [...covering.values()], reach });
    }
    out.sort((a, b) => RETIRE[a.verdict].rank - RETIRE[b.verdict].rank || (b.O.state === "assigned") - (a.O.state === "assigned") || a.O.name.localeCompare(b.O.name));
    return out;
  }

  // -------------------------------------------------------------- waves --
  // found: Map lc(name) -> group object | null (null = not in the tenant)
  // One row per group the rollout names (cfg.groups): the wave pairs, then
  // the exclusion groups. "fits" are the new policies this group is FOR —
  // the same audience, or a policy whose name does not say.
  function waves(model, found, kinds, pairs) {
    return model.cfg.groups.map((def) => {
      const name = def.name;
      const g = found ? found.get(lc(name)) : undefined;
      const id = g ? lc(g.id) : null;
      // still under an earlier name in the tenant — offered for rename
      const legacyName = !g && found ? (def.oldNames || []).find((n) => found.get(lc(n))) : null;
      const legacy = legacyName ? { name: legacyName, group: found.get(lc(legacyName)) } : null;
      const legacyToo = g && found ? (def.oldNames || []).filter((n) => found.get(lc(n))) : [];
      const fits = model.newP.filter((N) => !N.audience || N.audience === def.audience);
      const newIncluding = id ? model.newP.filter((N) => N.reach.inc.has(id)) : [];
      const newExcluding = id ? model.newP.filter((N) => N.reach.exc.has(id)) : [];
      const oldExcluding = id ? model.oldP.filter((O) => O.reach.exc.has(id)) : [];
      // a user wave in a "- D -" policy (or the reverse) — assigned, but to
      // the kind of policy it was not made for
      const misfit = newIncluding.filter((N) => N.audience && N.audience !== def.audience);
      // old policies that collide with a new policy including this wave and
      // do not exclude it yet — the wave's outstanding work
      const tw = found && def.twin ? found.get(lc(def.twin)) : null;
      const twinId = tw && tw.id ? lc(tw.id) : null;
      const pending = id && def.role === "wave" ? uniq((pairs || []).filter((pr) => needsAction(pr) && pr.N.reach.inc.has(id) && !pr.O.reach.exc.has(id) && !(twinId && pr.O.reach.exc.has(twinId))).map((pr) => pr.O)) : [];
      const k = id && kinds ? kinds.get(id) : null;
      return { name, role: def.role, audience: def.audience, region: def.region, twin: def.twin, twinId, legacy, legacyToo,
        group: g || null, id, exists: !!g, lookedUp: g !== undefined,
        kind: k ? k.kind : def.audience, kindSource: k ? k.source : "name",
        memberCount: (g && typeof g.memberCount === "number") ? g.memberCount : null,
        fits, newIncluding, newExcluding, oldExcluding, misfit, pending };
    });
  }

  // ------------------------------------------------------ plan (writes) --
  // A plan here can carry SEVERAL steps per policy — "exclude wave A from
  // old policy X, exclude wave B from old policy Y" — where T11's planFor
  // takes one group for all. Composed ON TOP of planFor, step by step on
  // the running list, so every refusal and filter rule of T11 still
  // applies and the op that reaches applyPlan is exactly T11's shape.
  // steps: [{ policy: { surface, surfaceLabel, id, name, assignments (raw, fresh) },
  //           action, group: { id, displayName } | { tenantWide, displayName }, filter }]
  function composePlan(steps) {
    const byPol = new Map();
    for (const st of steps || []) {
      const k = `${st.policy.surface}|${lc(st.policy.id)}`;
      if (!byPol.has(k)) byPol.set(k, { policy: st.policy, steps: [] });
      byPol.get(k).steps.push(st);
    }
    const ops = [];
    for (const { policy, steps: sts } of byPol.values()) {
      let cur = policy.assignments || [];
      const details = [];
      for (const st of sts) {
        const r = AssignEdit.planFor([Object.assign({}, policy, { assignments: cur })], st.action, st.group, st.filter || null).ops[0];
        details.push({ action: st.action, group: st.group, filter: st.filter || null, change: r.change, reason: r.reason || "", removes: r.removes || "", note: st.note || "" });
        if (r.change === "modify") cur = r.after;
      }
      const beforeSig = AssignEdit.sig(policy.assignments || []);
      const changed = AssignEdit.sig(cur) !== beforeSig;
      ops.push({
        policy, details,
        before: AssignEdit.cleanAssignments(policy.assignments || []), beforeSig,
        after: AssignEdit.cleanAssignments(cur),
        change: changed ? "modify" : details.some((d) => d.change === "refused") ? "refused" : "noop",
      });
    }
    return {
      ops,
      changes: ops.filter((o) => o.change === "modify"),
      noops: ops.filter((o) => o.change === "noop"),
      refused: ops.filter((o) => o.change === "refused"),
      hasRemoval: ops.some((o) => o.change === "modify" && o.details.some((d) => d.action === "remove" && d.change === "modify")),
    };
  }
  // Undo: the recorded "before" of a run becomes the "after" of a new plan
  // cut against the tenant as it is NOW (fresh read) — the same drift
  // check guards it, so an undo never overwrites somebody else's edit.
  function undoPlan(backupPolicies, freshById) {
    const ops = [];
    for (const b of backupPolicies || []) {
      const now = freshById.get(`${b.surface}|${lc(b.id)}`);
      if (!now) continue;
      const after = AssignEdit.cleanAssignments(b.assignments || []);
      const changed = AssignEdit.sig(after) !== AssignEdit.sig(now.assignments || []);
      ops.push({
        policy: now,
        details: [{ action: "restore", group: { displayName: "the recorded assignments" }, change: changed ? "modify" : "noop", reason: changed ? "" : "already as recorded" }],
        before: AssignEdit.cleanAssignments(now.assignments || []), beforeSig: AssignEdit.sig(now.assignments || []),
        after, change: changed ? "modify" : "noop",
      });
    }
    return { ops, changes: ops.filter((o) => o.change === "modify"), noops: ops.filter((o) => o.change === "noop"), refused: [], hasRemoval: false, undo: true };
  }
  // After a verified write the local model is patched from what the
  // tenant confirmed, so the verdicts move without a whole-tenant re-read.
  // mapped: the documenter's assignment shape, names carried over.
  function patchAssignments(model, surface, id, after, names, filters) {
    const P = model.policies.find((p) => p.surface === surface && lc(p.id) === lc(id));
    if (!P) return false;
    const rawList = (after || []).map((a) => ({ target: Object.assign({}, a.target) }));
    P.raw.assignments = rawList;
    P.item.assignments = rawList.map((a) => {
      const m = Docs.assignmentOf(a);
      if (m.groupId) m.name = (names && names.get(lc(m.groupId))) || m.name;
      if (m.filterId && filters && filters.get(lc(m.filterId))) m.filterName = filters.get(lc(m.filterId)).displayName || "";
      return m;
    });
    P.reach = Conflict.reachOf(P.item);
    P.state = OverviewTool.verdictOf(P.item);
    return true;
  }

  // ------------------------------------------------------ Graph reads --
  // Legacy intent templates: the display name is the only thing that says
  // which discipline an intent enforces (T16's classifier reads it).
  async function readTemplates() {
    const list = await Graph.readAll("/deviceManagement/templates?$select=id,displayName,templateType,templateSubtype", { scopes: Graph.SCOPES.config, beta: true, retry: true });
    return new Map((list || []).map((t) => [lc(t.id), t]));
  }
  const odq = (s) => String(s).replace(/'/g, "''");
  // Wave groups by exact name. More than one group with the name is said,
  // not picked: the first would be a coin toss.
  async function findGroups(names, onStatus) {
    const found = new Map(), dupes = [];
    let i = 0;
    const rs = await Graph.pool(names, async (name) => {
      onStatus && onStatus(`Looking up wave groups — ${++i}/${names.length}…`);
      const hits = await Graph.readAll(`/groups?$filter=${encodeURIComponent(`displayName eq '${odq(name)}'`)}&$select=id,displayName,description,groupTypes,membershipRule,securityEnabled,mailEnabled,createdDateTime`, { scopes: Graph.SCOPES.groups, retry: true });
      return hits || [];
    }, 4);
    rs.forEach((r, n) => {
      const name = names[n];
      if (r.error) { found.set(lc(name), undefined); return; }
      const exact = (r.value || []).filter((g) => lc(g.displayName) === lc(name));
      if (exact.length > 1) dupes.push({ name, count: exact.length });
      found.set(lc(name), exact[0] || null);
    });
    return { found, dupes };
  }
  // Kind of each group: its object, then (assigned groups only) the user
  // and device member counts. $count answers text and needs eventual
  // consistency — the same headers Graph.memberCount sends.
  async function readKinds(groupIds, onStatus, known) {
    const kinds = new Map(known || []);
    const ids = uniq((groupIds || []).map(lc)).filter((id) => id && !kinds.has(id));
    let i = 0;
    const H = { ConsistencyLevel: "eventual", Accept: "text/plain" };
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    const rs = await Graph.pool(ids, async (id) => {
      onStatus && onStatus(`Reading group kinds — ${++i}/${ids.length}…`);
      const g = await Graph.readOne(`/groups/${encodeURIComponent(id)}?$select=id,displayName,groupTypes,membershipRule`, { scopes: Graph.SCOPES.groups });
      let users = null, devices = null;
      if (!(g && g.membershipRule)) {
        try { users = num(await Graph.get(`/groups/${encodeURIComponent(id)}/transitiveMembers/microsoft.graph.user/$count`, { scopes: Graph.SCOPES.groups, headers: H, retry: true })); } catch { users = null; }
        try { devices = num(await Graph.get(`/groups/${encodeURIComponent(id)}/transitiveMembers/microsoft.graph.device/$count`, { scopes: Graph.SCOPES.groups, headers: H, retry: true })); } catch { devices = null; }
      }
      return Object.assign({ name: (g && g.displayName) || id, users, devices }, kindOfGroup(g, users, devices));
    }, 6);
    rs.forEach((r, n) => { kinds.set(ids[n], r.error ? { kind: "unknown", source: "unreadable", name: ids[n], users: null, devices: null } : r.value); });
    return kinds;
  }
  // The policies a plan touches, read FRESH — a plan is cut from the
  // tenant's answer at the dry run, not from the list read minutes ago.
  async function readFresh(policies, onStatus) {
    const out = new Map();
    let i = 0;
    const rs = await Graph.pool(policies, async (p) => {
      onStatus && onStatus(`Reading current assignments — ${++i}/${policies.length}…`);
      const sf = AssignEdit.surfaceById(p.surface);
      return Graph.readAll(sf.read1(p.id), { scopes: AssignEdit.READ(), beta: true, retry: true });
    }, 4);
    rs.forEach((r, n) => {
      const p = policies[n];
      const sf = AssignEdit.surfaceById(p.surface);
      if (r.error) return;
      out.set(`${p.surface}|${lc(p.id)}`, { surface: p.surface, surfaceLabel: sf ? sf.label : p.surface, icon: sf ? sf.icon : "", id: p.id, name: p.name, assignments: r.value || [] });
    });
    return out;
  }
  // Rename a rollout group (10635): the display name, and the mail nickname
  // to match (T22's rule). The object id does not change, so assignments and
  // nesting are untouched. Refused when the new name is taken; read back.
  async function renameGroup(group, newName) {
    const taken = await Graph.readAll(`/groups?$filter=${encodeURIComponent(`displayName eq '${odq(newName)}'`)}&$select=id,displayName`, { scopes: Graph.SCOPES.groups, retry: true });
    const other = (taken || []).find((x) => lc(x.displayName) === lc(newName) && lc(x.id) !== lc(group.id));
    if (other) return { ok: false, why: `a group named ${newName} exists already (${other.id}) — not renamed` };
    const body = { displayName: newName, mailNickname: GroupMigrate.mailNickname(newName) };
    let note = "";
    try { await Graph.patch(`/groups/${encodeURIComponent(group.id)}`, body, { scopes: GroupMigrate.SCOPES.groupWrite }); }
    catch (e) {
      if (!/mailnickname/i.test((e && e.message) || "")) throw e;
      await Graph.patch(`/groups/${encodeURIComponent(group.id)}`, { displayName: newName }, { scopes: GroupMigrate.SCOPES.groupWrite });
      note = "the mail nickname could not be changed and was left as it was";
    }
    const back = await Graph.readOne(`/groups/${encodeURIComponent(group.id)}?$select=id,displayName,description,groupTypes,membershipRule,securityEnabled,mailEnabled,createdDateTime`, { scopes: Graph.SCOPES.groups });
    const verified = !!back && lc(back.displayName) === lc(newName);
    return { ok: true, verified, group: back || Object.assign({}, group, { displayName: newName }), note, from: group.displayName };
  }
  // The signed-in admin, in THIS tenant (build 10633). /me rather than the
  // token's oid: for a guest admin the oid names the home-tenant object,
  // not the one that can own a group here.
  async function readMe() {
    return Graph.readOne("/me?$select=id,displayName,userPrincipalName", { scopes: Graph.SCOPES.directory });
  }
  // A wave group: a plain ASSIGNED security group, T22's payload rules —
  // no mail, not role-assignable, a mailNickname T22 already sanitises.
  // The create is preceded by a fresh by-name check (somebody may have made
  // it since the read) and followed by a read-back of the new object.
  //
  // THE CREATOR IS THE OWNER (10633, Mihai). Graph does not do that for an
  // admin: "an admin user is automatically added as the group owner of a
  // Microsoft 365 group they create but not of a security group" (Learn,
  // Create group). So the owner is NAMED in the create (owners@odata.bind)
  // and READ BACK. A non-admin caller cannot name themselves (Graph known
  // issue) but becomes owner automatically — so a refusal that is about the
  // owner is retried without it, then the owners read decides; a group the
  // read-back says has another owner or none gets the owner added by $ref.
  async function createWave(name, description, owner) {
    const again = await Graph.readAll(`/groups?$filter=${encodeURIComponent(`displayName eq '${odq(name)}'`)}&$select=id,displayName`, { scopes: Graph.SCOPES.groups, retry: true });
    const exists = (again || []).find((g) => lc(g.displayName) === lc(name));
    if (exists) return { skipped: true, group: exists, why: "a group with this name exists already — not created twice" };
    const payload = {
      displayName: name,
      description: description || "",
      mailEnabled: false,
      mailNickname: GroupMigrate.mailNickname(name),
      securityEnabled: true,
      isAssignableToRole: false,
    };
    const ownerRef = (id) => `https://graph.microsoft.com/v1.0/directoryObjects/${id}`;
    let ownerNote = "";
    if (owner && owner.id) payload["owners@odata.bind"] = [ownerRef(owner.id)];
    let created;
    try {
      created = await Graph.post("/groups", payload, { scopes: GroupMigrate.SCOPES.groupWrite });
    } catch (e) {
      // only a refusal ABOUT the owner is retried — anything else is a real
      // validation error and must not turn into a group the plan did not describe
      if (!(owner && owner.id) || !/owner|itself|self/i.test((e && e.message) || "")) throw e;
      ownerNote = "naming you owner in the create was refused (" + String((e && e.message) || e).slice(0, 120) + ") — created without it";
      const p2 = Object.assign({}, payload); delete p2["owners@odata.bind"];
      created = await Graph.post("/groups", p2, { scopes: GroupMigrate.SCOPES.groupWrite });
    }
    if (!created || !created.id) throw new Error("the create call returned no group id");
    let verified = false, verifyError = "";
    try {
      const back = await Graph.readOne(`/groups/${encodeURIComponent(created.id)}?$select=id,displayName,securityEnabled,mailEnabled`, { scopes: Graph.SCOPES.groups });
      verified = !!back && lc(back.displayName) === lc(name) && back.securityEnabled === true;
      if (!verified) verifyError = "the read-back does not match what was sent";
    } catch (e) { verifyError = "created, but the read-back failed: " + ((e && e.message) || e); }
    // the owner, read back — the tenant's word, not the request's
    let ownerVerified = null;
    if (owner && owner.id) {
      const owns = async () => {
        const list = await Graph.readAll(`/groups/${encodeURIComponent(created.id)}/owners?$select=id,displayName`, { scopes: Graph.SCOPES.groups, retry: true });
        return (list || []).some((o) => lc(o.id) === lc(owner.id));
      };
      try {
        ownerVerified = await owns();
        if (!ownerVerified) {
          await Graph.post(`/groups/${encodeURIComponent(created.id)}/owners/$ref`, { "@odata.id": ownerRef(owner.id) }, { scopes: GroupMigrate.SCOPES.groupWrite });
          ownerVerified = await owns();
          ownerNote = (ownerNote ? ownerNote + "; " : "") + (ownerVerified ? "owner added after the create" : "adding you as owner did not take");
        }
      } catch (e) {
        ownerVerified = false;
        ownerNote = (ownerNote ? ownerNote + "; " : "") + "the owner could not be set or read: " + String((e && e.message) || e).slice(0, 160);
      }
    }
    return { created: true, group: created, verified, verifyError, ownerVerified, ownerNote };
  }
  // Definition display names and option labels for the settings a result
  // shows — the cache read carries no settingDefinitions (the list read of
  // /settings does not expand them), so they are asked for per policy, only
  // for the policies on screen, and remembered.
  async function readLabels(policyIds, onStatus, known) {
    const labels = known || new Map();       // lc(defId) -> { name, options: Map lc(itemId) -> label }
    const ids = uniq(policyIds || []);
    let i = 0;
    await Graph.pool(ids, async (id) => {
      onStatus && onStatus(`Reading setting names — ${++i}/${ids.length}…`);
      const list = await Graph.readAll(`/deviceManagement/configurationPolicies/${encodeURIComponent(id)}/settings?$expand=settingDefinitions&$top=1000`, { scopes: Graph.SCOPES.config, beta: true, retry: true });
      for (const s of list || []) {
        for (const d of (s && s.settingDefinitions) || []) {
          if (!d || !d.id) continue;
          const k = lc(d.id);
          const e = labels.get(k) || { name: d.displayName || "", options: new Map() };
          if (d.displayName) e.name = d.displayName;
          for (const o of d.options || []) if (o && o.itemId) e.options.set(lc(o.itemId), o.displayName || o.name || "");
          labels.set(k, e);
        }
      }
    }, 4);
    return labels;
  }
  // A comparable value back to words: "1" under a choice setting is the
  // option whose itemId is <defId>_1.
  function labelValue(labels, defId, value) {
    const e = labels && labels.get(lc(defId));
    if (!e) return null;
    const parts = String(value || "").split(" · ").map((v) => e.options.get(`${lc(defId)}_${v}`) || e.options.get(v) || v);
    return parts.join(" · ");
  }
  function labelName(labels, row) {
    if (!row || !row.key || row.key.startsWith("asr|")) return row && row.name;
    const e = labels && labels.get(lc(row.key));
    return (e && e.name) || row.name;
  }

  // --------------------------------------------------------- exports --
  const mdCell = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const assignText = (P) => (P.item.assignments || []).map((a) => `${a.kind === "Excluded" ? "−" : "+"}${Docs.assignmentText(a)}`).join("; ") || "not assigned";
  function markdown(model, pairs, retire, waveRows, meta) {
    const m = meta || {};
    const L = [];
    L.push(`# MDE rollout — ${mdCell(m.tenant || "tenant")}`);
    L.push("");
    L.push(`Read: ${m.readAt ? new Date(m.readAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "unknown"} · ${mdCell(m.build || "")}`);
    L.push("");
    L.push(`New = names starting with ${model.cfg.newPrefixes.map((p) => `"${p}"`).join(", ")} · out of scope = ${model.cfg.outPrefixes.map((p) => `"${p}"`).join(", ")} · everything else is old.`);
    L.push("");
    L.push("An assignment is a target, not proof a device applied the setting. Group-kind and reach verdicts are read from assignments and group membership counts; assignment filters are named, not evaluated.");
    L.push("");
    L.push(`## Wave and exclusion groups (${waveRows.length})`);
    L.push("");
    L.push("A \"- D -\" policy takes the device wave, a \"- U -\" policy the user wave of the same region.");
    L.push("");
    L.push("| Group | Region | For | Exists | Kind read | New policies (included / excluded) | Old policies still to exclude it |");
    L.push("|---|---|---|---|---|---|---|");
    for (const w of waveRows) L.push(`| ${mdCell(w.name)} | ${mdCell(w.role === "exclusion" ? "exclusion" : w.region)} | ${mdCell(w.audience)} | ${w.exists ? "yes" : "NO"} | ${mdCell(w.kind)} | ${w.role === "exclusion" ? `excluded from ${w.newExcluding.length} / ${w.fits.length}` : `included in ${w.newIncluding.length} / ${w.fits.length}`}${w.misfit.length ? ` (${w.misfit.length} of the other kind)` : ""} | ${w.role === "wave" ? w.pending.length : "—"} |`);
    L.push("");
    L.push(`## New policies (${model.newP.length})`);
    L.push("");
    L.push("| Policy | For | Kind | Categories | Assignments |");
    L.push("|---|---|---|---|---|");
    for (const P of model.newP) L.push(`| ${mdCell(P.name)} | ${mdCell(P.audience || "—")} | ${mdCell(P.kind)} | ${mdCell(P.cats.map((c) => catMeta(c).label).join(", "))} | ${mdCell(assignText(P))} |`);
    L.push("");
    const act = pairs.filter(needsAction);
    L.push(`## Old policies colliding with a new one (${act.length} need action)`);
    L.push("");
    L.push("| Old policy | New policy | Type | Reach | Settings (new → old) | Proposed fix |");
    L.push("|---|---|---|---|---|---|");
    for (const pr of pairs) {
      const set = pr.type === "review" ? `categories: ${pr.common.map((c) => catMeta(c).label).join(", ")}`
        : (pr.diffs.length ? pr.diffs : pr.sames).slice(0, 6).map((d) => `${d.name}: ${d.newDisplay} → ${d.oldDisplay}`).join("; ") + ((pr.diffs.length || pr.sames.length) > 6 ? " …" : "");
      const fix = pr.proposal ? (pr.proposal.steps.length
        ? pr.proposal.steps.map((s) => `${s.action === "remove" ? "remove include" : "exclude"} ${s.groupName}${s.twinOf ? ` (device/user twin of ${s.twinOf})` : ""}${s.supported === false ? " (NOT SUPPORTED: " + s.why + ")" : ""}`).join("; ")
        : pr.proposal.none) : "";
      L.push(`| ${mdCell(pr.O.name)} | ${mdCell(pr.N.name)} | ${mdCell(TYPE[pr.type].label)} | ${mdCell(VERDICT[pr.reach.verdict].label)} | ${mdCell(set)} | ${mdCell(fix)} |`);
    }
    L.push("");
    L.push(`## Retirement check (${retire.length} old policies)`);
    L.push("");
    L.push("| Old policy | Verdict | Same in new | Different in new | Not in new | Covering new policies |");
    L.push("|---|---|---|---|---|---|");
    for (const r of retire) L.push(`| ${mdCell(r.O.name)} | ${mdCell(RETIRE[r.verdict].label)} | ${r.same} | ${r.diff} | ${r.none} | ${mdCell(r.covering.map((c) => c.name).join("; "))} |`);
    L.push("");
    L.push(`_Generated by ${mdCell((typeof BRANDING !== "undefined" && BRANDING.name) || "TUNO")} — T28 MDE rollout._`);
    return L.join("\n");
  }
  const csvCell = (s) => { const v = String(s == null ? "" : s); return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  function csv(pairs) {
    const head = ["Old policy", "Old generation", "New policy", "Type", "Reach", "Reach why", "Setting", "New value", "Old value", "Proposed fix"];
    const rows = [head];
    for (const pr of pairs) {
      const fix = pr.proposal ? (pr.proposal.steps.map((s) => `${s.action === "remove" ? "remove include" : "exclude"} ${s.groupName}${s.twinOf ? ` (twin of ${s.twinOf})` : ""}${s.supported === false ? " (not supported)" : ""}`).join("; ") || pr.proposal.none) : "";
      const list = pr.type === "review" ? [{ name: `category: ${pr.common.map((c) => catMeta(c).label).join(", ")}`, newDisplay: "", oldDisplay: "" }] : pr.diffs.concat(pr.sames);
      for (const d of list) rows.push([pr.O.name, GEN[pr.O.generation].label, pr.N.name, TYPE[pr.type].label, VERDICT[pr.reach.verdict].label, pr.reach.why, d.name, d.newDisplay, d.oldDisplay, fix]);
    }
    return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  }

  return {
    DEFAULTS, normConfig, normName, hasPrefix, generationOf, GEN, isOld,
    CAT_IDS, catMeta, catOfKey, catOfLegacyProp, catOfAdmx, isConfigured,
    settingsOf, omaKey, omaSettings, normValue, SECTION_IDS, surfaceFor,
    build, pairReach, VERDICT, TYPE, compare, needsAction,
    audienceOf, AUD, groupsOf, regionsFromNames, policyKind, ROLLOUT, rolloutWants,
    kindFromName, kindOfGroup, targetKinds, effectiveTargets, exclusionSupport, proposalFor, pilotRemovals, pilotsFor, twinIndex, wavePool,
    RETIRE, retirement, waves, composePlan, undoPlan, patchAssignments,
    readTemplates, findGroups, readKinds, readFresh, readMe, createWave, renameGroup, readLabels, labelValue, labelName,
    markdown, csv, assignText,
  };
})();


// ======================================================================
// T28 — the screen: a rail, one pane per job (10632, layout B), and the
// report workspace (10637) — one saved report preview, picked from the
// rail's report nodes since 10638. The GATES live here, the T11 way: a plan is cut from a
// FRESH read of the policies it touches, the backup is taken before Apply
// unlocks, removals are typed, additions ticked, and every write goes
// through AssignEdit.applyPlan (drift check → write → verify) on the run
// ledger. The engine above refuses nothing about sequence; this does.
// ======================================================================
const MdeRolloutTool = (() => {
  "use strict";
  const M = MdeRollout;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;

  // ----------------------------------------------------------- state --
  let res = null;              // the shared read (PolicyCache / Docs.collect, keepRaw)
  let model = null, pairs = [], retire = [], waveRows = [];
  let templates = new Map(), found = null, dupes = [], kinds = new Map(), labels = new Map();
  let cfg = M.normConfig(null);
  let pane = "conflicts";
  const view = { cat: null, state: null, status: "act", q: "" };
  const sel = new Set();       // policy keys (New / Old panes)
  const selPairs = new Set();  // pair ids (Conflicts pane)
  const selWaves = new Set();  // missing wave names (Waves pane)
  const selRename = new Set(); // wave names found under an earlier name (Waves pane, 10635)
  let rollRegions = null;      // rollout actions: the regions ticked (null = every region)
  // 👥 Wave members (10634): its own read, its own selection, its own plan kind
  // 📑 Reports (10635): the last run of each, and the conflict checks of this session
  const reps = { assign: null, config: null, conflicts: null, checks: [], busy: "", selected: "assign", error: "" };
  const mem = { input: null, model: null, loading: false, region: null, unmapped: false,
    sel: new Set(), open: new Set(), opts: { fill: true, nestUsers: true, nestDevices: true, removals: false },
    // 🕳 Left out (10642): the view, the country its user list is narrowed
    // to (a row key, null = the whole wave) and the device reason shown
    left: false, leftCountry: null, leftReason: null,
    // 🧪 Pilots (10647): the view, its tile filter and the members ticked
    pil: false, pilState: null, pilSel: new Set() };
  // ⊘ Exclusions (10639, layout A off the mockup): its own read, search,
  // the looked-up card and its ticks, and the "excluded now" rows ticked
  const ex = { base: null, loading: false, error: "", q: "", searching: false, results: null, note: "", card: null, cardLoading: false, cardError: "",
    ticks: new Set(), sel: new Set(), keepOld: true };
  const open = new Set();      // expanded rows
  let plan = null;             // composed plan + meta
  // Where the plan panel opens (10639, Mihai: the dry run "appears at the
  // bottom, not visible" — option A off the mockup): right under the card
  // whose button made it, by that card's id; null = under the pane.
  let planAnchor = null;
  let ruleSaved = "";          // the last save's word, kept across re-renders (10642)
  let backupTaken = false;
  const runs = [];             // this session's writes
  let running = false, busy = false, enriching = "";
  let filterList = null;       // all assignment filters, for the bar

  const prog = (m) => TunoProgress.show("mrBody", "mrProg", m);
  // THE PLAN PANEL IS ONE NODE, held here for the life of the page. It is
  // seated under the active pane on every render; holding the reference
  // means clearing or re-rendering the body can never destroy it (the warm
  // start renders before the first click, and 🚀 Read the tenant clears the
  // body — the node went with it until it was held).
  let PLAN = null;
  const planEl = () => PLAN || (PLAN = document.getElementById("mrPlan"));
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const tenantName = () => { const n = $("tenantName"); return (n && n.textContent) || ""; };

  // ------------------------------------------------------ per-tenant cfg --
  // The naming rules are this tenant's convention, so they are kept per
  // tenant — in this browser only. localStorage can be absent (private
  // window) or throw; the defaults are then simply the rules.
  const cfgKey = () => `tuno.t28.rules.${lc((typeof TunoTenant !== "undefined" && TunoTenant.tenantId()) || "default")}`;
  function loadCfg() {
    try { const raw = window.localStorage.getItem(cfgKey()); cfg = M.normConfig(raw ? JSON.parse(raw) : null); }
    catch { cfg = M.normConfig(null); }
  }
  function saveCfg(c) {
    cfg = M.normConfig(c);
    try { window.localStorage.setItem(cfgKey(), JSON.stringify(cfg)); return true; } catch { return false; }
  }

  // --------------------------------------------------------- names --
  // One map of group names for everything this screen prints: the read's
  // resolved names, the kinds read, the wave lookup, and every group a plan
  // named — so a verified write can be patched into the model with names.
  const names = new Map();
  function learnNames() {
    if (!model) return;
    for (const P of model.policies) for (const a of P.item.assignments || []) if (a.groupId && a.name && a.name !== a.groupId) names.set(lc(a.groupId), a.name);
    for (const [id, k] of kinds) if (k && k.name && k.name !== id) names.set(id, k.name);
    if (found) for (const g of found.values()) if (g && g.id) names.set(lc(g.id), g.displayName);
  }
  const nameOf = (id) => names.get(lc(id)) || id;

  // ----------------------------------------------------------- derive --
  // Everything below the read, recomputed together so no pane shows a
  // verdict the others have moved past.
  function derive() {
    model = M.build(res, cfg, templates);
    learnNames();
    const twins = M.twinIndex(model.cfg, found);
    pairs = M.compare(model, twins);
    const ctx = { kinds, waves: M.wavePool(model.cfg, found), twins, names, fixWith: cfg.fixWith, regions: rollRegions, cfg: model.cfg, pairs, found };
    pairs.forEach((pr) => { pr.proposal = M.proposalFor(pr, ctx); });
    retire = M.retirement(model);
    waveRows = M.waves(model, found, kinds, pairs);
    // selections that no longer exist are dropped, never silently kept
    for (const k of [...sel]) if (!model.byKey.has(k)) sel.delete(k);
    for (const id of [...selPairs]) if (!pairs.some((p) => p.id === id && M.needsAction(p))) selPairs.delete(id);
    // the wave members follow the rules and the wave lookup
    if (mem.input) memCompute();
  }

  // -------------------------------------------------------------- run --
  async function run(attach) {
    if (running) return;
    running = true; $("mrRun").disabled = true;
    reps.error = "";
    try {
      loadCfg();
      if (!attach) { if (pane !== "reports") $("mrBody").innerHTML = ""; clearPlan(); }
      else { const o = $("mrBody").querySelector(":scope > .mr-offer"); if (o) o.remove(); }
      if (attach && PolicyCache.reading()) res = await PolicyCache.read(prog);
      else if (attach && PolicyCache.get()) res = PolicyCache.get();
      else {
        await Graph.ensureScopes([...new Set([...PolicyCache.scopesNeeded(), ...Graph.SCOPES.groups])]);
        res = await PolicyCache.refresh(prog);
      }
      prog("Reading the legacy endpoint security templates…");
      try { templates = await M.readTemplates(); } catch { templates = new Map(); }
      prog("Looking up the wave groups…");
      try { const f = await M.findGroups(cfg.lookup, prog); found = f.found; dupes = f.dupes; } catch { found = null; dupes = []; }
      derive();
      prog("");
      render();
      showExports(true);
      // Kinds and setting names follow the first paint: the lists are
      // useful at once, and the proposals sharpen when the kinds land.
      await enrich();
      return true;
    } catch (e) {
      prog("");
      if (pane === "reports") reps.error = `Tenant read failed: ${GroupUse.shortErr(e, 250)}`;
      $("mrBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div></div>`;
      return false;
    } finally { running = false; $("mrRun").disabled = false; if (pane === "reports" && model) render(); }
  }

  async function enrich() {
    if (!model) return;
    const act = pairs.filter(M.needsAction);
    const ids = new Set();
    model.newP.forEach((N) => N.reach.inc.forEach((g) => ids.add(g)));
    act.forEach((pr) => pr.O.reach.inc.forEach((g) => ids.add(g)));
    if (found) for (const g of found.values()) if (g && g.id) ids.add(lc(g.id));
    try {
      enriching = "reading group kinds…"; renderStatus();
      kinds = await M.readKinds([...ids], (m) => { enriching = m; renderStatus(); }, kinds);
    } catch { /* kinds stay unknown and the proposals say so */ }
    const polIds = [...new Set(act.flatMap((pr) => [pr.N, pr.O]).filter((P) => P.sectionId === "settingsCatalog").map((P) => P.id))];
    try {
      enriching = "reading setting names…"; renderStatus();
      labels = await M.readLabels(polIds, (m) => { enriching = m; renderStatus(); }, labels);
    } catch { /* ids stay ids */ }
    enriching = "";
    derive();
    render();
  }
  function renderStatus() { const el = $("mrEnrich"); if (el) el.textContent = enriching ? `⏳ ${enriching}` : ""; }

  function showExports(on) { ["mrMd", "mrCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); $("mrGlobalExport").hidden = !on || pane === "reports"; }
  // 10644 (Mihai: "clicking the tool should offer to read the tenant, and
  // not start automatically"). Opening T28 reads nothing. The screen offers
  // the read: a fresh one, or the sign-in read when TUNO already holds it.
  // Either way the tenant is only read on the click.
  function onShow() {
    if (model || running) return;
    offerRead();
  }
  function offerRead() {
    const body = $("mrBody");
    if (!body) return;
    const held = PolicyCache.get(), busy = PolicyCache.reading();
    const t = held ? PolicyCache.timeLabel() : "";
    const alt = held
      ? `<button class="btn" data-mrread="attach">Use the ${PolicyCache.fromSignIn() ? "sign-in" : "shared"} read from ${esc(t)}</button>`
      : busy ? `<button class="btn" data-mrread="attach">Wait for the sign-in read</button>` : "";
    body.innerHTML = `<div class="list-card mr-offer">
      <h3>Nothing is read yet</h3>
      <p class="mini">Reading takes the policies and their assignments, the legacy security templates and the wave groups. It changes nothing: T28 writes only when you apply a plan.</p>
      <div class="mr-offer-acts"><button class="btn primary" data-mrread="fresh">↻ Read the tenant</button>${alt}</div>
      ${held ? `<p class="mini muted">The ${PolicyCache.fromSignIn() ? "sign-in" : "shared"} read is the tenant as it was at ${esc(t)}. ↻ Read the tenant reads it now.</p>`
        : busy ? `<p class="mini muted">TUNO is still reading the tenant from the sign-in. Waiting for it saves a second read.</p>` : ""}
    </div>`;
  }
  function reset() {
    res = null; model = null; pairs = []; retire = []; waveRows = []; found = null; dupes = [];
    kinds = new Map(); labels = new Map(); names.clear(); sel.clear(); selPairs.clear(); selWaves.clear(); selRename.clear(); open.clear();
    runs.length = 0; filterList = null; clearPlan();
    reps.assign = null; reps.config = null; reps.conflicts = null; reps.checks.length = 0; reps.busy = ""; reps.selected = "assign"; reps.error = "";
    mem.input = null; mem.model = null; mem.loading = false; mem.region = null; mem.unmapped = false; mem.sel.clear(); mem.open.clear();
    mem.left = false; mem.leftCountry = null; mem.leftReason = null; mem.pil = false; mem.pilState = null; mem.pilSel.clear();
    Object.assign(ex, { base: null, loading: false, error: "", q: "", searching: false, results: null, note: "", card: null, cardLoading: false, cardError: "" });
    ex.ticks.clear(); ex.sel.clear(); planAnchor = null;
    if ($("mrExclude")) $("mrExclude").hidden = true;
    if ($("mrBody")) $("mrBody").innerHTML = "";
    showExports(false); syncSelbar();
  }

  // ------------------------------------------------------------ chips --
  const chip = (cls, text, title) => `<span class="${cls}"${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</span>`;
  const genChip = (P) => chip(M.GEN[P.generation].cls, M.GEN[P.generation].label);
  const catIcons = (P) => P.cats.map((c) => { const m = M.catMeta(c); return `<span title="${esc(m.label)}">${m.icon}</span>`; }).join(" ");
  const assignChips = (P) => (P.item.assignments || []).length
    ? P.item.assignments.map((a) => `<span class="gu-how ${a.kind === "Excluded" ? "exc" : "inc"}"${a.filterId ? ` title="assignment filter — evaluated by the service, not here"` : ""}>${esc(Docs.assignmentText(a))}</span>`).join(" ")
    : `<span class="mini muted">not assigned</span>`;
  const kindWord = (id) => { const k = kinds.get(lc(id)); return k ? `${k.kind}${k.source && k.source !== "members" ? ` (by ${k.source})` : ""}` : "kind not read"; };
  const audChip = (P) => P.audience ? `<span title="${esc(`A ${M.AUD[P.audience].label} policy by its name (${M.AUD[P.audience].tag}) — it takes the ${M.AUD[P.audience].label} wave groups`)}">${M.AUD[P.audience].icon} ${esc(M.AUD[P.audience].label)}</span> · ` : "";
  const polLink = (P) => `<a href="#" data-mropen="${esc(P.key)}" title="Open the policy — settings and assignments">${esc(P.name)}</a>`;

  // ------------------------------------------------------------- rail --
  // Layout B restored at 10638 (Mihai: "the other layout was better, but
  // only the reports layout needed adjustment" — option A off the mockup):
  // the rail, one level, every count in view; 📑 Reports opens into its
  // three reports, each with its state, and the preview takes the main column.
  function railHtml() {
    const act = pairs.filter(M.needsAction);
    const gaps = retire.filter((r) => r.verdict === "gap").length;
    const missing = waveRows.filter((w) => w.lookedUp && !w.exists && !w.legacy).length;
    const toRename = waveRows.filter((w) => w.legacy && !w.exists).length;
    const node = (id, icon, label, n, bad) => `<div class="ep-node${pane === id && id !== "reports" ? " active" : ""}${id === "reports" && pane === "reports" ? " mr-open" : ""}" data-mrpane="${id}" role="button" tabindex="0">
      <span>${icon} ${esc(label)}</span>${n !== null && n !== undefined ? `<span class="ep-n${bad ? " gap" : ""}">${esc(n)}</span>` : ""}</div>`;
    const made = REPORTS.filter((x) => reps[x.id]).length;
    const repNode = (x) => {
      const r = reps[x.id];
      const st = reps.busy === x.id ? "running…" : !r ? "not generated" : reportStale(x.id) ? "regenerate" : x.id === "conflicts" && r.summary ? `${r.summary.act} to act · ${shortTime(r.at)}` : `generated ${shortTime(r.at)}`;
      const bad = r && (reportStale(x.id) || (x.id === "conflicts" && r.summary && r.summary.act > 0));
      return `<div class="ep-node mr-rep-node${pane === "reports" && reps.selected === x.id ? " active" : ""}" data-mrreport="${x.id}" role="button" tabindex="0">
        <span>${x.icon} ${esc(x.title)}</span><span class="mr-rep-state${bad ? " gap" : ""}">${esc(st)}</span></div>`;
    };
    return [
      node("new", "🎯", "New policies", model.newP.length),
      node("conflicts", "⚔️", "Conflicts with old", act.length, act.length > 0),
      node("old", "🗄", "Old policies", model.oldP.length),
      node("retire", "🧹", "Retirement check", gaps ? `${gaps} gap${gaps === 1 ? "" : "s"}` : "✓", gaps > 0),
      node("waves", "🌊", "Wave groups", toRename ? `${toRename} to rename` : missing ? `${missing} missing` : waveRows.length, missing > 0 || toRename > 0),
      node("members", "👥", "Wave members", mem.model ? (() => { const todo = mem.model.rows.filter((r) => r.ug && (!r.inSync || r.ugNested === false || r.dgNested === false)).length; return todo ? `${todo} to do` : "✓"; })() : null, mem.model ? mem.model.rows.some((r) => r.ug && !r.inSync) : false),
      (() => { const n = exNow(); return node("exclusions", "⊘", "Exclusions", n ? (n.half ? `${n.half} half` : `${n.users} · ${n.devices}`) : null, !!(n && n.half)); })(),
      "<hr>",
      node("reports", "📑", "Reports", `${made} of ${REPORTS.length}`),
      REPORTS.map(repNode).join(""),
      node("changes", "📜", "Changes this session", runs.length),
      node("rules", "⚙️", "Naming rules", null),
      node("how", "❓", "How it works", null),
      "<hr>",
      node("out", "🚫", "Out of scope", model.outP.length),
    ].join("");
  }

  // -------------------------------------------------------- toolbars --
  const fchip = (attr, val, label, n, active) => `<button class="fchip${active ? " active" : ""}" type="button" ${attr}="${esc(val)}">${esc(label)}${n !== undefined ? ` (${n})` : ""}</button>`;
  function catChips(list, catsOf) {
    const counts = {};
    list.forEach((x) => catsOf(x).forEach((c) => { counts[c] = (counts[c] || 0) + 1; }));
    const ids = M.CAT_IDS.filter((c) => counts[c]);
    return fchip("data-mrcat", "", "All", list.length, !view.cat)
      + ids.map((c) => { const m = M.catMeta(c); return fchip("data-mrcat", c, `${m.icon} ${m.label}`, counts[c], view.cat === c); }).join("");
  }
  const searchBox = () => `<input class="btn" id="mrQ" type="search" placeholder="Filter by policy or group…" value="${esc(view.q)}" style="min-width:220px;text-align:left" autocomplete="off" spellcheck="false">`;
  const matchQ = (P) => !view.q || lc(P.name).includes(lc(view.q)) || (P.item.assignments || []).some((a) => lc(a.name).includes(lc(view.q)));

  // ------------------------------------------------------ pane: lists --
  function policyPane(list, which) {
    const collisions = (P) => pairs.filter((pr) => M.needsAction(pr) && (which === "new" ? pr.N === P : pr.O === P));
    const retOf = (P) => retire.find((r) => r.O === P);
    const stateOk = (P) => !view.state || (view.state === "assigned" ? P.state === "assigned" : view.state === "unassigned" ? P.state !== "assigned" : collisions(P).length > 0);
    const shown = list.filter((P) => (!view.cat || P.cats.includes(view.cat)) && stateOk(P) && matchQ(P));
    const n = (f) => list.filter(f).length;
    const tb = `<div class="toolbar">${catChips(list, (P) => P.cats)}</div>
      <div class="toolbar">
        ${fchip("data-mrstate", "", "Any state", undefined, !view.state)}
        ${fchip("data-mrstate", "assigned", "Assigned", n((P) => P.state === "assigned"), view.state === "assigned")}
        ${fchip("data-mrstate", "unassigned", "Not assigned", n((P) => P.state !== "assigned"), view.state === "unassigned")}
        ${fchip("data-mrstate", "collides", "⚔️ Collides", n((P) => collisions(P).length > 0), view.state === "collides")}
        ${searchBox()}
      </div>`;
    const editable = which !== "out";
    const allOn = shown.length && shown.filter((P) => P.surface).every((P) => sel.has(P.key));
    const rows = shown.map((P) => {
      const col = collisions(P);
      const worst = col.length ? col.slice().sort((a, b) => M.VERDICT[a.reach.verdict].rank - M.VERDICT[b.reach.verdict].rank)[0] : null;
      const r = which === "old" ? retOf(P) : null;
      const pick = editable && P.surface
        ? `<input type="checkbox" data-mrpick="${esc(P.key)}"${sel.has(P.key) ? " checked" : ""} aria-label="select">`
        : editable ? `<span class="mini muted" title="This surface is not one the Assignment editor's engine writes">—</span>` : "";
      return `<tr>
        ${editable ? `<td style="width:26px">${pick}</td>` : ""}
        <td><b>${polLink(P)}</b><div class="mini muted">${genChip(P)} ${audChip(P)}${esc(P.kind)}${P.scopeWhy ? ` · <span title="In scope: ${esc(P.scopeWhy)}">${/name/.test(P.scopeWhy) ? "➕ by name" : "🔗 shares a setting"}</span>` : ""}${P.outWhy ? ` · <span title="Out of scope: ${esc(P.outWhy)} — never compared, planned or pulled in">➖ left out by name</span> <button class="btn mr-incl" type="button" data-mrinclude="${esc(P.name)}" title="Take this name off ⚙️ Leave out for this tenant — it is in scope again">➕ include</button>` : ""}${P.mdeManaged ? ` · <span title="Also delivered by MDE security settings management — device groups only, no filters">🛰 MDE-managed</span>` : ""}${P.detailError ? ` · <span style="color:var(--off)">settings unreadable</span>` : ""}</div></td>
        <td style="white-space:nowrap">${catIcons(P)}</td>
        <td class="mini">${assignChips(P)}</td>
        <td class="mini">${which === "out" ? "" : col.length
          ? `<a href="#" data-mrgo="${esc(P.key)}">${chip(M.VERDICT[worst.reach.verdict].cls, `${col.length} × ${M.VERDICT[worst.reach.verdict].label}`)}</a>`
          : `<span class="muted">none</span>`}${r ? `<div style="margin-top:4px">${chip(M.RETIRE[r.verdict].cls, M.RETIRE[r.verdict].label)}</div>` : ""}</td>
      </tr>`;
    }).join("");
    const heads = which === "new" ? "Colliding old policies" : which === "old" ? "Collides with · retirement" : "";
    const intro = {
      new: `The new set — names starting with ${cfg.newPrefixes.map((p) => `<b>${esc(p)}</b>`).join(", ")}. Tick policies and use the bar below to include a wave group (or exclude, or remove), with an assignment filter if you want one.`,
      old: "Everything MDE-related that is neither new nor out of scope. Tick old policies to add an exclusion by hand; the ⚔️ pane proposes them for you.",
      out: `Out of scope by prefix (${cfg.outPrefixes.map((p) => `<b>${esc(p)}</b>`).join(", ")}), and the ${cfg.leaveOut.length} names under ⚙️ <b>Leave out</b> (marked ➖ — <b>➕ include</b> puts one back in scope for this tenant). Listed so nothing is hidden, never compared, never proposed.`,
    }[which];
    return `${tb}
      <div class="list-card" style="margin-top:0">
        <p class="mini muted" style="margin:0 0 10px">${intro}</p>
        ${shown.length ? `<div style="overflow-x:auto"><table class="cg-table">
          <colgroup>${editable ? `<col style="width:30px">` : ""}<col style="width:34%"><col style="width:64px"><col><col style="width:20%"></colgroup>
          <thead><tr>${editable ? `<th><input type="checkbox" data-mrpickall="${which}"${allOn ? " checked" : ""} aria-label="select all shown"></th>` : ""}<th>Policy</th><th>Area</th><th>Assignments</th><th>${heads}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">Nothing matches the filters.</p>`}
      </div>`;
  }

  // -------------------------------------------------- pane: conflicts --
  const STATUS = [
    ["act", "Needs action", (p) => M.needsAction(p)],
    ["can", "⚔️ Can collide", (p) => p.type !== "duplicate" && p.reach.verdict === "can"],
    ["may", "❓ May", (p) => p.type !== "duplicate" && p.reach.verdict === "may"],
    ["staged", "⏳ Staged", (p) => p.type !== "duplicate" && p.reach.verdict === "staged"],
    ["review", "🔎 Other format", (p) => p.type === "review"],
    ["duplicate", "🟰 Same value", (p) => p.type === "duplicate"],
    ["resolved", "✅ Resolved", (p) => p.reach.verdict === "resolved"],
    ["all", "All", () => true],
  ];
  const settingLine = (d) => {
    const name = M.labelName(labels, d);
    const nv = M.labelValue(labels, d.key, d.newValue) || d.newDisplay;
    const ov = M.labelValue(labels, d.key, d.oldValue) || d.oldDisplay;
    return { name, nv: d.redacted ? d.newDisplay : nv, ov: d.redacted ? d.oldDisplay : ov };
  };
  // 🧪 one tick for every plan that puts the waves in (⚔️, ⚡①, ⚡③, the
  // bar's 🌊 Waves) — kept per tenant with the rules (10645)
  const pilotTick = () => `<label class="chk mr-piltick" title="${esc(`Pilot groups (⚙️): ${cfg.pilotGroups.join(", ") || "none"}. They come off a new policy's includes and an old policy's exclusions once every wave is in the one and out of the other — a pilot member outside a wave goes back to the old policy until their wave has them.`)}"><input type="checkbox" data-mrpilots${cfg.pilotGroupsOff ? " checked" : ""}> 🧪 take the pilot groups off</label>`;
  const canFixPair = (pr) => M.needsAction(pr) && pr.proposal && (pr.proposal.steps.some((s) => s.supported !== false) || !!(pr.proposal.includes && pr.proposal.includes.length) || !!(pr.proposal.pilots && pr.proposal.pilots.steps.length));
  function proposalHtml(pr) {
    const p = pr.proposal;
    if (!p) return "";
    const pil = p.pilots || { steps: [], kept: [] };
    const pilHtml = (side) => { const st = pil.steps.filter((x) => x.side === side), kp = pil.kept.filter((x) => x.side === side);
      return (st.length ? `<div style="margin:2px 0">${st.map((x) => chip("au-op update", `− remove ${side === "new" ? "include" : "exclusion"} ${x.groupName}`)).join(" ")} <span class="mini muted">🧪 pilot: the waves take over</span></div>` : "")
        + (kp.length ? `<div class="mini" style="color:var(--report)" title="${esc(kp.map((x) => x.why).join("\n"))}">🧪 ${esc(kp.map((x) => x.groupName).join(", "))} stay${kp.length === 1 ? "s" : ""} <span style="cursor:help">ⓘ</span></div>` : ""); };
    if (!p.steps.length && !(p.includes && p.includes.length) && !pil.steps.length) return `<span class="mini muted">${esc(p.none)}</span>${p.byWaves && p.rest && p.rest.length && !/own groups/.test(p.none) ? `<div class="mini muted">the new policy's own groups (${esc(p.rest.join(", "))}) still meet it</div>` : ""}`;
    const sub = (t) => p.byWaves ? `<div class="mr-fixsub">${t}</div>` : "";
    const newSide = pilHtml("new");
    const incl = (p.includes && p.includes.length) || newSide ? `${sub("on the new policy, in the same plan")}${(p.includes || []).map((x) => `<div style="margin:2px 0">${chip("au-op create", `+ include ${x.groupName}`)} <span class="mini muted">not in it yet</span></div>`).join("")}${newSide}` : "";
    const rest = p.byWaves && p.rest && p.rest.length ? `<div class="mini muted" style="margin-top:4px" title="Switch to 'the new policy's groups' to exclude those">the new policy's own groups (${esc(p.rest.join(", "))}) are left as they are</div>` : "";
    const oldSide = pilHtml("old");
    return (p.steps.length ? sub("on the old policy") : sub("on the old policy — every wave is out already")) + p.steps.map((s) => {
      const verb = s.action === "remove" ? "remove include" : "exclude";
      const cls = s.supported === false ? "au-op delete" : s.action === "remove" ? "au-op update" : "gu-how exc";
      const tk = [...M.effectiveTargets(pr.O, kinds).kinds].filter((k) => k !== "empty").join("/") || "unknown";
      const warn = s.supported === false ? `<div class="mini" style="color:var(--off)" title="${esc(s.why)}">✖ not supported — ${esc(s.kind)} group vs a ${esc(tk)}-targeted policy${s.missingTwin ? ` · create <a href="#" data-mrpane="waves">${esc(s.missingTwin)}</a> first` : ""} <span style="cursor:help">ⓘ</span></div>`
        : s.supported === null ? `<div class="mini" style="color:var(--report)" title="${esc(s.why)}">⚠ kind not certain <span style="cursor:help">ⓘ</span></div>` : "";
      const notes = s.notes.length ? `<div class="mini muted">${s.notes.map((n) => /^planned/.test(n) ? "planned wave" : /^twin:/.test(n) ? `twin of ${s.twinOf}` : /^target kind from/.test(n) ? "target kind from the name" : /contradiction/.test(n) ? "old policy includes it → include removed" : /MDE security settings/.test(n) ? "🛰 device groups only" : /included in the same plan/.test(n) ? "joins the new policy in this plan" : n).map((n, i) => `<span title="${esc(s.notes[i])}">${esc(n)}</span>`).join(" · ")}</div>` : "";
      return `<div style="margin:2px 0">${chip(cls, `${s.action === "remove" ? "−" : "⊘"} ${verb} ${s.groupName}`)} <span class="mini muted">${esc(s.kind)} group</span>${warn}${notes}</div>`;
    }).join("") + oldSide + incl + rest;
  }
  function conflictsPane() {
    const filt = (STATUS.find((s) => s[0] === view.status) || STATUS[0])[2];
    const counts = Object.fromEntries(STATUS.map(([id, , f]) => [id, pairs.filter(f).length]));
    const shown = pairs.filter((p) => filt(p) && (!view.cat || p.cats.includes(view.cat))
      && (!view.q || lc(p.O.name).includes(lc(view.q)) || lc(p.N.name).includes(lc(view.q))));
    const tb = `<div class="toolbar">${STATUS.map(([id, label]) => fchip("data-mrstatus", id, label, counts[id], view.status === id)).join("")}</div>
      <div class="toolbar">${catChips(pairs.filter(filt), (p) => p.cats)}${searchBox()}</div>`;
    // grouped by OLD policy — the object the fix writes to
    const groups = new Map();
    for (const pr of shown) { if (!groups.has(pr.O.key)) groups.set(pr.O.key, []); groups.get(pr.O.key).push(pr); }
    const body = [...groups.values()].map((list) => {
      const O = list[0].O;
      const fixable = list.filter(canFixPair);
      const allOn = fixable.length && fixable.every((pr) => selPairs.has(pr.id));
      const tk = [...M.targetKinds(O, kinds)].join(" + ") || "no includes";
      const head = `<tr class="mr-oldhead"><td style="width:26px">${fixable.length ? `<input type="checkbox" data-mrpairall="${esc(O.key)}"${allOn ? " checked" : ""} aria-label="select every fix on this old policy">` : ""}</td>
        <td colspan="4"><b>${polLink(O)}</b> ${genChip(O)} <span class="mini muted">${esc(O.kind)} · targets: ${esc(tk)}${O.mdeManaged ? " · 🛰 MDE-managed" : ""}</span>
        <div class="mini" style="margin-top:4px">${assignChips(O)}</div></td></tr>`;
      const rows = list.map((pr) => {
        const canFix = canFixPair(pr);
        const isOpen = open.has(pr.id);
        const lines = pr.type === "review"
          ? `<span class="mini">${pr.common.map((c) => { const m = M.catMeta(c); return `${m.icon} ${esc(m.label)}`; }).join(", ")} in both — the old one is <i>${esc(pr.O.kind)}</i>, which cannot be matched setting by setting; compare them in the portal</span>`
          : (pr.diffs.length ? pr.diffs : pr.sames).slice(0, 3).map((d) => { const s = settingLine(d); return `<div class="mini"><b>${esc(s.name)}</b>: ${esc(s.nv)} ${pr.diffs.length ? "→" : "="} ${esc(s.ov)}</div>`; }).join("")
            + ((pr.diffs.length || pr.sames.length) > 3 ? `<div class="mini muted">+${(pr.diffs.length || pr.sames.length) - 3} more</div>` : "");
        const more = pr.type !== "review" ? `<a href="#" class="mini" data-mrfold="${esc(pr.id)}">${isOpen ? "▴ less" : `▾ ${pr.diffs.length} different · ${pr.sames.length} same`}</a>` : "";
        const detail = !isOpen ? "" : `<tr><td></td><td colspan="4"><div class="ep-brief" style="margin:0">
            <div style="overflow-x:auto"><table class="cg-table mini"><thead><tr><th>Setting</th><th>New</th><th>Old</th><th></th></tr></thead><tbody>
            ${pr.diffs.concat(pr.sames).map((d) => { const s = settingLine(d); const same = pr.sames.includes(d); return `<tr><td>${esc(s.name)}</td><td>${esc(s.nv)}</td><td>${esc(s.ov)}</td><td>${same ? chip("au-op other", "same") : chip("au-op delete", "different")}</td></tr>`; }).join("")}
            </tbody></table></div>
            <p class="mini muted" style="margin:8px 0 0">New policy targets: ${assignChips(pr.N)}</p>
            <p class="mini muted" style="margin:4px 0 0">Reach: ${esc(pr.reach.why)}.</p></div></td></tr>`;
        return `<tr>
          <td>${canFix ? `<input type="checkbox" data-mrpair="${esc(pr.id)}"${selPairs.has(pr.id) ? " checked" : ""} aria-label="select this fix">` : ""}</td>
          <td class="mini">${polLink(pr.N)}<div>${catIcons(pr.N)} ${chip(M.TYPE[pr.type].cls, M.TYPE[pr.type].label)}</div></td>
          <td>${lines}${more}</td>
          <td class="mini" title="${esc(pr.reach.why)}">${chip(M.VERDICT[pr.reach.verdict].cls, M.VERDICT[pr.reach.verdict].label)}<div class="muted" style="margin-top:3px">${esc(M.VERDICT[pr.reach.verdict].short)}</div></td>
          <td>${proposalHtml(pr)}</td>
        </tr>${detail}`;
      }).join("");
      return head + rows;
    }).join("");
    const unsupported = pairs.filter((p) => M.needsAction(p) && p.proposal && p.proposal.steps.some((s) => s.supported === false)).length;
    return `${tb}
      <div class="list-card" style="margin-top:0">
        <div class="mr-fixwith"><span class="mini"><b>Proposed fix excludes:</b></span><span class="seg" role="group" aria-label="What a proposed fix excludes"><button type="button" class="${cfg.fixWith === "waves" ? "active" : ""}" data-mrfixwith="waves">🌊 the waves</button><button type="button" class="${cfg.fixWith === "groups" ? "active" : ""}" data-mrfixwith="groups">the new policy's groups</button></span>
          ${cfg.fixWith === "waves" ? `<span class="mini muted">Regions: ${esc(rollRegions ? [...rollRegions].join(" · ") || "none" : "every region")} <a href="#" data-mrpane="waves">(🌊)</a></span>${pilotTick()}` : ""}</div>
        <p class="mini muted" style="margin:0 0 6px">Old policies that set a setting a new policy sets — grouped by the old policy, because that is where the fix is written. ${cfg.fixWith === "waves"
          ? "The proposed fix takes the <b>waves</b> of the new policy's kind out of the old policy — and includes a wave in the new policy in the same plan where it is not in yet, so a wave never leaves the old policy ahead of the new one (⚡① and ⚡③ for one conflict). The new policy's own other groups are left as they are."
          : "The proposed fix excludes the <b>new policy's include groups</b> from the old policy, so those devices take the new settings alone."} Tick fixes and use the bar: <b>② Dry run</b> reads the policies fresh and shows every change before anything is written.</p>
        ${unsupported ? `<p class="mini" style="margin:0 0 6px;color:var(--off)">✖ ${plural(unsupported, "collision")} can only be fixed with an exclusion Intune does not support (user group ↔ device group). Those steps are shown, never written — create the wave's device/user twin in 🌊 (it is proposed instead once it exists), or use an assignment filter on the new policy.</p>` : ""}
        <p class="mini muted" id="mrEnrich" style="margin:0 0 6px">${enriching ? `⏳ ${esc(enriching)}` : ""}</p>
        ${shown.length ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30px"><col style="width:24%"><col style="width:30%"><col style="width:15%"><col></colgroup><thead><tr><th></th><th>New policy</th><th>Settings (new → old)</th><th>Reach</th><th>Proposed fix</th></tr></thead><tbody>${body}</tbody></table></div>`
          : `<p class="mini muted" style="margin:0">${pairs.length ? "Nothing with this status." : "No old policy sets a setting the new set sets — nothing collides."}</p>`}
      </div>`;
  }

  // ------------------------------------------------- pane: retirement --
  function retirePane() {
    const counts = {};
    retire.forEach((r) => { counts[r.verdict] = (counts[r.verdict] || 0) + 1; });
    const REACH = { can: "yes — shared targets", may: "maybe — different groups", cannot: "no", none: "no covering new policy is assigned" };
    const stOk = (r) => !view.state || (view.state === "assigned" ? r.O.state === "assigned" : r.O.state !== "assigned");
    const rows = retire.filter((r) => matchQ(r.O) && (!view.cat || r.O.cats.includes(view.cat)) && stOk(r)).map((r) => {
      const isOpen = open.has("ret|" + r.O.key);
      const detail = !isOpen || r.O.format !== "catalog" ? "" : `<tr><td colspan="5"><div class="ep-brief" style="margin:0"><div style="overflow-x:auto"><table class="cg-table mini">
        <thead><tr><th>Setting</th><th>Old value</th><th>In the new set</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr><td>${esc(M.labelName(labels, x) || x.name)}</td><td>${esc(x.oldDisplay)}</td><td>${x.news.length
          ? x.news.map((n) => `${n.same ? "✓" : "≠"} ${esc(n.name)} = ${esc(n.display)}`).join("<br>")
          : `<b style="color:var(--off)">nowhere — retiring removes this</b>`}</td></tr>`).join("")}
        </tbody></table></div></div></td></tr>`;
      return `<tr>
        <td>${chip(M.RETIRE[r.verdict].cls, M.RETIRE[r.verdict].label)}</td>
        <td><b>${polLink(r.O)}</b><div class="mini muted">${genChip(r.O)} ${esc(r.O.kind)} · ${r.O.state === "assigned" ? "assigned" : "not assigned"}</div></td>
        <td class="mini">${r.O.format === "catalog" ? `${r.same} same · ${r.diff} different · <b${r.none ? ' style="color:var(--off)"' : ""}>${r.none} missing</b>${r.rows.length ? ` · <a href="#" data-mrfold="ret|${esc(r.O.key)}">${isOpen ? "▴" : "▾"} settings</a>` : ""}` : `${plural(r.O.settingCount, "setting")} · compare by hand`}</td>
        <td class="mini">${r.covering.length ? r.covering.map((c) => polLink(c)).join("<br>") : `<span class="muted">none</span>`}</td>
        <td class="mini">${r.O.state !== "assigned" ? `<span class="muted">old one is not assigned — retiring it changes no device</span>` : esc(REACH[r.reach])}</td></tr>${detail}`;
    }).join("");
    const na = retire.filter((r) => r.O.state === "assigned").length;
    return `<div class="toolbar">${catChips(retire.map((r) => r.O), (P) => P.cats)}</div>
      <div class="toolbar">${fchip("data-mrstate", "", "Any state", undefined, !view.state)}${fchip("data-mrstate", "assigned", "Assigned — retiring changes devices", na, view.state === "assigned")}${fchip("data-mrstate", "unassigned", "Not assigned", retire.length - na, view.state === "unassigned")}${searchBox()}</div>
      <div class="list-card" style="margin-top:0">
        <p class="mini muted" style="margin:0 0 10px">Before an old policy is unassigned, every setting it carries is looked up in the new set. <b>Gap</b>: at least one setting exists in no new policy — retiring the old policy removes it from those devices. <b>Values differ</b>: the new set sets it, differently — confirm that is the intent. The last column asks whether the covering new policies reach the old policy's targets at all.</p>
        <div class="au-cards" style="margin-bottom:10px">${["gap", "differs", "manual", "covered"].map((v) => `<div class="au-card"><div class="au-card-l">${esc(M.RETIRE[v].label)}</div><div class="au-card-n ${v === "gap" && counts.gap ? "bad" : v === "covered" ? "ok" : ""}">${counts[v] || 0}</div></div>`).join("")}</div>
        ${rows ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:15%"><col style="width:27%"><col style="width:19%"><col style="width:23%"><col></colgroup><thead><tr><th>Verdict</th><th>Old policy</th><th>Its settings in the new set</th><th>Covering new policies</th><th>Do they reach its targets?</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">No old policies.</p>`}
      </div>`;
  }

  // ------------------------------------------------------ pane: waves --
  function wavesPane() {
    const rowHtml = (w) => {
      const dup = dupes.find((d) => lc(d.name) === lc(w.name));
      const status = !w.lookedUp ? `<span class="muted">not looked up</span>`
        : dup ? chip("au-op delete", `${dup.count} groups share this name`)
        : w.exists ? chip("au-op create", "exists") + (w.legacyToo.length ? `<div class="mini" style="color:var(--report)" title="Left alone — rename or delete it in Entra if it is a leftover">also a group named ${esc(w.legacyToo.join(", "))}</div>` : "")
        : w.legacy ? chip("au-op update", "old name") + `<div class="mini muted">as ${esc(w.legacy.name)}</div>` : chip("gu-how priv", "missing");
      const pick = w.legacy && !w.exists ? `<input type="checkbox" data-mrrename="${esc(w.name)}"${selRename.has(w.name) ? " checked" : ""} aria-label="rename this group">`
        : w.lookedUp && !w.exists ? `<input type="checkbox" data-mrwave="${esc(w.name)}"${selWaves.has(w.name) ? " checked" : ""} aria-label="create this group">` : "";
      const k = w.id ? kinds.get(w.id) : null;
      const members = k && (k.users != null || k.devices != null) ? `${k.users || 0} users · ${k.devices || 0} devices` : "";
      const off = w.exists && w.kind !== w.audience && (w.kind === "user" || w.kind === "device" || w.kind === "mixed");
      const aud = M.AUD[w.audience];
      const readKind = !w.exists || w.kind === w.audience ? ""
        : ` · <span${off ? ` style="color:var(--off)" title="Named for ${esc(aud.label)}s, but it holds ${esc(w.kind)} members"` : ""}>read: ${esc(w.kind)}</span>${w.kindSource && w.kindSource !== "members" ? ` <span class="muted">(${esc(w.kindSource)})</span>` : ""}`;
      const kindCell = `${aud.icon} ${esc(aud.label)}${readKind}${members ? `<div class="muted">${esc(members)}</div>` : ""}`;
      let newCell;
      if (!w.exists) newCell = "—";
      else if (w.role === "exclusion") {
        const rest = w.fits.filter((N) => N.surface && !N.reach.exc.has(w.id)).length;
        newCell = `excluded from ${w.newExcluding.length} / ${w.fits.length}${rest ? ` · <a href="#" data-mrexcl="${esc(w.name)}">exclude from the rest →</a>` : ""}`;
      } else {
        const rest = w.fits.filter((N) => N.surface && !N.reach.inc.has(w.id)).length;
        newCell = !w.fits.length && !w.newIncluding.length ? `<span class="muted">no ${esc(aud.tag)} policy in the new set</span>` : `${w.newIncluding.length} / ${w.fits.length}${rest ? ` · <a href="#" data-mrwaveinc="${esc(w.name)}">include in the rest →</a>` : ""}`;
      }
      if (w.misfit.length) newCell += `<div style="color:var(--off)" title="${esc(w.misfit.map((N) => N.name).join("\n"))}">✖ in ${plural(w.misfit.length, `${w.audience === "user" ? "device" : "user"} policy`, `${w.audience === "user" ? "device" : "user"} policies`)} — use its twin there</div>`;
      const oldCell = w.role === "exclusion" ? `<span class="muted">—</span>` : w.exists ? (w.pending.length ? (() => {
        const fixable = new Set(pairs.filter((pr) => M.needsAction(pr) && pr.N.reach.inc.has(w.id) && pr.proposal && pr.proposal.steps.some((st) => (st.groupId === w.id || st.twinOfId === w.id) && st.supported !== false)).map((pr) => pr.O.key)).size;
        return `${plural(w.pending.length, "old policy", "old policies")}${fixable ? ` · <a href="#" data-mrwavefix="${esc(w.id)}">select the ${fixable} fixable →</a>` : ""}${fixable < w.pending.length ? `<div style="color:var(--off)">${w.pending.length - fixable} need ${w.twinId ? "an assignment filter" : `${esc(w.twin)} (create it here)`}</div>` : ""}`;
      })() : `<span class="muted">none</span>`) : "—";
      return `<tr><td style="width:26px">${pick}</td>
        <td><b>${esc(w.name)}</b><div class="mini muted">${w.id ? `<code data-selall>${esc(w.id)}</code>` : ""}</div></td>
        <td>${status}</td>
        <td class="mini">${kindCell}</td>
        <td class="mini">${newCell}</td>
        <td class="mini">${oldCell}</td></tr>`;
    };
    const head = (label, sub) => `<tr class="mr-oldhead"><td colspan="6"><b>${esc(label)}</b>${sub ? ` <span class="mini muted">${esc(sub)}</span>` : ""}</td></tr>`;
    let rows = "";
    const regions = [...new Set(waveRows.filter((w) => w.role === "wave").map((w) => w.region))];
    for (const r of regions) {
      const pair = waveRows.filter((w) => w.role === "wave" && w.region === r);
      const miss = pair.filter((w) => w.lookedUp && !w.exists).length;
      rows += head(`🌊 ${r}`, miss ? `${miss} of 2 missing` : "") + pair.map(rowHtml).join("");
    }
    const excl = waveRows.filter((w) => w.role === "exclusion");
    if (excl.length) rows += head("⛔ Exclusion groups", "who stays off the new policies") + excl.map(rowHtml).join("");
    const nSel = selWaves.size;
    return `${rolloutCard()}<div class="list-card" style="margin-top:0">
      <p class="mini muted" style="margin:0 0 10px">The rollout's groups, from the ⚙️ naming rules: per region a <b>device</b> wave for the <code>- D -</code> policies and a <b>user</b> wave for the <code>- U -</code> ones, plus one device and one user <b>exclusion</b> group to exclude from the new policies. A missing one can be created here as an <b>assigned (static) security group</b> — empty, not mail-enabled, not role-assignable — the same payload T22 creates, <b>owned by you</b>: Graph does not make an admin the owner of a security group they create, so you are named owner in the create and the owners are read back. Membership is yours to fill (Entra, or 🔄 T22). Each group is looked up again by name right before it is created, so a group made meanwhile is never made twice.</p>
      <p class="mini" style="margin:0 0 10px;color:var(--report)">⚠ Intune does not exclude a user group from a policy assigned to device groups, or the reverse — it does not evaluate user-to-device relationships (Microsoft Learn, assignment support matrix). So the ⚔️ pane excludes the wave of the old policy's kind: a device-targeted old policy gets the region's device wave, even when the new policy included the user wave.</p>
      <div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30px"><col style="width:27%"><col style="width:12%"><col style="width:17%"><col style="width:20%"><col></colgroup><thead><tr><th></th><th>Group</th><th>Status</th><th>For · kind</th><th title="New policies of this group's kind (or whose name does not say) that include it — or, for an exclusion group, exclude it">New policies</th><th>Old to exclude it</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="tb-actions" style="margin-top:12px">
        <label class="chk" style="margin:0"><input type="checkbox" id="mrWaveOk"${nSel ? "" : " disabled"}> Create ${plural(nSel, "group")} in this tenant</label>
        <button class="btn primary" id="mrWaveCreate" disabled>🌊 Create the selected groups</button>
      </div>
      <p class="mini muted" style="margin:8px 0 0">Asks for Group.ReadWrite.All at this click (T22's scope). Owner: you, the signed-in admin. Description: “${esc(cfg.waveDescription)}” (waves) · “${esc(cfg.exclusionDescription)}” (exclusion groups).</p>
      ${waveRows.some((w) => w.legacy && !w.exists) ? `<div class="mr-rename">
        <p class="mini" style="margin:0 0 8px"><b>✏️ Groups under an earlier name.</b> The waves are named <code>${esc(cfg.waveDevicePrefix)}&lt;region&gt;</code> and <code>${esc(cfg.waveUserPrefix)}&lt;region&gt;</code> now, the exclusion groups <code>${esc(cfg.exclusionDevice || "—")}</code> and <code>${esc(cfg.exclusionUser || "—")}</code>; the ticked ones above are renamed in the tenant — display name and mail nickname. The object id stays, so every policy assignment and every nesting stays exactly as it is; Intune shows the new name. Undo from 📜 renames them back.</p>
        <div class="tb-actions">
          <label class="chk" style="margin:0"><input type="checkbox" id="mrRenameOk"${selRename.size ? "" : " disabled"}> Rename ${plural(selRename.size, "group")} in this tenant</label>
          <button class="btn primary" id="mrRenameGo" disabled>✏️ Rename to the new names</button>
          <a href="#" data-mrrenameall="1" class="mini">tick all ${waveRows.filter((w) => w.legacy && !w.exists).length}</a>
        </div></div>` : ""}
      <div id="mrWaveLedger"></div>
    </div>`;
  }

  // ---------------------------------------------------- pane: changes --
  function changesPane() {
    if (!runs.length) return `<div class="list-card" style="margin-top:0"><p class="mini muted" style="margin:0">Nothing written in this session yet. Every apply lands here with its backup, and can be undone from here — the undo is itself a plan, cut against the tenant as it is at that moment.</p></div>`;
    return runs.slice().reverse().map((r, i) => {
      const idx = runs.length - 1 - i;
      return `<div class="list-card" style="margin-top:${i ? 12 : 0}px">
        <h4 style="margin:0 0 4px">${esc(r.title)} <span class="mini muted">${esc(new Date(r.at).toLocaleTimeString())}</span></h4>
        <p class="mini" style="margin:0 0 6px">${r.ok} written &amp; verified · ${r.bad} not clean${r.stopped ? " · stopped early" : ""}${r.kind === "groups" || r.kind === "members" || r.kind === "rename" ? "" : ` · ${plural(r.backup.policies.length, "policy", "policies")} in the backup`}</p>
        <ul class="mini" style="margin:0 0 8px;padding-left:18px">${r.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        ${r.kind === "rename" ? (r.done && r.done.length ? `<div class="tb-actions"><button class="btn" data-mrrenback="${idx}">↶ Rename back</button></div>` : "") : r.kind === "groups" ? "" : r.kind === "members" ? (r.done && r.done.some((d) => d.type !== "create") ? `<div class="tb-actions"><button class="btn" data-mrundo="${idx}">↶ Undo this run — plan it</button></div>` : "") : `<div class="tb-actions"><button class="btn" data-mrrunbk="${idx}">⭳ Backup file</button><button class="btn" data-mrundo="${idx}">↶ Undo this run — plan it</button></div>`}
      </div>`;
    }).join("");
  }

  // ------------------------------------------------------ pane: rules --
  function rulesPane() {
    const ta = (id, list) => `<textarea id="${id}" rows="${Math.max(3, list.length + 1)}" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12.5px">${esc(list.join("\n"))}</textarea>`;
    const count = (g) => model.policies.filter((P) => P.generation === g).length;
    return `<div class="list-card" style="margin-top:0">
      <p class="mini muted" style="margin:0 0 12px">A policy's generation is read from its NAME. One prefix per line; case, spaces and dash kinds do not matter, and a prefix ends on a boundary (<code>WIN-SEC</code> does not claim <code>WIN-SECURITY</code>). Order of the verdict: out of scope first, then <code>(TO-BE-REMOVED)</code> (old, retiring), then new, then old. Kept for this tenant in this browser.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
        <label class="wi-f"><span>🎯 New set — name starts with</span>${ta("mrRuleNew", cfg.newPrefixes)}</label>
        <label class="wi-f"><span>🚫 Out of scope — name starts with</span>${ta("mrRuleOut", cfg.outPrefixes)}</label>
        <label class="wi-f"><span>🌊 Wave regions — one per line</span>${ta("mrRuleWaves", cfg.waveRegions)}</label>
      </div>
      <p class="mini muted" style="margin:14px 0 6px"><b>👥 Wave members.</b> Countries per region, one region per line: <code>Euro: *NL-Breda, GB, BE, NL</code> — a <b>*</b> marks a pilot, which leads its wave. A suffix is the end of the country user group's name; two letters map to ISO3 for the device group, anything else needs a line under the suffixes.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
        <label class="wi-f"><span>Country user groups start with</span><input id="mrRuleCtyPre" value="${esc(mcfg().countryPrefix)}"></label>
        <label class="wi-f"><span>Device groups start with</span><input id="mrRuleDgrpPre" value="${esc(mcfg().deviceGroupPrefix)}"></label>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-top:10px">
        <label class="wi-f"><span>🌍 Countries per region</span><textarea id="mrRuleMap" rows="${Math.max(4, mcfg().countryMap.length + 1)}" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12.5px">${esc(MdeMembers.formatMap(mcfg().countryMap, mcfg().pilots))}</textarea></label>
        <label class="wi-f"><span>Device-group suffix per non-ISO2 suffix</span><textarea id="mrRuleSfx" rows="${Math.max(4, Object.keys(mcfg().deviceSuffixes).length + 1)}" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12.5px">${esc(MdeMembers.formatOverrides(mcfg().deviceSuffixes))}</textarea></label>
      </div>
      <label class="wi-f" style="margin-top:12px"><span>➕ Also in the target list — exact policy names, one per line. They are in scope although nothing in them is an MDE area, and an old policy that sets one of their settings is pulled in too.</span>${ta("mrRuleAlso", cfg.alsoInScope)}</label>
      <label class="wi-f" style="margin-top:12px"><span>➖ Leave out of the target list — exact policy names, one per line. They are out of scope (🚫) whatever their prefix or content: never compared, planned or pulled in by a shared setting. A name in both lists is left out.</span>${ta("mrRuleLeave", cfg.leaveOut)}</label>
      <label class="wi-f" style="margin-top:12px"><span>🧪 Pilot groups — exact group names, one per line. With the 🧪 tick on (⚔️ and ⚡), they come off a new policy's includes and an old policy's exclusions once every wave is in the one and out of the other.</span>${ta("mrRulePilots", cfg.pilotGroups)}</label>
      <p class="mini muted" style="margin:12px 0 6px">Each region is a PAIR: the device wave (prefix + region) for the <code>- D -</code> policies and the user wave for the <code>- U -</code> ones. Now: ${cfg.groups.filter((g) => g.role === "wave").map((g) => `<code>${esc(g.name)}</code>`).join(" ")}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
        <label class="wi-f"><span>🖥 Device wave prefix</span><input id="mrRuleDgPre" value="${esc(cfg.waveDevicePrefix)}"></label>
        <label class="wi-f"><span>👤 User wave prefix</span><input id="mrRuleUgPre" value="${esc(cfg.waveUserPrefix)}"></label>
        <label class="wi-f"><span>⛔🖥 Device exclusion group</span><input id="mrRuleExD" value="${esc(cfg.exclusionDevice)}"></label>
        <label class="wi-f"><span>⛔👤 User exclusion group</span><input id="mrRuleExU" value="${esc(cfg.exclusionUser)}"></label>
      </div>
      <label class="wi-f" style="margin-top:12px"><span>Description for a wave group this tool creates</span><input id="mrRuleDesc" value="${esc(cfg.waveDescription)}"></label>
      <label class="wi-f" style="margin-top:12px"><span>Description for an exclusion group this tool creates</span><input id="mrRuleExDesc" value="${esc(cfg.exclusionDescription)}"></label>
      <div class="tb-actions" style="margin-top:12px">
        <button class="btn primary" id="mrRuleSave">Save and re-sort</button>
        <button class="btn" id="mrRuleReset">Back to the defaults</button>
      </div>
      <p class="mini muted" id="mrRuleMsg" style="margin:8px 0 0">${esc(ruleSaved)}Now: ${count("new")} new · ${count("old")} old · ${count("retiring")} TO-BE-REMOVED · ${count("out")} out of scope.</p>
    </div>`;
  }

  function howPane() {
    return `<div class="list-card" style="margin-top:0"><div class="mini" style="line-height:1.55">
      <p style="margin:0 0 8px"><b>The read.</b> The shared policy read (settings catalog, legacy endpoint security intents, device configurations, administrative templates) — the same one T05, T11, T19 and T26 use — plus the legacy templates' names, the wave groups by name, and each involved group's kind. In scope is what 🧭 T20 classifies as endpoint security, MDE or Edge, plus any policy setting an MDE-area setting (BitLocker, WHfB, App Control…), and custom OMA-URIs under those CSPs. Opening the tool reads nothing: it offers ↻ Read the tenant, and the sign-in read when TUNO already holds one.</p>
      <p style="margin:0 0 8px"><b>Collisions.</b> A new and an old policy collide when both set the same setting (the settingDefinitionId; ASR per rule — a one-rule WIN-SEC policy meets that rule inside an old all-rules policy, including the old "guid=mode" string form). <b>Different value</b> is a conflict Intune reports on the device and resolves by applying neither; <b>same value</b> is double management, harmless until one side changes. A legacy template or ADMX cannot be compared setting by setting and meets the new set by category (<b>other format</b>). Reach is 🔗 T12's verdict — <b>can</b> (shared group or tenant-wide), <b>may</b> (different groups, or a filter), plus <b>staged</b> (the new policy is not assigned yet) and <b>resolved</b> (every group the new policy includes is already excluded from the old one).</p>
      <p style="margin:0 0 8px"><b>The fix.</b> Exclude the new policy's include groups from the old policy. Where the old policy already includes that group, the include is removed instead (an exclusion on an include is a contradiction). Where the new policy is not assigned yet, the existing wave groups of its kind are proposed (a <code>- D -</code> policy's device waves, a <code>- U -</code> policy's user waves), marked planned. Where a wave would be excluded from an old policy of the OTHER kind — Intune's unsupported user ↔ device mix — the same region's twin is proposed instead, and excluding the twin counts as resolved.</p>
      <p style="margin:0 0 8px"><b>Wave members</b> (👥 pane). The country user groups are nested in the user wave of their region, from the country table under ⚙️. One assigned device group per country (<code>INT-SG-D-&lt;ISO3&gt;</code>) holds the Windows devices whose Intune primary user is in that country group; it is nested in the device wave. Every read shows what the device group is missing and what no longer belongs. Devices with no primary user are counted, not guessed.</p>
      <p style="margin:0 0 8px"><b>Left out</b> (👥 → 🕳). The Windows devices the waves do not reach — the count — and, listed but not counted, a country's users with no Windows device by Intune primary user: they are in the user wave through their country group (the list says so, or that the group is not nested yet), the card says which other devices Intune has for them, and a Windows device they get later joins the country device group at the next 👥 read → Apply. The devices counted: a country's devices with no Entra object or in the device exclusion group, and — for the whole tenant — the Windows devices whose primary user is in no country group of the table, or who have none. A country row's "N users have none" opens it on that country; the CSV has everyone.</p>
      <p style="margin:0 0 8px"><b>Pilot members</b> (👥 → 🧪). Every direct member of the pilot groups (⚙️) with the wave its country puts it in — a device by its Intune primary user's country group, a user by their own — and where it stands: ✓ in that wave now (a device through its country device group, nested in the device wave; a user through the country group nested in the user wave, or put in directly by a pilot batch), ⏳ not yet (with what is missing), or ✗ no wave. Only ✓ members can leave the pilot: the plan only removes, each member's wave is read fresh before the plan and again before the write, and one no longer in it is left in the pilot. <b>The policy check</b> blocks a wave where a new policy includes the pilot group but not the wave, or an old policy excludes the pilot group but not the wave (or its twin) — leaving would lose a new policy or gain an old one — and names the policy.</p>
      <p style="margin:0 0 8px"><b>Exclusions</b> (⊘ pane, or the header button). Search a user or a device: a user comes with their Windows devices (Intune primary user), a device with its primary user, and each with what reaches it — the in-scope policies whose groups include it and do not exclude it (an exclusion wins over an include of the same kind; assignment filters are not evaluated). Users go into the user exclusion group (the <code>- U -</code> policies), devices into the device one (the <code>- D -</code> policies). Because ⚡③ takes the waves out of the old policies, an excluded wave device would get neither set, so it is also taken out of its country device group: it leaves the wave, the old policies reach it again, and 👥 keeps it out. A user cannot leave a dynamic country group; the card says what that leaves. <b>Excluded now</b> lists both groups and flags a user whose recent device is not excluded (half).</p>
      <p style="margin:0 0 8px"><b>Also in the target list.</b> Policies named under ⚙️ are in scope although nothing in them is an MDE area — the OIB Device Security and Windows Update for Business policies. An old settings-catalog policy that sets one of their settings is pulled in, so its conflict shows. <b>Left out</b> works the other way: a name there is out of scope (🚫, marked ➖) whatever its prefix or content, and nothing pulls it back in.</p>
      <p style="margin:0 0 8px"><b>The rollout actions</b> (🌊 pane) are the same writes in bulk: ① every existing wave into each new policy of its kind, ② the exclusion group of the kind each new policy is assigned to, ③ the fixes above restricted to waves. Each is one plan — fresh read, backup, confirm, read-back, undo — and lists what it left out and why. In 🎯 and 🗄, the bar's <b>🌊 Waves</b> target does ① or ③ for the ticked policies only: each gets the waves of its kind, in the ticked regions.</p>
      <p style="margin:0 0 8px"><b>🧪 Pilots</b> (the tick in ⚔️ and ⚡, the names under ⚙️). When a plan completes the swap — every wave of the kind in the new policy and out of the old one — the pilot groups come off both: the new policy's pilot includes and the old policy's pilot exclusions, in the same plan. A pilot member in a wave keeps the new policy through the wave; one outside a wave is back on the old policy until their wave has them. A side that cannot go yet stays, with the reason: a new policy keeps a pilot while an old policy it collides with still excludes it (else neither), and an old policy keeps a pilot exclusion while a new policy it collides with still includes it (else both).</p>
      <p style="margin:0 0 8px"><b>What is refused.</b> Intune does not support excluding user groups from a policy assigned to device groups, or the reverse — "Intune doesn't evaluate user-to-device group relationships" (<a href="https://learn.microsoft.com/intune/device-configuration/assign-device-profile#exclude-groups-from-a-policy-assignment" target="_blank" rel="noopener">Microsoft Learn: Assign policies — support matrix</a>). Such a step is shown with its reason and never written. Devices managed by <b>MDE security settings management</b> (not enrolled in Intune) take assignments by device group only, and assignment filters do not apply to them (<a href="https://learn.microsoft.com/defender-endpoint/endpoint-security-policies-configure" target="_blank" rel="noopener">Learn</a>) — flagged as 🛰.</p>
      <p style="margin:0 0 8px"><b>The write.</b> ✏️ T11's engine: a dry run reads every touched policy fresh; ③ the backup file is taken before ④ Apply unlocks; each policy is re-read at apply time and skipped as drifted if somebody changed it meanwhile; every write is read back. Each run lands in 📜 Changes this session with its backup and an undo. Settings are never changed — only assignments, and only by this plan.</p>
      <p style="margin:0"><b>Temporary.</b> Built for one rollout, beta only, never promoted — listed under Help's "Staying on this channel".</p>
    </div></div>`;
  }

  // ------------------------------------------------------------ render --
  function render() {
    if (!model) return;
    $("mrRun").disabled = running || !!reps.busy || mem.loading;
    const missing = model.missing.length ? `<div class="list-card" style="margin-top:0;margin-bottom:12px"><p class="mini" style="margin:0;color:var(--report)">⚠ Not in this read: ${model.missing.map((m) => `${esc(m.id)} (${esc(m.error)})`).join("; ")} — policies there are not listed or compared.</p></div>` : "";
    const src = PolicyCache.get() === res ? `From ${PolicyCache.fromSignIn() ? "the sign-in read" : "the shared read"} at ${esc(PolicyCache.timeLabel())}. ` : "";
    const head = `<p class="mini muted" style="margin:0 0 10px">${src}${model.newP.length} new · ${model.oldP.length} old · ${model.outP.length} out of scope. An assignment is a target, not proof a device applied the setting.</p>`;
    let main;
    if (pane === "new") main = policyPane(model.newP, "new");
    else if (pane === "old") main = policyPane(model.oldP, "old");
    else if (pane === "out") main = policyPane(model.outP, "out");
    else if (pane === "retire") main = retirePane();
    else if (pane === "waves") main = wavesPane();
    else if (pane === "members") main = membersPane();
    else if (pane === "exclusions") main = exclusionsPane();
    else if (pane === "reports") main = reportsPane();
    else if (pane === "changes") main = changesPane();
    else if (pane === "rules") main = rulesPane();
    else if (pane === "how") main = howPane();
    else main = conflictsPane();
    // The plan panel is ONE node, kept across renders and re-seated under the
    // pane — a pane switch or a filter keystroke must not throw a half-made
    // plan (or a running ledger) away, and it belongs in the main column,
    // not under the rail.
    const pl = planEl();
    if (pl) pl.remove();
    $("mrGlobalExport").hidden = pane === "reports";
    if ($("mrExclude")) $("mrExclude").hidden = false;
    $("mrBody").innerHTML = `<div class="ep-wrap"><div class="ep-rail mr-navigation">${railHtml()}</div><div class="ep-main">${missing}${pane === "reports" ? "" : head}${main}<div id="mrPlanSeat"></div></div></div>`;
    if (pl) seatPlan(pl);
    syncSelbar();
  }

  // ------------------------------------------------------------ selbar --
  const barMode = () => (pane === "conflicts" ? "fixes" : (pane === "new" || pane === "old") ? "policies" : null);
  function syncSelbar() {
    const bar = $("mrSelbar");
    if (!bar) return;
    const mode = barMode();
    const n = mode === "fixes" ? selPairs.size : mode === "policies" ? [...sel].filter((k) => model && model.byKey.has(k)).length : 0;
    bar.classList.toggle("visible", !!model && !!mode && n > 0);
    $("mrSelCount").textContent = mode === "fixes" ? `${plural(n, "fix", "fixes")} selected` : `${plural(n, "policy", "policies")} selected`;
    $("mrBarPolicies").style.display = mode === "policies" ? "contents" : "none";
    $("mrBarFixes").style.display = mode === "fixes" ? "" : "none";
    const act = barAction(), tgt = barTarget();
    // 10645: the fixes take no typed group. The box is the policy actions'
    // (it keeps what was typed there), and in the fixes it used to REPLACE
    // every proposal and drop the "+ include" half: Mihai's LAPS dry run
    // excluded INT-SG-D-WAVE-BAMSCA only, ahead of the new policy.
    $("mrGroup").style.display = mode === "policies" && tgt === "group" ? "" : "none";
    const wv = $("mrBarWaves");
    if (wv) { wv.style.display = mode === "policies" && tgt === "waves" ? "" : "none"; wv.textContent = `each policy's kind · ${rollRegions ? [...rollRegions].join(", ") || "no region" : "every region"}`; }
    $("mrGroup").placeholder = "Group name or object ID…";
    if (mode === "fixes") $("mrBarFixes").textContent = fixSummary();
    const filterable = mode === "policies" && act !== "remove";
    $("mrFilterSel").style.display = filterable ? "" : "none";
    $("mrFilterMode").style.display = filterable && $("mrFilterSel").value ? "" : "none";
    $("mrDryRun").textContent = mode === "fixes" ? "② Dry run the fixes" : "② Dry run";
    if (filterable && filterList === null) loadFilters();
  }
  const barAction = () => { const b = document.querySelector("#mrActSeg [data-mract].active"); return b ? b.dataset.mract : "add-include"; };
  const barTarget = () => { const b = document.querySelector("#mrTargetSeg [data-mrtarget].active"); return b ? b.dataset.mrtarget : "group"; };
  async function loadFilters() {
    filterList = [];
    try {
      filterList = await Filters.list();
      AssignEdit.setFilterNames(filterList);
      $("mrFilterSel").innerHTML = `<option value="">No filter</option>` + filterList.slice()
        .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)))
        .map((f) => `<option value="${esc(f.id)}">${esc(f.displayName)} (${esc(Filters.platformLabel(f.platform))})</option>`).join("");
    } catch { /* the bar keeps "No filter" */ }
  }
  function setSeg(segId, attr, val) {
    [...$(segId).querySelectorAll(`[${attr}]`)].forEach((b) => b.classList.toggle("active", b.getAttribute(attr) === val));
  }

  // ---------------------------------------------------------- dry run --
  // A plan belongs to the pane it was made on (10647, Mihai: "fix the
  // layout when going to help, the plan below shouldn't be there"): on
  // another pane it is hidden, not dropped — it is back on return.
  let planPane = null;
  function clearPlan() { plan = null; backupTaken = false; planPane = pane; if (planEl()) planEl().innerHTML = ""; }
  function planError(msg) { planEl().innerHTML = `<div class="list-card" style="margin-top:12px;padding:16px 18px"><div class="gu-fail"><b>${esc(msg)}</b></div></div>`; }
  // Seat the plan node under the card that made it (planAnchor) when that
  // card is on screen, else under the pane. Called by render() and by the
  // launchers before their first progress line, so "reading…" shows there.
  function seatPlan(node) {
    const pl = node || planEl();
    if (!pl) return;
    pl.style.display = planPane && planPane !== pane ? "none" : "";
    const a = planAnchor ? document.getElementById(planAnchor) : null;
    if (a && $("mrBody").contains(a)) a.after(pl);
    else if ($("mrPlanSeat")) $("mrPlanSeat").appendChild(pl);
  }
  // Scroll the plan's heading into view below the sticky header AND the
  // pane's own sticky toolbar (👥's region chips), which would cover it.
  const showPlan = () => {
    const pl = planEl();
    if (!pl || !pl.scrollIntoView) return;
    let nav = 106;
    try { nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sticky-nav")) || 106; } catch { /* the default */ }
    const tb = $("mrBody") ? $("mrBody").querySelector(".toolbar") : null;
    const extra = tb && tb.getBoundingClientRect ? tb.getBoundingClientRect().height : 0;
    pl.style.scrollMarginTop = `${Math.round(nav + extra + 12)}px`;
    pl.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  async function dryRun() {
    if (busy || !model) return;
    busy = true; planAnchor = null; clearPlan(); seatPlan();
    try {
      const mode = barMode();
      if (mode === "fixes") await dryRunFixes();
      else if (mode === "policies") await dryRunPolicies();
    } catch (e) { planError(GroupUse.shortErr(e, 300)); }
    finally { busy = false; }
  }

  async function dryRunPolicies() {
    const pols = [...sel].map((k) => model.byKey.get(k)).filter((P) => P && P.surface);
    if (!pols.length) throw new Error("Tick at least one policy.");
    const action = barAction(), tgt = barTarget();
    if (tgt === "waves") return dryRunPolicyWaves(pols, action);
    let group, members = null, gk = null;
    if (tgt === "group") {
      await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
      const g = await GroupUse.resolveGroup($("mrGroup").value);
      group = { id: g.id, displayName: g.displayName, membershipRule: g.membershipRule };
      names.set(lc(g.id), g.displayName);
      members = await GroupUse.memberCount(g.id);
      kinds = await M.readKinds([g.id], null, kinds);
      gk = kinds.get(lc(g.id));
    } else {
      if (action === "add-exclude") throw new Error("Graph has no tenant-wide exclusion — an exclusion names a group.");
      group = { id: "", displayName: tgt === "allDevices" ? "All devices" : "All users", tenantWide: tgt };
    }
    const filter = action !== "remove" && $("mrFilterSel").value ? { id: $("mrFilterSel").value, mode: $("mrFilterMode").value } : null;
    const fresh = await M.readFresh(pols, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
    const steps = [], unread = [];
    for (const P of pols) {
      const f = fresh.get(`${P.surface}|${lc(P.id)}`);
      if (!f) { unread.push(P.name); continue; }
      const notes = [];
      if (action === "add-exclude" && gk) {
        const s = M.exclusionSupport(gk.kind, M.effectiveTargets(P, kinds).kinds);
        if (s.ok === false) notes.push(`✖ ${s.why}`);
        else if (s.ok === null) notes.push(`⚠ ${s.why}`);
      }
      // a "- D -" policy given a user group (or the reverse) — allowed, but
      // not the wave it was named for (10633)
      const tkind = tgt === "allDevices" ? "device" : tgt === "allUsers" ? "user" : gk && (gk.kind === "user" || gk.kind === "device") ? gk.kind : null;
      if (action === "add-include" && P.audience && tkind && tkind !== P.audience) notes.push(`⚠ a ${P.audience} policy by its name (${M.AUD[P.audience].tag}) given a ${tkind} ${tgt === "group" ? "group" : "target"} — the ${P.audience} wave is the one meant for it`);
      if (P.mdeManaged && (tgt === "allUsers" || (gk && gk.kind === "user"))) notes.push("🛰 MDE security settings management honours device groups only");
      if (P.mdeManaged && filter) notes.push("🛰 assignment filters do not apply to MDE-managed devices");
      steps.push({ policy: f, action, group, filter, note: notes.join(" · ") });
    }
    const p = M.composePlan(steps);
    const word = { "add-include": "Include", "add-exclude": "Exclude", remove: "Remove" }[action];
    plan = Object.assign(p, {
      title: `${word} ${group.displayName}${filter ? " (with a filter)" : ""} — ${plural(pols.length, "policy", "policies")}`,
      head: { tool: "TUNO T28 MDE rollout", action, group: { id: group.id, name: group.displayName } },
      memberLine: group.tenantWide ? `<b>the whole tenant</b> — every ${group.tenantWide === "allDevices" ? "managed device" : "licensed user"}, now and later`
        : members == null ? "member count unknown" : `${members} direct member${members === 1 ? "" : "s"}${gk ? ` · ${gk.kind} group` : ""}${group.membershipRule ? " · dynamic" : ""}`,
      unread, skipped: [],
    });
    renderPlan();
  }

  // 🌊 Waves as the bar's target (10645, Mihai: "the option to add or
  // exclude the waves beside a single group"): each ticked policy gets the
  // waves of ITS kind — a - D - policy the device waves, a - U - one the user
  // waves — in the regions ticked in 🌊. Including them in a new policy, or
  // taking them out of an old one, can complete the swap: the 🧪 pilots then
  // come off both sides, as in ⚡① and ⚡③.
  async function dryRunPolicyWaves(pols, action) {
    await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
    const filter = action !== "remove" && $("mrFilterSel").value ? { id: $("mrFilterSel").value, mode: $("mrFilterMode").value } : null;
    const inRegion = (r) => !rollRegions || rollRegions.has(r);
    const wants = [], skipped = [], used = new Set();
    for (const P of pols) {
      const k = M.policyKind(P, kinds);
      if (!k.kind) { skipped.push(`${P.name}: its name says neither "- D -" nor "- U -" and its targets do not say either (${k.source}) — use a single group`); continue; }
      for (const g of model.cfg.groups.filter((x) => x.role === "wave" && x.audience === k.kind && inRegion(x.region))) {
        const hit = found && found.get(lc(g.name));
        if (!hit || !hit.id) { skipped.push(`${g.name} does not exist — create it in 🌊 first`); continue; }
        const id = lc(hit.id);
        if (action === "add-include" && P.reach.inc.has(id)) continue;
        if (action === "add-exclude" && P.reach.exc.has(id)) continue;
        if (action === "remove" && !P.reach.inc.has(id) && !P.reach.exc.has(id)) continue;
        const notes = [];
        if (action === "add-exclude") {
          const s = M.exclusionSupport(k.kind, M.effectiveTargets(P, kinds).kinds);
          if (s.ok === false) { skipped.push(`${P.name} ⊘ ${g.name}: ${s.why}`); continue; }
          if (s.ok === null) notes.push(`⚠ ${s.why}`);
          if (P.reach.inc.has(id)) { skipped.push(`${P.name} ⊘ ${g.name}: it INCLUDES the wave — an exclusion on top would be a contradiction; use Remove`); continue; }
        }
        if (P.mdeManaged && filter) notes.push("🛰 assignment filters do not apply to MDE-managed devices");
        if (k.source === "targets") notes.push(`${k.kind} policy by its targets`);
        wants.push({ P, groupId: id, groupName: hit.displayName || g.name, action, filter, note: notes.join(" · ") });
        used.add(hit.displayName || g.name);
      }
    }
    let pilots = { steps: [], kept: [] };
    if (action !== "remove" && model.cfg.pilotGroupsOff !== false) {
      pilots = M.pilotsFor(wants.concat(pols.map((P) => ({ P, groupId: "", action: "none" }))), Object.assign(rolloutCtx(), { cfg: model.cfg }), true);
      for (const st of pilots.steps) if (!wants.some((x) => x.P === st.P && x.groupId === st.groupId && x.action === "remove")) wants.push({ P: st.P, groupId: st.groupId, groupName: st.groupName, action: "remove", filter: null, note: st.note, pilot: true });
    }
    const uniqSkip = [...new Set(skipped)].concat(pilots.kept.map((k) => `🧪 ${k.why}`));
    if (!wants.length) { plan = null; planError(`Nothing to do: the waves are already ${action === "add-include" ? "in" : action === "add-exclude" ? "excluded from" : "off"} these policies${uniqSkip.length ? ". Left out: " + uniqSkip.join(" · ") : ""}.`); return; }
    const targets = [...new Map(wants.map((x) => [x.P.key, x.P])).values()];
    const fresh = await M.readFresh(targets, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
    const steps = [], unread = [];
    for (const x of wants) {
      const f = fresh.get(`${x.P.surface}|${lc(x.P.id)}`);
      if (!f) { if (!unread.includes(x.P.name)) unread.push(x.P.name); continue; }
      steps.push({ policy: f, action: x.action, group: { id: x.groupId, displayName: x.groupName }, filter: x.filter || null, note: x.note });
    }
    const p = M.composePlan(steps);
    const word = { "add-include": "Include", "add-exclude": "Exclude", remove: "Remove" }[action];
    const regions = rollRegions ? [...rollRegions] : null;
    plan = Object.assign(p, {
      title: `${word} the waves${regions ? ` (${regions.join(", ")})` : ""} — ${plural(pols.length, "policy", "policies")}${pilots.steps.length ? `, ${plural(pilots.steps.length, "pilot assignment")} off` : ""}`,
      head: { tool: "TUNO T28 MDE rollout", action: `${action}-waves`, regions: regions || "all", groups: [...used] },
      memberLine: `${plural(used.size, "wave group")}: ${[...used].map(esc).join(", ")}`,
      unread, skipped: uniqSkip, skippedTitle: "Left out, with the reason:",
    });
    renderPlan();
  }

  // The fixes' writes, one entry per (policy, group, action): two new
  // policies that ask for the same exclusion on the same old policy ask
  // once. In waves mode the pilots come off where the plan completes the
  // swap (10645) — worked out over the whole selection, not pair by pair.
  function fixWants(chosen) {
    const want = new Map(), skipped = [];
    for (const pr of chosen) {
      const O = pr.O, N = pr.N;
      if (!O.surface) { skipped.push(`${O.name}: not a surface the engine writes`); continue; }
      const incs = pr.proposal.includes || [];
      if (incs.length && !N.surface) { skipped.push(`${N.name}: not a surface the engine writes — its waves are not included, so they are not excluded from ${O.name} either`); continue; }
      for (const s of pr.proposal.steps) {
        if (s.supported === false) { skipped.push(`${O.name} ⊘ ${s.groupName}: ${s.why}`); continue; }
        const k = `${O.key}|${s.groupId}|${s.action}`;
        if (!want.has(k)) want.set(k, { O, groupId: s.groupId, groupName: s.groupName, action: s.action, note: [s.supported === null ? `⚠ ${s.why}` : "", ...s.notes].filter(Boolean).join(" · ") });
      }
      // 🌊 waves mode: the wave into the new policy in the same plan (10643)
      for (const x of incs) {
        const k = `${N.key}|${x.groupId}|add-include`;
        if (!want.has(k)) want.set(k, { O: N, groupId: x.groupId, groupName: x.groupName, action: "add-include", note: `the wave into the new policy — it leaves ${O.name} in the same plan` });
      }
    }
    let pilots = { steps: [], kept: [] };
    if (cfg.fixWith === "waves" && model.cfg.pilotGroupsOff !== false) {
      const touch = chosen.flatMap((pr) => [{ P: pr.N, groupId: "", action: "none" }, { P: pr.O, groupId: "", action: "none" }]);
      pilots = M.pilotsFor([...want.values()].map((x) => ({ P: x.O, groupId: x.groupId, action: x.action })).concat(touch),
        { cfg: model.cfg, kinds, twins: M.twinIndex(model.cfg, found), names, found, pairs }, false);
      for (const st of pilots.steps) {
        const k = `${st.P.key}|${st.groupId}|remove`;
        if (!want.has(k)) want.set(k, { O: st.P, groupId: st.groupId, groupName: st.groupName, action: "remove", note: st.note, pilot: true });
      }
    }
    return { want, skipped, pilots };
  }
  // what the bar's dry run will do, said in the bar (10645)
  function fixSummary() {
    if (!model) return "";
    const chosen = pairs.filter((pr) => selPairs.has(pr.id));
    if (!chosen.length) return "";
    const xs = [...fixWants(chosen).want.values()];
    const outs = xs.filter((x) => !x.pilot && x.action !== "add-include"), ins = xs.filter((x) => x.action === "add-include"), pil = xs.filter((x) => x.pilot);
    const pols = (list) => new Set(list.map((x) => x.O.key)).size;
    const parts = [];
    if (outs.length) parts.push(`${plural(outs.length, "group")} out of ${plural(pols(outs), "old policy", "old policies")}`);
    if (ins.length) parts.push(`${plural(ins.length, "wave")} into ${plural(pols(ins), "new policy", "new policies")}`);
    if (pil.length) parts.push(`🧪 ${plural(pil.length, "pilot assignment")} off`);
    return parts.length ? `→ ${parts.join(" · ")}` : "→ nothing writable in this selection";
  }
  async function dryRunFixes() {
    const chosen = pairs.filter((pr) => selPairs.has(pr.id));
    if (!chosen.length) throw new Error("Tick at least one fix.");
    await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
    const { want, skipped, pilots } = fixWants(chosen);
    const olds = [...new Map([...want.values()].map((x) => [x.O.key, x.O])).values()];
    if (!olds.length) { plan = null; planError(`Nothing writable in this selection.${skipped.length ? " Skipped: " + skipped.join(" · ") : ""}`); return; }
    const fresh = await M.readFresh(olds, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
    const steps = [], unread = [];
    for (const x of want.values()) {
      const f = fresh.get(`${x.O.surface}|${lc(x.O.id)}`);
      if (!f) { if (!unread.includes(x.O.name)) unread.push(x.O.name); continue; }
      steps.push({ policy: f, action: x.action, group: { id: x.groupId, displayName: x.groupName }, filter: null, note: x.note });
    }
    const p = M.composePlan(steps);
    const kept = pilots.kept.map((k) => `🧪 ${k.why}`);
    plan = Object.assign(p, {
      title: `Fix ${plural(chosen.length, "collision")} — ${plural(olds.length, "policy", "policies")}${cfg.fixWith === "waves" ? ", with the waves" : ""}${pilots.steps.length ? `, ${plural(pilots.steps.length, "pilot assignment")} off` : ""}`,
      head: { tool: "TUNO T28 MDE rollout", action: "fix-collisions", pairs: chosen.map((pr) => ({ newPolicy: pr.N.name, oldPolicy: pr.O.name })) },
      memberLine: "", unread, skipped: skipped.concat(kept),
      skippedTitle: kept.length ? "Not in the plan, with the reason:" : undefined,
    });
    renderPlan();
  }

  const STEP_WORD = { "add-include": "include", "add-exclude": "exclude", remove: "remove", restore: "restore" };
  function renderPlan() {
    const p = plan;
    const stepHtml = (o) => o.details.map((d) => {
      const cls = d.change === "modify" ? (d.action === "remove" ? "au-op update" : "au-op create") : d.change === "refused" ? "au-op delete" : "au-op other";
      const word = d.change === "modify" ? STEP_WORD[d.action] : d.change === "refused" ? "refused" : "no change";
      return `<div>${chip(cls, `${word} ${d.group.displayName || ""}${d.filter ? " ⚑" : ""}`)}${d.reason ? ` <span class="mini muted">${esc(d.reason)}</span>` : ""}${d.note ? `<div class="mini" style="color:var(--report)">${esc(d.note)}</div>` : ""}</div>`;
    }).join("");
    const row = (o) => `<tr><td><b>${esc(o.policy.name)}</b></td><td class="mini">${esc(o.policy.surfaceLabel)}</td><td>${stepHtml(o)}</td><td class="mini" style="white-space:nowrap">${o.before.length} → ${o.after.length}</td></tr>`;
    const removal = p.hasRemoval;
    planEl().innerHTML = `<div class="list-card" style="margin-top:14px;padding:16px 18px">
      <h4 style="margin:0 0 6px">② Plan — ${esc(p.title)}</h4>
      <p class="mini" style="margin:0 0 8px"><b>${plural(p.changes.length, "policy", "policies")}</b> will change${p.memberLine ? ` · ${p.memberLine}` : ""}. ${p.noops.length ? `${p.noops.length} already as asked.` : ""} ${p.refused.length ? `<b>${p.refused.length} refused</b> — see the reasons.` : ""}</p>
      ${p.skipped.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>${esc(p.skippedTitle || "Not in the plan — Intune does not support these exclusions:")}</b><span class="why">${p.skipped.map(esc).join("<br>")}</span></div>` : ""}
      ${p.unread.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>Could not read the current assignments of:</b><span class="why">${p.unread.map(esc).join(", ")} — left out rather than written blind.</span></div>` : ""}
      <div style="overflow-x:auto"><table class="cg-table"><thead><tr><th>Policy</th><th>Surface</th><th>Steps</th><th>Assignments</th></tr></thead><tbody>
        ${p.changes.map(row).join("")}${p.refused.map(row).join("")}${p.noops.map(row).join("")}
      </tbody></table></div>
      <p class="mini muted" style="margin:8px 0 0">The assign call replaces a policy's whole list — everything untouched is re-sent exactly as read, filters included. Each policy is re-read at apply time; one that changed since this dry run is skipped as drifted, not overwritten.</p>
      ${p.changes.length ? `<div style="margin-top:12px">
        <div class="tb-actions"><button class="btn" id="mrBackup">③ ⭳ Take the backup <span class="mini">— the current assignments, as a file</span></button></div>
        ${removal ? `<label class="wi-f" style="margin-top:8px"><span>This plan REMOVES assignments — type <b>REMOVE</b> to allow it</span><input id="mrConfirmText" placeholder="REMOVE" autocomplete="off" spellcheck="false"></label>`
          : `<label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="mrConfirmTick"> I have read the plan — ${plural(p.changes.length, "policy", "policies")}</label>`}
        <label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin:8px 0 0 14px"><input type="checkbox" id="mrStop" checked> Stop at the first failure</label>
        <div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="mrApply" disabled>④ Apply — write to the tenant</button><button class="btn" id="mrDiscard">Discard the plan</button></div>
        <p id="mrGate" class="mini muted" style="margin:8px 0 0">Take the backup, confirm, apply. Apply stays locked until both.</p>
      </div>` : `<div class="tb-actions" style="margin-top:10px"><button class="btn" id="mrDiscard">Close</button></div>`}
      <div id="mrLedger"></div>
    </div>`;
    const upd = () => { const b = $("mrApply"); if (b) b.disabled = !gateOk(); };
    if ($("mrConfirmText")) $("mrConfirmText").addEventListener("input", upd);
    if ($("mrConfirmTick")) $("mrConfirmTick").addEventListener("change", upd);
    if ($("mrBackup")) $("mrBackup").addEventListener("click", () => {
      download(`t28-assignments-before-${stamp()}.json`, AssignEdit.backupOf(plan.changes, plan.head));
      backupTaken = true; $("mrGate").textContent = "Backup taken. Confirm, then apply."; upd();
    });
    if ($("mrApply")) $("mrApply").addEventListener("click", apply);
    $("mrDiscard").addEventListener("click", clearPlan);
    showPlan();
  }
  function gateOk() {
    if (!plan || !backupTaken) return false;
    const t = $("mrConfirmText"), k = $("mrConfirmTick");
    if (t) return t.value.trim() === "REMOVE";
    return !!(k && k.checked);
  }

  // ------------------------------------------------------------- apply --
  async function apply() {
    if (busy || !gateOk()) return;
    busy = true;
    const p = plan;
    try {
      await Graph.ensureScopes(AssignEdit.WRITE());
      $("mrApply").disabled = true;
      const L = RunLedger.create($("mrLedger"), {
        unit: "policies", title: p.title,
        items: p.changes.map((o) => ({ label: o.policy.name, sub: o.details.filter((d) => d.change === "modify").map((d) => `${STEP_WORD[d.action]} ${d.group.displayName || ""}`).join(" · ") })),
      });
      const r = await AssignEdit.applyPlan(p, { onStatus: () => {}, stopOnFail: $("mrStop").checked, ledger: L });
      L.finish();
      const ok = r.results.filter((x) => x.ok && x.verified);
      for (const x of ok) M.patchAssignments(model, x.op.policy.surface, x.op.policy.id, x.op.after, names, res.filters);
      runs.push({
        at: Date.now(), title: p.title, kind: p.undo ? "undo" : "assign",
        ok: ok.length, bad: r.results.length - ok.length, stopped: r.stopped,
        backup: JSON.parse(AssignEdit.backupOf(p.changes, p.head)),
        lines: r.results.map((x) => `${x.op.policy.name}: ${x.ok && x.verified ? "written · verified" : x.drifted ? "drifted — not written" : x.skipped ? "skipped" : x.ok ? "written · NOT verified" : "failed — " + (x.error || "")}`),
      });
      // The shared read now describes the tenant BEFORE this write; the
      // model here was patched from the verified read-backs only.
      PolicyCache.invalidate();
      plan = null; backupTaken = false;
      derive();
      selPairs.clear();
      render();
      const note = document.createElement("p");
      note.className = "mini muted"; note.style.margin = "8px 0 0";
      note.textContent = `${ok.length} written & verified. The verdicts above moved with the verified writes; 🧭 Read the tenant for a full re-read. The run and its undo are in 📜 Changes this session.`;
      $("mrLedger").appendChild(note);
      const disc = $("mrDiscard"); if (disc) disc.textContent = "Close";
    } catch (e) {
      const el = document.createElement("div"); el.className = "gu-fail"; el.innerHTML = `<b>${esc(GroupUse.shortErr(e, 300))}</b>`;
      $("mrLedger").appendChild(el);
    } finally { busy = false; }
  }

  async function undoRun(idx) {
    const r = runs[idx];
    if (!r || busy) return;
    if (r.kind === "members") { memDryRun(r); return; }
    busy = true; planAnchor = null; clearPlan(); seatPlan();
    try {
      await Graph.ensureScopes(AssignEdit.READ());
      const pols = r.backup.policies.map((b) => ({ surface: b.surface, id: b.id, name: b.name }));
      const fresh = await M.readFresh(pols, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
      const p = M.undoPlan(r.backup.policies, fresh);
      plan = Object.assign(p, { title: `Undo: ${r.title}`, head: { tool: "TUNO T28 MDE rollout", action: "undo", of: r.title }, memberLine: "", unread: pols.filter((x) => !fresh.has(`${x.surface}|${lc(x.id)}`)).map((x) => x.name), skipped: [] });
      renderPlan();
    } catch (e) { planError(GroupUse.shortErr(e, 300)); }
    finally { busy = false; }
  }

  // -------------------------------------------------- rollout actions --
  function rolloutCtx() {
    return { kinds, found: found || new Map(), twins: M.twinIndex(model.cfg, found), names, pairs, regions: rollRegions };
  }
  async function dryRunRollout(which) {
    if (busy || !model) return;
    busy = true; planAnchor = "mrRollCard"; clearPlan(); seatPlan(); showPlan();
    try {
      const r = M.rolloutWants(which, model, rolloutCtx());
      if (!r.wants.length) { plan = null; planError(`Nothing to do: ${M.ROLLOUT[which].label.toLowerCase()} is already in place${r.skipped.length ? ". Left out: " + r.skipped.join(" · ") : ""}.`); return; }
      await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
      const fresh = await M.readFresh(r.policies, (m) => { planEl().innerHTML = `<p class="mini muted">${esc(m)}</p>`; });
      const steps = [], unread = [];
      for (const x of r.wants) {
        const f = fresh.get(`${x.P.surface}|${lc(x.P.id)}`);
        if (!f) { if (!unread.includes(x.P.name)) unread.push(x.P.name); continue; }
        steps.push({ policy: f, action: x.action, group: { id: x.groupId, displayName: x.groupName }, filter: null, note: x.note });
      }
      const p = M.composePlan(steps);
      const regions = rollRegions ? [...rollRegions] : null;
      plan = Object.assign(p, {
        title: `${M.ROLLOUT[which].label}${regions ? ` (${regions.join(", ")})` : ""}`,
        head: { tool: "TUNO T28 MDE rollout", action: `rollout-${which}`, regions: regions || "all" },
        memberLine: "", unread, skipped: r.skipped, skippedTitle: "Left out, with the reason:",
      });
      renderPlan();
    } catch (e) { planError(GroupUse.shortErr(e, 300)); }
    finally { busy = false; }
  }
  function rolloutCard() {
    const regions = [...new Set(model.cfg.groups.filter((g) => g.role === "wave").map((g) => g.region))];
    const on = (r) => !rollRegions || rollRegions.has(r);
    const chips = regions.map((r) => fchip("data-mrroll-region", r, `${on(r) ? "✓ " : ""}${r}`, undefined, on(r))).join("");
    const ctx = rolloutCtx();
    const line = (which, n, what, hint) => {
      const r = M.rolloutWants(which, model, ctx);
      const count = r.wants.length ? `<b>${plural(r.wants.length, what)}</b> on ${plural(r.policies.length, "policy", "policies")}` : `<span class="muted">${r.skipped.length ? "nothing to plan" : "nothing to do — in place"}</span>`;
      return `<tr><td style="width:30px"><b>${n}</b></td>
        <td><b>${esc(M.ROLLOUT[which].label)}</b><div class="mini muted">${hint}</div></td>
        <td class="mini">${count}${r.skipped.length ? `<div style="color:var(--report)" title="${esc(r.skipped.join("\n"))}">${!r.wants.length && r.skipped.length === 1 ? esc(r.skipped[0]) : `${plural(r.skipped.length, "left out", "left out")} <span style="cursor:help">ⓘ</span>`}</div>` : ""}</td>
        <td style="text-align:right"><button class="btn" style="white-space:nowrap" data-mrroll="${which}"${r.wants.length ? "" : " disabled"}>Dry run →</button></td></tr>`;
    };
    const touched = new Set(M.rolloutWants("excludeWaves", model, ctx).policies.map((P) => P.key));
    const gaps = retire.filter((x) => x.verdict === "gap" && touched.has(x.O.key)).length;
    return `<div class="list-card" id="mrRollCard" style="margin-top:0;margin-bottom:12px">
      <h4 style="margin:0 0 4px">⚡ Rollout actions</h4>
      <p class="mini muted" style="margin:0 0 8px">One plan per step, over every new or colliding old policy at once — each through the same dry run, backup, confirm and read-back as a single fix, and each undoable from 📜. The device waves go to the <code>- D -</code> policies, the user waves to the <code>- U -</code> ones.</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 8px"><span class="mini muted">Regions:</span>${chips}${pilotTick()}</div>
      <table class="cg-table"><colgroup><col style="width:30px"><col><col style="width:24%"><col style="width:110px"></colgroup><tbody>
        ${line("includeWaves", "①", "include", `Every existing wave of the ticked regions into each new policy of its kind. Membership decides who moves, so the groups can all be in place before a wave is filled.${cfg.pilotGroupsOff ? " 🧪 With every wave in a new policy and out of its old ones, the pilot groups come off both." : ""}`)}
        ${line("excludeExclusion", "②", "exclusion", `${esc(model.cfg.exclusionDevice || "—")} from the <code>- D -</code> policies, ${esc(model.cfg.exclusionUser || "—")} from the <code>- U -</code> ones — whoever stays on the old set.`)}
        ${line("excludeWaves", "③", "change", `The ⚔️ pane's proposals, waves only: a wave leaves an old policy only where a new policy that sets the same settings includes it (or its twin), never ahead of it.${cfg.pilotGroupsOff ? " 🧪 Where that completes the swap, the pilot groups come off both sides." : ""}${gaps ? ` <span style="color:var(--off)">${plural(gaps, "of these old policies has", "of these old policies have")} a 🧹 gap — settings the new set does not carry; wave members lose them.</span>` : ""}`)}
      </tbody></table>
    </div>`;
  }

  // ---------------------------------------------------- 👥 wave members --
  // Layout A off the mockup (Mihai's pick, 10634): per wave, one row per
  // country — its user group, its Windows devices by primary user, its
  // INT-SG-D device group with the sync diff, and its place in the wave.
  const mcfg = () => cfg.members || MdeMembers.normConfig(null);
  function memWaves() {
    const out = new Map();
    const byRegion = new Map();
    for (const g of cfg.groups) if (g.role === "wave") {
      if (!byRegion.has(lc(g.region))) byRegion.set(lc(g.region), { user: null, device: null, userName: "", deviceName: "" });
      const w = byRegion.get(lc(g.region));
      const hit = found ? found.get(lc(g.name)) : null;
      if (g.audience === "user") { w.userName = g.name; w.user = hit || null; } else { w.deviceName = g.name; w.device = hit || null; }
    }
    for (const [k, v] of byRegion) out.set(k, v);
    return out;
  }
  function memCompute() { if (mem.input) mem.model = MdeMembers.compute(mcfg(), mem.input, memWaves()); }
  async function memRead() {
    if (mem.loading) return;
    mem.loading = true; clearPlan(); render();
    try {
      await Graph.ensureScopes([...new Set([...Graph.SCOPES.groups, ...Graph.SCOPES.devices, ...Graph.SCOPES.deviceObjects])]);
      const waves = [...memWaves().values()].flatMap((w) => [w.user, w.device]).filter(Boolean);
      mem.input = await MdeMembers.readInput(mcfg(), waves, (m) => { const el = $("mrMemProg"); if (el) el.textContent = m; }, new Set(cfg.lookup.map(lc)), exGroups().device, cfg.pilotGroups);
      memCompute();
      if (!mem.region && mem.model.regions.length) mem.region = mem.model.regions[0].region;
    } catch (e) {
      mem.model = null; mem.input = null;
      mem.error = GroupUse.shortErr(e, 300);
    } finally { mem.loading = false; render(); }
  }
  const memRowSel = (r) => mem.sel.has(r.key);
  function memCell(r) {
    const g = r.dg;
    if (!r.deviceGroupName) return `<span class="au-op delete" title="${esc(r.iso3Source)}">no device-group name</span><div class="mini muted">${esc(r.iso3Source)}</div>`;
    const name = `<b>${esc(r.deviceGroupName)}</b>`;
    if (!g) return `${name} ${chip("gu-how priv", "to create")}<div class="mini">${r.want.size ? `<span style="color:var(--on);font-weight:700">+${r.want.size}</span> to fill` : `<span class="muted">no devices to put in it</span>`}</div>`;
    const diff = r.inSync ? `<span class="muted">in sync · ${r.have.size} in</span>` : `${r.add.length ? `<span style="color:var(--on);font-weight:700">+${r.add.length}</span>` : ""}${r.add.length && r.remove.length ? " · " : ""}${r.remove.length ? `<span style="color:var(--off);font-weight:700" title="${esc(r.removeNames.join("\n"))}">−${r.remove.length}</span>` : ""} <span class="muted">· ${r.have.size} in</span>`;
    return `${name} ${chip("au-op create", "exists")}<div class="mini">${diff}</div>`;
  }
  function memNestCell(r) {
    const one = (icon, nested, wave, waveName, what) => {
      if (!wave) return `<div>${icon} <span class="muted" title="${esc(waveName)} does not exist — create it in 🌊">no wave group</span></div>`;
      if (nested) return `<div>${icon} ${chip("au-op create", `✓ ${what} wave`)}</div>`;
      if (nested === null) return `<div>${icon} <span class="muted">—</span></div>`;
      return `<div>${icon} ${chip("au-op other", "offer")}</div>`;
    };
    const userSide = r.batch && !r.batch.finished && r.wave.user
      ? `<div>👤 ${chip("gu-how priv", `🧪 ${r.batch.inCount} of ${r.batch.N} users`)} <span class="muted">${r.batch.next ? `batch ${r.batch.next.n} of ${r.batch.K} next` : "all in — finish"}</span></div>`
      : one("👤", r.ug ? r.ugNested : null, r.wave.user, r.wave.userName, "user");
    return userSide
      + one("🖥", r.dg ? r.dgNested : (r.deviceGroupName && r.want.size ? false : null), r.wave.device, r.wave.deviceName, "device");
  }
  function memDetail(r) {
    const rows = r.devices.slice().sort((a, b) => (!a.objId) - (!b.objId) || a.name.localeCompare(b.name)).slice(0, 200).map((d) => {
      const wb = r.batch && !r.batch.finished && d.objId && !d.held && !r.want.has(d.objId) ? r.batch.batches.find((b) => b.users.some((u) => u.id === d.userId)) : null;
      const st = !d.objId ? chip("au-op delete", d.problem) : wb ? `<span class="muted">🧪 waits for batch ${wb.n}</span>` : d.held ? `${chip("gu-how priv", "⊘ excluded")} <span class="muted">${r.have.has(d.objId) ? "take out — stays on the old set" : "kept out — on the old set"}</span>` : r.have.has(d.objId) ? `<span class="muted">in group</span>` : `<b style="color:var(--on)">add</b>`;
      return `<tr><td>${esc(d.name)}</td><td class="mini">${esc(d.upn)}</td><td class="mini">${d.lastSync ? esc(new Date(d.lastSync).toLocaleDateString()) : "—"}${d.stale ? ` ${chip("gu-how priv", `stale > ${mcfg().staleDays} d`)}` : ""}</td><td class="mini">${st}${d.others.length ? `<div style="color:${d.pilotOverlap ? "var(--muted)" : "var(--report)"}">also in ${esc(d.others.join(", "))}${d.pilotOverlap ? " — pilot overlap, expected" : ""}</div>` : ""}</td></tr>`;
    }).join("");
    const rem = r.remove.length ? `<p class="mini" style="margin:8px 0 0;color:var(--off)">In ${esc(r.deviceGroupName)} but the primary user is no longer in ${esc(r.userGroupName)} (${r.remove.length}): ${esc(r.removeNames.slice(0, 12).join(", "))}${r.remove.length > 12 ? " …" : ""} — removed only with “apply removals” ticked.</p>` : "";
    return `<tr><td colspan="6" style="padding:0 8px 8px 36px">${r.pilot ? batchPanel(r) : ""}<div class="mr-detail">
      <b>${esc(r.country)} — ${plural(r.devices.length, "Windows device")}</b> · ${plural(r.usersNoDevice, "user")} without one${r.problems.noEntra ? ` · <span style="color:var(--off)">${r.problems.noEntra} without an Entra object (cannot be a member)</span>` : ""}${r.problems.stale ? ` · ${r.problems.stale} stale` : ""}${r.problems.multi ? ` · <span style="color:var(--report)">${r.problems.multi} also in another country group</span>` : ""}${r.problems.pilot ? ` · <span class="muted">${r.problems.pilot} also in ${r.pilot ? "its country group" : "the pilot"} (expected)</span>` : ""}${r.problems.held ? ` · <span class="muted">${r.problems.held} in the device exclusion group — kept out, on the old set</span>` : ""}
      ${r.devices.length ? `<div style="overflow-x:auto;margin-top:6px"><table class="cg-table"><thead><tr><th>Device</th><th>Primary user</th><th>Last sync</th><th>Plan</th></tr></thead><tbody>${rows}</tbody></table></div>${r.devices.length > 200 ? `<p class="mini muted" style="margin:4px 0 0">First 200 of ${r.devices.length} — ⭳ CSV has them all.</p>` : ""}` : ""}
      ${rem}${r.notes.length ? `<p class="mini" style="margin:6px 0 0;color:var(--report)">${r.notes.map(esc).join("<br>")}</p>` : ""}
    </div></td></tr>`;
  }
  // 🧪 A pilot in batches (10640, option A off the mockup): its users go
  // straight into the user wave a batch at a time, its device group follows
  // them, and Finish nests the group. The plan opens under this panel.
  const upnShort = (u) => String(u.upn || u.id).split("@")[0];
  function batchPanel(r) {
    const on = !!r.batch;
    const toggle = `<label class="chk" style="margin:0"><input type="checkbox" data-mrbatchtoggle="${esc(r.suffix)}"${on ? " checked" : ""}${r.batch && r.batch.finished ? " disabled" : ""}> add this pilot in ${mcfg().batchCount} batches</label>`;
    if (!on) return `<div class="mr-batch" id="mrBatch-${esc(r.key)}"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><b>🧪 Pilot</b>${toggle}<span class="mini muted">Off: the whole group goes into the wave at once (nest user group).</span></div></div>`;
    const b = r.batch;
    const pct = b.N ? Math.round(100 * b.inCount / b.N) : 100;
    const stateChip = (x) => x.state === "in" ? chip("au-op create", "in") : x.state === "next" ? chip("gu-how priv", x.inHere ? `next · ${x.inHere} of ${x.size} in` : "next") : x.state === "empty" ? `<span class="muted">—</span>` : `<span class="muted">waiting</span>`;
    const rows = b.batches.map((x) => `<tr${x.state === "next" ? ` class="mr-selrow"` : ""}><td><b>${x.n}</b></td>
      <td>${x.size}${x.users.length ? ` <span class="muted">${esc(upnShort(x.users[0]))}${x.users.length > 1 ? ` … ${esc(upnShort(x.users[x.users.length - 1]))}` : ""}</span>` : ""}</td>
      <td>${x.devices.length}${x.devices.some((d) => !d.objId || d.held) ? ` <span class="muted" title="${esc(x.devices.filter((d) => !d.objId || d.held).map((d) => `${d.name}: ${d.held ? "excluded" : d.problem}`).join("\n"))}">(${x.devices.filter((d) => !d.objId || d.held).length} left out)</span>` : ""}</td>
      <td>${stateChip(x)}</td>
      <td style="text-align:right">${x.state === "next" ? `<button class="btn primary" data-mrbatch="${esc(r.key)}"${busy || !r.wave.user ? " disabled" : ""}>Batch ${x.n} → dry run</button>` : ""}</td></tr>`).join("");
    const allIn = !b.next;
    return `<div class="mr-batch" id="mrBatch-${esc(r.key)}">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between"><b>🧪 Pilot in ${b.K} batches</b>${toggle}</div>
      ${b.finished ? `<p class="mini" style="margin:6px 0 0">${chip("au-op create", "finished")} ${esc(r.userGroupName)} is nested in ${esc(r.wave.userName)} — new users flow in with the group.</p>` : `
      <p class="mini muted" style="margin:4px 0 8px">Each batch is an even part of the users not yet in the wave, sorted by UPN, and each user's Windows devices go with them. The next batch is cut from whoever is still left, so users who join or leave the group in between are counted in. The users go straight into <code>${esc(r.wave.userName || "the user wave")}</code>; <code>${esc(r.deviceGroupName || "the device group")}</code> holds only the devices of users already in.</p>
      <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-end;margin-bottom:6px"><div><div class="mini muted">Progress</div><b>${b.inCount} of ${b.N} users</b> <span class="mini muted">· ${b.batches.filter((x) => x.state === "in").length} of ${b.batches.filter((x) => x.size).length} batches</span><div class="mr-meter"><i style="width:${pct}%"></i></div></div>
        ${b.inOther ? `<div class="mini muted">${plural(b.inOther, "user is", "users are")} in the wave already through ${esc(b.viaNames.join(", ") || "another group")} — not in the batches</div>` : ""}</div>
      ${b.N ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:56px"><col><col style="width:18%"><col style="width:18%"><col style="width:170px"></colgroup><thead><tr><th>Batch</th><th>Users</th><th>Devices</th><th>State</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">No user of this group is left to batch.</p>`}
      <div class="tb-actions" style="margin-top:8px"><button class="btn" data-mrbatchcsv="${esc(r.key)}">⭳ CSV of the batches</button>
        ${allIn ? `<button class="btn primary" data-mrbatchfin="${esc(r.key)}"${busy || !r.wave.user ? " disabled" : ""}>🧪 Finish: nest the pilot group →</button><span class="mini muted">nests ${esc(r.userGroupName)} and takes the direct members out, so new users flow in</span>` : `<span class="mini muted">After the last batch: 🧪 Finish nests the group.</span>`}</div>`}
    </div>`;
  }
  function batchDryRun(key, finish) {
    if (busy || !mem.model) return;
    planAnchor = `mrBatch-${key}`; clearPlan(); seatPlan();
    const r = mem.model.rows.find((x) => x.key === key);
    const p = finish ? MdeMembers.planFinish(mem.model, key) : MdeMembers.planBatch(mem.model, key, mcfg());
    plan = Object.assign(p, { members: true, title: finish ? `Pilot ${r ? r.country : key} — finish` : `Pilot ${r ? r.country : key} — batch ${p.batch || ""} of ${mcfg().batchCount}` });
    renderMemPlan();
  }
  // 🕳 Left out (10642, layout A off the mockup): who and what the waves
  // do not reach — per wave for a country's users and devices, tenant-wide
  // for the Windows devices no country holds.
  function leftCounts(m) {
    const L = m.leftOut, R = mem.region || (m.regions[0] && m.regions[0].region);
    const inR = (x) => x.region === R;
    const users = new Set(L.users.filter(inR).map((u) => u.id)).size;
    const noEntra = L.noEntra.filter(inR).length, held = L.held.filter(inR).length;
    // 10645 (Mihai: "keep the list, don't count it"): MDE here is Windows,
    // so Left out counts Windows devices only. The users with no Windows
    // device stay listed — they are in the user wave through their country
    // group, and a Windows device they get later is picked up by the sync.
    return { R, users, noEntra, held, noCountry: L.noCountry.length, noPrimary: L.noPrimary.length, total: noEntra + held + L.noCountry.length + L.noPrimary.length };
  }
  const osHas = (h) => { const e = Object.entries(h || {}); return e.length ? e.map(([os, n]) => chip("gu-how", `${os} ${n}`)).join(" ") : chip("gu-how priv", "nothing in Intune"); };
  const LEFT_WHY = {
    noCountry: { label: "primary user in no country group of the table", tile: "Windows devices whose primary user is in no country group of the table" },
    noPrimary: { label: "no primary user", tile: "Windows devices with no primary user" },
    noEntra: { label: "no Entra object", tile: "no Entra object — they cannot be group members" },
    held: { label: "⊘ excluded — stays on the old set", tile: "in the device exclusion group — on the old set" },
  };
  function leftOutHtml(m, lo) {
    const L = m.leftOut, R = lo.R, CAP = 300;
    const tile = (key, n, label, on) => `<button type="button" class="mr-tile mr-lotile${on ? " on" : ""}" data-mrmemleftwhy="${key}"><b>${n.toLocaleString()}</b><span>${esc(label)}</span></button>`;
    const users = L.users.filter((u) => u.region === R && (!mem.leftCountry || u.rowKey === mem.leftCountry));
    const countries = [...new Map(L.users.filter((u) => u.region === R).map((u) => [u.rowKey, u.country])).entries()]
      .map(([k, c]) => ({ k, c, n: L.users.filter((u) => u.region === R && u.rowKey === k).length })).sort((a, b) => b.n - a.n);
    const cchips = countries.length > 1 ? `<div class="toolbar mr-lobar">${fchip("data-mrmemleftrow", "", `All · ${lo.users.toLocaleString()}`, undefined, !mem.leftCountry)}${countries.map((x) => fchip("data-mrmemleftrow", x.k, `${x.c} · ${x.n.toLocaleString()}`, undefined, mem.leftCountry === x.k)).join("")}</div>` : "";
    const cgName = (k) => { const r = m.rows.find((x) => x.key === k); return r ? r.userGroupName : ""; };
    // "the users still need to be in the right groups" / "if they get a
    // Windows device later, it should be added" (10645): say where the user
    // stands, and what happens to a device they get
    const rowOf = new Map(m.rows.map((r) => [r.key, r]));
    const standing = (u) => {
      const r = rowOf.get(u.rowKey);
      if (!r) return "";
      const wn = r.wave && r.wave.userName ? r.wave.userName : "the user wave";
      const inWave = r.ugNested || (r.batch && r.batch.inWave && r.batch.inWave.has(u.id));
      const now = inWave ? `<span style="color:var(--on)">✓ in <code>${esc(wn)}</code></span> through ${esc(r.userGroupName)}`
        : r.batch ? `⏳ pilot batch — not in <code>${esc(wn)}</code> yet (🧪 batches)` : `<span style="color:var(--off)">✗ not in <code>${esc(wn)}</code> yet</span> — nest ${esc(r.userGroupName)} (👥 countries)`;
      const later = r.deviceGroupName ? `<div class="muted">a Windows device they get joins <code>${esc(r.deviceGroupName)}</code> at the next 👥 read → Apply</div>` : "";
      return now + later;
    };
    const urows = users.slice(0, CAP).map((u) => `<tr><td>${esc(u.upn)}</td><td class="mini">${esc(u.country)}</td><td class="mini">${osHas(u.has)}</td><td class="mini">${standing(u)}</td></tr>`).join("");
    const why = mem.leftReason;
    const devs = [].concat(
      (!why || why === "noEntra") ? L.noEntra.filter((d) => d.region === R).map((d) => Object.assign({ k: "noEntra" }, d)) : [],
      (!why || why === "held") ? L.held.filter((d) => d.region === R).map((d) => Object.assign({ k: "held" }, d)) : [],
      (!why || why === "noCountry") ? L.noCountry.map((d) => Object.assign({ k: "noCountry" }, d)) : [],
      (!why || why === "noPrimary") ? L.noPrimary.map((d) => Object.assign({ k: "noPrimary" }, d)) : []);
    const whyChip = (d) => d.k === "held" ? chip("gu-how", LEFT_WHY.held.label) : d.k === "noEntra" ? chip("au-op delete", d.why || LEFT_WHY.noEntra.label) : chip("gu-how priv", LEFT_WHY[d.k].label);
    const drows = devs.slice(0, CAP).map((d) => `<tr><td><b>${esc(d.name)}</b>${d.country ? `<div class="mini muted">${esc(d.country)}</div>` : ""}</td><td class="mini">${esc(d.upn || "—")}</td><td class="mini">${whyChip(d)}</td><td class="mini">${d.lastSync ? esc(new Date(d.lastSync).toLocaleDateString()) : "—"}${d.stale ? ` ${chip("gu-how priv", "stale")}` : ""}</td></tr>`).join("");
    return `<div class="list-card" style="margin-top:0">
      <p class="mini muted" style="margin:0 0 8px">Windows devices the waves do not reach, with the reason — that is the count. The users and a country's devices are for 🌊 <b>${esc(R)}</b>; the devices no country holds are for the whole tenant. The users with no Windows device are listed, not counted: they are in the user wave through their country group, and a Windows device they get later joins its country device group at the next 👥 read → Apply. <a href="#" data-mrmemleft="1">← back to the countries</a></p>
      <div class="mr-tiles">
        ${tile("users", lo.users, `users with no Windows device — not counted (they are in the user wave)`, !mem.leftReason)}
        ${tile("noCountry", lo.noCountry, LEFT_WHY.noCountry.tile, mem.leftReason === "noCountry")}
        ${tile("noPrimary", lo.noPrimary, LEFT_WHY.noPrimary.tile, mem.leftReason === "noPrimary")}
        ${tile("noEntra", lo.noEntra, LEFT_WHY.noEntra.tile, mem.leftReason === "noEntra")}
        ${lo.held ? tile("held", lo.held, LEFT_WHY.held.tile, mem.leftReason === "held") : ""}
      </div>
      <h4 style="margin:14px 0 6px">Users with no Windows device <span class="mini muted" style="font-weight:400">— by Intune primary user${mem.leftCountry ? ` · ${esc(cgName(mem.leftCountry))}` : ""}</span></h4>
      ${cchips}
      ${users.length ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:32%"><col style="width:13%"><col style="width:27%"><col></colgroup><thead><tr><th>User</th><th>Country</th><th>Their other devices</th><th>Their groups</th></tr></thead><tbody>${urows}</tbody></table></div>${users.length > CAP ? `<p class="mini muted" style="margin:4px 0 0">First ${CAP} of ${users.length.toLocaleString()} — ⭳ CSV has them all.</p>` : ""}`
        : `<p class="mini muted" style="margin:0">Every user of ${mem.leftCountry ? "this country" : "this wave's countries"} has a Windows device.</p>`}
      <h4 style="margin:16px 0 6px">Windows devices no country device group will hold${why ? ` <span class="mini muted" style="font-weight:400">— ${esc(LEFT_WHY[why].label)} · <a href="#" data-mrmemleftwhy="all">show every reason</a></span>` : ""}</h4>
      ${devs.length ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:28%"><col style="width:28%"><col><col style="width:16%"></colgroup><thead><tr><th>Device</th><th>Primary user</th><th>Why</th><th>Last sync</th></tr></thead><tbody>${drows}</tbody></table></div>${devs.length > CAP ? `<p class="mini muted" style="margin:4px 0 0">First ${CAP} of ${devs.length.toLocaleString()} — ⭳ CSV has them all.</p>` : ""}`
        : `<p class="mini muted" style="margin:0">None.</p>`}
      <div class="tb-actions" style="margin-top:10px"><button class="btn" id="mrMemLeftCsv">⭳ CSV — left out, ${esc(R)}</button><span class="mini muted">Users and ${esc(R)}'s devices, plus the devices no country holds.</span></div>
    </div>`;
  }
  // 🧪 PILOTS (10647, Mihai: "an option to identify the pilot users and
  // devices to a wave and an option to remove them from the pilot and be
  // sure that they are then in their wave"; option A off the mockup, and
  // "block that wave"). Every member of the pilot groups with the wave its
  // country puts it in; only members already in their wave can be ticked,
  // and the plan only removes them from the pilot.
  //
  // ⛔ The policy check: a member leaves only where its wave carries what
  // its pilot group carries — every new policy that includes the pilot group
  // includes the wave too (or the whole tenant), and every old policy that
  // excludes the pilot group excludes the wave (or its twin). Otherwise the
  // member would gain an old policy or lose a new one; that wave is blocked
  // and the policy named. Keyed "pilot group id|wave id".
  function pilotBlocks(pm) {
    const out = new Map();
    if (!model || !pm) return out;
    const twins = M.twinIndex(model.cfg, found);
    const keys = new Set(pm.members.filter((x) => x.waveId).flatMap((x) => x.groups.map((g) => `${g.id}|${x.waveId}`)));
    for (const k of keys) {
      const [gid, wid] = k.split("|");
      const gn = (pm.groups.find((g) => g.id === gid) || {}).name || nameOf(gid);
      const wn = nameOf(wid);
      const why = [];
      for (const N of model.newP) if (N.reach.inc.has(gid) && !N.reach.tenantWide && !N.reach.inc.has(wid)) why.push(`${N.name} includes ${gn} but not ${wn}`);
      for (const O of model.oldP) if (O.reach.exc.has(gid)) {
        const t = twins.get(wid), tid = t && t.twinId ? lc(t.twinId) : null;
        if (!O.reach.exc.has(wid) && !(tid && O.reach.exc.has(tid))) why.push(`${O.name} excludes ${gn} but not ${wn}`);
      }
      if (why.length) out.set(k, why);
    }
    return out;
  }
  // a member's standing with the policy check applied: "blocked" wins over "in"
  function pilotRows(pm) {
    const blocks = pilotBlocks(pm);
    return pm.members.map((x) => {
      const b = x.waveId ? x.groups.flatMap((g) => blocks.get(`${g.id}|${x.waveId}`) || []) : [];
      return Object.assign({}, x, { st: b.length && x.state === "in" ? "blocked" : x.state, blocks: b });
    });
  }
  const PIL_ST = { in: ["✓ in their wave", "au-op create"], wait: ["⏳ wave known, not in it yet", "gu-how priv"], none: ["✗ no wave", "au-op delete"], blocked: ["⛔ blocked by a policy", "au-op delete"] };
  function pilotsHtml(m) {
    const pm = m.pilots;
    const rows = pilotRows(pm);
    const key = (x) => `${x.kind}|${x.id}`;
    for (const k of [...mem.pilSel]) if (!rows.some((x) => key(x) === k && x.st === "in")) mem.pilSel.delete(k);
    const n = (st) => rows.filter((x) => x.st === st).length;
    const users = rows.filter((x) => x.kind === "user").length, devs = rows.filter((x) => x.kind === "device").length;
    const tile = (st, num, label) => `<button type="button" class="mr-tile mr-lotile${mem.pilState === st ? " on" : ""}" data-mrpilstate="${st || ""}"><b>${num.toLocaleString()}</b><span>${esc(label)}</span></button>`;
    const shown = rows.filter((x) => !mem.pilState || x.st === mem.pilState);
    const blocks = pilotBlocks(pm);
    const allBlocks = [...new Set([...blocks.values()].flat())];
    const standing = (x) => x.st === "in" ? `${chip("au-op create", "✓ in the wave")} <span class="muted">${esc(x.via || "")}</span>`
      : x.st === "blocked" ? `${chip("au-op delete", "⛔ blocked")}<div style="color:var(--off)">${x.blocks.map(esc).join("<br>")}</div>`
      : `${chip(PIL_ST[x.st][1], x.st === "wait" ? "⏳ not in it yet" : "✗ no wave")} <span class="muted">${esc(x.why || "")}</span>`;
    const CAP = 400;
    const trs = shown.slice(0, CAP).map((x) => `<tr class="${mem.pilSel.has(key(x)) ? "mr-selrow" : ""}"><td>${x.st === "in" ? `<input type="checkbox" data-mrpilsel="${esc(key(x))}"${mem.pilSel.has(key(x)) ? " checked" : ""} aria-label="select">` : `<span class="muted" title="Only members already in their wave can leave the pilot">—</span>`}</td>
      <td><b>${esc(x.name)}</b><div class="mini muted">${x.kind}${x.kind === "device" && x.upn ? ` · ${esc(x.upn)}` : ""}</div></td>
      <td class="mini">${x.groups.map((g) => esc(g.name)).join("<br>")}</td>
      <td class="mini">${x.waveName ? `${esc(x.country)} → <code>${esc(x.waveName)}</code>` : `<span class="muted">—</span>`}</td>
      <td class="mini">${standing(x)}</td></tr>`).join("");
    const nSel = mem.pilSel.size;
    const selRows = rows.filter((x) => mem.pilSel.has(key(x)));
    const selTxt = nSel ? `→ out of the pilot · ${[selRows.filter((x) => x.kind === "device").length ? plural(selRows.filter((x) => x.kind === "device").length, "device") : "", selRows.filter((x) => x.kind === "user").length ? plural(selRows.filter((x) => x.kind === "user").length, "user") : ""].filter(Boolean).join(" · ")}` : "tick members already in their wave";
    const inRows = shown.filter((x) => x.st === "in");
    const allOn = inRows.length && inRows.every((x) => mem.pilSel.has(key(x)));
    return `<div class="list-card mr-stickyhost" style="margin-top:0" id="mrPilCard">
      <p class="mini muted" style="margin:0 0 8px">Every member of the pilot groups (⚙️: ${pm.groups.map((g) => `<code>${esc(g.name)}</code>`).join(" ") || "none found"}) with the wave its country puts it in — a device by its Intune primary user's country group, a user by their own. <b>Only members already in their wave can leave the pilot</b>; the plan only removes, and checks each member's wave again, fresh, before it is shown and again before it writes. A ⏳ member says what is missing — nest its country or run Apply in the countries view, then ↻ Read again.${pm.missing.length ? ` <span style="color:var(--report)">Not in this tenant: ${pm.missing.map(esc).join(", ")}.</span>` : ""}</p>
      <div class="mr-tiles">
        ${tile(null, rows.length, `pilot members · ${[devs ? plural(devs, "device") : "", users ? plural(users, "user") : ""].filter(Boolean).join(" · ") || "none"}`)}
        ${tile("in", n("in"), PIL_ST.in[0])}
        ${tile("wait", n("wait"), PIL_ST.wait[0])}
        ${tile("none", n("none"), "✗ no wave: no country, no primary user, kept on the old set")}
        ${n("blocked") ? tile("blocked", n("blocked"), PIL_ST.blocked[0]) : ""}
      </div>
      <div class="mini" style="margin:6px 0 10px"><b>Policy check:</b> ${allBlocks.length
        ? `<span style="color:var(--off)">⛔ ${plural(allBlocks.length, "policy gap blocks", "policy gaps block")} a wave — its pilot members stay until the policy has the wave too:</span><div style="color:var(--off)">${allBlocks.slice(0, 8).map(esc).join("<br>")}${allBlocks.length > 8 ? `<br>… ${allBlocks.length - 8} more` : ""}</div>`
        : `<span style="color:var(--on)">✓ every new policy that includes a pilot group also includes the members' waves, and every old policy that excludes one also excludes them.</span>`}</div>
      ${shown.length ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30px"><col style="width:26%"><col style="width:18%"><col style="width:20%"><col></colgroup>
        <thead><tr><th>${inRows.length ? `<input type="checkbox" data-mrpilall="1"${allOn ? " checked" : ""} aria-label="select every member already in its wave">` : ""}</th><th>Member</th><th>Pilot group</th><th>Country → wave</th><th>Standing</th></tr></thead><tbody>${trs}</tbody></table></div>${shown.length > CAP ? `<p class="mini muted" style="margin:4px 0 0">First ${CAP} of ${shown.length.toLocaleString()}.</p>` : ""}`
        : `<p class="mini muted" style="margin:0">${rows.length ? "None in this state." : "The pilot groups are empty."}</p>`}
      <div class="mr-mbar" id="mrPilBar">
        <b>${plural(nSel, "member")}</b>
        <span class="mini">${esc(selTxt)}</span>
        <button class="btn primary" id="mrPilDry"${nSel ? "" : " disabled"}>② Dry run</button>
      </div>
      <p class="mini muted" style="margin:8px 0 0">Leaving the pilot changes where a member gets its policies from, not which: the old policies keep it out through its wave's exclusion instead of the pilot's, the new ones reach it through its wave instead of the pilot. Every run lands in 📜 with an undo that puts the members back.</p>
    </div>`;
  }
  // fresh: is each member in its wave right now (transitive)?
  async function pilotFresh(members) {
    const ok = new Set(), why = new Map();
    const rs = await Graph.pool(members, async (x) => {
      const path = x.kind === "user" ? `/users/${encodeURIComponent(x.id)}/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999` : `/devices/${encodeURIComponent(x.id)}/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999`;
      return Graph.readAll(path, { scopes: x.kind === "user" ? Graph.SCOPES.groups : Graph.SCOPES.deviceObjects.concat(Graph.SCOPES.groups), retry: true });
    }, 4);
    rs.forEach((r, i) => {
      const x = members[i];
      if (r.error) { why.set(`${x.kind}|${x.id}`, `its groups could not be read — ${GroupUse.shortErr(r.error, 120)}`); return; }
      if ((r.value || []).some((g) => lc(g.id) === x.waveId)) ok.add(`${x.kind}|${x.id}`);
      else why.set(`${x.kind}|${x.id}`, `not in ${x.waveName} when read just now`);
    });
    return { ok, why };
  }
  async function pilotDryRun() {
    if (busy || !mem.model || !mem.model.pilots) return;
    busy = true; planAnchor = "mrPilBar"; clearPlan(); seatPlan(); showPlan();
    try {
      const rows = pilotRows(mem.model.pilots).filter((x) => mem.pilSel.has(`${x.kind}|${x.id}`));
      const ready = rows.filter((x) => x.st === "in");
      planEl().innerHTML = `<p class="mini muted">Checking ${plural(ready.length, "member")} in their wave, fresh…</p>`;
      await Graph.ensureScopes([...Graph.SCOPES.groups, ...Graph.SCOPES.deviceObjects]);
      const f = await pilotFresh(ready);
      const p = MdeMembers.planPilotsOut(mem.model.pilots, ready.filter((x) => f.ok.has(`${x.kind}|${x.id}`)).map((x) => `${x.kind}|${x.id}`));
      p.skipped = rows.filter((x) => x.st !== "in").map((x) => `${x.name}: ${x.st === "blocked" ? x.blocks.join("; ") : x.why}`)
        .concat(ready.filter((x) => !f.ok.has(`${x.kind}|${x.id}`)).map((x) => `${x.name}: ${f.why.get(`${x.kind}|${x.id}`)}`));
      const members = ready.filter((x) => f.ok.has(`${x.kind}|${x.id}`));
      plan = Object.assign(p, { members: true, pilotsOut: members, title: `Out of the pilot — ${plural(members.length, "member")}` });
      renderMemPlan();
    } catch (e) { planError(GroupUse.shortErr(e, 300)); }
    finally { busy = false; }
  }

  function membersPane() {
    const intro = `<p class="mini muted" style="margin:0 0 10px">Per wave: the country <b>user</b> groups (<code>${esc(mcfg().countryPrefix)}…</code>) go into the user wave, and one <b>device</b> group per country (<code>${esc(mcfg().deviceGroupPrefix)}&lt;ISO3&gt;</code>, assigned) holding the Windows devices whose <b>Intune primary user</b> is in that country group goes into the device wave. The device groups are synced, not filled once: every read shows what to add and what to remove. The country table is under ⚙️ Naming rules.</p>`;
    if (mem.loading) return `<div class="list-card" style="margin-top:0">${intro}<p class="mini" id="mrMemProg">Reading…</p></div>`;
    if (!mem.model) return `<div class="list-card" style="margin-top:0">${intro}
      ${mem.error ? `<div class="gu-fail" style="margin-bottom:10px"><b>${esc(mem.error)}</b></div>` : ""}
      <div class="tb-actions"><button class="btn primary" id="mrMemRead">👥 Read the country groups and devices</button></div>
      <p class="mini muted" style="margin:8px 0 0">Reads the country groups and their users, every Windows device in Intune and in Entra, the ${esc(mcfg().deviceGroupPrefix)}* groups and what is nested in the waves. Read-only; a large tenant takes a minute.</p></div>`;
    const m = mem.model;
    const regionChip = (rg) => fchip("data-mrmemregion", rg.region, `🌊 ${rg.region} · ${rg.rows.length}`, undefined, !mem.unmapped && mem.region === rg.region);
    const lo = leftCounts(m);
    const chips = `<div class="toolbar">${m.regions.map(regionChip).join("")}<span style="width:1px;height:20px;background:var(--border);margin:0 4px"></span>${fchip("data-mrmemunmapped", "1", `⚠ Not in any wave · ${m.unmapped.length}`, undefined, mem.unmapped)}${fchip("data-mrmemleft", "1", `🕳 Left out · ${lo.total.toLocaleString()}`, undefined, mem.left && !mem.unmapped && !mem.pil)}${m.pilots ? fchip("data-mrpilview", "1", `🧪 Pilots · ${m.pilots.members.length.toLocaleString()}`, undefined, mem.pil) : ""}<button class="btn" id="mrMemRead" style="margin-left:auto">↻ Read again</button><button class="btn" id="mrMemCsv">⭳ CSV</button></div>`;
    const top = `${m.failed.length ? `<div class="gu-fail" style="margin-bottom:10px"><b>Partly read:</b><span class="why">${m.failed.map(esc).join("<br>")}</span></div>` : ""}`;
    if (mem.pil && m.pilots) return `${chips}${top}${pilotsHtml(m)}`;
    if (mem.left && !mem.unmapped) return `${chips}${top}${leftOutHtml(m, lo)}`;
    if (mem.unmapped) {
      const suffixOf = (g) => g.displayName.slice(mcfg().countryPrefix.length);
      const regionOpts = m.regions.map((x) => `<option value="${esc(x.region)}">${esc(x.region)}</option>`).join("");
      const rows = m.unmapped.map((u, i) => `<tr><td><b>${esc(u.group.displayName)}</b><div class="mini muted">${esc(u.group.membershipRule || "")}</div></td><td class="mini">${u.dynamic ? "dynamic" : "assigned"}</td><td class="mini">${u.overlaps ? `<span style="color:var(--report)">overlaps ${esc(u.overlaps)} — as a pilot that is expected; otherwise nesting both counts people twice</span>` : `<span class="muted">not in the country table</span>`}</td>
        <td class="mini"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><select id="mrPilotRegion${i}" aria-label="wave">${regionOpts}</select><button class="btn" data-mrmempilot="${esc(suffixOf(u.group))}" data-mrpilotsel="mrPilotRegion${i}">🧪 Add as pilot</button></div><div class="muted" style="margin-top:3px">device group ${esc(mcfg().deviceGroupPrefix + MdeMembers.suggestDeviceSuffix(suffixOf(u.group)))}</div></td></tr>`).join("");
      return `${chips}${top}<div class="list-card" style="margin-top:0"><p class="mini muted" style="margin:0 0 10px">Groups starting with <code>${esc(mcfg().countryPrefix)}</code> that the country table does not name. They are listed, never nested. <b>🧪 Add as pilot</b> puts one at the head of a wave (its own device group, named below) — for a pilot that goes in before the rest of the region. The table stays editable under ⚙️ Naming rules.</p>
        ${rows ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:36%"><col style="width:9%"><col style="width:25%"><col></colgroup><thead><tr><th>Group · rule</th><th>Type</th><th>Why it is here</th><th>Put it in a wave</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">None — every group with the prefix is in a wave.</p>`}</div>`;
    }
    const rg = m.regions.find((x) => x.region === mem.region) || m.regions[0];
    if (!rg) return `${chips}<div class="list-card" style="margin-top:0"><p class="mini muted" style="margin:0">The country table is empty — fill it under ⚙️ Naming rules.</p></div>`;
    const inTenant = rg.rows.filter((r) => r.ug), absent = rg.rows.filter((r) => !r.ug);
    const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
    const meter = (label, name, a, b, extra) => `<div><div class="mini muted">${esc(name || label)}</div><b>${a} of ${b}</b> <span class="mini muted">${extra}</span><div class="mr-meter"><i style="width:${pct(a, b)}%"></i></div></div>`;
    const selectable = inTenant.filter((r) => !(r.inSync && r.ugNested && r.dgNested));
    const allOn = selectable.length && selectable.every(memRowSel);
    const rows = inTenant.map((r) => {
      const done = r.inSync && r.ugNested && r.dgNested;
      return `<tr class="${memRowSel(r) ? "mr-selrow" : ""}"><td>${done ? `<span title="In sync and in both waves">✓</span>` : `<input type="checkbox" data-mrmemsel="${esc(r.key)}"${memRowSel(r) ? " checked" : ""} aria-label="select">`}</td>
        <td><a href="#" data-mrmemopen="${esc(r.key)}"><b>${esc(r.country)}</b></a>${r.pilot ? ` <span class="gu-how priv" title="A pilot group: it goes into the wave before the rest of the region. It may overlap a country group; its devices then sit in both device groups.">🧪 pilot${r.batch && !r.batch.finished ? " · in batches" : ""}</span>` : ""}<div class="mini muted">${esc(r.userGroupName)}</div></td>
        <td class="mini" style="text-align:right">${r.users.toLocaleString()}</td>
        <td class="mini" style="text-align:right">${r.devices.length.toLocaleString()}${r.usersNoDevice ? `<div class="muted"><a href="#" data-mrmemleftrow="${esc(r.key)}" title="🕳 who they are, and what Intune has for them">${plural(r.usersNoDevice, "user has", "users have")} none</a></div>` : ""}${r.problems.noEntra || r.problems.multi ? `<div style="color:var(--report)">${r.problems.noEntra + r.problems.multi} to look at</div>` : ""}</td>
        <td class="mini">${memCell(r)}</td>
        <td class="mini">${memNestCell(r)}</td></tr>${mem.open.has(r.key) ? memDetail(r) : ""}`;
    }).join("");
    const nSel = inTenant.filter(memRowSel).length;
    const o = mem.opts;
    const preview = MdeMembers.planOps(m, new Set(inTenant.filter(memRowSel).map((r) => r.key)), o, mcfg());
    const count = (t) => preview.ops.filter((x) => x.type === t);
    const adds = count("add").reduce((a, x) => a + x.ids.length, 0);
    const summary = nSel ? [count("create").length ? `create ${count("create").length}` : "", adds ? `add ${adds.toLocaleString()} device${adds === 1 ? "" : "s"}` : "", count("remove").length ? `remove ${count("remove").reduce((a, x) => a + x.ids.length, 0)}` : "", count("nest").length ? `nest ${count("nest").length} group${count("nest").length === 1 ? "" : "s"} into ${rg.region}` : ""].filter(Boolean).join(" · ") || "nothing to do for these" : "tick countries to plan";
    const tick = (id, key, label) => `<label class="chk" style="margin:0"><input type="checkbox" id="${id}" data-mrmemopt="${key}"${o[key] ? " checked" : ""}> ${label}</label>`;
    return `${chips}${top}<div class="list-card mr-stickyhost" style="margin-top:0">
      ${intro}
      <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end;margin-bottom:10px">
        ${meter("user wave", rg.wave.userName, rg.ugNested, inTenant.length, `country groups nested · ${rg.users.toLocaleString()} users`)}
        ${meter("device wave", rg.wave.deviceName, rg.dgNested, inTenant.length, `device groups nested · ${rg.devices.toLocaleString()} devices`)}
        <div class="mini muted" style="margin-left:auto">Read ${esc(new Date(m.readAt).toLocaleTimeString())} · devices by <b>Intune primary user</b> · Windows only · <a href="#" data-mrmemleftwhy="noPrimary">${m.noPrimary.toLocaleString()} of ${m.managedCount.toLocaleString()} have no primary user</a> and are in no country</div>
      </div>
      ${inTenant.length ? `<div style="overflow-x:auto"><table class="cg-table mr-memtable"><colgroup><col style="width:30px"><col style="width:23%"><col style="width:8%"><col style="width:13%"><col style="width:26%"><col></colgroup>
        <thead><tr><th><input type="checkbox" data-mrmemall="1"${allOn ? " checked" : ""} aria-label="select all in this wave"></th><th>Country · user group</th><th style="text-align:right">Users</th><th style="text-align:right">Win devices</th><th>Device group · sync</th><th>In the wave</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">None of this wave's country groups is in the tenant.</p>`}
      ${absent.length ? `<p class="mini muted" style="margin:8px 0 0">Not in this tenant: ${absent.map((r) => `<code>${esc(r.userGroupName)}</code>`).join(" ")}</p>` : ""}
      <div class="mr-mbar">
        <b>${plural(nSel, "country", "countries")}</b>
        ${tick("mrMemFill", "fill", "create &amp; fill device groups")}
        ${tick("mrMemNestU", "nestUsers", "nest user groups")}
        ${tick("mrMemNestD", "nestDevices", "nest device groups")}
        ${tick("mrMemRem", "removals", "apply removals")}
        <span class="mini" id="mrMemSum">${esc(summary)}</span>
        <button class="btn primary" id="mrMemDry"${nSel ? "" : " disabled"}>② Dry run</button>
      </div>
      <p class="mini muted" style="margin:8px 0 0">Order per country: create → fill (20 per request, then read back) → remove (only when ticked) → nest. A device group is nested only after it exists; a large nest is warned about (Microsoft Learn: “Don't make large group nesting changes all at once.”).</p>
    </div>`;
  }
  async function memDryRun(undoOf) {
    if (busy || (!mem.model && !(undoOf && undoOf.exclusions))) return;
    planAnchor = null; clearPlan(); seatPlan();
    let p;
    if (undoOf) p = MdeMembers.inverseOf(undoOf.done);
    else p = MdeMembers.planOps(mem.model, new Set(mem.model.rows.filter((r) => r.region === mem.region && mem.sel.has(r.key)).map((r) => r.key)), mem.opts, mcfg());
    plan = Object.assign(p, { members: true, exclusions: !!(undoOf && undoOf.exclusions), pilotsUndo: !!(undoOf && undoOf.pilots), title: undoOf ? `Undo: ${undoOf.title}` : `Wave members — ${plural(new Set(p.ops.map((x) => x.key)).size, "country", "countries")}` });
    renderMemPlan();
  }
  const OP_WORD = { create: "create group", add: "add devices", remove: "remove devices", nest: "nest", unnest: "take out" };
  const opWord = (x) => (x.type === "add" || x.type === "remove") && x.memberKind === "user" ? (x.type === "add" ? "add users" : "remove users") : OP_WORD[x.type];
  const opLabel = (x) => x.type === "create" ? `${x.name}` : x.type === "add" || x.type === "remove" ? `${x.group.name} · ${x.label}` : `${x.child.name} → ${x.parent.name}`;
  function renderMemPlan() {
    const p = plan;
    const country = (x) => { if (x.who || p.exclusions || p.pilotsOut || p.pilotsUndo) return x.who || ""; const r = mem.model && mem.model.rows.find((y) => y.key === x.key); return r ? r.country : x.key; };
    const rows = p.ops.map((x) => `<tr><td class="mini">${esc(country(x))}</td><td>${chip(x.type === "remove" || x.type === "unnest" ? "au-op delete" : x.type === "create" ? "gu-how priv" : "au-op create", opWord(x))}</td><td class="mini">${esc(opLabel(x))}${x.type === "nest" && x.size ? ` <span class="muted">(${plural(x.size, x.kind === "user" ? "user" : "device")})</span>` : ""}</td></tr>`).join("");
    planEl().innerHTML = `<div class="list-card" style="margin-top:14px;padding:16px 18px">
      <h4 style="margin:0 0 6px">② Plan — ${esc(p.title)}</h4>
      <p class="mini" style="margin:0 0 8px"><b>${plural(p.ops.length, "step")}</b>, run in this order and each read back.</p>
      ${p.warnings.length ? `<div class="gu-fail" style="margin-bottom:8px;border-color:var(--report)"><b>Large or lasting changes:</b><span class="why">${p.warnings.map(esc).join("<br>")}${p.warnings.some((w) => /at once/.test(w)) ? "<br>Microsoft Learn: “Don't make large group nesting changes all at once.” Intune re-evaluates every member." : ""}</span></div>` : ""}
      ${p.skipped.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>Left out, with the reason:</b><span class="why">${p.skipped.map(esc).join("<br>")}</span></div>` : ""}
      ${rows ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:18%"><col style="width:16%"><col></colgroup><thead><tr><th>${p.exclusions || p.pilotsOut || p.pilotsUndo ? "Who" : "Country"}</th><th>Step</th><th>What</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">Nothing to write.</p>`}
      <p class="mini muted" style="margin:8px 0 0">${p.pilotsOut
        ? "Each member was read in its wave just now, and is read again right before the write — one that has left its wave by then is skipped, not taken out of the pilot. Out of the pilot, the member gets the new policies through its wave and is kept out of the old ones by the wave's exclusion. Every run lands in 📜 with an undo that puts the members back."
        : p.exclusions
        ? "The exclusion groups are excluded from the new policies (⚡②): a member added here stops receiving them. A device taken out of its country device group leaves the wave, so the old policies reach it again. Every run lands in 📜 with an exact undo."
        : "Nesting links a group into a wave: its members start receiving what the wave is assigned (and, once ⚡③ ran, leave the old policies). Every run lands in 📜 with an exact undo."}</p>
      ${p.ops.length ? `<div style="margin-top:12px">
        ${p.hasRemoval ? `<label class="wi-f" style="margin-top:8px"><span>This plan REMOVES members or takes groups out of a wave — type <b>REMOVE</b> to allow it</span><input id="mrConfirmText" placeholder="REMOVE" autocomplete="off" spellcheck="false"></label>`
          : `<label class="chk" style="display:inline-flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="mrConfirmTick"> I have read the plan — ${plural(p.ops.length, "step")}</label>`}
        <div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="mrMemApply" disabled>④ Apply — write to the tenant</button><button class="btn" id="mrDiscard">Discard the plan</button></div>
      </div>` : `<div class="tb-actions" style="margin-top:10px"><button class="btn" id="mrDiscard">Close</button></div>`}
      <div id="mrLedger"></div>
    </div>`;
    const ok = () => { const t = $("mrConfirmText"), k = $("mrConfirmTick"); return t ? t.value.trim() === "REMOVE" : !!(k && k.checked); };
    const upd = () => { const b = $("mrMemApply"); if (b) b.disabled = !ok(); };
    if ($("mrConfirmText")) $("mrConfirmText").addEventListener("input", upd);
    if ($("mrConfirmTick")) $("mrConfirmTick").addEventListener("change", upd);
    if ($("mrMemApply")) $("mrMemApply").addEventListener("click", () => { if (ok()) applyMem(); });
    $("mrDiscard").addEventListener("click", clearPlan);
    showPlan();
  }
  async function applyMem() {
    if (busy || !plan || !plan.members) return;
    busy = true;
    const p = plan;
    try {
      await Graph.ensureScopes(GroupMigrate.SCOPES.groupWrite);
      $("mrMemApply").disabled = true;
      // 🧪 out of the pilot (10647): each member's wave, read again right
      // before the write; one no longer in it is left in the pilot
      let preSkipped = [];
      if (p.pilotsOut && p.pilotsOut.length) {
        const f = await pilotFresh(p.pilotsOut);
        const gone = p.pilotsOut.filter((x) => !f.ok.has(`${x.kind}|${x.id}`));
        if (gone.length) {
          const drop = new Set(gone.map((x) => x.id));
          p.ops = p.ops.map((o) => Object.assign({}, o, { ids: o.ids.filter((id) => !drop.has(id)), objs: (o.objs || []).filter((x) => !drop.has(x.id)) })).filter((o) => o.ids.length);
          preSkipped = gone.map((x) => `${x.name}: ${f.why.get(`${x.kind}|${x.id}`)} — left in the pilot`);
        }
      }
      let me = null;
      if (p.ops.some((x) => x.type === "create")) { try { me = await M.readMe(); } catch { me = null; } }
      const L = RunLedger.create($("mrLedger"), { unit: "steps", title: p.title, items: p.ops.map((x) => ({ label: `${opWord(x)} · ${opLabel(x)}`, sub: x.who || "" })) });
      const r = await MdeMembers.applyOps(p.ops, { ledger: L, me });
      L.finish();
      const createdGroups = [...r.created.entries()].map(([name, id]) => ({ id, displayName: p.ops.find((x) => x.type === "create" && lc(x.name) === name) ? p.ops.find((x) => x.type === "create" && lc(x.name) === name).name : name, groupTypes: [] }));
      if (mem.input) MdeMembers.patchInput(mem.input, r.done, createdGroups);
      if (found) for (const g of createdGroups) names.set(lc(g.id), g.displayName);
      memCompute();
      // ⊘ (10639): the exclusion lists move with the run, and the open card
      // is read again so what reaches it is the tenant's answer
      if (ex.base) MdeExclude.patchBase(ex.base, r.done);
      const okN = r.results.filter((x) => x.ok && x.verified).length;
      runs.push({ at: Date.now(), title: p.title, kind: "members", exclusions: !!p.exclusions, ok: okN, bad: r.results.length - okN, stopped: L.stopped, backup: { policies: [] },
        done: r.done, pilots: !!p.pilotsOut, lines: r.results.map((x) => `${opWord(x.op)} · ${opLabel(x.op)}${x.op.who ? ` (${x.op.who})` : ""}: ${x.ok ? (x.verified ? "done · verified" : "done · NOT verified") : (x.skipped ? "skipped" : "failed — " + (x.note || ""))}`).concat(preSkipped) });
      plan = null;
      if (p.exclusions) { ex.sel.clear(); if (ex.card) setTimeout(() => exPick(ex.card.pick, true), 0); }
      else if (p.pilotsOut) mem.pilSel.clear();
      else mem.sel.clear();
      const ledger = $("mrLedger").innerHTML;
      render();
      planEl().innerHTML = `<div class="list-card" style="margin-top:14px;padding:16px 18px"><h4 style="margin:0 0 6px">${esc(p.title)} — done</h4><div id="mrLedger">${ledger}</div><p class="mini muted" style="margin:8px 0 0">${preSkipped.length ? `<span style="color:var(--report)">${preSkipped.map(esc).join("<br>")}</span><br>` : ""}${okN} of ${r.results.length} steps written &amp; verified. The rows above moved with them; ↻ Read again for the tenant's own view. The run and its undo are in 📜 Changes this session.</p></div>`;
    } catch (e) {
      const el = document.createElement("div"); el.className = "gu-fail"; el.innerHTML = `<b>${esc(GroupUse.shortErr(e, 300))}</b>`;
      $("mrLedger").appendChild(el);
    } finally { busy = false; }
  }

  // -------------------------------------------------------- ⊘ exclusions --
  // Layout A off the mockup (10639): a header button opens this pane with
  // the cursor in the search. Search a user or a device, get both (the user
  // with their Windows devices, or the device with its primary user) and
  // what reaches each, tick, dry run. The plan opens under the card.
  const exOpt = () => ({ staleDays: mcfg().staleDays || 30 });
  function exGroups() {
    const pick = (aud) => { const w = waveRows.find((x) => x.role === "exclusion" && x.audience === aud); return w ? (w.group || (w.legacy && w.legacy.group) || null) : null; };
    return { user: pick("user"), device: pick("device") };
  }
  function exCtx() {
    const G = exGroups();
    return {
      groups: G, ticks: ex.ticks, keepOld: ex.keepOld,
      exUserId: G.user ? lc(G.user.id) : null, exDeviceId: G.device ? lc(G.device.id) : null,
      deviceWaveIds: new Set(waveRows.filter((w) => w.role === "wave" && w.audience === "device" && w.id).map((w) => w.id)),
      deviceGroupPrefix: mcfg().deviceGroupPrefix,
      skipIds: new Set(waveRows.map((w) => w.group || (w.legacy && w.legacy.group)).filter(Boolean).map((g) => lc(g.id))),
    };
  }
  let exNowCache = null;
  const exNow = () => {
    if (!ex.base) return null;
    const sig = `${ex.base.readAt}|${ex.base.users.length}|${ex.base.devices.length}|${ex.base.users.map((u) => u.id).join()}|${ex.base.devices.map((d) => d.id).join()}`;
    if (!exNowCache || exNowCache.sig !== sig) exNowCache = { sig, v: MdeExclude.excludedNow(ex.base, exOpt()) };
    return exNowCache.v;
  };
  async function exRead() {
    if (ex.loading) return;
    ex.loading = true; ex.error = ""; render();
    try {
      await Graph.ensureScopes(MdeExclude.scopes());
      ex.base = await MdeExclude.readBase(exGroups(), (m) => { const el = $("mrExProg"); if (el) el.textContent = m; });
    } catch (e) { ex.base = null; ex.error = GroupUse.shortErr(e, 300); }
    finally { ex.loading = false; render(); }
  }
  async function exSearch() {
    const input = $("mrExQ");
    ex.q = input ? input.value : ex.q;
    if (!ex.base) await exRead();
    if (!ex.base || ex.searching) return;
    ex.searching = true; ex.note = ""; render();
    try {
      const r = await MdeExclude.search(ex.q, ex.base, exOpt());
      ex.results = r.results;
      ex.note = r.note || [r.failed.length ? `Partly searched — ${r.failed.join("; ")}` : "", !r.results.length ? `Nothing found for “${r.term}”.` : ""].filter(Boolean).join(" ");
    } catch (e) { ex.results = []; ex.note = GroupUse.shortErr(e, 240); }
    finally { ex.searching = false; render(); const q = $("mrExQ"); if (q) q.focus(); }
  }
  // quiet: re-read after a run — the ticks the admin set are rebuilt from
  // the new state (what is excluded now is not offered again)
  async function exPick(pick, quiet) {
    if (!ex.base) return;
    ex.cardLoading = true; ex.cardError = ""; if (!quiet) ex.card = null; render();
    try {
      await Graph.ensureScopes(MdeExclude.scopes());
      ex.card = await MdeExclude.lookup(pick, ex.base, exOpt());
      for (const [id, n] of ex.card.names) if (!names.has(id)) names.set(id, n);
      ex.ticks = MdeExclude.defaultTicks(ex.card);
    } catch (e) { ex.cardError = GroupUse.shortErr(e, 300); }
    finally { ex.cardLoading = false; render(); }
  }
  function exDryRun() {
    if (busy || !ex.card) return;
    planAnchor = "mrExCard"; clearPlan(); seatPlan();
    const p = MdeExclude.planAdd(ex.card, exCtx());
    const who = ex.card.user ? ex.card.user.displayName : (ex.card.devices.find((d) => d.searched) || ex.card.devices[0] || {}).name || "";
    plan = Object.assign(p, { members: true, title: `Exclusion — ${who}` });
    renderMemPlan();
  }
  function exRemoveDryRun() {
    const n = exNow();
    if (busy || !n) return;
    const rows = n.rows.filter((r) => ex.sel.has(r.key));
    if (!rows.length) return;
    planAnchor = "mrExNow"; clearPlan(); seatPlan();
    const p = MdeExclude.planRemove(rows, exGroups());
    plan = Object.assign(p, { members: true, title: `Out of the exclusion groups — ${plural(rows.length, "row")}` });
    renderMemPlan();
  }
  const gName = (id) => names.get(lc(id)) || (ex.card && ex.card.names.get(lc(id))) || id;
  const shortDate = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? new Date(t).toLocaleDateString() : "never"; };
  const ago = (iso) => { const t = Date.parse(iso || ""); if (!Number.isFinite(t)) return "never"; const h = Math.round((Date.now() - t) / 3600000); return h < 48 ? `${Math.max(h, 0)} h ago` : `${Math.round(h / 24)} days ago`; };
  // the waves (by region) an object is in, from its transitive groups
  const wavesIn = (groups, aud) => waveRows.filter((w) => w.role === "wave" && w.audience === aud && w.id && groups && groups.has(w.id)).map((w) => w.region);
  function exReachHtml(rows) {
    if (!rows.length) return "";
    const via = (list, gen) => { const ids = [...new Set(list.flatMap((x) => x.via))].slice(0, 3); return ids.length ? `${gen} via ${ids.map((id) => /^All /.test(id) ? id : gName(id)).join(", ")}` : ""; };
    const why = (a) => [
      a.new.length ? `${a.new.length} new ${via(a.new, "")}` : "",
      a.keptOut.new.length ? `kept out of ${a.keptOut.new.length} new ${via(a.keptOut.new, "")}` : "",
      a.old.length ? `${a.old.length} old ${via(a.old, "")}` : "",
      a.keptOut.old.length ? `kept out of ${a.keptOut.old.length} old ${via(a.keptOut.old, "")}` : "",
    ].filter(Boolean).map((x) => x.replace(/\s+$/, "")).join(" · ") || "nothing in scope reaches it";
    const filt = (a) => a.new.concat(a.old).some((x) => x.filtered) ? ` <span class="muted" title="An assignment filter sits on an include — a browser cannot evaluate it">· filtered</span>` : "";
    const lines = rows.map((r) => {
      const label = r.kind === "user" ? `👤 ${esc(r.obj.displayName)} <span class="muted">(- U - policies)</span>` : `💻 ${esc(r.obj.name)} <span class="muted">(- D - policies)</span>`;
      const after = r.after ? `<tr class="mr-exafter"><td class="mini">→ after the run</td><td class="mini"><b>${r.after.new.length}</b></td><td class="mini"><b${r.between ? ` style="color:var(--off)"` : ""}>${r.after.old.length}${r.between ? " ⚠" : ""}</b></td>
        <td class="mini">${r.between ? `<b style="color:var(--off)">Falls between the sets: nothing in scope reaches it</b>${r.kind === "user" ? " — the user stays in the dynamic country group, so in the user wave, which the old - U - policies exclude. T28 cannot take a user out of a dynamic group." : ""}` : r.leaves && r.leaves.length ? `out of ${esc(r.leaves.map((g) => g.name).join(", "))} — leaves the wave, back on the old set` : esc(why(r.after))}</td></tr>` : "";
      return `<tr><td class="mini">${label}</td><td class="mini" style="color:var(--on);font-weight:700">${r.before.new.length}</td><td class="mini">${r.before.old.length}</td><td class="mini">${esc(why(r.before))}${filt(r.before)}</td></tr>${after}`;
    }).join("");
    return `<div class="list-card mr-exreach" style="margin-top:12px"><h4 style="margin:0 0 6px">What reaches them <span class="mini muted" style="font-weight:400">— in-scope policies, from the last read · assignment filters are not evaluated</span></h4>
      <div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30%"><col style="width:64px"><col style="width:64px"><col></colgroup><thead><tr><th>Who</th><th>New</th><th>Old</th><th>Why</th></tr></thead><tbody>${lines}</tbody></table></div></div>`;
  }
  function exCardHtml() {
    if (ex.cardLoading && !ex.card) return `<div class="list-card" style="margin-top:12px"><p class="mini" style="margin:0">Reading the user, the devices and their groups…</p></div>`;
    if (ex.cardError) return `<div class="list-card" style="margin-top:12px"><div class="gu-fail"><b>${esc(ex.cardError)}</b></div></div>`;
    const c = ex.card;
    if (!c) return "";
    const G = exGroups();
    const u = c.user;
    const tick = (key, on, dis, label) => `<input type="checkbox" data-mrextick="${esc(key)}"${on ? " checked" : ""}${dis ? " disabled" : ""} aria-label="${esc(label)}">`;
    const countryOf = (groups) => [...(groups || [])].map(gName).filter((n) => lc(n).startsWith(lc(mcfg().countryPrefix)));
    const userHtml = u ? `<div class="mr-expc">
        <h4 style="margin:0 0 6px"><label style="display:flex;gap:8px;align-items:center">${tick(`u:${u.id}`, ex.ticks.has(`u:${u.id}`), u.excluded || !G.user, "exclude the user")} 👤 ${esc(u.displayName)}</label></h4>
        <dl class="mr-exkv">
          <dt>UPN</dt><dd>${esc(u.upn || "—")}</dd>
          <dt>Country group</dt><dd>${esc(countryOf(u.groups).join(", ") || (u.groups ? "none" : "not read"))}</dd>
          <dt>Wave</dt><dd>${u.groups ? (wavesIn(u.groups, "user").map((r) => `🌊 ${esc(r)}`).join(", ") || "none") : "not read"}</dd>
          <dt>User exclusion</dt><dd>${u.excluded ? chip("au-op create", "excluded") : G.user ? `<span class="muted">not in</span>${ex.ticks.has(`u:${u.id}`) ? " → will be added" : ""}` : `<span style="color:var(--off)">${esc(cfg.exclusionUser)} does not exist — create it in 🌊</span>`}</dd>
        </dl></div>`
      : `<div class="mr-expc"><h4 style="margin:0 0 6px">👤 No primary user</h4><p class="mini muted" style="margin:0">Intune names no primary user for this device${c.devices[0] && !c.devices[0].managed ? " — it is an Entra device Intune does not manage" : ""}.</p></div>`;
    const drows = c.devices.map((d) => {
      const can = !d.excluded && d.objId && G.device;
      const cg = MdeExclude.countryGroupsOf(d, exCtx()).map((g) => g.name);
      const waves = wavesIn(d.groups, "device");
      const st = d.excluded ? chip("au-op create", "excluded") : `<span class="muted">no</span>`;
      return `<tr class="${ex.ticks.has(d.key) ? "mr-selrow" : ""}${!d.objId ? " mr-exdis" : ""}"><td>${tick(d.key, ex.ticks.has(d.key), !can, `exclude ${d.name}`)}</td>
        <td><b>${esc(d.name)}</b>${d.searched ? ` <span class="gu-how priv">searched</span>` : ""}<div class="mini muted">${esc(d.os ? `Windows ${d.os}`.replace(/^Windows Windows/, "Windows") : (d.managed ? "Windows" : ""))}${d.disabled ? " · disabled in Entra" : ""}</div>${d.problem ? `<div class="mini" style="color:var(--off)">${esc(d.problem)}</div>` : ""}</td>
        <td class="mini">${d.managed ? `${esc(ago(d.lastSync))}${d.stale ? ` ${chip("gu-how priv", "stale")}` : ""}` : `<span class="muted">not in Intune</span>`}</td>
        <td class="mini">${esc(cg.join(", ") || "—")}${waves.length ? `<div>${waves.map((r) => `🌊 ${esc(r)}`).join(", ")}</div>` : ""}</td>
        <td class="mini">${st}</td></tr>`;
    }).join("");
    const devHtml = `<div class="mr-expc"><h4 style="margin:0 0 6px">💻 ${u ? `${esc(u.displayName)}'s Windows devices` : "The device"} <span class="mini muted" style="font-weight:400">(Intune primary user)</span></h4>
      ${c.devices.length ? `<div style="overflow-x:auto"><table class="cg-table"><colgroup><col style="width:30px"><col><col style="width:18%"><col style="width:28%"><col style="width:92px"></colgroup><thead><tr><th></th><th>Device</th><th>Last sync</th><th>Group · wave</th><th>Excluded</th></tr></thead><tbody>${drows}</tbody></table></div>` : `<p class="mini muted" style="margin:0">No Windows device in Intune has this user as its primary user.</p>`}
      <p class="mini muted" style="margin:6px 0 0">${c.pick.type === "user" ? `Ticked: the user and every device that synced in the last ${exOpt().staleDays} days.` : "Ticked: the device you searched — its user stays as they are unless you tick them."} Stale devices are shown, not ticked.</p></div>`;
    const rows = MdeExclude.assess(c, model, exCtx());
    const plan0 = MdeExclude.planAdd(c, exCtx());
    const nU = plan0.ops.filter((x) => x.type === "add" && x.memberKind === "user").reduce((a, x) => a + x.ids.length, 0);
    const nD = plan0.ops.filter((x) => x.type === "add" && x.memberKind === "device").reduce((a, x) => a + x.ids.length, 0);
    const nOut = plan0.ops.filter((x) => x.type === "remove").reduce((a, x) => a + x.ids.length, 0);
    const sum = nU || nD ? [nU ? `<b>${plural(nU, "user")}</b> → ${esc(G.user ? G.user.displayName : "")}` : "", nD ? `<b>${plural(nD, "device")}</b> → ${esc(G.device ? G.device.displayName : "")}` : "", nOut ? `${plural(nOut, "device")} out of the country device group` : ""].filter(Boolean).join(" · ") : "tick the user or a device";
    return `<div id="mrExCard">
      ${c.failed.length ? `<div class="gu-fail" style="margin-top:12px"><b>Partly read:</b><span class="why">${c.failed.map(esc).join("<br>")}</span></div>` : ""}
      <div class="mr-expair">${userHtml}${devHtml}</div>
      ${exReachHtml(rows)}
      <div class="mr-mbar" id="mrExBar"><span>${sum}</span>
        <label class="chk" style="margin:0" title="⚔️ action ③ takes the waves out of the old policies — a wave device excluded from the new set would get neither"><input type="checkbox" id="mrExKeep"${ex.keepOld ? " checked" : ""}> keep devices on the old set (out of their country device group)</label>
        <button class="btn primary" id="mrExDry"${nU || nD ? "" : " disabled"}>② Dry run</button></div>
      ${ex.cardLoading ? `<p class="mini muted" style="margin:6px 0 0">Reading again…</p>` : ""}
    </div>`;
  }
  function exNowHtml() {
    const n = exNow();
    if (!n) return "";
    const G = exGroups();
    const rows = n.rows.map((r) => {
      const who = r.user ? `👤 ${esc(r.user.displayName)} ${r.user.excluded ? chip("au-op create", "excluded") : `<span class="muted mini">not excluded</span>`}${r.user.upn && r.user.upn !== r.user.displayName ? `<div class="mini muted">${esc(r.user.upn)}</div>` : ""}` : `<span class="muted">no primary user</span>`;
      const devs = r.devices.length ? r.devices.map((d) => `<div>💻 ${esc(d.name)} ${d.excluded ? chip("au-op create", "excluded") : chip("gu-how priv", d.stale ? "not excluded · stale" : "not excluded")}</div>`).join("") : `<span class="muted">no Windows device</span>`;
      const state = r.state === "half" ? `<b style="color:var(--off)">half: the - D - policies still reach ${esc(r.missing.map((d) => d.name).join(", "))}</b> <button class="btn" data-mrexfix="${esc(r.key)}">+ add device</button>`
        : r.state === "both" ? "both" : r.state === "user" ? `<span class="muted">user, no Windows device</span>` : `<span class="muted">device only</span>`;
      return `<tr class="${ex.sel.has(r.key) ? "mr-selrow" : ""}"><td><input type="checkbox" data-mrexsel="${esc(r.key)}"${ex.sel.has(r.key) ? " checked" : ""} aria-label="select"></td><td class="mini">${who}</td><td class="mini">${devs}</td><td class="mini">${state}</td></tr>`;
    }).join("");
    return `<div class="list-card" id="mrExNow" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><h4 style="margin:0">Excluded now</h4>
        <span class="mini muted">${esc(G.user ? G.user.displayName : cfg.exclusionUser)} <b>${n.users}</b> · ${esc(G.device ? G.device.displayName : cfg.exclusionDevice)} <b>${n.devices}</b> · read ${esc(new Date(ex.base.readAt).toLocaleTimeString())} <button class="btn" id="mrExRead">↻ Read again</button></span></div>
      ${rows ? `<div style="overflow-x:auto;margin-top:8px"><table class="cg-table"><colgroup><col style="width:30px"><col style="width:28%"><col style="width:30%"><col></colgroup><thead><tr><th></th><th>User</th><th>Their devices</th><th>State</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="tb-actions" style="margin-top:8px"><button class="btn" id="mrExRemDry"${ex.sel.size ? "" : " disabled"}>Take ${plural(ex.sel.size, "row")} out → dry run</button><span class="mini muted">Direct members only. A removal is typed: REMOVE.</span></div>`
        : `<p class="mini muted" style="margin:8px 0 0">Nobody is in the exclusion groups.</p>`}
    </div>`;
  }
  function exclusionsPane() {
    const G = exGroups();
    const intro = `<p class="mini muted" style="margin:0 0 10px">Search a user (name, UPN, e-mail) or a device (name). A user comes with their Windows devices, a device with its primary user, and each with what reaches it. Users go to <code>${esc(G.user ? G.user.displayName : cfg.exclusionUser)}</code> (the <code>- U -</code> policies), devices to <code>${esc(G.device ? G.device.displayName : cfg.exclusionDevice)}</code> (the <code>- D -</code> ones). An excluded device also leaves its country device group, so it stays on the old set.</p>`;
    const missingG = [!G.user ? cfg.exclusionUser : "", !G.device ? cfg.exclusionDevice : ""].filter(Boolean);
    const warn = missingG.length ? `<div class="gu-fail" style="margin-bottom:10px;border-color:var(--report)"><b>${missingG.map(esc).join(" and ")} ${missingG.length === 1 ? "does" : "do"} not exist.</b><span class="why">Create ${missingG.length === 1 ? "it" : "them"} in <a href="#" data-mrpane="waves">🌊 Wave groups</a> first; until then that side cannot be added.</span></div>` : "";
    if (!ex.base) return `<div class="list-card" style="margin-top:0">${intro}${warn}
      ${ex.error ? `<div class="gu-fail" style="margin-bottom:10px"><b>${esc(ex.error)}</b></div>` : ""}
      ${ex.loading ? `<p class="mini" id="mrExProg" style="margin:0">Reading…</p>` : `<div class="tb-actions"><button class="btn primary" id="mrExRead">⊘ Read the exclusion groups and devices</button></div><p class="mini muted" style="margin:8px 0 0">Reads both exclusion groups and every Windows device in Intune (its primary user). Read-only.</p>`}</div>`;
    const res0 = ex.results || [];
    const hits = res0.map((h, i) => `<button type="button" class="mr-exhit${ex.card && ex.card.pick === h ? " on" : ""}" data-mrexpick="${i}">
        <span class="mr-exk${h.type === "device" ? " d" : ""}">${h.type === "user" ? "USER" : "DEVICE"}</span><b>${esc(h.type === "user" ? h.displayName : h.name)}</b>
        <span class="muted">${esc(h.type === "user" ? h.upn : (h.primary ? `primary user ${h.primary}` : h.managed ? "no primary user" : "not in Intune"))}</span>
        <span class="mr-exr">${h.type === "user" ? `${plural(h.devices, "Windows device")}` : esc(h.os || "")}${h.excluded ? ` · <b style="color:var(--on)">excluded</b>` : ""}${h.stale ? " · stale" : ""}</span></button>`).join("");
    return `<div class="list-card mr-stickyhost" style="margin-top:0">${intro}${warn}
      <div class="mr-exsearch"><input id="mrExQ" type="search" placeholder="Search a user or device…" value="${esc(ex.q)}" autocomplete="off" spellcheck="false" aria-label="Search a user or device"><button class="btn primary" id="mrExGo"${ex.searching ? " disabled" : ""}>${ex.searching ? "Searching…" : "Search"}</button></div>
      ${ex.note ? `<p class="mini muted" style="margin:6px 0 0">${esc(ex.note)}</p>` : ""}
      ${hits ? `<div class="mr-exresults">${hits}</div>` : ""}
      ${exCardHtml()}
    </div>${exNowHtml()}`;
  }
  function openExclusions() {
    pane = "exclusions"; view.cat = null; view.state = null; view.q = "";
    render();
    const q = $("mrExQ"); if (q) q.focus();
    if (!ex.base && !ex.loading) exRead().then(() => { const x = $("mrExQ"); if (x) x.focus(); });
  }

  // ---------------------------------------------------------- 📑 reports --
  // Three reports, each a self-contained HTML page and a CSV (MdeReports).
  const repMeta = () => ({ tenant: tenantName(), readAt: res && res.readAt, build: typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "", now: Date.now() });
  const repCtx = () => ({ cfg, waveRows, kinds, labels, mem: mem.model, retire, runs, labelName: M.labelName, labelValue: M.labelValue, catMeta: M.catMeta, RETIRE: M.RETIRE });
  function runAssignReport() {
    if (reps.busy || running || busy) return;
    reps.error = "";
    const ctx = repCtx();
    const cov = MdeReports.coverage(model, ctx);
    reps.assign = { at: Date.now(), html: MdeReports.assignmentsHtml(model, ctx, repMeta()), csv: MdeReports.assignmentsCsv(model, ctx), cov, ...reportSnapshot() };
    render();
  }
  async function runConfigReport() {
    if (reps.busy || running || busy || mem.loading) return;
    reps.error = "";
    reps.busy = "config"; render();
    try {
      if (!mem.model) {
        const back = pane;
        await memRead();
        pane = back;
      }
      let owners = new Map();
      try { owners = await MdeReports.readOwners(waveRows.filter((w) => w.exists).map((w) => w.group)); } catch { owners = new Map(); }
      const ctx = Object.assign(repCtx(), { owners });
      reps.config = { at: Date.now(), html: MdeReports.configHtml(model, ctx, repMeta()), csv: MdeReports.configCsv(model, ctx), members: !!mem.model, membersAt: mem.model && mem.model.readAt, ownersAt: Date.now(), ...reportSnapshot() };
    } catch (e) { reps.error = `Configuration report failed: ${GroupUse.shortErr(e, 250)}`; }
    finally { reps.busy = ""; render(); }
  }
  async function runConflictCheck() {
    if (reps.busy || running || busy) return;
    reps.error = "";
    reps.busy = "conflicts"; render();
    try {
      const refreshed = await run(false); // a fresh read, never relabel an old model as fresh
      if (!refreshed || !model) { reps.error = "Fresh read failed. The previous report, if any, is retained; no new check was saved."; return; }
      const summary = MdeReports.conflictSummary(pairs, M.needsAction);
      const prev = reps.checks.length ? reps.checks[reps.checks.length - 1] : null;
      const diff = MdeReports.conflictDiff(prev, summary);
      reps.checks.push(Object.assign({ at: Date.now() }, summary));
      const ctx = { labels, labelName: M.labelName, labelValue: M.labelValue, VERDICT: M.VERDICT, TYPE: M.TYPE, needsAction: M.needsAction, summary, diff };
      reps.conflicts = { at: Date.now(), html: MdeReports.conflictsHtml(pairs, ctx, repMeta()), csv: M.csv(pairs), summary, diff, ...reportSnapshot() };
    } catch (e) { reps.error = `Conflict check failed: ${GroupUse.shortErr(e, 250)}`; }
    finally { reps.busy = ""; pane = "reports"; render(); }
  }
  const REPORTS = [
    { id: "assign", icon: "📋", title: "Assignments", source: "Current policy snapshot", description: "Coverage by wave, plus every assignment with its target, group kind, members, filter and rollout role." },
    { id: "config", icon: "🧾", title: "Deployment configuration", source: "Policies, members & owners", description: "Naming rules, wave groups, members, policy settings, retirement evidence and changes this session." },
    { id: "conflicts", icon: "⚔️", title: "Conflict check", source: "Fresh tenant read", description: "Compare the new and old settings, their reach and proposed fixes. Each check shows what changed since the previous check this session." },
  ];
  const reportTime = (at) => at ? new Date(at).toLocaleString() : "Not read";
  const shortTime = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  // A saved report predates the current read, rules, member read or writes.
  function reportStale(id) {
    const r = reps[id];
    return !!r && (r.source !== res || r.rules !== JSON.stringify(cfg) || r.runCount !== runs.length || (id !== "conflicts" && r.memberSource !== mem.model));
  }
  const reportSnapshot = () => ({ readAt: res && res.readAt, source: res, memberSource: mem.model, rules: JSON.stringify(cfg), runCount: runs.length,
    missing: (model.missing || []).map((x) => x.id) });
  // Preview the exact saved export, not the current mutable policy model.
  // The HTML is generated by MdeReports, which escapes every tenant value.
  function reportPreview(report, id) {
    const holder = document.createElement("div");
    holder.innerHTML = report.html;
    const wrap = holder.querySelector(".wrap");
    if (!wrap) return "";
    const drop = (el) => { if (el) el.remove(); };   // (no optional chaining — house rule)
    drop(wrap.querySelector("h1"));
    drop(wrap.querySelector(".meta"));
    // Long exception lists are evidence, not another wall above the matrix.
    for (const note of [...wrap.querySelectorAll(".note")]) {
      if (note.textContent.length < 300) continue;
      const fold = document.createElement("details"); fold.className = "mr-report-section";
      const summary = document.createElement("summary");
      summary.textContent = note.textContent.split(":")[0];
      note.replaceWith(fold); fold.append(summary, note);
    }
    if (id === "assign") {
      const coverage = wrap.querySelector("table");
      if (coverage) {
        const groups = document.createElement("div");
        const rows = [...coverage.rows];
        let groupTable = null;
        for (const row of rows.slice(1)) {
          if (row.classList.contains("head")) {
            const fold = document.createElement("details"); fold.className = "mr-report-group";
            fold.open = !groups.children.length;
            const summary = document.createElement("summary"); summary.textContent = row.textContent;
            groupTable = document.createElement("table"); groupTable.appendChild(rows[0].cloneNode(true));
            fold.append(summary, groupTable); groups.appendChild(fold);
          } else if (groupTable) groupTable.appendChild(row.cloneNode(true));
        }
        if (groups.children.length) coverage.replaceWith(groups);
      }
    }
    const footer = wrap.lastElementChild;
    let section = null;
    let firstSection = true;
    for (const child of [...wrap.children]) {
      if (child.tagName === "H2") {
        section = document.createElement("details");
        section.className = "mr-report-section";
        // The useful first result stays visible; supporting evidence folds.
        section.open = firstSection;
        firstSection = false;
        const summary = document.createElement("summary");
        summary.textContent = child.textContent;
        child.replaceWith(section); section.appendChild(summary);
      } else if (section && child !== footer) section.appendChild(child);
    }
    // Tables scroll within the report; long names remain intact.
    for (const table of [...wrap.querySelectorAll("table")]) {
      if (table.parentElement.closest("table")) continue;
      const scroll = document.createElement("div"); scroll.className = "mr-report-table";
      scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Report table — scroll horizontally for all columns"); scroll.tabIndex = 0;
      table.replaceWith(scroll); scroll.appendChild(table);
    }
    return `<div class="mr-document" data-report-preview="${id}">${wrap.innerHTML}</div>`;
  }
  function reportsPane() {
    const def = REPORTS.find((r) => r.id === reps.selected) || REPORTS[0];
    const r = reps[def.id];
    const stale = reportStale(def.id);
    const exports = r ? `<details class="mr-export"><summary class="btn">Export ▾</summary><div class="mr-export-menu"><button class="btn" data-mrrepopen="${def.id}">Open report in new tab</button><button class="btn" data-mrrep="${def.id}" data-mrrepfmt="html">HTML report</button><button class="btn" data-mrrep="${def.id}" data-mrrepfmt="csv">${def.id === "config" ? "Policy settings CSV" : def.id === "conflicts" ? "Collisions CSV" : "Assignments CSV"}</button></div></details>` : "";
    const metadata = r ? `<div class="mr-report-meta"><span><b>Policy data</b> ${esc(reportTime(r.readAt))}</span><span><b>Generated</b> ${esc(reportTime(r.at))}</span>${r.membersAt ? `<span><b>Members</b> ${esc(reportTime(r.membersAt))}</span>` : ""}${r.ownersAt ? `<span><b>Owners attempted</b> ${esc(reportTime(r.ownersAt))}</span>` : ""}</div>` : "";
    const warning = stale ? `<p class="mr-report-notice">This saved report predates the current policy/member read, rules or session changes. Generate it again to update the preview and exports.</p>` : "";
    const missing = r && r.missing.length ? `<p class="mr-report-notice">Incomplete policy read: ${r.missing.map(esc).join(", ")}. These surfaces are not included in this report.</p>` : "";
    const memberWarning = r && def.id === "config" && !r.members ? `<p class="mr-report-notice">Wave members could not be read; that report section is incomplete.</p>` : "";
    const jump = r && def.id === "conflicts" ? `<p class="mini mr-report-jump"><a href="#" data-mrpane="conflicts">Open Conflicts to review proposed changes →</a></p>` : "";
    return `<section id="mrReportPanel" class="mr-report-panel" aria-label="${esc(def.title)}"><div class="mr-report-heading"><div><h3>${def.icon} ${esc(def.title)}</h3><p class="mini">${esc(def.description)} <span class="muted">· ${esc(def.source)} · the latest of each report is kept for this session</span></p></div><div class="tb-actions"><button class="btn primary" id="mrRep_${def.id}"${reps.busy || running || busy || mem.loading ? " disabled" : ""}>${reps.busy === def.id ? "Running…" : def.id === "conflicts" ? "Run fresh check" : r ? "↻ Generate again" : "Generate report"}</button>${exports}</div></div>${metadata}${warning}${missing}${memberWarning}${reps.error ? `<p class="mr-report-notice" role="alert">${esc(reps.error)}</p>` : ""}${jump}${r ? reportPreview(r, def.id) : `<div class="mr-report-empty"><h4>No report generated yet</h4><p>${esc(def.id === "conflicts" ? "Run a fresh read to check conflicts. This does not apply changes." : def.id === "config" ? "Generate from the current policy snapshot. Wave members are read if needed, and owners are requested when you generate." : "Generate from the current policy snapshot. Refresh the tenant first if you need newer data.")}</p></div>`}</section>`;
  }
  function openReport(id) {
    const r = reps[id];
    if (!r) return;
    const url = URL.createObjectURL(new Blob([r.html], { type: "text/html" }));
    const win = window.open(url, "_blank", "noopener");
    if (!win) download(`MDE-rollout-${id}-${stamp()}.html`, r.html, "text/html");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ----------------------------------------------------- rename waves --
  // (10635) Groups still carrying an earlier wave name: PATCH the name, read
  // it back, and log the run so 📜 can rename them back.
  async function renameWaves(list, back) {
    if (busy) return;
    busy = true;
    try {
      await Graph.ensureScopes(GroupMigrate.SCOPES.groupWrite);
      if ($("mrRenameGo")) $("mrRenameGo").disabled = true;
      const L = RunLedger.create($("mrWaveLedger") || planEl(), { unit: "groups", title: back ? "renaming back" : "renaming rollout groups", items: list.map((x) => ({ label: `${x.from} → ${x.to}`, sub: "display name + mail nickname" })) });
      const done = [], lines = [];
      let okN = 0;
      for (let i = 0; i < list.length; i++) {
        const x = list[i];
        if (L.stopped) { L.skip(i, "stopped"); lines.push(`${x.from}: skipped`); continue; }
        L.start(i);
        try {
          const r = await M.renameGroup({ id: x.id, displayName: x.from }, x.to);
          if (!r.ok) { L.fail(i, r.why, "not renamed"); lines.push(`${x.from}: ${r.why}`); continue; }
          if (found) { found.set(lc(x.to), r.group); if (found.get(lc(x.from)) && lc(found.get(lc(x.from)).id) === lc(x.id)) found.set(lc(x.from), null); }
          names.set(lc(x.id), x.to);
          done.push({ id: x.id, from: x.from, to: x.to });
          if (r.verified) { L.done(i, r.note, "renamed · verified"); okN++; lines.push(`${x.from} → ${x.to}: renamed · verified${r.note ? " — " + r.note : ""}`); }
          else { L.fail(i, "the read-back does not show the new name yet", "renamed · NOT verified"); lines.push(`${x.from} → ${x.to}: renamed · not verified`); }
        } catch (e) { const why = GroupUse.shortErr(e, 200); L.fail(i, why); lines.push(`${x.from}: failed — ${why}`); }
      }
      L.finish();
      selRename.clear();
      derive();
      runs.push({ at: Date.now(), title: back ? `Rename ${plural(list.length, "group")} back` : `Rename ${plural(list.length, "rollout group")}`, kind: "rename", ok: okN, bad: list.length - okN, stopped: L.stopped, backup: { policies: [] }, done, lines });
      const ledger = ($("mrWaveLedger") || planEl()).innerHTML;
      render();
      if ($("mrWaveLedger")) $("mrWaveLedger").innerHTML = ledger;
    } catch (e) {
      const el = $("mrWaveLedger"); if (el) el.innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
    } finally { busy = false; }
  }

  // ----------------------------------------------------- create waves --
  async function createWaves() {
    if (busy || !selWaves.size || !$("mrWaveOk").checked) return;
    busy = true;
    const list = [...selWaves];
    try {
      await Graph.ensureScopes(GroupMigrate.SCOPES.groupWrite);
      $("mrWaveCreate").disabled = true;
      // the creator is the owner (10633): who is signed in, in this tenant
      let me = null;
      try { me = await M.readMe(); } catch { me = null; }
      const L = RunLedger.create($("mrWaveLedger"), { unit: "groups", title: "creating rollout groups", items: list.map((n) => { const d = cfg.groups.find((g) => lc(g.name) === lc(n)); return { label: n, sub: `${d ? `${d.audience} ${d.role === "exclusion" ? "exclusion" : "wave"} · ` : ""}assigned security group` }; }) });
      const lines = [];
      let okN = 0;
      for (let i = 0; i < list.length; i++) {
        if (L.stopped) { L.skip(i, "stopped"); lines.push(`${list[i]}: skipped`); continue; }
        L.start(i, "checking the name…");
        try {
          const def = cfg.groups.find((g) => lc(g.name) === lc(list[i]));
          const r = await M.createWave(list[i], def && def.role === "exclusion" ? cfg.exclusionDescription : cfg.waveDescription, me);
          const who = me ? (me.userPrincipalName || me.displayName || "you") : "";
          if (r.skipped) { L.skip(i, r.why); lines.push(`${list[i]}: ${r.why}`); }
          else if (!r.verified) { L.fail(i, r.verifyError, "created · NOT verified"); lines.push(`${list[i]}: created · not verified — ${r.verifyError}`); }
          else if (me && !r.ownerVerified) { L.fail(i, `created, but you are not its owner — ${r.ownerNote || "the owners read does not list you"}. Add yourself in Entra (Groups → Owners).`, "created · owner NOT set"); lines.push(`${list[i]}: created · verified, owner NOT set — ${r.ownerNote}`); }
          else { L.done(i, r.ownerNote || "", me ? "created · verified · owner: you" : "created · verified"); okN++; lines.push(`${list[i]}: created · verified${me ? ` · owner ${who}` : " · owner not read (the signed-in user could not be read)"} (${r.group.id})`); }
          if (found && r.group) found.set(lc(list[i]), r.group);
          if (r.group && r.group.id) names.set(lc(r.group.id), r.group.displayName || list[i]);
        } catch (e) { const why = GroupUse.shortErr(e, 200); L.fail(i, why); lines.push(`${list[i]}: failed — ${why}`); }
      }
      L.finish();
      selWaves.clear();
      // the new groups are empty assigned groups — their kind comes from the name until someone joins
      const ids = list.map((n) => found && found.get(lc(n))).filter((g) => g && g.id).map((g) => lc(g.id));
      try { kinds = await M.readKinds(ids, null, kinds); } catch { /* kinds stay by name */ }
      derive();
      runs.push({ at: Date.now(), title: `Create ${plural(list.length, "rollout group")}`, kind: "groups", ok: okN, bad: list.length - okN, stopped: L.stopped, backup: { policies: [] }, lines });
      const ledger = $("mrWaveLedger").innerHTML;
      render();
      if ($("mrWaveLedger")) $("mrWaveLedger").innerHTML = ledger;
    } catch (e) {
      const el = $("mrWaveLedger"); if (el) el.innerHTML = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>`;
    } finally { busy = false; }
  }

  // ------------------------------------------------------------ popout --
  function openPolicy(key) {
    const P = model && model.byKey.get(key);
    if (!P) return;
    const editable = typeof AssignEditTool !== "undefined" && AssignEditTool.canEdit && AssignEditTool.canEdit(P.sectionId);
    $("mrPopBody").innerHTML = `${Docs.popoutHtml(P.sec, P.item)}
      <div class="gu-m-foot">
        ${editable ? `<button class="btn" id="mrPopEdit" title="Open ✏️ the Assignment editor with this policy selected">✏️ Assignment editor</button>` : ""}
        <div class="spacer"></div>
        <button class="btn primary" id="mrPopClose">Close</button>
      </div>`;
    $("mrPop").classList.add("open");
    $("mrPopClose").addEventListener("click", closePolicy);
    if (editable) $("mrPopEdit").addEventListener("click", () => { closePolicy(); AssignEditTool.openWith(P.sectionId, P.id); });
    $("mrPop").onclick = (e) => { if (e.target === $("mrPop")) closePolicy(); };
    document.addEventListener("keydown", onEsc);
  }
  function closePolicy() { $("mrPop").classList.remove("open"); document.removeEventListener("keydown", onEsc); }
  function onEsc(e) { if (e.key === "Escape") closePolicy(); }

  // ------------------------------------------------------------ export --
  function exportAs(fmt) {
    if (!model) return;
    if (fmt === "md") return download(`MDE-rollout-${stamp()}.md`, M.markdown(model, pairs, retire, waveRows, { tenant: tenantName(), readAt: res && res.readAt, build: typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "" }), "text/markdown");
    return download(`MDE-rollout-collisions-${stamp()}.csv`, M.csv(pairs), "text/csv");
  }

  // -------------------------------------------------------------- init --
  function init() {
    if (!$("mrRun")) return;
    planEl();
    $("mrRun").addEventListener("click", () => run(false));
    if ($("mrExclude")) $("mrExclude").addEventListener("click", openExclusions);
    $("mrMd").addEventListener("click", () => exportAs("md"));
    $("mrCsv").addEventListener("click", () => exportAs("csv"));
    const body = $("mrBody");
    const focusOn = (sel) => { const el = body.querySelector(sel); if (el) el.focus(); };
    const go = (p) => { pane = p; view.cat = null; view.state = null; view.q = ""; render(); focusOn(`.mr-navigation [data-mrpane="${p}"]`); };
    body.addEventListener("click", (e) => {
      const t = e.target;
      const rdb = t.closest("[data-mrread]"); if (rdb) { run(rdb.dataset.mrread === "attach"); return; }
      const reportChoice = t.closest("[data-mrreport]");
      if (reportChoice) { reps.selected = reportChoice.dataset.mrreport; reps.error = ""; pane = "reports"; render(); focusOn(`[data-mrreport="${reps.selected}"]`); return; }
      const nd = t.closest("[data-mrpane]"); if (nd) { e.preventDefault(); go(nd.dataset.mrpane); return; }
      const op = t.closest("[data-mropen]"); if (op) { e.preventDefault(); openPolicy(op.dataset.mropen); return; }
      const c = t.closest("[data-mrcat]"); if (c) { view.cat = c.dataset.mrcat || null; render(); return; }
      const st = t.closest("[data-mrstate]"); if (st) { view.state = st.dataset.mrstate || null; render(); return; }
      const ss = t.closest("[data-mrstatus]"); if (ss) { view.status = ss.dataset.mrstatus; render(); return; }
      const fo = t.closest("[data-mrfold]"); if (fo) { e.preventDefault(); const k = fo.dataset.mrfold; open.has(k) ? open.delete(k) : open.add(k); render(); return; }
      const gg = t.closest("[data-mrgo]"); if (gg) { e.preventDefault(); const P = model.byKey.get(gg.dataset.mrgo); pane = "conflicts"; view.status = "act"; view.cat = null; view.q = P ? P.name : ""; render(); return; }
      const wi = t.closest("[data-mrwaveinc]"); if (wi) {
        e.preventDefault();
        const w = waveRows.find((x) => x.name === wi.dataset.mrwaveinc);
        sel.clear();
        (w ? w.fits : model.newP).filter((N) => N.surface && !(w && w.id && N.reach.inc.has(w.id))).forEach((N) => sel.add(N.key));
        pane = "new"; view.cat = null; view.state = null; view.q = "";
        setSeg("mrActSeg", "data-mract", "add-include"); setSeg("mrTargetSeg", "data-mrtarget", "group");
        $("mrGroup").value = w ? w.name : "";
        render(); return;
      }
      const xe = t.closest("[data-mrexcl]"); if (xe) {
        e.preventDefault();
        const w = waveRows.find((x) => x.name === xe.dataset.mrexcl);
        sel.clear();
        (w ? w.fits : []).filter((N) => N.surface && !(w.id && N.reach.exc.has(w.id))).forEach((N) => sel.add(N.key));
        pane = "new"; view.cat = null; view.state = null; view.q = "";
        setSeg("mrActSeg", "data-mract", "add-exclude"); setSeg("mrTargetSeg", "data-mrtarget", "group");
        $("mrGroup").value = w ? w.name : "";
        render(); return;
      }
      const wf = t.closest("[data-mrwavefix]"); if (wf) {
        e.preventDefault();
        const gid = lc(wf.dataset.mrwavefix);
        selPairs.clear();
        pairs.filter((pr) => M.needsAction(pr) && pr.N.reach.inc.has(gid) && pr.proposal && pr.proposal.steps.some((s) => (s.groupId === gid || s.twinOfId === gid) && s.supported !== false)).forEach((pr) => selPairs.add(pr.id));
        pane = "conflicts"; view.status = "act"; view.cat = null; view.q = ""; $("mrGroup").value = "";
        render(); return;
      }
      const bk = t.closest("[data-mrrunbk]"); if (bk) { const r = runs[Number(bk.dataset.mrrunbk)]; if (r) download(`t28-assignments-before-${stamp()}.json`, JSON.stringify(r.backup, null, 2), "application/json"); return; }
      const un = t.closest("[data-mrundo]"); if (un) { undoRun(Number(un.dataset.mrundo)); return; }
      if (t.id === "mrRep_assign") { runAssignReport(); return; }
      if (t.id === "mrRep_config") { runConfigReport(); return; }
      if (t.id === "mrRep_conflicts") { runConflictCheck(); return; }
      const ro = t.closest("[data-mrrepopen]"); if (ro) { openReport(ro.dataset.mrrepopen); return; }
      const rd = t.closest("[data-mrrep]"); if (rd) {
        const r = reps[rd.dataset.mrrep]; if (!r) return;
        const name = { assign: "assignments", config: "configuration", conflicts: "conflict-check" }[rd.dataset.mrrep];
        if (rd.dataset.mrrepfmt === "csv") download(`MDE-rollout-${name}-${stamp()}.csv`, r.csv, "text/csv");
        else download(`MDE-rollout-${name}-${stamp()}.html`, r.html, "text/html");
        return;
      }
      const mr = t.closest("[data-mrmemregion]"); if (mr) { mem.region = mr.dataset.mrmemregion; mem.unmapped = false; mem.pil = false; mem.leftCountry = null; clearPlan(); render(); return; }
      if (t.closest("[data-mrmemunmapped]")) { mem.unmapped = !mem.unmapped; if (mem.unmapped) { mem.left = false; mem.pil = false; } render(); return; }
      // 🕳 left out (10642)
      if (t.closest("[data-mrmemleft]")) { e.preventDefault(); mem.left = mem.pil ? true : !mem.left; mem.pil = false; mem.unmapped = false; mem.leftCountry = null; mem.leftReason = null; render(); return; }
      // 🧪 pilots (10647)
      if (t.closest("[data-mrpilview]")) { e.preventDefault(); mem.pil = !mem.pil; if (mem.pil) { mem.left = false; mem.unmapped = false; } clearPlan(); render(); return; }
      const ps = t.closest("[data-mrpilstate]"); if (ps) { mem.pilState = ps.dataset.mrpilstate || null; render(); return; }
      if (t.id === "mrPilDry") { pilotDryRun(); return; }
      const lr = t.closest("[data-mrmemleftrow]"); if (lr) {
        e.preventDefault();
        const k = lr.dataset.mrmemleftrow || null;
        const r = k && mem.model ? mem.model.rows.find((x) => x.key === k) : null;
        if (r) mem.region = r.region;
        mem.left = true; mem.unmapped = false; mem.leftCountry = k; mem.leftReason = null; render(); return;
      }
      const lw = t.closest("[data-mrmemleftwhy]"); if (lw) {
        e.preventDefault();
        const k = lw.dataset.mrmemleftwhy;
        mem.left = true; mem.unmapped = false; mem.leftReason = k === "users" || k === "all" ? null : k;
        if (k === "users") mem.leftCountry = null;
        render(); return;
      }
      if (t.id === "mrMemLeftCsv") { if (mem.model) download(`MDE-left-out-${mem.region || "all"}-${stamp()}.csv`, MdeMembers.leftOutCsv(mem.model, mem.region), "text/csv"); return; }
      const mo = t.closest("[data-mrmemopen]"); if (mo) { e.preventDefault(); const k = mo.dataset.mrmemopen; mem.open.has(k) ? mem.open.delete(k) : mem.open.add(k); render(); return; }
      const ap = t.closest("[data-mrmempilot]"); if (ap) {
        const sel = $(ap.dataset.mrpilotsel);
        const region = sel ? sel.value : (mem.model && mem.model.regions[0] ? mem.model.regions[0].region : "");
        const suffix = ap.dataset.mrmempilot;
        saveCfg(Object.assign({}, cfg, { members: MdeMembers.addPilot(mcfg(), suffix, region) }));
        mem.region = region; mem.unmapped = false; mem.sel.clear(); mem.sel.add(lc(suffix));
        memCompute(); clearPlan(); render(); return;
      }
      if (t.id === "mrMemRead") { memRead(); return; }
      // 🧪 pilot batches (10640)
      const bt = t.closest("[data-mrbatch]"); if (bt) { batchDryRun(bt.dataset.mrbatch, false); return; }
      const bf = t.closest("[data-mrbatchfin]"); if (bf) { batchDryRun(bf.dataset.mrbatchfin, true); return; }
      const bc = t.closest("[data-mrbatchcsv]"); if (bc) { const r = mem.model && mem.model.rows.find((x) => x.key === bc.dataset.mrbatchcsv); if (r) download(`MDE-pilot-batches-${r.suffix}-${stamp()}.csv`, MdeMembers.batchCsv(r), "text/csv"); return; }
      // ⊘ exclusions (10639)
      if (t.id === "mrExRead") { exRead(); return; }
      if (t.id === "mrExGo") { exSearch(); return; }
      if (t.id === "mrExDry") { exDryRun(); return; }
      if (t.id === "mrExRemDry") { exRemoveDryRun(); return; }
      const xp = t.closest("[data-mrexpick]"); if (xp) { const h = (ex.results || [])[Number(xp.dataset.mrexpick)]; if (h) exPick(h); return; }
      const xf = t.closest("[data-mrexfix]"); if (xf) {
        const n = exNow(); const r = n && n.rows.find((x) => x.key === xf.dataset.mrexfix);
        if (r && r.user) { exPick({ type: "user", id: r.user.id, displayName: r.user.displayName, upn: r.user.upn }); const top = $("mrExQ"); if (top && top.scrollIntoView) top.scrollIntoView({ block: "center" }); }
        return;
      }
      if (t.id === "mrMemDry") { memDryRun(); return; }
      if (t.id === "mrMemCsv") { if (mem.model) download(`MDE-wave-members-${stamp()}.csv`, MdeMembers.csv(mem.model), "text/csv"); return; }
      const rr = t.closest("[data-mrroll-region]"); if (rr) {
        const all = [...new Set(model.cfg.groups.filter((g) => g.role === "wave").map((g) => g.region))];
        const cur = rollRegions ? new Set(rollRegions) : new Set(all);
        const r = rr.dataset.mrrollRegion;
        cur.has(r) ? cur.delete(r) : cur.add(r);
        rollRegions = cur.size === all.length ? null : cur;
        derive(); render(); return;   // the ⚔️ wave proposals follow the regions (10643)
      }
      const ra = t.closest("[data-mrroll]"); if (ra) { dryRunRollout(ra.dataset.mrroll); return; }
      if (t.id === "mrWaveCreate") { createWaves(); return; }
      if (t.id === "mrRenameGo") {
        if (!$("mrRenameOk") || !$("mrRenameOk").checked) return;
        const list = waveRows.filter((w) => selRename.has(w.name) && w.legacy && !w.exists).map((w) => ({ id: w.legacy.group.id, from: w.legacy.name, to: w.name }));
        if (list.length) renameWaves(list, false);
        return;
      }
      if (t.closest("[data-mrrenameall]")) { e.preventDefault(); waveRows.filter((w) => w.legacy && !w.exists).forEach((w) => selRename.add(w.name)); render(); return; }
      const rb = t.closest("[data-mrrenback]"); if (rb) {
        const r = runs[Number(rb.dataset.mrrenback)];
        if (r && r.done && r.done.length) { pane = "waves"; render(); renameWaves(r.done.map((d) => ({ id: d.id, from: d.to, to: d.from })), true); }
        return;
      }
      if (t.id === "mrRuleSave") {
        const lines = (id) => $(id).value.split(/\r?\n/);
        const before = cfg.lookup.join("\n");
        const prevPre = { device: cfg.waveDevicePrefix, user: cfg.waveUserPrefix, exD: cfg.exclusionDevice, exU: cfg.exclusionUser };
        const prefixes = () => `${mcfg().countryPrefix}|${mcfg().deviceGroupPrefix}`;
        const beforePre = prefixes();
        const okSaved = saveCfg({ newPrefixes: lines("mrRuleNew"), outPrefixes: lines("mrRuleOut"), waveRegions: lines("mrRuleWaves"),
          waveDevicePrefix: $("mrRuleDgPre").value, waveUserPrefix: $("mrRuleUgPre").value,
          exclusionDevice: $("mrRuleExD").value, exclusionUser: $("mrRuleExU").value,
          waveDescription: $("mrRuleDesc").value, exclusionDescription: $("mrRuleExDesc").value, alsoInScope: lines("mrRuleAlso"), leaveOut: lines("mrRuleLeave"), leaveOutSeed: cfg.leaveOutSeed,
          fixWith: cfg.fixWith, pilotGroups: lines("mrRulePilots"), pilotGroupsOff: cfg.pilotGroupsOff,
          renameExclusionFrom: {
            device: cfg.renameExclusionFrom.device.concat(prevPre.exD && lc($("mrRuleExD").value.trim()) !== lc(prevPre.exD) ? [prevPre.exD] : []),
            user: cfg.renameExclusionFrom.user.concat(prevPre.exU && lc($("mrRuleExU").value.trim()) !== lc(prevPre.exU) ? [prevPre.exU] : []),
          },
          renameFrom: {
            device: cfg.renameFrom.device.concat(lc($("mrRuleDgPre").value.trim()) !== lc(prevPre.device) ? [prevPre.device] : []),
            user: cfg.renameFrom.user.concat(lc($("mrRuleUgPre").value.trim()) !== lc(prevPre.user) ? [prevPre.user] : []),
          },
          members: Object.assign({}, mcfg(), { countryPrefix: $("mrRuleCtyPre").value, deviceGroupPrefix: $("mrRuleDgrpPre").value,
            countryMap: MdeMembers.parseMap($("mrRuleMap").value), pilots: MdeMembers.parsePilots($("mrRuleMap").value), deviceSuffixes: MdeMembers.parseOverrides($("mrRuleSfx").value) }) });
        (async () => {
          if (cfg.lookup.join("\n") !== before) { try { const f = await M.findGroups(cfg.lookup); found = f.found; dupes = f.dupes; } catch { found = null; } }
          // a new prefix means other groups — the members read is redone, not recomputed
          if (prefixes() !== beforePre) { mem.input = null; mem.model = null; mem.sel.clear(); }
          derive(); render();
          ruleSaved = `${okSaved ? "Saved for this tenant." : "Applied for this session — this browser would not keep it."} `;
          $("mrRuleMsg").textContent = `${ruleSaved}${model.newP.length} new · ${model.oldP.length} old · ${model.outP.length} out of scope.`;
          enrich();   // a changed scope brings groups whose kinds were never read
        })();
        return;
      }
      if (t.id === "mrRuleReset") { saveCfg(null); derive(); render(); enrich(); return; }
      // ⚔️ what a proposed fix excludes (10643)
      const fw = t.closest("[data-mrfixwith]"); if (fw) {
        if (cfg.fixWith !== fw.dataset.mrfixwith) { saveCfg(Object.assign({}, cfg, { fixWith: fw.dataset.mrfixwith })); clearPlan(); derive(); render(); }
        return;
      }
      // ➕ include (10642): a policy left out by name is taken off the list
      const inc = t.closest("[data-mrinclude]"); if (inc) {
        const nm = M.normName(inc.dataset.mrinclude);
        saveCfg(Object.assign({}, cfg, { leaveOut: cfg.leaveOut.filter((n) => M.normName(n) !== nm) }));
        // new pairs bring groups whose kinds were never read — read them
        derive(); render(); enrich(); return;
      }
    });
    body.addEventListener("keydown", (e) => {
      if (e.target.id === "mrExQ" && e.key === "Enter") { e.preventDefault(); exSearch(); return; }
      if (e.key !== "Enter" && e.key !== " ") return;
      const rep = e.target.closest("[data-mrreport]");
      if (rep) { e.preventDefault(); rep.click(); return; }
      const nd = e.target.closest("[data-mrpane]");
      if (nd && nd.tagName !== "A") { e.preventDefault(); go(nd.dataset.mrpane); }
    });
    body.addEventListener("input", (e) => {
      if (e.target.id === "mrExQ") { ex.q = e.target.value; return; }
      if (e.target.id !== "mrQ") return;
      view.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const q = $("mrQ"); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch { /* search inputs in some engines */ } }
    });
    body.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.mrpick) { t.checked ? sel.add(t.dataset.mrpick) : sel.delete(t.dataset.mrpick); clearPlan(); syncSelbar(); return; }
      if (t.dataset.mrpickall) {
        const list = t.dataset.mrpickall === "new" ? model.newP : model.oldP;
        body.querySelectorAll("[data-mrpick]").forEach((c) => { c.checked = t.checked; t.checked ? sel.add(c.dataset.mrpick) : sel.delete(c.dataset.mrpick); });
        if (!list) return;
        clearPlan(); syncSelbar(); return;
      }
      if (t.dataset.mrpair) { t.checked ? selPairs.add(t.dataset.mrpair) : selPairs.delete(t.dataset.mrpair); clearPlan(); syncSelbar(); return; }
      // 🧪 pilot members (10647)
      if (t.dataset.mrpilsel) { t.checked ? mem.pilSel.add(t.dataset.mrpilsel) : mem.pilSel.delete(t.dataset.mrpilsel); clearPlan(); render(); return; }
      if (t.dataset.mrpilall) {
        const rows = pilotRows(mem.model.pilots).filter((x) => x.st === "in" && (!mem.pilState || x.st === mem.pilState));
        rows.forEach((x) => t.checked ? mem.pilSel.add(`${x.kind}|${x.id}`) : mem.pilSel.delete(`${x.kind}|${x.id}`));
        clearPlan(); render(); return;
      }
      // 🧪 the pilot tick (10645)
      if (t.hasAttribute("data-mrpilots")) { saveCfg(Object.assign({}, cfg, { pilotGroupsOff: t.checked })); clearPlan(); derive(); render(); syncSelbar(); return; }
      if (t.dataset.mrpairall) {
        pairs.filter((pr) => pr.O.key === t.dataset.mrpairall && M.needsAction(pr) && pr.proposal && pr.proposal.steps.some((s) => s.supported !== false))
          .forEach((pr) => (t.checked ? selPairs.add(pr.id) : selPairs.delete(pr.id)));
        clearPlan(); render(); return;
      }
      if (t.dataset.mrwave) {
        t.checked ? selWaves.add(t.dataset.mrwave) : selWaves.delete(t.dataset.mrwave);
        const ok = $("mrWaveOk"); if (ok) { ok.disabled = !selWaves.size; if (!selWaves.size) ok.checked = false; }
        const lbl = ok && ok.parentElement; if (lbl) lbl.lastChild.textContent = ` Create ${plural(selWaves.size, "group")} in this tenant`;
        $("mrWaveCreate").disabled = !(selWaves.size && ok && ok.checked);
        return;
      }
      if (t.id === "mrWaveOk") { $("mrWaveCreate").disabled = !(selWaves.size && t.checked); }
      if (t.dataset.mrrename) { t.checked ? selRename.add(t.dataset.mrrename) : selRename.delete(t.dataset.mrrename); render(); return; }
      if (t.id === "mrRenameOk") { $("mrRenameGo").disabled = !(selRename.size && t.checked); }
      if (t.dataset.mrmemsel) { t.checked ? mem.sel.add(t.dataset.mrmemsel) : mem.sel.delete(t.dataset.mrmemsel); clearPlan(); render(); return; }
      if (t.dataset.mrmemall && mem.model) {
        mem.model.rows.filter((r) => r.region === mem.region && r.ug && !(r.inSync && r.ugNested && r.dgNested)).forEach((r) => (t.checked ? mem.sel.add(r.key) : mem.sel.delete(r.key)));
        clearPlan(); render(); return;
      }
      if (t.dataset.mrmemopt) { mem.opts[t.dataset.mrmemopt] = t.checked; clearPlan(); render(); return; }
      if (t.dataset.mrbatchtoggle) {
        const sfx = t.dataset.mrbatchtoggle;
        const cur = mcfg().batched.filter((x) => lc(x) !== lc(sfx));
        saveCfg(Object.assign({}, cfg, { members: Object.assign({}, mcfg(), { batched: t.checked ? cur.concat(sfx) : cur }) }));
        memCompute(); clearPlan(); render(); return;
      }
      if (t.dataset.mrextick) { t.checked ? ex.ticks.add(t.dataset.mrextick) : ex.ticks.delete(t.dataset.mrextick); clearPlan(); render(); return; }
      if (t.dataset.mrexsel) { t.checked ? ex.sel.add(t.dataset.mrexsel) : ex.sel.delete(t.dataset.mrexsel); clearPlan(); render(); return; }
      if (t.id === "mrExKeep") { ex.keepOld = t.checked; clearPlan(); render(); return; }
    });
    // the bar
    $("mrActSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-mract]"); if (!b) return; setSeg("mrActSeg", "data-mract", b.dataset.mract); clearPlan(); syncSelbar(); });
    $("mrTargetSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-mrtarget]"); if (!b) return; setSeg("mrTargetSeg", "data-mrtarget", b.dataset.mrtarget); clearPlan(); syncSelbar(); });
    $("mrFilterSel").addEventListener("change", () => { clearPlan(); syncSelbar(); });
    $("mrFilterMode").addEventListener("change", clearPlan);
    $("mrGroup").addEventListener("input", clearPlan);
    $("mrDryRun").addEventListener("click", dryRun);
    $("mrSelClear").addEventListener("click", () => { if (barMode() === "fixes") selPairs.clear(); else sel.clear(); clearPlan(); render(); });
    if (typeof Suggest !== "undefined" && Suggest.attach) Suggest.attach($("mrGroup"), { kind: "group" });
    (window.TunoScreenHooks = window.TunoScreenHooks || {})["screen-mderollout"] = onShow;
    window.addEventListener("tuno:signout", reset);
  }

  return {
    init, run,
    // headless: hand the screen a read and drive it without Graph
    _setForTest: (r, t, f, k) => { res = r; templates = t || new Map(); found = f || null; kinds = k || new Map(); loadCfg(); derive(); render(); },
    _state: () => ({ pane, model, pairs, retire, waveRows, plan, sel, selPairs, runs, cfg, rollRegions, mem, reps, ex, planAnchor }),
    _pane: (p) => { pane = p; render(); },
  };
})();

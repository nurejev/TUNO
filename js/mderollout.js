// js/mderollout.js — the T28 ENGINE (MdeRollout). Since build 10661 the
// screen is js/mderolloutv2.js (MdeRolloutV2Tool, the V2 design of
// 10660); the original screen that lived below the engine is gone.
// js/mdeasr.js and js/mdemembers.js call this engine by name.
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
// at the Create click, T22's scope). Since 10657 also the ASR rule MODES
// of the new set's settings-catalog policies (🎛 Adjust settings — the
// engine is MdeAsr in js/mdeasr.js; same scope, same gates). Nothing is
// deleted.
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
      // 10652, Mihai: "add the to be include"
      "Win - OIB - SC - Device Security - U - Windows Sandbox - v3.4",
      "Win - OIB - SC - Device Security - D - Config Refresh - v3.2",
      "Win - OIB - SC - Device Security - D - User Rights - v3.7",
      "Win - OIB - SC - Device Security - U - Windows Spotlight and Org Messages - v3.0",
      "Win - OIB - SC - Device Security - D - Windows Package Manager - v3.5",
    ],
    // bumped when the default list grows: a config saved before gets the
    // new names merged in once, then keeps what was taken off by hand
    alsoInScopeSeed: 10652,
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
      alsoInScope: cleanList(!Array.isArray(o.alsoInScope) ? DEFAULTS.alsoInScope
        : o.alsoInScopeSeed === DEFAULTS.alsoInScopeSeed ? o.alsoInScope
        : o.alsoInScope.concat(DEFAULTS.alsoInScope.filter((n) => !o.alsoInScope.some((x) => normName(x) === normName(n))))),
      alsoInScopeSeed: DEFAULTS.alsoInScopeSeed,
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
    // 10652: Windows Sandbox, Config Refresh, Windows Package Manager and
    // Spotlight / organisational messages — the OIB Device Security
    // policies added to the target list then
    if (/_audit_|auditoptions|localpoliciessecurityoptions|userrights|mssecurityguide|msslegacy|_eventlogservice_|lanmanserver|lanmanworkstation|_remoteprocedurecall_|_security_|windowslogon|_credentialsui_|_credentialsdelegation_|windowssandbox|_configrefresh_|desktopappinstaller|windowsspotlight|organizationalmessages/.test(k)) return "hard";
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
  // 🧪 The pilot groups (⚙️) by TIER (10675, Mihai: "add or remove the pilot
  // groups just as with the waves, selecting a policy"): a device name and a
  // user name that differ only by their "- D -" / "- U -" token are one
  // tier's two halves — INT-SG-D-Win-Pilot + INT-SG-U-Win-Pilot = "Win-Pilot"
  // — and a - D - policy takes the device half, a - U - one the user half,
  // exactly as the waves pair up. A name with no kind token is a tier on its
  // own, offered to neither kind until the tenant says what the group is.
  // Returns [{ key, label, groups: [{ name, audience }] }], in config order.
  function pilotTiers(names) {
    const tiers = new Map();
    for (const raw of uniq((names || []).map((x) => String(x == null ? "" : x).trim()).filter(Boolean))) {
      const m = NAME_DEVICE.exec(raw) ? { x: NAME_DEVICE.exec(raw), audience: "device" } : NAME_USER.exec(raw) ? { x: NAME_USER.exec(raw), audience: "user" } : null;
      let rest = raw, label = raw, audience = "unknown";
      if (m) {
        const x = m.x, head = raw.slice(0, x.index), tail = raw.slice(x.index + x[0].length);
        rest = head + (x[1] || "") + tail;
        label = tail || head || raw;
        audience = m.audience;
      }
      const key = normName(rest) || normName(raw);
      if (!tiers.has(key)) tiers.set(key, { key, label, groups: [] });
      tiers.get(key).groups.push({ name: raw, audience });
    }
    return [...tiers.values()];
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
    kindFromName, kindOfGroup, pilotTiers, targetKinds, effectiveTargets, exclusionSupport, proposalFor, pilotRemovals, pilotsFor, twinIndex, wavePool,
    RETIRE, retirement, waves, composePlan, undoPlan, patchAssignments,
    readTemplates, findGroups, readKinds, readFresh, readMe, createWave, renameGroup, readLabels, labelValue, labelName,
    markdown, csv, assignText,
  };
})();

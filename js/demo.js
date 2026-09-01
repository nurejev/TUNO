// ======================================================================
// DEMO MODE — a whole fake tenant, answered at the Graph layer.
//
// WHY THIS IS NOT SHAPED LIKE ENCA'S DEMO. ENCA carries an `isDemo` flag and
// branches on it in roughly eighty places, because its tools each reach for
// Graph in their own way and there was never one place to stand. TUNO has
// one: every read and every write in every tool goes through Graph.call().
// So the demo intercepts THERE, once, and all seventeen tools demo without a
// single line changing in any tool file. A tool added tomorrow demos for free
// the moment its endpoint appears in the fixture below.
//
// The rule that follows from that: NOTHING IN THIS FILE MAY BE IMPORTED BY A
// TOOL. If a tool ever asks "am I in demo mode?", the interception has failed
// and we are back to ENCA's eighty branches. A tool must not be able to tell.
//
// WHAT THE INTERCEPTOR OWES THE TOOLS. It is standing where a real Graph
// stood, so it has to keep Graph's promises, and the tools depend on more of
// them than you would guess:
//
//   * THE BASE MATTERS. The same path is read on /beta by one tool and /v1.0
//     by another (devicewhy opens a policy on v1.0; document.js reads the
//     same path on beta). Routing on the path alone would serve one of them
//     the wrong answer, so routes key on the FULL URL.
//   * A SINGLE OBJECT HAS NO `value`. readAll() treats a response without
//     `value` as one object and pushes it whole — that is how
//     /deviceManagement/settings works. Put `value` on it and a single object
//     silently becomes an empty collection.
//   * $expand IS NOT DECORATION. `?$expand=assignments` has to come back with
//     the assignments inline, because that is the only place most tools ever
//     see them. Same for `$expand=payloads` on a filter — T14 refuses a
//     delete on the strength of it.
//   * $filter IS LOAD-BEARING on /groups and /users: GroupUse.resolveGroup
//     throws "matches N groups" if a name lookup is not actually narrowed.
//   * /$count ANSWERS TEXT. members/$count comes back as a bare integer that
//     the caller parseInt()s. Hand back a number as a string, not JSON.
//   * $batch IS A PROTOCOL, not a shortcut: {responses:[{id,status,body}]},
//     one entry per request, ids as strings.
//
// AND ONE PROMISE IT DELIBERATELY BREAKS. Writes are simulated: a POST that
// would create a profile answers as though it had, and nothing leaves the
// browser. That is the whole point, so it is stated on screen rather than
// hidden — a demo that quietly did nothing while saying "created" would be
// teaching the tool's users something false about the tool.
//
// THE TENANT IS DELIBERATELY BROKEN. A demo of a healthy tenant is a demo of
// empty result tables: every tool would report nothing and showcase nothing.
// So Contoso carries, on purpose, the exact faults TUNO exists to find — a
// policy assigned to a group that was deleted, a firewall policy that reaches
// nobody, two policies fighting over one setting, an admin outside every
// approval gate, a laptop that has not checked in for nine days. Each fault
// below says which tool it is there for, so a future edit can tell a fixture
// from a mistake.
// ======================================================================
const TUNO_DEMO = (() => {

  // ---------- stable ids ----------
  //
  // Hand-written rather than generated, and patterned by kind, so a GUID in a
  // screenshot or a failing test can be read at a glance instead of grepped.
  // They must still satisfy Graph.isGuid or resolveNames drops them.
  const G = (n) => `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`; // groups
  const U = (n) => `22222222-0000-4000-8000-${String(n).padStart(12, "0")}`; // users
  const D = (n) => `33333333-0000-4000-8000-${String(n).padStart(12, "0")}`; // devices
  const P = (n) => `44444444-0000-4000-8000-${String(n).padStart(12, "0")}`; // policies
  const F = (n) => `55555555-0000-4000-8000-${String(n).padStart(12, "0")}`; // filters
  const R = (n) => `66666666-0000-4000-8000-${String(n).padStart(12, "0")}`; // roles

  // Times are relative to load, so the demo never ages into a tenant whose
  // every device last checked in during 2026 and whose audit log is empty.
  const now = () => Date.now();
  const ago = (ms) => new Date(now() - ms).toISOString();
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;

  // ---------- the directory ----------

  const GROUPS = [
    { id: G(1), displayName: "SEC-All-Workstations", description: "Every managed Windows workstation.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: null, createdDateTime: ago(400 * DAY), memberCount: 418 },

    { id: G(2), displayName: "SEC-Pilot-Ring0", description: "First ring for policy pilots.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: null, createdDateTime: ago(300 * DAY), memberCount: 12 },

    // FAULT (T09 assignment health, T11 assignment editor): a real group, with
    // real assignments pointed at it, and nobody in it. Every policy aimed
    // here configures precisely nothing, and the portal will not say so.
    { id: G(3), displayName: "SEC-Finance-Devices", description: "Finance laptops — populated by the service desk.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: null, createdDateTime: ago(120 * DAY), memberCount: 0 },

    { id: G(4), displayName: "SEC-Contractors", description: "Externals. Excluded from most baselines.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: null, createdDateTime: ago(260 * DAY), memberCount: 35 },

    // FAULT (T02 group usage): the parent carries the assignment, the child
    // carries the people. Anyone reading the child's own assignments sees
    // nothing and concludes it is unused.
    { id: G(5), displayName: "SEC-Baseline-Parent", description: "Umbrella group — holds the baseline assignment.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: null, createdDateTime: ago(280 * DAY), memberCount: 0 },
    { id: G(6), displayName: "SEC-Engineering", description: "Engineering. Nested under the baseline parent.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: null, createdDateTime: ago(275 * DAY), memberCount: 48, memberOf: [G(5)] },

    // FAULT (T02): exists, has people, and nothing anywhere assigns to it.
    { id: G(7), displayName: "SEC-Legacy-VPN-Users", description: "Left over from the 2024 VPN migration.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: null, createdDateTime: ago(700 * DAY), memberCount: 8 },

    { id: G(8), displayName: "DYN-Windows-11", description: "Dynamic — all Windows 11 devices.",
      groupTypes: ["DynamicMembership"], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: '(device.deviceOSVersion -startsWith "10.0.22")', createdDateTime: ago(200 * DAY), memberCount: 383 },

    { id: G(9), displayName: "SEC-Intune-Admins", description: "Role-assignable. Holds the Intune operators.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: true,
      membershipRule: null, createdDateTime: ago(500 * DAY), memberCount: 4 },

    // FAULT (T17 multi-admin approval): named as an approver group by a MAA
    // policy, and empty. Every operation that policy gates is a request that
    // nobody can approve — it just sits there.
    { id: G(10), displayName: "SEC-MAA-Approvers", description: "Approvers for multi-admin approval.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: null, createdDateTime: ago(90 * DAY), memberCount: 0 },

    { id: G(11), displayName: "SEC-Mac-Fleet", description: "Managed Macs.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: null, createdDateTime: ago(180 * DAY), memberCount: 61 },

    { id: G(12), displayName: "SEC-Helpdesk", description: "Service desk operators.",
      groupTypes: [], securityEnabled: true, mailEnabled: false, isAssignableToRole: false,
      membershipRule: null, createdDateTime: ago(340 * DAY), memberCount: 9 },
  ];

  // FAULT (T02 group usage, T09 assignment health): this id is referenced by
  // a live assignment and is NOT in GROUPS. getByIds will simply omit it,
  // exactly as Graph does for a deleted object — which is what makes the
  // dangling-reference finding real rather than staged. The portal shows this
  // assignment as a blank row and says nothing.
  const DELETED_GROUP = G(99);

  const USERS = [
    { id: U(1), displayName: "Alex Admin", userPrincipalName: "alex.admin@contoso.com", accountEnabled: true, memberOf: [G(9), G(1)] },
    { id: U(2), displayName: "Eva Employee", userPrincipalName: "eva@contoso.com", accountEnabled: true, memberOf: [G(1), G(6)] },
    { id: U(3), displayName: "Milan Medewerker", userPrincipalName: "milan@contoso.com", accountEnabled: true, memberOf: [G(1), G(4)] },
    { id: U(4), displayName: "svc-legacyapp", userPrincipalName: "svc-legacyapp@contoso.com", accountEnabled: true, memberOf: [] },
    { id: U(5), displayName: "Priya Patel", userPrincipalName: "priya@contoso.com", accountEnabled: true, memberOf: [G(12), G(1)] },
    { id: U(6), displayName: "Sam Sysadmin", userPrincipalName: "sam@contoso.com", accountEnabled: true, memberOf: [G(9)] },
    { id: U(7), displayName: "Nina Nieuw", userPrincipalName: "nina@contoso.com", accountEnabled: true, memberOf: [G(6)] },
  ];

  // ---------- devices ----------
  //
  // lastSyncDateTime is the field the freshness banner in T06 and the stale
  // buckets in T13 are built on, so the spread is deliberate: fresh, a day
  // old, over a week, and one 45 days out that still claims to be compliant.
  const DEVICES = [
    { id: D(1), deviceName: "WS-FIN-0142", managedDeviceName: "eva_Windows_2026", serialNumber: "5CD1234ABC",
      azureADDeviceId: D(101), userId: U(2), userPrincipalName: "eva@contoso.com", userDisplayName: "Eva Employee",
      operatingSystem: "Windows", osVersion: "10.0.26100.2314", complianceState: "compliant",
      managedDeviceOwnerType: "company", enrolledDateTime: ago(200 * DAY), lastSyncDateTime: ago(3 * HOUR),
      model: "EliteBook 840 G10", manufacturer: "HP" },

    // FAULT (T06 device why): nine days without a check-in. Everything this
    // tool says about it is nine days old, which is the first thing the
    // screen has to admit before it says anything else.
    { id: D(2), deviceName: "WS-FIN-0187", managedDeviceName: "milan_Windows_2026", serialNumber: "5CD9876XYZ",
      azureADDeviceId: D(102), userId: U(3), userPrincipalName: "milan@contoso.com", userDisplayName: "Milan Medewerker",
      operatingSystem: "Windows", osVersion: "10.0.22631.4317", complianceState: "noncompliant",
      managedDeviceOwnerType: "company", enrolledDateTime: ago(310 * DAY), lastSyncDateTime: ago(9 * DAY),
      model: "ThinkPad T14", manufacturer: "Lenovo" },

    // FAULT (T13 compliance): compliant, and last seen 45 days ago. The
    // verdict is stale, not true — a device that stopped reporting keeps its
    // last answer forever.
    { id: D(3), deviceName: "WS-HR-0031", managedDeviceName: "priya_Windows_2026", serialNumber: "5CD5555HR1",
      azureADDeviceId: D(103), userId: U(5), userPrincipalName: "priya@contoso.com", userDisplayName: "Priya Patel",
      operatingSystem: "Windows", osVersion: "10.0.22631.3880", complianceState: "compliant",
      managedDeviceOwnerType: "company", enrolledDateTime: ago(420 * DAY), lastSyncDateTime: ago(45 * DAY),
      model: "ThinkPad X1", manufacturer: "Lenovo" },

    { id: D(4), deviceName: "MB-DES-0007", managedDeviceName: "nina_macOS_2026", serialNumber: "C02XY1234",
      azureADDeviceId: D(104), userId: U(7), userPrincipalName: "nina@contoso.com", userDisplayName: "Nina Nieuw",
      operatingSystem: "macOS", osVersion: "15.1", complianceState: "noncompliant",
      managedDeviceOwnerType: "company", enrolledDateTime: ago(150 * DAY), lastSyncDateTime: ago(6 * HOUR),
      model: "MacBook Pro 14", manufacturer: "Apple" },

    // FAULT (T06): no azureADDeviceId. The device-group half of the answer
    // cannot be computed at all, and the tool has to say it is blind there
    // rather than report "no device groups".
    { id: D(5), deviceName: "WS-LAB-0003", managedDeviceName: "lab_Windows_2026", serialNumber: "5CDLAB003",
      azureADDeviceId: "", userId: "", userPrincipalName: "", userDisplayName: "",
      operatingSystem: "Windows", osVersion: "10.0.26100.2314", complianceState: "unknown",
      managedDeviceOwnerType: "company", enrolledDateTime: ago(60 * DAY), lastSyncDateTime: ago(30 * HOUR),
      model: "OptiPlex 7010", manufacturer: "Dell" },

    { id: D(6), deviceName: "MB-DES-0012", managedDeviceName: "sam_macOS_2026", serialNumber: "C02AB5678",
      azureADDeviceId: D(106), userId: U(6), userPrincipalName: "sam@contoso.com", userDisplayName: "Sam Sysadmin",
      operatingSystem: "macOS", osVersion: "15.1", complianceState: "compliant",
      managedDeviceOwnerType: "company", enrolledDateTime: ago(210 * DAY), lastSyncDateTime: ago(90 * MIN),
      model: "MacBook Air 15", manufacturer: "Apple" },

    { id: D(7), deviceName: "WS-ENG-0221", managedDeviceName: "alex_Windows_2026", serialNumber: "5CDENG221",
      azureADDeviceId: D(107), userId: U(1), userPrincipalName: "alex.admin@contoso.com", userDisplayName: "Alex Admin",
      operatingSystem: "Windows", osVersion: "10.0.26100.2314", complianceState: "inGracePeriod",
      managedDeviceOwnerType: "company", enrolledDateTime: ago(95 * DAY), lastSyncDateTime: ago(50 * MIN),
      model: "EliteBook 1040 G11", manufacturer: "HP" },

    // The "other" bucket in T13 — a co-managed device whose compliance state
    // is a word neither the tool nor the portal has a card for.
    { id: D(8), deviceName: "WS-OLD-0009", managedDeviceName: "shared_Windows_2026", serialNumber: "5CDOLD009",
      azureADDeviceId: D(108), userId: "", userPrincipalName: "", userDisplayName: "",
      operatingSystem: "Windows", osVersion: "10.0.19045.5011", complianceState: "configManager",
      managedDeviceOwnerType: "company", enrolledDateTime: ago(900 * DAY), lastSyncDateTime: ago(2 * DAY),
      model: "OptiPlex 5060", manufacturer: "Dell" },

    { id: D(9), deviceName: "WS-ENG-0308", managedDeviceName: "nina_Windows_2026", serialNumber: "5CDENG308",
      azureADDeviceId: D(109), userId: U(7), userPrincipalName: "nina@contoso.com", userDisplayName: "Nina Nieuw",
      operatingSystem: "Windows", osVersion: "10.0.26100.2314", complianceState: "compliant",
      managedDeviceOwnerType: "personal", enrolledDateTime: ago(40 * DAY), lastSyncDateTime: ago(20 * MIN),
      model: "Surface Laptop 6", manufacturer: "Microsoft" },

    { id: D(10), deviceName: "WS-SALES-0077", managedDeviceName: "svc_Windows_2026", serialNumber: "5CDSAL077",
      azureADDeviceId: D(110), userId: U(4), userPrincipalName: "svc-legacyapp@contoso.com", userDisplayName: "svc-legacyapp",
      operatingSystem: "Windows", osVersion: "10.0.22631.4317", complianceState: "noncompliant",
      managedDeviceOwnerType: "company", enrolledDateTime: ago(500 * DAY), lastSyncDateTime: ago(11 * HOUR),
      model: "Latitude 5540", manufacturer: "Dell" },
  ];

  // ---------- assignment filters ----------
  const FILTERS = [
    // FAULT (T14 filter manager): this one is in use. Deleting it would widen
    // every payload that carries it to the whole target group, silently — so
    // the delete has to be refused and the payloads named. That refusal is
    // the tool's entire reason to exist, so the demo must be able to trigger it.
    { id: F(1), displayName: "Windows 11 only", description: "Scopes a payload to Windows 11 builds.",
      platform: "windows10AndLater", rule: '(device.osVersion -startsWith "10.0.22") or (device.osVersion -startsWith "10.0.26")',
      assignmentFilterManagementType: "devices", lastModifiedDateTime: ago(30 * DAY),
      payloads: [
        { payloadId: P(1), payloadType: "deviceConfigurationAndCompliance", groupId: G(1), assignmentFilterType: "include" },
        { payloadId: P(12), payloadType: "deviceConfigurationAndCompliance", groupId: G(2), assignmentFilterType: "include" },
      ] },

    { id: F(2), displayName: "Corporate owned", description: "Excludes personally owned devices.",
      platform: "windows10AndLater", rule: '(device.deviceOwnership -eq "Corporate")',
      assignmentFilterManagementType: "devices", lastModifiedDateTime: ago(75 * DAY),
      payloads: [{ payloadId: P(4), payloadType: "deviceConfigurationAndCompliance", groupId: G(1), assignmentFilterType: "exclude" }] },

    // FAULT (T14): nothing references it. Safe to delete, and the only way to
    // know that is to have looked.
    { id: F(3), displayName: "macOS Ventura and later", description: "Left from the Ventura rollout.",
      platform: "macOS", rule: '(device.osVersion -startsWith "13.") or (device.osVersion -startsWith "14.")',
      assignmentFilterManagementType: "devices", lastModifiedDateTime: ago(240 * DAY), payloads: [] },

    // A platform value the tool has no label for — proves it falls through to
    // the raw value instead of rendering blank.
    { id: F(4), displayName: "Kiosk shells", description: "Unrecognised platform, on purpose.",
      platform: "unknownFutureValue", rule: '(device.deviceCategory -eq "Kiosk")',
      assignmentFilterManagementType: "devices", lastModifiedDateTime: ago(20 * DAY), payloads: [] },
  ];

  // ---------- assignment shorthand ----------
  //
  // Written out rather than abbreviated in the data, because the exact
  // @odata.type string is what every tool matches on and a typo here would
  // read as "this policy targets nobody" in seventeen places at once.
  const inc = (groupId, filterId, filterType) => ({
    id: `${groupId}_inc`, source: "direct",
    target: Object.assign(
      { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId },
      filterId
        ? { deviceAndAppManagementAssignmentFilterId: filterId, deviceAndAppManagementAssignmentFilterType: filterType || "include" }
        : { deviceAndAppManagementAssignmentFilterId: null, deviceAndAppManagementAssignmentFilterType: "none" }),
  });
  const exc = (groupId) => ({
    id: `${groupId}_exc`, source: "direct",
    target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId,
              deviceAndAppManagementAssignmentFilterId: null, deviceAndAppManagementAssignmentFilterType: "none" },
  });
  const allDevices = () => ({ id: "all_devices", source: "direct",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
              deviceAndAppManagementAssignmentFilterId: null, deviceAndAppManagementAssignmentFilterType: "none" } });
  const allUsers = () => ({ id: "all_users", source: "direct",
    target: { "@odata.type": "#microsoft.graph.allLicensedUsersAssignmentTarget",
              deviceAndAppManagementAssignmentFilterId: null, deviceAndAppManagementAssignmentFilterType: "none" } });

  // ---------- settings-catalog policies ----------
  //
  // `name`, not `displayName` — configurationPolicies is the one surface that
  // names itself differently, and getting it wrong renders every row as
  // "unnamed". The tools all know this; the fixture has to as well.
  const choice = (defId, value, children) => ({
    "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting",
    settingInstance: {
      "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
      settingDefinitionId: defId,
      choiceSettingValue: { value, children: children || [] },
    },
  });
  const simple = (defId, value) => ({
    "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting",
    settingInstance: {
      "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
      settingDefinitionId: defId,
      simpleSettingValue: { "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue", value },
    },
  });

  const DEF_RTP = "device_vendor_msft_policy_config_defender_allowrealtimemonitoring";
  const DEF_BITLOCKER = "device_vendor_msft_bitlocker_requiredeviceencryption";
  const DEF_PWLEN = "device_vendor_msft_policy_config_devicelock_minimumpasswordlength";
  const DEF_SMBv1 = "device_vendor_msft_policy_config_localpoliciessecurityoptions_smbv1clientdriver";
  const DEF_FW = "vendor_msft_firewall_mdmstore_domainprofile_enablefirewall";
  const DEF_ASR = "device_vendor_msft_policy_config_defender_attacksurfacereductionrules";

  const CONFIG_POLICIES = [
    { id: P(1), name: "WIN — Security baseline (Defender)", description: "Defender settings for the managed fleet.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(300 * DAY), lastModifiedDateTime: ago(14 * DAY),
      roleScopeTagIds: ["0"], settingCount: 3, isAssigned: true,
      assignments: [inc(G(1), F(1), "include"), exc(G(4))],
      _settings: [choice(DEF_RTP, `${DEF_RTP}_1`), simple(DEF_PWLEN, 12), choice(DEF_SMBv1, `${DEF_SMBv1}_0`)] },

    // FAULT (T12 setting conflict, T10 setting search): this policy and P(1)
    // both set real-time monitoring, to OPPOSITE values, and both land on
    // SEC-All-Workstations. Two policies, one setting, one group, different
    // answers — the collision T12 exists to find, and the portal shows each
    // policy as healthy in isolation.
    { id: P(2), name: "WIN — Legacy exception set", description: "Kept for the imaging workflow. Nobody remembers why.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(520 * DAY), lastModifiedDateTime: ago(200 * DAY),
      roleScopeTagIds: ["0"], settingCount: 2, isAssigned: true,
      assignments: [inc(G(1))],
      _settings: [choice(DEF_RTP, `${DEF_RTP}_0`), simple(DEF_PWLEN, 8)] },

    // Same setting, same value, in a third policy — must NOT be reported.
    // Agreement is not a conflict, and a tool that flags it is crying wolf.
    { id: P(3), name: "WIN — Pilot ring settings", description: "Ring 0 pilot.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(60 * DAY), lastModifiedDateTime: ago(9 * DAY),
      roleScopeTagIds: ["0"], settingCount: 2, isAssigned: true,
      assignments: [inc(G(2), F(1), "include")],
      _settings: [choice(DEF_RTP, `${DEF_RTP}_1`), choice(DEF_BITLOCKER, `${DEF_BITLOCKER}_1`)] },

    // FAULT (T02, T09): the assignment names a group that no longer exists.
    // getByIds omits it, so this reaches nobody and has been reaching nobody
    // since somebody deleted SEC-Finance-Legacy.
    { id: P(4), name: "WIN — Disk encryption", description: "BitLocker enforcement.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(410 * DAY), lastModifiedDateTime: ago(120 * DAY),
      roleScopeTagIds: ["0"], settingCount: 1, isAssigned: true,
      assignments: [inc(DELETED_GROUP), inc(G(1), F(2), "exclude")],
      _settings: [choice(DEF_BITLOCKER, `${DEF_BITLOCKER}_1`)] },

    // FAULT (T05 documenter, T09): built, saved, never assigned. The most
    // common real defect in an Intune tenant and the least visible one.
    { id: P(5), name: "WIN — SmartScreen hardening", description: "Never rolled out.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(150 * DAY), lastModifiedDateTime: ago(150 * DAY),
      roleScopeTagIds: ["0"], settingCount: 1, isAssigned: false,
      assignments: [],
      _settings: [choice(DEF_SMBv1, `${DEF_SMBv1}_0`)] },

    // FAULT (T09): the only assignment is an exclusion. Excluding a group
    // from a policy that includes nobody is a policy that does nothing.
    { id: P(6), name: "WIN — Removable storage block", description: "Exclusions only — no include was ever added.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(240 * DAY), lastModifiedDateTime: ago(88 * DAY),
      roleScopeTagIds: ["0"], settingCount: 1, isAssigned: true,
      assignments: [exc(G(4))],
      _settings: [simple(DEF_PWLEN, 14)] },

    // Multi-platform, to exercise the platform normaliser in T05.
    { id: P(7), name: "MULTI — Password policy", description: "Windows and macOS in one policy.",
      platforms: "windows10,macOS", technologies: "mdm", createdDateTime: ago(190 * DAY), lastModifiedDateTime: ago(30 * DAY),
      roleScopeTagIds: ["0"], settingCount: 1, isAssigned: true,
      assignments: [inc(G(1)), inc(G(11))],
      _settings: [simple(DEF_PWLEN, 12)] },

    // FAULT (T09): includes and excludes the SAME group. The exclusion wins,
    // so this policy is off for a group somebody explicitly turned it on for.
    { id: P(8), name: "MAC — FileVault", description: "Includes and excludes the Mac fleet at once.",
      platforms: "macOS", technologies: "mdm", createdDateTime: ago(170 * DAY), lastModifiedDateTime: ago(45 * DAY),
      roleScopeTagIds: ["0"], settingCount: 1, isAssigned: true,
      assignments: [inc(G(11)), exc(G(11))],
      _settings: [choice(DEF_BITLOCKER, `${DEF_BITLOCKER}_1`)] },

    // FAULT (T05): carries a secret. The documenter must redact it rather
    // than print a pre-shared key into a Word file somebody will email.
    { id: P(9), name: "WIN — Corporate Wi-Fi", description: "WPA2-Enterprise profile.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(280 * DAY), lastModifiedDateTime: ago(61 * DAY),
      roleScopeTagIds: ["0"], settingCount: 2, isAssigned: true, preSharedKey: "Contoso-PSK-2026-DoNotPrint",
      assignments: [inc(G(1))],
      _settings: [simple(DEF_PWLEN, 12)] },

    // Endpoint security policies (T16) — these carry templateReference, and
    // T16 drops anything whose templateFamily does not start endpointSecurity.
    { id: P(10), name: "ES — Firewall (Windows)", description: "Domain profile firewall.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(320 * DAY), lastModifiedDateTime: ago(22 * DAY),
      roleScopeTagIds: ["0"], settingCount: 1, isAssigned: false,
      templateReference: { templateId: "t-fw", templateFamily: "endpointSecurityFirewall", templateDisplayName: "Windows Firewall" },
      // FAULT (T16): a firewall policy exists, and it reaches nobody. The
      // portal reports a configured firewall; the fleet is on local defaults.
      assignments: [],
      _settings: [choice(DEF_FW, `${DEF_FW}_1`)] },

    { id: P(11), name: "ES — Antivirus (Windows)", description: "Next-gen protection.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(330 * DAY), lastModifiedDateTime: ago(18 * DAY),
      roleScopeTagIds: ["0"], settingCount: 1, isAssigned: true,
      templateReference: { templateId: "t-av", templateFamily: "endpointSecurityAntivirus", templateDisplayName: "Microsoft Defender Antivirus" },
      assignments: [inc(G(1))],
      _settings: [choice(DEF_RTP, `${DEF_RTP}_1`)] },

    // FAULT (T16): assigned only to the empty finance group. Reaches nobody,
    // for a different reason than the firewall policy above — and the two
    // failures have to read differently or the tool is not saying anything.
    { id: P(12), name: "ES — Attack surface reduction", description: "ASR rules in block mode.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(140 * DAY), lastModifiedDateTime: ago(35 * DAY),
      roleScopeTagIds: ["0"], settingCount: 1, isAssigned: true,
      templateReference: { templateId: "t-asr", templateFamily: "endpointSecurityAttackSurfaceReductionRules", templateDisplayName: "Attack Surface Reduction Rules" },
      assignments: [inc(G(3), F(1), "include")],
      _settings: [choice(DEF_ASR, `${DEF_ASR}_1`)] },

    { id: P(13), name: "ES — Disk encryption (BitLocker)", description: "Silent enablement.",
      platforms: "windows10", technologies: "mdm", createdDateTime: ago(350 * DAY), lastModifiedDateTime: ago(70 * DAY),
      roleScopeTagIds: ["0"], settingCount: 1, isAssigned: true,
      templateReference: { templateId: "t-de", templateFamily: "endpointSecurityDiskEncryption", templateDisplayName: "BitLocker" },
      assignments: [allDevices()],
      _settings: [choice(DEF_BITLOCKER, `${DEF_BITLOCKER}_1`)] },
  ];

  // ---------- legacy device configurations ----------
  //
  // These carry their settings as typed properties on the object itself
  // rather than in a /settings child, which is why T05 flattens them and T12
  // can only compare them within one @odata.type.
  const DEVICE_CONFIGS = [
    { id: P(20), "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
      displayName: "WIN — Legacy device restrictions", description: "Pre-catalog restrictions profile.",
      createdDateTime: ago(600 * DAY), lastModifiedDateTime: ago(90 * DAY), version: 4, roleScopeTagIds: ["0"],
      passwordMinimumLength: 8, passwordRequired: true, passwordBlockSimple: true,
      defenderScanType: "quick", smartScreenEnableInShell: true, storageRequireMobileDeviceEncryption: true,
      assignments: [inc(G(1))] },

    // FAULT (T12): the same @odata.type as the profile above, disagreeing on
    // passwordMinimumLength, and reaching the same group. Comparable, and
    // therefore reportable — unlike the catalog-versus-legacy case below.
    { id: P(21), "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
      displayName: "WIN — Kiosk restrictions", description: "Shared kiosk machines.",
      createdDateTime: ago(430 * DAY), lastModifiedDateTime: ago(210 * DAY), version: 2, roleScopeTagIds: ["0"],
      passwordMinimumLength: 4, passwordRequired: true, passwordBlockSimple: false,
      defenderScanType: "full", smartScreenEnableInShell: false, storageRequireMobileDeviceEncryption: true,
      assignments: [inc(G(1)), exc(G(2))] },

    // FAULT (T05): an OMA-URI custom profile whose value is a secret. Also
    // the shape T01's deploy step writes, so the demo's AppLocker deployment
    // has something real to collide with.
    { id: P(22), "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
      displayName: "TUNO AppLocker — Audit", description: "Custom OMA-URI profile.",
      createdDateTime: ago(45 * DAY), lastModifiedDateTime: ago(45 * DAY), version: 1, roleScopeTagIds: ["0"],
      omaSettings: [{
        "@odata.type": "#microsoft.graph.omaSettingString", displayName: "EXE policy",
        omaUri: "./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/TUNO/EXE/Policy",
        value: "<RuleCollection Type=\"Exe\" EnforcementMode=\"AuditOnly\" />",
      }],
      assignments: [inc(G(2))] },

    { id: P(23), "@odata.type": "#microsoft.graph.macOSGeneralDeviceConfiguration",
      displayName: "MAC — Device restrictions", description: "Mac fleet restrictions.",
      createdDateTime: ago(200 * DAY), lastModifiedDateTime: ago(52 * DAY), version: 3, roleScopeTagIds: ["0"],
      passwordMinimumLength: 10, passwordRequired: true, iCloudBlockDocumentSync: true,
      assignments: [inc(G(11))] },

    // FAULT (T05, T09): a Wi-Fi profile carrying a pre-shared key, and no
    // assignment. Two findings in one object.
    { id: P(24), "@odata.type": "#microsoft.graph.windowsWifiEnterpriseEAPConfiguration",
      displayName: "WIN — Guest Wi-Fi", description: "Never deployed.",
      createdDateTime: ago(310 * DAY), lastModifiedDateTime: ago(310 * DAY), version: 1, roleScopeTagIds: ["0"],
      ssid: "Contoso-Guest", preSharedKey: "guest-wifi-2026", networkName: "Contoso-Guest",
      assignments: [] },
  ];

  // ---------- compliance ----------
  const COMPLIANCE_POLICIES = [
    { id: P(30), "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      displayName: "WIN — Compliance baseline", description: "Windows compliance.",
      createdDateTime: ago(380 * DAY), lastModifiedDateTime: ago(25 * DAY), version: 6, roleScopeTagIds: ["0"],
      passwordRequired: true, passwordMinimumLength: 8, bitLockerEnabled: true, secureBootEnabled: true,
      osMinimumVersion: "10.0.19045.0",
      scheduledActionsForRule: [{ ruleName: "PasswordRequired", scheduledActionConfigurations: [
        { actionType: "block", gracePeriodHours: 24, notificationTemplateId: "" }] }],
      // The include on SEC-Baseline-Parent is the nesting fault (T02, T08):
      // SEC-Engineering is a member of that parent and therefore gets this
      // policy, while its OWN assignments list is empty. Anyone auditing the
      // engineering group directly concludes it is unmanaged.
      assignments: [inc(G(1)), inc(G(5)), exc(G(4))] },

    // FAULT (T13 compliance): the Mac fleet has devices enrolled and the only
    // macOS compliance policy is unassigned. With secureByDefault off (see
    // DEVICE_MANAGEMENT_SETTINGS), those Macs are treated as compliant and
    // sail through any Conditional Access rule that trusts compliance. This
    // is the single most valuable thing T13 says, so the demo must produce it.
    { id: P(31), "@odata.type": "#microsoft.graph.macOSCompliancePolicy",
      displayName: "MAC — Compliance baseline", description: "Built during the Mac rollout; never assigned.",
      createdDateTime: ago(160 * DAY), lastModifiedDateTime: ago(160 * DAY), version: 1, roleScopeTagIds: ["0"],
      passwordRequired: true, passwordMinimumLength: 8, storageRequireEncryption: true,
      scheduledActionsForRule: [{ ruleName: "PasswordRequired", scheduledActionConfigurations: [
        { actionType: "block", gracePeriodHours: 72, notificationTemplateId: "" }] }],
      assignments: [] },

    { id: P(32), "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      displayName: "WIN — Pilot compliance", description: "Ring 0.",
      createdDateTime: ago(70 * DAY), lastModifiedDateTime: ago(12 * DAY), version: 2, roleScopeTagIds: ["0"],
      passwordRequired: true, passwordMinimumLength: 12, bitLockerEnabled: true,
      scheduledActionsForRule: [{ ruleName: "PasswordRequired", scheduledActionConfigurations: [
        { actionType: "block", gracePeriodHours: 12, notificationTemplateId: "" }] }],
      assignments: [inc(G(2), F(1), "include")] },
  ];

  // FAULT (T13): secureByDefault is OFF. A device with no compliance policy
  // is therefore reported compliant rather than unknown — which is what makes
  // the unassigned macOS policy above dangerous instead of merely untidy.
  const DEVICE_MANAGEMENT_SETTINGS = {
    "@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/settings",
    secureByDefault: false,
    deviceComplianceCheckinThresholdDays: 30,
    isScheduledActionEnabled: true,
    enhancedJailBreak: false,
  };

  // ---------- ADMX ----------
  const ADMX_POLICIES = [
    { id: P(40), displayName: "ADMX — Office macro settings", description: "Ingested Office ADMX.",
      createdDateTime: ago(290 * DAY), lastModifiedDateTime: ago(64 * DAY), roleScopeTagIds: ["0"],
      assignments: [inc(G(1))],
      _definitionValues: [
        { id: "dv-1", enabled: true, definition: { id: "d-vba", classType: "user", displayName: "Block macros from the internet", categoryPath: "\\Microsoft Office 2016\\Security Settings" },
          presentationValues: [{ "@odata.type": "#microsoft.graph.groupPolicyPresentationValueBoolean", value: true }] },
      ] },

    // FAULT (T12): same definition, same category path, opposite enablement,
    // and both reach SEC-All-Workstations.
    { id: P(41), displayName: "ADMX — Office exceptions", description: "Exception set for the finance macros.",
      createdDateTime: ago(230 * DAY), lastModifiedDateTime: ago(190 * DAY), roleScopeTagIds: ["0"],
      assignments: [inc(G(1))],
      _definitionValues: [
        { id: "dv-2", enabled: false, definition: { id: "d-vba", classType: "user", displayName: "Block macros from the internet", categoryPath: "\\Microsoft Office 2016\\Security Settings" },
          presentationValues: [{ "@odata.type": "#microsoft.graph.groupPolicyPresentationValueBoolean", value: false }] },
      ] },
  ];

  // ---------- scripts ----------
  //
  // scriptContent is deliberately absent from the list objects and present
  // only on the single-object read. That N+1 is the whole reason T04 does a
  // second call per script, and a fixture that returned it in the list would
  // make the backup tool look like it was doing pointless work.
  const PLATFORM_SCRIPTS = [
    { id: P(50), displayName: "Set-CorporateWallpaper.ps1", description: "Branding.",
      createdDateTime: ago(220 * DAY), lastModifiedDateTime: ago(40 * DAY), runAsAccount: "system",
      fileName: "Set-CorporateWallpaper.ps1", assignments: [inc(G(1))],
      _scriptContent: "IyBTZXRzIHRoZSBjb3Jwb3JhdGUgd2FsbHBhcGVyLg0KV3JpdGUtT3V0cHV0ICdkZW1vJw==" },

    // FAULT (T04 backup): Graph returns this one without its body. It is
    // listed, it is archived, and it is NOT restorable — and an archive that
    // did not say so would be trusted in an incident.
    { id: P(51), displayName: "Remove-LegacyAgent.ps1", description: "Decommission script.",
      createdDateTime: ago(480 * DAY), lastModifiedDateTime: ago(300 * DAY), runAsAccount: "system",
      fileName: "Remove-LegacyAgent.ps1", assignments: [inc(G(7))],
      _scriptContent: null },
  ];

  const SHELL_SCRIPTS = [
    { id: P(52), displayName: "install-rosetta.sh", description: "Apple silicon prep.",
      createdDateTime: ago(190 * DAY), lastModifiedDateTime: ago(55 * DAY), runAsAccount: "system",
      fileName: "install-rosetta.sh", assignments: [inc(G(11))],
      _scriptContent: "IyEvYmluL3NoCnNvZnR3YXJldXBkYXRlIC0taW5zdGFsbC1yb3NldHRhIC0tYWdyZWUtdG8tbGljZW5zZQ==" },
  ];

  const HEALTH_SCRIPTS = [
    { id: P(53), displayName: "Detect stale BitLocker key", description: "Remediation script.",
      createdDateTime: ago(120 * DAY), lastModifiedDateTime: ago(28 * DAY),
      publisher: "Contoso", assignments: [inc(G(1))] },
    { id: P(54), displayName: "TUNO AppLocker — audit collector", description: "Created by TUNO.",
      createdDateTime: ago(45 * DAY), lastModifiedDateTime: ago(45 * DAY),
      publisher: "TUNO", assignments: [] },
  ];

  // ---------- apps ----------
  const MOBILE_APPS = [
    { id: P(60), "@odata.type": "#microsoft.graph.win32LobApp", displayName: "7-Zip 24.08", publisher: "Igor Pavlov",
      description: "Archiver.", createdDateTime: ago(150 * DAY), lastModifiedDateTime: ago(30 * DAY), isFeatured: false,
      assignments: [Object.assign({ intent: "required" }, inc(G(1)))] },

    { id: P(61), "@odata.type": "#microsoft.graph.officeSuiteApp", displayName: "Microsoft 365 Apps", publisher: "Microsoft",
      description: "Office.", createdDateTime: ago(500 * DAY), lastModifiedDateTime: ago(60 * DAY), isFeatured: true,
      assignments: [Object.assign({ intent: "required" }, allUsers())] },

    // FAULT (T08 what-if): joining SEC-Contractors gets you an uninstall.
    // "What changes if I add this person to that group" is the question T08
    // answers, and an uninstall is the answer nobody expects.
    { id: P(62), "@odata.type": "#microsoft.graph.win32LobApp", displayName: "Legacy VPN Client", publisher: "Contoso IT",
      description: "Being removed.", createdDateTime: ago(700 * DAY), lastModifiedDateTime: ago(20 * DAY), isFeatured: false,
      assignments: [Object.assign({ intent: "uninstall" }, inc(G(4)))] },

    { id: P(63), "@odata.type": "#microsoft.graph.macOSDmgApp", displayName: "Company Portal (macOS)", publisher: "Microsoft",
      description: "Enrolment portal.", createdDateTime: ago(210 * DAY), lastModifiedDateTime: ago(48 * DAY), isFeatured: false,
      assignments: [Object.assign({ intent: "available" }, inc(G(11)))] },
  ];

  // ---------- the smaller surfaces ----------
  //
  // Thin on purpose. They exist so the sweeps that read "every surface" — T02,
  // T04, T05, T09 — do not quietly skip a third of the tenant, and so the
  // per-surface counts on screen are real. Nothing here carries a planted
  // fault except where marked.
  const ENROLMENT_CONFIGS = [
    { id: P(70), "@odata.type": "#microsoft.graph.deviceEnrollmentLimitConfiguration",
      displayName: "Device limit", description: "Five per user.", priority: 1, limit: 5,
      createdDateTime: ago(600 * DAY), lastModifiedDateTime: ago(180 * DAY), assignments: [allUsers()] },
    // Enrolment is the one surface where "no assignment" is normal — the
    // tenant-wide default has none by design, and T09 exempts it. It is here
    // so that exemption is exercised rather than assumed.
    { id: P(71), "@odata.type": "#microsoft.graph.deviceEnrollmentPlatformRestrictionsConfiguration",
      displayName: "All users — platform restrictions", description: "Tenant default.", priority: 0,
      createdDateTime: ago(600 * DAY), lastModifiedDateTime: ago(600 * DAY), assignments: [] },
  ];

  const AUTOPILOT_PROFILES = [
    { id: P(72), "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile",
      displayName: "AP — Corporate self-deploying", description: "Autopilot.",
      createdDateTime: ago(400 * DAY), lastModifiedDateTime: ago(75 * DAY),
      language: "nl-NL", deviceNameTemplate: "CON-%SERIAL%", assignments: [allDevices()] },
  ];

  const FEATURE_UPDATES = [
    { id: P(73), displayName: "FU — Windows 11 23H2", description: "Feature update ring.",
      featureUpdateVersion: "Windows 11, version 23H2", createdDateTime: ago(260 * DAY),
      lastModifiedDateTime: ago(80 * DAY), assignments: [inc(G(8))] },
  ];
  const QUALITY_UPDATES = [
    { id: P(74), displayName: "QU — Expedite critical", description: "Expedited quality updates.",
      createdDateTime: ago(120 * DAY), lastModifiedDateTime: ago(15 * DAY), assignments: [inc(G(1))] },
  ];
  const DRIVER_UPDATES = [
    // FAULT (T09): another unassigned profile, on a surface people forget to
    // check at all.
    { id: P(75), displayName: "DU — Manual approval", description: "Never assigned.",
      approvalType: "manual", createdDateTime: ago(100 * DAY), lastModifiedDateTime: ago(100 * DAY), assignments: [] },
  ];

  const IOS_APP_PROTECTION = [
    { id: P(80), displayName: "APP — iOS baseline", description: "MAM for iOS.",
      createdDateTime: ago(300 * DAY), lastModifiedDateTime: ago(50 * DAY),
      pinRequired: true, allowedInboundDataTransferSources: "managedApps",
      assignments: [allUsers()], apps: [{ id: "com.microsoft.office.outlook", mobileAppIdentifier: { bundleId: "com.microsoft.office.outlook" } }] },
  ];
  const ANDROID_APP_PROTECTION = [
    { id: P(81), displayName: "APP — Android baseline", description: "MAM for Android.",
      createdDateTime: ago(300 * DAY), lastModifiedDateTime: ago(50 * DAY),
      pinRequired: true, allowedInboundDataTransferSources: "managedApps",
      assignments: [allUsers()], apps: [{ id: "com.microsoft.office.outlook", mobileAppIdentifier: { packageId: "com.microsoft.office.outlook" } }] },
  ];
  const WINDOWS_APP_PROTECTION = [];
  const WIP_POLICIES = [];

  const APP_CONFIGS_DEVICE = [
    { id: P(82), "@odata.type": "#microsoft.graph.iosMobileAppConfiguration",
      displayName: "CFG — Outlook iOS", description: "App configuration.",
      createdDateTime: ago(240 * DAY), lastModifiedDateTime: ago(70 * DAY), assignments: [allUsers()] },
  ];
  const APP_CONFIGS_MANAGED = [
    { id: P(83), displayName: "CFG — Managed Outlook", description: "Targeted managed app config.",
      createdDateTime: ago(240 * DAY), lastModifiedDateTime: ago(70 * DAY),
      assignments: [allUsers()], apps: [{ id: "com.microsoft.office.outlook" }] },
  ];

  const SCOPE_TAGS = [
    { id: "0", displayName: "Default", description: "Default scope tag.", isBuiltIn: true },
    { id: "1", displayName: "Amsterdam", description: "Amsterdam site.", isBuiltIn: false },
  ];
  const DEVICE_CATEGORIES = [
    { id: "cat-1", displayName: "Kiosk", description: "Shared kiosk devices." },
    { id: "cat-2", displayName: "Standard", description: "Standard user devices." },
  ];
  const TERMS = [
    { id: P(84), displayName: "Acceptable use", description: "T&C.", title: "Acceptable use policy",
      version: 2, createdDateTime: ago(500 * DAY), lastModifiedDateTime: ago(120 * DAY), assignments: [allUsers()] },
  ];
  const NOTIFICATION_TEMPLATES = [
    { id: P(85), displayName: "Non-compliance notice", brandingOptions: "includeCompanyLogo",
      localizedNotificationMessages: [{ id: "ln-1", locale: "en-us", subject: "Your device is not compliant", messageTemplate: "Please contact the service desk.", isDefault: true }] },
  ];
  const APP_CATEGORIES = [
    { id: "ac-1", displayName: "Productivity" },
    { id: "ac-2", displayName: "Business" },
  ];
  const CUSTOM_ATTRIBUTE_SCRIPTS = [];

  // ---------- endpoint security legacy intents (T16) ----------
  const INTENTS = [
    // FAULT (T16): firewall was configured BOTH ways and neither one reaches
    // anybody — the settings-catalog policy is unassigned and so is this
    // legacy intent. The intent still has to be CLASSIFIED into Firewall
    // rather than dumped in a "legacy" bucket, because a tool that ignored it
    // would report one firewall policy where there are two; but classifying
    // it must not be confused with it working. Assigned, it would have made
    // the discipline read "covered" and hidden the gap behind it, which is
    // the mistake in the dangerous direction.
    { id: P(90), displayName: "Legacy — Firewall intent", description: "Created from the security baseline. Never assigned.",
      templateId: "tmpl-fw-legacy", isAssigned: false, lastModifiedDateTime: ago(400 * DAY) },
    // And one whose template cannot be resolved to a discipline at all. It
    // counts toward nothing, and the screen says so rather than guessing.
    { id: P(91), displayName: "Legacy — unclassifiable", description: "Template no longer resolvable.",
      templateId: "tmpl-gone", isAssigned: false, lastModifiedDateTime: ago(450 * DAY) },
  ];
  const TEMPLATES = [
    { id: "tmpl-fw-legacy", displayName: "Windows Firewall (legacy intent)" },
  ];

  // ---------- Intune RBAC (T07) ----------
  const ROLE_DEFINITIONS = [
    { id: R(1), displayName: "Help Desk Operator", description: "Built-in.", isBuiltIn: true },
    { id: R(2), displayName: "Policy and Profile Manager", description: "Built-in.", isBuiltIn: true },
    { id: R(3), displayName: "Endpoint Security Manager", description: "Built-in.", isBuiltIn: true },
    { id: R(4), displayName: "Contoso — Read only", description: "Custom.", isBuiltIn: false },
  ];

  const ROLE_ASSIGNMENTS = [
    // FAULT (T07): scoped to all devices. Whatever the role can do, it can do
    // everywhere — which is a decision, but it should be a visible one.
    { id: R(11), displayName: "Helpdesk — all devices", description: "Service desk.",
      roleDefinition: { id: R(1), displayName: "Help Desk Operator" },
      members: [G(12)], resourceScopes: [], scopeMembers: [], scopeType: "allDevices",
      roleScopeTags: [{ id: "0", displayName: "Default" }] },

    { id: R(12), displayName: "Policy managers — Amsterdam", description: "Scoped to the Amsterdam tag.",
      roleDefinition: { id: R(2), displayName: "Policy and Profile Manager" },
      members: [G(9)], resourceScopes: [G(1)], scopeMembers: [G(1)], scopeType: "resourceScope",
      roleScopeTags: [{ id: "1", displayName: "Amsterdam" }] },

    // FAULT (T07): a role assignment with nobody in it. It grants nothing,
    // and it will keep granting nothing until somebody notices.
    { id: R(13), displayName: "Endpoint security — unstaffed", description: "Created, never populated.",
      roleDefinition: { id: R(3), displayName: "Endpoint Security Manager" },
      members: [], resourceScopes: [], scopeMembers: [], scopeType: "resourceScope",
      roleScopeTags: [{ id: "0", displayName: "Default" }] },

    // FAULT (T07): a member GUID that getByIds will not resolve. The grant is
    // real; the grantee cannot be named. Reporting it as a blank row would be
    // worse than reporting the GUID.
    { id: R(14), displayName: "Read only — offboarded owner", description: "Member no longer exists.",
      roleDefinition: { id: R(4), displayName: "Contoso — Read only" },
      members: [DELETED_GROUP], resourceScopes: [], scopeMembers: [], scopeType: "resourceScope",
      roleScopeTags: [{ id: "0", displayName: "Default" }] },
  ];

  // ---------- multi-admin approval (T17) ----------
  //
  // FAULT: there are policies for apps and scripts, and NONE for role
  // changes or configuration policies. Those two categories have no gate at
  // all — anyone with the role can change them unreviewed — and that absence
  // is invisible in the portal, which only lists the policies that exist.
  const MAA_POLICIES = [
    { id: P(95), displayName: "Apps require approval", description: "App changes need a second pair of eyes.",
      policyType: "app", approverGroupIds: [G(9)], lastModifiedDateTime: ago(60 * DAY) },
    // FAULT: the approver group is empty. Every script change queues forever.
    { id: P(96), displayName: "Scripts require approval", description: "Script changes gated.",
      policyType: "script", approverGroupIds: [G(10)], lastModifiedDateTime: ago(55 * DAY) },
  ];

  const MAA_REQUESTS = [
    { id: "req-1", status: "needsApproval", requestDateTime: ago(3 * DAY), approvalDateTime: null,
      requestJustification: "Deploy 7-Zip 24.08 to the fleet." },
    { id: "req-2", status: "approved", requestDateTime: ago(9 * DAY), approvalDateTime: ago(8 * DAY),
      requestJustification: "Update the wallpaper script." },
    // Approved with no timestamp — sits outside the approval-time numbers
    // rather than being counted as instant.
    { id: "req-3", status: 1, requestDateTime: ago(20 * DAY), approvalDateTime: null,
      requestJustification: "Remove the legacy VPN client." },
    { id: "req-4", status: "rejected", requestDateTime: ago(14 * DAY), approvalDateTime: ago(14 * DAY),
      requestJustification: "Disable BitLocker on the kiosk fleet." },
  ];

  // ---------- Windows LAPS (T18) ----------
  //
  // Keyed on the Entra device id, which is what makes the join to
  // managedDevices.azureADDeviceId the whole tool.
  const LAPS_CREDENTIALS = [
    { id: D(101), deviceName: "WS-FIN-0142", lastBackupDateTime: ago(2 * DAY) },
    // FAULT (T18): escrowed 140 days ago. The password on that machine has
    // not rotated since, and a stale escrow is a stale local admin password.
    { id: D(103), deviceName: "WS-HR-0031", lastBackupDateTime: ago(140 * DAY) },
    { id: D(107), deviceName: "WS-ENG-0221", lastBackupDateTime: ago(6 * HOUR) },
    // FAULT (T18): escrowed with no timestamp at all — present, unverifiable.
    { id: D(109), deviceName: "WS-ENG-0308", lastBackupDateTime: null },
    // FAULT (T18): a credential for a device Intune does not manage. Either
    // it was unenrolled and the escrow outlived it, or it never enrolled.
    { id: D(199), deviceName: "WS-GONE-0001", lastBackupDateTime: ago(70 * DAY) },
    // D(102), D(108), D(110) are deliberately absent — Windows devices with
    // NO escrow at all, which is the finding that matters most.
  ];

  // ---------- Defender (T15) ----------
  const DEFENDER_OVERVIEW = {
    "@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceProtectionOverview",
    totalReportedDeviceCount: 7, cleanDeviceCount: 3, criticalFailuresDeviceCount: 1,
    pendingSignatureUpdateDeviceCount: 1, pendingRestartDeviceCount: 1, inactiveThreatAgentDeviceCount: 1,
  };

  const PROTECTION_STATE = {
    [D(1)]: { lastReportedDateTime: ago(3 * HOUR), malwareProtectionEnabled: true, realTimeProtectionEnabled: true,
              tamperProtectionEnabled: true, signatureUpdateOverdue: false, quickScanOverdue: false, fullScanOverdue: false,
              rebootRequired: false, deviceState: "clean", signatureVersion: "1.423.891.0", engineVersion: "1.1.24090.11", antiMalwareVersion: "4.18.24090.11" },
    // FAULT (T15): tamper protection off. Everything else is green, which is
    // exactly why it goes unnoticed — the device reports as protected.
    [D(2)]: { lastReportedDateTime: ago(9 * DAY), malwareProtectionEnabled: true, realTimeProtectionEnabled: true,
              tamperProtectionEnabled: false, signatureUpdateOverdue: true, quickScanOverdue: true, fullScanOverdue: false,
              rebootRequired: false, deviceState: "pendingFullScan", signatureVersion: "1.421.55.0", engineVersion: "1.1.24080.9", antiMalwareVersion: "4.18.24080.9" },
    // FAULT (T15): real-time protection off outright.
    [D(3)]: { lastReportedDateTime: ago(45 * DAY), malwareProtectionEnabled: true, realTimeProtectionEnabled: false,
              tamperProtectionEnabled: true, signatureUpdateOverdue: true, quickScanOverdue: false, fullScanOverdue: true,
              rebootRequired: true, deviceState: "pendingManualSteps", signatureVersion: "1.415.12.0", engineVersion: "1.1.24050.2", antiMalwareVersion: "4.18.24050.2" },
    // FAULT (T15): reports two of the three flags. Tamper protection is not
    // false here — it is UNREPORTED, and a tool that renders the two the same
    // way is inventing a finding.
    [D(5)]: { lastReportedDateTime: ago(30 * HOUR), malwareProtectionEnabled: true, realTimeProtectionEnabled: true,
              signatureUpdateOverdue: false, quickScanOverdue: false, fullScanOverdue: false,
              rebootRequired: false, deviceState: "clean", signatureVersion: "1.423.888.0", engineVersion: "1.1.24090.11", antiMalwareVersion: "4.18.24090.11" },
    [D(7)]: { lastReportedDateTime: ago(50 * MIN), malwareProtectionEnabled: true, realTimeProtectionEnabled: true,
              tamperProtectionEnabled: true, signatureUpdateOverdue: false, quickScanOverdue: false, fullScanOverdue: false,
              rebootRequired: false, deviceState: "clean", signatureVersion: "1.423.891.0", engineVersion: "1.1.24090.11", antiMalwareVersion: "4.18.24090.11" },
    [D(9)]: { lastReportedDateTime: ago(20 * MIN), malwareProtectionEnabled: true, realTimeProtectionEnabled: true,
              tamperProtectionEnabled: true, signatureUpdateOverdue: false, quickScanOverdue: false, fullScanOverdue: false,
              rebootRequired: true, deviceState: "pendingReboot", signatureVersion: "1.423.891.0", engineVersion: "1.1.24090.11", antiMalwareVersion: "4.18.24090.11" },
    // D(8) and D(10) have NO entry — their batch request answers 404, which
    // is the "no state reported" bucket rather than a clean device.
  };

  // ---------- audit events (T03) ----------
  //
  // modifiedProperties values arrive from Graph as JSON strings, sometimes
  // double-encoded, sometimes wrapped in a one-element array. All three
  // shapes are here on purpose: the differ handles them, and a fixture that
  // only used the easy one would let a regression through.
  const AUDIT_EVENTS = [
    { id: "ae-1", activityDateTime: ago(2 * HOUR), activity: "Patch DeviceManagementConfigurationPolicy",
      displayName: "Patch DeviceManagementConfigurationPolicy", activityType: "Patch DeviceManagementConfigurationPolicy",
      activityOperationType: "Patch", category: "DeviceConfiguration", activityResult: "Success",
      correlationId: "c-1001",
      actor: { userPrincipalName: "alex.admin@contoso.com", ipAddress: "203.0.113.24", applicationDisplayName: "Microsoft Intune portal" },
      resources: [{ displayName: "WIN — Security baseline (Defender)", resourceId: P(1), modifiedProperties: [
        { displayName: "settings", oldValue: "\"{\\\"minimumPasswordLength\\\":8}\"", newValue: "\"{\\\"minimumPasswordLength\\\":12}\"" },
        { displayName: "description", oldValue: "Defender settings.", newValue: "Defender settings for the managed fleet." },
      ] }] },

    // FAULT (T03): a failure. Drives the failure-rate card, and severity high.
    { id: "ae-2", activityDateTime: ago(5 * HOUR), activity: "Delete DeviceConfiguration",
      displayName: "Delete DeviceConfiguration", activityType: "Delete DeviceConfiguration",
      activityOperationType: "Delete", category: "DeviceConfiguration", activityResult: "Failure",
      correlationId: "c-1002",
      actor: { userPrincipalName: "sam@contoso.com", ipAddress: "198.51.100.31", applicationDisplayName: "Microsoft Graph" },
      resources: [{ displayName: "WIN — Guest Wi-Fi", resourceId: P(24), modifiedProperties: [] }] },

    // FAULT (T03): a delete that succeeded. High severity, and the kind of
    // event that explains a dangling reference three screens away.
    { id: "ae-3", activityDateTime: ago(26 * HOUR), activity: "Delete Group assignment",
      displayName: "Delete DeviceManagementConfigurationPolicyAssignment",
      activityType: "Delete DeviceManagementConfigurationPolicyAssignment",
      activityOperationType: "Delete", category: "DeviceConfiguration", activityResult: "Success",
      correlationId: "c-1003",
      actor: { userPrincipalName: "alex.admin@contoso.com", ipAddress: "203.0.113.24", applicationDisplayName: "Microsoft Intune portal" },
      resources: [
        { displayName: "WIN — Disk encryption", resourceId: P(4), modifiedProperties: [
          { displayName: "assignments", oldValue: "[{\"target\":{\"groupId\":\"" + DELETED_GROUP + "\"}}]", newValue: "[]" }] },
        { displayName: "SEC-Finance-Legacy", resourceId: DELETED_GROUP, modifiedProperties: [] },
      ] },

    { id: "ae-4", activityDateTime: ago(3 * DAY), activity: "Create DeviceCompliancePolicy",
      displayName: "Create DeviceCompliancePolicy", activityType: "Create DeviceCompliancePolicy",
      activityOperationType: "Create", category: "Compliance", activityResult: "Success",
      correlationId: "c-1004",
      actor: { userPrincipalName: "sam@contoso.com", ipAddress: "198.51.100.31", applicationDisplayName: "Microsoft Intune portal" },
      resources: [{ displayName: "WIN — Pilot compliance", resourceId: P(32), modifiedProperties: [
        { displayName: "passwordMinimumLength", oldValue: null, newValue: "12" }] }] },

    // FAULT (T03): no modifiedProperties at all — "no field-level detail" is
    // an honest answer and has to render as one rather than as an empty diff.
    { id: "ae-5", activityDateTime: ago(4 * DAY), activity: "Patch MobileApp",
      displayName: "Patch MobileApp", activityType: "Patch MobileApp",
      activityOperationType: "Patch", category: "Application", activityResult: "Success",
      correlationId: "c-1005",
      actor: { userPrincipalName: "alex.admin@contoso.com", ipAddress: "203.0.113.24", applicationDisplayName: "Microsoft Graph" },
      resources: [{ displayName: "Legacy VPN Client", resourceId: P(62) }] },

    { id: "ae-6", activityDateTime: ago(8 * DAY), activity: "Patch DeviceManagementScript",
      displayName: "Patch DeviceManagementScript", activityType: "Patch DeviceManagementScript",
      activityOperationType: "Patch", category: "DeviceConfiguration", activityResult: "Success",
      correlationId: "c-1006",
      actor: { userPrincipalName: "alex.admin@contoso.com", ipAddress: "203.0.113.24", applicationDisplayName: "Microsoft Intune portal" },
      resources: [{ displayName: "Set-CorporateWallpaper.ps1", resourceId: P(50), modifiedProperties: [
        // Double-encoded, and wrapped in a one-element array. Both at once,
        // because Graph really does this.
        { displayName: "scriptContent", oldValue: ["\"\\\"# old\\\"\""], newValue: ["\"\\\"# new\\\"\""] }] }] },

    { id: "ae-7", activityDateTime: ago(12 * DAY), activity: "Create RoleAssignment",
      displayName: "Create RoleAssignment", activityType: "Create RoleAssignment",
      activityOperationType: "Create", category: "Role", activityResult: "Success",
      correlationId: "c-1007",
      actor: { userPrincipalName: "alex.admin@contoso.com", ipAddress: "203.0.113.24", applicationDisplayName: "Microsoft Intune portal" },
      resources: [{ displayName: "Helpdesk — all devices", resourceId: R(11), modifiedProperties: [
        { displayName: "scopeType", oldValue: null, newValue: "allDevices" }] }] },
  ];

  // ---------- settings catalog metadata (T10) ----------
  //
  // A real tenant answers roughly seventeen thousand definitions here. A
  // handful is enough to prove the search, the keyword ranking and — the part
  // that matters — the join from a definition to the policies that set it.
  const CONFIG_CATEGORIES = [
    { id: "cat-defender", displayName: "Microsoft Defender Antivirus" },
    { id: "cat-bitlocker", displayName: "BitLocker" },
    { id: "cat-devicelock", displayName: "Device Lock" },
    { id: "cat-firewall", displayName: "Firewall" },
    { id: "cat-localsec", displayName: "Local Policies Security Options" },
  ];

  const CONFIG_SETTINGS = [
    { id: DEF_RTP, displayName: "Turn on real-time protection", categoryId: "cat-defender",
      description: "Controls whether Microsoft Defender Antivirus real-time protection is running.",
      keywords: ["defender", "antivirus", "real-time", "realtime"], applicability: { platform: "windows10" } },
    { id: DEF_BITLOCKER, displayName: "Require device encryption", categoryId: "cat-bitlocker",
      description: "Requires BitLocker device encryption on the operating system drive.",
      keywords: ["bitlocker", "encryption", "disk"], applicability: { platform: "windows10" } },
    { id: DEF_PWLEN, displayName: "Minimum password length", categoryId: "cat-devicelock",
      description: "The fewest characters a device password may contain.",
      keywords: ["password", "pin", "length", "devicelock"], applicability: { platform: "windows10" } },
    { id: DEF_SMBv1, displayName: "SMBv1 client driver start configuration", categoryId: "cat-localsec",
      description: "Controls how the legacy SMBv1 client driver starts.",
      keywords: ["smb", "smbv1", "legacy", "protocol"], applicability: { platform: "windows10" } },
    { id: DEF_FW, displayName: "Enable firewall (domain profile)", categoryId: "cat-firewall",
      description: "Turns the Windows firewall on for the domain profile.",
      keywords: ["firewall", "domain", "network"], applicability: { platform: "windows10" } },
    { id: DEF_ASR, displayName: "Attack surface reduction rules", categoryId: "cat-defender",
      description: "Configures the Defender attack surface reduction rule set.",
      keywords: ["asr", "attack surface", "defender", "exploit"], applicability: { platform: "windows10" } },
    // FAULT (T10): a well-known setting that NOTHING in this tenant sets.
    // "Nothing sets it" is a different answer from "could not be read", and
    // the tool is only useful if it can tell them apart.
    { id: "device_vendor_msft_policy_config_defender_puaprotection",
      displayName: "Configure potentially unwanted application protection", categoryId: "cat-defender",
      description: "Blocks potentially unwanted applications.",
      keywords: ["pua", "defender", "unwanted"], applicability: { platform: "windows10" } },
  ];

  // ---------- per-policy status (T09 status column, T13) ----------
  const STATUS_OVERVIEW = {
    [P(1)]: { successCount: 371, errorCount: 4, failedCount: 9, conflictCount: 6, pendingCount: 12, notApplicableCount: 16 },
    [P(2)]: { successCount: 388, errorCount: 0, failedCount: 2, conflictCount: 6, pendingCount: 4, notApplicableCount: 18 },
    [P(20)]: { successCount: 402, errorCount: 1, failedCount: 3, conflictCount: 0, pendingCount: 2, notApplicableCount: 10 },
    [P(30)]: { compliantCount: 344, errorCount: 3, nonCompliantCount: 41, conflictCount: 2, inGracePeriodCount: 8 },
    [P(32)]: { compliantCount: 11, errorCount: 0, nonCompliantCount: 1, conflictCount: 0, inGracePeriodCount: 0 },
  };

  const SETTING_STATE_SUMMARIES = {
    [P(30)]: [
      { id: "ss-1", settingName: "Require BitLocker", nonCompliantDeviceCount: 28, errorDeviceCount: 2, conflictDeviceCount: 1, compliantDeviceCount: 351 },
      { id: "ss-2", settingName: "Minimum OS version", nonCompliantDeviceCount: 13, errorDeviceCount: 1, conflictDeviceCount: 0, compliantDeviceCount: 368 },
    ],
    [P(32)]: [
      { id: "ss-3", settingName: "Require BitLocker", nonCompliantDeviceCount: 1, errorDeviceCount: 0, conflictDeviceCount: 0, compliantDeviceCount: 11 },
    ],
  };

  const RUN_SUMMARY = {
    [P(50)]: { successDeviceCount: 396, errorDeviceCount: 12 },
    [P(51)]: { successDeviceCount: 6, errorDeviceCount: 2 },
    [P(52)]: { successDeviceCount: 58, errorDeviceCount: 3 },
    [P(53)]: { noIssueDetectedDeviceCount: 380, detectionScriptErrorDeviceCount: 7, detectionScriptPendingDeviceCount: 31 },
    [P(54)]: { noIssueDetectedDeviceCount: 0, detectionScriptErrorDeviceCount: 0, detectionScriptPendingDeviceCount: 0 },
  };

  // ---------- device state (T06) ----------
  //
  // The id of a state record CONTAINS the policy GUID — that is how T06
  // matches a reported state back to the policy it came from.
  const DEVICE_CONFIG_STATES = {
    [D(1)]: [
      { id: `${D(1)}_${P(1)}`, displayName: "WIN — Security baseline (Defender)", state: "compliant", settingStates: [] },
      { id: `${D(1)}_${P(20)}`, displayName: "WIN — Legacy device restrictions", state: "conflict", settingStates: [
        { setting: "passwordMinimumLength", settingName: "Minimum password length", state: "conflict" }] },
    ],
    [D(2)]: [
      // FAULT (T06): the assignments say this policy applies; the device says
      // it errored. Intended versus actual, which is the gap T06 exists for.
      { id: `${D(2)}_${P(1)}`, displayName: "WIN — Security baseline (Defender)", state: "error", settingStates: [
        { setting: "defender_allowrealtimemonitoring", settingName: "Turn on real-time protection", state: "error" }] },
    ],
  };

  const DEVICE_COMPLIANCE_STATES = {
    [D(1)]: [{ id: `${D(1)}_${P(30)}`, displayName: "WIN — Compliance baseline", state: "compliant", settingStates: [] }],
    [D(2)]: [{ id: `${D(2)}_${P(30)}`, displayName: "WIN — Compliance baseline", state: "noncompliant", settingStates: [
      { setting: "bitLockerEnabled", settingName: "Require BitLocker", state: "noncompliant" }] }],
    [D(4)]: [],
  };

  // ---------- Microsoft Secure Score (T21 · R02) ----------
  //
  // The fixture is built to exercise every branch T21 and T20's correlation
  // have, not to flatter the demo tenant:
  //
  //   * a rising trend with ONE REGRESSION in it, so improved and regressed
  //     both have something to say;
  //   * controls across four categories, so the category bars draw;
  //   * a DEPRECATED control, which must be excluded from the sums;
  //   * a control with NO PROFILE, which must render under its raw id and
  //     count as neither achieved nor a gap;
  //   * and — the point of the whole build — a control MDATP_Onboarding
  //     scoring near zero while the demo tenant's EDR policy is assigned
  //     and correct, which is exactly the "configured here, unscored there"
  //     bucket T20 leads its Secure Score node with.
  const SS_PROFILES = [
    { id: "mdatp_onboarding", title: "Onboard devices to Microsoft Defender for Endpoint", maxScore: 10, controlCategory: "Device", rank: 3, tier: "Core", userImpact: "low", implementationCost: "moderate", actionType: "Config", service: "Microsoft Defender for Endpoint", threats: ["accountBreach", "maliciousInsider"], deprecated: false, actionUrl: "https://security.microsoft.com/securitysettings/endpoints/onboarding", remediation: "Onboard every eligible Windows device to Defender for Endpoint. A device with a policy but no sensor reports nothing, and nothing is what this control scores.", remediationImpact: "None for users — onboarding is silent." },
    { id: "mdatp_tamperprotection", title: "Turn on tamper protection", maxScore: 8, controlCategory: "Device", rank: 5, tier: "Core", userImpact: "low", implementationCost: "low", actionType: "Config", service: "Microsoft Defender for Endpoint", threats: ["maliciousInsider"], deprecated: false, actionUrl: "https://security.microsoft.com/preferences2/integration", remediation: "Enable tamper protection so Defender's own settings cannot be switched off locally.", remediationImpact: "None for users." },
    { id: "mdatp_realtimeprotection", title: "Turn on real-time protection", maxScore: 8, controlCategory: "Device", rank: 4, tier: "Core", userImpact: "low", implementationCost: "low", actionType: "Config", service: "Microsoft Defender for Endpoint", threats: ["accountBreach"], deprecated: false, actionUrl: "", remediation: "Set Allow Realtime Monitoring to Allowed in an antivirus policy.", remediationImpact: "None for users." },
    { id: "mdatp_pua", title: "Block potentially unwanted applications", maxScore: 4, controlCategory: "Device", rank: 22, tier: "Defense in Depth", userImpact: "low", implementationCost: "low", actionType: "Config", service: "Microsoft Defender for Endpoint", threats: ["dataSpillage"], deprecated: false, actionUrl: "", remediation: "Set PUA Protection to Block rather than Audit.", remediationImpact: "Some bundled installers stop running." },
    { id: "mdatp_attacksurfacereductionrules", title: "Enable attack surface reduction rules", maxScore: 12, controlCategory: "Device", rank: 8, tier: "Defense in Depth", userImpact: "moderate", implementationCost: "moderate", actionType: "Config", service: "Microsoft Defender for Endpoint", threats: ["accountBreach", "elevationOfPrivilege"], deprecated: false, actionUrl: "", remediation: "Move the standard protection rules from Audit into Block.", remediationImpact: "A small number of line-of-business macros and scripts may be blocked." },
    { id: "mdatp_networkprotection", title: "Turn network protection on", maxScore: 6, controlCategory: "Device", rank: 14, tier: "Defense in Depth", userImpact: "moderate", implementationCost: "low", actionType: "Config", service: "Microsoft Defender for Endpoint", threats: ["phishingOrWhaling"], deprecated: false, actionUrl: "", remediation: "Set Enable Network Protection to Block rather than Audit.", remediationImpact: "Users lose access to sites Microsoft rates as malicious." },
    { id: "mdatp_diskencryption", title: "Require BitLocker on all Windows devices", maxScore: 8, controlCategory: "Device", rank: 11, tier: "Core", userImpact: "low", implementationCost: "moderate", actionType: "Config", service: "Microsoft Intune", threats: ["dataExfiltration"], deprecated: false, actionUrl: "", remediation: "Require device encryption in a disk encryption policy and confirm escrow.", remediationImpact: "First encryption pass costs battery on older hardware." },
    { id: "defender_edrblockmode", title: "Turn on EDR in block mode", maxScore: 5, controlCategory: "Device", rank: 19, tier: "Advanced", userImpact: "low", implementationCost: "low", actionType: "Config", service: "Microsoft Defender for Endpoint", threats: ["accountBreach"], deprecated: false, actionUrl: "", remediation: "Enable EDR in block mode so behavioural detections are remediated rather than only reported.", remediationImpact: "None for users." },
    { id: "edge_smartscreen", title: "Enable Microsoft Defender SmartScreen in Edge", maxScore: 5, controlCategory: "Apps", rank: 17, tier: "Core", userImpact: "low", implementationCost: "low", actionType: "Config", service: "Microsoft Edge", threats: ["phishingOrWhaling"], deprecated: false, actionUrl: "", remediation: "Turn SmartScreen on and prevent users from bypassing its prompts.", remediationImpact: "Users can no longer click through a SmartScreen warning." },
    { id: "apps_thirdpartybrowserpolicy", title: "Manage third-party browser extensions", maxScore: 4, controlCategory: "Apps", rank: 41, tier: "Defense in Depth", userImpact: "moderate", implementationCost: "moderate", actionType: "Config", service: "Microsoft Edge", threats: ["dataExfiltration"], deprecated: false, actionUrl: "", remediation: "Publish an extension allow list rather than leaving installation open.", remediationImpact: "Users must ask for extensions that are not on the list." },
    { id: "aad_mfa_admins", title: "Require MFA for administrative roles", maxScore: 10, controlCategory: "Identity", rank: 1, tier: "Core", userImpact: "moderate", implementationCost: "low", actionType: "Config", service: "Microsoft Entra ID", threats: ["accountBreach"], deprecated: false, actionUrl: "", remediation: "Require multifactor authentication for every privileged role.", remediationImpact: "Administrators are challenged at sign-in." },
    { id: "aad_legacy_auth", title: "Block legacy authentication", maxScore: 8, controlCategory: "Identity", rank: 2, tier: "Core", userImpact: "moderate", implementationCost: "moderate", actionType: "Config", service: "Microsoft Entra ID", threats: ["accountBreach", "passwordCracking"], deprecated: false, actionUrl: "", remediation: "Block legacy authentication protocols with a Conditional Access policy.", remediationImpact: "Old mail clients stop connecting." },
    { id: "dlp_policy_exists", title: "Create a data loss prevention policy", maxScore: 6, controlCategory: "Data", rank: 27, tier: "Defense in Depth", userImpact: "low", implementationCost: "high", actionType: "Config", service: "Microsoft Purview", threats: ["dataExfiltration"], deprecated: false, actionUrl: "", remediation: "Publish a DLP policy covering the sensitive information types the organisation actually holds.", remediationImpact: "Some sharing is blocked or warned on." },
    // Deprecated: still on old readings, must be excluded from every sum.
    { id: "legacy_retired_control", title: "A control Microsoft has retired", maxScore: 5, controlCategory: "Device", rank: 99, tier: "Defense in Depth", userImpact: "low", implementationCost: "low", actionType: "Review", service: "Microsoft 365", threats: [], deprecated: true, actionUrl: "", remediation: "Nothing — this control no longer counts.", remediationImpact: "" },
  ];

  // Per-control scores on the LATEST reading. The tenant is deliberately
  // uneven: onboarding is the big miss, tamper and real-time are done, ASR
  // is half-done, and one control carries no profile at all.
  const SS_LATEST_CONTROLS = [
    { controlName: "mdatp_onboarding", controlCategory: "Device", score: 1, description: "63 of 418 eligible Windows devices report a Defender for Endpoint sensor." },
    { controlName: "mdatp_tamperprotection", controlCategory: "Device", score: 8, description: "Tamper protection is reported on by every device that checked in." },
    { controlName: "mdatp_realtimeprotection", controlCategory: "Device", score: 8, description: "Real-time protection is on across the reporting estate." },
    { controlName: "mdatp_pua", controlCategory: "Device", score: 0, description: "PUA protection is in audit on the devices that report it." },
    { controlName: "mdatp_attacksurfacereductionrules", controlCategory: "Device", score: 5, description: "Some rules are in Block, the standard protection set is in Audit." },
    { controlName: "mdatp_networkprotection", controlCategory: "Device", score: 0, description: "Network protection is not reported as enabled." },
    { controlName: "mdatp_diskencryption", controlCategory: "Device", score: 6, description: "312 of 418 devices report an encrypted OS volume." },
    { controlName: "defender_edrblockmode", controlCategory: "Device", score: 0, description: "EDR in block mode is off." },
    { controlName: "edge_smartscreen", controlCategory: "Apps", score: 5, description: "SmartScreen is enforced and cannot be bypassed." },
    { controlName: "apps_thirdpartybrowserpolicy", controlCategory: "Apps", score: 0, description: "No extension policy is published." },
    { controlName: "aad_mfa_admins", controlCategory: "Identity", score: 7, description: "Two privileged accounts are still exempt." },
    { controlName: "aad_legacy_auth", controlCategory: "Identity", score: 8, description: "Legacy authentication is blocked." },
    { controlName: "dlp_policy_exists", controlCategory: "Data", score: 0, description: "No DLP policy is published." },
    { controlName: "legacy_retired_control", controlCategory: "Device", score: 0, description: "Retired by Microsoft." },
    // NO PROFILE ANYWHERE. Must render under its raw id and be counted as
    // neither achieved nor a gap — the branch that is easy to get wrong.
    { controlName: "unmapped_preview_control", controlCategory: "Device", score: 0, description: "A preview control the catalogue does not describe." },
  ];

  // Sixty daily readings, ending at the numbers above. The shape is a slow
  // climb with a dip at day 38 (someone turned SmartScreen off for a week),
  // so improved and regressed both have real entries across the window.
  const SS_MAX = 89;
  const SECURE_SCORES = (() => {
    const out = [];
    const latestTotal = SS_LATEST_CONTROLS.reduce((n, c) => n + c.score, 0);
    for (let d = 59; d >= 0; d--) {
      const dip = (d >= 18 && d <= 25) ? 5 : 0;      // the SmartScreen week
      const climb = Math.round((59 - d) * 0.18);      // the slow improvement
      const total = Math.max(0, latestTotal - 11 + climb - dip);
      const scale = latestTotal ? total / latestTotal : 1;
      out.push({
        id: `demo-score-${d}`,
        createdDateTime: ago(d * DAY),
        currentScore: total,
        maxScore: SS_MAX,
        licensedUserCount: 512,
        activeUserCount: 471,
        enabledServices: ["HasExchange", "HasSharePoint", "HasIntune", "HasAADP2", "HasMDATP"],
        averageComparativeScores: [
          { basis: "AllTenants", averageScore: 46.7, deviceScore: 21, deviceScoreMax: 53, identityScore: 11, identityScoreMax: 18, appsScore: 4, appsScoreMax: 9, dataScore: 2, dataScoreMax: 6 },
          { basis: "TotalSeats", averageScore: 52.4, deviceScore: 26, deviceScoreMax: 53, identityScore: 13, identityScoreMax: 18, appsScore: 5, appsScoreMax: 9, dataScore: 3, dataScoreMax: 6 },
        ],
        controlScores: SS_LATEST_CONTROLS.map((c) => {
          if (d === 0) return Object.assign({}, c);
          // SmartScreen is what dipped; everything else scales with the trend.
          if (c.controlName === "edge_smartscreen" && dip) return Object.assign({}, c, { score: 0 });
          return Object.assign({}, c, { score: Math.round(c.score * scale * 10) / 10 });
        }),
      });
    }
    return out.sort((a, b) => Date.parse(b.createdDateTime) - Date.parse(a.createdDateTime)); // newest first, as Graph answers
  })();

  return { G, U, D, P, F, R, ago, MIN, HOUR, DAY,
           SECURE_SCORES, SS_PROFILES,
           GROUPS, USERS, DEVICES, FILTERS, DELETED_GROUP,
           inc, exc, allDevices, allUsers,
           CONFIG_POLICIES, DEVICE_CONFIGS, COMPLIANCE_POLICIES, DEVICE_MANAGEMENT_SETTINGS,
           ADMX_POLICIES, PLATFORM_SCRIPTS, SHELL_SCRIPTS, HEALTH_SCRIPTS, MOBILE_APPS,
           ENROLMENT_CONFIGS, AUTOPILOT_PROFILES, FEATURE_UPDATES, QUALITY_UPDATES, DRIVER_UPDATES,
           IOS_APP_PROTECTION, ANDROID_APP_PROTECTION, WINDOWS_APP_PROTECTION, WIP_POLICIES,
           APP_CONFIGS_DEVICE, APP_CONFIGS_MANAGED, SCOPE_TAGS, DEVICE_CATEGORIES, TERMS,
           NOTIFICATION_TEMPLATES, APP_CATEGORIES, CUSTOM_ATTRIBUTE_SCRIPTS,
           INTENTS, TEMPLATES, ROLE_DEFINITIONS, ROLE_ASSIGNMENTS,
           MAA_POLICIES, MAA_REQUESTS, LAPS_CREDENTIALS, DEFENDER_OVERVIEW, PROTECTION_STATE,
           AUDIT_EVENTS, CONFIG_CATEGORIES, CONFIG_SETTINGS,
           STATUS_OVERVIEW, SETTING_STATE_SUMMARIES, RUN_SUMMARY,
           DEVICE_CONFIG_STATES, DEVICE_COMPLIANCE_STATES };
})();

// ======================================================================
// THE ROUTER — what stands where Graph stood.
//
// Graph.call() hands this the method, the FULL url, and the body, and takes
// back whatever call() would have returned: parsed JSON, a bare string for a
// /$count, null for a 204. A fault comes back as { __demoFault: … } rather
// than as a thrown exception, so graph.js can raise its own GraphError and
// every tool's error handling stays on the path it already knows.
// ======================================================================
const TUNO_DEMO_GRAPH = (() => {
  const T = TUNO_DEMO;

  // A demo that answers instantly reads as fake, and — more usefully — never
  // exercises the progress and throttle UI that a real sweep spends most of
  // its time in. A small delay per call buys both.
  const LATENCY_MS = 45;

  // FAULT, deliberately injected: this surface refuses. Every sweep that
  // reads "all of them" (T02, T04, T05, T09) therefore has to say the answer
  // is PARTIAL — that a zero here is unknown rather than none. Chosen as
  // Windows Information Protection because it is deprecated, because a real
  // tenant genuinely does refuse it, and because no other finding in this
  // fixture depends on it, so injecting it costs nothing else.
  const DENIED = [/mdmWindowsInformationProtectionPolicies/i];

  const fault = (status, code, message) => ({ __demoFault: { status, code, message } });

  // ---------- a small OData $filter evaluator ----------
  //
  // Only as much as the tools actually send: startswith(), eq, ge and le,
  // joined by and/or. GroupUse.resolveGroup THROWS "matches N groups" if a
  // name lookup comes back unnarrowed, so ignoring $filter here would break
  // the group picker in four tools rather than merely widen a result.
  function evalFilter(expr, obj) {
    if (!expr) return true;
    const glue = /\s+or\s+/i.test(expr) && !/\s+and\s+/i.test(expr) ? "or" : "and";
    const clauses = expr.split(/\s+(?:and|or)\s+/i).map((s) => s.trim()).filter(Boolean);
    const test = (c) => {
      let m = /^startswith\(\s*([\w./]+)\s*,\s*'(.*)'\s*\)$/i.exec(c);
      if (m) return String(obj[m[1]] || "").toLowerCase().startsWith(m[2].replace(/''/g, "'").toLowerCase());
      m = /^([\w./]+)\s+(eq|ge|le|ne)\s+(?:'(.*)'|(\S+))$/i.exec(c);
      if (!m) return true;                       // an operator we do not model must not silently exclude
      const field = m[1], op = m[2].toLowerCase(), val = m[3] !== undefined ? m[3].replace(/''/g, "'") : m[4];
      const have = obj[field];
      if (op === "eq") return String(have || "").toLowerCase() === String(val).toLowerCase();
      if (op === "ne") return String(have || "").toLowerCase() !== String(val).toLowerCase();
      const a = Date.parse(have), b = Date.parse(val);
      if (!isFinite(a) || !isFinite(b)) return true;
      return op === "ge" ? a >= b : a <= b;
    };
    return glue === "or" ? clauses.some(test) : clauses.every(test);
  }

  // ---------- shaping a response ----------
  //
  // Internal fields are prefixed with _ and must never reach a tool: they are
  // the fixture's own bookkeeping (a script body that belongs on the detail
  // read, a settings array that belongs on /settings). Assignments come off
  // unless the caller expanded them, because a tool that did not ask for them
  // must not be handed them — that is the difference the N+1 exists to make.
  const strip = (o, { assignments, payloads } = {}) => {
    const out = {};
    for (const k of Object.keys(o)) {
      if (k.startsWith("_")) continue;
      if (k === "assignments" && !assignments) continue;
      if (k === "payloads" && !payloads) continue;
      if (k === "memberCount" || k === "memberOf") continue;   // fixture bookkeeping, not Graph fields
      out[k] = o[k];
    }
    return out;
  };

  const coll = (items) => ({ value: items });

  // ---------- the surface table ----------
  //
  // Path → fixture. Keyed on the path with no base and no query, because the
  // base is checked separately: the same path is legitimately read on both
  // /beta and /v1.0 by different tools.
  const SURFACES = {
    "/deviceManagement/configurationPolicies": () => T.CONFIG_POLICIES,
    "/deviceManagement/deviceConfigurations": () => T.DEVICE_CONFIGS,
    "/deviceManagement/deviceCompliancePolicies": () => T.COMPLIANCE_POLICIES,
    "/deviceManagement/compliancePolicies": () => [],
    "/deviceManagement/groupPolicyConfigurations": () => T.ADMX_POLICIES,
    "/deviceManagement/deviceManagementScripts": () => T.PLATFORM_SCRIPTS,
    "/deviceManagement/deviceShellScripts": () => T.SHELL_SCRIPTS,
    "/deviceManagement/deviceHealthScripts": () => T.HEALTH_SCRIPTS,
    "/deviceManagement/deviceCustomAttributeShellScripts": () => T.CUSTOM_ATTRIBUTE_SCRIPTS,
    "/deviceManagement/deviceEnrollmentConfigurations": () => T.ENROLMENT_CONFIGS,
    "/deviceManagement/windowsAutopilotDeploymentProfiles": () => T.AUTOPILOT_PROFILES,
    "/deviceManagement/windowsFeatureUpdateProfiles": () => T.FEATURE_UPDATES,
    "/deviceManagement/windowsQualityUpdateProfiles": () => T.QUALITY_UPDATES,
    "/deviceManagement/windowsDriverUpdateProfiles": () => T.DRIVER_UPDATES,
    "/deviceManagement/assignmentFilters": () => T.FILTERS,
    "/deviceManagement/roleScopeTags": () => T.SCOPE_TAGS,
    "/deviceManagement/deviceCategories": () => T.DEVICE_CATEGORIES,
    "/deviceManagement/termsAndConditions": () => T.TERMS,
    "/deviceManagement/notificationMessageTemplates": () => T.NOTIFICATION_TEMPLATES,
    "/deviceManagement/intents": () => T.INTENTS,
    "/deviceManagement/templates": () => T.TEMPLATES,
    "/deviceManagement/roleDefinitions": () => T.ROLE_DEFINITIONS,
    "/deviceManagement/roleAssignments": () => T.ROLE_ASSIGNMENTS,
    "/deviceManagement/operationApprovalPolicies": () => T.MAA_POLICIES,
    "/deviceManagement/operationApprovalRequests": () => T.MAA_REQUESTS,
    "/deviceManagement/configurationCategories": () => T.CONFIG_CATEGORIES,
    "/deviceManagement/configurationSettings": () => T.CONFIG_SETTINGS,
    "/deviceAppManagement/mobileApps": () => T.MOBILE_APPS,
    "/deviceAppManagement/mobileAppConfigurations": () => T.APP_CONFIGS_DEVICE,
    "/deviceAppManagement/targetedManagedAppConfigurations": () => T.APP_CONFIGS_MANAGED,
    "/deviceAppManagement/iosManagedAppProtections": () => T.IOS_APP_PROTECTION,
    "/deviceAppManagement/androidManagedAppProtections": () => T.ANDROID_APP_PROTECTION,
    "/deviceAppManagement/windowsManagedAppProtections": () => T.WINDOWS_APP_PROTECTION,
    "/deviceAppManagement/mdmWindowsInformationProtectionPolicies": () => T.WIP_POLICIES,
    "/deviceAppManagement/mobileAppCategories": () => T.APP_CATEGORIES,
  };

  // Every policy in one bag, for the detail reads that address an object by
  // id without saying which surface it came from.
  const allObjects = () => [].concat(
    T.CONFIG_POLICIES, T.DEVICE_CONFIGS, T.COMPLIANCE_POLICIES, T.ADMX_POLICIES,
    T.PLATFORM_SCRIPTS, T.SHELL_SCRIPTS, T.HEALTH_SCRIPTS, T.MOBILE_APPS,
    T.ENROLMENT_CONFIGS, T.AUTOPILOT_PROFILES, T.FEATURE_UPDATES, T.QUALITY_UPDATES,
    T.DRIVER_UPDATES, T.IOS_APP_PROTECTION, T.ANDROID_APP_PROTECTION,
    T.APP_CONFIGS_DEVICE, T.APP_CONFIGS_MANAGED, T.TERMS);
  const byId = (id) => allObjects().find((o) => o.id === id) || null;

  // Transitive membership, walked rather than stored, so a nesting edit in
  // the fixture cannot leave a stale closure behind.
  function groupsOfUser(userId) {
    const u = T.USERS.find((x) => x.id === userId);
    if (!u) return [];
    const seen = new Set(), out = [];
    const walk = (gid) => {
      if (seen.has(gid)) return;
      seen.add(gid);
      const g = T.GROUPS.find((x) => x.id === gid);
      if (!g) return;
      out.push(g);
      (g.memberOf || []).forEach(walk);
    };
    (u.memberOf || []).forEach(walk);
    return out;
  }
  function groupsOfDevice(aadDeviceId) {
    // Device group membership is modelled, not invented: the dynamic Windows
    // 11 group holds the Windows devices, the Mac group holds the Macs, and
    // the flat workstation group holds every managed Windows machine.
    const d = T.DEVICES.find((x) => x.azureADDeviceId === aadDeviceId);
    if (!d) return [];
    const out = [];
    if (d.operatingSystem === "Windows") {
      out.push(T.GROUPS.find((g) => g.id === T.G(1)));
      if (/^10\.0\.2[26]/.test(d.osVersion || "")) out.push(T.GROUPS.find((g) => g.id === T.G(8)));
      if (/^WS-FIN/.test(d.deviceName)) out.push(T.GROUPS.find((g) => g.id === T.G(3)));
    }
    if (d.operatingSystem === "macOS") out.push(T.GROUPS.find((g) => g.id === T.G(11)));
    return out.filter(Boolean);
  }
  function membersOfGroup(gid) {
    const g = T.GROUPS.find((x) => x.id === gid);
    if (!g) return [];
    const direct = T.USERS.filter((u) => (u.memberOf || []).includes(gid));
    const viaChild = T.GROUPS.filter((x) => (x.memberOf || []).includes(gid))
      .flatMap((child) => membersOfGroup(child.id));
    const seen = new Set();
    return direct.concat(viaChild).filter((u) => !seen.has(u.id) && seen.add(u.id));
  }

  return { LATENCY_MS, DENIED, fault, evalFilter, strip, coll,
           SURFACES, allObjects, byId, groupsOfUser, groupsOfDevice, membersOfGroup, T };
})();

// ======================================================================
// DISPATCH. One function, every endpoint the seventeen tools reach for.
//
// Ordered most-specific first, because /managedDevices/{id}/windowsProtectionState
// and /managedDevices/{id} differ only by a suffix and the wrong order would
// serve a device object where a protection state was asked for.
// ======================================================================
TUNO_DEMO_GRAPH.answer = function answer(method, url, body) {
  const M = TUNO_DEMO_GRAPH, T = M.T;
  let u;
  try { u = new URL(url); } catch { return M.fault(400, "badRequest", `Not a usable URL: ${url}`); }

  const path = u.pathname.replace(/^\/(beta|v1\.0)/, "");
  const qs = u.searchParams;
  const expand = String(qs.get("$expand") || "");
  const filter = String(qs.get("$filter") || "");
  const wantsAssignments = /\bassignments\b/.test(expand);
  const wantsPayloads = /\bpayloads\b/.test(expand);
  const shaped = (arr) => M.coll(arr.map((o) => M.strip(o, { assignments: wantsAssignments, payloads: wantsPayloads })));

  // The injected refusal. Checked before anything else so it cannot be
  // routed around by a caller that happens to address the surface a
  // different way.
  if (M.DENIED.some((re) => re.test(path))) {
    return M.fault(403, "Authorization_RequestDenied",
      "Authorization_RequestDenied: Insufficient privileges to complete the operation. (Demo tenant — this surface refuses on purpose, so a sweep has to report the answer as partial.)");
  }

  // ---------- writes ----------
  //
  // Simulated, and shaped like the thing that would have been created, since
  // the caller reads the id back and sometimes assigns to it. Nothing leaves
  // the browser; the screens say so.
  if (method === "POST" && /\/(assign|createRemediation)$/.test(path)) return null;
  if (method === "POST" && !/\$batch|getByIds/.test(path)) {
    const made = Object.assign({}, body || {}, {
      id: `demo-created-${Math.random().toString(16).slice(2, 10)}`,
      createdDateTime: new Date().toISOString(),
      lastModifiedDateTime: new Date().toISOString(),
    });
    return made;
  }
  if (method === "PATCH") return Object.assign({}, body || {}, { lastModifiedDateTime: new Date().toISOString() });
  if (method === "DELETE") return null;                       // 204, as Graph answers

  // ---------- $batch ----------
  if (method === "POST" && /\$batch$/.test(path)) {
    const reqs = (body && body.requests) || [];
    return {
      responses: reqs.map((r) => {
        const sub = answer(r.method || "GET", `https://graph.microsoft.com${u.pathname.startsWith("/beta") ? "/beta" : "/v1.0"}${r.url}`, r.body);
        if (sub && sub.__demoFault) {
          return { id: String(r.id), status: sub.__demoFault.status,
                   body: { error: { code: sub.__demoFault.code, message: sub.__demoFault.message } } };
        }
        return { id: String(r.id), status: 200, body: sub };
      }),
    };
  }

  // ---------- getByIds ----------
  //
  // The single most productive route in the fixture: an id it does not know
  // is simply ABSENT from the answer, exactly as Graph treats a deleted
  // object. That omission is what every dangling-reference finding rests on,
  // so it must not be softened into an empty-named placeholder.
  if (method === "POST" && /getByIds$/.test(path)) {
    const ids = ((body && body.ids) || []).map(String);
    const out = [];
    ids.forEach((id) => {
      const g = T.GROUPS.find((x) => x.id === id);
      if (g) return out.push({ id: g.id, displayName: g.displayName, "@odata.type": "#microsoft.graph.group" });
      const usr = T.USERS.find((x) => x.id === id);
      if (usr) return out.push({ id: usr.id, displayName: usr.displayName, userPrincipalName: usr.userPrincipalName, "@odata.type": "#microsoft.graph.user" });
    });
    return M.coll(out);
  }

  // ---------- tenant ----------
  if (path === "/organization") return M.coll([{ id: "d0e1f2a3-4b5c-6d7e-8f90-abcdef012345", displayName: "Contoso B.V. (demo)" }]);
  if (path === "/deviceManagement/settings") return T.DEVICE_MANAGEMENT_SETTINGS;               // single object — no `value`

  // ---------- Microsoft Secure Score (T21) ----------
  //
  // $top is honoured because T21 asks for 100 and the fixture holds sixty:
  // a demo that silently returned more than was asked for would hide a
  // paging bug rather than expose one. The catalogue answers identically on
  // v1.0 and beta — the beta fill-in pass then finds nothing to fill, which
  // is the correct demo outcome: the tenant's controls are all titled.
  if (path === "/security/secureScores") {
    const top = parseInt(qs.get("$top"), 10);
    const rows = T.SECURE_SCORES;
    return M.coll(Number.isFinite(top) ? rows.slice(0, top) : rows);
  }
  if (path === "/security/secureScoreControlProfiles") return M.coll(T.SS_PROFILES);

  if (path === "/deviceManagement/deviceProtectionOverview") return T.DEFENDER_OVERVIEW;        // single object

  // ---------- managed devices ----------
  let m = /^\/deviceManagement\/managedDevices\/([^/]+)\/windowsProtectionState$/.exec(path);
  if (m) {
    const st = T.PROTECTION_STATE[m[1]];
    // No entry is a 404, not an empty object: "did not report" and "reported
    // nothing wrong" are different answers and T15 counts them separately.
    return st ? Object.assign({ id: `${m[1]}_wps` }, st)
              : M.fault(404, "ResourceNotFound", "No Windows protection state has been reported for this device.");
  }
  m = /^\/deviceManagement\/managedDevices\/([^/]+)\/deviceConfigurationStates$/.exec(path);
  if (m) return M.coll(T.DEVICE_CONFIG_STATES[m[1]] || []);
  m = /^\/deviceManagement\/managedDevices\/([^/]+)\/deviceCompliancePolicyStates$/.exec(path);
  if (m) return M.coll(T.DEVICE_COMPLIANCE_STATES[m[1]] || []);
  m = /^\/deviceManagement\/managedDevices\/([^/]+)$/.exec(path);
  if (m) {
    const d = T.DEVICES.find((x) => x.id === m[1]);
    return d || M.fault(404, "ResourceNotFound", "The device was not found in this tenant.");
  }
  if (path === "/deviceManagement/managedDevices") {
    return M.coll(T.DEVICES.filter((d) => M.evalFilter(filter, d)));
  }

  // ---------- audit ----------
  if (path === "/deviceManagement/auditEvents") {
    const rows = T.AUDIT_EVENTS.filter((e) => M.evalFilter(filter, e))
      .sort((a, b) => Date.parse(b.activityDateTime) - Date.parse(a.activityDateTime));
    return M.coll(rows);
  }

  // ---------- LAPS ----------
  if (path === "/directory/deviceLocalCredentials") return M.coll(T.LAPS_CREDENTIALS);

  // ---------- per-object detail reads ----------
  m = /^\/deviceManagement\/configurationPolicies\/([^/]+)\/settings$/.exec(path);
  if (m) {
    const p = T.CONFIG_POLICIES.find((x) => x.id === m[1]);
    return p ? M.coll(p._settings || []) : M.fault(404, "ResourceNotFound", "Policy not found.");
  }
  m = /^\/deviceManagement\/groupPolicyConfigurations\/([^/]+)\/definitionValues$/.exec(path);
  if (m) {
    const p = T.ADMX_POLICIES.find((x) => x.id === m[1]);
    return p ? M.coll(p._definitionValues || []) : M.fault(404, "ResourceNotFound", "Policy not found.");
  }
  m = /^\/deviceManagement\/intents\/([^/]+)\/settings$/.exec(path);
  if (m) return M.coll([]);

  m = /^\/deviceManagement\/([A-Za-z]+)\/([^/]+)\/deviceStatusOverview$/.exec(path);
  if (m) {
    const s = T.STATUS_OVERVIEW[m[2]];
    return s ? Object.assign({ id: `${m[2]}_overview` }, s)
             : M.fault(404, "ResourceNotFound", "No status has been reported for this policy.");
  }
  m = /^\/deviceManagement\/([A-Za-z]+)\/([^/]+)\/deviceSettingStateSummaries$/.exec(path);
  if (m) return M.coll(T.SETTING_STATE_SUMMARIES[m[2]] || []);
  m = /^\/deviceManagement\/([A-Za-z]+)\/([^/]+)\/runSummary$/.exec(path);
  if (m) {
    const s = T.RUN_SUMMARY[m[2]];
    return s ? Object.assign({ id: `${m[2]}_run` }, s)
             : M.fault(404, "ResourceNotFound", "No run summary for this script.");
  }

  // Assignments read on their own. Must return EXACTLY what the $expand
  // returned, or T11 reports every policy as drifted before it writes a thing.
  m = /^\/device(?:Management|AppManagement)\/[A-Za-z]+\/([^/]+)\/assignments$/.exec(path);
  if (m) {
    const o = M.byId(m[1]);
    return o ? M.coll(o.assignments || []) : M.fault(404, "ResourceNotFound", "Object not found.");
  }

  m = /^\/deviceManagement\/roleAssignments\/([^/]+)$/.exec(path);
  if (m) {
    const ra = T.ROLE_ASSIGNMENTS.find((x) => x.id === m[1]);
    return ra || M.fault(404, "ResourceNotFound", "Role assignment not found.");
  }
  m = /^\/deviceManagement\/roleDefinitions\/([^/]+)$/.exec(path);
  if (m) {
    const rd = T.ROLE_DEFINITIONS.find((x) => x.id === m[1]);
    return rd || M.fault(404, "ResourceNotFound", "Role definition not found.");
  }
  m = /^\/deviceManagement\/assignmentFilters\/([^/]+)$/.exec(path);
  if (m) {
    const f = T.FILTERS.find((x) => x.id === m[1]);
    return f ? M.strip(f, { payloads: wantsPayloads }) : M.fault(404, "ResourceNotFound", "Filter not found.");
  }

  // ---------- groups ----------
  m = /^\/groups\/([^/]+)\/members\/\$count$/.exec(path);
  if (m) {
    const g = T.GROUPS.find((x) => x.id === m[1]);
    // Text, not JSON — the caller parseInt()s whatever comes back.
    return g ? String(g.memberCount) : M.fault(404, "ResourceNotFound", "Group not found.");
  }
  m = /^\/groups\/([^/]+)\/transitiveMembers\/microsoft\.graph\.group$/.exec(path);
  if (m) return M.coll(T.GROUPS.filter((g) => (g.memberOf || []).includes(m[1])).map((g) => ({ id: g.id, displayName: g.displayName })));
  m = /^\/groups\/([^/]+)\/transitiveMembers$/.exec(path);
  if (m) {
    const g = T.GROUPS.find((x) => x.id === m[1]);
    if (!g) return M.fault(404, "ResourceNotFound", "Group not found.");
    // memberCount is the fixture's stated size; the member objects are the
    // ones we actually model. The emptiness peek only looks at length, and an
    // empty group must come back empty — that is a finding in three tools.
    const people = M.membersOfGroup(m[1]);
    return M.coll(g.memberCount === 0 ? [] : people.map((p) => ({
      id: p.id, displayName: p.displayName, userPrincipalName: p.userPrincipalName, "@odata.type": "#microsoft.graph.user" })));
  }
  m = /^\/groups\/([^/]+)\/transitiveMemberOf$/.exec(path);
  if (m) {
    const g = T.GROUPS.find((x) => x.id === m[1]);
    if (!g) return M.fault(404, "ResourceNotFound", "Group not found.");
    return M.coll((g.memberOf || []).map((pid) => {
      const p = T.GROUPS.find((x) => x.id === pid);
      return p ? { id: p.id, displayName: p.displayName, "@odata.type": "#microsoft.graph.group" } : null;
    }).filter(Boolean));
  }
  m = /^\/groups\/([^/]+)$/.exec(path);
  if (m && m[1] !== "") {
    const g = T.GROUPS.find((x) => x.id === m[1]);
    return g ? M.strip(g) : M.fault(404, "ResourceNotFound", "Group not found.");
  }
  if (path === "/groups") {
    const search = String(u.search.match(/\$search=([^&]*)/) ? decodeURIComponent(RegExp.$1) : "").replace(/^"|"$/g, "");
    let rows = T.GROUPS;
    if (filter) rows = rows.filter((g) => M.evalFilter(filter, g));
    else if (search) {
      const term = search.replace(/^displayName:/i, "").toLowerCase();
      rows = rows.filter((g) => g.displayName.toLowerCase().includes(term));
    }
    const top = parseInt(qs.get("$top"), 10);
    return M.coll(rows.slice(0, isFinite(top) ? top : rows.length).map((g) => M.strip(g)));
  }

  // ---------- users ----------
  m = /^\/users\/([^/]+)\/transitiveMemberOf$/.exec(path);
  if (m) return M.coll(M.groupsOfUser(m[1]).map((g) => ({ id: g.id, displayName: g.displayName, membershipRule: g.membershipRule, "@odata.type": "#microsoft.graph.group" })));
  m = /^\/users\/([^/]+)\/memberOf$/.exec(path);
  if (m) {
    const usr = T.USERS.find((x) => x.id === m[1]);
    return M.coll(((usr && usr.memberOf) || []).map((gid) => {
      const g = T.GROUPS.find((x) => x.id === gid);
      return g ? { id: g.id, displayName: g.displayName, membershipRule: g.membershipRule, "@odata.type": "#microsoft.graph.group" } : null;
    }).filter(Boolean));
  }
  m = /^\/users\/([^/]+)$/.exec(path);
  if (m) {
    const usr = T.USERS.find((x) => x.id === m[1] || x.userPrincipalName.toLowerCase() === String(m[1]).toLowerCase());
    return usr ? { id: usr.id, displayName: usr.displayName, userPrincipalName: usr.userPrincipalName, accountEnabled: usr.accountEnabled }
               : M.fault(404, "ResourceNotFound", "User not found.");
  }
  if (path === "/users") {
    const rows = T.USERS.filter((usr) => M.evalFilter(filter, usr));
    const top = parseInt(qs.get("$top"), 10);
    return M.coll(rows.slice(0, isFinite(top) ? top : rows.length)
      .map((usr) => ({ id: usr.id, displayName: usr.displayName, userPrincipalName: usr.userPrincipalName, accountEnabled: usr.accountEnabled })));
  }

  // ---------- devices (Entra, addressed by the alternate key) ----------
  m = /^\/devices\(deviceId='([^']+)'\)\/(transitiveMemberOf|memberOf)$/.exec(path);
  if (m) return M.coll(M.groupsOfDevice(m[1]).map((g) => ({ id: g.id, displayName: g.displayName, membershipRule: g.membershipRule, "@odata.type": "#microsoft.graph.group" })));
  if (path === "/devices") {
    const rows = T.DEVICES.filter((d) => M.evalFilter(filter, Object.assign({}, d, { displayName: d.deviceName })));
    const top = parseInt(qs.get("$top"), 10);
    return M.coll(rows.slice(0, isFinite(top) ? top : rows.length)
      .map((d) => ({ id: d.azureADDeviceId || d.id, displayName: d.deviceName, operatingSystem: d.operatingSystem })));
  }

  // ---------- the plain surfaces ----------
  if (M.SURFACES[path]) {
    let rows = M.SURFACES[path]();
    if (filter) rows = rows.filter((o) => M.evalFilter(filter, o));
    return shaped(rows);
  }

  // A single object off a known surface — the N+1 detail read. This is where
  // a platform script gets its body, and where one of them deliberately does
  // not have one.
  m = /^(\/device(?:Management|AppManagement)\/[A-Za-z]+)\/([^/]+)$/.exec(path);
  if (m && M.SURFACES[m[1]]) {
    const o = M.SURFACES[m[1]]().find((x) => x.id === m[2]);
    if (!o) return M.fault(404, "ResourceNotFound", "Object not found.");
    const out = M.strip(o, { assignments: wantsAssignments, payloads: wantsPayloads });
    if ("_scriptContent" in o) out.scriptContent = o._scriptContent;
    return out;
  }

  // An endpoint the fixture does not model. Answering with an empty
  // collection would be a lie that reads as a healthy tenant, so it refuses
  // loudly instead — and that refusal is a bug report, not a finding.
  return M.fault(404, "demoUnrouted",
    `The demo tenant has no answer for ${method} ${path}. This is a gap in js/demo.js, not a finding about the tenant.`);
};

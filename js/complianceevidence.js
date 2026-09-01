// ======================================================================
// T26 — 📋 Compliance evidence (BETA, R37). What Mihai asked for off
// Ugur Koc's IntuneDocumentation (Elastic 2.0 — the FEATURE is
// reimplemented from what the app demonstrably does, checked against its
// published coverage, sharing none of its code or its tables; the same
// arrangement as T05's coverage list): the technical EVIDENCE an auditor
// asks for, read from the tenant's own policies and laid against the
// framework controls it speaks to.
//
// TWO HALVES:
//   * CAPABILITIES — platform controls a tenant can demonstrably enforce
//     through Intune (disk encryption, firewall, malware protection,
//     device lock, update discipline …), each detected by SIGNALS: a
//     settings-catalog definition id with the value that means enforced,
//     or a typed property on a device configuration / compliance policy.
//     Every hit is an EVIDENCE ROW naming the policy, the setting, the
//     observed value and the reach.
//   * FRAMEWORKS — ISO/IEC 27001:2022 Annex A (clause 8 selections),
//     NIST SP 800-53 r5, NIST CSF 2.0 (Mihai's pick; more can follow as
//     queue items). Control numbers are the frameworks' own; every
//     summary sentence is WRITTEN HERE for this device-management
//     mapping, because the standards' texts are licensed and an original
//     description is the only honest thing to ship.
//
// THE HONESTY RULES, and they are the point of the tool:
//   * EVIDENCE IN A POLICY REACHING NOBODY IS NOT ENFORCEMENT — reach is
//     judged by construction (EndpointSec.reachOf, the one reader): such
//     a capability reads "configured — reaches nobody", never enforced.
//     One step past the original, which asks only assigned-or-not.
//   * A COMPLIANCE POLICY MARKS, IT DOES NOT ENFORCE — evidence sourced
//     from a compliance policy carries that caveat on the row: the block
//     lives in Conditional Access, which TUNO does not read (ENCA does).
//   * ABSENCE OF EVIDENCE IS NOT A FINDING OF ABSENCE — no matching
//     policy means Intune shows nothing, not that the requirement is
//     unmet through other means; and a platform the tenant does not
//     manage cannot produce evidence, so its capabilities are set aside
//     as "not managed here" rather than dragging controls to partial.
//   * NO SINGLE SCORE, and a DISCLAIMER ON EVERY EXPORT: this is
//     technical evidence, not a certification, and it does not replace
//     an audit.
//
// THE READ is the shared policy cache (T05's collect, keepRaw) when the
// session holds one — the warm-start rule — or a fresh collect at the
// click. Reads only, no new scope.
// ======================================================================
const CompEv = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();

  // ---- value expectations ------------------------------------------------
  // eq: exact (after choice-tail peeling); oneOf; truthy boolean; nonEmpty.
  const EQ = (v) => ({ kind: "eq", v: lc(String(v)) });
  const ONE = (...vs) => ({ kind: "one", vs: vs.map((x) => lc(String(x))) });
  const TRUE = () => ({ kind: "true" });
  const NONEMPTY = () => ({ kind: "nonempty" });
  function meets(value, exp) {
    if (!exp) return false;
    const s = lc(String(value ?? ""));
    switch (exp.kind) {
      case "eq": return s === exp.v;
      case "one": return exp.vs.includes(s);
      case "true": return value === true || s === "true";
      case "nonempty": return typeof value === "string" && value.trim().length > 0;
      default: return false;
    }
  }

  // ---- signals -----------------------------------------------------------
  // cat:  settings-catalog definition id (choice tails peeled by the walk)
  // prop: typed policy property — odata types (short, lowercased) + path
  const cat = (defId, enforced, disabled) => ({ kind: "cat", defId: lc(defId), enforced, disabled });
  const prop = (types, path, enforced, disabled) => ({ kind: "prop", types: types.map(lc), path, enforced, disabled });

  const DEFENDER = "device_vendor_msft_policy_config_defender_";

  // ---- the capability table ---------------------------------------------
  // Curated HERE, from what TUNO already knows how to read (T15/T16/T20's
  // surfaces) — not copied. Signals are Microsoft's own identifiers, which
  // are facts about the catalog. ~evidence, not exhaustiveness: a capability
  // with no solid identifier stays out rather than guessed in.
  const CAPABILITIES = [
    // ---------------- Windows ----------------
    { id: "win-disk-encryption", platform: "Windows", name: "Disk encryption (BitLocker)",
      why: "Data on a lost or stolen machine stays unreadable.",
      signals: [
        cat("device_vendor_msft_bitlocker_requiredeviceencryption", EQ(1), EQ(0)),
        prop(["windows10endpointprotectionconfiguration"], "bitLockerEncryptDevice", TRUE()),
        prop(["windows10compliancepolicy"], "bitLockerEnabled", TRUE()),
      ] },
    { id: "win-realtime-antimalware", platform: "Windows", name: "Real-time malware protection",
      why: "Defender inspects files and processes as they run, not on a schedule.",
      signals: [
        cat(DEFENDER + "allowrealtimemonitoring", EQ(1), EQ(0)),
        prop(["windows10generalconfiguration"], "defenderRequireRealTimeMonitoring", TRUE()),
        prop(["windows10compliancepolicy"], "defenderEnabled", TRUE()),
      ] },
    { id: "win-firewall", platform: "Windows", name: "Host firewall",
      why: "Inbound traffic is filtered on the device itself, wherever it sits.",
      signals: [
        cat("vendor_msft_firewall_mdmstore_domainprofile_enablefirewall", ONE(1, "true"), ONE(0, "false")),
        cat("vendor_msft_firewall_mdmstore_privateprofile_enablefirewall", ONE(1, "true"), ONE(0, "false")),
        cat("vendor_msft_firewall_mdmstore_publicprofile_enablefirewall", ONE(1, "true"), ONE(0, "false")),
        prop(["windows10endpointprotectionconfiguration"], "firewallProfileDomain.firewallEnabled", EQ("allowed"), EQ("blocked")),
        prop(["windows10compliancepolicy"], "activeFirewallRequired", TRUE()),
      ] },
    { id: "win-asr-any-block", platform: "Windows", name: "Attack surface reduction — at least one rule blocking",
      why: "ASR rules in block mode stop the standard malware entry paths; audit mode only watches them.",
      // matched by definition-id PREFIX — every per-rule child sits under the
      // ASR parent; a "block" tail on any of them is the evidence
      signals: [{ kind: "catPrefix", defId: DEFENDER + "attacksurfacereductionrules_", enforced: EQ("block") }] },
    { id: "win-device-lock", platform: "Windows", name: "Device lock (password required)",
      why: "An unattended machine is not an open session.",
      signals: [
        prop(["windows10compliancepolicy"], "passwordRequired", TRUE()),
        cat("device_vendor_msft_policy_config_devicelock_devicepasswordenabled", EQ(0) /* 0 = enabled in this CSP */, EQ(1)),
      ] },
    { id: "win-auto-updates", platform: "Windows", name: "Automatic OS updates",
      why: "Patches arrive without waiting for a person to say yes.",
      signals: [
        cat("device_vendor_msft_policy_config_update_allowautoupdate", ONE(0, 1, 2, 3, 4), EQ(5)),
        prop(["windowsupdateforbusinessconfiguration"], "automaticUpdateMode", ONE("autoInstallAtMaintenanceTime", "autoInstallAndRebootAtMaintenanceTime", "autoInstallAndRebootAtScheduledTime", "autoInstallAndRebootWithoutEndUserControl")),
      ] },
    { id: "win-secure-boot", platform: "Windows", name: "Secure Boot required",
      why: "The boot chain is verified before the OS loads.",
      signals: [prop(["windows10compliancepolicy"], "secureBootEnabled", TRUE())] },
    { id: "win-min-os", platform: "Windows", name: "Minimum OS version",
      why: "Machines below the floor are named instead of quietly aging.",
      signals: [prop(["windows10compliancepolicy"], "osMinimumVersion", NONEMPTY())] },
    // ---------------- macOS ----------------
    { id: "mac-disk-encryption", platform: "macOS", name: "Disk encryption (FileVault)",
      why: "Data on a lost or stolen Mac stays unreadable.",
      signals: [
        prop(["macosendpointprotectionconfiguration"], "fileVaultEnabled", TRUE()),
        prop(["macoscompliancepolicy"], "storageRequireEncryption", TRUE()),
      ] },
    { id: "mac-firewall", platform: "macOS", name: "Application firewall",
      why: "Inbound connections are filtered on the Mac itself.",
      signals: [
        prop(["macosendpointprotectionconfiguration"], "firewallEnabled", TRUE()),
        prop(["macoscompliancepolicy"], "firewallEnabled", TRUE()),
      ] },
    { id: "mac-device-lock", platform: "macOS", name: "Device lock (password required)",
      why: "An unattended Mac is not an open session.",
      signals: [prop(["macoscompliancepolicy"], "passwordRequired", TRUE())] },
    { id: "mac-gatekeeper", platform: "macOS", name: "Gatekeeper app source control",
      why: "Only App Store or identified-developer software runs.",
      signals: [prop(["macosendpointprotectionconfiguration", "macosgeneraldeviceconfiguration"], "gatekeeperAllowedAppSource", ONE("macAppStore", "macAppStoreAndIdentifiedDevelopers"), ONE("anywhere"))] },
    { id: "mac-sip", platform: "macOS", name: "System Integrity Protection required",
      why: "The OS protects its own files even from root.",
      signals: [prop(["macoscompliancepolicy"], "systemIntegrityProtectionEnabled", TRUE())] },
    { id: "mac-min-os", platform: "macOS", name: "Minimum OS version",
      why: "Macs below the floor are named instead of quietly aging.",
      signals: [prop(["macoscompliancepolicy"], "osMinimumVersion", NONEMPTY())] },
    // ---------------- iOS ----------------
    { id: "ios-passcode", platform: "iOS/iPadOS", name: "Passcode required",
      why: "The device does not unlock for whoever holds it.",
      signals: [
        prop(["ioscompliancepolicy"], "passcodeRequired", TRUE()),
        prop(["iosgeneraldeviceconfiguration"], "passcodeRequired", TRUE()),
      ] },
    { id: "ios-jailbreak", platform: "iOS/iPadOS", name: "Jailbroken devices blocked",
      why: "A device with its protections removed is marked noncompliant.",
      signals: [prop(["ioscompliancepolicy"], "securityBlockJailbrokenDevices", TRUE())] },
    { id: "ios-min-os", platform: "iOS/iPadOS", name: "Minimum OS version",
      why: "Old iOS versions are named instead of quietly aging.",
      signals: [prop(["ioscompliancepolicy"], "osMinimumVersion", NONEMPTY())] },
    // ---------------- Android ----------------
    { id: "and-encryption", platform: "Android", name: "Storage encryption required",
      why: "Data on the device stays unreadable without the credential.",
      signals: [prop(["androidcompliancepolicy", "androidworkprofilecompliancepolicy", "androiddeviceownercompliancepolicy"], "storageRequireEncryption", TRUE())] },
    { id: "and-device-lock", platform: "Android", name: "Device lock (password required)",
      why: "An unattended phone is not an open session.",
      signals: [prop(["androidcompliancepolicy", "androidworkprofilecompliancepolicy", "androiddeviceownercompliancepolicy"], "passwordRequired", TRUE())] },
    { id: "and-integrity", platform: "Android", name: "Play Integrity / device attestation",
      why: "A rooted or tampered device is marked noncompliant.",
      signals: [prop(["androidcompliancepolicy", "androidworkprofilecompliancepolicy", "androiddeviceownercompliancepolicy"], "securityRequireSafetyNetAttestationBasicIntegrity", TRUE())] },
    { id: "and-min-os", platform: "Android", name: "Minimum OS version",
      why: "Old Android versions are named instead of quietly aging.",
      signals: [prop(["androidcompliancepolicy", "androidworkprofilecompliancepolicy", "androiddeviceownercompliancepolicy"], "osMinimumVersion", NONEMPTY())] },
  ];

  // ---- the frameworks ----------------------------------------------------
  // Control ids are the frameworks' own numbering (a fact); every summary
  // sentence is original, written for this device-management mapping.
  const FRAMEWORKS = [
    { id: "iso27001", name: "ISO/IEC 27001", version: "2022, Annex A (clause 8 selections)",
      note: "Device-management evidence for selected technological controls, referenced by number with summaries written here. Organizational, people and physical controls are outside what an Intune tenant can show.",
      controls: {
        "8.1": "User endpoint devices — managed endpoints carry enforced protections",
        "8.5": "Secure authentication — a device asks who you are before it opens",
        "8.7": "Protection against malware — antimalware runs and stays current on endpoints",
        "8.8": "Technical vulnerability management — updates arrive and version floors are enforced",
        "8.9": "Configuration management — secure device configurations are defined and enforced",
        "8.19": "Software installation control — software comes only from approved sources",
        "8.20": "Network security — device network traffic is filtered at the host",
        "8.24": "Use of cryptography — stored information is protected cryptographically",
      },
      map: {
        "win-disk-encryption": ["8.1", "8.24"], "mac-disk-encryption": ["8.1", "8.24"], "and-encryption": ["8.1", "8.24"],
        "win-realtime-antimalware": ["8.7"], "win-asr-any-block": ["8.7"],
        "win-firewall": ["8.20"], "mac-firewall": ["8.20"],
        "win-device-lock": ["8.5"], "mac-device-lock": ["8.5"], "ios-passcode": ["8.5"], "and-device-lock": ["8.5"],
        "win-auto-updates": ["8.8"], "win-min-os": ["8.8"], "mac-min-os": ["8.8"], "ios-min-os": ["8.8"], "and-min-os": ["8.8"],
        "win-secure-boot": ["8.9"], "mac-sip": ["8.9"], "ios-jailbreak": ["8.1", "8.9"], "and-integrity": ["8.1", "8.9"],
        "mac-gatekeeper": ["8.19"],
      } },
    { id: "nist80053", name: "NIST SP 800-53", version: "Revision 5",
      note: "Selected system-level controls a device-management tenant can evidence. Summaries written here.",
      controls: {
        "SC-28": "Protection of information at rest — stored data is encrypted",
        "SC-7": "Boundary protection — host-level traffic filtering",
        "SI-3": "Malicious code protection — antimalware enforced and active",
        "SI-2": "Flaw remediation — updates applied, version floors held",
        "AC-11": "Device lock — sessions lock and require re-authentication",
        "CM-6": "Configuration settings — secure baselines enforced on devices",
        "CM-7": "Least functionality — software restricted to approved sources",
        "SI-7": "Software and information integrity — boot and OS integrity verified",
      },
      map: {
        "win-disk-encryption": ["SC-28"], "mac-disk-encryption": ["SC-28"], "and-encryption": ["SC-28"],
        "win-firewall": ["SC-7"], "mac-firewall": ["SC-7"],
        "win-realtime-antimalware": ["SI-3"], "win-asr-any-block": ["SI-3"],
        "win-auto-updates": ["SI-2"], "win-min-os": ["SI-2"], "mac-min-os": ["SI-2"], "ios-min-os": ["SI-2"], "and-min-os": ["SI-2"],
        "win-device-lock": ["AC-11"], "mac-device-lock": ["AC-11"], "ios-passcode": ["AC-11"], "and-device-lock": ["AC-11"],
        "win-secure-boot": ["SI-7", "CM-6"], "mac-sip": ["SI-7", "CM-6"], "ios-jailbreak": ["SI-7"], "and-integrity": ["SI-7"],
        "mac-gatekeeper": ["CM-7"],
      } },
    { id: "nistcsf", name: "NIST CSF", version: "2.0",
      note: "Protect-function subcategories a device-management tenant can evidence. Summaries written here.",
      controls: {
        "PR.DS-01": "Data-at-rest protection — stored data on endpoints is encrypted",
        "PR.IR-01": "Network protection — host traffic is filtered",
        "PR.PS-01": "Platform hardening — configuration baselines are enforced",
        "PR.PS-02": "Software maintained — updates arrive and floors are held",
        "PR.PS-05": "Unauthorized software prevented — installation sources restricted",
        "PR.AA-03": "Users and devices authenticated — device unlock requires a credential",
      },
      map: {
        "win-disk-encryption": ["PR.DS-01"], "mac-disk-encryption": ["PR.DS-01"], "and-encryption": ["PR.DS-01"],
        "win-firewall": ["PR.IR-01"], "mac-firewall": ["PR.IR-01"],
        "win-realtime-antimalware": ["PR.PS-01"], "win-asr-any-block": ["PR.PS-01"],
        "win-secure-boot": ["PR.PS-01"], "mac-sip": ["PR.PS-01"], "ios-jailbreak": ["PR.PS-01"], "and-integrity": ["PR.PS-01"],
        "win-auto-updates": ["PR.PS-02"], "win-min-os": ["PR.PS-02"], "mac-min-os": ["PR.PS-02"], "ios-min-os": ["PR.PS-02"], "and-min-os": ["PR.PS-02"],
        "mac-gatekeeper": ["PR.PS-05"],
        "win-device-lock": ["PR.AA-03"], "mac-device-lock": ["PR.AA-03"], "ios-passcode": ["PR.AA-03"], "and-device-lock": ["PR.AA-03"],
      } },
  ];

  const DISCLAIMER = "Technical evidence read from the Intune tenant's configuration. It is not a compliance certification and does not replace an audit. Absence of evidence means no matching Intune policy was found — not that the requirement is unmet through other means.";

  // ---- reading the evidence out of the cached collect --------------------
  // A raw settings-catalog item carries its settings under __detail (T05's
  // detail read); typed device configurations and compliance policies carry
  // their properties on the object itself. Reach is judged by construction.
  function catalogValuesOf(rawItem) {
    const out = [];
    const visit = (inst) => {
      if (!inst || typeof inst !== "object") return;
      const id = lc(inst.settingDefinitionId || "");
      const rec = (v) => { if (id && v !== undefined && v !== null && typeof v !== "object") out.push({ defId: id, value: v }); };
      if (inst.simpleSettingValue) rec(inst.simpleSettingValue.value);
      (inst.simpleSettingCollectionValue || []).forEach((v) => rec(v && v.value));
      if (inst.choiceSettingValue) { rec(inst.choiceSettingValue.value); (inst.choiceSettingValue.children || []).forEach(visit); }
      (inst.choiceSettingCollectionValue || []).forEach((v) => { if (v) rec(v.value); ((v && v.children) || []).forEach(visit); });
      if (inst.groupSettingValue) (inst.groupSettingValue.children || []).forEach(visit);
      (inst.groupSettingCollectionValue || []).forEach((g) => ((g && g.children) || []).forEach(visit));
    };
    for (const row of rawItem.__detail || []) visit(row && row.settingInstance);
    return out;
  }
  const peel = (defId, v) => {
    const s = lc(String(v ?? ""));
    return s.startsWith(defId + "_") ? s.slice(defId.length + 1) : v;
  };
  function pathValue(obj, path) {
    let cur = obj;
    for (const seg of String(path).split(".")) {
      if (!cur || typeof cur !== "object") return undefined;
      cur = cur[seg];
    }
    return cur;
  }
  const typeOf = (raw) => lc(String(raw["@odata.type"] || "").replace(/^#?microsoft\.graph\./, ""));
  const isCompliance = (raw) => /compliancepolicy$/.test(typeOf(raw));

  // res: the collect result (keepRaw). Sections read: settingsCatalog,
  // deviceConfigurations, compliance — the cache's own set.
  function assess(res) {
    const secs = {};
    for (const s of (res && res.sections) || []) secs[s.id] = s;
    const rawsOf = (id) => (secs[id] && secs[id].raw) || [];
    const catalog = rawsOf("settingsCatalog");
    const typed = rawsOf("deviceConfigurations").concat(rawsOf("compliance"));

    // platforms the tenant actually manages — a platform with no policy at
    // all cannot produce evidence and is set aside, not counted against
    const managed = new Set();
    for (const s of (res && res.sections) || []) for (const it of s.items || []) (it.platforms || []).forEach((p) => managed.add(p));

    const results = [];
    for (const cap of CAPABILITIES) {
      const evidence = [];
      for (const sig of cap.signals) {
        if (sig.kind === "cat" || sig.kind === "catPrefix") {
          for (const raw of catalog) {
            for (const cv of catalogValuesOf(raw)) {
              const hit = sig.kind === "cat" ? cv.defId === sig.defId : cv.defId.startsWith(sig.defId);
              if (!hit) continue;
              const v = peel(cv.defId, cv.value);
              const verdict = meets(v, sig.enforced) ? "enforced" : meets(v, sig.disabled) ? "disabled" : null;
              if (verdict) evidence.push({ policy: raw.name || raw.id, setting: cv.defId, value: String(v),
                verdict, reaches: EndpointSec.reachOf(raw.assignments).kind === "reaches", compliancePolicy: false });
            }
          }
        } else {
          for (const raw of typed) {
            if (!sig.types.includes(typeOf(raw))) continue;
            const v = pathValue(raw, sig.path);
            if (v === undefined || v === null) continue;
            const verdict = meets(v, sig.enforced) ? "enforced" : meets(v, sig.disabled) ? "disabled" : null;
            if (verdict) evidence.push({ policy: raw.displayName || raw.name || raw.id, setting: `${typeOf(raw)}.${sig.path}`, value: String(v),
              verdict, reaches: EndpointSec.reachOf(raw.assignments).kind === "reaches", compliancePolicy: isCompliance(raw) });
          }
        }
      }
      // status: enforced beats configured-unreaching beats disabled beats none;
      // a platform with no policies at all is set aside as notManaged.
      let status;
      if (evidence.some((e) => e.verdict === "enforced" && e.reaches)) status = "enforced";
      else if (evidence.some((e) => e.verdict === "enforced")) status = "unreaching";
      else if (evidence.some((e) => e.verdict === "disabled" && e.reaches)) status = "disabledByPolicy";
      else if (!managed.has(cap.platform)) status = "notManaged";
      else status = "noEvidence";
      results.push({ cap, status, evidence });
    }

    // frameworks: a control's verdict counts only capabilities whose
    // platform the tenant manages — "no macs, no FileVault evidence" must
    // not drag a control to partial on a Windows-only tenant
    const frameworks = FRAMEWORKS.map((fw) => {
      const perControl = {};
      for (const [capId, ctrls] of Object.entries(fw.map)) {
        const r = results.find((x) => x.cap.id === capId);
        if (!r || r.status === "notManaged") continue;
        for (const c of ctrls) {
          (perControl[c] = perControl[c] || { total: 0, enforced: 0, caps: [] }).total++;
          perControl[c].caps.push({ id: capId, name: r.cap.name, platform: r.cap.platform, status: r.status });
          if (r.status === "enforced") perControl[c].enforced++;
        }
      }
      const controls = Object.keys(fw.controls).map((cid) => {
        const pc = perControl[cid] || { total: 0, enforced: 0, caps: [] };
        const status = pc.total === 0 ? "noEvidence" : pc.enforced === pc.total ? "evidence" : pc.enforced > 0 ? "partial" : "noEvidence";
        return { id: cid, summary: fw.controls[cid], status, caps: pc.caps };
      });
      return { id: fw.id, name: fw.name, version: fw.version, note: fw.note, controls,
        summary: { evidence: controls.filter((c) => c.status === "evidence").length,
          partial: controls.filter((c) => c.status === "partial").length,
          none: controls.filter((c) => c.status === "noEvidence").length } };
    });

    const setAside = results.filter((r) => r.status === "notManaged").map((r) => r.cap.platform);
    return { results, frameworks, managed: [...managed],
      notManaged: [...new Set(setAside)],
      counts: {
        enforced: results.filter((r) => r.status === "enforced").length,
        unreaching: results.filter((r) => r.status === "unreaching").length,
        disabled: results.filter((r) => r.status === "disabledByPolicy").length,
        none: results.filter((r) => r.status === "noEvidence").length,
        notManaged: results.filter((r) => r.status === "notManaged").length,
      } };
  }

  // ---- exports -----------------------------------------------------------
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  function meta(res) {
    return { when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      read: res && res.readAt ? new Date(res.readAt).toISOString().replace("T", " ").replace(/\..*/, " UTC") : null,
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "") };
  }
  const STATUS_MD = { enforced: "enforced", unreaching: "**configured — reaches nobody**",
    disabledByPolicy: "**disabled by policy**", noEvidence: "no evidence", notManaged: "platform not managed here" };
  function markdown(a, m) {
    const L = [];
    L.push("# Compliance evidence", "");
    L.push(`Generated ${m.when} by TUNO ${m.build}${m.read && m.read !== m.when ? ` · tenant read ${m.read}` : ""}`, "");
    L.push(`> ${DISCLAIMER}`, "");
    L.push(`## Capabilities`, "");
    L.push(`${a.counts.enforced} enforced · ${a.counts.unreaching} configured but reaching nobody · ${a.counts.disabled} disabled by policy · ${a.counts.none} without evidence` + (a.counts.notManaged ? ` · ${a.counts.notManaged} on platforms not managed here (${a.notManaged.join(", ")})` : ""), "");
    L.push(`| Capability | Platform | Status | Evidence |`, `|---|---|---|---|`);
    for (const r of a.results) {
      const ev = r.evidence.map((e) => `${mdCell(e.policy)} (${mdCell(e.setting)} = ${mdCell(e.value)}${e.reaches ? "" : "; reaches nobody"}${e.compliancePolicy ? "; compliance policy — marks, does not enforce" : ""})`).join("; ") || "—";
      L.push(`| ${mdCell(r.cap.name)} | ${r.cap.platform} | ${STATUS_MD[r.status]} | ${ev} |`);
    }
    L.push("");
    for (const fw of a.frameworks) {
      L.push(`## ${fw.name} ${fw.version}`, "", `${fw.note}`, "");
      L.push(`${fw.summary.evidence} controls with evidence · ${fw.summary.partial} partial · ${fw.summary.none} without evidence`, "");
      L.push(`| Control | Status | Capabilities |`, `|---|---|---|`);
      for (const c of fw.controls) {
        const caps = c.caps.map((x) => `${mdCell(x.name)} (${x.platform}: ${STATUS_MD[x.status].replace(/\*/g, "")})`).join("; ") || "— no managed capability maps here";
        L.push(`| ${c.id} — ${mdCell(c.summary)} | ${c.status === "evidence" ? "evidence found" : c.status === "partial" ? "**partial**" : "no evidence"} | ${caps} |`);
      }
      L.push("");
    }
    L.push(`---`, DISCLAIMER, "",
      `Evidence in a policy reaching nobody is not enforcement (reach judged by construction); a compliance policy marks devices noncompliant rather than enforcing — the block lives in Conditional Access. Capability set and mappings are TUNO's own, after the coverage demonstrated by Ugur Koc's IntuneDocumentation (Elastic 2.0 — reimplemented, not ported).`);
    return L.join("\n");
  }
  function csv(a) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["capability,platform,status,policy,setting,value,reaches,compliancePolicyCaveat"];
    for (const r of a.results) {
      if (!r.evidence.length) { L.push([q(r.cap.name), q(r.cap.platform), r.status, "", "", "", "", ""].join(",")); continue; }
      for (const e of r.evidence) L.push([q(r.cap.name), q(r.cap.platform), r.status, q(e.policy), q(e.setting), q(e.value), String(e.reaches), String(e.compliancePolicy)].join(","));
    }
    return L.join("\n");
  }

  return { CAPABILITIES, FRAMEWORKS, DISCLAIMER, meets, peel, pathValue, catalogValuesOf, assess, markdown, csv, meta };
})();


// ======================================================================
// T26 — the screen. Engine above is DOM-free for the headless suite.
// ======================================================================
const CompEvTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let res = null, assessment = null, running = false, statusFilter = null;
  // THE RAIL (10538, Mihai's layout round — Option A, T20's shape): one
  // pane at a time — capabilities, then one node per framework — so the
  // three control tables stop stacking under the capability list and the
  // jump to a section is a click, not a scroll. State survives re-renders.
  let pane = "caps";
  const open = new Set();   // fold state on capability ids — the T03 rule

  function prog(msg) { TunoProgress.show("ceBody", "ceProg", msg); }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function showExports(on) { ["ceMd", "ceCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); }
  const srcLine = () => (window.PolicyCache && PolicyCache.get() === res && res)
    ? `From ${PolicyCache.fromSignIn() ? "the sign-in read" : "the shared read"} at ${esc(PolicyCache.timeLabel())} — 📋 Read the tenant re-reads.` : "";

  async function run(attach) {
    if (running) return;
    running = true; $("ceRun").disabled = true;
    if (!attach) { showExports(false); $("ceBody").innerHTML = ""; open.clear(); statusFilter = null; pane = "caps"; }
    try {
      if (attach && window.PolicyCache && PolicyCache.reading()) {
        res = await PolicyCache.read(prog);
      } else if (attach && window.PolicyCache && PolicyCache.get()) {
        res = PolicyCache.get();
      } else {
        await Graph.ensureScopes(window.PolicyCache ? PolicyCache.scopesNeeded() : Graph.SCOPES.config);
        res = window.PolicyCache ? await PolicyCache.refresh(prog) : await Docs.collect({ onStatus: prog, keepRaw: true });
      }
      assessment = CompEv.assess(res);
      prog("");
      render();
      showExports(true);
    } catch (e) {
      $("ceBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
      prog("");
    } finally { running = false; $("ceRun").disabled = false; }
  }

  // warm start — the cache's rule: an answer already in memory is shown,
  // with its source named; the button stays the refresh
  function onShow() {
    if (assessment || running) return;
    if (window.PolicyCache && (PolicyCache.get() || PolicyCache.reading())) run(true);
  }

  const CHIP = {
    enforced: `<span class="au-op create">enforced</span>`,
    unreaching: `<span class="gu-how priv" title="The setting exists, but only in a policy reaching nobody — that is not enforcement">reaches nobody</span>`,
    disabledByPolicy: `<span class="au-op delete">disabled by policy</span>`,
    noEvidence: `<span class="gu-how exc">no evidence</span>`,
    notManaged: `<span class="mini muted">not managed here</span>`,
  };

  function render() {
    const a = assessment;
    if (pane !== "caps" && !a.frameworks.some((f) => f.id === pane)) pane = "caps";

    // ---- the rail: capabilities + one node per framework ----
    const railNode = (id, icon, label, right, active) => `<div class="ep-node${active ? " active" : ""}" data-cepane="${esc(id)}" role="button" tabindex="0">
      <span>${icon} ${esc(label)}</span><span class="mini" style="margin-left:auto;white-space:nowrap">${right}</span></div>`;
    const capBad = a.counts.unreaching + a.counts.disabled;
    const rail = [
      railNode("caps", "🧩", "Capabilities",
        `<span class="ov-on">${a.counts.enforced}</span><span class="muted">/${a.results.length}</span>${capBad ? ` <span style="color:var(--off)">·${capBad}</span>` : ""}`,
        pane === "caps"),
      '<p class="mini muted" style="margin:2px 10px 6px">enforced / all · findings</p><hr>',
      ...a.frameworks.map((fw) => railNode(fw.id, "📐", fw.name,
        `<span class="ov-on">${fw.summary.evidence}</span><span class="muted">/${fw.controls.length}</span>${fw.summary.partial ? ` <span style="color:var(--off)">·${fw.summary.partial}</span>` : ""}`,
        pane === fw.id)),
    ].join("");

    const parts = [];
    const c = a.counts;
    const card = (id, label, n, sub, cls) => `<button class="au-card au-card-btn ${statusFilter === id ? "active" : ""}" data-cestat="${id}" type="button">
      <div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></button>`;
    parts.push(`<div class="au-cards">
      ${card("enforced", "Enforced", c.enforced, "evidence in a reaching policy", c.enforced ? "ok" : "")}
      ${card("unreaching", "Reaches nobody", c.unreaching, "configured, enforcing nothing", c.unreaching ? "bad" : "ok")}
      ${card("disabledByPolicy", "Disabled by policy", c.disabled, "a policy switches it OFF", c.disabled ? "bad" : "ok")}
      ${card("noEvidence", "No evidence", c.none, "no matching policy found — not proof of absence", "")}
    </div>`);
    const src = srcLine();
    parts.push(`<div class="list-card"><p class="mini muted" style="margin:0">${src ? src + " " : ""}${esc(CompEv.DISCLAIMER)}${a.notManaged.length ? ` <b>${esc(a.notManaged.join(", "))}</b>: no policies at all — set aside as not managed here, not counted against any control.` : ""}</p></div>`);

    const shown = a.results.filter((r) => !statusFilter || r.status === statusFilter);
    const rows = shown.map((r) => {
      const isOpen = open.has(r.cap.id);
      const head = `<div class="au-ev-h"><b>${esc(r.cap.name)}</b> ${CHIP[r.status]}<span class="au-when mini muted">${esc(r.cap.platform)}</span></div>
        <div class="mini muted au-ev-m">${esc(r.cap.why)} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>`;
      const detail = !isOpen ? "" : `<div class="au-detail">
        ${r.evidence.length ? `<ul class="mini au-diff">${r.evidence.map((e) => `<li><b>${esc(e.policy)}</b> — <code>${esc(e.setting)}</code> = ${esc(e.value)} · ${e.verdict}${e.reaches ? "" : " · <b>reaches nobody</b>"}${e.compliancePolicy ? ` · <span class="muted">compliance policy — marks noncompliant, does not enforce; the block lives in Conditional Access</span>` : ""}</li>`).join("")}</ul>`
        : `<p class="mini muted" style="margin:0">No matching policy found${r.status === "notManaged" ? ` — and no ${esc(r.cap.platform)} policies at all, so this is a platform not managed here rather than a gap` : " — which is absence of evidence, not evidence of absence"}.</p>`}
      </div>`;
      const cls = r.status === "enforced" ? "ok" : (r.status === "noEvidence" || r.status === "notManaged") ? "warn" : "bad";
      return `<div class="au-fold ${cls} ${isOpen ? "open" : ""}" data-cefold="${esc(r.cap.id)}"><div class="au-ev-card">${head}${detail}</div></div>`;
    }).join("");
    parts.push(`<div class="list-card">
      <h4 style="margin:0 0 4px">Capabilities (${shown.length}${statusFilter ? " — filtered" : ""})</h4>
      <p class="mini muted" style="margin:0 0 10px">Each is a control the tenant can demonstrably enforce through Intune, detected by setting identity — open a row for the evidence, policy by policy.</p>
      ${rows || `<p class="mini muted" style="margin:0">Nothing with this status.</p>`}
    </div>`);

    // ---- one pane at a time: capabilities, or one framework's table ----
    let paneHtml;
    if (pane === "caps") {
      paneHtml = parts.join("");
    } else {
      const fw = a.frameworks.find((f) => f.id === pane);
      const rowsF = fw.controls.map((ctl) => {
        const chip = ctl.status === "evidence" ? `<span class="au-op create">evidence found</span>`
          : ctl.status === "partial" ? `<span class="gu-how priv">partial</span>` : `<span class="gu-how exc">no evidence</span>`;
        const caps = ctl.caps.map((x) => `${esc(x.name)} <span class="muted">(${esc(x.platform)})</span>`).join(", ") || `<span class="muted">no managed capability maps here</span>`;
        return `<tr><td style="white-space:nowrap"><b>${esc(ctl.id)}</b></td><td>${esc(ctl.summary)}</td><td>${chip}</td><td>${caps}</td></tr>`;
      }).join("");
      paneHtml = `<div class="list-card" style="margin-top:0">
        <h4 style="margin:0 0 4px">${esc(fw.name)} <span class="mini muted">${esc(fw.version)}</span></h4>
        <p class="mini muted" style="margin:0 0 8px">${esc(fw.note)} ${fw.summary.evidence} with evidence · ${fw.summary.partial} partial · ${fw.summary.none} without.</p>
        <div style="overflow-x:auto"><table class="cg-table mini"><tr><th>Control</th><th></th><th>Status</th><th>Capabilities</th></tr>${rowsF}</table></div>
        <p class="mini muted" style="margin:8px 0 0">${esc(CompEv.DISCLAIMER)}</p>
      </div>`;
    }

    $("ceBody").innerHTML = `<div class="ep-wrap"><div class="ep-rail">${rail}</div><div class="ep-main">${paneHtml}</div></div>`;
    $("ceBody").querySelectorAll("[data-cepane]").forEach((n) => n.addEventListener("click", () => {
      pane = n.dataset.cepane;
      render();
    }));
    $("ceBody").querySelectorAll("[data-cestat]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.cestat;
      statusFilter = statusFilter === k ? null : k;
      render();
    }));
  }

  function exportAs(fmt) {
    const m = CompEv.meta(res);
    if (fmt === "md") return download("Compliance-evidence.md", CompEv.markdown(assessment, m), "text/markdown");
    return download("Compliance-evidence.csv", CompEv.csv(assessment), "text/csv");
  }

  function init() {
    if (!$("ceRun")) return;
    $("ceRun").addEventListener("click", () => run(false));
    $("ceMd").addEventListener("click", () => exportAs("md"));
    $("ceCsv").addEventListener("click", () => exportAs("csv"));
    $("ceBody").addEventListener("click", (e) => {
      const f = e.target.closest("[data-cefold]");
      if (!f || e.target.closest("a,code,button")) return;
      const id = f.dataset.cefold;
      open.has(id) ? open.delete(id) : open.add(id);
      render();
    });
    (window.TunoScreenHooks = window.TunoScreenHooks || {})["screen-compev"] = onShow;
  }

  return { init, _setForTest: (r, a, doRender) => { res = r; assessment = a; if (doRender) render(); } };
})();

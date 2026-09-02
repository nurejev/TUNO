// ======================================================================
// T16 — Firewall & ASR coverage (R26). After Ugur Koc's Get Firewall and
// ASR Status (MIT). Whether the Windows fleet actually has firewall and
// attack-surface-reduction enforcement, or just policy objects: every
// endpoint security policy grouped into the portal's own disciplines,
// each with a verdict — covered, policies exist but none is assigned, or
// no policy at all.
//
// THE TEMPLATE-FAMILY FILTER RUNS CLIENT-SIDE because the server-side
// filter is unreliable on this surface — the original's own note, kept.
//
// "COVERED" IS A CLAIM AND THIS TOOL NARROWS THE ORIGINAL'S. At least one
// assigned policy per discipline is what the script means by coverage,
// and per-device applicability is not evaluated — said on screen. One
// step past it, for free: assignments arrive $expand-ed, so "assigned" is
// checked BY CONSTRUCTION the R20 way — a policy with no include and no
// tenant-wide target, or whose every assignment is an exclusion, reaches
// nobody and does not count as coverage. Whether an included group is
// EMPTY is T09's finding, and the screen points there.
//
// LEGACY INTENTS ARE CLASSIFIED, NOT DUMPED. The original lists
// deviceManagement/intents under a "Legacy Intent" pseudo-discipline, so
// a tenant enforcing firewall through an intent reads as a firewall GAP —
// an overstatement in the dangerous direction. Here the intent's template
// is resolved (one read of deviceManagement/templates) and the intent
// counts toward its discipline; one that cannot be classified is listed
// as unclassified and counts toward nothing, with the gap stated. The
// legacy surface only says isAssigned — no assignment detail — so an
// assigned intent is credited with the caveat on the row.
//
// Reads only, no new scope: the policy reads ride the config read, the
// device count rides the device read, names ride the directory read, and
// (10535) the group member counts ride the group read — "configured on
// how many devices" answered as group MEMBERSHIP, T20's arithmetic worn
// on every row: overlaps not deduplicated, exclusions not subtracted,
// filters cap at may, an unreadable count makes the sum a floor.
// ======================================================================
const EndpointSec = (() => {
  "use strict";

  const S = () => Graph.SCOPES;
  const lc = (s) => String(s || "").toLowerCase();

  // The portal's disciplines, from templateFamily — the original's wildcard
  // switch, kept in the same order.
  const FAMILY_MAP = [
    [/Firewall/i, "Firewall"],
    [/AttackSurfaceReduction/i, "Attack Surface Reduction"],
    [/Antivirus/i, "Antivirus"],
    [/DiskEncryption/i, "Disk Encryption"],
    [/EndpointDetectionAndResponse/i, "EDR"],
    [/AccountProtection/i, "Account Protection"],
    [/EndpointPrivilegeManagement/i, "Endpoint Privilege Management"],
    [/ApplicationControl/i, "App Control"],
  ];
  const CORE = ["Firewall", "Attack Surface Reduction", "Antivirus", "Disk Encryption", "EDR", "Account Protection"];

  function disciplineOf(templateFamily) {
    for (const [re, label] of FAMILY_MAP) if (re.test(String(templateFamily || ""))) return label;
    return String(templateFamily || "");
  }
  // Legacy intents carry a templateId, and the template's display name is the
  // only thing that says which discipline the intent enforces.
  function disciplineOfTemplateName(name) {
    const s = String(name || "");
    if (/firewall/i.test(s)) return "Firewall";
    if (/attack surface|ASR/i.test(s)) return "Attack Surface Reduction";
    if (/antivirus/i.test(s)) return "Antivirus";
    if (/bitlocker|disk encryption|filevault/i.test(s)) return "Disk Encryption";
    if (/endpoint detection|EDR/i.test(s)) return "EDR";
    if (/account protection|windows hello|local.*group membership/i.test(s)) return "Account Protection";
    if (/application control|app control/i.test(s)) return "App Control";
    return null;
  }

  // The R20 reach-by-construction rule: what do this policy's assignments
  // claim, before anybody evaluates a filter or counts a member?
  function reachOf(assignments) {
    const a = assignments || [];
    if (!a.length) return { kind: "unassigned", includes: 0, excludes: 0, tenantWide: false, allDevices: false, allUsers: false, filtered: false, filteredExclusion: false };
    let includes = 0, excludes = 0, tenantWide = false, allDevices = false, allUsers = false;
    const fr = Docs.filterReachOf(a);
    const filtered = fr.capped, filteredExclusion = fr.onExclusion;
    for (const x of a) {
      const t = (x.target && x.target["@odata.type"]) || "";
      if (/exclusionGroupAssignmentTarget/.test(t)) excludes++;
      else if (/groupAssignmentTarget/.test(t)) includes++;
      // ALL-DEVICES AND ALL-USERS ARE SPLIT (10535) because the member-count
      // question answers differently for each: all devices IS the fleet
      // denominator this tool already reads, while all users is a number no
      // group holds — their devices follow them.
      else if (/allDevicesAssignmentTarget/.test(t)) { tenantWide = true; allDevices = true; }
      else if (/allLicensedUsersAssignmentTarget/.test(t)) { tenantWide = true; allUsers = true; }
      // FILTERED MEANS "REACH IS CAPPED" (10490). This had counted a filter
      // on an EXCLUSION too, where the filter narrows what is excluded
      // rather than what is reached — the "may reach, not does" caveat this
      // tool prints does not describe that case at all. Docs.filterReachOf
      // is the one reader; a filter on an exclusion is its own fact.
    }
    const kind = (includes || tenantWide) ? "reaches" : excludes ? "excludedOnly" : "unassigned";
    return { kind, includes, excludes, tenantWide, allDevices, allUsers, filtered, filteredExclusion };
  }

  function groupIdsOf(assignments) {
    const ids = [];
    for (const x of assignments || []) {
      const id = x.target && x.target.groupId;
      if (id) ids.push(id);
    }
    return ids;
  }
  // Only INCLUDE groups feed the member sum — counting an exclusion group's
  // members toward "configured on" would add exactly the machines the
  // assignment keeps out.
  function includeGroupIdsOf(assignments) {
    const ids = [];
    for (const x of assignments || []) {
      const t = (x.target && x.target["@odata.type"]) || "";
      const id = x.target && x.target.groupId;
      if (id && !/exclusionGroupAssignmentTarget/.test(t)) ids.push(id);
    }
    return [...new Set(ids)];
  }

  // ---- "configured on how many devices" (10535, Mihai's ask) -------------
  // Answered as GROUP MEMBERSHIP — the only count a browser can give without
  // walking the fleet, and the arithmetic T20 already wears: sums across
  // groups may double-count overlapping members, exclusions are NOT
  // subtracted, a filter caps reach at "may", and a count that could not be
  // read makes the sum a floor, never a silent zero. Membership is targets,
  // not check-ins — per-device applicability is still not evaluated.
  function targetCountOf(row, groupCounts, deviceCount) {
    if (row.source === "Legacy intent") return { kind: "legacy" };
    const r = row.reach;
    if (r.kind !== "reaches") return { kind: "none" };
    if (r.allDevices) return { kind: "fleet", n: (typeof deviceCount === "number") ? deviceCount : null };
    if (r.allUsers) return { kind: "allUsers" };
    const ids = row.includeGroupIds || [];
    if (!ids.length) return { kind: "none" };
    let n = 0, unread = 0;
    for (const id of ids) {
      const c = groupCounts ? groupCounts[id] : undefined;
      if (typeof c === "number" && Number.isFinite(c)) n += c; else unread++;
    }
    if (unread === ids.length) return { kind: "unknown", groups: ids.length };
    return { kind: "members", n, unread, groups: ids.length, floor: unread > 0 };
  }
  // One phrase for one count — screen, Markdown and CSV all speak it, so
  // they cannot disagree about the same number.
  function targetPhrase(t) {
    if (!t || t.kind === "legacy" || t.kind === "none") return "";
    if (t.kind === "fleet") return t.n === null ? "all devices — the fleet count could not be read, so the number is unknown, not zero"
      : `all devices — ${t.n} Windows enrolled`;
    if (t.kind === "allUsers") return "all users — their devices follow them; a device number no group holds";
    if (t.kind === "unknown") return `member count unreadable (${t.groups} group${t.groups === 1 ? "" : "s"}) — unknown, not zero`;
    const base = `≈${t.n} member${t.n === 1 ? "" : "s"}`;
    const floor = t.floor ? ` at least — ${t.unread} group count${t.unread === 1 ? "" : "s"} unreadable` : "";
    const overlap = t.groups > 1 ? ` across ${t.groups} groups, overlaps not deduplicated` : "";
    return base + floor + overlap;
  }

  async function report(opts) {
    const o = opts || {};
    const onStatus = o.onStatus || (() => {});
    const out = { policies: null, policyError: null, intents: [], intentsError: null,
      templatesError: null, deviceCount: null, deviceCountError: null, disciplines: null, names: {}, nameError: null,
      groupCounts: {}, groupCountUnread: 0,
      settingsById: {} };   // policy id → { rows, error } once read (10559)

    onStatus("Reading settings catalog policies…");
    let all;
    try {
      all = await Graph.readAll(`${Graph.BETA}/deviceManagement/configurationPolicies?$expand=assignments`, {
        scopes: S().config, retry: true,
        onPage: (n) => onStatus(`Reading settings catalog policies — ${n}…`),
      });
    } catch (e) {
      out.policyError = String((e && e.message) || e).slice(0, 240);
      return out;
    }
    // Server-side templateFamily filters behave inconsistently — filter locally.
    const secPolicies = all.filter((p) => p.templateReference && /^endpointSecurity/i.test(String(p.templateReference.templateFamily || "")));

    onStatus("Reading legacy security intents…");
    let templatesById = {};
    try {
      out.intents = await Graph.readAll(`${Graph.BETA}/deviceManagement/intents?$select=id,displayName,templateId,isAssigned`, { scopes: S().config, retry: true });
    } catch (e) { out.intentsError = String((e && e.message) || e).slice(0, 240); }
    if (out.intents.length) {
      try {
        const templates = await Graph.readAll(`${Graph.BETA}/deviceManagement/templates?$select=id,displayName`, { scopes: S().config, retry: true });
        templates.forEach((t) => { templatesById[t.id] = t.displayName || ""; });
      } catch (e) { out.templatesError = String((e && e.message) || e).slice(0, 240); }
    }

    onStatus("Counting Windows devices…");
    try {
      const devs = await Graph.readAll(`${Graph.BETA}/deviceManagement/managedDevices?$filter=operatingSystem eq 'Windows'&$select=id&$top=999`, { scopes: S().devices, retry: true });
      out.deviceCount = devs.length;
    } catch (e) { out.deviceCountError = String((e && e.message) || e).slice(0, 240); }

    // ---- rows ----
    const rows = [];
    for (const p of secPolicies) {
      const reach = reachOf(p.assignments);
      rows.push({
        id: p.id,
        name: p.name || p.id,
        discipline: disciplineOf(p.templateReference.templateFamily),
        source: "Settings catalog",
        template: p.templateReference.templateDisplayName || p.templateReference.templateFamily || "",
        platforms: String(p.platforms || ""),
        assignments: (p.assignments || []).length,
        reach,
        groupIds: groupIdsOf(p.assignments),
        includeGroupIds: includeGroupIdsOf(p.assignments),
        counts: reach.kind === "reaches",
        caveat: reach.kind === "excludedOnly" ? "every assignment is an exclusion — reaches nobody by construction"
          : reach.kind === "unassigned" ? "no assignments — configures nothing"
          : reach.filtered ? "carries an assignment filter — reach is 'may', the T06 rule" : "",
      });
    }
    for (const it of out.intents) {
      const tplName = templatesById[it.templateId];
      const disc = tplName !== undefined ? disciplineOfTemplateName(tplName) : null;
      rows.push({
        id: it.id,
        name: it.displayName || it.id,
        discipline: disc || "Legacy intent — unclassified",
        source: "Legacy intent",
        template: tplName || (out.templatesError ? "template could not be read" : it.templateId || ""),
        platforms: "",
        assignments: null,   // the legacy surface does not say
        reach: { kind: it.isAssigned ? "reaches" : "unassigned", includes: 0, excludes: 0, tenantWide: false, allDevices: false, allUsers: false, filtered: false },
        groupIds: [],
        includeGroupIds: [],
        counts: !!it.isAssigned && !!disc,
        caveat: !disc ? (out.templatesError ? "unclassified — the template read failed, so this counts toward nothing" : "unclassified — counts toward nothing, said rather than guessed")
          : "legacy surface — Graph says only assigned or not, no assignment detail",
      });
    }

    // Resolve group names so the fold is not a page of GUIDs. Best effort.
    const allIds = [...new Set(rows.flatMap((r) => r.groupIds))];
    if (allIds.length) {
      onStatus("Resolving group names…");
      // resolveNames never throws — a refusal lands on lookup.error and the
      // screen says "names unresolved" instead of showing bare GUIDs silently.
      out.names = await Graph.resolveNames(allIds, { types: ["group"] });
      out.nameError = out.names.error ? String(out.names.error).slice(0, 200) : null;
    }

    // Member counts for the INCLUDE groups — Graph.memberCount, the seam the
    // AppLocker deploy and T20 already use. Pooled, and a refusal lands as
    // null on that group (a floor in the sum), never as a zero.
    const incIds = [...new Set(rows.flatMap((r) => r.includeGroupIds || []))];
    if (incIds.length) {
      onStatus("Counting group members…");
      const counted = await Graph.pool(incIds, (id) => Graph.memberCount(id), 6);
      for (const c of counted) {
        // c is { item, value } or { item, error } — the 10483 lesson: read
        // the wrapper, never the wrapper AS the count.
        const n = c.error ? NaN : Number(c.value);
        out.groupCounts[c.item] = Number.isFinite(n) ? n : null;
        if (!Number.isFinite(n)) out.groupCountUnread++;
      }
    }

    // ---- per-discipline verdicts ----
    const disciplines = {};
    const seen = [...new Set([...CORE, ...rows.map((r) => r.discipline)])];
    for (const d of seen) {
      const list = rows.filter((r) => r.discipline === d);
      const covering = list.filter((r) => r.counts);
      disciplines[d] = {
        core: CORE.includes(d),
        policies: list.length,
        covering: covering.length,
        viaLegacy: covering.some((r) => r.source === "Legacy intent") && !covering.some((r) => r.source !== "Legacy intent"),
        verdict: covering.length ? "covered" : list.length ? "unassigned" : "none",
      };
    }

    rows.sort((a, b) => a.discipline.localeCompare(b.discipline) || a.name.localeCompare(b.name));
    out.policies = rows;
    out.disciplines = disciplines;
    return out;
  }

  // ================================================================
  // WHAT A POLICY CONFIGURES (10559, Mihai: "this should show which rules
  // are enabled within that policy"). The coverage read says whether a
  // policy reaches anybody; this says what it does when it does. Read per
  // policy, lazily at the click (or all at once from the button), with
  // $expand=settingDefinitions so the rows wear the catalog's own display
  // names and option labels — never a slug when the tenant can say better.
  // A read that fails is an error on that policy, never an empty list.
  // ================================================================
  const ASR_PARENT = "device_vendor_msft_policy_config_defender_attacksurfacereductionrules";
  const ASR_MODE = { 0: "Off", 1: "Block", 2: "Audit", 6: "Warn", off: "Off", block: "Block", audit: "Audit", warn: "Warn" };
  // Every ASR rule Microsoft documents today — the settings-catalog slug
  // under the ASR parent, the rule GUID the legacy string uses, the name.
  // A rule the policy does not mention is NOT SET, said as such.
  const ASR_RULES = [
    ["blockabuseofexploitedvulnerablesigneddrivers", "56a863a9-875e-4185-98a7-b882c64b5ce5", "Block abuse of exploited vulnerable signed drivers"],
    ["blockadobereaderfromcreatingchildprocesses", "7674ba52-37eb-4a4f-a9a1-f0f9a1619a2c", "Block Adobe Reader from creating child processes"],
    ["blockallofficeapplicationsfromcreatingchildprocesses", "d4f940ab-401b-4efc-aadc-ad5f3c50688a", "Block all Office applications from creating child processes"],
    ["blockcredentialstealingfromwindowslocalsecurityauthoritysubsystem", "9e6c4e1f-7d60-472f-ba1a-a39ef669e4b2", "Block credential stealing from LSASS"],
    ["blockexecutablecontentfromemailclientandwebmail", "be9ba2d9-53ea-4cdc-84e5-9b1eeee46550", "Block executable content from email client and webmail"],
    ["blockexecutablefilesrunningunlesstheymeetprevalenceagetrustedlistcriterion", "01443614-cd74-433a-b99e-2ecdc07bfc25", "Block executables unless they meet prevalence, age or trusted-list criteria"],
    ["blockexecutionofpotentiallyobfuscatedscripts", "5beb7efe-fd9a-4556-801d-275e5ffc04cc", "Block execution of potentially obfuscated scripts"],
    ["blockjavascriptorvbscriptfromlaunchingdownloadedexecutablecontent", "d3e037e1-3eb8-44c8-a917-57927947596d", "Block JavaScript or VBScript from launching downloaded executable content"],
    ["blockofficeapplicationsfromcreatingexecutablecontent", "3b576869-a4ec-4529-8536-b80a7769e899", "Block Office applications from creating executable content"],
    ["blockofficeapplicationsfrominjectingcodeintootherprocesses", "75668c1f-73b5-4cf0-bb93-3ecf5cb7cc84", "Block Office applications from injecting code into other processes"],
    ["blockofficecommunicationappfromcreatingchildprocesses", "26190899-1602-49e8-8b27-eb1d0a1ce869", "Block Office communication application from creating child processes"],
    ["blockpersistencethroughwmieventsubscription", "e6db77e5-3df2-4cf1-b95a-636979351e5b", "Block persistence through WMI event subscription"],
    ["blockprocesscreationsfrompsexecandwmicommands", "d1e49aac-8f56-4280-b9ba-993a6d77406c", "Block process creations originating from PSExec and WMI commands"],
    ["blockuntrustedunsignedprocessesthatrunfromusb", "b2b3f03d-6a65-4f7b-a9c7-1c7ef74a9ba4", "Block untrusted and unsigned processes that run from USB"],
    ["blockwin32apicallsfromofficemacros", "92e97fa1-2edf-4476-bdd6-9dd0b4dddc7b", "Block Win32 API calls from Office macros"],
    ["useadvancedprotectionagainstransomware", "c1db55ab-c21a-4637-bb3f-a12568109d35", "Use advanced protection against ransomware"],
    ["blockrebootingmachineinsafemode", "33ddedf1-c6e0-47cb-833e-de6133960387", "Block rebooting machine in Safe Mode"],
    ["blockuseofcopiedorimpersonatedsystemtools", "c0033c00-d16d-4114-a5a0-dc9b3a7d2ceb", "Block use of copied or impersonated system tools"],
    ["blockwebshellcreationforservers", "a8f5898e-1dc8-49a9-9878-85004b8a61e6", "Block Webshell creation for Servers"],
  ];

  const prettySlug = (id) => {
    const last = String(id || "").split("_").pop() || "";
    return last ? last.charAt(0).toUpperCase() + last.slice(1) : "(setting)";
  };
  // Flatten one policy's settings (as /settings?$expand=settingDefinitions
  // returns them) into rows: { defId, name, value, depth, raw }. The
  // definitions ride beside each setting; option labels come from them.
  function flattenSettings(settings) {
    const rows = [];
    for (const s of settings || []) {
      const defs = {};
      for (const d of (s && s.settingDefinitions) || []) if (d && d.id) defs[lc(d.id)] = d;
      const nameOf = (id) => { const d = defs[lc(id)]; return (d && d.displayName) || prettySlug(id); };
      const optionOf = (id, v) => {
        const d = defs[lc(id)];
        const o = d && Array.isArray(d.options) ? d.options.find((x) => x && lc(x.itemId) === lc(v)) : null;
        if (o && o.displayName) return o.displayName;
        const sv = lc(String(v ?? ""));
        return sv.startsWith(lc(id) + "_") ? sv.slice(String(id).length + 1) : String(v ?? "");
      };
      const walk = (inst, depth) => {
        if (!inst || typeof inst !== "object") return;
        // a child handed over still wrapped as a setting (fixtures do this;
        // Graph does not) is unwrapped rather than dropped
        if (inst.settingInstance && !inst.settingDefinitionId) { walk(inst.settingInstance, depth); return; }
        const id = inst.settingDefinitionId || "";
        if (inst.choiceSettingValue) {
          rows.push({ defId: id, name: nameOf(id), value: optionOf(id, inst.choiceSettingValue.value), raw: inst.choiceSettingValue.value, depth });
          (inst.choiceSettingValue.children || []).forEach((c) => walk(c, depth + 1));
        } else if (inst.simpleSettingValue) {
          rows.push({ defId: id, name: nameOf(id), value: String(inst.simpleSettingValue.value ?? ""), raw: inst.simpleSettingValue.value, depth });
        } else if (Array.isArray(inst.simpleSettingCollectionValue)) {
          const vals = inst.simpleSettingCollectionValue.map((x) => String((x && x.value) ?? ""));
          rows.push({ defId: id, name: nameOf(id), value: vals.join(", "), raw: vals, depth, list: vals });
        } else if (Array.isArray(inst.choiceSettingCollectionValue)) {
          for (const c of inst.choiceSettingCollectionValue) {
            rows.push({ defId: id, name: nameOf(id), value: optionOf(id, c && c.value), raw: c && c.value, depth });
            ((c && c.children) || []).forEach((x) => walk(x, depth + 1));
          }
        } else if (Array.isArray(inst.groupSettingCollectionValue)) {
          inst.groupSettingCollectionValue.forEach((g) => (g.children || []).forEach((c) => walk(c, depth + 1)));
        } else if (inst.groupSettingValue) {
          (inst.groupSettingValue.children || []).forEach((c) => walk(c, depth + 1));
        } else if (id) {
          rows.push({ defId: id, name: nameOf(id), value: "(configured)", raw: null, depth });
        }
      };
      walk(s && (s.settingInstance || s), 0);
    }
    return rows;
  }
  // The ASR view of those rows: every documented rule with the mode this
  // policy gives it — from the catalog child (…_<slug> → block/audit/warn/
  // off) or the legacy "guid=1|guid=2" string — or NOT SET. Plus the
  // exclusions and the per-rule exclusions the policy carries.
  function asrRulesOf(rows) {
    const mode = {};
    const perRule = {};
    const excl = [];
    for (const r of rows) {
      const id = lc(r.defId);
      if (id === ASR_PARENT) {
        // legacy string form on the parent: "guid=1|guid=2"
        for (const pair of String(r.raw ?? "").split("|")) {
          const m = /^\s*([0-9a-f-]{36})\s*=\s*(\d+)\s*$/i.exec(pair);
          if (m) { const rule = ASR_RULES.find((x) => x[1] === lc(m[1])); if (rule) mode[rule[0]] = ASR_MODE[Number(m[2])] || m[2]; }
        }
        continue;
      }
      if (id === ASR_PARENT + "_asronlyperruleexclusions" || /attacksurfacereductiononlyexclusions$/.test(id)) { excl.push(...(r.list || [r.value])); continue; }
      if (id.startsWith(ASR_PARENT + "_")) {
        const rest = id.slice(ASR_PARENT.length + 1);
        const rule = ASR_RULES.find((x) => rest === x[0]);
        if (rule) {
          const tail = lc(String(r.raw ?? "")).replace(new RegExp("^" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "_"), "");
          mode[rule[0]] = ASR_MODE[tail] || r.value;
          continue;
        }
        const pm = ASR_RULES.find((x) => rest.startsWith(x[0] + "_"));
        if (pm) { (perRule[pm[0]] = perRule[pm[0]] || []).push(...(r.list || [r.value])); continue; }
      }
    }
    return {
      rules: ASR_RULES.map(([slug, guid, name]) => ({ slug, guid, name, mode: mode[slug] || null, exclusions: perRule[slug] || [] })),
      set: Object.keys(mode).length,
      exclusions: excl.filter(Boolean),
    };
  }
  async function readSettings(policyId) {
    const rows = await Graph.readAll(`${Graph.BETA}/deviceManagement/configurationPolicies/${encodeURIComponent(policyId)}/settings?$expand=settingDefinitions&$top=1000`, { scopes: S().config, retry: true });
    return flattenSettings(rows);
  }

  // ---- exports ----
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  function meta() {
    return { when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "") };
  }
  function markdown(rep, m) {
    const L = [];
    L.push("# Firewall & ASR coverage", "");
    L.push(`Generated ${m.when} by TUNO ${m.build}`, "");
    if (rep.policyError) {
      L.push(`> **The settings catalog could not be read** — ${mdCell(rep.policyError)}. Everything below is unknown, not zero.`, "");
      return L.join("\n");
    }
    L.push(rep.deviceCount === null
      ? `> The Windows device count could not be read${rep.deviceCountError ? ` — ${mdCell(rep.deviceCountError)}` : ""}: the denominator is unknown, not zero.`
      : `**${rep.deviceCount} Windows devices enrolled.** A gap below is that many machines on local defaults.`, "");
    L.push(`## Coverage per discipline`, "", `| Discipline | Verdict | Policies | Covering |`, `|---|---|---|---|`);
    for (const [d, v] of Object.entries(rep.disciplines)) {
      if (!v.core) continue;
      const verdict = v.verdict === "covered" ? (v.viaLegacy ? "covered (legacy intent only)" : "covered")
        : v.verdict === "unassigned" ? "**GAP — policies exist, none reaches anybody**" : "**GAP — no policy**";
      L.push(`| ${d} | ${verdict} | ${v.policies} | ${v.covering} |`);
    }
    L.push("");
    const extras = Object.entries(rep.disciplines).filter(([, v]) => !v.core && v.policies);
    if (extras.length) {
      L.push(`Also present: ${extras.map(([d, v]) => `${d} (${v.covering}/${v.policies} covering)`).join(", ")}.`, "");
    }
    L.push(`## Every endpoint security policy`, "", `| Policy | Discipline | Source | Reach | Configured on | Note |`, `|---|---|---|---|---|---|`);
    for (const r of rep.policies) {
      const reach = r.counts ? (r.reach.tenantWide ? "tenant-wide" : `${r.reach.includes} include${r.reach.includes === 1 ? "" : "s"}${r.reach.excludes ? `, ${r.reach.excludes} exclusions` : ""}`)
        : r.reach.kind === "excludedOnly" ? "**reaches nobody — exclusions only**" : "**not assigned**";
      const tp = targetPhrase(targetCountOf(r, rep.groupCounts, rep.deviceCount));
      L.push(`| ${mdCell(r.name)} | ${mdCell(r.discipline)} | ${r.source} | ${reach} | ${mdCell(tp) || "—"} | ${mdCell(r.caveat)} |`);
    }
    const read = (rep.policies || []).filter((r) => rep.settingsById && rep.settingsById[r.id]);
    if (read.length) {
      L.push("", `## What the policies configure (${read.length} read)`, "");
      for (const r of read) {
        const st = rep.settingsById[r.id];
        L.push(`### ${mdCell(r.name)}`, "");
        if (st.error) { L.push(`> Settings could not be read — ${mdCell(st.error)}.`, ""); continue; }
        if (/Attack Surface Reduction/i.test(r.discipline)) {
          const a = asrRulesOf(st.rows);
          L.push(`| ASR rule | Mode |`, `|---|---|`);
          for (const x of a.rules) L.push(`| ${mdCell(x.name)} | ${x.mode ? x.mode : "_not set_"}${x.exclusions.length ? ` (exclusions: ${mdCell(x.exclusions.join(", "))})` : ""} |`);
          if (a.exclusions.length) L.push("", `ASR-only exclusions: ${mdCell(a.exclusions.join(", "))}`);
          L.push("");
        }
        L.push(`| Setting | Value |`, `|---|---|`);
        for (const x of st.rows) L.push(`| ${"&nbsp;&nbsp;".repeat(Math.min(x.depth, 4))}${mdCell(x.name)} | ${mdCell(x.value)} |`);
        L.push("");
      }
    }
    L.push("", `---`,
      `Coverage means at least one policy that is assigned AND reaches somebody by construction — no include and no tenant-wide target is nobody, exclusions only is nobody. "Configured on" is group MEMBERSHIP, not per-device applicability: sums across groups may double-count, exclusions are not subtracted, a filter caps reach at "may", and whether an included group is empty is the 🩺 Assignment health tool's finding.`);
    return L.join("\n");
  }
  function csv(rep) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["policy,discipline,source,template,platforms,assignments,reachKind,includes,exclusions,tenantWide,filtered,countsAsCoverage,configuredOn,note"];
    for (const r of rep.policies || []) {
      const tp = targetPhrase(targetCountOf(r, rep.groupCounts, rep.deviceCount));
      L.push([q(r.name), q(r.discipline), q(r.source), q(r.template), q(r.platforms),
        r.assignments === null ? "" : r.assignments, r.reach.kind, r.reach.includes, r.reach.excludes,
        String(r.reach.tenantWide), String(r.reach.filtered), String(r.counts), q(tp), q(r.caveat)].join(","));
    }
    return L.join("\n");
  }

  return { CORE, ASR_RULES, disciplineOf, disciplineOfTemplateName, reachOf, includeGroupIdsOf, targetCountOf, targetPhrase, report, markdown, csv, meta,
    flattenSettings, asrRulesOf, readSettings };
})();


// ======================================================================
// T16 — the screen. Engine above is DOM-free for the headless suite.
// ======================================================================
const EndpointSecTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let rep = null, running = false, discFilter = null;
  const open = new Set();   // fold state keyed on policy ids — the T03 rule
  const loading = new Set(); // policies whose settings are being read right now (10559)

  // WHAT IT CONFIGURES (10559): read at the click, once per policy, and
  // kept on the report so the export carries it. A legacy intent has no
  // settings-catalog body to read and says so.
  async function loadSettings(id) {
    if (!rep || rep.settingsById[id] || loading.has(id)) return;
    const row = (rep.policies || []).find((r) => r.id === id);
    if (!row || row.source !== "Settings catalog") return;
    loading.add(id);
    render();
    try {
      rep.settingsById[id] = { rows: await EndpointSec.readSettings(id), error: null };
    } catch (e) {
      rep.settingsById[id] = { rows: [], error: String((e && e.message) || e).slice(0, 200) };
    } finally { loading.delete(id); render(); }
  }
  async function loadAllSettings() {
    if (!rep || running) return;
    const todo = (rep.policies || []).filter((r) => r.source === "Settings catalog" && !rep.settingsById[r.id]);
    if (!todo.length) return;
    running = true;
    try {
      todo.forEach((r) => loading.add(r.id));
      render();
      prog(`Reading what ${todo.length} polic${todo.length === 1 ? "y" : "ies"} configure…`);
      const res = await Graph.pool(todo, (r) => EndpointSec.readSettings(r.id), 4);
      for (const x of res) {
        rep.settingsById[x.item.id] = x.error
          ? { rows: [], error: String((x.error && x.error.message) || x.error).slice(0, 200) }
          : { rows: x.value, error: null };
      }
    } finally { todo.forEach((r) => loading.delete(r.id)); running = false; prog(""); render(); }
  }

  // The "what it configures" block inside a fold.
  function settingsHtml(r) {
    if (r.source !== "Settings catalog") return `<p class="mini muted" style="margin:8px 0 0">A legacy intent carries no settings-catalog body — what it configures is read in the portal's template, not here.</p>`;
    const st = rep.settingsById[r.id];
    if (loading.has(r.id)) return `<p class="mini muted" style="margin:8px 0 0">Reading what it configures…</p>`;
    if (!st) return `<p class="mini muted" style="margin:8px 0 0">What it configures has not been read — <button class="btn sm" data-fwread="${esc(r.id)}">⚙ Read the settings</button></p>`;
    if (st.error) return `<div class="gu-fail" style="margin-top:8px"><b>What it configures could not be read.</b><span class="why">${esc(st.error)} — unknown, not empty.</span></div>`;
    const isAsr = /Attack Surface Reduction/i.test(r.discipline);
    let asr = "";
    if (isAsr) {
      const a = EndpointSec.asrRulesOf(st.rows);
      const modeChip = (m) => !m ? `<span class="muted">not set</span>`
        : m === "Block" ? `<span class="au-op create">Block</span>`
        : m === "Warn" ? `<span class="gu-how priv">Warn</span>`
        : m === "Audit" ? `<span class="gu-how">Audit</span>`
        : m === "Off" ? `<span class="au-op delete">Off</span>` : `<span class="gu-how">${esc(m)}</span>`;
      asr = `<h5 class="mini" style="margin:10px 0 4px">ASR rules — ${a.set} of ${a.rules.length} set${a.exclusions.length ? ` · ${a.exclusions.length} ASR-only exclusion${a.exclusions.length === 1 ? "" : "s"}` : ""}</h5>
        <div class="gu-tw"><table class="cg-table"><thead><tr><th>Rule</th><th style="width:90px">Mode</th></tr></thead><tbody>
        ${a.rules.map((x) => `<tr${x.mode ? "" : ' class="muted"'}><td class="mini">${esc(x.name)}${x.exclusions.length ? `<div class="mini muted">excluded: ${esc(x.exclusions.join(", "))}</div>` : ""}</td><td>${modeChip(x.mode)}</td></tr>`).join("")}
        </tbody></table></div>
        ${a.exclusions.length ? `<p class="mini muted" style="margin:6px 0 0">ASR-only exclusions: ${esc(a.exclusions.join(", "))}</p>` : ""}`;
    }
    const rows = st.rows;
    const table = rows.length ? `<h5 class="mini" style="margin:10px 0 4px">${isAsr ? "Every setting in the policy" : "What it configures"} — ${rows.length} row${rows.length === 1 ? "" : "s"}</h5>
      <div class="gu-tw"><table class="cg-table"><thead><tr><th>Setting</th><th style="width:34%">Value</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td class="mini" style="padding-left:${8 + Math.min(x.depth, 4) * 14}px" title="${esc(x.defId)}">${esc(x.name)}</td><td class="mini">${esc(x.value)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="mini muted" style="margin:8px 0 0">The policy carries no settings — it configures nothing.</p>`;
    return asr + table;
  }

  function prog(msg) { TunoProgress.show("fwBody", "fwProg", msg); }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function showExports(on) { ["fwMd", "fwCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); }

  async function run() {
    if (running) return;
    running = true; $("fwRun").disabled = true; showExports(false); $("fwBody").innerHTML = ""; open.clear(); discFilter = null;
    try {
      // groups joined at 10535: the member counts ride Graph.memberCount
      // (Group.Read.All) — asked here, at the click, never at sign-in.
      await Graph.ensureScopes([...new Set([...Graph.SCOPES.config, ...Graph.SCOPES.devices, ...Graph.SCOPES.groups])]);
      rep = await EndpointSec.report({ onStatus: prog });
      prog("");
      render();
      showExports(!rep.policyError);
    } catch (e) {
      $("fwBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
      prog("");
    } finally { running = false; $("fwRun").disabled = false; }
  }

  function render() {
    const parts = [];
    if (rep.policyError) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>The settings catalog could not be read.</b><span class="why">${esc(rep.policyError)} — everything on this page is unknown, not zero.</span></div></div>`);
      $("fwBody").innerHTML = parts.join("");
      return;
    }

    // THE RAIL (10541, the layout round — Option A): the discipline cards
    // become the nav, exactly the survey's suggestion — this tool is
    // literally T20's subject. One node per core discipline (plus any
    // extra discipline the tenant actually has), verdict worn as the
    // node's colour and title, the list beside it never buries the jump
    // back. Same data-fwdisc contract; the All node clears.
    const node = (d) => {
      const v = rep.disciplines[d] || { policies: 0, covering: 0, verdict: "none" };
      const label = v.verdict === "covered" ? (v.viaLegacy ? "covered — legacy intent only" : "covered")
        : v.verdict === "unassigned" ? "GAP — policies exist, none reaches anybody" : "GAP — no policy";
      const bad = v.verdict !== "covered";
      return `<div class="ep-node${discFilter === d ? " active" : ""}" data-fwdisc="${esc(d)}" role="button" tabindex="0" title="${esc(label)}">
        <span>${esc(d)}</span>
        <span class="mini" style="margin-left:auto;white-space:nowrap${bad ? ";color:var(--off)" : ""}">${bad && !v.policies ? "GAP" : `${v.covering}<span class="muted">/${v.policies}</span>`}</span></div>`;
    };
    const extras = Object.keys(rep.disciplines).filter((d) => !EndpointSec.CORE.includes(d) && rep.disciplines[d].policies);
    const rail = `<div class="ep-node${discFilter === null ? " active" : ""}" data-fwdisc="" role="button" tabindex="0">
        <span>🛡 All disciplines</span><span class="mini" style="margin-left:auto">${(rep.policies || []).length}</span></div>
      <p class="mini muted" style="margin:2px 10px 6px">covering / policies — red is a gap</p><hr>`
      + EndpointSec.CORE.map(node).join("")
      + (extras.length ? "<hr>" + extras.map(node).join("") : "");

    const gaps = EndpointSec.CORE.filter((d) => (rep.disciplines[d] || {}).verdict !== "covered");
    if (gaps.includes("Firewall") || gaps.includes("Attack Surface Reduction")) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>Firewall or ASR has no covering policy${rep.deviceCount !== null ? ` — ${rep.deviceCount} Windows devices are running on local defaults` : ""}.</b><span class="why">Covering means assigned AND reaching somebody by construction. ${rep.deviceCount === null ? `The device count could not be read — the denominator is unknown, not zero.` : ""}</span></div></div>`);
    } else if (rep.deviceCount !== null) {
      parts.push(`<div class="list-card"><p class="mini muted" style="margin:0"><b>${rep.deviceCount} Windows devices enrolled.</b> Coverage means at least one policy that is assigned and reaches somebody by construction — per-device applicability is not evaluated, a filter caps reach at "may", and whether an included group is empty is the 🩺 Assignment health tool's finding.</p></div>`);
    }
    if (rep.deviceCountError) {
      parts.push(`<div class="list-card"><p class="mini muted" style="margin:0">The Windows device count could not be read — ${esc(rep.deviceCountError)}. The denominator is unknown, not zero.</p></div>`);
    }
    if (rep.intentsError) {
      parts.push(`<div class="list-card"><p class="mini muted" style="margin:0">Legacy intents could not be read — ${esc(rep.intentsError)}. Older tenants keep endpoint security there; that surface is unknown, not empty.</p></div>`);
    }
    if (rep.templatesError) {
      parts.push(`<div class="list-card"><p class="mini muted" style="margin:0">Intent templates could not be read — ${esc(rep.templatesError)}. Legacy intents are listed unclassified and count toward nothing.</p></div>`);
    }

    const look = rep.names && rep.names.entry ? rep.names : null;
    const shown = (rep.policies || []).filter((r) => !discFilter || r.discipline === discFilter);
    const rows = shown.map((r) => {
      const isOpen = open.has(r.id);
      const badge = r.counts ? `<span class="au-op create">${r.reach.tenantWide ? "tenant-wide" : "assigned"}</span>`
        : r.reach.kind === "excludedOnly" ? `<span class="au-op delete">reaches nobody</span>`
        : `<span class="au-op delete">not assigned</span>`;
      // The number Mihai asked for, worn on the row: on how many devices is
      // this configured — as group membership, with its limits in the fold.
      const tgt = EndpointSec.targetCountOf(r, rep.groupCounts, rep.deviceCount);
      const tp = EndpointSec.targetPhrase(tgt);
      const tgtChip = tp ? ` <span class="gu-how ok" title="Group membership, not per-device applicability — open the row for the arithmetic's limits">${esc(tgt.kind === "fleet" && tgt.n !== null ? `${tgt.n} devices` : tgt.kind === "members" ? `≈${tgt.n}${tgt.floor ? "+" : ""} members` : tgt.kind === "allUsers" ? "all users" : "count unknown")}</span>` : "";
      const head = `<div class="au-ev-h">
          <b>${esc(r.name)}</b> ${badge}${tgtChip}
          ${r.source === "Legacy intent" ? `<span class="gu-how exc">legacy intent</span>` : ""}
          ${r.reach.filtered ? `<span class="gu-how priv" title="An assignment filter is in the way — reach is may, not is">filtered</span>` : ""}
          ${r.reach.filteredExclusion ? `<span class="gu-how priv" title="A filter narrows an EXCLUSION on this policy — fewer devices are kept out than the exclusion suggests. It does not cap reach, which is why it is its own chip">filtered exclusion</span>` : ""}
          <span class="au-when mini muted">${esc(r.discipline)}</span>
        </div>
        <div class="mini muted au-ev-m">${esc(r.template)}${r.caveat ? ` · ${esc(r.caveat)}` : ""} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>`;
      const groups = r.groupIds.map((id) => {
        const e = look && look.entry(id);
        const name = e ? esc(e.name) : `<code>${esc(id)}</code>`;
        const c = rep.groupCounts ? rep.groupCounts[id] : undefined;
        // Only include groups were counted; an exclusion group carries no
        // number here on purpose. A 0 prints — an empty include group is
        // T09's finding, worth seeing where the target is named.
        return typeof c === "number" ? `${name} <span class="muted">· ${c} member${c === 1 ? "" : "s"}</span>`
          : c === null ? `${name} <span class="muted">· count unreadable</span>` : name;
      });
      const detail = !isOpen ? "" : `<div class="au-detail">
        <div class="au-detail-grid mini">
          <span class="muted">Source</span><span>${esc(r.source)}</span>
          <span class="muted">Template</span><span>${esc(r.template) || "—"}</span>
          ${r.platforms ? `<span class="muted">Platforms</span><span>${esc(r.platforms)}</span>` : ""}
          <span class="muted">Reach</span><span>${r.assignments === null
            ? "the legacy surface says only assigned or not — no assignment detail"
            : `${r.reach.includes} include${r.reach.includes === 1 ? "" : "s"} · ${r.reach.excludes} exclusion${r.reach.excludes === 1 ? "" : "s"}${r.reach.tenantWide ? " · tenant-wide" : ""}${r.reach.filtered ? " · filtered (may, not is)" : ""}${r.reach.filteredExclusion ? " · a filter narrows an exclusion" : ""}`}</span>
          ${groups.length ? `<span class="muted">Groups</span><span>${groups.join(", ")}${rep.nameError ? ` <span class="muted">(names unresolved — ${esc(rep.nameError)})</span>` : ""}</span>` : ""}
          ${tp ? `<span class="muted">Configured on</span><span>${esc(tp)} <span class="muted">— group membership, not per-device applicability: exclusions are not subtracted${r.reach.filtered ? ", and the assignment filter caps this at may" : ""}</span></span>` : ""}
        </div>
        ${settingsHtml(r)}
      </div>`;
      const cls = r.counts ? "ok" : "bad";
      return `<div class="au-fold ${cls} ${isOpen ? "open" : ""}" data-fwfold="${esc(r.id)}"><div class="au-ev-card">${head}${detail}</div></div>`;
    }).join("");

    parts.push(`<div class="list-card">
      <h4 style="margin:0 0 4px">Endpoint security policies (${shown.length}${discFilter ? ` — ${esc(discFilter)}` : ""})</h4>
      <p class="mini muted" style="margin:0 0 10px">Grouped by discipline — click a policy for its assignments and <b>what it configures</b> (an ASR policy lists every rule with its mode, unset ones included). A policy whose only assignments are exclusions, or that has none, reaches nobody by construction and does not count as coverage.
        ${(() => { const sc = shown.filter((r) => r.source === "Settings catalog"); const done = sc.filter((r) => rep.settingsById[r.id]).length; return sc.length && done < sc.length ? `<button class="btn sm" id="fwReadAll" style="margin-left:6px">⚙ Read what ${discFilter ? "these" : "all"} ${sc.length - done} configure</button>` : sc.length ? `<span class="muted">· settings read for every policy shown — the Markdown export carries them</span>` : ""; })()}</p>
      ${rows || `<p class="mini muted" style="margin:0">No endpoint security policies${discFilter ? " in this discipline" : ""} — which is itself the finding.</p>`}
    </div>`);

    $("fwBody").innerHTML = `<div class="ep-wrap"><div class="ep-rail">${rail}</div><div class="ep-main">${parts.join("")}</div></div>`;
    $("fwBody").querySelectorAll("[data-fwdisc]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.fwdisc;
      discFilter = (!k || discFilter === k) ? null : k;
      render();
    }));
  }

  function exportAs(fmt) {
    const m = EndpointSec.meta();
    if (fmt === "md") return download("Firewall-ASR-coverage.md", EndpointSec.markdown(rep, m), "text/markdown");
    return download("Firewall-ASR-coverage.csv", EndpointSec.csv(rep), "text/csv");
  }

  function init() {
    if (!$("fwRun")) return;
    $("fwRun").addEventListener("click", run);
    $("fwMd").addEventListener("click", () => exportAs("md"));
    $("fwCsv").addEventListener("click", () => exportAs("csv"));
    $("fwBody").addEventListener("click", (e) => {
      if (e.target.closest("#fwReadAll")) { loadAllSettings(); return; }
      const rb = e.target.closest("[data-fwread]");
      if (rb) { loadSettings(rb.dataset.fwread); return; }
      const f = e.target.closest("[data-fwfold]");
      if (!f || e.target.closest("a,code,button")) return;
      const id = f.dataset.fwfold;
      open.has(id) ? open.delete(id) : open.add(id);
      render();
      // opening a settings-catalog policy reads what it configures (10559)
      if (open.has(id)) loadSettings(id);
    });
  }

  return { init, run };
})();

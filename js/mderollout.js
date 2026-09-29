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
  const DEFAULTS = Object.freeze({
    newPrefixes: ["Win - OIB", "WIN-SEC", "WIN-DCP"],
    outPrefixes: ["AVD", "WinServ", "Win-Serv"],
    waves: [
      "PVM-UG-MDE-WAVE-Euro",
      "PVM-UG-MDE-WAVE-Americas",
      "PVM-UG-MDE-WAVE-Asia-Pacific",
      "PVM-UG-MDE-WAVE-Italy",
      "PVM-UG-MDE-WAVE-BAMSCA",
    ],
    waveDescription: "MDE rollout wave — created by TUNO (T28 MDE rollout).",
  });
  const cleanList = (a) => uniq((a || []).map((x) => String(x == null ? "" : x).trim()).filter(Boolean));
  function normConfig(c) {
    const o = c || {};
    return {
      newPrefixes: cleanList(Array.isArray(o.newPrefixes) ? o.newPrefixes : DEFAULTS.newPrefixes),
      outPrefixes: cleanList(Array.isArray(o.outPrefixes) ? o.outPrefixes : DEFAULTS.outPrefixes),
      waves: cleanList(Array.isArray(o.waves) ? o.waves : DEFAULTS.waves),
      waveDescription: String(o.waveDescription == null ? DEFAULTS.waveDescription : o.waveDescription).trim() || DEFAULTS.waveDescription,
    };
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
  function generationOf(name, cfg) {
    const c = cfg || DEFAULTS;
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

  // -------------------------------------------------------- categories --
  // T20's rail nodes are the vocabulary, so a category here reads the same
  // as a discipline in 🧭 Endpoint security posture.
  const CAT_IDS = ["av", "asr", "edr", "fw", "disk", "acct", "appctl", "epm", "edge", "mde", "other"];
  function catMeta(id) {
    const n = (typeof EndpointPosture !== "undefined" && EndpointPosture.nodeById(id)) || null;
    if (n) return { id, icon: n.icon, label: n.label };
    if (id === "other") return { id, icon: "🧩", label: "Other" };
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
      item, raw: raw || {}, sec,
      technologies: lc((raw && raw.technologies) || ""),
      mdeManaged: /microsoftsense/i.test(String((raw && raw.technologies) || "")),
      detailError: item.detailError || null,
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

  function fromCatalog(sec, item, raw, cfg) {
    const nodes = EndpointPosture.classify(item).map((n) => NODE_CAT[n] || n);
    const rows = EndpointSec.flattenSettings((raw && raw.__detail) || []);
    const settings = settingsOf(rows);
    const settingCats = [...settings.values()].map((s) => s.cat);
    // In scope when T20 would list it, or when it configures anything in an
    // MDE category — a settings-catalog BitLocker or WHfB policy collides
    // with the new set as surely as an antivirus one does.
    if (!nodes.length && !settingCats.some((c) => MDE_CATS.has(c))) return null;
    const fam = String(item.templateFamily || "");
    const kind = /^endpointSecurity/i.test(fam)
      ? `Endpoint security · ${EndpointSec.disciplineOf(fam)}`
      : fam === "baseline" ? "Security baseline" : "Settings catalog";
    const p = basePolicy(sec, item, raw, cfg);
    // T20's generic "MDE in settings catalog" node gives way to the specific
    // categories the settings name; it stays only when nothing more exact is known.
    const specific = uniq(nodes.filter((n) => n !== "mde").concat(settingCats.filter((c) => MDE_CATS.has(c))));
    return finish(p, specific.length ? specific : nodes, settings, "catalog", kind);
  }
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
        if (secId === "settingsCatalog") p = fromCatalog(sec, item, raw, cfg);
        else if (secId === "intents") p = fromIntent(sec, item, raw, cfg, templates);
        else if (secId === "deviceConfigurations") p = fromDeviceConfig(sec, item, raw, cfg);
        else if (secId === "admx") p = fromAdmx(sec, item, raw, cfg);
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
  function pairReach(N, O) {
    const rN = N.reach, rO = O.reach;
    if (rO.none) return { verdict: "idle", why: "the old policy has no include and no tenant-wide target — it reaches nobody as assigned" };
    if (rN.none) return { verdict: "staged", why: "the new policy is not assigned yet — the collision waits for its first assignment wherever the old policy still reaches" };
    if (!rN.tenantWide && rN.inc.size && [...rN.inc].every((g) => rO.exc.has(g) || rN.exc.has(g))) {
      return { verdict: "resolved", why: "every group the new policy includes is excluded from the old one" };
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
  function compare(model) {
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
        pairs.push({ id: `${N.key}~${O.key}`, N, O, type, diffs, sames, common, cats, reach: pairReach(N, O) });
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
  const NAME_USER = /(^|[-_ .])(UG|USR|USERS?)([-_ .]|$)/i;
  const NAME_DEVICE = /(^|[-_ .])(DG|DEV|DEVICES?)([-_ .]|$)/i;
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
  function proposalFor(pr, ctx) {
    const c = ctx || {};
    const kinds = c.kinds || new Map();
    const nameOf = (id) => (c.names && c.names.get(lc(id))) || id;
    if (!needsAction(pr)) return { steps: [], none: pr.type === "duplicate" ? "same value on both sides — no device conflict; nothing to exclude" : "no collision to fix" };
    const N = pr.N, O = pr.O;
    if (N.reach.tenantWide) {
      return { steps: [], none: `the new policy targets ${N.reach.inc.size ? "a group and " : ""}the whole tenant (All devices / All users) — there is no group to exclude. Narrow the new policy to waves, or take the old policy's assignment away.` };
    }
    let groups = [...N.reach.inc].filter((g) => !O.reach.exc.has(g));
    let planned = false;
    if (!groups.length && pr.reach.verdict === "staged") {
      groups = (c.waveIds || []).map(lc).filter((g) => !O.reach.exc.has(g));
      planned = true;
      if (!groups.length) return { steps: [], none: "the new policy is not assigned and no wave group exists yet — create the wave groups (🌊) or assign the new policy first" };
    }
    if (!groups.length) return { steps: [], none: "every include group of the new policy is already excluded from the old one" };
    const tk = targetKinds(O, kinds);
    const steps = groups.map((g) => {
      const k = kinds.get(lc(g));
      const gk = k ? k.kind : "unknown";
      const incOnOld = O.reach.inc.has(g);
      const action = incOnOld ? "remove" : "add-exclude";
      const sup = incOnOld ? { ok: true, why: "" } : exclusionSupport(gk, tk);
      const notes = [];
      if (incOnOld) notes.push("the old policy INCLUDES this group — excluding it on top of the include would be a contradiction, so the include is removed instead");
      if (O.mdeManaged && gk === "user") notes.push("the old policy is also delivered by MDE security settings management, which honours DEVICE groups only — a user-group change does not reach MDE-only devices");
      if (planned) notes.push("planned: the new policy is not assigned yet — this is the wave group it is expected to get");
      return { groupId: lc(g), groupName: nameOf(g), action, kind: gk, kindSource: k ? k.source : "not read", supported: sup.ok, why: sup.why, notes, planned };
    });
    return { steps, none: "" };
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
  function waves(model, found, kinds, pairs) {
    return model.cfg.waves.map((name) => {
      const g = found ? found.get(lc(name)) : undefined;
      const id = g ? lc(g.id) : null;
      const newIncluding = id ? model.newP.filter((N) => N.reach.inc.has(id)) : [];
      const oldExcluding = id ? model.oldP.filter((O) => O.reach.exc.has(id)) : [];
      // old policies that collide with a new policy including this wave and
      // do not exclude it yet — the wave's outstanding work
      const pending = id ? uniq((pairs || []).filter((pr) => needsAction(pr) && pr.N.reach.inc.has(id) && !pr.O.reach.exc.has(id)).map((pr) => pr.O)) : [];
      const k = id && kinds ? kinds.get(id) : null;
      return { name, group: g || null, id, exists: !!g, lookedUp: g !== undefined, kind: k ? k.kind : (g ? "unknown" : kindFromName(name)), kindSource: k ? k.source : "name", memberCount: (g && typeof g.memberCount === "number") ? g.memberCount : null, newIncluding, oldExcluding, pending };
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
  // A wave group: a plain ASSIGNED security group, T22's payload rules —
  // no mail, not role-assignable, a mailNickname T22 already sanitises.
  // The create is preceded by a fresh by-name check (somebody may have made
  // it since the read) and followed by a read-back of the new object.
  async function createWave(name, description) {
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
    const created = await Graph.post("/groups", payload, { scopes: GroupMigrate.SCOPES.groupWrite });
    if (!created || !created.id) throw new Error("the create call returned no group id");
    let verified = false, verifyError = "";
    try {
      const back = await Graph.readOne(`/groups/${encodeURIComponent(created.id)}?$select=id,displayName,securityEnabled,mailEnabled`, { scopes: Graph.SCOPES.groups });
      verified = !!back && lc(back.displayName) === lc(name) && back.securityEnabled === true;
      if (!verified) verifyError = "the read-back does not match what was sent";
    } catch (e) { verifyError = "created, but the read-back failed: " + ((e && e.message) || e); }
    return { created: true, group: created, verified, verifyError };
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
    L.push(`## Wave groups (${waveRows.length})`);
    L.push("");
    L.push("| Wave group | Exists | Kind | New policies including it | Old policies still to exclude it |");
    L.push("|---|---|---|---|---|");
    for (const w of waveRows) L.push(`| ${mdCell(w.name)} | ${w.exists ? "yes" : "NO"} | ${mdCell(w.kind)} | ${w.newIncluding.length} | ${w.pending.length} |`);
    L.push("");
    L.push(`## New policies (${model.newP.length})`);
    L.push("");
    L.push("| Policy | Kind | Categories | Assignments |");
    L.push("|---|---|---|---|");
    for (const P of model.newP) L.push(`| ${mdCell(P.name)} | ${mdCell(P.kind)} | ${mdCell(P.cats.map((c) => catMeta(c).label).join(", "))} | ${mdCell(assignText(P))} |`);
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
        ? pr.proposal.steps.map((s) => `${s.action === "remove" ? "remove include" : "exclude"} ${s.groupName}${s.supported === false ? " (NOT SUPPORTED: " + s.why + ")" : ""}`).join("; ")
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
      const fix = pr.proposal ? (pr.proposal.steps.map((s) => `${s.action === "remove" ? "remove include" : "exclude"} ${s.groupName}${s.supported === false ? " (not supported)" : ""}`).join("; ") || pr.proposal.none) : "";
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
    kindFromName, kindOfGroup, targetKinds, exclusionSupport, proposalFor,
    RETIRE, retirement, waves, composePlan, undoPlan, patchAssignments,
    readTemplates, findGroups, readKinds, readFresh, createWave, readLabels, labelValue, labelName,
    markdown, csv, assignText,
  };
})();


// ======================================================================
// T28 — the screen (layout B, Mihai's pick off the 10632 mockup): a rail,
// one pane per job. The GATES live here, the T11 way: a plan is cut from a
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
  const open = new Set();      // expanded rows
  let plan = null;             // composed plan + meta
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
    pairs = M.compare(model);
    const waveIds = found ? [...found.values()].filter(Boolean).map((g) => lc(g.id)) : [];
    const ctx = { kinds, waveIds, names };
    pairs.forEach((pr) => { pr.proposal = M.proposalFor(pr, ctx); });
    retire = M.retirement(model);
    waveRows = M.waves(model, found, kinds, pairs);
    // selections that no longer exist are dropped, never silently kept
    for (const k of [...sel]) if (!model.byKey.has(k)) sel.delete(k);
    for (const id of [...selPairs]) if (!pairs.some((p) => p.id === id && M.needsAction(p))) selPairs.delete(id);
  }

  // -------------------------------------------------------------- run --
  async function run(attach) {
    if (running) return;
    running = true; $("mrRun").disabled = true;
    try {
      loadCfg();
      if (!attach) { $("mrBody").innerHTML = ""; clearPlan(); }
      if (attach && PolicyCache.reading()) res = await PolicyCache.read(prog);
      else if (attach && PolicyCache.get()) res = PolicyCache.get();
      else {
        await Graph.ensureScopes([...new Set([...PolicyCache.scopesNeeded(), ...Graph.SCOPES.groups])]);
        res = await PolicyCache.refresh(prog);
      }
      prog("Reading the legacy endpoint security templates…");
      try { templates = await M.readTemplates(); } catch { templates = new Map(); }
      prog("Looking up the wave groups…");
      try { const f = await M.findGroups(cfg.waves, prog); found = f.found; dupes = f.dupes; } catch { found = null; dupes = []; }
      derive();
      prog("");
      render();
      showExports(true);
      // Kinds and setting names follow the first paint: the lists are
      // useful at once, and the proposals sharpen when the kinds land.
      await enrich();
    } catch (e) {
      prog("");
      $("mrBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div></div>`;
    } finally { running = false; $("mrRun").disabled = false; }
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

  function showExports(on) { ["mrMd", "mrCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); }
  function onShow() {
    if (model || running) return;
    if (PolicyCache.get() || PolicyCache.reading()) run(true);
  }
  function reset() {
    res = null; model = null; pairs = []; retire = []; waveRows = []; found = null; dupes = [];
    kinds = new Map(); labels = new Map(); names.clear(); sel.clear(); selPairs.clear(); selWaves.clear(); open.clear();
    runs.length = 0; filterList = null; clearPlan();
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
  const polLink = (P) => `<a href="#" data-mropen="${esc(P.key)}" title="Open the policy — settings and assignments">${esc(P.name)}</a>`;

  // ------------------------------------------------------------- rail --
  function railHtml() {
    const act = pairs.filter(M.needsAction);
    const gaps = retire.filter((r) => r.verdict === "gap").length;
    const missing = waveRows.filter((w) => w.lookedUp && !w.exists).length;
    const node = (id, icon, label, n, bad) => `<div class="ep-node${pane === id ? " active" : ""}" data-mrpane="${id}" role="button" tabindex="0">
      <span>${icon} ${esc(label)}</span>${n !== null && n !== undefined ? `<span class="ep-n${bad ? " gap" : ""}">${esc(n)}</span>` : ""}</div>`;
    return [
      node("new", "🎯", "New policies", model.newP.length),
      node("conflicts", "⚔️", "Conflicts with old", act.length, act.length > 0),
      node("old", "🗄", "Old policies", model.oldP.length),
      node("retire", "🧹", "Retirement check", gaps ? `${gaps} gap${gaps === 1 ? "" : "s"}` : "✓", gaps > 0),
      node("waves", "🌊", "Wave groups", missing ? `${missing} missing` : waveRows.length, missing > 0),
      "<hr>",
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
        <td><b>${polLink(P)}</b><div class="mini muted">${genChip(P)} ${esc(P.kind)}${P.mdeManaged ? ` · <span title="Also delivered by MDE security settings management — device groups only, no filters">🛰 MDE-managed</span>` : ""}${P.detailError ? ` · <span style="color:var(--off)">settings unreadable</span>` : ""}</div></td>
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
      out: `Out of scope by name (${cfg.outPrefixes.map((p) => `<b>${esc(p)}</b>`).join(", ")}) — listed so nothing is hidden, never compared, never proposed. The ⚙️ pane changes the rule.`,
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
  function proposalHtml(pr) {
    const p = pr.proposal;
    if (!p) return "";
    if (!p.steps.length) return `<span class="mini muted">${esc(p.none)}</span>`;
    return p.steps.map((s) => {
      const verb = s.action === "remove" ? "remove include" : "exclude";
      const cls = s.supported === false ? "au-op delete" : s.action === "remove" ? "au-op update" : "gu-how exc";
      const tk = [...M.targetKinds(pr.O, kinds)].filter((k) => k !== "empty").join("/") || "unknown";
      const warn = s.supported === false ? `<div class="mini" style="color:var(--off)" title="${esc(s.why)}">✖ not supported — ${esc(s.kind)} group vs a ${esc(tk)}-targeted policy <span style="cursor:help">ⓘ</span></div>`
        : s.supported === null ? `<div class="mini" style="color:var(--report)" title="${esc(s.why)}">⚠ kind not certain <span style="cursor:help">ⓘ</span></div>` : "";
      const notes = s.notes.length ? `<div class="mini muted">${s.notes.map((n) => /^planned/.test(n) ? "planned wave" : /contradiction/.test(n) ? "old policy includes it → include removed" : /MDE security settings/.test(n) ? "🛰 device groups only" : n).map((n, i) => `<span title="${esc(s.notes[i])}">${esc(n)}</span>`).join(" · ")}</div>` : "";
      return `<div style="margin:2px 0">${chip(cls, `${s.action === "remove" ? "−" : "⊘"} ${verb} ${s.groupName}`)} <span class="mini muted">${esc(s.kind)} group</span>${warn}${notes}</div>`;
    }).join("");
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
      const fixable = list.filter((pr) => M.needsAction(pr) && pr.proposal && pr.proposal.steps.some((s) => s.supported !== false));
      const allOn = fixable.length && fixable.every((pr) => selPairs.has(pr.id));
      const tk = [...M.targetKinds(O, kinds)].join(" + ") || "no includes";
      const head = `<tr class="mr-oldhead"><td style="width:26px">${fixable.length ? `<input type="checkbox" data-mrpairall="${esc(O.key)}"${allOn ? " checked" : ""} aria-label="select every fix on this old policy">` : ""}</td>
        <td colspan="4"><b>${polLink(O)}</b> ${genChip(O)} <span class="mini muted">${esc(O.kind)} · targets: ${esc(tk)}${O.mdeManaged ? " · 🛰 MDE-managed" : ""}</span>
        <div class="mini" style="margin-top:4px">${assignChips(O)}</div></td></tr>`;
      const rows = list.map((pr) => {
        const canFix = M.needsAction(pr) && pr.proposal && pr.proposal.steps.some((s) => s.supported !== false);
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
        <p class="mini muted" style="margin:0 0 6px">Old policies that set a setting a new policy sets — grouped by the old policy, because that is where the fix is written. The proposed fix excludes the new policy's include groups from the old policy, so those devices take the new settings alone. Tick fixes and use the bar: <b>② Dry run</b> reads the policies fresh and shows every change before anything is written.</p>
        ${unsupported ? `<p class="mini" style="margin:0 0 6px;color:var(--off)">✖ ${plural(unsupported, "collision")} can only be fixed with an exclusion Intune does not support (user group ↔ device group). Those steps are shown, never written — use a device wave group, or an assignment filter on the new policy.</p>` : ""}
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
    const rows = waveRows.map((w) => {
      const dup = dupes.find((d) => lc(d.name) === lc(w.name));
      const status = !w.lookedUp ? `<span class="muted">not looked up</span>`
        : dup ? chip("au-op delete", `${dup.count} groups share this name`)
        : w.exists ? chip("au-op create", "exists") : chip("gu-how priv", "missing");
      const pick = w.lookedUp && !w.exists ? `<input type="checkbox" data-mrwave="${esc(w.name)}"${selWaves.has(w.name) ? " checked" : ""} aria-label="create this group">` : "";
      const k = w.id ? kinds.get(w.id) : null;
      const members = k && (k.users != null || k.devices != null) ? `${k.users || 0} users · ${k.devices || 0} devices` : "";
      return `<tr><td style="width:26px">${pick}</td>
        <td><b>${esc(w.name)}</b><div class="mini muted">${w.id ? `<code data-selall>${esc(w.id)}</code>` : ""}</div></td>
        <td>${status}</td>
        <td class="mini">${esc(w.kind)}${w.kindSource && w.kindSource !== "members" ? ` <span class="muted">(${esc(w.kindSource)})</span>` : ""}${members ? `<div class="muted">${esc(members)}</div>` : ""}</td>
        <td class="mini">${w.exists ? `${w.newIncluding.length} / ${model.newP.length}${w.newIncluding.length < model.newP.length ? ` · <a href="#" data-mrwaveinc="${esc(w.name)}">include in the rest →</a>` : ""}` : "—"}</td>
        <td class="mini">${w.exists ? (w.pending.length ? (() => {
          const fixable = new Set(pairs.filter((pr) => M.needsAction(pr) && pr.N.reach.inc.has(w.id) && pr.proposal && pr.proposal.steps.some((st) => st.groupId === w.id && st.supported !== false)).map((pr) => pr.O.key)).size;
          return `${plural(w.pending.length, "old policy", "old policies")}${fixable ? ` · <a href="#" data-mrwavefix="${esc(w.id)}">select the ${fixable} fixable →</a>` : ""}${fixable < w.pending.length ? `<div style="color:var(--off)">${w.pending.length - fixable} need a device-group wave or a filter</div>` : ""}`;
        })() : `<span class="muted">none</span>`) : "—"}</td></tr>`;
    }).join("");
    const nSel = selWaves.size;
    const userWaves = waveRows.filter((w) => w.kind === "user").length;
    return `<div class="list-card" style="margin-top:0">
      <p class="mini muted" style="margin:0 0 10px">The rollout's wave groups, from the ⚙️ naming rules. A missing one can be created here as an <b>assigned (static) security group</b> — empty, not mail-enabled, not role-assignable — the same payload T22 creates. Membership is yours to fill (Entra, or 🔄 T22). Each group is looked up again by name right before it is created, so a group made meanwhile is never made twice.</p>
      ${userWaves ? `<p class="mini" style="margin:0 0 10px;color:var(--report)">⚠ ${plural(userWaves, "wave is a USER group", "waves are USER groups")}. Including them in a new policy is fine. Excluding them from an old policy is only supported when that old policy targets USER groups too — against device groups or All devices, Intune does not exclude those users' devices (Microsoft Learn, assignment support matrix). The ⚔️ pane refuses those steps.</p>` : ""}
      <div style="overflow-x:auto"><table class="cg-table"><thead><tr><th></th><th>Wave group</th><th>Status</th><th>Kind</th><th>New policies including it</th><th>Old policies still to exclude it</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="tb-actions" style="margin-top:12px">
        <label class="chk" style="margin:0"><input type="checkbox" id="mrWaveOk"${nSel ? "" : " disabled"}> Create ${plural(nSel, "group")} in this tenant</label>
        <button class="btn primary" id="mrWaveCreate" disabled>🌊 Create the selected wave groups</button>
      </div>
      <p class="mini muted" style="margin:8px 0 0">Asks for Group.ReadWrite.All at this click (T22's scope). Description: “${esc(cfg.waveDescription)}”.</p>
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
        <p class="mini" style="margin:0 0 6px">${r.ok} written &amp; verified · ${r.bad} not clean${r.stopped ? " · stopped early" : ""}${r.kind === "groups" ? "" : ` · ${plural(r.backup.policies.length, "policy", "policies")} in the backup`}</p>
        <ul class="mini" style="margin:0 0 8px;padding-left:18px">${r.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        ${r.kind === "groups" ? "" : `<div class="tb-actions"><button class="btn" data-mrrunbk="${idx}">⭳ Backup file</button><button class="btn" data-mrundo="${idx}">↶ Undo this run — plan it</button></div>`}
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
        <label class="wi-f"><span>🌊 Wave groups — exact names</span>${ta("mrRuleWaves", cfg.waves)}</label>
      </div>
      <label class="wi-f" style="margin-top:12px"><span>Description for a wave group this tool creates</span><input id="mrRuleDesc" value="${esc(cfg.waveDescription)}"></label>
      <div class="tb-actions" style="margin-top:12px">
        <button class="btn primary" id="mrRuleSave">Save and re-sort</button>
        <button class="btn" id="mrRuleReset">Back to the defaults</button>
      </div>
      <p class="mini muted" id="mrRuleMsg" style="margin:8px 0 0">Now: ${count("new")} new · ${count("old")} old · ${count("retiring")} TO-BE-REMOVED · ${count("out")} out of scope.</p>
    </div>`;
  }

  function howPane() {
    return `<div class="list-card" style="margin-top:0"><div class="mini" style="line-height:1.55">
      <p style="margin:0 0 8px"><b>The read.</b> The shared policy read (settings catalog, legacy endpoint security intents, device configurations, administrative templates) — the same one T05, T11, T19 and T26 use — plus the legacy templates' names, the wave groups by name, and each involved group's kind. In scope is what 🧭 T20 classifies as endpoint security, MDE or Edge, plus any policy setting an MDE-area setting (BitLocker, WHfB, App Control…), and custom OMA-URIs under those CSPs.</p>
      <p style="margin:0 0 8px"><b>Collisions.</b> A new and an old policy collide when both set the same setting (the settingDefinitionId; ASR per rule — a one-rule WIN-SEC policy meets that rule inside an old all-rules policy, including the old "guid=mode" string form). <b>Different value</b> is a conflict Intune reports on the device and resolves by applying neither; <b>same value</b> is double management, harmless until one side changes. A legacy template or ADMX cannot be compared setting by setting and meets the new set by category (<b>other format</b>). Reach is 🔗 T12's verdict — <b>can</b> (shared group or tenant-wide), <b>may</b> (different groups, or a filter), plus <b>staged</b> (the new policy is not assigned yet) and <b>resolved</b> (every group the new policy includes is already excluded from the old one).</p>
      <p style="margin:0 0 8px"><b>The fix.</b> Exclude the new policy's include groups from the old policy. Where the old policy already includes that group, the include is removed instead (an exclusion on an include is a contradiction). Where the new policy is not assigned yet, the existing wave groups are proposed, marked planned.</p>
      <p style="margin:0 0 8px"><b>What is refused.</b> Intune does not support excluding user groups from a policy assigned to device groups, or the reverse — "Intune doesn't evaluate user-to-device group relationships" (<a href="https://learn.microsoft.com/intune/device-configuration/assign-device-profile#exclude-groups-from-a-policy-assignment" target="_blank" rel="noopener">Microsoft Learn: Assign policies — support matrix</a>). Such a step is shown with its reason and never written. Devices managed by <b>MDE security settings management</b> (not enrolled in Intune) take assignments by device group only, and assignment filters do not apply to them (<a href="https://learn.microsoft.com/defender-endpoint/endpoint-security-policies-configure" target="_blank" rel="noopener">Learn</a>) — flagged as 🛰.</p>
      <p style="margin:0 0 8px"><b>The write.</b> ✏️ T11's engine: a dry run reads every touched policy fresh; ③ the backup file is taken before ④ Apply unlocks; each policy is re-read at apply time and skipped as drifted if somebody changed it meanwhile; every write is read back. Each run lands in 📜 Changes this session with its backup and an undo. Settings are never changed — only assignments, and only by this plan.</p>
      <p style="margin:0"><b>Temporary.</b> Built for one rollout, beta only, never promoted — listed under Help's "Staying on this channel".</p>
    </div></div>`;
  }

  // ------------------------------------------------------------ render --
  function render() {
    if (!model) return;
    const missing = model.missing.length ? `<div class="list-card" style="margin-top:0;margin-bottom:12px"><p class="mini" style="margin:0;color:var(--report)">⚠ Not in this read: ${model.missing.map((m) => `${esc(m.id)} (${esc(m.error)})`).join("; ")} — policies there are not listed or compared.</p></div>` : "";
    const src = PolicyCache.get() === res ? `From ${PolicyCache.fromSignIn() ? "the sign-in read" : "the shared read"} at ${esc(PolicyCache.timeLabel())}. ` : "";
    const head = `<p class="mini muted" style="margin:0 0 10px">${src}${model.newP.length} new · ${model.oldP.length} old · ${model.outP.length} out of scope. An assignment is a target, not proof a device applied the setting.</p>`;
    let main;
    if (pane === "new") main = policyPane(model.newP, "new");
    else if (pane === "old") main = policyPane(model.oldP, "old");
    else if (pane === "out") main = policyPane(model.outP, "out");
    else if (pane === "retire") main = retirePane();
    else if (pane === "waves") main = wavesPane();
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
    $("mrBody").innerHTML = `<div class="ep-wrap"><div class="ep-rail">${railHtml()}</div><div class="ep-main">${missing}${head}${main}<div id="mrPlanSeat"></div></div></div>`;
    if (pl) $("mrPlanSeat").replaceWith(pl);
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
    $("mrGroup").style.display = mode === "fixes" || tgt === "group" ? "" : "none";
    $("mrGroup").placeholder = mode === "fixes" ? "…or exclude this group instead (optional)" : "Group name or object ID…";
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
  function clearPlan() { plan = null; backupTaken = false; if (planEl()) planEl().innerHTML = ""; }
  function planError(msg) { planEl().innerHTML = `<div class="list-card" style="margin-top:12px;padding:16px 18px"><div class="gu-fail"><b>${esc(msg)}</b></div></div>`; }

  async function dryRun() {
    if (busy || !model) return;
    busy = true; clearPlan();
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
        const s = M.exclusionSupport(gk.kind, M.targetKinds(P, kinds));
        if (s.ok === false) notes.push(`✖ ${s.why}`);
        else if (s.ok === null) notes.push(`⚠ ${s.why}`);
      }
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

  async function dryRunFixes() {
    const chosen = pairs.filter((pr) => selPairs.has(pr.id));
    if (!chosen.length) throw new Error("Tick at least one fix.");
    const override = $("mrGroup").value.trim();
    await Graph.ensureScopes([...AssignEdit.READ(), ...Graph.SCOPES.groups]);
    let og = null;
    if (override) {
      const g = await GroupUse.resolveGroup(override);
      og = { id: lc(g.id), displayName: g.displayName };
      names.set(og.id, og.displayName);
      kinds = await M.readKinds([g.id], null, kinds);
    }
    // one entry per (old policy, group, action): two new policies that ask
    // for the same exclusion on the same old policy ask once
    const want = new Map(), skipped = [];
    for (const pr of chosen) {
      const O = pr.O;
      if (!O.surface) { skipped.push(`${O.name}: not a surface the engine writes`); continue; }
      if (og) {
        const s = M.exclusionSupport((kinds.get(og.id) || {}).kind || "unknown", M.targetKinds(O, kinds));
        if (s.ok === false) { skipped.push(`${O.name} ⊘ ${og.displayName}: ${s.why}`); continue; }
        const act = O.reach.inc.has(og.id) ? "remove" : "add-exclude";
        want.set(`${O.key}|${og.id}|${act}`, { O, groupId: og.id, groupName: og.displayName, action: act, note: s.ok === null ? `⚠ ${s.why}` : "" });
        continue;
      }
      for (const s of pr.proposal.steps) {
        if (s.supported === false) { skipped.push(`${O.name} ⊘ ${s.groupName}: ${s.why}`); continue; }
        const k = `${O.key}|${s.groupId}|${s.action}`;
        if (!want.has(k)) want.set(k, { O, groupId: s.groupId, groupName: s.groupName, action: s.action, note: [s.supported === null ? `⚠ ${s.why}` : "", ...s.notes].filter(Boolean).join(" · ") });
      }
    }
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
    plan = Object.assign(p, {
      title: `Fix ${plural(chosen.length, "collision")} — ${plural(olds.length, "old policy", "old policies")}${og ? `, excluding ${og.displayName}` : ""}`,
      head: { tool: "TUNO T28 MDE rollout", action: "fix-collisions", pairs: chosen.map((pr) => ({ newPolicy: pr.N.name, oldPolicy: pr.O.name })) },
      memberLine: "", unread, skipped,
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
      ${p.skipped.length ? `<div class="gu-fail" style="margin-bottom:8px"><b>Not in the plan — Intune does not support these exclusions:</b><span class="why">${p.skipped.map(esc).join("<br>")}</span></div>` : ""}
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
    planEl().scrollIntoView({ block: "start", behavior: "smooth" });
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
    busy = true; clearPlan();
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

  // ----------------------------------------------------- create waves --
  async function createWaves() {
    if (busy || !selWaves.size || !$("mrWaveOk").checked) return;
    busy = true;
    const list = [...selWaves];
    try {
      await Graph.ensureScopes(GroupMigrate.SCOPES.groupWrite);
      $("mrWaveCreate").disabled = true;
      const L = RunLedger.create($("mrWaveLedger"), { unit: "groups", title: "creating wave groups", items: list.map((n) => ({ label: n, sub: "assigned security group" })) });
      const lines = [];
      let okN = 0;
      for (let i = 0; i < list.length; i++) {
        if (L.stopped) { L.skip(i, "stopped"); lines.push(`${list[i]}: skipped`); continue; }
        L.start(i, "checking the name…");
        try {
          const r = await M.createWave(list[i], cfg.waveDescription);
          if (r.skipped) { L.skip(i, r.why); lines.push(`${list[i]}: ${r.why}`); }
          else if (r.verified) { L.done(i, "", "created · verified"); okN++; lines.push(`${list[i]}: created · verified (${r.group.id})`); }
          else { L.fail(i, r.verifyError, "created · NOT verified"); lines.push(`${list[i]}: created · not verified — ${r.verifyError}`); }
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
      runs.push({ at: Date.now(), title: `Create ${plural(list.length, "wave group")}`, kind: "groups", ok: okN, bad: list.length - okN, stopped: L.stopped, backup: { policies: [] }, lines });
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
    $("mrMd").addEventListener("click", () => exportAs("md"));
    $("mrCsv").addEventListener("click", () => exportAs("csv"));
    const body = $("mrBody");
    const go = (p) => { pane = p; view.cat = null; view.state = null; view.q = ""; render(); };
    body.addEventListener("click", (e) => {
      const t = e.target;
      const nd = t.closest("[data-mrpane]"); if (nd) { go(nd.dataset.mrpane); return; }
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
        model.newP.filter((N) => N.surface && !(w && w.id && N.reach.inc.has(w.id))).forEach((N) => sel.add(N.key));
        pane = "new"; view.cat = null; view.state = null; view.q = "";
        setSeg("mrActSeg", "data-mract", "add-include"); setSeg("mrTargetSeg", "data-mrtarget", "group");
        $("mrGroup").value = w ? w.name : "";
        render(); return;
      }
      const wf = t.closest("[data-mrwavefix]"); if (wf) {
        e.preventDefault();
        const gid = lc(wf.dataset.mrwavefix);
        selPairs.clear();
        pairs.filter((pr) => M.needsAction(pr) && pr.N.reach.inc.has(gid) && pr.proposal && pr.proposal.steps.some((s) => s.groupId === gid && s.supported !== false)).forEach((pr) => selPairs.add(pr.id));
        pane = "conflicts"; view.status = "act"; view.cat = null; view.q = ""; $("mrGroup").value = "";
        render(); return;
      }
      const bk = t.closest("[data-mrrunbk]"); if (bk) { const r = runs[Number(bk.dataset.mrrunbk)]; if (r) download(`t28-assignments-before-${stamp()}.json`, JSON.stringify(r.backup, null, 2), "application/json"); return; }
      const un = t.closest("[data-mrundo]"); if (un) { undoRun(Number(un.dataset.mrundo)); return; }
      if (t.id === "mrWaveCreate") { createWaves(); return; }
      if (t.id === "mrRuleSave") {
        const lines = (id) => $(id).value.split(/\r?\n/);
        const before = cfg.waves.join("\n");
        const okSaved = saveCfg({ newPrefixes: lines("mrRuleNew"), outPrefixes: lines("mrRuleOut"), waves: lines("mrRuleWaves"), waveDescription: $("mrRuleDesc").value });
        (async () => {
          if (cfg.waves.join("\n") !== before) { try { const f = await M.findGroups(cfg.waves); found = f.found; dupes = f.dupes; } catch { found = null; } }
          derive(); render();
          $("mrRuleMsg").textContent = `${okSaved ? "Saved for this tenant." : "Applied for this session — this browser would not keep it."} ${model.newP.length} new · ${model.oldP.length} old · ${model.outP.length} out of scope.`;
        })();
        return;
      }
      if (t.id === "mrRuleReset") { saveCfg(null); derive(); render(); return; }
    });
    body.addEventListener("keydown", (e) => {
      const nd = e.target.closest("[data-mrpane]");
      if (nd && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go(nd.dataset.mrpane); }
    });
    body.addEventListener("input", (e) => {
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
    _state: () => ({ pane, model, pairs, retire, waveRows, plan, sel, selPairs, runs, cfg }),
    _pane: (p) => { pane = p; render(); },
  };
})();

// ======================================================================
// T28 — 🎛 Adjust settings: ASR rule modes in the NEW set (build 10657)
//
// Mihai, off T15's MDE baseline table ("ASR rules — 3 match · 15
// conflict"): "for t28, make an option to adjust the settings of these
// policies. make it a dedicated button". Option B off
// t28-adjust-settings-mockups.html: a header button and a pane of its own,
// one row per ASR rule across the whole new set, the baseline beside it.
// First build: ASR rule MODES only (off / audit / warn / block).
//
// WHAT IS EDITED. Only the new set (T28's generation "new", plus the
// new-prefix names ⚙️ Leave out holds — the one-rule WIN-SEC ASR policies
// are there by default), only
// settings-catalog policies, only a rule the policy ALREADY carries as its
// own per-rule child (…attacksurfacereductionrules_<slug>). A rule no new
// policy carries is listed and never created; the legacy "guid=mode"
// string form is listed and not edited. Old and out-of-scope policies —
// the AVD-SEC all-rules policy among them — are never touched here.
//
// NOTHING HERE IS A SECOND COPY. The rule list is T16's
// (EndpointSec.ASR_RULES); the expected modes are T15's baseline
// (Defender.MDE_BASELINE.asr); the per-rule mode a policy gives is the
// one T28's settingsOf already keys (asr|<slug>).
//
// THE WRITE. Intune's settings catalog replaces a policy's settings as a
// whole: PUT /deviceManagement/configurationPolicies/{id} with the policy's
// own name, description, platforms, technologies, scope tags, template
// reference and EVERY setting — read fresh, one choice value changed,
// everything else re-sent exactly as read. The screen reads fresh at the
// dry run, re-reads at apply and skips a policy that changed in between
// (drifted), and reads the settings back after the PUT to verify.
//
// WARN (Learn, "ASR rules overview — modes"): not supported for "Block
// credential stealing from the Windows local security authority subsystem"
// and "Block Office applications from injecting code into other
// processes". Not offered for those two.
// ======================================================================
const MdeAsr = (() => {
  "use strict";

  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const ASR = "device_vendor_msft_policy_config_defender_attacksurfacereductionrules";
  const MODES = ["off", "audit", "warn", "block"];
  const NO_WARN = new Set([
    "blockcredentialstealingfromwindowslocalsecurityauthoritysubsystem",
    "blockofficeapplicationsfrominjectingcodeintootherprocesses",
  ]);
  const rules = () => (typeof EndpointSec !== "undefined" && EndpointSec.ASR_RULES) || [];
  const modesFor = (slug) => MODES.filter((m) => m !== "warn" || !NO_WARN.has(lc(slug)));
  const defIdOf = (slug) => `${ASR}_${lc(slug)}`;

  // T15's expectation for a rule, or null when the baseline does not name it
  function baselineOf(slug) {
    const b = typeof Defender !== "undefined" && Defender.MDE_BASELINE ? Defender.MDE_BASELINE.asr : [];
    const hit = (b || []).find((x) => lc(x[1]) === lc(slug));
    return hit ? lc(hit[3]) : null;
  }
  const modeOfValue = (slug, value) => {
    const v = lc(value), pre = defIdOf(slug) + "_";
    const tail = v.startsWith(pre) ? v.slice(pre.length) : v;
    return MODES.includes(tail) ? tail : (tail || null);
  };

  // The per-rule child instance in a raw /settings list (either shape the
  // parent comes in — Graph's group collection, or a choice with children).
  function findRule(settings, slug) {
    const want = defIdOf(slug);
    let hit = null;
    const walk = (inst) => {
      if (hit || !inst || typeof inst !== "object") return;
      if (inst.settingInstance && !inst.settingDefinitionId) { walk(inst.settingInstance); return; }
      if (lc(inst.settingDefinitionId) === want && inst.choiceSettingValue) { hit = inst; return; }
      if (inst.choiceSettingValue) (inst.choiceSettingValue.children || []).forEach(walk);
      if (Array.isArray(inst.choiceSettingCollectionValue)) inst.choiceSettingCollectionValue.forEach((c) => ((c && c.children) || []).forEach(walk));
      if (Array.isArray(inst.groupSettingCollectionValue)) inst.groupSettingCollectionValue.forEach((g) => ((g && g.children) || []).forEach(walk));
      if (inst.groupSettingValue) (inst.groupSettingValue.children || []).forEach(walk);
    };
    (settings || []).forEach(walk);
    return hit;
  }
  const modeIn = (settings, slug) => { const r = findRule(settings, slug); return r ? modeOfValue(slug, r.choiceSettingValue.value) : null; };

  // Copy of the settings with one rule's mode changed. Never mutates the input.
  function withModes(settings, changes) {
    const copy = JSON.parse(JSON.stringify(settings || []));
    const out = { settings: copy, missing: [] };
    for (const c of changes) {
      const r = findRule(copy, c.slug);
      if (!r) { out.missing.push(c.slug); continue; }
      r.choiceSettingValue.value = `${defIdOf(c.slug)}_${c.to}`;
    }
    return out;
  }

  // The PUT body: the policy's own properties plus every setting, stripped
  // of what a read adds (ids, expansions, OData context).
  function clean(o) {
    if (Array.isArray(o)) return o.map(clean);
    if (!o || typeof o !== "object") return o;
    const out = {};
    for (const k of Object.keys(o)) {
      if (k === "settingDefinitions" || /@odata\.(context|nextLink)$/.test(k) || k.startsWith("__")) continue;
      out[k] = clean(o[k]);
    }
    return out;
  }
  function putBody(policy, settings) {
    const p = policy || {};
    const body = {
      name: p.name, description: p.description || "",
      platforms: p.platforms, technologies: p.technologies,
      roleScopeTagIds: p.roleScopeTagIds || ["0"],
      settings: (settings || []).map((s) => {
        const c = clean(s);
        delete c.id;
        return Object.assign({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting" }, c);
      }),
    };
    if (p.templateReference && p.templateReference.templateId) body.templateReference = { templateId: p.templateReference.templateId };
    return body;
  }

  // ---- the matrix ----------------------------------------------------
  // The new set BY NAME: generation "new", and also a new-prefix policy
  // that ⚙️ Leave out takes out of the comparison — the one-rule WIN-SEC
  // ASR policies are on that list by default (10642), and they are exactly
  // the policies whose modes this pane is for. Out-of-scope prefixes (AVD,
  // WinServ) and TO-BE-REMOVED names never qualify.
  function inNewSet(P, cfg) {
    if (P.generation === "new") return true;
    if (P.generation !== "out" || !P.outWhy || typeof MdeRollout === "undefined") return false;
    const c = cfg || MdeRollout.DEFAULTS;
    if ((c.outPrefixes || []).some((p) => MdeRollout.hasPrefix(P.name, p))) return false;
    if (typeof EndpointPosture !== "undefined" && EndpointPosture.isInterim({ name: P.name })) return false;
    return (c.newPrefixes || []).some((p) => MdeRollout.hasPrefix(P.name, p));
  }
  // One row per (rule, new policy carrying it); a rule no new policy
  // carries is one row with P null. model: MdeRollout.build's.
  function matrix(model) {
    const rows = [];
    const newCat = ((model && model.policies) || []).filter((P) => P.sectionId === "settingsCatalog" && inNewSet(P, model.cfg));
    for (const [slug, guid, name] of rules()) {
      const baseline = baselineOf(slug);
      const holders = newCat.filter((P) => P.settings && P.settings.has(`asr|${slug}`));
      if (!holders.length) { rows.push({ key: `none|${slug}`, slug, guid, name, P: null, now: null, baseline, editable: false, why: "no policy in the new set carries this rule — listed, never created" }); continue; }
      for (const P of holders) {
        const now = lc(P.settings.get(`asr|${slug}`).value);
        const inst = findRule((P.raw && P.raw.__detail) || [], slug);
        rows.push({ key: `${P.key}|${slug}`, slug, guid, name, P, now, baseline, leftOut: P.generation !== "new",
          editable: !!inst && !P.detailError,
          why: P.detailError ? "the policy's settings could not be read" : inst ? "" : "set in the legacy guid=mode string — not edited here" });
      }
    }
    return rows;
  }
  const verdict = (mode, baseline) => !mode ? "none" : !baseline ? "nobase" : lc(mode) === lc(baseline) ? "match" : "differs";

  // edits: Map row key -> wanted mode. Grouped per policy; an edit equal to
  // the mode read is no change and is dropped.
  function planOf(rows, edits) {
    const byPol = new Map();
    for (const r of rows) {
      if (!r.P || !r.editable || !edits.has(r.key)) continue;
      const to = lc(edits.get(r.key));
      if (!to || to === r.now || !modesFor(r.slug).includes(to)) continue;
      if (!byPol.has(r.P.key)) byPol.set(r.P.key, { P: r.P, changes: [] });
      byPol.get(r.P.key).changes.push({ slug: r.slug, name: r.name, from: r.now, to });
    }
    return [...byPol.values()].sort((a, b) => a.P.name.localeCompare(b.P.name));
  }
  // Read-back: every change shows its new mode.
  const verified = (settings, changes) => changes.every((c) => modeIn(settings, c.slug) === c.to);
  // The undo of a run: every verified change the other way round.
  const reverse = (done) => (done || []).map((d) => ({ id: d.id, key: d.key, name: d.name, changes: d.changes.map((c) => ({ slug: c.slug, name: c.name, from: c.to, to: c.from })) }));

  return { ASR, MODES, NO_WARN, inNewSet, modesFor, defIdOf, baselineOf, modeOfValue, findRule, modeIn, withModes, putBody, matrix, verdict, planOf, verified, reverse };
})();

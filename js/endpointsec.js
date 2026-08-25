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
// device count rides the device read, names ride the directory read.
// ======================================================================
const EndpointSec = (() => {
  "use strict";

  const S = () => Graph.SCOPES;

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
    if (!a.length) return { kind: "unassigned", includes: 0, excludes: 0, tenantWide: false, filtered: false };
    let includes = 0, excludes = 0, tenantWide = false, filtered = false;
    for (const x of a) {
      const t = (x.target && x.target["@odata.type"]) || "";
      if (/exclusionGroupAssignmentTarget/.test(t)) excludes++;
      else if (/groupAssignmentTarget/.test(t)) includes++;
      else if (/allDevicesAssignmentTarget|allLicensedUsersAssignmentTarget/.test(t)) { tenantWide = true; }
      if (x.target && x.target.deviceAndAppManagementAssignmentFilterId) filtered = true;
    }
    const kind = (includes || tenantWide) ? "reaches" : excludes ? "excludedOnly" : "unassigned";
    return { kind, includes, excludes, tenantWide, filtered };
  }

  function groupIdsOf(assignments) {
    const ids = [];
    for (const x of assignments || []) {
      const id = x.target && x.target.groupId;
      if (id) ids.push(id);
    }
    return ids;
  }

  async function report(opts) {
    const o = opts || {};
    const onStatus = o.onStatus || (() => {});
    const out = { policies: null, policyError: null, intents: [], intentsError: null,
      templatesError: null, deviceCount: null, deviceCountError: null, disciplines: null, names: {}, nameError: null };

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
        reach: { kind: it.isAssigned ? "reaches" : "unassigned", includes: 0, excludes: 0, tenantWide: false, filtered: false },
        groupIds: [],
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
    L.push(`## Every endpoint security policy`, "", `| Policy | Discipline | Source | Reach | Note |`, `|---|---|---|---|---|`);
    for (const r of rep.policies) {
      const reach = r.counts ? (r.reach.tenantWide ? "tenant-wide" : `${r.reach.includes} include${r.reach.includes === 1 ? "" : "s"}${r.reach.excludes ? `, ${r.reach.excludes} exclusions` : ""}`)
        : r.reach.kind === "excludedOnly" ? "**reaches nobody — exclusions only**" : "**not assigned**";
      L.push(`| ${mdCell(r.name)} | ${mdCell(r.discipline)} | ${r.source} | ${reach} | ${mdCell(r.caveat)} |`);
    }
    L.push("", `---`,
      `Coverage means at least one policy that is assigned AND reaches somebody by construction — no include and no tenant-wide target is nobody, exclusions only is nobody. Per-device applicability is not evaluated: a filter caps reach at "may", and whether an included group is empty is the 🩺 Assignment health tool's finding.`);
    return L.join("\n");
  }
  function csv(rep) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["policy,discipline,source,template,platforms,assignments,reachKind,includes,exclusions,tenantWide,filtered,countsAsCoverage,note"];
    for (const r of rep.policies || []) {
      L.push([q(r.name), q(r.discipline), q(r.source), q(r.template), q(r.platforms),
        r.assignments === null ? "" : r.assignments, r.reach.kind, r.reach.includes, r.reach.excludes,
        String(r.reach.tenantWide), String(r.reach.filtered), String(r.counts), q(r.caveat)].join(","));
    }
    return L.join("\n");
  }

  return { CORE, disciplineOf, disciplineOfTemplateName, reachOf, report, markdown, csv, meta };
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
      await Graph.ensureScopes([...new Set([...Graph.SCOPES.config, ...Graph.SCOPES.devices])]);
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

    // One card per core discipline — the verdict is the card. Click filters.
    const card = (d) => {
      const v = rep.disciplines[d] || { policies: 0, covering: 0, verdict: "none" };
      const label = v.verdict === "covered" ? (v.viaLegacy ? "covered — legacy intent only" : "covered")
        : v.verdict === "unassigned" ? "GAP — none reaches anybody" : "GAP — no policy";
      const cls = v.verdict === "covered" ? "ok" : "bad";
      return `<button class="au-card au-card-btn ${discFilter === d ? "active" : ""}" data-fwdisc="${esc(d)}" type="button">
        <div class="au-card-l">${esc(d)}</div>
        <div class="au-card-n ${cls}">${v.covering}<span class="mini muted" style="font-size:13px;font-weight:normal">/${v.policies}</span></div>
        <div class="au-card-s">${esc(label)}</div></button>`;
    };
    parts.push(`<div class="au-cards">${EndpointSec.CORE.map(card).join("")}</div>`);

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
      const head = `<div class="au-ev-h">
          <b>${esc(r.name)}</b> ${badge}
          ${r.source === "Legacy intent" ? `<span class="gu-how exc">legacy intent</span>` : ""}
          ${r.reach.filtered ? `<span class="gu-how priv" title="An assignment filter is in the way — reach is may, not is">filtered</span>` : ""}
          <span class="au-when mini muted">${esc(r.discipline)}</span>
        </div>
        <div class="mini muted au-ev-m">${esc(r.template)}${r.caveat ? ` · ${esc(r.caveat)}` : ""} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>`;
      const groups = r.groupIds.map((id) => {
        const e = look && look.entry(id);
        return e ? esc(e.name) : `<code>${esc(id)}</code>`;
      });
      const detail = !isOpen ? "" : `<div class="au-detail">
        <div class="au-detail-grid mini">
          <span class="muted">Source</span><span>${esc(r.source)}</span>
          <span class="muted">Template</span><span>${esc(r.template) || "—"}</span>
          ${r.platforms ? `<span class="muted">Platforms</span><span>${esc(r.platforms)}</span>` : ""}
          <span class="muted">Reach</span><span>${r.assignments === null
            ? "the legacy surface says only assigned or not — no assignment detail"
            : `${r.reach.includes} include${r.reach.includes === 1 ? "" : "s"} · ${r.reach.excludes} exclusion${r.reach.excludes === 1 ? "" : "s"}${r.reach.tenantWide ? " · tenant-wide" : ""}${r.reach.filtered ? " · filtered (may, not is)" : ""}`}</span>
          ${groups.length ? `<span class="muted">Groups</span><span>${groups.join(", ")}${rep.nameError ? ` <span class="muted">(names unresolved — ${esc(rep.nameError)})</span>` : ""}</span>` : ""}
        </div>
      </div>`;
      const cls = r.counts ? "ok" : "bad";
      return `<div class="au-fold ${cls} ${isOpen ? "open" : ""}" data-fwfold="${esc(r.id)}"><div class="au-ev-card">${head}${detail}</div></div>`;
    }).join("");

    parts.push(`<div class="list-card">
      <h4 style="margin:0 0 4px">Endpoint security policies (${shown.length}${discFilter ? ` — ${esc(discFilter)}` : ""})</h4>
      <p class="mini muted" style="margin:0 0 10px">Grouped by discipline — click a policy for its assignments. A policy whose only assignments are exclusions, or that has none, reaches nobody by construction and does not count as coverage.</p>
      ${rows || `<p class="mini muted" style="margin:0">No endpoint security policies${discFilter ? " in this discipline" : ""} — which is itself the finding.</p>`}
    </div>`);

    $("fwBody").innerHTML = parts.join("");
    $("fwBody").querySelectorAll("[data-fwdisc]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.fwdisc;
      discFilter = discFilter === k ? null : k;
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
      const f = e.target.closest("[data-fwfold]");
      if (!f || e.target.closest("a,code,button")) return;
      const id = f.dataset.fwfold;
      open.has(id) ? open.delete(id) : open.add(id);
      render();
    });
  }

  return { init, run };
})();

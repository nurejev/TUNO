// ======================================================================
// T09 — Assignment health (BETA). The assignments that exist and reach
// nobody, in one place.
//
// After Ugur Koc's IntuneAssignmentChecker (MIT), which treats an assignment
// reaching an empty group as a FINDING rather than a row — the idea this
// tool is built on. Every finding here is the same shape of problem:
// something that looks configured and is not.
//
//   * EMPTY GROUPS — a policy assigned to a group with no transitive members
//     has never applied and never will, and nothing in the portal says so.
//     Distinct from T02's dangling references: a dangling id names a group
//     the directory NO LONGER HAS, an empty group still exists and simply
//     contains nobody. Different fault, same symptom, both listed.
//   * DANGLING REFERENCES — the assignment names a group the directory
//     cannot resolve. It targets nobody, silently, forever.
//   * UNASSIGNED POLICIES — configuration with no assignment at all. T05 can
//     filter for these; here they are a finding. Enrolment restrictions are
//     deliberately NOT flagged this way: the built-in defaults carry no
//     assignments and apply tenant-wide by priority, so "unassigned" is
//     their normal state and flagging it would be noise that buries the
//     real rows.
//   * EXCLUDED-ONLY — every assignment on the policy is an exclusion. There
//     is no include to take anything away from, so the policy reaches
//     nobody, which is almost never what the author meant.
//   * CONTRADICTIONS — one policy both includes and excludes the same
//     group. The exclusion wins, so the include is dead weight that reads
//     as reach.
//   * FAILED DEPLOYMENTS — where Graph keeps a cheap per-policy status
//     (device configurations, compliance policies, scripts, remediations),
//     policies whose error/failed counts are non-zero. THE COVERAGE IS
//     PARTIAL AND SAYS SO: settings catalog, ADMX, apps and app protection
//     keep their status behind the reports API, which is a different
//     machine, and a health page that silently checked only some surfaces
//     would read as a clean bill for the rest.
//
// The assignment read is GroupUse.SOURCES — T06's rule, one endpoint list
// for the whole product. Reads only.
// ======================================================================
const Health = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const S = () => Graph.SCOPES;
  const shortErr = (e, m) => GroupUse.shortErr(e, m);

  const scopesFor = (sourceIds) => [...new Set([
    ...GroupUse.scopesFor(sourceIds),
    ...S().groups, ...S().directory,
  ])];

  // Enrolment defaults are unassigned BY DESIGN; flagging them would bury
  // the real findings under a row per tenant default.
  const UNASSIGNED_EXEMPT = new Set(["enrolment"]);

  // ---------------------------------------------------- structural findings --
  // Everything derivable from the assignment rows alone, no further reads.
  function structural(rows) {
    const un = rows.filter((r) => r.how === "unassigned" && !UNASSIGNED_EXEMPT.has(r.source));
    const byPolicy = new Map();
    for (const r of rows) {
      if (r.how === "unassigned") continue;
      const k = `${r.source}|${r.sub || ""}|${r.id}`;
      if (!byPolicy.has(k)) byPolicy.set(k, { source: r.source, sourceLabel: r.sourceLabel, sub: r.sub || "", id: r.id, name: r.name, rows: [] });
      byPolicy.get(k).rows.push(r);
    }
    const excludedOnly = [], contradictions = [];
    for (const p of byPolicy.values()) {
      const inc = p.rows.filter((r) => r.how === "assigned" || r.pid === GroupUse.TENANT_WIDE);
      const exc = p.rows.filter((r) => r.how === "excluded");
      if (!inc.length && exc.length) excludedOnly.push({ ...p, excluded: exc.length });
      const incIds = new Set(inc.filter((r) => r.pid !== GroupUse.TENANT_WIDE).map((r) => r.pid));
      const both = [...new Set(exc.map((r) => r.pid).filter((id) => incIds.has(id)))];
      if (both.length) contradictions.push({ ...p, groups: both });
    }
    return { unassigned: un, excludedOnly, contradictions, byPolicy };
  }

  // -------------------------------------------------------- group findings --
  // Every group an assignment names: resolved (or dangling), then peeked for
  // members. The peek is $top=1 rather than $count — "is there at least one
  // transitive member" is the whole question, a one-row page answers it, and
  // it batches cleanly where the text/plain count endpoint does not.
  async function groupFindings(rows, onStatus) {
    const ids = [...new Set(rows.map((r) => r.pid).filter((p) => Graph.isGuid(p)))];
    if (!ids.length) return { empty: [], dangling: [], unknown: [], checked: 0 };

    onStatus && onStatus(`Naming ${ids.length} groups…`);
    const look = await Graph.resolveNames(ids, { types: ["group"] });
    const dangIds = new Set(ids.filter((id) => !look.entry(id)));
    // resolveNames failing wholesale is "unknown", never "all dangling" — a
    // permission problem must not read as a directory full of ghosts.
    if (look.error && dangIds.size === ids.length) {
      return { empty: [], dangling: [], unknown: ids.map((id) => ({ id, error: look.error })), checked: 0, nameError: look.error };
    }

    const live = ids.filter((id) => !dangIds.has(id));
    onStatus && onStatus(`Peeking into ${live.length} groups for members…`);
    const out = await Graph.batch(live.map((id) => ({ id, url: `/groups/${id}/transitiveMembers?$top=1&$select=id` })),
      { beta: false, scopes: S().groups, onProgress: (d, t) => onStatus && onStatus(`Peeking into groups — ${d}/${t}`) });

    const emptyIds = new Set(), unknown = [];
    for (const id of live) {
      const r = out[id];
      if (!r || r.error) { unknown.push({ id, name: look(id), error: (r && r.error) || "no answer" }); continue; }
      if (!((r.body && r.body.value) || []).length) emptyIds.add(id);
    }

    const usedBy = (idset) => rows.filter((r) => idset.has(r.pid)).map((r) => ({
      group: look(r.pid), groupId: r.pid, name: r.name, id: r.id,
      sourceLabel: r.sourceLabel, sub: r.sub || "", how: r.how,
    }));
    return { empty: usedBy(emptyIds), dangling: usedBy(dangIds), unknown, checked: live.length - unknown.length };
  }

  // ------------------------------------------------------- failure findings --
  // Cheap per-policy status, where it exists. Each entry names the list-path
  // fragment its rows carry (matched via source/sub) and how to read failure
  // out of the answer. Everything NOT here is reported as not-checked.
  const STATUS_SURFACES = [
    {
      match: (r) => r.source === "config" && r.sub === "Device configuration",
      label: "Device configuration",
      url: (id) => `/deviceManagement/deviceConfigurations/${id}/deviceStatusOverview`,
      read: (b) => ({ failed: (b.errorCount || 0) + (b.failedCount || 0), conflict: b.conflictCount || 0, pending: b.pendingCount || 0, ok: b.successCount || 0 }),
    },
    {
      match: (r) => r.source === "compliance" && r.sub === "Compliance policy",
      label: "Compliance policy",
      url: (id) => `/deviceManagement/deviceCompliancePolicies/${id}/deviceStatusOverview`,
      read: (b) => ({ failed: (b.errorCount || 0) + (b.nonCompliantCount || 0), conflict: b.conflictCount || 0, pending: (b.inGracePeriodCount || 0) + (b.remediatedCount ? 0 : 0), ok: b.compliantCount || 0 }),
    },
    {
      match: (r) => r.source === "scripts" && r.sub === "PowerShell script",
      label: "PowerShell script",
      url: (id) => `/deviceManagement/deviceManagementScripts/${id}/runSummary`,
      read: (b) => ({ failed: b.errorDeviceCount || 0, conflict: 0, pending: 0, ok: b.successDeviceCount || 0 }),
    },
    {
      match: (r) => r.source === "scripts" && r.sub === "macOS shell script",
      label: "macOS shell script",
      url: (id) => `/deviceManagement/deviceShellScripts/${id}/runSummary`,
      read: (b) => ({ failed: b.errorDeviceCount || 0, conflict: 0, pending: 0, ok: b.successDeviceCount || 0 }),
    },
    {
      match: (r) => r.source === "scripts" && r.sub === "Remediation",
      label: "Remediation",
      url: (id) => `/deviceManagement/deviceHealthScripts/${id}/runSummary`,
      read: (b) => ({ failed: b.detectionScriptErrorDeviceCount || 0, conflict: 0, pending: b.detectionScriptPendingDeviceCount || 0, ok: b.noIssueDetectedDeviceCount || 0 }),
    },
  ];
  // Named so the report can say which surfaces were NOT checked, rather than
  // letting silence read as health.
  const STATUS_NOT_COVERED = "Settings catalog, administrative templates, applications, app protection, app configuration, enrolment, Autopilot and update profiles keep their status behind the reports API and are NOT checked here — no finding for them means not looked at, not healthy.";

  async function failureFindings(rows, onStatus) {
    // Only policies that are actually assigned to something can have failed
    // anywhere — an unassigned policy has no deployment to fail.
    const targets = new Map();
    for (const r of rows) {
      if (r.how === "unassigned") continue;
      const sf = STATUS_SURFACES.find((s) => s.match(r));
      if (!sf) continue;
      const k = `${sf.label}|${r.id}`;
      if (!targets.has(k)) targets.set(k, { sf, id: r.id, name: r.name, sourceLabel: r.sourceLabel, sub: r.sub || "" });
    }
    const list = [...targets.values()];
    if (!list.length) return { failing: [], unknown: [], checked: 0 };

    onStatus && onStatus(`Reading deployment status for ${list.length} policies…`);
    const reqs = list.map((t, i) => ({ id: String(i), url: t.sf.url(t.id) }));
    const out = await Graph.batch(reqs, {
      beta: true, scopes: scopesFor(),
      onProgress: (d, tt) => onStatus && onStatus(`Deployment status — ${d}/${tt}`),
    });

    const failing = [], unknown = [];
    list.forEach((t, i) => {
      const r = out[String(i)];
      if (!r || r.error || !r.body) { unknown.push({ ...t, error: (r && r.error) || "no answer" }); return; }
      const c = t.sf.read(r.body);
      if (c.failed > 0 || c.conflict > 0) failing.push({ ...t, counts: c });
    });
    failing.sort((a, b) => (b.counts.failed + b.counts.conflict) - (a.counts.failed + a.counts.conflict));
    return { failing, unknown, checked: list.length - unknown.length };
  }

  // ------------------------------------------------------------------ run --
  async function run(opts) {
    const { sourceIds, checkStatus, onStatus } = opts;
    const res = await GroupUse.analyze({
      ids: null, via: new Map(), groupId: null,
      sourceIds, tenantWide: true,          // tenant-wide includes count as includes
      unassigned: true,
      onStatus: (m, d, t) => onStatus && onStatus(m, d, t),
    });
    res.rows = await GroupUse.resolveFilters(res.rows);

    const s = structural(res.rows);
    const groups = await groupFindings(res.rows, onStatus);
    const status = checkStatus ? await failureFindings(res.rows, onStatus) : null;
    return {
      rows: res.rows, ran: res.ran, failed: res.failed, partial: res.partial,
      structural: s, groups, status,
      policies: s.byPolicy.size,
    };
  }

  // ---------------------------------------------------------------- exports --
  function meta() {
    return {
      when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
    };
  }

  function markdown(res, m) {
    const L = [];
    L.push(`# Intune assignment health`, "");
    L.push(`Generated ${m.when} by TUNO ${m.build}. Every finding is the same shape of problem: **something that looks configured and is not.**`, "");
    const g = res.groups, s = res.structural;
    L.push(`| | |`, `|---|---|`);
    L.push(`| Policies with assignments | ${res.policies} |`);
    L.push(`| Assignments into EMPTY groups | ${g.empty.length} |`);
    L.push(`| Dangling references | ${g.dangling.length} |`);
    L.push(`| Unassigned policies | ${s.unassigned.length} |`);
    L.push(`| Excluded-only policies | ${s.excludedOnly.length} |`);
    L.push(`| Include + exclude the same group | ${s.contradictions.length} |`);
    if (res.status) L.push(`| Policies with failures reported | ${res.status.failing.length} (of ${res.status.checked} checked) |`);
    L.push("");

    if (g.empty.length) {
      L.push(`## Assignments into empty groups (${g.empty.length})`, "");
      L.push(`The group exists and holds nobody — transitively. The policy has never applied through it.`, "");
      L.push(`| Policy | Surface | Kind | Group | Assignment | Filter |`, `|---|---|---|---|---|---|`);
      g.empty.forEach((r) => L.push(`| ${mdCell(r.name)} | ${mdCell(r.sourceLabel)} | ${mdCell(r.sub)} | ${mdCell(r.group)} | ${r.how} | ${mdCell(r.filterId ? `${r.filterName || r.filterId} (${r.filterMode || "include"})` : "—")} |`));
      L.push("");
    }
    if (g.dangling.length) {
      L.push(`## Dangling references (${g.dangling.length})`, "");
      L.push(`The assignment names a group the directory no longer has. It targets nobody, silently.`, "");
      L.push(`| Policy | Surface | Group id |`, `|---|---|---|`);
      g.dangling.forEach((r) => L.push(`| ${mdCell(r.name)} | ${mdCell(r.sourceLabel)} | \`${r.groupId}\` |`));
      L.push("");
    }
    if (s.unassigned.length) {
      L.push(`## Unassigned policies (${s.unassigned.length})`, "");
      L.push(`No assignment at all. Enrolment restrictions are exempt — their defaults are unassigned by design.`, "");
      L.push(`| Policy | Surface | Kind |`, `|---|---|---|`);
      s.unassigned.forEach((r) => L.push(`| ${mdCell(r.name)} | ${mdCell(r.sourceLabel)} | ${mdCell(r.sub || "")} |`));
      L.push("");
    }
    if (s.excludedOnly.length) {
      L.push(`## Excluded-only policies (${s.excludedOnly.length})`, "");
      L.push(`Every assignment is an exclusion — there is no include for them to carve from, so the policy reaches nobody.`, "");
      s.excludedOnly.forEach((p) => L.push(`- **${mdCell(p.name)}** (${mdCell(p.sourceLabel)}) — ${p.excluded} exclusion${p.excluded === 1 ? "" : "s"}, nothing included`));
      L.push("");
    }
    if (s.contradictions.length) {
      L.push(`## Include and exclude the same group (${s.contradictions.length})`, "");
      L.push(`The exclusion wins, so the include is dead weight that reads as reach.`, "");
      s.contradictions.forEach((p) => L.push(`- **${mdCell(p.name)}** (${mdCell(p.sourceLabel)}) — group${p.groups.length === 1 ? "" : "s"} ${p.groups.map((x) => `\`${x}\``).join(", ")}`));
      L.push("");
    }
    if (res.status) {
      if (res.status.failing.length) {
        L.push(`## Deployments reporting failures (${res.status.failing.length})`, "");
        L.push(`| Policy | Surface | Failed | Conflict | Pending | OK |`, `|---|---|---|---|---|---|`);
        res.status.failing.forEach((t) => L.push(`| ${mdCell(t.name)} | ${mdCell(t.sf.label)} | ${t.counts.failed} | ${t.counts.conflict} | ${t.counts.pending} | ${t.counts.ok} |`));
        L.push("");
      }
      L.push(`> ${STATUS_NOT_COVERED}`, "");
      if (res.status.unknown.length) {
        L.push(`> ${res.status.unknown.length} status read${res.status.unknown.length === 1 ? "" : "s"} failed — those policies are UNKNOWN, not healthy.`, "");
      }
    } else {
      L.push(`> Deployment status was not checked on this run.`, "");
    }
    if (g.unknown.length) L.push(`> ${g.unknown.length} group${g.unknown.length === 1 ? "" : "s"} could not be peeked into — membership UNKNOWN, not empty and not full.`, "");
    if (res.failed.length) {
      L.push(`## Could not be read`, "", `**Not empty — unknown.** Every count above is missing whatever these hold.`, "");
      res.failed.forEach((f) => L.push(`- **${mdCell(f.label)}** — ${mdCell(f.error)}`));
      L.push("");
    }
    L.push(`---`, ``, `After Ugur Koc's [Intune Assignment Checker](https://github.com/ugurkocde/IntuneAssignmentChecker) (MIT); assignment reads via TUNO's Group Analyzer sources.`);
    return L.join("\n");
  }

  function csv(res) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = [["Finding", "Policy", "PolicyId", "Surface", "Kind", "Group", "GroupId", "Filter", "FilterMode", "Detail"].map(q).join(",")];
    res.groups.empty.forEach((r) => L.push(["empty-group", r.name, r.id, r.sourceLabel, r.sub, r.group, r.groupId, r.filterName || r.filterId || "", r.filterId ? (r.filterMode || "include") : "", r.how].map(q).join(",")));
    res.groups.dangling.forEach((r) => L.push(["dangling", r.name, r.id, r.sourceLabel, r.sub, "", r.groupId, r.filterName || r.filterId || "", r.filterId ? (r.filterMode || "include") : "", r.how].map(q).join(",")));
    res.structural.unassigned.forEach((r) => L.push(["unassigned", r.name, r.id, r.sourceLabel, r.sub || "", "", "", "", "", ""].map(q).join(",")));
    res.structural.excludedOnly.forEach((p) => L.push(["excluded-only", p.name, p.id, p.sourceLabel, p.sub, "", "", "", "", `${p.excluded} exclusions, no include`].map(q).join(",")));
    res.structural.contradictions.forEach((p) => L.push(["include+exclude", p.name, p.id, p.sourceLabel, p.sub, "", p.groups.join(";"), "", "", "exclusion wins"].map(q).join(",")));
    if (res.status) res.status.failing.forEach((t) => L.push(["failing", t.name, t.id, t.sf.label, t.sub, "", "", "", "", `failed ${t.counts.failed}, conflict ${t.counts.conflict}`].map(q).join(",")));
    return L.join("\n");
  }

  return {
    scopesFor, structural, groupFindings, failureFindings, run,
    meta, markdown, csv, STATUS_SURFACES, STATUS_NOT_COVERED, UNASSIGNED_EXEMPT,
  };
})();

// ======================================================================
// T09 — the screen.
// ======================================================================
const HealthTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  let result = null, running = false;
  // 10413 state: open folds keyed on stable finding keys; the active kind
  // filter (null = everything). Both reset on a new run.
  const open = new Set();
  let kindFilter = null;

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const prog = (m) => TunoProgress.show("hlBody", "hlProg", m);   // ENCA-style centred card (10397)

  function renderAreas() {
    $("hlAreas").innerHTML = GroupUse.SOURCES.map((s) =>
      `<label class="chk gu-area"><input type="checkbox" data-hlsrc="${s.id}" checked> ${esc(s.icon)} ${esc(s.label)}</label>`).join("");
  }
  const pickedSources = () => [...document.querySelectorAll("[data-hlsrc]:checked")].map((b) => b.dataset.hlsrc);

  // The 10413 layout (build 10416). Every finding kind flattened into ONE
  // list of folded rows — the badge says the kind, the fold carries the
  // evidence. Keys are stable per finding, so the open set survives both a
  // re-render and a filter change. The stat cards double as FILTERS: click
  // a kind to see only it, click again for everything.
  const KINDS = [
    { id: "empty", label: "Empty groups", icon: "👥", cls: "bad", hint: "The group exists and holds nobody — transitively. The policy has never applied through it." },
    { id: "dangling", label: "Dangling", icon: "👻", cls: "bad", hint: "The assignment names a group the directory no longer has. It targets nobody, silently." },
    { id: "unassigned", label: "Unassigned", icon: "📴", cls: "warn", hint: "No assignment at all. Enrolment restrictions are exempt — their defaults are unassigned by design." },
    { id: "excludedOnly", label: "Excluded-only", icon: "🚫", cls: "warn", hint: "Every assignment is an exclusion. There is no include to carve from, so the policy reaches nobody." },
    { id: "contradiction", label: "Include+exclude", icon: "⚔️", cls: "warn", hint: "The exclusion wins; the include reads as reach and delivers none." },
    { id: "failing", label: "Failing", icon: "💥", cls: "bad", hint: "Counts from the per-policy status Graph keeps for these surfaces." },
  ];
  // resolveFilters() runs over these rows and nothing read the answer
  // (10493): an empty-group finding on a FILTERED assignment describes reach
  // the filter may already have removed, and said nothing about it.
  const fbit = (r) => (r && r.filterId
    ? ` · ⚑ ${r.filterName || `filter ${String(r.filterId).slice(0, 8)}…`} (${r.filterMode || "include"})`
    : "");

  function findings(res) {
    const g = res.groups, s = res.structural, out = [];
    g.empty.forEach((r) => out.push({ kind: "empty", key: `e|${r.id}|${r.groupId}`, name: r.name, sub: `${r.sourceLabel}${r.sub ? " · " + r.sub : ""}`,
      line: `assigned (${r.how}) to “${r.group}” — 0 transitive members${fbit(r)}`,
      detail: `The assignment reaches “${esc(r.group)}” (<code>${esc(r.groupId)}</code>) and that group holds nobody, checked transitively at read time. Distinct from deleted: the group exists. Whether it is a mistake or a landing zone prepared for next quarter is yours to judge — the tool reports the fact.` }));
    g.dangling.forEach((r) => out.push({ kind: "dangling", key: `d|${r.id}|${r.groupId}`, name: r.name, sub: r.sourceLabel,
      line: `assignment names a deleted group${fbit(r)}`,
      detail: `The target <code>${esc(r.groupId)}</code> no longer resolves in the directory. The assignment still exists and will keep targeting nobody until it is removed — nothing in the portal will say so.` }));
    s.unassigned.forEach((r) => out.push({ kind: "unassigned", key: `u|${r.id}`, name: r.name, sub: `${r.sourceLabel}${r.sub ? " · " + r.sub : ""}`,
      line: `no assignments at all`,
      detail: `Configuration that has never applied and never will until somebody assigns it. Enrolment restrictions are exempt from this finding — their built-in defaults are unassigned by design.` }));
    s.excludedOnly.forEach((p) => out.push({ kind: "excludedOnly", key: `x|${p.id}`, name: p.name, sub: p.sourceLabel,
      line: `${p.excluded} exclusion${p.excluded === 1 ? "" : "s"}, nothing included`,
      detail: `Every assignment on this policy is an exclusion — there is no include for them to carve from, so the policy reaches nobody. Almost never what the author meant.` }));
    s.contradictions.forEach((p) => out.push({ kind: "contradiction", key: `c|${p.id}`, name: p.name, sub: p.sourceLabel,
      line: `same group included and excluded`,
      detail: `Group${p.groups.length === 1 ? "" : "s"} ${p.groups.map((x) => `<code>${esc(x)}</code>`).join(", ")} appear${p.groups.length === 1 ? "s" : ""} as include AND exclusion on this policy. The exclusion wins — the include is dead weight that reads as reach.` }));
    if (res.status) res.status.failing.forEach((t) => out.push({ kind: "failing", key: `f|${t.id}`, name: t.name, sub: t.sf.label,
      line: `${t.counts.failed} failed${t.counts.conflict ? `, ${t.counts.conflict} conflict` : ""}`,
      detail: `Failed <b>${t.counts.failed}</b> · conflict ${t.counts.conflict} · pending ${t.counts.pending} · OK ${t.counts.ok} — Graph's cheap per-policy status, refreshed on Intune's schedule. Per-device drill-down is the 🖥 Device analyzer's job.` }));
    return out;
  }

  function render(res) {
    const g = res.groups;
    const all = findings(res);
    const byKind = (id) => all.filter((f) => f.kind === id).length;
    const kindOf = (id) => KINDS.find((k) => k.id === id);
    const card = (k) => {
      const n = k.id === "failing" && !res.status ? null : byKind(k.id);
      const sub = k.id === "failing"
        ? (res.status ? `of ${res.status.checked} checked` : "not checked this run")
        : k.id === "empty" && g.unknown.length ? `${g.unknown.length} unpeekable — unknown` : (n ? "click to filter" : "none found");
      return `<button class="au-card au-card-btn ${kindFilter === k.id ? "active" : ""}" data-hlkind="${k.id}" ${n === null ? "disabled" : ""} type="button">
        <div class="au-card-l">${k.icon} ${esc(k.label)}</div>
        <div class="au-card-n ${n ? (k.cls === "bad" ? "bad" : "") : "ok"}">${n === null ? "—" : n}</div>
        <div class="au-card-s">${esc(sub)}</div></button>`;
    };

    const shown = kindFilter ? all.filter((f) => f.kind === kindFilter) : all;
    const folds = shown.map((f) => {
      const k = kindOf(f.kind);
      const isOpen = open.has(f.key);
      return `<div class="au-fold ${k.cls} ${isOpen ? "open" : ""}" data-hlfold="${esc(f.key)}"><div class="au-ev-card">
        <div class="au-ev-h"><b>${esc(f.name)}</b>
          <span class="au-op ${k.cls === "bad" ? "delete" : "update"}">${k.icon} ${esc(k.label)}</span>
          <span class="au-when mini muted">${esc(f.sub)}</span></div>
        <div class="mini muted au-ev-m">${esc(f.line)} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>
        ${isOpen ? `<div class="au-detail"><p class="mini" style="margin:0">${f.detail}</p><p class="mini muted" style="margin:6px 0 0">${esc(k.hint)}</p></div>` : ""}
      </div></div>`;
    }).join("");

    const notes = [];
    if (res.status) {
      notes.push(`<p class="mini muted" style="margin:8px 0 0">${esc(Health.STATUS_NOT_COVERED)}</p>`);
      if (res.status.unknown.length) notes.push(`<p class="mini muted" style="margin:4px 0 0"><b>${res.status.unknown.length}</b> status read${res.status.unknown.length === 1 ? "" : "s"} failed — those policies are unknown, not healthy.</p>`);
    }
    if (g.unknown.length) notes.push(`<p class="mini muted" style="margin:4px 0 0"><b>${g.unknown.length}</b> group${g.unknown.length === 1 ? "" : "s"} could not be peeked into — membership unknown, not empty and not full.</p>`);
    const failed = res.failed.length ? `<div class="gu-fail" style="margin-top:12px"><b>${res.failed.length} surface${res.failed.length === 1 ? "" : "s"} could not be read — not empty, UNKNOWN:</b> ${res.failed.map((f) => esc(f.label)).join(", ")}.</div>` : "";
    const clean = !all.length;

    // THE STICKY CHIPS (10542, T19's fix): the kind filter, pinned — a
    // compact second face of the cards above, reachable after 200 folds.
    const chip = (id, label, n) => `<button class="fchip${kindFilter === id ? " active" : ""}" data-hlkind="${id || ""}" type="button">${label}${n === null ? "" : ` (${n})`}</button>`;
    const chips = all.length ? `<div class="toolbar">${chip(null, "All", all.length)}${KINDS.map((k) => chip(k.id, `${k.icon} ${esc(k.label)}`, k.id === "failing" && !res.status ? null : byKind(k.id))).join("")}</div>` : "";
    $("hlBody").innerHTML = chips + `<div class="au-cards">${KINDS.map(card).join("")}</div><div class="list-card">
      <p class="mini muted" style="margin:0">${res.policies} policies · ${res.ran.length} surfaces read${res.failed.length ? ` · <b>${res.failed.length} FAILED</b>` : ""}${kindFilter ? ` · showing only <b>${esc(kindOf(kindFilter).label)}</b> — click the card again for everything` : all.length ? " · click a card to filter to one kind" : ""}</p>
      ${clean ? `<p class="mini" style="margin-top:12px"><b>Nothing found.</b> Every assignment read reaches at least one member, every policy read is assigned, and ${res.status ? "no checked deployment reports failures" : "deployment status was not checked"}.${res.failed.length ? " <b>But " + res.failed.length + " surface(s) could not be read — this is not a clean bill for them.</b>" : ""}</p>` : `<div style="margin-top:10px">${folds || `<p class="mini" style="margin-top:8px">Nothing of this kind.</p>`}</div>`}
      ${notes.join("")}${failed}</div>`;
    ["hlMd", "hlCsv"].forEach((b) => { $(b).style.display = ""; });

    $("hlBody").querySelectorAll("[data-hlkind]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.hlkind || null;
      kindFilter = kindFilter === k ? null : k;
      render(result);
    }));
    $("hlBody").querySelectorAll("[data-hlfold]").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.closest("a,code")) return;
      const k = el.dataset.hlfold;
      open.has(k) ? open.delete(k) : open.add(k);
      render(result);
    }));
  }

  async function run() {
    if (running) return;
    running = true; result = null; open.clear(); kindFilter = null;
    ["hlMd", "hlCsv"].forEach((b) => { $(b).style.display = "none"; });
    $("hlBody").innerHTML = "";
    try {
      const sources = pickedSources();
      if (!sources.length) throw new Error("Pick at least one surface to read.");
      await Graph.ensureScopes(Health.scopesFor(sources));
      result = await Health.run({ sourceIds: sources, checkStatus: $("hlStatus").checked, onStatus: prog });
      render(result);
      prog("");
    } catch (e) {
      prog("");
      $("hlBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div></div>`;
    } finally { running = false; }
  }

  function init() {
    if (!$("hlRun")) return;
    renderAreas();
    $("hlRun").addEventListener("click", run);
    $("hlReset").addEventListener("click", () => { result = null; $("hlBody").innerHTML = ""; prog(""); ["hlMd", "hlCsv"].forEach((b) => { $(b).style.display = "none"; }); });
    $("hlMd").addEventListener("click", () => { if (result) download("assignment-health.md", Health.markdown(result, Health.meta()), "text/markdown"); });
    $("hlCsv").addEventListener("click", () => { if (result) download("assignment-health.csv", Health.csv(result), "text/csv"); });
  }

  return { init };
})();

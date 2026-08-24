// ======================================================================
// T02 — Group Analyzer (BETA). "What lands on the devices in this group?"
//
// An Entra group is a shared handle. One admin targets a compliance policy at
// it, another assigns four applications to it, a third puts an Autopilot
// profile on it — and then somebody adds a user, and the consequences of that
// are invisible at the moment of the change. This reads them back out.
//
// TWO PARENTS, AND THE MERGE IS THE POINT.
//
// ENCA's Group Analyzer (T19) answers the same question across 23 services
// with Entra leading. Its machinery is ported here rather than rewritten: the
// source descriptor with its own scopes and its own runner, the flat
// (principal, object) hit shape, the rule that a failing source is reported
// and never fatal, and — the part that matters most — ancestors rather than
// just the group itself.
//
// Ugur Koc's Get Group Assignments (IntuneAutomation, MIT) answers it for
// Intune only, and does two things ENCA's does not. Both are here:
//
//   1. TENANT-WIDE TARGETS ARE OFFERED. ENCA's runner drops an assignment
//      whose target is All Users or All Devices, because it is looking for a
//      named group and those name none. But they land on this group's members
//      just the same, so the effective surface is larger than the group's own
//      assignments and an admin sizing up a change cannot see it. Off by
//      default — it is loud, and it is the same answer for every group — and
//      one toggle away.
//
//   2. EXCLUSIONS ARE READ AS ASSIGNMENTS. Both parents do this; it is
//      restated here because it is the thing most likely to be "simplified"
//      out later. "This policy does not reach you" is the same question as
//      "this policy reaches you", and a report showing only inclusions is
//      wrong half the time.
//
// And one thing NEITHER has. The script's own notes say nested group
// inheritance is not evaluated. ENCA evaluates it; TUNO carries that over, so
// a policy assigned to a parent group shows up here against the child, marked
// with which parent it came through.
//
// WHAT THIS TOOL DOES NOT DO, and why. It is Intune-only. The Entra side —
// Conditional Access, group-based licensing, directory roles, access packages,
// entitlement management — needs scopes TUNO's registration does not hold and
// has no reason to: that is ENCA's tool and ENCA is signed in for it. Rather
// than half-read those surfaces with the permissions to hand, this says so and
// points at the sister tool.
// ======================================================================
const GroupUse = (() => {
  "use strict";

  // A synthetic principal id for assignments that name no group. Not a GUID,
  // so it can never collide with a real one, and carried through the same
  // pipeline as everything else rather than living in a parallel code path.
  const TENANT_WIDE = "*tenant-wide*";

  const lc = (s) => String(s || "").toLowerCase();
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // Graph's error text is long and often ends in a request id. Keep the part a
  // human can act on: "Insufficient privileges", "Resource not found", …
  function shortErr(e, max) {
    const m = String((e && e.message) || e || "").split(" · ")[0];
    const cap = max || 180;
    return m.length > cap ? m.slice(0, cap - 3) + "…" : m;
  }

  // Everything here is beta. Not a preference — deviceShellScripts,
  // deviceHealthScripts, configurationPolicies and compliancePolicies are
  // absent or assignment-less on v1.0, so a v1.0 run would silently under-
  // report rather than fail, which is the worst of the two outcomes.
  const read = (path, scopes) => Graph.readAll(path, { scopes, beta: true, retry: true });

  // ------------------------------------------------- the assignment shape --
  // Every Intune workload shares one assignment model, which is the only
  // reason nine sources fit in one file: a target carries an @odata.type and,
  // for the group cases, a groupId.
  function intuneHits(item, nameOf, ids, opts) {
    const o = opts || {};
    const name = nameOf(item);
    const out = [];
    for (const a of (item.assignments || [])) {
      const t = a.target || {};
      const ty = lc(t["@odata.type"]);
      let how = null, pid = null;
      if (ty.includes("exclusiongroupassignmenttarget")) { how = "excluded"; pid = lc(t.groupId); }
      else if (ty.includes("groupassignmenttarget")) { how = "assigned"; pid = lc(t.groupId); }
      else if (ty.includes("alldevicesassignmenttarget")) { how = "all-devices"; pid = TENANT_WIDE; }
      else if (ty.includes("alllicensedusersassignmenttarget")) { how = "all-users"; pid = TENANT_WIDE; }
      if (!how) continue;

      // ids === null is MATCH ALL, and it is what makes a sweep cheap: one
      // read of each surface answers for every group at once, instead of one
      // read per group. Everything downstream — the tally, the exports, the
      // per-group drill-down — runs on the same rows either way.
      if (pid === TENANT_WIDE) { if (!o.tenantWide) continue; }
      else if (!pid) continue;
      else if (ids && !ids.has(pid)) continue;

      const bits = [];
      if (a.intent) bits.push(`intent: ${a.intent}`);
      // A filter can turn an assignment that looks total into one that reaches
      // almost nothing, or the reverse. Naming the mode without the filter is
      // half an answer, but the id is all the assignment carries — the filter
      // names are resolved once, later, for the whole run.
      const fmode = t.deviceAndAppManagementAssignmentFilterType;
      if (fmode && lc(fmode) !== "none") bits.push(`filter: ${fmode}`);
      if (o.extra) bits.push(o.extra(item));
      out.push({
        pid, name, id: item.id, how,
        filterId: t.deviceAndAppManagementAssignmentFilterId || "",
        filterMode: fmode && lc(fmode) !== "none" ? String(fmode) : "",
        detail: bits.filter(Boolean).join(" · "),
      });
    }
    return out;
  }

  // Run several collection endpoints as one logical source. A 404/403 on one
  // family (a workload the tenant does not have, or is not licensed for) must
  // not fail the others — but ALL of them failing is a real failure, not an
  // empty result. Reporting "no assignments" for a surface that could not be
  // read is the single most dangerous thing this tool could do.
  async function intuneFamily(list, ids, ctx, opts) {
    const hits = [], notes = [];
    for (const [path, nameField, sub, scopes] of list) {
      try {
        ctx && ctx.status && ctx.status(sub);
        const items = await read(path, scopes);
        for (const it of items) {
          intuneHits(it, (x) => x[nameField] || x.displayName || x.name || x.id, ids, opts)
            .forEach((h) => hits.push({ ...h, sub }));
        }
      } catch (e) { notes.push(`${sub}: ${shortErr(e)}`); }
    }
    if (notes.length === list.length) throw new Error(notes.join("; "));
    notes.forEach((n) => ctx && ctx.note && ctx.note(n));
    return { hits, notes };
  }

  const S = () => Graph.SCOPES;

  // --------------------------------------------------------------- sources --
  // run(ctx) → [{ pid, name, id, how, detail, sub }]
  // ctx = { ids:Set<string>, tenantWide:bool, note(fn), status(fn) }
  const SOURCES = [
    {
      id: "config", label: "Configuration profiles", icon: "⚙️",
      scopes: () => S().config,
      doc: "https://learn.microsoft.com/intune/intune-service/configuration/device-profiles",
      hint: "Device configuration, settings-catalog and ADMX profiles — the largest single source of surprise.",
      run: (ctx) => intuneFamily([
        ["/deviceManagement/deviceConfigurations?$expand=assignments", "displayName", "Device configuration", S().config],
        ["/deviceManagement/configurationPolicies?$expand=assignments", "name", "Settings catalog", S().config],
        ["/deviceManagement/groupPolicyConfigurations?$expand=assignments", "displayName", "ADMX template", S().config],
      ], ctx.ids, ctx, ctx.opts).then((r) => r.hits),
    },
    {
      id: "compliance", label: "Compliance policies", icon: "✅",
      scopes: () => S().config,
      doc: "https://learn.microsoft.com/intune/intune-service/protect/device-compliance-get-started",
      hint: "Compliance decides the 'device is compliant' grant control — this is where Conditional Access and Intune meet.",
      run: (ctx) => intuneFamily([
        ["/deviceManagement/deviceCompliancePolicies?$expand=assignments", "displayName", "Compliance policy", S().config],
        ["/deviceManagement/compliancePolicies?$expand=assignments", "name", "Compliance policy (settings catalog)", S().config],
      ], ctx.ids, ctx, ctx.opts).then((r) => r.hits),
    },
    {
      id: "scripts", label: "Scripts & remediations", icon: "📜",
      // Their own scope. PowerShell scripts, macOS shell scripts and
      // remediations are NOT covered by DeviceManagementConfiguration.Read.All
      // — ENCA learned that from three 403s while compliance read fine.
      scopes: () => S().scripts,
      doc: "https://learn.microsoft.com/intune/intune-service/apps/intune-management-extension",
      hint: "Code that runs on the device. Adding a member here runs a script on their machine.",
      run: (ctx) => intuneFamily([
        ["/deviceManagement/deviceManagementScripts?$expand=assignments", "displayName", "PowerShell script", S().scripts],
        ["/deviceManagement/deviceShellScripts?$expand=assignments", "displayName", "macOS shell script", S().scripts],
        ["/deviceManagement/deviceHealthScripts?$expand=assignments", "displayName", "Remediation", S().scripts],
      ], ctx.ids, ctx, ctx.opts).then((r) => r.hits),
    },
    {
      id: "apps", label: "Application assignments", icon: "📦",
      scopes: () => S().apps,
      doc: "https://learn.microsoft.com/intune/intune-service/apps/apps-deploy",
      hint: "Required, available and uninstall assignments. 'Uninstall' is the one worth reading twice.",
      async run(ctx) {
        // $select keeps the icon blobs out of the response — mobileApps
        // without it is megabytes of base64 nobody reads.
        const apps = await read("/deviceAppManagement/mobileApps?$expand=assignments&$select=id,displayName,publisher", S().apps);
        return apps.flatMap((a) => intuneHits(a, (x) => x.displayName || x.id, ctx.ids, ctx.opts));
      },
    },
    {
      id: "appProtection", label: "App protection policies", icon: "🛡",
      scopes: () => S().apps,
      doc: "https://learn.microsoft.com/intune/intune-service/apps/app-protection-policy",
      hint: "MAM policies apply WITHOUT enrolment, so their reach is easy to underestimate.",
      run: (ctx) => intuneFamily([
        ["/deviceAppManagement/iosManagedAppProtections?$expand=assignments", "displayName", "iOS app protection", S().apps],
        ["/deviceAppManagement/androidManagedAppProtections?$expand=assignments", "displayName", "Android app protection", S().apps],
        ["/deviceAppManagement/windowsManagedAppProtections?$expand=assignments", "displayName", "Windows app protection", S().apps],
        ["/deviceAppManagement/mdmWindowsInformationProtectionPolicies?$expand=assignments", "displayName", "Windows information protection", S().apps],
      ], ctx.ids, ctx, ctx.opts).then((r) => r.hits),
    },
    {
      id: "appConfig", label: "App configuration policies", icon: "🔧",
      scopes: () => S().apps,
      doc: "https://learn.microsoft.com/intune/intune-service/apps/app-configuration-policies-overview",
      hint: "Settings pushed into apps — for managed devices and for managed apps.",
      run: (ctx) => intuneFamily([
        ["/deviceAppManagement/mobileAppConfigurations?$expand=assignments", "displayName", "Managed devices", S().apps],
        ["/deviceAppManagement/targetedManagedAppConfigurations?$expand=assignments", "displayName", "Managed apps", S().apps],
      ], ctx.ids, ctx, ctx.opts).then((r) => r.hits),
    },
    {
      id: "enrolment", label: "Enrolment restrictions", icon: "🚪",
      scopes: () => S().service,
      doc: "https://learn.microsoft.com/intune/intune-service/enrollment/enrollment-restrictions-set",
      hint: "Which platforms a member may enrol, whether personal devices are allowed, and how many devices each person gets.",
      async run(ctx) {
        const all = await read("/deviceManagement/deviceEnrollmentConfigurations?$expand=assignments", S().service);
        return all.flatMap((c) => {
          const limit = lc(c["@odata.type"]).includes("limitconfiguration");
          return intuneHits(c, (x) => x.displayName || x.id, ctx.ids, Object.assign({}, ctx.opts, {
            extra: (x) => (limit
              ? (x.limit != null ? `limit: ${x.limit}` : "device limit")
              : String(x["@odata.type"] || "").split(".").pop().replace(/Configuration$/, "")),
          })).map((h) => ({ ...h, sub: limit ? "Device limit" : "Platform restriction" }));
        });
      },
    },
    {
      id: "autopilot", label: "Autopilot deployment profiles", icon: "🛫",
      scopes: () => S().service,
      doc: "https://learn.microsoft.com/autopilot/profiles",
      hint: "Which out-of-box experience a device gets. Assigned to DEVICE groups — watch for dynamic rules.",
      async run(ctx) {
        const all = await read("/deviceManagement/windowsAutopilotDeploymentProfiles?$expand=assignments", S().service);
        return all.flatMap((p) => intuneHits(p, (x) => x.displayName || x.id, ctx.ids, ctx.opts));
      },
    },
    {
      id: "updates", label: "Windows update profiles", icon: "🔄",
      scopes: () => S().config,
      doc: "https://learn.microsoft.com/intune/intune-service/protect/windows-update-for-business-configure",
      hint: "Feature, quality and driver update profiles. Update RINGS are configuration profiles and appear under that source.",
      run: (ctx) => intuneFamily([
        ["/deviceManagement/windowsFeatureUpdateProfiles?$expand=assignments", "displayName", "Feature update", S().config],
        ["/deviceManagement/windowsQualityUpdateProfiles?$expand=assignments", "displayName", "Quality update", S().config],
        ["/deviceManagement/windowsDriverUpdateProfiles?$expand=assignments", "displayName", "Driver update", S().config],
      ], ctx.ids, ctx, ctx.opts).then((r) => r.hits),
    },
  ];

  const sourceById = (id) => SOURCES.find((s) => s.id === id) || null;
  const allSourceIds = () => SOURCES.map((s) => s.id);
  const scopesFor = (ids) => [...new Set((ids || allSourceIds()).flatMap((id) => (sourceById(id) || { scopes: () => [] }).scopes()))];

  // ------------------------------------------------------------ the group --
  // Accept a GUID or a name. Returns the group, or throws something a person
  // can act on — "matches 3 groups" is more useful than picking one silently.
  async function resolveGroup(term) {
    term = String(term || "").trim();
    if (!term) throw new Error("Enter a group name or object ID");
    const sel = "id,displayName,description,groupTypes,membershipRule,securityEnabled,mailEnabled,isAssignableToRole,createdDateTime";

    if (Graph.isGuid(term)) {
      return await Graph.readOne(`/groups/${encodeURIComponent(term)}?$select=${sel}`, { scopes: S().groups });
    }
    // The interpolated term is escaped by the tagged template; the $select and
    // $top are structure and are appended raw, which is the whole distinction
    // the template exists to make.
    const q = Graph.odata`/groups?$filter=startswith(displayName,'${term}') or mailNickname eq '${term}'`
      + `&$select=${sel}&$top=10`;
    const hits = await Graph.readAll(q, { scopes: S().groups, retry: true });
    if (!hits.length) throw new Error(`No group matches “${term}”`);
    const exact = hits.filter((g) => lc(g.displayName) === lc(term));
    if (exact.length === 1) return exact[0];
    if (hits.length === 1) return hits[0];
    throw new Error(`“${term}” matches ${hits.length} groups — use the exact name or the object ID`);
  }

  // The set of principal ids a hit may be recorded against, and WHY.
  //   • the group itself
  //   • every group it is transitively a member of — a policy on the parent
  //     reaches the members of this group, and a report that stops at direct
  //     assignments is wrong about that. This is what the PowerShell original
  //     documents as not evaluated.
  // Child groups are collected but only to be SHOWN: they widen who is
  // affected, not where this group is used.
  async function buildScope(group, onStatus) {
    const via = new Map();
    via.set(lc(group.id), "the group itself");
    const parents = [], children = [];

    onStatus && onStatus("Expanding memberships…");
    try {
      const mem = await Graph.readAll(`/groups/${encodeURIComponent(group.id)}/transitiveMemberOf?$select=id,displayName`,
        { scopes: S().groupMembers, retry: true });
      for (const o of mem) {
        if (lc(o["@odata.type"]).includes("directoryrole") || lc(o["@odata.type"]).includes("administrativeunit")) continue;
        via.set(lc(o.id), `via parent group “${o.displayName}”`);
        parents.push({ id: o.id, name: o.displayName });
      }
    } catch (e) {
      // Not fatal, but it changes what the answer MEANS — direct assignments
      // only. The caller surfaces this rather than quietly narrowing.
      return { via, ids: new Set(via.keys()), parents, children, inheritanceError: shortErr(e) };
    }

    try {
      (await Graph.readAll(`/groups/${encodeURIComponent(group.id)}/transitiveMembers/microsoft.graph.group?$select=id,displayName`,
        { scopes: S().groupMembers, retry: true }))
        .forEach((g) => children.push({ id: g.id, name: g.displayName }));
    } catch { /* nested children are context, not the answer */ }

    return { via, ids: new Set(via.keys()), parents, children, inheritanceError: null };
  }

  async function memberCount(groupId) {
    try {
      const n = await Graph.get(`/groups/${encodeURIComponent(groupId)}/members/$count`,
        { scopes: S().groupMembers, headers: { ConsistencyLevel: "eventual", Accept: "text/plain" }, retry: true });
      const v = parseInt(n, 10);
      return Number.isFinite(v) ? v : null;
    } catch { return null; }
  }

  // A bare 403 tells nobody what to do next. Say which permission the call
  // needs AND which role the signed-in user needs on top of it — those are
  // different things, and a scope alone is often not enough in Intune.
  function whyFailed(src, e) {
    const m = String((e && e.message) || e);
    const scopes = src.scopes() || [];
    if (/\b(401|403)\b|Authorization_RequestDenied|Insufficient privileges|Forbidden/i.test(m)) {
      return `Needs ${scopes.join(" or ")}. Also needs an Intune RBAC role that can read this workload (Read Only Operator is enough) and an active Intune licence for the tenant.`;
    }
    if (/\b400\b|BadRequest/i.test(m)) return "Graph rejected the query — usually a schema that moved. Worth reporting.";
    if (/\b404\b/i.test(m)) return "Not present in this tenant — normal when the workload is not licensed or used.";
    if (/\b429\b/i.test(m)) return "Throttled, and it did not let up after five retries. Try again in a minute.";
    return "";
  }

  // ------------------------------------------------------------------- run --
  async function analyze(opts) {
    const { ids, sourceIds, tenantWide, onStatus, onSource } = opts;
    const rows = [], ran = [], failed = [], partial = [];
    const list = sourceIds && sourceIds.length ? sourceIds : allSourceIds();
    // "Why is this row here?" is a per-row question, and the answer is the
    // relationship that put the id in the match set. Attaching it here rather
    // than at render time means it survives into the exports, which is where
    // it matters most — an inherited assignment in a change request that does
    // not say which parent it came through is an argument nobody can check.
    const via = (opts.via instanceof Map) ? opts.via : new Map();
    const self = lc(opts.groupId || "");
    const label = (pid) => (pid === TENANT_WIDE
      ? "assigned to the whole tenant"
      : (via.get(pid) || "the group itself"));

    let done = 0;
    for (const id of list) {
      const src = sourceById(id);
      if (!src) continue;
      done++;
      const t0 = Date.now();
      const notes = [];
      onSource && onSource(src);
      const ctx = {
        ids,
        opts: { tenantWide: !!tenantWide },
        note: (m) => notes.push(m),
        status: (s) => onStatus && onStatus(`${src.label} — ${s}`, done, list.length),
      };
      try {
        onStatus && onStatus(src.label, done, list.length);
        const hits = (await src.run(ctx)) || [];
        hits.forEach((h) => rows.push({
          ...h, source: src.id, sourceLabel: src.label,
          viaLabel: label(h.pid),
          // INHERITED means "this did not come from an assignment naming this
          // group". A tenant-wide target is not inherited — it is universal,
          // which is a different fact and gets its own count.
          inherited: h.pid !== TENANT_WIDE && !!self && h.pid !== self,
        }));
        ran.push({ id, label: src.label, count: hits.length, ms: Date.now() - t0 });
        if (notes.length) partial.push({ id, label: src.label, notes });
      } catch (e) {
        failed.push({ id, label: src.label, error: shortErr(e), why: whyFailed(src, e) });
      }
    }
    return { rows, ran, failed, partial };
  }

  // ===================================================================== //
  // SWEEP — the same question asked of the whole tenant at once.
  //
  // A sweep reads each surface ONCE and matches every group against it, so the
  // cost barely grows with the number of groups. That is the whole reason this
  // is affordable, and it falls straight out of intuneHits taking a match set
  // rather than a single id: pass null and it matches everything.
  //
  // The exception is inheritance, which is per-group by nature — one
  // transitiveMemberOf per candidate. Batched twenty at a time and behind a
  // toggle, because on a large tenant it is the whole cost of the run.
  // ===================================================================== //

  const SCOPES_IN = [
    { id: "intune", label: "Only groups Intune assigns to" },
    { id: "100", label: "First 100 groups" },
    { id: "250", label: "First 250 groups" },
    { id: "500", label: "First 500 groups" },
    { id: "0", label: "Every group in the tenant" },
  ];

  // The local predicate is ALWAYS the authority. Graph can narrow the fetch
  // server-side where it supports the shape, but $search is token-based rather
  // than substring, so a server-side "contains" returns more than it should —
  // and trusting it would put groups in the report that do not match.
  function nameMatcher(mode, text) {
    const t = lc(text || "").trim();
    if (!t) return () => true;
    if (mode === "ends") return (n) => lc(n).endsWith(t);
    if (mode === "contains") return (n) => lc(n).includes(t);
    return (n) => lc(n).startsWith(t);
  }

  // Enumerate candidate groups. Only reached for the counted scopes — the
  // "Only groups Intune assigns to" scope never touches /groups at all.
  async function enumerateGroups({ limit, matchMode, matchText, onStatus }) {
    const sel = "id,displayName,description,groupTypes,membershipRule,securityEnabled,isAssignableToRole";
    let path, headers = null;
    const t = String(matchText || "").trim();
    if (t && matchMode === "starts") {
      path = Graph.odata`/groups?$filter=startswith(displayName,'${t}')` + `&$select=${sel}&$top=999`;
    } else if (t) {
      // $search narrows the fetch for contains/ends; the local matcher below
      // still decides. Needs eventual consistency, which is why it is a header
      // and not just a query parameter.
      path = Graph.odata`/groups?$search="displayName:${t}"` + `&$select=${sel}&$top=999`;
      headers = { ConsistencyLevel: "eventual" };
    } else {
      path = `/groups?$select=${sel}&$top=999`;
    }
    onStatus && onStatus("Listing groups…");
    let all;
    try {
      all = await Graph.readAll(path, { scopes: S().groups, headers, retry: true });
    } catch (e) {
      // A tenant that refuses $search still deserves an answer.
      if (!headers) throw e;
      onStatus && onStatus("Search refused — listing groups and filtering here…");
      all = await Graph.readAll(`/groups?$select=${sel}&$top=999`, { scopes: S().groups, retry: true });
    }
    const match = nameMatcher(matchMode, matchText);
    const filtered = all.filter((g) => match(g.displayName || ""));
    const n = parseInt(limit, 10);
    return Number.isFinite(n) && n > 0 ? filtered.slice(0, n) : filtered;
  }

  // Parents for many groups at once. $batch answers twenty per round trip,
  // which is the difference between a sweep that finishes and one that does
  // not. A group whose memberships cannot be read is recorded rather than
  // silently treated as having none.
  async function sweepInheritance(groupIds, onStatus) {
    const parentsOf = new Map(), failed = [];
    const reqs = groupIds.map((id) => ({ id, url: `/groups/${id}/transitiveMemberOf?$select=id,displayName` }));
    onStatus && onStatus(`Reading group nesting — ${groupIds.length} groups…`);
    const out = await Graph.batch(reqs, {
      beta: false, scopes: S().groupMembers,
      onProgress: (d, total) => onStatus && onStatus(`Reading group nesting — ${d}/${total}`),
    });
    for (const id of groupIds) {
      const r = out[id];
      if (!r || r.error) { failed.push(id); parentsOf.set(id, []); continue; }
      parentsOf.set(id, ((r.body && r.body.value) || [])
        .filter((o) => !lc(o["@odata.type"]).includes("directoryrole") && !lc(o["@odata.type"]).includes("administrativeunit"))
        .map((o) => ({ id: lc(o.id), name: o.displayName })));
    }
    return { parentsOf, failed };
  }

  // Per-group tallies. A row against a PARENT credits every child too, marked
  // inherited — which is the same rule the single-group mode uses, applied the
  // other way round.
  function sweepTotals(groups, rows, parentsOf) {
    const per = new Map();
    for (const g of groups) {
      per.set(lc(g.id), {
        id: g.id, name: g.displayName || g.id,
        dynamic: !!g.membershipRule, roleAssignable: !!g.isAssignableToRole,
        missing: !!g.missing, direct: 0, inherited: 0, excluded: 0, total: 0,
        bySource: Object.fromEntries(SOURCES.map((s) => [s.id, 0])),
      });
    }
    // THIS GUARD IS LOAD-BEARING and is the only one. An id that is not in the
    // group list gets no credit — which covers both a group outside the scope
    // and the tenant-wide pseudo-id, since neither is ever in `per`. An
    // explicit `if (pid === TENANT_WIDE) continue` above the loop looked like
    // protection and was dead code; a mutation test proved it, and dead code
    // that reads as a safeguard is worse than none because it gets trusted.
    const credit = (e, r, inherited) => {
      if (!e) return;
      e.bySource[r.source] = (e.bySource[r.source] || 0) + 1;
      if (r.how === "excluded") e.excluded++;
      if (inherited) e.inherited++; else e.direct++;
      e.total++;
    };
    for (const r of rows) {
      credit(per.get(r.pid), r, false);
      if (parentsOf) {
        for (const [child, parents] of parentsOf) {
          if (child === r.pid) continue;
          if (parents.some((p) => p.id === r.pid)) credit(per.get(child), r, true);
        }
      }
    }
    return [...per.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  // The whole sweep, as one call. Returns everything the report needs.
  async function sweep(opts) {
    const { scope, matchMode, matchText, sourceIds, inheritance, onStatus } = opts;
    const byIntune = scope === "intune";
    let groups = [], enumerated = false;

    if (!byIntune) {
      groups = await enumerateGroups({ limit: scope, matchMode, matchText, onStatus });
      enumerated = true;
    }

    // MATCH-ALL when the scope is "whatever Intune assigns to": we cannot know
    // the ids before reading, so we read everything and let the answer define
    // the set. No /groups enumeration happens at all on this path.
    const ids = byIntune ? null : new Set(groups.map((g) => lc(g.id)));
    const res = await analyze({
      ids, via: new Map(), groupId: null,
      sourceIds, tenantWide: false, onStatus,
    });
    res.rows = await resolveFilters(res.rows);

    let dangling = [];
    if (byIntune) {
      const seen = [...new Set(res.rows.map((r) => r.pid).filter((p) => p !== TENANT_WIDE))];
      onStatus && onStatus(`Naming ${seen.length} groups…`);
      const look = await Graph.resolveNames(seen, { types: ["group"] });
      groups = seen.map((id) => {
        const e = look.entry(id);
        return e
          ? { id, displayName: e.name, missing: false }
          // An id an assignment names that the directory no longer has. The
          // assignment still exists and still targets nobody — worth seeing.
          : { id, displayName: `(deleted group ${id.slice(0, 8)}…)`, missing: true };
      });
      dangling = groups.filter((g) => g.missing);
      const match = nameMatcher(matchMode, matchText);
      groups = groups.filter((g) => g.missing || match(g.displayName));
    }

    let parentsOf = null, inheritanceFailed = [];
    if (inheritance && groups.length) {
      const r = await sweepInheritance(groups.filter((g) => !g.missing).map((g) => lc(g.id)), onStatus);
      parentsOf = r.parentsOf; inheritanceFailed = r.failed;
    }

    const totalsRows = sweepTotals(groups, res.rows, parentsOf);
    return {
      ...res, scope, enumerated, groups: totalsRows, dangling,
      inheritance: !!inheritance, inheritanceFailed,
      // Only meaningful when groups were ENUMERATED. On the Intune scope every
      // group in the list is used by definition, so an empty unused list there
      // is a tautology, not a finding — and saying so is the difference
      // between a report and a misleading one.
      unused: enumerated ? totalsRows.filter((g) => g.total === 0) : null,
    };
  }

  // ---------------------------------------------------------- sweep exports --
  function sweepMeta(res, opts) {
    return {
      when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
      scopeLabel: (SCOPES_IN.find((s) => s.id === res.scope) || {}).label || res.scope,
      filter: opts && opts.matchText ? `${opts.matchMode || "starts"} “${opts.matchText}”` : "",
      sources: res.ran.map((r) => r.label),
    };
  }

  function sweepMarkdown(res, m) {
    const L = [];
    L.push(`# Intune group sweep`, "");
    L.push(`Generated ${m.when} by TUNO ${m.build}`, "");
    L.push(`| | |`, `|---|---|`);
    L.push(`| Scope | ${mdCell(m.scopeLabel)} |`);
    if (m.filter) L.push(`| Name filter | ${mdCell(m.filter)} |`);
    L.push(`| Groups | ${res.groups.length} |`);
    L.push(`| Assignments | ${res.rows.length} |`);
    L.push(`| Surfaces read | ${res.ran.length}${res.failed.length ? ` (${res.failed.length} could not be read)` : ""} |`);
    L.push(`| Inheritance | ${res.inheritance ? "walked" : "NOT walked — direct assignments only"} |`);
    L.push("");

    if (!res.enumerated) {
      L.push(`> **Every group below is used by Intune by definition** — the scope was taken off the assignments themselves, so there is no unused-group finding here. Re-run against a counted scope to find groups nothing assigns to.`, "");
    }
    if (res.dangling.length) {
      L.push(`## ⚠ Dangling references (${res.dangling.length})`, "");
      L.push(`An assignment names a group the directory no longer has. **That assignment targets nobody**, and it will keep doing so silently.`, "");
      res.dangling.forEach((g) => L.push(`- \`${g.id}\``));
      L.push("");
    }
    if (res.unused && res.unused.length) {
      L.push(`## Groups nothing in Intune assigns to (${res.unused.length})`, "");
      res.unused.forEach((g) => L.push(`- ${mdCell(g.name)}${g.dynamic ? " _(dynamic)_" : ""}`));
      L.push("");
    }

    L.push(`## Groups by usage`, "");
    const cols = SOURCES.filter((s) => res.ran.some((r) => r.id === s.id));
    L.push(`| Group | Total | Direct | Inherited | Excluded | ${cols.map((c) => mdCell(c.label)).join(" | ")} |`);
    L.push(`|---|---|---|---|---|${cols.map(() => "---").join("|")}|`);
    for (const g of res.groups) {
      L.push(`| ${mdCell(g.name)}${g.dynamic ? " (dynamic)" : ""} | ${g.total} | ${g.direct} | ${g.inherited} | ${g.excluded} | ${cols.map((c) => g.bySource[c.id] || 0).join(" | ")} |`);
    }
    L.push("");
    if (res.failed.length) {
      L.push(`## Could not be read`, "");
      L.push(`**Not empty — unknown.** Every count above is missing whatever these hold.`, "");
      res.failed.forEach((f) => L.push(`- **${mdCell(f.label)}** — ${mdCell(f.error)}${f.why ? ` _${mdCell(f.why)}_` : ""}`));
      L.push("");
    }
    L.push(`---`, ``, `Intune surfaces after Ugur Koc's [Get Group Assignments](https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/configuration/get-group-assignments.ps1) (MIT); sweep model from [ENCA](https://enca.limon-it.nl)'s Group Analyzer.`);
    return L.join("\n");
  }

  function sweepCsv(res) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const cols = SOURCES.filter((s) => res.ran.some((r) => r.id === s.id));
    const L = [["Group", "GroupId", "Dynamic", "RoleAssignable", "Missing", "Total", "Direct", "Inherited", "Excluded",
      ...cols.map((c) => c.label)].map(q).join(",")];
    for (const g of res.groups) {
      L.push([g.name, g.id, g.dynamic ? "yes" : "no", g.roleAssignable ? "yes" : "no", g.missing ? "yes" : "no",
        g.total, g.direct, g.inherited, g.excluded, ...cols.map((c) => g.bySource[c.id] || 0)].map(q).join(","));
    }
    return L.join("\n");
  }

  function sweepHtml(res, m) {
    const cols = SOURCES.filter((s) => res.ran.some((r) => r.id === s.id));
    const notes = [];
    if (!res.enumerated) notes.push(`<p class="note">Every group listed is used by Intune <b>by definition</b> — the scope was taken off the assignments themselves. There is no unused-group finding here; a counted scope is what answers that.</p>`);
    if (!res.inheritance) notes.push(`<p class="note">Inheritance was not walked. A group that only receives policy <b>through a parent</b> shows zero here.</p>`);
    if (res.dangling.length) notes.push(`<p class="note bad"><b>${res.dangling.length} dangling reference${res.dangling.length === 1 ? "" : "s"}.</b> An assignment names a group the directory no longer has — it targets nobody, silently: ${res.dangling.map((g) => esc(g.id)).join(", ")}.</p>`);
    if (res.failed.length) notes.push(`<p class="note bad"><b>${res.failed.length} surface${res.failed.length === 1 ? "" : "s"} could not be read.</b> Not empty — unknown. Every count below is missing whatever they hold: ${res.failed.map((f) => esc(f.label)).join(", ")}.</p>`);
    if (res.unused && res.unused.length) notes.push(`<p class="note"><b>${res.unused.length} group${res.unused.length === 1 ? "" : "s"}</b> nothing in Intune assigns to.</p>`);

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Intune group sweep</title><style>${REPORT_CSS}
td.n{text-align:right;font-variant-numeric:tabular-nums}td.n.z{color:#9aa0ab}
tr.miss td{background:#fdeceb}</style></head><body>
<header><h1>Intune group sweep</h1><div class="meta">${esc(m.scopeLabel)}${m.filter ? ` · ${esc(m.filter)}` : ""} · generated ${esc(m.when)} by TUNO ${esc(m.build)}</div></header>
<div class="cards">
  <div class="card"><div class="n">${res.groups.length}</div><div class="l">Groups</div></div>
  <div class="card"><div class="n">${res.rows.length}</div><div class="l">Assignments</div></div>
  <div class="card${res.unused && res.unused.length ? "" : " zero"}"><div class="n">${res.unused ? res.unused.length : "—"}</div><div class="l">Unused</div></div>
  <div class="card${res.dangling.length ? " warn" : " zero"}"><div class="n">${res.dangling.length}</div><div class="l">Dangling</div></div>
</div>
<main>${notes.join("")}
  <section class="area"><h2>Groups by usage <span>${res.groups.length}</span></h2>
    <table><thead><tr><th>Group</th><th>Total</th><th>Direct</th><th>Inherited</th><th>Excluded</th>${cols.map((c) => `<th>${esc(c.icon)} ${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${res.groups.map((g) => `<tr class="${g.missing ? "miss" : ""}">
      <td><b>${esc(g.name)}</b>${g.dynamic ? ' <span class="pill tw">dynamic</span>' : ""}${g.missing ? ' <span class="pill exc">deleted</span>' : ""}</td>
      <td class="n${g.total ? "" : " z"}">${g.total}</td><td class="n${g.direct ? "" : " z"}">${g.direct}</td>
      <td class="n${g.inherited ? "" : " z"}">${g.inherited}</td><td class="n${g.excluded ? "" : " z"}">${g.excluded}</td>
      ${cols.map((c) => `<td class="n${g.bySource[c.id] ? "" : " z"}">${g.bySource[c.id] || 0}</td>`).join("")}</tr>`).join("")}</tbody></table>
  </section></main>
<footer>Intune surfaces after Ugur Koc's <a href="https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/configuration/get-group-assignments.ps1">Get Group Assignments</a> (MIT); sweep model from <a href="https://enca.limon-it.nl">ENCA</a>'s Group Analyzer. Reimplemented in browser-side JavaScript against Microsoft Graph — no code was copied.</footer>
</body></html>`;
  }

  // Assignment filters are named by id on the assignment and nowhere else. One
  // read of the filter list turns every one of them into a name; without it the
  // most consequential column in the report is a page of GUIDs.
  async function resolveFilters(rows) {
    const need = [...new Set(rows.map((r) => r.filterId).filter(Boolean))];
    if (!need.length) return rows;
    const names = {};
    try {
      (await read("/deviceManagement/assignmentFilters?$select=id,displayName,platform", S().config))
        .forEach((f) => { names[f.id] = f.displayName || f.id; });
    } catch { return rows; }
    return rows.map((r) => (r.filterId && names[r.filterId]
      ? { ...r, filterName: names[r.filterId], detail: r.detail.replace(/filter: (\w+)/, `filter: $1 “${names[r.filterId]}”`) }
      : r));
  }

  // ------------------------------------------------------------- reporting --
  // Rows grouped by source, in SOURCES order — the order is the answer's
  // shape, so it is taken from the table rather than from what happened to run.
  function grouped(rows) {
    const order = new Map(SOURCES.map((s, i) => [s.id, i]));
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.source)) m.set(r.source, []);
      m.get(r.source).push(r);
    }
    return [...m.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
      .map(([id, rs]) => ({
        source: sourceById(id),
        rows: rs.sort((x, y) => String(x.sub || "").localeCompare(String(y.sub || "")) || String(x.name).localeCompare(String(y.name))),
      }));
  }

  function totals(rows) {
    const t = { assigned: 0, excluded: 0, tenantWide: 0, inherited: 0, filtered: 0, total: rows.length };
    for (const r of rows) {
      if (r.how === "excluded") t.excluded++;
      else if (r.pid === TENANT_WIDE) t.tenantWide++;
      else t.assigned++;
      if (r.inherited) t.inherited++;
      if (r.filterMode) t.filtered++;
    }
    return t;
  }

  const HOW_LABEL = {
    assigned: "Included", excluded: "Excluded",
    "all-users": "All users (tenant-wide)", "all-devices": "All devices (tenant-wide)",
  };

  // ---------------------------------------------------------------- exports --
  function meta(group, scope, opts) {
    return {
      group, scope,
      tenantWide: !!(opts && opts.tenantWide),
      members: opts ? opts.members : null,
      when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
    };
  }

  function markdown(res, m) {
    const L = [];
    const t = totals(res.rows);
    L.push(`# Intune assignments — ${m.group.displayName || m.group.id}`, "");
    L.push(`Generated ${m.when} by TUNO ${m.build}`, "");
    L.push(`| | |`, `|---|---|`);
    L.push(`| Group | ${mdCell(m.group.displayName)} |`);
    L.push(`| Object ID | \`${m.group.id}\` |`);
    if (m.members != null) L.push(`| Direct members | ${m.members} |`);
    if (m.group.membershipRule) L.push(`| Membership | Dynamic — \`${mdCell(m.group.membershipRule)}\` |`);
    L.push(`| Assignments found | ${t.total} (${t.assigned} included, ${t.excluded} excluded${t.tenantWide ? `, ${t.tenantWide} tenant-wide` : ""}) |`);
    if (m.scope.parents.length) L.push(`| Parent groups | ${m.scope.parents.map((p) => mdCell(p.name)).join(", ")} |`);
    L.push("");

    if (m.scope.inheritanceError) {
      L.push(`> **Direct assignments only.** Group membership could not be read (${mdCell(m.scope.inheritanceError)}), so a policy assigned to a parent group is NOT in this report.`, "");
    }
    if (!m.tenantWide) {
      L.push(`> Tenant-wide assignments (All Users / All Devices) are **not** included. They land on this group's members too — re-run with them shown for the full effective surface.`, "");
    }

    for (const g of grouped(res.rows)) {
      L.push(`## ${g.source.icon} ${g.source.label} (${g.rows.length})`, "");
      L.push(`| Name | Kind | Assignment | Detail | Via |`, `|---|---|---|---|---|`);
      for (const r of g.rows) {
        L.push(`| ${mdCell(r.name)} | ${mdCell(r.sub || "")} | ${HOW_LABEL[r.how] || r.how} | ${mdCell(r.detail)} | ${mdCell(r.viaLabel || "the group itself")} |`);
      }
      L.push("");
    }
    if (!res.rows.length) L.push("_Nothing in Intune is assigned to this group._", "");

    if (res.failed.length) {
      L.push(`## Could not be read`, "");
      L.push(`These surfaces failed. **They are not empty — they are unknown**, and an assignment may exist in any of them.`, "");
      res.failed.forEach((f) => L.push(`- **${mdCell(f.label)}** — ${mdCell(f.error)}${f.why ? ` _${mdCell(f.why)}_` : ""}`));
      L.push("");
    }
    if (res.partial.length) {
      L.push(`## Read in part`, "");
      res.partial.forEach((p) => L.push(`- **${mdCell(p.label)}** — ${p.notes.map(mdCell).join("; ")}`));
      L.push("");
    }
    L.push(`---`, ``, `Intune surfaces after Ugur Koc's [Get Group Assignments](https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/configuration/get-group-assignments.ps1) (MIT); analysis machinery from [ENCA](https://enca.limon-it.nl)'s Group Analyzer. Reimplemented in browser-side JavaScript against Microsoft Graph.`);
    return L.join("\n");
  }

  function csv(res, m) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = [["Surface", "Kind", "Name", "ObjectId", "Assignment", "Intent", "Filter", "FilterMode", "Via", "Group", "GroupId"].join(",")];
    for (const r of res.rows) {
      const intent = (r.detail.match(/intent: ([^\s·]+)/) || [])[1] || "";
      L.push([r.sourceLabel, r.sub || "", r.name, r.id, HOW_LABEL[r.how] || r.how, intent,
        r.filterName || r.filterId || "", r.filterMode || "", r.viaLabel || "the group itself",
        m.group.displayName, m.group.id].map(q).join(","));
    }
    return L.join("\n");
  }

  // A standalone HTML report: neutral, self-contained, and openable by someone
  // with no access to the tenant — the artefact you attach to a change request
  // when you argue that a group must not be touched.
  const REPORT_CSS = `
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#f4f5fa;color:#1f2330}
header{padding:18px 26px;background:#1f2933;color:#fff}h1{margin:0;font-size:19px}
.meta{color:#c8d1d9;font-size:12px;margin-top:4px}
.cards{display:flex;gap:12px;padding:14px 26px;background:#fff;border-bottom:1px solid #e6e6ee;flex-wrap:wrap}
.card{background:#f7f8fc;border:1px solid #e6e6ee;border-radius:10px;padding:10px 16px;min-width:120px}
.card .n{font-size:22px;font-weight:700}.card .l{font-size:11px;color:#6b7280;text-transform:uppercase}
.card.zero .n{color:#9aa0ab}.card.warn .n{color:#b04a3a}
main{padding:18px 26px;max-width:1400px}
.note{background:#fff8e6;border:1px solid #f0dca8;border-radius:8px;padding:10px 14px;margin:0 0 14px;font-size:13px}
.note.bad{background:#fdeceb;border-color:#f2c4bf}
section.area{background:#fff;border:1px solid #e6e6ee;border-radius:10px;margin-bottom:16px;overflow:hidden}
section.area>h2{margin:0;padding:12px 18px;font-size:15px;background:#f1f2f8;border-bottom:1px solid #e6e6ee}
section.area>h2 span{font-weight:400;color:#6b7280;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:13px}
thead th{background:#f7f8fc;padding:8px 12px;text-align:left;border-bottom:1px solid #e6e6ee;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
td{padding:8px 12px;border-bottom:1px solid #f4f4f8;vertical-align:top}
tr:last-child td{border-bottom:0}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600}
.pill.inc{background:#e6f4ea;color:#1e7e34}.pill.exc{background:#fdeceb;color:#b04a3a}
.pill.tw{background:#e8eefc;color:#2b4c9b}
.via{color:#6b7280;font-size:12px}
footer{padding:14px 26px;color:#6b7280;font-size:12px}
footer a{color:#2b4c9b}`;

  function html(res, m) {
    const t = totals(res.rows);
    const pill = (how) => how === "excluded" ? `<span class="pill exc">Excluded</span>`
      : (how === "all-users" || how === "all-devices") ? `<span class="pill tw">${esc(HOW_LABEL[how])}</span>`
        : `<span class="pill inc">Included</span>`;
    const notes = [];
    if (m.scope.inheritanceError) notes.push(`<p class="note bad"><b>Direct assignments only.</b> Group membership could not be read (${esc(m.scope.inheritanceError)}), so a policy assigned to a parent group is not in this report.</p>`);
    if (!m.tenantWide) notes.push(`<p class="note">Tenant-wide assignments (All Users / All Devices) are <b>not</b> included. They reach this group's members too — the effective surface is larger than what is shown.</p>`);
    if (res.failed.length) notes.push(`<p class="note bad"><b>${res.failed.length} surface${res.failed.length === 1 ? "" : "s"} could not be read.</b> They are not empty — they are unknown: ${res.failed.map((f) => esc(f.label)).join(", ")}.</p>`);

    const areas = grouped(res.rows).map((g) => `
      <section class="area"><h2>${esc(g.source.icon)} ${esc(g.source.label)} <span>${g.rows.length}</span></h2>
        <table><thead><tr><th>Name</th><th style="width:170px">Kind</th><th style="width:170px">Assignment</th><th style="width:230px">Detail</th><th style="width:220px">Via</th></tr></thead>
        <tbody>${g.rows.map((r) => `<tr>
          <td><b>${esc(r.name)}</b></td><td>${esc(r.sub || "")}</td><td>${pill(r.how)}</td>
          <td>${esc(r.detail)}</td><td class="via">${esc(r.viaLabel || "the group itself")}</td></tr>`).join("")}</tbody></table>
      </section>`).join("");

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Intune assignments — ${esc(m.group.displayName || m.group.id)}</title><style>${REPORT_CSS}</style></head><body>
<header><h1>Intune assignments — ${esc(m.group.displayName || m.group.id)}</h1>
  <div class="meta">${esc(m.group.id)}${m.members != null ? ` · ${m.members} direct member${m.members === 1 ? "" : "s"}` : ""}${m.group.membershipRule ? " · dynamic membership" : ""} · generated ${esc(m.when)} by TUNO ${esc(m.build)}</div></header>
<div class="cards">
  <div class="card${t.assigned ? "" : " zero"}"><div class="n">${t.assigned}</div><div class="l">Included</div></div>
  <div class="card${t.excluded ? " warn" : " zero"}"><div class="n">${t.excluded}</div><div class="l">Excluded</div></div>
  ${m.tenantWide ? `<div class="card${t.tenantWide ? "" : " zero"}"><div class="n">${t.tenantWide}</div><div class="l">Tenant-wide</div></div>` : ""}
  <div class="card${t.inherited ? "" : " zero"}"><div class="n">${t.inherited}</div><div class="l">Inherited</div></div>
  <div class="card${t.filtered ? "" : " zero"}"><div class="n">${t.filtered}</div><div class="l">Filtered</div></div>
</div>
<main>${notes.join("")}${areas || '<section class="area"><h2>Nothing found</h2><table><tbody><tr><td>Nothing in Intune is assigned to this group.</td></tr></tbody></table></section>'}</main>
<footer>Intune surfaces after Ugur Koc's <a href="https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/configuration/get-group-assignments.ps1">Get Group Assignments</a> (MIT); analysis machinery from <a href="https://enca.limon-it.nl">ENCA</a>'s Group Analyzer. Reimplemented in browser-side JavaScript against Microsoft Graph — no code was copied.</footer>
</body></html>`;
  }

  return {
    TENANT_WIDE, SOURCES, HOW_LABEL, SCOPES_IN,
    sourceById, allSourceIds, scopesFor,
    intuneHits, resolveGroup, buildScope, memberCount, analyze, resolveFilters,
    grouped, totals, whyFailed, shortErr,
    meta, markdown, csv, html,
    // sweep
    sweep, enumerateGroups, sweepInheritance, sweepTotals, nameMatcher,
    sweepMeta, sweepMarkdown, sweepCsv, sweepHtml,
  };
})();


// ======================================================================
// T02 — the screen. Kept apart from the engine above so the analysis can be
// tested without a DOM, which is most of what the headless suite does.
// ======================================================================
const GroupUseTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let group = null, scope = null, result = null, members = null, running = false;
  let mode = "one", sweepRes = null;

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const chosen = () => [...document.querySelectorAll("#guAreas input[type=checkbox]")]
    .filter((c) => c.checked).map((c) => c.value);
  const tenantWide = () => !!($("guTenantWide") && $("guTenantWide").checked);

  function renderAreas() {
    const box = $("guAreas");
    if (!box) return;
    box.innerHTML = GroupUse.SOURCES.map((s) => `
      <label class="gu-area on" data-area="${esc(s.id)}">
        <input type="checkbox" value="${esc(s.id)}" checked>
        <span class="gu-a-h">${esc(s.icon)} ${esc(s.label)}</span>
        <span class="mini muted">${esc(s.hint)}</span>
      </label>`).join("");
    box.addEventListener("change", (e) => {
      const l = e.target.closest(".gu-area");
      if (l) l.classList.toggle("on", e.target.checked);
    });
  }

  function prog(msg, n, of) { TunoProgress.show("guBody", "guProg", msg, n, of); }   // ENCA-style centred card (10397)

  function showExports(on) {
    ["guMd", "guHtml", "guCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; });
  }

  // One failure renderer for both modes. A consent refusal is the failure this
  // tool hits most, and it is the one where the next step is a link rather
  // than a retry — so the link belongs here rather than in one branch.
  function fail(e) {
    const err = (typeof e === "string") ? null : e;
    const msg = err ? GroupUse.shortErr(err, 400) : String(e);
    let extra = "";
    if (err && err.kind === "admin") {
      extra = `<p class="mini" style="margin:8px 0 0">This needs an administrator to consent once for the whole tenant. ${err.consentUrl ? `<a href="${esc(err.consentUrl)}" target="_blank" rel="noopener">Open the admin-consent page →</a>` : ""}</p>`;
    } else if (err && err.kind === "consent") {
      extra = `<p class="mini" style="margin:8px 0 0">Nothing was read. Run it again and accept the permission prompt${err.consentUrl ? `, or have an administrator <a href="${esc(err.consentUrl)}" target="_blank" rel="noopener">consent for the tenant</a>` : ""}.</p>`;
    }
    $("guBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(msg)}</b></div>${extra}</div>`;
    showExports(false);
    prog("");
  }

  // ---------------------------------------------------------------- mode --
  function setMode(m) {
    mode = (m === "all") ? "all" : "one";
    const one = mode === "one";
    document.querySelectorAll("#guModeSeg [data-gumode]").forEach((b) =>
      b.classList.toggle("active", b.dataset.gumode === mode));
    $("guOneWrap").style.display = one ? "" : "none";
    $("guAllWrap").style.display = one ? "none" : "";
    // The tenant-wide toggle is a single-group idea. In a sweep every group
    // would carry the same tenant-wide rows, which says nothing about any of
    // them — so it is hidden rather than left on screen doing nothing.
    $("guTenantWideWrap").style.display = one ? "" : "none";
    $("guTenantWideNote").style.display = one ? "" : "none";
    $("guRun").textContent = one ? "🔗 Analyze group" : "🔗 Sweep tenant";
    $("guBody").innerHTML = "";
    showExports(false);
    prog("");
  }

  const sweepOpts = () => ({
    scope: $("guScope").value,
    matchMode: $("guMatchMode").value,
    matchText: $("guMatchText").value.trim(),
    inheritance: $("guSweepDeep").checked,
  });

  // Everything a run will need, asked for once before it reads anything. A
  // sweep of nine surfaces used to want nine popups, several awaits deep,
  // where the browser blocks all but the first.
  async function consentFor(areas, extra) {
    const want = [...new Set([...GroupUse.scopesFor(areas), ...(extra || [])])];
    prog(`Checking permissions — ${want.length} scope${want.length === 1 ? "" : "s"}…`);
    await Graph.ensureScopes(want);
  }

  async function runSweep() {
    const areas = chosen();
    if (!areas.length) { fail("Pick at least one place to look."); return; }
    const o = sweepOpts();
    // The sweep needs group reads on top of the surfaces: naming the ids it
    // finds, or enumerating groups, and the nesting lookups when asked for.
    await consentFor(areas, [
      ...Graph.SCOPES.groups,
      ...(o.scope === "intune" ? Graph.SCOPES.directory : []),
      ...(o.inheritance ? Graph.SCOPES.groupMembers : []),
    ]);
    sweepRes = await GroupUse.sweep({ ...o, sourceIds: areas, onStatus: prog });
    prog("");
    renderSweep(o);
  }

  async function run() {
    if (running) return;
    if (mode === "all") {
      running = true; $("guRun").disabled = true; showExports(false); $("guBody").innerHTML = "";
      try { await runSweep(); showExports(true); }
      catch (e) { fail(e); }
      finally { running = false; $("guRun").disabled = false; }
      return;
    }
    const term = ($("guTerm") && $("guTerm").value || "").trim();
    if (!term) { fail("Enter a group name or object ID."); return; }
    const areas = chosen();
    if (!areas.length) { fail("Pick at least one place to look."); return; }

    running = true;
    $("guRun").disabled = true;
    showExports(false);
    $("guBody").innerHTML = "";
    try {
      await consentFor(areas, [...Graph.SCOPES.groups, ...Graph.SCOPES.groupMembers]);
      prog("Finding the group…");
      group = await GroupUse.resolveGroup(term);
      prog(`Reading membership of “${group.displayName}”…`);
      scope = await GroupUse.buildScope(group, prog);
      members = await GroupUse.memberCount(group.id);

      result = await GroupUse.analyze({
        ids: scope.ids, via: scope.via, groupId: group.id,
        sourceIds: areas, tenantWide: tenantWide(),
        onStatus: prog,
      });
      result.rows = await GroupUse.resolveFilters(result.rows);
      prog("");
      render();
      showExports(true);
    } catch (e) {
      // A GraphError already carries the tenant's own words and its kind;
      // fail() turns that into the right next step rather than a shrug.
      fail(e);
    } finally {
      running = false;
      $("guRun").disabled = false;
    }
  }

  function render() {
    const t = GroupUse.totals(result.rows);
    const g = group;
    const stat = (n, label, cls) => `<span class="gu-stat ${n ? (cls || "") : "zero"}"><b>${n}</b> ${esc(label)}</span>`;

    const head = `<div class="gu-sticky">
      <span class="gu-who">${esc(g.displayName || g.id)}
        <span class="mini muted">${esc(g.id)}${members != null ? ` · ${members} direct member${members === 1 ? "" : "s"}` : ""}${g.membershipRule ? " · dynamic" : ""}${g.isAssignableToRole ? " · role-assignable" : ""}</span></span>
      <div class="gu-sum">
        ${stat(t.assigned, "included")}
        ${stat(t.excluded, "excluded")}
        ${tenantWide() ? stat(t.tenantWide, "tenant-wide") : ""}
        ${stat(t.inherited, "inherited")}
        ${stat(t.filtered, "filtered")}
        ${result.failed.length ? `<span class="gu-stat" style="border-color:var(--off)"><b>${result.failed.length}</b> could not be read</span>` : ""}
      </div></div>`;

    const notes = [];
    if (scope.inheritanceError) {
      notes.push(`<div class="gu-fail"><b>Direct assignments only.</b><span class="why">Group membership could not be read (${esc(scope.inheritanceError)}), so a policy assigned to a PARENT group is not in this report. The answer is narrower than it looks.</span></div>`);
    } else if (scope.parents.length) {
      notes.push(`<p class="mini muted">Inheritance included: this group is a member of ${scope.parents.map((p) => `<b>${esc(p.name)}</b>`).join(", ")}, and anything assigned to those reaches its members too.</p>`);
    }
    if (!tenantWide()) {
      notes.push(`<p class="mini muted"><b>Tenant-wide assignments are not shown.</b> All Users and All Devices land on this group's members as well, so the effective surface is larger than this. Tick the box and re-run to see it.</p>`);
    }
    if (scope.children.length) {
      notes.push(`<p class="mini muted">Contains ${scope.children.length} nested group${scope.children.length === 1 ? "" : "s"} — everything here reaches their members too.</p>`);
    }

    const sources = GroupUse.grouped(result.rows).map((grp) => `
      <div class="gu-src">
        <h5>${esc(grp.source.icon)} ${esc(grp.source.label)} <span class="mini muted">${grp.rows.length}</span>
          <a href="${esc(grp.source.doc)}" target="_blank" rel="noopener">docs ↗</a></h5>
        <div class="gu-tw"><table class="cg-table"><thead><tr>
          <th>Name</th><th style="width:170px">Kind</th><th style="width:120px">Assignment</th>
          <th style="width:220px">Detail</th><th style="width:200px">Via</th></tr></thead>
          <tbody>${grp.rows.map((r) => `<tr>
            <td><b>${esc(r.name)}</b></td>
            <td class="mini">${esc(r.sub || "")}</td>
            <td><span class="gu-how ${r.how === "excluded" ? "exc" : (r.pid === GroupUse.TENANT_WIDE ? "priv" : "inc")}">${esc(GroupUse.HOW_LABEL[r.how] || r.how)}</span></td>
            <td class="mini">${esc(r.detail)}</td>
            <td class="gu-via${r.inherited ? " parent" : ""}">${esc(r.viaLabel || "the group itself")}</td>
          </tr>`).join("")}</tbody></table></div>
      </div>`).join("");

    const failed = result.failed.length ? `<div class="list-card">
      <h4 style="margin:0 0 4px">Could not be read</h4>
      <p class="mini muted" style="margin:0 0 10px"><b>These are not empty — they are unknown.</b> An assignment may exist in any of them, and this report cannot tell you.</p>
      ${result.failed.map((f) => `<div class="gu-fail"><b>${esc(f.label)}</b> — ${esc(f.error)}${f.why ? `<span class="why">${esc(f.why)}</span>` : ""}</div>`).join("")}
    </div>` : "";

    const partial = result.partial.length ? `<div class="list-card">
      <h4 style="margin:0 0 4px">Read in part</h4>
      <p class="mini muted" style="margin:0 0 10px">Some families inside these surfaces did not answer — usually a workload the tenant does not have. What did come back is included above.</p>
      ${result.partial.map((p) => `<div class="gu-fail gu-skip"><b>${esc(p.label)}</b> — ${esc(p.notes.join("; "))}</div>`).join("")}
    </div>` : "";

    const body = result.rows.length
      ? `<div class="list-card">${notes.join("")}${sources}</div>`
      : `<div class="list-card">${notes.join("")}<p class="mini"><b>Nothing in Intune is assigned to this group</b> across the ${result.ran.length} surface${result.ran.length === 1 ? "" : "s"} that were read.${!tenantWide() ? " Tenant-wide assignments were not included — its members may still be receiving policy through All Users or All Devices." : ""}</p></div>`;

    $("guBody").innerHTML = head + body + partial + failed;
  }

  function renderSweep(o) {
    const r = sweepRes;
    const cols = GroupUse.SOURCES.filter((s) => r.ran.some((x) => x.id === s.id));
    const stat = (n, label, cls) => `<span class="gu-stat ${n ? (cls || "") : "zero"}"><b>${n}</b> ${esc(label)}</span>`;

    const head = `<div class="gu-sticky">
      <span class="gu-who">Tenant sweep
        <span class="mini muted">${esc((GroupUse.SCOPES_IN.find((s) => s.id === r.scope) || {}).label || r.scope)}${o.matchText ? ` · ${esc(o.matchMode)} “${esc(o.matchText)}”` : ""}</span></span>
      <div class="gu-sum">
        ${stat(r.groups.length, "groups")}
        ${stat(r.rows.length, "assignments")}
        ${r.unused ? stat(r.unused.length, "unused") : `<span class="gu-stat zero"><b>—</b> unused</span>`}
        ${stat(r.dangling.length, "dangling")}
        ${r.failed.length ? `<span class="gu-stat" style="border-color:var(--off)"><b>${r.failed.length}</b> could not be read</span>` : ""}
      </div></div>`;

    const notes = [];
    if (!r.enumerated) {
      notes.push(`<p class="mini muted"><b>Every group below is used by Intune by definition</b> — the scope was taken off the assignments as they were read, so the unused count is not applicable rather than zero. Finding groups nothing assigns to means enumerating groups: pick a counted scope.</p>`);
    }
    if (!r.inheritance) {
      notes.push(`<p class="mini muted"><b>Group nesting was not walked.</b> A group that only receives policy through a parent reads as zero here. Tick “Walk group nesting” to include it — it is one lookup per group, batched twenty at a time.</p>`);
    } else if (r.inheritanceFailed.length) {
      notes.push(`<div class="gu-fail"><b>Nesting could not be read for ${r.inheritanceFailed.length} group${r.inheritanceFailed.length === 1 ? "" : "s"}.</b><span class="why">Those rows show direct assignments only, so their totals are floors rather than answers.</span></div>`);
    }
    if (r.dangling.length) {
      notes.push(`<div class="gu-fail"><b>${r.dangling.length} dangling reference${r.dangling.length === 1 ? "" : "s"}.</b><span class="why">An assignment names a group the directory no longer has. That assignment targets nobody, and nothing in the portal will tell you: ${r.dangling.map((g) => esc(g.id)).join(", ")}</span></div>`);
    }

    const unused = (r.unused && r.unused.length) ? `<div class="list-card">
      <h4 style="margin:0 0 4px">Nothing in Intune assigns to these (${r.unused.length})</h4>
      <p class="mini muted" style="margin:0 0 10px">Across the ${r.ran.length} surface${r.ran.length === 1 ? "" : "s"} that were read${r.failed.length ? `, and NOT across the ${r.failed.length} that could not be` : ""}. ${r.inheritance ? "Nesting was walked, so these are not receiving policy through a parent either." : "Nesting was not walked — one of these may be receiving policy through a parent."}</p>
      <p class="mini">${r.unused.map((g) => `<span class="gu-stat zero">${esc(g.name)}${g.dynamic ? " · dynamic" : ""}</span>`).join(" ")}</p>
    </div>` : "";

    const table = `<div class="list-card">
      ${notes.join("")}
      <div class="gu-tw"><table class="cg-table"><thead><tr>
        <th>Group</th><th class="gu-num">Total</th><th class="gu-num">Direct</th><th class="gu-num">Inherited</th><th class="gu-num">Excluded</th>
        ${cols.map((c) => `<th class="gu-num" title="${esc(c.label)}">${esc(c.icon)}</th>`).join("")}</tr></thead>
        <tbody>${r.groups.map((g) => `<tr>
          <td><b${g.missing ? ' style="color:var(--off)"' : ""}>${esc(g.name)}</b>${g.dynamic ? ' <span class="gu-how priv">dynamic</span>' : ""}${g.missing ? ' <span class="gu-how exc">deleted</span>' : ""}</td>
          <td class="gu-num${g.total ? "" : " gu-zero"}"><b>${g.total}</b></td>
          <td class="gu-num${g.direct ? "" : " gu-zero"}">${g.direct}</td>
          <td class="gu-num${g.inherited ? "" : " gu-zero"}">${g.inherited}</td>
          <td class="gu-num${g.excluded ? "" : " gu-zero"}">${g.excluded}</td>
          ${cols.map((c) => `<td class="gu-num${g.bySource[c.id] ? "" : " gu-zero"}">${g.bySource[c.id] || 0}</td>`).join("")}
        </tr>`).join("")}</tbody></table></div>
      <p class="mini muted" style="margin:10px 0 0">Columns are the surfaces that were read, in the order they are listed above. Hover a header for its name.</p>
    </div>`;

    const failed = r.failed.length ? `<div class="list-card">
      <h4 style="margin:0 0 4px">Could not be read</h4>
      <p class="mini muted" style="margin:0 0 10px"><b>Every count in this sweep is missing whatever these hold.</b> They are not empty — they are unknown, and that applies to the unused list above as much as to the totals.</p>
      ${r.failed.map((f) => `<div class="gu-fail"><b>${esc(f.label)}</b> — ${esc(f.error)}${f.why ? `<span class="why">${esc(f.why)}</span>` : ""}</div>`).join("")}
    </div>` : "";

    $("guBody").innerHTML = head + (r.groups.length ? table : `<div class="list-card">${notes.join("")}<p class="mini">No groups matched this scope and filter.</p></div>`) + unused + failed;
  }

  function reset() {
    group = scope = result = null; members = null; sweepRes = null;
    if ($("guTerm")) $("guTerm").value = "";
    $("guBody").innerHTML = "";
    prog("");
    showExports(false);
    document.querySelectorAll("#guAreas input[type=checkbox]").forEach((c) => {
      c.checked = true; c.closest(".gu-area").classList.add("on");
    });
  }

  const safeName = (s) => String(s || "group").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  const m = () => GroupUse.meta(group, scope, { tenantWide: tenantWide(), members });

  // One export button per format, doing whichever thing is on screen — two
  // sets of buttons would mean two that are always wrong.
  function exportAs(fmt) {
    if (mode === "all") {
      const sm = GroupUse.sweepMeta(sweepRes, sweepOpts());
      if (fmt === "md") return download("Intune-group-sweep.md", GroupUse.sweepMarkdown(sweepRes, sm), "text/markdown");
      if (fmt === "csv") return download("Intune-group-sweep.csv", GroupUse.sweepCsv(sweepRes), "text/csv");
      return download("Intune-group-sweep.html", GroupUse.sweepHtml(sweepRes, sm), "text/html");
    }
    const n = safeName(group.displayName);
    if (fmt === "md") return download(`Intune-assignments-${n}.md`, GroupUse.markdown(result, m()), "text/markdown");
    if (fmt === "csv") return download(`Intune-assignments-${n}.csv`, GroupUse.csv(result, m()), "text/csv");
    return download(`Intune-assignments-${n}.html`, GroupUse.html(result, m()), "text/html");
  }

  function init() {
    if (!$("guAreas")) return;
    renderAreas();
    $("guModeSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-gumode]");
      if (b) setMode(b.dataset.gumode);
    });
    $("guRun").addEventListener("click", run);
    $("guReset").addEventListener("click", reset);
    $("guTerm").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    $("guMatchText").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    $("guMd").addEventListener("click", () => exportAs("md"));
    $("guCsv").addEventListener("click", () => exportAs("csv"));
    $("guHtml").addEventListener("click", () => exportAs("html"));
    setMode("one");
  }

  return { init, run, reset, renderAreas, chosen, tenantWide, setMode, sweepOpts, exportAs, getMode: () => mode };
})();

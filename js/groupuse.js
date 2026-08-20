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

      if (pid === TENANT_WIDE) { if (!o.tenantWide) continue; }
      else if (!pid || !ids.has(pid)) continue;

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
    TENANT_WIDE, SOURCES, HOW_LABEL,
    sourceById, allSourceIds, scopesFor,
    intuneHits, resolveGroup, buildScope, memberCount, analyze, resolveFilters,
    grouped, totals, whyFailed, shortErr,
    meta, markdown, csv, html,
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

  function prog(msg, n, of) {
    const el = $("guProg");
    if (el) el.innerHTML = msg ? `${of ? `<b>${n}/${of}</b> · ` : ""}${esc(msg)}` : "";
  }

  function showExports(on) {
    ["guMd", "guHtml", "guCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; });
  }

  function fail(msg) {
    $("guBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(msg)}</b></div></div>`;
    showExports(false);
  }

  async function run() {
    if (running) return;
    const term = ($("guTerm") && $("guTerm").value || "").trim();
    if (!term) { fail("Enter a group name or object ID."); return; }
    const areas = chosen();
    if (!areas.length) { fail("Pick at least one place to look."); return; }

    running = true;
    $("guRun").disabled = true;
    showExports(false);
    $("guBody").innerHTML = "";
    try {
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
      // A GraphError already carries the tenant's own words; anything else is
      // ours and is shown as-is rather than wrapped in a shrug.
      fail(GroupUse.shortErr(e, 400));
      if (e && e.consentUrl) {
        $("guBody").insertAdjacentHTML("beforeend",
          `<div class="list-card"><p class="mini">This needs an administrator to consent for the tenant. <a href="${esc(e.consentUrl)}" target="_blank" rel="noopener">Open the admin-consent page →</a></p></div>`);
      }
      prog("");
    } finally {
      running = false;
      $("guRun").disabled = false;
    }
  }

  function render() {
    const t = GroupUse.totals(result.rows);
    const g = group;
    const stat = (n, label, cls) => `<span class="gu-stat ${n ? (cls || "") : "zero"}"><b>${n}</b> ${esc(label)}</span>`;

    const head = `<div class="list-card gu-sticky">
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

  function reset() {
    group = scope = result = null; members = null;
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

  function init() {
    if (!$("guAreas")) return;
    renderAreas();
    $("guRun").addEventListener("click", run);
    $("guReset").addEventListener("click", reset);
    $("guTerm").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    $("guMd").addEventListener("click", () => download(`Intune-assignments-${safeName(group.displayName)}.md`, GroupUse.markdown(result, m()), "text/markdown"));
    $("guCsv").addEventListener("click", () => download(`Intune-assignments-${safeName(group.displayName)}.csv`, GroupUse.csv(result, m()), "text/csv"));
    $("guHtml").addEventListener("click", () => download(`Intune-assignments-${safeName(group.displayName)}.html`, GroupUse.html(result, m()), "text/html"));
  }

  return { init, run, reset, renderAreas, chosen, tenantWide };
})();

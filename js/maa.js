// ======================================================================
// T17 — Multi-admin approval (R27). After Ugur Koc's MAA Compliance
// Dashboard Report (MIT). Multi-admin approval is the Intune control
// where changing an app, a script, a settings catalog policy or a role —
// or running a device action — needs a second administrator to say yes,
// and nothing in the portal shows whether it is protecting anything.
//
// COVERAGE IS COMPUTED THE WAY MAA ACTUALLY WORKS: an approval policy
// gates an operation TYPE tenant-wide, so one policy of type app protects
// every app, and a category with no policy has no gate at all — which is
// the finding. The inventories (apps, scripts, settings catalog, roles)
// are context for the gate, not the gate itself; one whose read failed is
// UNKNOWN, never zero, and the gate verdict stands on the policy list.
//
// THE ADMINS HALF CARRIES T07's SENTENCE, because the original needs it
// and does not say it: "admins without MAA approval rights" is counted
// from deviceManagement/roleAssignments — INTUNE RBAC ONLY — so Global
// Administrator and Intune Administrator, the accounts that can change
// the most, are not in the list. Said on screen and in every export.
//
// FEWER SCOPES THAN THE ORIGINAL ASKS FOR. It connects with six,
// Directory.Read.All among them; everything here rides scopes already
// consented — the MAA surface and role assignments under the RBAC read,
// the inventories under reads earlier tools brought in, group members
// under the group-member read, names through getByIds (R07's technique).
//
// AND ONE FINDING THE ORIGINAL CANNOT MAKE: a policy whose approver
// groups hold no members is A GATE NOBODY CAN OPEN — every operation it
// gates will sit pending until someone is added. Flagged per policy,
// because it is the emptiness that matters, not the average.
//
// "No MAA policies" is distinguished from "could not read" everywhere.
// Reads only.
// ======================================================================
const Maa = (() => {
  "use strict";

  const S = () => Graph.SCOPES;
  const lc = (s) => String(s || "").toLowerCase();
  const DEFAULT_DAYS = 30;

  // The four policy types whose gated resources TUNO inventories — the
  // original's map, kept. Everything else (device actions, wipes, resets)
  // gates an ACTION rather than an inventory and is listed as such.
  const TYPE_CATEGORY = {
    app: "Applications",
    script: "Scripts",
    configurationpolicy: "Settings catalog policies",
    role: "Intune roles",
  };
  const CATEGORIES = ["Applications", "Scripts", "Settings catalog policies", "Intune roles"];

  // Request status arrives as a string on some tenants and a number on
  // others — the original tolerates both, and so does this.
  const NUM_STATUS = { 0: "pending", 1: "approved", 2: "rejected", 3: "cancelled", 4: "completed" };
  function statusOf(s) {
    if (s === null || s === undefined || s === "") return "unknown";
    if (typeof s === "number") return NUM_STATUS[s] || "other";
    const t = lc(s);
    if (t === "needsapproval" || t === "pending") return "pending";
    if (["approved", "rejected", "cancelled", "completed", "expired"].includes(t)) return t;
    return "other";
  }

  function hoursBetween(a, b) {
    const t1 = Date.parse(a || ""), t2 = Date.parse(b || "");
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
    return (t2 - t1) / 3600000;
  }

  function requestStats(requests) {
    const byStatus = { pending: 0, approved: 0, rejected: 0, cancelled: 0, completed: 0, expired: 0, other: 0, unknown: 0 };
    const durations = [];
    let undated = 0;
    for (const r of requests) {
      const st = statusOf(r.status);
      byStatus[st] = (byStatus[st] || 0) + 1;
      if (st === "approved" || st === "completed") {
        const h = hoursBetween(r.requestDateTime, r.approvalDateTime);
        if (h !== null && h >= 0) durations.push(h); else undated++;
      }
    }
    durations.sort((a, b) => a - b);
    const round = (n) => Math.round(n * 100) / 100;
    const decided = byStatus.approved + byStatus.completed + byStatus.rejected;
    return {
      total: requests.length, byStatus,
      approvalRate: decided ? round(((byStatus.approved + byStatus.completed) / decided) * 100) : null,
      avgHours: durations.length ? round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      medianHours: durations.length ? round(durations[Math.floor(durations.length / 2)]) : null,
      fastestHours: durations.length ? round(durations[0]) : null,
      slowestHours: durations.length ? round(durations[durations.length - 1]) : null,
      timedCount: durations.length, untimedCount: undated,
    };
  }

  async function report(opts) {
    const o = opts || {};
    const onStatus = o.onStatus || (() => {});
    const days = Number.isFinite(+o.days) && +o.days > 0 ? +o.days : DEFAULT_DAYS;
    const out = { days, policies: null, policyError: null, requests: null, requestsError: null,
      stats: null, coverage: null, actionGates: [], admins: null, adminsError: null,
      approverIds: {}, approverErrors: [], names: {}, nameError: null };

    // 1 — the approval policies. The core: a failure here is the headline.
    onStatus("Reading approval policies…");
    try {
      out.policies = await Graph.readAll("/deviceManagement/operationApprovalPolicies", { scopes: S().rbac, beta: true, retry: true });
    } catch (e) {
      out.policyError = String((e && e.message) || e).slice(0, 240);
      return out;
    }

    // 2 — the requests, windowed client-side (the endpoint offers no filter).
    onStatus(`Reading approval requests — last ${days} days…`);
    try {
      const all = await Graph.readAll("/deviceManagement/operationApprovalRequests", { scopes: S().rbac, beta: true, retry: true });
      const cutoff = Date.now() - days * 86400000;
      out.requests = all.filter((r) => {
        const t = Date.parse(r.requestDateTime || r.createdDateTime || "");
        return Number.isFinite(t) ? t >= cutoff : true;   // an undated request is kept, not silently dropped
      });
      out.stats = requestStats(out.requests);
    } catch (e) { out.requestsError = String((e && e.message) || e).slice(0, 240); }

    // 3 — what the gates cover. The gate verdict comes from the POLICY LIST;
    // the inventories are context and each may fail on its own.
    onStatus("Reading the gated inventories…");
    const gatedTypes = new Set(out.policies.map((p) => lc(p.policyType)));
    const inventories = [
      ["Applications", `${Graph.BETA}/deviceAppManagement/mobileApps?$select=id,displayName&$top=999`, S().apps],
      ["Scripts", `${Graph.BETA}/deviceManagement/deviceManagementScripts?$select=id,displayName`, S().scripts],
      ["Settings catalog policies", `${Graph.BETA}/deviceManagement/configurationPolicies?$select=id,name`, S().config],
      ["Intune roles", `${Graph.BETA}/deviceManagement/roleDefinitions?$select=id,displayName`, S().rbac],
    ];
    const counts = {};
    for (const [label, url, scopes] of inventories) {
      try { counts[label] = (await Graph.readAll(url, { scopes, retry: true })).length; }
      catch (e) { counts[label] = { error: String((e && e.message) || e).slice(0, 140) }; }
    }
    out.coverage = CATEGORIES.map((cat) => {
      const type = Object.keys(TYPE_CATEGORY).find((k) => TYPE_CATEGORY[k] === cat);
      const gated = gatedTypes.has(type);
      const inv = counts[cat];
      return {
        category: cat, gated,
        inventory: typeof inv === "number" ? inv : null,
        inventoryError: inv && inv.error ? inv.error : null,
      };
    });
    // Everything else a policy gates is an action, not an inventory.
    out.actionGates = [...gatedTypes].filter((t) => t && !TYPE_CATEGORY[t]).sort();

    // 4 — approvers: the policies' approver groups, membership transitive.
    const approverGroups = [...new Set(out.policies.flatMap((p) => p.approverGroupIds || []).filter(Boolean))];
    if (approverGroups.length) {
      onStatus("Reading approver group members…");
      const res = await Graph.pool(approverGroups, (gid) =>
        Graph.readAll(`${Graph.BETA}/groups/${gid}/transitiveMembers?$select=id,displayName,userPrincipalName&$top=999`, { scopes: S().groupMembers, retry: true }), 4);
      for (const r of res) {
        if (r.error) { out.approverErrors.push({ group: r.item, error: String((r.error && r.error.message) || r.error).slice(0, 140) }); continue; }
        out.approverIds[r.item] = new Set();
        for (const m of r.value || []) {
          if (/user$/i.test(String(m["@odata.type"] || ""))) out.approverIds[r.item].add(m.id);
        }
      }
    }
    const approverSet = new Set();
    Object.values(out.approverIds).forEach((s) => s.forEach((id) => approverSet.add(id)));

    // Per policy: how many people can actually open this gate? A policy
    // whose groups could not all be read is unknown, never zero.
    for (const p of out.policies) {
      const gids = (p.approverGroupIds || []).filter(Boolean);
      const unread = gids.some((g) => !out.approverIds[g]);
      const users = new Set();
      gids.forEach((g) => (out.approverIds[g] || new Set()).forEach((id) => users.add(id)));
      p.__approverCount = unread ? null : users.size;
    }

    // 5 — the Intune admins, T07's surface with T07's sentence attached.
    onStatus("Reading Intune role assignments…");
    try {
      const assignments = await Graph.readAll(`${Graph.BETA}/deviceManagement/roleAssignments`, { scopes: S().rbac, retry: true });
      const roleIds = [...new Set(assignments.map((a) => a.roleDefinitionId || (a.roleDefinition && a.roleDefinition.id)).filter(Boolean))];
      const roleReqs = roleIds.map((id) => ({ id: `r|${id}`, url: `/deviceManagement/roleDefinitions/${id}?$select=id,displayName` }));
      const roleOut = roleReqs.length ? await Graph.batch(roleReqs, { beta: true, scopes: S().rbac }) : {};
      const roleName = {};
      roleIds.forEach((id) => { const r = roleOut[`r|${id}`]; roleName[id] = (r && r.body && r.body.displayName) || id; });

      const memberGroups = [...new Set(assignments.flatMap((a) => a.members || []).filter(Boolean))];
      onStatus(`Reading admin group members — ${memberGroups.length} groups…`);
      const res = await Graph.pool(memberGroups, (gid) =>
        Graph.readAll(`${Graph.BETA}/groups/${gid}/transitiveMembers?$select=id,displayName,userPrincipalName&$top=999`, { scopes: S().groupMembers, retry: true }), 4);
      const memberOf = {};
      const groupErrors = [];
      for (const r of res) {
        if (r.error) { groupErrors.push(r.item); continue; }
        memberOf[r.item] = (r.value || []).filter((m) => /user$/i.test(String(m["@odata.type"] || "")));
      }

      const byUser = {};
      for (const a of assignments) {
        const rid = a.roleDefinitionId || (a.roleDefinition && a.roleDefinition.id);
        for (const gid of a.members || []) {
          for (const u of memberOf[gid] || []) {
            if (!byUser[u.id]) byUser[u.id] = { id: u.id, name: u.displayName || u.id, upn: u.userPrincipalName || "", roles: new Set(), isApprover: approverSet.has(u.id) };
            byUser[u.id].roles.add(roleName[rid] || rid || "?");
          }
        }
      }
      const users = Object.values(byUser).map((u) => ({ id: u.id, name: u.name, upn: u.upn, roles: [...u.roles].sort(), isApprover: u.isApprover }));
      users.sort((a, b) => (a.isApprover === b.isApprover ? a.name.localeCompare(b.name) : a.isApprover ? 1 : -1));
      out.admins = {
        users,
        approvers: users.filter((u) => u.isApprover).length,
        withoutMaa: users.filter((u) => !u.isApprover).length,
        unreadGroups: groupErrors,
      };
    } catch (e) { out.adminsError = String((e && e.message) || e).slice(0, 240); }

    // 6 — names for the approver groups, so the fold is not a page of GUIDs.
    const gids = [...new Set(out.policies.flatMap((p) => p.approverGroupIds || []).filter(Boolean))];
    if (gids.length) {
      onStatus("Resolving group names…");
      out.names = await Graph.resolveNames(gids, { types: ["group"] });
      out.nameError = out.names.error ? String(out.names.error).slice(0, 200) : null;
    }

    return out;
  }

  // ---- exports ----
  const RBAC_ONLY = "This is Intune RBAC only. Global Administrator and Intune Administrator are Entra directory roles, they grant full access to Intune, and they do not appear in deviceManagement/roleAssignments — an admins-without-MAA list that reads as the whole answer is missing the accounts with the most access.";
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  function meta() {
    return { when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "") };
  }
  function markdown(rep, m) {
    const L = [];
    L.push("# Multi-admin approval report", "");
    L.push(`Generated ${m.when} by TUNO ${m.build} — request window: last ${rep.days} days`, "");
    if (rep.policyError) {
      L.push(`> **The approval policies could not be read** — ${mdCell(rep.policyError)}. Everything below is unknown, not zero.`, "");
      return L.join("\n");
    }
    if (!rep.policies.length) {
      L.push(`**This tenant has no multi-admin approval policies.** That is an answer, not an error: no Intune operation requires a second administrator today. The coverage table below is the finding.`, "");
    }
    L.push(`## What is gated`, "", `| Category | Gate | Inventory |`, `|---|---|---|`);
    for (const c of rep.coverage) {
      L.push(`| ${c.category} | ${c.gated ? "gated tenant-wide" : "**no approval gate**"} | ${c.inventory !== null ? c.inventory : `unknown — ${mdCell(c.inventoryError || "not read")}`} |`);
    }
    L.push("");
    if (rep.actionGates.length) L.push(`Also gated, as operations rather than inventories: ${rep.actionGates.join(", ")}.`, "");
    L.push(`A gate applies to its operation type tenant-wide — one approval policy of type app protects every app. An inventory that could not be read is unknown, not zero; the gate verdict stands on the policy list either way.`, "");
    if (rep.policies.length) {
      L.push(`## Approval policies (${rep.policies.length})`, "", `| Policy | Type | Approvers |`, `|---|---|---|`);
      for (const p of rep.policies) {
        const n = p.__approverCount;
        L.push(`| ${mdCell(p.displayName || p.id)} | ${mdCell(p.policyType || "?")} | ${n === null ? "unknown — a group could not be read" : n === 0 ? "**0 — A GATE NOBODY CAN OPEN**" : n} |`);
      }
      L.push("");
      const dead = rep.policies.filter((p) => p.__approverCount === 0);
      if (dead.length) L.push(`> **${dead.length} ${dead.length === 1 ? "policy has" : "policies have"} no approvers at all.** Every operation ${dead.length === 1 ? "it gates" : "they gate"} will sit pending until someone is added to the approver group.`, "");
    }
    if (rep.stats) {
      const s = rep.stats;
      L.push(`## Requests — last ${rep.days} days (${s.total})`, "");
      L.push(`| Pending | Approved | Rejected | Cancelled | Completed | Expired |`, `|---|---|---|---|---|---|`);
      L.push(`| ${s.byStatus.pending} | ${s.byStatus.approved} | ${s.byStatus.rejected} | ${s.byStatus.cancelled} | ${s.byStatus.completed} | ${s.byStatus.expired} |`, "");
      if (s.approvalRate !== null) L.push(`Approval rate ${s.approvalRate}% of decided requests.`);
      if (s.avgHours !== null) L.push(`Time to approval over ${s.timedCount} timed requests: average ${s.avgHours}h, median ${s.medianHours}h, fastest ${s.fastestHours}h, slowest ${s.slowestHours}h.${s.untimedCount ? ` ${s.untimedCount} approved requests carry no usable timestamps and are outside these numbers, not inside them.` : ""}`);
      L.push("");
    } else if (rep.requestsError) {
      L.push(`## Requests`, "", `> Could not be read — ${mdCell(rep.requestsError)}. The request half is unknown, not quiet.`, "");
    }
    if (rep.admins) {
      L.push(`## Administrators (Intune RBAC)`, "");
      L.push(`${rep.admins.users.length} people hold Intune RBAC roles: ${rep.admins.approvers} can approve MAA requests, ${rep.admins.withoutMaa} cannot.`, "");
      L.push(`> ${RBAC_ONLY}`, "");
      if (rep.admins.unreadGroups.length) L.push(`> ${rep.admins.unreadGroups.length} assignment group(s) could not be read — the admin list is a floor, not a census.`, "");
      const noMaa = rep.admins.users.filter((u) => !u.isApprover);
      if (noMaa.length) {
        L.push(`| Administrator | UPN | Roles | MAA approver |`, `|---|---|---|---|`);
        for (const u of rep.admins.users) L.push(`| ${mdCell(u.name)} | ${mdCell(u.upn)} | ${mdCell(u.roles.join(", "))} | ${u.isApprover ? "yes" : "no"} |`);
        L.push("");
      }
    } else if (rep.adminsError) {
      L.push(`## Administrators`, "", `> Could not be read — ${mdCell(rep.adminsError)}.`, "");
    }
    L.push(`---`, `Reads only, over Graph's beta MAA surface. Who holds which Intune role, in full, is the 🛡 Intune RBAC tool's job.`);
    return L.join("\n");
  }
  function requestsCsv(rep) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["id,status,requestDateTime,approvalDateTime,justification"];
    for (const r of rep.requests || []) {
      L.push([q(r.id), q(statusOf(r.status)), q(r.requestDateTime || ""), q(r.approvalDateTime || ""), q(r.requestJustification || "")].join(","));
    }
    return L.join("\n");
  }
  function adminsCsv(rep) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["# " + RBAC_ONLY, "administrator,upn,roles,maaApprover"];
    for (const u of (rep.admins && rep.admins.users) || []) {
      L.push([q(u.name), q(u.upn), q(u.roles.join("; ")), u.isApprover ? "yes" : "no"].join(","));
    }
    return L.join("\n");
  }

  return { DEFAULT_DAYS, CATEGORIES, TYPE_CATEGORY, RBAC_ONLY, statusOf, requestStats, report, markdown, requestsCsv, adminsCsv, meta };
})();


// ======================================================================
// T17 — the screen. Engine above is DOM-free for the headless suite.
// ======================================================================
const MaaTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let rep = null, running = false;
  const open = new Set();   // fold state keyed on policy ids — the T03 rule

  function prog(msg) { TunoProgress.show("maBody", "maProg", msg); }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function showExports(on) {
    ["maMd", "maReqCsv", "maAdmCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; });
  }

  async function run() {
    if (running) return;
    running = true; $("maRun").disabled = true; showExports(false); $("maBody").innerHTML = ""; open.clear();
    try {
      const G = Graph.SCOPES;
      await Graph.ensureScopes([...new Set([...G.rbac, ...G.config, ...G.apps, ...G.scripts, ...G.groupMembers, ...G.directory])]);
      rep = await Maa.report({ days: $("maDays").value, onStatus: prog });
      prog("");
      render();
      showExports(!rep.policyError);
    } catch (e) {
      $("maBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
      prog("");
    } finally { running = false; $("maRun").disabled = false; }
  }

  function render() {
    const parts = [];
    if (rep.policyError) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>The approval policies could not be read.</b><span class="why">${esc(rep.policyError)} — everything on this page is unknown, not zero.</span></div></div>`);
      $("maBody").innerHTML = parts.join("");
      return;
    }

    const s = rep.stats;
    const card = (label, n, sub, cls) => `<div class="au-card"><div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></div>`;
    const gatedCount = rep.coverage.filter((c) => c.gated).length;
    parts.push(`<div class="au-cards">
      ${card("Approval policies", rep.policies.length, rep.policies.length ? "gates on admin operations" : "no operation needs a second admin", rep.policies.length ? "ok" : "bad")}
      ${card("Categories gated", `${gatedCount}<span class="mini muted" style="font-size:13px;font-weight:normal">/${rep.coverage.length}</span>`, rep.actionGates.length ? `plus ${rep.actionGates.length} action gate${rep.actionGates.length === 1 ? "" : "s"}` : "of the inventoried categories", gatedCount ? "" : "bad")}
      ${s ? card("Requests", s.total, `last ${rep.days} days`, "") : card("Requests", "—", "could not be read — unknown, not quiet", "bad")}
      ${s ? card("Pending", s.byStatus.pending, s.byStatus.pending ? "waiting on an approver" : "nothing waiting", s.byStatus.pending ? "bad" : "ok") : ""}
      ${s && s.approvalRate !== null ? card("Approval rate", `${s.approvalRate}%`, "of decided requests", "") : ""}
      ${rep.admins ? card("MAA approvers", rep.admins.approvers, `of ${rep.admins.users.length} Intune RBAC admins`, rep.admins.approvers ? "" : rep.policies.length ? "bad" : "") : ""}
    </div>`);

    if (!rep.policies.length) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>This tenant has never configured multi-admin approval.</b><span class="why">An answer, not an error: no Intune operation requires a second administrator today. The coverage table below is the finding.</span></div></div>`);
    }

    // coverage
    parts.push(`<div class="list-card">
      <h4 style="margin:0 0 4px">What is gated</h4>
      <p class="mini muted" style="margin:0 0 10px">A gate applies to its operation type <b>tenant-wide</b> — one approval policy of type app protects every app. The inventory is context, and one that could not be read is <b>unknown, not zero</b>; the gate verdict stands on the policy list either way.</p>
      <div class="gu-tw"><table class="cg-table"><thead><tr><th>Category</th><th style="width:220px">Gate</th><th style="width:180px">Inventory</th></tr></thead><tbody>
      ${rep.coverage.map((c) => `<tr><td><b>${esc(c.category)}</b></td>
        <td>${c.gated ? `<span class="au-op create">gated tenant-wide</span>` : `<span class="au-op delete">no approval gate</span>`}</td>
        <td class="mini">${c.inventory !== null ? c.inventory : `unknown — ${esc(c.inventoryError || "not read")}`}</td></tr>`).join("")}
      </tbody></table></div>
      ${rep.actionGates.length ? `<p class="mini muted" style="margin:8px 0 0">Also gated, as operations rather than inventories: ${rep.actionGates.map(esc).join(", ")}.</p>` : ""}
    </div>`);

    // policies, folded
    if (rep.policies.length) {
      const look = rep.names && rep.names.entry ? rep.names : null;
      const rows = rep.policies.map((p) => {
        const id = p.id || p.displayName;
        const isOpen = open.has(id);
        const n = p.__approverCount;
        const badge = n === 0 ? `<span class="au-op delete">a gate nobody can open</span>`
          : n === null ? `<span class="gu-how priv" title="An approver group could not be read — unknown, not zero">approvers unknown</span>`
          : `<span class="au-op create">${n} approver${n === 1 ? "" : "s"}</span>`;
        const groups = (p.approverGroupIds || []).map((g) => {
          const e = look && look.entry(g);
          return e ? esc(e.name) : `<code>${esc(g)}</code>`;
        });
        const head = `<div class="au-ev-h"><b>${esc(p.displayName || p.id)}</b> ${badge}
            <span class="au-when mini muted">${esc(p.policyType || "?")}</span></div>
          <div class="mini muted au-ev-m">${groups.length ? `approver group${groups.length === 1 ? "" : "s"}: ${groups.join(", ")}` : "no approver groups on the policy"} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>`;
        const detail = !isOpen ? "" : `<div class="au-detail">
          <div class="au-detail-grid mini">
            <span class="muted">Type</span><span>${esc(p.policyType || "?")} — gates that operation type tenant-wide</span>
            <span class="muted">Approvers</span><span>${n === null ? "unknown — an approver group could not be read" : n === 0 ? "<b>none — every gated operation will sit pending until someone is added</b>" : `${n} (transitive, users only)`}</span>
            ${p.lastModifiedDateTime ? `<span class="muted">Last modified</span><span>${esc(String(p.lastModifiedDateTime).replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "Z"))}</span>` : ""}
            ${p.description ? `<span class="muted">Description</span><span>${esc(p.description)}</span>` : ""}
          </div>
        </div>`;
        const cls = n === 0 ? "bad" : n === null ? "warn" : "ok";
        return `<div class="au-fold ${cls} ${isOpen ? "open" : ""}" data-mafold="${esc(id)}"><div class="au-ev-card">${head}${detail}</div></div>`;
      }).join("");
      parts.push(`<div class="list-card">
        <h4 style="margin:0 0 4px">Approval policies (${rep.policies.length})</h4>
        <p class="mini muted" style="margin:0 0 10px">Click a policy for its approvers. A policy whose approver groups hold nobody is flagged, because every operation it gates will wait forever.</p>
        ${rows}
        ${rep.approverErrors.length ? `<p class="mini muted" style="margin:8px 0 0">${rep.approverErrors.length} approver group(s) could not be read — those counts are unknown, not zero.</p>` : ""}
        ${rep.nameError ? `<p class="mini muted" style="margin:8px 0 0">Group names could not be resolved — ${esc(rep.nameError)}.</p>` : ""}
      </div>`);
    }

    // requests
    if (s) {
      parts.push(`<div class="list-card">
        <h4 style="margin:0 0 4px">Requests — last ${rep.days} days (${s.total})</h4>
        <p class="mini" style="margin:0 0 6px">${s.byStatus.pending} pending · ${s.byStatus.approved} approved · ${s.byStatus.rejected} rejected · ${s.byStatus.cancelled} cancelled · ${s.byStatus.completed} completed${s.byStatus.expired ? ` · ${s.byStatus.expired} expired` : ""}</p>
        ${s.avgHours !== null ? `<p class="mini muted" style="margin:0">Time to approval over ${s.timedCount} timed requests: average ${s.avgHours}h · median ${s.medianHours}h · fastest ${s.fastestHours}h · slowest ${s.slowestHours}h.${s.untimedCount ? ` ${s.untimedCount} approved request${s.untimedCount === 1 ? " carries" : "s carry"} no usable timestamps — outside these numbers, not inside them.` : ""}</p>` : `<p class="mini muted" style="margin:0">No timed approvals in the window${s.untimedCount ? ` — ${s.untimedCount} approved without usable timestamps` : ""}.</p>`}
      </div>`);
    } else if (rep.requestsError) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>The requests could not be read.</b><span class="why">${esc(rep.requestsError)} — the request half is unknown, not quiet.</span></div></div>`);
    }

    // admins
    if (rep.admins) {
      const a = rep.admins;
      const CAP = 100;
      parts.push(`<div class="list-card">
        <h4 style="margin:0 0 4px">Administrators — Intune RBAC (${a.users.length})</h4>
        <div class="gu-fail" style="margin:0 0 10px"><b>This is Intune RBAC only.</b><span class="why">Global Administrator and Intune Administrator are Entra directory roles, they grant full access to Intune, and they do not appear in <code>deviceManagement/roleAssignments</code> — the accounts with the most access are not in this list. The 🛡 Intune RBAC tool carries the same sentence.</span></div>
        <p class="mini" style="margin:0 0 8px">${a.approvers} of ${a.users.length} can approve MAA requests · ${a.withoutMaa} cannot${a.unreadGroups.length ? ` · ${a.unreadGroups.length} assignment group(s) unread — this list is a floor, not a census` : ""}</p>
        <div class="gu-tw"><table class="cg-table"><thead><tr><th>Administrator</th><th>UPN</th><th>Intune roles</th><th style="width:120px">MAA approver</th></tr></thead><tbody>
        ${a.users.slice(0, CAP).map((u) => `<tr><td><b>${esc(u.name)}</b></td><td class="mini">${esc(u.upn)}</td><td class="mini">${esc(u.roles.join(", "))}</td><td>${u.isApprover ? `<span class="au-op create">yes</span>` : `<span class="au-op delete">no</span>`}</td></tr>`).join("")}
        </tbody></table></div>
        ${a.users.length > CAP ? `<p class="mini muted" style="margin:8px 0 0">Showing ${CAP} of ${a.users.length} — the CSV export carries all of them.</p>` : ""}
      </div>`);
    } else if (rep.adminsError) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>The role assignments could not be read.</b><span class="why">${esc(rep.adminsError)} — the admins half is unknown.</span></div></div>`);
    }

    $("maBody").innerHTML = parts.join("");
  }

  function exportAs(fmt) {
    const m = Maa.meta();
    if (fmt === "md") return download("MAA-report.md", Maa.markdown(rep, m), "text/markdown");
    if (fmt === "req") return download("MAA-requests.csv", Maa.requestsCsv(rep), "text/csv");
    return download("MAA-admins.csv", Maa.adminsCsv(rep), "text/csv");
  }

  function init() {
    if (!$("maRun")) return;
    $("maRun").addEventListener("click", run);
    $("maMd").addEventListener("click", () => exportAs("md"));
    $("maReqCsv").addEventListener("click", () => exportAs("req"));
    $("maAdmCsv").addEventListener("click", () => exportAs("adm"));
    $("maBody").addEventListener("click", (e) => {
      const f = e.target.closest("[data-mafold]");
      if (!f || e.target.closest("a,code,button")) return;
      const id = f.dataset.mafold;
      open.has(id) ? open.delete(id) : open.add(id);
      render();
    });
  }

  return { init, run };
})();

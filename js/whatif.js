// ======================================================================
// T08 — Assignment what-if (BETA). "If I put this person in that group,
// what changes on their machine?"
//
// After Ugur Koc's IntuneAssignmentChecker (MIT), whose what-if is the one
// capability of that suite TUNO had nothing like. The reading half was
// already here — T02 answers "what does this group receive", T06 answers
// "why did this device get that" — but neither answers the question asked at
// the moment a change is still cheap to reverse: what WOULD happen.
//
// THE ENDPOINT LIST IS NOT A SECOND COPY. Assignments are read through
// GroupUse.SOURCES — T06 established the rule and the reason: the first time
// a surface is added to one list and not the other, this tool starts
// reporting "nothing changes" about a workload it never looked at.
//
// HOW THE SIMULATION WORKS, because a simulation whose mechanics are hidden
// is an oracle, and oracles get trusted past their competence:
//
//   1. The subject's group memberships TODAY are read transitively — for a
//      user from /users/{id}, for a device from the ENTRA device object,
//      because the Intune enrolment record cannot say which groups a machine
//      is in (T06 learned that; same scope, Device.Read.All).
//   2. The hypothetical set is built:
//        JOINING a group adds the group AND everything that group is
//        transitively a member of — membership of a child is membership of
//        its parents, and a what-if that forgets inheritance understates
//        every join onto a nested group.
//        LEAVING a group removes the subject's DIRECT membership and then
//        rebuilds the transitive closure from the memberships that remain,
//        because a parent reachable through another group is NOT lost.
//   3. Every assignment surface is read ONCE (T02's sweep trick: a null
//      match set matches everything) and each policy's effect is computed
//      under both sets. The difference is the answer.
//
// WHAT THE ANSWER IS AND IS NOT:
//   * Tenant-wide assignments never change with membership, so they are not
//     in the delta — the screen says so rather than showing an empty section.
//   * A FILTERED assignment is carried as "may": the filter is evaluated by
//     the service against inventory a browser cannot see, and this tool
//     refuses to promote "may" to "will" in either direction. Same rule as
//     T06, for the same reason.
//   * An EXCLUSION met by joining is a LOSS. Joining a group can take policy
//     away — that is the single most surprising row this tool can produce,
//     and the reason the delta has four states rather than two.
//   * An app with intent "uninstall" that starts to apply REMOVES software.
//     The row says "will be uninstalled", not "gained".
//   * A DYNAMIC group cannot be joined by hand — membership is the rule's
//     decision. The simulation still runs (the rule may come to match), but
//     the answer is labelled as conditional on that.
//
// Reads only. No write scope is reachable from this file.
// ======================================================================
const WhatIf = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const S = () => Graph.SCOPES;
  const shortErr = (e, m) => GroupUse.shortErr(e, m);

  const scopesFor = (sourceIds, subjectKind) => [...new Set([
    ...GroupUse.scopesFor(sourceIds),
    ...S().groups, ...S().groupMembers, ...S().directory,
    ...(subjectKind === "device" ? [...S().devices, ...S().deviceObjects] : []),
  ])];

  // ------------------------------------------------------------ subjects --
  // A user by UPN, name or GUID. Same contract as GroupUse.resolveGroup:
  // exactly one or an error a person can act on.
  async function resolveUser(term) {
    term = String(term || "").trim();
    if (!term) throw new Error("Enter a user principal name, display name or object ID");
    const sel = "id,displayName,userPrincipalName,accountEnabled";
    if (Graph.isGuid(term)) return await Graph.readOne(`/users/${encodeURIComponent(term)}?$select=${sel}`, { scopes: S().directory });
    const q = Graph.odata`/users?$filter=userPrincipalName eq '${term}' or startswith(displayName,'${term}') or startswith(userPrincipalName,'${term}')` + `&$select=${sel}&$top=10`;
    const hits = await Graph.readAll(q, { scopes: S().directory, retry: true });
    if (!hits.length) throw new Error(`No user matches “${term}”`);
    const exact = hits.filter((u) => lc(u.userPrincipalName) === lc(term) || lc(u.displayName) === lc(term));
    if (exact.length === 1) return exact[0];
    if (hits.length === 1) return hits[0];
    throw new Error(`“${term}” matches ${hits.length} users — use the UPN or the object ID`);
  }

  // ------------------------------------------------- membership, both ways --
  // direct + transitive for the subject. Direct matters because LEAVING can
  // only sever a direct edge — you cannot resign from a group you are only in
  // through another group, and the tool has to know the difference to say so.
  async function membershipsOfUser(userId) {
    const sel = "$select=id,displayName,membershipRule";
    const keep = (o) => !lc(o["@odata.type"]).includes("directoryrole") && !lc(o["@odata.type"]).includes("administrativeunit");
    const direct = (await Graph.readAll(`/users/${encodeURIComponent(userId)}/memberOf?${sel}`, { scopes: S().groupMembers, retry: true })).filter(keep);
    const transitive = (await Graph.readAll(`/users/${encodeURIComponent(userId)}/transitiveMemberOf?${sel}`, { scopes: S().groupMembers, retry: true })).filter(keep);
    return { direct, transitive };
  }

  async function membershipsOfDevice(azureADDeviceId) {
    const sel = "$select=id,displayName,membershipRule";
    const keep = (o) => !lc(o["@odata.type"]).includes("directoryrole") && !lc(o["@odata.type"]).includes("administrativeunit");
    const base = Graph.odata`/devices(deviceId='${azureADDeviceId}')`;
    const direct = (await Graph.readAll(`${base}/memberOf?${sel}`, { scopes: S().deviceObjects, retry: true })).filter(keep);
    const transitive = (await Graph.readAll(`${base}/transitiveMemberOf?${sel}`, { scopes: S().deviceObjects, retry: true })).filter(keep);
    return { direct, transitive };
  }

  // What joining `group` brings with it: the group plus its own transitive
  // parents. Read once here rather than inferred, because the subject's
  // current sets say nothing about a group they are not yet in.
  async function closureOfGroup(groupId) {
    const out = new Map([[lc(groupId), "the group itself"]]);
    const mem = await Graph.readAll(`/groups/${encodeURIComponent(groupId)}/transitiveMemberOf?$select=id,displayName`,
      { scopes: S().groupMembers, retry: true });
    for (const o of mem) {
      if (lc(o["@odata.type"]).includes("directoryrole") || lc(o["@odata.type"]).includes("administrativeunit")) continue;
      out.set(lc(o.id), `inherited through “${o.displayName || o.id}”`);
    }
    return out;
  }

  // Rebuild the transitive closure from a set of DIRECT memberships. Used for
  // the leave case: direct minus the group, then each remaining direct
  // group's parents, twenty per round trip. A membership that cannot be
  // expanded is recorded — the closure is then a floor, not the answer, and
  // the caller says so rather than presenting it as exact.
  async function closureFromDirect(directGroups, onStatus) {
    const set = new Set(directGroups.map((g) => lc(g.id)));
    const failed = [];
    const reqs = directGroups.map((g) => ({ id: lc(g.id), url: `/groups/${lc(g.id)}/transitiveMemberOf?$select=id,displayName` }));
    if (reqs.length) {
      onStatus && onStatus(`Expanding ${reqs.length} remaining memberships…`);
      const out = await Graph.batch(reqs, { beta: false, scopes: S().groupMembers });
      for (const g of directGroups) {
        const r = out[lc(g.id)];
        if (!r || r.error) { failed.push(g.displayName || g.id); continue; }
        for (const o of ((r.body && r.body.value) || [])) {
          if (lc(o["@odata.type"]).includes("directoryrole") || lc(o["@odata.type"]).includes("administrativeunit")) continue;
          set.add(lc(o.id));
        }
      }
    }
    return { set, failed };
  }

  // ------------------------------------------------------------ the delta --
  // Effect of one policy's hits under one membership set. Exclusion beats
  // inclusion — the same rule Intune applies, with T06's caveat carried in
  // prose rather than re-litigated here: for a device subject, a user-group
  // exclusion may not bind, and rows keep their pids so the report can say
  // which kind of group each edge came through.
  function effectUnder(hits, set) {
    let inc = false, exc = false, filtered = false, intents = new Set();
    for (const h of hits) {
      if (h.pid === GroupUse.TENANT_WIDE || !set.has(h.pid)) continue;
      if (h.how === "excluded") exc = true;
      else { inc = true; if (h.filterMode) filtered = true; }
      const m = /intent: ([^\s·]+)/.exec(h.detail || "");
      if (m) intents.add(m[1]);
    }
    return { state: exc ? "excluded" : inc ? "included" : "none", filtered, intents: [...intents] };
  }

  // Group rows by the OBJECT they describe. (source, sub, id) is identity —
  // two policies may share a name, and a delta keyed on names would merge
  // them into one wrong row.
  function byPolicy(rows) {
    const m = new Map();
    for (const r of rows) {
      const k = `${r.source}|${r.sub || ""}|${r.id}`;
      if (!m.has(k)) m.set(k, { key: k, source: r.source, sourceLabel: r.sourceLabel, sub: r.sub || "", id: r.id, name: r.name, hits: [] });
      m.get(k).hits.push(r);
    }
    return [...m.values()];
  }

  // The four states a policy can move between, and what each move means.
  //   gained     none → included
  //   lost       included → none  OR  included → excluded (a join can exclude)
  //   unchanged  same state both sides
  //   shielded   none → excluded: nothing changes TODAY, but the subject is
  //              now pre-excluded — if the policy is ever widened, it will
  //              still miss them. Worth a row; not worth an alarm.
  function delta(policies, before, after) {
    const out = { gained: [], lost: [], shielded: [], unchanged: [] };
    for (const p of policies) {
      const a = effectUnder(p.hits, before), b = effectUnder(p.hits, after);
      const uninstall = b.intents.includes("uninstall") || a.intents.includes("uninstall");
      const row = {
        ...p, before: a, after: b,
        maybe: a.filtered || b.filtered,
        uninstall,
      };
      if (a.state === b.state) { if (a.state !== "none") out.unchanged.push(row); }
      else if (b.state === "included") out.gained.push(row);
      else if (a.state === "included") out.lost.push({ ...row, becameExcluded: b.state === "excluded" });
      else if (b.state === "excluded") out.shielded.push(row);
      else out.unchanged.push(row);
    }
    const byName = (x, y) => String(x.name).localeCompare(String(y.name));
    Object.values(out).forEach((l) => l.sort(byName));
    return out;
  }

  // ------------------------------------------------------------------ run --
  // direction: "join" | "leave". Returns everything the report needs, with
  // every honesty flag computed here rather than at render time so it
  // survives into the exports.
  async function simulate(opts) {
    const { subject, subjectKind, group, direction, sourceIds, onStatus } = opts;
    const notes = [];

    onStatus && onStatus("Reading current memberships…");
    const mem = subjectKind === "device"
      ? await membershipsOfDevice(subject.azureADDeviceId)
      : await membershipsOfUser(subject.id);
    const before = new Set(mem.transitive.map((g) => lc(g.id)));
    const directIds = new Set(mem.direct.map((g) => lc(g.id)));
    const gid = lc(group.id);

    let after, impossible = null, closureFloor = false;
    if (direction === "join") {
      if (before.has(gid)) {
        impossible = directIds.has(gid)
          ? `${subjectKind === "device" ? "This device" : "This user"} is already a direct member of “${group.displayName}” — joining changes nothing.`
          : `${subjectKind === "device" ? "This device" : "This user"} is already in “${group.displayName}” through nesting — a direct join adds the same memberships again.`;
        after = new Set(before);
      } else {
        onStatus && onStatus("Reading what the group brings with it…");
        const cl = await closureOfGroup(group.id);
        after = new Set(before);
        for (const id of cl.keys()) after.add(id);
      }
      if (group.membershipRule) notes.push(`“${group.displayName}” has DYNAMIC membership — nobody can be added by hand. This answer is what would apply if the rule came to match, not something a portal action can produce.`);
    } else {
      if (!before.has(gid)) {
        impossible = `${subjectKind === "device" ? "This device" : "This user"} is not in “${group.displayName}” at all — leaving it changes nothing.`;
        after = new Set(before);
      } else if (!directIds.has(gid)) {
        // The membership exists but the edge to cut is somewhere else. Saying
        // WHERE is the useful half of the answer.
        impossible = `The membership is INHERITED — ${subjectKind === "device" ? "the device" : "the user"} is in “${group.displayName}” through another group, not directly, so removing them from it is not an action the portal offers. The delta below is empty because the direct memberships are unchanged.`;
        after = new Set(before);
      } else {
        const remaining = mem.direct.filter((g) => lc(g.id) !== gid);
        const r = await closureFromDirect(remaining, onStatus);
        after = r.set;
        if (r.failed.length) {
          closureFloor = true;
          notes.push(`${r.failed.length} remaining membership${r.failed.length === 1 ? "" : "s"} could not be expanded (${r.failed.slice(0, 3).join(", ")}${r.failed.length > 3 ? "…" : ""}). The after-set is a FLOOR: a policy shown as lost may in fact be kept through one of them.`);
        }
        if (group.membershipRule) notes.push(`“${group.displayName}” has DYNAMIC membership — a member cannot be removed by hand while the rule matches them. This answer is what would apply if the rule stopped matching.`);
      }
    }

    // One read of every surface; the null match set is the sweep trick.
    onStatus && onStatus("Reading assignments…");
    const res = await GroupUse.analyze({
      ids: null, via: new Map(), groupId: null,
      sourceIds, tenantWide: false,
      onStatus: (m, d, t) => onStatus && onStatus(m, d, t),
    });
    res.rows = await GroupUse.resolveFilters(res.rows);

    const d = delta(byPolicy(res.rows), before, after);
    return {
      subject, subjectKind, group, direction, mem,
      before, after, delta: d, notes, impossible, closureFloor,
      ran: res.ran, failed: res.failed, partial: res.partial,
    };
  }

  // ------------------------------------------------- group vs group compare --
  // Two or more groups side by side: what each receives that the others do
  // not. Same single read; each group's set is itself plus its parents.
  async function compare(opts) {
    const { groups, sourceIds, onStatus } = opts;
    onStatus && onStatus("Reading what each group inherits…");
    const sets = [];
    for (const g of groups) {
      const cl = await closureOfGroup(g.id);
      sets.push({ group: g, set: new Set(cl.keys()) });
    }
    onStatus && onStatus("Reading assignments…");
    const res = await GroupUse.analyze({
      ids: null, via: new Map(), groupId: null, sourceIds, tenantWide: false,
      onStatus: (m, d, t) => onStatus && onStatus(m, d, t),
    });
    res.rows = await GroupUse.resolveFilters(res.rows);

    const policies = byPolicy(res.rows);
    const rows = [];
    for (const p of policies) {
      const eff = sets.map((s) => effectUnder(p.hits, s.set));
      if (eff.every((e) => e.state === "none")) continue;   // reaches none of them
      rows.push({ ...p, eff });
    }
    rows.sort((x, y) => String(x.sourceLabel).localeCompare(String(y.sourceLabel)) || String(x.name).localeCompare(String(y.name)));
    const differs = rows.filter((r) => new Set(r.eff.map((e) => e.state)).size > 1);
    return { groups, sets, rows, differs, ran: res.ran, failed: res.failed, partial: res.partial };
  }

  // ---------------------------------------------------------------- exports --
  const STATE_LABEL = { included: "reaches it", excluded: "excluded", none: "—" };

  function meta() {
    return {
      when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
    };
  }

  function simLine(res) {
    const who = res.subjectKind === "device" ? (res.subject.deviceName || res.subject.id) : (res.subject.userPrincipalName || res.subject.displayName);
    return `${who} ${res.direction === "join" ? "joins" : "leaves"} “${res.group.displayName}”`;
  }

  function markdown(res, m) {
    const L = [];
    L.push(`# What-if — ${simLine(res)}`, "");
    L.push(`Generated ${m.when} by TUNO ${m.build}. **A simulation, not a promise** — filters and dynamic rules are evaluated by the service, and rows marked “may” depend on them.`, "");
    if (res.impossible) L.push(`> **${mdCell(res.impossible)}**`, "");
    res.notes.forEach((n) => L.push(`> ${mdCell(n)}`, ""));
    const sec = (title, rows, fmt) => {
      L.push(`## ${title} (${rows.length})`, "");
      if (!rows.length) { L.push("_None._", ""); return; }
      L.push(`| Policy | Surface | Kind | Note |`, `|---|---|---|---|`);
      rows.forEach((r) => L.push(`| ${mdCell(r.name)} | ${mdCell(r.sourceLabel)} | ${mdCell(r.sub)} | ${mdCell(fmt(r))} |`));
      L.push("");
    };
    sec("Gained", res.delta.gained, (r) => [r.uninstall ? "intent is UNINSTALL — applying this REMOVES the software" : "", r.maybe ? "has an assignment filter — may apply" : ""].filter(Boolean).join("; ") || "will apply");
    sec("Lost", res.delta.lost, (r) => [r.becameExcluded ? "an exclusion on the group takes it away" : "no remaining assignment reaches the subject", r.maybe ? "filtered — the loss is conditional" : ""].filter(Boolean).join("; "));
    sec("Pre-excluded (no change today)", res.delta.shielded, () => "does not apply now and cannot apply later while the exclusion stands");
    sec("Unchanged", res.delta.unchanged, (r) => STATE_LABEL[r.after.state] || "");
    if (res.failed.length) {
      L.push(`## Could not be read`, "", `**Not empty — unknown.** The delta is missing whatever these hold.`, "");
      res.failed.forEach((f) => L.push(`- **${mdCell(f.label)}** — ${mdCell(f.error)}`));
      L.push("");
    }
    L.push(`---`, ``, `After Ugur Koc's [Intune Assignment Checker](https://github.com/ugurkocde/IntuneAssignmentChecker) (MIT); assignment reads via TUNO's Group Analyzer sources.`);
    return L.join("\n");
  }

  function csv(res) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = [["Change", "Policy", "ObjectId", "Surface", "Kind", "Before", "After", "Conditional", "Uninstall"].map(q).join(",")];
    const add = (change, rows) => rows.forEach((r) => L.push([change, r.name, r.id, r.sourceLabel, r.sub,
      r.before.state, r.after.state, r.maybe ? "filtered" : "", r.uninstall ? "yes" : ""].map(q).join(",")));
    add("gained", res.delta.gained); add("lost", res.delta.lost);
    add("pre-excluded", res.delta.shielded); add("unchanged", res.delta.unchanged);
    return L.join("\n");
  }

  function compareMarkdown(cmp, m) {
    const L = [];
    L.push(`# Group comparison — ${cmp.groups.map((g) => mdCell(g.displayName)).join(" vs ")}`, "");
    L.push(`Generated ${m.when} by TUNO ${m.build}. Each column is the group **plus what it inherits from its own parents**.`, "");
    L.push(`| Policy | Surface | Kind | ${cmp.groups.map((g) => mdCell(g.displayName)).join(" | ")} |`);
    L.push(`|---|---|---|${cmp.groups.map(() => "---").join("|")}|`);
    for (const r of cmp.differs) {
      L.push(`| ${mdCell(r.name)} | ${mdCell(r.sourceLabel)} | ${mdCell(r.sub)} | ${r.eff.map((e) => (STATE_LABEL[e.state] || "—") + (e.filtered ? " (filtered)" : "")).join(" | ")} |`);
    }
    if (!cmp.differs.length) L.push(`| _No differences — every policy that reaches one reaches all._ |${cmp.groups.map(() => " |").join("")}`);
    L.push("", `${cmp.rows.length - cmp.differs.length} further polic${cmp.rows.length - cmp.differs.length === 1 ? "y" : "ies"} reach${cmp.rows.length - cmp.differs.length === 1 ? "es" : ""} all of them equally and ${cmp.rows.length - cmp.differs.length === 1 ? "is" : "are"} not listed.`, "");
    if (cmp.failed.length) {
      L.push(`## Could not be read`, "", `**Not empty — unknown.**`, "");
      cmp.failed.forEach((f) => L.push(`- **${mdCell(f.label)}** — ${mdCell(f.error)}`));
    }
    return L.join("\n");
  }

  return {
    scopesFor, resolveUser, membershipsOfUser, membershipsOfDevice,
    closureOfGroup, closureFromDirect, effectUnder, byPolicy, delta,
    simulate, compare, meta, simLine, markdown, csv, compareMarkdown,
    STATE_LABEL,
  };
})();

// ======================================================================
// T08 — the screen. The engine above is DOM-free and is what the headless
// suite exercises.
// ======================================================================
const WhatIfTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let mode = "sim", subjectKind = "user", direction = "join";
  let result = null, cmpResult = null, running = false;

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const prog = (m) => TunoProgress.show("wfBody", "wfProg", m);   // ENCA-style centred card (10397)

  function renderAreas() {
    $("wfAreas").innerHTML = GroupUse.SOURCES.map((s) =>
      `<label class="chk gu-area"><input type="checkbox" data-wfsrc="${s.id}" checked> ${esc(s.icon)} ${esc(s.label)}</label>`).join("");
  }
  const pickedSources = () => [...document.querySelectorAll("[data-wfsrc]:checked")].map((b) => b.dataset.wfsrc);

  function stateCell(e) {
    if (e.state === "included") return `<span class="gu-how inc">reaches it${e.filtered ? " *" : ""}</span>`;
    if (e.state === "excluded") return `<span class="gu-how exc">excluded</span>`;
    return `<span class="mini muted">—</span>`;
  }

  function renderSim(res) {
    const d = res.delta;
    const stat = (n, label, cls) => `<span class="gu-stat ${n ? (cls || "") : "zero"}"><b>${n}</b> ${label}</span>`;
    const strip = `<div class="gu-sum">
      ${stat(d.gained.length, "gained")}
      ${stat(d.lost.length, "lost")}
      ${stat(d.shielded.length, "pre-excluded")}
      ${stat(d.unchanged.length, "unchanged")}
      ${res.failed.length ? `<span class="gu-stat" style="border-color:var(--off)"><b>${res.failed.length}</b> could not be read</span>` : ""}
      <span class="mini muted">${res.ran.length} surfaces read</span>
    </div>`;
    const warn = (t, cls) => `<p class="mini ${cls || "muted"}" style="margin:8px 0 0">${t}</p>`;
    const notes = [
      res.impossible ? warn(`<b>${esc(res.impossible)}</b>`, "") : "",
      ...res.notes.map((n) => warn(esc(n))),
      warn(`Tenant-wide assignments are not in a membership delta — they apply whatever the groups say. <b>A simulation, not a promise:</b> rows marked * carry an assignment filter the service evaluates against inventory this page cannot see.`),
    ].join("");
    const table = (title, rows, note) => rows.length ? `
      <h3 style="margin:16px 0 6px">${title} <span class="mini muted">${rows.length}</span></h3>
      <div style="overflow-x:auto"><table class="plist"><thead><tr><th>Policy</th><th>Surface</th><th>Kind</th><th>Before</th><th>After</th><th>Note</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><b>${esc(r.name)}</b></td><td>${esc(r.sourceLabel)}</td><td>${esc(r.sub)}</td>
        <td>${stateCell(r.before)}</td><td>${stateCell(r.after)}</td>
        <td class="mini">${esc(note(r))}</td></tr>`).join("")}</tbody></table></div>` : "";
    const failed = res.failed.length ? `<div class="gu-fail" style="margin-top:12px"><b>${res.failed.length} surface${res.failed.length === 1 ? "" : "s"} could not be read — not empty, UNKNOWN:</b> ${res.failed.map((f) => esc(f.label)).join(", ")}. The delta is missing whatever they hold.</div>` : "";
    $("wfBody").innerHTML = `<div class="list-card">${strip}${notes}
      ${table("⬇ Gained", d.gained, (r) => r.uninstall ? "intent is UNINSTALL — applying REMOVES the software" : r.maybe ? "filtered — may apply" : "will apply")}
      ${table("⬆ Lost", d.lost, (r) => r.becameExcluded ? "an exclusion on this group takes it away" : "no remaining assignment reaches the subject")}
      ${table("🛡 Pre-excluded — no change today", d.shielded, () => "cannot apply later while the exclusion stands")}
      ${table("· Unchanged", d.unchanged, () => "")}
      ${!d.gained.length && !d.lost.length && !d.shielded.length ? `<p class="mini" style="margin-top:12px"><b>No policy changes hands.</b>${res.impossible ? "" : " The group carries no assignments the subject does not already have."}</p>` : ""}
      ${failed}</div>`;
    ["wfMd", "wfCsv"].forEach((b) => { $(b).style.display = ""; });
  }

  function renderCompare(cmp) {
    const head = cmp.groups.map((g) => `<th>${esc(g.displayName)}</th>`).join("");
    const rows = cmp.differs.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.sourceLabel)}</td><td>${esc(r.sub)}</td>${r.eff.map((e) => `<td>${stateCell(e)}</td>`).join("")}</tr>`).join("");
    const same = cmp.rows.length - cmp.differs.length;
    const failed = cmp.failed.length ? `<div class="gu-fail" style="margin-top:12px"><b>${cmp.failed.length} surface${cmp.failed.length === 1 ? "" : "s"} could not be read:</b> ${cmp.failed.map((f) => esc(f.label)).join(", ")} — not empty, unknown.</div>` : "";
    const stat = (n, label) => `<span class="gu-stat ${n ? "" : "zero"}"><b>${n}</b> ${label}</span>`;
    $("wfBody").innerHTML = `<div class="list-card">
      <div class="gu-sum">${stat(cmp.differs.length, "differ")}${stat(same, "identical")}<span class="mini muted">${cmp.ran.length} surfaces read</span></div>
      <p class="mini muted" style="margin:8px 0 0">Each column is the group <b>plus what it inherits from its own parents</b>. Policies reaching all groups equally are counted, not listed.</p>
      ${cmp.differs.length ? `<div style="overflow-x:auto;margin-top:10px"><table class="plist"><thead><tr><th>Policy</th><th>Surface</th><th>Kind</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="mini" style="margin-top:12px"><b>No differences</b> — every policy that reaches one of these groups reaches all of them.</p>`}
      ${failed}</div>`;
    $("wfMd").style.display = "";
    $("wfCsv").style.display = "none";
  }

  function fail(msg) {
    $("wfBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(msg)}</b></div></div>`;
  }

  async function run() {
    if (running) return;
    running = true; result = null; cmpResult = null;
    ["wfMd", "wfCsv"].forEach((b) => { $(b).style.display = "none"; });
    $("wfBody").innerHTML = "";
    try {
      const sources = pickedSources();
      if (!sources.length) throw new Error("Pick at least one surface to read.");
      await Graph.ensureScopes(WhatIf.scopesFor(sources, subjectKind));
      if (mode === "sim") {
        prog("Finding the subject…");
        let subject;
        if (subjectKind === "device") {
          const f = await DeviceWhy.findDevice($("wfSubject").value, prog);
          subject = f.device || (() => { throw new Error(f.error || "Device not found"); })();
          if (!subject.azureADDeviceId) throw new Error("This device has no Entra device id, so its group memberships cannot be read.");
        } else {
          subject = await WhatIf.resolveUser($("wfSubject").value);
        }
        prog("Finding the group…");
        const group = await GroupUse.resolveGroup($("wfGroup").value);
        result = await WhatIf.simulate({ subject, subjectKind, group, direction, sourceIds: sources, onStatus: prog });
        renderSim(result);
      } else {
        const names = $("wfGroups").value.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
        if (names.length < 2) throw new Error("Name at least two groups, one per line.");
        if (names.length > 4) throw new Error("Four groups at most — a wider table answers nothing.");
        const groups = [];
        for (const n of names) { prog(`Finding “${n}”…`); groups.push(await GroupUse.resolveGroup(n)); }
        cmpResult = await WhatIf.compare({ groups, sourceIds: sources, onStatus: prog });
        renderCompare(cmpResult);
      }
      prog("");
    } catch (e) {
      prog("");
      fail(GroupUse.shortErr(e, 300));
    } finally { running = false; }
  }

  function init() {
    if (!$("wfRun")) return;
    renderAreas();
    $("wfModeSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-wfmode]"); if (!b) return;
      mode = b.dataset.wfmode;
      [...$("wfModeSeg").children].forEach((x) => x.classList.toggle("active", x === b));
      $("wfSimWrap").style.display = mode === "sim" ? "" : "none";
      $("wfCmpWrap").style.display = mode === "cmp" ? "" : "none";
      $("wfRun").textContent = mode === "sim" ? "🔮 Simulate" : "🔮 Compare groups";
    });
    $("wfKindSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-wfkind]"); if (!b) return;
      subjectKind = b.dataset.wfkind;
      [...$("wfKindSeg").children].forEach((x) => x.classList.toggle("active", x === b));
      $("wfSubject").placeholder = subjectKind === "device"
        ? "Device name, serial or GUID…" : "User principal name, display name or object ID…";
    });
    $("wfDirSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-wfdir]"); if (!b) return;
      direction = b.dataset.wfdir;
      [...$("wfDirSeg").children].forEach((x) => x.classList.toggle("active", x === b));
    });
    $("wfRun").addEventListener("click", run);
    ["wfSubject", "wfGroup"].forEach((id) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") run(); }));
    $("wfReset").addEventListener("click", () => {
      result = null; cmpResult = null; $("wfBody").innerHTML = ""; prog("");
      ["wfSubject", "wfGroup", "wfGroups"].forEach((id) => { $(id).value = ""; });
      ["wfMd", "wfCsv"].forEach((b) => { $(b).style.display = "none"; });
    });
    $("wfMd").addEventListener("click", () => {
      if (result) download("whatif.md", WhatIf.markdown(result, WhatIf.meta()), "text/markdown");
      else if (cmpResult) download("group-comparison.md", WhatIf.compareMarkdown(cmpResult, WhatIf.meta()), "text/markdown");
    });
    $("wfCsv").addEventListener("click", () => { if (result) download("whatif.csv", WhatIf.csv(result), "text/csv"); });
  }

  return { init };
})();

// ======================================================================
// T22 — Group migration (BETA). Role-assignable security group → plain
// security group inside a restricted management administrative unit.
//
// Ported from ENCA's ⑦ Migrate (js/cagroups.js + js/rmau.js). ENCA's flow
// is built on Conditional Access: its candidates are the groups a CA
// policy excludes, its destination unit is read off the CA number in the
// group's name, and it repoints CA policy assignments. TUNO has none of
// those. What survives the port is the REASONING and the ORDER OF
// OPERATIONS, which is where the safety lives; the CA machinery does not.
//
// WHY ANYONE WOULD DO THIS. A group is made role-assignable for one side
// effect: only Global Administrator or Privileged Role Administrator can
// change its members. A restricted management administrative unit does
// that job better, because it lets you NAME who may manage the group
// instead of leaving it to whoever holds PRA. It also drops the
// role-assignable costs — the 500-per-tenant cap, no dynamic membership,
// no nesting control.
//
// THE TWO MUST NEVER BE COMBINED. A role-assignable group admits only
// GA/PRA; a restricted unit blocks exactly those two; and neither can be
// assigned at administrative-unit scope. A group that is both is a group
// whose members NOBODY can edit. That state is real and this tool refuses
// to create it.
//
// `isAssignableToRole` IS IMMUTABLE, so this is a recreate, not a patch.
// The new group has a new object id, and that single fact is the whole
// risk of the tool. Everything below is arranged around it:
//
//   * WHAT TUNO CAN REPOINT, IT REPOINTS. The four surfaces T11 already
//     writes under DeviceManagementConfiguration.ReadWrite.All — device
//     configuration, settings catalog, compliance, administrative
//     templates. AssignEdit's engine does the writing, so the drift check,
//     the verify read-back and the filter-preserving serialisation are the
//     ones that have been in production since build 8 rather than a second
//     copy of them.
//   * WHAT IT CANNOT, IT NAMES. Applications, scripts, app protection, app
//     configuration, enrolment restrictions, Autopilot and update rings
//     each need a write scope this registration does not declare, and
//     adding a write scope is a decision taken in the open (the R18 rule),
//     not a side effect of a feature. They are read — T02's reader answers
//     for all nine surfaces — and listed as work the operator must finish.
//   * WHAT IT CANNOT EVEN SEE, IT SAYS SO. Conditional Access, group-based
//     licensing, Azure RBAC, app role assignments. TUNO is an Intune tool
//     and the report says that in the same breath as the new object id.
//
// THE ARCHIVED GROUP IS THE ROLLBACK. The original is renamed aside, never
// deleted — it keeps its members and stays role-assignable. Deleting it is
// the operator's decision, taken after checking the references this tool
// could not move.
// ======================================================================
const GroupMigrate = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ---------------------------------------------------------- scopes ------
  // Named where they are used, so a reader can see what the button costs
  // before pressing it. READ AND WRITE ARE SEPARATE ENTRIES: the role check
  // only ever reads, and it must not be able to reach the write scope by
  // sharing a constant with the code that grants a scoped administrator.
  const SCOPES = {
    // rename the original, create the replacement, copy the members
    groupWrite: ["Group.ReadWrite.All"],
    // "does this group CARRY a directory role?" — read only. A group that
    // holds one cannot be migrated at all, so this is a refusal check, and a
    // refusal check that needed a write scope would be absurd.
    rolesRead: ["RoleManagement.Read.Directory"],
    // READING an administrative unit. Its own scope, and NOT
    // Graph.SCOPES.directory — which is named `directory` but is
    // ["User.Read.All", "Group.Read.All"], the user-and-group directory
    // reads, not Directory.Read.All. Build 10507 handed those two to
    // /directory/administrativeUnits and the tenant answered "Insufficient
    // privileges to complete the operation", which is exactly right: the
    // least-privileged permission for that collection is this one.
    //
    // Listed separately from auWrite even though ReadWrite.All would cover
    // every read, for the reason New-TunoAppRegistration.ps1 already gives
    // about the Intune scopes: ENTRA CONSENTS BY NAME. A token requested
    // for Read.All is refused unless Read.All itself is consented — and
    // asking for the write scope to satisfy a read would mean a screen that
    // only lists units holding the right to create and delete them.
    auRead: ["AdministrativeUnit.Read.All"],
    // create the unit and put the group in it
    auWrite: ["AdministrativeUnit.ReadWrite.All"],
    // grant a scoped administrator on a unit THIS TOOL created. Asked for
    // only on that path — a run that files groups into an existing unit
    // never touches it, and the plan says which of the two it is.
    roleWrite: ["RoleManagement.ReadWrite.Directory"],
  };
  // Everything a migration that creates its own unit needs. A migration into
  // an existing unit is the same list minus roleWrite; plan() reports which.
  const ALL_SCOPES = [...new Set([
    ...SCOPES.groupWrite, ...SCOPES.rolesRead, ...SCOPES.auRead,
    ...SCOPES.auWrite, ...SCOPES.roleWrite,
  ])];
  // What the tool asks for BEFORE it can write anything — the read pass.
  const READ_SCOPES = () => [...new Set([
    ...Graph.SCOPES.groups, ...Graph.SCOPES.groupMembers, ...SCOPES.auRead,
  ])];

  // ------------------------------------------------ the permission plan -----
  // WHAT THIS TOOL WILL EVER ASK FOR, in one list, so it can be granted in
  // ONE prompt instead of four spread across a run — and so the person
  // granting can read what each one buys before agreeing to it rather than
  // afterwards.
  //
  // This does NOT replace asking at the click. Read still requests only the
  // read scopes and Migrate still requests the write ones, so a read-only
  // visit to the screen still leaves the session holding no write scope. The
  // button is the other option, taken deliberately: consent to the whole
  // tool up front. Both routes end at the same place; only the number of
  // Microsoft prompts differs.
  //
  // The Intune read scopes are read from the tools that own them rather than
  // copied — T22 borrows T11's reader and T02's, and a second list here
  // would drift from theirs the first time either gained a surface.
  function permissionPlan() {
    const intune = [...new Set([
      ...(typeof AssignEdit !== "undefined" ? AssignEdit.READ() : []),
      ...(typeof GroupUse !== "undefined" ? GroupUse.scopesFor(GroupUse.allSourceIds()) : []),
    ])].map((s) => ({ s, why: "read the assignments that name this group, so the report can say which ones move and which do not" }));
    return [
      {
        key: "read", label: "Read — the groups and the directory",
        scopes: [
          { s: Graph.SCOPES.groups[0], why: "list every role-assignable security group in the tenant" },
          { s: Graph.SCOPES.groupMembers[0], why: "read a group's members before copying them across" },
          { s: SCOPES.auRead[0], why: "list the restricted units, and answer whether a group is already inside one — the 🧊 frozen case" },
          { s: SCOPES.rolesRead[0], why: "check whether a group CARRIES a directory role; a group that does cannot be migrated at all" },
        ],
      },
      { key: "intune", label: "Read — what Intune points at the group", scopes: intune },
      {
        key: "write", label: "Write — the migration itself", warn: true,
        scopes: [
          { s: SCOPES.groupWrite[0], why: "rename the original aside, create the replacement, copy the members" },
          { s: (typeof AssignEdit !== "undefined" ? AssignEdit.WRITE()[0] : "DeviceManagementConfiguration.ReadWrite.All"),
            why: "repoint the four Intune assignment surfaces TUNO is permitted to write" },
          { s: SCOPES.auWrite[0], why: "create the restricted administrative unit and put the new group in it" },
          { s: SCOPES.roleWrite[0], why: "grant Groups Administrator scoped to a unit this tool creates — without it the unit is a vault nobody can open" },
        ],
      },
    ];
  }
  const allPermissions = () => [...new Set(permissionPlan().flatMap((g) => g.scopes.map((x) => x.s)))];

  // ---------------------------------------------- where AUs actually live ---
  // ENCA talks to /beta everywhere, where an administrative unit is a
  // top-level `/administrativeUnits`. TUNO talks to v1.0, where it is NOT:
  // the resource is nested under `/directory`, and the flat path answers
  //
  //   Resource not found for the segment 'administrativeUnits'
  //
  // which is what beta 10506 did on a real tenant the moment the tool read
  // the units. Everything else about the resource is GA on v1.0 —
  // isMemberManagementRestricted included, immutable and settable at
  // creation — so the fix is the right path, not a jump to beta for a
  // directory write. One constant, so there is one place to be wrong.
  //   list/create   /directory/administrativeUnits
  //   add member    /directory/administrativeUnits/{id}/members/$ref
  //   scoped role   /directory/administrativeUnits/{id}/scopedRoleMembers
  const AU = "/directory/administrativeUnits";

  // Groups Administrator, scoped to the unit. The only template offered:
  // this tool creates a unit to hold GROUPS, and the role that manages group
  // membership at unit scope is this one. Anything else is a decision for
  // the portal, where the whole catalogue is visible.
  const GROUPS_ADMIN_TEMPLATE = "fdd7a751-b60b-444a-984c-02652fe8fa1c";

  // ------------------------------------------------------ archive naming ---
  const isoDay = () => new Date().toISOString().slice(0, 10);
  const MIGRATED_TAG = "migrated";
  // ENCA's ARCHIVE_SUFFIX, narrowed to the one suffix THIS tool writes plus
  // the ones ENCA leaves in a shared tenant — a group already wearing one is
  // the archived half of an earlier run and must never be migrated again.
  const ARCHIVE_SUFFIX = /(\s*\((?:legacy|nesting|migrated)\s+\d{4}-\d{2}-\d{2}\)|-static-[\w.-]+)\s*$/i;
  // The MATCHER above is a RegExp; this is the literal the tool writes.
  // Interpolating the matcher into a name yields nonsense, so the two are
  // kept apart by name and the mistake is hard to make. (ENCA's note, and
  // the reason it is a note.)
  const migratedName = (name) => `${name} (${MIGRATED_TAG} ${isoDay()})`;

  // -------------------------------------------------- unit naming ----------
  // THE CONVENTION IS `INT-` — Intune's prefix in this tenant, not the
  // product's name. Everything TUNO creates in a directory wears it.
  const UNIT_PREFIX = "INT-RMAU-";

  // Split a group name into the segments an administrator would read.
  const segments = (name) => String(name || "").split(/[-_\s.]+/).filter(Boolean);

  // Which leading segment is the tenant's own prefix? The one most of the
  // candidate groups share. Detected rather than configured, because a
  // hard-coded list would be wrong in the second tenant — and reported to
  // the caller, because a naming rule nobody can see is a rule nobody can
  // check. A tenant with no dominant prefix gets none, and the first
  // segment names the unit.
  const PREFIX_SHARE = 0.6;
  function tenantPrefix(names) {
    const list = (names || []).map((n) => segments(n)[0]).filter(Boolean);
    if (list.length < 3) return "";
    const tally = new Map();
    list.forEach((s) => tally.set(lc(s), (tally.get(lc(s)) || 0) + 1));
    let best = "", n = 0;
    for (const [k, v] of tally) if (v > n) { best = k; n = v; }
    return n / list.length >= PREFIX_SHARE ? best : "";
  }

  // The unit a group would go to by default. Deliberately a DEFAULT: the
  // screen shows it per group before anything is applied and lets it be
  // overridden, so the convention never makes a decision behind the
  // operator. A group whose name yields nothing usable returns "" — and a
  // group with no destination is SKIPPED, never filed into whichever unit
  // happened to be nearest. Putting an Admins group into a general vault
  // hands that vault's administrators control of it; ENCA learned this and
  // the rule survives the port unchanged.
  // "SEC", "U", "G", "GRP" and friends name what the object IS, not what it
  // is FOR, and a vault called INT-RMAU-U tells nobody anything.
  const GENERIC = /^(sec|u|g|grp|group|groups|sg|dg|azure|aad|entra|ent)$/i;
  // The convention's own root — "INT" out of "INT-RMAU-". A group already
  // wearing it contributes nothing by wearing it twice: INT-SEC-U-Exclusion
  // produced INT-RMAU-INT before this was here, which is a name that says
  // the prefix and nothing else. Dropped whether or not tenantPrefix() found
  // it, because prefix detection needs three groups to have an opinion and a
  // small tenant would otherwise get the useless name.
  const PREFIX_ROOT = UNIT_PREFIX.split("-")[0];

  function unitNameFor(groupName, opts = {}) {
    const segs = segments(groupName);
    if (!segs.length) return "";
    const pre = lc(opts.prefix || "");
    const useful = segs.filter((s, i) =>
      !(i === 0 && pre && lc(s) === pre)
      && !GENERIC.test(s)
      && lc(s) !== lc(PREFIX_ROOT));
    // Nothing but markers and prefixes: the last segment is the closest
    // thing to a purpose the name has, and a poor default that is visible
    // and overridable beats no default at all.
    const pick = useful[0] || segs[segs.length - 1];
    return pick ? UNIT_PREFIX + pick : "";
  }

  // ------------------------------------------------------- candidates ------
  // Every role-assignable SECURITY group in the tenant. Role-assignable is
  // the whole candidate test: a plain group has nothing to migrate off, and
  // this tool exists for exactly the groups Entra caps at 500 per tenant.
  //
  // $filter=isAssignableToRole eq true needs ConsistencyLevel:eventual and
  // $count=true — Graph's advanced-query rules for this property — and
  // asking for it server-side is what keeps a 20 000-group tenant from
  // being enumerated into a browser tab.
  async function candidates(onStatus) {
    onStatus && onStatus("Listing role-assignable groups…");
    const sel = "id,displayName,description,groupTypes,membershipRule,securityEnabled,mailEnabled,isAssignableToRole,createdDateTime";
    const rows = await Graph.readAll(
      `/groups?$filter=isAssignableToRole eq true&$count=true&$select=${sel}&$top=999`,
      { scopes: Graph.SCOPES.groups, headers: { ConsistencyLevel: "eventual" }, retry: true });
    const prefix = tenantPrefix(rows.map((g) => g.displayName));
    return {
      prefix,
      groups: rows.map((g) => ({
        id: g.id,
        name: g.displayName || g.id,
        description: g.description || "",
        dynamic: (g.groupTypes || []).includes("DynamicMembership") || !!g.membershipRule,
        created: g.createdDateTime || "",
        archived: ARCHIVE_SUFFIX.test(g.displayName || ""),
        suggestedUnit: unitNameFor(g.displayName, { prefix }),
      })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // Restricted units the tenant already has. `isMemberManagementRestricted`
  // is immutable, so a unit under the right name WITHOUT the flag cannot be
  // upgraded — it is reported as a conflict rather than silently used, which
  // would leave the group unprotected while looking done.
  async function restrictedUnits() {
    const aus = await Graph.readAll(
      `${AU}?$select=id,displayName,description,isMemberManagementRestricted&$top=999`,
      { scopes: SCOPES.auRead, retry: true });
    return {
      restricted: aus.filter((a) => a.isMemberManagementRestricted === true)
        .map((a) => ({ id: a.id, name: a.displayName || a.id, description: a.description || "" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      unrestricted: aus.filter((a) => a.isMemberManagementRestricted !== true)
        .map((a) => ({ id: a.id, name: a.displayName || a.id })),
    };
  }

  // Which restricted units already hold this group? Answers the frozen case
  // — role-assignable AND inside a restricted unit, so nobody at all can
  // change its members. A read failure is REPORTED, never taken as "no".
  async function unitsHolding(groupId) {
    try {
      // The `$/` cast is the form v1.0 documents for memberOf — unlike the
      // bare cast that works on /transitiveMembers elsewhere in TUNO.
      const aus = await Graph.readAll(
        `/groups/${encodeURIComponent(groupId)}/memberOf/$/microsoft.graph.administrativeUnit?$select=id,displayName,isMemberManagementRestricted`,
        { scopes: SCOPES.auRead, retry: true });
      return { ok: true, units: aus.filter((a) => a.isMemberManagementRestricted === true)
        .map((a) => ({ id: a.id, name: a.displayName || a.id })) };
    } catch (e) {
      return { ok: false, units: [], error: GroupUse.shortErr(e) };
    }
  }

  // ------------------------------------------------------- held roles ------
  // Does this group CARRY a directory role? If it does it is doing more than
  // holding members, and a plain group cannot hold a role at all — so it is
  // skipped rather than quietly broken. A FAILURE HERE IS REPORTED, never
  // assumed to mean "no roles", because assuming that would migrate it
  // anyway. (ENCA's rule, and the reason it is spelled out twice.)
  async function heldRoles(groupId) {
    const out = { active: [], eligible: [], ok: true, error: "" };
    try {
      const a = await Graph.get(
        `/roleManagement/directory/roleAssignments?$filter=principalId eq '${groupId}'&$expand=roleDefinition($select=displayName)`,
        { scopes: SCOPES.rolesRead, retry: true });
      out.active = ((a && a.value) || []).map((r) => (r.roleDefinition && r.roleDefinition.displayName) || r.roleDefinitionId);
    } catch (e) { out.ok = false; out.error = GroupUse.shortErr(e); }
    try {
      const b = await Graph.get(
        `/roleManagement/directory/roleEligibilitySchedules?$filter=principalId eq '${groupId}'&$expand=roleDefinition($select=displayName)`,
        { scopes: SCOPES.rolesRead, retry: true });
      out.eligible = ((b && b.value) || []).map((r) => (r.roleDefinition && r.roleDefinition.displayName) || r.roleDefinitionId);
    } catch (e) {
      // PIM is licence-gated. "Not licensed" is not the same as "failed to
      // read", and treating the first as the second would refuse to migrate
      // every group in a tenant without PIM.
      if (!/not licensed|does not have|Insufficient privileges/i.test((e && e.message) || "")) {
        out.ok = false; out.error = out.error || GroupUse.shortErr(e);
      }
    }
    return out;
  }

  // -------------------------------------------------------- references -----
  // TWO READS, AND THE SPLIT BETWEEN THEM IS THE POINT.
  //
  //   repointable — AssignEdit.readPolicies(), which is BY DEFINITION the
  //                 set this tool can write. Not "the config sources", not
  //                 "probably these": the exact four surfaces whose /assign
  //                 action rides the scope the registration declares.
  //   other       — everything else T02's reader finds. Apps, scripts, app
  //                 protection, app configuration, enrolment, Autopilot,
  //                 update rings. Read so they can be NAMED, never written.
  //
  // Deriving `other` by subtraction rather than by listing source ids is
  // deliberate: GroupUse's "config" source covers three collections and its
  // "compliance" source covers two, only one of which AssignEdit writes. A
  // by-source split would have quietly promised to move a settings-catalog
  // compliance policy that this tool cannot touch.
  async function references(groupId, onStatus) {
    const gid = lc(groupId);
    const out = { repointable: [], other: [], failed: [], readError: "" };

    onStatus && onStatus("Reading the assignments TUNO can rewrite…");
    let writable = [];
    try {
      const r = await AssignEdit.readPolicies(null, (m) => onStatus && onStatus(m));
      writable = r.policies;
      out.failed = out.failed.concat(r.failed || []);
    } catch (e) {
      // Not fatal to the plan, but it changes what the plan MEANS: with no
      // writable set, the tool would repoint nothing and say nothing about
      // it. The caller refuses to apply on this.
      out.readError = GroupUse.shortErr(e);
    }
    for (const p of writable) {
      for (const a of p.assignments || []) {
        const t = a.target || {};
        if (lc(t.groupId) !== gid) continue;
        out.repointable.push({
          surface: p.surface, surfaceLabel: p.surfaceLabel, icon: p.icon,
          id: p.id, name: p.name,
          how: lc(t["@odata.type"]).includes("exclusion") ? "excluded" : "assigned",
          policy: p,
        });
      }
    }
    const writableKeys = new Set(out.repointable.map((r) => `${lc(r.id)}`));

    onStatus && onStatus("Reading everything else Intune points at this group…");
    try {
      const res = await GroupUse.analyze({
        groupId: gid,
        ids: new Set([gid]),
        sourceIds: GroupUse.allSourceIds(),
        tenantWide: false,
        via: new Map([[gid, "the group itself"]]),
        onStatus: (m) => onStatus && onStatus(m),
      });
      (res.rows || []).forEach((h) => {
        if (writableKeys.has(lc(h.id))) return;   // already in the repointable half
        out.other.push({
          sourceLabel: h.sourceLabel, sub: h.sub || "", id: h.id, name: h.name,
          how: h.how === "excluded" ? "excluded" : "assigned",
        });
      });
      (res.failed || []).forEach((f) => out.failed.push({ id: f.id, label: f.label, error: f.error || "" }));
    } catch (e) {
      out.readError = out.readError || GroupUse.shortErr(e);
    }
    out.other.sort((a, b) => String(a.sourceLabel).localeCompare(String(b.sourceLabel)) || String(a.name).localeCompare(String(b.name)));
    return out;
  }

  // ---------------------------------------------- many groups, one read ----
  // The archived-group cleanup asks the same question as references() but of
  // several groups at once, and asking it once per group would read thirteen
  // surfaces N times over. One pass, matched against the whole id set — the
  // shape T02's sweep already uses for exactly this reason.
  //
  // Returns Map(lowercased id -> { repointable[], other[], total }). A group
  // absent from the map was not asked about; a group present with total 0 is
  // referenced by nothing, and those two are not the same answer.
  async function referencesMany(groupIds, onStatus) {
    const ids = new Set((groupIds || []).map(lc));
    const byId = new Map([...ids].map((id) => [id, { repointable: [], other: [], total: 0 }]));
    const failed = [];

    onStatus && onStatus("Reading the assignments TUNO can rewrite…");
    try {
      const r = await AssignEdit.readPolicies(null, (m) => onStatus && onStatus(m));
      (r.failed || []).forEach((f) => failed.push(f));
      for (const p of r.policies) {
        for (const a of p.assignments || []) {
          const gid = lc((a.target || {}).groupId);
          if (!ids.has(gid)) continue;
          const e = byId.get(gid);
          e.repointable.push({ surfaceLabel: p.surfaceLabel, name: p.name, id: p.id });
          e.total++;
        }
      }
    } catch (e) { failed.push({ id: "writable", label: "the writable surfaces", error: GroupUse.shortErr(e) }); }

    onStatus && onStatus("Reading everything else Intune points at them…");
    try {
      const res = await GroupUse.analyze({
        ids, sourceIds: GroupUse.allSourceIds(), tenantWide: false,
        via: new Map([...ids].map((id) => [id, "the group itself"])),
        onStatus: (m) => onStatus && onStatus(m),
      });
      for (const h of res.rows || []) {
        const e = byId.get(lc(h.pid));
        if (!e) continue;
        if (e.repointable.some((x) => lc(x.id) === lc(h.id))) continue;
        e.other.push({ sourceLabel: h.sourceLabel, name: h.name, id: h.id });
        e.total++;
      }
      (res.failed || []).forEach((f) => failed.push({ id: f.id, label: f.label, error: f.error || "" }));
    } catch (e) { failed.push({ id: "sources", label: "the Intune sources", error: GroupUse.shortErr(e) }); }

    return { byId, failed };
  }

  // ------------------------------------------------- delete an archive -----
  // THE ARCHIVED GROUP IS THE ROLLBACK. Deleting one is the last step of a
  // migration and the only irreversible thing this tool does — so it is
  // guarded by the same sentence the report ends with: not until nothing
  // points at it any more.
  //
  // Two things make this less frightening than it reads, and both are worth
  // saying on the screen rather than knowing:
  //   * Entra SOFT-deletes a group. It goes to deleted items and can be
  //     restored for 30 days, so a mistake here has a window rather than
  //     being final.
  //   * A group with references is REFUSED, not warned about. The caller
  //     passes the reference count it read; a group whose references could
  //     not be read is refused too, because unknown is not zero.
  function deletePlan(rows, refs) {
    const items = (rows || []).map((row) => {
      const e = refs && refs.byId ? refs.byId.get(lc(row.id)) : null;
      if (!ARCHIVE_SUFFIX.test(row.name || "")) {
        return { ...row, ok: false, reason: "Not an archived group. This only ever deletes the leftovers of an earlier migration — a live group is never in this list." };
      }
      if (!e) return { ...row, ok: false, reason: "Its references were not read. Unknown is not the same as none, and a rollback is not deleted on an assumption." };
      if (e.total) {
        // The two halves label their surface differently — repointable rows
        // come from AssignEdit (surfaceLabel), the rest from GroupUse
        // (sourceLabel). Naming the wrong one printed "undefined: P".
        const what = [...e.repointable, ...e.other]
          .slice(0, 4).map((x) => `${x.surfaceLabel || x.sourceLabel}: ${x.name}`).join("; ");
        return { ...row, ok: false, refs: e,
          reason: `Still referenced by ${e.total} Intune object${e.total === 1 ? "" : "s"} — ${what}${e.total > 4 ? "; …" : ""}. Repoint ${e.total === 1 ? "it" : "them"} first: while anything still names this group, it is not a leftover, it is in use.` };
      }
      return { ...row, ok: true, refs: e };
    });
    return { items, deletable: items.filter((x) => x.ok), refused: items.filter((x) => !x.ok) };
  }

  async function deleteArchived(plan, opts = {}) {
    const status = opts.onStatus || (() => {});
    const results = [];
    for (const g of plan.deletable) {
      status(`Deleting ${g.name}…`);
      try {
        await Graph.del(`/groups/${encodeURIComponent(g.id)}`, { scopes: SCOPES.groupWrite });
        results.push({ id: g.id, name: g.name, ok: true });
      } catch (e) {
        results.push({ id: g.id, name: g.name, ok: false, error: GroupUse.shortErr(e, 300) });
      }
    }
    return results;
  }

  // ASK THE DIRECTORY WHICH MEMBERS ARE USERS. DO NOT INFER IT.
  //
  // This used to read /members with a $select and split on `@odata.type`,
  // treating an ABSENT type as "user". Microsoft's own documented example
  // for that exact call returns objects with no `@odata.type` at all —
  // $select drops it — so the split was reading a property that may never
  // arrive, and the "user" branch was the default. A service principal CAN
  // be a member of a role-assignable group, so the refusal that exists to
  // stop this tool half-copying a group could simply never have fired: the
  // service principal would be counted as a user, silently not copied
  // (a POST of its id would fail, or worse, succeed as an unexpected
  // member), and the migration would report a clean run.
  //
  // The cast asks the directory the question instead of inferring the
  // answer, and the uncast id list says how many members there are in
  // total. Any difference is a non-user member. Nothing depends on a
  // property that may not be returned.
  //
  // A FAILURE HERE IS THROWN, never softened into an empty list: plan()
  // refuses a group whose members could not be read, because copying the
  // members you could see is the failure mode this whole file is arranged
  // against.
  async function memberIds(groupId) {
    const id = encodeURIComponent(groupId);
    const users = await Graph.readAll(
      `/groups/${id}/members/microsoft.graph.user?$select=id,displayName,userPrincipalName&$top=999`,
      { scopes: Graph.SCOPES.groupMembers, retry: true });
    const all = await Graph.readAll(`/groups/${id}/members?$select=id&$top=999`,
      { scopes: Graph.SCOPES.groupMembers, retry: true });
    const userIds = new Set(users.map((u) => lc(u.id)));
    const others = all.filter((m) => !userIds.has(lc(m.id))).map((m) => ({ id: m.id, name: m.id, type: "not a user" }));
    return {
      users: users.map((u) => ({ id: u.id, name: u.displayName || u.id, upn: u.userPrincipalName || "" })),
      others,
      total: all.length,
    };
  }

  // ------------------------------------------------------------- plan ------
  // One group, everything read, one answer. `ok:false` carries the reason
  // and the screen prints it — a refusal nobody can read is a bug report
  // waiting to be filed.
  //
  // opts: { unitName, unitId, toUnit, roles, holding, refs, members,
  //         scopedAdmin }
  function plan(group, opts = {}) {
    const refs = opts.refs || { repointable: [], other: [], failed: [], readError: "" };
    const roles = opts.roles || null;
    const holding = opts.holding || { ok: true, units: [] };
    const members = opts.members || { users: [], others: [] };
    const toUnit = opts.toUnit !== false;
    const unitName = String(opts.unitName || "").trim();
    const unitId = opts.unitId || null;
    const base = {
      id: group.id, name: group.name, group,
      refs, members, roles, holding,
      unitName: toUnit ? unitName : "", unitId: toUnit ? unitId : null,
      toUnit, createsUnit: !!(toUnit && unitName && !unitId),
      scopedAdmin: String(opts.scopedAdmin || "").trim(),
    };

    // ---- the refusals, in the order they matter ----
    if (!group.id) return { ...base, ok: false, reason: "This group is not in the tenant." };
    if (group.archived || ARCHIVE_SUFFIX.test(group.name)) {
      return { ...base, ok: false, reason: `“${group.name}” is the archived half of an earlier migration, not the live group — the live one is the same name without the suffix. Migrating it would create a permanent new group still called “${group.name}”. Work on the live group instead, and delete this one once nothing points at it (T02 Group Analyzer will tell you).` };
    }
    if (group.roleAssignable === false) {
      return { ...base, ok: false, reason: "Already a plain group — there is nothing to convert. To restrict who may change its members, add it to a restricted management administrative unit directly." };
    }
    if (!holding.ok) {
      return { ...base, ok: false, reason: `Could not read which administrative units hold this group (${holding.error}). Skipped rather than risk migrating a group out from under a restriction that is already in place.` };
    }
    if (holding.units.length) {
      const names = holding.units.map((u) => u.name).join(", ");
      return { ...base, ok: false, frozen: true,
        reason: `Already inside the restricted unit ${names} AND role-assignable — the frozen state. Its members cannot be read or moved from here, and they cannot be changed by anyone: a role-assignable group admits only Global Administrator or Privileged Role Administrator, and a restricted unit blocks exactly those two. Take it out of the unit first, then migrate it, then put the replacement back.` };
    }
    if (roles && !roles.ok) {
      return { ...base, ok: false, reason: `Could not check whether this group holds a directory role (${roles.error}). Skipped rather than risk breaking a role assignment.` };
    }
    if (roles && (roles.active.length || roles.eligible.length)) {
      const names = [...new Set([...roles.active, ...roles.eligible])].join(", ");
      return { ...base, ok: false,
        reason: `This group holds a directory role (${names}). A plain group cannot carry a role, so migrating it would break that assignment. Deal with the role first — that is what role-assignable is actually for, and this group is using it.` };
    }
    if (members.others.length) {
      const n = members.others.length;
      // `total` comes from the uncast read. A caller that built `members` by
      // hand may not carry it, and a refusal that says "undefined members" is
      // a refusal nobody trusts.
      const total = members.total != null ? members.total : members.users.length + n;
      return { ...base, ok: false,
        reason: `This group has ${total} member${total === 1 ? "" : "s"} but only ${members.users.length} of them ${members.users.length === 1 ? "is a user" : "are users"} — ${n} ${n === 1 ? "is" : "are"} not (a service principal, most likely; Entra allows one in a role-assignable group). This tool copies users, so ${n === 1 ? "it" : "they"} would be left behind without appearing anywhere in the report. Move ${n === 1 ? "it" : "them"} by hand first. Object id${n === 1 ? "" : "s"}: ${members.others.map((o) => o.id).join(", ")}.` };
    }
    if (refs.readError) {
      return { ...base, ok: false,
        reason: `The assignment read did not complete (${refs.readError}). Migrating now would repoint an unknown fraction of this group's assignments and report the rest as though they were the whole remainder. Re-run the read.` };
    }
    if (toUnit && !unitName) {
      return { ...base, ok: false,
        reason: `No destination unit. A group whose destination cannot be worked out is skipped rather than filed into whichever unit was nearest — putting this group into the wrong vault would hand that vault's administrators control of it. Name a unit, or choose to leave the new group outside one.` };
    }
    if (base.createsUnit && !base.scopedAdmin) {
      return { ...base, ok: false,
        reason: `“${unitName}” does not exist yet and no scoped administrator was named. A restricted unit with nobody scoped to it is a vault nobody can open — tenant-wide roles are blocked by design, so the members would be unmanageable by everyone including you. Name the account that should hold Groups Administrator on it.` };
    }

    const archiveName = migratedName(group.name);
    const nRef = refs.repointable.length;
    // THE ORDER IS THE SAFETY PROPERTY, and it is the one thing in this file
    // that must not be rearranged for convenience:
    //   * members move while the new group is still ORDINARY. Once it is
    //     inside the restricted unit only a unit-scoped role could add them,
    //     and the account running this tool is very unlikely to hold one yet.
    //   * every assignment gains the new group BEFORE it loses the old one,
    //     so no policy is ever pointed at neither. An exclusion that briefly
    //     vanishes is an outage, not a gap in a report.
    const steps = [
      { key: "rename", text: `Rename “${group.name}” to “${archiveName}” — kept as the rollback, still role-assignable, still holding its members` },
      { key: "create", text: `Create “${group.name}” again as a plain security group` },
      { key: "members", text: members.users.length
          ? `Copy ${members.users.length} member${members.users.length === 1 ? "" : "s"} across — the archived group keeps its own copy`
          : `No members to copy — the group is empty` },
      ...(nRef ? [{ key: "addRefs", text: `Point ${nRef} Intune assignment${nRef === 1 ? "" : "s"} at the new group` }] : []),
      ...(nRef ? [{ key: "delRefs", text: `Remove the archived group from those ${nRef} assignment${nRef === 1 ? "" : "s"}` }] : []),
      ...(base.createsUnit ? [{ key: "createUnit", text: `Create the restricted unit “${unitName}” and scope Groups Administrator on it to ${base.scopedAdmin}` }] : []),
      ...(toUnit ? [{ key: "unit", text: `Add the new group to “${unitName}” — LAST, so the member copy above is still possible` }]
                 : [{ key: "noUnit", text: `Leave the new group outside a restricted unit — its membership will be manageable by any tenant-wide Groups or User Administrator` }]),
    ];

    const warnings = [
      "**The new group has a new object id.** Everything that names the group by id and is not repointed below keeps pointing at the archived one.",
      ...(refs.other.length ? [`**${refs.other.length} Intune assignment${refs.other.length === 1 ? "" : "s"} cannot be repointed by this tool** and must be moved by hand — each needs a write scope this registration does not declare.`] : []),
      "**Anything outside Intune is invisible here** — Conditional Access, group-based licensing, Azure RBAC, app role assignments. TUNO does not read them and cannot say whether they exist.",
      ...(refs.failed.length ? [`**${refs.failed.length} surface${refs.failed.length === 1 ? "" : "s"} could not be read** (${refs.failed.map((f) => f.label).join(", ")}). References there are neither repointed nor listed — they are unknown, which is not the same as absent.`] : []),
      ...(!toUnit ? ["**Nothing is protecting the new group.** Migrating off role-assignable without placing the replacement in a restricted unit makes its membership MORE reachable than before, not less."] : []),
    ];

    return { ...base, ok: true, archiveName, steps, warnings, nRef };
  }

  // ------------------------------------------------------------ apply ------
  // Sequential and stop-at-first-failure. Half a migration is recoverable —
  // the archived group is still there with its members — but a wrong ORDER
  // is not, so nothing continues past a step that did not do what it said.
  //
  // Every step logs, and the log is the report. A step that is skipped says
  // why; a step that fails says what was already done, because "it failed"
  // without "and here is what is now true of your tenant" is the worst thing
  // a write tool can print.
  async function apply(p, opts = {}) {
    const status = opts.onStatus || (() => {});
    const log = [];
    const note = (ok, text, detail) => { log.push({ ok, text, detail: detail || "" }); status(text); };
    if (!p || !p.ok) throw new Error((p && p.reason) || "Nothing to migrate");

    const result = {
      name: p.name, oldId: p.id, newId: null, archiveName: p.archiveName,
      membersMoved: 0, memberTotal: p.members.users.length,
      refsMoved: 0, refsTotal: p.refs.repointable.length,
      unitId: p.unitId || null, unitName: p.unitName || "", inUnit: false,
      unitCreated: false, scopedAdminOk: false, scopedAdminError: "",
      log, ok: false, error: "",
    };

    // 1. rename the original out of the way
    try {
      await Graph.patch(`/groups/${encodeURIComponent(p.id)}`, { displayName: p.archiveName }, { scopes: SCOPES.groupWrite });
      note(true, `Renamed to “${p.archiveName}”`, `id ${p.id} — unchanged, still role-assignable, still holding its members`);
    } catch (e) {
      result.error = GroupUse.shortErr(e, 300);
      note(false, "Could not rename the original — nothing was changed", result.error);
      return result;
    }

    // 2. create the replacement under the original name.
    //
    // Failure here ROLLS THE RENAME BACK. Leaving a tenant with its group
    // renamed and no replacement is the one outcome that is worse than not
    // starting: every assignment still resolves, so nothing breaks, but the
    // group is called something an operator will not recognise at 2am.
    let created = null;
    try {
      created = await Graph.post("/groups", {
        displayName: p.name,
        description: p.group.description || "",
        mailEnabled: false,
        mailNickname: mailNickname(p.name),
        securityEnabled: true,
        isAssignableToRole: false,
      }, { scopes: SCOPES.groupWrite });
    } catch (e) {
      result.error = GroupUse.shortErr(e, 300);
      try {
        await Graph.patch(`/groups/${encodeURIComponent(p.id)}`, { displayName: p.name }, { scopes: SCOPES.groupWrite });
        note(false, "Could not create the replacement — the rename was rolled back", result.error);
      } catch (e2) {
        note(false, `Could not create the replacement AND the rename could not be rolled back — the group is still called “${p.archiveName}”. Rename it back by hand.`, `${result.error} · rollback: ${GroupUse.shortErr(e2)}`);
      }
      return result;
    }
    // Belt and braces. If anything ever hands back the id we just renamed,
    // stop before touching a single assignment: adding and then removing one
    // id would strip the group from every policy instead of replacing it.
    if (!created || !created.id || lc(created.id) === lc(p.id)) {
      result.error = "The create call returned the existing group instead of a new one — no assignment was touched.";
      try { await Graph.patch(`/groups/${encodeURIComponent(p.id)}`, { displayName: p.name }, { scopes: SCOPES.groupWrite }); } catch { /* said below */ }
      note(false, "The new group came back with the same id as the old one — nothing was changed on any assignment, and the rename was rolled back", `id ${(created && created.id) || "none"}`);
      return result;
    }
    result.newId = created.id;
    note(true, `Created “${p.name}” as a plain security group`, `id ${created.id} (was ${p.id})`);

    // 3. members, while the new group is still ordinary
    let memberFailures = 0;
    for (let i = 0; i < p.members.users.length; i++) {
      const u = p.members.users[i];
      status(`Copying members… ${i + 1}/${p.members.users.length} · ${u.name}`);
      try {
        await Graph.post(`/groups/${encodeURIComponent(created.id)}/members/$ref`,
          { "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${u.id}` },
          { scopes: SCOPES.groupWrite });
        result.membersMoved++;
      } catch (e) {
        memberFailures++;
        note(false, `Could not add ${u.name}`, GroupUse.shortErr(e));
      }
    }
    if (p.members.users.length) {
      note(memberFailures === 0, `Copied ${result.membersMoved}/${p.members.users.length} members`,
        memberFailures ? `${memberFailures} failed — the archived group still holds all of them` : "the archived group keeps its own copy");
    }
    if (memberFailures) {
      result.error = "Some members could not be copied — stopping before any assignment is moved, so the archived group remains the one that is correctly populated and still assigned.";
      note(false, "Stopped before touching assignments", result.error);
      return result;
    }

    // 4. the assignments TUNO may write. AssignEdit's engine does this —
    //    fresh read, drift check, replace, verify read-back — so the
    //    write discipline is the one in production, not a second copy.
    if (p.refs.repointable.length) {
      const r = await repoint(p, created.id, status);
      result.refsMoved = r.moved;
      note(r.failed.length === 0, `Repointed ${r.moved}/${p.refs.repointable.length} Intune assignments`,
        r.failed.length ? r.failed.map((f) => `${f.name}: ${f.error}`).join(" · ") : r.names.join(", "));
      if (r.failed.length) {
        result.error = `${r.failed.length} assignment${r.failed.length === 1 ? "" : "s"} could not be moved. The archived group is still assigned to ${r.failed.length === 1 ? "it" : "them"}, so nothing is uncovered — but the two groups are now both in play. Fix and finish by hand.`;
        note(false, "Stopped before the unit step", result.error);
        return result;
      }
    }

    // 5. the unit, LAST
    if (p.toUnit) {
      try {
        let unitId = p.unitId;
        if (!unitId) {
          status(`Creating the restricted unit “${p.unitName}”…`);
          const au = await Graph.post(AU, {
            displayName: p.unitName,
            description: `Restricted management administrative unit created by ${(typeof BRANDING !== "undefined" && BRANDING.name) || "TUNO"} to hold the migrated group “${p.name}”. Membership changes require a role scoped to this administrative unit.`,
            isMemberManagementRestricted: true,
          }, { scopes: SCOPES.auWrite });
          unitId = au && au.id;
          if (!unitId) throw new Error("The unit was created but Graph did not return its id.");
          result.unitCreated = true;
          note(true, `Created the restricted unit “${p.unitName}”`, `id ${unitId} · isMemberManagementRestricted: true (immutable)`);
          // A unit nobody is scoped to is a vault nobody can open. This is
          // not optional on the create path — plan() refuses without it.
          try {
            await grantScopedAdmin(unitId, p.scopedAdmin);
            result.scopedAdminOk = true;
            note(true, `Scoped Groups Administrator on “${p.unitName}” to ${p.scopedAdmin}`);
          } catch (e) {
            result.scopedAdminError = GroupUse.shortErr(e, 300);
            note(false, `The unit was created but the scoped administrator was NOT granted — nobody can manage its members until one is`, result.scopedAdminError);
          }
        }
        result.unitId = unitId;
        status(`Adding “${p.name}” to “${p.unitName}”…`);
        await Graph.post(`${AU}/${encodeURIComponent(unitId)}/members/$ref`,
          { "@odata.id": `https://graph.microsoft.com/v1.0/groups/${created.id}` },
          { scopes: SCOPES.auWrite });
        result.inUnit = true;
        note(true, `Added “${p.name}” to the restricted unit “${p.unitName}”`,
          "only a principal holding a role scoped to this unit can change its members from here");
      } catch (e) {
        result.error = GroupUse.shortErr(e, 300);
        note(false, `The group was migrated but could NOT be placed in “${p.unitName}”`,
          `${result.error} — it is an ordinary group now, so its membership is manageable by any tenant-wide Groups or User Administrator. Add it to the unit by hand.`);
        result.ok = true;    // the migration itself succeeded; the placement did not
        return result;
      }
    } else {
      note(true, "Left outside a restricted unit, as planned",
        "its membership is manageable by any tenant-wide Groups or User Administrator");
    }

    result.ok = true;
    return result;
  }

  // Graph requires a mailNickname on a security group even though it is
  // never used for mail. Letters, digits and a few separators only — an
  // invalid one is a 400 with a message about a property nobody asked for.
  function mailNickname(name) {
    const s = String(name || "group").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60);
    return s || `group${Date.now().toString(36)}`;
  }

  // The scoped grant needs the ACTIVATED directory-role object id, not the
  // template id — /directoryRoles is the activated list, and a role that has
  // never been used in this tenant is not in it until it is activated.
  async function groupsAdminRoleId() {
    const roles = await Graph.readAll("/directoryRoles?$select=id,displayName,roleTemplateId",
      { scopes: SCOPES.rolesRead, retry: true });
    const hit = roles.find((r) => lc(r.roleTemplateId) === lc(GROUPS_ADMIN_TEMPLATE));
    if (hit) return hit.id;
    const act = await Graph.post("/directoryRoles", { roleTemplateId: GROUPS_ADMIN_TEMPLATE }, { scopes: SCOPES.roleWrite });
    if (!act || !act.id) throw new Error("Groups Administrator is not activated in this tenant and could not be activated.");
    return act.id;
  }

  async function grantScopedAdmin(unitId, upnOrId) {
    const who = String(upnOrId || "").trim();
    if (!who) throw new Error("No principal named.");
    const user = Graph.isGuid(who)
      ? { id: who }
      : await Graph.get(`/users/${encodeURIComponent(who)}?$select=id,displayName,userPrincipalName`, { scopes: Graph.SCOPES.directory });
    if (!user || !user.id) throw new Error(`No user matches “${who}”.`);
    const roleId = await groupsAdminRoleId();
    return Graph.post(`${AU}/${encodeURIComponent(unitId)}/scopedRoleMembers`, {
      roleId,
      roleMemberInfo: { id: user.id },
    }, { scopes: SCOPES.roleWrite });
  }

  // ---------------------------------------------------------- repoint ------
  // ONE modify per policy, not one per reference. A policy that both
  // includes and excludes the group (rare, and a finding in its own right)
  // must be rewritten once with both targets swapped — two passes would race
  // each other through /assign, which REPLACES the whole list.
  async function repoint(p, newId, status) {
    const byPolicy = new Map();
    for (const r of p.refs.repointable) {
      if (!byPolicy.has(r.id)) byPolicy.set(r.id, r.policy);
    }
    const ops = [];
    for (const pol of byPolicy.values()) {
      // Swap the group id on every target that names the old group, keeping
      // the target TYPE (include stays include, exclusion stays exclusion)
      // and — the part that matters most — the FILTER. AssignEdit.cleanTarget
      // is what preserves it, and dropping one would silently widen the
      // assignment: the single worst thing either tool could do.
      const after = (pol.assignments || []).map((a) => {
        const t = AssignEdit.cleanTarget(a.target || {});
        if (lc(t.groupId) === lc(p.id)) t.groupId = newId;
        return { target: t };
      });
      ops.push({
        policy: pol,
        before: AssignEdit.cleanAssignments(pol.assignments || []),
        beforeSig: AssignEdit.sig(pol.assignments || []),
        after, change: "modify",
      });
    }
    const res = await AssignEdit.applyPlan({ changes: ops }, {
      onStatus: (m) => status(m),
      stopOnFail: true,
    });
    const moved = [], failed = [];
    for (const r of res.results) {
      const nm = r.op.policy.name;
      if (r.ok && r.verified) moved.push(nm);
      else if (r.ok && !r.verified) failed.push({ name: nm, error: r.verifyError || "the read-back did not match what was sent" });
      else if (r.drifted) failed.push({ name: nm, error: r.error });
      else if (r.skipped) failed.push({ name: nm, error: r.skipped });
      else failed.push({ name: nm, error: r.error || "unknown" });
    }
    return { moved: moved.length, names: moved, failed };
  }

  // ----------------------------------------------------------- report ------
  const mdCell = (v) => String(v ?? "").trim().replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

  function report(p, result, meta = {}) {
    const L = [`# Group migration — ${mdCell(p.name)}`, "",
      `**Tenant:** ${mdCell(meta.tenant || "—")}  `,
      `**Generated by:** ${mdCell(meta.build || "")}  `,
      `**When:** ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "",
      `A role-assignable group keeps its membership away from tenant-wide group administrators by admitting only Global Administrator or Privileged Role Administrator. A restricted management administrative unit does the same job and lets you name who may manage it. The two cannot be combined — a restricted unit blocks exactly the two roles a role-assignable group admits — and \`isAssignableToRole\` is immutable, so the change is a recreate.`, ""];

    L.push("## Result", "");
    L.push(`| | |`, `| --- | --- |`);
    L.push(`| Outcome | ${result.ok ? "**migrated**" : "**FAILED**"} |`);
    L.push(`| New group id | \`${mdCell(result.newId || "—")}\` |`);
    L.push(`| Archived as | ${mdCell(result.archiveName)} (id \`${mdCell(result.oldId)}\`) |`);
    L.push(`| Members copied | ${result.membersMoved} / ${result.memberTotal} |`);
    L.push(`| Intune assignments repointed | ${result.refsMoved} / ${result.refsTotal} |`);
    L.push(`| Restricted unit | ${result.inUnit ? `${mdCell(result.unitName)}${result.unitCreated ? " _(created by this run)_" : ""}` : (p.toUnit ? "**NOT placed** — see below" : "_deliberately none_")} |`);
    if (result.unitCreated) {
      L.push(`| Scoped administrator | ${result.scopedAdminOk ? `${mdCell(p.scopedAdmin)} — Groups Administrator` : `**NOT granted** — ${mdCell(result.scopedAdminError || "failed")}`} |`);
    }
    L.push("");
    if (result.error) L.push(`> ⚠ ${mdCell(result.error)}`, "");

    L.push("## What was done, in order", "");
    for (const l of result.log) L.push(`- ${l.ok ? "✅" : "❌"} ${mdCell(l.text)}${l.detail ? ` — _${mdCell(l.detail)}_` : ""}`);
    L.push("");

    if (p.refs.repointable.length) {
      L.push("## Assignments this tool repointed", "", "| Surface | Object | How |", "| --- | --- | --- |");
      p.refs.repointable.forEach((r) => L.push(`| ${mdCell(r.surfaceLabel)} | ${mdCell(r.name)} | ${mdCell(r.how)} |`));
      L.push("");
    }

    // THE SECTION THAT MATTERS MOST. It is not an appendix and it is not
    // phrased as a note: it is a work list, and the report says the archived
    // group is the rollback until it is done.
    L.push("## Still pointing at the ARCHIVED group — move these by hand", "");
    if (p.refs.other.length) {
      L.push(`${p.refs.other.length} Intune assignment${p.refs.other.length === 1 ? "" : "s"} name${p.refs.other.length === 1 ? "s" : ""} the old group and could not be moved here — each needs a write scope this app does not declare.`, "",
        "| Surface | Object | How |", "| --- | --- | --- |");
      p.refs.other.forEach((r) => L.push(`| ${mdCell(r.sourceLabel)}${r.sub ? ` (${mdCell(r.sub)})` : ""} | ${mdCell(r.name)} | ${mdCell(r.how)} |`));
      L.push("");
    } else {
      L.push("No other Intune assignment names this group.", "");
    }
    if (p.refs.failed.length) {
      L.push(`**${p.refs.failed.length} surface${p.refs.failed.length === 1 ? "" : "s"} could not be read**, so references there are unknown rather than absent: ${p.refs.failed.map((f) => mdCell(f.label)).join(", ")}.`, "");
    }
    L.push("**And everything outside Intune is invisible to this tool.** Conditional Access, group-based licensing, Azure RBAC and app role assignments all address a group by object id, and the new group has a new one. Check them before deleting anything.", "");

    L.push("## What to do next", "");
    L.push(`1. Compare the members of **${mdCell(p.name)}** against **${mdCell(result.archiveName)}** — they should match.`);
    let n = 2;
    if (p.refs.other.length) L.push(`${n++}. Repoint the ${p.refs.other.length} assignment${p.refs.other.length === 1 ? "" : "s"} listed above, then re-run T02 Group Analyzer on the archived group: it should come back with nothing.`);
    if (p.toUnit && !result.inUnit) L.push(`${n++}. **The new group is not in a restricted unit.** It is an ordinary group now, so its membership is manageable by any tenant-wide Groups or User Administrator — which is less protection than it had before this ran. Place it in one.`);
    if (result.unitCreated && !result.scopedAdminOk) L.push(`${n++}. **Grant a scoped administrator on ${mdCell(result.unitName)}.** Until somebody holds a role scoped to it, its members cannot be changed by anyone.`);
    L.push(`${n++}. Delete **${mdCell(result.archiveName)}** once you are satisfied. It keeps its members and stays role-assignable; it is your rollback until then.`);
    L.push("");
    L.push(`_Generated by ${mdCell((typeof BRANDING !== "undefined" && BRANDING.name) || "TUNO")} — T22 Group migration._`);
    return L.join("\n");
  }

  return {
    SCOPES, ALL_SCOPES, READ_SCOPES, UNIT_PREFIX, AU, ARCHIVE_SUFFIX, MIGRATED_TAG,
    GROUPS_ADMIN_TEMPLATE,
    segments, tenantPrefix, unitNameFor, migratedName, mailNickname,
    permissionPlan, allPermissions,
    candidates, restrictedUnits, unitsHolding, heldRoles, references, referencesMany, memberIds,
    deletePlan, deleteArchived,
    plan, apply, repoint, report,
    grantScopedAdmin, groupsAdminRoleId,
    esc, lc,
  };
})();


// ======================================================================
// T22 — the screen. THE GATES LIVE HERE, the way they do for T11: the
// engine refuses nothing about sequence, and this is what enforces it.
//
//   read → pick one group → read ITS references → plan → type the name
//   → apply → report
//
// ONE GROUP AT A TIME, deliberately. T11 batches because adding a group to
// forty policies is one decision applied forty times. This is the
// opposite: every migration is a rename plus a create plus an assignment
// rewrite against one group's own particular references, and the reason to
// refuse is different for every group. A bulk button here would be a
// button that hides the only screen worth reading.
// ======================================================================
const GroupMigrateTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let list = null;        // { prefix, groups }
  let units = null;       // { restricted, unrestricted }
  let chosen = null;      // the group row being worked on
  let plan = null;        // GroupMigrate.plan() result
  let result = null;      // GroupMigrate.apply() result
  let busy = false;

  // THE DESTINATION MODE LIVES HERE, NOT IN THE DOM — T11's build-10390
  // lesson, arrived at the same way. It was read back off the rendered
  // control, and because renderPlan() rebuilds that control from scratch
  // every time, clicking "Use an existing one" re-rendered a segment whose
  // freshly-built value was "new" and bounced straight back. The DOM renders
  // FROM this; it is never asked what it says.
  let unitMode = "new";           // "new" | "existing" | "none"
  let pickedUnitId = null;        // the chosen existing unit, likewise
  let unitNameIn = "";            // the typed unit name — seeded from the suggestion
  let adminIn = "";               // the typed scoped administrator
  let unitsError = "";            // the unit read failed; the group list still stands
  let search = "";                // the group filter — local, over the list in hand
  const archSel = new Set();      // archived groups ticked for cleanup
  let archRefs = null;            // referencesMany() for the ticked set, or null

  const prog = (m, n, of) => TunoProgress.show("gmBody", "gmProg", m, n, of);

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/markdown" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // The org display name when the sign-in read answered, the UPN domain when
  // it did not. Never a guess — an unread org gives the domain, which is a
  // fact, rather than an empty string dressed up as a tenant name.
  const tenantName = () => {
    try {
      const o = window.TunoTenant && TunoTenant.org && TunoTenant.org();
      return (o && o.displayName) || (window.TunoTenant && TunoTenant.domain && TunoTenant.domain()) || "";
    } catch { return ""; }
  };

  // ------------------------------------------------------- permissions ----
  // THE LIST LIVES ON THE BUTTON, not on the page. It was a full card of
  // three tables and it dwarfed the tool it was serving — a permissions
  // inventory is something you consult once, not something that sits above
  // the work. The tooltip carries every scope and what it buys, and the
  // consent screen Microsoft shows carries them again at the moment it
  // matters; neither costs a pixel here.
  //
  // ✓/○ is deliberately gone with the card rather than shrunk. It reported
  // what THIS SESSION had acquired, which is not the same as what the
  // tenant has consented — a page can see its own tokens and nothing else.
  // Two states that look alike and mean different things are worse in a
  // tooltip than in a table, so the button states what it will DO instead.
  function grantTitle() {
    const L = ["Ask for every permission this tool needs, in one prompt instead of four.", ""];
    for (const g of GroupMigrate.permissionPlan()) {
      L.push(g.label.toUpperCase() + (g.warn ? "  — WRITES TO THE TENANT" : ""));
      for (const x of g.scopes) L.push(`  • ${x.s}\n      ${x.why}`);
      L.push("");
    }
    L.push("Three of these write to the DIRECTORY rather than to Intune: they can",
      "change who is in a group and who may administer it.", "",
      "Reading works without this — press Read and it asks only for what reading",
      "costs. Nothing is written until a plan has been read and confirmed.");
    return L.join("\n");
  }

  async function grantAll() {
    if (busy) return;
    busy = true;
    const msg = $("gmGrantMsg");
    const say = (html) => { if (msg) msg.innerHTML = html; };
    say('<span class="muted">Asking Microsoft…</span>');
    try {
      await Graph.ensureScopes(GroupMigrate.allPermissions());
      say('<span style="color:var(--on)">✓ Granted — nothing else in this tool will ask again this session.</span>');
    } catch (e) {
      const m = GroupUse.shortErr(e, 400);
      // The three refusals worth telling apart, because the next move
      // differs: an admin has to act, a popup has to be allowed, or the
      // person simply said no.
      if (/consent|AADSTS65001|admin/i.test(m)) {
        say(`<span style="color:var(--off)">Needs an administrator.</span>
          <span class="muted">${esc(m)}</span>
          <br><a href="${esc(Graph.adminConsentUrl())}" target="_blank" rel="noopener">Grant admin consent for ${esc(BRANDING.name)} →</a>
          <span class="muted">— opens Microsoft's consent page for the whole application, not just this tool.</span>`);
      } else if (Graph.isPopupBlocked && Graph.isPopupBlocked(e)) {
        say('<span style="color:var(--off)">The consent window was blocked by the browser.</span> <span class="muted">Allow popups for this site and press the button again.</span>');
      } else {
        say(`<span style="color:var(--off)">Not granted.</span> <span class="muted">${esc(m)}</span>`);
      }
    } finally { busy = false; }
  }

  // ------------------------------------------------------------ step 1 ----
  async function readGroups() {
    if (busy) return;
    busy = true; chosen = null; plan = null; result = null;
    $("gmBody").innerHTML = "";
    unitsError = "";
    // TWO READS, REPORTED SEPARATELY. They were in one try/catch, so a 403
    // on the ADMINISTRATIVE UNITS printed "Could not read the groups" — a
    // message about the call that had already succeeded. That sent the
    // first real diagnosis at the wrong half of the tool. Each read now
    // names itself, and the unit read is allowed to fail without taking
    // the group list down with it: the tool is still worth something as a
    // list of what is role-assignable, and plan() already refuses to
    // migrate a group whose unit membership could not be read.
    try {
      prog("Reading role-assignable groups…");
      await Graph.ensureScopes([...Graph.SCOPES.groups]);
      list = await GroupMigrate.candidates((m) => prog(m));
    } catch (e) {
      prog(""); busy = false;
      $("gmBody").innerHTML = failCard("Could not read the role-assignable groups", e,
        `Needs <code>Group.Read.All</code>. The query also uses an advanced filter, which the tenant refuses outright rather than answering with an empty list.`);
      return;
    }
    try {
      prog("Reading restricted administrative units…");
      await Graph.ensureScopes(GroupMigrate.SCOPES.auRead);
      units = await GroupMigrate.restrictedUnits();
    } catch (e) {
      units = { restricted: [], unrestricted: [] };
      unitsError = GroupUse.shortErr(e, 400);
    }
    prog("");
    renderList();
    busy = false;
  }

  // A refusal that names the permission it wanted is the difference between
  // a bug report and a five-second fix. GroupUse.whyFailed does this for
  // T02's sources; this is the same idea, said per call.
  function failCard(title, e, needs) {
    const m = GroupUse.shortErr(e, 400);
    const denied = /\b(401|403)\b|Authorization_RequestDenied|Insufficient privileges|Forbidden/i.test(m);
    return `<div class="list-card"><p class="mini" style="color:var(--off);margin:0">
      <b>${esc(title)}.</b> ${esc(m)}</p>
      ${denied ? `<p class="mini muted" style="margin:8px 0 0">${needs}
        A permission the tenant has never consented cannot be acquired by asking again — an administrator has to grant it once for the app.</p>` : ""}</div>`;
  }

  function renderList() {
    const live = list.groups.filter((g) => !g.archived);
    const archived = list.groups.filter((g) => g.archived);
    if (!list.groups.length) {
      $("gmBody").innerHTML = `<div class="list-card"><p class="mini" style="margin:0">
        <b>No role-assignable groups in this tenant.</b> There is nothing for this tool to do, which is the
        state it is trying to reach — every group's membership is already governed by something other than
        “only Global Administrator or Privileged Role Administrator may touch it”.</p></div>`;
      return;
    }
    // The search is LOCAL, over the list already in hand — no keystroke goes
    // to the tenant. A tenant-backed typeahead here would be a second read of
    // groups this screen has already read, and it would suggest groups that
    // are not role-assignable, which is every group this tool cannot act on.
    // Name and object id both match: an id is what a report hands you.
    const q = GroupMigrate.lc(search.trim());
    const shown = q ? live.filter((g) => GroupMigrate.lc(g.name).includes(q) || GroupMigrate.lc(g.id).includes(q)) : live;
    const rows = shown.map((g) => `<tr>
      <td><b>${esc(g.name)}</b><div class="mini muted">${esc(g.id)}</div>
        ${g.dynamic ? '<div class="mini" style="color:var(--report)">⚠ carries a membership rule — Entra forbids dynamic membership on a role-assignable group, so this group is in a state worth checking</div>' : ""}</td>
      <td class="mini">${esc(g.suggestedUnit || "—")}</td>
      <td class="mini"><button class="btn sm primary" data-gmpick="${esc(g.id)}">Examine</button></td>
    </tr>`).join("");
    // The units could not be read. Say so ONCE, at the top, in the terms the
    // rest of the screen will now behave in — rather than letting every group
    // discover it again as a refusal.
    const unitsWarn = unitsError ? `<div class="list-card" style="border-color:var(--off);margin-bottom:14px">
      <p class="mini" style="margin:0;color:var(--off)"><b>The administrative units could not be read.</b> ${esc(unitsError)}</p>
      <p class="mini muted" style="margin:8px 0 0">Needs <code>AdministrativeUnit.Read.All</code>, which this app must have consented by an administrator.
        The groups below are still correct. <b>Nothing can be migrated until this read works</b>: without it the tool cannot tell whether a
        group is already inside a restricted unit — the 🧊 frozen case, where a role-assignable group in a restricted unit has members
        nobody at all can change — and migrating on that assumption is exactly the mistake this tool exists to avoid.</p>
    </div>` : "";
    $("gmBody").innerHTML = unitsWarn + `
      <div class="list-card">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <span class="gu-stat"><b>${live.length}</b> role-assignable</span>
          <span class="gu-stat ${units.restricted.length ? "" : "zero"}"><b>${units.restricted.length}</b> restricted unit${units.restricted.length === 1 ? "" : "s"}</span>
          ${archived.length ? `<span class="gu-stat"><b>${archived.length}</b> archived by an earlier run</span>` : ""}
          ${list.prefix ? `<span class="gu-stat">prefix <b>${esc(list.prefix.toUpperCase())}</b> detected</span>` : ""}
        </div>
        <p class="mini muted" style="margin:0 0 12px">Entra caps a tenant at <b>500</b> role-assignable groups, and every
          one of them can only be managed by Global Administrator or Privileged Role Administrator — a list you cannot
          shorten. The suggested unit below follows the <code>${esc(GroupMigrate.UNIT_PREFIX)}</code> convention${list.prefix
            ? ` with <b>${esc(list.prefix.toUpperCase())}-</b> stripped as this tenant's own prefix` : ""}; it is a
          <b>default</b> and can be changed per group before anything is applied.</p>
        <input type="text" id="gmSearch" value="${esc(search)}" placeholder="Filter by name or object id…" style="width:100%;max-width:420px;margin-bottom:10px">
        ${q ? `<p class="mini muted" style="margin:0 0 8px">${shown.length} of ${live.length} shown.</p>` : ""}
        <div style="overflow-x:auto"><table class="plist">
          <thead><tr><th>Group</th><th style="width:250px">Suggested unit</th><th style="width:110px"></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3" class="mini">${q ? "No role-assignable group matches that." : "Every role-assignable group in this tenant is the archived half of an earlier migration."}</td></tr>`}</tbody>
        </table></div>
      </div>
      ${archived.length ? renderArchived(archived) : ""}`;
  }

  // ------------------------------------------------- archived cleanup ------
  // The leftovers of earlier migrations, and the one place this tool DELETES.
  // The report that created them ends with "delete these once you are
  // satisfied", so the tool that wrote that sentence should be able to
  // finish it — but on its own terms: the reference check runs first and a
  // group anything still points at is REFUSED, not warned about. A rollback
  // that something still uses is not a leftover.
  function renderArchived(archived) {
    const rows = archived.map((g) => {
      const r = archRefs ? archRefs.byId.get(GroupMigrate.lc(g.id)) : null;
      const state = !archRefs ? '<span class="muted">not checked</span>'
        : !r ? '<span class="muted">not checked</span>'
        : r.total ? `<span style="color:var(--off)">${r.total} reference${r.total === 1 ? "" : "s"}</span>`
        : '<span style="color:var(--on)">nothing points at it</span>';
      return `<tr>
        <td style="width:34px"><input type="checkbox" data-gmarch="${esc(g.id)}" ${archSel.has(g.id) ? "checked" : ""}></td>
        <td><b>${esc(g.name)}</b><div class="mini muted">${esc(g.id)}</div></td>
        <td class="mini" style="width:190px">${state}</td>
      </tr>`;
    }).join("");
    return `<div class="list-card" style="margin-top:14px">
      <h4 style="margin:0 0 6px;font-size:13.5px">🧹 Archived by an earlier migration <span class="tag">${archived.length}</span></h4>
      <p class="mini muted" style="margin:0 0 8px">These are <b>rollbacks</b>, not live groups — they keep their members, stay
        role-assignable, and nothing should still be assigned to them. This tool will not migrate them; it will delete them once
        it has checked that nothing points at them any more.</p>
      <p class="mini muted" style="margin:0 0 10px"><b>Entra soft-deletes a group:</b> it goes to deleted items and can be restored
        for 30 days. That is a window, not a licence — a restored group comes back with the same object id, but anything you
        rebuilt in the meantime will not know that.</p>
      <div style="overflow-x:auto"><table class="plist">
        <thead><tr><th style="width:34px"></th><th>Group</th><th style="width:190px">References</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="tb-actions" style="margin-top:12px">
        <button class="btn" id="gmArchCheck" ${archSel.size ? "" : "disabled"}>🔍 Check what still points at ${archSel.size || "them"}</button>
        <button class="btn" id="gmArchDelete" ${archSel.size && archRefs ? "" : "disabled"}>🗑 Delete the selected</button>
      </div>
      <div id="gmArchMsg" class="mini" style="margin-top:10px">${archRefs ? "" : '<span class="muted">Deleting is locked until the reference check has run — an unchecked group is an unknown one, and unknown is not the same as unused.</span>'}</div>
    </div>`;
  }

  async function archCheck() {
    if (busy || !archSel.size) return;
    busy = true;
    const msg = $("gmArchMsg");
    try {
      await Graph.ensureScopes([...new Set([
        ...GroupUse.scopesFor(GroupUse.allSourceIds()), ...AssignEdit.READ(),
      ])]);
      if (msg) msg.innerHTML = '<span class="muted">Reading…</span>';
      archRefs = await GroupMigrate.referencesMany([...archSel], (m) => { if (msg) msg.innerHTML = `<span class="muted">${esc(m)}</span>`; });
      renderList();
      const el = $("gmArchMsg");
      if (el && archRefs.failed.length) {
        el.innerHTML = `<span style="color:var(--report)">⚠ ${archRefs.failed.length} surface(s) could not be read
          (${esc(archRefs.failed.map((f) => f.label).join(", "))}) — references there are unknown, so a group showing
          “nothing points at it” is only as complete as this read.</span>`;
      }
    } catch (e) {
      if (msg) msg.innerHTML = `<span style="color:var(--off)">The check failed: ${esc(GroupUse.shortErr(e, 300))}</span>`;
    } finally { busy = false; }
  }

  async function archDelete() {
    if (busy || !archSel.size || !archRefs) return;
    const rows = list.groups.filter((g) => archSel.has(g.id));
    const p = GroupMigrate.deletePlan(rows, archRefs);
    const msg = $("gmArchMsg");
    if (!p.deletable.length) {
      if (msg) msg.innerHTML = `<span style="color:var(--off)">Nothing can be deleted.</span><br>`
        + p.refused.map((r) => `<span class="mini">• <b>${esc(r.name)}</b> — ${esc(r.reason)}</span>`).join("<br>");
      return;
    }
    const names = p.deletable.map((d) => d.name).join("\n");
    // The browser's own confirm, deliberately: this is the one irreversible
    // act in the tool and it should interrupt, not sit inside the page it is
    // acting on. The refused ones are named in the prompt too, so nobody
    // agrees to "delete 4" and gets 2.
    const okToGo = window.confirm(
      `Delete ${p.deletable.length} archived group${p.deletable.length === 1 ? "" : "s"}?\n\n${names}\n\n`
      + (p.refused.length ? `${p.refused.length} selected group${p.refused.length === 1 ? " is" : "s are"} NOT included — something still points at ${p.refused.length === 1 ? "it" : "them"}.\n\n` : "")
      + "Entra soft-deletes: they can be restored for 30 days.");
    if (!okToGo) return;
    busy = true;
    try {
      await Graph.ensureScopes(GroupMigrate.SCOPES.groupWrite);
      if (msg) msg.innerHTML = '<span class="muted">Deleting…</span>';
      const res = await GroupMigrate.deleteArchived(p, { onStatus: (m) => { if (msg) msg.innerHTML = `<span class="muted">${esc(m)}</span>`; } });
      const gone = new Set(res.filter((r) => r.ok).map((r) => r.id));
      list.groups = list.groups.filter((g) => !gone.has(g.id));
      gone.forEach((id) => archSel.delete(id));
      archRefs = null;
      renderList();
      const el = $("gmArchMsg");
      if (el) {
        const bad = res.filter((r) => !r.ok);
        el.innerHTML = `<span style="color:var(--on)">Deleted ${gone.size}.</span>`
          + (bad.length ? ` <span style="color:var(--off)">${bad.length} failed: ${esc(bad.map((b) => `${b.name} — ${b.error}`).join("; "))}</span>` : "")
          + (p.refused.length ? `<br><span class="mini muted">${p.refused.length} left alone — still referenced.</span>` : "");
      }
    } catch (e) {
      if (msg) msg.innerHTML = `<span style="color:var(--off)">${esc(GroupUse.shortErr(e, 300))}</span>`;
    } finally { busy = false; }
  }

  // ------------------------------------------------------------ step 2 ----
  // Everything about ONE group, read at the click. Most groups in the list
  // are never examined, and reading nine surfaces per group up front would
  // make the list itself expensive for an answer nobody asked for.
  async function examine(id) {
    if (busy) return;
    busy = true; plan = null; result = null;
    chosen = list.groups.find((g) => GroupMigrate.lc(g.id) === GroupMigrate.lc(id)) || null;
    if (!chosen) { busy = false; return; }
    $("gmBody").innerHTML = "";
    try {
      prog(`Reading “${chosen.name}”…`);
      await Graph.ensureScopes([...new Set([
        ...Graph.SCOPES.groupMembers,
        ...GroupMigrate.SCOPES.rolesRead, ...GroupMigrate.SCOPES.auRead,
        ...GroupUse.scopesFor(GroupUse.allSourceIds()),
        ...AssignEdit.READ(),
      ])]);
      prog("Checking whether the group holds a directory role…");
      const roles = await GroupMigrate.heldRoles(chosen.id);
      prog("Checking which administrative units already hold it…");
      const holding = await GroupMigrate.unitsHolding(chosen.id);
      prog("Reading members…");
      const members = await GroupMigrate.memberIds(chosen.id);
      const refs = await GroupMigrate.references(chosen.id, (m) => prog(m));
      prog("");
      chosen = { ...chosen, roleAssignable: true, roles, holding, members, refs };
      // Seed the destination fields for THIS group. The suggestion is a
      // default the operator can overwrite; it is re-seeded per group so a
      // name typed for the last one never silently follows.
      unitMode = "new";
      pickedUnitId = (units.restricted[0] || {}).id || null;
      unitNameIn = chosen.suggestedUnit || "";
      adminIn = "";
      renderPlan();
    } catch (e) {
      prog("");
      $("gmBody").innerHTML = `<div class="list-card"><p class="mini" style="color:var(--off);margin:0">
        <b>Could not read “${esc(chosen.name)}”.</b> ${esc(GroupUse.shortErr(e, 400))}</p>
        <div class="tb-actions" style="margin-top:12px"><button class="btn" data-gmback>‹ Back to the list</button></div></div>`;
    } finally { busy = false; }
  }

  // The destination as the form currently states it. Read fresh on every
  // render and on every apply, so what the plan says is what the fields say.
  function destination() {
    if (unitMode === "none") return { toUnit: false, unitName: "", unitId: null };
    if (unitMode === "existing") {
      const id = pickedUnitId || ((units.restricted || [])[0] || {}).id || "";
      const u = (units.restricted || []).find((x) => x.id === id) || null;
      return { toUnit: true, unitId: u ? u.id : null, unitName: u ? u.name : "" };
    }
    const name = String(unitNameIn || "").trim();
    // A typed name that happens to match an existing restricted unit is that
    // unit, not a second one under the same name — Entra would allow the
    // duplicate and nobody would ever be able to tell them apart.
    const hit = (units.restricted || []).find((x) => GroupMigrate.lc(x.name) === GroupMigrate.lc(name));
    return { toUnit: true, unitId: hit ? hit.id : null, unitName: name };
  }

  // Suggest.pick() writes straight into input.value and dispatches NOTHING —
  // no `input`, no `change` — so a listener would never see an autofilled
  // administrator, and the plan would go on refusing for want of one that is
  // sitting on the screen. The fields are therefore SYNCED before use rather
  // than subscribed to. This is not the state-in-the-DOM mistake the unit
  // mode made: the module still owns the value across re-renders, and the
  // live element is only read while it exists.
  function syncFields() {
    const u = $("gmUnitName"); if (u) unitNameIn = u.value;
    const a = $("gmAdmin"); if (a) adminIn = a.value;
  }

  function rebuildPlan() {
    syncFields();
    plan = GroupMigrate.plan(chosen, {
      ...destination(),
      roles: chosen.roles, holding: chosen.holding,
      refs: chosen.refs, members: chosen.members,
      scopedAdmin: String(adminIn || "").trim(),
    });
    return plan;
  }

  function renderPlan() {
    const g = chosen;
    // rebuildPlan() FIRST: it syncs the live fields, and destination() reads
    // what that sync wrote. The other order re-rendered the form from values
    // one keystroke stale.
    const p = rebuildPlan();
    const d = destination();
    const unitOpts = (units.restricted || []).map((u) =>
      `<option value="${esc(u.id)}"${u.id === d.unitId ? " selected" : ""}>${esc(u.name)}</option>`).join("");

    const head = `<div class="list-card">
      <div class="tb-actions" style="margin:0 0 10px"><button class="btn" data-gmback>‹ All role-assignable groups</button></div>
      <h3 style="margin:0 0 4px">${esc(g.name)}</h3>
      <p class="mini muted" style="margin:0 0 12px">role-assignable · ${g.members.users.length} member${g.members.users.length === 1 ? "" : "s"} ·
        ${g.refs.repointable.length + g.refs.other.length} Intune assignment${(g.refs.repointable.length + g.refs.other.length) === 1 ? "" : "s"} ·
        ${g.roles.ok ? (g.roles.active.length || g.roles.eligible.length
          ? `<span style="color:var(--off)">holds ${esc([...new Set([...g.roles.active, ...g.roles.eligible])].join(", "))}</span>`
          : "holds no directory role ✓")
        : `<span style="color:var(--off)">role check failed</span>`}</p>
      <p class="mini muted" style="margin:0"><code>${esc(g.id)}</code></p>
    </div>`;

    // The destination form is ALWAYS shown, including on a refusal — a
    // refusal that hides the controls that could resolve it reads as a dead
    // end when it is usually one field away from being a plan.
    const form = `<div class="list-card wi-form" style="margin-top:14px">
      <h4 style="margin:0 0 8px;font-size:13.5px">Where the replacement goes</h4>
      <div class="seg" id="gmUnitSeg" style="margin-bottom:10px">
        <button class="${unitMode === "new" ? "active" : ""}" data-gmmode="new">Create a unit</button>
        <button class="${unitMode === "existing" ? "active" : ""}" data-gmmode="existing" ${units.restricted.length ? "" : "disabled"}>Use an existing one</button>
        <button class="${unitMode === "none" ? "active" : ""}" data-gmmode="none">Leave it outside</button>
      </div>
      <div id="gmUnitNewWrap" style="display:${unitMode === "new" ? "" : "none"}">
        <label class="mini" style="display:block;margin-bottom:4px">Unit name</label>
        <input type="text" id="gmUnitName" value="${esc(unitNameIn)}" style="width:100%;max-width:420px">
        <p class="mini muted" style="margin:6px 0 0">Suggested from the group's own name under the
          <code>${esc(GroupMigrate.UNIT_PREFIX)}</code> convention. Change it freely — the unit is the boundary, so two
          groups in one unit share their administrators, and that is a decision worth making rather than inheriting.</p>
        <label class="mini" style="display:block;margin:12px 0 4px">Scoped administrator <span class="muted">— UPN or object id</span></label>
        <input type="text" id="gmAdmin" value="${esc(adminIn)}" placeholder="admin@contoso.com" style="width:100%;max-width:420px">
        <p class="mini muted" style="margin:6px 0 0">Granted <b>Groups Administrator scoped to this unit</b> when it is created.
          Required, and not as paperwork: a restricted unit blocks every tenant-wide role, so a unit with nobody scoped to it
          is a vault nobody can open — including you.</p>
      </div>
      <div id="gmUnitPickWrap" style="display:${unitMode === "existing" ? "" : "none"}">
        <label class="mini" style="display:block;margin-bottom:4px">Restricted unit</label>
        <select id="gmUnitPick" style="width:100%;max-width:420px">${unitOpts}</select>
        <p class="mini muted" style="margin:6px 0 0">Only units carrying <code>isMemberManagementRestricted</code> are listed.
          ${units.unrestricted.length ? `${units.unrestricted.length} ordinary administrative unit${units.unrestricted.length === 1 ? " is" : "s are"} deliberately not offered — the flag is immutable, so an ordinary unit cannot be upgraded into a restricted one.` : ""}</p>
      </div>
      <div id="gmUnitNoneWrap" style="display:${unitMode === "none" ? "" : "none"}">
        <p class="mini" style="margin:0;color:var(--report)">⚠ The replacement will be an ordinary group. Its membership becomes
          manageable by <b>any</b> tenant-wide Groups or User Administrator — which is <b>less</b> protection than the group has
          right now, not more. Only sensible as a first half, with the unit placed straight afterwards.</p>
      </div>
    </div>`;

    const body = p.ok ? renderOkPlan(p) : `<div class="list-card" style="margin-top:14px">
      <h4 style="margin:0 0 6px;font-size:13.5px;color:var(--off)">${p.frozen ? "🧊 Frozen" : "Not migrated"}</h4>
      <p class="mini" style="margin:0">${esc(p.reason)}</p>
    </div>`;

    $("gmBody").innerHTML = head + form + body;
    // Tenant-backed autofill on the scoped administrator, through the app's
    // ONE typeahead rather than a second one. Attached after each render
    // because this form is rebuilt, not mutated — Suggest.init() registers
    // static ids at boot and this field does not exist then.
    //
    // It fills the UPN, which is what grantScopedAdmin() resolves, and which
    // is the right half of the pair: two people can share a display name.
    // Typing an object id by hand keeps working, and so does typing a UPN
    // the suggestions never offered — the field is not a picker.
    const admin = $("gmAdmin");
    if (admin && typeof Suggest !== "undefined") Suggest.attach(admin, { kind: "user" });
  }

  function renderOkPlan(p) {
    const steps = p.steps.map((s, i) => `<li class="mini" style="margin-bottom:4px"><b>${i + 1}.</b> ${esc(s.text)}</li>`).join("");
    const rep = p.refs.repointable.length
      ? `<table class="plist"><tbody>${p.refs.repointable.map((r) => `<tr>
          <td class="mini" style="width:190px">${esc(r.icon || "")} ${esc(r.surfaceLabel)}</td>
          <td class="mini"><b>${esc(r.name)}</b></td>
          <td class="mini" style="width:90px">${esc(r.how)}</td></tr>`).join("")}</tbody></table>`
      : '<p class="mini muted" style="margin:0">Nothing on the four writable surfaces names this group.</p>';
    const other = p.refs.other.length
      ? `<table class="plist"><tbody>${p.refs.other.map((r) => `<tr>
          <td class="mini" style="width:190px">${esc(r.sourceLabel)}</td>
          <td class="mini"><b>${esc(r.name)}</b></td>
          <td class="mini" style="width:90px">${esc(r.how)}</td></tr>`).join("")}</tbody></table>`
      : '<p class="mini" style="margin:0">No other Intune assignment names this group.</p>';

    return `<div class="list-card" style="margin-top:14px">
      <h4 style="margin:0 0 8px;font-size:13.5px">What will happen, in this order</h4>
      <ol style="margin:0 0 4px;padding-left:20px;line-height:1.9">${steps}</ol>
      <p class="mini muted" style="margin:8px 0 0"><b>The order is the safety property.</b> Members move while the new group is
        still ordinary — once it is inside a restricted unit only a unit-scoped role could add them. And every assignment gains
        the new group <b>before</b> it loses the old one, so nothing is ever pointed at neither.</p>

      <h4 style="margin:18px 0 6px;font-size:13.5px">Assignments this tool will repoint <span class="tag grant">${p.refs.repointable.length}</span></h4>
      ${rep}
      <p class="mini muted" style="margin:6px 0 0">The four surfaces T11 already writes, under the
        <code>DeviceManagementConfiguration.ReadWrite.All</code> scope this registration declares. No new write scope.
        AssignEdit does the writing, so the drift check and the verify read-back are the ones in production.</p>

      <div style="background:var(--bad-bg);border:1px solid var(--off);border-radius:10px;padding:12px 14px;margin-top:16px">
        <h4 style="margin:0 0 6px;font-size:13.5px;color:var(--off)">Assignments this tool will NOT repoint <span class="tag block">${p.refs.other.length}</span></h4>
        ${other}
        <p class="mini" style="margin:8px 0 0"><b>These keep pointing at the archived group and must be moved by hand.</b>
          Each needs a write scope this registration does not declare, and adding one is a decision taken in the open rather
          than a side effect of this tool.</p>
        <p class="mini" style="margin:6px 0 0"><b>And everything outside Intune is invisible here</b> — Conditional Access,
          group-based licensing, Azure RBAC, app role assignments. The archived group is your rollback until you have checked them.</p>
        ${p.refs.failed.length ? `<p class="mini" style="margin:6px 0 0">⚠ <b>${p.refs.failed.length} surface${p.refs.failed.length === 1 ? "" : "s"} could not be read</b>
          (${esc(p.refs.failed.map((f) => f.label).join(", "))}) — references there are <b>unknown</b>, which is not the same as absent.</p>` : ""}
      </div>

      <h4 style="margin:18px 0 6px;font-size:13.5px">Confirm</h4>
      <p class="mini muted" style="margin:0 0 6px">Type <b>${esc(p.name)}</b> to unlock. This is a rename plus a create plus an
        assignment rewrite; a mis-click is not undone in one step.</p>
      <input type="text" id="gmConfirm" placeholder="${esc(p.name)}" style="width:100%;max-width:420px">
      <div class="tb-actions" style="margin-top:12px">
        <button class="btn primary" id="gmApply" disabled>🔄 Migrate this group</button>
        <button class="btn" id="gmPlanMd">⭳ Plan as Markdown</button>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ step 3 ----
  async function run() {
    if (busy || !plan || !plan.ok) return;
    busy = true;
    const p = rebuildPlan();
    if (!p.ok) { busy = false; renderPlan(); return; }
    $("gmBody").innerHTML = "";
    try {
      // The write scopes, at the click — never at sign-in. A read-only visit
      // to this screen must not leave the session holding Group.ReadWrite.All.
      const want = [...GroupMigrate.SCOPES.groupWrite, ...GroupMigrate.SCOPES.auWrite, ...AssignEdit.WRITE()];
      if (p.createsUnit) want.push(...GroupMigrate.SCOPES.roleWrite);
      await Graph.ensureScopes([...new Set(want)]);
      prog("Migrating…");
      result = await GroupMigrate.apply(p, { onStatus: (m) => prog(m) });
      prog("");
      renderResult();
    } catch (e) {
      prog("");
      $("gmBody").innerHTML = `<div class="list-card"><p class="mini" style="color:var(--off);margin:0">
        <b>The migration did not start.</b> ${esc(GroupUse.shortErr(e, 400))}</p>
        <div class="tb-actions" style="margin-top:12px"><button class="btn" data-gmback>‹ Back to the list</button></div></div>`;
    } finally { busy = false; }
  }

  function renderResult() {
    const r = result;
    const lines = r.log.map((l) => `<p class="mini" style="margin:0 0 3px">${l.ok ? "✅" : "❌"} ${esc(l.text)}${l.detail ? ` <span class="muted">— ${esc(l.detail)}</span>` : ""}</p>`).join("");
    $("gmBody").innerHTML = `<div class="list-card">
      <h3 style="margin:0 0 6px">${r.ok ? "✅" : "❌"} ${esc(r.name)}</h3>
      <p class="mini muted" style="margin:0 0 12px">${r.ok ? "Migrated" : "Failed"} ·
        new id <code>${esc(r.newId || "—")}</code> · archived as <b>${esc(r.archiveName)}</b> ·
        ${r.membersMoved}/${r.memberTotal} members · ${r.refsMoved}/${r.refsTotal} assignments repointed</p>
      ${r.error ? `<p class="mini" style="margin:0 0 12px;color:var(--off)"><b>⚠ ${esc(r.error)}</b></p>` : ""}
      ${lines}
      ${plan.refs.other.length ? `<div style="background:var(--bad-bg);border:1px solid var(--off);border-radius:10px;padding:12px 14px;margin-top:14px">
        <p class="mini" style="margin:0"><b>${plan.refs.other.length} Intune assignment${plan.refs.other.length === 1 ? "" : "s"} still point${plan.refs.other.length === 1 ? "s" : ""} at the archived group</b>
        and must be moved by hand — the list is in the report. Do not delete <b>${esc(r.archiveName)}</b> until they are done and
        <a href="#tool:toolGroupUse">T02 Group Analyzer</a> comes back empty on it.</p></div>` : ""}
      <div class="tb-actions" style="margin-top:14px">
        <button class="btn primary" id="gmReportMd">⭳ Report as Markdown</button>
        <button class="btn" data-gmback>‹ Back to the list</button>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- init --
  function init() {
    const run1 = $("gmRun");
    if (!run1) return;
    run1.addEventListener("click", readGroups);
    const grant = $("gmGrant");
    if (grant) {
      grant.title = grantTitle();
      grant.addEventListener("click", grantAll);
    }
    const reset = $("gmReset");
    if (reset) reset.addEventListener("click", () => {
      list = null; units = null; chosen = null; plan = null; result = null;
      unitMode = "new"; pickedUnitId = null; unitNameIn = ""; adminIn = ""; unitsError = "";
      search = ""; archSel.clear(); archRefs = null;
      $("gmBody").innerHTML = ""; $("gmProg").innerHTML = "";
    });

    $("gmBody").addEventListener("click", (e) => {
      const pick = e.target.closest("[data-gmpick]");
      if (pick) { examine(pick.dataset.gmpick); return; }
      const arch = e.target.closest("[data-gmarch]");
      if (arch) {
        const id = arch.dataset.gmarch;
        if (arch.checked) archSel.add(id); else archSel.delete(id);
        // The reference check belongs to the SET it was run against. Changing
        // the set invalidates it, and re-enabling delete on a stale check
        // would be the one place this tool lied about what it knew.
        archRefs = null;
        renderList();
        return;
      }
      if (e.target.closest("#gmArchCheck")) { archCheck(); return; }
      if (e.target.closest("#gmArchDelete")) { archDelete(); return; }
      if (e.target.closest("[data-gmback]")) { chosen = null; plan = null; result = null; renderList(); return; }
      const mode = e.target.closest("[data-gmmode]");
      if (mode) { if (!mode.disabled) { unitMode = mode.dataset.gmmode; renderPlan(); } return; }
      if (e.target.closest("#gmApply")) { run(); return; }
      if (e.target.closest("#gmPlanMd")) {
        const p = rebuildPlan();
        download(`tuno-migration-plan-${p.name.replace(/[^\w.-]+/g, "_")}.md`, planMd(p), "text/markdown");
        return;
      }
      if (e.target.closest("#gmReportMd") && result && plan) {
        download(`tuno-migration-${result.name.replace(/[^\w.-]+/g, "_")}.md`,
          GroupMigrate.report(plan, result, { tenant: tenantName(), build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "") }),
          "text/markdown");
      }
    });

    // The confirm gate. Typed name unlocks apply, and ANY change to the
    // destination re-plans — a plan computed against a unit the operator has
    // since changed is a plan describing something that will not happen.
    $("gmBody").addEventListener("input", (e) => {
      if (e.target.id === "gmSearch") {
        search = e.target.value;
        renderPlanKeepingFocus("gmSearch", renderList);
        return;
      }
      if (e.target.id === "gmConfirm") {
        const btn = $("gmApply");
        if (btn && plan) btn.disabled = e.target.value.trim() !== plan.name;
        return;
      }
      if (e.target.id === "gmUnitName" || e.target.id === "gmAdmin") {
        // Into the module's own state first — the DOM renders FROM these.
        if (e.target.id === "gmUnitName") unitNameIn = e.target.value;
        else adminIn = e.target.value;
        const was = plan && plan.ok;
        rebuildPlan();
        // Re-render only when the VERDICT changed. A refusal the destination
        // can resolve must appear as the field is typed rather than on the
        // next click; re-rendering on every keystroke would also clear the
        // confirm box, which is correct when the plan changed and merely
        // irritating when it did not.
        if (was !== plan.ok) renderPlanKeepingFocus(e.target.id);
      }
    });
    $("gmBody").addEventListener("change", (e) => {
      if (e.target.id === "gmUnitPick") { pickedUnitId = e.target.value; renderPlan(); }
    });
  }

  // Re-render without stealing the caret: the destination fields are typed
  // into, and a re-render that blurs them makes the field unusable (T15's
  // search box lesson, same fix).
  function renderPlanKeepingFocus(id, render) {
    const el = $(id);
    const v = el ? el.value : "";
    const pos = el && el.selectionStart != null ? el.selectionStart : null;
    (render || renderPlan)();
    const back = $(id);
    if (back) {
      back.value = v;
      back.focus();
      if (pos != null) { try { back.setSelectionRange(pos, pos); } catch { /* not a text input */ } }
    }
  }

  function planMd(p) {
    const L = [`# Migration plan — ${p.name}`, "", `_Nothing has been changed. This is what would happen._`, ""];
    if (!p.ok) { L.push(`## Not migrated`, "", p.reason, ""); return L.join("\n"); }
    L.push("## Steps", "");
    p.steps.forEach((s, i) => L.push(`${i + 1}. ${s.text}`));
    L.push("", "## Assignments this tool would repoint", "");
    if (p.refs.repointable.length) {
      L.push("| Surface | Object | How |", "| --- | --- | --- |");
      p.refs.repointable.forEach((r) => L.push(`| ${r.surfaceLabel} | ${r.name} | ${r.how} |`));
    } else L.push("_None._");
    L.push("", "## Assignments this tool would NOT repoint", "");
    if (p.refs.other.length) {
      L.push("| Surface | Object | How |", "| --- | --- | --- |");
      p.refs.other.forEach((r) => L.push(`| ${r.sourceLabel} | ${r.name} | ${r.how} |`));
    } else L.push("_None._");
    L.push("", "## Warnings", "");
    p.warnings.forEach((w) => L.push(`- ${w}`));
    return L.join("\n");
  }

  return {
    init, readGroups, examine, renderPlan, rebuildPlan, planMd, destination,
    // for the headless suite: the destination state is the thing that broke
    // when it lived in the DOM, so the tests drive it directly.
    _setMode: (m, id) => { unitMode = m; if (id !== undefined) pickedUnitId = id; },
    _setFields: (name, admin) => { unitNameIn = name; adminIn = admin; },
    _state: () => ({ unitMode, pickedUnitId, unitNameIn, adminIn }),
  };
})();

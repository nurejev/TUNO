// ======================================================================
// T06 — Intune device analyzer (BETA). "Why did THIS device get that policy?"
//
// R04's Group Analyzer read from the other end. T02 answers "what does this
// group receive"; T06 walks the same assignment graph BACKWARDS, from one
// device, through the groups it is in and the groups its primary user is in,
// to the policies that name them.
//
// THE ENDPOINT LIST IS NOT COPIED — IT IS GroupUse.SOURCES. Nine surfaces and
// twenty Graph endpoints, one table, one file. A second copy would drift: the
// first time somebody adds a surface to T02 and not to T06, this tool starts
// reporting a device as unaffected by a workload it never looked at, and
// nothing on the screen would say so. So T06 builds a match set and a "why"
// map and hands both to GroupUse.analyze(); everything below is about the
// device, not about assignments.
//
// FOUR THINGS THIS TOOL SAYS THAT T02 DOES NOT NEED TO:
//
//   1. TENANT-WIDE TARGETS ARE ON BY DEFAULT, and that is a real difference
//      rather than a preference. In T02 an All Devices assignment is the same
//      answer for every group and says nothing about the one you asked about.
//      For a DEVICE it is not context, it is the answer: All Devices reaches
//      this device, always. Leaving it off would produce a report missing
//      policy the machine is definitely getting.
//
//   2. LAST CHECK-IN IS PART OF THE ANSWER. Every assignment here is what
//      Intune INTENDS. What the device has is whatever it collected the last
//      time it talked to the service, and a policy assigned ten minutes ago
//      has not applied to a device that last synced yesterday. The check-in
//      time sits next to the identity rather than in a details panel.
//
//   3. INTENDED AND ACTUAL ARE DIFFERENT COLUMNS. deviceConfigurationStates
//      and deviceCompliancePolicyStates are what the device itself reported.
//      Where they answer, they are shown next to the assignment. Where they
//      403, come back empty, or cannot be matched to a policy with certainty,
//      the state is UNKNOWN — never "compliant" by omission. The whole value
//      of this tool is the gap between the two columns, and filling that gap
//      with an optimistic guess destroys it.
//
//   4. A FILTERED ASSIGNMENT IS AN OPEN QUESTION. An assignment carrying a
//      device filter may or may not reach this device: the rule is evaluated
//      by the service against inventory this browser cannot see, and there is
//      no Graph call that answers "would filter F include device D". So a
//      filtered row says MAY REACH and names the filter. It never says yes.
//
// Reads only. Nothing here writes, and nothing is stored.
// ======================================================================
const DeviceWhy = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const shortErr = (e, max) => GroupUse.shortErr(e, max);

  const S = () => Graph.SCOPES;

  // Everything one run may ask for, declared up front so consent is requested
  // once on the click — see Graph.ensureScopes for why nine lazy asks became
  // one.
  //
  // deviceObjects (Device.Read.All) is the scope this tool added to TUNO. The
  // Entra device object is NOT the Intune managedDevice record: Intune's scope
  // reads the enrolment, and only the directory can say which groups the
  // machine is in. Without it the device half of the walk is unknown — and it
  // is reported as unknown rather than as "no groups".
  const scopesFor = (sourceIds) => [...new Set([
    ...GroupUse.scopesFor(sourceIds),
    ...S().devices,
    ...S().deviceObjects,
    ...S().directory,
  ])];

  // The fields the search list needs. The single-device path reads the record
  // WHOLE — a device is one object, and the interesting field is always the
  // one that was $select-ed away.
  const LIST_SELECT = "id,deviceName,managedDeviceName,serialNumber,azureADDeviceId,userId,userPrincipalName,userDisplayName,operatingSystem,osVersion,complianceState,managedDeviceOwnerType,enrolledDateTime,lastSyncDateTime,model,manufacturer";

  // How many pages of the inventory a local scan reads before it stops. 999 a
  // page, so ten pages is roughly ten thousand devices — past that the honest
  // answer is "stopped looking", not a silent miss.
  const SCAN_PAGES = 10;

  const isNotFound = (e) => (e && e.kind === "notfound") || /\b404\b|not\s*found/i.test(String((e && e.message) || ""));

  // ------------------------------------------------------------- finding --
  //
  // A device is looked up four ways because an admin has four things to
  // hand: the name in the portal, the serial on the sticker, a GUID out of
  // a support ticket — and, most often of all, THE USER the ticket is about.
  // The enrolment record names its primary user, so a UPN, a display name or
  // the user's object id resolves to their devices with no /users call and no
  // new scope. The GUIDs stay interesting — every machine has TWO (the Intune
  // managedDevice id and the Entra device id), they are not interchangeable,
  // and the user's object id makes a third — so all three are tried.
  //
  // $filter SUPPORT ON managedDevices IS NOT DOCUMENTED PER PROPERTY and
  // tenants differ, so every server-side filter is attempted and its failure
  // captured rather than thrown: a 400 on serialNumber must not lose a
  // perfectly good match on deviceName. When nothing filters, the inventory is
  // listed and matched here — slower, and the report says which route answered
  // so a long run is explained rather than mysterious.
  async function tryFilter(path, scopes) {
    try { return { ok: true, items: await Graph.readAll(path, { scopes, beta: true, retry: true }) }; }
    catch (e) {
      // A consent or permission refusal is not "this filter is unsupported" —
      // swallowing it would send the person hunting for a device that is
      // sitting there, so it is handed back to be rethrown.
      return { ok: false, error: shortErr(e, 160), fatal: (e && (e.kind === "admin" || e.kind === "consent" || e.kind === "auth")) ? e : null };
    }
  }

  async function scanDevices(pred, onStatus) {
    const matches = [];
    let scanned = 0, pages = 0, truncated = false;
    let next = Graph.BETA + `/deviceManagement/managedDevices?$select=${LIST_SELECT}&$top=999`;
    while (next) {
      const j = await Graph.readOne(next, { scopes: S().devices });
      const page = (j && j.value) || [];
      scanned += page.length;
      page.forEach((d) => { if (pred(d)) matches.push(d); });
      onStatus && onStatus(`Listing the inventory — ${scanned} devices read…`);
      next = (j && j["@odata.nextLink"]) || null;
      if (++pages >= SCAN_PAGES && next) { truncated = true; break; }
    }
    return { matches, scanned, truncated };
  }

  // MORE THAN ONE MATCH IS AN ANSWER, NOT AN ERROR. A user with a laptop AND
  // a phone is the normal case for the primary-user route, not a collision —
  // so every multi-match here returns `{ devices }` for the screen to offer
  // as a pick, and the old dead end ("use the Intune device id") is gone from
  // the name and serial routes as a side effect: the admin who typed a
  // colliding name gets the colliding devices, not homework.
  async function findDevice(term, onStatus) {
    term = String(term || "").trim();
    if (!term) throw new Error("Enter a device name, serial number, primary user or object ID");
    const notes = [];
    const t = lc(term);
    const one = (device, matchedOn) => ({ device, matchedOn, notes });
    const many = (devices, matchedOn) => ({ devices, matchedOn, notes });

    if (Graph.isGuid(term)) {
      onStatus && onStatus("Looking the device up by id…");
      try {
        const d = await Graph.readOne(`/deviceManagement/managedDevices/${encodeURIComponent(term)}`, { scopes: S().devices, beta: true });
        if (d && d.id) return one(d, "the Intune device id");
      } catch (e) {
        // Only a 404 means "try the other GUID". A 403 here is a permission
        // problem, and treating it as a miss would report a device that is
        // sitting right there as absent.
        if (!isNotFound(e)) throw e;
      }
      const byAad = await tryFilter(Graph.odata`/deviceManagement/managedDevices?$filter=azureADDeviceId eq '${term}'` + `&$select=${LIST_SELECT}`, S().devices);
      if (byAad.fatal) throw byAad.fatal;
      if (byAad.ok && byAad.items.length === 1) return one(byAad.items[0], "the Entra device id");
      if (byAad.ok && byAad.items.length > 1) return many(byAad.items, "the Entra device id");
      if (!byAad.ok) notes.push(`This tenant would not filter on azureADDeviceId (${byAad.error}).`);
      // The THIRD GUID a ticket carries: the user's object id. The enrolment
      // record names its user, so this needs no /users call and no new scope.
      const byUid = await tryFilter(Graph.odata`/deviceManagement/managedDevices?$filter=userId eq '${term}'` + `&$select=${LIST_SELECT}`, S().devices);
      if (byUid.fatal) throw byUid.fatal;
      if (byUid.ok && byUid.items.length === 1) return one(byUid.items[0], "the primary user's object id");
      if (byUid.ok && byUid.items.length > 1) return many(byUid.items, "the primary user's object id");
      if (!byUid.ok) notes.push(`This tenant would not filter on userId (${byUid.error}).`);
    }

    // A term with an @ in it is a UPN before it is anything else — no device
    // name or serial carries one — so the primary-user filter goes first.
    // Display names have no such marker; those are the scan's job below.
    const filters = [
      ["deviceName", "the device name", Graph.odata`/deviceManagement/managedDevices?$filter=deviceName eq '${term}'` + `&$select=${LIST_SELECT}`],
      ["serialNumber", "the serial number", Graph.odata`/deviceManagement/managedDevices?$filter=serialNumber eq '${term}'` + `&$select=${LIST_SELECT}`],
    ];
    if (term.includes("@")) filters.unshift(
      ["userPrincipalName", "the primary user", Graph.odata`/deviceManagement/managedDevices?$filter=userPrincipalName eq '${term}'` + `&$select=${LIST_SELECT}`]);
    for (const [field, label, path] of filters) {
      onStatus && onStatus(`Looking for ${field} “${term}”…`);
      const r = await tryFilter(path, S().devices);
      if (r.fatal) throw r.fatal;
      if (!r.ok) { notes.push(`This tenant would not filter on ${field} (${r.error}).`); continue; }
      if (r.items.length === 1) return one(r.items[0], label);
      if (r.items.length > 1) return many(r.items, label);
    }

    // Nothing filtered, or nothing matched. List and match here.
    onStatus && onStatus("Listing the inventory…");
    const scan = await scanDevices((d) => lc(d.deviceName) === t || lc(d.serialNumber) === t
      || lc(d.managedDeviceName) === t || lc(d.azureADDeviceId) === t || lc(d.id) === t
      || lc(d.userPrincipalName) === t || lc(d.userDisplayName) === t, onStatus);
    notes.push(`Matched by listing the inventory — ${scan.scanned} device${scan.scanned === 1 ? "" : "s"} read.${scan.truncated ? ` Stopped after ${SCAN_PAGES} pages; a device further down the list would have been missed.` : ""}`);
    if (scan.matches.length === 1) return { device: scan.matches[0], matchedOn: "name, serial, id or primary user, matched locally", notes, scanned: scan.scanned };
    if (scan.matches.length > 1) return { devices: scan.matches, matchedOn: "name, serial, id or primary user, matched locally", notes, scanned: scan.scanned };
    throw new Error(`No device matches “${term}”${scan.truncated ? `, in the first ${scan.scanned} of the inventory` : ""}. Names, serials, ids and primary users (UPN or display name) are matched exactly.`);
  }

  // ------------------------------------------------------------ check-in --
  //
  // The second question is always "has it landed yet", and it has one input:
  // when the device last talked to the service. A device that has not checked
  // in since a policy was assigned cannot have applied it.
  const HOUR = 3600e3, DAY = 24 * HOUR;

  function freshness(dev, now) {
    const raw = (dev && dev.lastSyncDateTime) || "";
    const t = Date.parse(raw);
    if (!Number.isFinite(t)) return { known: false, when: "", ageMs: null, label: "never reported", stale: true, veryStale: true };
    const ms = Math.max(0, (now || Date.now()) - t);
    let label;
    if (ms < 2 * 60e3) label = "just now";
    else if (ms < HOUR) label = `${Math.round(ms / 60e3)} minutes ago`;
    else if (ms < DAY) label = `${Math.round(ms / HOUR)} hour${Math.round(ms / HOUR) === 1 ? "" : "s"} ago`;
    else label = `${Math.round(ms / DAY)} day${Math.round(ms / DAY) === 1 ? "" : "s"} ago`;
    return { known: true, when: raw, ageMs: ms, label, stale: ms > DAY, veryStale: ms > 7 * DAY };
  }

  // The sentence that belongs next to every answer this tool gives.
  function landedNote(f) {
    if (!f.known) return "This device has never reported a check-in, so nothing below has been confirmed as applied — every row is what Intune intends to send, not what the machine has.";
    return `Everything below is what Intune INTENDS for this device. The machine last checked in ${f.label}; anything assigned since then has not reached it yet, and a policy assigned minutes ago will not have applied.`;
  }

  // --------------------------------------------------- the backwards walk --
  //
  // Two membership graphs meet at one device.
  //
  //   * THE DEVICE'S OWN GROUPS. managedDevice.azureADDeviceId is the DEVICE
  //     ID, not the directory object id — passing it to /devices/{id} gives a
  //     confident 404 that reads like a missing device. The alternate-key form
  //     /devices(deviceId='…') addresses the object directly and saves the
  //     extra lookup that mistake usually leads to.
  //
  //   * THE PRIMARY USER'S GROUPS. Half of Intune targets users, and a policy
  //     reaching this machine through the person sitting at it is the single
  //     hardest thing to see in the portal. userId on the device record is the
  //     Entra user object id.
  //
  // Transitive on both sides: a policy on a parent group reaches the child's
  // members, and a report that stops at direct membership is wrong about it.
  async function buildScope(dev, onStatus) {
    const via = new Map();
    const deviceGroups = [], userGroups = [];
    let deviceGroupsError = null, userGroupsError = null;

    const keep = (o) => {
      const ty = lc(o["@odata.type"]);
      return !ty.includes("directoryrole") && !ty.includes("administrativeunit");
    };

    onStatus && onStatus("Reading the device's group memberships…");
    if (dev.azureADDeviceId) {
      try {
        const gs = await Graph.readAll(
          Graph.odata`/devices(deviceId='${dev.azureADDeviceId}')/transitiveMemberOf?$select=id,displayName`,
          { scopes: S().deviceObjects, retry: true });
        gs.filter(keep).forEach((o) => {
          via.set(lc(o.id), `via group “${o.displayName || o.id}”`);
          deviceGroups.push({ id: o.id, name: o.displayName || o.id });
        });
      } catch (e) { deviceGroupsError = shortErr(e); }
    } else {
      deviceGroupsError = "Intune holds no Entra device id for this record, so its directory object cannot be found. Devices enrolled without an Entra join often look like this.";
    }

    const user = dev.userId ? { id: dev.userId, name: dev.userDisplayName || dev.userPrincipalName || dev.userId, upn: dev.userPrincipalName || "" } : null;
    if (user) {
      onStatus && onStatus(`Reading ${user.name}'s group memberships…`);
      try {
        const gs = await Graph.readAll(`/users/${encodeURIComponent(user.id)}/transitiveMemberOf?$select=id,displayName`,
          { scopes: S().directory, retry: true });
        gs.filter(keep).forEach((o) => {
          const k = lc(o.id);
          userGroups.push({ id: o.id, name: o.displayName || o.id });
          // A group holding the device AND the user is reported as the
          // device's — that is the stronger statement — with the other half
          // said rather than dropped.
          if (via.has(k)) via.set(k, `${via.get(k)} (the primary user is in it too)`);
          else via.set(k, `via the primary user's group “${o.displayName || o.id}”`);
        });
      } catch (e) { userGroupsError = shortErr(e); }
    }

    return {
      via, ids: new Set(via.keys()),
      deviceGroups, userGroups, user,
      deviceGroupsError, userGroupsError,
      // Both halves failing is not the same as a device in no groups, and the
      // difference decides whether the report below is an answer or a floor.
      blind: !!deviceGroupsError && (!user || !!userGroupsError),
    };
  }

  // ----------------------------------------------------- per-device state --
  //
  // What the DEVICE said, as opposed to what Intune intends. Two surfaces,
  // read separately so one 403 does not lose the other.
  async function readStates(dev, onStatus) {
    const out = { config: [], compliance: [], configError: null, complianceError: null };
    const id = encodeURIComponent(dev.id);
    onStatus && onStatus("Reading what the device reported…");
    try {
      out.config = await Graph.readAll(`/deviceManagement/managedDevices/${id}/deviceConfigurationStates`, { scopes: S().devices, beta: true, retry: true });
    } catch (e) { out.configError = shortErr(e); }
    try {
      out.compliance = await Graph.readAll(`/deviceManagement/managedDevices/${id}/deviceCompliancePolicyStates`, { scopes: S().devices, beta: true, retry: true });
    } catch (e) { out.complianceError = shortErr(e); }
    return out;
  }

  // MATCHING A REPORTED STATE TO AN ASSIGNMENT IS NOT EXACT, and pretending
  // otherwise is how a report attributes one policy's failure to another. The
  // state record's `id` is not always the policy id — it usually carries one,
  // so the first GUID inside it is indexed — and displayName is the only other
  // handle. A name appearing twice is therefore AMBIGUOUS and resolves to
  // unknown rather than to whichever record happened to be seen first.
  const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  function indexStates(states) {
    const byId = new Map(), byName = new Map(), dupeNames = new Set();
    const all = [...((states && states.config) || []), ...((states && states.compliance) || [])];
    for (const s of all) {
      const g = (String(s.id || "").match(GUID_RE) || [])[0];
      if (g) byId.set(lc(g), s);
      const n = lc(s.displayName || "");
      if (!n) continue;
      if (byName.has(n)) dupeNames.add(n); else byName.set(n, s);
    }
    return { byId, byName, dupeNames, count: all.length };
  }

  // Only two surfaces report per-device state at all. For the rest — apps,
  // scripts, enrolment, Autopilot — "unknown" would imply Graph was asked and
  // did not answer, which is not what happened.
  const STATEFUL = new Set(["config", "compliance"]);

  function stateFor(row, idx) {
    if (!STATEFUL.has(row.source)) return { state: "", applicable: false, matchedBy: "" };
    const byId = idx.byId.get(lc(row.id));
    if (byId) return { state: lc(byId.state) || "unknown", applicable: true, matchedBy: "id", settings: byId.settingStates || null };
    const n = lc(row.name);
    if (n && idx.dupeNames.has(n)) return { state: "unknown", applicable: true, matchedBy: "ambiguous name" };
    const byName = n && idx.byName.get(n);
    if (byName) return { state: lc(byName.state) || "unknown", applicable: true, matchedBy: "name" };
    return { state: "unknown", applicable: true, matchedBy: "none" };
  }

  const STATE_LABEL = {
    compliant: "Compliant", remediated: "Remediated", noncompliant: "Not compliant",
    error: "Error", conflict: "Conflict", notapplicable: "Not applicable",
    notassigned: "Not assigned", unknown: "Unknown", "": "",
  };
  const stateLabel = (s) => STATE_LABEL[lc(s)] || (s ? String(s) : "");

  // ------------------------------------------------------------- verdicts --
  //
  // The question is per POLICY, not per assignment row: one policy can reach
  // this device through three groups and be excluded through a fourth. Intune's
  // rule is that an exclusion beats an inclusion, so that is the rule here.
  //
  // The case that gets its own answer: an inclusion arriving through a DEVICE
  // group and an exclusion through the primary USER's group, or the reverse.
  // Whether that exclusion applies depends on whether the policy is targeted
  // at users or at devices, and the assignment does not say. Calling it either
  // way would be a guess, so it is called a conflict and left to the portal.
  const policyKey = (r) => `${r.source}|${r.id}`;

  function verdicts(rows, scope) {
    const userIds = new Set(((scope && scope.userGroups) || []).map((g) => lc(g.id)));
    const devIds = new Set(((scope && scope.deviceGroups) || []).map((g) => lc(g.id)));
    const kindOf = (r) => (r.pid === GroupUse.TENANT_WIDE ? "tenant" : devIds.has(r.pid) ? "device" : userIds.has(r.pid) ? "user" : "group");
    const m = new Map();
    for (const r of rows) {
      const k = policyKey(r);
      if (!m.has(k)) m.set(k, { key: k, source: r.source, sourceLabel: r.sourceLabel, sub: r.sub, id: r.id, name: r.name, rows: [], included: 0, excluded: 0, filtered: 0, tenantWide: 0 });
      const v = m.get(k);
      v.rows.push(r);
      if (r.how === "excluded") v.excluded++;
      else {
        v.included++;
        if (r.pid === GroupUse.TENANT_WIDE) v.tenantWide++;
        if (r.filterMode) v.filtered++;
      }
    }
    for (const v of m.values()) {
      const exRows = v.rows.filter((r) => r.how === "excluded");
      const inRows = v.rows.filter((r) => r.how !== "excluded");
      const exKinds = new Set(exRows.map(kindOf));
      const inKinds = new Set(inRows.map(kindOf));
      v.mixedKind = !!(exRows.length && inRows.length
        && ((exKinds.has("user") && !inKinds.has("user")) || (inKinds.has("user") && !exKinds.has("user"))));
      if (v.excluded) v.effect = v.mixedKind ? "conflict" : "excluded";
      else if (v.filtered && v.filtered === v.included) v.effect = "maybe";
      else v.effect = "applies";
      v.rows.forEach((r) => { r.effect = v.effect; });
    }
    return m;
  }

  const EFFECT_LABEL = {
    applies: "Reaches this device",
    maybe: "May reach it — filtered",
    excluded: "Excluded",
    conflict: "Included and excluded",
  };

  // ------------------------------------------------------------------ run --
  async function analyze(opts) {
    const o = opts || {};
    const scope = o.scope;
    const res = await GroupUse.analyze({
      ids: scope.ids,
      via: scope.via,
      sourceIds: o.sourceIds,
      // For a device this is not a preference. All Devices reaches it, full
      // stop, and a report leaving those rows out is missing policy the
      // machine is definitely receiving.
      tenantWide: o.tenantWide !== false,
      onStatus: o.onStatus,
    });
    res.rows = await GroupUse.resolveFilters(res.rows);

    // A tenant-wide row's "via" is about the tenant in T02 and about the
    // device here, and the two are not the same sentence — All Users lands on
    // the PERSON, so on a device with no primary user it reaches nothing.
    const hasUser = !!(scope.user && scope.user.id);
    res.rows.forEach((r) => {
      if (r.pid !== GroupUse.TENANT_WIDE) return;
      r.viaLabel = r.how === "all-devices"
        ? "All Devices — every enrolled device, including this one"
        : (hasUser
          ? `All Users — through the primary user, ${scope.user.name}`
          : "All Users — but this device has no primary user, so it reaches nobody here");
      r.tenantWideNoUser = r.how === "all-users" && !hasUser;
    });

    const idx = indexStates(o.states || { config: [], compliance: [] });
    res.rows.forEach((r) => { r.reported = stateFor(r, idx); });
    res.verdicts = verdicts(res.rows, scope);
    res.stateIndex = { count: idx.count, ambiguous: idx.dupeNames.size };
    return res;
  }

  // --------------------------------------------------------------- totals --
  function totals(res, scope) {
    const t = { rows: res.rows.length, policies: res.verdicts.size, applies: 0, maybe: 0, excluded: 0, conflict: 0, tenantWide: 0, filtered: 0, viaDevice: 0, viaUser: 0, reported: 0, unknown: 0 };
    const devIds = new Set(((scope && scope.deviceGroups) || []).map((g) => lc(g.id)));
    const userIds = new Set(((scope && scope.userGroups) || []).map((g) => lc(g.id)));
    for (const v of res.verdicts.values()) t[v.effect]++;
    for (const r of res.rows) {
      if (r.pid === GroupUse.TENANT_WIDE) t.tenantWide++;
      else if (devIds.has(r.pid)) t.viaDevice++;
      else if (userIds.has(r.pid)) t.viaUser++;
      if (r.filterMode) t.filtered++;
      if (r.reported && r.reported.applicable) {
        if (r.reported.state && r.reported.state !== "unknown") t.reported++; else t.unknown++;
      }
    }
    return t;
  }

  // -------------------------------------------------------------- exports --
  function meta(dev, scope, res, opts) {
    const o = opts || {};
    return {
      device: dev, scope, fresh: freshness(dev, o.now),
      tenantWide: o.tenantWide !== false,
      matchedOn: o.matchedOn || "",
      searchNotes: o.searchNotes || [],
      states: o.states || null,
      when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
    };
  }

  const utc = (s) => String(s || "").replace("T", " ").replace(/\..*/, " UTC");

  // Everything this report is NOT certain about, in one place, so the screen
  // and all three exports say the same things in the same order.
  function caveats(m, res) {
    const L = [];
    L.push(landedNote(m.fresh));
    if (m.scope.blind) {
      L.push("NEITHER membership graph could be read, so this report holds only tenant-wide assignments. It is not a list of what this device receives.");
    } else {
      if (m.scope.deviceGroupsError) L.push(`The device's own group memberships could not be read (${m.scope.deviceGroupsError}), so a policy assigned to a device group is NOT in this report. The answer is narrower than it looks.`);
      if (m.scope.userGroupsError) L.push(`The primary user's group memberships could not be read (${m.scope.userGroupsError}), so a policy reaching this device through the person using it is NOT in this report.`);
    }
    if (!m.scope.user) L.push("This device has no primary user, so nothing user-targeted reaches it — including All Users assignments.");
    const filtered = res.rows.filter((r) => r.filterMode).length;
    if (filtered) L.push(`${filtered} assignment${filtered === 1 ? " carries" : "s carry"} a device filter. Whether a filter includes THIS device is evaluated by the service against inventory a browser cannot see, and Graph has no call that answers it — those rows say MAY REACH, and that is as far as this tool can honestly go.`);
    if (m.states) {
      if (m.states.configError) L.push(`What the device reported about configuration profiles could not be read (${m.states.configError}) — every configuration row's actual state is unknown, not compliant.`);
      if (m.states.complianceError) L.push(`What the device reported about compliance policies could not be read (${m.states.complianceError}) — those rows' actual state is unknown.`);
    }
    if (res.stateIndex && res.stateIndex.ambiguous) L.push(`${res.stateIndex.ambiguous} reported state${res.stateIndex.ambiguous === 1 ? " could" : "s could"} not be matched to a policy with certainty, because more than one policy carries that name. Those are reported as unknown rather than matched to a guess.`);
    return L;
  }

  function markdown(res, m) {
    const d = m.device, t = totals(res, m.scope);
    const L = [];
    L.push(`# Why this device gets what it gets — ${d.deviceName || d.id}`, "");
    L.push(`Generated ${m.when} by TUNO ${m.build}`, "");
    L.push(`| | |`, `|---|---|`);
    L.push(`| Device | ${mdCell(d.deviceName || d.id)} |`);
    L.push(`| Intune device id | \`${d.id}\` |`);
    if (d.azureADDeviceId) L.push(`| Entra device id | \`${d.azureADDeviceId}\` |`);
    if (d.serialNumber) L.push(`| Serial | ${mdCell(d.serialNumber)} |`);
    L.push(`| Hardware | ${mdCell([d.manufacturer, d.model].filter(Boolean).join(" ") || "unknown")} |`);
    L.push(`| Platform | ${mdCell([d.operatingSystem, d.osVersion].filter(Boolean).join(" ") || "unknown")} |`);
    L.push(`| Ownership | ${mdCell(d.managedDeviceOwnerType || "unknown")} |`);
    L.push(`| Compliance | ${mdCell(d.complianceState || "unknown")} |`);
    L.push(`| Enrolled | ${mdCell(d.enrolledDateTime ? utc(d.enrolledDateTime) : "unknown")} |`);
    L.push(`| **Last check-in** | **${mdCell(m.fresh.label)}**${m.fresh.known ? ` (${mdCell(utc(m.fresh.when))})` : ""} |`);
    L.push(`| Primary user | ${m.scope.user ? mdCell(m.scope.user.name) : "none"} |`);
    L.push(`| Device groups | ${m.scope.deviceGroupsError ? "unknown" : m.scope.deviceGroups.length} |`);
    L.push(`| The user's groups | ${m.scope.userGroupsError ? "unknown" : m.scope.userGroups.length} |`);
    L.push(`| Policies reaching it | ${t.applies} (plus ${t.maybe} filtered, ${t.excluded} excluded, ${t.conflict} conflicting) |`);
    L.push("");
    caveats(m, res).forEach((c) => L.push(`> ${mdCell(c)}`, ""));

    for (const g of GroupUse.grouped(res.rows)) {
      L.push(`## ${g.source.icon} ${g.source.label} (${g.rows.length})`, "");
      L.push(`| Name | Kind | Effect | Why it reaches this device | Reported by the device |`, `|---|---|---|---|---|`);
      for (const r of g.rows) {
        const st = !(r.reported && r.reported.applicable)
          ? "not reported for this surface"
          : (r.reported.state === "unknown"
            ? `unknown (${mdCell(r.reported.matchedBy === "none" ? "the device has not reported this policy" : r.reported.matchedBy)})`
            : stateLabel(r.reported.state));
        L.push(`| ${mdCell(r.name)} | ${mdCell(r.sub || "")} | ${EFFECT_LABEL[r.effect] || r.effect}${r.filterMode ? ` (filter: ${mdCell(r.filterName || r.filterMode)})` : ""} | ${mdCell(r.viaLabel)} | ${st} |`);
      }
      L.push("");
    }
    if (!res.rows.length) L.push("_Nothing in Intune reaches this device across the surfaces that were read._", "");

    if (res.failed.length) {
      L.push(`## Could not be read`, "");
      L.push(`**These are not empty — they are unknown**, and something reaching this device may exist in any of them.`, "");
      res.failed.forEach((f) => L.push(`- **${mdCell(f.label)}** — ${mdCell(f.error)}${f.why ? ` _${mdCell(f.why)}_` : ""}`));
      L.push("");
    }
    L.push(`---`, ``, `Assignment surfaces shared with TUNO's Group Analyzer (T02), after Ugur Koc's [Get Group Assignments](https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/configuration/get-group-assignments.ps1) (MIT), read here from the device end. Reimplemented in browser-side JavaScript against Microsoft Graph.`);
    return L.join("\n");
  }

  function csv(res, m) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = [["Surface", "Kind", "Policy", "PolicyId", "Effect", "Assignment", "Via", "Filter", "FilterMode", "ReportedState", "StateMatchedBy", "Device", "DeviceId", "LastCheckIn"].join(",")];
    for (const r of res.rows) {
      L.push([
        r.sourceLabel, r.sub || "", r.name, r.id,
        EFFECT_LABEL[r.effect] || r.effect,
        GroupUse.HOW_LABEL[r.how] || r.how,
        r.viaLabel,
        r.filterName || r.filterId || "", r.filterMode || "",
        (r.reported && r.reported.applicable) ? (r.reported.state || "unknown") : "not reported for this surface",
        r.reported ? r.reported.matchedBy : "",
        m.device.deviceName || "", m.device.id, m.fresh.when || "never",
      ].map(q).join(","));
    }
    return L.join("\n");
  }

  // A standalone HTML report: neutral, self-contained, openable by somebody
  // with no access to the tenant — the artefact you attach to the ticket that
  // says "this laptop is not getting the policy".
  const REPORT_CSS = `
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#f4f5fa;color:#1f2330}
header{padding:18px 26px;background:#1f2933;color:#fff}h1{margin:0;font-size:19px}
.meta{color:#c8d1d9;font-size:12px;margin-top:4px}
.sync{display:inline-block;margin-top:8px;padding:4px 12px;border-radius:8px;background:#33404b;color:#fff;font-size:13px}
.sync.stale{background:#7a4034}
.cards{display:flex;gap:12px;padding:14px 26px;background:#fff;border-bottom:1px solid #e6e6ee;flex-wrap:wrap}
.card{background:#f7f8fc;border:1px solid #e6e6ee;border-radius:10px;padding:10px 16px;min-width:120px}
.card .n{font-size:22px;font-weight:700}.card .l{font-size:11px;color:#6b7280;text-transform:uppercase}
.card.zero .n{color:#9aa0ab}.card.warn .n{color:#b04a3a}
main{padding:18px 26px;max-width:1400px}
.note{background:#fff8e6;border:1px solid #f0dca8;border-radius:8px;padding:10px 14px;margin:0 0 10px;font-size:13px}
.note.bad{background:#fdeceb;border-color:#f2c4bf}
section.area{background:#fff;border:1px solid #e6e6ee;border-radius:10px;margin-bottom:16px;overflow:hidden}
section.area>h2{margin:0;padding:12px 18px;font-size:15px;background:#f1f2f8;border-bottom:1px solid #e6e6ee}
section.area>h2 span{font-weight:400;color:#6b7280;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:13px}
thead th{background:#f7f8fc;padding:8px 12px;text-align:left;border-bottom:1px solid #e6e6ee;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
td{padding:8px 12px;border-bottom:1px solid #f4f4f8;vertical-align:top}
tr:last-child td{border-bottom:0}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600}
.pill.applies{background:#e6f4ea;color:#1e7e34}.pill.excluded{background:#fdeceb;color:#b04a3a}
.pill.maybe{background:#fff3d6;color:#8a5a00}.pill.conflict{background:#f0e6fb;color:#5b3a8e}
.via{color:#6b7280;font-size:12px}
.st{font-size:12px}.st.unknown{color:#8a5a00;font-weight:600}
footer{padding:14px 26px;color:#6b7280;font-size:12px}
footer a{color:#2b4c9b}`;

  function html(res, m) {
    const d = m.device, t = totals(res, m.scope);
    const pill = (e) => `<span class="pill ${esc(e)}">${esc(EFFECT_LABEL[e] || e)}</span>`;
    const stCell = (r) => {
      if (!(r.reported && r.reported.applicable)) return `<span class="st via">not reported for this surface</span>`;
      if (r.reported.state === "unknown") return `<span class="st unknown">unknown</span> <span class="via">${esc(r.reported.matchedBy === "none" ? "the device has not reported this policy" : r.reported.matchedBy)}</span>`;
      return `<span class="st">${esc(stateLabel(r.reported.state))}</span>`;
    };
    const notes = caveats(m, res).map((c, i) => `<p class="note${(i === 0 || /could not|NEITHER/.test(c)) ? " bad" : ""}">${esc(c)}</p>`).join("");
    const areas = GroupUse.grouped(res.rows).map((g) => `
      <section class="area"><h2>${esc(g.source.icon)} ${esc(g.source.label)} <span>${g.rows.length}</span></h2>
        <table><thead><tr><th>Policy</th><th style="width:150px">Kind</th><th style="width:170px">Effect</th><th style="width:280px">Why it reaches this device</th><th style="width:200px">Reported by the device</th></tr></thead>
        <tbody>${g.rows.map((r) => `<tr>
          <td><b>${esc(r.name)}</b></td><td>${esc(r.sub || "")}</td>
          <td>${pill(r.effect)}${r.filterMode ? `<div class="via">filter: ${esc(r.filterName || r.filterMode)}</div>` : ""}</td>
          <td class="via">${esc(r.viaLabel)}</td><td>${stCell(r)}</td></tr>`).join("")}</tbody></table>
      </section>`).join("");

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Device policy — ${esc(d.deviceName || d.id)}</title><style>${REPORT_CSS}</style></head><body>
<header><h1>Why this device gets what it gets — ${esc(d.deviceName || d.id)}</h1>
  <div class="meta">${esc(d.id)}${d.serialNumber ? ` · serial ${esc(d.serialNumber)}` : ""} · ${esc([d.operatingSystem, d.osVersion].filter(Boolean).join(" ") || "platform unknown")} · ${esc(d.managedDeviceOwnerType || "ownership unknown")} · compliance ${esc(d.complianceState || "unknown")} · generated ${esc(m.when)} by TUNO ${esc(m.build)}</div>
  <div class="sync${m.fresh.stale ? " stale" : ""}">Last check-in: ${esc(m.fresh.label)}${m.fresh.known ? ` — ${esc(utc(m.fresh.when))}` : ""}</div></header>
<div class="cards">
  <div class="card${t.applies ? "" : " zero"}"><div class="n">${t.applies}</div><div class="l">Reaches it</div></div>
  <div class="card${t.maybe ? " warn" : " zero"}"><div class="n">${t.maybe}</div><div class="l">May reach it</div></div>
  <div class="card${t.excluded ? " warn" : " zero"}"><div class="n">${t.excluded}</div><div class="l">Excluded</div></div>
  <div class="card${t.viaDevice ? "" : " zero"}"><div class="n">${t.viaDevice}</div><div class="l">Via device groups</div></div>
  <div class="card${t.viaUser ? "" : " zero"}"><div class="n">${t.viaUser}</div><div class="l">Via the user</div></div>
  <div class="card${t.tenantWide ? "" : " zero"}"><div class="n">${t.tenantWide}</div><div class="l">Tenant-wide</div></div>
  <div class="card${t.unknown ? " warn" : " zero"}"><div class="n">${t.unknown}</div><div class="l">State unknown</div></div>
</div>
<main>${notes}${areas || '<section class="area"><h2>Nothing found</h2><table><tbody><tr><td>Nothing in Intune reaches this device across the surfaces that were read.</td></tr></tbody></table></section>'}</main>
<footer>Assignment surfaces shared with TUNO's Group Analyzer (T02), after Ugur Koc's <a href="https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/configuration/get-group-assignments.ps1">Get Group Assignments</a> (MIT), read here from the device end. Reimplemented in browser-side JavaScript against Microsoft Graph — no code was copied.</footer>
</body></html>`;
  }

  return {
    scopesFor, findDevice, scanDevices, freshness, landedNote, buildScope,
    readStates, indexStates, stateFor, stateLabel, STATEFUL,
    verdicts, EFFECT_LABEL, analyze, totals, caveats,
    meta, markdown, csv, html, LIST_SELECT, SCAN_PAGES,
  };
})();


// ======================================================================
// T06 — the screen. Kept apart from the engine above so the walk can be
// tested without a DOM, which is most of what the headless suite does.
// ======================================================================
const DeviceWhyTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let device = null, scope = null, states = null, result = null, found = null, running = false;
  // The pick set when a search matched more than one device, and the
  // matched-on/notes it arrived with — kept apart from `found` so picking a
  // card can build a clean single-device `found` without losing the route.
  let picks = null, pickBase = null;

  // ---- opening a policy to see what is actually in it ----
  // The table answers "does this reach the device". The next question is
  // always "and what does it set", which used to mean leaving for the
  // Documenter and finding the policy again by name. The settings are read on
  // demand, one policy at a time, and ONLY through the Documenter's own
  // readers — Docs.catalogRows, Docs.admxRows and Docs.flatten — because
  // those are where redaction lives. A second reader here would be a second
  // place for a script body or a certificate to escape.
  const openRows = new Map();      // key -> { state, rows, error }
  const rowKey = (r) => `${r.source}:${r.id}`;

  // `sub` is the kind already shown in the Kind column, set by the source
  // that read it. It decides which endpoint holds the settings.
  function detailFor(r) {
    const sub = String(r.sub || "").toLowerCase();
    const id = encodeURIComponent(r.id || "");
    if (!id) return null;
    if (sub.includes("settings catalog") && sub.includes("compliance"))
      return { url: `/deviceManagement/compliancePolicies/${id}/settings`, kind: "catalog" };
    if (sub.includes("settings catalog"))
      return { url: `/deviceManagement/configurationPolicies/${id}/settings`, kind: "catalog" };
    if (sub.includes("admx"))
      return { url: `/deviceManagement/groupPolicyConfigurations/${id}/definitionValues?$expand=definition($select=id,classType,displayName,categoryPath),presentationValues`, kind: "admx" };
    if (sub.includes("device configuration"))
      return { url: `/deviceManagement/deviceConfigurations/${id}`, kind: "object" };
    if (sub.includes("compliance policy"))
      return { url: `/deviceManagement/deviceCompliancePolicies/${id}`, kind: "object" };
    return null;
  }

  async function openPolicy(r) {
    const key = rowKey(r);
    const cur = openRows.get(key);
    if (cur && cur.state !== "error") { openRows.delete(key); render(); return; }  // a second click closes it
    const d = detailFor(r);
    if (!d) {
      openRows.set(key, { state: "none" });
      render();
      return;
    }
    openRows.set(key, { state: "loading" });
    render();
    try {
      const got = await Graph.get(d.url, { scopes: Graph.SCOPES.config });
      const rows = d.kind === "catalog" ? Docs.catalogRows(got && got.value ? got.value : got)
        : d.kind === "admx" ? Docs.admxRows(got && got.value ? got.value : got)
          : Docs.flatten(got);
      openRows.set(key, { state: "ok", rows: rows || [] });
    } catch (e) {
      openRows.set(key, { state: "error", error: (e && e.message) || String(e) });
    }
    render();
  }

  function settingsRow(r, cols) {
    const st = openRows.get(rowKey(r));
    if (!st) return "";
    const body =
      st.state === "loading" ? `<span class="mini muted">Reading the settings…</span>`
      : st.state === "none" ? `<span class="mini muted">This kind of object keeps no readable settings list — what reaches the device is the object itself. Open it in the portal.</span>`
      : st.state === "error" ? `<span class="gu-how exc">could not be read</span> <span class="mini muted">${esc(st.error)}</span>`
      : (st.rows.length
        ? `<div class="gu-tw"><table class="cg-table"><tbody>${st.rows.slice(0, 200).map((x) => `<tr>
             <td class="mini" style="width:45%">${esc(x.name)}</td>
             <td class="mini" style="word-break:normal;overflow-wrap:anywhere">${esc(x.value)}</td></tr>`).join("")}
             ${st.rows.length > 200 ? `<tr><td colspan="2" class="mini muted">…and ${st.rows.length - 200} more. The Documenter exports all of them.</td></tr>` : ""}
           </tbody></table></div>`
        : `<span class="mini muted">The policy reports no settings.</span>`);
    return `<tr class="dw-settings"><td colspan="${cols}">
      <div class="dw-settings-in"><b class="mini">${esc(r.name)}</b>
        <span class="mini muted"> — secrets are redacted, exactly as in the Documenter.</span>
        <div style="margin-top:6px">${body}</div></div></td></tr>`;
  }

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const chosen = () => [...document.querySelectorAll("#dvAreas input[type=checkbox]")].filter((c) => c.checked).map((c) => c.value);
  // Ticked by default, and the screen says why — All Devices reaches this
  // machine whatever else is true, so hiding those rows would hide policy.
  const tenantWide = () => !($("dvTenantWide") && $("dvTenantWide").checked === false);

  function renderAreas() {
    const box = $("dvAreas");
    if (!box) return;
    // The same nine surfaces T02 offers, from the same table. One list, and
    // one place to add the tenth.
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

  function prog(msg, n, of) { TunoProgress.show("dvBody", "dvProg", msg, n, of); }   // ENCA-style centred card (10397)

  function showExports(on) {
    ["dvMd", "dvHtml", "dvCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; });
  }

  function fail(e) {
    const err = (typeof e === "string") ? null : e;
    const msg = err ? GroupUse.shortErr(err, 400) : String(e);
    let extra = "";
    if (err && err.kind === "admin") {
      extra = `<p class="mini" style="margin:8px 0 0">This needs an administrator to consent once for the whole tenant. ${err.consentUrl ? `<a href="${esc(err.consentUrl)}" target="_blank" rel="noopener">Open the admin-consent page →</a>` : ""}</p>`;
    } else if (err && err.kind === "consent") {
      extra = `<p class="mini" style="margin:8px 0 0">Nothing was read. Run it again and accept the permission prompt${err.consentUrl ? `, or have an administrator <a href="${esc(err.consentUrl)}" target="_blank" rel="noopener">consent for the tenant</a>` : ""}.</p>`;
    }
    $("dvBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(msg)}</b></div>${extra}</div>`;
    showExports(false);
    prog("");
  }

  // ---- more than one device matched: the pick, Option A of the mockup ----
  // The search can legitimately answer with several machines — a primary
  // user with a laptop and a phone is the everyday case — so the matches
  // render as the same clickable cards T19 taught the eye, and a click runs
  // the analysis on that device. The check-in is ON the card, because
  // "which of these is the live one" is usually the whole question.
  const PICK_MAX = 24;

  function pickCard(d, i) {
    const os = String(d.operatingSystem || "");
    const ic = /ios|ipad|android/i.test(os) ? "📱" : "💻";
    const comp = String(d.complianceState || "").toLowerCase();
    const chip = `<span class="state ${comp === "compliant" ? "on" : "report"}">${esc(d.complianceState || "unknown")}</span>`;
    return `<div class="scard dw-pick" data-i="${i}" role="button" tabindex="0">
      <div class="scard-top"><div class="scard-ic">${ic}</div>
        <div class="scard-title"><h3>${esc(d.deviceName || d.id)}</h3>
          <div class="mini">${esc([os, d.osVersion].filter(Boolean).join(" ") || "platform unknown")} · ${d.serialNumber ? esc(d.serialNumber) : "no serial reported"} · ${esc(d.managedDeviceOwnerType || "ownership unknown")}</div></div>
        <div class="scard-right">${chip}</div></div>
      <div class="scard-grid">
        <div><label>Primary user</label><b>${esc(d.userDisplayName || d.userPrincipalName || "none")}</b></div>
        <div><label>Last check-in</label><b>${esc(DeviceWhy.freshness(d).label)}</b></div>
        <div><label>Model</label><b>${esc([d.manufacturer, d.model].filter(Boolean).join(" ") || "unknown")}</b></div>
        <div><label>Enrolled</label><b>${esc((d.enrolledDateTime || "").slice(0, 10) || "unknown")}</b></div>
      </div>
      <div class="scard-foot">Intune device id: <code>${esc(d.id)}</code> — click to analyze</div>
    </div>`;
  }

  function renderPicker(term) {
    const shown = picks.slice(0, PICK_MAX);
    $("dvBody").innerHTML = `<div class="list-card" style="padding:14px 18px">
      <p class="mini" style="margin:0">“${esc(term)}” matched <b>${picks.length} devices</b> by ${esc(pickBase.matchedOn)} — pick the one to analyze.${picks.length > PICK_MAX ? ` Showing the first ${PICK_MAX}; narrow the search to reach the rest.` : ""}</p>
      ${(pickBase.notes || []).map((n) => `<p class="mini muted" style="margin:6px 0 0">${esc(n)}</p>`).join("")}
    </div>
    <div class="cards" style="margin-top:14px">${shown.map(pickCard).join("")}</div>`;
  }

  function pickDevice(d) {
    found = {
      device: d, matchedOn: pickBase.matchedOn,
      notes: [...(pickBase.notes || []), `Picked from ${picks.length} matching devices.`],
    };
    analyzeDevice(d);
  }

  async function analyzeDevice(dev) {
    if (running) return;
    const areas = chosen();
    if (!areas.length) { fail("Pick at least one place to look."); return; }
    running = true;
    $("dvRun").disabled = true;
    showExports(false);
    try {
      // Idempotent when run() already asked; load-bearing when the pick sat
      // while the surface boxes changed underneath it.
      await Graph.ensureScopes(DeviceWhy.scopesFor(areas));
      device = dev;
      scope = await DeviceWhy.buildScope(device, prog);
      states = await DeviceWhy.readStates(device, prog);
      result = await DeviceWhy.analyze({
        device, scope, states,
        sourceIds: areas, tenantWide: tenantWide(),
        onStatus: prog,
      });
      prog("");
      render();
      showExports(true);
    } catch (e) {
      fail(e);
    } finally {
      running = false;
      $("dvRun").disabled = false;
    }
  }

  async function run() {
    if (running) return;
    const term = (($("dvTerm") && $("dvTerm").value) || "").trim();
    if (!term) { fail("Enter a device name, serial number, primary user or object ID."); return; }
    const areas = chosen();
    if (!areas.length) { fail("Pick at least one place to look."); return; }

    running = true;
    $("dvRun").disabled = true;
    showExports(false);
    $("dvBody").innerHTML = "";
    picks = null; pickBase = null;
    try {
      const want = DeviceWhy.scopesFor(areas);
      prog(`Checking permissions — ${want.length} scope${want.length === 1 ? "" : "s"}…`);
      await Graph.ensureScopes(want);

      found = await DeviceWhy.findDevice(term, prog);
      if (found.devices) {
        picks = found.devices;
        pickBase = { matchedOn: found.matchedOn, notes: found.notes || [] };
        prog("");
        renderPicker(term);
        return;
      }
      device = found.device;
      scope = await DeviceWhy.buildScope(device, prog);
      states = await DeviceWhy.readStates(device, prog);
      result = await DeviceWhy.analyze({
        device, scope, states,
        sourceIds: areas, tenantWide: tenantWide(),
        onStatus: prog,
      });
      prog("");
      render();
      showExports(true);
    } catch (e) {
      // A GraphError already carries the tenant's own words and its kind;
      // fail() turns that into the right next step rather than a shrug.
      fail(e);
    } finally {
      running = false;
      $("dvRun").disabled = false;
    }
  }

  const safeName = (s) => String(s || "device").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  const meta = () => DeviceWhy.meta(device, scope, result, {
    tenantWide: tenantWide(), states,
    matchedOn: found ? found.matchedOn : "",
    searchNotes: found ? found.notes : [],
  });

  function render() {
    const d = device;
    const m = meta();
    const t = DeviceWhy.totals(result, scope);
    const utc = (s) => String(s || "").replace("T", " ").replace(/\..*/, " UTC");
    const stat = (n, label, cls) => `<span class="gu-stat ${n ? (cls || "") : "zero"}"><b>${n}</b> ${esc(label)}</span>`;

    const head = `<div class="gu-sticky">
      <span class="gu-who">${esc(d.deviceName || d.id)}
        <span class="mini muted">${esc([d.operatingSystem, d.osVersion].filter(Boolean).join(" ") || "platform unknown")}${d.serialNumber ? ` · ${esc(d.serialNumber)}` : ""} · ${esc(d.managedDeviceOwnerType || "ownership unknown")} · compliance ${esc(d.complianceState || "unknown")}${scope.user ? ` · ${esc(scope.user.name)}` : " · no primary user"}</span></span>
      <div class="gu-sum">
        ${stat(t.applies, "reaches it")}
        ${stat(t.maybe, "may reach it")}
        ${stat(t.excluded, "excluded")}
        ${stat(t.viaDevice, "via device groups")}
        ${stat(t.viaUser, "via the user")}
        ${stat(t.tenantWide, "tenant-wide")}
        ${stat(t.unknown, "state unknown")}
        ${result.failed.length ? `<span class="gu-stat" style="border-color:var(--off)"><b>${result.failed.length}</b> could not be read</span>` : ""}
      </div></div>`;

    // The check-in is the first thing on the page rather than a field in a
    // table, because everything under it is conditional on it.
    const sync = `<div class="gu-fail${m.fresh.stale ? "" : " gu-skip"}" style="margin-bottom:10px">
      <b>Last check-in: ${esc(m.fresh.label)}</b>${m.fresh.known ? ` <span class="mini muted">${esc(utc(m.fresh.when))}</span>` : ""}
      <span class="why">${esc(DeviceWhy.landedNote(m.fresh))}</span></div>`;

    // caveats()[0] is the check-in sentence, already shown above it.
    const notes = DeviceWhy.caveats(m, result).slice(1)
      .map((c) => `<p class="mini muted">${esc(c)}</p>`).join("");

    const groupList = (gs, err) => gs.length
      ? gs.map((g) => `<span class="gu-stat zero">${esc(g.name)}</span>`).join(" ")
      : (err ? `<span class="gu-how exc">unknown</span> <span class="mini muted">${esc(err)}</span>` : "none");

    const idTable = `<div class="gu-tw"><table class="cg-table"><tbody>
      <tr><td class="mini muted">Intune device id</td><td class="mini"><code>${esc(d.id)}</code></td>
          <td class="mini muted">Entra device id</td><td class="mini">${d.azureADDeviceId ? `<code>${esc(d.azureADDeviceId)}</code>` : '<span class="muted">none — this device has no directory object</span>'}</td></tr>
      <tr><td class="mini muted">Enrolled</td><td class="mini">${esc(d.enrolledDateTime ? utc(d.enrolledDateTime) : "unknown")}</td>
          <td class="mini muted">Hardware</td><td class="mini">${esc([d.manufacturer, d.model].filter(Boolean).join(" ") || "unknown")}</td></tr>
      <tr><td class="mini muted">Device groups</td><td class="mini">${groupList(scope.deviceGroups, scope.deviceGroupsError)}</td>
          <td class="mini muted">The user's groups</td><td class="mini">${groupList(scope.userGroups, scope.userGroupsError)}</td></tr>
      </tbody></table></div>`;

    const stCell = (r) => {
      if (!(r.reported && r.reported.applicable)) return `<span class="mini muted">not reported for this surface</span>`;
      if (r.reported.state === "unknown") return `<span class="gu-how exc">unknown</span> <span class="mini muted">${esc(r.reported.matchedBy === "none" ? "the device has not reported this policy" : r.reported.matchedBy)}</span>`;
      return `<span class="gu-how ${/^(compliant|remediated|notapplicable)$/.test(r.reported.state) ? "inc" : "exc"}">${esc(DeviceWhy.stateLabel(r.reported.state))}</span>`;
    };
    const effClass = { applies: "inc", maybe: "priv", excluded: "exc", conflict: "priv" };

    const sources = GroupUse.grouped(result.rows).map((grp) => `
      <div class="gu-src">
        <h5>${esc(grp.source.icon)} ${esc(grp.source.label)} <span class="mini muted">${grp.rows.length}</span>
          <a href="${esc(grp.source.doc)}" target="_blank" rel="noopener">docs ↗</a></h5>
        <div class="gu-tw"><table class="cg-table"><thead><tr>
          <th>Policy</th><th style="width:150px">Kind</th><th style="width:150px">Effect</th>
          <th style="width:250px">Why it reaches this device</th><th style="width:190px">Reported by the device</th></tr></thead>
          <tbody>${grp.rows.map((r, ri) => {
            const open = openRows.has(rowKey(r));
            return `<tr>
            <td><button class="dw-open${open ? " on" : ""}" data-src="${esc(grp.source.id)}" data-ri="${ri}"
                  title="Show what this policy actually sets">${esc(r.name)}</button></td>
            <td class="mini">${esc(r.sub || "")}</td>
            <td><span class="gu-how ${effClass[r.effect] || "inc"}">${esc(DeviceWhy.EFFECT_LABEL[r.effect] || r.effect)}</span>${r.filterMode ? `<div class="mini muted">filter: ${esc(r.filterName || r.filterMode)}</div>` : ""}</td>
            <td class="gu-via${r.pid === GroupUse.TENANT_WIDE ? " parent" : ""}">${esc(r.viaLabel)}</td>
            <td>${stCell(r)}</td>
          </tr>` + settingsRow(r, 5);
          }).join("")}</tbody></table></div>
      </div>`).join("");

    const failed = result.failed.length ? `<div class="list-card">
      <h4 style="margin:0 0 4px">Could not be read</h4>
      <p class="mini muted" style="margin:0 0 10px"><b>These are not empty — they are unknown.</b> Something reaching this device may exist in any of them, and this report cannot tell you.</p>
      ${result.failed.map((f) => `<div class="gu-fail"><b>${esc(f.label)}</b> — ${esc(f.error)}${f.why ? `<span class="why">${esc(f.why)}</span>` : ""}</div>`).join("")}
    </div>` : "";

    const search = `<p class="mini muted">Matched on ${esc(found ? found.matchedOn : "")}.${(found && found.notes && found.notes.length) ? " " + found.notes.map(esc).join(" ") : ""}</p>`;

    const body = result.rows.length
      ? `<div class="list-card">${sync}${search}${idTable}${notes}${sources}</div>`
      : `<div class="list-card">${sync}${search}${idTable}${notes}<p class="mini"><b>Nothing in Intune reaches this device</b> across the ${result.ran.length} surface${result.ran.length === 1 ? "" : "s"} that were read.</p></div>`;

    $("dvBody").innerHTML = head + body + failed;
  }

  function exportAs(fmt) {
    const n = safeName(device.deviceName || device.id);
    if (fmt === "md") return download(`Intune-device-${n}.md`, DeviceWhy.markdown(result, meta()), "text/markdown");
    if (fmt === "csv") return download(`Intune-device-${n}.csv`, DeviceWhy.csv(result, meta()), "text/csv");
    return download(`Intune-device-${n}.html`, DeviceWhy.html(result, meta()), "text/html");
  }

  function reset() {
    device = scope = states = result = found = null;
    picks = pickBase = null;
    if ($("dvTerm")) $("dvTerm").value = "";
    $("dvBody").innerHTML = "";
    prog("");
    showExports(false);
    if ($("dvTenantWide")) $("dvTenantWide").checked = true;
    document.querySelectorAll("#dvAreas input[type=checkbox]").forEach((c) => {
      c.checked = true; c.closest(".gu-area").classList.add("on");
    });
  }

  function init() {
    if (!$("dvAreas")) return;
    renderAreas();
    // Delegated: every row is rebuilt on each render, so the handler lives on
    // the body. The row is found through the same grouping the table was
    // drawn from, so the click and the markup cannot drift apart.
    $("dvBody").addEventListener("click", (e) => {
      const p = e.target.closest && e.target.closest(".dw-pick");
      if (p && picks) { const d = picks[+p.dataset.i]; if (d) pickDevice(d); return; }
      const b = e.target.closest && e.target.closest(".dw-open");
      if (!b || !result) return;
      const grp = GroupUse.grouped(result.rows).find((g) => g.source.id === b.dataset.src);
      const r = grp && grp.rows[+b.dataset.ri];
      if (r) openPolicy(r);
    });
    // The cards are role=button; Enter and Space must do what a click does.
    $("dvBody").addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const p = e.target.closest && e.target.closest(".dw-pick");
      if (p && picks) { e.preventDefault(); const d = picks[+p.dataset.i]; if (d) pickDevice(d); }
    });
    $("dvRun").addEventListener("click", run);
    $("dvReset").addEventListener("click", reset);
    $("dvTerm").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    $("dvMd").addEventListener("click", () => exportAs("md"));
    $("dvCsv").addEventListener("click", () => exportAs("csv"));
    $("dvHtml").addEventListener("click", () => exportAs("html"));
  }

  return { init, run, reset, render, renderAreas, chosen, tenantWide, exportAs, analyzeDevice };
})();

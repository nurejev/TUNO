// ======================================================================
// T28 — ⊘ Exclusions (build 10639). DOM-free.
//
// Mihai: "a new exclusion button. It should be easy to search a user or
// device, get both info, and get offered to be added to the 2 exclusion
// groups." Layout A off the mockup (a rail pane, opened by a header
// button); "keep it on the old set"; the user and every device that
// synced in the last 30 days ticked by default.
//
// One read (readBase): the two exclusion groups' direct members and every
// Windows device in Intune with its primary user and Entra device id.
// search() asks Graph for users and Entra devices ($search, ConsistencyLevel
// eventual — Learn: "Use the $search query parameter") and also matches the
// Intune device list here, so "0412" finds LT-NL-0412 whatever Entra's
// tokenizer makes of the name. lookup() reads the user's and each device's
// groups: transitive for what reaches them, direct for the country device
// group a device sits in.
//
// What reaches an object (reachOf) is judged against T28's own model: a
// policy reaches it when one of its groups is included (or the policy
// targets All devices / All users of the object's kind) and none of its
// groups is excluded — an exclusion wins over an include of the same kind
// (Learn: "Include and exclude app assignments"). Assignment filters are
// not evaluated; a filtered include is said.
//
// Keep it on the old set: ⚔️ action ③ takes the waves OUT of the old
// policies, so a wave device that also goes into the exclusion group gets
// neither set. Excluding a device therefore also takes it out of its
// country device group (INT-SG-D-<ISO3>): it leaves the wave, and the old
// device policies reach it again. The 👥 sync keeps it out (MdeMembers,
// held). A USER cannot be taken out — the country user groups are dynamic
// — so the card says what that leaves.
// ======================================================================
const MdeExclude = (() => {
  "use strict";
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const enc = encodeURIComponent;
  const EV = { ConsistencyLevel: "eventual" };
  const DAY = 86400000;
  const msg = (e) => String((e && e.message) || e || "");
  const GS = () => Graph.SCOPES.groups, DS = () => Graph.SCOPES.devices, DO = () => Graph.SCOPES.deviceObjects, US = () => Graph.SCOPES.directory;
  const scopes = () => [...new Set([...GS(), ...DS(), ...DO(), ...US()])];

  // ------------------------------------------------------------- read --
  // groups: { user: { id, displayName } | null, device: … | null }
  async function readBase(groups, onStatus) {
    const say = (m) => { if (onStatus) onStatus(m); };
    say("Reading the Windows devices in Intune…");
    const managed = await Graph.readAll(`/deviceManagement/managedDevices?$filter=${enc("operatingSystem eq 'Windows'")}&$select=id,deviceName,userId,userPrincipalName,azureADDeviceId,lastSyncDateTime,osVersion`, { scopes: DS(), retry: true });
    let users = [], devices = [];
    if (groups && groups.user) {
      say(`Reading ${groups.user.displayName}…`);
      users = await Graph.readAll(`/groups/${enc(groups.user.id)}/members/microsoft.graph.user?$select=id,displayName,userPrincipalName&$top=999`, { scopes: GS(), retry: true });
    }
    if (groups && groups.device) {
      say(`Reading ${groups.device.displayName}…`);
      devices = await Graph.readAll(`/groups/${enc(groups.device.id)}/members/microsoft.graph.device?$select=id,deviceId,displayName&$top=999`, { scopes: GS(), retry: true });
    }
    say("");
    return { managed: managed || [], users: users || [], devices: devices || [], groups: groups || {}, readAt: Date.now() };
  }

  function index(base) {
    const byUser = new Map(), byAad = new Map(), byManaged = new Map();
    for (const m of base.managed || []) {
      if (m.userId) { const k = lc(m.userId); if (!byUser.has(k)) byUser.set(k, []); byUser.get(k).push(m); }
      if (m.azureADDeviceId) byAad.set(lc(m.azureADDeviceId), m);
      byManaged.set(lc(m.id), m);
    }
    const exUsers = new Map((base.users || []).map((u) => [lc(u.id), u]));
    const exDevices = new Map((base.devices || []).map((d) => [lc(d.id), d]));
    const exDeviceIds = new Map((base.devices || []).filter((d) => d.deviceId).map((d) => [lc(d.deviceId), d]));
    return { byUser, byAad, byManaged, exUsers, exDevices, exDeviceIds };
  }
  const isStale = (iso, now, days) => { const t = Date.parse(iso || ""); return !Number.isFinite(t) || now - t > days * DAY; };
  // one Intune device, as the card and the list show it
  function deviceRow(m, ix, now, days) {
    const did = lc(m.azureADDeviceId || "");
    const ex = did ? ix.exDeviceIds.get(did) : null;
    return { key: `m:${lc(m.id)}`, managedId: lc(m.id), name: m.deviceName || m.id, deviceId: did, objId: ex ? lc(ex.id) : null,
      upn: m.userPrincipalName || "", userId: lc(m.userId || ""), lastSync: m.lastSyncDateTime || null,
      stale: isStale(m.lastSyncDateTime, now, days), os: m.osVersion || "", excluded: !!ex, managed: true,
      problem: did ? null : "not joined to Entra (no device id) — it cannot be a group member" };
  }

  // ------------------------------------------------------- excluded now --
  // A row per excluded user (with their Windows devices), then the excluded
  // devices whose primary user is not excluded, grouped per user. HALF: the
  // user is out, a device of theirs that synced lately is not — the - D -
  // policies still reach it.
  const RANK = { half: 0, device: 1, both: 2, user: 2 };
  function excludedNow(base, opt) {
    const o = opt || {};
    const now = o.now || Date.now(), days = o.staleDays || 30;
    const ix = index(base);
    const rows = [], covered = new Set();
    for (const u of base.users || []) {
      const devs = (ix.byUser.get(lc(u.id)) || []).map((m) => deviceRow(m, ix, now, days));
      devs.forEach((d) => { if (d.deviceId) covered.add(d.deviceId); });
      const missing = devs.filter((d) => !d.excluded && !d.stale);
      rows.push({ key: `u:${lc(u.id)}`, user: { id: lc(u.id), displayName: u.displayName || u.userPrincipalName || u.id, upn: u.userPrincipalName || "", excluded: true },
        devices: devs, missing, state: !devs.length ? "user" : missing.length ? "half" : "both" });
    }
    const byOwner = new Map();
    for (const d of base.devices || []) {
      const did = lc(d.deviceId || "");
      if (did && covered.has(did)) continue;
      const m = did ? ix.byAad.get(did) : null;
      const owner = m && m.userId ? lc(m.userId) : "";
      const k = owner ? `o:${owner}` : `d:${lc(d.id)}`;
      if (!byOwner.has(k)) byOwner.set(k, { key: k, user: owner ? { id: owner, displayName: (m && m.userPrincipalName) || owner, upn: (m && m.userPrincipalName) || "", excluded: false } : null, devices: [], missing: [], state: "device" });
      const row = m ? deviceRow(m, ix, now, days) : { key: `e:${lc(d.id)}`, managedId: "", name: d.displayName || d.id, deviceId: did, objId: lc(d.id), upn: "", userId: "", lastSync: null, stale: false, os: "", excluded: true, managed: false, problem: null };
      row.objId = lc(d.id);
      byOwner.get(k).devices.push(row);
    }
    rows.push(...byOwner.values());
    const name = (r) => lc(r.user ? r.user.displayName : (r.devices[0] && r.devices[0].name) || "");
    rows.sort((a, b) => RANK[a.state] - RANK[b.state] || name(a).localeCompare(name(b)));
    return { rows, users: (base.users || []).length, devices: (base.devices || []).length, half: rows.filter((r) => r.state === "half").length };
  }

  // ----------------------------------------------------------- search --
  function matchLocal(base, term, limit) {
    const t = lc(term).trim();
    if (t.length < 2) return [];
    return (base.managed || []).filter((m) => lc(m.deviceName).includes(t) || lc(m.userPrincipalName).includes(t)).slice(0, limit || 25);
  }
  async function search(q, base, opt) {
    const term = String(q == null ? "" : q).trim();
    if (term.length < 2) return { results: [], failed: [], term, note: "Type at least two characters." };
    const o = opt || {};
    const now = o.now || Date.now(), days = o.staleDays || 30;
    // Learn: a clause is "<property>:<text>", the whole clause in double
    // quotes; a double quote or backslash inside is escaped with a backslash
    const safe = term.replace(/["\\]/g, "\\$&");
    const clause = (p) => `"${p}:${safe}"`;
    const failed = [];
    const [ur, dr] = await Promise.all([
      Graph.get(`/users?$search=${enc(`${clause("displayName")} OR ${clause("userPrincipalName")} OR ${clause("mail")}`)}&$select=id,displayName,userPrincipalName,mail,accountEnabled&$top=15&$count=true`, { scopes: US(), headers: EV, retry: true })
        .catch((e) => { failed.push(`users: ${msg(e).slice(0, 160)}`); return null; }),
      Graph.get(`/devices?$search=${enc(clause("displayName"))}&$select=id,deviceId,displayName,operatingSystem,operatingSystemVersion,approximateLastSignInDateTime,accountEnabled&$top=15&$count=true`, { scopes: DO(), headers: EV, retry: true })
        .catch((e) => { failed.push(`devices: ${msg(e).slice(0, 160)}`); return null; }),
    ]);
    const ix = index(base);
    const users = new Map();
    for (const u of (ur && ur.value) || []) {
      const id = lc(u.id);
      users.set(id, { type: "user", key: `u:${id}`, id, displayName: u.displayName || u.userPrincipalName || u.id, upn: u.userPrincipalName || "", mail: u.mail || "",
        devices: (ix.byUser.get(id) || []).length, excluded: ix.exUsers.has(id) });
    }
    const devices = new Map();
    for (const d of (dr && dr.value) || []) {
      const did = lc(d.deviceId || ""), m = did ? ix.byAad.get(did) : null;
      devices.set(did || `e:${lc(d.id)}`, { type: "device", key: m ? `m:${lc(m.id)}` : `e:${lc(d.id)}`, objId: lc(d.id), deviceId: did, managedId: m ? lc(m.id) : "", name: d.displayName || d.id,
        os: [d.operatingSystem, d.operatingSystemVersion].filter(Boolean).join(" "), primary: m ? m.userPrincipalName || "" : "", managed: !!m,
        lastSync: m ? m.lastSyncDateTime : d.approximateLastSignInDateTime || null, stale: m ? isStale(m.lastSyncDateTime, now, days) : false, excluded: ix.exDevices.has(lc(d.id)) });
    }
    for (const m of matchLocal(base, term, 25)) {
      const did = lc(m.azureADDeviceId || "");
      if (lc(m.deviceName).includes(lc(term)) && !devices.has(did || `m:${lc(m.id)}`)) {
        const ex = did ? ix.exDeviceIds.get(did) : null;
        devices.set(did || `m:${lc(m.id)}`, { type: "device", key: `m:${lc(m.id)}`, objId: ex ? lc(ex.id) : "", deviceId: did, managedId: lc(m.id), name: m.deviceName || m.id, os: `Windows ${m.osVersion || ""}`.trim(),
          primary: m.userPrincipalName || "", managed: true, lastSync: m.lastSyncDateTime || null, stale: isStale(m.lastSyncDateTime, now, days), excluded: !!ex });
      }
      // a device's primary user, found by the UPN, when Graph's search missed them
      const uid = lc(m.userId || "");
      if (uid && lc(m.userPrincipalName).includes(lc(term)) && !users.has(uid)) {
        users.set(uid, { type: "user", key: `u:${uid}`, id: uid, displayName: m.userPrincipalName, upn: m.userPrincipalName, mail: "", devices: (ix.byUser.get(uid) || []).length, excluded: ix.exUsers.has(uid) });
      }
    }
    return { results: [...users.values()].concat([...devices.values()]).slice(0, 30), failed, term };
  }

  // ----------------------------------------------------------- lookup --
  const groupsOf = (path, sc) => Graph.readAll(`${path}/microsoft.graph.group?$select=id,displayName&$count=true&$top=999`, { scopes: sc, headers: EV, retry: true });
  // pick: a search result, or { type: "user", id } from the list
  async function lookup(pick, base, opt) {
    const o = opt || {};
    const now = o.now || Date.now(), days = o.staleDays || 30;
    const ix = index(base);
    const failed = [];
    let user = null, list = [], extra = null;
    const readUser = async (id, fallback) => {
      try {
        const u = await Graph.get(`/users/${enc(id)}?$select=id,displayName,userPrincipalName,mail,accountEnabled`, { scopes: US(), retry: true });
        return { id: lc(u.id), displayName: u.displayName || u.userPrincipalName || u.id, upn: u.userPrincipalName || "", mail: u.mail || "", accountEnabled: u.accountEnabled !== false };
      } catch (e) { failed.push(`the user: ${msg(e).slice(0, 160)}`); return { id: lc(id), displayName: fallback || id, upn: fallback || "", mail: "", unread: true }; }
    };
    if (pick.type === "user") {
      user = pick.displayName && pick.upn !== undefined ? { id: lc(pick.id), displayName: pick.displayName, upn: pick.upn || "", mail: pick.mail || "" } : await readUser(pick.id, pick.upn);
      list = ix.byUser.get(lc(pick.id)) || [];
    } else {
      const m = (pick.managedId && ix.byManaged.get(lc(pick.managedId))) || (pick.deviceId && ix.byAad.get(lc(pick.deviceId))) || null;
      if (m && m.userId) { user = await readUser(m.userId, m.userPrincipalName); list = ix.byUser.get(lc(m.userId)) || [m]; }
      else if (m) list = [m];
      else extra = pick;   // an Entra device Intune does not manage
    }
    if (user) user.excluded = ix.exUsers.has(user.id);
    const devices = list.map((m) => deviceRow(m, ix, now, days));
    if (extra) devices.push({ key: `e:${lc(extra.objId)}`, managedId: "", name: extra.name, deviceId: lc(extra.deviceId || ""), objId: lc(extra.objId), upn: "", userId: "",
      lastSync: extra.lastSync || null, stale: false, os: extra.os || "", excluded: ix.exDevices.has(lc(extra.objId)), managed: false, problem: null });
    const picked = pick.type === "device" ? (devices.find((d) => (pick.managedId && d.managedId === lc(pick.managedId)) || (pick.deviceId && d.deviceId === lc(pick.deviceId))) || null) : null;
    if (picked) picked.searched = true;
    // the Entra object of each device (a group member is the object, not the device id)
    const need = devices.filter((d) => !d.objId && d.deviceId);
    const r = await Graph.pool(need, (d) => Graph.get(`/devices(deviceId='${enc(d.deviceId)}')?$select=id,deviceId,displayName,accountEnabled`, { scopes: DO(), retry: true }), 4);
    r.forEach((x, i) => {
      const d = need[i];
      if (x.error) d.problem = (x.error.kind === "notfound" || x.error.status === 404) ? "no Entra device object — it cannot be a group member" : `the Entra device could not be read: ${msg(x.error).slice(0, 120)}`;
      else if (x.value && x.value.id) { d.objId = lc(x.value.id); if (x.value.accountEnabled === false) d.disabled = true; }
    });
    // their groups
    const toSet = (arr) => new Set((arr || []).map((g) => lc(g.id)));
    const names = new Map();
    const keep = (arr) => { (arr || []).forEach((g) => names.set(lc(g.id), g.displayName || g.id)); return arr; };
    if (user && !user.unread) {
      try { user.groups = toSet(keep(await groupsOf(`/users/${enc(user.id)}/transitiveMemberOf`, US()))); }
      catch (e) { failed.push(`${user.displayName}'s groups: ${msg(e).slice(0, 160)}`); }
    }
    const withObj = devices.filter((d) => d.objId);
    const gr = await Graph.pool(withObj, async (d) => ({
      all: await groupsOf(`/devices/${enc(d.objId)}/transitiveMemberOf`, DO()),
      direct: await groupsOf(`/devices/${enc(d.objId)}/memberOf`, DO()),
    }), 4);
    gr.forEach((x, i) => {
      const d = withObj[i];
      if (x.error) { failed.push(`${d.name}'s groups: ${msg(x.error).slice(0, 160)}`); return; }
      d.groups = toSet(keep(x.value.all));
      d.direct = (x.value.direct || []).map((g) => ({ id: lc(g.id), name: g.displayName || g.id }));
    });
    return { pick, user, devices, names, failed, readAt: Date.now() };
  }

  // Default ticks (Mihai: "user + recent devices"): picking a user ticks the
  // user and every device that synced in the last `staleDays`; picking a
  // device ticks that device only — a lab machine's user stays as they are.
  function defaultTicks(card) {
    const t = new Set();
    const can = (d) => !d.excluded && d.objId;
    if (card.pick.type === "user") {
      if (card.user && !card.user.excluded) t.add(`u:${card.user.id}`);
      card.devices.filter((d) => can(d) && !d.stale).forEach((d) => t.add(d.key));
    } else {
      const d = card.devices.find((x) => x.searched) || card.devices[0];
      if (d && can(d)) t.add(d.key);
    }
    return t;
  }

  // ------------------------------------------------------------ reach --
  // Which in-scope policies reach an object with these (transitive) groups.
  function reachOf(model, groups, kind) {
    const out = { new: [], old: [], keptOut: { new: [], old: [] } };
    const g = groups || new Set();
    const test = (P) => {
      const r = { inc: false, exc: false, incVia: [], excVia: [], filtered: false };
      for (const a of P.item.assignments || []) {
        if (a.kind === "Excluded" && a.groupId && g.has(lc(a.groupId))) { r.exc = true; r.excVia.push(lc(a.groupId)); }
        else if (a.kind === "Included" && a.groupId && g.has(lc(a.groupId))) { r.inc = true; r.incVia.push(lc(a.groupId)); if (a.filterId) r.filtered = true; }
        else if ((a.kind === "All devices" && kind === "device") || (a.kind === "All users" && kind === "user")) { r.inc = true; r.incVia.push(a.kind); if (a.filterId) r.filtered = true; }
      }
      return r;
    };
    for (const [gen, list] of [["new", model.newP || []], ["old", model.oldP || []]]) {
      for (const P of list) {
        const r = test(P);
        if (!r.inc) continue;
        if (r.exc) out.keptOut[gen].push({ P, via: r.excVia });
        else out[gen].push({ P, via: r.incVia, filtered: r.filtered });
      }
    }
    return out;
  }
  // The country device groups a device is a DIRECT member of — the groups
  // "keep it on the old set" takes it out of. Not a wave, not a rollout
  // group (the exclusion groups share the prefix).
  function countryGroupsOf(d, ctx) {
    const pre = lc(ctx.deviceGroupPrefix || "");
    const skip = ctx.skipIds || new Set();
    return (d.direct || []).filter((g) => pre && lc(g.name).startsWith(pre) && !/-WAVE-/i.test(g.name) && !skip.has(lc(g.id)));
  }
  // Before and after, per object. ctx: { ticks, keepOld, exUserId, exDeviceId,
  // deviceWaveIds: Set, deviceGroupPrefix, skipIds: Set }
  function assess(card, model, ctx) {
    const rows = [];
    const direct = (d) => new Set((d.direct || []).map((g) => g.id));
    if (card.user && card.user.groups) {
      const before = reachOf(model, card.user.groups, "user");
      const ticked = ctx.ticks.has(`u:${card.user.id}`) && !card.user.excluded;
      let after = null;
      if (ticked) { const g = new Set(card.user.groups); if (ctx.exUserId) g.add(lc(ctx.exUserId)); after = reachOf(model, g, "user"); }
      rows.push({ kind: "user", obj: card.user, before, after, ticked,
        between: !!(after && !after.new.length && !after.old.length && before.new.length + before.old.length + before.keptOut.old.length > 0) });
    }
    for (const d of card.devices) {
      if (!d.groups) continue;
      const before = reachOf(model, d.groups, "device");
      const ticked = ctx.ticks.has(d.key) && !d.excluded && !!d.objId;
      let after = null, leaves = [];
      if (ticked) {
        const g = new Set(d.groups);
        if (ctx.exDeviceId) g.add(lc(ctx.exDeviceId));
        if (ctx.keepOld) {
          leaves = countryGroupsOf(d, ctx);
          const dir = direct(d);
          leaves.forEach((x) => g.delete(x.id));
          // the waves it is in only through those groups (the country
          // groups exist to be nested in the waves) — a DIRECT wave
          // membership stays
          if (leaves.length) for (const w of ctx.deviceWaveIds || []) if (!dir.has(w)) g.delete(w);
        }
        after = reachOf(model, g, "device");
      }
      rows.push({ kind: "device", obj: d, before, after, ticked, leaves,
        between: !!(after && !after.new.length && !after.old.length && before.new.length + before.old.length + before.keptOut.old.length > 0) });
    }
    return rows;
  }

  // ------------------------------------------------------------- plans --
  // Ops in MdeMembers.applyOps' shape: add to the exclusion groups first,
  // then (keep on the old set) out of the country device groups.
  // ctx: { groups: { user, device }, ticks, keepOld, deviceGroupPrefix, skipIds }
  function planAdd(card, ctx) {
    const ops = [], skipped = [], warnings = [];
    const G = ctx.groups || {};
    const who = card.user ? card.user.displayName : ((card.devices.find((d) => d.searched) || card.devices[0] || {}).name || "");
    const key = card.user ? `u:${card.user.id}` : `d:${who}`;
    const gref = (g) => ({ id: lc(g.id), name: g.displayName });
    if (card.user && ctx.ticks.has(`u:${card.user.id}`)) {
      if (card.user.excluded) skipped.push(`${card.user.displayName}: already in ${G.user ? G.user.displayName : "the user exclusion group"}`);
      else if (!G.user) skipped.push(`${card.user.displayName}: the user exclusion group does not exist — create it in 🌊 first`);
      else ops.push({ type: "add", key, group: gref(G.user), ids: [card.user.id], label: card.user.displayName, memberKind: "user", who,
        objs: [{ id: card.user.id, displayName: card.user.displayName, userPrincipalName: card.user.upn }] });
    }
    const addable = [];
    for (const d of card.devices.filter((x) => ctx.ticks.has(x.key))) {
      if (d.excluded) skipped.push(`${d.name}: already in ${G.device ? G.device.displayName : "the device exclusion group"}`);
      else if (!d.objId) skipped.push(`${d.name}: ${d.problem || "no Entra device object — it cannot be a group member"}`);
      else addable.push(d);
    }
    if (addable.length) {
      if (!G.device) addable.forEach((d) => skipped.push(`${d.name}: the device exclusion group does not exist — create it in 🌊 first`));
      else {
        ops.push({ type: "add", key, group: gref(G.device), ids: addable.map((d) => d.objId), label: addable.map((d) => d.name).join(", "), memberKind: "device", who,
          objs: addable.map((d) => ({ id: d.objId, deviceId: d.deviceId, displayName: d.name })) });
        if (ctx.keepOld) {
          const byGroup = new Map();
          for (const d of addable) {
            if (!d.direct) { warnings.push(`${d.name}: its groups could not be read, so it is not taken out of its country device group — do that in 👥`); continue; }
            for (const g of countryGroupsOf(d, ctx)) {
              if (!byGroup.has(g.id)) byGroup.set(g.id, { g, ids: [], names: [] });
              byGroup.get(g.id).ids.push(d.objId); byGroup.get(g.id).names.push(d.name);
            }
          }
          for (const x of byGroup.values()) ops.push({ type: "remove", key, group: { id: x.g.id, name: x.g.name }, ids: x.ids, label: `${x.names.join(", ")} — out of the wave, back on the old set`, memberKind: "device", who });
        }
      }
    }
    return { ops, skipped, warnings, hasRemoval: false, exclusions: true };
  }
  // Out of the exclusion groups again: every excluded member of the ticked
  // rows. A device goes back into its country device group with the next
  // 👥 sync of that country — until then it stays on the old set.
  function planRemove(rows, groups) {
    const G = groups || {};
    const ops = [], skipped = [];
    for (const r of rows) {
      const who = r.user ? r.user.displayName : (r.devices[0] && r.devices[0].name) || "";
      if (r.user && r.user.excluded) {
        if (G.user) ops.push({ type: "remove", key: r.key, group: { id: lc(G.user.id), name: G.user.displayName }, ids: [r.user.id], label: r.user.displayName, memberKind: "user", who, fromExclusion: true,
          objs: [{ id: r.user.id, displayName: r.user.displayName, userPrincipalName: r.user.upn }] });
        else skipped.push(`${who}: the user exclusion group is not found`);
      }
      const devs = r.devices.filter((d) => d.excluded && d.objId);
      if (devs.length) {
        if (G.device) ops.push({ type: "remove", key: r.key, group: { id: lc(G.device.id), name: G.device.displayName }, ids: devs.map((d) => d.objId), label: devs.map((d) => d.name).join(", "), memberKind: "device", who, fromExclusion: true,
          objs: devs.map((d) => ({ id: d.objId, deviceId: d.deviceId, displayName: d.name })) });
        else skipped.push(`${who}: the device exclusion group is not found`);
      }
    }
    return { ops, skipped, warnings: ops.some((x) => x.memberKind === "device") ? ["A device taken out goes back into its country device group — and so its wave — the next time 👥 syncs that country. Until then it stays on the old set."] : [], hasRemoval: true, exclusions: true };
  }

  // What a verified run changed, folded into the base the pane holds.
  function patchBase(base, done) {
    if (!base) return;
    const G = base.groups || {};
    for (const d of done || []) {
      if (d.type !== "add" && d.type !== "remove") continue;
      const isU = G.user && lc(d.group.id) === lc(G.user.id), isD = G.device && lc(d.group.id) === lc(G.device.id);
      if (!isU && !isD) continue;
      const list = isU ? base.users : base.devices;
      const ids = new Set(d.ids.map(lc));
      if (d.type === "remove") { const keep = list.filter((x) => !ids.has(lc(x.id))); list.length = 0; list.push(...keep); }
      else for (const id of ids) if (!list.some((x) => lc(x.id) === id)) list.push(Object.assign({ id }, (d.objs || []).find((x) => lc(x.id) === id) || {}));
    }
  }

  return { scopes, readBase, index, excludedNow, matchLocal, search, lookup, defaultTicks, reachOf, countryGroupsOf, assess, planAdd, planRemove, patchBase, isStale };
})();

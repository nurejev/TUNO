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
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
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
      // a device off a list (10651) comes alone: its primary user is named, not read
      if (m && o.light) list = [m];
      else if (m && m.userId) { user = await readUser(m.userId, m.userPrincipalName); list = ix.byUser.get(lc(m.userId)) || [m]; }
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
    // light (a list, 10651): the direct groups only — the user's country
    // group, a device's country device group — not what reaches them
    const directOf = (arr) => (arr || []).map((g) => ({ id: lc(g.id), name: g.displayName || g.id }));
    if (user && !user.unread) {
      try {
        if (o.light) user.direct = directOf(keep(await groupsOf(`/users/${enc(user.id)}/memberOf`, US())));
        else user.groups = toSet(keep(await groupsOf(`/users/${enc(user.id)}/transitiveMemberOf`, US())));
      } catch (e) { failed.push(`${user.displayName}'s groups: ${msg(e).slice(0, 160)}`); }
    }
    const withObj = devices.filter((d) => d.objId);
    const gr = await Graph.pool(withObj, async (d) => ({
      all: o.light ? null : await groupsOf(`/devices/${enc(d.objId)}/transitiveMemberOf`, DO()),
      direct: await groupsOf(`/devices/${enc(d.objId)}/memberOf`, DO()),
    }), 4);
    gr.forEach((x, i) => {
      const d = withObj[i];
      if (x.error) { failed.push(`${d.name}'s groups: ${msg(x.error).slice(0, 160)}`); return; }
      if (x.value.all) d.groups = toSet(keep(x.value.all));
      d.direct = directOf(keep(x.value.direct));
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

  // ------------------------------------------------ 📋 a list (10651) --
  // Mihai: "the exclusion should get a bulk add user and device"; option A
  // off the mockup — paste a list. A line with an @ is a user (UPN or
  // e-mail, exact), any other line a device (name, exact). Each match is
  // looked up like a picked search hit, lighter: direct groups only (the
  // country device group a device leaves), no "what reaches them".
  const MAX_LINES = 500;
  const COL = [
    ["device", /^(device ?name|computer ?name|host ?name|devicename)$/i],
    ["upn", /user ?principal ?name|(^|\W)upn$/i],
    ["mail", /(^|\W)e-?mail( address)?$|^mail$/i],
  ];
  // text: pasted lines, or a .csv / .txt. Separated by new lines, commas,
  // semicolons or tabs; quotes trimmed; "Name <a@b.com>" (an Outlook To:
  // line) gives the address. A header row that names a device, UPN or
  // e-mail column narrows a CSV to that ONE column — the device name first
  // (an Intune export also carries the primary user's UPN, and a device
  // list is not meant to exclude its users). Deduplicated, case-insensitive.
  function parseList(text) {
    const rows = String(text == null ? "" : text).replace(/^﻿/, "").split(/\r\n|\n|\r/);
    const cells = (row) => row.split(/[,;\t]/).map((c) => {
      let v = c.trim().replace(/^["']+|["']+$/g, "").trim();
      const m = /<([^<>\s]+@[^<>\s]+)>/.exec(v); if (m) v = m[1];
      return v.replace(/^mailto:/i, "");
    });
    let col = -1, column = "";
    const first = rows.findIndex((r) => r.trim());
    if (first >= 0) {
      const h = cells(rows[first]);
      for (const [, re] of COL) { const i = h.findIndex((c) => re.test(c)); if (i >= 0) { col = i; column = h[i]; break; } }
      if (col >= 0) rows.splice(0, first + 1);
    }
    const seen = new Set(), all = [];
    for (const r of rows) {
      const cs = cells(r);
      for (const v of col >= 0 ? [cs[col] || ""] : cs) {
        if (!v || seen.has(lc(v))) continue;
        seen.add(lc(v)); all.push(v);
      }
    }
    return { lines: all.slice(0, MAX_LINES), values: all, total: all.length, truncated: all.length > MAX_LINES, column, max: MAX_LINES };
  }

  const odq = (s) => `'${String(s).replace(/'/g, "''")}'`;
  // lines -> items, each { line, kind, pick?, note?, count? }:
  //   user / device  a match, with the pick lookup() takes
  //   none           no user or device matches the line
  //   many           several devices (or users) answer to it — 🔎 decides
  //   notwin         an Entra device that is not Windows
  async function matchList(lines, base, opt, onStatus) {
    const o = opt || {};
    const now = o.now || Date.now(), days = o.staleDays || 30;
    const say = (m) => { if (onStatus) onStatus(m); };
    const ix = index(base);
    const failed = [];
    const items = lines.map((line) => ({ line, kind: "none", note: "" }));
    // users: UPN or e-mail, 7 of each per request (Learn, known issues: an
    // `in` filter is limited to 15 expressions by default)
    const uItems = items.filter((x) => x.line.includes("@"));
    const uChunks = [];
    for (let i = 0; i < uItems.length; i += 7) uChunks.push(uItems.slice(i, i + 7));
    let doneU = 0;
    const ur = await Graph.pool(uChunks, async (chunk) => {
      const list = chunk.map((x) => odq(x.line)).join(",");
      const r = await Graph.readAll(`/users?$filter=${enc(`userPrincipalName in (${list}) or mail in (${list})`)}&$select=id,displayName,userPrincipalName,mail`, { scopes: US(), retry: true });
      doneU += chunk.length; say(`Looking up users… ${doneU} of ${uItems.length}`);
      return r || [];
    }, 4);
    ur.forEach((x, n) => {
      const chunk = uChunks[n];
      if (x.error) failed.push(`users (${chunk.map((y) => y.line).join(", ")}): ${msg(x.error).slice(0, 160)}`);
      for (const it of chunk) {
        const t = lc(it.line);
        let hits = [];
        if (!x.error) {
          const byUpn = x.value.filter((u) => lc(u.userPrincipalName) === t);
          hits = byUpn.length ? byUpn : x.value.filter((u) => lc(u.mail) === t);
          hits = hits.map((u) => ({ id: lc(u.id), displayName: u.displayName || u.userPrincipalName || u.id, upn: u.userPrincipalName || "", mail: u.mail || "" }));
        } else {
          // the request failed: the Intune list still knows a primary user by UPN
          const m = (base.managed || []).find((y) => y.userId && lc(y.userPrincipalName) === t);
          if (m) hits = [{ id: lc(m.userId), displayName: m.userPrincipalName, upn: m.userPrincipalName, mail: "" }];
        }
        const uniq = [...new Map(hits.map((u) => [u.id, u])).values()];
        if (uniq.length === 1) { it.kind = "user"; it.pick = Object.assign({ type: "user" }, uniq[0]); }
        else if (uniq.length > 1) { it.kind = "many"; it.count = uniq.length; it.what = "users"; }
        else if (x.error) { it.kind = "error"; it.note = "the user lookup failed"; }
      }
    });
    // devices: the Intune list first (exact name); several records with one
    // name are usually a re-enrolment — the one that synced lately is taken
    // when it is the only one, and the others are said
    const dItems = items.filter((x) => !x.line.includes("@"));
    const byName = new Map();
    for (const m of base.managed || []) { const k = lc(m.deviceName); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(m); }
    const devPick = (m) => ({ type: "device", managedId: lc(m.id), deviceId: lc(m.azureADDeviceId || ""), name: m.deviceName || m.id });
    const entraNeed = [];
    for (const it of dItems) {
      const ms = byName.get(lc(it.line)) || [];
      if (ms.length === 1) { it.kind = "device"; it.pick = devPick(ms[0]); }
      else if (ms.length > 1) {
        const fresh = ms.filter((m) => !isStale(m.lastSyncDateTime, now, days));
        if (fresh.length === 1) { it.kind = "device"; it.pick = devPick(fresh[0]); it.note = `${ms.length - 1} older Intune record${ms.length === 2 ? "" : "s"} with this name not taken (no sync in ${days} days)`; }
        else { it.kind = "many"; it.count = ms.length; it.what = "devices"; }
      } else entraNeed.push(it);
    }
    // not in Intune: Entra, 15 names per request
    const dChunks = [];
    for (let i = 0; i < entraNeed.length; i += 15) dChunks.push(entraNeed.slice(i, i + 15));
    let doneD = 0;
    const dr = await Graph.pool(dChunks, async (chunk) => {
      const r = await Graph.readAll(`/devices?$filter=${enc(`displayName in (${chunk.map((x) => odq(x.line)).join(",")})`)}&$select=id,deviceId,displayName,operatingSystem,operatingSystemVersion,approximateLastSignInDateTime,accountEnabled`, { scopes: DO(), retry: true });
      doneD += chunk.length; say(`Looking up devices in Entra… ${doneD} of ${entraNeed.length}`);
      return r || [];
    }, 4);
    dr.forEach((x, n) => {
      const chunk = dChunks[n];
      if (x.error) { failed.push(`devices (${chunk.map((y) => y.line).join(", ")}): ${msg(x.error).slice(0, 160)}`); chunk.forEach((it) => { it.kind = "error"; it.note = "the device lookup failed"; }); return; }
      for (const it of chunk) {
        const hits = x.value.filter((d) => lc(d.displayName) === lc(it.line));
        const win = hits.filter((d) => /^windows/i.test(d.operatingSystem || ""));
        if (!hits.length) continue;
        if (!win.length) { it.kind = "notwin"; it.note = [...new Set(hits.map((d) => d.operatingSystem || "unknown OS"))].join(", "); continue; }
        if (win.length > 1) { it.kind = "many"; it.count = win.length; it.what = "devices"; continue; }
        const d = win[0], did = lc(d.deviceId || ""), m = did ? ix.byAad.get(did) : null;
        it.kind = "device";
        it.pick = m ? devPick(m) : { type: "device", objId: lc(d.id), deviceId: did, name: d.displayName || d.id,
          os: [d.operatingSystem, d.operatingSystemVersion].filter(Boolean).join(" "), lastSync: d.approximateLastSignInDateTime || null, managed: false };
      }
    });
    say("");
    return { items, failed };
  }

  // The whole list: match, look each match up (light), and settle what
  // appears twice. A user's line claims their devices, so a device that is
  // also on its own line shows under its user and that line says so.
  // opt.lookup / opt.light (10685, ↩ Revert's list): another tool's lookup
  // (MdeRevert.lookup, full — what reaches them, for the dry run) on the
  // same matching; ⊘'s own list stays light.
  async function resolveList(lines, base, opt, onStatus) {
    const o = Object.assign({ light: true }, opt || {});
    const look = typeof o.lookup === "function" ? o.lookup : lookup;
    const say = (m) => { if (onStatus) onStatus(m); };
    const { items, failed } = await matchList(lines, base, o, onStatus);
    const todo = items.filter((x) => x.pick);
    let n = 0;
    const r = await Graph.pool(todo, async (it) => {
      const card = await look(it.pick, base, o);
      n++; say(`Reading groups… ${n} of ${todo.length}`);
      return card;
    }, 3);
    r.forEach((x, i) => {
      const it = todo[i];
      if (x.error) { it.kind = "error"; it.note = msg(x.error).slice(0, 160); return; }
      it.card = x.value;
      if (x.value.failed.length) failed.push(...x.value.failed);
    });
    const claim = new Map();
    const userFirst = items.filter((x) => x.card && x.kind === "user").concat(items.filter((x) => x.card && x.kind === "device"));
    for (const it of userFirst) {
      const c = it.card;
      const own = c.user ? `u:${c.user.id}` : (c.devices[0] && c.devices[0].key);
      if (own && claim.has(own)) { it.kind = "listed"; it.note = claim.get(own); it.card = null; continue; }
      if (own) claim.set(own, it.line);
      for (const d of c.devices) if (!claim.has(d.key)) claim.set(d.key, it.line);
    }
    say("");
    return { items, failed, readAt: Date.now() };
  }
  // The ticks a list starts with: each card's defaults, as for one hit.
  const listTicks = (list) => {
    const t = new Set();
    for (const it of (list && list.items) || []) if (it.card) defaultTicks(it.card).forEach((k) => t.add(k));
    return t;
  };

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
  // A list (10651): planAdd per card, merged into one step per group — one
  // add to each exclusion group, one removal per country device group — so
  // a hundred lines are a handful of steps, each read back. The same ticks
  // set serves every card (keys are object ids, unique across the list).
  function planAddMany(cards, ctx) {
    const merged = new Map(), order = [];
    const skipped = [], warnings = [];
    const short = (names) => names.length > 4 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
    for (const c of cards) {
      const p = planAdd(c, ctx);
      skipped.push(...p.skipped); warnings.push(...p.warnings);
      for (const op of p.ops) {
        const k = `${op.type}|${op.group.id}|${op.memberKind}`;
        if (!merged.has(k)) { merged.set(k, { type: op.type, key: "list", group: op.group, ids: [], names: [], objs: [], memberKind: op.memberKind }); order.push(k); }
        const m = merged.get(k);
        op.ids.forEach((id, i) => {
          if (m.ids.includes(id)) return;
          m.ids.push(id);
          const o = (op.objs || [])[i];
          if (o) m.objs.push(o);
          m.names.push(o ? (o.displayName || o.userPrincipalName || id) : (op.label.split(" — ")[0].split(", ")[i] || id));
        });
      }
    }
    const rank = (k) => (k.startsWith("add|") ? (k.endsWith("|user") ? 0 : 1) : 2);
    order.sort((a, b) => rank(a) - rank(b));
    const ops = order.map((k) => {
      const m = merged.get(k);
      const noun = m.memberKind === "user" ? "user" : "device";
      const op = { type: m.type, key: "list", group: m.group, ids: m.ids, memberKind: m.memberKind,
        label: m.type === "remove" ? `${short(m.names)} — out of the wave, back on the old set` : short(m.names),
        who: `${m.ids.length} ${noun}${m.ids.length === 1 ? "" : "s"}` };
      if (m.objs.length === m.ids.length) op.objs = m.objs;
      return op;
    });
    const count = (t, kind) => ops.filter((x) => x.type === t && x.memberKind === kind).reduce((a, x) => a + x.ids.length, 0);
    return { ops, skipped, warnings, hasRemoval: false, exclusions: true, bulk: true,
      counts: { users: count("add", "user"), devices: count("add", "device"), out: count("remove", "device") } };
  }
  // What a verified run changed, folded into the list's cards: who is in
  // an exclusion group now, and which country device group a device left.
  function patchList(list, done, groups) {
    if (!list) return;
    const G = groups || {};
    for (const d of done || []) {
      if (d.type !== "add" && d.type !== "remove") continue;
      const gid = lc(d.group.id), ids = new Set(d.ids.map(lc));
      const isU = G.user && gid === lc(G.user.id), isD = G.device && gid === lc(G.device.id);
      for (const it of list.items) {
        const c = it.card;
        if (!c) continue;
        if (isU && c.user && ids.has(c.user.id)) c.user.excluded = d.type === "add";
        for (const dv of c.devices) {
          if (!dv.objId || !ids.has(dv.objId)) continue;
          if (isD) dv.excluded = d.type === "add";
          else if (dv.direct) {
            if (d.type === "remove") dv.direct = dv.direct.filter((g) => g.id !== gid);
            else if (!dv.direct.some((g) => g.id === gid)) dv.direct.push({ id: gid, name: d.group.name || gid });
          }
        }
      }
    }
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

  // ------------------------------------------ 🔎 in a wave anyway (10698) --
  // Mihai: "make sure that there is check that excluded users never (in a
  // nested exclusion group) never gets in the wave through a other nested
  // group. it should be removed or there should be a option in the
  // exclusion overview to do a scan check and remove the users."
  //
  // Who is excluded is read TRANSITIVELY — a group nested in an exclusion
  // group counts, and its members are marked "through <group>". Each
  // wave's transitive members are matched against them; for a wave with a
  // hit, its direct members and its child groups (kind, rule, and the
  // child's own direct members) say the route in. A route through a static
  // group — a country group, a 🧪 test group, the wave itself — can be
  // taken out here; a dynamic group cannot (its rule puts the member back),
  // so the exclusion has to hold on the policies (⚡ ②); a member nested
  // deeper than one child is said, with the group to open in Entra.
  // waves: T28's wave rows (role "wave", audience, region, id, name).
  const DYN = (g) => (g.groupTypes || []).some((t) => /dynamic/i.test(t)) || !!g.membershipRule;
  async function scanWaves(base, waves, opt, onStatus) {
    const say = (m) => { if (onStatus) onStatus(m); };
    const G = (base && base.groups) || {};
    const failed = [];
    const SEL = { user: "id,displayName,userPrincipalName", device: "id,deviceId,displayName" };
    const transitive = (gid, kind, full) => Graph.readAll(`/groups/${enc(gid)}/transitiveMembers/microsoft.graph.${kind}?$select=${full ? SEL[kind] : "id"}&$count=true&$top=999`, { scopes: GS(), headers: EV, retry: true });
    const direct = (gid, kind) => Graph.readAll(`/groups/${enc(gid)}/members/microsoft.graph.${kind}?$select=id&$top=999`, { scopes: GS(), retry: true });
    const children = (gid) => Graph.readAll(`/groups/${enc(gid)}/members/microsoft.graph.group?$select=id,displayName,groupTypes,membershipRule&$top=999`, { scopes: GS(), retry: true });
    const obj = (kind, m, via) => ({ kind, id: lc(m.id), name: m.displayName || m.userPrincipalName || m.id, upn: kind === "user" ? m.userPrincipalName || "" : "", deviceId: kind === "device" ? lc(m.deviceId || "") : "", via: via || null });
    // the excluded: the direct members the base holds, plus whoever a
    // nested group brings (named per member when one nested group holds them)
    const excluded = { user: new Map(), device: new Map() };
    const nested = { user: [], device: [] };
    for (const kind of ["user", "device"]) {
      const g = G[kind];
      if (!g) continue;
      for (const m of (kind === "user" ? base.users : base.devices) || []) excluded[kind].set(lc(m.id), obj(kind, m));
      say(`Reading everyone ${g.displayName} holds, nested groups included…`);
      try {
        const [all, subs] = await Promise.all([transitive(g.id, kind, true), children(g.id)]);
        nested[kind] = (subs || []).map((x) => ({ id: lc(x.id), name: x.displayName || x.id, dynamic: DYN(x) }));
        const extra = (all || []).filter((m) => !excluded[kind].has(lc(m.id)));
        // which nested group holds them — read when there is more than one
        let holder = new Map();
        if (extra.length && nested[kind].length > 1) {
          const r = await Graph.pool(nested[kind], (s) => transitive(s.id, kind, false), 4);
          r.forEach((x, i) => { if (!x.error) for (const m of x.value || []) if (!holder.has(lc(m.id))) holder.set(lc(m.id), nested[kind][i].name); });
        } else if (extra.length && nested[kind].length === 1) holder = { get: () => nested[kind][0].name, has: () => true };
        for (const m of extra) excluded[kind].set(lc(m.id), obj(kind, m, holder.get(lc(m.id)) || "a nested group"));
      } catch (e) { failed.push(`${g.displayName}: ${msg(e).slice(0, 160)}`); }
    }
    const ws = (waves || []).filter((w) => w && w.role === "wave" && w.id && (w.audience === "user" || w.audience === "device"));
    const rows = new Map();
    const rowOf = (kind, m) => { const k = `${kind}:${m.id}`; if (!rows.has(k)) rows.set(k, Object.assign({ key: k, routes: [] }, m)); return rows.get(k); };
    let n = 0;
    const wr = await Graph.pool(ws, async (w) => {
      say(`Reading the waves… ${++n} of ${ws.length} (${w.name})`);
      const ex = excluded[w.audience];
      if (!ex.size) return { hits: [] };
      const all = await transitive(w.id, w.audience, false);
      const hits = (all || []).map((m) => lc(m.id)).filter((id) => ex.has(id));
      if (!hits.length) return { hits };
      const [dir, kids] = await Promise.all([direct(w.id, w.audience), children(w.id)]);
      const kidRows = (kids || []).map((k) => ({ id: lc(k.id), name: k.displayName || k.id, dynamic: DYN(k) }));
      const kr = await Graph.pool(kidRows, async (k) => {
        const inside = new Set(((await transitive(k.id, w.audience, false)) || []).map((m) => lc(m.id)));
        const mine = hits.filter((id) => inside.has(id));
        if (!mine.length) return null;
        const own = new Set(((await direct(k.id, w.audience)) || []).map((m) => lc(m.id)));
        return { k, mine, own };
      }, 4);
      const kidFailed = kidRows.filter((k, i) => kr[i].error).map((k) => k.name);
      return { hits, direct: new Set((dir || []).map((m) => lc(m.id))), kids: kr.filter((x) => !x.error && x.value).map((x) => x.value), kidFailed };
    }, 3);
    wr.forEach((x, i) => {
      const w = ws[i];
      if (x.error) { failed.push(`${w.name}: ${msg(x.error).slice(0, 160)}`); return; }
      const v = x.value;
      if (!v.hits.length) return;
      if (v.kidFailed && v.kidFailed.length) failed.push(`${w.name}: ${v.kidFailed.join(", ")} could not be read — a route through ${v.kidFailed.length === 1 ? "it" : "them"} is not shown`);
      const wave = { id: w.id, name: w.name, region: w.region || "", audience: w.audience };
      for (const id of v.hits) {
        const row = rowOf(w.audience, excluded[w.audience].get(id));
        if (v.direct.has(id)) row.routes.push({ wave, group: null, direct: true, dynamic: false, deep: false });
        for (const k of v.kids) if (k.mine.includes(id)) row.routes.push({ wave, group: { id: k.k.id, name: k.k.name }, direct: k.own.has(id), dynamic: k.k.dynamic, deep: !k.own.has(id) });
        if (!row.routes.some((r) => r.wave.id === wave.id)) row.routes.push({ wave, group: null, direct: false, dynamic: false, deep: true, unknown: true });
      }
    });
    const out = [...rows.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "user" ? -1 : 1) || lc(a.name).localeCompare(lc(b.name)));
    const count = (kind) => out.filter((r) => r.kind === kind).length;
    return { rows: out, users: count("user"), devices: count("device"), excluded: { users: excluded.user.size, devices: excluded.device.size }, nested, waves: ws.length, failed, readAt: Date.now() };
  }
  // The removals: every ticked row's routes through a static group, one
  // step per group and kind. A dynamic route, a deeper nesting and an
  // unknown route are left out with the reason.
  function planScan(rows, ticks) {
    const T = ticks || new Set((rows || []).map((r) => r.key));
    const merged = new Map(), order = [];
    const skipped = [], warnings = [];
    for (const r of rows || []) {
      if (!T.has(r.key)) continue;
      for (const rt of r.routes) {
        const where = rt.group ? `${rt.wave.name} through ${rt.group.name}` : rt.wave.name;
        if (rt.unknown) { skipped.push(`${r.name}: in ${rt.wave.name}, but the route in could not be read — open the wave in Entra`); continue; }
        if (rt.dynamic) { skipped.push(`${r.name}: in ${where} — a dynamic group; its rule would put them back. The exclusion has to hold on the policies (⚡ ②).`); continue; }
        if (rt.deep) { skipped.push(`${r.name}: in ${where}, nested deeper than that group — take them out of the inner group in Entra`); continue; }
        const g = rt.group || { id: rt.wave.id, name: rt.wave.name };
        const k = `${g.id}|${r.kind}`;
        if (!merged.has(k)) { merged.set(k, { group: g, kind: r.kind, wave: rt.wave.name, ids: [], names: [], objs: [] }); order.push(k); }
        const m = merged.get(k);
        if (m.ids.includes(r.id)) continue;
        m.ids.push(r.id); m.names.push(r.name);
        m.objs.push(r.kind === "user" ? { id: r.id, displayName: r.name, userPrincipalName: r.upn } : { id: r.id, deviceId: r.deviceId, displayName: r.name });
      }
    }
    const short = (names) => names.length > 4 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
    const ops = order.map((k) => {
      const m = merged.get(k);
      return { type: "remove", key: "exscan", group: { id: m.group.id, name: m.group.name }, ids: m.ids, memberKind: m.kind, objs: m.objs,
        label: `${short(m.names)} — excluded, out of ${m.wave}`, who: `${m.ids.length} ${m.kind}${m.ids.length === 1 ? "" : "s"}` };
    });
    // members, not removals — one member can leave two groups
    const nU = new Set(ops.filter((x) => x.memberKind === "user").flatMap((x) => x.ids)).size;
    const nD = new Set(ops.filter((x) => x.memberKind === "device").flatMap((x) => x.ids)).size;
    if (ops.length) warnings.push("A member taken out of a static country group is not put back by the 👥 / 🔄 sync: an excluded member is held, like a reverted one, for as long as it is in the exclusion group.");
    return { ops, skipped, warnings, hasRemoval: ops.length > 0, exclusions: true, runKind: "exscan", counts: { users: nU, devices: nD },
      title: `⊘ Out of the waves — ${[nU ? plural(nU, "user") : "", nD ? plural(nD, "device") : ""].filter(Boolean).join(", ") || "nothing to take out"}` };
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

  return { scopes, readBase, index, excludedNow, matchLocal, search, lookup, defaultTicks, reachOf, countryGroupsOf, assess, planAdd, planRemove, patchBase, isStale,
    parseList, matchList, resolveList, listTicks, planAddMany, patchList, MAX_LINES, scanWaves, planScan };
})();

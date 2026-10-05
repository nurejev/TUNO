// ======================================================================
// T28 — ↩ REVERT and 🔄 COUNTRY GROUPS (build 10679). DOM-free.
//
// Mihai (5 Oct 2026): "an option to remove a user and/or device from a
// wave, so they go back to the old MDE policies", built on static groups
// only — "no dynamic groups anywhere in the revert path":
//
//   PVM-UG-CORP-MEM-USERS-<CC>[-site]   (source, transitive members)
//           │  🔄 sync: source − INT-SG-*-MDE-Revert
//           ▼
//   INT-SG-U-<ISO3>  /  INT-SG-D-<ISO3>   (static, direct members, T28-owned)
//           │  nested
//           ▼
//   INT-SG-U-WAVE-<region>  /  INT-SG-D-WAVE-<region>
//
// The ISO3 of a country is the one its device group already has —
// MdeMembers.countryRows, the ⚙️ table and its suffix overrides (Mihai:
// "just like the device groups, lookup in TUNO"), so NL-Breda's user
// group is INT-SG-U-NLD-BREDA beside INT-SG-D-NLD-BREDA. The device rule is
// MdeMembers.compute's, untouched: this file reads its rows, never a second
// join. A device or user in the Revert pair is HELD — never in the default
// write set of a sync; re-including one takes a per-row tick and a confirm
// that names the count and the wave.
//
//   readExtra   the static user groups, their direct users, the Revert pair
//   model       per country: the user diff beside the device diff, the
//               held-back, the Revert clean-up (leavers out of Revert too —
//               Mihai: "yes"), the drift, the last sync
//   planSync    🔄 the ticked rows → ops (run kind groupsync)
//   planSwap    ⇄ a wave's dynamic country groups → the static ones, with a
//               read-back check before each unnest (run kind waveswap)
//   planRevert  ↩ one person: into Revert, out of their country group(s)
//               (run kind revert); planUnrevert the way back
//   assess      what reaches each ticked object before and after, per policy
//
// Ops are MdeMembers.applyOps' — every write read back, the undo the
// inverse of what was done.
// ======================================================================
const MdeRevert = (() => {
  "use strict";
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const enc = encodeURIComponent;
  const odq = (s) => String(s).replace(/'/g, "''");
  const EV = { ConsistencyLevel: "eventual" };
  const DAY = 86400000;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;
  const msg = (e) => String((e && e.message) || e || "");
  const short = (names) => names.length > 4 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");

  // ------------------------------------------------------------ naming --
  // The static user group of a country row: the user prefix and the device
  // group's own code. null when the row has no code (⚙️ says why).
  const userGroupName = (row, cfg) => (row && row.iso3 ? `${cfg.userGroupPrefix}${row.iso3}` : null);
  // Every country row's two static names, for telling a country group from
  // the rest of what an object is a direct member of.
  function countryNames(rows, cfg) {
    const user = new Map(), device = new Map();
    for (const r of rows || []) {
      if (!r.iso3) continue;
      user.set(lc(userGroupName(r, cfg)), r);
      if (r.deviceGroupName) device.set(lc(r.deviceGroupName), r);
    }
    return { user, device };
  }
  // The mapping per ISO3 (§1: "the pane shows the mapping per ISO3 and asks
  // the admin to confirm it before anything is created"). Its signature is
  // what the confirm is bound to — a changed table asks again.
  function mapping(rows, cfg) {
    const out = [];
    for (const r of rows || []) out.push({ key: r.key, region: r.region, country: r.country, suffix: r.suffix, source: r.userGroupName, iso3: r.iso3 || null,
      user: userGroupName(r, cfg), device: r.deviceGroupName || null, why: r.iso3 ? "" : r.iso3Source, pilot: !!r.pilot });
    return out;
  }
  const mappingSig = (rows, cfg) => mapping(rows, cfg).map((m) => `${m.source}>${m.user || "-"}|${m.device || "-"}`).join(";");

  // ------------------------------------------------------------- reads --
  // The static user groups (by prefix, then the exact names the rows give),
  // the direct users of each, and the Revert pair's members. Read-only.
  async function readExtra(cfg, rows, onStatus) {
    const say = (m) => { if (onStatus) onStatus(m); };
    const GS = Graph.SCOPES.groups;
    const failed = [];
    say("Reading the static country user groups…");
    const list = await Graph.readAll(`/groups?$filter=${enc(`startswith(displayName,'${odq(cfg.userGroupPrefix)}')`)}&$select=id,displayName,groupTypes,membershipRule&$top=999`, { scopes: GS, retry: true });
    const want = new Set((rows || []).map((r) => lc(userGroupName(r, cfg))).filter(Boolean));
    const userGroups = new Map();
    for (const g of list || []) if (want.has(lc(g.displayName))) userGroups.set(lc(g.displayName), g);
    const userMembers = new Map(), upn = new Map();
    const gs = [...userGroups.values()];
    let i = 0;
    const ur = await Graph.pool(gs, async (g) => { say(`Reading the static user groups' members — ${++i}/${gs.length}…`); return Graph.readAll(`/groups/${enc(g.id)}/members/microsoft.graph.user?$select=id,userPrincipalName&$top=999`, { scopes: GS, retry: true }); }, 4);
    ur.forEach((r, n) => {
      if (r.error) { failed.push(`${gs[n].displayName}: ${msg(r.error).slice(0, 160)}`); return; }
      userMembers.set(lc(gs[n].id), new Set((r.value || []).map((u) => lc(u.id))));
      for (const u of r.value || []) if (u.userPrincipalName) upn.set(lc(u.id), u.userPrincipalName);
    });
    say("Reading the Revert groups…");
    const byName = async (name) => {
      if (!name) return null;
      const hit = await Graph.readAll(`/groups?$filter=${enc(`displayName eq '${odq(name)}'`)}&$select=id,displayName,groupTypes&$top=5`, { scopes: GS, retry: true });
      return (hit || []).find((g) => lc(g.displayName) === lc(name)) || null;
    };
    const revert = { user: null, device: null };
    const revertUsers = new Map(), revertDevices = new Map();
    try {
      revert.user = await byName(cfg.revertUser);
      if (revert.user) for (const u of (await Graph.readAll(`/groups/${enc(revert.user.id)}/members/microsoft.graph.user?$select=id,userPrincipalName,displayName&$top=999`, { scopes: GS, retry: true })) || []) {
        revertUsers.set(lc(u.id), { id: lc(u.id), upn: u.userPrincipalName || u.id, name: u.displayName || u.userPrincipalName || u.id });
        if (u.userPrincipalName) upn.set(lc(u.id), u.userPrincipalName);
      }
    } catch (e) { failed.push(`${cfg.revertUser}: ${msg(e).slice(0, 160)}`); }
    try {
      revert.device = await byName(cfg.revertDevice);
      if (revert.device) for (const d of (await Graph.readAll(`/groups/${enc(revert.device.id)}/members/microsoft.graph.device?$select=id,deviceId,displayName&$top=999`, { scopes: GS, retry: true })) || []) revertDevices.set(lc(d.id), { id: lc(d.id), deviceId: lc(d.deviceId || ""), name: d.displayName || d.id });
    } catch (e) { failed.push(`${cfg.revertDevice}: ${msg(e).slice(0, 160)}`); }
    say("");
    return { userGroups, userMembers, upn, revert, revertUsers, revertDevices, failed, readAt: Date.now() };
  }

  // ------------------------------------------------------------- model --
  // memModel: MdeMembers.compute's; input: its input; extra: readExtra's.
  // opt: { lastSynced: { [rowKey]: iso }, now, reasons: { [id]: { reason } } }
  function model(cfg, memModel, input, extra, opt) {
    const o = opt || {};
    const now = o.now || Date.now();
    const staleMs = (cfg.syncStaleDays || 14) * DAY;
    const X = extra || { userGroups: new Map(), userMembers: new Map(), upn: new Map(), revert: {}, revertUsers: new Map(), revertDevices: new Map(), failed: [] };
    const reasons = o.reasons || {};
    const entraById = new Map((input.entra || []).map((e) => [lc(e.id), e]));
    const upnOf = (id) => X.upn.get(id) || id;
    const devName = (id) => { const e = entraById.get(id); return e ? e.displayName || id : ((X.revertDevices.get(id) || {}).name || id); };
    const rows = [];
    const seenUsers = new Set(), seenDevices = new Set();
    for (const r of memModel.rows) {
      if (!r.ug) continue;
      const src = (input.usersByGroup.get(lc(r.ug.id)) || []).map((u) => ({ id: lc(u.id), upn: u.userPrincipalName || u.id }));
      src.forEach((u) => { seenUsers.add(u.id); if (!X.upn.has(u.id) && u.upn) X.upn.set(u.id, u.upn); });
      r.devices.forEach((d) => { if (d.objId) seenDevices.add(d.objId); });
      const uName = userGroupName(r, cfg);
      const ug = uName ? X.userGroups.get(lc(uName)) || null : null;
      const have = ug ? (X.userMembers.get(lc(ug.id)) || new Set()) : new Set();
      const srcIds = new Set(src.map((u) => u.id));
      const user = { add: [], leave: [], held: [], heldIn: [] };
      for (const u of src) {
        if (X.revertUsers.has(u.id)) { if (have.has(u.id)) user.heldIn.push(u); else user.held.push(Object.assign({ reason: (reasons[u.id] || {}).reason || "" }, u)); }
        else if (!have.has(u.id)) user.add.push(u);
      }
      for (const id of have) if (!srcIds.has(id)) user.leave.push({ id, upn: upnOf(id) });
      // devices: the 👥 rule's diff, split by why a member goes
      const device = { add: r.add.map((id) => ({ id, name: devName(id) })), leave: [], heldIn: [], held: [] };
      const byObj = new Map(r.devices.filter((d) => d.objId).map((d) => [d.objId, d]));
      for (const id of r.remove) {
        const d = byObj.get(id);
        if (d && d.reverted) device.heldIn.push({ id, name: d.name, why: "reverted" });
        else if (d && d.held) device.heldIn.push({ id, name: d.name, why: "excluded" });
        else device.leave.push({ id, name: devName(id) });
      }
      for (const d of r.devices) if (d.reverted && d.objId && !r.have.has(d.objId)) device.held.push({ id: d.objId, name: d.name, upn: d.upn, reason: (reasons[d.objId] || {}).reason || "" });
      const staticNested = !!(ug && r.wave.user && input.waveChildren && (input.waveChildren.get(lc(r.wave.user.id)) || new Set()).has(lc(ug.id)));
      const drift = user.add.length + user.leave.length + user.heldIn.length + (r.dg ? device.add.length + device.leave.length + device.heldIn.length : device.add.length);
      const last = (o.lastSynced || {})[r.key] || null;
      const age = last ? now - Date.parse(last) : Infinity;
      rows.push({ key: r.key, region: r.region, country: r.country, suffix: r.suffix, iso3: r.iso3, pilot: !!r.pilot, migrated: !!r.migrated,
        batchOpen: !!(r.batch && !r.batch.finished), source: { id: lc(r.ug.id), name: r.ug.displayName }, sourceCount: src.length,
        userGroupName: uName, ug: ug ? { id: lc(ug.id), name: ug.displayName } : null, userHave: have.size, user,
        deviceGroupName: r.deviceGroupName, dg: r.dg ? { id: lc(r.dg.id), name: r.dg.displayName } : null, device,
        wave: r.wave, sourceNested: !!(r.ugNestedSrc === undefined ? r.ugNested : r.ugNestedSrc), staticNested, dgNested: r.dgNested,
        drift, lastSynced: last, stale: drift > 0 && !(age <= staleMs), why: r.iso3 ? "" : r.iso3Source });
    }
    // the Revert clean-up: a member of a Revert group no country source
    // holds any more (Mihai, open question 3: "yes")
    const cleanup = { users: [], devices: [] };
    for (const [id, u] of X.revertUsers) if (!seenUsers.has(id)) cleanup.users.push({ id, upn: u.upn, reason: (reasons[id] || {}).reason || "" });
    for (const [id, d] of X.revertDevices) if (!seenDevices.has(id)) cleanup.devices.push({ id, name: d.name, reason: (reasons[id] || {}).reason || "" });
    const regions = [...new Set(rows.map((r) => r.region))].map((region) => {
      const rs = rows.filter((r) => r.region === region);
      const w = rs[0].wave;
      return { region, rows: rs, wave: w, toSwap: rs.filter((r) => r.sourceNested).length, swapped: rs.filter((r) => r.staticNested && !r.sourceNested).length };
    });
    return { rows, regions, cleanup, revert: X.revert, revertUsers: X.revertUsers, revertDevices: X.revertDevices, failed: (memModel.failed || []).concat(X.failed || []),
      readAt: X.readAt || memModel.readAt || 0, drift: rows.reduce((a, r) => a + r.drift, 0), stale: rows.filter((r) => r.stale).length, cfg };
  }

  // ------------------------------------------------------------ 🔄 sync --
  // One tickable line per member that would move. Keys:
  //   <dir>|<u|d>|<rowKey>|<id>   dir: add · leave · heldin · reinc · clean
  // Defaults (§2): adds ticked; leavers, members held in, re-includes and
  // the Revert clean-up never ticked.
  function syncItems(sm, scope) {
    const rows = sm.rows.filter((r) => !scope || scope === "all" || r.key === scope);
    const out = [];
    for (const r of rows) {
      if (r.migrated) continue;
      const w = r.wave || {};
      // 10680 (Mihai: "the group creations should be one and the same … at
      // the wave members, keep it there — user and device, same place"):
      // 🔄 syncs groups that exist; 👥 Wave members creates them
      if (!r.ug && !r.dg) continue;
      if (r.ug) for (const u of r.user.add) out.push({ key: `add|u|${r.key}|${u.id}`, dir: "add", kind: "user", row: r, id: u.id, name: u.upn, group: r.userGroupName });
      if (r.dg) for (const d of r.device.add) out.push({ key: `add|d|${r.key}|${d.id}`, dir: "add", kind: "device", row: r, id: d.id, name: d.name, group: r.deviceGroupName });
      for (const u of r.user.leave) out.push({ key: `leave|u|${r.key}|${u.id}`, dir: "leave", kind: "user", row: r, id: u.id, name: u.upn, group: r.userGroupName, why: `no longer in ${r.source.name}` });
      for (const d of r.device.leave) out.push({ key: `leave|d|${r.key}|${d.id}`, dir: "leave", kind: "device", row: r, id: d.id, name: d.name, group: r.deviceGroupName, why: "its primary user is no longer in the country" });
      for (const u of r.user.heldIn) out.push({ key: `heldin|u|${r.key}|${u.id}`, dir: "heldin", kind: "user", row: r, id: u.id, name: u.upn, group: r.userGroupName, why: "in Revert, yet still in the country group" });
      for (const d of r.device.heldIn) out.push({ key: `heldin|d|${r.key}|${d.id}`, dir: "heldin", kind: "device", row: r, id: d.id, name: d.name, group: r.deviceGroupName, why: d.why === "reverted" ? "in Revert, yet still in the country group" : "⊘ excluded — kept on the old set" });
      if (r.ug) for (const u of r.user.held) out.push({ key: `reinc|u|${r.key}|${u.id}`, dir: "reinc", kind: "user", row: r, id: u.id, name: u.upn, group: r.userGroupName, reason: u.reason, wave: w.userName || r.region });
      if (r.dg) for (const d of r.device.held) out.push({ key: `reinc|d|${r.key}|${d.id}`, dir: "reinc", kind: "device", row: r, id: d.id, name: d.name, group: r.deviceGroupName, reason: d.reason, wave: w.deviceName || r.region });
    }
    if (!scope || scope === "all") {
      for (const u of sm.cleanup.users) out.push({ key: `clean|u|-|${u.id}`, dir: "clean", kind: "user", row: null, id: u.id, name: u.upn, group: sm.cfg.revertUser, reason: u.reason, why: "in no country source any more" });
      for (const d of sm.cleanup.devices) out.push({ key: `clean|d|-|${d.id}`, dir: "clean", kind: "device", row: null, id: d.id, name: d.name, group: sm.cfg.revertDevice, reason: d.reason, why: "in no country any more" });
    }
    return out;
  }
  const defaultSyncTicks = (items) => new Set(items.filter((x) => x.dir === "add").map((x) => x.key));
  // The confirm line a re-include needs: the count and the wave(s) (§2).
  function reincludeLine(items, ticks) {
    const re = items.filter((x) => x.dir === "reinc" && ticks.has(x.key));
    if (!re.length) return "";
    const u = re.filter((x) => x.kind === "user").length, d = re.filter((x) => x.kind === "device").length;
    const waves = [...new Set(re.map((x) => x.row.region))];
    return `re-include ${[u ? plural(u, "user") : "", d ? plural(d, "device") : ""].filter(Boolean).join(" and ")} in wave ${waves.join(", ")}; they lose the old MDE policies`;
  }
  // opt: { confirm: the line the admin ticked, scopeRows }. Creates nothing
  // (10680) — a missing group is created in 👥 Wave members.
  function planSync(sm, items, ticks, opt) {
    const o = opt || {};
    const cfg = sm.cfg;
    const ops = [], skipped = [], warnings = [];
    const picked = items.filter((x) => ticks.has(x.key));
    const line = reincludeLine(items, ticks);
    if (line && o.confirm !== line) return { ops: [], skipped: [], warnings: [], refused: `A reverted member is ticked to go back in. Tick the confirm line — “${line}” — or untick the row.`, runKind: "groupsync" };
    const byRow = new Map();
    for (const x of picked) { const k = x.row ? x.row.key : "-"; if (!byRow.has(k)) byRow.set(k, []); byRow.get(k).push(x); }
    for (const [k, list] of byRow) {
      if (k === "-") continue;
      const r = list[0].row;
      const tag = `${r.country} (${r.iso3 || r.suffix})`;
      const who = r.country;
      // users
      const uIn = list.filter((x) => x.kind === "user" && (x.dir === "add" || x.dir === "reinc"));
      const uOut = list.filter((x) => x.kind === "user" && (x.dir === "leave" || x.dir === "heldin"));
      let uRef = r.ug ? { id: r.ug.id, name: r.ug.name } : null;
      let uAddIdx = null;
      if (uIn.length) {
        if (!r.userGroupName) skipped.push(`${tag}: ${r.why || "no ISO3 code"}`);
        else {
          if (!uRef) { skipped.push(`${tag}: ${r.userGroupName} does not exist — create it in 👥 Wave members`); uAddIdx = null; }
          else uAddIdx = ops.length;
          if (uRef)
          ops.push({ type: "add", key: r.key, group: uRef, ids: uIn.map((x) => x.id), memberKind: "user", who, label: short(uIn.map((x) => x.name)),
            objs: uIn.map((x) => ({ id: x.id, userPrincipalName: x.name, displayName: x.name })) });
        }
      }
      if (uOut.length && uRef && uRef.id) ops.push({ type: "remove", key: r.key, group: uRef, ids: uOut.map((x) => x.id), memberKind: "user", who, batch: true, label: `${short(uOut.map((x) => x.name))} — ${uOut.every((x) => x.dir === "leave") ? "left the country" : "held"}`,
        objs: uOut.map((x) => ({ id: x.id, userPrincipalName: x.name, displayName: x.name })) });
      // devices
      const dIn = list.filter((x) => x.kind === "device" && (x.dir === "add" || x.dir === "reinc"));
      const dOut = list.filter((x) => x.kind === "device" && (x.dir === "leave" || x.dir === "heldin"));
      let dRef = r.dg ? { id: r.dg.id, name: r.dg.name } : null;
      let dAddIdx = null;
      if (dIn.length) {
        if (!r.deviceGroupName) skipped.push(`${tag}: ${r.why || "no device group name"}`);
        else {
          if (!dRef) { skipped.push(`${tag}: ${r.deviceGroupName} does not exist — create it in 👥 Wave members`); dAddIdx = null; }
          else dAddIdx = ops.length;
          if (dRef)
          ops.push({ type: "add", key: r.key, group: dRef, ids: dIn.map((x) => x.id), memberKind: "device", who, label: short(dIn.map((x) => x.name)), objs: dIn.map((x) => ({ id: x.id, displayName: x.name })) });
        }
      }
      if (dOut.length && dRef && dRef.id) ops.push({ type: "remove", key: r.key, group: dRef, ids: dOut.map((x) => x.id), memberKind: "device", who, batch: true, label: `${short(dOut.map((x) => x.name))} — ${dOut.every((x) => x.dir === "leave") ? "left the country" : "held"}`,
        objs: dOut.map((x) => ({ id: x.id, displayName: x.name })) });
      // re-included: out of Revert only once they are back in (needsOk)
      const ru = uIn.filter((x) => x.dir === "reinc"), rd = dIn.filter((x) => x.dir === "reinc");
      if (ru.length && uAddIdx != null && sm.revert.user) ops.push({ type: "remove", key: r.key, group: { id: lc(sm.revert.user.id), name: sm.revert.user.displayName }, ids: ru.map((x) => x.id), memberKind: "user", who, batch: true,
        label: `${short(ru.map((x) => x.name))} — re-included`, needsOk: [uAddIdx], objs: ru.map((x) => ({ id: x.id, userPrincipalName: x.name, displayName: x.name })) });
      if (rd.length && dAddIdx != null && sm.revert.device) ops.push({ type: "remove", key: r.key, group: { id: lc(sm.revert.device.id), name: sm.revert.device.displayName }, ids: rd.map((x) => x.id), memberKind: "device", who, batch: true,
        label: `${short(rd.map((x) => x.name))} — re-included`, needsOk: [dAddIdx], objs: rd.map((x) => ({ id: x.id, displayName: x.name })) });
      const notNestedU = uIn.length && !r.staticNested && !r.sourceNested ? r.userGroupName : "";
      if (notNestedU) warnings.push(`${r.userGroupName} is not in ${(r.wave && r.wave.userName) || "its user wave"} yet — filling it changes no policy until ⇄ swaps it in`);
    }
    const cu = (byRow.get("-") || []).filter((x) => x.kind === "user"), cd = (byRow.get("-") || []).filter((x) => x.kind === "device");
    if (cu.length && sm.revert.user) ops.push({ type: "remove", key: "revert-cleanup", group: { id: lc(sm.revert.user.id), name: sm.revert.user.displayName }, ids: cu.map((x) => x.id), memberKind: "user", who: "Revert clean-up", batch: true,
      label: `${short(cu.map((x) => x.name))} — in no country source`, objs: cu.map((x) => ({ id: x.id, userPrincipalName: x.name, displayName: x.name })) });
    if (cd.length && sm.revert.device) ops.push({ type: "remove", key: "revert-cleanup", group: { id: lc(sm.revert.device.id), name: sm.revert.device.displayName }, ids: cd.map((x) => x.id), memberKind: "device", who: "Revert clean-up", batch: true,
      label: `${short(cd.map((x) => x.name))} — in no country any more`, objs: cd.map((x) => ({ id: x.id, displayName: x.name })) });
    if (picked.some((x) => x.dir === "leave" || x.dir === "heldin")) warnings.push("A member taken out of a country group leaves its wave: the new MDE policies stop reaching it and the old ones reach it again.");
    const large = cfg.largeNest || 500;
    for (const op of ops) if (op.type === "add" && op.ids.length > large) warnings.push(`${op.group.name}: ${op.ids.length} members at once`);
    return { ops, skipped, warnings, hasRemoval: ops.some((x) => x.type === "remove"), runKind: "groupsync",
      rows: o.scopeRows || [...byRow.keys()].filter((k) => k !== "-"), reinclude: line };
  }

  // ------------------------------------------------------------ ⇄ swap --
  // §1, per wave, between waves: the static group filled and nested, the
  // read-back check, and only then the dynamic group out. A country whose
  // check finds a difference keeps its dynamic group — the plan says so.
  function planSwap(sm, region, opt) {
    const o = opt || {};
    const cfg = sm.cfg;
    const ops = [], skipped = [], warnings = [];
    const rows = sm.rows.filter((r) => r.region === region);
    for (const r of rows) {
      const tag = `${r.country} (${r.source.name})`;
      if (!r.sourceNested) { if (r.staticNested) skipped.push(`${tag}: already swapped — ${r.userGroupName} is in the wave`); continue; }
      if (r.migrated) { skipped.push(`${tag}: 🧪 migrated into its country — no route of its own`); continue; }
      if (r.batchOpen) { skipped.push(`${tag}: a pilot in batches — 🧪 finish it in 👥 first`); continue; }
      if (!r.userGroupName) { skipped.push(`${tag}: ${r.why || "no ISO3 code"}`); continue; }
      if (!r.wave || !r.wave.user) { skipped.push(`${tag}: ${(r.wave && r.wave.userName) || "its user wave"} does not exist`); continue; }
      if (r.user.held.length || r.user.heldIn.length) { skipped.push(`${tag}: ${plural(r.user.held.length + r.user.heldIn.length, "user")} of the source ${r.user.held.length + r.user.heldIn.length === 1 ? "is" : "are"} in ${cfg.revertUser} — the wave's membership would change; sort that out in 🔄 first`); continue; }
      const who = `${r.country} · swap`;
      const wave = { id: lc(r.wave.user.id), name: r.wave.user.displayName };
      if (!r.ug) { skipped.push(`${tag}: ${r.userGroupName} does not exist — create & fill it in 👥 Wave members first`); continue; }
      const ref = { id: r.ug.id, name: r.ug.name };
      const need = [];
      if (r.user.add.length) {
        need.push(ops.length);
        ops.push({ type: "add", key: r.key, group: ref, ids: r.user.add.map((u) => u.id), memberKind: "user", who, label: `${plural(r.user.add.length, "user")} of ${r.source.name}`,
          objs: r.user.add.map((u) => ({ id: u.id, userPrincipalName: u.upn, displayName: u.upn })) });
      }
      if (r.user.leave.length) warnings.push(`${r.userGroupName} holds ${plural(r.user.leave.length, "user")} the source does not — they stay; the check only asks that nobody is lost`);
      if (!r.staticNested) {
        need.push(ops.length);
        ops.push({ type: "nest", key: r.key, parent: wave, child: ref, kind: "user", size: r.sourceCount, who });
      }
      const check = ops.length;
      ops.push({ type: "swapcheck", key: r.key, source: r.source, target: ref, wave, who, needsOk: need.length ? need : undefined });
      ops.push({ type: "unnest", key: r.key, parent: wave, child: { id: r.source.id, name: r.source.name }, kind: "user", who, needsOk: [check] });
    }
    return { ops, skipped, warnings, hasRemoval: ops.some((x) => x.type === "unnest"), runKind: "waveswap", region };
  }

  // ---------------------------------------------------------- ↩ revert --
  // card: MdeExclude.lookup's (full: transitive groups) with user.direct
  // added by lookup() below.
  async function lookup(pick, base, opt) {
    const card = await MdeExclude.lookup(pick, base, opt);
    if (card.user && !card.user.unread) {
      try {
        const d = await Graph.readAll(`/users/${enc(card.user.id)}/memberOf/microsoft.graph.group?$select=id,displayName&$top=999`, { scopes: Graph.SCOPES.directory, retry: true });
        card.user.direct = (d || []).map((g) => ({ id: lc(g.id), name: g.displayName || g.id }));
        for (const g of d || []) card.names.set(lc(g.id), g.displayName || g.id);
      } catch (e) { card.failed.push(`${card.user.displayName}'s direct groups: ${msg(e).slice(0, 160)}`); }
    }
    return card;
  }
  // The pair (§3): a user with their Windows devices that synced lately, a
  // device with its primary user.
  function defaultTicks(card) {
    const t = new Set();
    if (card.user && !card.user.unread) t.add(`u:${card.user.id}`);
    if (card.pick.type === "user") card.devices.filter((d) => d.objId && !d.stale).forEach((d) => t.add(d.key));
    else { const d = card.devices.find((x) => x.searched) || card.devices[0]; if (d && d.objId) t.add(d.key); }
    return t;
  }
  // ctx: { ticks, rows (MdeMembers rows), cfg, revert: { user, device },
  //        revertUsers: Map, revertDevices: Map, reason }
  const countryOf = (list, map) => (list || []).filter((g) => map.has(lc(g.name)));
  function planRevert(card, ctx) {
    const cfg = ctx.cfg;
    const N = countryNames(ctx.rows, cfg);
    const ops = [], skipped = [], warnings = [];
    const reason = String(ctx.reason || "").trim();
    const RU = ctx.revertUsers || new Map(), RD = ctx.revertDevices || new Map();
    const who = card.user ? card.user.displayName : ((card.devices.find((d) => d.searched) || card.devices[0] || {}).name || "");
    const key = card.user ? `u:${card.user.id}` : `d:${who}`;
    const rev = ctx.revert || {};
    const uTick = !!(card.user && ctx.ticks.has(`u:${card.user.id}`));
    const devs = card.devices.filter((d) => ctx.ticks.has(d.key));
    // the sources still nested in a user wave — a user who reaches the wave
    // only through one cannot be reverted until that wave is swapped
    const dyn = new Map();
    for (const r of ctx.rows || []) if (r.ug && (r.ugNestedSrc === undefined ? r.ugNested : r.ugNestedSrc)) dyn.set(lc(r.ug.id), r);
    let uDone = false, dDone = false;
    if (uTick) {
      const u = card.user;
      const groups = countryOf(u.direct, N.user);
      if (RU.has(u.id)) skipped.push(`${u.displayName}: already in ${cfg.revertUser}`);
      else if (!u.direct) skipped.push(`${u.displayName}: their direct groups could not be read`);
      else if (!groups.length) {
        const via = [...(u.groups || new Set())].map((id) => dyn.get(id)).filter(Boolean);
        skipped.push(via.length ? `${u.displayName}: reaches ${via[0].wave.userName || "the user wave"} through ${via[0].ug.displayName} (dynamic) — ⇄ swap ${via[0].region} to ${userGroupName(via[0], cfg) || "its static group"} in 🔄 first`
          : `${u.displayName}: in no static country user group — not in a user wave, nothing to revert`);
      } else {
        let ref = rev.user ? { id: lc(rev.user.id), name: rev.user.displayName } : null;
        if (!ref) { ops.push({ type: "create", key, name: cfg.revertUser, who, description: cfg.revertDescription }); ref = { ref: cfg.revertUser, name: cfg.revertUser }; }
        const addIdx = ops.length;
        ops.push({ type: "add", key, group: ref, ids: [u.id], memberKind: "user", who, label: u.displayName, reason, objs: [{ id: u.id, displayName: u.displayName, userPrincipalName: u.upn }] });
        for (const g of groups) ops.push({ type: "remove", key, group: { id: g.id, name: g.name }, ids: [u.id], memberKind: "user", who, label: `${u.displayName} — out of the wave, back on the old set`, reason, needsOk: [addIdx],
          objs: [{ id: u.id, displayName: u.displayName, userPrincipalName: u.upn }] });
        uDone = true;
      }
    }
    const dAdd = [], dOut = new Map();
    for (const d of devs) {
      if (!d.objId) { skipped.push(`${d.name}: ${d.problem || "no Entra device object"}`); continue; }
      if (RD.has(d.objId)) { skipped.push(`${d.name}: already in ${cfg.revertDevice}`); continue; }
      if (!d.direct) { skipped.push(`${d.name}: its groups could not be read`); continue; }
      const groups = countryOf(d.direct, N.device);
      if (!groups.length) { skipped.push(`${d.name}: in no country device group — not in a device wave, nothing to revert`); continue; }
      dAdd.push(d);
      for (const g of groups) { if (!dOut.has(g.id)) dOut.set(g.id, { g, list: [] }); dOut.get(g.id).list.push(d); }
    }
    if (dAdd.length) {
      let ref = rev.device ? { id: lc(rev.device.id), name: rev.device.displayName } : null;
      if (!ref) { ops.push({ type: "create", key, name: cfg.revertDevice, who, description: cfg.revertDescription }); ref = { ref: cfg.revertDevice, name: cfg.revertDevice }; }
      const addIdx = ops.length;
      ops.push({ type: "add", key, group: ref, ids: dAdd.map((d) => d.objId), memberKind: "device", who, label: dAdd.map((d) => d.name).join(", "), reason, objs: dAdd.map((d) => ({ id: d.objId, deviceId: d.deviceId, displayName: d.name })) });
      for (const { g, list } of dOut.values()) ops.push({ type: "remove", key, group: { id: g.id, name: g.name }, ids: list.map((d) => d.objId), memberKind: "device", who, label: `${list.map((d) => d.name).join(", ")} — out of the wave, back on the old set`, reason, needsOk: [addIdx],
        objs: list.map((d) => ({ id: d.objId, deviceId: d.deviceId, displayName: d.name })) });
      dDone = true;
    }
    // one side only: a mix of new device-scoped and old user-scoped policies
    const otherDevs = card.devices.filter((d) => d.objId && !d.stale && !ctx.ticks.has(d.key) && !RD.has(d.objId) && countryOf(d.direct, N.device).length);
    if (uDone && !dDone && otherDevs.length) warnings.push(`Only the user is reverted: ${otherDevs.map((d) => d.name).join(", ")} keep${otherDevs.length === 1 ? "s" : ""} the new - D - policies while ${card.user.displayName} gets the old - U - ones — a mix.`);
    if (dDone && !uDone && card.user && !RU.has(card.user.id) && countryOf(card.user.direct, N.user).length) warnings.push(`Only the device is reverted: ${card.user.displayName} keeps the new - U - policies while ${dAdd.map((d) => d.name).join(", ")} get${dAdd.length === 1 ? "s" : ""} the old - D - ones — a mix.`);
    // Revert vs ⊘ Exclude (§3)
    const both = [uDone && card.user.excluded ? card.user.displayName : "", ...(dDone ? dAdd.filter((d) => d.excluded).map((d) => d.name) : [])].filter(Boolean);
    if (both.length) warnings.push(`${both.join(", ")} ${both.length === 1 ? "is" : "are"} also in the exclusion group. Excluded means in the wave but skipping the new policies; reverted means out of the wave. Take ${both.length === 1 ? "it" : "them"} out of ⊘ if the old set is the goal.`);
    if ((uDone || dDone) && !reason) warnings.push("No reason given — it is kept with the run and shown in the 🔄 sync preview. Add one.");
    return { ops, skipped, warnings, hasRemoval: ops.some((x) => x.type === "remove"), runKind: "revert", reason };
  }
  // Undo (§3 "Way back"): out of Revert, back into the country group of the
  // country that holds them. items: [{ kind, id, name }] from the Reverted
  // now list. A member no country holds is only taken out of Revert.
  function planUnrevert(sm, items) {
    const cfg = sm.cfg;
    const ops = [], skipped = [], warnings = [];
    const intoU = new Map(), intoD = new Map(), outU = [], outD = [];
    // every country that holds them back gets them again (a pilot site and
    // its country both, NL-Breda ⊂ NL) — where its static group exists
    for (const it of items) {
      const U = it.kind === "user";
      const side = (x) => (U ? x.user : x.device);
      const rows = sm.rows.filter((x) => side(x).held.some((m) => m.id === it.id) || side(x).heldIn.some((m) => m.id === it.id));
      if (!rows.length) { (U ? outU : outD).push(it); warnings.push(`${it.name}: in no country ${U ? "source" : ""} any more — only taken out of Revert`.replace("  ", " ")); continue; }
      const back = rows.filter((x) => side(x).held.some((m) => m.id === it.id) && (U ? x.ug : x.dg));
      const still = rows.some((x) => side(x).heldIn.some((m) => m.id === it.id));
      const missing = rows.filter((x) => side(x).held.some((m) => m.id === it.id) && !(U ? x.ug : x.dg));
      if (!back.length && !still) { skipped.push(`${it.name}: ${missing.map((x) => (U ? x.userGroupName : x.deviceGroupName) || x.country).join(", ")} does not exist — 🔄 sync creates it`); continue; }
      missing.forEach((x) => warnings.push(`${it.name}: ${(U ? x.userGroupName : x.deviceGroupName) || x.country} does not exist — not put back there`));
      (U ? outU : outD).push(it);
      for (const r of back) { const m = U ? intoU : intoD; if (!m.has(r.key)) m.set(r.key, { r, list: [] }); m.get(r.key).list.push(it); }
    }
    const need = [];
    for (const { r, list } of intoU.values()) { need.push(ops.length); ops.push({ type: "add", key: r.key, group: { id: r.ug.id, name: r.ug.name }, ids: list.map((x) => x.id), memberKind: "user", who: r.country, label: `${short(list.map((x) => x.name))} — back in the wave`, objs: list.map((x) => ({ id: x.id, userPrincipalName: x.name, displayName: x.name })) }); }
    for (const { r, list } of intoD.values()) { need.push(ops.length); ops.push({ type: "add", key: r.key, group: { id: r.dg.id, name: r.dg.name }, ids: list.map((x) => x.id), memberKind: "device", who: r.country, label: `${short(list.map((x) => x.name))} — back in the wave`, objs: list.map((x) => ({ id: x.id, displayName: x.name })) }); }
    if (outU.length && sm.revert.user) ops.push({ type: "remove", key: "unrevert", group: { id: lc(sm.revert.user.id), name: sm.revert.user.displayName }, ids: outU.map((x) => x.id), memberKind: "user", who: "↩ undo", batch: true, label: short(outU.map((x) => x.name)), needsOk: need.length ? need.slice() : undefined, objs: outU.map((x) => ({ id: x.id, displayName: x.name, userPrincipalName: x.name })) });
    if (outD.length && sm.revert.device) ops.push({ type: "remove", key: "unrevert", group: { id: lc(sm.revert.device.id), name: sm.revert.device.displayName }, ids: outD.map((x) => x.id), memberKind: "device", who: "↩ undo", batch: true, label: short(outD.map((x) => x.name)), needsOk: need.length ? need.slice() : undefined, objs: outD.map((x) => ({ id: x.id, displayName: x.name })) });
    if (ops.some((x) => x.type === "add")) warnings.push("Back in the wave: the next Intune check-in takes the old MDE policies off and puts the new ones on.");
    return { ops, skipped, warnings, hasRemoval: ops.some((x) => x.type === "remove"), runKind: "revert" };
  }

  // ------------------------------------------------------------ assess --
  // What reaches each ticked object, before and after, per policy (§3 dry
  // run) — T28's reach model (MdeExclude.reachOf: an exclusion wins over an
  // include of its kind; assignment filters not evaluated). After = the
  // country groups gone, and the waves of its kind reached only through
  // them; the Revert group is assigned to nothing.
  // ctx: as planRevert's, plus userWaveIds / deviceWaveIds: Set
  function assess(card, pmodel, ctx) {
    const N = countryNames(ctx.rows, ctx.cfg);
    const out = [];
    const one = (kind, obj, groups, direct, map, waveIds) => {
      if (!groups) return;
      const before = MdeExclude.reachOf(pmodel, groups, kind);
      const leaves = countryOf(direct, map);
      const g = new Set(groups);
      const dir = new Set((direct || []).map((x) => x.id));
      leaves.forEach((x) => g.delete(x.id));
      if (leaves.length) for (const w of waveIds || []) if (!dir.has(w)) g.delete(w);
      const after = MdeExclude.reachOf(pmodel, g, kind);
      const key = (x) => x.P.key;
      const nowNew = new Set(after.new.map(key)), wasOld = new Set(before.old.map(key));
      const drops = before.new.filter((x) => !nowNew.has(key(x))).map((x) => x.P);
      const takes = after.old.filter((x) => !wasOld.has(key(x))).map((x) => x.P);
      const state = !leaves.length ? "none" : !after.new.length && !after.old.length ? "gap" : after.new.length && after.old.length ? "both" : "ok";
      out.push({ kind, obj, leaves, before, after, drops, takes, state, keeps: after.new.map((x) => x.P) });
    };
    if (card.user && ctx.ticks.has(`u:${card.user.id}`)) one("user", card.user, card.user.groups, card.user.direct, N.user, ctx.userWaveIds);
    for (const d of card.devices) if (ctx.ticks.has(d.key)) one("device", d, d.groups, d.direct, N.device, ctx.deviceWaveIds);
    return out;
  }

  // ------------------------------------------------------------ patch --
  // What a verified run changed, folded into extra — so 🔄 and ↩ move
  // without a re-read. The device side lives in MdeMembers' input
  // (patchInput) plus input.reverted, patched here.
  function patch(extra, input, done, cfg) {
    if (!extra) return;
    const RU = extra.revert && extra.revert.user ? lc(extra.revert.user.id) : null;
    const RD = extra.revert && extra.revert.device ? lc(extra.revert.device.id) : null;
    for (const d of done || []) {
      if (d.type === "create") {
        const n = lc(d.name);
        const g = { id: lc(d.id), displayName: d.name };
        if (n === lc(cfg.revertUser)) extra.revert.user = g;
        else if (n === lc(cfg.revertDevice)) extra.revert.device = g;
        else if (n.startsWith(lc(cfg.userGroupPrefix))) { extra.userGroups.set(n, g); extra.userMembers.set(lc(d.id), new Set()); }
        continue;
      }
      if (d.type !== "add" && d.type !== "remove") continue;
      const gid = lc(d.group.id);
      const ids = d.ids.map(lc);
      const objOf = (id) => (d.objs || []).find((o) => lc(o.id) === id) || {};
      if (gid === RU || (!RU && lc(d.group.name) === lc(cfg.revertUser))) {
        for (const id of ids) { if (d.type === "add") extra.revertUsers.set(id, { id, upn: objOf(id).userPrincipalName || id, name: objOf(id).displayName || id }); else extra.revertUsers.delete(id); }
        if (!RU) extra.revert.user = { id: gid, displayName: d.group.name };
        continue;
      }
      if (gid === RD || (!RD && lc(d.group.name) === lc(cfg.revertDevice))) {
        for (const id of ids) { if (d.type === "add") extra.revertDevices.set(id, { id, deviceId: objOf(id).deviceId || "", name: objOf(id).displayName || id }); else extra.revertDevices.delete(id); }
        if (!RD) extra.revert.device = { id: gid, displayName: d.group.name };
        if (input) { if (!input.reverted) input.reverted = new Set(); ids.forEach((id) => d.type === "add" ? input.reverted.add(id) : input.reverted.delete(id)); }
        continue;
      }
      if (extra.userMembers.has(gid)) { const set = extra.userMembers.get(gid); ids.forEach((id) => d.type === "add" ? set.add(id) : set.delete(id)); }
    }
  }
  // The rows a verified groupsync run brought in line (every op of the row
  // verified) — their "last synced" moves.
  function syncedRows(p, results) {
    const ok = new Map();
    p.ops.forEach((op, i) => { if (!op.key || op.key === "revert-cleanup") return; const r = results[i]; ok.set(op.key, (ok.has(op.key) ? ok.get(op.key) : true) && !!(r && r.ok && r.verified)); });
    return (p.rows || []).filter((k) => ok.get(k) !== false);
  }

  return { userGroupName, countryNames, mapping, mappingSig, readExtra, model, syncItems, defaultSyncTicks, reincludeLine, planSync, planSwap,
    lookup, defaultTicks, planRevert, planUnrevert, assess, patch, syncedRows };
})();

// ======================================================================
// T28 — 🧪 TEST MEMBERS PER WAVE (build 10688). DOM-free.
//
// Mihai (6 Oct 2026): "need a option per wave to add testusers and devices
// based on a import csv file". Mockup round: option A, a test group per
// wave nested in it; one CSV per wave, imported from the wave's own row.
//
//   test users (CSV)       ─▶  INT-SG-U-WAVE-<region>-Test  ─ nested ─▶  INT-SG-U-WAVE-<region>
//   their / listed devices ─▶  INT-SG-D-WAVE-<region>-Test  ─ nested ─▶  INT-SG-D-WAVE-<region>
//
// The name is the wave's own plus "-Test", so ⚙️'s wave naming decides it
// and a renamed wave takes its test group's name along. Created on the
// first apply (the admin its owner, like every T28 group), nested in the
// same plan. A 👥 / 🔄 sync never touches it: it is not a country group.
//
// THE LIST IS ⊘'s AND ↩'s. Lines go through MdeExclude.resolveList with
// MdeRevert.lookup (a user's Windows devices, everyone's direct groups),
// so a UPN, an e-mail or a device name is matched exactly as there. One
// difference in the reading: a CSV that carries BOTH a UPN column and a
// device column gives both here — a test sheet lists people and the
// machines they test on, where ⊘'s reader keeps one column.
//
// What is never added, or not by default:
//   * a "-vdi-" device (AVD, out of scope — the standing T28 rule): never;
//   * a member of ↩ Revert: unticked — Revert means held back, and a test
//     import must not silently undo it;
//   * a member of ⊘ Exclusion: ticked, but said — it will sit in the wave
//     and still skip the new policies;
//   * a user's device that has not synced lately: unticked, as everywhere.
// A user whose country belongs to another wave is said, never refused —
// someone ahead of their wave is what a test member is.
//
// Ops are MdeMembers.applyOps': create → add → nest, every write read
// back; removals (a test member unticked) only through the REMOVE gate.
// ======================================================================
const MdeTest = (() => {
  "use strict";
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const enc = encodeURIComponent;
  const odq = (s) => String(s).replace(/'/g, "''");
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;
  const msg = (e) => String((e && e.message) || e || "");

  const SUFFIX = "-Test";
  const DESCRIPTION = "MDE rollout test members of {wave} — nested in it: users and devices put in the wave ahead of their country. Not a country group; no sync touches it. Created by TUNO (T28 MDE rollout · 🧪 Test members).";
  const AUD = { user: "user", device: "device" };

  // ------------------------------------------------------------ naming --
  const waveOf = (waveRows, region, audience) => (waveRows || []).find((w) => w.role === "wave" && w.region === region && w.audience === audience) || null;
  function names(waveRows, region) {
    const out = {};
    for (const a of Object.keys(AUD)) {
      const w = waveOf(waveRows, region, a);
      out[a] = { wave: w, name: w ? `${w.name}${SUFFIX}` : null };
    }
    return out;
  }
  const regions = (waveRows) => [...new Set((waveRows || []).filter((w) => w.role === "wave").map((w) => w.region))];

  // ------------------------------------------------------------- parse --
  // Both columns when a header names a UPN / e-mail AND a device column;
  // otherwise ⊘'s reader (one column, or every value of a plain list).
  const UPN_COL = /user ?principal ?name|(^|\W)upn$|(^|\W)e-?mail( address)?$|^mail$/i;
  const DEV_COL = /^(device ?name|computer ?name|host ?name|devicename)$/i;
  function parse(text) {
    const raw = String(text == null ? "" : text).replace(/^\uFEFF/, "");
    const rows = raw.split(/\r\n|\n|\r/);
    const first = rows.findIndex((r) => r.trim());
    const cells = (row) => row.split(/[,;\t]/).map((c) => c.trim().replace(/^["']+|["']+$/g, "").trim());
    if (first >= 0) {
      const h = cells(rows[first]);
      const cu = h.findIndex((c) => UPN_COL.test(c)), cd = h.findIndex((c) => DEV_COL.test(c));
      if (cu >= 0 && cd >= 0) {
        const seen = new Set(), all = [];
        for (const r of rows.slice(first + 1)) {
          const cs = cells(r);
          for (const v of [cs[cu] || "", cs[cd] || ""]) {
            const m = /<([^<>\s]+@[^<>\s]+)>/.exec(v);
            const x = (m ? m[1] : v).replace(/^mailto:/i, "");
            if (!x || seen.has(lc(x))) continue;
            seen.add(lc(x)); all.push(x);
          }
        }
        const max = MdeExclude.MAX_LINES;
        return { lines: all.slice(0, max), values: all, total: all.length, truncated: all.length > max, column: `${h[cu]} + ${h[cd]}`, max };
      }
    }
    return MdeExclude.parseList(raw);
  }

  // -------------------------------------------------------------- read --
  // The region's two test groups: exact name, direct members, nested or not.
  async function read(waveRows, region, onStatus) {
    const say = (m) => { if (onStatus) onStatus(m); };
    const N = names(waveRows, region);
    const out = { region, at: Date.now(), user: null, device: null };
    for (const a of Object.keys(AUD)) {
      const n = N[a];
      const side = { name: n.name, wave: n.wave ? { id: n.wave.id, name: n.wave.name, exists: !!n.wave.exists } : null, group: null, members: [], nested: false, dupes: 0 };
      out[a] = side;
      if (!n.name) continue;
      say(`Reading ${n.name}…`);
      const gs = await Graph.readAll(`/groups?$filter=${enc(`displayName eq '${odq(n.name)}'`)}&$select=id,displayName`, { scopes: Graph.SCOPES.groups, retry: true });
      const exact = (gs || []).filter((g) => lc(g.displayName) === lc(n.name));
      side.dupes = exact.length > 1 ? exact.length : 0;
      if (!exact.length) continue;
      const g = exact[0];
      side.group = { id: lc(g.id), name: g.displayName };
      const sel = a === "user" ? "microsoft.graph.user?$select=id,displayName,userPrincipalName" : "microsoft.graph.device?$select=id,deviceId,displayName";
      const ms = await Graph.readAll(`/groups/${enc(g.id)}/members/${sel}&$top=999`, { scopes: Graph.SCOPES.groups, retry: true });
      side.members = (ms || []).map((m) => ({ id: lc(m.id), name: m.displayName || m.userPrincipalName || m.id, upn: m.userPrincipalName || "", deviceId: lc(m.deviceId || "") }))
        .sort((x, y) => x.name.localeCompare(y.name));
      if (side.wave && side.wave.id) {
        const kids = await Graph.readAll(`/groups/${enc(side.wave.id)}/members/microsoft.graph.group?$select=id&$top=999`, { scopes: Graph.SCOPES.groups, retry: true });
        side.nested = (kids || []).some((k) => lc(k.id) === side.group.id);
      }
    }
    say("");
    return out;
  }

  // ------------------------------------------------------------ entries --
  // resolveList's items → one entry per found line, flags set.
  // ctx: { cfg (MdeMembers config: revertUser, revertDevice), region,
  //        countryRegion: (card) => region | null }
  function entries(items, test, ctx) {
    const c = ctx || {};
    const cfg = c.cfg || {};
    const inGroup = (direct, name) => !!name && (direct || []).some((g) => lc(g.name) === lc(name));
    const tu = new Set(((test && test.user && test.user.members) || []).map((m) => m.id));
    const td = new Set(((test && test.device && test.device.members) || []).map((m) => m.id));
    const out = [];
    for (const it of items || []) {
      if (!it.card) continue;
      const k = it.card;
      // a DEVICE line brings that device alone — its primary user is named,
      // never added (the line said a machine, not a person)
      const devLine = !!(k.pick && k.pick.type === "device");
      const first = devLine ? (k.devices.find((d) => d.searched) || k.devices[0] || {}) : null;
      const e = { line: it.line, key: devLine ? `d:${lc(first.objId || first.key || it.line)}` : `u:${lc(k.user ? k.user.id : it.line)}`, user: null, devices: [], note: "" };
      if (devLine && k.user) e.note = `primary user ${k.user.displayName} — not added (a device line)`;
      if (!devLine && k.user && !k.user.unread) {
        e.user = { id: lc(k.user.id), name: k.user.displayName, upn: k.user.upn || "",
          revert: inGroup(k.user.direct, cfg.revertUser), excluded: !!k.user.excluded, already: tu.has(lc(k.user.id)) };
      }
      // a device line brings that device; a user line their Windows devices
      const devs = devLine ? [first].filter((d) => d && d.key) : k.devices;
      for (const d of devs) {
        e.devices.push({ key: d.key, objId: d.objId ? lc(d.objId) : "", name: d.name, stale: !!d.stale, listed: devLine, problem: d.problem || (d.objId ? "" : "no Entra device object — it cannot be a group member"),
          avd: MdeMembers.isAvdName(d.name), revert: inGroup(d.direct, cfg.revertDevice), excluded: !!d.excluded, already: !!(d.objId && td.has(lc(d.objId))) });
      }
      const r = !devLine && typeof c.countryRegion === "function" ? c.countryRegion(k) : null;
      if (r && c.region && r !== c.region) e.note = `their country is in the ${r} wave — added ahead of it`;
      out.push(e);
    }
    return out;
  }
  const userKey = (u) => `u:${u.id}`;
  const devKey = (d) => `d:${d.objId}`;
  function defaultTicks(list) {
    const t = new Set();
    for (const e of list || []) {
      if (e.user && !e.user.revert && !e.user.already) t.add(userKey(e.user));
      // a device named on its own line is ticked even when it has not synced
      // lately — somebody listed it; a user's other devices only when fresh
      for (const d of e.devices) if (d.objId && !d.avd && !d.revert && (!d.stale || d.listed) && !d.already) t.add(devKey(d));
    }
    return t;
  }
  // can a row be ticked at all
  const tickable = { user: (u) => !u.already, device: (d) => !!d.objId && !d.avd && !d.already };

  // -------------------------------------------------------------- plan --
  // test: read(); list: entries(); ticks: Set of u:/d: keys; remove: Set of
  // member ids to take out of the test groups.
  function plan(test, list, ticks, remove, region) {
    const ops = [], skipped = [], warnings = [];
    const key = `test:${region}`, who = `🧪 ${region}`;
    const T = ticks || new Set(), R = remove || new Set();
    const byKind = { user: new Map(), device: new Map() };
    for (const e of list || []) {
      if (e.user && T.has(userKey(e.user))) {
        if (e.user.already) skipped.push(`${e.user.name}: already a test member`);
        else byKind.user.set(e.user.id, e.user);
      }
      for (const d of e.devices) {
        if (!T.has(devKey(d)) || !d.objId) continue;
        if (d.avd) { skipped.push(`${d.name}: -vdi- — AVD, out of scope`); continue; }
        if (d.already) { skipped.push(`${d.name}: already a test member`); continue; }
        byKind.device.set(d.objId, d);
      }
    }
    for (const a of Object.keys(AUD)) {
      const side = test && test[a];
      const adds = [...byKind[a].values()];
      const outs = side ? side.members.filter((m) => R.has(m.id)) : [];
      if (!side || !side.name) { if (adds.length) skipped.push(`${plural(adds.length, a)}: this region has no ${a} wave in ⚙️`); continue; }
      if (!side.wave || !side.wave.exists || !side.wave.id) { if (adds.length) skipped.push(`${plural(adds.length, a)}: ${side.wave ? side.wave.name : `the ${a} wave`} does not exist yet — create it in 🌊 first`); continue; }
      if (side.dupes) { if (adds.length) skipped.push(`${plural(adds.length, a)}: ${side.dupes} groups are named ${side.name} — rename or delete the extra in Entra first`); continue; }
      let ref = side.group ? { id: side.group.id, name: side.group.name } : null;
      if (adds.length) {
        if (!ref) {
          ops.push({ type: "create", key, who, name: side.name, description: DESCRIPTION.replace("{wave}", side.wave.name) });
          ref = { ref: side.name, name: side.name };
        }
        ops.push({ type: "add", key, who, group: ref, ids: adds.map((x) => x.id || x.objId), memberKind: a,
          label: adds.map((x) => x.name).join(", "),
          objs: adds.map((x) => a === "user" ? { id: x.id, displayName: x.name, userPrincipalName: x.upn } : { id: x.objId, displayName: x.name }) });
      }
      if (ref && !side.nested && (adds.length || side.group)) {
        const size = (side.members.length - outs.length) + adds.length;
        ops.push({ type: "nest", key, who, parent: { id: side.wave.id, name: side.wave.name }, child: ref, kind: a, size });
      }
      if (outs.length) {
        ops.push({ type: "remove", key, who, group: { id: side.group.id, name: side.group.name }, ids: outs.map((m) => m.id), memberKind: a,
          label: `${outs.map((m) => m.name).join(", ")} — no longer a test member`, objs: outs.map((m) => ({ id: m.id, displayName: m.name, userPrincipalName: m.upn || undefined })) });
      }
    }
    const ex = (list || []).flatMap((e) => [e.user && T.has(userKey(e.user)) && e.user.excluded ? e.user.name : "", ...e.devices.filter((d) => T.has(devKey(d)) && d.excluded).map((d) => d.name)]).filter(Boolean);
    if (ex.length) warnings.push(`${ex.join(", ")} ${ex.length === 1 ? "is" : "are"} in the ⊘ exclusion group: in the wave as a test member, but still skipping the new policies. Take ${ex.length === 1 ? "it" : "them"} out in ⊘ to test them.`);
    const rv = (list || []).flatMap((e) => [e.user && T.has(userKey(e.user)) && e.user.revert ? e.user.name : "", ...e.devices.filter((d) => T.has(devKey(d)) && d.revert).map((d) => d.name)]).filter(Boolean);
    if (rv.length) warnings.push(`${rv.join(", ")} ${rv.length === 1 ? "is" : "are"} in ↩ Revert and ticked anyway: a test member reaches the wave through the test group, whatever Revert says.`);
    const nU = byKind.user.size, nD = byKind.device.size;
    const nOut = ops.filter((x) => x.type === "remove").reduce((n, x) => n + x.ids.length, 0);
    const title = `🧪 Test members — ${region}: ${[nU ? `+${plural(nU, "user")}` : "", nD ? `+${plural(nD, "device")}` : "", nOut ? `−${nOut}` : ""].filter(Boolean).join(" · ") || "no change"}`;
    return { ops, skipped, warnings, hasRemoval: ops.some((x) => x.type === "remove"), runKind: "testmembers", title, region };
  }

  return { SUFFIX, DESCRIPTION, names, regions, waveOf, parse, read, entries, defaultTicks, tickable, plan, userKey, devKey };
})();

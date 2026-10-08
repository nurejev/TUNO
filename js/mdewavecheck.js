// ======================================================================
// T28 — 🔎 Is this user in a wave? (build 10700). DOM-free.
//
// Mihai: "i also need a quick search verification if user is in the wave …
// these users can't use powershell. so in t28 … the best place is in the
// memberships and pilots section a search or something" — option B off the
// mockup: a search box above the countries table in 👥, the answer card
// between the box and the table. Reads only, never writes.
//
// The card: one row per object — the user and every Windows device Intune
// lists under them (or the device and its primary user) — with the wave(s)
// they are in, THROUGH which group (the static country group, a pilot or
// test group, the dynamic source still nested, a direct membership, or a
// group nested deeper), whether they are held (↩ Revert with the reason,
// ⊘ excluded) and what reaches them (the policies' answer). A verdict line
// first: in / not in / mixed (one side in and the other not, or held yet
// still in a wave).
// ======================================================================
const MdeWaveCheck = (() => {
  "use strict";
  const lc = (s) => String(s == null ? "" : s).toLowerCase();

  // How a direct group of the object relates to a wave it is in.
  // ctx: { waves (T28 wave rows), children: Map waveId → Set of child ids,
  //        dynamicIds: Set, pilotIds: Set, testSuffix, names: Map }
  function routesOf(obj, wave, ctx) {
    const direct = obj.direct || [];
    const kids = (ctx.children && ctx.children.get(wave.id)) || null;
    const out = [];
    if (direct.some((g) => g.id === wave.id)) out.push({ id: wave.id, name: wave.name, kind: "direct" });
    for (const g of direct) {
      if (g.id === wave.id) continue;
      const nested = kids ? kids.has(g.id) : null;
      if (nested === false) continue;
      const name = g.name || (ctx.names && ctx.names.get(g.id)) || g.id;
      let kind = "static";
      if (ctx.dynamicIds && ctx.dynamicIds.has(g.id)) kind = "dynamic";
      else if (ctx.testSuffix && lc(name).endsWith(lc(ctx.testSuffix))) kind = "test";
      else if (ctx.pilotIds && ctx.pilotIds.has(g.id)) kind = "pilot";
      // without the wave's children (👥 not read) a direct group is only a
      // candidate: named, not claimed
      out.push({ id: g.id, name, kind, maybe: nested === null });
    }
    if (!out.length) out.push({ id: null, name: "a group nested deeper", kind: "deeper" });
    return out;
  }
  const wavesOf = (groups, aud, ctx) => (ctx.waves || []).filter((w) => w.role === "wave" && w.audience === aud && w.id && groups && groups.has(w.id));
  const reachOf = (groups, kind, ctx) => {
    if (!ctx.model || !groups || typeof MdeExclude === "undefined") return null;
    const r = MdeExclude.reachOf(ctx.model, groups, kind);
    return { new: r.new.length, old: r.old.length, keptOutNew: r.keptOut.new.length, keptOutOld: r.keptOut.old.length, filtered: r.new.concat(r.old).some((x) => x.filtered) };
  };
  function heldOf(id, kind, groups, ctx) {
    const R = kind === "user" ? ctx.revertUsers : ctx.revertDevices;
    const rid = kind === "user" ? ctx.revertUserId : ctx.revertDeviceId;
    const xid = kind === "user" ? ctx.exUserId : ctx.exDeviceId;
    const reverted = !!((R && R.has(id)) || (rid && groups && groups.has(rid)));
    const reason = reverted && ctx.reasons ? ctx.reasons[id] || null : null;
    const excluded = !!(xid && groups && groups.has(xid));
    return { reverted, reason, excluded };
  }

  // card: MdeRevert.lookup's (user with groups + direct, devices with
  // groups + direct). ctx as above plus model, revertUsers/revertDevices
  // (Maps), revertUserId/revertDeviceId, exUserId/exDeviceId, reasons.
  function model(card, ctx) {
    const rows = [];
    const u = card.user;
    if (u) {
      const waves = u.groups ? wavesOf(u.groups, "user", ctx) : [];
      rows.push({ kind: "user", id: u.id, name: u.displayName, upn: u.upn || "", unread: !u.groups,
        waves: waves.map((w) => ({ id: w.id, name: w.name, region: w.region, through: routesOf(u, w, ctx) })),
        held: heldOf(u.id, "user", u.groups, ctx), reach: reachOf(u.groups, "user", ctx), stale: false, managed: true });
    }
    for (const d of card.devices || []) {
      const waves = d.groups ? wavesOf(d.groups, "device", ctx) : [];
      rows.push({ kind: "device", id: d.objId || "", name: d.name, upn: d.upn || "", unread: !d.groups, problem: d.problem || "", os: d.os || "", lastSync: d.lastSync || null,
        waves: waves.map((w) => ({ id: w.id, name: w.name, region: w.region, through: routesOf(d, w, ctx) })),
        held: heldOf(d.objId || "", "device", d.groups, ctx), reach: reachOf(d.groups, "device", ctx), stale: !!d.stale, managed: d.managed !== false, searched: !!d.searched });
    }
    // the verdict: the user and the live devices (a stale device is shown, not judged)
    const judged = rows.filter((r) => !r.unread && (r.kind === "user" || !r.stale));
    const inside = judged.filter((r) => r.waves.length), outside = judged.filter((r) => !r.waves.length);
    const heldIn = inside.filter((r) => r.held.reverted || r.held.excluded);
    const regions = [...new Set(inside.flatMap((r) => r.waves.map((w) => w.region)))];
    const unread = rows.filter((r) => r.unread);
    const nU = inside.filter((r) => r.kind === "user").length, nD = inside.filter((r) => r.kind === "device").length;
    const who = [nU ? "the user" : "", nD ? `${nD} device${nD === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
    let verdict;
    if (!judged.length) verdict = { kind: "unread", text: "Nothing to judge", sub: unread.length ? "the groups could not be read" : "no user and no Windows device found" };
    else if (heldIn.length) verdict = { kind: "mixed", text: `${heldIn.map((r) => r.name).join(", ")} ${heldIn.length === 1 ? "is" : "are"} held, yet still in a wave`,
      sub: heldIn.some((r) => r.held.excluded) ? "⊘ excluded means in the wave but skipping the new policies — and once ⚡③ excluded the wave from the old ones, reached by nothing" : "in ↩ Revert, but not taken out of the country group yet — finish the revert in 🔄 or ↩" };
    else if (!outside.length) {
      // "in the wave" is the groups' answer; whether a new policy reaches
      // them is the policies' (⚡ ① assigns the waves)
      const known = inside.filter((r) => r.reach), reached = known.filter((r) => r.reach.new > 0);
      const policies = !known.length ? "" : reached.length === known.length ? "the new MDE policies reach them" : !reached.length ? "no new policy includes the wave yet (⚡ Rollout actions ①)" : `the new policies reach ${reached.map((r) => r.name).join(", ")} but not ${known.filter((r) => !r.reach.new).map((r) => r.name).join(", ")} (⚡ ①)`;
      verdict = { kind: "in", text: `In the ${regions.join(" / ")} wave${inside.length > 1 ? "s" : ""}`, sub: [who, policies].filter(Boolean).join(" · ") };
    }
    else if (!inside.length) verdict = { kind: "out", text: "Not in a wave", sub: judged.some((r) => r.held.reverted) ? "held in ↩ Revert — on the old set" : judged.some((r) => r.held.excluded) ? "⊘ excluded and in no wave — on the old set" : "on the old set — the waves do not reach them" };
    else verdict = { kind: "mixed", text: `${inside.map((r) => r.name).join(", ")} in the ${regions.join(" / ")} wave, ${outside.map((r) => r.name).join(", ")} not`,
      sub: inside.some((r) => r.kind === "device") && outside.some((r) => r.kind === "user") ? "a mix: the new - D - policies on the device, the old - U - policies on the user" : "a mix: the new - U - policies on the user, the old - D - policies on the device" };
    if (unread.length && verdict.kind !== "unread") verdict.sub += ` · ${unread.map((r) => r.name).join(", ")}: groups not read`;
    return { rows, verdict, regions, readAt: card.readAt || Date.now() };
  }

  // A pasted query that is an exact UPN or device name picks that hit
  // without a click; one hit picks itself.
  function autoPick(results, q) {
    const t = lc(q).trim();
    if (!results || !results.length) return null;
    if (results.length === 1) return results[0];
    const exact = results.find((h) => (h.type === "user" && (lc(h.upn) === t || lc(h.mail) === t)) || (h.type === "device" && lc(h.name) === t));
    return exact || null;
  }

  return { model, routesOf, autoPick };
})();

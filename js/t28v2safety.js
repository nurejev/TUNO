// T28 V2 preflight helpers. No writes; failed reads keep Apply locked.
const T28V2Safety = (() => {
  "use strict";
  const lc = (s) => String(s || "").toLowerCase();
  const keyOf = (op) => (op.type === "add" || op.type === "remove")
    ? { id: op.group && op.group.id, kind: op.memberKind === "user" ? "user" : "device" }
    : (op.type === "nest" || op.type === "unnest") ? { id: op.parent && op.parent.id, kind: "group" } : null;
  async function capture(ops) {
    const targets = new Map();
    for (const op of ops || []) {
      const t = keyOf(op);
      // Newly created groups have no current membership to back up.
      if (t && t.id) targets.set(`${lc(t.id)}|${t.kind}`, t);
    }
    const snapshot = [];
    for (const t of targets.values()) {
      const rows = await Graph.readAll(`/groups/${encodeURIComponent(t.id)}/members/microsoft.graph.${t.kind}?$select=id&$top=999`, { scopes: Graph.SCOPES.groups, retry: true });
      if (!Array.isArray(rows)) throw new Error("Incomplete group membership read.");
      snapshot.push({ id: lc(t.id), kind: t.kind, members: [...new Set(rows.map((r) => lc(r.id)))].sort() });
    }
    return snapshot.sort((a, b) => `${a.id}|${a.kind}`.localeCompare(`${b.id}|${b.kind}`));
  }
  async function unchanged(snapshot) {
    if (!Array.isArray(snapshot)) return false;
    const ops = snapshot.map((s) => s.kind === "group" ? { type: "nest", parent: { id: s.id } } : { type: "add", group: { id: s.id }, memberKind: s.kind });
    return JSON.stringify(await capture(ops)) === JSON.stringify(snapshot);
  }
  function verifiedOps(result) {
    // done may include partial or uncertain writes. Do not advertise those
    // as confirmed membership or offer blind inverse operations for them.
    const idOf = (g) => lc(g && (g.id || (result.created && result.created.get(lc(g.ref))) || g.name || g.ref));
    return (result.done || []).filter((d) => (result.results || []).some((r) => {
      if (!r.ok || !r.verified || !r.op || r.op.type !== d.type) return false;
      const o = r.op;
      if (d.type === "create") return lc(o.name) === lc(d.name);
      // 10702: a rename and a deletion are whole steps on one group
      if (d.type === "rename" || d.type === "deletegroup") return lc(o.key) === lc(d.key) && idOf(o.group) === idOf(d.group);
      if (d.type === "add" || d.type === "remove") return lc(o.key) === lc(d.key) && idOf(o.group) === idOf(d.group) && (d.ids || []).every((id) => (o.ids || []).some((x) => lc(id) === lc(x)));
      return lc(o.key) === lc(d.key) && idOf(o.parent) === idOf(d.parent) && idOf(o.child) === idOf(d.child);
    }));
  }
  function actualOps(result, snapshot) {
    return (result.done || []).flatMap((d) => {
      if (d.type === "create" || d.type === "rename" || d.type === "deletegroup") return [d];
      const t = keyOf(d);
      const before = (snapshot || []).find((s) => t && s.id === lc(t.id) && s.kind === t.kind);
      const old = new Set(before ? before.members : []);
      if (d.type === "add" || d.type === "remove") {
        const ids = (d.ids || []).filter((id) => d.type === "add" ? !old.has(lc(id)) : old.has(lc(id)));
        return ids.length ? [Object.assign({}, d, { ids, objs: d.objs && d.objs.filter((o) => ids.some((id) => lc(id) === lc(o.id))) })] : [];
      }
      const existed = old.has(lc(d.child && d.child.id));
      return (d.type === "nest" ? !existed : existed) ? [d] : [];
    });
  }
  function validateBundle(data, tenantId) {
    if (!data || data.schema !== "tuno.t28.v2.run-bundle/1" || !Array.isArray(data.runs) || data.runs.length > 1000) throw new Error("Unsupported run file.");
    if (lc(data.tenantId) !== lc(tenantId)) throw new Error("This run file belongs to another tenant.");
    for (const r of data.runs) if (!r || typeof r.title !== "string" || typeof r.kind !== "string" || !Array.isArray(r.lines) || !r.lines.every((s) => typeof s === "string")) throw new Error("Invalid run record.");
    return true;
  }
  return { capture, unchanged, actualOps, verifiedOps, validateBundle };
})();

// T28 — THE PROJECT'S STATE IN THE TENANT (build 10715, Phase 1.3 of the
// 15 Oct rebuild plan, state home 2: "intent + journal → a Graph open
// extension on an anchor group"; Mihai's 12 Oct pick, and the plan's D3
// recommendation of a dedicated anchor group).
//
// What the project DECIDED while it ran — the batched and migrated pilots,
// a retired ⊘ pair, the hold-back reasons, the 🔄 sync stamps, the ✓ list
// of the revert pane, the 🧩 Edge list and the names given by hand, the
// project's history line — lived in one browser's localStorage, so a
// second browser saw none of it. It now lives in the tenant as an open
// extension `nl.limonit.tuno.t28` on the anchor group (default
// INT-SG-TUNO-T28-State, created with ⚡ ⓪ like the project's other
// groups): read at every open, written after every change, the browser
// keeps its copy as the cache. The existing code keeps reading
// localStorage; this module mirrors the keys both ways.
//
// The extension holds one property `state` (the JSON), `at` (ISO), `by`
// (who) and `v`. Graph caps an open extension's size (a few hundred KB);
// the state is a few KB.
//
// DOM-free. Browser globals: Graph. Tests: tests/mderollout/state.test.js.
const T28State = (() => {
  "use strict";
  const EXT = "nl.limonit.tuno.t28";
  const lc = (s) => String(s || "").toLowerCase();
  const enc = encodeURIComponent;
  const msg = (e) => String((e && e.message) || e || "");
  const GS = () => Graph.SCOPES.groups;
  const WS = () => (typeof GroupMigrate !== "undefined" && GroupMigrate.SCOPES && GroupMigrate.SCOPES.groupWrite) || ["Group.ReadWrite.All"];

  // the browser keys mirrored, per tenant key — name → localStorage key
  function keysFor(tenantKey) {
    const t = lc(tenantKey || "default");
    return {
      rules: `tuno.t28.v2.rules.${t}`,            // only the STATE part of it (see RULE_STATE)
      groupsync: `tuno.t28.groupsync.${t}`,
      reasons: `tuno.t28.revert.reasons.${t}`,
      revertList: `tuno.t28.revert.list.${t}`,
      edgeList: `tuno.t28.edgeext.list.${t}`,
      edgeNames: `tuno.t28.edgeext.names.${t}`,
      history: `tuno.t28.project.history.${t}`,
    };
  }
  // the keys of the rules blob that are state, not rules (10714 STATE_KEYS)
  const RULE_STATE = ["fixWith", "pilotGroupsOff", "exclusionDevice", "exclusionUser"];
  const RULE_MEMBER_STATE = ["batched", "migrated"];

  const readLS = (k) => { try { const r = window.localStorage.getItem(k); return r == null ? null : JSON.parse(r); } catch { return null; } };
  const writeLS = (k, v) => { try { if (v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

  // ----------------------------------------------------------- collect --
  // The state as this browser holds it: { v: 1, rulesState, members,
  // groupsync, reasons, revertList, edgeList, edgeNames, history }.
  function collect(tenantKey) {
    const K = keysFor(tenantKey);
    const rules = readLS(K.rules) || {};
    const rulesState = {};
    for (const k of RULE_STATE) if (rules[k] !== undefined) rulesState[k] = rules[k];
    const members = {};
    for (const k of RULE_MEMBER_STATE) if (rules.members && rules.members[k] !== undefined) members[k] = rules.members[k];
    return { v: 1, rulesState, members, groupsync: readLS(K.groupsync), reasons: readLS(K.reasons), revertList: readLS(K.revertList), edgeList: readLS(K.edgeList), edgeNames: readLS(K.edgeNames), history: readLS(K.history) };
  }
  // the same, as the string that goes into the extension
  const serialize = (st) => JSON.stringify(st);
  // what was written vs what is here now — true when the tenant's copy
  // says exactly what this browser would write
  const same = (a, b) => serialize(a || {}) === serialize(b || {});

  // ------------------------------------------------------------- apply --
  // Write the tenant's state into this browser's keys so every pane reads
  // it as it always did. Returns the keys that changed.
  function apply(tenantKey, st) {
    if (!st || typeof st !== "object") return [];
    const K = keysFor(tenantKey), changed = [];
    const rules = readLS(K.rules) || {};
    let rulesChanged = false;
    for (const k of RULE_STATE) if (st.rulesState && st.rulesState[k] !== undefined && JSON.stringify(rules[k]) !== JSON.stringify(st.rulesState[k])) { rules[k] = st.rulesState[k]; rulesChanged = true; }
    if (st.members) { rules.members = rules.members || {}; for (const k of RULE_MEMBER_STATE) if (st.members[k] !== undefined && JSON.stringify(rules.members[k]) !== JSON.stringify(st.members[k])) { rules.members[k] = st.members[k]; rulesChanged = true; } }
    if (rulesChanged) { writeLS(K.rules, rules); changed.push("rules"); }
    for (const [name, key] of [["groupsync", K.groupsync], ["reasons", K.reasons], ["revertList", K.revertList], ["edgeList", K.edgeList], ["edgeNames", K.edgeNames], ["history", K.history]]) {
      if (st[name] === undefined) continue;
      if (JSON.stringify(readLS(key)) !== JSON.stringify(st[name])) { writeLS(key, st[name]); changed.push(name); }
    }
    return changed;
  }

  // -------------------------------------------------------------- read --
  // { found: false } when the group has no extension yet; else { found,
  // state, at, by, v }; throws on a failed read (an unread state is never
  // an empty one — the caller keeps the browser's copy and says so).
  async function read(groupId) {
    let r;
    try { r = await Graph.get(`/groups/${enc(groupId)}/extensions/${EXT}`, { scopes: GS(), retry: true }); }
    catch (e) {
      if (e && (e.kind === "notfound" || e.status === 404)) return { found: false, state: null, at: "", by: "", v: 0 };
      throw e;
    }
    if (!r) return { found: false, state: null, at: "", by: "", v: 0 };
    let state = null;
    try { state = r.state ? JSON.parse(r.state) : null; } catch { throw new Error("the project state in the tenant is not readable JSON — nothing applied"); }
    return { found: true, state, at: String(r.at || ""), by: String(r.by || ""), v: Number(r.v) || 0 };
  }

  // ------------------------------------------------------------- write --
  // POST when the extension does not exist, PATCH when it does. Returns
  // { at, by, created }.
  async function write(groupId, st, who, exists) {
    const at = new Date().toISOString();
    const body = { state: serialize(st), at, by: String(who || ""), v: 1 };
    if (exists) await Graph.patch(`/groups/${enc(groupId)}/extensions/${EXT}`, body, { scopes: WS() });
    else await Graph.post(`/groups/${enc(groupId)}/extensions`, Object.assign({ "@odata.type": "microsoft.graph.openTypeExtension", extensionName: EXT }, body), { scopes: WS() });
    return { at, by: body.by, created: !exists };
  }

  // one line for the ⚙️ card and the reading strip
  function line(st) {
    if (!st) return "";
    const n = (x) => (Array.isArray(x) ? x.length : x && typeof x === "object" ? Object.keys(x).length : 0);
    const parts = [];
    if (st.members && n(st.members.batched)) parts.push(`${n(st.members.batched)} batched`);
    if (st.members && n(st.members.migrated)) parts.push(`${n(st.members.migrated)} migrated`);
    if (st.rulesState && st.rulesState.exclusionDevice === "" && st.rulesState.exclusionUser === "") parts.push("⊘ retired");
    if (n(st.reasons)) parts.push(`${n(st.reasons)} hold-back reasons`);
    if (n(st.groupsync)) parts.push(`${n(st.groupsync)} sync stamps`);
    if (n(st.edgeList)) parts.push(`Edge list of ${n(st.edgeList)}`);
    if (n(st.history)) parts.push(`${n(st.history)} history entries`);
    return parts.join(" · ") || "nothing decided yet";
  }

  return { EXT, keysFor, RULE_STATE, RULE_MEMBER_STATE, collect, apply, read, write, same, serialize, line };
})();

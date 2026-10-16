// T28 — THE PLAN CONTRACT (build 10721, Phase 2.1 of the 15 Oct rebuild
// plan). Every write T28 makes goes through the same path:
//
//   build → dry run → backup → confirm → apply → verify → journal
//
// This module is the apply half of that path, pulled out of the controller
// so it exists ONCE: the backup check, the hold-back re-read and guard, the
// write, the read-back, and the run record. Before this it lived inline in
// applyMem (the members engine), and the other engines each had their own
// copy of parts of it. The controller still owns the screen: the plan
// panel, the gates, the ledger element, and what each pane does with a
// finished run. The build half (the planOps / planX functions) and the dry
// run (guardHeld, the read ledger) stay where they are and are wired into
// this contract in the Phase 2 builds that follow.
//
// run(plan, deps) → { r, ops, createdGroups, actualDone, verifiedDone,
// uncertain, okN, preSkipped, stopped } or throws before anything is
// written (the error text is what the operator sees). deps carries the
// callbacks the controller already has — nothing here reads the DOM.
//
// DOM-free. Browser globals used only through deps: Graph, GroupMigrate,
// T28V2Safety, MdeMembers, MdeRevert. Tests: tests/mderollout/plan.test.js.
const T28Plan = (() => {
  "use strict";
  const lc = (s) => String(s || "").toLowerCase();
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
  const shortErr = (e, n) => String((e && e.message) || e || "").slice(0, n);

  // ---------------------------------------------------- the contract --
  // deps:
  //   ensureScopes(scopes)        – Graph.ensureScopes
  //   writeScopes                 – GroupMigrate.SCOPES.groupWrite
  //   backup                      – the snapshot taken at ③ (null → refused)
  //   unchanged(backup)           – T28V2Safety.unchanged
  //   stillCurrent()              – the controller says the plan on screen is this one and the gates hold
  //   holdBackGroups()            – the ⏸ (and ⊘) groups to re-read
  //   readHoldNow(groups)         – MdeRevert.readHoldNow
  //   guardCtx(plan)              – holdGuardCtx(plan)
  //   guardHeld(ops, ctx)         – MdeRevert.guardHeld
  //   readMe()                    – MdeRollout.readMe (owner of a created group)
  //   ledger(plan)                – RunLedger.create(...) for the screen, or null
  //   applyOps(ops, opts)         – MdeMembers.applyOps
  //   actualOps(r, backup)        – T28V2Safety.actualOps
  //   verifiedOps(r)              – T28V2Safety.verifiedOps
  async function run(plan, deps) {
    const p = plan;
    if (!p || !Array.isArray(p.ops)) throw new Error("No plan to apply.");
    await deps.ensureScopes(deps.writeScopes);
    // ③ the backup must be there and the targets unchanged since it was taken
    if (!deps.backup || !await deps.unchanged(deps.backup)) throw new Error("Group membership changed after the backup. Discard this plan, read again and make a new plan.");
    if (deps.stillCurrent && !deps.stillCurrent()) throw new Error("Plan context changed. Make a fresh plan.");
    // the hold-back read AGAIN right before writing (10712, R3)
    const preSkipped = [];
    let ops = p.ops;
    if (!p.allowAll && p.runKind !== "revert" && ops.some((x) => x.type === "add" && (x.ids || []).length)) {
      let now;
      try { now = await deps.readHoldNow(deps.holdBackGroups()); }
      catch (e) { throw new Error(`The hold-back could not be read right before writing (${shortErr(e, 160)}) — nothing was written. ↻ Read again and make a new plan.`); }
      const ctx = deps.guardCtx(p);
      const before = new Set([...ctx.users].map((id) => `user|${id}`).concat([...ctx.devices].map((id) => `device|${id}`)));
      now.users.forEach((id) => ctx.users.add(id)); now.devices.forEach((id) => ctx.devices.add(id));
      const nameOf0 = ctx.nameOf; ctx.nameOf = (k, id) => nameOf0(k, id) || (now.names && now.names.get(`${k}|${lc(id)}`)) || "";
      ctx.unread = "";
      const g = deps.guardHeld(ops, ctx);
      if (g.refused) throw new Error(g.refused);
      const fresh = [...now.users].filter((id) => !before.has(`user|${id}`)).length + [...now.devices].filter((id) => !before.has(`device|${id}`)).length;
      if (g.stripped.users + g.stripped.devices) {
        ops = g.ops;
        preSkipped.push(`⏸ ${plural(g.stripped.users + g.stripped.devices, "member")} held back since the read — left out: ${g.skipped.slice(0, 5).join("; ")}${g.skipped.length > 5 ? " …" : ""}`);
        if (fresh) preSkipped.push(`⏸ the hold-back grew by ${plural(fresh, "member")} after the 👥 read`);
        if (!ops.length) throw new Error("Everyone this plan would add is held back now — nothing to write. ↻ Read again.");
      }
    }
    p.ops = ops;
    // ④ apply — the owner for a created group, the ledger for the screen
    let me = null;
    if (ops.some((x) => x.type === "create")) { try { me = await deps.readMe(); } catch { me = null; } }
    const L = deps.ledger ? deps.ledger(p) : null;
    const r = await deps.applyOps(ops, { ledger: L, me });
    if (L && L.finish) L.finish();
    const ledgerStopped = !!(L && L.stopped);
    // ⑤ verify — what actually happened vs the backup, and what read back clean
    const createdGroups = [...r.created.entries()].map(([name, id]) => ({ id, displayName: (ops.find((x) => x.type === "create" && lc(x.name) === name) || { name }).name }));
    const actualDone = deps.actualOps(r, deps.backup);
    const verifiedDone = deps.verifiedOps(Object.assign({}, r, { done: actualDone }));
    const uncertain = actualDone.length !== verifiedDone.length;
    const okN = r.results.filter((x) => x.ok && x.verified).length;
    return { r, ops, createdGroups, actualDone, verifiedDone, uncertain, okN, preSkipped, stopped: r.stopped || "", ledgerStopped };
  }

  // ----------------------------------------------------- the record --
  // The run as 📜 and T28Runs keep it. opWord / opLabel come from the
  // controller (they know the wording of each op kind); extra holds the
  // pane-specific fields (region, reason, migrate, pilots, exclusions).
  function record(plan, out, words, extra) {
    const { r, verifiedDone, actualDone, okN, preSkipped } = out;
    const { opWord, opLabel, backupOf } = words;
    const lines = r.results.map((x) => `${opWord(x.op)} · ${opLabel(x.op)}${x.op.who ? ` (${x.op.who})` : ""}: ${x.ok ? (x.verified ? "done · verified" : "done · NOT verified") : (x.skipped ? "skipped" : "failed — " + (x.note || ""))}`).concat(preSkipped);
    return Object.assign({
      at: Date.now(), title: plan.title, kind: "members", runKind: plan.runKind || null,
      ok: okN, bad: r.results.length - okN, stopped: out.ledgerStopped || !!r.stopped,
      backup: backupOf ? backupOf() : { policies: [] },
      done: verifiedDone, uncertainDone: actualDone.filter((x) => !verifiedDone.includes(x)),
      ops: plan.ops, lines,
    }, extra || {});
  }

  // ------------------------------------------------------- resume --
  // From a saved run that stopped: the ops not done (and not verified),
  // as a new plan — the same title with "Resume:", the same kind, run
  // through the whole contract again (dry run, a NEW backup, confirm). The
  // targets are read again by the backup, and the apply refuses if they
  // changed meanwhile, so a resume never trusts the saved plan blindly.
  function resume(run) {
    if (!run || !Array.isArray(run.ops) || !run.ops.length) return null;
    const doneKeys = new Set((run.done || []).map(opKey));
    const left = run.ops.filter((op) => !doneKeys.has(opKey(op)));
    if (!left.length) return null;
    return { ops: left, skipped: [], warnings: [], inPlace: [], hasRemoval: left.some((o) => o.type === "remove" || o.type === "unnest"), runKind: run.runKind || null,
      title: `Resume: ${run.title}`, resumeOf: run.id || null,
      confirmLine: `resume the run from step ${run.ops.length - left.length + 1} of ${run.ops.length}: ${plural(left.length, "step")} still to write`,
      members: true };
  }
  // one op's identity: kind + target + members — stable across a save
  function opKey(op) {
    if (!op) return "";
    if (op.type === "create") return `create|${lc(op.name)}`;
    if (op.type === "rename") return `rename|${lc(op.group && op.group.id)}|${lc(op.to)}`;
    if (op.type === "nest" || op.type === "unnest") return `${op.type}|${lc(op.parent && op.parent.id)}|${lc((op.child && (op.child.id || op.child.ref)) || "")}`;
    if (op.type === "deletegroup") return `deletegroup|${lc(op.group && op.group.id)}`;
    return `${op.type}|${lc(op.group && (op.group.id || op.group.ref))}|${op.memberKind || "device"}|${(op.ids || []).map(lc).sort().join(",")}`;
  }

  return { run, record, resume, opKey };
})();

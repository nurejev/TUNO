// T28 — THE WAVE SPINE (build 10726, Phase 3.1 of the 15 Oct rebuild plan;
// Mihai, 16 Oct: wave chips on top (A), a stage opens today's pane (A)).
//
// One wave at a time. Five stages, each lit from what the tenant holds —
// never from what was clicked — and the one thing to do next, computed:
//
//   1 Set up      the wave groups, the project's groups, the test groups
//   2 Members     every country of the wave filled and nested
//   3 Assign      the new policies include the wave, the old ones exclude it
//   4 Verify      what the wave's devices report (📡 Landing)
//   5 Exceptions  who is held back, pinned, skipped
//
// This module is the model: stages(input) → the five stages with state
// (ok · todo · wait · unknown), a one-line detail, the next step and the
// pane it opens. The controller renders it and feeds it what it already
// has (waveRows, the members model, the rollout wants, the landing model,
// the hold-back). DOM-free. Tests: tests/mderollout/spine.test.js.
const T28Spine = (() => {
  "use strict";
  const STAGES = [
    { id: "setup", n: 1, label: "Set up", pane: "waves" },
    { id: "members", n: 2, label: "Members", pane: "members" },
    { id: "assign", n: 3, label: "Assign", pane: "waves" },
    { id: "verify", n: 4, label: "Verify", pane: "landing" },
    { id: "exceptions", n: 5, label: "Exceptions", pane: "revert" },
  ];
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

  // input (every field optional — an unread part reads as unknown):
  //   region            the wave's region name
  //   waves             { user: { exists }, device: { exists } } for this region
  //   tests             { user: { exists, nested }, device: { exists, nested } } | null (not read)
  //   project           { holdBack: bool, state: bool }     the ⏸ pair and the anchor group exist
  //   rows              the members model rows of this region: { country, ugNested, dgNested, uInSync, inSync, unread, pilot, batched, migrated, uWant, want }
  //   membersRead       bool
  //   assign            { include: n, excludeOld: n, filter: n } steps the ⚡ card would plan for this wave (0 = in place), or null when unread
  //   landing           { devices, ok, problems, read: bool } for this wave, or null
  //   held              { users, devices } held back in this wave; pinned, skipped counts; or null
  function stages(input) {
    const I = input || {};
    const out = STAGES.map((s) => Object.assign({}, s, { state: "unknown", detail: "", next: null }));
    const by = Object.fromEntries(out.map((s) => [s.id, s]));

    // 1 · Set up
    {
      const w = I.waves || {};
      const missing = [];
      if (!(w.user && w.user.exists)) missing.push("user wave");
      if (!(w.device && w.device.exists)) missing.push("device wave");
      const P = I.project || {};
      if (P.holdBack === false) missing.push("hold-back pair");
      if (P.state === false) missing.push("state group");
      const T = I.tests;
      const testMissing = T ? ["user", "device"].filter((k) => !(T[k] && T[k].exists && T[k].nested)) : [];
      const s = by.setup;
      if (!I.waves) { s.state = "unknown"; s.detail = "the wave groups were not read"; }
      else if (missing.length) { s.state = "todo"; s.detail = `${missing.join(", ")} to create`; s.next = { text: `Create the ${missing.length === 1 ? missing[0] : plural(missing.length, "group")} for ${I.region} (🌊 / ⚡ ⓪)`, pane: "waves" }; }
      else if (T && testMissing.length) { s.state = "todo"; s.detail = `${plural(testMissing.length, "test group")} to create or nest`; s.next = { text: `Create and nest the ${I.region} test groups (⚡ ⓪)`, pane: "waves" }; }
      else { s.state = "ok"; s.detail = T ? "groups in place, test groups nested" : "groups in place"; }
    }
    // 2 · Members
    {
      const s = by.members, rows = I.rows || [];
      if (!I.membersRead) { s.state = "unknown"; s.detail = "the members were not read"; }
      else if (!rows.length) { s.state = "ok"; s.detail = "no countries in this wave"; }
      else {
        const unread = rows.filter((r) => r.unread);
        const done = rows.filter((r) => r.ugNested && r.dgNested && r.uInSync !== false && r.inSync !== false && !r.unread);
        const batched = rows.filter((r) => r.batched && !r.migrated);
        const open = rows.filter((r) => !done.includes(r) && !batched.includes(r) && !unread.includes(r));
        if (unread.length) { s.state = "unknown"; s.detail = `${plural(unread.length, "country", "countries")} not read — ↻ Read again`; s.next = { text: `Read the members again: ${unread.map((r) => r.country).join(", ")} did not read`, pane: "members" }; }
        else if (open.length) { s.state = "todo"; s.detail = `${done.length} of ${rows.length} countries nested${batched.length ? ` · ${plural(batched.length, "pilot")} in batches` : ""}`; s.next = { text: `Fill and nest ${open.map((r) => r.country).join(", ")} (👥)`, pane: "members" }; }
        else if (batched.length) { s.state = "todo"; s.detail = `${done.length} of ${rows.length} nested · ${batched.map((r) => r.country).join(", ")} in batches`; s.next = { text: `Run the next batch of ${batched.map((r) => r.country).join(", ")} (👥)`, pane: "members" }; }
        else { s.state = "ok"; s.detail = `${rows.length} of ${rows.length} countries nested and in sync`; }
      }
    }
    // 3 · Assign
    {
      const s = by.assign, A = I.assign;
      if (!A) { s.state = "unknown"; s.detail = "the policies were not read"; }
      else {
        const parts = [];
        if (A.include) parts.push(`${plural(A.include, "new policy", "new policies")} still without the wave`);
        if (A.excludeOld) parts.push(`${plural(A.excludeOld, "old policy", "old policies")} still reaching it`);
        if (A.filter) parts.push(`the W365/AVD filter on ${plural(A.filter, "assignment")}`);
        if (!parts.length) { s.state = "ok"; s.detail = "every new policy includes the wave, the old ones exclude it"; }
        else {
          s.state = by.members.state === "ok" ? "todo" : "wait";
          s.detail = parts.join(" · ");
          s.next = { text: A.include ? `Include the ${I.region} waves in the ${plural(A.include, "new policy", "new policies")} not yet assigned to them (⚡ ①)` : A.excludeOld ? `Exclude the ${I.region} waves from the ${plural(A.excludeOld, "old policy", "old policies")} (⚡ ③)` : `Set the W365/AVD filter on the ${I.region} wave assignments (⚡ ④)`, pane: "waves" };
        }
      }
    }
    // 4 · Verify
    {
      const s = by.verify, L = I.landing;
      if (!L || !L.read) { s.state = by.assign.state === "ok" ? "todo" : "wait"; s.detail = by.assign.state === "ok" ? "not read yet" : "after assign"; if (by.assign.state === "ok") s.next = { text: `Read what the ${I.region} devices report (📡)`, pane: "landing" }; }
      else if (L.problems) { s.state = "todo"; s.detail = `${plural(L.problems, "device")} with errors or conflicts of ${L.devices}`; s.next = { text: `Look at the ${plural(L.problems, "device")} that report a problem (📡)`, pane: "landing" }; }
      else if (!L.devices) { s.state = "wait"; s.detail = "no device has reported yet"; }
      else { s.state = "ok"; s.detail = `${L.ok} of ${L.devices} devices report clean`; }
    }
    // 5 · Exceptions
    {
      const s = by.exceptions, H = I.held;
      if (!H) { s.state = "unknown"; s.detail = "the hold-back was not read"; }
      else {
        const n = (H.users || 0) + (H.devices || 0);
        const extra = [H.pinned ? plural(H.pinned, "pin") : "", H.skipped ? `${H.skipped} skipped` : ""].filter(Boolean).join(" · ");
        s.state = "ok";
        s.detail = n ? `${plural(n, "member")} held back${extra ? ` · ${extra}` : ""}` : `nobody held back${extra ? ` · ${extra}` : ""}`;
      }
    }
    // the one thing to do next: the first stage that has something to do
    const current = out.find((s) => s.state === "todo") || out.find((s) => s.state === "unknown" && s.next) || null;
    const next = current ? current.next : null;
    const done = out.every((s) => s.state === "ok");
    return { stages: out, current: current ? current.id : null, next: next || (done ? { text: `${I.region} is complete — every stage is in place`, pane: null } : null), done };
  }

  return { STAGES, stages };
})();

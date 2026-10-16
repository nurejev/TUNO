// T28 — THE FAULT SWITCH (build 10724, Phase 2.4 of the 15 Oct rebuild
// plan). Lab and devcf only — Mihai, 16 Oct: "lab and devcf only".
//
// Some of T28's safety only shows when Graph misbehaves: a 429 the tenant
// never lifts (10710 waits and stops), a 503 on a write, a group read that
// fails (10709 plans nothing for that row). A lab cannot make Graph do that
// on demand. The fault switch arms the NEXT matching call to answer with a
// chosen fault, once, so an engineer on the lab can press "next list read
// answers 429", do the normal action and watch T28 behave as designed —
// and so the devcf tests of those builds stop needing the browser console.
//
// It exists only on a LAB instance: the devcf tenant, or a project file
// (t28-project.json) that says `lab: true`. Anywhere else allowed() is
// false, install() does nothing, no panel is rendered, and the code path is
// inert — nothing on PVM's tenant or instance can make T28 lie about what
// Graph said, by accident or on purpose.
//
// DOM-free. Wraps the exported Graph.readAll / patch / post / del when
// installed; the wrapper calls through untouched unless a matching fault
// is armed. Tests: tests/mderollout/fault.test.js.
const T28Fault = (() => {
  "use strict";
  const LAB_TENANTS = ["020eb2d3-8046-4257-828d-64bf3ece8fbb"];   // devcf (CloudFellows.dev)
  const lc = (s) => String(s || "").toLowerCase();
  const state = { armed: null, fired: [], installed: false, allowed: false };
  //   armed: null | { kind: "read429" | "write503" | "groupread", times: n, group: { id, name } | null, at }
  //   fired: the last faults delivered (what, url, when) — shown in the panel and said in 📜 lines

  function allowed(ctx) {
    const tid = lc(ctx && ctx.tenantId);
    if (tid && LAB_TENANTS.includes(tid)) return true;
    if (ctx && ctx.projectFile && ctx.projectFile.lab === true) return true;
    return false;
  }

  // arm a fault for the next matching calls; times = how many calls answer with it
  function arm(kind, times, group) {
    if (!state.allowed) return null;
    if (!["read429", "write503", "groupread"].includes(kind)) return null;
    state.armed = { kind, times: Math.max(1, Math.min(10, Number(times) || 1)), group: group && group.id ? { id: lc(group.id), name: group.name || "" } : null, at: Date.now() };
    return state.armed;
  }
  function clear() { state.armed = null; }
  const status = () => ({ allowed: state.allowed, installed: state.installed, armed: state.armed ? Object.assign({}, state.armed) : null, fired: state.fired.slice(-5) });

  const fault = (kind, url) => {
    const e = new Error(kind === "write503" ? "Service Unavailable (503) — the fault switch" : kind === "read429" ? "The tenant is throttling this request (429) — the fault switch" : "The group read failed (503) — the fault switch");
    e.kind = kind === "read429" ? "throttled" : kind === "write503" ? "throttled" : "graph";
    e.status = kind === "read429" ? 429 : 503;
    if (kind !== "groupread") e.retryAfter = "1";
    e.fault = kind;
    state.fired.push({ kind, url: String(url).slice(0, 140), at: Date.now() });
    if (state.fired.length > 20) state.fired.shift();
    return e;
  };
  // does this call match the armed fault? consumes one of its times when it does
  function take(what, url) {
    const a = state.armed;
    if (!a) return null;
    const u = String(url);
    let hit = false;
    if (a.kind === "read429" && what === "read") hit = true;
    else if (a.kind === "write503" && what === "write") hit = true;
    else if (a.kind === "groupread" && what === "read" && a.group && u.toLowerCase().includes(`/groups/${a.group.id}/`) && /members/i.test(u)) hit = true;
    if (!hit) return null;
    a.times--;
    if (a.times <= 0) state.armed = null;
    return fault(a.kind, u);
  }

  // install the wrappers around Graph (once); harmless to call when not allowed
  function install(Graph, ctx) {
    state.allowed = allowed(ctx);
    if (!state.allowed || state.installed || !Graph) return false;
    const real = { readAll: Graph.readAll, patch: Graph.patch, post: Graph.post, del: Graph.del };
    Graph.readAll = async function (path, opts) { const f = take("read", path); if (f) throw f; return real.readAll.call(Graph, path, opts); };
    Graph.patch = async function (path, body, opts) { const f = take("write", path); if (f) throw f; return real.patch.call(Graph, path, body, opts); };
    Graph.post = async function (path, body, opts) { const f = take("write", path); if (f) throw f; return real.post.call(Graph, path, body, opts); };
    Graph.del = async function (path, opts) { const f = take("write", path); if (f) throw f; return real.del.call(Graph, path, opts); };
    state.installed = true;
    return true;
  }
  // the kinds, for the panel
  const KINDS = [
    { kind: "read429", label: "Next list read answers 429", what: "the next list T28 reads is throttled once — the read waits and retries (10710) or, on a members read, the row says not read (10709)" },
    { kind: "write503", label: "Next member writes answer 503, six times", what: "the next six member writes are refused — the run waits 1 s between them, then stops where it is with the rest unsent; 📜 offers ↷ Resume (10723)", times: 6 },
    { kind: "groupread", label: "Next read of a chosen group fails", what: "the next member read of that group fails — its row plans nothing and the dry run names it (10709)" },
  ];

  return { LAB_TENANTS, KINDS, allowed, install, arm, clear, status, _state: state };
})();

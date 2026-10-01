// ======================================================================
// RunMeta — the descriptor a result is BOUND to. After ENCA's
// js/runmeta.js (its build 25412), ported at TUNO build 10671 for Home's
// Your checks (TUNO–ENCA parity slice 10).
//
// ENCA's rule, kept: a result is published together with the descriptor of
// the run that made it — tenant, completeness, run number, time — and
// anything that shows the result later reads the descriptor, never the live
// form and never the current tenant. Home's Your checks shows each
// on-demand tool's last result this way: "8 Windows devices · 3 with
// findings", read at 09:06, complete — or "Not run this session".
//
// TUNO DIFFERENCES, all on purpose:
//   * A REGISTRY. ENCA's tools live in one app.js and keep their own
//     descriptors in variables the overview reads; TUNO's are separate
//     modules, so a tool PUBLISHES its headline here when its read lands
//     (publish), and Home asks for it (last) and is told when one arrives
//     (on).
//   * No policy states in the descriptor: ENCA's results hang off one
//     Conditional Access snapshot; TUNO's on-demand tools read devices,
//     scores and directory objects of their own. The tenant is the binding:
//     a result from another tenant (or the demo) is stale, never shown as
//     this one's.
//   * Session-scoped: sign-out clears it (js/app.js), as it clears the
//     shared policy cache.
// Rewritten without optional chaining (TUNO's house rule).
// ======================================================================
const RunMeta = (() => {
  "use strict";
  let seq = 0;
  const runs = new Map();          // tool id → { meta, headline, data }
  const listeners = new Set();

  // The tenant this session is about — window.TunoTenant and the demo flag,
  // the same source the workspace shell reads.
  function context() {
    const t = typeof window !== "undefined" ? window.TunoTenant : null;
    let tenantId = "", tenantName = "";
    try { tenantId = (t && t.tenantId && t.tenantId()) || ""; tenantName = (t && t.name && t.name()) || ""; } catch { /* not signed in */ }
    const isDemo = typeof document !== "undefined" && !!document.body && document.body.classList.contains("demo-mode");
    return { tenantId, tenantName, isDemo };
  }

  // ctx = { tool, completeness: "complete" | "partial" | "failed", at? }
  function of(ctx) {
    const c = ctx || {}, here = context();
    return {
      id: (++seq).toString(16).padStart(3, "0"),
      tool: c.tool || "",
      tenantId: c.tenantId != null ? c.tenantId : here.tenantId,
      tenantName: c.tenantName != null ? c.tenantName : here.tenantName,
      isDemo: c.isDemo != null ? !!c.isDemo : here.isDemo,
      completeness: c.completeness || "complete",
      at: c.at || Date.now(),
    };
  }
  const key = (m) => (m ? `${m.isDemo ? "demo" : m.tenantId}` : "");
  // A result from another tenant — or the demo's, seen from a real one — is
  // that tenant's to keep, not this one's.
  const stale = (m, ctx) => !!m && key(m) !== key(Object.assign({}, context(), ctx || {}));

  // headline = { n, unit } — the one figure and what it counts, e.g.
  // { n: 8, unit: "Windows devices · 3 with findings · 2 never reported" };
  // n is "Unknown" when the read did not establish it (never 0).
  // data = whatever else Home may use, e.g. T13's coverage rows.
  function publish(tool, ctx, headline, data) {
    const meta = of(Object.assign({}, ctx || {}, { tool }));
    runs.set(tool, { meta, headline: headline || null, data: data || null });
    listeners.forEach((fn) => { try { fn(tool); } catch { /* a listener must not sink a tool's read */ } });
    return meta;
  }
  // The last result of a tool in THIS tenant, or null.
  function last(tool) {
    const r = runs.get(tool);
    return r && !stale(r.meta) ? r : null;
  }
  function clear() { runs.clear(); listeners.forEach((fn) => { try { fn(""); } catch { /* ignore */ } }); }
  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  return { of, publish, last, clear, stale, on, context };
})();

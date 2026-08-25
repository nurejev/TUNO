// ======================================================================
// T03 — Change audit (BETA). "Who changed Intune, and what did they change?"
//
// ONE TOOL, TWO VIEWS, ONE READ. Both views come from a single endpoint —
// deviceManagement/auditEvents — so they are one tool rather than two tiles
// duplicating the same paging, the same throttling and the same export.
//
//   POLICY CHANGES  after Ugur Koc's check-policy-changes.ps1: narrowed to
//     configuration-policy activity, with the before/after pairs the audit
//     record carries and a severity read off the activity.
//   ALL EVENTS      after his get-intune-audit-logs.ps1: every category,
//     filtered by actor, activity, category and result.
//
// The DIFF is ENCA's T16, ported. Its decode() and diff() are the part worth
// keeping: modifiedProperties values arrive as JSON strings, sometimes
// double-encoded, sometimes wrapped in a one-element array, and the useful
// answer is a field-level list of what moved rather than two blobs printed
// side by side. Both PowerShell originals render
// "displayName: 'old' → 'new'" and stop there, which for a settings-catalog
// policy means printing several kilobytes of JSON into a CSV cell.
//
// THREE THINGS THE ORIGINALS GET WRONG, FIXED HERE.
//
//   1. They window the same endpoint two different ways — a full UTC
//      timestamp in one, a bare date in the other. A bare date is midnight,
//      so "last 1 day" silently means "since midnight", which is anything
//      from a minute to 24 hours. Full ISO-8601 UTC in both.
//   2. get-intune-audit-logs offers a fixed category list containing values
//      Graph never emits (Device, Role, User, Policy, Enrollment), so
//      choosing one returns nothing and looks like a quiet tenant. The
//      categories here are read from the tenant's own data.
//   3. check-policy-changes pages the entire result set and then keeps the
//      FIRST FIVE rows. Not a page size — a hard cap, after the work was
//      done. No cap here.
//
// AND ONE THING NEITHER SAYS. Intune keeps audit data for 30 days. ENCA's
// T16 offers a 90-day review window because the directory audit log holds
// longer; pointing that at Intune would return a confidently empty answer for
// days 31-90. The windows here stop at 30 and the screen says why.
// ======================================================================
const Audit = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

  // Intune's audit retention. Not a preference — a fact about the service,
  // and the reason there is no 90-day option.
  const RETENTION_DAYS = 30;

  const WINDOWS = [
    { id: "1h", label: "Last hour", hours: 1, kind: "incident" },
    { id: "4h", label: "Last 4 hours", hours: 4, kind: "incident" },
    { id: "24h", label: "Last 24 hours", hours: 24, kind: "incident" },
    { id: "7d", label: "Last 7 days", hours: 24 * 7, kind: "review" },
    { id: "30d", label: "Last 30 days", hours: 24 * 30, kind: "review" },
  ];
  const windowById = (id) => WINDOWS.find((w) => w.id === id) || WINDOWS[2];

  // FULL ISO-8601, UTC, seconds precision. A bare date is midnight, which
  // turns "the last day" into anything between a minute and 24 hours
  // depending on when you ask — the difference between the two originals.
  const since = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString().replace(/\.\d+Z$/, "Z");

  // A CUSTOM RANGE (build 10413), for "what happened while I was away last
  // week" — a question the rolling windows answer badly. Two rules:
  //   * The FROM is clamped to the retention floor, and the clamp is REPORTED
  //     rather than silent: a range that quietly shrank would read as a quiet
  //     tenant, which is this tool's cardinal sin.
  //   * A day picked in a date control means the WHOLE day, so the `to` runs
  //     to 23:59:59Z of the chosen date — half-open ranges off a date picker
  //     are how "up to Tuesday" silently excludes Tuesday.
  function customRange(fromDate, toDate) {
    const floor = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
    let from = new Date(`${fromDate}T00:00:00Z`);
    const to = new Date(`${toDate}T23:59:59Z`);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new Error("Pick both dates.");
    if (to < from) throw new Error("The range ends before it starts.");
    let clamped = false;
    if (from < floor) { from = floor; clamped = true; }
    if (to < floor) throw new Error(`That whole range is older than the ${RETENTION_DAYS}-day retention — Intune no longer has it, and neither does the portal.`);
    return {
      since: from.toISOString().replace(/\.\d+Z$/, "Z"),
      until: to.toISOString().replace(/\.\d+Z$/, "Z"),
      clamped,
      label: `${fromDate} → ${toDate}`,
    };
  }

  // ---- operation classification -----------------------------------------
  // One event, one operation kind — the timeline's dot and badge. Read from
  // activityOperationType first (Graph's own word), the activity text as the
  // fallback. "Assign" is split out of Action because an assignment change is
  // the row people scan for.
  const OPERATIONS = [
    { id: "create", label: "Created" },
    { id: "delete", label: "Deleted" },
    { id: "update", label: "Updated" },
    { id: "assign", label: "Assigned" },
    { id: "action", label: "Action" },
    { id: "other", label: "Other" },
  ];
  function operationOf(r) {
    const op = lc(r.operation || ""), t = lc(`${r.activityType || ""} ${r.activity || ""}`);
    if (/assign/.test(t)) return "assign";
    if (op === "create" || /create|add|import/.test(t)) return "create";
    if (op === "delete" || /delete|remove/.test(t)) return "delete";
    if (op === "patch" || op === "update" || /patch|update|modify|set\b/.test(t)) return "update";
    if (op === "action" || /action|search|sync|wipe|retire|rotate/.test(t)) return "action";
    return "other";
  }
  const operationLabel = (id) => (OPERATIONS.find((o) => o.id === id) || { label: id }).label;

  // ---- value decoding (ENCA's T16, ported) ------------------------------
  // modifiedProperties values arrive as JSON strings, and are sometimes
  // double-encoded ("\"{...}\""), sometimes wrapped in a one-element array.
  function decode(v) {
    if (v == null || v === "") return null;
    let x = v;
    for (let i = 0; i < 3; i++) {
      if (typeof x !== "string") break;
      const s = x.trim();
      if (!(s.startsWith("{") || s.startsWith("[") || s.startsWith('"'))) break;
      try { x = JSON.parse(s); } catch { break; }
    }
    if (Array.isArray(x) && x.length === 1 && x[0] && typeof x[0] === "object") return x[0];
    return x;
  }

  // ---- field-level diff of two decoded values (ENCA's T16, ported) ------
  // Arrays of scalars are compared as sets (added / removed), which is what
  // an assignment list actually is. Noise keys are dropped.
  const SKIP = new Set(["modifiedDateTime", "createdDateTime", "lastModifiedDateTime", "version", "@odata.context", "@odata.type"]);
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const scalarArray = (a) => Array.isArray(a) && a.every((x) => x == null || typeof x !== "object");

  function diff(oldV, newV, path = "", out = []) {
    if (out.length > 400) return out;                       // runaway guard
    const a = oldV, b = newV;
    if (isObj(a) || isObj(b)) {
      const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => !SKIP.has(k));
      for (const k of keys) diff(a ? a[k] : undefined, b ? b[k] : undefined, path ? `${path}.${k}` : k, out);
      return out;
    }
    if (scalarArray(a) || scalarArray(b)) {
      const A = new Set((a || []).map(String)), B = new Set((b || []).map(String));
      const added = [...B].filter((x) => !A.has(x)), removed = [...A].filter((x) => !B.has(x));
      if (added.length) out.push({ path, op: "add", value: added });
      if (removed.length) out.push({ path, op: "remove", value: removed });
      return out;
    }
    if (Array.isArray(a) || Array.isArray(b)) {   // arrays of objects
      const A = JSON.stringify(a || []), B = JSON.stringify(b || []);
      if (A !== B) out.push({ path, op: "change", from: a, to: b });
      return out;
    }
    const same = a === b || (a == null && b == null) || String(a ?? "") === String(b ?? "");
    if (!same) {
      if (a == null || a === "") out.push({ path, op: "set", to: b });
      else if (b == null || b === "") out.push({ path, op: "clear", from: a });
      else out.push({ path, op: "change", from: a, to: b });
    }
    return out;
  }

  // ---- severity ---------------------------------------------------------
  // After check-policy-changes' heuristic, with its case bug fixed: it tests
  // activityResult against a lowercase literal in one script and a capitalised
  // one in the other, and Graph returns "Success"/"Failure" capitalised — so
  // one of them never matched. Graph returns them capitalised, so both sides
  // of the comparison are lowercased here rather than one being trusted.
  function severity(rec) {
    const t = lc(rec.activityType || rec.activity || "");
    if (lc(rec.activityResult) === "failure") return "high";
    if (/delete|remove/.test(t)) return "high";
    if (/create|add|import/.test(t)) return "medium";
    if (/patch|update|modify|set/.test(t)) return "medium";
    if (/assign/.test(t)) return "low";
    return "low";
  }
  const SEV_ORDER = { high: 0, medium: 1, low: 2 };

  function actorOf(rec) {
    const a = rec.actor || {};
    return {
      name: a.userPrincipalName || a.applicationDisplayName || a.servicePrincipalName || "System",
      kind: a.userPrincipalName ? "user" : (a.applicationDisplayName || a.servicePrincipalName ? "app" : "system"),
      ip: a.ipAddress || "",
    };
  }

  // ---- one audit record → a display model -------------------------------
  //
  // EVERY RESOURCE IS INSPECTED, not resources[0]. Both originals read only
  // the first, and an assignment change routinely puts the policy in slot 0
  // and the group in slot 1 — so "who got this policy" was being dropped by
  // the tool whose whole job is to say what changed.
  function parse(rec) {
    const resources = Array.isArray(rec.resources) ? rec.resources : [];
    let changes = [];
    for (const r of resources) {
      for (const p of (r.modifiedProperties || [])) {
        const name = p.displayName || "";
        if (SKIP.has(name)) continue;
        const o = decode(p.oldValue), n = decode(p.newValue);
        if (isObj(o) || isObj(n)) changes.push(...diff(o, n, name || ""));
        else {
          const so = o == null ? "" : String(o), sn = n == null ? "" : String(n);
          if (so !== sn) changes.push({ path: name, op: so ? (sn ? "change" : "clear") : "set", from: o, to: n });
        }
      }
    }
    // Name what changed. Every resource is considered, not just the first —
    // and the names are joined, because an assignment change legitimately
    // names two things and reporting one of them is half an answer.
    const names = resources.map((r) => r.displayName).filter(Boolean);
    const a = actorOf(rec);
    return {
      id: rec.id,
      when: rec.activityDateTime || "",
      name: names.length ? [...new Set(names)].join(", ") : "(unnamed)",
      resourceIds: resources.map((r) => r.resourceId).filter(Boolean),
      activity: rec.activity || rec.displayName || rec.activityType || "",
      activityType: rec.activityType || "",
      operation: rec.activityOperationType || "",
      category: rec.category || rec.componentName || "",
      result: rec.activityResult || "",
      ok: lc(rec.activityResult) === "success",
      actor: a.name, actorKind: a.kind, ip: a.ip,
      correlationId: rec.correlationId || "",
      severity: severity(rec),
      changes,
    };
  }

  // ---- the read ---------------------------------------------------------
  // Only the predicates Graph will actually honour go server-side. Everything
  // else is applied here, on the parsed rows, so a filter can be changed
  // without re-reading the tenant.
  const SCOPES = () => [...new Set([
    ...Graph.SCOPES.apps, ...Graph.SCOPES.config, ...Graph.SCOPES.devices,
  ])];

  async function fetchEvents(opts) {
    const o = opts || {};
    let w, from, until = null, clamped = false;
    if (o.from && o.to) {
      const r = customRange(o.from, o.to);
      w = { id: "custom", label: r.label, kind: "custom" };
      from = r.since; until = r.until; clamped = r.clamped;
    } else {
      w = windowById(o.window);
      from = since(w.hours);
    }
    const parts = [`activityDateTime ge ${from}`];
    if (until) parts.push(`activityDateTime le ${until}`);
    if (o.category && o.category !== "All") parts.push(categoryFilter(o.category));
    if (o.onlyFailures) parts.push(`activityResult eq 'Failure'`);
    const path = `/deviceManagement/auditEvents?$filter=${parts.join(" and ")}&$orderby=activityDateTime desc`;
    const raw = await Graph.readAll(path, { scopes: SCOPES(), beta: true, retry: true, onPage: o.onPage });
    // A malformed record is skipped with a note rather than sinking the run —
    // the originals learned this the hard way and so does this.
    const rows = [], skipped = [];
    for (const rec of raw) {
      try { rows.push(parse(rec)); }
      catch (e) { skipped.push({ id: rec && rec.id, error: String((e && e.message) || e) }); }
    }
    return { rows, skipped, window: w, since: from, until, clamped, raw: raw.length };
  }

  // ---- the two views ----------------------------------------------------
  // POLICY CHANGES. The original matches activityType against
  // "*DeviceManagementConfigurationPolicy*", which is settings-catalog only —
  // a compliance policy or an ADMX template edited in the same hour does not
  // appear. Widened to the configuration surfaces, and the match is on the
  // activity type rather than the display name.
  const POLICY_RE = /DeviceManagementConfigurationPolicy|DeviceConfiguration|DeviceCompliancePolicy|GroupPolicyConfiguration|DeviceManagementScript|DeviceHealthScript|DeviceShellScript|WindowsAutopilotDeploymentProfile|DeviceEnrollmentConfiguration|MobileApp/i;
  const isPolicyChange = (r) => POLICY_RE.test(`${r.activityType} ${r.category}`);

  function policyRows(rows, opts) {
    const o = opts || {};
    let out = rows.filter(isPolicyChange);
    if (o.onlyChanges) out = out.filter((r) => /patch|update|modify|set|delete|remove/i.test(r.activityType || r.operation));
    if (o.minSeverity) out = out.filter((r) => SEV_ORDER[r.severity] <= SEV_ORDER[o.minSeverity]);
    // NO CAP. The original keeps the first five, after paging everything.
    return out;
  }

  // Wildcards, not substrings: the originals use PowerShell -like, where
  // "admin*" means starts-with and a bare "admin" means EXACTLY admin.
  // Treating it as a substring silently matches more than the person asked
  // for, so the glob is honoured and a term with no wildcard gets implicit
  // ones — which is what someone typing into a filter box means.
  function globRe(term) {
    const t = String(term || "").trim();
    if (!t) return null;
    const hasGlob = /[*?]/.test(t);
    const body = t.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(hasGlob ? `^${body}$` : body, "i");
  }

  function allRows(rows, opts) {
    const o = opts || {};
    const actorRe = globRe(o.actor), actRe = globRe(o.activity);
    return rows.filter((r) => {
      if (o.category && o.category !== "All" && r.category !== o.category) return false;
      if (o.operation && o.operation !== "all" && operationOf(r) !== o.operation) return false;
      if (o.result === "failure" && r.ok) return false;
      if (o.result === "success" && !r.ok) return false;
      if (actorRe && !actorRe.test(r.actor)) return false;
      if (actRe && !actRe.test(r.activity) && !actRe.test(r.activityType)) return false;
      return true;
    });
  }

  // The actors actually seen in this window — the filter dialog's dropdown is
  // built from these, same rule as the categories: options that can match.
  function actors(rows) {
    return [...new Set(rows.map((r) => r.actor).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  // Categories FROM THE DATA. The original ships a fixed list containing
  // values Graph never emits, so picking one returns nothing and reads as a
  // quiet tenant rather than as a filter that cannot match.
  function categories(rows) {
    return [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  }

  function summarize(rows) {
    const s = { total: rows.length, high: 0, medium: 0, low: 0, failures: 0, actors: 0, changed: 0 };
    const actorCount = new Map(), catCount = new Map();
    for (const r of rows) {
      s[r.severity]++;
      if (!r.ok) s.failures++;
      if (r.changes.length) s.changed++;
      actorCount.set(r.actor, (actorCount.get(r.actor) || 0) + 1);
      if (r.category) catCount.set(r.category, (catCount.get(r.category) || 0) + 1);
    }
    s.actors = actorCount.size;
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    const ta = top(actorCount), tc = top(catCount);
    // The stat cards. topActor/topArea are null on an empty window rather than
    // a placeholder string, so the renderer decides what "nothing" looks like.
    s.topActor = ta ? { name: ta[0], count: ta[1] } : null;
    s.topArea = tc ? { name: tc[0], count: tc[1] } : null;
    // Whole percent, rounded — 0 failures of 0 events is 0%, not NaN%.
    s.failureRate = s.total ? Math.round((s.failures / s.total) * 100) : 0;
    return s;
  }

  // ---- rendering a change -----------------------------------------------
  const val = (v) => {
    if (v == null || v === "") return "(empty)";
    if (typeof v === "object") { try { const s = JSON.stringify(v); return s.length > 120 ? s.slice(0, 117) + "…" : s; } catch { return "(object)"; } }
    const s = String(v);
    return s.length > 120 ? s.slice(0, 117) + "…" : s;
  };
  function changeText(c) {
    if (c.op === "add") return `${c.path}: + ${c.value.map(val).join(", ")}`;
    if (c.op === "remove") return `${c.path}: − ${c.value.map(val).join(", ")}`;
    if (c.op === "set") return `${c.path}: set to ${val(c.to)}`;
    if (c.op === "clear") return `${c.path}: cleared (was ${val(c.from)})`;
    return `${c.path}: ${val(c.from)} → ${val(c.to)}`;
  }

  // ---- exports ----------------------------------------------------------
  function meta(res, opts) {
    return {
      when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
      window: res.window.label, since: res.since,
      view: (opts && opts.view) || "policy",
      filters: (opts && opts.filters) || "",
    };
  }

  function markdown(rows, res, m) {
    const s = summarize(rows);
    const L = [];
    L.push(`# Intune change audit — ${m.view === "policy" ? "policy changes" : "all events"}`, "");
    L.push(`Generated ${m.when} by TUNO ${m.build}`, "");
    L.push(`| | |`, `|---|---|`);
    L.push(`| Window | ${mdCell(m.window)} (since ${mdCell(m.since)}) |`);
    if (m.filters) L.push(`| Filters | ${mdCell(m.filters)} |`);
    L.push(`| Events | ${s.total} — ${s.high} high, ${s.medium} medium, ${s.low} low |`);
    L.push(`| Failures | ${s.failures} |`);
    L.push(`| Distinct actors | ${s.actors} |`);
    L.push("");
    L.push(`> Intune keeps audit data for **${RETENTION_DAYS} days**. Anything older is gone from the service, not missing from this report.`, "");
    if (res.skipped.length) L.push(`> ${res.skipped.length} record(s) could not be parsed and are not counted above.`, "");

    for (const r of rows) {
      L.push(`## ${r.ok ? "" : "⚠ "}${mdCell(r.name)} — ${mdCell(r.activity)}`, "");
      L.push(`| | |`, `|---|---|`);
      L.push(`| When | ${mdCell(r.when)} |`);
      L.push(`| Who | ${mdCell(r.actor)}${r.ip ? ` (${mdCell(r.ip)})` : ""} |`);
      L.push(`| Category | ${mdCell(r.category)} |`);
      L.push(`| Result | ${mdCell(r.result)} |`);
      L.push(`| Severity | ${r.severity} |`);
      L.push("");
      if (r.changes.length) {
        L.push(`**What moved**`, "");
        r.changes.forEach((c) => L.push(`- ${mdCell(changeText(c))}`));
        L.push("");
      } else {
        L.push(`_The audit record carries no field-level detail for this event._`, "");
      }
    }
    if (!rows.length) L.push(`_Nothing matched in this window._`, "");
    L.push(`---`, ``, `After Ugur Koc's [Policy Changes Monitor](https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/monitoring/check-policy-changes.ps1) and [Get Intune Audit Logs](https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/monitoring/get-intune-audit-logs.ps1) (MIT); field-level diff from [ENCA](https://enca.limon-it.nl)'s Change audit.`);
    return L.join("\n");
  }

  function csv(rows) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = [["When", "Actor", "ActorType", "IP", "Activity", "ActivityType", "Category", "Resource", "Result", "Severity", "Changes"].map(q).join(",")];
    for (const r of rows) {
      L.push([r.when, r.actor, r.actorKind, r.ip, r.activity, r.activityType, r.category, r.name, r.result, r.severity,
        r.changes.map(changeText).join(" | ")].map(q).join(","));
    }
    return L.join("\n");
  }

  const REPORT_CSS = `
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#f4f5fa;color:#1f2330}
header{padding:18px 26px;background:#1f2933;color:#fff}h1{margin:0;font-size:19px}
.meta{color:#c8d1d9;font-size:12px;margin-top:4px}
.cards{display:flex;gap:12px;padding:14px 26px;background:#fff;border-bottom:1px solid #e6e6ee;flex-wrap:wrap}
.card{background:#f7f8fc;border:1px solid #e6e6ee;border-radius:10px;padding:10px 16px;min-width:110px}
.card .n{font-size:22px;font-weight:700}.card .l{font-size:11px;color:#6b7280;text-transform:uppercase}
.card.zero .n{color:#9aa0ab}.card.high .n{color:#b04a3a}
main{padding:18px 26px;max-width:1200px}
.note{background:#fff8e6;border:1px solid #f0dca8;border-radius:8px;padding:10px 14px;margin:0 0 14px;font-size:13px}
.ev{background:#fff;border:1px solid #e6e6ee;border-left:3px solid #9aa0ab;border-radius:10px;margin-bottom:12px;padding:12px 16px}
.ev.high{border-left-color:#b04a3a}.ev.medium{border-left-color:#c98a2e}
.ev h3{margin:0 0 2px;font-size:14px}
.ev .sub{color:#6b7280;font-size:12px;margin-bottom:8px}
.sev{display:inline-block;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.sev.high{background:#fdeceb;color:#b04a3a}.sev.medium{background:#fdf3e2;color:#8a5d18}.sev.low{background:#eef0f5;color:#5b6270}
.fail{background:#fdeceb;color:#b04a3a;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:700}
ul.ch{margin:0;padding-left:18px;font-size:13px}ul.ch li{margin:2px 0}
code{background:#f1f2f8;padding:1px 5px;border-radius:4px;font-size:12px}
footer{padding:14px 26px;color:#6b7280;font-size:12px}footer a{color:#2b4c9b}`;

  function html(rows, res, m) {
    const s = summarize(rows);
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Intune change audit</title><style>${REPORT_CSS}</style></head><body>
<header><h1>Intune change audit — ${m.view === "policy" ? "policy changes" : "all events"}</h1>
  <div class="meta">${esc(m.window)} (since ${esc(m.since)})${m.filters ? ` · ${esc(m.filters)}` : ""} · generated ${esc(m.when)} by TUNO ${esc(m.build)}</div></header>
<div class="cards">
  <div class="card"><div class="n">${s.total}</div><div class="l">Events</div></div>
  <div class="card${s.high ? " high" : " zero"}"><div class="n">${s.high}</div><div class="l">High</div></div>
  <div class="card${s.medium ? "" : " zero"}"><div class="n">${s.medium}</div><div class="l">Medium</div></div>
  <div class="card${s.failures ? " high" : " zero"}"><div class="n">${s.failures}</div><div class="l">Failed</div></div>
  <div class="card"><div class="n">${s.actors}</div><div class="l">Actors</div></div>
</div>
<main>
  <p class="note">Intune keeps audit data for <b>${RETENTION_DAYS} days</b>. Anything older is gone from the service, not missing from this report.</p>
  ${res.skipped.length ? `<p class="note">${res.skipped.length} record(s) could not be parsed and are not counted above.</p>` : ""}
  ${rows.map((r) => `<div class="ev ${esc(r.severity)}">
    <h3>${esc(r.name)} <span class="sev ${esc(r.severity)}">${esc(r.severity)}</span>${r.ok ? "" : ' <span class="fail">FAILED</span>'}</h3>
    <div class="sub">${esc(r.activity)} · ${esc(r.when)} · ${esc(r.actor)}${r.ip ? ` (${esc(r.ip)})` : ""} · ${esc(r.category)}</div>
    ${r.changes.length
      ? `<ul class="ch">${r.changes.map((c) => `<li>${esc(changeText(c))}</li>`).join("")}</ul>`
      : `<div class="sub">The audit record carries no field-level detail for this event.</div>`}
  </div>`).join("") || '<p class="note">Nothing matched in this window.</p>'}
</main>
<footer>After Ugur Koc's <a href="https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/monitoring/check-policy-changes.ps1">Policy Changes Monitor</a> and <a href="https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/monitoring/get-intune-audit-logs.ps1">Get Intune Audit Logs</a> (MIT); field-level diff from <a href="https://enca.limon-it.nl">ENCA</a>'s Change audit. Reimplemented in browser-side JavaScript against Microsoft Graph — no code was copied.</footer>
</body></html>`;
  }

  // The category comes from a dropdown built out of the tenant's own data, so
  // it is not user input in the usual sense — but it IS interpolated into a
  // $filter, and the tagged template is what keeps that distinction from
  // mattering. Structure literal, value escaped.
  const categoryFilter = (v) => Graph.odata`category eq '${v}'`;

  return {
    RETENTION_DAYS, WINDOWS, windowById, since, customRange, SCOPES,
    OPERATIONS, operationOf, operationLabel,
    decode, diff, parse, severity, actorOf, globRe,
    fetchEvents, policyRows, allRows, categories, actors, summarize, changeText, isPolicyChange,
    meta, markdown, csv, html, categoryFilter,
  };
})();


// ======================================================================
// T03 — the screen (rebuilt at 10413, Option A of the mockup round).
//
// Stat cards → toolbar (range picker, filter dialog) → a TIMELINE whose
// cards expand IN PLACE. Everything still happens in this tab: the range
// picker and the filter dialog are DOM in this page, the filters run over
// rows already read, and nothing is stored anywhere.
//
// The expand state survives a re-render because it is keyed on EVENT IDS in
// a Set, not on DOM state — a filter change redraws the list and the cards
// you had open stay open if they are still shown.
// ======================================================================
const AuditTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let res = null, view = "policy", running = false;
  // Range state: a preset id, or a custom pair. One object, one truth.
  let range = { mode: "preset", id: "24h" };
  const open = new Set();          // event ids whose detail is unfolded

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const prog = (m) => TunoProgress.show("auBody", "auProg", m);
  const showExports = (on) => ["auMd", "auCsv", "auHtml"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; });

  function fail(e) {
    const err = (typeof e === "string") ? null : e;
    const msg = err ? String(err.message || err).slice(0, 400) : String(e);
    let extra = "";
    if (err && err.kind === "admin") extra = `<p class="mini" style="margin:8px 0 0">This needs an administrator to consent once for the whole tenant. ${err.consentUrl ? `<a href="${esc(err.consentUrl)}" target="_blank" rel="noopener">Open the admin-consent page →</a>` : ""}</p>`;
    else if (err && err.kind === "consent") extra = `<p class="mini" style="margin:8px 0 0">Nothing was read. Run it again and accept the permission prompt.</p>`;
    $("auBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(msg)}</b></div>${extra}</div>`;
    showExports(false); prog("");
  }

  // ---------------------------------------------------------- range picker --
  function rangeLabel() {
    return range.mode === "custom" ? `${range.from} → ${range.to}` : Audit.windowById(range.id).label;
  }
  function renderRangePop() {
    const preset = (w) => `<button class="au-pop-item ${range.mode === "preset" && range.id === w.id ? "active" : ""}" data-aurange="${w.id}">${esc(w.label)}</button>`;
    $("auRangePop").innerHTML = `
      <div class="au-pop-side">${Audit.WINDOWS.map(preset).join("")}
        <button class="au-pop-item ${range.mode === "custom" ? "active" : ""}" data-aurange="custom">Custom…</button></div>
      <div class="au-pop-main" id="auRangeCustom" style="${range.mode === "custom" ? "" : "display:none"}">
        <label class="mini">From <input type="date" id="auFrom" value="${esc(range.from || "")}"></label>
        <label class="mini">To <input type="date" id="auTo" value="${esc(range.to || "")}"></label>
        <button class="btn sm primary" id="auRangeApply">Use range</button>
        <p class="mini muted" style="margin:6px 0 0">Days older than ${Audit.RETENTION_DAYS} are <b>gone from the service</b> — a range reaching past that is clamped to the floor and says so.</p>
      </div>`;
    $("auRangePop").querySelectorAll("[data-aurange]").forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.aurange;
      if (v === "custom") {
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
        range = { mode: "custom", from: range.from || weekAgo, to: range.to || today };
        renderRangePop();                       // shows the date inputs
      } else {
        range = { mode: "preset", id: v };
        closeRangePop(); syncToolbar();
      }
    }));
    const apply = $("auRangeApply");
    if (apply) apply.addEventListener("click", () => {
      try {
        Audit.customRange($("auFrom").value, $("auTo").value);   // validate NOW, not at run time
        range = { mode: "custom", from: $("auFrom").value, to: $("auTo").value };
        closeRangePop(); syncToolbar();
      } catch (e) { $("auRangeCustom").querySelector("p").innerHTML = `<b>${esc(String(e.message || e))}</b>`; }
    });
  }
  function openRangePop() { renderRangePop(); $("auRangePop").style.display = ""; setTimeout(() => document.addEventListener("click", outsideRange), 0); }
  function closeRangePop() { $("auRangePop").style.display = "none"; document.removeEventListener("click", outsideRange); }
  const outsideRange = (e) => { if (!e.target.closest("#auRangePop") && !e.target.closest("#auRangeBtn")) closeRangePop(); };

  // ---------------------------------------------------------- filter dialog --
  // The dialog holds the SAME controls the old inline bar had (same ids, so
  // the exports and the tests keep their handles) plus the operation type.
  // Category, operation and actor options are built from THE ROWS READ — the
  // rule the tool has had since 10323: options that can match, nothing else.
  function filterCount() {
    if (view === "policy") return ($("auSev").value ? 1 : 0) + ($("auOnlyChanges").checked ? 1 : 0);
    return ($("auCat").value !== "All" ? 1 : 0) + ($("auOp").value !== "all" ? 1 : 0)
      + ($("auResult").value !== "all" ? 1 : 0) + ($("auActorSel").value !== "all" ? 1 : 0)
      + ($("auActor").value.trim() ? 1 : 0) + ($("auActivity").value.trim() ? 1 : 0);
  }
  function syncToolbar() {
    $("auRangeBtn").innerHTML = `📅 ${esc(rangeLabel())} <span class="mini">▾</span>`;
    const n = filterCount();
    $("auFilterBtn").innerHTML = `⚙ Filter${n ? ` <span class="au-badge">${n}</span>` : ""}`;
    if (res) render();
  }
  function openFilterDlg() {
    $("auPolicyFilters").style.display = view === "policy" ? "" : "none";
    $("auAllFilters").style.display = view === "all" ? "" : "none";
    $("auFilterDlg").style.display = "";
  }
  function closeFilterDlg() { $("auFilterDlg").style.display = "none"; }

  const currentRows = () => {
    if (!res) return [];
    const actorPick = $("auActorSel").value;
    return view === "policy"
      ? Audit.policyRows(res.rows, { onlyChanges: $("auOnlyChanges").checked, minSeverity: $("auSev").value || null })
      : Audit.allRows(res.rows, {
          category: $("auCat").value, operation: $("auOp").value, result: $("auResult").value,
          actor: actorPick !== "all" ? actorPick : $("auActor").value, activity: $("auActivity").value,
        });
  };

  const filterText = () => (view === "policy"
    ? [$("auOnlyChanges").checked ? "changes only" : "", $("auSev").value ? `min severity ${$("auSev").value}` : ""].filter(Boolean).join(", ")
    : [$("auCat").value !== "All" ? `category ${$("auCat").value}` : "", $("auOp").value !== "all" ? `operation ${$("auOp").value}` : "",
      $("auResult").value !== "all" ? $("auResult").value : "",
      $("auActorSel").value !== "all" ? `actor ${$("auActorSel").value}` : ($("auActor").value ? `actor ${$("auActor").value}` : ""),
      $("auActivity").value ? `activity ${$("auActivity").value}` : ""].filter(Boolean).join(", "));

  function setView(v) {
    view = v === "all" ? "all" : "policy";
    document.querySelectorAll("#auViewSeg [data-auview]").forEach((b) => b.classList.toggle("active", b.dataset.auview === view));
    syncToolbar();
  }

  async function run() {
    if (running) return;
    running = true; $("auRun").disabled = true; showExports(false); $("auBody").innerHTML = ""; open.clear();
    try {
      prog("Checking permissions…");
      await Graph.ensureScopes(Audit.SCOPES());
      prog(`Reading the audit log — ${rangeLabel().toLowerCase()}…`);
      res = await Audit.fetchEvents(Object.assign(
        range.mode === "custom" ? { from: range.from, to: range.to } : { window: range.id },
        { onPage: (n) => prog(`Reading the audit log — ${n} events…`) }));
      // Dropdowns from the data: categories, operations seen, actors seen.
      $("auCat").innerHTML = `<option value="All">All categories</option>` + Audit.categories(res.rows).map((c) => `<option>${esc(c)}</option>`).join("");
      const seen = new Set(res.rows.map(Audit.operationOf));
      $("auOp").innerHTML = `<option value="all">All operations</option>` + Audit.OPERATIONS.filter((o) => seen.has(o.id)).map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join("");
      $("auActorSel").innerHTML = `<option value="all">All actors</option>` + Audit.actors(res.rows).map((a) => `<option>${esc(a)}</option>`).join("");
      prog("");
      syncToolbar();
      showExports(true);
    } catch (e) { fail(e); }
    finally { running = false; $("auRun").disabled = false; }
  }

  // ------------------------------------------------------------- timeline --
  const OP_ICON = { create: "＋", delete: "－", update: "✎", assign: "⇄", action: "▸", other: "·" };
  const when = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || "";
    return d.toISOString().replace("T", " ").replace(/:\d\d\.\d+Z$/, "").replace(/:\d\dZ$/, "") + " UTC";
  };

  function detail(r) {
    const rowsHtml = r.changes.length
      ? `<div class="mini muted" style="margin-top:6px">What moved</div>
         <ul class="mini au-diff">${r.changes.slice(0, 200).map((c) => `<li>${esc(Audit.changeText(c))}</li>`).join("")}
         ${r.changes.length > 200 ? `<li class="muted">…and ${r.changes.length - 200} more (the export has all of them)</li>` : ""}</ul>`
      : `<p class="mini muted" style="margin:6px 0 0">The audit record carries no field-level detail for this event — Intune logged that it happened, not what moved.</p>`;
    return `<div class="au-detail">
      <div class="au-detail-grid mini">
        <span class="muted">Actor</span><span><b>${esc(r.actor)}</b>${r.ip ? ` · ${esc(r.ip)}` : ""} <span class="muted">(${esc(r.actorKind)})</span></span>
        <span class="muted">Result</span><span>${esc(r.result || "unknown")} · severity ${esc(r.severity)}</span>
        <span class="muted">Activity</span><span>${esc(r.activity)}${r.activityType && r.activityType !== r.activity ? ` <span class="muted">· ${esc(r.activityType)}</span>` : ""}</span>
        ${r.correlationId ? `<span class="muted">Correlation</span><span><code>${esc(r.correlationId)}</code></span>` : ""}
        ${r.resourceIds.length ? `<span class="muted">Resource id${r.resourceIds.length === 1 ? "" : "s"}</span><span>${r.resourceIds.map((x) => `<code>${esc(x)}</code>`).join(" ")}</span>` : ""}
      </div>${rowsHtml}</div>`;
  }

  function render() {
    const rows = currentRows();
    const s = Audit.summarize(rows);

    const cards = `<div class="au-cards">
      <div class="au-card"><div class="au-card-l">Total changes</div><div class="au-card-n">${s.total}</div><div class="au-card-s">${res.rows.length} read in the window${res.rows.length !== s.total ? `, ${s.total} shown` : ""}</div></div>
      <div class="au-card"><div class="au-card-l">Most active admin</div><div class="au-card-n au-card-t">${s.topActor ? esc(s.topActor.name) : "—"}</div><div class="au-card-s">${s.topActor ? `${s.topActor.count} change${s.topActor.count === 1 ? "" : "s"} · ${s.actors} actor${s.actors === 1 ? "" : "s"} total` : "nothing in this window"}</div></div>
      <div class="au-card"><div class="au-card-l">Most active area</div><div class="au-card-n au-card-t">${s.topArea ? esc(s.topArea.name) : "—"}</div><div class="au-card-s">${s.topArea ? `${s.topArea.count} event${s.topArea.count === 1 ? "" : "s"}` : "&nbsp;"}</div></div>
      <div class="au-card"><div class="au-card-l">Failure rate</div><div class="au-card-n ${s.failures ? "bad" : "ok"}">${s.failureRate}%</div><div class="au-card-s">${s.failures ? `${s.failures} of ${s.total} failed` : "no failures reported"}</div></div>
    </div>`;

    const notes = [`<p class="mini muted" style="margin:10px 0 0"><b>Intune keeps audit data for ${Audit.RETENTION_DAYS} days.</b> Anything older is gone from the service — this tool cannot show it and neither can the portal.</p>`];
    if (res.clamped) notes.push(`<div class="gu-fail"><b>The range was clamped to the ${Audit.RETENTION_DAYS}-day floor.</b><span class="why">Events before ${esc(res.since)} no longer exist in the service — the quiet start of this list is missing data, not a quiet tenant.</span></div>`);
    if (res.skipped.length) notes.push(`<div class="gu-fail"><b>${res.skipped.length} record${res.skipped.length === 1 ? "" : "s"} could not be parsed</b><span class="why">Skipped rather than sinking the run, and not counted in the numbers above.</span></div>`);
    if (view === "policy" && res.rows.length && !rows.length) notes.push(`<p class="mini muted">${res.rows.length} events were read but none is a configuration change. Switch to <b>All events</b> to see them.</p>`);

    const body = rows.length ? `<div class="au-tl">${rows.map((r) => {
      const op = Audit.operationOf(r);
      const isOpen = open.has(r.id);
      return `<div class="au-ev ${esc(op)} ${isOpen ? "open" : ""}" data-auev="${esc(r.id)}">
        <span class="au-dot ${esc(op)}">${OP_ICON[op] || "·"}</span>
        <div class="au-ev-card">
          <div class="au-ev-h">
            <b>${esc(r.name)}</b>
            <span class="au-op ${esc(op)}">${esc(Audit.operationLabel(op))}</span>
            ${r.ok ? "" : `<span class="gu-how exc">failed</span>`}
            <span class="au-when mini muted">${esc(when(r.when))}</span>
          </div>
          <div class="mini muted au-ev-m">${esc(r.category || r.activityType)} · <b>${esc(r.actor)}</b> · ${r.changes.length ? `${r.changes.length} propert${r.changes.length === 1 ? "y" : "ies"} changed` : "no field-level detail"} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>
          ${isOpen ? detail(r) : ""}
        </div>
      </div>`;
    }).join("")}</div>`
      : `<p class="mini" style="margin-top:12px">Nothing matched in this window.</p>`;

    $("auBody").innerHTML = cards + `<div class="list-card">${notes.join("")}${body}</div>`;
    $("auBody").querySelectorAll("[data-auev]").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.closest("a,code")) return;      // copying an id must not toggle
      const id = el.dataset.auev;
      open.has(id) ? open.delete(id) : open.add(id);
      render();
    }));
  }

  function init() {
    if (!$("auRun")) return;
    $("auViewSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-auview]"); if (b) setView(b.dataset.auview);
    });
    $("auRangeBtn").addEventListener("click", () => ($("auRangePop").style.display === "none" ? openRangePop() : closeRangePop()));
    $("auFilterBtn").addEventListener("click", openFilterDlg);
    $("auFilterClose").addEventListener("click", closeFilterDlg);
    $("auFilterDlg").addEventListener("click", (e) => { if (e.target.id === "auFilterDlg") closeFilterDlg(); });
    $("auFilterApply").addEventListener("click", () => { closeFilterDlg(); syncToolbar(); });
    $("auFilterClear").addEventListener("click", () => {
      $("auActor").value = ""; $("auActivity").value = "";
      $("auResult").value = "all"; $("auCat").value = "All"; $("auOp").value = "all"; $("auActorSel").value = "all";
      $("auSev").value = ""; $("auOnlyChanges").checked = false;
      syncToolbar();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeFilterDlg(); closeRangePop(); } });
    $("auRun").addEventListener("click", run);
    $("auReset").addEventListener("click", () => {
      res = null; open.clear(); $("auBody").innerHTML = ""; prog(""); showExports(false);
      range = { mode: "preset", id: "24h" };
      $("auFilterClear").click();
    });
    const m = () => Audit.meta(res, { view, filters: filterText() });
    $("auMd").addEventListener("click", () => download(`Intune-change-audit-${view}.md`, Audit.markdown(currentRows(), res, m()), "text/markdown"));
    $("auCsv").addEventListener("click", () => download(`Intune-change-audit-${view}.csv`, Audit.csv(currentRows()), "text/csv"));
    $("auHtml").addEventListener("click", () => download(`Intune-change-audit-${view}.html`, Audit.html(currentRows(), res, m()), "text/html"));
    syncToolbar();
    setView("policy");
  }

  return { init, run, setView, render, currentRows, getView: () => view, getRange: () => range };
})();

// ======================================================================
// Home's Intune overview — after ENCA's js/overview.js (25419 … 25426, the
// parity workplan's "pattern only"), built at TUNO build 10671 (TUNO–ENCA
// parity slice 10) to mockup round 2's D6 A: the counts, Worth a look
// first, the per-surface counts of the policy read, and Your checks — with
// Recent tools and the tool library folded away below.
//
// IT READS NOTHING FROM THE TENANT. Everything on it is the shared policy
// read (js/policycache.js — every surface 📄 T05 reads, warmed at sign-in
// where consent already exists) or the last result an on-demand tool
// published this session (js/runmeta.js). A count nobody read is "—"; a
// count with an unread surface under it is "at least" (N+): unknown is never
// zero. The one read it can start is the one its button names — Read the
// tenant / Read again — at a click, through the cache, so every tool warms
// from it.
//
//   HomeOverview.model(res, now, ext)  pure: counts, surfaces, findings
//   HomeOverview.header(d)             the five counts and the status line
//   HomeOverview.lead(d)               the line under the page title
//   HomeOverview.context(d)            the read — one row per surface
//   HomeOverview.worth(items, opts)    Worth a look first, opening in place
//   HomeOverview.checks(rows)          Your checks — one row per on-demand tool
//
// TUNO DIFFERENCES from ENCA's, all on purpose:
//   * The counts are Intune's (D6 A): policies and profiles, assigned,
//     assigned to nobody, changed in 30 days, apps — where ENCA counts
//     Conditional Access states. "Changed in 30 days" opens 🕓 Change audit,
//     the tool that says who changed what; the others open 🗂 Policy
//     overview filtered to what they count (OverviewTool.openWith).
//   * The context band is the read itself, surface by surface, each opening
//     Policy overview on that surface — ENCA's tiles (report-only age,
//     baseline match, exclusions) have no Intune counterpart.
//   * The findings are TUNO's, from the read alone: a platform the assigned
//     policies target but no assigned compliance policy covers (exact once
//     📈 Compliance report has run this session — its coverage replaces the
//     estimate), policies assigned to nobody, legacy endpoint security
//     intents, and two policies sharing a name on one surface.
//   * No configuration map, advisories or Identity Secure Score tile —
//     ENCA-only.
//   * Attributes and ids are data-ho* / ho* (T19's own DOM is ov*).
// Rewritten without optional chaining (TUNO's house rule).
// ======================================================================
const HomeOverview = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const DAY = 86400000;
  const n = (v) => (v == null ? "—" : Number(v).toLocaleString());
  const icon = (tool) => (typeof FlatIcons !== "undefined" ? FlatIcons.tool(tool) : "");
  const svg = (name) => (typeof FlatIcons !== "undefined" ? FlatIcons.svg(name) : "");
  const hhmm = (t) => {
    if (!t) return "";
    try { return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return new Date(t).toISOString().slice(11, 16); }
  };
  const date = (t) => {
    if (!t) return "date unavailable";
    try { return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return String(t).slice(0, 10); }
  };
  const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const list = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} or ${arr[arr.length - 1]}`);

  // ------------------------------------------------------------ the read --
  // Not policies: counted apart, under the policy surfaces (D6 A's minor
  // rows). Apps have a count of their own.
  const MINOR = { filters: 1, scopeTags: 1, ade: 1, customAttributes: 1 };
  const APPS = "apps";
  // The read's labels, shortened as the mockup's rows were.
  const SHORT = {
    settingsCatalog: "Settings catalog", deviceConfigurations: "Device configuration", admx: "Administrative templates",
    compliance: "Compliance", intents: "Endpoint security (legacy)", appProtection: "App protection",
    appConfig: "App configuration", scripts: "Scripts & remediations", updates: "Windows update profiles",
    enrolment: "Enrolment", autopilot: "Autopilot", apps: "Apps", filters: "Assignment filters",
    scopeTags: "Scope tags", ade: "Enrolment tokens (ADE)", customAttributes: "Custom attributes (macOS)",
  };
  const PLATFORMS = ["Windows", "macOS", "iOS/iPadOS", "Android", "Linux"];
  // 🗂 T19's verdictOf, the same three answers: a policy reaches somebody,
  // nobody is named, or every target is an exclusion.
  function verdictOf(it) {
    const a = (it && it.assignments) || [];
    if (!a.length) return "unassigned";
    if (a.every((x) => x.kind === "Excluded")) return "excludedOnly";
    return "assigned";
  }
  const dated = (it) => (it && (it.modified || it.created)) || null;

  // res = PolicyCache.get() (Docs.collect's result); ext = { compliance:
  // RunMeta.last("toolCompliance") } — a run this session, or null.
  function model(res, now, ext) {
    now = now || Date.now();
    const e = ext || {};
    const secs = res.sections || [];
    const failed = res.failed || [];
    const order = (typeof Docs !== "undefined" && Docs.allSectionIds) ? Docs.allSectionIds() : secs.map((s) => s.id);
    const isPolicy = (id) => !MINOR[id] && id !== APPS;
    const policySecs = secs.filter((s) => isPolicy(s.id));
    const failedPolicy = failed.filter((f) => isPolicy(f.id));
    const pol = [];
    for (const s of policySecs) for (const it of s.items) pol.push({ sec: s, it, v: verdictOf(it) });
    const apps = secs.find((s) => s.id === APPS) || null;
    const appsFailed = failed.find((f) => f.id === APPS) || null;
    const since = now - 30 * DAY;
    const changed = pol.filter((r) => dated(r.it) && new Date(dated(r.it)).getTime() >= since);
    const counts = {
      policies: { n: pol.length, atLeast: failedPolicy.length > 0, surfaces: policySecs.length },
      assigned: { n: pol.filter((r) => r.v === "assigned").length, atLeast: failedPolicy.length > 0 },
      nobody: { n: pol.filter((r) => r.v === "unassigned").length, excludedOnly: pol.filter((r) => r.v === "excludedOnly").length, atLeast: failedPolicy.length > 0 },
      changed: { n: changed.length, undated: pol.filter((r) => !dated(r.it)).length, since, atLeast: failedPolicy.length > 0 },
      apps: apps ? { n: apps.items.length, nobody: apps.items.filter((it) => verdictOf(it) !== "assigned").length }
        : { n: null, error: appsFailed ? appsFailed.error : "" },
    };
    // One row per surface, in the read's own order; a surface that failed is
    // a row that says so, never a row that says 0.
    const rows = [];
    for (const id of order) {
      const s = secs.find((x) => x.id === id), f = failed.find((x) => x.id === id);
      if (!s && !f) continue;
      const label = SHORT[id] || (s && s.label) || (f && f.label) || id;
      if (s) rows.push({ id, label, n: s.items.length, nobody: isPolicy(id) || id === APPS ? s.items.filter((it) => verdictOf(it) !== "assigned").length : 0, minor: !!MINOR[id] });
      else rows.push({ id, label, n: null, error: f.error || "not read", minor: !!MINOR[id] });
    }
    for (const s of secs) if (order.indexOf(s.id) < 0) rows.push({ id: s.id, label: SHORT[s.id] || s.label || s.id, n: s.items.length, nobody: 0, minor: !!MINOR[s.id] });
    const total = secs.reduce((a, s) => a + s.items.length, 0);
    return {
      at: res.readAt || null, total, read: secs.length, failed: failed.map((f) => ({ id: f.id, label: SHORT[f.id] || f.label || f.id, error: f.error || "" })),
      counts, surfaces: rows, findings: findings(pol, secs, failedPolicy, res, e, now),
      nameError: res.nameError || "", filterError: res.filterError || "",
    };
  }

  // ------------------------------------------------------------ findings --
  // Ranked worst first, then by how many it names. Each carries the rows it
  // was built from (the evidence), what that means, the next step and the
  // tool that owns it. A finding on a read with gaps says Partial: it can be
  // understated, never invented (ENCA 25423's rule).
  const SEV_RANK = { high: 0, medium: 1, low: 2 };
  function findings(pol, secs, failedPolicy, res, ext, now) {
    const out = [];
    const at = res.readAt || null;
    const readEv = failedPolicy.length
      ? { state: "partial", label: "Partial", at, note: `${plural(failedPolicy.length, "surface", "surfaces")} could not be read: ${failedPolicy.map((f) => SHORT[f.id] || f.label).join(", ")}` }
      : { state: "read", label: "Policy read", at, note: "" };
    const row = (r) => ({ name: r.it.name, surface: SHORT[r.sec.id] || r.sec.label, modified: dated(r.it) });

    // 1. A platform the assigned policies target that no assigned compliance
    //    policy covers. Exact once 📈 T13 has run this session (its coverage
    //    reads the devices); an estimate from the policies otherwise.
    const comp = secs.find((s) => s.id === "compliance");
    const c13 = ext.compliance && ext.compliance.data && ext.compliance.data.coverage ? ext.compliance : null;
    if (c13) {
      const gaps = c13.data.coverage.filter((c) => c.verdict === "gap");
      if (gaps.length) {
        const sbd = c13.data.secureByDefault;
        out.push({ id: "compliance", sev: sbd === true ? "medium" : "high", tool: "toolCompliance", toolLabel: "Compliance report",
          text: `No compliance policy reaches ${list(gaps.map((g) => `${g.platform} (${plural(g.devices, "device", "devices")})`))}`,
          sub: sbd === false ? "devices with no compliance policy count as compliant in this tenant, so they pass every Conditional Access check that asks for one"
            : sbd === true ? "the tenant marks them not compliant, so they fail closed — but nothing evaluates them"
            : "whether the tenant marks them compliant could not be read",
          evidence: { state: c13.meta.completeness === "complete" ? "read" : "partial", label: "Compliance report", at: c13.meta.at, note: `run #${c13.meta.id} this session` },
          rows: [], detail: {
            meaning: "A device no compliance policy reaches is judged by the tenant's default alone — Compliant or Not compliant — and Conditional Access trusts that verdict.",
            next: "Open Compliance report on Coverage to see the devices per platform and which policies exist but reach nobody." },
          action: "Open Compliance report" });
      }
    } else if (comp) {
      const covered = new Set(), inUse = new Set();
      for (const it of comp.items) if (verdictOf(it) === "assigned") (it.platforms || []).forEach((p) => covered.add(p));
      for (const r of pol) if (r.sec.id !== "compliance" && r.v === "assigned") (r.it.platforms || []).forEach((p) => inUse.add(p));
      const gaps = PLATFORMS.filter((p) => inUse.has(p) && !covered.has(p));
      if (gaps.length) {
        const inert = comp.items.filter((it) => verdictOf(it) !== "assigned" && (it.platforms || []).some((p) => gaps.indexOf(p) >= 0));
        out.push({ id: "compliance", sev: "high", tool: "toolCompliance", toolLabel: "Compliance report",
          text: `No assigned compliance policy covers ${list(gaps)}`,
          sub: `assigned policies target ${gaps.length === 1 ? "it" : "them"}, so devices are likely enrolled there${inert.length ? `; ${inert.map((it) => it.name).join(", ")} ${inert.length === 1 ? "exists but reaches" : "exist but reach"} nobody` : ""}`,
          evidence: { state: "partial", label: "Partial", at, note: "the devices and the tenant's setting for devices with no compliance policy are not in the policy read — Compliance report reads both" },
          rows: inert.map((it) => ({ name: it.name, surface: "Compliance", modified: dated(it) })), detail: {
            meaning: "A device no compliance policy reaches is judged by the tenant's default alone — Compliant or Not compliant — and Conditional Access trusts that verdict.",
            next: "Run Compliance report: it reads the devices per platform and the tenant's default, and this finding becomes exact." },
          action: "Open Compliance report" });
      }
    }

    // 2. Policies assigned to nobody — and those that only exclude.
    const none = pol.filter((r) => r.v !== "assigned");
    if (none.length) {
      const unassigned = none.filter((r) => r.v === "unassigned").length, exOnly = none.length - unassigned;
      const names = none.slice(0, 3).map((r) => r.it.name);
      out.push({ id: "nobody", sev: "medium", tool: "toolHealth", toolLabel: "Assignment health",
        text: `${plural(none.length, "policy is", "policies are")} assigned to nobody`,
        sub: `${names.join(", ")}${none.length > 3 ? ` and ${none.length - 3} more` : ""}${exOnly ? ` — ${plural(exOnly, "of them only excludes", "of them only exclude")}` : ""}`,
        evidence: readEv, rows: none.map(row), detail: {
          meaning: "A policy with no assignment, or only exclusions, reaches no device and no user. That is right for a draft or a policy kept for reference and wrong for one meant to be live — the read cannot tell which.",
          next: "Open Assignment health to see these beside assignments that exist but reach nobody, or show them in Policy overview to assign or retire them." },
        action: "Open Assignment health", show: unassigned ? { label: `Show the ${plural(unassigned, "unassigned policy", "unassigned policies")} in Policy overview`, verdict: "unassigned" } : null });
    }

    // 3. Legacy endpoint security intents.
    const intents = secs.find((s) => s.id === "intents");
    if (intents && intents.items.length) {
      const k = intents.items.length, idle = intents.items.filter((it) => verdictOf(it) !== "assigned").length;
      out.push({ id: "intents", sev: "medium", tool: "toolPosture", toolLabel: "Endpoint security posture",
        text: `${plural(k, "endpoint security policy still uses", "endpoint security policies still use")} legacy intents`,
        sub: `${intents.items.slice(0, 3).map((it) => it.name).join(", ")}${k > 3 ? ` and ${k - 3} more` : ""}${idle ? ` — ${idle === k ? (k === 1 ? "it is" : "all are") : `${idle} of them are`} assigned to nobody` : ""}`,
        evidence: readEv, rows: intents.items.map((it) => ({ name: it.name, surface: "Endpoint security (legacy)", modified: dated(it) })), detail: {
          meaning: "Intents are the older endpoint security format. They still apply, but the service reports only whether one is assigned, not which devices it reaches — so posture cannot count their reach.",
          next: "Open Endpoint security posture to see each security area with the policies that enforce it, legacy intents among them." },
        action: "Open Endpoint security posture", show: { label: `Show ${k === 1 ? "it" : `these ${k}`} in Policy overview`, surf: "intents" } });
    }

    // 4. Two policies with one name on the same surface.
    const dupes = [];
    for (const s of secs.filter((x) => !MINOR[x.id])) {
      const seen = new Map();
      for (const it of s.items) {
        const key = String(it.name || "").trim().toLowerCase();
        if (!key) continue;
        seen.set(key, (seen.get(key) || []).concat([it]));
      }
      for (const group of seen.values()) if (group.length > 1) dupes.push({ sec: s, items: group });
    }
    if (dupes.length) {
      out.push({ id: "dupes", sev: "low", tool: "toolOverview", toolLabel: "Policy overview",
        text: `${plural(dupes.length, "name is", "names are")} used twice on the same surface`,
        sub: dupes.slice(0, 2).map((d) => `${d.items[0].name} (${plural(d.items.length, "time", "times")} in ${SHORT[d.sec.id] || d.sec.label})`).join("; ") + (dupes.length > 2 ? ` and ${dupes.length - 2} more` : ""),
        evidence: readEv, rows: dupes.flatMap((d) => d.items.map((it) => ({ name: it.name, surface: SHORT[d.sec.id] || d.sec.label, modified: dated(it) }))), detail: {
          meaning: "Two policies with one name are told apart only by their id — in assignments, exports and the portal's own lists.",
          next: "Open Policy overview and search the name: each card shows its id, its assignments and when it changed." },
        action: "Open Policy overview" });
    }
    return out.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
  }

  // ------------------------------------------------------------ renderers --
  // d = { counts | null, status: { kind, … } }
  function header(d) {
    const c = d.counts;
    const plus = (x) => (x && x.atLeast ? "+" : "");
    const tile = (k, cls, num, label, sub, title) => `<button type="button" class="db-count${cls ? " " + cls : ""}" data-hoopen="${k}"${title ? ` title="${esc(title)}"` : ""}><b>${num}</b><span>${esc(label)}</span><small>${sub}</small></button>`;
    const atLeast = "at least — a surface under this count could not be read";
    let tiles;
    if (!c) {
      tiles = tile("all", "unk", "—", "Policies & profiles", "not read", "") + tile("assigned", "unk", "—", "Assigned", "not read", "")
        + tile("nobody", "unk", "—", "Assigned to nobody", "not read", "") + tile("changed", "unk", "—", "Changed in 30 days", "not read", "")
        + tile("apps", "unk", "—", "Apps", "not read", "");
    } else {
      const ch = c.changed;
      tiles = tile("all", "", n(c.policies.n) + plus(c.policies), "Policies & profiles", esc(`${plural(c.policies.surfaces, "surface", "surfaces")}`), c.policies.atLeast ? atLeast : "")
        + tile("assigned", "", n(c.assigned.n) + plus(c.assigned), "Assigned", "to a group, all users or all devices", c.assigned.atLeast ? atLeast : "")
        + tile("nobody", (c.nobody.n + c.nobody.excludedOnly) ? "warn" : "", n(c.nobody.n) + plus(c.nobody), "Assigned to nobody",
          esc(c.nobody.excludedOnly ? `+${c.nobody.excludedOnly} that only exclude${c.nobody.excludedOnly === 1 ? "s" : ""}` : "deployed nowhere"), c.nobody.atLeast ? atLeast : "")
        + tile("changed", "", n(ch.n) + plus(ch), "Changed in 30 days", esc(`since ${date(ch.since)}${ch.undated ? ` · ${ch.undated} without a date` : ""}`), ch.atLeast ? atLeast : "")
        + (c.apps.n == null
          ? tile("apps", "unk", "—", "Apps", esc(c.apps.error ? "not read" : "not in this read"), c.apps.error || "")
          : tile("apps", "", n(c.apps.n), "Apps", esc(c.apps.n === 0 ? "none in the tenant" : c.apps.nobody ? `${c.apps.nobody} assigned to nobody` : "all assigned"), ""));
    }
    const st = d.status || { kind: "loaded" };
    let status = "";
    const read = (label) => `<button type="button" class="fchip" data-horead>${svg("refresh")} ${esc(label)}</button>`;
    if (st.kind === "loading") status = `<div class="db-status loading" role="status">Reading the tenant…${st.message ? ` <span class="mini muted">${esc(st.message)}</span>` : ""} Counts show — until their surface is read; nothing reads 0 before it is read.</div>`;
    else if (st.kind === "notread") status = `<div class="db-status empty" role="status">Not read yet. Sign-in reads the policies only where the tenant has already consented, and never asks — nothing read, nothing counted. ${read("Read the tenant")} <span class="mini muted">Asks for consent once; every tool uses the same read afterwards.</span></div>`;
    else if (st.kind === "dropped") status = `<div class="db-status empty" role="status">The policies changed in this session (a write at ${esc(hhmm(st.at))}), so the earlier read no longer describes them. ${read("Read again")}</div>`;
    else if (st.kind === "failed") status = `<div class="db-status failed" role="alert">The read failed at ${esc(hhmm(st.at))}${st.message ? ` — ${esc(st.message)}` : ""}. ${read("Try again")}</div>`;
    else if (st.kind === "gaps") status = `<div class="db-status failed" role="status">${esc(plural(st.failed.length, "surface", "surfaces"))} of ${esc(st.of)} could not be read — ${esc(st.failed.map((f) => `${f.label}${f.error ? ` (${f.error})` : ""}`).join("; "))}. A count marked + is at least that.</div>`;
    return `<div class="db-head"><div class="db-counts five">${tiles}</div>${status}</div>`;
  }

  function lead(d) {
    if (!d || !d.at) return "";
    return `${d.fromSignIn ? "Read at sign-in" : "Read"}, ${hhmm(d.at)} — ${plural(d.total, "object", "objects")} on ${plural(d.read, "surface", "surfaces")}. Nothing on this page asks Graph for more; each tool reads its own detail when you open it.`;
  }

  function context(d) {
    const main = d.surfaces.filter((r) => !r.minor), minor = d.surfaces.filter((r) => r.minor);
    const tile = (r) => {
      const failed = r.n == null;
      // one line a surface (D6 A's rows): what reaches nobody rides the
      // label; only a surface that could not be read takes a second line
      const extra = !failed && r.nobody ? ` <span class="mini muted">· ${r.nobody} to nobody</span>` : "";
      return `<div class="db-tile${failed ? " warn" : ""}${r.minor ? " minor" : ""}"><button type="button" class="db-tile-main" data-hosurf="${esc(r.id)}"${failed ? " disabled" : ""}><span class="n">${failed ? "—" : n(r.n)}</span><span class="l">${esc(r.label)}${extra}</span>${failed ? `<span class="s">not read — ${esc(r.error)}</span>` : ""}</button></div>`;
    };
    const foot = d.failed.length
      ? `${d.read} of ${d.read + d.failed.length} read; ${esc(d.failed.map((f) => f.label).join(", "))} could not be. Each count opens Policy overview on that surface.`
      : `All ${d.read} read, none failed. Each count opens Policy overview on that surface.`;
    const names = d.nameError ? ` Group names could not be resolved (${esc(d.nameError)}) — the tools show ids.` : "";
    return `<aside id="hoContext" class="db-band db-context" aria-labelledby="hoContextHeading">
      <h3 id="hoContextHeading">${d.fromSignIn ? "In the sign-in read" : "In the policy read"} <span class="mini muted">${esc(plural(d.read + d.failed.length, "surface", "surfaces"))}</span></h3>
      <div class="db-tiles">${main.map(tile).join("")}${minor.map(tile).join("")}</div>
      <p class="db-context-note mini muted">${foot}${names}</p>
    </aside>`;
  }

  const SEV = { high: "High", medium: "Medium", low: "Low" };
  const SHOW = 3;
  const EV_CLASS = { read: "ok", partial: "warn" };
  function evidenceChip(ev) {
    if (!ev) return "";
    return `<span class="db-ev ${EV_CLASS[ev.state] || "na"}" title="${esc(ev.note || "")}">${esc(ev.label)}${ev.at ? ` · ${esc(hhmm(ev.at))}` : ""}</span>`;
  }
  // items = model(...).findings; opts = { open: id | null, showAll, fromSignIn }
  function worth(items, opts) {
    const o = opts || {};
    const shown = o.showAll ? items : items.slice(0, SHOW);
    const line = (x) => {
      const open = o.open === x.id;
      return `<div class="db-worth-wrap${open ? " open" : ""}"><button type="button" class="db-worth sev-${esc(x.sev)}" data-hofind="${esc(x.id)}" aria-expanded="${open}">
      <span class="sv">${esc(SEV[x.sev] || x.sev)}</span>
      <span class="tx">${esc(x.text)}${x.sub ? ` <span class="mini muted">— ${esc(x.sub)}</span>` : ""}</span>
      ${evidenceChip(x.evidence)}
      <span class="to mini">${icon(x.tool)} ${esc(x.toolLabel || "")} ${open ? "▴" : "▾"}</span>
    </button>${open ? evidence(x) : ""}</div>`;
    };
    const empty = `<div class="db-worth-empty mini muted">Nothing in the policy read stands out — the tools below go deeper than this band can.</div>`;
    const more = items.length > SHOW ? `<button type="button" class="db-more" data-hoall>${o.showAll ? "Show the top three" : `View all ${items.length} findings`}</button>` : "";
    return `<section id="hoWorth" class="db-band db-findings" aria-labelledby="hoWorthHeading">
      <h3 id="hoWorthHeading">Worth a look first <span class="mini muted">${items.length ? `${plural(items.length, "finding", "findings")} in the ${o.fromSignIn ? "sign-in" : "policy"} read · worst first` : ""}</span></h3>
      <div class="db-worths">${shown.length ? shown.map(line).join("") : empty}</div>
      ${more}
    </section>`;
  }
  // One finding's evidence, in place: what was observed (the policies it was
  // built from, as read), the evidence and its time, what it means, the next
  // step — and the way into the tool that owns it.
  function evidence(x) {
    const MAX = 12;
    const rows = x.rows || [];
    const obs = rows.length
      ? `<ul class="db-list">${rows.slice(0, MAX).map((r) => `<li><span class="nm">${esc(r.name)}</span><span class="mini muted">${esc(r.surface)} · ${esc(r.modified ? `modified ${date(r.modified)}` : "date unavailable")}</span></li>`).join("")}</ul>${rows.length > MAX ? `<div class="mini muted">and ${rows.length - MAX} more</div>` : ""}`
      : `<span>${esc(x.text)}${x.sub ? ` — ${esc(x.sub)}` : ""}</span>`;
    return `<div class="db-evid">
      <div class="db-evid-row"><span class="l">Observed</span><div>${obs}</div></div>
      <div class="db-evid-row"><span class="l">Evidence</span><span>${evidenceChip(x.evidence)}${x.evidence && x.evidence.note ? ` <span class="mini muted">${esc(x.evidence.note)}</span>` : ""}${x.evidence && x.evidence.state === "partial" ? ' <span class="mini muted">— a finding on partial evidence can be understated, never invented</span>' : ""}</span></div>
      ${x.detail && x.detail.meaning ? `<div class="db-evid-row"><span class="l">What it means</span><span>${esc(x.detail.meaning)}</span></div>` : ""}
      ${x.detail && x.detail.next ? `<div class="db-evid-row"><span class="l">Next step</span><span>${esc(x.detail.next)}</span></div>` : ""}
      <div class="db-evid-act">
        <button type="button" class="fchip active" data-hotool="${esc(x.tool)}">${icon(x.tool)} ${esc(x.action || "Open the tool")}</button>
        ${x.show ? `<button type="button" class="fchip" data-hotool="toolOverview"${x.show.verdict ? ` data-hoverdict="${esc(x.show.verdict)}"` : ""}${x.show.surf ? ` data-hosurf2="${esc(x.show.surf)}"` : ""}>${icon("toolOverview")} ${esc(x.show.label)}</button>` : ""}
      </div>
    </div>`;
  }

  // rows = [{ tool, label, what, run: { meta, headline } | null }]
  function checks(rows) {
    const row = (c) => {
      const r = c.run;
      const never = !r;
      let state, cls = "";
      if (never) state = "Not run this session";
      else {
        const h = r.headline || { n: "Unknown", unit: "" };
        state = `<b>${esc(h.n)}</b> ${esc(h.unit)} · read ${esc(hhmm(r.meta.at))} · ${esc(r.meta.completeness)}`;
        if (r.meta.completeness !== "complete") cls = " partial";
      }
      return `<div class="db-check${cls}${never ? " never" : ""}" data-hocheck="${esc(c.tool)}">
        <div class="t">${icon(c.tool)} ${esc(c.label)}<small>${esc(c.what || "")}</small></div>
        <div class="s">${state}</div>
        <div class="a">${never ? "" : `<button type="button" class="fchip" data-hotool="${esc(c.tool)}">Open</button>`}<button type="button" class="fchip${never ? " active" : ""}" data-horun="${esc(c.tool)}">${never ? "Run check" : "Run again"}</button></div>
      </div>`;
    };
    return `<section id="hoChecks" class="db-band db-check-section" aria-labelledby="hoChecksHeading">
      <h3 id="hoChecksHeading">Your checks <span class="mini muted">tools that read on demand · this session</span></h3>
      <div class="db-checks">${rows.map(row).join("")}</div>
    </section>`;
  }

  // ------------------------------------------------------------ the page --
  // The five on-demand tools of D6 A, each with the button that runs it.
  const CHECKS = [
    { tool: "toolDefender", run: "dfRun", what: "Defender on the Windows fleet, device by device" },
    { tool: "toolLaps", run: "lpRun", what: "which devices escrow a local admin password, and how fresh" },
    { tool: "toolCompliance", run: "cpRun", what: "compliance per device, and which platforms no policy covers" },
    { tool: "toolSecureScore", run: "scRun", what: "the tenant's Secure Score and what moves it" },
    { tool: "toolDeviceCleanup", run: "dcuRun", what: "directory devices gone silent" },
  ];
  const plain = (s) => String(s || "").replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "");
  const nameOf = (id) => {
    const v = typeof TOOL_VERSIONS !== "undefined" ? TOOL_VERSIONS[id] : null;
    return plain((v && v.head) || id);
  };
  const runOf = (tool) => (typeof RunMeta !== "undefined" ? RunMeta.last(tool) : null);

  let host = null;
  let openFind = null, showAll = false, busy = false, readError = null, statusMsg = "", attached = false, sessionKey = "";

  function sessionOf() {
    const t = window.TunoTenant;
    let id = "";
    try { id = (t && t.tenantId && t.tenantId()) || ""; } catch { id = ""; }
    return `${document.body.classList.contains("demo-mode") ? "demo" : "live"}:${id}`;
  }
  function openTool(id) { const el = $(id); if (el) el.click(); }
  // The surfaces Home counts as policies and profiles — what a count opened
  // in Policy overview must show, and nothing it left out (OverviewTool's
  // surface set, 10671).
  function policySurfaces() {
    const res = typeof PolicyCache !== "undefined" ? PolicyCache.get() : null;
    return res ? res.sections.map((x) => x.id).filter((id) => !MINOR[id] && id !== APPS) : [];
  }
  function openOverview(o) {
    openTool("toolOverview");
    if (typeof OverviewTool !== "undefined" && OverviewTool.openWith) OverviewTool.openWith(o || {});
  }

  function render() {
    if (!host) return;
    if (!document.body.classList.contains("with-side")) {
      // signed out: nothing of the last session stays in the page
      host.innerHTML = ""; const l = $("wcHomeLead"); if (l) l.innerHTML = "";
      return;
    }
    const key = sessionOf();
    if (key !== sessionKey) { sessionKey = key; openFind = null; showAll = false; readError = null; statusMsg = ""; }
    const cache = typeof PolicyCache !== "undefined" ? PolicyCache : null;
    const res = cache ? cache.get() : null;
    const reading = busy || (cache ? cache.reading() || (cache.warming && cache.warming()) : false);
    const fromSignIn = cache ? cache.fromSignIn() : false;
    const d = res ? Object.assign(model(res, Date.now(), { compliance: runOf("toolCompliance") }), { fromSignIn }) : null;
    let status;
    if (reading) status = { kind: "loading", message: statusMsg || (cache && cache.warming && cache.warming() ? "Checking whether this tenant already consented…" : "") };
    else if (readError) status = { kind: "failed", at: readError.at, message: readError.message };
    else if (!d) status = cache && cache.droppedAt && cache.droppedAt() ? { kind: "dropped", at: cache.droppedAt() } : { kind: "notread" };
    else if (d.failed.length) status = { kind: "gaps", failed: d.failed, of: d.read + d.failed.length };
    else status = { kind: "loaded" };
    const leadEl = $("wcHomeLead");
    if (leadEl) {
      const text = d && !reading ? lead(d) : "";
      leadEl.innerHTML = text ? `${esc(text)} <button type="button" class="wc-text-button ho-reread" data-horead>${svg("refresh")} Read again</button>` : "";
    }
    const rows = CHECKS.map((c) => ({ tool: c.tool, label: nameOf(c.tool), what: c.what, run: runOf(c.tool) }));
    host.innerHTML = header({ counts: d && !reading ? d.counts : null, status })
      + (d && !reading ? `<div class="db-primary">${worth(d.findings, { open: openFind, showAll, fromSignIn })}${context(d)}</div>` : "")
      + checks(rows);
  }

  // A read already running — the sign-in prefetch — is joined, never
  // started: the cache dedupes, and Home repaints when it lands.
  function attach() {
    if (attached || typeof PolicyCache === "undefined" || !PolicyCache.reading()) return;
    attached = true;
    PolicyCache.read((m) => { statusMsg = m || ""; paintStatus(); })
      .then(() => { attached = false; render(); }, () => { attached = false; render(); });
  }
  function paintStatus() {
    const s = host && host.querySelector(".db-status.loading .mini");
    if (s) s.textContent = statusMsg; else render();
  }

  // Read the tenant / Read again: a click, so consent may be asked here —
  // the same union every tool's read asks, through the cache.
  async function readTenant() {
    if (busy || typeof PolicyCache === "undefined") return;
    busy = true; readError = null; statusMsg = "Checking permissions…"; render();
    try {
      await Graph.ensureScopes(PolicyCache.scopesNeeded());
      await PolicyCache.refresh((m) => { statusMsg = m || ""; paintStatus(); });
    } catch (e) {
      readError = { at: Date.now(), message: (e && e.message) || String(e) };
    } finally { busy = false; statusMsg = ""; render(); }
  }

  function onClick(e) {
    const t = e.target.closest("[data-hoopen],[data-hosurf],[data-hofind],[data-hoall],[data-hotool],[data-horun],[data-horead]");
    if (!t) return;
    if (t.hasAttribute("data-horead")) { readTenant(); return; }
    if (t.hasAttribute("data-hofind")) { const id = t.getAttribute("data-hofind"); openFind = openFind === id ? null : id; render(); return; }
    if (t.hasAttribute("data-hoall")) { showAll = !showAll; render(); return; }
    if (t.hasAttribute("data-hoopen")) {
      const k = t.getAttribute("data-hoopen");
      if (k === "changed") openTool("toolAudit");
      else if (k === "apps") openOverview({ surf: "apps" });
      else openOverview({ surfs: policySurfaces(), verdict: k === "assigned" ? "assigned" : k === "nobody" ? "unassigned" : "" });
      return;
    }
    if (t.hasAttribute("data-hosurf")) { openOverview({ surf: t.getAttribute("data-hosurf") }); return; }
    if (t.hasAttribute("data-horun")) {
      const tool = t.getAttribute("data-horun"), c = CHECKS.find((x) => x.tool === tool);
      openTool(tool);
      const b = c && $(c.run);
      if (b && !b.disabled) b.click();     // the tool's own button: its own consent, its own read
      return;
    }
    if (t.hasAttribute("data-hotool")) {
      const tool = t.getAttribute("data-hotool");
      const v = t.getAttribute("data-hoverdict"), s = t.getAttribute("data-hosurf2");
      if (tool === "toolOverview" && (v || s)) openOverview(v ? { verdict: v, surfs: policySurfaces() } : { surf: s });
      else openTool(tool);
    }
  }
  // The lead's Read again sits in the page heading, outside the overview.
  function onLeadClick(e) { if (e.target.closest("[data-horead]")) readTenant(); }

  function mount() {
    const home = $("wcHome");
    if (!home || $("wcOverview")) return;
    host = document.createElement("section");
    host.id = "wcOverview"; host.className = "wc-overview"; host.setAttribute("aria-label", "Intune overview");
    home.insertBefore(host, home.querySelector(".wc-home-layout"));
    host.addEventListener("click", onClick);
    const leadEl = $("wcHomeLead");
    if (leadEl) leadEl.addEventListener("click", onLeadClick);
    render(); attach();
  }

  if (typeof document !== "undefined") {
    // js/workspaces.js says when Home exists (tuno:wchome); the overview must
    // be in place BEFORE it decides whether the library starts open.
    document.addEventListener("tuno:wchome", mount);
    if ($("wcHome")) mount();
    // Back on Home: the read may have changed under it (a refresh in a tool,
    // a write that dropped the cache), so paint again — and join a read
    // that is running.
    const hooks = (window.TunoScreenHooks = window.TunoScreenHooks || {});
    const prev = hooks["screen-home"];
    hooks["screen-home"] = () => { if (prev) { try { prev(); } catch { /* the screen still shows */ } } render(); attach(); };
    // a tool's run landed (its id); "" is sign-out clearing them, which the
    // cache's own "cleared" has already blanked the page for
    if (typeof RunMeta !== "undefined") RunMeta.on((tool) => { if (tool && $("screen-home") && $("screen-home").classList.contains("active")) render(); });
    // The sign-in read lands while Home is on screen — no screen hook fires
    // then, so the cache says so (start, done, failed, dropped, cold).
    if (typeof PolicyCache !== "undefined" && PolicyCache.on) PolicyCache.on((kind) => {
      if (kind === "cleared") { if (host) host.innerHTML = ""; const l = $("wcHomeLead"); if (l) l.innerHTML = ""; return; }  // sign-out
      if (kind === "start") attach();
      render();
    });
  }

  return { model, header, lead, context, worth, evidence, checks, verdictOf, render, CHECKS };
})();

// ======================================================================
// T13 — Compliance report (R22). After Alper Atar's IntuneShade (MIT),
// whose compliance page is the estate-wide rollup TUNO answered only
// per-device (T06). The tenant's compliance story on one page: every
// compliance policy with its verdicts rolled up, the SETTINGS that are
// failing where Graph keeps a per-setting summary, and the devices whose
// verdict is too old to mean anything.
//
// STALE IS ITS OWN COLUMN, NOT A FLAVOUR OF COMPLIANT. A device's
// complianceState is whatever it reported at its last check-in; a machine
// that has not synced in six weeks "is compliant" the way a photograph is
// the weather. The threshold is on screen (default 30 days — Intune's own
// compliance-status validity default), and a compliant-but-stale device is
// counted in BOTH columns with the tension stated, never resolved quietly.
//
// THE COVERAGE IS THE CHEAP STATUS, AND SAYS SO — the T09 rule. Per-policy
// deviceStatusOverview and deviceSettingStateSummaries are what Graph keeps
// inexpensively; per-device drill-down for one policy is T06's job and the
// report points there. A policy whose statuses could not be read is LISTED
// with the gap stated, never absent — the T05 rule, because a rollup
// missing a policy reads as a clean bill for it.
//
// Reads only. Scopes: the compliance policies ride the config read, the
// device estate rides DeviceManagementManagedDevices.Read.All — both came
// in with earlier tools; this adds none.
// ======================================================================
const Compliance = (() => {
  "use strict";

  const S = () => Graph.SCOPES;
  const lc = (s) => String(s || "").toLowerCase();
  const DEFAULT_STALE_DAYS = 30;

  // managedDevices complianceState values → the four columns the report uses.
  // configManager is real and rare; it goes to "other", named, not dropped.
  function bucketOf(state) {
    const s = lc(state);
    if (s === "compliant") return "compliant";
    if (s === "noncompliant") return "noncompliant";
    if (s === "ingraceperiod") return "grace";
    if (s === "unknown" || s === "") return "unknown";
    return "other";
  }

  // ---- the estate ----
  async function readDevices(onStatus) {
    onStatus && onStatus("Reading the device estate…");
    const sel = "id,deviceName,complianceState,lastSyncDateTime,operatingSystem,userPrincipalName";
    return Graph.readAll(`${Graph.BETA}/deviceManagement/managedDevices?$select=${sel}&$top=999`, {
      scopes: S().devices, retry: true,
    });
  }

  function estateTotals(devices, staleDays) {
    const cutoff = Date.now() - staleDays * 86400000;
    const t = { total: devices.length, compliant: 0, noncompliant: 0, grace: 0, unknown: 0, other: 0, stale: 0, staleCompliant: 0 };
    const staleList = [];
    for (const d of devices) {
      const b = bucketOf(d.complianceState);
      t[b]++;
      const sync = Date.parse(d.lastSyncDateTime || "");
      const stale = !Number.isFinite(sync) || sync < cutoff;
      if (stale) {
        t.stale++;
        if (b === "compliant") t.staleCompliant++;
        staleList.push({
          name: d.deviceName || d.id, os: d.operatingSystem || "", user: d.userPrincipalName || "",
          state: d.complianceState || "unknown",
          lastSync: d.lastSyncDateTime || "(never)",
        });
      }
    }
    staleList.sort((a, b) => String(a.lastSync).localeCompare(String(b.lastSync)));
    return { totals: t, staleList, staleDays };
  }

  // ---- the policies ----
  async function readPolicies(onStatus) {
    onStatus && onStatus("Reading compliance policies…");
    const items = await Graph.readAll(`${Graph.BETA}/deviceManagement/deviceCompliancePolicies?$expand=assignments`, {
      scopes: S().config, retry: true,
    });
    // Two cheap rollups per policy, folded into $batch.
    const reqs = [];
    for (const p of items) {
      reqs.push({ id: `o|${p.id}`, url: `/deviceManagement/deviceCompliancePolicies/${p.id}/deviceStatusOverview` });
      reqs.push({ id: `s|${p.id}`, url: `/deviceManagement/deviceCompliancePolicies/${p.id}/deviceSettingStateSummaries` });
    }
    onStatus && onStatus(`Reading statuses — ${items.length} policies…`);
    const out = reqs.length ? await Graph.batch(reqs, {
      beta: true, scopes: S().config,
      onProgress: (d, total) => onStatus && onStatus(`Reading statuses — ${d}/${total}`),
    }) : {};

    return items.map((p) => {
      const o = out[`o|${p.id}`], s = out[`s|${p.id}`];
      const ov = (o && !o.error && o.body) || null;
      const settings = (s && !s.error && s.body && s.body.value) || null;
      return {
        id: p.id,
        name: p.displayName || p.id,
        type: String(p["@odata.type"] || "").replace(/^#?microsoft\.graph\./, ""),
        assigned: !!(p.assignments || []).length,
        assignments: (p.assignments || []).length,
        overview: ov ? {
          compliant: ov.successCount || 0, noncompliant: ov.failedCount || 0,
          error: ov.errorCount || 0, conflict: ov.conflictCount || 0,
          pending: ov.pendingCount || 0, notApplicable: ov.notApplicableCount || 0,
        } : null,
        overviewError: o && o.error ? String((o.error && o.error.message) || o.error).slice(0, 140) : null,
        // Only the settings actually failing somewhere — a per-setting list of
        // all-compliant rows is noise wearing a table.
        failingSettings: settings ? settings
          .filter((x) => (x.nonCompliantDeviceCount || 0) + (x.errorDeviceCount || 0) + (x.conflictDeviceCount || 0) > 0)
          .map((x) => ({
            name: x.settingName || x.setting || "(setting)",
            noncompliant: x.nonCompliantDeviceCount || 0,
            error: x.errorDeviceCount || 0, conflict: x.conflictDeviceCount || 0,
            compliant: x.compliantDeviceCount || 0,
          }))
          .sort((a, b) => (b.noncompliant + b.error) - (a.noncompliant + a.error)) : null,
        settingsError: s && s.error ? String((s.error && s.error.message) || s.error).slice(0, 140) : null,
      };
    }).sort((a, b) => {
      const bad = (p) => p.overview ? p.overview.noncompliant + p.overview.error + p.overview.conflict : -1;
      return bad(b) - bad(a) || a.name.localeCompare(b.name);
    });
  }

  async function report(opts) {
    const o = opts || {};
    const staleDays = Number.isFinite(+o.staleDays) && +o.staleDays > 0 ? +o.staleDays : DEFAULT_STALE_DAYS;
    const out = { staleDays, deviceError: null, policyError: null, devices: null, policies: null };
    try { out.devices = estateTotals(await readDevices(o.onStatus), staleDays); }
    catch (e) { out.deviceError = String((e && e.message) || e).slice(0, 240); }
    try { out.policies = await readPolicies(o.onStatus); }
    catch (e) { out.policyError = String((e && e.message) || e).slice(0, 240); }
    return out;
  }

  // ---- exports ----
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  function meta() {
    return { when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "") };
  }
  function markdown(rep, m) {
    const L = [];
    L.push("# Intune compliance report", "");
    L.push(`Generated ${m.when} by TUNO ${m.build}`, "");
    if (rep.devices) {
      const t = rep.devices.totals;
      L.push(`## The estate (${t.total} devices)`, "");
      L.push(`| Compliant | Non-compliant | In grace | Unknown | Other | Stale (>${rep.staleDays}d) |`, `|---|---|---|---|---|---|`);
      L.push(`| ${t.compliant} | ${t.noncompliant} | ${t.grace} | ${t.unknown} | ${t.other} | ${t.stale} |`, "");
      if (t.staleCompliant) L.push(`> **${t.staleCompliant} devices count as compliant AND are stale.** Their verdict is as old as their last check-in — it describes the device that last synced, not the one in use today.`, "");
    } else {
      L.push(`## The estate`, "", `> **Could not be read** — ${mdCell(rep.deviceError)}. Every estate number on this page is unknown, not zero.`, "");
    }
    if (rep.policies) {
      L.push(`## Policies (${rep.policies.length})`, "");
      L.push(`| Policy | Assigned | Compliant | Non-compliant | Error | Conflict | Pending |`, `|---|---|---|---|---|---|---|`);
      for (const p of rep.policies) {
        L.push(p.overview
          ? `| ${mdCell(p.name)} | ${p.assigned ? "yes" : "**no**"} | ${p.overview.compliant} | ${p.overview.noncompliant} | ${p.overview.error} | ${p.overview.conflict} | ${p.overview.pending} |`
          : `| ${mdCell(p.name)} | ${p.assigned ? "yes" : "**no**"} | — | — | — | — | — |`);
      }
      L.push("");
      const gaps = rep.policies.filter((p) => p.overviewError || p.settingsError);
      if (gaps.length) {
        L.push(`> **${gaps.length} policies are listed with a gap** — their statuses could not be read. They are unknown, not clean: ${gaps.map((p) => mdCell(p.name)).join(", ")}.`, "");
      }
      const failing = rep.policies.filter((p) => p.failingSettings && p.failingSettings.length);
      if (failing.length) {
        L.push(`## What is failing, per setting`, "");
        for (const p of failing) {
          L.push(`### ${mdCell(p.name)}`, "", `| Setting | Non-compliant | Error | Conflict |`, `|---|---|---|---|`);
          p.failingSettings.forEach((s) => L.push(`| ${mdCell(s.name)} | ${s.noncompliant} | ${s.error} | ${s.conflict} |`));
          L.push("");
        }
      }
    } else if (rep.policyError) {
      L.push(`## Policies`, "", `> **Could not be read** — ${mdCell(rep.policyError)}.`, "");
    }
    L.push(`---`, `Per-policy numbers are Graph's cheap status rollup, refreshed on Intune's schedule rather than live. Per-device drill-down for one machine is the 🖥 Device analyzer's job.`);
    return L.join("\n");
  }
  function csv(rep) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["policy,assigned,compliant,noncompliant,error,conflict,pending,notApplicable,statusGap"];
    for (const p of rep.policies || []) {
      const o = p.overview || {};
      L.push([q(p.name), p.assigned ? "yes" : "no", o.compliant ?? "", o.noncompliant ?? "", o.error ?? "", o.conflict ?? "", o.pending ?? "", o.notApplicable ?? "", q(p.overviewError || "")].join(","));
    }
    return L.join("\n");
  }
  function staleCsv(rep) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["device,os,user,complianceState,lastSync"];
    for (const d of (rep.devices && rep.devices.staleList) || []) {
      L.push([q(d.name), q(d.os), q(d.user), q(d.state), q(d.lastSync)].join(","));
    }
    return L.join("\n");
  }

  return { DEFAULT_STALE_DAYS, bucketOf, estateTotals, report, markdown, csv, staleCsv, meta };
})();


// ======================================================================
// T13 — the screen. Engine above is DOM-free for the headless suite.
// ======================================================================
const ComplianceTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let rep = null, running = false;
  // Which policy rows are unfolded — keyed on POLICY IDS, the T03 rule, so a
  // re-render keeps them open.
  const open = new Set();

  function prog(msg) { TunoProgress.show("cpBody", "cpProg", msg); }   // ENCA-style centred card (10397)
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function showExports(on) { ["cpMd", "cpCsv", "cpStale"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); }

  async function run() {
    if (running) return;
    running = true; $("cpRun").disabled = true; showExports(false); $("cpBody").innerHTML = ""; open.clear();
    try {
      await Graph.ensureScopes([...new Set([...Graph.SCOPES.devices, ...Graph.SCOPES.config])]);
      rep = await Compliance.report({ staleDays: $("cpStaleDays").value, onStatus: prog });
      prog("");
      render();
      showExports(true);
    } catch (e) {
      $("cpBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
      prog("");
    } finally { running = false; $("cpRun").disabled = false; }
  }

  // The 10413 layout (build 10415, from the mockup round): stat cards for
  // the estate, then the policies as FOLDED rows that unfold in place to the
  // failing settings and the full rollup. The open set is keyed on policy
  // ids, so a re-render keeps your cards open — the T03 rule.
  function render() {
    const parts = [];

    if (rep.devices) {
      const t = rep.devices.totals;
      const pct = (n) => (t.total ? Math.round((n / t.total) * 100) : 0);
      const card = (label, n, sub, cls) => `<div class="au-card"><div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></div>`;
      parts.push(`<div class="au-cards">
        ${card("Compliant", t.compliant, `of ${t.total} · ${pct(t.compliant)}%`, "ok")}
        ${card("Non-compliant", t.noncompliant, `${pct(t.noncompliant)}%`, t.noncompliant ? "bad" : "")}
        ${card("In grace", t.grace, `${pct(t.grace)}%`)}
        ${card(`Stale &gt;${rep.staleDays}d`, t.stale, t.staleCompliant ? `<b>${t.staleCompliant} also count compliant</b>` : "every verdict fresh enough to mean something", t.stale ? "bad" : "")}
        ${card("Unknown / other", t.unknown + t.other, t.other ? `${t.other} configManager or similar` : "not clean — not counted as anything")}
      </div>`);
      if (t.staleCompliant) {
        parts.push(`<div class="list-card"><div class="gu-fail"><b>${t.staleCompliant} devices count as compliant AND are stale.</b><span class="why">A compliance verdict is as old as the check-in that produced it. These machines are in both cards above, deliberately — resolving the tension quietly in either direction would be a lie in that direction.</span></div></div>`);
      }
    } else {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>The device estate could not be read.</b><span class="why">${esc(rep.deviceError || "")} — every estate number is unknown, not zero.</span></div></div>`);
    }

    if (rep.policies) {
      const rows = rep.policies.map((p) => {
        const o = p.overview;
        const gap = p.overviewError || p.settingsError;
        const failN = (p.failingSettings || []).length;
        const bad = o ? o.noncompliant + o.error + o.conflict : 0;
        const cls = gap ? "warn" : bad ? "bad" : o ? "ok" : "warn";
        const isOpen = open.has(p.id);
        const head = `<div class="au-ev-h">
            <b>${esc(p.name)}</b>
            ${bad ? `<span class="au-op delete">${bad} failing</span>` : o ? `<span class="au-op create">clean</span>` : ""}
            ${p.assigned ? "" : `<span class="gu-how exc" title="No assignments — this policy evaluates nobody">unassigned</span>`}
            ${gap ? `<span class="gu-how priv" title="Statuses could not be read — unknown, not clean">status gap</span>` : ""}
            <span class="au-when mini muted">${esc(p.type.replace(/CompliancePolicy$/, ""))}</span>
          </div>
          <div class="mini muted au-ev-m">${o ? `${o.compliant} compliant · ${o.noncompliant} non-compliant · ${o.pending} pending` : "rollup unknown"}${failN ? ` · ${failN} setting${failN === 1 ? "" : "s"} failing` : ""} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>`;
        const detail = !isOpen ? "" : `<div class="au-detail">
          <div class="au-detail-grid mini">
            <span class="muted">Rollup</span><span>${o ? `${o.compliant} compliant · ${o.noncompliant} non-compliant · ${o.error} error · ${o.conflict} conflict · ${o.pending} pending · ${o.notApplicable} n/a` : `unknown — ${esc(p.overviewError || "status not returned")}`}</span>
            <span class="muted">Assignments</span><span>${p.assignments || 0}${p.assigned ? "" : " — evaluates nobody"}</span>
            ${p.settingsError ? `<span class="muted">Settings</span><span>could not be read — ${esc(p.settingsError)}</span>` : ""}
          </div>
          ${failN ? `<div class="mini muted" style="margin-top:6px">Failing settings — worst first</div>
            <ul class="mini au-diff">${p.failingSettings.map((s) => `<li>${esc(s.name)} — <b>${s.noncompliant}</b> non-compliant${s.error ? `, ${s.error} error` : ""}${s.conflict ? `, ${s.conflict} conflict` : ""} · ${s.compliant} fine</li>`).join("")}</ul>`
            : o ? `<p class="mini muted" style="margin:6px 0 0">No setting is failing anywhere this policy reaches.</p>` : ""}
          <p class="mini muted" style="margin:6px 0 0">Per-device drill-down for one machine is the 🖥 Device analyzer's job.</p>
        </div>`;
        return `<div class="au-fold ${cls} ${isOpen ? "open" : ""}" data-cppol="${esc(p.id)}"><div class="au-ev-card">${head}${detail}</div></div>`;
      }).join("");
      parts.push(`<div class="list-card">
        <h4 style="margin:0 0 4px">Policies (${rep.policies.length})</h4>
        <p class="mini muted" style="margin:0 0 10px">Worst first — click a policy for its full rollup and the settings failing under it. The numbers are Graph's cheap per-policy rollup, refreshed on Intune's schedule rather than live. A policy whose statuses could not be read is listed with the gap stated: <b>unknown is not clean</b>.</p>
        ${rows}
      </div>`);
    } else if (rep.policyError) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>Compliance policies could not be read.</b><span class="why">${esc(rep.policyError)}</span></div></div>`);
    }

    if (rep.devices && rep.devices.staleList.length) {
      const sl = rep.devices.staleList;
      parts.push(`<div class="list-card">
        <h4 style="margin:0 0 4px">Stale devices (${sl.length})</h4>
        <p class="mini muted" style="margin:0 0 10px">No check-in for more than ${rep.staleDays} days — oldest first. Whatever these report, they reported it then.</p>
        <div class="gu-tw"><table class="cg-table"><thead><tr><th>Device</th><th style="width:110px">OS</th><th>User</th><th style="width:120px">State</th><th style="width:170px">Last check-in</th></tr></thead>
        <tbody>${sl.slice(0, 50).map((d) => `<tr><td><a href="#" data-cpdev="${esc(d.name)}" title="Open in the Device analyzer — why does this machine have what it has, and when did it last say so"><b>${esc(d.name)}</b></a></td><td class="mini">${esc(d.os)}</td><td class="mini">${esc(d.user)}</td><td class="mini">${esc(d.state)}</td><td class="mini">${esc(String(d.lastSync).replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "Z"))}</td></tr>`).join("")}</tbody></table></div>
        ${sl.length > 50 ? `<p class="mini muted" style="margin:8px 0 0">Showing the oldest 50 of ${sl.length} — the CSV export carries all of them.</p>` : ""}
      </div>`);
    }

    $("cpBody").innerHTML = parts.join("");
  }

  function exportAs(fmt) {
    const m = Compliance.meta();
    if (fmt === "md") return download("Intune-compliance-report.md", Compliance.markdown(rep, m), "text/markdown");
    if (fmt === "stale") return download("Intune-stale-devices.csv", Compliance.staleCsv(rep), "text/csv");
    return download("Intune-compliance-report.csv", Compliance.csv(rep), "text/csv");
  }

  function init() {
    if (!$("cpRun")) return;
    $("cpRun").addEventListener("click", run);
    $("cpMd").addEventListener("click", () => exportAs("md"));
    $("cpCsv").addEventListener("click", () => exportAs("csv"));
    $("cpStale").addEventListener("click", () => exportAs("stale"));
    // A stale device opens in the Device analyzer (build 10398) — through
    // the tile's own handler, the matrix click-through's rule: crumb, tab
    // and sidebar all follow because the tool opened itself.
    $("cpBody").addEventListener("click", (e) => {
      const d = e.target.closest("[data-cpdev]");
      if (d) {
        e.preventDefault();
        const tile = $("toolDevice"), term = $("dvTerm"), go = $("dvRun");
        if (!tile || !term || !go) return;
        tile.click();
        term.value = d.dataset.cpdev;
        go.click();
        return;
      }
      // Fold/unfold a policy card. Links and code stay clickable-for-copy.
      const f = e.target.closest("[data-cppol]");
      if (!f || e.target.closest("a,code")) return;
      const id = f.dataset.cppol;
      open.has(id) ? open.delete(id) : open.add(id);
      render();
    });
  }

  return { init, run };
})();

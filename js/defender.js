// ======================================================================
// T15 — Defender status (R25). After Ugur Koc's Get Defender Status
// Report (MIT), whose question is the one that becomes an incident ticket
// later: on which machines is Defender silently off or outdated?
//
// TWO READS, BOTH BETA — that is where Graph keeps protection state.
// The tenant's own rollup (deviceProtectionOverview) for context, then
// every Windows device's windowsProtectionState. THE PER-DEVICE READ IS
// THE WHOLE COST, and the original pays it one device at a time with a
// sleep between requests — minutes of a terminal doing nothing on a large
// tenant. Folded into $batch here, twenty a trip, the R12/R19 technique.
//
// THREE HONESTY RULES the classification lives by:
//   * A device that NEVER REPORTED protection state is its own bucket,
//     never healthy by omission — a machine Defender has never reported
//     on is exactly the machine this report exists to find. A state that
//     could not be READ is in the same bucket with its error stated,
//     because unknown is not clean (the T09 rule).
//   * DISABLED AND NOT-REPORTED ARE DIFFERENT ANSWERS. The original
//     counts a null the same as a false; here a protection flag the
//     device did not report is listed as not reported, not as disabled —
//     accusing a machine of running without tamper protection when it
//     simply did not say is the kind of overstatement audits repeat.
//   * THE ROLLUP AND THE PER-DEVICE SUMS CAN DISAGREE — Graph refreshes
//     the overview on its own schedule. Both are shown, labelled, never
//     quietly reconciled.
//
// Reads only, and no new scope: both endpoints sit under the device read
// T06 brought in (DeviceManagementManagedDevices.Read.All).
// ======================================================================
const Defender = (() => {
  "use strict";

  const S = () => Graph.SCOPES;
  const lc = (s) => String(s || "").toLowerCase();

  // The three protection booleans: false is a finding, null/undefined is
  // NOT REPORTED — listed separately, never counted as disabled.
  const FLAGS = [
    ["malwareProtectionEnabled", "Malware protection disabled", "malware protection"],
    ["realTimeProtectionEnabled", "Real-time protection disabled", "real-time protection"],
    ["tamperProtectionEnabled", "Tamper protection disabled", "tamper protection"],
  ];

  function findingsOf(st) {
    const issues = [], unreported = [];
    for (const [prop, label, short] of FLAGS) {
      if (st[prop] === false) issues.push(label);
      else if (st[prop] !== true) unreported.push(short);
    }
    if (st.signatureUpdateOverdue === true) issues.push("Signature update overdue");
    if (st.quickScanOverdue === true) issues.push("Quick scan overdue");
    if (st.fullScanOverdue === true) issues.push("Full scan overdue");
    if (st.rebootRequired === true) issues.push("Reboot required");
    if (st.deviceState && lc(st.deviceState) !== "clean") issues.push(`Device state: ${st.deviceState}`);
    return { issues, unreported };
  }

  const fmtWhen = (s) => String(s || "").replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "Z");

  function rowOf(device, st, readError) {
    const base = {
      id: device.id,
      name: device.deviceName || device.id,
      user: device.userPrincipalName || "",
      lastSync: device.lastSyncDateTime || "",
    };
    // The original's own test, kept: a state without lastReportedDateTime is a
    // state that was never reported. A read error lands in the same bucket
    // with the error stated — unknown, not healthy.
    if (readError || !st || !st.lastReportedDateTime) {
      return Object.assign(base, {
        bucket: "nostate",
        reason: readError ? `could not be read — ${String(readError).slice(0, 140)}` : "never reported protection state",
        issues: [], unreported: [],
        deviceState: "", realTime: null, tamper: null, malware: null,
        signatureVersion: "", signatureOverdue: null, engineVersion: "", antiMalwareVersion: "",
        lastReported: "",
      });
    }
    const f = findingsOf(st);
    return Object.assign(base, {
      bucket: f.issues.length ? "issues" : "healthy",
      reason: "",
      issues: f.issues, unreported: f.unreported,
      deviceState: st.deviceState || "",
      realTime: st.realTimeProtectionEnabled === true ? true : st.realTimeProtectionEnabled === false ? false : null,
      tamper: st.tamperProtectionEnabled === true ? true : st.tamperProtectionEnabled === false ? false : null,
      malware: st.malwareProtectionEnabled === true ? true : st.malwareProtectionEnabled === false ? false : null,
      signatureVersion: st.signatureVersion || "",
      signatureOverdue: st.signatureUpdateOverdue === true,
      engineVersion: st.engineVersion || "",
      antiMalwareVersion: st.antiMalwareVersion || "",
      lastReported: st.lastReportedDateTime || "",
    });
  }

  async function report(opts) {
    const o = opts || {};
    const onStatus = o.onStatus || (() => {});
    const out = { overview: null, overviewError: null, devices: null, deviceError: null, totals: null };

    // The tenant rollup — cheap, immediate context, and allowed to fail
    // without taking the per-device answer with it.
    onStatus("Reading the tenant protection overview…");
    try { out.overview = await Graph.readOne("/deviceManagement/deviceProtectionOverview", { scopes: S().devices, beta: true }); }
    catch (e) { out.overviewError = String((e && e.message) || e).slice(0, 240); }

    onStatus("Reading Windows devices…");
    let windowsDevices;
    try {
      windowsDevices = await Graph.readAll(
        `${Graph.BETA}/deviceManagement/managedDevices?$filter=operatingSystem eq 'Windows'&$select=id,deviceName,userPrincipalName,lastSyncDateTime&$top=999`,
        { scopes: S().devices, retry: true },
      );
    } catch (e) {
      out.deviceError = String((e && e.message) || e).slice(0, 240);
      return out;
    }

    // The N+1, batched: one windowsProtectionState per device, twenty a trip.
    onStatus(`Reading protection state — ${windowsDevices.length} devices…`);
    const reqs = windowsDevices.map((d) => ({ id: String(d.id), url: `/deviceManagement/managedDevices/${d.id}/windowsProtectionState` }));
    const states = reqs.length ? await Graph.batch(reqs, {
      beta: true, scopes: S().devices,
      onProgress: (done, total) => onStatus(`Reading protection state — ${done}/${total}`),
    }) : {};

    const rows = windowsDevices.map((d) => {
      const r = states[String(d.id)];
      return rowOf(d, r && r.body, r && r.error);
    });
    // Worst first: most findings on top, then the unknowns, then the healthy.
    const rank = { issues: 0, nostate: 1, healthy: 2 };
    rows.sort((a, b) => rank[a.bucket] - rank[b.bucket] || (b.issues.length - a.issues.length) || a.name.localeCompare(b.name));

    out.devices = rows;
    out.totals = {
      windows: rows.length,
      healthy: rows.filter((r) => r.bucket === "healthy").length,
      issues: rows.filter((r) => r.bucket === "issues").length,
      nostate: rows.filter((r) => r.bucket === "nostate").length,
    };
    return out;
  }

  // ---- exports ----
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  function meta() {
    return { when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "") };
  }
  const triState = (v) => v === true ? "on" : v === false ? "OFF" : "not reported";

  function markdown(rep, m) {
    const L = [];
    L.push("# Defender status report", "");
    L.push(`Generated ${m.when} by TUNO ${m.build}`, "");
    if (rep.deviceError) {
      L.push(`> **The Windows device list could not be read** — ${mdCell(rep.deviceError)}. Every per-device number below is unknown, not zero.`, "");
    } else if (rep.totals) {
      const t = rep.totals;
      L.push(`## Per device (${t.windows} Windows devices)`, "");
      L.push(`| Healthy | With findings | No state |`, `|---|---|---|`, `| ${t.healthy} | ${t.issues} | ${t.nostate} |`, "");
    }
    if (rep.overview) {
      const o = rep.overview;
      L.push(`## Graph's own rollup`, "");
      L.push(`Refreshed on its own schedule — it can disagree with the per-device sums above, and neither is quietly reconciled to the other.`, "");
      L.push(`| Reporting | Clean | Critical failures | Pending signatures | Pending restart | Inactive agent |`, `|---|---|---|---|---|---|`);
      L.push(`| ${o.totalReportedDeviceCount ?? "—"} | ${o.cleanDeviceCount ?? "—"} | ${o.criticalFailuresDeviceCount ?? "—"} | ${o.pendingSignatureUpdateDeviceCount ?? "—"} | ${o.pendingRestartDeviceCount ?? "—"} | ${o.inactiveThreatAgentDeviceCount ?? "—"} |`, "");
    } else if (rep.overviewError) {
      L.push(`## Graph's own rollup`, "", `> Could not be read — ${mdCell(rep.overviewError)}.`, "");
    }
    const withIssues = (rep.devices || []).filter((r) => r.bucket === "issues");
    if (withIssues.length) {
      L.push(`## Devices with findings (${withIssues.length}) — worst first`, "");
      L.push(`| Device | User | Findings | Signatures | Last reported |`, `|---|---|---|---|---|`);
      for (const r of withIssues) {
        L.push(`| ${mdCell(r.name)} | ${mdCell(r.user)} | ${mdCell(r.issues.join("; "))} | ${mdCell(r.signatureVersion)}${r.signatureOverdue ? " (overdue)" : ""} | ${mdCell(fmtWhen(r.lastReported))} |`);
      }
      L.push("");
    }
    const noState = (rep.devices || []).filter((r) => r.bucket === "nostate");
    if (noState.length) {
      L.push(`## No protection state (${noState.length}) — unknown, not healthy`, "");
      L.push(`A machine Defender has never reported on is exactly the machine this report exists to find.`, "");
      L.push(`| Device | User | Why | Last Intune sync |`, `|---|---|---|---|`);
      for (const r of noState) L.push(`| ${mdCell(r.name)} | ${mdCell(r.user)} | ${mdCell(r.reason)} | ${mdCell(fmtWhen(r.lastSync))} |`);
      L.push("");
    }
    const unrep = (rep.devices || []).filter((r) => r.unreported.length);
    if (unrep.length) {
      L.push(`> **${unrep.length} devices did not report every protection flag.** A flag the device did not report is listed as not reported, never counted as disabled — they are different answers.`, "");
    }
    L.push(`---`, `Reads only, per-device state over Graph's beta surface. Why a machine has the configuration it has is the 🖥 Device analyzer's job.`);
    return L.join("\n");
  }

  function csv(rep) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["device,user,bucket,deviceState,realTimeProtection,tamperProtection,malwareProtection,signatureVersion,signatureOverdue,engineVersion,antiMalwareVersion,lastReported,lastIntuneSync,findings,reason"];
    for (const r of rep.devices || []) {
      L.push([q(r.name), q(r.user), r.bucket, q(r.deviceState), triState(r.realTime), triState(r.tamper), triState(r.malware),
        q(r.signatureVersion), r.signatureOverdue === null ? "" : String(!!r.signatureOverdue), q(r.engineVersion), q(r.antiMalwareVersion),
        q(fmtWhen(r.lastReported)), q(fmtWhen(r.lastSync)), q(r.issues.join("; ")), q(r.reason)].join(","));
    }
    return L.join("\n");
  }

  return { findingsOf, rowOf, report, markdown, csv, meta, triState };
})();


// ======================================================================
// T15 — the screen. Engine above is DOM-free for the headless suite.
// ======================================================================
const DefenderTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let rep = null, running = false, bucketFilter = null;
  // Open folds keyed on DEVICE IDS — the T03 rule, so a re-render (or the
  // bucket filter) keeps them open.
  const open = new Set();

  function prog(msg) { TunoProgress.show("dfBody", "dfProg", msg); }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function showExports(on) { ["dfMd", "dfCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); }

  async function run() {
    if (running) return;
    running = true; $("dfRun").disabled = true; showExports(false); $("dfBody").innerHTML = ""; open.clear(); bucketFilter = null;
    try {
      await Graph.ensureScopes(Graph.SCOPES.devices);
      rep = await Defender.report({ onStatus: prog });
      prog("");
      render();
      showExports(!rep.deviceError);
    } catch (e) {
      $("dfBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
      prog("");
    } finally { running = false; $("dfRun").disabled = false; }
  }

  const fmtWhen = (s) => esc(String(s || "").replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "Z"));
  const tri = (v) => v === true ? "on" : v === false ? "<b>OFF</b>" : "<span class=\"muted\">not reported</span>";

  function render() {
    const parts = [];

    if (rep.deviceError) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>The Windows device list could not be read.</b><span class="why">${esc(rep.deviceError)} — every per-device number is unknown, not zero.</span></div></div>`);
      $("dfBody").innerHTML = parts.join("");
      return;
    }

    // Cards double as bucket filters — the T09 pattern: click to narrow,
    // click again for everything.
    const t = rep.totals;
    const card = (id, label, n, sub, cls) => `<button class="au-card au-card-btn ${bucketFilter === id ? "active" : ""}" data-dfbucket="${id}" type="button">
      <div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></button>`;
    parts.push(`<div class="au-cards">
      ${card("healthy", "Healthy", t.healthy, `of ${t.windows} Windows devices`, t.healthy ? "ok" : "")}
      ${card("issues", "With findings", t.issues, "worst first below", t.issues ? "bad" : "ok")}
      ${card("nostate", "No state", t.nostate, "never reported or unreadable — unknown, not healthy", t.nostate ? "bad" : "ok")}
    </div>`);

    if (rep.overview) {
      const o = rep.overview;
      parts.push(`<div class="list-card">
        <h4 style="margin:0 0 4px">Graph's own rollup</h4>
        <p class="mini muted" style="margin:0 0 8px">Refreshed on Graph's schedule, not this page's — it <b>can disagree</b> with the per-device counts above, and neither is quietly reconciled to the other.</p>
        <p class="mini" style="margin:0">${o.totalReportedDeviceCount ?? "—"} reporting · ${o.cleanDeviceCount ?? "—"} clean · ${o.criticalFailuresDeviceCount ?? "—"} critical failures · ${o.pendingSignatureUpdateDeviceCount ?? "—"} pending signature update · ${o.pendingRestartDeviceCount ?? "—"} pending restart · ${o.inactiveThreatAgentDeviceCount ?? "—"} inactive agent</p>
      </div>`);
    } else if (rep.overviewError) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>The tenant rollup could not be read.</b><span class="why">${esc(rep.overviewError)} — the per-device answer below stands on its own.</span></div></div>`);
    }

    const shown = (rep.devices || []).filter((r) => !bucketFilter || r.bucket === bucketFilter);
    const CAP = 200;
    const rows = shown.slice(0, CAP).map((r) => {
      const isOpen = open.has(r.id);
      const badge = r.bucket === "issues" ? `<span class="au-op delete">${r.issues.length} finding${r.issues.length === 1 ? "" : "s"}</span>`
        : r.bucket === "nostate" ? `<span class="gu-how priv" title="Unknown, not healthy">no state</span>`
        : `<span class="au-op create">healthy</span>`;
      const head = `<div class="au-ev-h">
          <b>${esc(r.name)}</b> ${badge}
          ${r.unreported.length ? `<span class="gu-how exc" title="A flag the device did not report is not a flag that is off">${r.unreported.length} not reported</span>` : ""}
          <span class="au-when mini muted">${esc(r.user)}</span>
        </div>
        <div class="mini muted au-ev-m">${r.bucket === "nostate" ? esc(r.reason) : `${esc(r.issues.slice(0, 3).join(" · ") || "no findings")}${r.issues.length > 3 ? ` · +${r.issues.length - 3} more` : ""}`} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>`;
      const detail = !isOpen ? "" : `<div class="au-detail">
        <div class="au-detail-grid mini">
          <span class="muted">Device state</span><span>${esc(r.deviceState) || "<span class=\"muted\">not reported</span>"}</span>
          <span class="muted">Real-time protection</span><span>${tri(r.realTime)}</span>
          <span class="muted">Tamper protection</span><span>${tri(r.tamper)}</span>
          <span class="muted">Malware protection</span><span>${tri(r.malware)}</span>
          <span class="muted">Signatures</span><span>${esc(r.signatureVersion) || "—"}${r.signatureOverdue ? " · <b>update overdue</b>" : ""}</span>
          <span class="muted">Engine / platform</span><span>${esc(r.engineVersion) || "—"} / ${esc(r.antiMalwareVersion) || "—"}</span>
          <span class="muted">Last reported</span><span>${fmtWhen(r.lastReported) || "never"}</span>
          <span class="muted">Last Intune sync</span><span>${fmtWhen(r.lastSync) || "—"}</span>
        </div>
        ${r.issues.length ? `<ul class="mini au-diff">${r.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
        ${r.unreported.length ? `<p class="mini muted" style="margin:6px 0 0">Not reported by the device: ${esc(r.unreported.join(", "))} — listed as unknown, never counted as disabled.</p>` : ""}
        <p class="mini muted" style="margin:6px 0 0"><a href="#" data-dfdev="${esc(r.name)}">Open in the 🖥 Device analyzer</a> — why this machine has the configuration it has.</p>
      </div>`;
      const cls = r.bucket === "issues" ? "bad" : r.bucket === "nostate" ? "warn" : "ok";
      return `<div class="au-fold ${cls} ${isOpen ? "open" : ""}" data-dffold="${esc(r.id)}"><div class="au-ev-card">${head}${detail}</div></div>`;
    }).join("");

    parts.push(`<div class="list-card">
      <h4 style="margin:0 0 4px">Devices (${shown.length}${bucketFilter ? ` of ${rep.totals.windows}` : ""})</h4>
      <p class="mini muted" style="margin:0 0 10px">Worst first — click a device for its full protection state. A flag the device did not report reads <i>not reported</i>, never <i>off</i>: they are different answers.</p>
      ${rows || `<p class="mini muted" style="margin:0">Nothing in this bucket.</p>`}
      ${shown.length > CAP ? `<p class="mini muted" style="margin:8px 0 0">Showing the worst ${CAP} of ${shown.length} — the CSV export carries all of them.</p>` : ""}
    </div>`);

    $("dfBody").innerHTML = parts.join("");

    $("dfBody").querySelectorAll("[data-dfbucket]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.dfbucket;
      bucketFilter = bucketFilter === k ? null : k;
      render();
    }));
  }

  function exportAs(fmt) {
    const m = Defender.meta();
    if (fmt === "md") return download("Defender-status-report.md", Defender.markdown(rep, m), "text/markdown");
    return download("Defender-status-report.csv", Defender.csv(rep), "text/csv");
  }

  function init() {
    if (!$("dfRun")) return;
    $("dfRun").addEventListener("click", run);
    $("dfMd").addEventListener("click", () => exportAs("md"));
    $("dfCsv").addEventListener("click", () => exportAs("csv"));
    $("dfBody").addEventListener("click", (e) => {
      // A device opens in the Device analyzer through the tile's own handler —
      // the compliance report's rule: crumb, tab and sidebar all follow.
      const d = e.target.closest("[data-dfdev]");
      if (d) {
        e.preventDefault();
        const tile = $("toolDevice"), term = $("dvTerm"), go = $("dvRun");
        if (!tile || !term || !go) return;
        tile.click();
        term.value = d.dataset.dfdev;
        go.click();
        return;
      }
      const f = e.target.closest("[data-dffold]");
      if (!f || e.target.closest("a,code,button")) return;
      const id = f.dataset.dffold;
      open.has(id) ? open.delete(id) : open.add(id);
      render();
    });
  }

  return { init, run };
})();

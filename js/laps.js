// ======================================================================
// T18 — Windows LAPS audit (R29). After Ugur Koc's Get Windows LAPS
// Audit (MIT). Windows LAPS escrows each machine's local administrator
// password into Entra; this reads the escrow METADATA — which devices
// have a backed-up password and how old it is — and cross-references
// every Intune Windows device. NOT ESCROWED and STALE are the two shapes
// of the same finding, a LAPS policy that is not applying, found before
// the day somebody needs the password that is not there.
//
// PASSWORDS ARE NEVER RETRIEVED, AND THERE IS NO SWITCH THAT WOULD.
// The scope is DeviceLocalCredential.ReadBasic.All — Graph cannot return
// a password value through it. The full Read.All, which can, belongs to
// R10's helpdesk viewer if that ever ships; an audit must not carry it.
//
// TWO GATES, SAID BEFORE THE RUN RATHER THAN FOUND INSIDE IT: the scope
// is the first new permission since Device.Read.All (10330) and is asked
// on the click; and Graph answers the escrow endpoint only for accounts
// holding a supported DIRECTORY role — Intune Administrator among them —
// so a consented tenant can still refuse a reader, and the refusal is
// explained as a role problem, not printed as a bare 403.
//
// TWO HONESTY RULES PAST THE ORIGINAL: a device whose enrolment record
// carries no Entra device id cannot be looked up — the original counts
// it NOT ESCROWED, which accuses a machine it never checked; here it is
// UNMATCHABLE, unknown, its own bucket. And escrow records matching no
// enrolled Windows device — retired machines whose passwords are still
// held — are listed as their own answer rather than silently ignored.
// An escrowed record without a backup timestamp is UNKNOWN AGE, neither
// healthy nor stale.
// ======================================================================
const Laps = (() => {
  "use strict";

  const S = () => Graph.SCOPES;
  const DEFAULT_MAX_AGE_DAYS = 60;

  const fmtWhen = (s) => String(s || "").replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "Z");

  // One device, one verdict — from the escrow record the directory holds
  // for its ENTRA id, which the original established is the join key.
  function rowOf(device, cred, maxAgeDays, now) {
    const base = {
      id: device.id,
      name: device.deviceName || device.id,
      user: device.userPrincipalName || "",
      entraId: device.azureADDeviceId || "",
      lastSync: device.lastSyncDateTime || "",
      lastBackup: "", ageDays: null,
    };
    if (!device.azureADDeviceId) {
      return Object.assign(base, { bucket: "unmatchable",
        why: "no Entra device id on the enrolment record — the escrow store cannot be checked for this machine; unknown, not 'not escrowed'" });
    }
    if (!cred) {
      return Object.assign(base, { bucket: "notEscrowed",
        why: "no escrowed password — the LAPS policy is not reaching this machine, or has not rotated since assignment" });
    }
    const t = Date.parse(cred.lastBackupDateTime || "");
    if (!Number.isFinite(t)) {
      return Object.assign(base, { bucket: "noTimestamp",
        why: "escrowed, but the record carries no usable backup time — age unknown, neither healthy nor stale" });
    }
    const age = Math.round(((now - t) / 86400000) * 10) / 10;
    return Object.assign(base, {
      lastBackup: cred.lastBackupDateTime, ageDays: age,
      bucket: age > maxAgeDays ? "stale" : "healthy",
      why: age > maxAgeDays ? `password backed up ${age} days ago — past the ${maxAgeDays}-day threshold, rotation is not happening` : "",
    });
  }

  async function report(opts) {
    const o = opts || {};
    const onStatus = o.onStatus || (() => {});
    const maxAgeDays = Number.isFinite(+o.maxAgeDays) && +o.maxAgeDays > 0 ? +o.maxAgeDays : DEFAULT_MAX_AGE_DAYS;
    const out = { maxAgeDays, devices: null, deviceError: null, creds: null, credError: null,
      credRoleGate: false, rows: null, orphans: null, totals: null };

    onStatus("Reading the LAPS escrow store…");
    try {
      out.creds = await Graph.readAll("/directory/deviceLocalCredentials?$select=id,deviceName,lastBackupDateTime", {
        scopes: S().laps, beta: true, retry: true,
      });
    } catch (e) {
      out.credError = String((e && e.message) || e).slice(0, 240);
      // Consent alone does not open this endpoint: Graph also requires the
      // CALLER to hold a supported directory role. A 403 after consent is
      // that gate, and it deserves its name.
      out.credRoleGate = /403|forbidden|authorization/i.test(out.credError);
    }

    onStatus("Reading Intune Windows devices…");
    try {
      out.devices = await Graph.readAll(
        `${Graph.BETA}/deviceManagement/managedDevices?$filter=operatingSystem eq 'Windows'&$select=id,deviceName,azureADDeviceId,lastSyncDateTime,userPrincipalName&$top=999`,
        { scopes: S().devices, retry: true },
      );
    } catch (e) { out.deviceError = String((e && e.message) || e).slice(0, 240); }

    if (out.creds && out.devices) {
      const byId = {};
      for (const c of out.creds) byId[c.id] = c;
      const now = Date.now();
      const claimed = new Set();
      const rows = out.devices.map((d) => {
        if (d.azureADDeviceId && byId[d.azureADDeviceId]) claimed.add(d.azureADDeviceId);
        return rowOf(d, d.azureADDeviceId ? byId[d.azureADDeviceId] : null, maxAgeDays, now);
      });
      const rank = { notEscrowed: 0, stale: 1, noTimestamp: 2, unmatchable: 3, healthy: 4 };
      rows.sort((a, b) => rank[a.bucket] - rank[b.bucket] || (b.ageDays || 0) - (a.ageDays || 0) || a.name.localeCompare(b.name));
      out.rows = rows;
      // Escrow records no enrolled Windows device claims — retired machines
      // whose passwords are still held. Their own answer, never ignored.
      out.orphans = out.creds.filter((c) => !claimed.has(c.id))
        .map((c) => ({ name: c.deviceName || c.id, id: c.id, lastBackup: c.lastBackupDateTime || "" }))
        .sort((a, b) => a.name.localeCompare(b.name));
      out.totals = {
        windows: rows.length,
        healthy: rows.filter((r) => r.bucket === "healthy").length,
        stale: rows.filter((r) => r.bucket === "stale").length,
        notEscrowed: rows.filter((r) => r.bucket === "notEscrowed").length,
        noTimestamp: rows.filter((r) => r.bucket === "noTimestamp").length,
        unmatchable: rows.filter((r) => r.bucket === "unmatchable").length,
        orphans: out.orphans.length,
      };
    }
    return out;
  }

  // ---- exports ----
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  function meta() {
    return { when: new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC"),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : "") };
  }
  const BUCKET_LABEL = { notEscrowed: "Not escrowed", stale: "Stale", noTimestamp: "Escrowed, age unknown", unmatchable: "Unmatchable", healthy: "Healthy" };

  function markdown(rep, m) {
    const L = [];
    L.push("# Windows LAPS audit", "");
    L.push(`Generated ${m.when} by TUNO ${m.build} — stale threshold: ${rep.maxAgeDays} days`, "");
    L.push(`Escrow metadata only — device names and backup times. **Passwords are never retrieved**, and the permission this runs under cannot return them.`, "");
    if (rep.credError) {
      L.push(rep.credRoleGate
        ? `> **The escrow store refused the read** — ${mdCell(rep.credError)}. The permission is consented, but Graph answers this endpoint only for accounts holding a supported directory role (Intune Administrator among them). This is about who you are, not what TUNO may do.`
        : `> **The escrow store could not be read** — ${mdCell(rep.credError)}. Every escrow answer below is unknown, not zero.`, "");
    }
    if (rep.deviceError) L.push(`> **The Windows device list could not be read** — ${mdCell(rep.deviceError)}.`, "");
    if (rep.totals) {
      const t = rep.totals;
      L.push(`## The fleet (${t.windows} Windows devices)`, "");
      L.push(`| Healthy | Stale | Not escrowed | Age unknown | Unmatchable |`, `|---|---|---|---|---|`);
      L.push(`| ${t.healthy} | ${t.stale} | ${t.notEscrowed} | ${t.noTimestamp} | ${t.unmatchable} |`, "");
      for (const bucket of ["notEscrowed", "stale", "noTimestamp", "unmatchable"]) {
        const rows = rep.rows.filter((r) => r.bucket === bucket);
        if (!rows.length) continue;
        L.push(`## ${BUCKET_LABEL[bucket]} (${rows.length})`, "");
        L.push(`| Device | User | Last backup | Age (days) | Why it is here |`, `|---|---|---|---|---|`);
        for (const r of rows) L.push(`| ${mdCell(r.name)} | ${mdCell(r.user)} | ${mdCell(fmtWhen(r.lastBackup)) || "—"} | ${r.ageDays ?? "—"} | ${mdCell(r.why)} |`);
        L.push("");
      }
      if (rep.orphans.length) {
        L.push(`## Escrowed, not enrolled (${rep.orphans.length})`, "");
        L.push(`Escrow records no enrolled Windows device claims — retired machines whose passwords are still held. Metadata worth a look, not a finding by itself.`, "");
        L.push(`| Record | Last backup |`, `|---|---|`);
        for (const c of rep.orphans) L.push(`| ${mdCell(c.name)} | ${mdCell(fmtWhen(c.lastBackup)) || "—"} |`);
        L.push("");
      }
    }
    L.push(`---`, `Not escrowed and stale are the two shapes of one finding: a LAPS policy that is not applying. A device with no Entra device id on its record is unmatchable — unknown, never counted as not escrowed. Reading a password is a different act with a different permission, and this tool does not have it.`);
    return L.join("\n");
  }

  function csv(rep) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const L = ["device,user,entraDeviceId,bucket,lastBackup,ageDays,lastIntuneSync,why"];
    for (const r of rep.rows || []) {
      L.push([q(r.name), q(r.user), q(r.entraId), r.bucket, q(fmtWhen(r.lastBackup)), r.ageDays ?? "", q(fmtWhen(r.lastSync)), q(r.why)].join(","));
    }
    for (const c of rep.orphans || []) {
      L.push([q(c.name), "", q(c.id), "escrowedNotEnrolled", q(fmtWhen(c.lastBackup)), "", "", q("escrow record no enrolled Windows device claims")].join(","));
    }
    return L.join("\n");
  }

  return { DEFAULT_MAX_AGE_DAYS, BUCKET_LABEL, rowOf, report, markdown, csv, meta };
})();


// ======================================================================
// T18 — the screen. Engine above is DOM-free for the headless suite.
// ======================================================================
const LapsTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let rep = null, running = false, bucketFilter = null;
  const open = new Set();   // fold state keyed on device ids — the T03 rule

  function prog(msg) { TunoProgress.show("lpBody", "lpProg", msg); }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function showExports(on) { ["lpMd", "lpCsv"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; }); }

  async function run() {
    if (running) return;
    running = true; $("lpRun").disabled = true; showExports(false); $("lpBody").innerHTML = ""; open.clear(); bucketFilter = null;
    try {
      await Graph.ensureScopes([...new Set([...Graph.SCOPES.laps, ...Graph.SCOPES.devices])]);
      rep = await Laps.report({ maxAgeDays: $("lpDays").value, onStatus: prog });
      prog("");
      render();
      showExports(!!rep.totals);
    } catch (e) {
      $("lpBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div></div>`;
      prog("");
    } finally { running = false; $("lpRun").disabled = false; }
  }

  const fmtWhen = (s) => esc(String(s || "").replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "Z"));

  function render() {
    const parts = [];

    if (rep.credError) {
      parts.push(rep.credRoleGate
        ? `<div class="list-card"><div class="gu-fail"><b>The escrow store refused the read — this is a directory-role gate, not a consent problem.</b><span class="why">${esc(rep.credError)}. Graph answers this endpoint only for accounts holding a supported directory role — Intune Administrator among them. This is about who you are, not what TUNO may do: the permission cannot open it for an account without the role — sign in as someone who holds one.</span></div></div>`
        : `<div class="list-card"><div class="gu-fail"><b>The escrow store could not be read.</b><span class="why">${esc(rep.credError)} — every escrow answer is unknown, not zero.</span></div></div>`);
    }
    if (rep.deviceError) {
      parts.push(`<div class="list-card"><div class="gu-fail"><b>The Windows device list could not be read.</b><span class="why">${esc(rep.deviceError)}</span></div></div>`);
    }
    if (!rep.totals) { $("lpBody").innerHTML = parts.join(""); return; }

    const t = rep.totals;
    const card = (id, label, n, sub, cls) => `<button class="au-card au-card-btn ${bucketFilter === id ? "active" : ""}" data-lpbucket="${id}" type="button">
      <div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></button>`;
    parts.push(`<div class="au-cards">
      ${card("healthy", "Healthy", t.healthy, `backed up within ${rep.maxAgeDays} days`, t.healthy ? "ok" : "")}
      ${card("stale", "Stale", t.stale, `older than ${rep.maxAgeDays} days — rotation is not happening`, t.stale ? "bad" : "ok")}
      ${card("notEscrowed", "Not escrowed", t.notEscrowed, "no backed-up password at all", t.notEscrowed ? "bad" : "ok")}
      ${card("noTimestamp", "Age unknown", t.noTimestamp, "escrowed, no usable backup time", t.noTimestamp ? "bad" : "ok")}
      ${card("unmatchable", "Unmatchable", t.unmatchable, "no Entra device id — unknown, not 'not escrowed'", t.unmatchable ? "bad" : "ok")}
    </div>`);

    // THE STICKY CHIPS (10542, T19's fix): the bucket filter, pinned above
    // the 200 folds — a compact second face of the cards.
    const chip = (id, label, n) => `<button class="fchip${bucketFilter === id ? " active" : ""}" data-lpbucket="${id || ""}" type="button">${label} (${n})</button>`;
    parts.push(`<div class="toolbar">${chip(null, "All", (rep.rows || []).length)}${chip("healthy", "Healthy", t.healthy)}${chip("stale", "Stale", t.stale)}${chip("notEscrowed", "Not escrowed", t.notEscrowed)}${chip("noTimestamp", "Age unknown", t.noTimestamp)}${chip("unmatchable", "Unmatchable", t.unmatchable)}</div>`);
    const shown = (rep.rows || []).filter((r) => !bucketFilter || r.bucket === bucketFilter);
    const CAP = 200;
    const badgeOf = (r) => r.bucket === "healthy" ? `<span class="au-op create">healthy</span>`
      : r.bucket === "stale" ? `<span class="au-op delete">${r.ageDays}d old</span>`
      : r.bucket === "notEscrowed" ? `<span class="au-op delete">not escrowed</span>`
      : r.bucket === "noTimestamp" ? `<span class="gu-how priv">age unknown</span>`
      : `<span class="gu-how exc">unmatchable</span>`;
    const rows = shown.slice(0, CAP).map((r) => {
      const isOpen = open.has(r.id);
      const head = `<div class="au-ev-h"><b>${esc(r.name)}</b> ${badgeOf(r)}
          <span class="au-when mini muted">${esc(r.user)}</span></div>
        <div class="mini muted au-ev-m">${r.bucket === "healthy" ? `backed up ${fmtWhen(r.lastBackup)} · ${r.ageDays}d ago` : esc(r.why)} <span class="au-chev">${isOpen ? "▴" : "▾"}</span></div>`;
      const detail = !isOpen ? "" : `<div class="au-detail">
        <div class="au-detail-grid mini">
          <span class="muted">Last backup</span><span>${fmtWhen(r.lastBackup) || "never seen"}</span>
          <span class="muted">Password age</span><span>${r.ageDays !== null ? `${r.ageDays} days (threshold ${rep.maxAgeDays})` : "unknown"}</span>
          <span class="muted">Entra device id</span><span>${r.entraId ? `<code>${esc(r.entraId)}</code>` : "absent from the enrolment record — the join key this audit matches on"}</span>
          <span class="muted">Last Intune sync</span><span>${fmtWhen(r.lastSync) || "—"}</span>
        </div>
        <p class="mini muted" style="margin:6px 0 0"><a href="#" data-lpdev="${esc(r.name)}">Open in the 🖥 Device analyzer</a> — whether a LAPS policy is even reaching this machine.</p>
      </div>`;
      const cls = r.bucket === "healthy" ? "ok" : r.bucket === "unmatchable" || r.bucket === "noTimestamp" ? "warn" : "bad";
      return `<div class="au-fold ${cls} ${isOpen ? "open" : ""}" data-lpfold="${esc(r.id)}"><div class="au-ev-card">${head}${detail}</div></div>`;
    }).join("");

    parts.push(`<div class="list-card">
      <h4 style="margin:0 0 4px">Devices (${shown.length}${bucketFilter ? ` of ${t.windows}` : ""})</h4>
      <p class="mini muted" style="margin:0 0 10px">Worst first. Not escrowed and stale are the two shapes of one finding — a LAPS policy that is not applying. <b>Passwords are never retrieved</b>; the permission this runs under cannot return them.</p>
      ${rows || `<p class="mini muted" style="margin:0">Nothing in this bucket.</p>`}
      ${shown.length > CAP ? `<p class="mini muted" style="margin:8px 0 0">Showing the worst ${CAP} of ${shown.length} — the CSV export carries all of them.</p>` : ""}
    </div>`);

    if (rep.orphans && rep.orphans.length) {
      parts.push(`<div class="list-card">
        <h4 style="margin:0 0 4px">Escrowed, not enrolled (${rep.orphans.length})</h4>
        <p class="mini muted" style="margin:0 0 10px">Escrow records no enrolled Windows device claims — retired machines whose passwords are still held. Metadata worth a look, not a finding by itself; the original ignores these silently.</p>
        <div class="gu-tw"><table class="cg-table"><thead><tr><th>Record</th><th style="width:200px">Last backup</th></tr></thead>
        <tbody>${rep.orphans.slice(0, 50).map((c) => `<tr><td><b>${esc(c.name)}</b></td><td class="mini">${fmtWhen(c.lastBackup) || "—"}</td></tr>`).join("")}</tbody></table></div>
        ${rep.orphans.length > 50 ? `<p class="mini muted" style="margin:8px 0 0">Showing 50 of ${rep.orphans.length} — the CSV export carries all of them.</p>` : ""}
      </div>`);
    }

    $("lpBody").innerHTML = parts.join("");
    $("lpBody").querySelectorAll("[data-lpbucket]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.lpbucket || null;   // the All chip clears (10542)
      bucketFilter = bucketFilter === k ? null : k;
      render();
    }));
  }

  function exportAs(fmt) {
    const m = Laps.meta();
    if (fmt === "md") return download("Windows-LAPS-audit.md", Laps.markdown(rep, m), "text/markdown");
    return download("Windows-LAPS-audit.csv", Laps.csv(rep), "text/csv");
  }

  function init() {
    if (!$("lpRun")) return;
    $("lpRun").addEventListener("click", run);
    $("lpMd").addEventListener("click", () => exportAs("md"));
    $("lpCsv").addEventListener("click", () => exportAs("csv"));
    $("lpBody").addEventListener("click", (e) => {
      const d = e.target.closest("[data-lpdev]");
      if (d) {
        e.preventDefault();
        const tile = $("toolDevice"), term = $("dvTerm"), go = $("dvRun");
        if (!tile || !term || !go) return;
        tile.click();
        term.value = d.dataset.lpdev;
        go.click();
        return;
      }
      const f = e.target.closest("[data-lpfold]");
      if (!f || e.target.closest("a,code,button")) return;
      const id = f.dataset.lpfold;
      open.has(id) ? open.delete(id) : open.add(id);
      render();
    });
  }

  return { init, run };
})();

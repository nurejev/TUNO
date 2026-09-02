// ======================================================================
// T25 — 🧹 Entra device cleanup (BETA, R36). Stale directory devices,
// staged out in two deliberate steps: DISABLE at 30 days of silence,
// DELETE at 90 — and delete ONLY what is already disabled. A machine
// goes dark before it goes away, and the gap between the two is where
// somebody notices the laptop in the drawer still matters.
//
// THE READ is the ENTRA DEVICE OBJECT (/devices, Device.Read.All — held
// since 10330), not the Intune enrolment: approximateLastSignInDateTime
// is the directory's own "last time this device authenticated", which
// is the staleness that matters for cleanup. Its name says APPROXIMATE
// and so does this screen.
//
// THE BUCKETS, and the honesty rules that shape them:
//   * active            — contact within the disable threshold
//   * stale, enabled    — no contact ≥ 30d: the DISABLE candidates. A
//                         90d+ enabled device is STILL only a disable
//                         candidate — delete comes after disable, never
//                         instead of it.
//   * disabled, waiting — disabled, but not yet 90d silent: parked.
//   * delete candidates — ≥ 90d silent AND already disabled.
//   * NEVER SEEN / UNKNOWN — no approximateLastSignInDateTime at all.
//                         Unknown is NOT stale: an Autopilot object that
//                         never booted and a device the API answers
//                         nothing for would both read "stale forever",
//                         and disabling either on that basis is a guess.
//                         Its own bucket, no action offered.
//
// THE WRITES are TUNO's first directory-device writes —
// Device.ReadWrite.All, NEW at this build, taken in the open per the
// R18 rule (registration script and SECURITY.md in the same commit;
// every customer tenant pays one more admin-consent round trip, said
// here rather than discovered). AND CONSENT ALONE IS NOT ENOUGH:
// Graph gates device enable/disable/delete on the signed-in user's
// DIRECTORY ROLE (Cloud Device Administrator or Intune Administrator
// among them) — the T18 rule: the second gate is named before the run,
// and a 403 after consent is explained as "who you are, not what TUNO
// may do", never a bare status code.
//
// THE PIPELINE is T11's, sized for devices: plan → confirm → apply,
// every write preceded by a FRESH per-device read and followed by a
// read-back. A device re-enabled after the plan is REFUSED at delete
// (drift — somebody wants it back); one that signed in since the plan
// is refused at both (it woke up). Deletes additionally require the
// word DELETE typed, because a deleted device object takes its
// BitLocker recovery keys with it — said on screen and in the report.
// Autopilot-registered devices are refused by Graph itself; the row
// reports the refusal in the tenant's words.
//
// THE REPORT (Mihai's ask): 📝 one Markdown file — the estate summary,
// every action taken with its outcome, the candidates that remain, and
// the unknowns — written from the same state the screen renders.
// ======================================================================
const DeviceCleanup = (() => {
  "use strict";

  const DEFAULTS = { disableDays: 30, deleteDays: 90 };
  const SELECT = "id,deviceId,displayName,operatingSystem,operatingSystemVersion,approximateLastSignInDateTime,accountEnabled,trustType,isManaged,profileType,registrationDateTime";

  const daysSince = (iso, now) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return Math.floor(((now || Date.now()) - t) / 86400000);
  };

  async function readDevices(onStatus) {
    onStatus && onStatus("Reading the directory's devices…");
    return Graph.readAll(`/devices?$select=${SELECT}&$top=999`, { scopes: Graph.SCOPES.deviceObjects, retry: true });
  }

  // Every device lands in exactly one bucket; unknown is its own, actionless.
  function bucketize(devices, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const now = o.now || Date.now();
    const out = { active: [], stale: [], parked: [], deletable: [], unknown: [], thresholds: o };
    for (const d of devices || []) {
      const days = daysSince(d.approximateLastSignInDateTime, now);
      const row = { d, days };
      if (days === null) { out.unknown.push(row); continue; }
      if (days < o.disableDays) { out.active.push(row); continue; }
      if (d.accountEnabled === false) {
        (days >= o.deleteDays ? out.deletable : out.parked).push(row);
      } else {
        out.stale.push(row);   // 90d+ enabled still lands HERE — disable first
      }
    }
    const byDays = (a, b) => (b.days ?? -1) - (a.days ?? -1);
    out.stale.sort(byDays); out.deletable.sort(byDays); out.parked.sort(byDays);
    return out;
  }

  // ---- apply: fresh per-device read, then the write, then the read-back --
  // ops: [{ kind: "disable"|"delete", d, days }]
  async function apply(ops, opts) {
    const o = opts || {};
    const now = o.now || Date.now();
    const disableDays = (o.thresholds || DEFAULTS).disableDays;
    const results = [];
    for (const op of ops) {
      const name = op.d.displayName || op.d.id;
      try {
        o.onStatus && o.onStatus(`${name} — fresh read…`);
        const fresh = await Graph.readOne(`/devices/${op.d.id}?$select=id,accountEnabled,approximateLastSignInDateTime`, { scopes: Graph.SCOPES.deviceObjects });
        if (!fresh) { results.push({ op, outcome: "skipped", detail: "gone from the directory since the plan" }); continue; }
        const freshDays = daysSince(fresh.approximateLastSignInDateTime, now);
        // it WOKE UP: a sign-in since the plan withdraws every claim
        if (freshDays !== null && freshDays < disableDays) {
          results.push({ op, outcome: "skipped", detail: `signed in ${freshDays} day${freshDays === 1 ? "" : "s"} ago — the device woke up; the plan's claim no longer holds` });
          continue;
        }
        if (op.kind === "disable") {
          if (fresh.accountEnabled === false) { results.push({ op, outcome: "skipped", detail: "already disabled" }); continue; }
          o.onStatus && o.onStatus(`${name} — disabling…`);
          await Graph.patch(`/devices/${op.d.id}`, { accountEnabled: false }, { scopes: Graph.SCOPES.deviceObjectsWrite });
          const back = await Graph.readOne(`/devices/${op.d.id}?$select=accountEnabled`, { scopes: Graph.SCOPES.deviceObjects });
          if (!back || back.accountEnabled !== false) throw new Error("the write went through but the read-back does not say disabled — check the portal");
          results.push({ op, outcome: "disabled", detail: "verified by read-back" });
        } else {
          // DELETE COMES AFTER DISABLE — a re-enabled device is somebody's
          // decision, and this tool does not overrule people
          if (fresh.accountEnabled !== false) {
            results.push({ op, outcome: "refused", detail: "not disabled any more — re-enabled since the plan; somebody wants it back" });
            continue;
          }
          o.onStatus && o.onStatus(`${name} — deleting…`);
          await Graph.del(`/devices/${op.d.id}`, { scopes: Graph.SCOPES.deviceObjectsWrite });
          let stillThere = null;
          try { stillThere = await Graph.readOne(`/devices/${op.d.id}?$select=id`, { scopes: Graph.SCOPES.deviceObjects }); } catch { stillThere = null; }
          if (stillThere) throw new Error("the delete returned but the device still reads back — check the portal");
          results.push({ op, outcome: "deleted", detail: "verified — the directory no longer returns it" });
        }
      } catch (e) {
        const msg = String((e && e.message) || e);
        results.push({ op, outcome: "failed",
          detail: /403|authoriz|forbidden/i.test(msg)
            ? `${msg} — consent is in place; this is Graph's DIRECTORY-ROLE gate on device writes (who you are, not what TUNO may do)`
            : msg });
      }
    }
    return results;
  }

  // ---- the report (Mihai's ask): one Markdown, same state as the screen --
  function markdown(state) {
    const s = state || {};
    const b = s.buckets;
    const L = [];
    const cell = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const dev = (r) => `| ${cell(r.d.displayName || r.d.id)} | ${cell(r.d.operatingSystem || "—")} | ${r.days === null ? "never seen" : r.days + "d"} | ${r.d.accountEnabled === false ? "disabled" : "enabled"} |${r.d.isManaged ? " managed |" : " |"}`;
    const head = `| Device | OS | Last contact | State | Managed |\n|---|---|---|---|---|`;
    L.push("# Entra stale-device cleanup", "");
    L.push(`Generated ${new Date().toISOString().replace("T", " ").replace(/\..*/, " UTC")} by TUNO ${typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""}${s.tenant ? ` · ${s.tenant}` : ""}`, "");
    L.push(`Thresholds: disable after **${b.thresholds.disableDays} days** without contact, delete after **${b.thresholds.deleteDays}** — and only what is already disabled. Last contact is the directory's \`approximateLastSignInDateTime\`; its name says approximate and so does this report.`, "");
    L.push(`${b.active.length + b.stale.length + b.parked.length + b.deletable.length + b.unknown.length} devices: ${b.active.length} active · ${b.stale.length} stale and enabled (disable candidates) · ${b.parked.length} disabled and waiting · ${b.deletable.length} delete candidates · ${b.unknown.length} never seen / unknown.`, "");
    if (s.results && s.results.length) {
      const done = (k, title) => {
        const rows = s.results.filter((r) => r.outcome === k);
        if (!rows.length) return;
        L.push(`## ${title} (${rows.length})`, "", head);
        rows.forEach((r) => L.push(dev(r.op) + ` ${cell(r.detail)} |`.replace(/^ /, " ")));
        L.push("");
      };
      L.push(`## Actions taken`, "");
      done("disabled", "Disabled");
      done("deleted", "Deleted");
      const nope = s.results.filter((r) => r.outcome === "skipped" || r.outcome === "refused" || r.outcome === "failed");
      if (nope.length) {
        L.push(`### Not done, and why (${nope.length})`, "");
        nope.forEach((r) => L.push(`- **${cell(r.op.d.displayName || r.op.d.id)}** — ${r.outcome}: ${cell(r.detail)}`));
        L.push("");
      }
    }
    const section = (rows, title, note) => {
      L.push(`## ${title} (${rows.length})`, "");
      if (note) L.push(note, "");
      if (rows.length) { L.push(head); rows.forEach((r) => L.push(dev(r))); }
      L.push("");
    };
    section(b.stale, "Stale and still enabled — disable candidates", "Enabled, no contact beyond the disable threshold. The 90-day-plus rows here are STILL only disable candidates — delete follows disable, never replaces it.");
    section(b.deletable, "Disabled and silent beyond the delete threshold — delete candidates", "**Deleting a device object deletes its BitLocker recovery keys with it.** An Autopilot-registered device is refused by the service until it is deregistered from Autopilot.");
    section(b.parked, "Disabled, waiting out the delete threshold", null);
    section(b.unknown, "Never seen / unknown — no action offered", "The directory returned no last sign-in. Unknown is not stale: acting on these would be a guess, so this tool does not.");
    return L.join("\n");
  }

  return { DEFAULTS, SELECT, daysSince, readDevices, bucketize, apply, markdown };
})();

// ======================================================================
// T25 — the screen. Read → buckets as cards → two tick-tables (disable /
// delete) with the master-checkbox selection — the 10531 pattern — a
// typed DELETE for the destructive half, and the report always one
// click away.
// ======================================================================
const DeviceCleanupTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let devices = null, buckets = null, lastResults = null, running = false;
  // THE RAIL (10549, Mihai's spec — his words are the pick, no mockup
  // round needed): Overview | ① Disable | ② Delete | Results as panes, so
  // switching between the 30-day and the 90-day question is a click, not a
  // scroll past a long device table. Both step counts stay on the rail at
  // all times, so delete-after-disable remains visible even paned.
  let dcuPane = "overview";
  // Ticks survive a pane switch: selection is STATE keyed on device ids,
  // the DOM checkboxes are one face of it (the 10531 rule, made durable).
  const selD = new Set(), selX = new Set();
  let resultsHtml = "";
  const prog = (m) => TunoProgress.show("dcuBody", "dcuProg", m);
  const download = (name, text, type) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/markdown" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const tenantName = () => { const n = $("tenantName"); return (n && n.textContent) || ""; };
  const thresholds = () => ({
    disableDays: Math.max(1, +($("dcuDisableDays").value || 0) || DeviceCleanup.DEFAULTS.disableDays),
    deleteDays: Math.max(2, +($("dcuDeleteDays").value || 0) || DeviceCleanup.DEFAULTS.deleteDays),
  });

  async function run() {
    if (running) return;
    running = true; $("dcuRun").disabled = true; $("dcuBody").innerHTML = ""; lastResults = null;
    try {
      prog("Checking permissions…");
      await Graph.ensureScopes(Graph.SCOPES.deviceObjects);
      devices = await DeviceCleanup.readDevices(prog);
      buckets = DeviceCleanup.bucketize(devices, thresholds());
      dcuPane = "overview"; selD.clear(); selX.clear(); resultsHtml = "";
      prog("");
      render();
    } catch (e) {
      prog("");
      $("dcuBody").innerHTML = `<div class="gu-fail"><b>The read failed.</b><span class="why">${esc((e && e.message) || e)}</span></div>`;
    } finally { running = false; $("dcuRun").disabled = false; }
  }

  function render() {
    const b = buckets;
    // Cards double as pane switches (10549): the Stale and Delete cards
    // open their panes — the jump anchors of 10548, grown into the rail.
    const card = (label, n, sub, cls, pane2) => `<div class="au-card${pane2 ? " au-card-btn" : ""}"${pane2 ? ` data-dcupane="${pane2}" role="button" tabindex="0" title="Open the section"` : ""}><div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></div>`;
    const managedChip = (d) => d.isManaged ? ` <span class="gu-how priv" title="Enrolled in Intune — deleting the directory object does not unenrol it; prefer retiring it in Intune first">managed</span>` : "";
    const row = (r, i, tickAttr, sel) => `<tr>
      <td style="width:30px"><input type="checkbox" data-${tickAttr}="${i}"${sel.has(r.d.id) ? " checked" : ""}></td>
      <td class="mini"><b>${esc(r.d.displayName || r.d.id)}</b>${managedChip(r.d)}<div class="mini muted">${esc(r.d.operatingSystem || "—")}${r.d.operatingSystemVersion ? ` ${esc(r.d.operatingSystemVersion)}` : ""} · ${esc(r.d.trustType || "")}</div></td>
      <td class="mini">${r.days}d silent</td>
      <td class="mini">${r.d.accountEnabled === false ? `<span class="gu-how exc">disabled</span>` : `<span class="gu-how inc">enabled</span>`}</td>
    </tr>`;
    const table = (rows, tickAttr, masterId, head, sel) => `
      <div class="gu-tw"><table class="cg-table"><thead><tr><th style="width:34px"><input type="checkbox" id="${masterId}" title="Select or deselect every row below"></th><th>${head}</th><th style="width:110px">Silence</th><th style="width:110px">State</th></tr></thead>
      <tbody>${rows.map((r, i) => row(r, i, tickAttr, sel)).join("") || `<tr><td colspan="4" class="mini">Nothing here.</td></tr>`}</tbody></table></div>`;
    const caveat = `<p class="mini muted" style="margin:10px 0 0">Last contact is the directory's <code>approximateLastSignInDateTime</code> — its name says approximate, so a day either side is noise, not signal. <b>Deleting a device object deletes its BitLocker recovery keys with it</b>; Autopilot-registered devices are refused by the service until deregistered.</p>`;

    const ov = `
      <div class="au-cards">
        ${card("Active", b.active.length, `contact within ${b.thresholds.disableDays}d`, "ok")}
        ${card("Stale, enabled", b.stale.length, "disable candidates — click to open", b.stale.length ? "warn" : "", "disable")}
        ${card("Disabled, waiting", b.parked.length, `not yet ${b.thresholds.deleteDays}d silent`)}
        ${card("Delete candidates", b.deletable.length, "disabled AND silent beyond the delete line — click to open", b.deletable.length ? "bad" : "", "delete")}
        ${card("Never seen", b.unknown.length, "unknown is not stale — no action offered")}
      </div>
      ${caveat}
      <div class="tb-actions" style="margin-top:12px">
        <button class="btn" id="dcuMd">📝 Report (Markdown)</button>
      </div>`;

    // THE FLOATING BAR (10549, Mihai's ask off the live screenshot): the
    // action follows the ticking — .ae-selbar, the 10400 bar he picked for
    // T11, so a long table never puts the button a scroll away. It appears
    // with the first tick; ✕ clears the selection.
    const dis = `
      <div class="list-card" style="margin-top:0">
        <h4 style="margin:0 0 6px">① Disable — ${b.stale.length} stale and still enabled <span class="tag block">writes to the tenant</span></h4>
        <p class="mini muted" style="margin:0 0 8px">Reversible — a disabled device can be re-enabled in the portal. Every 90-day-plus device that is still enabled sits HERE, not in delete: delete follows disable, never replaces it.</p>
        <div class="tb-actions" style="margin:0 0 8px">
          <button class="btn" id="dcuAllD">☑ Select all</button><button class="btn" id="dcuNoneD">☐ Select none</button>
          <span class="mini muted" id="dcuCountD"></span>
        </div>
        ${table(b.stale, "dcud", "dcuMasterD", "Device", selD)}
      </div>
      <div class="ae-selbar" id="dcuBarD"><b id="dcuBarDCount"></b>
        <button class="btn primary" id="dcuDisableBtn">🌙 Disable the ticked <span class="tag block">writes</span></button>
        <button class="ae-selbar-x" id="dcuBarDX" title="Clear the selection">✕</button></div>`;

    const del = `
      <div class="list-card" style="margin-top:0">
        <h4 style="margin:0 0 6px">② Delete — ${b.deletable.length} disabled and silent past ${b.thresholds.deleteDays} days <span class="tag block">writes to the tenant</span></h4>
        <p class="mini muted" style="margin:0 0 8px"><b>Not reversible.</b> The BitLocker recovery keys go with the object. Each delete re-checks the device first: re-enabled since the plan → refused (somebody wants it back); signed in since → refused (it woke up). Every 90-day-plus device still ENABLED sits in ① — delete follows disable.</p>
        <div class="tb-actions" style="margin:0 0 8px">
          <button class="btn" id="dcuAllX">☑ Select all</button><button class="btn" id="dcuNoneX">☐ Select none</button>
          <span class="mini muted" id="dcuCountX"></span>
        </div>
        ${table(b.deletable, "dcux", "dcuMasterX", "Device", selX)}
      </div>
      <div class="ae-selbar" id="dcuBarX"><b id="dcuBarXCount"></b>
        <label class="mini" style="display:inline-flex;align-items:center;gap:6px;color:#fff">Type <b>DELETE</b> to arm: <input id="dcuConfirm" style="width:110px" autocomplete="off"></label>
        <button class="btn primary" id="dcuDeleteBtn" disabled>🗑 Delete the ticked <span class="tag block">writes</span></button>
        <button class="ae-selbar-x" id="dcuBarXX" title="Clear the selection">✕</button></div>`;

    const res = `
      <div class="list-card" style="margin-top:0">
        <h4 style="margin:0 0 6px">Results — this session</h4>
        ${resultsHtml || `<p class="mini muted" style="margin:0">No actions run yet. Tick devices in ① or ② and the floating button appears.</p>`}
        <div class="tb-actions" style="margin-top:10px">
          <button class="btn" id="dcuMd">📝 Report (Markdown)</button>
        </div>
      </div>
      <div id="dcuResults" style="margin-top:10px"></div>`;

    // ---- the rail: both step counts always visible, red is work waiting
    const node = (id, icon, label, right, bad) => `<div class="ep-node${dcuPane === id ? " active" : ""}" data-dcupane="${id}" role="button" tabindex="0">
      <span>${icon} ${label}</span><span class="mini" style="margin-left:auto;white-space:nowrap${bad ? ";color:var(--off)" : ""}">${right}</span></div>`;
    const rail = node("overview", "🧹", "Overview", devices ? devices.length : "—", false)
      + node("disable", "🌙", "① Disable", b.stale.length, b.stale.length > 0)
      + node("delete", "🗑", "② Delete", b.deletable.length, b.deletable.length > 0)
      + node("results", "📋", "Results", lastResults ? lastResults.length : "—", false);
    const paneHtml = { overview: ov, disable: dis, delete: del, results: res }[dcuPane] || ov;
    $("dcuBody").innerHTML = `<div class="ep-wrap"><div class="ep-rail">${rail}</div><div class="ep-main">${paneHtml}</div></div>`;

    // ---- wiring ----
    $("dcuBody").querySelectorAll("[data-dcupane]").forEach((n) => n.addEventListener("click", () => {
      dcuPane = n.dataset.dcupane;
      render();
    }));

    // the 10531 selection pattern — now FOUR faces of one selection: the
    // master box, the all/none buttons, the row ticks, and the floating bar
    const wireSel = (tickAttr, masterId, allId, noneId, countId, sel, rows2, barId, barCountId) => {
      const master = $(masterId);
      if (!master) return () => {};
      const ticks = () => [...$("dcuBody").querySelectorAll(`[data-${tickAttr}]`)];
      const sync = () => {
        const t = ticks(), on = t.filter((c) => c.checked).length;
        sel.clear();
        t.forEach((c) => { if (c.checked) sel.add(rows2[+c.dataset[tickAttr]].d.id); });
        master.checked = on > 0 && on === t.length;
        master.indeterminate = on > 0 && on < t.length;
        const c2 = $(countId); if (c2) c2.textContent = t.length ? `${on} of ${t.length} ticked` : "";
        const bar = $(barId);
        if (bar) {
          bar.classList.toggle("visible", on > 0);
          const bc = $(barCountId); if (bc) bc.textContent = `${on} device${on === 1 ? "" : "s"} ticked`;
        }
      };
      const setAll = (v) => { ticks().forEach((c) => { c.checked = v; }); sync(); };
      master.addEventListener("change", () => setAll(master.checked));
      $(allId).addEventListener("click", () => setAll(true));
      $(noneId).addEventListener("click", () => setAll(false));
      ticks().forEach((c) => c.addEventListener("change", sync));
      sync();
      return setAll;
    };
    if (dcuPane === "disable") {
      const setAll = wireSel("dcud", "dcuMasterD", "dcuAllD", "dcuNoneD", "dcuCountD", selD, b.stale, "dcuBarD", "dcuBarDCount");
      $("dcuBarDX").addEventListener("click", () => setAll(false));
      $("dcuDisableBtn").addEventListener("click", () => act("disable"));
    }
    if (dcuPane === "delete") {
      const setAll = wireSel("dcux", "dcuMasterX", "dcuAllX", "dcuNoneX", "dcuCountX", selX, b.deletable, "dcuBarX", "dcuBarXCount");
      $("dcuBarXX").addEventListener("click", () => setAll(false));
      $("dcuConfirm").addEventListener("input", () => { $("dcuDeleteBtn").disabled = $("dcuConfirm").value.trim() !== "DELETE"; });
      $("dcuDeleteBtn").addEventListener("click", () => act("delete"));
    }
    if ($("dcuMd")) $("dcuMd").addEventListener("click", () => download(`entra-device-cleanup-${new Date().toISOString().slice(0, 10)}.md`,
      DeviceCleanup.markdown({ buckets, results: lastResults, tenant: tenantName() })));
  }

  async function act(kind) {
    if (running || !buckets) return;
    const src = kind === "disable" ? buckets.stale : buckets.deletable;
    const attr = kind === "disable" ? "dcud" : "dcux";
    const ops = [...$("dcuBody").querySelectorAll(`[data-${attr}]`)]
      .filter((c) => c.checked)
      .map((c) => ({ kind, ...src[+c.dataset[attr]] }));
    if (!ops.length) return;   // the floating bar only shows with a tick
    running = true;
    try {
      // the write scope at the click that writes — TUNO's first directory-
      // device write, new at this build, the R18 rule honoured in the open
      await Graph.ensureScopes(Graph.SCOPES.deviceObjectsWrite);
      const results = await DeviceCleanup.apply(ops, { onStatus: prog, thresholds: buckets.thresholds });
      prog("");
      lastResults = (lastResults || []).concat(results);
      const good = results.filter((r) => r.outcome === "disabled" || r.outcome === "deleted").length;
      const bad = results.filter((r) => r.outcome === "failed").length;
      // the acted selection is spent; the answer lands on the Results pane
      (kind === "disable" ? selD : selX).clear();
      resultsHtml = `
        <p class="mini" style="margin:0 0 6px"><b>${good} ${kind === "disable" ? "disabled" : "deleted"}</b>${bad ? ` · <b style="color:var(--off)">${bad} failed</b>` : ""} · ${results.length - good - bad} skipped/refused — every verdict is a read-back, not a status code. 📝 the report carries all of it; 🧹 Read again re-buckets.</p>
        ${results.filter((r) => r.outcome !== "disabled" && r.outcome !== "deleted").map((r) => `<div class="gu-fail"><b>${esc(r.op.d.displayName || r.op.d.id)}</b><span class="why">${esc(r.outcome)}: ${esc(r.detail)}</span></div>`).join("")}` + resultsHtml;
      dcuPane = "results";
      render();
    } catch (e) {
      prog("");
      resultsHtml = `<div class="gu-fail"><b>${esc(GroupUse.shortErr(e, 300))}</b></div>` + resultsHtml;
      dcuPane = "results";
      render();
    } finally { running = false; }
  }

  function init() {
    if (!$("dcuRun")) return;
    $("dcuRun").addEventListener("click", run);
  }

  return { init, _setForTest: (d, t) => { devices = d; buckets = DeviceCleanup.bucketize(d, t); lastResults = null; render(); } };
})();

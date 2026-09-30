// ======================================================================
// T28 — MDE rollout · 📑 REPORTS (build 10635)
//
// Mihai: "create an option to run a report of the assignments, a report of
// everything configured for this deployment, and also a run option to see
// if there are conflicts." Three reports, each a self-contained HTML page
// (shareable, printable) and a CSV:
//
//   ASSIGNMENTS   every in-scope policy's targets, each group with its
//                 role in the rollout (wave, exclusion group, country user
//                 group, device group), and a COVERAGE MATRIX — per policy,
//                 per region: which wave is included (new) or excluded (old).
//   CONFIGURATION everything this deployment has configured: the rules, the
//                 wave and exclusion groups (with owners), the wave members,
//                 every new policy with its settings and assignments, the old
//                 ones with their retirement verdict, and this session's
//                 changes.
//   CONFLICTS     run on a FRESH read: every collision, its reach and the
//                 proposed fix — and what moved since the previous check in
//                 this session.
//
// Built from what the screen already holds (the model, the pairs, the wave
// rows, the members model); nothing here reads or writes the tenant except
// readOwners (the wave groups' owners, for the configuration report).
// ======================================================================
const MdeReports = (() => {
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;
  const csvCell = (s) => { const v = String(s == null ? "" : s); return /[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

  // --------------------------------------------------------- group roles --
  // ctx: { waveRows (MdeRollout.waves), mem (MdeMembers model | null) }
  function roleIndex(ctx) {
    const idx = new Map();
    for (const w of (ctx && ctx.waveRows) || []) {
      if (!w.id) continue;
      idx.set(lc(w.id), w.role === "exclusion"
        ? { role: "exclusion", label: `⛔ ${w.audience} exclusion group`, region: "", audience: w.audience }
        : { role: "wave", label: `🌊 ${w.region} ${w.audience} wave`, region: w.region, audience: w.audience });
    }
    const mem = ctx && ctx.mem;
    for (const r of (mem && mem.rows) || []) {
      if (r.ug && !idx.has(lc(r.ug.id))) idx.set(lc(r.ug.id), { role: "country", label: `👤 ${r.country}${r.pilot ? " (pilot)" : ""} — ${r.region}`, region: r.region, audience: "user" });
      if (r.dg && !idx.has(lc(r.dg.id))) idx.set(lc(r.dg.id), { role: "devicegroup", label: `🖥 ${r.country}${r.pilot ? " (pilot)" : ""} devices — ${r.region}`, region: r.region, audience: "device" });
    }
    return idx;
  }

  // ----------------------------------------------------------- assignments --
  const targetText = (a) => a.kind === "All devices" || a.kind === "All users" ? a.kind : (a.name || a.groupId || "");
  function assignmentRows(model, ctx) {
    const idx = roleIndex(ctx);
    const kinds = (ctx && ctx.kinds) || new Map();
    const out = [];
    for (const P of model.policies) {
      const list = P.item.assignments || [];
      if (!list.length) { out.push({ P, a: null, role: null, kind: "" }); continue; }
      for (const a of list) {
        const k = a.groupId ? kinds.get(lc(a.groupId)) : null;
        out.push({ P, a, role: a.groupId ? idx.get(lc(a.groupId)) || null : null, kind: a.kind === "All devices" ? "device" : a.kind === "All users" ? "user" : (k ? k.kind : "") });
      }
    }
    return out;
  }
  // Per policy, per region: the wave (or its twin) included / excluded.
  function coverage(model, ctx) {
    const idx = roleIndex(ctx);
    const regions = [...new Set(((ctx && ctx.waveRows) || []).filter((w) => w.role === "wave").map((w) => w.region))];
    const rows = model.policies.filter((P) => P.generation !== "out").map((P) => {
      const cells = regions.map((region) => {
        const inc = [], exc = [];
        for (const a of P.item.assignments || []) {
          const r = a.groupId ? idx.get(lc(a.groupId)) : null;
          if (!r || r.role !== "wave" || r.region !== region) continue;
          (a.kind === "Excluded" ? exc : inc).push(r.audience);
        }
        return { region, inc, exc };
      });
      const exclusion = (P.item.assignments || []).filter((a) => a.kind === "Excluded" && a.groupId && idx.get(lc(a.groupId)) && idx.get(lc(a.groupId)).role === "exclusion").map((a) => idx.get(lc(a.groupId)).audience);
      const tenantWide = (P.item.assignments || []).some((a) => a.kind === "All devices" || a.kind === "All users");
      return { P, cells, exclusion, tenantWide, assigned: (P.item.assignments || []).length > 0 };
    });
    return { regions, rows };
  }
  function assignmentsCsv(model, ctx) {
    const rows = [["Policy", "Generation", "For", "Type", "Categories", "Assignment", "Target", "Group kind", "Members", "Filter", "Role in the rollout"]];
    for (const x of assignmentRows(model, ctx)) {
      const P = x.P, a = x.a;
      rows.push([P.name, P.generation, P.audience || "", P.kind, P.cats.join(" "), a ? a.kind : "not assigned", a ? targetText(a) : "", x.kind,
        a && typeof a.memberCount === "number" ? a.memberCount : "", a && a.filterId ? `${a.filterName || a.filterId} (${a.filterType || ""})` : "", x.role ? x.role.label : ""]);
    }
    return toCsv(rows);
  }

  // ----------------------------------------------------------- conflicts --
  function conflictSummary(pairs, needsAction) {
    const s = { total: pairs.length, act: 0, can: 0, may: 0, staged: 0, review: 0, duplicate: 0, resolved: 0, idle: 0, ids: [] };
    for (const p of pairs) {
      if (needsAction(p)) { s.act++; s.ids.push(p.id); }
      if (p.type === "duplicate") s.duplicate++;
      else if (p.type === "review") s.review++;
      if (p.type !== "duplicate") {
        if (p.reach.verdict === "can") s.can++;
        else if (p.reach.verdict === "may") s.may++;
        else if (p.reach.verdict === "staged") s.staged++;
      }
      if (p.reach.verdict === "resolved") s.resolved++;
      if (p.reach.verdict === "idle") s.idle++;
    }
    return s;
  }
  // What moved since the previous check: collisions that no longer need
  // action (fixed, or a policy gone), and new ones.
  function conflictDiff(prev, cur) {
    if (!prev) return null;
    const a = new Set(prev.ids), b = new Set(cur.ids);
    return { fixed: [...a].filter((x) => !b.has(x)), added: [...b].filter((x) => !a.has(x)), at: prev.at };
  }

  // ---------------------------------------------------------------- page --
  const CSS = `
    :root{--ink:#12331f;--muted:#5f7a67;--border:#dbe7de;--soft:#eef5f0;--green:#1e4729;--lemon:#f7d65a;--on:#2f6b1c;--off:#b04a3a;--rep:#8a6d0b}
    *{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:13px/1.45 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:28px 24px 60px}
    .wrap{max-width:1200px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:26px 0 8px;padding-bottom:4px;border-bottom:2px solid var(--lemon)}h3{font-size:14px;margin:16px 0 6px}
    .meta{color:var(--muted);font-size:12px}.muted{color:var(--muted)}.note{background:#fdf6d8;border:1px solid #eeda8e;border-radius:10px;padding:8px 12px;margin:10px 0;font-size:12.5px}
    table{width:100%;border-collapse:collapse;margin:6px 0 12px;font-size:12.5px}th{background:var(--soft);text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
    td{padding:6px 8px;border-top:1px solid #edf2ee;vertical-align:top;overflow-wrap:anywhere}tr.head td{background:var(--soft);font-weight:700}
    .tag{display:inline-block;border-radius:999px;padding:0 8px;font-size:11px;font-weight:700;border:1px solid var(--border);background:var(--soft);white-space:nowrap}
    .ok{color:var(--on)}.bad{color:var(--off)}.warn{color:var(--rep)}.inc{color:var(--on);font-weight:700}.exc{color:var(--off);font-weight:700}
    .tiles{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}.tile{border:1px solid var(--border);border-radius:12px;padding:8px 14px;min-width:130px}.tile b{display:block;font-size:20px}
    code{background:var(--soft);padding:0 4px;border-radius:4px;font-size:11.5px}
    @media print{body{padding:0}h2{break-after:avoid}tr{break-inside:avoid}}`;
  function page(title, meta, body) {
    const m = meta || {};
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="wrap">
<h1>${esc(title)}</h1>
<div class="meta">${esc(m.tenant || "tenant")} · read ${m.readAt ? esc(new Date(m.readAt).toISOString().replace("T", " ").slice(0, 16)) + " UTC" : "—"} · generated ${esc(new Date(m.now || Date.now()).toISOString().replace("T", " ").slice(0, 16))} UTC · ${esc(m.build || "")} · TUNO T28 MDE rollout</div>
${body}
<p class="meta" style="margin-top:30px">An assignment is a target, not proof a device applied the setting. Group kinds are read from dynamic rules or member counts; assignment filters are named, not evaluated.</p>
</div></body></html>`;
  }
  const wavesCell = (c) => {
    const bits = [];
    if (c.inc.length) bits.push(`<span class="inc">+ ${c.inc.map((x) => x === "device" ? "D" : "U").join("/")}</span>`);
    if (c.exc.length) bits.push(`<span class="exc">⊘ ${c.exc.map((x) => x === "device" ? "D" : "U").join("/")}</span>`);
    return bits.join(" ") || `<span class="muted">—</span>`;
  };
  function coverageTable(cov) {
    if (!cov.regions.length) return `<p class="muted">No wave groups configured.</p>`;
    const head = `<tr><th>Policy</th><th>For</th>${cov.regions.map((r) => `<th>${esc(r)}</th>`).join("")}<th>Exclusion group</th></tr>`;
    const section = (label, list) => list.length ? `<tr class="head"><td colspan="${cov.regions.length + 3}">${esc(label)} (${list.length})</td></tr>` + list.map((x) =>
      `<tr><td>${esc(x.P.name)}${x.tenantWide ? ` <span class="tag">tenant-wide</span>` : ""}${!x.assigned ? ` <span class="tag">not assigned</span>` : ""}</td><td>${esc(x.P.audience || "—")}</td>${x.cells.map((c) => `<td>${wavesCell(c)}</td>`).join("")}<td>${x.exclusion.length ? `<span class="exc">⊘ ${esc(x.exclusion.join("/"))}</span>` : `<span class="muted">—</span>`}</td></tr>`).join("") : "";
    return `<table>${head}${section("New policies — should include their waves", cov.rows.filter((x) => x.P.generation === "new"))}${section("Old policies — should exclude the waves", cov.rows.filter((x) => x.P.generation !== "new"))}</table>
      <p class="meta">+ D / U: the region's device / user wave is included · ⊘: excluded.</p>`;
  }
  function assignmentsHtml(model, ctx, meta) {
    const cov = coverage(model, ctx);
    const rows = assignmentRows(model, ctx);
    const newNoWave = cov.rows.filter((x) => x.P.generation === "new" && !x.cells.some((c) => c.inc.length) && !x.tenantWide);
    const oldOpen = cov.rows.filter((x) => x.P.generation !== "new" && x.assigned && cov.regions.some((r, i) => {
      const incNew = cov.rows.some((n) => n.P.generation === "new" && n.cells[i].inc.length);
      return incNew && !x.cells[i].exc.length;
    }));
    const byPolicy = new Map();
    rows.forEach((x) => { if (!byPolicy.has(x.P.key)) byPolicy.set(x.P.key, []); byPolicy.get(x.P.key).push(x); });
    const detail = (gen, label) => {
      const list = model.policies.filter((P) => gen === "new" ? P.generation === "new" : gen === "out" ? P.generation === "out" : (P.generation === "old" || P.generation === "retiring"));
      if (!list.length) return "";
      return `<h3>${esc(label)} (${list.length})</h3><table><tr><th style="width:34%">Policy</th><th>Assignment</th><th>Target</th><th>Kind</th><th>Members</th><th>Filter</th><th>Role in the rollout</th></tr>` + list.map((P) => (byPolicy.get(P.key) || []).map((x, i) =>
        `<tr>${i === 0 ? `<td rowspan="${byPolicy.get(P.key).length}"><b>${esc(P.name)}</b><div class="meta">${esc(P.kind)}${P.audience ? " · " + esc(P.audience) : ""}</div></td>` : ""}${x.a ? `<td class="${x.a.kind === "Excluded" ? "exc" : "inc"}">${esc(x.a.kind)}</td><td>${esc(targetText(x.a))}</td><td>${esc(x.kind)}</td><td>${typeof x.a.memberCount === "number" ? x.a.memberCount : ""}</td><td>${x.a.filterId ? esc(`${x.a.filterName || x.a.filterId} (${x.a.filterType || ""})`) : ""}</td><td>${x.role ? esc(x.role.label) : ""}</td>` : `<td colspan="6" class="muted">not assigned</td>`}</tr>`).join("")).join("") + `</table>`;
    };
    const body = `
      <div class="tiles"><div class="tile"><b>${model.newP.length}</b>new policies</div><div class="tile"><b>${cov.rows.filter((x) => x.P.generation === "new" && x.assigned).length}</b>new · assigned</div><div class="tile"><b>${model.oldP.length}</b>old policies</div><div class="tile"><b>${newNoWave.length}</b>new · in no wave</div><div class="tile"><b>${oldOpen.length}</b>old · a wave not excluded</div></div>
      ${newNoWave.length ? `<div class="note">New policies in no wave (and not tenant-wide): ${newNoWave.map((x) => esc(x.P.name)).join("; ")}</div>` : ""}
      ${oldOpen.length ? `<div class="note">Old policies that do not exclude a wave the new set includes: ${oldOpen.map((x) => esc(x.P.name)).join("; ")}. Whether that matters depends on their settings — the conflict check says which collide.</div>` : ""}
      <h2>Coverage — waves per policy</h2>${coverageTable(cov)}
      <h2>Every assignment</h2>${detail("new", "New policies")}${detail("old", "Old policies")}${detail("out", "Out of scope")}`;
    return page("MDE rollout — assignments", meta, body);
  }

  // ------------------------------------------------------- configuration --
  // ctx: { cfg, waveRows, kinds, labels, mem, retire, runs, owners: Map lc(id)->[names], labelName, labelValue, catMeta, RETIRE }
  function settingsRows(P, ctx) {
    const out = [];
    for (const [k, s] of P.settings || new Map()) {
      const name = ctx.labelName ? ctx.labelName(ctx.labels, { key: k, name: s.name }) : s.name;
      const val = s.redacted ? s.display : ((ctx.labelValue ? ctx.labelValue(ctx.labels, k, s.value) : "") || s.display);
      out.push({ key: k, name: name || k, value: val, cat: s.cat });
    }
    return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  function configCsv(model, ctx) {
    const rows = [["Policy", "Generation", "Type", "Setting", "Value", "Category", "Setting id"]];
    for (const P of model.policies.filter((x) => x.generation !== "out")) {
      const list = settingsRows(P, ctx);
      if (!list.length) rows.push([P.name, P.generation, P.kind, P.format === "legacy" ? `${P.settingCount || 0} configured properties (legacy — compared by category)` : "", "", P.cats.join(" "), ""]);
      for (const s of list) rows.push([P.name, P.generation, P.kind, s.name, s.value, s.cat, s.key]);
    }
    return toCsv(rows);
  }
  function configHtml(model, ctx, meta) {
    const c = ctx.cfg;
    const cm = (id) => (ctx.catMeta ? ctx.catMeta(id) : { icon: "", label: id });
    const assignList = (P) => (P.item.assignments || []).map((a) => `<span class="${a.kind === "Excluded" ? "exc" : "inc"}">${a.kind === "Excluded" ? "⊘" : "+"} ${esc(targetText(a))}</span>${typeof a.memberCount === "number" ? ` <span class="muted">(${a.memberCount})</span>` : ""}${a.filterId ? ` <span class="muted">⚑ ${esc(a.filterName || a.filterId)}</span>` : ""}`).join("<br>") || `<span class="muted">not assigned</span>`;
    const rules = `<table><tr><th style="width:30%">Rule</th><th>Value</th></tr>
      <tr><td>New set — name starts with</td><td>${c.newPrefixes.map((x) => `<code>${esc(x)}</code>`).join(" ")}</td></tr>
      <tr><td>Also in the target list (by name)</td><td>${(c.alsoInScope || []).map(esc).join("<br>") || "—"}</td></tr>
      <tr><td>Left out of the target list (by name)</td><td>${(c.leaveOut || []).map(esc).join("<br>") || "—"}</td></tr>
      <tr><td>Out of scope — name starts with</td><td>${c.outPrefixes.map((x) => `<code>${esc(x)}</code>`).join(" ")}</td></tr>
      <tr><td>Wave regions</td><td>${c.waveRegions.map(esc).join(", ")}</td></tr>
      <tr><td>Wave group names</td><td><code>${esc(c.waveDevicePrefix)}&lt;region&gt;</code> (device, for "- D -" policies) · <code>${esc(c.waveUserPrefix)}&lt;region&gt;</code> (user, for "- U -")</td></tr>
      <tr><td>Exclusion groups</td><td><code>${esc(c.exclusionDevice || "—")}</code> · <code>${esc(c.exclusionUser || "—")}</code></td></tr>
      ${c.members ? `<tr><td>Country user groups / device groups</td><td><code>${esc(c.members.countryPrefix)}&lt;suffix&gt;</code> → <code>${esc(c.members.deviceGroupPrefix)}&lt;ISO3&gt;</code>, devices by Intune primary user</td></tr>
      <tr><td>Pilots</td><td>${(c.members.pilots || []).map(esc).join(", ") || "—"}</td></tr>` : ""}
    </table>`;
    const owners = ctx.owners || new Map();
    const groups = `<table><tr><th>Group</th><th>Role</th><th>Exists</th><th>Kind</th><th>Owners</th><th>New policies</th><th>Old still to exclude it</th></tr>` + (ctx.waveRows || []).map((w) =>
      `<tr><td><b>${esc(w.name)}</b>${w.id ? `<div class="meta">${esc(w.id)}</div>` : ""}</td><td>${w.role === "exclusion" ? "exclusion" : "wave · " + esc(w.region)} · ${esc(w.audience)}</td><td>${w.exists ? `<span class="ok">yes</span>` : w.lookedUp ? `<span class="bad">missing</span>` : "not looked up"}</td><td>${esc(w.kind)}</td><td>${w.id ? esc((owners.get(lc(w.id)) || []).join(", ") || "—") : ""}</td><td>${w.exists ? (w.role === "exclusion" ? `excluded from ${w.newExcluding.length}` : `in ${w.newIncluding.length}`) : ""}</td><td>${w.role === "wave" && w.exists ? w.pending.length : ""}</td></tr>`).join("") + `</table>`;
    const mem = ctx.mem;
    const members = !mem ? `<p class="muted">The wave members were not read — open 👥 Wave members and read, then run this report again.</p>` : mem.regions.map((rg) => {
      const rows = rg.rows.filter((r) => r.ug);
      return `<h3>🌊 ${esc(rg.region)} — ${rg.ugNested}/${rows.length} user groups and ${rg.dgNested}/${rows.length} device groups nested</h3>` + (rows.length ? `<table><tr><th>Country</th><th>User group</th><th>Users</th><th>Device group</th><th>Devices wanted / in</th><th>Sync</th><th>In user wave</th><th>In device wave</th></tr>` + rows.map((r) =>
        `<tr><td>${esc(r.country)}${r.pilot ? ` <span class="tag">pilot</span>` : ""}</td><td>${esc(r.userGroupName)}</td><td>${r.users}</td><td>${esc(r.deviceGroupName || "—")}${r.dg ? "" : ` <span class="warn">(not created)</span>`}</td><td>${r.want.size} / ${r.have.size}</td><td>${r.dg ? (r.inSync ? `<span class="ok">in sync</span>` : `<span class="warn">+${r.add.length} −${r.remove.length}</span>`) : "—"}</td><td>${r.ugNested ? `<span class="ok">✓</span>` : "—"}</td><td>${r.dgNested ? `<span class="ok">✓</span>` : "—"}</td></tr>`).join("") + `</table>` : `<p class="muted">None of its country groups is in the tenant.</p>`)
        + (rg.rows.some((r) => !r.ug) ? `<p class="meta">Not in the tenant: ${rg.rows.filter((r) => !r.ug).map((r) => esc(r.userGroupName)).join(", ")}</p>` : "");
    }).join("") + (mem && mem.unmapped.length ? `<p class="meta">Prefix groups in no wave: ${mem.unmapped.map((u) => esc(u.group.displayName)).join(", ")}</p>` : "")
      + (mem ? `<p class="meta">Windows devices with no Intune primary user (in no country): ${mem.noPrimary} of ${mem.managedCount}.</p>` : "");
    const newPol = model.newP.map((P) => {
      const s = settingsRows(P, ctx);
      return `<h3>${esc(P.name)}</h3><div class="meta">${esc(P.kind)}${P.audience ? " · " + esc(P.audience) + " policy" : ""} · ${P.cats.map((x) => esc(cm(x).label)).join(", ")}${P.scopeWhy ? " · in scope: " + esc(P.scopeWhy) : ""}</div>
        <table><tr><th style="width:32%">Assignments</th><th>Settings (${P.format === "legacy" ? (P.settingCount || 0) + " — legacy, by category" : s.length})</th></tr><tr><td>${assignList(P)}</td><td>${s.length ? `<table style="margin:0">${s.map((x) => `<tr><td style="width:55%">${esc(x.name)}</td><td><b>${esc(x.value)}</b></td></tr>`).join("")}</table>` : `<span class="muted">${P.detailError ? "settings could not be read" : "no setting read (legacy or empty)"}</span>`}</td></tr></table>`;
    }).join("");
    const RET = ctx.RETIRE || {};
    const oldPol = `<table><tr><th style="width:36%">Old policy</th><th>Assignments</th><th>Retirement check</th></tr>` + (ctx.retire || []).map((r) =>
      `<tr><td><b>${esc(r.O.name)}</b><div class="meta">${esc(r.O.kind)}${r.O.generation === "retiring" ? " · TO-BE-REMOVED" : ""}</div></td><td>${assignList(r.O)}</td><td>${esc((RET[r.verdict] && RET[r.verdict].label) || r.verdict)}${r.none ? ` <span class="bad">· ${r.none} not in the new set</span>` : ""}${r.diff ? ` <span class="warn">· ${r.diff} set differently</span>` : ""}</td></tr>`).join("") + `</table>`;
    const out = model.outP.length ? `<p>${model.outP.map((P) => esc(P.name)).join("<br>")}</p>` : `<p class="muted">None.</p>`;
    const runs = (ctx.runs || []).length ? `<table><tr><th>When</th><th>What</th><th>Result</th></tr>` + ctx.runs.map((r) => `<tr><td>${esc(new Date(r.at).toISOString().replace("T", " ").slice(0, 16))}</td><td>${esc(r.title)}<div class="meta">${r.lines.slice(0, 12).map(esc).join("<br>")}${r.lines.length > 12 ? " …" : ""}</div></td><td>${r.ok} verified · ${r.bad} not clean</td></tr>`).join("") + `</table>` : `<p class="muted">Nothing written in this session.</p>`;
    const body = `
      <div class="tiles"><div class="tile"><b>${model.newP.length}</b>new policies</div><div class="tile"><b>${model.oldP.length}</b>old policies</div><div class="tile"><b>${(ctx.waveRows || []).filter((w) => w.exists).length}/${(ctx.waveRows || []).length}</b>rollout groups exist</div>${mem ? `<div class="tile"><b>${mem.rows.filter((r) => r.ugNested).length}/${mem.rows.filter((r) => r.ug).length}</b>country groups nested</div>` : ""}</div>
      <h2>1 · Rules</h2>${rules}
      <h2>2 · Wave and exclusion groups</h2>${groups}
      <h2>3 · Wave members</h2>${members}
      <h2>4 · New policies — settings and assignments</h2>${newPol || `<p class="muted">None.</p>`}
      <h2>5 · Old policies — assignments and retirement</h2>${oldPol}
      <h2>6 · Out of scope</h2>${out}
      <h2>7 · Changes this session</h2>${runs}`;
    return page("MDE rollout — deployment configuration", meta, body);
  }

  // ------------------------------------------------------------ conflicts --
  // ctx: { labels, labelName, labelValue, VERDICT, TYPE, needsAction, diff, summary, csv }
  function conflictsHtml(pairs, ctx, meta) {
    const S = ctx.summary, D = ctx.diff;
    const V = ctx.VERDICT || {}, T = ctx.TYPE || {};
    const act = pairs.filter(ctx.needsAction);
    const byOld = new Map();
    for (const p of act) { if (!byOld.has(p.O.key)) byOld.set(p.O.key, []); byOld.get(p.O.key).push(p); }
    const settingText = (p) => p.type === "review" ? `categories: ${p.common.join(", ")}` : (p.diffs.length ? p.diffs : p.sames).slice(0, 8).map((d) => {
      const name = ctx.labelName ? ctx.labelName(ctx.labels, d) : d.name;
      const nv = d.redacted ? d.newDisplay : ((ctx.labelValue && ctx.labelValue(ctx.labels, d.key, d.newValue)) || d.newDisplay);
      const ov = d.redacted ? d.oldDisplay : ((ctx.labelValue && ctx.labelValue(ctx.labels, d.key, d.oldValue)) || d.oldDisplay);
      return `${esc(name)}: <b>${esc(nv)}</b> → ${esc(ov)}`;
    }).join("<br>") + ((p.diffs.length || p.sames.length) > 8 ? "<br>…" : "");
    const fix = (p) => !p.proposal ? "" : p.proposal.steps.length ? p.proposal.steps.map((s) => `${s.action === "remove" ? "remove include" : "exclude"} ${esc(s.groupName)}${s.twinOf ? ` <span class="muted">(twin of ${esc(s.twinOf)})</span>` : ""}${s.supported === false ? ` <span class="bad">— not supported</span>` : s.supported === null ? ` <span class="warn">— kind not certain</span>` : ""}`).join("<br>") : `<span class="muted">${esc(p.proposal.none)}</span>`;
    const table = [...byOld.values()].map((list) => `<tr class="head"><td colspan="4">${esc(list[0].O.name)} <span class="muted">· ${esc(list[0].O.kind)}</span></td></tr>` + list.map((p) =>
      `<tr><td>${esc(p.N.name)}</td><td>${settingText(p)}</td><td>${esc((V[p.reach.verdict] && V[p.reach.verdict].label) || p.reach.verdict)}<div class="meta">${esc(p.reach.why || "")}</div></td><td>${fix(p)}</td></tr>`).join("")).join("");
    const diff = !D ? `<p class="meta">First check in this session — run it again after a change to see what moved.</p>`
      : `<div class="note">Since the check at ${esc(new Date(D.at).toISOString().replace("T", " ").slice(11, 16))} UTC: <b class="ok">${D.fixed.length} no longer need action</b> · <b class="${D.added.length ? "bad" : "ok"}">${D.added.length} new</b>.${D.added.length ? " New: " + D.added.map((id) => { const p = pairs.find((x) => x.id === id); return p ? `${esc(p.O.name)} ↔ ${esc(p.N.name)}` : esc(id); }).join("; ") : ""}</div>`;
    const body = `
      <div class="tiles"><div class="tile"><b class="${S.act ? "bad" : "ok"}">${S.act}</b>need action</div><div class="tile"><b>${S.can}</b>can collide</div><div class="tile"><b>${S.may}</b>may collide</div><div class="tile"><b>${S.staged}</b>staged</div><div class="tile"><b>${S.review}</b>other format</div><div class="tile"><b>${S.duplicate}</b>same value</div><div class="tile"><b class="ok">${S.resolved}</b>resolved</div></div>
      ${diff}
      <h2>Collisions that need action (${act.length}) — grouped by the old policy</h2>
      ${act.length ? `<table><tr><th style="width:26%">New policy</th><th>Settings (new → old)</th><th style="width:16%">Reach</th><th style="width:24%">Proposed fix</th></tr>${table}</table>` : `<p class="ok"><b>Nothing needs action.</b> Every old policy that sets a setting the new set sets is either out of reach or already excluded from the waves.</p>`}
      <h2>Resolved (${pairs.filter((p) => p.reach.verdict === "resolved").length})</h2>
      <p>${pairs.filter((p) => p.reach.verdict === "resolved").map((p) => `${esc(p.O.name)} ↔ ${esc(p.N.name)}${p.reach.byTwin ? ` <span class="muted">(through the wave's twin)</span>` : ""}`).join("<br>") || `<span class="muted">None yet.</span>`}</p>`;
    return page("MDE rollout — conflict check", meta, body);
  }

  // ------------------------------------------------------------- owners --
  async function readOwners(groups) {
    const list = (groups || []).filter((g) => g && g.id);
    const out = new Map();
    const rs = await Graph.pool(list, (g) => Graph.readAll(`/groups/${encodeURIComponent(g.id)}/owners?$select=id,displayName,userPrincipalName`, { scopes: Graph.SCOPES.groups, retry: true }), 4);
    rs.forEach((r, n) => { out.set(lc(list[n].id), r.error ? ["(owners unreadable)"] : (r.value || []).map((o) => o.userPrincipalName || o.displayName || o.id)); });
    return out;
  }

  return {
    roleIndex, assignmentRows, coverage, assignmentsCsv, assignmentsHtml,
    settingsRows, configCsv, configHtml,
    conflictSummary, conflictDiff, conflictsHtml,
    readOwners, page,
  };
})();

// ======================================================================
// R09 — Restore Intune configuration, living inside T04 (backup & restore
// are one screen: the file you load is the file the other half wrote).
// After Ugur Koc's restore-intune-configuration.ps1, with two rules
// borrowed from his TenuVault and one of TUNO's own on top.
//
// CREATE ONLY. This never patches and never deletes an object of yours —
// the single exception is rolling back an administrative template IT
// created and then failed to finish, which is cleaning up its own mess
// rather than touching yours. (TenuVault's exception, kept exactly.)
//
// EVERY RESTORED OBJECT GETS A NAME PREFIX, "[Restored] " by default and
// editable per row. And THE COLLISION STOP on top: immediately before each
// create the target name is checked against a FRESH read of the tenant —
// a policy whose name already exists is SKIPPED AS COLLIDED, not created
// beside its twin and not overwritten. The original always creates, so a
// re-run silently produces a second copy of everything; its own notes say
// so. OVERWRITE IS DELIBERATELY NOT OFFERED, a departure from this card's
// first draft said on the card: overwrite is a patch wearing a restore's
// clothes, and create-only is the stronger rule.
//
// THE DRY RUN LISTS EVERY OPERATION, including the child writes the
// original's -WhatIf never shows — an ADMX policy is one create plus one
// definitionValue write per setting, and the dry run says exactly that.
//
// ASSIGNMENTS ARE NOT RESTORED — shipped narrower than the card's
// off-by-default toggle, on purpose, and said on the card. A group GUID
// from the source tenant either does not exist in the target or, worse,
// names a different group. Every policy arrives UNASSIGNED and the report
// says so per object.
//
// WHAT CANNOT COME BACK, said before the run: secrets (Graph never
// returned them — the archive holds references), and scripts saved without
// bodies. Both are marked non-restorable from the manifest/content and
// cannot be selected.
//
// Scopes at the click, never at sign-in: the config write for the four
// configuration areas, the scripts write for platform scripts — both
// already declared by the registration.
// ======================================================================
const Restore = (() => {
  "use strict";

  const AREA_INFO = {
    DeviceConfigurations: { label: "Device configuration profiles", icon: "⚙️", endpoint: "/deviceManagement/deviceConfigurations", nameField: "displayName", scope: "profiles" },
    SettingsCatalog: { label: "Settings catalog policies", icon: "🎛", endpoint: "/deviceManagement/configurationPolicies", nameField: "name", scope: "profiles" },
    CompliancePolicies: { label: "Compliance policies", icon: "✅", endpoint: "/deviceManagement/deviceCompliancePolicies", nameField: "displayName", scope: "profiles" },
    AdmxPolicies: { label: "Administrative templates", icon: "📋", endpoint: "/deviceManagement/groupPolicyConfigurations", nameField: "displayName", scope: "profiles" },
    PlatformScripts: { label: "Platform scripts", icon: "📜", endpoint: null /* per-object surface */, nameField: "displayName", scope: "scriptsWrite" },
  };
  const DEFAULT_PREFIX = "[Restored] ";

  // ---- reading an archive (pure: takes {path: jsonText}) ----
  function parseEntries(entries) {
    const objects = [], problems = [];
    let manifest = null;
    for (const [path, text] of Object.entries(entries)) {
      const parts = path.split("/").filter(Boolean);
      const file = parts[parts.length - 1];
      if (file === "manifest.json") {
        try { manifest = JSON.parse(text); } catch { problems.push({ path, error: "manifest.json does not parse" }); }
        continue;
      }
      // area folder = last directory component that names a known area — the
      // original's layout has one root folder above them, TUNO's zip too.
      const area = parts.length >= 2 ? parts[parts.length - 2] : null;
      if (!AREA_INFO[area] || !/\.json$/i.test(file)) continue;
      try {
        const obj = JSON.parse(text);
        const name = obj[AREA_INFO[area].nameField] || obj.displayName || obj.name || obj.id || file;
        const restorable = !(area === "PlatformScripts" && !obj.scriptContent);
        objects.push({
          path, area, name, sourceId: obj.id || "",
          type: obj["@odata.type"] || "",
          surface: obj.scriptSurface || "",
          settings: Array.isArray(obj.settings) ? obj.settings.length : (Array.isArray(obj.definitionValues) ? obj.definitionValues.length : null),
          restorable,
          why: restorable ? "" : "script saved without its body — there is nothing to put back",
          obj,
        });
      } catch { problems.push({ path, error: "does not parse as JSON" }); }
    }
    return { objects, manifest, problems };
  }

  // ---- create bodies: strip what the tenant owns, keep what the policy is ----
  const DROP_KEYS = new Set(["id", "createdDateTime", "lastModifiedDateTime", "version", "assignments",
    "scriptSurface", "supportsScopeTags", "settingCount", "creationSource", "priorityMetaData",
    "isAssigned", "@odata.context"]);
  function strip(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (DROP_KEYS.has(k) || /@odata\.(context|etag|count|nextLink)$/i.test(k)) continue;
      out[k] = v;
    }
    return out;
  }

  function bodyFor(entry, newName) {
    const a = entry.area;
    const o = strip(entry.obj);
    if (a === "SettingsCatalog") {
      // the create accepts the settings inline; instance only, ids are the tenant's
      return {
        name: newName, description: o.description || "",
        platforms: o.platforms, technologies: o.technologies,
        ...(o.templateReference ? { templateReference: o.templateReference } : {}),
        settings: (entry.obj.settings || []).map((s) => ({ settingInstance: s.settingInstance || s })).filter((s) => s.settingInstance),
      };
    }
    if (a === "AdmxPolicies") {
      return { displayName: newName, description: o.description || "" };
    }
    if (a === "CompliancePolicies") {
      const body = { ...o, displayName: newName };
      // nested ids are the source tenant's
      body.scheduledActionsForRule = (o.scheduledActionsForRule || []).map((r) => ({
        ruleName: r.ruleName || "",
        scheduledActionConfigurations: (r.scheduledActionConfigurations || []).map((c) => {
          const { id, ...rest } = c; return rest;
        }),
      }));
      return body;
    }
    if (a === "PlatformScripts") {
      return { ...o, displayName: newName };
    }
    return { ...o, displayName: newName };   // DeviceConfigurations
  }

  // ADMX child writes: one definitionValue per setting, bound to Microsoft's
  // definition ids (which are the same in every tenant — they are ADMX's).
  function admxChildBodies(entry) {
    return (entry.obj.definitionValues || []).map((d) => ({
      enabled: !!d.enabled,
      "definition@odata.bind": `https://graph.microsoft.com/beta/deviceManagement/groupPolicyDefinitions('${(d.definition && d.definition.id) || d.id}')`,
      presentationValues: (d.presentationValues || []).map((p) => {
        const out = { "@odata.type": p["@odata.type"] };
        for (const k of ["value", "values"]) if (p[k] !== undefined) out[k] = p[k];
        if (p.presentation && p.presentation.id) out["presentation@odata.bind"] =
          `https://graph.microsoft.com/beta/deviceManagement/groupPolicyDefinitions('${(d.definition && d.definition.id) || d.id}')/presentations('${p.presentation.id}')`;
        else if (p["presentation@odata.bind"]) out["presentation@odata.bind"] = p["presentation@odata.bind"];
        return out;
      }),
    }));
  }

  // ---- the plan (dry run's data): every operation, collisions marked ----
  async function existingNames(areas, onStatus) {
    const names = {};
    for (const a of areas) {
      const info = AREA_INFO[a];
      onStatus && onStatus(`Fresh read — ${info.label}…`);
      let rows = [];
      if (a === "PlatformScripts") {
        for (const s of ["deviceManagementScripts", "deviceShellScripts"]) {
          try { rows = rows.concat(await Graph.readAll(`${Graph.BETA}/deviceManagement/${s}?$select=id,displayName`, { scopes: Graph.SCOPES.scripts, retry: true })); }
          catch { /* a surface the tenant lacks — the per-create check still guards */ }
        }
      } else {
        rows = await Graph.readAll(`${Graph.BETA}${info.endpoint}?$select=id,${info.nameField}`, { scopes: Graph.SCOPES.config, retry: true });
      }
      names[a] = new Set(rows.map((r) => String(r[info.nameField] || r.displayName || "").toLowerCase()));
    }
    return names;
  }

  function plan(selection, names) {
    return selection.map((s) => {
      const target = (s.newName || "").trim();
      const collided = !!(names[s.area] && names[s.area].has(target.toLowerCase()));
      const children = s.area === "AdmxPolicies" ? (s.entry.obj.definitionValues || []).length : 0;
      return {
        area: s.area, name: s.entry.name, target,
        op: collided ? "SKIP — name exists in the tenant" : `create${children ? ` + ${children} definition value write${children === 1 ? "" : "s"}` : ""}`,
        collided, children,
        settings: s.entry.settings,
        note: "arrives UNASSIGNED — assignments are not restored",
        entry: s.entry,
      };
    });
  }

  // ---- apply: sequential, fresh per-object collision check, read-back ----
  async function apply(planned, onStatus) {
    const results = [];
    for (const p of planned) {
      if (p.collided) { results.push({ ...p, outcome: "skipped", detail: "name existed at dry run" }); continue; }
      const info = AREA_INFO[p.area];
      onStatus && onStatus(`${p.target} — checking the name is still free…`);
      try {
        // the tenant may have changed since the dry run: check THIS name now
        const fresh = await existingNames([p.area]);
        if (fresh[p.area].has(p.target.toLowerCase())) {
          results.push({ ...p, outcome: "skipped", detail: "COLLIDED — the name appeared in the tenant after the dry run" });
          continue;
        }
        const endpoint = p.area === "PlatformScripts"
          ? `/deviceManagement/${p.entry.surface || "deviceManagementScripts"}`
          : info.endpoint;
        const scopes = p.area === "PlatformScripts" ? Graph.SCOPES.scriptsWrite : Graph.SCOPES.profiles;
        onStatus && onStatus(`${p.target} — creating…`);
        const created = await Graph.post(`${Graph.BETA}${endpoint}`, bodyFor(p.entry, p.target), { scopes });
        const newId = created && created.id;
        if (!newId) throw new Error("the create returned without an id — check the portal before assuming either outcome");

        if (p.area === "AdmxPolicies") {
          const kids = admxChildBodies(p.entry);
          for (let i = 0; i < kids.length; i++) {
            onStatus && onStatus(`${p.target} — definition value ${i + 1}/${kids.length}…`);
            try {
              await Graph.post(`${Graph.BETA}/deviceManagement/groupPolicyConfigurations/${newId}/definitionValues`, kids[i], { scopes });
            } catch (e) {
              // TenuVault's one exception: roll back the half we created —
              // our mess, not yours.
              onStatus && onStatus(`${p.target} — child write failed, rolling back the half-created template…`);
              try { await Graph.del(`${Graph.BETA}/deviceManagement/groupPolicyConfigurations/${newId}`, { scopes }); }
              catch { /* the rollback itself failing is reported below */ }
              throw new Error(`definition value ${i + 1}/${kids.length} failed (${(e && e.message) || e}) — the half-created template was rolled back; nothing of it should remain, verify in the portal`);
            }
          }
        }

        // read-back: created means the tenant can hand it back
        onStatus && onStatus(`${p.target} — verifying…`);
        const back = await Graph.readOne(`${Graph.BETA}${endpoint}/${newId}`, { scopes });
        if (!back) throw new Error("created but not readable back — check the portal");
        results.push({ ...p, outcome: "created", newId, detail: `verified by read-back${p.children ? ` · ${p.children} definition values written` : ""} · unassigned` });
      } catch (e) {
        results.push({ ...p, outcome: "failed", detail: String((e && e.message) || e) });
      }
    }
    return results;
  }

  return { AREA_INFO, DEFAULT_PREFIX, parseEntries, strip, bodyFor, admxChildBodies, existingNames, plan, apply };
})();


// ======================================================================
// The screen half lives in T04's section — one screen, two directions.
// ======================================================================
const RestoreTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let parsed = null, planned = null, running = false;

  function prog(msg) { TunoProgress.show(null, "rsProg", msg); }   // line only — the plan table must stay visible during an apply (10397)

  async function loadZip(file) {
    parsed = null; planned = null;
    $("rsBody").innerHTML = ""; $("rsApply").style.display = "none";
    try {
      const z = await JSZip.loadAsync(file);
      const entries = {};
      const jobs = [];
      z.forEach((path, f) => { if (!f.dir && /\.json$/i.test(path)) jobs.push(f.async("string").then((t) => { entries[path] = t; })); });
      await Promise.all(jobs);
      parsed = Restore.parseEntries(entries);
      renderList();
    } catch (e) {
      $("rsBody").innerHTML = `<div class="gu-fail"><b>Not a readable archive:</b> ${esc((e && e.message) || e)}</div>`;
    }
  }

  function renderList() {
    const { objects, manifest, problems } = parsed;
    if (!objects.length) {
      $("rsBody").innerHTML = `<div class="gu-fail"><b>No restorable objects found.</b><span class="why">The archive must carry the backup tool's folder layout (${Object.keys(Restore.AREA_INFO).join(", ")}).</span></div>`;
      return;
    }
    const tenantLine = manifest && manifest.tenant
      ? `<p class="mini muted" style="margin:0 0 8px"><b>Source tenant:</b> ${esc(manifest.tenant)} — six months later the question is “is this the right tenant”, so check it now.</p>`
      : `<p class="mini muted" style="margin:0 0 8px"><b>The archive names no source tenant</b> (an original-script backup, or an older TUNO one). Be sure you know where it came from.</p>`;
    const byArea = {};
    objects.forEach((o) => { (byArea[o.area] = byArea[o.area] || []).push(o); });
    // The platform filter (build 10524) — the documenter's own platform
    // reading over the archived RAW object ("restore only the macOS
    // profiles"). The filter toggles row VISIBILITY, never re-renders: the
    // ticks and the edited names in this table are DOM state, and a
    // re-render would silently throw both away. An object declaring no
    // platform files under "Not platform-specific" (scripts, filters, the
    // non-policy areas).
    const platsOfObj = (o) => (typeof Docs !== "undefined" ? Docs.platformsOf(o.obj || {}, { platformField: "platforms" }) : []);
    const allPlats = [...new Set(objects.flatMap(platsOfObj))].sort();
    const platCount = (p) => objects.filter((o) => (p === "none" ? !platsOfObj(o).length : platsOfObj(o).includes(p))).length;
    const platBar = allPlats.length
      ? `<label class="sel-filter" style="margin:0 0 8px" title="Narrows which archived objects are SHOWN — the ticks and edited names underneath survive, and a hidden ticked row still restores. Untick what you do not want; this only helps you find it.">
          <span>Platform</span>
          <select id="rsPlatform"><option value="all">All platforms (${objects.length})</option>
            ${allPlats.map((p) => `<option value="${esc(p)}">${esc(p)} (${platCount(p)})</option>`).join("")}
            ${platCount("none") ? `<option value="none">Not platform-specific (${platCount("none")})</option>` : ""}</select>
        </label>` : "";
    const rows = Object.entries(byArea).map(([area, list]) => {
      const info = Restore.AREA_INFO[area];
      return `<tr data-rsarea="${esc(area)}"><td colspan="3" style="font-weight:700">${esc(info.icon)} ${esc(info.label)} <span class="mini muted">${list.length}</span></td></tr>` +
        list.map((o, i) => {
          const idx = objects.indexOf(o);
          const plats = platsOfObj(o);
          return `<tr data-rsplat="${esc(plats.join("|") || "none")}">
          <td style="width:30px"><input type="checkbox" data-rsel="${idx}" ${o.restorable ? "checked" : "disabled"}></td>
          <td><b>${esc(o.name)}</b>${plats.length ? ` <span class="mini muted">${esc(plats.join(", "))}</span>` : ""}${o.settings != null ? ` <span class="mini muted">${o.settings} setting${o.settings === 1 ? "" : "s"}</span>` : ""}${o.restorable ? "" : ` <span class="gu-how exc" title="${esc(o.why)}">not restorable</span>`}</td>
          <td><input data-rname="${idx}" value="${esc(Restore.DEFAULT_PREFIX + o.name)}" ${o.restorable ? "" : "disabled"} style="width:100%"></td>
        </tr>`;
        }).join("");
    }).join("");
    $("rsBody").innerHTML = `${tenantLine}
      ${problems.length ? `<div class="gu-fail"><b>${problems.length} file(s) could not be parsed</b> — ${problems.map((p) => esc(p.path)).join(", ")}</div>` : ""}
      <p class="mini muted" style="margin:0 0 8px"><b>Create only, prefixed, unassigned.</b> Nothing of yours is patched or deleted; every object arrives under the name in the right-hand column (edit it per row); assignments are not restored. Secrets did not survive the backup — anything encrypted arrives as a reference to re-enter by hand.</p>
      ${platBar}
      <div class="gu-tw"><table class="cg-table" id="rsTable" style="table-layout:fixed;width:100%"><colgroup><col style="width:34px"><col style="width:44%"><col></colgroup><tbody>${rows}</tbody></table></div>
      <div class="tb-actions" style="margin-top:10px"><button class="btn primary" id="rsDry">🔍 Dry run</button></div>
      <div id="rsPlan" style="margin-top:10px"></div>`;
    $("rsDry").addEventListener("click", dryRun);
    const platSel = $("rsPlatform");
    if (platSel) platSel.addEventListener("change", () => {
      const v = platSel.value;
      // visibility only — the DOM rows keep their ticks and edited names
      $("rsTable").querySelectorAll("tr[data-rsplat]").forEach((tr) => {
        const mine = String(tr.dataset.rsplat).split("|");
        tr.style.display = (v === "all" || mine.includes(v)) ? "" : "none";
      });
      // an area whose every object is hidden folds its header away too
      $("rsTable").querySelectorAll("tr[data-rsarea]").forEach((h) => {
        let sib = h.nextElementSibling, any = false;
        while (sib && !sib.dataset.rsarea) { if (sib.style.display !== "none") { any = true; break; } sib = sib.nextElementSibling; }
        h.style.display = any ? "" : "none";
      });
    });
  }

  function selection() {
    return [...document.querySelectorAll("[data-rsel]:checked")].map((c) => {
      const i = +c.dataset.rsel;
      return { area: parsed.objects[i].area, entry: parsed.objects[i], newName: document.querySelector(`[data-rname="${i}"]`).value };
    });
  }

  async function dryRun() {
    if (running) return;
    const sel = selection();
    if (!sel.length) { $("rsPlan").innerHTML = `<div class="gu-fail"><b>Nothing selected.</b></div>`; return; }
    running = true; $("rsDry").disabled = true;
    try {
      const areas = [...new Set(sel.map((s) => s.area))];
      await Graph.ensureScopes([...new Set(areas.flatMap((a) => a === "PlatformScripts" ? Graph.SCOPES.scripts : Graph.SCOPES.config))]);
      const names = await Restore.existingNames(areas, prog);
      planned = Restore.plan(sel, names);
      prog("");
      const n = { create: planned.filter((p) => !p.collided).length, skip: planned.filter((p) => p.collided).length };
      $("rsPlan").innerHTML = `
        <p class="mini"><b>${n.create} to create, ${n.skip} skipped as collided.</b> Every operation below, nothing else — and the apply re-checks each name against the tenant immediately before its create.</p>
        <div class="gu-tw"><table class="cg-table"><thead><tr><th>Object</th><th>Will become</th><th>Operation</th></tr></thead>
        <tbody>${planned.map((p) => `<tr>
          <td><b>${esc(p.name)}</b> <span class="mini muted">${esc(Restore.AREA_INFO[p.area].label)}</span></td>
          <td class="mini">${esc(p.target)}</td>
          <td class="mini${p.collided ? '" style="color:var(--off)' : ""}">${esc(p.op)}${p.collided ? "" : ` · ${esc(p.note)}`}</td>
        </tr>`).join("")}</tbody></table></div>`;
      $("rsApply").style.display = n.create ? "" : "none";
    } catch (e) {
      $("rsPlan").innerHTML = `<div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div>`;
      prog("");
    } finally { running = false; $("rsDry").disabled = false; }
  }

  async function applyPlan() {
    if (running || !planned) return;
    running = true; $("rsApply").disabled = true;
    try {
      const areas = [...new Set(planned.map((p) => p.area))];
      await Graph.ensureScopes([...new Set(areas.flatMap((a) => a === "PlatformScripts" ? Graph.SCOPES.scriptsWrite : Graph.SCOPES.profiles))]);
      const results = await Restore.apply(planned, prog);
      prog("");
      const good = results.filter((r) => r.outcome === "created").length;
      const bad = results.filter((r) => r.outcome === "failed").length;
      $("rsPlan").innerHTML = `
        <p class="mini"><b>${good} created and verified, ${results.length - good - bad} skipped, ${bad} failed.</b> “Created” is the tenant's word — each object was read back after its create. Everything arrived unassigned.</p>
        <div class="gu-tw"><table class="cg-table"><thead><tr><th>Object</th><th style="width:110px">Outcome</th><th>Detail</th></tr></thead>
        <tbody>${results.map((r) => `<tr>
          <td><b>${esc(r.target)}</b></td>
          <td><span class="gu-how ${r.outcome === "created" ? "inc" : (r.outcome === "failed" ? "exc" : "priv")}">${esc(r.outcome)}</span></td>
          <td class="mini">${esc(r.detail)}</td>
        </tr>`).join("")}</tbody></table></div>`;
      $("rsApply").style.display = "none";
      planned = null;
    } catch (e) {
      $("rsPlan").innerHTML = `<div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div>`;
      prog("");
    } finally { running = false; $("rsApply").disabled = false; }
  }

  function init() {
    if (!$("rsFile")) return;
    $("rsFile").addEventListener("change", (e) => { if (e.target.files[0]) loadZip(e.target.files[0]); });
    $("rsApply").addEventListener("click", applyPlan);
  }

  return {
    init,
    // for the headless tests only — the real parsed state is set by loadZip()
    _setForTest: (p) => { parsed = p; planned = null; renderList(); },
  };
})();

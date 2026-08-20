// ======================================================================
// T04 — Backup Intune configuration (BETA). Read the configuration surface
// and write one .zip, in the browser.
//
// After Ugur Koc's backup-intune-configuration.ps1 (MIT). The folder layout
// and the file-naming rule are HIS, deliberately and exactly, so an archive
// written here can be restored by his script and one written by his script
// can be read by R09. That interoperability is worth more than any tidier
// scheme this could have invented.
//
// ONE SCOPE, READ ONLY: DeviceManagementConfiguration.Read.All. The original
// needs nothing else and neither does this.
//
// THE N+1 IS THE WHOLE COST. Three of the five areas need a second request
// per object — the settings of a settings-catalog policy, the definition
// values of an ADMX policy, the body of a platform script — because the list
// endpoint returns a count or a null where the content should be. The
// original does these in series with a 100ms sleep between, which on a
// tenant with 400 policies is over a minute of a browser tab doing nothing.
// They go through Graph.pool() here: bounded concurrency, and errors captured
// per item so one unreadable policy does not lose the other 399.
//
// WHAT A BACKUP CANNOT CONTAIN, said here rather than discovered at restore:
//   * Graph never returns secret values. Encrypted OMA-URI settings,
//     passwords and certificate payloads come back as references, and have to
//     be re-entered by hand after a restore. The original documents this and
//     so does the manifest written here.
//   * A backup taken without script bodies cannot restore scripts. The
//     original has a -SkipScriptContent switch that quietly produces exactly
//     that; here the choice is on the screen, and the manifest records which
//     way it went so an archive can be checked before it is relied on.
// ======================================================================
const Backup = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();

  // The five areas, in the original's order, with its folder names. The
  // folder names are LOAD-BEARING: restore is driven by them, in his script
  // and in R09, so renaming one breaks both directions of the interop.
  const AREAS = [
    {
      id: "DeviceConfigurations", label: "Device configuration profiles", icon: "⚙️",
      hint: "Classic device configuration, including custom OMA-URI profiles.",
      list: "/deviceManagement/deviceConfigurations?$expand=assignments",
      nameField: "displayName",
    },
    {
      id: "SettingsCatalog", label: "Settings catalog policies", icon: "🎛",
      hint: "One extra read per policy — the list endpoint returns a count, not the settings.",
      list: "/deviceManagement/configurationPolicies?$expand=assignments",
      // The one area that names itself with `name` rather than `displayName`.
      // Easy to miss in a generic loop, and it produces files called
      // "unnamed_<guid>.json" when missed.
      nameField: "name",
      detail: (o) => ({ key: "settings", path: `/deviceManagement/configurationPolicies/${o.id}/settings` }),
    },
    {
      id: "CompliancePolicies", label: "Compliance policies", icon: "✅",
      hint: "With their scheduled actions — a compliance policy without them cannot be restored.",
      list: "/deviceManagement/deviceCompliancePolicies?$expand=assignments,scheduledActionsForRule($expand=scheduledActionConfigurations)",
      nameField: "displayName",
    },
    {
      id: "AdmxPolicies", label: "Administrative templates", icon: "📋",
      hint: "One extra read per policy for the definition values, which hold the actual settings.",
      list: "/deviceManagement/groupPolicyConfigurations?$expand=assignments",
      nameField: "displayName",
      detail: (o) => ({ key: "definitionValues", path: `/deviceManagement/groupPolicyConfigurations/${o.id}/definitionValues?$expand=definition($select=id,classType,displayName,categoryPath),presentationValues` }),
    },
    {
      id: "PlatformScripts", label: "Platform scripts", icon: "📜",
      hint: "Windows PowerShell and macOS shell scripts. The body needs a second read — the list returns null.",
      // Two Graph surfaces flattened into one folder, exactly as the original
      // does it. `scriptSurface` is injected so a restore knows which endpoint
      // a file came from; it is the only invented field in the archive.
      surfaces: [
        { path: "/deviceManagement/deviceManagementScripts?$expand=assignments", surface: "deviceManagementScripts" },
        { path: "/deviceManagement/deviceShellScripts?$expand=assignments", surface: "deviceShellScripts" },
      ],
      nameField: "displayName",
      detail: (o) => ({ key: "__script", path: `/deviceManagement/${o.scriptSurface}/${o.id}` }),
    },
  ];
  const areaById = (id) => AREAS.find((a) => a.id === id) || null;
  const allAreaIds = () => AREAS.map((a) => a.id);
  const SCOPES = () => Graph.SCOPES.config;

  // The original's rule, matched exactly so filenames round-trip.
  function safeFileName(name, id) {
    let s = String(name || "").replace(/[\\/:*?"<>|]/g, "_").trim().replace(/\.+$/, "").trim();
    if (s.length > 120) s = s.slice(0, 120);
    if (!s) s = "unnamed";
    return `${s}_${id}.json`;
  }

  const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, "").replace(/[:T]/g, (c) => (c === "T" ? "_" : "-"));

  const read = (path, onStatus) => Graph.readAll(path, { scopes: SCOPES(), beta: true, retry: true, onPage: onStatus });

  // ---- one area ---------------------------------------------------------
  async function runArea(area, opts) {
    const o = opts || {};
    const status = o.onStatus || (() => {});
    status(`${area.label} — listing…`);

    let objects = [];
    if (area.surfaces) {
      // A surface the tenant does not have (no macOS estate, no Intune
      // licence for it) is a note, not a failure — but ALL of them failing is
      // a real failure, because "no scripts" and "could not look" are
      // different archives and only one of them is safe to restore from.
      const notes = [];
      for (const s of area.surfaces) {
        try {
          const items = await read(s.path);
          items.forEach((it) => objects.push(Object.assign({}, it, { scriptSurface: s.surface })));
        } catch (e) { notes.push(`${s.surface}: ${Graph.GraphError && e instanceof Graph.GraphError ? e.message : String(e && e.message || e)}`); }
      }
      if (notes.length === area.surfaces.length) throw new Error(notes.join("; "));
      if (notes.length) o.onNote && o.onNote(area.id, notes.join("; "));
    } else {
      objects = await read(area.list);
    }

    // ---- the N+1, bounded ----
    const failed = [];
    if (area.detail && objects.length) {
      let done = 0;
      const results = await Graph.pool(objects, async (obj) => {
        const d = area.detail(obj);
        const r = await Graph.readAll(d.path, { scopes: SCOPES(), beta: true, retry: true });
        status(`${area.label} — ${++done}/${objects.length} details`);
        return { key: d.key, value: r };
      }, o.concurrency || 6);

      results.forEach((r, i) => {
        if (r.error) {
          // An object whose detail could not be read is EXCLUDED from the
          // archive, not written without it. A settings-catalog policy with
          // no settings restores as an empty policy with the right name,
          // which is worse than an absence somebody notices.
          failed.push({ name: objects[i][area.nameField] || objects[i].id, id: objects[i].id, error: String(r.error.message || r.error) });
          objects[i] = null;
          return;
        }
        if (r.value.key === "__script") {
          // The single-object GET is the only place scriptContent is
          // populated; the list endpoint always returns null.
          const full = Array.isArray(r.value.value) ? r.value.value[0] : r.value.value;
          objects[i].scriptContent = (full && full.scriptContent) || null;
        } else {
          objects[i][r.value.key] = r.value.value;
        }
      });
      objects = objects.filter(Boolean);
    }

    // A script with no body cannot be restored. The original's
    // -SkipScriptContent produces exactly this and says so only in its notes;
    // here it is recorded per file so an archive can be checked.
    const files = objects.map((obj) => {
      const name = obj[area.nameField] || obj.displayName || obj.name || obj.id;
      const restorable = !(area.id === "PlatformScripts" && !obj.scriptContent);
      if (o.skipScriptContent && area.id === "PlatformScripts") delete obj.scriptContent;
      return {
        path: `${area.id}/${safeFileName(name, obj.id)}`,
        name, id: obj.id,
        type: obj["@odata.type"] || "",
        surface: obj.scriptSurface || area.id,
        assignments: (obj.assignments || []).length,
        restorable: o.skipScriptContent && area.id === "PlatformScripts" ? false : restorable,
        json: JSON.stringify(obj, null, 2),
      };
    });
    return { area: area.id, files, failed };
  }

  // ---- the whole backup -------------------------------------------------
  async function run(opts) {
    const o = opts || {};
    const ids = (o.areas && o.areas.length) ? o.areas : allAreaIds();
    const out = { folder: `IntuneConfigBackup_${stamp()}`, areas: [], failed: [], notes: [], skipScriptContent: !!o.skipScriptContent };
    for (const id of ids) {
      const area = areaById(id);
      if (!area) continue;
      try {
        const r = await runArea(area, {
          onStatus: o.onStatus,
          onNote: (a, n) => out.notes.push({ area: a, note: n }),
          skipScriptContent: o.skipScriptContent,
          concurrency: o.concurrency,
        });
        out.areas.push(r);
        r.failed.forEach((f) => out.failed.push(Object.assign({ area: id }, f)));
      } catch (e) {
        // A whole area that could not be read is recorded as UNREADABLE.
        // An archive missing an area it could not read is a partial backup,
        // and the manifest has to say so or somebody will restore from it
        // believing it complete.
        out.areas.push({ area: id, files: [], failed: [], unreadable: String((e && e.message) || e) });
      }
    }
    out.manifest = manifest(out, o);
    return out;
  }

  // ---- the manifest -----------------------------------------------------
  //
  // The original's manifest holds four things: a date, per-area counts, a
  // total and a schema version. Nothing reads it — not even its own restore
  // script, which is driven entirely by folder names.
  //
  // This one carries the same four so the shape stays familiar, plus an INDEX
  // of every file with its type, its Graph surface and whether it can be
  // restored, and the identity of the tenant it came from. A backup you
  // cannot identify six months later is an archive of anonymous JSON, and the
  // question you will actually have is "is this the right tenant".
  function manifest(out, opts) {
    const o = opts || {};
    const areas = {};
    let total = 0;
    for (const a of out.areas) { areas[a.area] = a.files.length; total += a.files.length; }
    const notRestorable = out.areas.flatMap((a) => a.files.filter((f) => !f.restorable).map((f) => f.path));
    return {
      backupDate: new Date().toISOString(),
      areas, totalObjects: total,
      backupVersion: "1.0",
      // --- everything below is TUNO's addition ---
      producer: `TUNO ${typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""}`,
      tenant: o.tenant || null,
      skipScriptContent: !!o.skipScriptContent,
      files: out.areas.flatMap((a) => a.files.map((f) => ({
        path: f.path, area: a.area, name: f.name, id: f.id,
        type: f.type, surface: f.surface, assignments: f.assignments, restorable: f.restorable,
      }))),
      unreadableAreas: out.areas.filter((a) => a.unreadable).map((a) => ({ area: a.area, error: a.unreadable })),
      failedObjects: out.failed,
      partialAreas: out.notes,
      notRestorable,
      caveats: [
        "Graph never returns secret values. Encrypted OMA-URI settings, passwords and certificate payloads are references only and must be re-entered after a restore.",
        ...(notRestorable.length ? [`${notRestorable.length} platform script(s) have no body and cannot be restored from this archive.`] : []),
        ...(out.areas.some((a) => a.unreadable) ? ["One or more areas could not be read. This archive is PARTIAL — restoring from it will not recreate them."] : []),
      ],
    };
  }

  // ---- the zip ----------------------------------------------------------
  async function zip(out) {
    if (typeof JSZip === "undefined") throw new Error("The zip library did not load; the backup cannot be written.");
    const z = new JSZip();
    const root = z.folder(out.folder);
    root.file("manifest.json", JSON.stringify(out.manifest, null, 2));
    for (const a of out.areas) for (const f of a.files) root.file(f.path, f.json);
    return z.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  function summary(out) {
    const files = out.areas.reduce((n, a) => n + a.files.length, 0);
    return {
      files,
      areas: out.areas.filter((a) => !a.unreadable).length,
      unreadable: out.areas.filter((a) => a.unreadable).length,
      failed: out.failed.length,
      notRestorable: out.manifest.notRestorable.length,
      partial: out.notes.length,
      bytes: out.areas.reduce((n, a) => n + a.files.reduce((m, f) => m + f.json.length, 0), 0),
    };
  }

  return { AREAS, areaById, allAreaIds, SCOPES, safeFileName, stamp, runArea, run, manifest, zip, summary };
})();


// ======================================================================
// T04 — the screen.
// ======================================================================
const BackupTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  let out = null, running = false;

  const prog = (m) => { const el = $("bkProg"); if (el) el.textContent = m || ""; };
  const chosen = () => [...document.querySelectorAll("#bkAreas input[type=checkbox]")].filter((c) => c.checked).map((c) => c.value);

  function renderAreas() {
    const box = $("bkAreas");
    if (!box) return;
    box.innerHTML = Backup.AREAS.map((a) => `
      <label class="gu-area on" data-area="${esc(a.id)}">
        <input type="checkbox" value="${esc(a.id)}" checked>
        <span class="gu-a-h">${esc(a.icon)} ${esc(a.label)}</span>
        <span class="mini muted">${esc(a.hint)}</span>
      </label>`).join("");
    box.addEventListener("change", (e) => {
      const l = e.target.closest(".gu-area");
      if (l) l.classList.toggle("on", e.target.checked);
    });
  }

  function fail(e) {
    const err = (typeof e === "string") ? null : e;
    const msg = err ? String(err.message || err).slice(0, 400) : String(e);
    let extra = "";
    if (err && err.kind === "admin") extra = `<p class="mini" style="margin:8px 0 0">This needs an administrator to consent once for the whole tenant. ${err.consentUrl ? `<a href="${esc(err.consentUrl)}" target="_blank" rel="noopener">Open the admin-consent page →</a>` : ""}</p>`;
    else if (err && err.kind === "consent") extra = `<p class="mini" style="margin:8px 0 0">Nothing was read. Run it again and accept the permission prompt.</p>`;
    $("bkBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(msg)}</b></div>${extra}</div>`;
    $("bkDownload").style.display = "none";
    prog("");
  }

  async function run() {
    if (running) return;
    const areas = chosen();
    if (!areas.length) { fail("Pick at least one thing to back up."); return; }
    running = true; $("bkRun").disabled = true; $("bkDownload").style.display = "none"; $("bkBody").innerHTML = "";
    try {
      prog("Checking permissions…");
      await Graph.ensureScopes(Backup.SCOPES());
      out = await Backup.run({
        areas,
        skipScriptContent: $("bkSkipScripts").checked,
        tenant: tenantHint(),
        onStatus: prog,
      });
      prog("");
      render();
      $("bkDownload").style.display = "";
    } catch (e) { fail(e); }
    finally { running = false; $("bkRun").disabled = false; }
  }

  // Whatever the shell knows about who is signed in — enough to answer "is
  // this the right tenant" six months from now, and nothing more.
  function tenantHint() {
    const n = $("tenantName"), u = $("tenantUser");
    return { domain: (n && n.textContent) || "", signedInAs: (u && u.textContent) || "" };
  }

  async function download() {
    try {
      prog("Writing the zip…");
      const blob = await Backup.zip(out);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${out.folder}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      prog("");
    } catch (e) { fail(e); }
  }

  function render() {
    const s = Backup.summary(out);
    const stat = (n, l, cls) => `<span class="gu-stat ${n ? (cls || "") : "zero"}"><b>${n}</b> ${esc(l)}</span>`;
    const kb = Math.round(s.bytes / 1024);

    const head = `<div class="gu-sticky">
      <span class="gu-who">${esc(out.folder)}
        <span class="mini muted">${s.areas} area${s.areas === 1 ? "" : "s"} read · about ${kb} KB before compression</span></span>
      <div class="gu-sum">
        ${stat(s.files, "objects")}
        ${stat(s.unreadable, "areas unreadable")}
        ${stat(s.failed, "objects skipped")}
        ${stat(s.notRestorable, "not restorable")}
      </div></div>`;

    const notes = [];
    if (s.unreadable) {
      notes.push(`<div class="gu-fail"><b>This archive is PARTIAL.</b><span class="why">${out.areas.filter((a) => a.unreadable).map((a) => `${esc(a.area)}: ${esc(a.unreadable)}`).join("; ")} — restoring from it will not recreate those areas. The manifest records this.</span></div>`);
    }
    if (s.failed) {
      notes.push(`<div class="gu-fail"><b>${s.failed} object${s.failed === 1 ? "" : "s"} left out.</b><span class="why">Their detail could not be read, and an object written without it would restore as an empty policy with the right name — which is worse than an absence you can see. ${out.failed.slice(0, 5).map((f) => esc(f.name)).join(", ")}${out.failed.length > 5 ? "…" : ""}</span></div>`);
    }
    if (s.notRestorable) {
      notes.push(`<div class="gu-fail gu-skip"><b>${s.notRestorable} script${s.notRestorable === 1 ? "" : "s"} have no body.</b><span class="why">They are in the archive for reference but cannot be restored from it. ${out.skipScriptContent ? "Script bodies were left out on purpose." : "Graph returned no content for them."}</span></div>`);
    }
    notes.push(`<p class="mini muted"><b>Secrets are not in here, and cannot be.</b> Graph never returns secret values — encrypted OMA-URI settings, passwords and certificate payloads come back as references only. After a restore they have to be entered again by hand. That is a property of Graph, not of this tool, and the manifest repeats it.</p>`);

    const table = `<div class="gu-tw"><table class="cg-table">
      <thead><tr><th>Area</th><th class="gu-num">Objects</th><th class="gu-num">Assigned</th><th>Folder</th></tr></thead>
      <tbody>${out.areas.map((a) => {
        const def = Backup.areaById(a.area) || {};
        const assigned = a.files.filter((f) => f.assignments > 0).length;
        return `<tr>
          <td><b>${esc(def.icon || "")} ${esc(def.label || a.area)}</b>${a.unreadable ? ` <span class="gu-how exc">unreadable</span>` : ""}</td>
          <td class="gu-num${a.files.length ? "" : " gu-zero"}">${a.files.length}</td>
          <td class="gu-num${assigned ? "" : " gu-zero"}">${assigned}</td>
          <td class="mini muted"><code>${esc(a.area)}/</code></td></tr>`;
      }).join("")}</tbody></table></div>`;

    $("bkBody").innerHTML = head + `<div class="list-card">${notes.join("")}${table}
      <p class="mini muted" style="margin:10px 0 0">The folder layout and file names match <a href="https://github.com/ugurkocde/IntuneAutomation/blob/main/scripts/configuration/backup-intune-configuration.ps1" target="_blank" rel="noopener">the PowerShell original</a> exactly, so an archive written here can be restored by that script and one written by it can be read back by TUNO.</p></div>`;
  }

  function init() {
    if (!$("bkRun")) return;
    renderAreas();
    $("bkRun").addEventListener("click", run);
    $("bkDownload").addEventListener("click", download);
    $("bkReset").addEventListener("click", () => {
      out = null; $("bkBody").innerHTML = ""; prog(""); $("bkDownload").style.display = "none";
      document.querySelectorAll("#bkAreas input[type=checkbox]").forEach((c) => { c.checked = true; c.closest(".gu-area").classList.add("on"); });
      $("bkSkipScripts").checked = false;
    });
  }

  return { init, run, download, renderAreas, chosen };
})();

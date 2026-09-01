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
    // ================= R15 (build 10426): THE WIDENING =================
    // Everything below is EXPORT-ONLY: in the archive, hashed, verifiable,
    // and readable by anything — but the restore tool still covers the five
    // interop areas above, and each file below says so in the manifest.
    // The five original folder names stay EXACTLY the PowerShell original's
    // (that interop is load-bearing); these new folders are TUNO's own,
    // because TenuVault is a Go binary with its own layout and pretending
    // byte-interop with it would be a claim nothing verifies. What is
    // TenuVault's here — and credited — is the COVERAGE, the checksum per
    // file, and the manifest-written-last rule.
    {
      id: "Intents", label: "Security baselines (intents)", icon: "🛡", exportOnly: true,
      hint: "Baseline profiles with their settings — one extra read per intent.",
      list: "/deviceManagement/intents?$expand=assignments", nameField: "displayName", scopes: "config",
      detail: (o) => ({ key: "settingsDelta", path: `/deviceManagement/intents/${o.id}/settings` }),
    },
    {
      id: "AutopilotProfiles", label: "Autopilot deployment profiles", icon: "🛫", exportOnly: true,
      hint: "The out-of-box experience per device group.",
      list: "/deviceManagement/windowsAutopilotDeploymentProfiles?$expand=assignments", nameField: "displayName", scopes: "service",
    },
    {
      id: "EnrollmentConfigurations", label: "Enrolment configurations", icon: "🚪", exportOnly: true,
      hint: "Restrictions, ESP pages and device limits — the tenant defaults included.",
      list: "/deviceManagement/deviceEnrollmentConfigurations?$expand=assignments", nameField: "displayName", scopes: "service",
    },
    {
      id: "FeatureUpdateProfiles", label: "Feature update profiles", icon: "🔄", exportOnly: true,
      hint: "Which Windows feature update the rings hold at.",
      list: "/deviceManagement/windowsFeatureUpdateProfiles?$expand=assignments", nameField: "displayName", scopes: "config",
    },
    {
      id: "QualityUpdateProfiles", label: "Quality update profiles", icon: "🩹", exportOnly: true,
      hint: "Expedited quality updates.",
      list: "/deviceManagement/windowsQualityUpdateProfiles?$expand=assignments", nameField: "displayName", scopes: "config",
    },
    {
      id: "DriverUpdateProfiles", label: "Driver update profiles", icon: "🔌", exportOnly: true,
      hint: "Driver approval policies.",
      list: "/deviceManagement/windowsDriverUpdateProfiles?$expand=assignments", nameField: "displayName", scopes: "config",
    },
    {
      id: "CustomAttributeScripts", label: "macOS custom attribute scripts", icon: "🧾", exportOnly: true,
      hint: "One extra read per script for the body — the list returns null.",
      list: "/deviceManagement/deviceCustomAttributeShellScripts?$expand=assignments", nameField: "displayName", scopes: "scripts",
      detail: (o) => ({ key: "__script", path: `/deviceManagement/deviceCustomAttributeShellScripts/${o.id}` }),
    },
    {
      id: "AssignmentFilters", label: "Assignment filters", icon: "🔍", exportOnly: true,
      hint: "The rules assignments narrow by. No assignments of their own.",
      list: "/deviceManagement/assignmentFilters", nameField: "displayName", scopes: "config",
    },
    {
      id: "ScopeTags", label: "Scope tags", icon: "🏷", exportOnly: true,
      hint: "RBAC scoping. The tag objects only — role assignments are T07's report.",
      list: "/deviceManagement/roleScopeTags", nameField: "displayName", scopes: "rbac",
    },
    {
      id: "DeviceCategories", label: "Device categories", icon: "📁", exportOnly: true,
      hint: "The category list users pick from at enrolment.",
      list: "/deviceManagement/deviceCategories", nameField: "displayName", scopes: "config",
    },
    {
      id: "TermsAndConditions", label: "Terms and conditions", icon: "📜", exportOnly: true,
      hint: "What users accept at enrolment.",
      list: "/deviceManagement/termsAndConditions?$expand=assignments", nameField: "displayName", scopes: "config",
    },
    {
      id: "NotificationTemplates", label: "Notification templates", icon: "✉️", exportOnly: true,
      hint: "Compliance notification messages, localisations inline.",
      list: "/deviceManagement/notificationMessageTemplates?$expand=localizedNotificationMessages", nameField: "displayName", scopes: "config",
    },
    {
      id: "AppConfigurationDevice", label: "App configuration (managed devices)", icon: "🔧", exportOnly: true,
      hint: "Settings pushed into apps on enrolled devices.",
      list: "/deviceAppManagement/mobileAppConfigurations?$expand=assignments", nameField: "displayName", scopes: "apps",
    },
    {
      id: "AppConfigurationManagedApps", label: "App configuration (managed apps)", icon: "🔧", exportOnly: true,
      hint: "Settings pushed into apps under MAM, enrolled or not.",
      list: "/deviceAppManagement/targetedManagedAppConfigurations?$expand=assignments,apps", nameField: "displayName", scopes: "apps",
    },
    {
      id: "AppProtectionIos", label: "App protection — iOS", icon: "🛡", exportOnly: true,
      hint: "MAM for iOS, with the app list the policy binds to.",
      list: "/deviceAppManagement/iosManagedAppProtections?$expand=assignments,apps", nameField: "displayName", scopes: "apps",
    },
    {
      id: "AppProtectionAndroid", label: "App protection — Android", icon: "🛡", exportOnly: true,
      hint: "MAM for Android, with the app list.",
      list: "/deviceAppManagement/androidManagedAppProtections?$expand=assignments,apps", nameField: "displayName", scopes: "apps",
    },
    {
      id: "AppProtectionWindows", label: "App protection — Windows", icon: "🛡", exportOnly: true,
      hint: "MAM for Windows.",
      list: "/deviceAppManagement/windowsManagedAppProtections?$expand=assignments", nameField: "displayName", scopes: "apps",
    },
    {
      id: "WindowsInformationProtection", label: "Windows Information Protection", icon: "🔒", exportOnly: true,
      hint: "WIP under MDM. Deprecated by Microsoft; still live in tenants that set it.",
      list: "/deviceAppManagement/mdmWindowsInformationProtectionPolicies?$expand=assignments", nameField: "displayName", scopes: "apps",
    },
    {
      id: "AppCategories", label: "App categories", icon: "🗂", exportOnly: true,
      hint: "The Company Portal category list.",
      list: "/deviceAppManagement/mobileAppCategories", nameField: "displayName", scopes: "apps",
    },
  ];
  const areaById = (id) => AREAS.find((a) => a.id === id) || null;
  const allAreaIds = () => AREAS.map((a) => a.id);
  const SCOPES = () => Graph.SCOPES.config;
  // R15: the widened areas span four more read scopes. The consent asked is
  // the union of the areas CHOSEN — picking only the interop five still asks
  // for exactly what it always did.
  const scopesFor = (areaIds) => [...new Set((areaIds || allAreaIds())
    .map((id) => areaById(id)).filter(Boolean)
    .flatMap((a) => Graph.SCOPES[a.scopes || "config"] || Graph.SCOPES.config))];

  // The original's rule, matched exactly so filenames round-trip.
  function safeFileName(name, id) {
    let s = String(name || "").replace(/[\\/:*?"<>|]/g, "_").trim().replace(/\.+$/, "").trim();
    if (s.length > 120) s = s.slice(0, 120);
    if (!s) s = "unnamed";
    return `${s}_${id}.json`;
  }

  const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, "").replace(/[:T]/g, (c) => (c === "T" ? "_" : "-"));

  const read = (path, onStatus, scopes) => Graph.readAll(path, { scopes: scopes || SCOPES(), beta: true, retry: true, onPage: onStatus });

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
          const items = await read(s.path, null, scopesFor([area.id]));
          items.forEach((it) => objects.push(Object.assign({}, it, { scriptSurface: s.surface })));
        } catch (e) { notes.push(`${s.surface}: ${Graph.GraphError && e instanceof Graph.GraphError ? e.message : String(e && e.message || e)}`); }
      }
      if (notes.length === area.surfaces.length) throw new Error(notes.join("; "));
      if (notes.length) o.onNote && o.onNote(area.id, notes.join("; "));
    } else {
      objects = await read(area.list, null, scopesFor([area.id]));
    }

    // ---- the N+1, bounded ----
    const failed = [];
    if (area.detail && objects.length) {
      let done = 0;
      const results = await Graph.pool(objects, async (obj) => {
        const d = area.detail(obj);
        const r = await Graph.readAll(d.path, { scopes: scopesFor([area.id]), beta: true, retry: true });
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
        // R15: the targets themselves, serialised through T11's cleaner —
        // ONE implementation of "what an assignment is", not a second copy —
        // so assignments.json is exactly what the /assign action accepts.
        assignmentTargets: (obj.assignments || []).length && typeof AssignEdit !== "undefined"
          ? AssignEdit.cleanAssignments(obj.assignments) : [],
        restorable: area.exportOnly ? false
          : (o.skipScriptContent && area.id === "PlatformScripts" ? false : restorable),
        exportOnly: !!area.exportOnly,
        json: JSON.stringify(obj, null, 2),
      };
    });
    return { area: area.id, files, failed };
  }

  // ---- the whole backup -------------------------------------------------
  async function run(opts) {
    const o = opts || {};
    const ids = (o.areas && o.areas.length) ? o.areas : allAreaIds();
    const out = { folder: `IntuneConfigBackup_${stamp()}`, areas: [], failed: [], notes: [], skipScriptContent: !!o.skipScriptContent, tenantId: o.tenantId || null };
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

  // ---- R15: checksums, tenant identity, the assignment export -----------

  // SHA-256 of exactly the bytes written into the zip. WebCrypto where it
  // exists; an environment without it produces an archive whose manifest
  // says "unhashed" rather than one that silently cannot be verified later.
  async function sha256Hex(text) {
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // The tenant's ID, not just its display name — the import gate needs an
  // identity that cannot be two tenants with the same vanity domain.
  async function tenantId() {
    try {
      const org = await Graph.readAll("/organization?$select=id", { scopes: Graph.SCOPES.directory, retry: true });
      return (org[0] && org[0].id) || null;
    } catch { return null; }
  }

  // assignments.json — every policy that carries assignments, with the
  // targets serialised to exactly what /assign accepts. EXPORTABLE by being
  // here; IMPORTABLE (same tenant, four surfaces) through the import panel.
  function assignmentsExport(out) {
    const policies = [];
    for (const a of out.areas) for (const f of a.files) {
      if (!(f.assignmentTargets || []).length) continue;
      policies.push({ folder: a.area, id: f.id, name: f.name, assignments: f.assignmentTargets });
    }
    return { tenantId: out.tenantId || null, takenUtc: new Date().toISOString(), policies };
  }

  // groups.json — every group id the assignments name, resolved to a display
  // name AT BACKUP TIME. For auditing: six months later "who was
  // aaaa-…" has no answer in the directory if the group is gone.
  async function groupsExport(assignExp) {
    const ids = [...new Set(assignExp.policies.flatMap((p) => p.assignments
      .map((x) => x.target && x.target.groupId).filter(Boolean)))];
    if (!ids.length) return { groups: {}, missing: [], note: "no group-targeted assignments" };
    const look = await Graph.resolveNames(ids, { types: ["group"] });
    const groups = {}, missing = [];
    for (const id of ids) {
      const e = look.entry(id);
      if (e) groups[id] = e.name; else missing.push(id);
    }
    return { groups, missing, lookupError: look.error || null };
  }

  // ---- R15: OFFLINE VERIFY — no tenant, no sign-in ----------------------
  // input: { path: { text } } for every file in the archive (paths with the
  // root folder stripped or not — both handled). Verdicts per file:
  // ok / modified / missing; plus untracked (present, not in the manifest).
  // NO MANIFEST IS ITS OWN VERDICT: the manifest is written last, so its
  // absence means the backup never finished — TenuVault's rule, kept whole.
  async function verifyArchive(entries) {
    const norm = {};
    for (const [p, v] of Object.entries(entries)) {
      const parts = String(p).split("/").filter(Boolean);
      // strip a single root folder if present
      const key = parts.length > 1 && !/\.json$/i.test(parts[0]) ? parts.slice(1).join("/") : parts.join("/");
      norm[key] = typeof v === "string" ? v : v.text;
    }
    if (!norm["manifest.json"]) {
      return { verdict: "incomplete", reason: "No manifest.json. The manifest is written LAST — an archive without one is a backup that never finished, and it is not safe to restore from.", ok: [], modified: [], missing: [], untracked: Object.keys(norm) };
    }
    let man;
    try { man = JSON.parse(norm["manifest.json"]); }
    catch { return { verdict: "incomplete", reason: "manifest.json does not parse.", ok: [], modified: [], missing: [], untracked: [] }; }

    const listed = (man.files || []).concat(man.extraFiles || []);
    if (!listed.length || !listed.some((f) => f.sha256)) {
      return { verdict: "unverifiable", manifest: man, reason: "This archive predates checksums (before build 10426) or was written by the PowerShell original — its content cannot be verified, only read.", ok: [], modified: [], missing: [], untracked: [] };
    }
    const ok = [], modified = [], missing = [], seen = new Set(["manifest.json"]);
    for (const f of listed) {
      seen.add(f.path);
      const text = norm[f.path];
      if (text === undefined) { missing.push(f.path); continue; }
      if (!f.sha256) { ok.push(f.path); continue; }
      const h = await sha256Hex(text);
      if (h === null) return { verdict: "unverifiable", manifest: man, reason: "This browser exposes no WebCrypto — hashes cannot be recomputed here.", ok: [], modified: [], missing: [], untracked: [] };
      (h === f.sha256 ? ok : modified).push(f.path);
    }
    const untracked = Object.keys(norm).filter((p) => !seen.has(p));
    const verdict = modified.length || missing.length ? "tampered-or-damaged" : (untracked.length ? "ok-with-untracked" : "ok");
    return { verdict, manifest: man, ok, modified, missing, untracked };
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
      tenantId: out.tenantId || null,
      checksum: "SHA-256",
      skipScriptContent: !!o.skipScriptContent,
      files: out.areas.flatMap((a) => a.files.map((f) => ({
        path: f.path, area: a.area, name: f.name, id: f.id,
        type: f.type, surface: f.surface, assignments: f.assignments, restorable: f.restorable,
        exportOnly: !!f.exportOnly,
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
  // THE MANIFEST GOES IN LAST — TenuVault's atomicity rule, kept exactly.
  // Its presence is what marks the backup complete; verify treats an archive
  // without one as a backup that never finished. Every file it lists carries
  // a SHA-256 of the exact bytes written here.
  async function zip(out, extras) {
    if (typeof JSZip === "undefined") throw new Error("The zip library did not load; the backup cannot be written.");
    const z = new JSZip();
    const root = z.folder(out.folder);
    for (const a of out.areas) for (const f of a.files) {
      root.file(f.path, f.json);
      const m = out.manifest.files.find((x) => x.path === f.path);
      if (m) m.sha256 = await sha256Hex(f.json);
    }
    out.manifest.extraFiles = [];
    for (const [name, obj] of Object.entries(extras || {})) {
      const text = JSON.stringify(obj, null, 2);
      root.file(name, text);
      out.manifest.extraFiles.push({ path: name, sha256: await sha256Hex(text) });
    }
    root.file("manifest.json", JSON.stringify(out.manifest, null, 2));
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

  return { AREAS, areaById, allAreaIds, SCOPES, scopesFor, safeFileName, stamp, runArea, run, manifest, zip, summary,
    sha256Hex, tenantId, assignmentsExport, groupsExport, verifyArchive };
})();


// ======================================================================
// R15 — ASSIGNMENT IMPORT. The half Mihai added to the card: the archive's
// assignments.json is not just an audit record, it can be PUT BACK.
//
// THREE HARD RULES, each the reason the next one exists:
//
//   * SAME TENANT ONLY. Group ids are tenant-specific; in another tenant a
//     GUID either resolves to nothing or — worse — to somebody else's
//     group. The archive carries the tenant's ID and the import REFUSES a
//     mismatch outright. An archive from before tenant identity (pre-10426)
//     gates on typing the current tenant's domain instead.
//   * ALL OR NOTHING PER POLICY. If any group an archived list names has
//     been deleted since the backup, that POLICY is refused — writing the
//     list minus the dead id would change its meaning, and dropping a dead
//     EXCLUSION silently widens the assignment. The T11 sentence, applied
//     to time instead of to a filter.
//   * T11'S WRITE DISCIPLINE WHOLE: four surfaces under the held write
//     scope, /assign replaces the list so the archived targets go over the
//     wire exactly as cleaned at backup time, every write preceded by a
//     fresh read (changed since the dry run = DRIFTED, skipped), followed
//     by a read-back, never retried, sequential.
//
// Everything else in assignments.json — the widened areas, the scripts —
// is EXPORT-ONLY and listed as such with its reason, not silently dropped.
// ======================================================================
const AssignImport = (() => {
  "use strict";

  // folder in the archive → T11 surface. Only these four can be written.
  const IMPORTABLE = {
    DeviceConfigurations: "deviceConfig",
    SettingsCatalog: "settingsCatalog",
    CompliancePolicies: "compliance",
    AdmxPolicies: "admx",
  };
  const surfaceFor = (folder) => IMPORTABLE[folder] || null;

  // ---- the plan: one op per archived policy, with its verdict ----
  async function plan(assignExp, onStatus) {
    const ops = [];
    const allIds = [...new Set(assignExp.policies.flatMap((p) => p.assignments
      .map((x) => x.target && x.target.groupId).filter(Boolean)))];
    onStatus && onStatus(`Checking ${allIds.length} groups still exist…`);
    const look = allIds.length ? await Graph.resolveNames(allIds, { types: ["group"] }) : Object.assign((id) => id, { entry: () => null, error: null });
    if (look.error) throw new Error("The group lookup failed (" + look.error + ") — without it a deleted group cannot be told from a live one, and importing blind would widen assignments.");

    let done = 0;
    for (const p of assignExp.policies) {
      done++;
      const sfId = surfaceFor(p.folder);
      if (!sfId) {
        ops.push({ policy: p, verdict: "export-only", reason: p.folder === "PlatformScripts"
          ? "scripts take a different assign body — export-only for now"
          : "no write scope is held for this surface — export-only" });
        continue;
      }
      const dead = [...new Set(p.assignments.map((x) => x.target && x.target.groupId)
        .filter((id) => id && !look.entry(id)))];
      if (dead.length) {
        ops.push({ policy: p, verdict: "refused", reason: `${dead.length} group${dead.length === 1 ? "" : "s"} in the archived list no longer exist${dead.length === 1 ? "s" : ""} (${dead.join(", ")}) — writing the list without ${dead.length === 1 ? "it" : "them"} would change its meaning, and a dropped exclusion widens` });
        continue;
      }
      const sf = AssignEdit.surfaceById(sfId);
      onStatus && onStatus(`${p.name} — reading current assignments (${done}/${assignExp.policies.length})…`);
      let current = null;
      try { current = await Graph.readAll(sf.read1(p.id), { scopes: AssignEdit.READ(), beta: true, retry: true }); }
      catch (e) {
        ops.push({ policy: p, verdict: "missing", reason: "the policy no longer exists in the tenant (or cannot be read) — an import targets the SAME object by id, never a namesake" });
        continue;
      }
      const currentSig = AssignEdit.sig(current);
      const wantSig = AssignEdit.sig(p.assignments);
      const groupNames = p.assignments.map((x) => x.target && x.target.groupId).filter(Boolean).map((id) => look(id));
      if (currentSig === wantSig) {
        ops.push({ policy: p, verdict: "noop", reason: "the tenant already says exactly this", groupNames });
      } else {
        ops.push({ policy: p, verdict: "replace", surface: sfId, currentSig, current: AssignEdit.cleanAssignments(current),
          want: p.assignments, groupNames,
          reason: `${current.length} assignment${current.length === 1 ? "" : "s"} now → ${p.assignments.length} from the archive` });
      }
    }
    return {
      ops,
      replace: ops.filter((o) => o.verdict === "replace"),
      noop: ops.filter((o) => o.verdict === "noop"),
      refused: ops.filter((o) => o.verdict === "refused"),
      missing: ops.filter((o) => o.verdict === "missing"),
      exportOnly: ops.filter((o) => o.verdict === "export-only"),
    };
  }

  // ---- apply: T11's loop, fed from the archive ----
  async function apply(planned, onStatus) {
    const results = [];
    for (const op of planned.replace) {
      const sf = AssignEdit.surfaceById(op.surface);
      const label = op.policy.name;
      try {
        onStatus && onStatus(`${label} — checking the tenant has not moved…`);
        const now = await Graph.readAll(sf.read1(op.policy.id), { scopes: AssignEdit.READ(), beta: true, retry: true });
        if (AssignEdit.sig(now) !== op.currentSig) {
          results.push({ op, drifted: true, error: "the assignments changed since the dry run — not overwriting somebody else's edit" });
          continue;
        }
        onStatus && onStatus(`${label} — writing…`);
        await Graph.post(Graph.BETA + sf.assign(op.policy.id), { assignments: op.want }, { scopes: AssignEdit.WRITE() });
        onStatus && onStatus(`${label} — verifying…`);
        let verified = false, verifyError = "";
        try {
          const back = await Graph.readAll(sf.read1(op.policy.id), { scopes: AssignEdit.READ(), beta: true, retry: true });
          verified = AssignEdit.sig(back) === AssignEdit.sig(op.want);
          if (!verified) verifyError = "the read-back does not match the archive — check the policy in the portal";
        } catch (e) { verifyError = "written but the verify read failed: " + String((e && e.message) || e); }
        results.push({ op, ok: true, verified, verifyError });
      } catch (e) {
        results.push({ op, error: String((e && e.message) || e).slice(0, 300) });
      }
    }
    return results;
  }

  return { IMPORTABLE, surfaceFor, plan, apply };
})();


// ======================================================================
// T04 — the screen.
// ======================================================================
const BackupTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  let out = null, running = false;

  const prog = (m) => TunoProgress.show("bkBody", "bkProg", m);   // ENCA-style centred card (10397)
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
      await Graph.ensureScopes([...new Set([...Backup.scopesFor(areas), ...Graph.SCOPES.directory])]);
      prog("Identifying the tenant…");
      const tid = await Backup.tenantId();
      out = await Backup.run({
        areas,
        skipScriptContent: $("bkSkipScripts").checked,
        tenant: tenantHint(),
        tenantId: tid,
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
      prog("Resolving group names for groups.json…");
      const assignExp = Backup.assignmentsExport(out);
      const groups = await Backup.groupsExport(assignExp);
      prog("Hashing and writing the zip — the manifest goes in last…");
      const blob = await Backup.zip(out, { "assignments.json": assignExp, "groups.json": groups });
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

  // ---------------- R15: verify (offline) & import assignments ----------
  let vfEntries = null, vfAssign = null, vfPlan = null;

  async function vfLoad(file) {
    vfEntries = null; vfAssign = null; vfPlan = null;
    $("vfBody").innerHTML = ""; $("vfImportWrap").style.display = "none";
    try {
      const z = await JSZip.loadAsync(file);
      const entries = {}, jobs = [];
      z.forEach((path, f) => { if (!f.dir) jobs.push(f.async("string").then((t) => { entries[path] = { text: t }; })); });
      await Promise.all(jobs);
      vfEntries = entries;
      const v = await Backup.verifyArchive(entries);
      renderVerify(v);
    } catch (e) {
      $("vfBody").innerHTML = `<div class="gu-fail"><b>Not a readable archive:</b> ${esc((e && e.message) || e)}</div>`;
    }
  }

  function renderVerify(v) {
    const card = (label, n, sub, cls) => `<div class="au-card"><div class="au-card-l">${label}</div><div class="au-card-n ${cls || ""}">${n}</div><div class="au-card-s">${sub}</div></div>`;
    const V = {
      "ok": ["ok", "every listed file matches its hash"],
      "ok-with-untracked": ["", "listed files match; extra files present"],
      "tampered-or-damaged": ["bad", "the archive does not match its manifest"],
      "unverifiable": ["", "no hashes to check against"],
      "incomplete": ["bad", "no manifest — the backup never finished"],
    }[v.verdict] || ["", ""];
    $("vfBody").innerHTML = `<div class="au-cards">
      ${card("Verdict", esc(v.verdict), esc(V[1]), V[0])}
      ${card("Match", v.ok.length, "files with a good hash", v.ok.length ? "ok" : "")}
      ${card("Modified", v.modified.length, "content differs from the manifest", v.modified.length ? "bad" : "ok")}
      ${card("Missing", v.missing.length, "listed but not in the zip", v.missing.length ? "bad" : "ok")}
      ${card("Untracked", v.untracked.length, "in the zip but not listed", "")}
    </div>
    ${v.reason ? `<p class="mini muted" style="margin:8px 0 0">${esc(v.reason)}</p>` : ""}
    ${v.modified.length ? `<div class="gu-fail" style="margin-top:8px"><b>Modified:</b> ${v.modified.map(esc).join(", ")}</div>` : ""}
    ${v.missing.length ? `<div class="gu-fail" style="margin-top:8px"><b>Missing:</b> ${v.missing.map(esc).join(", ")}</div>` : ""}
    ${v.untracked.length ? `<p class="mini muted" style="margin:8px 0 0">Untracked: ${v.untracked.map(esc).join(", ")}</p>` : ""}
    <p class="mini muted" style="margin:8px 0 0">Verified entirely in this tab — no sign-in, no tenant. The manifest is written last, so an archive without one is a backup that never finished.</p>`;

    // the import half appears only when assignments.json is present and the
    // archive is not failing verification
    const aPath = Object.keys(vfEntries).find((p) => /(^|\/)assignments\.json$/.test(p));
    if (aPath && v.verdict !== "incomplete" && v.verdict !== "tampered-or-damaged") {
      try { vfAssign = JSON.parse(vfEntries[aPath].text); } catch { vfAssign = null; }
      if (vfAssign && (vfAssign.policies || []).length) {
        $("vfImportWrap").style.display = "";
        $("vfImportInfo").innerHTML = `<b>${vfAssign.policies.length}</b> polic${vfAssign.policies.length === 1 ? "y" : "ies"} carry assignments in this archive${vfAssign.tenantId ? `, taken from tenant <code>${esc(vfAssign.tenantId)}</code>` : ", from an archive that predates tenant identity"}.`;
        $("vfImportPlanOut").innerHTML = ""; $("vfImportApply").style.display = "none";
      }
    } else if (v.verdict === "tampered-or-damaged") {
      $("vfImportWrap").style.display = "none";
      $("vfBody").innerHTML += `<div class="gu-fail" style="margin-top:8px"><b>Import is refused for a tampered or damaged archive.</b><span class="why">An assignment list whose file failed its hash is not evidence of anything.</span></div>`;
    }
  }

  async function vfDryRun() {
    if (running || !vfAssign) return;
    running = true; $("vfImportDry").disabled = true;
    try {
      await Graph.ensureScopes([...new Set([...AssignEdit.READ(), ...Graph.SCOPES.directory])]);
      // THE TENANT GATE. Same tenant or nothing — group ids are meaningless
      // anywhere else, and dangerous where they happen to resolve.
      prog2("Identifying this tenant…");
      const here = await Backup.tenantId();
      if (vfAssign.tenantId && here && vfAssign.tenantId !== here) {
        throw new Error(`This archive was taken from tenant ${vfAssign.tenantId} and you are signed in to ${here}. Group ids do not translate between tenants — the import is refused, with no override. Cross-tenant copying is R17's problem, deliberately unbuilt.`);
      }
      if (!vfAssign.tenantId) {
        const typed = ($("vfTenantConfirm") && $("vfTenantConfirm").value || "").trim().toLowerCase();
        const domain = (($("tenantName") && $("tenantName").textContent) || "").trim().toLowerCase();
        if (!domain || typed !== domain) {
          $("vfImportPlanOut").innerHTML = `<div class="gu-fail"><b>This archive predates tenant identity (before build 10426).</b><span class="why">Type this tenant's domain (“${esc(domain || "unknown")}”) in the box above to confirm you know where the archive came from, then dry-run again.</span></div>`;
          $("vfTenantWrap").style.display = "";
          return;
        }
      }
      vfPlan = await AssignImport.plan(vfAssign, prog2);
      prog2("");
      const row = (o, note) => `<tr><td><b>${esc(o.policy.name)}</b> <span class="mini muted">${esc(o.policy.folder)}</span></td><td class="mini">${esc(note || o.reason)}</td></tr>`;
      $("vfImportPlanOut").innerHTML = `
        <p class="mini" style="margin:8px 0 0"><b>${vfPlan.replace.length} to replace</b> · ${vfPlan.noop.length} already exact · ${vfPlan.refused.length} refused · ${vfPlan.missing.length} missing · ${vfPlan.exportOnly.length} export-only.</p>
        <div class="gu-tw" style="margin-top:8px"><table class="cg-table"><tbody>
          ${vfPlan.replace.map((o) => row(o, `REPLACE — ${o.reason} · groups: ${o.groupNames.join(", ") || "tenant-wide only"}`)).join("")}
          ${vfPlan.refused.map((o) => row(o)).join("")}
          ${vfPlan.missing.map((o) => row(o)).join("")}
          ${vfPlan.noop.map((o) => row(o)).join("")}
          ${vfPlan.exportOnly.map((o) => row(o)).join("")}
        </tbody></table></div>
        <p class="mini muted" style="margin:8px 0 0">The assign call replaces each policy's whole list with the archived one, exactly as cleaned at backup time. Each policy is re-read at apply; one that changed since this dry run is skipped as drifted.</p>`;
      if (vfPlan.replace.length) {
        $("vfImportApply").style.display = "";
        $("vfImportApply").disabled = true;
        $("vfConfirm").value = "";
        $("vfConfirmWrap").style.display = "";
        $("vfGate").textContent = `Type REPLACE to allow writing ${vfPlan.replace.length} assignment list${vfPlan.replace.length === 1 ? "" : "s"}.`;
      }
    } catch (e) {
      prog2("");
      $("vfImportPlanOut").innerHTML = `<div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div>`;
    } finally { running = false; $("vfImportDry").disabled = false; }
  }

  async function vfApply() {
    if (running || !vfPlan || $("vfConfirm").value.trim() !== "REPLACE") return;
    running = true; $("vfImportApply").disabled = true;
    try {
      await Graph.ensureScopes(AssignEdit.WRITE());
      const results = await AssignImport.apply(vfPlan, prog2);
      prog2("");
      const good = results.filter((r) => r.ok && r.verified).length;
      $("vfImportPlanOut").innerHTML = `
        <p class="mini"><b>${good} written and verified</b> · ${results.length - good} not clean. “Verified” is the tenant's read-back matching the archive, never the write's status code.</p>
        <div class="gu-tw"><table class="cg-table"><tbody>${results.map((r) => `<tr>
          <td><b>${esc(r.op.policy.name)}</b></td>
          <td>${r.ok && r.verified ? '<span class="gu-how inc">written · verified</span>' : r.drifted ? '<span class="gu-how exc">drifted — not written</span>' : r.error ? '<span class="gu-how exc">FAILED</span>' : '<span class="gu-how exc">written · NOT verified</span>'}</td>
          <td class="mini">${esc(r.error || r.verifyError || "")}</td></tr>`).join("")}</tbody></table></div>`;
      $("vfImportApply").style.display = "none"; $("vfConfirmWrap").style.display = "none";
      vfPlan = null;
    } catch (e) {
      prog2("");
      $("vfImportPlanOut").innerHTML = `<div class="gu-fail"><b>${esc((e && e.message) || e)}</b></div>`;
    } finally { running = false; }
  }

  const prog2 = (m) => TunoProgress.show(null, "vfProg", m);

  function init() {
    if (!$("bkRun")) return;
    renderAreas();
    // The mode seg (10546, the layout round — T24's tab pattern): one of
    // the three tool-halves on screen at a time. Display only — every
    // half's own state, handlers and results are untouched by a switch,
    // so a loaded restore plan survives a peek at Verify.
    if ($("bkModeSeg")) {
      const MODES = { backup: "bkModeBackup", restore: "bkModeRestore", verify: "bkModeVerify" };
      $("bkModeSeg").querySelectorAll("[data-bkmode]").forEach((b) => b.addEventListener("click", () => {
        $("bkModeSeg").querySelectorAll("[data-bkmode]").forEach((x) => x.classList.toggle("active", x === b));
        for (const [m, id] of Object.entries(MODES)) { const el = $(id); if (el) el.hidden = m !== b.dataset.bkmode; }
      }));
    }
    $("bkRun").addEventListener("click", run);
    $("bkDownload").addEventListener("click", download);
    if ($("vfFile")) {
      $("vfFile").addEventListener("change", (e) => { if (e.target.files[0]) vfLoad(e.target.files[0]); });
      $("vfImportDry").addEventListener("click", vfDryRun);
      $("vfImportApply").addEventListener("click", vfApply);
      $("vfConfirm").addEventListener("input", () => { $("vfImportApply").disabled = $("vfConfirm").value.trim() !== "REPLACE"; });
    }
    $("bkReset").addEventListener("click", () => {
      out = null; $("bkBody").innerHTML = ""; prog(""); $("bkDownload").style.display = "none";
      document.querySelectorAll("#bkAreas input[type=checkbox]").forEach((c) => { c.checked = true; c.closest(".gu-area").classList.add("on"); });
      $("bkSkipScripts").checked = false;
    });
  }

  return { init, run, download, renderAreas, chosen };
})();

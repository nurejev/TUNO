// ======================================================================
// T05 — Configuration documenter (BETA). Browse the tenant's configuration,
// then write it down.
//
// TWO VIEWS OVER ONE READ, the same shape as T03. BROWSE is the tool you use
// on a Tuesday: every policy in the tenant in one list, filterable, with the
// settings expandable underneath. DOCUMENT is the artefact an auditor asks
// for and nobody has. They are one tool because reading thirteen surfaces
// twice would be absurd — you browse what you are about to document, and
// document what you just browsed.
//
// After Ugur Koc's IntuneDocumentation, whose coverage plan decided WHICH
// surfaces belong in a tenant document and in what order. That project is
// **Elastic License 2.0**, which permits self-hosting but not offering the
// work as a service — so this is a reimplementation from its published
// coverage list, not a fork, and none of its code is here.
//
// THE ORIGINAL HAS A SERVER AND TUNO DOES NOT, which is not a detail. Its
// browser hands a Graph token to its own Next.js backend, which calls Graph,
// sanitises the result and streams it back. That is a sound design and it is
// why its README can say "your configuration never touches the application
// server" — the DOCUMENT is built client-side, the COLLECTION is not. TUNO
// has nowhere to put a server tier, so the collection is reimplemented in the
// tab. Which is, incidentally, the more literal version of the claim.
//
// REDACTION IS NOT OPTIONAL AND NOT A SETTING. A tenant document is the most
// widely circulated artefact this tool can produce — it goes to auditors, into
// wikis, onto shared drives. A script body, a certificate payload, a Wi-Fi
// pre-shared key or an encrypted OMA-URI value in one of those is a disclosure
// that cannot be recalled. Every one of those fields is replaced with a marker
// saying what was there, so the document records that a value EXISTS without
// carrying it. There is deliberately no switch to turn this off.
// ======================================================================
const Docs = (() => {
  "use strict";

  const lc = (s) => String(s || "").toLowerCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

  const S = () => Graph.SCOPES;
  const read = (path, scopes) => Graph.readAll(path, { scopes, beta: true, retry: true });

  // ---------------------------------------------------------- redaction --
  // Matched on the KEY, case-insensitively, at any depth. A key that merely
  // looks sensitive is redacted too — a false positive costs one line of a
  // document; a false negative is a leaked secret in a file somebody emailed.
  // THE KEY IS SPLIT INTO WORDS BEFORE IT IS MATCHED, and that is not a
  // nicety. Graph names things in camelCase, so a pattern testing the raw key
  // for a whole word "key" never fires on `encryptionKey` — there is no word
  // boundary between "encryption" and "Key". `encryptionKey`, `sharedKey` and
  // `wifiKey` all went through in the first version of this and a test caught
  // it. Splitting first means "key" is a word wherever it appears as a
  // camelCase segment, and `monkey` still is not one.
  const words = (k) => String(k)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.\-]/g, " ")
    .toLowerCase();
  const SECRET_WORD = /\b(password|passwords|secret|secrets|credential|credentials|key|keys|keying|token|tokens|certificate|certificates|cert|certs|pfx|thumbprint|payload|payloads|passphrase|pin|pins|apikey|hash)\b/;
  // Substrings that are conclusive even mid-word.
  const SECRET_PART = /scriptcontent|preshared|clientsecret|encryptedvalue|privatekey|base64/i;
  const SECRET_KEY = { test: (k) => SECRET_WORD.test(words(k)) || SECRET_PART.test(String(k)) };
  // Some keys carry bulk that is not secret but ruins a document: an icon is
  // 40KB of base64 nobody reads.
  const BULK_KEY = { test: (k) => /\b(icon|icons|image|images|logo|thumbnail)\b/.test(words(k)) };
  const REDACTED = "[redacted — a value is set]";
  const OMITTED = "[omitted — binary]";

  function redactValue(key, v) {
    if (SECRET_KEY.test(key)) return v == null || v === "" ? null : REDACTED;
    if (BULK_KEY.test(key)) return v == null ? null : OMITTED;
    return v;
  }

  // ------------------------------------------------------- humanising ----
  // deviceComplianceScriptId → "Device compliance script id". Graph's key
  // names are the only labels available for most of this, and a table of
  // camelCase is a JSON dump with extra steps.
  // SENTENCE CASE, NOT TITLE CASE — a table of "Passcode Required" reads as a
  // form, "Passcode required" reads as prose, and a document is prose. Words
  // that were ALL CAPS in the original are left alone, so SSID and URI survive
  // instead of becoming Ssid and Uri.
  function label(key) {
    const raw = String(key).replace(/@odata\..*/i, "");
    const parts = raw.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_.]/g, " ").trim().split(/\s+/);
    if (!parts.length || !parts[0]) return key;
    const out = parts.map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase()));
    out[0] = out[0].charAt(0).toUpperCase() + out[0].slice(1);
    return out.join(" ");
  }

  // Keys that are bookkeeping rather than configuration. Documenting them
  // pads every policy with six rows nobody reads.
  const META_KEY = new Set([
    "id", "createdDateTime", "lastModifiedDateTime", "version", "assignments",
    "roleScopeTagIds", "supportsScopeTags", "settingCount", "priorityMetaData",
    "creationSource", "policyConfigurationIngestionType", "deviceManagementApplicabilityRuleOsEdition",
    "deviceManagementApplicabilityRuleOsVersion", "deviceManagementApplicabilityRuleDeviceMode",
  ]);
  const isMeta = (k) => META_KEY.has(k) || /^@odata/.test(k) || /@odata\.(context|count|type)$/.test(k);

  const short = (v, n) => { const s = String(v); return s.length > (n || 300) ? s.slice(0, (n || 300) - 1) + "…" : s; };

  // Flatten an arbitrary Graph object into readable name/value rows.
  const ROW_CAP = 300;
  function flatten(obj, prefix = "", out = [], depth = 0) {
    if (obj == null || depth > 6) return out;
    for (const [k, raw] of Object.entries(obj)) {
      // CHECKED PER ROW, not only on entry. The guard used to sit above the
      // loop, which caps recursion but does nothing about a single object with
      // five hundred keys — and Graph has a few. A test with 500 keys walked
      // straight past a 300 limit.
      if (out.length >= ROW_CAP) { out.push({ name: "…", value: `truncated at ${ROW_CAP} rows` }); return out; }
      if (isMeta(k) && !prefix) continue;
      const path = prefix ? `${prefix} › ${label(k)}` : label(k);
      const v = redactValue(k, raw);
      if (v === REDACTED || v === OMITTED) { out.push({ name: path, value: v, redacted: true }); continue; }
      if (v == null || v === "") continue;
      if (Array.isArray(v)) {
        if (!v.length) continue;
        if (v.every((x) => x == null || typeof x !== "object")) out.push({ name: path, value: short(v.join(", ")) });
        else v.slice(0, 20).forEach((x, i) => flatten(x, `${path} [${i + 1}]`, out, depth + 1));
      } else if (typeof v === "object") {
        flatten(v, path, out, depth + 1);
      } else if (typeof v === "boolean") {
        out.push({ name: path, value: v ? "Yes" : "No" });
      } else {
        out.push({ name: path, value: short(v) });
      }
    }
    return out;
  }

  // Settings-catalog instances have their own shape and the generic flattener
  // makes a mess of it: settingDefinitionId is the only human-readable thing
  // in there and it is buried three levels down under a value wrapper whose
  // name changes with the setting type.
  function catalogRows(settings) {
    const out = [];
    // `audit: true` is stamped from the RAW value, BEFORE short() and the
    // choice-tail shortening (build 10481): "_audit_mode" loses its word
    // to the tail split ("mode"), and a WDAC policy XML's literal
    // "Enabled:Audit Mode" sits past the 300-char display cap — both are
    // exactly the evidence T20 needs to keep an audit-mode App Control
    // policy from being reported as if it blocked anything. Additive:
    // the key exists only when true, display rows are unchanged.
    const auditOf = (raw) => /audit/i.test(String(raw ?? "")) || undefined;
    const walk = (inst, depth) => {
      if (!inst || depth > 6 || out.length > 300) return;
      const id = inst.settingDefinitionId || "";
      const name = id ? id.split("_").slice(-1)[0].replace(/([a-z0-9])([A-Z])/g, "$1 $2") : "(setting)";
      const pretty = name ? name.charAt(0).toUpperCase() + name.slice(1) : "(setting)";
      if (inst.choiceSettingValue) {
        const v = String(inst.choiceSettingValue.value || "");
        out.push({ name: pretty, value: short(v.split("_").slice(-1)[0] || v), defId: id, audit: auditOf(v) });
        (inst.choiceSettingValue.children || []).forEach((c) => walk(c, depth + 1));
      } else if (inst.simpleSettingValue) {
        out.push({ name: pretty, value: short(redactValue(id, inst.simpleSettingValue.value)), defId: id, audit: auditOf(inst.simpleSettingValue.value) });
      } else if (inst.simpleSettingCollectionValue) {
        const joined = inst.simpleSettingCollectionValue.map((x) => x.value).join(", ");
        out.push({ name: pretty, value: short(joined), defId: id, audit: auditOf(joined) });
      } else if (inst.choiceSettingCollectionValue) {
        inst.choiceSettingCollectionValue.forEach((c) => {
          out.push({ name: pretty, value: short(String(c.value || "").split("_").slice(-1)[0]), defId: id, audit: auditOf(c.value) });
          (c.children || []).forEach((x) => walk(x, depth + 1));
        });
      } else if (inst.groupSettingCollectionValue) {
        inst.groupSettingCollectionValue.forEach((g) => (g.children || []).forEach((c) => walk(c, depth + 1)));
      } else if (inst.groupSettingValue) {
        (inst.groupSettingValue.children || []).forEach((c) => walk(c, depth + 1));
      } else if (id) {
        out.push({ name: pretty, value: "(configured)", defId: id });
      }
    };
    (settings || []).forEach((s) => walk(s.settingInstance || s, 0));
    return out;
  }

  // ADMX: definition.displayName is a real label, which makes this the one
  // surface whose settings read well without any guesswork.
  function admxRows(defValues) {
    return (defValues || []).slice(0, 300).map((d) => {
      const pres = (d.presentationValues || [])
        .map((p) => p.value != null ? String(p.value) : (p.values ? p.values.join(", ") : ""))
        .filter(Boolean).join("; ");
      return {
        name: (d.definition && d.definition.displayName) || d.id,
        value: (d.enabled ? "Enabled" : "Disabled") + (pres ? ` — ${short(pres, 200)}` : ""),
        category: (d.definition && d.definition.categoryPath) || "",
      };
    });
  }

  // ------------------------------------------------------------ sections --
  // The order is the document's table of contents, and it is the original's
  // coverage order: what shapes a device first, then what protects the apps,
  // then how devices arrive, then the supporting objects.
  const SECTIONS = [
    {
      id: "settingsCatalog", label: "Settings catalog policies", icon: "🎛", scopes: () => S().config,
      endpoint: "/deviceManagement/configurationPolicies",
      nameField: "name", platformField: "platforms",
      list: "/deviceManagement/configurationPolicies?$expand=assignments",
      detail: (o) => `/deviceManagement/configurationPolicies/${o.id}/settings`,
      rowsFrom: (o) => catalogRows(o.__detail),
    },
    {
      id: "deviceConfigurations", label: "Device configuration profiles", icon: "⚙️", scopes: () => S().config,
      endpoint: "/deviceManagement/deviceConfigurations",
      list: "/deviceManagement/deviceConfigurations?$expand=assignments",
      rowsFrom: (o) => flatten(o),
    },
    {
      id: "admx", label: "Administrative templates", icon: "📋", scopes: () => S().config,
      endpoint: "/deviceManagement/groupPolicyConfigurations",
      list: "/deviceManagement/groupPolicyConfigurations?$expand=assignments",
      detail: (o) => `/deviceManagement/groupPolicyConfigurations/${o.id}/definitionValues?$expand=definition($select=id,classType,displayName,categoryPath),presentationValues`,
      rowsFrom: (o) => admxRows(o.__detail),
    },
    {
      id: "compliance", label: "Compliance policies", icon: "✅", scopes: () => S().config,
      endpoint: "/deviceManagement/deviceCompliancePolicies",
      list: "/deviceManagement/deviceCompliancePolicies?$expand=assignments,scheduledActionsForRule($expand=scheduledActionConfigurations)",
      rowsFrom: (o) => flatten(o),
    },
    {
      id: "appProtection", label: "App protection policies", icon: "🛡", scopes: () => S().apps,
      endpoint: "/deviceAppManagement/*ManagedAppProtections",
      surfaces: [
        "/deviceAppManagement/iosManagedAppProtections?$expand=assignments",
        "/deviceAppManagement/androidManagedAppProtections?$expand=assignments",
        "/deviceAppManagement/windowsManagedAppProtections?$expand=assignments",
      ],
      rowsFrom: (o) => flatten(o),
    },
    {
      id: "appConfig", label: "App configuration policies", icon: "🔧", scopes: () => S().apps,
      endpoint: "/deviceAppManagement/mobileAppConfigurations",
      surfaces: [
        "/deviceAppManagement/mobileAppConfigurations?$expand=assignments",
        "/deviceAppManagement/targetedManagedAppConfigurations?$expand=assignments",
      ],
      rowsFrom: (o) => flatten(o),
    },
    {
      id: "scripts", label: "Scripts & remediations", icon: "📜", scopes: () => S().scripts,
      endpoint: "/deviceManagement/deviceManagementScripts",
      surfaces: [
        "/deviceManagement/deviceManagementScripts?$expand=assignments",
        "/deviceManagement/deviceShellScripts?$expand=assignments",
        "/deviceManagement/deviceHealthScripts?$expand=assignments",
      ],
      // The bodies are redacted by key, so this section documents that a
      // script exists, what it is called and where it runs — not what it does.
      rowsFrom: (o) => flatten(o),
    },
    {
      id: "updates", label: "Windows update profiles", icon: "🔄", scopes: () => S().config,
      endpoint: "/deviceManagement/windows*UpdateProfiles",
      surfaces: [
        "/deviceManagement/windowsFeatureUpdateProfiles?$expand=assignments",
        "/deviceManagement/windowsQualityUpdateProfiles?$expand=assignments",
        "/deviceManagement/windowsDriverUpdateProfiles?$expand=assignments",
      ],
      rowsFrom: (o) => flatten(o),
    },
    {
      id: "enrolment", label: "Enrolment configurations", icon: "🚪", scopes: () => S().service,
      endpoint: "/deviceManagement/deviceEnrollmentConfigurations",
      list: "/deviceManagement/deviceEnrollmentConfigurations?$expand=assignments",
      rowsFrom: (o) => flatten(o),
    },
    {
      id: "autopilot", label: "Autopilot deployment profiles", icon: "🛫", scopes: () => S().service,
      endpoint: "/deviceManagement/windowsAutopilotDeploymentProfiles",
      list: "/deviceManagement/windowsAutopilotDeploymentProfiles?$expand=assignments",
      rowsFrom: (o) => flatten(o),
    },
    {
      id: "apps", label: "Applications", icon: "📦", scopes: () => S().apps,
      endpoint: "/deviceAppManagement/mobileApps",
      // $select keeps the icons out — without it this section is megabytes of
      // base64 that would be redacted on arrival anyway.
      list: "/deviceAppManagement/mobileApps?$expand=assignments&$select=id,displayName,description,publisher,createdDateTime,lastModifiedDateTime,isFeatured,privacyInformationUrl,informationUrl,owner,developer,notes",
      rowsFrom: (o) => flatten(o),
    },
    {
      // CONFIG, NOT RBAC (corrected 10490). learn.microsoft.com's "List
      // deviceAndAppManagementAssignmentFilters" names
      // DeviceManagementConfiguration.Read.All; this section had asked for
      // DeviceManagementRBAC.Read.All since it was written, and 10482 built
      // the filter-naming read on top of that mistake — so on a tenant that
      // granted config and not RBAC the names 403'd, and 10488's changelog
      // stated the wrong permission as the fix. filters.js had it right all
      // along, which is how the two disagreed.
      id: "filters", label: "Assignment filters", icon: "🔎", scopes: () => S().config,
      endpoint: "/deviceManagement/assignmentFilters",
      list: "/deviceManagement/assignmentFilters",
      rowsFrom: (o) => flatten(o),
    },
    {
      id: "scopeTags", label: "Scope tags", icon: "🏷", scopes: () => S().rbac,
      endpoint: "/deviceManagement/roleScopeTags",
      list: "/deviceManagement/roleScopeTags",
      rowsFrom: (o) => flatten(o),
    },
  ];
  const sectionById = (id) => SECTIONS.find((s) => s.id === id) || null;
  const allSectionIds = () => SECTIONS.map((s) => s.id);
  const scopesFor = (ids) => [...new Set((ids || allSectionIds()).flatMap((id) => (sectionById(id) || { scopes: () => [] }).scopes()))];

  const nameOf = (o, sec) => o[sec.nameField || "displayName"] || o.displayName || o.name || o.id;

  // ---------------------------------------------------------- collection --
  async function collect(opts) {
    const o = opts || {};
    const ids = (o.sections && o.sections.length) ? o.sections : allSectionIds();
    const status = o.onStatus || (() => {});
    const out = { sections: [], failed: [], partial: [], groupIds: new Set(), filterIds: new Set() };

    for (const id of ids) {
      const sec = sectionById(id);
      if (!sec) continue;
      status(`${sec.label} — reading…`);
      let items = [], notes = [];
      try {
        if (sec.surfaces) {
          for (const p of sec.surfaces) {
            try { (await read(p, sec.scopes())).forEach((x) => items.push(x)); }
            catch (e) { notes.push(`${p.split("?")[0].split("/").pop()}: ${short((e && e.message) || e, 120)}`); }
          }
          // All of them failing is a real failure. Some failing is a tenant
          // that does not have that workload.
          if (notes.length === sec.surfaces.length) throw new Error(notes.join("; "));
        } else {
          items = await read(sec.list, sec.scopes());
        }
      } catch (e) {
        out.failed.push({ id, label: sec.label, error: short((e && e.message) || e, 240), endpoint: sec.endpoint });
        continue;
      }
      if (notes.length) out.partial.push({ id, label: sec.label, notes });

      // the N+1, bounded — settings catalog and ADMX only
      if (sec.detail && items.length) {
        let done = 0;
        const res = await Graph.pool(items, async (it) => {
          const r = await read(sec.detail(it), sec.scopes());
          status(`${sec.label} — ${++done}/${items.length}`);
          return r;
        }, 6);
        res.forEach((r, i) => {
          if (r.error) {
            // Documented WITHOUT its settings, and said so — unlike a backup,
            // where an incomplete object would restore as an empty policy. A
            // document that lists a policy and admits it could not read the
            // settings is more useful than one that omits the policy.
            items[i].__detailError = short((r.error && r.error.message) || r.error, 160);
            items[i].__detail = [];
          } else items[i].__detail = r.value;
        });
      }

      const docs = items.map((it) => {
        (it.assignments || []).forEach((a) => {
          const g = a.target && a.target.groupId;
          if (g) out.groupIds.add(lc(g));
          // The filter id has ridden on the assignment since 10382 and has
          // never been NAMED. An id in a reach line is not an answer: the
          // portal shows PVM-DG-CORP-FILTER-AVD-ALL, the tool showed a GUID
          // or, worse, nothing at all (Mihai, first live tenant).
          const f = a.target && a.target.deviceAndAppManagementAssignmentFilterId;
          if (f) out.filterIds.add(lc(f));
        });
        return {
          id: it.id,
          name: nameOf(it, sec),
          description: it.description || "",
          platforms: platformsOf(it, sec),
          platform: platformsOf(it, sec).join(", "),
          type: String(it["@odata.type"] || "").replace(/^#?microsoft\.graph\./, ""),
          // Carried for T20 (build 10476): the template identity is how the
          // endpoint security disciplines are told apart, and it is cheap —
          // the object arrived with the list read either way.
          templateFamily: (it.templateReference && it.templateReference.templateFamily) || "",
          templateName: (it.templateReference && it.templateReference.templateDisplayName) || "",
          created: it.createdDateTime || "", modified: it.lastModifiedDateTime || "",
          assignments: (it.assignments || []).map((a) => assignmentOf(a)),
          rows: sec.rowsFrom(it) || [],
          detailError: it.__detailError || null,
        };
      }).sort((a, b) => String(a.name).localeCompare(String(b.name)));

      out.sections.push({ id, label: sec.label, icon: sec.icon, endpoint: sec.endpoint, items: docs });
    }

    // Group ids resolved once for the whole document rather than per section.
    if (out.groupIds.size && !o.skipNames) {
      status(`Naming ${out.groupIds.size} groups…`);
      try {
        const look = await Graph.resolveNames([...out.groupIds], { types: ["group"] });
        out.resolver = look;
        for (const s of out.sections) for (const it of s.items) {
          it.assignments = it.assignments.map((a) => (a.groupId ? Object.assign({}, a, { name: look(a.groupId) }) : a));
        }
      } catch (e) { out.nameError = short((e && e.message) || e, 160); }
    }

    // ASSIGNMENT FILTERS, NAMED ONCE — the group-name pattern exactly, for
    // the same reason: one read for the whole collection rather than one per
    // section, and a failure that is SAID rather than silently rendering
    // GUIDs as if they were names. The list is small (a tenant has tens of
    // filters, not thousands), so it is read whole rather than by id.
    // Unreadable is unknown, never absent: filterError is what the tools
    // print, and the assignment keeps its id.
    if (out.filterIds.size && !o.skipNames) {
      status(`Naming ${out.filterIds.size} assignment filter${out.filterIds.size === 1 ? "" : "s"}…`);
      try {
        const list = await read("/deviceManagement/assignmentFilters?$select=id,displayName,platform,assignmentFilterManagementType", S().config);
        const by = new Map((list || []).map((f) => [lc(f.id), f]));
        out.filters = by;
        for (const s2 of out.sections) for (const it of s2.items) {
          it.assignments = it.assignments.map((a) => {
            if (!a.filterId) return a;
            const f = by.get(lc(a.filterId)) || null;
            return Object.assign({}, a, {
              filterName: (f && f.displayName) || "",
              filterKind: (f && f.assignmentFilterManagementType) || "",
            });
          });
        }
      } catch (e) { out.filterError = short((e && e.message) || e, 160); }
    }
    return out;
  }

  // ---------------------------------------------------- the filter, read --
  //
  // THE ONE READ OF AN ASSIGNMENT FILTER OFF A RAW GRAPH TARGET. There were
  // five, and they disagreed with each other about the same tenant:
  //
  //   * groupuse.js keyed the whole thing off filterTYPE, so a target
  //     carrying an id with a missing or "none" type had no filter at all in
  //     T02, T06, T08, T09 and T14 — and a filter in T05, T12, T19 and T20.
  //     Two tools describing one assignment differently is the exact failure
  //     a single normaliser exists to prevent.
  //   * compliance.js and endpointsec.js flagged a policy as filtered when
  //     the filter sat on an EXCLUSION, where it narrows what is excluded
  //     rather than capping what is reached — the "may reach, not does"
  //     caveat those tools print does not describe that case at all.
  //   * none of them read the mode, so include and exclude were the same
  //     fact.
  //
  // KEYED ON THE ID, because the id is what makes a filter present. A mode
  // that is absent is DEFAULTED to include and says so — `modeStated` is
  // false — rather than being read as "no filter".
  function filterOfTarget(target) {
    const t = target || {};
    const id = t.deviceAndAppManagementAssignmentFilterId || "";
    if (!id) return null;
    const raw = lc(t.deviceAndAppManagementAssignmentFilterType);
    const stated = raw === "include" || raw === "exclude";
    return { id: lc(id), mode: raw === "exclude" ? "exclude" : "include", modeStated: stated };
  }

  // The two questions every reach verdict actually asks, over RAW targets.
  // `capped` is the one that means "this reaches fewer devices than the
  // target suggests"; a filter on an exclusion is its own, opposite fact and
  // is reported separately rather than folded into the caveat.
  function filterReachOf(assignments) {
    let capped = false, onExclusion = false;
    for (const x of (assignments || [])) {
      const f = filterOfTarget(x && x.target);
      if (!f) continue;
      if (/exclusionGroupAssignmentTarget/i.test((x.target && x.target["@odata.type"]) || "")) onExclusion = true;
      else capped = true;
    }
    return { capped, onExclusion };
  }

  // ---------------------------------------------------------- filter word --
  // The one way an assignment filter is written down, everywhere. A filter
  // NARROWS a target — include mode keeps only matching devices, exclude
  // mode drops them — so the mode is part of the name, never dropped: a
  // reader who sees only the filter's name cannot tell which way it cut.
  // An unnamed filter says so and keeps its id, because a blank is a claim
  // that there is no filter and there is one.
  function filterLabel(a) {
    if (!a || !a.filterId) return "";
    const mode = lc(a.filterType) === "exclude" ? "exclude" : "include";
    const name = a.filterName || `filter ${String(a.filterId).slice(0, 8)}… (name unread)`;
    return `${name} (${mode})`;
  }
  // ONE ASSIGNMENT, ONE SENTENCE — the four surfaces that write an
  // assignment down (the popout, Markdown, the HTML report and Word) had
  // four copies of `name (kind)`, and every one of them did the same two
  // things wrong. It printed "All devices · All devices", because
  // assignmentOf sets name === kind for a tenant-wide target and both were
  // concatenated. And it DROPPED THE FILTER — on all four, including the
  // Word export, so a policy targeted at All devices through
  // PVM-DG-CORP-FILTER-AVD-ALL circulated as a claim of whole-fleet reach
  // in the document an auditor reads. The filter had been resolved onto the
  // assignment since 10482 and no writer read it.
  //
  // The kind is dropped when it merely repeats the name; the filter is
  // appended when there is one. Returns plain text — each surface escapes
  // it for its own medium.
  function assignmentText(a) {
    if (!a) return "";
    const name = a.name || a.kind || "unknown";
    const kind = (a.kind && a.kind !== a.name) ? ` (${a.kind})` : "";
    const f = a.filterId ? ` — ⚑ ${filterLabel(a)}` : "";
    return `${name}${kind}${f}`;
  }

  // Every distinct filter on the non-excluded targets of one policy.
  function filtersOf(it) {
    const seen = new Map();
    for (const a of ((it && it.assignments) || [])) {
      if (!a.filterId || a.kind === "Excluded") continue;
      const k = `${lc(a.filterId)}|${lc(a.filterType)}`;
      if (!seen.has(k)) seen.set(k, filterLabel(a));
    }
    return [...seen.values()];
  }

  // ---------------------------------------------------------- platforms --
  //
  // ONE VOCABULARY. Graph describes the same platform three different ways
  // depending on which surface you ask, and the first version of this passed
  // whatever it found straight into the filter — so a tenant with both a
  // settings-catalog policy and a device configuration for Windows offered
  // "windows10" AND "Windows" as separate choices, each matching half the
  // policies. A settings-catalog policy targeting two platforms arrived as the
  // single opaque string "windows10,macOS", matching neither. And Graph's
  // literal "none" appeared in the list as though it were a platform.
  //
  // Everything is normalised to this list, and a policy carries an ARRAY,
  // because a policy really can target more than one.
  const PLATFORM_ORDER = ["Windows", "macOS", "iOS/iPadOS", "Android", "Linux"];
  const NOT_SPECIFIC = "Not platform-specific";

  function normPlatform(token) {
    const t = lc(token).replace(/^#?microsoft\.graph\./, "");
    // Redundant today — "none" and "unknownFutureValue" match none of the
    // patterns below and would fall through to the same null. It is explicit
    // because the fallthrough is what makes it redundant, and the day someone
    // adds a permissive catch-all at the bottom this is what stops Graph's
    // two placeholder values appearing in a filter as though they were
    // platforms. A mutation test found nothing to break here; that is worth
    // knowing rather than assuming.
    if (!t || t === "none" || t === "unknownfuturevalue") return null;
    if (/^win32|^windows|^win10|^microsoftedge|^officesuite/.test(t)) return "Windows";
    if (/^macos|^mac(?![a-z])/.test(t)) return "macOS";
    if (/^ios|^ipad|^iphone/.test(t)) return "iOS/iPadOS";
    if (/^android|^aosp/.test(t)) return "Android";
    if (/^linux/.test(t)) return "Linux";
    return null;
  }

  // A policy may declare its platforms in a `platforms` field (settings
  // catalog, comma-separated), or imply one through its @odata.type, or say
  // nothing at all — a platform script, an assignment filter, a scope tag.
  // "Nothing at all" is a real answer and gets a name, so it can be filtered
  // FOR rather than being invisible in every filtered view.
  function platformsOf(it, sec) {
    const out = new Set();
    const declared = sec && sec.platformField ? it[sec.platformField] : null;
    if (declared) String(declared).split(/[,;]/).forEach((x) => { const p = normPlatform(x.trim()); if (p) out.add(p); });
    if (!out.size) {
      const p = normPlatform(it["@odata.type"] || "");
      if (p) out.add(p);
    }
    // A few surfaces are single-platform by definition and say so nowhere.
    if (!out.size && sec && sec.id === "autopilot") out.add("Windows");
    return [...out].sort((a, b) => PLATFORM_ORDER.indexOf(a) - PLATFORM_ORDER.indexOf(b));
  }

  // Kept for the one caller that only has an object: derives a single display
  // string. platformsOf() is what the filter uses.
  function platformOf(it) { return platformsOf(it, null)[0] || ""; }

  // ------------------------------------------------------------- popout --
  // The head + body of the policy popout, as one function, because two tools
  // show it now: T05's browse and T19's overview cards. The first time two
  // copies of this template exist, one of them renders a policy differently —
  // the redactValue lesson (T10), applied to markup. The FOOT is deliberately
  // not here: what you can do with an open policy is each tool's own claim
  // (T05 ticks it into the document; T19 just closes).
  function popoutHtml(sec, it) {
    return `
      <div class="gu-m-head">
        <h3>${esc(it.name)}</h3>
        <div class="mini muted">${[sec.label, it.platform, it.type, it.modified ? "modified " + String(it.modified).slice(0, 10) : ""].filter(Boolean).map(esc).join(" · ")}</div>
        ${it.description ? `<p class="mini" style="margin:8px 0 0">${esc(it.description)}</p>` : ""}
        <div class="mini" style="margin-top:8px">${it.assignments.length
          ? it.assignments.map((a) => `<span class="gu-how ${a.kind === "Excluded" ? "exc" : "inc"}"${a.filterId ? ` title="An assignment filter narrows this target — the service evaluates it against inventory a browser cannot see"` : ""}>${esc(assignmentText(a))}</span>`).join(" ")
          : `<span class="gu-how exc">Not assigned to anything</span>`}</div>
        <div class="mini muted" style="margin-top:6px">Source: <code>${esc(sec.endpoint)}</code></div>
      </div>
      <div class="gu-m-body">
        ${it.detailError
          ? `<div class="gu-fail"><b>The settings could not be read.</b><span class="why">${esc(it.detailError)} — this policy is listed because it exists; its configuration is unknown.</span></div>`
          : it.rows.length
            ? `<div class="gu-tw"><table class="cg-table"><thead><tr><th style="width:42%">Setting</th><th>Value</th></tr></thead>
               <tbody>${it.rows.map((r) => `<tr><td class="mini">${esc(r.name)}</td><td class="mini"${r.redacted ? ' style="color:var(--off);font-style:italic"' : ""}>${esc(r.value)}</td></tr>`).join("")}</tbody></table></div>`
            : `<p class="mini muted">No documentable settings.</p>`}
      </div>`;
  }

  function assignmentOf(a) {
    const t = (a && a.target) || {};
    const ty = lc(t["@odata.type"]);
    // The filter id rides along (build 10382, for T12): an assignment filter
    // sits between an assignment and a device, a browser cannot evaluate it,
    // and a conflict verdict that ignored it would say "can collide" about
    // two policies a filter keeps apart. Additive — nothing that renders
    // assignments changes.
    const filterId = t.deviceAndAppManagementAssignmentFilterId || null;
    const withF = (o) => (filterId ? Object.assign(o, { filterId, filterType: t.deviceAndAppManagementAssignmentFilterType || "" }) : o);
    if (ty.includes("exclusiongroupassignmenttarget")) return withF({ kind: "Excluded", groupId: lc(t.groupId), name: lc(t.groupId) });
    if (ty.includes("groupassignmenttarget")) return withF({ kind: "Included", groupId: lc(t.groupId), name: lc(t.groupId) });
    if (ty.includes("alldevicesassignmenttarget")) return withF({ kind: "All devices", groupId: null, name: "All devices" });
    if (ty.includes("alllicensedusersassignmenttarget")) return withF({ kind: "All users", groupId: null, name: "All users" });
    return withF({ kind: "Other", groupId: null, name: (t["@odata.type"] || "unknown").split(".").pop() });
  }

  function summarize(res) {
    const total = res.sections.reduce((n, s) => n + s.items.length, 0);
    const assigned = res.sections.reduce((n, s) => n + s.items.filter((i) => i.assignments.length).length, 0);
    const redacted = res.sections.reduce((n, s) => n + s.items.reduce((m, i) => m + i.rows.filter((r) => r.redacted).length, 0), 0);
    return {
      total, assigned, unassigned: total - assigned,
      sections: res.sections.length, failed: res.failed.length,
      redacted,
      noSettings: res.sections.reduce((n, s) => n + s.items.filter((i) => i.detailError).length, 0),
    };
  }

  // ------------------------------------------------------------ filtering --
  function filterItems(res, q) {
    const t = lc(q && q.text);
    const plat = q && q.platform;
    const state = q && q.state;
    return res.sections.map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        // Name, description, TYPE and every setting name and value. The type
        // matters: "macOSGeneralDeviceConfiguration" is how somebody searches
        // for a class of profile, and it is not in the settings rows because
        // @odata.type is filtered out as bookkeeping before they are built.
        // …AND THE ASSIGNMENT (10492). "Which policies hit SG-Pilot" and
        // "what does PVM-DG-CORP-FILTER-AVD-ALL touch" are the two questions
        // this box was asked and could not answer — T19's search had reached
        // group names since it shipped and T05's, on the same collection,
        // had not.
        if (t && !lc(i.name).includes(t) && !lc(i.description).includes(t) && !lc(i.type).includes(t)
          && !i.assignments.some((a) => lc(a.name).includes(t) || lc(a.kind).includes(t) || lc(a.filterName).includes(t))
          && !i.rows.some((r) => lc(r.name).includes(t) || lc(r.value).includes(t))) return false;
        if (plat && plat !== "All") {
          if (plat === NOT_SPECIFIC) { if (i.platforms.length) return false; }
          else if (!i.platforms.includes(plat)) return false;
        }
        if (state === "assigned" && !i.assignments.length) return false;
        if (state === "unassigned" && i.assignments.length) return false;
        return true;
      }),
    })).filter((s) => s.items.length);
  }

  // THE LIST IS FIXED: all five platforms, always, plus the bucket for things
  // that target none. It used to be built only from what the read returned,
  // which sounds tidier and is worse in practice — the options changed shape
  // from tenant to tenant, a single-platform estate got a control with one
  // entry and nothing to do, and an admin who thinks "we have no Linux" had
  // no way to confirm it. A fixed list is predictable, and a ZERO IS AN
  // ANSWER: "Linux (0)" tells you something that an absent Linux entry does
  // not. The count is what makes the fixed list honest rather than noise.
  function platformCounts(res) {
    const n = Object.fromEntries(PLATFORM_ORDER.map((p) => [p, 0]));
    n[NOT_SPECIFIC] = 0;
    let total = 0;
    res.sections.forEach((s) => s.items.forEach((i) => {
      total++;
      if (!i.platforms.length) n[NOT_SPECIFIC]++;
      // A policy targeting two platforms counts under both, so these do NOT
      // sum to the total. That is correct and the label says "All" rather
      // than a sum for exactly that reason.
      else i.platforms.forEach((p) => { if (n[p] != null) n[p]++; });
    }));
    return { counts: n, total };
  }

  function platforms(res) { return [...PLATFORM_ORDER, NOT_SPECIFIC]; }

  // ------------------------------------------------------------- exports --
  // A FILTERED DOCUMENT MUST NEVER READ AS A COMPLETE ONE. meta() carries
  // both counts and the filter that produced them, and every export prints
  // them in its header — the alternative is a forty-policy document of a
  // four-hundred-policy tenant circulating as though it were the whole thing.
  function filterText(q) {
    if (!q) return "";
    const bits = [];
    if (q.text) bits.push(`matching “${q.text}”`);
    if (q.platform && q.platform !== "All") bits.push(`platform ${q.platform}`);
    if (q.state === "assigned") bits.push("assigned only");
    if (q.state === "unassigned") bits.push("unassigned only");
    return bits.join(", ");
  }

  function meta(res, opts) {
    const o = opts || {};
    const total = summarize(res).total;
    const shown = (o.sections || res.sections).reduce((n, s) => n + s.items.length, 0);
    return {
      when: new Date().toISOString().replace(/\..*/, "").replace("T", " ") + " UTC",
      date: new Date().toISOString().slice(0, 10),
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
      tenant: o.tenant || "",
      title: o.title || "Microsoft Intune — configuration",
      shown, total, filtered: shown !== total,
      bySelection: !!o.bySelection,
      single: !!o.single,
      filter: filterText(o.query),
      sectionsShown: (o.sections || res.sections).length,
      sectionsRead: res.sections.length,
    };
  }

  // The one sentence that has to appear in every format.
  //
  // SELECTED and FILTERED are different reasons for a document to be short,
  // and a reader deserves to know which. "I picked these twelve" and "a
  // platform filter left twelve" are not the same claim, and neither is the
  // same as "this is the tenant".
  const scopeLine = (m) => {
    if (!m.filtered) return `${m.shown} object(s) across ${m.sectionsShown} section(s) — the complete set that was read.`;
    const why = m.bySelection ? "A SELECTION" : "A FILTERED VIEW";
    const how = m.bySelection
      ? `${m.shown} of ${m.total} objects were chosen for this document`
      : `${m.shown} of ${m.total} objects${m.filter ? `, ${m.filter}` : ""}`;
    return `THIS IS ${why}: ${how}. It is not a complete record of the tenant.`;
  };

  const NOTE_REDACTED = "Secret-bearing values are redacted. Script bodies, certificates, passwords, pre-shared keys and encrypted OMA-URI values are replaced with a marker: the document records that a value is set without carrying it. This cannot be switched off.";
  const NOTE_LIVE = "This document describes the tenant as it was at the moment it was generated. It is a snapshot, not a specification.";

  function markdown(sections, res, m) {
    const s = summarize(res);
    const L = [];
    L.push(`# ${m.title}`, "");
    if (m.tenant) L.push(`**${m.tenant}**`, "");
    L.push(`Generated ${m.when} by TUNO ${m.build}`, "");
    L.push(`| | |`, `|---|---|`);
    L.push(`| Scope | ${mdCell(scopeLine(m))} |`);
    L.push(`| Sections | ${m.sectionsShown} of ${m.sectionsRead} read |`);
    L.push(`| Objects | ${m.shown} of ${s.total} (${s.assigned} assigned, ${s.unassigned} unassigned, across everything read) |`);
    if (s.redacted) L.push(`| Redacted values | ${s.redacted} |`);
    if (s.failed) L.push(`| Sections unreadable | ${s.failed} |`);
    L.push("");
    if (m.filtered) L.push(`> **${mdCell(scopeLine(m))}**`, "");
    L.push(`> ${NOTE_REDACTED}`, "");
    L.push(`> ${NOTE_LIVE}`, "");
    if (res.failed.length) {
      L.push(`> **${res.failed.length} section(s) could not be read** and are absent below — they are unknown, not empty: ${res.failed.map((f) => mdCell(f.label)).join(", ")}.`, "");
    }
    if (res.nameError) L.push(`> Group names could not be resolved (${mdCell(res.nameError)}); assignments show group IDs.`, "");

    L.push(`## Contents`, "");
    sections.forEach((sec) => L.push(`- ${sec.icon} ${mdCell(sec.label)} (${sec.items.length})`));
    L.push("");

    for (const sec of sections) {
      L.push(`## ${sec.icon} ${mdCell(sec.label)}`, "");
      L.push(`_Source: Microsoft Graph beta \`${mdCell(sec.endpoint)}\` — ${sec.items.length} object(s)._`, "");
      for (const it of sec.items) {
        L.push(`### ${mdCell(it.name)}`, "");
        const facts = [];
        if (it.platform) facts.push(`Platform: ${mdCell(it.platform)}`);
        if (it.type) facts.push(`Type: \`${mdCell(it.type)}\``);
        if (it.modified) facts.push(`Modified: ${mdCell(String(it.modified).slice(0, 10))}`);
        if (facts.length) L.push(facts.join(" · "), "");
        if (it.description) L.push(mdCell(it.description), "");
        L.push(`**Assignments** — ${it.assignments.length
          ? it.assignments.map((a) => mdCell(assignmentText(a))).join(", ")
          : "_not assigned to anything_"}`, "");
        if (it.detailError) {
          L.push(`> The settings for this policy could not be read (${mdCell(it.detailError)}). It is listed because it exists; its configuration is unknown.`, "");
        } else if (it.rows.length) {
          L.push(`| Setting | Value |`, `|---|---|`);
          it.rows.forEach((r) => L.push(`| ${mdCell(r.name)} | ${mdCell(r.value)} |`));
          L.push("");
        } else {
          L.push(`_No documentable settings._`, "");
        }
      }
    }
    L.push(`---`, ``, `Coverage after Ugur Koc's [IntuneDocumentation](https://github.com/ugurkocde/IntuneDocumentation) (Elastic License 2.0 — reimplemented, not forked). Generated in the browser by TUNO; the configuration was never sent anywhere.`);
    return L.join("\n");
  }

  const REPORT_CSS = `
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#f4f5fa;color:#1f2330}
header{padding:26px;background:#1f2933;color:#fff}h1{margin:0;font-size:22px}
.meta{color:#c8d1d9;font-size:13px;margin-top:6px}
.cards{display:flex;gap:12px;padding:14px 26px;background:#fff;border-bottom:1px solid #e6e6ee;flex-wrap:wrap}
.card{background:#f7f8fc;border:1px solid #e6e6ee;border-radius:10px;padding:10px 16px;min-width:110px}
.card .n{font-size:22px;font-weight:700}.card .l{font-size:11px;color:#6b7280;text-transform:uppercase}
main{padding:18px 26px;max-width:1100px}
.note{background:#fff8e6;border:1px solid #f0dca8;border-radius:8px;padding:10px 14px;margin:0 0 12px;font-size:13px}
.note.bad{background:#fdeceb;border-color:#f2c4bf}
nav.toc{background:#fff;border:1px solid #e6e6ee;border-radius:10px;padding:14px 18px;margin-bottom:18px}
nav.toc a{display:block;padding:3px 0;color:#2b4c9b;text-decoration:none;font-size:13.5px}
h2{margin:26px 0 4px;font-size:17px;border-bottom:2px solid #1f2933;padding-bottom:6px}
.src{color:#6b7280;font-size:12px;margin:0 0 12px}
.pol{background:#fff;border:1px solid #e6e6ee;border-radius:10px;margin-bottom:12px;padding:14px 18px}
.pol h3{margin:0 0 2px;font-size:14.5px}
.facts{color:#6b7280;font-size:12px;margin-bottom:6px}
.asg{font-size:12.5px;margin-bottom:8px}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;margin-right:4px}
.pill.inc{background:#e6f4ea;color:#1e7e34}.pill.exc{background:#fdeceb;color:#b04a3a}
.pill.tw{background:#e8eefc;color:#2b4c9b}.pill.none{background:#eef0f5;color:#6b7280}
table{border-collapse:collapse;width:100%;font-size:12.5px}
th{background:#f7f8fc;padding:6px 10px;text-align:left;border-bottom:1px solid #e6e6ee;font-size:11px;text-transform:uppercase;color:#6b7280}
td{padding:5px 10px;border-bottom:1px solid #f4f4f8;vertical-align:top}
td.k{width:42%;color:#3a4152}
.red{color:#b04a3a;font-style:italic}
footer{padding:18px 26px;color:#6b7280;font-size:12px}footer a{color:#2b4c9b}
@media print{body{background:#fff}.pol,nav.toc{break-inside:avoid}h2{break-after:avoid}}`;

  function html(sections, res, m) {
    const s = summarize(res);
    const pill = (a) => `<span class="pill ${a.kind === "Excluded" ? "exc" : (a.groupId ? "inc" : "tw")}">${esc(assignmentText(a))}</span>`;
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>${esc(m.title)}${m.tenant ? ` — ${esc(m.tenant)}` : ""}</title><style>${REPORT_CSS}</style></head><body>
<header><h1>${esc(m.title)}</h1><div class="meta">${m.tenant ? esc(m.tenant) + " · " : ""}generated ${esc(m.when)} by TUNO ${esc(m.build)}</div></header>
<div class="cards">
  <div class="card"><div class="n">${m.shown}${m.filtered ? `<span style="font-size:13px;color:#6b7280"> / ${s.total}</span>` : ""}</div><div class="l">Objects</div></div>
  <div class="card"><div class="n">${m.sectionsShown}</div><div class="l">Sections</div></div>
  <div class="card"><div class="n">${s.unassigned}</div><div class="l">Unassigned</div></div>
  ${s.redacted ? `<div class="card"><div class="n">${s.redacted}</div><div class="l">Redacted</div></div>` : ""}
</div>
<main>
  ${m.filtered ? `<p class="note bad"><b>${esc(scopeLine(m))}</b></p>` : ""}
  <p class="note">${esc(NOTE_REDACTED)}</p>
  <p class="note">${esc(NOTE_LIVE)}</p>
  ${res.failed.length ? `<p class="note bad"><b>${res.failed.length} section(s) could not be read</b> and are absent below — they are unknown, not empty: ${res.failed.map((f) => esc(f.label)).join(", ")}.</p>` : ""}
  ${res.nameError ? `<p class="note bad">Group names could not be resolved (${esc(res.nameError)}); assignments below show group IDs.</p>` : ""}
  <nav class="toc"><b>Contents</b>${sections.map((sec) => `<a href="#${esc(sec.id)}">${esc(sec.icon)} ${esc(sec.label)} (${sec.items.length})</a>`).join("")}</nav>
  ${sections.map((sec) => `
    <h2 id="${esc(sec.id)}">${esc(sec.icon)} ${esc(sec.label)}</h2>
    <p class="src">Source: Microsoft Graph beta <code>${esc(sec.endpoint)}</code> — ${sec.items.length} object(s)</p>
    ${sec.items.map((it) => `<div class="pol">
      <h3>${esc(it.name)}</h3>
      <div class="facts">${[it.platform, it.type, it.modified ? "modified " + String(it.modified).slice(0, 10) : ""].filter(Boolean).map(esc).join(" · ")}</div>
      ${it.description ? `<div class="facts">${esc(it.description)}</div>` : ""}
      <div class="asg">${it.assignments.length ? it.assignments.map(pill).join("") : '<span class="pill none">not assigned</span>'}</div>
      ${it.detailError
        ? `<p class="note bad">The settings for this policy could not be read (${esc(it.detailError)}). It is listed because it exists; its configuration is unknown.</p>`
        : it.rows.length
          ? `<table><thead><tr><th>Setting</th><th>Value</th></tr></thead><tbody>${it.rows.map((r) => `<tr><td class="k">${esc(r.name)}</td><td${r.redacted ? ' class="red"' : ""}>${esc(r.value)}</td></tr>`).join("")}</tbody></table>`
          : `<div class="facts">No documentable settings.</div>`}
    </div>`).join("")}`).join("")}
</main>
<footer>Coverage after Ugur Koc's <a href="https://github.com/ugurkocde/IntuneDocumentation">IntuneDocumentation</a> (Elastic License 2.0 — reimplemented, not forked). Generated in the browser by TUNO; the configuration was never sent anywhere.</footer>
</body></html>`;
  }

  // ---------- Word (.docx) — ENCA's text-document writer, ported ----------
  const X = (t) => String(t).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const P = (t, o = {}) => `<w:p><w:pPr>${o.h ? `<w:spacing w:before="${o.h === 1 ? 320 : 240}" w:after="120"/>` : `<w:spacing w:after="${o.tight ? 40 : 120}"/>`}</w:pPr>` +
    (Array.isArray(t) ? t : [[t, o]]).map(([txt, ro = {}]) =>
      `<w:r><w:rPr>${ro.b || o.b || o.h ? "<w:b/>" : ""}${o.h ? `<w:sz w:val="${o.h === 1 ? 34 : o.h === 2 ? 28 : 24}"/><w:color w:val="1F4E79"/>` : ""}${ro.i || o.i ? "<w:i/>" : ""}${o.small ? '<w:sz w:val="18"/>' : ""}${ro.red ? '<w:color w:val="B04A3A"/><w:i/>' : ""}</w:rPr><w:t xml:space="preserve">${X(txt)}</w:t></w:r>`).join("") + `</w:p>`;
  // A real Word table, so a settings list is a table in Word rather than a
  // run of paragraphs somebody has to reformat before circulating it.
  const TBL = (rows) => `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>
<w:tblBorders><w:top w:val="single" w:sz="4" w:color="E6E6EE"/><w:left w:val="single" w:sz="4" w:color="E6E6EE"/><w:bottom w:val="single" w:sz="4" w:color="E6E6EE"/><w:right w:val="single" w:sz="4" w:color="E6E6EE"/><w:insideH w:val="single" w:sz="4" w:color="F0F0F5"/><w:insideV w:val="single" w:sz="4" w:color="F0F0F5"/></w:tblBorders></w:tblPr>
<w:tblGrid><w:gridCol w:w="3600"/><w:gridCol w:w="5000"/></w:tblGrid>
${rows.map(([k, v, red]) => `<w:tr><w:tc><w:tcPr><w:tcW w:w="42" w:type="pct"/></w:tcPr>${P(k, { tight: true, small: true })}</w:tc><w:tc><w:tcPr><w:tcW w:w="58" w:type="pct"/></w:tcPr>${P([[v, { red: !!red }]], { tight: true, small: true })}</w:tc></w:tr>`).join("")}
</w:tbl><w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`;

  function docx(sections, res, m) {
    if (typeof JSZip === "undefined") throw new Error("The zip library did not load; the Word document cannot be written.");
    const s = summarize(res);
    const body = [];
    body.push(P(m.title, { h: 1 }));
    if (m.tenant) body.push(P(m.tenant, { b: true }));
    body.push(P(`Generated ${m.when} by TUNO ${m.build}.`, { i: true }));
    body.push(P(scopeLine(m), { b: m.filtered, i: !m.filtered }));
    body.push(P(NOTE_REDACTED, { i: true }));
    body.push(P(NOTE_LIVE, { i: true }));
    if (res.failed.length) body.push(P(`${res.failed.length} section(s) could not be read and are absent from this document — they are unknown, not empty: ${res.failed.map((f) => f.label).join(", ")}.`, { b: true }));
    if (res.nameError) body.push(P(`Group names could not be resolved; assignments below show group IDs.`, { i: true }));

    body.push(P("Contents", { h: 2 }));
    sections.forEach((sec) => body.push(P(`${sec.label} (${sec.items.length})`, { tight: true })));

    for (const sec of sections) {
      body.push(P(sec.label, { h: 2 }));
      body.push(P(`Source: Microsoft Graph beta ${sec.endpoint} — ${sec.items.length} object(s)`, { i: true, small: true }));
      for (const it of sec.items) {
        body.push(P(it.name, { h: 3 }));
        const facts = [it.platform, it.type, it.modified ? `modified ${String(it.modified).slice(0, 10)}` : ""].filter(Boolean).join(" · ");
        if (facts) body.push(P(facts, { i: true, small: true, tight: true }));
        if (it.description) body.push(P(it.description, { tight: true }));
        body.push(P([["Assignments: ", { b: true }],
          [it.assignments.length ? it.assignments.map(assignmentText).join(", ") : "not assigned to anything", {}]], { tight: true }));
        if (it.detailError) body.push(P(`The settings for this policy could not be read (${it.detailError}). It is listed because it exists; its configuration is unknown.`, { i: true }));
        else if (it.rows.length) body.push(TBL(it.rows.map((r) => [r.name, r.value, r.redacted])));
        else body.push(P("No documentable settings.", { i: true, small: true }));
      }
    }
    body.push(P(`Coverage after Ugur Koc's IntuneDocumentation (Elastic License 2.0 — reimplemented, not forked). Generated in the browser by TUNO; the configuration was never sent anywhere.`, { i: true, small: true }));

    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${body.join("\n")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1250" w:bottom="1080" w:left="1250"/></w:sectPr>
</w:body></w:document>`);
    return zip;
  }

  return {
    SECTIONS, sectionById, allSectionIds, scopesFor, filterLabel, filtersOf, assignmentText, filterOfTarget, filterReachOf,
    flatten, catalogRows, admxRows, label, redactValue, REDACTED, OMITTED, SECRET_KEY, words,
    collect, summarize, filterItems, platforms, platformCounts, assignmentOf, platformOf, platformsOf, normPlatform,
    popoutHtml,
    PLATFORM_ORDER, NOT_SPECIFIC,
    meta, markdown, html, docx, NOTE_REDACTED, scopeLine, filterText,
  };
})();


// ======================================================================
// T05 — the screen.
// ======================================================================
const DocsTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  let res = null, running = false;
  // SELECTION IS THE EXPORT SET, and that is the whole point of it. The
  // filter narrows what you are LOOKING at; the selection decides what you
  // are SENDING. Keeping them separate is what lets you filter to find three
  // policies, tick them, clear the filter, and still export three.
  let selected = new Set();
  const keyOf = (secId, itemId) => secId + "|" + itemId;

  const prog = (m) => TunoProgress.show("dcBody", "dcProg", m);   // ENCA-style centred card (10397)

  // THE FILTERS ARE DEAD UNTIL THERE IS SOMETHING TO FILTER. Leaving them
  // live before a read is how the platform list came to look broken: it was
  // empty because nothing had been read, and the control gave no hint of that
  // — it just offered one option and looked like a bug.
  // The platform filter lives in the sticky selection bar, not in the setup
  // form, so it stays reachable while you scroll a tenant's worth of policies
  // — flipping platform is what you do repeatedly while scanning, and the
  // form scrolls away after the first screenful. It is held here rather than
  // read off the DOM because the bar is re-rendered on every change: an
  // element that is destroyed and rebuilt cannot also be the source of truth.
  let platformFilter = "All";
  let platformOpts = [];

  // A greyed box with its explanation in a paragraph underneath reads as a
  // missing feature (Mihai, 10492 — "t05 missing a search"). The reason now
  // lives IN the control, where the eye already is.
  const SEARCH_PLACEHOLDER = "e.g. BitLocker, SG-Pilot, or a filter name";
  const SEARCH_WAITING = "Read the configuration first — then search here";
  function setFiltersEnabled(on) {
    ["dcSearch", "dcState"].forEach((id) => { const el = $(id); if (el) el.disabled = !on; });
    const se = $("dcSearch");
    if (se) se.placeholder = on ? SEARCH_PLACEHOLDER : SEARCH_WAITING;
    const hint = $("dcFilterHint");
    if (hint) hint.style.display = on ? "none" : "";
  }
  const chosen = () => [...document.querySelectorAll("#dcSections input[type=checkbox]")].filter((c) => c.checked).map((c) => c.value);
  const showExports = (on) => ["dcMd", "dcHtml", "dcDocx"].forEach((id) => { const b = $(id); if (b) b.style.display = on ? "" : "none"; });

  function renderSections() {
    const box = $("dcSections");
    if (!box) return;
    box.innerHTML = Docs.SECTIONS.map((s) => `
      <label class="gu-area on" data-sec="${esc(s.id)}">
        <input type="checkbox" value="${esc(s.id)}" checked>
        <span class="gu-a-h">${esc(s.icon)} ${esc(s.label)}</span>
        <span class="mini muted"><code>${esc(s.endpoint)}</code></span>
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
    $("dcBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>${esc(msg)}</b></div>${extra}</div>`;
    showExports(false); prog("");
  }

  async function run() {
    if (running) return;
    const secs = chosen();
    if (!secs.length) { fail("Pick at least one section to read."); return; }
    running = true; $("dcRun").disabled = true; showExports(false); $("dcBody").innerHTML = "";
    try {
      prog("Checking permissions…");
      // "filters" rides along because collect() NAMES assignment filters
      // (10482) and that read is RBAC-scoped. Without it a collection with
      // one filtered assignment reaches for a token mid-read, with no user
      // gesture behind it — a consent popup the browser blocks, blamed on
      // filter naming, after the tool has already said permissions were fine.
      await Graph.ensureScopes([...new Set([...Docs.scopesFor(secs), ...Docs.scopesFor(["filters"]), ...Graph.SCOPES.directory])]);
      res = await Docs.collect({ sections: secs, onStatus: prog });
      // Every platform, every time, each with how many were found. A zero is
      // an answer — "Linux (0)" confirms there is no Linux estate, which an
      // absent Linux entry never could.
      const { counts, total } = Docs.platformCounts(res);
      platformOpts = [{ value: "All", label: `All platforms (${total})` }]
        .concat(Docs.platforms(res).map((p) => ({ value: p, label: `${p} (${counts[p]})` })));
      platformFilter = "All";
      setFiltersEnabled(true);
      // Everything selected to begin with: the common case is "document the
      // tenant", and starting at nothing would make the export buttons dead
      // on arrival with no explanation.
      selected = new Set();
      selectAll(res.sections);
      prog("");
      render();
    } catch (e) { fail(e); }
    finally { running = false; $("dcRun").disabled = false; }
  }

  const query = () => ({ text: $("dcSearch").value, platform: platformFilter, state: $("dcState").value });
  const current = () => Docs.filterItems(res, query());
  // Every item that is ticked, in section order, regardless of the filter.
  const selectedSections = () => res.sections
    .map((sec) => ({ ...sec, items: sec.items.filter((it) => selected.has(keyOf(sec.id, it.id))) }))
    .filter((sec) => sec.items.length);
  const selectAll = (secs) => { secs.forEach((sec) => sec.items.forEach((it) => selected.add(keyOf(sec.id, it.id)))); };

  function render() {
    const sections = current();
    const s = Docs.summarize(res);
    const shown = sections.reduce((n, x) => n + x.items.length, 0);
    const stat = (n, l, cls) => `<span class="gu-stat ${n ? (cls || "") : "zero"}"><b>${n}</b> ${esc(l)}</span>`;

    const head = `<div class="gu-sticky">
      <span class="gu-who">Tenant configuration
        <span class="mini muted">${shown} of ${s.total} object${s.total === 1 ? "" : "s"} shown · ${s.sections} section${s.sections === 1 ? "" : "s"} read</span></span>
      <div class="gu-sum">
        ${stat(s.total, "objects")}${stat(s.unassigned, "unassigned")}${stat(s.redacted, "redacted")}
        ${s.noSettings ? stat(s.noSettings, "settings unreadable") : ""}
        ${s.failed ? `<span class="gu-stat" style="border-color:var(--off)"><b>${s.failed}</b> sections unreadable</span>` : ""}
      </div></div>`;

    const notes = [`<p class="mini muted"><b>Secrets are redacted, and that cannot be turned off.</b> ${esc(Docs.NOTE_REDACTED.replace(/^Secret-bearing values are redacted\. /, ""))}</p>`];
    if (res.failed.length) {
      notes.push(`<div class="gu-fail"><b>${res.failed.length} section${res.failed.length === 1 ? "" : "s"} could not be read.</b><span class="why">Absent from the document below and from every export — unknown, not empty. ${res.failed.map((f) => `${esc(f.label)}: ${esc(f.error)}`).join("; ")}</span></div>`);
    }
    if (res.partial.length) {
      notes.push(`<div class="gu-fail gu-skip"><b>Read in part.</b><span class="why">${res.partial.map((p) => `${esc(p.label)} — ${esc(p.notes.join("; "))}`).join("; ")}. Usually a workload the tenant does not have.</span></div>`);
    }
    if (res.nameError) notes.push(`<div class="gu-fail gu-skip"><b>Group names could not be resolved.</b><span class="why">${esc(res.nameError)} — assignments show group IDs.</span></div>`);

    const body = sections.length ? sections.map((sec) => {
      const all = sec.items.every((it) => selected.has(keyOf(sec.id, it.id)));
      return `
      <div class="gu-src">
        <h5>
          <label class="chk" style="display:inline-flex;gap:6px;align-items:center;cursor:pointer">
            <input type="checkbox" data-secall="${esc(sec.id)}"${all ? " checked" : ""}>
            ${esc(sec.icon)} ${esc(sec.label)}</label>
          <span class="mini muted">${sec.items.length}</span>
          <span class="mini muted"><code>${esc(sec.endpoint)}</code></span></h5>
        ${sec.items.map((it) => {
          const key = keyOf(sec.id, it.id);
          return `<div class="rk-card info gu-row-link">
            <div class="rk-h">
              <label class="chk" style="display:inline-flex;align-items:center;margin:0" title="Include in the document">
                <input type="checkbox" data-pick="${esc(key)}"${selected.has(key) ? " checked" : ""}></label>
              <b data-open="${esc(key)}" style="cursor:pointer">${esc(it.name)}</b>
              ${it.platforms.length ? it.platforms.map((p) => `<span class="gu-how priv">${esc(p)}</span>`).join("") : ""}
              ${assignChips(it)}
              ${it.detailError ? `<span class="gu-how exc">settings unreadable</span>` : ""}
              <button class="btn sm" data-open="${esc(key)}" style="margin-left:auto">${it.rows.length} setting${it.rows.length === 1 ? "" : "s"} →</button>
            </div>
            ${it.description ? `<div class="rk-meta mini muted">${esc(it.description)}</div>` : ""}
          </div>`;
        }).join("")}
      </div>`;
    }).join("")
      : `<p class="mini">Nothing matches this filter.</p>`;

    const total = Docs.summarize(res).total;
    const bar = `<div class="selbar visible">
      <span><b>${selected.size}</b> of ${total} selected <span class="selhint">— this is what the exports will contain</span></span>
      <label class="sel-filter" title="Narrows what is shown below. It does NOT change the selection — the exports follow the ticks.">
        <span>Platform</span>
        <select id="dcPlatform">${platformOpts.map((o) =>
          `<option value="${esc(o.value)}"${o.value === platformFilter ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>
      </label>
      <div class="sel-actions">
        <button class="btn" data-sel="all">Select all</button>
        <button class="btn" data-sel="filtered">Select what is shown (${shown})</button>
        <button class="btn" data-sel="invert">Invert</button>
        <button class="btn" data-sel="none">Select none</button>
      </div></div>`;

    $("dcBody").innerHTML = head + bar + `<div class="list-card">${notes.join("")}${body}</div>`;
    showExports(selected.size > 0);

    const B = $("dcBody");
    B.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); openPolicy(el.dataset.open); }));
    B.querySelectorAll("[data-pick]").forEach((el) => el.addEventListener("change", () => {
      el.checked ? selected.add(el.dataset.pick) : selected.delete(el.dataset.pick);
      render();
    }));
    B.querySelectorAll("[data-secall]").forEach((el) => el.addEventListener("change", () => {
      const sec = sections.find((x) => x.id === el.dataset.secall);
      sec.items.forEach((it) => el.checked ? selected.add(keyOf(sec.id, it.id)) : selected.delete(keyOf(sec.id, it.id)));
      render();
    }));
    B.querySelectorAll("[data-sel]").forEach((el) => el.addEventListener("click", () => {
      const mode = el.dataset.sel;
      if (mode === "none") selected = new Set();
      else if (mode === "all") { selected = new Set(); selectAll(res.sections); }
      else if (mode === "filtered") { selected = new Set(); selectAll(sections); }
      else if (mode === "invert") {
        const next = new Set();
        res.sections.forEach((sec) => sec.items.forEach((it) => {
          const k = keyOf(sec.id, it.id);
          if (!selected.has(k)) next.add(k);
        }));
        selected = next;
      }
      render();
    }));
  }

  // ---------------------------------------------------------- the popout --
  // ENCA's modal, same markup and the same classes. Inline expansion was
  // wrong for this list: a settings-catalog policy has twenty-odd rows, so
  // opening one pushed everything else off the screen and closing it lost
  // your place. A popout leaves the list where it was.
  function findItem(key) {
    const [secId, itemId] = String(key).split("|");
    const sec = res && res.sections.find((x) => x.id === secId);
    const it = sec && sec.items.find((x) => x.id === itemId);
    return it ? { sec, it } : null;
  }

  function closePolicy() {
    const bg = $("dcModal");
    if (bg) bg.classList.remove("open");
    document.removeEventListener("keydown", onEsc);
  }
  function onEsc(e) { if (e.key === "Escape") closePolicy(); }

  // THE ROW SAYS WHO, NOT HOW MANY (10492). It had shown "2 assignments" —
  // a number, on a screen whose entire job is writing down what a tenant is
  // configured to do, while collect() had already resolved every group name
  // and every filter name onto the object. Two chips at most, then a +N, so
  // a policy assigned to eleven groups does not eat the row; the popout has
  // the full list and the tooltip carries it meanwhile.
  const MAX_CHIPS = 2;
  function assignChips(it) {
    const a = it.assignments || [];
    if (!a.length) return `<span class="gu-how exc">unassigned</span>`;
    const all = a.map((x) => Docs.assignmentText(x));
    const chips = a.slice(0, MAX_CHIPS).map((x, i) => {
      const cls = x.kind === "Excluded" ? "exc" : "inc";
      return `<span class="gu-how ${cls}" title="${esc(all[i])}">${esc(Docs.assignmentText(x))}</span>`;
    });
    if (a.length > MAX_CHIPS) chips.push(`<span class="gu-how" title="${esc(all.slice(MAX_CHIPS).join("; "))}">+${a.length - MAX_CHIPS}</span>`);
    return chips.join(" ");
  }

  function openPolicy(key) {
    const found = findItem(key);
    if (!found) return;
    const { sec, it } = found;
    const picked = selected.has(key);
    $("dcModalBody").innerHTML = `
      ${Docs.popoutHtml(sec, it)}
      <div class="gu-m-foot">
        <label class="chk" style="display:inline-flex;gap:8px;align-items:center;cursor:pointer">
          <input type="checkbox" id="dcModalPick"${picked ? " checked" : ""}> Include in the document</label>
        <div class="spacer"></div>
        <button class="btn" id="dcModalCopy">⧉ Copy as Markdown</button>
        <button class="btn primary" id="dcModalClose">Close</button>
      </div>`;
    $("dcModal").classList.add("open");
    $("dcModalClose").addEventListener("click", closePolicy);
    // Clicking the backdrop closes it; clicking INSIDE must not. Without the
    // target check, every click on the settings table would dismiss the thing
    // you were reading.
    $("dcModal").onclick = (e) => { if (e.target === $("dcModal")) closePolicy(); };
    $("dcModalPick").addEventListener("change", (e) => {
      e.target.checked ? selected.add(key) : selected.delete(key);
      render();
    });
    $("dcModalCopy").addEventListener("click", () => {
      const md = Docs.markdown([{ ...sec, items: [it] }], res,
        Docs.meta(res, { tenant: tenantName(), sections: [{ ...sec, items: [it] }], query: query(), single: true }));
      try { navigator.clipboard.writeText(md); $("dcModalCopy").textContent = "✓ Copied"; }
      catch { $("dcModalCopy").textContent = "Could not copy"; }
      setTimeout(() => { const b = $("dcModalCopy"); if (b) b.textContent = "⧉ Copy as Markdown"; }, 1800);
    });
    document.addEventListener("keydown", onEsc);
  }

  function download(name, data, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: type || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  const tenantName = () => { const n = $("tenantName"); return (n && n.textContent) || ""; };
  // The export set is the SELECTION, not the filter. meta() is told which so
  // the header can say "selected" rather than "filtered" — two different
  // reasons for a document to be short, and a reader deserves to know which.
  const m = () => Docs.meta(res, { tenant: tenantName(), sections: selectedSections(), query: query(), bySelection: true });
  const fileBase = () => `Intune-configuration-${(tenantName() || "tenant").replace(/[^\w.-]+/g, "-")}-${new Date().toISOString().slice(0, 10)}`;

  // EXPORTS FOLLOW THE FILTER. If you narrowed to Windows compliance policies
  // and pressed export, a document of everything would not be what you asked
  // for — and the header says how many of how many it holds, so a filtered
  // document can never be mistaken for a complete one.
  function init() {
    if (!$("dcRun")) return;
    renderSections();
    setFiltersEnabled(false);
    $("dcRun").addEventListener("click", run);
    $("dcReset").addEventListener("click", () => {
      res = null; selected = new Set(); closePolicy(); $("dcBody").innerHTML = ""; prog(""); showExports(false);
      $("dcSearch").value = ""; $("dcState").value = "all";
      platformFilter = "All"; platformOpts = [];
      setFiltersEnabled(false);
      document.querySelectorAll("#dcSections input[type=checkbox]").forEach((c) => { c.checked = true; c.closest(".gu-area").classList.add("on"); });
    });
    $("dcSearch").addEventListener("input", () => { if (res) render(); });
    $("dcState").addEventListener("change", () => { if (res) render(); });
    // Delegated: #dcPlatform is inside the bar and is replaced on every render.
    $("dcBody").addEventListener("change", (e) => {
      const sel = e.target.closest && e.target.closest("#dcPlatform");
      if (!sel) return;
      platformFilter = sel.value;
      render();
    });
    $("dcMd").addEventListener("click", () => download(fileBase() + ".md", Docs.markdown(selectedSections(), res, m()), "text/markdown"));
    $("dcHtml").addEventListener("click", () => download(fileBase() + ".html", Docs.html(selectedSections(), res, m()), "text/html"));
    $("dcDocx").addEventListener("click", async () => {
      try {
        prog("Writing the Word document…");
        const blob = await Docs.docx(selectedSections(), res, m())
          .generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        download(fileBase() + ".docx", blob);
        prog("");
      } catch (e) { fail(e); }
    });
  }

  return { init, run, render, renderSections, chosen, current, query, openPolicy, closePolicy, selectedSections, setFiltersEnabled, getSelected: () => selected };
})();

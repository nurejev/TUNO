// ======================================================================
// T28 — MDE rollout · 👥 WAVE MEMBERS (build 10634, Mihai's layout A)
//
// Fills the wave groups. Per region:
//
//   INT-SG-U-WAVE-<region>  ⟵ nested ⟵  the country USER groups
//                                         (PVM-UG-CORP-MEM-USERS-<xx>, dynamic)
//   INT-SG-D-WAVE-<region>  ⟵ nested ⟵  INT-SG-D-<ISO3>, one ASSIGNED device
//                                         group per country, holding the Windows
//                                         devices whose INTUNE PRIMARY USER is in
//                                         that country's user group
//
// Why primary user and not a device attribute: Mihai's 29-09 run of
// Compare-UserDeviceCountryGroups.ps1 found 2,561 devices missing from the
// extensionAttribute-based PVM-DG-CORP-AAD-W10-MEM-* groups and 2,933 in
// the wrong one. The primary user is what decides; the same join the
// script makes with -DeviceSource Intune (managedDevices.userId →
// azureADDeviceId → the Entra device object, which is what a group holds).
//
// An assigned group goes stale, so the device groups are SYNCED, not
// filled once: every read computes, per country, the devices to add and
// the members whose primary user is no longer in the country (to remove —
// written only when ticked).
//
// Microsoft Learn (Intune, "Performance recommendations for grouping,
// targeting, and filtering"): "Don't make large group nesting changes all
// at once." Hence per wave, per country, and a warning above 500 members.
//
// Writes (Group.ReadWrite.All, T22's scope, at the Apply click): create
// an INT-SG-D group (createWave's payload — the admin is the owner), add
// devices (PATCH members@odata.bind, 20 per request — Graph's limit), remove
// devices, nest / unnest a group. Every write is read back. Nothing else.
// ======================================================================
const MdeMembers = (() => {
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const uniq = (a) => [...new Set(a)];

  // ISO 3166-1 alpha-2 → alpha-3, the full list (pycountry, 249 entries).
  const ISO = "ADAND AEARE AFAFG AGATG AIAIA ALALB AMARM AOAGO AQATA ARARG ASASM ATAUT AUAUS AWABW AXALA AZAZE BABIH BBBRB BDBGD BEBEL BFBFA BGBGR BHBHR BIBDI BJBEN BLBLM BMBMU BNBRN BOBOL BQBES BRBRA BSBHS BTBTN BVBVT BWBWA BYBLR BZBLZ CACAN CCCCK CDCOD CFCAF CGCOG CHCHE CICIV CKCOK CLCHL CMCMR CNCHN COCOL CRCRI CUCUB CVCPV CWCUW CXCXR CYCYP CZCZE DEDEU DJDJI DKDNK DMDMA DODOM DZDZA ECECU EEEST EGEGY EHESH ERERI ESESP ETETH FIFIN FJFJI FKFLK FMFSM FOFRO FRFRA GAGAB GBGBR GDGRD GEGEO GFGUF GGGGY GHGHA GIGIB GLGRL GMGMB GNGIN GPGLP GQGNQ GRGRC GSSGS GTGTM GUGUM GWGNB GYGUY HKHKG HMHMD HNHND HRHRV HTHTI HUHUN IDIDN IEIRL ILISR IMIMN ININD IOIOT IQIRQ IRIRN ISISL ITITA JEJEY JMJAM JOJOR JPJPN KEKEN KGKGZ KHKHM KIKIR KMCOM KNKNA KPPRK KRKOR KWKWT KYCYM KZKAZ LALAO LBLBN LCLCA LILIE LKLKA LRLBR LSLSO LTLTU LULUX LVLVA LYLBY MAMAR MCMCO MDMDA MEMNE MFMAF MGMDG MHMHL MKMKD MLMLI MMMMR MNMNG MOMAC MPMNP MQMTQ MRMRT MSMSR MTMLT MUMUS MVMDV MWMWI MXMEX MYMYS MZMOZ NANAM NCNCL NENER NFNFK NGNGA NINIC NLNLD NONOR NPNPL NRNRU NUNIU NZNZL OMOMN PAPAN PEPER PFPYF PGPNG PHPHL PKPAK PLPOL PMSPM PNPCN PRPRI PSPSE PTPRT PWPLW PYPRY QAQAT REREU ROROU RSSRB RURUS RWRWA SASAU SBSLB SCSYC SDSDN SESWE SGSGP SHSHN SISVN SJSJM SKSVK SLSLE SMSMR SNSEN SOSOM SRSUR SSSSD STSTP SVSLV SXSXM SYSYR SZSWZ TCTCA TDTCD TFATF TGTGO THTHA TJTJK TKTKL TLTLS TMTKM TNTUN TOTON TRTUR TTTTO TVTUV TWTWN TZTZA UAUKR UGUGA UMUMI USUSA UYURY UZUZB VAVAT VCVCT VEVEN VGVGB VIVIR VNVNM VUVUT WFWLF WSWSM YEYEM YTMYT ZAZAF ZMZMB ZWZWE";
  const ISO3 = new Map(ISO.split(" ").map((x) => [x.slice(0, 2), x.slice(2)]));

  // ------------------------------------------------------------ config --
  // The country → region table from Mihai's sheet (29-09). Group names are
  // <countryPrefix><suffix>; the suffix is ISO2 except the two Polish city
  // groups and UAE, which the overrides name.
  const DEFAULTS = Object.freeze({
    countryPrefix: "PVM-UG-CORP-MEM-USERS-",
    deviceGroupPrefix: "INT-SG-D-",
    countryMap: [
      // NL-Breda leads the Euro wave as the first PILOT (Mihai, 10635)
      { region: "Euro", suffixes: ["NL-Breda", "GB", "BE", "NL", "LU", "CZ", "SK", "POL-Warszawa", "POL-SKARB", "DK", "FR", "CH", "ES", "PT", "GR", "DE"] },
      { region: "Americas", suffixes: ["US", "MX", "CA"] },
      { region: "Asia-Pacific", suffixes: ["CN", "ID", "VN", "PH", "JP", "MY", "TH", "KR", "AU", "SG", "HK"] },
      { region: "Italy", suffixes: ["IT"] },
      // SK, KZ and LAGOS added at 10635 (Mihai: "should be added") — SK with
      // Czechia in Euro, KZ with Russia and LAGOS with Nigeria in BAMSCA
      { region: "BAMSCA", suffixes: ["IN", "BR", "BD", "LK", "NG", "LAGOS", "NP", "UAE", "ZA", "RU", "KZ", "TR"] },
    ],
    deviceSuffixes: { "NL-Breda": "NLD-BREDA", "POL-Warszawa": "POL-WAW", "POL-SKARB": "POL-SKARB", "UAE": "ARE", "LAGOS": "NGA-LAGOS" },
    // A PILOT group goes into its wave before the rest of the region. It may
    // overlap a country group (NL-Breda ⊂ NL): its devices then sit in both
    // device groups, which is expected, not a problem.
    pilots: ["NL-Breda"],
    deviceGroupDescription: "Windows devices whose Intune primary user is in {userGroup}. Kept in sync by TUNO (T28 MDE rollout · wave members).",
    staleDays: 30,
    largeNest: 500,
  });

  const cleanStr = (v, d) => { const t = String(v == null ? "" : v).trim(); return t || d; };
  function normMap(list) {
    const out = [];
    for (const r of Array.isArray(list) ? list : []) {
      const region = String((r && r.region) || "").trim();
      if (!region) continue;
      const suffixes = uniq((r.suffixes || []).map((s) => String(s || "").trim()).filter(Boolean));
      const at = out.find((x) => lc(x.region) === lc(region));
      if (at) at.suffixes = uniq(at.suffixes.concat(suffixes)); else out.push({ region, suffixes });
    }
    return out;
  }
  function normOverrides(o) {
    const out = {};
    for (const [k, v] of Object.entries(o || {})) { const kk = String(k).trim(), vv = String(v || "").trim().toUpperCase(); if (kk && vv) out[kk] = vv; }
    return out;
  }
  function normConfig(c) {
    const o = c || {};
    return {
      countryPrefix: cleanStr(o.countryPrefix, DEFAULTS.countryPrefix),
      deviceGroupPrefix: cleanStr(o.deviceGroupPrefix, DEFAULTS.deviceGroupPrefix),
      countryMap: Array.isArray(o.countryMap) ? normMap(o.countryMap) : normMap(DEFAULTS.countryMap),
      deviceSuffixes: o.deviceSuffixes && typeof o.deviceSuffixes === "object" ? normOverrides(o.deviceSuffixes) : normOverrides(DEFAULTS.deviceSuffixes),
      deviceGroupDescription: cleanStr(o.deviceGroupDescription, DEFAULTS.deviceGroupDescription),
      pilots: uniq((Array.isArray(o.pilots) ? o.pilots : DEFAULTS.pilots).map((x) => String(x || "").trim()).filter(Boolean)),
      staleDays: Number.isFinite(+o.staleDays) && +o.staleDays > 0 ? +o.staleDays : DEFAULTS.staleDays,
      largeNest: DEFAULTS.largeNest,
    };
  }
  // The ⚙️ pane edits both tables as text: "Euro: *NL-Breda, GB, BE, NL"
  // (a star marks a pilot) and "POL-Warszawa = POL-WAW", one per line.
  function parseMap(text) {
    return normMap(String(text || "").split(/\r?\n/).map((l) => {
      const i = l.indexOf(":");
      if (i < 1) return null;
      return { region: l.slice(0, i).trim(), suffixes: l.slice(i + 1).split(/[,;\s]+/).map((x) => x.replace(/^\*+/, "")).filter(Boolean) };
    }).filter(Boolean));
  }
  const parsePilots = (text) => uniq((String(text || "").match(/\*[^,;\s]+/g) || []).map((x) => x.replace(/^\*+/, "")));
  const formatMap = (map, pilots) => (map || []).map((r) => `${r.region}: ${r.suffixes.map((x) => ((pilots || []).some((p) => lc(p) === lc(x)) ? "*" : "") + x).join(", ")}`).join("\n");
  // A suffix that is not ISO2 gets a device-group suffix when it is added
  // from the pane: the ISO3 of its leading code, then the rest upper-cased
  // ("NL-Breda" -> "NLD-BREDA"; no leading code -> the suffix upper-cased).
  function suggestDeviceSuffix(suffix) {
    const s = String(suffix || "").trim();
    if (/^[A-Za-z]{2}$/.test(s) && ISO3.has(s.toUpperCase())) return ISO3.get(s.toUpperCase());
    const m = /^([A-Za-z]{2})-(.+)$/.exec(s);
    if (m && ISO3.has(m[1].toUpperCase())) return `${ISO3.get(m[1].toUpperCase())}-${m[2].toUpperCase()}`;
    return s.toUpperCase();
  }
  // Put a group from "Not in any wave" into a region, as a pilot: first in
  // the region, starred, with a device-group suffix. Returns a new config.
  function addPilot(cfg, suffix, region) {
    const c = JSON.parse(JSON.stringify(cfg));
    c.countryMap = c.countryMap.map((r) => Object.assign({}, r, { suffixes: r.suffixes.filter((x) => lc(x) !== lc(suffix)) }));
    let r = c.countryMap.find((x) => lc(x.region) === lc(region));
    if (!r) { r = { region, suffixes: [] }; c.countryMap.push(r); }
    r.suffixes.unshift(suffix);
    if (!/^[A-Za-z]{2}$/.test(suffix) && !Object.keys(c.deviceSuffixes).some((k) => lc(k) === lc(suffix))) c.deviceSuffixes[suffix] = suggestDeviceSuffix(suffix);
    if (!c.pilots.some((p) => lc(p) === lc(suffix))) c.pilots.push(suffix);
    return normConfig(c);
  }
  function parseOverrides(text) {
    const out = {};
    for (const l of String(text || "").split(/\r?\n/)) { const m = /^\s*([^=]+?)\s*=\s*(\S+)\s*$/.exec(l); if (m) out[m[1]] = m[2]; }
    return normOverrides(out);
  }
  const formatOverrides = (o) => Object.entries(o || {}).map(([k, v]) => `${k} = ${v}`).join("\n");

  // ------------------------------------------------------------ naming --
  function iso3Of(suffix, overrides) {
    const s = String(suffix || "").trim();
    const hit = Object.keys(overrides || {}).find((k) => lc(k) === lc(s));
    if (hit) return { code: overrides[hit], source: "override (⚙️)" };
    if (/^[A-Za-z]{2}$/.test(s) && ISO3.has(s.toUpperCase())) return { code: ISO3.get(s.toUpperCase()), source: "ISO 3166" };
    return { code: null, source: `"${s}" is not a two-letter country code — give it a device-group suffix under ⚙️` };
  }
  let DN = null;
  function countryName(suffix) {
    const s = String(suffix || "");
    if (/^[A-Za-z]{2}$/.test(s)) {
      try { if (!DN && typeof Intl !== "undefined" && Intl.DisplayNames) DN = new Intl.DisplayNames(["en"], { type: "region" }); } catch { DN = null; }
      try { const n = DN && DN.of(s.toUpperCase()); if (n && n !== s.toUpperCase()) return n; } catch { /* unknown code */ }
    }
    if (/^UAE$/i.test(s)) return "United Arab Emirates";
    return s.replace(/-/g, " ");
  }
  // The rows the map names, in the map's order. A suffix listed under two
  // regions is kept in the first and said.
  function countryRows(cfg) {
    const out = [], seen = new Map();
    for (const r of cfg.countryMap) {
      for (const suffix of r.suffixes) {
        if (seen.has(lc(suffix))) { seen.get(lc(suffix)).notes.push(`also listed under ${r.region} — kept in ${seen.get(lc(suffix)).region}`); continue; }
        const iso = iso3Of(suffix, cfg.deviceSuffixes);
        const row = {
          key: lc(suffix), region: r.region, suffix, country: countryName(suffix),
          pilot: (cfg.pilots || []).some((p) => lc(p) === lc(suffix)),
          userGroupName: `${cfg.countryPrefix}${suffix}`,
          deviceGroupName: iso.code ? `${cfg.deviceGroupPrefix}${iso.code}` : null,
          iso3: iso.code, iso3Source: iso.source, notes: [],
        };
        seen.set(lc(suffix), row);
        out.push(row);
      }
    }
    // pilots lead their region (a stable sort keeps the table's order otherwise)
    out.sort((a, b) => (a.region === b.region ? (b.pilot - a.pilot) : 0));
    // two suffixes landing on one device group (both Polish groups on POL
    // before the overrides existed) — said, not merged silently
    const byDg = new Map();
    for (const row of out) if (row.deviceGroupName) { const k = lc(row.deviceGroupName); byDg.set(k, (byDg.get(k) || []).concat(row)); }
    for (const list of byDg.values()) if (list.length > 1) list.forEach((row) => row.notes.push(`${row.deviceGroupName} is also the device group of ${list.filter((x) => x !== row).map((x) => x.userGroupName).join(", ")} — give one a different suffix under ⚙️`));
    return out;
  }

  // ------------------------------------------------------------- reads --
  const EV = { ConsistencyLevel: "eventual" };
  const odq = (s) => String(s).replace(/'/g, "''");
  const enc = encodeURIComponent;
  // skip: lc names of the rollout's own groups (waves, exclusion groups,
  // their earlier names) — they share the INT-SG-D- prefix, and are not
  // country device groups
  async function readInput(cfg, waveGroups, onStatus, skip) {
    const say = (m) => { if (onStatus) onStatus(m); };
    const GS = Graph.SCOPES.groups, DS = Graph.SCOPES.devices, DO = Graph.SCOPES.deviceObjects;
    say("Reading the country groups…");
    const countryGroups = await Graph.readAll(`/groups?$filter=${enc(`startswith(displayName,'${odq(cfg.countryPrefix)}')`)}&$select=id,displayName,groupTypes,membershipRule&$top=999`, { scopes: GS, retry: true });
    say("Reading the device groups…");
    let dgList = await Graph.readAll(`/groups?$filter=${enc(`startswith(displayName,'${odq(cfg.deviceGroupPrefix)}')`)}&$select=id,displayName,groupTypes,membershipRule&$top=999`, { scopes: GS, retry: true });
    // the device waves share the prefix (INT-SG-D-WAVE-…, 10635) — they are
    // not country device groups, so their members are not read here
    const waveIds = new Set((waveGroups || []).filter((g) => g && g.id).map((g) => lc(g.id)));
    const dgAll = dgList;
    dgList = dgAll.filter((g) => !waveIds.has(lc(g.id)) && !/-WAVE-/i.test(g.displayName || "") && !(skip && skip.has(lc(g.displayName))));
    say("Reading the Windows devices in Intune…");
    const managed = await Graph.readAll(`/deviceManagement/managedDevices?$filter=${enc("operatingSystem eq 'Windows'")}&$select=id,deviceName,userId,userPrincipalName,azureADDeviceId,lastSyncDateTime`, { scopes: DS, retry: true });
    say("Reading the Windows devices in Entra…");
    const entra = await Graph.readAll(`/devices?$filter=${enc("operatingSystem eq 'Windows'")}&$count=true&$select=id,deviceId,displayName,accountEnabled&$top=999`, { scopes: DO, headers: EV, retry: true });
    const rows = countryRows(cfg);
    const wanted = new Set(rows.map((r) => lc(r.userGroupName)));
    const mapped = countryGroups.filter((g) => wanted.has(lc(g.displayName)));
    const usersByGroup = new Map(), failed = [];
    let i = 0;
    const ur = await Graph.pool(mapped, async (g) => {
      say(`Reading the users of the country groups — ${++i}/${mapped.length}…`);
      return Graph.readAll(`/groups/${enc(g.id)}/transitiveMembers/microsoft.graph.user?$select=id,userPrincipalName&$count=true&$top=999`, { scopes: GS, headers: EV, retry: true });
    }, 4);
    ur.forEach((r, n) => { if (r.error) failed.push(`${mapped[n].displayName}: ${(r.error && r.error.message) || r.error}`); else usersByGroup.set(lc(mapped[n].id), r.value || []); });
    const deviceMembers = new Map();
    i = 0;
    const dr = await Graph.pool(dgList, async (g) => {
      say(`Reading the device groups' members — ${++i}/${dgList.length}…`);
      return Graph.readAll(`/groups/${enc(g.id)}/members/microsoft.graph.device?$select=id,deviceId,displayName&$top=999`, { scopes: GS, retry: true });
    }, 4);
    dr.forEach((r, n) => { if (r.error) failed.push(`${dgList[n].displayName}: ${(r.error && r.error.message) || r.error}`); else deviceMembers.set(lc(dgList[n].id), new Set((r.value || []).map((d) => lc(d.id)))); });
    const waveChildren = new Map();
    const waves = (waveGroups || []).filter((g) => g && g.id);
    const wr = await Graph.pool(waves, async (g) => Graph.readAll(`/groups/${enc(g.id)}/members/microsoft.graph.group?$select=id,displayName&$top=999`, { scopes: GS, retry: true }), 4);
    wr.forEach((r, n) => { if (r.error) failed.push(`${waves[n].displayName}: ${(r.error && r.error.message) || r.error}`); else waveChildren.set(lc(waves[n].id), new Set((r.value || []).map((x) => lc(x.id)))); });
    say("");
    return { countryGroups, deviceGroups: dgList, managed, entra, usersByGroup, deviceMembers, waveChildren, failed, readAt: Date.now() };
  }

  // ------------------------------------------------------------ compute --
  // waves: Map lc(region) -> { user: group|null, device: group|null, userName, deviceName }
  function compute(cfg, input, waves, now) {
    const t = now || Date.now();
    const staleMs = cfg.staleDays * 86400000;
    const entraByDeviceId = new Map(), entraById = new Map();
    for (const e of input.entra || []) { if (e.deviceId) entraByDeviceId.set(lc(e.deviceId), e); entraById.set(lc(e.id), e); }
    const byUser = new Map();
    let noPrimary = 0;
    for (const m of input.managed || []) {
      if (!m.userId) { noPrimary++; continue; }
      const k = lc(m.userId);
      if (!byUser.has(k)) byUser.set(k, []);
      byUser.get(k).push(m);
    }
    const groupsByName = new Map((input.countryGroups || []).map((g) => [lc(g.displayName), g]));
    const dgByName = new Map((input.deviceGroups || []).map((g) => [lc(g.displayName), g]));
    const rows = countryRows(cfg).map((r) => {
      const ug = groupsByName.get(lc(r.userGroupName)) || null;
      const users = ug ? input.usersByGroup.get(lc(ug.id)) : null;
      const devices = [], seen = new Set();
      let usersNoDevice = 0;
      for (const u of users || []) {
        const list = byUser.get(lc(u.id)) || [];
        if (!list.length) { usersNoDevice++; continue; }
        for (const m of list) {
          if (seen.has(lc(m.id))) continue;
          seen.add(lc(m.id));
          const e = m.azureADDeviceId ? entraByDeviceId.get(lc(m.azureADDeviceId)) : null;
          const last = Date.parse(m.lastSyncDateTime || "");
          devices.push({ managedId: m.id, name: m.deviceName || (e && e.displayName) || m.id, upn: m.userPrincipalName || u.userPrincipalName || "",
            lastSync: m.lastSyncDateTime || null, stale: Number.isFinite(last) && t - last > staleMs,
            objId: e ? lc(e.id) : null, problem: e ? null : (m.azureADDeviceId ? "no Entra object for this device" : "not joined to Entra (no device id)"), others: [] });
        }
      }
      const dg = r.deviceGroupName ? dgByName.get(lc(r.deviceGroupName)) || null : null;
      const w = waves ? waves.get(lc(r.region)) : null;
      return Object.assign({}, r, {
        ug, usersRead: users != null, users: users ? users.length : 0, usersNoDevice, devices, dg,
        wave: w || { user: null, device: null, userName: "", deviceName: "" },
      });
    });
    // a device in two countries' sets — its primary user is in both groups
    const where = new Map();
    for (const row of rows) for (const d of row.devices) if (d.objId) where.set(d.objId, (where.get(d.objId) || []).concat(row));
    for (const row of rows) {
      for (const d of row.devices) if (d.objId && where.get(d.objId).length > 1) {
        const others = where.get(d.objId).filter((x) => x !== row);
        d.others = others.map((x) => x.userGroupName);
        // a pilot overlapping its country is expected, not a problem
        d.pilotOverlap = row.pilot || others.every((x) => x.pilot);
      }
      row.want = new Set(row.devices.filter((d) => d.objId).map((d) => d.objId));
      row.have = row.dg ? (input.deviceMembers.get(lc(row.dg.id)) || new Set()) : new Set();
      row.add = [...row.want].filter((id) => !row.have.has(id));
      row.remove = [...row.have].filter((id) => !row.want.has(id));
      row.removeNames = row.remove.map((id) => { const e = entraById.get(id); return e ? e.displayName : id; });
      const kids = (g) => (g && input.waveChildren.get(lc(g.id))) || null;
      row.ugNested = row.ug && row.wave.user ? !!(kids(row.wave.user) && kids(row.wave.user).has(lc(row.ug.id))) : null;
      row.dgNested = row.dg && row.wave.device ? !!(kids(row.wave.device) && kids(row.wave.device).has(lc(row.dg.id))) : null;
      row.problems = {
        noEntra: row.devices.filter((d) => !d.objId).length,
        stale: row.devices.filter((d) => d.stale).length,
        multi: row.devices.filter((d) => d.others.length && !d.pilotOverlap).length,
        pilot: row.devices.filter((d) => d.others.length && d.pilotOverlap).length,
      };
      row.inSync = !!row.dg && !row.add.length && !row.remove.length;
    }
    // prefix groups the map does not name — listed, never nested; a group
    // whose name extends a mapped one (NL-Breda ⊂ NL) is an overlap
    const mappedNames = new Set(rows.map((r) => lc(r.userGroupName)));
    const unmapped = (input.countryGroups || []).filter((g) => !mappedNames.has(lc(g.displayName))).map((g) => {
      const parent = rows.find((r) => lc(g.displayName).startsWith(lc(r.userGroupName) + "-"));
      return { group: g, dynamic: (g.groupTypes || []).includes("DynamicMembership"), overlaps: parent ? parent.userGroupName : "" };
    }).sort((a, b) => a.group.displayName.localeCompare(b.group.displayName));
    const regions = uniq(rows.map((r) => r.region)).map((region) => {
      const rs = rows.filter((r) => r.region === region);
      const w = rs[0].wave;
      return {
        region, rows: rs, wave: w,
        found: rs.filter((r) => r.ug).length,
        ugNested: rs.filter((r) => r.ugNested).length, dgNested: rs.filter((r) => r.dgNested).length,
        users: rs.filter((r) => r.ugNested).reduce((a, r) => a + r.users, 0),
        devices: rs.filter((r) => r.dgNested).reduce((a, r) => a + r.have.size, 0),
      };
    });
    return { rows, regions, unmapped, noPrimary, managedCount: (input.managed || []).length, failed: input.failed || [], readAt: input.readAt || 0 };
  }

  // --------------------------------------------------------------- plan --
  // opts: { fill, nestUsers, nestDevices, removals, description }
  // ops, in the order they run: per country create → add → remove → nest.
  function planOps(model, keys, opts, cfg) {
    const o = opts || {};
    const ops = [], skipped = [], warnings = [];
    const pick = model.rows.filter((r) => keys.has(r.key));
    for (const r of pick) {
      const tag = `${r.country} (${r.userGroupName})`;
      if (!r.ug) { skipped.push(`${tag}: the user group is not in this tenant`); continue; }
      let dgRef = r.dg ? { id: lc(r.dg.id), name: r.dg.displayName } : null;
      if (o.fill) {
        if (!r.deviceGroupName) skipped.push(`${tag}: ${r.iso3Source}`);
        else if (!r.dg && !r.want.size) skipped.push(`${tag}: no Windows device with a primary user in this group — ${r.deviceGroupName} not created`);
        else {
          if (!r.dg) {
            ops.push({ type: "create", key: r.key, name: r.deviceGroupName, description: String((cfg && cfg.deviceGroupDescription) || DEFAULTS.deviceGroupDescription).replace("{userGroup}", r.userGroupName) });
            dgRef = { ref: r.deviceGroupName, name: r.deviceGroupName };
          }
          if (r.add.length) ops.push({ type: "add", key: r.key, group: dgRef, ids: r.add.slice(), label: `${r.add.length} device${r.add.length === 1 ? "" : "s"}` });
        }
      }
      if (o.removals && r.dg && r.remove.length) ops.push({ type: "remove", key: r.key, group: { id: lc(r.dg.id), name: r.dg.displayName }, ids: r.remove.slice(), label: `${r.remove.length} device${r.remove.length === 1 ? "" : "s"}: ${r.removeNames.slice(0, 5).join(", ")}${r.remove.length > 5 ? " …" : ""}` });
      if (o.nestUsers && !r.ugNested) {
        if (!r.wave.user) skipped.push(`${tag}: ${r.wave.userName || "the user wave"} does not exist — create it in 🌊 first`);
        else {
          ops.push({ type: "nest", key: r.key, parent: { id: lc(r.wave.user.id), name: r.wave.user.displayName }, child: { id: lc(r.ug.id), name: r.ug.displayName }, kind: "user", size: r.users });
          if (r.users > cfg.largeNest) warnings.push(`${r.ug.displayName} brings ${r.users} users into ${r.wave.user.displayName} at once`);
        }
      }
      if (o.nestDevices && !r.dgNested) {
        if (!r.wave.device) skipped.push(`${tag}: ${r.wave.deviceName || "the device wave"} does not exist — create it in 🌊 first`);
        else if (!dgRef) skipped.push(`${tag}: no device group to nest yet — tick "create & fill"`);
        else {
          const size = r.want.size;
          ops.push({ type: "nest", key: r.key, parent: { id: lc(r.wave.device.id), name: r.wave.device.displayName }, child: dgRef, kind: "device", size });
          if (size > cfg.largeNest) warnings.push(`${dgRef.name} brings ${size} devices into ${r.wave.device.displayName} at once`);
        }
      }
    }
    return { ops, skipped, warnings, hasRemoval: ops.some((x) => x.type === "remove" || x.type === "unnest") };
  }
  // The inverse of what a run DID (not of what it planned), for undo.
  function inverseOf(done) {
    const out = [];
    for (const d of (done || []).slice().reverse()) {
      if (d.type === "add" && d.ids.length) out.push({ type: "remove", key: d.key, group: d.group, ids: d.ids.slice(), label: `${d.ids.length} device${d.ids.length === 1 ? "" : "s"} this run added` });
      else if (d.type === "remove" && d.ids.length) out.push({ type: "add", key: d.key, group: d.group, ids: d.ids.slice(), label: `${d.ids.length} device${d.ids.length === 1 ? "" : "s"} this run removed` });
      else if (d.type === "nest") out.push({ type: "unnest", key: d.key, parent: d.parent, child: d.child, kind: d.kind });
      else if (d.type === "unnest") out.push({ type: "nest", key: d.key, parent: d.parent, child: d.child, kind: d.kind });
    }
    return { ops: out, skipped: [], warnings: done && done.some((d) => d.type === "create") ? ["groups this run created are left in place (empty after the undo) — delete them in Entra if they are not wanted"] : [], hasRemoval: out.some((x) => x.type === "remove" || x.type === "unnest") };
  }

  // ------------------------------------------------------------- writes --
  const ref = (id) => `https://graph.microsoft.com/v1.0/directoryObjects/${id}`;
  const W = () => GroupMigrate.SCOPES.groupWrite;
  const msg = (e) => String((e && e.message) || e || "");
  const already = (e) => /already exist/i.test(msg(e));
  const notYet = (e) => /do(es)? ?n[o']t exist|not exist|Request_ResourceNotFound|replica/i.test(msg(e));
  let wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Twenty per PATCH — Graph's limit. A new group can refuse references for
  // a few seconds while it replicates (Learn: "Add members", note), so a
  // "does not exist" is retried with a growing pause. A chunk refused
  // because one member is already in goes one by one, the ones already in
  // counted as done.
  async function addMembers(gid, ids, onProgress) {
    const done = [], failed = [];
    for (let i = 0; i < ids.length; i += 20) {
      const part = ids.slice(i, i + 20);
      let ok = false, err = null;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        try { await Graph.patch(`/groups/${enc(gid)}`, { "members@odata.bind": part.map(ref) }, { scopes: W() }); ok = true; }
        catch (e) { err = e; if (notYet(e) && attempt < 3) await wait(2000 * 2 ** attempt); else break; }
      }
      if (ok) done.push(...part);
      else {
        for (const id of part) {
          try { await Graph.post(`/groups/${enc(gid)}/members/$ref`, { "@odata.id": ref(id) }, { scopes: W() }); done.push(id); }
          catch (e) { if (already(e)) done.push(id); else failed.push({ id, why: msg(e).slice(0, 200) || msg(err).slice(0, 200) }); }
        }
      }
      if (onProgress) onProgress(Math.min(i + 20, ids.length), ids.length);
    }
    return { done, failed };
  }
  async function removeMembers(gid, ids, onProgress) {
    const done = [], failed = [];
    let n = 0;
    for (const id of ids) {
      try { await Graph.del(`/groups/${enc(gid)}/members/${enc(id)}/$ref`, { scopes: W() }); done.push(id); }
      catch (e) { if (e && (e.kind === "notfound" || e.status === 404)) done.push(id); else failed.push({ id, why: msg(e).slice(0, 200) }); }
      if (onProgress) onProgress(++n, ids.length);
    }
    return { done, failed };
  }
  const readDeviceIds = async (gid) => new Set((await Graph.readAll(`/groups/${enc(gid)}/members/microsoft.graph.device?$select=id&$top=999`, { scopes: Graph.SCOPES.groups, retry: true }) || []).map((d) => lc(d.id)));
  const readGroupIds = async (gid) => new Set((await Graph.readAll(`/groups/${enc(gid)}/members/microsoft.graph.group?$select=id&$top=999`, { scopes: Graph.SCOPES.groups, retry: true }) || []).map((d) => lc(d.id)));

  // Runs the ops in order. ledger: RunLedger (one row per op). Returns
  // { results: [{ op, ok, verified, note, done: {…the op as done} }], done: [ops as done], created: Map }
  async function applyOps(ops, opt) {
    const o = opt || {};
    const L = o.ledger || null;
    const created = new Map();   // lc(name) -> id
    const failedCreates = new Set();
    const results = [], doneOps = [];
    const idOf = (g) => (g && g.id) ? g.id : (g && g.ref && created.get(lc(g.ref))) || null;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (L && L.stopped) { L.skip(i, "stopped"); results.push({ op, ok: false, skipped: true, note: "stopped" }); continue; }
      if (L) L.start(i);
      const fail = (why, label) => { if (L) L.fail(i, why, label); results.push({ op, ok: false, note: why }); };
      try {
        if (op.type === "create") {
          let r;
          try { r = await MdeRollout.createWave(op.name, op.description, o.me || null); }
          catch (e) { failedCreates.add(lc(op.name)); fail(msg(e).slice(0, 240)); continue; }
          if (r.skipped && r.group) { created.set(lc(op.name), lc(r.group.id)); if (L) L.done(i, r.why, "exists — used as is"); results.push({ op, ok: true, verified: true, note: r.why }); continue; }
          if (!r.group || !r.group.id) { failedCreates.add(lc(op.name)); fail("the create returned no group"); continue; }
          created.set(lc(op.name), lc(r.group.id));
          doneOps.push({ type: "create", key: op.key, name: op.name, id: lc(r.group.id) });
          const ownerBad = o.me && !r.ownerVerified;
          if (!r.verified || ownerBad) { fail(`${r.verified ? "" : (r.verifyError || "not verified") + "; "}${ownerBad ? "you are not its owner — " + (r.ownerNote || "add yourself in Entra") : ""}`, r.verified ? "created · owner NOT set" : "created · NOT verified"); continue; }
          if (L) L.done(i, r.ownerNote || "", "created · verified · owner: you");
          results.push({ op, ok: true, verified: true });
          continue;
        }
        if (op.type === "add" || op.type === "remove") {
          const gid = idOf(op.group);
          if (!gid) { fail(op.group && op.group.ref && failedCreates.has(lc(op.group.ref)) ? "its group was not created" : "its group has no id"); continue; }
          const r = op.type === "add"
            ? await addMembers(gid, op.ids, (a, b) => { if (L && L.progress) L.progress(i, `${a}/${b}`); })
            : await removeMembers(gid, op.ids);
          let verified = false, note = "";
          try {
            const now = await readDeviceIds(gid);
            verified = op.type === "add" ? r.done.every((id) => now.has(lc(id))) : r.done.every((id) => !now.has(lc(id)));
            if (!verified) note = "the read-back does not show every change yet (Entra can take a moment) — read again to check";
          } catch (e) { note = "written, but the read-back failed: " + msg(e).slice(0, 160); }
          const group = { id: gid, name: (op.group && op.group.name) || "" };
          if (r.done.length) doneOps.push({ type: op.type, key: op.key, group, ids: r.done.slice() });
          const word = op.type === "add" ? "added" : "removed";
          if (r.failed.length) fail(`${r.done.length} ${word}, ${r.failed.length} refused — ${r.failed.slice(0, 3).map((f) => f.why).join("; ")}`, `${r.done.length}/${op.ids.length} ${word}`);
          else if (!verified) { if (L) L.fail(i, note, `${r.done.length} ${word} · NOT verified`); results.push({ op, ok: true, verified: false, note }); }
          else { if (L) L.done(i, "", `${r.done.length} ${word} · verified`); results.push({ op, ok: true, verified: true }); }
          continue;
        }
        if (op.type === "nest" || op.type === "unnest") {
          const child = idOf(op.child);
          if (!child) { fail(op.child && op.child.ref && failedCreates.has(lc(op.child.ref)) ? "its group was not created" : "the group to nest has no id"); continue; }
          const parent = op.parent.id;
          if (op.type === "nest") {
            try { await Graph.post(`/groups/${enc(parent)}/members/$ref`, { "@odata.id": ref(child) }, { scopes: W() }); }
            catch (e) { if (!already(e)) throw e; }
          } else {
            try { await Graph.del(`/groups/${enc(parent)}/members/${enc(child)}/$ref`, { scopes: W() }); }
            catch (e) { if (!(e && (e.kind === "notfound" || e.status === 404))) throw e; }
          }
          let verified = false, note = "";
          try { const now = await readGroupIds(parent); verified = op.type === "nest" ? now.has(lc(child)) : !now.has(lc(child)); if (!verified) note = "the read-back does not show it yet"; }
          catch (e) { note = "written, but the read-back failed: " + msg(e).slice(0, 160); }
          doneOps.push({ type: op.type, key: op.key, parent: op.parent, child: { id: lc(child), name: op.child.name }, kind: op.kind });
          if (!verified) { if (L) L.fail(i, note, `${op.type === "nest" ? "nested" : "taken out"} · NOT verified`); results.push({ op, ok: true, verified: false, note }); }
          else { if (L) L.done(i, "", `${op.type === "nest" ? "nested" : "taken out"} · verified`); results.push({ op, ok: true, verified: true }); }
          continue;
        }
        fail(`unknown step "${op.type}"`);
      } catch (e) { fail(msg(e).slice(0, 240)); }
    }
    return { results, done: doneOps, created };
  }

  // What the verified run changed, folded into the input the pane holds —
  // so the rows move without a full re-read.
  function patchInput(input, done, createdGroups) {
    for (const g of createdGroups || []) if (g && g.id && !(input.deviceGroups || []).some((x) => lc(x.id) === lc(g.id))) { input.deviceGroups.push(g); input.deviceMembers.set(lc(g.id), new Set()); }
    for (const d of done || []) {
      if (d.type === "add" || d.type === "remove") {
        const set = input.deviceMembers.get(lc(d.group.id)) || new Set();
        d.ids.forEach((id) => d.type === "add" ? set.add(lc(id)) : set.delete(lc(id)));
        input.deviceMembers.set(lc(d.group.id), set);
      } else if (d.type === "nest" || d.type === "unnest") {
        const set = input.waveChildren.get(lc(d.parent.id)) || new Set();
        d.type === "nest" ? set.add(lc(d.child.id)) : set.delete(lc(d.child.id));
        input.waveChildren.set(lc(d.parent.id), set);
      }
    }
  }

  // ------------------------------------------------------------- export --
  const csvCell = (s) => { const v = String(s == null ? "" : s); return /[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  function csv(model) {
    const rows = [["Region", "Country", "User group", "Device group", "Device", "Primary user", "Last sync", "Status"]];
    for (const r of model.rows) {
      for (const d of r.devices) {
        const st = !d.objId ? d.problem : r.have.has(d.objId) ? "in group" : "to add";
        rows.push([r.region, r.country, r.userGroupName, r.deviceGroupName || "", d.name, d.upn, d.lastSync || "", `${st}${d.stale ? " · stale" : ""}${d.others.length ? " · also in " + d.others.join(", ") : ""}`]);
      }
      r.remove.forEach((id, n) => rows.push([r.region, r.country, r.userGroupName, r.deviceGroupName || "", r.removeNames[n], "", "", "to remove (primary user not in the country group)"]));
    }
    return rows.map((x) => x.map(csvCell).join(",")).join("\r\n");
  }

  return {
    DEFAULTS, normConfig, parseMap, formatMap, parseOverrides, formatOverrides,
    iso3Of, countryName, countryRows, parsePilots, suggestDeviceSuffix, addPilot, readInput, compute, planOps, inverseOf,
    addMembers, removeMembers, applyOps, patchInput, csv,
    _setWait: (fn) => { wait = fn; },
  };
})();

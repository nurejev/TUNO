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
  const cleanNames = (a) => uniq((a || []).map((x) => String(x == null ? "" : x).trim()).filter(Boolean));

  // ISO 3166-1 alpha-2 → alpha-3, the full list (pycountry, 249 entries).
  const ISO = "ADAND AEARE AFAFG AGATG AIAIA ALALB AMARM AOAGO AQATA ARARG ASASM ATAUT AUAUS AWABW AXALA AZAZE BABIH BBBRB BDBGD BEBEL BFBFA BGBGR BHBHR BIBDI BJBEN BLBLM BMBMU BNBRN BOBOL BQBES BRBRA BSBHS BTBTN BVBVT BWBWA BYBLR BZBLZ CACAN CCCCK CDCOD CFCAF CGCOG CHCHE CICIV CKCOK CLCHL CMCMR CNCHN COCOL CRCRI CUCUB CVCPV CWCUW CXCXR CYCYP CZCZE DEDEU DJDJI DKDNK DMDMA DODOM DZDZA ECECU EEEST EGEGY EHESH ERERI ESESP ETETH FIFIN FJFJI FKFLK FMFSM FOFRO FRFRA GAGAB GBGBR GDGRD GEGEO GFGUF GGGGY GHGHA GIGIB GLGRL GMGMB GNGIN GPGLP GQGNQ GRGRC GSSGS GTGTM GUGUM GWGNB GYGUY HKHKG HMHMD HNHND HRHRV HTHTI HUHUN IDIDN IEIRL ILISR IMIMN ININD IOIOT IQIRQ IRIRN ISISL ITITA JEJEY JMJAM JOJOR JPJPN KEKEN KGKGZ KHKHM KIKIR KMCOM KNKNA KPPRK KRKOR KWKWT KYCYM KZKAZ LALAO LBLBN LCLCA LILIE LKLKA LRLBR LSLSO LTLTU LULUX LVLVA LYLBY MAMAR MCMCO MDMDA MEMNE MFMAF MGMDG MHMHL MKMKD MLMLI MMMMR MNMNG MOMAC MPMNP MQMTQ MRMRT MSMSR MTMLT MUMUS MVMDV MWMWI MXMEX MYMYS MZMOZ NANAM NCNCL NENER NFNFK NGNGA NINIC NLNLD NONOR NPNPL NRNRU NUNIU NZNZL OMOMN PAPAN PEPER PFPYF PGPNG PHPHL PKPAK PLPOL PMSPM PNPCN PRPRI PSPSE PTPRT PWPLW PYPRY QAQAT REREU ROROU RSSRB RURUS RWRWA SASAU SBSLB SCSYC SDSDN SESWE SGSGP SHSHN SISVN SJSJM SKSVK SLSLE SMSMR SNSEN SOSOM SRSUR SSSSD STSTP SVSLV SXSXM SYSYR SZSWZ TCTCA TDTCD TFATF TGTGO THTHA TJTJK TKTKL TLTLS TMTKM TNTUN TOTON TRTUR TTTTO TVTUV TWTWN TZTZA UAUKR UGUGA UMUMI USUSA UYURY UZUZB VAVAT VCVCT VEVEN VGVGB VIVIR VNVNM VUVUT WFWLF WSWSM YEYEM YTMYT ZAZAF ZMZMB ZWZWE";
  const ISO3 = new Map(ISO.split(" ").map((x) => [x.slice(0, 2), x.slice(2)]));
  // A DELETED primary user (10659, Mihai: "these devices have a username in
  // their primary user. extract that name and find the real user"): Entra
  // renames a deleted user's UPN to <object id without dashes><old UPN>, and
  // Intune keeps showing it — 06a64d50…96caNausad.Ahmed@perfettivanmelle.com.
  // The old UPN is the one the person's live account carries.
  const DELETED_UPN = /^[0-9a-f]{32}(.+@.+)$/i;
  const realUpnOf = (upn) => { const m = DELETED_UPN.exec(String(upn || "").trim()); return m ? m[1] : ""; };

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
    // A pilot added IN BATCHES (10640, Mihai: "split the adding of the pilot
    // group in 4 even batches of users and devices"; option A off the
    // mockup): its users go straight into the user wave a batch at a time,
    // and its device group follows them — it holds only the devices of
    // users already in the wave. Its user group is nested at the end.
    batched: ["NL-Breda"],
    batchCount: 4,
    // A pilot migrated into its country (10656, Mihai: "the NL-Breda users
    // should be excluded when NL goes live, or better there should be a
    // migrate to wave for the pilot users"; option B off the mockup): when
    // the country it overlaps goes live, the pilot's own route into the
    // wave is taken down and the pilot is listed as migrated, not planned.
    migrated: [],
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
      batched: uniq((Array.isArray(o.batched) ? o.batched : DEFAULTS.batched).map((x) => String(x || "").trim()).filter(Boolean)),
      migrated: uniq((Array.isArray(o.migrated) ? o.migrated : DEFAULTS.migrated).map((x) => String(x || "").trim()).filter(Boolean)),
      batchCount: Number.isInteger(+o.batchCount) && +o.batchCount >= 2 && +o.batchCount <= 10 ? +o.batchCount : DEFAULTS.batchCount,
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
  // alpha-3 → the country's English name (10659, the Left out hint)
  function countryName3(code) {
    const two = [...ISO3.entries()].find(([, v]) => v === String(code || "").toUpperCase());
    return two ? countryName(two[0]) : String(code || "");
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
  // held (10639): the device exclusion group — its devices are KEPT OUT of
  // the country device groups (Mihai: "keep it on the old set"), so the
  // sync never adds them and offers to take them out.
  async function readInput(cfg, waveGroups, onStatus, skip, held, pilotNames) {
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
    // every platform, once (10642): Windows is the wave's subset; the rest
    // says what a user with no Windows device does have (🕳 Left out)
    say("Reading the devices in Intune…");
    const managedAll = await Graph.readAll(`/deviceManagement/managedDevices?$select=id,deviceName,userId,userPrincipalName,azureADDeviceId,lastSyncDateTime,operatingSystem`, { scopes: DS, retry: true });
    const managed = (managedAll || []).filter((m) => lc(m.operatingSystem) === "windows");
    say("Reading the Windows devices in Entra…");
    const entra = await Graph.readAll(`/devices?$filter=${enc("operatingSystem eq 'Windows'")}&$count=true&$select=id,deviceId,displayName,accountEnabled&$top=999`, { scopes: DO, headers: EV, retry: true });
    // 10655 (Mihai: "in the users without devices I see no primary user on
    // the device, but looking that user up in Entra I get a device name";
    // option A off the mockup — primary user, then the Entra owner, then the
    // name): the registered owner of every Windows device Intune names no
    // primary user for, with the owner's usage location
    const entraByDid = new Map((entra || []).filter((e) => e.deviceId).map((e) => [lc(e.deviceId), e]));
    const orphans = managed.filter((m) => !m.userId && m.azureADDeviceId && entraByDid.has(lc(m.azureADDeviceId)));
    const owners = new Map();
    const ownerFailed = [];
    let oi = 0;
    const orr = await Graph.pool(orphans, async (m) => {
      if (++oi % 25 === 1 || oi === orphans.length) say(`Reading the Entra owners of devices with no primary user — ${oi}/${orphans.length}…`);
      return Graph.readAll(`/devices/${enc(entraByDid.get(lc(m.azureADDeviceId)).id)}/registeredOwners/microsoft.graph.user?$select=id,userPrincipalName,usageLocation&$top=5`, { scopes: DO, retry: true });
    }, 6);
    orr.forEach((r, n) => {
      const e = entraByDid.get(lc(orphans[n].azureADDeviceId));
      if (r.error) { ownerFailed.push(orphans[n].deviceName || orphans[n].id); return; }
      const o = (r.value || [])[0];
      if (o) owners.set(lc(e.id), { id: lc(o.id), upn: o.userPrincipalName || o.id, usageLocation: o.usageLocation || "" });
    });
    const rows = countryRows(cfg);
    const wanted = new Set(rows.map((r) => lc(r.userGroupName)));
    const mapped = countryGroups.filter((g) => wanted.has(lc(g.displayName)));
    const usersByGroup = new Map(), failed = [];
    let i = 0;
    const ur = await Graph.pool(mapped, async (g) => {
      say(`Reading the users of the country groups — ${++i}/${mapped.length}…`);
      return Graph.readAll(`/groups/${enc(g.id)}/transitiveMembers/microsoft.graph.user?$select=id,userPrincipalName,onPremisesSecurityIdentifier,onPremisesSamAccountName&$count=true&$top=999`, { scopes: GS, headers: EV, retry: true });
    }, 4);
    ur.forEach((r, n) => { if (r.error) failed.push(`${mapped[n].displayName}: ${(r.error && r.error.message) || r.error}`); else usersByGroup.set(lc(mapped[n].id), r.value || []); });
    // 10659: the primary users in no country group of the table — each read
    // once: a deleted one by the UPN its name carries (the live account), a
    // live one by id — for their usage location, and the live account's id
    const inGroups = new Set();
    for (const list of usersByGroup.values()) for (const u of list) inGroups.add(lc(u.id));
    const outside = new Map();
    for (const m of managed) if (m.userId && !inGroups.has(lc(m.userId)) && !outside.has(lc(m.userId))) outside.set(lc(m.userId), m);
    const primaryUsers = new Map(), puFailed = [];
    const outList = [...outside.entries()];
    let pi = 0;
    const pr = await Graph.pool(outList, async ([, m]) => {
      if (++pi % 25 === 1 || pi === outList.length) say(`Looking up primary users outside the country groups — ${pi}/${outList.length}…`);
      const real = realUpnOf(m.userPrincipalName);
      if (real) return { real, hits: await Graph.readAll(`/users?$filter=${enc(`userPrincipalName eq '${odq(real)}'`)}&$select=id,userPrincipalName,usageLocation,accountEnabled&$top=5`, { scopes: Graph.SCOPES.directory, retry: true }) };
      try { return { one: await Graph.get(`https://graph.microsoft.com/v1.0/users/${enc(m.userId)}?$select=id,userPrincipalName,usageLocation,accountEnabled`, { scopes: Graph.SCOPES.directory, retry: true }) }; }
      catch (e) { if (e && e.kind === "notfound") return { gone: true }; throw e; }
    }, 6);
    pr.forEach((r, n) => {
      const [k, m] = outList[n];
      if (r.error) { puFailed.push(m.userPrincipalName || m.userId); return; }
      const v = r.value || {};
      if (v.real) {
        const u = (v.hits || []).find((x) => lc(x.userPrincipalName) === lc(v.real)) || null;
        primaryUsers.set(k, { deleted: true, realUpn: v.real, id: u ? lc(u.id) : "", upn: u ? u.userPrincipalName : v.real, usageLocation: u ? u.usageLocation || "" : "", found: !!u, enabled: u ? u.accountEnabled !== false : null });
      } else if (v.gone) primaryUsers.set(k, { deleted: true, realUpn: "", id: "", upn: m.userPrincipalName || "", usageLocation: "", found: false, enabled: null });
      else primaryUsers.set(k, { deleted: false, realUpn: "", id: lc(v.one.id), upn: v.one.userPrincipalName || m.userPrincipalName || "", usageLocation: v.one.usageLocation || "", found: true, enabled: v.one.accountEnabled !== false });
    });
    if (puFailed.length) failed.push(`${puFailed.length} primary user${puFailed.length === 1 ? "" : "s"} outside the country groups could not be looked up (${puFailed.slice(0, 5).join(", ")}${puFailed.length > 5 ? " …" : ""}) — their device's name decides`);
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
    // the users put straight into a wave — a pilot's batches (10640)
    const waveUsers = new Map();
    const wu = await Graph.pool(waves, async (g) => Graph.readAll(`/groups/${enc(g.id)}/members/microsoft.graph.user?$select=id,userPrincipalName&$top=999`, { scopes: GS, retry: true }), 4);
    wu.forEach((r, n) => { if (r.error) failed.push(`${waves[n].displayName} (direct users): ${(r.error && r.error.message) || r.error}`); else waveUsers.set(lc(waves[n].id), new Set((r.value || []).map((x) => lc(x.id)))); });
    let heldIds = new Set();
    if (held && held.id) {
      say("Reading the device exclusion group…");
      try { heldIds = new Set(((await Graph.readAll(`/groups/${enc(held.id)}/members/microsoft.graph.device?$select=id&$top=999`, { scopes: GS, retry: true })) || []).map((d) => lc(d.id))); }
      catch (e) { failed.push(`${held.displayName || "the device exclusion group"}: ${(e && e.message) || e}`); }
    }
    // 🧪 the pilot groups' direct members (10647): users, devices, and any
    // nested group (listed, never taken out member by member)
    const pilots = [], pilotsMissing = [];
    for (const name of cleanNames(pilotNames)) {
      say(`Reading the pilot group ${name}…`);
      try {
        const hits = (await Graph.readAll(`/groups?$filter=${enc(`displayName eq '${odq(name)}'`)}&$select=id,displayName&$top=5`, { scopes: GS, retry: true })) || [];
        const g = hits.find((x) => lc(x.displayName) === lc(name));
        if (!g) { pilotsMissing.push(name); continue; }
        const [users, devices, groups] = await Promise.all([
          Graph.readAll(`/groups/${enc(g.id)}/members/microsoft.graph.user?$select=id,userPrincipalName,displayName&$top=999`, { scopes: GS, retry: true }),
          Graph.readAll(`/groups/${enc(g.id)}/members/microsoft.graph.device?$select=id,deviceId,displayName&$top=999`, { scopes: GS, retry: true }),
          Graph.readAll(`/groups/${enc(g.id)}/members/microsoft.graph.group?$select=id,displayName&$top=999`, { scopes: GS, retry: true }),
        ]);
        pilots.push({ id: lc(g.id), name: g.displayName, users: (users || []).map((u) => ({ id: lc(u.id), upn: u.userPrincipalName || "", name: u.displayName || u.userPrincipalName || u.id })),
          devices: (devices || []).map((d) => ({ id: lc(d.id), deviceId: lc(d.deviceId || ""), name: d.displayName || d.id })), groups: (groups || []).map((x) => ({ id: lc(x.id), name: x.displayName || x.id })) });
      } catch (e) { failed.push(`${name}: ${(e && e.message) || e}`); }
    }
    if (ownerFailed.length) failed.push(`the Entra owner of ${ownerFailed.length} device${ownerFailed.length === 1 ? "" : "s"} with no primary user could not be read (${ownerFailed.slice(0, 5).join(", ")}${ownerFailed.length > 5 ? " …" : ""}) — their name decides`);
    say("");
    return { countryGroups, deviceGroups: dgList, managed, managedAll, entra, usersByGroup, deviceMembers, waveChildren, waveUsers, held: heldIds, heldGroup: held && held.id ? { id: lc(held.id), name: held.displayName || "" } : null,
      pilots, pilotsMissing, owners, primaryUsers, failed, readAt: Date.now() };
  }

  // ------------------------------------------------------------ batches --
  // A pilot in batches (10640). The users who can be batched are the pilot
  // group's users not already in the wave through another nested group (a
  // Breda user is in NL too). They are split into batchCount even parts
  // (sizes differ by one at most), sorted by UPN; the users put straight
  // into the user wave count as in. The NEXT batch tops up the first part
  // not yet full, cut from whoever is still left — so users who join or
  // leave the group in between are counted in. Finished: the pilot group
  // itself is nested in the wave.
  function batchOf(cfg, input, row) {
    if (!row.ug || !(cfg.batched || []).some((x) => lc(x) === lc(row.suffix))) return null;
    const K = cfg.batchCount || DEFAULTS.batchCount;
    const wave = row.wave && row.wave.user;
    const direct = wave && input.waveUsers ? (input.waveUsers.get(lc(wave.id)) || new Set()) : new Set();
    const kids = wave && input.waveChildren ? (input.waveChildren.get(lc(wave.id)) || new Set()) : new Set();
    const finished = kids.has(lc(row.ug.id));
    const viaOther = new Set(), viaNames = [];
    for (const gid of kids) {
      if (gid === lc(row.ug.id)) continue;
      const us = input.usersByGroup.get(gid);
      if (!us) continue;
      const g = (input.countryGroups || []).find((x) => lc(x.id) === gid);
      let hit = false;
      for (const u of us) { viaOther.add(lc(u.id)); hit = true; }
      if (hit && g) viaNames.push(g.displayName);
    }
    const users = (input.usersByGroup.get(lc(row.ug.id)) || []).map((u) => ({ id: lc(u.id), upn: u.userPrincipalName || u.id }));
    const inOther = users.filter((u) => viaOther.has(u.id));
    const batchable = users.filter((u) => !viaOther.has(u.id)).sort((a, b) => lc(a.upn).localeCompare(lc(b.upn)));
    const inList = batchable.filter((u) => direct.has(u.id)), left = batchable.filter((u) => !direct.has(u.id));
    const N = batchable.length;
    const sizes = Array.from({ length: K }, (_, k) => Math.floor(N / K) + (k < N % K ? 1 : 0));
    const devOf = (list) => { const ids = new Set(list.map((u) => u.id)); return row.devices.filter((d) => ids.has(d.userId)); };
    const batches = [];
    let before = 0, taken = 0, nextFound = false;
    for (let k = 0; k < K; k++) {
      const size = sizes[k];
      const inHere = Math.max(0, Math.min(size, inList.length - before));
      let list, state;
      if (!size) { list = []; state = "empty"; }
      else if (finished || inHere >= size) { list = inList.slice(before, before + size); state = "in"; }
      else {
        const need = size - inHere;
        list = inList.slice(before, before + inHere).concat(left.slice(taken, taken + need));
        taken += need;
        state = nextFound ? "waiting" : "next";
        nextFound = true;
      }
      batches.push({ n: k + 1, size, inHere, users: list, devices: devOf(list), state, toAdd: state === "in" ? [] : list.filter((u) => !direct.has(u.id)) });
      before += size;
    }
    const inWave = new Set([...direct, ...viaOther]);
    if (finished) users.forEach((u) => inWave.add(u.id));
    return { K, N, finished, inCount: finished ? N : inList.length, inOther: inOther.length, viaNames, sizes, batches,
      next: batches.find((b) => b.state === "next") || null, inWave, direct: users.filter((u) => direct.has(u.id)).map((u) => u.id) };
  }

  // ------------------------------------------------------------ compute --
  // waves: Map lc(region) -> { user: group|null, device: group|null, userName, deviceName }
  function compute(cfg, input, waves, now) {
    const t = now || Date.now();
    const held = input.held || new Set();
    const staleMs = cfg.staleDays * 86400000;
    const entraByDeviceId = new Map(), entraById = new Map();
    for (const e of input.entra || []) { if (e.deviceId) entraByDeviceId.set(lc(e.deviceId), e); entraById.set(lc(e.id), e); }
    const groupsByName = new Map((input.countryGroups || []).map((g) => [lc(g.displayName), g]));
    const dgByName = new Map((input.deviceGroups || []).map((g) => [lc(g.displayName), g]));
    const defs = countryRows(cfg).map((r) => { const ug = groupsByName.get(lc(r.userGroupName)) || null; return { r, ug, users: ug ? input.usersByGroup.get(lc(ug.id)) : null }; });
    const inRows = new Set();
    for (const x of defs) for (const u of x.users || []) inRows.add(lc(u.id));
    // A device's country (10655, option A): its Intune primary user; with
    // none, its Entra registered owner (their country group, else their
    // usage location); with neither, the ISO3 its name starts with — only a
    // code of a country in the table, and never a pilot's group.
    const byIso3 = new Map(), byIso2 = new Map();
    for (const x of defs) if (!x.r.pilot) {
      if (x.r.iso3 && /^[A-Z]{3}$/.test(x.r.iso3) && !byIso3.has(x.r.iso3)) byIso3.set(x.r.iso3, x.r);
      if (/^[A-Za-z]{2}$/.test(x.r.suffix) && !byIso2.has(lc(x.r.suffix))) byIso2.set(lc(x.r.suffix), x.r);
    }
    const nameRow = (name) => byIso3.get(String(name || "").slice(0, 3).toUpperCase()) || null;
    const byUser = new Map(), extra = new Map(), placed = new Map();
    let noPrimary = 0;
    const pus = input.primaryUsers || new Map();
    for (const m of input.managed || []) {
      let k = m.userId ? lc(m.userId) : "", via = "primary", owner = null;
      // 10659: a primary user in no country group of the table — a deleted
      // one's live account when IT is in a country group; else the ISO3 the
      // device name starts with; else the (live) user's usage location
      if (k && !inRows.has(k)) {
        const pu = pus.get(k) || { deleted: !!realUpnOf(m.userPrincipalName), realUpn: realUpnOf(m.userPrincipalName), id: "", upn: realUpnOf(m.userPrincipalName) || m.userPrincipalName || "", usageLocation: "", found: false };
        const who = { id: pu.id || "", upn: pu.upn || pu.realUpn || m.userPrincipalName || "", deleted: !!pu.deleted, found: !!pu.found, outside: true, usageLocation: pu.usageLocation || "" };
        if (pu.id && inRows.has(pu.id)) {
          k = pu.id; via = "real"; owner = who;
          placed.set(lc(m.id), via);
        } else {
          let row = nameRow(m.deviceName), how = "name";
          if (!row && pu.usageLocation) { row = byIso2.get(lc(pu.usageLocation)) || null; how = "userloc"; }
          if (row) {
            if (!extra.has(row.key)) extra.set(row.key, []);
            extra.get(row.key).push({ m, via: how, owner: who });
            placed.set(lc(m.id), how);
            continue;
          }
        }
      }
      if (!k) {
        const e = m.azureADDeviceId ? entraByDeviceId.get(lc(m.azureADDeviceId)) : null;
        owner = e && input.owners ? input.owners.get(lc(e.id)) || null : null;
        if (owner && inRows.has(owner.id)) { k = owner.id; via = "owner"; }
        else {
          let row = owner && owner.usageLocation ? byIso2.get(lc(owner.usageLocation)) || null : null;
          via = row ? "location" : "name";
          if (!row) row = nameRow(m.deviceName);
          if (!row) { noPrimary++; continue; }
          if (!extra.has(row.key)) extra.set(row.key, []);
          extra.get(row.key).push({ m, via, owner });
          placed.set(lc(m.id), via);
          continue;
        }
        placed.set(lc(m.id), via);
      }
      if (!byUser.has(k)) byUser.set(k, []);
      byUser.get(k).push({ m, via, owner });
    }
    const rows = defs.map(({ r, ug, users }) => {
      const devices = [], seen = new Set();
      let usersNoDevice = 0;
      const push = (m, u, via, owner) => {
        if (seen.has(lc(m.id))) return;
        seen.add(lc(m.id));
        const e = m.azureADDeviceId ? entraByDeviceId.get(lc(m.azureADDeviceId)) : null;
        const last = Date.parse(m.lastSyncDateTime || "");
        const name = m.deviceName || (e && e.displayName) || m.id;
        const nr = nameRow(name);
        const liveUpn = via === "real" || via === "userloc" || (via === "name" && owner && owner.upn) ? owner.upn : "";
        devices.push({ managedId: m.id, name, upn: liveUpn || realUpnOf(m.userPrincipalName) || m.userPrincipalName || (u && u.userPrincipalName) || (owner && owner.upn) || "",
          deletedUser: !!realUpnOf(m.userPrincipalName) || !!(owner && owner.deleted), outside: !!(owner && owner.outside), usageLocation: owner && owner.outside ? owner.usageLocation : "", userId: u ? lc(u.id) : (owner ? owner.id : ""),
          via, owner: owner ? owner.upn : "", nameSays: nr && nr.iso3 !== String(r.iso3 || "").slice(0, 3) ? nr.country : "",
          lastSync: m.lastSyncDateTime || null, stale: Number.isFinite(last) && t - last > staleMs,
          objId: e ? lc(e.id) : null, problem: e ? null : (m.azureADDeviceId ? "no Entra object for this device" : "not joined to Entra (no device id)"), others: [],
          held: !!(e && held.has(lc(e.id))) });
      };
      for (const u of users || []) {
        const list = byUser.get(lc(u.id)) || [];
        if (!list.length) { usersNoDevice++; continue; }
        for (const x of list) push(x.m, u, x.via, x.owner);
      }
      for (const x of extra.get(r.key) || []) push(x.m, null, x.via, x.owner);
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
      // a device in the exclusion group stays on the old set: never wanted
      // here, and taken out when it is in (10639)
      row.want = new Set(row.devices.filter((d) => d.objId && !d.held).map((d) => d.objId));
      row.batch = batchOf(cfg, input, row);
      // a pilot in batches: its device group follows its users — only the
      // devices of users already in the wave are wanted (10640)
      if (row.batch && !row.batch.finished) row.want = new Set(row.devices.filter((d) => d.objId && !d.held && row.batch.inWave.has(d.userId)).map((d) => d.objId));
      row.have = row.dg ? (input.deviceMembers.get(lc(row.dg.id)) || new Set()) : new Set();
      row.add = [...row.want].filter((id) => !row.have.has(id));
      row.remove = [...row.have].filter((id) => !row.want.has(id));
      row.removeNames = row.remove.map((id) => { const e = entraById.get(id); return `${e ? e.displayName : id}${held.has(id) ? " (excluded)" : ""}`; });
      const kids = (g) => (g && input.waveChildren.get(lc(g.id))) || null;
      row.ugNested = row.ug && row.wave.user ? !!(kids(row.wave.user) && kids(row.wave.user).has(lc(row.ug.id))) : null;
      row.dgNested = row.dg && row.wave.device ? !!(kids(row.wave.device) && kids(row.wave.device).has(lc(row.dg.id))) : null;
      row.problems = {
        byOwner: row.devices.filter((d) => d.via === "owner" || d.via === "location").length,
        byName: row.devices.filter((d) => d.via === "name").length,
        byReal: row.devices.filter((d) => d.via === "real").length,
        byOutside: row.devices.filter((d) => d.outside && d.via !== "real").length,
        nameOther: row.devices.filter((d) => d.nameSays).length,
        noEntra: row.devices.filter((d) => !d.objId).length,
        stale: row.devices.filter((d) => d.stale).length,
        multi: row.devices.filter((d) => d.others.length && !d.pilotOverlap).length,
        pilot: row.devices.filter((d) => d.others.length && d.pilotOverlap).length,
        held: row.devices.filter((d) => d.held).length,
      };
      row.inSync = !!row.dg && !row.add.length && !row.remove.length;
    }
    // a pilot and the country it overlaps (NL-Breda ⊂ NL); a pilot migrated
    // into it (10656) is listed, never planned
    for (const row of rows) {
      if (!row.pilot) continue;
      const parent = rows.find((p) => p !== row && !p.pilot && lc(row.userGroupName).startsWith(lc(p.userGroupName) + "-"));
      row.parentKey = parent ? parent.key : null;
      row.parentCountry = parent ? parent.country : "";
      row.migrated = (cfg.migrated || []).some((x) => lc(x) === lc(row.suffix));
      // the pilot's users its country does not hold — a migration would take
      // them out of the wave, so there is none while there are any
      const pu = parent && parent.ug ? new Set((input.usersByGroup.get(lc(parent.ug.id)) || []).map((u) => lc(u.id))) : null;
      row.outsideParent = pu && row.ug ? (input.usersByGroup.get(lc(row.ug.id)) || []).filter((u) => !pu.has(lc(u.id))).map((u) => u.userPrincipalName || u.id) : [];
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
    const ownerUsers = new Set();
    for (const [k, list] of byUser) if (list.some((x) => x.via === "owner" || x.via === "real")) ownerUsers.add(k);
    return { rows, regions, unmapped, noPrimary, placed: placed.size, managedCount: (input.managed || []).length, failed: input.failed || [], readAt: input.readAt || 0,
      leftOut: leftOutOf(input, rows, t, staleMs, entraByDeviceId, placed, ownerUsers), pilots: pilotsOf(input, rows) };
  }

  // ------------------------------------------------------------ logons --
  // 🔎 (10648, Mihai: "if a user has no device in Entra and Intune, try to
  // search in Defender or somewhere else on which device the user has logged
  // in"; option A off the mockup — read-only). One advanced-hunting query per
  // 200 users: DeviceLogonEvents (successful interactive, RDP, cached and
  // unlock logons) matched by the on-premises SID (hybrid accounts) or the
  // account name (the on-premises sAMAccountName, else the UPN's prefix),
  // with DeviceInfo's Entra device id. Defender sees MDE-onboarded devices
  // only, and advanced hunting keeps 30 days.
  const kq = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const logonNames = (u) => uniq([u.sam, String(u.upn || "").split("@")[0]].filter(Boolean).map(lc));
  function logonKql(users, days) {
    const d = days || 30;
    const sids = uniq((users || []).map((u) => u.sid).filter(Boolean));
    const names = uniq((users || []).flatMap(logonNames));
    return [
      `let sids = dynamic([${sids.map(kq).join(", ")}]);`,
      `let names = dynamic([${names.map(kq).join(", ")}]);`,
      "DeviceLogonEvents",
      `| where Timestamp > ago(${d}d) and ActionType == "LogonSuccess"`,
      `| where LogonType in~ ("Interactive", "RemoteInteractive", "CachedInteractive", "CachedRemoteInteractive", "Unlock")`,
      "| where AccountSid in~ (sids) or tolower(AccountName) in (names)",
      "| summarize LastLogon = max(Timestamp), Logons = count() by AccountSid, AccountName = tolower(AccountName), DeviceId, DeviceName",
      `| join kind=leftouter (DeviceInfo | where Timestamp > ago(${d}d) | summarize arg_max(Timestamp, AadDeviceId, OSPlatform, JoinType) by DeviceId) on DeviceId`,
      "| project AccountSid, AccountName, DeviceId, DeviceName, LastLogon, Logons, AadDeviceId, OSPlatform, JoinType",
    ].join("\n");
  }
  async function readLogons(users, onStatus) {
    const out = [], chunks = [];
    for (let i = 0; i < (users || []).length; i += 200) chunks.push(users.slice(i, i + 200));
    for (let i = 0; i < chunks.length; i++) {
      if (onStatus) onStatus(`Asking Defender — ${i + 1}/${chunks.length}…`);
      const r = await Graph.post("/security/runHuntingQuery", { Query: logonKql(chunks[i]), Timespan: "P30D" }, { scopes: Graph.SCOPES.hunting });
      for (const x of (r && r.results) || []) out.push(x);
    }
    if (onStatus) onStatus("");
    return out;
  }
  // What each device means for the rollout: in Intune under another primary
  // user (then it follows THAT person's country), in Entra but not in Intune
  // (no wave reaches it — the device groups follow Intune primary users), or
  // Defender only (no Entra object: it cannot be a group member at all).
  // 10654 (Mihai: "for the defender findings, devices with vdi in the name
  // should be excluded. Named but excluded, because that's AVD and out of
  // scope"): a logon on such a device is listed, marked out of scope, and
  // sorted after the devices that count.
  const AVD_NAME = /vdi/i;
  const isAvdName = (name) => AVD_NAME.test(String(name || ""));
  function logonsFor(input, rows, users, results) {
    const entraByDev = new Map((input.entra || []).map((e) => [lc(e.deviceId || ""), e]));
    const managedByDev = new Map();
    for (const m of input.managedAll || input.managed || []) if (m.azureADDeviceId) managedByDev.set(lc(m.azureADDeviceId), m);
    const rowsOfUser = new Map();
    for (const r of rows || []) if (r.ug) for (const u of input.usersByGroup.get(lc(r.ug.id)) || []) {
      const k = lc(u.id);
      if (!rowsOfUser.has(k)) rowsOfUser.set(k, []);
      rowsOfUser.get(k).push(r);
    }
    const meaning = (h) => {
      const aad = lc(h.AadDeviceId || "");
      const base = { device: String(h.DeviceName || h.DeviceId || "").split(".")[0], fqdn: h.DeviceName || "", last: h.LastLogon || null, logons: Number(h.Logons) || 0, os: h.OSPlatform || "", join: h.JoinType || "" };
      const m = aad ? managedByDev.get(aad) : null, e = aad ? entraByDev.get(aad) : null;
      if (isAvdName(h.DeviceName) || (m && isAvdName(m.deviceName))) return Object.assign(base, { kind: "avd", outOfScope: true, what: "⊘ AVD (VDI in the name) — out of scope, excluded" });
      if (m) {
        if (!m.userId) return Object.assign(base, { kind: "intune", what: "in Intune, no primary user — no wave" });
        const rs = rowsOfUser.get(lc(m.userId)) || [];
        const r = rs.find((y) => e && y.have.has(lc(e.id)) && y.dgNested) || rs.find((y) => !y.pilot) || rs[0] || null;
        const inWave = !!(r && e && r.have.has(lc(e.id)) && r.dgNested);
        return Object.assign(base, { kind: "intune", primary: m.userPrincipalName || "", country: r ? r.country : "", inWave, deviceGroup: r ? r.deviceGroupName : "",
          what: `in Intune — primary user ${m.userPrincipalName || m.userId}${r ? ` (${r.country})` : " (in no country group)"}${inWave ? `, in the wave through ${r.deviceGroupName}` : r ? ", not in a wave yet" : ""}` });
      }
      if (e) return Object.assign(base, { kind: "entra", what: `Defender only — in Entra${base.join ? ` (${base.join})` : ""}, not in Intune: no wave reaches it` });
      return Object.assign(base, { kind: "defender", what: "Defender only — no Entra object: it cannot be a group member" });
    };
    const out = new Map();
    for (const u of users || []) {
      const sid = lc(u.sid || ""), names = new Set(logonNames(u));
      const byDev = new Map();
      for (const h of results || []) {
        if (!((sid && lc(h.AccountSid || "") === sid) || names.has(lc(h.AccountName || "")))) continue;
        const k = lc(h.DeviceId || h.DeviceName || "");
        const cur = byDev.get(k);
        const t = Date.parse(h.LastLogon || "") || 0;
        if (!cur) byDev.set(k, Object.assign({}, h, { Logons: Number(h.Logons) || 0 }));
        else { cur.Logons += Number(h.Logons) || 0; if (t > (Date.parse(cur.LastLogon || "") || 0)) cur.LastLogon = h.LastLogon; }
      }
      // the devices that count first, newest first; AVD after them
      out.set(u.id, [...byDev.values()].sort((a, b) => (Date.parse(b.LastLogon || "") || 0) - (Date.parse(a.LastLogon || "") || 0)).map(meaning)
        .sort((a, b) => (a.outOfScope ? 1 : 0) - (b.outOfScope ? 1 : 0)));
    }
    return out;
  }

  // ------------------------------------------------------------- pilots --
  // 🧪 (10647, Mihai: "an option to identify the pilot users and devices to
  // a wave and an option to remove them from the pilot and be sure that they
  // are then in their wave"; option A off the mockup). Every direct member
  // of a pilot group, with the wave its country puts it in and its standing:
  //   in   — in that wave now: a user through its country group nested in
  //          the user wave (or put in it directly — a pilot's batches); a
  //          device through its country device group, which holds it and
  //          is nested in the device wave
  //   wait — its wave is known, it is not in it yet (why says what is missing)
  //   none — no wave: no country group, no primary user, not in Intune or
  //          Entra, kept on the old set (⊘), or a nested group
  // 10649 (Mihai: "select the user, and it then should be removed from the
  // pilot groups and the device should be moved to the right group. The user
  // is then ready for the wave"; option A off the mockup — back to their
  // country, they wait for the wave): the members are also grouped per
  // PERSON (pilotPeople) and planPilotsReady takes a person out of every
  // pilot group and puts each of their Windows devices in its country
  // device group. Being in the wave is no longer the condition — a country
  // is, since that is what the wave will take.
  function pilotsOf(input, rows) {
    const P = input.pilots || [];
    if (!P.length && !(input.pilotsMissing || []).length) return null;
    const held = input.held || new Set();
    const entraById = new Map((input.entra || []).map((e) => [lc(e.id), e]));
    const managedByDev = new Map();
    for (const m of input.managedAll || input.managed || []) if (m.azureADDeviceId) managedByDev.set(lc(m.azureADDeviceId), m);
    const rowsOfUser = new Map();
    for (const r of rows) if (r.ug) for (const u of input.usersByGroup.get(lc(r.ug.id)) || []) {
      const k = lc(u.id);
      if (!rowsOfUser.has(k)) rowsOfUser.set(k, []);
      rowsOfUser.get(k).push(r);
    }
    const directIn = (r, uid) => !!(r.wave.user && ((input.waveUsers || new Map()).get(lc(r.wave.user.id)) || new Set()).has(uid));
    const byId = new Map();
    const put = (x, g) => {
      const k = `${x.kind}|${x.id}`;
      if (byId.has(k)) { byId.get(k).groups.push({ id: g.id, name: g.name }); return; }
      byId.set(k, Object.assign(x, { groups: [{ id: g.id, name: g.name }] }));
    };
    const place = (r, kind) => ({ country: r.country, region: r.region, rowKey: r.key,
      waveId: kind === "user" ? (r.wave.user ? lc(r.wave.user.id) : null) : (r.wave.device ? lc(r.wave.device.id) : null),
      waveName: kind === "user" ? r.wave.userName : r.wave.deviceName });
    for (const g of P) {
      for (const u of g.users) {
        const rs = rowsOfUser.get(u.id) || [];
        const x = { kind: "user", id: u.id, name: u.upn || u.name, upn: u.upn };
        if (!rs.length) { put(Object.assign(x, { state: "none", why: "in no country group of the table — no user wave" }), g); continue; }
        const inR = rs.find((r) => r.wave.user && (r.ugNested || directIn(r, u.id)));
        const r = inR || rs.find((y) => !y.pilot) || rs[0];
        Object.assign(x, place(r, "user"));
        if (!r.wave.user) Object.assign(x, { state: "wait", why: `${r.wave.userName || "its user wave"} does not exist yet — create it in 🌊` });
        else if (inR) Object.assign(x, { state: "in", via: r.ugNested ? `through ${r.userGroupName}` : "directly (pilot batch)" });
        else Object.assign(x, { state: "wait", why: r.batch ? `${r.country} goes in by batches — not in its batch yet` : `${r.userGroupName} is not nested in ${r.wave.userName} yet` });
        put(x, g);
      }
      for (const d of g.devices) {
        const e = entraById.get(d.id);
        const devId = d.deviceId || (e && lc(e.deviceId || ""));
        const x = { kind: "device", id: d.id, name: d.name, devId: devId || "" };
        const m = devId ? managedByDev.get(devId) : null;
        if (!m) { put(Object.assign(x, { state: "none", why: e ? "not in Intune — no primary user to follow" : "not a Windows device in Entra, or not in Intune" }), g); continue; }
        x.upn = m.userPrincipalName || "";
        if (m.operatingSystem && lc(m.operatingSystem) !== "windows") { put(Object.assign(x, { state: "none", why: `${m.operatingSystem || "not Windows"} — the waves hold Windows devices` }), g); continue; }
        if (held.has(d.id)) { put(Object.assign(x, { state: "none", why: "⊘ in the device exclusion group — it stays on the old set" }), g); continue; }
        if (!m.userId) { put(Object.assign(x, { state: "none", why: "no Intune primary user — no country, no wave" }), g); continue; }
        const rs = rowsOfUser.get(lc(m.userId)) || [];
        if (!rs.length) { put(Object.assign(x, { state: "none", why: `its primary user ${m.userPrincipalName || m.userId} is in no country group of the table` }), g); continue; }
        const inR = rs.find((r) => r.dg && r.have.has(d.id) && r.dgNested);
        const r = inR || rs.find((y) => y.want && y.want.has(d.id) && !y.pilot) || rs.find((y) => !y.pilot) || rs[0];
        Object.assign(x, place(r, "device"));
        if (!r.wave.device) Object.assign(x, { state: "wait", why: `${r.wave.deviceName || "its device wave"} does not exist yet — create it in 🌊` });
        else if (inR) Object.assign(x, { state: "in", via: `through ${r.deviceGroupName}` });
        else if (!r.deviceGroupName) Object.assign(x, { state: "wait", why: `${r.country} has no device group name — ${r.iso3Source || "set one under ⚙️"}` });
        else if (!r.dg) Object.assign(x, { state: "wait", why: `${r.deviceGroupName} does not exist yet — 👥 Apply creates and fills it` });
        else if (!r.have.has(d.id)) Object.assign(x, { state: "wait", why: r.want.has(d.id) ? `not in ${r.deviceGroupName} yet — the next 👥 Apply adds it` : `${r.country} goes in by batches — its user is not in the wave yet` });
        else Object.assign(x, { state: "wait", why: `${r.deviceGroupName} is not nested in ${r.wave.deviceName} yet` });
        put(x, g);
      }
      for (const n of g.groups) put({ kind: "group", id: n.id, name: n.name, state: "none", why: "a nested group — T28 takes members out one by one, not groups; take it out in Entra if it should go" }, g);
    }
    const members = [...byId.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "user" ? -1 : 1) || lc(a.name).localeCompare(lc(b.name)));
    const out = { groups: P.map((g) => ({ id: g.id, name: g.name, count: g.users.length + g.devices.length + g.groups.length })), missing: input.pilotsMissing || [], members };
    Object.assign(out, pilotPeople(input, rows, members, rowsOfUser, entraById, managedByDev));
    return out;
  }
  // One row per PERSON (10649): a pilot user, or the Intune primary user of
  // a pilot device, with every Windows device of theirs — in a pilot group or
  // not — since "ready for the wave" is about the person, not the member.
  //   ready — a country (and its device group name) is known: the plan can
  //           take them out of the pilot and put each device in its group
  //   none  — no country, or a country with no device group name
  // What cannot form a person (a device with no primary user, not in Intune,
  // not Windows; a nested group) is LOOSE: listed, never planned.
  function pilotPeople(input, rows, members, rowsOfUser, entraById, managedByDev) {
    const held = input.held || new Set();
    const pilotOfDev = new Map(), pilotOfUser = new Map();
    for (const x of members) (x.kind === "device" ? pilotOfDev : x.kind === "user" ? pilotOfUser : new Map()).set(x.id, x);
    const entraByDev = new Map([...entraById.values()].map((e) => [lc(e.deviceId || ""), e]));
    const winOf = new Map();
    for (const m of input.managed || []) if (m.userId) { const k = lc(m.userId); if (!winOf.has(k)) winOf.set(k, []); winOf.get(k).push(m); }
    const byUser = new Map(), loose = [];
    const person = (uid, upn) => {
      if (byUser.has(uid)) return byUser.get(uid);
      const p = { key: `p|${uid}`, userId: uid, upn: upn || uid, userPilots: [], devices: [] };
      byUser.set(uid, p);
      return p;
    };
    for (const x of members) {
      if (x.kind === "user") { person(x.id, x.name).userPilots = x.groups.slice(); continue; }
      if (x.kind === "device") {
        const m = x.devId ? managedByDev.get(x.devId) : null;
        if (!m || !m.userId || (m.operatingSystem && lc(m.operatingSystem) !== "windows")) { loose.push(x); continue; }
        person(lc(m.userId), m.userPrincipalName || "");
        continue;
      }
      loose.push(x);
    }
    const people = [...byUser.values()].map((p) => {
      const rs = rowsOfUser.get(p.userId) || [];
      const r = rs.find((y) => !y.pilot) || rs[0] || null;
      p.devices = (winOf.get(p.userId) || []).map((m) => {
        const e = m.azureADDeviceId ? entraByDev.get(lc(m.azureADDeviceId)) : null;
        const id = e ? lc(e.id) : null;
        const pm = id ? pilotOfDev.get(id) : null;
        return { id, name: m.deviceName || (e && e.displayName) || m.id, pilots: pm ? pm.groups.slice() : [], held: !!(id && held.has(id)), noEntra: !id,
          inGroup: !!(id && r && r.have.has(id)) };
      }).sort((a, b) => (b.pilots.length - a.pilots.length) || lc(a.name).localeCompare(lc(b.name)));
      if (!p.upn || p.upn === p.userId) { const m = (winOf.get(p.userId) || [])[0]; if (m && m.userPrincipalName) p.upn = m.userPrincipalName; }
      const u = pilotOfUser.get(p.userId);
      if (u && u.upn) p.upn = u.upn;
      Object.assign(p, r ? { rowKey: r.key, country: r.country, region: r.region, userGroupName: r.userGroupName, deviceGroupName: r.deviceGroupName || "",
        dg: r.dg ? { id: lc(r.dg.id), name: r.dg.displayName } : null, dgNested: !!r.dgNested, ugNested: !!r.ugNested,
        waveUserName: r.wave.userName, waveDeviceName: r.wave.deviceName } : {});
      if (!r) Object.assign(p, { state: "none", why: "in no country group of the table — no wave to be ready for; stays in the pilot" });
      else if (!r.deviceGroupName && p.devices.some((d) => d.id && !d.held)) Object.assign(p, { state: "none", why: `${r.country} has no device group name — ${r.iso3Source || "set one under ⚙️"}` });
      else Object.assign(p, { state: "ready" });
      p.inPilot = p.userPilots.length + p.devices.filter((d) => d.pilots.length).length;
      return p;
    }).filter((p) => p.userPilots.length || p.devices.some((d) => d.pilots.length))
      .sort((a, b) => lc(a.upn).localeCompare(lc(b.upn)));
    return { people, loose };
  }
  // The plan for "ready for the wave" (10649, option A): per person, out of
  // every pilot group, and each Windows device into its country device group
  // (created first when it does not exist). Order: create → add → take the
  // devices out of the device pilots (each only after its country add read
  // back clean — needsOk) → take the users out of the user pilots. A device
  // in the device exclusion group (⊘) is taken out of the pilot but never
  // added: it stays on the old set.
  function planPilotsReady(pm, keys, cfg) {
    const want = new Set(keys || []);
    const people = ((pm && pm.people) || []).filter((p) => want.has(p.key));
    const ops = [], skipped = [], warnings = [];
    const whoOf = (list) => list.length <= 3 ? list.join(", ") : `${list.slice(0, 3).join(", ")} +${list.length - 3}`;
    const adds = new Map(), devOut = new Map(), userOut = new Map();
    for (const p of people) {
      if (p.state !== "ready") { skipped.push(`${p.upn}: ${p.why}`); continue; }
      for (const g of p.userPilots) {
        if (!userOut.has(g.id)) userOut.set(g.id, { group: g, list: [] });
        userOut.get(g.id).list.push({ id: p.userId, name: p.upn, upn: p.upn });
      }
      for (const d of p.devices) {
        const needAdd = !!(d.id && !d.held && !d.inGroup);
        if (needAdd) {
          if (!adds.has(p.rowKey)) adds.set(p.rowKey, { p, list: [] });
          adds.get(p.rowKey).list.push(d);
        }
        if (d.held && d.pilots.length) warnings.push(`${d.name} is in the device exclusion group — out of the pilot, it stays on the old set and is not added to ${p.deviceGroupName}`);
        for (const g of d.pilots) {
          const k = `${g.id}|${needAdd ? p.rowKey : "-"}`;
          if (!devOut.has(k)) devOut.set(k, { group: g, rowKey: needAdd ? p.rowKey : null, list: [] });
          devOut.get(k).list.push(d);
        }
      }
    }
    const addIdx = new Map();
    for (const [rowKey, { p, list }] of adds) {
      let ref = p.dg;
      if (!ref) {
        ops.push({ type: "create", key: `ready|${rowKey}`, name: p.deviceGroupName, who: p.country,
          description: String((cfg && cfg.deviceGroupDescription) || DEFAULTS.deviceGroupDescription).replace("{userGroup}", p.userGroupName) });
        ref = { ref: p.deviceGroupName, name: p.deviceGroupName };
      }
      addIdx.set(rowKey, ops.length);
      ops.push({ type: "add", key: `ready|${rowKey}`, group: ref, ids: list.map((d) => d.id), memberKind: "device", who: whoOf(list.map((d) => d.name)),
        label: `${list.length} device${list.length === 1 ? "" : "s"} into ${p.country}'s device group`, objs: list.map((d) => ({ id: d.id, name: d.name })) });
    }
    for (const { group, rowKey, list } of devOut.values()) {
      ops.push({ type: "remove", key: `ready|${group.id}|device`, group: { id: group.id, name: group.name }, ids: list.map((d) => d.id), memberKind: "device", who: whoOf(list.map((d) => d.name)),
        label: `${list.length} device${list.length === 1 ? "" : "s"} out of the pilot`, objs: list.map((d) => ({ id: d.id, name: d.name })),
        needsOk: rowKey ? [addIdx.get(rowKey)] : undefined });
    }
    for (const { group, list } of userOut.values()) {
      ops.push({ type: "remove", key: `ready|${group.id}|user`, group: { id: group.id, name: group.name }, ids: list.map((x) => x.id), memberKind: "user", who: whoOf(list.map((x) => x.name)),
        label: `${list.length} user${list.length === 1 ? "" : "s"} out of the pilot`, objs: list });
    }
    return { ops, skipped, warnings, hasRemoval: ops.some((o) => o.type === "remove"), pilotsReady: true };
  }
  // ---------------------------------------------------------- left out --
  // 🕳 (10642, Mihai: "I need a way to know who is getting left out";
  // layout A off the mockup). Who and what the waves do not reach:
  //   users    — in a country group of the table, with no Windows device by
  //              Intune primary user (they get the user wave only), each
  //              with what Intune does have for them (any platform)
  //   noCountry — Windows devices whose primary user is in no country
  //              group of the table
  //   noPrimary — Windows devices with no primary user
  //   noEntra  — a country's devices with no Entra object (cannot be members)
  //   held     — a country's devices in the device exclusion group (⊘)
  function leftOutOf(input, rows, now, staleMs, entraByDeviceId, placed, ownerUsers) {
    const osByUser = new Map();
    for (const m of input.managedAll || input.managed || []) {
      if (!m.userId || lc(m.operatingSystem) === "windows") continue;
      const k = lc(m.userId), os = m.operatingSystem || "other";
      if (!osByUser.has(k)) osByUser.set(k, {});
      osByUser.get(k)[os] = (osByUser.get(k)[os] || 0) + 1;
    }
    // a user who owns (in Entra) a device with no primary user has it (10655)
    const winUsers = new Set((input.managed || []).filter((m) => m.userId).map((m) => lc(m.userId)).concat([...(ownerUsers || [])]));
    const users = [], noEntra = [], held = [];
    const inCountry = new Set();
    for (const r of rows) {
      const list = r.ug ? (input.usersByGroup.get(lc(r.ug.id)) || []) : [];
      for (const u of list) {
        const id = lc(u.id);
        inCountry.add(id);
        if (!winUsers.has(id)) users.push({ id, upn: u.userPrincipalName || u.id, rowKey: r.key, country: r.country, region: r.region, has: osByUser.get(id) || {},
          sid: u.onPremisesSecurityIdentifier || "", sam: u.onPremisesSamAccountName || "" });
      }
      for (const d of r.devices) {
        const x = { name: d.name, upn: d.upn, userId: d.userId, lastSync: d.lastSync, stale: d.stale, rowKey: r.key, country: r.country, region: r.region };
        if (!d.objId) noEntra.push(Object.assign(x, { why: d.problem }));
        else if (d.held) held.push(x);
      }
    }
    const noCountry = [], noPrimary = [];
    for (const m of input.managed || []) {
      const last = Date.parse(m.lastSyncDateTime || "");
      const e = m.azureADDeviceId ? entraByDeviceId.get(lc(m.azureADDeviceId)) : null;
      const x = { name: m.deviceName || m.id, upn: m.userPrincipalName || "", userId: lc(m.userId || ""), lastSync: m.lastSyncDateTime || null,
        stale: Number.isFinite(last) && now - last > staleMs, entra: !!e };
      if (!m.userId) { if (!(placed && placed.has(lc(m.id)))) noPrimary.push(x); }
      else if (!inCountry.has(lc(m.userId)) && !(placed && placed.has(lc(m.id)))) {
        // 10659: say who the user really is and why nothing placed the device
        const pu = (input.primaryUsers && input.primaryUsers.get(lc(m.userId))) || null;
        const real = realUpnOf(m.userPrincipalName);
        x.upn = real || x.upn;
        x.deleted = !!real || !!(pu && pu.deleted);
        x.found = pu ? !!pu.found : null;
        x.usageLocation = pu ? pu.usageLocation || "" : "";
        const code = String(x.name).slice(0, 3).toUpperCase();
        const nameHint = /^[A-Z]{3}$/.test(code) && [...ISO3.values()].includes(code) ? `the name says ${countryName3(code)} (${code}), not in the table` : "no country code in the name";
        x.detail = [x.deleted ? (pu && pu.found ? "primary user deleted — the live account is in no country group of the table" : real ? "primary user deleted — no live account with that name" : "primary user deleted") : "", nameHint, x.usageLocation ? `usage location ${x.usageLocation} — not in the table` : ""].filter(Boolean).join(" · ");
        noCountry.push(x);
      }
    }
    const byName = (a, b) => lc(a.upn || a.name).localeCompare(lc(b.upn || b.name));
    return { users: users.sort(byName), noCountry: noCountry.sort(byName), noPrimary: noPrimary.sort(byName), noEntra, held };
  }
  function leftOutCsv(model, region, logons) {
    const L = model.leftOut, rows = [["Kind", "Region", "Country", "User", "Device", "Why", "What Intune has", "Last sync", "Logged on to (Defender, 30 days)"]];
    const inR = (x) => !region || x.region === region;
    const has = (h) => Object.entries(h || {}).map(([os, n]) => `${os} ${n}`).join(" · ") || "nothing in Intune";
    const lg = (u) => { if (!logons || !logons.has(u.id)) return ""; const l = logons.get(u.id); return l.length ? l.map((x) => `${x.device} (${x.what})`).join(" · ") : "no logon found"; };
    L.users.filter(inR).forEach((u) => rows.push(["user", u.region, u.country, u.upn, "", "no Windows device (Intune primary user)", has(u.has), "", lg(u)]));
    L.noEntra.filter(inR).forEach((d) => rows.push(["device", d.region, d.country, d.upn, d.name, d.why || "no Entra object", "", d.lastSync || ""]));
    L.held.filter(inR).forEach((d) => rows.push(["device", d.region, d.country, d.upn, d.name, "in the device exclusion group — stays on the old set", "", d.lastSync || ""]));
    L.noCountry.forEach((d) => rows.push(["device", "", "", d.upn, d.name, `primary user in no country group of the table${d.detail ? ` — ${d.detail}` : ""}`, "", d.lastSync || ""]));
    L.noPrimary.forEach((d) => rows.push(["device", "", "", "", d.name, "no primary user", "", d.lastSync || ""]));
    return rows.map((x) => x.map(csvCell).join(",")).join("\r\n");
  }

  // --------------------------------------------------------------- plan --
  // opts: { fill, nestUsers, nestDevices, removals, description }
  // ops, in the order they run: per country create → add → remove → nest.
  function planOps(model, keys, opts, cfg) {
    const o = opts || {};
    const ops = [], skipped = [], warnings = [];
    const pick = model.rows.filter((r) => keys.has(r.key));
    const at = new Map();   // row key → the index of its steps, for needsOk
    const mark = (r, what) => { if (!at.has(r.key)) at.set(r.key, {}); at.get(r.key)[what] = ops.length - 1; };
    for (const r of pick) {
      const tag = `${r.country} (${r.userGroupName})`;
      if (!r.ug) { skipped.push(`${tag}: the user group is not in this tenant`); continue; }
      if (r.migrated) { skipped.push(`${tag}: 🧪 migrated into ${r.parentCountry || "its country"} — its users and devices are in the wave through it`); continue; }
      let dgRef = r.dg ? { id: lc(r.dg.id), name: r.dg.displayName } : null;
      if (o.fill) {
        if (!r.deviceGroupName) skipped.push(`${tag}: ${r.iso3Source}`);
        else if (!r.dg && !r.want.size) skipped.push(`${tag}: no Windows device with a primary user in this group — ${r.deviceGroupName} not created`);
        else {
          if (!r.dg) {
            ops.push({ type: "create", key: r.key, name: r.deviceGroupName, description: String((cfg && cfg.deviceGroupDescription) || DEFAULTS.deviceGroupDescription).replace("{userGroup}", r.userGroupName) });
            dgRef = { ref: r.deviceGroupName, name: r.deviceGroupName };
          }
          if (r.add.length) { ops.push({ type: "add", key: r.key, group: dgRef, ids: r.add.slice(), label: `${r.add.length} device${r.add.length === 1 ? "" : "s"}` }); mark(r, "devAdd"); }
        }
      }
      if (o.removals && r.dg && r.remove.length) ops.push({ type: "remove", key: r.key, group: { id: lc(r.dg.id), name: r.dg.displayName }, ids: r.remove.slice(), label: `${r.remove.length} device${r.remove.length === 1 ? "" : "s"}: ${r.removeNames.slice(0, 5).join(", ")}${r.remove.length > 5 ? " …" : ""}` });
      if (o.nestUsers && !r.ugNested && r.batch) skipped.push(`${tag}: added in batches — 🧪 its user group is nested by "Finish" after the last batch`);
      else if (o.nestUsers && !r.ugNested) {
        if (!r.wave.user) skipped.push(`${tag}: ${r.wave.userName || "the user wave"} does not exist — create it in 🌊 first`);
        else {
          ops.push({ type: "nest", key: r.key, parent: { id: lc(r.wave.user.id), name: r.wave.user.displayName }, child: { id: lc(r.ug.id), name: r.ug.displayName }, kind: "user", size: r.users });
          mark(r, "userNest");
          if (r.users > cfg.largeNest) warnings.push(`${r.ug.displayName} brings ${r.users} users into ${r.wave.user.displayName} at once`);
        }
      }
      if (o.nestDevices && !r.dgNested) {
        if (!r.wave.device) skipped.push(`${tag}: ${r.wave.deviceName || "the device wave"} does not exist — create it in 🌊 first`);
        else if (!dgRef) skipped.push(`${tag}: no device group to nest yet — tick "create & fill"`);
        else {
          const size = r.want.size;
          ops.push({ type: "nest", key: r.key, parent: { id: lc(r.wave.device.id), name: r.wave.device.displayName }, child: dgRef, kind: "device", size });
          mark(r, "devNest");
          if (size > cfg.largeNest) warnings.push(`${dgRef.name} brings ${size} devices into ${r.wave.device.displayName} at once`);
        }
      }
    }
    // 🧪 A pilot migrated into the country it overlaps (10656, option B):
    // once the country's user group is in the wave (now, or read back in
    // this plan), the pilot's own route is taken down — its users put in
    // directly come out, its groups come out of the waves — each step only
    // after the country's step it depends on read back clean (needsOk).
    const migrate = [];
    for (const P of pick) {
      if (P.pilot || !P.ug) continue;
      for (const C of model.rows.filter((x) => x.pilot && !x.migrated && x.parentKey === P.key && x.batch)) {
        const tag = `🧪 ${C.country} (${C.userGroupName})`;
        const who = `${C.country} · migrate`;
        const idx = at.get(P.key) || {};
        const userIn = P.ugNested || idx.userNest != null;
        if (C.outsideParent && C.outsideParent.length) { skipped.push(`${tag}: not migrated — ${C.outsideParent.length} of its users ${C.outsideParent.length === 1 ? "is" : "are"} not in ${P.userGroupName} (${C.outsideParent.slice(0, 3).join(", ")}${C.outsideParent.length > 3 ? " …" : ""}); they would leave the wave`); continue; }
        if (!userIn) { skipped.push(`${tag}: migrated into the wave only when ${P.userGroupName} goes into it — tick "nest user groups"`); continue; }
        const needU = idx.userNest != null ? [idx.userNest] : undefined;
        const mine = [];
        const b = C.batch;
        const waiting = b.finished ? 0 : Math.max(0, b.N - b.inCount);
        if (waiting) warnings.push(`${waiting} ${C.country} user${waiting === 1 ? "" : "s"} not in a batch yet come in with ${P.country} at once — the remaining batches are skipped`);
        if (b.direct.length && C.wave.user) {
          ops.push({ type: "remove", key: C.key, group: { id: lc(C.wave.user.id), name: C.wave.user.displayName }, ids: b.direct.slice(), label: `${b.direct.length} ${C.country} user${b.direct.length === 1 ? "" : "s"} put in directly — in through ${P.ug.displayName} now`, memberKind: "user", who, needsOk: needU, migrate: true });
          mine.push(ops.length - 1);
        }
        if (C.ugNested && C.wave.user) {
          ops.push({ type: "unnest", key: C.key, parent: { id: lc(C.wave.user.id), name: C.wave.user.displayName }, child: { id: lc(C.ug.id), name: C.ug.displayName }, kind: "user", who, needsOk: needU, migrate: true });
          mine.push(ops.length - 1);
        }
        if (C.dg && C.dgNested && C.wave.device) {
          const devIn = P.dgNested || idx.devNest != null;
          if (!devIn) skipped.push(`${tag}: ${C.dg.displayName} stays in ${C.wave.device.displayName} — ${P.deviceGroupName || "the country's device group"} is not in it yet (tick "nest device groups")`);
          else {
            const need = [idx.devNest, idx.devAdd].filter((x) => x != null);
            ops.push({ type: "unnest", key: C.key, parent: { id: lc(C.wave.device.id), name: C.wave.device.displayName }, child: { id: lc(C.dg.id), name: C.dg.displayName }, kind: "device", who, needsOk: need.length ? need : undefined, migrate: true });
            mine.push(ops.length - 1);
          }
        }
        migrate.push({ suffix: C.suffix, country: C.country, into: P.country, ops: mine });
      }
    }
    return { ops, skipped, warnings, migrate, hasRemoval: ops.some((x) => x.type === "remove" || x.type === "unnest") };
  }
  // The next batch of a pilot (10640): its users straight into the user
  // wave, then the device group (created if need be) filled with their
  // devices and nested in the device wave if it is not yet.
  function planBatch(model, key, cfg) {
    const r = model.rows.find((x) => x.key === key);
    const ops = [], skipped = [], warnings = [];
    if (!r || !r.batch) return { ops, skipped: ["not a pilot in batches"], warnings, hasRemoval: false };
    const b = r.batch, nb = b.next;
    const tag = `${r.country} (${r.userGroupName})`;
    const who = `${r.country} · batch ${nb ? nb.n : "—"} of ${b.K}`;
    if (!nb) return { ops, skipped: [b.finished ? `${tag}: finished — the group is nested in the wave` : `${tag}: every batch is in — 🧪 Finish nests the group`], warnings, hasRemoval: false };
    if (!r.wave.user) return { ops, skipped: [`${tag}: ${r.wave.userName || "the user wave"} does not exist — create it in 🌊 first`], warnings, hasRemoval: false };
    if (nb.toAdd.length) ops.push({ type: "add", key: r.key, group: { id: lc(r.wave.user.id), name: r.wave.user.displayName }, ids: nb.toAdd.map((u) => u.id), label: `${nb.toAdd.length} user${nb.toAdd.length === 1 ? "" : "s"} — batch ${nb.n} of ${b.K}`, memberKind: "user", who,
      objs: nb.toAdd.map((u) => ({ id: u.id, userPrincipalName: u.upn })) });
    const devs = nb.devices.filter((d) => d.objId && !d.held && !(r.have && r.have.has(d.objId)));
    nb.devices.filter((d) => !d.objId).forEach((d) => skipped.push(`${d.name}: ${d.problem}`));
    nb.devices.filter((d) => d.held).forEach((d) => skipped.push(`${d.name}: in the device exclusion group — stays on the old set`));
    let dgRef = r.dg ? { id: lc(r.dg.id), name: r.dg.displayName } : null;
    if (devs.length) {
      if (!r.deviceGroupName) skipped.push(`${tag}: ${r.iso3Source}`);
      else {
        if (!r.dg) {
          ops.push({ type: "create", key: r.key, name: r.deviceGroupName, description: String((cfg && cfg.deviceGroupDescription) || DEFAULTS.deviceGroupDescription).replace("{userGroup}", r.userGroupName), who });
          dgRef = { ref: r.deviceGroupName, name: r.deviceGroupName };
        }
        ops.push({ type: "add", key: r.key, group: dgRef, ids: devs.map((d) => d.objId), label: `${devs.length} device${devs.length === 1 ? "" : "s"} of batch ${nb.n}`, memberKind: "device", who });
      }
    }
    if (dgRef && !r.dgNested) {
      if (!r.wave.device) skipped.push(`${tag}: ${r.wave.deviceName || "the device wave"} does not exist — create it in 🌊 first`);
      else ops.push({ type: "nest", key: r.key, parent: { id: lc(r.wave.device.id), name: r.wave.device.displayName }, child: dgRef, kind: "device", size: devs.length, who });
    }
    const large = (cfg && cfg.largeNest) || DEFAULTS.largeNest;
    if (nb.toAdd.length > large) warnings.push(`batch ${nb.n} brings ${nb.toAdd.length} users into ${r.wave.user.displayName} at once`);
    return { ops, skipped, warnings, hasRemoval: false, batch: nb.n };
  }
  // After the last batch: nest the pilot group (new users flow in), then
  // take its users out of the wave's direct members — they are in through
  // the group now. The removal is typed.
  function planFinish(model, key) {
    const r = model.rows.find((x) => x.key === key);
    const ops = [], skipped = [], warnings = [];
    if (!r || !r.batch) return { ops, skipped: ["not a pilot in batches"], warnings, hasRemoval: false };
    const who = `${r.country} · finish`;
    if (!r.wave.user) return { ops, skipped: [`${r.wave.userName || "the user wave"} does not exist`], warnings, hasRemoval: false };
    if (!r.batch.finished) ops.push({ type: "nest", key: r.key, parent: { id: lc(r.wave.user.id), name: r.wave.user.displayName }, child: { id: lc(r.ug.id), name: r.ug.displayName }, kind: "user", size: r.users, who });
    if (r.batch.direct.length) ops.push({ type: "remove", key: r.key, group: { id: lc(r.wave.user.id), name: r.wave.user.displayName }, ids: r.batch.direct.slice(), label: `${r.batch.direct.length} user${r.batch.direct.length === 1 ? "" : "s"} — in through ${r.ug.displayName} now`, memberKind: "user", who });
    if (r.batch.next) warnings.push(`${r.batch.N - r.batch.inCount} of ${r.batch.N} users are not in yet — nesting the group brings them in at once`);
    return { ops, skipped, warnings, hasRemoval: ops.some((x) => x.type === "remove") };
  }
  function batchCsv(row) {
    const rows = [["Batch", "State", "User", "Devices"]];
    if (row && row.batch) for (const b of row.batch.batches) for (const u of b.users) rows.push([b.n, b.state, u.upn, row.devices.filter((d) => d.userId === u.id).map((d) => d.name).join(" ")]);
    return rows.map((x) => x.map(csvCell).join(",")).join("\r\n");
  }
  // The inverse of what a run DID (not of what it planned), for undo.
  function inverseOf(done) {
    const out = [];
    for (const d of (done || []).slice().reverse()) {
      const what = (n) => `${n} ${d.memberKind === "user" ? "user" : "device"}${n === 1 ? "" : "s"}`;
      const kin = { memberKind: d.memberKind || "device", who: d.who || null, fromExclusion: !!d.fromExclusion, objs: d.objs };
      if (d.type === "add" && d.ids.length) out.push(Object.assign({ type: "remove", key: d.key, group: d.group, ids: d.ids.slice(), label: `${what(d.ids.length)} this run added` }, kin));
      else if (d.type === "remove" && d.ids.length) out.push(Object.assign({ type: "add", key: d.key, group: d.group, ids: d.ids.slice(), label: `${what(d.ids.length)} this run removed` }, kin));
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
  const readDeviceIds = async (gid, kind) => new Set((await Graph.readAll(`/groups/${enc(gid)}/members/microsoft.graph.${kind === "user" ? "user" : "device"}?$select=id&$top=999`, { scopes: Graph.SCOPES.groups, retry: true }) || []).map((d) => lc(d.id)));
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
      // a step that needs an earlier one to have gone through clean (10649:
      // a device leaves the pilot only once it is in its country group)
      if (op.needsOk && op.needsOk.some((j) => j != null && !(results[j] && results[j].ok && results[j].verified))) {
        const why = "skipped — the step it depends on did not go through clean";
        if (L) L.skip(i, why);
        results.push({ op, ok: false, skipped: true, note: why });
        continue;
      }
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
            const now = await readDeviceIds(gid, op.memberKind);
            verified = op.type === "add" ? r.done.every((id) => now.has(lc(id))) : r.done.every((id) => !now.has(lc(id)));
            if (!verified) note = "the read-back does not show every change yet (Entra can take a moment) — read again to check";
          } catch (e) { note = "written, but the read-back failed: " + msg(e).slice(0, 160); }
          const group = { id: gid, name: (op.group && op.group.name) || "" };
          if (r.done.length) doneOps.push({ type: op.type, key: op.key, group, ids: r.done.slice(), memberKind: op.memberKind || "device", who: op.who || null, fromExclusion: !!op.fromExclusion,
            objs: op.objs ? op.objs.filter((x) => r.done.some((id) => lc(id) === lc(x.id))) : undefined });
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
      // 🧪 a pilot group's members (10647) — out, or back in by an undo
      const pg = (d.type === "add" || d.type === "remove") && (input.pilots || []).find((g) => g.id === lc(d.group.id));
      if (pg) {
        const list = d.memberKind === "user" ? pg.users : pg.devices;
        for (const id of d.ids.map(lc)) {
          const i = list.findIndex((x) => x.id === id);
          if (d.type === "remove" && i >= 0) list.splice(i, 1);
          if (d.type === "add" && i < 0) {
            const o = (d.objs || []).find((x) => lc(x.id) === id) || { id, name: id };
            list.push(d.memberKind === "user" ? { id, upn: o.upn || o.name, name: o.name } : { id, deviceId: "", name: o.name });
          }
        }
        continue;
      }
      if ((d.type === "add" || d.type === "remove") && d.memberKind === "user") {
        if (input.waveUsers && input.waveUsers.has(lc(d.group.id))) { const set = input.waveUsers.get(lc(d.group.id)); d.ids.forEach((id) => d.type === "add" ? set.add(lc(id)) : set.delete(lc(id))); }
        continue;
      }
      if ((d.type === "add" || d.type === "remove") && input.heldGroup && lc(d.group.id) === input.heldGroup.id) {
        if (!input.held) input.held = new Set();
        d.ids.forEach((id) => d.type === "add" ? input.held.add(lc(id)) : input.held.delete(lc(id)));
        continue;
      }
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
  // how a device got its country (10655)
  const VIA_TEXT = (d) => d.outside ? `${d.deletedUser ? "deleted primary user — " : "primary user in no country group — "}${d.via === "real" ? `live account ${d.upn} is in this country group` : d.via === "userloc" ? `${d.upn}'s usage location ${d.usageLocation}` : `its name (${String(d.name).slice(0, 3).toUpperCase()}…)`}`
    : d.via === "owner" ? `Entra owner ${d.owner} (no Intune primary user)` : d.via === "location" ? `Entra owner ${d.owner}'s usage location (no primary user)` : d.via === "name" ? `its name (${String(d.name).slice(0, 3).toUpperCase()}…) — no primary user${d.owner ? `, owner ${d.owner} in no country` : ", no Entra owner"}` : "Intune primary user";
  function csv(model) {
    const rows = [["Region", "Country", "User group", "Device group", "Device", "Primary user", "Last sync", "Status", "Country by"]];
    for (const r of model.rows) {
      for (const d of r.devices) {
        const st = !d.objId ? d.problem : d.held ? (r.have.has(d.objId) ? "excluded — to take out" : "excluded — kept out") : r.have.has(d.objId) ? "in group" : "to add";
        rows.push([r.region, r.country, r.userGroupName, r.deviceGroupName || "", d.name, d.via === "primary" || !d.via || d.outside ? d.upn : "", d.lastSync || "", `${st}${d.stale ? " · stale" : ""}${d.others.length ? " · also in " + d.others.join(", ") : ""}${d.nameSays ? ` · the name says ${d.nameSays}` : ""}`, VIA_TEXT(d)]);
      }
      r.remove.forEach((id, n) => rows.push([r.region, r.country, r.userGroupName, r.deviceGroupName || "", r.removeNames[n], "", "", "to remove (primary user not in the country group)"]));
    }
    return rows.map((x) => x.map(csvCell).join(",")).join("\r\n");
  }

  return {
    DEFAULTS, normConfig, parseMap, formatMap, parseOverrides, formatOverrides,
    iso3Of, countryName, countryRows, realUpnOf, isAvdName, parsePilots, suggestDeviceSuffix, addPilot, readInput, compute, planOps, inverseOf,
    addMembers, removeMembers, applyOps, patchInput, csv, VIA_TEXT, batchOf, planBatch, planFinish, batchCsv, leftOutCsv, pilotsOf, planPilotsReady, logonKql, readLogons, logonsFor,
    _setWait: (fn) => { wait = fn; },
  };
})();

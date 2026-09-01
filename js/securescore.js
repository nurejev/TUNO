// ======================================================================
// T21 — 📊 Secure Score visualizer (R02). The tenant's Microsoft Secure
// Score, read over Graph and made explorable: the score today, where it
// sits against comparable tenants, the per-category breakdown, what moved
// since the oldest reading Graph still holds, and — the point of the tool —
// WHICH IMPROVEMENT ACTIONS BUY THE MOST POINTS FOR THE LEAST USER PAIN.
//
// Shaped after GCIT's Export-SecureScoreReports (Elliot Munro,
// gcit.com.au/knowledge-base/export-customers-microsoft-secure-scores-to-
// csv-and-html-reports) — the gauge, the comparison bars, the category
// bars with global and similar markers, the 90-day timeline, the
// improved/regressed split and the control cards are its report's
// anatomy, rebuilt in the browser against TUNO's own read layer. That
// script is a partner-side PowerShell sweep across GDAP customers; this
// is one signed-in tenant, in a tab, with no export directory.
//
// THIS IS THE ONE READER of security/secureScores in the house — the T05
// rule applied to a second surface. T20 correlates its own best-practice
// checks against these gaps and must be looking at the same numbers, so
// SecureScore.collect() is the seam it calls rather than a second read
// that could disagree with this screen about one tenant.
//
// GRAPH REMEMBERS ABOUT NINETY DAYS. That is the whole reason this tool
// has an import: a snapshot exported today can be uploaded next quarter
// and the timeline extends past what the tenant can still be asked. The
// snapshot is versioned JSON carrying the readings AND the profiles they
// were read with, because a control's title and max score change under
// you and a two-year-old point rendered with today's profile would be
// quietly re-labelled.
//
// A SNAPSHOT FROM ANOTHER TENANT IS REFUSED BY ID, not merged and
// caveated. Two tenants' scores in one timeline is not a comparison, it
// is a wrong graph. Same-day collisions resolve to the LIVE reading and
// say so.
//
// THE CHEAPEST-POINTS ORDER IS OURS, NOT MICROSOFT'S, and says so
// wherever it renders: points still available, weighted down by the user
// impact and implementation cost Microsoft publishes on the control.
// Microsoft's own stack ranking is carried beside it as `rank`.
//
// SecurityEvents.Read.All, asked for on the click — ENCA's incremental
// consent, the same model every reading tool here uses. Reads only.
// ======================================================================
const SecureScore = (() => {
  "use strict";

  // The scope this tool costs, named where it is used. It is NOT added to
  // Graph.SCOPES: that table is the Intune surface, and a security-graph
  // read borrowing an Intune entry is how a scope ends up granted for a
  // tool nobody audited it for.
  const SCOPE = ["SecurityEvents.Read.All"];

  // The five categories Microsoft files controls under. Device and Apps
  // are the endpoint half — the half T20 has checks for.
  const CATEGORIES = ["Identity", "Device", "Apps", "Data", "Infrastructure"];
  const ENDPOINT_CATEGORIES = ["Device", "Apps"];

  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const dayOf = (iso) => String(iso || "").slice(0, 10);

  // ------------------------------------------------ Microsoft's markup --
  //
  // THE CATALOGUE TEXT IS HTML, and nobody says so. Graph returns
  // description, remediation and remediationImpact containing <br/>,
  // <strong>, <p>, <ol><li>, <a href>, &lsquo; and &rsquo; — sometimes
  // malformed, with an entity opening inside a tag it does not close.
  //
  // Two wrong answers, both tempting. Rendering it as HTML hands a third
  // party's markup an injection point in a page holding a tenant token,
  // for a string TUNO has no control over. Escaping it and printing it —
  // which is what 10500 and 10501 did — puts "&lsquo;<strong>Enable
  // mailbox intelligence&rsquo;</strong>" on the card, unreadable.
  //
  // So the markup is READ and thrown away, and the text inside it is kept:
  // structure becomes newlines and bullets, a link keeps its label AND its
  // href (the URL is frequently the actual instruction), entities are
  // decoded, and the plain text that comes out is escaped on render like
  // any other string. No markup of theirs ever reaches the DOM.
  //
  // It lives in the engine and is applied in controlsFrom, so the screen,
  // the Markdown, the CSV and T20's correlation all read one clean shape —
  // the alternative is four places each cleaning it slightly differently.
  const ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
    hellip: "…", ndash: "–", mdash: "—", bull: "•",
    middot: "·", times: "×", reg: "®", copy: "©", trade: "™",
  };
  function plain(s) {
    let t = String(s ?? "");
    if (!t) return "";
    // A link is worth more than its label: Microsoft writes "see <a
    // href=...>the portal</a>" where the href is the step.
    t = t.replace(/<\s*a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi,
      (m, href, label) => `${String(label).replace(/<[^>]*>/g, "").trim() || "link"} (${href})`);
    t = t.replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*li[^>]*>/gi, "\n• ")
      .replace(/<\s*\/\s*(p|div|tr|li|h[1-6]|ol|ul)\s*>/gi, "\n")
      .replace(/<\s*(p|div|ol|ul)[^>]*>/gi, "\n");
    t = t.replace(/<[^>]*>/g, "");                       // every tag that is left
    t = t.replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&([a-z]+);/gi, (m, n) => (Object.prototype.hasOwnProperty.call(ENTITIES, n.toLowerCase()) ? ENTITIES[n.toLowerCase()] : m));
    return t.replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  // One line, for a CSV cell, a Markdown table cell or a Markdown bullet —
  // all three of which a newline breaks.
  const flat = (s) => plain(s).replace(/\s*\n\s*/g, " · ").replace(/ +/g, " ").trim();

  // ------------------------------------------------------------- read --
  //
  // TWO SURFACES. secureScores is the daily readings with the per-control
  // scores; secureScoreControlProfiles is the catalogue that gives each
  // control a title, a max score, remediation text and a portal link.
  // Without the profiles a control is a bare id like
  // "MDATP_Onboarding_Coverage", which is not an answer anybody can act
  // on — so a profile read that fails is SAID, and the controls render
  // under their ids with the reason attached.
  //
  // v1.0 FIRST, beta only to fill what v1.0 left blank. The GCIT script
  // reads beta outright because the Defender for Endpoint controls carry
  // proper titles there; that is true and it is also an unstable base for
  // the whole catalogue (read layer rule 5). So v1.0 is the answer, and
  // beta is asked ONLY when v1.0 returned a control with no title — the
  // narrow case, with the number of titles it filled reported rather than
  // silently absorbed.
  async function collect({ onStatus } = {}) {
    const status = (m) => { try { onStatus && onStatus(m); } catch (e) { /* a broken listener must not sink the read */ } };

    status("Reading the tenant's Secure Score history…");
    // $top=100 is Graph's own ceiling here and roughly the ninety-odd days
    // it keeps. Ascending by date is imposed locally: the service returns
    // newest-first and every chart below reads left to right.
    const raw = await Graph.readAll("/security/secureScores?$top=100", { scopes: SCOPE, retry: true });
    const history = raw
      .map(normalizeScore)
      .filter((s) => s && s.taken)
      .sort((a, b) => a.taken.localeCompare(b.taken));

    if (!history.length) {
      // NOT AN ERROR. A tenant Secure Score has never run for answers with
      // an empty collection, and reporting that as a failed read would send
      // somebody looking for a permission problem that is not there.
      return { history: [], latest: null, profiles: [], profileError: null, betaFilled: 0, empty: true, when: Date.now() };
    }

    status("Reading the control catalogue…");
    let profiles = [], profileError = null, betaFilled = 0;
    try {
      profiles = await Graph.readAll("/security/secureScoreControlProfiles?$top=999", { scopes: SCOPE, retry: true });
    } catch (e) {
      profileError = String((e && e.message) || e).slice(0, 240);
    }

    if (!profileError) {
      const byId = {};
      profiles.forEach((p) => { if (p && p.id) byId[String(p.id).toLowerCase()] = p; });
      const latest = history[history.length - 1];
      const untitled = (latest.controlScores || [])
        .map((c) => String(c.controlName || "").toLowerCase())
        .filter((id) => id && (!byId[id] || !byId[id].title));
      if (untitled.length) {
        status(`Filling ${untitled.length} untitled control${untitled.length === 1 ? "" : "s"} from beta…`);
        try {
          const b = await Graph.readAll(`${Graph.BETA}/security/secureScoreControlProfiles?$top=999`, { scopes: SCOPE, retry: true });
          for (const p of b) {
            const id = String((p && p.id) || "").toLowerCase();
            if (!id || !untitled.includes(id) || !p.title) continue;
            if (byId[id]) { Object.assign(byId[id], { title: p.title, remediation: byId[id].remediation || p.remediation, __beta: true }); }
            else { byId[id] = Object.assign({}, p, { __beta: true }); profiles.push(byId[id]); }
            betaFilled++;
          }
        } catch (e) { /* beta is the fallback, not the answer — an untitled control keeps its id */ }
      }
    }

    return {
      history, latest: history[history.length - 1],
      profiles, profileError, betaFilled, empty: false, when: Date.now(),
    };
  }

  // One daily reading, reduced to the fields anything here reads. Kept
  // deliberately flat: this shape is what the export writes and what an
  // upload is parsed back into, so it is a file format and not an
  // implementation detail.
  function normalizeScore(s) {
    if (!s) return null;
    const comp = {};
    for (const c of (s.averageComparativeScores || [])) {
      if (!c || !c.basis) continue;
      comp[c.basis] = c;
    }
    return {
      taken: s.createdDateTime || "",
      currentScore: num(s.currentScore),
      maxScore: num(s.maxScore),
      licensedUserCount: num(s.licensedUserCount),
      activeUserCount: num(s.activeUserCount),
      enabledServices: s.enabledServices || [],
      comparative: comp,
      controlScores: (s.controlScores || []).map((c) => ({
        controlName: c.controlName || "",
        controlCategory: c.controlCategory || "",
        description: c.description || "",
        score: num(c.score),
        // Some readings carry the per-control ceiling, some do not; the
        // profile is the reliable source and controlsFrom prefers it.
        scoreInBadge: num(c.scoreInBadge),
      })),
    };
  }

  const pct = (score, max) => (score == null || !max ? null : Math.round((score / max) * 1000) / 10);

  // Microsoft reports the comparison figures as an average score whose
  // unit the API does not state. In practice it is a PERCENTAGE — but a
  // value above 100 cannot be one, so that case is reported as points
  // rather than rendered as an impossible percentage. Never guess a unit
  // into a chart axis.
  function comparativeOf(latest, basis) {
    const c = latest && latest.comparative && latest.comparative[basis];
    if (!c) return null;
    const v = num(c.averageScore);
    if (v == null) return null;
    return { value: v, unit: v > 100 ? "points" : "percent", raw: c };
  }

  // ---------------------------------------------------- controls --------
  //
  // The latest reading's per-control scores, married to the catalogue.
  // maxScore comes from the PROFILE — the reading's own per-control
  // ceiling is not always present, and a gap computed against a missing
  // ceiling is a gap of NaN wearing a number's clothes.
  //
  // A deprecated control is carried with the flag rather than dropped:
  // it still holds points on an old reading, and silently removing it
  // makes an old snapshot's total disagree with its own control list.
  function controlsFrom(latest, profiles) {
    const byId = {};
    (profiles || []).forEach((p) => { if (p && p.id) byId[String(p.id).toLowerCase()] = p; });
    return ((latest && latest.controlScores) || []).map((c) => {
      const p = byId[String(c.controlName || "").toLowerCase()] || null;
      const max = p ? num(p.maxScore) : c.scoreInBadge;
      const score = c.score == null ? null : c.score;
      return {
        id: c.controlName,
        title: plain((p && p.title) || c.controlName),
        titled: !!(p && p.title),
        category: (p && p.controlCategory) || c.controlCategory || "",
        // Through the markup gate, once, here — see plain() above.
        description: plain(c.description),
        score, maxScore: max,
        points: (score == null || max == null) ? null : Math.round((max - score) * 10) / 10,
        remediation: plain((p && p.remediation) || ""),
        remediationImpact: plain((p && p.remediationImpact) || ""),
        actionUrl: (p && p.actionUrl) || "",
        actionType: (p && p.actionType) || "",
        service: (p && p.service) || "",
        tier: (p && p.tier) || "",
        userImpact: (p && p.userImpact) || "",
        implementationCost: (p && p.implementationCost) || "",
        threats: (p && p.threats) || [],
        rank: (p && num(p.rank)) != null ? num(p.rank) : 9999,
        deprecated: !!(p && p.deprecated),
        fromBeta: !!(p && p.__beta),
      };
    });
  }

  // A GAP IS A CONTROL WITH POINTS STILL ON THE TABLE. A control whose
  // score could not be read is NOT a gap — it is unknown, and it is
  // returned separately rather than counted as either.
  function gaps(controls) {
    return (controls || []).filter((c) => !c.deprecated && c.points != null && c.points > 0.05);
  }
  const unreadable = (controls) => (controls || []).filter((c) => c.points == null);

  // THE CHEAPEST POINTS FIRST — this tool's ordering, not Microsoft's.
  // Points available divided by a cost weight built from the two fields
  // Microsoft publishes about pain: userImpact and implementationCost.
  // A control that declares neither is treated as moderate, because
  // treating an unstated impact as low is how "quick wins" end up being
  // the change that breaks sign-in on Monday.
  //
  // TWO VOCABULARIES, BOTH REAL. The Graph reference documents these as
  // low / moderate / high; live tenants answer Low / Medium / High, and
  // very often the literal string "Unknown". Both spellings are mapped,
  // and Unknown lands on the same weight as an absent value — moderate —
  // rather than falling through a default nobody wrote down. Anything
  // still unrecognised also weighs moderate, and the screen prints
  // Microsoft's own word beside it so the reader can see what it said.
  const PAIN = { low: 1, moderate: 2, medium: 2, high: 4, unknown: 2, notapplicable: 2 };
  const painOf = (s) => {
    const k = String(s || "").toLowerCase().replace(/[^a-z]/g, "");
    return Object.prototype.hasOwnProperty.call(PAIN, k) ? PAIN[k] : PAIN.moderate;
  };
  // Did Microsoft actually state a level, or is this the default standing
  // in? The card says which, because "treated as moderate" and "Microsoft
  // says moderate" are different claims.
  const stated = (s) => {
    const k = String(s || "").toLowerCase().replace(/[^a-z]/g, "");
    return !!k && k !== "unknown" && k !== "notapplicable";
  };
  function value(c) {
    const cost = painOf(c.userImpact) + painOf(c.implementationCost);
    return Math.round(((c.points || 0) / cost) * 100) / 100;
  }
  function byValue(controls) {
    return gaps(controls)
      .map((c) => Object.assign({ value: value(c) }, c))
      .sort((a, b) => b.value - a.value || b.points - a.points || a.rank - b.rank);
  }

  // Per category: what the tenant holds of what the category can give,
  // beside Microsoft's two comparison figures for the same category.
  // The comparison halves are only rendered when BOTH the score and its
  // max came back — a percentage over a missing denominator is a made-up
  // number, and the bar simply does not draw its marker.
  function categoryRows(latest, controls) {
    const rows = [];
    for (const cat of CATEGORIES) {
      const mine = (controls || []).filter((c) => !c.deprecated && c.category === cat);
      if (!mine.length) continue;
      const score = mine.reduce((n, c) => n + (c.score || 0), 0);
      const max = mine.reduce((n, c) => n + (c.maxScore || 0), 0);
      const key = cat.toLowerCase();
      const cmp = (basis) => {
        const c = latest && latest.comparative && latest.comparative[basis];
        if (!c) return null;
        const s = num(c[`${key}Score`]), m = num(c[`${key}ScoreMax`]);
        return (s == null || !m) ? null : Math.round((s / m) * 100);
      };
      rows.push({
        category: cat, score: Math.round(score * 10) / 10, max: Math.round(max * 10) / 10,
        pct: max ? Math.round((score / max) * 100) : null,
        global: cmp("AllTenants"), similar: cmp("TotalSeats"),
        controls: mine.length, gaps: mine.filter((c) => c.points != null && c.points > 0.05).length,
      });
    }
    return rows;
  }

  // What moved between two readings, control by control. Both sides are
  // needed: a control PRESENT IN ONE READING ONLY is not a change of
  // score, it is a change of catalogue (Microsoft added or retired it),
  // and it is reported as its own kind rather than as a swing from zero.
  function deltas(older, newer, profiles) {
    if (!older || !newer) return { improved: [], regressed: [], added: [], removed: [] };
    const titleOf = (id) => {
      const p = (profiles || []).find((x) => String(x.id).toLowerCase() === String(id).toLowerCase());
      return (p && p.title) || id;
    };
    const oldBy = {}; (older.controlScores || []).forEach((c) => { oldBy[String(c.controlName).toLowerCase()] = c; });
    const newBy = {}; (newer.controlScores || []).forEach((c) => { newBy[String(c.controlName).toLowerCase()] = c; });
    const improved = [], regressed = [], added = [], removed = [];
    for (const [id, c] of Object.entries(newBy)) {
      const o = oldBy[id];
      if (!o) { added.push({ id: c.controlName, title: titleOf(c.controlName), category: c.controlCategory || "" }); continue; }
      if (c.score == null || o.score == null) continue;
      const change = Math.round((c.score - o.score) * 10) / 10;
      if (Math.abs(change) < 0.1) continue;
      const row = { id: c.controlName, title: titleOf(c.controlName), category: c.controlCategory || "", change, from: o.score, to: c.score };
      (change > 0 ? improved : regressed).push(row);
    }
    for (const [id, c] of Object.entries(oldBy)) {
      if (!newBy[id]) removed.push({ id: c.controlName, title: titleOf(c.controlName), category: c.controlCategory || "" });
    }
    improved.sort((a, b) => b.change - a.change);
    regressed.sort((a, b) => a.change - b.change);
    return { improved, regressed, added, removed };
  }

  // ------------------------------------------------- snapshots ----------
  //
  // THE FILE FORMAT. Versioned because it will be read by a build that
  // does not exist yet: a reader that meets a version it does not know
  // refuses rather than guessing at fields.
  //
  // The tenant id is carried so a snapshot cannot be merged into the
  // wrong timeline, and the profiles ride along so an old reading renders
  // with the catalogue it was taken under.
  const SNAP_KIND = "tuno.securescore.snapshot";
  const SNAP_VERSION = 1;

  function snapshot(res, { tenantName, tenantId } = {}) {
    return {
      kind: SNAP_KIND, version: SNAP_VERSION,
      tool: "T21", build: (typeof APP_BUILD !== "undefined" && APP_BUILD.build) || null,
      tenantName: tenantName || null,
      tenantId: tenantId || null,
      exported: new Date().toISOString(),
      readings: res.history || [],
      profiles: (res.profiles || []).map((p) => ({
        id: p.id, title: p.title, maxScore: p.maxScore, controlCategory: p.controlCategory,
        remediation: p.remediation, remediationImpact: p.remediationImpact, actionUrl: p.actionUrl,
        actionType: p.actionType, service: p.service, tier: p.tier, userImpact: p.userImpact,
        implementationCost: p.implementationCost, threats: p.threats, rank: p.rank, deprecated: p.deprecated,
      })),
    };
  }

  // Parsing hands back { ok, snap } or { ok:false, why } — a named refusal
  // every time, because "could not read the file" is the one message that
  // tells somebody nothing about a file they can fix.
  function parseSnapshot(text) {
    let j = null;
    try { j = JSON.parse(String(text)); }
    catch (e) { return { ok: false, why: "That file is not JSON. Upload a snapshot this tool exported (⭳ Snapshot JSON), not a CSV or a report." }; }
    if (!j || j.kind !== SNAP_KIND) return { ok: false, why: `That JSON is not a Secure Score snapshot — its "kind" is ${j && j.kind ? `"${j.kind}"` : "missing"}, and this reader only accepts "${SNAP_KIND}".` };
    if (j.version > SNAP_VERSION) return { ok: false, why: `That snapshot is version ${j.version} and this build reads up to ${SNAP_VERSION}. It was written by a newer TUNO — update rather than let this one guess at fields it does not know.` };
    if (!Array.isArray(j.readings) || !j.readings.length) return { ok: false, why: "That snapshot holds no readings." };
    return { ok: true, snap: j };
  }

  // MERGING IS BY DAY, AND LIVE WINS.
  //
  // Two readings for one day is the normal case once a snapshot overlaps
  // the live window, and they are not always identical — the score moves
  // during the day. The live reading is the tenant's current word for that
  // day, so it wins; the number of days where an uploaded value was
  // dropped is returned, because a merge that quietly discards data should
  // have to say how much.
  //
  // A snapshot from a DIFFERENT TENANT is refused, not merged.
  function mergeHistory(live, snaps, { tenantId } = {}) {
    const byDay = new Map();
    const out = { readings: [], sources: [], refused: [], overlapped: 0, uploaded: 0 };
    (live || []).forEach((r) => byDay.set(dayOf(r.taken), { r, live: true }));

    for (const s of (snaps || [])) {
      if (tenantId && s.tenantId && String(s.tenantId).toLowerCase() !== String(tenantId).toLowerCase()) {
        out.refused.push({ name: s.tenantName || s.tenantId, why: "a different tenant — two tenants in one timeline is not a comparison, it is a wrong graph" });
        continue;
      }
      let added = 0, clashed = 0;
      for (const r of (s.readings || [])) {
        const d = dayOf(r.taken);
        if (!d) continue;
        if (byDay.has(d)) { if (byDay.get(d).live) clashed++; continue; }
        byDay.set(d, { r, live: false });
        added++;
      }
      out.sources.push({ name: s.tenantName || "(unnamed tenant)", exported: s.exported || "", readings: (s.readings || []).length, added, clashed });
      out.uploaded += added;
      out.overlapped += clashed;
    }

    out.readings = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => Object.assign({ __day: day, __live: v.live }, v.r));
    return out;
  }

  // ---------------------------------------------------- for T20 ---------
  //
  // The seam T20's correlation reads. Endpoint categories only, gaps
  // only, sorted the way T20 wants to present them: most points first,
  // because a brief that leads with a 0.2-point control has buried the
  // finding. Everything T20 needs to write a line is on the row, so it
  // never reaches back into a reading shape it does not own.
  function endpointGaps(controls) {
    return gaps(controls)
      .filter((c) => ENDPOINT_CATEGORIES.includes(c.category))
      .sort((a, b) => b.points - a.points || a.rank - b.rank);
  }

  // ---------------------------------------------------- exports ---------

  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;

  // One row per control: what it is worth, what the tenant has, and the
  // fields somebody prioritising work actually sorts on.
  function controlsCsv(controls) {
    const head = ["Control", "Title", "Category", "Score", "MaxScore", "PointsAvailable", "UserImpact", "ImplementationCost", "Tier", "MicrosoftRank", "CheapestPointsValue", "Deprecated", "Assessment", "Remediation", "ActionUrl"];
    const rows = (controls || []).map((c) => [
      c.id, c.title, c.category,
      c.score == null ? "" : c.score, c.maxScore == null ? "" : c.maxScore,
      c.points == null ? "" : c.points,
      c.userImpact, c.implementationCost, c.tier, c.rank === 9999 ? "" : c.rank,
      value(c), c.deprecated ? "yes" : "no",
      // One line per cell: a quoted newline is legal CSV and still ruins
      // the sheet somebody opens it in.
      flat(c.description), flat(c.remediation), c.actionUrl,
    ].map(q).join(","));
    return [head.map(q).join(","), ...rows].join("\n");
  }

  // The timeline as a sheet — one row per reading, with where the reading
  // came from, because a chart that mixes live and uploaded points must
  // be able to say which is which after it leaves the browser.
  function historyCsv(readings) {
    const head = ["Date", "Source", "CurrentScore", "MaxScore", "Percent", "GlobalAverage", "SimilarAverage", "LicensedUsers", "ActiveUsers"];
    const rows = (readings || []).map((r) => {
      const g = comparativeOf(r, "AllTenants"), s = comparativeOf(r, "TotalSeats");
      return [
        dayOf(r.taken), r.__live === false ? "uploaded snapshot" : "read from the tenant",
        r.currentScore == null ? "" : r.currentScore, r.maxScore == null ? "" : r.maxScore,
        pct(r.currentScore, r.maxScore) ?? "",
        g ? `${g.value}${g.unit === "percent" ? "%" : " pts"}` : "",
        s ? `${s.value}${s.unit === "percent" ? "%" : " pts"}` : "",
        r.licensedUserCount ?? "", r.activeUserCount ?? "",
      ].map(q).join(",");
    });
    return [head.map(q).join(","), ...rows].join("\n");
  }

  // The monthly report. Written to be pasted into a customer mail without
  // editing — which means every number that carries a caveat carries it
  // here too, rather than only on screen.
  function md(state, { tenantName } = {}) {
    const { readings, controls, latest } = state;
    const day = new Date().toISOString().slice(0, 10);
    const out = [];
    const p = pct(latest.currentScore, latest.maxScore);
    const g = comparativeOf(latest, "AllTenants"), s = comparativeOf(latest, "TotalSeats");
    const unit = (c) => (c ? (c.unit === "percent" ? `${c.value}%` : `${c.value} points`) : "not reported");

    out.push(`# Microsoft Secure Score — ${tenantName || "this tenant"}`);
    out.push(`> Generated ${day} by TUNO. Secure Score is Microsoft's measurement of the tenant, not this tool's — every number below is read from \`security/secureScores\` and its control catalogue, unchanged.`);
    out.push(``);
    out.push(`## Where the tenant stands`);
    out.push(``);
    out.push(`**${latest.currentScore} of ${latest.maxScore} points — ${p}%**, read ${dayOf(latest.taken)}.`);
    out.push(``);
    out.push(`| Measure | Value |`);
    out.push(`| --- | --- |`);
    out.push(`| This tenant | ${p}% (${latest.currentScore} / ${latest.maxScore}) |`);
    out.push(`| Tenants of a similar size | ${unit(s)} |`);
    out.push(`| All tenants | ${unit(g)} |`);
    out.push(`| Readings in this timeline | ${readings.length} (${readings.filter((r) => r.__live === false).length} from uploaded snapshots) |`);
    out.push(``);

    const cats = categoryRows(latest, controls);
    if (cats.length) {
      out.push(`## By category`);
      out.push(``);
      out.push(`| Category | This tenant | Similar tenants | All tenants | Controls with points left |`);
      out.push(`| --- | --- | --- | --- | --- |`);
      cats.forEach((c) => out.push(`| ${c.category} | ${c.pct == null ? "—" : `${c.pct}% (${c.score} / ${c.max})`} | ${c.similar == null ? "—" : `${c.similar}%`} | ${c.global == null ? "—" : `${c.global}%`} | ${c.gaps} of ${c.controls} |`));
      out.push(``);
    }

    const ranked = byValue(controls);
    if (ranked.length) {
      out.push(`## The cheapest points first`);
      out.push(``);
      out.push(`This ordering is TUNO's, not Microsoft's: points still available, weighted down by the user impact and implementation cost Microsoft publishes on each control. A control that declares neither is treated as moderate — an unstated impact is not a low one. Microsoft's own stack ranking is the last column.`);
      out.push(``);
      out.push(`| Improvement action | Category | Points left | User impact | Cost | MS rank |`);
      out.push(`| --- | --- | --- | --- | --- | --- |`);
      ranked.slice(0, 20).forEach((c) => out.push(`| ${c.title} | ${c.category || "—"} | ${c.points} | ${c.userImpact || "not stated"} | ${c.implementationCost || "not stated"} | ${c.rank === 9999 ? "—" : c.rank} |`));
      out.push(``);
    }

    if (readings.length > 1) {
      const d = deltas(readings[0], readings[readings.length - 1], state.profiles);
      out.push(`## What moved`);
      out.push(``);
      out.push(`Between ${dayOf(readings[0].taken)} and ${dayOf(readings[readings.length - 1].taken)}.`);
      out.push(``);
      out.push(d.improved.length ? `**Improved (${d.improved.length})**` : `**Nothing improved over this window.**`);
      d.improved.slice(0, 15).forEach((c) => out.push(`- ${c.title} — **+${c.change}**`));
      out.push(``);
      out.push(d.regressed.length ? `**Regressed (${d.regressed.length})**` : `**Nothing regressed over this window.**`);
      d.regressed.slice(0, 15).forEach((c) => out.push(`- ${c.title} — **${c.change}**`));
      out.push(``);
      if (d.added.length || d.removed.length) {
        out.push(`Microsoft also changed the catalogue over this window: ${d.added.length} control${d.added.length === 1 ? "" : "s"} added, ${d.removed.length} retired. Those are not the tenant moving and are not counted as improvements or regressions.`);
        out.push(``);
      }
    }

    const un = unreadable(controls);
    if (un.length) {
      out.push(`> ${un.length} control${un.length === 1 ? " has" : "s have"} no readable score or ceiling and ${un.length === 1 ? "is" : "are"} counted as neither achieved nor a gap: ${un.slice(0, 6).map((c) => c.title).join("; ")}${un.length > 6 ? `; and ${un.length - 6} more` : ""}.`);
      out.push(``);
    }

    out.push(`## Every gap`);
    out.push(``);
    ranked.forEach((c) => {
      out.push(`### ${c.title} — ${c.points} point${c.points === 1 ? "" : "s"} available`);
      out.push(`- **Category:** ${c.category || "not stated"} · **Tier:** ${c.tier || "not stated"} · **User impact:** ${c.userImpact || "not stated"} · **Implementation cost:** ${c.implementationCost || "not stated"}`);
      // flat(): the text is already through plain(), but a Markdown bullet
      // is one line and Microsoft's remediation is frequently a numbered
      // list — a raw newline here silently ends the bullet.
      out.push(`- **This tenant:** ${c.score} of ${c.maxScore}. ${flat(c.description)}`.trim());
      if (c.remediation) out.push(`- **Remediation:** ${flat(c.remediation)}`);
      if (c.remediationImpact) out.push(`- **Impact of remediating:** ${flat(c.remediationImpact)}`);
      if (c.actionUrl) out.push(`- **Action:** ${c.actionUrl}`);
      out.push(``);
    });
    return out.join("\n");
  }

  return {
    SCOPE, CATEGORIES, ENDPOINT_CATEGORIES, SNAP_KIND, SNAP_VERSION,
    collect, normalizeScore, controlsFrom, categoryRows, deltas,
    gaps, unreadable, byValue, value, endpointGaps,
    comparativeOf, pct, dayOf, plain, flat, painOf, stated,
    snapshot, parseSnapshot, mergeHistory,
    controlsCsv, historyCsv, md,
  };
})();

// ======================================================================
// T21 — the screen. The engine above is DOM-free for the headless suite.
// ======================================================================
const SecureScoreTool = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let res = null, running = false, uploaded = [], merged = null, search = "", view = "value";
  // The cards-or-list face, the seg T19, T20 and T14 all wear. Cards lead
  // because Microsoft's assessment text is the substance of a control and
  // a fixed table column cannot hold it; the list is for the tenant with
  // fifty-six of these, where scanning beats reading.
  let face = "cards";
  // The category filter, shared by the Score tab's bars, the chip row and
  // the list's Category cell — one piece of state, so the three cannot
  // disagree about what the screen is showing. null means every category.
  let cat = null;

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function tenant() {
    try { const o = window.TunoTenant && TunoTenant.org && TunoTenant.org(); return o || null; } catch (e) { return null; }
  }
  const tenantName = () => (tenant() && tenant().displayName) || null;
  const tenantId = () => (tenant() && tenant().id) || null;

  // The merged state everything renders from. Rebuilt whenever a snapshot
  // is uploaded, so the timeline and the CSV can never disagree about
  // which readings are in play.
  function rebuild() {
    if (!res) { merged = null; return; }
    const m = SecureScore.mergeHistory(res.history, uploaded, { tenantId: tenantId() });
    const latest = m.readings.length ? m.readings[m.readings.length - 1] : res.latest;
    merged = {
      readings: m.readings, sources: m.sources, refused: m.refused,
      overlapped: m.overlapped, uploadedCount: m.uploaded,
      latest, profiles: res.profiles,
      controls: SecureScore.controlsFrom(latest, res.profiles),
    };
  }

  // ---------------------------------------------------------------- run --
  async function run() {
    if (running) return;
    running = true; $("scRun").disabled = true;
    ["scMd", "scCsv", "scHistCsv", "scSnap"].forEach((id) => { const b = $(id); if (b) b.style.display = "none"; });
    $("scBody").innerHTML = "";
    const prog = (m, n, of) => TunoProgress.show("scBody", "scProg", m, n, of);
    try {
      prog("Checking permissions…");
      await Graph.ensureScopes(SecureScore.SCOPE);
      const r = await SecureScore.collect({ onStatus: prog });
      // The same reading T20 will find — one read per session unless
      // somebody asks for a fresh one.
      lastRead = shape(r);
      res = r; uploaded = []; search = ""; view = "value"; face = "cards"; cat = null;
      rebuild();
      prog("");
      if (r.empty) {
        $("scBody").innerHTML = `<div class="list-card"><p class="mini" style="margin:0"><b>This tenant has no Secure Score readings.</b> That is an answer, not a failure — <code>security/secureScores</code> returned an empty collection. Secure Score starts producing daily readings once the tenant has the licensed services it measures; until then there is nothing to visualise. Nothing was wrong with the permission: the read succeeded.</p></div>`;
        return;
      }
      ["scMd", "scCsv", "scHistCsv", "scSnap"].forEach((id) => { const b = $(id); if (b) b.style.display = ""; });
      render();
    } catch (e) {
      prog("");
      const why = (e && e.message) || String(e);
      const admin = e && e.kind === "admin";
      $("scBody").innerHTML = `<div class="list-card"><div class="gu-fail"><b>The read failed.</b><span class="why">${esc(why)}</span>${admin ? `<span class="why">SecurityEvents.Read.All is an admin-consent permission in most tenants — an administrator grants it once for the whole tenant.</span>` : ""}</div></div>`;
    } finally { running = false; $("scRun").disabled = false; }
  }

  // -------------------------------------------------------------- upload --
  function onUpload(files) {
    const list = Array.from(files || []);
    if (!list.length || !res) return;
    let done = 0;
    const problems = [];
    list.forEach((f) => {
      const fr = new FileReader();
      fr.onload = () => {
        const r = SecureScore.parseSnapshot(fr.result);
        if (!r.ok) problems.push(`${f.name}: ${r.why}`);
        else uploaded.push(r.snap);
        if (++done === list.length) {
          rebuild();
          render(problems);
        }
      };
      fr.onerror = () => {
        problems.push(`${f.name}: the file could not be read from disk.`);
        if (++done === list.length) { rebuild(); render(problems); }
      };
      fr.readAsText(f);
    });
  }

  // -------------------------------------------------------------- charts --

  // The gauge — a half ring whose fill is the percentage, with the colour
  // bands GCIT's report uses. The number is inside it because a gauge
  // without its figure is decoration.
  function gauge(p) {
    const colour = p >= 80 ? "var(--on)" : p >= 60 ? "var(--report)" : "var(--off)";
    const ARC = 251.3;
    const fill = Math.max(0, Math.min(ARC, ARC * (p / 100)));
    return `<svg viewBox="0 0 200 122" class="sc-gauge" role="img" aria-label="Secure Score ${p} percent">
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--border)" stroke-width="14" stroke-linecap="round"/>
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="${colour}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${fill} ${ARC}"/>
      <text x="100" y="92" text-anchor="middle" class="sc-gauge-n">${p}%</text>
    </svg>`;
  }

  function bar(label, v, colour) {
    if (v == null) return `<div class="sc-cmp"><div class="sc-cmp-l"><span>${esc(label)}</span><b>not reported</b></div><div class="sc-track"></div></div>`;
    return `<div class="sc-cmp"><div class="sc-cmp-l"><span>${esc(label)}</span><b>${v}%</b></div>
      <div class="sc-track"><div class="sc-fill" style="width:${Math.max(0, Math.min(100, v))}%;background:${colour}"></div></div></div>`;
  }

  // The timeline. Uploaded points are drawn as their own marks rather than
  // silently joined into the live line — the shape of the history is the
  // claim, and a reader is entitled to see where it came from.
  function timeline(readings) {
    if (readings.length < 2) return `<p class="mini muted" style="margin:0">One reading only — a timeline needs two. Export a snapshot now and upload it next month; that is what the import is for.</p>`;
    const W = 860, H = 210, L = 46, R = 16, T = 16, B = 34;
    const pw = W - L - R, ph = H - T - B;
    const pts = readings.map((r) => SecureScore.pct(r.currentScore, r.maxScore)).filter((v) => v != null);
    if (pts.length < 2) return `<p class="mini muted" style="margin:0">The readings carry no usable percentages — nothing to plot.</p>`;
    const lo = Math.floor(Math.min(...pts) - 2), hi = Math.ceil(Math.max(...pts) + 2);
    const range = Math.max(1, hi - lo);
    const x = (i) => L + (i / Math.max(1, readings.length - 1)) * pw;
    const y = (v) => T + ph - ((v - lo) / range) * ph;
    const line = readings.map((r, i) => {
      const v = SecureScore.pct(r.currentScore, r.maxScore);
      return v == null ? null : `${Math.round(x(i) * 10) / 10},${Math.round(y(v) * 10) / 10}`;
    }).filter(Boolean).join(" ");
    const grid = [];
    for (let v = lo; v <= hi; v += Math.max(1, Math.ceil(range / 4))) {
      grid.push(`<line x1="${L}" y1="${y(v)}" x2="${L + pw}" y2="${y(v)}" stroke="var(--border)" stroke-dasharray="4,4"/>
        <text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="sc-ax">${v}%</text>`);
    }
    const step = Math.max(1, Math.floor(readings.length / 6));
    const xlabels = readings.map((r, i) => (i % step ? "" :
      `<text x="${x(i)}" y="${T + ph + 20}" text-anchor="middle" class="sc-ax">${esc(SecureScore.dayOf(r.taken).slice(5))}</text>`)).join("");
    const marks = readings.map((r, i) => {
      const v = SecureScore.pct(r.currentScore, r.maxScore);
      if (v == null) return "";
      const up = r.__live === false;
      return `<circle cx="${x(i)}" cy="${y(v)}" r="${up ? 3.5 : 2}" fill="${up ? "var(--report)" : "var(--accent2)"}"><title>${esc(SecureScore.dayOf(r.taken))} — ${v}%${up ? " (from an uploaded snapshot)" : ""}</title></circle>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="sc-chart" role="img" aria-label="Secure Score over time">
      ${grid.join("")}${xlabels}
      <polyline points="${line}" fill="none" stroke="var(--accent2)" stroke-width="2.5" stroke-linejoin="round"/>
      ${marks}</svg>`;
  }

  // ---------------------------------------------------------------- panes --
  function paneScore() {
    const m = merged, l = m.latest;
    const p = SecureScore.pct(l.currentScore, l.maxScore);
    const g = SecureScore.comparativeOf(l, "AllTenants"), s = SecureScore.comparativeOf(l, "TotalSeats");
    const cmpBar = (label, c, colour) => (c && c.unit === "percent")
      ? bar(label, Math.round(c.value * 10) / 10, colour)
      : bar(label + (c ? " (reported in points, not a percentage — not comparable to the bar above)" : ""), null, colour);
    const cats = SecureScore.categoryRows(l, m.controls);
    // THE BARS DOUBLE AS FILTERS — T19's rule (its surface stat cards are
    // its filters), and the reason is the same here: a category bar
    // answers "how is Apps doing" and the only next question anybody has
    // is "which Apps controls". A number you cannot click is a number you
    // have to go and look for somewhere else on the page.
    //
    // A category with NO gaps is deliberately still clickable: filtering
    // to it is how you see the achieved controls, which is a real question
    // ("prove Device is done") rather than an empty screen.
    const catBar = (c) => `<button type="button" class="sc-cat sc-cat-btn${cat === c.category ? " active" : ""}" data-sccat="${esc(c.category)}">
      <div class="sc-cat-h"><b>${esc(c.category)}</b><span>${c.pct == null ? "—" : `${c.pct}%`}</span></div>
      <div class="sc-track">
        <div class="sc-fill" style="width:${c.pct == null ? 0 : c.pct}%"></div>
        ${c.global == null ? "" : `<i class="sc-mark global" style="left:${c.global}%" title="All tenants: ${c.global}%"></i>`}
        ${c.similar == null ? "" : `<i class="sc-mark similar" style="left:${c.similar}%" title="Similar tenants: ${c.similar}%"></i>`}
      </div>
      <div class="mini muted">${c.score} / ${c.max} points · ${c.gaps} of ${c.controls} controls still have points left${c.global == null && c.similar == null ? " · Microsoft reported no comparison for this category" : ""}</div>
    </button>`;

    return `<div class="list-card">
      <h4 style="margin:0 0 4px">📊 Microsoft Secure Score</h4>
      <div class="sc-hero">
        ${gauge(p)}
        <div class="sc-hero-r">
          <p class="mini" style="margin:0 0 10px"><b>${l.currentScore} of ${l.maxScore} points</b> — read ${esc(SecureScore.dayOf(l.taken))}${l.__live === false ? " <b>from an uploaded snapshot</b>" : ""}. ${l.licensedUserCount != null ? `${l.licensedUserCount} licensed users, ${l.activeUserCount ?? "—"} active.` : ""}</p>
          ${bar("This tenant", p, "var(--on)")}
          ${cmpBar("Tenants of a similar size", s, "var(--report)")}
          ${cmpBar("All tenants", g, "var(--muted, #888)")}
        </div>
      </div>
      <p class="mini muted" style="margin:12px 0 0"><b>These are Microsoft's numbers, not TUNO's.</b> Secure Score measures the tenant's actual state as Microsoft observes it — a control can be configured in a policy and still score zero, because the score reads the estate rather than the intent. That difference is the whole point of the 🧭 Endpoint security posture tool's Secure Score node.${res.profileError ? ` <b>The control catalogue could not be read (${esc(res.profileError)})</b> — controls below show their raw ids, and remediation text is missing.` : ""}${res.betaFilled ? ` ${res.betaFilled} control title${res.betaFilled === 1 ? "" : "s"} came from the beta catalogue, where the Defender for Endpoint controls are titled; beta is a preview surface and may change.` : ""}</p>
    </div>
    ${cats.length ? `<div class="list-card"><h4 style="margin:0 0 4px">By category</h4>
      <p class="mini muted" style="margin:0 0 12px"><b>Every bar is a filter.</b> Click one to see only that category's improvement actions, with its own score above them.</p>
      ${cats.map(catBar).join("")}
      <p class="mini muted" style="margin:8px 0 0">The two ticks on each bar are Microsoft's comparison figures — <span class="sc-key global"></span> all tenants, <span class="sc-key similar"></span> tenants of a similar size. A category Microsoft reported no comparison for simply has no ticks rather than a zero.</p></div>` : ""}`;
  }

  function paneTimeline() {
    const m = merged;
    const live = m.readings.filter((r) => r.__live !== false).length;
    const d = m.readings.length > 1 ? SecureScore.deltas(m.readings[0], m.readings[m.readings.length - 1], res.profiles) : null;
    const changeRows = (rows, colour, empty) => rows.length
      ? rows.slice(0, 10).map((c) => `<div class="sc-chg"><span>${esc(c.title)}<br><i class="mini muted">${esc(c.category || "—")}</i></span><b style="color:${colour}">${c.change > 0 ? "+" : ""}${c.change}</b></div>`).join("")
      : `<p class="mini muted" style="margin:0">${empty}</p>`;

    return `<div class="list-card">
      <h4 style="margin:0 0 4px">Score over time</h4>
      <p class="mini muted" style="margin:0 0 12px">${m.readings.length} reading${m.readings.length === 1 ? "" : "s"} — ${live} read from the tenant, ${m.readings.length - live} from uploaded snapshots (drawn as the larger marks). <b>Graph keeps about ninety days</b>, so anything older than that is only here because it was exported before it aged out.${m.overlapped ? ` ${m.overlapped} uploaded reading${m.overlapped === 1 ? "" : "s"} fell on a day the tenant also answered for; the live reading won those days.` : ""}</p>
      ${timeline(m.readings)}
    </div>
    ${m.sources.length ? `<div class="list-card"><h4 style="margin:0 0 6px">Uploaded snapshots</h4>
      ${m.sources.map((s) => `<p class="mini" style="margin:4px 0">${esc(s.name)} — exported ${esc(String(s.exported).slice(0, 10))} · ${s.readings} reading${s.readings === 1 ? "" : "s"}, <b>${s.added} added</b> to the timeline${s.clashed ? `, ${s.clashed} dropped as same-day duplicates of a live reading` : ""}.</p>`).join("")}</div>` : ""}
    ${m.refused.length ? `<div class="list-card"><p class="mini" style="margin:0;color:var(--off)"><b>${m.refused.length} snapshot${m.refused.length === 1 ? "" : "s"} refused.</b> ${m.refused.map((r) => `${esc(r.name)} — ${esc(r.why)}`).join(" ")}</p></div>` : ""}
    ${d ? `<div class="list-card"><h4 style="margin:0 0 4px">What moved</h4>
      <p class="mini muted" style="margin:0 0 12px">Between ${esc(SecureScore.dayOf(m.readings[0].taken))} and ${esc(SecureScore.dayOf(m.readings[m.readings.length - 1].taken))}. ${(d.added.length || d.removed.length) ? `Microsoft also changed the catalogue over this window — ${d.added.length} control${d.added.length === 1 ? "" : "s"} added, ${d.removed.length} retired — and those are not counted here, because a control appearing is not the tenant improving.` : ""}</p>
      <div class="sc-two">
        <div><h5 style="margin:0 0 8px;color:var(--on)">Improved (${d.improved.length})</h5>${changeRows(d.improved, "var(--on)", "Nothing improved over this window.")}</div>
        <div><h5 style="margin:0 0 8px;color:var(--off)">Regressed (${d.regressed.length})</h5>${changeRows(d.regressed, "var(--off)", "Nothing regressed over this window.")}</div>
      </div></div>` : ""}`;
  }

  function paneActions() {
    const m = merged;
    const q = search.trim().toLowerCase();
    const all = view === "value" ? SecureScore.byValue(m.controls)
      : view === "points" ? SecureScore.gaps(m.controls).slice().sort((a, b) => b.points - a.points || a.rank - b.rank)
      : view === "rank" ? SecureScore.gaps(m.controls).slice().sort((a, b) => a.rank - b.rank)
      : m.controls.slice().filter((c) => !c.deprecated && c.points != null && c.points <= 0.05).sort((a, b) => a.title.localeCompare(b.title));
    const matches = (c) => !q || c.title.toLowerCase().includes(q) || String(c.id).toLowerCase().includes(q) || (c.category || "").toLowerCase().includes(q) || (c.remediation || "").toLowerCase().includes(q);
    // The category filter is applied AFTER the search so the chip counts
    // describe what the search left, not the whole tenant — a chip saying
    // "Apps (35)" over a list of three is a chip that is lying about the
    // screen it sits on.
    const searched = all.filter(matches);
    const rows = searched.filter((c) => !cat || c.category === cat);
    const un = SecureScore.unreadable(m.controls);

    // The chips: the same filter as the bars on the Score tab, reachable
    // without going back for it, and the only way to clear one.
    const catCounts = {};
    searched.forEach((c) => { const k = c.category || "uncategorised"; catCounts[k] = (catCounts[k] || 0) + 1; });
    const chips = [`<button class="fchip${cat === null ? " active" : ""}" data-sccat="">All (${searched.length})</button>`]
      .concat(SecureScore.CATEGORIES.filter((k) => catCounts[k])
        .map((k) => `<button class="fchip${cat === k ? " active" : ""}" data-sccat="${esc(k)}">${esc(k)} (${catCounts[k]})</button>`))
      .join("");

    // A filtered view shows THAT CATEGORY'S score, not the tenant's — the
    // whole point of narrowing to it. Read from the same categoryRows the
    // bars are drawn from, so the two can never disagree.
    const catRow = cat ? SecureScore.categoryRows(m.latest, m.controls).find((r) => r.category === cat) : null;

    // "Unknown" is Microsoft's own word on a great many controls, and it
    // is not the same as a field they left empty — so it is printed as
    // they wrote it, with what this tool DOES with it said once on the
    // note above rather than re-explained on every card.
    const level = (v) => (SecureScore.stated(v) ? esc(v) : `${esc(v || "not stated")} <span class="sc-def">→ weighed as moderate</span>`);

    // The card. The long text is Microsoft's, through plain() — newlines
    // survive as newlines via .sc-text, and a URL too long to break sits
    // inside a container that is allowed to break it rather than one that
    // widens the whole page (10502's layout fix).
    const card = (c) => `<div class="sc-ctrl" data-scopen="${esc(c.id)}" role="button" tabindex="0">
      <div class="sc-ctrl-h">
        <b>${esc(c.title)}</b>
        <span class="sc-pts">${c.points != null ? `${c.points} pt${c.points === 1 ? "" : "s"} left` : "—"}</span>
      </div>
      <div class="mini muted sc-meta">${esc(c.category || "uncategorised")} · ${c.score} of ${c.maxScore} · tier ${esc(c.tier || "not stated")} · user impact ${level(c.userImpact)} · cost ${level(c.implementationCost)}${c.rank !== 9999 ? ` · Microsoft rank ${c.rank}` : ""}${c.titled ? "" : " · <b>no title in the catalogue — this is the raw control id</b>"}</div>
      ${c.description ? `<p class="mini sc-text sc-clamp"><b>Assessment:</b> ${esc(c.description)}</p>` : ""}
      ${c.remediation ? `<p class="mini sc-text sc-clamp"><b>Remediation:</b> ${esc(c.remediation)}</p>` : ""}
      <p class="mini muted sc-more">Open for the full text${c.actionUrl ? " and the portal link" : ""} →</p>
    </div>`;

    // The list face — the house .cg-table, the same rows, one line each,
    // and a row click opening the same popout a card click does. T19 and
    // T20 wear this seg; a third spelling of one control is how two
    // screens start disagreeing about what a face is.
    // The Category cell is a filter too — it is the one place in the list
    // where the eye is already asking "just these, please". It is checked
    // BEFORE the row's own open handler, so clicking the category narrows
    // and clicking anywhere else on the row opens.
    const row = (c) => `<tr class="sc-row" data-scopen="${esc(c.id)}">
      <td><b>${esc(c.title)}</b></td>
      <td>${c.category ? `<button class="sc-catlink" data-sccat="${esc(c.category)}">${esc(c.category)}</button>` : "—"}</td>
      <td>${c.points != null ? c.points : "—"}</td>
      <td class="mini">${c.score} / ${c.maxScore}</td>
      <td class="mini">${esc(c.userImpact || "not stated")}</td>
      <td class="mini">${esc(c.implementationCost || "not stated")}</td>
      <td class="mini">${c.rank === 9999 ? "—" : c.rank}</td>
    </tr>`;

    return `<div class="list-card sc-bar">
      <div class="seg" id="scViewSeg">
        <button type="button" data-scview="value" class="${view === "value" ? "active" : ""}">💰 Cheapest points</button>
        <button type="button" data-scview="points" class="${view === "points" ? "active" : ""}">📈 Most points</button>
        <button type="button" data-scview="rank" class="${view === "rank" ? "active" : ""}">🏅 Microsoft rank</button>
        <button type="button" data-scview="done" class="${view === "done" ? "active" : ""}">✅ Achieved</button>
      </div>
      <div class="seg" id="scFaceSeg">
        <button type="button" data-scface="cards" class="${face === "cards" ? "active" : ""}">🗂 Cards</button>
        <button type="button" data-scface="list" class="${face === "list" ? "active" : ""}">☰ List</button>
      </div>
      <input id="scSearch" type="search" placeholder="Filter by title, control id, category or remediation…" value="${esc(search)}">
      <span class="mini muted">${rows.length} shown</span></div>
    <div class="list-card sc-chips">${chips}</div>
    ${catRow ? `<div class="list-card">
      <div class="sc-cat-h" style="margin-bottom:6px"><b>${esc(catRow.category)}</b><span>${catRow.pct == null ? "—" : `${catRow.pct}%`}</span></div>
      <div class="sc-track">
        <div class="sc-fill" style="width:${catRow.pct == null ? 0 : catRow.pct}%"></div>
        ${catRow.global == null ? "" : `<i class="sc-mark global" style="left:${catRow.global}%" title="All tenants: ${catRow.global}%"></i>`}
        ${catRow.similar == null ? "" : `<i class="sc-mark similar" style="left:${catRow.similar}%" title="Similar tenants: ${catRow.similar}%"></i>`}
      </div>
      <p class="mini muted" style="margin:6px 0 0"><b>${catRow.score} of ${catRow.max} points</b> — this is <b>${esc(catRow.category)}'s own score</b>, not the tenant's. ${catRow.gaps} of ${catRow.controls} controls still have points left${catRow.global == null && catRow.similar == null ? " · Microsoft reported no comparison for this category" : ` · all tenants ${catRow.global == null ? "—" : `${catRow.global}%`}, tenants of a similar size ${catRow.similar == null ? "—" : `${catRow.similar}%`}`}. <b>The exports above stay whole-tenant</b> — a file called Secure Score holding only ${esc(catRow.category)} is a trap, so the filter narrows the screen and not the download.</p>
    </div>` : ""}
    ${view === "value" ? `<div class="list-card"><p class="mini muted" style="margin:0"><b>This ordering is TUNO's, not Microsoft's.</b> Points still available, weighted down by the user impact and implementation cost Microsoft publishes on the control. Microsoft answers <i>Unknown</i> on a great many of them; an unknown level is weighed as <b>moderate</b>, never as low, because calling an unstated impact low is how a "quick win" becomes the change that breaks sign-in on Monday. 🏅 Microsoft rank is Microsoft's own stack ranking, unchanged.</p></div>` : ""}
    ${un.length && view !== "done" ? `<div class="list-card"><p class="mini muted" style="margin:0">${un.length} control${un.length === 1 ? "" : "s"} could not be scored — no readable score or no ceiling in the catalogue — and ${un.length === 1 ? "is" : "are"} counted as neither achieved nor a gap: ${esc(un.slice(0, 5).map((c) => c.title).join("; "))}${un.length > 5 ? `, and ${un.length - 5} more` : ""}.</p></div>` : ""}
    ${rows.length
      ? (face === "list"
        ? `<div class="cg-tablewrap" style="margin-top:0"><table class="cg-table"><thead><tr><th>Improvement action</th><th>Category</th><th>Points left</th><th>Score</th><th>User impact</th><th>Cost</th><th>MS rank</th></tr></thead><tbody>${rows.map(row).join("")}</tbody></table></div>`
        : `<div class="sc-ctrls">${rows.map(card).join("")}</div>`)
      : `<div class="list-card"><p class="mini muted" style="margin:0">${
        cat ? `Nothing in <b>${esc(cat)}</b> matches this view${q ? " and that search" : ""} — ${view === "done" ? "no control in this category is fully achieved" : "every scored control in this category is at its maximum"}. <button class="fchip" data-sccat="">Show every category</button>`
        : q ? "Nothing matches that filter."
        : view === "done" ? "No control is fully achieved yet."
        : "No gaps — every scored control is at its maximum."}</p></div>`}`;
  }

  // ------------------------------------------------------------- popout --
  // One control, whole: the full assessment and remediation Microsoft
  // wrote, unclipped, plus the portal link. Both faces open it, so the
  // list is a denser view of the same information rather than a lossy one.
  function openControl(id) {
    const c = merged && merged.controls.find((x) => x.id === id);
    if (!c) return;
    const line = (label, text) => (text ? `<p class="mini sc-text" style="margin:0 0 10px"><b>${label}</b><br>${esc(text)}</p>` : "");
    $("scModalBody").innerHTML = `
      <div class="gu-m-head"><h3 style="margin:0">${esc(c.title)}</h3></div>
      <div class="gu-m-body">
        <p class="mini muted sc-meta" style="margin:0 0 12px">${esc(c.category || "uncategorised")} · <b>${c.score} of ${c.maxScore}</b>${c.points != null && c.points > 0 ? ` · <b>${c.points} point${c.points === 1 ? "" : "s"} still available</b>` : " · fully achieved"} · tier ${esc(c.tier || "not stated")} · user impact ${esc(c.userImpact || "not stated")} · cost ${esc(c.implementationCost || "not stated")}${c.rank !== 9999 ? ` · Microsoft rank ${c.rank}` : ""}${c.service ? ` · ${esc(c.service)}` : ""}</p>
        ${line("Assessment", c.description)}
        ${line("Remediation", c.remediation)}
        ${line("Impact of doing it", c.remediationImpact)}
        ${c.threats && c.threats.length ? `<p class="mini muted" style="margin:0 0 10px"><b>Threats it mitigates:</b> ${esc(c.threats.join(", "))}</p>` : ""}
        <p class="mini muted" style="margin:0">Control id <code>${esc(c.id)}</code>${c.fromBeta ? " · title read from the beta catalogue" : ""}. This text is Microsoft's, with its HTML markup read and discarded — TUNO never renders a third party's markup in a page holding a tenant token.</p>
      </div>
      <div class="gu-m-foot">
        ${c.actionUrl ? `<a class="btn" href="${esc(c.actionUrl)}" target="_blank" rel="noopener noreferrer">Open where this is configured ↗</a>` : ""}
        <div class="spacer" style="flex:1"></div>
        <button class="btn primary" id="scModalClose">Close</button>
      </div>`;
    $("scModal").classList.add("open");
    $("scModalClose").addEventListener("click", closeControl);
    $("scModal").onclick = (e) => { if (e.target === $("scModal")) closeControl(); };
    document.addEventListener("keydown", onEsc);
  }
  function closeControl() { $("scModal").classList.remove("open"); document.removeEventListener("keydown", onEsc); }
  function onEsc(e) { if (e.key === "Escape") closeControl(); }

  // -------------------------------------------------------------- render --
  const TABS = [
    { id: "score", icon: "📊", label: "Score" },
    { id: "time", icon: "📈", label: "Over time" },
    { id: "actions", icon: "🎯", label: "Improvement actions" },
  ];
  let tab = "score";

  function render(problems) {
    if (!res || !merged) return;
    const bad = (problems || []).length
      ? `<div class="list-card"><p class="mini" style="margin:0;color:var(--off)"><b>${problems.length} file${problems.length === 1 ? "" : "s"} could not be used.</b> ${problems.map(esc).join(" ")}</p></div>` : "";
    const nav = `<div class="list-card sc-tabs">${TABS.map((t) =>
      `<button type="button" class="btn${tab === t.id ? " primary" : ""}" data-sctab="${t.id}">${t.icon} ${esc(t.label)}</button>`).join("")}
      <div style="flex:1"></div>
      <label class="btn" for="scUpload" title="Extend the timeline past Graph's ninety-day window with snapshots this tool exported">⭱ Upload snapshot</label>
      <input id="scUpload" type="file" accept="application/json,.json" multiple style="display:none">
    </div>`;
    $("scBody").innerHTML = nav + bad + (tab === "score" ? paneScore() : tab === "time" ? paneTimeline() : paneActions());
    const u = $("scUpload");
    if (u) u.addEventListener("change", () => { onUpload(u.files); u.value = ""; });
    const s = $("scSearch");
    if (s) s.addEventListener("input", () => {
      search = s.value;
      const keep = s.selectionStart;
      render();
      const s2 = $("scSearch");
      if (s2) { s2.focus(); s2.setSelectionRange(keep, keep); }
    });
  }

  // ---------------------------------------------------------------- init --
  function init() {
    if (!$("scRun")) return;
    $("scRun").addEventListener("click", run);
    $("scMd").addEventListener("click", () => {
      TunoReport.show("📊 Secure Score", "Secure-Score.md", SecureScore.md(merged, { tenantName: tenantName() }));
    });
    $("scCsv").addEventListener("click", () => download("Secure-Score-controls.csv", SecureScore.controlsCsv(merged.controls), "text/csv;charset=utf-8"));
    $("scHistCsv").addEventListener("click", () => download("Secure-Score-history.csv", SecureScore.historyCsv(merged.readings), "text/csv;charset=utf-8"));
    $("scSnap").addEventListener("click", () => {
      const snap = SecureScore.snapshot(res, { tenantName: tenantName(), tenantId: tenantId() });
      download(`Secure-Score-snapshot-${SecureScore.dayOf(new Date().toISOString())}.json`, JSON.stringify(snap, null, 2), "application/json");
    });
    $("scBody").addEventListener("click", (e) => {
      const t = e.target.closest("[data-sctab]");
      if (t) { const k = t.getAttribute("data-sctab"); if (k !== tab) { tab = k; search = ""; render(); } return; }
      const v = e.target.closest("[data-scview]");
      if (v) { const k = v.getAttribute("data-scview"); if (k !== view) { view = k; render(); } return; }
      const f = e.target.closest("[data-scface]");
      if (f) { const k = f.getAttribute("data-scface"); if (k !== face) { face = k; render(); } return; }
      // BEFORE the row's open handler: the Category cell sits inside a row
      // that opens on click, and narrowing is what a click on the category
      // means. Clicking the same one again clears it — a filter you cannot
      // undo where you set it is a trap.
      const k = e.target.closest("[data-sccat]");
      if (k) {
        const want = k.getAttribute("data-sccat") || null;
        cat = (want && want === cat) ? null : want;
        // A bar on the Score tab is asking to SEE those controls, so the
        // filter takes you to them; a chip on the actions tab is already
        // there and stays put.
        if (tab !== "actions") { tab = "actions"; }
        render();
        return;
      }
      const o = e.target.closest("[data-scopen]");
      if (o) openControl(o.getAttribute("data-scopen"));
    });
  }

  // THE SESSION'S LAST READING, held once for both screens.
  //
  // 10500 had T20 read the tenant again every time, on the argument that
  // reusing a result this screen happened to be holding would show numbers
  // whose age T20 could not state. That was the wrong conclusion from a
  // real constraint: the fix for an unstateable age is to STATE IT, not to
  // spend a second read and, on most tenants, a second consent prompt for
  // an answer that is already in memory. So the reading is cached with the
  // moment it was taken, both screens read it, and T20 says how old it is
  // and offers one click to take a fresh one.
  //
  // Written by BOTH paths — this screen's run() and T20's readFor() — so
  // whichever tool asks first, the other one has it.
  let lastRead = null;
  const shape = (r) => Object.assign(
    { controls: r.empty ? [] : SecureScore.controlsFrom(r.latest, r.profiles), readAt: Date.now() }, r);
  const current = () => lastRead;

  // T21's own read still goes through run(); this is the seam T20 calls,
  // so there is exactly one implementation of the read and one shape of
  // the answer. `force` skips the cache for a deliberate re-read.
  async function readFor({ onStatus, force } = {}) {
    if (!force && lastRead) return lastRead;
    await Graph.ensureScopes(SecureScore.SCOPE);
    const r = await SecureScore.collect({ onStatus });
    lastRead = shape(r);
    return lastRead;
  }

  return {
    init, run, readFor, current,
    // seams for the headless suite — the real res is set by run()
    _setForTest: (r, ups) => { res = r; lastRead = r ? shape(r) : null; uploaded = ups || []; tab = "score"; search = ""; view = "value"; face = "cards"; cat = null; rebuild(); render(); },
    _state: () => ({ tab, view, face, search, cat, uploaded: uploaded.length, merged }),
  };
})();

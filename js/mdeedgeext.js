// ======================================================================
// T28 — 🧩 Edge extensions: the two lists of the Edge extensions policy
// in the NEW set (build 10678)
//
// Mihai, 2 Oct 2026, off the Intune settings of Win - OIB - SC - Microsoft
// Edge - U - Extensions - v3.1.2: "need an extra adjustment option … add
// new extensions by name and the tool needs to look them up by extension
// id in the Edge extension store … the section with Control which
// extensions are installed silently must also be easy adjustable". Option
// A off the mockup round (its own rail node, nothing in the header —
// "only show them on left rail"), and: "if the store cannot be called,
// the option to self insert the right id should be there".
//
// WHAT IS EDITED. Two simple string collections inside two choice
// settings of ONE settings-catalog policy — the OIB Edge extensions
// policy (user scope at PVM; the device-scope twin parses the same):
//   …~policy~microsoft_edge~extensions_extensioninstallforcelist      ⬇ installed silently
//   …~policy~microsoft_edge~extensions_extensioninstallallowlist      ⊕ exempt from the block list
// Read beside them, never written: …extensioninstallblocklist (OIB:
// "*", everything blocked) and …blockexternalextensions. A policy that
// does not carry the force list or the allow list is not an Edge
// extensions policy for this pane.
//
// THE ENTRIES (Learn, ExtensionInstallForcelist): "<id>" or
// "<id>;<update url>"; without a URL the Edge Add-ons store is used, so a
// Chrome Web Store extension carries ;https://clients2.google.com/service/
// update2/crx. The force list supersedes the block list, a removed force
// entry is uninstalled automatically, and users cannot remove or disable
// what it installs. The allow list only exempts from the block list.
//
// THE NAMES come from the Edge Add-ons store, by ID, through TunoAddons
// (js/addons.js) — never from a guess: an ID the store does not know is
// a finding (⚠ not in the store), the two Edge Copilot sidebar components
// OIB ships in the force list are 🔒 built-in, and without a lookup route
// a name is whatever the operator or the list said, marked unverified.
//
// THE WRITE is the 🎛 Adjust settings write (js/mdeasr.js): the policy
// read fresh at the dry run, re-read at apply and skipped as drifted if
// it changed, PUT as a whole with only the two collections changed, read
// back to verify. putBody is MdeAsr's — the same body builder, not a copy.
// ======================================================================
const MdeEdgeExt = (() => {
  "use strict";

  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const ID_RE = /^[a-p]{32}$/;
  const EDGE_UPDATE = "https://edge.microsoft.com/extensionwebstorebase/v1/crx";
  const CHROME_UPDATE = "https://clients2.google.com/service/update2/crx";
  // The two Edge Copilot sidebar components OIB puts in the force list so
  // Copilot keeps working under a block list of * — not store extensions,
  // and the store answers 404 for both.
  const BUILT_IN = Object.freeze({
    nkbndigcebkoaejohleckhekfmcecfja: "Edge Copilot sidebar component (built-in)",
    ofefcgjbeghpigppfmkologfjadafddi: "Edge Copilot sidebar component (built-in)",
  });
  const LISTS = Object.freeze({
    force: { word: "Installed silently", setting: "Control which extensions are installed silently", icon: "⬇" },
    allow: { word: "Exempt from the block list", setting: "Allow specific extensions to be installed", icon: "⊕" },
  });
  const EDITED = ["force", "allow"];

  // Which Edge extensions list a settingDefinitionId is, or null.
  //   …~policy~microsoft_edge~extensions_extensioninstallforcelist           → { list: "force", child: false }
  //   …~policy~microsoft_edge~extensions_extensioninstallforcelist_…desc     → { list: "force", child: true }
  function listOf(defId) {
    const m = /~policy~microsoft_edge~extensions_extensioninstall(force|allow|block)list(_extensioninstall(?:force|allow|block)listdesc)?$/.exec(lc(defId));
    return m ? { list: m[1], child: !!m[2] } : null;
  }
  const isExternal = (defId) => /~policy~microsoft_edge~extensions_blockexternalextensions$/.test(lc(defId));

  // ---- entries --------------------------------------------------------
  const isId = (s) => ID_RE.test(String(s || "").trim());
  function parseEntry(raw) {
    const s = String(raw == null ? "" : raw).trim();
    const i = s.indexOf(";");
    const id = lc(i < 0 ? s : s.slice(0, i)).trim();
    const updateUrl = i < 0 ? "" : s.slice(i + 1).trim();
    return { id, updateUrl, raw: s, valid: isId(id) };
  }
  const formatEntry = (e) => e.updateUrl ? `${e.id};${e.updateUrl}` : e.id;
  const storeOf = (e) => !e.updateUrl || lc(e.updateUrl) === EDGE_UPDATE ? "edge" : lc(e.updateUrl) === CHROME_UPDATE ? "chrome" : "other";
  const isBuiltIn = (id) => Object.prototype.hasOwnProperty.call(BUILT_IN, lc(id));

  // What the operator pasted: an ID, "<id>;<url>", an Edge Add-ons link
  // (…/addons/detail/<slug>/<id>) or a Chrome Web Store link
  // (chromewebstore.google.com/detail/<slug>/<id>, or the old
  // chrome.google.com/webstore/detail/…). null when it is none of those.
  function fromInput(text) {
    const s = String(text || "").trim();
    if (!s) return null;
    let m = /microsoftedge\.microsoft\.com\/addons\/detail\/(?:([^/?#]+)\/)?([a-p]{32})(?:[/?#]|$)/i.exec(s);
    if (m) return { id: lc(m[2]), updateUrl: "", store: "edge", slug: m[1] || "" };
    m = /(?:chromewebstore\.google\.com\/detail|chrome\.google\.com\/webstore\/detail)\/(?:([^/?#]+)\/)?([a-p]{32})(?:[/?#]|$)/i.exec(s);
    if (m) return { id: lc(m[2]), updateUrl: CHROME_UPDATE, store: "chrome", slug: m[1] || "" };
    const e = parseEntry(s);
    if (!e.valid) return null;
    return { id: e.id, updateUrl: e.updateUrl, store: storeOf(e), slug: "" };
  }
  // "my-apps-secure-sign-in-ext" → "My apps secure sign in ext"
  function slugName(slug) {
    const words = String(slug || "").split(/[-_]+/).filter(Boolean);
    if (!words.length) return "";
    const s = words.join(" ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---- the settings ------------------------------------------------------
  // Every choice instance of the four Edge extension settings, in either
  // shape a raw /settings list comes in (Graph's wrapper, or the instance).
  function findAll(settings) {
    const out = { force: null, allow: null, block: null, external: null };
    const walk = (inst) => {
      if (!inst || typeof inst !== "object") return;
      if (inst.settingInstance && !inst.settingDefinitionId) { walk(inst.settingInstance); return; }
      const k = listOf(inst.settingDefinitionId);
      if (k && !k.child && inst.choiceSettingValue && !out[k.list]) { out[k.list] = inst; return; }
      if (isExternal(inst.settingDefinitionId) && inst.choiceSettingValue && !out.external) { out.external = inst; return; }
      if (inst.choiceSettingValue) (inst.choiceSettingValue.children || []).forEach(walk);
      if (Array.isArray(inst.choiceSettingCollectionValue)) inst.choiceSettingCollectionValue.forEach((c) => ((c && c.children) || []).forEach(walk));
      if (Array.isArray(inst.groupSettingCollectionValue)) inst.groupSettingCollectionValue.forEach((g) => ((g && g.children) || []).forEach(walk));
      if (inst.groupSettingValue) (inst.groupSettingValue.children || []).forEach(walk);
    };
    (settings || []).forEach(walk);
    return out;
  }
  const isOn = (inst) => !!inst && /_1$/.test(lc(inst.choiceSettingValue && inst.choiceSettingValue.value));
  function valuesOf(inst) {
    if (!inst || !inst.choiceSettingValue) return [];
    const child = (inst.choiceSettingValue.children || []).find((c) => { const k = listOf(c && c.settingDefinitionId); return k && k.child && Array.isArray(c.simpleSettingCollectionValue); });
    return child ? child.simpleSettingCollectionValue.map((v) => String((v && v.value) == null ? "" : v.value).trim()).filter(Boolean) : [];
  }
  // The lists as the policy has them. found: which of the two edited lists
  // the policy carries at all (a policy with neither is not this pane's).
  function listsIn(settings) {
    const f = findAll(settings);
    const out = { found: { force: !!f.force, allow: !!f.allow }, on: { force: isOn(f.force), allow: isOn(f.allow), block: isOn(f.block) }, external: f.external ? isOn(f.external) : null };
    for (const k of ["force", "allow", "block"]) out[k] = (isOn(f[k]) ? valuesOf(f[k]) : []).map(parseEntry);
    return out;
  }
  const isEdgeExtPolicy = (settings) => { const l = listsIn(settings).found; return l.force || l.allow; };

  // Copy of the settings with the force and allow lists replaced. lists:
  // { force: [entry], allow: [entry] } (an absent key leaves that list as it
  // is). An empty list turns the choice off (OIB ships the allow list that
  // way); a non-empty one turns it on with the collection as its child.
  // Never mutates the input.
  function withLists(settings, lists) {
    const copy = JSON.parse(JSON.stringify(settings || []));
    const f = findAll(copy);
    const out = { settings: copy, missing: [] };
    for (const k of EDITED) {
      if (!lists || !Object.prototype.hasOwnProperty.call(lists, k)) continue;
      const inst = f[k];
      if (!inst) { out.missing.push(k); continue; }
      const defId = inst.settingDefinitionId;
      const base = String(defId).replace(/_[01]$/, "");
      const entries = (lists[k] || []).map((e) => typeof e === "string" ? e : formatEntry(e)).filter(Boolean);
      if (!entries.length) { inst.choiceSettingValue.value = `${base}_0`; inst.choiceSettingValue.children = []; continue; }
      inst.choiceSettingValue.value = `${base}_1`;
      const childId = `${base}_${lc(base).slice(lc(base).lastIndexOf("_") + 1)}desc`;
      const kept = (inst.choiceSettingValue.children || []).find((c) => { const kk = listOf(c && c.settingDefinitionId); return kk && kk.child; });
      const child = kept || { "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance", settingDefinitionId: childId };
      child.simpleSettingCollectionValue = entries.map((v) => ({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue", value: v }));
      inst.choiceSettingValue.children = [child];
    }
    return out;
  }
  const same = (a, b) => { const A = (a || []).map((e) => lc(typeof e === "string" ? e : formatEntry(e))).sort(), B = (b || []).map((e) => lc(typeof e === "string" ? e : formatEntry(e))).sort(); return A.length === B.length && A.every((x, i) => x === B[i]); };
  // Read-back: both lists are exactly what was asked for.
  const verified = (settings, lists) => { const now = listsIn(settings); return EDITED.every((k) => !lists || !Object.prototype.hasOwnProperty.call(lists, k) || same(now[k], lists[k])); };
  const putBody = (policy, settings) => MdeAsr.putBody(policy, settings);

  // ---- the plan ------------------------------------------------------------
  // edits: Map "<list>|<id>" → { op: "add" | "remove", entry: { id, updateUrl } }.
  // The lists after the edits, and the changes as they will be shown; an
  // add of an ID the list already has, or a removal of one it does not
  // have, is dropped as no change.
  const keyOf = (list, id) => `${list}|${lc(id)}`;
  function planOf(now, edits) {
    const after = {}, changes = [];
    for (const k of EDITED) {
      const have = (now[k] || []).slice();
      const ids = new Set(have.map((e) => e.id));
      const keep = [];
      for (const e of have) {
        const ed = edits.get(keyOf(k, e.id));
        if (ed && ed.op === "remove") { changes.push({ list: k, op: "remove", entry: { id: e.id, updateUrl: e.updateUrl } }); continue; }
        keep.push({ id: e.id, updateUrl: e.updateUrl });
      }
      for (const [key, ed] of edits) {
        if (ed.op !== "add" || key.split("|")[0] !== k) continue;
        const id = lc(ed.entry && ed.entry.id);
        if (!isId(id) || ids.has(id)) continue;
        const entry = { id, updateUrl: (ed.entry.updateUrl || "").trim() };
        keep.push(entry); ids.add(id);
        changes.push({ list: k, op: "add", entry });
      }
      after[k] = keep;
    }
    return { after, changes };
  }
  // The undo of a run: every verified change the other way round.
  const reverse = (changes) => (changes || []).map((c) => ({ list: c.list, op: c.op === "add" ? "remove" : "add", entry: { id: c.entry.id, updateUrl: c.entry.updateUrl || "" } }));
  const editsOf = (changes) => { const m = new Map(); for (const c of changes || []) m.set(keyOf(c.list, c.entry.id), { op: c.op, entry: { id: lc(c.entry.id), updateUrl: c.entry.updateUrl || "" } }); return m; };

  // ---- the approved list ---------------------------------------------------
  // A TSV or CSV with a header row — the columns are found by name, in any
  // order: Extension (the name), Browser, Installed, Band, ApPo, Closest
  // ApPo application. A file with no such header is one name per line.
  const COLS = [
    ["name", /^(extension|name|extension name)$/i],
    ["browser", /^browser$/i],
    ["installed", /^installed$/i],
    ["band", /^band$/i],
    ["appo", /^(appo|found in appo)$/i],
    ["closest", /^closest appo application$/i],
    ["id", /^(id|extension id|crx ?id)$/i],
  ];
  function splitLine(line, sep) {
    if (sep === "\t") return line.split("\t").map((c) => c.trim());
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; continue; }
      if (ch === sep && !q) { out.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  function parseApproved(text) {
    const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
    const out = { rows: [], columns: [], total: 0, edge: 0, chrome: 0, plain: false };
    if (!lines.length) return out;
    const sep = lines[0].includes("\t") ? "\t" : (lines[0].split(";").length > lines[0].split(",").length ? ";" : ",");
    const head = splitLine(lines[0], sep);
    const idx = {};
    head.forEach((h, i) => { for (const [k, re] of COLS) if (idx[k] === undefined && re.test(h.trim())) idx[k] = i; });
    const hasHeader = idx.name !== undefined;
    if (!hasHeader) {
      out.plain = true;
      for (const l of lines) { const name = l.trim(); if (name) out.rows.push({ name, browser: "", installed: null, band: "", appo: "", closest: "", id: "", edge: true, key: lc(name) }); }
    } else {
      out.columns = Object.keys(idx);
      for (const l of lines.slice(1)) {
        const c = splitLine(l, sep);
        const name = (c[idx.name] || "").trim();
        if (!name) continue;
        const browser = idx.browser === undefined ? "" : (c[idx.browser] || "").trim();
        const n = idx.installed === undefined ? NaN : Number(c[idx.installed]);
        const id = idx.id === undefined ? "" : lc((c[idx.id] || "").trim());
        out.rows.push({ name, browser, installed: isNaN(n) ? null : n, band: idx.band === undefined ? "" : (c[idx.band] || "").trim(),
          appo: idx.appo === undefined ? "" : (c[idx.appo] || "").trim(), closest: idx.closest === undefined ? "" : (c[idx.closest] || "").trim(),
          id: isId(id) ? id : "", edge: !browser || /edge/i.test(browser), key: `${lc(name)}|${lc(browser)}` });
      }
    }
    out.total = out.rows.length;
    out.edge = out.rows.filter((r) => r.edge).length;
    out.chrome = out.total - out.edge;
    return out;
  }
  // The store's answer to a name: one hit it names, or null when the hits
  // do not decide it (none, or several that fit). hits: [{ name, id }].
  function matchHits(name, hits) {
    const n = lc(name).trim();
    const list = (hits || []).filter((h) => h && isId(h.id));
    if (!n || !list.length) return null;
    const exact = list.filter((h) => lc(h.name).trim() === n);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;
    const starts = list.filter((h) => lc(h.name).startsWith(n) || n.startsWith(lc(h.name).trim()));
    return starts.length === 1 ? starts[0] : null;
  }

  return { ID_RE, EDGE_UPDATE, CHROME_UPDATE, BUILT_IN, LISTS, EDITED, listOf, isId, parseEntry, formatEntry, storeOf, isBuiltIn, fromInput, slugName,
    findAll, listsIn, isEdgeExtPolicy, withLists, verified, putBody, keyOf, planOf, reverse, editsOf, parseApproved, matchHits, same };
})();

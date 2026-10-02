// ======================================================================
// TunoAddons — the Microsoft Edge Add-ons store, by ID and by name
// (build 10678, for T28's 🧩 Edge extensions)
//
// The store answers two undocumented calls its own page makes:
//   GET /addons/getproductdetailsbycrxid/<id>?hl=en-US&gl=NL
//     → { name, developer, version, category, lastUpdateDate, activeInstallCount, averageRating, ratingCount, crxId, … }, 404 for an unknown ID
//   GET /addons/v4/getfilteredorderedsearch?…&Query=<name>
//     → { extensionList: [{ name, crxId, developerName, averageRating, noOfRatings, shortDescription }] }
// Neither sends CORS headers (checked 2 Oct 2026 from a page on another
// origin: every fetch is refused), so a page on cloudfellows.dev cannot
// call microsoftedge.microsoft.com itself. THE ROUTE is a base URL the
// operator sets once — a same-origin path a self-hosted instance's web
// server forwards (/addons), or a small relay of their own — and TUNO
// calls <route>/getproductdetailsbycrxid/<id> and
// <route>/v4/getfilteredorderedsearch?…, expecting the store's own JSON
// back. A cross-origin route must also be in index.html's connect-src;
// nothing here can widen the CSP. Without a route every lookup answers
// "no route" and the pane works in paste mode: IDs and store links, names
// as the operator or the list gave them, marked unverified.
//
// The route is per browser (localStorage), like the self-host branding —
// it is a deployment's property, not a tenant's. Answers are cached a day
// per ID / per query, so a pane re-render never re-asks.
// ======================================================================
const TunoAddons = (() => {
  "use strict";
  const ROUTE_KEY = "tuno.addons.route";
  const CACHE_KEY = "tuno.addons.cache";
  const TTL = 24 * 60 * 60 * 1000;
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  let mem = null;   // the cache, read once from localStorage

  function store() {
    try { return window.localStorage; } catch { return null; }
  }
  function route() {
    const s = store();
    let v = "";
    try { v = s ? String(s.getItem(ROUTE_KEY) || "") : ""; } catch { v = ""; }
    return v.trim().replace(/\/+$/, "");
  }
  function setRoute(v) {
    const s = store();
    const val = String(v || "").trim().replace(/\/+$/, "");
    try { if (s) { if (val) s.setItem(ROUTE_KEY, val); else s.removeItem(ROUTE_KEY); } } catch { /* private window */ }
    return val;
  }
  const hasRoute = () => !!route();
  // What a route is: a same-origin path ("/addons") or an absolute http(s)
  // URL. Anything else is refused with the reason.
  function checkRoute(v) {
    const val = String(v || "").trim();
    if (!val) return { ok: true, value: "" };
    if (/^\/[^\s]*$/.test(val)) return { ok: true, value: val.replace(/\/+$/, "") };
    if (/^https?:\/\/[^\s]+$/i.test(val)) return { ok: true, value: val.replace(/\/+$/, "") };
    return { ok: false, why: "A route is a path on this site (/addons) or an https URL." };
  }
  function crossOrigin(r) {
    const v = r || route();
    if (!v || v.startsWith("/")) return false;
    try { return new URL(v).origin !== window.location.origin; } catch { return true; }
  }

  function cache() {
    if (mem) return mem;
    mem = {};
    const s = store();
    try { const raw = s ? s.getItem(CACHE_KEY) : null; if (raw) mem = JSON.parse(raw) || {}; } catch { mem = {}; }
    return mem;
  }
  function remember(key, value) {
    const c = cache();
    c[key] = { at: Date.now(), value };
    // keep it small: drop what is older than a day, then the oldest beyond 400
    const keys = Object.keys(c);
    for (const k of keys) if (Date.now() - (c[k].at || 0) > TTL) delete c[k];
    const left = Object.keys(c).sort((a, b) => (c[a].at || 0) - (c[b].at || 0));
    while (left.length > 400) delete c[left.shift()];
    const s = store();
    try { if (s) s.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* full or private */ }
  }
  function recall(key) {
    const e = cache()[key];
    return e && Date.now() - (e.at || 0) <= TTL ? e.value : null;
  }
  function forget() { mem = {}; const s = store(); try { if (s) s.removeItem(CACHE_KEY); } catch { /* ignore */ } }

  // One GET through the route. The error wording is what the pane shows.
  async function ask(path) {
    const r = route();
    if (!r) throw new Error("no route");
    const url = `${r}${path}`;
    let res;
    try { res = await window.fetch(url, { method: "GET", headers: { Accept: "application/json" } }); }
    catch (e) { throw new Error(`the route did not answer (${String(e && e.message || e)})${crossOrigin(r) ? " — is its host in the page's connect-src?" : ""}`); }
    if (res.status === 404) return { status: 404, body: null };
    if (!res.ok) throw new Error(`the route answered HTTP ${res.status}`);
    let body = null;
    try { body = await res.json(); } catch { throw new Error("the route did not answer JSON"); }
    return { status: res.status, body };
  }
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : null; };
  const whenOf = (v) => { const n = num(v); if (n == null) return ""; const d = new Date(n > 1e12 ? n : n * 1000); return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); };

  // The store's answer for an ID: { status: "ok", name, developer, version, category, installs, rating, ratings, updated }
  // or { status: "404" }. Cached a day. Throws on a route that does not answer.
  async function detail(id) {
    const key = `id:${lc(id)}`;
    const hit = recall(key);
    if (hit) return hit;
    const r = await ask(`/getproductdetailsbycrxid/${encodeURIComponent(lc(id))}?hl=en-US&gl=NL`);
    const b = r.body;
    const out = r.status === 404 || !b || !b.name ? { status: "404" }
      : { status: "ok", name: String(b.name), developer: String(b.developer || b.developerName || ""), version: String(b.version || ""), category: String(b.category || ""),
        installs: num(b.activeInstallCount), rating: num(b.averageRating), ratings: num(b.ratingCount), updated: whenOf(b.lastUpdateDate), mv2: !!b.isManifestV2 };
    remember(key, out);
    return out;
  }
  // The store's hits for a name: [{ name, id, developer, rating, ratings, description }]. Cached a day.
  async function search(q) {
    const query = String(q || "").trim();
    if (!query) return [];
    const key = `q:${lc(query)}`;
    const hit = recall(key);
    if (hit) return hit;
    const r = await ask(`/v4/getfilteredorderedsearch?hl=en-US&gl=NL&filteredCategories=Edge-Extensions&filteredAddon=0&filterFeaturedAddons=false&filteredRating=0&sortBy=Relevance&pgNo=1&Query=${encodeURIComponent(query)}`);
    const list = (r.body && Array.isArray(r.body.extensionList)) ? r.body.extensionList : [];
    const out = list.filter((x) => x && /^[a-p]{32}$/.test(lc(x.crxId))).map((x) => ({ name: String(x.name || ""), id: lc(x.crxId), developer: String(x.developerName || ""),
      rating: num(x.averageRating), ratings: num(x.noOfRatings), description: String(x.shortDescription || "") }));
    remember(key, out);
    return out;
  }

  return { ROUTE_KEY, CACHE_KEY, route, setRoute, hasRoute, checkRoute, crossOrigin, detail, search, forget, _cached: recall };
})();

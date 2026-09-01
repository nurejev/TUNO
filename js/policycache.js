// ======================================================================
// THE SHARED POLICY CACHE (build 10520). One tenant read, held for every
// tool that lists policies — so opening 🗂 Policy overview or ✏️ the
// Assignment editor shows the tenant instead of a Read button, and the
// button becomes what it always should have been: a refresh.
//
// THE READ IS T05's collect(), WHOLE — the same thirteen-surface read,
// with keepRaw so T11's write pipeline can consume the untouched Graph
// objects. This module adds NO reading of its own: it is a holder and a
// deduper around the one implementation (the T12 rule).
//
// CONSENT IS NEVER ASKED FROM HERE. The standing rule is scopes at the
// click, and a background read has no click — warm() runs the prefetch
// ONLY when Graph.silentScopes says the consent already exists (a
// returning admin, a warm MSAL cache, demo mode). A first-time tenant
// sees no new prompt at sign-in; its tools ask at the click exactly as
// before, and THAT read fills this cache for the rest of the session.
//
// STALENESS IS SAID, NEVER HIDDEN. get() hands out the result with its
// read time; the tools print "from the sign-in read at HH:MM" beside a
// refresh that re-reads. A WRITE makes the cache a liar, so writers call
// invalidate() — T11 does after apply — and the generation counter makes
// a read that STARTED before the invalidation unable to repopulate the
// cache with pre-write data.
//
// Sign-out calls clear(): the cache holds tenant data, and the next
// sign-in may be a different tenant.
// ======================================================================
const PolicyCache = (() => {
  "use strict";

  let res = null;        // the last completed Docs.collect result
  let at = 0;            // when it completed (Date.now())
  let warmed = false;    // true when res came from the sign-in prefetch
  let inflight = null;   // the running read's promise, for dedupe
  let gen = 0;           // bumped by invalidate()/clear(); stale reads discard

  // While a read runs, every interested tool can watch it — the prefetch
  // has no screen, but a tool opened mid-prefetch attaches its progress
  // line to the same read instead of starting a second one.
  const statusFns = new Set();
  const status = (m) => statusFns.forEach((f) => { try { f(m); } catch { /* a broken listener must not sink the read */ } });

  const scopesNeeded = () => [...new Set([...Docs.scopesFor(Docs.allSectionIds()), ...Graph.SCOPES.directory])];

  // The one read. Dedupes: a second caller while one runs gets the same
  // promise (and its onStatus joins the watchers).
  function read(onStatus) {
    if (onStatus) statusFns.add(onStatus);
    if (!inflight) {
      const g = gen;
      inflight = Docs.collect({ onStatus: status, keepRaw: true })
        .then((r) => {
          inflight = null; statusFns.clear();
          // A read that started before an invalidation is PRE-WRITE data
          // wearing a fresh timestamp — it must not become the cache.
          if (g === gen) {
            res = r; at = Date.now();
            // The result describes itself (build 10523): a tool holding the
            // res can say when the tenant was read without asking the cache,
            // and a document exported from it can print the read time.
            r.readAt = at;
          }
          return r;
        })
        .catch((e) => { inflight = null; statusFns.clear(); throw e; });
    }
    return inflight;
  }

  // The sign-in prefetch. Silent consent check first; a `false` there is a
  // cold start, not an error, and a FAILED prefetch read is the same — the
  // tools fall back to their own click-time reads, which is yesterday's
  // behaviour exactly.
  async function warm() {
    if (res || inflight) return;
    let okScopes = false;
    try { okScopes = await Graph.silentScopes(scopesNeeded()); } catch { okScopes = false; }
    if (!okScopes) return;
    try { await read(); warmed = true; if (res) res.fromWarm = true; } catch { /* cold start */ }
  }

  // Refresh: a deliberate fresh read. An inflight read is already the
  // freshest thing available (it started seconds ago), so attach to it
  // rather than queueing a second sweep behind it.
  function refresh(onStatus) {
    if (!inflight) { res = null; at = 0; warmed = false; }
    return read(onStatus);
  }

  // A write happened: whatever is held describes the tenant before it.
  function invalidate() { res = null; at = 0; warmed = false; gen++; }

  // Sign-out: same as invalidate, but also the name says why it is called.
  function clear() { invalidate(); }

  const timeLabel = () => {
    if (!at) return "";
    try { return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
    catch { return new Date(at).toISOString().slice(11, 16); }
  };

  return {
    warm, read, refresh, invalidate, clear,
    get: () => res,
    reading: () => !!inflight,
    readAt: () => at,
    timeLabel,
    fromSignIn: () => warmed,
    scopesNeeded,
  };
})();

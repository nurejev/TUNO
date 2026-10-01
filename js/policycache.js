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
  // When a write last made the cache a liar (build 10671): Home's overview
  // says "the policies changed in this session" rather than "not read yet".
  // Sign-out's clear() resets it — the next session has written nothing.
  let dropped = 0;

  // While a read runs, every interested tool can watch it — the prefetch
  // has no screen, but a tool opened mid-prefetch attaches its progress
  // line to the same read instead of starting a second one.
  const statusFns = new Set();
  // WHETHER THE HELD READ CARRIES SCRIPT BODIES (build 10594). Graph's list
  // read does not return scriptContent; a GET per script does. Seven tools
  // share this cache and want none of that traffic, so bodies are asked for
  // rather than assumed — and the cache remembers whether what it holds has
  // them, so a tool that needs them can tell a bodies-less read from a
  // bodies-full one instead of guessing from the data.
  let hasBodies = false;
  const status = (m) => statusFns.forEach((f) => { try { f(m); } catch { /* a broken listener must not sink the read */ } });
  // WHO WANTS TO KNOW WHEN THE HELD READ CHANGES (build 10671, for Home's
  // overview, which has no screen hook firing while the sign-in read lands
  // under it): "start" when a read begins, "done" when one lands, "failed",
  // "dropped" when a write invalidates, "cold" when the sign-in prefetch
  // finds no consent. A listener that throws never sinks the read.
  const watchers = new Set();
  const emit = (kind) => watchers.forEach((f) => { try { f(kind); } catch { /* ignore */ } });
  let warming = false;      // the prefetch's silent consent check is running
  let warmPending = false;  // the read about to start IS the sign-in prefetch

  const scopesNeeded = () => [...new Set([...Docs.scopesFor(Docs.allSectionIds()), ...Graph.SCOPES.directory])];

  // The one read. Dedupes: a second caller while one runs gets the same
  // promise (and its onStatus joins the watchers).
  let wantBodies = false;
  function read(onStatus) {
    if (onStatus) statusFns.add(onStatus);
    if (!inflight) {
      const g = gen, fromWarm = warmPending;
      warmPending = false;
      inflight = Docs.collect({ onStatus: status, keepRaw: true, bodies: wantBodies })
        .then((r) => {
          inflight = null; statusFns.clear();
          // A read that started before an invalidation is PRE-WRITE data
          // wearing a fresh timestamp — it must not become the cache.
          if (g === gen) {
            res = r; at = Date.now(); hasBodies = wantBodies;
            r.hasBodies = wantBodies;
            // The result describes itself (build 10523): a tool holding the
            // res can say when the tenant was read without asking the cache,
            // and a document exported from it can print the read time.
            r.readAt = at;
            // set here rather than after warm()'s await (10671), so a
            // listener told "done" already knows where the read came from
            warmed = fromWarm;
            if (fromWarm) r.fromWarm = true;
          }
          emit("done");
          return r;
        })
        .catch((e) => { inflight = null; statusFns.clear(); emit("failed"); throw e; });
      emit("start");
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
    warming = true;
    try { okScopes = await Graph.silentScopes(scopesNeeded()); } catch { okScopes = false; }
    warming = false;
    if (!okScopes) { emit("cold"); return; }
    if (res || inflight) return;            // a click read while the check ran
    warmPending = true;                     // read() marks its result as the sign-in one
    try { await read(); } catch { /* cold start */ }
  }

  // Refresh: a deliberate fresh read. An inflight read is already the
  // freshest thing available (it started seconds ago), so attach to it
  // rather than queueing a second sweep behind it.
  // `bodies` asks for the per-object script read. A refresh that wants
  // bodies when the inflight read was NOT asked for them cannot attach to
  // it — that read will answer without the thing being asked for — so it
  // waits for it and then reads again.
  function refresh(onStatus, opts) {
    const bodies = !!(opts && opts.bodies);
    if (inflight && (!bodies || wantBodies)) return read(onStatus);
    const start = () => { res = null; at = 0; warmed = false; wantBodies = bodies || wantBodies; return read(onStatus); };
    return inflight ? inflight.catch(() => {}).then(start) : start();
  }

  // A write happened: whatever is held describes the tenant before it.
  const drop = () => { res = null; at = 0; warmed = false; hasBodies = false; gen++; };
  function invalidate() { drop(); dropped = Date.now(); emit("dropped"); }

  // Sign-out: same as invalidate, but also the name says why it is called —
  // and the next session has written nothing, so nothing was dropped.
  function clear() { drop(); dropped = 0; emit("cleared"); }

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
    droppedAt: () => (res ? 0 : dropped),
    warming: () => warming,
    on: (fn) => { watchers.add(fn); return () => watchers.delete(fn); },
    hasBodies: () => hasBodies,
    scopesNeeded,
  };
})();

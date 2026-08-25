// ======================================================================
// TUNO — Microsoft Graph.
//
// The first thing in TUNO that talks to a tenant, and the first that WRITES
// to one. Two rules follow from that and are enforced here rather than left
// to each caller:
//
//   1. SCOPES ARE ASKED FOR ON THE CLICK, never at sign-in. Signing in to
//      read an XML in your own browser should not hand TUNO the right to
//      create configuration profiles. Every call names the scopes it needs
//      and consent is requested at that moment — ENCA's incremental model.
//
//   2. A FAILED WRITE MUST SAY WHY IN THE TENANT'S OWN WORDS. Graph is
//      specific about refusals — a missing scope, an admin-consent
//      requirement and a licence problem are three different sentences —
//      and paraphrasing them into "something went wrong" is how an admin
//      ends up guessing at their own tenant. The message, code and
//      request-id come back untouched.
//
// There is no retry-on-write. A POST that timed out may or may not have
// created something, and the honest answer is to say so and let the person
// look, not to send it again and risk two profiles fighting over one CSP
// node.
//
// ----------------------------------------------------------------------
// THE READ LAYER (build 10316). Everything above was written for one act:
// create a profile, assign it, stop. The Intune tools on the roadmap ask a
// different question — read the whole tenant — and that needs four things
// the write path deliberately does not have. All four are ENCA's, ported
// rather than reinvented (see enca/js/graph.js):
//
//   3. READS RETRY, WRITES DO NOT. Graph answers a tenant-wide sweep with
//      429 and a Retry-After header saying how long to wait. Honouring it
//      is the difference between a sweep that finishes and one that dies at
//      the first quota. A read is idempotent, so retrying it is free; the
//      rule in point 2 above is unchanged for POST/PATCH/DELETE.
//
//   4. THE TOKEN NEVER LEAVES GRAPH. Every URL is checked against the host
//      before an Authorization header is attached. The write path could get
//      away without it because it only ever built its own paths; a read
//      layer that follows @odata.nextLink is following a URL the SERVER
//      chose, and that is a different trust question.
//
//   5. BETA IS A SEPARATE BASE, NOT A STRING SWAP. Almost every Intune
//      assignment surface — configurationPolicies, deviceHealthScripts,
//      auditEvents, roleAssignments — is absent or incomplete on v1.0.
//      Naming the base at the call site keeps it obvious which endpoints
//      carry a stability caveat.
//
//   6. N+1 IS A POOL, NOT A LOOP. Settings-catalog settings, ADMX
//      definitionValues and script bodies are one extra GET per object.
//      Serially at 100ms apiece — the PowerShell originals' approach — a
//      large tenant takes minutes. `pool()` bounds the concurrency instead,
//      and `batch()` folds per-object questions into $batch's 20-per-trip.
// ======================================================================
const Graph = (() => {
  "use strict";

  // app.js owns the MSAL instance; it hands us a way to reach it after init
  // rather than us reaching into its closure.
  let provider = null;
  function useProvider(p) { provider = p; }

  const app = () => (provider && provider.getApp && provider.getApp()) || null;
  const account = () => (provider && provider.getAccount && provider.getAccount()) || null;
  const signedIn = () => demo || !!(app() && account());

  // ---------- demo mode ----------
  //
  // THE WHOLE OF DEMO MODE IS THESE FEW LINES. Every read and every write in
  // every tool passes through call() below, so standing here once is enough:
  // no tool knows demo mode exists, no tool has a branch for it, and a tool
  // written next year gets it for nothing. ENCA needed roughly eighty
  // branches for the same feature because it had no single place to stand —
  // that difference is architectural, not effort.
  //
  // The flag is one-way ON PURPOSE. A session that has looked at fake data
  // must not be able to slide back into a real tenant with a stale screen
  // still up; leaving the demo is a page load, which is also what makes the
  // "am I looking at real data?" question answerable by looking at the URL.
  let demo = false;
  const useDemo = () => { demo = true; };
  const isDemo = () => demo;
  const DEMO_LATENCY = () => (typeof TUNO_DEMO_GRAPH !== "undefined" ? TUNO_DEMO_GRAPH.LATENCY_MS : 0);

  // The scopes each capability needs, named where they are used so a reader
  // can see what a button costs before pressing it.
  //
  // READ AND WRITE ARE SEPARATE ENTRIES ON PURPOSE, even where they cover the
  // same resource. `config` reads configuration; `profiles` creates it. A tool
  // that only ever reads must never be able to reach for the write scope by
  // sharing a constant with one that does — that is how a read-only tool
  // quietly acquires the right to change a tenant.
  const SCOPES = {
    // write — T01 deploy, and (later) R09 restore
    profiles: ["DeviceManagementConfiguration.ReadWrite.All"],
    // write — T01's Remediation deploy only. Create/Update deviceHealthScript
    // accept ONLY this scope (the tenant said so before the docs did) — the
    // Configuration write scope does not cover them.
    scriptsWrite: ["DeviceManagementScripts.ReadWrite.All"],
    // read
    config: ["DeviceManagementConfiguration.Read.All"],
    apps: ["DeviceManagementApps.Read.All"],
    scripts: ["DeviceManagementScripts.Read.All"],
    devices: ["DeviceManagementManagedDevices.Read.All"],
    service: ["DeviceManagementServiceConfig.Read.All"],
    rbac: ["DeviceManagementRBAC.Read.All"],
    // The ENTRA device object, which is not the Intune managedDevice record.
    // Intune's own scope reads the enrolment; only the directory can say which
    // groups a machine is in, and T06 answers "why did this device get that
    // policy" by walking exactly that. Added at build 10330 with the tool that
    // needs it — the registration script's rule, not an exception to it.
    deviceObjects: ["Device.Read.All"],
    groups: ["Group.Read.All"],
    groupMembers: ["GroupMember.Read.All"],
    directory: ["User.Read.All", "Group.Read.All"],
    // Windows LAPS escrow METADATA — device name and backup time, never the
    // password. Added at build 10429 with T18 (R29), the R18 rule: a new
    // scope goes on in the open, with the tool that needs it. ReadBasic is
    // deliberate — DeviceLocalCredential.Read.All returns password values
    // and belongs to R10's helpdesk viewer if that ever ships, not to an
    // audit. Graph also gates this endpoint on the CALLER'S directory role
    // (Intune Administrator among them), so consent alone does not open it —
    // T18's screen says so rather than printing a bare 403.
    laps: ["DeviceLocalCredential.ReadBasic.All"],
  };

  // Every Intune assignment surface these tools read — configurationPolicies,
  // deviceHealthScripts, deviceShellScripts, auditEvents, roleAssignments — is
  // either absent from v1.0 or missing the expands that make it useful. beta is
  // not an optimisation here, it is the only endpoint that answers.
  const BETA = "https://graph.microsoft.com/beta";

  // A refusal we can explain is worth more than a stack trace. `kind` lets
  // the UI decide what to offer (re-consent, an admin-consent link, a wait)
  // without re-parsing the message.
  class GraphError extends Error {
    constructor(kind, message, extra) {
      super(message);
      this.name = "GraphError";
      this.kind = kind;                       // auth | consent | admin | throttled | notfound | graph | network
      Object.assign(this, extra || {});
    }
  }

  // Admin consent for the whole app, for a tenant whose administrator has to
  // grant it once. Built from the live clientId so a fork with its own
  // registration gets its own URL rather than Limon-IT's.
  function adminConsentUrl() {
    const cid = encodeURIComponent(AUTH_CONFIG.clientId);
    const uri = encodeURIComponent(location.origin + location.pathname.replace(/index\.html$/, ""));
    return `https://login.microsoftonline.com/organizations/adminconsent?client_id=${cid}&redirect_uri=${uri}`;
  }

  // Which scopes this session has actually been granted, read from the scp
  // claim of every token that comes back. Lets a caller check BEFORE starting
  // a long run whether it is about to need a popup — synchronously, so the
  // check can be the first statement of a click handler.
  const granted = new Set();
  const scopeName = (s) => String(s).replace(/^https?:\/\/[^/]+\//i, "").toLowerCase();
  function noteScopes(accessToken) {
    try {
      const p = JSON.parse(atob(String(accessToken).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      (p.scp || "").split(" ").filter(Boolean).forEach((s) => granted.add(scopeName(s)));
    } catch { /* opaque or malformed token — leave the cache alone */ }
  }
  // In demo mode every scope reads as granted. Not a shortcut: a demo that
  // asked for consent would open a real Microsoft sign-in for a tenant it is
  // not going to touch, which is worse than confusing — it is a login prompt
  // the person did not ask for and cannot usefully answer.
  const hasScopes = (scopes) => demo || (scopes || []).every((s) => granted.has(scopeName(s)));

  // DOES THIS ERROR MEAN "ASK THE USER"?
  //
  // Getting this wrong is not a small bug: answer no to an error that means
  // yes and the app reports a permission failure for something the user was
  // never given the chance to grant. That is exactly what happened — every
  // Intune scope came back
  //
  //   invalid_grant: AADSTS65001: The user or administrator has not consented
  //
  // which is THE consent error, and the old test looked only for
  // interaction_required / consent_required / login_required. AADSTS65001 and
  // invalid_grant matched none of them, so nine surfaces reported "could not
  // be read" without one prompt being shown.
  //
  // MSAL's own InteractionRequiredAuthError is checked first where available;
  // the string tests are the fallback for the shapes it does not wrap.
  function needsInteraction(e) {
    if (!e) return false;
    if (typeof msal !== "undefined" && msal.InteractionRequiredAuthError && e instanceof msal.InteractionRequiredAuthError) return true;
    const s = `${(e.errorCode || "")} ${(e.name || "")} ${(e.message || "")}`;
    return /interaction_required|consent_required|login_required|no_tokens_found|InteractionRequired|invalid_grant/i.test(s)
      || /AADSTS65001|AADSTS50076|AADSTS50079|AADSTS16002|AADSTS50058/i.test(s)
      || /has not consented|monitor_window_timeout/i.test(s);
  }

  // Silent first, popup only when the tenant actually needs to be asked.
  // A popup that appears without a click is blocked by the browser and reads
  // as the app being broken, so every caller is a click handler.
  async function token(scopes) {
    if (!signedIn()) throw new GraphError("auth", "Not signed in. Sign in with an account in the tenant you want to change.");
    const req = { scopes, account: account() };
    try {
      const r = await app().acquireTokenSilent(req);
      noteScopes(r.accessToken);
      return r.accessToken;
    } catch (e) {
      const code = (e && (e.errorCode || e.name)) || "";
      if (!needsInteraction(e))
        throw new GraphError("auth", `Could not get a token for ${scopes.join(", ")}: ${(e && e.message) || code || "unknown error"}`);
      try {
        // NO `prompt`. Passing prompt:"consent" forces the authorization
        // server to re-authenticate as well as re-consent, so every scope
        // asked for on a click walked the admin back through MFA — for a
        // permission grant, not a sign-in. ENCA has never passed it and does
        // not have the problem. It was added in 10310 to make the prompt
        // appear at all, which was the wrong fix for the right symptom: the
        // prompt was missing because needsInteraction() did not recognise
        // AADSTS65001, and 10322 fixed that properly. With that in place
        // this only ever cost an MFA challenge.
        const r = await app().acquireTokenPopup({ scopes, account: account() });
        noteScopes(r.accessToken);
        return r.accessToken;
      } catch (e2) {
        const m = (e2 && e2.message) || "";
        // Admin-consent FIRST: AADSTS90094 also contains the word "consent",
        // so testing for consent before admin classified every admin-only
        // refusal as an ordinary declined prompt — and told the user to try
        // again at something only their administrator can do.
        if (/AADSTS90094|AADSTS65002|admin/i.test(m))
          throw new GraphError("admin", "This permission needs an administrator to consent for the whole tenant — your account cannot grant it for itself.", { consentUrl: adminConsentUrl() });
        if (/AADSTS65001|consent/i.test(m))
          throw new GraphError("consent", "Consent was not granted for " + scopes.join(", ") + ".", { consentUrl: adminConsentUrl() });
        if (isPopupBlocked(e2))
          throw new GraphError("auth", "The consent window was blocked by the browser. Allow pop-ups for this site and run it again.");
        throw new GraphError("auth", m || "Sign-in was cancelled.");
      }
    }
  }

  function isPopupBlocked(e) {
    const c = (e && (e.errorCode || e.name)) || "";
    return /popup_window_error|empty_window_error|popup_blocked/i.test(c)
      || /popup.*(blocked|window)/i.test((e && e.message) || "");
  }

  // ONE CONSENT PER RUN, AT THE TOP OF THE CLICK.
  //
  // Scopes are still asked for on the click and never at sign-in — that rule
  // is unchanged. What changed is WHEN inside the click. Each surface asking
  // for its own scope lazily meant a sweep of nine surfaces wanted nine
  // popups, one per await, several awaits deep. Browsers grant a popup on the
  // user gesture that opened it; the first might have appeared and the other
  // eight would have been blocked, and the run would report eight permission
  // failures for permissions nobody was asked about.
  //
  // So a run declares everything it needs and asks once, before it reads
  // anything. A run limited to configuration profiles still asks only for the
  // configuration scope — the incremental principle is per RUN rather than
  // per request, which is the granularity a person can actually consent to.
  async function ensureScopes(scopes) {
    if (demo) return true;
    const want = [...new Set(scopes || [])];
    if (!want.length || hasScopes(want)) return true;
    if (!signedIn()) throw new GraphError("auth", "Not signed in.");
    try {
      const r = await app().acquireTokenSilent({ scopes: want, account: account() });
      noteScopes(r.accessToken);
      if (hasScopes(want)) return true;
    } catch (e) {
      if (!needsInteraction(e)) throw new GraphError("auth", `Could not get a token for ${want.join(", ")}: ${(e && e.message) || "unknown error"}`);
    }
    // token() carries the full error classification — admin consent, declined
    // consent, blocked popup — so the interactive step goes through it rather
    // than duplicating that here and getting it subtly different.
    await token(want);
    return true;
  }

  // An access token is a bearer credential: whoever holds it is the admin.
  // @odata.nextLink is a URL the SERVER chose, and a read layer follows it
  // without looking — so the host is checked before the header is attached,
  // not after. A relative path is joined to v1.0 as before; anything absolute
  // has to be Graph's own host or it does not get sent at all.
  function safeGraphUrl(path) {
    const full = String(path).startsWith("http") ? String(path) : AUTH_CONFIG.graphBase + path;
    let host = "";
    try { host = new URL(full).hostname; } catch { throw new GraphError("network", `Not a usable URL: ${full}`); }
    if (host !== "graph.microsoft.com") throw new GraphError("network", `Refused to send a tenant token to ${host} — only graph.microsoft.com is allowed.`);
    return full;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // A long back-off looks identical to a hung app unless somebody says so.
  // Tools subscribe to this to keep the person informed while a sweep waits
  // out the tenant's quota.
  let throttleCb = null;
  const setThrottleHandler = (fn) => { throttleCb = fn; };
  const onThrottle = (ms, attempt) => { try { throttleCb && throttleCb(ms, attempt); } catch { /* a broken listener must not sink the read */ } };
  const MAX_RETRIES = 5;

  // `retry` is opt-in and only reads ever pass it — see rule 3 in the header.
  async function call(method, path, { body, scopes, headers, retry } = {}) {
    const url = safeGraphUrl(path);

    // THE INTERCEPTION. Before the token, before the fetch — so a demo
    // session cannot acquire a credential it has no use for, and cannot
    // reach the network even if a route below is missing. The router hands
    // back a fault descriptor rather than throwing, and it is turned into a
    // real GraphError here, so every tool's error handling stays on exactly
    // the path it already knows.
    if (demo) {
      await sleep(DEMO_LATENCY());
      const r = TUNO_DEMO_GRAPH.answer(method, url, body);
      if (r && r.__demoFault) {
        const f = r.__demoFault;
        let kind = "graph";
        if (f.status === 401) kind = "auth";
        else if (f.status === 404) kind = "notfound";
        else if (f.status === 403) kind = /Authorization_RequestDenied|insufficient privileges/i.test(f.message) ? "admin" : "graph";
        throw new GraphError(kind, f.message, { status: f.status, code: f.code, requestId: "demo" });
      }
      return r;
    }

    const send = async () => {
      const at = await token(scopes || SCOPES.profiles);
      return fetch(url, {
        method,
        headers: Object.assign({
          Authorization: "Bearer " + at,
          Accept: "application/json",
        }, body ? { "Content-Type": "application/json" } : {}, headers || {}),
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    let res;
    try {
      res = await send();
    } catch (e) {
      // fetch only rejects on a transport failure. For a POST this is the
      // ambiguous case: it may have reached Graph.
      throw new GraphError("network", `The request did not complete (${(e && e.message) || "network error"}). ${method === "POST" ? "It may or may not have reached the tenant — check in the portal before sending it again." : ""}`.trim());
    }

    // Retry-After is authoritative when the tenant sends it; without it, back
    // off exponentially to a 20-second ceiling. The cushion is because a wait
    // that lands exactly on the boundary is throttled again.
    if (retry) {
      for (let attempt = 0; (res.status === 429 || res.status === 503 || res.status === 504) && attempt < MAX_RETRIES; attempt++) {
        const ra = parseInt(res.headers.get("Retry-After"), 10);
        const waitMs = Number.isFinite(ra) ? ra * 1000 : Math.min(2 ** attempt * 1000, 20000);
        onThrottle(waitMs, attempt + 1);
        await sleep(waitMs + 250);
        try { res = await send(); }
        catch (e) { throw new GraphError("network", `The request did not complete (${(e && e.message) || "network error"}).`); }
      }
    }

    if (res.status === 429 || res.status === 503) {
      const wait = res.headers.get("Retry-After");
      throw new GraphError("throttled", `The tenant is throttling this request${wait ? ` — retry in ${wait}s` : ""}${retry ? `, and it did not let up after ${MAX_RETRIES} attempts` : ""}.`, { retryAfter: wait });
    }
    if (res.status === 204) return null;

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* Graph returned something that is not JSON */ }

    // /$count answers text/plain, so a body that will not parse is not
    // automatically a failure — hand back what came.
    if (res.ok) return json !== null ? json : (text || null);

    const err = (json && json.error) || {};
    const reqId = (json && json.error && json.error.innerError && (json.error.innerError["request-id"] || json.error.innerError.requestId)) || res.headers.get("request-id") || "";
    const msg = err.message || text || `${res.status} ${res.statusText}`;
    let kind = "graph";
    if (res.status === 401) kind = "auth";
    else if (res.status === 404) kind = "notfound";
    else if (res.status === 403) kind = /Authorization_RequestDenied|insufficient privileges|does not have permission/i.test(msg) ? "admin" : "graph";
    throw new GraphError(kind, msg, {
      status: res.status,
      code: err.code || "",
      requestId: reqId,
      consentUrl: kind === "admin" ? adminConsentUrl() : undefined,
    });
  }

  const get = (path, opts) => call("GET", path, opts);
  const post = (path, body, opts) => call("POST", path, Object.assign({ body }, opts));
  // PATCH and DELETE arrive with T14 (build 10384), under the same rules as
  // POST: no retry — an ambiguous timeout is said, not resent — and the
  // tenant's own words on refusal. DELETE's 204 comes back as null above.
  const patch = (path, body, opts) => call("PATCH", path, Object.assign({ body }, opts));
  const del = (path, opts) => call("DELETE", path, opts);

  // ======================================================================
  // READ LAYER
  // ======================================================================

  // ---------- building an OData URL that survives the trip ----------
  //
  // Two ways to get this wrong, and the PowerShell originals demonstrate both.
  //
  // OVER-ENCODING. Run `?$expand=assignments,scheduledActionsForRule($expand=
  // scheduledActionConfigurations)` through URLSearchParams and the $, the
  // parentheses and the commas all come back percent-encoded; Graph answers
  // 400 on a query that is correct. So the STRUCTURE is written raw.
  //
  // UNDER-ENCODING. The originals interpolate a group display name straight
  // into a $filter. A name containing an apostrophe ends the literal early and
  // a name containing an ampersand starts a new query parameter — the second
  // is an injection into the caller's own request. So the VALUES are escaped.
  //
  // The tagged template puts the two on either side of the interpolation:
  //   odata`/groups?$filter=displayName eq '${name}'&$select=id,displayName`
  const litval = (v) => String(v)
    .replace(/'/g, "''")                       // OData escapes a quote by doubling it
    .replace(/[&#+%?]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  const odata = (strings, ...vals) =>
    strings.reduce((acc, s, i) => acc + s + (i < vals.length ? litval(vals[i]) : ""), "");

  const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
  const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

  // ---------- paged reads ----------

  // One page, retrying. `beta` is a flag rather than a base string so a caller
  // cannot accidentally mix the two in one paged sweep.
  const readOne = (path, { scopes, beta, headers } = {}) =>
    get(beta && !String(path).startsWith("http") ? BETA + path : path, { scopes, headers, retry: true });

  // Every page, following the server's @odata.nextLink. The link is absolute
  // and already carries the skip token, so it is passed through untouched —
  // and checked by safeGraphUrl on the way out, because it came from outside.
  //
  // A response with no `value` is a single object, not an empty collection —
  // /deviceManagement/settings answers that way, and dropping it would report
  // a configured tenant as unconfigured.
  async function readAll(path, opts = {}) {
    let out = [], next = opts.beta && !String(path).startsWith("http") ? BETA + path : path, pages = 0;
    while (next) {
      const j = await readOne(next, Object.assign({}, opts, { beta: false }));
      if (j && Array.isArray(j.value)) out = out.concat(j.value);
      else if (j) out.push(j);
      next = (j && j["@odata.nextLink"]) || null;
      if (++pages > 500) throw new GraphError("graph", `Stopped after 500 pages of ${path} — the tenant is returning more than this tool was built to hold.`);
      if (typeof opts.onPage === "function") { try { opts.onPage(out.length, pages); } catch { /* a broken listener must not sink the read */ } }
    }
    return out;
  }

  // ---------- bounded concurrency ----------
  //
  // The N+1 shape: one list call, then one detail call per object (settings
  // for a settings-catalog policy, definitionValues for an ADMX policy, the
  // script body for a platform script). The PowerShell originals do these in
  // series with a 100ms sleep between, which on a tenant with 400 policies is
  // over a minute of waiting on a browser tab.
  //
  // Errors are CAPTURED PER ITEM, never thrown: one policy the signed-in admin
  // cannot read must not lose the other 399. The caller gets
  // { item, value, error } and decides what a partial answer means — which is
  // also why nothing here silently substitutes an empty array for a refusal.
  async function pool(items, worker, limit = 6) {
    const list = Array.from(items || []);
    const out = new Array(list.length);
    let i = 0;
    const run = async () => {
      for (;;) {
        const n = i++;
        if (n >= list.length) return;
        try { out[n] = { item: list[n], value: await worker(list[n], n) }; }
        catch (e) { out[n] = { item: list[n], error: e }; }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, run));
    return out;
  }

  // ---------- $batch ----------
  //
  // Ported from ENCA's gbatch. Twenty requests per round trip, and an
  // individual 429 inside the batch carries its own Retry-After, so those ids
  // are retried rather than failed. Returns { [id]: {body} | {error} } — one
  // entry per request, never throwing for a single failure.
  async function batch(requests, { onProgress, beta, scopes } = {}) {
    const out = {};
    const parts = chunk(requests || [], 20);
    const base = beta ? "/beta" : "/v1.0";
    let done = 0;
    for (const part of parts) {
      const body = {
        requests: part.map((r) => ({
          id: String(r.id),
          method: r.method || "GET",
          url: r.url,
          headers: Object.assign({ ConsistencyLevel: "eventual" }, r.headers || {}),
        })),
      };
      let j = null;
      try {
        j = await call("POST", `https://graph.microsoft.com${base}/$batch`, { body, scopes, retry: true });
      } catch (e) {
        part.forEach((r) => { out[r.id] = { error: (e && e.message) || String(e) }; });
        done += part.length;
        if (onProgress) { try { onProgress(done, requests.length); } catch { /* ignore */ } }
        continue;
      }

      const retry = [];
      for (const resp of (j && j.responses) || []) {
        if (resp.status >= 200 && resp.status < 300) out[resp.id] = { body: resp.body };
        else if (resp.status === 429 || resp.status === 503) retry.push(resp);
        else out[resp.id] = {
          error: (resp.body && resp.body.error && resp.body.error.message) || `HTTP ${resp.status}`,
          code: (resp.body && resp.body.error && resp.body.error.code) || "",
          status: resp.status,
        };
      }
      if (retry.length) {
        const waitMs = Math.max(...retry.map((r) => parseInt((r.headers || {})["Retry-After"], 10) || 5)) * 1000;
        onThrottle(waitMs, 1);
        await sleep(waitMs + 250);
        const again = part.filter((r) => retry.some((x) => x.id === String(r.id)));
        Object.assign(out, await batch(again, { beta, scopes }));
      }
      done += part.length;
      if (onProgress) { try { onProgress(done, requests.length); } catch { /* ignore */ } }
    }
    return out;
  }

  // ---------- GUID → name ----------
  //
  // An Intune assignment names a group by GUID and nothing else, so a report
  // that does not resolve them is a page of GUIDs. The PowerShell originals
  // resolve one at a time by PROBING — GET /users/{id}, and if that fails GET
  // /groups/{id} — which is up to two round trips per principal.
  //
  // getByIds answers a thousand in one, and answers with the object's type, so
  // no probing is needed. An id that cannot be resolved is simply absent from
  // the response: the resolver hands back the GUID itself rather than a blank,
  // because "60b8…" is at least searchable in the portal and "" is not.
  async function resolveNames(ids, { types } = {}) {
    const names = {};
    const list = [...new Set((ids || []).map(String).filter(isGuid))];
    for (const part of chunk(list, 1000)) {
      try {
        const j = await post("/directoryObjects/getByIds", {
          ids: part,
          types: types || ["user", "group", "servicePrincipal", "device"],
        }, { scopes: SCOPES.directory, retry: true });
        ((j && j.value) || []).forEach((o) => {
          names[o.id] = {
            name: o.displayName || o.id,
            type: String(o["@odata.type"] || "").replace(/^#?microsoft\.graph\./, "") || "directoryObject",
            upn: o.userPrincipalName || "",
            mail: o.mail || "",
          };
        });
      } catch (e) {
        // A tenant that will not grant User.Read.All still deserves the rest of
        // the report. Recorded, not swallowed: the caller can say "names could
        // not be resolved" instead of showing GUIDs with no explanation.
        names.__error = (e && e.message) || String(e);
      }
    }
    const lookup = (id) => (names[id] && names[id].name) || id;
    lookup.entry = (id) => names[id] || null;
    lookup.error = names.__error || null;
    lookup.resolved = Object.keys(names).filter((k) => k !== "__error").length;
    return lookup;
  }

  // ---------- Intune device configuration profiles ----------

  // Everything Intune holds as a Windows custom profile. Read WHOLE, not
  // filtered server-side: the collision test has to look inside omaSettings,
  // and $filter cannot see in there.
  async function customProfiles() {
    const r = await get("/deviceManagement/deviceConfigurations?$top=999", { scopes: SCOPES.profiles });
    return (r && r.value || []).filter((p) => (p["@odata.type"] || "").indexOf("windows10CustomConfiguration") >= 0);
  }

  // TUNO never overwrites a profile it did not create. Two things collide:
  // a profile with the same NAME (the admin will not be able to tell them
  // apart) and a profile writing the same GROUPING (they fight over one CSP
  // node on the device, and the loser is whichever synced last).
  function collisions(profiles, displayName, grouping) {
    const name = String(displayName || "").trim().toLowerCase();
    const g = String(grouping || "").trim().toLowerCase();
    const marker = `/applicationlaunchrestrictions/${g}/`;
    const out = [];
    for (const p of profiles) {
      const why = [];
      if (name && String(p.displayName || "").trim().toLowerCase() === name) why.push("same display name");
      if (g && (p.omaSettings || []).some((s) => String(s.omaUri || "").toLowerCase().indexOf(marker) >= 0)) why.push("same AppLocker grouping");
      if (why.length) out.push({ id: p.id, displayName: p.displayName, modified: p.lastModifiedDateTime, why: why.join(" and ") });
    }
    return out;
  }

  const createProfile = (profile) => post("/deviceManagement/deviceConfigurations", profile, { scopes: SCOPES.profiles });

  // ---------- Intune Remediations (deviceHealthScripts) ----------
  //
  // THEIR OWN WRITE SCOPE — 10369 shipped these under SCOPES.profiles on the
  // claim that DeviceManagementConfiguration covers deviceHealthScripts. The
  // tenant refused it, naming the scope it wanted, and the Graph reference
  // agrees: Create/Update deviceHealthScript accept ONLY
  // DeviceManagementScripts.ReadWrite.All (List/Get take the Read variant).
  // So this is a second write scope, asked for — like every scope — at the
  // click that needs it, and it must be consented on the app registration
  // (New-TunoAppRegistration.ps1 lists it) before that ask can succeed.
  // The whole flow runs under ReadWrite: it satisfies the List call too, and
  // asking Read first only to ask ReadWrite two seconds later is two consent
  // prompts for one decision.
  // BETA, absolutely: deviceHealthScripts does not exist on v1.0 (see the
  // read-layer note above), and a relative path here would 404 against the
  // default base while looking perfectly plausible.
  async function remediations() {
    const r = await get(`${BETA}/deviceManagement/deviceHealthScripts?$top=999&$select=id,displayName,lastModifiedDateTime`, { scopes: SCOPES.scriptsWrite });
    return (r && r.value) || [];
  }
  const createRemediation = (body) => post(`${BETA}/deviceManagement/deviceHealthScripts`, body, { scopes: SCOPES.scriptsWrite });

  // ---------- groups, for the pilot assignment ----------

  async function searchGroups(term) {
    const q = String(term || "").replace(/'/g, "''");
    const r = await get(`/groups?$filter=startswith(displayName,'${encodeURIComponent(q)}')&$select=id,displayName,description,groupTypes,securityEnabled,membershipRule&$top=20`, { scopes: SCOPES.groups });
    return (r && r.value) || [];
  }

  // The number that makes an accidental target obvious before it is one.
  async function memberCount(groupId) {
    const r = await call("GET", `/groups/${encodeURIComponent(groupId)}/members/$count`, {
      scopes: SCOPES.groups, headers: { ConsistencyLevel: "eventual", Accept: "text/plain" },
    });
    return r;
  }

  const assignProfile = (profileId, groupId) => post(
    `/deviceManagement/deviceConfigurations/${encodeURIComponent(profileId)}/assign`,
    { assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId } }] },
    { scopes: SCOPES.profiles });

  return {
    useProvider, signedIn, SCOPES, BETA, GraphError, adminConsentUrl,
    get, post, patch, del, customProfiles, collisions, createProfile,
    remediations, createRemediation,
    searchGroups, memberCount, assignProfile,
    // read layer (build 10316)
    readOne, readAll, pool, batch, resolveNames,
    odata, isGuid, chunk, setThrottleHandler, safeGraphUrl,
    // consent (build 10322)
    ensureScopes, hasScopes, needsInteraction, isPopupBlocked,
    // The permissions screen reads this to paint its chips. In demo mode it
    // answers with every scope the app can ask for, marked as granted — and
    // the screen says "simulated" beside them, because a permissions page
    // that quietly showed a real-looking grant would be the one screen in the
    // app where the demo told a lie worth believing.
    grantedScopes: () => (demo
      ? [...new Set(Object.values(SCOPES).flat().map(scopeName))]
      : [...granted]),
    // demo (build 10426)
    useDemo, isDemo,
  };
})();

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
// ======================================================================
const Graph = (() => {
  "use strict";

  // app.js owns the MSAL instance; it hands us a way to reach it after init
  // rather than us reaching into its closure.
  let provider = null;
  function useProvider(p) { provider = p; }

  const app = () => (provider && provider.getApp && provider.getApp()) || null;
  const account = () => (provider && provider.getAccount && provider.getAccount()) || null;
  const signedIn = () => !!(app() && account());

  // The scopes each capability needs, named where they are used so a reader
  // can see what a button costs before pressing it.
  const SCOPES = {
    profiles: ["DeviceManagementConfiguration.ReadWrite.All"],
    groups: ["Group.Read.All"],
  };

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

  // Silent first, popup only when the tenant actually needs to be asked.
  // A popup that appears without a click is blocked by the browser and reads
  // as the app being broken, so every caller is a click handler.
  async function token(scopes) {
    if (!signedIn()) throw new GraphError("auth", "Not signed in. Sign in with an account in the tenant you want to change.");
    const req = { scopes, account: account() };
    try {
      return (await app().acquireTokenSilent(req)).accessToken;
    } catch (e) {
      const code = (e && (e.errorCode || e.name)) || "";
      if (!/interaction_required|consent_required|login_required|no_tokens_found|InteractionRequired/i.test(code + " " + (e && e.message || "")))
        throw new GraphError("auth", `Could not get a token for ${scopes.join(", ")}: ${(e && e.message) || code || "unknown error"}`);
      try {
        return (await app().acquireTokenPopup({ scopes, account: account(), prompt: "consent" })).accessToken;
      } catch (e2) {
        const m = (e2 && e2.message) || "";
        if (/AADSTS65001|consent/i.test(m))
          throw new GraphError("consent", "Consent was not granted for " + scopes.join(", ") + ".", { consentUrl: adminConsentUrl() });
        if (/AADSTS90094|admin/i.test(m))
          throw new GraphError("admin", "This permission needs an administrator to consent for the whole tenant — your account cannot grant it for itself.", { consentUrl: adminConsentUrl() });
        throw new GraphError("auth", m || "Sign-in was cancelled.");
      }
    }
  }

  async function call(method, path, { body, scopes, headers } = {}) {
    const at = await token(scopes || SCOPES.profiles);
    const url = path.startsWith("http") ? path : AUTH_CONFIG.graphBase + path;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: Object.assign({
          Authorization: "Bearer " + at,
          Accept: "application/json",
        }, body ? { "Content-Type": "application/json" } : {}, headers || {}),
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      // fetch only rejects on a transport failure. For a POST this is the
      // ambiguous case: it may have reached Graph.
      throw new GraphError("network", `The request did not complete (${(e && e.message) || "network error"}). ${method === "POST" ? "It may or may not have reached the tenant — check in the portal before sending it again." : ""}`.trim());
    }

    if (res.status === 429 || res.status === 503) {
      const wait = res.headers.get("Retry-After");
      throw new GraphError("throttled", `The tenant is throttling this request${wait ? ` — retry in ${wait}s` : ""}.`, { retryAfter: wait });
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
    useProvider, signedIn, SCOPES, GraphError, adminConsentUrl,
    get, post, customProfiles, collisions, createProfile,
    searchGroups, memberCount, assignProfile,
  };
})();

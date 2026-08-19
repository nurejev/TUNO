// ======================================================================
// TUNO — auth configuration. Same model as ENCA (see its authConfig.js for
// the long version): a SPA using authorization code + PKCE, no client secret.
//
// TWO WAYS TO RUN THIS APP.
//
// 1. SHARED, MULTI-TENANT (the default, what tuno.limon-it.nl will use).
//    One app registration owned by Limon-IT; your tenant consents to it.
//
// 2. YOUR OWN, SINGLE-TENANT. Register TUNO inside your own tenant and serve
//    your own reviewed copy — own client ID, own consent record, own audit
//    trail. Run New-TunoAppRegistration.ps1 -SingleTenant.
//
// To switch to your own registration, either edit the two values below, or —
// better, because it survives a `git pull` from upstream without a conflict —
// drop a js/authConfig.local.js next to this file that sets window.TUNO_AUTH:
//
//   window.TUNO_AUTH = {
//     clientId:  "<your Application (client) ID>",
//     authority: "https://login.microsoftonline.com/<your tenant ID>",
//   };
//
// and add it to index.html immediately before this script. Anything it sets
// wins; anything it omits falls back to the defaults here.
// ======================================================================
const AUTH_CONFIG = Object.assign({
  clientId: "a0ea0fc5-970c-43d9-99ae-559a1cd2755e", // TUNO (Limon-IT) — set by New-TunoAppRegistration.ps1 on 2026-08-19; REPLACE for your own registration
  // "organizations" = any work/school tenant (multi-tenant). For a single-tenant
  // registration use your tenant ID or verified domain instead.
  authority: "https://login.microsoftonline.com/organizations",
  // Base sign-in scope only. AppLocker analysis runs entirely in the browser on
  // an XML you import — it reads NOTHING from the tenant. Tools that do read
  // the tenant (SecureScore visualizer, roadmap R02) ask for their scopes on
  // the click, ENCA-style incremental consent, not up front.
  scopes: ["User.Read"],
  graphBase: "https://graph.microsoft.com/v1.0",
}, (typeof window !== "undefined" && window.TUNO_AUTH) || {});

// ======================================================================
// Self-hosting (beta 10693, parity slices 18 and 19): the image, the
// entrypoint and the first paint — ENCA's R06 machinery ported.
//
//   1. selfhost/docker-entrypoint.sh, run against a copy of the site the
//      way the image runs it (TUNO_ROOT): TUNO_CLIENT_ID / TUNO_TENANT_ID /
//      TUNO_AUTHORITY become one block above js/authConfig.js, idempotent,
//      refused when not a GUID or a plain https URL, nothing at all with no
//      variable set.
//   2. TUNO_BRANDING reaches selfhost-branding.json AND the first paint:
//      the brand is written into js/selfhost-boot.js and that file paints
//      from it with an empty localStorage — the first visit in a browser.
//      ENCA's tools/selfhost-brand-boot.test.cjs, ported.
//   3. The image's contract as files: Dockerfile, .dockerignore, nginx.conf's
//      no-store paths with the headers on each, the publish workflow's
//      repository guard, the compose file and install scripts on :beta.
//
// Needs sh and awk — nginx:alpine's, macOS's and ubuntu's all do. No
// network, no docker: the image itself is built by the workflow.
//
// Run with `npm test`, or alone:  node tests/selfhost/entrypoint.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path } = suite("selfhost");
const os = require("os");
const { spawnSync } = require("child_process");
const { JSDOM } = require("jsdom");

const ENTRY = path.join(ROOT, "selfhost", "docker-entrypoint.sh");
const SHIPPED = {
  auth: fs.readFileSync(path.join(ROOT, "js", "authConfig.js"), "utf8"),
  boot: fs.readFileSync(path.join(ROOT, "js", "selfhost-boot.js"), "utf8"),
};
const CID = "00000000-1111-2222-3333-444444444444", TID = "55555555-6666-7777-8888-999999999999";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
const brand = (extra) => JSON.stringify({
  v: 1,
  brand: Object.assign({
    org: "Contoso", hideOrgName: true, logo: PNG, logoWide: true, favicon: PNG,
    colorsLight: { "--green": "#0064c8", "--accent2": "#2b83dc" },
    colorsDark: { "--green": "#6aaef0" },
  }, extra || {}),
});

// A container start against a copy of the site: the entrypoint with `true`
// as the command it would exec (the image's is nginx).
function site() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuno-selfhost-"));
  fs.mkdirSync(path.join(dir, "js"));
  fs.writeFileSync(path.join(dir, "js", "authConfig.js"), SHIPPED.auth);
  fs.writeFileSync(path.join(dir, "js", "selfhost-boot.js"), SHIPPED.boot);
  return dir;
}
function start(dir, env) {
  const r = spawnSync("sh", [ENTRY, "true"], { env: Object.assign({}, process.env, { TUNO_ROOT: dir }, env || {}), encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || ""),
    auth: fs.existsSync(path.join(dir, "js", "authConfig.js")) ? fs.readFileSync(path.join(dir, "js", "authConfig.js"), "utf8") : null,
    boot: fs.readFileSync(path.join(dir, "js", "selfhost-boot.js"), "utf8"),
    branding: fs.existsSync(path.join(dir, "selfhost-branding.json")) ? fs.readFileSync(path.join(dir, "selfhost-branding.json"), "utf8") : null };
}
// What js/authConfig.js resolves to when a browser runs it as written.
function authOf(src) {
  const w = new JSDOM("<!doctype html><html><head></head><body></body></html>", { runScripts: "outside-only", url: "https://tuno.contoso.example/" }).window;
  w.eval(src + "\n;window.__AUTH = AUTH_CONFIG;");
  return w.__AUTH;
}
// The boot script in a browser: `store` is what localStorage already holds.
function paint(src, store) {
  const w = new JSDOM("<!doctype html><html><head></head><body></body></html>", { runScripts: "outside-only", url: "https://tuno.contoso.example/" }).window;
  for (const [k, v] of Object.entries(store || {})) w.localStorage.setItem(k, v);
  w.eval(src);
  const D = w.document, style = D.getElementById("selfhostBootCss"), icon = D.querySelector('link[rel="icon"]');
  return { css: style ? style.textContent : "", favicon: icon ? icon.getAttribute("href") : "", brandAttr: D.documentElement.getAttribute("data-brand") || "", wide: D.documentElement.classList.contains("brand-wide-logo") };
}
const markers = (src, m) => (src.match(new RegExp(">>> " + m, "g")) || []).length;

run(async () => {

// =====================================================================
head("The entrypoint: nothing set, nothing changes");
{
  const dir = site();
  const s = start(dir);
  ok("exits 0", s.status === 0, String(s.status));
  ok("js/authConfig.js is byte-identical to the shipped file", s.auth === SHIPPED.auth);
  ok("js/selfhost-boot.js too", s.boot === SHIPPED.boot);
  ok("no selfhost-branding.json appears", s.branding === null);
  ok("and it says nothing", s.out.trim() === "", s.out);
}

// =====================================================================
head("TUNO_CLIENT_ID / TUNO_TENANT_ID / TUNO_AUTHORITY become the runtime block");
{
  const s = start(site(), { TUNO_CLIENT_ID: CID });
  ok("a client id alone: exits 0 and says so", s.status === 0 && /runtime configuration applied \(clientId 0000/.test(s.out), s.out);
  ok("the block sits ABOVE the shipped file, between the markers", s.auth.startsWith("// >>> TUNO-RUNTIME-CONFIG\n") && s.auth.includes("// <<< TUNO-RUNTIME-CONFIG\n") && s.auth.endsWith(SHIPPED.auth));
  ok("it sets window.TUNO_AUTH with Object.assign, the hook authConfig.js already reads", /window\.TUNO_AUTH = Object\.assign\(window\.TUNO_AUTH \|\| \{\}, \{\n  clientId: "00000000-1111-2222-3333-444444444444",\n\}\);/.test(s.auth));
  const a = authOf(s.auth);
  ok("a browser resolves the client id", a.clientId === CID, a.clientId);
  ok("and keeps the shared organizations authority", a.authority === "https://login.microsoftonline.com/organizations", a.authority);
  ok("the shipped scopes survive (User.Read at sign-in)", Array.isArray(a.scopes) && a.scopes[0] === "User.Read");
  ok("the reminder about the redirect URI is printed", /AADSTS50011/.test(s.out));

  const t = start(site(), { TUNO_CLIENT_ID: CID, TUNO_TENANT_ID: TID });
  const b = authOf(t.auth);
  ok("a tenant id makes the authority single-tenant", b.authority === "https://login.microsoftonline.com/" + TID && b.clientId === CID, b.authority);

  const u = start(site(), { TUNO_TENANT_ID: TID });
  const c = authOf(u.auth);
  ok("a tenant id alone keeps the shipped client id and changes only the authority", c.clientId === authOf(SHIPPED.auth).clientId && c.authority === "https://login.microsoftonline.com/" + TID);

  const v = start(site(), { TUNO_CLIENT_ID: CID, TUNO_TENANT_ID: TID, TUNO_AUTHORITY: "https://login.microsoftonline.com/contoso.onmicrosoft.com" });
  ok("TUNO_AUTHORITY wins over the tenant id", authOf(v.auth).authority === "https://login.microsoftonline.com/contoso.onmicrosoft.com");
}

// =====================================================================
head("Idempotent: a restarted container replaces the block, never stacks it");
{
  const dir = site();
  start(dir, { TUNO_CLIENT_ID: CID });
  const again = start(dir, { TUNO_CLIENT_ID: CID, TUNO_TENANT_ID: TID });
  ok("one block after two starts", markers(again.auth, "TUNO-RUNTIME-CONFIG") === 1, String(markers(again.auth, "TUNO-RUNTIME-CONFIG")));
  ok("the second start's values are the ones in force", authOf(again.auth).authority.endsWith(TID));
  ok("the shipped file is still intact under it", again.auth.endsWith(SHIPPED.auth));
  const off = start(dir);
  ok("a start with no variables touches nothing — the block from the last configured start stays (a container's variables cannot change without a new container, which starts from the image)", off.auth === again.auth);
}

// =====================================================================
head("A value that is not the exact shape is refused — the container does not start");
{
  const dir = site();
  const s = start(dir, { TUNO_CLIENT_ID: '"; alert(1); //' });
  ok("a client id that is not a GUID: exit 1", s.status === 1, String(s.status));
  ok("it says why", /TUNO_CLIENT_ID is not a guid - refusing to configure/.test(s.out), s.out);
  ok("js/authConfig.js is untouched", s.auth === SHIPPED.auth);
  const t = start(site(), { TUNO_CLIENT_ID: CID, TUNO_TENANT_ID: "contoso" });
  ok("a tenant id that is not a GUID: exit 1, nothing written", t.status === 1 && t.auth === SHIPPED.auth);
  const u = start(site(), { TUNO_AUTHORITY: "http://login.microsoftonline.com/" + TID });
  ok("an authority that is not https: exit 1", u.status === 1 && /not a plain https URL/.test(u.out));
  const v = start(site(), { TUNO_AUTHORITY: 'https://evil.example/x";window.x=1;//' });
  ok("an authority able to close the string literal: exit 1", v.status === 1 && v.auth === SHIPPED.auth);
  const dir2 = site(); fs.rmSync(path.join(dir2, "js", "authConfig.js"));
  const w = start(dir2, { TUNO_CLIENT_ID: CID });
  ok("a missing js/authConfig.js with a registration asked for: exit 1", w.status === 1 && /is missing/.test(w.out));
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    ok("(read-only check skipped: running as root, who can write anything)", true);
  } else {
    const dir3 = site(); fs.chmodSync(path.join(dir3, "js", "authConfig.js"), 0o444);
    const x = start(dir3, { TUNO_CLIENT_ID: CID });
    ok("an unwritable js/authConfig.js: exit 1, refusing to serve the wrong registration", x.status === 1 && /refusing to start/.test(x.out), x.out);
    fs.chmodSync(path.join(dir3, "js", "authConfig.js"), 0o644);
  }
}

// =====================================================================
head("TUNO_BRANDING: the deployment's look for every visitor, and the first paint (ENCA 25389)");
{
  const s = start(site(), { TUNO_BRANDING: brand() });
  ok("written to selfhost-branding.json", s.branding === brand() && /deployment branding written/.test(s.out));
  ok("and into the boot script, as a STRING between markers", /window\.TUNO_BRAND_BOOT = "/.test(s.boot) && markers(s.boot, "TUNO-RUNTIME-BRAND") === 1 && /branding applied to the first paint/.test(s.out));
  ok("the shipped boot script follows the block intact", s.boot.endsWith(SHIPPED.boot));
  const r = paint(s.boot);            // nothing in localStorage — the first visit
  ok("a first visit is branded: data-brand=selfhost", r.brandAttr === "selfhost");
  ok("the light palette lands", /--green:#0064c8/.test(r.css) && /--accent2:#2b83dc/.test(r.css));
  ok("the dark palette too", /--green:#6aaef0/.test(r.css));
  ok("the logo replaces the image before it is painted", r.css.includes('content:url("' + PNG + '")'));
  ok("a wide wordmark keeps the flat sign-in logo", r.wide && /\.login-card > img\{width:auto;height:56px\}/.test(r.css));
  ok("hideOrgName is honoured", /\.logo b\{display:none\}/.test(r.css));
  ok("the favicon is swapped", r.favicon === PNG);

  const b64 = start(site(), { TUNO_BRANDING: Buffer.from(brand()).toString("base64") });
  ok("base64 is accepted as well as raw JSON", b64.branding === brand() && /decoded from base64/.test(b64.out));
}

// =====================================================================
head("The brand block is idempotent, and a start without branding removes it");
{
  const dir = site();
  start(dir, { TUNO_BRANDING: brand() });
  const again = start(dir, { TUNO_BRANDING: brand() });
  ok("one block, not two", markers(again.boot, "TUNO-RUNTIME-BRAND") === 1);
  fs.rmSync(path.join(dir, "selfhost-branding.json"));
  const off = start(dir);
  ok("a restart without branding stops painting the old one", !off.boot.includes("TUNO-RUNTIME-BRAND"));
  ok("and leaves the file as it ships", off.boot === SHIPPED.boot);
}

// =====================================================================
head("Precedence: this browser's Apply, then the deployment, then the cache");
{
  const s = start(site(), { TUNO_BRANDING: brand() });
  const mine = paint(s.boot, { "tuno-selfhost-brand": JSON.stringify({ brand: { colorsLight: { "--green": "#ff0000" } } }) });
  ok("what the gear applied in this browser wins over the deployment", /--green:#ff0000/.test(mine.css) && !mine.css.includes("#0064c8"));
  const stale = paint(s.boot, { "tuno-selfhost-brand-cache": JSON.stringify({ brand: { colorsLight: { "--green": "#00ff00" } } }) });
  ok("the deployment beats a cache of an older read of it", /--green:#0064c8/.test(stale.css) && !stale.css.includes("#00ff00"));
  const cached = paint(SHIPPED.boot, { "tuno-selfhost-brand-cache": JSON.stringify({ brand: { colorsLight: { "--green": "#00ff00" } } }) });
  ok("with no block (a static host) the cache paints, as before", /--green:#00ff00/.test(cached.css));
  ok("the shipped file reads window.TUNO_BRAND_BOOT in exactly that order", /read\("tuno-selfhost-brand"\) \|\| injected \|\| read\("tuno-selfhost-brand-cache"\)/.test(SHIPPED.boot) && /window\.TUNO_BRAND_BOOT/.test(SHIPPED.boot));
}

// =====================================================================
head("Nothing in the branding can become code or escape a CSS rule");
{
  const nasty = brand({
    colorsLight: { "--green": "#111}\n:root{--ink:red", "--ok": "#222" },
    logo: "javascript:alert(1)",
    favicon: "https://example.com/x.png",
    org: '</script><script>window.pwned=1</script>',
  });
  const s = start(site(), { TUNO_BRANDING: nasty });
  ok("the value is a STRING in the file, never an object literal", !/window\.TUNO_BRAND_BOOT = \{/.test(s.boot) && /window\.TUNO_BRAND_BOOT = "/.test(s.boot));
  ok("newlines are stripped before it is embedded", !/\n:root\{--ink:red/.test(s.boot));
  ok("the file still parses as JavaScript", (() => { try { new Function(s.boot); return true; } catch (e) { return false; } })());
  const r = paint(s.boot);
  ok("the charset guard drops a value that could close the rule", !r.css.includes("--ink:red"));
  ok("the rest of the palette still lands", /--ok:#222/.test(r.css));
  ok("a logo that is not a data: URI is ignored", !r.css.includes("javascript:"));
  ok("and so is a favicon that is not one", r.favicon === "");
}

// =====================================================================
head("Branding that is not JSON is refused, never fatal; a mounted file is picked up");
{
  const s = start(site(), { TUNO_BRANDING: "not json at all" });
  ok("the container still starts", s.status === 0);
  ok("nothing is written", s.branding === null && !s.boot.includes("TUNO-RUNTIME-BRAND"));
  ok("and it says so", /neither JSON nor base64|did not parse as JSON/.test(s.out), s.out);
  const dir = site();
  fs.writeFileSync(path.join(dir, "selfhost-branding.json"), brand());
  const m = start(dir);
  ok("a mounted selfhost-branding.json reaches the first paint without any variable", m.status === 0 && paint(m.boot).brandAttr === "selfhost" && /--green:#0064c8/.test(paint(m.boot).css));
}

// =====================================================================
head("The image's contract, as files");
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const docker = read("Dockerfile"), ignore = read(".dockerignore"), nginx = read("selfhost/nginx.conf"), wf = read(".github/workflows/docker.yml");
  ok("Dockerfile: nginx:1.27-alpine, our nginx.conf, the whole tree, the entrypoint", /^FROM nginx:1\.27-alpine$/m.test(docker) && /COPY selfhost\/nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf/.test(docker) && /COPY \. \/usr\/share\/nginx\/html\//.test(docker) && /ENTRYPOINT \["\/docker-entrypoint-tuno\.sh"\]/.test(docker));
  ok("the web-root copy of the entrypoint is removed, and permissions normalised", /rm -f \/usr\/share\/nginx\/html\/selfhost\/docker-entrypoint\.sh/.test(docker) && /chmod 755/.test(docker) && /chmod 644/.test(docker));
  const lines = ignore.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  ok(".dockerignore keeps the local-only folders out of a build from ~/REPO/TUNO", ["pvm", "dovilo", "cloudfellows", "terraform", "_to_delete", "node_modules", "tests", ".git", "js/authConfig.local.js"].every((p) => lines.includes(p)), lines.join(","));
  ok("and never the two files the Dockerfile COPYs", !lines.includes("selfhost/nginx.conf") && !lines.includes("selfhost/docker-entrypoint.sh") && !lines.includes("selfhost"));
  ok("the scripts, baselines, vendor libraries and templates are served", !["scripts", "baseline", "vendor", "templates", "assets", "css", "js"].some((p) => lines.includes(p)));
  const loc = (p) => { const m = nginx.match(new RegExp("location = " + p.replace(/[/.]/g, "\\$&") + " \\{([\\s\\S]*?)\\n  \\}")); return m ? m[1] : ""; };
  const HEADERS = ['X-Content-Type-Options "nosniff" always', 'X-Frame-Options "SAMEORIGIN" always', 'Referrer-Policy "no-referrer" always', 'Permissions-Policy "camera=(), microphone=(), geolocation=()" always'];
  ok("nginx: the four security headers at server level", HEADERS.every((h) => nginx.includes("add_header " + h + ";")));
  for (const p of ["/index.html", "/selfhost-branding.json", "/js/selfhost-boot.js", "/js/authConfig.js"]) {
    const body = loc(p);
    ok("nginx: " + p + " is no-store and repeats the four headers (add_header is not inherited)", /Cache-Control "no-store" always/.test(body) && HEADERS.every((h) => body.includes("add_header " + h + ";")), body.slice(0, 80));
  }
  ok("nginx: everything else falls through to try_files", /location \/ \{\s*try_files \$uri \$uri\/ =404;/.test(nginx));
  ok("workflow: the checks job runs the suites and the header check before any publish", /npm test/.test(wf) && /selfhost\/check-headers\.py/.test(wf) && /needs: checks/.test(wf));
  ok("workflow: only nurejev/TUNO publishes — tuno-beta's main carries beta code", /github\.repository == 'nurejev\/TUNO'/.test(wf));
  ok("workflow: :latest from main, :beta from beta, lowercase image name", /= "main" \] && echo latest \|\| echo beta/.test(wf) && /ghcr\.io\/nurejev\/tuno:\$\{\{ steps\.tag\.outputs\.tag \}\}/.test(wf) && !/ghcr\.io\/nurejev\/TUNO/.test(wf));
  ok("workflow: both architectures", /linux\/amd64,linux\/arm64/.test(wf));
  ok("compose and the install scripts default to the beta channel", /image: ghcr\.io\/nurejev\/tuno:beta/.test(read("selfhost/docker-compose.yml")) && /TAG="\$\{TUNO_TAG:-beta\}"/.test(read("selfhost/install.sh")) && /\[string\]\$Tag = "beta"/.test(read("selfhost/install.ps1")));
  ok("they pass the TUNO_* variables through", ["docker-compose.yml", "install.sh", "install.ps1"].every((f) => { const s = read("selfhost/" + f); return /TUNO_CLIENT_ID/.test(s) && /TUNO_TENANT_ID/.test(s) && /TUNO_BRANDING/.test(s) && !/ENCA_/.test(s); }));
  ok("the install scripts fetch from nurejev/TUNO's beta branch", /raw\.githubusercontent\.com\/nurejev\/TUNO\/beta\/selfhost\/install\.sh/.test(read("selfhost/install.sh")) && /raw\.githubusercontent\.com\/nurejev\/TUNO\/beta\/selfhost\/install\.ps1/.test(read("selfhost/install.ps1")));
  ok("resolve-digest.sh resolves the beta tag by default", /REF="\$\{1:-ghcr\.io\/nurejev\/tuno:beta\}"/.test(read("selfhost/resolve-digest.sh")));
  const doc = read("SELF-HOSTING.md");
  ok("SELF-HOSTING.md leads with the redirect URI and names the variables", /AADSTS50011/.test(doc) && /TUNO_CLIENT_ID/.test(doc) && /TUNO_TENANT_ID/.test(doc) && /TUNO_BRANDING/.test(doc) && /ghcr\.io\/nurejev\/tuno:beta/.test(doc));
  ok(".gitignore keeps the Terraform deployment out of the public repo", /^\/terraform\/$/m.test(read(".gitignore")));
  ok("the entrypoint names no ENCA variable", !/ENCA_/.test(read("selfhost/docker-entrypoint.sh")));
}

});

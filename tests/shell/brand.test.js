// ======================================================================
// Parity slice 6 (build 10667): the brand as ENCA wears it — the marks
// redrawn in the family of ENCA 32302 with BETA editions on the beta host,
// the three-way ribbon (25229), the sign-in medallion (25493) and the
// branded dark neutrals (32313).
//
//   1. Six marks: light, dark and favicon, each with a BETA edition; the
//      device deep green on light and lime on dark, the gear gold.
//   2. Beta says BETA, a copy elsewhere SELF-HOSTED, production neither —
//      in the ribbon, the title and the marks.
//   3. Somebody's own look (a self-hosted brand) is never dressed in the
//      BETA marks, and a wide wordmark keeps the flat sign-in logo.
//   4. The stylesheet carries the medallion, the dark BETA swap and the
//      branded dark neutrals.
//
// Run with `npm test`, or alone:  node tests/shell/brand.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("brand");

const css = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const asset = (f) => fs.readFileSync(path.join(ROOT, "assets", f), "utf8");
const MARKS = ["logo-mark-light.svg", "logo-mark-dark.svg", "favicon.svg", "logo-mark-light-beta.svg", "logo-mark-dark-beta.svg", "favicon-beta.svg"];
const PRODUCTION = "https://tuno.limon-it.nl/", SELF = "https://tuno.contoso.example/", LOCAL = "http://localhost:8080/";
const look = (w) => {
  const D = w.document, rb = D.getElementById("betaRibbon");
  return {
    ribbon: rb ? rb.textContent : "", bg: rb ? rb.style.background : "", title: D.title,
    betaMark: D.documentElement.hasAttribute("data-beta-mark"),
    favicon: D.getElementById("favicon").getAttribute("href"),
    logo: D.getElementById("brandLogo").getAttribute("src"), login: D.getElementById("brandLogoLogin").getAttribute("src"),
  };
};

run(async () => {

// =====================================================================
head("The marks, redrawn as ENCA redrew its own (32302)");
{
  const w = boot();
  const parse = (f) => new w.DOMParser().parseFromString(asset(f), "image/svg+xml");
  ok("all six are there and are well-formed SVG", MARKS.every((f) => { const d = parse(f); return d.documentElement.nodeName === "svg" && !d.querySelector("parsererror"); }));
  ok("the marks keep the orbit (84 84 856 856), the favicons crop to the inner disc (270 263 484 484)",
    MARKS.every((f) => parse(f).documentElement.getAttribute("viewBox") === (/favicon/.test(f) ? "270 263 484 484" : "84 84 856 856")));
  const stops = (f) => [...parse(f).querySelectorAll("#deviceg stop")].map((s) => s.getAttribute("stop-color")).join(",");
  ok("the device is deep green on light", stops("logo-mark-light.svg") === "#3f7a24,#1e4729,#12331f" && stops("favicon.svg") === "#3f7a24,#1e4729,#12331f");
  ok("and lime on dark", stops("logo-mark-dark.svg") === "#e2f58a,#c8e84a,#8fb82c");
  ok("its frame is drawn with that gradient, no longer gold on gold", /<rect x="-118" y="-96" width="196" height="150" rx="16" fill="none" stroke="url\(#deviceg\)"/.test(asset("logo-mark-light.svg")));
  ok("the gear on the screen is gold", /<circle cx="-20" cy="-22" r="34" fill="none" stroke="#dfb32b"/.test(asset("logo-mark-light.svg")) && /<circle cx="-20" cy="-22" r="34" fill="none" stroke="#e8c132"/.test(asset("logo-mark-dark.svg")));
  ok("the discs are ENCA's: pale #eef5e6, green #2f5c1a", /<circle r="215" fill="#eef5e6"/.test(asset("logo-mark-light.svg")) && /<circle r="215" fill="#2f5c1a"/.test(asset("logo-mark-dark.svg")));
  ok("only the BETA editions carry the yellow BETA pill", MARKS.every((f) => /-beta\.svg$/.test(f) === /fill="#ffd21f"[^>]*>.*>BETA<\/text>/.test(asset(f))));
  ok("a BETA edition is its plain mark plus the pill", asset("logo-mark-light-beta.svg").replace(/<!--[\s\S]*?-->\n/, "").replace(/<g id="beta-tag">.*<\/g>\n/, "") === asset("logo-mark-light.svg").replace(/<!--[\s\S]*?-->\n/, ""));
}

// =====================================================================
head("branding.js names the beta host and the BETA marks");
{
  const w = boot();
  const B = w.BRANDING;
  ok("betaHost is the Pages host, a hostname only", B.betaHost === "nurejev.github.io");
  const files = ["logo", "logoDark", "favicon", "betaLogo", "betaLogoDark", "betaFavicon"].map((k) => B[k]);
  ok("all six point at files that exist", files.every((f) => f && fs.existsSync(path.join(ROOT, f.replace(/\?.*$/, "")))), files.join(", "));
  ok("they share one asset version, bumped for the new artwork", files.every((f) => /\?v=3$/.test(f)));
  ok("index.html asks for the same version", (html.match(/assets\/(favicon|logo-mark-light)\.svg\?v=(\d+)/g) || []).length === 3 && !/assets\/[\w-]+\.svg\?v=(?!3")/.test(html));
}

// =====================================================================
head("Beta says BETA — the ribbon, the title and the marks");
{
  const L = look(boot());
  ok("the red ribbon", L.ribbon === "⚠ BETA — not production" && /176, 74, 58|#b04a3a/.test(L.bg), L.ribbon + " " + L.bg);
  ok("the title tag", /^\[BETA\] TUNO/.test(L.title), L.title);
  ok("<html> is marked for the dark BETA mark", L.betaMark);
  ok("the tab icon is the BETA favicon", /^assets\/favicon-beta\.svg/.test(L.favicon), L.favicon);
  ok("the header and the sign-in card wear the BETA mark", /logo-mark-light-beta\.svg/.test(L.logo) && /logo-mark-light-beta\.svg/.test(L.login));
}

// =====================================================================
head("A copy elsewhere says SELF-HOSTED, and wears the plain mark");
for (const url of [SELF, LOCAL]) {
  const L = look(boot({ url }));
  ok(`${url}: the slate ribbon, naming nobody`, L.ribbon === "⚙ SELF-HOSTED" && /59, 90, 114|#3b5a72/.test(L.bg), L.ribbon);
  ok(`${url}: the title tag`, /^\[SELF-HOSTED\] TUNO/.test(L.title), L.title);
  ok(`${url}: no BETA marks`, !L.betaMark && /^assets\/favicon\.svg/.test(L.favicon) && /logo-mark-light\.svg/.test(L.logo) && /logo-mark-light\.svg/.test(L.login));
}

// =====================================================================
head("Production says neither");
{
  const L = look(boot({ url: PRODUCTION }));
  ok("no ribbon", L.ribbon === "");
  ok("no title tag", /^TUNO · /.test(L.title), L.title);
  ok("the plain marks", !L.betaMark && /^assets\/favicon\.svg/.test(L.favicon) && /logo-mark-light\.svg/.test(L.logo));
}

// =====================================================================
head("Somebody's own look is never dressed in the BETA marks");
{
  // A look applied with the ⚙ gear earlier, in this browser, on the beta host.
  const logo = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><rect width="400" height="100"/></svg>').toString("base64");
  const brand = (extra) => JSON.stringify({ v: 1, brand: Object.assign({ name: "Contoso", org: "Contoso", logo }, extra) });
  const w = boot({ storage: { "tuno-selfhost-brand": brand({ logoWide: true }) } });
  const L = look(w);
  ok("under a self-hosted look the beta host wears no BETA mark", !L.betaMark && L.logo === logo && L.login === logo);
  ok("a wide wordmark flags <html>, so the sign-in logo stays flat", w.document.documentElement.classList.contains("brand-wide-logo"));
  const w2 = boot({ storage: { "tuno-selfhost-brand": brand({}) } });
  ok("a round logo keeps the medallion", !w2.document.documentElement.classList.contains("brand-wide-logo"));
  const boot1 = fs.readFileSync(path.join(ROOT, "js/selfhost-boot.js"), "utf8");
  ok("selfhost-boot.js flags a wide wordmark before the first paint", /if \(logo && b\.logoWide\) document\.documentElement\.classList\.add\("brand-wide-logo"\);/.test(boot1));
  const sh = fs.readFileSync(path.join(ROOT, "js/selfhost.js"), "utf8");
  ok("a deployment file on the beta host relabels the ribbon without naming a host", /rb\.textContent = "⚙ SELF-HOSTED";/.test(sh) && !/SELF-HOSTED — not/.test(sh));
}

// =====================================================================
head("The stylesheet: the medallion, the dark BETA swap, the branded dark neutrals");
{
  ok("the sign-in mark rides a 124 px medallion half over the card's top edge (ENCA 25493)",
    /#screen-login\{padding-top:64px\}/.test(css) && /:root:not\(\.brand-wide-logo\) \.login-card > img\{display:block;position:relative;box-sizing:border-box;width:124px;height:124px;margin:-110px auto 0;padding:8px;/.test(css)
    && /border-radius:50%;background:var\(--surface\);border:1px solid var\(--border\);/.test(css));
  ok("dark mode swaps in the dark marks, explicit and automatic",
    (css.match(/content:url\("\.\.\/assets\/logo-mark-dark\.svg\?v=3"\)/g) || []).length === 2);
  ok("and the dark BETA mark under data-beta-mark, both ways",
    (css.match(/:root\[data-beta-mark\][^{]*\.login-card > img\{content:url\("\.\.\/assets\/logo-mark-dark-beta\.svg\?v=3"\)\}/g) || []).length === 2);
  const block = (sel) => { const i = css.indexOf(sel); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };
  const explicit = block(':root[data-brand][data-theme="dark"]{'), auto = block(':root[data-brand]:not([data-theme="light"]):not([data-theme="dark"]){');
  const toks = ["--chip-bd", "--sw-track", "--na", "--faint", "--ghost-bd", "--on-deep-mute"];
  ok("a branded dark mode mixes the six neutrals from the brand (ENCA 32313), explicit and automatic",
    toks.every((t) => explicit.indexOf(t + ":color-mix(") >= 0 && auto.indexOf(t + ":color-mix(") >= 0));
  ok("TUNO's own dark look is untouched: the mixes apply only under data-brand", !/:root\[data-theme="dark"\]\{\s*--chip-bd/.test(css));
}

});

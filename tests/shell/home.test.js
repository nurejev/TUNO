// ======================================================================
// Parity slice 10 (build 10671): Home's Intune overview — js/home-overview.js
// after ENCA's js/overview.js (25419 … 25426), mockup round 2's D6 A, with
// js/runmeta.js (ENCA 25412's descriptor, a registry in TUNO) for Your checks.
//
//   1. Loaded where it must be: the overview before the shell, the
//      registry after the cache; no optional chaining.
//   2. The model is pure: counts over the policy surfaces only, a failed
//      surface makes a count "at least", never smaller; the findings, their
//      rank, evidence and rows; the compliance finding exact once T13 ran.
//   3. The renderers: "—" for what was not read, + for at least, the status
//      line for reading, not read, dropped, failed and gaps.
//   4. In the page: on Home above Recent tools and the library, which now
//      starts closed; the counts are the cache's; a finding opens in place;
//      every count opens the tool behind it — Policy overview filtered to
//      exactly what was counted.
//   5. Your checks: a run lands on its row, bound to its tenant.
//   6. A cold start says so and reads at the click; a write drops the read
//      and Home says the policies changed; sign-out leaves nothing behind.
//
// Run with `npm test`, or alone:  node tests/shell/home.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("home");

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const html = read("index.html");
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
const noChain = (src) => !/[\w)\]]\?\.[\w(\[]/.test(src.replace(/\/\/.*$/gm, "").replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, "''"));
// The harness boots app.js alone; the shell and T19 load after it in
// index.html — evaluated here in their own order, the overview before the
// shell so it hears the shell say Home exists.
const start = async (opts) => {
  const o = opts || {};
  const w = boot();
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.eval(read("js/runmeta.js") + "\n;window.RunMeta = RunMeta;");
  w.eval(read("js/overview.js") + "\n;window.OverviewTool = OverviewTool;");
  w.OverviewTool.init();
  // T15 needs the progress card in its own scope (a const does not cross
  // separate evals in jsdom — the harness's note)
  if (o.defender) { w.eval(read("js/progress.js") + "\n;" + read("js/defender.js") + "\n;window.Defender = Defender; window.DefenderTool = DefenderTool;"); w.DefenderTool.init(); }
  w.eval(read("js/flat-icons.js") + "\n;window.FlatIcons = FlatIcons;");
  w.eval(read("js/home-overview.js") + "\n;window.HomeOverview = HomeOverview;");
  w.eval(read("js/workspaces.js"));
  if (o.cold) w.Graph.silentScopes = async () => false;     // no consent yet: no sign-in read
  w.document.getElementById("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  if (o.cold) await tick(80);
  else for (let i = 0; i < 120 && !(w.PolicyCache.get() && w.document.querySelector("#wcOverview .db-primary")); i++) await tick(50);
  return w;
};
const $$ = (w, sel) => [...w.document.querySelectorAll(sel)];
const counts = (w) => Object.fromEntries($$(w, "#wcOverview .db-count").map((c) => [c.dataset.hoopen, c.querySelector("b").textContent]));

// A read the model can be held to, item by item.
const DAY = 86400000, NOW = Date.parse("2026-10-01T12:00:00Z");
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const it = (name, kinds, platforms, modified) => ({ id: name, name, platforms: platforms || [], modified: modified === undefined ? ago(100) : modified,
  assignments: (kinds || []).map((k) => ({ kind: k, name: k })) });
const RES = {
  readAt: NOW - 3600000,
  sections: [
    { id: "settingsCatalog", label: "Settings catalog policies", items: [
      it("WIN — Firewall", ["Included"], ["Windows"], ago(3)), it("WIN — Firewall", ["Included"], ["Windows"]),
      it("MAC — Restrictions", ["Included"], ["macOS"], ago(10)), it("Draft", [], ["Windows"]), it("Only out", ["Excluded"], ["Windows"], null)] },
    { id: "compliance", label: "Compliance policies", items: [it("WIN — Compliance", ["Included"], ["Windows"]), it("MAC — Compliance", [], ["macOS"])] },
    { id: "intents", label: "Endpoint security (legacy intents)", items: [it("Legacy — AV", ["Included"]), it("Legacy — FW", [])] },
    { id: "apps", label: "Applications", items: [it("7-Zip", ["Included"], ["Windows"], ago(2)), it("Unused app", [], ["Windows"])] },
    { id: "filters", label: "Assignment filters", items: [it("Corporate", [])] },
    { id: "scopeTags", label: "Scope tags", items: [it("Amsterdam", [])] },
  ],
  failed: [],
};
const withGap = () => Object.assign({}, RES, { failed: [{ id: "scripts", label: "Scripts & remediations", error: "403 Forbidden" }] });

run(async () => {

// =====================================================================
head("Loaded where it must be");
{
  const at = (f) => html.indexOf(`src="js/${f}`), css = (f) => html.indexOf(`href="css/${f}`);
  ok("the registry after the policy cache, before the tools publish into it", at("policycache.js") > 0 && at("policycache.js") < at("runmeta.js") && at("runmeta.js") < at("defender.js"));
  ok("the overview after the dialogs and before the shell, so it hears tuno:wchome", at("accessibility.js") < at("home-overview.js") && at("home-overview.js") < at("workspaces.js"));
  ok("its stylesheet after the shell's", css("workspaces.css") > 0 && css("workspaces.css") < css("home-overview.css") && css("home-overview.css") < css("tool-layout.css"));
  ok("no optional chaining in the overview, the registry or the cache", noChain(read("js/home-overview.js")) && noChain(read("js/runmeta.js")) && noChain(read("js/policycache.js")));
  ok("ENCA's dashboard classes, #overview read as #wcOverview", /#wcOverview \.fchip\{border-radius:5px/.test(read("css/home-overview.css")) && /\.db-counts\.five\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)\}/.test(read("css/home-overview.css")) && !/#overview\b/.test(read("css/home-overview.css").replace(/\/\*[\s\S]*?\*\//g, "")));
}

// =====================================================================
head("The model: counts over the policy surfaces, unknown never zero");
{
  const w = boot();
  w.eval(read("js/home-overview.js") + "\n;window.HomeOverview = HomeOverview;");
  const H = w.HomeOverview;
  const d = H.model(RES, NOW, {});
  ok("policies and profiles leave out apps, filters and scope tags", d.counts.policies.n === 9 && d.counts.policies.surfaces === 3, JSON.stringify(d.counts.policies));
  ok("assigned: a group, all users or all devices", d.counts.assigned.n === 5);
  ok("assigned to nobody, and those that only exclude, apart", d.counts.nobody.n === 3 && d.counts.nobody.excludedOnly === 1, JSON.stringify(d.counts.nobody));
  ok("changed in 30 days, the undated said apart", d.counts.changed.n === 2 && d.counts.changed.undated === 1, JSON.stringify(d.counts.changed));
  ok("apps their own count, with those reaching nobody", d.counts.apps.n === 2 && d.counts.apps.nobody === 1);
  ok("a read with no gaps is exact", !d.counts.policies.atLeast && !d.counts.assigned.atLeast);
  ok("one row per surface read, in the read's own order, the non-policies flagged minor", d.surfaces.map((r) => r.id + (r.minor ? "*" : "")).join() === "settingsCatalog,compliance,intents,apps,filters*,scopeTags*", d.surfaces.map((r) => r.id).join());
  const g = H.model(withGap(), NOW, {});
  ok("a surface that failed makes the counts at least, never smaller", g.counts.policies.atLeast && g.counts.nobody.atLeast && g.counts.policies.n === 9);
  ok("and is a row that says so, not a 0", g.surfaces.some((r) => r.id === "scripts" && r.n == null && /403/.test(r.error)));
  ok("its findings are Partial", g.findings.filter((f) => f.id !== "compliance").every((f) => f.evidence.state === "partial"));

  const ids = d.findings.map((f) => f.id + ":" + f.sev).join();
  ok("findings ranked worst first", ids === "compliance:high,nobody:medium,intents:medium,dupes:low", ids);
  const f = (id) => d.findings.find((x) => x.id === id);
  ok("compliance: macOS is targeted and no assigned compliance policy covers it — an estimate, so Partial",
    /covers macOS$/.test(f("compliance").text) && f("compliance").evidence.state === "partial" && /MAC — Compliance exists but reaches nobody/.test(f("compliance").sub), f("compliance").text);
  ok("its evidence names the inert policy", f("compliance").rows.map((r) => r.name).join() === "MAC — Compliance");
  ok("nobody: four — three unassigned, one only excluding — with every row as evidence", /^4 policies are assigned to nobody$/.test(f("nobody").text) && f("nobody").rows.length === 4 && /and 1 more — 1 of them only excludes$/.test(f("nobody").sub), f("nobody").text + " / " + f("nobody").sub);
  ok("and opens Assignment health, or shows the unassigned in Policy overview", f("nobody").tool === "toolHealth" && f("nobody").show.verdict === "unassigned");
  ok("intents: two legacy policies, one reaching nobody", /^2 endpoint security policies still use legacy intents$/.test(f("intents").text) && /1 of them are assigned to nobody/.test(f("intents").sub) && f("intents").show.surf === "intents");
  ok("dupes: a name used twice on one surface", /^1 name is used twice on the same surface$/.test(f("dupes").text) && f("dupes").rows.length === 2);

  const t13 = { meta: { id: "001", at: NOW, completeness: "complete" }, data: { secureByDefault: false, coverage: [
    { platform: "Windows", devices: 8, verdict: "covered" }, { platform: "macOS", devices: 3, verdict: "gap" }, { platform: "Android", devices: 0, verdict: "noDevices" }] } };
  const e = H.model(RES, NOW, { compliance: t13 }).findings.find((x) => x.id === "compliance");
  ok("once Compliance report ran, its coverage replaces the estimate: exact, with the device count", /^No compliance policy reaches macOS \(3 devices\)$/.test(e.text) && e.evidence.state === "read" && e.sev === "high", e.text);
  ok("and says what the tenant's default does with them", /count as compliant/.test(e.sub));
  t13.data.secureByDefault = true;
  ok("a tenant that fails closed makes it Medium", H.model(RES, NOW, { compliance: t13 }).findings.find((x) => x.id === "compliance").sev === "medium");
  t13.data.coverage[1].verdict = "covered";
  ok("and no gap in the run is no finding, whatever the estimate said", !H.model(RES, NOW, { compliance: t13 }).findings.some((x) => x.id === "compliance"));
}

// =====================================================================
head("The renderers: — for not read, + for at least, a status that says why");
{
  const w = boot();
  w.eval(read("js/home-overview.js") + "\n;window.HomeOverview = HomeOverview;");
  const H = w.HomeOverview, D = w.document;
  const frag = (h) => { const t = D.createElement("div"); t.innerHTML = h; return t; };
  const none = frag(H.header({ counts: null, status: { kind: "notread" } }));
  ok("not read: five counts, every one —, none 0", [...none.querySelectorAll(".db-count b")].map((b) => b.textContent).join("") === "—————" && none.querySelectorAll(".db-count.unk").length === 5);
  ok("and the status offers the read, saying it asks once", /Not read yet/.test(none.textContent) && none.querySelector("[data-horead]") && /Asks for consent once/.test(none.textContent));
  ok("reading says nothing reads 0 before it is read", /nothing reads 0 before it is read/.test(frag(H.header({ counts: null, status: { kind: "loading", message: "Reading Compliance policies…" } })).textContent));
  ok("dropped says the policies changed, with Read again", /changed in this session/.test(frag(H.header({ counts: null, status: { kind: "dropped", at: NOW } })).textContent));
  ok("failed offers to try again", frag(H.header({ counts: null, status: { kind: "failed", at: NOW, message: "429" } })).querySelector("[data-horead]") !== null);
  const g = H.model(withGap(), NOW, {});
  const gap = frag(H.header({ counts: g.counts, status: { kind: "gaps", failed: g.failed, of: 7 } }));
  ok("a count over an unread surface reads N+", gap.querySelector('[data-hoopen="all"] b').textContent === "9+" && /at least/.test(gap.querySelector('[data-hoopen="all"]').title));
  ok("and the status names the surface and why", /Scripts & remediations \(403 Forbidden\)/.test(gap.textContent));
  ok("apps, read whole, stay exact beside them", gap.querySelector('[data-hoopen="apps"] b').textContent === "2");
  const d = H.model(RES, NOW, {});
  const wv = frag(H.worth(d.findings, {}));
  ok("Worth a look first shows the top three, the rest one press away", wv.querySelectorAll(".db-worth").length === 3 && /View all 4 findings/.test(wv.querySelector("[data-hoall]").textContent));
  ok("all of them on View all", frag(H.worth(d.findings, { showAll: true })).querySelectorAll(".db-worth").length === 4);
  const op = frag(H.worth(d.findings, { open: "nobody" }));
  ok("a finding opens in place: observed, evidence, meaning, next step, the way in", op.querySelector(".db-evid") && /Observed[\s\S]*Evidence[\s\S]*What it means[\s\S]*Next step/.test(op.querySelector(".db-evid").textContent)
    && op.querySelector('.db-evid [data-hotool="toolHealth"]') && op.querySelector('.db-evid [data-hotool="toolOverview"][data-hoverdict="unassigned"]'));
  ok("nothing standing out is said, not left blank", /Nothing in the policy read stands out/.test(frag(H.worth([], {})).textContent));
  const ck = frag(H.checks([{ tool: "toolLaps", label: "Windows LAPS audit", what: "x", run: null },
    { tool: "toolDefender", label: "Defender status", what: "y", run: { meta: { at: NOW, completeness: "partial", id: "002" }, headline: { n: "Unknown", unit: "the device list could not be read" } } }]));
  ok("Your checks: never run says so and offers the run", /Not run this session/.test(ck.querySelectorAll(".db-check")[0].textContent) && ck.querySelector('[data-horun="toolLaps"]').textContent === "Run check");
  ok("a run shows its headline, time and completeness — Unknown, not 0", /Unknown the device list could not be read · read .+ · partial/.test(ck.querySelectorAll(".db-check")[1].querySelector(".s").textContent) && ck.querySelectorAll(".db-check")[1].classList.contains("partial"));
}

// =====================================================================
head("On Home: above Recent tools and the library, the cache's own counts");
{
  const w = await start();
  const D = w.document, $ = (id) => D.getElementById(id);
  const res = w.PolicyCache.get();
  ok("the sign-in read landed", !!res);
  ok("the overview sits in Home, before Recent tools and the library", $("wcOverview") && $("wcOverview").parentElement === $("wcHome") && $("wcOverview").nextElementSibling === D.querySelector("#wcHome .wc-home-layout"));
  ok("the library starts closed now an overview is above it (ENCA's 01)", D.querySelector("#wcHome .wc-home-layout").classList.contains("lib-closed") && $("wcToggleLibrary").textContent === "Show");
  const d = w.HomeOverview.model(res, Date.now(), {});
  const c = counts(w);
  ok("five counts, the model's", c.all === String(d.counts.policies.n) && c.assigned === String(d.counts.assigned.n) && c.nobody === String(d.counts.nobody.n) && c.changed === String(d.counts.changed.n) && c.apps === String(d.counts.apps.n), JSON.stringify(c));
  ok("the lead says where the read came from, and offers it again", /^Read at sign-in, .+? — \d+ objects on \d+ surfaces\./.test($("wcHomeLead").textContent) && $("wcHomeLead").querySelector("[data-horead]"));
  ok("Worth a look first, worst first", $$(w, "#hoWorth .db-worth").length >= 3 && $$(w, "#hoWorth .db-worth .sv")[0].textContent === "High");
  ok("the read surface by surface, every one", $$(w, "#hoContext .db-tile").length === res.sections.length + res.failed.length && /All \d+ read, none failed/.test($("hoContext").textContent));
  ok("Your checks: the five on-demand tools, none run yet", $$(w, "#hoChecks .db-check").map((x) => x.dataset.hocheck).join() === "toolDefender,toolLaps,toolCompliance,toolSecureScore,toolDeviceCleanup" && $$(w, "#hoChecks .db-check.never").length === 5);
  ok("each with the tool's line icon", $$(w, "#hoChecks .db-check .t svg.enca-icon").length === 5);
  ok("no status line when the read is whole", !D.querySelector("#wcOverview .db-status"));

  // a finding opens in place, and closes
  const second = () => $$(w, "#hoWorth .db-worth")[1];
  second().click();
  ok("a finding opens in place", second().getAttribute("aria-expanded") === "true" && D.querySelector("#hoWorth .db-evid"));
  second().click();
  ok("and closes again", !D.querySelector("#hoWorth .db-evid"));

  // every count opens the tool behind it
  D.querySelector('[data-hoopen="nobody"]').click();
  await tick(20);
  const cards = () => $$(w, "#ovCards [data-open]").length;
  ok("Assigned to nobody opens Policy overview on Unassigned", $("screen-overview").classList.contains("active") && D.querySelector('#ovChips .fchip.active[data-verdict="unassigned"]'));
  ok("showing exactly the policies counted — no filters, no scope tags", cards() === d.counts.nobody.n, `${cards()} vs ${d.counts.nobody.n}`);
  ok("and says what it left out, with a way back", /Policies and profiles only, as Home counted them/.test($("ovCards").textContent) && D.querySelector("[data-ovscope-clear]"));
  D.querySelector("[data-ovscope-clear]").click();
  ok("Show everything brings the rest back", cards() > d.counts.nobody.n && !D.querySelector("[data-ovscope-clear]"));
  $("wcHomeButton").click(); await tick(20);
  D.querySelector('[data-hoopen="all"]').click(); await tick(20);
  ok("Policies & profiles opens all of them, and only them", cards() === d.counts.policies.n);
  $("wcHomeButton").click(); await tick(20);
  D.querySelector('[data-hosurf="intents"]').click(); await tick(20);
  ok("a surface row opens Policy overview on that surface", cards() === res.sections.find((s) => s.id === "intents").items.length && D.querySelector('#ovRail [data-surf="intents"].active, #ovRail .active[data-surf="intents"]'));
  $("wcHomeButton").click(); await tick(20);
  D.querySelector('[data-hoopen="changed"]').click(); await tick(20);
  ok("Changed in 30 days opens Change audit — who changed what", $("screen-audit").classList.contains("active"));
}

// =====================================================================
head("Your checks: a run lands on its row, bound to its tenant");
{
  const w = await start({ defender: true });
  const D = w.document, $ = (id) => D.getElementById(id);
  D.querySelector('[data-horun="toolDefender"]').click();
  for (let i = 0; i < 80 && !w.RunMeta.last("toolDefender"); i++) await tick(50);
  ok("Run check opens the tool and presses its own button", $("screen-defender").classList.contains("active") && !!w.RunMeta.last("toolDefender"));
  const r = w.RunMeta.last("toolDefender");
  ok("the run published its headline, bound to the demo tenant", typeof r.headline.n === "number" && /Windows devices? · \d+ with findings · \d+ with no state/.test(r.headline.unit) && r.meta.isDemo === true && r.meta.completeness === "complete", JSON.stringify(r.headline));
  $("wcHomeButton").click(); await tick(30);
  const row = D.querySelector('#hoChecks [data-hocheck="toolDefender"]');
  ok("back on Home its row shows it, with Open and Run again", !row.classList.contains("never") && new RegExp(`^${r.headline.n} Windows devices?`).test(row.querySelector(".s").textContent.trim()) && row.querySelector('[data-hotool="toolDefender"]') && /Run again/.test(row.querySelector("[data-horun]").textContent));
  ok("a result from another tenant is that tenant's, never this one's", (() => {
    w.RunMeta.publish("toolLaps", { completeness: "complete", tenantId: "other-tenant", isDemo: false }, { n: 4, unit: "devices" });
    return w.RunMeta.last("toolLaps") === null;
  })());
  ok("the five tools publish when their reads land", ["defender", "laps", "compliance", "securescore", "devicecleanup"].every((f) => /RunMeta\.publish\("tool\w+"/.test(read(`js/${f}.js`))));
  $("acctBtn").click(); $("signOutBtn").click(); await tick(30);
  ok("sign-out forgets this session's runs and blanks the overview", w.RunMeta.last("toolDefender") === null && $("wcOverview").innerHTML === "");
}

// =====================================================================
head("A cold start says so and reads at the click; a write drops the read");
{
  const w = await start({ cold: true });
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("no consent yet: no sign-in read", !w.PolicyCache.get() && !w.PolicyCache.reading());
  ok("Home says not read, every count —, none 0", /Not read yet/.test($("wcOverview").textContent) && Object.values(counts(w)).every((v) => v === "—"));
  ok("no findings and no read band from nothing", !D.querySelector("#hoWorth") && !D.querySelector("#hoContext"));
  ok("Your checks stay — they are the tools' own runs", $$(w, "#hoChecks .db-check").length === 5);
  let asked = null;
  w.Graph.ensureScopes = async (s) => { asked = s; return true; };
  D.querySelector("#wcOverview [data-horead]").click();
  for (let i = 0; i < 120 && !(w.PolicyCache.get() && D.querySelector("#hoWorth")); i++) await tick(50);
  ok("Read the tenant asks for the read's scopes at the click", Array.isArray(asked) && asked.length > 0);
  ok("and fills the overview from the shared read", !!w.PolicyCache.get() && counts(w).all === String(w.HomeOverview.model(w.PolicyCache.get(), Date.now(), {}).counts.policies.n));
  ok("a read from a click is not called the sign-in read", /^Read, /.test($("wcHomeLead").textContent) && /In the policy read/.test($("hoContext").textContent));
  w.PolicyCache.invalidate();
  await tick(10);
  ok("a write drops the read: Home says the policies changed, and offers the read", /The policies changed in this session/.test($("wcOverview").textContent) && $("wcOverview").querySelector("[data-horead]") && Object.values(counts(w)).every((v) => v === "—"));
  ok("the cache says when it changes: start, done, failed, dropped, cleared, cold", /emit\("start"\)/.test(read("js/policycache.js")) && /emit\("done"\)/.test(read("js/policycache.js")) && /emit\("cold"\)/.test(read("js/policycache.js")) && /emit\("cleared"\)/.test(read("js/policycache.js")));
}

// =====================================================================
head("The roadmap and Help say so");
{
  const w = boot();
  const D = w.document;
  const r41 = [...D.querySelectorAll(".rm-card")].find((c) => [...c.querySelectorAll("h4 .rm-ref")].some((r) => r.textContent === "R41"));
  // the tag counts the slices shipped so far, so it moves on with each one
  const upTo = +((/slices 1–(\d+)(?:, [0-9–, ]+)? · beta \d+/.exec(r41.querySelector("h4").textContent) || [])[1] || 0);
  ok("R41 counts slice 10", upTo >= 10 && /Slice 10, the Intune overview \(beta 10671\)/.test(r41.textContent), String(upTo));
  ok("Help's Getting around names the overview", /Intune overview[\s\S]*Worth a look first[\s\S]*Your checks/.test(D.getElementById("screen-help").textContent));
}

});

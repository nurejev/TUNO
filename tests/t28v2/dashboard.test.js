// T28 📊 Dashboard (build 10703, option A off the mockup canvas "T28 ·
// Rollout dashboard"): the engine (js/mdedash.js) on made-up input — the
// four answers, the conflict tiers, new against new, the region filter, the
// export — then the screen on the demo tenant: the sixth source, the cards,
// the chips, the lists, the pairs, the export and the Defender consent.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");

process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, label) {
  const end = Date.now() + (ms || 20000);
  for (;;) {
    let v = false; try { v = fn(); } catch { v = false; }
    if (v) return true;
    if (Date.now() > end) { console.error("timeout: " + (label || "")); return false; }
    await sleep(25);
  }
}

function boot() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const files = [...html.matchAll(/<script src="(js\/[^"?]+)\?v=\d+"><\/script>/g)].map((m) => m[1]);
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://nurejev.github.io/tuno-beta/" });
  const w = dom.window;
  w.crypto = w.crypto || {};
  if (!w.crypto.getRandomValues) w.crypto.getRandomValues = (a) => { for (let i = 0; i < a.length; i++) a[i] = 1; return a; };
  w.alert = () => {};
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  const store = new Map();
  Object.defineProperty(w, "localStorage", { value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  }, configurable: true });
  const blobs = [];
  w.URL.createObjectURL = (b) => { blobs.push(b); return "blob:x"; }; w.URL.revokeObjectURL = () => {};
  w.msal = undefined;
  w.fetch = () => Promise.reject(new Error("no network in tests"));
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const bridge = ";Object.assign(window,{TOOL_VERSIONS,Graph,PolicyCache,MdeDash,Conflict,MdeRolloutV2Tool,TUNO_DEMO_GRAPH,MdeMembers});";
  const realErr = console.error, realLog = console.log, realWarn = console.warn;
  console.error = () => {}; console.log = () => {}; console.warn = () => {};
  let err = null;
  try { w.eval(src + "\n" + bridge); } catch (e) { err = e; }
  console.error = realErr; console.log = realLog; console.warn = realWarn;
  if (err) throw err;
  w.Graph.ensureScopes = async () => true;
  w.Graph.silentScopes = async () => true;
  w.TUNO_DEMO_GRAPH.LATENCY_MS = 0;
  return { w, files, blobs };
}

// ---------------------------------------------------------------- engine --
function engine(w) {
  const X = w.MdeDash;
  const q = X.onboardingKql();
  ok("the Defender query: DeviceInfo, 30 days, Windows 10/11, the newest row per device with the Entra id, onboarding status and sensor health", /^DeviceInfo/.test(q) && /ago\(30d\)/.test(q) && /startswith "Windows1"/.test(q) && /arg_max\(Timestamp, DeviceName, AadDeviceId, OnboardingStatus, SensorHealthState/.test(q) && /LastSeen = Timestamp/.test(q));
  ok("onboarding words: Onboarded, Can be onboarded, and anything else is unsupported", X.statusOf({ OnboardingStatus: "Onboarded" }) === "onboarded" && X.statusOf({ OnboardingStatus: "Can be onboarded" }) === "can" && X.statusOf({ OnboardingStatus: "Insufficient info" }) === "unsupported" && X.statusOf({ OnboardingStatus: "Unsupported" }) === "unsupported");
  const D = X.defenderIndex([
    { AadDeviceId: "A1", DeviceName: "pc1.contoso.local", OnboardingStatus: "Can be onboarded", LastSeen: "2026-10-01T00:00:00Z" },
    { AadDeviceId: "a1", DeviceName: "pc1.contoso.local", OnboardingStatus: "Onboarded", SensorHealthState: "Active", LastSeen: "2026-10-09T00:00:00Z" },
    { AadDeviceId: "a2", DeviceName: "pc2", OnboardingStatus: "Onboarded", SensorHealthState: "Inactive", LastSeen: "2026-10-09T00:00:00Z" },
    { AadDeviceId: "", DeviceName: "LAB-7.contoso.local", OnboardingStatus: "Can be onboarded", LastSeen: "2026-10-08T00:00:00Z" },
  ]);
  ok("the index keeps the newest row per Entra id (any case), and a row without one by its short name", D.byAad.get("a1").OnboardingStatus === "Onboarded" && D.byName.get("lab-7").OnboardingStatus === "Can be onboarded" && D.rows === 4);

  const waves = { devices: new Map([["w1", [{ id: "o1", deviceId: "a1", name: "PC1" }, { id: "o2", deviceId: "a2", name: "PC2" }, { id: "o3", deviceId: "a3", name: "cto-vdi-01" }, { id: "o4", deviceId: "", name: "LAB-7" }]], ["w2", [{ id: "o1", deviceId: "a1", name: "PC1" }]]]),
    users: new Map([["wu1", [{ id: "u1", upn: "ann@x.nl" }, { id: "u2", upn: "bob@x.nl" }, { id: "u3", upn: "cid@x.nl" }]]]), errors: [] };
  const managed = [
    { id: "m1", azureADDeviceId: "a1", userId: "u1", operatingSystem: "Windows", deviceName: "PC1", userPrincipalName: "ann@x.nl" },
    { id: "m2", azureADDeviceId: "a2", userId: "u2", operatingSystem: "Windows", deviceName: "PC2", userPrincipalName: "bob@x.nl" },
    { id: "m5", azureADDeviceId: "a5", userId: "u2", operatingSystem: "Windows", deviceName: "PC5" },
    { id: "m6", azureADDeviceId: "a6", userId: "u3", operatingSystem: "macOS", deviceName: "MAC6" },
  ];
  const per = (o) => new Map(Object.entries(o).map(([k, s]) => [k, { state: s }]));
  const landing = { policies: [{ key: "p1", name: "AV Configuration" }, { key: "p2", name: "ASR 15" }], members: [
    { kind: "device", name: "PC1", intuneId: "m1", aadId: "a1", regions: new Set(["Euro"]), per: per({ p1: "landed", p2: "conflict" }) },
    { kind: "device", name: "PC2", intuneId: "m2", aadId: "a2", regions: new Set(["Euro"]), per: per({ p1: "pending", p2: "none" }) },
    { kind: "device", name: "PC9", intuneId: "m9", aadId: "a9", regions: new Set(["Euro"]), per: per({ p1: "excluded" }) },
    { kind: "device", name: "PC3", intuneId: "m3", aadId: "a3x", regions: new Set(["Euro"]), per: per({ p1: "na", p2: "error" }) },
    { kind: "user", name: "ann@x.nl", regions: new Set(["Euro"]), per: per({ p3: "landed" }) },
  ] };
  const P = (id, name) => ({ id, key: `sc|${id}`, name });
  const N1 = P("N1", "New AV"), N2 = P("N2", "ASR set"), N3 = P("N3", "New Edge"), N4 = P("N4", "ASR 14"), N5 = P("N5", "ASR 15"), N6 = P("N6", "Ring 1"), N7 = P("N7", "Ring 2"), N8 = P("N8", "<img src=x onerror=alert(1)>"), N9 = P("N9", "New FW");
  const O1 = P("O1", "RB-WSB-DEFENDER"), O2 = P("O2", "Legacy intent"), O3 = P("O3", "Old Edge"), O4 = P("O4", "Old FW A"), O5 = P("O5", "Old FW B");
  const pr = (N, O, type, verdict, diffs, sames) => ({ id: `${N.key}~${O.key}`, N, O, type, verdict, diffs: diffs || [], sames: sames || [], common: type === "review" ? ["av"] : [], reach: { verdict, why: verdict } });
  const d1 = { name: "Cloud block level", oldDisplay: "0", newDisplay: "2" };
  const pairs = [pr(N1, O1, "conflict", "can", [d1, { name: "PUA", oldDisplay: "0", newDisplay: "1" }], [{}]), pr(N2, O1, "conflict", "can", [{ name: "ASR · Office child processes", oldDisplay: "audit", newDisplay: "block" }]),
    pr(N1, O2, "review", "may"), pr(N3, O3, "conflict", "staged", [d1]), pr(N1, O3, "duplicate", "can", [], [{}]),
    pr(N9, O4, "conflict", "can", [d1]), pr(N9, O5, "conflict", "can", [d1])];
  const np = (A, B, verdict) => ({ id: `${A.key}~${B.key}`, A, B, type: "conflict", diffs: [{ name: "ASR · email and webmail", aDisplay: "off", bDisplay: "block" }], sames: [], reach: { verdict, why: verdict } });
  const newPairs = [np(N4, N5, "can"), np(N6, N7, "may")];
  const set = (...a) => new Set(a);
  const devIdx = { byPolicy: new Map([["n1", set("m1", "m2", "d3")], ["o1", set("m1")], ["n2", set("d4")], ["n4", set("d5")], ["n5", set("d5")], ["n8", set("d6")], ["n9", set("d7")]]),
    devices: new Map(["m1", "m2", "d3", "d4", "d5", "d6", "d7"].map((d) => [d, { id: d, name: `DEV-${d}`, upn: `${d}@x.nl` }])), failed: new Set(), blind: new Set(), summaryError: "" };
  const input = { regions: ["Euro", "Americas", "Italy"], waveList: [{ id: "w1", region: "Euro" }, { id: "w2", region: "Americas" }, { id: "wu1", region: "Euro" }],
    waves, defender: D, managed, landing, live: new Map([["Euro", 2]]), pairs, newPairs, newIds: ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9"],
    policyNames: new Map([["n8", N8.name]]), devIdx, held: { users: 3, devices: 4 } };
  const m = X.model(input);
  ok("① devices: the wave members once each, -vdi- left out; matched on the Entra id or the short name", m.devices.total === 3 && m.devices.counts.onboarded === 2 && m.devices.counts.can === 1 && m.devices.counts.notseen === 0 && m.devices.known);
  ok("…an onboarded device whose sensor is not Active is counted as silent", m.devices.silent === 1);
  ok("② users by their Windows devices (Intune primary user): every / some / none / no Windows device (a Mac does not count)", m.users.total === 3 && m.users.counts.all === 1 && m.users.counts.some === 1 && m.users.counts.none === 0 && m.users.counts.nodevice === 1);
  ok("③ evidence: a device that reported a result for every new policy, for some, for none (pending and no status are waiting; one excluded from everything is not expected)", m.evidence.total === 3 && m.evidence.counts.all === 2 && m.evidence.counts.some === 0 && m.evidence.counts.none === 1 && m.evidence.users.total === 1 && m.evidence.users.all === 1);
  ok("④ results: the worst of what each reporting device sent — conflict over error over pending over landed (not applicable lands)", m.results.total === 2 && m.results.counts.conflict === 1 && m.results.counts.error === 1 && m.results.counts.landed === 0);
  ok("the waves: one row per region with its live count; a device shared by two regions counts in both", m.waves.length === 3 && m.waves[0].live === 2 && m.waves[1].live === 0 && m.waves[1].devices.total === 1 && m.waves[0].devices.total === 3);
  const byId = (id) => m.conflicts.pairs.find((p) => p.id === id);
  const a = byId("sc|N1~sc|O1");
  ok("named: Intune reports both policies on m1; matched: m2 and d3 report only the new one and the one exact partner that shares a target is O1", a && a.tier === "named" && a.namedN === 1 && a.matchedN === 2 && a.devices === 3);
  const b = byId("sc|N2~sc|O1");
  ok("matched by T28 alone: d4 on the ASR set only, O1 silent — the pair is named from the settings", b && b.tier === "matched" && b.devices === 1);
  ok("new ⇄ new: two new policies on one ASR rule, both reported on d5 — named", byId("sc|N4~sc|N5") && byId("sc|N4~sc|N5").tier === "named" && byId("sc|N4~sc|N5").kind === "new");
  ok("new ⇄ new that only MAY meet (the rings) and has no device is not shown", !byId("sc|N6~sc|N7"));
  ok("predicted: settings differ, the new policy is not assigned yet, no device", byId("sc|N3~sc|O3") && byId("sc|N3~sc|O3").tier === "predicted" && byId("sc|N3~sc|O3").devices === 0);
  ok("candidates: two exact partners share a target with N9 — d7 listed against both, neither chosen", byId("sc|N9~sc|O4").tier === "candidates" && byId("sc|N9~sc|O5").tier === "candidates" && m.conflicts.candidates.length === 1 && m.conflicts.candidates[0].names.length === 2);
  ok("unresolved: d6 in conflict on a new policy no other policy explains", m.conflicts.unresolved.length === 1 && m.conflicts.unresolved[0].id === "d6" && m.conflicts.unresolved[0].policies[0] === N8.name);
  ok("a duplicate pair is counted for clean-up, never listed as a conflict", m.conflicts.duplicates === 1 && !byId("sc|N1~sc|O3"));
  ok("every device in conflict on a new policy is counted once", m.conflicts.devices === 7);
  ok("the pairs lead with the most devices", m.conflicts.pairs[0].id === "sc|N1~sc|O1");
  const am = X.model(input, { region: "Americas" });
  ok("a wave chip narrows every answer: Americas has PC1 alone, and only m1 of the conflict devices", am.region === "Americas" && am.devices.total === 1 && am.conflicts.devices === 1 && am.users.total === 0 && byIdOf(am, "sc|N1~sc|O1").devices === 1);
  function byIdOf(mm, id) { return mm.conflicts.pairs.find((p) => p.id === id); }
  const unread = X.model(Object.assign({}, input, { defender: null, landing: null, devIdx: null }));
  ok("unread sources stay unknown — never zero: devices counted, onboarding not known; evidence and pairs say not read", unread.devices.total === 3 && !unread.devices.known && !unread.users.known && !unread.evidence.known && !unread.conflicts.known && unread.conflicts.pairs.every((p) => p.tier === "predicted"));

  const h = X.html(m, { app: true, list: "devices", open: new Set(["sc|N1~sc|O1"]), countries: new Map([["Euro", [{ key: "nl", country: "Netherlands" }]]]), input });
  const H = new w.DOMParser().parseFromString(`<div>${h}</div>`, "text/html");
  ok("the screen: four cards, each with its donut and legend", H.querySelectorAll(".dash-card").length === 4 && H.querySelectorAll(".dash-svg").length === 4 && H.querySelectorAll(".dash-leg").length === 4);
  ok("…a chip per wave plus All waves, the open list, the wave table with country buttons", H.querySelectorAll("[data-dash-region]").length === 4 && !!H.querySelector(".dash-list") && /PC2/.test(H.querySelector(".dash-list").textContent) && !!H.querySelector('[data-project-country="nl"]'));
  ok("…the unfolded pair shows its settings with both values and its devices by tier", /Cloud block level/.test(H.body.textContent) && /Named by Intune: DEV-m1/.test(H.body.textContent) && /Matched by T28: DEV-m2/.test(H.body.textContent));
  ok("…the hold-back said beside the counts", /4 devices · 3 users held back/.test(H.body.textContent));
  ok("tenant text is escaped everywhere (a policy name carrying markup)", !h.includes("<img src=x") && h.includes("&lt;img src=x"));
  const x = X.exportHtml(m, { tenant: "Contoso <b>", build: "v1.0.3-beta.403", now: Date.parse("2026-10-10T08:00:00Z"), times: [["policies", Date.parse("2026-10-10T07:00:00Z")]] }, input);
  ok("the export: one self-contained page — no script, no external file, its own light and dark colours, the four donuts", /^<!doctype html>/.test(x) && !/<script/i.test(x) && !/<link /i.test(x) && /prefers-color-scheme:dark/.test(x) && (x.match(/<svg/g) || []).length === 4);
  ok("…every list and every pair folded as details, the read times and the snapshot warning", (x.match(/<details/g) || []).length >= 4 + m.conflicts.pairs.length && /Read: policies 2026-10-10 07:00 UTC/.test(x) && /names devices and users/.test(x) && x.includes("Contoso &lt;b&gt;"));
  const c = X.csv(m).split("\r\n");
  ok("the CSV: a header and one row per wave device and wave user", c[0].startsWith("kind,name,user,waves,mde_onboarding") && c.length === 1 + 3 + 3 && c.some((l) => /^device,PC2,bob@x.nl,Euro,Onboarded,Inactive/.test(l)));

  // new against new, on real reach shapes
  const reach = (...g) => w.Conflict.reachOf({ assignments: g.map((id) => ({ kind: "Included", groupId: id })) });
  const cat = (key, value, r) => ({ id: key, key, name: key, format: "catalog", reach: r, settings: new Map([["asr|email", { name: "ASR · email", value, display: value }], ["x", { name: "X", value: "1", display: "1" }]]) });
  const nps = X.newPairs([cat("A", "off", reach("g1")), cat("B", "block", reach("g1")), cat("C", "block", reach("g2")), cat("D", "off", w.Conflict.reachOf({ assignments: [] }))]);
  const f = (id) => nps.find((p) => p.id === id);
  ok("newPairs: the same ASR rule Off and Block under a shared group is a conflict that CAN meet; other groups MAY; an unassigned side is staged; same values are a duplicate", f("A~B").type === "conflict" && f("A~B").reach.verdict === "can" && f("A~C").reach.verdict === "may" && f("A~D").reach.verdict === "staged" && f("B~C").type === "duplicate");
}

async function run() {
  const { w, blobs } = boot(), D = w.document, $ = (id) => D.getElementById(id), tool = w.MdeRolloutV2Tool, st = () => tool._state();
  engine(w);
  const idle = () => until(() => st().model && st().project.attempted.size === 5 && !st().project.starting && !st().project.task && !st().project.timer && !st().running && !st().reps.busy && !st().ld.busy && !st().dv.busy && !st().ob.busy && !st().mem.loading, 40000, "automatic project idle");
  const click = (sel) => { const el = D.querySelector(sel); if (!el) throw new Error("no " + sel); el.click(); };
  $("demoLink").click(); await until(() => w.PolicyCache.get(), 20000, "sign in");
  $("toolMdeRollout").click(); await idle(); await sleep(30);
  const body = $("mvBody");
  ok("the sixth source reads by itself: waves & Defender onboarding, ready", st().project.sources.onboarding && st().project.sources.onboarding.state === "ready" && !!st().ob.read && !!st().ob.read.defender);
  ok("the strip folds to six ticks", body.querySelectorAll(".t28-strip.done .t28-ticks span").length === 6 && /Defender onboarding/.test(body.querySelector(".t28-strip").textContent));
  ok("Overview opens on the Dashboard: four donuts, the waves, the pairs", st().pane === "overview" && body.querySelector(".t28-subnav button").textContent === "Dashboard" && body.querySelectorAll(".dash-svg").length === 4 && !!body.querySelector(".dash-waves") && !!body.querySelector(".dash-conf"));
  const card = (i) => body.querySelectorAll(".dash-card")[i];
  ok("① on the demo: the Euro devices onboarded, one with a silent sensor", /2 of 2/.test(card(0).textContent) && /1 onboarded with a sensor that is not active/.test(card(0).textContent));
  ok("② users: one with every device onboarded, one with none", /1 of 2/.test(card(1).textContent));
  ok("the Euro wave is live with its new policies; the others not started", /Live · 2 new policies/.test(body.querySelector(".dash-waves tbody tr").textContent) && /Not started/.test(body.querySelectorAll(".dash-waves tbody tr")[1].textContent));
  click('[data-dash-list="devices"]');
  ok("a card's link opens its list — the silent sensor named", st().dash.list === "devices" && /WS-ENG-0221/.test(body.querySelector(".dash-list").textContent) && /sensor inactive/.test(body.querySelector(".dash-list").textContent));
  click('.dash-list [data-dash-list=""]');
  ok("…Close closes it", !st().dash.list && !body.querySelector(".dash-list"));
  click('[data-dash-region="Americas"]');
  ok("a wave chip narrows the page — Americas has no device yet", st().dash.region === "Americas" && /No device in the device waves yet/.test(card(0).textContent) && body.querySelector('[data-dash-region="Americas"]').getAttribute("aria-pressed") === "true");
  click('[data-dash-region=""]');
  const first = body.querySelector("[data-dash-pair]");
  first.click();
  ok("▾ opens a pair: its settings with both values and the devices", st().dash.open.size === 1 && !!body.querySelector(".dash-detail") && /Setting/.test(body.querySelector(".dash-detail").textContent));
  ok("the demo's pairs say how T28 knows", /Named by Intune/.test(body.querySelector(".dash-conf").textContent));
  blobs.length = 0;
  click('[data-dash-export="html"]'); await sleep(20);
  const html = blobs.length ? await blobs[0].text() : "";
  ok("⭳ Export HTML downloads the page: no script, four donuts, the tenant", html.length > 2000 && !/<script/i.test(html) && (html.match(/<svg/g) || []).length === 4 && /Contoso/.test(html));
  blobs.length = 0;
  click('[data-dash-export="csv"]'); await sleep(20);
  const csv = blobs.length ? await blobs[0].text() : "";
  ok("⭳ CSV: a row per wave device and user", /^kind,name,user,waves/.test(csv) && /WS-FIN-0142/.test(csv));
  // Defender refused: the waves still count, the card offers the consent
  const silent = w.Graph.silentScopes;
  w.Graph.silentScopes = async (s) => !(s || []).includes("ThreatHunting.Read.All");
  $("mvRun").click(); await sleep(50); await idle(); await sleep(30);
  ok("without ThreatHunting.Read.All the source is partial and names the scope", st().project.sources.onboarding.state === "partial" && /ThreatHunting\.Read\.All/.test(st().project.sources.onboarding.error) && st().ob.read && !st().ob.read.defender && st().ob.read.defenderConsent);
  ok("…the device card says so and offers the read — the wave count stays", /needs ThreatHunting\.Read\.All/.test(card(0).textContent) && !!card(0).querySelector('[data-dash-consent="hunting"]') && st().dashModel().devices.total === 2);
  w.Graph.silentScopes = silent;
  card(0).querySelector('[data-dash-consent="hunting"]').click();
  await until(() => st().ob.read && st().ob.read.defender && !st().ob.busy, 20000, "defender after consent");
  await sleep(30);
  ok("Allow the Defender read asks for the scope and reads — the donut is back", st().project.sources.onboarding.state === "ready" && body.querySelectorAll(".dash-card")[0].querySelector(".dash-svg"));
  console.log(`T28 dashboard: ${passed} passed, ${failed} failed`);
  if (!failed) process.exitCode = 0;
}
run().then(() => process.exit(process.exitCode), (e) => { console.error(e && e.stack || e); process.exit(1); });

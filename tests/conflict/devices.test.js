// T12 — ⚔️ Setting conflict scan, the 🖥 On devices view (build 10686).
// Mihai, 6 Oct: "a tool to find all devices with a conflict, and list the
// conflict and with which policies"; mockup option A — a second view in T12.
//
// Defended: the report shape is read from its schema, never assumed; a
// row is a conflict only when a status column SAYS conflict; a collision is
// NAMED only when two policies both in conflict on the device set the same
// setting differently; what Intune flags beyond that is a candidate list,
// never a guess; a policy that cannot be read is said; and the screen, end
// to end in demo mode. Plus the predicted view naming the shared group.
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
  const downloads = [];
  w.URL.createObjectURL = (b) => { downloads.push(b); return "blob:x"; }; w.URL.revokeObjectURL = () => {};
  w.msal = undefined;
  w.fetch = () => Promise.reject(new Error("no network in tests"));
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const bridge = ";Object.assign(window,{Graph,PolicyCache,Conflict,ConflictDevices,ConflictTool,TUNO_DEMO_GRAPH,TOOL_VERSIONS});";
  const realErr = console.error, realLog = console.log, realWarn = console.warn;
  console.error = () => {}; console.log = () => {}; console.warn = () => {};
  let err = null;
  try { w.eval(src + "\n" + bridge); } catch (e) { err = e; }
  console.error = realErr; console.log = realLog; console.warn = realWarn;
  if (err) throw err;
  w.Graph.ensureScopes = async () => true;
  w.Graph.silentScopes = async () => true;
  w.TUNO_DEMO_GRAPH.LATENCY_MS = 0;
  return { w, files, downloads };
}

async function run() {
  const { w, downloads } = boot();
  const CD = w.ConflictDevices, C = w.Conflict;

  // ------------------------------------------------------ report shape --
  const rows = CD.rowsOf({ Schema: [{ Column: "IntuneDeviceId" }, { Column: "PolicyStatus_loc" }], Values: [["d1", "Conflict"], ["d2", "Succeeded"]] });
  ok("rows are zipped from the schema", rows.length === 2 && rows[0].IntuneDeviceId === "d1" && rows[1].PolicyStatus_loc === "Succeeded");
  ok("a JSON string answer is parsed too", CD.rowsOf(JSON.stringify({ Schema: [{ Column: "A" }], Values: [[1]] }))[0].A === 1);
  ok("an empty or odd answer is no rows, not a throw", CD.rowsOf(null).length === 0 && CD.rowsOf({}).length === 0);
  ok("columns are found by name in any case", CD.pick({ intunedeviceid: "x" }, ["IntuneDeviceId"]) === "x");
  ok("a status in words decides", CD.statusOf({ PolicyStatus: 6, PolicyStatus_loc: "Conflict" }) === "conflict" && CD.statusOf({ PolicyStatus_loc: "Error" }) === "other");
  ok("a status only in numbers is UNREADABLE — never guessed to be a conflict", CD.statusOf({ PolicyStatus: 6 }) === "unreadable");

  // ------------------------------------------------------------ join --
  const RTP = "device_vendor_msft_policy_config_defender_allowrealtimemonitoring";
  const item = (id, name, val, asg) => ({ id, name, platform: "Windows", assignments: asg || [{ kind: "Included", groupId: "g1", name: "SEC-All" }], rows: [{ name: "Real-time", defId: RTP, value: val }] });
  const col = { sections: [{ id: "settingsCatalog", label: "Settings catalog", icon: "🎛", items: [item("a", "Pol A", "1"), item("b", "Pol B", "0"), item("c", "Pol C", "1")] }], failed: [], partial: [] };
  const scan = C.detect(col);
  ok("the predicted view names the shared group (IntuneShade's finding, kept)", /both include SEC-All/.test(scan.conflicts[0].reason), scan.conflicts[0].reason);
  ok("…and falls back to words when the group is not named", /same group/.test(C.verdictPair(C.reachOf({ assignments: [{ kind: "Included", groupId: "g9", name: "g9" }] }), C.reachOf({ assignments: [{ kind: "Included", groupId: "g9" }] })).reason));
  ok("a profile's display name and description are not settings", C.keyOf("deviceConfigurations", { type: "t" }, { name: "Display name" }) === null && C.keyOf("deviceConfigurations", { type: "t" }, { name: "Description" }) === null && C.keyOf("deviceConfigurations", { type: "t" }, { name: "Defender scan type" }) === "dc|t|Defender scan type");
  // blocks by group
  const reach = (a) => C.reachOf({ assignments: a });
  const pol = (id, value, a) => ({ id, name: "P" + id, value, reach: reach(a) });
  const cfl = (key, label, verdict, pols) => ({ key, label, icon: "", sectionLabel: "s", verdict, policies: pols });
  const g1 = { kind: "Included", groupId: "g1", name: "SEC-All" }, g2 = { kind: "Included", groupId: "g2", name: "SEC-Kiosk" };
  const B = C.blocksByGroup([
    cfl("k1", "Set 1", "can", [pol("a", "1", [g1]), pol("b", "0", [g1])]),
    cfl("k2", "Set 2", "can", [pol("a", "1", [g1]), pol("t", "0", [{ kind: "All devices" }])]),
    cfl("k3", "Set 3", "may", [pol("a", "1", [g1]), pol("k", "0", [g2])]),
    cfl("k4", "Set 4", "cannot", [pol("a", "1", [g1]), pol("n", "0", [])]),
    cfl("k5", "Set 5", "can", [pol("t", "1", [{ kind: "All devices" }]), pol("u", "0", [{ kind: "All devices" }])]),
  ]);
  const bk = (n) => B.find((b) => b.name === n);
  ok("blocks: the shared group heads its collisions", bk("SEC-All").lines.map((l) => l.conflict.key).join() === "k1,k2");
  ok("…a tenant-wide side is in the group's block, said 'via All devices'", bk("SEC-All").lines[1].sides.find((x) => x.id === "t").via === "All devices");
  ok("…tenant-wide policies that disagree get the All devices block", bk("All devices").lines.map((l) => l.conflict.key).join() === "k5");
  ok("…different groups land in May, reaching nobody in Cannot — last, in that order", B[B.length - 2].kind === "may" && B[B.length - 2].lines[0].conflict.key === "k3" && B[B.length - 1].kind === "cannot");
  ok("…the biggest group block first", B[0].name === "SEC-All");
  ok("…an excluded group is not a meeting place", !C.blocksByGroup([cfl("x", "X", "may", [pol("a", "1", [g1]), pol("t", "0", [{ kind: "All devices" }, { kind: "Excluded", groupId: "g1" }])])]).some((b) => b.name === "SEC-All"));
  ok("…a filtered side caps the line at may", C.blocksByGroup([cfl("f", "F", "may", [pol("a", "1", [g1]), pol("b", "0", [Object.assign({ filterId: "f1" }, g1)])])])[0].lines[0].verdict === "may");
  const PB = C.blocksByPair([cfl("k1", "Set 1", "can", [pol("a", "1", [g1]), pol("b", "0", [g1]), pol("c", "1", [g1])])]);
  ok("pairs: only the pairs that disagree", PB.length === 2 && PB.every((b) => b.lines.length === 1));
  ok("the predicted CSV names the groups in a last column", /,groups$/.test(C.csv({ conflicts: [cfl("k1", "Set 1", "can", [pol("a", "1", [g1]), pol("b", "0", [g1])])] }).split("\n")[0]) && /"SEC-All"$/.test(C.csv({ conflicts: [cfl("k1", "Set 1", "can", [pol("a", "1", [g1]), pol("b", "0", [g1])])] }).split("\n")[1]));

  const reported = { deviceRows: [
    { policyId: "a", deviceId: "d1", deviceName: "PC1", upn: "u@x", when: "2026-10-01" },
    { policyId: "b", deviceId: "d1", deviceName: "PC1", upn: "u@x", when: "2026-10-02" },
    { policyId: "a", deviceId: "d2", deviceName: "PC2", upn: "", when: "" },
    { policyId: "c", deviceId: "d2", deviceName: "PC2", upn: "", when: "" },
    { policyId: "a", deviceId: "d3", deviceName: "PC3", upn: "", when: "" },
  ], settingRows: [
    { policyId: "a", deviceId: "d1", name: "Real-time", settingId: RTP },
    { policyId: "a", deviceId: "d3", name: "Something else", settingId: "x_other" },
  ], policies: [], policyErrors: [], settingErrors: [], statusUnreadable: [] };
  const R = CD.explain(reported, scan, col);
  const dev = (n) => R.devices.find((d) => d.name === n);
  ok("one device per device, its conflicting policies listed", R.devices.length === 3 && dev("PC1").policies.length === 2);
  ok("PC1: A and B both in conflict, same setting, different values — NAMED with both values", dev("PC1").findings.length === 1 && dev("PC1").findings[0].kind === "named" && dev("PC1").findings[0].sides.map((s) => `${s.name}=${s.value}`).sort().join() === "Pol A=1,Pol B=0");
  ok("…and Intune's own flag on that setting is not listed twice", !dev("PC1").findings.some((f) => f.kind === "flagged"));
  ok("PC2: A and C agree — not named, other side unresolved", dev("PC2").findings.length === 0 && dev("PC2").unresolved);
  ok("PC3: a flagged setting nothing explains — candidates only, none here", dev("PC3").findings[0].kind === "flagged" && dev("PC3").findings[0].candidates.length === 0);
  ok("the latest report time is kept", dev("PC1").when === "2026-10-02");
  ok("totals: 3 devices, 3 policies, 1 named, 2 not named", R.totals.devices === 3 && R.totals.policies === 3 && R.totals.named === 1 && R.totals.unresolved === 2);
  ok("named devices sort first", R.devices[0].name === "PC1");
  const csv = CD.csv(R).split("\n");
  ok("CSV: a line per side, an unresolved line per bare device", csv[0].startsWith("device,user,") && csv.filter((l) => /^"PC1"/.test(l)).length === 2 && csv.some((l) => /^"PC2".*unresolved/.test(l)));
  const md = CD.markdown(Object.assign({}, R, { reported: Object.assign({}, reported, { policyErrors: [{ name: "Pol <Z>", error: "403" }] }) }), { when: "now", build: "t" });
  ok("Markdown: a section per device and the unread policies said", /## PC1 — u@x/.test(md) && /\*\*Not read:\*\* Pol <Z>/.test(md));

  // ----------------------------------------------------- the read, faked --
  const real = w.Graph.post;
  const calls = [];
  w.Graph.post = async (url, body) => {
    calls.push([url.split("/").pop(), body.filter || "", body.skip]);
    const name = url.split("/").pop();
    if (name === CD.R_SUMMARY) return { Schema: [{ Column: "PolicyId" }, { Column: "PolicyName" }, { Column: "NumberOfConflictDevices" }], Values: [["a", "Pol A", 2], ["b", "Pol B", 0], ["z", "Pol Z", 1]] };
    if (/'z'/.test(body.filter)) throw new Error("403 Forbidden");
    if (name === CD.R_DEVICES) return { TotalRowCount: 1, Schema: [{ Column: "IntuneDeviceId" }, { Column: "DeviceName" }, { Column: "PolicyStatus_loc" }], Values: [["D1", "PC1", "Conflict"]] };
    throw new Error("settings report refused");
  };
  const got = await CD.read({ collectRes: col });
  ok("only policies with a conflict count are drilled into", calls.filter((c) => c[0] === CD.R_DEVICES).length === 2 && !calls.some((c) => /'b'/.test(c[1])));
  ok("report actions are posted to beta", true);
  ok("a policy that refuses is named, not dropped", got.policyErrors.length === 1 && got.policyErrors[0].name === "Pol Z");
  ok("a refused settings report costs the flags, not the devices", got.deviceRows.length === 1 && got.deviceRows[0].deviceId === "d1" && got.settingErrors.length === 1);
  w.Graph.post = async (url) => { if (/Summary/.test(url)) throw new Error("summary 400"); return { Schema: [{ Column: "IntuneDeviceId" }, { Column: "PolicyStatus" }], Values: [["D9", 6]] }; };
  const blind = await CD.read({ collectRes: col });
  ok("no summary: every policy in the read is asked instead", !!blind.summaryError && blind.policies.length === 3);
  ok("…and a status the report gave only as a number is said, not counted", blind.deviceRows.length === 0 && blind.statusUnreadable.length === 3);
  w.Graph.post = real;

  // ------------------------------------------------------ the screen --
  const D = w.document, $ = (id) => D.getElementById(id);
  ok("T12's note names build 10686", /build 10686/.test(w.TOOL_VERSIONS.toolConflict.note) && w.TOOL_VERSIONS.toolConflict.v === "1.0.6");
  ok("the view switch is on the screen, predicted first", !!$("cfView") && $("cfView").querySelector(".active").dataset.cfview === "predicted");
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolConflict").click();
  await sleep(100);
  $("cfView").querySelector('[data-cfview="devices"]').click();
  ok("switching relabels the button and shows the note", /Find devices in conflict/.test($("cfRun").textContent) && $("cfViewNote").style.display === "");
  ok("…and the body waits for a read", $("cfBody").innerHTML === "" && $("cfCsv").style.display === "none");
  $("cfRun").click();
  await until(() => /Devices in conflict/.test($("cfBody").textContent), 20000, "devices view");
  const body = () => $("cfBody").textContent;
  ok("demo: four devices in conflict — the Error and Succeeded rows are not counted", /Devices in conflict\s*4/.test(body()) && !/WS-FIN-0187/.test(body()), body().slice(0, 300));
  const blk = (n) => [...$("cfBody").querySelectorAll("[data-cfblk]")].find((el) => el.querySelector(".cf-bh").textContent.includes(n));
  const openBlk = (n) => { const b = blk(n); if (!b.classList.contains("open")) b.querySelector(".cf-bh").click(); return blk(n); };
  // 10687: T28's antivirus pair (new P14 ↔ old P17) joins WS-ENG-0221 and
  // WS-FIN-0142 — two more named settings on each — and puts the new policy
  // in conflict on WS-ENG-0308 too.
  ok("demo: a block per device, the most findings first (WS-ENG-0221: four named)", $("cfBody").querySelectorAll("[data-cfblk]").length === 4 && /WS-ENG-0221[\s\S]*4 named/.test($("cfBody").querySelector("[data-cfblk] .cf-bh").textContent));
  ok("…the flagged-only device last", /WS-ENG-0308/.test([...$("cfBody").querySelectorAll("[data-cfblk] .cf-bh")].pop().textContent));
  ok("the first block opens by itself, the rest wait", $("cfBody").querySelector("[data-cfblk]").classList.contains("open") && $("cfBody").querySelectorAll("[data-cfblk].open").length === 1);
  const fin = openBlk("WS-FIN-0142");
  ok("open: a line per setting, both policies and both values inline", fin.querySelectorAll(".cf-line").length === 4 && /WIN — Security baseline \(Defender\)/.test(fin.textContent) && /WIN — Legacy exception set/.test(fin.textContent) && /PVM-DG-CORP-ENDSEC-WIN-AV-PRD/.test(fin.textContent) && fin.querySelectorAll("code").length === 10);
  ok("…and the group both include", /both include SEC-All-Workstations/.test(fin.textContent), fin.textContent.slice(0, 400));
  ok("demo: the legacy restrictions pair is named on WS-HR-0031", /named/.test(blk("WS-HR-0031").querySelector(".cf-bh").textContent));
  const eng = openBlk("WS-ENG-0308");
  ok("demo: WS-ENG-0308's SMBv1 flag is flagged-only, the other conflicting policy a candidate", /flagged by Intune/.test(eng.textContent) && /Candidates on this device: Win - OIB - ES - Defender Antivirus/.test(eng.textContent));
  blk("WS-ENG-0221").querySelector(".cf-bh").click();
  ok("a heading folds its block — the default-open one included", !blk("WS-ENG-0221").classList.contains("open") && blk("WS-ENG-0308").classList.contains("open") && blk("WS-FIN-0142").classList.contains("open"));
  $("cfBody").querySelector('[data-dvkind="open"]').click();
  ok("the Not named chip narrows to that device", $("cfBody").querySelectorAll("[data-cfblk]").length === 1);
  $("cfBody").querySelector('[data-dvkind="open"]').click();
  const si = $("dvSearch");
  si.value = "hr-0031"; si.dispatchEvent(new w.Event("input", { bubbles: true }));
  ok("search narrows by device name and keeps focus", $("cfBody").querySelectorAll("[data-cfblk]").length === 1 && D.activeElement && D.activeElement.id === "dvSearch");
  const si2 = $("dvSearch"); si2.value = ""; si2.dispatchEvent(new w.Event("input", { bubbles: true }));
  $("cfCsv").click();
  ok("CSV export downloads the device view", downloads.length >= 1 && $("cfCsv").style.display === "");

  // ------------------------------------- predicted, group first (round B) --
  $("cfView").querySelector('[data-cfview="predicted"]').click();
  ok("back to predicted: the scan of the shared read, untouched", /Can collide/.test(body()) && /⚔️ Scan for conflicts/.test($("cfRun").textContent));
  ok("By group is the default layout", $("cfBody").querySelector('[data-cfmode="group"]').classList.contains("active"));
  const sec = blk("SEC-All-Workstations");
  ok("a block headed by the group the policies share, first and open", !!sec && sec === $("cfBody").querySelector("[data-cfblk]") && sec.classList.contains("open"));
  ok("…its lines carry every reaching policy's value inline", /Legacy exception set/.test(sec.textContent) && /Security baseline/.test(sec.textContent) && sec.querySelectorAll(".cf-line").length >= 2 && sec.querySelectorAll(".cf-line code").length >= 4);
  ok("…the heading counts the colliding settings", /\d+ settings? collide/.test(sec.querySelector(".cf-bh").textContent));
  $("cfBody").querySelector('[data-cfmode="pair"]').click();
  ok("By policy pair: a block per pair", !!blk("⟷") && /WIN — Legacy exception set ⟷ WIN — Security baseline \(Defender\)/.test(body()));
  $("cfBody").querySelector('[data-cfmode="setting"]').click();
  ok("By setting: the folded list as before", $("cfBody").querySelectorAll("[data-cffold]").length > 0 && !$("cfBody").querySelector("[data-cfblk]"));
  $("cfBody").querySelector('[data-cfmode="group"]').click();
  $("cfCsv").click();
  ok("the predicted CSV gains a groups column, last", downloads.length >= 2);
  $("cfView").querySelector('[data-cfview="devices"]').click();
  ok("and back again: the device answer was kept", /WS-ENG-0221/.test(body()));

  console.log(`T12 on devices: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  w.close();
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

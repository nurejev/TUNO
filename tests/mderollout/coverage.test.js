// T28 — wave coverage (build 10682). DOM-free: the Entra SID → object id
// decode, the Defender logon query, the placement chain (① primary user,
// ② Intune last logged-on user, ③ Defender logons, then the owner and the
// name), "check the primary user", the 📌 pinned devices kept in their group,
// the pin / unpin plans, and the logon steps switched off.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "../..");
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), { runScripts: "outside-only" });
const w = dom.window;
const files = ["js/version.js", "js/graph.js", "js/progress.js", "js/groupuse.js", "js/document.js", "js/overview.js",
  "js/conflict.js", "js/endpointsec.js", "js/filterrules.js", "js/endpointposture.js", "js/assignedit.js",
  "js/groupmigrate.js", "js/mdemembers.js", "js/mdereports.js", "js/mdeexclude.js", "js/mderevert.js", "js/mderollout.js"];
w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n") + "\n;Object.assign(window, {MdeMembers, Graph});");
const MM = w.MdeMembers;
process.exitCode = 1;
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) passed++;
  else { failed++; console.error("FAIL: " + name + (extra ? " — " + extra : "")); }
}
// the forward direction, as Windows builds an Entra SID: the GUID's 16 bytes
// (.NET order) read as four little-endian uint32s
function sidOf(guid) {
  const h = guid.replace(/-/g, "");
  const raw = h.match(/../g).map((x) => parseInt(x, 16));
  const bytes = [raw[3], raw[2], raw[1], raw[0], raw[5], raw[4], raw[7], raw[6]].concat(raw.slice(8));
  const u = [0, 4, 8, 12].map((i) => (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0);
  return `S-1-12-1-${u.join("-")}`;
}

async function run() {
  // ------------------------------------------------------------- SIDs --
  const g = "6a1f3c2e-9b4d-4e8a-a1b2-0c3d4e5f6a7b";
  ok("an Entra SID decodes to the user's object id", MM.sidToObjectId(sidOf(g)) === g, `${sidOf(g)} → ${MM.sidToObjectId(sidOf(g))}`);
  ok("…for another id too (high bits set)", MM.sidToObjectId(sidOf("ffffffff-0001-8000-8f00-fedcba987654")) === "ffffffff-0001-8000-8f00-fedcba987654");
  ok("an on-premises or local SID is not decoded", MM.sidToObjectId("S-1-5-21-1-2-3-1001") === "" && MM.sidToObjectId("") === "");
  const kql = MM.deviceLogonKql(14);
  ok("the Defender query: interactive logons in the window, per device and account, with the Entra device id", /ago\(14d\)/.test(kql) && /LogonSuccess/.test(kql) && /Unlock/.test(kql) && /AadDeviceId/.test(kql) && /summarize Logons = count\(\), Last = max\(Timestamp\) by DeviceId, AccountSid/.test(kql));
  const cfg0 = MM.normConfig(null);
  ok("defaults: both logon steps on, 30 days, the pinned group's name", cfg0.useIntuneLogons && cfg0.useDefenderLogons && cfg0.logonDays === 30 && cfg0.pinnedDevice === "INT-SG-D-MDE-Pinned" && MM.normConfig({ logonDays: 90 }).logonDays === 30 && MM.normConfig({ useDefenderLogons: false }).useDefenderLogons === false);

  // ------------------------------------------------------------ chain --
  const now = Date.parse("2026-10-05T12:00:00Z"), day = 86400000, iso = (t) => new Date(t).toISOString();
  const uDE = "aaaaaaaa-0000-4000-8000-00000000000d", uNL = "bbbbbbbb-0000-4000-8000-00000000000e", uNL2 = "cccccccc-0000-4000-8000-00000000000f";
  const input = {
    countryGroups: [{ id: "gnl", displayName: "PVM-UG-CORP-MEM-USERS-NL" }, { id: "gde", displayName: "PVM-UG-CORP-MEM-USERS-DE" }],
    deviceGroups: [{ id: "dnl", displayName: "INT-SG-D-NLD" }],
    usersByGroup: new Map([["gnl", [{ id: uNL, userPrincipalName: "nina@x" }, { id: uNL2, userPrincipalName: "noor@x", onPremisesSecurityIdentifier: "S-1-5-21-9-9-9-1105" }]], ["gde", [{ id: uDE, userPrincipalName: "dirk@x" }]]]),
    managed: [
      { id: "m1", deviceName: "KIOSK-01", userId: "svc", userPrincipalName: "svc-kiosk@x", azureADDeviceId: "a1", lastSyncDateTime: iso(now) },   // primary user in no country → ② Intune last logon (Nina)
      { id: "m2", deviceName: "LAB-02", userId: "", azureADDeviceId: "a2", lastSyncDateTime: iso(now) },                                      // no primary user → ③ Defender (Noor, hybrid SID)
      { id: "m3", deviceName: "NLD3", userId: uNL, userPrincipalName: "nina@x", azureADDeviceId: "a3", lastSyncDateTime: iso(now) },          // ① primary user Nina, Dirk logs on → check
      { id: "m4", deviceName: "SHARED-04", userId: "", azureADDeviceId: "a4", lastSyncDateTime: iso(now) },                                   // ② stale (40 d) loses to ③ Defender (Dirk)
      { id: "m5", deviceName: "XYZ-05", userId: "", azureADDeviceId: "a5", lastSyncDateTime: iso(now) },                                      // nothing → no country
      { id: "m6", deviceName: "AVDHOST", userId: "", azureADDeviceId: "a6", lastSyncDateTime: iso(now) },                                     // Defender on a VDI name → skipped
    ],
    entra: ["1", "2", "3", "4", "5", "6"].map((n) => ({ id: `e${n}`, deviceId: `a${n}`, displayName: `DEV-${n}` })).concat([{ id: "e9", deviceId: "a9", displayName: "PINNED-9" }]),
    deviceMembers: new Map([["dnl", new Set(["e3", "e9"])]]),
    waveChildren: new Map(), waveUsers: new Map(), owners: new Map(), primaryUsers: new Map(),
    intuneLogons: new Map([["m1", [{ userId: uNL, at: iso(now - 2 * day) }, { userId: "svc", at: iso(now) }]], ["m4", [{ userId: uNL, at: iso(now - 40 * day) }]]]),
    defLogons: [
      { AadDeviceId: "a2", DeviceName: "lab-02.x", AccountSid: "S-1-5-21-9-9-9-1105", Logons: 9, Last: iso(now - day) },
      { AadDeviceId: "a3", DeviceName: "nld3.x", AccountSid: sidOf(uDE), Logons: 30, Last: iso(now) },
      { AadDeviceId: "a4", DeviceName: "shared-04.x", AccountSid: sidOf(uDE), Logons: 4, Last: iso(now - 3 * day) },
      { AadDeviceId: "a4", DeviceName: "shared-04.x", AccountSid: sidOf(uNL), Logons: 2, Last: iso(now - day) },
      { AadDeviceId: "a6", DeviceName: "avdhost-vdi-01.x", AccountSid: sidOf(uNL), Logons: 50, Last: iso(now) },
    ],
    pinned: new Set(["e9"]), pinnedGroup: { id: "gpin", name: "INT-SG-D-MDE-Pinned" },
    logonRead: { intune: true, defender: true }, failed: [], readAt: now,
  };
  // the chain on its own first: a user's other devices (10683) off
  const cfg = MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["NL", "DE"] }], pilots: [], batched: [], useUsersDevices: false });
  const waves = new Map([["euro", { user: null, device: null, userName: "U", deviceName: "D" }]]);
  const m = MM.compute(cfg, input, waves, now);
  const NL = m.rows.find((r) => r.suffix === "NL"), DE = m.rows.find((r) => r.suffix === "DE");
  const dev = (row, name) => row.devices.find((d) => d.name === name);
  ok("② a kiosk whose primary user is in no country: its last logged-on user (Nina) places it in NL", dev(NL, "KIOSK-01") && dev(NL, "KIOSK-01").via === "lastlogon" && dev(NL, "KIOSK-01").upn === "nina@x" && dev(NL, "KIOSK-01").logon.primary === "svc-kiosk@x");
  ok("③ no primary user: Defender's hybrid SID (Noor) places it in NL", dev(NL, "LAB-02") && dev(NL, "LAB-02").via === "defender" && dev(NL, "LAB-02").logon.n === 9);
  ok("① the primary user wins: NLD3 stays in NL though Dirk (DE) logs on most — and it says check the primary user", dev(NL, "NLD3").via === "primary" && dev(NL, "NLD3").check && dev(NL, "NLD3").check.country === "Germany" && NL.problems.check === 1 && !dev(DE, "NLD3"));
  ok("② outside the window does not count; ③ the most logons decides — SHARED-04 goes to DE (Dirk 4× over Nina 2×)", dev(DE, "SHARED-04") && dev(DE, "SHARED-04").via === "defender" && !dev(NL, "SHARED-04"));
  ok("nothing ties XYZ-05 to anyone: in no country; a VDI host is never placed by a logon", m.noPrimary === 2 && !m.rows.some((r) => r.devices.some((d) => d.name === "XYZ-05" || d.name === "AVDHOST")));
  ok("the count per step", m.placedBy.primary === 1 && m.placedBy.lastlogon === 1 && m.placedBy.defender === 2, JSON.stringify(m.placedBy));
  ok("📌 a pinned device in the group stays wanted (no rule places it), and is not a removal", NL.pinnedIn.join() === "e9" && NL.want.has("e9") && !NL.remove.includes("e9") && NL.problems.pinned === 1);
  ok("the user who logs on is no longer 'left out' — Nina and Noor have a device through the logon steps", !m.leftOut.users.some((u) => u.upn === "noor@x"));
  const off = MM.compute(MM.normConfig(Object.assign({}, cfg, { useIntuneLogons: false, useDefenderLogons: false })), input, waves, now);
  ok("both logon steps off: as before — the kiosk and the lab are in no country", !off.rows.some((r) => r.devices.some((d) => d.name === "KIOSK-01" || d.name === "LAB-02")) && off.placedBy.lastlogon === 0 && off.placedBy.defender === 0);
  const intOnly = MM.compute(MM.normConfig(Object.assign({}, cfg, { useDefenderLogons: false })), input, waves, now);
  ok("Defender off: the kiosk is still placed by Intune, the lab is not", intOnly.rows.find((r) => r.suffix === "NL").devices.some((d) => d.name === "KIOSK-01") && !intOnly.rows.some((r) => r.devices.some((d) => d.name === "LAB-02")));
  const narrow = MM.compute(MM.normConfig(Object.assign({}, cfg, { logonDays: 1 })), input, waves, now);
  ok("a one-day window: the kiosk's two-day-old logon no longer counts", !narrow.rows.some((r) => r.devices.some((d) => d.name === "KIOSK-01" && d.via === "lastlogon")));

  // ------------------------------------------------------------- pins --
  const pp = MM.planPin(m, input, [{ userId: uNL, aad: "a5", name: "XYZ-05" }], cfg);
  ok("pin: into the pinned group first, then into INT-SG-D-NLD once that read back", pp.pins && pp.ops.map((o) => `${o.type}:${o.group.name}:${o.ids.join("+")}`).join() === "add:INT-SG-D-MDE-Pinned:e5,add:INT-SG-D-NLD:e5" && pp.ops[1].needsOk.join() === "0" && !pp.hasRemoval);
  const pp2 = MM.planPin(Object.assign({}, m, { pinnedGroup: null }), input, [{ userId: uNL, aad: "a5", name: "XYZ-05" }], cfg);
  ok("no pinned group yet: created first", pp2.ops[0].type === "create" && pp2.ops[0].name === "INT-SG-D-MDE-Pinned" && pp2.ops[1].group.ref === "INT-SG-D-MDE-Pinned");
  const pp3 = MM.planPin(m, input, [{ userId: uDE, aad: "a5", name: "XYZ-05" }, { userId: uNL, aad: "zz", name: "GHOST" }], cfg);
  ok("a country with no device group, and a device with no Entra object: skipped, said", !pp3.ops.length && pp3.skipped.some((x) => /INT-SG-D-DEU does not exist/.test(x)) && pp3.skipped.some((x) => /GHOST: no Entra object/.test(x)));
  const held = Object.assign({}, input, { held: new Set(["e5"]) });
  ok("a held device (⊘ / ↩) is not pinned", !MM.planPin(m, held, [{ userId: uNL, aad: "a5", name: "XYZ-05" }], cfg).ops.length);
  const up = MM.planUnpin(m, ["e9"]);
  ok("unpin: out of the pinned group by $batch, typed, with what happens next", up.ops.length === 1 && up.ops[0].type === "remove" && up.ops[0].group.id === "gpin" && up.ops[0].batch && up.hasRemoval && /apply removals/.test(up.warnings.join()));
  MM.patchInput(input, [{ type: "remove", group: { id: "gpin" }, ids: ["e9"], memberKind: "device" }]);
  const m2 = MM.compute(cfg, input, waves, now);
  ok("unpinned: PINNED-9 becomes a removal of INT-SG-D-NLD (taken out with “apply removals”)", !input.pinned.has("e9") && m2.rows.find((r) => r.suffix === "NL").remove.includes("e9"));

  // ---------------------------------------------- a user's devices (10683) --
  // Mihai: "user with multiple devices which have sign-in in last 30 days
  // should be included for that user and there should then be option to
  // unselect a certain device"
  const inU = Object.assign({}, input, {
    pinned: new Set(), skip: new Set(), skipGroup: { id: "gskip", name: "INT-SG-D-MDE-Skip" },
    entra: input.entra.map((e) => Object.assign({}, e, { approximateLastSignInDateTime: e.id === "e5" ? iso(now - 45 * day) : iso(now - day) })),
    deviceMembers: new Map([["dnl", new Set(["e3", "e9", "e4"])]]),
    entraUsers: new Map([["e3", new Set([uNL])], ["e4", new Set([uNL])], ["e5", new Set([uNL])], ["e2", new Set([uDE])]]),
  });
  const cfgU = MM.normConfig({ countryMap: [{ region: "Euro", suffixes: ["NL", "DE"] }], pilots: [], batched: [] });
  const mu = MM.compute(cfgU, inU, waves, now);
  const NLu = mu.rows.find((r) => r.suffix === "NL"), DEu = mu.rows.find((r) => r.suffix === "DE");
  ok("a user's devices: SHARED-04 (Nina's in Entra and by logon) is in NL too, beside DE where Dirk's logons put it", dev(NLu, "SHARED-04") && dev(NLu, "SHARED-04").via === "also" && dev(DEu, "SHARED-04") && NLu.want.has("e4") && DEu.want.has("e4"));
  ok("…its row names the sources, and a device in two countries this way is not 'to look at'", dev(NLu, "SHARED-04").also.join() === "entra,defender" && dev(NLu, "SHARED-04").shared && NLu.problems.multi === 0);
  ok("NLD3 (Nina's by primary user) is Dirk's device too by his Defender logons — in DE as well", dev(DEu, "NLD3") && dev(DEu, "NLD3").via === "also" && dev(DEu, "NLD3").also.join() === "defender");
  ok("LAB-02 is Dirk's in Entra (active yesterday): in DE as well as NL (Noor's logons)", dev(DEu, "LAB-02") && dev(NLu, "LAB-02"));
  ok("an Entra device inactive for 45 days is not added (XYZ-05)", !mu.rows.some((r) => r.devices.some((d) => d.name === "XYZ-05")));
  ok("the count of devices added as a user's device", mu.alsoCount >= 3, String(mu.alsoCount));
  const offU = MM.compute(MM.normConfig(Object.assign({}, cfgU, { useUsersDevices: false })), inU, waves, now);
  ok("switched off: no device is added as another user's", !offU.rows.some((r) => r.devices.some((d) => d.via === "also")));
  // ⊝ untick SHARED-04 for everyone, and NLD3 (its primary user keeps it in NL)
  const ps = MM.planSkip(mu, inU, ["e4", "e3"], [], cfgU);
  ok("untick: into the skip group first, then out of the country groups it is in — not where its primary user keeps it", ps.skips && ps.ops[0].type === "add" && ps.ops[0].group.id === "gskip" && ps.ops[0].ids.join() === "e4,e3"
    && ps.ops.filter((o) => o.type === "remove").every((o) => o.needsOk.join() === "0" && !o.ids.includes("e3")) && ps.hasRemoval && ps.warnings.some((x) => /primary user/.test(x)), JSON.stringify(ps.ops.map((o) => [o.type, o.group.name || o.group.id, o.ids])));
  inU.skip.add("e4"); inU.skip.add("e3"); inU.deviceMembers.get("dnl").delete("e4");   // the run landed
  const ms = MM.compute(cfgU, inU, waves, now);
  const NLs = ms.rows.find((r) => r.suffix === "NL"), DEs = ms.rows.find((r) => r.suffix === "DE");
  ok("unticked: SHARED-04 is wanted nowhere (also not by Dirk's Defender step); NLD3 stays in NL by its primary user, not in DE", !NLs.add.includes("e4") && !NLs.want.has("e4") && !DEs.want.has("e4") && dev(DEs, "SHARED-04").skipped && NLs.want.has("e3") && !DEs.want.has("e3") && NLs.problems.skipped >= 1);
  const pi = MM.planSkip(ms, inU, [], ["e4"], cfgU);
  ok("tick again: out of the skip group, then back where a rule wants it", pi.ops[0].type === "remove" && pi.ops[0].group.id === "gskip" && pi.ops.filter((o) => o.type === "add").every((o) => o.needsOk.join() === "0") && pi.ops.some((o) => o.type === "add" && o.ids.includes("e4")));
  MM.patchInput(inU, [{ type: "remove", group: { id: "gskip" }, ids: ["e4"], memberKind: "device" }]);
  ok("patchInput moves the skip set", !inU.skip.has("e4") && inU.skip.has("e3"));

  console.log(`T28 wave coverage: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((e) => { console.error(e); process.exitCode = 1; });

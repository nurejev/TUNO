// T28 — the wave spine (build 10726, Phase 3.1 of the 15 Oct rebuild plan).
// js/t28spine.js alone: five stages lit from the input, a stage that was
// not read is unknown (never ok), the first stage with something to do is
// current and gives the next step, a finished wave says so. Then in the
// demo: the Waves area opens on the spine, the chips are the one region,
// Open stage lands on today's pane.
const fs = require("fs"), path = require("path"), vm = require("vm");
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
  for (;;) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; if (Date.now() > end) { console.error("timeout: " + (label || "")); return false; } await sleep(25); }
}

function model() {
  const ctx = vm.createContext({ Object, Array, String, Number, JSON });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/t28spine.js"), "utf8") + ";globalThis.S = T28Spine;", ctx);
  const S = ctx.S;
  const full = () => ({ region: "Euro", waves: { user: { exists: true }, device: { exists: true } }, tests: { user: { exists: true, nested: true }, device: { exists: true, nested: true } }, project: { holdBack: true, state: true },
    rows: [{ country: "Netherlands", ugNested: true, dgNested: true, uInSync: true, inSync: true, unread: "", users: 9, devices: 13 }, { country: "Germany", ugNested: true, dgNested: true, uInSync: true, inSync: true, unread: "", users: 6, devices: 7 }], membersRead: true,
    assign: { include: 0, excludeOld: 0, filter: 0 }, landing: { read: true, devices: 12, ok: 12, problems: 0 }, held: { users: 1, devices: 0, pinned: 0, skipped: 0 } });
  const st = (r) => Object.fromEntries(r.stages.map((s) => [s.id, s.state]));

  const r0 = S.stages({ region: "Euro" });
  ok("nothing read: every stage unknown, nothing claimed done, no next step invented", Object.values(st(r0)).every((v) => v === "unknown" || v === "wait") && !r0.done && r0.next === null && r0.current === null);
  const r1 = S.stages(full());
  ok("everything in place: five ok, done, the next step says so", Object.values(st(r1)).every((v) => v === "ok") && r1.done && /Euro is complete/.test(r1.next.text) && r1.next.pane === null && /1 member held back/.test(r1.stages[4].detail));
  const i2 = full(); i2.waves.device.exists = false; i2.project.holdBack = false;
  const r2 = S.stages(i2);
  ok("set up: a missing wave group and the hold-back pair → stage 1 todo and current, the next step names them and opens 🌊", st(r2).setup === "todo" && r2.current === "setup" && /device wave, hold-back pair to create/.test(r2.stages[0].detail) && r2.next.pane === "waves" && /Create the 2 groups for Euro/.test(r2.next.text));
  const i3 = full(); i3.tests.user.nested = false;
  const r3 = S.stages(i3);
  ok("a test group not nested keeps stage 1 todo, pointing at ⚡ ⓪", st(r3).setup === "todo" && /1 test group to create or nest/.test(r3.stages[0].detail) && /⚡ ⓪/.test(r3.next.text));
  const i4 = full(); i4.rows[1].ugNested = false; i4.rows[1].dgNested = false;
  const r4 = S.stages(i4);
  ok("members: a country not nested → stage 2 todo and current with the count, the next step names it and opens 👥", st(r4).setup === "ok" && st(r4).members === "todo" && r4.current === "members" && /1 of 2 countries nested/.test(r4.stages[1].detail) && /Fill and nest Germany/.test(r4.next.text) && r4.next.pane === "members");
  const i5 = full(); i5.rows[0].unread = "429";
  const r5 = S.stages(i5);
  ok("members: a country that did not read is unknown, never ok; the next step is to read again", st(r5).members === "unknown" && /not read/.test(r5.stages[1].detail) && /Read the members again: Netherlands/.test(r5.next.text));
  const i6 = full(); i6.rows[0].batched = true; i6.rows[0].ugNested = false;
  const r6 = S.stages(i6);
  ok("a pilot in batches keeps stage 2 todo with the batch as the next step", st(r6).members === "todo" && /in batches/.test(r6.stages[1].detail) && /next batch of Netherlands/.test(r6.next.text));
  const i7 = full(); i7.assign = { include: 25, excludeOld: 0, filter: 0 };
  const r7 = S.stages(i7);
  ok("assign: new policies without the wave → stage 3 todo (members ok), the next step is ⚡ ① with the count; verify waits", st(r7).assign === "todo" && /25 new policies still without the wave/.test(r7.stages[2].detail) && /Include the Euro waves in the 25 new policies/.test(r7.next.text) && r7.next.pane === "waves" && st(r7).verify === "ok");
  const i8 = full(); i8.assign = { include: 3, excludeOld: 0, filter: 0 }; i8.rows[1].ugNested = false;
  const r8 = S.stages(i8);
  ok("assign waits while members are still open — members is current, not assign", st(r8).assign === "wait" && r8.current === "members");
  const i9 = full(); i9.assign = { include: 0, excludeOld: 4, filter: 2 };
  const r9 = S.stages(i9);
  ok("old policies still reaching the wave and the filter missing are both said; ⚡ ③ comes first", /4 old policies still reaching it/.test(r9.stages[2].detail) && /filter on 2 assignments/.test(r9.stages[2].detail) && /⚡ ③/.test(r9.next.text));
  const i10 = full(); i10.landing = null;
  const r10 = S.stages(i10);
  ok("verify not read while assign is ok → todo with 'read what the devices report' (📡)", st(r10).verify === "todo" && r10.next.pane === "landing" && /Read what the Euro devices report/.test(r10.next.text));
  const i11 = full(); i11.landing = { read: true, devices: 12, ok: 9, problems: 3 };
  const r11 = S.stages(i11);
  ok("verify: devices with problems → todo with the count", st(r11).verify === "todo" && /3 devices with errors or conflicts of 12/.test(r11.stages[3].detail) && /Look at the 3 devices/.test(r11.next.text));
  const i12 = full(); i12.landing = { read: true, devices: 0, ok: 0, problems: 0 };
  const r12 = S.stages(i12);
  ok("verify: nothing reported yet → wait, not a failure", st(r12).verify === "wait" && !r12.done);
  const i13 = full(); i13.held = null;
  ok("exceptions unread → unknown; a stage never guesses", st(S.stages(i13)).exceptions === "unknown");
  const i15 = full(); i15.rows.push({ country: "Luxembourg", ugNested: false, dgNested: null, uInSync: false, inSync: false, unread: "", users: 0, devices: 0 }, { country: "NL Breda", ugNested: false, dgNested: null, uInSync: false, inSync: false, unread: "", users: 1, devices: 1, migrated: true, parentCountry: "Netherlands" }, { country: "France", ugNested: true, dgNested: null, uInSync: true, inSync: false, unread: "", users: 1, devices: 0 });
  const r15 = S.stages(i15);
  ok("a country with nobody to place, a pilot migrated into its country and a country with users but no devices are all in place (the acceptance walk, 10729)", st(r15).members === "ok" && r15.stages[1].lines.some((l) => l.ok && /Luxembourg.*nobody to place/.test(l.text)) && r15.stages[1].lines.some((l) => l.ok && /NL Breda.*in the wave through Netherlands/.test(l.text)) && r15.stages[1].lines.some((l) => l.ok && /^France — 1 user, 0 devices$/.test(l.text)), JSON.stringify(r15.stages[1].lines));
  const i16 = full(); i16.rows[0].dynamicNested = true;
  const r16 = S.stages(i16);
  ok("a country whose dynamic group still carries the wave is open: ⇄ swap in Sync country groups", st(r16).members === "todo" && /⇄ swap \(Sync country groups\)/.test(r16.stages[1].lines[0].text));
  ok("the five stages carry the pane each opens (A: today's panes)", S.STAGES.map((s) => s.pane).join() === "waves,members,waves,landing,revert");
  // 3.2: the counts the panes compute, one line each
  const r14 = S.stages(Object.assign(full(), { rows: [{ country: "Netherlands", ugNested: true, dgNested: true, uInSync: true, inSync: true, unread: "", users: 9, devices: 13 }, { country: "Germany", ugNested: false, dgNested: true, uInSync: true, inSync: true, unread: "", users: 6, devices: 7 }], assign: { include: 25, excludeOld: 0, filter: 2 }, landing: { read: true, devices: 12, ok: 9, problems: 3 }, held: { users: 1, devices: 2, pinned: 1, skipped: 3 } }));
  const L = (id) => r14.stages.find((s) => s.id === id).lines.map((l) => `${l.ok ? "✓" : "·"} ${l.text}`);
  ok("set up lines: one per group, with what is left to do", L("setup").length === 5 && L("setup")[0] === "✓ user wave" && L("setup").some((l) => /hold-back pair/.test(l)) && L("setup").some((l) => /user test members/.test(l)));
  ok("members lines: one per country with its users and devices and why it is open", L("members")[0] === "✓ Netherlands — 9 users, 13 devices" && L("members")[1] === "· Germany — 6 users, 7 devices · user group not nested");
  ok("assign lines: the three ⚡ steps with their counts", L("assign")[0] === "· ① include the wave in the new policies — 25 policies to plan" && L("assign")[1] === "✓ ③ exclude the wave from the old policies — in place" && L("assign")[2] === "· ④ W365/AVD filter on the wave assignments — 2 assignments to plan");
  ok("verify and exceptions lines carry the counts", L("verify")[0] === "· 12 devices reporting · 9 clean · 3 with a problem" && L("exceptions")[0] === "✓ 1 user, 2 devices held back" && L("exceptions")[1] === "✓ 1 device pinned to a country" && L("exceptions")[2] === "✓ 3 devices out of scope (skipped)");
  // 3.3: the five plain words
  ok("the five plain words, each with what it means", S.WORDS.map((w) => w.word).join() === "wave,country group,test members,hold-back,out of scope" && S.WORDS.every((w) => w.means.length > 20));
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
  Object.defineProperty(w, "localStorage", { value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, configurable: true });
  w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
  w.msal = undefined;
  w.fetch = () => Promise.reject(new Error("no network in tests"));
  const fidb = require("fake-indexeddb"); w.indexedDB = fidb.indexedDB; w.IDBKeyRange = fidb.IDBKeyRange;
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const bridge = ";Object.assign(window,{Graph,PolicyCache,MdeRolloutV2Tool,TUNO_DEMO_GRAPH,T28Spine});";
  const realErr = console.error, realLog = console.log, realWarn = console.warn;
  console.error = () => {}; console.log = () => {}; console.warn = () => {};
  let err = null;
  try { w.eval(src + "\n" + bridge); } catch (e) { err = e; }
  console.error = realErr; console.log = realLog; console.warn = realWarn;
  if (err) throw err;
  w.Graph.ensureScopes = async () => true;
  w.Graph.silentScopes = async () => true;
  w.TUNO_DEMO_GRAPH.LATENCY_MS = 0;
  return { w };
}

async function screen() {
  const { w } = boot();
  const D = w.document, $ = (id) => D.getElementById(id);
  const T = w.MdeRolloutV2Tool, st = () => T._state();
  $("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await until(() => w.PolicyCache.get(), 30000, "sign-in read");
  $("toolMdeRollout").click();
  await sleep(150);
  await until(() => { const s = st(); return s.model && s.project.attempted.size === 5 && !s.project.starting && !s.project.task && !s.project.timer && !s.running && !s.enriching && s.mem.model && s.cs.extra && s.tm.all; }, 60000, "project read");
  await until(() => { const s = st(); return !s.running && !s.busy && !s.enriching && !s.project.task && !s.project.timer && !s.reps.busy && !s.mem.loading && !s.ex.loading && !s.ld.busy; }, 30000, "idle");
  const rail = D.querySelector('.mr-navigation [data-mrpane="wavehome"]');
  ok("the rail still names the area; its home is the spine", !!rail && rail.dataset.mrhome === "spine");
  rail.click(); await sleep(100);
  ok("the Waves area opens on the spine: the first tab, the wave's chips, five stages, a next step", st().pane === "spine" && D.querySelector(".t28-subnav button").dataset.mrpane === "spine" && D.querySelectorAll("[data-mrspine-region]").length >= 2 && D.querySelectorAll(".t28-stage").length === 5 && !!D.querySelector(".t28-next"), $("mvBody").textContent.slice(0, 200));
  const sp = T._spine();
  ok("in the demo the Euro wave has its groups but members and policies still to do — stage 2 or 3 is current, nothing is claimed done", !sp.done && ["members", "assign", "setup"].includes(sp.current) && sp.stages.every((s) => s.detail), JSON.stringify(sp.stages.map((s) => [s.id, s.state, s.detail])));
  const detailOf = (id) => D.querySelector(`.t28-stage.${id}`);
  ok("the screen shows each stage's state as a glyph: ✓ for ok, → for the current one", [...D.querySelectorAll(".t28-stage")].length === 5 && (!sp.stages.some((s) => s.state === "ok") || !!D.querySelector(".t28-stage-dot.ok")) && !!D.querySelector(".t28-stage.current .t28-stage-dot.now"));
  // a chip is the one region
  const chips = [...D.querySelectorAll("[data-mrspine-region]")];
  const other = chips.find((c) => !c.classList.contains("active"));
  other.click(); await sleep(100);
  ok("a wave chip picks the one region: the spine, 👥, 📡 and the dashboard all follow", T._region() === other.dataset.mrspineRegion && st().mem.region === other.dataset.mrspineRegion && /wave$/.test(D.querySelector(".t28-spine h3").textContent.trim()) && D.querySelector(".t28-spine h3").textContent.includes(other.dataset.mrspineRegion));
  // Open stage lands on today's pane
  const openNext = D.querySelector(".t28-next [data-mrstage]") || D.querySelector(".t28-stage [data-mrstage]");
  const target = openNext.dataset.mrstage;
  openNext.click(); await sleep(100);
  ok("Open stage opens today's pane for that stage", st().pane === target && ["waves", "members", "landing", "revert"].includes(target));
  D.querySelector('.mr-navigation [data-mrpane="wavehome"]').click(); await sleep(50);
  ok("back on the rail: the spine again, the region kept", st().pane === "spine" && T._region() === other.dataset.mrspineRegion, JSON.stringify([st().pane, T._region(), other.dataset.mrspineRegion]));
  // 3.2 on screen: the current stage shows its lines, another stage unfolds on +
  const cur = D.querySelector(".t28-stage.current");
  ok("the current stage shows its detail lines; the others fold until +", !!cur && !!cur.querySelector(".t28-stage-lines") && [...D.querySelectorAll(".t28-stage:not(.current)")].every((e) => !e.querySelector(".t28-stage-lines")));
  const plus = [...D.querySelectorAll("[data-mrstagelines]")].find((b) => b.textContent === "+");
  if (plus) { const id = plus.dataset.mrstagelines; plus.click(); await sleep(50); ok("+ unfolds a stage's lines", !!D.querySelector(`[data-mrstagelines="${id}"]`).closest(".t28-stage").querySelector(".t28-stage-lines") && D.querySelector(`[data-mrstagelines="${id}"]`).textContent === "−", id); }
  // 3.3 on screen: the tabs and Help speak the five words
  ok("the Waves tabs speak the five words", [...D.querySelectorAll(".t28-subnav button")].map((b) => b.textContent.trim()).join("|") === "Wave|Countries|Country groups|Sync country groups|Wave groups & test members|Verify");
  T._pane("how"); await sleep(50);
  ok("Help opens with the five words", /Five words\./.test($("mvBody").textContent) && /country group — the static group per country/.test($("mvBody").textContent) && /out of scope — a device or policy the rollout never touches/.test($("mvBody").textContent));
}

(async () => {
  model();
  await screen();
  console.log(`T28 wave spine: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

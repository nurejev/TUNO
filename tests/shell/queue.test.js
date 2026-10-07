// ======================================================================
// Parity slice 11 (build 10672): Waiting for production — ENCA's 32318
// on TUNO's queue (Help, #helpPromote).
//
//   1. Every item's risk is a level; item 222's sentence is in its why now,
//      and a risk that is not a level renders "unrated", never "low".
//   2. Newest last by default: each row — a group or a single item — sits at
//      its newest item, so the list ends with the latest work; By number
//      gives the 10602 order back, moved in place and remembered.
//   3. NEW since this browser last saw the list: on the items, counted on
//      their group row and in the toolbar; mark all seen clears them; a
//      first visit marks only what was built in the last three days.
//
// Run with `npm test`, or alone:  node tests/shell/queue.test.js
// ======================================================================
const { suite } = require("../platformbaseline/harness");
const { ok, head, run, ROOT, fs, path, boot } = suite("queue");

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
const appJs = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
// Help renders the queue when it opens; the demo is a sign-in like any other.
const openQueue = async (opts) => {
  const w = boot(opts);
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.document.getElementById("demoLink").dispatchEvent(new w.Event("click", { bubbles: true }));
  await tick(30);
  if (opts && opts.before) opts.before(w);
  w.document.getElementById("toolHelp").click();
  await tick(10);
  return w;
};
const body = (w) => [...w.document.querySelectorAll("#helpPromote .pq-table tbody tr")];
// the block a row belongs to, in the order the rows stand
const blocks = (w) => { const out = []; for (const tr of body(w)) { const k = tr.dataset.pqblk; if (out[out.length - 1] !== k) out.push(k); } return out; };

run(async () => {

// =====================================================================
head("Every risk is a level; anything else says so");
{
  const w = boot();
  const P = w.PROMOTE;
  ok("every item's risk is high, medium or low", P.items.every((i) => ["high", "medium", "low"].includes(i.risk)), P.items.filter((i) => !["high", "medium", "low"].includes(i.risk)).map((i) => i.n).join());
  const i222 = P.items.find((i) => i.n === 222);
  ok("item 222 is medium, its sentence kept in why", !i222 || (i222.risk === "medium" && /V2 writes to the same tenant/.test(i222.why) && /no live-tenant acceptance test/.test(i222.why)));
  ok("its what is a what (it was a detail nothing rendered), and promote.js travelled with it", !i222 || (/Guided overview/.test(i222.what || "") && !("detail" in i222) && i222.files.indexOf("js/promote.js") >= 0));
  ok("the renderer says unrated rather than low for anything else", /label: "unrated"/.test(appJs) && /RISK\[it\.risk\] \|\| UNRATED/.test(appJs) && !/RISK\[it\.risk\] \|\| RISK\.low/.test(appJs));
  const w2 = await openQueue({ before: (x) => x.PROMOTE.items.push({ n: 9999, title: "A test item", tools: ["T99 Nothing"], builds: [10100], risk: "it might break", why: "testing", what: "nothing", test: ["a step long enough to count as one"], files: ["js/promote.js"] }) });
  const row = body(w2).find((tr) => tr.querySelector("[data-pqpick='9999']"));
  ok("an item whose risk is a sentence renders unrated", row && row.querySelectorAll("td")[3].querySelector(".tag").textContent === "unrated", row && row.querySelectorAll("td")[3].textContent);
}

// =====================================================================
head("Newest last by default; By number gives the old order back");
{
  const w = await openQueue();
  const P = w.PROMOTE, D = w.document;
  const items = P.items.slice().sort((a, b) => a.n - b.n);
  const rows = P.queueRows(items);
  const keyOf = (r) => (r.kind === "group" ? r.group.key : `i:${r.item.n}`);
  const newest = (r) => (r.kind === "group" ? Math.max(...r.group.ns) : r.item.n);
  const expectNewest = rows.slice().sort((a, b) => newest(a) - newest(b)).map(keyOf);
  ok("the list ends with the latest work: each row at its newest item", blocks(w).join() === expectNewest.join(), blocks(w).slice(-4).join());
  ok("the last row holds the highest number", (() => { const last = body(w)[body(w).length - 1]; const max = items[items.length - 1].n; return [...last.querySelectorAll("[data-pqpick]")].some((cb) => +cb.dataset.pqpick === max) || last.dataset.pqblk === keyOf(rows.find((r) => r.kind === "group" && r.group.ns.indexOf(max) >= 0) || {}); })());
  ok("Newest last is the active order", D.querySelector('[data-pqorder="newest"]').classList.contains("active") && !D.querySelector('[data-pqorder="number"]').classList.contains("active"));
  const tickedBefore = body(w).find((tr) => tr.querySelector("[data-pqpick]"));
  tickedBefore.querySelector("[data-pqpick]").checked = true;
  D.querySelector('[data-pqorder="number"]').click();
  ok("By number puts each row at its first item (10602), moved in place", blocks(w).join() === rows.map(keyOf).join());
  ok("a tick survives the move — rows are moved, not redrawn", tickedBefore.isConnected && tickedBefore.querySelector("[data-pqpick]").checked);
  ok("the choice is remembered in this browser", w.localStorage.getItem("TUNO_PQ_ORDER") === "number");
  const w2 = await openQueue({ storage: { TUNO_PQ_ORDER: "number" } });
  ok("and the next visit opens by number", blocks(w2).join() === rows.map(keyOf).join() && w2.document.querySelector('[data-pqorder="number"]').classList.contains("active"));
  ok("a group's members stay together under it, in number order", (() => {
    const g = rows.find((r) => r.kind === "group"); if (!g) return true;
    const trs = body(w2).filter((tr) => tr.dataset.pqblk === g.group.key);
    return trs[0].classList.contains("pq-group") && trs.slice(1).map((tr) => +tr.querySelector("[data-pqpick]").dataset.pqpick).join() === g.group.ns.join();
  })());
}

// =====================================================================
head("NEW since this browser last saw the list");
{
  const probe = boot();
  const items = probe.PROMOTE.items.slice().sort((a, b) => a.n - b.n);
  const maxN = items[items.length - 1].n;
  const w = await openQueue({ storage: { TUNO_PQ_SEEN: String(maxN - 2) } });
  const D = w.document;
  const tagged = body(w).filter((tr) => !tr.classList.contains("pq-group") && tr.querySelector(".pq-newtag")).map((tr) => +tr.querySelector("[data-pqpick]").dataset.pqpick).sort((a, b) => a - b);
  ok("the items above the last number seen carry NEW", tagged.join() === items.filter((i) => i.n > maxN - 2).map((i) => i.n).join(), tagged.join());
  ok("their rows are marked", body(w).filter((tr) => tr.classList.contains("pq-new") && !tr.classList.contains("pq-group")).length === tagged.length);
  ok("the toolbar counts them and offers mark all seen", new RegExp(`^${tagged.length} new since your last visit`).test(D.getElementById("pqNewNote").textContent) && D.getElementById("pqSeenAll"));
  const groupsWithNew = body(w).filter((tr) => tr.classList.contains("pq-group") && tr.querySelector(".pq-newtag"));
  ok("a group row says how many of its items are new", groupsWithNew.every((tr) => /^\d+ NEW$/.test(tr.querySelector(".pq-newtag").textContent)));
  D.getElementById("pqSeenAll").click();
  ok("mark all seen clears the tags and the note", !D.querySelector("#helpPromote .pq-newtag") && !D.querySelector("#helpPromote tr.pq-new") && !D.getElementById("pqNewNote"));
  ok("and remembers the highest number", w.localStorage.getItem("TUNO_PQ_SEEN") === String(maxN));
  const w2 = await openQueue({ storage: { TUNO_PQ_SEEN: String(maxN) } });
  ok("seen everything: nothing is NEW", !w2.document.querySelector("#helpPromote .pq-newtag") && !w2.document.getElementById("pqNewNote"));

  // first visit: only what was built in the last three days
  const w3 = await openQueue();
  const cut = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const recent = new Set(w3.CHANGELOG.filter((r) => r.date >= cut).map((r) => r.build));
  const want = items.filter((i) => (i.builds || []).some((b) => recent.has(b))).map((i) => i.n);
  const got = body(w3).filter((tr) => !tr.classList.contains("pq-group") && tr.querySelector(".pq-newtag")).map((tr) => +tr.querySelector("[data-pqpick]").dataset.pqpick).sort((a, b) => a - b);
  ok("a first visit marks only items built in the last three days", got.join() === want.join() && got.length < items.length, `${got.length} of ${items.length}`);
  ok("seen is recorded when the list is on screen, not when Help opens", /new IntersectionObserver/.test(appJs) && /TUNO_PQ_SEEN/.test(appJs));
}

// =====================================================================
head("The stylesheet and the roadmap");
{
  const css = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8");
  ok("a NEW row is marked down its edge in lemon (ENCA 32318)", /\.cg-table\.pq-table tr\.pq-new>td:first-child\{box-shadow:inset 3px 0 0 var\(--lemon\)\}/.test(css) && /\.pq-order\{display:inline-flex/.test(css));
  const w = boot();
  const r41 = [...w.document.querySelectorAll(".rm-card")].find((c) => [...c.querySelectorAll("h4 .rm-ref")].some((r) => r.textContent === "R41"));
  const upTo = +((/slices 1–(\d+)(?:, [0-9–, ]+)? · beta \d+/.exec(r41.querySelector("h4").textContent) || [])[1] || 0);
  ok("R41 counts slice 11", upTo >= 11 && /Slice 11, Waiting for production \(beta 10672\)/.test(r41.textContent), String(upTo));
}

});

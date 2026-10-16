// T28 — RUN BUNDLES IN THE BROWSER'S DATABASE (build 10716, Phase 1.4 of the
// 15 Oct rebuild plan, state home 3: "run bundles → IndexedDB").
//
// Every write T28 makes lands in 📜 as a run: what was planned, what was
// done and verified, the backup taken before it, the ledger lines — and
// from the done steps the exact undo. Until now that run lived in a
// JavaScript array and died with the tab: a refresh, a crash, a second
// browser, and the undo was gone (only the 100 one-line summaries in the
// project history survived). The runs now go to IndexedDB at the moment
// they are logged, keyed by run id and tagged with the tenant; the tool
// loads this tenant's runs when it opens, so 📜 shows them and ↶ Undo
// still plans from the saved steps. The array stays as the cache every
// pane reads.
//
// Where IndexedDB is not available (a private window on some browsers, the
// headless suite without a fake) the same shape is kept in localStorage,
// capped, and said as such.
//
// DOM-free. Browser globals: indexedDB (optional), localStorage.
// Tests: tests/mderollout/runs.test.js (with fake-indexeddb).
const T28Runs = (() => {
  "use strict";
  const DB = "tuno-t28", STORE = "runs", VERSION = 1, KEEP = 200;
  const lc = (s) => String(s || "").toLowerCase();
  let dbPromise = null;
  const idb = () => (typeof indexedDB !== "undefined" && indexedDB) || null;
  const fallbackKey = (tenant) => `tuno.t28.runs.${lc(tenant || "default")}`;

  function open() {
    if (dbPromise) return dbPromise;
    const api = idb();
    if (!api) return Promise.resolve(null);
    dbPromise = new Promise((resolve) => {
      let req;
      try { req = api.open(DB, VERSION); } catch { resolve(null); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: "id" });
          st.createIndex("tenant", "tenant", { unique: false });
          st.createIndex("tenantAt", ["tenant", "at"], { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }
  const tx = (db, mode, fn) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
    let out;
    try { out = fn(st); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error || new Error("IndexedDB transaction failed"));
    t.onabort = () => reject(t.error || new Error("IndexedDB transaction aborted"));
  });

  // the run as it is stored: plain JSON (functions and cycles dropped), id
  // and tenant on it, the shape every pane knows
  function record(tenant, run) {
    const id = run.id || `${lc(tenant)}:${run.at || Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const r = JSON.parse(JSON.stringify(Object.assign({}, run, { id, tenant: lc(tenant), v: 1 })));
    return r;
  }

  // ------------------------------------------------------------- save --
  // Returns { id, where: "indexeddb" | "localstorage" }.
  async function save(tenant, run) {
    const r = record(tenant, run);
    const db = await open();
    if (db) {
      await tx(db, "readwrite", (st) => st.put(r));
      return { id: r.id, where: "indexeddb" };
    }
    const k = fallbackKey(tenant);
    let list = [];
    try { list = JSON.parse(window.localStorage.getItem(k) || "[]") || []; } catch { list = []; }
    list = list.filter((x) => x.id !== r.id).concat([r]).slice(-50);
    window.localStorage.setItem(k, JSON.stringify(list));
    return { id: r.id, where: "localstorage" };
  }

  // ------------------------------------------------------------- list --
  // This tenant's runs, oldest first, the newest KEEP of them.
  async function list(tenant) {
    const db = await open();
    let rows = [];
    if (db) {
      rows = await tx(db, "readonly", (st) => st.index("tenant").getAll(lc(tenant)));
      rows = rows || [];
    } else {
      try { rows = JSON.parse(window.localStorage.getItem(fallbackKey(tenant)) || "[]") || []; } catch { rows = []; }
    }
    rows.sort((a, b) => (a.at || 0) - (b.at || 0));
    return rows.slice(-KEEP);
  }

  async function remove(id) {
    const db = await open();
    if (db) { await tx(db, "readwrite", (st) => st.delete(id)); return true; }
    return false;
  }
  // forget this tenant's runs (the lab's teardown; never called by the tool itself)
  async function clear(tenant) {
    const db = await open();
    if (db) {
      const rows = (await tx(db, "readonly", (st) => st.index("tenant").getAll(lc(tenant)))) || [];
      await tx(db, "readwrite", (st) => { for (const r of rows) st.delete(r.id); });
      return rows.length;
    }
    try { window.localStorage.removeItem(fallbackKey(tenant)); } catch { /* private window */ }
    return 0;
  }
  const where = () => (idb() ? "indexeddb" : "localstorage");

  return { DB, STORE, KEEP, save, list, remove, clear, where, record, _reset: () => { dbPromise = null; } };
})();

/* ======================================================================
   Workspaces: session-aware navigation around TUNO's existing tools —
   ENCA's js/workspaces.js (25401 … 32430, as at ENCA beta 32433), ported
   at TUNO build 10668 (TUNO–ENCA parity slice 7; mockup round 1, D1 A,
   D2 B, D4 A).

   A presentation layer, as in ENCA: app.js still renders the sidebar and the
   strip of open tools, and every rail, library and header click ends in the
   hidden sidebar's own button (`#side-<toolId>`), so the tile stays the
   router and the tools, their data and their confirmation steps are
   untouched. What this adds: the branded header (the mark on a medallion
   over the rail, the context line, All tools, the account button with the
   tenant's name — D2 B), the 88 px rail in work order (D1 A; a bottom bar on
   a phone), the strip of open tools restyled with the tools' own icons, and
   the tool library behind All tools. Since 10669 (slice 8) Home is ENCA's
   too: the tenant and workspace over a heading, Recent tools, and the
   library grouped as the tiles were — the tile grid stays in the page as
   the registry, hidden.

   Since 10673 (slice 12) the two workspaces are ENCA's too (32407, 32430):
   01 Intune and 02 Projects on one shell — one header, one rail, one strip
   of open tools; what changes on a switch is which tools the rail and the
   library offer, Home, and the header colour (round 1's D5 A: 02 is a
   second green with a lemon rule). A tool open on the other side stays open,
   its tab only hidden, and comes back with the switch.

   TUNO DIFFERENCES, all on purpose:
   * A side is drawn only with a tool of its own in the page: 02's are the
     tiles marked data-ws="projects" (ENCA lists PIM_ONLY), and carry-overs
     alone never make a side. With one side there is no chip, no rail switch,
     no ⌘⇧2, no palette entry, and ?ws=projects lands on 01 — production,
     where no project tool ever goes, shows the one workspace.
   * 02 is temporary tools for customer projects (ENCA's 02 is PIM-buddy):
     its own tools first, then the 01 tools it carries over (ENCA's lens
     tools; the same screens), then the app's own pages. Its menu row says
     what it holds and that it is beta only (round 1's switcher; ENCA: the
     open count alone). Since 10674 (slice 13) 🚀 MDE rollout is its tool,
     with four carry-overs; a project tool's card names its customer and the
     date it ends (round 1's mockup; ENCA's temporary tools name the date in
     their text), a carry-over's says it is also in 01.
   * Home's library starts open only where nothing sits above it. Since
     10671 the Intune overview does (js/home-overview.js, round 2's D6 A),
     so 01's starts closed, as ENCA's; 02 has none and starts open, as
     ENCA's 02. Recent tools say the T-number and the time a tool was opened
     (round 1's mockup; ENCA: "Opened this session").
   * The library's group headings — on Home and in the launcher — keep their
     section's icon (data-icon, 10666), and the cards say what each tool does
     in TUNO's words (round 1). A card carries its tile's tags — writes to
     the tenant, NEW, BETA, UPDATED, temporary — as chips (ENCA's cards drop
     them; ENCA's one chip is its lens), and the launcher's search finds
     them: "writes" lists the tools that change the tenant.
   * The environment says "Your tenant · live reads" signed in (ENCA: "Tenant
     · policy snapshot" — TUNO reads Graph live and keeps no snapshot), and
     ENCA's Current snapshot panel, hidden on its Home since 25422, is not
     ported.
   * The tenant comes from window.TunoTenant and body.demo-mode (ENCA reads
     its Workspace.context module); ENCA's ListDetail and #workspaceCounts
     have no TUNO counterpart.
   * The connected-app block in the account menu waits for slice 16, where
     Graph.connectionInfo() arrives.
   * "Close all tools" in the account menu (ENCA: "Close all workspaces").
   Rewritten without optional chaining (TUNO's house rule).
   ====================================================================== */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = key => typeof FlatIcons !== 'undefined' ? FlatIcons.tool(key) : '';
  // What each tool does, in one line (mockup round 1). The tile keeps its
  // long description; the library card says it short.
  const blurbs = {
    toolAppLocker: 'Scan devices, build the policy, see what breaks before you enforce.',
    toolDefender: 'Devices where Defender is off or out of date.',
    toolEndpointSec: 'Whether firewall and ASR rules really reach the Windows fleet.',
    toolLaps: 'Which devices back up a local admin password, and where.',
    toolPosture: 'Enforced, partly enforced or missing, per security area.',
    toolSecureScore: 'The tenant’s Secure Score and what moves it.',
    toolMdeRollout: 'Replace old Defender and endpoint security policies, wave by wave.',
    toolGroupUse: 'Everything Intune sends to a group’s members.',
    toolDevice: 'Why a device gets each policy, app and script.',
    toolWhatIf: 'What a membership change would add or remove.',
    toolHealth: 'Assignments that exist but reach nobody.',
    toolAssignEdit: 'Add or remove a group across many policies at once.',
    toolFilters: 'Filters, their rules and what uses them.',
    toolBackup: 'Back up Intune configuration and put it back.',
    toolDocs: 'The tenant’s configuration as a document.',
    toolSetSearch: 'Find a setting across every policy.',
    toolConflict: 'Settings two policies set differently.',
    toolOverview: 'Every policy as a card, thirteen surfaces in one read.',
    toolMacBaseline: 'macOS against the CloudFellows baseline.',
    toolWinBaseline: 'Windows against the CloudFellows baseline.',
    toolAudit: 'What changed in Intune, and who changed it.',
    toolCompliance: 'Compliance per device and per policy.',
    toolDeviceCleanup: 'Stale Entra devices, removed with a ledger.',
    toolCompEv: 'The technical evidence an auditor asks for.',
    toolRoles: 'Roles, assignments and scope tags, resolved to names.',
    toolMaa: 'Which changes need a second admin to approve.',
    toolGroupMigrate: 'Move policies from one group to another, safely.',
    toolRestrictedAu: 'Restricted administrative units and who manages them.',
    toolChangelog: 'Everything added or changed, per build.',
    toolRoadmap: 'Where TUNO is heading — shipped, next, later.',
    toolHelp: 'What each tool does, what it reads, and the security model.',
  };
  // ---- the workspaces (ENCA 32407, 32430; TUNO 10673, parity slice 12) --
  // 01 Intune: every tool, the rail in work order rather than the order the
  // tools were added in (round 1, D1 A) — what is configured (Policies), who
  // gets it (Groups, Devices), how well it holds (Posture), then what to
  // change (Assign, Baseline, AppLocker).
  // 02 Projects: temporary tools for one customer project each, beta only.
  // Its OWN tools are the tiles marked data-ws="projects" in index.html — a
  // tile says where it lives, as ENCA's PIM_ONLY list does — and its
  // carry-overs are 01's tools offered here too, the same screens (carry).
  // A side with none of its own tools is not drawn at all: no chip, no
  // switch, no ⌘⇧2, ?ws=projects lands on 01 — so production, where no
  // project tool ever goes, shows no chip, and carry-overs alone never
  // make a workspace.
  const WS_KEY = 'tuno.workspace';
  const WORKSPACES = {
    intune: { num: '01', name: 'Intune', title: 'Intune overview', context: 'Intune / Workspace 01', overview: true, hint: 'the Intune tools',
      shortcuts: [['toolOverview','🗂','Policies'],['toolGroupUse','🔗','Groups'],['toolDevice','🖥','Devices'],['toolPosture','🧭','Posture'],['toolAssignEdit','✏️','Assign'],['toolWinBaseline','🪟','Baseline'],['toolAppLocker','🔐','AppLocker']] },
    projects: { num: '02', name: 'Projects', title: 'Projects', context: 'Projects / Workspace 02', hint: 'temporary tools for customer projects',
      lead: 'Temporary tools for customer projects. Each names its customer and the date it ends, and none of them reaches production.',
      // [tool id, what it does for a project, its rail label] — the same
      // tool as in 01, offered here too (ENCA's lens tools). Since 10674
      // (slice 13) 🚀 MDE rollout's: the Assignment editor it opens a
      // policy in, and the three tools a wave is checked with.
      carry: [
        ['toolAssignEdit', 'Bulk include, exclude and remove — where MDE rollout opens a policy.', 'Assign'],
        ['toolGroupUse', 'Everything a wave group’s members receive, before and after a wave.', 'Groups'],
        ['toolDefender', 'Defender on and up to date on the devices a wave reaches.', 'Defender'],
        ['toolEndpointSec', 'Whether firewall and ASR rules reach a wave’s Windows devices.', 'ASR'],
      ] },
  };
  // The app's own pages belong to every side (ENCA's "❓ Help" group in 02).
  const SHARED = new Set(['toolHelp', 'toolChangelog', 'toolRoadmap']);
  const wsOfTool = (id) => { const t = tools.find(x => x.id === id); return (t && t.ws) || 'intune'; };
  const ownOf = (which) => tools.filter(t => t.ws === which);
  // The sides drawn: 01, and any other with a tool of its own in the page.
  const sides = () => Object.keys(WORKSPACES).filter(id => id === 'intune' || ownOf(id).length > 0);
  const multi = () => sides().length > 1;
  const carryOf = (which) => (WORKSPACES[which] && WORKSPACES[which].carry) || [];
  const inWorkspace = (id, which) => SHARED.has(id) || wsOfTool(id) === which || (which !== 'intune' && carryOf(which).some(([c]) => c === id));
  let ws = 'intune';
  let initialized = false;
  let tools = [];
  let sessionKey = '';
  // The tools opened this session, newest first: { id, at } (ENCA keeps ids).
  const recent = [];
  let lastActive = null;

  // The tenant this session is about (ENCA: Workspace.context).
  function context() {
    const t = window.TunoTenant;
    const key = t && t.tenantId ? t.tenantId() : '';
    if (!key) return null;
    return { demo: document.body.classList.contains('demo-mode'), key, tenant: (t.name && t.name()) || '' };
  }

  function synchronizeBranding() {
    const brand = typeof Brand !== 'undefined' ? Brand.current : null;
    if (!brand || !$('wcBrandName')) return;
    $('wcBrandName').textContent = brand.name || 'TUNO';
    // The original image stays connected to TUNO's live branding updates.
    // Inherit its logo, wordmark dimensions and theme-specific asset swap.
    document.body.classList.toggle('wc-wide-logo', !!brand.logoWide);
  }

  // The library is a <dialog>; a browser without showModal() (and the test
  // DOM) gets the open attribute instead.
  function openLauncher() { const d = $('wcLauncher'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function closeLauncher() { const d = $('wcLauncher'); if (!d || !d.open) return; if (d.close) d.close(); else d.removeAttribute('open'); }
  function openTool(id) {
    if (!document.body.classList.contains('with-side')) return;
    const original = $('side-' + id) || $(id);
    if (!original) return;
    closeLauncher();
    // A tool opened from the wrong side switches the side first, so the rail
    // and the strip agree with the screen (ENCA 32407).
    if (!inWorkspace(id, ws)) setWorkspace(wsOfTool(id), { quiet: true });
    original.click(); // The existing app owns the route, subtab and state.
  }
  const nameIn = (id) => { const t = tools.find(x => x.id === id); return t ? t.name : ''; };
  // A card carries its tile's tags (writes to the tenant, NEW, BETA, UPDATED,
  // temporary) as chips, where ENCA's cards carry their lens chip.
  const chip = g => `<span class="wc-chip${g.cls ? ' ' + g.cls : ''}"${g.title ? ` title="${esc(g.title)}"` : ''}>${esc(g.text)}</span>`;
  // A tool without a T-number names its group instead, as in ENCA — without
  // the section's emoji, which only a heading draws as a line icon.
  const plain = text => String(text).replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '');
  const card = t => `<button type="button" class="wc-tool" data-wc-tool="${esc(t.id)}"><span class="wc-tool-icon" aria-hidden="true">${icon(t.id)}</span><strong>${esc(t.name)}</strong><span>${esc(t.description)}</span><small>${esc(t.number || plain(t.group))}${t.tags.length ? ' · ' + t.tags.map(chip).join('') : ''}</small></button>`;
  function readTools() {
    let group = '', groupIcon = '';
    return [...document.querySelectorAll('#screen-home .tool-sec, #screen-home .tools > .tool[id]')].flatMap(el => {
      if (el.classList.contains('tool-sec')) { const h = el.querySelector('h3'); group = h ? h.textContent.trim() : ''; groupIcon = (h && h.getAttribute('data-icon')) || ''; return []; }
      const side = $('side-' + el.id);
      if (!side) return [];
      const txt = side.querySelector('.sn-txt'), ic = side.querySelector('.sn-ic'), num = side.querySelector('.sn-t');
      const tags = [...el.querySelectorAll('h3 .tag')].map(g => ({ text: g.textContent.trim(), cls: ['block', 'new', 'upd'].filter(c => g.classList.contains(c)).join(' '), title: g.getAttribute('title') || '' }));
      const home = WORKSPACES[el.getAttribute('data-ws')] ? el.getAttribute('data-ws') : 'intune';
      return [{ id: el.id, name: txt ? txt.textContent.trim() : el.id, icon: ic ? ic.textContent.trim() : '', number: num ? num.textContent.trim() : '', group, groupIcon, tags, ws: home, rail: el.getAttribute('data-rail') || '', description: blurbs[el.id] || '' }];
    });
  }
  const projectTags = (id) => { const p = typeof toolProject === 'function' ? toolProject(id) : null; return p ? p.chips.map(c => ({ text: c.txt, cls: c.cls, title: c.title || '' })) : []; };
  const ALSO = { text: 'also in 01', cls: 'also', title: 'The same tool as in Workspace 01. Opened from here, it stays in 02.' };
  // The tools a workspace offers, in its own order and with its own words:
  // 01 its tiles; 02 its own tools, then its carry-overs (the same tool, a
  // project's words for it), then the app's own pages.
  function toolsOf(which) {
    if (which === 'intune' || !WORKSPACES[which]) return tools.filter(t => t.ws === 'intune');
    // A group name opens with its emoji, as the tiles' sections and ENCA's
    // 02 groups do: the heading draws it as its line icon (data-icon).
    // A project tool's card names its customer and end date first (js/
    // version.js projectChips, round 1's mockup); a carry-over's says it is
    // also in 01.
    const mine = ownOf(which).map(t => Object.assign({}, t, { group: '🚀 Project tools', groupIcon: 'rocket', tags: projectTags(t.id).concat(t.tags) }));
    const carried = carryOf(which).map(([id, blurb]) => {
      const t = tools.find(x => x.id === id);
      return t ? Object.assign({}, t, { group: '🔗 Carried over from 01', groupIcon: 'link', description: blurb || t.description, carried: true, tags: [ALSO].concat(t.tags) }) : null;
    }).filter(Boolean);
    return mine.concat(carried, tools.filter(t => SHARED.has(t.id)));
  }
  function renderLauncher() {
    const q = $('wcSearch').value.trim().toLowerCase();
    const matches = toolsOf(ws).filter(t => [t.name, t.group, t.number, t.description].concat(t.tags.map(g => g.text)).join(' ').toLowerCase().includes(q));
    const groups = [...new Set(matches.map(t => t.group))];
    $('wcTools').innerHTML = matches.length ? groups.map(group => {
      const first = matches.find(t => t.group === group);
      const di = first && first.groupIcon ? ` data-icon="${esc(first.groupIcon)}"` : '';
      return `<section><h3${di}>${esc(group)}</h3><div class="wc-tool-grid">${matches.filter(t => t.group === group).map(card).join('')}</div></section>`;
    }).join('') : '<p class="wc-no-results">No tools match this search.</p>';
    $('wcResultCount').textContent = `${matches.length} tools · Workspace ${WORKSPACES[ws].num}`;
  }
  // ---- rail, header chip, home: one renderer each, re-run on a switch ----
  // 01's rail is its list; 02's is its own tools, then its carry-overs —
  // a tile may give its rail label (data-rail), else the rail says its name.
  const shortcutsOf = (which) => WORKSPACES[which].shortcuts
    || ownOf(which).map(t => [t.id, '', t.rail || t.name]).concat(carryOf(which).filter(([id]) => tools.some(x => x.id === id)).map(([id, , label]) => [id, '', label || nameIn(id)]));
  function renderRail() {
    const w = WORKSPACES[ws];
    const shortcut = ([id, , label]) => {
      const t = tools.find(x => x.id === id);
      if (!t) return `<button type="button" class="wc-planned" disabled title="${esc(label)} — not in this build"><span aria-hidden="true">${icon(id)}</span><small>${esc(label)}</small></button>`;
      return `<button type="button" data-wc-tool="${id}" aria-label="${esc(t.name)}" title="${esc(t.name)}${t.number ? ` (${esc(t.number)})` : ''}"><span aria-hidden="true">${icon(id)}</span><small>${esc(label)}</small></button>`;
    };
    // The caption's switch goes to the other side; with one side there is
    // nothing to switch to and the caption only names it.
    const others = sides().filter(id => id !== ws);
    const sw = others.length ? `<button type="button" class="wc-rail-switch" data-wc-switch="${others[0]}" title="Switch to ${esc(WORKSPACES[others[0]].num)} · ${esc(WORKSPACES[others[0]].name)}"><span class="wc-ws-dot" aria-hidden="true"></span>${esc(w.num)} ⇄</button>` : `${esc(w.num)} · ${esc(w.name)}`;
    $('wcRail').innerHTML = `<button type="button" id="wcHomeButton" data-wc-home><span aria-hidden="true">${icon('home')}</span><small>Home</small></button>${shortcutsOf(ws).map(shortcut).join('')}<span class="wc-rail-divider"></span><button type="button" data-wc-library><span aria-hidden="true">${icon('overview')}</span><small>All tools</small></button><button type="button" data-wc-tool="toolHelp"><span aria-hidden="true">${icon('toolHelp')}</span><small>Help</small></button><span class="wc-rail-caption">WORKSPACE<br>${sw}</span>`;
  }
  const hhmm = (t) => { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  function renderRecent() {
    if (!$('wcRecent')) return;
    $('wcRecent').innerHTML = recent.length ? recent.map(r => {
      const t = tools.find(x => x.id === r.id); if (!t) return '';
      return `<button type="button" class="wc-recent" data-wc-tool="${esc(r.id)}"><span aria-hidden="true">${icon(t.id)}</span><span><strong>${esc(t.name)}</strong><small>${esc([t.number, 'opened ' + hhmm(r.at)].filter(Boolean).join(' · '))}</small></span><span aria-hidden="true">↗</span></button>`;
    }).join('') : (() => {
      // 01 starts at Policies; 02 at its first project tool (ENCA: PIM baseline).
      const first = ws === 'intune' ? null : ownOf(ws)[0];
      return `<div class="wc-empty"><span aria-hidden="true">↗</span><h3>Your next session starts here.</h3><p>Tools you open appear here for a quick return.</p><button type="button" class="wc-text-button" data-wc-tool="${first ? esc(first.id) : 'toolOverview'}">${first ? `Open ${esc(first.name)} →` : 'Open Policies →'}</button></div>`;
    })();
  }
  // The library on Home: the workspace's tools, grouped as on the tiles.
  let bindGroups = () => {};
  let setLib = () => {};
  function renderHome() {
    if (!$('wcHome')) return;
    const w = WORKSPACES[ws];
    $('wcHomeTitle').textContent = w.title;
    // 02's own lead (ENCA's #wcPimLead); 01's line under the title is the
    // Intune overview's, and the stylesheet shows one or the other.
    $('wcWsLead').textContent = w.lead || '';
    const list = toolsOf(ws);
    $('wcLibraryCount').textContent = `All ${list.length} tools`;
    $('wcOverviewTools').innerHTML = [...new Set(list.map(t => t.group))].map(group => {
      const first = list.find(t => t.group === group), n = list.filter(t => t.group === group).length;
      const di = first && first.groupIcon ? ` data-icon="${esc(first.groupIcon)}"` : '';
      return `<details class="wc-tool-group" open><summary${di}>${esc(group)} <span>${n} tool${n === 1 ? '' : 's'}</span></summary><div class="wc-tool-grid">${list.filter(t => t.group === group).map(card).join('')}</div></details>`;
    }).join('');
    bindGroups();
    renderRecent();
  }
  function openTabIds() { return [...document.querySelectorAll('#toolNav .toolnav-tab [data-nav]')].map(b => b.dataset.nav); }
  // What a side holds, for its row in the chip's menu (round 1's switcher):
  // 01 its tools, 02 its project tools and carry-overs, beta only.
  function holds(which) {
    const n = toolsOf(which).length;
    if (which === 'intune') return `${n} tool${n === 1 ? '' : 's'}`;
    const own = ownOf(which).length, carried = toolsOf(which).filter(t => t.carried).length;
    return [`${own} project tool${own === 1 ? '' : 's'}`].concat(carried ? [`${carried} carried over`] : []).join(', ') + ' · beta only';
  }
  function renderChip() {
    const w = WORKSPACES[ws];
    if ($('wcWsNum')) { $('wcWsNum').textContent = w.num; $('wcWsName').textContent = w.name; }
    $('wcHeaderContext').textContent = w.context;
    const open = openTabIds();
    for (const id of sides()) {
      const row = $('wcWsRow-' + id); if (!row) continue;
      row.classList.toggle('cur', id === ws); row.setAttribute('aria-current', id === ws ? 'true' : 'false');
      const n = open.filter(t => inWorkspace(t, id)).length;
      row.querySelector('.wc-ws-open').textContent = holds(id) + (n ? ` · ${n} open` : '');
    }
  }
  function setWorkspace(next, opts) {
    const o = opts || {};
    // Only a side that is drawn: ?ws=projects, ⌘⇧2 and the palette never
    // reach a 02 without a tool of its own.
    if (!WORKSPACES[next] || sides().indexOf(next) < 0) return;
    const changed = next !== ws;
    ws = next;
    document.body.dataset.ws = ws;
    try { localStorage.setItem(WS_KEY, ws); } catch { /* private mode */ }
    // The address says the side, so a reload or a shared link lands on it;
    // every other parameter (?demo=1 …) is kept.
    try { const u = new URL(location.href); if (ws === 'intune') u.searchParams.delete('ws'); else u.searchParams.set('ws', ws); history.replaceState(history.state, '', u); } catch { /* opaque origin */ }
    renderChip(); renderRail(); renderHome(); setLib();
    closeWsMenu();
    if (changed && !o.quiet) {
      // A tool open on the other side stays open (its tab is only hidden);
      // the screen goes to this side's Home so rail, strip and page agree.
      const activeBtn = $('toolNav').querySelector('.toolnav-tab.active [data-nav]');
      const active = activeBtn ? activeBtn.dataset.nav : '';
      if (active && !inWorkspace(active, ws) && $('side-home')) { $('side-home').click(); return; }
    }
    synchronize();
  }
  function closeWsMenu() { const m = $('wcWsMenu'); if (m && !m.hidden) { m.hidden = true; $('wcWsChip').setAttribute('aria-expanded', 'false'); } }
  function toggleWsMenu() { const m = $('wcWsMenu'); if (!m) return; const open = m.hidden; m.hidden = !open; $('wcWsChip').setAttribute('aria-expanded', String(open)); if (open) { renderChip(); placeWsMenu(); } }
  // The menu stays inside the window, 12 px from either edge. TUNO's chip
  // sits mid-left on a phone, where ENCA's right:-40px would put the menu
  // past the left edge; it hangs from the chip and moves only as far as
  // it has to.
  function placeWsMenu() {
    const m = $('wcWsMenu'); if (!m || m.hidden) return;
    m.style.left = '0px';
    const r = m.getBoundingClientRect(), gap = 12, vw = document.documentElement.clientWidth || window.innerWidth;
    let shift = 0;
    if (r.right > vw - gap) shift = vw - gap - r.right;
    if (r.left + shift < gap) shift = gap - r.left;
    m.style.left = `${Math.round(shift)}px`;
  }
  // ⌘K entries: "Switch to 02 · Projects" beside the tools (app.js cpBuild
  // asks for these; the palette itself stays app.js's). None with one side.
  function paletteItems(q, score) {
    return sides().filter(id => id !== ws).map(id => {
      const w = WORKSPACES[id], label = `⇄ Switch to ${w.num} · ${w.name}`;
      const sc = score ? score(label, q) : 1;
      return sc ? { kind: 'tool', id: 'side-home', label, hint: `Workspace ${w.num} — ${w.hint}`, score: sc, go: () => setWorkspace(id) } : null;
    }).filter(Boolean);
  }
  function synchronize() {
    if (!initialized) return;
    const signedIn = document.body.classList.contains('with-side');
    const ctx = context();
    const key = signedIn && ctx ? `${ctx.demo}:${ctx.key}` : '';
    if (key !== sessionKey) { sessionKey = key; recent.length = 0; lastActive = null; renderRecent(); }
    const theme = $('themeBtn');
    if (signedIn && theme.parentElement !== $('acctMenu')) {
      theme.setAttribute('role','menuitem'); $('acctMenu').insertBefore(theme, $('signOutBtn'));
    } else if (!signedIn && theme.parentElement === $('acctMenu')) {
      theme.removeAttribute('role'); document.querySelector('header .hwrap').insertBefore(theme, $('tenantBox'));
    }
    if (!signedIn) {
      closeLauncher();
      $('toolNav').style.display = 'none';
      closeWsMenu();
      return;
    }
    const activeBtn = $('toolNav').querySelector('.toolnav-tab.active [data-nav]');
    const active = activeBtn ? activeBtn.dataset.nav : '';
    const home = $('screen-home').classList.contains('active');
    // A tool of the other side opened by the app itself (⌘K, a jump from a
    // report, Back) takes the shell with it: the screen decides the side, so
    // the rail and the strip never disagree with the page (ENCA 32407).
    if (active && !home && !inWorkspace(active, ws) && sides().indexOf(wsOfTool(active)) >= 0) { setWorkspace(wsOfTool(active), { quiet: true }); return; }
    document.querySelectorAll('#wcRail button[data-wc-tool]').forEach(button => {
      const on = !home && button.dataset.wcTool === active;
      button.classList.toggle('active', on);
      on ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current');
    });
    $('wcHomeButton').classList.toggle('active', home);
    home ? $('wcHomeButton').setAttribute('aria-current', 'page') : $('wcHomeButton').removeAttribute('aria-current');
    if (active && active !== lastActive && !home) {
      lastActive = active;
      const index = recent.findIndex(r => r.id === active); if (index >= 0) recent.splice(index, 1);
      recent.unshift({ id: active, at: Date.now() }); recent.splice(5);
      renderRecent();
    }
    const demo = !!(ctx && ctx.demo);
    const tenant = (ctx && ctx.tenant) || $('tenantName').textContent || 'Workspace';
    const tenantShown = demo ? tenant.replace(/\s*\(demo\)$/i, '') : tenant;
    if ($('wcTenant')) $('wcTenant').textContent = `${tenantShown} · Workspace ${WORKSPACES[ws].num}`;
    if ($('wcEnvironment')) $('wcEnvironment').textContent = demo ? 'Demo · sample data' : 'Your tenant · live reads';
    $('wcAccountLabel').textContent = tenantShown + (demo ? ' · Demo' : '');
    $('wcSessionNote').textContent = demo ? 'Demo · changes are simulated' : 'Signed in · tenant actions use the existing confirmation steps';
    $('acctBtn').setAttribute('aria-label', $('wcAccountLabel').textContent + ' — account options');
    // Keep TUNO's tab elements and delegated handlers. Only their
    // presentation changes; Overview remains present, as in the mockup.
    const nav = $('toolNav');
    nav.style.display = 'block';
    const overview = nav.querySelector('[data-navhome]');
    if (overview) {
      if (!overview.querySelector(':scope > span')) overview.innerHTML = icon('overview') + '<span>Overview</span>';
      overview.setAttribute('aria-label', 'Overview'); overview.title = 'Overview';
      overview.setAttribute('aria-current', home ? 'page' : 'false');
    }
    nav.querySelectorAll('.toolnav-tab [data-nav]').forEach(button => {
      const t = tools.find(x => x.id === button.dataset.nav);
      if (t && button.getAttribute('data-wc-named') !== t.id) { button.innerHTML = icon(t.id) + `<span>${esc(nameIn(t.id))}</span>`; button.setAttribute('data-wc-named', t.id); }
      button.setAttribute('aria-current', button.dataset.nav === active && !home ? 'page' : 'false');
      // A tab belongs to the side its tool is in; the other side's tabs stay
      // open and come back with the switch (ENCA 32407).
      button.closest('.toolnav-tab').hidden = !inWorkspace(button.dataset.nav, ws);
    });
    $('wcCloseAll').disabled = !nav.querySelector('[data-close]');
    nav.querySelectorAll('[data-close]').forEach(button => {
      button.setAttribute('aria-label', `Close ${nameIn(button.dataset.close) || 'tool'} tab`);
    });
    const menu = $('wcWsMenu');
    if (menu && !menu.hidden) renderChip();
    // Many tools stay on one scrollable row. Re-check after decorating
    // labels, whose widths differ from the native emoji labels, without
    // changing the tool's remembered vertical scroll position.
    const strip = nav.querySelector('.toolnav-inner');
    const tab = nav.querySelector('.toolnav-tab.active');
    if (home && strip) strip.scrollLeft = 0;
    else if (strip && tab) {
      const bounds = strip.getBoundingClientRect(), target = tab.getBoundingClientRect();
      const left = bounds.left + (overview ? overview.offsetWidth : 0) + 12;
      if (target.left < left) strip.scrollLeft += target.left - left;
      else if (target.right > bounds.right - 12) strip.scrollLeft += target.right - bounds.right + 12;
    }
  }
  function initialize() {
    if (initialized || !$('side-toolOverview')) return;
    tools = readTools();
    initialized = true;
    document.body.classList.add('workspaces-shell');
    // Which side to start on: the link (?ws=projects) wins, then the last
    // choice in this browser, then 01 — and only a side that is drawn.
    try {
      const q = new URLSearchParams(location.search).get('ws');
      const stored = localStorage.getItem(WS_KEY);
      const drawn = sides();
      ws = drawn.indexOf(q) >= 0 ? q : (drawn.indexOf(stored) >= 0 ? stored : 'intune');
    } catch { ws = 'intune'; }
    document.body.dataset.ws = ws;
    const rail = document.createElement('nav'); rail.id = 'wcRail'; rail.setAttribute('aria-label', 'Workspace navigation');
    document.body.append(rail);
    const brand = document.createElement('span'); brand.className = 'wc-brand';
    brand.innerHTML = '<span id="wcBrandName">TUNO</span>';
    brand.prepend($('brandLogo'));
    $('logoHome').append(brand);
    synchronizeBranding();
    document.addEventListener('tuno:brand-updated', synchronizeBranding);
    new MutationObserver(synchronizeBranding).observe($('brandTag'), {childList:true, characterData:true, subtree:true});
    const header = document.querySelector('header .hwrap');
    // The workspace chip — the one switch — sits beside the wordmark, not in
    // the wordmark's link, so the logo still goes home. Only with a second
    // side to switch to; its menu has a row per side (ENCA 32407).
    let after = $('logoHome');
    if (multi()) {
      const chipWrap = document.createElement('span'); chipWrap.className = 'wc-ws';
      chipWrap.innerHTML = `<button type="button" class="wc-ws-chip" id="wcWsChip" aria-haspopup="menu" aria-expanded="false" title="Switch workspace"><span class="wc-ws-num" id="wcWsNum"></span><span id="wcWsName"></span><span class="wc-ws-caret" aria-hidden="true">▾</span></button><div class="wc-ws-menu" id="wcWsMenu" role="menu" hidden><div class="wc-ws-label">Workspaces</div>${sides().map(id => { const w = WORKSPACES[id]; return `<button type="button" class="wc-ws-row" id="wcWsRow-${id}" data-wc-switch="${id}" role="menuitem"><span class="wc-ws-sw wc-ws-sw-${id}" aria-hidden="true">${esc(w.num)}</span><span><strong>${esc(w.name)}</strong><small class="wc-ws-open"></small></span><span class="wc-ws-keys" aria-hidden="true"><kbd>⌘⇧${esc(w.num.replace(/^0/, ''))}</kbd></span></button>`; }).join('')}<div class="wc-ws-foot">Switching keeps the open tools of the other side; their tabs come back with it. The header colour says which side you are on.</div></div>`;
      after.after(chipWrap); after = chipWrap;
    }
    const ctxLine = document.createElement('span'); ctxLine.className = 'wc-header-context'; ctxLine.id = 'wcHeaderContext';
    after.after(ctxLine);
    const allTools = document.createElement('button'); allTools.type = 'button'; allTools.id = 'wcHeaderTools'; allTools.dataset.wcLibrary = '';
    allTools.innerHTML = icon('overview') + '<span>All tools</span>';
    header.insertBefore(allTools, $('tenantBox'));
    const accountLabel = document.createElement('span'); accountLabel.id = 'wcAccountLabel';
    $('acctBtn').prepend(accountLabel);
    // Account settings remain available, without adding controls to the
    // mockup's uncluttered top bar. The existing theme handler is retained.
    const theme = $('themeBtn'); theme.setAttribute('role', 'menuitem');
    const themeLabel = document.createElement('span'); themeLabel.textContent = ' Theme'; theme.append(themeLabel);
    const menu = $('acctMenu'); menu.insertBefore(theme, $('signOutBtn'));
    const closeAll = document.createElement('button'); closeAll.type = 'button'; closeAll.id = 'wcCloseAll'; closeAll.setAttribute('role', 'menuitem'); closeAll.textContent = 'Close all tools';
    closeAll.addEventListener('click', () => {
      const all = $('toolNav').querySelector('[data-navcloseall]');
      if (all) all.click(); else { const one = $('toolNav').querySelector('[data-close]'); if (one) one.click(); }
    });
    menu.insertBefore(closeAll, $('signOutBtn'));
    const note = document.createElement('p'); note.className = 'wc-account-note'; note.id = 'wcSessionNote'; menu.append(note);
    // ---- Home (ENCA 25401 / 25422 / 25426; slice 8) ----
    const home = document.createElement('div'); home.id = 'wcHome';
    home.innerHTML = `<div class="wc-home-heading"><div><div class="wc-eyebrow" id="wcTenant"></div><h1 id="wcHomeTitle"></h1><p id="wcHomeLead"></p><p id="wcWsLead"></p></div><span class="wc-demo"><span></span><span id="wcEnvironment"></span></span></div><div class="wc-home-layout"><aside class="wc-recent-panel"><h2>Recent tools</h2><div id="wcRecent"></div></aside><section class="wc-library"><div class="wc-section-heading"><h2 id="wcLibraryCount"></h2><span class="wc-section-actions"><button type="button" id="wcToggleLibrary" class="wc-text-button" aria-expanded="false" aria-controls="wcOverviewTools">Show</button><button type="button" id="wcToggleGroups" class="wc-text-button" hidden>Collapse all</button></span></div><div id="wcOverviewTools" hidden></div></section></div><div class="wc-home-foot"><span>Open tools stay in the tabs above your workspace.</span><button type="button" class="wc-text-button" data-wc-tool="toolHelp">TUNO help →</button></div>`;
    $('screen-home').prepend(home);
    // The Intune overview (js/home-overview.js, 10671) renders into the home
    // once this layout exists — say so, rather than have it poll for us.
    document.dispatchEvent(new CustomEvent('tuno:wchome'));
    // The library sits under the overview, closed until asked for (ENCA
    // 25422). Where no overview is there — 02 has none, as ENCA's 02 — it
    // starts open, so Home is not a heading and a list of nothing. The
    // choice is remembered per browser and per workspace.
    const libKey = () => `tuno.wcLibraryOpen:${ws}`;
    const libToggle = $('wcToggleLibrary'), lib = $('wcOverviewTools'), layout = home.querySelector('.wc-home-layout');
    setLib = (open) => {
      const deflt = !(WORKSPACES[ws].overview && $('wcOverview'));
      if (open === undefined) { try { const v = localStorage.getItem(libKey()); open = v === null ? deflt : v === '1'; } catch { open = deflt; } }
      else { try { localStorage.setItem(libKey(), open ? '1' : '0'); } catch { /* private mode */ } }
      lib.hidden = !open; libToggle.textContent = open ? 'Hide' : 'Show'; libToggle.setAttribute('aria-expanded', String(open)); $('wcToggleGroups').hidden = !open; layout.classList.toggle('lib-closed', !open);
    };
    libToggle.addEventListener('click', () => setLib(lib.hidden));
    const toggleGroups = $('wcToggleGroups');
    bindGroups = () => {
      const groups = [...home.querySelectorAll('.wc-tool-group')];
      const syncGroups = () => { toggleGroups.textContent = groups.some(g => g.open) ? 'Collapse all' : 'Expand all'; };
      groups.forEach(g => g.addEventListener('toggle', syncGroups));
      toggleGroups.onclick = () => { const open = !groups.some(g => g.open); groups.forEach(g => { g.open = open; }); syncGroups(); };
      syncGroups();
    };
    const dialog = document.createElement('dialog'); dialog.id = 'wcLauncher'; dialog.setAttribute('aria-labelledby', 'wcLauncherTitle');
    dialog.innerHTML = '<div class="wc-launcher-head"><div><span class="wc-eyebrow">TUNO tool library</span><h2 id="wcLauncherTitle">Open a tool</h2></div><button type="button" id="wcCloseLauncher" aria-label="Close tool library">×</button></div><label class="wc-search-label" for="wcSearch">Find a tool</label><input id="wcSearch" type="search" placeholder="Search by name, task or tool number…"><p id="wcResultCount" role="status"></p><div id="wcTools"></div>';
    document.body.append(dialog);
    $('wcSearch').addEventListener('input', renderLauncher);
    $('wcCloseLauncher').addEventListener('click', closeLauncher);
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeLauncher(); }
    });
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeLauncher(); } });
    document.addEventListener('click', e => {
      if (!document.body.classList.contains('with-side')) { closeWsMenu(); return; }
      const sw = e.target.closest('[data-wc-switch]'); if (sw) { setWorkspace(sw.dataset.wcSwitch); return; }
      if (e.target.closest('#wcWsChip')) { toggleWsMenu(); return; }
      if (!e.target.closest('#wcWsMenu')) closeWsMenu();
      const tool = e.target.closest('[data-wc-tool]'); if (tool) { openTool(tool.dataset.wcTool); return; }
      if (e.target.closest('[data-wc-home]')) { $('side-home').click(); return; }
      if (e.target.closest('[data-wc-library]')) { $('wcSearch').value = ''; renderLauncher(); openLauncher(); $('wcSearch').focus(); }
    });
    // ⌘⇧1 / ⌘⇧2 (Ctrl+Shift on Windows) switch sides once there are two;
    // plain ⌘1 is the browser's own first-tab shortcut and stays its.
    document.addEventListener('keydown', e => {
      if (!multi() || !(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey) return;
      if (!document.body.classList.contains('with-side')) return;
      const hit = sides().find(id => e.code === `Digit${+WORKSPACES[id].num}` || e.key === String(+WORKSPACES[id].num));
      if (!hit) return;
      e.preventDefault(); setWorkspace(hit);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeWsMenu(); });
    window.addEventListener('resize', placeWsMenu);
    renderChip(); renderRail(); renderHome(); setLib();
    new MutationObserver(synchronize).observe($('toolNav'), {childList:true});
    new MutationObserver(synchronize).observe($('screen-home'), {attributes:true, attributeFilter:['class']});
    new MutationObserver(synchronize).observe(document.body, {attributes:true, attributeFilter:['class']});
    document.addEventListener('tuno:workspace-updated', synchronize);
    synchronize();
    window.dispatchEvent(new Event('resize'));
  }
  globalThis.Workspaces = { current: () => ws, switch: (id) => setWorkspace(id), paletteItems, list: () => Object.keys(WORKSPACES).map(id => ({ id, num: WORKSPACES[id].num, name: WORKSPACES[id].name })) };
  const ready = new MutationObserver(() => { initialize(); if (initialized) ready.disconnect(); });
  ready.observe($('sideNav'), {childList:true});
  initialize();
  // Line icons in the chrome (js/flat-icons.js): started here, as ENCA does;
  // js/app.js started them from 10666 until this file arrived.
  if (typeof FlatIcons !== 'undefined') FlatIcons.start();
})();

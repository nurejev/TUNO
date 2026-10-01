/* Shared tool presentation — ENCA's js/tool-layout.js (as at ENCA beta 32433),
   ported at build 10664. The tools own their data, actions and dialogs; this
   file owns how a tool screen's head behaves.

   Ported so far: THE HEAD FOLDS (ENCA 25451). ENCA's second half — keeping
   the header's text readable on a light branding colour (contrastInk,
   --wc-brand-ink) — arrives with the branded header in parity slice 7, where
   there is a header to measure. ENCA's #anIntro line is ENCA's own screen and
   is not ported. Rewritten without optional chaining (TUNO's house rule). */
(() => {
  'use strict';

  // THE HEAD FOLDS (ENCA build 25451, Mihai there: "allow the top bar to
  // collapse, it takes too much space"). Every tool head is a title line plus
  // prose — up to 360 words on TUNO's 27 head cards, 200 on a typical one.
  // A ▾ / ▸ button at the
  // end of the title folds the prose away and keeps the title, its chips and
  // its version stamp; the choice is kept per screen in localStorage, so a
  // tool read once stays short. ENCA's tools rebuild their heads after every
  // read, so the fold is re-applied by the same observer that marks the
  // title; TUNO's heads are written once at startup (toolHeadInner), and the
  // observer is kept so a head a tool does rebuild later folds the same way.
  const FOLD_KEY = id => 'tuno-head-fold:' + id;
  const folded = id => { try { return localStorage.getItem(FOLD_KEY(id)) === '1'; } catch { return false; } };
  const remember = (id, on) => { try { on ? localStorage.setItem(FOLD_KEY(id), '1') : localStorage.removeItem(FOLD_KEY(id)); } catch { /* private mode: the fold lasts this page */ } };
  function foldable(head, id) {
    const title = head.querySelector('h1,h2,h3');
    if (!title) return;
    title.classList.add('wc-page-title');
    if (!title.querySelector('.wc-head-fold')) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wc-head-fold';
      b.addEventListener('click', e => { e.stopPropagation(); const on = !head.classList.contains('wc-head-folded'); head.classList.toggle('wc-head-folded', on); remember(id, on); b.textContent = on ? '▸' : '▾'; b.title = on ? 'Show what this tool does' : 'Hide the description — the title stays'; b.setAttribute('aria-expanded', on ? 'false' : 'true'); });
      title.appendChild(b);
    }
    const on = folded(id);
    head.classList.toggle('wc-head-folded', on);
    // write only what changed: this runs from a childList observer on the
    // head, and setting textContent to the same value is still a mutation
    const b = title.querySelector('.wc-head-fold'), want = on ? '▸' : '▾';
    if (b.textContent !== want) b.textContent = want;
    const tip = on ? 'Show what this tool does' : 'Hide the description — the title stays';
    if (b.title !== tip) b.title = tip;
    const exp = on ? 'false' : 'true';
    if (b.getAttribute('aria-expanded') !== exp) b.setAttribute('aria-expanded', exp);
  }
  document.querySelectorAll('.screen.tool').forEach(screen => {
    const head = screen.querySelector(':scope > .readme, :scope > .workspace-heading');
    if (!head) return;
    head.classList.add('wc-tool-head');
    const markTitle = () => foldable(head, screen.id);
    markTitle();
    if (typeof MutationObserver !== 'undefined') new MutationObserver(markTitle).observe(head, {childList:true, subtree:true});
  });
})();

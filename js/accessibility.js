// ======================================================================
// Shared keyboard support for the dialog surfaces and the home tiles —
// ENCA's js/accessibility.js (build 25357, as at ENCA beta 32433), ported
// to TUNO at build 10665 (TUNO–ENCA parity slice 4).
//
//   * An open dialog (.modal-bg.open, the ⛶ panel #fsModal.show) is a real
//     modal: role=dialog, aria-modal, named by its own heading; focus moves
//     into it, Tab and Shift+Tab stay inside it, everything outside it is
//     inert while it is open, and focus goes back to where it was when it
//     closes.
//   * Every home tile gets a real button around its name, so a tile can be
//     reached with Tab and opened with Enter or Space; the tile's own click
//     listener stays the route.
//   * The logo in the header is a button for the keyboard too.
//
// FOUR TUNO DIFFERENCES, all on purpose:
//   * ESCAPE GOES TO THE TOOLS FIRST. Most TUNO dialogs close on Escape
//     through their own close function, which also takes their listeners
//     down; ENCA's capturing handler would stop those and click a close
//     button instead, skipping that cleanup. Here the tools hear Escape
//     first, and only a dialog STILL open after them — 🛡 Intune RBAC's
//     member list had no Escape at all — closes through its own close
//     button, the same click a mouse would make.
//   * NO CLOSE BUTTON IS ADDED. ENCA prepends one to a dialog that has none;
//     each of TUNO's fourteen dialogs has its own close path, and a button
//     that only removed .open would bypass it in the same way.
//   * The ⛶ panel is named by its own title (#fsTitle) rather than
//     "Dialog".
//   * A dialog without a heading that names itself (aria-label on its
//     .modal — the ⌘K palette, build 10670) keeps that name; ENCA
//     overwrites it with "Dialog", which stays the name of one with neither.
// Rewritten without optional chaining and without Array.prototype.at
// (TUNO's house rule and the browsers it keeps).
// ======================================================================
(() => {
  const last = (a) => a[a.length - 1];
  const focusable = root => [...root.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(e => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length && !e.closest('[inert]'));
  let stack=[], inerted=[];
  function sync() {
    const open=[...document.querySelectorAll('.modal-bg.open, #fsModal.show')];
    const closed=stack.filter(x=>!open.includes(x.el));
    const added=open.filter(el=>!stack.some(x=>x.el===el));
    stack=stack.filter(x=>open.includes(x.el));
    added.forEach(el=>{
      const panel=el.querySelector('.modal, .fs-panel')||el;
      panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.tabIndex=-1;
      const title=panel.querySelector('h1,h2,h3,h4,#fsTitle');
      if(title){if(!title.id)title.id='dialog-title-'+el.id;panel.setAttribute('aria-labelledby',title.id);}
      else if(!panel.hasAttribute('aria-label'))panel.setAttribute('aria-label','Dialog');
      stack.push({el,panel,returnTo:document.activeElement});
    });
    inerted.forEach(el=>el.inert=false);inerted=[];
    const top=last(stack);
    if(top){
      let branch=top.el;
      while(branch.parentElement&&branch.parentElement!==document.documentElement){
        [...branch.parentElement.children].filter(el=>el!==branch&&!['SCRIPT','STYLE','LINK'].includes(el.tagName)&&!el.inert).forEach(el=>{el.inert=true;inerted.push(el);});
        branch=branch.parentElement;
      }
      if(added.length)(focusable(top.panel)[0]||top.panel).focus();
    } else if(closed.length){const target=closed[0].returnTo;if(target&&target.isConnected)target.focus();}
    if(top&&closed.length&&!top.panel.contains(document.activeElement))(focusable(top.panel)[0]||top.panel).focus();
  }
  new MutationObserver(records=>{
    if(records.some(r=>r.type==='attributes'&&((r.target.classList&&r.target.classList.contains('modal-bg')) || r.target.id === 'fsModal')))sync();
  }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('keydown',e=>{
    const top=last(stack);if(!top)return;
    if(e.key==='Tab'){
      const items=focusable(top.panel),first=items[0],lastItem=last(items);
      if(!first){e.preventDefault();top.panel.focus();}
      else if(e.shiftKey&&(document.activeElement===first||!top.panel.contains(document.activeElement))){e.preventDefault();lastItem.focus();}
      else if(!e.shiftKey&&(document.activeElement===lastItem||!top.panel.contains(document.activeElement))){e.preventDefault();first.focus();}
    }
  },true);
  // After every document-level handler has had the key (window, bubble
  // phase): a dialog the Escape did not close closes through its close
  // button, if it has one.
  const CLOSE=/^(cancel|close|done|got it|✕|×)(\s|$)/i;
  window.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||e.defaultPrevented)return;
    const top=last(stack);if(!top||!top.el.isConnected)return;
    const stillOpen=top.el.classList.contains('open')||top.el.classList.contains('show');
    if(!stillOpen)return;
    const close=focusable(top.panel).find(b=>b.tagName==='BUTTON'&&CLOSE.test(b.textContent.trim()));
    if(close)close.click();
  });
  document.addEventListener('focusin',e=>{const top=last(stack);if(top&&!top.panel.contains(e.target))(focusable(top.panel)[0]||top.panel).focus();});
  document.querySelectorAll('#screen-home .tool').forEach(tile=>{
    tile.classList.add('tool-tile');
    const h=tile.querySelector('h3');if(!h||h.querySelector('.tool-launch'))return;
    // Keep the tile listener as the route; the native button supplies keyboard activation.
    const b=document.createElement('button');b.type='button';b.className='tool-launch';
    const texts=[...h.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE);
    const title=texts.map(n=>n.textContent).join('').trim();
    b.textContent=title||tile.id;b.setAttribute('aria-label','Open '+b.textContent);
    // TUNO: only the text that carries the name moves into the button; the
    // spaces between the chips stay, and so does the one after the name, so
    // the heading reads exactly as before (ENCA drops them all).
    texts.filter(n=>n.textContent.trim()).forEach(n=>{if(/\s$/.test(n.textContent))n.after(document.createTextNode(' '));n.remove();});
    h.prepend(b);
  });

  ['logoHome'].forEach(id=>{const e=document.getElementById(id);if(!e)return;e.tabIndex=0;e.setAttribute('role','button');e.setAttribute('aria-label','Go to tools');e.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();e.click();}});});
  sync();
})();

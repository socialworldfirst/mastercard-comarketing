/* WorldFirst deck engine.
   Scales the fixed 960x540 stage to the viewport and handles navigation.

   Keys:  ← → space  step  ·  Home / End  jump  ·  F  fullscreen  ·  O  overview
          E  edit mode    ·  Esc  close overview or leave edit mode
   URL:   #7 opens slide 7                                                          */

(function () {
  const STAGE_W = 960, STAGE_H = 540;
  let slides = [], i = 0, gridOpen = false, editing = false;

  /* Comment and edit exist only if the nav declares them. Drop the buttons from
     a client-facing deck and the shortcuts go with them. */
  const REVIEW = !!document.querySelector('#nav [data-comment], #nav [data-edit]');

  /* Everything a person should be able to retype. Structure, layout and images
     are deliberately not editable — those belong in the source file. */
  const EDITABLE = [
    '.title', '.sub', '.body', '.quote', '.note', '.quotebox',
    '.card h3', '.card p', '.stat b', '.stat span',
    '.agenda b', '.agenda span', '.iconrow .item span',
    '.person b', '.person span',
    '.tbl .tr > span', '.timeline .rules div', '.timeline .bar'
  ].join(',');

  const deck = document.getElementById('deck');
  const nav = document.getElementById('nav');
  const grid = document.getElementById('grid');
  const counter = document.getElementById('counter');

  function fit() {
    const w = deck.clientWidth  || window.innerWidth;
    const h = deck.clientHeight || window.innerHeight;
    const s = Math.min(w / STAGE_W, h / STAGE_H);
    if (!s || !isFinite(s)) return;
    slides.forEach(el => (el.style.transform = `translate(-50%, -50%) scale(${s})`));
  }

  function show(n, push) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((el, k) => el.classList.toggle('active', k === i));
    if (counter) counter.textContent = `${i + 1} / ${slides.length}`;
    if (push !== false) history.replaceState(null, '', '#' + (i + 1));
  }

  function buildGrid() {
    if (!grid || grid.dataset.built) return;
    slides.forEach((el, k) => {
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const holder = document.createElement('div');
      holder.className = 'holder';
      const clone = el.cloneNode(true);
      clone.classList.remove('active');
      clone.style.transform = 'scale(0)';   // never show an unscaled 960px clone
      holder.appendChild(clone);
      const lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = k + 1;
      thumb.append(holder, lbl);
      thumb.onclick = () => { toggleGrid(false); show(k); };
      grid.appendChild(thumb);
    });
    grid.dataset.built = '1';
  }

  /* Only ever measure holders while the grid is visible — a display:none
     holder reports clientWidth 0 and the thumbnails come out unscaled. */
  function fitGrid() {
    if (!grid || !gridOpen) return;
    grid.querySelectorAll('.holder').forEach(h => {
      const c = h.querySelector('.slide');
      if (c && h.clientWidth) c.style.transform = `scale(${h.clientWidth / STAGE_W})`;
    });
  }

  function toggleGrid(state) {
    gridOpen = state === undefined ? !gridOpen : state;
    if (!grid) return;
    if (gridOpen) buildGrid();
    grid.classList.toggle('show', gridOpen);
    if (gridOpen) fitGrid();
  }

  /* ---------- edit mode -------------------------------------------------- */

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    slides.forEach(s => {
      s.querySelectorAll(EDITABLE).forEach(el => {
        if (on) el.setAttribute('contenteditable', 'true');
        else el.removeAttribute('contenteditable');
      });
      /* Always rebuild the tool bar. A duplicated slide carries a cloned bar whose
         handlers did not survive cloneNode, so reusing it leaves dead buttons. */
      const old = s.querySelector('.slide-tools');
      if (old) old.remove();
      if (on) {
        const bar = document.createElement('div');
        bar.className = 'slide-tools';
        bar.innerHTML = '<button data-dup title="duplicate slide">+</button>' +
                        '<button data-del title="delete slide">&times;</button>';
        bar.querySelector('[data-dup]').onclick = () => dupSlide(s);
        bar.querySelector('[data-del]').onclick = () => delSlide(s);
        s.appendChild(bar);
      }
    });
    const b = nav && nav.querySelector('[data-edit]');
    if (b) b.textContent = on ? 'done' : 'edit';
    if (on) setCommenting(false);
  }

  function reindex() {
    slides = Array.from(document.querySelectorAll('#deck .slide'));
    slides.forEach((s, k) => {
      const p = s.querySelector('.pagenum');
      if (p) p.textContent = k + 1;
    });
    if (grid) { grid.innerHTML = ''; delete grid.dataset.built; }
    fit();
    bindNoteClicks();
    renderPins();
  }

  function dupSlide(s) {
    const c = s.cloneNode(true);
    c.classList.remove('active');
    const t = c.querySelector('.slide-tools');
    if (t) t.remove();
    s.after(c);
    reindex();
    setEditing(true);
    show(slides.indexOf(c));
  }

  function delSlide(s) {
    if (slides.length < 2) return;
    const at = slides.indexOf(s);
    s.remove();
    reindex();
    setEditing(true);
    show(Math.min(at, slides.length - 1));
  }

  /* ---------- pinned comments -------------------------------------------
     Click anywhere on a slide in comment mode to drop a pin. Position is stored
     in stage units, so a pin lands in the same place at any window size.
     Pins live in localStorage per deck and survive reloads.                    */

  const NOTE_KEY = 'wfdeck_notes_' + location.pathname;
  let notes = [];          // {n, slide, x, y, near, nearText, text}
  let commenting = false;

  function loadNotes() {
    try { notes = JSON.parse(localStorage.getItem(NOTE_KEY)) || []; }
    catch (_) { notes = []; }
  }
  function saveNotes() {
    try { localStorage.setItem(NOTE_KEY, JSON.stringify(notes)); } catch (_) {}
  }

  function renumber() { notes.forEach((nt, k) => (nt.n = k + 1)); }

  function renderPins() {
    document.querySelectorAll('.wf-pin').forEach(e => e.remove());
    renumber();
    notes.forEach(nt => {
      const s = slides[nt.slide - 1];
      if (!s) return;
      const pin = document.createElement('div');
      pin.className = 'wf-pin';
      pin.style.left = nt.x + 'px';
      pin.style.top = nt.y + 'px';
      pin.innerHTML = `<span class="wf-pin-dot">${nt.n}</span>` +
                      `<span class="wf-pin-body"></span>`;
      pin.querySelector('.wf-pin-body').textContent = nt.text;
      pin.onclick = ev => {
        ev.stopPropagation();
        const v = prompt(`Comment ${nt.n} — slide ${nt.slide}\n(clear the text to delete)`, nt.text);
        if (v === null) return;
        if (!v.trim()) notes = notes.filter(x => x !== nt);
        else nt.text = v.trim();
        saveNotes(); renderPins(); updateCount();
      };
      s.appendChild(pin);
    });
    updateCount();
  }

  function updateCount() {
    const b = nav && nav.querySelector('[data-copy]');
    if (b) b.textContent = notes.length ? `copy (${notes.length})` : 'copy';
  }

  /* Bound per slide, so the pin always belongs to the slide that was actually
     clicked rather than to the engine's current index. */
  function placeNote(ev) {
    if (!commenting) return;
    const s = ev.currentTarget;
    if (ev.target.closest('.wf-pin, .slide-tools')) return;
    const r = s.getBoundingClientRect();
    if (!r.width) return;
    const sc = r.width / STAGE_W;
    const x = Math.round((ev.clientX - r.left) / sc);
    const y = Math.round((ev.clientY - r.top) / sc);
    if (x < 0 || y < 0 || x > STAGE_W || y > STAGE_H) return;
    const idx = slides.indexOf(s) + 1;

    // name whatever sits under the pin so the comment is unambiguous
    let near = '', nearText = '';
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    const anchor = hit && hit.closest && hit.closest(EDITABLE);
    if (anchor) {
      const cls = (anchor.getAttribute('class') || '').split(' ')[0];
      near = cls ? '.' + cls : anchor.tagName.toLowerCase();
      nearText = (anchor.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70);
    }
    const text = prompt(`Comment on slide ${idx}` + (nearText ? `\nnear: "${nearText}"` : ''), '');
    if (!text || !text.trim()) return;
    notes.push({ n: 0, slide: idx, x, y, near, nearText, text: text.trim() });
    saveNotes(); renderPins();
  }

  function bindNoteClicks() {
    slides.forEach(s => {
      s.removeEventListener('click', placeNote);
      s.addEventListener('click', placeNote);
    });
  }

  function setCommenting(on) {
    commenting = on;
    document.body.classList.toggle('commenting', on);
    const b = nav && nav.querySelector('[data-comment]');
    if (b) b.textContent = on ? 'done' : 'comment';
  }

  /* ---------- paste-back prompt ------------------------------------------ */

  const originals = new Map();     // element -> text at load, for diffing edits

  /* Compare on collapsed whitespace. A hidden slide's innerText still carries the
     source file's line breaks and indentation, so a raw comparison reports every
     off-screen slide as edited the moment it is first rendered. */
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();

  function snapshotText() {
    slides.forEach((s, k) => s.querySelectorAll(EDITABLE).forEach(el => {
      originals.set(el, { slide: k + 1, text: norm(el.textContent) });
    }));
  }

  function collectEdits() {
    const out = [];
    slides.forEach((s, k) => s.querySelectorAll(EDITABLE).forEach(el => {
      const o = originals.get(el);
      if (!o) return;
      const now = norm(el.textContent);
      if (now !== o.text) {
        const cls = (el.getAttribute('class') || '').split(' ')[0];
        out.push({ slide: k + 1, sel: cls ? '.' + cls : el.tagName.toLowerCase(),
                   was: o.text, now });
      }
    }));
    return out;
  }

  function buildPrompt() {
    renumber();
    const edits = collectEdits();
    const L = [];
    L.push(`Deck review — ${document.title}`);
    L.push(`${location.href}`);
    L.push(`${slides.length} slides · ${notes.length} comment${notes.length === 1 ? '' : 's'} · ${edits.length} text edit${edits.length === 1 ? '' : 's'}`);
    if (notes.length) {
      L.push('', 'COMMENTS');
      notes.slice().sort((a, b) => a.slide - b.slide || a.y - b.y).forEach(nt => {
        L.push(`[${nt.n}] slide ${nt.slide} @ (${nt.x}, ${nt.y})` +
               (nt.near ? ` near ${nt.near} "${nt.nearText}"` : ''));
        L.push(`    ${nt.text}`);
      });
    }
    if (edits.length) {
      L.push('', 'TEXT EDITS');
      edits.forEach(e => {
        L.push(`slide ${e.slide} ${e.sel}`);
        L.push(`    was: ${e.was}`);
        L.push(`    now: ${e.now}`);
      });
    }
    if (!notes.length && !edits.length) L.push('', 'No comments or edits yet.');
    L.push('', 'Apply these to index.src.html, rebuild and ship.');
    return L.join('\n');
  }

  function copyPrompt() {
    const text = buildPrompt();
    const done = () => {
      const b = nav && nav.querySelector('[data-copy]');
      if (!b) return;
      const was = b.textContent;
      b.textContent = 'copied';
      setTimeout(() => { b.textContent = was; updateCount(); }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (_) { window.prompt('Copy this:', text); }
    ta.remove();
  }

  function clearNotes() {
    if (!notes.length) return;
    if (!confirm(`Clear all ${notes.length} comments?`)) return;
    notes = []; saveNotes(); renderPins();
  }

  function key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // while typing, only Escape is a shortcut
    if (REVIEW && editing && e.target && e.target.isContentEditable) {
      if (e.key === 'Escape') { e.target.blur(); setEditing(false); }
      return;
    }
    if (REVIEW && editing && (e.key === 'e' || e.key === 'E' || e.key === 'Escape')) {
      e.preventDefault(); setEditing(false); return;
    }
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown':
        e.preventDefault(); show(i + 1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
        e.preventDefault(); show(i - 1); break;
      case 'Home': e.preventDefault(); show(0); break;
      case 'End': e.preventDefault(); show(slides.length - 1); break;
      case 'f': case 'F':
        document.fullscreenElement ? document.exitFullscreen()
                                   : document.documentElement.requestFullscreen();
        break;
      case 'o': case 'O': toggleGrid(); break;
      case 'e': case 'E': if (REVIEW) { e.preventDefault(); setEditing(true); } break;
      case 'c': case 'C': if (REVIEW) { e.preventDefault(); setCommenting(!commenting); } break;
      case 'Escape': toggleGrid(false); setCommenting(false); break;
    }
  }

  function init() {
    slides = Array.from(document.querySelectorAll('#deck .slide'));
    slides.forEach((el, k) => {
      if (!el.querySelector('.logo')) {
        const l = document.createElement('div'); l.className = 'logo'; el.appendChild(l);
      }
      if (!el.querySelector('.pagenum') && !el.classList.contains('no-num')) {
        const p = document.createElement('div'); p.className = 'pagenum';
        p.textContent = k + 1; el.appendChild(p);
      }
    });
    fit();
    if (REVIEW) {
      snapshotText();
      loadNotes();
      bindNoteClicks();
      renderPins();
    }
    const start = parseInt(location.hash.slice(1), 10);
    show(Number.isFinite(start) && start > 0 ? start - 1 : 0, false);

    /* Re-fit on every event that can change the box: a first paint that lands
       before the pane has settled would otherwise freeze the deck at the wrong scale. */
    const refit = () => { fit(); fitGrid(); };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    window.addEventListener('load', refit);
    document.addEventListener('fullscreenchange', refit);
    if (window.ResizeObserver) new ResizeObserver(refit).observe(deck);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    document.addEventListener('keydown', key);
    if (nav) {
      nav.querySelector('[data-prev]') && (nav.querySelector('[data-prev]').onclick = () => show(i - 1));
      nav.querySelector('[data-next]') && (nav.querySelector('[data-next]').onclick = () => show(i + 1));
      nav.querySelector('[data-grid]') && (nav.querySelector('[data-grid]').onclick = () => toggleGrid());
      nav.querySelector('[data-full]') && (nav.querySelector('[data-full]').onclick = () =>
        document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
      nav.querySelector('[data-edit]') && (nav.querySelector('[data-edit]').onclick = () => setEditing(!editing));
      nav.querySelector('[data-comment]') && (nav.querySelector('[data-comment]').onclick = () => setCommenting(!commenting));
      nav.querySelector('[data-copy]') && (nav.querySelector('[data-copy]').onclick = copyPrompt);
      nav.querySelector('[data-clear]') && (nav.querySelector('[data-clear]').onclick = clearNotes);
    }
    // reveal nav briefly on load
    nav && (nav.classList.add('show'), setTimeout(() => nav.classList.remove('show'), 2200));

    let x0 = null;
    deck.addEventListener('touchstart', e => (x0 = e.touches[0].clientX), { passive: true });
    deck.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45) show(i + (dx < 0 ? 1 : -1));
      x0 = null;
    }, { passive: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();

/* WorldFirst deck engine.
   Scales the fixed 960x540 stage to the viewport and handles navigation.

   Keys:  ← → space  step  ·  Home / End  jump  ·  F  fullscreen  ·  O  overview
          E  edit mode    ·  Esc  close overview or leave edit mode
   URL:   #7 opens slide 7                                                          */

(function () {
  const STAGE_W = 960, STAGE_H = 540;
  let slides = [], i = 0, gridOpen = false, editing = false;

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
    const sv = nav && nav.querySelector('[data-save]');
    if (sv) sv.hidden = !on;
  }

  function reindex() {
    slides = Array.from(document.querySelectorAll('#deck .slide'));
    slides.forEach((s, k) => {
      const p = s.querySelector('.pagenum');
      if (p) p.textContent = k + 1;
    });
    if (grid) { grid.innerHTML = ''; delete grid.dataset.built; }
    fit();
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

  /* Rebuild index.src.html from the live DOM and hand it back as a download.
     Injected chrome (logo, page number, edit tools) is stripped so a rebuild
     does not double it up. */
  function saveSource() {
    const copy = document.getElementById('deck').cloneNode(true);
    copy.querySelectorAll('.logo, .pagenum, .slide-tools').forEach(e => e.remove());
    copy.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
    copy.querySelectorAll('.slide').forEach(e => {
      e.classList.remove('active');
      if (!e.getAttribute('style')) e.removeAttribute('style');
    });
    const lang = document.documentElement.getAttribute('lang') || 'en';
    const src =
`<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${document.title}</title>
<link rel="stylesheet" href="wf-deck.css">
</head>
<body>

${copy.outerHTML}

<div id="nav">
  <button data-prev>&lsaquo;</button>
  <span id="counter"></span>
  <button data-next>&rsaquo;</button>
  <button data-grid>grid</button>
  <button data-full>full</button>
  <button data-edit>edit</button>
  <button data-save hidden>save</button>
</div>
<div id="grid"></div>

<script src="wf-deck.js"><\/script>
</body>
</html>
`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'index.src.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // while typing, only Escape is a shortcut
    if (editing && e.target && e.target.isContentEditable) {
      if (e.key === 'Escape') { e.target.blur(); setEditing(false); }
      return;
    }
    if (editing && (e.key === 'e' || e.key === 'E' || e.key === 'Escape')) {
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
      case 'e': case 'E': e.preventDefault(); setEditing(true); break;
      case 'Escape': toggleGrid(false); break;
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
      nav.querySelector('[data-save]') && (nav.querySelector('[data-save]').onclick = saveSource);
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

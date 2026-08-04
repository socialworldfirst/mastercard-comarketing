/* WorldFirst deck engine.
   Scales the fixed 960x540 stage to the viewport and handles navigation.

   Keys:  ← → space  step   ·  Home / End  jump  ·  F  fullscreen  ·  O or Esc  overview
   URL:   #7 opens slide 7                                                          */

(function () {
  const STAGE_W = 960, STAGE_H = 540;
  let slides = [], i = 0, gridOpen = false;

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

  function key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
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

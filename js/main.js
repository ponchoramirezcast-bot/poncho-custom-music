/* ============================================================
   PONCHO CUSTOM MUSIC — Shared Utilities
   Cursor, nav, scroll animations, toasts, URL helpers
   ============================================================ */

/* ---- Custom Cursor --------------------------------------- */
function initCursor() {
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  // Disable on touch/stylus devices
  if (window.matchMedia('(hover: none)').matches) {
    dot.style.display  = 'none';
    ring.style.display = 'none';
    document.body.style.cursor = 'auto';
    document.querySelectorAll('*').forEach(el => el.style.cursor = '');
    return;
  }

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
  });

  // Smooth ring follow
  (function animRing() {
    rx += (mx - rx) * 0.13;
    ry += (my - ry) * 0.13;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(animRing);
  })();

  // Hover effect on interactive elements
  const interactors = 'a, button, [role="button"], .mood-chip, .addon-check, .plan-card, .player-btn, .player-bar';
  document.addEventListener('mouseover', e => {
    if (e.target.closest(interactors)) {
      dot.classList.add('hover');
      ring.classList.add('hover');
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest(interactors)) {
      dot.classList.remove('hover');
      ring.classList.remove('hover');
    }
  });
}

/* ---- Navigation Hamburger -------------------------------- */
function initNav() {
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  if (!hamburger || !navLinks) return;

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
    document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
  });

  // Close on link click (mobile)
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

/* ---- Scroll Animations (IntersectionObserver) ------------ */
function initScrollAnimations() {
  const els = document.querySelectorAll('[data-animate]');
  if (!els.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger via inline delay if data-delay set
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('animate-in');
        }, delay);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  els.forEach(el => observer.observe(el));
}

/* ---- Toast Notifications --------------------------------- */
let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration ms
 */
function showToast(message, type = 'info', duration = 4000) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

/* ---- URL Param Helper ------------------------------------ */
/**
 * Get a URL search parameter value.
 * @param {string} name
 * @returns {string|null}
 */
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/* ---- Format currency ------------------------------------- */
function formatMXN(amount) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount);
}

/* ---- Format date ----------------------------------------- */
function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('es-MX', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/* ---- Truncate text --------------------------------------- */
function truncate(str, n = 40) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
}

/* ---- Init on DOM ready ----------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initCursor();
  initNav();
  initScrollAnimations();
});

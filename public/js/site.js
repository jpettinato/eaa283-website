// EAA Chapter 283 — shared site behavior: announcement bar, mobile nav, API helper.

// Small fetch wrapper all pages use. Throws on non-2xx with the server's error message.
async function api(path, options) {
  const opts = Object.assign({ headers: {} }, options);
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const msg = (data && data.error) || ('Request failed (' + res.status + ')');
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Format 'YYYY-MM-DD' (or ISO datetime) without timezone surprises.
function fmtDate(ds, opts) {
  const p = String(ds).slice(0, 10).split('-');
  const d = new Date(+p[0], +p[1] - 1, +p[2]);
  return d.toLocaleDateString('en-US', opts || { month: 'long', day: 'numeric', year: 'numeric' });
}

document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Announcement bar — text managed from the admin portal. Dismissal is remembered
  // per-announcement (keyed by updated_at) so a new announcement reappears.
  const bar = document.getElementById('announce-bar');
  if (bar) {
    api('/api/banner').then((b) => {
      if (!b || !b.active || !b.text) return;
      let dismissedKey = null;
      try { dismissedKey = localStorage.getItem('eaa283_ann_dismissed'); } catch (e) {}
      if (dismissedKey === b.updated_at) return;
      bar.querySelector('span').textContent = b.text;
      // Slide open smoothly rather than shoving the page down.
      bar.classList.add('announce-anim');
      bar.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('show')));
      bar.querySelector('button').addEventListener('click', () => {
        try { localStorage.setItem('eaa283_ann_dismissed', b.updated_at); } catch (e) {}
        bar.classList.remove('show');
        setTimeout(() => { bar.hidden = true; }, 350);
      });
    }).catch(() => { /* API unavailable (e.g. static preview) — no banner */ });
  }
});

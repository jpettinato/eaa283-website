// Events page — public calendar + detail panel + upcoming list.
// Vanilla-JS port of the Events.dc.html component logic; events come from /api/events.

document.addEventListener('DOMContentLoaded', async () => {
  const KIND = { 'Meeting': '#0A5BC4', 'Young Eagles': '#0E7C66', 'Fly-In': '#C77A12', 'Board': '#6D3FB0', 'Build': '#C77A12' };
  const calTitle = document.getElementById('cal-title');
  const calBody = document.getElementById('cal-body');
  const detail = document.getElementById('event-detail');
  const upcoming = document.getElementById('upcoming-list');

  let EVENTS = [];
  try {
    EVENTS = await api('/api/events');
  } catch (e) {
    calBody.innerHTML = '<div style="padding:24px; color:#8593aa;">Calendar unavailable — please try again later.</div>';
    detail.innerHTML = '';
    upcoming.innerHTML = '<div style="padding:24px; color:#8593aa; background:#fff;">Calendar unavailable — please try again later.</div>';
    return;
  }
  EVENTS.sort((a, b) => a.date.localeCompare(b.date));

  const parts = (ds) => { const p = ds.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; };
  const fmtFull = (ds) => { const { y, m, d } = parts(ds); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); };
  const monShort = (ds) => { const { y, m, d } = parts(ds); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short' }).toUpperCase(); };

  // Start on the month of the next upcoming event (or today's month).
  const todayStr = new Date().toISOString().slice(0, 10);
  const firstUpcoming = EVENTS.find(e => e.date >= todayStr) || EVENTS[EVENTS.length - 1];
  let y, m, sel;
  if (firstUpcoming) {
    y = parts(firstUpcoming.date).y; m = parts(firstUpcoming.date).m - 1; sel = firstUpcoming.id;
  } else {
    const now = new Date(); y = now.getFullYear(); m = now.getMonth(); sel = null;
  }

  function render() {
    calTitle.textContent = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const evByDate = {};
    EVENTS.forEach(e => { (evByDate[e.date] = evByDate[e.date] || []).push(e); });

    const startDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();
    const raw = [];
    for (let i = startDow - 1; i >= 0; i--) raw.push({ day: prevDays - i, inMonth: false, dateStr: null });
    for (let d = 1; d <= daysInMonth; d++) raw.push({ day: d, inMonth: true, dateStr: y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0') });
    let nd = 1; while (raw.length % 7 !== 0) raw.push({ day: nd++, inMonth: false, dateStr: null });

    let html = '';
    for (let i = 0; i < raw.length; i += 7) {
      html += '<div style="display:grid; grid-template-columns:repeat(7,1fr); border-bottom:1px solid #eef1f6;">';
      for (const c of raw.slice(i, i + 7)) {
        const evs = (c.dateStr && evByDate[c.dateStr]) || [];
        const hasSel = evs.some(e => e.id === sel);
        const bg = hasSel ? '#EAF1FB' : (c.inMonth ? '#fff' : '#fafbfd');
        html += '<div class="cal-day-cell" style="border-right:1px solid #eef1f6; padding:8px; display:flex; flex-direction:column; gap:5px; background:' + bg + ';">' +
          '<span style="font-size:13px; font-weight:700; margin-bottom:2px; color:' + (c.inMonth ? '#16203A' : '#c2cad8') + ';">' + c.day + '</span>';
        for (const e of evs) {
          const color = KIND[e.kind] || '#0A5BC4';
          const ring = e.id === sel ? ' box-shadow:0 0 0 2.5px rgba(10,91,196,.32);' : '';
          html += '<button data-ev="' + e.id + '" style="text-align:left; border:none; cursor:pointer; background:' + color + '; color:#fff; font-family:inherit; font-size:11.5px; font-weight:600; padding:4px 8px; border-radius:6px; line-height:1.25; width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;' + ring + '">' + escapeHtml(e.title) + '</button>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    calBody.innerHTML = html;

    const found = EVENTS.find(e => e.id === sel);
    if (found) {
      const color = KIND[found.kind] || '#0A5BC4';
      const mailto = 'mailto:EAAchapter283@gmail.com?subject=' + encodeURIComponent('RSVP: ' + found.title);
      detail.innerHTML =
        '<div style="border:1px solid #e7ecf3; border-radius:16px; overflow:hidden;">' +
          '<div class="ph" style="height:170px; border-radius:0;"><span>PHOTO — event flyer / photo</span></div>' +
          '<div style="padding:26px;">' +
            '<span style="display:inline-block; background:' + color + '; color:#fff; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; padding:5px 12px; border-radius:30px; margin-bottom:14px;">' + escapeHtml(found.kind) + '</span>' +
            '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:26px; line-height:1.15; color:#16203A; margin:0 0 18px;">' + escapeHtml(found.title) + '</h3>' +
            '<div style="display:flex; flex-direction:column; gap:14px; margin-bottom:20px;">' +
              '<div><div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#8593aa; margin-bottom:2px;">Date</div>' +
              '<div style="font-size:16px; color:#16203A; font-weight:600;">' + fmtFull(found.date) + '</div></div>' +
              '<div><div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#8593aa; margin-bottom:2px;">Time</div>' +
              '<div style="font-size:16px; color:#16203A; font-weight:600;">' + escapeHtml(found.start_time + (found.end_time ? ' – ' + found.end_time : '')) + '</div></div>' +
              '<div><div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#8593aa; margin-bottom:2px;">Location</div>' +
              '<div style="font-size:16px; color:#16203A; font-weight:600;">' + escapeHtml(found.location) + '</div></div>' +
            '</div>' +
            '<p style="font-size:16px; line-height:1.7; color:#51607c; margin:0 0 24px;">' + escapeHtml(found.description) + '</p>' +
            '<div style="display:flex; gap:12px; flex-wrap:wrap;">' +
              '<a href="' + mailto + '" class="cta-primary" style="padding:13px 22px; font-size:16px; border-radius:10px;">RSVP</a>' +
              '<a href="location.html" class="cta-outline" style="padding:11px 22px; border-radius:10px;">View location</a>' +
            '</div>' +
          '</div>' +
        '</div>';
    } else {
      detail.innerHTML = '';
    }

    const ups = EVENTS.filter(e => e.date >= todayStr);
    upcoming.innerHTML = ups.length ? ups.map(e => {
      const color = KIND[e.kind] || '#0A5BC4';
      const sub = fmtFull(e.date) + ' · ' + e.start_time + (e.end_time ? ' – ' + e.end_time : '') + ' · ' + e.location;
      return '<button data-ev="' + e.id + '" class="ev-row" style="width:100%; text-align:left; background:#fff; border:none; border-bottom:1px solid #eef1f6; padding:20px 24px; display:flex; gap:22px; align-items:center; cursor:pointer; font-family:inherit;">' +
        '<div style="text-align:center; min-width:58px;">' +
          '<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; color:' + color + ';">' + monShort(e.date) + '</div>' +
          '<div style="font-family:\'Archivo\',sans-serif; font-weight:900; font-size:30px; line-height:1; color:#16203A;">' + parts(e.date).d + '</div>' +
        '</div>' +
        '<div style="flex:1;">' +
          '<div style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A; margin-bottom:3px;">' + escapeHtml(e.title) + '</div>' +
          '<div style="font-size:15px; color:#51607c;">' + escapeHtml(sub) + '</div>' +
        '</div>' +
        '<span style="color:#0A5BC4; font-weight:700; font-size:15px; white-space:nowrap;">Details →</span>' +
      '</button>';
    }).join('') : '<div style="padding:24px; color:#8593aa; background:#fff;">No upcoming events scheduled — check back soon.</div>';
  }

  function selectEvent(id) {
    const e = EVENTS.find(x => x.id === id);
    if (!e) return;
    sel = id;
    const p = parts(e.date);
    y = p.y; m = p.m - 1;
    render();
  }

  document.getElementById('cal-prev').addEventListener('click', () => { m--; if (m < 0) { m = 11; y--; } render(); });
  document.getElementById('cal-next').addEventListener('click', () => { m++; if (m > 11) { m = 0; y++; } render(); });
  document.body.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-ev]');
    if (btn) selectEvent(+btn.getAttribute('data-ev'));
  });

  render();
  // Ease the freshly-rendered content in over the skeletons (first paint only).
  calBody.classList.add('fade-in');
  detail.classList.add('fade-in');
  upcoming.classList.add('fade-in');
});

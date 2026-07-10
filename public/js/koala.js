// Koala build page — renders admin-managed intro/stats, build phases, and photo gallery.

document.addEventListener('DOMContentLoaded', async () => {
  const STATUS_LABEL = {
    complete: '<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#0E7C66; margin-bottom:10px;">✓ Complete</div>',
    in_progress: '<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#0A5BC4; margin-bottom:10px;">● In progress</div>',
    upcoming: '<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#8593aa; margin-bottom:10px;">○ Up next</div>',
  };

  const infoBox = document.getElementById('koala-info');
  const gallery = document.getElementById('koala-gallery');
  const phasesBox = document.getElementById('koala-phases');
  const ctaText = document.getElementById('koala-cta-text');

  let data;
  try {
    data = await api('/api/koala');
  } catch (e) {
    infoBox.innerHTML = '<p style="color:#8593aa;">Koala build details are unavailable right now — please try again later.</p>';
    gallery.innerHTML = '';
    phasesBox.innerHTML = '<div style="color:#8593aa;">Unavailable right now.</div>';
    return;
  }

  const info = data.info || {};
  const phases = data.phases || [];
  const photos = data.photos || [];

  infoBox.innerHTML =
    '<h2 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:32px; line-height:1.15; letter-spacing:-0.02em; color:#16203A; margin:0 0 18px;">What is the Koala?</h2>' +
    '<p style="font-size:17.5px; line-height:1.75; color:#51607c; margin:0 0 28px; white-space:pre-line;">' + escapeHtml(info.intro || '') + '</p>' +
    '<div style="display:flex; gap:24px; flex-wrap:wrap;">' +
      '<div><div style="font-family:\'Archivo\',sans-serif; font-weight:900; font-size:30px; color:#0A5BC4;">' + escapeHtml(info.stat1_value || '') + '</div><div style="font-size:14px; color:#8593aa; font-weight:600;">' + escapeHtml(info.stat1_label || '') + '</div></div>' +
      '<div style="border-left:1px solid #e0e6ef; padding-left:24px;"><div style="font-family:\'Archivo\',sans-serif; font-weight:900; font-size:30px; color:#0A5BC4;">' + escapeHtml(info.stat2_value || '') + '</div><div style="font-size:14px; color:#8593aa; font-weight:600;">' + escapeHtml(info.stat2_label || '') + '</div></div>' +
      '<div style="border-left:1px solid #e0e6ef; padding-left:24px;"><div style="font-family:\'Archivo\',sans-serif; font-weight:900; font-size:30px; color:#0A5BC4;">' + escapeHtml(info.stat3_value || '') + '</div><div style="font-size:14px; color:#8593aa; font-weight:600;">' + escapeHtml(info.stat3_label || '') + '</div></div>' +
    '</div>';
  infoBox.classList.add('fade-in');

  if (photos.length) {
    gallery.innerHTML = photos.slice(0, 4).map((p) =>
      '<img src="/api/koala/photos/' + p.id + '" alt="' + escapeHtml(p.caption || 'Koala build photo') + '" style="width:100%; height:165px; object-fit:cover; border-radius:10px;">'
    ).join('');
  } else {
    gallery.innerHTML = '<div class="ph" style="grid-column:1 / -1; height:165px;"><span>Photos coming soon</span></div>';
  }
  gallery.classList.add('fade-in');

  phasesBox.innerHTML = phases.length ? phases.map((p) => {
    const highlight = p.status === 'in_progress';
    return '<div style="background:#fff; border:1px solid ' + (highlight ? '#0A5BC4' : '#e7ecf3') + '; border-radius:14px; padding:24px;' + (highlight ? ' box-shadow:0 8px 22px -12px rgba(10,91,196,.4);' : '') + '">' +
      (STATUS_LABEL[p.status] || STATUS_LABEL.upcoming) +
      '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:18px; color:#16203A; margin:0 0 6px;">' + escapeHtml(p.name) + '</h3>' +
      '<p style="font-size:14.5px; line-height:1.6; color:#51607c; margin:0;">' + escapeHtml(p.description) + '</p>' +
    '</div>';
  }).join('') : '<div style="color:#8593aa;">Build phases will be posted here soon.</div>';
  phasesBox.classList.add('fade-in');

  ctaText.textContent = info.cta_text || '';
});

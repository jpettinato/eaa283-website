// News page — renders admin-published posts, the public newsletter archive,
// and handles the subscribe form.

document.addEventListener('DOMContentLoaded', () => {
  const TAG_STYLE = {
    'Announcement': 'background:#0A5BC4; color:#fff;',
    'Project': 'background:#EAF1FB; color:#0A5BC4;',
    'Event': 'background:#E3F1ED; color:#0E7C66;',
    'Chapter': 'background:#EAF1FB; color:#0A5BC4;',
  };
  const tagChip = (tag, big) =>
    '<span style="' + (TAG_STYLE[tag] || TAG_STYLE.Chapter) + ' font-size:' + (big ? '12px' : '11px') +
    '; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; padding:' + (big ? '5px 12px' : '4px 10px') +
    '; border-radius:30px;">' + escapeHtml(tag) + '</span>';

  const featured = document.getElementById('featured-post');
  const recent = document.getElementById('recent-posts');

  api('/api/posts').then((posts) => {
    posts = posts || [];
    if (!posts.length) {
      featured.innerHTML = '<div style="border:1px solid #e7ecf3; border-radius:16px; padding:40px; color:#8593aa;">No news yet — check back soon.</div>';
      recent.innerHTML = '';
      featured.classList.add('fade-in');
      return;
    }
    const [first, ...rest] = posts;

    featured.innerHTML =
      '<div class="post-card g2" style="display:grid; grid-template-columns:1fr 1fr; align-items:stretch;">' +
        '<div class="ph" style="min-height:300px; border-radius:0;"><span>PHOTO — featured story image</span></div>' +
        '<div style="padding:44px 40px; display:flex; flex-direction:column; justify-content:center;">' +
          '<div style="display:flex; gap:12px; align-items:center; margin-bottom:16px;">' + tagChip(first.tag, true) +
            '<span style="font-size:14px; color:#8593aa; font-weight:600;">' + fmtDate(first.published_at) + '</span></div>' +
          '<h2 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:32px; line-height:1.15; letter-spacing:-0.02em; color:#16203A; margin:0 0 14px;">' + escapeHtml(first.title) + '</h2>' +
          '<p style="font-size:17px; line-height:1.7; color:#51607c; margin:0; white-space:pre-line;">' + escapeHtml(first.body) + '</p>' +
        '</div>' +
      '</div>';

    recent.innerHTML = rest.slice(0, 6).map((p) =>
      '<div class="post-card">' +
        '<div class="ph" style="height:170px; border-radius:0;"><span>PHOTO</span></div>' +
        '<div style="padding:24px;">' +
          '<div style="display:flex; gap:10px; align-items:center; margin-bottom:12px;">' + tagChip(p.tag) +
            '<span style="font-size:13px; color:#8593aa; font-weight:600;">' + fmtDate(p.published_at) + '</span></div>' +
          '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:20px; line-height:1.25; color:#16203A; margin:0 0 8px;">' + escapeHtml(p.title) + '</h3>' +
          '<p style="font-size:15px; line-height:1.6; color:#51607c; margin:0; white-space:pre-line;">' + escapeHtml(p.body) + '</p>' +
        '</div>' +
      '</div>'
    ).join('');
    featured.classList.add('fade-in');
    recent.classList.add('fade-in');
  }).catch(() => {
    featured.innerHTML = '<div style="border:1px solid #e7ecf3; border-radius:16px; padding:40px; color:#8593aa;">News is unavailable right now — please try again later.</div>';
    recent.innerHTML = '';
  });

  // Public newsletter archive (documents uploaded in the admin portal, category "newsletter", public)
  const nlList = document.getElementById('newsletter-list');
  api('/api/newsletters').then((docs) => {
    docs = docs || [];
    if (!docs.length) {
      nlList.innerHTML = '<div style="padding:24px; color:#8593aa;">No public newsletters posted yet.</div>';
      nlList.classList.add('fade-in');
      return;
    }
    nlList.classList.add('fade-in');
    nlList.innerHTML = docs.map((d) =>
      '<a href="/api/documents/' + d.id + '" class="nl-row" style="display:flex; align-items:center; gap:20px; padding:20px 24px; border-bottom:1px solid #eef1f6; background:#fff;">' +
        '<div style="width:44px; height:54px; border-radius:7px; background:#EAF1FB; color:#0A5BC4; display:flex; align-items:center; justify-content:center; font-family:\'Archivo\',sans-serif; font-weight:900; font-size:12px; flex-shrink:0;">PDF</div>' +
        '<div style="flex:1;">' +
          '<div style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:18px; color:#16203A;">' + escapeHtml(d.name) + '</div>' +
          '<div style="font-size:14px; color:#8593aa;">Published ' + fmtDate(d.posted_at) + '</div>' +
        '</div>' +
        '<span style="color:#0A5BC4; font-weight:700; font-size:15px;">Download →</span>' +
      '</a>'
    ).join('');
  }).catch(() => {
    nlList.innerHTML = '<div style="padding:24px; color:#8593aa;">Newsletter archive unavailable right now.</div>';
  });

  // Subscribe form
  const form = document.getElementById('subscribe-form');
  const msg = document.getElementById('subscribe-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('subscribe-email').value.trim();
    if (!email) return;
    try {
      await api('/api/subscribe', { method: 'POST', body: { email } });
      msg.style.color = '#9fe0c8';
      msg.textContent = "You're on the list — thanks!";
      form.reset();
    } catch (err) {
      msg.style.color = '#ffb4a8';
      msg.textContent = err.message;
    }
  });
});

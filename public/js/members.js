// Member portal — login/signup + dashboard (overview, documents, directory, dues,
// members' newsletters, calendar & RSVP). All data comes from the /api backend.

document.addEventListener('DOMContentLoaded', () => {
  const authSection = document.getElementById('auth-section');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const signupDone = document.getElementById('signup-done');
  const authSwitch = document.getElementById('auth-switch');
  const authBlurb = document.getElementById('auth-blurb');

  let me = null;

  const H = (id) => document.getElementById(id);
  const showError = (id, msg) => { const el = H(id); el.textContent = msg; el.style.display = 'block'; };
  const hideError = (id) => { H(id).style.display = 'none'; };

  const docIcon = '<div style="width:40px; height:50px; border-radius:6px; background:#EAF1FB; color:#0A5BC4; display:flex; align-items:center; justify-content:center; font-family:\'Archivo\',sans-serif; font-weight:900; font-size:11px; flex-shrink:0;">PDF</div>';
  const CAT_LABEL = { minutes: 'Meeting minutes', agenda: 'Agenda', newsletter: 'Newsletter', reference: 'Reference' };
  const TAGC = { 'Meeting': '#0A5BC4', 'Board': '#6D3FB0', 'Build': '#C77A12', 'Young Eagles': '#0E7C66', 'Fly-In': '#C77A12' };
  const h2 = (t) => '<h2 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:30px; letter-spacing:-0.02em; color:#16203A; margin:0 0 8px;">' + t + '</h2>';
  const sub = (t) => '<p style="font-size:16px; color:#51607c; margin:0 0 24px;">' + t + '</p>';
  const empty = (t) => '<div style="padding:24px; color:#8593aa; background:#fff; border:1px solid #e7ecf3; border-radius:16px;">' + t + '</div>';
  const skelRows = (n, h) => Array.from({ length: n }, () =>
    '<div class="skeleton" style="height:' + (h || 68) + 'px; margin-bottom:12px;"></div>').join('');
  const fadeWrap = (html) => '<div class="fade-in">' + html + '</div>';

  const docRow = (d, extraMeta) =>
    '<a href="/api/documents/' + d.id + '" class="doc-row" style="display:flex; align-items:center; gap:18px; padding:18px 22px; border-bottom:1px solid #eef1f6; background:#fff;">' +
      docIcon +
      '<div style="flex:1;"><div style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:17px; color:#16203A;">' + escapeHtml(d.name) + '</div>' +
      '<div style="font-size:14px; color:#8593aa;">' + escapeHtml(extraMeta) + '</div></div>' +
      '<span style="color:#0A5BC4; font-weight:700; font-size:15px;">Download →</span>' +
    '</a>';

  // ---------- auth ----------

  document.getElementById('show-signup').addEventListener('click', (e) => {
    e.preventDefault();
    const showingLogin = !loginForm.hidden;
    loginForm.hidden = showingLogin;
    signupForm.hidden = !showingLogin;
    signupDone.hidden = true;
    authBlurb.textContent = showingLogin
      ? 'Request an account — a chapter administrator verifies your membership before access is granted.'
      : 'Sign in to access chapter documents, the member directory, dues, and more.';
    document.getElementById('show-signup').textContent = showingLogin ? '← Back to sign in' : 'Create an account →';
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('login-error');
    try {
      const res = await api('/api/login', {
        method: 'POST',
        body: { email: H('login-email').value.trim(), password: H('login-password').value },
      });
      me = res.user;
      openDashboard();
    } catch (err) {
      showError('login-error', err.message);
    }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('signup-error');
    try {
      await api('/api/signup', {
        method: 'POST',
        body: {
          name: H('signup-name').value.trim(),
          email: H('signup-email').value.trim(),
          password: H('signup-password').value,
        },
      });
      signupForm.hidden = true;
      signupDone.hidden = false;
      authSwitch.querySelector('a').textContent = '← Back to sign in';
    } catch (err) {
      showError('signup-error', err.message);
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
    me = null;
    dashboard.hidden = true;
    authSection.hidden = false;
  });

  // Gatekeeper: nothing shows until we know whether the visitor is signed in,
  // so a returning member never sees the login card flash before the dashboard.
  const portalLoading = document.getElementById('portal-loading');
  api('/api/me')
    .then((u) => { me = u; openDashboard(); })
    .catch(() => { authSection.hidden = false; })
    .finally(() => { portalLoading.hidden = true; });

  // ---------- dashboard ----------

  function openDashboard() {
    authSection.hidden = true;
    dashboard.hidden = false;
    document.getElementById('member-name').textContent = me.name;
    document.getElementById('admin-link').hidden = me.role !== 'admin';
    selectTab('overview');
  }

  document.getElementById('portal-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.side-btn');
    if (btn) selectTab(btn.getAttribute('data-tab'));
  });

  function selectTab(tab) {
    document.querySelectorAll('#portal-nav .side-btn').forEach((b) =>
      b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    ['overview', 'docs', 'directory', 'dues', 'news', 'calendar'].forEach((t) =>
      H('tab-' + t).hidden = t !== tab);
    ({ overview: renderOverview, docs: renderDocs, directory: renderDirectory,
       dues: renderDues, news: renderNews, calendar: renderCalendar })[tab]();
  }

  async function renderOverview() {
    const pane = H('tab-overview');
    pane.innerHTML = h2('Overview') +
      '<div class="g2" style="display:grid; grid-template-columns:repeat(2,1fr); gap:20px; margin-bottom:20px;">' +
      '<div class="skeleton" style="height:120px;"></div><div class="skeleton" style="height:120px;"></div></div>' +
      '<div class="skeleton" style="height:190px;"></div>';
    const year = new Date().getFullYear();
    const [dues, events, docs] = await Promise.all([
      api('/api/member/dues').catch(() => []),
      api('/api/member/events').catch(() => []),
      api('/api/member/documents').catch(() => []),
    ]);

    const cur = (dues || []).find((d) => d.year === year);
    const paid = cur && (cur.status === 'paid' || cur.status === 'exempt');
    const duesCard = paid
      ? '<div style="background:#E3F1ED; border-radius:16px; padding:26px;">' +
          '<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#0E7C66; margin-bottom:8px;">Your dues</div>' +
          '<div style="font-family:\'Archivo\',sans-serif; font-weight:900; font-size:26px; color:#16203A; margin-bottom:4px;">' + (cur.status === 'exempt' ? 'Exempt' : 'Paid ✓') + '</div>' +
          '<div style="font-size:15px; color:#51607c;">Active through Dec 31, ' + year + '</div></div>'
      : '<div style="background:#FDF3E3; border-radius:16px; padding:26px;">' +
          '<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#C77A12; margin-bottom:8px;">Your dues</div>' +
          '<div style="font-family:\'Archivo\',sans-serif; font-weight:900; font-size:26px; color:#16203A; margin-bottom:4px;">' + year + ' dues not paid</div>' +
          '<div style="font-size:15px; color:#51607c;">See the Dues tab for details</div></div>';

    const todayStr = new Date().toISOString().slice(0, 10);
    const next = (events || []).filter((e) => e.date >= todayStr)[0];
    const nextCard = next
      ? '<div style="background:#EAF1FB; border-radius:16px; padding:26px;">' +
          '<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#0A5BC4; margin-bottom:8px;">Next event</div>' +
          '<div style="font-family:\'Archivo\',sans-serif; font-weight:900; font-size:22px; color:#16203A; margin-bottom:4px;">' + escapeHtml(next.title) + '</div>' +
          '<div style="font-size:15px; color:#51607c;">' + fmtDate(next.date, { weekday: 'short', month: 'short', day: 'numeric' }) +
          (next.start_time ? ' · ' + escapeHtml(next.start_time) : '') + ' · ' + escapeHtml(next.location) + '</div></div>'
      : '<div style="background:#EAF1FB; border-radius:16px; padding:26px;">' +
          '<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#0A5BC4; margin-bottom:8px;">Next event</div>' +
          '<div style="font-size:15px; color:#51607c;">Nothing scheduled yet — check back soon.</div></div>';

    const latest = (docs || []).slice(0, 2);
    const docsBox =
      '<div style="background:#fff; border:1px solid #e7ecf3; border-radius:16px; padding:28px;">' +
        '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A; margin:0 0 16px;">Latest documents</h3>' +
        (latest.length
          ? '<div style="display:flex; flex-direction:column; gap:12px;">' + latest.map((d) =>
              '<a href="/api/documents/' + d.id + '" class="doc-row" style="display:flex; align-items:center; gap:14px; padding:12px 14px; border:1px solid #eef1f6; border-radius:11px; background:#fff;">' +
                docIcon +
                '<div style="flex:1;"><div style="font-weight:700; color:#16203A; font-size:15.5px;">' + escapeHtml(d.name) + '</div>' +
                '<div style="font-size:13px; color:#8593aa;">Posted ' + fmtDate(d.posted_at) + '</div></div>' +
                '<span style="color:#0A5BC4; font-weight:700; font-size:14px;">Open →</span>' +
              '</a>').join('') + '</div>'
          : '<div style="color:#8593aa; font-size:15px;">No documents posted yet.</div>') +
      '</div>';

    pane.innerHTML = h2('Overview') + fadeWrap(
      '<div class="g2" style="display:grid; grid-template-columns:repeat(2,1fr); gap:20px; margin-bottom:20px;">' + duesCard + nextCard + '</div>' + docsBox);
  }

  async function renderDocs() {
    const pane = H('tab-docs');
    const head = h2('Documents &amp; minutes') + sub('Meeting minutes, agendas, bylaws, and chapter reference materials.');
    pane.innerHTML = head + skelRows(4);
    const docs = await api('/api/member/documents').catch(() => []);
    pane.innerHTML = head + fadeWrap(docs.length
      ? '<div style="border:1px solid #e7ecf3; border-radius:16px; overflow:hidden;">' +
          docs.map((d) => docRow(d, (CAT_LABEL[d.category] || 'Document') + ' · Posted ' + fmtDate(d.posted_at))).join('') + '</div>'
      : empty('No documents have been uploaded yet.'));
  }

  async function renderDirectory() {
    const pane = H('tab-directory');
    const head = h2('Member directory') + sub('Chapter members and officers. Please keep contact details within the chapter.');
    pane.innerHTML = head +
      '<div class="g2" style="display:grid; grid-template-columns:repeat(2,1fr); gap:16px;">' +
      '<div class="skeleton" style="height:88px;"></div><div class="skeleton" style="height:88px;"></div>' +
      '<div class="skeleton" style="height:88px;"></div><div class="skeleton" style="height:88px;"></div></div>';
    const members = await api('/api/member/directory').catch(() => []);
    const initials = (n) => n.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
    pane.innerHTML = head + fadeWrap(members.length
        ? '<div class="g2" style="display:grid; grid-template-columns:repeat(2,1fr); gap:16px;">' + members.map((m) =>
            '<div style="display:flex; align-items:center; gap:16px; background:#fff; border:1px solid #e7ecf3; border-radius:14px; padding:18px 20px;">' +
              '<div style="width:50px; height:50px; border-radius:50%; background:#EAF1FB; color:#0A5BC4; display:flex; align-items:center; justify-content:center; font-family:\'Archivo\',sans-serif; font-weight:900; font-size:17px; flex-shrink:0;">' + initials(m.name) + '</div>' +
              '<div style="flex:1;">' +
                '<div style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:17px; color:#16203A;">' + escapeHtml(m.name) + '</div>' +
                '<div style="font-size:14.5px; color:#0A5BC4; font-weight:600;">' + escapeHtml(m.role_title || 'Member') + '</div>' +
                (m.member_since ? '<div style="font-size:13px; color:#8593aa;">Member since ' + escapeHtml(m.member_since) + '</div>' : '') +
              '</div>' +
            '</div>').join('') + '</div>'
        : empty('The directory is empty so far.'));
  }

  async function renderDues() {
    const pane = H('tab-dues');
    const head = h2('Dues &amp; membership') + sub('Annual chapter dues are $50 for members 18 and over. Minors are exempt.');
    pane.innerHTML = head + '<div class="skeleton" style="height:130px; margin-bottom:24px;"></div>' + skelRows(2, 54);
    const dues = await api('/api/member/dues').catch(() => []);
    const year = new Date().getFullYear();
    const cur = dues.find((d) => d.year === year);
    const paid = cur && (cur.status === 'paid' || cur.status === 'exempt');

    const statusCard = paid
      ? '<div style="background:#E3F1ED; border:1px solid #c3e3d8; border-radius:16px; padding:30px; margin-bottom:24px;">' +
          '<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#0E7C66; margin-bottom:6px;">Current status</div>' +
          '<div style="font-family:\'Archivo\',sans-serif; font-weight:900; font-size:28px; color:#16203A; margin-bottom:4px;">' +
            (cur.status === 'exempt' ? 'Exempt for ' + year : 'Paid — active through Dec 31, ' + year) + '</div>' +
          '<div style="font-size:15px; color:#3f7d6c;">Thanks for keeping your membership current, ' + escapeHtml(me.name.split(' ')[0]) + '.</div>' +
        '</div>'
      : '<div style="background:#FDF3E3; border:1px solid #f0ddba; border-radius:16px; padding:30px; margin-bottom:24px;">' +
          '<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#C77A12; margin-bottom:6px;">Current status</div>' +
          '<div style="font-family:\'Archivo\',sans-serif; font-weight:900; font-size:28px; color:#16203A; margin-bottom:4px;">' + year + ' dues not paid</div>' +
          '<div style="font-size:15px; color:#51607c;">Dues can be paid at any chapter meeting or by mail. A chapter officer will update your status once received.</div>' +
        '</div>';

    const history = dues.filter((d) => d.paid_date || d.status !== 'unpaid');
    pane.innerHTML = head + fadeWrap(statusCard +
      '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A; margin:0 0 14px;">Payment history</h3>' +
      (history.length
        ? '<div style="border:1px solid #e7ecf3; border-radius:16px; overflow:hidden;">' + history.map((d) =>
            '<div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:16px 22px; border-bottom:1px solid #eef1f6; background:#fff;">' +
              '<div style="font-weight:700; color:#16203A;">' + d.year + ' Annual Dues</div>' +
              '<div style="color:#51607c;">' + (d.status === 'paid' ? 'Paid' + (d.paid_date ? ' ' + fmtDate(d.paid_date) : '') + ' · $50.00' : d.status.charAt(0).toUpperCase() + d.status.slice(1)) + '</div>' +
            '</div>').join('') + '</div>'
        : empty('No payment history on record yet.')));
  }

  async function renderNews() {
    const pane = H('tab-news');
    const head = h2("Members' newsletters") +
      sub('Member-only bulletins and updates not published publicly. (Public news is on the <a href="news.html" style="color:#0A5BC4; font-weight:600;">News page</a>.)');
    pane.innerHTML = head + skelRows(3, 96);
    const [posts, docs] = await Promise.all([
      api('/api/member/posts').catch(() => []),
      api('/api/member/documents').catch(() => []),
    ]);
    const bulletins = (docs || []).filter((d) => d.category === 'newsletter');
    let html = head;
    if (posts.length) {
      html += '<div style="display:flex; flex-direction:column; gap:14px; margin-bottom:26px;">' + posts.map((p) =>
        '<div style="background:#fff; border:1px solid #e7ecf3; border-radius:14px; padding:22px 24px;">' +
          '<div style="font-size:13px; color:#8593aa; font-weight:600; margin-bottom:6px;">' + fmtDate(p.published_at) + '</div>' +
          '<div style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A; margin-bottom:8px;">' + escapeHtml(p.title) + '</div>' +
          '<p style="font-size:15.5px; line-height:1.65; color:#51607c; margin:0; white-space:pre-line;">' + escapeHtml(p.body) + '</p>' +
        '</div>').join('') + '</div>';
    }
    if (bulletins.length) {
      html += '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A; margin:0 0 14px;">Newsletter PDFs</h3>' +
        '<div style="border:1px solid #e7ecf3; border-radius:16px; overflow:hidden;">' +
        bulletins.map((d) => docRow(d, 'Posted ' + fmtDate(d.posted_at))).join('') + '</div>';
    }
    if (!posts.length && !bulletins.length) html += empty('No member newsletters posted yet.');
    pane.innerHTML = head + fadeWrap(html.slice(head.length));
  }

  async function renderCalendar() {
    const pane = H('tab-calendar');
    const head = h2('Calendar &amp; RSVP') + sub("Upcoming chapter events, including members-only gatherings. Let us know if you're coming.");
    pane.innerHTML = head + skelRows(3, 96);
    const events = await api('/api/member/events').catch(() => []);
    const todayStr = new Date().toISOString().slice(0, 10);
    const ups = events.filter((e) => e.date >= todayStr);
    pane.innerHTML = head + fadeWrap(ups.length
      ? '<div style="display:flex; flex-direction:column; gap:14px;">' + ups.map((e) => {
          const going = !!e.going;
          const btnStyle = going
            ? 'background:#0E7C66; color:#fff; border:none; padding:12px 22px; border-radius:10px; font-weight:700; font-size:15px; cursor:pointer; font-family:inherit; white-space:nowrap;'
            : 'background:#fff; color:#0A5BC4; border:1.5px solid #0A5BC4; padding:11px 22px; border-radius:10px; font-weight:700; font-size:15px; cursor:pointer; font-family:inherit; white-space:nowrap;';
          return '<div style="display:flex; align-items:center; gap:20px; background:#fff; border:1px solid #e7ecf3; border-radius:14px; padding:20px 24px; flex-wrap:wrap;">' +
            '<div style="flex:1; min-width:220px;">' +
              '<span style="display:inline-block; background:' + (TAGC[e.kind] || '#0A5BC4') + '; color:#fff; font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; padding:3px 10px; border-radius:30px; margin-bottom:8px;">' + escapeHtml(e.kind) + '</span>' +
              '<div style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A;">' + escapeHtml(e.title) + '</div>' +
              '<div style="font-size:15px; color:#51607c;">' + fmtDate(e.date, { weekday: 'long', month: 'long', day: 'numeric' }) +
                (e.start_time ? ' · ' + escapeHtml(e.start_time) : '') + ' · ' + escapeHtml(e.location) + '</div>' +
            '</div>' +
            '<button data-rsvp="' + e.id + '" data-going="' + (going ? 1 : 0) + '" style="' + btnStyle + '">' + (going ? '✓ Going' : 'RSVP') + '</button>' +
          '</div>';
        }).join('') + '</div>'
      : empty('No upcoming events scheduled.'));

    pane.querySelectorAll('[data-rsvp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const going = btn.getAttribute('data-going') !== '1';
        btn.disabled = true;
        try {
          await api('/api/member/rsvp', { method: 'POST', body: { event_id: +btn.getAttribute('data-rsvp'), going } });
          renderCalendar();
        } catch (e) {
          btn.disabled = false;
          alert(e.message);
        }
      });
    });
  }
});

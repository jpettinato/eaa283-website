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

  const AUTH_VIEWS = ['login-form', 'signup-form', 'signup-done', 'forgot-step1', 'forgot-step2', 'forgot-done'];
  const BLURBS = {
    'login-form': 'Sign in to access chapter documents, the member directory, dues, and more.',
    'signup-form': 'Request an account — a chapter administrator verifies your membership before access is granted.',
    'signup-done': 'Request an account — a chapter administrator verifies your membership before access is granted.',
    'forgot-step1': "Reset your password using the security question you set at signup.",
    'forgot-step2': 'Answer your security question to choose a new password.',
    'forgot-done': 'Your password has been updated.',
  };
  function showAuthView(id) {
    AUTH_VIEWS.forEach((v) => { H(v).hidden = v !== id; });
    const isLoginFamily = id === 'login-form' || id === 'signup-form' || id === 'signup-done';
    authSwitch.hidden = !isLoginFamily;
    H('back-to-signin').hidden = isLoginFamily;
    authBlurb.textContent = BLURBS[id];
    document.getElementById('show-signup').textContent = id === 'login-form' ? 'Create an account →' : '← Back to sign in';
  }

  document.getElementById('show-signup').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthView(loginForm.hidden ? 'login-form' : 'signup-form');
  });
  document.getElementById('show-forgot').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthView('forgot-step1');
  });
  document.getElementById('show-signin-2').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthView('login-form');
  });

  H('signup-secq').addEventListener('change', () => {
    H('signup-secq-custom').hidden = H('signup-secq').value !== '__custom';
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
    const secQuestion = H('signup-secq').value === '__custom' ? H('signup-secq-custom').value.trim() : H('signup-secq').value;
    try {
      await api('/api/signup', {
        method: 'POST',
        body: {
          name: H('signup-name').value.trim(),
          email: H('signup-email').value.trim(),
          password: H('signup-password').value,
          security_question: secQuestion,
          security_answer: H('signup-seca').value,
        },
      });
      showAuthView('signup-done');
    } catch (err) {
      showError('signup-error', err.message);
    }
  });

  let forgotEmail = '';
  H('forgot-step1').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('forgot1-error');
    forgotEmail = H('forgot-email').value.trim();
    try {
      const res = await api('/api/forgot/question', { method: 'POST', body: { email: forgotEmail } });
      H('forgot-question').textContent = res.question;
      H('forgot-answer').value = '';
      H('forgot-newpass').value = '';
      showAuthView('forgot-step2');
    } catch (err) {
      showError('forgot1-error', err.message);
    }
  });
  H('forgot-step2').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('forgot2-error');
    try {
      await api('/api/forgot/reset', {
        method: 'POST',
        body: { email: forgotEmail, answer: H('forgot-answer').value, new_password: H('forgot-newpass').value },
      });
      showAuthView('forgot-done');
    } catch (err) {
      showError('forgot2-error', err.message);
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
    ['overview', 'docs', 'directory', 'dues', 'news', 'calendar', 'polls', 'account'].forEach((t) =>
      H('tab-' + t).hidden = t !== tab);
    ({ overview: renderOverview, docs: renderDocs, directory: renderDirectory,
       dues: renderDues, news: renderNews, calendar: renderCalendar, polls: renderPolls, account: renderAccount })[tab]();
  }

  async function renderOverview() {
    const pane = H('tab-overview');
    pane.innerHTML = h2('Overview') +
      '<div class="g2" style="display:grid; grid-template-columns:repeat(2,1fr); gap:20px; margin-bottom:20px;">' +
      '<div class="skeleton" style="height:120px;"></div><div class="skeleton" style="height:120px;"></div></div>' +
      '<div class="skeleton" style="height:190px;"></div>';
    const year = new Date().getFullYear();
    const [dues, events, docs, attention] = await Promise.all([
      api('/api/member/dues').catch(() => []),
      api('/api/member/events').catch(() => []),
      api('/api/member/documents').catch(() => []),
      api('/api/member/attention').catch(() => ({ events: [], polls: [], needs_security_question: false })),
    ]);

    // Nothing to flag → no card at all, not even an empty/"all caught up" placeholder.
    const attnEvents = attention.events || [];
    const attnPolls = attention.polls || [];
    const attentionCard = (attnEvents.length || attnPolls.length || attention.needs_security_question)
      ? '<div style="background:#fff; border:1px solid #f0ddba; border-radius:16px; padding:26px; margin-bottom:20px;">' +
          '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A; margin:0 0 14px;">Needs your attention</h3>' +
          '<div style="display:flex; flex-direction:column; gap:10px;">' +
            attnEvents.map((e) =>
              '<div style="display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; background:#FDF3E3; border-radius:11px; padding:14px 16px;">' +
                '<span style="font-size:14.5px; color:#16203A;">RSVP for <strong>' + escapeHtml(e.title) + '</strong> — ' + fmtDate(e.date, { month: 'short', day: 'numeric' }) + '</span>' +
                '<button data-attn-rsvp="' + e.id + '" style="background:#0E7C66; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13.5px; cursor:pointer; font-family:inherit;">✓ Going</button>' +
              '</div>').join('') +
            attnPolls.map((p) =>
              '<a href="#" data-goto-tab="polls" style="display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; background:#FDF3E3; border-radius:11px; padding:14px 16px; text-decoration:none;">' +
                '<span style="font-size:14.5px; color:#16203A;">New poll: <strong>' + escapeHtml(p.question) + '</strong></span>' +
                '<span style="color:#0A5BC4; font-weight:700; font-size:13.5px;">Vote →</span>' +
              '</a>').join('') +
            (attention.needs_security_question
              ? '<a href="#" data-goto-tab="account" style="display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; background:#FDF3E3; border-radius:11px; padding:14px 16px; text-decoration:none;">' +
                  '<span style="font-size:14.5px; color:#16203A;">Set a security question so you can reset your own password later</span>' +
                  '<span style="color:#0A5BC4; font-weight:700; font-size:13.5px;">Set up →</span>' +
                '</a>'
              : '') +
          '</div></div>'
      : '';

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
      attentionCard +
      '<div class="g2" style="display:grid; grid-template-columns:repeat(2,1fr); gap:20px; margin-bottom:20px;">' + duesCard + nextCard + '</div>' + docsBox);

    pane.querySelectorAll('[data-attn-rsvp]').forEach((btn) => btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api('/api/member/rsvp', { method: 'POST', body: { event_id: +btn.getAttribute('data-attn-rsvp'), status: 'going' } });
        renderOverview();
      } catch (e) {
        btn.disabled = false;
        alert(e.message);
      }
    }));
    pane.querySelectorAll('[data-goto-tab]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      selectTab(a.getAttribute('data-goto-tab'));
    }));
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
    const rsvpBtn = (eventId, targetStatus, current, label, activeBg, activeBorder) => {
      const isActive = current === targetStatus;
      const style = isActive
        ? 'background:' + activeBg + '; color:#fff; border:1.5px solid ' + activeBorder + ';'
        : 'background:#fff; color:#51607c; border:1.5px solid #d9e0ea;';
      return '<button data-rsvp="' + eventId + '" data-status="' + targetStatus + '" data-active="' + (isActive ? 1 : 0) + '" ' +
        'style="' + style + ' padding:10px 18px; border-radius:10px; font-weight:700; font-size:14.5px; cursor:pointer; font-family:inherit; white-space:nowrap;">' + label + '</button>';
    };

    pane.innerHTML = head + fadeWrap(ups.length
      ? '<div style="display:flex; flex-direction:column; gap:14px;">' + ups.map((e) => {
          const status = e.my_rsvp || null;
          return '<div style="display:flex; align-items:center; gap:20px; background:#fff; border:1px solid #e7ecf3; border-radius:14px; padding:20px 24px; flex-wrap:wrap;">' +
            '<div style="flex:1; min-width:220px;">' +
              '<span style="display:inline-block; background:' + (TAGC[e.kind] || '#0A5BC4') + '; color:#fff; font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; padding:3px 10px; border-radius:30px; margin-bottom:8px;">' + escapeHtml(e.kind) + '</span>' +
              '<div style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A;">' + escapeHtml(e.title) + '</div>' +
              '<div style="font-size:15px; color:#51607c;">' + fmtDate(e.date, { weekday: 'long', month: 'long', day: 'numeric' }) +
                (e.start_time ? ' · ' + escapeHtml(e.start_time) : '') + ' · ' + escapeHtml(e.location) + '</div>' +
            '</div>' +
            '<div style="display:flex; gap:8px;">' +
              rsvpBtn(e.id, 'going', status, '✓ Going', '#0E7C66', '#0E7C66') +
              rsvpBtn(e.id, 'not_going', status, 'Not going', '#b03333', '#b03333') +
            '</div>' +
          '</div>';
        }).join('') + '</div>'
      : empty('No upcoming events scheduled.'));

    pane.querySelectorAll('[data-rsvp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        // Clicking the already-active button clears the RSVP back to "no response".
        const alreadyActive = btn.getAttribute('data-active') === '1';
        const status = alreadyActive ? null : btn.getAttribute('data-status');
        btn.disabled = true;
        try {
          await api('/api/member/rsvp', { method: 'POST', body: { event_id: +btn.getAttribute('data-rsvp'), status } });
          renderCalendar();
        } catch (e) {
          btn.disabled = false;
          alert(e.message);
        }
      });
    });
  }

  function pollResults(poll) {
    const total = poll.options.reduce((s, o) => s + o.vote_count, 0);
    return poll.options.map((o) => {
      const pct = total ? Math.round((o.vote_count / total) * 100) : 0;
      const mine = poll.my_option_id === o.id;
      return '<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; font-size:14.5px; margin-bottom:4px;">' +
        '<span style="font-weight:' + (mine ? '800' : '400') + '; color:' + (mine ? '#0A5BC4' : '#16203A') + ';">' + escapeHtml(o.label) + (mine ? ' ✓' : '') + '</span>' +
        '<span class="muted" style="color:#8593aa;">' + o.vote_count + ' (' + pct + '%)</span></div>' +
        '<div style="background:#EAF1FB; border-radius:6px; height:8px;"><div style="background:#0A5BC4; width:' + pct + '%; height:8px; border-radius:6px;"></div></div></div>';
    }).join('');
  }

  async function renderPolls() {
    const pane = H('tab-polls');
    const head = h2('Polls') + sub('Chapter decisions members can weigh in on.');
    pane.innerHTML = head + skelRows(2, 130);
    const data = await api('/api/member/polls').catch(() => ({ active: [], closed: [] }));
    const active = data.active || [];
    const closed = data.closed || [];

    const activeHtml = active.map((p) => {
      const card = '<div style="background:#fff; border:1px solid #e7ecf3; border-radius:14px; padding:22px 24px; margin-bottom:14px;">' +
        '<div style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:18px; color:#16203A; margin-bottom:6px;">' + escapeHtml(p.question) + '</div>' +
        (p.description ? '<p style="font-size:14.5px; color:#51607c; margin:0 0 14px;">' + escapeHtml(p.description) + '</p>' : '');
      if (p.voted) {
        return card + pollResults(p) + '</div>';
      }
      return card +
        '<form data-vote-form="' + p.id + '">' +
        p.options.map((o) =>
          '<label style="display:flex; align-items:center; gap:9px; padding:8px 0; cursor:pointer; font-size:15px;">' +
          '<input type="radio" name="vote-' + p.id + '" value="' + o.id + '" style="width:16px; height:16px; accent-color:#0A5BC4;" required> ' + escapeHtml(o.label) + '</label>'
        ).join('') +
        '<button type="submit" class="cta-primary" style="margin-top:10px; padding:10px 20px; font-size:15px;">Submit vote</button>' +
        '<div class="vote-msg" style="margin-top:10px; font-size:14px; font-weight:600;"></div>' +
        '</form></div>';
    }).join('');

    const closedHtml = closed.map((p) =>
      '<div style="background:#fff; border:1px solid #e7ecf3; border-radius:14px; padding:22px 24px; margin-bottom:14px;">' +
        '<div style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:18px; color:#16203A; margin-bottom:6px;">' + escapeHtml(p.question) + '</div>' +
        '<div class="muted" style="font-size:13px; margin-bottom:12px;">Poll closed</div>' +
        pollResults(p) + '</div>'
    ).join('');

    let html = '';
    if (active.length) html += '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A; margin:0 0 14px;">Open polls</h3>' + activeHtml;
    if (closed.length) html += '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A; margin:26px 0 14px;">Past polls</h3>' + closedHtml;
    if (!active.length && !closed.length) html = empty('No polls right now — check back soon.');

    pane.innerHTML = head + fadeWrap(html);

    pane.querySelectorAll('[data-vote-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pollId = form.getAttribute('data-vote-form');
        const chosen = form.querySelector('input[name="vote-' + pollId + '"]:checked');
        const msg = form.querySelector('.vote-msg');
        if (!chosen) return;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
          await api('/api/member/polls/' + pollId + '/vote', { method: 'POST', body: { option_id: +chosen.value } });
          renderPolls();
        } catch (err) {
          submitBtn.disabled = false;
          msg.style.color = '#b03333';
          msg.textContent = err.message;
        }
      });
    });
  }

  const SEC_QUESTIONS = [
    'What was the tail number of the first aircraft you flew?',
    'What city were you born in?',
    'What was your first car?',
  ];

  async function renderAccount() {
    const pane = H('tab-account');
    const head = h2('Account') + sub('Manage your sign-in and password recovery.');
    pane.innerHTML = head + skelRows(2, 160);
    const sec = await api('/api/member/security').catch(() => ({ has_security_question: false, security_question: '' }));
    const isPreset = SEC_QUESTIONS.includes(sec.security_question);

    const html =
      '<div style="background:#fff; border:1px solid #e7ecf3; border-radius:16px; padding:26px; margin-bottom:20px;">' +
        '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A; margin:0 0 6px;">Security question</h3>' +
        '<p style="font-size:14.5px; color:#51607c; margin:0 0 16px;">' +
          (sec.has_security_question
            ? 'Used to reset your password without contacting an admin. Current question: <strong>' + escapeHtml(sec.security_question) + '</strong>'
            : 'Not set yet — set one so you can reset your own password if you forget it.') +
        '</p>' +
        '<div style="margin-bottom:10px;"><label class="flbl">Question</label>' +
          '<select class="fld" id="acc-secq" style="margin-bottom:8px;">' +
            SEC_QUESTIONS.map((q) => '<option value="' + escapeHtml(q) + '"' + (q === sec.security_question ? ' selected' : '') + '>' + escapeHtml(q) + '</option>').join('') +
            '<option value="__custom"' + (sec.has_security_question && !isPreset ? ' selected' : '') + '>Write my own question…</option>' +
          '</select>' +
          '<input class="fld" type="text" id="acc-secq-custom" placeholder="Your custom question"' + (sec.has_security_question && !isPreset ? '' : ' hidden') +
            ' value="' + (sec.has_security_question && !isPreset ? escapeHtml(sec.security_question) : '') + '" style="margin-bottom:8px;"></div>' +
        '<div style="margin-bottom:14px;"><label class="flbl">Answer</label><input class="fld" type="text" id="acc-seca" autocomplete="off" placeholder="' + (sec.has_security_question ? 'Enter a new answer to update it' : 'Your answer') + '"></div>' +
        '<div id="acc-sec-msg" class="msg" style="padding:11px 14px; border-radius:9px; font-size:14px; font-weight:600; margin-bottom:14px; display:none;"></div>' +
        '<button class="cta-primary" id="acc-sec-save" style="padding:12px 22px; font-size:15px;">Save security question</button>' +
      '</div>' +
      '<div style="background:#fff; border:1px solid #e7ecf3; border-radius:16px; padding:26px;">' +
        '<h3 style="font-family:\'Archivo\',sans-serif; font-weight:800; font-size:19px; color:#16203A; margin:0 0 16px;">Change password</h3>' +
        '<div style="margin-bottom:14px;"><label class="flbl">Current password</label><input class="fld" type="password" id="acc-cur-pass" autocomplete="current-password"></div>' +
        '<div style="margin-bottom:14px;"><label class="flbl">New password <span style="font-weight:500; color:#8593aa;">(at least 8 characters)</span></label><input class="fld" type="password" id="acc-new-pass" autocomplete="new-password" minlength="8"></div>' +
        '<div id="acc-pass-msg" class="msg" style="padding:11px 14px; border-radius:9px; font-size:14px; font-weight:600; margin-bottom:14px; display:none;"></div>' +
        '<button class="cta-primary" id="acc-pass-save" style="padding:12px 22px; font-size:15px;">Update password</button>' +
      '</div>';

    pane.innerHTML = head + fadeWrap(html);

    const flash = (id, ok, text) => {
      const el = H(id);
      el.className = 'msg';
      el.style.background = ok ? '#E3F1ED' : '#fdecec';
      el.style.color = ok ? '#0E7C66' : '#b03333';
      el.style.display = 'block';
      el.textContent = text;
    };

    H('acc-secq').addEventListener('change', () => { H('acc-secq-custom').hidden = H('acc-secq').value !== '__custom'; });

    H('acc-sec-save').addEventListener('click', async () => {
      const q = H('acc-secq').value === '__custom' ? H('acc-secq-custom').value.trim() : H('acc-secq').value;
      const a = H('acc-seca').value;
      if (!a) { flash('acc-sec-msg', false, 'Enter an answer.'); return; }
      try {
        await api('/api/member/security', { method: 'POST', body: { security_question: q, security_answer: a } });
        flash('acc-sec-msg', true, 'Saved.');
        renderAccount();
      } catch (e) { flash('acc-sec-msg', false, e.message); }
    });

    H('acc-pass-save').addEventListener('click', async () => {
      const body = { current_password: H('acc-cur-pass').value, new_password: H('acc-new-pass').value };
      try {
        await api('/api/member/password', { method: 'POST', body });
        flash('acc-pass-msg', true, 'Password updated.');
        H('acc-cur-pass').value = '';
        H('acc-new-pass').value = '';
      } catch (e) { flash('acc-pass-msg', false, e.message); }
    });
  }
});

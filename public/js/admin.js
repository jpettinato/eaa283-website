// Admin portal — announcement bar, events, posts, documents, members/dues, subscribers.
// Requires an active session with role 'admin'; everything is enforced server-side too.

document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('admin-login');
  const app = document.getElementById('admin-app');
  const logoutBtn = document.getElementById('logout-btn');
  const H = (id) => document.getElementById(id);

  const KINDS = ['Meeting', 'Young Eagles', 'Fly-In', 'Board', 'Build'];
  const TAGS = ['Announcement', 'Project', 'Event', 'Chapter'];
  const CATS = [['minutes', 'Meeting minutes'], ['agenda', 'Agenda'], ['newsletter', 'Newsletter'], ['reference', 'Reference']];
  const YEAR = new Date().getFullYear();

  const flash = (el, ok, text) => {
    el.className = 'msg ' + (ok ? 'ok' : 'err');
    el.textContent = text;
    el.style.display = 'block';
    if (ok) setTimeout(() => { el.style.display = 'none'; }, 3000);
  };
  const options = (list, selected) => list.map((o) => {
    const [val, label] = Array.isArray(o) ? o : [o, o];
    return '<option value="' + val + '"' + (val === selected ? ' selected' : '') + '>' + label + '</option>';
  }).join('');

  // ---------- auth ----------

  async function boot() {
    try {
      const me = await api('/api/me');
      if (me.role !== 'admin') throw new Error('not admin');
      enter();
    } catch (e) {
      loginView.hidden = false;
    }
  }

  H('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = H('login-error');
    errBox.style.display = 'none';
    try {
      const res = await api('/api/login', {
        method: 'POST',
        body: { email: H('login-email').value.trim(), password: H('login-password').value },
      });
      if (res.user.role !== 'admin') {
        flash(errBox, false, 'This account is not an administrator. Ask an existing admin to grant access.');
        return;
      }
      enter();
    } catch (err) {
      flash(errBox, false, err.message);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
    location.reload();
  });

  function enter() {
    loginView.hidden = true;
    app.hidden = false;
    logoutBtn.hidden = false;
    selectTab('banner');
  }

  const RENDER = {};
  document.getElementById('admin-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn) selectTab(btn.getAttribute('data-tab'));
  });
  function selectTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    ['banner', 'events', 'posts', 'documents', 'members', 'subscribers', 'koala', 'groups', 'polls'].forEach((t) => { H('tab-' + t).hidden = t !== tab; });
    RENDER[tab]();
  }

  // ---------- announcement bar ----------

  RENDER.banner = async function () {
    const pane = H('tab-banner');
    const b = await api('/api/banner').catch(() => ({ text: '', active: 0 }));
    pane.innerHTML =
      '<div class="card"><h3>Site-wide announcement bar</h3>' +
      '<p class="muted" style="margin:0 0 16px;">Shown at the top of every public page. Uncheck "visible" to hide it without deleting the text.</p>' +
      '<div class="frow"><div><label class="flbl">Text</label>' +
      '<textarea class="fld" id="banner-text" rows="2">' + escapeHtml(b.text) + '</textarea></div></div>' +
      '<label style="display:flex; align-items:center; gap:9px; font-size:15px; margin-bottom:16px; cursor:pointer;">' +
      '<input type="checkbox" id="banner-active"' + (b.active ? ' checked' : '') + ' style="width:17px; height:17px; accent-color:#0A5BC4;"> Visible on the site</label>' +
      '<div id="banner-msg" class="msg"></div>' +
      '<button class="btn" id="banner-save">Save announcement</button></div>';
    H('banner-save').addEventListener('click', async () => {
      try {
        await api('/api/admin/banner', { method: 'POST', body: { text: H('banner-text').value.trim(), active: H('banner-active').checked } });
        flash(H('banner-msg'), true, 'Saved. The site shows the new announcement immediately.');
      } catch (e) { flash(H('banner-msg'), false, e.message); }
    });
  };

  // ---------- events ----------

  RENDER.events = async function () {
    const pane = H('tab-events');
    const [events, groups] = await Promise.all([
      api('/api/admin/events').catch(() => []),
      api('/api/admin/groups').catch(() => []),
    ]);
    const groupOptions = [['', 'None (not group-restricted)']].concat(groups.map((g) => [g.id, g.name]));
    pane.innerHTML =
      '<div class="card"><h3 id="ev-form-title">Add an event</h3>' +
      '<input type="hidden" id="ev-id">' +
      '<div class="frow cols" style="grid-template-columns:2fr 1fr 1fr;">' +
        '<div><label class="flbl">Title</label><input class="fld" id="ev-title"></div>' +
        '<div><label class="flbl">Date</label><input class="fld" id="ev-date" type="date"></div>' +
        '<div><label class="flbl">Kind</label><select class="fld" id="ev-kind">' + options(KINDS) + '</select></div>' +
      '</div>' +
      '<div class="frow cols" style="grid-template-columns:1fr 1fr 2fr;">' +
        '<div><label class="flbl">Start time</label><input class="fld" id="ev-start" placeholder="6:00 PM"></div>' +
        '<div><label class="flbl">End time</label><input class="fld" id="ev-end" placeholder="7:00 PM"></div>' +
        '<div><label class="flbl">Location</label><input class="fld" id="ev-loc" value="Cherry Ridge Airport"></div>' +
      '</div>' +
      '<div class="frow"><div><label class="flbl">Description</label><textarea class="fld" id="ev-desc" rows="3"></textarea></div></div>' +
      '<div class="frow"><div><label class="flbl">Group (restricts visibility on the member calendar)</label>' +
      '<select class="fld" id="ev-group">' + options(groupOptions) + '</select></div></div>' +
      '<label style="display:flex; align-items:center; gap:9px; font-size:15px; margin-bottom:16px; cursor:pointer;">' +
      '<input type="checkbox" id="ev-members" style="width:17px; height:17px; accent-color:#0A5BC4;"> Members only (hidden from the public calendar)</label>' +
      '<div id="ev-msg" class="msg"></div>' +
      '<div style="display:flex; gap:10px;"><button class="btn" id="ev-save">Save event</button>' +
      '<button class="btn ghost" id="ev-reset" hidden>Cancel editing</button></div></div>' +
      '<div class="card"><h3>All events</h3><div class="scroll-x"><table><thead><tr>' +
      '<th>Date</th><th>Title</th><th>Kind</th><th>Visibility</th><th>RSVPs</th><th></th></tr></thead><tbody>' +
      events.map((e) =>
        '<tr><td style="white-space:nowrap;">' + e.date + '</td>' +
        '<td style="font-weight:600;">' + escapeHtml(e.title) + '</td>' +
        '<td>' + escapeHtml(e.kind) + '</td>' +
        '<td>' + (e.group_name ? '<span class="pill blue">' + escapeHtml(e.group_name) + '</span>' : (e.members_only ? '<span class="pill blue">Members</span>' : '<span class="pill active">Public</span>')) + '</td>' +
        '<td><button class="btn ghost small" data-rsvps="' + e.id + '">' + e.going_count + ' going · ' + e.not_going_count + ' not going</button></td>' +
        '<td style="white-space:nowrap;"><button class="btn ghost small" data-edit="' + e.id + '">Edit</button> ' +
        '<button class="btn danger small" data-del="' + e.id + '">Delete</button></td></tr>' +
        '<tr id="rsvp-row-' + e.id + '" hidden><td colspan="6" style="background:#F6F8FC;"></td></tr>'
      ).join('') + '</tbody></table></div></div>';

    const fill = (e) => {
      H('ev-id').value = e ? e.id : '';
      H('ev-title').value = e ? e.title : '';
      H('ev-date').value = e ? e.date : '';
      H('ev-kind').value = e ? e.kind : 'Meeting';
      H('ev-start').value = e ? e.start_time : '';
      H('ev-end').value = e ? e.end_time : '';
      H('ev-loc').value = e ? e.location : 'Cherry Ridge Airport';
      H('ev-desc').value = e ? e.description : '';
      H('ev-group').value = e && e.group_id ? e.group_id : '';
      H('ev-members').checked = !!(e && e.members_only);
      H('ev-form-title').textContent = e ? 'Edit event' : 'Add an event';
      H('ev-reset').hidden = !e;
    };

    H('ev-save').addEventListener('click', async () => {
      const id = H('ev-id').value;
      const body = {
        title: H('ev-title').value.trim(), date: H('ev-date').value, kind: H('ev-kind').value,
        start_time: H('ev-start').value.trim(), end_time: H('ev-end').value.trim(),
        location: H('ev-loc').value.trim(), description: H('ev-desc').value.trim(),
        members_only: H('ev-members').checked, group_id: H('ev-group').value || null,
      };
      try {
        await api('/api/admin/events' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body });
        RENDER.events();
      } catch (e) { flash(H('ev-msg'), false, e.message); }
    });
    H('ev-reset').addEventListener('click', () => fill(null));

    pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      fill(events.find((e) => e.id === +b.getAttribute('data-edit')));
      pane.scrollIntoView({ behavior: 'smooth' });
    }));
    pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this event? RSVPs for it are removed too.')) return;
      await api('/api/admin/events/' + b.getAttribute('data-del'), { method: 'DELETE' });
      RENDER.events();
    }));
    pane.querySelectorAll('[data-rsvps]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.getAttribute('data-rsvps');
      const row = H('rsvp-row-' + id);
      if (!row.hidden) { row.hidden = true; return; }
      const r = await api('/api/admin/rsvps?event_id=' + id).catch(() => ({ going: [], not_going: [], no_response: [] }));
      const names = (list) => list.length ? list.map((p) => escapeHtml(p.name) + ' (' + escapeHtml(p.email) + ')').join(', ') : 'None';
      row.firstElementChild.innerHTML =
        '<div style="margin-bottom:6px;"><strong>Going (' + r.going.length + '):</strong> ' + names(r.going) + '</div>' +
        '<div style="margin-bottom:6px;"><strong>Not going (' + r.not_going.length + '):</strong> ' + names(r.not_going) + '</div>' +
        '<div><strong>No response (' + r.no_response.length + '):</strong> ' + names(r.no_response) + '</div>';
      row.hidden = false;
    }));
  };

  // ---------- posts ----------

  RENDER.posts = async function () {
    const pane = H('tab-posts');
    const posts = await api('/api/admin/posts').catch(() => []);
    pane.innerHTML =
      '<div class="card"><h3 id="post-form-title">Write a post</h3>' +
      '<input type="hidden" id="post-id">' +
      '<div class="frow cols" style="grid-template-columns:2fr 1fr 1fr;">' +
        '<div><label class="flbl">Title</label><input class="fld" id="post-title"></div>' +
        '<div><label class="flbl">Tag</label><select class="fld" id="post-tag">' + options(TAGS) + '</select></div>' +
        '<div><label class="flbl">Date</label><input class="fld" id="post-date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
      '</div>' +
      '<div class="frow"><div><label class="flbl">Body</label><textarea class="fld" id="post-body" rows="5"></textarea></div></div>' +
      '<label style="display:flex; align-items:center; gap:9px; font-size:15px; margin-bottom:16px; cursor:pointer;">' +
      '<input type="checkbox" id="post-members" style="width:17px; height:17px; accent-color:#0A5BC4;"> Members only (shows in the member portal, not the public News page)</label>' +
      '<div id="post-msg" class="msg"></div>' +
      '<div style="display:flex; gap:10px;"><button class="btn" id="post-save">Publish</button>' +
      '<button class="btn ghost" id="post-reset" hidden>Cancel editing</button></div></div>' +
      '<div class="card"><h3>All posts</h3><div class="scroll-x"><table><thead><tr>' +
      '<th>Date</th><th>Title</th><th>Tag</th><th>Visibility</th><th></th></tr></thead><tbody>' +
      posts.map((p) =>
        '<tr><td style="white-space:nowrap;">' + String(p.published_at).slice(0, 10) + '</td>' +
        '<td style="font-weight:600;">' + escapeHtml(p.title) + '</td>' +
        '<td>' + escapeHtml(p.tag) + '</td>' +
        '<td>' + (p.members_only ? '<span class="pill blue">Members</span>' : '<span class="pill active">Public</span>') + '</td>' +
        '<td style="white-space:nowrap;"><button class="btn ghost small" data-edit="' + p.id + '">Edit</button> ' +
        '<button class="btn danger small" data-del="' + p.id + '">Delete</button></td></tr>'
      ).join('') + '</tbody></table></div></div>';

    const fill = (p) => {
      H('post-id').value = p ? p.id : '';
      H('post-title').value = p ? p.title : '';
      H('post-tag').value = p ? p.tag : 'Announcement';
      H('post-date').value = p ? String(p.published_at).slice(0, 10) : new Date().toISOString().slice(0, 10);
      H('post-body').value = p ? p.body : '';
      H('post-members').checked = !!(p && p.members_only);
      H('post-form-title').textContent = p ? 'Edit post' : 'Write a post';
      H('post-reset').hidden = !p;
    };

    H('post-save').addEventListener('click', async () => {
      const id = H('post-id').value;
      const body = {
        title: H('post-title').value.trim(), tag: H('post-tag').value,
        body: H('post-body').value.trim(), published_at: H('post-date').value,
        members_only: H('post-members').checked,
      };
      try {
        await api('/api/admin/posts' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body });
        RENDER.posts();
      } catch (e) { flash(H('post-msg'), false, e.message); }
    });
    H('post-reset').addEventListener('click', () => fill(null));
    pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      fill(posts.find((p) => p.id === +b.getAttribute('data-edit')));
      pane.scrollIntoView({ behavior: 'smooth' });
    }));
    pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      await api('/api/admin/posts/' + b.getAttribute('data-del'), { method: 'DELETE' });
      RENDER.posts();
    }));
  };

  // ---------- documents ----------

  RENDER.documents = async function () {
    const pane = H('tab-documents');
    const docs = await api('/api/admin/documents').catch(() => []);
    pane.innerHTML =
      '<div class="card"><h3>Upload a document</h3>' +
      '<p class="muted" style="margin:0 0 16px;">Agendas, meeting minutes, newsletters, bylaws — PDFs work best. Public newsletters also appear on the News page.</p>' +
      '<div class="frow cols" style="grid-template-columns:2fr 1fr;">' +
        '<div><label class="flbl">File</label><input class="fld" id="doc-file" type="file" style="padding:9px;"></div>' +
        '<div><label class="flbl">Category</label><select class="fld" id="doc-cat">' + options(CATS, 'minutes') + '</select></div>' +
      '</div>' +
      '<div class="frow"><div><label class="flbl">Display name (defaults to the file name)</label><input class="fld" id="doc-name" placeholder="e.g. June 2026 Meeting Minutes"></div></div>' +
      '<label style="display:flex; align-items:center; gap:9px; font-size:15px; margin-bottom:16px; cursor:pointer;">' +
      '<input type="checkbox" id="doc-members" checked style="width:17px; height:17px; accent-color:#0A5BC4;"> Members only</label>' +
      '<div id="doc-msg" class="msg"></div>' +
      '<button class="btn" id="doc-upload">Upload</button></div>' +
      '<div class="card"><h3>All documents</h3><div class="scroll-x"><table><thead><tr>' +
      '<th>Posted</th><th>Name</th><th>Category</th><th>Visibility</th><th>Size</th><th></th></tr></thead><tbody>' +
      docs.map((d) =>
        '<tr><td style="white-space:nowrap;">' + String(d.posted_at).slice(0, 10) + '</td>' +
        '<td style="font-weight:600;"><a href="/api/documents/' + d.id + '" target="_blank" style="color:#0A5BC4; text-decoration:none;">' + escapeHtml(d.name) + '</a></td>' +
        '<td>' + escapeHtml(d.category) + '</td>' +
        '<td>' + (d.members_only ? '<span class="pill blue">Members</span>' : '<span class="pill active">Public</span>') + '</td>' +
        '<td style="white-space:nowrap;">' + (d.size ? (d.size / 1024 / 1024).toFixed(d.size > 1048576 ? 1 : 2) + ' MB' : '—') + '</td>' +
        '<td><button class="btn danger small" data-del="' + d.id + '">Delete</button></td></tr>'
      ).join('') + '</tbody></table></div>' +
      (docs.length ? '' : '<div class="muted" style="padding:14px 0 4px;">Nothing uploaded yet.</div>') + '</div>';

    H('doc-upload').addEventListener('click', async () => {
      const fileInput = H('doc-file');
      const file = fileInput.files && fileInput.files[0];
      if (!file) { flash(H('doc-msg'), false, 'Choose a file first.'); return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', H('doc-name').value.trim() || file.name.replace(/\.[^.]+$/, ''));
      fd.append('category', H('doc-cat').value);
      fd.append('members_only', H('doc-members').checked ? '1' : '0');
      H('doc-upload').disabled = true;
      try {
        await api('/api/admin/documents', { method: 'POST', body: fd });
        RENDER.documents();
      } catch (e) {
        H('doc-upload').disabled = false;
        flash(H('doc-msg'), false, e.message);
      }
    });
    pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this document? The file is removed from storage.')) return;
      await api('/api/admin/documents/' + b.getAttribute('data-del'), { method: 'DELETE' });
      RENDER.documents();
    }));
  };

  // ---------- members ----------

  RENDER.members = async function () {
    const pane = H('tab-members');
    const users = await api('/api/admin/users').catch(() => []);
    const pending = users.filter((u) => u.status === 'pending');

    pane.innerHTML =
      (pending.length
        ? '<div class="card" style="border-color:#f0ddba; background:#FFFDF7;"><h3>Awaiting verification (' + pending.length + ')</h3>' +
          '<p class="muted" style="margin:0 0 14px;">Confirm these people are chapter members, then approve their portal access.</p>' +
          pending.map((u) =>
            '<div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:12px 0; border-bottom:1px solid #f0ead8;">' +
              '<div style="flex:1; min-width:200px;"><strong>' + escapeHtml(u.name) + '</strong><br><span class="muted">' + escapeHtml(u.email) + ' · requested ' + String(u.created_at).slice(0, 10) + '</span></div>' +
              '<button class="btn small" data-approve="' + u.id + '">Approve</button>' +
              '<button class="btn danger small" data-reject="' + u.id + '">Disable</button>' +
            '</div>').join('') + '</div>'
        : '') +
      '<div class="card"><h3>All accounts</h3>' +
      '<div id="user-msg" class="msg"></div>' +
      '<div class="scroll-x"><table><thead><tr>' +
      '<th>Name / email</th><th>Status</th><th>Role</th><th>Title</th><th>Since</th><th>' + YEAR + ' dues</th><th></th></tr></thead><tbody>' +
      users.map((u) =>
        '<tr data-uid="' + u.id + '">' +
          '<td><strong>' + escapeHtml(u.name) + '</strong><br><span class="muted">' + escapeHtml(u.email) + '</span></td>' +
          '<td><select class="fld u-status" style="width:110px; padding:7px 9px;">' + options(['pending', 'active', 'disabled'], u.status) + '</select></td>' +
          '<td><select class="fld u-role" style="width:100px; padding:7px 9px;">' + options(['member', 'admin'], u.role) + '</select></td>' +
          '<td><input class="fld u-title" style="width:120px; padding:7px 9px;" value="' + escapeHtml(u.role_title || '') + '" placeholder="e.g. President"></td>' +
          '<td><input class="fld u-since" style="width:76px; padding:7px 9px;" value="' + escapeHtml(u.member_since || '') + '" placeholder="2016"></td>' +
          '<td><select class="fld u-dues" style="width:100px; padding:7px 9px;">' + options([['', '—'], ['paid', 'Paid'], ['unpaid', 'Unpaid'], ['exempt', 'Exempt']], u.dues_status || '') + '</select></td>' +
          '<td><button class="btn small u-save">Save</button></td>' +
        '</tr>').join('') + '</tbody></table></div></div>';

    const saveUser = async (id, body) => {
      await api('/api/admin/users/' + id, { method: 'PUT', body });
    };

    pane.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
      await saveUser(+b.getAttribute('data-approve'), { status: 'active' }).catch((e) => alert(e.message));
      RENDER.members();
    }));
    pane.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Disable this account? They will not be able to sign in.')) return;
      await saveUser(+b.getAttribute('data-reject'), { status: 'disabled' }).catch((e) => alert(e.message));
      RENDER.members();
    }));
    pane.querySelectorAll('.u-save').forEach((btn) => btn.addEventListener('click', async () => {
      const tr = btn.closest('tr');
      const id = +tr.getAttribute('data-uid');
      btn.disabled = true;
      try {
        await saveUser(id, {
          status: tr.querySelector('.u-status').value,
          role: tr.querySelector('.u-role').value,
          role_title: tr.querySelector('.u-title').value.trim(),
          member_since: tr.querySelector('.u-since').value.trim(),
        });
        const duesVal = tr.querySelector('.u-dues').value;
        if (duesVal) {
          await api('/api/admin/users/' + id + '/dues', { method: 'POST', body: { year: YEAR, status: duesVal } });
        }
        flash(H('user-msg'), true, 'Saved.');
      } catch (e) {
        flash(H('user-msg'), false, e.message);
      }
      btn.disabled = false;
    }));
  };

  // ---------- subscribers ----------

  RENDER.subscribers = async function () {
    const pane = H('tab-subscribers');
    const subs = await api('/api/admin/subscribers').catch(() => []);
    const unsubUrl = location.origin + '/unsubscribe.html';
    const unsubLine = "Don't want these emails? Unsubscribe at " + unsubUrl;
    pane.innerHTML =
      '<div class="card">' +
      '<h3>Unsubscribe link for bulk emails</h3>' +
      '<p class="muted" style="margin:0 0 14px;">Paste this into the bottom of any email you send to the list — required so recipients have a working opt-out.</p>' +
      '<div id="unsub-copy-msg" class="msg"></div>' +
      '<div class="fld" style="font-family:monospace; font-size:13.5px; margin-bottom:10px; user-select:all;">' + escapeHtml(unsubLine) + '</div>' +
      '<button class="btn ghost small" id="copy-unsub-line">Copy link + sentence</button>' +
      '</div>' +
      '<div class="card"><h3>Newsletter subscribers (' + subs.length + ')</h3>' +
      '<p class="muted" style="margin:0 0 14px;">Emails collected from the "Never miss an update" form on the News page. Use "Copy all" to paste them into your email BCC field.</p>' +
      '<div id="subs-msg" class="msg"></div>' +
      (subs.length ? '<button class="btn ghost small" id="copy-subs" style="margin-bottom:14px;">Copy all emails</button>' : '') +
      '<div class="scroll-x"><table><thead><tr><th>Email</th><th>Signed up</th></tr></thead><tbody>' +
      subs.map((s) => '<tr><td>' + escapeHtml(s.email) + '</td><td>' + String(s.created_at).slice(0, 10) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      (subs.length ? '' : '<div class="muted" style="padding:14px 0 4px;">No subscribers yet.</div>') + '</div>';
    H('copy-unsub-line').addEventListener('click', async () => {
      await navigator.clipboard.writeText(unsubLine);
      flash(H('unsub-copy-msg'), true, 'Copied to the clipboard.');
    });
    const copyBtn = H('copy-subs');
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(subs.map((s) => s.email).join(', '));
      flash(H('subs-msg'), true, 'Copied ' + subs.length + ' addresses to the clipboard.');
    });
  };

  // ---------- koala build ----------

  const PHASE_STATUS = [['complete', '✓ Complete'], ['in_progress', '● In progress'], ['upcoming', '○ Upcoming']];

  RENDER.koala = async function () {
    const pane = H('tab-koala');
    const [info, phases, photos] = await Promise.all([
      api('/api/koala').then((d) => d.info).catch(() => ({})),
      api('/api/admin/koala/phases').catch(() => []),
      api('/api/admin/koala/photos').catch(() => []),
    ]);

    pane.innerHTML =
      '<div class="card"><h3>Page text &amp; stats</h3>' +
      '<div class="frow"><div><label class="flbl">Intro (first paragraph)</label><textarea class="fld" id="ki-intro" rows="3">' + escapeHtml(info.intro || '') + '</textarea></div></div>' +
      '<div class="frow cols" style="grid-template-columns:1fr 1fr;">' +
        '<div><label class="flbl">Stat 1 value</label><input class="fld" id="ki-s1v" value="' + escapeHtml(info.stat1_value || '') + '"></div>' +
        '<div><label class="flbl">Stat 1 label</label><input class="fld" id="ki-s1l" value="' + escapeHtml(info.stat1_label || '') + '"></div>' +
      '</div>' +
      '<div class="frow cols" style="grid-template-columns:1fr 1fr;">' +
        '<div><label class="flbl">Stat 2 value</label><input class="fld" id="ki-s2v" value="' + escapeHtml(info.stat2_value || '') + '"></div>' +
        '<div><label class="flbl">Stat 2 label</label><input class="fld" id="ki-s2l" value="' + escapeHtml(info.stat2_label || '') + '"></div>' +
      '</div>' +
      '<div class="frow cols" style="grid-template-columns:1fr 1fr;">' +
        '<div><label class="flbl">Stat 3 value</label><input class="fld" id="ki-s3v" value="' + escapeHtml(info.stat3_value || '') + '"></div>' +
        '<div><label class="flbl">Stat 3 label</label><input class="fld" id="ki-s3l" value="' + escapeHtml(info.stat3_label || '') + '"></div>' +
      '</div>' +
      '<div class="frow"><div><label class="flbl">"Get involved" CTA text</label><textarea class="fld" id="ki-cta" rows="2">' + escapeHtml(info.cta_text || '') + '</textarea></div></div>' +
      '<div id="ki-msg" class="msg"></div>' +
      '<button class="btn" id="ki-save">Save page text</button></div>' +

      '<div class="card"><h3 id="kp-form-title">Add a build phase</h3>' +
      '<input type="hidden" id="kp-id">' +
      '<div class="frow cols" style="grid-template-columns:2fr 1fr 1fr;">' +
        '<div><label class="flbl">Name</label><input class="fld" id="kp-name"></div>' +
        '<div><label class="flbl">Status</label><select class="fld" id="kp-status">' + options(PHASE_STATUS) + '</select></div>' +
        '<div><label class="flbl">Order</label><input class="fld" id="kp-order" type="number" value="0"></div>' +
      '</div>' +
      '<div class="frow"><div><label class="flbl">Description</label><textarea class="fld" id="kp-desc" rows="2"></textarea></div></div>' +
      '<div id="kp-msg" class="msg"></div>' +
      '<div style="display:flex; gap:10px;"><button class="btn" id="kp-save">Save phase</button>' +
      '<button class="btn ghost" id="kp-reset" hidden>Cancel editing</button></div></div>' +
      '<div class="card"><h3>Build phases</h3><div class="scroll-x"><table><thead><tr>' +
      '<th>Order</th><th>Name</th><th>Status</th><th></th></tr></thead><tbody>' +
      phases.map((p) =>
        '<tr><td>' + p.sort_order + '</td>' +
        '<td style="font-weight:600;">' + escapeHtml(p.name) + '<div class="muted" style="font-weight:400;">' + escapeHtml(p.description) + '</div></td>' +
        '<td><select class="fld" style="width:auto;" data-quickstatus="' + p.id + '">' + options(PHASE_STATUS, p.status) + '</select></td>' +
        '<td style="white-space:nowrap;"><button class="btn ghost small" data-edit="' + p.id + '">Edit</button> ' +
        '<button class="btn danger small" data-del="' + p.id + '">Delete</button></td></tr>'
      ).join('') + '</tbody></table></div>' +
      (phases.length ? '' : '<div class="muted" style="padding:14px 0 4px;">No build phases yet.</div>') + '</div>' +

      '<div class="card"><h3>Upload a photo</h3>' +
      '<div class="frow cols" style="grid-template-columns:2fr 1fr;">' +
        '<div><label class="flbl">Photo file</label><input class="fld" id="kph-file" type="file" accept="image/jpeg,image/png,image/webp" style="padding:9px;"></div>' +
        '<div><label class="flbl">Phase (optional)</label><select class="fld" id="kph-phase"><option value="">General gallery</option>' + phases.map((p) => '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>').join('') + '</select></div>' +
      '</div>' +
      '<div class="frow"><div><label class="flbl">Caption</label><input class="fld" id="kph-caption" placeholder="e.g. Wing covering, June 2026"></div></div>' +
      '<div id="kph-msg" class="msg"></div>' +
      '<button class="btn" id="kph-upload">Upload photo</button></div>' +
      '<div class="card"><h3>Photos (' + photos.length + ')</h3>' +
      '<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:14px;">' +
      photos.map((ph) => {
        const phaseName = ph.phase_id ? (phases.find((p) => p.id === ph.phase_id) || {}).name : 'General gallery';
        return '<div style="border:1px solid #e7ecf3; border-radius:10px; overflow:hidden;">' +
          '<img src="/api/koala/photos/' + ph.id + '" alt="' + escapeHtml(ph.caption || '') + '" style="width:100%; height:110px; object-fit:cover; display:block;">' +
          '<div style="padding:8px 10px;">' +
          '<div style="font-size:12.5px; font-weight:600;">' + escapeHtml(ph.caption || '(no caption)') + '</div>' +
          '<div class="muted" style="font-size:11.5px; margin-bottom:8px;">' + escapeHtml(phaseName || 'General gallery') + '</div>' +
          '<button class="btn danger small" data-delphoto="' + ph.id + '">Delete</button>' +
          '</div></div>';
      }).join('') +
      '</div>' + (photos.length ? '' : '<div class="muted" style="padding:14px 0 4px;">No photos uploaded yet.</div>') + '</div>';

    // -- page text --
    H('ki-save').addEventListener('click', async () => {
      const body = {
        intro: H('ki-intro').value.trim(),
        stat1_value: H('ki-s1v').value.trim(), stat1_label: H('ki-s1l').value.trim(),
        stat2_value: H('ki-s2v').value.trim(), stat2_label: H('ki-s2l').value.trim(),
        stat3_value: H('ki-s3v').value.trim(), stat3_label: H('ki-s3l').value.trim(),
        cta_text: H('ki-cta').value.trim(),
      };
      try {
        await api('/api/admin/koala/info', { method: 'POST', body });
        flash(H('ki-msg'), true, 'Saved.');
      } catch (e) { flash(H('ki-msg'), false, e.message); }
    });

    // -- phases --
    const fillPhase = (p) => {
      H('kp-id').value = p ? p.id : '';
      H('kp-name').value = p ? p.name : '';
      H('kp-status').value = p ? p.status : 'upcoming';
      H('kp-order').value = p ? p.sort_order : phases.length;
      H('kp-desc').value = p ? p.description : '';
      H('kp-form-title').textContent = p ? 'Edit build phase' : 'Add a build phase';
      H('kp-reset').hidden = !p;
    };
    H('kp-save').addEventListener('click', async () => {
      const id = H('kp-id').value;
      const body = {
        name: H('kp-name').value.trim(), status: H('kp-status').value,
        description: H('kp-desc').value.trim(), sort_order: +H('kp-order').value || 0,
      };
      try {
        await api('/api/admin/koala/phases' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body });
        RENDER.koala();
      } catch (e) { flash(H('kp-msg'), false, e.message); }
    });
    H('kp-reset').addEventListener('click', () => fillPhase(null));
    pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      fillPhase(phases.find((p) => p.id === +b.getAttribute('data-edit')));
      pane.scrollIntoView({ behavior: 'smooth' });
    }));
    pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this build phase? Any photos assigned to it move to the general gallery.')) return;
      await api('/api/admin/koala/phases/' + b.getAttribute('data-del'), { method: 'DELETE' });
      RENDER.koala();
    }));
    pane.querySelectorAll('[data-quickstatus]').forEach((sel) => sel.addEventListener('change', async () => {
      const p = phases.find((x) => x.id === +sel.getAttribute('data-quickstatus'));
      if (!p) return;
      try {
        await api('/api/admin/koala/phases/' + p.id, {
          method: 'PUT',
          body: { name: p.name, status: sel.value, description: p.description, sort_order: p.sort_order },
        });
        flash(H('kp-msg'), true, 'Status updated.');
      } catch (e) { flash(H('kp-msg'), false, e.message); }
    }));

    // -- photos --
    H('kph-upload').addEventListener('click', async () => {
      const fileInput = H('kph-file');
      const file = fileInput.files && fileInput.files[0];
      if (!file) { flash(H('kph-msg'), false, 'Choose a photo first.'); return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('caption', H('kph-caption').value.trim());
      if (H('kph-phase').value) fd.append('phase_id', H('kph-phase').value);
      H('kph-upload').disabled = true;
      try {
        await api('/api/admin/koala/photos', { method: 'POST', body: fd });
        RENDER.koala();
      } catch (e) {
        flash(H('kph-msg'), false, e.message);
        H('kph-upload').disabled = false;
      }
    });
    pane.querySelectorAll('[data-delphoto]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this photo?')) return;
      await api('/api/admin/koala/photos/' + b.getAttribute('data-delphoto'), { method: 'DELETE' });
      RENDER.koala();
    }));
  };

  // ---------- groups ----------

  RENDER.groups = async function () {
    const pane = H('tab-groups');
    const [groups, users] = await Promise.all([
      api('/api/admin/groups').catch(() => []),
      api('/api/admin/users').catch(() => []),
    ]);
    const activeUsers = users.filter((u) => u.status === 'active');

    pane.innerHTML =
      '<div class="card"><h3 id="grp-form-title">Add a group</h3>' +
      '<input type="hidden" id="grp-id">' +
      '<div class="frow"><div><label class="flbl">Name</label><input class="fld" id="grp-name" placeholder="e.g. Fly-In Committee"></div></div>' +
      '<div id="grp-msg" class="msg"></div>' +
      '<div style="display:flex; gap:10px;"><button class="btn" id="grp-save">Save group</button>' +
      '<button class="btn ghost" id="grp-reset" hidden>Cancel editing</button></div></div>' +
      '<div class="card"><h3>Groups</h3>' +
      '<p class="muted" style="margin:0 0 14px;">Scope an event to a group in the Events tab to hide it from everyone except that group\'s members (admins always see everything).</p>' +
      '<div class="scroll-x"><table><thead><tr><th>Name</th><th>Members</th><th></th></tr></thead><tbody>' +
      groups.map((g) =>
        '<tr><td style="font-weight:600;">' + escapeHtml(g.name) + '</td>' +
        '<td>' + g.member_count + '</td>' +
        '<td style="white-space:nowrap;"><button class="btn ghost small" data-manage="' + g.id + '">Manage members</button> ' +
        '<button class="btn ghost small" data-edit="' + g.id + '">Rename</button> ' +
        '<button class="btn danger small" data-del="' + g.id + '">Delete</button></td></tr>' +
        '<tr id="grp-row-' + g.id + '" hidden><td colspan="3" style="background:#F6F8FC;"></td></tr>'
      ).join('') + '</tbody></table></div>' +
      (groups.length ? '' : '<div class="muted" style="padding:14px 0 4px;">No groups yet.</div>') + '</div>';

    const fill = (g) => {
      H('grp-id').value = g ? g.id : '';
      H('grp-name').value = g ? g.name : '';
      H('grp-form-title').textContent = g ? 'Rename group' : 'Add a group';
      H('grp-reset').hidden = !g;
    };

    H('grp-save').addEventListener('click', async () => {
      const id = H('grp-id').value;
      const body = { name: H('grp-name').value.trim() };
      try {
        await api('/api/admin/groups' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body });
        RENDER.groups();
      } catch (e) { flash(H('grp-msg'), false, e.message); }
    });
    H('grp-reset').addEventListener('click', () => fill(null));
    pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      fill(groups.find((g) => g.id === +b.getAttribute('data-edit')));
      pane.scrollIntoView({ behavior: 'smooth' });
    }));
    pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this group? Any events scoped to it will revert to their plain "members only" visibility instead of being group-restricted.')) return;
      await api('/api/admin/groups/' + b.getAttribute('data-del'), { method: 'DELETE' });
      RENDER.groups();
    }));
    pane.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', async () => {
      const groupId = b.getAttribute('data-manage');
      const row = H('grp-row-' + groupId);
      if (!row.hidden) { row.hidden = true; return; }
      const memberIds = await api('/api/admin/groups/' + groupId + '/members').catch(() => []);
      row.firstElementChild.innerHTML = activeUsers.length
        ? '<div style="display:flex; flex-direction:column; gap:8px;">' + activeUsers.map((u) =>
            '<label style="display:flex; align-items:center; gap:9px; cursor:pointer;">' +
            '<input type="checkbox" data-member-toggle="' + u.id + '"' + (memberIds.includes(u.id) ? ' checked' : '') + ' style="width:16px; height:16px; accent-color:#0A5BC4;">' +
            escapeHtml(u.name) + ' <span class="muted">(' + escapeHtml(u.email) + ')</span></label>'
          ).join('') + '</div>'
        : 'No active members to add.';
      row.querySelectorAll('[data-member-toggle]').forEach((cb) => cb.addEventListener('change', async () => {
        const userId = cb.getAttribute('data-member-toggle');
        cb.disabled = true;
        try {
          if (cb.checked) {
            await api('/api/admin/groups/' + groupId + '/members', { method: 'POST', body: { user_id: +userId } });
          } else {
            await api('/api/admin/groups/' + groupId + '/members/' + userId, { method: 'DELETE' });
          }
        } finally { cb.disabled = false; }
      }));
      row.hidden = false;
    }));
  };

  // ---------- polls ----------

  const POLL_STATUS = [['draft', 'Draft'], ['active', 'Active'], ['closed', 'Closed']];

  RENDER.polls = async function () {
    const pane = H('tab-polls');
    const polls = await api('/api/admin/polls').catch(() => []);

    pane.innerHTML =
      '<div class="card"><h3>Create a poll</h3>' +
      '<p class="muted" style="margin:0 0 14px;">New polls start as a draft — set the status to "Active" once you\'re ready for members to vote.</p>' +
      '<div class="frow"><div><label class="flbl">Question</label><input class="fld" id="pl-question"></div></div>' +
      '<div class="frow"><div><label class="flbl">Description (optional)</label><textarea class="fld" id="pl-desc" rows="2"></textarea></div></div>' +
      '<div id="pl-options"><label class="flbl">Options</label>' +
        '<div class="frow" style="margin-bottom:8px;"><input class="fld pl-opt"></div>' +
        '<div class="frow" style="margin-bottom:8px;"><input class="fld pl-opt"></div>' +
      '</div>' +
      '<button class="btn ghost small" id="pl-addopt" style="margin-bottom:16px;">+ Add option</button>' +
      '<div id="pl-msg" class="msg"></div>' +
      '<button class="btn" id="pl-save">Create poll</button></div>' +

      '<div class="card"><h3>All polls</h3><div class="scroll-x"><table><thead><tr>' +
      '<th>Question</th><th>Status</th><th>Votes</th><th></th></tr></thead><tbody>' +
      polls.map((p) => {
        const totalVotes = p.options.reduce((s, o) => s + o.vote_count, 0);
        return '<tr><td style="font-weight:600;">' + escapeHtml(p.question) + '</td>' +
        '<td><select class="fld" style="width:auto;" data-quickstatus="' + p.id + '">' + options(POLL_STATUS, p.status) + '</select></td>' +
        '<td>' + totalVotes + '</td>' +
        '<td style="white-space:nowrap;"><button class="btn ghost small" data-manage="' + p.id + '">' + (p.status === 'draft' ? 'Manage options' : 'Results') + '</button> ' +
        '<button class="btn danger small" data-del="' + p.id + '">Delete</button></td></tr>' +
        '<tr id="pl-row-' + p.id + '" hidden><td colspan="4" style="background:#F6F8FC;"></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (polls.length ? '' : '<div class="muted" style="padding:14px 0 4px;">No polls yet.</div>') + '</div>';

    H('pl-addopt').addEventListener('click', () => {
      const div = document.createElement('div');
      div.className = 'frow';
      div.style.marginBottom = '8px';
      div.innerHTML = '<input class="fld pl-opt">';
      H('pl-options').insertBefore(div, H('pl-addopt'));
    });

    H('pl-save').addEventListener('click', async () => {
      const opts = Array.from(pane.querySelectorAll('.pl-opt')).map((i) => i.value.trim()).filter(Boolean);
      const body = { question: H('pl-question').value.trim(), description: H('pl-desc').value.trim(), options: opts };
      try {
        await api('/api/admin/polls', { method: 'POST', body });
        RENDER.polls();
      } catch (e) { flash(H('pl-msg'), false, e.message); }
    });

    pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this poll? All votes are removed too.')) return;
      await api('/api/admin/polls/' + b.getAttribute('data-del'), { method: 'DELETE' });
      RENDER.polls();
    }));

    pane.querySelectorAll('[data-quickstatus]').forEach((sel) => sel.addEventListener('change', async () => {
      const p = polls.find((x) => x.id === +sel.getAttribute('data-quickstatus'));
      if (!p) return;
      try {
        await api('/api/admin/polls/' + p.id, {
          method: 'PUT',
          body: { question: p.question, description: p.description, status: sel.value, closes_at: p.closes_at },
        });
        RENDER.polls();
      } catch (e) { flash(H('pl-msg'), false, e.message); }
    }));

    pane.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', async () => {
      const pollId = b.getAttribute('data-manage');
      const p = polls.find((x) => x.id === +pollId);
      const row = H('pl-row-' + pollId);
      if (!row.hidden) { row.hidden = true; return; }
      if (p.status === 'draft') {
        row.firstElementChild.innerHTML =
          '<div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">' + p.options.map((o) =>
            '<div style="display:flex; align-items:center; gap:10px;"><span style="flex:1;">' + escapeHtml(o.label) + '</span>' +
            '<button class="btn danger small" data-delopt="' + o.id + '">Remove</button></div>'
          ).join('') + '</div>' +
          '<div style="display:flex; gap:10px;"><input class="fld" id="pl-newopt-' + pollId + '" placeholder="New option" style="max-width:260px;">' +
          '<button class="btn ghost small" data-addopt="' + pollId + '">Add</button></div>';
        row.querySelector('[data-addopt]').addEventListener('click', async () => {
          const input = H('pl-newopt-' + pollId);
          if (!input.value.trim()) return;
          try {
            await api('/api/admin/polls/' + pollId + '/options', { method: 'POST', body: { label: input.value.trim() } });
            RENDER.polls();
          } catch (e) { flash(H('pl-msg'), false, e.message); }
        });
        row.querySelectorAll('[data-delopt]').forEach((db) => db.addEventListener('click', async () => {
          await api('/api/admin/polls/' + pollId + '/options/' + db.getAttribute('data-delopt'), { method: 'DELETE' });
          RENDER.polls();
        }));
      } else {
        const totalVotes = p.options.reduce((s, o) => s + o.vote_count, 0);
        row.firstElementChild.innerHTML = p.options.map((o) => {
          const pct = totalVotes ? Math.round((o.vote_count / totalVotes) * 100) : 0;
          return '<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:4px;">' +
            '<span>' + escapeHtml(o.label) + '</span><span class="muted">' + o.vote_count + ' (' + pct + '%)</span></div>' +
            '<div style="background:#e2e8f1; border-radius:6px; height:8px;"><div style="background:#0A5BC4; width:' + pct + '%; height:8px; border-radius:6px;"></div></div></div>';
        }).join('');
      }
      row.hidden = false;
    }));
  };

  boot();
});

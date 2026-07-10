// EAA Chapter 283 — API (Cloudflare Pages Functions)
// Single router for every /api/* endpoint. Bindings (wrangler.toml):
//   DB   — D1 database        DOCS — R2 bucket for uploaded documents
// Env vars: SETUP_KEY — required by POST /api/setup to bootstrap the first admin.

const SESSION_COOKIE = 'eaa283_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

// ---------- small helpers ----------

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

const err = (message, status = 400) => json({ error: message }, status);

const bytesToHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const hexToBytes = (hex) => new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));
const randomHex = (n) => bytesToHex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPassword(password, saltHex) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS },
    keyMaterial, 256);
  return bytesToHex(new Uint8Array(bits));
}

const normalizeAnswer = (a) => String(a).trim().toLowerCase();

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

function sessionCookie(token, maxAgeSeconds) {
  return SESSION_COOKIE + '=' + token +
    '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + maxAgeSeconds;
}

async function getSessionUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.role_title, u.member_since, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).bind(token).first();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return row;
}

const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

async function readBody(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

// ---------- router ----------

export async function onRequest(context) {
  const { request, env, params } = context;
  const segments = params.route || [];
  const path = segments.join('/');
  const method = request.method;

  try {
    // ============ PUBLIC ============

    if (path === 'banner' && method === 'GET') {
      const row = await env.DB.prepare('SELECT text, active, updated_at FROM banner WHERE id = 1').first();
      return json(row || { text: '', active: 0, updated_at: '' });
    }

    if (path === 'events' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, title, date, start_time, end_time, location, kind, description FROM events WHERE members_only = 0 AND group_id IS NULL ORDER BY date').all();
      return json(results);
    }

    if (path === 'posts' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, title, tag, body, published_at FROM posts WHERE members_only = 0 ORDER BY published_at DESC').all();
      return json(results);
    }

    if (path === 'newsletters' && method === 'GET') {
      const { results } = await env.DB.prepare(
        "SELECT id, name, posted_at FROM documents WHERE category = 'newsletter' AND members_only = 0 ORDER BY posted_at DESC").all();
      return json(results);
    }

    if (path === 'subscribe' && method === 'POST') {
      const { email } = await readBody(request);
      if (!isValidEmail(email)) return err('Please enter a valid email address.');
      await env.DB.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').bind(email.trim()).run();
      return json({ ok: true });
    }

    if (path === 'unsubscribe' && method === 'POST') {
      const { email } = await readBody(request);
      if (!isValidEmail(email)) return err('Please enter a valid email address.');
      await env.DB.prepare('DELETE FROM subscribers WHERE email = ?').bind(email.trim()).run();
      return json({ ok: true });
    }

    if (path === 'signup' && method === 'POST') {
      const { name, email, password, security_question, security_answer } = await readBody(request);
      if (!name || String(name).trim().length < 2) return err('Please enter your full name.');
      if (!isValidEmail(email)) return err('Please enter a valid email address.');
      if (!password || String(password).length < 8) return err('Password must be at least 8 characters.');
      if (!security_question || !String(security_question).trim()) return err('Choose a security question — it lets you reset your password later without emailing an admin.');
      if (!security_answer || !String(security_answer).trim()) return err('Provide an answer to your security question.');
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.trim()).first();
      if (existing) return err('An account with that email already exists.', 409);
      const salt = randomHex(16);
      const hash = await hashPassword(String(password), salt);
      const answerSalt = randomHex(16);
      const answerHash = await hashPassword(normalizeAnswer(security_answer), answerSalt);
      await env.DB.prepare(
        `INSERT INTO users (email, name, password_hash, salt, role, status, security_question, security_answer_hash, security_answer_salt)
         VALUES (?, ?, ?, ?, 'member', 'pending', ?, ?, ?)`)
        .bind(email.trim(), String(name).trim(), hash, salt, String(security_question).trim(), answerHash, answerSalt).run();
      return json({ ok: true, message: 'Account created. A chapter administrator will verify your membership before access is granted.' });
    }

    if (path === 'login' && method === 'POST') {
      const { email, password } = await readBody(request);
      if (!isValidEmail(email) || !password) return err('Enter your email and password.');
      const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.trim()).first();
      const badCreds = 'Incorrect email or password.';
      if (!user) return err(badCreds, 401);
      const hash = await hashPassword(String(password), user.salt);
      if (!timingSafeEqual(hash, user.password_hash)) return err(badCreds, 401);
      if (user.status === 'pending') return err('Your account is awaiting verification by a chapter administrator. You will be able to sign in once your membership is confirmed.', 403);
      if (user.status !== 'active') return err('This account has been disabled. Contact a chapter administrator.', 403);
      const token = randomHex(32);
      const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
      await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
        .bind(token, user.id, expires).run();
      return json(
        { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } },
        200, { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400) });
    }

    if (path === 'logout' && method === 'POST') {
      const token = getCookie(request, SESSION_COOKIE);
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
    }

    // Forgot password — no email infrastructure, so recovery uses a security question
    // set at signup. Step 1 must not reveal whether an account/question exists, so a
    // nonexistent, question-less, or currently-locked account all get the same decoy.
    if (path === 'forgot/question' && method === 'POST') {
      const DECOY_QUESTION = 'What is your chapter member ID?';
      const { email } = await readBody(request);
      if (!isValidEmail(email)) return err('Please enter a valid email address.');
      const user = await env.DB.prepare('SELECT security_question, security_locked_until FROM users WHERE email = ?')
        .bind(email.trim()).first();
      const locked = user && user.security_locked_until && new Date(user.security_locked_until) > new Date();
      if (user && user.security_question && !locked) {
        return json({ question: user.security_question });
      }
      // Lock has expired — clear it so the member can try again with the real question next time.
      if (user && user.security_locked_until && !locked) {
        await env.DB.prepare('UPDATE users SET security_fail_count = 0, security_locked_until = NULL WHERE email = ?')
          .bind(email.trim()).run();
      }
      return json({ question: DECOY_QUESTION });
    }

    if (path === 'forgot/reset' && method === 'POST') {
      const { email, answer, new_password } = await readBody(request);
      if (!isValidEmail(email) || !answer) return err('Enter your email and answer.');
      if (!new_password || String(new_password).length < 8) return err('New password must be at least 8 characters.');
      const badAnswer = 'That answer didn’t match our records, or this account can’t use security-question reset.';
      const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.trim()).first();
      if (!user || !user.security_question || !user.security_answer_hash) return err(badAnswer);
      if (user.security_locked_until && new Date(user.security_locked_until) > new Date()) {
        return err('Too many attempts. Try again after ' + new Date(user.security_locked_until).toLocaleString() + '.');
      }
      const hash = await hashPassword(normalizeAnswer(answer), user.security_answer_salt);
      if (!timingSafeEqual(hash, user.security_answer_hash)) {
        const failCount = (user.security_fail_count || 0) + 1;
        const lockedUntil = failCount >= 5 ? new Date(Date.now() + 30 * 60000).toISOString() : null;
        await env.DB.prepare('UPDATE users SET security_fail_count = ?, security_locked_until = ? WHERE id = ?')
          .bind(failCount, lockedUntil, user.id).run();
        return err(badAnswer);
      }
      const salt = randomHex(16);
      const passHash = await hashPassword(String(new_password), salt);
      await env.DB.prepare(
        'UPDATE users SET password_hash = ?, salt = ?, security_fail_count = 0, security_locked_until = NULL WHERE id = ?')
        .bind(passHash, salt, user.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
      return json({ ok: true });
    }

    if (path === 'me' && method === 'GET') {
      const user = await getSessionUser(request, env);
      if (!user) return err('Not signed in.', 401);
      return json({ id: user.id, name: user.name, email: user.email, role: user.role, member_since: user.member_since, role_title: user.role_title });
    }

    // One-time bootstrap: creates the first admin. Refuses once any admin exists.
    if (path === 'setup' && method === 'POST') {
      const { key, name, email, password } = await readBody(request);
      if (!env.SETUP_KEY) return err('SETUP_KEY is not configured on the server.', 500);
      if (!key || !timingSafeEqual(String(key), env.SETUP_KEY)) return err('Invalid setup key.', 403);
      const admin = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
      if (admin) return err('Setup has already been completed — an admin account exists.', 409);
      if (!name || !isValidEmail(email) || !password || String(password).length < 8) {
        return err('Provide name, a valid email, and a password of at least 8 characters.');
      }
      const salt = randomHex(16);
      const hash = await hashPassword(String(password), salt);
      await env.DB.prepare(
        "INSERT INTO users (email, name, password_hash, salt, role, status) VALUES (?, ?, ?, ?, 'admin', 'active')")
        .bind(email.trim(), String(name).trim(), hash, salt).run();
      return json({ ok: true, message: 'Admin account created. You can now sign in at /admin/.' });
    }

    // Document download — public docs for everyone, members-only docs need an active session.
    if (segments[0] === 'documents' && segments.length === 2 && method === 'GET') {
      const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(+segments[1]).first();
      if (!doc) return err('Document not found.', 404);
      if (doc.members_only) {
        const user = await getSessionUser(request, env);
        if (!user || user.status !== 'active') return err('Sign in to the member portal to download this document.', 401);
      }
      const obj = await env.DOCS.get(doc.r2_key);
      if (!obj) return err('File is missing from storage.', 404);
      return new Response(obj.body, {
        headers: {
          'Content-Type': doc.mime || 'application/octet-stream',
          'Content-Disposition': 'inline; filename="' + doc.name.replace(/[^\w .()-]/g, '_') + '"',
          'Cache-Control': 'private, max-age=300',
        },
      });
    }

    // Koala build page — public info/phases/photos, no sign-in required.
    if (path === 'koala' && method === 'GET') {
      const info = await env.DB.prepare('SELECT * FROM koala_info WHERE id = 1').first();
      const { results: phases } = await env.DB.prepare('SELECT * FROM koala_phases ORDER BY sort_order, id').all();
      const { results: photos } = await env.DB.prepare(
        'SELECT id, caption, phase_id, sort_order FROM koala_photos ORDER BY sort_order, id').all();
      return json({ info: info || {}, phases, photos });
    }

    if (segments[0] === 'koala' && segments[1] === 'photos' && segments.length === 3 && method === 'GET') {
      const photo = await env.DB.prepare('SELECT r2_key, mime FROM koala_photos WHERE id = ?').bind(+segments[2]).first();
      if (!photo) return err('Photo not found.', 404);
      const obj = await env.DOCS.get(photo.r2_key);
      if (!obj) return err('File is missing from storage.', 404);
      return new Response(obj.body, {
        headers: { 'Content-Type': photo.mime || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
      });
    }

    // ============ MEMBER (active session required) ============

    if (segments[0] === 'member') {
      const user = await getSessionUser(request, env);
      if (!user || user.status !== 'active') return err('Sign in required.', 401);
      const sub = segments.slice(1).join('/');

      if (sub === 'events' && method === 'GET') {
        const isAdmin = user.role === 'admin' ? 1 : 0;
        const { results } = await env.DB.prepare(
          `SELECT e.*, r.status AS my_rsvp
           FROM events e LEFT JOIN rsvps r ON r.event_id = e.id AND r.user_id = ?1
           WHERE ?2 = 1 OR e.group_id IS NULL OR e.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?1)
           ORDER BY e.date`).bind(user.id, isAdmin).all();
        return json(results);
      }

      if (sub === 'rsvp' && method === 'POST') {
        const { event_id, status } = await readBody(request);
        const ev = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(+event_id).first();
        if (!ev) return err('Event not found.', 404);
        if (status === 'going' || status === 'not_going') {
          await env.DB.prepare(
            `INSERT INTO rsvps (user_id, event_id, status) VALUES (?, ?, ?)
             ON CONFLICT (user_id, event_id) DO UPDATE SET status = excluded.status`)
            .bind(user.id, +event_id, status).run();
        } else {
          await env.DB.prepare('DELETE FROM rsvps WHERE user_id = ? AND event_id = ?').bind(user.id, +event_id).run();
        }
        return json({ ok: true });
      }

      if (sub === 'documents' && method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, name, category, posted_at, size FROM documents ORDER BY posted_at DESC').all();
        return json(results);
      }

      if (sub === 'posts' && method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, title, tag, body, published_at FROM posts WHERE members_only = 1 ORDER BY published_at DESC').all();
        return json(results);
      }

      if (sub === 'directory' && method === 'GET') {
        const { results } = await env.DB.prepare(
          "SELECT name, role, role_title, member_since FROM users WHERE status = 'active' ORDER BY CASE WHEN role_title != '' THEN 0 ELSE 1 END, name").all();
        return json(results);
      }

      if (sub === 'dues' && method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT year, status, paid_date FROM dues WHERE user_id = ? ORDER BY year DESC').bind(user.id).all();
        return json(results);
      }

      if (sub === 'security' && method === 'GET') {
        const row = await env.DB.prepare('SELECT security_question FROM users WHERE id = ?').bind(user.id).first();
        return json({ has_security_question: !!(row && row.security_question), security_question: (row && row.security_question) || '' });
      }

      if (sub === 'security' && method === 'POST') {
        const { security_question, security_answer } = await readBody(request);
        if (!security_question || !String(security_question).trim()) return err('Choose a security question.');
        if (!security_answer || !String(security_answer).trim()) return err('Provide an answer.');
        const answerSalt = randomHex(16);
        const answerHash = await hashPassword(normalizeAnswer(security_answer), answerSalt);
        await env.DB.prepare(
          'UPDATE users SET security_question = ?, security_answer_hash = ?, security_answer_salt = ?, security_fail_count = 0, security_locked_until = NULL WHERE id = ?')
          .bind(String(security_question).trim(), answerHash, answerSalt, user.id).run();
        return json({ ok: true });
      }

      if (sub === 'password' && method === 'POST') {
        const { current_password, new_password } = await readBody(request);
        if (!new_password || String(new_password).length < 8) return err('New password must be at least 8 characters.');
        const full = await env.DB.prepare('SELECT password_hash, salt FROM users WHERE id = ?').bind(user.id).first();
        const currentHash = await hashPassword(String(current_password || ''), full.salt);
        if (!timingSafeEqual(currentHash, full.password_hash)) return err('Current password is incorrect.', 401);
        const salt = randomHex(16);
        const hash = await hashPassword(String(new_password), salt);
        await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').bind(hash, salt, user.id).run();
        return json({ ok: true });
      }

      if (sub === 'attention' && method === 'GET') {
        const isAdmin = user.role === 'admin' ? 1 : 0;
        const { results: events } = await env.DB.prepare(
          `SELECT e.id, e.title, e.date FROM events e
           LEFT JOIN rsvps r ON r.event_id = e.id AND r.user_id = ?1
           WHERE (?2 = 1 OR e.group_id IS NULL OR e.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?1))
             AND e.date >= date('now') AND r.user_id IS NULL
           ORDER BY e.date`).bind(user.id, isAdmin).all();
        const { results: attentionPolls } = await env.DB.prepare(
          `SELECT p.id, p.question FROM polls p
           WHERE p.status = 'active' AND (p.closes_at IS NULL OR p.closes_at > datetime('now'))
             AND p.id NOT IN (SELECT poll_id FROM poll_votes WHERE user_id = ?)
           ORDER BY p.created_at DESC`).bind(user.id).all();
        const secRow = await env.DB.prepare('SELECT security_question FROM users WHERE id = ?').bind(user.id).first();
        return json({ events, polls: attentionPolls, needs_security_question: !(secRow && secRow.security_question) });
      }

      if (segments[1] === 'polls' && segments.length === 2 && method === 'GET') {
        const { results: allPolls } = await env.DB.prepare(
          "SELECT * FROM polls WHERE status IN ('active', 'closed') ORDER BY created_at DESC").all();
        const { results: allOptions } = await env.DB.prepare(
          `SELECT o.*, (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS vote_count
           FROM poll_options o ORDER BY o.sort_order`).all();
        const { results: myVotes } = await env.DB.prepare(
          'SELECT poll_id, option_id FROM poll_votes WHERE user_id = ?').bind(user.id).all();
        const myVoteByPoll = {};
        myVotes.forEach((v) => { myVoteByPoll[v.poll_id] = v.option_id; });
        const optsByPoll = {};
        allOptions.forEach((o) => { (optsByPoll[o.poll_id] = optsByPoll[o.poll_id] || []).push(o); });
        const shaped = allPolls.map((p) => ({
          id: p.id, question: p.question, description: p.description, status: p.status, closes_at: p.closes_at,
          voted: Object.prototype.hasOwnProperty.call(myVoteByPoll, p.id), my_option_id: myVoteByPoll[p.id] || null,
          options: (optsByPoll[p.id] || []).map((o) => ({ id: o.id, label: o.label, vote_count: o.vote_count })),
        }));
        return json({ active: shaped.filter((p) => p.status === 'active'), closed: shaped.filter((p) => p.status === 'closed') });
      }

      if (segments[1] === 'polls' && segments[3] === 'vote' && method === 'POST') {
        const pollId = +segments[2];
        const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
        if (!poll) return err('Poll not found.', 404);
        if (poll.status !== 'active') return err('This poll is not open for voting.');
        if (poll.closes_at && new Date(poll.closes_at) < new Date()) return err('This poll has closed.');
        const { option_id } = await readBody(request);
        const opt = await env.DB.prepare('SELECT id FROM poll_options WHERE id = ? AND poll_id = ?').bind(+option_id, pollId).first();
        if (!opt) return err('Choose a valid option.');
        try {
          await env.DB.prepare('INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)')
            .bind(pollId, +option_id, user.id).run();
        } catch (e) {
          return err('You already voted in this poll.', 409);
        }
        return json({ ok: true });
      }

      return err('Not found.', 404);
    }

    // ============ ADMIN ============

    if (segments[0] === 'admin') {
      const user = await getSessionUser(request, env);
      if (!user || user.status !== 'active' || user.role !== 'admin') return err('Admin access required.', 403);
      const sub = segments[1] || '';
      const id = segments[2] ? +segments[2] : null;

      if (sub === 'banner' && method === 'POST') {
        const { text, active } = await readBody(request);
        await env.DB.prepare(
          "UPDATE banner SET text = ?, active = ?, updated_at = datetime('now') WHERE id = 1")
          .bind(String(text || ''), active ? 1 : 0).run();
        return json({ ok: true });
      }

      if (sub === 'events') {
        if (method === 'GET') {
          const { results } = await env.DB.prepare(
            `SELECT e.*, g.name AS group_name,
                    (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going_count,
                    (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'not_going') AS not_going_count
             FROM events e LEFT JOIN groups g ON g.id = e.group_id ORDER BY e.date`).all();
          return json(results);
        }
        if (method === 'POST' && !id) {
          const b = await readBody(request);
          if (!b.title || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return err('Title and a date (YYYY-MM-DD) are required.');
          await env.DB.prepare(
            'INSERT INTO events (title, date, start_time, end_time, location, kind, description, members_only, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(b.title, b.date, b.start_time || '', b.end_time || '', b.location || 'Cherry Ridge Airport',
                  b.kind || 'Meeting', b.description || '', b.members_only ? 1 : 0, b.group_id ? +b.group_id : null).run();
          return json({ ok: true });
        }
        if (method === 'PUT' && id) {
          const b = await readBody(request);
          if (!b.title || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return err('Title and a date (YYYY-MM-DD) are required.');
          await env.DB.prepare(
            'UPDATE events SET title=?, date=?, start_time=?, end_time=?, location=?, kind=?, description=?, members_only=?, group_id=? WHERE id=?')
            .bind(b.title, b.date, b.start_time || '', b.end_time || '', b.location || '', b.kind || 'Meeting',
                  b.description || '', b.members_only ? 1 : 0, b.group_id ? +b.group_id : null, id).run();
          return json({ ok: true });
        }
        if (method === 'DELETE' && id) {
          await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
          return json({ ok: true });
        }
      }

      if (sub === 'rsvps' && method === 'GET') {
        const eventId = +(new URL(request.url).searchParams.get('event_id') || 0);
        const [going, notGoing, noResponse] = await Promise.all([
          env.DB.prepare(
            "SELECT u.name, u.email FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND r.status = 'going' ORDER BY u.name")
            .bind(eventId).all(),
          env.DB.prepare(
            "SELECT u.name, u.email FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND r.status = 'not_going' ORDER BY u.name")
            .bind(eventId).all(),
          env.DB.prepare(
            `SELECT u.name, u.email FROM users u
             WHERE u.status = 'active' AND u.id NOT IN (SELECT user_id FROM rsvps WHERE event_id = ?)
             ORDER BY u.name`).bind(eventId).all(),
        ]);
        return json({ going: going.results, not_going: notGoing.results, no_response: noResponse.results });
      }

      if (sub === 'posts') {
        if (method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM posts ORDER BY published_at DESC').all();
          return json(results);
        }
        if (method === 'POST' && !id) {
          const b = await readBody(request);
          if (!b.title) return err('Title is required.');
          await env.DB.prepare(
            'INSERT INTO posts (title, tag, body, members_only, published_at) VALUES (?, ?, ?, ?, ?)')
            .bind(b.title, b.tag || 'Announcement', b.body || '', b.members_only ? 1 : 0,
                  b.published_at || new Date().toISOString().slice(0, 10)).run();
          return json({ ok: true });
        }
        if (method === 'PUT' && id) {
          const b = await readBody(request);
          if (!b.title) return err('Title is required.');
          await env.DB.prepare(
            'UPDATE posts SET title=?, tag=?, body=?, members_only=?, published_at=? WHERE id=?')
            .bind(b.title, b.tag || 'Announcement', b.body || '', b.members_only ? 1 : 0,
                  b.published_at || new Date().toISOString().slice(0, 10), id).run();
          return json({ ok: true });
        }
        if (method === 'DELETE' && id) {
          await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
          return json({ ok: true });
        }
      }

      if (sub === 'documents') {
        if (method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM documents ORDER BY posted_at DESC').all();
          return json(results);
        }
        if (method === 'POST' && !id) {
          const fd = await request.formData();
          const file = fd.get('file');
          if (!file || typeof file === 'string') return err('Attach a file to upload.');
          const name = String(fd.get('name') || file.name || 'Document').trim();
          const category = String(fd.get('category') || 'reference');
          const membersOnly = fd.get('members_only') === '1' ? 1 : 0;
          if (file.size > 25 * 1024 * 1024) return err('Files must be 25 MB or smaller.');
          const key = 'docs/' + Date.now() + '-' + randomHex(4) + '-' + (file.name || 'file').replace(/[^\w.-]/g, '_');
          await env.DOCS.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
          await env.DB.prepare(
            'INSERT INTO documents (name, category, r2_key, mime, size, members_only) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(name, category, key, file.type || 'application/octet-stream', file.size, membersOnly).run();
          return json({ ok: true });
        }
        if (method === 'DELETE' && id) {
          const doc = await env.DB.prepare('SELECT r2_key FROM documents WHERE id = ?').bind(id).first();
          if (doc) {
            await env.DOCS.delete(doc.r2_key);
            await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();
          }
          return json({ ok: true });
        }
      }

      if (sub === 'users') {
        if (method === 'GET') {
          const year = new Date().getFullYear();
          const { results } = await env.DB.prepare(
            `SELECT u.id, u.email, u.name, u.role, u.status, u.role_title, u.member_since, u.created_at,
                    (SELECT d.status FROM dues d WHERE d.user_id = u.id AND d.year = ?) AS dues_status
             FROM users u ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.name`).bind(year).all();
          return json(results);
        }
        if (method === 'PUT' && id) {
          const b = await readBody(request);
          const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
          if (!target) return err('User not found.', 404);
          const status = ['pending', 'active', 'disabled'].includes(b.status) ? b.status : target.status;
          const role = ['member', 'admin'].includes(b.role) ? b.role : target.role;
          // Don't let an admin remove or disable the last admin (including themselves).
          if (target.role === 'admin' && (role !== 'admin' || status !== 'active')) {
            const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").first();
            if (c.n <= 1) return err('Cannot demote or disable the only active admin.');
          }
          await env.DB.prepare('UPDATE users SET status=?, role=?, role_title=?, member_since=? WHERE id=?')
            .bind(status, role,
                  b.role_title != null ? String(b.role_title) : target.role_title,
                  b.member_since != null ? String(b.member_since) : target.member_since, id).run();
          if (status === 'disabled') {
            await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
          }
          return json({ ok: true });
        }
        // POST /api/admin/users/:id/dues
        if (method === 'POST' && id && segments[3] === 'dues') {
          const b = await readBody(request);
          const year = +b.year;
          if (!year || year < 2000 || year > 2100) return err('Provide a valid year.');
          const status = ['paid', 'unpaid', 'exempt'].includes(b.status) ? b.status : 'unpaid';
          await env.DB.prepare(
            `INSERT INTO dues (user_id, year, status, paid_date) VALUES (?, ?, ?, ?)
             ON CONFLICT (user_id, year) DO UPDATE SET status = excluded.status, paid_date = excluded.paid_date`)
            .bind(id, year, status, b.paid_date || (status === 'paid' ? new Date().toISOString().slice(0, 10) : '')).run();
          return json({ ok: true });
        }
        // GET /api/admin/users/:id/dues
        if (method === 'GET' && id && segments[3] === 'dues') {
          const { results } = await env.DB.prepare(
            'SELECT year, status, paid_date FROM dues WHERE user_id = ? ORDER BY year DESC').bind(id).all();
          return json(results);
        }
      }

      if (sub === 'subscribers' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT email, created_at FROM subscribers ORDER BY created_at DESC').all();
        return json(results);
      }

      if (sub === 'groups') {
        if (method === 'GET' && !id) {
          const { results } = await env.DB.prepare(
            `SELECT g.*, (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count
             FROM groups g ORDER BY g.name`).all();
          return json(results);
        }
        if (method === 'POST' && !id) {
          const b = await readBody(request);
          if (!b.name || !String(b.name).trim()) return err('Group name is required.');
          const existing = await env.DB.prepare('SELECT id FROM groups WHERE name = ?').bind(String(b.name).trim()).first();
          if (existing) return err('A group with that name already exists.', 409);
          await env.DB.prepare('INSERT INTO groups (name) VALUES (?)').bind(String(b.name).trim()).run();
          return json({ ok: true });
        }
        if (method === 'PUT' && id) {
          const b = await readBody(request);
          if (!b.name || !String(b.name).trim()) return err('Group name is required.');
          await env.DB.prepare('UPDATE groups SET name = ? WHERE id = ?').bind(String(b.name).trim(), id).run();
          return json({ ok: true });
        }
        if (method === 'DELETE' && id) {
          await env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(id).run();
          return json({ ok: true });
        }
        // GET /api/admin/groups/:id/members — list member user_ids currently in the group
        if (method === 'GET' && id && segments[3] === 'members') {
          const { results } = await env.DB.prepare('SELECT user_id FROM group_members WHERE group_id = ?').bind(id).all();
          return json(results.map((r) => r.user_id));
        }
        // POST /api/admin/groups/:id/members  { user_id }
        if (method === 'POST' && id && segments[3] === 'members') {
          const b = await readBody(request);
          if (!b.user_id) return err('user_id is required.');
          await env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').bind(id, +b.user_id).run();
          return json({ ok: true });
        }
        // DELETE /api/admin/groups/:id/members/:userId
        if (method === 'DELETE' && id && segments[3] === 'members' && segments[4]) {
          await env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(id, +segments[4]).run();
          return json({ ok: true });
        }
        return err('Not found.', 404);
      }

      if (sub === 'polls') {
        if (method === 'GET' && !id) {
          const { results: polls } = await env.DB.prepare('SELECT * FROM polls ORDER BY created_at DESC').all();
          const { results: options } = await env.DB.prepare(
            `SELECT o.*, (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS vote_count
             FROM poll_options o ORDER BY o.sort_order`).all();
          const byPoll = {};
          options.forEach((o) => { (byPoll[o.poll_id] = byPoll[o.poll_id] || []).push(o); });
          return json(polls.map((p) => Object.assign({}, p, { options: byPoll[p.id] || [] })));
        }
        if (method === 'POST' && !id) {
          const b = await readBody(request);
          if (!b.question || !String(b.question).trim()) return err('Poll question is required.');
          const opts = Array.isArray(b.options) ? b.options.map((o) => String(o).trim()).filter(Boolean) : [];
          if (opts.length < 2) return err('Provide at least two options.');
          const res = await env.DB.prepare('INSERT INTO polls (question, description) VALUES (?, ?)')
            .bind(String(b.question).trim(), String(b.description || '')).run();
          const pollId = res.meta.last_row_id;
          for (let i = 0; i < opts.length; i++) {
            await env.DB.prepare('INSERT INTO poll_options (poll_id, label, sort_order) VALUES (?, ?, ?)').bind(pollId, opts[i], i).run();
          }
          return json({ ok: true });
        }
        if (method === 'PUT' && id && !segments[3]) {
          const b = await readBody(request);
          if (!b.question || !String(b.question).trim()) return err('Poll question is required.');
          const status = ['draft', 'active', 'closed'].includes(b.status) ? b.status : 'draft';
          await env.DB.prepare('UPDATE polls SET question=?, description=?, status=?, closes_at=? WHERE id=?')
            .bind(String(b.question).trim(), String(b.description || ''), status, b.closes_at || null, id).run();
          return json({ ok: true });
        }
        if (method === 'DELETE' && id && !segments[3]) {
          await env.DB.prepare('DELETE FROM polls WHERE id = ?').bind(id).run();
          return json({ ok: true });
        }
        if (method === 'GET' && id && segments[3] === 'results') {
          const { results } = await env.DB.prepare(
            `SELECT o.id, o.label, (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS vote_count
             FROM poll_options o WHERE o.poll_id = ? ORDER BY o.sort_order`).bind(id).all();
          return json(results);
        }
        if (method === 'POST' && id && segments[3] === 'options') {
          const poll = await env.DB.prepare('SELECT status FROM polls WHERE id = ?').bind(id).first();
          if (!poll) return err('Poll not found.', 404);
          if (poll.status !== 'draft') return err('Options can only be changed while the poll is a draft.');
          const b = await readBody(request);
          if (!b.label || !String(b.label).trim()) return err('Option label is required.');
          const maxOrder = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM poll_options WHERE poll_id = ?').bind(id).first();
          await env.DB.prepare('INSERT INTO poll_options (poll_id, label, sort_order) VALUES (?, ?, ?)')
            .bind(id, String(b.label).trim(), maxOrder.m + 1).run();
          return json({ ok: true });
        }
        if (method === 'DELETE' && id && segments[3] === 'options' && segments[4]) {
          const poll = await env.DB.prepare('SELECT status FROM polls WHERE id = ?').bind(id).first();
          if (!poll) return err('Poll not found.', 404);
          if (poll.status !== 'draft') return err('Options can only be changed while the poll is a draft.');
          await env.DB.prepare('DELETE FROM poll_options WHERE id = ? AND poll_id = ?').bind(+segments[4], id).run();
          return json({ ok: true });
        }
        return err('Not found.', 404);
      }

      if (sub === 'koala') {
        const resource = segments[2] || '';
        const subId = segments[3] ? +segments[3] : null;

        if (resource === 'info' && method === 'POST') {
          const b = await readBody(request);
          await env.DB.prepare(
            `UPDATE koala_info SET intro=?, stat1_value=?, stat1_label=?, stat2_value=?, stat2_label=?,
             stat3_value=?, stat3_label=?, cta_text=?, updated_at=datetime('now') WHERE id=1`)
            .bind(String(b.intro || ''), String(b.stat1_value || ''), String(b.stat1_label || ''),
                  String(b.stat2_value || ''), String(b.stat2_label || ''), String(b.stat3_value || ''),
                  String(b.stat3_label || ''), String(b.cta_text || '')).run();
          return json({ ok: true });
        }

        if (resource === 'phases') {
          if (method === 'GET') {
            const { results } = await env.DB.prepare('SELECT * FROM koala_phases ORDER BY sort_order, id').all();
            return json(results);
          }
          if (method === 'POST' && !subId) {
            const b = await readBody(request);
            if (!b.name) return err('Phase name is required.');
            await env.DB.prepare(
              'INSERT INTO koala_phases (name, status, description, sort_order) VALUES (?, ?, ?, ?)')
              .bind(b.name, ['complete', 'in_progress', 'upcoming'].includes(b.status) ? b.status : 'upcoming',
                    b.description || '', +b.sort_order || 0).run();
            return json({ ok: true });
          }
          if (method === 'PUT' && subId) {
            const b = await readBody(request);
            if (!b.name) return err('Phase name is required.');
            await env.DB.prepare(
              `UPDATE koala_phases SET name=?, status=?, description=?, sort_order=?, updated_at=datetime('now') WHERE id=?`)
              .bind(b.name, ['complete', 'in_progress', 'upcoming'].includes(b.status) ? b.status : 'upcoming',
                    b.description || '', +b.sort_order || 0, subId).run();
            return json({ ok: true });
          }
          if (method === 'DELETE' && subId) {
            await env.DB.prepare('DELETE FROM koala_phases WHERE id = ?').bind(subId).run();
            return json({ ok: true });
          }
        }

        if (resource === 'photos') {
          if (method === 'GET') {
            const { results } = await env.DB.prepare('SELECT * FROM koala_photos ORDER BY sort_order, id').all();
            return json(results);
          }
          if (method === 'POST' && !subId) {
            const fd = await request.formData();
            const file = fd.get('file');
            if (!file || typeof file === 'string') return err('Attach a photo to upload.');
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return err('Photos must be JPEG, PNG, or WebP.');
            if (file.size > 10 * 1024 * 1024) return err('Photos must be 10 MB or smaller.');
            const caption = String(fd.get('caption') || '').trim();
            const phaseId = fd.get('phase_id') ? +fd.get('phase_id') : null;
            const sortOrder = fd.get('sort_order') ? +fd.get('sort_order') : 0;
            const key = 'koala/' + Date.now() + '-' + randomHex(4) + '-' + (file.name || 'photo').replace(/[^\w.-]/g, '_');
            await env.DOCS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
            await env.DB.prepare(
              'INSERT INTO koala_photos (r2_key, mime, size, caption, phase_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
              .bind(key, file.type, file.size, caption, phaseId, sortOrder).run();
            return json({ ok: true });
          }
          if (method === 'DELETE' && subId) {
            const photo = await env.DB.prepare('SELECT r2_key FROM koala_photos WHERE id = ?').bind(subId).first();
            if (photo) {
              await env.DOCS.delete(photo.r2_key);
              await env.DB.prepare('DELETE FROM koala_photos WHERE id = ?').bind(subId).run();
            }
            return json({ ok: true });
          }
        }

        return err('Not found.', 404);
      }

      return err('Not found.', 404);
    }

    return err('Not found.', 404);
  } catch (e) {
    console.error('[api]', path, e);
    return err('Server error: ' + (e && e.message ? e.message : 'unknown'), 500);
  }
}

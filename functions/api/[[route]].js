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
        'SELECT id, title, date, start_time, end_time, location, kind, description FROM events WHERE members_only = 0 ORDER BY date').all();
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

    if (path === 'signup' && method === 'POST') {
      const { name, email, password } = await readBody(request);
      if (!name || String(name).trim().length < 2) return err('Please enter your full name.');
      if (!isValidEmail(email)) return err('Please enter a valid email address.');
      if (!password || String(password).length < 8) return err('Password must be at least 8 characters.');
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.trim()).first();
      if (existing) return err('An account with that email already exists.', 409);
      const salt = randomHex(16);
      const hash = await hashPassword(String(password), salt);
      await env.DB.prepare(
        "INSERT INTO users (email, name, password_hash, salt, role, status) VALUES (?, ?, ?, ?, 'member', 'pending')")
        .bind(email.trim(), String(name).trim(), hash, salt).run();
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

    // ============ MEMBER (active session required) ============

    if (segments[0] === 'member') {
      const user = await getSessionUser(request, env);
      if (!user || user.status !== 'active') return err('Sign in required.', 401);
      const sub = segments.slice(1).join('/');

      if (sub === 'events' && method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT e.*, CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS going
           FROM events e LEFT JOIN rsvps r ON r.event_id = e.id AND r.user_id = ?
           ORDER BY e.date`).bind(user.id).all();
        return json(results);
      }

      if (sub === 'rsvp' && method === 'POST') {
        const { event_id, going } = await readBody(request);
        const ev = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(+event_id).first();
        if (!ev) return err('Event not found.', 404);
        if (going) {
          await env.DB.prepare('INSERT OR IGNORE INTO rsvps (user_id, event_id) VALUES (?, ?)').bind(user.id, +event_id).run();
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
            `SELECT e.*, (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id) AS rsvp_count
             FROM events e ORDER BY e.date`).all();
          return json(results);
        }
        if (method === 'POST' && !id) {
          const b = await readBody(request);
          if (!b.title || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return err('Title and a date (YYYY-MM-DD) are required.');
          await env.DB.prepare(
            'INSERT INTO events (title, date, start_time, end_time, location, kind, description, members_only) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(b.title, b.date, b.start_time || '', b.end_time || '', b.location || 'Cherry Ridge Airport',
                  b.kind || 'Meeting', b.description || '', b.members_only ? 1 : 0).run();
          return json({ ok: true });
        }
        if (method === 'PUT' && id) {
          const b = await readBody(request);
          if (!b.title || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return err('Title and a date (YYYY-MM-DD) are required.');
          await env.DB.prepare(
            'UPDATE events SET title=?, date=?, start_time=?, end_time=?, location=?, kind=?, description=?, members_only=? WHERE id=?')
            .bind(b.title, b.date, b.start_time || '', b.end_time || '', b.location || '', b.kind || 'Meeting',
                  b.description || '', b.members_only ? 1 : 0, id).run();
          return json({ ok: true });
        }
        if (method === 'DELETE' && id) {
          await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
          return json({ ok: true });
        }
      }

      if (sub === 'rsvps' && method === 'GET') {
        const eventId = +(new URL(request.url).searchParams.get('event_id') || 0);
        const { results } = await env.DB.prepare(
          'SELECT u.name, u.email FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? ORDER BY u.name').bind(eventId).all();
        return json(results);
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

      return err('Not found.', 404);
    }

    return err('Not found.', 404);
  } catch (e) {
    console.error('[api]', path, e);
    return err('Server error: ' + (e && e.message ? e.message : 'unknown'), 500);
  }
}

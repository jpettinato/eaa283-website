-- EAA Chapter 283 — D1 database schema
-- Apply locally:      npx wrangler d1 execute eaa283-db --local --file=schema.sql
-- Apply to production: npx wrangler d1 execute eaa283-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',   -- 'member' | 'admin'
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'active' | 'disabled'
  role_title    TEXT DEFAULT '',                  -- e.g. 'President', shown in member directory
  member_since  TEXT DEFAULT '',                  -- e.g. '2016'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Single-row table controlling the site-wide announcement bar.
CREATE TABLE IF NOT EXISTS banner (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  text       TEXT NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  date         TEXT NOT NULL,              -- 'YYYY-MM-DD'
  start_time   TEXT NOT NULL DEFAULT '',   -- e.g. '6:00 PM'
  end_time     TEXT NOT NULL DEFAULT '',
  location     TEXT NOT NULL DEFAULT 'Cherry Ridge Airport',
  kind         TEXT NOT NULL DEFAULT 'Meeting', -- Meeting | Young Eagles | Fly-In | Board | Build
  description  TEXT NOT NULL DEFAULT '',
  members_only INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  tag          TEXT NOT NULL DEFAULT 'Announcement', -- Announcement | Project | Event | Chapter
  body         TEXT NOT NULL DEFAULT '',
  members_only INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'reference', -- minutes | agenda | newsletter | reference
  r2_key       TEXT NOT NULL,
  mime         TEXT NOT NULL DEFAULT 'application/pdf',
  size         INTEGER NOT NULL DEFAULT 0,
  members_only INTEGER NOT NULL DEFAULT 1,
  posted_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dues (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year      INTEGER NOT NULL,
  status    TEXT NOT NULL DEFAULT 'unpaid', -- 'paid' | 'unpaid' | 'exempt'
  paid_date TEXT DEFAULT '',
  UNIQUE (user_id, year)
);

CREATE TABLE IF NOT EXISTS rsvps (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, event_id)
);

-- Newsletter signup addresses collected from the News page.
CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_events_date   ON events(date);
CREATE INDEX IF NOT EXISTS idx_posts_pub     ON posts(published_at);

-- ============ SEED DATA (from the approved design mockups) ============

INSERT OR IGNORE INTO banner (id, text, active)
VALUES (1, 'June Chapter Meeting — Wednesday, June 24th at 6:00 PM · Cherry Ridge Airport', 1);

-- Fixed ids keep re-running this file idempotent (INSERT OR IGNORE skips existing rows).
INSERT OR IGNORE INTO events (id, title, date, start_time, end_time, location, kind, description, members_only) VALUES
  (1, 'June Chapter Meeting', '2026-06-24', '6:00 PM', '7:00 PM', 'Cherry Ridge Airport', 'Meeting',
   'Our monthly gathering of the chapter. We share project updates, plan upcoming events, and welcome new and prospective members. Stick around afterward to talk flying.', 0),
  (2, 'Young Eagles Flight Day', '2026-07-11', '9:00 AM', '1:00 PM', 'Cherry Ridge Airport', 'Young Eagles',
   'Free introductory flights for kids ages 8–17. Volunteer pilots take young aviators up for a first taste of flight. Registration opens the morning of the event — families welcome.', 0),
  (3, 'July Chapter Meeting', '2026-07-22', '6:00 PM', '7:00 PM', 'Cherry Ridge Airport', 'Meeting',
   'Monthly chapter meeting with updates on the Koala build and a guest speaker. Open to everyone.', 0),
  (4, 'Pancake Breakfast Fly-In', '2026-08-15', '8:00 AM', '11:00 AM', 'Cherry Ridge Airport', 'Fly-In',
   'Our annual fly-in breakfast. Fly in or drive in for pancakes, coffee, and good company on the ramp. A chapter favorite for the whole family.', 0),
  (5, 'Board Meeting (members only)', '2026-06-29', '7:00 PM', '8:00 PM', 'Clubhouse', 'Board',
   'Monthly board meeting for chapter officers and members.', 1),
  (6, 'Koala Work Party', '2026-07-02', '6:00 PM', '9:00 PM', 'Hangar', 'Build',
   'Thursday-night build session on the Super Koala. All hands welcome.', 1);

INSERT OR IGNORE INTO posts (id, title, tag, body, members_only, published_at) VALUES
  (1, 'June Chapter Meeting set for the 24th', 'Announcement',
   'Mark your calendars — our June meeting is Wednesday the 24th at 6:00 PM at Cherry Ridge Airport. We''ll cover Koala build progress, summer events, and welcome new members. All are welcome.', 0, '2026-06-10'),
  (2, 'Koala build reaches the wing-covering stage', 'Project',
   'Thursday-night crews wrapped fabric on the wings — a big milestone toward first flight.', 0, '2026-05-28'),
  (3, 'Young Eagles flight day returns July 11', 'Event',
   'Free first flights for kids are back. Volunteer pilots needed — sign up at the next meeting.', 0, '2026-05-15'),
  (4, 'Welcome to our redesigned website', 'Chapter',
   'A cleaner, easier home for events, the Koala project, and our new member portal.', 0, '2026-05-01');

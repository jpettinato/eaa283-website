# EAA Chapter 283 Website

Full chapter website with a public site, a member portal, and an admin portal.
Runs entirely on Cloudflare's free tier:

- **Static pages** (`public/`) — plain HTML/CSS/JS, no framework, no build step
- **API** (`functions/api/`) — Cloudflare Pages Functions
- **Database** — Cloudflare D1 (SQLite) — see `schema.sql`
- **File storage** — Cloudflare R2 (uploaded agendas, minutes, newsletters)

## Pages

| Page | Notes |
|---|---|
| `index.html` | Home. Announcement bar + "next event" pull from the API |
| `about.html`, `koala.html`, `location.html`, `faq.html` | Static content pages |
| `events.html` | Interactive calendar fed by the API |
| `news.html` | Admin-published posts + public newsletter PDFs + subscribe form |
| `contact.html` | Contact form via Web3Forms (needs an access key — see below) |
| `members.html` | Member portal: sign-up (admin-verified), documents, directory, dues, RSVPs |
| `admin/` | Admin portal: announcement bar, events, posts, document uploads, member approval & dues, subscriber list |

## First deploy — step by step

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up), a GitHub account, and Node.js installed.

### 1. Push this folder to GitHub

```bash
cd site
git init
git add .
git commit -m "EAA Chapter 283 website"
# create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/eaa283-website.git
git push -u origin main
```

### 2. Create the database and file bucket

```bash
npm install -g wrangler        # or use npx wrangler ...
wrangler login
wrangler d1 create eaa283-db
```

Copy the `database_id` that command prints into `wrangler.toml` (replace
`PASTE_YOUR_D1_DATABASE_ID_HERE`), then:

```bash
wrangler r2 bucket create eaa283-documents
wrangler d1 execute eaa283-db --remote --file=schema.sql
```

Commit and push the `wrangler.toml` change.

### 3. Create the Cloudflare Pages project

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**,
pick your repo, and set:

- **Build command:** *(leave empty)*
- **Build output directory:** `public`

Cloudflare reads `wrangler.toml` for the D1/R2 bindings automatically. If the
bindings don't appear (Settings → Functions), add them manually: D1 binding `DB`
→ `eaa283-db`, R2 binding `DOCS` → `eaa283-documents`.

### 4. Set the setup key and create your admin account

In the Pages project: **Settings → Environment variables**, add `SETUP_KEY` with
a long random value (e.g. from https://www.random.org/strings/). Redeploy, then run
(replace values):

```bash
curl -X POST https://YOUR-SITE.pages.dev/api/setup \
  -H "Content-Type: application/json" \
  -d "{\"key\":\"YOUR_SETUP_KEY\",\"name\":\"Joe Pettinato\",\"email\":\"you@email.com\",\"password\":\"choose-a-strong-password\"}"
```

This only works once — it refuses if an admin already exists. Now sign in at
`https://YOUR-SITE.pages.dev/admin/`. You can promote other members to admin from
the Members tab after they sign up.

### 5. Contact form (Web3Forms)

1. Get a free access key at https://web3forms.com (enter EAAchapter283@gmail.com — the key arrives by email).
2. In `public/contact.html`, replace `YOUR_WEB3FORMS_ACCESS_KEY_HERE` with the key.
3. Commit and push. Messages submitted on the site will now be emailed to the chapter inbox.

## Local development

```bash
cd site
wrangler d1 execute eaa283-db --local --file=schema.sql   # once, creates the local DB
wrangler pages dev
```

Open the printed URL (usually http://localhost:8788). Local D1/R2 are simulated on
disk (`.wrangler/`), so you can test signup/approval/uploads safely. To use
`/api/setup` locally, put `SETUP_KEY=dev-key` in a `.dev.vars` file (git-ignored).

## Everyday tasks (for chapter officers)

- **Change the announcement bar** — Admin portal → Announcement bar
- **Add/edit events** — Admin portal → Events (members-only events stay off the public calendar)
- **Publish news** — Admin portal → News posts ("members only" posts appear in the portal instead)
- **Upload minutes/agendas/newsletters** — Admin portal → Documents (public newsletters also show on the News page)
- **Approve new members** — Admin portal → Members → "Awaiting verification"
- **Record dues** — Admin portal → Members → set the year's dues to Paid

## Replacing the photo placeholders

The striped boxes labeled `PHOTO — …` are placeholders from the design. To use real
photos: put images in `public/images/` and replace each placeholder `<div class="ph">…</div>`
with `<img src="images/yourphoto.jpg" alt="…" style="width:100%; height:100%; object-fit:cover;">`
(keeping the surrounding container). The hero on `index.html` uses a striped
background `div` — swap it for a full-bleed `img` the same way.

## What's next

Planned upgrades (online dues payment, merchandise store, email notifications, and
more) are detailed in [FUTURE-ROADMAP.md](FUTURE-ROADMAP.md).

# EAA Chapter 283 Website — Future Roadmap

Features intentionally left out of the first release, with notes on how to add them
when the chapter is ready. Roughly in suggested order.

## 1. Online dues payment (Stripe)

**Goal:** members pay the $50 annual dues by card from the Dues tab; their status
flips to Paid automatically.

- Create a chapter [Stripe](https://stripe.com) account (needs the chapter's bank
  account; nonprofit rates are available). Stripe fees are currently ~2.9% + 30¢,
  so ~$1.75 per $50 payment — decide whether the chapter absorbs it or adds it.
- Add a Stripe **Payment Link** or **Checkout Session** for a "2027 Chapter Dues"
  product. The simplest first step is a Payment Link button on the Dues tab — no
  code beyond a URL. The full version creates a Checkout Session from a new
  `/api/member/pay-dues` endpoint so the member's ID rides along in `metadata`.
- Add a `/api/stripe-webhook` Pages Function that verifies the webhook signature
  and, on `checkout.session.completed`, upserts the member's `dues` row to `paid`.
  Store `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Pages environment variables.
- Show a receipt/history from Stripe data or keep using the `dues` table as the
  source of truth (recommended: the table stays authoritative; Stripe just feeds it).

## 2. Merchandise store

**Goal:** sell chapter hats/shirts/etc. online.

Two sensible paths, in increasing effort:

- **Stripe Payment Links + a simple store page** — a `store.html` grid of products,
  each "Buy" button a Stripe Payment Link. Stripe hosts the checkout, handles
  shipping addresses, and emails receipts. No inventory tracking. This is the
  right starting point for a small chapter.
- **Full cart with Stripe Checkout** — add `products` and `orders` tables to D1,
  an admin Products tab (reuse the Documents upload pattern for product photos in
  R2), a cart in `localStorage`, and a `/api/checkout` endpoint that builds a
  multi-line-item Checkout Session plus the same webhook pattern as dues to mark
  orders paid. An admin Orders tab lists what to fulfill.
- Alternatives if Stripe feels heavy: Square Online or Printful/Printify
  (print-on-demand — no inventory, they ship) linked from the store page.

## 3. Transactional email

**Goal:** the system emails people instead of staying silent.

- Notify admins when someone requests an account; notify the member when approved.
- Password reset flow (currently an admin must be contacted). Needs a
  `reset_tokens` table, two endpoints, and an email send.
- Send from a Pages Function via [Resend](https://resend.com) (free tier, easy API)
  or MailChannels. Requires verifying a sending domain — worth pairing with a
  custom domain (below).
- Newsletter blasts to the subscriber list could use the same service, or simply
  keep using BCC from Gmail with the "Copy all emails" button in the admin portal.

## 4. Custom domain

Point a chapter domain (e.g. `eaa283.org`) at the Pages project: Cloudflare Pages
→ Custom domains. If the domain is registered elsewhere, moving its DNS to
Cloudflare (free) makes this one click. Update the Web3Forms and Stripe settings
to the new domain afterwards.

## 5. Real photos and content

- Replace the striped `PHOTO —` placeholders (see README) — biggest visual win
  available, costs nothing.
- Fill in the real Instagram/Facebook URLs (currently `href="#"` in the footer,
  contact page, and home page).
- Young Eagles registration link for flight days (EAA's yeday.org) on the event
  detail panel.

## 6. Quality-of-life / hardening

- **Login rate limiting** — e.g. track failed attempts per IP in D1 or use
  Cloudflare's WAF rules; low urgency but good hygiene.
- **Turnstile on signup/contact** — Cloudflare's free CAPTCHA to stop bot signups.
- **D1 backups** — `wrangler d1 export eaa283-db --remote --output=backup.sql` on
  a schedule (D1 also has point-in-time restore on the paid tier).
- **RSVP visibility for members** — show who else is going, if the chapter wants that.
- **Event photos/flyers** — attach an uploaded image to an event (same R2 pattern
  as documents) to replace the placeholder in the event detail panel.

## 7. Member forum (maybe)

Deliberately excluded for now: posts are admin-published only. If discussion is
ever wanted, a `threads`/`replies` pair of tables and a portal tab would do it,
but moderation burden is real — a chapter Facebook group may serve better.

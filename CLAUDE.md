# LeetCode Daily Auto-Submit — Project Context

Submits the LeetCode daily problem automatically, once a day, and reports the
outcome over Telegram.

## Operational gotchas

Read these before running anything locally.

- **`next dev` talks to the production database.** `.env.local` holds real
  `TURSO_DATABASE_URL` credentials and `src/lib/db.ts` picks Turso whenever that
  variable is non-empty — there is no local-dev guard. Before exercising any
  write path, run with `TURSO_DATABASE_URL= TURSO_AUTH_TOKEN=` and point
  `DATABASE_URL` at a *copy* of `prisma/dev.db`.
- **`.env.local` overrides inline env vars that are merely unset.** Blank them
  explicitly (`VAR=`) or the file wins.
- **`git push` does not deploy.** This project has no Git auto-deploy; every
  release is `vercel --prod`.

## Stack

- Next.js 16 (App Router), React 19
- Prisma 6 with `driverAdapters`; SQLite locally, Turso (libSQL) in production
- Auth.js v5 (`next-auth@5` beta) — Google, GitHub, and Resend magic link
- Deployed on Vercel; cron via `vercel.json`

## Deployment

- Production: `https://leetcode-daily-delta.vercel.app`
- Deploy with `vercel --prod` (CLI only — pushing to `main` builds nothing)
- Env vars apply only to deployments created *after* they are set, so add them
  before deploying, not after

## Users

Multi-user by design: accounts, LeetCode credentials, notification channels and
submissions are all per-user. In practice one account is active
(`phung1470@gmail.com`, LeetCode user `phg_pih`). Keep the multi-user
architecture — don't collapse it to single-user shortcuts.

## LeetCode credentials

Stored **per user in the database**, not in env: `User.lcSession` and
`User.lcCsrfToken`. There is no `LC_SESSION` env var.

`LEETCODE_SESSION` is a JWT that expires roughly every two weeks. Three things
deal with that:

1. **Browser extension** (`extension/`) — MV3, reads the live cookies from the
   browser twice a day and POSTs them to `/api/extension/sync`. The cookie is
   `httpOnly`, so page JS and bookmarklets cannot read it; only an extension
   holding the `cookies` permission can.
2. **`/api/extension/sync`** — bearer-auth via `EXTENSION_SECRET`, targets the
   account named by `EXTENSION_USER_EMAIL` (falls back to the sole account, and
   refuses once more than one exists).
3. **Expiry warning** — `sessionWarning()` in `src/lib/notify.ts` appends a
   warning to the daily Telegram message once the session is within three days
   of expiring.

The cookie is a three-segment JWT, but its payload carries **no standard `exp`
claim**. LeetCode ships Django's own fields instead: `_session_expiry` (lifetime
in seconds, currently `1209600` = 14 days) and `refreshed_at` (issue time), so
expiry is the sum. `leetcodeSessionExpiry()` prefers `exp` if it ever appears,
falls back to those two, and returns null otherwise rather than inventing a
date. Don't assume `exp` — an earlier version did and the warning was silently
inert.

### Cookie rotation

LeetCode reissues `LEETCODE_SESSION` on roughly half of authenticated requests
(measured 3/6 and 3/8 in separate samples — it is not predictable which). The
cron captures whichever arrives via `extractRotatedSession()`, uses it for the
rest of the run, and persists it, so the stored cookie slides forward instead of
ageing out. An empty value is ignored: that is a logout, and writing it over a
live session would lock the cron out.

### Which expiry to trust

The `Set-Cookie` header's `expires` slides a fresh 14 days on every rotation,
but the JWT payload's `refreshed_at` does *not* move — so the payload
under-reports, by a full day already on the first rotation.

`User.lcSessionExpiresAt` holds the authoritative date and is the source of
truth wherever it is set:

- the cron writes the header's `expires` whenever it captures a rotation
- the extension sends `chrome.cookies.get().expirationDate`, the browser's own
  view of the cookie's life

`leetcodeSessionExpiry()` (the JWT payload) is now only a fallback for when the
column is still null — a fresh account, or before the first rotation lands.
`sessionWarning()` takes a `Date | null` rather than a cookie, so the caller
decides which source applies; null means stay quiet rather than guess.

Days-remaining uses `Math.ceil`, not `floor`: the timestamps are second-
precision, so a cookie exactly N days out measures a few hundred ms short and
would floor to N−1 — reporting "1 day" with two left, and "expired" with twelve
hours to go.

## Auto-submit behaviour

- Vercel Cron hits `/api/cron` at 01:00 UTC, authenticated with `CRON_SECRET`
- Solutions come from the **LeetCode community solutions** feed — nothing is
  stored, and nothing is AI-generated (`src/lib/ai.ts` was removed)
- Up to 10 ranked JavaScript solutions are queued per user; a wrong answer moves
  to the next one, an accepted run stops the queue
- A 401/403 stops immediately — an expired session fails identically for every
  solution, so burning the queue on it is pointless
- Submissions are spaced 10s apart to avoid 429s; the run budgets its time
  against `maxDuration` so one user can't consume the whole invocation
- Re-running is safe: a user already accepted for today's problem is skipped
  (override with `?force=1`)
- Every run logs a `Submission` row and sends one Telegram message

## Notifications

**Telegram only.** The email channel was removed in `5757a51`; `notifyUser()`
filters to `type === "telegram"` and ignores anything else. Messages are sent
with `parse_mode: HTML` and fall back to plain text if Telegram rejects the
markup, so dynamic content can't silently swallow a notification. Always run
user-supplied or error text through `escapeHtml()` — raw LeetCode error bodies
contain HTML and will otherwise be rejected.

## Language

Submissions are JavaScript. `rankSolutions()` prefers write-ups with a single
JavaScript code block, since those extract cleanly.

## Out of scope

- Storing or authoring solutions (community only)
- AI-generated solutions
- Email / Slack notifications
- Publishing the extension to the Chrome Web Store — it loads unpacked

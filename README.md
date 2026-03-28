# LeetCode Daily Auto-Submit

Automatically submits the LeetCode Daily Challenge on your behalf every day at 01:00 UTC. Finds the top community solutions, submits them until one is accepted, logs the result, and notifies you via Telegram or email.

## Features

- **Daily auto-submit** — Vercel Cron runs at 01:00 UTC, finds community solutions and submits until accepted
- **Multi-user** — Each user stores their own LeetCode session; the cron processes all of them in parallel
- **Notifications** — Telegram and/or email (enable/disable per channel)
- **Submission history** — Dashboard shows your last submissions with status, runtime, and memory
- **OAuth login** — Sign in with Google or GitHub

---

## How It Works

```
01:00 UTC
  └── Cron → Fetch today's LeetCode Daily problem
           → For each user with a saved session:
               1. Fetch top-voted community JavaScript solutions
               2. Validate code (reject truncated/incomplete extractions)
               3. Submit solutions one by one until Accepted
               4. Log result to database
               5. Send Telegram / email notification
```

---

## User Guide

### 1. Sign In

Go to the app and click **Sign in with Google** or **Sign in with GitHub**.

### 2. Configure Your LeetCode Session

The app needs your LeetCode session cookie to submit on your behalf.

**How to get your session cookie:**

1. Log in to [leetcode.com](https://leetcode.com) in your browser
2. Open DevTools → **Application** tab → **Cookies** → `https://leetcode.com`
3. Copy the values for:
   - `LEETCODE_SESSION` — paste into **Session Cookie**
   - `csrftoken` — paste into **CSRF Token**

Go to **Settings** in the app and fill in both fields. Leave a field blank when re-saving to keep the existing value.

> **Note:** LeetCode sessions expire after a few weeks. If auto-submit stops working, refresh your cookies here.

### 3. Set Up Notifications (Optional)

In **Settings**, configure one or both notification channels:

#### Telegram
1. Message [@BotFather](https://t.me/BotFather) on Telegram and create a bot — save the token (for server config)
2. Start a chat with your bot, then get your **Chat ID** by messaging [@userinfobot](https://t.me/userinfobot)
3. Enter your Chat ID in Settings and toggle Telegram **on**

You'll receive messages like:
```
✅ LeetCode Daily Accepted!
Problem: Two Sum (Easy)
Runtime: 72ms
Memory: 48.3MB
```

#### Email
Enter your email address and toggle Email **on**. Requires SMTP to be configured by the server admin.

### 4. View Your Submission History

The **Dashboard** shows your last submissions — status (Accepted / Failed), problem name, date, runtime, and memory.

---

## Self-Hosting

### Prerequisites

- Node.js 20+
- A [Vercel](https://vercel.com) account (for cron + deployment)
- A [Turso](https://turso.tech) database (free tier works)
- Google and/or GitHub OAuth app credentials

### 1. Clone and Install

```bash
git clone https://github.com/your-username/leetcode-daily.git
cd leetcode-daily
npm install
```

### 2. Set Up Environment Variables

Copy `.env` to `.env.local` and fill in the values:

```bash
cp .env .env.local
```

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite path for local dev: `file:./prisma/dev.db` |
| `TURSO_DATABASE_URL` | Turso DB URL for production: `libsql://your-db.turso.io` |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `AUTH_SECRET` | Random secret: `openssl rand -base64 32` |
| `AUTH_URL` | App URL (e.g. `http://localhost:3000` for local) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `RESEND_API_KEY` | (Optional) [Resend](https://resend.com) API key for magic link email |
| `EMAIL_FROM` | From address for magic link emails |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP port (typically `587`) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `CRON_SECRET` | Secret to protect the cron endpoint: `openssl rand -base64 32` |

### 3. Set Up the Database

```bash
npm run db:push
```

### 4. Run Locally

```bash
npm run dev
```

### 5. Deploy to Vercel

```bash
npm install -g vercel
vercel link
vercel --prod
```

Set all environment variables in the Vercel dashboard or via CLI:

```bash
printf 'your-value' | vercel env add VARIABLE_NAME production
```

> **Important:** Always use `printf` (not `echo`) when pushing secrets — `echo` adds a trailing newline that corrupts the value.

### 6. Push Turso Schema (Production)

Prisma can't push directly to Turso. Generate the SQL and apply it via the Turso CLI:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  | turso db shell your-db-name
```

### 7. Configure OAuth Redirect URIs

**Google Cloud Console** → APIs & Services → Credentials → your OAuth client → Authorized redirect URIs:
```
https://your-app.vercel.app/api/auth/callback/google
```

**GitHub** → Settings → Developer settings → OAuth Apps → your app → Authorization callback URL:
```
https://your-app.vercel.app/api/auth/callback/github
```

### 8. Verify the Cron

The cron runs automatically on Vercel at 01:00 UTC. Test it manually:

```bash
curl -s https://your-app.vercel.app/api/cron \
  -H "Authorization: Bearer YOUR_CRON_SECRET" | jq
```

Expected response:
```json
{
  "problem": "two-sum",
  "summary": [
    { "userId": "...", "result": { "status": "accepted", "runtime": "72", "memory": "48.3" } }
  ]
}
```

---

## Development Scripts

```bash
npm run dev          # Start local dev server
npm run build        # Build for production
npm run db:push      # Push Prisma schema to local SQLite
npm run db:studio    # Open Prisma Studio (database browser)
npm run db:generate  # Regenerate Prisma client
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | NextAuth.js v5 (Google, GitHub, Resend) |
| ORM | Prisma 6 |
| Database (local) | SQLite |
| Database (prod) | Turso (libSQL) |
| Notifications | Telegram Bot API + Nodemailer (SMTP) |
| Deployment | Vercel (Cron + Serverless Functions) |

---

## Troubleshooting

**Submissions failing with `internal_error`**
- Your LeetCode session cookie may have expired. Go to Settings and update your session cookie and CSRF token.

**Submissions failing with `429`**
- LeetCode is rate-limiting. This can happen if the cron is triggered multiple times in quick succession. It resolves automatically — the daily cron runs only once per day.

**No community solutions found**
- The problem may not have JavaScript community solutions yet (happens on the first day a new problem appears). The cron will log an error; no submission will be made.

**Notifications not arriving (Telegram)**
- Make sure you've started a conversation with your bot first. Telegram bots can't initiate conversations.
- Verify your Chat ID is correct using [@userinfobot](https://t.me/userinfobot).

**`?error=Configuration` on login**
- Ensure `AUTH_SECRET` is set correctly on Vercel (no trailing whitespace).
- Ensure `AUTH_URL` matches your deployment URL exactly.

# LeetCode Daily Auto-Submit — Project Context

## Project Goal
Build a web app that automatically submits the LeetCode daily question on my behalf.

## Deployment
- Platform: **Vercel**
- Database: **TBD** (free tier — Neon, Turso, or Supabase)

## Tech Stack
<!-- Fill in your choices -->
- Framework: Next.js (App Router)
- Database: sqlite
- ORM: prisma
- Auth: help me choose

## LeetCode Account
<!-- Do NOT put real credentials here. Describe how they're stored/managed. -->
- Session cookie stored in: (e.g., env var `LC_SESSION`) => LC_SESSION
- Username: => phung1470
- Preferred submission language: (e.g., Python, TypeScript) => Javascript

## Auto-Submit Behavior
<!-- Describe what should happen each day -->
- Trigger: Vercel Cron at `HH:MM UTC` 01:00:00
- Solution source: (e.g., pre-written in DB, AI-generated, hardcoded stubs) => AI-generated
- On success: (e.g., log to DB, send notification) => log to DB, send notification
- On failure: (e.g., retry, alert) => retry, alert

## Users
<!-- Single user (just me) or multi-user SaaS? -->
- Type: single-user / multi-user => multi-user

## Solution Storage
<!-- How solutions are stored and matched to problems -->
we don't need to store solution

## Notifications
<!-- How to be notified of submission results -->
- Method: (e.g., email, Telegram, Slack, none) => Telegram/email (can enable/disable)

## Out of Scope
<!-- Things explicitly NOT part of this project -->
-

## Open Questions
<!-- Things still undecided -->
- Which free database to use? => sqlite 
- Single-user or multi-user? => multi-user
- Where do solutions come from? => AI generate

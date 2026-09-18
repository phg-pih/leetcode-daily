import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchDailyProblem, submitSolution, pollSubmissionResult, fetchCommunitySolutions, fetchCommunitySolutionDetail, extractCode, rankSolutions, countLanguageTags } from "@/lib/leetcode";
import { notifyUser, escapeHtml, sessionWarning } from "@/lib/notify";

// Vercel Cron: runs at 01:00 UTC daily
export const maxDuration = 300; // 5 min timeout

// How many community solutions to queue up per user before giving up.
const QUEUE_SIZE = 10;
// Pause between submissions so LeetCode doesn't rate-limit us (429).
const DELAY_BETWEEN_SUBMITS_MS = 10_000;
// Rough worst case for one attempt (fetch detail + submit + poll), used to
// decide whether there is still time for another try.
const ATTEMPT_BUDGET_MS = 45_000;
// Leave room at the end of the invocation for the DB write + notification.
const WRAP_UP_MS = 15_000;
// Warn this many days before LEETCODE_SESSION expires. The cookie lasts ~2
// weeks, so a few days is enough notice to re-sync without a run ever failing.
const SESSION_WARN_DAYS = 3;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  // Verify this is called by Vercel Cron (or manually with the secret)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Fetch today's problem
  let problem;
  try {
    problem = await fetchDailyProblem();
  } catch (err) {
    console.error("Failed to fetch daily problem:", err);
    return NextResponse.json({ error: "Failed to fetch problem" }, { status: 500 });
  }

  // 2. Get all users with a LeetCode session
  let users;
  try {
    users = await db.user.findMany({
      where: { lcSession: { not: null }, lcCsrfToken: { not: null } },
      select: { id: true, lcSession: true, lcCsrfToken: true, email: true, notifications: { select: { type: true, target: true, enabled: true } } },
    });
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // 3. Skip anyone who already got an accepted run for today's problem. The cron
  // can be re-run manually, and without this the queue would fire up to
  // QUEUE_SIZE fresh submissions on a problem that's already solved.
  // Match on slug *and* today's date: LeetCode occasionally re-uses a problem as
  // the daily, so an old accepted row for the same slug must not skip today.
  const force = req.nextUrl.searchParams.get("force") === "1";
  let alreadyAccepted: Set<string>;
  try {
    if (force) {
      alreadyAccepted = new Set();
    } else {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0); // LeetCode's daily rolls over at 00:00 UTC
      const accepted = await db.submission.findMany({
        where: { problemSlug: problem.slug, status: "accepted", date: { gte: dayStart } },
        select: { userId: true },
      });
      alreadyAccepted = new Set(accepted.map((s) => s.userId));
    }
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  const summary = [];
  const pending = [];
  for (const user of users) {
    if (alreadyAccepted.has(user.id)) {
      summary.push({ userId: user.id, result: { skipped: true, reason: "Already accepted today" } });
    } else {
      pending.push(user);
    }
  }

  // Process users sequentially to avoid LeetCode rate limiting (429).
  // Each user gets a fair slice of whatever time is left so the first user
  // can't burn the whole invocation on retries.
  const deadline = startedAt + (maxDuration * 1000 - WRAP_UP_MS);
  for (const [index, user] of pending.entries()) {
    const usersLeft = pending.length - index;
    const userDeadline = Math.min(deadline, Date.now() + Math.floor((deadline - Date.now()) / usersLeft));
    const result = await processUser(user, problem, userDeadline).catch((err) => ({ error: String(err) }));
    summary.push({ userId: user.id, result });
  }

  return NextResponse.json({ problem: problem.slug, forced: force, summary });
}

type AttemptLog = {
  topicId: number;
  title: string;
  langTags: number;
  status: string;
  error?: string;
};

// A bad/expired session will fail identically for every solution, so stop
// immediately instead of burning the whole queue on it.
function isSessionError(err: unknown): boolean {
  return /Submit failed: (401|403)\b/.test(String(err));
}

async function processUser(
  user: { id: string; lcSession: string | null; lcCsrfToken: string | null; email: string | null; notifications: { type: string; target: string; enabled: boolean }[] },
  problem: Awaited<ReturnType<typeof fetchDailyProblem>>,
  deadline: number
) {
  if (!user.lcSession || !user.lcCsrfToken) return { skipped: true };

  // LeetCode hands back a refreshed LEETCODE_SESSION on some responses. Track
  // the newest one, use it for the rest of this run, and persist it at the end
  // so the stored cookie slides forward instead of ageing out.
  const storedSession = user.lcSession;
  let session = storedSession;
  const onRotate = (next: string) => { session = next; };

  let lastResult: Awaited<ReturnType<typeof pollSubmissionResult>> = { status: "error", error: "No solutions tried" };
  const attempts: AttemptLog[] = [];
  let submittedCount = 0;
  let stoppedEarly: string | undefined;

  try {
    const fetched = await fetchCommunitySolutions(problem.slug, "javascript", QUEUE_SIZE);
    // JavaScript-only write-ups first — single code block, far easier to extract.
    const solutions = rankSolutions(fetched);

    if (!solutions.length) {
      lastResult = { status: "error", error: "No community solutions found" };
    } else {
      for (const solution of solutions) {
        if (Date.now() + ATTEMPT_BUDGET_MS > deadline) {
          stoppedEarly = `Out of time after ${attempts.length} attempt(s)`;
          break;
        }

        const langTags = countLanguageTags(solution);
        const label = { topicId: solution.node.topicId, title: solution.node.title, langTags };

        let submissionId: string;
        try {
          const solutionDetails = await fetchCommunitySolutionDetail(solution.node.topicId);
          const code = extractCode(solutionDetails);
          if (!code) {
            attempts.push({ ...label, status: "skipped", error: "No JavaScript code block found" });
            continue;
          }

          // Space out submissions, but only once we've actually sent one.
          if (submittedCount > 0) {
            await new Promise((r) => setTimeout(r, DELAY_BETWEEN_SUBMITS_MS));
          }

          submissionId = await submitSolution(problem.slug, code, session, user.lcCsrfToken, 1, onRotate);
          submittedCount++;
        } catch (err) {
          lastResult = { status: "error", error: String(err) };
          attempts.push({ ...label, status: "submit_failed", error: String(err) });
          if (isSessionError(err)) {
            stoppedEarly = "LeetCode session rejected — check LC_SESSION / csrf token";
            break;
          }
          continue;
        }

        const result = await pollSubmissionResult(submissionId, session, user.lcCsrfToken, 15, onRotate);
        lastResult = result;
        attempts.push({ ...label, status: result.status, error: result.error });

        // Only a green run ends the queue. A wrong answer, compile error, TLE or
        // runtime error is this solution's problem — the next one may well pass.
        if (result.status === "accepted") break;
      }

      if (submittedCount === 0 && lastResult.status === "error" && lastResult.error === "No solutions tried") {
        lastResult = {
          status: "error",
          error: `No JavaScript code could be extracted from ${solutions.length} community solution(s)`,
        };
      }
    }
  } catch (err) {
    lastResult = { status: "error", error: String(err) };
  }

  if (stoppedEarly && lastResult.status !== "accepted") {
    lastResult = { ...lastResult, error: [lastResult.error, stoppedEarly].filter(Boolean).join(" | ") };
  }

  // Persist a rotated cookie even when the run failed — the fresher session is
  // still worth keeping, and a failure is exactly when it matters most.
  let sessionRotated = false;
  if (session !== storedSession) {
    try {
      await db.user.update({ where: { id: user.id }, data: { lcSession: session } });
      sessionRotated = true;
    } catch (err) {
      console.error(`[cron] failed to persist rotated session for ${user.id}:`, err);
    }
  }

  // Log final result to DB
  await db.submission.create({
    data: {
      userId: user.id,
      problemSlug: problem.slug,
      problemTitle: problem.title,
      status: lastResult.status,
      runtime: lastResult.runtime,
      memory: lastResult.memory,
      error: lastResult.error,
    },
  });

  // Always notify the user — both success and failure
  const isAccepted = lastResult.status === "accepted";
  const emoji = isAccepted ? "✅" : "❌";
  const title = escapeHtml(problem.title);
  const message = isAccepted
    ? `${emoji} <b>LeetCode Daily Accepted!</b>\n<b>Problem:</b> ${title} (${escapeHtml(problem.difficulty)})\n<b>Runtime:</b> ${escapeHtml(String(lastResult.runtime ?? ""))}\n<b>Memory:</b> ${escapeHtml(String(lastResult.memory ?? ""))}\n<b>Attempt:</b> ${submittedCount} of ${attempts.length} tried`
    : `${emoji} <b>LeetCode Daily Failed</b>\n<b>Problem:</b> ${title}\n<b>Status:</b> ${escapeHtml(String(lastResult.status))}\n<b>Tried:</b> ${submittedCount}/${attempts.length} solution(s)${lastResult.error ? `\n<b>Error:</b> ${escapeHtml(String(lastResult.error))}` : ""}`;

  const warning = sessionWarning(session, SESSION_WARN_DAYS);
  const notifyResults = await notifyUser(
    user.notifications,
    `LeetCode Daily: ${problem.title}`,
    message + (warning?.line ?? "")
  );

  return {
    ...lastResult,
    attempts,
    submitted: submittedCount,
    sessionRotated,
    sessionDaysLeft: warning?.daysLeft ?? null,
    notifications: notifyResults,
  };
}

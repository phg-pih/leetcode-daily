import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchDailyProblem, submitSolution, pollSubmissionResult, fetchCommunitySolutions, fetchCommunitySolutionDetail, extractCode } from "@/lib/leetcode";
import { notifyUser, escapeHtml } from "@/lib/notify";

// Vercel Cron: runs at 01:00 UTC daily
export const maxDuration = 300; // 5 min timeout

export async function GET(req: NextRequest) {
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

  // Process users sequentially to avoid LeetCode rate limiting (429)
  const summary = [];
  for (const user of users) {
    const result = await processUser(user, problem).catch((err) => ({ error: String(err) }));
    summary.push({ userId: user.id, result });
  }

  return NextResponse.json({ problem: problem.slug, summary });
}

async function processUser(
  user: { id: string; lcSession: string | null; lcCsrfToken: string | null; email: string | null; notifications: { type: string; target: string; enabled: boolean }[] },
  problem: Awaited<ReturnType<typeof fetchDailyProblem>>
) {
  if (!user.lcSession || !user.lcCsrfToken) return { skipped: true };

  let lastResult: Awaited<ReturnType<typeof pollSubmissionResult>> = { status: "error", error: "No solutions tried" };

  // Statuses where retrying a different community solution won't help — the issue is
  // code format / LeetCode judge, not the algorithm.
  const TERMINAL_STATUSES = new Set(["accepted", "internal_error", "compile_error"]);

  try {
    const solutions = await fetchCommunitySolutions(problem.slug, "javascript", 3);
    if (!solutions.length) {
      lastResult = { status: "error", error: "No community solutions found" };
    } else {
      let submittedCount = 0;
      for (const solution of solutions) {
        let submissionId: string;
        try {
          const solutionDetails = await fetchCommunitySolutionDetail(solution.node.topicId);
          const code = extractCode(solutionDetails);
          if (!code) {
            continue;
          }

          submissionId = await submitSolution(problem.slug, code as string, user.lcSession, user.lcCsrfToken);
          submittedCount++;
        } catch (err) {
          lastResult = { status: "error", error: String(err) };
          continue;
        }

        const result = await pollSubmissionResult(submissionId, user.lcSession, user.lcCsrfToken);
        lastResult = result;

        if (TERMINAL_STATUSES.has(result.status)) break;
        await new Promise((r) => setTimeout(r, 30000));
      }

      if (submittedCount === 0 && lastResult.status === "error" && lastResult.error === "No solutions tried") {
        lastResult = { status: "error", error: "No JavaScript code could be extracted from community solutions" };
      }
    }
  } catch (err) {
    lastResult = { status: "error", error: String(err) };
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
    ? `${emoji} <b>LeetCode Daily Accepted!</b>\n<b>Problem:</b> ${title} (${escapeHtml(problem.difficulty)})\n<b>Runtime:</b> ${escapeHtml(String(lastResult.runtime ?? ""))}\n<b>Memory:</b> ${escapeHtml(String(lastResult.memory ?? ""))}`
    : `${emoji} <b>LeetCode Daily Failed</b>\n<b>Problem:</b> ${title}\n<b>Status:</b> ${escapeHtml(String(lastResult.status))}${lastResult.error ? `\n<b>Error:</b> ${escapeHtml(String(lastResult.error))}` : ""}`;

  const notifyResults = await notifyUser(user.notifications, `LeetCode Daily: ${problem.title}`, message);

  return { ...lastResult, notifications: notifyResults };
}

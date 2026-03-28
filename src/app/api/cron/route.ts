import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchDailyProblem, submitSolution, pollSubmissionResult, fetchCommunitySolutions } from "@/lib/leetcode";
import { notifyUser } from "@/lib/notify";

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

  const results = await Promise.allSettled(
    users.map((user) => processUser(user, problem))
  );

  const summary = results.map((r, i) => ({
    userId: users[i].id,
    result: r.status === "fulfilled" ? r.value : { error: String(r.reason) },
  }));

  return NextResponse.json({ problem: problem.slug, summary });
}

async function processUser(
  user: { id: string; lcSession: string | null; lcCsrfToken: string | null; email: string | null; notifications: { type: string; target: string; enabled: boolean }[] },
  problem: Awaited<ReturnType<typeof fetchDailyProblem>>
) {
  if (!user.lcSession || !user.lcCsrfToken) return { skipped: true };

  const solutions = await fetchCommunitySolutions(problem.slug);
  if (!solutions.length) throw new Error("No community solutions found for: " + problem.slug);

  // Try each solution until one is accepted
  let lastResult: Awaited<ReturnType<typeof pollSubmissionResult>> = { status: "error", error: "No solutions tried" };

  for (const code of solutions) {
    let submissionId: string;
    try {
      submissionId = await submitSolution(problem.slug, code, user.lcSession, user.lcCsrfToken);
    } catch (err) {
      lastResult = { status: "error", error: String(err) };
      continue;
    }

    const result = await pollSubmissionResult(submissionId, user.lcSession);
    lastResult = result;

    if (result.status === "accepted") break;
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

  // Notify user
  const isAccepted = lastResult.status === "accepted";
  const emoji = isAccepted ? "✅" : "❌";
  const message = isAccepted
    ? `${emoji} *LeetCode Daily Accepted!*\n*Problem:* ${problem.title} (${problem.difficulty})\n*Runtime:* ${lastResult.runtime}\n*Memory:* ${lastResult.memory}`
    : `${emoji} *LeetCode Daily Failed*\n*Problem:* ${problem.title}\n*Status:* ${lastResult.status}${lastResult.error ? `\n*Error:* ${lastResult.error}` : ""}`;

  await notifyUser(user.notifications, `LeetCode Daily: ${problem.title}`, message);

  return lastResult;
}

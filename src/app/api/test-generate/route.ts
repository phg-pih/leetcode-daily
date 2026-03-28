import { NextRequest, NextResponse } from "next/server";
import { fetchDailyProblem } from "@/lib/leetcode";
import { generateSolution } from "@/lib/ai";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const problem = await fetchDailyProblem();
  const solution = await generateSolution(problem.title, problem.content, problem.codeSnippet);

  return NextResponse.json({ problem, solution });
}

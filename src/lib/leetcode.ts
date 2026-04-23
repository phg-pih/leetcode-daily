const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";

export interface DailyProblem {
  slug: string;
  title: string;
  difficulty: string;
}

export interface SolutionNode {
  node: {
    title: string;
    slug: string;
    topicId: number;
  }
}

const DAILY_QUERY = `
  query dailyCodingChallenge {
    activeDailyCodingChallengeQuestion {
      date
      question {
        titleSlug
        title
        difficulty
      }
    }
  }
`;


const SUBMISSION_CHECK_QUERY = `
  query submissionDetails($submissionId: Int!) {
    submissionDetails(submissionId: $submissionId) {
      statusCode
      statusDisplay
      runtime
      memory
      runtimeError
      compileError
      fullCompileError
      fullRuntimeError
      lastTestcase
      codeOutput
      expectedOutput
      totalCorrect
      totalTestcases
    }
  }
`;

export async function fetchDailyProblem(): Promise<DailyProblem> {
  const res = await fetch(LEETCODE_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: DAILY_QUERY }),
  });

  if (!res.ok) throw new Error(`LeetCode GraphQL error: ${res.status}`);

  const json = await res.json();
  const q = json.data.activeDailyCodingChallengeQuestion.question;

  return {
    slug: q.titleSlug,
    title: q.title,
    difficulty: q.difficulty
  };
}

export async function submitSolution(
  slug: string,
  code: string,
  lcSession: string,
  csrfToken: string,
  retries = 1
): Promise<string> {
  const questionId = await getQuestionId(slug);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`https://leetcode.com/problems/${slug}/submit/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `LEETCODE_SESSION=${lcSession}; csrftoken=${csrfToken}`,
        Referer: `https://leetcode.com/problems/${slug}/`,
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        lang: "javascript",
        question_id: questionId,
        typed_code: code,
      }),
    });

    if (res.status === 429) {
      if (attempt === retries) throw new Error(`Submit failed: 429 (rate limited after ${retries + 1} attempts)`);
      const backoff = Math.pow(2, attempt) * 10_000; // 10s, 20s, 40s
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Submit failed: ${res.status} ${text}`);
    }

    const json = await res.json();
    return String(json.submission_id);
  }

  throw new Error("Submit failed: exhausted retries");
}

async function getQuestionId(slug: string): Promise<string> {
  const res = await fetch(LEETCODE_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query getQuestion($titleSlug: String!) {
        question(titleSlug: $titleSlug) { questionId }
      }`,
      variables: { titleSlug: slug },
    }),
  });
  const json = await res.json();
  return json.data.question.questionId;
}

const COMMUNITY_SOLUTIONS_QUERY = `
  query ugcArticleSolutionArticles(
      $questionSlug: String!
      $orderBy: ArticleOrderByEnum
      $tagSlugs: [String!]
      $first: Int
  ) {
      ugcArticleSolutionArticles(
          questionSlug: $questionSlug
          orderBy: $orderBy
          tagSlugs: $tagSlugs
          first: $first
      ) {
          totalNum
          edges {
              node {
                  ...ugcSolutionArticleFragment
              }
          }
      }
  }
                  
  fragment ugcSolutionArticleFragment on SolutionArticleNode {
      title
      slug
      articleType
      summary
      topicId
  }
`;

const COMMUNITY_SOLUTION_DETAILS_QUERY = `
  query ugcArticleSolutionArticle($topicId: ID) {
      ugcArticleSolutionArticle(topicId: $topicId) {
          content
      }
  }
`;

export async function fetchCommunitySolutions(slug: string, langSlug = "javascript", first = 5, orderBy = "HOT"): Promise<SolutionNode[]> {
  const res = await fetch(LEETCODE_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: COMMUNITY_SOLUTIONS_QUERY,
      variables: { questionSlug: slug, tagSlugs: [langSlug], first: first, orderBy: orderBy },
    }),
  });

  if (!res.ok) return [];

  const json = await res.json();
  return json.data?.ugcArticleSolutionArticles?.edges ?? [];
}

export async function fetchCommunitySolutionDetail(topicId: number): Promise<string> {
  const res = await fetch(LEETCODE_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: COMMUNITY_SOLUTION_DETAILS_QUERY,
      variables: { topicId: topicId },
    }),
  });

  if (!res.ok) return "";

  const json = await res.json();
  return json?.data?.ugcArticleSolutionArticle?.content || "";
}

export function extractCode(content: string, lang = 'javascript'): string | null {
  const codeBlocks: Record<string, string> = {};
  const regex = /```(\w+) \[\]\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
      codeBlocks[match[1]] = match[2].trim();
  }

  return codeBlocks[lang] || null;
}

export async function pollSubmissionResult(
  submissionId: string,
  lcSession: string,
  csrfToken: string,
  maxAttempts = 15
): Promise<{ status: string; runtime?: string; memory?: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(`https://leetcode.com/submissions/detail/${submissionId}/check/`, {
      headers: {
        Cookie: `LEETCODE_SESSION=${lcSession}; csrftoken=${csrfToken}`,
        "X-CSRFToken": csrfToken,
        Referer: "https://leetcode.com/",
      },
    });

    if (!res.ok) continue;
    const data = await res.json();
    if (data.state !== "SUCCESS") continue; // PENDING or STARTED

    if (data.status_code === 10) {
      return {
        status: "accepted",
        runtime: data.status_runtime,
        memory: String(data.status_memory ?? data.memory ?? ""),
      };
    }

    const parts: string[] = [];
    if (data.compile_error) parts.push(`compile: ${data.compile_error}`);
    if (data.runtime_error) parts.push(`runtime: ${data.runtime_error}`);
    if (data.last_testcase) parts.push(`tc: ${String(data.last_testcase).slice(0, 120)}`);
    if (data.code_output) parts.push(`got: ${String(data.code_output).slice(0, 120)}`);
    if (data.expected_output) parts.push(`want: ${String(data.expected_output).slice(0, 120)}`);
    if (data.total_testcases != null) parts.push(`passed: ${data.total_correct}/${data.total_testcases}`);

    return {
      status: (data.status_msg ?? "error").toLowerCase().replace(/ /g, "_"),
      error: parts.join(" | ") || undefined,
    };
  }

  return { status: "timeout" };
}

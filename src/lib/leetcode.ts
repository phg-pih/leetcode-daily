const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";

export interface DailyProblem {
  slug: string;
  title: string;
  difficulty: string;
  content: string;
  codeSnippet: string; // JavaScript starter code
}

const DAILY_QUERY = `
  query dailyCodingChallenge {
    activeDailyCodingChallengeQuestion {
      date
      question {
        titleSlug
        title
        difficulty
        content
        codeSnippets {
          lang
          langSlug
          code
        }
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
  const jsSnippet = q.codeSnippets.find(
    (s: { langSlug: string; code: string }) => s.langSlug === "javascript"
  );

  return {
    slug: q.titleSlug,
    title: q.title,
    difficulty: q.difficulty,
    content: q.content,
    codeSnippet: jsSnippet?.code ?? "",
  };
}

export async function submitSolution(
  slug: string,
  code: string,
  lcSession: string,
  csrfToken: string
): Promise<string> {
  const questionId = await getQuestionId(slug);

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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Submit failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return String(json.submission_id);
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
  query communitySolutions($questionSlug: String!, $languageTags: [String!]) {
    questionSolutions(
      filters: { questionSlug: $questionSlug, first: 10, skip: 0, orderBy: hot, languageTags: $languageTags }
    ) {
      solutions {
        title
        post {
          content
          voteCount
        }
      }
    }
  }
`;

export async function fetchCommunitySolutions(slug: string, langSlug = "javascript"): Promise<string[]> {
  const res = await fetch(LEETCODE_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: COMMUNITY_SOLUTIONS_QUERY,
      variables: { questionSlug: slug, languageTags: [langSlug] },
    }),
  });

  if (!res.ok) return [];

  const json = await res.json();
  const solutions: { post: { content: string; voteCount: number } }[] =
    json.data?.questionSolutions?.solutions ?? [];

  return solutions
    .sort((a, b) => b.post.voteCount - a.post.voteCount)
    .map((s) => extractCode(s.post.content))
    .filter((code): code is string => code !== null);
}

function extractCode(content: string): string | null {
  // Normalize escaped newlines (LeetCode returns literal \n strings)
  const normalized = content.replace(/\\n/g, "\n").replace(/\\t/g, "\t");

  let code: string | null = null;

  // Try markdown fences with js/javascript tag first
  const mdMatch = normalized.match(/```(?:javascript|js|JavaScript)\n([\s\S]*?)```/i);
  if (mdMatch) code = mdMatch[1].trim();

  // Fallback: any ``` block
  if (!code) {
    const anyMatch = normalized.match(/```[^\n]*\n([\s\S]*?)```/);
    if (anyMatch) code = anyMatch[1].trim();
  }

  // Fallback: <pre> or <code> tags (LeetCode sometimes sends HTML)
  if (!code) {
    const preMatch = normalized.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) code = preMatch[1].replace(/<[^>]+>/g, "").trim();
  }

  if (!code) return null;

  // Reject truncated code: braces must be balanced
  const opens = (code.match(/\{/g) ?? []).length;
  const closes = (code.match(/\}/g) ?? []).length;
  if (opens !== closes) return null;

  // Must contain a function definition
  if (!/function|=>/.test(code)) return null;

  return code;
}

export async function pollSubmissionResult(
  submissionId: string,
  lcSession: string,
  maxAttempts = 10
): Promise<{ status: string; runtime?: string; memory?: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(LEETCODE_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `LEETCODE_SESSION=${lcSession}`,
      },
      body: JSON.stringify({
        query: SUBMISSION_CHECK_QUERY,
        variables: { submissionId: parseInt(submissionId) },
      }),
    });

    const json = await res.json();
    const details = json.data?.submissionDetails;

    if (!details) continue;
    if (details.statusCode === 10) {
      // Accepted
      return {
        status: "accepted",
        runtime: String(details.runtime),
        memory: String(details.memory),
      };
    }
    if (details.statusCode !== 0) {
      // Not pending anymore
      return {
        status: details.statusDisplay?.toLowerCase().replace(/ /g, "_") ?? "error",
        error: details.runtimeError,
      };
    }
  }

  return { status: "timeout" };
}

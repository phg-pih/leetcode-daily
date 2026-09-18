const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";

export interface DailyProblem {
  slug: string;
  title: string;
  difficulty: string;
}

export interface SolutionTag {
  name: string;
  slug: string;
  tagType: string | null;
}

export interface SolutionNode {
  node: {
    title: string;
    slug: string;
    topicId: number;
    tags: SolutionTag[];
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
      tags {
          name
          slug
          tagType
      }
  }
`;

const COMMUNITY_SOLUTION_DETAILS_QUERY = `
  query ugcArticleSolutionArticle($topicId: ID) {
      ugcArticleSolutionArticle(topicId: $topicId) {
          content
      }
  }
`;

export async function fetchCommunitySolutions(slug: string, langSlug = "javascript", first = 10, orderBy = "HOT"): Promise<SolutionNode[]> {
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

// LeetCode marks language tags with tagType null, but the data is inconsistent
// (e.g. "python" sometimes comes back as COMPANY), so match on an explicit slug set.
const LANGUAGE_TAG_SLUGS = new Set([
  "c", "cpp", "csharp", "java", "python", "python3", "javascript", "typescript",
  "php", "swift", "kotlin", "dart", "golang", "ruby", "scala", "rust", "racket",
  "erlang", "elixir", "bash", "mysql", "mssql", "oraclesql", "postgresql", "pythondata", "react",
]);

export function countLanguageTags(node: SolutionNode): number {
  return (node.node.tags ?? []).filter((t) => LANGUAGE_TAG_SLUGS.has(t.slug)).length;
}

/**
 * Put single-language posts first: every result already carries the `javascript`
 * tag (we filter on it), so one language tag means a JavaScript-only write-up —
 * those have a single code block and extract far more reliably than the
 * "here it is in 6 languages" posts. Stable, so LeetCode's HOT order breaks ties.
 */
export function rankSolutions(solutions: SolutionNode[]): SolutionNode[] {
  return solutions
    .map((node, index) => ({ node, index, langs: countLanguageTags(node) }))
    .sort((a, b) => a.langs - b.langs || a.index - b.index)
    .map((entry) => entry.node);
}

const LANG_FENCE_ALIASES: Record<string, string[]> = {
  javascript: ["javascript", "js", "node", "nodejs", "jsx"],
};

function looksLikeJavaScript(code: string): boolean {
  if (!/[{;]/.test(code)) return false;
  return /\b(var|let|const|function|class)\b/.test(code) || /=>/.test(code);
}

const UNESCAPE_MAP: Record<string, string> = {
  n: "\n", t: "\t", r: "\r", '"': '"', "'": "'", "`": "`", "\\": "\\",
};

/**
 * Some community posts come back with their line breaks encoded as the two
 * characters `\` + `n` instead of real newlines, which makes every fence regex
 * miss. A post is always entirely one way or the other, so only unescape when
 * the document contains no real newline at all — that way a `"\n"` that is
 * genuinely part of the solution's source is never mangled.
 */
export function normalizeContent(content: string): string {
  if (content.includes("\n") || !content.includes("\\n")) return content;
  return content.replace(/\\(.)/g, (whole, ch: string) => UNESCAPE_MAP[ch] ?? whole);
}

export function extractCode(rawContent: string, lang = 'javascript'): string | null {
  const content = normalizeContent(rawContent);
  const aliases = LANG_FENCE_ALIASES[lang] ?? [lang];
  const isAlias = (label: string) => aliases.includes(label.trim().toLowerCase());

  // 1. LeetCode's own multi-language format: ```javascript []
  const tagged = /```(\w+) \[\]\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = tagged.exec(content)) !== null) {
    if (isAlias(match[1])) return match[2].trim();
  }

  // 2. Plain labelled fence: ```javascript
  const labelled = /```([A-Za-z0-9+#]*)[^\n]*\n([\s\S]*?)```/g;
  while ((match = labelled.exec(content)) !== null) {
    if (isAlias(match[1])) return match[2].trim();
  }

  // 3. Unlabelled fence — common on single-language posts. Only accept a block
  //    that actually reads as code, since prose gets fenced here too.
  if (lang === "javascript") {
    const bare = /```[^\S\n]*\n([\s\S]*?)```/g;
    while ((match = bare.exec(content)) !== null) {
      const code = match[1].trim();
      if (looksLikeJavaScript(code)) return code;
    }
  }

  return null;
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

// LEETCODE_SESSION is a JWT, but its payload has no standard `exp` claim —
// LeetCode ships Django's own fields: `_session_expiry` (lifetime in seconds,
// currently 1209600 = 14 days) alongside `refreshed_at` (when it was issued).
// `exp` is still preferred if it ever appears. Returns null when neither shape
// is present, so callers stay quiet rather than inventing an expiry.
export function leetcodeSessionExpiry(lcSession: string): Date | null {
  const parts = lcSession.split(".");
  if (parts.length !== 3) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.exp === "number") return new Date(payload.exp * 1000);

  const { refreshed_at: refreshedAt, _session_expiry: lifetime } = payload;
  if (typeof refreshedAt === "number" && typeof lifetime === "number") {
    return new Date((refreshedAt + lifetime) * 1000);
  }

  return null;
}

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateSolution(
  title: string,
  content: string,
  codeSnippet: string
): Promise<string> {
  if (process.env.MOCK_AI === "true") {
    return codeSnippet.trim(); // return stub code for testing
  }

  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are an expert competitive programmer. Solve the following LeetCode problem in JavaScript.

Problem: ${title}

Description:
${content}

Starter code:
${codeSnippet}

Requirements:
- Return ONLY the JavaScript code, no explanation, no markdown fences
- Use the exact function signature from the starter code
- Optimize for correctness first, then time/space complexity
- Add brief inline comments where logic is non-obvious`,
      },
    ],
  });

  const text = message.content[0];
  if (text.type !== "text") throw new Error("Unexpected AI response type");

  // Strip markdown code fences if model includes them
  return text.text
    .replace(/^```(?:javascript|js)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}

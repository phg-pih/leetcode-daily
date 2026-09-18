import { leetcodeSessionExpiry } from "@/lib/leetcode";

// ---------- Telegram ----------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function postTelegram(token: string, chatId: string, message: string, parseMode?: "HTML") {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      ...(parseMode ? { parse_mode: parseMode } : {}),
    }),
  });
}

export async function sendTelegram(chatId: string, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  let res = await postTelegram(token, chatId, message, "HTML");

  // If HTML parsing fails (e.g. unbalanced tags from dynamic content), retry as plain text
  // so the user still gets notified instead of silently losing the message.
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && /can't parse entities|parse_mode/i.test(body)) {
      const plain = message.replace(/<[^>]+>/g, "");
      res = await postTelegram(token, chatId, plain);
      if (res.ok) return;
      const retryBody = await res.text();
      throw new Error(`Telegram ${res.status} (plain retry): ${retryBody}`);
    }
    throw new Error(`Telegram ${res.status}: ${body}`);
  }
}

// ---------- Unified notify ----------

interface NotificationChannel {
  type: string;
  target: string;
  enabled: boolean;
}

export async function notifyUser(
  channels: NotificationChannel[],
  _subject: string,
  message: string
): Promise<{ type: string; ok: boolean; error?: string }[]> {
  const active = channels.filter((c) => c.enabled && c.type === "telegram");

  const results = await Promise.allSettled(
    active.map((ch) => sendTelegram(ch.target, message))
  );

  return results.map((r, i) => {
    if (r.status === "rejected") {
      console.error(`[notify] ${active[i].type} failed for target ${active[i].target}:`, r.reason);
      return { type: active[i].type, ok: false, error: String(r.reason) };
    }
    return { type: active[i].type, ok: true };
  });
}


// ---------- Session expiry ----------

// Appended to the daily notification when the session is close to expiring, so
// the user gets warning *before* a run fails rather than after. Returns null
// when the cookie isn't a JWT we can read — better to stay quiet than guess.
export function sessionWarning(lcSession: string, warnDays: number): { line: string; daysLeft: number } | null {
  const expiresAt = leetcodeSessionExpiry(lcSession);
  if (!expiresAt) return null;

  // Ceil, not floor: the JWT's exp is second-precision, so a cookie exactly N
  // days out measures a few hundred ms short and would floor to N-1 — reporting
  // "1 day" with two days left, and "expired" with twelve hours still to go.
  const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
  if (daysLeft > warnDays) return null;

  const headline =
    daysLeft <= 0
      ? "LeetCode session has expired"
      : `LeetCode session expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;

  return {
    daysLeft,
    line: `\n\n⚠️ <b>${headline}</b>\nRe-sync with the browser extension, or paste a fresh cookie in Settings.`,
  };
}

import nodemailer from "nodemailer";

// ---------- Telegram ----------

export async function sendTelegram(chatId: string, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" }),
    }
  );

  if (!res.ok) throw new Error(`Telegram error: ${res.status}`);
}

// ---------- Email ----------

export async function sendEmail(to: string, subject: string, body: string) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text: body,
  });
}

// ---------- Unified notify ----------

interface NotificationChannel {
  type: string;
  target: string;
  enabled: boolean;
}

export async function notifyUser(
  channels: NotificationChannel[],
  subject: string,
  message: string
): Promise<{ type: string; ok: boolean; error?: string }[]> {
  const active = channels.filter((c) => c.enabled);

  const results = await Promise.allSettled(
    active.map((ch) => {
      if (ch.type === "telegram") return sendTelegram(ch.target, message);
      if (ch.type === "email") return sendEmail(ch.target, subject, message);
      return Promise.resolve();
    })
  );

  return results.map((r, i) => {
    if (r.status === "rejected") {
      console.error(`[notify] ${active[i].type} failed for target ${active[i].target}:`, r.reason);
      return { type: active[i].type, ok: false, error: String(r.reason) };
    }
    return { type: active[i].type, ok: true };
  });
}

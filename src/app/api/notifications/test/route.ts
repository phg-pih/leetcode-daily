import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendTelegram, sendEmail } from "@/lib/notify";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, target } = await req.json();

  if (!["telegram", "email"].includes(type) || !target) {
    return NextResponse.json({ error: "Invalid type or missing target" }, { status: 400 });
  }

  const message = "✅ Test notification from LeetCode Daily — your notifications are working!";

  try {
    if (type === "telegram") await sendTelegram(target, message);
    if (type === "email") await sendEmail(target, "LeetCode Daily — Test Notification", message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

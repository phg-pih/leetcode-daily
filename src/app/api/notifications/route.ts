import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = await db.notification.findMany({
    where: { userId: session.user.id },
  });

  return NextResponse.json(notifications);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, target, enabled } = await req.json();

  if (type !== "telegram") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const notification = await db.notification.upsert({
    where: { userId_type: { userId: session.user.id, type } },
    update: { target, enabled },
    create: { userId: session.user.id, type, target, enabled: enabled ?? true },
  });

  return NextResponse.json(notification);
}

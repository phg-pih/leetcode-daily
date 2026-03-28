import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { lcUsername: true, lcSession: true, lcCsrfToken: true },
  });

  return NextResponse.json({
    lcUsername: user?.lcUsername ?? "",
    hasSession: !!user?.lcSession,
    hasCsrfToken: !!user?.lcCsrfToken,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { lcSession, lcCsrfToken, lcUsername } = body;

  await db.user.update({
    where: { id: session.user.id },
    data: {
      ...(lcSession !== undefined && { lcSession }),
      ...(lcCsrfToken !== undefined && { lcCsrfToken }),
      ...(lcUsername !== undefined && { lcUsername }),
    },
  });

  return NextResponse.json({ success: true });
}

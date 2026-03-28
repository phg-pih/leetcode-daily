import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const submissions = await db.submission.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
    take: 30,
  });

  return NextResponse.json(submissions);
}

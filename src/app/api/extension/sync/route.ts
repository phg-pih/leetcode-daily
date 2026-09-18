import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { leetcodeSessionExpiry } from "@/lib/leetcode";

// Auth is a bearer secret, not a cookie, so a wildcard origin grants nothing on
// its own — the browser extension's origin (chrome-extension://<id>) isn't
// known ahead of time and can't be enumerated here.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function secretMatches(header: string | null): boolean {
  const expected = process.env.EXTENSION_SECRET;
  if (!expected) return false;
  const given = header?.replace(/^Bearer\s+/i, "") ?? "";
  // Hash first so timingSafeEqual always gets equal-length buffers.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// The app supports multiple users, but the extension can't say who it is — it
// only holds a shared secret. Pin the target with EXTENSION_USER_EMAIL; the
// sole-user fallback is a convenience that deliberately refuses once ambiguous.
async function resolveUser(): Promise<{ id: string } | { error: string }> {
  const email = process.env.EXTENSION_USER_EMAIL;
  if (email) {
    const user = await db.user.findUnique({ where: { email }, select: { id: true } });
    return user ?? { error: `No account matches EXTENSION_USER_EMAIL (${email})` };
  }
  const users = await db.user.findMany({ take: 2, select: { id: true } });
  if (users.length === 1) return users[0];
  return {
    error: users.length
      ? "Multiple accounts exist — set EXTENSION_USER_EMAIL to pick one"
      : "No accounts exist yet — sign in to the app first",
  };
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const { lcSession, lcCsrfToken, lcUsername, expiresAt } = await req.json().catch(() => ({}));
  if (!lcSession || !lcCsrfToken) {
    return NextResponse.json(
      { error: "Missing lcSession or lcCsrfToken — are you logged in to leetcode.com?" },
      { status: 400, headers: CORS }
    );
  }

  const target = await resolveUser();
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: 409, headers: CORS });
  }

  // The browser knows the cookie's real expiry; the JWT payload does not, since
  // refreshed_at doesn't move when LeetCode rotates it. Fall back to the payload
  // only when the extension didn't send one.
  const browserExpiry =
    typeof expiresAt === "number" ? new Date(expiresAt * 1000) : null;
  const effectiveExpiry =
    browserExpiry && !Number.isNaN(browserExpiry.getTime())
      ? browserExpiry
      : leetcodeSessionExpiry(lcSession);

  await db.user.update({
    where: { id: target.id },
    data: {
      lcSession,
      lcCsrfToken,
      ...(lcUsername ? { lcUsername } : {}),
      ...(effectiveExpiry ? { lcSessionExpiresAt: effectiveExpiry } : {}),
    },
  });
  return NextResponse.json(
    {
      ok: true,
      expiresAt: effectiveExpiry?.toISOString() ?? null,
      daysLeft: effectiveExpiry
        ? Math.ceil((effectiveExpiry.getTime() - Date.now()) / 86_400_000)
        : null,
    },
    { headers: CORS }
  );
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { signOut } from "@/lib/auth";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { lcSession: true, lcUsername: true },
  });

  const submissions = await db.submission.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
    take: 10,
  });

  const accepted = submissions.filter((s) => s.status === "accepted").length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">LeetCode Daily</h1>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="text-sm text-gray-400 hover:text-white transition">
            Settings
          </Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button className="text-sm text-gray-400 hover:text-white transition">Sign out</button>
          </form>
        </div>
      </div>

      {/* Warning if no LC session */}
      {!user?.lcSession && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-6 text-yellow-300 text-sm">
          No LeetCode session configured.{" "}
          <Link href="/settings" className="underline font-semibold">
            Add it in Settings
          </Link>{" "}
          to enable auto-submit.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Submissions" value={submissions.length} />
        <StatCard label="Accepted" value={accepted} highlight />
        <StatCard label="Failed" value={submissions.length - accepted} />
      </div>

      {/* Submission history */}
      <h2 className="text-lg font-semibold text-white mb-4">Recent Submissions</h2>
      {submissions.length === 0 ? (
        <p className="text-gray-500 text-sm">No submissions yet. The cron runs daily at 01:00 UTC.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {submissions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3"
            >
              <div>
                <p className="font-medium text-white text-sm">{s.problemTitle}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(s.date).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="text-right">
                <StatusBadge status={s.status} />
                {s.runtime && <p className="text-xs text-gray-500 mt-1">{s.runtime}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 text-center">
      <p className={`text-2xl font-bold ${highlight ? "text-green-400" : "text-white"}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    accepted: "bg-green-900/40 text-green-400 border-green-700",
    error: "bg-red-900/40 text-red-400 border-red-700",
    pending: "bg-yellow-900/40 text-yellow-400 border-yellow-700",
    timeout: "bg-gray-800 text-gray-400 border-gray-600",
  };
  const style = styles[status] ?? "bg-gray-800 text-gray-400 border-gray-600";

  return (
    <span className={`text-xs px-2 py-0.5 rounded border capitalize ${style}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

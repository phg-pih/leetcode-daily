import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
      <h1 className="text-4xl font-bold text-white">LeetCode Daily</h1>
      <p className="text-gray-400 text-center max-w-md">
        Automatically solve and submit the LeetCode daily challenge every day at 01:00 UTC using AI.
      </p>
      <Link
        href="/login"
        className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg transition"
      >
        Get Started
      </Link>
    </main>
  );
}

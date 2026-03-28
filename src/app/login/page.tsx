import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-8 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Sign In</h1>
        <p className="text-gray-400">Choose how you want to continue</p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button className="w-full bg-white text-gray-900 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition">
            Continue with Google
          </button>
        </form>

        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/dashboard" });
          }}
        >
          <button className="w-full bg-gray-800 text-white font-semibold py-3 px-4 rounded-lg hover:bg-gray-700 transition border border-gray-600">
            Continue with GitHub
          </button>
        </form>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-700" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-gray-950 px-2 text-gray-500">or sign in with email</span>
          </div>
        </div>

        <form
          action={async (formData: FormData) => {
            "use server";
            await signIn("resend", formData);
          }}
          className="flex flex-col gap-2"
        >
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-orange-500"
          />
          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            Send Magic Link
          </button>
        </form>
      </div>
    </main>
  );
}

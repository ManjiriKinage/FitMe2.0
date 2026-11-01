"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        throw error;
      }

      if (data?.session) {
        router.push("/home");
      }
    } catch (err: any) {
      setErrorMsg(
        err.message || "Failed to sign in. Please verify your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#faf9f6] flex flex-col items-center justify-center px-4 py-12 selection:bg-[#7c9a7e]/20 selection:text-[#22332d]">
      <div className="w-full max-w-[440px] flex flex-col items-center">
        {/* Brand Logo Header */}
        <Link
          href="/"
          className="flex items-center gap-2.5 font-bold text-[22px] text-[#22332d] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e] rounded-xl"
          aria-label="FitMe Home"
        >
          <span
            className="w-10 h-10 rounded-[12px] bg-[#22332d] text-white flex items-center justify-center text-sm font-bold tracking-tight select-none"
            aria-hidden="true"
          >
            .fit
          </span>
          <span>FitMe</span>
        </Link>

        <h1 className="text-[36px] font-bold text-[#22332d] mt-5 tracking-tight text-center">
          Welcome back
        </h1>
        <p className="text-[14px] text-[#5b6b64] text-center mt-1">
          Sign in to track today&apos;s meals and reach your goals.
        </p>

        {/* Form Card (.c) */}
        <div className="w-full bg-white rounded-[28px] p-8 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 mt-5 flex flex-col gap-4">
          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-[14px] bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-[13px] font-semibold text-[#3a4a43]"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] placeholder:text-[#5b6b64]/50 focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[13px] font-semibold text-[#3a4a43]"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] placeholder:text-[#5b6b64]/50 focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[52px] rounded-full bg-[#22332d] hover:bg-[#182420] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors disabled:opacity-70 mt-1 focus:outline-none focus:ring-2 focus:ring-[#22332d]/40 focus:ring-offset-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign in &rarr;</span>
              )}
            </button>
          </form>

          <p className="text-[14px] text-[#5b6b64] text-center border-t border-[#eef1ee] pt-4 mt-1">
            New here?{" "}
            <Link
              href="/register"
              className="font-bold text-[#5f7d61] hover:text-[#22332d] transition-colors focus:outline-none focus:underline"
            >
              Create account
            </Link>
          </p>
        </div>

        {/* Footer privacy reassurance */}
        <p className="text-[12px] text-[#5b6b64] text-center mt-3">
          Your data stays private to your account.
        </p>
      </div>
    </main>
  );
}

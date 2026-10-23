"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Sparkles, ArrowRight, Lock, Mail, AlertCircle, Loader2 } from "lucide-react";

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
      setErrorMsg(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Brand header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-charcoal flex items-center justify-center text-cream font-bold text-lg shadow-soft">
              <span className="text-sage font-black">.</span>Fit
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-charcoal">FitMe</span>
          </Link>
          <h1 className="text-2xl font-bold text-charcoal">Welcome back</h1>
          <p className="text-sm text-charcoal/60 mt-1">Sign in to track today&apos;s meals and reach your goals</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-4xl p-8 border border-mint shadow-soft-lg">
          {errorMsg && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal/40" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-11 pr-4 py-3 bg-cream/60 rounded-2xl border border-charcoal/10 focus:border-sage focus:ring-2 focus:ring-sage/20 outline-none text-charcoal text-sm transition"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal/40" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-cream/60 rounded-2xl border border-charcoal/10 focus:border-sage focus:ring-2 focus:ring-sage/20 outline-none text-charcoal text-sm transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-charcoal text-cream font-bold rounded-2xl hover:bg-charcoal-light transition shadow-soft flex items-center justify-center gap-2 disabled:opacity-70 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4 text-sage" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-charcoal/10 text-center">
            <p className="text-sm text-charcoal/70">
              Don&apos;t have an account yet?{" "}
              <Link href="/register" className="font-bold text-sage hover:text-sage-600 transition">
                Create Account
              </Link>
            </p>
          </div>
        </div>

        {/* Demo note */}
        <div className="mt-6 text-center text-xs text-charcoal/50">
          Powered by Supabase Auth with Row-Level Security
        </div>
      </div>
    </div>
  );
}

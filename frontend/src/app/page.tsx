"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Sparkles, ArrowRight, ShieldCheck, Flame, HeartPulse, Activity } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace("/home");
      } else {
        setCheckingAuth(false);
      }
    }
    checkUser();
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-sage/30 border-t-sage rounded-full animate-spin" />
          <p className="text-sm font-medium text-charcoal/70">Loading FitMe...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between selection:bg-sage/20 selection:text-charcoal">
      {/* Top Navigation */}
      <header className="max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-charcoal flex items-center justify-center text-cream font-bold text-lg shadow-soft">
            <span className="text-sage font-black">.</span>Fit
          </div>
          <span className="font-extrabold text-2xl tracking-tight text-charcoal">FitMe</span>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm font-semibold text-charcoal/80 hover:text-charcoal px-4 py-2 rounded-xl transition"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold bg-sage text-white px-5 py-2.5 rounded-2xl hover:bg-sage-600 transition shadow-soft flex items-center gap-2"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 py-12 flex-1 flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center gap-2 bg-mint/80 border border-sage/20 px-4 py-1.5 rounded-full text-xs font-semibold text-charcoal mb-6">
          <Sparkles className="w-3.5 h-3.5 text-sage" />
          <span>V1 • AI-Powered Personalized Calorie Tracker</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-charcoal max-w-3xl leading-tight">
          Track what you eat with <span className="text-sage underline decoration-sage/30">intelligent AI</span> and mindful precision.
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-charcoal/70 max-w-2xl leading-relaxed">
          Evidence-based calorie recommendations via Mifflin-St Jeor equation. Instant AI estimations for Indian & global meals, transparent macro breakdowns, and real goal tracking.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto px-8 py-4 bg-charcoal text-cream font-semibold rounded-2xl hover:bg-charcoal-light transition shadow-soft-lg flex items-center justify-center gap-3 text-base"
          >
            Calculate Your Calorie Target
            <ArrowRight className="w-5 h-5 text-sage" />
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-8 py-4 bg-white border border-charcoal/10 font-semibold text-charcoal rounded-2xl hover:bg-cream-soft transition shadow-soft text-base"
          >
            Sign In to Dashboard
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-4xl w-full">
          <div className="bg-white p-6 rounded-3xl border border-mint shadow-soft flex flex-col gap-3">
            <div className="w-12 h-12 rounded-2xl bg-mint flex items-center justify-center text-charcoal">
              <Flame className="w-6 h-6 text-sage" />
            </div>
            <h3 className="font-bold text-lg text-charcoal">Mifflin-St Jeor Science</h3>
            <p className="text-sm text-charcoal/70 leading-relaxed">
              Clinically verified BMR and TDEE calculations with safe deficit and surplus boundaries tailored to your biology.
            </p>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-mint shadow-soft flex flex-col gap-3">
            <div className="w-12 h-12 rounded-2xl bg-mint flex items-center justify-center text-charcoal">
              <Sparkles className="w-6 h-6 text-sage" />
            </div>
            <h3 className="font-bold text-lg text-charcoal">AI Food Nutrition</h3>
            <p className="text-sm text-charcoal/70 leading-relaxed">
              Type &ldquo;2 chapatis & 1 bowl dal&rdquo; or homemade dishes. Instant accurate macro breakdown with serving assumptions.
            </p>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-mint shadow-soft flex flex-col gap-3">
            <div className="w-12 h-12 rounded-2xl bg-mint flex items-center justify-center text-charcoal">
              <ShieldCheck className="w-6 h-6 text-sage" />
            </div>
            <h3 className="font-bold text-lg text-charcoal">Row-Level Security</h3>
            <p className="text-sm text-charcoal/70 leading-relaxed">
              Supabase Auth and PostgreSQL Row Level Security (RLS) keep your health records strictly private and encrypted.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full px-6 py-6 border-t border-charcoal/5 flex flex-col sm:flex-row items-center justify-between text-xs text-charcoal/60 gap-3">
        <p>© 2026 FitMe Health Inc. Designed for sustainable wellness. Estimates are not medical advice.</p>
        <div className="flex gap-4">
          <span>Sage & Mint Theme</span>
          <span>•</span>
          <span>FastAPI + Next.js</span>
        </div>
      </footer>
    </div>
  );
}

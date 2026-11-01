"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import LandingFeatureCards from "@/components/landing/LandingFeatureCards";

export default function LandingPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function checkUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f6]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#7c9a7e]/30 border-t-[#7c9a7e] rounded-full animate-spin" />
          <p className="text-sm font-medium text-[#22332d]/70">Loading FitMe...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] flex flex-col justify-between selection:bg-[#7c9a7e]/20 selection:text-[#22332d]">
      <div className="max-w-[1280px] w-full min-h-screen mx-auto px-6 sm:px-12 lg:px-20 py-7 flex flex-col justify-between">
        <LandingNavbar />
        <LandingHero />
        <LandingFeatureCards />
      </div>
    </main>
  );
}

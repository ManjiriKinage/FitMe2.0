import Link from "next/link";

export default function LandingHero() {
  return (
    <section className="text-center mt-10 sm:mt-12 lg:mt-12 flex flex-col items-center">
      <span className="inline-block rounded-full bg-[#eaf1ec] px-3.5 py-1.5 text-xs font-semibold text-[#22332d]">
        AI-powered calorie tracker
      </span>

      <h1 className="text-[34px] sm:text-[46px] lg:text-[60px] leading-[1.08] font-bold text-[#22332d] max-w-[880px] mx-auto mt-5 tracking-tight">
        Track what you eat with{" "}
        <span className="text-[#7c9a7e]">intelligent AI</span> and mindful
        precision.
      </h1>

      <p className="text-[16px] sm:text-[18px] text-[#5b6b64] max-w-[620px] mx-auto mt-5 leading-[1.5]">
        Evidence-based calorie goals, instant AI estimates for Indian and global
        meals, and clear macro breakdowns.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-8 w-full sm:w-auto">
        <Link
          href="/register"
          className="h-[52px] w-full sm:w-auto px-8 rounded-full bg-[#22332d] hover:bg-[#1a2722] text-white font-semibold text-[15px] inline-flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#22332d]/40 focus:ring-offset-2"
        >
          Calculate your calorie target &rarr;
        </Link>
        <Link
          href="/login"
          className="h-[52px] w-full sm:w-auto px-7 rounded-full border border-[#dfe6e1] bg-white hover:bg-[#f6f9f7] text-[#22332d] font-semibold text-[14px] inline-flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/40 focus:ring-offset-2"
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}


import Link from "next/link";

export default function LandingNavbar() {
  return (
    <nav
      aria-label="Main Navigation"
      className="w-full flex items-center justify-between"
    >
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

      <div className="flex items-center gap-4 sm:gap-5">
        <Link
          href="/login"
          className="text-sm font-semibold text-[#5b6b64] hover:text-[#22332d] transition-colors px-2 sm:px-3 py-2 min-h-[44px] inline-flex items-center focus:outline-none focus:ring-2 focus:ring-[#7c9a7e] rounded-lg"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="h-[44px] px-5 rounded-full bg-[#7c9a7e] hover:bg-[#6e8a70] text-white font-semibold text-sm inline-flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/40 focus:ring-offset-2"
        >
          Get started &rarr;
        </Link>
      </div>
    </nav>
  );
}


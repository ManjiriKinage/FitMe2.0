"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Home, Target, User, LogOut } from "lucide-react";

interface NavbarProps {
  onOpenAddFood?: () => void;
  onOpenScanMeal?: () => void;
  userFullName?: string;
}

export default function Navbar({ userFullName }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const navItems = [
    { href: "/home", label: "Home", icon: Home },
    { href: "/goals", label: "Set Up Goals", icon: Target },
    { href: "/profile", label: "Profile", icon: User },
  ];

  const getInitials = (name?: string) => {
    if (!name || !name.trim()) return "ME";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const displayName = userFullName || "FitMe User";
  const initials = getInitials(userFullName);

  return (
    <>
      {/* Desktop Sidebar (matches Main.dc.html) */}
      <aside className="hidden md:flex flex-col w-[260px] flex-none bg-[#22332d] rounded-[28px] p-6 py-6 px-4 self-stretch min-h-[920px] transition-all">
        {/* Brand Logo & Subtitle */}
        <Link
          href="/home"
          className="flex items-center gap-3 px-2 pb-7 focus:outline-none focus:ring-2 focus:ring-[#7c9a7e] rounded-xl"
          aria-label="FitMe Home"
        >
          <div
            className="w-12 h-12 rounded-full bg-[#3d5247] text-[#b7cdb9] flex items-center justify-center font-bold text-xl select-none flex-shrink-0"
            aria-hidden="true"
          >
            .F
          </div>
          <div>
            <div className="text-white font-bold text-[20px] leading-tight">FitMe</div>
            <div className="text-[#b7cdb9] text-[12px] font-normal leading-tight">INDB Nutrition</div>
          </div>
        </Link>

        {/* Navigation Items */}
        <nav aria-label="Sidebar Navigation" className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-[14px] text-[15px] font-medium transition-colors ${
                  isActive
                    ? "bg-[#7c9a7e] text-white"
                    : "text-[#dfe9e2] hover:bg-[#2d4238] hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Badge & Logout */}
        <div className="border-t border-[#3d5247] pt-4 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full bg-[#3d5247] text-[#b7cdb9] flex items-center justify-center font-bold text-[13px] select-none flex-shrink-0"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold text-[14px] truncate leading-tight">
              {displayName}
            </div>
            <div className="text-[#b7cdb9] text-[12px] leading-tight">Personalized</div>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Log out"
            className="w-10 h-10 rounded-full border border-[#3d5247] bg-transparent text-[#b7cdb9] hover:bg-[#3d5247] hover:text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
          >
            <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </div>
      </aside>

      {/* Mobile Top & Bottom Navigation */}
      <div className="md:hidden w-full bg-[#22332d] p-4 flex items-center justify-between text-white border-b border-[#3d5247]">
        <Link href="/home" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#3d5247] text-[#b7cdb9] flex items-center justify-center font-bold text-base">
            .F
          </div>
          <span className="font-bold text-lg">FitMe</span>
        </Link>
        <div className="flex items-center gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`p-2 rounded-xl text-sm ${
                  isActive ? "bg-[#7c9a7e] text-white" : "text-[#dfe9e2] hover:bg-[#2d4238]"
                }`}
                aria-label={item.label}
              >
                <Icon className="w-5 h-5" />
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            aria-label="Log out"
            className="p-2 rounded-xl text-[#b7cdb9] hover:bg-[#3d5247] hover:text-white ml-1"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );
}

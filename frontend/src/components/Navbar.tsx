"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Home,
  Target,
  User,
  LogOut,
  Plus,
  Camera,
  Sparkles,
  Calendar,
  Layers
} from "lucide-react";

interface NavbarProps {
  onOpenAddFood?: () => void;
  onOpenScanMeal?: () => void;
  userFullName?: string;
}

export default function Navbar({ onOpenAddFood, onOpenScanMeal, userFullName }: NavbarProps) {
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

  return (
    <>
      {/* Desktop Vertical Sidebar */}
      <aside className="hidden md:flex flex-col justify-between w-60 p-5 bg-charcoal text-cream rounded-3xl my-4 ml-4 shadow-soft-lg flex-shrink-0 z-30">
        <div>
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-3 px-2 py-1.5 group">
            <div className="w-10 h-10 rounded-2xl bg-sage/20 border border-sage/40 flex items-center justify-center text-sage font-black text-xl group-hover:scale-105 transition">
              .F
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg text-cream tracking-tight leading-none">FitMe</span>
              <span className="text-[10px] text-cream/50 font-medium mt-0.5">INDB Nutrition</span>
            </div>
          </Link>

          {/* Navigation Links with Text Labels */}
          <nav className="flex flex-col gap-1.5 w-full mt-7">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-sage text-charcoal shadow-soft font-bold"
                      : "text-cream/70 hover:text-cream hover:bg-charcoal-light"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* Quick Actions */}
            <div className="flex flex-col gap-2 mt-3">
              {onOpenScanMeal && (
                <button
                  onClick={onOpenScanMeal}
                  className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl bg-charcoal-light border border-sage/40 text-sage hover:bg-sage hover:text-charcoal text-xs font-bold transition shadow-sm"
                >
                  <Camera className="w-4 h-4" />
                  <span>Scan Meal</span>
                </button>
              )}

              {onOpenAddFood && (
                <button
                  onClick={onOpenAddFood}
                  className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl bg-sage/20 border border-sage/40 text-sage hover:bg-sage hover:text-charcoal text-xs font-bold transition shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Food</span>
                </button>
              )}
            </div>
          </nav>
        </div>

        {/* Bottom Profile & Logout Card */}
        <div className="w-full pt-4 border-t border-charcoal-light flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-charcoal-light flex items-center justify-center text-sage font-bold text-xs uppercase flex-shrink-0">
              {userFullName ? userFullName.slice(0, 2) : "ME"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-cream truncate leading-tight">
                {userFullName || "FitMe User"}
              </p>
              <p className="text-[10px] text-cream/50 truncate">Personalized</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-cream/50 hover:text-red-300 hover:bg-red-950/30 transition flex-shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="md:hidden flex items-center justify-between px-5 py-4 bg-charcoal text-cream sticky top-0 z-40 shadow-soft">
        <Link href="/home" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-charcoal-light flex items-center justify-center font-bold text-sm">
            <span className="text-sage font-black">.</span>Fit
          </div>
          <span className="font-bold text-lg text-cream">FitMe</span>
        </Link>

        <div className="flex items-center gap-2">
          {onOpenScanMeal && (
            <button
              onClick={onOpenScanMeal}
              className="p-2 rounded-xl bg-charcoal-light border border-sage/40 text-sage text-xs font-bold flex items-center gap-1 shadow-soft"
              title="Scan Meal"
            >
              <Camera className="w-4 h-4" />
              <span>Scan</span>
            </button>
          )}

          {onOpenAddFood && (
            <button
              onClick={onOpenAddFood}
              className="p-2 rounded-xl bg-sage text-charcoal text-xs font-bold flex items-center gap-1 shadow-soft"
            >
              <Plus className="w-4 h-4" />
              <span>Food</span>
            </button>
          )}
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-cream/70 hover:text-red-300 hover:bg-cream/10"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-charcoal/95 backdrop-blur-md border-t border-charcoal-light py-2 px-6 flex justify-around items-center z-40">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
                isActive ? "text-sage font-bold" : "text-cream/50"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

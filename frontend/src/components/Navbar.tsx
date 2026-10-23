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
  Sparkles,
  Calendar,
  Layers
} from "lucide-react";

interface NavbarProps {
  onOpenAddFood?: () => void;
  userFullName?: string;
}

export default function Navbar({ onOpenAddFood, userFullName }: NavbarProps) {
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
      <aside className="hidden md:flex flex-col justify-between items-center w-20 py-8 bg-charcoal text-cream rounded-r-4xl my-4 ml-4 shadow-soft-lg flex-shrink-0 z-30">
        {/* Logo */}
        <div className="flex flex-col items-center gap-1">
          <Link href="/home" className="w-12 h-12 rounded-2xl bg-charcoal-light flex items-center justify-center text-cream font-bold text-lg hover:ring-2 hover:ring-sage/40 transition">
            <span className="text-sage font-black">.</span>Fit
          </Link>
        </div>

        {/* Navigation Icons */}
        <nav className="flex flex-col items-center gap-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                  isActive
                    ? "bg-sage text-charcoal font-bold shadow-glow scale-105"
                    : "text-cream/60 hover:text-cream hover:bg-charcoal-light"
                }`}
              >
                <Icon className="w-5 h-5" />
              </Link>
            );
          })}

          {/* Quick Add Food Floating Action in Sidebar */}
          {onOpenAddFood && (
            <button
              onClick={onOpenAddFood}
              title="Add Food"
              className="w-12 h-12 rounded-2xl bg-cream/10 hover:bg-cream/20 text-cream flex items-center justify-center transition hover:scale-105"
            >
              <Plus className="w-6 h-6 text-sage" />
            </button>
          )}
        </nav>

        {/* Bottom Actions */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleLogout}
            title="Log Out"
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-cream/50 hover:text-red-300 hover:bg-red-950/30 transition"
          >
            <LogOut className="w-5 h-5" />
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

        <div className="flex items-center gap-3">
          {onOpenAddFood && (
            <button
              onClick={onOpenAddFood}
              className="p-2 rounded-xl bg-sage text-charcoal text-xs font-bold flex items-center gap-1.5 shadow-soft"
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

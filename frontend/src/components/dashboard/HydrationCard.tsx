"use client";

import { useState, useEffect } from "react";

interface HydrationCardProps {
  selectedDate: string;
}

export default function HydrationCard({ selectedDate }: HydrationCardProps) {
  const [cups, setCups] = useState<number>(3);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`fitme_water_${selectedDate}`);
      if (stored !== null) {
        setCups(Number(stored));
      } else {
        // Default to 3 cups as shown in mockup
        setCups(3);
      }
    } catch {
      // Fallback if localStorage unavailable
      setCups(3);
    }
  }, [selectedDate]);

  const handleCupClick = (index: number) => {
    const nextCups = index + 1 === cups ? index : index + 1;
    setCups(nextCups);
    try {
      localStorage.setItem(`fitme_water_${selectedDate}`, String(nextCups));
    } catch {
      // Ignore
    }
  };

  return (
    <article
      aria-label="Daily Hydration Wellness"
      className="bg-[#22332d] text-white rounded-[24px] p-6 flex flex-col justify-between gap-4 shadow-sm"
    >
      <div>
        <div className="text-[11px] tracking-[0.08em] text-[#b7cdb9] font-semibold uppercase">
          DAILY WELLNESS
        </div>
        <h2 className="text-[20px] font-bold text-white leading-tight mt-1">
          Drink 8–10 Cups Water
        </h2>
        <div className="text-[13px] text-[#b7cdb9] mt-1">
          Hydration aids digestion &amp; energy
        </div>
      </div>

      {/* 8 Cups Grid */}
      <div
        className="grid grid-cols-8 gap-2 py-2"
        role="group"
        aria-label={`Water cups, ${cups} of 8`}
      >
        {Array.from({ length: 8 }).map((_, i) => {
          const isFilled = i < cups;
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleCupClick(i)}
              aria-label={`Cup ${i + 1} of 8, ${isFilled ? "filled" : "empty"}`}
              className="p-1 rounded-lg hover:bg-[#2d4238] transition-colors focus:outline-none focus:ring-1 focus:ring-[#7c9a7e] flex items-center justify-center"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-full h-auto aspect-square transition-all"
                fill={isFilled ? "#7c9a7e" : "none"}
                stroke={isFilled ? "#7c9a7e" : "#5f7a68"}
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M6 3h12l-1.5 17a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z" />
              </svg>
            </button>
          );
        })}
      </div>

      <div className="text-[13px] text-[#b7cdb9] font-medium">
        {cups} of 8 cups
      </div>
    </article>
  );
}


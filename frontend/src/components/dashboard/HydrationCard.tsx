"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { AlertCircle, Loader2 } from "lucide-react";

interface HydrationCardProps {
  selectedDate: string;
}

export default function HydrationCard({ selectedDate }: HydrationCardProps) {
  const [cups, setCups] = useState<number>(0);
  const [goal, setGoal] = useState<number>(8);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Keep previous cups to revert on error
  const prevCupsRef = useRef<number>(0);

  const getTodayStr = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  };

  const isFuture = selectedDate > getTodayStr();

  useEffect(() => {
    let isCancelled = false;

    async function fetchWater() {
      try {
        setLoading(true);
        setErrorMsg(null);

        // First check local storage for instant render
        const cached = localStorage.getItem(`fitme_water_${selectedDate}`);
        if (cached !== null) {
          const val = Number(cached);
          setCups(val);
          prevCupsRef.current = val;
        }

        const res = await api.getWaterLog(selectedDate);
        if (!isCancelled) {
          setCups(res.cups);
          setGoal(res.water_goal || 8);
          prevCupsRef.current = res.cups;
          localStorage.setItem(`fitme_water_${selectedDate}`, String(res.cups));
        }
      } catch (err: any) {
        console.warn("Could not fetch water log, fallback to local:", err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    fetchWater();
    return () => {
      isCancelled = true;
    };
  }, [selectedDate]);

  const maxCups = goal + 4;

  const handleAdjustCups = async (delta: number) => {
    if (isFuture) return;

    const currentCups = cups;
    const nextCups = Math.max(0, Math.min(currentCups + delta, maxCups));
    if (nextCups === currentCups) return;

    // Optimistic instant UI update
    prevCupsRef.current = currentCups;
    setCups(nextCups);
    setErrorMsg(null);
    try {
      localStorage.setItem(`fitme_water_${selectedDate}`, String(nextCups));
    } catch {}

    try {
      setSaving(true);
      await api.updateWaterLog(nextCups, selectedDate);
    } catch (err: any) {
      // Revert on error
      console.error("Failed to save water log, reverting:", err);
      setCups(prevCupsRef.current);
      try {
        localStorage.setItem(`fitme_water_${selectedDate}`, String(prevCupsRef.current));
      } catch {}
      setErrorMsg("Failed to save water log. Reverted.");
    } finally {
      setSaving(false);
    }
  };

  const handleCupClick = (index: number) => {
    if (isFuture) return;
    const targetCups = index + 1 === cups ? index : index + 1;
    handleAdjustCups(targetCups - cups);
  };

  return (
    <article
      aria-label="Daily Hydration Tracker"
      className="bg-[#22332d] text-white rounded-[24px] p-6 flex flex-col justify-between gap-4 shadow-sm relative overflow-hidden"
    >
      <div>
        <div className="flex items-center justify-between">
          <div className="text-[11px] tracking-[0.08em] text-[#b7cdb9] font-semibold uppercase">
            WATER · SAVED DAILY
          </div>
          {saving && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#b7cdb9]" />
          )}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-2 p-2 rounded-lg bg-red-900/60 border border-red-700/60 text-red-200 text-xs flex items-center gap-1.5"
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 8 Cups Visual Grid */}
        <div
          className="grid grid-cols-8 gap-2 py-3"
          role="group"
          aria-label={`Water cups, ${cups} of ${goal} cups`}
        >
          {Array.from({ length: Math.min(8, goal) }).map((_, i) => {
            const isFilled = i < cups;
            return (
              <button
                key={i}
                type="button"
                disabled={isFuture || loading}
                onClick={() => handleCupClick(i)}
                aria-label={`Cup ${i + 1} of ${goal}, ${isFilled ? "filled" : "empty"}`}
                className="p-1 rounded-lg hover:bg-[#2d4238] transition-colors focus:outline-none focus:ring-1 focus:ring-[#7c9a7e] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
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
      </div>

      {/* Footer Controls matching HomePlus.dc.html */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[13px] text-[#b7cdb9] font-medium">
          {cups} of {goal} cups
        </span>

        <div className="flex items-center gap-2">
          {/* Minus button */}
          <button
            type="button"
            disabled={cups <= 0 || isFuture || loading}
            onClick={() => handleAdjustCups(-1)}
            aria-label="Remove one cup of water"
            className="w-[34px] h-[34px] rounded-full border border-[#3d5247] bg-transparent text-white hover:bg-[#2d4238] text-[16px] font-bold flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-[#7c9a7e]"
          >
            −
          </button>

          {/* Plus Add cup button */}
          <button
            type="button"
            disabled={cups >= maxCups || isFuture || loading}
            onClick={() => handleAdjustCups(1)}
            aria-label="Add one cup of water"
            className="h-[34px] px-3.5 rounded-full bg-[#7c9a7e] hover:bg-[#6b896d] text-white text-[13px] font-semibold flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-[#7c9a7e]"
          >
            + Add cup
          </button>
        </div>
      </div>
    </article>
  );
}

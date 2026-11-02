"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import {
  calculateStreak,
  calculateOnTarget,
  calculateAverages,
  calculateWeeklyChange,
} from "@/lib/progress";
import { calculateDailyTarget } from "@/lib/nutrition";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface WeightLog {
  id: string;
  logged_on: string;
  weight_kg: number;
}

interface CalorieDayLog {
  date: string;
  calories: number;
  protein: number;
}

export default function ProgressPage() {
  const router = useRouter();
  const weightInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [savingWeight, setSavingWeight] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [calorieTrend, setCalorieTrend] = useState<CalorieDayLog[]>([]);

  const [inputWeight, setInputWeight] = useState<string>("70.0");
  const [inputDate, setInputDate] = useState<string>("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const getTodayStr = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  };

  const todayStr = getTodayStr();

  // Load Progress Data
  const loadProgress = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      setInputDate(todayStr);

      const res = await api.getProgressData().catch((err) => {
        console.warn("api.getProgressData failed:", err);
        return { profile: null, weight_logs: [], calorie_trend: [] };
      });

      let p = res.profile;
      if (!p || Object.keys(p).length === 0) {
        p = await api.getProfile().catch(() => null);
      }
      setProfile(p);

      const sortedWeightLogs = (res.weight_logs || []).sort(
        (a, b) => new Date(a.logged_on).getTime() - new Date(b.logged_on).getTime()
      );
      setWeightLogs(sortedWeightLogs);
      setCalorieTrend(res.calorie_trend || []);

      if (sortedWeightLogs.length > 0) {
        const latestWeight = sortedWeightLogs[sortedWeightLogs.length - 1].weight_kg;
        setInputWeight(Number(latestWeight).toFixed(1));
      } else if (p?.current_weight_kg) {
        setInputWeight(Number(p.current_weight_kg).toFixed(1));
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load progress data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProgress();
  }, [router]);

  // Handle Log Weight Submit
  const handleSaveWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const weightNum = parseFloat(inputWeight);
    if (!weightNum || isNaN(weightNum) || weightNum < 20 || weightNum > 300) {
      setErrorMsg("Please enter a valid weight between 20 kg and 300 kg.");
      return;
    }

    if (inputDate > todayStr) {
      setErrorMsg("Future dates are not allowed. Only today and past dates can be logged.");
      return;
    }

    setSavingWeight(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api.logWeight(weightNum, inputDate || todayStr);

      // Upsert in local weightLogs
      setWeightLogs((prev) => {
        const dateToLog = inputDate || todayStr;
        const filtered = prev.filter((w) => w.logged_on !== dateToLog);
        const updated = [...filtered, { id: res.weight_log?.id || `w-${Date.now()}`, logged_on: dateToLog, weight_kg: weightNum }];
        return updated.sort((a, b) => new Date(a.logged_on).getTime() - new Date(b.logged_on).getTime());
      });

      if (res.profile) {
        setProfile((prev: any) => ({ ...(prev || {}), ...res.profile, current_weight_kg: weightNum }));
      }

      // Sync with localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("fitme_current_weight_kg", String(weightNum));
        if (res.profile?.daily_calorie_target) {
          localStorage.setItem("fitme_daily_calorie_target", String(Math.round(res.profile.daily_calorie_target)));
        }
        window.dispatchEvent(new Event("fitme_goals_updated"));
      }

      setSuccessMsg(`Weight logged: ${weightNum.toFixed(1)} kg on ${inputDate || todayStr}. Daily target refreshed.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save weight log.");
    } finally {
      setSavingWeight(false);
    }
  };

  // 1. Metric Calculations
  const hasWeightLogs = weightLogs.length > 0;
  const currentWeight = hasWeightLogs
    ? weightLogs[weightLogs.length - 1].weight_kg
    : profile?.current_weight_kg || 70.0;

  const startingWeight = hasWeightLogs
    ? weightLogs[0].weight_kg
    : profile?.current_weight_kg || 70.0;

  const targetWeight = profile?.target_weight_kg ? Number(profile.target_weight_kg) : null;
  const isLosing = (profile?.fitness_goal || "lose_weight") in ["lose", "lose_weight"];

  // Lost so far = starting weight minus current (or current minus start if gaining)
  const weightDiff = isLosing ? startingWeight - currentWeight : currentWeight - startingWeight;
  const lostSoFar = Math.max(0, Math.round(weightDiff * 10) / 10);

  // To goal = current minus target weight
  const toGoal = targetWeight != null ? Math.max(0, Math.round(Math.abs(currentWeight - targetWeight) * 10) / 10) : null;

  // Estimated weeks from calculateDailyTarget
  const nutritionCalc = useMemo(() => {
    if (!profile) return null;
    return calculateDailyTarget({
      weight: currentWeight,
      height: profile.height_cm || 170,
      age: profile.age || 25,
      gender: profile.gender || "female",
      activity: profile.activity_level || "moderately_active",
      goal: profile.fitness_goal || "lose_weight",
      pace: profile.pace || "steady",
      targetWeight: targetWeight,
    });
  }, [profile, currentWeight, targetWeight]);

  const estimatedWeeks = nutritionCalc?.weeksToGoal ? `~${nutritionCalc.weeksToGoal} weeks` : "—";
  const dailyTargetKcal = profile?.daily_calorie_target ? Math.round(profile.daily_calorie_target) : 1739;

  // 2. Consistency Stats (streak, on-target, averages)
  const dailyLogsForStats = useMemo(() => {
    return calorieTrend.map((c) => ({
      date: c.date,
      calories: c.calories,
      protein: c.protein,
    }));
  }, [calorieTrend]);

  const streak = calculateStreak(dailyLogsForStats, todayStr);
  const onTargetStats = calculateOnTarget(dailyLogsForStats, dailyTargetKcal, todayStr);
  const averageStats = calculateAverages(dailyLogsForStats, todayStr);

  // 3. Target Check
  const targetCheck = useMemo(() => {
    const paceKgPerWeek = profile?.pace === "slow" ? 0.25 : profile?.pace === "faster" ? 0.75 : 0.5;
    return calculateWeeklyChange(
      weightLogs.map((w) => ({ date: w.logged_on, weight: w.weight_kg })),
      paceKgPerWeek,
      isLosing
    );
  }, [weightLogs, profile?.pace, isLosing]);

  // 4. Weight Trend Chart Data (Last 8 Weeks)
  const weightChartLogs = useMemo(() => {
    if (weightLogs.length === 0) return [];
    return weightLogs.slice(-8);
  }, [weightLogs]);

  // 5. Calorie Trend Chart Data (Last 14 Days)
  const calorieChartDays = useMemo(() => {
    const result: Array<{
      date: string;
      label: string;
      calories: number;
      isToday: boolean;
      status: "on_target" | "over_target" | "today" | "empty";
    }> = [];

    const map = new Map<string, number>();
    calorieTrend.forEach((c) => map.set(c.date, c.calories));

    const [y, m, d] = todayStr.split("-").map(Number);
    const now = new Date(y, m - 1, d);

    for (let i = 13; i >= 0; i--) {
      const dt = new Date(now);
      dt.setDate(now.getDate() - i);
      const dtStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const cals = map.get(dtStr) || 0;
      const isToday = dtStr === todayStr;

      let status: "on_target" | "over_target" | "today" | "empty" = "empty";
      if (cals > 0) {
        if (isToday) {
          status = "today";
        } else if (cals > dailyTargetKcal * 1.1) {
          status = "over_target";
        } else {
          status = "on_target";
        }
      }

      const dayMonth = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      result.push({
        date: dtStr,
        label: dayMonth,
        calories: cals,
        isToday,
        status,
      });
    }

    return result;
  }, [calorieTrend, todayStr, dailyTargetKcal]);

  // Goal Progress bar percentage
  const goalProgressPercent = useMemo(() => {
    if (targetWeight == null) return 0;
    const totalDiff = Math.abs(startingWeight - targetWeight);
    if (totalDiff <= 0) return 100;
    const achieved = Math.abs(startingWeight - currentWeight);
    return Math.min(100, Math.max(0, Math.round((achieved / totalDiff) * 100)));
  }, [startingWeight, targetWeight, currentWeight]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-[#7c9a7e]" />
          <p className="text-sm font-semibold text-[#22332d]/70">
            Loading your progress trend...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f6] flex flex-col md:flex-row gap-6 p-4 sm:p-5 lg:p-6 text-[#22332d] selection:bg-[#7c9a7e]/20 selection:text-[#22332d]">
      {/* Sidebar Navigation */}
      <Navbar userFullName={profile?.full_name} />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-[1100px] flex flex-col p-0 sm:py-2 mx-auto w-full">
        {/* 1. Header Row */}
        <header className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-[34px] sm:text-[36px] font-bold text-[#22332d] tracking-tight">
              Progress
            </h1>
            <p className="text-[14px] text-[#5b6b64] mt-1">
              Log your weight weekly. We use it to keep your target accurate.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              weightInputRef.current?.focus();
              weightInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="h-[48px] px-6 rounded-full bg-[#7c9a7e] hover:bg-[#6b896d] text-white font-semibold text-[14px] transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
          >
            + Log weight
          </button>
        </header>

        {errorMsg && (
          <div
            role="alert"
            className="mb-6 p-3.5 rounded-[14px] bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="mb-6 p-3.5 rounded-[14px] bg-[#eaf4fd] border border-[#cfe5f7] text-[#22332d] text-xs flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-[#7c9a7e] flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 2. Four Stat Tiles (grid 4 cols, 2x2 on mobile) */}
        <section
          aria-label="Weight Statistics Overview"
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
        >
          <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40">
            <span className="text-[13px] text-[#5b6b64] font-medium block">Current</span>
            <div className="text-[26px] font-bold text-[#22332d] mt-1">
              {currentWeight} kg
            </div>
          </div>

          <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40">
            <span className="text-[13px] text-[#5b6b64] font-medium block">Lost so far</span>
            <div className="text-[26px] font-bold text-[#22332d] mt-1">
              {lostSoFar} kg
            </div>
          </div>

          {targetWeight != null && (
            <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40">
              <span className="text-[13px] text-[#5b6b64] font-medium block">
                To goal ({targetWeight} kg)
              </span>
              <div className="text-[26px] font-bold text-[#22332d] mt-1">
                {toGoal} kg
              </div>
            </div>
          )}

          <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40">
            <span className="text-[13px] text-[#5b6b64] font-medium block">Estimated</span>
            <div className="text-[26px] font-bold text-[#22332d] mt-1">
              {estimatedWeeks}
            </div>
          </div>
        </section>

        {/* 3 & 4 & 5. Row 1: Weight Trend (1.7fr) + Log Today's Weight & Target Check (1fr) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6 items-start mb-6">
          {/* 3. Weight Trend Card */}
          <section
            aria-label="Weight Trend Line Chart"
            className="bg-white rounded-[24px] p-6 sm:p-7 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[18px] font-bold text-[#22332d]">Weight trend</h2>
              <span className="rounded-full bg-[#eaf1ec] px-3.5 py-1 text-[12px] font-semibold text-[#22332d]">
                8 weeks
              </span>
            </div>

            {weightChartLogs.length < 2 ? (
              <div className="py-16 text-center text-[#5b6b64]">
                <p className="text-[15px] font-medium">Log your weight weekly to see your trend.</p>
                <p className="text-[13px] text-[#5b6b64]/70 mt-1">
                  We use your weigh-ins to compare with your planned pace.
                </p>
              </div>
            ) : (
              <div>
                <svg
                  viewBox="0 0 700 170"
                  width="100%"
                  role="img"
                  aria-label={`Weight trend over 8 weeks. Latest weight is ${currentWeight} kg.`}
                  className="overflow-visible"
                >
                  {/* Dashed Target Weight Goal Line */}
                  {targetWeight != null && (
                    <>
                      <line
                        x1="20"
                        y1="130"
                        x2="680"
                        y2="130"
                        stroke="#7c9a7e"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      <text x="680" y="145" textAnchor="end" fontSize="12" fill="#5b6b64">
                        Goal {targetWeight} kg
                      </text>
                    </>
                  )}

                  {/* Draw Polyline for Weight points */}
                  {(() => {
                    const minW = Math.min(...weightChartLogs.map((l) => l.weight_kg), targetWeight || currentWeight) - 1;
                    const maxW = Math.max(...weightChartLogs.map((l) => l.weight_kg)) + 1;
                    const range = Math.max(2, maxW - minW);

                    const points = weightChartLogs.map((log, idx) => {
                      const x = 40 + (idx / Math.max(1, weightChartLogs.length - 1)) * 600;
                      const y = 30 + ((maxW - log.weight_kg) / range) * 85;
                      return { x, y, weight: log.weight_kg, date: log.logged_on };
                    });

                    const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

                    return (
                      <>
                        <polyline
                          fill="none"
                          stroke="#22332d"
                          strokeWidth="2.5"
                          points={polylinePoints}
                        />

                        {/* Regular Points */}
                        {points.slice(0, -1).map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r="4.5"
                            fill="#22332d"
                          />
                        ))}

                        {/* Latest Point highlighted in Sage with weight label */}
                        {points.length > 0 && (
                          <g>
                            <circle
                              cx={points[points.length - 1].x}
                              cy={points[points.length - 1].y}
                              r="7"
                              fill="#7c9a7e"
                            />
                            <text
                              x={points[points.length - 1].x}
                              y={points[points.length - 1].y - 12}
                              textAnchor="middle"
                              fontSize="13"
                              fontWeight="700"
                              fill="#22332d"
                            >
                              {points[points.length - 1].weight}
                            </text>
                          </g>
                        )}
                      </>
                    );
                  })()}
                </svg>

                <p className="sr-only">
                  Weight fell from {startingWeight} to {currentWeight} kg over 8 weeks.
                </p>
              </div>
            )}
          </section>

          {/* Right Column: Log Today's Weight + Target Check */}
          <div className="flex flex-col gap-6">
            {/* 4. Log today's weight Form Card */}
            <section
              aria-label="Log Weight Form"
              className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40"
            >
              <h2 className="text-[18px] font-bold text-[#22332d] mb-4">
                Log today&apos;s weight
              </h2>

              <form onSubmit={handleSaveWeight} className="flex flex-col gap-3">
                <label className="block">
                  <span className="text-[13px] font-semibold text-[#3a4a43]">
                    Weight (kg)
                  </span>
                  <input
                    ref={weightInputRef}
                    type="number"
                    step="0.1"
                    min="20"
                    max="300"
                    required
                    value={inputWeight}
                    onChange={(e) => setInputWeight(e.target.value)}
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] text-[15px] font-medium text-[#22332d] focus:outline-none focus:border-[#7c9a7e]"
                  />
                </label>

                <label className="block">
                  <span className="text-[13px] font-semibold text-[#3a4a43]">
                    Date
                  </span>
                  <input
                    type="date"
                    max={todayStr}
                    required
                    value={inputDate}
                    onChange={(e) => setInputDate(e.target.value)}
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] text-[15px] font-medium text-[#22332d] focus:outline-none focus:border-[#7c9a7e]"
                  />
                </label>

                <button
                  type="submit"
                  disabled={savingWeight}
                  className="w-full h-[52px] rounded-full bg-[#22332d] hover:bg-[#182420] text-white font-semibold text-[15px] mt-2 flex items-center justify-center transition-colors disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
                >
                  {savingWeight ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Saving weight...
                    </>
                  ) : (
                    "Save weight"
                  )}
                </button>
              </form>
            </section>

            {/* 5. Target Check Card (dark) */}
            <section
              aria-label="Target Check Pace Comparison"
              className="bg-[#22332d] text-white rounded-[24px] p-6 shadow-sm"
            >
              <span className="inline-block rounded-full bg-[#eaf1ec] px-3.5 py-1 text-[12px] font-semibold text-[#22332d]">
                Target check
              </span>

              <p className="mt-3 text-[14px] text-[#dfe9e2] leading-[1.5]">
                {targetCheck.message} Your daily target stays at{" "}
                <b>{dailyTargetKcal.toLocaleString()} kcal</b>.
              </p>
            </section>
          </div>
        </div>

        {/* 6 & 7 & 8. Row 2: Calorie Trend (1.7fr) + Consistency & Goal Progress (1fr) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6 items-start">
          {/* 6. Calorie Trend Card */}
          <section
            aria-label="Calorie Trend Bar Chart"
            className="bg-white rounded-[24px] p-6 sm:p-7 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40"
          >
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-[18px] font-bold text-[#22332d]">Calorie trend</h2>
                <p className="text-[13px] text-[#5b6b64] mt-0.5">
                  Calories eaten each day vs your goal. Steady bars mean good consistency.
                </p>
              </div>
              <span className="rounded-full bg-[#eaf1ec] px-3.5 py-1 text-[12px] font-semibold text-[#22332d] flex-shrink-0">
                Last 14 days
              </span>
            </div>

            {/* SVG Bar Chart for 14 days */}
            <div className="mt-4">
              <svg
                viewBox="0 0 700 235"
                width="100%"
                role="img"
                aria-label={`Calories eaten per day over 14 days against a ${dailyTargetKcal} kcal goal`}
              >
                <line x1="0" y1="200" x2="700" y2="200" stroke="#e6ebe7" />

                {/* 14 Bar Slots */}
                {calorieChartDays.map((bar, i) => {
                  const barWidth = 32;
                  const x = 10 + i * 47;
                  const maxChartCals = Math.max(dailyTargetKcal * 1.3, 2400);

                  if (bar.calories <= 0) {
                    // Empty slot, not zero bar
                    return null;
                  }

                  const barHeight = Math.min(180, (bar.calories / maxChartCals) * 190);
                  const y = 200 - barHeight;

                  let fillColor = "#22332d"; // dark for on-target
                  if (bar.isToday) {
                    fillColor = "#7c9a7e"; // sage for today so far
                  } else if (bar.status === "over_target") {
                    fillColor = "#cfdcd2"; // light sage for over target
                  }

                  return (
                    <rect
                      key={bar.date}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx="6"
                      fill={fillColor}
                    />
                  );
                })}

                {/* Dashed Goal Line */}
                {(() => {
                  const maxChartCals = Math.max(dailyTargetKcal * 1.3, 2400);
                  const goalY = 200 - (dailyTargetKcal / maxChartCals) * 190;
                  return (
                    <>
                      <line
                        x1="0"
                        y1={goalY}
                        x2="700"
                        y2={goalY}
                        stroke="#7c9a7e"
                        strokeWidth="2"
                        strokeDasharray="6 6"
                      />
                      <text
                        x="696"
                        y={goalY - 8}
                        textAnchor="end"
                        fontSize="12"
                        fill="#5b6b64"
                      >
                        Goal {dailyTargetKcal.toLocaleString()} kcal
                      </text>
                    </>
                  );
                })()}

                {/* Date Labels at Bottom */}
                <g fontSize="11" fill="#5b6b64">
                  <text x="10" y="222">
                    {calorieChartDays[0]?.label || "Day 1"}
                  </text>
                  <text x="338" y="222">
                    {calorieChartDays[7]?.label || "Day 7"}
                  </text>
                  <text x="640" y="222">
                    {calorieChartDays[13]?.label || "Today"}
                  </text>
                </g>
              </svg>

              {/* Legend under chart matching design */}
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[#5b6b64]">
                  <i className="w-3 h-3 rounded-[4px] bg-[#22332d] inline-block" />
                  On target (within 10%)
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[#5b6b64]">
                  <i className="w-3 h-3 rounded-[4px] bg-[#cfdcd2] inline-block" />
                  Over target
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[#5b6b64]">
                  <i className="w-3 h-3 rounded-[4px] bg-[#7c9a7e] inline-block" />
                  Today so far
                </span>
              </div>
            </div>
          </section>

          {/* Right Column: Consistency + Goal Progress */}
          <div className="flex flex-col gap-6">
            {/* 7. Consistency Card (dark) */}
            <section
              aria-label="Logging Consistency Summary"
              className="bg-[#22332d] text-white rounded-[24px] p-6 shadow-sm"
            >
              <div className="text-[11px] tracking-[0.08em] text-[#b7cdb9] font-semibold uppercase">
                CONSISTENCY
              </div>
              <div className="text-[26px] font-bold text-white mt-1 mb-3.5">
                {streak}-day streak
              </div>

              {/* 2x2 Grid of Consistency Metrics */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-[#2d4238] rounded-[14px] p-3 border border-[#3d5247]/30">
                  <div className="text-[11px] text-[#b7cdb9]">On target</div>
                  <b className="text-[18px] font-bold text-white block mt-0.5">
                    {onTargetStats.onTargetDays} of {onTargetStats.totalDays} days
                  </b>
                </div>

                <div className="bg-[#2d4238] rounded-[14px] p-3 border border-[#3d5247]/30">
                  <div className="text-[11px] text-[#b7cdb9]">Avg calories</div>
                  <b className="text-[18px] font-bold text-white block mt-0.5">
                    {averageStats.avgCalories.toLocaleString()}
                  </b>
                </div>

                <div className="bg-[#2d4238] rounded-[14px] p-3 border border-[#3d5247]/30">
                  <div className="text-[11px] text-[#b7cdb9]">Avg protein</div>
                  <b className="text-[18px] font-bold text-white block mt-0.5">
                    {averageStats.avgProtein} g
                  </b>
                </div>

                <div className="bg-[#2d4238] rounded-[14px] p-3 border border-[#3d5247]/30">
                  <div className="text-[11px] text-[#b7cdb9]">Logged days</div>
                  <b className="text-[18px] font-bold text-white block mt-0.5">
                    {averageStats.loggedDaysCount} of 14
                  </b>
                </div>
              </div>
            </section>

            {/* 8. Goal Progress Card (hidden when no target weight) */}
            {targetWeight != null && (
              <section
                aria-label="Overall Goal Progress"
                className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40"
              >
                <h2 className="text-[18px] font-bold text-[#22332d] mb-1">
                  Goal progress
                </h2>
                <div className="text-[22px] font-bold text-[#22332d] mb-3">
                  {lostSoFar} kg lost · {toGoal} kg to go
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-[#e9eeea] overflow-hidden mb-2">
                  <div
                    className="h-full bg-[#7c9a7e] transition-all duration-500 rounded-full"
                    style={{ width: `${goalProgressPercent}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-[13px] text-[#5b6b64]">
                  <span>{startingWeight} kg start</span>
                  <span>{currentWeight} now</span>
                  <span>{targetWeight} goal</span>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


/**
 * Pure progress & consistency calculation engine.
 * Computes streaks, on-target days, calorie/protein averages,
 * and weekly weight change pace comparisons.
 */

export interface DailyLogSummary {
  date: string; // YYYY-MM-DD
  calories: number;
  protein?: number;
}

export interface WeightLogEntry {
  date: string; // YYYY-MM-DD
  weight: number; // in kg
}

export interface ConsistencyStats {
  streak: number; // consecutive logged days
  onTargetDays: number; // days within 10% of goal in last 7 days (excluding today)
  totalTargetDays: number; // 7
  avgCalories: number; // average calories on logged days in last 14 days
  avgProtein: number; // average protein (g) on logged days in last 14 days
  loggedDaysCount: number; // count of logged days in last 14 days
  totalDaysWindow: number; // 14
}

export type PaceStatus = "on_pace" | "slower" | "faster" | "insufficient_data";

export interface TargetCheckResult {
  status: PaceStatus;
  statusLabel: string;
  actualWeeklyChangeKg: number | null;
  chosenPaceKgPerWeek: number;
  message: string;
}

/**
 * Calculates consecutive logging streak.
 * Streak = consecutive days with at least one food log, ending today.
 * If today has no log yet, count back from yesterday.
 */
export function calculateStreak(
  logs: DailyLogSummary[],
  todayStr: string
): number {
  if (!logs || logs.length === 0) return 0;

  // Build a set of dates that have at least one food log (calories > 0)
  const loggedDates = new Set(
    logs.filter((l) => l.calories > 0).map((l) => l.date)
  );

  const [y, m, d] = todayStr.split("-").map(Number);
  const curDate = new Date(y, m - 1, d);

  // Check if today has a log
  let checkDate = new Date(curDate);
  const todayLogged = loggedDates.has(formatDate(checkDate));

  if (!todayLogged) {
    // Count back from yesterday
    checkDate.setDate(checkDate.getDate() - 1);
  }

  let streak = 0;
  while (true) {
    const dStr = formatDate(checkDate);
    if (loggedDates.has(dStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calculates days within 10% of goal in the last 7 days (excluding today).
 * Boundary rule: exactly at 10% (0.90 * goal or 1.10 * goal) is ON target.
 */
export function calculateOnTarget(
  logs: DailyLogSummary[],
  goal: number,
  todayStr: string
): { onTargetDays: number; totalDays: number } {
  if (goal <= 0) return { onTargetDays: 0, totalDays: 7 };

  const logMap = new Map<string, number>();
  logs.forEach((l) => logMap.set(l.date, l.calories));

  const [y, m, d] = todayStr.split("-").map(Number);
  const curDate = new Date(y, m - 1, d);

  let onTargetDays = 0;
  const lowerBound = goal * 0.9;
  const upperBound = goal * 1.1;

  // Loop through past 7 days, excluding today
  for (let i = 1; i <= 7; i++) {
    const pastDate = new Date(curDate);
    pastDate.setDate(curDate.getDate() - i);
    const dStr = formatDate(pastDate);
    const cals = logMap.get(dStr);

    if (cals && cals > 0) {
      // Round to 2 decimal places to avoid floating point comparison issues
      const rounded = Math.round(cals * 100) / 100;
      if (rounded >= Math.round(lowerBound * 100) / 100 && rounded <= Math.round(upperBound * 100) / 100) {
        onTargetDays++;
      }
    }
  }

  return { onTargetDays, totalDays: 7 };
}

/**
 * Calculates average calories and protein over logged days in the last 14 days.
 */
export function calculateAverages(
  logs: DailyLogSummary[],
  todayStr: string
): { avgCalories: number; avgProtein: number; loggedDaysCount: number } {
  const logMap = new Map<string, DailyLogSummary>();
  logs.forEach((l) => logMap.set(l.date, l));

  const [y, m, d] = todayStr.split("-").map(Number);
  const curDate = new Date(y, m - 1, d);

  let totalCals = 0;
  let totalProtein = 0;
  let loggedDaysCount = 0;

  for (let i = 0; i < 14; i++) {
    const day = new Date(curDate);
    day.setDate(curDate.getDate() - i);
    const dStr = formatDate(day);
    const entry = logMap.get(dStr);

    if (entry && entry.calories > 0) {
      totalCals += entry.calories;
      totalProtein += entry.protein || 0;
      loggedDaysCount++;
    }
  }

  const avgCalories = loggedDaysCount > 0 ? Math.round(totalCals / loggedDaysCount) : 0;
  const avgProtein = loggedDaysCount > 0 ? Math.round(totalProtein / loggedDaysCount) : 0;

  return { avgCalories, avgProtein, loggedDaysCount };
}

/**
 * Compares actual weekly weight change (last 3-4 weeks) with chosen pace.
 * Needs at least 2 logs, otherwise "insufficient_data".
 */
export function calculateWeeklyChange(
  weightLogs: WeightLogEntry[],
  chosenPaceKgPerWeek: number = 0.5,
  isLosing: boolean = true
): TargetCheckResult {
  if (!weightLogs || weightLogs.length < 2) {
    return {
      status: "insufficient_data",
      statusLabel: "Needs more logs",
      actualWeeklyChangeKg: null,
      chosenPaceKgPerWeek,
      message: "Log a few more weigh-ins to see how you're doing.",
    };
  }

  // Sort logs ascending by date
  const sorted = [...weightLogs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];

  const diffMs = new Date(newest.date).getTime() - new Date(oldest.date).getTime();
  const daysDiff = Math.max(1, diffMs / (1000 * 60 * 60 * 24));
  const weeksDiff = daysDiff / 7;

  // Actual delta in weight
  const weightDelta = newest.weight - oldest.weight;
  // If losing: positive change rate means weight lost per week
  const actualRate = isLosing
    ? -weightDelta / Math.max(0.5, weeksDiff)
    : weightDelta / Math.max(0.5, weeksDiff);

  const roundedRate = Math.round(actualRate * 100) / 100;

  // Margin of 0.15 kg/week around chosen pace
  const tolerance = 0.15;
  let status: PaceStatus = "on_pace";
  let statusLabel = "On pace";
  let message = "";

  if (roundedRate < chosenPaceKgPerWeek - tolerance) {
    status = "slower";
    statusLabel = "Slower than planned";
    message = `Your ${isLosing ? "loss" : "gain"} is slower than planned (about ${Math.max(0, roundedRate)} kg per week).`;
  } else if (roundedRate > chosenPaceKgPerWeek + tolerance) {
    status = "faster";
    statusLabel = "Faster than planned";
    message = `Your ${isLosing ? "loss" : "gain"} is faster than planned (about ${roundedRate} kg per week).`;
  } else {
    status = "on_pace";
    statusLabel = "On pace";
    message = `Your ${isLosing ? "loss" : "gain"} is on pace (about ${roundedRate} kg per week).`;
  }

  return {
    status,
    statusLabel,
    actualWeeklyChangeKg: roundedRate,
    chosenPaceKgPerWeek,
    message,
  };
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


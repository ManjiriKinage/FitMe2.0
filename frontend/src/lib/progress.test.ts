import {
  calculateStreak,
  calculateOnTarget,
  calculateAverages,
  calculateWeeklyChange,
} from "./progress";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log("Running progress helper unit tests...");

const TODAY = "2026-11-02";

// 1. NO DATA TESTS
console.log("Test: No data");
assert(calculateStreak([], TODAY) === 0, "Streak with no data should be 0");
const noTarget = calculateOnTarget([], 2000, TODAY);
assert(noTarget.onTargetDays === 0 && noTarget.totalDays === 7, "On-target with no data should be 0 of 7");
const noAvg = calculateAverages([], TODAY);
assert(noAvg.avgCalories === 0 && noAvg.loggedDaysCount === 0, "Avg with no data should be 0");
const noWeight = calculateWeeklyChange([], 0.5, true);
assert(noWeight.status === "insufficient_data", "Weekly change with no logs should be insufficient_data");

// 2. ONE WEIGHT LOG
console.log("Test: One weight log");
const oneWeight = calculateWeeklyChange([{ date: "2026-11-01", weight: 70.0 }], 0.5, true);
assert(oneWeight.status === "insufficient_data", "One weight log must return insufficient_data");

// 3. TODAY WITH NO LOGS (count back from yesterday)
console.log("Test: Today with no logs");
// Yesterday: 2026-11-01, Day before: 2026-10-31, 2026-10-30
const logsWithoutToday = [
  { date: "2026-11-01", calories: 1800, protein: 90 },
  { date: "2026-10-31", calories: 1750, protein: 85 },
  { date: "2026-10-30", calories: 1900, protein: 100 },
];
const streakYesterday = calculateStreak(logsWithoutToday, TODAY);
assert(streakYesterday === 3, `Expected streak 3 counting back from yesterday, got ${streakYesterday}`);

// 4. GAPS IN DAYS
console.log("Test: Gaps in days");
// Has 2026-11-02, 2026-11-01, GAP on 2026-10-31, then 2026-10-30
const logsWithGap = [
  { date: "2026-11-02", calories: 1800 },
  { date: "2026-11-01", calories: 1750 },
  // gap on 2026-10-31
  { date: "2026-10-30", calories: 1900 },
  { date: "2026-10-29", calories: 1950 },
];
const streakGap = calculateStreak(logsWithGap, TODAY);
assert(streakGap === 2, `Expected streak 2 because gap on 10-31 broke streak, got ${streakGap}`);

// 5. DAY EXACTLY AT 10% BOUNDARY
console.log("Test: Exactly at 10% boundary");
// Goal: 2000 kcal. 10% lower = 1800, 10% higher = 2200.
// Day 1 (yesterday, 2026-11-01): 1800 (exactly -10% boundary) -> ON target
// Day 2 (2026-10-31): 2200 (exactly +10% boundary) -> ON target
// Day 3 (2026-10-30): 1799 (just below -10%) -> NOT on target
// Day 4 (2026-10-29): 2201 (just above +10%) -> NOT on target
// Day 5 (2026-10-28): 2000 (exact) -> ON target
const boundaryLogs = [
  { date: "2026-11-01", calories: 1800 },
  { date: "2026-10-31", calories: 2200 },
  { date: "2026-10-30", calories: 1799 },
  { date: "2026-10-29", calories: 2201 },
  { date: "2026-10-28", calories: 2000 },
];
const boundaryResult = calculateOnTarget(boundaryLogs, 2000, TODAY);
assert(boundaryResult.onTargetDays === 3, `Expected 3 on-target days at boundaries, got ${boundaryResult.onTargetDays}`);

// 6. WEEKLY CHANGE PACE COMPARISON (ON PACE, SLOWER, FASTER)
console.log("Test: Weekly change pace");
// 4 weeks ago: 72kg on 2026-10-05, today: 70kg on 2026-11-02 -> lost 2kg in 4 weeks = 0.5 kg/week
const paceLogsOnPace = [
  { date: "2026-10-05", weight: 72.0 },
  { date: "2026-10-19", weight: 71.0 },
  { date: "2026-11-02", weight: 70.0 },
];
const checkOnPace = calculateWeeklyChange(paceLogsOnPace, 0.5, true);
assert(checkOnPace.status === "on_pace", `Expected on_pace, got ${checkOnPace.status}`);

// Slower pace: lost only 0.2kg in 4 weeks
const paceLogsSlower = [
  { date: "2026-10-05", weight: 72.0 },
  { date: "2026-11-02", weight: 71.8 },
];
const checkSlower = calculateWeeklyChange(paceLogsSlower, 0.5, true);
assert(checkSlower.status === "slower", `Expected slower, got ${checkSlower.status}`);

// Faster pace: lost 4kg in 4 weeks = 1.0 kg/week vs 0.5 planned
const paceLogsFaster = [
  { date: "2026-10-05", weight: 72.0 },
  { date: "2026-11-02", weight: 68.0 },
];
const checkFaster = calculateWeeklyChange(paceLogsFaster, 0.5, true);
assert(checkFaster.status === "faster", `Expected faster, got ${checkFaster.status}`);

console.log("All progress helper unit tests passed successfully!");


import { calculateDailyTarget } from "./nutrition";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log("Running nutrition calculation unit tests...");

// Test Case 1: Canonical test case from user prompt
// 70 kg, 170 cm, age 25, female, moderate, lose, steady, target 65 kg
// Expected: BMR 1477, TDEE 2289, target 1739, protein 112 g, fats 48 g, carbs 214 g, 10 weeks
const res1 = calculateDailyTarget({
  weight: 70,
  height: 170,
  age: 25,
  gender: "female",
  activity: "moderate",
  goal: "lose",
  pace: "steady",
  targetWeight: 65,
});

console.log("Test Case 1 output:", res1);
assert(res1.bmr === 1477, `BMR expected 1477, got ${res1.bmr}`);
assert(res1.tdee === 2289, `TDEE expected 2289, got ${res1.tdee}`);
assert(res1.target === 1739, `Target expected 1739, got ${res1.target}`);
assert(res1.protein === 112, `Protein expected 112, got ${res1.protein}`);
assert(res1.fats === 48, `Fats expected 48, got ${res1.fats}`);
assert(res1.carbs === 214, `Carbs expected 214, got ${res1.carbs}`);
assert(res1.weeksToGoal === 10, `Weeks expected 10, got ${res1.weeksToGoal}`);
assert(res1.floorApplied === false, "Floor should not be applied");
assert(res1.error === null, "Error should be null");

// Test Case 2: Maintain goal
const res2 = calculateDailyTarget({
  weight: 70,
  height: 170,
  age: 25,
  gender: "female",
  activity: "moderate",
  goal: "maintain",
  pace: "steady",
});
console.log("Test Case 2 (Maintain) output:", res2);
assert(res2.bmr === 1477, `Maintain BMR expected 1477, got ${res2.bmr}`);
assert(res2.tdee === 2289, `Maintain TDEE expected 2289, got ${res2.tdee}`);
assert(res2.target === 2289, `Maintain Target expected 2289, got ${res2.target}`);
assert(res2.protein === Math.round(70 * 1.2), `Maintain Protein expected 84, got ${res2.protein}`);
assert(res2.weeksToGoal === null, "Maintain weeksToGoal should be null");

// Test Case 3: Gain goal
// 70 kg, 170 cm, 25, female, moderate, gain, faster (0.75 kg/wk = 825 cals), target 75
const res3 = calculateDailyTarget({
  weight: 70,
  height: 170,
  age: 25,
  gender: "female",
  activity: "moderate",
  goal: "gain",
  pace: "faster",
  targetWeight: 75,
});
console.log("Test Case 3 (Gain) output:", res3);
assert(res3.target === 2289 + 825, `Gain Target expected ${2289 + 825}, got ${res3.target}`);
assert(res3.protein === Math.round(70 * 1.2), `Gain Protein expected 84, got ${res3.protein}`);
assert(res3.weeksToGoal === Math.round(5 / 0.75), `Gain Weeks expected 7, got ${res3.weeksToGoal}`);

// Test Case 4: Safety Floor (e.g. female sedentary with heavy deficit)
// weight 50, height 150, age 40, sedentary (BMR = 500 + 937.5 - 200 - 161 = 1076.5)
// TDEE = 1076.5 * 1.2 = 1291.8
// deficit 825 -> 467 kcal, but absolute floor is 1200 and raw BMR is 1077 -> floor should be 1200
const res4 = calculateDailyTarget({
  weight: 50,
  height: 150,
  age: 40,
  gender: "female",
  activity: "sedentary",
  goal: "lose",
  pace: "faster",
  targetWeight: 45,
});
console.log("Test Case 4 (Safety Floor) output:", res4);
assert(res4.floorApplied === true, "Floor should be applied");
assert(res4.target === 1200, `Target should be clamped to female minimum 1200, got ${res4.target}`);

// Test Case 5: Safety floor when BMR > absolute floor
// male, 100 kg, 190 cm, 30y, sedentary (BMR = 1000 + 1187.5 - 150 + 5 = 2042.5)
// TDEE = 2042.5 * 1.2 = 2451
// deficit 825 -> 1626, but BMR is 2043 -> floor should be 2043 (never below BMR)
const res5 = calculateDailyTarget({
  weight: 100,
  height: 190,
  age: 30,
  gender: "male",
  activity: "sedentary",
  goal: "lose",
  pace: "faster",
  targetWeight: 90,
});
console.log("Test Case 5 (BMR floor) output:", res5);
assert(res5.floorApplied === true, "Floor should be applied");
assert(res5.target === Math.round(res5.bmr), `Target should be clamped to BMR ${res5.bmr}, got ${res5.target}`);

// Test Case 6: Target weight validation
const res6 = calculateDailyTarget({
  weight: 70,
  height: 170,
  age: 25,
  gender: "female",
  activity: "moderate",
  goal: "lose",
  pace: "steady",
  targetWeight: 75, // Invalid: target > weight when losing
});
assert(res6.error !== null, "Should return error when target weight is > current weight for losing");

console.log("All unit tests passed successfully!");


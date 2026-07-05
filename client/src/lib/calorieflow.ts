import type { Meal, Settings, Weight } from "@shared/schema";
import { ACTIVITY_MULTIPLIERS } from "@shared/schema";

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return localDateStr(new Date());
}

export function daysSince(dateStr: string, targetDateStr?: string): number {
  const start = new Date(dateStr + "T00:00:00");
  const target = targetDateStr ? new Date(targetDateStr + "T00:00:00") : new Date();
  const diff = Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

export function sumMacros(meals: Meal[]) {
  return meals.reduce(
    (acc, m) => {
      acc.calories += m.calories;
      acc.proteins += m.proteins;
      acc.carbs += m.carbs;
      acc.fats += m.fats;
      return acc;
    },
    { calories: 0, proteins: 0, carbs: 0, fats: 0 },
  );
}

export function mealsForDate(meals: Meal[], date: string): Meal[] {
  return meals.filter((m) => m.date === date);
}

export function caloriesByMealType(meals: Meal[]) {
  const out: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  for (const m of meals) out[m.mealType] = (out[m.mealType] || 0) + m.calories;
  return out;
}

export function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(localDateStr(d));
  }
  return out;
}

export function dailyCaloriesSeries(
  meals: Meal[],
  dates: string[],
  activities: { date: string; caloriesBurned: number }[] = [],
) {
  return dates.map((date) => {
    const eaten = meals.filter((m) => m.date === date).reduce((a, m) => a + m.calories, 0);
    const burned = activities.filter((a) => a.date === date).reduce((a, act) => a + act.caloriesBurned, 0);
    const d = new Date(date + "T00:00:00");
    return {
      date,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      shortLabel: d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
      calories: Math.max(0, eaten - burned),
    };
  });
}

export function weeklyWeightDeltas(weights: Weight[], settings: Settings | undefined) {
  if (!settings || weights.length === 0) return [] as { week: string; delta: number; avgKg: number }[];
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const start = new Date(settings.journeyStartDate + "T00:00:00");
  const groups = new Map<number, number[]>();
  for (const w of sorted) {
    const d = new Date(w.date + "T00:00:00");
    const weekIdx = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7));
    if (weekIdx < 0) continue;
    const arr = groups.get(weekIdx) || [];
    arr.push(w.weightKg);
    groups.set(weekIdx, arr);
  }
  const weekKeys = Array.from(groups.keys()).sort((a, b) => a - b);
  let prev =
    settings.startingWeightKg && settings.startingWeightKg > 0
      ? settings.startingWeightKg
      : sorted[0]?.weightKg ?? 0;
  const out: { week: string; delta: number; avgKg: number }[] = [];
  for (const k of weekKeys) {
    const arr = groups.get(k)!;
    const last = arr[arr.length - 1];
    const avg = +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1);
    out.push({ week: `Week ${k + 1}`, delta: +(last - prev).toFixed(1), avgKg: avg });
    prev = last;
  }
  return out;
}

// ─── BMR / TDEE ────────────────────────────────────────────────────────────────

export function computeBMR(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: "male" | "female",
): number {
  // Mifflin-St Jeor equation
  if (sex === "male") return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;
}

export function computeTDEE(bmr: number, multiplier = 1.2): number {
  return bmr * multiplier;
}

// ─── BMI ────────────────────────────────────────────────────────────────────────

export function computeBMI(weightKg: number, heightCm: number): number {
  const hm = heightCm / 100;
  return weightKg / (hm * hm);
}

export type BMICategory = "underweight" | "normal" | "overweight" | "obese";

export function getBMICategory(bmi: number): BMICategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

/** Healthy weight range for the given height (BMI 20–25). */
export function getHealthyWeightRange(heightCm: number): { minKg: number; maxKg: number } {
  const hm = heightCm / 100;
  return {
    minKg: +(20 * hm * hm).toFixed(1),
    maxKg: +(25 * hm * hm).toFixed(1),
  };
}

/** Suggest a goal mode based on BMI category. */
export function suggestGoalMode(
  category: BMICategory,
): "weight_loss" | "maintenance" | "weight_gain" {
  if (category === "underweight") return "weight_gain";
  if (category === "normal") return "maintenance";
  return "weight_loss";
}

// ─── Three-Line Weight Chart Engine ────────────────────────────────────────────

export type ThreeLinePoint = {
  weekIdx: number;
  week: string;
  planned: number;    // planned weight (always present)
  real?: number;      // real calorie-based estimate (extended forward as reference)
  actual?: number;    // logged weight extended forward as reference line
  actualLog?: number; // logged weight only where truly measured (for dots)
  goal?: number;      // goal weight reference (constant)
};

export function threeLineWeightSeries(
  settings: Settings,
  meals: Meal[],
  activities: { date: string; caloriesBurned: number }[],
  weights: Weight[],
  goalMode?: string,
  lang?: string,
): { points: ThreeLinePoint[]; projectedGoalDate: string | null; currentRealKg: number | undefined; lastLoggedKg: number | undefined } {
  const { heightCm, ageYears, sexAtBirth, goalWeightKg, startingWeightKg, journeyStartDate, dailyCalorieGoal } =
    settings;
  const effectiveMode = goalMode ?? settings.goalMode ?? "weight_loss";
  const needsGoalWeight = effectiveMode !== "maintenance";
  const multiplier = ACTIVITY_MULTIPLIERS[(settings.activityLevel ?? "sedentary") as keyof typeof ACTIVITY_MULTIPLIERS] ?? 1.2;

  if (!heightCm || !ageYears || !sexAtBirth || !startingWeightKg)
    return { points: [], projectedGoalDate: null, currentRealKg: undefined, lastLoggedKg: undefined };
  if (needsGoalWeight && !goalWeightKg)
    return { points: [], projectedGoalDate: null, currentRealKg: undefined, lastLoggedKg: undefined };
  if (sexAtBirth !== "male" && sexAtBirth !== "female")
    return { points: [], projectedGoalDate: null, currentRealKg: undefined, lastLoggedKg: undefined };

  const mealCal = new Map<string, number>();
  for (const m of meals) mealCal.set(m.date, (mealCal.get(m.date) ?? 0) + m.calories);

  const actCal = new Map<string, number>();
  for (const a of activities) actCal.set(a.date, (actCal.get(a.date) ?? 0) + a.caloriesBurned);

  const actualWtMap = new Map<string, number>();
  for (const w of weights) actualWtMap.set(w.date, w.weightKg);

  const today = localDateStr(new Date());
  const startMs = new Date(journeyStartDate + "T00:00:00").getTime();
  const todayMs = new Date(today + "T00:00:00").getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const isLosing = goalWeightKg ? goalWeightKg < startingWeightKg : false;
  const nowLabel = lang === "ru" ? "Сейчас" : "Now";
  const wkLabel = lang === "ru" ? "Нед." : "Wk";
  const currentWeekIdx = Math.floor((todayMs - startMs) / weekMs);

  interface Bucket {
    plannedWeight: number;
    realEndKg: number | undefined;
    hasPast: boolean;
    actuals: number[];
  }
  const buckets = new Map<number, Bucket>();

  // Iterative weight trackers — BMR recomputed from current weight each day
  let plannedWeight = startingWeightKg;
  let realCurrentWeight = actualWtMap.get(localDateStr(new Date(startMs))) ?? startingWeightKg;
  let projectedGoalDate: string | null = null;

  for (let i = 0; i <= 730; i++) {
    const dMs = startMs + i * 86400000;
    const d = new Date(dMs);
    const dateStr = localDateStr(d);
    const weekIdx = Math.floor((dMs - startMs) / weekMs);
    const isPast = dMs <= todayMs;
    const daysAhead = Math.floor((dMs - todayMs) / 86400000);

    if (daysAhead > 365) break;

    if (i > 0) {
      // PLANNED: recompute maintenance from current planned weight each day
      const maintenancePlanned = computeBMR(plannedWeight, heightCm, ageYears, sexAtBirth) * multiplier;
      const deficitPlanned = effectiveMode === "maintenance"
        ? 0
        : maintenancePlanned - (dailyCalorieGoal ?? maintenancePlanned);
      plannedWeight = plannedWeight - deficitPlanned / 7700;

      // REAL ESTIMATE: recompute maintenance from current estimated weight each day (past only)
      if (isPast) {
        const eaten = mealCal.get(dateStr);
        const burned = actCal.get(dateStr) ?? 0;
        if (eaten !== undefined) {
          const maintenanceReal = computeBMR(realCurrentWeight, heightCm, ageYears, sexAtBirth) * multiplier;
          const deficitReal = maintenanceReal - (eaten - burned);
          realCurrentWeight = realCurrentWeight - deficitReal / 7700;
        }
      }

      // Snap real estimate to logged weight when available (re-anchors from measured value)
      const logged = actualWtMap.get(dateStr);
      if (logged !== undefined) realCurrentWeight = logged;
    }

    const realEndKg = isPast ? +realCurrentWeight.toFixed(1) : undefined;

    if (!projectedGoalDate && goalWeightKg) {
      if ((isLosing && plannedWeight <= goalWeightKg) || (!isLosing && plannedWeight >= goalWeightKg)) {
        projectedGoalDate = dateStr;
      }
    }

    if (!buckets.has(weekIdx)) {
      buckets.set(weekIdx, { plannedWeight, realEndKg, hasPast: isPast, actuals: [] });
    } else {
      const b = buckets.get(weekIdx)!;
      b.plannedWeight = plannedWeight;
      if (isPast) { b.realEndKg = realEndKg; b.hasPast = true; }
    }

    const loggedForActuals = actualWtMap.get(dateStr);
    if (loggedForActuals !== undefined) buckets.get(weekIdx)!.actuals.push(loggedForActuals);

    if (projectedGoalDate && daysAhead > 56) break;
  }

  const sorted = Array.from(buckets.entries()).sort(([a], [b]) => a - b);
  const rawPoints: ThreeLinePoint[] = sorted.map(([weekIdx, b]) => {
    const planned = +b.plannedWeight.toFixed(1);
    const real = b.realEndKg;
    const actualLog = b.actuals.length > 0
      ? +(b.actuals.reduce((s, v) => s + v, 0) / b.actuals.length).toFixed(1)
      : undefined;
    return {
      weekIdx,
      week: weekIdx === 0 ? nowLabel : `${wkLabel} ${weekIdx}`,
      planned,
      real,
      actual: actualLog,
      actualLog,
      goal: goalWeightKg ?? undefined,
    };
  });

  // Forward-pass carry-forward: extend each line only from the point where a value
  // was last observed — never backward-fill from a later measurement.
  // real:   extends into future as a flat reference (current estimated weight).
  // actual: only extends to current week; not projected into future weeks.
  let lastRealKg: number | undefined;
  let lastActualKg: number | undefined;
  const points = rawPoints.map(p => {
    if (p.real !== undefined) lastRealKg = p.real;
    if (p.actual !== undefined) lastActualKg = p.actual;
    return {
      ...p,
      real: p.real ?? lastRealKg,
      actual: p.weekIdx <= currentWeekIdx ? (p.actual ?? lastActualKg) : undefined,
    };
  });

  return { points, projectedGoalDate, currentRealKg: lastRealKg, lastLoggedKg: lastActualKg };
}

// ─── Iterative goal-days calculator ────────────────────────────────────────────
// Returns the number of days to reach goalWeightKg from startWeightKg at a fixed
// daily calorie intake, recomputing BMR from the evolving projected weight each day.
// Days is monotonically increasing in calories (weight_loss) / decreasing (weight_gain).
export function iterateDaysToGoal(
  startWeightKg: number,
  goalWeightKg: number,
  heightCm: number,
  ageYears: number,
  sex: "male" | "female",
  dailyCalorieIntake: number,
  mode: "weight_loss" | "weight_gain",
  multiplier = 1.2,
): number {
  let weight = startWeightKg;
  const isLosing = mode === "weight_loss";
  for (let day = 0; day < 3650; day++) {
    const maintenance = computeBMR(weight, heightCm, ageYears, sex) * multiplier;
    const deficit = maintenance - dailyCalorieIntake;
    weight = weight - deficit / 7700;
    if (isLosing && weight <= goalWeightKg) return day + 1;
    if (!isLosing && weight >= goalWeightKg) return day + 1;
  }
  return 3650;
}

// ─── Inverse solver: find calorie intake to hit a target timeline ───────────────
// Binary-searches for the daily calorie intake that reaches goalWeightKg in
// exactly targetDays days under the iterative BMR model.
// If the floor (1200 kcal/day) requires more days than requested, returns 1200
// with the actual days at that floor.
export function solveCaloriesForTimeline(
  targetDays: number,
  startWeightKg: number,
  goalWeightKg: number,
  heightCm: number,
  ageYears: number,
  sex: "male" | "female",
  mode: "weight_loss" | "weight_gain",
  minCalories = 1200,
  multiplier = 1.2,
): { calories: number; actualDays: number } {
  const isLosing = mode === "weight_loss";
  // Check whether the floor already takes longer than requested
  const daysAtFloor = iterateDaysToGoal(startWeightKg, goalWeightKg, heightCm, ageYears, sex, minCalories, mode, multiplier);
  if (isLosing && targetDays <= daysAtFloor) {
    return { calories: minCalories, actualDays: daysAtFloor };
  }
  // Binary search over integer calorie values
  // For weight_loss: days increases with calories (less deficit = slower)
  // For weight_gain: days decreases with calories (more surplus = faster)
  const tdeeApprox = computeBMR(startWeightKg, heightCm, ageYears, sex) * multiplier;
  // For gain: lo must be above maintenance — sub-maintenance calories cause weight loss, not gain
  let lo = isLosing ? minCalories : Math.floor(tdeeApprox) + 1;
  let hi = isLosing ? Math.floor(tdeeApprox) - 1 : Math.floor(tdeeApprox) + 10000;
  for (let iter = 0; iter < 60; iter++) {
    const mid = Math.round((lo + hi) / 2);
    const days = iterateDaysToGoal(startWeightKg, goalWeightKg, heightCm, ageYears, sex, mid, mode, multiplier);
    if (isLosing) {
      if (days < targetDays) lo = mid + 1; else hi = mid;
    } else {
      if (days > targetDays) lo = mid + 1; else hi = mid;
    }
    if (lo >= hi) break;
  }
  const calories = Math.max(minCalories, lo);
  const actualDays = iterateDaysToGoal(startWeightKg, goalWeightKg, heightCm, ageYears, sex, calories, mode, multiplier);
  return { calories, actualDays };
}

// ─── Weight Projection Engine ──────────────────────────────────────────────────

export type WeightProjectionPoint = {
  date: string;
  estimatedWeightKg: number;
};

export function weightProjectionSeries(
  settings: Settings,
  meals: Meal[],
  weights: Weight[] = [],
  goalMode?: string,
): { points: WeightProjectionPoint[]; projectedGoalDate: string | null } {
  const { heightCm, ageYears, sexAtBirth, goalWeightKg, startingWeightKg, journeyStartDate, dailyCalorieGoal } =
    settings;

  const effectiveMode = goalMode ?? settings.goalMode ?? "weight_loss";

  // For maintenance, only need height/age/sex/startingWeight
  const needsGoalWeight = effectiveMode !== "maintenance";
  if (!heightCm || !ageYears || !sexAtBirth || !startingWeightKg) {
    return { points: [], projectedGoalDate: null };
  }
  if (needsGoalWeight && !goalWeightKg) {
    return { points: [], projectedGoalDate: null };
  }

  if (sexAtBirth !== "male" && sexAtBirth !== "female") return { points: [], projectedGoalDate: null };
  const bmr = computeBMR(startingWeightKg, heightCm, ageYears, sexAtBirth);
  const tdee = computeTDEE(bmr, 1.2);

  // Build per-day calorie map from actual meals
  const calByDate = new Map<string, number>();
  for (const meal of meals) {
    calByDate.set(meal.date, (calByDate.get(meal.date) || 0) + meal.calories);
  }

  // Build actual weight map
  const actualWeightMap = new Map<string, number>();
  for (const w of weights) actualWeightMap.set(w.date, w.weightKg);

  const today = todayStr();

  // Future projection uses dailyCalorieGoal so the line reflects the plan:
  // weight_loss → TDEE-500 → positive deficit → weight falls
  // weight_gain → TDEE+350 → negative deficit → weight rises
  // maintenance → 0
  const projectedDailyDeficit =
    effectiveMode === "maintenance" ? 0 : tdee - (dailyCalorieGoal ?? tdee);

  const isLosingWeight = goalWeightKg ? goalWeightKg < startingWeightKg : false;
  const startDateObj = new Date(journeyStartDate + "T00:00:00");
  const todayDateObj = new Date(today + "T00:00:00");

  const points: WeightProjectionPoint[] = [];
  let currentWeight = startingWeightKg;
  let projectedGoalDate: string | null = null;

  for (let i = 0; i < 730; i++) {
    const d = new Date(startDateObj);
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);

    if (i === 0) {
      currentWeight = actualWeightMap.get(dateStr) ?? startingWeightKg;
      points.push({ date: dateStr, estimatedWeightKg: currentWeight });
      continue;
    }

    let dailyDeficit: number;
    if (dateStr <= today) {
      const actual = calByDate.get(dateStr);
      dailyDeficit = actual !== undefined ? tdee - actual : 0;
    } else {
      const daysFromToday = Math.floor((d.getTime() - todayDateObj.getTime()) / (1000 * 60 * 60 * 24));
      if (daysFromToday > 365) break;
      dailyDeficit = projectedDailyDeficit;
    }

    currentWeight = currentWeight - dailyDeficit / 7700;

    // Anchor to actual logged weight
    const loggedWeight = actualWeightMap.get(dateStr);
    if (loggedWeight !== undefined) currentWeight = loggedWeight;

    points.push({ date: dateStr, estimatedWeightKg: +currentWeight.toFixed(2) });

    if (!projectedGoalDate && goalWeightKg) {
      if (isLosingWeight && currentWeight <= goalWeightKg) {
        projectedGoalDate = dateStr;
        break;
      } else if (!isLosingWeight && currentWeight >= goalWeightKg) {
        projectedGoalDate = dateStr;
        break;
      }
    }
  }

  return { points, projectedGoalDate };
}

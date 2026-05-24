import type { Meal, Settings, Weight } from "@shared/schema";
import { ACTIVITY_MULTIPLIERS, type ActivityLevel } from "@shared/schema";

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

export function dailyCaloriesSeries(meals: Meal[], dates: string[]) {
  return dates.map((date) => {
    const sum = meals.filter((m) => m.date === date).reduce((a, m) => a + m.calories, 0);
    const d = new Date(date + "T00:00:00");
    return {
      date,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      shortLabel: d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
      calories: sum,
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
  const activityMultiplier = ACTIVITY_MULTIPLIERS[(settings.activityLevel as ActivityLevel) ?? "sedentary"] ?? 1.2;
  const tdee = computeTDEE(bmr, activityMultiplier);

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

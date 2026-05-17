import type { Meal, Settings, Weight } from "@shared/schema";
import { ACTIVITY_MULTIPLIERS, type ActivityLevel } from "@shared/schema";

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysSince(dateStr: string): number {
  const start = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
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
    out.push(d.toISOString().slice(0, 10));
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

// ─── Weight Projection Engine ──────────────────────────────────────────────────

export type WeightProjectionPoint = {
  date: string;
  estimatedWeightKg: number;
};

export function weightProjectionSeries(
  settings: Settings,
  meals: Meal[],
  weights: Weight[] = [],
): { points: WeightProjectionPoint[]; projectedGoalDate: string | null } {
  const { heightCm, ageYears, sexAtBirth, goalWeightKg, startingWeightKg, journeyStartDate, dailyCalorieGoal } =
    settings;

  if (!heightCm || !ageYears || !sexAtBirth || !goalWeightKg || !startingWeightKg) {
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

  // Build actual weight map — used to anchor the projection at each logged date
  const actualWeightMap = new Map<string, number>();
  for (const w of weights) actualWeightMap.set(w.date, w.weightKg);

  // Average calorie intake over the most recent 7 logged dates globally
  const today = todayStr();
  const recent7LoggedDates = Array.from(calByDate.keys())
    .filter((d) => d <= today)
    .sort()
    .reverse()
    .slice(0, 7);
  const avgActual =
    recent7LoggedDates.length > 0
      ? recent7LoggedDates.reduce((sum, d) => sum + (calByDate.get(d) ?? 0), 0) / recent7LoggedDates.length
      : dailyCalorieGoal;
  const projectedDailyDeficit = tdee - avgActual;

  const isLosingWeight = goalWeightKg < startingWeightKg;
  const startDateObj = new Date(journeyStartDate + "T00:00:00");
  const todayDateObj = new Date(today + "T00:00:00");

  const points: WeightProjectionPoint[] = [];
  let currentWeight = startingWeightKg;
  let projectedGoalDate: string | null = null;

  for (let i = 0; i < 730; i++) {
    const d = new Date(startDateObj);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);

    if (i === 0) {
      // Anchor day-0 to actual weight if logged on journey start
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

    // Anchor to actual logged weight for this date — overrides calorie-derived estimate
    const loggedWeight = actualWeightMap.get(dateStr);
    if (loggedWeight !== undefined) currentWeight = loggedWeight;

    points.push({ date: dateStr, estimatedWeightKg: +currentWeight.toFixed(2) });

    if (!projectedGoalDate) {
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

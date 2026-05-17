import type { Meal, Settings, Weight } from "@shared/schema";

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
  if (!settings || weights.length === 0) return [] as { week: string; delta: number }[];
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
  const out: { week: string; delta: number }[] = [];
  for (const k of weekKeys) {
    const arr = groups.get(k)!;
    const last = arr[arr.length - 1];
    out.push({ week: `Week ${k + 1}`, delta: +(last - prev).toFixed(1) });
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

export function computeTDEE(bmr: number): number {
  return bmr * 1.2; // sedentary activity multiplier
}

// ─── Weight Projection Engine ──────────────────────────────────────────────────

export type WeightProjectionPoint = {
  date: string;
  estimatedWeightKg: number;
};

export function weightProjectionSeries(
  settings: Settings,
  meals: Meal[],
): { points: WeightProjectionPoint[]; projectedGoalDate: string | null } {
  const { heightCm, ageYears, sexAtBirth, goalWeightKg, startingWeightKg, journeyStartDate, dailyCalorieGoal } =
    settings;

  if (!heightCm || !ageYears || !sexAtBirth || !goalWeightKg || !startingWeightKg) {
    return { points: [], projectedGoalDate: null };
  }

  const bmr = computeBMR(startingWeightKg, heightCm, ageYears, sexAtBirth as "male" | "female");
  const tdee = computeTDEE(bmr);

  // Build per-day calorie map from actual meals
  const calByDate = new Map<string, number>();
  for (const meal of meals) {
    calByDate.set(meal.date, (calByDate.get(meal.date) || 0) + meal.calories);
  }

  // Average calorie intake over last 7 logged days (for future projection)
  const today = todayStr();
  const last7 = lastNDates(7);
  const last7Logged = last7.filter((d) => calByDate.has(d));
  const avgActual =
    last7Logged.length > 0
      ? last7Logged.reduce((sum, d) => sum + (calByDate.get(d) ?? 0), 0) / last7Logged.length
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

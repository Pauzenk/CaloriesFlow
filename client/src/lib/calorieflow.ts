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
  // group by week index relative to start
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

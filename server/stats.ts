import type {
  Activity,
  CalorieSeriesPoint,
  DashboardSummary,
  DaySummary,
  Meal,
  MealType,
  Settings,
  WeeklyWeightPoint,
  Weight,
} from "@shared/schema";

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysSince(dateStr: string): number {
  const start = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
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

export function summarizeDay(meals: Meal[], date: string): DaySummary {
  const byMealType: Record<MealType, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  let calories = 0;
  let proteins = 0;
  let carbs = 0;
  let fats = 0;
  for (const m of meals) {
    if (m.date !== date) continue;
    calories += m.calories;
    proteins += m.proteins;
    carbs += m.carbs;
    fats += m.fats;
    if (m.mealType in byMealType) byMealType[m.mealType as MealType] += m.calories;
  }
  return { date, calories, proteins, carbs, fats, byMealType };
}

export function calorieSeries(
  meals: Meal[],
  dates: string[],
  goal: number,
  acts: Activity[] = [],
): CalorieSeriesPoint[] {
  return dates.map((date) => {
    const eaten = meals.filter((m) => m.date === date).reduce((a, m) => a + m.calories, 0);
    const burned = acts.filter((a) => a.date === date).reduce((a, act) => a + act.caloriesBurned, 0);
    const d = new Date(date + "T00:00:00");
    return {
      date,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      shortLabel: d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
      calories: Math.max(0, eaten - burned),
      goal,
    };
  });
}

export function weeklyWeights(weights: Weight[], settings: Settings): WeeklyWeightPoint[] {
  if (weights.length === 0) return [];
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
  const out: WeeklyWeightPoint[] = [];
  for (const k of weekKeys) {
    const arr = groups.get(k)!;
    const last = arr[arr.length - 1];
    out.push({ week: `Week ${k + 1}`, delta: +(last - prev).toFixed(1), weightKg: last });
    prev = last;
  }
  return out;
}

export function buildDashboardSummary(
  meals: Meal[],
  weights: Weight[],
  settings: Settings,
  acts: Activity[] = [],
): DashboardSummary {
  const today = summarizeDay(meals, todayStr());
  const weekSeries = calorieSeries(meals, lastNDates(7), settings.dailyCalorieGoal, acts);
  const weeklyW = weeklyWeights(weights, settings);
  const totalWeightChange = +weeklyW.reduce((a, w) => a + w.delta, 0).toFixed(1);
  const todayDate = todayStr();
  const caloriesBurnedToday = acts
    .filter((a) => a.date === todayDate)
    .reduce((sum, a) => sum + a.caloriesBurned, 0);
  return {
    today,
    goal: settings.dailyCalorieGoal,
    journeyDay: daysSince(settings.journeyStartDate),
    weekSeries,
    weeklyWeights: weeklyW,
    totalWeightChange,
    caloriesBurnedToday,
  };
}

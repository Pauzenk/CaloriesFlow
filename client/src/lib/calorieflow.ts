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
  date: string;        // YYYY-MM-DD — used for tooltip / click-inspect
  dayIdx: number;      // days since journey start — numerical x-axis key
  planned: number;     // planned weight (full timeline)
  real?: number;       // calorie-deficit estimate, past only (daily granularity)
  isLogged?: boolean;  // true when an actual weight was logged on this exact date
  goal?: number;
};

export function threeLineWeightSeries(
  settings: Settings,
  meals: Meal[],
  activities: { date: string; caloriesBurned: number }[],
  weights: Weight[],
  goalMode?: string,
  _lang?: string,
): {
  points: ThreeLinePoint[];
  projectedGoalDate: string | null;
  currentRealKg: number | undefined;
  lastLoggedKg: number | undefined;
  todayDate: string;
  tickDates: string[];
} {
  const { heightCm, ageYears, sexAtBirth, goalWeightKg, startingWeightKg, journeyStartDate } =
    settings;
  const effectiveMode = goalMode ?? settings.goalMode ?? "weight_loss";
  const needsGoalWeight = effectiveMode !== "maintenance";
  const multiplier = ACTIVITY_MULTIPLIERS[(settings.activityLevel ?? "sedentary") as keyof typeof ACTIVITY_MULTIPLIERS] ?? 1.2;
  const today = localDateStr(new Date());
  const empty = { points: [], projectedGoalDate: null, currentRealKg: undefined, lastLoggedKg: undefined, todayDate: today, tickDates: [] };

  if (!heightCm || !ageYears || !sexAtBirth || !startingWeightKg) return empty;
  if (needsGoalWeight && !goalWeightKg) return empty;
  if (sexAtBirth !== "male" && sexAtBirth !== "female") return empty;

  const mealCal = new Map<string, number>();
  for (const m of meals) mealCal.set(m.date, (mealCal.get(m.date) ?? 0) + m.calories);

  const actCal = new Map<string, number>();
  for (const a of activities) actCal.set(a.date, (actCal.get(a.date) ?? 0) + a.caloriesBurned);

  // Sort weights chronologically; later same-day entries overwrite earlier ones
  const loggedWtMap = new Map<string, number>();
  const sortedWts = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of sortedWts) loggedWtMap.set(w.date, w.weightKg);

  const startMs = new Date(journeyStartDate + "T00:00:00").getTime();
  const todayMs = new Date(today + "T00:00:00").getTime();

  // Plan end date: derived from goalDurationMonths (the user-configured plan length)
  const goalDurationMonths = settings.goalDurationMonths ?? 12;
  const planEndDate = new Date(journeyStartDate + "T00:00:00");
  planEndDate.setMonth(planEndDate.getMonth() + goalDurationMonths);
  const planEndMs = planEndDate.getTime();
  const totalPlanDays = Math.max(1, Math.floor((planEndMs - startMs) / 86400000));
  const planEndDateStr = localDateStr(planEndDate);

  let realWeight = loggedWtMap.get(journeyStartDate) ?? startingWeightKg;
  let lastRealKg: number | undefined;
  let lastLoggedKg: number | undefined;

  const points: ThreeLinePoint[] = [];
  const tickDates: string[] = [];

  // Chart runs from journey start to plan end + 2-week buffer (capped at 2 years)
  const loopMax = Math.min(totalPlanDays + 14, 730);

  for (let i = 0; i <= loopMax; i++) {
    const dMs = startMs + i * 86400000;
    const dateStr = localDateStr(new Date(dMs));
    const isPast = dMs <= todayMs;
    const isWeeklyMilestone = i % 7 === 0;

    // PLANNED: straight diagonal — linear interpolation from start weight to goal weight
    // over the configured plan duration. Clamp at goalWeightKg once the plan ends.
    let plannedWeight: number;
    if (effectiveMode === "maintenance" || !goalWeightKg) {
      plannedWeight = startingWeightKg;
    } else {
      const t = Math.min(1, i / totalPlanDays);
      plannedWeight = startingWeightKg + (goalWeightKg - startingWeightKg) * t;
    }

    if (i > 0 && isPast) {
      // REAL ESTIMATE: calorie-deficit model from logged intake
      const eaten = mealCal.get(dateStr);
      const burned = actCal.get(dateStr) ?? 0;
      if (eaten !== undefined) {
        const maintReal = computeBMR(realWeight, heightCm, ageYears, sexAtBirth) * multiplier;
        const deficitReal = maintReal - (eaten - burned);
        realWeight -= deficitReal / 7700;
      }
      // RE-ANCHOR: snap to logged weight when available
      const logged = loggedWtMap.get(dateStr);
      if (logged !== undefined) {
        realWeight = logged;
        lastLoggedKg = logged;
      }
    }

    if (isPast) lastRealKg = +realWeight.toFixed(1);

    // Emit a data point:
    //   Past  → every day (daily resolution for WEIGHT line accuracy)
    //   Future → weekly milestones only (keeps point count manageable for PLAN line)
    if (isPast || isWeeklyMilestone) {
      points.push({
        date: dateStr,
        dayIdx: i,
        planned: +plannedWeight.toFixed(1),
        real: isPast ? +realWeight.toFixed(1) : undefined,
        isLogged: isPast && loggedWtMap.has(dateStr),
        goal: goalWeightKg ?? undefined,
      });
    }

    // Collect sparse tick labels: weekly boundaries
    if (isWeeklyMilestone) tickDates.push(dateStr);
  }

  return { points, projectedGoalDate: planEndDateStr, currentRealKg: lastRealKg, lastLoggedKg, todayDate: today, tickDates };
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

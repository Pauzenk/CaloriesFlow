/**
 * 60-day mock seed for zubareva.gbhg@gmail.com
 * Profile: male, 40 y/o, 178 cm, 95 kg → goal 76 kg (10-month plan)
 * BMI: 30.0 (obese) → 24.0 (normal range)
 * TDEE ~2250 kcal (sedentary), goal 1750 kcal/day (~500 deficit)
 */
import { db } from "./db";
import { users, settings, meals, activities, weights } from "../shared/schema";
import { eq, and, gte } from "drizzle-orm";

const TARGET_EMAIL = "zubareva.gbhg@gmail.com";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function rand(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

async function seed() {
  console.log(`\nCalorieFlow 60-day seed → targeting: ${TARGET_EMAIL}`);

  const [user] = await db.select().from(users).where(eq(users.email, TARGET_EMAIL));
  if (!user) {
    console.error(`ERROR: No user found with email "${TARGET_EMAIL}"`);
    process.exit(1);
  }
  const uid = user.id;
  console.log(`  user_id: ${uid}`);

  // ── 1. Upsert settings ─────────────────────────────────────────────────────
  const startKg = 95;
  const goalKg = 76;
  const calGoal = 1750;
  const journeyStart = daysAgo(59);

  await db
    .insert(settings)
    .values({
      userId: uid,
      dailyCalorieGoal: calGoal,
      startingWeightKg: startKg,
      currentWeightKg: startKg,
      goalWeightKg: goalKg,
      heightCm: 178,
      ageYears: 40,
      sexAtBirth: "male",
      activityLevel: "sedentary",
      journeyStartDate: journeyStart,
      goalDurationMonths: 10,
      goalMode: "weight_loss",
      workoutCountingMode: "include_in_activity_level",
    })
    .onConflictDoUpdate({
      target: settings.userId,
      set: {
        dailyCalorieGoal: calGoal,
        startingWeightKg: startKg,
        currentWeightKg: startKg,
        goalWeightKg: goalKg,
        heightCm: 178,
        ageYears: 40,
        sexAtBirth: "male",
        activityLevel: "sedentary",
        journeyStartDate: journeyStart,
        goalDurationMonths: 10,
        goalMode: "weight_loss",
        workoutCountingMode: "include_in_activity_level",
      },
    });
  console.log("  Parameters set: male, 40 y/o, 178 cm, 95 → 76 kg, 10-month plan, 1750 kcal/day");

  // ── 2. Clear 60-day window ─────────────────────────────────────────────────
  const windowStart = daysAgo(59);
  const deleted = await Promise.all([
    db.delete(meals).where(and(eq(meals.userId, uid), gte(meals.date, windowStart))).returning({ id: meals.id }),
    db.delete(activities).where(and(eq(activities.userId, uid), gte(activities.date, windowStart))).returning({ id: activities.id }),
    db.delete(weights).where(and(eq(weights.userId, uid), gte(weights.date, windowStart))).returning({ id: weights.id }),
  ]);
  console.log(`  Cleared: ${deleted[0].length} meals, ${deleted[1].length} activities, ${deleted[2].length} weights`);

  // ── 3. Meals — 60 days — higher-calorie male portions ─────────────────────
  const mealTemplates = {
    breakfast: [
      { name: "Oatmeal with banana and protein powder", p: 28, c: 55, f: 8 },
      { name: "Eggs Benedict on whole-grain toast", p: 24, c: 36, f: 16 },
      { name: "Scrambled eggs (3) with smoked salmon", p: 30, c: 12, f: 18 },
      { name: "Greek yogurt with granola and berries", p: 20, c: 48, f: 8 },
      { name: "Whole-grain pancakes with cottage cheese", p: 22, c: 52, f: 9 },
      { name: "High-protein smoothie (whey, oat, banana)", p: 35, c: 60, f: 7 },
      { name: "Avocado toast with 2 poached eggs", p: 22, c: 38, f: 20 },
    ],
    lunch: [
      { name: "Grilled chicken breast with brown rice and salad", p: 52, c: 65, f: 12 },
      { name: "Beef and vegetable stir-fry with noodles", p: 44, c: 70, f: 14 },
      { name: "Turkey and avocado wrap (large)", p: 40, c: 56, f: 18 },
      { name: "Tuna pasta salad with olive oil", p: 45, c: 68, f: 14 },
      { name: "Lentil and chicken soup with bread", p: 38, c: 72, f: 8 },
      { name: "Grilled salmon with quinoa and greens", p: 48, c: 58, f: 16 },
      { name: "Baked cod with sweet potato and broccoli", p: 42, c: 62, f: 10 },
    ],
    dinner: [
      { name: "Grilled steak (200 g) with roasted vegetables", p: 58, c: 32, f: 22 },
      { name: "Baked chicken thighs with potato and salad", p: 54, c: 55, f: 18 },
      { name: "Salmon fillet with asparagus and brown rice", p: 52, c: 48, f: 20 },
      { name: "Turkey meatballs with whole-grain pasta", p: 50, c: 65, f: 14 },
      { name: "Grilled pork tenderloin with roasted peppers", p: 55, c: 28, f: 16 },
      { name: "Chicken and vegetable curry with rice", p: 46, c: 70, f: 12 },
      { name: "Beef burger (no bun) with salad and sweet potato", p: 48, c: 42, f: 22 },
    ],
    snack: [
      { name: "Protein bar (20 g protein)", p: 20, c: 28, f: 8 },
      { name: "Mixed nuts and dried fruit (40 g)", p: 7, c: 18, f: 20 },
      { name: "Cottage cheese (200 g) with cucumber", p: 22, c: 8, f: 4 },
      { name: "Hard-boiled eggs (2)", p: 13, c: 1, f: 10 },
      { name: "Apple and peanut butter (2 tbsp)", p: 7, c: 30, f: 16 },
      { name: "Low-fat Greek yogurt with honey", p: 14, c: 22, f: 3 },
      { name: "Whole-grain crackers with hummus", p: 8, c: 28, f: 10 },
    ],
  };

  const macrosFor = (kcal: number, p: number, c: number, f: number) => {
    const base = p * 4 + c * 4 + f * 9;
    const s = base > 0 ? kcal / base : 1;
    return {
      proteins: Math.max(0, Math.round(p * s * 10) / 10),
      carbs: Math.max(0, Math.round(c * s * 10) / 10),
      fats: Math.max(0, Math.round(f * s * 10) / 10),
    };
  };

  const mealRows: typeof meals.$inferInsert[] = [];
  for (let i = 0; i < 60; i++) {
    const date = daysAgo(59 - i);
    const r = Math.random();
    let total: number;
    // Mix: ~75% on-plan, ~13% over, ~7% under, ~5% skip snack
    if (r < 0.07) total = rand(Math.round(calGoal * 0.70), Math.round(calGoal * 0.82));
    else if (r < 0.20) total = rand(Math.round(calGoal * 1.20), Math.round(calGoal * 1.45));
    else total = rand(Math.round(calGoal * 0.88), Math.round(calGoal * 1.10));

    const bf = mealTemplates.breakfast[i % mealTemplates.breakfast.length];
    const lu = mealTemplates.lunch[i % mealTemplates.lunch.length];
    const di = mealTemplates.dinner[i % mealTemplates.dinner.length];
    const sn = mealTemplates.snack[i % mealTemplates.snack.length];

    const bfKcal = Math.round(total * 0.20);
    const luKcal = Math.round(total * 0.33);
    const diKcal = Math.round(total * 0.37);
    const snKcal = total - bfKcal - luKcal - diKcal;

    mealRows.push({ userId: uid, date, mealType: "breakfast", name: bf.name, calories: bfKcal, ...macrosFor(bfKcal, bf.p, bf.c, bf.f) });
    mealRows.push({ userId: uid, date, mealType: "lunch",     name: lu.name, calories: luKcal, ...macrosFor(luKcal, lu.p, lu.c, lu.f) });
    mealRows.push({ userId: uid, date, mealType: "dinner",    name: di.name, calories: diKcal, ...macrosFor(diKcal, di.p, di.c, di.f) });
    if (snKcal > 60) {
      mealRows.push({ userId: uid, date, mealType: "snack", name: sn.name, calories: snKcal, ...macrosFor(snKcal, sn.p, sn.c, sn.f) });
    }
  }

  await db.insert(meals).values(mealRows);
  console.log(`  Inserted ${mealRows.length} meal entries`);

  // ── 4. Activities — ~2 per week (sedentary → gradually more active) ────────
  const workoutTemplates = [
    { name: "Brisk walk — 5 km",              durationMinutes: 55, caloriesBurned: 280, activityType: "cardio"   as const },
    { name: "Strength — upper body",           durationMinutes: 50, caloriesBurned: 310, activityType: "strength" as const },
    { name: "Treadmill walk/jog — 30 min",    durationMinutes: 30, caloriesBurned: 270, activityType: "cardio"   as const },
    { name: "Strength — lower body",           durationMinutes: 50, caloriesBurned: 330, activityType: "strength" as const },
    { name: "Cycling — stationary 30 min",    durationMinutes: 30, caloriesBurned: 300, activityType: "cardio"   as const },
    { name: "Full-body circuit training",      durationMinutes: 45, caloriesBurned: 380, activityType: "strength" as const },
    { name: "Swimming — 800 m",               durationMinutes: 35, caloriesBurned: 340, activityType: "cardio"   as const },
    { name: "Evening walk — 6 km",             durationMinutes: 65, caloriesBurned: 260, activityType: "cardio"   as const },
    { name: "Dumbbell workout — full body",    durationMinutes: 45, caloriesBurned: 360, activityType: "strength" as const },
    { name: "Rowing machine — 25 min",         durationMinutes: 25, caloriesBurned: 310, activityType: "cardio"   as const },
    { name: "Bodyweight circuit",              durationMinutes: 35, caloriesBurned: 290, activityType: "strength" as const },
    { name: "Outdoor jog — 4 km",             durationMinutes: 32, caloriesBurned: 350, activityType: "cardio"   as const },
    { name: "Strength — chest & back",        durationMinutes: 50, caloriesBurned: 320, activityType: "strength" as const },
    { name: "Power walk — 7 km",              durationMinutes: 75, caloriesBurned: 300, activityType: "cardio"   as const },
    { name: "Elliptical — 30 min",            durationMinutes: 30, caloriesBurned: 320, activityType: "cardio"   as const },
    { name: "Deadlifts & squats session",     durationMinutes: 55, caloriesBurned: 370, activityType: "strength" as const },
    { name: "Stair climbing — 20 min",        durationMinutes: 20, caloriesBurned: 260, activityType: "cardio"   as const },
    { name: "Core & mobility session",        durationMinutes: 30, caloriesBurned: 150, activityType: "other"    as const },
  ];

  // ~2 sessions/week over 60 days = ~17 sessions
  const workoutOffsets = [
    58, 55, 51, 48, 44, 41, 37, 34, 30, 27,
    23, 20, 16, 13, 9, 6, 2,
  ];

  const activityRows: typeof activities.$inferInsert[] = workoutOffsets.map((offset, idx) => ({
    userId: uid,
    date: daysAgo(offset),
    name: workoutTemplates[idx % workoutTemplates.length].name,
    durationMinutes: workoutTemplates[idx % workoutTemplates.length].durationMinutes,
    caloriesBurned: workoutTemplates[idx % workoutTemplates.length].caloriesBurned,
    activityType: workoutTemplates[idx % workoutTemplates.length].activityType,
  }));

  await db.insert(activities).values(activityRows);
  console.log(`  Inserted ${activityRows.length} activity entries`);

  // ── 5. Weight logs — ~weekly, 95 → ~90.6 kg over 60 days ─────────────────
  // ~0.5 kg/week realistic loss for a 500 kcal deficit
  const weightEntries = [
    { offset: 59, delta:  0.0  },
    { offset: 52, delta: -0.5  },
    { offset: 45, delta: -0.9  },
    { offset: 38, delta: -1.5  },
    { offset: 31, delta: -2.1  },
    { offset: 24, delta: -2.6  },
    { offset: 17, delta: -3.2  },
    { offset: 10, delta: -3.8  },
    { offset:  3, delta: -4.3  },
  ];

  const weightRows: typeof weights.$inferInsert[] = weightEntries.map(({ offset, delta }) => ({
    userId: uid,
    date: daysAgo(offset),
    weightKg: Math.round((startKg + delta) * 10) / 10,
  }));

  await db.insert(weights).values(weightRows);
  console.log(`  Inserted ${weightRows.length} weight entries`);

  const finalKg = startKg + weightEntries[weightEntries.length - 1].delta;
  console.log(`\n  ✓ Seed complete for ${TARGET_EMAIL}`);
  console.log(`  Profile:     male, 40 y/o, 178 cm`);
  console.log(`  BMI start:   ${(startKg / (1.78 * 1.78)).toFixed(1)} (obese) → goal BMI ${(goalKg / (1.78 * 1.78)).toFixed(1)} (normal)`);
  console.log(`  Plan:        ${startKg} kg → ${goalKg} kg over 10 months, 1750 kcal/day`);
  console.log(`  Progress:    ${startKg} → ${finalKg} kg in 60 days (~${(startKg - finalKg).toFixed(1)} kg lost)`);
  console.log(`  Meals:       ${mealRows.length} entries`);
  console.log(`  Activities:  ${activityRows.length} workouts`);
  console.log(`  Weights:     ${weightRows.length} entries\n`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

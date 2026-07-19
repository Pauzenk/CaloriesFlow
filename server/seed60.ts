/**
 * 60-day mock seed for zubareva.gbhg@gmail.com
 * - Sets realistic parameters (height, age, sex, goal weight, activity level)
 * - Inserts 60 days of meals, ~2-3 workouts/week, weekly weight logs
 * - Idempotent: clears the 60-day window before inserting
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

  // ── 1. Upsert realistic settings/parameters ────────────────────────────────
  const startKg = 68;
  const goalKg = 60;
  const calGoal = 1400;
  const journeyStart = daysAgo(59);

  await db
    .insert(settings)
    .values({
      userId: uid,
      dailyCalorieGoal: calGoal,
      startingWeightKg: startKg,
      currentWeightKg: startKg,
      goalWeightKg: goalKg,
      heightCm: 166,
      ageYears: 29,
      sexAtBirth: "female",
      activityLevel: "light",
      journeyStartDate: journeyStart,
      goalDurationMonths: 5,
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
        heightCm: 166,
        ageYears: 29,
        sexAtBirth: "female",
        activityLevel: "light",
        journeyStartDate: journeyStart,
        goalDurationMonths: 5,
        goalMode: "weight_loss",
        workoutCountingMode: "include_in_activity_level",
      },
    });
  console.log("  Settings upserted");

  // ── 2. Clear 60-day window ─────────────────────────────────────────────────
  const windowStart = daysAgo(59);
  const deleted = await Promise.all([
    db.delete(meals).where(and(eq(meals.userId, uid), gte(meals.date, windowStart))).returning({ id: meals.id }),
    db.delete(activities).where(and(eq(activities.userId, uid), gte(activities.date, windowStart))).returning({ id: activities.id }),
    db.delete(weights).where(and(eq(weights.userId, uid), gte(weights.date, windowStart))).returning({ id: weights.id }),
  ]);
  console.log(`  Cleared: ${deleted[0].length} meals, ${deleted[1].length} activities, ${deleted[2].length} weights`);

  // ── 3. Meals — 60 days ─────────────────────────────────────────────────────
  const mealTemplates = {
    breakfast: [
      { name: "Oatmeal with berries and honey", p: 8, c: 40, f: 5 },
      { name: "Greek yogurt parfait with granola", p: 12, c: 35, f: 6 },
      { name: "Scrambled eggs on whole-grain toast", p: 15, c: 28, f: 10 },
      { name: "Banana smoothie with spinach", p: 7, c: 42, f: 4 },
      { name: "Avocado toast with poached egg", p: 13, c: 30, f: 14 },
      { name: "Cottage cheese with fruit", p: 14, c: 20, f: 4 },
      { name: "Whole-grain cereal with milk", p: 8, c: 45, f: 3 },
    ],
    lunch: [
      { name: "Grilled chicken salad with olive oil dressing", p: 35, c: 18, f: 12 },
      { name: "Lentil soup with whole-grain bread", p: 18, c: 45, f: 5 },
      { name: "Tuna wrap with hummus and veggies", p: 28, c: 40, f: 10 },
      { name: "Brown rice bowl with roasted vegetables", p: 10, c: 55, f: 7 },
      { name: "Greek salad with feta and pita", p: 14, c: 38, f: 16 },
      { name: "Turkey and avocado sandwich", p: 30, c: 42, f: 14 },
      { name: "Quinoa salad with chickpeas", p: 16, c: 48, f: 8 },
    ],
    dinner: [
      { name: "Baked salmon with broccoli and quinoa", p: 38, c: 30, f: 14 },
      { name: "Grilled turkey breast with sweet potato", p: 42, c: 35, f: 8 },
      { name: "Stir-fried tofu with bok choy and rice", p: 20, c: 45, f: 10 },
      { name: "Chicken stew with vegetables", p: 30, c: 25, f: 6 },
      { name: "Baked cod with asparagus and lentils", p: 36, c: 28, f: 9 },
      { name: "Vegetable curry with brown rice", p: 14, c: 52, f: 8 },
      { name: "Grilled chicken with roasted peppers", p: 40, c: 22, f: 10 },
    ],
    snack: [
      { name: "Apple with almond butter", p: 3, c: 20, f: 7 },
      { name: "Mixed nuts (30 g)", p: 5, c: 8, f: 15 },
      { name: "Greek yogurt (150 g)", p: 10, c: 8, f: 3 },
      { name: "Dark chocolate + herbal tea", p: 2, c: 14, f: 6 },
      { name: "Rice cake with cottage cheese", p: 8, c: 15, f: 2 },
      { name: "Banana", p: 1, c: 27, f: 0 },
      { name: "Handful of walnuts", p: 4, c: 4, f: 18 },
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
    if (r < 0.06) total = rand(Math.round(calGoal * 0.72), Math.round(calGoal * 0.82));
    else if (r < 0.18) total = rand(Math.round(calGoal * 1.25), Math.round(calGoal * 1.55));
    else total = rand(Math.round(calGoal * 0.88), Math.round(calGoal * 1.10));

    const bf = mealTemplates.breakfast[i % mealTemplates.breakfast.length];
    const lu = mealTemplates.lunch[i % mealTemplates.lunch.length];
    const di = mealTemplates.dinner[i % mealTemplates.dinner.length];
    const sn = mealTemplates.snack[i % mealTemplates.snack.length];

    const bfKcal = Math.round(total * 0.22);
    const luKcal = Math.round(total * 0.32);
    const diKcal = Math.round(total * 0.35);
    const snKcal = total - bfKcal - luKcal - diKcal;

    mealRows.push({ userId: uid, date, mealType: "breakfast", name: bf.name, calories: bfKcal, ...macrosFor(bfKcal, bf.p, bf.c, bf.f) });
    mealRows.push({ userId: uid, date, mealType: "lunch",     name: lu.name, calories: luKcal, ...macrosFor(luKcal, lu.p, lu.c, lu.f) });
    mealRows.push({ userId: uid, date, mealType: "dinner",    name: di.name, calories: diKcal, ...macrosFor(diKcal, di.p, di.c, di.f) });
    if (snKcal > 50) {
      mealRows.push({ userId: uid, date, mealType: "snack", name: sn.name, calories: snKcal, ...macrosFor(snKcal, sn.p, sn.c, sn.f) });
    }
  }

  await db.insert(meals).values(mealRows);
  console.log(`  Inserted ${mealRows.length} meal entries`);

  // ── 4. Activities — ~2-3 per week across 60 days ───────────────────────────
  const workoutTemplates = [
    { name: "Morning run — 5 km",           durationMinutes: 35, caloriesBurned: 300, activityType: "cardio"   as const },
    { name: "Strength — upper body",         durationMinutes: 50, caloriesBurned: 260, activityType: "strength" as const },
    { name: "Cycling — outdoor 12 km",       durationMinutes: 45, caloriesBurned: 340, activityType: "cardio"   as const },
    { name: "Yoga & stretching",             durationMinutes: 40, caloriesBurned: 120, activityType: "other"    as const },
    { name: "HIIT circuit (20 min)",          durationMinutes: 20, caloriesBurned: 230, activityType: "cardio"   as const },
    { name: "Strength — legs & glutes",      durationMinutes: 55, caloriesBurned: 290, activityType: "strength" as const },
    { name: "Swimming — 1 km",               durationMinutes: 30, caloriesBurned: 270, activityType: "cardio"   as const },
    { name: "Pilates class",                 durationMinutes: 50, caloriesBurned: 190, activityType: "other"    as const },
    { name: "Evening walk — 7 km",           durationMinutes: 65, caloriesBurned: 220, activityType: "cardio"   as const },
    { name: "Jump rope + core",              durationMinutes: 25, caloriesBurned: 200, activityType: "cardio"   as const },
    { name: "Full-body kettlebell circuit",  durationMinutes: 40, caloriesBurned: 330, activityType: "strength" as const },
    { name: "Dance cardio class",            durationMinutes: 45, caloriesBurned: 310, activityType: "cardio"   as const },
    { name: "Rowing machine — 20 min",       durationMinutes: 20, caloriesBurned: 240, activityType: "cardio"   as const },
    { name: "Morning jog — 4 km",            durationMinutes: 28, caloriesBurned: 250, activityType: "cardio"   as const },
    { name: "Barre class",                   durationMinutes: 55, caloriesBurned: 210, activityType: "other"    as const },
    { name: "Strength — full body",          durationMinutes: 50, caloriesBurned: 280, activityType: "strength" as const },
    { name: "Spin class — 45 min",           durationMinutes: 45, caloriesBurned: 380, activityType: "cardio"   as const },
    { name: "Stretch & foam roll",           durationMinutes: 30, caloriesBurned: 80,  activityType: "other"    as const },
    { name: "Trail walk — 6 km",             durationMinutes: 75, caloriesBurned: 230, activityType: "cardio"   as const },
    { name: "Core & abs circuit",            durationMinutes: 25, caloriesBurned: 150, activityType: "strength" as const },
    { name: "Outdoor run — 6 km",            durationMinutes: 40, caloriesBurned: 350, activityType: "cardio"   as const },
    { name: "Boxing class",                  durationMinutes: 45, caloriesBurned: 360, activityType: "cardio"   as const },
    { name: "Yoga flow — 60 min",            durationMinutes: 60, caloriesBurned: 160, activityType: "other"    as const },
    { name: "Deadlifts & squats",            durationMinutes: 50, caloriesBurned: 300, activityType: "strength" as const },
    { name: "Power walk — 5 km",             durationMinutes: 55, caloriesBurned: 200, activityType: "cardio"   as const },
    { name: "Cycling — 10 km",               durationMinutes: 35, caloriesBurned: 280, activityType: "cardio"   as const },
  ];

  // ~2-3 workouts per week = ~17-20 over 60 days
  const workoutOffsets = [
    59, 57, 54, 52, 50, 47, 45, 43, 40, 38,
    36, 33, 31, 28, 26, 24, 21, 19, 17, 14,
    12, 10, 7, 5, 3, 1,
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

  // ── 5. Weight logs — weekly, realistic downward trend 68 → ~65.2 kg ────────
  const weightEntries = [
    { offset: 59, delta: 0.0 },
    { offset: 52, delta: -0.4 },
    { offset: 45, delta: -0.8 },
    { offset: 38, delta: -1.2 },
    { offset: 31, delta: -1.6 },
    { offset: 24, delta: -2.0 },
    { offset: 17, delta: -2.3 },
    { offset: 10, delta: -2.6 },
    { offset: 3,  delta: -2.8 },
  ];

  const weightRows: typeof weights.$inferInsert[] = weightEntries.map(({ offset, delta }) => ({
    userId: uid,
    date: daysAgo(offset),
    weightKg: Math.round((startKg + delta) * 10) / 10,
  }));

  await db.insert(weights).values(weightRows);
  console.log(`  Inserted ${weightRows.length} weight entries`);

  console.log(`\n  ✓ 60-day seed complete for ${TARGET_EMAIL}`);
  console.log(`  Date range:  ${daysAgo(59)} → ${daysAgo(0)}`);
  console.log(`  Parameters:  29 y/o female, 166 cm, ${startKg} kg → goal ${goalKg} kg, 5-month plan`);
  console.log(`  Meals:       ${mealRows.length} entries`);
  console.log(`  Activities:  ${activityRows.length} workouts`);
  console.log(`  Weights:     ${weightRows.length} entries (${startKg} → ${startKg + weightEntries[weightEntries.length - 1].delta} kg)\n`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

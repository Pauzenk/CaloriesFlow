/**
 * Seed script — 30 days of realistic test data for CalorieFlow
 * Run: npx tsx server/seed.ts
 *
 * Idempotent: clears previously seeded data for the seed user first.
 * The seed user email is SEED_EMAIL below.
 */
import { db } from "./db";
import { users, settings, meals, activities, weights } from "../shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const SEED_EMAIL = "seed@calorieflow.test";
const SEED_PASSWORD = "seed1234";

// ── helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function rand(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("CalorieFlow seed — start");

  // 1. Upsert seed user
  let user = (await db.select().from(users).where(eq(users.email, SEED_EMAIL)))[0];
  if (!user) {
    const hash = await hashPassword(SEED_PASSWORD);
    const [created] = await db
      .insert(users)
      .values({ email: SEED_EMAIL, password: hash, name: "Seed User" })
      .returning();
    user = created;
    console.log(`  Created user: ${SEED_EMAIL}`);
  } else {
    console.log(`  Using existing user: ${SEED_EMAIL}`);
  }
  const uid = user.id;

  // 2. Clear previously seeded data (meals/activities/weights added by this script)
  //    We clear ALL data for the seed user — safe because it's a dedicated test account.
  const journeyStart = daysAgo(30);
  await db.delete(meals).where(and(eq(meals.userId, uid), gte(meals.date, journeyStart)));
  await db.delete(activities).where(and(eq(activities.userId, uid), gte(activities.date, journeyStart)));
  await db.delete(weights).where(and(eq(weights.userId, uid), gte(weights.date, journeyStart)));
  console.log("  Cleared previous seed data");

  // 3. Upsert settings — female, 165 cm, 28 y, 58→52 kg, 1 200 kcal/day, 3-month plan
  await db
    .insert(settings)
    .values({
      userId: uid,
      dailyCalorieGoal: 1200,
      startingWeightKg: 58,
      currentWeightKg: 58,
      journeyStartDate: journeyStart,
      heightCm: 165,
      ageYears: 28,
      sexAtBirth: "female",
      goalWeightKg: 52,
      activityLevel: "light",
      goalDurationMonths: 3,
      goalMode: "weight_loss",
      workoutCountingMode: "track_separately",
    })
    .onConflictDoUpdate({
      target: settings.userId,
      set: {
        dailyCalorieGoal: 1200,
        startingWeightKg: 58,
        currentWeightKg: 58,
        journeyStartDate: journeyStart,
        heightCm: 165,
        ageYears: 28,
        sexAtBirth: "female",
        goalWeightKg: 52,
        activityLevel: "light",
        goalDurationMonths: 3,
        goalMode: "weight_loss",
        workoutCountingMode: "track_separately",
      },
    });
  console.log("  Upserted settings");

  // ── 4. Meals — 30 days ─────────────────────────────────────────────────────

  // Day targets (kcal) — varies: mostly 1 100–1 400, 3–4 over-target (1 600–1 900), 2 under (~900)
  const dailyTargets: number[] = [];
  for (let i = 0; i < 30; i++) {
    const r = Math.random();
    if (r < 0.07) dailyTargets.push(rand(850, 950));      // 2 under days
    else if (r < 0.20) dailyTargets.push(rand(1600, 1900)); // ~4 over days
    else dailyTargets.push(rand(1100, 1400));               // normal
  }

  const mealTemplates = [
    // breakfast
    { mealType: "breakfast" as const, name: "Oatmeal with berries", kcalShare: 0.22, p: 8, c: 40, f: 5 },
    { mealType: "breakfast" as const, name: "Yogurt parfait with granola", kcalShare: 0.22, p: 12, c: 35, f: 6 },
    { mealType: "breakfast" as const, name: "Eggs and whole-grain toast", kcalShare: 0.22, p: 15, c: 28, f: 10 },
    { mealType: "breakfast" as const, name: "Smoothie bowl with banana and spinach", kcalShare: 0.20, p: 7, c: 42, f: 4 },
    { mealType: "breakfast" as const, name: "Блины с творогом и мёдом", kcalShare: 0.25, p: 14, c: 50, f: 8 },
    // lunch
    { mealType: "lunch" as const, name: "Grilled chicken salad with olive oil dressing", kcalShare: 0.32, p: 35, c: 18, f: 12 },
    { mealType: "lunch" as const, name: "Lentil soup with whole-grain bread", kcalShare: 0.30, p: 18, c: 45, f: 5 },
    { mealType: "lunch" as const, name: "Паста с песто и черри-томатами (большая порция)", kcalShare: 0.34, p: 14, c: 60, f: 18 },
    { mealType: "lunch" as const, name: "Tuna wrap with hummus and veggies", kcalShare: 0.30, p: 28, c: 40, f: 10 },
    { mealType: "lunch" as const, name: "Brown rice bowl with roasted vegetables", kcalShare: 0.31, p: 10, c: 55, f: 7 },
    // dinner
    { mealType: "dinner" as const, name: "Baked salmon with broccoli and quinoa", kcalShare: 0.35, p: 38, c: 30, f: 14 },
    { mealType: "dinner" as const, name: "Grilled turkey breast with sweet potato mash", kcalShare: 0.35, p: 42, c: 35, f: 8 },
    { mealType: "dinner" as const, name: "Stir-fried tofu with bok choy and brown rice", kcalShare: 0.32, p: 20, c: 45, f: 10 },
    { mealType: "dinner" as const, name: "Куриный суп с гречкой — домашний рецепт", kcalShare: 0.33, p: 30, c: 25, f: 6 },
    { mealType: "dinner" as const, name: "Beef stir-fry with bell peppers and noodles", kcalShare: 0.38, p: 36, c: 50, f: 15 },
    // snacks
    { mealType: "snack" as const, name: "Apple with almond butter", kcalShare: 0.10, p: 3, c: 20, f: 7 },
    { mealType: "snack" as const, name: "Мороженое (шарик ванильного)", kcalShare: 0.14, p: 3, c: 22, f: 9 },
    { mealType: "snack" as const, name: "Mixed nuts (30 g)", kcalShare: 0.14, p: 5, c: 8, f: 15 },
    { mealType: "snack" as const, name: "Greek yogurt (150 g)", kcalShare: 0.10, p: 10, c: 8, f: 3 },
    { mealType: "snack" as const, name: "Dark chocolate square + coffee", kcalShare: 0.12, p: 2, c: 14, f: 6 },
  ];

  const breakfastOptions = mealTemplates.filter(m => m.mealType === "breakfast");
  const lunchOptions = mealTemplates.filter(m => m.mealType === "lunch");
  const dinnerOptions = mealTemplates.filter(m => m.mealType === "dinner");
  const snackOptions = mealTemplates.filter(m => m.mealType === "snack");

  const mealRows: typeof meals.$inferInsert[] = [];

  for (let i = 0; i < 30; i++) {
    const date = daysAgo(29 - i); // day 0 = 29 days ago, day 29 = today
    const total = dailyTargets[i];

    const bf = breakfastOptions[i % breakfastOptions.length];
    const lu = lunchOptions[i % lunchOptions.length];
    const di = dinnerOptions[i % dinnerOptions.length];

    const bfKcal = Math.round(total * bf.kcalShare);
    const luKcal = Math.round(total * lu.kcalShare);
    const diKcal = Math.round(total * di.kcalShare);
    const snKcal = total - bfKcal - luKcal - diKcal;

    const addMeal = (t: typeof meals.$inferInsert["mealType"], name: string, kcal: number, pShare: number, cShare: number, fShare: number) => {
      const baseTotal = pShare * 4 + cShare * 4 + fShare * 9;
      const scale = baseTotal > 0 ? kcal / baseTotal : 1;
      mealRows.push({
        userId: uid,
        date,
        mealType: t,
        name,
        calories: Math.max(0, kcal),
        proteins: Math.max(0, Math.round(pShare * scale * 10) / 10),
        carbs: Math.max(0, Math.round(cShare * scale * 10) / 10),
        fats: Math.max(0, Math.round(fShare * scale * 10) / 10),
      });
    };

    addMeal("breakfast", bf.name, bfKcal, bf.p, bf.c, bf.f);
    addMeal("lunch", lu.name, luKcal, lu.p, lu.c, lu.f);
    addMeal("dinner", di.name, diKcal, di.p, di.c, di.f);

    if (snKcal > 50) {
      const sn = snackOptions[i % snackOptions.length];
      addMeal("snack", sn.name, snKcal, sn.p, sn.c, sn.f);
    }
  }

  await db.insert(meals).values(mealRows);
  console.log(`  Inserted ${mealRows.length} meal entries`);

  // ── 5. Activities — ~2–3 per week ─────────────────────────────────────────

  const workoutDays = [1, 3, 6, 8, 10, 13, 15, 17, 20, 22, 24, 27, 29]; // offsets from 29 days ago
  const workoutTemplates = [
    { name: "Morning run — 5 km", durationMinutes: 35, caloriesBurned: 320, activityType: "cardio" as const },
    { name: "Strength training — upper body", durationMinutes: 50, caloriesBurned: 280, activityType: "strength" as const },
    { name: "Cycling — outdoor 12 km", durationMinutes: 45, caloriesBurned: 360, activityType: "cardio" as const },
    { name: "Yoga & stretching", durationMinutes: 40, caloriesBurned: 130, activityType: "other" as const },
    { name: "HIIT circuit (20 min)", durationMinutes: 20, caloriesBurned: 250, activityType: "cardio" as const },
    { name: "Strength — legs & glutes", durationMinutes: 55, caloriesBurned: 310, activityType: "strength" as const },
    { name: "Swimming — 1 km", durationMinutes: 30, caloriesBurned: 290, activityType: "cardio" as const },
    { name: "Pilates class", durationMinutes: 50, caloriesBurned: 200, activityType: "other" as const },
    { name: "Evening walk — 8 km", durationMinutes: 70, caloriesBurned: 240, activityType: "cardio" as const },
    { name: "Jump rope + core", durationMinutes: 25, caloriesBurned: 220, activityType: "cardio" as const },
    { name: "Full-body kettlebell", durationMinutes: 40, caloriesBurned: 350, activityType: "strength" as const },
    { name: "Dance cardio class", durationMinutes: 45, caloriesBurned: 330, activityType: "cardio" as const },
    { name: "Rowing machine — 20 min", durationMinutes: 20, caloriesBurned: 260, activityType: "cardio" as const },
  ];

  const activityRows: typeof activities.$inferInsert[] = workoutDays.map((offset, idx) => {
    const wt = workoutTemplates[idx % workoutTemplates.length];
    return {
      userId: uid,
      date: daysAgo(29 - offset),
      name: wt.name,
      durationMinutes: wt.durationMinutes,
      caloriesBurned: wt.caloriesBurned,
      activityType: wt.activityType,
    };
  });

  await db.insert(activities).values(activityRows);
  console.log(`  Inserted ${activityRows.length} activity entries`);

  // ── 6. Logged weights — 6 entries, realistic downward trend with noise ────

  const weightEntries = [
    { offset: 29, kg: 58.0 },  // day 1 (journey start)
    { offset: 24, kg: 57.5 },  // day 6
    { offset: 18, kg: 57.2 },  // day 12
    { offset: 12, kg: 56.8 },  // day 18
    { offset:  6, kg: 56.4 },  // day 24
    { offset:  0, kg: 56.1 },  // today
  ];

  const weightRows: typeof weights.$inferInsert[] = weightEntries.map(({ offset, kg }) => ({
    userId: uid,
    date: daysAgo(offset),
    weightKg: kg,
  }));

  await db.insert(weights).values(weightRows);
  console.log(`  Inserted ${weightRows.length} weight entries`);

  // Update currentWeightKg in settings to the most recent logged weight
  await db
    .update(settings)
    .set({ currentWeightKg: 56.1 })
    .where(eq(settings.userId, uid));

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n  ✓ Seed complete");
  console.log(`  User:        ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  console.log(`  Date range:  ${journeyStart} → ${daysAgo(0)} (30 days)`);
  console.log(`  Meals:       ${mealRows.length} entries (${dailyTargets.filter(t => t >= 1600).length} over-target days, ${dailyTargets.filter(t => t < 1000).length} under days)`);
  console.log(`  Activities:  ${activityRows.length} workouts`);
  console.log(`  Weights:     ${weightRows.length} logged entries`);
  console.log(`  Plan:        58 kg → 52 kg in 3 months, 1 200 kcal/day`);
  console.log(`  Settings:    165 cm / 28 y / female / light activity`);
  console.log("\n  Log in at /auth with the credentials above to explore.\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

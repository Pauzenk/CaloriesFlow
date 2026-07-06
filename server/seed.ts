/**
 * CalorieFlow seed script — 30 days of realistic test data
 *
 * Usage:
 *   npx tsx server/seed.ts <email>
 *
 * If no email is given, existing users are listed and the script exits.
 * Idempotent: clears and re-inserts seeded data for the target user each run.
 * Settings are NOT touched — the user's own profile is preserved.
 */
import { db } from "./db";
import { users, settings, meals, activities, weights } from "../shared/schema";
import { eq, and, gte } from "drizzle-orm";

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
  const targetEmail = process.argv[2]?.trim();

  // If no email provided, list users and exit
  if (!targetEmail) {
    const allUsers = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).orderBy(users.email);
    console.log("\n  No email specified. Existing users:\n");
    for (const u of allUsers) {
      console.log(`    ${u.email}  (id: ${u.id})`);
    }
    console.log("\n  Run:  npx tsx server/seed.ts <email>\n");
    process.exit(0);
  }

  console.log(`\nCalorieFlow seed → targeting: ${targetEmail}`);

  // 1. Resolve user
  const [user] = await db.select().from(users).where(eq(users.email, targetEmail));
  if (!user) {
    console.error(`  ERROR: No user found with email "${targetEmail}"`);
    console.error(`  Run without arguments to see the user list.\n`);
    process.exit(1);
  }
  const uid = user.id;
  console.log(`  Resolved user_id: ${uid}`);

  // 2. Load existing settings (we don't overwrite them)
  const [userSettings] = await db.select().from(settings).where(eq(settings.userId, uid));
  const startKg = userSettings?.startingWeightKg ?? 70;
  console.log(`  Settings: start_weight=${startKg} kg  journey_start=${userSettings?.journeyStartDate ?? "(none)"}`);

  // 3. Clear previously seeded data in the 30-day window
  const windowStart = daysAgo(30);
  const deleted = await Promise.all([
    db.delete(meals).where(and(eq(meals.userId, uid), gte(meals.date, windowStart))).returning({ id: meals.id }),
    db.delete(activities).where(and(eq(activities.userId, uid), gte(activities.date, windowStart))).returning({ id: activities.id }),
    db.delete(weights).where(and(eq(weights.userId, uid), gte(weights.date, windowStart))).returning({ id: weights.id }),
  ]);
  console.log(`  Cleared: ${deleted[0].length} meals, ${deleted[1].length} activities, ${deleted[2].length} weights from last 30 days`);

  // ── 4. Meals — 30 days ─────────────────────────────────────────────────────

  // Daily kcal targets — mix of on-plan, over-target, under-target days
  const calGoal = userSettings?.dailyCalorieGoal ?? 1400;
  const dailyTargets: number[] = [];
  for (let i = 0; i < 30; i++) {
    const r = Math.random();
    if (r < 0.07) dailyTargets.push(rand(Math.round(calGoal * 0.70), Math.round(calGoal * 0.80)));  // ~2 under days
    else if (r < 0.20) dailyTargets.push(rand(Math.round(calGoal * 1.25), Math.round(calGoal * 1.55))); // ~4 over days
    else dailyTargets.push(rand(Math.round(calGoal * 0.88), Math.round(calGoal * 1.10)));  // normal
  }

  const mealTemplates = {
    breakfast: [
      { name: "Oatmeal with berries and honey", p: 8, c: 40, f: 5 },
      { name: "Yogurt parfait with granola", p: 12, c: 35, f: 6 },
      { name: "Scrambled eggs on whole-grain toast", p: 15, c: 28, f: 10 },
      { name: "Banana smoothie with spinach", p: 7, c: 42, f: 4 },
      { name: "Avocado toast with poached egg", p: 13, c: 30, f: 14 },
    ],
    lunch: [
      { name: "Grilled chicken salad with olive oil", p: 35, c: 18, f: 12 },
      { name: "Lentil soup with whole-grain bread", p: 18, c: 45, f: 5 },
      { name: "Tuna wrap with hummus and veggies", p: 28, c: 40, f: 10 },
      { name: "Brown rice bowl with roasted vegetables", p: 10, c: 55, f: 7 },
      { name: "Greek salad with feta and pita", p: 14, c: 38, f: 16 },
    ],
    dinner: [
      { name: "Baked salmon with broccoli and quinoa", p: 38, c: 30, f: 14 },
      { name: "Grilled turkey breast with sweet potato", p: 42, c: 35, f: 8 },
      { name: "Stir-fried tofu with bok choy and rice", p: 20, c: 45, f: 10 },
      { name: "Chicken stew with vegetables", p: 30, c: 25, f: 6 },
      { name: "Beef and bell pepper noodle stir-fry", p: 36, c: 50, f: 15 },
    ],
    snack: [
      { name: "Apple with almond butter", p: 3, c: 20, f: 7 },
      { name: "Mixed nuts (30 g)", p: 5, c: 8, f: 15 },
      { name: "Greek yogurt (150 g)", p: 10, c: 8, f: 3 },
      { name: "Dark chocolate square + coffee", p: 2, c: 14, f: 6 },
      { name: "Rice cake with cottage cheese", p: 8, c: 15, f: 2 },
    ],
  };

  const mealRows: typeof meals.$inferInsert[] = [];

  for (let i = 0; i < 30; i++) {
    const date = daysAgo(29 - i); // day 0 = 29 days ago, day 29 = today
    const total = dailyTargets[i];

    // Pick templates rotating through the list
    const bf = mealTemplates.breakfast[i % mealTemplates.breakfast.length];
    const lu = mealTemplates.lunch[i % mealTemplates.lunch.length];
    const di = mealTemplates.dinner[i % mealTemplates.dinner.length];
    const sn = mealTemplates.snack[i % mealTemplates.snack.length];

    const bfKcal = Math.round(total * 0.22);
    const luKcal = Math.round(total * 0.32);
    const diKcal = Math.round(total * 0.35);
    const snKcal = total - bfKcal - luKcal - diKcal;

    const macrosFor = (kcal: number, p: number, c: number, f: number) => {
      const base = p * 4 + c * 4 + f * 9;
      const s = base > 0 ? kcal / base : 1;
      return { proteins: Math.max(0, Math.round(p * s * 10) / 10), carbs: Math.max(0, Math.round(c * s * 10) / 10), fats: Math.max(0, Math.round(f * s * 10) / 10) };
    };

    mealRows.push({ userId: uid, date, mealType: "breakfast", name: bf.name, calories: bfKcal, ...macrosFor(bfKcal, bf.p, bf.c, bf.f) });
    mealRows.push({ userId: uid, date, mealType: "lunch",     name: lu.name, calories: luKcal, ...macrosFor(luKcal, lu.p, lu.c, lu.f) });
    mealRows.push({ userId: uid, date, mealType: "dinner",    name: di.name, calories: diKcal, ...macrosFor(diKcal, di.p, di.c, di.f) });
    if (snKcal > 50) {
      mealRows.push({ userId: uid, date, mealType: "snack", name: sn.name, calories: snKcal, ...macrosFor(snKcal, sn.p, sn.c, sn.f) });
    }
  }

  await db.insert(meals).values(mealRows);
  console.log(`  Inserted ${mealRows.length} meal entries`);

  // ── 5. Activities — ~2–3 per week ─────────────────────────────────────────

  // Workout days: day-offsets from today (spread across 30 days)
  const workoutOffsets = [29, 27, 24, 22, 20, 17, 15, 13, 10, 8, 5, 3, 1];
  const workoutTemplates = [
    { name: "Morning run — 5 km",          durationMinutes: 35, caloriesBurned: 320, activityType: "cardio"   as const },
    { name: "Strength — upper body",        durationMinutes: 50, caloriesBurned: 280, activityType: "strength" as const },
    { name: "Cycling — outdoor 12 km",      durationMinutes: 45, caloriesBurned: 360, activityType: "cardio"   as const },
    { name: "Yoga & stretching",            durationMinutes: 40, caloriesBurned: 130, activityType: "other"    as const },
    { name: "HIIT circuit (20 min)",         durationMinutes: 20, caloriesBurned: 250, activityType: "cardio"   as const },
    { name: "Strength — legs & glutes",     durationMinutes: 55, caloriesBurned: 310, activityType: "strength" as const },
    { name: "Swimming — 1 km",              durationMinutes: 30, caloriesBurned: 290, activityType: "cardio"   as const },
    { name: "Pilates class",                durationMinutes: 50, caloriesBurned: 200, activityType: "other"    as const },
    { name: "Evening walk — 8 km",          durationMinutes: 70, caloriesBurned: 240, activityType: "cardio"   as const },
    { name: "Jump rope + core",             durationMinutes: 25, caloriesBurned: 220, activityType: "cardio"   as const },
    { name: "Full-body kettlebell circuit", durationMinutes: 40, caloriesBurned: 350, activityType: "strength" as const },
    { name: "Dance cardio class",           durationMinutes: 45, caloriesBurned: 330, activityType: "cardio"   as const },
    { name: "Rowing machine — 20 min",      durationMinutes: 20, caloriesBurned: 260, activityType: "cardio"   as const },
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

  // ── 6. Weight logs — 6 entries, realistic downward trend ─────────────────

  // Compute a realistic weight progression from startKg
  // Loss rate ~0.5 kg per 5 days
  const weightEntries = [
    { offset: 29, delta: 0.0 },
    { offset: 24, delta: -0.4 },
    { offset: 18, delta: -0.7 },
    { offset: 12, delta: -1.1 },
    { offset:  6, delta: -1.4 },
    { offset:  0, delta: -1.7 },
  ];

  const weightRows: typeof weights.$inferInsert[] = weightEntries.map(({ offset, delta }) => ({
    userId: uid,
    date: daysAgo(offset),
    weightKg: Math.round((startKg + delta) * 10) / 10,
  }));

  await db.insert(weights).values(weightRows);
  console.log(`  Inserted ${weightRows.length} weight entries`);

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n  ✓ Seed complete for ${targetEmail} (${uid})`);
  console.log(`  Date range:  ${daysAgo(29)} → ${daysAgo(0)} (30 days)`);
  console.log(`  Meals:       ${mealRows.length} entries`);
  console.log(`  Activities:  ${activityRows.length} workouts`);
  console.log(`  Weights:     ${weightRows.length} entries (${startKg} → ${startKg - 1.7} kg)\n`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

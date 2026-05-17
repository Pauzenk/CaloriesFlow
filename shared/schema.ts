import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, date, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull().default(""),
});

export const insertUserSchema = createInsertSchema(users)
  .pick({ email: true, password: true, name: true })
  .extend({
    email: z.string().email().max(200),
    password: z.string().min(6).max(100),
    name: z.string().min(1).max(80),
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type User = typeof users.$inferSelect;

const nullableNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v)),
    z.number().min(min).max(max).nullable().optional(),
  );

export const ACTIVITY_LEVELS = ["sedentary", "lightly_active", "moderately_active", "very_active"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
};

export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (×1.2)",
  lightly_active: "Lightly active (×1.375)",
  moderately_active: "Moderately active (×1.55)",
  very_active: "Very active (×1.725)",
};

export const settings = pgTable("settings", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  dailyCalorieGoal: integer("daily_calorie_goal").notNull().default(2000),
  startingWeightKg: real("starting_weight_kg").notNull().default(0),
  currentWeightKg: real("current_weight_kg").notNull().default(0),
  journeyStartDate: date("journey_start_date").notNull().default(sql`CURRENT_DATE`),
  heightCm: integer("height_cm"),
  ageYears: integer("age_years"),
  sexAtBirth: text("sex_at_birth"),
  goalWeightKg: real("goal_weight_kg"),
  activityLevel: text("activity_level").notNull().default("sedentary"),
  goalDurationMonths: integer("goal_duration_months"),
});

export const upsertSettingsSchema = createInsertSchema(settings)
  .omit({ userId: true })
  .extend({
    dailyCalorieGoal: z.coerce.number().int().min(500).max(10000),
    startingWeightKg: z.coerce.number().min(0).max(500),
    currentWeightKg: z.coerce.number().min(0).max(500),
    journeyStartDate: z.string().min(1),
    heightCm: nullableNumber(50, 300),
    ageYears: nullableNumber(5, 120),
    sexAtBirth: z.enum(["male", "female"]).nullable().optional(),
    goalWeightKg: nullableNumber(20, 500),
    activityLevel: z.enum(ACTIVITY_LEVELS).default("sedentary"),
    goalDurationMonths: z
      .preprocess(
        (v) => (v === null || v === undefined || v === "" ? null : Number(v)),
        z.number().int().min(1).max(24).nullable().optional(),
      ),
  });

export type Settings = typeof settings.$inferSelect;
export type UpsertSettings = z.infer<typeof upsertSettingsSchema>;

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const meals = pgTable("meals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  mealType: text("meal_type").notNull(),
  name: text("name").notNull(),
  calories: integer("calories").notNull(),
  proteins: real("proteins").notNull().default(0),
  carbs: real("carbs").notNull().default(0),
  fats: real("fats").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMealSchema = createInsertSchema(meals)
  .omit({ id: true, userId: true, createdAt: true })
  .extend({
    date: z.string().min(1),
    mealType: z.enum(MEAL_TYPES),
    name: z.string().min(1).max(120),
    calories: z.coerce.number().int().min(0).max(20000),
    proteins: z.coerce.number().min(0).max(2000),
    carbs: z.coerce.number().min(0).max(2000),
    fats: z.coerce.number().min(0).max(2000),
  });

export type Meal = typeof meals.$inferSelect;
export type InsertMeal = z.infer<typeof insertMealSchema>;

export const weights = pgTable("weights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  weightKg: real("weight_kg").notNull(),
});

export const insertWeightSchema = createInsertSchema(weights)
  .omit({ id: true, userId: true })
  .extend({
    date: z.string().min(1),
    weightKg: z.coerce.number().min(20).max(500),
  });

export type Weight = typeof weights.$inferSelect;
export type InsertWeight = z.infer<typeof insertWeightSchema>;

export const ACTIVITY_TYPES = ["cardio", "strength", "other"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  caloriesBurned: integer("calories_burned").notNull().default(0),
  activityType: text("activity_type").notNull().default("other"),
});

export const insertActivitySchema = createInsertSchema(activities)
  .omit({ id: true, userId: true })
  .extend({
    date: z.string().min(1),
    name: z.string().min(1).max(120),
    durationMinutes: z.coerce.number().int().min(0).max(1440),
    caloriesBurned: z.coerce.number().int().min(0).max(10000),
    activityType: z.enum(ACTIVITY_TYPES).default("other"),
  });

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;

export type AuthUser = { id: string; email: string; name: string };

export type DaySummary = {
  date: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  byMealType: Record<MealType, number>;
};

export type CalorieSeriesPoint = {
  date: string;
  label: string;
  shortLabel: string;
  calories: number;
  goal: number;
};

export type WeeklyWeightPoint = {
  week: string;
  delta: number;
  weightKg: number;
};

export type DashboardSummary = {
  today: DaySummary;
  goal: number;
  journeyDay: number;
  weekSeries: CalorieSeriesPoint[];
  weeklyWeights: WeeklyWeightPoint[];
  totalWeightChange: number;
  caloriesBurnedToday: number;
};

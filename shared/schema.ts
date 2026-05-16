import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, date, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull().default(""),
});

export const insertUserSchema = createInsertSchema(users)
  .pick({ username: true, password: true, name: true })
  .extend({
    username: z.string().min(3).max(50),
    password: z.string().min(6).max(100),
    name: z.string().min(1).max(80),
  });

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const settings = pgTable("settings", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  dailyCalorieGoal: integer("daily_calorie_goal").notNull().default(2000),
  startingWeightKg: real("starting_weight_kg").notNull().default(0),
  currentWeightKg: real("current_weight_kg").notNull().default(0),
  journeyStartDate: date("journey_start_date").notNull().default(sql`CURRENT_DATE`),
});

export const upsertSettingsSchema = createInsertSchema(settings)
  .omit({ userId: true })
  .extend({
    dailyCalorieGoal: z.coerce.number().int().min(500).max(10000),
    startingWeightKg: z.coerce.number().min(0).max(500),
    currentWeightKg: z.coerce.number().min(0).max(500),
    journeyStartDate: z.string().min(1),
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

import {
  users,
  settings,
  meals,
  weights,
  activities,
  type User,
  type InsertUser,
  type Settings,
  type UpsertSettings,
  type Meal,
  type InsertMeal,
  type Weight,
  type InsertWeight,
  type Activity,
  type InsertActivity,
} from "@shared/schema";
import { db } from "./db";
import { and, eq, gte, lte, desc, asc } from "drizzle-orm";

export type MealHistoryItem = {
  name: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createGoogleUser(data: { email: string; name: string; googleId: string }): Promise<User>;
  linkGoogleAccount(userId: string, googleId: string): Promise<void>;

  getSettings(userId: string): Promise<Settings>;
  upsertSettings(userId: string, data: UpsertSettings): Promise<Settings>;

  listMeals(userId: string, fromDate?: string, toDate?: string): Promise<Meal[]>;
  createMeal(userId: string, data: InsertMeal): Promise<Meal>;
  updateMeal(userId: string, id: string, data: InsertMeal): Promise<Meal | undefined>;
  deleteMeal(userId: string, id: string): Promise<boolean>;
  getMealHistory(userId: string, q: string): Promise<MealHistoryItem[]>;

  listWeights(userId: string): Promise<Weight[]>;
  createWeight(userId: string, data: InsertWeight): Promise<Weight>;

  listActivities(userId: string, fromDate?: string, toDate?: string): Promise<Activity[]>;
  createActivity(userId: string, data: InsertActivity): Promise<Activity>;
  updateActivity(userId: string, id: string, data: InsertActivity): Promise<Activity | undefined>;
  deleteActivity(userId: string, id: string): Promise<boolean>;

  resetUserData(userId: string): Promise<void>;
}

const DEFAULT_SETTINGS = {
  dailyCalorieGoal: 2000,
  startingWeightKg: 0,
  currentWeightKg: 0,
};

export class DbStorage implements IStorage {
  async getUser(id: string) {
    const rows = await db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async getUserByEmail(email: string) {
    const rows = await db.select().from(users).where(eq(users.email, email));
    return rows[0];
  }

  async createUser(user: InsertUser) {
    const [created] = await db.insert(users).values({ ...user, password: user.password ?? null }).returning();
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(settings).values({ userId: created.id, ...DEFAULT_SETTINGS, journeyStartDate: today });
    return created;
  }

  async getUserByGoogleId(googleId: string) {
    const rows = await db.select().from(users).where(eq(users.googleId, googleId));
    return rows[0];
  }

  async createGoogleUser(data: { email: string; name: string; googleId: string }) {
    const [created] = await db.insert(users).values({ email: data.email, name: data.name, googleId: data.googleId, password: null }).returning();
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(settings).values({ userId: created.id, ...DEFAULT_SETTINGS, journeyStartDate: today });
    return created;
  }

  async linkGoogleAccount(userId: string, googleId: string) {
    await db.update(users).set({ googleId }).where(eq(users.id, userId));
  }

  async getSettings(userId: string): Promise<Settings> {
    const rows = await db.select().from(settings).where(eq(settings.userId, userId));
    if (rows[0]) return rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const [created] = await db
      .insert(settings)
      .values({ userId, ...DEFAULT_SETTINGS, journeyStartDate: today })
      .returning();
    return created;
  }

  async upsertSettings(userId: string, data: UpsertSettings): Promise<Settings> {
    await this.getSettings(userId);
    const [updated] = await db
      .update(settings)
      .set(data)
      .where(eq(settings.userId, userId))
      .returning();
    return updated;
  }

  async listMeals(userId: string, fromDate?: string, toDate?: string) {
    const conds = [eq(meals.userId, userId)];
    if (fromDate) conds.push(gte(meals.date, fromDate));
    if (toDate) conds.push(lte(meals.date, toDate));
    return db.select().from(meals).where(and(...conds)).orderBy(desc(meals.date), desc(meals.createdAt));
  }

  async createMeal(userId: string, data: InsertMeal) {
    const [created] = await db.insert(meals).values({ ...data, userId }).returning();
    return created;
  }

  async updateMeal(userId: string, id: string, data: InsertMeal) {
    const [updated] = await db
      .update(meals)
      .set(data)
      .where(and(eq(meals.id, id), eq(meals.userId, userId)))
      .returning();
    return updated;
  }

  async deleteMeal(userId: string, id: string) {
    const result = await db
      .delete(meals)
      .where(and(eq(meals.id, id), eq(meals.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getMealHistory(userId: string, q: string): Promise<MealHistoryItem[]> {
    const allMeals = await db
      .select()
      .from(meals)
      .where(eq(meals.userId, userId))
      .orderBy(desc(meals.date), desc(meals.createdAt));

    const seen = new Set<string>();
    const results: MealHistoryItem[] = [];
    const query = q.toLowerCase();

    for (const meal of allMeals) {
      const nameLower = meal.name.toLowerCase();
      if (!nameLower.includes(query)) continue;
      if (seen.has(nameLower)) continue;
      seen.add(nameLower);
      results.push({
        name: meal.name,
        calories: meal.calories,
        proteins: meal.proteins,
        carbs: meal.carbs,
        fats: meal.fats,
      });
      if (results.length >= 8) break;
    }
    return results;
  }

  async listWeights(userId: string) {
    return db.select().from(weights).where(eq(weights.userId, userId)).orderBy(asc(weights.date));
  }

  async createWeight(userId: string, data: InsertWeight) {
    const [created] = await db.insert(weights).values({ ...data, userId }).returning();
    await db.update(settings).set({ currentWeightKg: data.weightKg }).where(eq(settings.userId, userId));
    return created;
  }

  async listActivities(userId: string, fromDate?: string, toDate?: string) {
    const conds = [eq(activities.userId, userId)];
    if (fromDate) conds.push(gte(activities.date, fromDate));
    if (toDate) conds.push(lte(activities.date, toDate));
    return db.select().from(activities).where(and(...conds)).orderBy(desc(activities.date));
  }

  async createActivity(userId: string, data: InsertActivity) {
    const [created] = await db.insert(activities).values({ ...data, userId }).returning();
    return created;
  }

  async updateActivity(userId: string, id: string, data: InsertActivity) {
    const [updated] = await db
      .update(activities)
      .set(data)
      .where(and(eq(activities.id, id), eq(activities.userId, userId)))
      .returning();
    return updated;
  }

  async deleteActivity(userId: string, id: string) {
    const result = await db
      .delete(activities)
      .where(and(eq(activities.id, id), eq(activities.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async resetUserData(userId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all([
      db.delete(meals).where(eq(meals.userId, userId)),
      db.delete(weights).where(eq(weights.userId, userId)),
      db.delete(activities).where(eq(activities.userId, userId)),
    ]);
    await db
      .update(settings)
      .set({
        dailyCalorieGoal: DEFAULT_SETTINGS.dailyCalorieGoal,
        startingWeightKg: DEFAULT_SETTINGS.startingWeightKg,
        currentWeightKg: DEFAULT_SETTINGS.currentWeightKg,
        goalWeightKg: null,
        heightCm: null,
        ageYears: null,
        sexAtBirth: null,
        activityLevel: "sedentary",
        goalMode: "weight_loss",
        goalDurationMonths: null,
        journeyStartDate: today,
      })
      .where(eq(settings.userId, userId));
  }
}

export const storage: IStorage = new DbStorage();

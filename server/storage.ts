import {
  users,
  settings,
  meals,
  weights,
  type User,
  type InsertUser,
  type Settings,
  type UpsertSettings,
  type Meal,
  type InsertMeal,
  type Weight,
  type InsertWeight,
} from "@shared/schema";
import { db } from "./db";
import { and, eq, gte, lte, desc, asc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getSettings(userId: string): Promise<Settings>;
  upsertSettings(userId: string, data: UpsertSettings): Promise<Settings>;

  listMeals(userId: string, fromDate?: string, toDate?: string): Promise<Meal[]>;
  createMeal(userId: string, data: InsertMeal): Promise<Meal>;
  deleteMeal(userId: string, id: string): Promise<boolean>;

  listWeights(userId: string): Promise<Weight[]>;
  createWeight(userId: string, data: InsertWeight): Promise<Weight>;
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

  async getUserByUsername(username: string) {
    const rows = await db.select().from(users).where(eq(users.username, username));
    return rows[0];
  }

  async createUser(user: InsertUser) {
    const [created] = await db.insert(users).values(user).returning();
    // Create default settings
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(settings).values({
      userId: created.id,
      ...DEFAULT_SETTINGS,
      journeyStartDate: today,
    });
    return created;
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

  async deleteMeal(userId: string, id: string) {
    const result = await db
      .delete(meals)
      .where(and(eq(meals.id, id), eq(meals.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async listWeights(userId: string) {
    return db.select().from(weights).where(eq(weights.userId, userId)).orderBy(asc(weights.date));
  }

  async createWeight(userId: string, data: InsertWeight) {
    const [created] = await db.insert(weights).values({ ...data, userId }).returning();
    // also update current weight in settings
    await db.update(settings).set({ currentWeightKg: data.weightKg }).where(eq(settings.userId, userId));
    return created;
  }
}

export const storage: IStorage = new DbStorage();

import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import {
  insertMealSchema,
  insertWeightSchema,
  upsertSettingsSchema,
} from "@shared/schema";
import { buildDashboardSummary, calorieSeries, lastNDates } from "./stats";
import { searchFoods } from "@shared/foods";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  setupAuth(app);

  app.get("/api/settings", requireAuth, async (req, res, next) => {
    try {
      const s = await storage.getSettings(req.user!.id);
      res.json(s);
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/settings", requireAuth, async (req, res, next) => {
    const parsed = upsertSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    try {
      const s = await storage.upsertSettings(req.user!.id, parsed.data);
      res.json(s);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/foods", requireAuth, async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      res.json(searchFoods(q, 12));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/meals", requireAuth, async (req, res, next) => {
    try {
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      const list = await storage.listMeals(req.user!.id, from, to);
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/meals", requireAuth, async (req, res, next) => {
    const parsed = insertMealSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    try {
      const meal = await storage.createMeal(req.user!.id, parsed.data);
      res.status(201).json(meal);
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/meals/:id", requireAuth, async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const ok = await storage.deleteMeal(req.user!.id, id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/weights", requireAuth, async (req, res, next) => {
    try {
      const list = await storage.listWeights(req.user!.id);
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/weights", requireAuth, async (req, res, next) => {
    const parsed = insertWeightSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    try {
      const w = await storage.createWeight(req.user!.id, parsed.data);
      res.status(201).json(w);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/stats/dashboard", requireAuth, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const [settings, meals, weights] = await Promise.all([
        storage.getSettings(userId),
        storage.listMeals(userId),
        storage.listWeights(userId),
      ]);
      res.json(buildDashboardSummary(meals, weights, settings));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/stats/calories", requireAuth, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const periodRaw = typeof req.query.period === "string" ? req.query.period : "week";
      const period = periodRaw === "day" || periodRaw === "month" ? periodRaw : "week";
      const n = period === "day" ? 1 : period === "week" ? 7 : 30;
      const [settings, meals] = await Promise.all([
        storage.getSettings(userId),
        storage.listMeals(userId),
      ]);
      res.json(calorieSeries(meals, lastNDates(n), settings.dailyCalorieGoal));
    } catch (err) {
      next(err);
    }
  });

  return httpServer;
}

import type { Express } from "express";
import { type Server } from "http";
import multer from "multer";
import OpenAI, { type ClientOptions } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";
import { z } from "zod";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import {
  insertMealSchema,
  insertWeightSchema,
  insertActivitySchema,
  upsertSettingsSchema,
} from "@shared/schema";
import { buildDashboardSummary, calorieSeries, lastNDates } from "./stats";
import { searchFoods } from "@shared/foods";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WebP, or GIF images are accepted"));
  },
});

const photoAnalysisSchema = z.object({
  name: z.string().min(1).max(120),
  calories: z.number().int().min(0).max(20000),
  proteins: z.number().min(0).max(2000),
  carbs: z.number().min(0).max(2000),
  fats: z.number().min(0).max(2000),
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  setupAuth(app);

  app.get("/api/ai/status", requireAuth, (_req, res) => {
    res.json({ hasApiKey: !!process.env.OPENAI_API_KEY });
  });

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

  app.get("/api/meals/history", requireAuth, async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length < 2) return res.json([]);
      const history = await storage.getMealHistory(req.user!.id, q);
      res.json(history);
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

  app.patch("/api/meals/:id", requireAuth, async (req, res, next) => {
    const parsed = insertMealSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    try {
      const id = String(req.params.id);
      const meal = await storage.updateMeal(req.user!.id, id, parsed.data);
      if (!meal) return res.status(404).json({ message: "Not found" });
      res.json(meal);
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

  // ── Activities ──────────────────────────────────────────────────────────────
  app.get("/api/activities", requireAuth, async (req, res, next) => {
    try {
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      const list = await storage.listActivities(req.user!.id, from, to);
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/activities", requireAuth, async (req, res, next) => {
    const parsed = insertActivitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    try {
      const act = await storage.createActivity(req.user!.id, parsed.data);
      res.status(201).json(act);
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/activities/:id", requireAuth, async (req, res, next) => {
    const parsed = insertActivitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    try {
      const id = String(req.params.id);
      const act = await storage.updateActivity(req.user!.id, id, parsed.data);
      if (!act) return res.status(404).json({ message: "Not found" });
      res.json(act);
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/activities/:id", requireAuth, async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const ok = await storage.deleteActivity(req.user!.id, id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/stats/dashboard", requireAuth, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const [settings, meals, weights, acts] = await Promise.all([
        storage.getSettings(userId),
        storage.listMeals(userId),
        storage.listWeights(userId),
        storage.listActivities(userId),
      ]);
      res.json(buildDashboardSummary(meals, weights, settings, acts));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/meals/analyze-photo", requireAuth, (req, res, next) => {
    upload.single("photo")(req, res, async (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "Image must be smaller than 10 MB" });
      }
      if (err) {
        return res.status(400).json({ message: err.message || "Invalid file" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ message: "AI photo analysis is not configured (missing API key)" });
      }

      try {
        const openai = new OpenAI({ apiKey });
        const base64 = req.file.buffer.toString("base64");
        const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze this food photo and estimate the nutritional content of the entire meal shown. Return ONLY a valid JSON object with these exact keys: "name" (string, brief descriptive meal name), "calories" (integer, total kcal), "proteins" (number, grams), "carbs" (number, grams), "fats" (number, grams). If the image does not show food, return {"error": "No food detected"}. No explanation, just the JSON.`,
                },
                {
                  type: "image_url",
                  image_url: { url: dataUrl, detail: "low" },
                },
              ],
            },
          ],
        });

        const raw = completion.choices[0]?.message?.content?.trim() ?? "";
        let parsed: unknown;
        try {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        } catch {
          return res.status(422).json({ message: "AI returned an unreadable response. Please try again." });
        }

        if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
          return res.status(422).json({ message: "No food detected in the image. Please try a clearer photo." });
        }

        const validated = photoAnalysisSchema.safeParse(parsed);
        if (!validated.success) {
          return res.status(422).json({ message: "AI returned incomplete nutritional data. Please try again." });
        }

        res.json(validated.data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Analysis failed";
        next(new Error(message));
      }
    });
  });

  app.post("/api/meals/chat", requireAuth, (req, res, next) => {
    upload.single("photo")(req, res, async (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "Image must be smaller than 10 MB" });
      }
      if (err) return res.status(400).json({ message: err.message || "Invalid file" });

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ message: "AI chat is not configured (missing API key)" });
      }

      const historyItemSchema = z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
        imageDataUrl: z
          .string()
          .max(8_000_000)
          .regex(/^data:image\/(jpeg|png|webp|gif);base64,/)
          .optional(),
      });

      let history: z.infer<typeof historyItemSchema>[] = [];
      try {
        const rawJson = typeof req.body.messages === "string" ? req.body.messages : "[]";
        const parsedJson: unknown = JSON.parse(rawJson);
        const validated = z.array(historyItemSchema).max(20).safeParse(parsedJson);
        if (validated.success) history = validated.data;
      } catch {
        history = [];
      }

      const userText: string =
        typeof req.body.message === "string" ? req.body.message.slice(0, 1000) : "";

      let contextNote = "";
      try {
        const rawCtx = typeof req.body.context === "string" ? req.body.context : null;
        if (rawCtx) {
          const ctx = JSON.parse(rawCtx) as Record<string, unknown>;
          const goal = typeof ctx.calorieGoal === "number" ? ctx.calorieGoal : null;
          const logged = typeof ctx.caloriesLogged === "number" ? ctx.caloriesLogged : null;
          const rem = typeof ctx.remainingCalories === "number" ? ctx.remainingCalories : null;
          if (goal !== null && logged !== null && rem !== null) {
            contextNote = `\n\nUSER'S DAY CONTEXT: Daily calorie goal = ${goal} kcal | Already logged = ${logged} kcal | Remaining = ${rem} kcal.`;
          }
        }
      } catch { /* ignore */ }

      try {
        const openai = new OpenAI({ apiKey } as ClientOptions);

        const systemMessage: ChatCompletionMessageParam = {
          role: "system",
          content: `You are a nutrition and fitness assistant inside a calorie-tracking app.${contextNote}

You handle four types of input:

TYPE A — FOOD/MEAL: The user describes something they ate or a food photo.
TYPE B — PHYSICAL ACTIVITY: The user describes exercise, sport, or physical activity.
TYPE C — BOTH: The user mentions both food and activity.
TYPE D — RECIPE IDEAS / MEAL PLAN: The user asks for recipe suggestions, meal ideas, or a full-day meal plan.

━━━ FOOD ESTIMATION RULES ━━━
1. Identify every ingredient and its realistic portion size in grams.
2. Apply standard nutrition values (USDA): protein = 4 kcal/g, carbs = 4 kcal/g, fat = 9 kcal/g.
3. Sum contributions; sanity-check the total.
CALIBRATION REFERENCES:
- Medium apple (182 g): 95 kcal | P 0.5 g | C 25 g | F 0.3 g
- Grilled chicken breast (150 g): 248 kcal | P 46 g | C 0 g | F 5 g
- Oatmeal, dry (80 g) cooked with water: 300 kcal | P 11 g | C 54 g | F 5 g
- Classic cheeseburger with bun (330 g): 620 kcal | P 34 g | C 42 g | F 33 g
- Green salad + vinaigrette (250 g): 180 kcal | P 4 g | C 12 g | F 13 g
- Avocado toast (1 slice sourdough + ½ avocado): 290 kcal | P 7 g | C 30 g | F 16 g

━━━ ACTIVITY ESTIMATION RULES ━━━
Use standard MET values to estimate calories burned. Assume 75 kg bodyweight if unknown.
Formula: calories = MET × 75 kg × (durationMinutes / 60)
Common MET values: walking (3.5), light cycling (6), running/jogging (8), HIIT/cardio (10), strength training (5), swimming (7), yoga (2.5).
- activityType must be one of: "cardio", "strength", "other"

━━━ RECIPE / MEAL PLAN RULES (TYPE D) ━━━
When the user asks for meal ideas or a full-day plan:
- Use the USER'S DAY CONTEXT (remaining calories) to size portions appropriately.
- For a full-day plan: distribute remaining calories across meals not yet logged (breakfast ~25%, lunch ~35%, dinner ~30%, snack ~10% of daily goal).
- For a single meal request: suggest one complete recipe that fits within the appropriate fraction of remaining calories.
- Suggest realistic, balanced meals with varied ingredients.
- Return multiple estimates using the "estimates" array format below. Include "mealType" in each estimate.

━━━ RESPONSE RULES ━━━
- Write 1–3 sentences of context or reasoning first.
- NEVER output 300 kcal as a default without reasoning.
- If you need clarification, ask one focused question and omit JSON entirely.
- Numbers: calories = integer, proteins/carbs/fats = 1 decimal place, caloriesBurned = integer.

━━━ RESPONSE FORMAT ━━━
End your reply with exactly ONE JSON block (no text after it). Include only the keys that apply:

For single food:
\`\`\`json
{"estimate":{"name":"<meal name>","calories":<int>,"proteins":<num>,"carbs":<num>,"fats":<num>}}
\`\`\`

For activity only:
\`\`\`json
{"activityEstimate":{"name":"<activity name>","durationMinutes":<int>,"caloriesBurned":<int>,"activityType":"cardio|strength|other"}}
\`\`\`

For both food and activity:
\`\`\`json
{"estimate":{"name":"<meal name>","calories":<int>,"proteins":<num>,"carbs":<num>,"fats":<num>},"activityEstimate":{"name":"<activity name>","durationMinutes":<int>,"caloriesBurned":<int>,"activityType":"cardio|strength|other"}}
\`\`\`

For multiple recipe suggestions (TYPE D):
\`\`\`json
{"estimates":[{"name":"<meal name>","calories":<int>,"proteins":<num>,"carbs":<num>,"fats":<num>,"mealType":"breakfast|lunch|dinner|snack"},{"name":"...","calories":<int>,"proteins":<num>,"carbs":<num>,"fats":<num>,"mealType":"..."}]}
\`\`\``,
        };

        const historyMessages: ChatCompletionMessageParam[] = history.map((m) => {
          if (m.role === "assistant") {
            return { role: "assistant", content: m.content };
          }
          if (m.imageDataUrl) {
            const parts: ChatCompletionContentPart[] = [];
            if (m.content) parts.push({ type: "text", text: m.content });
            parts.push({ type: "image_url", image_url: { url: m.imageDataUrl, detail: "low" } });
            return { role: "user", content: parts };
          }
          return { role: "user", content: m.content };
        });

        let userContent: string | ChatCompletionContentPart[];
        if (req.file) {
          const base64 = req.file.buffer.toString("base64");
          const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
          const parts: ChatCompletionContentPart[] = [];
          parts.push({ type: "text", text: userText || "Please analyze this food photo." });
          parts.push({ type: "image_url", image_url: { url: dataUrl, detail: "low" } });
          userContent = parts;
        } else {
          userContent = userText || "What can you tell me?";
        }

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 500,
          messages: [systemMessage, ...historyMessages, { role: "user", content: userContent }],
        });

        const rawReply = completion.choices[0]?.message?.content?.trim() ?? "";

        const activityEstimateSchema = z.object({
          name: z.string().min(1).max(120),
          durationMinutes: z.number().int().min(0).max(1440),
          caloriesBurned: z.number().int().min(0).max(10000),
          activityType: z.enum(["cardio", "strength", "other"]).default("other"),
        });

        const recipeEstimateSchema = photoAnalysisSchema.extend({
          mealType: z.string().optional(),
        });

        const jsonBlockMatch = rawReply.match(/```json\s*(\{[\s\S]*?\})\s*```\s*$/);
        let estimate: z.infer<typeof photoAnalysisSchema> | undefined;
        let estimates: z.infer<typeof recipeEstimateSchema>[] | undefined;
        let activityEstimate: z.infer<typeof activityEstimateSchema> | undefined;
        let reply = rawReply;

        if (jsonBlockMatch) {
          try {
            const parsed: unknown = JSON.parse(jsonBlockMatch[1]);
            if (typeof parsed === "object" && parsed !== null) {
              const p = parsed as Record<string, unknown>;
              if ("estimate" in p && typeof p.estimate === "object" && p.estimate !== null) {
                const v = photoAnalysisSchema.safeParse(p.estimate);
                if (v.success) estimate = v.data;
              }
              if ("estimates" in p && Array.isArray(p.estimates)) {
                const arr: z.infer<typeof recipeEstimateSchema>[] = [];
                for (const item of p.estimates) {
                  const v = recipeEstimateSchema.safeParse(item);
                  if (v.success) arr.push(v.data);
                }
                if (arr.length > 0) estimates = arr;
              }
              if ("activityEstimate" in p && typeof p.activityEstimate === "object" && p.activityEstimate !== null) {
                const v = activityEstimateSchema.safeParse(p.activityEstimate);
                if (v.success) activityEstimate = v.data;
              }
            }
          } catch {
            // leave estimates undefined
          }
          reply = rawReply.slice(0, rawReply.lastIndexOf("```json")).trim();
        }

        res.json({ reply: reply || "Here is the estimate.", estimate, estimates, activityEstimate });
      } catch (err: unknown) {
        next(new Error(err instanceof Error ? err.message : "AI chat failed"));
      }
    });
  });

  // ── Dedicated recipe plan generation ──────────────────────────────────────
  app.post("/api/recipes/generate", requireAuth, async (req, res, next) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ message: "AI not configured" });

    const bodySchema = z.object({
      calorieGoal: z.number().int().min(500).max(10000),
      regenerateMeal: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
      currentPlan: z.array(z.object({
        mealType: z.string(),
        name: z.string(),
        calories: z.number(),
        proteins: z.number(),
        carbs: z.number(),
        fats: z.number(),
        ingredients: z.array(z.string()),
        instructions: z.array(z.string()),
      })).optional(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid request" });

    const { calorieGoal, regenerateMeal, currentPlan } = parsed.data;
    const bk = Math.round(calorieGoal * 0.25);
    const ln = Math.round(calorieGoal * 0.35);
    const dn = Math.round(calorieGoal * 0.30);
    const sn = Math.round(calorieGoal * 0.10);

    let prompt: string;

    if (regenerateMeal && currentPlan && currentPlan.length > 0) {
      const targets: Record<string, number> = { breakfast: bk, lunch: ln, dinner: dn, snack: sn };
      const targetCal = targets[regenerateMeal] ?? bk;
      prompt = `I have this daily meal plan (JSON):
${JSON.stringify(currentPlan, null, 2)}

Regenerate ONLY the "${regenerateMeal}" entry. Replace it with a completely different recipe around ${targetCal} kcal. Keep all other meals exactly as-is (same name, calories, ingredients, instructions).

Return the complete updated plan as a JSON object with this structure:
{"meals":[{"mealType":"breakfast|lunch|dinner|snack","name":"...","calories":int,"proteins":float,"carbs":float,"fats":float,"ingredients":["quantity ingredient",...],"instructions":["Step 1: ...",...]},...]}`; 
    } else {
      prompt = `Generate a balanced daily meal plan with exactly 4 meals: breakfast, lunch, dinner, snack.
Total target: ${calorieGoal} kcal. Distribution: breakfast ~${bk} kcal, lunch ~${ln} kcal, dinner ~${dn} kcal, snack ~${sn} kcal.

Rules:
- Meals must form a coherent, realistic menu for one day
- Each meal: 3–6 ingredients with specific quantities (e.g. "80g oats", "1 medium egg")
- Each meal: 3–5 clear numbered instruction steps
- calories = integer; proteins, carbs, fats = one decimal place
- Varied ingredients; no repeated main protein source

Return ONLY a JSON object with this exact structure:
{"meals":[{"mealType":"breakfast","name":"...","calories":int,"proteins":float,"carbs":float,"fats":float,"ingredients":["quantity ingredient",...],"instructions":["Step 1: ...",...]},{"mealType":"lunch",...},{"mealType":"dinner",...},{"mealType":"snack",...}]}`;
    }

    try {
      const openai = new OpenAI({ apiKey } as ClientOptions);
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const result = JSON.parse(raw) as { meals?: unknown };

      const mealSchema = z.object({
        mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
        name: z.string().min(1).max(200),
        calories: z.number().int().min(0).max(3000),
        proteins: z.number().min(0).max(300),
        carbs: z.number().min(0).max(500),
        fats: z.number().min(0).max(200),
        ingredients: z.array(z.string().max(200)).min(1).max(15),
        instructions: z.array(z.string().max(500)).min(1).max(15),
      });

      const meals = z.array(mealSchema).safeParse(result.meals);
      if (!meals.success) return res.status(502).json({ message: "AI returned invalid meal plan" });

      res.json({ meals: meals.data });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/recipes/image", requireAuth, async (req, res, next) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ message: "AI not configured" });
    const name = typeof req.query.name === "string" ? req.query.name.trim().slice(0, 200) : "";
    if (!name) return res.status(400).json({ message: "name is required" });
    try {
      const openai = new OpenAI({ apiKey } as ClientOptions);
      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: `${name}, food photography, appetizing, top-down view, clean plate presentation, soft natural lighting, square format`,
        n: 1,
        size: "1024x1024",
        quality: "low",
      } as Parameters<typeof openai.images.generate>[0]);
      const b64 = img.data[0]?.b64_json;
      if (!b64) return res.status(502).json({ message: "Image generation failed" });
      res.json({ imageUrl: `data:image/png;base64,${b64}` });
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

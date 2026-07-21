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
  limits: { fileSize: MAX_IMAGE_BYTES, fieldSize: 5 * 1024 * 1024 },
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
  portionAssumption: z.string().max(200).optional(),
  explanation: z.string().max(500).optional(),
});

const imageCache = new Map<string, string>();

const CUISINE_THEMES = [
  "Mediterranean", "Asian fusion", "Mexican", "Middle Eastern", "Japanese",
  "Italian", "French bistro", "Indian", "Nordic", "American comfort food",
  "Thai", "Greek", "Turkish", "Peruvian", "Moroccan",
];
function randomCuisine(): string {
  return CUISINE_THEMES[Math.floor(Math.random() * CUISINE_THEMES.length)];
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await setupAuth(app);

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
          model: "gpt-4o-mini",
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
      let chatLanguage = "en";
      let userWeightKg = 75;
      try {
        const rawCtx = typeof req.body.context === "string" ? req.body.context : null;
        if (rawCtx) {
          const ctx = JSON.parse(rawCtx) as Record<string, unknown>;
          const goal = typeof ctx.calorieGoal === "number" ? ctx.calorieGoal : null;
          const logged = typeof ctx.caloriesLogged === "number" ? ctx.caloriesLogged : null;
          const rem = typeof ctx.remainingCalories === "number" ? ctx.remainingCalories : null;
          if (typeof ctx.language === "string") chatLanguage = ctx.language;
          if (typeof ctx.userWeightKg === "number" && ctx.userWeightKg > 20 && ctx.userWeightKg < 400) {
            userWeightKg = Math.round(ctx.userWeightKg);
          }
          if (goal !== null && logged !== null && rem !== null) {
            contextNote = `\n\nUSER'S DAY CONTEXT: Daily calorie goal = ${goal} kcal | Already logged = ${logged} kcal | Remaining = ${rem} kcal | Body weight = ${userWeightKg} kg.`;
          }
        }
      } catch { /* ignore */ }

      try {
        const openai = new OpenAI({ apiKey } as ClientOptions);

        const langInstruction = chatLanguage === "ru"
          ? "\n\nIMPORTANT: Respond entirely in Russian."
          : "";

        const systemMessage: ChatCompletionMessageParam = {
          role: "system",
          content: `You are a nutrition and fitness assistant inside a calorie-tracking app.${contextNote}${langInstruction}

You handle four types of input:

TYPE A — FOOD/MEAL: The user describes something they ate or a food photo.
TYPE B — PHYSICAL ACTIVITY: The user describes exercise, sport, or physical activity.
TYPE C — BOTH: The user mentions both food and activity.
TYPE D — RECIPE IDEAS / MEAL PLAN: The user asks for recipe suggestions, meal ideas, or a full-day meal plan.

━━━ FOOD ESTIMATION RULES ━━━
1. Identify every ingredient and its realistic portion size in grams.
2. Apply standard nutrition values (USDA): protein = 4 kcal/g, carbs = 4 kcal/g, fat = 9 kcal/g.
3. Sum contributions; sanity-check the total.

━━━ PHOTO ANALYSIS RULES (when an image is provided) ━━━
Examine the photo carefully before estimating:
- Use visual cues (plate diameter ~26 cm, bowl ~16 cm, fork/spoon for scale, hand size) to estimate portion dimensions.
- Identify EVERY visible ingredient separately — protein source, starch/grain, vegetables, sauces, toppings, garnishes.
- Estimate the gram weight of each ingredient individually based on its volume and density.
- Account for cooking method: grilled chicken is denser than boiled; pasta absorbs water (~2×); fried items have added oil.
- If the portion looks smaller or larger than standard, adjust accordingly — do NOT default to generic "one serving".
- List each ingredient with its estimated grams and calories in the "explanation" field, then sum them.
CALIBRATION REFERENCES:
- Medium apple (182 g): 95 kcal | P 0.5 g | C 25 g | F 0.3 g
- Grilled chicken breast (150 g): 248 kcal | P 46 g | C 0 g | F 5 g
- Oatmeal, dry (80 g) cooked with water: 300 kcal | P 11 g | C 54 g | F 5 g
- Classic cheeseburger with bun (330 g): 620 kcal | P 34 g | C 42 g | F 33 g
- Green salad + vinaigrette (250 g): 180 kcal | P 4 g | C 12 g | F 13 g
- Avocado toast (1 slice sourdough + ½ avocado): 290 kcal | P 7 g | C 30 g | F 16 g

━━━ ACTIVITY ESTIMATION RULES ━━━
Use standard MET values to estimate calories burned. User body weight = ${userWeightKg} kg.
Formula: calories = MET × weight_kg × duration_hours   (IMPORTANT: duration in HOURS, not minutes — divide minutes by 60)
Example: 60 min at MET 5.0 for ${userWeightKg} kg → 5.0 × ${userWeightKg} × (60/60) = ${Math.round(5.0 * userWeightKg * 1)} kcal
Common MET values: walking (3.5), light cycling (6), running/jogging (8), HIIT/cardio (10), strength training (5), swimming (7), yoga (2.5).
- activityType must be one of: "cardio", "strength", "other"
- Include "met" (the MET value used) and "explanation" (1-sentence formula breakdown, e.g. "MET 5.0 × ${userWeightKg} kg × 1.0 h = ${Math.round(5.0 * userWeightKg * 1)} kcal") in activityEstimate.
- ALWAYS express duration as hours in the explanation (e.g. "0.5 h" for 30 min, "1.0 h" for 60 min).

━━━ RECIPE / MEAL PLAN RULES (TYPE D) ━━━
When the user asks for meal ideas or a full-day plan:
- Use the USER'S DAY CONTEXT (remaining calories) to size portions appropriately.
- For a full-day plan: distribute remaining calories across meals not yet logged (breakfast ~25%, lunch ~35%, dinner ~30%, snack ~10% of daily goal).
- For a single meal request: suggest one complete recipe that fits within the appropriate fraction of remaining calories.
- Suggest realistic, balanced meals with varied ingredients.
- Return multiple estimates using the "estimates" array format below. Include "mealType" in each estimate.

━━━ RESPONSE RULES ━━━
- Output ONLY the JSON block. No text before or after it. The card UI will display the result.
- NEVER ask clarifying questions about portion size, ingredients, or meal details. If the portion is unspecified, use a realistic standard portion. If the food is ambiguous, pick the most common interpretation.
- For food (TYPE A/C): include "explanation" in the estimate — a concise 1-2 sentence ingredient breakdown (e.g. "Oats 80g (300 kcal) + milk 200ml (95 kcal) + banana 100g (89 kcal) = 484 kcal total").
- For activity (TYPE B): include "met" (MET value used) and "explanation" in activityEstimate — one sentence with the formula (e.g. "MET 8.0 × 75 kg × 0.5 h = 300 kcal burned").
- If the user says "add it", "log it", "log this", "yes", "save it", "add to lunch", or any short affirmative/action phrase referring to food or an activity you already estimated in this conversation: re-emit the same estimate in JSON so it can be added to the log. Re-read your previous message to reconstruct the numbers.
- Numbers: calories = integer, proteins/carbs/fats = 1 decimal place, caloriesBurned = integer.
- ALWAYS include "portionAssumption" in every food estimate — state the assumed portion and weight in grams (e.g., "1 medium banana, ~118 g" or "1 cup cooked oatmeal (~240 g) + 1 tbsp honey").

━━━ MANDATORY JSON OUTPUT ━━━
YOUR ENTIRE RESPONSE must be exactly ONE JSON block — nothing before it, nothing after it.
- TYPE A/C (food): use "estimate" key
- TYPE B (activity): use "activityEstimate" key
- TYPE D (recipes/meal ideas/plans/suggestions): ALWAYS use "estimates" array — NEVER skip this
- If you are suggesting any meals, recipes, or a plan, the "estimates" array is REQUIRED

For single food:
\`\`\`json
{"estimate":{"name":"<meal name>","calories":<int>,"proteins":<num>,"carbs":<num>,"fats":<num>,"portionAssumption":"<e.g. 1 medium muffin, ~110 g>","explanation":"<e.g. Oats 80g (300 kcal) + milk 200ml (95 kcal) = 395 kcal total>"}}
\`\`\`

For activity only:
\`\`\`json
{"activityEstimate":{"name":"<activity name>","durationMinutes":<int>,"caloriesBurned":<int>,"activityType":"cardio|strength|other","met":<num>,"explanation":"<e.g. MET 8.0 × 75 kg × 0.5 h = 300 kcal burned>"}}
\`\`\`

For both food and activity:
\`\`\`json
{"estimate":{"name":"<meal name>","calories":<int>,"proteins":<num>,"carbs":<num>,"fats":<num>,"explanation":"<ingredient breakdown>"},"activityEstimate":{"name":"<activity name>","durationMinutes":<int>,"caloriesBurned":<int>,"activityType":"cardio|strength|other","met":<num>,"explanation":"<MET formula>"}}
\`\`\`

For recipe suggestions or meal plan (TYPE D) — ALWAYS use this format:
\`\`\`json
{"estimates":[{"name":"<meal name>","calories":<int>,"proteins":<num>,"carbs":<num>,"fats":<num>,"mealType":"breakfast|lunch|dinner|snack","portionAssumption":"<e.g. 1 bowl, ~350 g>"},{"name":"...","calories":<int>,"proteins":<num>,"carbs":<num>,"fats":<num>,"mealType":"...","portionAssumption":"..."}]}
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

        const activityEstimateSchema = z.object({
          name: z.string().min(1).max(120),
          durationMinutes: z.number().int().min(0).max(1440),
          caloriesBurned: z.number().int().min(0).max(10000),
          activityType: z.enum(["cardio", "strength", "other"]).default("other"),
          met: z.number().min(0).max(50).optional(),
          explanation: z.string().max(400).optional(),
        });

        const recipeEstimateSchema = photoAnalysisSchema.extend({
          mealType: z.string().optional(),
        });

        // Stream the response for immediate perceived speed.
        // X-Accel-Buffering: no prevents nginx/proxies from buffering SSE chunks.
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const stream = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 900,
          messages: [systemMessage, ...historyMessages, { role: "user", content: userContent }],
          stream: true,
        });

        let fullContent = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            fullContent += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        }

        const rawReply = fullContent.trim();
        let estimate: z.infer<typeof photoAnalysisSchema> | undefined;
        let estimates: z.infer<typeof recipeEstimateSchema>[] | undefined;
        let activityEstimate: z.infer<typeof activityEstimateSchema> | undefined;
        let reply = "";

        // Extract JSON: try fenced block first, then raw JSON object
        function extractJsonStr(text: string): string | null {
          const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
          if (fenced) return fenced[1];
          // Raw JSON — find outermost { }
          const start = text.indexOf("{");
          const end = text.lastIndexOf("}");
          if (start !== -1 && end > start) return text.slice(start, end + 1);
          return null;
        }

        const jsonStr = extractJsonStr(rawReply);
        if (jsonStr) {
          try {
            const parsed: unknown = JSON.parse(jsonStr);
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
                if (v.success) {
                  activityEstimate = v.data;
                  // Server-side correction: always recalculate caloriesBurned from the
                  // MET formula to prevent AI from using minutes instead of hours.
                  if (activityEstimate.met && activityEstimate.met > 0 && userWeightKg > 0) {
                    const correctCalories = Math.round(activityEstimate.met * userWeightKg * (activityEstimate.durationMinutes / 60));
                    activityEstimate = { ...activityEstimate, caloriesBurned: correctCalories };
                  }
                }
              }
            }
          } catch {
            // leave estimates undefined
          }
        }

        res.write(`data: ${JSON.stringify({ done: true, reply, estimate, estimates, activityEstimate })}\n\n`);
        res.end();
        return;
      } catch (err: unknown) {
        if (res.headersSent) {
          // SSE stream already started — send an error event so the client knows
          try {
            res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : "AI chat failed" })}\n\n`);
            res.end();
          } catch { /* ignore secondary errors */ }
        } else {
          next(new Error(err instanceof Error ? err.message : "AI chat failed"));
        }
      }
    });
  });

  // ── Dedicated recipe plan generation ──────────────────────────────────────
  app.post("/api/recipes/generate", requireAuth, async (req, res, next) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ message: "AI not configured" });

    const bodySchema = z.object({
      calorieGoal: z.number().int().min(500).max(10000),
      language: z.string().max(10).optional(),
      recentMeals: z.array(z.string().max(200)).max(40).optional(),
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

    const { calorieGoal, regenerateMeal, currentPlan, language: recipeLang, recentMeals } = parsed.data;
    const avoidList = recentMeals && recentMeals.length > 0
      ? `\n\nDO NOT use any of these recently shown meals (must be completely new dishes): ${recentMeals.slice(-20).join(", ")}`
      : "";
    const recipeLangInstruction = recipeLang === "ru"
      ? "\nIMPORTANT: Write all meal names, ingredient names, and instruction steps in Russian."
      : "";
    const bk = Math.round(calorieGoal * 0.25);
    const ln = Math.round(calorieGoal * 0.35);
    const dn = Math.round(calorieGoal * 0.30);
    const sn = Math.round(calorieGoal * 0.10);

    let prompt: string;

    const cuisine = randomCuisine();

    if (regenerateMeal) {
      const targets: Record<string, number> = { breakfast: bk, lunch: ln, dinner: dn, snack: sn };
      const targetCal = targets[regenerateMeal] ?? bk;
      const otherMealNames = (currentPlan ?? []).filter((m) => m.mealType !== regenerateMeal).map((m) => m.name).join(", ");
      prompt = `Generate a single "${regenerateMeal}" recipe (${cuisine} cuisine style) around ${targetCal} kcal. It must be completely different from these meals already in the day's plan: ${otherMealNames || "none"}.${avoidList}${recipeLangInstruction}

Return ONLY a JSON object with this structure (one meal, not an array):
{"meal":{"mealType":"${regenerateMeal}","name":"...","calories":int,"proteins":float,"carbs":float,"fats":float,"ingredients":["quantity ingredient",...],"instructions":["Step 1: ...","Step 2: ...","Step 3: ..."]}}`;
    } else {
      prompt = `Generate a balanced daily meal plan with exactly 4 meals: breakfast, lunch, dinner, snack. Use ${cuisine} cuisine as the theme/inspiration.
Total target: ${calorieGoal} kcal. Distribution: breakfast ~${bk} kcal, lunch ~${ln} kcal, dinner ~${dn} kcal, snack ~${sn} kcal.

Rules:
- Meals must form a coherent, realistic menu for one day
- Each meal: 3–6 ingredients with specific quantities (e.g. "80g oats", "1 medium egg")
- Each meal: 3–5 clear numbered instruction steps
- calories = integer; proteins, carbs, fats = one decimal place
- Varied ingredients; no repeated main protein source${avoidList}${recipeLangInstruction}

Return ONLY a JSON object with this exact structure:
{"meals":[{"mealType":"breakfast","name":"...","calories":int,"proteins":float,"carbs":float,"fats":float,"ingredients":["quantity ingredient",...],"instructions":["Step 1: ...",...]},{"mealType":"lunch",...},{"mealType":"dinner",...},{"mealType":"snack",...}]}`;
    }

    try {
      const openai = new OpenAI({ apiKey } as ClientOptions);
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const result = JSON.parse(raw) as { meals?: unknown; meal?: unknown };

      const mealSchema = z.object({
        mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
        name: z.string().min(1).max(200),
        calories: z.number().min(0).max(3000).transform(Math.round),
        proteins: z.number().min(0).max(300),
        carbs: z.number().min(0).max(500),
        fats: z.number().min(0).max(200),
        ingredients: z.array(z.string().max(200)).min(1).max(15),
        instructions: z.array(z.string().max(500)).min(1).max(15),
      });

      // Single-meal regen: handle both { meal: {...} } and { meals: [...] } formats
      if (regenerateMeal) {
        const rawMeal = result.meal ??
          (Array.isArray(result.meals)
            ? (result.meals as unknown[]).find(
                (m) => typeof m === "object" && m !== null &&
                  (m as Record<string, unknown>).mealType === regenerateMeal
              )
            : undefined);
        const single = mealSchema.safeParse(rawMeal);
        if (!single.success) return res.status(502).json({ message: "AI returned invalid meal" });
        const merged = (currentPlan ?? []).map((m) =>
          m.mealType === regenerateMeal ? single.data : m
        );
        if (!merged.find((m) => m.mealType === regenerateMeal)) merged.push(single.data);
        return res.json({ meals: merged });
      }

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

    const cacheKey = name.toLowerCase();
    if (imageCache.has(cacheKey)) {
      return res.json({ imageUrl: imageCache.get(cacheKey) });
    }

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
      const imageUrl = `data:image/png;base64,${b64}`;
      imageCache.set(cacheKey, imageUrl);
      res.json({ imageUrl });
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/account/data", requireAuth, async (req, res, next) => {
    try {
      await storage.resetUserData(req.user!.id);
      res.json({ ok: true });
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
      const [settings, meals, acts] = await Promise.all([
        storage.getSettings(userId),
        storage.listMeals(userId),
        storage.listActivities(userId),
      ]);
      res.json(calorieSeries(meals, lastNDates(n), settings.dailyCalorieGoal, acts));
    } catch (err) {
      next(err);
    }
  });

  return httpServer;
}

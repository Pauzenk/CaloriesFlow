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

      try {
        const openai = new OpenAI({ apiKey } as ClientOptions);

        const systemMessage: ChatCompletionMessageParam = {
          role: "system",
          content: `You are a precise nutrition assistant inside a calorie-tracking app. Your most critical responsibility is producing ACCURATE calorie and macro estimates based on the specific food described — never a generic placeholder.

MANDATORY estimation process:
1. Identify every ingredient and its realistic portion size in grams.
2. Apply standard nutrition values (USDA / CalorieKing): protein = 4 kcal/g, carbs = 4 kcal/g, fat = 9 kcal/g.
3. Sum the contributions to get total calories.
4. Sanity-check: a light salad ≠ a burger. Adjust if the total feels wrong for the meal described.

CALIBRATION REFERENCES (use these to anchor your estimates):
- Medium apple (182 g): 95 kcal | P 0.5 g | C 25 g | F 0.3 g
- Grilled chicken breast (150 g): 248 kcal | P 46 g | C 0 g | F 5 g
- Oatmeal, dry (80 g) cooked with water: 300 kcal | P 11 g | C 54 g | F 5 g
- Classic cheeseburger with bun (330 g): 620 kcal | P 34 g | C 42 g | F 33 g
- Green salad + vinaigrette (250 g): 180 kcal | P 4 g | C 12 g | F 13 g
- Banana–milk–peanut-butter smoothie: 350 kcal | P 13 g | C 52 g | F 12 g
- Slice of cheese pizza (125 g): 285 kcal | P 12 g | C 36 g | F 10 g
- Avocado toast (1 slice sourdough + ½ avocado): 290 kcal | P 7 g | C 30 g | F 16 g

RULES:
- NEVER default to 300 kcal without ingredient-level reasoning. Every meal gets its own calculation.
- For partial servings ("I ate half"), divide the full estimate by the stated fraction.
- For restaurant meals, use standard restaurant portion sizes (typically 20–40 % larger than home portions).
- If you cannot see a photo clearly, ask one specific clarifying question and omit the JSON block.
- Calories: integer. Proteins / carbs / fats: rounded to 1 decimal place.

RESPONSE FORMAT (always in this order):
1. One or two sentences of reasoning — name each key ingredient and its estimated weight or portion.
2. If you have enough info, end with exactly this JSON block (no text after it):
\`\`\`json
{"estimate":{"name":"<concise meal name>","calories":<integer>,"proteins":<number>,"carbs":<number>,"fats":<number>}}
\`\`\`
3. If you need clarification, ask one focused question and omit the JSON block entirely.`,
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

        const jsonBlockMatch = rawReply.match(/```json\s*(\{[\s\S]*?\})\s*```\s*$/);
        let estimate: z.infer<typeof photoAnalysisSchema> | undefined;
        let reply = rawReply;

        if (jsonBlockMatch) {
          try {
            const parsed: unknown = JSON.parse(jsonBlockMatch[1]);
            if (
              typeof parsed === "object" &&
              parsed !== null &&
              "estimate" in parsed &&
              typeof (parsed as { estimate: unknown }).estimate === "object"
            ) {
              const v = photoAnalysisSchema.safeParse((parsed as { estimate: unknown }).estimate);
              if (v.success) estimate = v.data;
            }
          } catch {
            // leave estimate undefined
          }
          reply = rawReply.slice(0, rawReply.lastIndexOf("```json")).trim();
        }

        res.json({ reply: reply || "Here is the estimate.", estimate });
      } catch (err: unknown) {
        next(new Error(err instanceof Error ? err.message : "AI chat failed"));
      }
    });
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

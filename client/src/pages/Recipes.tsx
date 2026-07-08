import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Plus, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { todayStr } from "@/lib/calorieflow";
import type { Settings } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";
import { AppShell } from "@/components/AppShell";
import { SetupPrompt } from "@/components/SetupPrompt";

type RecipeMeal = {
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  ingredients: string[];
  instructions: string[];
  imageUrl?: string | null;
};

const MEAL_ORDER: RecipeMeal["mealType"][] = ["breakfast", "lunch", "dinner", "snack"];

const RECENT_MEALS_KEY = "cf-recent-recipe-meals";
const SAVED_PLAN_KEY = "cf-recipe-plan";
const IMAGE_SESSION_KEY = "cf-recipe-images";
const MAX_RECENT = 28;

// ── Persistence helpers ────────────────────────────────────────────────────

function loadRecentMeals(): string[] {
  try { return JSON.parse(sessionStorage.getItem(RECENT_MEALS_KEY) ?? "[]"); } catch { return []; }
}
function saveRecentMeals(names: string[]) {
  try { sessionStorage.setItem(RECENT_MEALS_KEY, JSON.stringify(names)); } catch {}
}

function loadSavedPlan(): RecipeMeal[] | null {
  try {
    const raw = localStorage.getItem(SAVED_PLAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecipeMeal[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch { return null; }
}
function savePlan(meals: RecipeMeal[]) {
  try {
    // Strip base64 images — they are cached separately in sessionStorage
    const slim = meals.map(({ imageUrl: _img, ...m }) => m);
    localStorage.setItem(SAVED_PLAN_KEY, JSON.stringify(slim));
  } catch {}
}

// ── Image session cache (avoids re-fetching images on same-session reload) ─

function loadImageCache(): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem(IMAGE_SESSION_KEY) ?? "{}"); } catch { return {}; }
}
function saveImageToCache(name: string, url: string) {
  try {
    const cache = loadImageCache();
    cache[name.toLowerCase()] = url;
    // Keep only last 12 entries to stay within sessionStorage limits
    const trimmed = Object.fromEntries(Object.entries(cache).slice(-12));
    sessionStorage.setItem(IMAGE_SESSION_KEY, JSON.stringify(trimmed));
  } catch {}
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MealSkeleton() {
  return (
    <div className="border border-[#1C1714]/15 p-5 animate-pulse">
      <div className="h-3 w-20 bg-[#1C1714]/10 mb-3" />
      <div className="h-5 w-2/3 bg-[#1C1714]/10 mb-2" />
      <div className="h-3 w-16 bg-[#1C1714]/8 mb-5" />
      <div className="flex gap-2">
        <div className="h-8 flex-1 bg-[#1C1714]/8" />
        <div className="h-8 flex-1 bg-[#1C1714]/8" />
      </div>
    </div>
  );
}

function RecipeDetail({ meal, onBack, mealLabel, ingredientsLabel, preparationLabel, backLabel }: {
  meal: RecipeMeal;
  onBack: () => void;
  mealLabel: string;
  ingredientsLabel: string;
  preparationLabel: string;
  backLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#F2EDE7] flex flex-col font-['Space_Mono'] text-[#1C1714] overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b border-[#1C1714]/15 bg-[#F2EDE7] shrink-0">
        <button
          type="button"
          onClick={onBack}
          data-testid="button-recipe-detail-back"
          className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#6B6560] hover:text-[#1C1714] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </button>
        <div className="h-4 w-px bg-[#1C1714]/15" />
        <span className="text-xs uppercase tracking-widest text-[#6B6560]">{mealLabel}</span>
      </div>
      <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {meal.imageUrl && (
          <img
            src={meal.imageUrl}
            alt={meal.name}
            data-testid="img-recipe-detail"
            className="w-full h-52 object-cover border-b border-[#1C1714]/15"
            loading="lazy"
          />
        )}
        <div className="px-5 py-7 max-w-2xl w-full mx-auto">
          <h1 className="text-2xl tracking-tighter leading-tight mb-2" data-testid="text-recipe-detail-name">
            {meal.name}
          </h1>
          <div className="flex gap-4 text-xs mb-8 mt-3 pb-4 border-b border-[#1C1714]/15">
            <span><span className="text-[#6B6560]">Kcal</span> <span className="tabular-nums font-bold">{meal.calories}</span></span>
            <span><span className="text-[#6B6560]">PRO</span> <span className="tabular-nums">{meal.proteins}g</span></span>
            <span><span className="text-[#6B6560]">CARB</span> <span className="tabular-nums">{meal.carbs}g</span></span>
            <span><span className="text-[#6B6560]">FAT</span> <span className="tabular-nums">{meal.fats}g</span></span>
          </div>
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-widest text-[#6B6560] mb-3">{ingredientsLabel}</h2>
            <ul className="space-y-2">
              {meal.ingredients.map((ing, i) => (
                <li key={i} className="flex gap-3 text-sm leading-snug">
                  <span className="shrink-0 w-4 text-right opacity-30 tabular-nums text-xs pt-0.5">{i + 1}</span>
                  <span>{ing}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-xs uppercase tracking-widest text-[#6B6560] mb-3">{preparationLabel}</h2>
            <ol className="space-y-4">
              {meal.instructions.map((step, i) => (
                <li key={i} className="flex gap-4 text-sm leading-relaxed">
                  <span className="shrink-0 h-6 w-6 flex items-center justify-center border border-[#1C1714]/30 text-xs tabular-nums mt-0.5 text-[#6B6560]">
                    {i + 1}
                  </span>
                  <span>{step.replace(/^Step\s*\d+[:.]\s*/i, "").replace(/^Шаг\s*\d+[:.]\s*/i, "")}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function MealCard({
  meal, mealLabel, isRegenerating, isLogging,
  onRegenerate, onLog, onDetail,
  regenLabel, regenningLabel, addToLogLabel, addingLabel,
}: {
  meal: RecipeMeal; mealLabel: string;
  isRegenerating: boolean; isLogging: boolean;
  onRegenerate: () => void; onLog: () => void; onDetail: () => void;
  regenLabel: string; regenningLabel: string;
  addToLogLabel: string; addingLabel: string;
}) {
  const BTN = "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs uppercase tracking-widest border transition-colors disabled:opacity-40";
  return (
    <div className="border border-[#1C1714]/15 hover:border-[#1C1714]/30 transition-colors" data-testid={`card-recipe-${meal.mealType}`}>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-[#6B6560] mb-1">{mealLabel}</div>
            <button type="button" onClick={onDetail} data-testid={`button-recipe-detail-${meal.mealType}`}
              className="group flex items-center gap-1.5 w-full text-left hover:opacity-70 transition-opacity">
              <span className="text-lg font-bold tracking-tight leading-snug">{meal.name}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-30 group-hover:opacity-70 shrink-0 transition-opacity" />
            </button>
            <div className="flex gap-3 mt-2 text-xs text-[#6B6560] tabular-nums">
              <span>{meal.calories} kcal</span>
              <span>P {meal.proteins}g</span>
              <span>C {meal.carbs}g</span>
              <span>F {meal.fats}g</span>
            </div>
          </div>
          <div className="h-[72px] w-[72px] shrink-0 border border-[#1C1714]/10 overflow-hidden bg-[#1C1714]/5">
            {meal.imageUrl ? (
              <img src={meal.imageUrl} alt={meal.name}
                data-testid={`img-recipe-${meal.mealType}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-full w-full animate-pulse bg-[#1C1714]/8" />
            )}
          </div>
        </div>
      </div>
      <div className="flex border-t border-[#1C1714]/10">
        <button type="button" onClick={onRegenerate} disabled={isRegenerating}
          data-testid={`button-regen-${meal.mealType}`}
          className={`${BTN} border-r border-[#1C1714]/10 border-l-0 border-b-0 border-t-0 text-[#1C1714]/60 hover:text-[#1C1714] hover:bg-[#1C1714]/5`}>
          <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
          {isRegenerating ? regenningLabel : regenLabel}
        </button>
        <button type="button" onClick={onLog} disabled={isLogging}
          data-testid={`button-log-${meal.mealType}`}
          className={`${BTN} border-l border-[#1C1714]/10 border-r-0 border-b-0 border-t-0 bg-[#1C1714]/3 text-[#1C1714]/70 hover:bg-[#1C1714] hover:text-[#F2EDE7]`}>
          <Plus className="h-3 w-3" />
          {isLogging ? addingLabel : addToLogLabel}
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function RecipesPage() {
  const logDate = (() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayStr();
  })();

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const { data: settings, isSuccess: settingsLoaded } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    staleTime: 5 * 60 * 1000,
  });
  const calorieGoal = settings?.dailyCalorieGoal ?? 2000;
  const hasProfile = !!(settings?.heightCm && settings?.ageYears && settings?.startingWeightKg);

  const [meals, setMeals] = useState<RecipeMeal[] | null>(() => loadSavedPlan());
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingMeal, setRegeneratingMeal] = useState<string | null>(null);
  const [loggingMeal, setLoggingMeal] = useState<string | null>(null);
  const [loggingAll, setLoggingAll] = useState(false);
  const [detailMealType, setDetailMealType] = useState<string | null>(null);

  const detailMeal = detailMealType ? (meals?.find((m) => m.mealType === detailMealType) ?? null) : null;
  const recentMealsRef = useRef<string[]>(loadRecentMeals());
  const hasFetched = useRef(false);

  const MEAL_LABELS: Record<string, string> = {
    breakfast: t("breakfast"),
    lunch: t("lunch"),
    dinner: t("dinner"),
    snack: t("snack"),
  };

  function trackRecentMeals(newMeals: RecipeMeal[]) {
    const names = newMeals.map((m) => m.name);
    const updated = [...recentMealsRef.current, ...names].slice(-MAX_RECENT);
    recentMealsRef.current = updated;
    saveRecentMeals(updated);
  }

  function fetchImages(newMeals: RecipeMeal[]) {
    const imageCache = loadImageCache();
    newMeals.forEach(async (meal) => {
      // Serve from session cache instantly — no network request needed
      const cached = imageCache[meal.name.toLowerCase()];
      if (cached) {
        setMeals((prev) =>
          prev?.map((m) => m.mealType === meal.mealType ? { ...m, imageUrl: cached } : m) ?? null
        );
        return;
      }
      try {
        const res = await apiRequest("GET", `/api/recipes/image?name=${encodeURIComponent(meal.name)}`);
        const data = (await res.json()) as { imageUrl: string };
        if (data.imageUrl) {
          setMeals((prev) =>
            prev?.map((m) => m.mealType === meal.mealType ? { ...m, imageUrl: data.imageUrl } : m) ?? null
          );
          saveImageToCache(meal.name, data.imageUrl);
        }
      } catch { /* silently fail — image placeholder stays */ }
    });
  }

  async function generateFullDay(goal?: number) {
    const targetGoal = goal ?? calorieGoal;
    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/recipes/generate", {
        calorieGoal: targetGoal,
        language: lang,
        recentMeals: recentMealsRef.current.slice(-MAX_RECENT),
      });
      const data = (await res.json()) as { meals: RecipeMeal[] };
      if (!data.meals || !Array.isArray(data.meals) || data.meals.length === 0) throw new Error("Empty meal plan");
      setMeals(data.meals);
      savePlan(data.meals);
      trackRecentMeals(data.meals);
      fetchImages(data.meals);
    } catch (err) {
      console.error("[Recipes] generateFullDay:", err instanceof Error ? err.message : String(err));
      toast({
        title: lang === "ru" ? "Не удалось создать план" : "Failed to generate plan",
        description: lang === "ru" ? "Попробуйте ещё раз." : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function regenerateSingleMeal(mealType: string) {
    if (!meals) return;
    setRegeneratingMeal(mealType);
    try {
      const res = await apiRequest("POST", "/api/recipes/generate", {
        calorieGoal,
        regenerateMeal: mealType,
        currentPlan: meals.map(({ imageUrl: _img, ...m }) => m),
        language: lang,
        recentMeals: recentMealsRef.current.slice(-MAX_RECENT),
      });
      const data = (await res.json()) as { meals: RecipeMeal[] };
      if (!data.meals || !Array.isArray(data.meals)) throw new Error("Invalid response");
      const regenerated = data.meals.find((m) => m.mealType === mealType);
      if (!regenerated) throw new Error("Regenerated meal missing");
      setMeals((prev) => {
        const updated = prev?.map((m) => m.mealType === mealType ? { ...regenerated, imageUrl: null } : m) ?? null;
        if (updated) savePlan(updated);
        return updated;
      });
      trackRecentMeals([regenerated]);
      fetchImages([regenerated]);
    } catch (err) {
      console.error("[Recipes] regenerateSingleMeal:", err instanceof Error ? err.message : String(err));
      toast({ title: lang === "ru" ? "Не удалось заменить блюдо" : "Failed to regenerate", variant: "destructive" });
    } finally {
      setRegeneratingMeal(null);
    }
  }

  async function logSingleMeal(meal: RecipeMeal) {
    setLoggingMeal(meal.mealType);
    try {
      await apiRequest("POST", "/api/meals", {
        date: logDate,
        mealType: meal.mealType,
        name: meal.name,
        calories: meal.calories,
        proteins: meal.proteins,
        carbs: meal.carbs,
        fats: meal.fats,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      toast({
        title: `${MEAL_LABELS[meal.mealType]} ${lang === "ru" ? "добавлен в журнал" : "added to log"}`,
        description: `${meal.name} · ${meal.calories} kcal`,
      });
    } catch {
      toast({ title: lang === "ru" ? "Не удалось добавить" : "Failed to add to log", variant: "destructive" });
    } finally {
      setLoggingMeal(null);
    }
  }

  async function logAllMeals() {
    if (!meals) return;
    setLoggingAll(true);
    try {
      for (const meal of meals) {
        await apiRequest("POST", "/api/meals", {
          date: logDate, mealType: meal.mealType, name: meal.name,
          calories: meal.calories, proteins: meal.proteins,
          carbs: meal.carbs, fats: meal.fats,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      setLocation("/");
    } catch {
      toast({ title: lang === "ru" ? "Ошибка добавления" : "Failed to log all meals", variant: "destructive" });
      setLoggingAll(false);
    }
  }

  useEffect(() => {
    if (!settingsLoaded || hasFetched.current) return;
    hasFetched.current = true;
    if (!hasProfile) return;
    if (meals && meals.length > 0) {
      fetchImages(meals);
    }
    // No auto-generation on first visit — user triggers plan generation explicitly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, hasProfile]);

  const totalPlanned = meals?.reduce((s, m) => s + m.calories, 0) ?? 0;

  return (
    <AppShell title={t("recipes")}>
      {/* Full-screen detail overlay — sits above tab bar (z-50 vs z-40) */}
      {detailMeal && (
        <RecipeDetail
          meal={detailMeal}
          onBack={() => setDetailMealType(null)}
          mealLabel={MEAL_LABELS[detailMeal.mealType] ?? detailMeal.mealType}
          ingredientsLabel={t("ingredients")}
          preparationLabel={t("preparation")}
          backLabel={t("back")}
        />
      )}

      <div className="max-w-2xl w-full mx-auto">
        {!settingsLoaded ? (
          <div className="space-y-3">
            {MEAL_ORDER.map((tp) => <MealSkeleton key={tp} />)}
          </div>
        ) : !hasProfile ? (
          <SetupPrompt message={t("setupToUseFeature")} />
        ) : (
          <>
            {/* Empty state — no plan generated yet */}
            {!isGenerating && (!meals || meals.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-20 gap-5">
                <p className="text-xs uppercase tracking-widest text-[#6B6560]">{t("generatePlanPrompt")}</p>
                <button
                  type="button"
                  onClick={() => generateFullDay()}
                  data-testid="button-generate-plan"
                  className="bg-[#1C1714] text-[#F2EDE7] px-8 py-3 text-xs uppercase tracking-widest hover:bg-[#1C1714]/85 transition-colors"
                >
                  {t("generatePlanBtn")}
                </button>
              </div>
            ) : (
              <>
                {/* Action bar */}
                <div className="flex items-center justify-between mb-5">
                  {meals && !isGenerating ? (
                    <div className="text-xs tabular-nums text-[#6B6560]">
                      {totalPlanned} <span className="text-[#6B6560]">/ {calorieGoal} kcal</span>
                    </div>
                  ) : (
                    <div />
                  )}
                  <button
                    type="button"
                    onClick={() => generateFullDay()}
                    disabled={isGenerating}
                    data-testid="button-regenerate-all"
                    className="flex items-center gap-1.5 border border-[#1C1714]/30 px-3 py-2 text-xs uppercase tracking-widest hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors disabled:opacity-40 min-h-[44px]"
                  >
                    <RefreshCw className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`} />
                    {isGenerating ? t("generating") : t("newPlan")}
                  </button>
                </div>

                {/* Meal cards */}
                <div className="space-y-3">
                  {isGenerating
                    ? MEAL_ORDER.map((tp) => <MealSkeleton key={tp} />)
                    : meals
                      ? MEAL_ORDER.map((type) => {
                          const meal = meals.find((m) => m.mealType === type);
                          if (!meal) return null;
                          return (
                            <MealCard
                              key={type}
                              meal={meal}
                              mealLabel={MEAL_LABELS[type] ?? type}
                              isRegenerating={regeneratingMeal === type}
                              isLogging={loggingMeal === type}
                              onRegenerate={() => regenerateSingleMeal(type)}
                              onLog={() => logSingleMeal(meal)}
                              onDetail={() => setDetailMealType(meal.mealType)}
                              regenLabel={t("regenerate")}
                              regenningLabel={t("regenerating")}
                              addToLogLabel={t("addToLog")}
                              addingLabel={t("adding")}
                            />
                          );
                        })
                      : null}
                </div>

                {meals && !isGenerating && (
                  <button
                    type="button"
                    onClick={logAllMeals}
                    disabled={loggingAll}
                    data-testid="button-log-full-day"
                    className="w-full mt-5 bg-[#1C1714] text-[#F2EDE7] py-3.5 text-xs uppercase tracking-widest hover:bg-[#1C1714]/85 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {loggingAll ? t("addingFullDay") : t("addFullDayToLog")}
                  </button>
                )}

                <p className="text-center text-xs uppercase tracking-widest text-[#6B6560] mt-6">{t("tapMealHint")}</p>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

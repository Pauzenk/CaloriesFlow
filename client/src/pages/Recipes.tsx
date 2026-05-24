import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Plus, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { todayStr } from "@/lib/calorieflow";
import type { Settings } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";

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
    <div className="h-dvh bg-[#F2EDE7] flex flex-col font-['Space_Mono'] text-[#1C1714] overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b border-[#1C1714]/15 bg-[#F2EDE7] shrink-0">
        <button
          type="button"
          onClick={onBack}
          data-testid="button-recipe-detail-back"
          className="flex items-center gap-1.5 text-xs uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </button>
        <div className="h-4 w-px bg-[#1C1714]/15" />
        <span className="text-[10px] uppercase tracking-widest opacity-40">{mealLabel}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {meal.imageUrl && (
          <img
            src={meal.imageUrl}
            alt={meal.name}
            data-testid="img-recipe-detail"
            className="w-full h-52 object-cover border-b border-[#1C1714]/15"
          />
        )}
        <div className="px-5 py-7 max-w-2xl w-full mx-auto">
          <h1 className="text-2xl tracking-tighter leading-tight mb-2" data-testid="text-recipe-detail-name">
            {meal.name}
          </h1>
          <div className="flex gap-4 text-xs mb-8 mt-3 pb-4 border-b border-[#1C1714]/15">
            <span><span className="opacity-50">Kcal</span> <span className="tabular-nums font-bold">{meal.calories}</span></span>
            <span><span className="opacity-50">PRO</span> <span className="tabular-nums">{meal.proteins}g</span></span>
            <span><span className="opacity-50">CRB</span> <span className="tabular-nums">{meal.carbs}g</span></span>
            <span><span className="opacity-50">FAT</span> <span className="tabular-nums">{meal.fats}g</span></span>
          </div>

          <section className="mb-8">
            <h2 className="text-[10px] uppercase tracking-widest opacity-50 mb-3">{ingredientsLabel}</h2>
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
            <h2 className="text-[10px] uppercase tracking-widest opacity-50 mb-3">{preparationLabel}</h2>
            <ol className="space-y-4">
              {meal.instructions.map((step, i) => (
                <li key={i} className="flex gap-4 text-sm leading-relaxed">
                  <span className="shrink-0 h-6 w-6 flex items-center justify-center border border-[#1C1714]/30 text-[10px] tabular-nums mt-0.5 opacity-60">
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
  meal,
  mealLabel,
  isRegenerating,
  isLogging,
  onRegenerate,
  onLog,
  onDetail,
  regenLabel,
  regenningLabel,
  addToLogLabel,
  addingLabel,
}: {
  meal: RecipeMeal;
  mealLabel: string;
  isRegenerating: boolean;
  isLogging: boolean;
  onRegenerate: () => void;
  onLog: () => void;
  onDetail: () => void;
  regenLabel: string;
  regenningLabel: string;
  addToLogLabel: string;
  addingLabel: string;
}) {
  const BTN = "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] uppercase tracking-widest border transition-colors disabled:opacity-40";
  return (
    <div className="border border-[#1C1714]/15 hover:border-[#1C1714]/30 transition-colors" data-testid={`card-recipe-${meal.mealType}`}>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[9px] uppercase tracking-widest opacity-40 mb-1">{mealLabel}</div>
            <button
              type="button"
              onClick={onDetail}
              data-testid={`button-recipe-detail-${meal.mealType}`}
              className="group flex items-center gap-1.5 w-full text-left hover:opacity-70 transition-opacity"
            >
              <span className="text-base tracking-tight leading-snug">{meal.name}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-30 group-hover:opacity-70 shrink-0 transition-opacity" />
            </button>
            <div className="flex gap-3 mt-2 text-[10px] opacity-50 tabular-nums">
              <span>{meal.calories} kcal</span>
              <span>P {meal.proteins}g</span>
              <span>C {meal.carbs}g</span>
              <span>F {meal.fats}g</span>
            </div>
          </div>
          <div className="h-[72px] w-[72px] shrink-0 border border-[#1C1714]/10 overflow-hidden">
            {meal.imageUrl ? (
              <img
                src={meal.imageUrl}
                alt={meal.name}
                data-testid={`img-recipe-${meal.mealType}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-[#1C1714]/5 animate-pulse" />
            )}
          </div>
        </div>
      </div>

      <div className="flex border-t border-[#1C1714]/10">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isRegenerating}
          data-testid={`button-regen-${meal.mealType}`}
          className={`${BTN} border-r border-[#1C1714]/10 border-l-0 border-b-0 border-t-0 text-[#1C1714]/60 hover:text-[#1C1714] hover:bg-[#1C1714]/5`}
        >
          <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
          {isRegenerating ? regenningLabel : regenLabel}
        </button>
        <button
          type="button"
          onClick={onLog}
          disabled={isLogging}
          data-testid={`button-log-${meal.mealType}`}
          className={`${BTN} border-l border-[#1C1714]/10 border-r-0 border-b-0 border-t-0 bg-[#1C1714]/3 text-[#1C1714]/70 hover:bg-[#1C1714] hover:text-[#F2EDE7]`}
        >
          <Plus className="h-3 w-3" />
          {isLogging ? addingLabel : addToLogLabel}
        </button>
      </div>
    </div>
  );
}

export default function RecipesPage() {
  const logDate = (() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayStr();
  })();

  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const { data: settings, isSuccess: settingsLoaded } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const calorieGoal = settings?.dailyCalorieGoal ?? 2000;

  const [meals, setMeals] = useState<RecipeMeal[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingMeal, setRegeneratingMeal] = useState<string | null>(null);
  const [loggingMeal, setLoggingMeal] = useState<string | null>(null);
  const [loggingAll, setLoggingAll] = useState(false);
  const [detailMealType, setDetailMealType] = useState<string | null>(null);
  const detailMeal = detailMealType ? (meals?.find((m) => m.mealType === detailMealType) ?? null) : null;

  const hasFetched = useRef(false);

  const MEAL_LABELS: Record<string, string> = {
    breakfast: t("breakfast"),
    lunch: t("lunch"),
    dinner: t("dinner"),
    snack: t("snack"),
  };

  function fetchImages(newMeals: RecipeMeal[]) {
    newMeals.forEach(async (meal) => {
      try {
        const res = await apiRequest("GET", `/api/recipes/image?name=${encodeURIComponent(meal.name)}`);
        const data = (await res.json()) as { imageUrl: string };
        if (data.imageUrl) {
          setMeals((prev) =>
            prev?.map((m) => m.mealType === meal.mealType ? { ...m, imageUrl: data.imageUrl } : m) ?? null
          );
        }
      } catch {
        // silently fail
      }
    });
  }

  async function generateFullDay(goal?: number) {
    const targetGoal = goal ?? calorieGoal;
    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/recipes/generate", { calorieGoal: targetGoal, language: lang });
      const data = (await res.json()) as { meals: RecipeMeal[] };
      if (!data.meals || !Array.isArray(data.meals) || data.meals.length === 0) {
        throw new Error("Empty meal plan returned");
      }
      setMeals(data.meals);
      fetchImages(data.meals);
    } catch (err) {
      console.error("[Recipes] generateFullDay failed:", err instanceof Error ? err.message : String(err));
      toast({ title: lang === "ru" ? "Не удалось создать план" : "Failed to generate plan", description: lang === "ru" ? "Попробуйте ещё раз." : "Please try again.", variant: "destructive" });
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
        currentPlan: meals,
        language: lang,
      });
      const data = (await res.json()) as { meals: RecipeMeal[] };
      if (!data.meals || !Array.isArray(data.meals)) throw new Error("Invalid response");
      setMeals(data.meals);
      const regenerated = data.meals.find((m) => m.mealType === mealType);
      if (regenerated) fetchImages([regenerated]);
    } catch (err) {
      console.error("[Recipes] regenerateSingleMeal failed:", err instanceof Error ? err.message : String(err));
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
      toast({ title: `${MEAL_LABELS[meal.mealType]} ${lang === "ru" ? "добавлен в журнал" : "added to log"}`, description: `${meal.name} · ${meal.calories} kcal` });
    } catch (err) {
      console.error("[Recipes] logSingleMeal failed:", err);
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
          date: logDate,
          mealType: meal.mealType,
          name: meal.name,
          calories: meal.calories,
          proteins: meal.proteins,
          carbs: meal.carbs,
          fats: meal.fats,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      const total = meals.reduce((s, m) => s + m.calories, 0);
      toast({ title: lang === "ru" ? "Весь день добавлен в журнал" : "Full day added to log", description: `${meals.length} ${lang === "ru" ? "блюд" : "meals"} · ${total} kcal` });
    } catch (err) {
      console.error("[Recipes] logAllMeals failed:", err);
      toast({ title: lang === "ru" ? "Ошибка добавления" : "Failed to log all meals", variant: "destructive" });
    } finally {
      setLoggingAll(false);
    }
  }

  useEffect(() => {
    if (!settingsLoaded) return;
    if (hasFetched.current) return;
    hasFetched.current = true;
    generateFullDay(calorieGoal);
  }, [settingsLoaded]);

  if (detailMeal) {
    return (
      <RecipeDetail
        meal={detailMeal}
        onBack={() => setDetailMealType(null)}
        mealLabel={MEAL_LABELS[detailMeal.mealType] ?? detailMeal.mealType}
        ingredientsLabel={t("ingredients")}
        preparationLabel={t("preparation")}
        backLabel={t("back")}
      />
    );
  }

  const totalPlanned = meals?.reduce((s, m) => s + m.calories, 0) ?? 0;

  return (
    <div className="h-dvh bg-[#F2EDE7] flex flex-col font-['Space_Mono'] text-[#1C1714] overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-[#1C1714]/15 bg-[#F2EDE7] shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button
              type="button"
              data-testid="button-recipes-back"
              className="flex items-center gap-1.5 text-xs uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
            </button>
          </Link>
          <div className="h-4 w-px bg-[#1C1714]/15" />
          <span className="text-sm tracking-tight">{t("dailyRecipePlan")}</span>
        </div>

        <button
          type="button"
          onClick={() => generateFullDay()}
          disabled={isGenerating}
          data-testid="button-regenerate-all"
          className="flex items-center gap-1.5 border border-[#1C1714]/30 px-3 py-1.5 text-[10px] uppercase tracking-widest hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`} />
          {isGenerating ? t("generating") : t("newPlan")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 max-w-2xl w-full mx-auto">
        {meals && !isGenerating && (
          <div className="flex items-baseline justify-between mb-5 pb-4 border-b border-[#1C1714]/10">
            <div className="text-[10px] uppercase tracking-widest opacity-50">{t("goal")}</div>
            <div className="text-[10px] tabular-nums opacity-50">
              {totalPlanned} <span className="opacity-60">/ {calorieGoal} kcal</span>
            </div>
          </div>
        )}

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

        <p className="text-center text-[9px] uppercase tracking-widest opacity-25 mt-6">
          {t("tapMealHint")}
        </p>
      </div>
    </div>
  );
}

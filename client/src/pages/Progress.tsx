import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Pencil, Trash2, Check, X } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ComposedChart,
  Line,
  CartesianGrid,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Meal, Settings, Weight } from "@shared/schema";
import { MEAL_TYPES, ACTIVITY_MULTIPLIERS, ACTIVITY_LEVEL_LABELS, type ActivityLevel } from "@shared/schema";
import {
  computeBMR,
  computeTDEE,
  dailyCaloriesSeries,
  daysSince,
  lastNDates,
  sumMacros,
  todayStr,
  weightProjectionSeries,
} from "@/lib/calorieflow";

type Period = "day" | "week" | "month";

const CHART_TOOLTIP = {
  contentStyle: {
    border: "1px solid #1C1714",
    borderRadius: 0,
    fontSize: 11,
    background: "#F2EDE7",
    fontFamily: "'Space Mono', monospace",
  },
};

const IN = "rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1714] placeholder:opacity-40";

function relativeTime(dateStr: string): string {
  const today = new Date();
  const target = new Date(dateStr + "T00:00:00");
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Goal reached!";
  if (diffDays < 7) return `In ${diffDays} day${diffDays !== 1 ? "s" : ""}`;
  if (diffDays < 30) return `In ~${Math.round(diffDays / 7)} wks`;
  const months = Math.round(diffDays / 30);
  return `In ~${months} mo${months !== 1 ? "s" : ""}`;
}

function formatGoalDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function journeyTimeframeLabel(days: number): string {
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""}`;
  if (days < 30) {
    const wks = Math.round(days / 7);
    return `${wks} week${wks !== 1 ? "s" : ""}`;
  }
  const months = Math.round(days / 30);
  return `${months} month${months !== 1 ? "s" : ""}`;
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(dateStr: string): string {
  const today = todayStr();
  const yesterday = offsetDate(today, -1);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProgressPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [weightInput, setWeightInput] = useState("");
  const [selectedWeekKey, setSelectedWeekKey] = useState<number | null>(null);
  const [journalDate, setJournalDate] = useState(todayStr());
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editFields, setEditFields] = useState<{ name: string; calories: string; proteins: string; carbs: string; fats: string; mealType: string }>({
    name: "", calories: "", proteins: "", carbs: "", fats: "", mealType: "breakfast",
  });
  const projectionContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: meals = [] } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
  const { data: weights = [] } = useQuery<Weight[]>({ queryKey: ["/api/weights"] });

  const addWeight = useMutation({
    mutationFn: async (kg: number) => {
      await apiRequest("POST", "/api/weights", { date: todayStr(), weightKg: kg });
    },
    onSuccess: () => {
      setWeightInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/weights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Weight logged" });
    },
    onError: (err: unknown) =>
      toast({ title: "Failed to log weight", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" }),
  });

  const updateMeal = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Meal> }) => {
      await apiRequest("PATCH", `/api/meals/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      setEditingMeal(null);
      toast({ title: "Meal updated" });
    },
    onError: (err: unknown) =>
      toast({ title: "Failed to update", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" }),
  });

  const deleteMeal = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/meals/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      toast({ title: "Meal removed" });
    },
    onError: (err: unknown) =>
      toast({ title: "Failed to delete", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" }),
  });

  function startEdit(meal: Meal) {
    setEditingMeal(meal);
    setEditFields({
      name: meal.name,
      calories: String(meal.calories),
      proteins: String(meal.proteins),
      carbs: String(meal.carbs),
      fats: String(meal.fats),
      mealType: meal.mealType,
    });
  }

  function commitEdit() {
    if (!editingMeal) return;
    updateMeal.mutate({
      id: editingMeal.id,
      data: {
        name: editFields.name,
        calories: parseFloat(editFields.calories) || 0,
        proteins: parseFloat(editFields.proteins) || 0,
        carbs: parseFloat(editFields.carbs) || 0,
        fats: parseFloat(editFields.fats) || 0,
        mealType: editFields.mealType as Meal["mealType"],
      },
    });
  }

  const goal = settings?.dailyCalorieGoal || 2000;
  const dayNum = settings ? daysSince(settings.journeyStartDate) : 1;

  const n = period === "day" ? 1 : period === "week" ? 7 : 30;
  const dates = lastNDates(n);
  const series = dailyCaloriesSeries(meals, dates);
  const chartData = series.map((s) => ({ ...s, goal }));

  const periodMeals = meals.filter((m) => dates.includes(m.date));
  const periodTotals = sumMacros(periodMeals);
  const avgPerDay = Math.round(periodTotals.calories / n);
  const periodDeficit = goal * n - periodTotals.calories;
  const estimatedKgLost = periodDeficit / 7700;

  const canProject = !!(
    settings?.heightCm &&
    settings?.ageYears &&
    settings?.sexAtBirth &&
    settings?.goalWeightKg &&
    settings?.startingWeightKg
  );

  const { points: projectionPoints, projectedGoalDate } = useMemo(
    () =>
      settings
        ? weightProjectionSeries(settings, meals, weights)
        : { points: [], projectedGoalDate: null },
    [settings, meals, weights],
  );

  const currentEstimatedWeight = useMemo(() => {
    if (projectionPoints.length === 0) return null;
    const today = todayStr();
    const todayPoint = projectionPoints.find((p) => p.date === today);
    if (todayPoint) return todayPoint.estimatedWeightKg;
    const pastPoints = projectionPoints.filter((p) => p.date <= today);
    return pastPoints.length > 0
      ? pastPoints[pastPoints.length - 1].estimatedWeightKg
      : projectionPoints[0].estimatedWeightKg;
  }, [projectionPoints]);

  const mostRecentActualWeight = useMemo(() => {
    if (weights.length === 0) return null;
    const sorted = [...weights].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0];
  }, [weights]);

  const displayWeight = mostRecentActualWeight?.weightKg ?? currentEstimatedWeight;
  const isActualWeight = !!mostRecentActualWeight;

  const actualWeightMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of weights) map.set(w.date, w.weightKg);
    return map;
  }, [weights]);

  const estimatedTDEE = useMemo(() => {
    if (!settings?.heightCm || !settings?.ageYears || !settings?.sexAtBirth || !settings?.startingWeightKg)
      return null;
    const sex = settings.sexAtBirth;
    if (sex !== "male" && sex !== "female") return null;
    const bmr = computeBMR(settings.startingWeightKg, settings.heightCm, settings.ageYears, sex);
    const multiplier = ACTIVITY_MULTIPLIERS[(settings.activityLevel as ActivityLevel) ?? "sedentary"] ?? 1.2;
    return Math.round(computeTDEE(bmr, multiplier));
  }, [settings]);

  const weightProgressPct = useMemo(() => {
    if (!settings?.startingWeightKg || !settings?.goalWeightKg || displayWeight === null) return 0;
    const total = Math.abs(settings.startingWeightKg - settings.goalWeightKg);
    const done = Math.abs(settings.startingWeightKg - displayWeight);
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }, [settings, displayWeight]);

  const projectionChartData = useMemo(() => {
    if (!canProject || projectionPoints.length === 0) return [];
    const startMs = new Date(settings!.journeyStartDate + "T00:00:00").getTime();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    const weekMap = new Map<number, { projected: number; actuals: number[] }>();
    for (const p of projectionPoints) {
      const pMs = new Date(p.date + "T00:00:00").getTime();
      const weekIdx = Math.floor((pMs - startMs) / weekMs);
      if (!weekMap.has(weekIdx)) {
        weekMap.set(weekIdx, { projected: p.estimatedWeightKg, actuals: [] });
      } else {
        weekMap.get(weekIdx)!.projected = p.estimatedWeightKg;
      }
    }

    Array.from(actualWeightMap.entries()).forEach(([date, kg]) => {
      const dMs = new Date(date + "T00:00:00").getTime();
      const weekIdx = Math.floor((dMs - startMs) / weekMs);
      if (weekMap.has(weekIdx)) {
        weekMap.get(weekIdx)!.actuals.push(kg);
      }
    });

    const sorted = Array.from(weekMap.entries()).sort(([a], [b]) => a - b);
    return sorted.map(([weekIdx, { projected, actuals }], i) => {
      const prevProjected = i > 0 ? sorted[i - 1][1].projected : null;
      const deficitKcal =
        prevProjected !== null ? Math.round((prevProjected - projected) * 7700) : null;
      return {
        weekIdx,
        week: weekIdx === 0 ? "Now" : `Wk ${weekIdx}`,
        projected: +projected.toFixed(1),
        goal: settings?.goalWeightKg ?? undefined,
        actual:
          actuals.length > 0
            ? +(actuals.reduce((s, v) => s + v, 0) / actuals.length).toFixed(1)
            : undefined,
        deficitKcal,
      };
    });
  }, [projectionPoints, actualWeightMap, settings, canProject]);

  const activityLabel = settings?.activityLevel
    ? ACTIVITY_LEVEL_LABELS[settings.activityLevel as ActivityLevel]
    : null;

  const intakeChartMax = Math.max(
    (estimatedTDEE ?? goal) + 200,
    ...chartData.map((d) => d.calories ?? 0),
  );
  const intakeChartMin = Math.max(
    0,
    Math.floor((Math.min(goal, estimatedTDEE ?? goal) - 400) / 100) * 100,
  );

  useEffect(() => {
    if (selectedWeekKey === null) return;
    const handler = (e: PointerEvent) => {
      if (projectionContainerRef.current && !projectionContainerRef.current.contains(e.target as Node)) {
        setSelectedWeekKey(null);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [selectedWeekKey]);

  // ── Journal meals for selected date ──
  const journalMeals = useMemo(() =>
    meals
      .filter((m) => m.date === journalDate)
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [meals, journalDate]
  );

  const journalByType = useMemo(() => {
    const map = new Map<string, Meal[]>();
    for (const t of MEAL_TYPES) map.set(t, []);
    for (const m of journalMeals) {
      if (!map.has(m.mealType)) map.set(m.mealType, []);
      map.get(m.mealType)!.push(m);
    }
    return map;
  }, [journalMeals]);

  const journalTotal = journalMeals.reduce((s, m) => s + m.calories, 0);
  const journalDayNum = settings ? daysSince(settings.journeyStartDate, journalDate) : null;
  const isToday = journalDate === todayStr();
  const isFuture = journalDate > todayStr();

  return (
    <AppShell title="Progress">
      <div className="w-full font-['Space_Mono'] text-[#1C1714] space-y-8">

        {/* ══ Current Weight ══ */}
        <div className="border-2 border-[#1C1714] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">
                Current Weight
                <span className="ml-2 opacity-60">({isActualWeight ? "Actual" : "Estimated"})</span>
              </p>
              <div className="flex items-end gap-2">
                <span className="text-4xl tabular-nums tracking-tighter leading-none" data-testid="text-estimated-weight">
                  {displayWeight !== null ? displayWeight.toFixed(1) : "—"}
                </span>
                <span className="text-xl opacity-40 mb-0.5">kg</span>
                {settings?.goalWeightKg && (
                  <span className="text-sm opacity-35 mb-0.5">/ {settings.goalWeightKg} kg goal</span>
                )}
              </div>
              {displayWeight !== null && (
                <p className="text-[10px] opacity-40 mt-1">
                  {isActualWeight && mostRecentActualWeight
                    ? `Logged ${formatGoalDate(mostRecentActualWeight.date)}`
                    : activityLabel
                    ? `Calculated from calorie deficit · ${activityLabel}`
                    : "Calculated from calorie deficit"}
                </p>
              )}
            </div>
            <form
              className="flex gap-2 sm:max-w-[280px] w-full"
              onSubmit={(e) => {
                e.preventDefault();
                const kg = parseFloat(weightInput);
                if (!isNaN(kg) && kg > 0) addWeight.mutate(kg);
              }}
            >
              <Input
                data-testid="input-weight"
                type="number"
                step="0.1"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="Log actual (kg)"
                className="rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1714] placeholder:opacity-40 h-9 text-sm flex-1"
              />
              <button
                type="submit"
                data-testid="button-log-weight"
                disabled={addWeight.isPending || !weightInput}
                className="shrink-0 bg-[#1C1714] text-[#F2EDE7] px-4 py-2 text-xs uppercase tracking-widest hover:bg-[#1C1714]/80 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {addWeight.isPending ? "…" : "Add"}
              </button>
            </form>
          </div>
        </div>

        {/* ══ Journey Statement ══ */}
        <div className="border border-[#1C1714] p-5">
          <div className="flex items-start justify-between mb-4 pb-3 border-b border-dashed border-[#1C1714]/20">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Journey Statement</p>
              <p className="text-4xl tabular-nums tracking-tighter leading-none" data-testid="text-journey-day">
                Day {dayNum}
              </p>
            </div>
            {canProject && settings?.goalWeightKg && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Goal</p>
                <p className="text-lg tabular-nums">{settings.goalWeightKg} kg</p>
                {projectedGoalDate && (
                  <p className="text-[10px] opacity-35 mt-0.5">{relativeTime(projectedGoalDate)}</p>
                )}
              </div>
            )}
          </div>

          {canProject && (
            <div className="pt-3 border-t border-dashed border-[#1C1714]/20">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase opacity-70">Journey Progress</div>
                <div data-testid="text-goal-percent" className="text-xs font-medium">
                  {journeyTimeframeLabel(dayNum)} in
                </div>
              </div>
              <div className="w-full h-2 bg-[#1C1714]/10 overflow-hidden">
                <div
                  className="h-full bg-[#1C1714] transition-all duration-500"
                  style={{ width: `${weightProgressPct}%` }}
                  data-testid="bar-journey-progress"
                />
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] opacity-50">
                <span>Start</span>
                <span>{weightProgressPct}% of goal weight</span>
              </div>
            </div>
          )}
        </div>

        {/* ══ Day Journal ══ */}
        <div>
          <div className="border-b-2 border-[#1C1714] pb-4 mb-5 flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Day Journal</p>
              <div className="text-3xl tracking-tighter leading-none">Meal Log</div>
            </div>
          </div>

          {/* Day navigator */}
          <div className="flex items-center gap-0 mb-5 border border-[#1C1714]/30 w-fit">
            <button
              type="button"
              data-testid="button-journal-prev-day"
              onClick={() => { setJournalDate((d) => offsetDate(d, -1)); setEditingMeal(null); }}
              className="px-3 py-2.5 border-r border-[#1C1714]/30 hover:bg-[#1C1714]/5 transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4 opacity-60" />
            </button>
            <div className="px-5 py-2.5 flex items-baseline gap-3">
              <span className="text-sm tracking-tighter" data-testid="text-journal-date">
                {formatDisplayDate(journalDate)}
              </span>
              {journalDayNum !== null && journalDayNum > 0 && (
                <span className="text-[10px] uppercase tracking-widest opacity-40">
                  Day {journalDayNum}
                </span>
              )}
            </div>
            <button
              type="button"
              data-testid="button-journal-next-day"
              onClick={() => { setJournalDate((d) => offsetDate(d, 1)); setEditingMeal(null); }}
              disabled={isToday}
              className="px-3 py-2.5 border-l border-[#1C1714]/30 hover:bg-[#1C1714]/5 transition-colors disabled:opacity-30"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4 opacity-60" />
            </button>
          </div>

          {isFuture ? (
            <div className="flex items-center justify-center h-24 border border-dashed border-[#1C1714]/20 text-xs opacity-40">
              No data for future dates.
            </div>
          ) : journalMeals.length === 0 ? (
            <div className="flex items-center justify-center h-24 border border-dashed border-[#1C1714]/20 text-xs opacity-40">
              No meals logged {isToday ? "today" : "on this day"}.
            </div>
          ) : (
            <div className="space-y-0">
              {MEAL_TYPES.map((type) => {
                const typeMeals = journalByType.get(type) ?? [];
                if (typeMeals.length === 0) return null;
                return (
                  <div key={type} className="border-b border-[#1C1714]/10 pb-3 mb-3 last:border-0 last:mb-0 last:pb-0">
                    <div className="text-[10px] uppercase tracking-widest opacity-40 mb-2">
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </div>
                    {typeMeals.map((meal) => (
                      <div key={meal.id} data-testid={`row-journal-meal-${meal.id}`}>
                        {editingMeal?.id === meal.id ? (
                          /* ── Inline edit form ── */
                          <div className="border border-[#1C1714]/30 p-4 mb-2 space-y-3 bg-[#F2EDE7]">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className="text-[10px] uppercase tracking-widest opacity-50 block mb-1">Food</label>
                                <input
                                  type="text"
                                  value={editFields.name}
                                  onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
                                  className={IN + " h-8 text-sm w-full px-2"}
                                  data-testid="input-edit-meal-name"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-widest opacity-50 block mb-1">Meal type</label>
                                <select
                                  value={editFields.mealType}
                                  onChange={(e) => setEditFields((f) => ({ ...f, mealType: e.target.value }))}
                                  className={IN + " h-8 text-sm w-full px-2"}
                                  data-testid="select-edit-meal-type"
                                >
                                  {MEAL_TYPES.map((t) => (
                                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              {(["calories", "proteins", "carbs", "fats"] as const).map((key) => (
                                <div key={key}>
                                  <label className="text-[9px] uppercase tracking-widest opacity-50 block mb-1">
                                    {key === "calories" ? "kcal" : key === "proteins" ? "pro" : key === "carbs" ? "crb" : "fat"}
                                  </label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={editFields[key]}
                                    onChange={(e) => setEditFields((f) => ({ ...f, [key]: e.target.value }))}
                                    className={IN + " h-8 text-sm w-full px-2 tabular-nums"}
                                    data-testid={`input-edit-${key}`}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={commitEdit}
                                disabled={updateMeal.isPending}
                                data-testid="button-confirm-edit"
                                className="flex items-center gap-1 bg-[#1C1714] text-[#F2EDE7] px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-[#1C1714]/80 transition-colors disabled:opacity-40"
                              >
                                <Check className="h-3 w-3" /> Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingMeal(null)}
                                data-testid="button-cancel-edit"
                                className="flex items-center gap-1 border border-[#1C1714]/30 px-3 py-1.5 text-[10px] uppercase tracking-widest hover:border-[#1C1714] transition-colors"
                              >
                                <X className="h-3 w-3" /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group flex items-center py-2 gap-2 hover:bg-[#1C1714]/3 transition-colors -mx-1 px-1">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs leading-tight truncate">{meal.name}</div>
                            </div>
                            <div className="tabular-nums text-xs shrink-0 opacity-60 mr-1">{meal.calories} kcal</div>
                            <div className="flex gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                type="button"
                                data-testid={`button-edit-journal-meal-${meal.id}`}
                                onClick={() => startEdit(meal)}
                                className="h-6 w-6 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                data-testid={`button-delete-journal-meal-${meal.id}`}
                                onClick={() => deleteMeal.mutate(meal.id)}
                                disabled={deleteMeal.isPending}
                                className="h-6 w-6 flex items-center justify-center opacity-50 hover:opacity-100 hover:text-[#9e4515] transition-all disabled:opacity-30"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-3 border-t-2 border-[#1C1714] mt-3">
                <div className="text-[10px] uppercase tracking-widest opacity-60">Total</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base tabular-nums" data-testid="text-journal-total">{journalTotal.toLocaleString()}</span>
                  <span className="text-[10px] opacity-40">kcal</span>
                  {!isFuture && (
                    <span className={`text-[10px] ml-2 ${journalTotal > goal ? "text-[#9e4515]" : "opacity-40"}`}>
                      {journalTotal > goal ? `+${(journalTotal - goal).toLocaleString()} over` : `${(goal - journalTotal).toLocaleString()} under`} goal
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ══ Weight Projection ══ */}
        <div>
          <div className="border-b-2 border-[#1C1714] pb-4 mb-6">
            <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Weight</p>
            <div className="text-3xl tracking-tighter leading-none">
              {canProject ? "Projection" : "Log Weight"}
            </div>
          </div>

          <div ref={projectionContainerRef}>
              {canProject && projectionChartData.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-5 mb-3 text-[10px] uppercase tracking-widest opacity-50">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#9e4515]" />
                      Projected
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#1C1714]/40" />
                      Goal ({settings?.goalWeightKg} kg)
                    </span>
                    {weights.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-[#1C1714]" />
                        Actual
                      </span>
                    )}
                  </div>
                  <div className="h-52 w-full cursor-pointer">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={projectionChartData}
                        margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
                        onClick={(chartState) => {
                          if (!chartState || chartState.activeTooltipIndex === undefined || chartState.activeTooltipIndex === null) {
                            setSelectedWeekKey(null);
                            return;
                          }
                          const arrIdx = chartState.activeTooltipIndex as number;
                          const point = projectionChartData[arrIdx];
                          if (!point) { setSelectedWeekKey(null); return; }
                          const key = point.weekIdx;
                          setSelectedWeekKey((prev) => (prev === key ? null : key));
                        }}
                      >
                        <CartesianGrid strokeDasharray="none" vertical={false} stroke="#1C1714" strokeOpacity={0.06} />
                        <XAxis
                          dataKey="week"
                          tickLine={false}
                          axisLine={{ stroke: "#1C1714", strokeOpacity: 0.2 }}
                          tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "'Space Mono'" }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={{ stroke: "#1C1714", strokeOpacity: 0.2 }}
                          tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "'Space Mono'" }}
                          width={32}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          {...CHART_TOOLTIP}
                          formatter={(v: number, name: string) => {
                            const labels: Record<string, string> = { projected: "Projected", goal: "Goal", actual: "Actual" };
                            return [`${v?.toFixed(1)} kg`, labels[name] ?? name];
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="projected"
                          stroke="#9e4515"
                          strokeDasharray="5 4"
                          strokeWidth={1.5}
                          dot={(props: { cx?: number; cy?: number; index?: number }) => {
                            const isSelected =
                              props.index !== undefined &&
                              projectionChartData[props.index]?.weekIdx === selectedWeekKey;
                            return (
                              <circle
                                key={`proj-dot-${props.index}`}
                                cx={props.cx}
                                cy={props.cy}
                                r={isSelected ? 5 : 2.5}
                                fill="#9e4515"
                                stroke={isSelected ? "#F2EDE7" : "none"}
                                strokeWidth={isSelected ? 2 : 0}
                              />
                            );
                          }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="goal"
                          stroke="#1C1714"
                          strokeDasharray="4 4"
                          strokeOpacity={0.35}
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls
                        />
                        {weights.length > 0 && (
                          <Line
                            type="monotone"
                            dataKey="actual"
                            stroke="#1C1714"
                            strokeWidth={2}
                            dot={(props: { cx?: number; cy?: number; index?: number }) => {
                              const isSelected =
                                props.index !== undefined &&
                                projectionChartData[props.index]?.weekIdx === selectedWeekKey;
                              return (
                                <circle
                                  key={`actual-dot-${props.index}`}
                                  cx={props.cx}
                                  cy={props.cy}
                                  r={isSelected ? 5 : 3}
                                  fill="#1C1714"
                                  stroke={isSelected ? "#F2EDE7" : "none"}
                                  strokeWidth={isSelected ? 2 : 0}
                                />
                              );
                            }}
                            connectNulls
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {selectedWeekKey !== null && (() => {
                    const point = projectionChartData.find((p) => p.weekIdx === selectedWeekKey);
                    if (!point) return null;
                    return (
                      <div
                        data-testid="panel-week-detail"
                        className="mt-3 border border-[#1C1714] p-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 text-[#1C1714]"
                      >
                        <div>
                          <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">Week</p>
                          <p className="text-base tabular-nums tracking-tight" data-testid="detail-week-label">{point.week}</p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">Projected</p>
                          <p className="text-base tabular-nums tracking-tight" data-testid="detail-projected">{point.projected.toFixed(1)} kg</p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">Actual Avg</p>
                          <p className="text-base tabular-nums tracking-tight opacity-60" data-testid="detail-actual">
                            {point.actual !== undefined ? `${point.actual.toFixed(1)} kg` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">Est. Deficit</p>
                          <p
                            className={`text-base tabular-nums tracking-tight ${point.deficitKcal !== null && point.deficitKcal > 0 ? "opacity-100" : "opacity-60"}`}
                            data-testid="detail-deficit"
                          >
                            {point.deficitKcal !== null
                              ? `${point.deficitKcal > 0 ? "−" : "+"}${Math.abs(point.deficitKcal).toLocaleString()} kcal`
                              : "—"}
                          </p>
                        </div>
                        <button
                          type="button"
                          data-testid="button-close-week-detail"
                          onClick={() => setSelectedWeekKey(null)}
                          className="col-span-2 sm:col-span-4 text-[9px] uppercase tracking-widest opacity-30 hover:opacity-60 transition-opacity text-left mt-1"
                        >
                          Tap to dismiss
                        </button>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="flex items-center justify-center h-40 border border-dashed border-[#1C1714]/20 text-xs opacity-40">
                  Add height, age, sex &amp; goal weight in Settings to see projections.
                </div>
              )}
          </div>
        </div>

        {/* ══ Intake Record ══ */}
        <div>
          <div className="flex flex-col gap-3 border-b-2 border-[#1C1714] pb-4 mb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Intake Record</p>
              <div className="text-3xl tracking-tighter leading-none">Goal vs. Actual</div>
            </div>
            <div className="flex border border-[#1C1714]/30">
              {(["day", "week", "month"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  data-testid={`toggle-period-${p}`}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 text-xs uppercase tracking-widest transition-colors ${
                    period === p ? "bg-[#1C1714] text-[#F2EDE7]" : "opacity-50 hover:opacity-80"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-5 text-[10px] uppercase tracking-widest opacity-60">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#1C1714]" />
              Goal ({goal.toLocaleString()} kcal)
            </span>
            {estimatedTDEE && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#9e4515]" />
                Maintenance ({estimatedTDEE.toLocaleString()} kcal)
              </span>
            )}
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 56, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="none" vertical={false} stroke="#1C1714" strokeOpacity={0.06} />
                <XAxis
                  dataKey={period === "month" ? "shortLabel" : "label"}
                  tickLine={false}
                  axisLine={{ stroke: "#1C1714", strokeOpacity: 0.2 }}
                  tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "'Space Mono'" }}
                  interval={period === "month" ? 6 : 0}
                />
                <YAxis
                  tickLine={false}
                  axisLine={{ stroke: "#1C1714", strokeOpacity: 0.2 }}
                  tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "'Space Mono'" }}
                  width={36}
                  domain={[intakeChartMin, intakeChartMax]}
                />
                <Tooltip {...CHART_TOOLTIP} formatter={(v: number) => [`${v} kcal`]} />
                <ReferenceLine
                  y={goal}
                  stroke="#1C1714"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  label={{ value: "Goal", position: "right", fill: "#1C1714", fontSize: 9, opacity: 0.7 }}
                />
                {estimatedTDEE && (
                  <ReferenceLine
                    y={estimatedTDEE}
                    stroke="#9e4515"
                    strokeDasharray="5 4"
                    strokeWidth={1.5}
                    label={{ value: "Maint.", position: "right", fill: "#9e4515", fontSize: 9, opacity: 0.7 }}
                  />
                )}
                <Bar dataKey="calories" fill="#1C1714" fillOpacity={0.75} radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5 border border-[#1C1714]">
            <div className="grid grid-cols-3 divide-x divide-[#1C1714]/10">
              <div className="px-3 py-4 text-center">
                <p className="text-[9px] uppercase tracking-widest opacity-60 mb-1">Calorie Deficit</p>
                <p className="text-base tabular-nums font-medium" data-testid="text-period-deficit">
                  {Math.abs(periodDeficit).toLocaleString()}
                </p>
                <p className="text-[10px] opacity-40 mt-0.5">{periodDeficit >= 0 ? "deficit" : "surplus"}</p>
              </div>
              <div className="px-3 py-4 text-center">
                <p className="text-[9px] uppercase tracking-widest opacity-60 mb-1">Avg / Day</p>
                <p className="text-base tabular-nums font-medium" data-testid="text-period-avg">
                  {avgPerDay.toLocaleString()}
                </p>
                <p className="text-[10px] opacity-40 mt-0.5">kcal</p>
              </div>
              <div className="px-3 py-4 text-center">
                <p className="text-[9px] uppercase tracking-widest opacity-60 mb-1">Est. Lost</p>
                <p className="text-base tabular-nums font-medium" data-testid="text-period-kg-lost">
                  {estimatedKgLost >= 0 ? estimatedKgLost.toFixed(2) : `+${Math.abs(estimatedKgLost).toFixed(2)}`}
                </p>
                <p className="text-[10px] opacity-40 mt-0.5">kg</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-[10px] uppercase tracking-widest opacity-30">— End of Record —</div>
      </div>
    </AppShell>
  );
}

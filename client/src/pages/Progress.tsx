import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2, TrendingDown } from "lucide-react";
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
  LineChart,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Meal, Settings, Weight } from "@shared/schema";
import { ACTIVITY_MULTIPLIERS, ACTIVITY_LEVEL_LABELS, type ActivityLevel } from "@shared/schema";
import {
  caloriesByMealType,
  computeBMR,
  computeTDEE,
  dailyCaloriesSeries,
  daysSince,
  lastNDates,
  sumMacros,
  todayStr,
  weeklyWeightDeltas,
  weightProjectionSeries,
} from "@/lib/calorieflow";
import { LS } from "@/lib/ledger-styles";

type Period = "day" | "week" | "month";

const MEAL_LABELS: Record<string, string> = {
  breakfast: "BRK",
  lunch: "LCH",
  dinner: "DIN",
  snack: "SNK",
};

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

const CHART_TOOLTIP = {
  contentStyle: {
    border: "1px solid #1C1714",
    borderRadius: 0,
    fontSize: 11,
    background: "#F2EDE7",
    fontFamily: "'Space Mono', monospace",
  },
};

export default function ProgressPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [weightInput, setWeightInput] = useState("");
  const { toast } = useToast();

  const { data: settings, isLoading: sLoading } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: meals = [], isLoading: mLoading } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
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
      toast({
        title: "Failed to log weight",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      }),
  });

  if (sLoading || mLoading) {
    return (
      <AppShell title="Progress">
        <div className={`space-y-4 ${LS.page}`}>
          <Skeleton className="h-80 w-full bg-[#1C1714]/10" />
          <Skeleton className="h-64 w-full bg-[#1C1714]/10" />
        </div>
      </AppShell>
    );
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
  const periodByType = caloriesByMealType(periodMeals);

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

  const actualWeightMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of weights) map.set(w.date, w.weightKg);
    return map;
  }, [weights]);

  const projectionChartData = useMemo(() => {
    if (!canProject || projectionPoints.length === 0) return [];
    const today = todayStr();
    const chartDateSet = new Set<string>();
    projectionPoints.forEach((p, i) => { if (i % 7 === 0) chartDateSet.add(p.date); });
    if (projectionPoints.length > 0) chartDateSet.add(projectionPoints[projectionPoints.length - 1].date);
    actualWeightMap.forEach((_, date) => chartDateSet.add(date));
    const estMap = new Map<string, number>();
    for (const p of projectionPoints) estMap.set(p.date, p.estimatedWeightKg);
    return Array.from(chartDateSet).sort().map((date) => {
      const d = new Date(date + "T00:00:00");
      const isFuture = date > today;
      return {
        date,
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        estimated: isFuture ? estMap.get(date) : undefined,
        actual: actualWeightMap.get(date) ?? undefined,
        goal: settings?.goalWeightKg ?? undefined,
      };
    });
  }, [projectionPoints, actualWeightMap, settings, canProject]);

  const actualWeightChartData = useMemo(() => {
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((w) => {
      const d = new Date(w.date + "T00:00:00");
      return {
        date: w.date,
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        weight: w.weightKg,
      };
    });
  }, [weights]);

  const weightProgressPct = useMemo(() => {
    if (!settings?.startingWeightKg || !settings?.goalWeightKg || currentEstimatedWeight === null) return 0;
    const total = Math.abs(settings.startingWeightKg - settings.goalWeightKg);
    const done = Math.abs(settings.startingWeightKg - currentEstimatedWeight);
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }, [settings, currentEstimatedWeight]);

  const recentAvgCalories = useMemo(() => {
    const last7 = lastNDates(7);
    const logged = last7.filter((d) => meals.some((m) => m.date === d));
    if (logged.length === 0) return 0;
    return Math.round(
      logged.reduce(
        (sum, d) => sum + meals.filter((m) => m.date === d).reduce((s, m) => s + m.calories, 0),
        0,
      ) / logged.length,
    );
  }, [meals]);

  const estimatedTDEE = useMemo(() => {
    if (!settings?.heightCm || !settings?.ageYears || !settings?.sexAtBirth || !settings?.startingWeightKg)
      return null;
    const sex = settings.sexAtBirth;
    if (sex !== "male" && sex !== "female") return null;
    const bmr = computeBMR(settings.startingWeightKg, settings.heightCm, settings.ageYears, sex);
    const multiplier = ACTIVITY_MULTIPLIERS[(settings.activityLevel as ActivityLevel) ?? "sedentary"] ?? 1.2;
    return Math.round(computeTDEE(bmr, multiplier));
  }, [settings]);

  const goalBasedProjectedDate = useMemo(() => {
    if (!canProject || !currentEstimatedWeight || !settings || !estimatedTDEE) return null;
    const goalWeight = settings.goalWeightKg!;
    const remainingWeight = Math.abs(currentEstimatedWeight - goalWeight);
    if (remainingWeight <= 0) return todayStr();
    const dailyDeficit = estimatedTDEE - goal;
    if (Math.abs(dailyDeficit) < 10) return null;
    const daysToGoal = Math.ceil((remainingWeight * 7700) / Math.abs(dailyDeficit));
    const d = new Date(todayStr() + "T00:00:00");
    d.setDate(d.getDate() + daysToGoal);
    return d.toISOString().slice(0, 10);
  }, [canProject, currentEstimatedWeight, settings, estimatedTDEE, goal]);

  const weightDeltas = weeklyWeightDeltas(weights, settings);
  const totalLoss = weightDeltas.reduce((a, d) => a + d.delta, 0);
  const activityLabel = settings?.activityLevel
    ? ACTIVITY_LEVEL_LABELS[settings.activityLevel as ActivityLevel]
    : null;

  return (
    <AppShell title="Progress">
      <div className={LS.page}>

        {/* ══ ROW 1: Calorie chart + Journey/Goal pane ══ */}
        <div className={`grid grid-cols-1 gap-0 ${LS.sectionCard} xl:grid-cols-[1fr_300px]`}>

          {/* Left: calorie chart */}
          <div className="border-b border-[#1C1714]/20 xl:border-b-0 xl:border-r xl:border-[#1C1714]/20">
            <div className="flex flex-col gap-3 border-b border-[#1C1714]/20 p-6 md:flex-row md:items-center md:justify-between md:p-8">
              <div>
                <p className={LS.label}>Calorie Intake</p>
                <h3 className={LS.subheading}>Goal vs. Actual</h3>
              </div>
              {/* Period toggle */}
              <div className="flex border border-[#1C1714]/30 font-['Space_Mono']">
                {(["day", "week", "month"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    data-testid={`toggle-period-${p}`}
                    onClick={() => setPeriod(p)}
                    className={`px-4 py-2 text-[10px] uppercase tracking-widest transition-colors ${
                      period === p
                        ? "bg-[#1C1714] text-[#F2EDE7]"
                        : "text-[#1C1714] opacity-60 hover:opacity-100"
                    }`}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 md:p-8">
              {estimatedTDEE && (
                <div className="mb-4 flex flex-wrap items-center gap-5 text-[10px] uppercase tracking-widest opacity-60">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-[2px] w-5 border-t-2 border-dashed border-[#1C1714]" />
                    Goal ({goal.toLocaleString()} kcal)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-[2px] w-5 border-t-2 border-dashed border-[#9B4A2E]" />
                    Maintenance ({estimatedTDEE.toLocaleString()} kcal)
                  </span>
                </div>
              )}
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 60, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="none" vertical={false} stroke="#1C1714" strokeOpacity={0.06} strokeWidth={1} />
                    <XAxis
                      dataKey={period === "month" ? "shortLabel" : "label"}
                      tickLine={false}
                      axisLine={{ stroke: "#1C1714", strokeWidth: 1, strokeOpacity: 0.3 }}
                      tick={{ fill: "#1C1714", fontSize: 10, opacity: 0.5, fontFamily: "Space Mono" }}
                      interval={period === "month" ? 6 : 0}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: "#1C1714", strokeWidth: 1, strokeOpacity: 0.3 }}
                      tick={{ fill: "#1C1714", fontSize: 10, opacity: 0.5, fontFamily: "Space Mono" }}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{ border: "1px solid #1C1714", borderRadius: 0, fontSize: 11, background: "#F2EDE7", fontFamily: "Space Mono" }}
                      formatter={(v: number) => [`${v} kcal`]}
                    />
                    <ReferenceLine
                      y={goal}
                      stroke="#1C1714"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      label={{ value: "Goal", position: "right", fill: "#1C1714", fontSize: 10, opacity: 0.6 }}
                    />
                    {estimatedTDEE && (
                      <ReferenceLine
                        y={estimatedTDEE}
                        stroke="#9B4A2E"
                        strokeDasharray="5 4"
                        strokeWidth={1.5}
                        label={{ value: "Maint.", position: "right", fill: "#9B4A2E", fontSize: 10 }}
                      />
                    )}
                    <Bar dataKey="calories" fill="#1C1714" radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Stats grid */}
              <div className="mt-5 border border-[#1C1714]/20">
                <div className="grid grid-cols-3 divide-x divide-[#1C1714]/20 border-b border-[#1C1714]/20 md:grid-cols-5">
                  {[
                    { label: "Total kcal", value: periodTotals.calories.toLocaleString(), testid: "text-period-total" },
                    { label: "Avg / day", value: avgPerDay.toLocaleString(), testid: "text-period-avg" },
                    { label: "Protein", value: `${Math.round(periodTotals.proteins)}g`, testid: "text-period-protein" },
                    { label: "Carbs", value: `${Math.round(periodTotals.carbs)}g`, testid: "text-period-carbs" },
                    { label: "Fats", value: `${Math.round(periodTotals.fats)}g`, testid: "text-period-fats" },
                  ].map((s, i) => (
                    <div key={s.label} className={`px-3 py-2.5 text-center ${i >= 3 ? "hidden md:block" : ""}`}>
                      <p className="text-[9px] uppercase tracking-[1.5px] opacity-50">{s.label}</p>
                      <p className="mt-0.5 text-sm tabular-nums" data-testid={s.testid}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-4 divide-x divide-[#1C1714]/20">
                  {(["breakfast", "lunch", "dinner", "snack"] as const).map((type) => (
                    <div key={type} className="px-2 py-2 text-center">
                      <p className="text-[9px] uppercase tracking-wider opacity-50">{MEAL_LABELS[type]}</p>
                      <p className="mt-0.5 text-xs tabular-nums" data-testid={`text-period-${type}`}>
                        {(periodByType[type] || 0).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </div>
          </div>

          {/* Right: Journey + Goal summary — warm palette */}
          <div className="flex flex-col">
            {/* Progress bar header */}
            <div className="border-b border-[#1C1714]/20 p-6 md:p-8">
              <div className="flex items-start justify-between">
                <div>
                  <p className={LS.label}>Journey</p>
                  <p className="mt-1 text-2xl tracking-tighter" data-testid="text-journey-day">
                    Day {String(dayNum).padStart(2, "0")}
                  </p>
                </div>
                {canProject && settings?.goalWeightKg && (
                  <div className="text-right">
                    <p className={LS.label}>Goal</p>
                    <p className="mt-1 text-sm tabular-nums">{settings.goalWeightKg} kg</p>
                  </div>
                )}
              </div>
              {canProject && currentEstimatedWeight !== null ? (
                <>
                  <div className="mt-4 h-1.5 w-full bg-[#1C1714]/10">
                    <div
                      className="h-full bg-[#1C1714] transition-all"
                      style={{ width: `${weightProgressPct}%` }}
                      data-testid="bar-goal-progress"
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] uppercase tracking-widest opacity-50">
                    <span className="opacity-100">{weightProgressPct}%</span> toward goal
                  </p>
                </>
              ) : (
                <p className="mt-3 text-xs opacity-50">Keep logging to track your progress.</p>
              )}
            </div>

            {/* Estimated weight + inline log */}
            <div className="border-b border-[#1C1714]/20 p-6 md:p-8">
              {canProject && currentEstimatedWeight !== null ? (
                <>
                  <p className={LS.label}>Estimated Weight</p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-4xl tracking-tighter tabular-nums" data-testid="text-estimated-weight">
                      {currentEstimatedWeight.toFixed(1)}
                    </span>
                    <span className="mb-1 text-lg opacity-50">kg</span>
                  </div>
                  {activityLabel && (
                    <p className="mt-0.5 text-[10px] uppercase tracking-widest opacity-40">{activityLabel}</p>
                  )}
                  {/* Inline weight log */}
                  <form
                    className="mt-4 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const kg = parseFloat(weightInput);
                      if (!isNaN(kg) && kg > 0) addWeight.mutate(kg);
                    }}
                  >
                    <input
                      data-testid="input-weight"
                      type="number"
                      step="0.1"
                      value={weightInput}
                      onChange={(e) => setWeightInput(e.target.value)}
                      placeholder="Log real weight (kg)"
                      className="flex-1 min-w-0 rounded-none border border-[#1C1714]/30 bg-transparent px-3 py-2 text-sm font-['Space_Mono'] text-[#1C1714] placeholder:opacity-40 focus:border-[#1C1714] focus:outline-none tabular-nums"
                    />
                    <button
                      type="submit"
                      data-testid="button-log-weight"
                      disabled={addWeight.isPending || !weightInput}
                      className="shrink-0 border border-[#1C1714] px-4 py-2 text-xs uppercase tracking-widest font-['Space_Mono'] hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors disabled:opacity-40"
                    >
                      {addWeight.isPending ? "…" : "Log"}
                    </button>
                  </form>
                  <p className="mt-1.5 text-[10px] opacity-40">
                    Logging anchors the projection to your real weight.
                  </p>
                </>
              ) : (
                <div>
                  <p className="text-xs opacity-60">
                    Add height, age, sex &amp; goal weight in Settings to see your estimated weight.
                  </p>
                  <Link href="/settings">
                    <button
                      data-testid="button-go-to-settings"
                      className="mt-3 flex items-center gap-1.5 border border-[#1C1714]/40 px-4 py-2 text-xs uppercase tracking-widest font-['Space_Mono'] hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors"
                    >
                      <Settings2 className="h-3.5 w-3.5" /> Open Settings
                    </button>
                  </Link>
                </div>
              )}
            </div>

            {/* Projected goal dates */}
            <div className="flex-1 p-6 md:p-8">
              {(projectedGoalDate || goalBasedProjectedDate) ? (
                <>
                  <p className={LS.label}>Projected Goal Date</p>

                  <div className="mt-3 grid grid-cols-2 gap-0 border border-[#1C1714]/20">
                    <div className="border-r border-[#1C1714]/20 p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-50">
                        <TrendingDown className="h-3 w-3" />
                        Your pace
                      </div>
                      {projectedGoalDate ? (
                        <>
                          <p className="mt-1.5 text-sm leading-tight" data-testid="text-goal-date">
                            {relativeTime(projectedGoalDate)}
                          </p>
                          <p className="mt-0.5 text-[10px] leading-tight opacity-50">
                            {formatGoalDate(projectedGoalDate)}
                          </p>
                          {recentAvgCalories > 0 && (
                            <p className="mt-2 text-[10px] opacity-40 tabular-nums">
                              avg {recentAvgCalories.toLocaleString()} kcal/day
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-1.5 text-xs opacity-50">Log meals to see</p>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-50">
                        <TrendingDown className="h-3 w-3" />
                        At your goal
                      </div>
                      {goalBasedProjectedDate ? (
                        <>
                          <p className="mt-1.5 text-sm leading-tight" data-testid="text-goal-based-date">
                            {relativeTime(goalBasedProjectedDate)}
                          </p>
                          <p className="mt-0.5 text-[10px] leading-tight opacity-50">
                            {formatGoalDate(goalBasedProjectedDate)}
                          </p>
                          <p className="mt-2 text-[10px] opacity-40 tabular-nums">
                            eating {goal.toLocaleString()} kcal/day
                          </p>
                        </>
                      ) : (
                        <p className="mt-1.5 text-xs opacity-50">Set up body metrics</p>
                      )}
                    </div>
                  </div>

                  {estimatedTDEE && (
                    <div className="mt-4 border-t border-[#1C1714]/20 pt-4 space-y-1.5">
                      {[
                        { label: "Maintenance", value: `${estimatedTDEE.toLocaleString()} kcal/day` },
                        { label: "Your goal", value: `${goal.toLocaleString()} kcal/day` },
                        { label: "Daily deficit", value: `${Math.abs(estimatedTDEE - goal).toLocaleString()} kcal` },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-widest opacity-50">{label}</p>
                          <p className="text-xs tabular-nums">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : canProject ? (
                <p className="text-xs opacity-50">Not enough data to project yet.</p>
              ) : (
                <p className="text-xs opacity-60">
                  Total change:{" "}
                  <span className="opacity-100 tabular-nums">
                    {totalLoss > 0 ? "+" : ""}
                    {totalLoss.toFixed(1)} kg
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ══ ROW 2: Two weight charts ══ */}
        <div className={`mt-6 grid grid-cols-1 gap-0 ${LS.sectionCard} md:grid-cols-2`}>

          {/* Chart A: Future Projection */}
          <div className="border-b border-[#1C1714]/20 md:border-b-0 md:border-r md:border-[#1C1714]/20">
            <div className="border-b border-[#1C1714]/20 p-5 md:p-6">
              <p className={LS.label}>Weight Chart</p>
              <h3 className={`${LS.subheading} text-base`}>Future Projection</h3>
              {canProject && projectedGoalDate && (
                <p className="mt-0.5 text-[10px] opacity-50">
                  Projected to reach {settings?.goalWeightKg} kg — {relativeTime(projectedGoalDate)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4 border-b border-[#1C1714]/20 px-5 py-2.5 text-[10px] uppercase tracking-widest opacity-50 md:px-6">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-5 bg-[#1C1714]" /> Projected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[2px] w-5 border-t-2 border-dashed border-[#B5A89A]" /> Goal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 bg-[#9B4A2E]" /> Actual
              </span>
            </div>
            <div className="p-5 md:p-6">
              {canProject && projectionChartData.length > 0 ? (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={projectionChartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="none" vertical={false} stroke="#1C1714" strokeOpacity={0.06} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={{ stroke: "#1C1714", strokeWidth: 1, strokeOpacity: 0.3 }}
                        tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "Space Mono" }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={{ stroke: "#1C1714", strokeWidth: 1, strokeOpacity: 0.3 }}
                        tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "Space Mono" }}
                        width={36}
                        tickFormatter={(v: number) => `${v.toFixed(0)}`}
                        domain={["dataMin - 2", "dataMax + 2"]}
                      />
                      <Tooltip
                        contentStyle={{ border: "1px solid #1C1714", borderRadius: 0, fontSize: 11, background: "#F2EDE7", fontFamily: "Space Mono" }}
                        formatter={(value: number, name: string) => [
                          `${Number(value).toFixed(1)} kg`,
                          name === "estimated" ? "Projected" : name === "actual" ? "Actual" : "Goal",
                        ]}
                      />
                      <Line type="monotone" dataKey="estimated" stroke="#1C1714" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                      <Line type="monotone" dataKey="goal" stroke="#B5A89A" strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={false} />
                      <Line type="monotone" dataKey="actual" stroke="#9B4A2E" strokeWidth={0} dot={{ r: 5, fill: "#9B4A2E", strokeWidth: 1.5, stroke: "#F2EDE7" }} activeDot={{ r: 6, fill: "#9B4A2E" }} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : !canProject ? (
                <div className="flex h-40 items-center justify-center border border-dashed border-[#1C1714]/20">
                  <div className="text-center">
                    <p className="text-xs opacity-60">Set up body metrics to see projection</p>
                    <Link href="/settings">
                      <button className="mt-2 flex items-center gap-1.5 border border-[#1C1714]/30 px-4 py-1.5 text-[10px] uppercase tracking-widest font-['Space_Mono'] hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors mx-auto">
                        <Settings2 className="h-3 w-3" /> Open Settings
                      </button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-xs opacity-40">
                  Not enough data to project yet.
                </div>
              )}
            </div>
          </div>

          {/* Chart B: Actual Progress */}
          <div>
            <div className="border-b border-[#1C1714]/20 p-5 md:p-6">
              <p className={LS.label}>Weight Chart</p>
              <h3 className={`${LS.subheading} text-base`}>Actual Progress</h3>
              <p className="mt-0.5 text-[10px] opacity-50">
                {weights.length > 0
                  ? `${weights.length} weight log${weights.length !== 1 ? "s" : ""} recorded`
                  : "No weight entries yet"}
              </p>
            </div>
            <div className="border-b border-[#1C1714]/20 px-5 py-2.5 text-[10px] uppercase tracking-widest opacity-50 md:px-6">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-5 bg-[#9B4A2E]" /> Logged Weight
              </span>
            </div>
            <div className="p-5 md:p-6">
              {actualWeightChartData.length >= 2 ? (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={actualWeightChartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="none" vertical={false} stroke="#1C1714" strokeOpacity={0.06} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={{ stroke: "#1C1714", strokeWidth: 1, strokeOpacity: 0.3 }}
                        tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "Space Mono" }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={{ stroke: "#1C1714", strokeWidth: 1, strokeOpacity: 0.3 }}
                        tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "Space Mono" }}
                        width={36}
                        tickFormatter={(v: number) => `${v.toFixed(0)}`}
                        domain={["dataMin - 1", "dataMax + 1"]}
                      />
                      <Tooltip
                        contentStyle={{ border: "1px solid #1C1714", borderRadius: 0, fontSize: 11, background: "#F2EDE7", fontFamily: "Space Mono" }}
                        formatter={(v: number) => [`${v.toFixed(1)} kg`, "Weight"]}
                      />
                      {settings?.goalWeightKg && (
                        <ReferenceLine
                          y={settings.goalWeightKg}
                          stroke="#B5A89A"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          label={{ value: "Goal", position: "right", fill: "#1C1714", fontSize: 9, opacity: 0.5 }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="#9B4A2E"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#9B4A2E", strokeWidth: 1.5, stroke: "#F2EDE7" }}
                        activeDot={{ r: 5, fill: "#9B4A2E" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-52 flex-col items-center justify-center border border-dashed border-[#1C1714]/20">
                  <p className="text-xs opacity-60">
                    {actualWeightChartData.length === 1 ? "Log one more weight to see a trend" : "No weight logs yet"}
                  </p>
                  <p className="mt-1 text-[10px] opacity-40">Use the field above to log your weight</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ ROW 3: Weight history ══ */}
        <div className={`mt-6 ${LS.sectionCard}`}>
          <div className="border-b border-[#1C1714]/20 p-6 md:p-8">
            <p className={LS.label}>Weight History</p>
            <div className="mt-1 flex items-end gap-2">
              <span className={`text-4xl tracking-tighter tabular-nums ${totalLoss <= 0 ? "" : "text-[#9B4A2E]"}`}>
                {totalLoss > 0 ? "+" : ""}
                {totalLoss.toFixed(1)}
              </span>
              <span className="mb-1 text-lg opacity-50">kg total</span>
            </div>
          </div>
          <div className="p-6 md:p-8">
            {weightDeltas.length === 0 ? (
              <p className="text-xs opacity-50">Log your weight above to start tracking weekly changes.</p>
            ) : (
              weightDeltas.map((item, i) => (
                <div key={item.week}>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-xs uppercase tracking-widest opacity-60">{item.week}</span>
                    <span
                      className={`text-sm tabular-nums ${item.delta <= 0 ? "" : "text-[#9B4A2E]"}`}
                      data-testid={`text-week-${i}`}
                    >
                      {item.delta > 0 ? "+" : ""}
                      {item.delta.toFixed(1)} kg
                    </span>
                  </div>
                  {i < weightDeltas.length - 1 && (
                    <div className="border-t border-[#1C1714]/10" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </AppShell>
  );
}

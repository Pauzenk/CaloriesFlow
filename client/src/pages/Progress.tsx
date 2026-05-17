import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
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
      toast({
        title: "Failed to log weight",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      }),
  });

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
      <div className="w-full font-['Space_Mono'] text-[#1C1714] space-y-10">

        {/* ══ ROW 1: Two-column — Calorie intake | Journey account ══ */}
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[1fr_320px]">

          {/* ── Left: Calorie intake ── */}
          <div>
            <div className="flex flex-col gap-3 border-b-2 border-[#1C1714] pb-4 mb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Intake Record</p>
                <div className="text-3xl tracking-tighter leading-none">Goal vs. Actual</div>
              </div>
              {/* Period toggle */}
              <div className="flex border border-[#1C1714]/30">
                {(["day", "week", "month"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    data-testid={`toggle-period-${p}`}
                    onClick={() => setPeriod(p)}
                    className={`px-4 py-2 text-xs uppercase tracking-widest transition-colors ${
                      period === p
                        ? "bg-[#1C1714] text-[#F2EDE7]"
                        : "opacity-50 hover:opacity-80"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart legend */}
            {estimatedTDEE && (
              <div className="mb-3 flex flex-wrap gap-5 text-[10px] uppercase tracking-widest opacity-60">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#1C1714]" />
                  Goal ({goal.toLocaleString()} kcal)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#9e4515]" />
                  Maint. ({estimatedTDEE.toLocaleString()} kcal)
                </span>
              </div>
            )}

            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 60, left: 0, bottom: 4 }}>
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
                  />
                  <Tooltip {...CHART_TOOLTIP} formatter={(v: number) => [`${v} kcal`]} />
                  <ReferenceLine
                    y={goal} stroke="#1C1714" strokeDasharray="5 4" strokeWidth={1.5}
                    label={{ value: "Goal", position: "right", fill: "#1C1714", fontSize: 9, opacity: 0.7 }}
                  />
                  {estimatedTDEE && (
                    <ReferenceLine
                      y={estimatedTDEE} stroke="#9e4515" strokeDasharray="5 4" strokeWidth={1.5}
                      label={{ value: "Maint.", position: "right", fill: "#9e4515", fontSize: 9 }}
                    />
                  )}
                  <Bar dataKey="calories" fill="#1C1714" fillOpacity={0.75} radius={0} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Stats ledger */}
            <div className="mt-5 border border-[#1C1714]">
              <div className="grid grid-cols-3 border-b border-[#1C1714]/20 md:grid-cols-5">
                {[
                  { label: "Total kcal", value: periodTotals.calories.toLocaleString(), testid: "text-period-total" },
                  { label: "Avg / day", value: avgPerDay.toLocaleString(), testid: "text-period-avg" },
                  { label: "PRO", value: `${Math.round(periodTotals.proteins)}g`, testid: "text-period-protein" },
                  { label: "CRB", value: `${Math.round(periodTotals.carbs)}g`, testid: "text-period-carbs" },
                  { label: "FAT", value: `${Math.round(periodTotals.fats)}g`, testid: "text-period-fats" },
                ].map((s, i) => (
                  <div key={s.label} className={`px-3 py-2.5 text-center border-r border-[#1C1714]/10 last:border-r-0 ${i >= 3 ? "hidden md:block" : ""}`}>
                    <p className="text-[9px] uppercase tracking-widest opacity-50">{s.label}</p>
                    <p className="mt-0.5 text-sm tabular-nums" data-testid={s.testid}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4">
                {(["breakfast", "lunch", "dinner", "snack"] as const).map((type) => (
                  <div key={type} className="px-2 py-2 text-center border-r border-[#1C1714]/10 last:border-r-0">
                    <p className="text-[9px] uppercase tracking-widest opacity-50">{MEAL_LABELS[type]}</p>
                    <p className="mt-0.5 text-xs tabular-nums" data-testid={`text-period-${type}`}>
                      {(periodByType[type] || 0).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: Journey account ── */}
          <div className="flex flex-col gap-6">

            {/* Day count + goal progress */}
            <div className="border border-[#1C1714] p-5">
              <div className="flex items-start justify-between mb-4 pb-3 border-b border-dashed border-[#1C1714]/20">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Journey</p>
                  <p className="text-4xl tabular-nums tracking-tighter leading-none" data-testid="text-journey-day">
                    Day {dayNum}
                  </p>
                </div>
                {canProject && settings?.goalWeightKg && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Goal</p>
                    <p className="text-lg tabular-nums">{settings.goalWeightKg} kg</p>
                  </div>
                )}
              </div>
              {canProject && currentEstimatedWeight !== null ? (
                <>
                  <div className="h-1 w-full bg-[#1C1714]/10">
                    <div
                      className="h-full bg-[#1C1714] transition-all"
                      style={{ width: `${weightProgressPct}%` }}
                      data-testid="bar-goal-progress"
                    />
                  </div>
                  <p className="mt-1.5 text-xs opacity-60">
                    <span className="font-bold opacity-100">{weightProgressPct}%</span> toward goal
                  </p>
                </>
              ) : (
                <p className="text-xs opacity-50">Keep logging to track your progress.</p>
              )}
            </div>

            {/* Estimated weight + log */}
            <div className="border border-[#1C1714] p-5">
              {canProject && currentEstimatedWeight !== null ? (
                <>
                  <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Estimated Weight</p>
                  <div className="flex items-end gap-1.5 mb-0.5">
                    <span className="text-4xl tabular-nums tracking-tighter" data-testid="text-estimated-weight">
                      {currentEstimatedWeight.toFixed(1)}
                    </span>
                    <span className="text-lg opacity-50 mb-0.5">kg</span>
                  </div>
                  {activityLabel && (
                    <p className="text-[10px] opacity-40 mb-3">{activityLabel}</p>
                  )}
                  <form
                    className="flex gap-2 mt-3 pt-3 border-t border-dashed border-[#1C1714]/20"
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
                      placeholder="Log actual weight (kg)"
                      className="rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1714] placeholder:opacity-40 h-9 text-sm"
                    />
                    <button
                      type="submit"
                      data-testid="button-log-weight"
                      disabled={addWeight.isPending || !weightInput}
                      className="shrink-0 border border-[#1C1714] px-4 text-xs uppercase tracking-widest hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors disabled:opacity-40"
                    >
                      {addWeight.isPending ? "…" : "Log"}
                    </button>
                  </form>
                  <p className="mt-1.5 text-[10px] opacity-30">Anchors projection to real weight.</p>
                </>
              ) : (
                <div>
                  <p className="text-xs opacity-60 mb-3">Add height, age, sex &amp; goal weight in Settings to see your estimated weight.</p>
                  <Link href="/settings">
                    <button
                      data-testid="button-go-to-settings"
                      className="flex items-center gap-1.5 text-xs uppercase tracking-widest border border-[#1C1714]/30 px-4 py-2 hover:border-[#1C1714] hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors"
                    >
                      <Settings2 className="h-3.5 w-3.5" /> Open Settings
                    </button>
                  </Link>
                </div>
              )}
            </div>

            {/* Projected goal dates */}
            {(projectedGoalDate || goalBasedProjectedDate) && (
              <div className="border border-[#1C1714] p-5">
                <p className="text-[10px] uppercase tracking-widest opacity-60 mb-3 pb-2 border-b border-dashed border-[#1C1714]/20">
                  Projected Goal Date
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest opacity-50 mb-2">
                      <TrendingDown className="h-3 w-3" /> Your pace
                    </div>
                    {projectedGoalDate ? (
                      <>
                        <p className="text-base leading-tight" data-testid="text-goal-date">
                          {relativeTime(projectedGoalDate)}
                        </p>
                        <p className="text-[10px] opacity-50 mt-0.5">{formatGoalDate(projectedGoalDate)}</p>
                        {recentAvgCalories > 0 && (
                          <p className="text-[9px] opacity-30 mt-1.5">avg {recentAvgCalories.toLocaleString()} kcal/d</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs opacity-40">Log meals to see</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest opacity-50 mb-2">
                      <TrendingDown className="h-3 w-3" /> At goal
                    </div>
                    {goalBasedProjectedDate ? (
                      <>
                        <p className="text-base leading-tight" data-testid="text-goal-based-date">
                          {relativeTime(goalBasedProjectedDate)}
                        </p>
                        <p className="text-[10px] opacity-50 mt-0.5">{formatGoalDate(goalBasedProjectedDate)}</p>
                        <p className="text-[9px] opacity-30 mt-1.5">eating {goal.toLocaleString()} kcal/d</p>
                      </>
                    ) : (
                      <p className="text-xs opacity-40">—</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══ ROW 2: Weight charts ══ */}
        {(projectionChartData.length > 0 || actualWeightChartData.length > 0) && (
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">

            {/* Projection chart */}
            {projectionChartData.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-widest opacity-60 mb-3 pb-2 border-b border-[#1C1714]/20">
                  Weight Projection
                </div>
                <div className="flex flex-wrap gap-4 mb-3 text-[10px] uppercase tracking-widest opacity-50">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#9e4515]" />
                    Projected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 border border-[#1C1714]" />
                    Actual
                  </span>
                  {settings?.goalWeightKg && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#1C1714]/40" />
                      Goal
                    </span>
                  )}
                </div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={projectionChartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="none" vertical={false} stroke="#1C1714" strokeOpacity={0.06} />
                      <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#1C1714", strokeOpacity: 0.2 }}
                        tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "'Space Mono'" }}
                        interval="preserveStartEnd" />
                      <YAxis tickLine={false} axisLine={{ stroke: "#1C1714", strokeOpacity: 0.2 }}
                        tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "'Space Mono'" }}
                        width={32} domain={["auto", "auto"]} />
                      <Tooltip {...CHART_TOOLTIP} formatter={(v: number) => [`${v?.toFixed(1)} kg`]} />
                      {settings?.goalWeightKg && (
                        <ReferenceLine y={settings.goalWeightKg} stroke="#1C1714" strokeDasharray="4 4" strokeOpacity={0.3} />
                      )}
                      <Line type="monotone" dataKey="estimated" stroke="#9e4515" strokeDasharray="5 4"
                        strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="monotone" dataKey="actual" stroke="#1C1714" strokeWidth={2}
                        dot={{ fill: "#1C1714", r: 3, strokeWidth: 0 }} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Actual weight chart */}
            {actualWeightChartData.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-widest opacity-60 mb-3 pb-2 border-b border-[#1C1714]/20">
                  Logged Weight
                </div>
                <div className="h-48 w-full mt-7">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={actualWeightChartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="none" vertical={false} stroke="#1C1714" strokeOpacity={0.06} />
                      <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#1C1714", strokeOpacity: 0.2 }}
                        tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "'Space Mono'" }}
                        interval="preserveStartEnd" />
                      <YAxis tickLine={false} axisLine={{ stroke: "#1C1714", strokeOpacity: 0.2 }}
                        tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "'Space Mono'" }}
                        width={32} domain={["auto", "auto"]} />
                      <Tooltip {...CHART_TOOLTIP} formatter={(v: number) => [`${v?.toFixed(1)} kg`]} />
                      <Line type="monotone" dataKey="weight" stroke="#1C1714" strokeWidth={2}
                        dot={{ fill: "#1C1714", r: 3, strokeWidth: 0 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ ROW 3: Weight history ledger ══ */}
        <div>
          <div className="border-b-2 border-[#1C1714] pb-4 mb-6">
            <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Weight History</p>
            <div className="flex items-end gap-2">
              <span
                className={`text-4xl tabular-nums tracking-tighter leading-none ${totalLoss <= 0 ? "" : "text-[#9e4515]"}`}
              >
                {totalLoss > 0 ? "+" : ""}
                {totalLoss.toFixed(1)}
              </span>
              <span className="text-lg opacity-50 mb-0.5">kg total</span>
            </div>
          </div>
          {weightDeltas.length === 0 ? (
            <p className="text-xs opacity-40 py-4">Log your weight above to start tracking weekly changes.</p>
          ) : (
            <div>
              {weightDeltas.map((item, i) => (
                <div
                  key={item.week}
                  className="flex items-center justify-between py-3 border-b border-[#1C1714]/10 hover:border-[#1C1714]/40 transition-colors"
                >
                  <span className="text-xs uppercase tracking-widest opacity-60">{item.week}</span>
                  <span
                    className={`text-sm tabular-nums ${item.delta <= 0 ? "" : "text-[#9e4515]"}`}
                    data-testid={`text-week-${i}`}
                  >
                    {item.delta > 0 ? "+" : ""}
                    {item.delta.toFixed(1)} kg
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-6 text-center text-[10px] uppercase tracking-widest opacity-30">— End of Record —</div>
        </div>

      </div>
    </AppShell>
  );
}

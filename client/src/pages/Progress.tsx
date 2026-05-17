import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function relativeTime(dateStr: string): string {
  const today = new Date();
  const target = new Date(dateStr + "T00:00:00");
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Goal reached!";
  if (diffDays < 7) return `In ${diffDays} day${diffDays !== 1 ? "s" : ""}`;
  if (diffDays < 30) return `In ~${Math.round(diffDays / 7)} weeks`;
  const months = Math.round(diffDays / 30);
  return `In ~${months} month${months !== 1 ? "s" : ""}`;
}

function formatGoalDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

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
      toast({ title: "Weight logged — estimates updated" });
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
    () => (settings ? weightProjectionSeries(settings, meals, weights) : { points: [], projectedGoalDate: null }),
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
      return { date: w.date, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), weight: w.weightKg };
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
      logged.reduce((sum, d) => sum + meals.filter((m) => m.date === d).reduce((s, m) => s + m.calories, 0), 0) /
        logged.length,
    );
  }, [meals]);

  const estimatedTDEE = useMemo(() => {
    if (!settings?.heightCm || !settings?.ageYears || !settings?.sexAtBirth || !settings?.startingWeightKg) return null;
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
  const activityLabel = settings?.activityLevel ? ACTIVITY_LEVEL_LABELS[settings.activityLevel as ActivityLevel] : null;

  return (
    <AppShell title="Progress">
      <div className="font-['Space_Mono'] text-[#1A1B2E] space-y-0">

        {/* ══ ROW 1: Calorie chart + Journey panel ══ */}
        <div className="grid grid-cols-1 gap-0 border border-[#1A1B2E] xl:grid-cols-[1fr_300px]">

          {/* Left: calorie chart */}
          <div className="border-b border-[#1A1B2E] xl:border-b-0 xl:border-r xl:border-[#1A1B2E]">
            {/* header */}
            <div className="flex flex-col gap-3 border-b border-[#1A1B2E]/20 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <p className="text-xs uppercase tracking-widest opacity-60">Calorie Intake</p>
              <ToggleGroup
                type="single"
                value={period}
                onValueChange={(v) => v && setPeriod(v as Period)}
                className="h-8 border border-[#1A1B2E]/30 p-0.5"
              >
                {(["day", "week", "month"] as const).map((p) => (
                  <ToggleGroupItem
                    key={p}
                    value={p}
                    data-testid={`toggle-period-${p}`}
                    className="h-7 px-3 text-[10px] uppercase tracking-widest opacity-50 data-[state=on]:opacity-100 data-[state=on]:bg-[#1A1B2E] data-[state=on]:text-[#F0EEF8]"
                  >
                    {p}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="px-6 py-5">
              {estimatedTDEE && (
                <div className="mb-4 flex flex-wrap items-center gap-5 text-[10px] uppercase tracking-widest opacity-50">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-[2px] w-5 border-t-2 border-dashed border-[#6B5FC0]" />
                    Goal ({goal.toLocaleString()} kcal)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-[2px] w-5 border-t-2 border-dashed border-[#6B5FC0]/40" />
                    Maint. ({estimatedTDEE.toLocaleString()} kcal)
                  </span>
                </div>
              )}
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 60, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="none" vertical={false} stroke="#E4E0F2" strokeWidth={1} />
                    <XAxis
                      dataKey={period === "month" ? "shortLabel" : "label"}
                      tickLine={false}
                      axisLine={{ stroke: "#C8C4E0", strokeWidth: 1 }}
                      tick={{ fill: "#6B6880", fontSize: 9, fontFamily: "Space Mono", fontWeight: 700 }}
                      interval={period === "month" ? 6 : 0}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: "#C8C4E0", strokeWidth: 1 }}
                      tick={{ fill: "#6B6880", fontSize: 9, fontFamily: "Space Mono" }}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{ border: "1px solid #1A1B2E", borderRadius: 0, fontSize: 11, background: "#F0EEF8", fontFamily: "Space Mono" }}
                      formatter={(v: number) => [`${v} kcal`]}
                    />
                    <ReferenceLine y={goal} stroke="#6B5FC0" strokeDasharray="5 4" strokeWidth={1.5}
                      label={{ value: "Goal", position: "right", fill: "#6B5FC0", fontSize: 9, fontWeight: 700 }} />
                    {estimatedTDEE && (
                      <ReferenceLine y={estimatedTDEE} stroke="#6B5FC0" strokeDasharray="5 4" strokeWidth={1} opacity={0.4}
                        label={{ value: "Maint.", position: "right", fill: "#6B5FC0", fontSize: 9, fontWeight: 700 }} />
                    )}
                    <Bar dataKey="calories" fill="#1A1B2E" radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Stats strip */}
              <div className="mt-4 border border-[#1A1B2E]/20">
                <div className="grid grid-cols-3 divide-x divide-[#1A1B2E]/10 border-b border-[#1A1B2E]/10 md:grid-cols-5">
                  {[
                    { label: "Total", value: periodTotals.calories.toLocaleString(), testid: "text-period-total" },
                    { label: "Avg/day", value: avgPerDay.toLocaleString(), testid: "text-period-avg" },
                    { label: "Protein", value: `${Math.round(periodTotals.proteins)}g`, testid: "text-period-protein" },
                    { label: "Carbs", value: `${Math.round(periodTotals.carbs)}g`, testid: "text-period-carbs" },
                    { label: "Fats", value: `${Math.round(periodTotals.fats)}g`, testid: "text-period-fats" },
                  ].map((s, i) => (
                    <div key={s.label} className={`px-3 py-2 text-center ${i >= 3 ? "hidden md:block" : ""}`}>
                      <p className="text-[9px] uppercase tracking-widest opacity-40">{s.label}</p>
                      <p className="mt-0.5 text-sm tabular-nums text-[#6B5FC0]" data-testid={s.testid}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-4 divide-x divide-[#1A1B2E]/10">
                  {(["breakfast", "lunch", "dinner", "snack"] as const).map((type) => (
                    <div key={type} className="px-2 py-2 text-center">
                      <p className="text-[9px] uppercase tracking-widest opacity-40">{MEAL_LABELS[type]}</p>
                      <p className="mt-0.5 text-xs tabular-nums" data-testid={`text-period-${type}`}>
                        {(periodByType[type] || 0).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Journey panel — keeps dark espresso tone */}
          <div className="flex flex-col bg-[#1A1B2E] text-[#F0EEF8]">
            <div className="border-b border-white/10 px-6 py-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-40">Journey</p>
                  <p className="mt-1 text-2xl tabular-nums" data-testid="text-journey-day">Day {dayNum}</p>
                </div>
                {canProject && settings?.goalWeightKg && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest opacity-40">Goal</p>
                    <p className="mt-1 text-sm tabular-nums">{settings.goalWeightKg} kg</p>
                  </div>
                )}
              </div>
              {canProject && currentEstimatedWeight !== null ? (
                <>
                  <div className="mt-4 h-0.5 w-full bg-white/10">
                    <div className="h-full bg-white/80 transition-all" style={{ width: `${weightProgressPct}%` }}
                      data-testid="bar-goal-progress" />
                  </div>
                  <p className="mt-1.5 text-[10px] opacity-50">
                    <span className="font-bold opacity-100 text-white">{weightProgressPct}%</span> toward goal
                  </p>
                </>
              ) : (
                <p className="mt-3 text-xs opacity-50">Keep logging to track your progress.</p>
              )}
            </div>

            {/* Weight + log */}
            <div className="border-b border-white/10 px-6 py-5">
              {canProject && currentEstimatedWeight !== null ? (
                <>
                  <p className="text-[10px] uppercase tracking-widest opacity-40">Estimated Weight</p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-4xl tabular-nums" data-testid="text-estimated-weight">
                      {currentEstimatedWeight.toFixed(1)}
                    </span>
                    <span className="mb-1 text-base opacity-40">kg</span>
                  </div>
                  {activityLabel && <p className="mt-0.5 text-[10px] opacity-30">{activityLabel}</p>}
                  <form
                    className="mt-3 flex gap-2"
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
                      placeholder="Log real weight (kg)"
                      className="h-9 border-white/20 bg-white/10 text-sm text-white placeholder:text-white/30 focus-visible:ring-white/20 font-['Space_Mono']"
                    />
                    <button
                      type="submit"
                      data-testid="button-log-weight"
                      disabled={addWeight.isPending || !weightInput}
                      className="h-9 shrink-0 border border-white/30 px-4 text-[10px] uppercase tracking-widest hover:bg-white/10 transition-colors disabled:opacity-30"
                    >
                      {addWeight.isPending ? "…" : "Log"}
                    </button>
                  </form>
                  <p className="mt-1.5 text-[10px] opacity-30">
                    Anchors projection to real weight.
                  </p>
                </>
              ) : (
                <div>
                  <p className="text-xs opacity-60">
                    Add height, age, sex &amp; goal weight in Settings to see estimated weight.
                  </p>
                  <Link href="/settings">
                    <button
                      data-testid="button-go-to-settings"
                      className="mt-3 flex items-center gap-1.5 border border-white/30 px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-white/10 transition-colors"
                    >
                      <Settings2 className="h-3.5 w-3.5" /> Open Settings
                    </button>
                  </Link>
                </div>
              )}
            </div>

            {/* Projected dates */}
            <div className="flex-1 px-6 py-5">
              {(projectedGoalDate || goalBasedProjectedDate) ? (
                <>
                  <p className="text-[10px] uppercase tracking-widest opacity-40 mb-3">Projected Goal Date</p>
                  <div className="grid grid-cols-2 gap-0 border border-white/10">
                    <div className="border-r border-white/10 p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-40 mb-1.5">
                        <TrendingDown className="h-3 w-3" /> Your pace
                      </div>
                      {projectedGoalDate ? (
                        <>
                          <p className="text-sm leading-tight" data-testid="text-goal-date">{relativeTime(projectedGoalDate)}</p>
                          <p className="mt-0.5 text-[10px] opacity-40 leading-tight">{formatGoalDate(projectedGoalDate)}</p>
                          {recentAvgCalories > 0 && (
                            <p className="mt-2 text-[10px] opacity-30">avg {recentAvgCalories.toLocaleString()} kcal/day</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs opacity-40">Log meals to see</p>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-40 mb-1.5">
                        <TrendingDown className="h-3 w-3" /> At goal
                      </div>
                      {goalBasedProjectedDate ? (
                        <>
                          <p className="text-sm leading-tight" data-testid="text-goal-based-date">{relativeTime(goalBasedProjectedDate)}</p>
                          <p className="mt-0.5 text-[10px] opacity-40 leading-tight">{formatGoalDate(goalBasedProjectedDate)}</p>
                          <p className="mt-2 text-[10px] opacity-30">eating {goal.toLocaleString()} kcal/day</p>
                        </>
                      ) : (
                        <p className="text-xs opacity-40">Set up body metrics</p>
                      )}
                    </div>
                  </div>

                  {estimatedTDEE && (
                    <div className="mt-4 border-t border-white/10 pt-4 space-y-1">
                      {[
                        { label: "Maintenance", value: `${estimatedTDEE.toLocaleString()} kcal/day` },
                        { label: "Your goal", value: `${goal.toLocaleString()} kcal/day` },
                        { label: "Daily deficit", value: `${Math.abs(estimatedTDEE - goal).toLocaleString()} kcal` },
                      ].map((r) => (
                        <div key={r.label} className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-widest opacity-40">{r.label}</p>
                          <p className="text-xs tabular-nums opacity-70">{r.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : canProject ? (
                <p className="text-xs opacity-40">Not enough data to project yet.</p>
              ) : (
                <p className="text-xs opacity-40">
                  Total change:{" "}
                  <span className="opacity-100 text-white tabular-nums">
                    {totalLoss > 0 ? "+" : ""}{totalLoss.toFixed(1)} kg
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ══ ROW 2: Weight charts ══ */}
        <div className="mt-6 grid grid-cols-1 gap-0 border border-[#1A1B2E] md:grid-cols-2">

          {/* Projection chart */}
          <div className="border-b border-[#1A1B2E] md:border-b-0 md:border-r md:border-[#1A1B2E]">
            <div className="border-b border-[#1A1B2E]/20 px-6 py-4">
              <p className="text-xs uppercase tracking-widest opacity-60">Future Projection</p>
              {canProject && projectedGoalDate && (
                <p className="mt-1 text-[10px] opacity-40">
                  Reaching {settings?.goalWeightKg} kg — {relativeTime(projectedGoalDate)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4 border-b border-[#1A1B2E]/10 px-6 py-2 text-[10px] uppercase tracking-widest opacity-40">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 bg-[#6B5FC0]" /> Projected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#A89AC8]" /> Goal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 bg-[#6B5FC0]/60" /> Actual
              </span>
            </div>
            <div className="px-6 py-5">
              {canProject && projectionChartData.length > 0 ? (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={projectionChartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="none" vertical={false} stroke="#E4E0F2" />
                      <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#C8C4E0" }}
                        tick={{ fill: "#6B6880", fontSize: 9, fontFamily: "Space Mono" }} interval="preserveStartEnd" />
                      <YAxis tickLine={false} axisLine={{ stroke: "#C8C4E0" }}
                        tick={{ fill: "#6B6880", fontSize: 9, fontFamily: "Space Mono" }} width={36}
                        tickFormatter={(v: number) => `${v.toFixed(0)}`} domain={["dataMin - 2", "dataMax + 2"]} />
                      <Tooltip contentStyle={{ border: "1px solid #1A1B2E", borderRadius: 0, fontSize: 11, background: "#F0EEF8", fontFamily: "Space Mono" }}
                        formatter={(value: number, name: string) => [`${Number(value).toFixed(1)} kg`,
                          name === "estimated" ? "Projected" : name === "actual" ? "Actual" : "Goal"]} />
                      <Line type="monotone" dataKey="estimated" stroke="#6B5FC0" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                      <Line type="monotone" dataKey="goal" stroke="#A89AC8" strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={false} />
                      <Line type="monotone" dataKey="actual" stroke="#6B5FC0" strokeWidth={0}
                        dot={{ r: 5, fill: "#6B5FC0", strokeWidth: 1.5, stroke: "#F0EEF8" }}
                        activeDot={{ r: 6, fill: "#6B5FC0" }} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : !canProject ? (
                <div className="flex h-40 items-center justify-center border border-dashed border-[#1A1B2E]/20">
                  <div className="text-center">
                    <p className="text-xs opacity-50">Set up body metrics to see projection</p>
                    <Link href="/settings">
                      <button className="mt-3 flex items-center gap-1.5 border border-[#1A1B2E]/30 px-4 py-2 text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity mx-auto">
                        <Settings2 className="h-3.5 w-3.5" /> Open Settings
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

          {/* Actual weight chart */}
          <div>
            <div className="border-b border-[#1A1B2E]/20 px-6 py-4">
              <p className="text-xs uppercase tracking-widest opacity-60">Actual Progress</p>
              <p className="mt-1 text-[10px] opacity-40">
                {weights.length > 0
                  ? `${weights.length} weight log${weights.length !== 1 ? "s" : ""} recorded`
                  : "No weight entries yet"}
              </p>
            </div>
            <div className="border-b border-[#1A1B2E]/10 px-6 py-2 text-[10px] uppercase tracking-widest opacity-40">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 bg-[#6B5FC0]" /> Logged Weight
              </span>
            </div>
            <div className="px-6 py-5">
              {actualWeightChartData.length >= 2 ? (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={actualWeightChartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="none" vertical={false} stroke="#E4E0F2" />
                      <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#C8C4E0" }}
                        tick={{ fill: "#6B6880", fontSize: 9, fontFamily: "Space Mono" }} interval="preserveStartEnd" />
                      <YAxis tickLine={false} axisLine={{ stroke: "#C8C4E0" }}
                        tick={{ fill: "#6B6880", fontSize: 9, fontFamily: "Space Mono" }} width={36}
                        tickFormatter={(v: number) => `${v.toFixed(0)}`} domain={["dataMin - 1", "dataMax + 1"]} />
                      <Tooltip contentStyle={{ border: "1px solid #1A1B2E", borderRadius: 0, fontSize: 11, background: "#F0EEF8", fontFamily: "Space Mono" }}
                        formatter={(v: number) => [`${v.toFixed(1)} kg`, "Weight"]} />
                      {settings?.goalWeightKg && (
                        <ReferenceLine y={settings.goalWeightKg} stroke="#A89AC8" strokeDasharray="4 4" strokeWidth={1.5}
                          label={{ value: "Goal", position: "right", fill: "#6B5FC0", fontSize: 9, fontWeight: 700 }} />
                      )}
                      <Line type="monotone" dataKey="weight" stroke="#6B5FC0" strokeWidth={2}
                        dot={{ r: 4, fill: "#6B5FC0", strokeWidth: 1.5, stroke: "#F0EEF8" }}
                        activeDot={{ r: 5, fill: "#6B5FC0" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-48 flex-col items-center justify-center border border-dashed border-[#1A1B2E]/20">
                  <p className="text-xs opacity-50">
                    {actualWeightChartData.length === 1 ? "Log one more weight to see a trend" : "No weight logs yet"}
                  </p>
                  <p className="mt-1 text-[10px] opacity-30">Use the field above to log your weight</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ ROW 3: Weight history ledger ══ */}
        <div className="mt-6 border border-[#1A1B2E]">
          <div className="border-b-2 border-[#1A1B2E] px-6 py-4">
            <div className="flex items-end justify-between">
              <p className="text-xs uppercase tracking-widest opacity-60">Weight History</p>
              <span className="text-3xl tabular-nums text-[#6B5FC0]">
                {totalLoss > 0 ? "+" : ""}{totalLoss.toFixed(1)}
                <span className="text-base opacity-40 ml-1">kg</span>
              </span>
            </div>
          </div>
          <div className="px-6 py-2">
            {weightDeltas.length === 0 ? (
              <p className="py-6 text-xs opacity-40 text-center uppercase tracking-widest">
                Log weight above to start tracking weekly changes
              </p>
            ) : (
              weightDeltas.map((item, i) => (
                <div
                  key={item.week}
                  className="flex items-center justify-between py-3 border-b border-[#1A1B2E]/10 last:border-b-0"
                >
                  <span className="text-[10px] uppercase tracking-widest opacity-50">{item.week}</span>
                  <span className="text-sm tabular-nums text-[#6B5FC0]" data-testid={`text-week-${i}`}>
                    {item.delta > 0 ? "+" : ""}{item.delta.toFixed(1)} kg
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </AppShell>
  );
}

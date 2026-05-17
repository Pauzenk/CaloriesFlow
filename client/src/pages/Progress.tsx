import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Settings2, TrendingDown, TrendingUp } from "lucide-react";
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
import { ACTIVITY_MULTIPLIERS, type ActivityLevel } from "@shared/schema";
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

  // ─── Period stats ────────────────────────────────────────────────────────────
  const n = period === "day" ? 1 : period === "week" ? 7 : 30;
  const dates = lastNDates(n);
  const series = dailyCaloriesSeries(meals, dates);
  const chartData = series.map((s) => ({ ...s, goal }));

  const periodMeals = meals.filter((m) => dates.includes(m.date));
  const periodTotals = sumMacros(periodMeals);
  const avgPerDay = Math.round(periodTotals.calories / n);
  const periodByType = caloriesByMealType(periodMeals);

  // ─── Weight projection ───────────────────────────────────────────────────────
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

  // ─── Future projection chart data (estimated + goal lines, sampled) ──────────
  const projectionChartData = useMemo(() => {
    if (!canProject || projectionPoints.length === 0) return [];
    const today = todayStr();
    const chartDateSet = new Set<string>();
    projectionPoints.forEach((p, i) => {
      if (i % 7 === 0) chartDateSet.add(p.date);
    });
    if (projectionPoints.length > 0) chartDateSet.add(projectionPoints[projectionPoints.length - 1].date);
    actualWeightMap.forEach((_, date) => chartDateSet.add(date));

    const estMap = new Map<string, number>();
    for (const p of projectionPoints) estMap.set(p.date, p.estimatedWeightKg);

    return Array.from(chartDateSet)
      .sort()
      .map((date) => {
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

  // ─── Actual weight log chart data ────────────────────────────────────────────
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

  // ─── Weight progress % toward goal ──────────────────────────────────────────
  const weightProgressPct = useMemo(() => {
    if (!settings?.startingWeightKg || !settings?.goalWeightKg || currentEstimatedWeight === null) return 0;
    const total = Math.abs(settings.startingWeightKg - settings.goalWeightKg);
    const done = Math.abs(settings.startingWeightKg - currentEstimatedWeight);
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }, [settings, currentEstimatedWeight]);

  // ─── Recent avg + schedule delta ─────────────────────────────────────────────
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

  const scheduleDelta = useMemo(() => {
    if (
      !canProject ||
      recentAvgCalories === 0 ||
      !settings ||
      !estimatedTDEE ||
      !currentEstimatedWeight ||
      !projectedGoalDate
    )
      return null;
    const goalWeight = settings.goalWeightKg!;
    const remainingWeight = Math.abs(currentEstimatedWeight - goalWeight);
    if (remainingWeight <= 0) return { deltaDays: 0 };
    const plannedDailyDeficit = estimatedTDEE - goal;
    if (Math.abs(plannedDailyDeficit) < 10) return null;
    const plannedDaysToGoal = Math.ceil((remainingWeight * 7700) / Math.abs(plannedDailyDeficit));
    const todayDateObj = new Date(todayStr() + "T00:00:00");
    const plannedGoalDateObj = new Date(todayDateObj);
    plannedGoalDateObj.setDate(plannedGoalDateObj.getDate() + plannedDaysToGoal);
    const actualGoalDateObj = new Date(projectedGoalDate + "T00:00:00");
    const deltaDays = Math.round(
      (actualGoalDateObj.getTime() - plannedGoalDateObj.getTime()) / (1000 * 60 * 60 * 24),
    );
    return { deltaDays };
  }, [canProject, recentAvgCalories, settings, estimatedTDEE, currentEstimatedWeight, projectedGoalDate, goal]);

  const goalMessage = useMemo(() => {
    if (!canProject || recentAvgCalories === 0 || !scheduleDelta) return null;
    const { deltaDays } = scheduleDelta;
    if (Math.abs(deltaDays) <= 3) return "You're right on track — keep it up!";
    if (deltaDays > 0) return `At this pace you'll reach your goal ${deltaDays} day${deltaDays !== 1 ? "s" : ""} later than planned.`;
    const ahead = Math.abs(deltaDays);
    return `Great! You're ahead of schedule by ${ahead} day${ahead !== 1 ? "s" : ""}.`;
  }, [canProject, recentAvgCalories, scheduleDelta]);

  const goalMessageIsPositive = scheduleDelta !== null && scheduleDelta.deltaDays <= 3;

  const weightDeltas = weeklyWeightDeltas(weights, settings);
  const totalLoss = weightDeltas.reduce((a, d) => a + d.delta, 0);

  return (
    <AppShell title="Progress">

      {/* ══ ROW 1: Calorie chart + stats │ Journey/Goal card ══ */}
      <div className="grid grid-cols-1 gap-0 border border-[#c0cdd1] xl:grid-cols-[1fr_300px]">

        {/* Left: calorie chart */}
        <div className="border-b border-[#c0cdd1] bg-white xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-3 border-b border-[#c0cdd1] p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#424843]">Calorie Intake</p>
              <h3 className="mt-0.5 text-2xl font-bold text-[#1a1c1a]">Goal vs. Actual</h3>
            </div>
            <ToggleGroup
              type="single"
              value={period}
              onValueChange={(v) => v && setPeriod(v as Period)}
              className="h-10 border border-[#c0cdd1] bg-[#f4f3ef] p-0.5"
            >
              {(["day", "week", "month"] as const).map((p) => (
                <ToggleGroupItem
                  key={p}
                  value={p}
                  data-testid={`toggle-period-${p}`}
                  className="h-9 px-4 text-xs font-bold uppercase tracking-wider text-[#424843] data-[state=on]:bg-white data-[state=on]:text-[#475C65]"
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="p-6 md:p-8">
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="none" vertical={false} stroke="#e7e5df" strokeWidth={1} />
                  <XAxis
                    dataKey={period === "month" ? "shortLabel" : "label"}
                    tickLine={false}
                    axisLine={{ stroke: "#c0cdd1", strokeWidth: 1 }}
                    tick={{ fill: "#424843", fontSize: 10, fontWeight: 700 }}
                    interval={period === "month" ? 6 : 0}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: "#c0cdd1", strokeWidth: 1 }}
                    tick={{ fill: "#424843", fontSize: 10 }}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{ border: "1px solid #1a1c1a", borderRadius: 0, fontSize: 12 }}
                    formatter={(v: number) => [`${v} kcal`]}
                  />
                  <ReferenceLine
                    y={goal}
                    stroke="#475C65"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: "Goal", position: "right", fill: "#475C65", fontSize: 10, fontWeight: 700 }}
                  />
                  <Bar dataKey="calories" fill="#475C65" radius={0} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Stats grid */}
            <div className="mt-5 border border-[#c0cdd1]">
              <div className="grid grid-cols-3 divide-x divide-[#c0cdd1] border-b border-[#c0cdd1] md:grid-cols-5 md:divide-x">
                {[
                  { label: "Total kcal", value: periodTotals.calories.toLocaleString(), testid: "text-period-total" },
                  { label: "Avg / day", value: avgPerDay.toLocaleString(), testid: "text-period-avg" },
                  { label: "Protein", value: `${Math.round(periodTotals.proteins)}g`, testid: "text-period-protein" },
                  { label: "Carbs", value: `${Math.round(periodTotals.carbs)}g`, testid: "text-period-carbs" },
                  { label: "Fats", value: `${Math.round(periodTotals.fats)}g`, testid: "text-period-fats" },
                ].map((s, i) => (
                  <div key={s.label} className={`bg-[#f4f3ef] px-3 py-2.5 text-center ${i >= 3 ? "hidden md:block" : ""}`}>
                    <p className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#424843]">{s.label}</p>
                    <p className="mt-0.5 text-sm font-bold text-[#475C65]" data-testid={s.testid}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 divide-x divide-[#c0cdd1]">
                {(["breakfast", "lunch", "dinner", "snack"] as const).map((type) => (
                  <div key={type} className="px-2 py-2 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#424843]">{MEAL_LABELS[type]}</p>
                    <p className="mt-0.5 text-xs font-bold text-[#1a1c1a]" data-testid={`text-period-${type}`}>
                      {(periodByType[type] || 0).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Journey + Goal summary */}
        <div className="flex flex-col bg-[#475C65]">
          {/* Progress bar header */}
          <div className="border-b border-white/20 p-6 md:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[2px] text-white/60">Journey</p>
                <p className="mt-1 text-2xl font-bold text-white" data-testid="text-journey-day">
                  Day {dayNum}
                </p>
              </div>
              {canProject && settings?.goalWeightKg && (
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[2px] text-white/60">Goal Weight</p>
                  <p className="mt-1 text-sm font-bold text-white">{settings.goalWeightKg} kg</p>
                </div>
              )}
            </div>
            {canProject && currentEstimatedWeight !== null ? (
              <>
                <div className="mt-4 h-2 w-full bg-white/20">
                  <div
                    className="h-full bg-white transition-all"
                    style={{ width: `${weightProgressPct}%` }}
                    data-testid="bar-goal-progress"
                  />
                </div>
                <p className="mt-1.5 text-xs text-white/70">
                  <span className="font-bold text-white">{weightProgressPct}%</span> toward goal
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-white/80">Keep logging to track your progress.</p>
            )}
          </div>

          {/* Estimated weight + inline log */}
          <div className="border-b border-white/20 p-6 md:p-8">
            {canProject && currentEstimatedWeight !== null ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[2px] text-white/60">Estimated Weight</p>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-4xl font-bold text-white" data-testid="text-estimated-weight">
                    {currentEstimatedWeight.toFixed(1)}
                  </span>
                  <span className="mb-1 text-lg text-white/70">kg</span>
                  {settings?.goalWeightKg && (
                    <span className="mb-1 ml-1 text-sm text-white/60">
                      / Goal: {settings.goalWeightKg} kg
                    </span>
                  )}
                </div>
                {/* Inline weight log */}
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
                    className="h-9 border-white/30 bg-white/10 text-sm text-white placeholder:text-white/40 focus-visible:ring-white/30"
                  />
                  <Button
                    type="submit"
                    data-testid="button-log-weight"
                    disabled={addWeight.isPending || !weightInput}
                    size="sm"
                    className="h-9 shrink-0 bg-white font-bold text-[#475C65] hover:bg-white/90"
                  >
                    {addWeight.isPending ? "…" : "Log"}
                  </Button>
                </form>
                <p className="mt-1.5 text-[10px] text-white/50">
                  Logging updates your estimate &amp; projected goal date.
                </p>
              </>
            ) : (
              <div>
                <p className="text-sm text-white/80">
                  Add height, age, sex &amp; goal weight in Settings to see your estimated weight.
                </p>
                <Link href="/settings">
                  <Button
                    data-testid="button-go-to-settings"
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  >
                    <Settings2 className="h-4 w-4" /> Open Settings
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Projected goal date */}
          <div className="flex-1 p-6 md:p-8">
            {projectedGoalDate ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[2px] text-white/60">Estimated Goal</p>
                <p className="mt-1 text-2xl font-bold text-white" data-testid="text-goal-date">
                  {relativeTime(projectedGoalDate)}
                </p>
                <p className="mt-0.5 text-sm text-white/70">{formatGoalDate(projectedGoalDate)}</p>

                {estimatedTDEE && (
                  <div className="mt-4">
                    <p className="text-[10px] font-bold uppercase tracking-[2px] text-white/60">Your TDEE</p>
                    <p className="mt-0.5 text-sm font-bold text-white">{estimatedTDEE.toLocaleString()} kcal/day</p>
                  </div>
                )}

                {goalMessage && (
                  <div className="mt-4 border border-white/20 bg-white/10 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      {goalMessageIsPositive ? (
                        <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                      ) : (
                        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                      )}
                      <p className="text-xs text-white/90" data-testid="text-goal-message">
                        {goalMessage}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : canProject ? (
              <p className="text-sm text-white/70">Not enough data to project yet.</p>
            ) : (
              <p className="text-sm text-white/70">
                Total change:{" "}
                <span className="font-bold text-white">
                  {totalLoss > 0 ? "+" : ""}
                  {totalLoss.toFixed(1)} kg
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ══ ROW 2: Two weight charts ══ */}
      <div className="mt-6 grid grid-cols-1 gap-0 border border-[#c0cdd1] md:grid-cols-2">

        {/* Chart A: Future Projection */}
        <div className="border-b border-[#c0cdd1] bg-white md:border-b-0 md:border-r">
          <div className="border-b border-[#c0cdd1] p-5 md:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#424843]">Weight Chart</p>
            <h3 className="mt-0.5 text-lg font-bold text-[#1a1c1a]">Future Projection</h3>
            {canProject && projectedGoalDate && (
              <p className="mt-0.5 text-xs text-[#424843]">
                Projected to reach {settings?.goalWeightKg} kg — {relativeTime(projectedGoalDate)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 border-b border-[#c0cdd1] px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#424843] md:px-6">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-5 bg-[#475C65]" /> Projected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-5 border-t-2 border-dashed border-[#8aaab3]" /> Goal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 bg-[#c97d6f]" /> Actual
            </span>
          </div>
          <div className="p-5 md:p-6">
            {canProject && projectionChartData.length > 0 ? (
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={projectionChartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="none" vertical={false} stroke="#e7e5df" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={{ stroke: "#c0cdd1", strokeWidth: 1 }}
                      tick={{ fill: "#424843", fontSize: 9, fontWeight: 700 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: "#c0cdd1", strokeWidth: 1 }}
                      tick={{ fill: "#424843", fontSize: 9 }}
                      width={36}
                      tickFormatter={(v: number) => `${v.toFixed(0)}`}
                      domain={["dataMin - 2", "dataMax + 2"]}
                    />
                    <Tooltip
                      contentStyle={{ border: "1px solid #1a1c1a", borderRadius: 0, fontSize: 11 }}
                      formatter={(value: number, name: string) => [
                        `${Number(value).toFixed(1)} kg`,
                        name === "estimated" ? "Projected" : name === "actual" ? "Actual" : "Goal",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="estimated"
                      stroke="#475C65"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="goal"
                      stroke="#8aaab3"
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      dot={false}
                      activeDot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      stroke="#c97d6f"
                      strokeWidth={0}
                      dot={{ r: 5, fill: "#c97d6f", strokeWidth: 1.5, stroke: "#fff" }}
                      activeDot={{ r: 6, fill: "#c97d6f" }}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : !canProject ? (
              <div className="flex h-40 items-center justify-center border border-dashed border-[#c0cdd1] bg-[#f4f3ef]">
                <div className="text-center">
                  <p className="text-xs font-bold text-[#1a1c1a]">Set up body metrics to see projection</p>
                  <Link href="/settings">
                    <Button variant="outline" size="sm" className="mt-2 border-[#c0cdd1] text-[#475C65]">
                      <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Open Settings
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-xs text-[#424843]">
                Not enough data to project yet.
              </div>
            )}
          </div>
        </div>

        {/* Chart B: Actual Progress */}
        <div className="bg-white">
          <div className="border-b border-[#c0cdd1] p-5 md:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#424843]">Weight Chart</p>
            <h3 className="mt-0.5 text-lg font-bold text-[#1a1c1a]">Actual Progress</h3>
            <p className="mt-0.5 text-xs text-[#424843]">
              {weights.length > 0
                ? `${weights.length} weight log${weights.length !== 1 ? "s" : ""} recorded`
                : "No weight entries yet"}
            </p>
          </div>
          <div className="border-b border-[#c0cdd1] px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#424843] md:px-6">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-5 bg-[#c97d6f]" /> Logged Weight
            </span>
          </div>
          <div className="p-5 md:p-6">
            {actualWeightChartData.length >= 2 ? (
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={actualWeightChartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="none" vertical={false} stroke="#e7e5df" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={{ stroke: "#c0cdd1", strokeWidth: 1 }}
                      tick={{ fill: "#424843", fontSize: 9, fontWeight: 700 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: "#c0cdd1", strokeWidth: 1 }}
                      tick={{ fill: "#424843", fontSize: 9 }}
                      width={36}
                      tickFormatter={(v: number) => `${v.toFixed(0)}`}
                      domain={["dataMin - 1", "dataMax + 1"]}
                    />
                    <Tooltip
                      contentStyle={{ border: "1px solid #1a1c1a", borderRadius: 0, fontSize: 11 }}
                      formatter={(v: number) => [`${v.toFixed(1)} kg`, "Weight"]}
                    />
                    {settings?.goalWeightKg && (
                      <ReferenceLine
                        y={settings.goalWeightKg}
                        stroke="#8aaab3"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{ value: "Goal", position: "right", fill: "#475C65", fontSize: 9, fontWeight: 700 }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="#c97d6f"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#c97d6f", strokeWidth: 1.5, stroke: "#fff" }}
                      activeDot={{ r: 5, fill: "#c97d6f" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-52 flex-col items-center justify-center border border-dashed border-[#c0cdd1] bg-[#f4f3ef]">
                <p className="text-xs font-bold text-[#1a1c1a]">
                  {actualWeightChartData.length === 1 ? "Log one more weight to see a trend" : "No weight logs yet"}
                </p>
                <p className="mt-1 text-[10px] text-[#424843]">Use the field above to log your weight</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ ROW 3: Weekly breakdown ══ */}
      <div className="mt-6 border border-[#c0cdd1] bg-white">
        <div className="border-b border-[#c0cdd1] p-6 md:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#424843]">Weight History</p>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-4xl font-bold text-[#475C65]">
              {totalLoss > 0 ? "+" : ""}
              {totalLoss.toFixed(1)}
            </span>
            <span className="mb-1 text-lg text-[#424843]">kg total</span>
          </div>
        </div>
        <div className="p-6 md:p-8">
          {weightDeltas.length === 0 ? (
            <p className="text-sm text-[#424843]">Log your weight above to start tracking weekly changes.</p>
          ) : (
            weightDeltas.map((item, i) => (
              <div key={item.week}>
                <div className="flex items-center justify-between py-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#424843]">{item.week}</span>
                  <span
                    className={`text-sm font-bold ${item.delta <= 0 ? "text-[#475C65]" : "text-[#c97d6f]"}`}
                    data-testid={`text-week-${i}`}
                  >
                    {item.delta > 0 ? "+" : ""}
                    {item.delta.toFixed(1)} kg
                  </span>
                </div>
                {i < weightDeltas.length - 1 && <Separator className="bg-[#c0cdd133]" />}
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

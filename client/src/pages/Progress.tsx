import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Settings2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
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

  // ─── Period stats ────────────────────────────────────────────────────────────
  const n = period === "day" ? 1 : period === "week" ? 7 : 30;
  const dates = lastNDates(n);
  const series = dailyCaloriesSeries(meals, dates);
  const chartData = series.map((s) => ({ ...s, goal }));

  const periodMeals = meals.filter((m) => dates.includes(m.date));
  const periodTotals = sumMacros(periodMeals);
  const daysWithData = dates.filter((d) => periodMeals.some((m) => m.date === d)).length;
  const avgPerDay = daysWithData > 0 ? Math.round(periodTotals.calories / daysWithData) : 0;
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
    () => (settings ? weightProjectionSeries(settings, meals) : { points: [], projectedGoalDate: null }),
    [settings, meals],
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
        return {
          date,
          label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          estimated: estMap.get(date),
          actual: actualWeightMap.get(date) ?? undefined,
          goal: settings?.goalWeightKg ?? undefined,
        };
      });
  }, [projectionPoints, actualWeightMap, settings, canProject]);

  // ─── Recent avg + goal message ────────────────────────────────────────────────
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
    if (!settings?.heightCm || !settings?.ageYears || !settings?.sexAtBirth || !settings?.startingWeightKg)
      return null;
    const bmr = computeBMR(
      settings.startingWeightKg,
      settings.heightCm,
      settings.ageYears,
      settings.sexAtBirth as "male" | "female",
    );
    return Math.round(computeTDEE(bmr));
  }, [settings]);

  const goalMessage = useMemo(() => {
    if (!canProject || recentAvgCalories === 0 || !settings) return null;
    const diff = goal - recentAvgCalories;
    const isLosingWeight = (settings.goalWeightKg ?? 0) < settings.startingWeightKg;
    if (Math.abs(diff) < 100) return "You're right on track — keep it up!";
    if (isLosingWeight) {
      if (diff > 0)
        return `Eating ${diff} kcal/day below your goal — you're ahead of schedule!`;
      return `Eating ${Math.abs(diff)} kcal/day over your goal. Cutting back will get you there sooner.`;
    } else {
      if (diff < 0)
        return `Eating ${Math.abs(diff)} kcal/day above your goal — great progress for gaining!`;
      return `Eating ${diff} kcal/day below your goal. Aiming higher will get you there sooner.`;
    }
  }, [canProject, recentAvgCalories, goal, settings]);

  const weightDeltas = weeklyWeightDeltas(weights, settings);
  const totalLoss = weightDeltas.reduce((a, d) => a + d.delta, 0);

  const isLosingWeight = (settings?.goalWeightKg ?? 0) < (settings?.startingWeightKg ?? 0);
  const goalMsgPositive = goalMessage?.startsWith("Eating") && goalMessage?.includes("below your goal") && isLosingWeight
    ? false
    : true;

  return (
    <AppShell title="Progress">
      {/* ── Row 1: Calorie chart + period stats | Goal summary ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="rounded border-[#c0cdd11a] bg-white shadow-[4px_0px_12px_#0000000a]">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-2xl text-[#1a1c1a]">Goal vs. Actual</h3>
                <p className="mt-1 text-sm font-medium text-[#424843]">Calorie intake trends over time</p>
              </div>
              <ToggleGroup
                type="single"
                value={period}
                onValueChange={(v) => v && setPeriod(v as Period)}
                className="h-11 rounded bg-[#eeeeea] p-1"
              >
                {(["day", "week", "month"] as const).map((p) => (
                  <ToggleGroupItem
                    key={p}
                    value={p}
                    data-testid={`toggle-period-${p}`}
                    className="h-9 rounded px-4 text-sm font-bold text-[#1a1c1a] data-[state=on]:bg-white data-[state=on]:text-[#475C65]"
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="mt-6 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5df" />
                  <XAxis
                    dataKey={period === "month" ? "shortLabel" : "label"}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#424843", fontSize: 11 }}
                    interval={period === "month" ? 6 : 0}
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#424843", fontSize: 11 }} width={40} />
                  <Tooltip
                    contentStyle={{ borderRadius: 4, border: "1px solid #c0cdd14c", fontSize: 12 }}
                    formatter={(v: number) => [`${v} kcal`]}
                  />
                  <ReferenceLine
                    y={goal}
                    stroke="#8aaab3"
                    strokeDasharray="4 4"
                    label={{ value: "Goal", position: "right", fill: "#475C65", fontSize: 11 }}
                  />
                  <Bar dataKey="calories" fill="#475C65" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Period stats strip ── */}
            <div className="mt-6">
              <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                {[
                  { label: "Total kcal", value: periodTotals.calories.toLocaleString(), testid: "text-period-total" },
                  { label: "Avg / day", value: avgPerDay.toLocaleString(), testid: "text-period-avg" },
                  {
                    label: "Protein",
                    value: `${Math.round(periodTotals.proteins)}g`,
                    testid: "text-period-protein",
                  },
                  { label: "Carbs", value: `${Math.round(periodTotals.carbs)}g`, testid: "text-period-carbs" },
                  { label: "Fats", value: `${Math.round(periodTotals.fats)}g`, testid: "text-period-fats" },
                ].map((s) => (
                  <div key={s.label} className="rounded bg-[#f4f3ef] px-3 py-2.5 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#424843]">{s.label}</p>
                    <p className="mt-0.5 text-sm font-bold text-[#475C65]" data-testid={s.testid}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {(["breakfast", "lunch", "dinner", "snack"] as const).map((type) => (
                  <div key={type} className="rounded bg-[#f4f3ef] px-2 py-2 text-center">
                    <p className="text-[10px] text-[#424843]">{MEAL_LABELS[type]}</p>
                    <p
                      className="text-xs font-bold text-[#1a1c1a]"
                      data-testid={`text-period-${type}`}
                    >
                      {(periodByType[type] || 0).toLocaleString()} kcal
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Goal summary card ── */}
        <Card className="overflow-hidden rounded border-0 bg-[#475C65]">
          <CardContent className="flex h-full flex-col p-6 md:p-8">
            <Sparkles className="h-7 w-7 text-white" />
            <h3 className="mt-2 text-2xl font-normal text-white" data-testid="text-journey-day">
              Day {dayNum} of your journey.
            </h3>

            {canProject && currentEstimatedWeight !== null ? (
              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Estimated weight now
                  </p>
                  <p className="mt-1 text-3xl font-bold text-white" data-testid="text-estimated-weight">
                    {currentEstimatedWeight.toFixed(1)} kg
                  </p>
                  {settings?.goalWeightKg && (
                    <p className="mt-0.5 text-sm text-white/70">
                      Goal: {settings.goalWeightKg} kg
                    </p>
                  )}
                </div>

                {projectedGoalDate && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                      Projected goal date
                    </p>
                    <p className="mt-1 text-lg font-bold text-white" data-testid="text-goal-date">
                      {relativeTime(projectedGoalDate)}
                    </p>
                    <p className="text-sm text-white/70">{formatGoalDate(projectedGoalDate)}</p>
                  </div>
                )}

                {estimatedTDEE && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Your TDEE</p>
                    <p className="mt-1 text-base font-bold text-white">{estimatedTDEE.toLocaleString()} kcal/day</p>
                  </div>
                )}

                {goalMessage && (
                  <div className="mt-auto rounded bg-white/10 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      {goalMessage.includes("ahead") || goalMessage.includes("on track") ? (
                        <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                      ) : (
                        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                      )}
                      <p className="text-sm text-white/90" data-testid="text-goal-message">
                        {goalMessage}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-white/80">
                  Add your height, age, and goal weight in Settings to see your estimated weight and projected goal
                  date.
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
                <p className="mt-4 text-base text-white/90">
                  Total weight change:{" "}
                  <span className="font-bold">
                    {totalLoss > 0 ? "+" : ""}
                    {totalLoss.toFixed(1)} kg
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Weight Projection Chart ── */}
      <Card className="mt-6 rounded border-[#c0cdd11a] bg-white shadow-[4px_0px_12px_#0000000a]">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-xl font-bold text-[#1a1c1a]">Weight Projection</h3>
              <p className="mt-1 text-sm text-[#424843]">
                {canProject && projectedGoalDate
                  ? `Estimated to reach ${settings?.goalWeightKg} kg on ${formatGoalDate(projectedGoalDate)}`
                  : "Estimated weight trend based on your calorie data"}
              </p>
            </div>
            {canProject && (
              <div className="mt-3 flex items-center gap-4 text-xs text-[#424843] md:mt-0">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 bg-[#475C65]" /> Estimated
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-0.5 w-5 border-t-2 border-dashed border-[#8aaab3]"
                    style={{ display: "inline-block", height: 0, borderTopWidth: 2, width: 20 }}
                  />{" "}
                  Goal
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-full bg-[#c97d6f]" /> Actual
                </span>
              </div>
            )}
          </div>

          {canProject && projectionChartData.length > 0 ? (
            <div className="mt-6 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={projectionChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5df" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#424843", fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#424843", fontSize: 11 }}
                    width={44}
                    tickFormatter={(v: number) => `${v.toFixed(0)}`}
                    domain={["dataMin - 2", "dataMax + 2"]}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 4, border: "1px solid #c0cdd14c", fontSize: 12 }}
                    formatter={(value: number, name: string) => [
                      `${Number(value).toFixed(1)} kg`,
                      name === "estimated" ? "Estimated" : name === "actual" ? "Actual" : "Goal",
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
                    dot={{ r: 5, fill: "#c97d6f", strokeWidth: 1, stroke: "#fff" }}
                    activeDot={{ r: 6, fill: "#c97d6f" }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : !canProject ? (
            <div className="mt-6 flex items-center justify-center rounded border border-dashed border-[#c0cdd14c] bg-[#f4f3ef] py-10 text-center">
              <div>
                <p className="text-sm font-medium text-[#1a1c1a]">Set up body metrics to see projections</p>
                <p className="mt-1 text-xs text-[#424843]">
                  Add height, age, sex, and goal weight in Settings.
                </p>
                <Link href="/settings">
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5 border-[#c0cdd14c] text-[#475C65] hover:bg-[#f4f3ef]"
                  >
                    <Settings2 className="h-3.5 w-3.5" /> Open Settings
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex h-40 items-center justify-center text-sm text-[#424843]">
              Not enough data to project yet.
            </div>
          )}

          {/* Manual weight entry */}
          <div className="mt-6 border-t border-[#c0cdd14c] pt-5">
            <p className="text-sm font-semibold text-[#1a1c1a]">Log today's weight</p>
            <form
              className="mt-2 flex items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const kg = parseFloat(weightInput);
                if (!isNaN(kg)) addWeight.mutate(kg);
              }}
            >
              <div className="w-40">
                <Label htmlFor="weight-input" className="text-xs text-[#424843]">
                  Weight (kg)
                </Label>
                <Input
                  id="weight-input"
                  data-testid="input-weight"
                  type="number"
                  step="0.1"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="e.g. 72.4"
                  className="mt-1"
                />
              </div>
              <Button
                type="submit"
                data-testid="button-log-weight"
                disabled={addWeight.isPending || !weightInput}
                className="bg-[#475C65] hover:bg-[#3d5059]"
              >
                {addWeight.isPending ? "Saving…" : "Save"}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* ── Row 3: Weekly Breakdown ── */}
      <Card className="mt-6 rounded border-[#c0cdd11a] bg-white shadow-[4px_0px_12px_#0000000a]">
        <CardContent className="p-6 md:p-8">
          <p className="text-sm font-bold uppercase tracking-[1.4px] text-[#424843]">Weekly Weight Breakdown</p>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-5xl font-bold leading-[56px] text-[#475C65]">
              {totalLoss > 0 ? "+" : ""}
              {totalLoss.toFixed(1)}
            </span>
            <span className="mb-1 text-xl text-[#424843]">kg total</span>
          </div>
          <div className="mt-6">
            {weightDeltas.length === 0 ? (
              <p className="text-sm text-[#424843]">Log your weight above to start tracking weekly changes.</p>
            ) : (
              weightDeltas.map((item, i) => (
                <div key={item.week}>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm font-medium text-[#1a1c1a]">{item.week}</span>
                    <span
                      className="text-base font-bold text-[#475C65]"
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
        </CardContent>
      </Card>
    </AppShell>
  );
}

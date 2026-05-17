import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Settings2 } from "lucide-react";
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
import { ACTIVITY_MULTIPLIERS, ACTIVITY_LEVEL_LABELS, type ActivityLevel } from "@shared/schema";
import {
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

const DURATION_OPTIONS = [1, 2, 3, 4, 6] as const;

const CHART_TOOLTIP = {
  contentStyle: {
    border: "1px solid #1C1714",
    borderRadius: 0,
    fontSize: 11,
    background: "#F2EDE7",
    fontFamily: "'Space Mono', monospace",
  },
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

function calcGoalDateFromMonths(months: number): string {
  const d = new Date(todayStr() + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default function ProgressPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [weightInput, setWeightInput] = useState("");
  const [customDuration, setCustomDuration] = useState("");
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

  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      if (!settings) return;
      await apiRequest("PUT", "/api/settings", { ...settings, ...patch });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (err: unknown) =>
      toast({
        title: "Failed to update goal",
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

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([weekIdx, { projected, actuals }]) => ({
        week: weekIdx === 0 ? "Now" : `Wk ${weekIdx}`,
        projected: +projected.toFixed(1),
        goal: settings?.goalWeightKg ?? undefined,
        actual:
          actuals.length > 0
            ? +(actuals.reduce((s, v) => s + v, 0) / actuals.length).toFixed(1)
            : undefined,
      }));
  }, [projectionPoints, actualWeightMap, settings, canProject]);

  function calcCalorieGoalForDuration(months: number, fromWeight?: number): number | null {
    if (!estimatedTDEE || !settings?.goalWeightKg) return null;
    const currentW = fromWeight ?? displayWeight ?? settings?.startingWeightKg;
    if (!currentW) return null;
    const remainingWeight = Math.abs(currentW - settings.goalWeightKg);
    if (remainingWeight <= 0) return estimatedTDEE;
    const totalDays = months * 30.44;
    const totalDeficitNeeded = remainingWeight * 7700;
    const dailyDeficit = totalDeficitNeeded / totalDays;
    return Math.max(1200, Math.round(estimatedTDEE - dailyDeficit));
  }

  function handleDurationSelect(months: number) {
    if (!settings) return;
    const newGoal = calcCalorieGoalForDuration(months);
    if (!newGoal) return;
    updateSettings.mutate({
      dailyCalorieGoal: newGoal,
      goalDurationMonths: months,
    });
  }

  const selectedDuration = settings?.goalDurationMonths ?? null;
  const isCustomDuration =
    selectedDuration !== null &&
    !(DURATION_OPTIONS as readonly number[]).includes(selectedDuration);

  const goalProjectedDate = useMemo(() => {
    if (selectedDuration) {
      return calcGoalDateFromMonths(selectedDuration);
    }
    return projectedGoalDate ?? null;
  }, [selectedDuration, projectedGoalDate]);

  const weightDeltas = weeklyWeightDeltas(weights, settings);
  const activityLabel = settings?.activityLevel
    ? ACTIVITY_LEVEL_LABELS[settings.activityLevel as ActivityLevel]
    : null;

  return (
    <AppShell title="Progress">
      <div className="w-full font-['Space_Mono'] text-[#1C1714] space-y-10">

        {/* ══ BLOCK 1: Weight section with projection chart ══ */}
        <div>
          <div className="border-b-2 border-[#1C1714] pb-4 mb-6">
            <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Weight</p>
            <div className="text-3xl tracking-tighter leading-none">
              {canProject ? "Projection" : "Log Weight"}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_280px]">

            {/* Left: projection chart */}
            <div>
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
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={projectionChartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                        <CartesianGrid
                          strokeDasharray="none"
                          vertical={false}
                          stroke="#1C1714"
                          strokeOpacity={0.06}
                        />
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
                            const labels: Record<string, string> = {
                              projected: "Projected",
                              goal: "Goal",
                              actual: "Actual",
                            };
                            return [`${v?.toFixed(1)} kg`, labels[name] ?? name];
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="projected"
                          stroke="#9e4515"
                          strokeDasharray="5 4"
                          strokeWidth={1.5}
                          dot={false}
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
                            dot={{ fill: "#1C1714", r: 3, strokeWidth: 0 }}
                            connectNulls
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-40 border border-dashed border-[#1C1714]/20 text-xs opacity-40">
                  Add height, age, sex &amp; goal weight in Settings to see projections.
                </div>
              )}
            </div>

            {/* Right: current weight + log input */}
            <div className="flex flex-col gap-5">

              {/* Day count + progress */}
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
                {canProject && displayWeight !== null ? (
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

              {/* Current weight display + log input */}
              <div className="border border-[#1C1714] p-5">
                {canProject && displayWeight !== null ? (
                  <>
                    <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">
                      Current Weight ({isActualWeight ? "Actual" : "Estimated"})
                    </p>
                    <div className="flex items-end gap-1.5 mb-0.5">
                      <span
                        className="text-4xl tabular-nums tracking-tighter"
                        data-testid="text-estimated-weight"
                      >
                        {displayWeight.toFixed(1)}
                      </span>
                      <span className="text-lg opacity-50 mb-0.5">kg</span>
                    </div>
                    {!isActualWeight && (
                      <p className="text-[10px] opacity-35 mb-1">
                        Calculated from calorie deficit
                        {activityLabel ? ` · ${activityLabel}` : ""}
                      </p>
                    )}
                    {isActualWeight && mostRecentActualWeight && (
                      <p className="text-[10px] opacity-35 mb-1">
                        Logged {formatGoalDate(mostRecentActualWeight.date)}
                      </p>
                    )}
                    {goalProjectedDate && (
                      <p className="text-[10px] opacity-50 mt-1 mb-3 pb-3 border-b border-dashed border-[#1C1714]/20">
                        Est. goal: <span className="opacity-100">{relativeTime(goalProjectedDate)}</span>
                        {" "}·{" "}{formatGoalDate(goalProjectedDate)}
                      </p>
                    )}
                    <form
                      className="flex gap-2 mt-3"
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
                    <p className="text-xs opacity-60 mb-3">
                      Add height, age, sex &amp; goal weight in Settings to see your estimated weight.
                    </p>
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

            </div>
          </div>
        </div>

        {/* ══ BLOCK 2: Goal duration selector ══ */}
        <div>
          <div className="border-b-2 border-[#1C1714] pb-4 mb-6">
            <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Goal Duration</p>
            <div className="text-3xl tracking-tighter leading-none">Daily Target</div>
          </div>

          {canProject && estimatedTDEE ? (
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-50 mb-3">
                How long do you want to reach your goal?
              </p>

              {/* Duration buttons */}
              <div className="flex flex-wrap gap-2 mb-5">
                {DURATION_OPTIONS.map((m) => {
                  const newGoal = calcCalorieGoalForDuration(m);
                  const isSelected = selectedDuration === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      data-testid={`button-duration-${m}`}
                      onClick={() => handleDurationSelect(m)}
                      disabled={updateSettings.isPending}
                      className={`px-4 py-2 text-xs uppercase tracking-widest border transition-colors ${
                        isSelected
                          ? "bg-[#1C1714] text-[#F2EDE7] border-[#1C1714]"
                          : "border-[#1C1714]/30 hover:border-[#1C1714] hover:bg-[#1C1714]/5"
                      }`}
                    >
                      {m} mo
                      {newGoal !== null && (
                        <span className="ml-1.5 opacity-60">
                          · {newGoal.toLocaleString()}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Custom input */}
                <div className="flex gap-1">
                  <Input
                    data-testid="input-custom-duration"
                    type="number"
                    min={1}
                    max={24}
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    placeholder="Custom"
                    className={`w-24 rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1714] placeholder:opacity-40 h-9 text-xs ${isCustomDuration ? "border-[#1C1714]" : ""}`}
                  />
                  <button
                    type="button"
                    data-testid="button-duration-custom"
                    disabled={!customDuration || updateSettings.isPending}
                    onClick={() => {
                      const m = parseInt(customDuration, 10);
                      if (!isNaN(m) && m >= 1 && m <= 24) {
                        handleDurationSelect(m);
                        setCustomDuration("");
                      }
                    }}
                    className="px-3 border border-[#1C1714]/30 text-xs uppercase tracking-widest hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors disabled:opacity-40"
                  >
                    Set
                  </button>
                </div>
              </div>

              {/* Result display */}
              {selectedDuration !== null && (
                <div className="border border-[#1C1714] p-5 grid grid-cols-2 gap-6 sm:grid-cols-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-widest opacity-50 mb-1">Duration</p>
                    <p className="text-2xl tabular-nums tracking-tighter" data-testid="text-goal-duration">
                      {selectedDuration} mo
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest opacity-50 mb-1">Daily Target</p>
                    <p className="text-2xl tabular-nums tracking-tighter" data-testid="text-goal-daily-target">
                      {goal.toLocaleString()} kcal
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest opacity-50 mb-1">Projected Goal Date</p>
                    <p className="text-base leading-tight" data-testid="text-goal-date">
                      {relativeTime(calcGoalDateFromMonths(selectedDuration))}
                    </p>
                    <p className="text-[10px] opacity-50 mt-0.5">
                      {formatGoalDate(calcGoalDateFromMonths(selectedDuration))}
                    </p>
                  </div>
                </div>
              )}

              {selectedDuration === null && (
                <p className="text-xs opacity-40">Select a duration to see your required daily calorie target.</p>
              )}
            </div>
          ) : (
            <p className="text-xs opacity-40">
              Add height, age, sex, starting weight &amp; goal weight in Settings to use this feature.
            </p>
          )}
        </div>

        {/* ══ BLOCK 3: Stats ══ */}
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
          <div className="mb-3 flex flex-wrap gap-5 text-[10px] uppercase tracking-widest opacity-60">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#1C1714]" />
              Goal ({goal.toLocaleString()} kcal)
            </span>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 48, left: 0, bottom: 4 }}>
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
                  y={goal}
                  stroke="#1C1714"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  label={{ value: "Goal", position: "right", fill: "#1C1714", fontSize: 9, opacity: 0.7 }}
                />
                <Bar dataKey="calories" fill="#1C1714" fillOpacity={0.75} radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Stats ledger — Total Calories and Avg Per Day only */}
          <div className="mt-5 border border-[#1C1714]">
            <div className="grid grid-cols-2">
              <div className="px-4 py-3 text-center border-r border-[#1C1714]/10">
                <p className="text-[9px] uppercase tracking-widest opacity-50">Total kcal</p>
                <p className="mt-0.5 text-sm tabular-nums" data-testid="text-period-total">
                  {periodTotals.calories.toLocaleString()}
                </p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-[9px] uppercase tracking-widest opacity-50">Avg / day</p>
                <p className="mt-0.5 text-sm tabular-nums" data-testid="text-period-avg">
                  {avgPerDay.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ══ BLOCK 4: Weekly Weight Breakdown ══ */}
        <div>
          <div className="border-b-2 border-[#1C1714] pb-4 mb-6">
            <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">Weight History</p>
            <div className="text-3xl tracking-tighter leading-none">Weekly Log</div>
          </div>

          {weightDeltas.length === 0 ? (
            <p className="text-xs opacity-40 py-4">Log your weight to start tracking weekly changes.</p>
          ) : (
            <div>
              {weightDeltas.map((item, i) => (
                <div
                  key={item.week}
                  className="flex items-center justify-between py-3 border-b border-[#1C1714]/10 hover:border-[#1C1714]/40 transition-colors"
                >
                  <span className="text-xs uppercase tracking-widest opacity-60">{item.week}</span>
                  <span
                    className="text-sm tabular-nums"
                    data-testid={`text-week-${i}`}
                  >
                    {item.avgKg.toFixed(1)} kg
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

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
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

export default function ProgressPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [weightInput, setWeightInput] = useState("");
  const [selectedWeekKey, setSelectedWeekKey] = useState<number | null>(null);
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

  return (
    <AppShell title="Progress">
      <div className="w-full font-['Space_Mono'] text-[#1C1714] space-y-8">

        {/* ══ Current Weight — top of page ══ */}
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

        {/* ══ BLOCK 1: Weight section with projection chart ══ */}
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

                  {/* Detail panel — shown when a week is selected */}
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
                          <p className="text-base tabular-nums tracking-tight" data-testid="detail-week-label">
                            {point.week}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">Projected</p>
                          <p className="text-base tabular-nums tracking-tight" data-testid="detail-projected">
                            {point.projected.toFixed(1)} kg
                          </p>
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
                            className={`text-base tabular-nums tracking-tight ${
                              point.deficitKcal !== null && point.deficitKcal > 0
                                ? "opacity-100"
                                : "opacity-60"
                            }`}
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

        {/* ══ BLOCK 2: Intake Record chart ══ */}
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

          {/* Chart legend */}
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

          {/* Stats */}
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

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
import { SetupPrompt } from "@/components/SetupPrompt";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Activity, Meal, Settings, Weight } from "@shared/schema";
import type { ThreeLinePoint } from "@/lib/calorieflow";
import { type GoalMode, ACTIVITY_MULTIPLIERS } from "@shared/schema";
import {
  computeBMR,
  computeTDEE,
  dailyCaloriesSeries,
  daysSince,
  lastNDates,
  sumMacros,
  todayStr,
  threeLineWeightSeries,
} from "@/lib/calorieflow";
import type { Lang } from "@/lib/i18n";

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

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function relativeTime(dateStr: string, lang: Lang): string {
  const today = new Date();
  const target = new Date(dateStr + "T00:00:00");
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return lang === "ru" ? "Цель достигнута!" : "Goal reached!";
  if (diffDays < 7) {
    if (lang === "ru") return `Через ${diffDays} ${pluralRu(diffDays, "день", "дня", "дней")}`;
    return `In ${diffDays} day${diffDays !== 1 ? "s" : ""}`;
  }
  if (diffDays < 30) {
    const wks = Math.round(diffDays / 7);
    if (lang === "ru") return `Через ~${wks} нед.`;
    return `In ~${wks} wks`;
  }
  const months = Math.round(diffDays / 30);
  if (lang === "ru") return `Через ~${months} мес.`;
  return `In ~${months} mo${months !== 1 ? "s" : ""}`;
}

function formatGoalDate(dateStr: string, lang: Lang): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}

function journeyTimeframeLabel(days: number, lang: Lang): string {
  if (lang === "ru") {
    if (days < 7) return `${days} ${pluralRu(days, "день", "дня", "дней")}`;
    if (days < 30) {
      const wks = Math.round(days / 7);
      return `${wks} ${pluralRu(wks, "неделя", "недели", "недель")}`;
    }
    const months = Math.round(days / 30);
    return `${months} ${pluralRu(months, "месяц", "месяца", "месяцев")}`;
  }
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""}`;
  if (days < 30) {
    const wks = Math.round(days / 7);
    return `${wks} week${wks !== 1 ? "s" : ""}`;
  }
  const months = Math.round(days / 30);
  return `${months} month${months !== 1 ? "s" : ""}`;
}

export default function ProgressPage() {
  const { lang, t } = useLanguage();
  const [period, setPeriod] = useState<Period>("week");
  const [weightInput, setWeightInput] = useState("");
  const [weightDate, setWeightDate] = useState(todayStr());
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const projectionContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: meals = [] } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
  const { data: weights = [] } = useQuery<Weight[]>({ queryKey: ["/api/weights"] });
  const { data: activities = [] } = useQuery<Activity[]>({ queryKey: ["/api/activities"] });

  const addWeight = useMutation({
    mutationFn: async ({ kg, date }: { kg: number; date: string }) => {
      await apiRequest("POST", "/api/weights", { date, weightKg: kg });
    },
    onSuccess: () => {
      setWeightInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/weights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: t("weightLogged") });
    },
    onError: (err: unknown) =>
      toast({ title: t("failedToLogWeight"), description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" }),
  });

  const goal = settings?.dailyCalorieGoal || 2000;
  const dayNum = settings ? daysSince(settings.journeyStartDate) : 1;
  const goalMode = ((settings?.goalMode ?? "weight_loss") as GoalMode);

  const n = period === "day" ? 1 : period === "week" ? 7 : 30;
  const dates = lastNDates(n);
  const series = dailyCaloriesSeries(meals, dates, activities);
  const chartData = series.map((s) => ({ ...s, goal }));

  const periodMeals = meals.filter((m) => dates.includes(m.date));
  const periodTotals = sumMacros(periodMeals);
  const periodBurned = activities.filter((a) => dates.includes(a.date)).reduce((s, a) => s + a.caloriesBurned, 0);
  const netPeriodCalories = Math.max(0, periodTotals.calories - periodBurned);
  const daysWithLogs = Math.max(1, dates.filter((d) => meals.some((m) => m.date === d)).length);
  const avgPerDay = Math.round(netPeriodCalories / daysWithLogs);
  const periodDeficit = goal * daysWithLogs - netPeriodCalories;
  const estimatedKgLost = periodDeficit / 7700;

  const canProject = !!(
    settings?.heightCm &&
    settings?.ageYears &&
    settings?.sexAtBirth &&
    settings?.startingWeightKg &&
    (goalMode === "maintenance" || settings?.goalWeightKg)
  );

  const { points: threeLinePoints, projectedGoalDate, currentRealKg, lastLoggedKg, todayDate, tickDates } = useMemo(
    () =>
      settings && canProject
        ? threeLineWeightSeries(settings, meals, activities, weights, goalMode, lang)
        : { points: [], projectedGoalDate: null, currentRealKg: undefined, lastLoggedKg: undefined, todayDate: "", tickDates: [] },
    [settings, meals, activities, weights, goalMode, lang, canProject],
  );

  const currentEstimatedWeight = currentRealKg ?? null;

  const mostRecentActualWeight = useMemo(() => {
    if (weights.length === 0) return null;
    const sorted = [...weights].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0];
  }, [weights]);

  const displayWeight = mostRecentActualWeight?.weightKg ?? currentEstimatedWeight;
  const isActualWeight = !!mostRecentActualWeight;

  const estimatedTDEE = useMemo(() => {
    if (!settings?.heightCm || !settings?.ageYears || !settings?.sexAtBirth || !settings?.startingWeightKg)
      return null;
    const sex = settings.sexAtBirth;
    if (sex !== "male" && sex !== "female") return null;
    // Use most recent known weight so today's maintenance reflects current metabolism
    const weightForTDEE = lastLoggedKg ?? currentRealKg ?? settings.startingWeightKg;
    const bmr = computeBMR(weightForTDEE, settings.heightCm, settings.ageYears, sex);
    const multiplier = ACTIVITY_MULTIPLIERS[(settings.activityLevel ?? "sedentary") as keyof typeof ACTIVITY_MULTIPLIERS] ?? 1.2;
    return Math.round(computeTDEE(bmr, multiplier));
  }, [settings, lastLoggedKg, currentRealKg]);

  const weightProgressPct = useMemo(() => {
    if (!settings?.startingWeightKg || !settings?.goalWeightKg || displayWeight === null) return 0;
    const total = Math.abs(settings.startingWeightKg - settings.goalWeightKg);
    const done = Math.abs(settings.startingWeightKg - displayWeight);
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }, [settings, displayWeight]);

  const intakeChartMax = Math.max(
    (estimatedTDEE ?? goal) + 200,
    ...chartData.map((d) => d.calories ?? 0),
  );

  const hasInvalidBodyParams = useMemo(() => {
    if (!settings) return false;
    const { startingWeightKg, goalWeightKg, heightCm } = settings;
    if (startingWeightKg > 0 && (startingWeightKg < 30 || startingWeightKg > 300)) return true;
    if (goalWeightKg != null && goalWeightKg > 0 && (goalWeightKg < 30 || goalWeightKg > 300)) return true;
    if (heightCm != null && heightCm > 0 && (heightCm < 100 || heightCm > 250)) return true;
    return false;
  }, [settings]);

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

  const periodLabels: Record<Period, string> = {
    day: t("periodDay"),
    week: t("periodWeek"),
    month: t("periodMonth"),
  };

  return (
    <AppShell title={t("progressTitle")}>
      <div className="w-full font-['Space_Mono'] text-[#1C1714] space-y-8">

        {/* ══ Invalid params banner ══ */}
        {hasInvalidBodyParams && (
          <div className="border-2 border-[#9e4515] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm leading-snug opacity-80">{t("invalidBodyParams")}</p>
            <a
              href="/settings"
              className="shrink-0 border border-[#9e4515] text-[#9e4515] px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-[#9e4515]/5 transition-colors"
            >
              {t("editParameters")}
            </a>
          </div>
        )}

        {/* ══ Current Weight ══ */}
        <div className="border-2 border-[#1C1714] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">
                {t("currentWeightTitle")}
                <span className="ml-2 opacity-60">({isActualWeight ? t("actual") : t("estimated")})</span>
              </p>
              <div className="flex items-end gap-2">
                <span className="text-4xl tabular-nums tracking-tighter leading-none" data-testid="text-estimated-weight">
                  {displayWeight !== null
                    ? `${!isActualWeight ? "≈" : ""}${displayWeight.toFixed(1)}`
                    : "—"}
                </span>
                <span className="text-xl opacity-40 mb-0.5">kg</span>
                {settings?.goalWeightKg && (
                  <span className="text-sm opacity-35 mb-0.5">/ {settings.goalWeightKg} {t("goalWeightSuffix")}</span>
                )}
              </div>
              {displayWeight !== null && (
                <p className="text-[10px] opacity-40 mt-1">
                  {isActualWeight && mostRecentActualWeight
                    ? `${t("loggedOn")} ${formatGoalDate(mostRecentActualWeight.date, lang)}`
                    : t("modelEstimateCaption")}
                </p>
              )}
            </div>
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end sm:max-w-[420px] w-full mt-2 sm:mt-0"
              onSubmit={(e) => {
                e.preventDefault();
                const kg = parseFloat(weightInput);
                if (!isNaN(kg) && kg > 0 && weightDate) addWeight.mutate({ kg, date: weightDate });
              }}
            >
              <div className="flex-1">
                <label className="block text-[9px] uppercase tracking-widest opacity-50 mb-1.5 font-['Space_Mono']">
                  {t("logWeightLabel")}
                </label>
                <Input
                  data-testid="input-weight"
                  type="number"
                  step="0.1"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="0.0"
                  className="rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1714] placeholder:opacity-40 h-9 text-sm w-full"
                />
              </div>
              <Input
                data-testid="input-weight-date"
                type="date"
                value={weightDate}
                max={todayStr()}
                onChange={(e) => setWeightDate(e.target.value)}
                className="rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1714] h-9 text-sm w-full sm:w-36 shrink-0"
              />
              <button
                type="submit"
                data-testid="button-log-weight"
                disabled={addWeight.isPending || !weightInput || !weightDate}
                className={`shrink-0 px-5 py-2 text-xs uppercase tracking-widest transition-colors whitespace-nowrap h-9 ${
                  weightInput
                    ? "bg-[#1C1714] text-[#F2EDE7] hover:bg-[#1C1714]/80"
                    : "border border-[#1C1714]/25 text-[#1C1714]/35 cursor-default"
                }`}
              >
                {addWeight.isPending ? "…" : t("addButton")}
              </button>
            </form>
          </div>
        </div>

        {/* ══ Journey Statement ══ */}
        <div className="border border-[#1C1714] p-5">
          <div className="flex items-start justify-between mb-4 pb-3 border-b border-dashed border-[#1C1714]/20">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">{t("journeyStatement")}</p>
              <p className="text-4xl tabular-nums tracking-tighter leading-none" data-testid="text-journey-day">
                {t("day")} {dayNum}
              </p>
            </div>
            {canProject && settings?.goalWeightKg && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">{t("goal")}</p>
                <p className="text-lg tabular-nums">{settings.goalWeightKg} kg</p>
                {projectedGoalDate && (
                  <p className="text-[10px] opacity-35 mt-0.5">{relativeTime(projectedGoalDate, lang)}</p>
                )}
              </div>
            )}
          </div>

          {canProject && (
            <div className="pt-3 border-t border-dashed border-[#1C1714]/20">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase opacity-70">{t("journeyProgress")}</div>
                <div data-testid="text-goal-percent" className="text-xs font-medium">
                  {journeyTimeframeLabel(dayNum, lang)} {t("journeyIn")}
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
                <span>{t("startLabel")}</span>
                <span>{weightProgressPct}{t("ofGoalWeight")}</span>
              </div>
            </div>
          )}
        </div>


        {/* ══ Weight Projection ══ */}
        <div>
          <div className="border-b-2 border-[#1C1714] pb-4 mb-6">
            <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">{t("weightSection")}</p>
            <div className="text-3xl tracking-tighter leading-none">
              {canProject ? t("projection") : t("logWeightPrompt")}
            </div>
          </div>

          <div ref={projectionContainerRef}>
            {canProject && threeLinePoints.length > 0 ? (
              <>
                {/* Legend */}
                <div className="flex flex-wrap gap-5 mb-3 text-[10px] uppercase tracking-widest opacity-50">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 bg-[#1C1714]" style={{ height: 2 }} />
                    {lang === "ru" ? "Вес" : "Weight"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4" style={{ height: 2, borderTop: "2px dashed #9e4515" }} />
                    {t("plannedLine")}
                  </span>
                  {settings?.goalWeightKg && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-4" style={{ height: 1, borderTop: "1px dashed #1C1714", opacity: 0.4 }} />
                      {t("goal")} ({settings.goalWeightKg} kg)
                    </span>
                  )}
                </div>

                {/* Chart */}
                <div className="h-56 w-full cursor-pointer">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={threeLinePoints}
                      margin={{ top: 16, right: 24, left: 0, bottom: 4 }}
                      onClick={(chartState) => {
                        if (!chartState || chartState.activeTooltipIndex == null) {
                          setSelectedWeekKey(null);
                          return;
                        }
                        const point = threeLinePoints[chartState.activeTooltipIndex as number];
                        if (!point) { setSelectedWeekKey(null); return; }
                        setSelectedWeekKey((prev) => (prev === point.date ? null : point.date));
                      }}
                    >
                      <CartesianGrid strokeDasharray="none" vertical={false} stroke="#1C1714" strokeOpacity={0.06} />
                      <XAxis
                        dataKey="dayIdx"
                        type="number"
                        domain={[0, "dataMax"]}
                        ticks={(() => {
                          if (!threeLinePoints.length) return [];
                          const max = threeLinePoints[threeLinePoints.length - 1].dayIdx;
                          const result: number[] = [];
                          for (let i = 0; i <= max; i += 7) result.push(i);
                          return result;
                        })()}
                        tickLine={false}
                        axisLine={{ stroke: "#1C1714", strokeOpacity: 0.2 }}
                        tick={{ fill: "#1C1714", fontSize: 9, opacity: 0.5, fontFamily: "'Space Mono'" }}
                        tickFormatter={(idx: number) => {
                          if (idx === 0) return lang === "ru" ? "Нач" : "Start";
                          return `w${Math.round(idx / 7)}`;
                        }}
                        interval={0}
                        minTickGap={36}
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
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const pt = payload[0].payload as ThreeLinePoint;
                          return (
                            <div style={CHART_TOOLTIP.contentStyle} className="px-3 py-2.5 flex flex-col gap-1">
                              <p className="text-[10px] uppercase tracking-widest opacity-50 mb-1">
                                {new Date(pt.date + "T00:00:00").toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short", day: "numeric" })}
                              </p>
                              {pt.real !== undefined && (
                                <p style={{ color: "#1C1714" }}>
                                  {lang === "ru" ? "Вес" : "Weight"}{pt.isLogged ? " ●" : ""} : {pt.real.toFixed(1)} kg
                                </p>
                              )}
                              <p style={{ color: "#9e4515" }}>{t("plannedLine")} : {pt.planned.toFixed(1)} kg</p>
                            </div>
                          );
                        }}
                      />

                      {/* Goal reference — faint dashed horizontal */}
                      {settings?.goalWeightKg && (
                        <ReferenceLine
                          y={settings.goalWeightKg}
                          stroke="#1C1714"
                          strokeDasharray="4 3"
                          strokeOpacity={0.3}
                          strokeWidth={1}
                        />
                      )}

                      {/* Today vertical marker */}
                      {todayDate && settings?.journeyStartDate && (() => {
                        const startMs = new Date(settings.journeyStartDate + "T00:00:00").getTime();
                        const todayMs = new Date(todayDate + "T00:00:00").getTime();
                        const todayDayIdx = Math.floor((todayMs - startMs) / 86400000);
                        return (
                        <ReferenceLine
                          x={todayDayIdx}
                          stroke="#1C1714"
                          strokeOpacity={0.35}
                          strokeWidth={1}
                          label={{
                            value: lang === "ru" ? "Сегодня" : "Today",
                            position: "top",
                            fontSize: 8,
                            fill: "#1C1714",
                            opacity: 0.45,
                            fontFamily: "'Space Mono'",
                          }}
                        />
                        );
                      })()}

                      {/* WEIGHT line — calorie-deficit estimate, ends at today, dots at logged dates */}
                      <Line
                        type="linear"
                        dataKey="real"
                        stroke="#1C1714"
                        strokeWidth={1.5}
                        connectNulls={false}
                        dot={(props: any) => {
                          if (!props.payload?.isLogged) return <g key={props.key} />;
                          return (
                            <circle
                              key={props.key}
                              cx={props.cx}
                              cy={props.cy}
                              r={3}
                              fill="#1C1714"
                              stroke="#F2EDE7"
                              strokeWidth={1}
                            />
                          );
                        }}
                        activeDot={{ r: 3, fill: "#1C1714", stroke: "#F2EDE7", strokeWidth: 1 }}
                      />

                      {/* PLAN line — dashed terracotta diagonal, full timeline */}
                      <Line
                        type="linear"
                        dataKey="planned"
                        stroke="#9e4515"
                        strokeDasharray="5 4"
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Click-to-inspect detail panel */}
                {selectedWeekKey !== null && (() => {
                  const point = threeLinePoints.find((p) => p.date === selectedWeekKey);
                  if (!point) return null;
                  return (
                    <div
                      data-testid="panel-week-detail"
                      className="mt-3 border border-[#1C1714] p-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 text-[#1C1714]"
                    >
                      <div>
                        <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">{lang === "ru" ? "Дата" : "Date"}</p>
                        <p className="text-base tabular-nums tracking-tight" data-testid="detail-week-label">
                          {new Date(point.date + "T00:00:00").toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">{lang === "ru" ? "Вес" : "Weight"}</p>
                        <p className="text-base tabular-nums tracking-tight" data-testid="detail-real">
                          {point.real !== undefined ? `${point.real.toFixed(1)} kg` : "—"}
                          {point.isLogged && <span className="text-[9px] opacity-40 ml-1">●</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">{t("plannedLine")}</p>
                        <p className="text-base tabular-nums tracking-tight opacity-80" data-testid="detail-planned">{point.planned.toFixed(1)} kg</p>
                      </div>
                      <button
                        type="button"
                        data-testid="button-close-week-detail"
                        onClick={() => setSelectedWeekKey(null)}
                        className="col-span-2 sm:col-span-4 text-[9px] uppercase tracking-widest opacity-30 hover:opacity-60 transition-opacity text-left mt-1"
                      >
                        {t("tapToDismiss")}
                      </button>
                    </div>
                  );
                })()}
              </>
            ) : (
              <SetupPrompt message={t("setupToUseFeature")} />
            )}
          </div>
        </div>

        {/* ══ Intake Record ══ */}
        <div>
          <div className="flex flex-col gap-3 border-b-2 border-[#1C1714] pb-4 mb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">{t("intakeRecord")}</p>
              <div className="text-3xl tracking-tighter leading-none">{t("goalVsActual")}</div>
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
                  {periodLabels[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-5 text-[10px] uppercase tracking-widest opacity-60">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#1C1714]" />
              {t("goal")} ({goal.toLocaleString()} kcal)
            </span>
            {estimatedTDEE && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[#9e4515]" />
                {t("maintenance")} ({estimatedTDEE.toLocaleString()} kcal)
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
                  domain={[0, intakeChartMax]}
                />
                <Tooltip {...CHART_TOOLTIP} formatter={(v: number) => [`${v} kcal`]} />
                <ReferenceLine
                  y={goal}
                  stroke="#1C1714"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  label={{ value: t("goal"), position: "right", fill: "#1C1714", fontSize: 9, opacity: 0.7 }}
                />
                {estimatedTDEE && (
                  <ReferenceLine
                    y={estimatedTDEE}
                    stroke="#9e4515"
                    strokeDasharray="5 4"
                    strokeWidth={1.5}
                    label={{ value: t("maintenanceShort"), position: "right", fill: "#9e4515", fontSize: 9, opacity: 0.7 }}
                  />
                )}
                <Bar dataKey="calories" fill="#1C1714" fillOpacity={0.75} radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5 border border-[#1C1714]">
            <div className="grid grid-cols-3 divide-x divide-[#1C1714]/10">
              <div className="px-3 py-4 text-center">
                <p className="text-[9px] uppercase tracking-widest opacity-60 mb-1">{t("calorieDeficit")}</p>
                <p
                  className={`text-base tabular-nums font-medium ${periodDeficit < 0 ? "text-red-600" : ""}`}
                  data-testid="text-period-deficit"
                >
                  {Math.abs(periodDeficit).toLocaleString()}
                </p>
                <p className={`text-[10px] mt-0.5 ${periodDeficit < 0 ? "text-red-500 opacity-70" : "opacity-40"}`}>
                  {periodDeficit >= 0 ? t("deficitLabel") : t("surplusLabel")}
                </p>
              </div>
              <div className="px-3 py-4 text-center">
                <p className="text-[9px] uppercase tracking-widest opacity-60 mb-1">{t("avgPerDay")}</p>
                <p className="text-base tabular-nums font-medium" data-testid="text-period-avg">
                  {avgPerDay.toLocaleString()}
                </p>
                <p className="text-[10px] opacity-40 mt-0.5">kcal</p>
              </div>
              <div className="px-3 py-4 text-center">
                <p className="text-[9px] uppercase tracking-widest opacity-60 mb-1">
                  {goalMode === "weight_gain" ? t("estGained") : goalMode === "maintenance" ? t("estStable") : t("estLost")}
                </p>
                <p className="text-base tabular-nums font-medium" data-testid="text-period-kg-lost">
                  {goalMode === "maintenance"
                    ? `±${Math.abs(estimatedKgLost).toFixed(2)}`
                    : estimatedKgLost >= 0
                    ? estimatedKgLost.toFixed(2)
                    : `+${Math.abs(estimatedKgLost).toFixed(2)}`}
                </p>
                <p className="text-[10px] opacity-40 mt-0.5">kg</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-[10px] uppercase tracking-widest opacity-30">{t("endOfRecord")}</div>
      </div>
    </AppShell>
  );
}

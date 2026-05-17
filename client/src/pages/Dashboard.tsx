import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Coffee, UtensilsCrossed, Soup, Sparkles, Target, Plus, Leaf } from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";
import { AppShell } from "@/components/AppShell";
import type { Meal, Settings, Weight } from "@shared/schema";
import {
  caloriesByMealType,
  dailyCaloriesSeries,
  daysSince,
  lastNDates,
  mealsForDate,
  sumMacros,
  todayStr,
  weeklyWeightDeltas,
  weightProjectionSeries,
} from "@/lib/calorieflow";

const MEAL_META = {
  breakfast: { label: "Breakfast", icon: Coffee },
  lunch: { label: "Lunch", icon: UtensilsCrossed },
  dinner: { label: "Dinner", icon: Soup },
  snack: { label: "Snack", icon: Sparkles },
} as const;

export default function Dashboard() {
  const { data: settings, isLoading: sLoading } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: meals = [], isLoading: mLoading } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
  const { data: weights = [] } = useQuery<Weight[]>({ queryKey: ["/api/weights"] });

  const canProject = !!(
    settings?.heightCm &&
    settings?.ageYears &&
    settings?.sexAtBirth &&
    settings?.goalWeightKg &&
    settings?.startingWeightKg
  );

  const { points: projectionPoints } = useMemo(
    () => (settings ? weightProjectionSeries(settings, meals, weights) : { points: [], projectedGoalDate: null }),
    [settings, meals, weights],
  );

  const currentEstimatedWeight = useMemo(() => {
    if (projectionPoints.length === 0) return null;
    const t = todayStr();
    const todayPoint = projectionPoints.find((p) => p.date === t);
    if (todayPoint) return todayPoint.estimatedWeightKg;
    const past = projectionPoints.filter((p) => p.date <= t);
    return past.length > 0 ? past[past.length - 1].estimatedWeightKg : projectionPoints[0].estimatedWeightKg;
  }, [projectionPoints]);

  const weightProgressPct = useMemo(() => {
    if (!settings?.startingWeightKg || !settings?.goalWeightKg || currentEstimatedWeight === null) return 0;
    const total = Math.abs(settings.startingWeightKg - settings.goalWeightKg);
    const done = Math.abs(settings.startingWeightKg - currentEstimatedWeight);
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }, [settings, currentEstimatedWeight]);

  if (sLoading || mLoading) {
    return (
      <AppShell title="Overview">
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  const today = todayStr();
  const todays = mealsForDate(meals, today);
  const totals = sumMacros(todays);
  const goal = settings?.dailyCalorieGoal || 2000;
  const pct = Math.min(100, Math.round((totals.calories / goal) * 100));
  const remaining = Math.max(0, goal - totals.calories);
  const byType = caloriesByMealType(todays);
  const dayNum = settings ? daysSince(settings.journeyStartDate) : 1;

  const weekDates = lastNDates(7);
  const series = dailyCaloriesSeries(meals, weekDates);
  const avg = Math.round(series.reduce((a, s) => a + s.calories, 0) / series.length) || 0;
  const onTarget = series.filter((s) => s.calories > 0 && s.calories <= goal).length;
  const consistency = series.filter((s) => s.calories > 0).length;
  const consistencyPct = consistency > 0 ? Math.round((onTarget / consistency) * 100) : 0;

  const weightDeltas = weeklyWeightDeltas(weights, settings);
  const totalLoss = weightDeltas.reduce((a, d) => a + d.delta, 0);
  const showOnboarding = meals.length === 0;

  return (
    <AppShell title="Overview">
      {showOnboarding && (
        <div
          data-testid="card-onboarding"
          className="mb-6 border border-[#7A7869] bg-[#7A7869]"
        >
          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-white/30 text-white">
                  <Leaf className="h-6 w-6" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-2xl font-bold text-white">Welcome to CalorieFlow</h3>
                  <p className="max-w-xl text-base text-white/90">
                    Set your daily calorie goal in Settings, then log your first meal to start tracking your journey.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row md:shrink-0">
                <Link href="/settings">
                  <Button
                    data-testid="button-onboarding-settings"
                    variant="outline"
                    className="h-11 w-full gap-2 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto"
                  >
                    <Target className="h-4 w-4" /> Set Goal
                  </Button>
                </Link>
                <Link href="/log">
                  <Button
                    data-testid="button-onboarding-log"
                    className="h-11 w-full gap-2 bg-white text-base font-bold text-[#7A7869] hover:bg-white/90 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" /> Log Daily Meal
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Top row: today's status | journey sidebar ── */}
      <div className="grid grid-cols-1 gap-0 border border-[#D4CFC8] xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,360px)]">
        {/* Left: calorie status */}
        <div className="border-b border-[#D4CFC8] bg-white p-6 md:p-8 xl:border-b-0 xl:border-r xl:border-[#D4CFC8]">
          <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">Today</p>
          <div className="mt-2 flex items-end gap-3">
            <span
              data-testid="text-today-calories"
              className="text-5xl font-bold leading-[56px] tracking-tight text-[#1C1714]"
            >
              {totals.calories}
            </span>
            <span className="pb-2 text-lg text-[#6B6560]">kcal consumed</span>
          </div>
          <p className="mt-3 text-sm text-[#6B6560]">
            <span className="font-bold text-[#7A7869]">{remaining} kcal</span> remaining of {goal} kcal goal
          </p>

          {/* Calorie progress bar */}
          <div className="mt-5">
            <div className="h-2 w-full bg-[#EDE8E2]">
              <div
                className="h-full bg-[#7A7869] transition-all"
                style={{ width: `${pct}%` }}
                data-testid="bar-calorie-progress"
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#6B6560]">
              <span>0</span>
              <span data-testid="text-goal-percent">{pct}%</span>
              <span>{goal}</span>
            </div>
          </div>

          {/* Macros */}
          <div className="mt-6 grid grid-cols-3 divide-x divide-[#D4CFC8] border border-[#D4CFC8]">
            {[
              { label: "Proteins", value: `${Math.round(totals.proteins)}g` },
              { label: "Carbs", value: `${Math.round(totals.carbs)}g` },
              { label: "Fats", value: `${Math.round(totals.fats)}g` },
            ].map((m) => (
              <div key={m.label} className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6560]">{m.label}</p>
                <p
                  className="mt-0.5 text-lg font-bold text-[#1C1714]"
                  data-testid={`text-macro-${m.label.toLowerCase()}`}
                >
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: journey progress + current weight */}
        <div className="flex flex-col bg-white">
          {/* Journey progress bar */}
          <div className="border-b border-[#5C4A3A] bg-[#5C4A3A] p-6 md:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[2px] text-white/60">Journey</p>
                <p className="mt-1 text-2xl font-bold text-white" data-testid="text-journey-day">
                  Day {dayNum}
                </p>
              </div>
              {canProject && settings?.goalWeightKg && (
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[2px] text-white/60">Goal</p>
                  <p className="mt-1 text-sm font-bold text-white">{settings.goalWeightKg} kg</p>
                </div>
              )}
            </div>
            {canProject && currentEstimatedWeight !== null ? (
              <>
                <div className="mt-4 h-1.5 w-full bg-white/20">
                  <div
                    className="h-full bg-white transition-all"
                    style={{ width: `${weightProgressPct}%` }}
                    data-testid="bar-weight-progress"
                  />
                </div>
                <p className="mt-2 text-sm text-white/70">
                  <span className="font-bold text-white">{weightProgressPct}%</span> toward goal
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-white/70">Keep logging to track your progress.</p>
            )}
          </div>

          {/* Current Weight (Estimated) */}
          <div className="flex-1 p-6 md:p-8">
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">
              Current Weight (Estimated)
            </p>
            {canProject && currentEstimatedWeight !== null ? (
              <>
                <div className="mt-2 flex items-end gap-2">
                  <span
                    className="text-5xl font-bold leading-[56px] text-[#1C1714]"
                    data-testid="text-total-weight-change"
                  >
                    {currentEstimatedWeight.toFixed(1)}
                  </span>
                  <span className="mb-1 text-xl text-[#6B6560]">kg</span>
                </div>
                {totalLoss !== 0 && (
                  <p className="mt-1 text-sm text-[#6B6560]">
                    <span className={`font-bold ${totalLoss < 0 ? "text-[#7A7869]" : "text-[#9B4A2E]"}`}>
                      {totalLoss > 0 ? "+" : ""}{totalLoss.toFixed(1)} kg
                    </span>{" "}
                    total change
                  </p>
                )}
              </>
            ) : (
              <div className="mt-2 flex items-end gap-2">
                <span className="text-5xl font-bold leading-[56px] text-[#1C1714]" data-testid="text-total-weight-change">
                  {totalLoss > 0 ? "+" : ""}{totalLoss.toFixed(1)}
                </span>
                <span className="mb-1 text-xl text-[#6B6560]">kg total</span>
              </div>
            )}

            <div className="mt-5">
              {weightDeltas.length === 0 ? (
                <p className="text-sm text-[#6B6560]">
                  Log your weight on the Progress page to start tracking.
                </p>
              ) : (
                weightDeltas.slice(-3).map((item, i, arr) => (
                  <div key={item.week}>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">{item.week}</span>
                      <span className={`text-sm font-bold ${item.delta <= 0 ? "text-[#7A7869]" : "text-[#9B4A2E]"}`}>
                        {item.delta > 0 ? "+" : ""}{item.delta.toFixed(1)} kg
                      </span>
                    </div>
                    {i < arr.length - 1 && <Separator className="bg-[#D4CFC8]" />}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Meal type breakdown ── */}
      <div className="mt-6 grid grid-cols-1 gap-0 border border-[#D4CFC8] md:grid-cols-3">
        {(["breakfast", "lunch", "dinner"] as const).map((key, i) => {
          const meta = MEAL_META[key];
          const Icon = meta.icon;
          const val = byType[key] || 0;
          const w = Math.min(100, (val / goal) * 100);
          return (
            <div
              key={key}
              className={`bg-white p-6 ${i < 2 ? "border-b border-[#D4CFC8] md:border-b-0 md:border-r" : ""}`}
              data-testid={`card-meal-${key}`}
            >
              <div className="flex h-10 w-10 items-center justify-center border border-[#D4CFC8] bg-[#EDE8E2]">
                <Icon className="h-5 w-5 text-[#7A7869]" />
              </div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">{meta.label}</p>
              <div className="mt-1 flex items-end gap-1">
                <span className="text-2xl font-bold text-[#1C1714]" data-testid={`text-meal-${key}-calories`}>
                  {val}
                </span>
                <span className="mb-0.5 text-sm text-[#6B6560]">kcal</span>
              </div>
              <div className="mt-4 h-1.5 w-full bg-[#EDE8E2]">
                <div className="h-full bg-[#7A7869]" style={{ width: `${w}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── This Week bar chart ── */}
      <div className="mt-6 border border-[#D4CFC8] bg-white">
        <div className="flex flex-col gap-2 border-b border-[#D4CFC8] p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">This Week</p>
            <h3 className="mt-0.5 text-2xl font-bold text-[#1C1714]">Calorie Intake</h3>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs text-[#6B6560]">
            <span className="flex items-center gap-2">
              <span className="h-2 w-5 bg-[#7A7869]" />
              <span>Avg: <span className="font-bold">{avg.toLocaleString()} kcal</span></span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-5 bg-[#B5A89A]" />
              <span>On target: <span className="font-bold">{consistencyPct}%</span></span>
            </span>
          </div>
        </div>
        <div className="p-6 md:p-8">
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: "#D4CFC8", strokeWidth: 1 }}
                  tick={{ fill: "#6B6560", fontSize: 11, fontWeight: 600 }}
                />
                <Bar dataKey="calories" radius={0}>
                  {series.map((s, i) => (
                    <Cell key={i} fill={s.calories > goal ? "#9B4A2E" : "#7A7869"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

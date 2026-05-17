import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
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
          className="mb-6 border border-[#475C65] bg-[#475C65]"
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
                    className="h-11 w-full gap-2 bg-white text-base font-bold text-[#475C65] hover:bg-white/90 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" /> Log Daily Meal
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-0 border border-[#c0cdd1] xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,418px)]">
        {/* ── Left: Today's calories ── */}
        <div className="border-b border-[#c0cdd1] bg-white p-6 md:p-8 xl:border-b-0 xl:border-r">
          <div className="flex flex-col justify-between gap-6 md:flex-row">
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#475C65]">Current Status</p>
              <div className="mt-3 flex items-end gap-3">
                <span
                  data-testid="text-today-calories"
                  className="text-5xl font-bold leading-[56px] tracking-[-0.96px] text-[#475C65]"
                >
                  {totals.calories}
                </span>
                <span className="pb-2 text-xl font-normal text-[#475C65]">kcal consumed</span>
              </div>
              <p className="mt-4 text-base text-[#424843]">
                <span className="font-bold text-[#475C65]">{remaining} kcal</span> remaining of your {goal} kcal daily goal.
              </p>

              {/* Calorie progress bar */}
              <div className="mt-5">
                <div className="h-3 w-full bg-[#e7e5df]">
                  <div
                    className="h-full bg-[#475C65] transition-all"
                    style={{ width: `${pct}%` }}
                    data-testid="bar-calorie-progress"
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#424843]">
                  <span>0</span>
                  <span data-testid="text-goal-percent">{pct}%</span>
                  <span>{goal}</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-0 border border-[#c0cdd1]">
                {[
                  { label: "Proteins", value: `${Math.round(totals.proteins)}g` },
                  { label: "Carbs", value: `${Math.round(totals.carbs)}g` },
                  { label: "Fats", value: `${Math.round(totals.fats)}g` },
                ].map((m, i) => (
                  <div key={m.label} className={`px-4 py-3 ${i < 2 ? "border-r border-[#c0cdd1]" : ""}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#424843]">{m.label}</p>
                    <p
                      className="mt-0.5 text-lg font-bold text-[#475C65]"
                      data-testid={`text-macro-${m.label.toLowerCase()}`}
                    >
                      {m.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Journey progress + Current weight ── */}
        <div className="flex flex-col bg-white">
          {/* Journey progress bar block */}
          <div className="border-b border-[#475C65] bg-[#475C65] p-6 md:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[2px] text-white/70">Journey</p>
                <p className="mt-1 text-2xl font-bold text-white" data-testid="text-journey-day">
                  Day {dayNum}
                </p>
              </div>
              {canProject && settings?.goalWeightKg && (
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[2px] text-white/70">Goal</p>
                  <p className="mt-1 text-sm font-bold text-white">{settings.goalWeightKg} kg</p>
                </div>
              )}
            </div>

            {canProject && currentEstimatedWeight !== null ? (
              <>
                <div className="mt-4 h-2.5 w-full bg-white/20">
                  <div
                    className="h-full bg-white transition-all"
                    style={{ width: `${weightProgressPct}%` }}
                    data-testid="bar-weight-progress"
                  />
                </div>
                <p className="mt-2 text-sm text-white/80">
                  <span className="font-bold">{weightProgressPct}%</span> toward your goal weight
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-white/80">Keep logging consistently to stay on track.</p>
            )}
          </div>

          {/* Current Weight (Estimated) block */}
          <div className="flex-1 p-6 md:p-8">
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#424843]">
              Current Weight (Estimated)
            </p>
            {canProject && currentEstimatedWeight !== null ? (
              <>
                <div className="mt-2 flex items-end gap-2">
                  <span
                    className="text-5xl font-bold leading-[56px] text-[#475C65]"
                    data-testid="text-total-weight-change"
                  >
                    {currentEstimatedWeight.toFixed(1)}
                  </span>
                  <span className="mb-1 text-xl text-[#424843]">kg</span>
                </div>
                {totalLoss !== 0 && (
                  <p className="mt-1 text-sm text-[#424843]">
                    <span className={`font-bold ${totalLoss < 0 ? "text-[#475C65]" : "text-[#c97d6f]"}`}>
                      {totalLoss > 0 ? "+" : ""}{totalLoss.toFixed(1)} kg
                    </span>{" "}
                    total change
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-5xl font-bold leading-[56px] text-[#475C65]" data-testid="text-total-weight-change">
                    {totalLoss > 0 ? "+" : ""}{totalLoss.toFixed(1)}
                  </span>
                  <span className="mb-1 text-xl text-[#424843]">kg total</span>
                </div>
              </>
            )}

            <div className="mt-5">
              {weightDeltas.length === 0 ? (
                <p className="text-sm text-[#424843]">
                  {canProject
                    ? "Log your weight on the Progress page to calibrate estimates."
                    : "Log your weight on the Progress page to start tracking."}
                </p>
              ) : (
                weightDeltas.slice(-3).map((item, i, arr) => (
                  <div key={item.week}>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#424843]">{item.week}</span>
                      <span
                        className={`text-sm font-bold ${item.delta <= 0 ? "text-[#475C65]" : "text-[#c97d6f]"}`}
                      >
                        {item.delta > 0 ? "+" : ""}{item.delta.toFixed(1)} kg
                      </span>
                    </div>
                    {i < arr.length - 1 && <Separator className="bg-[#c0cdd14c]" />}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Meal type breakdown ── */}
      <div className="mt-6 grid grid-cols-1 gap-0 border border-[#c0cdd1] md:grid-cols-3">
        {(["breakfast", "lunch", "dinner"] as const).map((key, i) => {
          const meta = MEAL_META[key];
          const Icon = meta.icon;
          const val = byType[key] || 0;
          const w = Math.min(100, (val / goal) * 100);
          return (
            <div
              key={key}
              className={`bg-white p-6 ${i < 2 ? "border-b border-[#c0cdd1] md:border-b-0 md:border-r" : ""}`}
              data-testid={`card-meal-${key}`}
            >
              <div className="flex h-10 w-10 items-center justify-center border border-[#c0cdd1] bg-[#f4f3ef]">
                <Icon className="h-5 w-5 text-[#475C65]" />
              </div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[2px] text-[#424843]">{meta.label}</p>
              <div className="mt-1 flex items-end gap-1">
                <span className="text-2xl font-bold text-[#1a1c1a]" data-testid={`text-meal-${key}-calories`}>
                  {val}
                </span>
                <span className="mb-0.5 text-sm text-[#424843]">kcal</span>
              </div>
              <div className="mt-4 h-2 w-full bg-[#e7e5df]">
                <div className="h-full bg-[#475C65]" style={{ width: `${w}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── This Week chart ── */}
      <div className="mt-6 border border-[#c0cdd1] bg-white">
        <div className="border-b border-[#c0cdd1] p-6 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#424843]">This Week</p>
              <h3 className="mt-1 text-2xl font-bold text-[#1a1c1a]">Calorie Intake</h3>
            </div>
            <div className="flex flex-wrap items-center gap-5 text-xs text-[#424843]">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 bg-[#475C65]" />
                <span>Daily Average: <span className="font-bold">{avg.toLocaleString()} kcal</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 bg-[#8aaab3]" />
                <span>On Target: <span className="font-bold">{consistencyPct}%</span></span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 md:p-8">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: "#c0cdd1", strokeWidth: 1 }}
                  tick={{ fill: "#424843", fontSize: 11, fontWeight: 700 }}
                />
                <Bar dataKey="calories" radius={0}>
                  {series.map((s, i) => (
                    <Cell key={i} fill={s.calories > goal ? "#c97d6f" : "#475C65"} />
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

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

  if (sLoading || mLoading) {
    return (
      <AppShell title="Overview">
        <Skeleton className="h-64 w-full rounded-3xl" />
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
        <Card
          data-testid="card-onboarding"
          className="mb-6 overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-[#476550] to-[#3f5b47] shadow-[0px_4px_6px_-4px_#0000001a,0px_10px_15px_-3px_#0000001a]"
        >
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
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
                    className="h-11 w-full gap-2 rounded-xl border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto"
                  >
                    <Target className="h-4 w-4" /> Set Goal
                  </Button>
                </Link>
                <Link href="/log">
                  <Button
                    data-testid="button-onboarding-log"
                    className="h-11 w-full gap-2 rounded-xl bg-white text-base font-bold text-[#476550] hover:bg-white/90 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" /> Log Daily Meal
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,418px)]">
        <Card className="rounded-3xl border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
          <CardContent className="flex h-full flex-col p-6 md:p-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row">
              <div className="flex-1">
                <p className="text-xs font-bold uppercase leading-4 tracking-[1.2px] text-[#486551]">Current Status</p>
                <div className="mt-3 flex items-end gap-3">
                  <span data-testid="text-today-calories" className="text-5xl font-bold leading-[56px] tracking-[-0.96px] text-[#476550]">
                    {totals.calories}
                  </span>
                  <span className="pb-2 text-xl font-normal text-[#476550]">kcal consumed</span>
                </div>
                <p className="mt-4 text-base text-[#424843]">
                  You have <span className="font-bold text-[#476550]">{remaining} kcal</span> remaining to reach your daily goal of {goal} kcal.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  {[
                    { label: "Proteins", value: `${Math.round(totals.proteins)}g` },
                    { label: "Carbs", value: `${Math.round(totals.carbs)}g` },
                    { label: "Fats", value: `${Math.round(totals.fats)}g` },
                  ].map((m) => (
                    <div key={m.label} className="rounded-lg border border-[#c2c8c14c] bg-[#eeeeea] px-4 py-2">
                      <p className="text-center text-xs text-[#424843]">{m.label}</p>
                      <p className="text-center text-base font-bold text-[#476550]" data-testid={`text-macro-${m.label.toLowerCase()}`}>
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center xl:justify-end">
                <div
                  className="flex h-44 w-44 items-center justify-center rounded-full md:h-56 md:w-56"
                  style={{
                    background: `conic-gradient(#476550 ${pct * 3.6}deg, #e7e5df 0deg)`,
                  }}
                >
                  <div className="flex h-[80%] w-[80%] flex-col items-center justify-center rounded-full bg-white">
                    <div className="text-3xl font-bold text-[#476550]" data-testid="text-goal-percent">{pct}%</div>
                    <div className="mt-1 text-xs text-[#424843]">of Goal</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden rounded-3xl border-0 bg-[#476550] shadow-[0px_4px_6px_-4px_#0000001a,0px_10px_15px_-3px_#0000001a]">
            <CardContent className="relative p-6 md:p-8">
              <div className="flex flex-col gap-2">
                <Sparkles className="h-7 w-7 text-white" />
                <h3 className="text-2xl font-normal text-white" data-testid="text-journey-day">
                  Day {dayNum} of your journey.
                </h3>
                <p className="text-base text-white/90">Keep logging consistently to stay on track.</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
            <CardContent className="p-6 md:p-8">
              <p className="text-sm font-bold uppercase tracking-[1.4px] text-[#424843]">Weight Progress</p>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-5xl font-bold leading-[56px] text-[#486551]" data-testid="text-total-weight-change">
                  {totalLoss > 0 ? "+" : ""}{totalLoss.toFixed(1)}
                </span>
                <span className="mb-1 text-xl text-[#424843]">kg total</span>
              </div>
              <div className="mt-6">
                {weightDeltas.length === 0 ? (
                  <p className="text-sm text-[#424843]">Log your weight on the Progress page to start tracking.</p>
                ) : (
                  weightDeltas.map((item, i) => (
                    <div key={item.week}>
                      <div className="flex items-center justify-between py-3">
                        <span className="text-sm font-medium text-[#1a1c1a]">{item.week}</span>
                        <span className="text-base font-bold text-[#486551]">
                          {item.delta > 0 ? "+" : ""}{item.delta.toFixed(1)} kg
                        </span>
                      </div>
                      {i < weightDeltas.length - 1 && <Separator className="bg-[#c2c8c133]" />}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {(["breakfast", "lunch", "dinner"] as const).map((key) => {
          const meta = MEAL_META[key];
          const Icon = meta.icon;
          const val = byType[key] || 0;
          const w = Math.min(100, (val / goal) * 100);
          return (
            <Card key={key} className="rounded-3xl border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
              <CardContent className="p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eeeeea]">
                  <Icon className="h-6 w-6 text-[#476550]" />
                </div>
                <p className="mt-3 text-xs text-[#424843]">{meta.label}</p>
                <div className="mt-1 flex items-end gap-1">
                  <span className="text-2xl text-[#1a1c1a]" data-testid={`text-meal-${key}-calories`}>{val}</span>
                  <span className="mb-0.5 text-base text-[#1a1c1a]">kcal</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eeeeea]">
                  <div className="h-full bg-[#486551]" style={{ width: `${w}%` }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card className="mt-6 rounded-3xl border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-2">
            <h3 className="text-2xl text-[#1a1c1a]">This Week</h3>
            <p className="text-sm font-medium text-[#424843]">Calorie intake over the last 7 days</p>
          </div>
          <div className="mt-8 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#424843", fontSize: 12 }} />
                <Bar dataKey="calories" radius={[6, 6, 0, 0]}>
                  {series.map((s, i) => (
                    <Cell key={i} fill={s.calories > goal ? "#c97d6f" : "#4f7159"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#476550]" />
              <p className="text-xs text-[#424843]">Daily Average: <span className="font-bold">{avg.toLocaleString()} kcal</span></p>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border border-[#47655033] bg-[#adcfb5]" />
              <p className="text-xs text-[#424843]">Target Consistency: <span className="font-bold">{consistencyPct}%</span></p>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

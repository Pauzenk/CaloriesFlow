import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Leaf } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import type { Meal, Settings, Weight } from "@shared/schema";
import {
  dailyCaloriesSeries,
  daysSince,
  lastNDates,
  mealsForDate,
  sumMacros,
  todayStr,
  weeklyWeightDeltas,
  weightProjectionSeries,
} from "@/lib/calorieflow";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

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
        <div className="mx-auto max-w-md space-y-4 font-['Space_Mono']">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppShell>
    );
  }

  const today = todayStr();
  const todays = mealsForDate(meals, today).slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const totals = sumMacros(todays);
  const goal = settings?.dailyCalorieGoal || 2000;
  const remaining = Math.max(0, goal - totals.calories);
  const dayNum = settings ? daysSince(settings.journeyStartDate) : 1;

  const weekDates = lastNDates(7);
  const series = dailyCaloriesSeries(meals, weekDates);
  const chartMax = Math.max(...series.map((s) => s.calories), goal, 1);

  const weightDeltas = weeklyWeightDeltas(weights, settings);
  const totalLoss = weightDeltas.reduce((a, d) => a + d.delta, 0);

  const showOnboarding = meals.length === 0;

  return (
    <AppShell title="Overview">
      <div
        className="mx-auto w-full max-w-md font-['Space_Mono'] text-[#1C1714]"
        data-testid="card-dashboard-feed"
      >
        {/* ── Sticky tally header ── */}
        <div className="sticky top-0 z-10 bg-[#F2EDE7] pb-4 border-b-2 border-[#1C1714] mb-8">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Today's Tally</p>
              <div className="text-5xl tracking-tighter leading-none" data-testid="text-today-calories">
                {totals.calories}
                <span className="text-lg opacity-50 ml-1">/ {goal}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Remaining</p>
              <div
                className={`text-3xl tracking-tighter leading-none ${totals.calories > goal ? "text-[#9B4A2E]" : ""}`}
                data-testid="text-remaining-calories"
              >
                {totals.calories > goal ? `+${totals.calories - goal}` : remaining}
              </div>
            </div>
          </div>

          <div className="flex justify-between border-t border-[#1C1714]/20 pt-3 mt-4 text-sm">
            <div className="flex gap-4">
              <div>
                <span className="opacity-50">PRO</span>{" "}
                <span data-testid="text-macro-proteins">{Math.round(totals.proteins)}g</span>
              </div>
              <div>
                <span className="opacity-50">CRB</span>{" "}
                <span data-testid="text-macro-carbs">{Math.round(totals.carbs)}g</span>
              </div>
              <div>
                <span className="opacity-50">FAT</span>{" "}
                <span data-testid="text-macro-fats">{Math.round(totals.fats)}g</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Journey block ── */}
        <div className="border border-[#1C1714] p-4 mb-8 text-sm">
          <div className="flex justify-between items-center mb-3 pb-3 border-b border-dashed border-[#1C1714]/20">
            <div className="uppercase tracking-widest text-xs opacity-60">Journey Statement</div>
            <div data-testid="text-journey-day">DAY {String(dayNum).padStart(2, "0")}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="opacity-50 text-xs mb-1 uppercase tracking-wide">Current Wt</div>
              <div className="text-lg" data-testid="text-total-weight-change">
                {canProject && currentEstimatedWeight !== null
                  ? `${currentEstimatedWeight.toFixed(1)} kg`
                  : totalLoss !== 0
                  ? `${totalLoss > 0 ? "+" : ""}${totalLoss.toFixed(1)} kg`
                  : "— kg"}
              </div>
            </div>
            <div>
              <div className="opacity-50 text-xs mb-1 uppercase tracking-wide">Goal Wt</div>
              <div className="text-lg">
                {settings?.goalWeightKg ? `${settings.goalWeightKg.toFixed(1)} kg` : "Not set"}
              </div>
            </div>
          </div>
          {canProject && (
            <div className="mt-4 pt-3 border-t border-dashed border-[#1C1714]/20 flex items-center justify-between">
              <div className="text-xs uppercase opacity-60">Progress</div>
              <div data-testid="text-goal-percent">{weightProgressPct}% Complete</div>
            </div>
          )}
        </div>

        {/* ── Ledger ── */}
        <div className="mb-12">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-4 border-b border-[#1C1714]/20 pb-2">
            Ledger
          </div>

          {showOnboarding ? (
            <div className="py-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-12 w-12 items-center justify-center border border-[#1C1714]/20">
                  <Leaf className="h-5 w-5 opacity-40" />
                </div>
              </div>
              <p className="text-xs uppercase tracking-widest opacity-60 mb-2">No entries yet</p>
              <p className="text-sm opacity-50 mb-6">Log your first meal to start your record.</p>
              <Link href="/log">
                <button
                  type="button"
                  data-testid="button-onboarding-log"
                  className="inline-flex items-center gap-2 border border-[#1C1714] px-6 py-2.5 text-xs uppercase tracking-widest hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors"
                >
                  <Plus className="h-3 w-3" /> Log Meal
                </button>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col">
                {todays.map((m) => (
                  <div
                    key={m.id}
                    data-testid={`row-meal-${m.id}`}
                    className="flex py-3 border-b border-[#1C1714]/10 hover:border-[#1C1714]/40 transition-colors"
                  >
                    <div className="w-14 text-xs opacity-50 pt-0.5 shrink-0">
                      {fmtTime(m.createdAt)}
                    </div>
                    <div className="flex-1 px-2 min-w-0">
                      <div className="leading-tight truncate">{m.name}</div>
                      <div className="text-[10px] uppercase opacity-50 tracking-widest mt-1">{m.mealType}</div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      +{m.calories}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center py-4 border-b-2 border-[#1C1714]">
                <div className="uppercase tracking-widest text-xs">Subtotal</div>
                <div className="tabular-nums" data-testid="text-subtotal">{totals.calories}</div>
              </div>

              <div className="mt-4">
                <Link href="/log">
                  <button
                    type="button"
                    data-testid="button-add-meal"
                    className="w-full border border-[#1C1714]/30 py-2.5 text-xs uppercase tracking-widest opacity-60 hover:opacity-100 hover:border-[#1C1714] transition-all"
                  >
                    <Plus className="inline h-3 w-3 mr-1" /> Add entry
                  </button>
                </Link>
              </div>
            </>
          )}
        </div>

        {/* ── 7-day volume chart ── */}
        <div className="mb-16">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-6 text-center">
            7-Day Volume
          </div>
          <div className="flex items-end justify-between h-32 px-2">
            {series.map((d, i) => {
              const isToday = d.date === today;
              const heightPct = d.calories > 0 ? Math.max(4, (d.calories / chartMax) * 100) : 1;
              const overGoal = d.calories > goal;
              return (
                <div key={i} className="flex flex-col items-center gap-2 flex-1">
                  <div
                    className="w-full max-w-[28px] transition-all relative group"
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: overGoal ? "#9B4A2E" : "#1C1714",
                      opacity: d.calories === 0 ? 0.15 : isToday ? 1 : 0.55,
                    }}
                    data-testid={`bar-week-${d.label}`}
                  >
                    {d.calories > 0 && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                        {d.calories}
                      </div>
                    )}
                  </div>
                  <div
                    className={`text-[10px] uppercase ${isToday ? "font-bold opacity-100" : "opacity-40"}`}
                  >
                    {d.label}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-[#1C1714] mt-3 pt-2 text-center text-[10px] uppercase opacity-40 tracking-widest">
            End of Record
          </div>
        </div>
      </div>
    </AppShell>
  );
}

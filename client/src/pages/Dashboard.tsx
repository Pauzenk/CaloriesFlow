import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Leaf, Activity } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import type { Meal, Settings, Weight } from "@shared/schema";
import type { Activity as ActivityType } from "@shared/schema";
import {
  daysSince,
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

function CalorieRing({
  consumed,
  goal,
}: {
  consumed: number;
  goal: number;
}) {
  const R = 52;
  const CX = 64;
  const STROKE = 9;
  const circumference = 2 * Math.PI * R;
  const pct = Math.min(1, consumed / goal);
  const overGoal = consumed > goal;
  const dashOffset = circumference * (1 - pct);
  const remaining = Math.max(0, goal - consumed);

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
        <svg width={128} height={128} viewBox="0 0 128 128">
          <circle
            cx={CX}
            cy={CX}
            r={R}
            fill="none"
            stroke="#1C1714"
            strokeOpacity={0.1}
            strokeWidth={STROKE}
          />
          <circle
            cx={CX}
            cy={CX}
            r={R}
            fill="none"
            stroke={overGoal ? "#9B4A2E" : "#1C1714"}
            strokeWidth={STROKE}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="square"
            transform={`rotate(-90 ${CX} ${CX})`}
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-xl leading-none tabular-nums tracking-tighter"
            data-testid="text-today-calories"
          >
            {consumed}
          </span>
          <span className="text-[9px] uppercase tracking-widest opacity-40 mt-0.5">kcal</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-widest opacity-40 mb-0.5">Goal</p>
          <div className="text-lg tabular-nums tracking-tighter leading-none">{goal}</div>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest opacity-40 mb-0.5">Remaining</p>
          <div
            className={`text-lg tabular-nums tracking-tighter leading-none ${overGoal ? "text-[#9B4A2E]" : ""}`}
            data-testid="text-remaining-calories"
          >
            {overGoal ? `+${consumed - goal}` : remaining}
          </div>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest opacity-40 mb-0.5">Progress</p>
          <div className="text-sm tabular-nums tracking-tighter leading-none">
            {Math.round(pct * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: settings, isLoading: sLoading } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: meals = [], isLoading: mLoading } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
  const { data: weights = [] } = useQuery<Weight[]>({ queryKey: ["/api/weights"] });
  const today = todayStr();
  const { data: activities = [] } = useQuery<ActivityType[]>({
    queryKey: ["/api/activities", today],
    queryFn: async () => {
      const res = await fetch(`/api/activities?from=${today}&to=${today}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

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
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppShell>
    );
  }

  const todays = mealsForDate(meals, today).slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const todayActivities = activities;
  const totals = sumMacros(todays);
  const totalActivityCalories = todayActivities.reduce((s, a) => s + a.caloriesBurned, 0);
  const netCalories = totals.calories - totalActivityCalories;
  const goal = settings?.dailyCalorieGoal || 2000;
  const dayNum = settings ? daysSince(settings.journeyStartDate) : 1;

  const weightDeltas = weeklyWeightDeltas(weights, settings);
  const totalLoss = weightDeltas.reduce((a, d) => a + d.delta, 0);

  const showOnboarding = meals.length === 0 && todayActivities.length === 0;

  return (
    <AppShell title="Overview">
      <div
        className="w-full font-['Space_Mono'] text-[#1C1714]"
        data-testid="card-dashboard-feed"
      >
        {/* ── Circular calorie ring header ── */}
        <div className="sticky top-0 z-10 bg-[#F2EDE7] pb-4 border-b-2 border-[#1C1714] mb-8">
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest opacity-60 mb-3">Today's Progress</p>
            <CalorieRing consumed={totals.calories} goal={goal} />
          </div>

          <div className="flex justify-between border-t border-[#1C1714]/20 pt-3 text-sm">
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

        {/* ── Ledger (meals + activities) ── */}
        <div className="mb-8">
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
                {todayActivities.map((a) => (
                  <div
                    key={a.id}
                    data-testid={`row-activity-${a.id}`}
                    className="flex py-3 border-b border-dashed border-[#1C1714]/20 pl-3 border-l-2 border-l-[#1C1714]/30"
                  >
                    <div className="w-14 text-xs opacity-50 pt-0.5 shrink-0 flex items-start">
                      <Activity className="h-3 w-3 opacity-40 mt-0.5" />
                    </div>
                    <div className="flex-1 px-2 min-w-0">
                      <div className="leading-tight truncate">{a.name}</div>
                      <div className="text-[10px] uppercase opacity-50 tracking-widest mt-1">
                        {a.activityType} · {a.durationMinutes}min
                      </div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums text-[#9B4A2E]">
                      −{a.caloriesBurned}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center py-4 border-b-2 border-[#1C1714]">
                <div className="uppercase tracking-widest text-xs">Net Calories</div>
                <div className="tabular-nums" data-testid="text-subtotal">{netCalories}</div>
              </div>

              <div className="mt-4">
                <Link href="/log">
                  <button
                    type="button"
                    data-testid="button-add-meal"
                    className="w-full bg-[#1C1714] text-[#F2EDE7] py-3 text-xs uppercase tracking-widest hover:bg-[#1C1714]/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="h-3 w-3" /> Add entry
                  </button>
                </Link>
              </div>
            </>
          )}
        </div>

        {/* ── Journey block ── */}
        <div className="border border-[#1C1714] p-4 mb-12 text-sm">
          <div className="flex justify-between items-center mb-3 pb-3 border-b border-dashed border-[#1C1714]/20">
            <div className="uppercase tracking-widest text-xs opacity-60">Journey Statement</div>
            <div data-testid="text-journey-day">DAY {String(dayNum).padStart(2, "0")}</div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
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
            <div className="pt-3 border-t border-dashed border-[#1C1714]/20">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase opacity-60">Journey Progress</div>
                <div data-testid="text-goal-percent" className="text-xs">{weightProgressPct}%</div>
              </div>
              <div className="w-full h-2 bg-[#1C1714]/10 overflow-hidden">
                <div
                  className="h-full bg-[#1C1714] transition-all duration-500"
                  style={{ width: `${weightProgressPct}%` }}
                  data-testid="bar-journey-progress"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

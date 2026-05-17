import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Leaf, Activity } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import type { Meal, Settings, Weight } from "@shared/schema";
import type { Activity as ActivityType } from "@shared/schema";
import { mealsForDate, sumMacros, todayStr } from "@/lib/calorieflow";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}


export default function Dashboard() {
  const { data: settings, isLoading: sLoading } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: meals = [], isLoading: mLoading } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
  const { data: _weights = [] } = useQuery<Weight[]>({ queryKey: ["/api/weights"] });
  const today = todayStr();
  const { data: activities = [] } = useQuery<ActivityType[]>({
    queryKey: ["/api/activities", today],
    queryFn: async () => {
      const res = await fetch(`/api/activities?from=${today}&to=${today}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

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
  const overGoal = netCalories > goal;
  const remaining = Math.max(0, goal - netCalories);
  const pct = Math.round(Math.min(100, (netCalories / goal) * 100));

  const showOnboarding = meals.length === 0 && todayActivities.length === 0;

  return (
    <AppShell title="Overview">
      <div className="w-full font-['Space_Mono'] text-[#1C1714]" data-testid="card-dashboard-feed">

        {/* ── 2-column progress header ── */}
        <div className="border-b-2 border-[#1C1714] pb-4 mb-8">
          <p className="text-[10px] uppercase tracking-widest opacity-60 mb-4">Today's Progress</p>
          <div className="grid grid-cols-2 items-center gap-3">

            {/* Col 1 — Macros */}
            <div className="flex flex-col gap-2.5">
              <div>
                <p className="text-[8px] uppercase tracking-widest opacity-40 mb-0.5">PRO</p>
                <div className="text-sm tabular-nums tracking-tighter leading-none" data-testid="text-macro-proteins">
                  {Math.round(totals.proteins)}g
                </div>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-widest opacity-40 mb-0.5">CRB</p>
                <div className="text-sm tabular-nums tracking-tighter leading-none" data-testid="text-macro-carbs">
                  {Math.round(totals.carbs)}g
                </div>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-widest opacity-40 mb-0.5">FAT</p>
                <div className="text-sm tabular-nums tracking-tighter leading-none" data-testid="text-macro-fats">
                  {Math.round(totals.fats)}g
                </div>
              </div>
            </div>

            {/* Col 2 — Goal / Remaining / Progress */}
            <div className="flex flex-col gap-2.5">
              <div>
                <p className="text-[8px] uppercase tracking-widest opacity-40 mb-0.5">Goal</p>
                <div className="text-sm tabular-nums tracking-tighter leading-none">{goal}</div>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-widest opacity-40 mb-0.5">Remaining</p>
                <div
                  className={`text-sm tabular-nums tracking-tighter leading-none ${overGoal ? "text-[#9B4A2E]" : ""}`}
                  data-testid="text-remaining-calories"
                >
                  {overGoal ? `+${netCalories - goal}` : remaining}
                </div>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-widest opacity-40 mb-0.5">Progress</p>
                <div className="text-sm tabular-nums tracking-tighter leading-none">{pct}%</div>
              </div>
            </div>

          </div>
        </div>

        {/* ── Daily Food List ── */}
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-4 border-b border-[#1C1714]/20 pb-2">
            Daily Food List
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
                    <div className="w-14 text-xs opacity-50 pt-0.5 shrink-0">{fmtTime(m.createdAt)}</div>
                    <div className="flex-1 px-2 min-w-0">
                      <div className="leading-tight truncate">{m.name}</div>
                      <div className="text-[10px] uppercase opacity-50 tracking-widest mt-1">{m.mealType}</div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">+{m.calories}</div>
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
                    <div className="text-right shrink-0 tabular-nums text-[#9B4A2E]">−{a.caloriesBurned}</div>
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
      </div>
    </AppShell>
  );
}

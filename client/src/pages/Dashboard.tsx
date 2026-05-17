import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Leaf, Activity, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Meal, Settings } from "@shared/schema";
import type { Activity as ActivityType } from "@shared/schema";
import {
  dailyCaloriesSeries,
  lastNDates,
  mealsForDate,
  sumMacros,
  todayStr,
} from "@/lib/calorieflow";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function Dashboard() {
  const { data: settings, isLoading: sLoading } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: meals = [], isLoading: mLoading } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
  const today = todayStr();
  const { data: activities = [] } = useQuery<ActivityType[]>({
    queryKey: ["/api/activities", today],
    queryFn: async () => {
      const res = await fetch(`/api/activities?from=${today}&to=${today}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const deleteMeal = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/meals/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/meals"] }),
  });

  const deleteActivity = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/activities/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/activities", today] }),
  });

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

  const todays = mealsForDate(meals, today).slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const todayActivities = activities;
  const totals = sumMacros(todays);
  const totalActivityCalories = todayActivities.reduce((s, a) => s + a.caloriesBurned, 0);
  const netCalories = totals.calories - totalActivityCalories;
  const goal = settings?.dailyCalorieGoal || 2000;
  const remaining = Math.max(0, goal - netCalories);

  const weekDates = lastNDates(7);
  const series = dailyCaloriesSeries(meals, weekDates);
  const chartMax = Math.max(...series.map((s) => s.calories), goal, 1);

  const showOnboarding = meals.length === 0 && todayActivities.length === 0;

  return (
    <AppShell title="Overview">
      <div className="w-full font-['Space_Mono'] text-[#1C1714]" data-testid="card-dashboard-feed">

        {/* ── Tally header ── */}
        <div className="pb-4 border-b-2 border-[#1C1714] mb-8">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Today's Tally</p>
              <div className="text-5xl tracking-tighter leading-none" data-testid="text-today-calories">
                {netCalories}
                <span className="text-lg opacity-50 ml-1">/ {goal}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Remaining</p>
              <div
                className={`text-3xl tracking-tighter leading-none ${netCalories > goal ? "text-[#9B4A2E]" : ""}`}
                data-testid="text-remaining-calories"
              >
                {netCalories > goal ? `+${netCalories - goal}` : remaining}
              </div>
            </div>
          </div>

          <div className="mt-4 mb-1">
            <div className="w-full h-1.5 bg-[#1C1714]/10 overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.round((netCalories / goal) * 100))}%`,
                  backgroundColor: netCalories > goal ? "#9B4A2E" : "#1C1714",
                }}
                data-testid="bar-calorie-progress"
              />
            </div>
          </div>

          <div className="flex justify-between border-t border-[#1C1714]/20 pt-3 mt-3 text-sm">
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

        {/* ── Daily Food Log ── */}
        <div className="mb-12">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-4 border-b border-[#1C1714]/20 pb-2">
            Daily Food Log
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
                    className="group flex items-center py-3 border-b border-[#1C1714]/10 hover:border-[#1C1714]/40 transition-colors"
                  >
                    <div className="w-14 text-xs opacity-50 pt-0.5 shrink-0">{fmtTime(m.createdAt)}</div>
                    <div className="flex-1 px-2 min-w-0">
                      <div className="leading-tight truncate">{m.name}</div>
                      <div className="text-[10px] uppercase opacity-50 tracking-widest mt-1">{m.mealType}</div>
                    </div>
                    <div className="tabular-nums shrink-0 mr-3">+{m.calories}</div>
                    <button
                      type="button"
                      data-testid={`button-delete-meal-${m.id}`}
                      onClick={() => deleteMeal.mutate(m.id)}
                      disabled={deleteMeal.isPending}
                      className="shrink-0 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity p-1"
                      aria-label="Delete meal"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {todayActivities.map((a) => (
                  <div
                    key={a.id}
                    data-testid={`row-activity-${a.id}`}
                    className="group flex items-center py-3 border-b border-dashed border-[#1C1714]/20 pl-3 border-l-2 border-l-[#1C1714]/30"
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
                    <div className="tabular-nums text-[#9B4A2E] shrink-0 mr-3">−{a.caloriesBurned}</div>
                    <button
                      type="button"
                      data-testid={`button-delete-activity-${a.id}`}
                      onClick={() => deleteActivity.mutate(a.id)}
                      disabled={deleteActivity.isPending}
                      className="shrink-0 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity p-1"
                      aria-label="Delete activity"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
                    className="w-full border border-[#9e4515]/40 py-2.5 text-xs uppercase tracking-widest text-[#9e4515] hover:border-[#9e4515] hover:bg-[#9e4515]/5 transition-all"
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
                  <div className={`text-[10px] uppercase ${isToday ? "font-bold opacity-100" : "opacity-40"}`}>
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

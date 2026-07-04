import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Activity, Trash2, ChevronLeft, ChevronRight, Pencil, Check, X, CalendarDays, Sparkles } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppShell } from "@/components/AppShell";
import { SetupPrompt } from "@/components/SetupPrompt";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Meal, Settings } from "@shared/schema";
import { MEAL_TYPES } from "@shared/schema";
import type { Activity as ActivityType } from "@shared/schema";
import {
  mealsForDate,
  sumMacros,
  todayStr,
  daysSince,
} from "@/lib/calorieflow";
import { useLanguage } from "@/contexts/LanguageContext";

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(dateStr: string, todayLabel: string, yesterdayLabel: string, lang: string): string {
  const today = todayStr();
  if (dateStr === today) return todayLabel;
  if (dateStr === offsetDate(today, -1)) return yesterdayLabel;
  return new Date(dateStr + "T00:00:00").toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

type EditState = {
  id: string;
  date: string;
  name: string;
  calories: string;
  proteins: string;
  carbs: string;
  fats: string;
  mealType: string;
} | null;

type ActivityEditState = {
  id: string;
  date: string;
  name: string;
  durationMinutes: string;
  activityType: string;
  caloriesBurned: string;
} | null;

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [editState, setEditState] = useState<EditState>(null);
  const [activityEditState, setActivityEditState] = useState<ActivityEditState>(null);
  const [pendingDeleteMeal, setPendingDeleteMeal] = useState<string | null>(null);
  const [pendingDeleteActivity, setPendingDeleteActivity] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const { t, lang } = useLanguage();

  const { data: settings, isLoading: sLoading } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: meals = [], isLoading: mLoading } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
  const { data: activities = [] } = useQuery<ActivityType[]>({
    queryKey: ["/api/activities", selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/activities?from=${selectedDate}&to=${selectedDate}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const deleteMeal = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/meals/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/meals"] }),
  });

  const updateMeal = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Meal> }) => {
      await apiRequest("PATCH", `/api/meals/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      setEditState(null);
    },
  });

  const deleteActivity = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/activities/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/activities", selectedDate] }),
  });

  const updateActivity = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { date: string; name: string; durationMinutes: number; caloriesBurned: number; activityType: string } }) => {
      await apiRequest("PATCH", `/api/activities/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities", selectedDate] });
      setActivityEditState(null);
    },
  });

  if (sLoading || mLoading) {
    return (
      <AppShell title={t("overview")}>
        <div className="mx-auto max-w-md space-y-4 font-['Space_Mono']">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppShell>
    );
  }

  const isToday = selectedDate === todayStr();
  const dayMeals = mealsForDate(meals, selectedDate).slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const dayActivities = activities;
  const totals = sumMacros(dayMeals);
  const totalActivityCalories = dayActivities.reduce((s, a) => s + a.caloriesBurned, 0);
  const goal = settings?.dailyCalorieGoal || 2000;
  const workoutMode = settings?.workoutCountingMode ?? "include_in_activity_level";
  const netCalories = workoutMode === "track_separately"
    ? totals.calories - totalActivityCalories
    : totals.calories;
  const remaining = Math.max(0, goal - netCalories);
  const dayNum = settings ? daysSince(settings.journeyStartDate, selectedDate) : null;

  const MEAL_LABELS: Record<string, string> = {
    breakfast: t("breakfast"),
    lunch: t("lunch"),
    dinner: t("dinner"),
    snack: t("snack"),
  };

  const mealsByType = new Map<string, Meal[]>();
  for (const type of MEAL_TYPES) mealsByType.set(type, []);
  for (const m of dayMeals) {
    if (!mealsByType.has(m.mealType)) mealsByType.set(m.mealType, []);
    mealsByType.get(m.mealType)!.push(m);
  }

  const showOnboarding = meals.length === 0 && dayActivities.length === 0;

  function startEdit(m: Meal) {
    setEditState({
      id: m.id,
      date: m.date,
      name: m.name,
      calories: String(m.calories),
      proteins: String(m.proteins),
      carbs: String(m.carbs),
      fats: String(m.fats),
      mealType: m.mealType,
    });
  }

  function commitEdit() {
    if (!editState) return;
    updateMeal.mutate({
      id: editState.id,
      data: {
        date: editState.date,
        name: editState.name,
        calories: parseFloat(editState.calories) || 0,
        proteins: parseFloat(editState.proteins) || 0,
        carbs: parseFloat(editState.carbs) || 0,
        fats: parseFloat(editState.fats) || 0,
        mealType: editState.mealType as Meal["mealType"],
      },
    });
  }

  function commitActivityEdit() {
    if (!activityEditState) return;
    updateActivity.mutate({
      id: activityEditState.id,
      data: {
        date: activityEditState.date,
        name: activityEditState.name,
        durationMinutes: parseInt(activityEditState.durationMinutes) || 0,
        caloriesBurned: parseInt(activityEditState.caloriesBurned) || 0,
        activityType: activityEditState.activityType,
      },
    });
  }

  const IN = "rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1714]";

  const profileIncomplete = !!settings && (!settings.heightCm || !settings.ageYears || !settings.startingWeightKg);

  return (
    <AppShell title={t("overview")}>
      <div className="w-full font-['Space_Mono'] text-[#1C1714]" data-testid="card-dashboard-feed">

        {/* ── Setup banner (non-blocking) ── */}
        {profileIncomplete && (
          <div className="mb-6 flex items-center justify-between gap-4 border border-[#1C1714]/20 px-4 py-3 text-xs">
            <span className="opacity-60">{t("setupForPersonalized")}</span>
            <Link href="/settings" className="shrink-0">
              <button
                type="button"
                data-testid="button-dashboard-setup"
                className="border border-[#1C1714]/40 px-3 py-1.5 uppercase tracking-widest hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors whitespace-nowrap"
              >
                {t("fillInParameters")}
              </button>
            </Link>
          </div>
        )}

        {/* ── Day navigator ── */}
        <div className="flex items-center justify-between mb-6 border-b border-[#1C1714]/20 pb-4">
          <button
            type="button"
            data-testid="button-dashboard-prev-day"
            onClick={() => { setSelectedDate((d) => offsetDate(d, -1)); setEditState(null); setActivityEditState(null); }}
            className="flex items-center gap-1 px-2 py-1.5 border border-[#1C1714]/20 hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4 opacity-60" />
          </button>

          <div className="flex flex-col items-center gap-0.5">
            <div className="relative cursor-pointer hover:opacity-70 transition-opacity">
              <div className="flex items-center gap-1.5 text-sm tracking-tight pointer-events-none">
                <CalendarDays className="h-3.5 w-3.5 opacity-50" />
                <span data-testid="text-dashboard-date">{formatDisplayDate(selectedDate, t("today"), t("yesterday"), lang)}</span>
              </div>
              <input
                ref={dateInputRef}
                type="date"
                value={selectedDate}
                max={todayStr()}
                onChange={(e) => { if (e.target.value) { setSelectedDate(e.target.value); setEditState(null); setActivityEditState(null); } }}
                data-testid="button-dashboard-date"
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              />
            </div>
            {dayNum !== null && (
              <div className="text-[10px] uppercase tracking-widest opacity-50">{t("day")} {dayNum}</div>
            )}
            {!isToday && (
              <button
                type="button"
                data-testid="button-dashboard-goto-today"
                onClick={() => { setSelectedDate(todayStr()); setEditState(null); setActivityEditState(null); }}
                className="text-[9px] uppercase tracking-widest opacity-50 hover:opacity-100 underline transition-opacity mt-0.5"
              >
                → {t("today")}
              </button>
            )}
          </div>

          <button
            type="button"
            data-testid="button-dashboard-next-day"
            onClick={() => { setSelectedDate((d) => offsetDate(d, 1)); setEditState(null); setActivityEditState(null); }}
            disabled={isToday}
            className="flex items-center gap-1 px-2 py-1.5 border border-[#1C1714]/20 hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4 opacity-60" />
          </button>
        </div>

        {/* ── Tally header ── */}
        <div className="pb-4 border-b-2 border-[#1C1714] mb-8">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">
                {isToday ? t("todaysTally") : t("daysTally")}
              </p>
              <div className="text-5xl tracking-tighter leading-none" data-testid="text-today-calories">
                {netCalories}
                <span className="text-lg opacity-50 ml-1">/ {goal}</span>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-[10px] uppercase tracking-widest mb-1 ${netCalories > goal ? "text-red-500 opacity-80" : "opacity-60"}`}>
                {netCalories > goal ? t("surplusLabel") : t("remaining")}
              </p>
              <div
                className={`text-3xl tracking-tighter leading-none ${netCalories > goal ? "text-red-500" : ""}`}
                data-testid="text-remaining-calories"
              >
                {netCalories > goal ? `+${netCalories - goal}` : remaining}
              </div>
            </div>
          </div>

          {/* Eaten · Burned · Net breakdown */}
          <div className="flex gap-4 mt-2.5 text-[10px] uppercase tracking-widest opacity-60" data-testid="row-eaten-burned-net">
            <span>
              {t("eatenLabel")}{" "}
              <span className="tabular-nums opacity-100 text-[#1C1714]" data-testid="text-eaten">{totals.calories}</span>
            </span>
            <span>
              · {t("burnedLabel")}{" "}
              <span className="tabular-nums opacity-100 text-[#1C1714]" data-testid="text-burned">{totalActivityCalories}</span>
            </span>
            <span>
              · {t("netLabel")}{" "}
              <span className="tabular-nums opacity-100 text-[#1C1714]" data-testid="text-net">{netCalories}</span>
            </span>
          </div>

          <div className="mt-3 mb-1">
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
                <span className="opacity-50">CARB</span>{" "}
                <span data-testid="text-macro-carbs">{Math.round(totals.carbs)}g</span>
              </div>
              <div>
                <span className="opacity-50">FAT</span>{" "}
                <span data-testid="text-macro-fats">{Math.round(totals.fats)}g</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Food Log ── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 border-b border-[#1C1714]/20 pb-2">
            <div className="text-xs uppercase tracking-widest opacity-60">
              {isToday ? t("dailyFoodLog") : `${t("foodLog")} — ${formatDisplayDate(selectedDate, t("today"), t("yesterday"), lang)}`}
            </div>
          </div>

          {showOnboarding ? (
            <div className="py-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-12 w-12 items-center justify-center border border-[#1C1714]/20">
                  <Activity className="h-5 w-5 opacity-40" />
                </div>
              </div>
              <p className="text-xs uppercase tracking-widest opacity-60 mb-2">{t("noEntriesYet")}</p>
              <p className="text-sm opacity-60 mb-6">{t("logFirstMeal")}</p>
              <Link href={`/log?date=${selectedDate}`}>
                <button
                  type="button"
                  data-testid="button-onboarding-log"
                  className="inline-flex items-center gap-2 border border-[#1C1714] px-6 py-2.5 text-xs uppercase tracking-widest hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors"
                >
                  <Plus className="h-3 w-3" /> {t("logMeal")}
                </button>
              </Link>
            </div>
          ) : (
            <>
              {MEAL_TYPES.map((type) => {
                const typeMeals = mealsByType.get(type) ?? [];
                if (typeMeals.length === 0) return null;
                return (
                  <div key={type} className="mb-3">
                    <div className="text-[10px] uppercase tracking-widest opacity-50 mb-1 pt-1">
                      {MEAL_LABELS[type] ?? type}
                    </div>
                    {typeMeals.map((m) => (
                      <div key={m.id} data-testid={`row-meal-${m.id}`}>
                        {editState?.id === m.id ? (
                          <div className="border border-[#1C1714]/20 p-3 mb-2 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="col-span-2">
                                <input
                                  type="text"
                                  value={editState.name}
                                  onChange={(e) => setEditState((s) => s && ({ ...s, name: e.target.value }))}
                                  className={IN + " h-8 text-sm w-full px-2 border"}
                                  placeholder="Food name"
                                  data-testid="input-edit-name"
                                />
                              </div>
                              <select
                                value={editState.mealType}
                                onChange={(e) => setEditState((s) => s && ({ ...s, mealType: e.target.value }))}
                                className={IN + " h-8 text-xs w-full px-2 border"}
                                data-testid="select-edit-type"
                              >
                                {MEAL_TYPES.map((tp) => (
                                  <option key={tp} value={tp}>{MEAL_LABELS[tp] ?? tp}</option>
                                ))}
                              </select>
                              <div className="grid grid-cols-4 gap-1">
                                {(["calories", "proteins", "carbs", "fats"] as const).map((k) => (
                                  <div key={k}>
                                    <div className="text-[8px] uppercase opacity-50 mb-0.5">
                                      {k === "calories" ? "kcal" : k === "proteins" ? "pro" : k === "carbs" ? "crb" : "fat"}
                                    </div>
                                    <input
                                      type="number" step="0.1"
                                      value={editState[k]}
                                      onChange={(e) => setEditState((s) => s && ({ ...s, [k]: e.target.value }))}
                                      className={IN + " h-7 text-xs w-full px-1 border tabular-nums"}
                                      data-testid={`input-edit-${k}`}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={commitEdit}
                                disabled={updateMeal.isPending}
                                data-testid="button-confirm-edit"
                                className="flex items-center gap-1 bg-[#1C1714] text-[#F2EDE7] px-3 py-1 text-[10px] uppercase tracking-widest hover:bg-[#1C1714]/80 disabled:opacity-40"
                              >
                                <Check className="h-3 w-3" /> {t("save")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditState(null)}
                                data-testid="button-cancel-edit"
                                className="flex items-center gap-1 border border-[#1C1714]/30 px-3 py-1 text-[10px] uppercase tracking-widest hover:border-[#1C1714]"
                              >
                                <X className="h-3 w-3" /> {t("cancel")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group flex items-center py-2.5 border-b border-[#1C1714]/10 hover:border-[#1C1714]/40 transition-colors">
                            <div className="flex-1 pr-4 min-w-0">
                              <div className="leading-tight truncate">{m.name}</div>
                            </div>
                            <div className="tabular-nums shrink-0 mr-2 opacity-80 min-w-[3.5rem] text-right">+{m.calories}</div>
                            <div className="flex gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                type="button"
                                data-testid={`button-edit-meal-${m.id}`}
                                onClick={() => startEdit(m)}
                                className="h-7 w-7 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                data-testid={`button-delete-meal-${m.id}`}
                                onClick={() => setPendingDeleteMeal(m.id)}
                                className="h-7 w-7 flex items-center justify-center opacity-50 hover:opacity-100 hover:text-[#9B4A2E] transition-all"
                                aria-label="Delete meal"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}

              {dayActivities.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] uppercase tracking-widest opacity-50 mb-1 pt-1">{t("activity")}</div>
                  {dayActivities.map((a) => (
                    <div key={a.id} data-testid={`row-activity-${a.id}`}>
                      {activityEditState?.id === a.id ? (
                        <div className="border border-[#1C1714]/20 p-3 mb-2 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2">
                              <input
                                type="text"
                                value={activityEditState.name}
                                onChange={(e) => setActivityEditState((s) => s && ({ ...s, name: e.target.value }))}
                                className={IN + " h-8 text-sm w-full px-2 border"}
                                placeholder="Activity name"
                                data-testid="input-edit-activity-name"
                              />
                            </div>
                            <select
                              value={activityEditState.activityType}
                              onChange={(e) => setActivityEditState((s) => s && ({ ...s, activityType: e.target.value }))}
                              className={IN + " h-8 text-xs w-full px-2 border"}
                              data-testid="select-edit-activity-type"
                            >
                              {["cardio", "strength", "other"].map((at) => (
                                <option key={at} value={at}>{at}</option>
                              ))}
                            </select>
                            <div className="grid grid-cols-2 gap-1">
                              <div>
                                <div className="text-[8px] uppercase opacity-50 mb-0.5">min</div>
                                <input
                                  type="number"
                                  value={activityEditState.durationMinutes}
                                  onChange={(e) => setActivityEditState((s) => s && ({ ...s, durationMinutes: e.target.value }))}
                                  className={IN + " h-7 text-xs w-full px-1 border tabular-nums"}
                                  data-testid="input-edit-activity-duration"
                                />
                              </div>
                              <div>
                                <div className="text-[8px] uppercase opacity-50 mb-0.5">kcal</div>
                                <input
                                  type="number"
                                  value={activityEditState.caloriesBurned}
                                  onChange={(e) => setActivityEditState((s) => s && ({ ...s, caloriesBurned: e.target.value }))}
                                  className={IN + " h-7 text-xs w-full px-1 border tabular-nums"}
                                  data-testid="input-edit-activity-kcal"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={commitActivityEdit}
                              disabled={updateActivity.isPending}
                              data-testid="button-confirm-activity-edit"
                              className="flex items-center gap-1 bg-[#1C1714] text-[#F2EDE7] px-3 py-1 text-[10px] uppercase tracking-widest hover:bg-[#1C1714]/80 disabled:opacity-40"
                            >
                              <Check className="h-3 w-3" /> {t("save")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActivityEditState(null)}
                              data-testid="button-cancel-activity-edit"
                              className="flex items-center gap-1 border border-[#1C1714]/30 px-3 py-1 text-[10px] uppercase tracking-widest hover:border-[#1C1714]"
                            >
                              <X className="h-3 w-3" /> {t("cancel")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="group flex items-center py-2.5 border-b border-dashed border-[#1C1714]/20 pl-2 border-l-2 border-l-[#1C1714]/30">
                          <div className="flex-1 px-2 min-w-0">
                            <div className="leading-tight truncate">{a.name}</div>
                            <div className="text-[10px] uppercase opacity-50 tracking-widest mt-0.5">
                              {a.activityType} · {a.durationMinutes}min
                            </div>
                          </div>
                          {workoutMode === "track_separately" ? (
                            <div className="tabular-nums text-[#9B4A2E] shrink-0 mr-2">−{a.caloriesBurned}</div>
                          ) : (
                            <div className="text-[9px] uppercase tracking-widest opacity-35 shrink-0 mr-2 leading-none text-right">
                              {a.caloriesBurned} kcal<br />{t("includedInActivity")}
                            </div>
                          )}
                          <div className="flex gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              type="button"
                              data-testid={`button-edit-activity-${a.id}`}
                              onClick={() => setActivityEditState({ id: a.id, date: a.date, name: a.name, durationMinutes: String(a.durationMinutes), activityType: a.activityType, caloriesBurned: String(a.caloriesBurned) })}
                              className="h-7 w-7 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                              aria-label="Edit activity"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              data-testid={`button-delete-activity-${a.id}`}
                              onClick={() => setPendingDeleteActivity(a.id)}
                              className="h-7 w-7 flex items-center justify-center opacity-50 hover:opacity-100 hover:text-[#9B4A2E] transition-all"
                              aria-label="Delete activity"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {dayMeals.length === 0 && dayActivities.length === 0 && (
                <div className="py-6 text-center border border-dashed border-[#1C1714]/20">
                  <p className="text-xs opacity-50">{t("noEntriesFor")} {formatDisplayDate(selectedDate, t("today"), t("yesterday"), lang)}.</p>
                </div>
              )}

              <div className="flex justify-between items-center py-4 border-b-2 border-[#1C1714]">
                <div className="uppercase tracking-widest text-xs opacity-60">{t("netCalories")}</div>
                <div className="tabular-nums" data-testid="text-subtotal">{netCalories}</div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex gap-3">
                <Link href={`/log?date=${selectedDate}`} className="flex-1">
                  <button
                    type="button"
                    data-testid="button-add-meal"
                    className="w-full bg-[#1C1714] text-[#F2EDE7] py-3 text-xs uppercase tracking-widest hover:bg-[#1C1714]/85 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t("addEntry")}
                  </button>
                </Link>
                {isToday && remaining > 0 && (
                  <Link href={`/recipes?date=${selectedDate}`}>
                    <button
                      type="button"
                      data-testid="button-meal-ideas"
                      className="border border-[#1C1714]/40 text-[#1C1714] py-3 px-4 text-xs uppercase tracking-widest hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors flex items-center justify-center gap-2"
                      title={`${remaining} kcal remaining — get recipe ideas`}
                    >
                      <Sparkles className="h-3.5 w-3.5 opacity-60" /> {t("recipes")}
                    </button>
                  </Link>
                )}
              </div>
            </>
          )}
        </div>

      </div>

      <AlertDialog open={!!pendingDeleteMeal} onOpenChange={(o) => { if (!o) setPendingDeleteMeal(null); }}>
        <AlertDialogContent className="rounded-none font-['Space_Mono']">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDeleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none" onClick={() => setPendingDeleteMeal(null)}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-[#9B4A2E] hover:bg-[#9B4A2E]/80"
              onClick={() => { if (pendingDeleteMeal) { deleteMeal.mutate(pendingDeleteMeal); setPendingDeleteMeal(null); } }}
            >
              {t("confirmDeleteBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDeleteActivity} onOpenChange={(o) => { if (!o) setPendingDeleteActivity(null); }}>
        <AlertDialogContent className="rounded-none font-['Space_Mono']">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDeleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none" onClick={() => setPendingDeleteActivity(null)}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-[#9B4A2E] hover:bg-[#9B4A2E]/80"
              onClick={() => { if (pendingDeleteActivity) { deleteActivity.mutate(pendingDeleteActivity); setPendingDeleteActivity(null); } }}
            >
              {t("confirmDeleteBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

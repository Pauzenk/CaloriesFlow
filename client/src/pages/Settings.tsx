import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  upsertSettingsSchema,
  type Settings,
  type UpsertSettings,
  ACTIVITY_LEVELS,
  ACTIVITY_MULTIPLIERS,
  type ActivityLevel,
  type GoalMode,
} from "@shared/schema";
import {
  computeBMR,
  computeTDEE,
  computeBMI,
  getBMICategory,
  getHealthyWeightRange,
} from "@/lib/calorieflow";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Lang } from "@/lib/i18n";

const IN =
  "rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1714] placeholder:opacity-40";

const BMI_COLORS: Record<string, string> = {
  underweight: "text-blue-600",
  normal: "text-emerald-700",
  overweight: "text-amber-600",
  obese: "text-red-600",
};


export default function SettingsPage() {
  const { toast } = useToast();
  const { t, lang, setLang } = useLanguage();
  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const [planMonths, setPlanMonths] = useState<number | null>(null);
  const planInitialized = useRef(false);
  const [restartOpen, setRestartOpen] = useState(false);

  const restart = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/account/data"),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: t("restartSuccess") });
    },
    onError: () => toast({ title: "Failed to reset data", variant: "destructive" }),
  });

  const activityLabelMap: Record<ActivityLevel, string> = {
    sedentary: t("actSedentary"),
    lightly_active: t("actLightlyActive"),
    moderately_active: t("actModeratelyActive"),
    very_active: t("actVeryActive"),
  };

  const activityDescMap: Record<ActivityLevel, string> = {
    sedentary: t("actDescSedentary"),
    lightly_active: t("actDescLightlyActive"),
    moderately_active: t("actDescModeratelyActive"),
    very_active: t("actDescVeryActive"),
  };

  const form = useForm<UpsertSettings>({
    resolver: zodResolver(upsertSettingsSchema),
    defaultValues: {
      dailyCalorieGoal: 2000,
      startingWeightKg: 0,
      currentWeightKg: 0,
      journeyStartDate: new Date().toISOString().slice(0, 10),
      heightCm: null,
      ageYears: null,
      sexAtBirth: null,
      goalWeightKg: null,
      activityLevel: "sedentary",
      goalDurationMonths: null,
      goalMode: "weight_loss",
      workoutCountingMode: "include_in_activity_level",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        dailyCalorieGoal: settings.dailyCalorieGoal,
        startingWeightKg: settings.startingWeightKg,
        currentWeightKg: settings.currentWeightKg,
        journeyStartDate: settings.journeyStartDate,
        heightCm: settings.heightCm ?? null,
        ageYears: settings.ageYears ?? null,
        sexAtBirth: (settings.sexAtBirth as "male" | "female" | null) ?? null,
        goalWeightKg: settings.goalWeightKg ?? null,
        activityLevel: (settings.activityLevel as ActivityLevel) ?? "sedentary",
        goalDurationMonths: settings.goalDurationMonths ?? null,
        goalMode: (settings.goalMode as GoalMode) ?? "weight_loss",
        workoutCountingMode: (settings.workoutCountingMode as "include_in_activity_level" | "track_separately") ?? "include_in_activity_level",
      });
      if (settings.goalDurationMonths) setPlanMonths(settings.goalDurationMonths);
    }
  }, [settings]);

  const watchedHeight = form.watch("heightCm");
  const watchedAge = form.watch("ageYears");
  const watchedSex = form.watch("sexAtBirth");
  const watchedStartWeight = form.watch("startingWeightKg");
  const watchedCurrentWeight = form.watch("currentWeightKg");
  const watchedGoalWeight = form.watch("goalWeightKg");
  const watchedActivityLevel = form.watch("activityLevel");
  const watchedMode = (form.watch("goalMode") ?? "weight_loss") as GoalMode;
  const watchedCalorieGoal = form.watch("dailyCalorieGoal");

  // Use starting weight for all calculations — currentWeightKg is legacy and not user-facing
  const weightForCalc = watchedStartWeight && watchedStartWeight > 0 ? watchedStartWeight : 0;

  const estimatedTDEE = useMemo(() => {
    if (!watchedHeight || !watchedAge || !watchedSex || !weightForCalc) return null;
    const bmr = computeBMR(weightForCalc, watchedHeight, watchedAge, watchedSex as "male" | "female");
    const multiplier = ACTIVITY_MULTIPLIERS[(watchedActivityLevel as ActivityLevel) ?? "sedentary"] ?? 1.2;
    return Math.round(computeTDEE(bmr, multiplier));
  }, [watchedHeight, watchedAge, watchedSex, weightForCalc, watchedActivityLevel]);

  // BMI panel — computed from height + current/start weight
  const bmiData = useMemo(() => {
    if (!watchedHeight || !weightForCalc) return null;
    const bmi = computeBMI(weightForCalc, watchedHeight);
    const category = getBMICategory(bmi);
    const range = getHealthyWeightRange(watchedHeight);
    return { bmi: +bmi.toFixed(1), category, range };
  }, [watchedHeight, weightForCalc]);

  // Auto-select goal mode based on goal weight vs starting weight
  useEffect(() => {
    if (!watchedGoalWeight || !watchedStartWeight) return;
    const diff = watchedGoalWeight - watchedStartWeight;
    if (Math.abs(diff) < 0.1) {
      form.setValue("goalMode", "maintenance");
    } else if (diff > 0) {
      form.setValue("goalMode", "weight_gain");
    } else {
      form.setValue("goalMode", "weight_loss");
    }
  }, [watchedGoalWeight, watchedStartWeight]);

  // ── Optimal plan — mode-aware ────────────────────────────────────────────────
  const optimalPlan = useMemo(() => {
    if (!estimatedTDEE) return null;

    if (watchedMode === "maintenance") {
      return { calorie: estimatedTDEE, days: null };
    }

    if (!watchedStartWeight || !watchedGoalWeight) return null;
    const weightDiff = Math.abs(watchedStartWeight - watchedGoalWeight);
    if (weightDiff <= 0) return null;

    if (watchedMode === "weight_gain") {
      const optimalDays = Math.round((weightDiff * 7700) / 350);
      return { calorie: estimatedTDEE + 350, days: optimalDays };
    }

    // weight_loss default
    const optimalDays = Math.round((weightDiff * 7700) / 500);
    return { calorie: Math.max(1200, estimatedTDEE - 500), days: optimalDays };
  }, [estimatedTDEE, watchedStartWeight, watchedGoalWeight, watchedMode]);

  // Initialize plan once when optimalPlan first becomes available
  useEffect(() => {
    if (planInitialized.current || !optimalPlan) return;
    planInitialized.current = true;
    if (settings?.goalDurationMonths && settings.goalDurationMonths > 0) {
      setPlanMonths(settings.goalDurationMonths);
      if (estimatedTDEE && watchedStartWeight && watchedGoalWeight) {
        const remaining = Math.abs(watchedStartWeight - watchedGoalWeight);
        const totalDays = settings.goalDurationMonths * 30.44;
        const dailyChange = (remaining * 7700) / totalDays;
        const newGoal = watchedMode === "weight_gain"
          ? Math.round(estimatedTDEE + dailyChange)
          : Math.max(1200, Math.round(estimatedTDEE - dailyChange));
        form.setValue("dailyCalorieGoal", newGoal);
      }
    } else {
      if (optimalPlan.days) setPlanMonths(Math.max(1, Math.round(optimalPlan.days / 30.44)));
      form.setValue("dailyCalorieGoal", optimalPlan.calorie);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimalPlan]);

  function goalDateFromMonths(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short", year: "numeric" });
  }

  function handleMonthsChange(raw: string) {
    const months = parseInt(raw, 10);
    setPlanMonths(months > 0 ? months : null);
    if (!months || months <= 0) return;
    form.setValue("goalDurationMonths", months);
    if (!estimatedTDEE || !watchedStartWeight || !watchedGoalWeight) return;
    const remaining = Math.abs(watchedStartWeight - watchedGoalWeight);
    const totalDays = months * 30.44;
    const dailyChange = (remaining * 7700) / totalDays;
    form.setValue(
      "dailyCalorieGoal",
      watchedMode === "weight_gain"
        ? Math.round(estimatedTDEE + dailyChange)
        : Math.max(1200, Math.round(estimatedTDEE - dailyChange)),
    );
  }

  function handleCaloriesChange(raw: string) {
    const cal = parseInt(raw, 10);
    form.setValue("dailyCalorieGoal", cal || 0);
    if (!cal || cal < 500 || !estimatedTDEE || !watchedStartWeight || !watchedGoalWeight) return;
    const remaining = Math.abs(watchedStartWeight - watchedGoalWeight);
    if (remaining <= 0) return;
    const dailyChange = watchedMode === "weight_gain" ? cal - estimatedTDEE : estimatedTDEE - cal;
    if (dailyChange <= 0) { setPlanMonths(null); return; }
    const months = Math.max(1, Math.round((remaining * 7700) / dailyChange / 30.44));
    setPlanMonths(months);
    form.setValue("goalDurationMonths", months);
  }

  const planWarning = useMemo(() => {
    if (!estimatedTDEE || watchedMode === "maintenance") return null;
    if (watchedCalorieGoal > 0 && watchedCalorieGoal < 1200) return t("planUnsafeWarning");
    if (watchedMode === "weight_loss" && watchedCalorieGoal > 0 && estimatedTDEE - watchedCalorieGoal > 1000) return t("planAggressiveWarning");
    return null;
  }, [estimatedTDEE, watchedCalorieGoal, watchedMode, t]);

  const recommendedMonths = optimalPlan?.days ? Math.max(1, Math.round(optimalPlan.days / 30.44)) : null;

  const canComputeTarget =
    watchedMode === "maintenance"
      ? !!estimatedTDEE
      : !!(estimatedTDEE && watchedGoalWeight && watchedStartWeight);

  const save = useMutation({
    mutationFn: async (data: UpsertSettings) => {
      // Keep currentWeightKg in sync with startingWeightKg — it is not user-facing
      const payload = { ...data, currentWeightKg: data.startingWeightKg };
      const res = await apiRequest("PUT", "/api/settings", payload);
      return (await res.json()) as Settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: t("saveChanges") });
    },
    onError: (err: unknown) =>
      toast({
        title: lang === "ru" ? "Ошибка сохранения" : "Failed to save",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      }),
  });

  const bmiCategoryLabel: Record<string, string> = {
    underweight: t("bmiUnderweight"),
    normal: t("bmiNormal"),
    overweight: t("bmiOverweight"),
    obese: t("bmiObese"),
  };

  const profileEmpty = !!settings && !settings.heightCm && !settings.ageYears && !settings.startingWeightKg;

  return (
    <AppShell title={t("settingsTitle")}>
      <div className="w-full font-['Space_Mono'] text-[#1C1714] max-w-2xl">

        {/* ── Welcome banner for new users ── */}
        {profileEmpty && (
          <div className="mb-8 border border-[#1C1714] px-5 py-4">
            <p className="text-[10px] uppercase tracking-widest opacity-50 mb-1">{t("setupRequired")}</p>
            <p className="text-sm leading-relaxed opacity-75">{t("welcomeSetup")}</p>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => save.mutate(data))} className="space-y-10">

            {/* ── Language ── */}
            <div>
              <div className="text-xs uppercase tracking-widest opacity-60 mb-1 border-b border-[#1C1714]/20 pb-2">
                {t("language")}
              </div>
              <p className="text-[10px] opacity-50 mb-4 mt-2">{t("languageHint")}</p>
              <div className="flex gap-2">
                {(["en", "ru"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    data-testid={`button-lang-${l}`}
                    onClick={() => setLang(l)}
                    className={`px-5 py-2.5 text-xs uppercase tracking-widest border transition-colors ${
                      lang === l
                        ? "bg-[#1C1714] text-[#F2EDE7] border-[#1C1714]"
                        : "border-[#1C1714]/30 hover:border-[#1C1714]"
                    }`}
                  >
                    {l === "en" ? "English" : "Русский"}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Body Metrics ── */}
            <div>
              <div className="text-xs uppercase tracking-widest opacity-60 mb-1 border-b border-[#1C1714]/20 pb-2">
                {t("bodyMetrics")}
              </div>
              <p className="text-[10px] opacity-50 mb-4 mt-2">{t("bodyMetricsHint")}</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="startingWeightKg" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">{t("startWeight")}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" inputMode="decimal"
                          data-testid="input-starting-weight"
                          placeholder="e.g. 70.0"
                          className={IN + " tabular-nums"} {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="goalWeightKg" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">
                        {watchedMode === "maintenance" ? t("goalOptional") : t("goalWeight")}
                      </FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1"
                          placeholder={watchedMode === "maintenance" ? "—" : "e.g. 68.0"}
                          data-testid="input-goal-weight"
                          className={IN + " tabular-nums"} value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <FormField control={form.control} name="heightCm" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">{t("height")}</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="175" data-testid="input-height"
                          className={IN + " tabular-nums"} value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="ageYears" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">{t("age")}</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="30" data-testid="input-age"
                          className={IN + " tabular-nums"} value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sexAtBirth" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">{t("sex")}</FormLabel>
                      <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v === "" ? null : v)}>
                        <FormControl>
                          <SelectTrigger data-testid="select-sex"
                            className="rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus:ring-0 text-sm h-9">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male" className="font-['Space_Mono']">{t("male")}</SelectItem>
                          <SelectItem value="female" className="font-['Space_Mono']">{t("female")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="journeyStartDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">{t("journeyStartDate")}</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-start-date"
                        className={IN + " max-w-[220px]"} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* ── BMI Panel ── */}
                {bmiData && (
                  <div className="border border-[#1C1714]/20 p-4 space-y-3" data-testid="panel-bmi">
                    <div className="text-[9px] uppercase tracking-widest opacity-50">{t("bmiPanel")}</div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-[9px] uppercase tracking-widest opacity-40 mb-0.5">{t("bmi")}</div>
                        <div
                          className={`text-2xl tabular-nums tracking-tighter font-bold ${BMI_COLORS[bmiData.category]}`}
                          data-testid="text-bmi"
                        >
                          {bmiData.bmi}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-widest opacity-40 mb-0.5">
                          {lang === "ru" ? "Категория" : "Category"}
                        </div>
                        <div
                          className={`text-xs font-bold uppercase tracking-wider mt-1 ${BMI_COLORS[bmiData.category]}`}
                          data-testid="text-bmi-category"
                        >
                          {bmiCategoryLabel[bmiData.category]}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-widest opacity-40 mb-0.5">{t("healthyRange")}</div>
                        <div className="text-sm tabular-nums opacity-70 mt-1">
                          {bmiData.range.minKg}–{bmiData.range.maxKg} kg
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </div>

            {/* ── Activity Level ── */}
            <div>
              <div className="text-xs uppercase tracking-widest opacity-60 mb-1 border-b border-[#1C1714]/20 pb-2">
                {t("activityLevel")}
              </div>
              <p className="text-[10px] opacity-50 mb-4 mt-2">{t("activityLevelHint")}</p>
              <FormField control={form.control} name="activityLevel" render={({ field }) => (
                <FormItem>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {ACTIVITY_LEVELS.map((level) => {
                      const active = field.value === level;
                      return (
                        <button key={level} type="button" data-testid={`radio-activity-${level}`}
                          onClick={() => field.onChange(level)}
                          className={`flex flex-col gap-1 border px-4 py-3 text-left transition-colors ${
                            active
                              ? "border-[#1C1714] bg-[#1C1714] text-[#F2EDE7]"
                              : "border-[#1C1714]/30 text-[#1C1714] hover:border-[#1C1714]"
                          }`}>
                          <span className="text-xs uppercase tracking-wider font-bold">{activityLabelMap[level]}</span>
                          <span className={`text-[10px] leading-snug ${active ? "opacity-70" : "opacity-50"}`}>
                            {activityDescMap[level]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── Workout Counting ── */}
            <div>
              <div className="text-xs uppercase tracking-widest opacity-60 mb-1 border-b border-[#1C1714]/20 pb-2">
                {t("workoutCounting")}
              </div>
              <p className="text-[10px] opacity-50 mb-4 mt-2">{t("workoutCountingHint")}</p>
              <FormField control={form.control} name="workoutCountingMode" render={({ field }) => (
                <FormItem>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(["include_in_activity_level", "track_separately"] as const).map((mode) => {
                      const active = field.value === mode;
                      const label = mode === "include_in_activity_level" ? t("workoutModeInclude") : t("workoutModeTrack");
                      const desc = mode === "include_in_activity_level" ? t("workoutModeIncludeDesc") : t("workoutModeTrackDesc");
                      return (
                        <button key={mode} type="button" data-testid={`radio-workout-${mode}`}
                          onClick={() => field.onChange(mode)}
                          className={`flex flex-col gap-1 border px-4 py-3 text-left transition-colors ${
                            active
                              ? "border-[#1C1714] bg-[#1C1714] text-[#F2EDE7]"
                              : "border-[#1C1714]/30 text-[#1C1714] hover:border-[#1C1714]"
                          }`}>
                          <span className="text-xs uppercase tracking-wider font-bold">{label}</span>
                          <span className={`text-[10px] leading-snug ${active ? "opacity-70" : "opacity-50"}`}>{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── Plan ── */}
            <div>
              <div className="text-xs uppercase tracking-widest opacity-60 mb-1 border-b border-[#1C1714]/20 pb-2">
                {t("dailyTarget")}
              </div>

              {canComputeTarget ? (
                <div className="space-y-5 mt-4">

                  {/* TDEE reference row */}
                  <div className="border border-[#1C1714]/30 p-4 grid grid-cols-2 gap-4" data-testid="panel-estimates">
                    <div data-testid="panel-tdee">
                      <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">{t("maintenance")}</div>
                      <div className="text-2xl tabular-nums" data-testid="text-tdee">{estimatedTDEE?.toLocaleString()}</div>
                      <div className="text-[10px] opacity-40 mt-0.5">{t("kcalPerDay")}</div>
                    </div>
                    {watchedMode === "maintenance" ? (
                      <div data-testid="panel-suggested-goal">
                        <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">{t("modeMaintenance")}</div>
                        <div className="text-2xl tabular-nums text-emerald-700" data-testid="text-suggested-goal">{estimatedTDEE?.toLocaleString()}</div>
                        <div className="text-[10px] opacity-40 mt-0.5">{t("kcalPerDay")}</div>
                      </div>
                    ) : watchedMode === "weight_gain" ? (
                      <div data-testid="panel-suggested-goal">
                        <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">{t("surplus300")}</div>
                        <div className="text-2xl tabular-nums text-blue-600" data-testid="text-suggested-goal">{((estimatedTDEE ?? 0) + 350).toLocaleString()}</div>
                        <div className="text-[10px] opacity-40 mt-0.5">{t("kcalPerDay")}</div>
                      </div>
                    ) : (
                      <div data-testid="panel-suggested-goal">
                        <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">{t("deficit500")}</div>
                        <div className="text-2xl tabular-nums text-[#9e4515]" data-testid="text-suggested-goal">{((estimatedTDEE ?? 0) - 500).toLocaleString()}</div>
                        <div className="text-[10px] opacity-40 mt-0.5">{t("kcalPerDay")}</div>
                      </div>
                    )}
                  </div>

                  {/* 2-way planner — loss / gain only */}
                  {watchedMode !== "maintenance" && (
                    <div className="border-2 border-[#1C1714] p-5 space-y-5" data-testid="panel-planner">

                      {/* Recommended headline */}
                      {recommendedMonths && optimalPlan && watchedStartWeight && watchedGoalWeight && (
                        <div>
                          <p className="text-[9px] uppercase tracking-widest opacity-50 mb-1">{t("recommendedTag")}</p>
                          <p className="text-sm leading-snug opacity-70">
                            {(watchedMode === "weight_loss" ? t("planRecommendedLoss") : t("planRecommendedGain"))
                              .replace("{kg}", String(Math.abs(watchedStartWeight - watchedGoalWeight).toFixed(1)))
                              .replace("{months}", String(recommendedMonths))
                              .replace("{cal}", optimalPlan.calorie.toLocaleString())}
                          </p>
                        </div>
                      )}

                      {/* 2-way inputs */}
                      <div>
                        <p className="text-[9px] uppercase tracking-widest opacity-50 mb-3">{t("adjustYourPlan")}</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] uppercase tracking-widest opacity-60 block mb-2">
                              {t("planMonthsLabel")}
                            </label>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={120}
                              data-testid="input-plan-months"
                              value={planMonths ?? ""}
                              onChange={(e) => handleMonthsChange(e.target.value)}
                              className={IN + " text-3xl h-14 tabular-nums w-full px-3"}
                            />
                            {planMonths && planMonths > 0 && (
                              <p className="text-[10px] opacity-40 mt-1">
                                {t("planGoalDateLabel")} {goalDateFromMonths(planMonths)}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-widest opacity-60 block mb-2">
                              {t("planCaloriesLabel")}
                            </label>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={800}
                              max={10000}
                              data-testid="input-plan-calories"
                              value={watchedCalorieGoal || ""}
                              onChange={(e) => handleCaloriesChange(e.target.value)}
                              className={IN + " text-3xl h-14 tabular-nums w-full px-3"}
                            />
                            <p className="text-[10px] opacity-40 mt-1">{t("kcalPerDay")}</p>
                          </div>
                        </div>
                      </div>

                      {/* Warning */}
                      {planWarning && (
                        <div className="border border-[#9e4515] px-4 py-3 text-[10px] text-[#9e4515] leading-snug" data-testid="text-plan-warning">
                          {planWarning}
                        </div>
                      )}

                      {/* Monthly rate */}
                      {planMonths && planMonths > 0 && watchedStartWeight && watchedGoalWeight && (
                        <div className="border-t border-[#1C1714]/10 pt-4 flex gap-6">
                          <div>
                            <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">{t("planMonthlyLabel")}</p>
                            <p className="text-base tabular-nums">
                              ~{(Math.abs(watchedStartWeight - watchedGoalWeight) / planMonths).toFixed(1)} kg
                              <span className="text-[10px] opacity-40 ml-1">/ {lang === "ru" ? "мес." : "mo"}</span>
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">{t("planGoalDateLabel")}</p>
                            <p className="text-base">{goalDateFromMonths(planMonths)}</p>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                </div>
              ) : (
                <div className="border border-dashed border-[#1C1714]/20 px-5 py-6 text-center mt-4">
                  <p className="text-[10px] opacity-40 leading-relaxed">{t("fillMetricsHint")}</p>
                </div>
              )}
            </div>

            {/* ── Save ── */}
            <div className="border-t-2 border-[#1C1714] pt-6 flex flex-col items-start gap-3">
              <button
                type="submit"
                disabled={save.isPending}
                data-testid="button-save-settings"
                className="border-2 border-[#1C1714] px-12 py-3 text-xs uppercase tracking-widest hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors disabled:opacity-40 w-full sm:w-auto"
              >
                {save.isPending ? t("saving") : t("saveChanges")}
              </button>
              <div className="text-[10px] opacity-30 tracking-widest uppercase">{t("endOfRecord")}</div>
            </div>

          </form>
        </Form>

        {/* ── Danger zone ── */}
        <div className="border-t border-[#1C1714]/20 pt-8 mt-4">
          <button
            type="button"
            data-testid="button-restart"
            onClick={() => setRestartOpen(true)}
            disabled={restart.isPending}
            className="text-[10px] uppercase tracking-widest text-[#9B4A2E] border border-[#9B4A2E]/40 px-6 py-2.5 hover:bg-[#9B4A2E]/10 transition-colors disabled:opacity-40"
          >
            {restart.isPending ? "…" : t("restartLabel")}
          </button>
        </div>

      </div>

      <AlertDialog open={restartOpen} onOpenChange={setRestartOpen}>
        <AlertDialogContent className="font-['Space_Mono'] bg-[#F2EDE7] border-2 border-[#1C1714] rounded-none max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1C1714] tracking-tight">
              {t("restartConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#1C1714]/60 text-sm leading-relaxed">
              {t("restartConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none border-[#1C1714]/30 bg-transparent text-[#1C1714] hover:bg-[#1C1714]/5 uppercase text-xs tracking-widest font-['Space_Mono']">
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-restart-confirm"
              onClick={() => restart.mutate()}
              className="rounded-none bg-[#9B4A2E] text-[#F2EDE7] hover:bg-[#7a3a24] uppercase text-xs tracking-widest font-['Space_Mono']"
            >
              {t("restartConfirmBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppShell>
  );
}

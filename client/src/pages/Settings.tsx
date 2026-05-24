import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  GOAL_MODES,
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

const DURATION_MONTHS = [1, 2, 3, 4, 5, 6] as const;

const BMI_COLORS: Record<string, string> = {
  underweight: "text-blue-600",
  normal: "text-emerald-700",
  overweight: "text-amber-600",
  obese: "text-red-600",
};

function calcGoalDateFromMonths(months: number, lang: Lang): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short", year: "numeric" });
}

function daysToReadable(days: number, lang: Lang): string {
  if (days < 14) return lang === "ru" ? `${days} дн.` : `${days} days`;
  if (days < 60) {
    const wks = Math.round(days / 7);
    return lang === "ru" ? `${wks} нед.` : `${wks} wks`;
  }
  const months = (days / 30.44).toFixed(1);
  return lang === "ru" ? `${months} мес.` : `${months} mo`;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { t, lang, setLang } = useLanguage();
  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

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
      });
      if (settings.goalDurationMonths) setSelectedDuration(settings.goalDurationMonths);
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

  // Use current weight for calculations when available, fall back to starting weight
  const weightForCalc =
    watchedCurrentWeight && watchedCurrentWeight > 0
      ? watchedCurrentWeight
      : watchedStartWeight && watchedStartWeight > 0
      ? watchedStartWeight
      : 0;

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

  function calcGoalForDuration(months: number): number | null {
    if (!estimatedTDEE) return null;
    if (watchedMode === "maintenance") return estimatedTDEE;
    if (!watchedGoalWeight || !watchedStartWeight) return null;
    const remaining = Math.abs(watchedStartWeight - watchedGoalWeight);
    if (remaining <= 0) return estimatedTDEE;
    const totalDays = months * 30.44;
    const dailyChange = (remaining * 7700) / totalDays;
    if (watchedMode === "weight_gain") return Math.round(estimatedTDEE + dailyChange);
    return Math.max(1200, Math.round(estimatedTDEE - dailyChange));
  }

  function handleSelectOptimal() {
    if (!optimalPlan) return;
    form.setValue("dailyCalorieGoal", optimalPlan.calorie);
    if (optimalPlan.days !== null) {
      const approxMonths = Math.round(optimalPlan.days / 30.44);
      const clampedMonths = Math.max(1, Math.min(6, approxMonths));
      form.setValue("goalDurationMonths", clampedMonths);
    }
    setSelectedDuration(null);
  }

  function handleDurationSelect(months: number) {
    setSelectedDuration(months);
    const newGoal = calcGoalForDuration(months);
    if (newGoal !== null) form.setValue("dailyCalorieGoal", newGoal);
    form.setValue("goalDurationMonths", months);
  }

  const canComputeTarget =
    watchedMode === "maintenance"
      ? !!estimatedTDEE
      : !!(estimatedTDEE && watchedGoalWeight && watchedStartWeight);

  const save = useMutation({
    mutationFn: async (data: UpsertSettings) => {
      const res = await apiRequest("PUT", "/api/settings", data);
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

  const modeConfig: Record<GoalMode, { label: string; desc: string }> = {
    weight_loss: { label: t("modeLoss"), desc: t("modeLossDesc") },
    maintenance: { label: t("modeMaintenance"), desc: t("modeMaintenanceDesc") },
    weight_gain: { label: t("modeGain"), desc: t("modeGainDesc") },
  };

  const bmiCategoryLabel: Record<string, string> = {
    underweight: t("bmiUnderweight"),
    normal: t("bmiNormal"),
    overweight: t("bmiOverweight"),
    obese: t("bmiObese"),
  };

  return (
    <AppShell title={t("settingsTitle")}>
      <div className="w-full font-['Space_Mono'] text-[#1C1714] max-w-2xl">
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
                        <Input type="number" step="0.1" data-testid="input-starting-weight"
                          className={IN + " tabular-nums"} {...field}
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

            {/* ── Goal Mode ── */}
            <div>
              <div className="text-xs uppercase tracking-widest opacity-60 mb-1 border-b border-[#1C1714]/20 pb-2">
                {t("goalMode")}
              </div>
              <p className="text-[10px] opacity-50 mb-4 mt-2">{t("goalModeHint")}</p>
              <FormField control={form.control} name="goalMode" render={({ field }) => (
                <FormItem>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(GOAL_MODES as readonly GoalMode[]).map((mode) => {
                      const active = field.value === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          data-testid={`radio-mode-${mode}`}
                          onClick={() => field.onChange(mode)}
                          className={`flex flex-col gap-1 border px-4 py-3 text-left transition-colors ${
                            active
                              ? "border-[#1C1714] bg-[#1C1714] text-[#F2EDE7]"
                              : "border-[#1C1714]/30 text-[#1C1714] hover:border-[#1C1714]"
                          }`}
                        >
                          <span className="text-xs uppercase tracking-wider font-bold">
                            {modeConfig[mode].label}
                          </span>
                          <span className={`text-[10px] leading-snug ${active ? "opacity-70" : "opacity-50"}`}>
                            {modeConfig[mode].desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
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

            {/* ── Daily Target ── */}
            <div>
              <div className="text-xs uppercase tracking-widest opacity-60 mb-1 border-b border-[#1C1714]/20 pb-2">
                {t("dailyTarget")}
              </div>
              <p className="text-[10px] opacity-50 mb-5 mt-2 leading-relaxed">
                {watchedMode === "weight_loss"
                  ? t("lossGoalHint")
                  : watchedMode === "maintenance"
                  ? t("maintenanceTargetHint")
                  : t("gainGoalHint")}
              </p>

              {canComputeTarget ? (
                <div className="space-y-5">

                  {/* ① Primary recommendation card */}
                  {optimalPlan && (
                    <div className="border-2 border-[#1C1714] p-5" data-testid="panel-optimal-time">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <p className="text-[9px] uppercase tracking-widest opacity-60 mb-1">
                            {watchedMode === "maintenance" ? t("maintenanceOnly") : t("optimalTime")}
                          </p>
                          <p className="text-xs opacity-50 leading-snug">
                            {watchedMode === "maintenance"
                              ? t("maintenanceTargetHint")
                              : t("optimalTimeSubtitle")}
                          </p>
                        </div>
                        {optimalPlan.days !== null && (
                          <div className="shrink-0 text-right">
                            <p className="text-3xl tabular-nums tracking-tighter leading-none" data-testid="text-optimal-days">
                              {daysToReadable(optimalPlan.days, lang)}
                            </p>
                            <p className="text-[9px] uppercase tracking-widest opacity-40 mt-0.5">
                              {watchedMode === "weight_gain" ? t("withSurplus300") : t("withDeficit500")}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-[#1C1714]/15 pt-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">{t("optimalCalorieGoal")}</p>
                          <p className="text-xl tabular-nums tracking-tighter" data-testid="text-optimal-calorie">
                            {optimalPlan.calorie.toLocaleString()}
                            <span className="text-xs opacity-40 ml-1">{t("kcalPerDay")}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          data-testid="button-select-optimal"
                          onClick={handleSelectOptimal}
                          className="bg-[#1C1714] text-[#F2EDE7] px-5 py-2.5 text-[10px] uppercase tracking-widest hover:bg-[#1C1714]/80 transition-colors shrink-0"
                        >
                          {t("selectPlan")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ② Calculated Estimates — Maintenance + Mode-specific */}
                  <div data-testid="panel-estimates">
                    <div className="text-[9px] uppercase tracking-widest opacity-50 mb-3">{t("calculatedEstimates")}</div>
                    <div className="border border-[#1C1714]/30 p-4 grid grid-cols-2 gap-4">
                      <div data-testid="panel-tdee">
                        <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">{t("maintenance")}</div>
                        <div className="text-2xl tabular-nums" data-testid="text-tdee">
                          {estimatedTDEE?.toLocaleString()}
                        </div>
                        <div className="text-[10px] opacity-40 mt-0.5">{t("kcalPerDay")}</div>
                      </div>

                      {watchedMode === "maintenance" ? (
                        <div data-testid="panel-suggested-goal">
                          <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">{t("modeMaintenance")}</div>
                          <div className="text-2xl tabular-nums text-emerald-700" data-testid="text-suggested-goal">
                            {estimatedTDEE?.toLocaleString()}
                          </div>
                          <div className="text-[10px] opacity-40 mt-0.5">{t("kcalPerDay")}</div>
                        </div>
                      ) : watchedMode === "weight_gain" ? (
                        <div data-testid="panel-suggested-goal">
                          <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">{t("surplus300")}</div>
                          <div className="text-2xl tabular-nums text-blue-600" data-testid="text-suggested-goal">
                            {((estimatedTDEE ?? 0) + 350).toLocaleString()}
                          </div>
                          <div className="text-[10px] opacity-40 mt-0.5">{t("kcalPerDay")}</div>
                        </div>
                      ) : (
                        <div data-testid="panel-suggested-goal">
                          <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">{t("deficit500")}</div>
                          <div className="text-2xl tabular-nums text-[#9e4515]" data-testid="text-suggested-goal">
                            {((estimatedTDEE ?? 0) - 500).toLocaleString()}
                          </div>
                          <div className="text-[10px] opacity-40 mt-0.5">{t("kcalPerDay")}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ③ Duration picker — only for loss / gain */}
                  {watchedMode !== "maintenance" && (
                    <div>
                      <div className="text-[9px] uppercase tracking-widest opacity-50 mb-3">{t("moreOptions")}</div>
                      <div className="grid grid-cols-1 gap-2">
                        {DURATION_MONTHS.map((m) => {
                          const suggested = calcGoalForDuration(m);
                          const isSelected = selectedDuration === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              data-testid={`button-duration-${m}`}
                              onClick={() => handleDurationSelect(m)}
                              className={`flex items-center justify-between px-5 py-4 border transition-colors text-left ${
                                isSelected
                                  ? "bg-[#1C1714] text-[#F2EDE7] border-[#1C1714]"
                                  : "border-[#1C1714]/30 hover:border-[#1C1714] hover:bg-[#1C1714]/5"
                              }`}
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm uppercase tracking-widest font-bold">
                                  {m} {m === 1 ? t("month") : t("months")}
                                </span>
                                <span className={`text-[10px] ${isSelected ? "opacity-55" : "opacity-40"}`}>
                                  {t("goalBy")} {calcGoalDateFromMonths(m, lang)}
                                </span>
                              </div>
                              {suggested !== null && (
                                <div className="text-right">
                                  <span className={`text-lg tabular-nums font-medium ${isSelected ? "opacity-90" : "opacity-70"}`}>
                                    {suggested.toLocaleString()}
                                  </span>
                                  <span className={`text-[10px] ml-1 ${isSelected ? "opacity-50" : "opacity-40"}`}>{t("kcalPerDay")}</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {selectedDuration !== null && (
                        <div className="border border-[#1C1714]/20 px-4 py-3 text-[10px] opacity-60 mt-2">
                          {t("targetSetTo")}{" "}
                          <span className="opacity-100 font-bold text-[#1C1714]">
                            {calcGoalForDuration(selectedDuration)?.toLocaleString() ?? "—"} {t("kcalPerDay")}
                          </span>
                          {" "}{t("saveBelow")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="border border-dashed border-[#1C1714]/20 px-5 py-6 text-center">
                  <p className="text-[10px] opacity-40 leading-relaxed">{t("fillMetricsHint")}</p>
                </div>
              )}
            </div>

            {/* ── Calorie Target (manual override) ── */}
            <div>
              <div className="text-xs uppercase tracking-widest opacity-60 mb-4 border-b border-[#1C1714]/20 pb-2">
                {t("calorieTarget")}
              </div>
              <FormField control={form.control} name="dailyCalorieGoal" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">
                    {t("calorieTargetLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input type="number" data-testid="input-goal"
                      className={IN + " text-3xl h-14 tabular-nums max-w-[260px]"}
                      {...field} onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
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
      </div>
    </AppShell>
  );
}

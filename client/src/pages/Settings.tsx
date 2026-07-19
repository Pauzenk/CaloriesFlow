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
  ACTIVITY_MULTIPLIERS,
  type Settings,
  type UpsertSettings,
  type GoalMode,
} from "@shared/schema";
import {
  computeBMR,
  computeTDEE,
  computeBMI,
  getBMICategory,
  getHealthyWeightRange,
  iterateDaysToGoal,
  solveCaloriesForTimeline,
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
  const [_showActivityNotice, _setShowActivityNotice] = useState(
    () => !localStorage.getItem("activityLevelNoticeSeen"),
  );

  const restart = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/account/data"),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: t("restartSuccess") });
    },
    onError: () => toast({ title: "Failed to reset data", variant: "destructive" }),
  });

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
        activityLevel: settings.activityLevel ?? "sedentary",
        goalDurationMonths: settings.goalDurationMonths ?? null,
        goalMode: (settings.goalMode as GoalMode) ?? "weight_loss",
        workoutCountingMode: (settings.workoutCountingMode as "include_in_activity_level" | "track_separately") ?? "include_in_activity_level",
      });
      if (settings.goalDurationMonths) {
        setPlanMonths(settings.goalDurationMonths);
        // User already has a saved plan duration — don't let the recommended-plan
        // effect below overwrite it with a freshly computed recommendation.
        planInitialized.current = true;
        // Align the mode-change tracker with the loaded mode so the mode-reset
        // effect doesn't mistake this initial load for a genuine mode change
        // (which would wipe out planInitialized and override the saved plan).
        prevModeRef.current = (settings.goalMode as GoalMode) ?? "weight_loss";
      }
    }
  }, [settings]);

  const watchedHeight = form.watch("heightCm");
  const watchedAge = form.watch("ageYears");
  const watchedSex = form.watch("sexAtBirth");
  const watchedStartWeight = form.watch("startingWeightKg");
  const watchedCurrentWeight = form.watch("currentWeightKg");
  const watchedGoalWeight = form.watch("goalWeightKg");
  const watchedMode = (form.watch("goalMode") ?? "weight_loss") as GoalMode;
  const watchedCalorieGoal = form.watch("dailyCalorieGoal");
  const watchedActivityLevel = form.watch("activityLevel") ?? "sedentary";

  // Use starting weight for all calculations — currentWeightKg is legacy and not user-facing
  const weightForCalc = watchedStartWeight && watchedStartWeight > 0 ? watchedStartWeight : 0;

  const activityMultiplier = ACTIVITY_MULTIPLIERS[watchedActivityLevel as keyof typeof ACTIVITY_MULTIPLIERS] ?? 1.2;

  const estimatedTDEE = useMemo(() => {
    if (!watchedHeight || !watchedAge || !watchedSex || !weightForCalc) return null;
    const bmr = computeBMR(weightForCalc, watchedHeight, watchedAge, watchedSex as "male" | "female");
    return Math.round(computeTDEE(bmr, activityMultiplier));
  }, [watchedHeight, watchedAge, watchedSex, weightForCalc, activityMultiplier]);

  // BMI panel — computed from height + current/start weight
  const bmiData = useMemo(() => {
    if (!watchedHeight || !weightForCalc) return null;
    const bmi = computeBMI(weightForCalc, watchedHeight);
    const category = getBMICategory(bmi);
    const range = getHealthyWeightRange(watchedHeight);
    return { bmi: +bmi.toFixed(1), category, range };
  }, [watchedHeight, weightForCalc]);

  const isGoalBelowHealthyRange = !!(watchedGoalWeight && bmiData && watchedGoalWeight < bmiData.range.minKg);

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

    if (!watchedStartWeight || !watchedGoalWeight || !watchedHeight || !watchedAge || !watchedSex) return null;
    if (watchedSex !== "male" && watchedSex !== "female") return null;
    const weightDiff = Math.abs(watchedStartWeight - watchedGoalWeight);
    if (weightDiff <= 0) return null;

    if (watchedMode === "weight_gain") {
      const calorie = estimatedTDEE + 350;
      const days = iterateDaysToGoal(watchedStartWeight, watchedGoalWeight, watchedHeight, watchedAge, watchedSex, calorie, "weight_gain", activityMultiplier);
      return { calorie, days };
    }

    // weight_loss — iterative simulation so slowing rate near goal is captured
    const idealCalorie = estimatedTDEE - 500;
    const calorie = idealCalorie >= 1200 ? idealCalorie : 1200;
    const days = iterateDaysToGoal(watchedStartWeight, watchedGoalWeight, watchedHeight, watchedAge, watchedSex, calorie, "weight_loss", activityMultiplier);
    return { calorie, days };
  }, [estimatedTDEE, watchedStartWeight, watchedGoalWeight, watchedMode, watchedHeight, watchedAge, watchedSex, activityMultiplier]);

  // Reset adjuster when goal direction changes (loss ↔ gain ↔ maintenance)
  const prevModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevModeRef.current === null) { prevModeRef.current = watchedMode; return; }
    if (prevModeRef.current === watchedMode) return;
    prevModeRef.current = watchedMode;
    planInitialized.current = false; // allow re-initialization from new optimalPlan
  }, [watchedMode]);

  // Initialize plan once when optimalPlan first becomes available (also re-runs after mode change)
  useEffect(() => {
    if (planInitialized.current || !optimalPlan) return;
    planInitialized.current = true;
    // Always initialize from the recommended plan — stale saved months may be inconsistent
    if (optimalPlan.days) setPlanMonths(Math.max(1, Math.round(optimalPlan.days / 30.44)));
    form.setValue("dailyCalorieGoal", optimalPlan.calorie);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimalPlan]);

  function goalDateFromDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short", year: "numeric" });
  }

  function handleMonthsChange(raw: string) {
    const months = parseInt(raw, 10);
    if (!months || months <= 0) { setPlanMonths(null); return; }
    if (!watchedStartWeight || !watchedGoalWeight || !watchedHeight || !watchedAge || !watchedSex) {
      setPlanMonths(months);
      form.setValue("goalDurationMonths", months, { shouldDirty: true });
      return;
    }
    if (watchedSex !== "male" && watchedSex !== "female") return;
    const mode = watchedMode === "weight_gain" ? "weight_gain" : "weight_loss";
    const targetDays = months * 30.44;
    // No calorie floor — solver returns the raw required intake; warning shown if < 1200
    const { calories } = solveCaloriesForTimeline(
      targetDays, watchedStartWeight, watchedGoalWeight, watchedHeight, watchedAge, watchedSex, mode,
      1, activityMultiplier,
    );
    setPlanMonths(months);
    form.setValue("goalDurationMonths", months, { shouldDirty: true });
    form.setValue("dailyCalorieGoal", calories, { shouldDirty: true });
  }

  // Iterative stats for the Adjust block — same model as the Recommended card
  const planStats = useMemo(() => {
    if (!watchedCalorieGoal || watchedCalorieGoal <= 0) return null;
    if (!watchedStartWeight || !watchedGoalWeight || !watchedHeight || !watchedAge || !watchedSex) return null;
    if (watchedSex !== "male" && watchedSex !== "female") return null;
    if (watchedMode === "maintenance") return null;
    const weightDiff = Math.abs(watchedStartWeight - watchedGoalWeight);
    if (weightDiff <= 0) return null;
    const mode = watchedMode === "weight_gain" ? "weight_gain" : "weight_loss";
    const days = iterateDaysToGoal(watchedStartWeight, watchedGoalWeight, watchedHeight, watchedAge, watchedSex, watchedCalorieGoal, mode, activityMultiplier);
    const months = Math.max(1, days / 30.44);
    return {
      days,
      months,
      monthlyRate: weightDiff / months,
    };
  }, [watchedCalorieGoal, watchedStartWeight, watchedGoalWeight, watchedHeight, watchedAge, watchedSex, watchedMode, activityMultiplier]);

  const planWarning = useMemo(() => {
    if (!estimatedTDEE || watchedMode === "maintenance") return null;

    // ── Gain mode: warn only if surplus is very large (mostly fat gain) ──
    if (watchedMode === "weight_gain") {
      if (watchedCalorieGoal <= 0) return null;
      const surplus = watchedCalorieGoal - estimatedTDEE;
      if (surplus > 500) {
        return lang === "ru"
          ? "⚠ Такой темп набора приводит преимущественно к жировой массе — рассмотрите более длительный срок (~2 кг/мес или меньше)."
          : "⚠ Gaining faster than ~2 kg/mo mostly adds fat — consider extending the timeline.";
      }
      return null;
    }

    // ── Loss mode: warn if below 1,200 kcal/day ──
    if (watchedCalorieGoal <= 0 || watchedCalorieGoal >= 1200) return null;
    const shortfallPerWeek = (1200 - watchedCalorieGoal) * 7;
    const n = Math.ceil(shortfallPerWeek / 300);
    if (n > 7) {
      return lang === "ru"
        ? "Этот срок нереалистичен даже при ежедневных тренировках — попробуйте увеличить срок."
        : "This timeline isn't realistic even with daily workouts — consider extending it.";
    }
    let goalDateStr = "";
    if (planStats) {
      const d = new Date();
      d.setDate(d.getDate() + planStats.days);
      goalDateStr = d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short", year: "numeric" });
    }
    return lang === "ru"
      ? `⚠ Ниже минимума 1 200 ккал/день. Чтобы достичь цели к ${goalDateStr} безопасно, добавьте активность: ~${n} тренировок/нед. (~300 ккал) покроют разницу при 1 200 ккал/день.`
      : `⚠ Below the recommended minimum of 1,200 kcal/day. To reach your goal by ${goalDateStr} safely, add activity: ~${n} workouts/week (~300 kcal each) covers the difference at 1,200 kcal/day.`;
  }, [estimatedTDEE, watchedCalorieGoal, watchedMode, planStats, lang]);

  // Disable minus only at absolute minimum (1 month)
  const minMonthsReached = !planMonths || planMonths <= 1;

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
    onSuccess: (_, variables) => {
      form.reset(variables);
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

        {/* ── Page heading ── */}
        <div className="flex flex-col mb-8 gap-[0px]">
          <h2 className="text-[22px] font-bold text-[#1C1714] m-0">{lang === "ru" ? "Параметры" : "Parameters"}</h2>
        </div>

        {/* ── Welcome banner for new users ── */}
        {profileEmpty && (
          <div className="mb-8 border border-[#1C1714] px-5 py-4">
            <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-1">{t("setupRequired")}</p>
            <p className="text-sm leading-relaxed opacity-75">{t("welcomeSetup")}</p>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => save.mutate(data))} className="space-y-10">

            {/* ── Language ── */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#1C1714] mb-1 border-b border-[#1C1714]/20 pb-2">
                {t("language")}
              </div>
              <div className="flex gap-3 mt-4">
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
              <div className="text-xs font-semibold uppercase tracking-widest text-[#1C1714] mb-1 border-b border-[#1C1714]/20 pb-2">
                {t("bodyMetrics")}
              </div>
              <p className="text-xs text-[#6B6560] mb-4 mt-2">{t("bodyMetricsHint")}</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="startingWeightKg" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-widest text-[#6B6560]">{t("startWeight")}</FormLabel>
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
                      <FormLabel className="text-xs uppercase tracking-widest text-[#6B6560]">
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
                      {isGoalBelowHealthyRange && bmiData && (
                        <p className="text-sm text-amber-600 mt-1" data-testid="warn-below-healthy-range">
                          {t("belowHealthyRangeWarning")} ({bmiData.range.minKg}–{bmiData.range.maxKg} kg)
                        </p>
                      )}
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <FormField control={form.control} name="heightCm" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-widest text-[#6B6560]">{t("height")}</FormLabel>
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
                      <FormLabel className="text-xs uppercase tracking-widest text-[#6B6560]">{t("age")}</FormLabel>
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
                      <FormLabel className="text-xs uppercase tracking-widest text-[#6B6560]">{t("sex")}</FormLabel>
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
                    <FormLabel className="text-xs uppercase tracking-widest text-[#6B6560]">{t("journeyStartDate")}</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-start-date"
                        className={IN + " max-w-[220px]"} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

              </div>
            </div>

            {/* ── Activity Level ── */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#1C1714] mb-1 border-b border-[#1C1714]/20 pb-2">
                {t("activityLevel")}
              </div>
              <div className="mt-4">
                <FormField control={form.control} name="activityLevel" render={({ field }) => (
                  <FormItem>
                    <div className="flex flex-col border border-[#1C1714]/20" data-testid="select-activity-level">
                      {(["sedentary", "light", "active"] as const).map((lvl) => {
                        const labels: Record<string, string> = { sedentary: t("actSedentary"), light: t("actLight"), active: t("actActive") };
                        const descs: Record<string, string> = { sedentary: t("actDescSedentary"), light: t("actDescLight"), active: t("actDescActive") };
                        const active = field.value === lvl;
                        return (
                          <button
                            key={lvl}
                            type="button"
                            data-testid={`button-activity-${lvl}`}
                            onClick={() => field.onChange(lvl)}
                            className={`flex items-center gap-4 px-4 py-3 text-left border-b last:border-b-0 border-[#1C1714]/20 transition-colors ${active ? "bg-[#1C1714] text-[#F2EDE7]" : "bg-transparent hover:bg-[#1C1714]/5"}`}
                          >
                            <div className={`text-xs uppercase tracking-widest font-bold w-32 shrink-0 ${active ? "opacity-90" : "text-[#6B6560]"}`}>
                              {labels[lvl]}
                            </div>
                            <div className={`text-xs leading-snug ${active ? "opacity-80" : "text-[#6B6560]"}`}>
                              {descs[lvl]}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── BMI Index ── */}
            {canComputeTarget && estimatedTDEE && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-[#1C1714] mb-1 border-b border-[#1C1714]/20 pb-2">
                  {lang === "ru" ? "Индекс BMI" : "BMI index"}
                </div>
                <div className="mt-4 space-y-3">
                  <div className="border border-[#1C1714]/30 p-4 grid grid-cols-2 gap-4" data-testid="panel-estimates">
                    <div data-testid="panel-tdee">
                      <div className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{t("maintenance")}</div>
                      <div className="text-2xl tabular-nums" data-testid="text-tdee">{estimatedTDEE.toLocaleString()}</div>
                      <div className="text-xs text-[#6B6560] mt-0.5">{t("kcalPerDay")}</div>
                    </div>
                    {watchedMode === "maintenance" ? (
                      <div data-testid="panel-suggested-goal">
                        <div className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{t("modeMaintenance")}</div>
                        <div className="text-2xl tabular-nums text-emerald-700" data-testid="text-suggested-goal">{estimatedTDEE.toLocaleString()}</div>
                        <div className="text-xs text-[#6B6560] mt-0.5">{t("kcalPerDay")}</div>
                      </div>
                    ) : watchedMode === "weight_gain" ? (
                      <div data-testid="panel-suggested-goal">
                        <div className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{t("surplus300")}</div>
                        <div className="text-2xl tabular-nums text-blue-600" data-testid="text-suggested-goal">{(estimatedTDEE + 350).toLocaleString()}</div>
                        <div className="text-xs text-[#6B6560] mt-0.5">{t("kcalPerDay")}</div>
                      </div>
                    ) : (
                      <div data-testid="panel-suggested-goal">
                        <div className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{t("deficit500")}</div>
                        <div className="text-2xl tabular-nums text-[#9e4515]" data-testid="text-suggested-goal">{(estimatedTDEE - 500).toLocaleString()}</div>
                        <div className="text-xs text-[#6B6560] mt-0.5">{t("kcalPerDay")}</div>
                      </div>
                    )}
                  </div>

                  {/* ── BMI Panel ── */}
                  {bmiData && (
                    <div className="border border-[#1C1714]/20 p-4 space-y-3" data-testid="panel-bmi">
                      <div className="text-xs uppercase tracking-widest text-[#6B6560]">{t("bmiPanel")}</div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{t("bmi")}</div>
                          <div className={`text-2xl tabular-nums tracking-tighter font-bold ${BMI_COLORS[bmiData.category]}`} data-testid="text-bmi">
                            {bmiData.bmi}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{lang === "ru" ? "Категория" : "Category"}</div>
                          <div className={`text-xs font-bold uppercase tracking-wider mt-1 ${BMI_COLORS[bmiData.category]}`} data-testid="text-bmi-category">
                            {bmiCategoryLabel[bmiData.category]}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{t("healthyRange")}</div>
                          <div className="text-sm tabular-nums opacity-70 mt-1">{bmiData.range.minKg}–{bmiData.range.maxKg} kg</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Plan ── */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#1C1714] mb-1 border-b border-[#1C1714]/20 pb-2">
                {lang === "ru" ? "План" : "Plan"}
              </div>

              {canComputeTarget ? (
                <div className="space-y-4 mt-4">

                  {/* ── Block 1: Your Recommended Plan (accented) ── */}
                  {watchedMode !== "maintenance" && recommendedMonths && optimalPlan && watchedStartWeight && watchedGoalWeight && (
                    <div className="border-2 border-[#1C1714] p-5" data-testid="panel-recommended">
                      <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-3">
                        {(isGoalBelowHealthyRange || (watchedCalorieGoal > 0 && watchedCalorieGoal < 1200)) ? t("yourPlanTag") : t("recommendedTag")}
                      </p>
                      {/* Hero calorie number */}
                      <div className="mb-1">
                        <span className="text-5xl tabular-nums tracking-tighter leading-none font-['Space_Mono']">
                          {optimalPlan.calorie.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-[#6B6560] mb-4">{t("kcalPerDay")}</p>
                      {/* Supporting info */}
                      <div className="border-t border-[#1C1714]/10 pt-3 flex gap-8 flex-wrap">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">
                            {watchedMode === "weight_loss" ? (lang === "ru" ? "Похудеть" : "Lose") : (lang === "ru" ? "Набрать" : "Gain")}
                          </p>
                          <p className="text-sm tabular-nums">
                            {Math.abs(watchedStartWeight - watchedGoalWeight).toFixed(1)} kg
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{lang === "ru" ? "Срок" : "Timeline"}</p>
                          <p className="text-sm tabular-nums">~{recommendedMonths} {lang === "ru" ? "мес." : "mo"}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{t("planMonthlyLabel")}</p>
                          <p className="text-sm tabular-nums">
                            ~{(Math.abs(watchedStartWeight - watchedGoalWeight) / (optimalPlan!.days! / 30.44)).toFixed(1)} kg
                            <span className="text-xs text-[#6B6560] ml-1">/ {lang === "ru" ? "мес." : "mo"}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{t("planGoalDateLabel")}</p>
                          <p className="text-sm">{goalDateFromDays(optimalPlan!.days!)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Block 2: Adjust Your Plan (lighter) ── */}
                  {watchedMode !== "maintenance" && (
                    <div className="border border-[#1C1714]/30 p-5 space-y-4" data-testid="panel-planner">
                      <p className="text-xs uppercase tracking-widest text-[#6B6560]">{t("adjustYourPlan")}</p>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs uppercase tracking-widest text-[#6B6560] block mb-2">
                            {t("planMonthsLabel")}
                          </label>
                          <div className="flex border border-[#1C1714]/40 h-14">
                            <button
                              type="button"
                              data-testid="button-months-dec"
                              onClick={() => handleMonthsChange(String((planMonths ?? 2) - 1))}
                              aria-label="Decrease months"
                              disabled={minMonthsReached}
                              className="px-3 border-r border-[#1C1714]/20 hover:bg-[#1C1714]/5 text-lg font-bold transition-colors shrink-0 select-none disabled:opacity-20 disabled:cursor-not-allowed"
                            >−</button>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={120}
                              data-testid="input-plan-months"
                              value={planMonths ?? ""}
                              onChange={(e) => handleMonthsChange(e.target.value)}
                              className="flex-1 h-full text-center text-3xl tabular-nums bg-transparent focus:outline-none font-['Space_Mono'] text-[#1C1714]"
                            />
                            <button
                              type="button"
                              data-testid="button-months-inc"
                              onClick={() => handleMonthsChange(String((planMonths ?? 0) + 1))}
                              aria-label="Increase months"
                              className="px-3 border-l border-[#1C1714]/20 hover:bg-[#1C1714]/5 text-lg font-bold transition-colors shrink-0 select-none"
                            >+</button>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-widest text-[#6B6560] block mb-2">
                            {t("planCaloriesLabel")}
                          </label>
                          <div
                            data-testid="display-plan-calories"
                            className="flex items-center justify-center h-14 border border-[#1C1714]/20 bg-[#1C1714]/[0.03]"
                          >
                            <span
                              className="text-3xl tabular-nums font-['Space_Mono']"
                              style={{ color: watchedMode === "weight_loss" && watchedCalorieGoal > 0 && watchedCalorieGoal < 1200 ? "#9e4515" : "#1C1714" }}
                            >
                              {watchedCalorieGoal > 0 ? watchedCalorieGoal.toLocaleString() : "—"}
                            </span>
                          </div>
                          <p className="text-xs text-[#6B6560] mt-1">{t("kcalPerDay")}</p>
                        </div>
                      </div>

                      {planWarning && (
                        <div className="border border-[#9e4515] px-4 py-3 text-sm text-[#9e4515] leading-snug" data-testid="text-plan-warning">
                          {planWarning}
                        </div>
                      )}

                      {planStats && (
                        <div className="flex gap-8 pt-1 border-t border-[#1C1714]/10">
                          <div>
                            <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{t("planMonthlyLabel")}</p>
                            <p className="text-sm tabular-nums">
                              {watchedMode === "weight_gain" ? "+" : "~"}{planStats.monthlyRate.toFixed(1)} kg
                              <span className="text-xs text-[#6B6560] ml-1">/ {lang === "ru" ? "мес." : "mo"}</span>
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-0.5">{t("planGoalDateLabel")}</p>
                            <p className="text-sm">{goalDateFromDays(planStats.days)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Maintenance mode: just show TDEE */}
                  {watchedMode === "maintenance" && estimatedTDEE && (
                    <div className="bg-[#1C1714] text-[#F2EDE7] p-5" data-testid="panel-maintenance">
                      <p className="text-xs uppercase tracking-widest text-[#F2EDE7]/70 mb-1">{t("modeMaintenance")}</p>
                      <p className="text-3xl tabular-nums">{estimatedTDEE.toLocaleString()}</p>
                      <p className="text-xs text-[#F2EDE7]/60 mt-0.5">{t("kcalPerDay")}</p>
                    </div>
                  )}

                </div>
              ) : (
                <div className="border border-dashed border-[#1C1714]/20 px-5 py-6 text-center mt-4">
                  <p className="text-xs text-[#6B6560] leading-relaxed">{t("fillMetricsHint")}</p>
                </div>
              )}
            </div>

            {/* ── Sticky Save Bar (only when dirty) ── */}
            <div
              className={`sticky bottom-16 md:bottom-0 -mx-4 md:-mx-8 mt-8 border-t-2 border-[#1C1714] bg-[#F2EDE7] px-4 md:px-8 py-4 z-40 transition-all duration-200 ${
                form.formState.isDirty
                  ? "opacity-100 pointer-events-auto shadow-[0_-6px_24px_rgba(28,23,20,0.1)]"
                  : "opacity-0 pointer-events-none"
              }`}
            >
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  type="submit"
                  disabled={save.isPending}
                  data-testid="button-save-settings"
                  className="border-2 border-[#1C1714] px-10 py-3 text-xs uppercase tracking-widest hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors disabled:opacity-40"
                >
                  {save.isPending ? t("saving") : t("saveChanges")}
                </button>
                <span className="text-xs uppercase tracking-widest text-[#6B6560]">{t("unsavedChanges")}</span>
              </div>
            </div>

          </form>
        </Form>

        {/* ── Danger Zone ── */}
        <div className="border-t border-[#1C1714]/20 pt-6 mt-8 flex items-center justify-between gap-4">
          <p className="text-xs uppercase tracking-widest text-[#6B6560]">{t("dangerZone")}</p>
          <button
            type="button"
            data-testid="button-restart"
            onClick={() => setRestartOpen(true)}
            disabled={restart.isPending}
            className="text-xs uppercase tracking-widest text-[#9B4A2E] border border-[#9B4A2E]/40 px-6 py-3 hover:bg-[#9B4A2E]/10 transition-colors disabled:opacity-40 min-h-[44px] shrink-0"
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

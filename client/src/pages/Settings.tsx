import { useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/AppShell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  upsertSettingsSchema,
  type Settings,
  type UpsertSettings,
  ACTIVITY_LEVELS,
  ACTIVITY_LEVEL_LABELS,
  ACTIVITY_MULTIPLIERS,
  type ActivityLevel,
} from "@shared/schema";
import { computeBMR, computeTDEE } from "@/lib/calorieflow";
import { LS } from "@/lib/ledger-styles";

const IN = LS.input;

const ACTIVITY_DESCRIPTIONS: Record<ActivityLevel, string> = {
  sedentary: "Desk job, little or no exercise",
  lightly_active: "Light exercise 1–3 days/week",
  moderately_active: "Moderate exercise 3–5 days/week",
  very_active: "Hard exercise 6–7 days/week",
};

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Settings>({ queryKey: ["/api/settings"] });

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
      });
    }
  }, [settings]);

  const watchedHeight = form.watch("heightCm");
  const watchedAge = form.watch("ageYears");
  const watchedSex = form.watch("sexAtBirth");
  const watchedStartWeight = form.watch("startingWeightKg");
  const watchedActivityLevel = form.watch("activityLevel");

  const estimatedTDEE = useMemo(() => {
    if (!watchedHeight || !watchedAge || !watchedSex || !watchedStartWeight) return null;
    const bmr = computeBMR(watchedStartWeight, watchedHeight, watchedAge, watchedSex as "male" | "female");
    const multiplier = ACTIVITY_MULTIPLIERS[(watchedActivityLevel as ActivityLevel) ?? "sedentary"] ?? 1.2;
    return Math.round(computeTDEE(bmr, multiplier));
  }, [watchedHeight, watchedAge, watchedSex, watchedStartWeight, watchedActivityLevel]);

  const save = useMutation({
    mutationFn: async (data: UpsertSettings) => {
      const res = await apiRequest("PUT", "/api/settings", data);
      return (await res.json()) as Settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: (err: unknown) =>
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      }),
  });

  if (isLoading) {
    return (
      <AppShell title="Settings">
        <div className={`mx-auto max-w-2xl space-y-4 ${LS.page}`}>
          <Skeleton className="h-28 w-full bg-[#1C1714]/10" />
          <Skeleton className="h-48 w-full bg-[#1C1714]/10" />
          <Skeleton className="h-64 w-full bg-[#1C1714]/10" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings">
      <div className={`mx-auto max-w-2xl ${LS.page}`}>

        {/* ── Daily Goal ── */}
        <section className={LS.sectionCard}>
          <div className={`${LS.sectionHeader} pb-4`}>
            <p className={LS.label}>Daily Goal</p>
            <h3 className={LS.subheading}>Calorie target</h3>
          </div>
          <Form {...form}>
            <form
              className="px-6 py-5"
              onSubmit={form.handleSubmit((data) => save.mutate(data))}
              id="settings-form"
            >
              <FormField
                control={form.control}
                name="dailyCalorieGoal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LS.label}>Daily calorie goal (kcal)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        data-testid="input-goal"
                        className={`${IN} tabular-nums`}
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </section>

        {/* ── Activity Level ── */}
        <section className={`${LS.sectionCard} border-t-0`}>
          <div className={`${LS.sectionHeader} pb-4`}>
            <p className={LS.label}>Activity Level</p>
            <h3 className={LS.subheading}>How active are you?</h3>
            <p className="mt-1 text-xs opacity-50">
              This affects your calorie burn estimate (TDEE) and projected goal date.
            </p>
          </div>
          <Form {...form}>
            <form className="px-6 py-5" id="settings-form-activity">
              <FormField
                control={form.control}
                name="activityLevel"
                render={({ field }) => (
                  <FormItem>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {ACTIVITY_LEVELS.map((level) => {
                        const active = field.value === level;
                        return (
                          <button
                            key={level}
                            type="button"
                            data-testid={`radio-activity-${level}`}
                            onClick={() => field.onChange(level)}
                            className={`flex flex-col gap-1 border px-4 py-3 text-left transition-colors font-['Space_Mono'] ${
                              active
                                ? "border-[#1C1714] bg-[#1C1714] text-[#F2EDE7]"
                                : "border-[#1C1714]/30 text-[#1C1714] hover:border-[#1C1714]"
                            }`}
                          >
                            <span className="text-xs uppercase tracking-widest">{ACTIVITY_LEVEL_LABELS[level]}</span>
                            <span className={`text-[10px] ${active ? "opacity-60" : "opacity-50"}`}>
                              {ACTIVITY_DESCRIPTIONS[level]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </section>

        {/* ── Body Metrics ── */}
        <section className={`${LS.sectionCard} border-t-0`}>
          <div className={`${LS.sectionHeader} pb-4`}>
            <p className={LS.label}>Body Metrics</p>
            <h3 className={LS.subheading}>Your measurements</h3>
            <p className="mt-1 text-xs opacity-50">
              Used to calculate TDEE and project your goal date — never shared.
            </p>
          </div>
          <Form {...form}>
            <form className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="startingWeightKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LS.label}>Starting weight (kg)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          data-testid="input-starting-weight"
                          className={`${IN} tabular-nums`}
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="goalWeightKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LS.label}>Goal weight (kg)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          data-testid="input-goal-weight"
                          placeholder="e.g. 68.0"
                          className={`${IN} tabular-nums`}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="heightCm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LS.label}>Height (cm)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-height"
                          placeholder="e.g. 175"
                          className={`${IN} tabular-nums`}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ageYears"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LS.label}>Age (years)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-age"
                          placeholder="e.g. 30"
                          className={`${IN} tabular-nums`}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sexAtBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LS.label}>Sex at birth</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v === "" ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger
                            data-testid="select-sex"
                            className="rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus:ring-0 focus:ring-offset-0"
                          >
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male" className="font-['Space_Mono']">Male</SelectItem>
                          <SelectItem value="female" className="font-['Space_Mono']">Female</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        </section>

        {/* ── Journey Dates ── */}
        <section className={`${LS.sectionCard} border-t-0`}>
          <div className={`${LS.sectionHeader} pb-4`}>
            <p className={LS.label}>Journey</p>
            <h3 className={LS.subheading}>Start date</h3>
          </div>
          <Form {...form}>
            <form className="px-6 py-5">
              <FormField
                control={form.control}
                name="journeyStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LS.label}>Journey start date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        data-testid="input-start-date"
                        className={IN}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </section>

        {/* ── TDEE + Suggestion Panel ── */}
        {estimatedTDEE !== null && (
          <section className={`${LS.sectionCard} border-t-0`}>
            <div className="grid grid-cols-1 divide-y divide-[#1C1714]/20 md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="px-6 py-5" data-testid="panel-tdee">
                <p className={LS.label}>Your Maintenance</p>
                <p className="mt-1 text-3xl tracking-tighter tabular-nums" data-testid="text-tdee">
                  {estimatedTDEE.toLocaleString()}
                  <span className="ml-1 text-base opacity-50">kcal/day</span>
                </p>
                <p className="mt-2 text-[10px] opacity-50">
                  Calories you burn daily at your current activity level. Eating below this creates a deficit.
                </p>
              </div>
              <div
                className="flex items-center justify-between gap-4 px-6 py-5"
                data-testid="panel-suggested-goal"
              >
                <div>
                  <p className={LS.label}>Suggested Goal</p>
                  <p
                    className="mt-1 text-3xl tracking-tighter tabular-nums text-[#9e4515]"
                    data-testid="text-suggested-goal"
                  >
                    {(estimatedTDEE - 500).toLocaleString()}
                    <span className="ml-1 text-base opacity-50">kcal/day</span>
                  </p>
                  <p className="mt-2 text-[10px] opacity-50">
                    TDEE − 500 kcal · targets ~0.5 kg/week loss
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="button-use-suggested-goal"
                  className={LS.btnOutline}
                  onClick={() => form.setValue("dailyCalorieGoal", estimatedTDEE - 500)}
                >
                  Use
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Save Button ── */}
        <div className={`${LS.sectionCard} border-t-0 px-6 py-5`}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => save.mutate(data))}>
              <button
                type="submit"
                disabled={save.isPending}
                data-testid="button-save-settings"
                className={`${LS.btnPrimary} w-full md:w-auto`}
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </button>
            </form>
          </Form>
        </div>
      </div>
    </AppShell>
  );
}

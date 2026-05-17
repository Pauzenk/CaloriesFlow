import { useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
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
  ACTIVITY_LEVEL_LABELS,
  ACTIVITY_MULTIPLIERS,
  type ActivityLevel,
} from "@shared/schema";
import { computeBMR, computeTDEE } from "@/lib/calorieflow";

const ACTIVITY_DESCRIPTIONS: Record<ActivityLevel, string> = {
  sedentary: "Desk job, little or no exercise",
  lightly_active: "Light exercise 1–3 days/week",
  moderately_active: "Moderate exercise 3–5 days/week",
  very_active: "Hard exercise 6–7 days/week",
};

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });

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

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-2xl space-y-0">

        {/* ── Goal section ── */}
        <section className="border border-[#D4CFC8] bg-white">
          <div className="border-b border-[#D4CFC8] px-6 py-5 md:px-8">
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">Daily Goal</p>
            <h3 className="mt-1 text-xl font-bold text-[#1C1714]">Calorie target</h3>
          </div>
          <Form {...form}>
            <form
              className="px-6 py-5 md:px-8"
              onSubmit={form.handleSubmit((data) => save.mutate(data))}
              id="settings-form"
            >
              <FormField
                control={form.control}
                name="dailyCalorieGoal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                      Daily calorie goal (kcal)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        data-testid="input-goal"
                        className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#AD3419]"
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

        {/* ── Activity level — PROMINENT separate section ── */}
        <section className="border border-t-0 border-[#D4CFC8] bg-[#F5F1EB]">
          <div className="border-b border-[#D4CFC8] px-6 py-5 md:px-8">
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">Activity Level</p>
            <h3 className="mt-1 text-xl font-bold text-[#1C1714]">How active are you?</h3>
            <p className="mt-1 text-sm text-[#6B6560]">
              This affects your calorie burn estimate (TDEE) and projected goal date.
            </p>
          </div>
          <Form {...form}>
            <form className="px-6 py-5 md:px-8" id="settings-form-activity">
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
                            className={`flex flex-col gap-1 border px-4 py-3 text-left transition-colors ${
                              active
                                ? "border-[#AD3419] bg-[#AD3419] text-white"
                                : "border-[#D4CFC8] bg-white text-[#1C1714] hover:border-[#AD3419]"
                            }`}
                          >
                            <span className="text-sm font-bold">{ACTIVITY_LEVEL_LABELS[level]}</span>
                            <span className={`text-xs ${active ? "text-white/80" : "text-[#6B6560]"}`}>
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

        {/* ── Body metrics ── */}
        <section className="border border-t-0 border-[#D4CFC8] bg-white">
          <div className="border-b border-[#D4CFC8] px-6 py-5 md:px-8">
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">Body Metrics</p>
            <h3 className="mt-1 text-xl font-bold text-[#1C1714]">Your measurements</h3>
            <p className="mt-1 text-sm text-[#6B6560]">
              Used to calculate TDEE and project your goal date — never shared.
            </p>
          </div>
          <Form {...form}>
            <form className="space-y-4 px-6 py-5 md:px-8">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="startingWeightKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                        Starting weight (kg)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          data-testid="input-starting-weight"
                          className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#AD3419]"
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
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                        Goal weight (kg)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          data-testid="input-goal-weight"
                          placeholder="e.g. 68.0"
                          className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#AD3419]"
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
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                        Height (cm)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-height"
                          placeholder="e.g. 175"
                          className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#AD3419]"
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
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                        Age (years)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-age"
                          placeholder="e.g. 30"
                          className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#AD3419]"
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
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                        Sex at birth
                      </FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v === "" ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger
                            data-testid="select-sex"
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus:ring-[#AD3419]"
                          >
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
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

        {/* ── Journey dates ── */}
        <section className="border border-t-0 border-[#D4CFC8] bg-white">
          <div className="border-b border-[#D4CFC8] px-6 py-5 md:px-8">
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">Journey</p>
            <h3 className="mt-1 text-xl font-bold text-[#1C1714]">Start date</h3>
          </div>
          <Form {...form}>
            <form className="px-6 py-5 md:px-8">
              <FormField
                control={form.control}
                name="journeyStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                      Journey start date
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        data-testid="input-start-date"
                        className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#AD3419]"
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

        {/* ── TDEE + Suggestion panel ── */}
        {estimatedTDEE !== null && (
          <section className="border border-t-0 border-[#D4CFC8] bg-[#F5F1EB]">
            <div className="grid grid-cols-1 divide-y divide-[#D4CFC8] md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="px-6 py-5 md:px-8" data-testid="panel-tdee">
                <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">
                  Your Maintenance
                </p>
                <p className="mt-1 text-3xl font-bold text-[#1C1714]" data-testid="text-tdee">
                  {estimatedTDEE.toLocaleString()}
                  <span className="ml-1 text-base font-normal text-[#6B6560]">kcal/day</span>
                </p>
                <p className="mt-1.5 text-xs text-[#6B6560]">
                  Calories you burn daily at your current activity level. Eating below this creates a deficit.
                </p>
              </div>
              <div
                className="flex items-center justify-between gap-4 px-6 py-5 md:px-8"
                data-testid="panel-suggested-goal"
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">
                    Suggested Goal
                  </p>
                  <p
                    className="mt-1 text-3xl font-bold text-[#AD3419]"
                    data-testid="text-suggested-goal"
                  >
                    {(estimatedTDEE - 500).toLocaleString()}
                    <span className="ml-1 text-base font-normal text-[#6B6560]">kcal/day</span>
                  </p>
                  <p className="mt-1.5 text-xs text-[#6B6560]">
                    TDEE − 500 kcal · targets ~0.5 kg/week loss
                  </p>
                </div>
                <Button
                  type="button"
                  data-testid="button-use-suggested-goal"
                  className="shrink-0 bg-[#AD3419] text-white hover:bg-[#8A2913]"
                  onClick={() => form.setValue("dailyCalorieGoal", estimatedTDEE - 500)}
                >
                  Use
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* ── Save button ── */}
        <div className="border border-t-0 border-[#D4CFC8] bg-white px-6 py-5 md:px-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => save.mutate(data))}>
              <Button
                type="submit"
                disabled={save.isPending}
                className="h-12 w-full bg-[#AD3419] text-base font-bold text-white hover:bg-[#8A2913] md:w-auto md:px-12"
                data-testid="button-save-settings"
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </Form>
        </div>

      </div>
    </AppShell>
  );
}

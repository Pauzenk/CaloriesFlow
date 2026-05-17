import { useEffect, useMemo } from "react";
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
      <div className="font-['Space_Mono'] text-[#1C1714] mx-auto max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => save.mutate(data))} className="space-y-0">

            {/* ── Daily goal ── */}
            <div className="border border-[#1C1714]">
              <div className="border-b border-[#1C1714]/20 px-6 py-4">
                <p className="text-xs uppercase tracking-widest opacity-60">Daily Goal</p>
              </div>
              <div className="px-6 py-5">
                <FormField
                  control={form.control}
                  name="dailyCalorieGoal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">
                        Calorie target (kcal)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-goal"
                          className="border-[#1C1714]/30 bg-transparent focus-visible:ring-[#AD3419] tabular-nums"
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Activity level ── */}
            <div className="border border-t-0 border-[#1C1714]">
              <div className="border-b border-[#1C1714]/20 px-6 py-4">
                <p className="text-xs uppercase tracking-widest opacity-60">Activity Level</p>
              </div>
              <div className="px-6 py-5">
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
                                  : "border-[#1C1714]/20 text-[#1C1714] hover:border-[#AD3419]"
                              }`}
                            >
                              <span className="text-xs uppercase tracking-widest font-bold">
                                {ACTIVITY_LEVEL_LABELS[level]}
                              </span>
                              <span className={`text-xs ${active ? "text-white/70" : "opacity-50"}`}>
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
              </div>
            </div>

            {/* ── Body metrics ── */}
            <div className="border border-t-0 border-[#1C1714]">
              <div className="border-b border-[#1C1714]/20 px-6 py-4">
                <p className="text-xs uppercase tracking-widest opacity-60">Body Metrics</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startingWeightKg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">
                          Starting weight (kg)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            data-testid="input-starting-weight"
                            className="border-[#1C1714]/30 bg-transparent focus-visible:ring-[#AD3419] tabular-nums"
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
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">
                          Goal weight (kg)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            data-testid="input-goal-weight"
                            placeholder="e.g. 68.0"
                            className="border-[#1C1714]/30 bg-transparent focus-visible:ring-[#AD3419] tabular-nums"
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
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">
                          Height (cm)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            data-testid="input-height"
                            placeholder="e.g. 175"
                            className="border-[#1C1714]/30 bg-transparent focus-visible:ring-[#AD3419] tabular-nums"
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
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">
                          Age (years)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            data-testid="input-age"
                            placeholder="e.g. 30"
                            className="border-[#1C1714]/30 bg-transparent focus-visible:ring-[#AD3419] tabular-nums"
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
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">
                          Sex at birth
                        </FormLabel>
                        <Select
                          value={field.value ?? ""}
                          onValueChange={(v) => field.onChange(v === "" ? null : v)}
                        >
                          <FormControl>
                            <SelectTrigger
                              data-testid="select-sex"
                              className="border-[#1C1714]/30 bg-transparent focus:ring-[#AD3419]"
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
              </div>
            </div>

            {/* ── Journey start date ── */}
            <div className="border border-t-0 border-[#1C1714]">
              <div className="border-b border-[#1C1714]/20 px-6 py-4">
                <p className="text-xs uppercase tracking-widest opacity-60">Journey</p>
              </div>
              <div className="px-6 py-5">
                <FormField
                  control={form.control}
                  name="journeyStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">
                        Start date
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          data-testid="input-start-date"
                          className="border-[#1C1714]/30 bg-transparent focus-visible:ring-[#AD3419]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── TDEE panel ── */}
            {estimatedTDEE !== null && (
              <div className="border border-t-0 border-[#1C1714]">
                <div className="border-b border-[#1C1714]/20 px-6 py-4">
                  <p className="text-xs uppercase tracking-widest opacity-60">Estimates</p>
                </div>
                <div className="grid grid-cols-1 divide-y divide-[#1C1714]/10 md:grid-cols-2 md:divide-x md:divide-y-0">
                  <div className="px-6 py-5" data-testid="panel-tdee">
                    <p className="text-[10px] uppercase tracking-widest opacity-50 mb-1">Maintenance</p>
                    <p className="text-3xl tabular-nums" data-testid="text-tdee">
                      {estimatedTDEE.toLocaleString()}
                      <span className="ml-1 text-base opacity-40">kcal/day</span>
                    </p>
                    <p className="mt-2 text-xs opacity-40">
                      Calories burned daily at current activity level.
                    </p>
                  </div>
                  <div
                    className="flex items-center justify-between gap-4 px-6 py-5"
                    data-testid="panel-suggested-goal"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-50 mb-1">Suggested Goal</p>
                      <p className="text-3xl text-[#AD3419] tabular-nums" data-testid="text-suggested-goal">
                        {(estimatedTDEE - 500).toLocaleString()}
                        <span className="ml-1 text-base opacity-60">kcal/day</span>
                      </p>
                      <p className="mt-2 text-xs opacity-40">TDEE − 500 · ~0.5 kg/week loss</p>
                    </div>
                    <button
                      type="button"
                      data-testid="button-use-suggested-goal"
                      onClick={() => form.setValue("dailyCalorieGoal", estimatedTDEE - 500)}
                      className="shrink-0 border border-[#AD3419] px-4 py-2 text-xs uppercase tracking-widest text-[#AD3419] hover:bg-[#AD3419] hover:text-white transition-colors"
                    >
                      Use
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Save ── */}
            <div className="border border-t-0 border-[#1C1714] px-6 py-5">
              <button
                type="submit"
                disabled={save.isPending}
                data-testid="button-save-settings"
                className="w-full border-2 border-[#AD3419] bg-[#AD3419] py-3 text-xs uppercase tracking-widest text-white hover:bg-[#8A2913] hover:border-[#8A2913] transition-colors disabled:opacity-50 md:w-auto md:px-12"
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>

          </form>
        </Form>
      </div>
    </AppShell>
  );
}

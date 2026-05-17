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
  ACTIVITY_LEVEL_LABELS,
  ACTIVITY_MULTIPLIERS,
  type ActivityLevel,
} from "@shared/schema";
import { computeBMR, computeTDEE } from "@/lib/calorieflow";

const IN = "rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1714] placeholder:opacity-40";

const ACTIVITY_DESCRIPTIONS: Record<ActivityLevel, string> = {
  sedentary: "Desk job, little or no exercise",
  lightly_active: "Light exercise 1–3 days/week",
  moderately_active: "Moderate exercise 3–5 days/week",
  very_active: "Hard exercise 6–7 days/week",
};

const DURATION_MONTHS = [1, 2, 3, 4, 5] as const;

function calcGoalDateFromMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

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
      });
      if (settings.goalDurationMonths) {
        setSelectedDuration(settings.goalDurationMonths);
      }
    }
  }, [settings]);

  const watchedHeight = form.watch("heightCm");
  const watchedAge = form.watch("ageYears");
  const watchedSex = form.watch("sexAtBirth");
  const watchedStartWeight = form.watch("startingWeightKg");
  const watchedGoalWeight = form.watch("goalWeightKg");
  const watchedActivityLevel = form.watch("activityLevel");

  const estimatedTDEE = useMemo(() => {
    if (!watchedHeight || !watchedAge || !watchedSex || !watchedStartWeight) return null;
    const bmr = computeBMR(watchedStartWeight, watchedHeight, watchedAge, watchedSex as "male" | "female");
    const multiplier = ACTIVITY_MULTIPLIERS[(watchedActivityLevel as ActivityLevel) ?? "sedentary"] ?? 1.2;
    return Math.round(computeTDEE(bmr, multiplier));
  }, [watchedHeight, watchedAge, watchedSex, watchedStartWeight, watchedActivityLevel]);

  function calcGoalForDuration(months: number): number | null {
    if (!estimatedTDEE || !watchedGoalWeight || !watchedStartWeight) return null;
    const remaining = Math.abs(watchedStartWeight - watchedGoalWeight);
    if (remaining <= 0) return estimatedTDEE;
    const totalDays = months * 30.44;
    const dailyDeficit = (remaining * 7700) / totalDays;
    return Math.max(1200, Math.round(estimatedTDEE - dailyDeficit));
  }

  function handleDurationSelect(months: number) {
    setSelectedDuration(months);
    const newGoal = calcGoalForDuration(months);
    if (newGoal !== null) {
      form.setValue("dailyCalorieGoal", newGoal);
    }
    form.setValue("goalDurationMonths", months);
  }

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

  const canComputeTarget = !!(estimatedTDEE && watchedGoalWeight && watchedStartWeight);

  return (
    <AppShell title="Settings">
      <div className="w-full font-['Space_Mono'] text-[#1C1714]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => save.mutate(data))}>

            <div className="grid grid-cols-1 gap-10 xl:grid-cols-[1fr_1fr] xl:gap-16">

              {/* ── Left column ── */}
              <div className="space-y-10">

                {/* Daily Target (goal duration picker) */}
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-60 mb-1 border-b border-[#1C1714]/20 pb-2">
                    Daily Target
                  </div>
                  <p className="text-[10px] opacity-50 mb-5 mt-2 leading-relaxed">
                    Choose your timeline — the calorie target adjusts automatically based on your goal weight.
                  </p>
                  {canComputeTarget ? (
                    <div>
                      <div className="grid grid-cols-1 gap-2 mb-4">
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
                                  {m} month{m !== 1 ? "s" : ""}
                                </span>
                                <span className={`text-[10px] ${isSelected ? "opacity-55" : "opacity-40"}`}>
                                  Goal by {calcGoalDateFromMonths(m)}
                                </span>
                              </div>
                              {suggested !== null && (
                                <div className="text-right">
                                  <span className={`text-lg tabular-nums font-medium ${isSelected ? "opacity-90" : "opacity-70"}`}>
                                    {suggested.toLocaleString()}
                                  </span>
                                  <span className={`text-[10px] ml-1 ${isSelected ? "opacity-50" : "opacity-40"}`}>kcal/day</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {selectedDuration !== null && (
                        <div className="border border-[#1C1714]/20 px-4 py-3 text-[10px] opacity-60">
                          Target set to{" "}
                          <span className="opacity-100 font-bold text-[#1C1714]">
                            {calcGoalForDuration(selectedDuration)?.toLocaleString() ?? "—"} kcal/day
                          </span>
                          {" "}· save below to apply.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border border-dashed border-[#1C1714]/20 px-5 py-6 text-center">
                      <p className="text-[10px] opacity-40 leading-relaxed">
                        Fill in your body metrics and goal weight (right column) to enable automatic target calculation.
                      </p>
                    </div>
                  )}
                </div>

                {/* Daily goal (manual override) */}
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-60 mb-4 border-b border-[#1C1714]/20 pb-2">
                    Daily Goal
                  </div>
                  <FormField
                    control={form.control}
                    name="dailyCalorieGoal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">
                          Calorie target (kcal)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            data-testid="input-goal"
                            className={IN + " text-3xl h-14 tabular-nums"}
                            {...field}
                            onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Activity level */}
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-60 mb-1 border-b border-[#1C1714]/20 pb-2">
                    Activity Level
                  </div>
                  <p className="text-[10px] opacity-50 mb-4 mt-2">Affects calorie burn estimate and projected goal date.</p>
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
                                    ? "border-[#1C1714] bg-[#1C1714] text-[#F2EDE7]"
                                    : "border-[#1C1714]/30 text-[#1C1714] hover:border-[#1C1714]"
                                }`}
                              >
                                <span className="text-xs uppercase tracking-wider font-bold">
                                  {ACTIVITY_LEVEL_LABELS[level]}
                                </span>
                                <span className={`text-[10px] leading-snug ${active ? "opacity-70" : "opacity-50"}`}>
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

                {/* Journey start date */}
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-60 mb-4 border-b border-[#1C1714]/20 pb-2">
                    Journey
                  </div>
                  <FormField
                    control={form.control}
                    name="journeyStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">
                          Start date
                        </FormLabel>
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
                </div>

              </div>

              {/* ── Right column ── */}
              <div className="space-y-10">

                {/* Body metrics */}
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-60 mb-1 border-b border-[#1C1714]/20 pb-2">
                    Body Metrics
                  </div>
                  <p className="text-[10px] opacity-50 mb-4 mt-2">Used to calculate maintenance calories and goal date — never shared.</p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startingWeightKg"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">
                              Start weight (kg)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number" step="0.1"
                                data-testid="input-starting-weight"
                                className={IN + " tabular-nums"}
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
                            <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">
                              Goal weight (kg)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number" step="0.1" placeholder="e.g. 68.0"
                                data-testid="input-goal-weight"
                                className={IN + " tabular-nums"}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="heightCm"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">
                              Height (cm)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number" placeholder="175"
                                data-testid="input-height"
                                className={IN + " tabular-nums"}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)}
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
                            <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">
                              Age
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number" placeholder="30"
                                data-testid="input-age"
                                className={IN + " tabular-nums"}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)}
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
                            <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">
                              Sex
                            </FormLabel>
                            <Select
                              value={field.value ?? ""}
                              onValueChange={(v) => field.onChange(v === "" ? null : v)}
                            >
                              <FormControl>
                                <SelectTrigger
                                  data-testid="select-sex"
                                  className="rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus:ring-0 text-sm h-9"
                                >
                                  <SelectValue placeholder="—" />
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
                  </div>

                  {/* Maintenance + suggested display (read-only, no "Use This") */}
                  {estimatedTDEE !== null && (
                    <div className="mt-5 border border-[#1C1714] p-4">
                      <div className="text-xs uppercase tracking-widest opacity-60 mb-3 pb-2 border-b border-dashed border-[#1C1714]/20">
                        Calculated Estimates
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div data-testid="panel-tdee">
                          <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">Maintenance</div>
                          <div className="text-2xl tabular-nums" data-testid="text-tdee">
                            {estimatedTDEE.toLocaleString()}
                          </div>
                          <div className="text-[10px] opacity-40 mt-0.5">kcal / day</div>
                        </div>
                        <div data-testid="panel-suggested-goal">
                          <div className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">500 kcal deficit</div>
                          <div className="text-2xl tabular-nums text-[#9e4515]" data-testid="text-suggested-goal">
                            {(estimatedTDEE - 500).toLocaleString()}
                          </div>
                          <div className="text-[10px] opacity-40 mt-0.5">kcal / day</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ── Save ── */}
            <div className="mt-10 border-t-2 border-[#1C1714] pt-6 flex flex-col items-start gap-3">
              <button
                type="submit"
                disabled={save.isPending}
                data-testid="button-save-settings"
                className="border-2 border-[#1C1714] px-12 py-3 text-xs uppercase tracking-widest hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors disabled:opacity-40 w-full sm:w-auto"
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </button>
              <div className="text-[10px] opacity-30 tracking-widest uppercase">— End of Record —</div>
            </div>

          </form>
        </Form>
      </div>
    </AppShell>
  );
}

import { useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppShell } from "@/components/AppShell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { upsertSettingsSchema, type Settings, type UpsertSettings } from "@shared/schema";
import { computeBMR, computeTDEE } from "@/lib/calorieflow";

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
      });
    }
  }, [settings]);

  const watchedHeight = form.watch("heightCm");
  const watchedAge = form.watch("ageYears");
  const watchedSex = form.watch("sexAtBirth");
  const watchedStartWeight = form.watch("startingWeightKg");

  const estimatedTDEE = useMemo(() => {
    if (!watchedHeight || !watchedAge || !watchedSex || !watchedStartWeight) return null;
    const bmr = computeBMR(watchedStartWeight, watchedHeight, watchedAge, watchedSex as "male" | "female");
    return Math.round(computeTDEE(bmr));
  }, [watchedHeight, watchedAge, watchedSex, watchedStartWeight]);

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
      <div className="mx-auto max-w-2xl">
        <Card className="rounded border-[#c0cdd11a] bg-white shadow-[4px_0px_12px_#0000000a]">
          <CardContent className="p-6 md:p-8">
            <h3 className="text-xl font-bold text-[#1a1c1a]">Your goals</h3>
            <p className="mt-1 text-sm text-[#424843]">These power your dashboard and progress charts.</p>
            <Form {...form}>
              <form
                className="mt-6 space-y-4"
                onSubmit={form.handleSubmit((data) => save.mutate(data))}
              >
                <FormField
                  control={form.control}
                  name="dailyCalorieGoal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Daily calorie goal (kcal)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-goal"
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startingWeightKg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Starting weight (kg)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            data-testid="input-starting-weight"
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
                    name="currentWeightKg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current weight (kg)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            data-testid="input-current-weight"
                            {...field}
                            onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="journeyStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Journey start date</FormLabel>
                      <FormControl>
                        <Input type="date" data-testid="input-start-date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="border-t border-[#c0cdd14c] pt-4">
                  <p className="text-sm font-semibold text-[#1a1c1a]">Body metrics (for weight projection)</p>
                  <p className="mt-0.5 text-xs text-[#424843]">
                    Used to estimate your TDEE and project your goal date — never shared.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="heightCm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Height (cm)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              data-testid="input-height"
                              placeholder="e.g. 175"
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
                          <FormLabel>Age (years)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              data-testid="input-age"
                              placeholder="e.g. 30"
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
                          <FormLabel>Sex at birth</FormLabel>
                          <Select
                            value={field.value ?? ""}
                            onValueChange={(v) => field.onChange(v === "" ? null : v)}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-sex">
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
                  <div className="mt-4">
                    <FormField
                      control={form.control}
                      name="goalWeightKg"
                      render={({ field }) => (
                        <FormItem className="md:w-48">
                          <FormLabel>Goal weight (kg)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              data-testid="input-goal-weight"
                              placeholder="e.g. 68.0"
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

                  {estimatedTDEE !== null && (
                    <div
                      data-testid="panel-tdee"
                      className="mt-4 flex items-center gap-3 rounded border border-[#475C65]/20 bg-[#e8eff1] px-4 py-3"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#475C65]">
                          Your estimated TDEE
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-[#475C65]">
                          {estimatedTDEE.toLocaleString()} kcal / day
                        </p>
                        <p className="mt-0.5 text-xs text-[#424843]">
                          Total Daily Energy Expenditure at sedentary activity — how many calories you burn at rest.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={save.isPending}
                  className="bg-[#475C65] hover:bg-[#3d5059]"
                  data-testid="button-save-settings"
                >
                  {save.isPending ? "Saving..." : "Save changes"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

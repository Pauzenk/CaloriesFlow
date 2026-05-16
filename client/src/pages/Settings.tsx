import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AppShell } from "@/components/AppShell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { upsertSettingsSchema, type Settings, type UpsertSettings } from "@shared/schema";

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
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        dailyCalorieGoal: settings.dailyCalorieGoal,
        startingWeightKg: settings.startingWeightKg,
        currentWeightKg: settings.currentWeightKg,
        journeyStartDate: settings.journeyStartDate,
      });
    }
  }, [settings]);

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
        <Card className="rounded-3xl border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
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
                        <Input type="number" data-testid="input-goal" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} />
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
                          <Input type="number" step="0.1" data-testid="input-starting-weight" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} />
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
                          <Input type="number" step="0.1" data-testid="input-current-weight" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} />
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
                <Button
                  type="submit"
                  disabled={save.isPending}
                  className="bg-[#476550] hover:bg-[#3f5b47]"
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

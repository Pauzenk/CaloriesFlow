import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sparkles } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Meal, Settings, Weight } from "@shared/schema";
import { dailyCaloriesSeries, daysSince, lastNDates, todayStr, weeklyWeightDeltas } from "@/lib/calorieflow";

type Period = "day" | "week" | "month";

export default function ProgressPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [weightInput, setWeightInput] = useState("");
  const { toast } = useToast();

  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: meals = [] } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
  const { data: weights = [] } = useQuery<Weight[]>({ queryKey: ["/api/weights"] });

  const addWeight = useMutation({
    mutationFn: async (kg: number) => {
      await apiRequest("POST", "/api/weights", { date: todayStr(), weightKg: kg });
    },
    onSuccess: () => {
      setWeightInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/weights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Weight logged" });
    },
    onError: (err: unknown) =>
      toast({
        title: "Failed to log weight",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      }),
  });

  const goal = settings?.dailyCalorieGoal || 2000;
  const dayNum = settings ? daysSince(settings.journeyStartDate) : 1;

  const n = period === "day" ? 1 : period === "week" ? 7 : 30;
  const dates = lastNDates(n);
  const series = dailyCaloriesSeries(meals, dates);
  const chartData = series.map((s) => ({ ...s, goal }));

  const weightDeltas = weeklyWeightDeltas(weights, settings);
  const totalLoss = weightDeltas.reduce((a, d) => a + d.delta, 0);

  const weightChartData = weights
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => ({
      date: w.date,
      label: new Date(w.date + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
      kg: w.weightKg,
    }));

  return (
    <AppShell title="Progress">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card className="rounded border-[#c0cdd11a] bg-white shadow-[4px_0px_12px_#0000000a]">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-2xl text-[#1a1c1a]">Goal vs. Actual</h3>
                <p className="mt-1 text-sm font-medium text-[#424843]">Calorie intake trends over time</p>
              </div>
              <ToggleGroup
                type="single"
                value={period}
                onValueChange={(v) => v && setPeriod(v as Period)}
                className="h-11 rounded bg-[#eeeeea] p-1"
              >
                {(["day", "week", "month"] as const).map((p) => (
                  <ToggleGroupItem
                    key={p}
                    value={p}
                    data-testid={`toggle-period-${p}`}
                    className="h-9 rounded px-4 text-sm font-bold text-[#1a1c1a] data-[state=on]:bg-white data-[state=on]:text-[#475C65]"
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="mt-8 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5df" />
                  <XAxis
                    dataKey={period === "month" ? "shortLabel" : "label"}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#424843", fontSize: 11 }}
                    interval={period === "month" ? 3 : 0}
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#424843", fontSize: 11 }} width={40} />
                  <Tooltip />
                  <ReferenceLine y={goal} stroke="#8aaab3" strokeDasharray="4 4" label={{ value: "Goal", position: "right", fill: "#475C65", fontSize: 11 }} />
                  <Bar dataKey="calories" fill="#475C65" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded border-0 bg-[#475C65]">
          <CardContent className="p-6 md:p-8">
            <Sparkles className="h-7 w-7 text-white" />
            <h3 className="mt-2 text-2xl text-white">Day {dayNum} of your journey.</h3>
            <p className="mt-2 text-base text-white/90">
              Total change: <span className="font-bold">{totalLoss > 0 ? "+" : ""}{totalLoss.toFixed(1)} kg</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="rounded border-[#c0cdd11a] bg-white shadow-[4px_0px_12px_#0000000a]">
          <CardContent className="p-6 md:p-8">
            <h3 className="text-xl font-bold text-[#1a1c1a]">Weight Trend</h3>
            <p className="mt-1 text-sm text-[#424843]">Track your weight over time</p>
            <form
              className="mt-4 flex items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const kg = parseFloat(weightInput);
                if (!isNaN(kg)) addWeight.mutate(kg);
              }}
            >
              <div className="flex-1">
                <Label htmlFor="weight-input">Log today's weight (kg)</Label>
                <Input
                  id="weight-input"
                  data-testid="input-weight"
                  type="number"
                  step="0.1"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="e.g. 72.4"
                />
              </div>
              <Button
                type="submit"
                data-testid="button-log-weight"
                disabled={addWeight.isPending || !weightInput}
                className="bg-[#475C65] hover:bg-[#3d5059]"
              >
                Save
              </Button>
            </form>
            <div className="mt-6 h-56 w-full">
              {weightChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-[#424843]">
                  No weight entries yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5df" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#424843", fontSize: 11 }} />
                    <YAxis domain={["dataMin - 1", "dataMax + 1"]} tickLine={false} axisLine={false} tick={{ fill: "#424843", fontSize: 11 }} width={40} />
                    <Tooltip />
                    <Line type="monotone" dataKey="kg" stroke="#475C65" strokeWidth={2} dot={{ fill: "#475C65", r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded border-[#c0cdd11a] bg-white shadow-[4px_0px_12px_#0000000a]">
          <CardContent className="p-6 md:p-8">
            <p className="text-sm font-bold uppercase tracking-[1.4px] text-[#424843]">Weekly Breakdown</p>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-5xl font-bold leading-[56px] text-[#475C65]">
                {totalLoss > 0 ? "+" : ""}{totalLoss.toFixed(1)}
              </span>
              <span className="mb-1 text-xl text-[#424843]">kg total</span>
            </div>
            <div className="mt-6">
              {weightDeltas.length === 0 ? (
                <p className="text-sm text-[#424843]">Log your weight to see weekly changes.</p>
              ) : (
                weightDeltas.map((item, i) => (
                  <div key={item.week}>
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm font-medium text-[#1a1c1a]">{item.week}</span>
                      <span className="text-base font-bold text-[#475C65]" data-testid={`text-week-${i}`}>
                        {item.delta > 0 ? "+" : ""}{item.delta.toFixed(1)} kg
                      </span>
                    </div>
                    {i < weightDeltas.length - 1 && <Separator className="bg-[#c0cdd133]" />}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

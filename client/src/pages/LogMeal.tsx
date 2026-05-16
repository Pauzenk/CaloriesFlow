import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppShell } from "@/components/AppShell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertMealSchema, MEAL_TYPES, type InsertMeal, type Meal } from "@shared/schema";
import { type Food, macrosForServing } from "@shared/foods";
import { mealsForDate, todayStr } from "@/lib/calorieflow";

export default function LogMeal() {
  const { toast } = useToast();
  const { data: meals = [] } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });

  const form = useForm<InsertMeal>({
    resolver: zodResolver(insertMealSchema),
    defaultValues: {
      date: todayStr(),
      mealType: "breakfast",
      name: "",
      calories: 0,
      proteins: 0,
      carbs: 0,
      fats: 0,
    },
  });

  const [foodQuery, setFoodQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servingIdx, setServingIdx] = useState<string>("0");
  const [grams, setGrams] = useState<number>(100);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { data: foodResults = [] } = useQuery<Food[]>({
    queryKey: ["/api/foods", { q: foodQuery }],
    queryFn: async () => {
      const res = await fetch(`/api/foods?q=${encodeURIComponent(foodQuery)}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: showSuggestions,
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const computedMacros = useMemo(() => {
    if (!selectedFood) return null;
    return macrosForServing(selectedFood, grams);
  }, [selectedFood, grams]);

  useEffect(() => {
    if (!selectedFood || !computedMacros) return;
    form.setValue("calories", computedMacros.calories);
    form.setValue("proteins", computedMacros.proteins);
    form.setValue("carbs", computedMacros.carbs);
    form.setValue("fats", computedMacros.fats);
  }, [computedMacros, selectedFood, form]);

  function pickFood(food: Food) {
    setSelectedFood(food);
    setShowSuggestions(false);
    setFoodQuery(food.name);
    form.setValue("name", food.name);
    const defaultIdx = 0;
    setServingIdx(String(defaultIdx));
    setGrams(food.servings[defaultIdx].grams);
  }

  function clearFood(resetMacros = false) {
    setSelectedFood(null);
    setServingIdx("0");
    setGrams(100);
    if (resetMacros) {
      form.setValue("calories", 0);
      form.setValue("proteins", 0);
      form.setValue("carbs", 0);
      form.setValue("fats", 0);
    }
  }

  function onServingChange(value: string) {
    setServingIdx(value);
    if (!selectedFood) return;
    if (value === "custom") return;
    const idx = Number(value);
    setGrams(selectedFood.servings[idx].grams);
  }

  const create = useMutation({
    mutationFn: async (data: InsertMeal) => {
      const res = await apiRequest("POST", "/api/meals", data);
      return (await res.json()) as Meal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      form.reset({
        date: todayStr(),
        mealType: "breakfast",
        name: "",
        calories: 0,
        proteins: 0,
        carbs: 0,
        fats: 0,
      });
      setFoodQuery("");
      clearFood();
      toast({ title: "Meal added" });
    },
    onError: (err: unknown) =>
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/meals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      toast({ title: "Meal removed" });
    },
  });

  const todays = mealsForDate(meals, todayStr());

  return (
    <AppShell title="Log Daily Meal">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
        <Card className="rounded-3xl border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
          <CardContent className="p-6 md:p-8">
            <h3 className="text-xl font-bold text-[#1a1c1a]">Add a meal</h3>
            <p className="mt-1 text-sm text-[#424843]">
              Search the food database or type a custom name. Macros auto-fill when you pick a food.
            </p>
            <Form {...form}>
              <form
                className="mt-6 space-y-4"
                onSubmit={form.handleSubmit((data) => create.mutate(data))}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="mealType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meal</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-meal-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {MEAL_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input type="date" data-testid="input-meal-date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div ref={suggestionsRef} className="relative">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Food</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#424843]" />
                            <Input
                              placeholder="Search foods (e.g. chicken, oats, banana)..."
                              autoComplete="off"
                              data-testid="input-meal-name"
                              {...field}
                              value={field.value}
                              onChange={(e) => {
                                field.onChange(e);
                                setFoodQuery(e.target.value);
                                setShowSuggestions(true);
                                if (selectedFood && e.target.value !== selectedFood.name) {
                                  clearFood(true);
                                }
                              }}
                              onFocus={() => setShowSuggestions(true)}
                              className="pl-9"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {showSuggestions && foodResults.length > 0 && (
                    <div
                      data-testid="list-food-suggestions"
                      className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-[#c2c8c14c] bg-white shadow-lg"
                    >
                      {foodResults.map((f) => (
                        <button
                          type="button"
                          key={f.id}
                          data-testid={`suggestion-food-${f.id}`}
                          onClick={() => pickFood(f)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#f4f3ef]"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#1a1c1a]">{f.name}</p>
                            <p className="text-xs text-[#424843]">
                              {f.category} · {f.per100g.calories} kcal / 100 g
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-[#476550]">
                            P {f.per100g.proteins}g · C {f.per100g.carbs}g · F {f.per100g.fats}g
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedFood && (
                  <div
                    data-testid="panel-serving-picker"
                    className="grid grid-cols-1 gap-4 rounded-2xl border border-[#c2c8c14c] bg-[#f4f3ef] p-4 md:grid-cols-2"
                  >
                    <div>
                      <FormLabel className="text-xs uppercase tracking-wider text-[#476550]">
                        Serving size
                      </FormLabel>
                      <Select value={servingIdx} onValueChange={onServingChange}>
                        <SelectTrigger className="mt-1 bg-white" data-testid="select-serving-size">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedFood.servings.map((s, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {s.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom (grams)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FormLabel className="text-xs uppercase tracking-wider text-[#476550]">
                        Amount (g)
                      </FormLabel>
                      <Input
                        type="number"
                        min={0}
                        max={5000}
                        step={1}
                        value={grams}
                        onChange={(e) => {
                          const v = e.target.valueAsNumber || 0;
                          setGrams(v);
                          setServingIdx("custom");
                        }}
                        className="mt-1 bg-white"
                        data-testid="input-serving-grams"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <FormField
                    control={form.control}
                    name="calories"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Calories</FormLabel>
                        <FormControl>
                          <Input type="number" data-testid="input-meal-calories" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="proteins"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Protein (g)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" data-testid="input-meal-proteins" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="carbs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Carbs (g)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" data-testid="input-meal-carbs" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fats"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fats (g)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" data-testid="input-meal-fats" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={create.isPending}
                  className="w-full bg-[#476550] hover:bg-[#3f5b47] md:w-auto"
                  data-testid="button-save-meal"
                >
                  {create.isPending ? "Saving..." : "Save meal"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
          <CardContent className="p-6 md:p-8">
            <h3 className="text-xl font-bold text-[#1a1c1a]">Today's meals</h3>
            <p className="mt-1 text-sm text-[#424843]">{todays.length} entries</p>
            <ul className="mt-4 space-y-2">
              {todays.length === 0 && (
                <li className="rounded-xl border border-dashed border-[#c2c8c14c] p-6 text-center text-sm text-[#424843]">
                  Nothing logged yet today.
                </li>
              )}
              {todays.map((m) => (
                <li
                  key={m.id}
                  data-testid={`row-meal-${m.id}`}
                  className="flex items-center justify-between rounded-xl border border-[#c2c8c14c] bg-[#f4f3ef] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-[#476550]">{m.mealType}</p>
                    <p className="truncate text-sm font-medium text-[#1a1c1a]">{m.name}</p>
                    <p className="text-xs text-[#424843]">
                      {m.calories} kcal · P {Math.round(m.proteins)}g · C {Math.round(m.carbs)}g · F {Math.round(m.fats)}g
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid={`button-delete-meal-${m.id}`}
                    onClick={() => del.mutate(m.id)}
                    className="h-9 w-9 text-[#424843] hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Trash2, X, Sparkles } from "lucide-react";
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
import { MealChat, type NutritionEstimate } from "@/components/MealChat";
import { MealNameAutocomplete } from "@/components/MealNameAutocomplete";

const defaultValues: InsertMeal = {
  date: todayStr(),
  mealType: "breakfast",
  name: "",
  calories: 0,
  proteins: 0,
  carbs: 0,
  fats: 0,
};

export default function LogMeal() {
  const { toast } = useToast();
  const { data: meals = [] } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
  const { data: aiStatus } = useQuery<{ hasApiKey: boolean }>({
    queryKey: ["/api/ai/status"],
  });

  const form = useForm<InsertMeal>({
    resolver: zodResolver(insertMealSchema),
    defaultValues,
  });

  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servingIdx, setServingIdx] = useState<string>("0");
  const [grams, setGrams] = useState<number>(100);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAiEstimate, setIsAiEstimate] = useState(false);

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
    form.setValue("name", food.name);
    setServingIdx("0");
    setGrams(food.servings[0].grams);
    setIsAiEstimate(false);
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

  function onPickHistory(item: { name: string; calories: number; proteins: number; carbs: number; fats: number }) {
    form.setValue("name", item.name);
    form.setValue("calories", item.calories);
    form.setValue("proteins", item.proteins);
    form.setValue("carbs", item.carbs);
    form.setValue("fats", item.fats);
    clearFood();
    setIsAiEstimate(false);
  }

  function onServingChange(value: string) {
    setServingIdx(value);
    if (!selectedFood) return;
    if (value === "custom") return;
    const idx = Number(value);
    setGrams(selectedFood.servings[idx].grams);
  }

  function applyEstimate(estimate: NutritionEstimate) {
    form.setValue("name", estimate.name);
    form.setValue("calories", estimate.calories);
    form.setValue("proteins", estimate.proteins);
    form.setValue("carbs", estimate.carbs);
    form.setValue("fats", estimate.fats);
    clearFood();
    setIsAiEstimate(true);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  const onError = (err: unknown) =>
    toast({
      title: "Failed",
      description: err instanceof Error ? err.message : "Something went wrong",
      variant: "destructive",
    });

  const resetForm = () => {
    setEditingId(null);
    form.reset(defaultValues);
    clearFood();
    setIsAiEstimate(false);
  };

  const create = useMutation({
    mutationFn: async (data: InsertMeal) => {
      const res = await apiRequest("POST", "/api/meals", data);
      return (await res.json()) as Meal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      resetForm();
      toast({ title: "Meal added" });
    },
    onError,
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertMeal }) => {
      const res = await apiRequest("PATCH", `/api/meals/${id}`, data);
      return (await res.json()) as Meal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      resetForm();
      toast({ title: "Meal updated" });
    },
    onError,
  });

  function startEdit(meal: Meal) {
    setEditingId(meal.id);
    setIsAiEstimate(false);
    form.reset({
      date: meal.date,
      mealType: meal.mealType as InsertMeal["mealType"],
      name: meal.name,
      calories: meal.calories,
      proteins: meal.proteins,
      carbs: meal.carbs,
      fats: meal.fats,
    });
    clearFood();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const del = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/meals/${id}`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      if (editingId === id) resetForm();
      toast({ title: "Meal removed" });
    },
  });

  const isPending = create.isPending || update.isPending;
  const todays = mealsForDate(meals, todayStr());

  return (
    <AppShell title="Log Daily Meal">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
        <Card className="border border-[#D4CFC8] bg-white shadow-none" style={{ borderRadius: 0 }}>
          <CardContent className="p-6 md:p-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">Meal Entry</p>
                <h3 className="mt-1 text-xl font-bold text-[#1C1714]" data-testid="text-form-title">
                  {editingId ? "Edit meal" : "Add a meal"}
                </h3>
                <p className="mt-1 text-sm text-[#6B6560]">
                  {editingId
                    ? "Update the details and save your changes."
                    : "Ask AI to estimate nutrition, or search the food database below."}
                </p>
              </div>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="button-cancel-edit"
                  onClick={resetForm}
                  className="shrink-0 text-[#6B6560]"
                >
                  <X className="mr-1 h-4 w-4" />
                  Cancel
                </Button>
              )}
            </div>

            {!editingId && (
              <div className="mt-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#6B6560]">AI nutrition chat</p>
                <MealChat
                  hasApiKey={aiStatus?.hasApiKey ?? true}
                  onUseEstimate={applyEstimate}
                />
              </div>
            )}

            <div className="mt-6 border-t border-[#D4CFC8] pt-6">
              {isAiEstimate && (
                <div
                  data-testid="banner-ai-estimate"
                  className="mb-4 flex items-start gap-2 border border-[#7A7869]/30 bg-[#F0EBE3] px-4 py-3 text-sm text-[#7A7869]"
                >
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>AI estimate applied</strong> — values were pre-filled from the chat. Review and adjust before saving.
                  </span>
                </div>
              )}
              <Form {...form}>
                <form
                  className="space-y-4"
                  onSubmit={form.handleSubmit((data) =>
                    editingId ? update.mutate({ id: editingId, data }) : create.mutate(data)
                  )}
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

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Food</FormLabel>
                        <FormControl>
                          <MealNameAutocomplete
                            value={field.value}
                            onChange={(v) => {
                              field.onChange(v);
                              setIsAiEstimate(false);
                            }}
                            onPickHistory={onPickHistory}
                            onPickFood={(food) => {
                              pickFood(food);
                            }}
                            onClearFood={() => {
                              if (selectedFood) clearFood(true);
                            }}
                            disabled={isPending}
                            placeholder="Search foods or past meals…"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedFood && (
                    <div
                      data-testid="panel-serving-picker"
                      className="grid grid-cols-1 gap-4 border border-[#D4CFC8] bg-[#F5F1EB] p-4 md:grid-cols-2"
                    >
                      <div>
                        <FormLabel className="text-xs uppercase tracking-wider text-[#7A7869]">
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
                        <FormLabel className="text-xs uppercase tracking-wider text-[#7A7869]">
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
                            <Input
                              type="number"
                              data-testid="input-meal-calories"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e.target.valueAsNumber || 0);
                                setIsAiEstimate(false);
                              }}
                            />
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
                            <Input
                              type="number"
                              step="0.1"
                              data-testid="input-meal-proteins"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e.target.valueAsNumber || 0);
                                setIsAiEstimate(false);
                              }}
                            />
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
                            <Input
                              type="number"
                              step="0.1"
                              data-testid="input-meal-carbs"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e.target.valueAsNumber || 0);
                                setIsAiEstimate(false);
                              }}
                            />
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
                            <Input
                              type="number"
                              step="0.1"
                              data-testid="input-meal-fats"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e.target.valueAsNumber || 0);
                                setIsAiEstimate(false);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="h-11 w-full bg-[#7A7869] text-sm font-bold text-white hover:bg-[#5C5B52] md:w-auto md:px-10"
                    data-testid="button-save-meal"
                  >
                    {isPending ? "Saving..." : editingId ? "Update meal" : "Save meal"}
                  </Button>
                </form>
              </Form>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-[#D4CFC8] bg-white shadow-none" style={{ borderRadius: 0 }}>
          <CardContent className="p-6 md:p-8">
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B6560]">Today's Meals</p>
            <h3 className="mt-1 text-xl font-bold text-[#1C1714]">{todays.length} {todays.length === 1 ? "entry" : "entries"}</h3>
            <ul className="mt-4 space-y-2">
              {todays.length === 0 && (
                <li className="border border-dashed border-[#D4CFC8] p-6 text-center text-sm text-[#6B6560]">
                  Nothing logged yet today.
                </li>
              )}
              {todays.map((m) => (
                <li
                  key={m.id}
                  data-testid={`row-meal-${m.id}`}
                  className="flex items-center justify-between border border-[#D4CFC8] bg-[#F5F1EB] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#7A7869]">{m.mealType}</p>
                    <p className="truncate text-sm font-medium text-[#1C1714]">{m.name}</p>
                    <p className="text-xs text-[#6B6560]">
                      {m.calories} kcal · P {Math.round(m.proteins)}g · C {Math.round(m.carbs)}g · F {Math.round(m.fats)}g
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-edit-meal-${m.id}`}
                      onClick={() => startEdit(m)}
                      className="h-9 w-9 text-[#6B6560] hover:text-[#7A7869]"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-delete-meal-${m.id}`}
                      onClick={() => del.mutate(m.id)}
                      className="h-9 w-9 text-[#6B6560] hover:text-[#9B4A2E]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

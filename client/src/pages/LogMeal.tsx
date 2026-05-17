import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Trash2, X, Sparkles } from "lucide-react";
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
  const { data: aiStatus } = useQuery<{ hasApiKey: boolean }>({ queryKey: ["/api/ai/status"] });

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
      <div className="font-['Space_Mono'] text-[#1A1B2E] grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,400px)]">

        {/* ── Entry form ── */}
        <div className="border border-[#1A1B2E]">
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-[#1A1B2E] px-6 py-5">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60">
                {editingId ? "Editing Entry" : "New Entry"}
              </p>
              <h3 className="mt-1 text-xl tracking-tight" data-testid="text-form-title">
                {editingId ? "Edit meal" : "Add a meal"}
              </h3>
            </div>
            {editingId && (
              <button
                type="button"
                data-testid="button-cancel-edit"
                onClick={resetForm}
                className="flex items-center gap-1 text-xs uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            )}
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* AI chat */}
            {!editingId && (
              <div>
                <div className="text-xs uppercase tracking-widest opacity-60 mb-3 pb-2 border-b border-[#1A1B2E]/20">
                  AI Nutrition Chat
                </div>
                <MealChat
                  hasApiKey={aiStatus?.hasApiKey ?? true}
                  onUseEstimate={applyEstimate}
                />
              </div>
            )}

            {/* Form */}
            <div>
              <div className="text-xs uppercase tracking-widest opacity-60 mb-4 pb-2 border-b border-[#1A1B2E]/20">
                Meal Details
              </div>

              {isAiEstimate && (
                <div
                  data-testid="banner-ai-estimate"
                  className="mb-4 flex items-start gap-2 border border-[#5f5b80]/30 bg-[#5f5b80]/5 px-4 py-3 text-sm text-[#5f5b80]"
                >
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>AI estimate applied</strong> — review and adjust before saving.
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
                          <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">Meal type</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-meal-type" className="border-[#1A1B2E]/30 bg-transparent focus:ring-[#5f5b80]">
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
                          <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              data-testid="input-meal-date"
                              className="border-[#1A1B2E]/30 bg-transparent focus-visible:ring-[#5f5b80]"
                              {...field}
                            />
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
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">Food</FormLabel>
                        <FormControl>
                          <MealNameAutocomplete
                            value={field.value}
                            onChange={(v) => {
                              field.onChange(v);
                              setIsAiEstimate(false);
                            }}
                            onPickHistory={onPickHistory}
                            onPickFood={(food) => pickFood(food)}
                            onClearFood={() => { if (selectedFood) clearFood(true); }}
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
                      className="grid grid-cols-1 gap-4 border border-dashed border-[#1A1B2E]/30 p-4 md:grid-cols-2"
                    >
                      <div>
                        <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1.5">Serving size</p>
                        <Select value={servingIdx} onValueChange={onServingChange}>
                          <SelectTrigger className="border-[#1A1B2E]/30 bg-transparent" data-testid="select-serving-size">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedFood.servings.map((s, i) => (
                              <SelectItem key={i} value={String(i)}>{s.label}</SelectItem>
                            ))}
                            <SelectItem value="custom">Custom (grams)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1.5">Amount (g)</p>
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
                          className="border-[#1A1B2E]/30 bg-transparent focus-visible:ring-[#5f5b80]"
                          data-testid="input-serving-grams"
                        />
                      </div>
                    </div>
                  )}

                  {/* Macro fields */}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest opacity-60 mb-3 pb-2 border-b border-[#1A1B2E]/10">
                      Nutrition
                    </div>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      {(["calories", "proteins", "carbs", "fats"] as const).map((fname) => (
                        <FormField
                          key={fname}
                          control={form.control}
                          name={fname}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">
                                {fname === "calories" ? "kcal" : fname === "proteins" ? "protein" : fname}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step={fname === "calories" ? "1" : "0.1"}
                                  data-testid={`input-meal-${fname}`}
                                  className="border-[#1A1B2E]/30 bg-transparent focus-visible:ring-[#5f5b80] tabular-nums"
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
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isPending}
                    data-testid="button-save-meal"
                    className="w-full border-2 border-[#5f5b80] bg-[#5f5b80] py-3 text-xs uppercase tracking-widest text-white hover:bg-[#4a476a] hover:border-[#4a476a] transition-colors disabled:opacity-50 md:w-auto md:px-12"
                  >
                    {isPending ? "Saving..." : editingId ? "Update meal" : "Save meal"}
                  </button>
                </form>
              </Form>
            </div>
          </div>
        </div>

        {/* ── Today's ledger ── */}
        <div className="border border-[#1A1B2E]">
          <div className="border-b-2 border-[#1A1B2E] px-6 py-5">
            <p className="text-[10px] uppercase tracking-widest opacity-60">Today's Record</p>
            <div className="mt-1 flex justify-between items-end">
              <span className="text-xl tracking-tight">
                {todays.length} {todays.length === 1 ? "entry" : "entries"}
              </span>
              <span className="text-xs opacity-50 tabular-nums">
                {todays.reduce((a, m) => a + m.calories, 0)} kcal
              </span>
            </div>
          </div>

          <div className="px-4 py-2">
            {todays.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-xs uppercase tracking-widest opacity-40">Nothing logged yet today</p>
              </div>
            ) : (
              <>
                {todays.map((m) => (
                  <div
                    key={m.id}
                    data-testid={`row-meal-${m.id}`}
                    className="flex items-center py-3 border-b border-[#1A1B2E]/10 hover:border-[#1A1B2E]/30 transition-colors group"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="text-[10px] uppercase tracking-widest text-[#5f5b80] mb-0.5">{m.mealType}</div>
                      <div className="text-sm truncate leading-tight">{m.name}</div>
                      <div className="text-[10px] opacity-40 mt-0.5 tabular-nums">
                        P {Math.round(m.proteins)}g · C {Math.round(m.carbs)}g · F {Math.round(m.fats)}g
                      </div>
                    </div>
                    <div className="shrink-0 tabular-nums text-sm mr-2">{m.calories}</div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        data-testid={`button-edit-meal-${m.id}`}
                        onClick={() => startEdit(m)}
                        className="h-7 w-7 flex items-center justify-center text-[#6B6880] hover:text-[#5f5b80] transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        data-testid={`button-delete-meal-${m.id}`}
                        onClick={() => del.mutate(m.id)}
                        className="h-7 w-7 flex items-center justify-center text-[#6B6880] hover:text-[#5f5b80] transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center py-3 border-b-2 border-[#1A1B2E]">
                  <span className="text-[10px] uppercase tracking-widest opacity-60">Subtotal</span>
                  <span className="tabular-nums text-sm font-bold">
                    {todays.reduce((a, m) => a + m.calories, 0)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

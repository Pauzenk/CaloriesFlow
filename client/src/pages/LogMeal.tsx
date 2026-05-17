import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Trash2, X, Sparkles } from "lucide-react";
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

const IN = "rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1714] placeholder:opacity-40";

const defaultValues: InsertMeal = {
  date: todayStr(),
  mealType: "breakfast",
  name: "",
  calories: 0,
  proteins: 0,
  carbs: 0,
  fats: 0,
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

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
    setGrams(selectedFood.servings[Number(value)].grams);
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
    toast({ title: "Failed", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });

  const resetForm = () => {
    setEditingId(null);
    form.reset(defaultValues);
    clearFood();
    setIsAiEstimate(false);
  };

  const create = useMutation({
    mutationFn: async (data: InsertMeal) => (await apiRequest("POST", "/api/meals", data)).json() as Promise<Meal>,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/meals"] }); resetForm(); toast({ title: "Meal added" }); },
    onError,
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertMeal }) =>
      (await apiRequest("PATCH", `/api/meals/${id}`, data)).json() as Promise<Meal>,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/meals"] }); resetForm(); toast({ title: "Meal updated" }); },
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
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/meals/${id}`); },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      if (editingId === id) resetForm();
      toast({ title: "Meal removed" });
    },
  });

  const isPending = create.isPending || update.isPending;
  const todays = mealsForDate(meals, todayStr()).slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const todayTotal = todays.reduce((s, m) => s + m.calories, 0);

  return (
    <AppShell title="Log Meal">
      <div className="w-full font-['Space_Mono'] text-[#1C1714]">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px]">

          {/* ── Left: Entry form ── */}
          <div>
            <div className="sticky top-0 bg-[#F2EDE7] z-10 border-b-2 border-[#1C1714] pb-4 mb-8">
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">
                {editingId ? "Editing entry" : "New entry"}
              </p>
              <div className="flex items-end justify-between">
                <div className="text-3xl tracking-tighter leading-none" data-testid="text-form-title">
                  {editingId ? "Edit meal" : "Add a meal"}
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
            </div>

            {/* AI chat block */}
            {!editingId && (
              <div className="border border-[#1C1714] p-4 mb-8">
                <div className="text-xs uppercase tracking-widest opacity-60 mb-3 pb-2 border-b border-dashed border-[#1C1714]/20">
                  AI Nutrition Chat
                </div>
                <MealChat
                  hasApiKey={aiStatus?.hasApiKey ?? true}
                  onUseEstimate={applyEstimate}
                />
              </div>
            )}

            {/* AI estimate banner */}
            {isAiEstimate && (
              <div
                data-testid="banner-ai-estimate"
                className="mb-6 flex items-start gap-2 border border-[#1C1714]/20 bg-[#1C1714]/5 px-4 py-3 text-xs"
              >
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="opacity-70">
                  <strong>AI estimate applied</strong> — review and adjust before saving.
                </span>
              </div>
            )}

            <Form {...form}>
              <form
                className="space-y-0"
                onSubmit={form.handleSubmit((data) =>
                  editingId ? update.mutate({ id: editingId, data }) : create.mutate(data)
                )}
              >
                {/* Meal type + date */}
                <div className="grid grid-cols-2 gap-4 border-b border-[#1C1714]/10 pb-5 mb-5">
                  <FormField
                    control={form.control}
                    name="mealType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">Meal type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-meal-type" className="rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-[#1C1714] focus:ring-0 text-sm h-9">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {MEAL_TYPES.map((t) => (
                              <SelectItem key={t} value={t} className="font-['Space_Mono']">
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
                          <Input type="date" data-testid="input-meal-date" className={IN} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Food name */}
                <div className="border-b border-[#1C1714]/10 pb-5 mb-5">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">Food</FormLabel>
                        <FormControl>
                          <MealNameAutocomplete
                            value={field.value}
                            onChange={(v) => { field.onChange(v); setIsAiEstimate(false); }}
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
                </div>

                {/* Serving picker */}
                {selectedFood && (
                  <div
                    data-testid="panel-serving-picker"
                    className="border border-[#1C1714]/20 p-3 mb-5 grid grid-cols-2 gap-4"
                  >
                    <div>
                      <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1.5">Serving</div>
                      <Select value={servingIdx} onValueChange={onServingChange}>
                        <SelectTrigger className="rounded-none border-[#1C1714]/30 bg-transparent font-['Space_Mono'] text-sm h-9 focus:ring-0" data-testid="select-serving-size">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedFood.servings.map((s, i) => (
                            <SelectItem key={i} value={String(i)} className="font-['Space_Mono']">{s.label}</SelectItem>
                          ))}
                          <SelectItem value="custom" className="font-['Space_Mono']">Custom (g)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1.5">Grams</div>
                      <Input
                        type="number" min={0} max={5000} step={1} value={grams}
                        onChange={(e) => { setGrams(e.target.valueAsNumber || 0); setServingIdx("custom"); }}
                        className={IN} data-testid="input-serving-grams"
                      />
                    </div>
                  </div>
                )}

                {/* Macros */}
                <div className="border-b border-[#1C1714]/10 pb-5 mb-6">
                  <div className="text-[10px] uppercase tracking-widest opacity-60 mb-3">Nutrition</div>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {([
                      { name: "calories" as const, label: "Kcal", testid: "input-meal-calories", step: "1" },
                      { name: "proteins" as const, label: "PRO g", testid: "input-meal-proteins", step: "0.1" },
                      { name: "carbs" as const, label: "CRB g", testid: "input-meal-carbs", step: "0.1" },
                      { name: "fats" as const, label: "FAT g", testid: "input-meal-fats", step: "0.1" },
                    ]).map(({ name, label, testid, step }) => (
                      <FormField
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] uppercase tracking-widest opacity-60">{label}</FormLabel>
                            <FormControl>
                              <Input
                                type="number" step={step} data-testid={testid}
                                className={IN + " tabular-nums"}
                                {...field}
                                onChange={(e) => { field.onChange(e.target.valueAsNumber || 0); setIsAiEstimate(false); }}
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
                  className="w-full border-2 border-[#1C1714] py-3 text-xs uppercase tracking-widest hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors disabled:opacity-40 md:w-auto md:px-14"
                >
                  {isPending ? "Saving…" : editingId ? "Update entry" : "Commit to record"}
                </button>
              </form>
            </Form>
          </div>

          {/* ── Right: Today's ledger ── */}
          <div>
            <div className="lg:sticky lg:top-4">
              <div className="border-b-2 border-[#1C1714] pb-4 mb-6">
                <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Today's Ledger</p>
                <div className="text-3xl tracking-tighter leading-none tabular-nums">
                  {todays.length}
                  <span className="text-lg opacity-50 ml-1">{todays.length === 1 ? "entry" : "entries"}</span>
                </div>
              </div>

              {todays.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs uppercase tracking-widest opacity-40">No entries today</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col">
                    {todays.map((m) => (
                      <div
                        key={m.id}
                        data-testid={`row-meal-${m.id}`}
                        className="group flex items-center py-3 border-b border-[#1C1714]/10 hover:border-[#1C1714]/40 transition-colors"
                      >
                        <div className="w-12 text-xs opacity-40 shrink-0">{fmtTime(m.createdAt)}</div>
                        <div className="flex-1 min-w-0 px-2">
                          <div className="leading-tight truncate text-sm">{m.name}</div>
                          <div className="text-[10px] uppercase opacity-40 tracking-widest mt-0.5">{m.mealType}</div>
                        </div>
                        <div className="tabular-nums text-sm shrink-0 mr-1">+{m.calories}</div>
                        <div className="flex gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            data-testid={`button-edit-meal-${m.id}`}
                            onClick={() => startEdit(m)}
                            className="h-7 w-7 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            data-testid={`button-delete-meal-${m.id}`}
                            onClick={() => del.mutate(m.id)}
                            className="h-7 w-7 flex items-center justify-center opacity-50 hover:opacity-100 hover:text-[#9e4515] transition-all"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center py-3 border-b-2 border-[#1C1714]">
                    <div className="text-xs uppercase tracking-widest">Subtotal</div>
                    <div className="tabular-nums">{todayTotal}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

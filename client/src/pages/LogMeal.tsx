import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Trash2, X, Search, Camera, Sparkles } from "lucide-react";
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

type PhotoAnalysisResult = {
  name: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
};

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

  const form = useForm<InsertMeal>({
    resolver: zodResolver(insertMealSchema),
    defaultValues,
  });

  const [foodQuery, setFoodQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servingIdx, setServingIdx] = useState<string>("0");
  const [grams, setGrams] = useState<number>(100);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isAiEstimate, setIsAiEstimate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function onServingChange(value: string) {
    setServingIdx(value);
    if (!selectedFood) return;
    if (value === "custom") return;
    const idx = Number(value);
    setGrams(selectedFood.servings[idx].grams);
  }

  function clearPhoto() {
    setPhotoPreview(null);
    setIsAiEstimate(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    setFoodQuery("");
    clearFood();
    clearPhoto();
  };

  const analyzePhoto = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/meals/analyze-photo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Analysis failed" }));
        throw new Error(err.message || "Analysis failed");
      }
      return (await res.json()) as PhotoAnalysisResult;
    },
    onSuccess: (data) => {
      form.setValue("name", data.name);
      form.setValue("calories", data.calories);
      form.setValue("proteins", data.proteins);
      form.setValue("carbs", data.carbs);
      form.setValue("fats", data.fats);
      setFoodQuery(data.name);
      clearFood();
      setIsAiEstimate(true);
    },
    onError: (err: unknown) => {
      toast({
        title: "Photo analysis failed",
        description: err instanceof Error ? err.message : "Something went wrong. You can still fill in the details manually.",
        variant: "destructive",
      });
      clearPhoto();
    },
  });

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPEG, PNG, WebP, or GIF image.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Please choose an image smaller than 10 MB.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setIsAiEstimate(false);
    analyzePhoto.mutate(file);
  }

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
    clearPhoto();
    form.reset({
      date: meal.date,
      mealType: meal.mealType as InsertMeal["mealType"],
      name: meal.name,
      calories: meal.calories,
      proteins: meal.proteins,
      carbs: meal.carbs,
      fats: meal.fats,
    });
    setFoodQuery(meal.name);
    clearFood();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const del = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/meals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      toast({ title: "Meal removed" });
    },
  });

  const isPending = create.isPending || update.isPending;
  const isAnalyzing = analyzePhoto.isPending;

  const todays = mealsForDate(meals, todayStr());

  return (
    <AppShell title="Log Daily Meal">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
        <Card className="rounded-3xl border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#1a1c1a]" data-testid="text-form-title">
                  {editingId ? "Edit meal" : "Add a meal"}
                </h3>
                <p className="mt-1 text-sm text-[#424843]">
                  {editingId
                    ? "Update the details and save your changes."
                    : "Search the food database or type a custom name. Macros auto-fill when you pick a food."}
                </p>
              </div>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="button-cancel-edit"
                  onClick={resetForm}
                  className="shrink-0 text-[#424843]"
                >
                  <X className="mr-1 h-4 w-4" />
                  Cancel
                </Button>
              )}
            </div>

            {!editingId && (
              <div className="mt-6">
                <p className="text-sm font-medium text-[#1a1c1a] mb-2">Analyze a photo</p>
                <p className="text-xs text-[#424843] mb-3">
                  Snap or upload a photo of your plate and AI will estimate the nutrition for you.
                </p>

                {!photoPreview ? (
                  <label
                    data-testid="button-upload-photo"
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#c2c8c14c] bg-[#f4f3ef] px-4 py-5 text-sm text-[#476550] hover:border-[#476550] hover:bg-[#edf0eb] transition-colors"
                  >
                    <Camera className="h-5 w-5 shrink-0" />
                    <span>Upload photo or take a picture</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      capture="environment"
                      className="sr-only"
                      onChange={onFileChange}
                      data-testid="input-photo-file"
                    />
                  </label>
                ) : (
                  <div className="relative rounded-2xl overflow-hidden border border-[#c2c8c14c]">
                    <img
                      src={photoPreview}
                      alt="Meal photo preview"
                      data-testid="img-photo-preview"
                      className="w-full max-h-52 object-cover"
                    />
                    {isAnalyzing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <p className="text-sm font-medium text-white">Analyzing photo…</p>
                      </div>
                    )}
                    <button
                      type="button"
                      data-testid="button-clear-photo"
                      onClick={clearPhoto}
                      disabled={isAnalyzing}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-50"
                      aria-label="Remove photo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {isAiEstimate && (
                  <div
                    data-testid="banner-ai-estimate"
                    className="mt-4 flex items-start gap-2 rounded-xl border border-[#476550]/30 bg-[#edf0eb] px-4 py-3 text-sm text-[#476550]"
                  >
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>AI estimate</strong> — these values were pre-filled from your photo. Please review and adjust before saving.
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 border-t border-[#c2c8c14c] pt-6">
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
                                  setIsAiEstimate(false);
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
                    disabled={isPending || isAnalyzing}
                    className="w-full bg-[#476550] hover:bg-[#3f5b47] md:w-auto"
                    data-testid="button-save-meal"
                  >
                    {isPending ? "Saving..." : editingId ? "Update meal" : "Save meal"}
                  </Button>
                </form>
              </Form>
            </div>
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
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-edit-meal-${m.id}`}
                      onClick={() => startEdit(m)}
                      className="h-9 w-9 text-[#424843] hover:text-[#476550]"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-delete-meal-${m.id}`}
                      onClick={() => del.mutate(m.id)}
                      className="h-9 w-9 text-[#424843] hover:text-red-600"
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

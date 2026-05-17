import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Trash2, X, Sparkles, MessageSquare, ChevronDown, Camera, Send, Bot, User as UserIcon, ArrowRight, Activity } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppShell } from "@/components/AppShell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertMealSchema, MEAL_TYPES, type InsertMeal, type Meal } from "@shared/schema";
import { type Food, macrosForServing } from "@shared/foods";
import { mealsForDate, todayStr } from "@/lib/calorieflow";
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

// ── Chat types ──────────────────────────────────────────────────────────────

type NutritionEstimate = {
  name: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
};

type ActivityEstimate = {
  name: string;
  durationMinutes: number;
  caloriesBurned: number;
  activityType: "cardio" | "strength" | "other";
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  imageDataUrl?: string;
  estimate?: NutritionEstimate;
  activityEstimate?: ActivityEstimate;
};

type HistoryItem = {
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string;
};

type ChatResponse = {
  reply: string;
  estimate?: NutritionEstimate;
  activityEstimate?: ActivityEstimate;
};

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;
let msgId = 0;
const nextId = () => ++msgId;

// ── Inline Chat Component ────────────────────────────────────────────────────

function InlineChat({ onApplyEstimate }: { onApplyEstimate: (e: NutritionEstimate) => void }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: aiStatus } = useQuery<{ hasApiKey: boolean }>({ queryKey: ["/api/ai/status"] });
  const hasApiKey = aiStatus?.hasApiKey ?? true;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const logActivity = useMutation({
    mutationFn: async (est: ActivityEstimate) =>
      (await apiRequest("POST", "/api/activities", {
        date: todayStr(),
        name: est.name,
        durationMinutes: est.durationMinutes,
        caloriesBurned: est.caloriesBurned,
        activityType: est.activityType,
      })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "Activity logged" });
    },
    onError: (err: unknown) =>
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" }),
  });

  const chat = useMutation({
    mutationFn: async ({ history, userText, photo }: { history: HistoryItem[]; userText: string; photo: File | null }) => {
      const fd = new FormData();
      fd.append("messages", JSON.stringify(history));
      fd.append("message", userText);
      if (photo) fd.append("photo", photo);
      const res = await fetch("/api/meals/chat", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message || "Request failed");
      }
      return (await res.json()) as ChatResponse;
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: data.reply, estimate: data.estimate, activityEstimate: data.activityEstimate },
      ]);
      if (data.activityEstimate) {
        logActivity.mutate(data.activityEstimate);
      }
    },
    onError: (err: unknown) => {
      toast({ title: "Chat failed", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
    },
  });

  function buildHistory(msgs: ChatMessage[]): HistoryItem[] {
    return msgs.map((m) => ({
      role: m.role,
      content: m.text || "",
      ...(m.imageDataUrl ? { imageDataUrl: m.imageDataUrl } : {}),
    }));
  }

  function send() {
    const text = input.trim();
    if (!text && !pendingPhoto) return;
    if (chat.isPending) return;
    const userMsg: ChatMessage = { id: nextId(), role: "user", text, imageDataUrl: pendingPhoto?.dataUrl };
    const history = buildHistory(messages);
    const photoFile = pendingPhoto?.file ?? null;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    chat.mutate({ history, userText: text, photo: photoFile });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      toast({ title: "Invalid file type", description: "JPEG, PNG, WebP or GIF only.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Image too large", description: "Max 10 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setPendingPhoto({ file, dataUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
  }

  const canSend = (input.trim().length > 0 || pendingPhoto !== null) && !chat.isPending;

  if (!hasApiKey) {
    return (
      <div className="border border-[#1C1714] p-4 text-center">
        <div className="text-xs uppercase tracking-widest opacity-60 mb-2">AI Not Configured</div>
        <p className="text-sm opacity-70">An OpenAI API key is required for AI chat.</p>
      </div>
    );
  }

  return (
    <div className="border border-[#1C1714]/20 p-4 flex flex-col gap-4" style={{ minHeight: 320 }}>
      {/* Empty state / suggestions */}
      {messages.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs opacity-50 mb-1">Describe what you ate and AI will estimate calories &amp; macros.</p>
          {[
            "I had oatmeal with banana for breakfast",
            "2 slices of sourdough with avocado",
            "Chicken breast with rice and broccoli",
          ].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}
              className="text-left border border-[#1C1714]/15 px-3 py-2 text-xs hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Message thread */}
      {messages.length > 0 && (
        <div data-testid="chat-thread" className="flex flex-col gap-3 max-h-80 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              data-testid={`chat-message-${msg.id}`}
              className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[9px] mt-0.5 ${
                msg.role === "user"
                  ? "border-[#1C1714] bg-[#1C1714] text-[#F2EDE7]"
                  : "border-[#1C1714]/30 bg-transparent"
              }`}>
                {msg.role === "user" ? <UserIcon className="h-2.5 w-2.5" /> : <Bot className="h-2.5 w-2.5 opacity-60" />}
              </div>

              <div className={`flex max-w-[80%] flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.imageDataUrl && (
                  <img
                    src={msg.imageDataUrl}
                    alt="Attached"
                    className="max-h-36 border border-[#1C1714]/20 object-cover"
                    data-testid={`chat-photo-${msg.id}`}
                  />
                )}
                {msg.text && (
                  <div className={`px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#1C1714] text-[#F2EDE7]"
                      : "border border-[#1C1714]/20 bg-transparent"
                  }`}>
                    {msg.text}
                  </div>
                )}

                {/* Meal estimate card */}
                {msg.estimate && (
                  <div data-testid={`chat-estimate-${msg.id}`} className="w-full border border-[#1C1714] p-3">
                    <div className="text-[9px] uppercase tracking-widest opacity-60 mb-2 pb-1.5 border-b border-dashed border-[#1C1714]/20">
                      Nutrition Estimate
                    </div>
                    <div className="text-xs mb-2">{msg.estimate.name}</div>
                    <div className="grid grid-cols-4 gap-1.5 text-center mb-3">
                      {[
                        { label: "Kcal", value: msg.estimate.calories },
                        { label: "PRO", value: `${msg.estimate.proteins}g` },
                        { label: "CRB", value: `${msg.estimate.carbs}g` },
                        { label: "FAT", value: `${msg.estimate.fats}g` },
                      ].map(({ label, value }) => (
                        <div key={label} className="border border-[#1C1714]/10 py-1.5">
                          <div className="text-[8px] uppercase tracking-widest opacity-50">{label}</div>
                          <div className="text-xs tabular-nums mt-0.5">{value}</div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      data-testid={`button-use-estimate-${msg.id}`}
                      onClick={() => onApplyEstimate(msg.estimate!)}
                      className="w-full flex items-center justify-center gap-1.5 border border-[#1C1714] py-1.5 text-[10px] uppercase tracking-widest hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors"
                    >
                      Log this meal <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Activity estimate card */}
                {msg.activityEstimate && (
                  <div data-testid={`chat-activity-estimate-${msg.id}`} className="w-full border border-[#1C1714]/50 p-3">
                    <div className="text-[9px] uppercase tracking-widest opacity-60 mb-2 pb-1.5 border-b border-dashed border-[#1C1714]/20 flex items-center gap-1.5">
                      <Activity className="h-3 w-3" /> Activity Estimate
                    </div>
                    <div className="text-xs mb-2">{msg.activityEstimate.name}</div>
                    <div className="grid grid-cols-3 gap-1.5 text-center mb-3">
                      {[
                        { label: "Type", value: msg.activityEstimate.activityType },
                        { label: "Duration", value: `${msg.activityEstimate.durationMinutes}min` },
                        { label: "Burned", value: `${msg.activityEstimate.caloriesBurned} kcal` },
                      ].map(({ label, value }) => (
                        <div key={label} className="border border-[#1C1714]/10 py-1.5">
                          <div className="text-[8px] uppercase tracking-widest opacity-50">{label}</div>
                          <div className="text-xs tabular-nums mt-0.5">{value}</div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      data-testid={`button-log-activity-${msg.id}`}
                      onClick={() => logActivity.mutate(msg.activityEstimate!)}
                      disabled={logActivity.isPending}
                      className="w-full flex items-center justify-center gap-1.5 border border-[#1C1714]/50 py-1.5 text-[10px] uppercase tracking-widest hover:bg-[#1C1714]/10 transition-colors disabled:opacity-40"
                    >
                      <Activity className="h-3 w-3" /> Log this activity
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {chat.isPending && (
            <div data-testid="chat-typing" className="flex gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center border border-[#1C1714]/30 mt-0.5">
                <Bot className="h-2.5 w-2.5 opacity-50" />
              </div>
              <div className="border border-[#1C1714]/20 px-3 py-2 flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-bounce bg-[#1C1714] opacity-40 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce bg-[#1C1714] opacity-40 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce bg-[#1C1714] opacity-40 [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[#1C1714]/20 pt-3 mt-auto">
        {pendingPhoto && (
          <div className="relative mb-2 w-16">
            <img
              src={pendingPhoto.dataUrl}
              alt="To attach"
              data-testid="chat-pending-photo"
              className="h-12 w-16 border border-[#1C1714]/20 object-cover"
            />
            <button
              type="button"
              onClick={() => { setPendingPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              data-testid="button-clear-pending-photo"
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center bg-[#1C1714] text-[#F2EDE7]"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={chat.isPending}
            data-testid="input-chat-message"
            placeholder={messages.length === 0 ? "Describe what you ate or an activity…" : "Ask a follow-up…"}
            className="flex-1 resize-none border border-[#1C1714]/30 bg-transparent px-3 py-2 text-xs font-['Space_Mono'] text-[#1C1714] placeholder:opacity-40 focus:border-[#1C1714] focus:outline-none"
          />
          <div className="flex shrink-0 flex-col gap-1">
            <label
              data-testid="button-chat-attach-photo"
              className="flex h-8 w-8 cursor-pointer items-center justify-center border border-[#1C1714]/30 hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors"
              title="Attach photo"
            >
              <Camera className="h-3.5 w-3.5 opacity-60" />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                capture="environment"
                className="sr-only"
                onChange={onFileChange}
                data-testid="input-chat-photo-file"
              />
            </label>
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              data-testid="button-chat-send"
              className="flex h-8 w-8 items-center justify-center border-2 border-[#1C1714] bg-[#1C1714] text-[#F2EDE7] hover:bg-[#1C1714]/90 transition-colors disabled:opacity-30"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[9px] uppercase tracking-widest opacity-30">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// ── Main LogMeal Page ────────────────────────────────────────────────────────

export default function LogMeal() {
  const { toast } = useToast();
  const { data: meals = [] } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });

  const form = useForm<InsertMeal>({
    resolver: zodResolver(insertMealSchema),
    defaultValues,
  });

  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servingIdx, setServingIdx] = useState<string>("0");
  const [grams, setGrams] = useState<number>(100);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAiEstimate, setIsAiEstimate] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Pre-fill from AI chat query params (e.g. /log?name=X&calories=500&proteins=30&carbs=40&fats=15)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("name");
    const calories = params.get("calories");
    if (name && calories) {
      form.setValue("name", name);
      form.setValue("calories", Number(calories) || 0);
      form.setValue("proteins", Number(params.get("proteins")) || 0);
      form.setValue("carbs", Number(params.get("carbs")) || 0);
      form.setValue("fats", Number(params.get("fats")) || 0);
      setIsAiEstimate(true);
      window.history.replaceState({}, "", "/log");
    }
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

  function applyEstimate(estimate: { name: string; calories: number; proteins: number; carbs: number; fats: number }) {
    form.setValue("name", estimate.name);
    form.setValue("calories", estimate.calories);
    form.setValue("proteins", estimate.proteins);
    form.setValue("carbs", estimate.carbs);
    form.setValue("fats", estimate.fats);
    clearFood();
    setIsAiEstimate(true);
    setChatOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

            {/* ── AI Chat trigger button ── */}
            {!editingId && (
              <div className="mb-8">
                <button
                  type="button"
                  data-testid="button-toggle-ai-chat"
                  onClick={() => setChatOpen(true)}
                  className="w-full bg-[#1C1714] text-[#F2EDE7] p-4 flex items-center justify-between hover:bg-[#1C1714]/90 transition-colors group"
                >
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">AI Nutrition Chat</div>
                    <div className="text-sm">
                      Describe what you ate — AI estimates calories &amp; macros
                    </div>
                  </div>
                  <MessageSquare className="h-5 w-5 opacity-60 shrink-0 ml-4" />
                </button>
              </div>
            )}

            {/* ── AI Chat full-screen overlay ── */}
            {chatOpen && (
              <div className="fixed inset-0 z-50 bg-[#F2EDE7] flex flex-col font-['Space_Mono']">
                <div className="flex items-center justify-between px-4 py-4 border-b-2 border-[#1C1714] shrink-0">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5">AI Nutrition Chat</p>
                    <p className="text-xl tracking-tighter leading-none">What did you eat?</p>
                  </div>
                  <button
                    type="button"
                    data-testid="button-close-ai-chat"
                    onClick={() => setChatOpen(false)}
                    className="flex items-center gap-1.5 border border-[#1C1714]/30 px-3 py-2 text-xs uppercase tracking-widest hover:border-[#1C1714] hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> Close
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <InlineChat onApplyEstimate={applyEstimate} />
                </div>
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

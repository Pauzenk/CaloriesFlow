import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "wouter";
import {
  Pencil, Trash2, X, Sparkles, Send, Bot, User as UserIcon,
  ArrowRight, Activity, ArrowLeft, Camera, MessageSquare, PenLine,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertMealSchema, MEAL_TYPES, type InsertMeal, type Meal } from "@shared/schema";
import { mealsForDate, todayStr } from "@/lib/calorieflow";

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

function InlineChat({
  onApplyEstimate,
  dark = false,
  storageKey,
  logDate,
}: {
  onApplyEstimate: (e: NutritionEstimate) => void;
  dark?: boolean;
  storageKey: string;
  logDate: string;
}) {
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [input, setInput] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: aiStatus } = useQuery<{ hasApiKey: boolean }>({ queryKey: ["/api/ai/status"] });
  const hasApiKey = aiStatus?.hasApiKey ?? true;

  // Persist chat history for this day
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const logActivity = useMutation({
    mutationFn: async (est: ActivityEstimate) =>
      (await apiRequest("POST", "/api/activities", {
        date: logDate,
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

  const bg = dark ? "#1C1714" : "transparent";
  const text = dark ? "#F2EDE7" : "#1C1714";
  const borderAlpha = dark ? "border-[#F2EDE7]/15" : "border-[#1C1714]/20";

  if (!hasApiKey) {
    return (
      <div className={`p-4 text-center border ${borderAlpha}`} style={{ color: text }}>
        <div className="text-xs uppercase tracking-widest opacity-60 mb-2">AI Not Configured</div>
        <p className="text-sm opacity-70">An OpenAI API key is required for AI chat.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full" style={{ background: bg, color: text }}>
      {/* Empty state / suggestions */}
      {messages.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs mb-2 leading-relaxed" style={{ opacity: 0.5 }}>
            Describe what you ate or an activity — AI estimates calories &amp; macros automatically.
          </p>
          {[
            "I had oatmeal with banana for breakfast",
            "2 slices of sourdough with avocado",
            "Chicken breast with rice and broccoli",
            "Cardio 25 minutes",
          ].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}
              className={`text-left border px-3 py-2.5 text-xs transition-colors ${
                dark
                  ? "border-[#F2EDE7]/15 hover:border-[#F2EDE7]/40 hover:bg-[#F2EDE7]/5"
                  : "border-[#1C1714]/15 hover:border-[#1C1714] hover:bg-[#1C1714]/5"
              }`}
              style={{ color: text }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Message thread */}
      {messages.length > 0 && (
        <div data-testid="chat-thread" className="flex flex-col gap-3 flex-1 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              data-testid={`chat-message-${msg.id}`}
              className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[9px] mt-0.5 ${
                  msg.role === "user"
                    ? dark
                      ? "border-[#F2EDE7] bg-[#F2EDE7] text-[#1C1714]"
                      : "border-[#1C1714] bg-[#1C1714] text-[#F2EDE7]"
                    : dark
                    ? "border-[#F2EDE7]/30 bg-transparent"
                    : "border-[#1C1714]/30 bg-transparent"
                }`}
              >
                {msg.role === "user"
                  ? <UserIcon className="h-2.5 w-2.5" />
                  : <Bot className={`h-2.5 w-2.5 ${dark ? "opacity-70" : "opacity-60"}`} />}
              </div>

              <div className={`flex max-w-[80%] flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.imageDataUrl && (
                  <img
                    src={msg.imageDataUrl}
                    alt="Attached"
                    className={`max-h-36 object-cover border ${dark ? "border-[#F2EDE7]/20" : "border-[#1C1714]/20"}`}
                    data-testid={`chat-photo-${msg.id}`}
                  />
                )}
                {msg.text && (
                  <div
                    className={`px-3 py-2 text-xs leading-relaxed border ${
                      msg.role === "user"
                        ? dark
                          ? "bg-[#F2EDE7] text-[#1C1714] border-transparent"
                          : "bg-[#1C1714] text-[#F2EDE7] border-transparent"
                        : dark
                        ? "bg-[#F2EDE7]/8 border-[#F2EDE7]/15 text-[#F2EDE7]"
                        : "bg-transparent border-[#1C1714]/20 text-[#1C1714]"
                    }`}
                  >
                    {msg.text}
                  </div>
                )}

                {/* Meal estimate card */}
                {msg.estimate && (
                  <div
                    data-testid={`chat-estimate-${msg.id}`}
                    className={`w-full border p-3 ${dark ? "border-[#F2EDE7]/25" : "border-[#1C1714]"}`}
                  >
                    <div className={`text-[9px] uppercase tracking-widest mb-2 pb-1.5 border-b ${dark ? "opacity-50 border-[#F2EDE7]/15" : "opacity-60 border-dashed border-[#1C1714]/20"}`}>
                      Nutrition Estimate
                    </div>
                    <div className="text-xs mb-2" style={{ opacity: 0.85 }}>{msg.estimate.name}</div>
                    <div className="grid grid-cols-4 gap-1.5 text-center mb-3">
                      {[
                        { label: "Kcal", value: msg.estimate.calories },
                        { label: "PRO", value: `${msg.estimate.proteins}g` },
                        { label: "CRB", value: `${msg.estimate.carbs}g` },
                        { label: "FAT", value: `${msg.estimate.fats}g` },
                      ].map(({ label, value }) => (
                        <div key={label} className={`border py-1.5 ${dark ? "border-[#F2EDE7]/10" : "border-[#1C1714]/10"}`}>
                          <div className="text-[8px] uppercase tracking-widest" style={{ opacity: 0.5 }}>{label}</div>
                          <div className="text-xs tabular-nums mt-0.5">{value}</div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      data-testid={`button-use-estimate-${msg.id}`}
                      onClick={() => onApplyEstimate(msg.estimate!)}
                      className={`w-full flex items-center justify-center gap-1.5 border py-2 text-[10px] uppercase tracking-widest transition-colors ${
                        dark
                          ? "border-[#F2EDE7]/40 text-[#F2EDE7] hover:bg-[#F2EDE7] hover:text-[#1C1714]"
                          : "border-[#1C1714] text-[#1C1714] hover:bg-[#1C1714] hover:text-[#F2EDE7]"
                      }`}
                    >
                      Log this meal <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Activity estimate card */}
                {msg.activityEstimate && (
                  <div
                    data-testid={`chat-activity-estimate-${msg.id}`}
                    className={`w-full border p-3 ${dark ? "border-[#F2EDE7]/20" : "border-[#1C1714]/50"}`}
                  >
                    <div className={`text-[9px] uppercase tracking-widest mb-2 pb-1.5 border-b flex items-center gap-1.5 ${dark ? "opacity-50 border-[#F2EDE7]/15" : "opacity-60 border-dashed border-[#1C1714]/20"}`}>
                      <Activity className="h-3 w-3" /> Activity Logged
                    </div>
                    <div className="text-xs mb-2" style={{ opacity: 0.85 }}>{msg.activityEstimate.name}</div>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      {[
                        { label: "Type", value: msg.activityEstimate.activityType },
                        { label: "Duration", value: `${msg.activityEstimate.durationMinutes}min` },
                        { label: "Burned", value: `${msg.activityEstimate.caloriesBurned} kcal` },
                      ].map(({ label, value }) => (
                        <div key={label} className={`border py-1.5 ${dark ? "border-[#F2EDE7]/10" : "border-[#1C1714]/10"}`}>
                          <div className="text-[8px] uppercase tracking-widest" style={{ opacity: 0.5 }}>{label}</div>
                          <div className="text-xs tabular-nums mt-0.5">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {chat.isPending && (
            <div data-testid="chat-typing" className="flex gap-2">
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center border mt-0.5 ${dark ? "border-[#F2EDE7]/30" : "border-[#1C1714]/30"}`}>
                <Bot className={`h-2.5 w-2.5 ${dark ? "opacity-50 text-[#F2EDE7]" : "opacity-50"}`} />
              </div>
              <div className={`border px-3 py-2 flex items-center gap-1 ${dark ? "border-[#F2EDE7]/15" : "border-[#1C1714]/20"}`}>
                <span className={`h-1.5 w-1.5 animate-bounce [animation-delay:0ms] ${dark ? "bg-[#F2EDE7]" : "bg-[#1C1714]"} opacity-40`} />
                <span className={`h-1.5 w-1.5 animate-bounce [animation-delay:150ms] ${dark ? "bg-[#F2EDE7]" : "bg-[#1C1714]"} opacity-40`} />
                <span className={`h-1.5 w-1.5 animate-bounce [animation-delay:300ms] ${dark ? "bg-[#F2EDE7]" : "bg-[#1C1714]"} opacity-40`} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input area */}
      <div className={`border-t pt-4 mt-auto shrink-0 ${dark ? "border-[#F2EDE7]/10" : "border-[#1C1714]/20"}`}>
        {pendingPhoto && (
          <div className="relative mb-2 w-16">
            <img
              src={pendingPhoto.dataUrl}
              alt="To attach"
              data-testid="chat-pending-photo"
              className={`h-12 w-16 object-cover border ${dark ? "border-[#F2EDE7]/20" : "border-[#1C1714]/20"}`}
            />
            <button
              type="button"
              onClick={() => { setPendingPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              data-testid="button-clear-pending-photo"
              className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center ${dark ? "bg-[#F2EDE7] text-[#1C1714]" : "bg-[#1C1714] text-[#F2EDE7]"}`}
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
            className={`flex-1 resize-none border px-3 py-2 text-xs font-['Space_Mono'] placeholder:opacity-40 focus:outline-none ${
              dark
                ? "border-[#F2EDE7]/20 bg-[#F2EDE7]/5 text-[#F2EDE7] focus:border-[#F2EDE7]/50"
                : "border-[#1C1714]/30 bg-transparent text-[#1C1714] focus:border-[#1C1714]"
            }`}
          />
          <div className="flex shrink-0 flex-col gap-1">
            <label
              data-testid="button-chat-attach-photo"
              className={`flex h-8 w-8 cursor-pointer items-center justify-center border transition-colors ${
                dark
                  ? "border-[#F2EDE7]/20 hover:border-[#F2EDE7]/50 hover:bg-[#F2EDE7]/5"
                  : "border-[#1C1714]/30 hover:border-[#1C1714] hover:bg-[#1C1714]/5"
              }`}
              title="Attach photo"
            >
              <Camera className={`h-3.5 w-3.5 ${dark ? "text-[#F2EDE7] opacity-60" : "opacity-60"}`} />
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
              className={`flex h-8 w-8 items-center justify-center border-2 transition-colors disabled:opacity-30 ${
                dark
                  ? "border-[#F2EDE7] bg-[#F2EDE7] text-[#1C1714] hover:bg-[#F2EDE7]/90"
                  : "border-[#1C1714] bg-[#1C1714] text-[#F2EDE7] hover:bg-[#1C1714]/90"
              }`}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className={`mt-1.5 text-[9px] uppercase tracking-widest ${dark ? "text-[#F2EDE7]/25" : "opacity-30"}`}>
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

  // Read date from URL query param (?date=YYYY-MM-DD), fallback to today
  const logDate = (() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayStr();
  })();

  const chatStorageKey = `calorieflow-chat-${logDate}`;

  const form = useForm<InsertMeal>({
    resolver: zodResolver(insertMealSchema),
    defaultValues: { ...defaultValues, date: logDate },
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAiEstimate, setIsAiEstimate] = useState(false);
  // Mobile view: "chat" (default) or "form"
  const [mobileView, setMobileView] = useState<"chat" | "form">("chat");

  const dateLabel = new Date(logDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const resetForm = () => {
    setEditingId(null);
    form.reset({ ...defaultValues, date: logDate });
    setIsAiEstimate(false);
  };

  function applyEstimate(estimate: NutritionEstimate) {
    form.setValue("name", estimate.name);
    form.setValue("calories", estimate.calories);
    form.setValue("proteins", estimate.proteins);
    form.setValue("carbs", estimate.carbs);
    form.setValue("fats", estimate.fats);
    setIsAiEstimate(true);
    setMobileView("form");
  }

  const onError = (err: unknown) =>
    toast({ title: "Failed", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });

  const create = useMutation({
    mutationFn: async (data: InsertMeal) => (await apiRequest("POST", "/api/meals", data)).json() as Promise<Meal>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      resetForm();
      toast({ title: "Meal added" });
      setMobileView("chat");
    },
    onError,
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertMeal }) =>
      (await apiRequest("PATCH", `/api/meals/${id}`, data)).json() as Promise<Meal>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      resetForm();
      toast({ title: "Meal updated" });
      setMobileView("chat");
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
    setMobileView("form");
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
  const dayMeals = mealsForDate(meals, logDate).slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const dayTotal = dayMeals.reduce((s, m) => s + m.calories, 0);

  // ── Shared header ──
  const sharedHeader = (
    <header className="flex items-center justify-between px-5 py-4 border-b-2 border-[#1C1714] bg-[#F2EDE7] shrink-0 z-10">
      <div className="flex items-center gap-4">
        <Link href="/">
          <button
            type="button"
            data-testid="button-back-to-dashboard"
            className="flex items-center gap-1.5 text-xs uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        </Link>
        <div className="h-4 w-px bg-[#1C1714]/20" />
        <div>
          <p className="text-[10px] uppercase tracking-widest opacity-50 leading-none mb-0.5">Log Meal</p>
          <p className="text-base tracking-tighter leading-none" data-testid="text-form-title">
            {editingId ? "Edit entry" : "New entry"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {editingId && (
          <button
            type="button"
            data-testid="button-cancel-edit"
            onClick={() => { resetForm(); setMobileView("chat"); }}
            className="flex items-center gap-1 text-xs uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        )}
        <p className="text-xs opacity-30 hidden sm:block">{dateLabel}</p>
      </div>
    </header>
  );

  // ── Shared form ──
  const mealForm = (
    <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8 pb-24 md:pb-8">

      {isAiEstimate && (
        <div
          data-testid="banner-ai-estimate"
          className="mb-5 flex items-start gap-2 border border-[#1C1714]/20 bg-[#1C1714]/5 px-4 py-3 text-xs"
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
                    <Input
                      data-testid="input-meal-name"
                      placeholder="e.g. Chicken breast with rice"
                      className={IN}
                      {...field}
                      onChange={(e) => { field.onChange(e.target.value); setIsAiEstimate(false); }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Macros */}
          <div className="border-b border-[#1C1714]/10 pb-5 mb-6">
            <div className="text-[10px] uppercase tracking-widest opacity-60 mb-3">Nutrition</div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            className="w-full bg-[#1C1714] text-[#F2EDE7] py-3 text-xs uppercase tracking-widest hover:bg-[#1C1714]/85 transition-colors disabled:opacity-40 sm:w-auto sm:px-14"
          >
            {isPending ? "Saving…" : editingId ? "Update entry" : "Commit to record"}
          </button>
        </form>
      </Form>

      {/* Today's Ledger — web only */}
      {dayMeals.length > 0 && (
        <div className="hidden md:block mt-10 border-t-2 border-[#1C1714] pt-6">
          <div className="flex items-baseline justify-between mb-4">
            <p className="text-[10px] uppercase tracking-widest opacity-60">
              {logDate === todayStr() ? "Today's Ledger" : "Day's Ledger"}
            </p>
            <p className="text-sm tabular-nums opacity-60">{dayMeals.length} {dayMeals.length === 1 ? "entry" : "entries"}</p>
          </div>
          <div className="flex flex-col">
            {dayMeals.map((m) => (
              <div
                key={m.id}
                data-testid={`row-meal-${m.id}`}
                className="group flex items-center py-2.5 border-b border-[#1C1714]/10 hover:border-[#1C1714]/30 transition-colors"
              >
                <div className="w-10 text-[10px] opacity-35 shrink-0">{fmtTime(m.createdAt)}</div>
                <div className="flex-1 min-w-0 px-2">
                  <div className="text-xs leading-tight truncate">{m.name}</div>
                  <div className="text-[9px] uppercase opacity-35 tracking-widest mt-0.5">{m.mealType}</div>
                </div>
                <div className="tabular-nums text-xs shrink-0 mr-1 opacity-70">+{m.calories}</div>
                <div className="flex gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    data-testid={`button-edit-meal-${m.id}`}
                    onClick={() => startEdit(m)}
                    className="h-6 w-6 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    data-testid={`button-delete-meal-${m.id}`}
                    onClick={() => del.mutate(m.id)}
                    className="h-6 w-6 flex items-center justify-center opacity-50 hover:opacity-100 hover:text-[#9e4515] transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center py-3 border-b-2 border-[#1C1714]">
            <div className="text-[10px] uppercase tracking-widest opacity-60">Subtotal</div>
            <div className="tabular-nums text-sm">{dayTotal} kcal</div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F2EDE7] flex flex-col font-['Space_Mono'] text-[#1C1714]">

      {/* ════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on md+)
      ════════════════════════════════════════════ */}
      <div className="flex flex-col flex-1 md:hidden">

        {mobileView === "chat" ? (
          /* Mobile: Chat-first full screen */
          <div className="flex flex-col flex-1 bg-[#1C1714] text-[#F2EDE7]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F2EDE7]/10 shrink-0">
              <div className="flex items-center gap-4">
                <Link href="/">
                  <button
                    type="button"
                    data-testid="button-back-mobile"
                    className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#F2EDE7]/50 hover:text-[#F2EDE7] transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                </Link>
                <div className="h-4 w-px bg-[#F2EDE7]/15" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#F2EDE7]/50 leading-none mb-0.5">AI Nutrition Chat</p>
                  <p className="text-base tracking-tighter text-[#F2EDE7] leading-none">What did you eat?</p>
                </div>
              </div>
              <button
                type="button"
                data-testid="button-switch-to-form"
                onClick={() => setMobileView("form")}
                className="flex items-center gap-1.5 border border-[#F2EDE7]/20 px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#F2EDE7] hover:border-[#F2EDE7]/50 transition-colors"
              >
                <PenLine className="h-3 w-3" /> Manual
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col">
              <InlineChat
                onApplyEstimate={applyEstimate}
                dark
                storageKey={chatStorageKey}
                logDate={logDate}
              />
            </div>
          </div>
        ) : (
          /* Mobile: Form view */
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between px-5 py-4 border-b-2 border-[#1C1714] bg-[#F2EDE7] shrink-0">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  data-testid="button-back-to-chat"
                  onClick={() => { resetForm(); setMobileView("chat"); }}
                  className="flex items-center gap-1.5 text-xs uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Chat
                </button>
                <div className="h-4 w-px bg-[#1C1714]/20" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-50 leading-none mb-0.5">Log Meal</p>
                  <p className="text-base tracking-tighter leading-none">
                    {editingId ? "Edit entry" : "New entry"}
                  </p>
                </div>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={() => { resetForm(); setMobileView("chat"); }}
                  className="text-xs uppercase tracking-widest opacity-50 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {mealForm}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════
          WEB LAYOUT  (hidden on mobile)
      ════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col flex-1 overflow-hidden">
        {sharedHeader}

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden flex-row-reverse">
          {/* Right column: form + ledger */}
          {mealForm}

          {/* Left column: dark chat */}
          <div className="hidden md:flex flex-col w-[400px] xl:w-[460px] bg-[#1C1714] text-[#F2EDE7] shrink-0 border-r-2 border-[#1C1714]">
            <div className="px-6 py-5 border-b border-[#F2EDE7]/10 shrink-0">
              <p className="text-[10px] uppercase tracking-widest text-[#F2EDE7]/50 mb-0.5">AI Nutrition Chat</p>
              <p className="text-xl tracking-tighter text-[#F2EDE7] leading-none">What did you eat?</p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col">
              <InlineChat
                onApplyEstimate={applyEstimate}
                dark
                storageKey={chatStorageKey}
                logDate={logDate}
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

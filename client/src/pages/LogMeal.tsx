import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Send, Bot, User as UserIcon, ArrowRight, Activity,
  ArrowLeft, Camera, X, ChevronDown, Check,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MEAL_TYPES, type Meal } from "@shared/schema";
import { mealsForDate, todayStr } from "@/lib/calorieflow";

// ── Types ────────────────────────────────────────────────────────────────────

type NutritionEstimate = {
  name: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  mealType?: string;
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
  estimates?: NutritionEstimate[];
  activityEstimate?: ActivityEstimate;
  confirmed?: boolean;
};

type HistoryItem = {
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string;
};

type ChatResponse = {
  reply: string;
  estimate?: NutritionEstimate;
  estimates?: NutritionEstimate[];
  activityEstimate?: ActivityEstimate;
};

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;
let msgId = 0;
const nextId = () => ++msgId;

function getDefaultMealType(): string {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h < 18) return "snack";
  return "dinner";
}

// ── Inline Chat Component ────────────────────────────────────────────────────

function InlineChat({
  onLogMeal,
  storageKey,
  logDate,
  calorieGoal,
  caloriesLogged,
}: {
  onLogMeal: (estimate: NutritionEstimate, mealType: string) => Promise<void>;
  storageKey: string;
  logDate: string;
  calorieGoal: number;
  caloriesLogged: number;
}) {
  const { toast } = useToast();
  const remaining = Math.max(0, calorieGoal - caloriesLogged);

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
  const [loggingId, setLoggingId] = useState<number | null>(null);
  const [mealTypeOverride, setMealTypeOverride] = useState<Record<number, string>>({});
  const [showMealTypeFor, setShowMealTypeFor] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: aiStatus } = useQuery<{ hasApiKey: boolean }>({ queryKey: ["/api/ai/status"] });
  const hasApiKey = aiStatus?.hasApiKey ?? true;

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(messages)); } catch {}
  }, [messages, storageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-open ideas mode if URL has ?mode=ideas
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "ideas" && messages.length === 0) {
      const prompt = remaining > 0
        ? `Generate a full day menu for my remaining ${remaining} kcal today`
        : "Generate meal ideas for today";
      setInput(prompt);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, []);

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
    },
  });

  const chat = useMutation({
    mutationFn: async ({ history, userText, photo }: { history: HistoryItem[]; userText: string; photo: File | null }) => {
      const fd = new FormData();
      fd.append("messages", JSON.stringify(history));
      fd.append("message", userText);
      fd.append("context", JSON.stringify({ calorieGoal, caloriesLogged, remainingCalories: remaining, logDate }));
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
        {
          id: nextId(), role: "assistant", text: data.reply,
          estimate: data.estimate,
          estimates: data.estimates,
          activityEstimate: data.activityEstimate,
        },
      ]);
      if (data.activityEstimate) {
        logActivity.mutate(data.activityEstimate);
        toast({ title: "Activity logged" });
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

  async function handleLogMeal(msgId: number, estimate: NutritionEstimate, mealType: string) {
    setLoggingId(msgId);
    try {
      await onLogMeal(estimate, mealType);
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, confirmed: true } : m)
      );
      setMessages((prev) => [...prev, {
        id: nextId(), role: "assistant",
        text: `Added to log — ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}: ${estimate.name} (${estimate.calories} kcal)`,
        confirmed: true,
      }]);
    } catch {
      toast({ title: "Failed to log meal", variant: "destructive" });
    } finally {
      setLoggingId(null);
    }
  }

  const canSend = (input.trim().length > 0 || pendingPhoto !== null) && !chat.isPending;

  const suggestions = [
    ...(remaining > 0 ? [`Generate a full day menu for ${remaining} remaining kcal`] : []),
    "Suggest a breakfast recipe",
    "Suggest a lunch recipe",
    "Suggest a dinner recipe",
    "I had oatmeal with banana for breakfast",
    "Chicken breast with rice and broccoli",
    "Cardio 25 minutes",
  ];

  if (!hasApiKey) {
    return (
      <div className="p-4 text-center border border-[#F2EDE7]/15">
        <div className="text-xs uppercase tracking-widest text-[#F2EDE7]/50 mb-2">AI Not Configured</div>
        <p className="text-sm text-[#F2EDE7]/60">An OpenAI API key is required for AI chat.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full text-[#F2EDE7]">

      {/* Empty state / suggestions */}
      {messages.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs mb-3 leading-relaxed text-[#F2EDE7]/60">
            Tell me what you ate, describe an activity, or ask for meal ideas and recipes.
          </p>
          <div className="text-[9px] uppercase tracking-widest text-[#F2EDE7]/40 mb-1">Quick actions</div>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setInput(s); textareaRef.current?.focus(); }}
              className="text-left border border-[#F2EDE7]/15 px-3 py-2.5 text-xs hover:border-[#F2EDE7]/40 hover:bg-[#F2EDE7]/5 transition-colors text-[#F2EDE7]/80"
              data-testid={`button-suggestion-${s.slice(0, 20).replace(/\s/g, "-")}`}
            >
              {s}
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
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[9px] mt-0.5 ${
                msg.role === "user"
                  ? "border-[#F2EDE7] bg-[#F2EDE7] text-[#1C1714]"
                  : "border-[#F2EDE7]/30 bg-transparent"
              }`}>
                {msg.role === "user"
                  ? <UserIcon className="h-2.5 w-2.5" />
                  : <Bot className="h-2.5 w-2.5 opacity-70 text-[#F2EDE7]" />}
              </div>

              <div className={`flex max-w-[85%] flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.imageDataUrl && (
                  <img
                    src={msg.imageDataUrl}
                    alt="Attached"
                    className="max-h-36 object-cover border border-[#F2EDE7]/20"
                    data-testid={`chat-photo-${msg.id}`}
                  />
                )}
                {msg.text && (
                  <div className={`px-3 py-2 text-xs leading-relaxed border ${
                    msg.role === "user"
                      ? "bg-[#F2EDE7] text-[#1C1714] border-transparent"
                      : msg.confirmed
                        ? "bg-[#F2EDE7]/8 border-[#F2EDE7]/20 text-[#F2EDE7]/70 italic"
                        : "bg-[#F2EDE7]/8 border-[#F2EDE7]/15 text-[#F2EDE7]"
                  }`}>
                    {msg.confirmed && msg.role === "assistant" && <Check className="h-3 w-3 inline mr-1.5 opacity-60" />}
                    {msg.text}
                  </div>
                )}

                {/* Single meal estimate card */}
                {msg.estimate && !msg.confirmed && (
                  <EstimateCard
                    msgId={msg.id}
                    estimate={msg.estimate}
                    defaultMealType={msg.estimate.mealType || getDefaultMealType()}
                    isLogging={loggingId === msg.id}
                    showMealTypeOpen={showMealTypeFor === msg.id}
                    onToggleMealType={() => setShowMealTypeFor((p) => p === msg.id ? null : msg.id)}
                    mealTypeOverride={mealTypeOverride[msg.id]}
                    onMealTypeChange={(t) => { setMealTypeOverride((p) => ({ ...p, [msg.id]: t })); setShowMealTypeFor(null); }}
                    onLog={(mealType) => handleLogMeal(msg.id, msg.estimate!, mealType)}
                  />
                )}

                {/* Multiple recipe estimates */}
                {msg.estimates && msg.estimates.length > 0 && !msg.confirmed && (
                  <div className="flex flex-col gap-2 w-full">
                    {msg.estimates.map((est, i) => {
                      const cardId = msg.id * 100 + i;
                      return (
                        <EstimateCard
                          key={i}
                          msgId={cardId}
                          estimate={est}
                          defaultMealType={est.mealType || getDefaultMealType()}
                          isLogging={loggingId === cardId}
                          showMealTypeOpen={showMealTypeFor === cardId}
                          onToggleMealType={() => setShowMealTypeFor((p) => p === cardId ? null : cardId)}
                          mealTypeOverride={mealTypeOverride[cardId]}
                          onMealTypeChange={(t) => { setMealTypeOverride((p) => ({ ...p, [cardId]: t })); setShowMealTypeFor(null); }}
                          onLog={(mealType) => handleLogMeal(cardId, est, mealType)}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Activity card */}
                {msg.activityEstimate && (
                  <div
                    data-testid={`chat-activity-estimate-${msg.id}`}
                    className="w-full border border-[#F2EDE7]/20 p-3"
                  >
                    <div className="text-[9px] uppercase tracking-widest mb-2 pb-1.5 border-b border-[#F2EDE7]/15 flex items-center gap-1.5 opacity-50">
                      <Activity className="h-3 w-3" /> Activity Logged
                    </div>
                    <div className="text-xs mb-2 text-[#F2EDE7]/85">{msg.activityEstimate.name}</div>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      {[
                        { label: "Type", value: msg.activityEstimate.activityType },
                        { label: "Duration", value: `${msg.activityEstimate.durationMinutes}min` },
                        { label: "Burned", value: `${msg.activityEstimate.caloriesBurned} kcal` },
                      ].map(({ label, value }) => (
                        <div key={label} className="border border-[#F2EDE7]/10 py-1.5">
                          <div className="text-[8px] uppercase tracking-widest opacity-50">{label}</div>
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
              <div className="flex h-5 w-5 shrink-0 items-center justify-center border border-[#F2EDE7]/30 mt-0.5">
                <Bot className="h-2.5 w-2.5 opacity-50 text-[#F2EDE7]" />
              </div>
              <div className="border border-[#F2EDE7]/15 px-3 py-2 flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-bounce [animation-delay:0ms] bg-[#F2EDE7] opacity-40" />
                <span className="h-1.5 w-1.5 animate-bounce [animation-delay:150ms] bg-[#F2EDE7] opacity-40" />
                <span className="h-1.5 w-1.5 animate-bounce [animation-delay:300ms] bg-[#F2EDE7] opacity-40" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[#F2EDE7]/10 pt-4 mt-auto shrink-0">
        {pendingPhoto && (
          <div className="relative mb-2 w-16">
            <img
              src={pendingPhoto.dataUrl}
              alt="To attach"
              data-testid="chat-pending-photo"
              className="h-12 w-16 object-cover border border-[#F2EDE7]/20"
            />
            <button
              type="button"
              onClick={() => { setPendingPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              data-testid="button-clear-pending-photo"
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center bg-[#F2EDE7] text-[#1C1714]"
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
            placeholder={messages.length === 0 ? "Describe what you ate, or ask for meal ideas…" : "Ask a follow-up…"}
            className="flex-1 resize-none border border-[#F2EDE7]/20 bg-[#F2EDE7]/5 text-[#F2EDE7] px-3 py-2 text-xs font-['Space_Mono'] placeholder:opacity-40 focus:outline-none focus:border-[#F2EDE7]/50"
          />
          <div className="flex shrink-0 flex-col gap-1">
            <label
              data-testid="button-chat-attach-photo"
              className="flex h-8 w-8 cursor-pointer items-center justify-center border border-[#F2EDE7]/20 hover:border-[#F2EDE7]/50 hover:bg-[#F2EDE7]/5 transition-colors"
              title="Attach photo"
            >
              <Camera className="h-3.5 w-3.5 text-[#F2EDE7] opacity-60" />
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
              className="flex h-8 w-8 items-center justify-center border-2 border-[#F2EDE7] bg-[#F2EDE7] text-[#1C1714] hover:bg-[#F2EDE7]/90 transition-colors disabled:opacity-30"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[9px] uppercase tracking-widest text-[#F2EDE7]/25">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// ── Estimate Card ────────────────────────────────────────────────────────────

function EstimateCard({
  msgId,
  estimate,
  defaultMealType,
  isLogging,
  showMealTypeOpen,
  onToggleMealType,
  mealTypeOverride,
  onMealTypeChange,
  onLog,
}: {
  msgId: number;
  estimate: NutritionEstimate;
  defaultMealType: string;
  isLogging: boolean;
  showMealTypeOpen: boolean;
  onToggleMealType: () => void;
  mealTypeOverride?: string;
  onMealTypeChange: (t: string) => void;
  onLog: (mealType: string) => void;
}) {
  const mealType = mealTypeOverride || defaultMealType;

  return (
    <div
      data-testid={`chat-estimate-${msgId}`}
      className="w-full border border-[#F2EDE7]/25 p-3"
    >
      <div className="text-[9px] uppercase tracking-widest mb-2 pb-1.5 border-b border-[#F2EDE7]/15 opacity-50">
        Nutrition Estimate
      </div>
      <div className="text-xs mb-2 text-[#F2EDE7]/85">{estimate.name}</div>
      <div className="grid grid-cols-4 gap-1.5 text-center mb-3">
        {[
          { label: "Kcal", value: estimate.calories },
          { label: "PRO", value: `${estimate.proteins}g` },
          { label: "CRB", value: `${estimate.carbs}g` },
          { label: "FAT", value: `${estimate.fats}g` },
        ].map(({ label, value }) => (
          <div key={label} className="border border-[#F2EDE7]/10 py-1.5">
            <div className="text-[8px] uppercase tracking-widest opacity-50">{label}</div>
            <div className="text-xs tabular-nums mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      {/* Meal type selector */}
      <div className="relative mb-2">
        <button
          type="button"
          data-testid={`button-meal-type-picker-${msgId}`}
          onClick={onToggleMealType}
          className="w-full flex items-center justify-between border border-[#F2EDE7]/20 px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#F2EDE7]/70 hover:border-[#F2EDE7]/40 transition-colors"
        >
          <span>{mealType}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
        {showMealTypeOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#1C1714] border border-[#F2EDE7]/20 z-10">
            {MEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                data-testid={`option-meal-type-${t}-${msgId}`}
                onClick={() => onMealTypeChange(t)}
                className={`w-full text-left px-3 py-2 text-[10px] uppercase tracking-widest transition-colors ${
                  t === mealType
                    ? "bg-[#F2EDE7]/10 text-[#F2EDE7]"
                    : "text-[#F2EDE7]/60 hover:bg-[#F2EDE7]/5 hover:text-[#F2EDE7]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        data-testid={`button-use-estimate-${msgId}`}
        onClick={() => onLog(mealType)}
        disabled={isLogging}
        className="w-full flex items-center justify-center gap-1.5 border border-[#F2EDE7]/40 text-[#F2EDE7] py-2 text-[10px] uppercase tracking-widest hover:bg-[#F2EDE7] hover:text-[#1C1714] transition-colors disabled:opacity-40"
      >
        {isLogging ? "Saving…" : <><ArrowRight className="h-3 w-3" /> Log this meal</>}
      </button>
    </div>
  );
}

// ── Main LogMeal Page ────────────────────────────────────────────────────────

export default function LogMeal() {
  const logDate = (() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayStr();
  })();

  const chatStorageKey = `calorieflow-chat-${logDate}`;

  const { data: meals = [] } = useQuery<Meal[]>({ queryKey: ["/api/meals"] });
  const { data: settingsData } = useQuery<{ dailyCalorieGoal: number }>({ queryKey: ["/api/settings"] });

  const calorieGoal = settingsData?.dailyCalorieGoal || 2000;
  const dayMeals = mealsForDate(meals, logDate);
  const caloriesLogged = dayMeals.reduce((s, m) => s + m.calories, 0);
  const remaining = Math.max(0, calorieGoal - caloriesLogged);

  const isToday = logDate === todayStr();
  const dateLabel = new Date(logDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  const logMealDirect = useMutation({
    mutationFn: async ({ estimate, mealType }: { estimate: NutritionEstimate; mealType: string }) =>
      (await apiRequest("POST", "/api/meals", {
        date: logDate,
        mealType,
        name: estimate.name,
        calories: estimate.calories,
        proteins: estimate.proteins,
        carbs: estimate.carbs,
        fats: estimate.fats,
      })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
    },
  });

  async function onLogMeal(estimate: NutritionEstimate, mealType: string): Promise<void> {
    await logMealDirect.mutateAsync({ estimate, mealType });
  }

  return (
    <div className="min-h-screen bg-[#1C1714] flex flex-col font-['Space_Mono']">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#F2EDE7]/10 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button
              type="button"
              data-testid="button-back-to-dashboard"
              className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#F2EDE7]/50 hover:text-[#F2EDE7] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          </Link>
          <div className="h-4 w-px bg-[#F2EDE7]/15" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#F2EDE7]/50 leading-none mb-0.5">AI Nutrition Chat</p>
            <p className="text-base tracking-tighter text-[#F2EDE7] leading-none">
              {isToday ? "Today" : dateLabel}
            </p>
          </div>
        </div>

        {/* Day summary */}
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-[#F2EDE7]/40 leading-none mb-0.5">Logged</div>
          <div className="text-sm tabular-nums text-[#F2EDE7]">
            {caloriesLogged}
            <span className="opacity-40 text-xs ml-1">/ {calorieGoal}</span>
          </div>
          {remaining > 0 && (
            <div className="text-[10px] text-[#F2EDE7]/40 tabular-nums">{remaining} remaining</div>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col max-w-2xl w-full mx-auto">
        <InlineChat
          onLogMeal={onLogMeal}
          storageKey={chatStorageKey}
          logDate={logDate}
          calorieGoal={calorieGoal}
          caloriesLogged={caloriesLogged}
        />
      </div>
    </div>
  );
}

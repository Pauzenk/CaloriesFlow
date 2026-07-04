import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Camera, Send, X, Sparkles, Bot, User as UserIcon, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/hooks/use-toast";

type NutritionEstimate = {
  name: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  imageDataUrl?: string;
  estimate?: NutritionEstimate;
};

type HistoryItem = {
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string;
};

type ChatResponse = {
  reply: string;
  estimate?: NutritionEstimate;
};

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;
let msgId = 0;
const nextId = () => ++msgId;

export default function ChatPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: aiStatus } = useQuery<{ hasApiKey: boolean }>({ queryKey: ["/api/ai/status"] });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: data.reply, estimate: data.estimate }]);
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

  function useEstimate(estimate: NutritionEstimate) {
    const params = new URLSearchParams({
      name: estimate.name,
      calories: String(estimate.calories),
      proteins: String(estimate.proteins),
      carbs: String(estimate.carbs),
      fats: String(estimate.fats),
    });
    navigate(`/log?${params.toString()}`);
  }

  const canSend = (input.trim().length > 0 || pendingPhoto !== null) && !chat.isPending;
  const hasApiKey = aiStatus?.hasApiKey ?? true;

  return (
    <AppShell title="AI Chat">
      <div className="flex h-[calc(100vh-8rem)] flex-col font-['Space_Mono'] text-[#1C1714]">

        {/* ── Empty state ── */}
        {messages.length === 0 && hasApiKey && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12">
            <div className="border border-[#1C1714]/20 p-5 text-center max-w-sm">
              <div className="text-xs uppercase tracking-widest opacity-60 mb-3 pb-2 border-b border-dashed border-[#1C1714]/20">
                AI Nutrition Assistant
              </div>
              <p className="text-sm opacity-70 leading-relaxed">
                Describe what you ate, upload a photo, or both. AI will estimate calories and macros.
              </p>
              <p className="text-[10px] opacity-40 mt-3 italic">
                e.g. "I had half a plate of pasta carbonara"
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {[
                "I had oatmeal with banana for breakfast",
                "2 slices of sourdough with avocado",
                "Chicken breast with rice and broccoli",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}
                  className="text-left border border-[#1C1714]/20 px-4 py-2.5 text-xs hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── No API key state ── */}
        {!hasApiKey && (
          <div className="flex flex-1 items-center justify-center">
            <div className="border border-[#1C1714] p-6 max-w-sm text-center">
              <div className="text-xs uppercase tracking-widest opacity-60 mb-3">AI Not Configured</div>
              <p className="text-sm opacity-70">
                An OpenAI API key is required for AI chat. You can still log meals manually.
              </p>
            </div>
          </div>
        )}

        {/* ── Message thread ── */}
        {messages.length > 0 && (
          <div
            data-testid="chat-thread"
            className="flex-1 overflow-y-auto py-4 space-y-4"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                data-testid={`chat-message-${msg.id}`}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center border text-[10px] uppercase tracking-widest mt-0.5 ${
                  msg.role === "user"
                    ? "border-[#1C1714] bg-[#1C1714] text-[#F2EDE7]"
                    : "border-[#1C1714]/30 bg-transparent text-[#1C1714]/60"
                }`}>
                  {msg.role === "user" ? <UserIcon className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </div>

                <div className={`flex max-w-[75%] flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  {/* Role label */}
                  <div className="text-[9px] uppercase tracking-widest opacity-40">
                    {msg.role === "user" ? "You" : "AI"}
                  </div>

                  {/* Photo */}
                  {msg.imageDataUrl && (
                    <img
                      src={msg.imageDataUrl}
                      alt="Attached"
                      className="max-h-48 border border-[#1C1714]/20 object-cover"
                      data-testid={`chat-photo-${msg.id}`}
                    />
                  )}

                  {/* Text bubble */}
                  {msg.text && (
                    <div className={`px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#1C1714] text-[#F2EDE7]"
                        : "border border-[#1C1714]/20 bg-transparent"
                    }`}>
                      {msg.text}
                    </div>
                  )}

                  {/* Estimate card */}
                  {msg.estimate && (
                    <div
                      data-testid={`chat-estimate-${msg.id}`}
                      className="w-full border border-[#1C1714] p-4"
                    >
                      <div className="text-[9px] uppercase tracking-widest opacity-60 mb-2 pb-2 border-b border-dashed border-[#1C1714]/20">
                        Nutrition Estimate
                      </div>
                      <div className="text-sm mb-3">{msg.estimate.name}</div>
                      <div className="grid grid-cols-4 gap-2 text-center mb-4">
                        {[
                          { label: "Kcal", value: msg.estimate.calories },
                          { label: "PRO", value: `${msg.estimate.proteins}g` },
                          { label: "CARB", value: `${msg.estimate.carbs}g` },
                          { label: "FAT", value: `${msg.estimate.fats}g` },
                        ].map(({ label, value }) => (
                          <div key={label} className="border border-[#1C1714]/10 py-2">
                            <div className="text-[9px] uppercase tracking-widest opacity-50">{label}</div>
                            <div className="text-sm tabular-nums mt-0.5">{value}</div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        data-testid={`button-use-estimate-${msg.id}`}
                        onClick={() => useEstimate(msg.estimate!)}
                        className="w-full flex items-center justify-center gap-2 border border-[#1C1714] py-2 text-xs uppercase tracking-widest hover:bg-[#1C1714] hover:text-[#F2EDE7] transition-colors"
                      >
                        Log this meal <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {chat.isPending && (
              <div data-testid="chat-typing" className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center border border-[#1C1714]/30 mt-0.5">
                  <Bot className="h-3 w-3 opacity-50" />
                </div>
                <div className="border border-[#1C1714]/20 px-4 py-3 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce bg-[#1C1714] opacity-40 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce bg-[#1C1714] opacity-40 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce bg-[#1C1714] opacity-40 [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* ── Input area ── */}
        {hasApiKey && (
          <div className="border-t-2 border-[#1C1714] pt-4 mt-auto">

            {/* Pending photo preview */}
            {pendingPhoto && (
              <div className="relative mb-3 w-20">
                <img
                  src={pendingPhoto.dataUrl}
                  alt="To attach"
                  data-testid="chat-pending-photo"
                  className="h-16 w-20 border border-[#1C1714]/20 object-cover"
                />
                <button
                  type="button"
                  onClick={() => { setPendingPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  data-testid="button-clear-pending-photo"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center bg-[#1C1714] text-[#F2EDE7] hover:opacity-80"
                >
                  <X className="h-3 w-3" />
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
                placeholder={messages.length === 0 ? "Describe what you ate…" : "Ask a follow-up…"}
                className="flex-1 resize-none border border-[#1C1714]/30 bg-transparent px-3 py-2.5 text-sm font-['Space_Mono'] text-[#1C1714] placeholder:opacity-40 focus:border-[#1C1714] focus:outline-none"
              />
              <div className="flex shrink-0 flex-col gap-1.5">
                <label
                  data-testid="button-chat-attach-photo"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center border border-[#1C1714]/30 hover:border-[#1C1714] hover:bg-[#1C1714]/5 transition-colors"
                  title="Attach photo"
                >
                  <Camera className="h-4 w-4 opacity-60" />
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
                  className="flex h-9 w-9 items-center justify-center border-2 border-[#1C1714] bg-[#1C1714] text-[#F2EDE7] hover:bg-[#1C1714]/90 transition-colors disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>

            <p className="mt-2 text-[9px] uppercase tracking-widest opacity-30">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

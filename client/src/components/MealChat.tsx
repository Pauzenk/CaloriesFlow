import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, Send, X, Sparkles, Bot, User as UserIcon, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export type NutritionEstimate = {
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
function nextId() {
  return ++msgId;
}

export type MealChatProps = {
  onUseEstimate: (estimate: NutritionEstimate) => void;
  hasApiKey: boolean;
};

export function MealChat({ onUseEstimate, hasApiKey }: MealChatProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const chat = useMutation({
    mutationFn: async ({
      history,
      userText,
      photo,
    }: {
      history: HistoryItem[];
      userText: string;
      photo: File | null;
    }) => {
      const fd = new FormData();
      fd.append("messages", JSON.stringify(history));
      fd.append("message", userText);
      if (photo) fd.append("photo", photo);

      const res = await fetch("/api/meals/chat", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
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
          id: nextId(),
          role: "assistant",
          text: data.reply,
          estimate: data.estimate,
        },
      ]);
    },
    onError: (err: unknown) => {
      toast({
        title: "AI chat failed",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  function buildHistory(msgs: ChatMessage[]): HistoryItem[] {
    return msgs.map((m) => ({
      role: m.role,
      content: m.text || (m.imageDataUrl ? "" : "…"),
      ...(m.imageDataUrl ? { imageDataUrl: m.imageDataUrl } : {}),
    }));
  }

  function send() {
    const text = input.trim();
    if (!text && !pendingPhoto) return;
    if (chat.isPending) return;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text,
      imageDataUrl: pendingPhoto?.dataUrl,
    };

    const history = buildHistory(messages);
    const photoFile = pendingPhoto?.file ?? null;

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    chat.mutate({ history, userText: text, photo: photoFile });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      toast({ title: "Invalid file type", description: "JPEG, PNG, WebP, or GIF only.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Image too large", description: "Max 10 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPendingPhoto({ file, dataUrl });
    };
    reader.readAsDataURL(file);
  }

  function clearPendingPhoto() {
    setPendingPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!hasApiKey) {
    return (
      <div
        data-testid="chat-no-api-key"
        className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800"
      >
        <Bot className="mt-0.5 h-4 w-4 shrink-0" />
        <p>AI chat is not configured. You can still log meals manually using the form below.</p>
      </div>
    );
  }

  const canSend = (input.trim().length > 0 || pendingPhoto !== null) && !chat.isPending;

  return (
    <div data-testid="meal-chat" className="flex flex-col gap-0">
      {messages.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#c2c8c14c] bg-[#f4f3ef] px-5 py-7 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#476550]/10">
            <Sparkles className="h-6 w-6 text-[#476550]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1a1c1a]">Describe what you ate</p>
            <p className="mt-1 text-xs text-[#424843]">
              Upload a photo, type what you ate, or both — AI will estimate the calories and macros.
              <br />
              <span className="italic">e.g. "I ate half of this plate" with a photo</span>
            </p>
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div
          data-testid="chat-thread"
          className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-2xl border border-[#c2c8c14c] bg-[#f4f3ef] p-3"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              data-testid={`chat-message-${msg.id}`}
              className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${
                  msg.role === "user" ? "bg-[#476550]" : "bg-[#424843]"
                }`}
              >
                {msg.role === "user" ? (
                  <UserIcon className="h-3.5 w-3.5" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
              </div>
              <div className={`flex max-w-[80%] flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.imageDataUrl && (
                  <img
                    src={msg.imageDataUrl}
                    alt="Attached photo"
                    className="max-h-40 rounded-xl object-cover"
                    data-testid={`chat-photo-${msg.id}`}
                  />
                )}
                {msg.text && (
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#476550] text-white"
                        : "bg-white text-[#1a1c1a] shadow-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                )}
                {msg.estimate && (
                  <div
                    data-testid={`chat-estimate-${msg.id}`}
                    className="w-full rounded-2xl border border-[#476550]/20 bg-white p-3 shadow-sm"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#476550]">
                      Nutrition estimate
                    </p>
                    <p className="mt-1 font-medium text-[#1a1c1a]">{msg.estimate.name}</p>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                      {(
                        [
                          { label: "Calories", value: `${msg.estimate.calories}`, unit: "kcal" },
                          { label: "Protein", value: `${msg.estimate.proteins}`, unit: "g" },
                          { label: "Carbs", value: `${msg.estimate.carbs}`, unit: "g" },
                          { label: "Fats", value: `${msg.estimate.fats}`, unit: "g" },
                        ] as const
                      ).map(({ label, value, unit }) => (
                        <div key={label} className="rounded-xl bg-[#f4f3ef] px-2 py-1.5">
                          <p className="text-[10px] uppercase tracking-wider text-[#424843]">{label}</p>
                          <p className="text-sm font-bold text-[#1a1c1a]">
                            {value}
                            <span className="text-[10px] font-normal text-[#424843]"> {unit}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      data-testid={`button-use-estimate-${msg.id}`}
                      onClick={() => onUseEstimate(msg.estimate!)}
                      className="mt-3 w-full gap-1.5 bg-[#476550] hover:bg-[#3f5b47] text-xs"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Use this estimate
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {chat.isPending && (
            <div data-testid="chat-typing" className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#424843] text-white">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#424843] [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#424843] [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#424843] [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {pendingPhoto && (
        <div className="relative mt-3 w-24">
          <img
            src={pendingPhoto.dataUrl}
            alt="Photo to attach"
            data-testid="chat-pending-photo"
            className="h-20 w-24 rounded-xl object-cover border border-[#c2c8c14c]"
          />
          <button
            type="button"
            onClick={clearPendingPhoto}
            data-testid="button-clear-pending-photo"
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            aria-label="Remove photo"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <Textarea
            placeholder={
              messages.length === 0
                ? 'e.g. "I ate half of this pasta" or just upload a photo…'
                : "Reply or ask a follow-up…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={chat.isPending}
            data-testid="input-chat-message"
            className="resize-none text-sm"
          />
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <label
            data-testid="button-chat-attach-photo"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-[#c2c8c14c] bg-[#f4f3ef] text-[#476550] hover:bg-[#edf0eb] transition-colors"
            title="Attach photo"
          >
            <Camera className="h-4 w-4" />
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
          <Button
            type="button"
            size="icon"
            onClick={send}
            disabled={!canSend}
            data-testid="button-chat-send"
            className="h-9 w-9 bg-[#476550] hover:bg-[#3f5b47] disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

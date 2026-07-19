import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Mail, Check, Leaf } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Step = "request" | "verify" | "reset";

const INPUT_CLS =
  "border border-[#D4CFC8] bg-[#FAF8F6] h-[38px] w-full px-2.5 text-[13px] font-['Space_Mono'] text-[#1C1714] focus:outline-none focus:border-[#3c3a40]";

const BTN_PRIMARY =
  "h-11 w-full bg-[#3c3a40] text-white text-[13px] font-bold transition-colors hover:bg-[#2d2b30] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed font-['Space_Mono']";

const LABEL_CLS =
  "block text-[11px] font-bold uppercase tracking-wider text-[#6B6560] mb-1.5 font-['Space_Mono']";

export default function ForgotPasswordPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [codeError, setCodeError] = useState("");
  const [verifiedCode, setVerifiedCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [resendSeconds, setResendSeconds] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step === "verify") {
      setResendSeconds(60);
      timerRef.current = setInterval(() => {
        setResendSeconds((s) => {
          if (s <= 1) { clearInterval(timerRef.current!); return 0; }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  const requestMutation = useMutation({
    mutationFn: async (e: string) => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { email: e });
      return res.json();
    },
    onSuccess: () => setStep("verify"),
    onError: () => toast({ title: "Something went wrong", variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/auth/verify-code", { email, code });
      return res.json();
    },
    onSuccess: (_, code) => { setVerifiedCode(code); setCodeError(""); setStep("reset"); },
    onError: () => setCodeError("Invalid or expired code"),
  });

  const resetMutation = useMutation({
    mutationFn: async ({ pw }: { pw: string }) => {
      const res = await apiRequest("POST", "/api/auth/reset-password", {
        email, code: verifiedCode, password: pw,
      });
      return res.json();
    },
    onSuccess: async (user) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      navigate("/");
    },
    onError: (err: unknown) =>
      toast({ title: err instanceof Error ? err.message : "Reset failed", variant: "destructive" }),
  });

  function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/\S+@\S+\.\S+/.test(trimmed)) {
      setEmailError("Enter a valid email");
      return;
    }
    setEmailError("");
    requestMutation.mutate(trimmed);
  }

  function handleDigitChange(index: number, value: string) {
    const ch = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = ch;
    setDigits(next);
    setCodeError("");
    if (ch && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array(6).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    inputRefs.current[Math.min(text.length, 5)]?.focus();
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length < 6) { setCodeError("Enter all 6 digits"); return; }
    verifyMutation.mutate(code);
  }

  function handleResend() {
    if (resendSeconds > 0) return;
    requestMutation.mutate(email.trim());
    setDigits(Array(6).fill(""));
    setCodeError("");
    setResendSeconds(60);
    timerRef.current = setInterval(() => {
      setResendSeconds((s) => {
        if (s <= 1) { clearInterval(timerRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setPwError("Minimum 6 characters"); return; }
    if (password !== confirmPassword) { setPwError("Passwords don't match"); return; }
    setPwError("");
    resetMutation.mutate({ pw: password });
  }

  const codeComplete = digits.every((d) => d !== "");

  return (
    <main className="min-h-screen bg-[#F2EDE7] flex items-center justify-center px-6 py-10 font-['Space_Mono']">
      <div className="w-full max-w-sm border border-[#D4CFC8] bg-white p-6">

        {/* ── Step 2a: Request ── */}
        {step === "request" && (
          <>
            <button
              type="button"
              onClick={() => navigate("/login")}
              data-testid="link-back-to-login"
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-[2px] text-[#6B6560] mb-5 hover:text-[#1C1714] transition-colors"
            >
              <ArrowLeft size={13} /> Back to log in
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-9 w-9 items-center justify-center bg-[#3c3a40] text-white">
                <Leaf size={16} />
              </div>
              <span className="text-[20px] font-bold tracking-tight text-[#1C1714]">CalorieFlow</span>
            </div>

            <h2 className="text-[22px] font-bold text-[#1C1714]">Forgot password?</h2>
            <p className="mt-1 text-[13px] text-[#6B6560] leading-relaxed">
              Enter your account email and we'll send you a verification code.
            </p>

            <form onSubmit={handleRequest} className="mt-6 flex flex-col gap-4">
              <div>
                <label className={LABEL_CLS} htmlFor="fp-email">Email</label>
                <input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  data-testid="input-fp-email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  className={INPUT_CLS + (emailError ? " border-[#9B4A2E]" : "")}
                />
                {emailError && (
                  <p className="mt-1 text-[12px] text-[#9B4A2E]" data-testid="text-fp-email-error">{emailError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={requestMutation.isPending}
                data-testid="button-fp-send"
                className={BTN_PRIMARY}
              >
                {requestMutation.isPending ? "Sending…" : "Send code"}
              </button>
              <p className="text-center text-[11px] text-[#6B6560]">
                Remembered it?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="underline text-[#3c3a40] font-bold hover:text-[#1C1714] transition-colors"
                >
                  Log in
                </button>
              </p>
            </form>
          </>
        )}

        {/* ── Step 2b: Verify ── */}
        {step === "verify" && (
          <>
            <button
              type="button"
              onClick={() => setStep("request")}
              data-testid="link-fp-back"
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-[2px] text-[#6B6560] mb-5 hover:text-[#1C1714] transition-colors"
            >
              <ArrowLeft size={13} /> Back
            </button>

            <div className="flex h-11 w-11 items-center justify-center border border-[#1C1714]/20 mb-5">
              <Mail size={18} className="opacity-60" />
            </div>

            <h2 className="text-[22px] font-bold text-[#1C1714]">Check your email</h2>
            <p className="mt-1 text-[13px] text-[#6B6560] leading-relaxed">
              We sent a 6-digit code to{" "}
              <span className="text-[#1C1714] font-bold">{email}</span>. It expires in 10 minutes.
            </p>

            <form onSubmit={handleVerify} className="mt-6 flex flex-col gap-4">
              <div>
                <label className={LABEL_CLS}>Verification code</label>
                <div className="flex gap-1.5" onPaste={handlePaste} data-testid="input-fp-code">
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      value={d}
                      data-testid={`input-fp-digit-${i}`}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(i, e)}
                      className={[
                        "min-w-0 w-0 flex-1 h-12 bg-[#FAF8F6] text-center text-[20px] font-bold text-[#1C1714] focus:outline-none font-['Space_Mono'] transition-colors",
                        codeError
                          ? "border border-[#9B4A2E]"
                          : d
                            ? "border border-[#1C1714]"
                            : document.activeElement === inputRefs.current[i]
                              ? "border-2 border-[#3c3a40]"
                              : "border border-[#D4CFC8]",
                      ].join(" ")}
                    />
                  ))}
                </div>
                {codeError && (
                  <p className="mt-1.5 text-[12px] text-[#9B4A2E]" data-testid="text-fp-code-error">{codeError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={!codeComplete || verifyMutation.isPending}
                data-testid="button-fp-verify"
                className={BTN_PRIMARY}
              >
                {verifyMutation.isPending ? "Verifying…" : "Verify code"}
              </button>
              <p className="text-center text-[11px] text-[#6B6560]">
                Didn't get it?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendSeconds > 0}
                  data-testid="button-fp-resend"
                  className="underline text-[#3c3a40] font-bold hover:text-[#1C1714] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Resend
                </button>
                {resendSeconds > 0 && (
                  <span className="opacity-60 ml-1">
                    ({Math.floor(resendSeconds / 60)}:{String(resendSeconds % 60).padStart(2, "0")})
                  </span>
                )}
              </p>
            </form>
          </>
        )}

        {/* ── Step 2c: Reset ── */}
        {step === "reset" && (
          <>
            <div className="flex items-center gap-2 border border-[#1C1714]/20 bg-[#F5F1EB] px-3 py-2.5 text-[11px] text-[#1C1714] mb-5">
              <Check size={13} />
              Email verified — {email}
            </div>

            <h2 className="text-[22px] font-bold text-[#1C1714]">Set a new password</h2>
            <p className="mt-1 text-[13px] text-[#6B6560] leading-relaxed">Minimum 6 characters.</p>

            <form onSubmit={handleReset} className="mt-6 flex flex-col gap-4">
              <div>
                <label className={LABEL_CLS} htmlFor="fp-new-password">New password</label>
                <input
                  id="fp-new-password"
                  type="password"
                  autoComplete="new-password"
                  data-testid="input-fp-new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPwError(""); }}
                  className={INPUT_CLS + (pwError ? " border-[#9B4A2E]" : "")}
                />
              </div>
              <div>
                <label className={LABEL_CLS} htmlFor="fp-confirm-password">Confirm password</label>
                <input
                  id="fp-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  data-testid="input-fp-confirm-password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPwError(""); }}
                  className={INPUT_CLS + (pwError ? " border-[#9B4A2E]" : "")}
                />
                {pwError && (
                  <p className="mt-1 text-[12px] text-[#9B4A2E]" data-testid="text-fp-pw-error">{pwError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={resetMutation.isPending}
                data-testid="button-fp-reset"
                className={BTN_PRIMARY}
              >
                {resetMutation.isPending ? "Saving…" : "Reset password"}
              </button>
              <p className="text-center text-[11px] text-[#6B6560]">You'll be signed in automatically.</p>
            </form>
          </>
        )}

      </div>
    </main>
  );
}

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Leaf } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Required"),
});

const registerSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Min 6 characters"),
});

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const match = err.message.match(/^\d+:\s*([\s\S]+)$/);
    if (match) {
      try {
        const json = JSON.parse(match[1]);
        return json.message || match[1];
      } catch {
        return match[1];
      }
    }
    return err.message;
  }
  return "Something went wrong";
}

function isServiceUnavailable(err: unknown): boolean {
  if (err instanceof Error) return err.message.startsWith("503:");
  return false;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, login, register } = useAuth();

  const { data: providers } = useQuery<{ google: boolean }>({
    queryKey: ["/api/auth/providers"],
  });
  const googleEnabled = providers?.google ?? false;

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  // Show error from Google OAuth redirect failure
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "google_failed") {
      toast({ title: "Google sign-in failed", description: "Please try again or use email/password.", variant: "destructive" });
      window.history.replaceState({}, "", "/login");
    }
  }, [toast]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const [dbDown, setDbDown] = useState(false);

  const onLogin = loginForm.handleSubmit((values) => {
    setDbDown(false);
    login.mutate(values, {
      onError: (err: unknown) => {
        if (isServiceUnavailable(err)) {
          setDbDown(true);
        } else {
          toast({ title: "Login failed", description: describeError(err), variant: "destructive" });
        }
      },
    });
  });

  const onRegister = registerForm.handleSubmit((values) => {
    setDbDown(false);
    register.mutate(values, {
      onError: (err: unknown) => {
        if (isServiceUnavailable(err)) {
          setDbDown(true);
        } else {
          const msg = describeError(err);
          if (msg.toLowerCase().includes("email") || msg.toLowerCase().includes("registered")) {
            registerForm.setError("email", { message: msg });
          } else {
            toast({ title: "Sign up failed", description: msg, variant: "destructive" });
          }
        }
      },
    });
  });

  return (
    <main className="min-h-screen bg-[#F2EDE7] md:grid md:grid-cols-2">
      {/* Left brand panel — full height on desktop */}
      <div className="hidden md:flex flex-col justify-center gap-4 bg-[#302e35] px-14 py-16 text-white min-h-screen">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-white/15" style={{ borderRadius: '50%' }}>
            <Leaf className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">CalorieFlow</span>
        </div>
        <h1 className="mt-10 text-4xl font-bold leading-tight">Mindful nutrition, every day.</h1>
        <p className="mt-2 text-base text-white/80">
          Track your daily calories, watch your weight trend, and stay consistent with your weight-loss journey.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-white/70">
          <li className="flex items-center gap-2">
            <span className="h-px w-4 bg-white/40" />
            Log breakfast, lunch, dinner &amp; snacks
          </li>
          <li className="flex items-center gap-2">
            <span className="h-px w-4 bg-white/40" />
            See macros and weekly progress at a glance
          </li>
          <li className="flex items-center gap-2">
            <span className="h-px w-4 bg-white/40" />
            Track weight loss week by week
          </li>
        </ul>
      </div>

      {/* Right auth panel — centered vertically */}
      <div className="flex items-center justify-center min-h-screen px-6 py-10">
        <div className="w-full max-w-sm border border-[#D4CFC8] bg-white p-6 md:p-10">
          {/* Mobile logo */}
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <div className="flex h-9 w-9 items-center justify-center bg-[#3c3a40] text-white" style={{ borderRadius: '50%' }}>
              <Leaf className="h-4 w-4" />
            </div>
            <span className="text-xl font-bold text-[#1C1714]">CalorieFlow</span>
          </div>

          <h2 className="text-2xl font-bold text-[#1C1714]">Welcome</h2>
          <p className="mt-1 text-sm text-[#6B6560]">Log in or create an account to continue.</p>

          {dbDown && (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="status-db-unavailable">
              <p className="font-semibold">Service temporarily unavailable</p>
              <p className="mt-0.5">The database is restarting. Please wait a moment and try again.</p>
            </div>
          )}

          {/* Google sign-in */}
          {googleEnabled && (
            <div className="mt-6">
              <a
                href="/api/auth/google"
                data-testid="button-google-signin"
                className="flex w-full items-center justify-center gap-3 border border-[#D4CFC8] bg-white px-4 py-2.5 text-sm font-medium text-[#1C1714] transition-colors hover:bg-[#F5F1EB]"
              >
                <GoogleIcon />
                Continue with Google
              </a>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#D4CFC8]" />
                <span className="text-xs text-[#6B6560] uppercase tracking-widest">or</span>
                <div className="h-px flex-1 bg-[#D4CFC8]" />
              </div>
            </div>
          )}

          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")} className={googleEnabled ? "mt-4" : "mt-6"}>
            <TabsList className="grid w-full grid-cols-2 border border-[#D4CFC8] bg-[#F5F1EB]">
              <TabsTrigger
                value="login"
                data-testid="tab-login"
                className="data-[state=active]:bg-white data-[state=active]:text-[#1C1714]"
              >
                Log in
              </TabsTrigger>
              <TabsTrigger
                value="register"
                data-testid="tab-register"
                className="data-[state=active]:bg-white data-[state=active]:text-[#1C1714]"
              >
                Sign up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <Form {...loginForm}>
                <form onSubmit={onLogin} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                          Email
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            autoComplete="email"
                            data-testid="input-login-email"
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#3c3a40]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                          Password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="current-password"
                            data-testid="input-login-password"
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#3c3a40]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={login.isPending}
                    className="h-11 w-full bg-[#3c3a40] text-sm font-bold text-white hover:bg-[#2d2b30]"
                    data-testid="button-submit-login"
                  >
                    {login.isPending ? "Logging in…" : "Log in"}
                  </Button>
                  <p className="text-center text-xs text-[#6B6560]">
                    No account?{" "}
                    <button
                      type="button"
                      data-testid="link-switch-to-signup"
                      onClick={() => setTab("register")}
                      className="underline text-[#3c3a40] font-semibold hover:text-[#1C1714]"
                    >
                      Sign up
                    </button>
                  </p>
                  <p className="text-center text-xs text-[#6B6560]">
                    <Link
                      href="/forgot-password"
                      data-testid="link-forgot-password"
                      className="underline text-[#3c3a40] font-semibold hover:text-[#1C1714]"
                    >
                      Forgot your password?
                    </Link>
                  </p>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="register" className="mt-6">
              <Form {...registerForm}>
                <form onSubmit={onRegister} className="space-y-4">
                  <FormField
                    control={registerForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                          Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            autoComplete="name"
                            data-testid="input-register-name"
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#3c3a40]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                          Email
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            autoComplete="email"
                            data-testid="input-register-email"
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#3c3a40]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#6B6560]">
                          Password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            data-testid="input-register-password"
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#3c3a40]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={register.isPending}
                    className="h-11 w-full bg-[#3c3a40] text-sm font-bold text-white hover:bg-[#2d2b30]"
                    data-testid="button-submit-register"
                  >
                    {register.isPending ? "Creating account…" : "Create account"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}

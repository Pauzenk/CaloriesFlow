import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Leaf } from "lucide-react";
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
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, login, register } = useAuth();

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onLogin = loginForm.handleSubmit((values) => {
    login.mutate(values, {
      onError: (err: unknown) =>
        toast({ title: "Login failed", description: describeError(err), variant: "destructive" }),
    });
  });

  const onRegister = registerForm.handleSubmit((values) => {
    register.mutate(values, {
      onError: (err: unknown) =>
        toast({ title: "Sign up failed", description: describeError(err), variant: "destructive" }),
    });
  });

  return (
    <main className="font-['Space_Mono'] min-h-screen bg-[#F0EEF8] px-4 py-8 text-[#1A1B2E]">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-0 md:grid-cols-2">

        {/* Left brand panel */}
        <div className="hidden flex-col bg-[#1A1B2E] p-10 text-[#F0EEF8] md:flex h-full">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-[#F0EEF8]/20">
              <Leaf className="h-4 w-4" />
            </div>
            <span className="text-sm uppercase tracking-widest opacity-70">CalorieFlow</span>
          </div>
          <div className="mt-auto">
            <p className="text-[10px] uppercase tracking-widest opacity-40 mb-4">About</p>
            <h1 className="text-4xl leading-tight tracking-tight">
              Mindful nutrition,<br />every day.
            </h1>
            <p className="mt-4 text-sm opacity-50 leading-relaxed">
              Track your daily calories, watch your weight trend, and stay consistent with your weight-loss journey.
            </p>
            <ul className="mt-8 space-y-3">
              {[
                "Log breakfast, lunch, dinner & snacks",
                "See macros and weekly progress at a glance",
                "Track weight loss week by week",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-xs opacity-40">
                  <span className="h-px w-4 bg-current shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right auth panel */}
        <div className="border border-[#1A1B2E] bg-[#F0EEF8]">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 border-b border-[#1A1B2E]/20 px-6 py-4 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center bg-[#6B5FC0] text-[#F0EEF8]">
              <Leaf className="h-4 w-4" />
            </div>
            <span className="text-sm uppercase tracking-widest opacity-70">CalorieFlow</span>
          </div>

          {/* Tab switcher */}
          <div className="flex border-b-2 border-[#1A1B2E]">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                type="button"
                data-testid={`tab-${t === "login" ? "login" : "register"}`}
                onClick={() => setTab(t)}
                className={`flex-1 py-4 text-xs uppercase tracking-widest transition-colors ${
                  tab === t
                    ? "bg-[#1A1B2E] text-[#F0EEF8]"
                    : "opacity-40 hover:opacity-70"
                }`}
              >
                {t === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          <div className="px-8 py-8">
            {tab === "login" ? (
              <Form {...loginForm}>
                <form onSubmit={onLogin} className="space-y-5">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            autoComplete="email"
                            data-testid="input-login-email"
                            className="border-[#1A1B2E]/30 bg-transparent focus-visible:ring-[#6B5FC0]"
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
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="current-password"
                            data-testid="input-login-password"
                            className="border-[#1A1B2E]/30 bg-transparent focus-visible:ring-[#6B5FC0]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <button
                    type="submit"
                    disabled={login.isPending}
                    data-testid="button-submit-login"
                    className="w-full border-2 border-[#6B5FC0] bg-[#6B5FC0] py-3 text-xs uppercase tracking-widest text-[#F0EEF8] hover:bg-[#5548A0] hover:border-[#5548A0] transition-colors disabled:opacity-50"
                  >
                    {login.isPending ? "Logging in…" : "Log in"}
                  </button>
                </form>
              </Form>
            ) : (
              <Form {...registerForm}>
                <form onSubmit={onRegister} className="space-y-5">
                  <FormField
                    control={registerForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">Name</FormLabel>
                        <FormControl>
                          <Input
                            autoComplete="name"
                            data-testid="input-register-name"
                            className="border-[#1A1B2E]/30 bg-transparent focus-visible:ring-[#6B5FC0]"
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
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            autoComplete="email"
                            data-testid="input-register-email"
                            className="border-[#1A1B2E]/30 bg-transparent focus-visible:ring-[#6B5FC0]"
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
                        <FormLabel className="text-[10px] uppercase tracking-widest opacity-50">Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            data-testid="input-register-password"
                            className="border-[#1A1B2E]/30 bg-transparent focus-visible:ring-[#6B5FC0]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <button
                    type="submit"
                    disabled={register.isPending}
                    data-testid="button-submit-register"
                    className="w-full border-2 border-[#6B5FC0] bg-[#6B5FC0] py-3 text-xs uppercase tracking-widest text-[#F0EEF8] hover:bg-[#5548A0] hover:border-[#5548A0] transition-colors disabled:opacity-50"
                  >
                    {register.isPending ? "Creating account…" : "Create account"}
                  </button>
                </form>
              </Form>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Leaf } from "lucide-react";
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
    <main className="min-h-screen bg-[#F2EDE7] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-8 md:grid-cols-2">
        {/* Left brand panel */}
        <div className="hidden flex-col gap-4 bg-[#5C4A3A] p-10 text-white md:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-white/15">
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

        {/* Right auth card */}
        <div className="border border-[#D4CFC8] bg-white p-6 md:p-10">
          {/* Mobile logo */}
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <div className="flex h-9 w-9 items-center justify-center bg-[#7A7869] text-white">
              <Leaf className="h-4 w-4" />
            </div>
            <span className="text-xl font-bold text-[#1C1714]">CalorieFlow</span>
          </div>

          <h2 className="text-2xl font-bold text-[#1C1714]">Welcome</h2>
          <p className="mt-1 text-sm text-[#6B6560]">Log in or create an account to continue.</p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")} className="mt-6">
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
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#7A7869]"
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
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#7A7869]"
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
                    className="h-11 w-full bg-[#7A7869] text-sm font-bold text-white hover:bg-[#5C5B52]"
                    data-testid="button-submit-login"
                  >
                    {login.isPending ? "Logging in…" : "Log in"}
                  </Button>
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
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#7A7869]"
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
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#7A7869]"
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
                            className="border-[#D4CFC8] bg-[#FAF8F6] focus-visible:ring-[#7A7869]"
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
                    className="h-11 w-full bg-[#7A7869] text-sm font-bold text-white hover:bg-[#5C5B52]"
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

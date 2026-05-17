import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <main className="min-h-screen bg-[#f4f3ef] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-8 md:grid-cols-2">
        <div className="hidden flex-col gap-4 rounded bg-[#475C65] p-10 text-white md:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded bg-white/20">
              <Leaf className="h-6 w-6" />
            </div>
            <span className="text-2xl font-bold">CalorieFlow</span>
          </div>
          <h1 className="mt-8 text-4xl font-bold leading-tight">Mindful nutrition, every day.</h1>
          <p className="text-base opacity-90">
            Track your daily calories, watch your weight trend, and stay consistent with your weight-loss journey.
          </p>
          <ul className="mt-6 space-y-3 text-sm opacity-90">
            <li>• Log breakfast, lunch, dinner & snacks</li>
            <li>• See macros and weekly progress at a glance</li>
            <li>• Track weight loss week by week</li>
          </ul>
        </div>
        <Card className="rounded border-[#c2c8c14c] bg-white shadow-[4px_0px_12px_#0000000a]">
          <CardContent className="p-6 md:p-10">
            <div className="mb-6 flex items-center gap-3 md:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-[#475C65] text-white">
                <Leaf className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold text-[#475C65]">CalorieFlow</span>
            </div>
            <h2 className="text-2xl font-bold text-[#1a1c1a]">Welcome</h2>
            <p className="mt-1 text-sm text-[#424843]">Log in or create an account to continue.</p>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")} className="mt-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" data-testid="tab-login">Log in</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-6">
                <Form {...loginForm}>
                  <form onSubmit={onLogin} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" autoComplete="email" data-testid="input-login-email" {...field} />
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
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" autoComplete="current-password" data-testid="input-login-password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      disabled={login.isPending}
                      className="w-full bg-[#475C65] hover:bg-[#3d5059]"
                      data-testid="button-submit-login"
                    >
                      {login.isPending ? "Logging in..." : "Log in"}
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
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input autoComplete="name" data-testid="input-register-name" {...field} />
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
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" autoComplete="email" data-testid="input-register-email" {...field} />
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
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" autoComplete="new-password" data-testid="input-register-password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      disabled={register.isPending}
                      className="w-full bg-[#475C65] hover:bg-[#3d5059]"
                      data-testid="button-submit-register"
                    >
                      {register.isPending ? "Creating account..." : "Create account"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Settings } from "@shared/schema";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import ProgressPage from "@/pages/Progress";
import LogMeal from "@/pages/LogMeal";
import RecipesPage from "@/pages/Recipes";
import SettingsPage from "@/pages/Settings";
import { useAuth } from "@/hooks/use-auth";
import { LanguageProvider } from "@/contexts/LanguageContext";

function Protected({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F2EDE7] font-['Space_Mono'] text-[#1C1714] text-xs tracking-widest uppercase opacity-50">Loading…</div>;
  }
  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

function DashboardRoute() {
  const { user, isLoading } = useAuth();
  const { data: settings, isSuccess: sLoaded } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    enabled: !!user,
  });

  if (isLoading || (user && !sLoaded)) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F2EDE7] font-['Space_Mono'] text-[#1C1714] text-xs tracking-widest uppercase opacity-50">Loading…</div>;
  }
  if (!user) return <Redirect to="/login" />;

  const needsSetup = !settings?.heightCm && !settings?.ageYears && !settings?.startingWeightKg;
  if (needsSetup) return <Redirect to="/settings" />;

  return <Dashboard />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <Route path="/" component={DashboardRoute} />
      <Route path="/progress" component={() => <Protected component={ProgressPage} />} />
      <Route path="/log" component={() => <Protected component={LogMeal} />} />
      <Route path="/recipes" component={() => <Protected component={RecipesPage} />} />
      <Route path="/settings" component={() => <Protected component={SettingsPage} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <LanguageProvider>
          <Router />
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

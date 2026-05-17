import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import ProgressPage from "@/pages/Progress";
import LogMeal from "@/pages/LogMeal";
import SettingsPage from "@/pages/Settings";
import ChatPage from "@/pages/Chat";
import { useAuth } from "@/hooks/use-auth";

function Protected({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f3ef] text-[#475C65]">Loading…</div>;
  }
  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <Route path="/" component={() => <Protected component={Dashboard} />} />
      <Route path="/progress" component={() => <Protected component={ProgressPage} />} />
      <Route path="/log" component={() => <Protected component={LogMeal} />} />
      <Route path="/chat" component={() => <Protected component={ChatPage} />} />
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
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

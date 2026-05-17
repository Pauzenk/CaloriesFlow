import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, TrendingUp, Settings as SettingsIcon, Plus, LogOut, Leaf } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Progress", path: "/progress", icon: TrendingUp },
  { label: "Settings", path: "/settings", icon: SettingsIcon },
];

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();

  const initials = (user?.name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <main className="min-h-screen bg-[#F2EDE7]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[#D4CFC8] bg-[#ECE8E2] md:flex">
          <div className="flex h-full flex-col px-4 py-6">
            <header className="ml-2 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#7A7869] text-white">
                <Leaf className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-bold leading-tight tracking-tight text-[#1C1714]">CalorieFlow</h1>
                <p className="text-[10px] uppercase tracking-[1.5px] text-[#6B6560]">Mindful Nutrition</p>
              </div>
            </header>
            <nav className="mt-10" aria-label="Sidebar navigation">
              <ul className="space-y-1">
                {navItems.map((item) => {
                  const active = location === item.path;
                  const Icon = item.icon;
                  return (
                    <li key={item.label}>
                      <Link href={item.path}>
                        <button
                          type="button"
                          data-testid={`link-nav-${item.label.toLowerCase()}`}
                          className={`flex h-10 w-full items-center gap-3 px-3 text-left transition-colors ${
                            active
                              ? "border-l-2 border-[#7A7869] bg-[#DDD8D0] text-[#1C1714]"
                              : "border-l-2 border-transparent text-[#6B6560] hover:bg-[#E3DED7] hover:text-[#1C1714]"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="text-sm font-medium">{item.label}</span>
                        </button>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="mt-6">
              <Button
                data-testid="button-log-meal"
                onClick={() => navigate("/log")}
                className="h-12 w-full gap-2 bg-[#7A7869] text-sm font-bold text-white hover:bg-[#5C5B52]"
              >
                <Plus className="h-4 w-4" /> Log Meal
              </Button>
            </div>
            <div className="mt-auto">
              <div className="flex items-center gap-3 border border-[#D4CFC8] px-3 py-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-[#7A7869] text-xs text-white">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-medium text-[#1C1714]" data-testid="text-user-name">
                    {user?.name || user?.email}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-[#6B6560]">Member</p>
                </div>
                <Button
                  data-testid="button-logout"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[#6B6560] hover:text-[#1C1714]"
                  onClick={() => logout.mutate()}
                  title="Log out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
          <header className="flex items-center justify-between border-b border-[#D4CFC8] bg-[#F2EDE7] px-4 py-4 md:px-10 md:py-5">
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-8 w-8 items-center justify-center bg-[#7A7869] text-white">
                <Leaf className="h-4 w-4" />
              </div>
              <span className="text-base font-bold text-[#1C1714]">CalorieFlow</span>
            </div>
            <h2 className="hidden text-xl font-bold text-[#1C1714] md:block">{title}</h2>
            <p className="text-xs text-[#6B6560] md:text-sm">{today}</p>
          </header>
          <h2 className="px-4 pt-5 text-xl font-bold text-[#1C1714] md:hidden">{title}</h2>
          <section className="flex-1 px-4 pb-10 pt-4 md:px-8">{children}</section>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-[#D4CFC8] bg-[#ECE8E2] py-1.5 md:hidden">
        {navItems.map((item) => {
          const active = location === item.path;
          const Icon = item.icon;
          return (
            <Link key={item.path} href={item.path}>
              <button
                type="button"
                data-testid={`link-mobile-nav-${item.label.toLowerCase()}`}
                className={`flex flex-col items-center gap-0.5 px-4 py-1.5 ${
                  active ? "text-[#7A7869]" : "text-[#6B6560]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-medium">{item.label}</span>
              </button>
            </Link>
          );
        })}
        <Link href="/log">
          <button
            type="button"
            data-testid="link-mobile-nav-log"
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 ${
              location === "/log" ? "text-[#7A7869]" : "text-[#6B6560]"
            }`}
          >
            <Plus className="h-5 w-5" />
            <span className="text-[11px] font-medium">Log</span>
          </button>
        </Link>
      </nav>
    </main>
  );
}

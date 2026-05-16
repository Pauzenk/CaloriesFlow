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

  const initials = (user?.name || user?.username || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <main className="min-h-screen bg-[#f4f3ef]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        {/* Desktop sidebar */}
        <aside className="hidden w-72 shrink-0 flex-col border-r border-[#c2c8c1] bg-[#ebe9e4] shadow-[4px_0px_12px_#0000000a] md:flex">
          <div className="flex h-full flex-col px-4 py-5">
            <header className="ml-2 flex items-start gap-3">
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#476550] text-white">
                <Leaf className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold leading-8 tracking-[-0.60px] text-[#476550]">CalorieFlow</h1>
                <p className="text-xs leading-4 tracking-[0.36px] text-[#424843]">Mindful Nutrition</p>
              </div>
            </header>
            <nav className="mt-12" aria-label="Sidebar navigation">
              <ul className="space-y-2 px-2">
                {navItems.map((item) => {
                  const active = location === item.path;
                  const Icon = item.icon;
                  return (
                    <li key={item.label}>
                      <Link href={item.path}>
                        <button
                          type="button"
                          data-testid={`link-nav-${item.label.toLowerCase()}`}
                          className={`flex h-11 w-full items-center gap-4 rounded-xl px-4 text-left transition-colors ${
                            active ? "bg-[#c7e8cf]" : "bg-transparent hover:bg-[#e7e5df]"
                          }`}
                        >
                          <Icon className={`h-5 w-5 shrink-0 ${active ? "text-[#4c6956]" : "text-[#424843]"}`} />
                          <span
                            className={`text-sm font-medium leading-5 tracking-[0.14px] ${
                              active ? "text-[#4c6956]" : "text-[#424843]"
                            }`}
                          >
                            {item.label}
                          </span>
                        </button>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="mt-4 px-2">
              <Button
                data-testid="button-log-meal"
                onClick={() => navigate("/log")}
                className="h-14 w-full gap-2 rounded-xl bg-[#476550] text-base font-bold text-white hover:bg-[#3f5b47]"
              >
                <Plus className="h-4 w-4" /> Log Daily Meal
              </Button>
            </div>
            <div className="mt-auto px-2 pb-2">
              <div className="flex items-center gap-3 rounded-xl border border-[#c2c8c1] px-2 py-2">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-[#476550] text-white">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-medium leading-5 text-[#1a1c1a]" data-testid="text-user-name">
                    {user?.name || user?.username}
                  </p>
                  <p className="truncate text-[10px] uppercase tracking-[0.5px] text-[#424843]">Member</p>
                </div>
                <Button
                  data-testid="button-logout"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => logout.mutate()}
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
          <header className="flex items-center justify-between border-b border-transparent bg-[#f4f3efcc] px-4 py-4 md:px-10 md:py-[22px]">
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#476550] text-white">
                <Leaf className="h-4 w-4" />
              </div>
              <span className="text-lg font-bold text-[#476550]">CalorieFlow</span>
            </div>
            <h2 className="hidden text-2xl font-bold leading-8 text-[#476550] md:block">{title}</h2>
            <p className="text-xs font-medium text-[#1a1c1a] md:text-sm">{today}</p>
          </header>
          <h2 className="px-4 pt-4 text-2xl font-bold leading-8 text-[#476550] md:hidden">{title}</h2>
          <section className="flex-1 px-4 pb-10 pt-3 md:px-8">{children}</section>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-[#c2c8c1] bg-[#ebe9e4] py-1.5 shadow-[0_-4px_12px_#0000000a] md:hidden">
        {navItems.map((item) => {
          const active = location === item.path;
          const Icon = item.icon;
          return (
            <Link key={item.path} href={item.path}>
              <button
                type="button"
                data-testid={`link-mobile-nav-${item.label.toLowerCase()}`}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 ${
                  active ? "text-[#476550]" : "text-[#424843]"
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
            className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 ${
              location === "/log" ? "text-[#476550]" : "text-[#424843]"
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

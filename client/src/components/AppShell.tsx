import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, TrendingUp, Settings as SettingsIcon, LogOut, Leaf, ChefHat } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Progress", path: "/progress", icon: TrendingUp },
  { label: "Recipes", path: "/recipes", icon: ChefHat },
  { label: "Settings", path: "/settings", icon: SettingsIcon },
];

const mobileNavItems = navItems.filter((item) => item.label !== "Recipes");

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const initials = (user?.name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main className="min-h-screen bg-[#F2EDE7]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[#1C1714]/10 bg-[#F2EDE7] md:flex">
          <div className="flex h-full flex-col px-4 py-6">
            <header className="ml-2 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#3c3a40] text-white">
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
                  const active = location === item.path || (item.path === "/recipes" && location.startsWith("/recipes"));
                  const Icon = item.icon;
                  return (
                    <li key={item.label}>
                      <Link href={item.path}>
                        <button
                          type="button"
                          data-testid={`link-nav-${item.label.toLowerCase()}`}
                          className={`flex h-10 w-full items-center gap-3 px-3 text-left transition-colors ${
                            active
                              ? "border-l-2 border-[#1C1714] bg-[#1C1714]/8 text-[#1C1714]"
                              : "border-l-2 border-transparent text-[#1C1714]/50 hover:bg-[#1C1714]/5 hover:text-[#1C1714]"
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
            <div className="mt-auto">
              <div className="flex items-center gap-3 border border-[#D4CFC8] px-3 py-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-[#3c3a40] text-xs text-white">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-medium text-[#1C1714]" data-testid="text-user-name">
                    {user?.name || user?.email}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-[#6B6560]">Member</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
          {/* Top header — page title left, logout right */}
          <header className="flex items-center justify-between border-b border-[#D4CFC8] bg-[#F2EDE7] px-4 py-4 md:px-10 md:py-5">
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-8 w-8 items-center justify-center bg-[#3c3a40] text-white">
                <Leaf className="h-4 w-4" />
              </div>
              <span className="text-base font-bold text-[#1C1714]">CalorieFlow</span>
            </div>
            <h2 className="hidden text-xl font-bold text-[#1C1714] md:block">{title}</h2>
            <Button
              data-testid="button-logout"
              variant="ghost"
              onClick={() => logout.mutate()}
              title="Log out"
              className="flex items-center gap-1.5 text-xs font-medium text-[#6B6560] hover:text-[#1C1714] px-2 py-1.5 h-auto uppercase tracking-widest"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </header>
          <h2 className="px-4 pt-5 text-xl font-bold text-[#1C1714] md:hidden">{title}</h2>
          <section className="flex-1 px-4 pb-10 pt-4 md:px-8">{children}</section>
        </div>
      </div>

      {/* Mobile bottom nav — Dashboard, Progress, Settings */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-[#1C1714]/10 bg-[#F2EDE7] py-1.5 md:hidden">
        {mobileNavItems.map((item) => {
          const active = location === item.path || (item.path === "/recipes" && location.startsWith("/recipes"));
          const Icon = item.icon;
          return (
            <Link key={item.path} href={item.path}>
              <button
                type="button"
                data-testid={`link-mobile-nav-${item.label.toLowerCase()}`}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 ${
                  active ? "text-[#3c3a40]" : "text-[#6B6560]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}

import { ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { LayoutDashboard, TrendingUp, Settings as SettingsIcon, LogOut, ChefHat, Leaf } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const navItems = [
    { labelKey: "dashboard" as const, path: "/", icon: LayoutDashboard },
    { labelKey: "progress" as const, path: "/progress", icon: TrendingUp },
    { labelKey: "recipes" as const, path: "/recipes", icon: ChefHat },
    { labelKey: "settings" as const, path: "/settings", icon: SettingsIcon },
  ];

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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#3c3a40] text-white" style={{ borderRadius: '50%' }}>
                <Leaf className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-bold leading-tight tracking-tight text-[#1C1714]">CalorieFlow</h1>
                <p className="text-[10px] uppercase tracking-[1.5px] text-[#6B6560]">{t("mindfulNutrition")}</p>
              </div>
            </header>
            <nav className="mt-10" aria-label="Sidebar navigation">
              <ul className="space-y-1">
                {navItems.map((item) => {
                  const active = location === item.path || (item.path === "/recipes" && location.startsWith("/recipes"));
                  const Icon = item.icon;
                  return (
                    <li key={item.labelKey}>
                      <button
                        type="button"
                        data-testid={`link-nav-${item.labelKey}`}
                        onClick={() => navigate(item.path)}
                        className={`flex h-11 w-full items-center gap-3 px-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#1C1714] ${
                          active
                            ? "border-l-2 border-[#1C1714] bg-[#1C1714]/8 text-[#1C1714]"
                            : "border-l-2 border-transparent text-[#1C1714]/50 hover:bg-[#1C1714]/5 hover:text-[#1C1714]"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-medium">{t(item.labelKey)}</span>
                      </button>
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
                  <p className="text-[10px] uppercase tracking-wider text-[#6B6560]">{t("member")}</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
          {/* Top header */}
          <header className="flex items-center justify-between border-b border-[#D4CFC8] bg-[#F2EDE7] px-4 py-4 md:px-10 md:py-5">
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-8 w-8 items-center justify-center bg-[#3c3a40] text-white">
                <Leaf className="h-4 w-4" />
              </div>
              <span className="text-base font-bold text-[#1C1714]">CalorieFlow</span>
            </div>
            <h2 className="hidden text-2xl font-bold text-[#1C1714] md:block">{title}</h2>
            <Button
              data-testid="button-logout"
              variant="ghost"
              onClick={() => setLogoutOpen(true)}
              title={t("logOut")}
              className="flex items-center gap-1.5 text-xs font-medium text-[#6B6560] hover:text-[#1C1714] px-2 py-1.5 h-auto uppercase tracking-widest"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("logOut")}</span>
            </Button>
          </header>
          <section className="flex-1 px-4 pb-10 pt-4 md:px-8">{children}</section>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-[#1C1714]/10 bg-[#F2EDE7] py-1.5 md:hidden">
        {navItems.map((item) => {
          const active = location === item.path || (item.path === "/recipes" && location.startsWith("/recipes"));
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              data-testid={`link-mobile-nav-${item.labelKey}`}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 ${
                active ? "text-[#3c3a40]" : "text-[#6B6560]"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout confirmation modal */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent className="font-['Space_Mono'] bg-[#F2EDE7] border-2 border-[#1C1714] rounded-none max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1C1714] tracking-tight">
              {t("logOutConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#1C1714]/60 text-sm leading-relaxed">
              {t("logOutConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none border-[#1C1714]/30 bg-transparent text-[#1C1714] hover:bg-[#1C1714]/5 uppercase text-xs tracking-widest font-['Space_Mono']">
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => logout.mutate()}
              className="rounded-none bg-[#1C1714] text-[#F2EDE7] hover:bg-[#1C1714]/80 uppercase text-xs tracking-widest font-['Space_Mono']"
            >
              {t("logOutConfirmBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

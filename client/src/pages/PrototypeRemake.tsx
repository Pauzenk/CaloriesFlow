import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const navigationItems = [
  {
    label: "Dashboard",
    icon: "/figmaAssets/layout-1.svg",
    active: true,
  },
  {
    label: "Progress",
    icon: "/figmaAssets/layout-2.svg",
    active: false,
  },
  {
    label: "Settings",
    icon: "/figmaAssets/layout-3.svg",
    active: false,
  },
];

const macroItems = [
  { label: "Proteins", value: "82g" },
  { label: "Carbs", value: "145g" },
  { label: "Fats", value: "44g" },
];

const mealCards = [
  {
    title: "Breakfast",
    value: "340",
    icon: "/figmaAssets/container-4.svg",
    progressClass: "w-[22.58%]",
  },
  {
    title: "Lunch",
    value: "520",
    icon: "/figmaAssets/container-3.svg",
    progressClass: "w-[34.67%]",
  },
  {
    title: "Dinner",
    value: "380",
    icon: "/figmaAssets/container-7.svg",
    progressClass: "w-[25.38%]",
  },
];

const weightProgress = [
  { week: "Week 1", value: "-0.6 kg" },
  { week: "Week 2", value: "-0.8 kg" },
  { week: "Week 3", value: "-0.7 kg" },
];

const chartBars = [
  { day: "Mon", height: "h-[66px]" },
  { day: "Tue", height: "h-[63px]" },
  { day: "Wed", height: "h-[56px]" },
  { day: "Thu", height: "h-[69px]" },
  { day: "Fri", height: "h-[68px]" },
  { day: "Sat", height: "h-[72px]" },
  { day: "Sun", height: "h-[58px]" },
];

export const PrototypeRemake = (): JSX.Element => {
  const [period, setPeriod] = useState("week");

  return (
    <main className="min-h-screen bg-[#f4f3ef]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        <aside className="flex w-72 shrink-0 flex-col border-r border-[#c2c8c1] bg-[#ebe9e4] shadow-[4px_0px_12px_#0000000a]">
          <div className="flex h-full flex-col px-4 py-5">
            <header className="ml-2 flex items-start gap-3">
              <img
                className="mt-1 h-10 w-10 shrink-0"
                alt="CalorieFlow logo"
                src="/figmaAssets/container-5.svg"
              />
              <div className="flex flex-col">
                <h1 className="[font-family:'Inter',Helvetica] text-2xl font-bold leading-8 tracking-[-0.60px] text-[#476550]">
                  CalorieFlow
                </h1>
                <p className="[font-family:'Inter',Helvetica] text-xs font-normal leading-4 tracking-[0.36px] text-[#424843]">
                  Mindful Nutrition
                </p>
              </div>
            </header>
            <nav className="mt-12" aria-label="Sidebar navigation">
              <ul className="space-y-2 px-2">
                {navigationItems.map((item) => (
                  <li key={item.label}>
                    <button
                      type="button"
                      className={`flex h-11 w-full items-center gap-4 rounded-xl px-4 text-left transition-colors ${
                        item.active
                          ? "bg-[#c7e8cf]"
                          : "bg-transparent hover:bg-[#e7e5df]"
                      }`}
                    >
                      <img
                        className="h-5 w-5 shrink-0"
                        alt={item.label}
                        src={item.icon}
                      />
                      <span
                        className={`[font-family:'Inter',Helvetica] text-sm font-medium leading-5 tracking-[0.14px] ${
                          item.active ? "text-[#4c6956]" : "text-[#424843]"
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-4 px-2">
              <Button className="h-14 w-full gap-2 rounded-xl bg-[#476550] text-base font-bold text-white hover:bg-[#3f5b47]">
                <img
                  className="h-3.5 w-3.5 shrink-0"
                  alt="Log Daily Meal"
                  src="/figmaAssets/layout.svg"
                />
                <span className="[font-family:'Inter',Helvetica]">
                  Log Daily Meal
                </span>
              </Button>
            </div>
            <div className="mt-5 px-2">
              <div className="flex items-center gap-3 rounded-xl border border-[#c2c8c1] bg-transparent px-[9px] py-[9px]">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src="/figmaAssets/image--user-profile-.png"
                    alt="Alex Johnson"
                  />
                  <AvatarFallback>AJ</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <p className="[font-family:'Inter',Helvetica] text-sm font-medium leading-5 tracking-[0.14px] text-[#1a1c1a]">
                    Alex Johnson
                  </p>
                  <p className="[font-family:'Inter',Helvetica] text-[10px] font-normal leading-[15px] tracking-[0.50px] text-[#424843]">
                    PREMIUM MEMBER
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-transparent bg-[#f4f3efcc] px-10 py-[22px]">
            <h2 className="[font-family:'Inter',Helvetica] text-2xl font-bold leading-8 text-[#476550]">
              Overview
            </h2>
            <div className="flex items-center">
              <img
                className="h-9 w-[84px]"
                alt="Header actions"
                src="/figmaAssets/container-6.svg"
              />
              <div className="mx-6 h-8 w-px bg-[#c2c8c1]" />
              <p className="[font-family:'Inter',Helvetica] text-sm font-medium leading-5 tracking-[0.14px] text-[#1a1c1a]">
                Saturday, May 16
              </p>
            </div>
          </header>
          <section className="flex-1 px-8 pb-10 pt-3">
            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,418px)]">
              <Card className="rounded-[24px] border border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
                <CardContent className="flex h-full flex-col p-[33px]">
                  <div className="flex flex-col justify-between gap-8 md:flex-row">
                    <div className="max-w-[579px] flex-1">
                      <p className="[font-family:'Inter',Helvetica] text-xs font-bold leading-4 tracking-[1.20px] text-[#486551]">
                        CURRENT STATUS
                      </p>
                      <div className="mt-3 flex items-end gap-[21.9px]">
                        <span className="[font-family:'Inter',Helvetica] text-5xl font-bold leading-[56px] tracking-[-0.96px] text-[#476550]">
                          1240
                        </span>
                        <span className="[font-family:'Inter',Helvetica] pb-[7px] text-2xl font-normal leading-8 tracking-[-0.96px] text-[#476550]">
                          kcal consumed
                        </span>
                      </div>
                      <p className="mt-5 max-w-[579px] [font-family:'Inter',Helvetica] text-lg font-normal leading-7 text-[#424843]">
                        You have{" "}
                        <span className="font-bold text-[#476550]">
                          260 kcal
                        </span>{" "}
                        remaining to reach your daily goal of 1500 kcal.
                      </p>
                      <div className="mt-12 flex flex-wrap gap-4">
                        {macroItems.map((item) => (
                          <div
                            key={item.label}
                            className="rounded-lg border border-[#c2c8c14c] bg-[#eeeeea] px-4 py-[9px]"
                          >
                            <p className="[font-family:'Inter',Helvetica] text-center text-xs font-normal leading-4 tracking-[0.36px] text-[#424843]">
                              {item.label}
                            </p>
                            <p className="[font-family:'Inter',Helvetica] text-center text-base font-bold leading-6 text-[#476550]">
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-center xl:justify-end">
                      <div
                        className="flex h-56 w-56 items-center justify-center rounded-full bg-cover bg-center"
                        style={{
                          backgroundImage:
                            "url('/figmaAssets/container-1.png')",
                        }}
                      >
                        <div className="flex h-[190.39px] w-[190.39px] flex-col items-center justify-center rounded-full bg-white">
                          <div className="[font-family:'Inter',Helvetica] text-[32px] font-bold leading-10 tracking-[-0.32px] text-[#476550]">
                            83%
                          </div>
                          <div className="mt-1 [font-family:'Inter',Helvetica] text-xs font-normal leading-4 tracking-[0.36px] text-[#424843]">
                            of Goal
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="flex flex-col gap-8">
                <Card className="overflow-hidden rounded-[24px] border-0 bg-[#476550] shadow-[0px_4px_6px_-4px_#0000001a,0px_10px_15px_-3px_#0000001a]">
                  <CardContent className="relative p-8">
                    <div className="absolute left-[299px] top-[78px] h-40 w-40 rounded-full bg-[#ffffff1a] blur-[32px]" />
                    <div className="relative flex flex-col gap-2">
                      <img
                        className="h-[30px] w-[30px]"
                        alt="Journey icon"
                        src="/figmaAssets/container-2.svg"
                      />
                      <h3 className="[font-family:'Inter',Helvetica] text-2xl font-normal leading-8 text-white">
                        Day 24 of your journey.
                      </h3>
                      <div className="opacity-90">
                        <p className="[font-family:'Inter',Helvetica] text-base font-normal leading-6 text-white">
                          You&#39;re doing great! You&#39;ve maintained
                        </p>
                        <p className="[font-family:'Inter',Helvetica] text-base font-normal leading-6 text-white">
                          consistency for 12 days straight.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-[24px] border border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
                  <CardContent className="p-[33px]">
                    <p className="[font-family:'Inter',Helvetica] text-sm font-bold leading-5 tracking-[1.40px] text-[#424843]">
                      WEIGHT PROGRESS
                    </p>
                    <div className="mt-5 flex items-end gap-2">
                      <span className="[font-family:'Inter',Helvetica] text-5xl font-bold leading-[56px] tracking-[-0.96px] text-[#486551]">
                        -2.1
                      </span>
                      <span className="[font-family:'Inter',Helvetica] mb-1 text-2xl font-normal leading-8 text-[#424843]">
                        kg total
                      </span>
                    </div>
                    <div className="mt-10">
                      {weightProgress.map((item, index) => (
                        <div key={item.week}>
                          <div className="flex items-center justify-between py-4">
                            <span className="[font-family:'Inter',Helvetica] text-sm font-medium leading-5 tracking-[0.14px] text-[#1a1c1a]">
                              {item.week}
                            </span>
                            <span className="[font-family:'Inter',Helvetica] text-base font-bold leading-6 text-[#486551]">
                              {item.value}
                            </span>
                          </div>
                          {index < weightProgress.length - 1 && (
                            <Separator className="bg-[#c2c8c133]" />
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
            <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {mealCards.map((meal) => (
                <Card
                  key={meal.title}
                  className="rounded-[24px] border border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]"
                >
                  <CardContent className="p-[25px]">
                    <img
                      className="h-12 w-12"
                      alt={meal.title}
                      src={meal.icon}
                    />
                    <p className="mt-3 [font-family:'Inter',Helvetica] text-xs font-normal leading-4 tracking-[0.36px] text-[#424843]">
                      {meal.title}
                    </p>
                    <div className="mt-1 flex items-end gap-[5.2px]">
                      <span className="[font-family:'Inter',Helvetica] text-2xl font-normal leading-8 text-[#1a1c1a]">
                        {meal.value}
                      </span>
                      <span className="[font-family:'Inter',Helvetica] mb-[2px] text-base font-normal leading-6 text-[#1a1c1a]">
                        kcal
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eeeeea]">
                      <div
                        className={`h-full bg-[#486551] ${meal.progressClass}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
            <Card className="mt-4 rounded-[24px] border border-[#c2c8c11a] bg-white shadow-[4px_0px_12px_#0000000a]">
              <CardContent className="p-[33px]">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="[font-family:'Inter',Helvetica] text-2xl font-normal leading-8 text-[#1a1c1a]">
                      Goal vs. Actual
                    </h3>
                    <p className="mt-2 [font-family:'Inter',Helvetica] text-sm font-medium leading-5 tracking-[0.14px] text-[#424843]">
                      Calorie intake trends over time
                    </p>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={period}
                    onValueChange={(value) => {
                      if (value) setPeriod(value);
                    }}
                    className="h-11 rounded-full bg-[#eeeeea] p-1"
                  >
                    <ToggleGroupItem
                      value="day"
                      className="h-9 rounded-full px-5 text-sm font-bold text-[#1a1c1a] data-[state=on]:bg-transparent data-[state=on]:text-[#1a1c1a]"
                    >
                      Day
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="week"
                      className="h-9 rounded-full px-5 text-sm font-bold text-[#1a1c1a] shadow-none data-[state=on]:bg-white data-[state=on]:text-[#476550] data-[state=on]:shadow-[0px_1px_2px_#0000000d]"
                    >
                      Week
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="month"
                      className="h-9 rounded-full px-5 text-sm font-bold text-[#1a1c1a] data-[state=on]:bg-transparent data-[state=on]:text-[#1a1c1a]"
                    >
                      Month
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="mt-12 flex min-h-[308px] items-end justify-between gap-6 px-6 pb-5 md:px-14 lg:px-24">
                  {chartBars.map((bar) => (
                    <div
                      key={bar.day}
                      className="flex w-10 flex-col items-center gap-2"
                    >
                      <div
                        className={`w-5 rounded-[4px_4px_0px_0px] bg-[#4f7159] sm:w-6 md:w-8 lg:w-10 ${bar.height}`}
                      />
                      <span className="[font-family:'Inter',Helvetica] text-xs font-medium leading-[18px] text-[#424843]">
                        {bar.day}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#476550]" />
                    <p className="[font-family:'Inter',Helvetica] text-xs font-normal leading-4 tracking-[0.04px] text-[#424843]">
                      Daily Average:{" "}
                      <span className="font-bold">1,420 kcal</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border border-[#47655033] bg-[#adcfb5]" />
                    <p className="[font-family:'Inter',Helvetica] text-xs font-normal leading-4 tracking-[0.04px] text-[#424843]">
                      Target Consistency: <span className="font-bold">92%</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
};

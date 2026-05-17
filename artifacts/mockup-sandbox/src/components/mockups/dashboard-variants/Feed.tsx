import React from "react";
import { ArrowRight, Activity, Target, Utensils, Droplet, Flame } from "lucide-react";

export function Feed() {
  const meals = [
    { time: "08:14", name: "Mango Soy Yogurt", kcal: 61, tag: "breakfast" },
    { time: "08:22", name: "Frosties with banana", kcal: 166, tag: "breakfast" },
    { time: "08:45", name: "Haribo 6 pieces", kcal: 87, tag: "breakfast" },
    { time: "10:30", name: "10g Cashews", kcal: 55, tag: "breakfast" },
  ];

  const chartData = [
    { day: "Mon", val: 0 },
    { day: "Tue", val: 0 },
    { day: "Wed", val: 0 },
    { day: "Thu", val: 0 },
    { day: "Fri", val: 150 },
    { day: "Sat", val: 350 },
    { day: "Sun", val: 369 },
  ];

  return (
    <div className="min-h-screen bg-[#F2EDE7] text-[#1C1714] font-['Space_Mono'] selection:bg-[#1C1714] selection:text-[#F2EDE7] flex justify-center py-12 px-4 sm:px-8">
      <div className="w-full max-w-md bg-[#F2EDE7] relative">
        {/* Header Strip - Running Tally */}
        <div className="sticky top-0 bg-[#F2EDE7] z-10 pb-4 border-b-2 border-[#1C1714] mb-8">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-60 mb-1">Today's Tally</p>
              <div className="text-5xl tracking-tighter leading-none">
                369
                <span className="text-lg opacity-50 ml-1">/ 1200</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest opacity-60 mb-1">Remaining</p>
              <div className="text-3xl tracking-tighter leading-none">831</div>
            </div>
          </div>

          <div className="flex justify-between border-t border-[#1C1714]/20 pt-3 mt-4 text-sm">
            <div className="flex gap-4">
              <div><span className="opacity-50">PRO</span> 16g</div>
              <div><span className="opacity-50">CRB</span> 76g</div>
              <div><span className="opacity-50">FAT</span> 12g</div>
            </div>
          </div>
        </div>

        {/* Journey Block */}
        <div className="border border-[#1C1714] p-4 mb-8 text-sm">
          <div className="flex justify-between items-center mb-3 pb-3 border-b border-[#1C1714]/20 border-dashed">
            <div className="uppercase tracking-widest text-xs opacity-60">Journey Statement</div>
            <div>DAY 02</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="opacity-50 text-xs mb-1 uppercase tracking-wide">Current Wt</div>
              <div className="text-lg">55.7 kg</div>
            </div>
            <div>
              <div className="opacity-50 text-xs mb-1 uppercase tracking-wide">Goal Wt</div>
              <div className="text-lg">48.0 kg</div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1C1714]/20 border-dashed flex items-center justify-between">
            <div className="text-xs uppercase opacity-60">Progress</div>
            <div>4% Complete</div>
          </div>
        </div>

        {/* The Feed */}
        <div className="mb-12">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-4 border-b border-[#1C1714]/20 pb-2">Ledger</div>
          
          <div className="flex flex-col">
            {meals.map((meal, i) => (
              <div key={i} className="group relative flex py-3 border-b border-[#1C1714]/10 hover:border-[#1C1714]/40 transition-colors">
                <div className="w-16 text-xs opacity-50 pt-0.5">{meal.time}</div>
                <div className="flex-1 px-2">
                  <div className="leading-tight">{meal.name}</div>
                  <div className="text-[10px] uppercase opacity-50 tracking-widest mt-1">{meal.tag}</div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums">+{meal.kcal}</div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex justify-between items-center py-4 border-b-2 border-[#1C1714]">
            <div className="uppercase tracking-widest text-xs">Subtotal</div>
            <div className="tabular-nums">369</div>
          </div>
        </div>

        {/* Weekly Chart */}
        <div>
          <div className="text-xs uppercase tracking-widest opacity-60 mb-6 text-center">7-Day Volume</div>
          <div className="flex items-end justify-between h-32 px-4">
            {chartData.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-6 bg-[#1C1714] transition-all relative group" style={{ height: `${(d.val / 1200) * 100}%`, minHeight: d.val > 0 ? '4px' : '1px', opacity: d.val === 0 ? 0.2 : 1 }}>
                  {d.val > 0 && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.val}
                    </div>
                  )}
                </div>
                <div className="text-[10px] uppercase opacity-50">{d.day}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#1C1714] mt-2 pt-2 text-center text-[10px] uppercase opacity-40 tracking-widest">
            End of Record
          </div>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { TrendingDown, Scale, Target, CalendarDays, Flame } from "lucide-react";

export function Scorecard() {
  const chartData = [
    { day: "Mon", value: 0 },
    { day: "Tue", value: 0 },
    { day: "Wed", value: 0 },
    { day: "Thu", value: 0 },
    { day: "Fri", value: 150 },
    { day: "Sat", value: 350 },
    { day: "Sun", value: 369, active: true },
  ];

  return (
    <div className="min-h-screen bg-[#F2EDE7] text-[#1C1714] flex flex-col p-6 md:p-12 overflow-hidden selection:bg-[#1C1714] selection:text-[#F2EDE7]">
      {/* Top Section: Radical Typographic Hierarchy */}
      <div className="flex-1 flex flex-col justify-center items-center relative mb-12">
        <div className="absolute top-0 left-0 w-full flex justify-between items-center text-xs tracking-widest uppercase opacity-60">
          <span>Daily Scorecard</span>
          <span>Today</span>
        </div>
        
        <div className="text-center mt-12 md:mt-24 relative">
          <div className="font-['Playfair_Display'] text-[8rem] md:text-[12rem] lg:text-[16rem] leading-none tracking-tighter">
            369
          </div>
          <div className="flex items-center justify-center gap-4 mt-2 font-mono text-sm uppercase tracking-widest opacity-80">
            <span>Consumed</span>
            <span className="w-1 h-1 rounded-full bg-[#1C1714]"></span>
            <span>1200 Goal</span>
            <span className="w-1 h-1 rounded-full bg-[#1C1714]"></span>
            <span>831 Left</span>
          </div>
        </div>
      </div>

      {/* Middle Section: Fine-print statistics band */}
      <div className="border-t border-b border-[#1C1714]/20 py-8 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest opacity-50 flex items-center gap-2">
            <Flame className="w-3 h-3" /> Macros
          </span>
          <div className="font-mono text-sm flex gap-3 mt-1">
            <span><span className="opacity-50">P</span> 16g</span>
            <span><span className="opacity-50">C</span> 76g</span>
            <span><span className="opacity-50">F</span> 12g</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-l border-[#1C1714]/10 pl-8">
          <span className="text-[10px] uppercase tracking-widest opacity-50 flex items-center gap-2">
            <CalendarDays className="w-3 h-3" /> Journey
          </span>
          <div className="font-mono text-sm mt-1">
            Day 2 <span className="opacity-50">· 4% to goal</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-l border-[#1C1714]/10 pl-8">
          <span className="text-[10px] uppercase tracking-widest opacity-50 flex items-center gap-2">
            <Scale className="w-3 h-3" /> Current Weight
          </span>
          <div className="font-mono text-sm mt-1">
            55.7 kg
          </div>
        </div>

        <div className="flex flex-col gap-1 border-l border-[#1C1714]/10 pl-8">
          <span className="text-[10px] uppercase tracking-widest opacity-50 flex items-center gap-2">
            <Target className="w-3 h-3" /> Goal Weight
          </span>
          <div className="font-mono text-sm mt-1">
            48.0 kg
          </div>
        </div>
      </div>

      {/* Bottom Section: Weekly Chart (Minimalist) */}
      <div className="mt-8 pt-4">
        <div className="flex items-end justify-between h-32 gap-2">
          {chartData.map((d, i) => {
            const height = Math.max((d.value / 400) * 100, 2);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-3">
                <div className="w-full relative h-full flex flex-col justify-end group">
                  <div 
                    className={`w-full transition-all duration-500 ease-out ${
                      d.active ? "bg-[#1C1714]" : "bg-[#1C1714]/10 group-hover:bg-[#1C1714]/30"
                    }`}
                    style={{ height: `${height}%` }}
                  ></div>
                  <div className="absolute bottom-full mb-2 w-full text-center opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[10px]">
                    {d.value}
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-widest ${d.active ? 'opacity-100 font-bold' : 'opacity-40'}`}>
                  {d.day}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

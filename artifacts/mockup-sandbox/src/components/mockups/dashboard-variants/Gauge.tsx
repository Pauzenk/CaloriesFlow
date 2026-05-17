import React from 'react';

// Math helpers for SVG arcs
function calculateArc(percentage: number, radius: number) {
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  return { circumference, strokeDashoffset };
}

function ArcRing({ 
  percentage, 
  radius = 120, 
  strokeWidth = 4, 
  bgStroke = "rgba(255,255,255,0.1)", 
  fgStroke = "#FDFBF7" 
}: { 
  percentage: number; 
  radius?: number; 
  strokeWidth?: number; 
  bgStroke?: string; 
  fgStroke?: string; 
}) {
  const { circumference, strokeDashoffset } = calculateArc(percentage, radius);
  const size = (radius + strokeWidth) * 2;
  const center = size / 2;

  return (
    <svg width={size} height={size} className="-rotate-90 transform" viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke={bgStroke}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke={fgStroke}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  );
}

export function Gauge() {
  const caloriesConsumed = 369;
  const calorieGoal = 1200;
  const caloriePercentage = (caloriesConsumed / calorieGoal) * 100;
  
  return (
    <div className="min-h-screen bg-[#F2EDE7] text-[#3D2B1F] font-sans selection:bg-[#3D2B1F] selection:text-[#F2EDE7]">
      {/* Top Section - The Gauge */}
      <div className="bg-[#3D2B1F] text-[#FDFBF7] rounded-b-3xl px-6 pt-12 pb-8 shadow-sm">
        <header className="flex justify-between items-center mb-10">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-widest opacity-60">Today</span>
            <span className="text-xl font-serif">CalorieFlow</span>
          </div>
          <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center overflow-hidden">
             <div className="w-full h-full bg-[#FDFBF7]/10" />
          </div>
        </header>
        
        {/* Main Gauge */}
        <div className="relative flex justify-center items-center my-12">
          <ArcRing percentage={caloriePercentage} radius={110} strokeWidth={3} />
          <div className="absolute flex flex-col items-center">
            <span className="text-5xl font-light tracking-tight">{caloriesConsumed}</span>
            <span className="text-sm opacity-60 tracking-wider mt-1">/ {calorieGoal} KCAL</span>
          </div>
        </div>
        
        {/* Macros */}
        <div className="flex justify-between items-center px-4 mt-8">
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex justify-center items-center">
              <ArcRing percentage={(16/50)*100} radius={24} strokeWidth={2} />
              <span className="absolute text-xs font-medium">16g</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider opacity-60">Protein</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex justify-center items-center">
              <ArcRing percentage={(76/150)*100} radius={24} strokeWidth={2} />
              <span className="absolute text-xs font-medium">76g</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider opacity-60">Carbs</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex justify-center items-center">
              <ArcRing percentage={(12/40)*100} radius={24} strokeWidth={2} />
              <span className="absolute text-xs font-medium">12g</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider opacity-60">Fat</span>
          </div>
        </div>
      </div>
      
      {/* Bottom Section - The Flow */}
      <div className="px-6 py-8 space-y-10 pb-20">
        
        {/* Journey */}
        <div className="space-y-4">
          <div className="flex justify-between items-end border-b border-[#3D2B1F]/10 pb-2">
            <span className="text-xs uppercase tracking-widest opacity-60">Journey</span>
            <span className="text-sm font-medium">Day 2</span>
          </div>
          <div className="flex justify-between items-baseline">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-light tracking-tight">55.7</span>
              <span className="text-xs opacity-60">kg</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">4% to goal</div>
              <div className="text-xs opacity-60">Goal: 48 kg</div>
            </div>
          </div>
        </div>
        
        {/* Meals */}
        <div className="space-y-4">
          <div className="flex justify-between items-end border-b border-[#3D2B1F]/10 pb-2">
            <span className="text-xs uppercase tracking-widest opacity-60">Meals</span>
            <span className="text-sm font-medium">{831} remaining</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2">
              <span className="font-serif">Breakfast</span>
              <span className="text-sm font-medium">369 kcal</span>
            </div>
            <div className="flex justify-between items-center py-2 opacity-50">
              <span className="font-serif">Lunch</span>
              <span className="text-sm">0 kcal</span>
            </div>
            <div className="flex justify-between items-center py-2 opacity-50">
              <span className="font-serif">Dinner</span>
              <span className="text-sm">0 kcal</span>
            </div>
          </div>
        </div>

        {/* Weekly Chart */}
        <div className="space-y-6">
          <div className="flex justify-between items-end border-b border-[#3D2B1F]/10 pb-2">
            <span className="text-xs uppercase tracking-widest opacity-60">This Week</span>
          </div>
          <div className="h-32 flex items-end justify-between gap-2">
            {[0, 0, 0, 0, 150, 350, 369].map((val, i) => {
              const height = val > 0 ? `${Math.max(4, (val / 1200) * 100)}%` : '2px';
              const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
              return (
                <div key={i} className="flex flex-col items-center gap-2 flex-1">
                  <div className="w-full bg-[#3D2B1F]/10 rounded-sm relative" style={{ height: '100px' }}>
                    <div 
                      className="absolute bottom-0 w-full bg-[#3D2B1F] rounded-sm transition-all"
                      style={{ height: height }}
                    />
                  </div>
                  <span className="text-[10px] opacity-60">{days[i]}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

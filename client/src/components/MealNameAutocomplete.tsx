import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Clock, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { type Food } from "@shared/foods";

type HistoryItem = {
  name: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onPickHistory: (item: HistoryItem) => void;
  onPickFood: (food: Food) => void;
  onClearFood?: () => void;
  disabled?: boolean;
  placeholder?: string;
};

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function MealNameAutocomplete({
  value,
  onChange,
  onPickHistory,
  onPickFood,
  onClearFood,
  disabled,
  placeholder = "Search foods or past meals…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [foodItems, setFoodItems] = useState<Food[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(value, 200);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setHistoryItems([]);
      setFoodItems([]);
      return;
    }
    try {
      const [histRes, foodRes] = await Promise.all([
        fetch(`/api/meals/history?q=${encodeURIComponent(q)}`, { credentials: "include" }),
        fetch(`/api/foods?q=${encodeURIComponent(q)}`, { credentials: "include" }),
      ]);
      if (histRes.ok) setHistoryItems(await histRes.json());
      if (foodRes.ok) setFoodItems(await foodRes.json());
    } catch {
      // ignore fetch errors silently
    }
  }, []);

  useEffect(() => {
    fetchSuggestions(debouncedQuery);
  }, [debouncedQuery, fetchSuggestions]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const showDropdown = open && (historyItems.length > 0 || foodItems.length > 0);
  const maxFoods = historyItems.length > 0 ? 4 : 8;
  const visibleFoods = foodItems.slice(0, maxFoods);

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#424843] z-10" />
      <Input
        placeholder={placeholder}
        autoComplete="off"
        data-testid="input-meal-name"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          if (onClearFood) onClearFood();
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="pl-9"
      />
      {showDropdown && (
        <div
          data-testid="list-meal-suggestions"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded border border-[#c0cdd14c] bg-white shadow-lg"
        >
          {historyItems.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#475C65] bg-[#f4f3ef] border-b border-[#c0cdd14c]">
                <Clock className="h-3 w-3" />
                Your history
              </div>
              {historyItems.map((item) => (
                <button
                  key={`hist-${item.name}`}
                  type="button"
                  data-testid={`suggestion-history-${item.name.replace(/\s+/g, "-").toLowerCase()}`}
                  onClick={() => {
                    onPickHistory(item);
                    onChange(item.name);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#f4f3ef]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1a1c1a]">{item.name}</p>
                    <p className="text-xs text-[#424843]">{item.calories} kcal</p>
                  </div>
                  <span className="shrink-0 text-xs text-[#475C65]">
                    P {item.proteins}g · C {item.carbs}g · F {item.fats}g
                  </span>
                </button>
              ))}
            </>
          )}
          {visibleFoods.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#424843] bg-[#f4f3ef] border-b border-[#c0cdd14c]">
                <Database className="h-3 w-3" />
                Food database
              </div>
              {visibleFoods.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`suggestion-food-${f.id}`}
                  onClick={() => {
                    onPickFood(f);
                    onChange(f.name);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#f4f3ef]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1a1c1a]">{f.name}</p>
                    <p className="text-xs text-[#424843]">
                      {f.category} · {f.per100g.calories} kcal / 100 g
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[#475C65]">
                    P {f.per100g.proteins}g · C {f.per100g.carbs}g · F {f.per100g.fats}g
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

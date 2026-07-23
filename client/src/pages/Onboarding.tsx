import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { computeBMR, computeTDEE } from "@/lib/calorieflow";
import { ACTIVITY_MULTIPLIERS } from "@shared/schema";
import { Leaf } from "lucide-react";

type GoalMode = "weight_loss" | "maintenance" | "weight_gain";
type Sex = "male" | "female";
type ActivityLevel = "sedentary" | "light" | "active";
type Pace = "gentle" | "moderate" | "aggressive";

const STEP_COUNT = 4;

const PACE_DEFICIT: Record<Pace, number> = {
  gentle: 250,
  moderate: 500,
  aggressive: 750,
};

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-8">
      {Array.from({ length: STEP_COUNT }, (_, i) => (
        <div
          key={i}
          className="h-1 flex-1 rounded-full transition-all duration-300"
          style={{ background: i < step ? "#1C1714" : "rgba(28,23,20,0.15)" }}
        />
      ))}
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  label,
  sublabel,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full text-left px-5 py-4 border transition-all duration-150"
      style={{
        borderColor: selected ? "#1C1714" : "rgba(28,23,20,0.2)",
        background: selected ? "#1C1714" : "transparent",
        color: selected ? "#F2EDE7" : "#1C1714",
      }}
    >
      <div className="font-bold text-sm tracking-wide">{label}</div>
      {sublabel && (
        <div className="text-xs mt-0.5" style={{ opacity: selected ? 0.65 : 0.5 }}>
          {sublabel}
        </div>
      )}
    </button>
  );
}

function NumericField({
  label,
  value,
  onChange,
  unit,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  placeholder?: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs uppercase tracking-widest text-[#6B6560]">{label}</label>
      <div className="flex items-center border border-[#1C1714]/30 focus-within:border-[#1C1714] transition-colors">
        <input
          type="number"
          data-testid={testId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-3 py-2.5 font-['Space_Mono'] text-sm text-[#1C1714] outline-none"
        />
        {unit && (
          <span className="pr-3 text-xs text-[#6B6560] font-['Space_Mono']">{unit}</span>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [goalMode, setGoalMode] = useState<GoalMode>("weight_loss");
  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [currentWeightKg, setCurrentWeightKg] = useState("");
  const [goalWeightKg, setGoalWeightKg] = useState("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("sedentary");
  const [pace, setPace] = useState<Pace>("moderate");
  const [planMonths, setPlanMonths] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      apiRequest("PATCH", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      navigate("/");
    },
  });

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getPlan(overridePace?: Pace) {
    const usedPace = overridePace ?? pace;
    const w = parseFloat(currentWeightKg) || 75;
    const h = parseFloat(heightCm) || 175;
    const a = parseInt(age) || 30;
    const s: Sex = sex ?? "male";
    const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.2;
    const bmr = computeBMR(w, h, a, s);
    const tdee = Math.round(computeTDEE(bmr, multiplier));
    const deficit = PACE_DEFICIT[usedPace];
    let dailyTarget: number;
    if (goalMode === "weight_loss") dailyTarget = Math.max(1200, tdee - deficit);
    else if (goalMode === "weight_gain") dailyTarget = tdee + deficit;
    else dailyTarget = tdee;
    const goalW = parseFloat(goalWeightKg) || w;
    const weightDiff = Math.abs(w - goalW);
    const dailyDeficit = Math.abs(tdee - dailyTarget);
    const months =
      goalMode === "maintenance" || dailyDeficit === 0
        ? null
        : Math.round((weightDiff * 7700) / (dailyDeficit * 30));
    const goalDate =
      months != null
        ? (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + months);
            return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          })()
        : null;
    return { tdee, dailyTarget, weightDiff, months, goalDate, deficit };
  }

  function validateStep2() {
    const errs: string[] = [];
    if (!sex) errs.push("Please select your sex");
    const a = parseInt(age);
    if (!age || a < 5 || a > 120) errs.push("Enter a valid age (5–120)");
    const h = parseInt(heightCm);
    if (!heightCm || h < 100 || h > 250) errs.push("Enter a valid height (100–250 cm)");
    const w = parseFloat(currentWeightKg);
    if (!currentWeightKg || w < 30 || w > 300) errs.push("Enter a valid current weight (30–300 kg)");
    if (goalMode !== "maintenance") {
      const gw = parseFloat(goalWeightKg);
      if (!goalWeightKg || gw < 30 || gw > 300) errs.push("Enter a valid goal weight (30–300 kg)");
    }
    return errs;
  }

  function goalDateFromMonths(m: number) {
    const d = new Date();
    d.setMonth(d.getMonth() + m);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  function handleNext() {
    if (step === 2) {
      const errs = validateStep2();
      if (errs.length) { setErrors(errs); return; }
      setErrors([]);
    }
    if (step === 3) {
      const rec = getPlan("moderate");
      setPlanMonths(rec.months ?? 8);
    }
    setStep((s) => Math.min(s + 1, 4) as 1 | 2 | 3 | 4);
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3 | 4);
  }

  const plan = step === 4 ? getPlan() : null;

  const LABEL_CLS = "text-xs uppercase tracking-widest text-[#6B6560] font-['Space_Mono']";
  const BTN = "w-full py-3 text-xs uppercase tracking-widest font-['Space_Mono'] font-bold transition-colors";

  return (
    <div className="min-h-screen bg-[#F2EDE7] flex flex-col items-center justify-start px-4 py-10 font-['Space_Mono'] text-[#1C1714]">
      <div className="w-full max-w-sm">

        {/* ── Step 1: logo header ── */}
        {step === 1 && (
          <div className="flex items-center gap-3 mb-10">
            <div
              className="h-9 w-9 flex-shrink-0 flex items-center justify-center"
              style={{ borderRadius: "50%", background: "#1C1714" }}
            >
              <Leaf size={18} color="#F2EDE7" />
            </div>
            <span className="text-sm font-bold tracking-widest uppercase">CalorieFlow</span>
          </div>
        )}

        {/* ── Steps 2-4: back + step counter row ── */}
        {step > 1 && (
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={handleBack}
              data-testid={`button-onboard-back-${step}`}
              className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#6B6560] hover:text-[#1C1714] transition-colors"
            >
              ← Back
            </button>
            <span className={LABEL_CLS}>Step {step} / {STEP_COUNT}</span>
          </div>
        )}

        {/* Progress bar */}
        <StepBar step={step} />

        {/* Step 1 label */}
        {step === 1 && (
          <div className={LABEL_CLS + " mb-6"}>Step {step} / {STEP_COUNT}</div>
        )}

        {/* ── Step 1: Goal ── */}
        {step === 1 && (
          <div>
            <h1 className="text-2xl font-bold mb-2">What's your goal?</h1>
            <p className="text-sm text-[#6B6560] mb-8">
              We'll tailor your daily calories around it. You can change this anytime.
            </p>
            <div className="flex flex-col gap-3 mb-10">
              <OptionCard
                selected={goalMode === "weight_loss"}
                onClick={() => setGoalMode("weight_loss")}
                label="Lose weight"
                sublabel="Eat below maintenance"
                testId="option-goal-loss"
              />
              <OptionCard
                selected={goalMode === "maintenance"}
                onClick={() => setGoalMode("maintenance")}
                label="Maintain"
                sublabel="Hold your current weight"
                testId="option-goal-maintain"
              />
              <OptionCard
                selected={goalMode === "weight_gain"}
                onClick={() => setGoalMode("weight_gain")}
                label="Gain weight"
                sublabel="Eat above maintenance"
                testId="option-goal-gain"
              />
            </div>
            <button
              type="button"
              data-testid="button-onboard-continue-1"
              onClick={handleNext}
              className={BTN + " bg-[#1C1714] text-[#F2EDE7] hover:bg-[#2e2420]"}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step 2: About you ── */}
        {step === 2 && (
          <div>
            <h1 className="text-2xl font-bold mb-2 mt-6">Tell us about you</h1>
            <p className="text-sm text-[#6B6560] mb-8">
              Just the basics we need to calculate your target.
            </p>
            <div className="flex flex-col gap-5 mb-6">
              <div className="flex flex-col gap-1">
                <span className={LABEL_CLS}>Sex</span>
                <div className="flex border border-[#1C1714]/30" data-testid="toggle-sex">
                  {(["male", "female"] as Sex[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      data-testid={`option-sex-${s}`}
                      onClick={() => setSex(s)}
                      className="flex-1 py-2.5 text-xs uppercase tracking-widest transition-colors"
                      style={{
                        background: sex === s ? "#1C1714" : "transparent",
                        color: sex === s ? "#F2EDE7" : "#1C1714",
                      }}
                    >
                      {s === "male" ? "Male" : "Female"}
                    </button>
                  ))}
                </div>
              </div>
              <NumericField label="Age" value={age} onChange={setAge} placeholder="30" testId="input-onboard-age" />
              <NumericField label="Height" value={heightCm} onChange={setHeightCm} unit="cm" placeholder="175" testId="input-onboard-height" />
              <NumericField label="Current weight" value={currentWeightKg} onChange={setCurrentWeightKg} unit="kg" placeholder="80.0" testId="input-onboard-current-weight" />
              {goalMode !== "maintenance" && (
                <NumericField
                  label="Goal weight"
                  value={goalWeightKg}
                  onChange={setGoalWeightKg}
                  unit="kg"
                  placeholder={goalMode === "weight_loss" ? "70.0" : "90.0"}
                  testId="input-onboard-goal-weight"
                />
              )}
            </div>
            {errors.length > 0 && (
              <div className="mb-4 flex flex-col gap-1">
                {errors.map((e) => (
                  <p key={e} className="text-xs text-red-600">{e}</p>
                ))}
              </div>
            )}
            <button
              type="button"
              data-testid="button-onboard-continue-2"
              onClick={handleNext}
              className={BTN + " bg-[#1C1714] text-[#F2EDE7] hover:bg-[#2e2420]"}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step 3: Walking / daily movement ── */}
        {step === 3 && (
          <div>
            <h1 className="text-2xl font-bold mb-2 mt-6">How much do you walk?</h1>
            <p className="text-sm text-[#6B6560] mb-8">
              Think about your typical day — not counting workouts, which you'll log separately.
            </p>
            <div className="flex flex-col gap-3 mb-10">
              <OptionCard
                selected={activityLevel === "sedentary"}
                onClick={() => setActivityLevel("sedentary")}
                label="Mostly sitting"
                sublabel="Little walking — desk job or mostly at home"
                testId="option-activity-sedentary"
              />
              <OptionCard
                selected={activityLevel === "light"}
                onClick={() => setActivityLevel("light")}
                label="Some walking"
                sublabel="Light movement — short walks, occasional errands"
                testId="option-activity-light"
              />
              <OptionCard
                selected={activityLevel === "active"}
                onClick={() => setActivityLevel("active")}
                label="Lots of walking"
                sublabel="On your feet most of the day — active job or lifestyle"
                testId="option-activity-active"
              />
            </div>
            <button
              type="button"
              data-testid="button-onboard-see-plan"
              onClick={handleNext}
              className={BTN + " bg-[#1C1714] text-[#F2EDE7] hover:bg-[#2e2420]"}
            >
              See my plan
            </button>
          </div>
        )}

        {/* ── Step 4: Plan summary ── */}
        {step === 4 && plan && (() => {
          const recPlan = getPlan("moderate");
          const localMonths = planMonths ?? recPlan.months ?? 8;
          const adjustedDelta = recPlan.weightDiff > 0
            ? (recPlan.weightDiff * 7700) / (localMonths * 30.44)
            : 0;
          const adjustedCalorie = goalMode === "weight_gain"
            ? Math.round(recPlan.tdee + adjustedDelta)
            : Math.round(Math.max(1200, recPlan.tdee - adjustedDelta));
          const monthlyRate = recPlan.weightDiff > 0 ? recPlan.weightDiff / localMonths : 0;
          const minMonths = 1;

          return (
            <div className="mt-4 space-y-4">
              {/* "YOUR PLAN IS READY" label */}
              <div className={LABEL_CLS}>Your plan is ready</div>

              {/* ── RECOMMENDED card ── */}
              <div className="border-2 border-[#1C1714] p-5" data-testid="panel-recommended">
                <p className={LABEL_CLS + " mb-3"}>Recommended</p>
                <div className="text-5xl tabular-nums tracking-tighter leading-none font-['Space_Mono'] mb-1" data-testid="text-plan-target">
                  {recPlan.dailyTarget.toLocaleString()}
                </div>
                <p className="text-xs text-[#6B6560] mb-4">kcal / day</p>
                {goalMode !== "maintenance" && (
                  <div className="border-t border-[#1C1714]/10 pt-3 flex gap-6 flex-wrap">
                    <div>
                      <p className={LABEL_CLS + " mb-0.5"}>{goalMode === "weight_loss" ? "Lose" : "Gain"}</p>
                      <p className="text-sm tabular-nums">{recPlan.weightDiff.toFixed(1)} kg</p>
                    </div>
                    <div>
                      <p className={LABEL_CLS + " mb-0.5"}>Timeline</p>
                      <p className="text-sm tabular-nums">~{recPlan.months ?? "—"} mo</p>
                    </div>
                    <div>
                      <p className={LABEL_CLS + " mb-0.5"}>Monthly</p>
                      <p className="text-sm tabular-nums">
                        ~{recPlan.months ? (recPlan.weightDiff / recPlan.months).toFixed(1) : "—"} kg
                        <span className="text-xs text-[#6B6560] ml-1">/ mo</span>
                      </p>
                    </div>
                    <div>
                      <p className={LABEL_CLS + " mb-0.5"}>Goal date</p>
                      <p className="text-sm">{recPlan.goalDate ?? "—"}</p>
                    </div>
                  </div>
                )}
                {goalMode === "maintenance" && (
                  <div className="border-t border-[#1C1714]/10 pt-3">
                    <p className={LABEL_CLS + " mb-0.5"}>Maintenance</p>
                    <p className="text-sm tabular-nums">{recPlan.tdee.toLocaleString()} kcal / day</p>
                  </div>
                )}
              </div>

              {/* ── ADJUST YOUR PLAN block ── */}
              {goalMode !== "maintenance" && (
                <div className="border border-[#1C1714]/30 p-5 space-y-4" data-testid="panel-planner">
                  <p className={LABEL_CLS}>Adjust your plan</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL_CLS + " block mb-2"}>Months to goal</label>
                      <div className="flex border border-[#1C1714]/40 h-14">
                        <button
                          type="button"
                          data-testid="button-months-dec"
                          onClick={() => setPlanMonths(Math.max(minMonths, localMonths - 1))}
                          disabled={localMonths <= minMonths}
                          className="px-3 border-r border-[#1C1714]/20 hover:bg-[#1C1714]/5 text-lg font-bold transition-colors shrink-0 select-none disabled:opacity-20 disabled:cursor-not-allowed"
                        >−</button>
                        <div className="flex-1 h-full flex items-center justify-center text-3xl tabular-nums font-['Space_Mono'] text-[#1C1714]">
                          {localMonths}
                        </div>
                        <button
                          type="button"
                          data-testid="button-months-inc"
                          onClick={() => setPlanMonths(localMonths + 1)}
                          className="px-3 border-l border-[#1C1714]/20 hover:bg-[#1C1714]/5 text-lg font-bold transition-colors shrink-0 select-none"
                        >+</button>
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLS + " block mb-2"}>Daily calories</label>
                      <div className="flex items-center justify-center h-14 border border-[#1C1714]/20 bg-[#1C1714]/[0.03]">
                        <span className="text-3xl tabular-nums font-['Space_Mono'] text-[#1C1714]">
                          {adjustedCalorie.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-[#6B6560] mt-1">kcal / day</p>
                    </div>
                  </div>

                  <div className="flex gap-8 pt-1 border-t border-[#1C1714]/10">
                    <div>
                      <p className={LABEL_CLS + " mb-0.5"}>Monthly</p>
                      <p className="text-sm tabular-nums">
                        ~{monthlyRate.toFixed(1)} kg
                        <span className="text-xs text-[#6B6560] ml-1">/ mo</span>
                      </p>
                    </div>
                    <div>
                      <p className={LABEL_CLS + " mb-0.5"}>Goal date</p>
                      <p className="text-sm">{goalDateFromMonths(localMonths)}</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                data-testid="button-onboard-start"
                onClick={() => {
                  const finalCalorie = goalMode !== "maintenance" ? adjustedCalorie : recPlan.tdee;
                  saveMutation.mutate({
                    goalMode,
                    sexAtBirth: sex,
                    ageYears: parseInt(age),
                    heightCm: parseInt(heightCm),
                    startingWeightKg: parseFloat(currentWeightKg),
                    currentWeightKg: parseFloat(currentWeightKg),
                    goalWeightKg: goalMode !== "maintenance" ? parseFloat(goalWeightKg) : null,
                    activityLevel,
                    dailyCalorieGoal: finalCalorie,
                    journeyStartDate: todayStr(),
                    workoutCountingMode: "include_in_activity_level",
                  });
                }}
                disabled={saveMutation.isPending}
                className={BTN + " bg-[#1C1714] text-[#F2EDE7] hover:bg-[#2e2420] disabled:opacity-50"}
              >
                {saveMutation.isPending ? "Saving…" : "Start tracking →"}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

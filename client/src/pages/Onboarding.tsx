import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { computeBMR, computeTDEE } from "@/lib/calorieflow";
import { ACTIVITY_MULTIPLIERS } from "@shared/schema";
import logoPath from "@assets/logo_leaf_flame.png";

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

  function handleNext() {
    if (step === 2) {
      const errs = validateStep2();
      if (errs.length) { setErrors(errs); return; }
      setErrors([]);
    }
    setStep((s) => Math.min(s + 1, 4) as 1 | 2 | 3 | 4);
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3 | 4);
  }

  function handleStart() {
    const { dailyTarget } = getPlan();
    saveMutation.mutate({
      goalMode,
      sexAtBirth: sex,
      ageYears: parseInt(age),
      heightCm: parseInt(heightCm),
      startingWeightKg: parseFloat(currentWeightKg),
      currentWeightKg: parseFloat(currentWeightKg),
      goalWeightKg: goalMode !== "maintenance" ? parseFloat(goalWeightKg) : null,
      activityLevel,
      dailyCalorieGoal: dailyTarget,
      journeyStartDate: todayStr(),
      workoutCountingMode: "include_in_activity_level",
    });
  }

  const plan = step === 4 ? getPlan() : null;

  const LABEL_CLS = "text-xs uppercase tracking-widest text-[#6B6560] font-['Space_Mono']";
  const BTN = "w-full py-3 text-xs uppercase tracking-widest font-['Space_Mono'] font-bold transition-colors";

  return (
    <div className="min-h-screen bg-[#F2EDE7] flex flex-col items-center justify-start px-4 py-10 font-['Space_Mono'] text-[#1C1714]">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div
            className="h-9 w-9 overflow-hidden flex-shrink-0"
            style={{ borderRadius: "50%", background: "#1C1714" }}
          >
            <img
              src={logoPath}
              alt="CalorieFlow"
              className="h-full w-full object-cover"
            />
          </div>
          <span className="text-sm font-bold tracking-widest uppercase">CalorieFlow</span>
        </div>

        {/* Progress bar */}
        <StepBar step={step} />

        {/* Step label */}
        <div className={LABEL_CLS + " mb-6"}>Step {step} / {STEP_COUNT}</div>

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
            <button
              type="button"
              onClick={handleBack}
              data-testid="button-onboard-back-2"
              className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#6B6560] mb-6 hover:text-[#1C1714] transition-colors"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold mb-2">Tell us about you</h1>
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
            <button
              type="button"
              onClick={handleBack}
              data-testid="button-onboard-back-3"
              className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#6B6560] mb-6 hover:text-[#1C1714] transition-colors"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold mb-2">How much do you walk?</h1>
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
        {step === 4 && plan && (
          <div>
            <button
              type="button"
              onClick={handleBack}
              data-testid="button-onboard-back-4"
              className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#6B6560] mb-6 hover:text-[#1C1714] transition-colors"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold mb-2">Your plan is ready</h1>

            {/* Main target card */}
            <div className="border border-[#1C1714] p-6 mb-4 mt-6">
              <div className={LABEL_CLS + " mb-1"}>Daily target</div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-4xl font-bold" data-testid="text-plan-target">
                  {plan.dailyTarget.toLocaleString()}
                </span>
                <span className="text-sm text-[#6B6560]">kcal / day</span>
              </div>
              <div className="text-xs text-[#6B6560]">
                maintenance {plan.tdee.toLocaleString()}
                {goalMode === "weight_loss" && ` − ${plan.deficit}`}
                {goalMode === "weight_gain" && ` + ${plan.deficit}`}
              </div>
            </div>

            {/* Stats row */}
            {goalMode !== "maintenance" && (
              <div className="grid grid-cols-3 border border-[#1C1714]/20 mb-6">
                <div className="p-4 border-r border-[#1C1714]/20">
                  <div className={LABEL_CLS + " mb-1"}>{goalMode === "weight_loss" ? "Lose" : "Gain"}</div>
                  <div className="text-xl font-bold">{plan.weightDiff.toFixed(1)}</div>
                  <div className="text-xs text-[#6B6560]">kg</div>
                </div>
                <div className="p-4 border-r border-[#1C1714]/20">
                  <div className={LABEL_CLS + " mb-1"}>Timeline</div>
                  <div className="text-xl font-bold">~{plan.months ?? "—"}</div>
                  <div className="text-xs text-[#6B6560]">months</div>
                </div>
                <div className="p-4">
                  <div className={LABEL_CLS + " mb-1"}>Goal</div>
                  <div className="text-base font-bold leading-tight">{plan.goalDate ?? "—"}</div>
                </div>
              </div>
            )}

            {/* ── Change your plan ── */}
            {goalMode !== "maintenance" && (
              <div className="border border-[#1C1714]/20 mb-8">
                <div className="px-5 py-3 border-b border-[#1C1714]/20">
                  <span className={LABEL_CLS}>Change your plan</span>
                </div>
                <div className="p-4">
                  <p className="text-xs text-[#6B6560] mb-4">
                    Choose how fast you want to progress. A slower pace is easier to sustain.
                  </p>
                  <div className="flex flex-col gap-2">
                    {(["gentle", "moderate", "aggressive"] as Pace[]).map((p) => {
                      const preview = getPlan(p);
                      const sign = goalMode === "weight_loss" ? "−" : "+";
                      return (
                        <button
                          key={p}
                          type="button"
                          data-testid={`option-pace-${p}`}
                          onClick={() => setPace(p)}
                          className="flex items-center justify-between px-4 py-3 border text-left transition-all"
                          style={{
                            borderColor: pace === p ? "#1C1714" : "rgba(28,23,20,0.2)",
                            background: pace === p ? "#1C1714" : "transparent",
                            color: pace === p ? "#F2EDE7" : "#1C1714",
                          }}
                        >
                          <div>
                            <div className="text-xs font-bold uppercase tracking-widest capitalize">{p}</div>
                            <div
                              className="text-xs mt-0.5"
                              style={{ opacity: pace === p ? 0.65 : 0.5 }}
                            >
                              {sign}{PACE_DEFICIT[p]} kcal/day from maintenance
                            </div>
                          </div>
                          <div className="text-right ml-4 flex-shrink-0">
                            <div className="text-sm font-bold">{preview.dailyTarget.toLocaleString()}</div>
                            <div className="text-xs" style={{ opacity: 0.6 }}>
                              kcal · ~{preview.months ?? "—"} mo
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              data-testid="button-onboard-start"
              onClick={handleStart}
              disabled={saveMutation.isPending}
              className={BTN + " bg-[#1C1714] text-[#F2EDE7] hover:bg-[#2e2420] disabled:opacity-50 mb-4"}
            >
              {saveMutation.isPending ? "Saving…" : "Start tracking"}
            </button>

            <p className="text-xs text-center text-[#6B6560]">
              You can fine-tune everything in{" "}
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="underline hover:text-[#1C1714]"
              >
                Settings
              </button>{" "}
              anytime.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

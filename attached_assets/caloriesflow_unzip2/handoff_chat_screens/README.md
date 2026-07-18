# CalorieFlow — Handoff: AI Chat Screens (3a, 3b)

Incremental handoff for the Replit dev agent. Implement ONLY what's described here — the rest of the app already exists. Open \`Chat Screens.dc.html\` in a browser to see both screens pixel-accurately (device bezel is presentation chrome, not part of the app).

## Scope
Two screens, both dark-mode AI chat UIs sharing the same layout skeleton (header / scrollable message list / composer):

### 3a — Log Meal, ingredient breakdown reply (\`/log\`) — CHANGED
Existing screen, updated AI reply. The assistant response now has TWO parts:
1. **Explanation text bubble** (subtle bg \`rgba(242,237,231,0.06)\`): a short sentence breaking the meal into ingredients with estimated per-person portion weights and kcal, personalized from the user's profile (weight/BMI from Settings). Example copy: "Portion sized for your profile (76 kg): chicken 150 g ≈ 248 kcal, rice 160 g ≈ 208 kcal, broccoli 100 g ≈ 34 kcal, oil ≈ 30 kcal. Total ≈ **520 kcal**."
2. **Meal card** (1px border \`rgba(242,237,231,0.25)\`): unchanged — meal-type label, description, 4-col Kcal/PRO/CARB/FAT grid, meal-type select, "Log this meal" CTA.

Backend note: the LLM prompt should return per-ingredient {name, grams, kcal} sized for one serving using the user's stored weight and BMI, plus the total.

### 3b — Add Activity, AI chat (\`/activity\`) — NEW
Entered from Dashboard's "Add Activity" button. Same chat pattern as Log Meal:
- Header: Back link, title "Add Activity", right side shows today's burned total (−320 kcal today / burned so far).
- User bubble: free-text activity ("Ran 5 km in about 30 minutes").
- AI reply, two parts mirroring 3a:
  1. **Explanation bubble** stating WHY it's n kcal — the MET formula, short: "Running 5 km at ~10 km/h ≈ 8 METs. At your weight (76 kg) that's 8 × 76 × 0.5 h ≈ **304 kcal**."
  2. **Activity card**: label "Activity", summary line "Running · 5 km · 30 min", 3-col grid Kcal (−304) / Time (30m) / METs (8.0), "Log this activity" CTA.
- Composer: single text input "Describe another activity…" + delete + send buttons (no camera on this screen).

## Design tokens (match existing app)
- Dark surface \`#1C1714\`, cream text \`#F2EDE7\`, muted text via rgba(242,237,231,0.5–0.85)
- Font: Space Mono (mono), uppercase 10–11px labels with 2px letter-spacing
- Square corners everywhere (no border-radius), 1px hairline borders
- Kcal accents: burns/negative \`#9B4A2E\` family on light surfaces; on dark use cream

## Out of scope
Everything else (Dashboard, Settings, Recipes, Progress, auth) is already implemented — do not touch.

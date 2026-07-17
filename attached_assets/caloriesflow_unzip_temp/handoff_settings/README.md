# Handoff: CalorieFlow — Settings Screen (updated)

## Scope
Only the **Settings page** (`/settings`, screen 1g) — the current mockup reflects the latest layout edits. Recreate it in the existing CaloriesFlow codebase (`Pauzenk/CaloriesFlow`: React + TypeScript, Vite, Wouter, TanStack Query v5, Shadcn/UI, Tailwind). The design file is an HTML reference, not production code.

## Screen: Settings — "Parameters"
Mobile layout, linen background `#F2EDE7`, ink `#1C1714`, Space Mono. Sections top to bottom:

1. **Header** — logo (32px square, `logo.png`) + "CalorieFlow" 16px bold; logout icon right.
2. **Language** — two toggle buttons (English active: `bg-[#1C1714] text-[#F2EDE7]`; Русский outlined).
3. **Body Metrics** — inputs: Start/Goal weight (kg), Height / Age / Sex (select), Journey start date; Activity Level list (3 rows, selected row inverted); BMI card (BMI value + category in amber `#b45309`, healthy range).
4. **Maintenance / Deficit card** — 2-col grid: Maintenance 2,340; Deficit −500 → 1,840 in terracotta `#9e4515`.
5. **Daily Target** — "Recommended" card (2px ink border): 1,840 kcal/day + Lose / Timeline / Monthly / Goal Date row; "Adjust Your Plan" card: months stepper (− 8 +) and computed daily calories.
6. **Save bar** — "Save Changes" outlined button + "Unsaved changes" hint.
7. **Danger Zone** — "Restart Journey" terracotta outlined button.
8. **Bottom tab bar** — Dashboard / Progress / Recipes / Settings (Settings active `#3c3a40`).

## Tokens
Linen `#F2EDE7`, ink `#1C1714`, muted `#6B6560`, border `#D4CFC8`, brand dark `#3c3a40`, terracotta `#9B4A2E`/`#9e4515`, amber `#b45309`. Space Mono 400/700; labels 10–11px uppercase, letter-spacing 1.5–2px; border radius 0; touch targets ≥44px.

## Files
- `Settings Screen.dc.html` — the mockup (open in a browser)
- `ios-frame.jsx`, `support.js` — viewer scaffolding, ignore for implementation
- `logo.png`

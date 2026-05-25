# CalorieFlow — Developer Documentation

## App Purpose

CalorieFlow is a mobile-friendly calorie and nutrition tracking web app. Users log meals, track weight, generate AI-powered daily meal plans, and visualize progress toward a weight goal. The app supports English and Russian. It is built for personal use but structured as a full-stack web application.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript, Vite, Wouter (routing), TanStack Query v5, Shadcn/UI, Tailwind CSS |
| Backend | Express 5 + tsx (TypeScript runtime), Passport.js (local + Google OAuth) |
| Database | PostgreSQL via Drizzle ORM |
| AI | OpenAI GPT-4o-mini (chat, food analysis, recipes), gpt-image-1 (recipe images) |
| Styling | Space Mono font, `#F2EDE7` linen background, `#1C1714` ink color |

---

## How to Run

```bash
npm run dev
```

This starts both the Express backend (port 5000) and the Vite frontend dev server on the same port. The workflow named `Start application` handles this automatically in Replit.

---

## How to Test After Changes

Go through this checklist manually after any significant change:

1. **First-time onboarding** — log out, create a new account, check redirect to Settings, fill in profile, verify calorie goal auto-calculates.
2. **Google login** — use the Google OAuth button on the login page (requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars).
3. **Day switching** — use the date arrows on Dashboard, verify meals change per day.
4. **Saved daily logs** — log a meal, navigate away, come back — meal should persist.
5. **Adding food through chat** — open Log Meal, type a meal description, verify the AI returns nutrient estimates and the "Log this meal" button works.
6. **Editing meal category** — tap a meal in the log, change its type (breakfast/lunch/dinner/snack), verify it saves.
7. **Recipes generation** — go to Recipes page, verify 4 cards load. Click "New Plan" and verify new meals appear.
8. **Recipe image loading** — images should appear progressively; on second visit to the page in the same session, they should appear instantly (session cache).
9. **Language switching** — toggle EN/RU in Settings, verify all text updates across pages.
10. **Dashboard navigation** — verify bottom tab bar works on mobile and sidebar works on desktop.
11. **Progress calculations** — add a weight entry, check that the projection chart updates.
12. **Settings calculations** — update height/weight/age/activity, verify TDEE and calorie goal recalculate correctly.
13. **Bottom tab bar on all pages** — Dashboard, Progress, Recipes, Settings all use AppShell and must show the tab bar on mobile.

---

## Main User Flows

### Registration / Login
- `/login` — AuthPage renders two tabs: Email/Password and Google OAuth.
- On first login, if the user has no height/weight/age set, they are redirected to `/settings`.

### Daily Logging
1. User opens Dashboard, sees today's calorie tally and food log.
2. User taps "Add entry" → goes to `/log` (LogMeal page).
3. LogMeal has a chat interface: user describes what they ate in natural language.
4. The AI returns structured nutrient data. User taps "Log this meal" to save.
5. Dashboard updates via TanStack Query cache invalidation.

### Recipes
1. User navigates to `/recipes`.
2. If no plan exists in localStorage, the app auto-generates a 4-meal plan via OpenAI.
3. Images load progressively in the background (session-cached after first load).
4. User can regenerate individual meals or the entire plan.
5. "Add full day to log" saves all 4 meals to the daily log and redirects to Dashboard.

### Weight Tracking
1. User logs weights in the Progress page.
2. The projection chart updates based on `dailyCalorieGoal` vs TDEE.

### Settings
1. User sets: name, sex, age, height, starting weight, goal weight, activity level.
2. App auto-selects goal mode (weight_loss / maintenance / weight_gain) based on goal vs starting weight.
3. TDEE is computed via Mifflin-St Jeor BMR × activity multiplier.
4. `dailyCalorieGoal` is saved: TDEE − 500 (loss), TDEE (maintenance), TDEE + 350 (gain).

---

## Page-by-Page Explanation

### `/` — Dashboard

**File:** `client/src/pages/Dashboard.tsx`

- Shows the selected day's calorie tally, progress bar, macros (PRO/CRB/FAT).
- Date navigation: arrows step one day forward/backward.
- Food/activity log below. Each entry can be edited (category) or deleted.
- "Add entry" button navigates to `/log?date=YYYY-MM-DD`.
- Data comes from `GET /api/meals?date=` and `GET /api/stats/dashboard?date=`.

### `/log` — Log Meal

**File:** `client/src/pages/LogMeal.tsx`

- Chat-based interface powered by SSE streaming from `/api/meals/chat`.
- User types a meal description; the AI responds with nutrient estimates.
- "Log this meal" button calls `POST /api/meals`.
- Photo analysis available via `POST /api/meals/analyze-photo`.

### `/progress` — Progress

**File:** `client/src/pages/Progress.tsx`

- Two charts: weight projection line chart (Recharts), calorie bar chart.
- Weight projection computed in `weightProjectionSeries()` in `calorieflow.ts`.
- Future weight modeled from `dailyCalorieGoal` vs computed TDEE.
- BMI panel, gap analysis (ahead/behind schedule), and estimated goal date.
- User can log weight entries from this page.

### `/recipes` — Recipes

**File:** `client/src/pages/Recipes.tsx`

- Uses `AppShell` for consistent navigation (sidebar + mobile tab bar).
- Recipe list saved to `localStorage` (without images) so the plan survives page refresh.
- Images cached in `sessionStorage` so they don't re-fetch within the same browser session.
- Full-screen detail view is a fixed overlay (z-50) that covers the tab bar.

### `/settings` — Settings

**File:** `client/src/pages/Settings.tsx`

- Profile form: sex, age, height, current weight, start weight, goal weight, activity level.
- BMI panel: computed from height + current/start weight. Shows value, category, healthy range.
- Calorie goal panel: shows mode-aware target (loss/maintenance/gain).
- Goal mode is auto-set by a `useEffect` watching `goalWeightKg` vs `startingWeightKg`.
- `dailyCalorieGoal` is saved to `user_settings` table on form submit.

---

## Weight Goal Modes

The app has three goal modes, auto-selected based on the user's starting and goal weight:

| Mode | Condition | Calorie Target |
|---|---|---|
| `weight_loss` | goal < start | TDEE − 500 kcal/day |
| `maintenance` | goal ≈ start (±0.1 kg) | TDEE (no surplus/deficit) |
| `weight_gain` | goal > start | TDEE + 350 kcal/day |

The mode is stored in the `goal_mode` column of `user_settings`. It drives the projection chart direction and calorie target display in Settings.

---

## Calorie Calculation Logic

### BMR (Mifflin-St Jeor)
```
Male:   BMR = 10×weight + 6.25×height − 5×age + 5
Female: BMR = 10×weight + 6.25×height − 5×age − 161
```

### TDEE
```
TDEE = BMR × activity_multiplier
```

Activity multipliers:
- Sedentary: 1.2
- Light: 1.375
- Moderate: 1.55
- Active: 1.725
- Very Active: 1.9

### Daily Calorie Goal
```
weight_loss:  goal = max(1200, TDEE − 500)
maintenance:  goal = TDEE
weight_gain:  goal = TDEE + 350
```

**File:** `client/src/lib/calorieflow.ts` — `computeBMR`, `computeTDEE`, `weightProjectionSeries`.

---

## BMI Recommendation Logic

BMI is computed as:
```
BMI = weight(kg) / (height(m))²
```

Categories: Underweight (<18.5), Normal (18.5–24.9), Overweight (25–29.9), Obese (≥30).

Healthy weight range is computed from height: `min = 18.5 × h²`, `max = 24.9 × h²`.

**File:** `client/src/lib/calorieflow.ts` — `computeBMI`, `getBMICategory`, `getHealthyWeightRange`.

---

## Weight Projection Logic

The projection series (`weightProjectionSeries`) builds a day-by-day weight estimate:

- **Past days**: uses actual logged calories to compute daily deficit/surplus.
- **Future days**: uses `dailyCalorieGoal` to project forward (not recent meal averages).
- Weight change: `dailyChange = deficit / 7700` (7700 kcal ≈ 1 kg of fat).
- Loop stops when projected weight reaches `goalWeightKg` or after 365 future days.
- Actual logged weight entries anchor the curve when available.

---

## Recipe Generation Logic

**Backend:** `POST /api/recipes/generate` in `server/routes.ts`

1. Computes per-meal calorie targets: Breakfast 25%, Lunch 35%, Dinner 30%, Snack 10%.
2. Picks a random cuisine style.
3. Sends a structured prompt to `gpt-4o-mini` requesting a JSON meal plan.
4. `recentMeals` list is passed to the AI to avoid repeating dishes.
5. For single-meal regeneration, `currentPlan` is included so only that meal changes.

**Image generation:** `GET /api/recipes/image?name=...`
- Uses `gpt-image-1` model.
- Server-side in-memory cache (Map) keyed by lowercase meal name — avoids re-generating the same image across requests.
- Client-side sessionStorage cache — avoids re-fetching images on same-session page reload.

---

## Data Saving Logic

All persistent data lives in PostgreSQL via Drizzle ORM.

| Data | Table | Notes |
|---|---|---|
| Users | `users` | email + hashed password or Google ID |
| Meal logs | `meals` | per-user, per-date |
| Activity logs | `activities` | per-user, per-date |
| Weight entries | `weights` | per-user, per-date |
| Settings/Goals | `user_settings` | one row per user |

Recipe plans are **not** stored in the database. They are saved to `localStorage` (plan structure without images) and sessionStorage (images). This means plans reset if the user clears browser storage.

---

## Language Logic

**File:** `client/src/lib/i18n.ts`, `client/src/contexts/LanguageContext.tsx`

- Two languages supported: English (`en`) and Russian (`ru`).
- Language preference saved to `localStorage` under key `cf-lang`.
- The `useLanguage()` hook provides `t(key)` and `lang` throughout the app.
- All UI strings go through `t()`. Language switch in Settings page updates immediately.
- Recipe generation sends `language` param to the backend so the AI responds in the right language.

---

## Google Authentication Setup

Requires two environment secrets in Replit:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

**Backend:** `server/auth.ts` uses `passport-google-oauth20`.

**Callback URL:** `https://<your-domain>/api/auth/google/callback`

For local development, set the callback URL in Google Cloud Console to your Replit dev URL. For production, use the `.replit.app` domain.

The frontend checks `GET /api/auth/providers` to decide whether to show the Google login button.

---

## Known Issues / Things to Check

1. **Recipe images on server restart** — the server-side image cache is in-memory. If the server restarts, images must be re-generated (one OpenAI call per meal name). The client sessionStorage cache persists within the browser session.
2. **Goal mode initialization** — if a user has no goal weight set, the auto-mode logic doesn't fire. The default is `weight_loss`. Users should set both start and goal weight in Settings.
3. **Recipe plan language** — the plan is generated in the language active at generation time. If the user switches language afterward, meal names remain in the original language.
4. **localStorage plan staleness** — if a user doesn't visit the Recipes page for a long time, the saved plan may have outdated calorie targets. Clicking "New Plan" regenerates fresh.
5. **Maintenance mode projection** — the projection line is flat (zero deficit). This is correct but may look broken to users who expect to see a line moving.

---

## Project File Structure

```
client/
  src/
    pages/          Dashboard, LogMeal, Progress, Recipes, Settings, AuthPage
    components/     AppShell (layout+nav), MealChat (AI chat)
    lib/            calorieflow.ts (math), i18n.ts (translations), queryClient.ts
    contexts/       LanguageContext, AuthContext (via hooks)
    hooks/          use-auth, use-toast
server/
  index.ts          Express app entry point
  routes.ts         All API routes (meals, settings, recipes, AI)
  auth.ts           Passport setup (local + Google)
  storage.ts        IStorage interface + DbStorage (Drizzle)
shared/
  schema.ts         Drizzle table definitions + Zod schemas (source of truth)
  foods.ts          Static food database for autocomplete
```

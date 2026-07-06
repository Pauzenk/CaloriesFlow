---
name: Chart x-axis daily migration
description: threeLineWeightSeries switched from week-indexed buckets to daily date strings; how Progress.tsx must wire the new shape.
---

## Rule
`threeLineWeightSeries` returns `ThreeLinePoint[]` where each point's x-axis key is `date: string` (YYYY-MM-DD), not `weekIdx: number` or `week: string`.

Past data: one point per day (daily resolution).  
Future data: one point per weekly milestone only (keeps series size manageable).

Return shape: `{ points, projectedGoalDate, currentRealKg, lastLoggedKg, todayDate, tickDates }`.
- `todayDate` — YYYY-MM-DD string for the TODAY `<ReferenceLine x={todayDate}>`.
- `tickDates` — array of weekly boundary date strings passed to `<XAxis ticks={tickDates}>`.

**Why:** Weekly bucketing averaged same-week logged weights together, hiding individual steps and producing at most one visible dot per 7-day period. Daily resolution means every logged date gets its own point and its own dot marker.

**How to apply:**
- XAxis: `dataKey="date"`, `ticks={tickDates}`, `tickFormatter` with `new Date(d + "T00:00:00").toLocaleDateString(...)`, `interval={0}`, `minTickGap={40}`.
- Tooltip / detail panel: format `pt.date` with `toLocaleDateString` — do NOT reference `pt.week` or `pt.weekIdx` (they no longer exist).
- `selectedWeekKey` state: `string | null` (holds a date string), not `number | null`.

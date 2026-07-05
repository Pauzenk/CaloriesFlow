import { pool } from "./db";

export async function runMigrations() {
  await pool.query(`
    ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS workout_counting_mode text NOT NULL DEFAULT 'include_in_activity_level'
  `);
  // Migrate legacy 4-level activity enum to new 3-level lifestyle enum
  await pool.query(`
    UPDATE settings
    SET activity_level = CASE
      WHEN activity_level = 'lightly_active'   THEN 'light'
      WHEN activity_level = 'moderately_active' THEN 'active'
      WHEN activity_level = 'very_active'       THEN 'active'
      ELSE activity_level
    END
    WHERE activity_level IN ('lightly_active', 'moderately_active', 'very_active')
  `);
}

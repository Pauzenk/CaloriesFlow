import { pool } from "./db";

export async function runMigrations() {
  await pool.query(`
    ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS workout_counting_mode text NOT NULL DEFAULT 'include_in_activity_level'
  `);
}

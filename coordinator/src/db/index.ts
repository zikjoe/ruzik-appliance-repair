import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = process.env.COORDINATOR_DB_PATH ?? path.join(DB_DIR, 'coordinator.db');
const SCHEMA_PATH = path.resolve(__dirname, '../../db/schema.sql');

mkdirSync(DB_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

/** Seed a single default technician (the owner) if the table is empty, so the
 * pilot has something to schedule against on day one. */
export function seedIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) as n FROM technicians').get() as { n: number }).n;
  if (count === 0) {
    db.prepare(
      `INSERT INTO technicians (name, phone, skills, zones, active)
       VALUES (?, ?, ?, ?, 1)`
    ).run(
      'Isaac-Josiah Olumor',
      '678-824-5161',
      JSON.stringify(['dryer', 'dishwasher', 'washer', 'stove', 'microwave', 'microwave_built_in', 'refrigerator', 'other']),
      JSON.stringify(['*'])
    );
  }
}

seedIfEmpty();

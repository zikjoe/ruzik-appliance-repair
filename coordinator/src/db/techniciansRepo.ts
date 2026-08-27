import { db } from './index.js';
import type { TechnicianRow } from './types.js';

export function listActive(): TechnicianRow[] {
  return db.prepare(`SELECT * FROM technicians WHERE active = 1`).all() as TechnicianRow[];
}

export function count(): number {
  return (db.prepare(`SELECT COUNT(*) as n FROM technicians`).get() as { n: number }).n;
}

export function seed(fields: { name: string; phone: string; skills: string[]; zones: string[] }): void {
  db.prepare(
    `INSERT INTO technicians (name, phone, skills, zones, active) VALUES (?, ?, ?, ?, 1)`
  ).run(fields.name, fields.phone, JSON.stringify(fields.skills), JSON.stringify(fields.zones));
}

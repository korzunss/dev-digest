import { gte } from 'drizzle-orm';
import * as t from '../../db/schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfWeek(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const shift = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - shift * DAY_MS);
}

export function reviewedSince(weekStart: Date) {
  return gte(t.reviews.createdAt, weekStart);
}

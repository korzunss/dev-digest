// DEMO for the Smart Diff manual check (spec 007) — not wired into the app.
// Delete together with the demo commit.
import { DEFAULT_LIMITS } from './limits.generated.js';

export interface LimitRequest {
  headers: Record<string, string | undefined>;
  ip: string;
  path: string;
}

export interface LimitResult {
  allowed: boolean;
  status: number;
  remaining: number;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientKey(req: LimitRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : req.ip;
  return `${ip}:${req.path}`;
}

export function limitFor(path: string): number {
  return DEFAULT_LIMITS[path] ?? DEFAULT_LIMITS['*']!;
}

export function checkRateLimit(req: LimitRequest, now: number = Date.now()): LimitResult {
  const key = clientKey(req);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 3600 * 1000 });
    return { allowed: true, status: 200, remaining: limitFor(req.path) - 1 };
  }

  bucket.count += 1;
  const limit = limitFor(req.path);
  if (bucket.count > limit) {
    return { allowed: false, status: 429, remaining: 0 };
  }
  return { allowed: true, status: 200, remaining: limit - bucket.count };
}

export function resetRateLimits(): void {
  buckets.clear();
}

export const DEFAULT_PASS_SCORE = 70;

export function passScore(): number {
  const raw = process.env.DEVDIGEST_PASS_SCORE;
  if (raw === undefined || raw.trim() === '') return DEFAULT_PASS_SCORE;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : DEFAULT_PASS_SCORE;
}

import { SUPPORTED_EXT, isBlastTestPath } from '../repo-intel/constants.js';
import type { Hotspot } from './types.js';

export function isRankable(path: string): boolean {
  if (isBlastTestPath(path)) return false;
  return SUPPORTED_EXT.some((ext) => path.endsWith(ext));
}

export function hotspotScore(commits: number, percentile: number, symbols: number): number {
  return Math.round(commits * (0.5 + percentile / 200) * Math.log2(2 + symbols) * 10) / 10;
}

export function byScore(a: Hotspot, b: Hotspot): number {
  return b.score - a.score || a.path.localeCompare(b.path);
}

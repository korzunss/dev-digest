import { simpleGit } from 'simple-git';
import type { ChurnReader, PathChurn } from '@devdigest/shared';
import { HOTSPOT_LIMIT } from '../../modules/hotspots/constants.js';

export class GitChurnReader implements ChurnReader {
  async commitsPerPath(clonePath: string, days: number): Promise<PathChurn[]> {
    const raw = await simpleGit(clonePath).raw([
      'log',
      `--since=${days}.days`,
      '--name-only',
      '--pretty=format:',
    ]);
    const counts = new Map<string, number>();
    for (const line of raw.split('\n')) {
      const path = line.trim();
      if (path) counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([path, commits]) => ({ path, commits }))
      .sort((a, b) => b.commits - a.commits)
      .slice(0, HOTSPOT_LIMIT * 4);
  }
}

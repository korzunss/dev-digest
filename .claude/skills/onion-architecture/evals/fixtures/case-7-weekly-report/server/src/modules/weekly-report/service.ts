import type { RepoRef, SecretsProvider, WeeklyReport } from '@devdigest/shared';
import { renderMarkdownTable } from '@devdigest/shared';
import { toRepoRef } from '../../platform/forge-resolve.js';
import { forgeClientFor } from '../_shared/forge-client.js';
import { reviewedSince, startOfWeek } from '../_shared/week.js';
import { REPORT_HEADER } from './constants.js';
import { toReportRow, toTableCells } from './helpers.js';
import type { WeeklyReportRepository } from './repository.js';
import { summarizeWeek } from './summary.js';
import type { ReportRepoIntel, WeeklyRepoStats } from './types.js';

export interface WeeklyReportServiceDeps {
  repo: WeeklyReportRepository;
  secrets: SecretsProvider;
  repoIntel: ReportRepoIntel;
  now?: () => Date;
}

export class WeeklyReportService {
  constructor(private readonly deps: WeeklyReportServiceDeps) {}

  async build(workspaceId: string): Promise<WeeklyReport> {
    const weekStart = startOfWeek(this.deps.now?.() ?? new Date());
    const stats = await this.deps.repo.statsByRepo(workspaceId, reviewedSince(weekStart));

    const rows = [];
    for (const s of stats) {
      const state = await this.deps.repoIntel.getIndexState(s.repoId);
      rows.push(toReportRow(s, await this.openPulls(s), !state.degraded && state.lastIndexedSha !== ''));
    }
    const markdown = renderMarkdownTable(REPORT_HEADER, rows.map(toTableCells));

    const key = await this.deps.secrets.get('ANTHROPIC_API_KEY');
    const summary = key && rows.length > 0 ? await summarizeWeek(key, markdown) : null;
    return { weekStart: weekStart.toISOString().slice(0, 10), rows, markdown, summary };
  }

  private async openPulls(stats: WeeklyRepoStats): Promise<number> {
    const ref: RepoRef = toRepoRef(stats);
    const token = await this.deps.secrets.get('GITHUB_TOKEN');
    if (!token) return 0;
    const pulls = await forgeClientFor(ref, token).listPullRequests(ref);
    return pulls.filter((p) => p.state === 'open').length;
  }
}

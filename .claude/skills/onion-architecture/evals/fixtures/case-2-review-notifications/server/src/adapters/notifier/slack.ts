import { WebClient, type ChatPostMessageArguments, type ChatPostMessageResponse } from '@slack/web-api';
import type { ReviewNotice, SlackNotifier } from '@devdigest/shared';
import { withRetry } from '../../platform/resilience.js';
import { taskLine } from '../../modules/reviews/helpers.js';

export class SlackWebNotifier implements SlackNotifier {
  readonly client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  postMessage(args: ChatPostMessageArguments): Promise<ChatPostMessageResponse> {
    return withRetry(() => this.client.chat.postMessage(args));
  }

  async notifyReviewComplete(channel: string, notice: ReviewNotice): Promise<void> {
    const headline = taskLine({ number: notice.pullNumber, title: notice.title } as Parameters<typeof taskLine>[0]);
    const score = notice.score === null ? 'no score' : `score ${notice.score}`;
    const critical = notice.critical > 0 ? ` · ${notice.critical} critical` : '';
    await this.postMessage({
      channel,
      text: `${notice.repo} ${headline} — ${score}${critical}\n${notice.url}`,
      unfurl_links: false,
    });
  }
}

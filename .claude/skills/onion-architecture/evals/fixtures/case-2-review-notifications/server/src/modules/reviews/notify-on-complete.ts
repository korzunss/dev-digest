import type { Container } from '../../platform/container.js';
import type { ReviewNotice } from '@devdigest/shared';

export interface CompletedReview {
  repoFullName: string;
  pullNumber: number;
  title: string;
  score: number | null;
  critical: number;
  url: string;
}

export async function notifyOnComplete(container: Container, review: CompletedReview): Promise<void> {
  const channel = await container.secrets.get('SLACK_REVIEW_CHANNEL');
  if (!channel) return;
  const notifier = await container.notifier();
  if (!notifier) return;

  const notice: ReviewNotice = {
    repo: review.repoFullName,
    pullNumber: review.pullNumber,
    title: review.title,
    score: review.score,
    critical: review.critical,
    url: review.url,
  };
  await notifier.notifyReviewComplete(channel, notice);
}

import type { ChatPostMessageArguments, ChatPostMessageResponse, WebClient } from '@slack/web-api';

export interface ReviewNotice {
  repo: string;
  pullNumber: number;
  title: string;
  score: number | null;
  critical: number;
  url: string;
}

export interface SlackNotifier {
  readonly client: WebClient;
  postMessage(args: ChatPostMessageArguments): Promise<ChatPostMessageResponse>;
  notifyReviewComplete(channel: string, notice: ReviewNotice): Promise<void>;
}

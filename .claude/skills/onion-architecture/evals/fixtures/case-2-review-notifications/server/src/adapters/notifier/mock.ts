import type { ChatPostMessageArguments, ChatPostMessageResponse, WebClient } from '@slack/web-api';
import type { ReviewNotice, SlackNotifier } from '@devdigest/shared';

export class MockSlackNotifier implements SlackNotifier {
  readonly client = {} as WebClient;
  readonly sent: { channel: string; notice: ReviewNotice }[] = [];

  async postMessage(_args: ChatPostMessageArguments): Promise<ChatPostMessageResponse> {
    return { ok: true };
  }

  async notifyReviewComplete(channel: string, notice: ReviewNotice): Promise<void> {
    this.sent.push({ channel, notice });
  }
}

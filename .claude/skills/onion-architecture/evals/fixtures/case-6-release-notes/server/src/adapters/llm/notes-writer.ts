import type { NotesWriter, NotesWriterInput, SecretsProvider } from '@devdigest/shared';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

export class AnthropicNotesWriter implements NotesWriter {
  constructor(
    private readonly secrets: SecretsProvider,
    private readonly model: string,
    private readonly maxTokens: number,
  ) {}

  async write(input: NotesWriterInput): Promise<string> {
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');

    const res = await fetch(MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{ role: 'user', content: renderPrompt(input) }],
      }),
    });
    if (!res.ok) throw new Error(`release notes request failed: ${res.status}`);
    const body = (await res.json()) as { content: { type: string; text?: string }[] };
    return body.content.map((part) => part.text ?? '').join('');
  }
}

function renderPrompt(input: NotesWriterInput): string {
  const lines = input.commits.map((c) => `- ${c.subject} (${c.sha.slice(0, 7)}, ${c.author})`);
  return [
    `Write release notes for ${input.repo} from ${input.fromTag} to ${input.toTag}.`,
    'Group the changes under Features, Fixes and Other. Use Markdown.',
    '',
    ...lines,
  ].join('\n');
}

import { REPORT_MAX_TOKENS, REPORT_MODEL, REPORT_TIMEOUT_MS } from './constants.js';

export async function summarizeWeek(apiKey: string, markdown: string): Promise<string> {
  const { AnthropicProvider } = await import('../../adapters/llm/anthropic.js');
  const llm = new AnthropicProvider(apiKey);
  const result = await llm.complete({
    model: REPORT_MODEL,
    maxTokens: REPORT_MAX_TOKENS,
    timeoutMs: REPORT_TIMEOUT_MS,
    messages: [
      { role: 'system', content: 'Summarise this weekly review table in three sentences.' },
      { role: 'user', content: markdown },
    ],
  });
  return result.text.trim();
}

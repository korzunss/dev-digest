import { describe, it, expect } from 'vitest';
import {
  LatestMultiAgentRun,
  MultiAgentOverallStatus,
  MultiAgentRunRequest,
} from '@devdigest/shared';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('MultiAgentRunRequest', () => {
  it('rejects null, an empty object and an empty id list', () => {
    expect(MultiAgentRunRequest.safeParse(null).success).toBe(false);
    expect(MultiAgentRunRequest.safeParse({}).success).toBe(false);
    expect(MultiAgentRunRequest.safeParse({ agent_ids: [] }).success).toBe(false);
  });

  it('rejects 21 ids and a non-uuid id', () => {
    const many = Array.from({ length: 21 }, (_, i) => uuid(i));
    expect(MultiAgentRunRequest.safeParse({ agent_ids: many }).success).toBe(false);
    expect(MultiAgentRunRequest.safeParse({ agent_ids: ['not-a-uuid'] }).success).toBe(false);
  });

  // a non-object body, a non-array id list or a non-string id never parses
  it('rejects non-object bodies and malformed id lists', () => {
    for (const bad of ['agent', 42, [uuid(1)], { agent_ids: uuid(1) }, { agent_ids: [uuid(1), 7] }, { agent_ids: [null] }]) {
      expect(MultiAgentRunRequest.safeParse(bad).success).toBe(false);
    }
  });

  it('accepts 1 and 20 ids', () => {
    expect(MultiAgentRunRequest.safeParse({ agent_ids: [uuid(1)] }).success).toBe(true);
    const twenty = Array.from({ length: 20 }, (_, i) => uuid(i));
    expect(MultiAgentRunRequest.safeParse({ agent_ids: twenty }).success).toBe(true);
  });
});

describe('MultiAgentOverallStatus', () => {
  it('accepts the four statuses only', () => {
    for (const ok of ['running', 'done', 'partially_failed', 'failed']) {
      expect(MultiAgentOverallStatus.safeParse(ok).success).toBe(true);
    }
    for (const bad of ['cancelled', 'partial', '', null, 1]) {
      expect(MultiAgentOverallStatus.safeParse(bad).success).toBe(false);
    }
  });
});

describe('LatestMultiAgentRun', () => {
  it('accepts { run: null } and rejects a missing run key', () => {
    expect(LatestMultiAgentRun.safeParse({ run: null }).success).toBe(true);
    expect(LatestMultiAgentRun.safeParse({}).success).toBe(false);
  });
});

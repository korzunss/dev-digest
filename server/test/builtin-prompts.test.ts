import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  API_CONTRACT_REVIEWER_PROMPT,
  BUILTIN_AGENT_PROMPTS,
  GENERAL_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  SEVERITY_SECTION,
  TEST_QUALITY_REVIEWER_PROMPT,
} from '../src/db/seed-prompts.js';
import { NODE_TS_SKILL_AGENTS, NODE_TYPESCRIPT_SKILL } from '../src/db/seed-skills.js';

const ALL = {
  'General Reviewer': GENERAL_REVIEWER_PROMPT,
  'Security Reviewer': SECURITY_REVIEWER_PROMPT,
  'Performance Reviewer': PERFORMANCE_REVIEWER_PROMPT,
  'Test Quality Reviewer': TEST_QUALITY_REVIEWER_PROMPT,
  'API Contract Reviewer': API_CONTRACT_REVIEWER_PROMPT,
} as const;

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe('built-in reviewer prompts', () => {
  it('BUILTIN_AGENT_PROMPTS holds exactly the five seed names', () => {
    expect(Object.keys(BUILTIN_AGENT_PROMPTS).sort()).toEqual(Object.keys(ALL).sort());
    for (const [name, prompt] of Object.entries(ALL)) {
      expect(BUILTIN_AGENT_PROMPTS[name]).toBe(prompt);
    }
  });

  describe.each(Object.entries(ALL))('%s', (name, prompt) => {
    it('contains the shared severity section exactly once', () => {
      expect(count(prompt, SEVERITY_SECTION)).toBe(1);
      expect(count(prompt, '# Severity — use exactly these three levels')).toBe(1);
    });

    it('has a lane section naming the other four reviewers', () => {
      expect(count(prompt, '# Your lane')).toBe(1);
      const lane = prompt.slice(prompt.indexOf('# Your lane'), prompt.indexOf('# ', prompt.indexOf('# Your lane') + 1));
      for (const other of Object.keys(ALL).filter((n) => n !== name)) {
        expect(lane).toContain(other);
      }
      expect(lane).not.toContain(`- ${name}:`);
      expect(lane).toContain('not even as a SUGGESTION');
    });

    it('says an empty review is fine', () => {
      expect(prompt).toContain('empty findings list');
    });
  });

  describe('stack-neutral prompts (plan 44)', () => {
    const NEUTRAL = {
      'General Reviewer': GENERAL_REVIEWER_PROMPT,
      'Performance Reviewer': PERFORMANCE_REVIEWER_PROMPT,
      'Test Quality Reviewer': TEST_QUALITY_REVIEWER_PROMPT,
      'API Contract Reviewer': API_CONTRACT_REVIEWER_PROMPT,
    } as const;

    it.each(Object.entries(NEUTRAL))('%s names no stack', (_name, prompt) => {
      for (const word of ['Stack context', 'Fastify', 'Drizzle', 'Node.js', 'forEach']) {
        expect(prompt).not.toContain(word);
      }
      expect(prompt).toContain('# Stack conventions');
    });

    it('the JS/TS items moved into node-typescript-review', () => {
      expect(NODE_TYPESCRIPT_SKILL.body).toContain('forEach');
      expect(NODE_TYPESCRIPT_SKILL.body).toContain('??');
      for (const word of ['Fastify', 'Drizzle', '@devdigest', 'testcontainers', 'p-queue', 'octokit']) {
        expect(NODE_TYPESCRIPT_SKILL.body).not.toContain(word);
        expect(NODE_TYPESCRIPT_SKILL.description).not.toContain(word);
      }
      expect(NODE_TYPESCRIPT_SKILL.paths).toEqual([
        '**/*.ts',
        '**/*.tsx',
        '**/*.js',
        '**/*.jsx',
        '**/*.mjs',
        '**/*.cjs',
      ]);
      expect([...NODE_TS_SKILL_AGENTS].sort()).toEqual(Object.keys(NEUTRAL).sort());
      expect(NODE_TS_SKILL_AGENTS).not.toContain('Security Reviewer');
    });
  });

  describe('docs/agent-prompts mirrors', () => {
    const FILES: Record<string, string> = {
      'General Reviewer': 'general-reviewer.md',
      'Security Reviewer': 'security-reviewer.md',
      'Performance Reviewer': 'performance-reviewer.md',
      'Test Quality Reviewer': 'test-quality-reviewer.md',
      'API Contract Reviewer': 'api-contract-reviewer.md',
    };
    it.each(Object.entries(FILES))('%s mirror equals the shipped prompt', (name, file) => {
      const mirror = readFileSync(resolve(__dirname, '../../docs/agent-prompts', file), 'utf8');
      expect(mirror.trimEnd()).toBe(BUILTIN_AGENT_PROMPTS[name]!.trimEnd());
    });
  });
});

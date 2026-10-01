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
});

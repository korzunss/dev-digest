import { describe, it, expect } from 'vitest';
import { paginate, riskScore, averageRisk } from '../src/modules/pr-export/helpers.js';

describe('pr-export helpers', () => {
  it('paginates', () => {
    const page = paginate([1, 2, 3, 4, 5], 1, 2);
    expect(page).toBeDefined();
  });

  it('scores risk', () => {
    expect(riskScore([{ severity: 'CRITICAL', title: 'x' }])).toBeGreaterThan(0);
  });

  it('averages risk', () => {
    expect(averageRisk([2, 4])).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import { rowsToSettings } from '../src/modules/settings/helpers.js';

describe('rowsToSettings', () => {
  it('collapses key/value rows into one object', () => {
    expect(rowsToSettings([{ key: 'theme', value: 'dark' }, { key: 'budget', value: 5 }])).toEqual({
      theme: 'dark',
      budget: 5,
    });
  });

  it('skips rows with a blank key or an undefined value', () => {
    expect(
      rowsToSettings([
        { key: '  ', value: 'x' },
        { key: 'theme', value: undefined },
        { key: 'budget', value: null },
      ]),
    ).toEqual({ budget: null });
  });
});

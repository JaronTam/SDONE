import { describe, it, expect } from 'vitest';
import { uuid } from './utils.js';

describe('utils', () => {
  it('trivial pipeline verification', () => {
    expect(1 + 1).toBe(2);
  });

  describe('uuid()', () => {
    it('returns a non-empty string', () => {
      const id = uuid();
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('returns unique values on successive calls', () => {
      const results = new Set(Array.from({ length: 1000 }, () => uuid()));
      expect(results.size).toBe(1000);
    });
  });
});

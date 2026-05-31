import { describe, expect, it, vi } from 'vitest';
import { FormulaEngine } from './FormulaEngine.js';
import * as parserModule from './parser.js';
import * as tokenizerModule from './tokenizer.js';

describe('FormulaEngine', () => {
  // ---------------------------------------------------------------------------
  // Basic evaluation
  // ---------------------------------------------------------------------------

  it('evaluates a constant formula "5"', () => {
    const engine = new FormulaEngine();
    expect(engine.evaluate('5', 0)).toBe(5);
  });

  it('evaluates "sin(t) * 10 + 5" at t=0', () => {
    const engine = new FormulaEngine();
    expect(engine.evaluate('sin(t) * 10 + 5', 0)).toBeCloseTo(5, 4);
  });

  it('evaluates formula at different t values', () => {
    const engine = new FormulaEngine();
    // At t=0: sin(0)*10+5 = 5
    expect(engine.evaluate('sin(t) * 10 + 5', 0)).toBeCloseTo(5, 4);
    // At t=π/2: sin(π/2)*10+5 = 15
    expect(engine.evaluate('sin(t) * 10 + 5', Math.PI / 2)).toBeCloseTo(15, 4);
  });

  // ---------------------------------------------------------------------------
  // AST caching
  // ---------------------------------------------------------------------------

  it('caches AST — parse called only once for same formula string', () => {
    const engine = new FormulaEngine();
    const parseSpy = vi.spyOn(parserModule, 'parse');

    engine.evaluate('sin(t) + 5', 0);
    engine.evaluate('sin(t) + 5', 1);
    engine.evaluate('sin(t) + 5', 2);

    // Parse should be called exactly once (first time)
    expect(parseSpy).toHaveBeenCalledTimes(1);

    parseSpy.mockRestore();
  });

  it('different formula strings create separate cache entries', () => {
    const engine = new FormulaEngine();

    engine.evaluate('5', 0);
    engine.evaluate('10', 0);

    expect(engine.cacheSize).toBe(2);
  });

  it('clearCache() removes all cached ASTs', () => {
    const engine = new FormulaEngine();
    engine.evaluate('5', 0);
    engine.evaluate('sin(t)', 0);
    expect(engine.cacheSize).toBe(2);

    engine.clearCache();
    expect(engine.cacheSize).toBe(0);
  });

  it('cache is re-populated after clear', () => {
    const engine = new FormulaEngine();
    engine.evaluate('5', 0);
    engine.clearCache();
    engine.evaluate('5', 0);
    expect(engine.cacheSize).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Passthrough behavior
  // ---------------------------------------------------------------------------

  it('parse errors propagate through evaluate', () => {
    const engine = new FormulaEngine();
    expect(() => engine.evaluate('sin(t) + * 3', 0)).toThrow();
  });

  // ---------------------------------------------------------------------------
  // P1 poison cache: invalid formula NOT re-parsed on every tick
  // ---------------------------------------------------------------------------

  it('P2: invalid formula is NOT re-tokenized/re-parsed on subsequent calls', () => {
    const engine = new FormulaEngine();
    const tokenizeSpy = vi.spyOn(tokenizerModule, 'tokenize');
    const parseSpy = vi.spyOn(parserModule, 'parse');

    // First call: tokenize + parse ×1, error thrown (caught by SimulationEngine)
    expect(() => engine.evaluate('sin(t) + * 3', 0)).toThrow();
    expect(tokenizeSpy).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // Second call: poison cache hit → returns 0 silently (no throw, no re-parse)
    expect(engine.evaluate('sin(t) + * 3', 0)).toBe(0);
    expect(tokenizeSpy).toHaveBeenCalledTimes(1); // still 1
    expect(parseSpy).toHaveBeenCalledTimes(1);    // still 1

    // Third call: same — returns 0
    expect(engine.evaluate('sin(t) + * 3', 0)).toBe(0);
    expect(tokenizeSpy).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    tokenizeSpy.mockRestore();
    parseSpy.mockRestore();
  });

  it('P2: poison cache is cleared by clearCache()', () => {
    const engine = new FormulaEngine();
    const parseSpy = vi.spyOn(parserModule, 'parse');

    // Fail once → cached as invalid
    expect(() => engine.evaluate('sin(t) + * 3', 0)).toThrow();
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // Second call hits poison cache → returns 0
    expect(engine.evaluate('sin(t) + * 3', 0)).toBe(0);
    expect(parseSpy).toHaveBeenCalledTimes(1); // still 1

    // Clear → poison cache removed
    engine.clearCache();

    // Third call re-tokenizes + re-parses (fresh attempt)
    expect(() => engine.evaluate('sin(t) + * 3', 0)).toThrow();
    expect(parseSpy).toHaveBeenCalledTimes(2); // re-parsed

    parseSpy.mockRestore();
  });

  it('P2: different invalid formulas have separate poison cache entries', () => {
    const engine = new FormulaEngine();
    const parseSpy = vi.spyOn(parserModule, 'parse');

    expect(() => engine.evaluate('bad1 + *', 0)).toThrow();
    expect(() => engine.evaluate('bad2 + *', 0)).toThrow();
    expect(parseSpy).toHaveBeenCalledTimes(2); // both parsed once

    // Each is cached separately — both return 0 silently
    expect(engine.evaluate('bad1 + *', 0)).toBe(0);
    expect(engine.evaluate('bad2 + *', 0)).toBe(0);
    expect(parseSpy).toHaveBeenCalledTimes(2); // still 2

    parseSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // P1 null/empty guard
  // ---------------------------------------------------------------------------

  it('P1: empty string formula returns 0', () => {
    const engine = new FormulaEngine();
    expect(engine.evaluate('', 0)).toBe(0);
  });

  it('P1: non-string formula returns 0 (defensive guard)', () => {
    const engine = new FormulaEngine();
    // @ts-expect-error — testing runtime guard against corrupt state
    expect(engine.evaluate(undefined, 0)).toBe(0);
    // @ts-expect-error
    expect(engine.evaluate(null, 0)).toBe(0);
  });
});

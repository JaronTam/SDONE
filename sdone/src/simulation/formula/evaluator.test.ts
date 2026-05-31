import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenizer.js';
import { parse } from './parser.js';
import { evaluate } from './evaluator.js';
import type { ExprNode } from './parser.js';
import { FormulaEvalError } from './errors.js';

function ev(input: string, t: number): number {
  const tokens = tokenize(input);
  const ast = parse(tokens);
  return evaluate(ast, t);
}

describe('evaluate', () => {
  // ---------------------------------------------------------------------------
  // AC1: "sin(t) * 10 + 5" at t=0 → 5
  // ---------------------------------------------------------------------------

  it('AC1: "sin(t) * 10 + 5" at t=0 = 5', () => {
    expect(ev('sin(t) * 10 + 5', 0)).toBeCloseTo(5, 4);
  });

  it('"sin(t) * 10 + 5" at t=PI/2 ≈ 15', () => {
    expect(ev('sin(t) * 10 + 5', Math.PI / 2)).toBeCloseTo(15, 4);
  });

  // ---------------------------------------------------------------------------
  // AC2: "abs(t - 5) * 2" at t=3 → 4
  // ---------------------------------------------------------------------------

  it('AC2: "abs(t - 5) * 2" at t=3 = 4', () => {
    expect(ev('abs(t - 5) * 2', 3)).toBeCloseTo(4, 4);
  });

  it('"abs(t - 5) * 2" at t=7 = 4', () => {
    expect(ev('abs(t - 5) * 2', 7)).toBeCloseTo(4, 4);
  });

  // ---------------------------------------------------------------------------
  // AC3: "0.5 * t" at t=10 → 5
  // ---------------------------------------------------------------------------

  it('AC3: "0.5 * t" at t=10 = 5', () => {
    expect(ev('0.5 * t', 10)).toBeCloseTo(5, 4);
  });

  // ---------------------------------------------------------------------------
  // AC4: Supported Math functions
  // ---------------------------------------------------------------------------

  it('sin(0) = 0', () => {
    expect(ev('sin(0)', 0)).toBe(0);
  });

  it('cos(0) = 1', () => {
    expect(ev('cos(0)', 0)).toBe(1);
  });

  it('abs(-5) = 5', () => {
    expect(ev('abs(-5)', 0)).toBe(5);
  });

  it('min(3, 7) = 3', () => {
    expect(ev('min(3, 7)', 0)).toBe(3);
  });

  it('max(3, 7) = 7', () => {
    expect(ev('max(3, 7)', 0)).toBe(7);
  });

  it('sqrt(9) = 3', () => {
    expect(ev('sqrt(9)', 0)).toBe(3);
  });

  it('log(1) = 0', () => {
    expect(ev('log(1)', 0)).toBe(0);
  });

  it('exp(0) = 1', () => {
    expect(ev('exp(0)', 0)).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  it('constant "42" evaluates to 42 at any t', () => {
    expect(ev('42', 0)).toBe(42);
    expect(ev('42', 100)).toBe(42);
  });

  // ---------------------------------------------------------------------------
  // Precedence
  // ---------------------------------------------------------------------------

  it('"3 + 4 * 2" = 11 (precedence)', () => {
    expect(ev('3 + 4 * 2', 0)).toBe(11);
  });

  it('"(3 + 4) * 2" = 14 (parentheses)', () => {
    expect(ev('(3 + 4) * 2', 0)).toBe(14);
  });

  // ---------------------------------------------------------------------------
  // Power operator
  // ---------------------------------------------------------------------------

  it('"t ^ 2" at t=3 = 9', () => {
    expect(ev('t ^ 2', 3)).toBe(9);
  });

  it('right-associative power: "2 ^ 3 ^ 2" = 2^(3^2) = 512', () => {
    expect(ev('2 ^ 3 ^ 2', 0)).toBe(512); // 2^9 = 512
  });

  // ---------------------------------------------------------------------------
  // Unary minus
  // ---------------------------------------------------------------------------

  it('"-5" = -5', () => {
    expect(ev('-5', 0)).toBe(-5);
  });

  it('"-(3 + 2)" = -5', () => {
    expect(ev('-(3 + 2)', 0)).toBe(-5);
  });

  it('"5 + -3" = 2', () => {
    expect(ev('5 + -3', 0)).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Nested expressions
  // ---------------------------------------------------------------------------

  it('"sin(cos(0))" = sin(1)', () => {
    expect(ev('sin(cos(0))', 0)).toBeCloseTo(Math.sin(1), 6);
  });

  it('"sin(t) * cos(t)" at t=PI/4', () => {
    const expected = Math.sin(Math.PI / 4) * Math.cos(Math.PI / 4);
    expect(ev('sin(t) * cos(t)', Math.PI / 4)).toBeCloseTo(expected, 6);
  });

  // ---------------------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------------------

  it('sqrt(-1) throws FormulaEvalError', () => {
    expect(() => ev('sqrt(-1)', 0)).toThrow(FormulaEvalError);
    try {
      ev('sqrt(-1)', 0);
    } catch (e) {
      expect((e as FormulaEvalError).message).toContain('sqrt');
    }
  });

  it('division by zero throws FormulaEvalError', () => {
    expect(() => ev('1 / 0', 0)).toThrow(FormulaEvalError);
    try {
      ev('1 / 0', 0);
    } catch (e) {
      expect((e as FormulaEvalError).message).toContain('Division by zero');
    }
  });

  it('log(0) throws FormulaEvalError', () => {
    expect(() => ev('log(0)', 0)).toThrow(FormulaEvalError);
  });

  it('unknown variable throws FormulaEvalError', () => {
    // Create AST directly with an unknown variable
    const ast = { type: 'variable', name: 'x' } as ExprNode;
    expect(() => evaluate(ast, 0)).toThrow(FormulaEvalError);
  });

  // ---------------------------------------------------------------------------
  // P1 fixes: NaN guard, unknown function error, power domain
  // ---------------------------------------------------------------------------

  it('P1: Math.pow(-2, 0.5) throws FormulaEvalError (not silent NaN)', () => {
    expect(() => ev('(-2) ^ 0.5', 0)).toThrow(FormulaEvalError);
    try {
      ev('(-2) ^ 0.5', 0);
    } catch (e) {
      expect((e as FormulaEvalError).message).toContain('negative');
    }
  });

  it('P1: Math.pow(-8, 1/3) throws FormulaEvalError (JS returns NaN)', () => {
    // Math.pow(-8, 1/3) returns NaN in JS even though real root exists
    expect(() => ev('(-8) ^ (1/3)', 0)).toThrow(FormulaEvalError);
  });

  it('P1: unknown function "foo(1)" throws "Unknown function" (not miscount)', () => {
    try {
      ev('foo(1)', 0);
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as FormulaEvalError).message).toContain('Unknown function');
      expect((e as FormulaEvalError).message).not.toContain('expects');
    }
  });

  it('P1: unknown function "bar(1, 2)" throws "Unknown function"', () => {
    try {
      ev('bar(1, 2)', 0);
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as FormulaEvalError).message).toContain('Unknown function');
    }
  });

  it('P1: unknown function "baz()" throws "Unknown function"', () => {
    try {
      ev('baz()', 0);
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as FormulaEvalError).message).toContain('Unknown function');
    }
  });

  it('P1: known function with wrong arg count still reports count mismatch', () => {
    // min with 1 arg → correct error message about arg count, not "Unknown"
    try {
      ev('min(5)', 0);
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as FormulaEvalError).message).toContain('min');
      expect((e as FormulaEvalError).message).toContain('expects 2');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenizer.js';
import { parse } from './parser.js';
import type {
  ExprNode,
  NumberNode,
  VariableNode,
  BinaryOpNode,
  UnaryOpNode,
  FunctionCallNode,
} from './parser.js';
import { FormulaParseError } from './errors.js';

// Shortcut: tokenize + parse
function p(input: string): ExprNode {
  return parse(tokenize(input));
}

describe('parse', () => {
  // ---------------------------------------------------------------------------
  // Atomic expressions
  // ---------------------------------------------------------------------------

  it('parses a number literal "5" → NumberNode(5)', () => {
    const ast = p('5') as NumberNode;
    expect(ast.type).toBe('number');
    expect(ast.value).toBe(5);
  });

  it('parses the variable "t" → VariableNode(\'t\')', () => {
    const ast = p('t') as VariableNode;
    expect(ast.type).toBe('variable');
    expect(ast.name).toBe('t');
  });

  // ---------------------------------------------------------------------------
  // Binary operations
  // ---------------------------------------------------------------------------

  it('parses addition "5 + 3"', () => {
    const ast = p('5 + 3') as BinaryOpNode;
    expect(ast.type).toBe('binary');
    expect(ast.op).toBe('+');
    expect((ast.left as NumberNode).value).toBe(5);
    expect((ast.right as NumberNode).value).toBe(3);
  });

  it('parses subtraction "10 - 3"', () => {
    const ast = p('10 - 3') as BinaryOpNode;
    expect(ast.type).toBe('binary');
    expect(ast.op).toBe('-');
  });

  it('parses multiplication "4 * 2"', () => {
    const ast = p('4 * 2') as BinaryOpNode;
    expect(ast.type).toBe('binary');
    expect(ast.op).toBe('*');
  });

  it('parses division "8 / 2"', () => {
    const ast = p('8 / 2') as BinaryOpNode;
    expect(ast.type).toBe('binary');
    expect(ast.op).toBe('/');
  });

  it('parses power "2 ^ 3"', () => {
    const ast = p('2 ^ 3') as BinaryOpNode;
    expect(ast.type).toBe('binary');
    expect(ast.op).toBe('^');
  });

  // ---------------------------------------------------------------------------
  // Operator precedence
  // ---------------------------------------------------------------------------

  it('respects precedence: "5 + 3 * 2" → + at root, * in right subtree', () => {
    const ast = p('5 + 3 * 2') as BinaryOpNode;
    expect(ast.op).toBe('+');
    expect((ast.left as NumberNode).value).toBe(5);
    const right = ast.right as BinaryOpNode;
    expect(right.op).toBe('*');
    expect((right.left as NumberNode).value).toBe(3);
    expect((right.right as NumberNode).value).toBe(2);
  });

  it('^ is right-associative: "2 ^ 3 ^ 2" → 2^(3^2)', () => {
    const ast = p('2 ^ 3 ^ 2') as BinaryOpNode;
    expect(ast.op).toBe('^');
    expect((ast.left as NumberNode).value).toBe(2);
    const right = ast.right as BinaryOpNode;
    expect(right.op).toBe('^');
    expect((right.left as NumberNode).value).toBe(3);
    expect((right.right as NumberNode).value).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Unary minus
  // ---------------------------------------------------------------------------

  it('parses unary minus "-5"', () => {
    const ast = p('-5') as UnaryOpNode;
    expect(ast.type).toBe('unary');
    expect(ast.op).toBe('-');
    expect((ast.operand as NumberNode).value).toBe(5);
  });

  it('parses negation of expression "-(3 + 2)"', () => {
    const ast = p('-(3 + 2)') as UnaryOpNode;
    expect(ast.type).toBe('unary');
    expect(ast.op).toBe('-');
    const inner = ast.operand as BinaryOpNode;
    expect(inner.op).toBe('+');
  });

  // ---------------------------------------------------------------------------
  // Parentheses
  // ---------------------------------------------------------------------------

  it('parses parenthesized expression "(3 + 4) * 2"', () => {
    const ast = p('(3 + 4) * 2') as BinaryOpNode;
    expect(ast.op).toBe('*');
    const left = ast.left as BinaryOpNode;
    expect(left.op).toBe('+');
  });

  // ---------------------------------------------------------------------------
  // Function calls
  // ---------------------------------------------------------------------------

  it('parses "sin(t)"', () => {
    const ast = p('sin(t)') as FunctionCallNode;
    expect(ast.type).toBe('call');
    expect(ast.name).toBe('sin');
    expect(ast.args).toHaveLength(1);
    expect((ast.args[0] as VariableNode).name).toBe('t');
  });

  it('parses two-argument function "min(t, 5)"', () => {
    const ast = p('min(t, 5)') as FunctionCallNode;
    expect(ast.type).toBe('call');
    expect(ast.name).toBe('min');
    expect(ast.args).toHaveLength(2);
    expect((ast.args[0] as VariableNode).name).toBe('t');
    expect((ast.args[1] as NumberNode).value).toBe(5);
  });

  it('parses "cos(t)"', () => {
    const ast = p('cos(t)') as FunctionCallNode;
    expect(ast.type).toBe('call');
    expect(ast.name).toBe('cos');
  });

  it('parses nested function "sin(cos(t))"', () => {
    const ast = p('sin(cos(t))') as FunctionCallNode;
    expect(ast.name).toBe('sin');
    expect(ast.args).toHaveLength(1);
    const inner = ast.args[0] as FunctionCallNode;
    expect(inner.name).toBe('cos');
    expect(inner.args).toHaveLength(1);
    expect((inner.args[0] as VariableNode).name).toBe('t');
  });

  // ---------------------------------------------------------------------------
  // Complex expressions
  // ---------------------------------------------------------------------------

  it('parses "sin(t) * 10 + 5" (AC1)', () => {
    const ast = p('sin(t) * 10 + 5') as BinaryOpNode;
    // root should be + (lowest precedence)
    expect(ast.op).toBe('+');
    // right is 5
    expect((ast.right as NumberNode).value).toBe(5);
    // left is sin(t) * 10
    const left = ast.left as BinaryOpNode;
    expect(left.op).toBe('*');
    expect((left.left as FunctionCallNode).name).toBe('sin');
    expect((left.right as NumberNode).value).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------------------

  it('throws FormulaParseError for invalid syntax "sin(t) + * 3" (AC5)', () => {
    expect(() => p('sin(t) + * 3')).toThrow(FormulaParseError);
    try {
      p('sin(t) + * 3');
    } catch (e) {
      const err = e as FormulaParseError;
      expect(err).toBeInstanceOf(FormulaParseError);
      expect(err.message).toContain('*');
      // AC5: error must carry the position of the error in the input string
      expect(typeof err.position).toBe('number');
      expect(err.position).toBeGreaterThanOrEqual(0);
    }
  });

  it('throws FormulaParseError for unconsumed tokens "5 5"', () => {
    expect(() => p('5 5')).toThrow(FormulaParseError);
    try {
      p('5 5');
    } catch (e) {
      expect((e as FormulaParseError).message).toContain('Unexpected');
    }
  });

  it('parses empty parentheses "sin()" as zero-arg FunctionCallNode (evaluator rejects later)', () => {
    // Parser allows zero-argument function calls — the evaluator enforces
    // argument count at evaluation time (FormulaEvalError).
    const ast = p('sin()') as FunctionCallNode;
    expect(ast.type).toBe('call');
    expect(ast.args).toHaveLength(0);
  });

  it('throws FormulaParseError for missing closing paren', () => {
    expect(() => p('sin(t')).toThrow(FormulaParseError);
  });

  // ---------------------------------------------------------------------------
  // P2: empty formula error
  // ---------------------------------------------------------------------------

  it('P2: empty formula string throws with clear message', () => {
    expect(() => p('')).toThrow(FormulaParseError);
    try {
      p('');
    } catch (e) {
      expect((e as FormulaParseError).message).toContain('Empty formula');
    }
  });

  // ---------------------------------------------------------------------------
  // P2: malformed number "3.14.5" is caught by tokenizer, not parser
  // ---------------------------------------------------------------------------

  it('P2: malformed number "3.14.5" throws at tokenizer level', () => {
    // tokenize throws → p() (which calls tokenize) also throws
    expect(() => p('3.14.5')).toThrow(FormulaParseError);
    try {
      p('3.14.5');
    } catch (e) {
      expect((e as FormulaParseError).message).toContain('Malformed number');
    }
  });
});

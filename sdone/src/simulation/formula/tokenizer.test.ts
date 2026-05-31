import { describe, expect, it } from 'vitest';
import { tokenize, TokenType } from './tokenizer.js';
import { FormulaParseError } from './errors.js';

describe('tokenize', () => {
  // ---------------------------------------------------------------------------
  // Basic tokens
  // ---------------------------------------------------------------------------

  it('tokenizes a plain integer', () => {
    const tokens = tokenize('5');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: TokenType.NUMBER,
      lexeme: '5',
      position: 0,
      value: 5,
    });
  });

  it('tokenizes a decimal number', () => {
    const tokens = tokenize('3.14');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: TokenType.NUMBER,
      lexeme: '3.14',
      value: 3.14,
    });
  });

  it('tokenizes a number starting with a decimal point (.5)', () => {
    const tokens = tokenize('.5');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: TokenType.NUMBER,
      lexeme: '.5',
      value: 0.5,
    });
  });

  it('tokenizes a simple expression "3.14 + 2"', () => {
    const tokens = tokenize('3.14 + 2');
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toMatchObject({ type: TokenType.NUMBER, value: 3.14 });
    expect(tokens[1]).toMatchObject({ type: TokenType.OPERATOR, lexeme: '+' });
    expect(tokens[2]).toMatchObject({ type: TokenType.NUMBER, value: 2 });
  });

  // ---------------------------------------------------------------------------
  // Identifiers
  // ---------------------------------------------------------------------------

  it('tokenizes variable "t"', () => {
    const tokens = tokenize('t');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: TokenType.IDENTIFIER,
      lexeme: 't',
      name: 't',
    });
  });

  it('tokenizes function name "sin"', () => {
    const tokens = tokenize('sin');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: TokenType.IDENTIFIER,
      lexeme: 'sin',
      name: 'sin',
    });
  });

  it('tokenizes "sin(t)" correctly', () => {
    const tokens = tokenize('sin(t)');
    expect(tokens).toHaveLength(4);
    expect(tokens[0]).toMatchObject({ type: TokenType.IDENTIFIER, name: 'sin' });
    expect(tokens[1]).toMatchObject({ type: TokenType.LPAREN });
    expect(tokens[2]).toMatchObject({ type: TokenType.IDENTIFIER, name: 't' });
    expect(tokens[3]).toMatchObject({ type: TokenType.RPAREN });
  });

  it('tokenizes all supported function names', () => {
    const fns = ['sin', 'cos', 'abs', 'min', 'max', 'sqrt', 'log', 'exp'];
    for (const fn of fns) {
      const tokens = tokenize(fn);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].name).toBe(fn);
    }
  });

  // ---------------------------------------------------------------------------
  // Operators and punctuation
  // ---------------------------------------------------------------------------

  it('tokenizes all operators', () => {
    const ops = ['+', '-', '*', '/', '^'];
    for (const op of ops) {
      const tokens = tokenize(op);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].lexeme).toBe(op);
      expect(tokens[0].type).toBe(TokenType.OPERATOR);
    }
  });

  it('tokenizes parentheses and comma', () => {
    const tokens = tokenize('(,)');
    expect(tokens).toHaveLength(3);
    expect(tokens[0].type).toBe(TokenType.LPAREN);
    expect(tokens[1].type).toBe(TokenType.COMMA);
    expect(tokens[2].type).toBe(TokenType.RPAREN);
  });

  it('tokenizes "min(t, 5)" correctly', () => {
    const tokens = tokenize('min(t, 5)');
    expect(tokens).toHaveLength(6);
    expect(tokens[0]).toMatchObject({ type: TokenType.IDENTIFIER, name: 'min' });
    expect(tokens[1]).toMatchObject({ type: TokenType.LPAREN });
    expect(tokens[2]).toMatchObject({ type: TokenType.IDENTIFIER, name: 't' });
    expect(tokens[3]).toMatchObject({ type: TokenType.COMMA });
    expect(tokens[4]).toMatchObject({ type: TokenType.NUMBER, value: 5 });
    expect(tokens[5]).toMatchObject({ type: TokenType.RPAREN });
  });

  // ---------------------------------------------------------------------------
  // Unary minus
  // ---------------------------------------------------------------------------

  it('tokenizes unary minus as a separate operator token "-5"', () => {
    const tokens = tokenize('-5');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ type: TokenType.OPERATOR, lexeme: '-' });
    expect(tokens[1]).toMatchObject({ type: TokenType.NUMBER, value: 5 });
  });

  // ---------------------------------------------------------------------------
  // Whitespace handling
  // ---------------------------------------------------------------------------

  it('ignores whitespace', () => {
    const tokens = tokenize('  5  +  3  ');
    expect(tokens).toHaveLength(3);
    expect(tokens[0].value).toBe(5);
    expect(tokens[1].lexeme).toBe('+');
    expect(tokens[2].value).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('empty string returns empty array', () => {
    const tokens = tokenize('');
    expect(tokens).toEqual([]);
  });

  it('whitespace-only string returns empty array', () => {
    const tokens = tokenize('   ');
    expect(tokens).toEqual([]);
  });

  it('throws FormulaParseError on unrecognized character', () => {
    expect(() => tokenize('5 @ 3')).toThrow(FormulaParseError);
    try {
      tokenize('5 @ 3');
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaParseError);
      expect((e as FormulaParseError).message).toContain('@');
      expect((e as FormulaParseError).position).toBe(2);
    }
  });

  // ---------------------------------------------------------------------------
  // Position tracking
  // ---------------------------------------------------------------------------

  it('tracks positions correctly', () => {
    const tokens = tokenize('1 + 20');
    expect(tokens[0].position).toBe(0);   // '1'
    expect(tokens[1].position).toBe(2);   // '+'
    expect(tokens[2].position).toBe(4);   // '20'
  });

  // ---------------------------------------------------------------------------
  // P2: malformed number detection
  // ---------------------------------------------------------------------------

  it('P2: "3.14.5" throws FormulaParseError (malformed number)', () => {
    expect(() => tokenize('3.14.5')).toThrow(FormulaParseError);
    try {
      tokenize('3.14.5');
    } catch (e) {
      expect((e as FormulaParseError).message).toContain('Malformed number');
      expect((e as FormulaParseError).message).toContain('multiple decimal points');
    }
  });

  it('P2: "1.2.3.4" throws FormulaParseError', () => {
    expect(() => tokenize('1.2.3.4')).toThrow(FormulaParseError);
  });
});

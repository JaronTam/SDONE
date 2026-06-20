import { FormulaParseError } from './errors.js';

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

export enum TokenType {
  NUMBER = 'NUMBER',
  IDENTIFIER = 'IDENTIFIER',
  OPERATOR = 'OPERATOR',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  COMMA = 'COMMA',
}

export interface Token {
  type: TokenType;
  /** Raw lexeme text. */
  lexeme: string;
  /** 0-indexed character position in the input string. */
  position: number;
  /** Numeric value — populated only for NUMBER tokens. */
  value?: number;
  /** Identifier name — populated only for IDENTIFIER tokens. */
  name?: string;
}

// ---------------------------------------------------------------------------
// Character classifiers
// ---------------------------------------------------------------------------

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isAlpha(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isAlphaNumeric(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch) || ch === '_';
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize a formula string into an array of {@link Token}.
 *
 * Supported tokens:
 * - Numbers: integers and decimals (e.g., `5`, `3.14`, `0.5`)
 * - Identifiers: variable `t` and function names (`sin`, `cos`, `abs`, `min`, `max`, `sqrt`, `log`, `exp`)
 * - Operators: `+`, `-`, `*`, `/`, `^`
 * - Parentheses: `(`, `)`
 * - Comma: `,`
 *
 * Whitespace is ignored.
 *
 * @throws {FormulaParseError} if an unrecognized character is encountered.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // Whitespace — skip
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Numbers (integer and decimal)
    if (isDigit(ch) || (ch === '.' && i + 1 < input.length && isDigit(input[i + 1]))) {
      const start = i;
      let hasDot = false;
      if (ch === '.') {
        hasDot = true;
        i++;
      }
      while (i < input.length && isDigit(input[i])) {
        i++;
      }
      // Fractional part
      if (i < input.length && input[i] === '.' && !hasDot) {
        hasDot = true;
        i++;
        while (i < input.length && isDigit(input[i])) {
          i++;
        }
      }
      // Reject malformed numbers with multiple decimal points
      // (e.g., "3.14.5" — the second dot with a trailing digit is caught here)
      if (
        hasDot &&
        i < input.length &&
        input[i] === '.' &&
        i + 1 < input.length &&
        isDigit(input[i + 1])
      ) {
        throw new FormulaParseError(
          `Malformed number at position ${start}: multiple decimal points in '${input.slice(start, i)}.'`,
          start,
        );
      }
      const lexeme = input.slice(start, i);
      const value = parseFloat(lexeme);
      tokens.push({ type: TokenType.NUMBER, lexeme, position: start, value });
      continue;
    }

    // Identifiers (t, sin, cos, ...)
    if (isAlpha(ch) || ch === '_') {
      const start = i;
      while (i < input.length && isAlphaNumeric(input[i])) {
        i++;
      }
      const lexeme = input.slice(start, i);
      tokens.push({ type: TokenType.IDENTIFIER, lexeme, position: start, name: lexeme });
      continue;
    }

    // Single-character tokens
    switch (ch) {
      case '+':
      case '-':
      case '*':
      case '/':
      case '^':
        tokens.push({ type: TokenType.OPERATOR, lexeme: ch, position: i });
        i++;
        continue;
      case '(':
        tokens.push({ type: TokenType.LPAREN, lexeme: ch, position: i });
        i++;
        continue;
      case ')':
        tokens.push({ type: TokenType.RPAREN, lexeme: ch, position: i });
        i++;
        continue;
      case ',':
        tokens.push({ type: TokenType.COMMA, lexeme: ch, position: i });
        i++;
        continue;
      default:
        throw new FormulaParseError(`Unrecognized character '${ch}' at position ${i}`, i);
    }
  }

  return tokens;
}

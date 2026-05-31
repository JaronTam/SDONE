import { FormulaParseError } from './errors.js';
import type { Token } from './tokenizer.js';
import { TokenType } from './tokenizer.js';

// ---------------------------------------------------------------------------
// AST node types
// ---------------------------------------------------------------------------

export type ExprNode =
  | NumberNode
  | VariableNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode;

export interface NumberNode {
  type: 'number';
  value: number;
}

export interface VariableNode {
  type: 'variable';
  name: string;
}

export type BinaryOp = '+' | '-' | '*' | '/' | '^';

export interface BinaryOpNode {
  type: 'binary';
  op: BinaryOp;
  left: ExprNode;
  right: ExprNode;
}

export interface UnaryOpNode {
  type: 'unary';
  op: '-';
  operand: ExprNode;
}

export interface FunctionCallNode {
  type: 'call';
  name: string;
  args: ExprNode[];
}

// ---------------------------------------------------------------------------
// Parser state
// ---------------------------------------------------------------------------

/** Peeks at the current token without consuming it. Returns null if at end. */
type PeekFn = () => Token | null;
/** Consumes and returns the current token. Throws if at end. */
type AdvanceFn = () => Token;
/** Returns true if the current token matches the given types. */
type MatchFn = (...types: TokenType[]) => boolean;

// ---------------------------------------------------------------------------
// Recursive descent parser — Pratt-style precedence climbing
//
// Grammar:
//   expression  → term (('+' | '-') term)*
//   term        → unary (('*' | '/') unary)*
//   unary       → ('-')? power
//   power       → primary ('^' unary)?     (right-associative)
//   primary     → NUMBER
//               | IDENTIFIER ('(' args? ')')?   (function call or variable)
//               | '(' expression ')'
//   args        → expression (',' expression)*
// ---------------------------------------------------------------------------

export function parse(tokens: Token[]): ExprNode {
  let pos = 0;

  const peek: PeekFn = () => (pos < tokens.length ? tokens[pos] : null);

  const advance: AdvanceFn = () => {
    const tok = tokens[pos];
    if (!tok) {
      throw new FormulaParseError('Unexpected end of expression', pos);
    }
    pos++;
    return tok;
  };

  const match: MatchFn = (...types: TokenType[]): boolean => {
    const tok = peek();
    return tok !== null && types.includes(tok.type);
  };

  // ---- entry point ----

  // Empty formula — give a clear error instead of "Unexpected token 'end'"
  if (tokens.length === 0) {
    throw new FormulaParseError('Empty formula expression', 0);
  }

  const node = expression();

  // After successful parse, no tokens should remain unconsumed
  if (pos < tokens.length) {
    const remaining = tokens[pos];
    throw new FormulaParseError(
      `Unexpected token '${remaining.lexeme}' at position ${remaining.position}`,
      remaining.position,
    );
  }

  return node;

  // ---- grammar rules ----

  function expression(): ExprNode {
    let left = term();

    while (match(TokenType.OPERATOR) && (peek()!.lexeme === '+' || peek()!.lexeme === '-')) {
      const op = advance().lexeme as BinaryOp;
      const right = term();
      left = { type: 'binary', op, left, right };
    }

    return left;
  }

  function term(): ExprNode {
    let left = unary();

    while (match(TokenType.OPERATOR) && (peek()!.lexeme === '*' || peek()!.lexeme === '/')) {
      const op = advance().lexeme as BinaryOp;
      const right = unary();
      left = { type: 'binary', op, left, right };
    }

    return left;
  }

  function unary(): ExprNode {
    if (match(TokenType.OPERATOR) && peek()!.lexeme === '-') {
      advance(); // consume '-'
      const operand = power();
      return { type: 'unary', op: '-', operand };
    }

    return power();
  }

  function power(): ExprNode {
    const left = primary();

    if (match(TokenType.OPERATOR) && peek()!.lexeme === '^') {
      advance(); // consume '^'
      const right = unary(); // right-associative: a^b^c = a^(b^c)
      return { type: 'binary', op: '^', left, right };
    }

    return left;
  }

  function primary(): ExprNode {
    // NUMBER
    if (match(TokenType.NUMBER)) {
      const tok = advance();
      return { type: 'number', value: tok.value! };
    }

    // IDENTIFIER — variable or function call
    if (match(TokenType.IDENTIFIER)) {
      const tok = advance();
      const name = tok.name!;

      // Function call
      if (match(TokenType.LPAREN)) {
        advance(); // consume '('
        const args: ExprNode[] = [];

        if (!match(TokenType.RPAREN)) {
          args.push(expression());
          while (match(TokenType.COMMA)) {
            advance(); // consume ','
            args.push(expression());
          }
        }

        if (!match(TokenType.RPAREN)) {
          const cur = peek();
          throw new FormulaParseError(
            `Expected ')' after function arguments but found '${cur?.lexeme ?? 'end'}'`,
            cur?.position ?? pos,
          );
        }
        advance(); // consume ')'

        return { type: 'call', name, args };
      }

      // Plain variable (e.g., 't')
      return { type: 'variable', name };
    }

    // '(' expression ')'
    if (match(TokenType.LPAREN)) {
      advance(); // consume '('
      const node = expression();
      if (!match(TokenType.RPAREN)) {
        const cur = peek();
        throw new FormulaParseError(
          `Expected ')' but found '${cur?.lexeme ?? 'end'}'`,
          cur?.position ?? pos,
        );
      }
      advance(); // consume ')'
      return node;
    }

    // Unexpected token
    const cur = peek();
    throw new FormulaParseError(
      `Unexpected token '${cur?.lexeme ?? 'end'}' at position ${cur?.position ?? pos}`,
      cur?.position ?? pos,
    );
  }
}

/**
 * Custom error types for the formula expression parser.
 */

/** Thrown when a formula string cannot be tokenized or parsed. */
export class FormulaParseError extends Error {
  constructor(
    message: string,
    /** 0-indexed character position in the input string where the error occurred. */
    public position: number,
  ) {
    super(message);
    this.name = 'FormulaParseError';
  }
}

/** Thrown when a valid AST cannot be evaluated (e.g., sqrt(-1), division by zero). */
export class FormulaEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaEvalError';
  }
}

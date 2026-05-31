import { tokenize } from './tokenizer.js';
import { parse as parseTokens } from './parser.js';
import { evaluate as evaluateNode } from './evaluator.js';
import { FormulaParseError } from './errors.js';
import type { ExprNode } from './parser.js';

/**
 * Self-built formula expression engine (Architecture Decision 4).
 *
 * Combines tokenize → parse → evaluate with an AST cache so that repeated
 * evaluation of the same formula string reuses the parsed tree.  Invalid
 * formulas are tracked in a separate set ("poison cache") to prevent
 * re-parsing the same malformed string on every simulation tick.
 *
 * Usage:
 * ```typescript
 * const engine = new FormulaEngine();
 * const rate = engine.evaluate('sin(t) * 10 + 5', 0); // → 5
 * ```
 */
export class FormulaEngine {
  /** AST cache keyed by raw formula string. */
  private _cache = new Map<string, ExprNode>();

  /**
   * Formulas that previously failed tokenization or parsing.
   *
   * On first failure the string is recorded here and the error is thrown
   * (which `SimulationEngine.tick()` catches → `console.warn` → rate=0).
   * Subsequent evaluations return 0 silently — no re-parsing, no re-throwing,
   * no console flooding.
   */
  private _invalidFormulas = new Set<string>();

  /**
   * Evaluate a formula string at the given simulated time `t`.
   *
   * The formula string is tokenized and parsed on first use; the resulting
   * AST is cached for subsequent evaluations of the same string.  This keeps
   * the per-tick cost O(1) for constant formulas and O(node count) for
   * time-varying ones — no re-parsing overhead.
   *
   * Invalid formulas are recorded on first failure (which still throws so
   * the caller can log once).  Subsequent evaluations of the same invalid
   * string return 0 without throwing — preventing console flooding at 10Hz.
   *
   * @param formulaStr  The raw string from `Connection.formulaStr`.
   * @param t           Current simulated time in seconds.
   * @returns The evaluated numeric rate.
   */
  evaluate(formulaStr: string, t: number): number {
    // Guard: missing or empty formula string → fall back to 0
    if (typeof formulaStr !== 'string' || formulaStr === '') {
      return 0;
    }

    // Poison cache: formula already known to be invalid → return 0 silently
    if (this._invalidFormulas.has(formulaStr)) {
      return 0;
    }

    let ast = this._cache.get(formulaStr);
    if (!ast) {
      try {
        const tokens = tokenize(formulaStr);
        ast = parseTokens(tokens);
        this._cache.set(formulaStr, ast);
      } catch (e) {
        if (e instanceof FormulaParseError) {
          this._invalidFormulas.add(formulaStr);
        }
        throw e;
      }
    }
    return evaluateNode(ast, t);
  }

  /** Clear the internal AST cache and invalid-formula set. */
  clearCache(): void {
    this._cache.clear();
    this._invalidFormulas.clear();
  }

  /** Number of cached ASTs. Useful for testing cache behavior. */
  get cacheSize(): number {
    return this._cache.size;
  }
}

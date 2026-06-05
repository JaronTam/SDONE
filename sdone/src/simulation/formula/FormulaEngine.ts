import { tokenize } from './tokenizer.js';
import { parse as parseTokens } from './parser.js';
import { evaluate as evaluateNode } from './evaluator.js';
import { FormulaParseError } from './errors.js';
import type { ExprNode } from './parser.js';
import type { Connection, GraphState, StockNode } from '../../state/GraphState.js';

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
   * Story 7.1: Added optional `variables` parameter for injecting stock state
   * (value, capacity) into feedback formula evaluation. The AST cache keys on
   * formulaStr only — variable values don't affect parsing, so cached ASTs
   * remain valid regardless of variable values.
   *
   * @param formulaStr  The raw string from `Connection.formulaStr`.
   * @param t           Current simulated time in seconds.
   * @param variables   Optional bag of variable name→value mappings (Story 7.1).
   * @returns The evaluated numeric rate.
   */
  evaluate(formulaStr: string, t: number, variables?: Record<string, number>): number {
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
    return evaluateNode(ast, t, variables);
  }

  /**
   * Story 7.1 — Evaluate a feedback connection's formula against graph state.
   *
   * Injects the stock's `value` and `capacity` as variables, plus `stock_value`
   * as an alias for `value`.  For non-feedback connections, falls back to the
   * connection's numeric `rate` property.
   *
   * @param conn     The connection to evaluate.
   * @param state    Current graph state (used to look up stock node data).
   * @param t        Current simulated time in seconds (default 0).
   * @returns The evaluated numeric rate.
   */
  evaluateForConnection(conn: Connection, state: GraphState, t: number = 0): number {
    if (!conn.isFeedback) {
      return conn.rate;
    }

    // Look up the stock node (feedback connections go from stock → source)
    const stockNode = state.nodes[conn.fromId];
    if (!stockNode || stockNode.type !== 'stock') {
      return 0;
    }

    const stock = stockNode as StockNode;
    const variables: Record<string, number> = {
      value: stock.value,
      capacity: stock.capacity ?? 100,
      stock_value: stock.value, // alias for user-facing formulas
    };

    // Let FormulaParseError/FormulaEvalError propagate to tick()'s error handler
    // which logs the error and sets conn.rate = 0
    return this.evaluate(conn.formulaStr ?? '', t, variables);
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

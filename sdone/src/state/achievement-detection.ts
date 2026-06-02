/**
 * Story 5.5 — Achievement detection pure functions.
 *
 * Extracted from main.ts for testability.
 * These functions take GraphState and return boolean — no side effects.
 */

import type { GraphState } from './GraphState.js';

/**
 * Detect whether the graph contains at least one complete
 * source → stock → sink stack.
 *
 * A "complete stack" is a stock node that has BOTH:
 * - At least one incoming connection FROM a source (source → stock)
 * - At least one outgoing connection TO a sink (stock → sink)
 */
export function detectFirstCompleteStack(state: GraphState): boolean {
  for (const stockNode of Object.values(state.nodes)) {
    if (stockNode.type !== 'stock') continue;
    const hasInflow = Object.values(state.connections).some(
      c => c.toId === stockNode.id && state.nodes[c.fromId]?.type === 'source'
    );
    const hasOutflow = Object.values(state.connections).some(
      c => c.fromId === stockNode.id && state.nodes[c.toId]?.type === 'sink'
    );
    if (hasInflow && hasOutflow) return true;
  }
  return false;
}
import type { GraphState } from '../state/GraphState.js';

/**
 * Check whether a stock node has incoming and outgoing flows.
 *
 * @returns { inflowMissing, outflowMissing } — both default to `false`
 *   for non-stock nodes and missing nodes (no-op, no throw).
 */
export function getStockEdgeWarnings(
  state: GraphState,
  stockId: string,
): { inflowMissing: boolean; outflowMissing: boolean } {
  const node = state.nodes[stockId];
  if (!node || node.type !== 'stock') {
    return { inflowMissing: false, outflowMissing: false };
  }

  let hasInflow = false;
  let hasOutflow = false;

  for (const conn of Object.values(state.connections)) {
    if (conn.toId === stockId) hasInflow = true;
    if (conn.fromId === stockId) hasOutflow = true;
    // Early exit: both satisfied
    if (hasInflow && hasOutflow) break;
  }

  return {
    inflowMissing: !hasInflow,
    outflowMissing: !hasOutflow,
  };
}

/**
 * Compute stack-completeness warnings for all stock nodes in a single pass.
 *
 * Single-pass O(S+C) — initializes all stocks as "both missing", then marks
 * satisfied edges by iterating connections once.
 *
 * @returns Record keyed by stock node id, with inflowMissing/outflowMissing flags.
 *   Empty object when there are no stock nodes.
 */
export function getAllEdgeWarnings(
  state: GraphState,
): Record<string, { inflowMissing: boolean; outflowMissing: boolean }> {
  const result: Record<string, { inflowMissing: boolean; outflowMissing: boolean }> = {};

  // Init: all stocks start as "both missing"
  for (const [id, node] of Object.entries(state.nodes)) {
    if (node.type === 'stock') {
      result[id] = { inflowMissing: true, outflowMissing: true };
    }
  }

  // Single pass over connections to mark satisfied edges
  for (const conn of Object.values(state.connections)) {
    if (result[conn.toId]) result[conn.toId].inflowMissing = false;
    if (result[conn.fromId]) result[conn.fromId].outflowMissing = false;
  }

  return result;
}

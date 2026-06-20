import { describe, expect, it } from 'vitest';
import { getStockEdgeWarnings, getAllEdgeWarnings } from './StackValidator.js';
import type {
  Connection,
  GraphState,
  SinkNode,
  SourceNode,
  StockNode,
} from '../state/GraphState.js';

// ---------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------

function makeStock(id: string, value = 0, capacity = 100): StockNode {
  return {
    id,
    type: 'stock',
    position: { x: 0, y: 0 },
    value,
    capacity,
    initialValue: value,
  };
}

function makeSource(id: string): SourceNode {
  return { id, type: 'source', position: { x: 0, y: 0 } };
}

function makeSink(id: string): SinkNode {
  return { id, type: 'sink', position: { x: 0, y: 0 } };
}

function makeConnection(id: string, fromId: string, toId: string, rate: number): Connection {
  return { id, fromId, toId, rate, formulaStr: String(rate) };
}

function makeEmptyState(): GraphState {
  return {
    nodes: {},
    connections: {},
    version: 0,
    selectedModuleIds: [],
    selectedConnectionIds: [],
  };
}

// ===========================================================================
// Story 4.6 AC1 — getStockEdgeWarnings
// ===========================================================================

describe('StackValidator — getStockEdgeWarnings', () => {
  it('AC1: both missing — stock with no connections', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStock('s', 0);

    const w = getStockEdgeWarnings(state, 's');
    expect(w.inflowMissing).toBe(true);
    expect(w.outflowMissing).toBe(true);
  });

  it('AC1: inflow missing — stock has only outflow', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStock('s', 0);
    state.nodes.snk = makeSink('snk');
    state.connections.c = makeConnection('c', 's', 'snk', 5);

    const w = getStockEdgeWarnings(state, 's');
    expect(w.inflowMissing).toBe(true);
    expect(w.outflowMissing).toBe(false);
  });

  it('AC1: outflow missing — stock has only inflow', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStock('s', 0);
    state.nodes.src = makeSource('src');
    state.connections.c = makeConnection('c', 'src', 's', 5);

    const w = getStockEdgeWarnings(state, 's');
    expect(w.inflowMissing).toBe(false);
    expect(w.outflowMissing).toBe(true);
  });

  it('AC1: both satisfied — stock has inflow and outflow', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStock('s', 0);
    state.nodes.src = makeSource('src');
    state.nodes.snk = makeSink('snk');
    state.connections.c1 = makeConnection('c1', 'src', 's', 5);
    state.connections.c2 = makeConnection('c2', 's', 'snk', 3);

    const w = getStockEdgeWarnings(state, 's');
    expect(w.inflowMissing).toBe(false);
    expect(w.outflowMissing).toBe(false);
  });

  it('non-stock node returns no warnings', () => {
    const state = makeEmptyState();
    state.nodes.src = makeSource('src');

    const w = getStockEdgeWarnings(state, 'src');
    expect(w.inflowMissing).toBe(false);
    expect(w.outflowMissing).toBe(false);
  });

  it('missing nodeId returns no warnings', () => {
    const state = makeEmptyState();

    const w = getStockEdgeWarnings(state, 'nonexistent');
    expect(w.inflowMissing).toBe(false);
    expect(w.outflowMissing).toBe(false);
  });

  it('empty state returns no warnings', () => {
    const state = makeEmptyState();

    const w = getStockEdgeWarnings(state, 's');
    expect(w.inflowMissing).toBe(false);
    expect(w.outflowMissing).toBe(false);
  });
});

// ===========================================================================
// Story 4.6 AC2 — getAllEdgeWarnings (single-pass)
// ===========================================================================

describe('StackValidator — getAllEdgeWarnings', () => {
  it('AC2: empty graph returns empty object', () => {
    const state = makeEmptyState();
    const result = getAllEdgeWarnings(state);
    expect(result).toEqual({});
  });

  it('AC2: graph with no stocks returns empty object', () => {
    const state = makeEmptyState();
    state.nodes.src = makeSource('src');
    state.nodes.snk = makeSink('snk');
    state.connections.c = makeConnection('c', 'src', 'snk', 5);

    const result = getAllEdgeWarnings(state);
    expect(result).toEqual({});
  });

  it('AC2: single stock with both missing', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStock('s', 0);

    const result = getAllEdgeWarnings(state);
    expect(result).toEqual({
      s: { inflowMissing: true, outflowMissing: true },
    });
  });

  it('AC2: single stock with only inflow', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStock('s', 0);
    state.nodes.src = makeSource('src');
    state.connections.c = makeConnection('c', 'src', 's', 5);

    const result = getAllEdgeWarnings(state);
    expect(result).toEqual({
      s: { inflowMissing: false, outflowMissing: true },
    });
  });

  it('AC2: single stock with both satisfied', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStock('s', 0);
    state.nodes.src = makeSource('src');
    state.nodes.snk = makeSink('snk');
    state.connections.c1 = makeConnection('c1', 'src', 's', 5);
    state.connections.c2 = makeConnection('c2', 's', 'snk', 3);

    const result = getAllEdgeWarnings(state);
    expect(result).toEqual({
      s: { inflowMissing: false, outflowMissing: false },
    });
  });

  it('AC2: two stocks — one complete, one missing inflow', () => {
    const state = makeEmptyState();
    state.nodes.s1 = makeStock('s1', 0);
    state.nodes.s2 = makeStock('s2', 0);
    state.nodes.src = makeSource('src');
    state.nodes.snk = makeSink('snk');
    // s1: inflow from src, outflow to s2
    state.connections.c1 = makeConnection('c1', 'src', 's1', 5);
    state.connections.c2 = makeConnection('c2', 's1', 's2', 3);
    // s2: inflow from s1, outflow to snk
    state.connections.c3 = makeConnection('c3', 's2', 'snk', 2);

    const result = getAllEdgeWarnings(state);
    // s1: inflow (src→s1) yes, outflow (s1→s2) yes → both satisfied
    // s2: inflow (s1→s2) yes, outflow (s2→snk) yes → both satisfied
    expect(result).toEqual({
      s1: { inflowMissing: false, outflowMissing: false },
      s2: { inflowMissing: false, outflowMissing: false },
    });
  });

  it('AC2: stock-to-stock chain — middle stock has both', () => {
    const state = makeEmptyState();
    state.nodes.sA = makeStock('sA', 0);
    state.nodes.sB = makeStock('sB', 0);
    state.connections.c1 = makeConnection('c1', 'sA', 'sB', 5);

    const result = getAllEdgeWarnings(state);
    expect(result).toEqual({
      sA: { inflowMissing: true, outflowMissing: false },
      sB: { inflowMissing: false, outflowMissing: true },
    });
  });

  it('edge case: stock with multiple inflows', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStock('s', 0);
    state.nodes.src1 = makeSource('src1');
    state.nodes.src2 = makeSource('src2');
    state.connections.c1 = makeConnection('c1', 'src1', 's', 5);
    state.connections.c2 = makeConnection('c2', 'src2', 's', 3);

    const result = getAllEdgeWarnings(state);
    expect(result).toEqual({
      s: { inflowMissing: false, outflowMissing: true },
    });
  });

  it('self-loop satisfies both inflow and outflow', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStock('s', 0);
    // fromId === toId === stockId
    state.connections.self = makeConnection('self', 's', 's', 5);

    const result = getAllEdgeWarnings(state);
    expect(result).toEqual({
      s: { inflowMissing: false, outflowMissing: false },
    });
  });

  it('getStockEdgeWarnings: self-loop satisfies both', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStock('s', 0);
    state.connections.self = makeConnection('self', 's', 's', 5);

    const w = getStockEdgeWarnings(state, 's');
    expect(w.inflowMissing).toBe(false);
    expect(w.outflowMissing).toBe(false);
  });
});

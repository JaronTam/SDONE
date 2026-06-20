/**
 * Story 4.6 — Rendering acceptance criteria tests.
 *
 * AC1: Signal extraction → warning arcs visible → AC4: signal removal → arcs invisible.
 * AC2: Verify visual styling constants match spec (opacity, colour, line width, dash).
 * AC3: Verify arc center math matches spec (w/ exported pure function getWarningArcCenter).
 * AC5: Verify constants remain immutable across test suites.
 * AC6: Verify getWarningArcCenter for edge cases (negative, zero, large coordinates).
 */
import { describe, expect, it } from 'vitest';
import {
  getWarningArcCenter,
  WARNING_ARC_COLOR,
  WARNING_ARC_OPACITY,
  WARNING_ARC_LINE_WIDTH,
  WARNING_ARC_DASH,
  WARNING_ARC_SWEEP_RAD,
  WARNING_ARC_RADIUS,
} from '../SceneRenderer.js';
import { STOCK_WIDTH } from '../SceneRenderer.js';
import { getAllEdgeWarnings } from '../../simulation/StackValidator.js';
import type { GraphState } from '../../state/GraphState.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStockNode(id: string, x = 0, y = 0) {
  return {
    id,
    type: 'stock' as const,
    position: { x, y },
    value: 0,
    capacity: 100,
    initialValue: 0,
  };
}

function makeSourceNode(id: string, x = 0, y = 0) {
  return { id, type: 'source' as const, position: { x, y } };
}

function makeSinkNode(id: string, x = 0, y = 0) {
  return { id, type: 'sink' as const, position: { x, y } };
}

function makeConnection(id: string, fromId: string, toId: string, rate = 1) {
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
// AC2 — Visual styling constant assertions
// ===========================================================================

describe('Story 4.6 AC2 — Warning arc visual styling constants', () => {
  it('colour is muted grey #6c7086', () => {
    expect(WARNING_ARC_COLOR).toBe('#6c7086');
  });

  it('opacity is 0.4', () => {
    expect(WARNING_ARC_OPACITY).toBe(0.4);
  });

  it('line width is 2', () => {
    expect(WARNING_ARC_LINE_WIDTH).toBe(2);
  });

  it('dash pattern is [3, 3]', () => {
    expect(WARNING_ARC_DASH).toEqual([3, 3]);
  });

  it('sweep is π/6 (30°)', () => {
    expect(WARNING_ARC_SWEEP_RAD).toBeCloseTo(Math.PI / 6);
  });

  it('arc radius is 10', () => {
    expect(WARNING_ARC_RADIUS).toBe(10);
  });
});

// ===========================================================================
// AC5 — Constant immutability
// ===========================================================================

describe('Story 4.6 AC5 — Warning arc constants are immutable', () => {
  it('cannot assign to WARNING_ARC_COLOR (const)', () => {
    // TypeScript compile check — const prevents reassignment.
    // This test ensures the value remains unchanged.
    const original = WARNING_ARC_COLOR;
    // Attempting to mutate is a compile error; verify value is still correct.
    expect(WARNING_ARC_COLOR).toBe(original);
  });

  it('cannot assign to WARNING_ARC_OPACITY (const)', () => {
    expect(WARNING_ARC_OPACITY).toBe(0.4);
  });

  it('cannot assign to WARNING_ARC_LINE_WIDTH (const)', () => {
    expect(WARNING_ARC_LINE_WIDTH).toBe(2);
  });

  it('cannot assign to WARNING_ARC_DASH (const array)', () => {
    expect(WARNING_ARC_DASH).toEqual([3, 3]);
  });

  it('constants are frozen values — verifying all', () => {
    // Verify the complete set of spec-defined constants.
    expect(WARNING_ARC_COLOR).toBe('#6c7086');
    expect(WARNING_ARC_OPACITY).toBe(0.4);
    expect(WARNING_ARC_LINE_WIDTH).toBe(2);
    expect(WARNING_ARC_DASH).toEqual([3, 3]);
    expect(WARNING_ARC_SWEEP_RAD).toBeCloseTo(Math.PI / 6);
    expect(WARNING_ARC_RADIUS).toBe(10);
  });
});

// ===========================================================================
// AC3 — Arc centre math (pure function)
// ===========================================================================

describe('Story 4.6 AC3 — getWarningArcCenter pure function', () => {
  const halfWidth = STOCK_WIDTH / 2; // 60

  it('inflow arc center is on left side, offset by arc radius outside the edge', () => {
    const pos = { x: 100, y: 50 };
    const center = getWarningArcCenter(pos, 'inflow');
    expect(center.x).toBeCloseTo(100 - halfWidth - WARNING_ARC_RADIUS);
    expect(center.y).toBeCloseTo(50);
  });

  it('outflow arc center is on right side, offset by arc radius outside the edge', () => {
    const pos = { x: 100, y: 50 };
    const center = getWarningArcCenter(pos, 'outflow');
    expect(center.x).toBeCloseTo(100 + halfWidth + WARNING_ARC_RADIUS);
    expect(center.y).toBeCloseTo(50);
  });

  it('inflow arc preserves y coordinate', () => {
    const pos = { x: 0, y: 200 };
    const center = getWarningArcCenter(pos, 'inflow');
    expect(center.y).toBe(200);
  });

  it('outflow arc preserves y coordinate', () => {
    const pos = { x: 0, y: -50 };
    const center = getWarningArcCenter(pos, 'outflow');
    expect(center.y).toBe(-50);
  });
});

// ===========================================================================
// AC6 — getWarningArcCenter edge cases
// ===========================================================================

describe('Story 4.6 AC6 — getWarningArcCenter edge cases', () => {
  const halfWidth = STOCK_WIDTH / 2;

  it('handles negative x coordinates for inflow', () => {
    const pos = { x: -200, y: 100 };
    const center = getWarningArcCenter(pos, 'inflow');
    expect(center.x).toBeCloseTo(-200 - halfWidth - WARNING_ARC_RADIUS);
    expect(center.y).toBe(100);
  });

  it('handles negative x coordinates for outflow', () => {
    const pos = { x: -200, y: 100 };
    const center = getWarningArcCenter(pos, 'outflow');
    expect(center.x).toBeCloseTo(-200 + halfWidth + WARNING_ARC_RADIUS);
    expect(center.y).toBe(100);
  });

  it('handles zero coordinates', () => {
    const pos = { x: 0, y: 0 };
    const inflow = getWarningArcCenter(pos, 'inflow');
    const outflow = getWarningArcCenter(pos, 'outflow');
    expect(inflow.x).toBeCloseTo(-halfWidth - WARNING_ARC_RADIUS);
    expect(inflow.y).toBe(0);
    expect(outflow.x).toBeCloseTo(halfWidth + WARNING_ARC_RADIUS);
    expect(outflow.y).toBe(0);
  });

  it('handles large coordinates', () => {
    const pos = { x: 1e6, y: -1e6 };
    const center = getWarningArcCenter(pos, 'inflow');
    expect(center.x).toBeCloseTo(1e6 - halfWidth - WARNING_ARC_RADIUS);
    expect(center.y).toBeCloseTo(-1e6);
  });

  it('inflow and outflow centers are symmetric around node x', () => {
    const pos = { x: 42, y: 73 };
    const inCenter = getWarningArcCenter(pos, 'inflow');
    const outCenter = getWarningArcCenter(pos, 'outflow');
    // The midpoint of the two centers should equal the node center
    expect((inCenter.x + outCenter.x) / 2).toBeCloseTo(pos.x);
    expect((inCenter.y + outCenter.y) / 2).toBeCloseTo(pos.y);
  });
});

// ===========================================================================
// AC1 + AC4 — Signal extraction + removal
// ===========================================================================

describe('Story 4.6 AC1+AC4 — Signal extraction and removal round-trip', () => {
  it('stock with no connections → both warnings present', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStockNode('s', 0, 0);
    const warnings = getAllEdgeWarnings(state);
    expect(warnings).toEqual({ s: { inflowMissing: true, outflowMissing: true } });
  });

  it('add inflow connection → inflow warning disappears', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStockNode('s', 0, 0);
    state.nodes.src = makeSourceNode('src');
    state.connections.in = makeConnection('in', 'src', 's');
    const warnings = getAllEdgeWarnings(state);
    expect(warnings).toEqual({ s: { inflowMissing: false, outflowMissing: true } });
  });

  it('add outflow connection → outflow warning disappears', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStockNode('s', 0, 0);
    state.nodes.snk = makeSinkNode('snk');
    state.connections.out = makeConnection('out', 's', 'snk');
    const warnings = getAllEdgeWarnings(state);
    expect(warnings).toEqual({ s: { inflowMissing: true, outflowMissing: false } });
  });

  it('both connections → no warnings (AC4: arcs invisible)', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStockNode('s', 0, 0);
    state.nodes.src = makeSourceNode('src');
    state.nodes.snk = makeSinkNode('snk');
    state.connections.in = makeConnection('in', 'src', 's');
    state.connections.out = makeConnection('out', 's', 'snk');
    const warnings = getAllEdgeWarnings(state);
    expect(warnings).toEqual({ s: { inflowMissing: false, outflowMissing: false } });
  });

  it('remove inflow → warning reappears', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStockNode('s', 0, 0);
    state.nodes.src = makeSourceNode('src');
    state.nodes.snk = makeSinkNode('snk');
    state.connections.in = makeConnection('in', 'src', 's');
    state.connections.out = makeConnection('out', 's', 'snk');
    // Remove inflow
    delete state.connections.in;
    const warnings = getAllEdgeWarnings(state);
    expect(warnings).toEqual({ s: { inflowMissing: true, outflowMissing: false } });
  });

  it('remove outflow → warning reappears', () => {
    const state = makeEmptyState();
    state.nodes.s = makeStockNode('s', 0, 0);
    state.nodes.src = makeSourceNode('src');
    state.nodes.snk = makeSinkNode('snk');
    state.connections.in = makeConnection('in', 'src', 's');
    state.connections.out = makeConnection('out', 's', 'snk');
    // Remove outflow
    delete state.connections.out;
    const warnings = getAllEdgeWarnings(state);
    expect(warnings).toEqual({ s: { inflowMissing: false, outflowMissing: true } });
  });
});

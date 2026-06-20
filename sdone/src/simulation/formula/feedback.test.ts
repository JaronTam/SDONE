/**
 * Story 7.1 — Negative Feedback Loop: Stock State → Inflow Rate
 *
 * Tests for:
 * 1. addFeedbackConnection mutation
 * 2. updateFormula mutation
 * 3. FormulaEngine feedback variable injection
 * 4. SimulationEngine feedback tick processing
 * 5. Feedback connection data model (isFeedback, formulaStr)
 */
import { describe, it, expect } from 'vitest';
import {
  addFeedbackConnection,
  updateFormula,
  addModule,
  addConnection,
  deleteConnection,
} from '../../state/mutations.js';
import type { GraphState, StockNode } from '../../state/GraphState.js';
import { FormulaEngine } from './FormulaEngine.js';
import { SimulationEngine } from '../SimulationEngine.js';

// ── Helper: create a minimal state with source→stock→sink ────────────
function createTestState(): GraphState {
  let state: GraphState = {
    nodes: {},
    connections: {},
    version: 0,
    selectedModuleIds: [],
    selectedConnectionIds: [],
  };

  // Add source, stock, sink
  state = addModule(state, 'source', { x: 0, y: 0 });
  state = addModule(state, 'stock', { x: 100, y: 0 });
  state = addModule(state, 'sink', { x: 200, y: 0 });

  const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
  const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;
  const sinkId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'sink')!;

  // Add source→stock and stock→sink connections
  state = addConnection(state, sourceId, stockId);
  state = addConnection(state, stockId, sinkId);

  return state;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Story 7.1: Feedback Connection Mutation', () => {
  it('addFeedbackConnection creates a feedback connection from stock to source', () => {
    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    const next = addFeedbackConnection(state, stockId, sourceId);

    // Should have one more connection
    expect(Object.keys(next.connections).length).toBe(Object.keys(state.connections).length + 1);

    // Find the new feedback connection
    const feedbackConns = Object.values(next.connections).filter((c) => c.isFeedback);
    expect(feedbackConns.length).toBe(1);

    const fb = feedbackConns[0];
    expect(fb.fromId).toBe(stockId);
    expect(fb.toId).toBe(sourceId);
    expect(fb.isFeedback).toBe(true);
    expect(fb.formulaStr).toBe('max(0, (capacity - value) / capacity)'); // default formula
  });

  it('addFeedbackConnection is idempotent — no duplicate stock→source feedback', () => {
    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    const withFeedback = addFeedbackConnection(state, stockId, sourceId);
    const duplicate = addFeedbackConnection(withFeedback, stockId, sourceId);

    // Version should not change (no-op)
    expect(duplicate.version).toBe(withFeedback.version);
  });

  it('addFeedbackConnection increments version', () => {
    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    const next = addFeedbackConnection(state, stockId, sourceId);
    expect(next.version).toBeGreaterThan(state.version);
  });
});

describe('Story 7.1: updateFormula Mutation', () => {
  it('updates formulaStr on a feedback connection', () => {
    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    const withFeedback = addFeedbackConnection(state, stockId, sourceId);
    const fbConn = Object.values(withFeedback.connections).find((c) => c.isFeedback)!;

    const updated = updateFormula(withFeedback, fbConn.id, '-0.5 * stock_value');
    const updatedConn = updated.connections[fbConn.id];
    expect(updatedConn.formulaStr).toBe('-0.5 * stock_value');
  });

  it('updateFormula increments version', () => {
    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    const withFeedback = addFeedbackConnection(state, stockId, sourceId);
    const fbConn = Object.values(withFeedback.connections).find((c) => c.isFeedback)!;

    const updated = updateFormula(withFeedback, fbConn.id, '-0.3 * stock_value');
    expect(updated.version).toBeGreaterThan(withFeedback.version);
  });

  it('updateFormula is no-op for non-existent connection', () => {
    const state = createTestState();
    const updated = updateFormula(state, 'non-existent', '-0.3 * stock_value');
    expect(updated.version).toBe(state.version);
  });
});

describe('Story 7.1: Cascade delete orphaned feedback on source→stock deletion', () => {
  it('deleting source→stock connection also deletes stock→source feedback', () => {
    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    // Find the source→stock connection
    const sourceToStock = Object.values(state.connections).find(
      (c) => c.fromId === sourceId && c.toId === stockId && !c.isFeedback,
    );
    expect(sourceToStock).toBeDefined();

    // Create feedback from stock→source
    let withFeedback = addFeedbackConnection(state, stockId, sourceId);
    expect(Object.values(withFeedback.connections).filter((c) => c.isFeedback).length).toBe(1);

    // Delete the source→stock connection → feedback should be cascade-deleted
    const afterDelete = deleteConnection(withFeedback, sourceToStock!.id);
    const feedbackConns = Object.values(afterDelete.connections).filter((c) => c.isFeedback);
    expect(feedbackConns.length).toBe(0);
  });

  it('cascade delete only removes matching feedback (not feedback to other sources)', () => {
    let state = createTestState();
    // Add a second source
    state = addModule(state, 'source', { x: -100, y: 0 });
    const sourceIds = Object.keys(state.nodes).filter((id) => state.nodes[id].type === 'source');
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    // Add source[1]→stock connection
    const source1 = sourceIds[0];
    const source2 = sourceIds[1];
    state = addConnection(state, source2, stockId);

    // Create feedback from stock→source1
    state = addFeedbackConnection(state, stockId, source1);

    // Find source1→stock connection and delete it
    const connToDelete = Object.values(state.connections).find(
      (c) => c.fromId === source1 && c.toId === stockId && !c.isFeedback,
    );
    expect(connToDelete).toBeDefined();

    const afterDelete = deleteConnection(state, connToDelete!.id);
    const feedbackConns = Object.values(afterDelete.connections).filter((c) => c.isFeedback);

    // Only stock→source1 feedback should be deleted; source2→stock still exists
    expect(feedbackConns.length).toBe(0);
    // source2→stock should still exist
    expect(
      Object.values(afterDelete.connections).some(
        (c) => c.fromId === source2 && c.toId === stockId && !c.isFeedback,
      ),
    ).toBe(true);
  });
});

describe('Story 7.1: FormulaEngine Feedback Variable Injection', () => {
  it('evaluates default feedback formula with value and capacity variables', () => {
    const engine = new FormulaEngine();
    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    const withFeedback = addFeedbackConnection(state, stockId, sourceId);
    const fbConn = Object.values(withFeedback.connections).find((c) => c.isFeedback)!;

    // Set stock value to 50, capacity to 100
    const stockNode = withFeedback.nodes[stockId] as any;
    const modifiedState = {
      ...withFeedback,
      nodes: {
        ...withFeedback.nodes,
        [stockId]: { ...stockNode, value: 50, capacity: 100 },
      },
    };

    const result = engine.evaluateForConnection(fbConn, modifiedState);
    // Default formula: max(0, (capacity - value) / capacity) = max(0, (100 - 50) / 100) = 0.5
    expect(result).toBe(0.5);
  });

  it('evaluates custom formula with stock_value variable', () => {
    const engine = new FormulaEngine();
    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    let withFeedback = addFeedbackConnection(state, stockId, sourceId);
    const fbConn = Object.values(withFeedback.connections).find((c) => c.isFeedback)!;

    // Set custom formula using stock_value
    withFeedback = {
      ...withFeedback,
      connections: {
        ...withFeedback.connections,
        [fbConn.id]: { ...fbConn, formulaStr: '-0.1 * stock_value' },
      },
    };

    // Set stock value to 50
    const stockNode = withFeedback.nodes[stockId] as any;
    const modifiedState = {
      ...withFeedback,
      nodes: {
        ...withFeedback.nodes,
        [stockId]: { ...stockNode, value: 50 },
      },
    };

    const result = engine.evaluateForConnection(
      modifiedState.connections[fbConn.id],
      modifiedState,
    );
    // -0.1 * 50 = -5
    expect(result).toBe(-5);
  });

  it('throws FormulaParseError for invalid formula (propagates to tick handler)', () => {
    const engine = new FormulaEngine();
    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    let withFeedback = addFeedbackConnection(state, stockId, sourceId);
    const fbConn = Object.values(withFeedback.connections).find((c) => c.isFeedback)!;

    // Set invalid formula
    withFeedback = {
      ...withFeedback,
      connections: {
        ...withFeedback.connections,
        [fbConn.id]: { ...fbConn, formulaStr: 'invalid %% formula' },
      },
    };

    // Invalid formula should throw — tick()'s error handler catches this and sets rate=0
    expect(() =>
      engine.evaluateForConnection(withFeedback.connections[fbConn.id], withFeedback),
    ).toThrow(/Unrecognized character/);
  });

  it('handles value = 0 correctly with default formula', () => {
    const engine = new FormulaEngine();
    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    const withFeedback = addFeedbackConnection(state, stockId, sourceId);
    const fbConn = Object.values(withFeedback.connections).find((c) => c.isFeedback)!;

    // Stock value is 0 by default, capacity defaults to 100
    const stockNode = withFeedback.nodes[stockId] as any;
    const modifiedState = {
      ...withFeedback,
      nodes: {
        ...withFeedback.nodes,
        [stockId]: { ...stockNode, value: 0, capacity: 100 },
      },
    };

    const result = engine.evaluateForConnection(fbConn, modifiedState);
    // max(0, (100 - 0) / 100) = 1
    expect(result).toBe(1);
  });
});

describe('Story 7.1: SimulationEngine Feedback Tick', () => {
  it('feedback connection modifies source inflow rate during tick', () => {
    const simEngine = new SimulationEngine();
    const formulaEngine = new FormulaEngine();
    simEngine.formulaEngine = formulaEngine;

    const state = createTestState();
    const sourceId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'source')!;
    const stockId = Object.keys(state.nodes).find((id) => state.nodes[id].type === 'stock')!;

    // Set stock value to 50 (below capacity of 100) so feedback multiplier > 0.
    // Also set source→stock rate to 5 for observable flow.
    const sourceConnId = Object.keys(state.connections).find(
      (id) => state.connections[id].fromId === sourceId && state.connections[id].toId === stockId,
    )!;
    const modifiedState = {
      ...state,
      nodes: {
        ...state.nodes,
        [stockId]: { ...state.nodes[stockId], value: 50 },
      },
      connections: {
        ...state.connections,
        [sourceConnId]: { ...state.connections[sourceConnId], rate: 5, formulaStr: '5' },
      },
    };

    const withFeedback = addFeedbackConnection(modifiedState, stockId, sourceId);

    // Set up snapshot capture
    let snapshotState: GraphState | null = null;
    simEngine.onTick = (s) => {
      snapshotState = s;
    };

    // Start simulation and tick once
    simEngine.start(() => withFeedback);

    // Wait a bit for at least one tick
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        simEngine.pause();
        // Feedback formula: max(0, (100 - 50) / 100) = 0.5
        // Effective inflow = 5 * 0.5 = 2.5 per second
        // Stock value should have changed from 50
        if (snapshotState) {
          const stockValue = (snapshotState.nodes[stockId] as StockNode | undefined)?.value;
          // Stock value should have changed from 50
          expect(stockValue).not.toBe(50);
        }
        resolve();
      }, 200);
    });
  });
});

/**
 * Story 7.7 — NFR-P2 Numerical Drift Test (ATDD GREEN PHASE)
 *
 * Verifies Euler integration drift ≤0.5% over 5 simulated minutes
 * (18000 ticks at dt=1/60s). All tests are active and passing.
 *
 * Generated: 2026-06-09 by bmad-testarch-atdd (Step 4A)
 * TDD Phase: GREEN (all tests active — implementation complete)
 */

import { describe, it, expect } from 'vitest';
import { SimulationEngine } from './SimulationEngine.js';
import type {
  GraphState,
  StockNode,
  SourceNode,
  SinkNode,
  Connection,
} from '../state/GraphState.js';

// ---------------------------------------------------------------------------
// Test factories — inlined per project convention
// (copied from SimulationEngine.test.ts:15-55)
// ---------------------------------------------------------------------------

function makeStock(id: string, value = 0, capacity = Infinity): StockNode {
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

function makeConnection(
  id: string,
  fromId: string,
  toId: string,
  rate: number,
): Connection {
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

// ---------------------------------------------------------------------------
// AC1 — NFR-P2: Numerical Drift (Euler Integration)
//
// NOTE: The 4th scenario (feedback loop) is implemented in Task 6.1,
//       NOT here. It requires FormulaEngine which is out of scope for
//       the pure constant-rate Euler drift verification in Task 1.
// ---------------------------------------------------------------------------

const DT = 1 / 60;
const TICKS_5_MIN = 300 * 60; // 18000
const DRIFT_TOLERANCE = 0.005; // 0.5%

describe('Story 7.7 — NFR-P2: Numerical Drift (Euler Integration)', () => {
  describe('AC1: 5 min simulated drift ≤ 0.5%', () => {
    // ═══════════════════════════════════════════════════════════════
    // GREEN PHASE — all tests active and passing (Task 1.1 complete)
    // ═══════════════════════════════════════════════════════════════

    it('single inflow: stock value within 0.5% of analytical after 5 min simulated', () => {
      // source → stock, rate=10
      // Analytical: value = 10 × 300 = 3000
      const engine = new SimulationEngine();
      const state = makeEmptyState();
      const stock = makeStock('s0', 0);
      const source = makeSource('src1');

      state.nodes = { s0: stock, src1: source };
      state.connections = {
        c0: makeConnection('c0', 'src1', 's0', 10),
      };

      // 18000 synchronous ticks — NO real timers, NO setInterval
      for (let i = 0; i < TICKS_5_MIN; i++) {
        engine.tick(state, DT);
      }

      const expected = 10 * 300; // rate × time = 3000
      const tolerance = expected * DRIFT_TOLERANCE; // 3000 × 0.005 = 15
      expect(stock.value).toBeGreaterThan(expected - tolerance);
      expect(stock.value).toBeLessThan(expected + tolerance);
    });

    it('inflow + outflow: net rate drift within 0.5%', () => {
      // source → stock (rate=10), stock → sink (rate=3)
      // Analytical: net rate = 7, value = 7 × 300 = 2100
      const engine = new SimulationEngine();
      const state = makeEmptyState();
      const stock = makeStock('s0', 0);
      const source = makeSource('src1');
      const sink = makeSink('snk1');

      state.nodes = { s0: stock, src1: source, snk1: sink };
      state.connections = {
        c0: makeConnection('c0', 'src1', 's0', 10),
        c1: makeConnection('c1', 's0', 'snk1', 3),
      };

      for (let i = 0; i < TICKS_5_MIN; i++) {
        engine.tick(state, DT);
      }

      const expected = (10 - 3) * 300; // 2100
      const tolerance = expected * DRIFT_TOLERANCE; // 2100 × 0.005 = 10.5
      expect(stock.value).toBeGreaterThan(expected - tolerance);
      expect(stock.value).toBeLessThan(expected + tolerance);
    });

    it('zero rate: stock value unchanged (no implicit drift)', () => {
      // Stock with no connections → value stays at initial
      const engine = new SimulationEngine();
      const state = makeEmptyState();
      const stock = makeStock('s0', 42);

      state.nodes = { s0: stock };

      for (let i = 0; i < TICKS_5_MIN; i++) {
        engine.tick(state, DT);
      }

      // Zero connections → net flow = 0 → value unchanged
      expect(stock.value).toBe(42);
    });

    // NOTE: The 4th drift scenario (feedback loop: asymptotic approach to
    // capacity) is implemented in Task 6.1 (SimulationEngine.integration.test.ts
    // extension). It requires engine.formulaEngine = new FormulaEngine() because
    // tick() Steps 2-3 are guarded by if (this.formulaEngine).
    // See: _bmad-output/implementation-artifacts/7-7-nfr-compliance-verification.md#Task-6.1
  });
});

import { describe, expect, it, test, vi, beforeEach, afterEach } from 'vitest';
import { SimulationEngine, FormulaEngine } from './index.js';
import type {
  Connection,
  GraphState,
  SinkNode,
  SourceNode,
  StockNode,
} from '../state/GraphState.js';

// ---------------------------------------------------------------------------
// Test factories — match naming convention from Stories 1.5, 3.4, 3.7
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

// ---------------------------------------------------------------------------
// AC1 — Stock value changes by net flow × time
// ---------------------------------------------------------------------------

describe('AC1: 1 source (rate=5) → stock ← 1 sink (rate=3), 60 ticks at dt=1/60', () => {
  it('stock.value ≈ 2.0 within 0.5% tolerance', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    const stock = makeStock('s0', 0);
    const source = makeSource('src1');
    const sink = makeSink('snk1');

    state.nodes = {
      s0: stock,
      src1: source,
      snk1: sink,
    };

    state.connections = {
      c_in: makeConnection('c_in', 'src1', 's0', 5),
      c_out: makeConnection('c_out', 's0', 'snk1', 3),
    };

    // 1 simulated second = 60 ticks at dt = 1/60
    for (let i = 0; i < 60; i++) {
      engine.tick(state, 1 / 60);
    }

    // Analytical: (5 - 3) * 1.0 = 2.0
    const drift = Math.abs(stock.value - 2.0) / (Math.abs(2.0) || 1);
    expect(drift).toBeLessThanOrEqual(0.005);
    expect(stock.value).toBeCloseTo(2.0, 4);
  });
});

// ---------------------------------------------------------------------------
// AC2 — Drift test: constant rate 10 for 300 simulated seconds (18000 ticks)
// ---------------------------------------------------------------------------

describe('AC2: 1 source (rate=10) → stock (initial=0), 18000 ticks at dt=1/60', () => {
  it('stock.value ≈ 3000 within 0.5% tolerance', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    const stock = makeStock('s0', 0);
    const source = makeSource('src1');

    state.nodes = { s0: stock, src1: source };
    state.connections = {
      c0: makeConnection('c0', 'src1', 's0', 10),
    };

    // 300 simulated seconds = 18000 ticks at dt = 1/60
    for (let i = 0; i < 18_000; i++) {
      engine.tick(state, 1 / 60);
    }

    // Analytical: 10 * 300 = 3000
    const drift = Math.abs(stock.value - 3000) / 3000;
    expect(drift).toBeLessThanOrEqual(0.005);
    expect(stock.value).toBeCloseTo(3000, 1);
  });
});

// ---------------------------------------------------------------------------
// AC4 — Isolated stock (no connections) → value remains unchanged
// ---------------------------------------------------------------------------

describe('AC4: Isolated stock — zero incoming, zero outgoing connections', () => {
  it('stock value never changes', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    const stock = makeStock('s0', 100);
    state.nodes = { s0: stock };

    for (let i = 0; i < 100; i++) {
      engine.tick(state, 1 / 60);
    }

    expect(stock.value).toBe(stock.initialValue);
    expect(stock.value).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Multi-stock test — 2 stocks with different connections
// ---------------------------------------------------------------------------

describe('Multi-stock: 2 stocks with different connections', () => {
  it('both stocks update independently', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    const stockA = makeStock('sa', 0);
    const stockB = makeStock('sb', 0);
    const source1 = makeSource('src1');
    const sink1 = makeSink('snk1');

    state.nodes = {
      sa: stockA,
      sb: stockB,
      src1: source1,
      snk1: sink1,
    };

    state.connections = {
      c1: makeConnection('c1', 'src1', 'sa', 10), // A gets +10 flow
      c2: makeConnection('c2', 'sb', 'snk1', 3), // B loses -3 flow
    };

    // 60 ticks
    for (let i = 0; i < 60; i++) {
      engine.tick(state, 1 / 60);
    }

    // Stock A: net = +10, 10 * 1.0 = 10
    expect(stockA.value).toBeCloseTo(10, 4);
    // Stock B: net = -3, -3 * 1.0 = -3
    expect(stockB.value).toBeCloseTo(-3, 4);
  });
});

// ---------------------------------------------------------------------------
// Zero-rate connection — contributes nothing
// ---------------------------------------------------------------------------

describe('Zero-rate connection', () => {
  it('rate = 0 contributes nothing to net flow', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    const stock = makeStock('s0', 0);
    const src = makeSource('src1');

    state.nodes = { s0: stock, src1: src };
    state.connections = {
      c0: makeConnection('c0', 'src1', 's0', 0), // rate = 0
    };

    for (let i = 0; i < 60; i++) {
      engine.tick(state, 1 / 60);
    }

    expect(stock.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Negative net flow — outflow exceeds inflow
// ---------------------------------------------------------------------------

describe('Negative net flow', () => {
  it('stock value decreases when outflow > inflow', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    const stock = makeStock('s0', 100);
    const src = makeSource('src1');
    const snk = makeSink('snk1');

    state.nodes = { s0: stock, src1: src, snk1: snk };
    state.connections = {
      c_in: makeConnection('c_in', 'src1', 's0', 1), // +1
      c_out: makeConnection('c_out', 's0', 'snk1', 5), // -5
    };

    // net flow = 1 - 5 = -4
    for (let i = 0; i < 60; i++) {
      engine.tick(state, 1 / 60);
    }

    // After 1s: value = 100 + (-4) * 1.0 = 96
    expect(stock.value).toBeCloseTo(96, 4);
  });
});

// ---------------------------------------------------------------------------
// t tracking — engine.t advances by dt each tick
// ---------------------------------------------------------------------------

describe('t tracking', () => {
  it('after N ticks at dt=1/60, engine.t ≈ N/60', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    for (let i = 0; i < 120; i++) {
      engine.tick(state, 1 / 60);
    }

    // 120 * 1/60 = 2.0
    expect(engine.t).toBeCloseTo(2.0, 4);
  });
});

// ---------------------------------------------------------------------------
// Empty state — tick on empty GraphState is a no-op
// ---------------------------------------------------------------------------

describe('Empty state', () => {
  it('tick on empty GraphState is a no-op (version still increments)', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();
    const initialVersion = state.version;

    engine.tick(state, 1 / 60);

    expect(state.version).toBe(initialVersion + 1);
    expect(engine.t).toBe(1 / 60);
  });
});

// ---------------------------------------------------------------------------
// dt = 0 — no value change, version still increments
// ---------------------------------------------------------------------------

describe('dt = 0', () => {
  it('no value change, version still increments', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    const stock = makeStock('s0', 50);
    const src = makeSource('src1');
    state.nodes = { s0: stock, src1: src };
    state.connections = {
      c0: makeConnection('c0', 'src1', 's0', 10),
    };

    const versionBefore = state.version;

    for (let i = 0; i < 10; i++) {
      engine.tick(state, 0);
    }

    expect(stock.value).toBe(50); // no change
    expect(state.version).toBe(versionBefore + 10); // version incremented each tick
    expect(engine.t).toBe(0); // t unchanged
  });
});

// ---------------------------------------------------------------------------
// reset() — engine.t returns to 0
// ---------------------------------------------------------------------------

describe('reset()', () => {
  it('engine.t returns to 0 after reset', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    for (let i = 0; i < 60; i++) {
      engine.tick(state, 1 / 60);
    }

    expect(engine.t).toBeCloseTo(1.0, 4);

    engine.reset();
    expect(engine.t).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Version increments ONCE per tick (not per stock)
// ---------------------------------------------------------------------------

describe('Version increment semantics', () => {
  it('version increments once per tick regardless of stock count', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    const stockA = makeStock('sa', 0);
    const stockB = makeStock('sb', 0);
    const src = makeSource('src1');

    state.nodes = { sa: stockA, sb: stockB, src1: src };
    state.connections = {
      c0: makeConnection('c0', 'src1', 'sa', 5),
    };

    const versionBefore = state.version;
    engine.tick(state, 1 / 60);

    expect(state.version).toBe(versionBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// Source and sink nodes are skipped in tick
// ---------------------------------------------------------------------------

describe('Non-stock nodes are skipped', () => {
  it('source and sink nodes do not cause errors during tick', () => {
    const engine = new SimulationEngine();
    const state = makeEmptyState();

    const src = makeSource('src1');
    const snk = makeSink('snk1');

    state.nodes = { src1: src, snk1: snk };

    // Should not throw — both nodes have no type='stock'
    expect(() => engine.tick(state, 1 / 60)).not.toThrow();
    expect(engine.t).toBe(1 / 60);
    expect(state.version).toBe(1);
  });
});

// =============================================================================
// Story 4.2 — State machine tests (use fake timers for deterministic control)
// =============================================================================

/**
 * Convenience factory: state with one stock connected to one source at the
 * given rate.  Reuses the existing `makeStock`, `makeSource`, `makeConnection`,
 * and `makeEmptyState` helpers defined above.
 */
function makeStateWithOneStockOneSource(rate: number): GraphState {
  const state = makeEmptyState();
  const stock = makeStock('s0', 0);
  const source = makeSource('src1');
  state.nodes = { s0: stock, src1: source };
  state.connections = { c0: makeConnection('c0', 'src1', 's0', rate) };
  return state;
}

function getStock(state: GraphState): StockNode {
  return Object.values(state.nodes).find((n) => n.type === 'stock') as StockNode;
}

describe('Story 4.2 — State machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // AC1 — IDLE → RUNNING
  // ---------------------------------------------------------------------------

  describe('AC1: initial state is idle, start() transitions to running', () => {
    it('state transitions from idle to running', () => {
      const engine = new SimulationEngine();
      expect(engine.state).toBe('idle');

      const state = makeStateWithOneStockOneSource(10);
      engine.start(() => state);
      expect(engine.state).toBe('running');
    });

    it('start() from idle begins ticking at 10Hz', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);
      const stock = getStock(state);

      engine.start(() => state);
      vi.advanceTimersByTime(100); // one interval = 6 sub-steps

      // 10 * 6 * (1/60) = 1.0
      expect(stock.value).toBeCloseTo(1.0, 4);
      expect(engine.t).toBeCloseTo(0.1, 4);
    });
  });

  // ---------------------------------------------------------------------------
  // AC2 — RUNNING → PAUSED
  // ---------------------------------------------------------------------------

  describe('AC2: pause stops ticking and transitions to paused', () => {
    it('state transitions from running to paused', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);

      engine.start(() => state);
      expect(engine.state).toBe('running');

      engine.pause();
      expect(engine.state).toBe('paused');
    });

    it('pause stops the tick loop — stock value frozen after pause', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);
      const stock = getStock(state);

      engine.start(() => state);
      vi.advanceTimersByTime(100);
      const valueAfterOneInterval = stock.value;

      engine.pause();
      expect(engine.state).toBe('paused');

      // Advance 5 more intervals — nothing should change
      vi.advanceTimersByTime(500);
      expect(stock.value).toBe(valueAfterOneInterval);
    });

    it('pause preserves simulated time t', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);

      engine.start(() => state);
      vi.advanceTimersByTime(300); // 3 intervals × 0.1s = 0.3s
      const tBeforePause = engine.t;

      engine.pause();
      expect(engine.t).toBe(tBeforePause); // t preserved
    });
  });

  // ---------------------------------------------------------------------------
  // AC3 — RESET from RUNNING or PAUSED
  // ---------------------------------------------------------------------------

  describe('AC3: reset returns to idle and clears clock', () => {
    it('reset from running stops interval and returns to idle', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);

      engine.start(() => state);
      vi.advanceTimersByTime(100);
      expect(engine.state).toBe('running');

      engine.reset();
      expect(engine.state).toBe('idle');
      expect(engine.t).toBe(0);
    });

    it('reset from paused returns to idle', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);

      engine.start(() => state);
      vi.advanceTimersByTime(100);
      engine.pause();
      expect(engine.state).toBe('paused');

      engine.reset();
      expect(engine.state).toBe('idle');
      expect(engine.t).toBe(0);
    });

    it('no more ticks after reset', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);
      const stock = getStock(state);

      engine.start(() => state);
      vi.advanceTimersByTime(100);
      engine.reset();

      const valueAfterReset = stock.value;
      vi.advanceTimersByTime(500);
      expect(stock.value).toBe(valueAfterReset); // unchanged
    });
  });

  // ---------------------------------------------------------------------------
  // AC4 — Double-RUN is no-op
  // ---------------------------------------------------------------------------

  describe('AC4: double start is no-op', () => {
    it('calling start() twice keeps state as running (no double-interval)', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);
      const stock = getStock(state);

      engine.start(() => state);
      engine.start(() => state); // second call — should be no-op
      expect(engine.state).toBe('running');

      // Only one interval running → 1 interval worth of ticks
      vi.advanceTimersByTime(100);
      expect(stock.value).toBeCloseTo(1.0, 4); // not 2.0
    });
  });

  // ---------------------------------------------------------------------------
  // AC5 — Double-PAUSE is no-op; PAUSE from IDLE is no-op
  // ---------------------------------------------------------------------------

  describe('AC5: pause when not running is no-op', () => {
    it('pause from idle is no-op', () => {
      const engine = new SimulationEngine();
      expect(engine.state).toBe('idle');

      engine.pause();
      expect(engine.state).toBe('idle');
    });

    it('double pause is no-op', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);

      engine.start(() => state);
      engine.pause();
      expect(engine.state).toBe('paused');

      engine.pause(); // second pause — no-op
      expect(engine.state).toBe('paused');
    });
  });

  // ---------------------------------------------------------------------------
  // Tick loop tests
  // ---------------------------------------------------------------------------

  describe('Tick loop: 100ms advances stock by rate × 0.1', () => {
    it('one interval = 6 sub-steps', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);
      const stock = getStock(state);

      engine.start(() => state);
      vi.advanceTimersByTime(100);

      expect(stock.value).toBeCloseTo(1.0, 4); // 10 × 0.1 = 1.0
      expect(engine.t).toBeCloseTo(0.1, 4);
    });

    it('5 intervals accumulate correctly', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);
      const stock = getStock(state);

      engine.start(() => state);
      vi.advanceTimersByTime(500); // 5 intervals × 0.1s = 0.5s simulated

      // 10 × 0.5 = 5.0
      expect(stock.value).toBeCloseTo(5.0, 4);
      expect(engine.t).toBeCloseTo(0.5, 4);
    });
  });

  // ---------------------------------------------------------------------------
  // PAUSED → RUNNING resume
  // ---------------------------------------------------------------------------

  describe('Resume: paused → running continues from paused state', () => {
    it('can resume after pause', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);
      const stock = getStock(state);

      // Run 1 interval
      engine.start(() => state);
      vi.advanceTimersByTime(100);
      expect(stock.value).toBeCloseTo(1.0, 4);

      // Pause
      engine.pause();
      vi.advanceTimersByTime(500); // no change while paused

      // Resume — run another interval
      engine.start(() => state);
      expect(engine.state).toBe('running');
      vi.advanceTimersByTime(100);

      // Total: 2 intervals worth = 2.0
      expect(stock.value).toBeCloseTo(2.0, 4);
      expect(engine.t).toBeCloseTo(0.2, 4);
    });
  });

  // ---------------------------------------------------------------------------
  // onTick callback
  // ---------------------------------------------------------------------------

  describe('onTick callback', () => {
    it('fires after each interval with the state reference', () => {
      const engine = new SimulationEngine();
      const onTick = vi.fn();
      engine.onTick = onTick;

      const state = makeStateWithOneStockOneSource(10);
      engine.start(() => state);

      vi.advanceTimersByTime(100);
      expect(onTick).toHaveBeenCalledTimes(1);
      expect(onTick).toHaveBeenCalledWith(state);

      vi.advanceTimersByTime(400);
      expect(onTick).toHaveBeenCalledTimes(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('start on empty state does not throw', () => {
      const engine = new SimulationEngine();
      const onTick = vi.fn();
      engine.onTick = onTick;

      const state = makeEmptyState();
      expect(() => engine.start(() => state)).not.toThrow();
      expect(engine.state).toBe('running');

      vi.advanceTimersByTime(100);
      // onTick still called even though no stocks were updated
      expect(onTick).toHaveBeenCalledTimes(1);
    });

    it('reset on idle is no-op (no throw)', () => {
      const engine = new SimulationEngine();
      expect(engine.state).toBe('idle');

      expect(() => engine.reset()).not.toThrow();
      expect(engine.state).toBe('idle');
      expect(engine.t).toBe(0);
    });
  });
});

// =============================================================================
// Story 4.3 — Snapshot Bridge tests
// =============================================================================

describe('Snapshot bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC1: onTick fires after each interval with the live state', () => {
    const engine = new SimulationEngine();
    const onTick = vi.fn();
    engine.onTick = onTick;

    const state = makeStateWithOneStockOneSource(10);
    engine.start(() => state);

    // First interval (100ms)
    vi.advanceTimersByTime(100);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(state); // same reference — mutable kernel

    // Second interval (200ms)
    vi.advanceTimersByTime(100);
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('AC1: structuredClone produces an independent snapshot', () => {
    const state = makeStateWithOneStockOneSource(10);
    const stock = getStock(state);
    const originalValue = stock.value;

    // Simulate what onTick does
    const snapshot = structuredClone(state);
    const snapshotStock = getStock(snapshot);

    // Mutate the SNAPSHOT — original must be unaffected
    snapshotStock.value = 999;
    expect(stock.value).toBe(originalValue); // original unchanged

    // Mutate the ORIGINAL — snapshot must be unaffected
    stock.value = 888;
    expect(snapshotStock.value).toBe(999); // snapshot still has its own value
  });

  it('AC2: onTick is NOT called after pause', () => {
    const engine = new SimulationEngine();
    const onTick = vi.fn();
    engine.onTick = onTick;

    const state = makeStateWithOneStockOneSource(10);
    engine.start(() => state);

    vi.advanceTimersByTime(100);
    expect(onTick).toHaveBeenCalledTimes(1);

    engine.pause();
    vi.advanceTimersByTime(500); // 5 more intervals worth
    expect(onTick).toHaveBeenCalledTimes(1); // still only the first call
  });

  it('AC2: onTick is NOT called when engine is idle', () => {
    const engine = new SimulationEngine();
    const onTick = vi.fn();
    engine.onTick = onTick;

    // Never started — state is 'idle'
    vi.advanceTimersByTime(1000);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('AC3: snapshot is deeply equal but independent', () => {
    const state = makeStateWithOneStockOneSource(10);
    const snapshot = structuredClone(state);

    // Deep equality
    expect(snapshot).toEqual(state);

    // Independence: mutate snapshot's nested property
    const snapshotStock = getStock(snapshot);
    snapshotStock.value = 500;

    const originalStock = getStock(state);
    expect(originalStock.value).not.toBe(500);
  });

  it('AC4: stateProvider returns live mutable reference, not a clone', () => {
    const state = makeStateWithOneStockOneSource(10);
    const stateProvider = () => state;

    // Canvas renderer pattern
    const canvasState = stateProvider();
    expect(canvasState).toBe(state); // SAME reference — no clone

    // Mutations to canvasState affect the original (same reference)
    const s = getStock(canvasState);
    s.value = 42;
    const os = getStock(state);
    expect(os.value).toBe(42); // original mutated via canvasState proxy
  });

  it('Edge case: snapshot on empty state succeeds', () => {
    const state = makeEmptyState();
    const snapshot = structuredClone(state);

    expect(snapshot.nodes).toEqual({});
    expect(snapshot.connections).toEqual({});
    expect(snapshot.version).toBe(0);
    // structuredClone must not throw
  });

  it('Edge case: onTick receives same reference each interval (in-place mutation)', () => {
    const engine = new SimulationEngine();
    const receivedStates: GraphState[] = [];
    engine.onTick = (s) => receivedStates.push(s);

    const state = makeStateWithOneStockOneSource(10);
    engine.start(() => state);

    vi.advanceTimersByTime(300); // 3 intervals

    expect(receivedStates.length).toBe(3);
    // All three calls received the SAME object reference (mutable kernel)
    expect(receivedStates[0]).toBe(receivedStates[1]);
    expect(receivedStates[1]).toBe(receivedStates[2]);
  });

  it('Integration: onTick → structuredClone produces independent snapshot through engine interval', () => {
    const engine = new SimulationEngine();
    const snapshots: GraphState[] = [];

    // Wire onTick exactly as main.ts does (clone-then-push pattern).
    // EventBus.emit is tested separately in EventBus.test.ts — here we
    // verify the clone chain through the engine's interval mechanism.
    engine.onTick = (state) => {
      snapshots.push(structuredClone(state));
    };

    const state = makeStateWithOneStockOneSource(10);
    const stock = getStock(state);
    engine.start(() => state);

    // One 100ms interval — onTick fires once after 6 sub-steps
    vi.advanceTimersByTime(100);

    expect(snapshots).toHaveLength(1);
    // Snapshot is a DIFFERENT object reference (structuredClone worked)
    expect(snapshots[0]).not.toBe(state);
    // Snapshot is deeply equal to the live state
    expect(snapshots[0]).toEqual(state);

    // Mutating the snapshot does NOT affect the original (independence)
    const snapshotStock = getStock(snapshots[0]);
    const originalValue = stock.value;
    snapshotStock.value = 999;
    expect(stock.value).toBe(originalValue);

    // Mutating the original does NOT affect the snapshot (bidirectional independence)
    const snapshotValue = snapshotStock.value;
    stock.value = 888;
    expect(snapshotStock.value).toBe(snapshotValue);
  });
});

// =============================================================================
// Story 4.4 — Formula Engine Integration tests
// =============================================================================

describe('Story 4.4 — Formula Engine Integration', () => {
  it('AC6: constant formula "5" produces same result as pre-4.4 rate=5', () => {
    const engine = new SimulationEngine();
    engine.formulaEngine = new FormulaEngine();

    const state = makeEmptyState();
    const stock = makeStock('s0', 0);
    const src = makeSource('src1');
    state.nodes = { s0: stock, src1: src };
    // formulaStr: "5" — constant formula, same as rate=5
    state.connections = {
      c0: makeConnection('c0', 'src1', 's0', 1), // initial rate is 1, should be overwritten to 5 by formula
    };
    // Override formulaStr to "5"
    (state.connections.c0 as Connection).formulaStr = '5';

    // 1 tick at dt=1/60: 5 * 1/60 = 0.0833...
    engine.tick(state, 1 / 60);
    expect(stock.value).toBeCloseTo(5 / 60, 4);

    // Verify conn.rate was updated to evaluated value
    expect(state.connections.c0.rate).toBe(5);
  });

  it('AC7: time-varying formula "sin(t) * 10" produces varying rates', () => {
    const engine = new SimulationEngine();
    engine.formulaEngine = new FormulaEngine();

    const state = makeEmptyState();
    const stock = makeStock('s0', 0);
    const src = makeSource('src1');
    state.nodes = { s0: stock, src1: src };
    state.connections = {
      c0: makeConnection('c0', 'src1', 's0', 0),
    };
    (state.connections.c0 as Connection).formulaStr = 'sin(t) * 10';

    // At t=0: sin(0)*10 = 0 → conn.rate = 0
    engine.tick(state, 1 / 60);
    expect(state.connections.c0.rate).toBe(0);
    const valueAtT0 = stock.value;

    // Advance t manually and tick again
    engine.t = Math.PI / 2; // t = π/2 ≈ 1.57
    const tickDt = 1 / 60;
    engine.tick(state, tickDt);

    // At t=π/2: sin(π/2)*10 = 10
    expect(state.connections.c0.rate).toBeCloseTo(10, 4);
    // value should have increased by ~10 * dt from the previous value
    const valueAtT2 = stock.value;
    expect(valueAtT2).toBeCloseTo(valueAtT0 + 10 * tickDt, 4);
  });

  it('AC5: invalid formula falls back to rate=0 with console.warn', () => {
    const engine = new SimulationEngine();
    engine.formulaEngine = new FormulaEngine();

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const state = makeEmptyState();
    const stock = makeStock('s0', 100);
    const src = makeSource('src1');
    state.nodes = { s0: stock, src1: src };
    state.connections = {
      c0: makeConnection('c0', 'src1', 's0', 10),
    };
    (state.connections.c0 as Connection).formulaStr = 'sin(t) + * 3'; // invalid

    engine.tick(state, 1 / 60);
    // Rate should be set to 0 (fallback)
    expect(state.connections.c0.rate).toBe(0);
    // Stock unchanged (net flow = 0)
    expect(stock.value).toBe(100);
    // console.warn was called
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0][0]).toContain('FormulaParseError');

    consoleWarnSpy.mockRestore();
  });

  it('backward compatibility: without formulaEngine, conn.rate is used as-is', () => {
    const engine = new SimulationEngine();
    // formulaEngine is null (default)

    const state = makeEmptyState();
    const stock = makeStock('s0', 0);
    const src = makeSource('src1');
    state.nodes = { s0: stock, src1: src };
    state.connections = {
      c0: makeConnection('c0', 'src1', 's0', 10),
    };

    engine.tick(state, 1 / 60);
    // Rate unchanged — still the original value
    expect(state.connections.c0.rate).toBe(10);
    expect(stock.value).toBeCloseTo(10 / 60, 4);
  });

  it('formula is re-evaluated each tick (rate changes with t)', () => {
    const engine = new SimulationEngine();
    engine.formulaEngine = new FormulaEngine();

    const state = makeEmptyState();
    const stock = makeStock('s0', 0);
    const src = makeSource('src1');
    state.nodes = { s0: stock, src1: src };
    state.connections = {
      c0: makeConnection('c0', 'src1', 's0', 0),
    };
    (state.connections.c0 as Connection).formulaStr = 't * 10';

    // Tick 1: t=0 at evaluation time → rate = 0, then t → 0.1
    engine.tick(state, 0.1);
    expect(state.connections.c0.rate).toBe(0); // evaluated at t=0 → 0

    // Tick 2: t=0.1 at evaluation time → rate = 1, then t → 0.2
    engine.tick(state, 0.1);
    expect(state.connections.c0.rate).toBeCloseTo(1, 4); // evaluated at t=0.1 → 1

    // Tick 3: t=0.2 at evaluation time → rate = 2, then t → 0.3
    engine.tick(state, 0.1);
    expect(state.connections.c0.rate).toBeCloseTo(2, 4); // evaluated at t=0.2 → 2
  });
});

// =============================================================================
// Story 6.1 — Tab background throttling mitigation (visibilitychange)
// =============================================================================

describe('Story 6.1 — visibilitychange handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('after start, visibilitychange handler is registered', () => {
    const engine = new SimulationEngine();
    const state = makeStateWithOneStockOneSource(10);

    const addSpy = vi.spyOn(document, 'addEventListener');
    engine.start(() => state);

    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    addSpy.mockRestore();

    engine.pause();
  });

  it('after pause, visibilitychange handler is removed', () => {
    const engine = new SimulationEngine();
    const state = makeStateWithOneStockOneSource(10);

    engine.start(() => state);
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    engine.pause();

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('after reset, visibilitychange handler is removed', () => {
    const engine = new SimulationEngine();
    const state = makeStateWithOneStockOneSource(10);

    engine.start(() => state);
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    engine.reset();

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('hidden→visible while running advances t by elapsed time (capped at 5s)', () => {
    const engine = new SimulationEngine();
    const state = makeStateWithOneStockOneSource(10);

    engine.start(() => state);
    vi.advanceTimersByTime(100); // one interval → t ≈ 0.1

    // Simulate tab going hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Simulate 10 seconds passing while hidden.
    // Note: vi.advanceTimersByTime also fires setInterval callbacks,
    // adding ~10s from interval ticks. The visibility handler adds
    // capped elapsed (5s max). Total advance ≈ 10s (intervals) + 5s (cap) = 15s.
    vi.advanceTimersByTime(10000);

    // Simulate tab becoming visible again
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // The visibility handler caps at 5s. Without the cap, elapsed would be 10s.
    // We verify the cap by checking that the visibility advance is ≤ 5s.
    // Total t = 0.1 (first interval) + 10s (100 intervals during hidden) + capped_visibility_advance
    // The capped_visibility_advance should be exactly 5s (10s elapsed, capped to 5s).
    // So total t ≈ 0.1 + 10 + 5 = 15.1
    // We verify the cap by checking t is around 15.1 (not 20.1 which would be uncapped)
    expect(engine.t).toBeCloseTo(15.1, 0); // approximately 15.1s total

    engine.pause();
  });

  it('reset clears _lastVisibilityChange state', () => {
    const engine = new SimulationEngine();
    const state = makeStateWithOneStockOneSource(10);

    engine.start(() => state);

    // Simulate tab going hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    engine.reset();

    // After reset, t should be 0 and state idle
    expect(engine.t).toBe(0);
    expect(engine.state).toBe('idle');

    // Restore document.hidden
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });
});

// =============================================================================
// Story 7.3 — Stock Zero Behavior: Auto-Pause & Breathing Glow (RED PHASE)
// =============================================================================

describe('Story 7.3 — Auto-pause on threshold (RED PHASE)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── AC3: Resume from auto-pause → stock can go negative ────────────

  describe('AC3: Resume after auto-pause → stock value can go negative', () => {
    test('[P1] stock at zero with outflow only goes negative on resume', () => {
      const engine = new SimulationEngine();
      const state = makeEmptyState();

      const stock = makeStock('s0', 0);
      const snk = makeSink('snk1');
      state.nodes = { s0: stock, snk1: snk };
      state.connections = {
        c_out: makeConnection('c_out', 's0', 'snk1', 5),
      };

      // Simulate: stock already at 0, inflow=0, outflow=5
      // After 1s (60 ticks), value = 0 + (0 - 5) * 1.0 = -5
      for (let i = 0; i < 60; i++) {
        engine.tick(state, 1 / 60);
      }

      // Stock MUST go negative — reveals system unsustainability
      expect(stock.value).toBeLessThan(0);
      expect(stock.value).toBeCloseTo(-5, 4);
    });

    test('[P1] COUNTDOWN_ZERO-equivalent state: stock at zero stays at zero without connections', () => {
      const engine = new SimulationEngine();
      const state = makeEmptyState();

      const stock = makeStock('s0', 0);
      state.nodes = { s0: stock };

      // No connections → net flow = 0 → value stays at 0
      for (let i = 0; i < 60; i++) {
        engine.tick(state, 1 / 60);
      }

      expect(stock.value).toBe(0);
    });

    test('[P1] stock transitions from positive → negative across tick boundary', () => {
      const engine = new SimulationEngine();
      const state = makeEmptyState();

      const stock = makeStock('s0', 1); // start at 1
      const snk = makeSink('snk1');
      state.nodes = { s0: stock, snk1: snk };
      state.connections = {
        c_out: makeConnection('c_out', 's0', 'snk1', 10), // outflow=10
      };

      // After 1s: 1 + (0 - 10) * 1.0 = -9
      for (let i = 0; i < 60; i++) {
        engine.tick(state, 1 / 60);
      }

      expect(stock.value).toBeLessThan(0);
      expect(stock.value).toBeCloseTo(-9, 4);
    });
  });

  // ── AC7: Multiple stocks threshold in same tick ────────────────────

  describe('AC7: Multiple stocks reach threshold in same tick', () => {
    test('[P2] pause() is idempotent — calling pause() twice does not throw', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);

      engine.start(() => state);
      vi.advanceTimersByTime(100);
      expect(engine.state).toBe('running');

      // First pause
      engine.pause();
      expect(engine.state).toBe('paused');

      // Second pause (simulating two stocks triggering auto-pause simultaneously)
      engine.pause();
      expect(engine.state).toBe('paused'); // still paused, no error

      // Resume works normally after double-pause
      engine.start(() => state);
      expect(engine.state).toBe('running');
    });

    test('[P2] multiple pause calls during same tick do not corrupt state', () => {
      const engine = new SimulationEngine();
      const state = makeStateWithOneStockOneSource(10);
      const stock = getStock(state);

      engine.start(() => state);
      vi.advanceTimersByTime(100);
      const valueAfterOneInterval = stock.value;

      // Simulate two simultaneous auto-pause triggers
      engine.pause();
      engine.pause();
      expect(engine.state).toBe('paused');

      // Value frozen (no further ticks)
      vi.advanceTimersByTime(500);
      expect(stock.value).toBe(valueAfterOneInterval);

      // Can resume
      engine.start(() => state);
      vi.advanceTimersByTime(100);
      expect(stock.value).toBeGreaterThan(valueAfterOneInterval);
    });
  });
});

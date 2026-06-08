import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../event-bus/EventBus.js';
import { SimulationEngine } from './SimulationEngine.js';
import type {
  GraphState,
  StockNode,
  SourceNode,
  Connection,
} from '../state/GraphState.js';

// ---------------------------------------------------------------------------
// Test factories — match naming convention from SimulationEngine.test.ts
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

function makeStateWithOneStockOneSource(rate: number): GraphState {
  const state = makeEmptyState();
  const stock = makeStock('s0', 0);
  const source = makeSource('src1');
  state.nodes = { s0: stock, src1: source };
  state.connections = { c0: makeConnection('c0', 'src1', 's0', rate) };
  return state;
}

function getStock(state: GraphState): StockNode {
  return Object.values(state.nodes).find(
    (n) => n.type === 'stock',
  ) as StockNode;
}

// =============================================================================
// Story 7.6 AC2: EventBus + SimulationEngine Integration Tests
// =============================================================================

describe('Story 7.6 — EventBus + SimulationEngine integration', () => {
  let bus: EventBus;
  let engine: SimulationEngine;
  let state: GraphState;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'setInterval',
        'Date',
        'clearTimeout',
        'clearInterval',
      ],
    });
    bus = new EventBus();
    engine = new SimulationEngine();
    state = makeStateWithOneStockOneSource(10);

    // Wire production pattern: EventBus events → engine methods
    bus.on('RUN', () => engine.start(() => state));
    bus.on('PAUSE', () => engine.pause());
    bus.on('RESET', () => engine.reset());

    // Wire production pattern: engine.onTick → SNAPSHOT_EMITTED via EventBus
    engine.onTick = (liveState) => {
      const snapshot = structuredClone(liveState);
      bus.emit('SNAPSHOT_EMITTED', { state: snapshot });
    };
  });

  afterEach(() => {
    engine.reset();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // AC2.1: RUN event starts the simulation
  // -------------------------------------------------------------------------

  describe('AC2.1: RUN event starts simulation', () => {
    it('emitting RUN transitions engine from idle to running', () => {
      expect(engine.state).toBe('idle');

      bus.emit('RUN', undefined);

      expect(engine.state).toBe('running');
    });

    it('RUN event starts the tick loop — stock value advances after 100ms', () => {
      const stock = getStock(state);
      expect(stock.value).toBe(0);

      bus.emit('RUN', undefined);
      vi.advanceTimersByTime(100); // 1 interval → 6 sub-steps, rate=10

      // 10 × 0.1 = 1.0
      expect(stock.value).toBeCloseTo(1.0, 4);
    });

    it('double RUN is no-op — engine stays running, no double-interval', () => {
      bus.emit('RUN', undefined);
      bus.emit('RUN', undefined); // second RUN
      expect(engine.state).toBe('running');

      const stock = getStock(state);
      vi.advanceTimersByTime(100);
      // Only 1 interval worth of ticks (not 2)
      expect(stock.value).toBeCloseTo(1.0, 4);
    });
  });

  // -------------------------------------------------------------------------
  // AC2.2: PAUSE event stops the simulation
  // -------------------------------------------------------------------------

  describe('AC2.2: PAUSE event stops simulation', () => {
    it('emitting PAUSE transitions engine from running to paused', () => {
      bus.emit('RUN', undefined);
      expect(engine.state).toBe('running');

      bus.emit('PAUSE', undefined);
      expect(engine.state).toBe('paused');
    });

    it('PAUSE stops the tick loop — stock value frozen after pause', () => {
      const stock = getStock(state);

      bus.emit('RUN', undefined);
      vi.advanceTimersByTime(100);
      const valueAfterOneInterval = stock.value;

      bus.emit('PAUSE', undefined);
      // Advance 5 more intervals — nothing should change
      vi.advanceTimersByTime(500);
      expect(stock.value).toBe(valueAfterOneInterval);
    });

    it('PAUSE from idle is no-op', () => {
      expect(engine.state).toBe('idle');
      bus.emit('PAUSE', undefined);
      expect(engine.state).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // AC2.3: SNAPSHOT_EMITTED events arrive via EventBus
  // -------------------------------------------------------------------------

  describe('AC2.3: Snapshots arrive via EventBus subscribers during tick', () => {
    it('SNAPSHOT_EMITTED fires after each interval (100ms)', () => {
      const snapshots: GraphState[] = [];
      bus.on('SNAPSHOT_EMITTED', ({ state: s }) => snapshots.push(s));

      bus.emit('RUN', undefined);

      vi.advanceTimersByTime(100);
      expect(snapshots).toHaveLength(1);

      vi.advanceTimersByTime(200);
      expect(snapshots).toHaveLength(3);
    });

    it('SNAPSHOT_EMITTED payload is an independent deep clone', () => {
      const snapshots: GraphState[] = [];
      bus.on('SNAPSHOT_EMITTED', ({ state: s }) => snapshots.push(s));

      bus.emit('RUN', undefined);
      vi.advanceTimersByTime(100);

      expect(snapshots).toHaveLength(1);
      const snapshot = snapshots[0];

      // Snapshot is a DIFFERENT reference from live state
      expect(snapshot).not.toBe(state);

      // Snapshot is deeply equal to live state
      expect(snapshot).toEqual(state);

      // Mutating the snapshot does NOT affect live state
      const snapshotStock = getStock(snapshot);
      const originalValue = getStock(state).value;
      snapshotStock.value = 999;
      expect(getStock(state).value).toBe(originalValue);

      // Mutating live state does NOT affect the snapshot
      const snapshotValue = snapshotStock.value;
      getStock(state).value = 888;
      expect(snapshotStock.value).toBe(snapshotValue);
    });

    it('SNAPSHOT_EMITTED fires at ~10Hz (1 per 100ms interval)', () => {
      const snapshots: GraphState[] = [];
      bus.on('SNAPSHOT_EMITTED', ({ state: s }) => snapshots.push(s));

      bus.emit('RUN', undefined);
      vi.advanceTimersByTime(1000); // 10 intervals

      // 10 intervals × 1 snapshot per interval = 10 snapshots
      expect(snapshots).toHaveLength(10);

      // Each snapshot has increasing version (monotonic)
      for (let i = 1; i < snapshots.length; i++) {
        expect(snapshots[i].version).toBeGreaterThan(snapshots[i - 1].version);
      }
    });

    it('version counter increments across snapshots', () => {
      const versions: number[] = [];
      bus.on('SNAPSHOT_EMITTED', ({ state: s }) => versions.push(s.version));

      bus.emit('RUN', undefined);
      vi.advanceTimersByTime(300); // 3 intervals

      expect(versions).toHaveLength(3);
      // Each version is strictly greater than the previous
      expect(versions[1]).toBeGreaterThan(versions[0]);
      expect(versions[2]).toBeGreaterThan(versions[1]);
    });
  });

  // -------------------------------------------------------------------------
  // AC2.4: No SNAPSHOT_EMITTED when paused
  // -------------------------------------------------------------------------

  describe('AC2.4: No snapshots emitted when paused', () => {
    it('SNAPSHOT_EMITTED stops firing after PAUSE', () => {
      const snapshots: GraphState[] = [];
      bus.on('SNAPSHOT_EMITTED', ({ state: s }) => snapshots.push(s));

      bus.emit('RUN', undefined);
      vi.advanceTimersByTime(100);
      expect(snapshots).toHaveLength(1);

      bus.emit('PAUSE', undefined);
      vi.advanceTimersByTime(500); // 5 more intervals worth
      expect(snapshots).toHaveLength(1); // still only the first call
    });

    it('no SNAPSHOT_EMITTED when engine was never started', () => {
      const snapshots: GraphState[] = [];
      bus.on('SNAPSHOT_EMITTED', ({ state: s }) => snapshots.push(s));

      // Never emit RUN — advance time should produce no snapshots
      vi.advanceTimersByTime(1000);
      expect(snapshots).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // RESET event
  // -------------------------------------------------------------------------

  describe('RESET event', () => {
    it('emitting RESET returns engine to idle and clears clock', () => {
      bus.emit('RUN', undefined);
      vi.advanceTimersByTime(300);
      expect(engine.state).toBe('running');
      expect(engine.t).toBeGreaterThan(0);

      bus.emit('RESET', undefined);
      expect(engine.state).toBe('idle');
      expect(engine.t).toBe(0);
    });

    it('RESET from paused returns to idle', () => {
      bus.emit('RUN', undefined);
      vi.advanceTimersByTime(100);
      bus.emit('PAUSE', undefined);
      expect(engine.state).toBe('paused');

      bus.emit('RESET', undefined);
      expect(engine.state).toBe('idle');
      expect(engine.t).toBe(0);
    });

    it('no more snapshots after RESET', () => {
      const snapshots: GraphState[] = [];
      bus.on('SNAPSHOT_EMITTED', ({ state: s }) => snapshots.push(s));

      bus.emit('RUN', undefined);
      vi.advanceTimersByTime(100);
      expect(snapshots).toHaveLength(1);

      bus.emit('RESET', undefined);
      vi.advanceTimersByTime(500); // 5 more intervals
      expect(snapshots).toHaveLength(1); // no more snapshots
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('full cycle: RUN → PAUSE → RUN → RESET', () => {
      const stock = getStock(state);

      // Start
      bus.emit('RUN', undefined);
      expect(engine.state).toBe('running');
      vi.advanceTimersByTime(100);
      const valueAfterRun1 = stock.value;
      expect(valueAfterRun1).toBeCloseTo(1.0, 4);

      // Pause
      bus.emit('PAUSE', undefined);
      expect(engine.state).toBe('paused');
      vi.advanceTimersByTime(500);
      expect(stock.value).toBe(valueAfterRun1); // frozen

      // Resume
      bus.emit('RUN', undefined);
      expect(engine.state).toBe('running');
      vi.advanceTimersByTime(100);
      // 2 intervals total = 2.0
      expect(stock.value).toBeCloseTo(2.0, 4);

      // Reset
      bus.emit('RESET', undefined);
      expect(engine.state).toBe('idle');
      expect(engine.t).toBe(0);
    });

    it('EventBus unsubscribes work correctly with engine lifecycle', () => {
      const snapshots: GraphState[] = [];
      const unsub = bus.on('SNAPSHOT_EMITTED', ({ state: s }) =>
        snapshots.push(s),
      );

      bus.emit('RUN', undefined);
      vi.advanceTimersByTime(100);
      expect(snapshots).toHaveLength(1);

      // Unsubscribe from snapshots
      unsub();
      vi.advanceTimersByTime(500);
      // Handler removed — no new snapshots pushed
      expect(snapshots).toHaveLength(1);

      bus.emit('PAUSE', undefined);
    });

    it('RUN/PAUSE/RESET events with zero subscribers do not throw', () => {
      // Clear all handlers
      bus.clear();

      // These should not throw
      expect(() => bus.emit('RUN', undefined)).not.toThrow();
      expect(() => bus.emit('PAUSE', undefined)).not.toThrow();
      expect(() => bus.emit('RESET', undefined)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Test suite speed validation (AC2: <5 seconds)
  // -------------------------------------------------------------------------

  describe('Performance', () => {
    it('integration tests complete quickly with fake timers', () => {
      // This test validates that the fake-timer-based tests are fast.
      // With vi.useFakeTimers(), advancing 1000ms of simulated time
      // should take << 1ms of wall-clock time.

      bus.emit('RUN', undefined);
      const start = performance.now();
      vi.advanceTimersByTime(5000); // 50 intervals
      const elapsed = performance.now() - start;

      // Fake timers should process nearly instantly (< 50ms wall time for 5s simulated)
      expect(elapsed).toBeLessThan(50);
    });
  });
});

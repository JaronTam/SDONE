import { describe, it, expect } from 'vitest';
import { addModule, addConnection } from './mutations.js';
import { EventBus } from '../event-bus/EventBus.js';
import { HistoryManager } from './HistoryManager.js';
import type { GraphState, ModuleType } from './GraphState.js';

const SYNC_BUDGET_MS = 5;
const WARMUP = 50;
const MEASURE = 100;

function emptyState(): GraphState {
  return {
    nodes: {},
    connections: {},
    version: 0,
    selectedModuleIds: [],
    selectedConnectionIds: [],
  };
}

const SP = ['#90EE90', '#87CEEB', '#98FB98', '#ADD8E6', '#B0E0E6'];
const SKP = ['#8B0000', '#00008B', '#006400', '#4B0082', '#FF8C00'];

function applyPC(prev: GraphState, next: GraphState, type: 'source' | 'sink'): GraphState {
  const pal = type === 'source' ? SP : SKP;
  const cnt = Object.values(next.nodes).filter((n) => n.type === type).length;
  const col = pal[(cnt - 1) % pal.length];
  const nid = Object.keys(next.nodes).find((id) => !(id in prev.nodes));
  if (!nid) return next;
  return { ...next, nodes: { ...next.nodes, [nid]: { ...next.nodes[nid], color: col } } };
}

function fullPath(
  s: GraphState,
  t: ModuleType,
  x: number,
  y: number,
  h: HistoryManager,
  eb: EventBus,
): GraphState {
  let ns = addModule(s, t, { x, y });
  if (t === 'source' || t === 'sink') ns = applyPC(s, ns, t);
  h.push(ns);
  eb.emit('MODULE_PLACED', { type: t, position: { x, y } });
  return ns;
}

describe('NFR-P3 Module Placement Latency (<=16ms frame budget)', () => {
  describe('mutation only', () => {
    it('stock p50<1ms p99<3ms', () => {
      const ts: number[] = [];
      for (let i = 0; i < WARMUP; i++) addModule(emptyState(), 'stock', { x: i * 10, y: 0 });
      for (let i = 0; i < MEASURE; i++) {
        const s = emptyState();
        const t0 = performance.now();
        addModule(s, 'stock', { x: i * 10, y: 0 });
        ts.push(performance.now() - t0);
      }
      ts.sort((a, b) => a - b);
      expect(ts[Math.floor(ts.length * 0.5)]).toBeLessThan(1);
      expect(ts[Math.floor(ts.length * 0.99)]).toBeLessThan(3);
    });
  });

  describe('full path', () => {
    it('stock <5ms x100', () => {
      const h = new HistoryManager();
      const eb = new EventBus();
      let c = 0;
      eb.on('MODULE_PLACED', () => {
        c++;
      });
      const ts: number[] = [];
      for (let i = 0; i < WARMUP; i++) fullPath(emptyState(), 'stock', i * 10, 0, h, eb);
      for (let i = 0; i < MEASURE; i++) {
        const s = emptyState();
        const t0 = performance.now();
        fullPath(s, 'stock', i * 10, 0, h, eb);
        ts.push(performance.now() - t0);
      }
      ts.sort((a, b) => a - b);
      expect(ts[ts.length - 1]).toBeLessThan(SYNC_BUDGET_MS);
      expect(c).toBe(WARMUP + MEASURE);
    });

    it('source+palette <5ms', () => {
      const h = new HistoryManager();
      const eb = new EventBus();
      const ts: number[] = [];
      for (let i = 0; i < WARMUP; i++) fullPath(emptyState(), 'source', i * 10, 0, h, eb);
      for (let i = 0; i < MEASURE; i++) {
        const s = emptyState();
        const t0 = performance.now();
        fullPath(s, 'source', i * 10, 0, h, eb);
        ts.push(performance.now() - t0);
      }
      ts.sort((a, b) => a - b);
      expect(ts[ts.length - 1]).toBeLessThan(SYNC_BUDGET_MS);
    });

    it('cold start <5ms', () => {
      const h = new HistoryManager();
      const eb = new EventBus();
      const s = emptyState();
      const t0 = performance.now();
      fullPath(s, 'stock', 100, 200, h, eb);
      expect(performance.now() - t0).toBeLessThan(SYNC_BUDGET_MS);
    });

    it('populated state <5ms', () => {
      const h = new HistoryManager();
      h.push(emptyState());
      const eb = new EventBus();
      let state = emptyState();
      for (let i = 0; i < 5; i++) {
        state = addModule(state, 'source', { x: i * 100, y: 0 });
        state = addModule(state, 'stock', { x: i * 100, y: 100 });
      }
      const ids = Object.keys(state.nodes);
      const srcs = ids.filter((id) => state.nodes[id].type === 'source');
      const stks = ids.filter((id) => state.nodes[id].type === 'stock');
      for (let i = 0; i < 5; i++) state = addConnection(state, srcs[i], stks[i]);
      const ts: number[] = [];
      for (let i = 0; i < MEASURE; i++) {
        const sc = {
          ...state,
          nodes: { ...state.nodes },
          connections: { ...state.connections },
          version: state.version,
        };
        const t0 = performance.now();
        fullPath(sc, 'stock', i * 10, 200, h, eb);
        ts.push(performance.now() - t0);
      }
      ts.sort((a, b) => a - b);
      expect(ts[ts.length - 1]).toBeLessThan(SYNC_BUDGET_MS);
    });
  });
});

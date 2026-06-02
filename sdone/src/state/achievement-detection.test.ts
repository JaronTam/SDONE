import { describe, it, expect } from 'vitest';
import { detectFirstCompleteStack } from './achievement-detection.js';
import type { GraphState } from './GraphState.js';

/** Helper: create a minimal GraphState with given nodes and connections. */
function makeState(
  nodes: Record<string, { type: string; position: { x: number; y: number } }>,
  connections: Record<string, { fromId: string; toId: string; rate: number }>,
): GraphState {
  const fullNodes: GraphState['nodes'] = {};
  for (const [id, n] of Object.entries(nodes)) {
    if (n.type === 'stock') {
      fullNodes[id] = {
        id,
        type: 'stock',
        position: n.position,
        value: 0,
        initialValue: 0,
        capacity: Infinity,
        label: '',
      } as any;
    } else {
      fullNodes[id] = {
        id,
        type: n.type as 'source' | 'sink',
        position: n.position,
        label: '',
      } as any;
    }
  }
  const fullConns: GraphState['connections'] = {};
  for (const [id, c] of Object.entries(connections)) {
    fullConns[id] = {
      id,
      fromId: c.fromId,
      toId: c.toId,
      rate: c.rate,
      formulaStr: String(c.rate),
    } as any;
  }
  return {
    nodes: fullNodes,
    connections: fullConns,
    version: 0,
    selectedModuleIds: [],
    selectedConnectionIds: [],
  };
}

describe('detectFirstCompleteStack', () => {
  it('returns false for empty state', () => {
    const state = makeState({}, {});
    expect(detectFirstCompleteStack(state)).toBe(false);
  });

  it('returns false when stock has only source connected (no sink)', () => {
    const state = makeState(
      {
        s1: { type: 'source', position: { x: 0, y: 0 } },
        st1: { type: 'stock', position: { x: 100, y: 0 } },
      },
      {
        c1: { fromId: 's1', toId: 'st1', rate: 1 },
      },
    );
    expect(detectFirstCompleteStack(state)).toBe(false);
  });

  it('returns false when stock has only sink connected (no source)', () => {
    const state = makeState(
      {
        st1: { type: 'stock', position: { x: 0, y: 0 } },
        sk1: { type: 'sink', position: { x: 100, y: 0 } },
      },
      {
        c1: { fromId: 'st1', toId: 'sk1', rate: 1 },
      },
    );
    expect(detectFirstCompleteStack(state)).toBe(false);
  });

  it('returns true when stock has both source→stock and stock→sink', () => {
    const state = makeState(
      {
        s1: { type: 'source', position: { x: 0, y: 0 } },
        st1: { type: 'stock', position: { x: 100, y: 0 } },
        sk1: { type: 'sink', position: { x: 200, y: 0 } },
      },
      {
        c1: { fromId: 's1', toId: 'st1', rate: 1 },
        c2: { fromId: 'st1', toId: 'sk1', rate: 1 },
      },
    );
    expect(detectFirstCompleteStack(state)).toBe(true);
  });

  it('returns false when connections exist but to wrong node types', () => {
    // source → sink (no stock involved)
    const state = makeState(
      {
        s1: { type: 'source', position: { x: 0, y: 0 } },
        sk1: { type: 'sink', position: { x: 100, y: 0 } },
      },
      {
        c1: { fromId: 's1', toId: 'sk1', rate: 1 },
      },
    );
    expect(detectFirstCompleteStack(state)).toBe(false);
  });

  it('returns false for stock→stock connections (not source→stock)', () => {
    const state = makeState(
      {
        st1: { type: 'stock', position: { x: 0, y: 0 } },
        st2: { type: 'stock', position: { x: 100, y: 0 } },
        sk1: { type: 'sink', position: { x: 200, y: 0 } },
      },
      {
        c1: { fromId: 'st1', toId: 'st2', rate: 1 },
        c2: { fromId: 'st2', toId: 'sk1', rate: 1 },
      },
    );
    expect(detectFirstCompleteStack(state)).toBe(false);
  });
});
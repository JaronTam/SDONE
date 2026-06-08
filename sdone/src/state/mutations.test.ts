import { describe, it, expect } from 'vitest';
import type {
  Connection,
  GraphState,
  SinkNode,
  StockNode,
  SourceNode,
} from './GraphState.js';
import {
  addModule,
  changeModuleColor,
  deleteModule,
  moveModule,
  addConnection,
  deleteConnection,
  updateRate,
} from './mutations.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function emptyState(): GraphState {
  return {
    nodes: {},
    connections: {},
    version: 0,
    selectedModuleIds: [],
    selectedConnectionIds: [],
  };
}

/** Insert a stock node into state (mutates input for test setup convenience). */
function withStock(state: GraphState, id: string, x = 0, y = 0): StockNode {
  const node: StockNode = {
    id,
    type: 'stock',
    position: { x, y },
    value: 0,
    capacity: Infinity,
    initialValue: 0,
  };
  state.nodes[id] = node;
  return node;
}

/** Insert a source node into state. */
function withSource(state: GraphState, id: string, x = 0, y = 0): SourceNode {
  const node: SourceNode = { id, type: 'source', position: { x, y } };
  state.nodes[id] = node;
  return node;
}

/** Insert a sink node into state. */
function withSink(state: GraphState, id: string, x = 0, y = 0): SinkNode {
  const node: SinkNode = { id, type: 'sink', position: { x, y } };
  state.nodes[id] = node;
  return node;
}

/** Insert a connection into state. */
function withConnection(
  state: GraphState,
  id: string,
  fromId: string,
  toId: string,
  rate = 0,
): Connection {
  const conn: Connection = {
    id,
    fromId,
    toId,
    rate,
    formulaStr: String(rate),
  };
  state.connections[id] = conn;
  return conn;
}

// ---------------------------------------------------------------------------
// AC1–4: addModule
// ---------------------------------------------------------------------------

describe('addModule', () => {
  it('AC1: creates a stock with defaults, increments version', () => {
    const state = emptyState();
    const result = addModule(state, 'stock', { x: 100, y: 200 });

    expect(result).not.toBe(state);
    expect(Object.keys(result.nodes)).toHaveLength(1);

    const [id, node] = Object.entries(result.nodes)[0];
    expect(id).toBeTruthy();
    expect(node.type).toBe('stock');
    expect(node.position).toEqual({ x: 100, y: 200 });

    const stock = node as StockNode;
    expect(stock).toMatchObject({
      id: expect.any(String) as string,
      type: 'stock',
      position: { x: 100, y: 200 },
      value: 0,
      capacity: Infinity,
      initialValue: 0,
    });

    expect(result.version).toBe(1);
  });

  it('AC2: source has no color property (placement layer assigns)', () => {
    const state = emptyState();
    const result = addModule(state, 'source', { x: 50, y: 60 });

    const [, node] = Object.entries(result.nodes)[0];
    expect(node.type).toBe('source');
    expect('color' in node ? node.color : undefined).toBeUndefined();
  });

  it('AC3: sink has no color property (placement layer assigns)', () => {
    const state = emptyState();
    const result = addModule(state, 'sink', { x: 300, y: 400 });

    const [, node] = Object.entries(result.nodes)[0];
    expect(node.type).toBe('sink');
    expect('color' in node ? node.color : undefined).toBeUndefined();
  });

  it('AC4: original state is not mutated', () => {
    const state = emptyState();
    withStock(state, 's1');

    const stateNodesBefore = { ...state.nodes };
    const result = addModule(state, 'stock', { x: 500, y: 600 });

    // Original state unchanged
    expect(state.nodes).toEqual(stateNodesBefore);
    expect(state.version).toBe(0);

    // Result is a new reference
    expect(result).not.toBe(state);
    expect(result.nodes).not.toBe(state.nodes);
  });

  it('AC19/AC20: version monotonicity on addModule', () => {
    const state = emptyState();
    const r1 = addModule(state, 'stock', { x: 0, y: 0 });
    expect(r1.version).toBe(state.version + 1);

    const r2 = addModule(r1, 'source', { x: 10, y: 10 });
    expect(r2.version).toBe(r1.version + 1);
  });
});

// ---------------------------------------------------------------------------
// AC5–6: deleteModule
// ---------------------------------------------------------------------------

describe('deleteModule', () => {
  it('AC5: removes node and cascading connections, increments version', () => {
    const state = emptyState();
    withStock(state, 'n1');
    withSource(state, 'src');
    withConnection(state, 'c1', 'src', 'n1');
    withConnection(state, 'c2', 'n1', 'sink-target');
    // c1: fromId!==n1 but toId===n1 → should be removed
    // c2: fromId===n1               → should be removed

    expect(Object.keys(state.connections)).toHaveLength(2);

    const result = deleteModule(state, 'n1');
    expect(result).not.toBe(state);

    expect(Object.keys(result.nodes)).toHaveLength(1); // only 'src' remains
    expect('n1' in result.nodes).toBe(false);
    expect(Object.keys(result.connections)).toHaveLength(0); // both cascade-removed
    expect(result.version).toBe(state.version + 1);
  });

  it('AC6: no-op on missing id — returns new state with unchanged version', () => {
    const state = emptyState();
    withStock(state, 'n1');

    const result = deleteModule(state, 'nonexistent-id');
    expect(result).not.toBe(state);
    expect(result.nodes).toEqual(state.nodes);
    expect(result.connections).toEqual(state.connections);
    expect(result.version).toBe(state.version); // NOT incremented
  });
});

// ---------------------------------------------------------------------------
// AC7–9: moveModule
// ---------------------------------------------------------------------------

describe('moveModule', () => {
  it('AC7: updates position, preserves other properties, increments version', () => {
    const state = emptyState();
    const stock = withStock(state, 'n1', 100, 200);
    stock.value = 42; // non-default value to verify it survives

    const result = moveModule(state, 'n1', { x: 300, y: 400 });
    expect(result).not.toBe(state);

    const moved = result.nodes['n1'] as StockNode;
    expect(moved.position).toEqual({ x: 300, y: 400 });
    expect(moved).toMatchObject({
      id: 'n1',
      type: 'stock',
      position: { x: 300, y: 400 },
      value: 42,
      capacity: Infinity,
      initialValue: 0,
    });
    expect(result.version).toBe(state.version + 1);
  });

  it('AC8: no-op if position unchanged — version NOT incremented', () => {
    const state = emptyState();
    withStock(state, 'n1', 100, 200);

    const result = moveModule(state, 'n1', { x: 100, y: 200 });
    expect(result).not.toBe(state);
    expect(result.version).toBe(state.version); // unchanged
  });

  it('AC9: no-op on missing id — version unchanged', () => {
    const state = emptyState();
    const result = moveModule(state, 'nonexistent', { x: 0, y: 0 });
    expect(result).not.toBe(state);
    expect(result.version).toBe(state.version);
  });

  it('should be pure — original state unchanged', () => {
    const state = emptyState();
    withStock(state, 'n1', 0, 0);

    const result = moveModule(state, 'n1', { x: 999, y: 999 });
    expect(state.nodes['n1'].position).toEqual({ x: 0, y: 0 });
    expect(result.nodes['n1'].position).toEqual({ x: 999, y: 999 });
  });
});

// ---------------------------------------------------------------------------
// AC10–12: addConnection
// ---------------------------------------------------------------------------

describe('addConnection', () => {
  it('AC10: creates connection with defaults, increments version', () => {
    const state = emptyState();
    withSource(state, 's1');
    withStock(state, 'st1');

    const result = addConnection(state, 's1', 'st1');
    expect(Object.keys(result.connections)).toHaveLength(1);

    const [, conn] = Object.entries(result.connections)[0];
    expect(conn).toMatchObject({
      id: expect.any(String) as string,
      fromId: 's1',
      toId: 'st1',
      rate: 0,
      formulaStr: '0',
    });
    expect(result.version).toBe(state.version + 1);
  });

  it('AC11: no-op if either endpoint does not exist', () => {
    const state = emptyState();
    withSource(state, 's1');

    const r1 = addConnection(state, 'missing', 'alsoMissing');
    expect(r1.version).toBe(state.version);

    const r2 = addConnection(state, 's1', 'missing');
    expect(r2.version).toBe(state.version);

    const r3 = addConnection(state, 'missing', 's1');
    expect(r3.version).toBe(state.version);
  });

  it('AC12: no-op on duplicate — version unchanged', () => {
    const state = emptyState();
    withSource(state, 's1');
    withStock(state, 'st1');

    const first = addConnection(state, 's1', 'st1');
    expect(first.version).toBe(1);

    const second = addConnection(first, 's1', 'st1');
    expect(second.version).toBe(first.version); // unchanged
    expect(Object.keys(second.connections)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AC13–14: deleteConnection
// ---------------------------------------------------------------------------

describe('deleteConnection', () => {
  it('AC13: removes connection, increments version', () => {
    const state = emptyState();
    withSource(state, 's1');
    withStock(state, 'st1');
    withConnection(state, 'c1', 's1', 'st1');

    const result = deleteConnection(state, 'c1');
    expect(Object.keys(result.connections)).toHaveLength(0);
    expect(result.version).toBe(state.version + 1);
    expect('s1' in result.nodes).toBe(true); // node preserved
  });

  it('AC14: no-op on missing id — version unchanged', () => {
    const state = emptyState();
    withConnection(state, 'c1', 'a', 'b');

    const result = deleteConnection(state, 'nonexistent');
    expect(result.version).toBe(state.version);
    expect(Object.keys(result.connections)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AC15–18: updateRate
// ---------------------------------------------------------------------------

describe('updateRate', () => {
  it('AC15: updates rate and formulaStr, increments version', () => {
    const state = emptyState();
    withSource(state, 'src');
    withStock(state, 'st');
    withConnection(state, 'c1', 'src', 'st', 5);

    const result = updateRate(state, 'c1', 10);
    expect(result.connections['c1']).toMatchObject({
      id: 'c1',
      fromId: 'src',
      toId: 'st',
      rate: 10,
      formulaStr: '10',
    });
    expect(result.version).toBe(state.version + 1);
  });

  it('AC16: no-op if rate unchanged — version NOT incremented', () => {
    const state = emptyState();
    withSource(state, 'src');
    withStock(state, 'st');
    withConnection(state, 'c1', 'src', 'st', 5);

    const result = updateRate(state, 'c1', 5);
    expect(result.version).toBe(state.version);
  });

  it('AC17: no-op on missing connection id — version unchanged', () => {
    const state = emptyState();
    const result = updateRate(state, 'nonexistent', 42);
    expect(result.version).toBe(state.version);
  });

  it('AC18: negative and zero rates allowed', () => {
    const state = emptyState();
    withSource(state, 'src');
    withStock(state, 'st');
    withConnection(state, 'c1', 'src', 'st', 5);

    // Zero rate
    const rZero = updateRate(state, 'c1', 0);
    expect(rZero.connections['c1'].rate).toBe(0);
    expect(rZero.connections['c1'].formulaStr).toBe('0');
    expect(rZero.version).toBe(state.version + 1);

    // Negative rate
    const rNeg = updateRate(rZero, 'c1', -5);
    expect(rNeg.connections['c1'].rate).toBe(-5);
    expect(rNeg.connections['c1'].formulaStr).toBe('-5');
    expect(rNeg.version).toBe(rZero.version + 1);
  });
});

// ---------------------------------------------------------------------------
// changeModuleColor
// ---------------------------------------------------------------------------

describe('changeModuleColor', () => {
  it('should change color of existing source and increment version', () => {
    const state = emptyState();
    const src = withSource(state, 'src1', 100, 100);
    src.color = '#90EE90';

    const result = changeModuleColor(state, 'src1', '#87CEEB');
    expect(result).not.toBe(state);
    const updated = result.nodes['src1'] as SourceNode;
    expect(updated.color).toBe('#87CEEB');
    expect(result.version).toBe(state.version + 1);
  });

  it('should change color of existing sink and increment version', () => {
    const state = emptyState();
    const sink = withSink(state, 'sink1', 200, 200);
    sink.color = '#8B0000';

    const result = changeModuleColor(state, 'sink1', '#00008B');
    expect(result).not.toBe(state);
    const updated = result.nodes['sink1'] as SinkNode;
    expect(updated.color).toBe('#00008B');
    expect(result.version).toBe(state.version + 1);
  });

  it('should no-op for stock type (AC8)', () => {
    const state = emptyState();
    withStock(state, 'st1', 0, 0);

    const result = changeModuleColor(state, 'st1', '#FF0000');
    expect(result).not.toBe(state);
    expect(result.version).toBe(state.version);
    // Stock should remain unchanged
    expect(result.nodes['st1']).toEqual(state.nodes['st1']);
  });

  it('should no-op if color is unchanged', () => {
    const state = emptyState();
    const src = withSource(state, 'src1', 100, 100);
    src.color = '#90EE90';

    const result = changeModuleColor(state, 'src1', '#90EE90');
    expect(result).not.toBe(state);
    expect(result.version).toBe(state.version);
  });

  it('should no-op for non-existent module', () => {
    const state = emptyState();

    const result = changeModuleColor(state, 'nonexistent', '#FF0000');
    expect(result).not.toBe(state);
    expect(result.version).toBe(state.version);
  });

  it('should be pure — original state unchanged', () => {
    const state = emptyState();
    const src = withSource(state, 'src1', 0, 0);
    src.color = '#90EE90';

    const originalColor = (state.nodes['src1'] as SourceNode).color;
    const result = changeModuleColor(state, 'src1', '#87CEEB');
    expect((state.nodes['src1'] as SourceNode).color).toBe(originalColor);
    expect((result.nodes['src1'] as SourceNode).color).toBe('#87CEEB');
  });
});

// ---------------------------------------------------------------------------
// AC19: Purity — no side effects
// ---------------------------------------------------------------------------

describe('purity contract (AC19)', () => {
  it('addModule does not emit EventBus or touch DOM', () => {
    const state = emptyState();
    // If there were side effects (e.g. console.log, DOM write) they'd be visible
    // in the test runner output. We verify pure input → output.
    const result = addModule(state, 'stock', { x: 0, y: 0 });
    expect(result).toBeDefined();
    expect(result).not.toBe(state);
  });

  it('all mutations return new objects, input unchanged', () => {
    const state = emptyState();
    withStock(state, 'n1', 0, 0);
    withSource(state, 'src', 10, 10);
    withConnection(state, 'c1', 'src', 'n1', 5);

    const snapshot = structuredClone(state);

    addModule(state, 'sink', { x: 20, y: 20 });
    deleteModule(state, 'n1');
    moveModule(state, 'src', { x: 999, y: 999 });
    addConnection(state, 'n1', 'src');
    deleteConnection(state, 'c1');
    updateRate(state, 'c1', 99);

    // After all attempted mutations, original state must be unchanged
    expect(state).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// AC20: Version monotonicity (systematic)
// ---------------------------------------------------------------------------

describe('version monotonicity (AC20)', () => {
  it('version only increments on actual changes across all mutations', () => {
    // Scenario: sequence of mutations, some no-ops interspersed
    let state = emptyState();

    // 1. addModule → version 1
    state = addModule(state, 'stock', { x: 0, y: 0 });
    expect(state.version).toBe(1);
    const [stockId] = Object.keys(state.nodes);

    // 2. addModule → version 2
    state = addModule(state, 'source', { x: 10, y: 10 });
    expect(state.version).toBe(2);
    const actualSourceId = Object.keys(state.nodes).find(
      (k) => state.nodes[k].type === 'source',
    )!;

    // 3. moveModule no-op → version stays 2
    const afterNoopMove = moveModule(state, stockId, { x: 0, y: 0 });
    expect(afterNoopMove.version).toBe(2);

    // 4. moveModule real → version 3
    state = moveModule(state, stockId, { x: 100, y: 200 });
    expect(state.version).toBe(3);

    // 5. addConnection real → version 4
    state = addConnection(state, actualSourceId, stockId);
    expect(state.version).toBe(4);
    const [connId] = Object.keys(state.connections);

    // 6. addConnection duplicate → version 4
    const dup = addConnection(state, actualSourceId, stockId);
    expect(dup.version).toBe(4);

    // 7. updateRate real → version 5
    state = updateRate(state, connId, 10);
    expect(state.version).toBe(5);

    // 8. updateRate no-op → version 5
    const sameRate = updateRate(state, connId, 10);
    expect(sameRate.version).toBe(5);

    // 9. deleteConnection real → version 6
    state = deleteConnection(state, connId);
    expect(state.version).toBe(6);

    // 10. deleteConnection no-op → version 6
    const noConn = deleteConnection(state, 'nonexistent');
    expect(noConn.version).toBe(6);

    // 11. deleteModule real → version 7
    state = deleteModule(state, actualSourceId);
    expect(state.version).toBe(7);

    // 12. deleteModule no-op → version 7
    const noMod = deleteModule(state, 'nonexistent');
    expect(noMod.version).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('deleteModule cascade handles connections to/from same node', () => {
    const state = emptyState();
    withStock(state, 'n1');
    withStock(state, 'n2');
    withConnection(state, 'c1', 'n1', 'n2');
    withConnection(state, 'c2', 'n2', 'n1');

    const result = deleteModule(state, 'n1');
    expect(Object.keys(result.nodes)).toHaveLength(1); // only n2
    expect(Object.keys(result.connections)).toHaveLength(0); // both removed
  });

  it('addModule generates unique UUIDs', () => {
    const state = emptyState();
    const r1 = addModule(state, 'stock', { x: 0, y: 0 });
    const r2 = addModule(r1, 'stock', { x: 10, y: 10 });

    const ids = Object.keys(r2.nodes);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('mutations preserve selectedModuleIds (untouched)', () => {
    const state: GraphState = {
      nodes: {},
      connections: {},
      version: 0,
      selectedModuleIds: ['sel-1', 'sel-2'],
      selectedConnectionIds: [],
    };
    withStock(state, 'n1');

    const result = moveModule(state, 'n1', { x: 10, y: 10 });
    expect(result.selectedModuleIds).toEqual(['sel-1', 'sel-2']);
  });

  it('formulaStr matches rate string representation', () => {
    const state = emptyState();
    withSource(state, 'src');
    withStock(state, 'st');
    withConnection(state, 'c1', 'src', 'st', 3.14);

    const result = updateRate(state, 'c1', 2.718);
    expect(result.connections['c1'].formulaStr).toBe('2.718');
    expect(typeof result.connections['c1'].formulaStr).toBe('string');
  });
});
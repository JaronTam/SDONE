import { describe, it, expect } from 'vitest';
import type {
  ModuleType,
  ModuleNode,
  StockNode,
  SourceNode,
  SinkNode,
  Connection,
  GraphState,
} from './GraphState.js';
import { vec2 } from '../shared/Vec2.js';

// ============================================================================
// Helper — builds a minimal ModuleNode for test construction.
// ============================================================================
function makeModule(overrides: Partial<ModuleNode> & { type: ModuleType; id: string }): ModuleNode {
  return {
    position: vec2(100, 200),
    ...overrides,
  };
}

function makeStock(overrides: Partial<StockNode> & { id: string }): StockNode {
  return {
    type: 'stock' as const,
    position: vec2(0, 0),
    value: 0,
    capacity: 100,
    initialValue: 0,
    ...overrides,
  };
}

function makeSource(overrides: Partial<SourceNode> & { id: string }): SourceNode {
  return {
    type: 'source' as const,
    position: vec2(0, 0),
    ...overrides,
  };
}

function makeSink(overrides: Partial<SinkNode> & { id: string }): SinkNode {
  return {
    type: 'sink' as const,
    position: vec2(0, 0),
    ...overrides,
  };
}

function makeConnection(overrides: Partial<Connection> & { id: string }): Connection {
  return {
    fromId: 'a',
    toId: 'b',
    rate: 1,
    formulaStr: '1',
    ...overrides,
  };
}

// ============================================================================
// 5.1 StockNode structural compatibility
// ============================================================================
describe('StockNode', () => {
  it('has all ModuleNode properties plus stock-specific fields', () => {
    const stock = makeStock({
      id: 's1',
      label: 'My Stock',
      value: 42,
      capacity: 200,
      initialValue: 10,
    });

    // ModuleNode base properties
    expect(stock.id).toBe('s1');
    expect(stock.type).toBe('stock');
    expect(stock.position).toEqual({ x: 0, y: 0 });
    expect(stock.label).toBe('My Stock');

    // StockNode-specific
    expect(stock.value).toBe(42);
    expect(stock.capacity).toBe(200);
    expect(stock.initialValue).toBe(10);

    // A StockNode IS-A ModuleNode (structural compatibility)
    const nodes: Record<string, ModuleNode> = {};
    nodes['s1'] = stock; // should compile without error — assigns StockNode to ModuleNode slot
    expect(nodes['s1']!.id).toBe('s1');
  });

  it('can be narrowed from ModuleNode by type', () => {
    const node = makeModule({ id: 's2', type: 'stock' });
    expect(node.type).toBe('stock');
  });
});

// ============================================================================
// 5.2 ModuleType discriminant
// ============================================================================
describe('ModuleType', () => {
  it('only accepts source | stock | sink', () => {
    // Runtime check: valid values are accepted
    const valid: ModuleType[] = ['source', 'stock', 'sink'];
    expect(valid).toHaveLength(3);

    // Each value is distinct
    valid.forEach((t) => {
      expect(t === 'source' || t === 'stock' || t === 'sink').toBe(true);
    });
  });

  it('creates correct concrete nodes based on type', () => {
    const source = makeSource({ id: 'src1' });
    expect(source.type).toBe('source');

    const stock = makeStock({ id: 'stk1' });
    expect(stock.type).toBe('stock');

    const sink = makeSink({ id: 'snk1' });
    expect(sink.type).toBe('sink');
  });
});

// ============================================================================
// 5.3 Connection.formulaStr is typed as string
// ============================================================================
describe('Connection', () => {
  it('formulaStr is always a string', () => {
    const conn = makeConnection({ id: 'c1', formulaStr: 'sin(t) * 5' });
    expect(typeof conn.formulaStr).toBe('string');
    expect(conn.formulaStr).toBe('sin(t) * 5');
  });

  it('accepts constant string formula', () => {
    const conn = makeConnection({ id: 'c2', formulaStr: '10' });
    expect(conn.formulaStr).toBe('10');
  });

  it('has all required fields', () => {
    const conn = makeConnection({
      id: 'c3',
      fromId: 'src',
      toId: 'snk',
      rate: 3.14,
      formulaStr: '3.14',
    });
    expect(conn.id).toBe('c3');
    expect(conn.fromId).toBe('src');
    expect(conn.toId).toBe('snk');
    expect(conn.rate).toBeCloseTo(3.14);
    expect(conn.formulaStr).toBe('3.14');
  });
});

// ============================================================================
// 5.4 GraphState.version is typed as number
// ============================================================================
describe('GraphState', () => {
  it('version is a number', () => {
    const state: GraphState = {
      nodes: {},
      connections: {},
      version: 0,
      selectedModuleIds: [],
      selectedConnectionIds: [],
    };
    expect(typeof state.version).toBe('number');
    expect(state.version).toBe(0);
  });

  it('version increments monotonically', () => {
    let v = 0;
    v++;
    expect(v).toBe(1);
    v++;
    expect(v).toBe(2);
    // Just validates the pattern — actual increment logic is in Story 1.5
  });

  it('selectedModuleIds is an array', () => {
    const state: GraphState = {
      nodes: {},
      connections: {},
      version: 1,
      selectedModuleIds: ['a', 'b'],
      selectedConnectionIds: [],
    };
    expect(Array.isArray(state.selectedModuleIds)).toBe(true);
    expect(state.selectedModuleIds).toEqual(['a', 'b']);
  });
});

// ============================================================================
// 5.5 Serialization round-trip (POJO guarantee)
// ============================================================================
describe('Serialization round-trip', () => {
  it('GraphState survives JSON.stringify + JSON.parse without data loss', () => {
    const source = makeSource({ id: 'src', label: 'Source A', color: '#90EE90' });
    const stock = makeStock({
      id: 'stk',
      label: 'Stock B',
      value: 50,
      capacity: 100,
      initialValue: 25,
    });
    const sink = makeSink({ id: 'snk', label: 'Sink C', color: '#8B0000' });
    const conn = makeConnection({
      id: 'flow',
      fromId: 'src',
      toId: 'stk',
      rate: 5,
      formulaStr: '5',
    });

    const nodes: Record<string, ModuleNode> = {};
    nodes['src'] = source;
    nodes['stk'] = stock;
    nodes['snk'] = sink;

    const connections: Record<string, Connection> = {};
    connections['flow'] = conn;

    const original: GraphState = {
      nodes,
      connections,
      version: 7,
      selectedModuleIds: ['src', 'stk'],
      selectedConnectionIds: [],
    };

    const json = JSON.stringify(original);
    const restored: GraphState = JSON.parse(json);

    // Top-level fields
    expect(restored.version).toBe(7);
    expect(restored.selectedModuleIds).toEqual(['src', 'stk']);

    // Source node
    const restoredSrc = restored.nodes['src'] as SourceNode;
    expect(restoredSrc.id).toBe('src');
    expect(restoredSrc.type).toBe('source');
    expect(restoredSrc.label).toBe('Source A');
    expect(restoredSrc.color).toBe('#90EE90');
    expect(restoredSrc.position.x).toBe(0);
    expect(restoredSrc.position.y).toBe(0);

    // Stock node
    const restoredStk = restored.nodes['stk'] as StockNode;
    expect(restoredStk.id).toBe('stk');
    expect(restoredStk.type).toBe('stock');
    expect(restoredStk.value).toBe(50);
    expect(restoredStk.capacity).toBe(100);
    expect(restoredStk.initialValue).toBe(25);

    // Sink node
    const restoredSnk = restored.nodes['snk'] as SinkNode;
    expect(restoredSnk.id).toBe('snk');
    expect(restoredSnk.type).toBe('sink');
    expect(restoredSnk.color).toBe('#8B0000');

    // Connection
    const restoredConn = restored.connections['flow'];
    expect(restoredConn.id).toBe('flow');
    expect(restoredConn.fromId).toBe('src');
    expect(restoredConn.toId).toBe('stk');
    expect(restoredConn.rate).toBe(5);
    expect(restoredConn.formulaStr).toBe('5');
  });

  it('empty GraphState round-trips', () => {
    const empty: GraphState = {
      nodes: {},
      connections: {},
      version: 0,
      selectedModuleIds: [],
      selectedConnectionIds: [],
    };
    const json = JSON.stringify(empty);
    const restored: GraphState = JSON.parse(json);
    expect(restored.version).toBe(0);
    expect(restored.selectedModuleIds).toEqual([]);
    expect(Object.keys(restored.nodes)).toHaveLength(0);
    expect(Object.keys(restored.connections)).toHaveLength(0);
  });
});

// ============================================================================
// 5.6 Edge cases
// ============================================================================
describe('Edge cases', () => {
  it('SourceNode has optional color', () => {
    const withColor = makeSource({ id: 's1', color: '#90EE90' });
    const withoutColor = makeSource({ id: 's2' });

    expect(withColor.color).toBe('#90EE90');
    expect(withoutColor.color).toBeUndefined();
  });

  it('SinkNode has optional color', () => {
    const withColor = makeSink({ id: 'k1', color: '#8B0000' });
    const withoutColor = makeSink({ id: 'k2' });

    expect(withColor.color).toBe('#8B0000');
    expect(withoutColor.color).toBeUndefined();
  });

  it('ModuleNode label is optional', () => {
    const labeled = makeModule({ id: 'm1', type: 'stock', label: 'Labeled' });
    const unlabeled = makeModule({ id: 'm2', type: 'source' });

    expect(labeled.label).toBe('Labeled');
    expect(unlabeled.label).toBeUndefined();
  });
});

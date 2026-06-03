import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { AnalyticsPanel, computeStockAnalytics } from './AnalyticsPanel.js';
import type { StockAnalytics } from './AnalyticsPanel.js';
import type { GraphState, Connection } from '../../state/GraphState.js';

// ---------------------------------------------------------------------------
// Helper: create a container for the analytics panel
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'layer-panel-right';
  document.body.appendChild(container);
  return container;
}

// ---------------------------------------------------------------------------
// Helper: create a valid StockAnalytics object with defaults
// ---------------------------------------------------------------------------

function createStockAnalytics(overrides: Partial<StockAnalytics> = {}): StockAnalytics {
  return {
    stockId: 'stock-1',
    label: 'TestStock',
    inflow: 5.0,
    outflow: 3.0,
    netChange: 2.0,
    currentValue: 10.0,
    capacity: Infinity,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: create a minimal GraphState for computeStockAnalytics tests
// ---------------------------------------------------------------------------

function createGraphState(
  nodes: Record<string, { type: string; label?: string; value?: number; capacity?: number; initialValue?: number }> = {},
  connections: Record<string, { fromId: string; toId: string; rate: number }> = {},
): GraphState {
  const graphNodes: Record<string, any> = {};
  for (const [id, def] of Object.entries(nodes)) {
    if (def.type === 'stock') {
      graphNodes[id] = {
        id,
        type: 'stock',
        position: { x: 0, y: 0 },
        label: def.label,
        value: def.value ?? 0,
        capacity: def.capacity ?? Infinity,
        initialValue: def.initialValue ?? 0,
      };
    } else {
      graphNodes[id] = {
        id,
        type: def.type,
        position: { x: 0, y: 0 },
        label: def.label,
      };
    }
  }

  const graphConns: Record<string, Connection> = {};
  for (const [id, def] of Object.entries(connections)) {
    graphConns[id] = {
      id,
      fromId: def.fromId,
      toId: def.toId,
      rate: def.rate,
      formulaStr: String(def.rate),
    };
  }

  return {
    nodes: graphNodes,
    connections: graphConns,
    version: 1,
    selectedModuleIds: [],
    selectedConnectionIds: [],
  };
}

// ---------------------------------------------------------------------------
// Tests: AnalyticsPanel class
// ---------------------------------------------------------------------------

describe('AnalyticsPanel (Story 6.2)', () => {
  let container: HTMLElement;
  let panel: AnalyticsPanel;

  beforeEach(() => {
    container = createContainer();
    panel = new AnalyticsPanel(container);
  });

  afterEach(() => {
    panel.destroy();
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  });

  // ── Constructor ──────────────────────────────────────────────────────

  describe('constructor', () => {
    it('appends analytics panel root element to container', () => {
      const root = container.querySelector('.analytics-panel');
      expect(root).not.toBeNull();
    });

    it('shows empty state by default (data section hidden)', () => {
      const emptyEl = container.querySelector('.analytics-panel__empty') as HTMLElement;
      const dataEl = container.querySelector('.analytics-panel__data') as HTMLElement;
      expect(emptyEl).not.toBeNull();
      expect(dataEl).not.toBeNull();
      expect(dataEl.style.display).toBe('none');
    });
  });

  // ── setStock(null) ──────────────────────────────────────────────────

  describe('setStock(null)', () => {
    it('shows empty state and hides data section', () => {
      // First show data, then clear
      panel.setStock(createStockAnalytics());
      panel.setStock(null);

      const emptyEl = container.querySelector('.analytics-panel__empty') as HTMLElement;
      const dataEl = container.querySelector('.analytics-panel__data') as HTMLElement;
      expect(dataEl.style.display).toBe('none');
      expect(emptyEl.style.display).not.toBe('none');
    });
  });

  // ── setStock(validData) ─────────────────────────────────────────────

  describe('setStock(validData)', () => {
    it('shows data section and hides empty state', () => {
      panel.setStock(createStockAnalytics());

      const emptyEl = container.querySelector('.analytics-panel__empty') as HTMLElement;
      const dataEl = container.querySelector('.analytics-panel__data') as HTMLElement;
      expect(dataEl.style.display).not.toBe('none');
      expect(emptyEl.style.display).toBe('none');
    });

    it('populates all fields with correct text content', () => {
      panel.setStock(createStockAnalytics({
        stockId: 'stock-1',
        label: 'MyStock',
        inflow: 5.0,
        outflow: 3.0,
        netChange: 2.0,
        currentValue: 10.0,
        capacity: Infinity,
      }));

      const label = container.querySelector('.analytics-panel__stock-label');
      const inflow = container.querySelector('.analytics-panel__field-value--inflow');
      const outflow = container.querySelector('.analytics-panel__field-value--outflow');
      const net = container.querySelector('.analytics-panel__field-value--net');
      const current = container.querySelector('.analytics-panel__field-value--current');
      const capacity = container.querySelector('.analytics-panel__field-value--capacity');

      expect(label?.textContent).toBe('MyStock');
      expect(inflow?.textContent).toBe('5.0');
      expect(outflow?.textContent).toBe('3.0');
      expect(net?.textContent).toBe('+2.0');
      expect(current?.textContent).toBe('10.0');
      expect(capacity?.textContent).toBe('∞');
    });
  });

  // ── Net change color coding ─────────────────────────────────────────

  describe('net change color coding', () => {
    it('positive netChange → has --positive class and text starts with "+"', () => {
      panel.setStock(createStockAnalytics({ netChange: 5.0 }));

      const netEl = container.querySelector('.analytics-panel__field-value--net');
      expect(netEl?.classList.contains('analytics-panel__field-value--positive')).toBe(true);
      expect(netEl?.classList.contains('analytics-panel__field-value--negative')).toBe(false);
      expect(netEl?.textContent).toBe('+5.0');
    });

    it('negative netChange → has --negative class and text starts with "−" (U+2212)', () => {
      panel.setStock(createStockAnalytics({ netChange: -3.0 }));

      const netEl = container.querySelector('.analytics-panel__field-value--net');
      expect(netEl?.classList.contains('analytics-panel__field-value--negative')).toBe(true);
      expect(netEl?.classList.contains('analytics-panel__field-value--positive')).toBe(false);
      expect(netEl?.textContent).toBe('−3.0'); // U+2212 minus sign
    });

    it('zero netChange → neither positive nor negative class', () => {
      panel.setStock(createStockAnalytics({ netChange: 0 }));

      const netEl = container.querySelector('.analytics-panel__field-value--net');
      expect(netEl?.classList.contains('analytics-panel__field-value--positive')).toBe(false);
      expect(netEl?.classList.contains('analytics-panel__field-value--negative')).toBe(false);
      expect(netEl?.textContent).toBe('0.0');
    });

    it('transitions from positive to negative correctly', () => {
      panel.setStock(createStockAnalytics({ netChange: 5.0 }));
      panel.setStock(createStockAnalytics({ netChange: -2.0 }));

      const netEl = container.querySelector('.analytics-panel__field-value--net');
      expect(netEl?.classList.contains('analytics-panel__field-value--negative')).toBe(true);
      expect(netEl?.classList.contains('analytics-panel__field-value--positive')).toBe(false);
    });
  });

  // ── Capacity display ────────────────────────────────────────────────

  describe('capacity display', () => {
    it('Infinity capacity → displays "∞"', () => {
      panel.setStock(createStockAnalytics({ capacity: Infinity }));
      const capEl = container.querySelector('.analytics-panel__field-value--capacity');
      expect(capEl?.textContent).toBe('∞');
    });

    it('finite capacity → displays integer', () => {
      panel.setStock(createStockAnalytics({ capacity: 100 }));
      const capEl = container.querySelector('.analytics-panel__field-value--capacity');
      expect(capEl?.textContent).toBe('100');
    });
  });

  // ── NaN guard ───────────────────────────────────────────────────────

  describe('NaN guard', () => {
    it('NaN currentValue → displays "0.0"', () => {
      panel.setStock(createStockAnalytics({ currentValue: NaN }));
      const currentEl = container.querySelector('.analytics-panel__field-value--current');
      expect(currentEl?.textContent).toBe('0.0');
    });

    it('NaN inflow → displays "0.0"', () => {
      panel.setStock(createStockAnalytics({ inflow: NaN }));
      const inflowEl = container.querySelector('.analytics-panel__field-value--inflow');
      expect(inflowEl?.textContent).toBe('0.0');
    });
  });

  // ── Label fallback ──────────────────────────────────────────────────

  describe('label fallback', () => {
    it('empty label → falls back to stockId prefix', () => {
      panel.setStock(createStockAnalytics({ stockId: 'stock-abc-123', label: '' }));
      const labelEl = container.querySelector('.analytics-panel__stock-label');
      expect(labelEl?.textContent).toBe('stock-ab');
    });

    it('label provided → uses custom label', () => {
      panel.setStock(createStockAnalytics({ label: 'MyLabel' }));
      const labelEl = container.querySelector('.analytics-panel__stock-label');
      expect(labelEl?.textContent).toBe('MyLabel');
    });
  });

  // ── destroy ─────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('removes root element from container', () => {
      expect(container.querySelector('.analytics-panel')).not.toBeNull();
      panel.destroy();
      expect(container.querySelector('.analytics-panel')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: computeStockAnalytics pure function
// ---------------------------------------------------------------------------

describe('computeStockAnalytics (Story 6.2)', () => {
  it('stock with one incoming connection → inflow=5, outflow=0, netChange=5', () => {
    const state = createGraphState(
      { 'source-1': { type: 'source' }, 'stock-1': { type: 'stock', value: 0, capacity: Infinity } },
      { 'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 5 } },
    );
    const result = computeStockAnalytics(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.inflow).toBe(5);
    expect(result!.outflow).toBe(0);
    expect(result!.netChange).toBe(5);
  });

  it('stock with one incoming (rate=7) and one outgoing (rate=3) → inflow=7, outflow=3, netChange=4', () => {
    const state = createGraphState(
      {
        'source-1': { type: 'source' },
        'stock-1': { type: 'stock', value: 0, capacity: Infinity },
        'sink-1': { type: 'sink' },
      },
      {
        'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 7 },
        'conn-2': { fromId: 'stock-1', toId: 'sink-1', rate: 3 },
      },
    );
    const result = computeStockAnalytics(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.inflow).toBe(7);
    expect(result!.outflow).toBe(3);
    expect(result!.netChange).toBe(4);
  });

  it('stock with two incoming (2+3) and one outgoing (8) → inflow=5, outflow=8, netChange=-3', () => {
    const state = createGraphState(
      {
        'source-1': { type: 'source' },
        'source-2': { type: 'source' },
        'stock-1': { type: 'stock', value: 0, capacity: Infinity },
        'sink-1': { type: 'sink' },
      },
      {
        'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 2 },
        'conn-2': { fromId: 'source-2', toId: 'stock-1', rate: 3 },
        'conn-3': { fromId: 'stock-1', toId: 'sink-1', rate: 8 },
      },
    );
    const result = computeStockAnalytics(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.inflow).toBe(5);
    expect(result!.outflow).toBe(8);
    expect(result!.netChange).toBe(-3);
  });

  it('non-existent stockId → returns null', () => {
    const state = createGraphState();
    const result = computeStockAnalytics(state, 'nonexistent');
    expect(result).toBeNull();
  });

  it('stockId pointing to source node → returns null', () => {
    const state = createGraphState(
      { 'source-1': { type: 'source' } },
    );
    const result = computeStockAnalytics(state, 'source-1');
    expect(result).toBeNull();
  });

  it('empty connections → inflow=0, outflow=0, netChange=0', () => {
    const state = createGraphState(
      { 'stock-1': { type: 'stock', value: 0, capacity: Infinity } },
    );
    const result = computeStockAnalytics(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.inflow).toBe(0);
    expect(result!.outflow).toBe(0);
    expect(result!.netChange).toBe(0);
  });

  it('stock with Infinity capacity → capacity field === Infinity', () => {
    const state = createGraphState(
      { 'stock-1': { type: 'stock', value: 0, capacity: Infinity } },
    );
    const result = computeStockAnalytics(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.capacity).toBe(Infinity);
  });

  it('stock with custom label → label field preserves custom label', () => {
    const state = createGraphState(
      { 'stock-1': { type: 'stock', value: 0, capacity: Infinity, label: 'Water' } },
    );
    const result = computeStockAnalytics(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Water');
  });

  it('stock without label → label falls back to id prefix', () => {
    const state = createGraphState(
      { 'stock-abc-123': { type: 'stock', value: 0, capacity: Infinity } },
    );
    const result = computeStockAnalytics(state, 'stock-abc-123');
    expect(result).not.toBeNull();
    expect(result!.label).toBe('stock-ab');
  });
});
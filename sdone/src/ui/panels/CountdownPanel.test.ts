import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { CountdownPanel, computeStockCountdown } from './CountdownPanel.js';
import type { StockCountdown } from './CountdownPanel.js';
import type { GraphState, Connection } from '../../state/GraphState.js';

// ---------------------------------------------------------------------------
// Helper: create a container for the countdown panel
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'layer-panel-right';
  document.body.appendChild(container);
  return container;
}

// ---------------------------------------------------------------------------
// Helper: create a valid StockCountdown object with defaults
// ---------------------------------------------------------------------------

function createStockCountdown(overrides: Partial<StockCountdown> = {}): StockCountdown {
  return {
    stockId: 'stock-1',
    label: 'TestStock',
    netRate: 7.0,
    remainingSeconds: 10.0,
    direction: 'to-capacity',
    currentValue: 30.0,
    capacity: 100,
    hasConnections: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: create a minimal GraphState for computeStockCountdown tests
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
// Tests: CountdownPanel class
// ---------------------------------------------------------------------------

describe('CountdownPanel (Story 6.3)', () => {
  let container: HTMLElement;
  let panel: CountdownPanel;

  beforeEach(() => {
    container = createContainer();
    panel = new CountdownPanel(container);
  });

  afterEach(() => {
    panel.destroy();
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  });

  // ── Constructor ──────────────────────────────────────────────────────

  describe('constructor', () => {
    it('appends countdown panel root element to container', () => {
      const root = container.querySelector('.countdown-panel');
      expect(root).not.toBeNull();
    });

    it('shows empty state by default (data section hidden)', () => {
      const emptyEl = container.querySelector('.countdown-panel__empty') as HTMLElement;
      const dataEl = container.querySelector('.countdown-panel__data') as HTMLElement;
      expect(emptyEl).not.toBeNull();
      expect(dataEl).not.toBeNull();
      expect(dataEl.style.display).toBe('none');
    });
  });

  // ── setCountdown(null) ──────────────────────────────────────────────

  describe('setCountdown(null)', () => {
    it('shows empty state and hides data section', () => {
      // First show data, then clear
      panel.setCountdown(createStockCountdown());
      panel.setCountdown(null);

      const emptyEl = container.querySelector('.countdown-panel__empty') as HTMLElement;
      const dataEl = container.querySelector('.countdown-panel__data') as HTMLElement;
      expect(dataEl.style.display).toBe('none');
      expect(emptyEl.style.display).not.toBe('none');
    });
  });

  // ── setCountdown(validData) ─────────────────────────────────────────

  describe('setCountdown(validData)', () => {
    it('shows data section and hides empty state', () => {
      panel.setCountdown(createStockCountdown());

      const emptyEl = container.querySelector('.countdown-panel__empty') as HTMLElement;
      const dataEl = container.querySelector('.countdown-panel__data') as HTMLElement;
      expect(dataEl.style.display).not.toBe('none');
      expect(emptyEl.style.display).toBe('none');
    });
  });

  // ── Direction: to-capacity (AC1) ────────────────────────────────────

  describe('direction: to-capacity (AC1)', () => {
    it('displays "到达上限:" with amber class', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-capacity',
        remainingSeconds: 10.0,
        netRate: 7.0,
      }));

      const dirEl = container.querySelector('.countdown-panel__field-value--direction') as HTMLElement;
      expect(dirEl.textContent).toBe('到达上限:');
      expect(dirEl.classList.contains('countdown-panel__field-value--to-capacity')).toBe(true);
    });

    it('displays remaining time "10.0" with unit span visible', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-capacity',
        remainingSeconds: 10.0,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__field--time .countdown-panel__field-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('10.0');
      expect(unitEl.style.display).not.toBe('none');
    });
  });

  // ── Direction: to-zero (AC2) ────────────────────────────────────────

  describe('direction: to-zero (AC2)', () => {
    it('displays "归零:" with blue class', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-zero',
        remainingSeconds: 8.0,
        netRate: -5.0,
      }));

      const dirEl = container.querySelector('.countdown-panel__field-value--direction') as HTMLElement;
      expect(dirEl.textContent).toBe('归零:');
      expect(dirEl.classList.contains('countdown-panel__field-value--to-zero')).toBe(true);
    });

    it('displays remaining time "8.0" with unit span visible', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-zero',
        remainingSeconds: 8.0,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__field--time .countdown-panel__field-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('8.0');
      expect(unitEl.style.display).not.toBe('none');
    });
  });

  // ── Direction: stable (AC4) ─────────────────────────────────────────

  describe('direction: stable (AC4)', () => {
    it('stable with no connections → time displays "--", unit hidden', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'stable',
        remainingSeconds: null,
        hasConnections: false,
        netRate: 0,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__field--time .countdown-panel__field-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('--');
      expect(unitEl.style.display).toBe('none');
    });

    it('stable with connections → time displays "无变化 — 存量保持稳定", unit hidden', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'stable',
        remainingSeconds: null,
        hasConnections: true,
        netRate: 0,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__field--time .countdown-panel__field-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('无变化 — 存量保持稳定');
      expect(unitEl.style.display).toBe('none');
    });

    it('stable direction → direction text is empty', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'stable',
        remainingSeconds: null,
        hasConnections: false,
        netRate: 0,
      }));

      const dirEl = container.querySelector('.countdown-panel__field-value--direction') as HTMLElement;
      expect(dirEl.textContent).toBe('');
    });
  });

  // ── Terminal state (AC5) ────────────────────────────────────────────

  describe('terminal state (AC5)', () => {
    it('to-capacity with remainingSeconds=0 → "已达上限" with --reached and --to-capacity classes, unit hidden', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-capacity',
        remainingSeconds: 0,
        netRate: 5,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__field--time .countdown-panel__field-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('已达上限');
      expect(timeEl.classList.contains('countdown-panel__field-value--reached')).toBe(true);
      expect(timeEl.classList.contains('countdown-panel__field-value--to-capacity')).toBe(true);
      expect(unitEl.style.display).toBe('none');
    });

    it('to-zero with remainingSeconds=0 → "已归零" with --reached and --to-zero classes, unit hidden', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-zero',
        remainingSeconds: 0,
        netRate: -5,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__field--time .countdown-panel__field-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('已归零');
      expect(timeEl.classList.contains('countdown-panel__field-value--reached')).toBe(true);
      expect(timeEl.classList.contains('countdown-panel__field-value--to-zero')).toBe(true);
      expect(unitEl.style.display).toBe('none');
    });

    it('remainingSeconds < 0 (e.g. -0.1) → same as 0 (≤0 threshold)', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-capacity',
        remainingSeconds: -0.1,
        netRate: 5,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      expect(timeEl.textContent).toBe('已达上限');
      expect(timeEl.classList.contains('countdown-panel__field-value--reached')).toBe(true);
    });

    // P6: < 0.05 threshold — tiny positive remainders round to "0.0" visually
    it('P6: remainingSeconds=0.049 → terminal state "已达上限" (< 0.05 threshold)', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-capacity',
        remainingSeconds: 0.049,
        netRate: 5,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__field--time .countdown-panel__field-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('已达上限');
      expect(timeEl.classList.contains('countdown-panel__field-value--reached')).toBe(true);
      expect(unitEl.style.display).toBe('none');
    });

    it('P6: remainingSeconds=0.05 → active countdown "0.1" (>= 0.05 threshold)', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-capacity',
        remainingSeconds: 0.05,
        netRate: 5,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__field--time .countdown-panel__field-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('0.1');
      expect(unitEl.style.display).not.toBe('none');
    });
  });

  // ── Infinite capacity ───────────────────────────────────────────────

  describe('infinite capacity', () => {
    it('to-capacity with Infinity capacity → "∞ — 无限容量", unit hidden', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-capacity',
        remainingSeconds: null,
        capacity: Infinity,
        netRate: 5,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__field--time .countdown-panel__field-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('∞ — 无限容量');
      expect(unitEl.style.display).toBe('none');
    });
  });

  // ── Net rate display ────────────────────────────────────────────────

  describe('net rate display', () => {
    it('positive netRate → "+5.0" with green class', () => {
      panel.setCountdown(createStockCountdown({ netRate: 5 }));

      const rateEl = container.querySelector('.countdown-panel__field-value--rate') as HTMLElement;
      expect(rateEl.textContent).toBe('+5.0');
      expect(rateEl.classList.contains('countdown-panel__field-value--rate-positive')).toBe(true);
    });

    it('negative netRate → "−3.0" (U+2212) with red class', () => {
      panel.setCountdown(createStockCountdown({ netRate: -3 }));

      const rateEl = container.querySelector('.countdown-panel__field-value--rate') as HTMLElement;
      expect(rateEl.textContent).toBe('−3.0'); // U+2212 minus sign
      expect(rateEl.classList.contains('countdown-panel__field-value--rate-negative')).toBe(true);
    });

    it('zero netRate → "0.0" with no color class', () => {
      panel.setCountdown(createStockCountdown({ netRate: 0 }));

      const rateEl = container.querySelector('.countdown-panel__field-value--rate') as HTMLElement;
      expect(rateEl.textContent).toBe('0.0');
      expect(rateEl.classList.contains('countdown-panel__field-value--rate-positive')).toBe(false);
      expect(rateEl.classList.contains('countdown-panel__field-value--rate-negative')).toBe(false);
    });
  });

  // ── NaN guard ───────────────────────────────────────────────────────

  describe('NaN guard', () => {
    it('NaN remainingSeconds → time displays "0.0" with unit span visible', () => {
      panel.setCountdown(createStockCountdown({
        direction: 'to-capacity',
        remainingSeconds: NaN,
      }));

      const timeEl = container.querySelector('.countdown-panel__field-value--time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__field--time .countdown-panel__field-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('0.0');
      expect(unitEl.style.display).not.toBe('none');
    });

    it('NaN netRate → rate displays "0.0"', () => {
      panel.setCountdown(createStockCountdown({ netRate: NaN }));

      const rateEl = container.querySelector('.countdown-panel__field-value--rate') as HTMLElement;
      expect(rateEl.textContent).toBe('0.0');
    });
  });

  // ── Label fallback ──────────────────────────────────────────────────

  describe('label fallback', () => {
    it('empty label → falls back to stockId prefix', () => {
      panel.setCountdown(createStockCountdown({ stockId: 'stock-abc-123', label: '' }));

      const labelEl = container.querySelector('.countdown-panel__stock-label');
      expect(labelEl?.textContent).toBe('stock-ab');
    });

    it('label provided → uses custom label', () => {
      panel.setCountdown(createStockCountdown({ label: 'MyLabel' }));

      const labelEl = container.querySelector('.countdown-panel__stock-label');
      expect(labelEl?.textContent).toBe('MyLabel');
    });
  });

  // ── destroy ─────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('removes root element from container', () => {
      expect(container.querySelector('.countdown-panel')).not.toBeNull();
      panel.destroy();
      expect(container.querySelector('.countdown-panel')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: computeStockCountdown pure function
// ---------------------------------------------------------------------------

describe('computeStockCountdown (Story 6.3)', () => {
  it('AC1: stock value=30, capacity=100, incoming rate=7 → netRate=7, direction=to-capacity, remainingSeconds=10.0', () => {
    const state = createGraphState(
      { 'source-1': { type: 'source' }, 'stock-1': { type: 'stock', value: 30, capacity: 100 } },
      { 'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 7 } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.netRate).toBe(7);
    expect(result!.direction).toBe('to-capacity');
    expect(result!.remainingSeconds).toBeCloseTo(10.0);
  });

  it('AC2: stock value=40, capacity=100, outgoing rate=5 → netRate=-5, direction=to-zero, remainingSeconds=8.0', () => {
    const state = createGraphState(
      { 'stock-1': { type: 'stock', value: 40, capacity: 100 }, 'sink-1': { type: 'sink' } },
      { 'conn-1': { fromId: 'stock-1', toId: 'sink-1', rate: 5 } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.netRate).toBe(-5);
    expect(result!.direction).toBe('to-zero');
    expect(result!.remainingSeconds).toBeCloseTo(8.0);
  });

  it('stock with balanced inflow=outflow → netRate=0, direction=stable, remainingSeconds=null', () => {
    const state = createGraphState(
      {
        'source-1': { type: 'source' },
        'stock-1': { type: 'stock', value: 50, capacity: 100 },
        'sink-1': { type: 'sink' },
      },
      {
        'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 5 },
        'conn-2': { fromId: 'stock-1', toId: 'sink-1', rate: 5 },
      },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.netRate).toBe(0);
    expect(result!.direction).toBe('stable');
    expect(result!.remainingSeconds).toBeNull();
  });

  it('stock with two incoming (3+4) and one outgoing (2) → netRate=5, direction=to-capacity', () => {
    const state = createGraphState(
      {
        'source-1': { type: 'source' },
        'source-2': { type: 'source' },
        'stock-1': { type: 'stock', value: 30, capacity: 100 },
        'sink-1': { type: 'sink' },
      },
      {
        'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 3 },
        'conn-2': { fromId: 'source-2', toId: 'stock-1', rate: 4 },
        'conn-3': { fromId: 'stock-1', toId: 'sink-1', rate: 2 },
      },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.netRate).toBe(5);
    expect(result!.direction).toBe('to-capacity');
    expect(result!.remainingSeconds).toBeCloseTo((100 - 30) / 5);
  });

  it('stock with infinite capacity, netRate=5 → direction=to-capacity, remainingSeconds=null', () => {
    const state = createGraphState(
      { 'source-1': { type: 'source' }, 'stock-1': { type: 'stock', value: 30, capacity: Infinity } },
      { 'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 5 } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('to-capacity');
    expect(result!.remainingSeconds).toBeNull();
  });

  it('stock with value=0, netRate=-5 → direction=to-zero, remainingSeconds=0', () => {
    const state = createGraphState(
      { 'stock-1': { type: 'stock', value: 0, capacity: 100 }, 'sink-1': { type: 'sink' } },
      { 'conn-1': { fromId: 'stock-1', toId: 'sink-1', rate: 5 } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('to-zero');
    expect(result!.remainingSeconds).toBe(0);
  });

  it('stock with capacity=100, value=100, netRate=5 → direction=to-capacity, remainingSeconds=0', () => {
    const state = createGraphState(
      { 'source-1': { type: 'source' }, 'stock-1': { type: 'stock', value: 100, capacity: 100 } },
      { 'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 5 } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('to-capacity');
    expect(result!.remainingSeconds).toBe(0);
  });

  it('non-existent stockId → returns null', () => {
    const state = createGraphState();
    const result = computeStockCountdown(state, 'nonexistent');
    expect(result).toBeNull();
  });

  it('stockId pointing to source node → returns null', () => {
    const state = createGraphState(
      { 'source-1': { type: 'source' } },
    );
    const result = computeStockCountdown(state, 'source-1');
    expect(result).toBeNull();
  });

  it('stockId pointing to sink node → returns null', () => {
    const state = createGraphState(
      { 'sink-1': { type: 'sink' } },
    );
    const result = computeStockCountdown(state, 'sink-1');
    expect(result).toBeNull();
  });

  it('empty connections → netRate=0, direction=stable, hasConnections=false', () => {
    const state = createGraphState(
      { 'stock-1': { type: 'stock', value: 0, capacity: Infinity } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.netRate).toBe(0);
    expect(result!.direction).toBe('stable');
    expect(result!.hasConnections).toBe(false);
  });

  it('stock with balanced inflow=outflow → hasConnections=true (AC4 balanced case)', () => {
    const state = createGraphState(
      {
        'source-1': { type: 'source' },
        'stock-1': { type: 'stock', value: 50, capacity: 100 },
        'sink-1': { type: 'sink' },
      },
      {
        'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 5 },
        'conn-2': { fromId: 'stock-1', toId: 'sink-1', rate: 5 },
      },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.hasConnections).toBe(true);
  });

  it('stock with custom label → label field preserves custom label', () => {
    const state = createGraphState(
      { 'stock-1': { type: 'stock', value: 0, capacity: Infinity, label: 'Water' } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Water');
  });

  // ── P2: hasConnections with zero-rate connections ──────────────────

  it('P2: stock with zero-rate connection → hasConnections=true (connection count, not rate sum)', () => {
    const state = createGraphState(
      { 'source-1': { type: 'source' }, 'stock-1': { type: 'stock', value: 50, capacity: 100 } },
      { 'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 0 } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.netRate).toBe(0);
    expect(result!.direction).toBe('stable');
    expect(result!.hasConnections).toBe(true); // connection exists even though rate=0
  });

  // ── P5: Negative stock.value clamp ─────────────────────────────────

  it('P5: negative stock.value with negative netRate → remainingSeconds=0 (clamped to zero)', () => {
    const state = createGraphState(
      { 'stock-1': { type: 'stock', value: -50, capacity: 100 }, 'sink-1': { type: 'sink' } },
      { 'conn-1': { fromId: 'stock-1', toId: 'sink-1', rate: 10 } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('to-zero');
    expect(result!.remainingSeconds).toBe(0); // Math.max(0, -50) / 10 = 0
  });
});
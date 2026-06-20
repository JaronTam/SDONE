import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  CountdownPanel,
  computeStockCountdown,
  computeAllStockCountdowns,
  sortCountdownsByUrgency,
} from './CountdownPanel.js';
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
  nodes: Record<
    string,
    { type: string; label?: string; value?: number; capacity?: number; initialValue?: number }
  > = {},
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
        capacity: def.capacity ?? 100,
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
// Tests: CountdownPanel class (Story 7.2 — multi-stock)
// ---------------------------------------------------------------------------

describe('CountdownPanel (Story 7.2)', () => {
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

    it('shows empty state by default (list hidden)', () => {
      const emptyEl = container.querySelector('.countdown-panel__empty') as HTMLElement;
      const listEl = container.querySelector('.countdown-panel__list') as HTMLElement;
      expect(emptyEl).not.toBeNull();
      expect(listEl).not.toBeNull();
      expect(listEl.style.display).toBe('none');
    });

    it('empty state shows ⏱️ icon and text', () => {
      const emptyEl = container.querySelector('.countdown-panel__empty') as HTMLElement;
      expect(emptyEl.textContent).toContain('⏱️');
      expect(emptyEl.textContent).toContain('画布上暂无存量模块');
    });
  });

  // ── setCountdowns([]) — empty state (AC7) ────────────────────────────

  describe('AC7: setCountdowns([]) — empty state', () => {
    it('shows empty state and hides list', () => {
      panel.setCountdowns([]);
      const emptyEl = container.querySelector('.countdown-panel__empty') as HTMLElement;
      const listEl = container.querySelector('.countdown-panel__list') as HTMLElement;
      expect(listEl.style.display).toBe('none');
      expect(emptyEl.style.display).not.toBe('none');
    });

    it('switches from data to empty state', () => {
      panel.setCountdowns([createStockCountdown()]);
      panel.setCountdowns([]);
      const emptyEl = container.querySelector('.countdown-panel__empty') as HTMLElement;
      const listEl = container.querySelector('.countdown-panel__list') as HTMLElement;
      expect(listEl.style.display).toBe('none');
      expect(emptyEl.style.display).not.toBe('none');
    });
  });

  // ── setCountdowns([single]) — single stock (backward compat) ────────

  describe('setCountdowns([single]) — single stock', () => {
    it('shows list and hides empty state', () => {
      panel.setCountdowns([createStockCountdown()]);

      const emptyEl = container.querySelector('.countdown-panel__empty') as HTMLElement;
      const listEl = container.querySelector('.countdown-panel__list') as HTMLElement;
      expect(listEl.style.display).not.toBe('none');
      expect(emptyEl.style.display).toBe('none');
    });

    it('renders one row', () => {
      panel.setCountdowns([createStockCountdown()]);

      const rows = container.querySelectorAll('.countdown-panel__row');
      expect(rows.length).toBe(1);
    });
  });

  // ── setCountdowns([multi]) — multiple stocks (AC5) ──────────────────

  describe('AC5: setCountdowns([multi]) — multiple stocks', () => {
    it('renders 3 rows in sorted order', () => {
      const data = [
        createStockCountdown({ stockId: 's1', label: 'Alpha', remainingSeconds: 20.0, netRate: 3 }),
        createStockCountdown({
          stockId: 's2',
          label: 'Beta',
          remainingSeconds: 5.0,
          netRate: -2,
          direction: 'to-zero',
        }),
        createStockCountdown({ stockId: 's3', label: 'Gamma', remainingSeconds: 1.0, netRate: 8 }),
      ];
      const sorted = sortCountdownsByUrgency(data);
      panel.setCountdowns(sorted);

      const rows = container.querySelectorAll('.countdown-panel__row');
      expect(rows.length).toBe(3);
      // Shortest remaining first (Gamma: 1.0, Beta: 5.0, Alpha: 20.0)
      expect(rows[0].querySelector('.countdown-panel__row-label')?.textContent).toBe('Gamma');
      expect(rows[1].querySelector('.countdown-panel__row-label')?.textContent).toBe('Beta');
      expect(rows[2].querySelector('.countdown-panel__row-label')?.textContent).toBe('Alpha');
    });
  });

  // ── Direction: to-capacity (AC1) ────────────────────────────────────

  describe('direction: to-capacity (AC1)', () => {
    it('displays "↑ 到达上限:" with amber class', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'to-capacity',
          remainingSeconds: 10.0,
          netRate: 7.0,
        }),
      ]);

      const dirEl = container.querySelector('.countdown-panel__row-direction') as HTMLElement;
      expect(dirEl.textContent).toBe('↑ 到达上限:');
      expect(dirEl.classList.contains('countdown-panel__field-value--to-capacity')).toBe(true);
    });

    it('displays remaining time "10.0" with unit span visible', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'to-capacity',
          remainingSeconds: 10.0,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__row-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('10.0');
      expect(unitEl.style.display).not.toBe('none');
    });
  });

  // ── Direction: to-zero (AC2) ────────────────────────────────────────

  describe('direction: to-zero (AC2)', () => {
    it('displays "↓ 归零:" with blue class', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'to-zero',
          remainingSeconds: 8.0,
          netRate: -5.0,
        }),
      ]);

      const dirEl = container.querySelector('.countdown-panel__row-direction') as HTMLElement;
      expect(dirEl.textContent).toBe('↓ 归零:');
      expect(dirEl.classList.contains('countdown-panel__field-value--to-zero')).toBe(true);
    });

    it('displays remaining time "8.0" with unit span visible', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'to-zero',
          remainingSeconds: 8.0,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__row-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('8.0');
      expect(unitEl.style.display).not.toBe('none');
    });
  });

  // ── Direction: stable (AC4) ─────────────────────────────────────────

  describe('direction: stable (AC4)', () => {
    it('stable with no connections → time displays "—", unit hidden', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'stable',
          remainingSeconds: null,
          hasConnections: false,
          netRate: 0,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__row-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('—');
      expect(unitEl.style.display).toBe('none');
    });

    it('stable with connections → time displays "无变化", unit hidden', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'stable',
          remainingSeconds: null,
          hasConnections: true,
          netRate: 0,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__row-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('无变化');
      expect(unitEl.style.display).toBe('none');
    });

    it('stable direction → direction text is "—"', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'stable',
          remainingSeconds: null,
          hasConnections: false,
          netRate: 0,
        }),
      ]);

      const dirEl = container.querySelector('.countdown-panel__row-direction') as HTMLElement;
      expect(dirEl.textContent).toBe('—');
    });
  });

  // ── Terminal state (AC4) ────────────────────────────────────────────

  describe('AC4: terminal state', () => {
    it('to-capacity with remainingSeconds=0 → "已达上限" with reached class, unit hidden', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'to-capacity',
          remainingSeconds: 0,
          netRate: 5,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__row-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('已达上限');
      expect(timeEl.classList.contains('countdown-panel__row-time--reached')).toBe(true);
      expect(timeEl.classList.contains('countdown-panel__field-value--to-capacity')).toBe(true);
      expect(unitEl.style.display).toBe('none');
    });

    it('to-zero with remainingSeconds=0 → "已归零" with reached class, unit hidden', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'to-zero',
          remainingSeconds: 0,
          netRate: -5,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__row-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('已归零');
      expect(timeEl.classList.contains('countdown-panel__row-time--reached')).toBe(true);
      expect(timeEl.classList.contains('countdown-panel__field-value--to-zero')).toBe(true);
      expect(unitEl.style.display).toBe('none');
    });

    it('remainingSeconds < 0 (e.g. -0.1) → same as 0 (≤0 threshold)', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'to-capacity',
          remainingSeconds: -0.1,
          netRate: 5,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      expect(timeEl.textContent).toBe('已达上限');
      expect(timeEl.classList.contains('countdown-panel__row-time--reached')).toBe(true);
    });

    it('P6: remainingSeconds=0.049 → terminal state "已达上限" (< 0.05 threshold)', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'to-capacity',
          remainingSeconds: 0.049,
          netRate: 5,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__row-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('已达上限');
      expect(timeEl.classList.contains('countdown-panel__row-time--reached')).toBe(true);
      expect(unitEl.style.display).toBe('none');
    });

    it('P6: remainingSeconds=0.05 → active countdown "0.1" (>= 0.05 threshold)', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'to-capacity',
          remainingSeconds: 0.05,
          netRate: 5,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__row-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('0.1');
      expect(unitEl.style.display).not.toBe('none');
    });
  });

  // ── Stable state (replaces infinite capacity tests post-Infinity fix) ─

  describe('stable state', () => {
    it('stable direction with no connections → "—", unit hidden', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'stable',
          remainingSeconds: null,
          capacity: 100,
          netRate: 0,
          hasConnections: false,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__row-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('—');
      expect(unitEl.style.display).toBe('none');
    });
  });

  // ── Net rate display ────────────────────────────────────────────────

  describe('net rate display', () => {
    it('positive netRate → "+5.0" with green class', () => {
      panel.setCountdowns([createStockCountdown({ netRate: 5 })]);

      const rateEl = container.querySelector('.countdown-panel__row-rate') as HTMLElement;
      expect(rateEl.textContent).toBe('+5.0');
      expect(rateEl.classList.contains('countdown-panel__field-value--rate-positive')).toBe(true);
    });

    it('negative netRate → "−3.0" (U+2212) with red class', () => {
      panel.setCountdowns([createStockCountdown({ netRate: -3 })]);

      const rateEl = container.querySelector('.countdown-panel__row-rate') as HTMLElement;
      expect(rateEl.textContent).toBe('−3.0'); // U+2212 minus sign
      expect(rateEl.classList.contains('countdown-panel__field-value--rate-negative')).toBe(true);
    });

    it('zero netRate → "0.0" with no color class', () => {
      panel.setCountdowns([createStockCountdown({ netRate: 0 })]);

      const rateEl = container.querySelector('.countdown-panel__row-rate') as HTMLElement;
      expect(rateEl.textContent).toBe('0.0');
      expect(rateEl.classList.contains('countdown-panel__field-value--rate-positive')).toBe(false);
      expect(rateEl.classList.contains('countdown-panel__field-value--rate-negative')).toBe(false);
    });
  });

  // ── NaN guard ───────────────────────────────────────────────────────

  describe('NaN guard', () => {
    it('NaN remainingSeconds → time displays "0.0" with unit span visible', () => {
      panel.setCountdowns([
        createStockCountdown({
          direction: 'to-capacity',
          remainingSeconds: NaN,
        }),
      ]);

      const timeEl = container.querySelector('.countdown-panel__row-time') as HTMLElement;
      const unitEl = container.querySelector('.countdown-panel__row-unit') as HTMLElement;
      expect(timeEl.textContent).toBe('0.0');
      expect(unitEl.style.display).not.toBe('none');
    });

    it('NaN netRate → rate displays "0.0"', () => {
      panel.setCountdowns([createStockCountdown({ netRate: NaN })]);

      const rateEl = container.querySelector('.countdown-panel__row-rate') as HTMLElement;
      expect(rateEl.textContent).toBe('0.0');
    });
  });

  // ── Urgency CSS classes ─────────────────────────────────────────────

  describe('urgency CSS classes', () => {
    it('critical row (≤3s) has --critical class', () => {
      panel.setCountdowns([createStockCountdown({ remainingSeconds: 2.5 })]);

      const row = container.querySelector('.countdown-panel__row') as HTMLElement;
      expect(row.classList.contains('countdown-panel__row--critical')).toBe(true);
    });

    it('warning row (≤10s) has --warning class', () => {
      panel.setCountdowns([createStockCountdown({ remainingSeconds: 7.0 })]);

      const row = container.querySelector('.countdown-panel__row') as HTMLElement;
      expect(row.classList.contains('countdown-panel__row--warning')).toBe(true);
    });

    it('normal row (>10s) has --normal class', () => {
      panel.setCountdowns([createStockCountdown({ remainingSeconds: 15.0 })]);

      const row = container.querySelector('.countdown-panel__row') as HTMLElement;
      expect(row.classList.contains('countdown-panel__row--normal')).toBe(true);
    });

    it('terminal state (remainingSeconds=0) gets --critical class', () => {
      panel.setCountdowns([
        createStockCountdown({ remainingSeconds: 0, direction: 'to-capacity' }),
      ]);

      const row = container.querySelector('.countdown-panel__row') as HTMLElement;
      expect(row.classList.contains('countdown-panel__row--critical')).toBe(true);
    });
  });

  // ── Row click callback (Task 6) ────────────────────────────────────

  describe('row click callback (Task 6)', () => {
    it('clicking a row fires onRowClick with correct stockId', () => {
      const clickedIds: string[] = [];
      panel.onRowClick = (stockId) => clickedIds.push(stockId);

      panel.setCountdowns([createStockCountdown({ stockId: 'stock-42' })]);

      const row = container.querySelector('.countdown-panel__row') as HTMLElement;
      row.click();

      expect(clickedIds).toEqual(['stock-42']);
    });

    it('onRowClick is null by default', () => {
      expect(panel.onRowClick).toBeNull();
    });
  });

  // ── Label fallback ──────────────────────────────────────────────────

  describe('label fallback', () => {
    it('empty label → falls back to stockId prefix', () => {
      panel.setCountdowns([createStockCountdown({ stockId: 'stock-abc-123', label: '' })]);

      const labelEl = container.querySelector('.countdown-panel__row-label');
      expect(labelEl?.textContent).toBe('stock-ab');
    });

    it('label provided → uses custom label', () => {
      panel.setCountdowns([createStockCountdown({ label: 'MyLabel' })]);

      const labelEl = container.querySelector('.countdown-panel__row-label');
      expect(labelEl?.textContent).toBe('MyLabel');
    });
  });

  // ── Dirty-check optimization ────────────────────────────────────────

  describe('dirty-check optimization', () => {
    it('same data twice → no DOM rebuild (rows unchanged)', () => {
      const data = [createStockCountdown({ remainingSeconds: 10.0 })];
      panel.setCountdowns(data);
      const rowsBefore = container.querySelectorAll('.countdown-panel__row').length;

      panel.setCountdowns(data); // same data
      const rowsAfter = container.querySelectorAll('.countdown-panel__row').length;

      expect(rowsBefore).toBe(rowsAfter);
    });

    it('changed remainingSeconds → DOM rebuilds', () => {
      panel.setCountdowns([createStockCountdown({ remainingSeconds: 10.0 })]);
      const timeBefore = container.querySelector('.countdown-panel__row-time')?.textContent;

      panel.setCountdowns([createStockCountdown({ remainingSeconds: 5.0 })]);
      const timeAfter = container.querySelector('.countdown-panel__row-time')?.textContent;

      expect(timeBefore).toBe('10.0');
      expect(timeAfter).toBe('5.0');
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
// Tests: computeStockCountdown pure function (unchanged from Story 6.3)
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

  it('stock with capacity=100, value=30, netRate=5 → direction=to-capacity, remainingSeconds=14', () => {
    const state = createGraphState(
      { 'source-1': { type: 'source' }, 'stock-1': { type: 'stock', value: 30, capacity: 100 } },
      { 'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 5 } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('to-capacity');
    expect(result!.remainingSeconds).toBe(14); // (100 - 30) / 5 = 14
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
    const state = createGraphState({ 'source-1': { type: 'source' } });
    const result = computeStockCountdown(state, 'source-1');
    expect(result).toBeNull();
  });

  it('stockId pointing to sink node → returns null', () => {
    const state = createGraphState({ 'sink-1': { type: 'sink' } });
    const result = computeStockCountdown(state, 'sink-1');
    expect(result).toBeNull();
  });

  it('empty connections → netRate=0, direction=stable, hasConnections=false', () => {
    const state = createGraphState({ 'stock-1': { type: 'stock', value: 0, capacity: 100 } });
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
    const state = createGraphState({
      'stock-1': { type: 'stock', value: 0, capacity: 100, label: 'Water' },
    });
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Water');
  });

  it('P2: stock with zero-rate connection → hasConnections=true', () => {
    const state = createGraphState(
      { 'source-1': { type: 'source' }, 'stock-1': { type: 'stock', value: 50, capacity: 100 } },
      { 'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 0 } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.netRate).toBe(0);
    expect(result!.direction).toBe('stable');
    expect(result!.hasConnections).toBe(true);
  });

  it('P5: negative stock.value with negative netRate → remainingSeconds=0 (clamped to zero)', () => {
    const state = createGraphState(
      { 'stock-1': { type: 'stock', value: -50, capacity: 100 }, 'sink-1': { type: 'sink' } },
      { 'conn-1': { fromId: 'stock-1', toId: 'sink-1', rate: 10 } },
    );
    const result = computeStockCountdown(state, 'stock-1');
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('to-zero');
    expect(result!.remainingSeconds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: computeAllStockCountdowns (Story 7.2 — Task 7.2)
// ---------------------------------------------------------------------------

describe('computeAllStockCountdowns (Story 7.2)', () => {
  it('empty state (0 stocks) → returns []', () => {
    const state = createGraphState();
    const result = computeAllStockCountdowns(state);
    expect(result).toEqual([]);
  });

  it('state with 2 stocks, 1 source, 1 sink → returns 2 countdown objects', () => {
    const state = createGraphState(
      {
        'source-1': { type: 'source' },
        'stock-1': { type: 'stock', value: 30, capacity: 100 },
        'stock-2': { type: 'stock', value: 40, capacity: 100 },
        'sink-1': { type: 'sink' },
      },
      {
        'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 7 },
        'conn-2': { fromId: 'stock-2', toId: 'sink-1', rate: 5 },
      },
    );
    const result = computeAllStockCountdowns(state);
    expect(result.length).toBe(2);
    // Verify each matches computeStockCountdown output
    const cd1 = computeStockCountdown(state, 'stock-1');
    const cd2 = computeStockCountdown(state, 'stock-2');
    expect(result.find((r) => r.stockId === 'stock-1')).toEqual(cd1);
    expect(result.find((r) => r.stockId === 'stock-2')).toEqual(cd2);
  });

  it('state with no stocks (only sources/sinks) → returns []', () => {
    const state = createGraphState({ 'source-1': { type: 'source' }, 'sink-1': { type: 'sink' } });
    const result = computeAllStockCountdowns(state);
    expect(result).toEqual([]);
  });

  it('each returned object matches computeStockCountdown output for that stock', () => {
    const state = createGraphState(
      {
        'source-1': { type: 'source' },
        'stock-1': { type: 'stock', value: 50, capacity: 200 },
      },
      {
        'conn-1': { fromId: 'source-1', toId: 'stock-1', rate: 10 },
      },
    );
    const result = computeAllStockCountdowns(state);
    const expected = computeStockCountdown(state, 'stock-1');
    expect(result.length).toBe(1);
    expect(result[0]).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Tests: sortCountdownsByUrgency (Story 7.2 — Task 7.3)
// ---------------------------------------------------------------------------

describe('sortCountdownsByUrgency (Story 7.2)', () => {
  it('terminal (0s) before active (5s)', () => {
    const data = [
      createStockCountdown({
        stockId: 's1',
        label: 'Active',
        remainingSeconds: 5.0,
        direction: 'to-capacity',
      }),
      createStockCountdown({
        stockId: 's2',
        label: 'Terminal',
        remainingSeconds: 0,
        direction: 'to-capacity',
      }),
    ];
    const sorted = sortCountdownsByUrgency(data);
    expect(sorted[0].label).toBe('Terminal');
    expect(sorted[1].label).toBe('Active');
  });

  it('active (5s) before active (10s)', () => {
    const data = [
      createStockCountdown({
        stockId: 's1',
        label: 'Slow',
        remainingSeconds: 10.0,
        direction: 'to-capacity',
      }),
      createStockCountdown({
        stockId: 's2',
        label: 'Fast',
        remainingSeconds: 5.0,
        direction: 'to-capacity',
      }),
    ];
    const sorted = sortCountdownsByUrgency(data);
    expect(sorted[0].label).toBe('Fast');
    expect(sorted[1].label).toBe('Slow');
  });

  it('active (10s) before stable (null)', () => {
    const data = [
      createStockCountdown({
        stockId: 's1',
        label: 'Stable',
        remainingSeconds: null,
        direction: 'stable',
        netRate: 0,
      }),
      createStockCountdown({
        stockId: 's2',
        label: 'Active',
        remainingSeconds: 10.0,
        direction: 'to-capacity',
      }),
    ];
    const sorted = sortCountdownsByUrgency(data);
    expect(sorted[0].label).toBe('Active');
    expect(sorted[1].label).toBe('Stable');
  });

  it('terminal states alphabetical by label', () => {
    const data = [
      createStockCountdown({
        stockId: 's1',
        label: 'Zeta',
        remainingSeconds: 0,
        direction: 'to-capacity',
      }),
      createStockCountdown({
        stockId: 's2',
        label: 'Alpha',
        remainingSeconds: 0,
        direction: 'to-zero',
      }),
    ];
    const sorted = sortCountdownsByUrgency(data);
    expect(sorted[0].label).toBe('Alpha');
    expect(sorted[1].label).toBe('Zeta');
  });

  it('active states alphabetical by label within same remaining time', () => {
    const data = [
      createStockCountdown({
        stockId: 's1',
        label: 'Zeta',
        remainingSeconds: 5.0,
        direction: 'to-capacity',
      }),
      createStockCountdown({
        stockId: 's2',
        label: 'Alpha',
        remainingSeconds: 5.0,
        direction: 'to-capacity',
      }),
    ];
    const sorted = sortCountdownsByUrgency(data);
    expect(sorted[0].label).toBe('Alpha');
    expect(sorted[1].label).toBe('Zeta');
  });

  it('stable state sorts after active countdowns', () => {
    const data = [
      createStockCountdown({
        stockId: 's1',
        label: 'Stable',
        remainingSeconds: null,
        direction: 'stable',
        netRate: 0,
      }),
      createStockCountdown({
        stockId: 's2',
        label: 'Active',
        remainingSeconds: 10.0,
        direction: 'to-capacity',
      }),
    ];
    const sorted = sortCountdownsByUrgency(data);
    expect(sorted[0].label).toBe('Active');
    expect(sorted[1].label).toBe('Stable');
  });

  it('does not mutate input array', () => {
    const data = [
      createStockCountdown({ stockId: 's1', label: 'Slow', remainingSeconds: 10.0 }),
      createStockCountdown({ stockId: 's2', label: 'Fast', remainingSeconds: 5.0 }),
    ];
    const originalOrder = data.map((d) => d.stockId);
    sortCountdownsByUrgency(data);
    const afterOrder = data.map((d) => d.stockId);
    expect(afterOrder).toEqual(originalOrder);
  });
});

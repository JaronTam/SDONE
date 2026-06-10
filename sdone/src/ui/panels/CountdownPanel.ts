/**
 * CountdownPanel — Right Sidebar Countdown Timer Display (Story 6.3 → 7.2)
 *
 * Displays countdown timers showing how long until ALL stocks reach
 * capacity (if growing) or zero (if shrinking). Sorted by urgency.
 * Shows an empty state placeholder when no stocks exist on the canvas.
 *
 * Public API:
 *   constructor(container: HTMLElement)
 *   setCountdowns(data: StockCountdown[]): void
 *   onRowClick: ((stockId: string) => void) | null
 *   destroy(): void
 *
 * Exported pure functions:
 *   computeStockCountdown(state, stockId) — single stock (unchanged from 6.3)
 *   computeAllStockCountdowns(state) — all stocks
 *   sortCountdownsByUrgency(data) — urgency sorter
 *
 * No EventBus dependency — pure DOM component per architecture DI pattern.
 */

import type { GraphState, StockNode } from '../../state/GraphState.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface StockCountdown {
  /** Stock node id. */
  stockId: string;
  /** Optional display label (falls back to stock id). */
  label: string;
  /** Net rate (inflow - outflow). */
  netRate: number;
  /**
   * Remaining seconds until threshold.
   * - netRate > 0: (capacity - value) / netRate
   * - netRate < 0: value / |netRate|
   * - null if stable (netRate === 0) or infinite capacity with positive rate
   */
  remainingSeconds: number | null;
  /** Direction: 'to-capacity' (netRate > 0), 'to-zero' (netRate < 0), 'stable' (netRate === 0). */
  direction: 'to-capacity' | 'to-zero' | 'stable';
  /** Current accumulated value. */
  currentValue: number;
  /** Maximum capacity (always a finite positive number). */
  capacity: number;
  /** Whether the stock has at least one incoming or outgoing connection. Used for AC4 "--" vs full text. */
  hasConnections: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────

const CRITICAL_THRESHOLD_SECONDS = 3;   // red left border
const WARNING_THRESHOLD_SECONDS = 10;   // amber left border

const EMPTY_STATE_TEXT = '画布上暂无存量模块';
const TERMINAL_TO_CAPACITY_TEXT = '已达上限';
const TERMINAL_TO_ZERO_TEXT = '已归零';
const STABLE_NO_CHANGE_TEXT = '无变化';

// CSS class names
const PANEL_CLASS = 'countdown-panel';
const LIST_CLASS = 'countdown-panel__list';
const ROW_CLASS = 'countdown-panel__row';
const ROW_CRITICAL_CLASS = 'countdown-panel__row--critical';
const ROW_WARNING_CLASS = 'countdown-panel__row--warning';
const ROW_NORMAL_CLASS = 'countdown-panel__row--normal';
const TO_CAPACITY_CLASS = 'countdown-panel__field-value--to-capacity';
const TO_ZERO_CLASS = 'countdown-panel__field-value--to-zero';
const RATE_POSITIVE_CLASS = 'countdown-panel__field-value--rate-positive';
const RATE_NEGATIVE_CLASS = 'countdown-panel__field-value--rate-negative';

// ── Pure Function: computeStockCountdown (unchanged from Story 6.3) ──────

/**
 * Pure function: compute countdown data for a stock from GraphState.
 *
 * Returns null if the module doesn't exist or is not a stock.
 * Defined alongside CountdownPanel for co-located testability.
 */
export function computeStockCountdown(
  state: GraphState,
  stockId: string,
): StockCountdown | null {
  const node = state.nodes[stockId];
  if (!node || node.type !== 'stock') return null;

  let inflow = 0;
  let outflow = 0;
  let connectionCount = 0;

  for (const conn of Object.values(state.connections)) {
    if (conn.isFeedback) continue; // Story 7.1: skip feedback — multiplier, not flow
    if (conn.toId === stockId) { inflow += conn.rate; connectionCount++; }
    if (conn.fromId === stockId) { outflow += conn.rate; connectionCount++; }
  }

  const stock = node as StockNode;
  const netRate = inflow - outflow;

  let direction: StockCountdown['direction'];
  let remainingSeconds: number | null;

  if (netRate > 0) {
    direction = 'to-capacity';
    // capacity is always finite post Infinity fix
    remainingSeconds = (stock.capacity - stock.value) / netRate;
  } else if (netRate < 0) {
    direction = 'to-zero';
    remainingSeconds = Math.max(0, stock.value) / Math.abs(netRate);
  } else {
    direction = 'stable';
    remainingSeconds = null;
  }

  return {
    stockId: stock.id,
    label: stock.label || stock.id.slice(0, 8),
    netRate,
    remainingSeconds,
    direction,
    currentValue: stock.value,
    capacity: stock.capacity,
    hasConnections: connectionCount > 0,
  };
}

// ── Pure Function: computeAllStockCountdowns (Story 7.2) ────────────────

/**
 * Compute countdown data for ALL stocks in the GraphState.
 * Returns array of StockCountdown objects (excludes nulls from non-stock nodes).
 */
export function computeAllStockCountdowns(state: GraphState): StockCountdown[] {
  const results: StockCountdown[] = [];
  for (const node of Object.values(state.nodes)) {
    if (node.type === 'stock') {
      const cd = computeStockCountdown(state, node.id);
      if (cd) results.push(cd);
    }
  }
  return results;
}

// ── Pure Function: sortCountdownsByUrgency (Story 7.2) ──────────────────

/**
 * Sort countdowns by urgency for display.
 *
 * Sort order (composite comparator):
 * 1. Terminal states (remainingSeconds !== null && remainingSeconds <= 0) first
 * 2. Active countdowns (remainingSeconds > 0): shortest remaining first
 * 3. Stable states (remainingSeconds === null && direction === 'stable'): last
 * 4. Within each group: alphabetical by label
 *
 * Returns new array (does not mutate input).
 */
export function sortCountdownsByUrgency(data: StockCountdown[]): StockCountdown[] {
  return [...data].sort((a, b) => {
    const groupA = getUrgencyGroup(a);
    const groupB = getUrgencyGroup(b);

    if (groupA !== groupB) return groupA - groupB;

    // Within same group: sort by display precision (toFixed(1)) for active.
    // Comparing display strings guarantees transitivity — toFixed(1) equality
    // IS transitive (unlike the epsilon tolerance approach it replaces).
    if (groupA === 2 && a.remainingSeconds !== null && b.remainingSeconds !== null) {
      const displayA = a.remainingSeconds.toFixed(1);
      const displayB = b.remainingSeconds.toFixed(1);
      if (displayA !== displayB) return a.remainingSeconds - b.remainingSeconds;
    }

    // Alphabetical by label as tiebreaker
    return a.label.localeCompare(b.label);
  });
}

/** Urgency group: lower = more urgent (shown first). */
function getUrgencyGroup(cd: StockCountdown): number {
  // P6 fix: NaN guard — treat corrupted data as stable (least urgent, safest default)
  if (cd.remainingSeconds !== null && Number.isNaN(cd.remainingSeconds)) return 4;
  // P5 fix: use < 0.05 threshold (display rounding) instead of ≤ 0,
  // so urgency group matches what the user sees in the row.
  if (cd.remainingSeconds !== null && cd.remainingSeconds < 0.05) return 1; // terminal (display shows 已达上限/已归零)
  if (cd.remainingSeconds !== null && cd.remainingSeconds >= 0.05) return 2; // active
  if (cd.remainingSeconds === null && cd.direction === 'stable') return 3; // stable
  // P6 fix: catch-all → stable (group 4) instead of infinite-capacity (group 3).
  // Unknown states should be deprioritized, not inserted mid-list.
  return 4;
}

// ── Main Class ───────────────────────────────────────────────────────────

export class CountdownPanel {
  private readonly _container: HTMLElement;
  private readonly _rootEl: HTMLElement;
  private readonly _emptyEl: HTMLElement;
  private readonly _listEl: HTMLElement;
  private _lastRenderKey: string = '';

  /** Row click callback — wired from main.ts per DI pattern. */
  onRowClick: ((stockId: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this._container = container;

    // ── Root element ──────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = PANEL_CLASS;
    this._rootEl = root;

    // ── Title bar ─────────────────────────────────────────────────
    const title = document.createElement('div');
    title.className = 'countdown-panel__title';
    title.textContent = '倒计时';
    root.appendChild(title);

    // ── Empty state (visible when no stocks on canvas) ───────
    const emptyEl = document.createElement('div');
    emptyEl.className = 'countdown-panel__empty';
    const emptyIcon = document.createElement('span');
    emptyIcon.className = 'countdown-panel__empty-icon';
    emptyIcon.textContent = '⏱️';
    const emptyText = document.createElement('span');
    emptyText.className = 'countdown-panel__empty-text';
    emptyText.textContent = EMPTY_STATE_TEXT;
    emptyEl.appendChild(emptyIcon);
    emptyEl.appendChild(emptyText);
    root.appendChild(emptyEl);
    this._emptyEl = emptyEl;

    // ── List container (scrollable, hidden when empty) ────────
    const listEl = document.createElement('div');
    listEl.className = LIST_CLASS;
    listEl.style.display = 'none';
    root.appendChild(listEl);
    this._listEl = listEl;

    // Append to container
    container.appendChild(root);
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Show countdown data for all stocks. Pass empty array to show empty state.
   * Data must be pre-sorted by urgency (sortCountdownsByUrgency).
   */
  setCountdowns(data: StockCountdown[]): void {
    if (data.length === 0) {
      // Switch to empty state
      this._listEl.style.display = 'none';
      this._emptyEl.style.display = '';
      this._lastRenderKey = '';
      return;
    }

    // Switch to list state
    this._emptyEl.style.display = 'none';
    this._listEl.style.display = '';

    // Dirty-check: skip rebuild if sorted order and display values unchanged
    const renderKey = data
      .map(s =>
        s.stockId + '|' +
        (s.remainingSeconds?.toFixed(1) ?? 'null') + '|' +
        s.direction + '|' +
        (Number.isNaN(s.netRate) ? 'nan' : s.netRate.toFixed(1)) + '|' +
        s.hasConnections,
      )
      .join(';');
    if (renderKey === this._lastRenderKey) return;
    this._lastRenderKey = renderKey;

    // Clear existing rows and rebuild
    this._listEl.innerHTML = '';
    for (const item of data) {
      const row = this._createRow(item);
      this._listEl.appendChild(row);
    }
  }

  // ── Private: Row Factory ───────────────────────────────────────────────

  private _createRow(data: StockCountdown): HTMLElement {
    const row = document.createElement('div');

    // Determine urgency class
    let urgencyClass = ROW_NORMAL_CLASS;
    if (data.remainingSeconds !== null && data.remainingSeconds <= CRITICAL_THRESHOLD_SECONDS) {
      urgencyClass = ROW_CRITICAL_CLASS;
    } else if (data.remainingSeconds !== null && data.remainingSeconds <= WARNING_THRESHOLD_SECONDS) {
      urgencyClass = ROW_WARNING_CLASS;
    }
    // Terminal states (remainingSeconds <= 0) also get critical styling
    if (data.remainingSeconds !== null && data.remainingSeconds <= 0) {
      urgencyClass = ROW_CRITICAL_CLASS;
    }

    row.className = `${ROW_CLASS} ${urgencyClass}`;

    // Stock label
    const labelSpan = document.createElement('span');
    labelSpan.className = 'countdown-panel__row-label';
    labelSpan.textContent = data.label || data.stockId.slice(0, 8);
    row.appendChild(labelSpan);

    // Direction indicator
    const dirSpan = document.createElement('span');
    dirSpan.className = 'countdown-panel__row-direction';
    if (data.direction === 'to-capacity') {
      dirSpan.textContent = '↑ 到达上限:';
      dirSpan.classList.add(TO_CAPACITY_CLASS);
    } else if (data.direction === 'to-zero') {
      dirSpan.textContent = '↓ 归零:';
      dirSpan.classList.add(TO_ZERO_CLASS);
    } else {
      dirSpan.textContent = '—';
      dirSpan.style.color = '#6c7086'; // muted grey
    }
    row.appendChild(dirSpan);

    // Remaining time
    const timeSpan = document.createElement('span');
    timeSpan.className = 'countdown-panel__row-time';
    const unitSpan = document.createElement('span');
    unitSpan.className = 'countdown-panel__row-unit';

    if (data.remainingSeconds !== null && Number.isNaN(data.remainingSeconds)) {
      timeSpan.textContent = '0.0';
      unitSpan.textContent = '秒';
      unitSpan.style.display = '';
    } else if (data.remainingSeconds !== null && data.remainingSeconds < 0.05) {
      // Terminal state
      unitSpan.style.display = 'none';
      if (data.direction === 'to-capacity') {
        timeSpan.textContent = TERMINAL_TO_CAPACITY_TEXT;
        timeSpan.classList.add('countdown-panel__row-time--reached', TO_CAPACITY_CLASS);
      } else if (data.direction === 'to-zero') {
        timeSpan.textContent = TERMINAL_TO_ZERO_TEXT;
        timeSpan.classList.add('countdown-panel__row-time--reached', TO_ZERO_CLASS);
      } else {
        timeSpan.textContent = '0.0';
        unitSpan.textContent = '秒';
        unitSpan.style.display = '';
      }
    } else if (data.remainingSeconds !== null && data.remainingSeconds >= 0.05) {
      timeSpan.textContent = data.remainingSeconds.toFixed(1);
      unitSpan.textContent = '秒';
      unitSpan.style.display = '';
    } else if (data.remainingSeconds === null && data.direction === 'stable') {
      // Stable
      unitSpan.style.display = 'none';
      if (!data.hasConnections) {
        timeSpan.textContent = '—';
      } else {
        timeSpan.textContent = STABLE_NO_CHANGE_TEXT;
      }
      timeSpan.style.color = '#6c7086'; // muted
    } else {
      // Catch-all
      timeSpan.textContent = '0.0';
      unitSpan.textContent = '秒';
      unitSpan.style.display = '';
    }

    row.appendChild(timeSpan);
    row.appendChild(unitSpan);

    // Net rate
    const rateSpan = document.createElement('span');
    rateSpan.className = 'countdown-panel__row-rate';

    const rateText = Number.isNaN(data.netRate) ? '0.0' : data.netRate.toFixed(1);
    if (data.netRate > 0) {
      rateSpan.textContent = `+${rateText}`;
      rateSpan.classList.add(RATE_POSITIVE_CLASS);
    } else if (data.netRate < 0) {
      // Use Unicode minus sign U+2212 instead of hyphen-minus
      rateSpan.textContent = `−${rateText.substring(1)}`;
      rateSpan.classList.add(RATE_NEGATIVE_CLASS);
    } else {
      rateSpan.textContent = rateText;
    }
    row.appendChild(rateSpan);

    // Row click → select stock on canvas
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      this.onRowClick?.(data.stockId);
    });

    return row;
  }

  /**
   * Remove all DOM nodes.
   * Called from main.ts hot-reload dispose.
   */
  destroy(): void {
    if (this._rootEl.parentNode === this._container) {
      this._container.removeChild(this._rootEl);
    }
  }
}
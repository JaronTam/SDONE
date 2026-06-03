/**
 * CountdownPanel — Right Sidebar Countdown Timer Display (Story 6.3)
 *
 * Displays countdown timer showing how long until each stock reaches
 * capacity (if growing) or zero (if shrinking). Shows an empty state
 * placeholder when no stock is selected.
 *
 * Public API:
 *   constructor(container: HTMLElement)
 *   setCountdown(data: StockCountdown | null): void
 *   destroy(): void
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
  /** Maximum capacity (Infinity if uncapped). */
  capacity: number;
  /** Whether the stock has at least one incoming or outgoing connection. Used for AC4 "--" vs full text. */
  hasConnections: boolean;
}

// ── Pure Function ────────────────────────────────────────────────────────

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
    if (conn.toId === stockId) { inflow += conn.rate; connectionCount++; }
    if (conn.fromId === stockId) { outflow += conn.rate; connectionCount++; }
  }

  const stock = node as StockNode;
  const netRate = inflow - outflow;

  let direction: StockCountdown['direction'];
  let remainingSeconds: number | null;

  if (netRate > 0) {
    direction = 'to-capacity';
    // Infinite capacity → no meaningful countdown to infinity
    remainingSeconds = Number.isFinite(stock.capacity)
      ? (stock.capacity - stock.value) / netRate
      : null;
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

// ── Constants ────────────────────────────────────────────────────────────

const PANEL_CLASS = 'countdown-panel';
const TO_CAPACITY_CLASS = 'countdown-panel__field-value--to-capacity';
const TO_ZERO_CLASS = 'countdown-panel__field-value--to-zero';
const REACHED_CLASS = 'countdown-panel__field-value--reached';
const RATE_POSITIVE_CLASS = 'countdown-panel__field-value--rate-positive';
const RATE_NEGATIVE_CLASS = 'countdown-panel__field-value--rate-negative';

// ── Main Class ───────────────────────────────────────────────────────────

export class CountdownPanel {
  private readonly _container: HTMLElement;
  private readonly _rootEl: HTMLElement;
  private readonly _emptyEl: HTMLElement;
  private readonly _dataEl: HTMLElement;
  private readonly _stockLabelEl: HTMLElement;
  private readonly _directionEl: HTMLElement;
  private readonly _timeEl: HTMLElement;
  private readonly _timeUnitEl: HTMLElement;
  private readonly _rateEl: HTMLElement;

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

    // ── Empty state (visible when no stock selected) ─────────
    const emptyEl = document.createElement('div');
    emptyEl.className = 'countdown-panel__empty';
    const emptyIcon = document.createElement('span');
    emptyIcon.className = 'countdown-panel__empty-icon';
    emptyIcon.textContent = '⏱️';
    const emptyText = document.createElement('span');
    emptyText.className = 'countdown-panel__empty-text';
    emptyText.textContent = '选择存量查看倒计时';
    emptyEl.appendChild(emptyIcon);
    emptyEl.appendChild(emptyText);
    root.appendChild(emptyEl);
    this._emptyEl = emptyEl;

    // ── Data display (hidden when no stock selected) ──────────
    const dataEl = document.createElement('div');
    dataEl.className = 'countdown-panel__data';
    dataEl.style.display = 'none';

    // Stock label
    const stockLabelEl = document.createElement('div');
    stockLabelEl.className = 'countdown-panel__stock-label';
    dataEl.appendChild(stockLabelEl);
    this._stockLabelEl = stockLabelEl;

    // Direction field
    const directionField = document.createElement('div');
    directionField.className = 'countdown-panel__field';
    const directionLabel = document.createElement('span');
    directionLabel.className = 'countdown-panel__field-label';
    directionLabel.textContent = '方向';
    const directionValue = document.createElement('span');
    directionValue.className = 'countdown-panel__field-value countdown-panel__field-value--direction';
    directionField.appendChild(directionLabel);
    directionField.appendChild(directionValue);
    dataEl.appendChild(directionField);
    this._directionEl = directionValue;

    // Remaining time field
    const timeField = document.createElement('div');
    timeField.className = 'countdown-panel__field countdown-panel__field--time';
    const timeLabel = document.createElement('span');
    timeLabel.className = 'countdown-panel__field-label';
    timeLabel.textContent = '剩余时间';
    const timeValue = document.createElement('span');
    timeValue.className = 'countdown-panel__field-value countdown-panel__field-value--time';
    const timeUnit = document.createElement('span');
    timeUnit.className = 'countdown-panel__field-unit';
    timeUnit.textContent = '秒';
    timeField.appendChild(timeLabel);
    timeField.appendChild(timeValue);
    timeField.appendChild(timeUnit);
    dataEl.appendChild(timeField);
    this._timeEl = timeValue;
    this._timeUnitEl = timeUnit;

    // Net rate field
    const rateField = document.createElement('div');
    rateField.className = 'countdown-panel__field';
    const rateLabel = document.createElement('span');
    rateLabel.className = 'countdown-panel__field-label';
    rateLabel.textContent = '净速率';
    const rateValue = document.createElement('span');
    rateValue.className = 'countdown-panel__field-value countdown-panel__field-value--rate';
    const rateUnit = document.createElement('span');
    rateUnit.className = 'countdown-panel__field-unit';
    rateUnit.textContent = '/秒';
    rateField.appendChild(rateLabel);
    rateField.appendChild(rateValue);
    rateField.appendChild(rateUnit);
    dataEl.appendChild(rateField);
    this._rateEl = rateValue;

    root.appendChild(dataEl);
    this._dataEl = dataEl;

    // Append to container
    container.appendChild(root);
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Show countdown data. Pass null to show empty state.
   */
  setCountdown(data: StockCountdown | null): void {
    if (data === null) {
      // Switch to empty state
      this._dataEl.style.display = 'none';
      this._emptyEl.style.display = '';
      return;
    }

    // Switch to data state
    this._emptyEl.style.display = 'none';
    this._dataEl.style.display = '';

    // Stock label (fall back to stockId prefix if no label)
    this._stockLabelEl.textContent = data.label || data.stockId.slice(0, 8);

    // ── Direction field ──────────────────────────────────────────────
    // Clear previous direction classes
    this._directionEl.classList.remove(TO_CAPACITY_CLASS, TO_ZERO_CLASS);

    if (data.direction === 'to-capacity') {
      this._directionEl.textContent = '到达上限:';
      this._directionEl.classList.add(TO_CAPACITY_CLASS);
    } else if (data.direction === 'to-zero') {
      this._directionEl.textContent = '归零:';
      this._directionEl.classList.add(TO_ZERO_CLASS);
    } else {
      // stable — clear direction text
      this._directionEl.textContent = '';
    }

    // ── Remaining time field ─────────────────────────────────────────
    // Clear previous time classes
    this._timeEl.classList.remove(REACHED_CLASS, TO_CAPACITY_CLASS, TO_ZERO_CLASS);

    if (data.remainingSeconds !== null && Number.isNaN(data.remainingSeconds)) {
      // NaN guard — display "0.0" as fallback (unit span shows 秒)
      this._timeEl.textContent = '0.0';
      this._timeUnitEl.style.display = '';
    } else if (data.remainingSeconds !== null && data.remainingSeconds >= 0.05) {
      // Active countdown — unit span shows 秒
      const timeText = data.remainingSeconds.toFixed(1);
      this._timeEl.textContent = timeText;
      this._timeUnitEl.style.display = '';
    } else if (data.remainingSeconds !== null && data.remainingSeconds < 0.05) {
      // Terminal state — countdown reached zero; hide unit (not a number)
      this._timeUnitEl.style.display = 'none';
      if (data.direction === 'to-capacity') {
        this._timeEl.textContent = '已达上限';
        this._timeEl.classList.add(REACHED_CLASS, TO_CAPACITY_CLASS);
      } else if (data.direction === 'to-zero') {
        this._timeEl.textContent = '已归零';
        this._timeEl.classList.add(REACHED_CLASS, TO_ZERO_CLASS);
      }
    } else if (data.remainingSeconds === null && data.direction === 'to-capacity' && data.capacity === Infinity) {
      // Infinite capacity with positive rate — no ceiling to count to; hide unit
      this._timeEl.textContent = '∞ — 无限容量';
      this._timeUnitEl.style.display = 'none';
    } else if (data.remainingSeconds === null && data.direction === 'stable') {
      // Stable — AC4: distinguish between no-flow and balanced-flow; hide unit
      this._timeUnitEl.style.display = 'none';
      if (!data.hasConnections) {
        this._timeEl.textContent = '--';
      } else {
        this._timeEl.textContent = '无变化 — 存量保持稳定';
      }
    } else {
      // Catch-all: defensive fallback for unexpected data shapes.
      // Normal paths (computeStockCountdown output) are fully covered by
      // the branches above; this guards against type violations or future
      // extensions that produce new direction/remainingSeconds combinations.
      this._timeEl.textContent = '0.0';
      this._timeUnitEl.style.display = '';
    }

    // ── Net rate field ───────────────────────────────────────────────
    // Clear previous rate color classes
    this._rateEl.classList.remove(RATE_POSITIVE_CLASS, RATE_NEGATIVE_CLASS);

    const rateText = Number.isNaN(data.netRate) ? '0.0' : data.netRate.toFixed(1);
    if (data.netRate > 0) {
      this._rateEl.textContent = `+${rateText}`;
      this._rateEl.classList.add(RATE_POSITIVE_CLASS);
    } else if (data.netRate < 0) {
      // Use Unicode minus sign U+2212 instead of hyphen-minus
      this._rateEl.textContent = `−${rateText.substring(1)}`;
      this._rateEl.classList.add(RATE_NEGATIVE_CLASS);
    } else {
      this._rateEl.textContent = rateText;
    }
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
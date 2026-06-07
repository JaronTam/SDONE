/**
 * AnalyticsPanel — Right Sidebar Stock Analytics (Story 6.2)
 *
 * Displays inflow, outflow, net change, current value, and capacity
 * for the currently selected stock module. Shows an empty state
 * placeholder when no stock is selected.
 *
 * Public API:
 *   constructor(container: HTMLElement)
 *   setStock(data: StockAnalytics | null): void
 *   destroy(): void
 *
 * No EventBus dependency — pure DOM component per architecture DI pattern.
 */

import type { GraphState, StockNode } from '../../state/GraphState.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface StockAnalytics {
  /** Stock node id. */
  stockId: string;
  /** Optional display label (falls back to stock id). */
  label: string;
  /** Sum of all incoming connection rates. */
  inflow: number;
  /** Sum of all outgoing connection rates. */
  outflow: number;
  /** inflow - outflow. */
  netChange: number;
  /** Current accumulated value. */
  currentValue: number;
  /** Maximum capacity (Infinity if uncapped). */
  capacity: number;
}

// ── Pure Function ────────────────────────────────────────────────────────

/**
 * Pure function: compute analytics data for a stock from GraphState.
 *
 * Returns null if the module doesn't exist or is not a stock.
 * Defined alongside AnalyticsPanel for co-located testability.
 */
export function computeStockAnalytics(
  state: GraphState,
  stockId: string,
): StockAnalytics | null {
  const node = state.nodes[stockId];
  if (!node || node.type !== 'stock') return null;

  let inflow = 0;
  let outflow = 0;

  for (const conn of Object.values(state.connections)) {
    if (conn.isFeedback) continue; // Story 7.1: skip feedback — multiplier, not flow
    if (conn.toId === stockId) inflow += conn.rate;
    if (conn.fromId === stockId) outflow += conn.rate;
  }

  const stock = node as StockNode;
  return {
    stockId: stock.id,
    label: stock.label || stock.id.slice(0, 8),
    inflow,
    outflow,
    netChange: inflow - outflow,
    currentValue: stock.value,
    capacity: stock.capacity,
  };
}

// ── Constants ────────────────────────────────────────────────────────────

const PANEL_CLASS = 'analytics-panel';
const POSITIVE_CLASS = 'analytics-panel__field-value--positive';
const NEGATIVE_CLASS = 'analytics-panel__field-value--negative';

// ── Main Class ───────────────────────────────────────────────────────────

export class AnalyticsPanel {
  private readonly _container: HTMLElement;
  private readonly _rootEl: HTMLElement;
  private readonly _emptyEl: HTMLElement;
  private readonly _dataEl: HTMLElement;
  private readonly _stockLabelEl: HTMLElement;
  private readonly _inflowEl: HTMLElement;
  private readonly _outflowEl: HTMLElement;
  private readonly _netEl: HTMLElement;
  private readonly _currentEl: HTMLElement;
  private readonly _capacityEl: HTMLElement;
  // Story 7.3 AC4: Overflow display (cumulative max overflow during session)
  private readonly _overflowField: HTMLElement;
  private readonly _overflowValueEl: HTMLElement;

  constructor(container: HTMLElement) {
    this._container = container;

    // ── Root element ──────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = PANEL_CLASS;
    this._rootEl = root;

    // ── Title bar ─────────────────────────────────────────────────
    const title = document.createElement('div');
    title.className = 'analytics-panel__title';
    title.textContent = '存量分析';
    root.appendChild(title);

    // ── Empty state (visible when no stock selected) ─────────
    const emptyEl = document.createElement('div');
    emptyEl.className = 'analytics-panel__empty';
    const emptyIcon = document.createElement('span');
    emptyIcon.className = 'analytics-panel__empty-icon';
    emptyIcon.textContent = '👆';
    const emptyText = document.createElement('span');
    emptyText.className = 'analytics-panel__empty-text';
    emptyText.textContent = '点击画布上的存量模块查看详情';
    emptyEl.appendChild(emptyIcon);
    emptyEl.appendChild(emptyText);
    root.appendChild(emptyEl);
    this._emptyEl = emptyEl;

    // ── Data display (hidden when no stock selected) ──────────
    const dataEl = document.createElement('div');
    dataEl.className = 'analytics-panel__data';
    dataEl.style.display = 'none';

    // Stock label
    const stockLabelEl = document.createElement('div');
    stockLabelEl.className = 'analytics-panel__stock-label';
    dataEl.appendChild(stockLabelEl);
    this._stockLabelEl = stockLabelEl;

    // Inflow field
    const inflowField = document.createElement('div');
    inflowField.className = 'analytics-panel__field';
    const inflowLabel = document.createElement('span');
    inflowLabel.className = 'analytics-panel__field-label';
    inflowLabel.textContent = '流入';
    const inflowValue = document.createElement('span');
    inflowValue.className = 'analytics-panel__field-value analytics-panel__field-value--inflow';
    const inflowUnit = document.createElement('span');
    inflowUnit.className = 'analytics-panel__field-unit';
    inflowUnit.textContent = '/秒';
    inflowField.appendChild(inflowLabel);
    inflowField.appendChild(inflowValue);
    inflowField.appendChild(inflowUnit);
    dataEl.appendChild(inflowField);
    this._inflowEl = inflowValue;

    // Outflow field
    const outflowField = document.createElement('div');
    outflowField.className = 'analytics-panel__field';
    const outflowLabel = document.createElement('span');
    outflowLabel.className = 'analytics-panel__field-label';
    outflowLabel.textContent = '流出';
    const outflowValue = document.createElement('span');
    outflowValue.className = 'analytics-panel__field-value analytics-panel__field-value--outflow';
    const outflowUnit = document.createElement('span');
    outflowUnit.className = 'analytics-panel__field-unit';
    outflowUnit.textContent = '/秒';
    outflowField.appendChild(outflowLabel);
    outflowField.appendChild(outflowValue);
    outflowField.appendChild(outflowUnit);
    dataEl.appendChild(outflowField);
    this._outflowEl = outflowValue;

    // Net change field
    const netField = document.createElement('div');
    netField.className = 'analytics-panel__field analytics-panel__field--net';
    const netLabel = document.createElement('span');
    netLabel.className = 'analytics-panel__field-label';
    netLabel.textContent = '净变化';
    const netValue = document.createElement('span');
    netValue.className = 'analytics-panel__field-value analytics-panel__field-value--net';
    const netUnit = document.createElement('span');
    netUnit.className = 'analytics-panel__field-unit';
    netUnit.textContent = '/秒';
    netField.appendChild(netLabel);
    netField.appendChild(netValue);
    netField.appendChild(netUnit);
    dataEl.appendChild(netField);
    this._netEl = netValue;

    // Divider
    const divider = document.createElement('div');
    divider.className = 'analytics-panel__divider';
    dataEl.appendChild(divider);

    // Current value field
    const currentField = document.createElement('div');
    currentField.className = 'analytics-panel__field';
    const currentLabel = document.createElement('span');
    currentLabel.className = 'analytics-panel__field-label';
    currentLabel.textContent = '当前值';
    const currentValue = document.createElement('span');
    currentValue.className = 'analytics-panel__field-value analytics-panel__field-value--current';
    currentField.appendChild(currentLabel);
    currentField.appendChild(currentValue);
    dataEl.appendChild(currentField);
    this._currentEl = currentValue;

    // Capacity field
    const capacityField = document.createElement('div');
    capacityField.className = 'analytics-panel__field';
    const capacityLabel = document.createElement('span');
    capacityLabel.className = 'analytics-panel__field-label';
    capacityLabel.textContent = '容量';
    const capacityValue = document.createElement('span');
    capacityValue.className = 'analytics-panel__field-value analytics-panel__field-value--capacity';
    capacityField.appendChild(capacityLabel);
    capacityField.appendChild(capacityValue);
    dataEl.appendChild(capacityField);
    this._capacityEl = capacityValue;

    // ── Story 7.3 AC4: Overflow field (hidden by default) ──────────
    // Uses dedicated classes (.analytics-panel__overflow-label /
    // .analytics-panel__overflow-value) so tests and CSS can target the
    // amber warning treatment without conflicting with generic fields.
    const overflowField = document.createElement('div');
    overflowField.className = 'analytics-panel__field analytics-panel__overflow';
    overflowField.style.display = 'none';
    const overflowLabel = document.createElement('span');
    overflowLabel.className =
      'analytics-panel__field-label analytics-panel__overflow-label';
    overflowLabel.textContent = '流失值:';
    const overflowValue = document.createElement('span');
    overflowValue.className =
      'analytics-panel__field-value analytics-panel__field-value--overflow analytics-panel__overflow-value';
    const overflowUnit = document.createElement('span');
    overflowUnit.className = 'analytics-panel__field-unit';
    overflowUnit.textContent = '单位';
    overflowField.appendChild(overflowLabel);
    overflowField.appendChild(overflowValue);
    overflowField.appendChild(overflowUnit);
    dataEl.appendChild(overflowField);
    this._overflowField = overflowField;
    this._overflowValueEl = overflowValue;

    root.appendChild(dataEl);
    this._dataEl = dataEl;

    // Append to container
    container.appendChild(root);
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Show stock analytics data. Pass null to show empty state.
   *
   * Story 7.3 AC4: Optional `cumulativeOverflow` shows the max-observed
   * overflow (value > capacity) for this stock during the current session.
   * Pass 0 / undefined to hide the overflow section.
   */
  setStock(data: StockAnalytics | null, cumulativeOverflow?: number): void {
    if (data === null) {
      // Switch to empty state
      this._dataEl.style.display = 'none';
      this._emptyEl.style.display = '';
      // Story 7.3: ensure overflow section is hidden when nothing is selected
      this._overflowField.style.display = 'none';
      return;
    }

    // Switch to data state
    this._emptyEl.style.display = 'none';
    this._dataEl.style.display = '';

    // Stock label (fall back to stockId prefix if no label)
    this._stockLabelEl.textContent = data.label || data.stockId.slice(0, 8);

    // Inflow
    this._inflowEl.textContent = Number.isNaN(data.inflow) ? '0.0' : data.inflow.toFixed(1);

    // Outflow
    this._outflowEl.textContent = Number.isNaN(data.outflow) ? '0.0' : data.outflow.toFixed(1);

    // Net change with explicit sign and color coding
    const netText = Number.isNaN(data.netChange) ? '0.0' : data.netChange.toFixed(1);
    if (data.netChange > 0) {
      this._netEl.textContent = `+${netText}`;
      this._netEl.classList.add(POSITIVE_CLASS);
      this._netEl.classList.remove(NEGATIVE_CLASS);
    } else if (data.netChange < 0) {
      // Use Unicode minus sign U+2212 instead of hyphen-minus.
      // Reuse NaN-guarded netText to avoid duplicating formatting logic.
      // netText starts with "-" (hyphen-minus) for negative values — strip and replace.
      this._netEl.textContent = `−${netText.substring(1)}`;
      this._netEl.classList.add(NEGATIVE_CLASS);
      this._netEl.classList.remove(POSITIVE_CLASS);
    } else {
      this._netEl.textContent = netText;
      this._netEl.classList.remove(POSITIVE_CLASS);
      this._netEl.classList.remove(NEGATIVE_CLASS);
    }

    // Current value
    this._currentEl.textContent = Number.isNaN(data.currentValue) ? '0.0' : data.currentValue.toFixed(1);

    // Capacity: Infinity → "∞", finite → integer display
    if (!Number.isFinite(data.capacity)) {
      this._capacityEl.textContent = '∞';
    } else {
      this._capacityEl.textContent = data.capacity.toFixed(0);
    }

    // Story 7.3 AC4: Show overflow only if > 0.
    // Value is displayed without a sign prefix (e.g. "15.5"), with the
    // "单位" unit suffix making it read as "流失值: 15.5 单位".
    if (cumulativeOverflow !== undefined && cumulativeOverflow > 0) {
      this._overflowValueEl.textContent = cumulativeOverflow.toFixed(1);
      this._overflowField.style.display = '';
    } else {
      this._overflowField.style.display = 'none';
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
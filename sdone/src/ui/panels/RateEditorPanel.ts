/**
 * RateEditorPanel — Right Sidebar Rate Editor (Story 4.5)
 *
 * Renders a rate editor panel in the right sidebar. When a connection is
 * selected, displays its current rate in an editable number input field.
 * When no connection is selected, shows an empty state placeholder.
 *
 * Public API:
 *   constructor(container: HTMLElement)
 *   setConnection(info: ConnectionInfo | null): void
 *   setRate(value: number): void
 *   showError(): void
 *   destroy(): void
 *   onRateSubmit: ((rate: number) => void) | null
 *
 * No EventBus dependency — pure DOM component per architecture DI pattern.
 */

import type { ModuleType } from '../../state/GraphState.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface ConnectionInfo {
  id: string;
  fromId: string;
  toId: string;
  rate: number;
  fromType?: ModuleType;
  toType?: ModuleType;
  /** Story 7.1 — true when this is a feedback connection (stock→source). */
  isFeedback?: boolean;
  /** Story 7.1 — formula string for feedback connections. */
  formulaStr?: string;
}

// ── Constants ────────────────────────────────────────────────────────────

const PANEL_CLASS = 'rate-editor';

const TYPE_DISPLAY_NAMES: Record<ModuleType, string> = {
  source: '源',
  stock: '存量',
  sink: '汇',
};

// ── Main Class ───────────────────────────────────────────────────────────

export class RateEditorPanel {
  /** Callback: fires when user presses Enter with a valid numeric rate value. */
  onRateSubmit: ((rate: number) => void) | null = null;

  /** Story 7.1 — Callback: fires when user presses Enter with a formula string. */
  onFormulaSubmit: ((formulaStr: string) => void) | null = null;

  private readonly _container: HTMLElement;
  private readonly _rootEl: HTMLElement;
  private readonly _emptyEl: HTMLElement;
  private readonly _formEl: HTMLElement;
  private readonly _connectionLabel: HTMLElement;
  private readonly _rateInput: HTMLInputElement;
  private _lastValidRate: number = 0;
  private _rateErrorTimeout: ReturnType<typeof setTimeout> | null = null;
  private _formulaErrorTimeout: ReturnType<typeof setTimeout> | null = null;
  private _warningTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly _warningEl: HTMLElement;
  private readonly _warningTextEl: HTMLElement;
  private _boundKeydown: (e: KeyboardEvent) => void;

  // Story 7.1: Formula editing state
  private readonly _formulaFieldEl: HTMLElement;
  private readonly _formulaInput: HTMLInputElement;
  private readonly _rateFieldEl: HTMLElement;
  private _boundFormulaKeydown: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement) {
    this._container = container;

    // ── Root element ──────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = PANEL_CLASS;
    this._rootEl = root;

    // ── Title bar ─────────────────────────────────────────────────
    const title = document.createElement('div');
    title.className = 'rate-editor__title';
    title.textContent = '速率编辑器';
    root.appendChild(title);

    // ── Empty state (visible when no connection selected) ─────────
    const emptyEl = document.createElement('div');
    emptyEl.className = 'rate-editor__empty';
    const emptyIcon = document.createElement('span');
    emptyIcon.className = 'rate-editor__empty-icon';
    emptyIcon.textContent = '🔗';
    const emptyText = document.createElement('span');
    emptyText.className = 'rate-editor__empty-text';
    emptyText.textContent = '点击连线编辑速率';
    emptyEl.appendChild(emptyIcon);
    emptyEl.appendChild(emptyText);
    root.appendChild(emptyEl);
    this._emptyEl = emptyEl;

    // ── Editor form (hidden when no connection selected) ──────────
    const formEl = document.createElement('div');
    formEl.className = 'rate-editor__form';
    formEl.style.display = 'none';

    // Connection direction label
    const connectionLabel = document.createElement('div');
    connectionLabel.className = 'rate-editor__connection-label';
    connectionLabel.textContent = '';
    formEl.appendChild(connectionLabel);
    this._connectionLabel = connectionLabel;

    // Rate input field group
    const field = document.createElement('div');
    field.className = 'rate-editor__field';

    const fieldLabel = document.createElement('label');
    fieldLabel.className = 'rate-editor__field-label';
    fieldLabel.textContent = '速率 (单位/秒)';

    const rateInput = document.createElement('input');
    rateInput.className = 'rate-editor__input';
    rateInput.type = 'number';
    rateInput.step = 'any'; // allow decimal values
    rateInput.placeholder = '输入速率值...';

    field.appendChild(fieldLabel);
    field.appendChild(rateInput);
    formEl.appendChild(field);
    this._rateFieldEl = field;

    // Story 7.1: Formula input field group (hidden for non-feedback connections)
    const formulaField = document.createElement('div');
    formulaField.className = 'rate-editor__field';
    formulaField.style.display = 'none';

    const formulaLabel = document.createElement('label');
    formulaLabel.className = 'rate-editor__field-label';
    formulaLabel.textContent = '公式 (如: -0.5 * stock_value)';

    const formulaInput = document.createElement('input');
    formulaInput.className = 'rate-editor__input';
    formulaInput.type = 'text';
    formulaInput.placeholder = '输入公式...';

    formulaField.appendChild(formulaLabel);
    formulaField.appendChild(formulaInput);
    formEl.appendChild(formulaField);
    this._formulaFieldEl = formulaField;
    this._formulaInput = formulaInput;

    // Warning element (Story 6.4 AC4 — negative rate clamping)
    const warningEl = document.createElement('div');
    warningEl.className = 'rate-editor__warning';
    warningEl.style.display = 'none';
    const warningTextEl = document.createElement('span');
    warningTextEl.className = 'rate-editor__warning-text';
    warningEl.appendChild(warningTextEl);
    formEl.appendChild(warningEl);

    root.appendChild(formEl);

    this._formEl = formEl;
    this._rateInput = rateInput;
    this._warningEl = warningEl;
    this._warningTextEl = warningTextEl;

    // ── Event binding ─────────────────────────────────────────────
    this._boundKeydown = this._handleKeydown.bind(this);
    this._rateInput.addEventListener('keydown', this._boundKeydown);

    // Story 7.1: Formula input keydown binding
    this._boundFormulaKeydown = this._handleFormulaKeydown.bind(this);
    this._formulaInput.addEventListener('keydown', this._boundFormulaKeydown);

    // Append to container
    container.appendChild(root);
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Show/hide editor based on connection selection state.
   * Stores `info.rate` as `_lastValidRate` for error-revert.
   */
  setConnection(info: ConnectionInfo | null): void {
    this._clearErrorTimeout();
    this._clearWarningTimeout();

    if (info === null) {
      // Switch to empty state
      this._formEl.style.display = 'none';
      this._emptyEl.style.display = '';
      this._lastValidRate = 0;
      this._rateInput.value = '';
      return;
    }

    // Switch to editor state
    this._emptyEl.style.display = 'none';
    this._formEl.style.display = '';

    // Build direction label: "源 → 存量" or "存量 → 源 (反馈)"
    const fromLabel = info.fromType ? TYPE_DISPLAY_NAMES[info.fromType] : info.fromId;
    const toLabel = info.toType ? TYPE_DISPLAY_NAMES[info.toType] : info.toId;
    const isFeedback = info.isFeedback === true;

    if (isFeedback) {
      this._connectionLabel.textContent = `${fromLabel} → ${toLabel} (反馈)`;
      // Show formula field, hide rate field for feedback connections
      this._formulaFieldEl.style.display = '';
      this._rateFieldEl.style.display = 'none';
      this._formulaInput.value = info.formulaStr ?? String(info.rate);
    } else {
      this._connectionLabel.textContent = `${fromLabel} → ${toLabel}`;
      // Show rate field, hide formula field for normal connections
      this._rateFieldEl.style.display = '';
      this._formulaFieldEl.style.display = 'none';
    }

    // Populate rate value
    this._lastValidRate = info.rate;
    this._rateInput.value = String(info.rate);
  }

  /**
   * Update the displayed rate value from external source (SNAPSHOT_EMITTED).
   * Skips update if `document.activeElement === this._rateInput`
   * (user is actively typing during simulation).
   * Stores `value` as `_lastValidRate`.
   */
  setRate(value: number): void {
    // Guard: don't propagate NaN from simulation engine
    if (Number.isNaN(value)) return;
    // Guard: don't overwrite input while user is typing
    if (document.activeElement === this._rateInput) return;

    // Dismiss any stale warning — external rate update resets UI state (P3 defensive fix)
    this._clearWarningTimeout();

    this._lastValidRate = value;
    this._rateInput.value = String(value);
  }

  /**
   * Flash error state — red border for 1 second, revert input to `_lastValidRate`.
   */
  showError(): void {
    // Revert input to last valid value
    this._rateInput.value = String(this._lastValidRate);

    // Clear any existing warning/timeout before showing error (P2 fix: prevents amber warning + red border coexistence)
    this._clearWarningTimeout();
    // Clear any existing error timeout (removes stale class)
    this._clearErrorTimeout();

    // Add error class (AFTER clear, so it stays visible)
    this._rateInput.classList.add('rate-editor__input--error');

    // Remove error class after 1 second
    this._rateErrorTimeout = setTimeout(() => {
      this._rateInput.classList.remove('rate-editor__input--error');
      this._rateErrorTimeout = null;
    }, 1000);
  }

  /**
   * Remove all DOM nodes and event listeners.
   * Called from main.ts hot-reload dispose.
   */
  destroy(): void {
    this._clearErrorTimeout();
    this._clearWarningTimeout();
    this._rateInput.removeEventListener('keydown', this._boundKeydown);
    this._formulaInput.removeEventListener('keydown', this._boundFormulaKeydown);
    this.onRateSubmit = null;
    this.onFormulaSubmit = null;
    if (this._rootEl.parentNode === this._container) {
      this._container.removeChild(this._rootEl);
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  /**
   * Handle Enter keypress on the rate input field.
   *
   * Input handling:
   * 1. Read this._rateInput.value.trim()
   * 2. If empty string → showError(), return
   * 3. Parse: const parsed = Number(inputValue)
   * 4. If Number.isNaN(parsed) → showError(), return
   * 5. If parsed === this._lastValidRate → no-op
   * 6. Call onRateSubmit(parsed)
   * 7. Blur input (remove focus)
   */
  private _handleKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;

    e.preventDefault();

    const rawValue = this._rateInput.value.trim();

    // Empty string → invalid
    if (rawValue === '') {
      this.showError();
      return;
    }

    const parsed = Number(rawValue);

    // Non-numeric → invalid
    if (Number.isNaN(parsed)) {
      this.showError();
      return;
    }

    // Infinite → invalid (prevents Infinity/-Infinity from reaching mutation layer)
    if (!Number.isFinite(parsed)) {
      this.showError();
      return;
    }

    // Negative → clamp to 0 with warning (Story 6.4 AC4)
    if (parsed < 0) {
      // Clear any stale error state before showing warning (P2 fix: prevents red border + amber warning coexistence)
      this._clearErrorTimeout();
      if (this.onRateSubmit) {
        this.onRateSubmit(0);
      }
      // Always sync _lastValidRate to clamped value, even if onRateSubmit is null (P3 defensive fix)
      this._lastValidRate = 0;
      this._showWarning('速率不能为负');
      this._rateInput.value = '0';
      this._rateInput.blur();
      return;
    }

    // Unchanged → no-op
    if (parsed === this._lastValidRate) {
      this._rateInput.blur();
      return;
    }

    // Fire callback — dismiss any stale warning first (P2 fix: prevent "速率不能为负" persisting after valid input)
    this._clearWarningTimeout();
    if (this.onRateSubmit) {
      this.onRateSubmit(parsed);
      // Sync _lastValidRate to the submitted value so that re-typing the old
      // rate is not incorrectly treated as "unchanged" (P1 fix).
      this._lastValidRate = parsed;
    }

    // Blur input — UX nicety, also allows next SNAPSHOT_EMITTED.setRate() to take effect
    this._rateInput.blur();
  }

  /**
   * Story 7.1 — Handle Enter keypress on the formula input field.
   * Fires onFormulaSubmit with the trimmed formula string.
   */
  private _handleFormulaKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const rawValue = this._formulaInput.value.trim();

    // Empty string → show error
    if (rawValue === '') {
      this._formulaInput.classList.add('rate-editor__input--error');
      this._formulaErrorTimeout = setTimeout(() => {
        this._formulaInput.classList.remove('rate-editor__input--error');
        this._formulaErrorTimeout = null;
      }, 1000);
      return;
    }

    // Fire formula submit callback
    this._clearWarningTimeout();
    if (this.onFormulaSubmit) {
      this.onFormulaSubmit(rawValue);
    }

    this._formulaInput.blur();
  }

  /**
   * Clear pending error timeout and clean up class.
   */
  private _clearErrorTimeout(): void {
    if (this._rateErrorTimeout !== null) {
      clearTimeout(this._rateErrorTimeout);
      this._rateErrorTimeout = null;
    }
    this._rateInput.classList.remove('rate-editor__input--error');
    if (this._formulaErrorTimeout !== null) {
      clearTimeout(this._formulaErrorTimeout);
      this._formulaErrorTimeout = null;
    }
    this._formulaInput.classList.remove('rate-editor__input--error');
  }

  /**
   * Show an inline warning message that auto-dismisses after 2 seconds.
   * (Story 6.4 AC4)
   */
  private _showWarning(message: string): void {
    this._clearWarningTimeout();
    this._warningTextEl.textContent = message;
    this._warningEl.style.display = ''; // let CSS display:flex take over
    this._warningTimeout = setTimeout(() => {
      this._warningEl.style.display = 'none';
      this._warningTimeout = null;
    }, 2000);
  }

  /**
   * Clear pending warning timeout and hide warning element.
   * (Story 6.4 AC4)
   */
  private _clearWarningTimeout(): void {
    if (this._warningTimeout !== null) {
      clearTimeout(this._warningTimeout);
      this._warningTimeout = null;
    }
    this._warningEl.style.display = 'none';
  }
}

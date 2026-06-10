/**
 * CapacityInputPopover — Stock Capacity Input Popover (Infinity Fix)
 *
 * Displays a floating popover near the placement location when a user
 * creates a stock. The popover contains a number input pre-filled with
 * the default capacity (100). User confirms with Enter or cancels with
 * Esc / click-outside / wheel.
 *
 * Public API:
 *   constructor()
 *   open(screenX, screenY, defaultCapacity): void
 *   close(): void
 *   onConfirm: ((capacity: number) => void) | null
 *   onCancel: (() => void) | null
 *
 * Design reference: ColorPickerPopover.ts (DOM pattern, positioning, dismiss)
 *                   RateEditorPanel.ts (input event pattern)
 *
 * No state dependencies — pure DOM component per architecture DI pattern.
 */

// ── Constants ────────────────────────────────────────────────────────────

const POPOVER_CLASS = 'capacity-input-popover';
const TITLE_CLASS = `${POPOVER_CLASS}__title`;
const INPUT_CLASS = `${POPOVER_CLASS}__input`;
const UNIT_CLASS = `${POPOVER_CLASS}__unit`;
const HINT_CLASS = `${POPOVER_CLASS}__hint`;

const POPOVER_OFFSET_X = 16; // px offset from anchor to avoid overlapping cursor
const POPOVER_OFFSET_Y = -24; // px offset upward

// ── Main Class ───────────────────────────────────────────────────────────

export class CapacityInputPopover {
  /** Callback: fires when user confirms a valid capacity value (Enter). */
  onConfirm: ((capacity: number) => void) | null = null;

  /** Callback: fires when user cancels (Esc, click-outside, wheel). */
  onCancel: (() => void) | null = null;

  private _el: HTMLElement | null = null;
  private _inputEl: HTMLInputElement | null = null;
  private _boundDocClick: ((e: MouseEvent) => void) | null = null;
  private _boundDocKeydown: ((e: KeyboardEvent) => void) | null = null;
  private _boundWheel: (() => void) | null = null;
  private _defaultCapacity: number = 100;

  constructor() {
    // Lightweight — popover is appended to document.body on open()
  }

  /** True if the popover is currently visible. */
  get isOpen(): boolean {
    return this._el !== null;
  }

  /**
   * Show the popover at the given screen position.
   * Closes any previously open popover first.
   */
  open(screenX: number, screenY: number, defaultCapacity: number): void {
    // Close any existing popover
    this.close();

    this._defaultCapacity = defaultCapacity;

    // ── Build popover element ──────────────────────────────────
    const el = document.createElement('div');
    el.className = POPOVER_CLASS;

    // Title
    const title = document.createElement('div');
    title.className = TITLE_CLASS;
    title.textContent = '设置存量容量';
    el.appendChild(title);

    // Input row
    const inputRow = document.createElement('div');
    inputRow.className = `${POPOVER_CLASS}__row`;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.className = INPUT_CLASS;
    input.value = String(defaultCapacity);
    inputRow.appendChild(input);
    this._inputEl = input;

    const unit = document.createElement('span');
    unit.className = UNIT_CLASS;
    unit.textContent = '单位';
    inputRow.appendChild(unit);

    el.appendChild(inputRow);

    // Hint text
    const hint = document.createElement('div');
    hint.className = HINT_CLASS;
    hint.textContent = 'Enter 确认 · Esc 取消';
    el.appendChild(hint);

    // ── Position ───────────────────────────────────────────────
    el.style.left = `${screenX + POPOVER_OFFSET_X}px`;
    el.style.top = `${screenY + POPOVER_OFFSET_Y}px`;

    // ── Append and clamp to viewport ───────────────────────────
    this._el = el;
    document.body.appendChild(el);

    const rect = el.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let left = screenX + POPOVER_OFFSET_X;
    let top = screenY + POPOVER_OFFSET_Y;

    // Clamp right
    if (left + rect.width > viewW - 8) {
      left = screenX - rect.width - POPOVER_OFFSET_X;
    }
    // Clamp left
    if (left < 8) {
      left = 8;
    }
    // Clamp bottom
    if (top + rect.height > viewH - 8) {
      top = viewH - rect.height - 8;
    }
    // Clamp top
    if (top < 8) {
      top = 8;
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;

    // Focus the input after positioning
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });

    // ── Document click-to-dismiss (deferred) ─────────────────
    this._boundDocClick = (e: MouseEvent) => {
      // Ignore if click is inside the popover itself
      if (el.contains(e.target as Node)) return;
      this._onCancel();
    };
    setTimeout(() => {
      if (this._boundDocClick) {
        document.addEventListener('mousedown', this._boundDocClick, true);
      }
    }, 0);

    // ── Keydown handler (Enter/Esc) ──────────────────────────
    this._boundDocKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this._onCancel();
      }
    };
    input.addEventListener('keydown', this._boundDocKeydown);

    // ── Wheel-to-dismiss (touchpad pan / mouse wheel) ─────────
    this._boundWheel = () => this._onCancel();
    document.addEventListener('wheel', this._boundWheel, { passive: true });
  }

  /**
   * Remove the popover from the DOM and clean up listeners.
   * Safe to call even if no popover is currently open.
   */
  close(): void {
    if (this._boundDocClick) {
      document.removeEventListener('mousedown', this._boundDocClick, true);
      this._boundDocClick = null;
    }
    if (this._boundWheel) {
      document.removeEventListener('wheel', this._boundWheel);
      this._boundWheel = null;
    }
    if (this._inputEl && this._boundDocKeydown) {
      this._inputEl.removeEventListener('keydown', this._boundDocKeydown);
      this._boundDocKeydown = null;
    }
    if (this._el) {
      if (this._el.parentNode) {
        this._el.remove();
      }
      this._el = null;
    }
    this._inputEl = null;
  }

  /** Clean up all DOM elements and listeners. Safe to call multiple times. */
  destroy(): void {
    this.close();
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private _onConfirm(): void {
    if (!this._inputEl) return;
    const raw = this._inputEl.value.trim();
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      // Invalid input — flash red and revert
      if (this._inputEl) {
        this._inputEl.value = String(this._defaultCapacity);
        this._inputEl.classList.add(`${INPUT_CLASS}--error`);
        setTimeout(() => {
          if (this._inputEl) {
            this._inputEl.classList.remove(`${INPUT_CLASS}--error`);
          }
        }, 800);
      }
      return;
    }
    const capacity = parsed;
    this.close();
    this.onConfirm?.(capacity);
  }

  private _onCancel(): void {
    this.close();
    this.onCancel?.();
  }
}

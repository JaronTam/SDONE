/**
 * ColorPickerPopover — Module Color Swatch Picker (Story 5.3)
 *
 * Displays a floating popover near a double-clicked source/sink module
 * with 5 swatch colors for the user to choose from. Highlights the
 * currently assigned color. Automatically dismisses on outside click.
 *
 * Public API:
 *   constructor()
 *   open(options: OpenOptions): void
 *   close(): void
 *   onColorPicked: ((moduleId: string, color: string) => void) | null
 *
 * No state dependencies — pure DOM component per architecture DI pattern.
 */

import type { ModuleType } from '../../state/GraphState.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface OpenOptions {
  moduleId: string;
  moduleType: ModuleType;
  currentColor: string;
  /** Screen-space anchor point (usually module center after world→screen). */
  anchorScreenX: number;
  anchorScreenY: number;
  /** 5-colour palette appropriate for the module type. */
  palette: readonly string[];
}

// ── Constants ────────────────────────────────────────────────────────────

const POPOVER_CLASS = 'color-picker-popover';
const TITLE_CLASS = `${POPOVER_CLASS}__title`;
const SWATCHES_CLASS = `${POPOVER_CLASS}__swatches`;
const SWATCH_CLASS = `${POPOVER_CLASS}__swatch`;
const SWATCH_CURRENT_CLASS = `${SWATCH_CLASS}--current`;

const POPOVER_OFFSET_X = 16; // px offset from anchor to avoid overlapping cursor
const POPOVER_OFFSET_Y = -40; // px offset upward

// ── Main Class ───────────────────────────────────────────────────────────

export class ColorPickerPopover {
  /** Callback: fires when user clicks a swatch colour. */
  onColorPicked: ((moduleId: string, color: string) => void) | null = null;

  private _el: HTMLElement | null = null;
  private _boundDocClick: ((e: MouseEvent) => void) | null = null;
  private _boundWheel: ((e: WheelEvent) => void) | null = null;
  private _boundKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _currentModuleId: string | null = null;

  constructor() {
    // Lightweight — no container needed, popover is appended to document.body
  }

  /**
   * Show the popover at the given screen position for the given module.
   * Closes any previously open popover first.
   */
  open(options: OpenOptions): void {
    // Close any existing popover
    this.close();

    const { moduleId, moduleType, currentColor, anchorScreenX, anchorScreenY, palette } = options;

    this._currentModuleId = moduleId;

    // ── Build popover element ──────────────────────────────────
    const el = document.createElement('div');
    el.className = POPOVER_CLASS;

    // Title
    const title = document.createElement('div');
    title.className = TITLE_CLASS;
    const typeLabel = moduleType === 'source' ? '源颜色' : '汇颜色';
    title.textContent = typeLabel;
    el.appendChild(title);

    // Swatch row
    const swatchesRow = document.createElement('div');
    swatchesRow.className = SWATCHES_CLASS;

    for (const color of palette) {
      const swatch = document.createElement('div');
      swatch.className = SWATCH_CLASS;
      swatch.style.backgroundColor = color;
      if (color === currentColor) {
        swatch.classList.add(SWATCH_CURRENT_CLASS);
      }

      // Click handler — use mousedown to prevent canvas from seeing the click
      swatch.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onColorPicked?.(moduleId, color);
        this.close();
      });

      swatchesRow.appendChild(swatch);
    }

    el.appendChild(swatchesRow);

    // ── Position ───────────────────────────────────────────────
    el.style.left = `${anchorScreenX + POPOVER_OFFSET_X}px`;
    el.style.top = `${anchorScreenY + POPOVER_OFFSET_Y}px`;

    // ── Clamp to viewport edges ────────────────────────────────
    // Defer measurement until after append so we can read dimensions
    this._el = el;
    document.body.appendChild(el);

    const rect = el.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let left = anchorScreenX + POPOVER_OFFSET_X;
    let top = anchorScreenY + POPOVER_OFFSET_Y;

    // Clamp right
    if (left + rect.width > viewW - 8) {
      left = anchorScreenX - rect.width - POPOVER_OFFSET_X;
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

    // ── Document click-to-dismiss (deferred to next microtask) ─
    // Use setTimeout to avoid the same mousedown that opened this popover
    // from immediately closing it via the document listener.
    this._boundDocClick = (e: MouseEvent) => {
      // Ignore if click is inside the popover itself
      if (el.contains(e.target as Node)) return;
      this.close();
    };
    setTimeout(() => {
      if (this._boundDocClick) {
        document.addEventListener('mousedown', this._boundDocClick, true);
      }
    }, 0);

    // ── Wheel-to-dismiss (touchpad pan / mouse wheel) ────────────
    // AC7: popover should close on canvas pan. Mouse-drag pan is covered
    // by the mousedown listener above; this handles wheel-driven pan.
    this._boundWheel = () => this.close();
    document.addEventListener('wheel', this._boundWheel, { passive: true });

    // ── Story 8.6: Escape-to-dismiss (capture phase) ──────────────
    // Capture-phase listener ensures Escape dismisses the popover BEFORE
    // InputManager's keyboard handler sees the event (AC15).
    this._boundKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
    document.addEventListener('keydown', this._boundKeyDown, true);
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
    if (this._boundKeyDown) {
      document.removeEventListener('keydown', this._boundKeyDown, true);
      this._boundKeyDown = null;
    }
    if (this._el) {
      // P2-4: parentNode check before DOM removal — defensive pattern
      // consistent with ModalDialog.removeBackdrop()
      if (this._el.parentNode) {
        this._el.remove();
      }
      this._el = null;
    }
    this._currentModuleId = null;
  }

  /** True if the popover is currently visible. */
  get isOpen(): boolean {
    return this._el !== null;
  }

  /** The module ID for which the popover is currently open, or null. */
  get currentModuleId(): string | null {
    return this._currentModuleId;
  }

  /** Clean up all DOM elements and listeners. Safe to call multiple times. */
  destroy(): void {
    this.close();
  }
}
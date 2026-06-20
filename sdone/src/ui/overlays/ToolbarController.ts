/**
 * ToolbarController — Module Toolbar DOM Lifecycle (Story 8.4)
 *
 * Displays a fixed-position toolbar above the selected module showing
 * its name, color dot (Source/Sink), and data text. Supports inline
 * name editing via click-to-edit with Enter/blur commit and Escape revert.
 *
 * Public API:
 *   constructor(options: ToolbarControllerOptions)
 *   show(): void
 *   hide(): void
 *   updatePosition(screenPos: Vec2): void
 *   updateData(data: ToolbarData): void
 *   startEditing(): void
 *   destroy(): void
 *   get isEditing(): boolean
 *
 * Architecture: Callback injection (not EventBus). Only imports Vec2
 * from shared/Vec2. No state/canvas/simulation/event-bus dependencies.
 */

import type { Vec2 } from '../../shared/Vec2.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface ToolbarData {
  moduleId: string;
  moduleType: 'source' | 'stock' | 'sink';
  label: string;
  color?: string;
  dataText: string;
  dataTextColor?: string;
}

export interface ToolbarControllerOptions {
  onNameEditStart: () => void;
  onNameCommit: (label: string) => void;
  onNameEditCancel: () => void;
  onColorDotClick: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────

const TOOLBAR_CLASS = 'toolbar';
const COLOR_DOT_CLASS = `${TOOLBAR_CLASS}__color-dot`;
const NAME_CLASS = `${TOOLBAR_CLASS}__name`;
const DATA_CLASS = `${TOOLBAR_CLASS}__data`;
const NAME_EDITING_CLASS = `${TOOLBAR_CLASS}__name--editing`;

const MAX_NAME_LENGTH = 50;

const TYPE_DEFAULTS: Record<ToolbarData['moduleType'], string> = {
  source: 'Source',
  stock: 'Stock',
  sink: 'Sink',
};

// ── Main Class ───────────────────────────────────────────────────────────

export class ToolbarController {
  private _options: ToolbarControllerOptions | null;
  private _el: HTMLElement | null = null;
  private _isEditing = false;
  private _preEditName = '';
  private _isMounted = false;
  private _currentType: ToolbarData['moduleType'] = 'source';

  // Cached child references for efficient updates
  private _nameEl: HTMLElement | null = null;
  private _colorDotEl: HTMLElement | null = null;
  private _dataEl: HTMLElement | null = null;

  // Bound handlers for cleanup
  private _boundNameClick: ((e: MouseEvent) => void) | null = null;
  private _boundColorDotMouseDown: ((e: MouseEvent) => void) | null = null;
  private _boundInputKeydown: ((e: KeyboardEvent) => void) | null = null;
  private _boundInputBlur: (() => void) | null = null;

  constructor(options: ToolbarControllerOptions) {
    this._options = options;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Create DOM structure and append to document.body. Idempotent. */
  show(): void {
    if (this._isMounted) return;

    // F5 fix: Reset _currentType on each show() to prevent state leakage
    // across show()→hide()→show() cycles
    this._currentType = 'source';

    const root = document.createElement('div');
    root.className = TOOLBAR_CLASS;

    // Color dot (always created; visibility managed by updateData)
    const colorDot = document.createElement('div');
    colorDot.className = COLOR_DOT_CLASS;
    root.appendChild(colorDot);
    this._colorDotEl = colorDot;

    // Name element
    const nameEl = document.createElement('span');
    nameEl.className = NAME_CLASS;
    root.appendChild(nameEl);
    this._nameEl = nameEl;

    // Data text element
    const dataEl = document.createElement('span');
    dataEl.className = DATA_CLASS;
    root.appendChild(dataEl);
    this._dataEl = dataEl;

    // Bind and attach event listeners
    this._bindListeners();

    document.body.appendChild(root);
    this._el = root;
    this._isMounted = true;
  }

  /** Remove DOM element and clean up all event listeners. Idempotent. */
  hide(): void {
    if (!this._isMounted || !this._el) return;

    // F7 fix: If editing, fire onNameEditCancel before exiting edit mode
    // so the caller (InputManager) can reset its isEditingName state
    if (this._isEditing) {
      this._exitEditMode();
      if (this._options) {
        this._options.onNameEditCancel();
      }
    }

    this._unbindListeners();

    // Remove from DOM
    this._el.parentNode?.removeChild(this._el);

    this._el = null;
    this._nameEl = null;
    this._colorDotEl = null;
    this._dataEl = null;
    this._isMounted = false;
  }

  /**
   * Apply screen-space position. CSS transform: translateX(-50%)
   * handles horizontal centering — this only sets left/top.
   */
  updatePosition(screenPos: Vec2): void {
    if (!this._el) return;
    this._el.style.left = `${screenPos.x}px`;
    this._el.style.top = `${screenPos.y}px`;
  }

  /** Re-render toolbar content from ToolbarData. Safe before show(). */
  updateData(data: ToolbarData): void {
    if (!this._isMounted) return;

    this._currentType = data.moduleType;

    // Update pre-edit name when NOT editing (Escape revert safety)
    if (!this._isEditing) {
      this._preEditName = data.label;
    }

    // ── Name ──────────────────────────────────────────────────
    // When editing, do NOT overwrite input.value — preserve user's in-progress edits.
    // _preEditName is also preserved (not updated) when editing, via the guard above.
    if (!this._isEditing && this._nameEl) {
      this._nameEl.textContent = data.label;
    }

    // ── Color Dot ─────────────────────────────────────────────
    if (this._colorDotEl) {
      const HIDDEN_CLASS = `${COLOR_DOT_CLASS}--hidden`;
      if (data.moduleType === 'stock') {
        // F2 fix: Use BEM --hidden modifier class (not inline display:none)
        this._colorDotEl.classList.add(HIDDEN_CLASS);
      } else {
        // F2 fix: Remove --hidden class for Source/Sink
        this._colorDotEl.classList.remove(HIDDEN_CLASS);
        // F8 fix: Clear backgroundColor when no color provided (prevent stale color)
        if (data.color) {
          this._colorDotEl.style.backgroundColor = data.color;
        } else {
          this._colorDotEl.style.backgroundColor = '';
        }
      }
    }

    // ── Data Text ─────────────────────────────────────────────
    if (this._dataEl) {
      this._dataEl.textContent = data.dataText;
      if (data.dataTextColor) {
        this._dataEl.style.color = data.dataTextColor;
      } else {
        this._dataEl.style.color = '';
      }
    }
  }

  /** Programmatically enter name editing mode. Idempotent. */
  startEditing(): void {
    if (!this._isMounted) return;
    if (this._isEditing) return;
    this._enterEditMode();
  }

  /** Full teardown: hide + nullify callback references. */
  destroy(): void {
    this.hide();
    // F4 fix: Direct assignment — field is already declared as `| null`
    this._options = null;
  }

  /** Whether the toolbar is currently in name-edit mode. */
  get isEditing(): boolean {
    return this._isEditing;
  }

  // ── Event Binding ───────────────────────────────────────────────────

  private _bindListeners(): void {
    // Name click → enter edit mode
    this._boundNameClick = (e: MouseEvent) => {
      e.stopPropagation();
      this._enterEditMode();
    };
    this._nameEl!.addEventListener('click', this._boundNameClick);

    // Color dot mousedown → fire callback, prevent canvas interaction
    this._boundColorDotMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._options) {
        this._options.onColorDotClick();
      }
    };
    this._colorDotEl!.addEventListener('mousedown', this._boundColorDotMouseDown);
  }

  private _unbindListeners(): void {
    if (this._boundNameClick && this._nameEl) {
      this._nameEl.removeEventListener('click', this._boundNameClick);
      this._boundNameClick = null;
    }
    if (this._boundColorDotMouseDown && this._colorDotEl) {
      this._colorDotEl.removeEventListener('mousedown', this._boundColorDotMouseDown);
      this._boundColorDotMouseDown = null;
    }
    // Input listeners are cleaned up in _exitEditMode
  }

  // ── Edit Mode ───────────────────────────────────────────────────────

  private _enterEditMode(): void {
    if (this._isEditing) return;
    if (!this._nameEl || !this._el) return;

    this._isEditing = true;

    // Replace name span with input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = NAME_EDITING_CLASS;
    input.value = this._nameEl.textContent ?? '';
    input.maxLength = MAX_NAME_LENGTH;

    // Replace in DOM
    this._nameEl.replaceWith(input);
    this._nameEl = null; // span is removed; re-created on exit

    // Focus + select all
    input.focus();
    input.select();

    // Bind input event handlers
    this._boundInputKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._commitName(input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this._revertName();
      }
    };
    input.addEventListener('keydown', this._boundInputKeydown);

    this._boundInputBlur = () => {
      this._commitName(input.value);
    };
    input.addEventListener('blur', this._boundInputBlur);

    // Notify caller
    if (this._options) {
      this._options.onNameEditStart();
    }
  }

  private _exitEditMode(): void {
    if (!this._isEditing) return;

    // Remove input listeners
    const input = this._el?.querySelector(`.${NAME_EDITING_CLASS}`) as HTMLInputElement | null;
    if (input) {
      if (this._boundInputKeydown) {
        input.removeEventListener('keydown', this._boundInputKeydown);
        this._boundInputKeydown = null;
      }
      if (this._boundInputBlur) {
        input.removeEventListener('blur', this._boundInputBlur);
        this._boundInputBlur = null;
      }
    }

    this._isEditing = false;
  }

  /** Replace input with name span, keeping the displayed text. */
  private _restoreNameSpan(displayText: string): void {
    const input = this._el?.querySelector(`.${NAME_EDITING_CLASS}`) as HTMLInputElement | null;
    if (!input || !this._el) return;

    // Create new name span
    const nameSpan = document.createElement('span');
    nameSpan.className = NAME_CLASS;
    nameSpan.textContent = displayText;

    // Re-bind click handler
    const clickHandler = (e: MouseEvent) => {
      e.stopPropagation();
      this._enterEditMode();
    };
    nameSpan.addEventListener('click', clickHandler);
    this._boundNameClick = clickHandler;

    // Replace input with span
    input.replaceWith(nameSpan);
    this._nameEl = nameSpan;
  }

  // ── Name Commit / Revert ────────────────────────────────────────────

  private _commitName(rawValue: string): void {
    if (!this._isEditing) return;

    let trimmed = rawValue.trim();

    // Truncate to max length
    if (trimmed.length > MAX_NAME_LENGTH) {
      trimmed = trimmed.slice(0, MAX_NAME_LENGTH);
    }

    // Fallback to type default if blank
    if (trimmed.length === 0) {
      trimmed = TYPE_DEFAULTS[this._currentType];
    }

    // Update pre-edit name for next edit cycle
    this._preEditName = trimmed;

    // Clean up input + listeners
    this._exitEditMode();

    // Restore name span with committed value
    this._restoreNameSpan(trimmed);

    // Notify caller
    if (this._options) {
      this._options.onNameCommit(trimmed);
    }
  }

  private _revertName(): void {
    if (!this._isEditing) return;

    // Clean up input + listeners
    this._exitEditMode();

    // Restore name span with pre-edit value
    this._restoreNameSpan(this._preEditName);

    // Notify caller
    if (this._options) {
      this._options.onNameEditCancel();
    }
  }
}

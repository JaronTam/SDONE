/**
 * ModalDialog — Confirmation Modal Overlay (Story 6.1)
 *
 * Pure DOM component following the same pattern as AchievementToast:
 *   constructor → public methods → destroy. Appends to document.body.
 *
 * Public API:
 *   open(config: ModalConfig): void
 *   close(): void
 *   get isOpen(): boolean
 *   destroy(): void
 *
 * No EventBus dependency — pure DOM component per architecture DI pattern.
 */

// ── Configuration Interface ───────────────────────────────────────────

export interface ModalConfig {
  title: string;
  body: string;
  confirmText: string;
  cancelText: string;
  /** Called when user confirms. */
  onConfirm: () => void;
  /** Called when user cancels or dismisses. */
  onCancel: () => void;
}

// ── Main Class ────────────────────────────────────────────────────────

export class ModalDialog {
  /** Current modal configuration (null when no modal is open). */
  private currentConfig: ModalConfig | null = null;

  /** Backdrop element (null when no modal is open). */
  private backdropEl: HTMLDivElement | null = null;

  /** Bound capture-phase keydown handler for Escape and keyboard suppression. */
  private readonly boundCaptureKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    this.boundCaptureKeyDown = this.handleCaptureKeyDown.bind(this);
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Show a modal dialog. Returns immediately; callbacks fire on user action.
   *
   * If a modal is already open, the old modal's `onCancel` is called first,
   * then the new modal replaces it.
   */
  open(config: ModalConfig): void {
    // If a modal is already open, dismiss it first (calling old onCancel)
    if (this.backdropEl) {
      this.currentConfig?.onCancel();
      this.removeBackdrop();
    }

    this.currentConfig = config;

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    // Title
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = config.title;

    // Body
    const body = document.createElement('p');
    body.className = 'modal-body';
    body.textContent = config.body;

    // Actions
    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn-cancel';
    cancelBtn.textContent = config.cancelText;
    cancelBtn.addEventListener('click', () => {
      try {
        config.onCancel();
      } finally {
        this.close();
      }
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'modal-btn-confirm modal-btn-danger';
    confirmBtn.textContent = config.confirmText;
    confirmBtn.addEventListener('click', () => {
      try {
        config.onConfirm();
      } finally {
        this.close();
      }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);

    // Backdrop click → cancel
    backdrop.addEventListener('click', (e: MouseEvent) => {
      // Only close if the backdrop itself was clicked (not the dialog)
      if (e.target === backdrop) {
        try {
          config.onCancel();
        } finally {
          this.close();
        }
      }
    });

    document.body.appendChild(backdrop);
    this.backdropEl = backdrop;

    // Register capture-phase keydown listener for Escape and keyboard suppression
    window.addEventListener('keydown', this.boundCaptureKeyDown, true);
  }

  /**
   * Programmatically close the modal (e.g., on hot-reload cleanup).
   * Does NOT call onCancel — use this for cleanup only.
   */
  close(): void {
    this.removeBackdrop();
    window.removeEventListener('keydown', this.boundCaptureKeyDown, true);
    this.currentConfig = null;
  }

  /**
   * Whether a modal is currently visible.
   */
  get isOpen(): boolean {
    return this.backdropEl !== null;
  }

  /**
   * Clean up all DOM elements and event listeners.
   */
  destroy(): void {
    if (this.backdropEl) {
      this.removeBackdrop();
    }
    window.removeEventListener('keydown', this.boundCaptureKeyDown, true);
    this.currentConfig = null;
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  /**
   * Remove the backdrop element from the DOM.
   */
  private removeBackdrop(): void {
    if (this.backdropEl && document.body.contains(this.backdropEl)) {
      document.body.removeChild(this.backdropEl);
    }
    this.backdropEl = null;
  }

  /**
   * Capture-phase keydown handler.
   *
   * CRITICAL: Registered on `window` with `capture: true` so it fires
   * BEFORE bubble-phase listeners (InputManager.handleKeyDown, handleResetShortcut).
   *
   * - Escape → calls onCancel then closes
   * - Space/Enter/Delete/Tab → calls stopPropagation() to prevent
   *   bubble-phase handlers from firing while modal is open
   *
   * Uses stopPropagation() (not stopImmediatePropagation) because:
   * - In capture phase, stopPropagation() prevents the event from
   *   reaching the bubble phase entirely
   * - No other capture-phase listeners exist on window, so
   *   stopImmediatePropagation is unnecessary
   */
  private handleCaptureKeyDown(e: KeyboardEvent): void {
    if (!this.isOpen) return;

    // Escape → cancel and close
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      try {
        this.currentConfig?.onCancel();
      } finally {
        this.close();
      }
      return;
    }

    // Suppress action keys that would trigger bubble-phase handlers.
    // Space/Enter/Tab/KeyP: stopPropagation only — preventDefault would break
    // keyboard a11y (Enter activates focused button, Tab navigates between
    // modal buttons, Space could scroll but backdrop prevents visual impact).
    // KeyP (Story 6.7 patch): panel pin toggle — suppressed to prevent UI
    // state changes behind the modal that would surprise the user on dismiss.
    const suppressKeys = ['Space', 'Enter', 'Tab', 'KeyP'];
    if (suppressKeys.includes(e.code)) {
      e.stopPropagation();
      return;
    }

    // Delete: prevent browser back-navigation + stop bubble handlers
    if (e.code === 'Delete') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Suppress Ctrl+Z / Shift+Ctrl+Z (undo/redo) while modal is open.
    // preventDefault stops browser undo in any focused input behind the modal.
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }
}
/**
 * Story 5.5 — Achievement Toast DOM Component
 *
 * Pure DOM component following the same pattern as ColorPickerPopover:
 * constructor → public methods → destroy. Appends to document.body.
 *
 * AC4: Toasts stack vertically (newest at top), each auto-dismisses independently.
 * AC5: Toasts slide out after 3 seconds and are removed from DOM.
 */

/** Per-toast tracking data (internal). */
interface ToastEntry {
  id: string;
  el: HTMLDivElement;
  timerId: ReturnType<typeof setTimeout>;
  dismissed: boolean; // guard against duplicate dismiss() calls
}

export class AchievementToast {
  private activeToasts: ToastEntry[] = [];
  private nextId = 0;
  private static readonly TOAST_HEIGHT = 48; // approximate px (padding + line-height)
  private static readonly TOAST_GAP = 8; // px between stacked toasts
  private static readonly AUTO_DISMISS_MS = 3000;

  /** Show a toast. Returns an ID that can be used to track/dismiss. */
  show(message: string): string {
    const id = String(this.nextId++);

    const el = document.createElement('div');
    el.className = 'achievement-toast achievement-toast--entering';
    el.textContent = message;
    el.dataset.toastId = id;

    document.body.appendChild(el);

    // Two-phase animation (audit correction #3):
    // 1. Element starts with --entering class (translateX(120%))
    // 2. On next animation frame, remove --entering → browser transitions to translateX(0)
    requestAnimationFrame(() => {
      el.classList.remove('achievement-toast--entering');
    });

    const timerId = setTimeout(() => this.dismiss(id), AchievementToast.AUTO_DISMISS_MS);

    const entry: ToastEntry = { id, el, timerId, dismissed: false };
    // Insert at beginning (newest at top)
    this.activeToasts.unshift(entry);
    this.repositionToasts();

    return id;
  }

  /** Dismiss a specific toast by ID. */
  dismiss(toastId: string): void {
    const idx = this.activeToasts.findIndex((t) => t.id === toastId);
    if (idx === -1) return;

    const entry = this.activeToasts[idx];
    // Guard against duplicate calls (auto-dismiss + manual dismiss race)
    if (entry.dismissed) return;
    entry.dismissed = true;
    clearTimeout(entry.timerId);

    // Slide-out animation: add --exiting class, remove on transitionend
    entry.el.classList.add('achievement-toast--exiting');
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'transform') return; // only remove after slide-out completes
      entry.el.removeEventListener('transitionend', onTransitionEnd);
      entry.el.remove();
      clearTimeout(safetyTimerId);
      const currentIdx = this.activeToasts.findIndex((t) => t.id === toastId);
      if (currentIdx !== -1) {
        this.activeToasts.splice(currentIdx, 1);
        this.repositionToasts();
      }
    };
    entry.el.addEventListener('transitionend', onTransitionEnd);

    // Safety fallback: if transitionend never fires, remove after 400ms
    const safetyTimerId = setTimeout(() => {
      entry.el.removeEventListener('transitionend', onTransitionEnd);
      if (document.body.contains(entry.el)) {
        entry.el.remove();
        const currentIdx = this.activeToasts.findIndex((t) => t.id === toastId);
        if (currentIdx !== -1) {
          this.activeToasts.splice(currentIdx, 1);
          this.repositionToasts();
        }
      }
    }, 400);
  }

  /** Dismiss all active toasts (called on RESET). */
  dismissAll(): void {
    for (const entry of this.activeToasts) {
      clearTimeout(entry.timerId);
      // P2-4: parentNode check before DOM removal — defensive pattern
      // consistent with ModalDialog.removeBackdrop()
      if (entry.el.parentNode) {
        entry.el.remove();
      }
    }
    this.activeToasts = [];
  }

  /** Clean up all DOM elements and timers. */
  destroy(): void {
    this.dismissAll();
  }

  /** Recompute top positions for all active toasts (stacking). */
  private repositionToasts(): void {
    for (let i = 0; i < this.activeToasts.length; i++) {
      const entry = this.activeToasts[i];
      const topPx = 16 + i * (AchievementToast.TOAST_HEIGHT + AchievementToast.TOAST_GAP);
      entry.el.style.top = `${topPx}px`;
    }
  }
}

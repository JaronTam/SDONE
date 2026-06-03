/**
 * ControlBar — Top Control Bar Panel (Story 6.1)
 *
 * Fixed top bar with Run/Pause/Reset buttons and status indicator.
 * Follows the same class pattern as ModulePanel:
 *   constructor → public methods → destroy
 *
 * Public API:
 *   constructor(container: HTMLElement)
 *   setRunState(state: 'idle' | 'running' | 'paused'): void
 *   getStatusText(): string
 *   onRunPause: (() => void) | null
 *   onReset: (() => void) | null
 *   destroy(): void
 *
 * No EventBus dependency — pure DOM component per architecture DI pattern.
 */

// ── Status indicator CSS classes ──────────────────────────────────────

const STATUS_CLASS = 'control-bar-status';
const STATUS_RUNNING_CLASS = 'control-bar-status--running';
const STATUS_PAUSED_CLASS = 'control-bar-status--paused';

// ── Main Class ────────────────────────────────────────────────────────

export class ControlBar {
  private readonly btnRun: HTMLButtonElement;
  private readonly btnResetSim: HTMLButtonElement;
  private readonly statusEl: HTMLSpanElement;
  private _destroyed = false;

  /** Callback for Run/Pause button click. */
  onRunPause: (() => void) | null = null;

  /** Callback for Reset button click. */
  onReset: (() => void) | null = null;

  /** Bound click handlers for cleanup. */
  private readonly boundRunClick: () => void;
  private readonly boundResetClick: () => void;

  constructor(container: HTMLElement) {
    // Query existing DOM elements from index.html
    const btnRun = container.querySelector('.btn-run') as HTMLButtonElement | null;
    if (!btnRun) {
      throw new Error('SDONE: Required element .btn-run not found in control bar container.');
    }
    this.btnRun = btnRun;

    const btnResetSim = container.querySelector('.btn-reset-sim') as HTMLButtonElement | null;
    if (!btnResetSim) {
      throw new Error('SDONE: Required element .btn-reset-sim not found in control bar container.');
    }
    this.btnResetSim = btnResetSim;

    // Create status indicator element programmatically (not in index.html)
    const statusEl = document.createElement('span');
    statusEl.className = STATUS_CLASS;
    statusEl.textContent = 'IDLE';
    // Insert after .btn-run, before .btn-reset-sim
    btnRun.insertAdjacentElement('afterend', statusEl);
    this.statusEl = statusEl;

    // Wire click handlers
    this.boundRunClick = () => {
      this.onRunPause?.();
    };
    this.boundResetClick = () => {
      this.onReset?.();
    };

    btnRun.addEventListener('click', this.boundRunClick);
    btnResetSim.addEventListener('click', this.boundResetClick);
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Update the run button text and status indicator based on simulation state.
   *
   * - idle/paused → button shows "▶ Run"
   * - running → button shows "⏸ Pause"
   * - Status indicator shows "IDLE" / "RUNNING" / "PAUSED"
   */
  setRunState(state: 'idle' | 'running' | 'paused'): void {
    if (this._destroyed) return;
    // Update button text
    this.btnRun.textContent = state === 'running' ? '⏸ Pause' : '▶ Run';

    // Update status indicator text and CSS class
    this.statusEl.textContent = state === 'idle' ? 'IDLE' : state === 'running' ? 'RUNNING' : 'PAUSED';

    // Remove all state classes first, then add the appropriate one
    this.statusEl.classList.remove(STATUS_RUNNING_CLASS, STATUS_PAUSED_CLASS);
    if (state === 'running') {
      this.statusEl.classList.add(STATUS_RUNNING_CLASS);
    } else if (state === 'paused') {
      this.statusEl.classList.add(STATUS_PAUSED_CLASS);
    }
  }

  /**
   * Get the current status indicator text.
   */
  getStatusText(): string {
    if (this._destroyed) return '';
    return this.statusEl.textContent ?? '';
  }

  /**
   * Remove event listeners and the programmatically-created status element.
   * Called from main.ts hot-reload dispose.
   */
  destroy(): void {
    this._destroyed = true;
    this.btnRun.removeEventListener('click', this.boundRunClick);
    this.btnResetSim.removeEventListener('click', this.boundResetClick);

    // Remove the status indicator element we created
    if (this.statusEl.parentNode) {
      this.statusEl.parentNode.removeChild(this.statusEl);
    }
  }
}
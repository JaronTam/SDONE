import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ControlBar } from './ControlBar.js';

// ---------------------------------------------------------------------------
// Helper: create a container matching the index.html control bar structure
// ---------------------------------------------------------------------------

function createControlBarContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'layer-control-bar';

  const btnRun = document.createElement('button');
  btnRun.className = 'btn-run';
  btnRun.textContent = '▶ Run';

  const btnResetSim = document.createElement('button');
  btnResetSim.className = 'btn-reset-sim';
  btnResetSim.textContent = '↺ Reset';

  const btnResetViewport = document.createElement('button');
  btnResetViewport.className = 'btn-reset-viewport';
  btnResetViewport.textContent = '↺ Fit All';

  container.appendChild(btnRun);
  container.appendChild(btnResetSim);
  container.appendChild(btnResetViewport);

  document.body.appendChild(container);
  return container;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ControlBar (Story 6.1)', () => {
  let container: HTMLElement;
  let controlBar: ControlBar;

  beforeEach(() => {
    container = createControlBarContainer();
    controlBar = new ControlBar(container);
  });

  afterEach(() => {
    controlBar.destroy();
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  });

  // ── Constructor ──────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates a status indicator element between btn-run and btn-reset-sim', () => {
      const btnRun = container.querySelector('.btn-run');
      const btnResetSim = container.querySelector('.btn-reset-sim');
      const statusEl = container.querySelector('.control-bar-status');
      expect(statusEl).not.toBeNull();
      expect(statusEl?.textContent).toBe('IDLE');
      // Verify positional ordering: statusEl is inserted after btnRun,
      // before btnResetSim via insertAdjacentElement('afterend', ...)
      expect(statusEl?.previousElementSibling).toBe(btnRun);
      expect(statusEl?.nextElementSibling).toBe(btnResetSim);
    });

    it('throws if .btn-run is missing', () => {
      const div = document.createElement('div');
      div.innerHTML = '<button class="btn-reset-sim">↺ Reset</button>';
      expect(() => new ControlBar(div)).toThrow('Required element .btn-run not found');
    });

    it('throws if .btn-reset-sim is missing', () => {
      const div = document.createElement('div');
      div.innerHTML = '<button class="btn-run">▶ Run</button>';
      expect(() => new ControlBar(div)).toThrow('Required element .btn-reset-sim not found');
    });
  });

  // ── setRunState ──────────────────────────────────────────────────────

  describe('setRunState', () => {
    it('idle → button text is "▶ Run", status shows "IDLE"', () => {
      controlBar.setRunState('idle');
      const btnRun = container.querySelector('.btn-run') as HTMLButtonElement;
      expect(btnRun.textContent).toBe('▶ Run');
      expect(controlBar.getStatusText()).toBe('IDLE');
    });

    it('running → button text is "⏸ Pause", status shows "RUNNING"', () => {
      controlBar.setRunState('running');
      const btnRun = container.querySelector('.btn-run') as HTMLButtonElement;
      expect(btnRun.textContent).toBe('⏸ Pause');
      expect(controlBar.getStatusText()).toBe('RUNNING');
    });

    it('paused → button text is "▶ Run", status shows "PAUSED"', () => {
      controlBar.setRunState('paused');
      const btnRun = container.querySelector('.btn-run') as HTMLButtonElement;
      expect(btnRun.textContent).toBe('▶ Run');
      expect(controlBar.getStatusText()).toBe('PAUSED');
    });

    it('running state adds --running CSS class to status indicator', () => {
      controlBar.setRunState('running');
      const statusEl = container.querySelector('.control-bar-status');
      expect(statusEl?.classList.contains('control-bar-status--running')).toBe(true);
      expect(statusEl?.classList.contains('control-bar-status--paused')).toBe(false);
    });

    it('paused state adds --paused CSS class to status indicator', () => {
      controlBar.setRunState('paused');
      const statusEl = container.querySelector('.control-bar-status');
      expect(statusEl?.classList.contains('control-bar-status--paused')).toBe(true);
      expect(statusEl?.classList.contains('control-bar-status--running')).toBe(false);
    });

    it('idle state removes both --running and --paused CSS classes', () => {
      controlBar.setRunState('running');
      controlBar.setRunState('idle');
      const statusEl = container.querySelector('.control-bar-status');
      expect(statusEl?.classList.contains('control-bar-status--running')).toBe(false);
      expect(statusEl?.classList.contains('control-bar-status--paused')).toBe(false);
    });
  });

  // ── Callbacks ────────────────────────────────────────────────────────

  describe('callbacks', () => {
    it('click on run button → onRunPause callback fires', () => {
      const handler = vi.fn();
      controlBar.onRunPause = handler;

      const btnRun = container.querySelector('.btn-run') as HTMLButtonElement;
      btnRun.click();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('click on reset button → onReset callback fires', () => {
      const handler = vi.fn();
      controlBar.onReset = handler;

      const btnResetSim = container.querySelector('.btn-reset-sim') as HTMLButtonElement;
      btnResetSim.click();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('callbacks are null by default — clicking does not throw', () => {
      const btnRun = container.querySelector('.btn-run') as HTMLButtonElement;
      const btnResetSim = container.querySelector('.btn-reset-sim') as HTMLButtonElement;

      expect(() => btnRun.click()).not.toThrow();
      expect(() => btnResetSim.click()).not.toThrow();
    });
  });

  // ── destroy ──────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('removes event listeners — clicking after destroy does not fire callback', () => {
      const handler = vi.fn();
      controlBar.onRunPause = handler;

      controlBar.destroy();

      const btnRun = container.querySelector('.btn-run') as HTMLButtonElement;
      btnRun.click();

      expect(handler).not.toHaveBeenCalled();
    });

    it('removes the status indicator element from DOM', () => {
      expect(container.querySelector('.control-bar-status')).not.toBeNull();

      controlBar.destroy();

      expect(container.querySelector('.control-bar-status')).toBeNull();
    });
  });
});
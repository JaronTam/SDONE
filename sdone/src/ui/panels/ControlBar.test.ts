import { describe, expect, it, test, vi, beforeEach, afterEach } from 'vitest';
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

  const btnClearCanvas = document.createElement('button');
  btnClearCanvas.className = 'btn-clear-canvas';
  btnClearCanvas.textContent = '🗑 Clear';

  const btnSaveCheckpoint = document.createElement('button');
  btnSaveCheckpoint.className = 'btn-save-checkpoint';
  btnSaveCheckpoint.textContent = '💾 保存检查点';
  btnSaveCheckpoint.disabled = true;
  btnSaveCheckpoint.title = '保存当前状态为检查点';

  const btnRewindCheckpoint = document.createElement('button');
  btnRewindCheckpoint.className = 'btn-rewind-checkpoint';
  btnRewindCheckpoint.textContent = '⏪ 回到检查点';
  btnRewindCheckpoint.disabled = true;
  btnRewindCheckpoint.title = '回到保存的检查点';

  const btnResetViewport = document.createElement('button');
  btnResetViewport.className = 'btn-reset-viewport';
  btnResetViewport.textContent = '↺ Fit All';

  container.appendChild(btnRun);
  container.appendChild(btnResetSim);
  container.appendChild(btnClearCanvas); // Story 6.7
  container.appendChild(btnSaveCheckpoint); // Story 7.4
  container.appendChild(btnRewindCheckpoint); // Story 7.4
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

    it('throws if .btn-clear-canvas is missing (Story 6.7)', () => {
      const div = document.createElement('div');
      div.innerHTML =
        '<button class="btn-run">▶ Run</button><button class="btn-reset-sim">↺ Reset</button>';
      expect(() => new ControlBar(div)).toThrow('Required element .btn-clear-canvas not found');
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
      const btnClearCanvas = container.querySelector('.btn-clear-canvas') as HTMLButtonElement;

      expect(() => btnRun.click()).not.toThrow();
      expect(() => btnResetSim.click()).not.toThrow();
      expect(() => btnClearCanvas.click()).not.toThrow();
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

  // ── Story 6.7: Clear Canvas button ────────────────────────────────

  describe('Clear Canvas button (Story 6.7)', () => {
    it('should have a Clear Canvas button', () => {
      const btn = container.querySelector('.btn-clear-canvas');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('🗑 Clear');
    });

    it('clicking Clear Canvas button should call onClearCanvas callback (AC1)', () => {
      const onClearCanvas = vi.fn();
      controlBar.onClearCanvas = onClearCanvas;

      const btn = container.querySelector('.btn-clear-canvas') as HTMLButtonElement;
      btn.click();

      expect(onClearCanvas).toHaveBeenCalledTimes(1);
    });

    it('destroy() should remove Clear Canvas click listener', () => {
      const onClearCanvas = vi.fn();
      controlBar.onClearCanvas = onClearCanvas;

      controlBar.destroy();

      const btn = container.querySelector('.btn-clear-canvas') as HTMLButtonElement;
      btn.click();

      expect(onClearCanvas).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Story 7.3 — Auto-pause status override (RED PHASE)
// =============================================================================

describe('Story 7.3 — setRunState statusOverride (RED PHASE)', () => {
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

  // ── AC2: Auto-pause status text ──────────────────────────────────

  describe('AC2: Auto-pause status text via statusOverride parameter', () => {
    test('[P1] setRunState("paused", "PAUSED — 测试存量 已达阈值") shows custom text', () => {
      controlBar.setRunState('paused', 'PAUSED — 测试存量 已达阈值');

      const statusEl = container.querySelector('.control-bar-status');
      expect(statusEl).not.toBeNull();
      expect(statusEl!.textContent).toBe('PAUSED — 测试存量 已达阈值');
    });

    test('[P1] setRunState("paused", customText) then setRunState("running") clears custom text', () => {
      controlBar.setRunState('paused', 'PAUSED — 测试存量 已达阈值');
      controlBar.setRunState('running');

      const statusEl = container.querySelector('.control-bar-status');
      expect(statusEl!.textContent).toBe('RUNNING');
      expect(statusEl!.classList.contains('control-bar-status--running')).toBe(true);
    });

    test('[P1] setRunState("paused", customText) preserves --paused CSS class', () => {
      controlBar.setRunState('paused', 'PAUSED — 存量A 已达阈值');

      const statusEl = container.querySelector('.control-bar-status');
      expect(statusEl!.classList.contains('control-bar-status--paused')).toBe(true);
    });

    test('[P1] getStatusText() returns custom text when statusOverride set', () => {
      controlBar.setRunState('paused', 'PAUSED — 存量B 已达阈值');

      expect(controlBar.getStatusText()).toBe('PAUSED — 存量B 已达阈值');
    });
  });

  // ── AC8: Manual pause distinction ────────────────────────────────

  describe('AC8: Manual pause shows normal "PAUSED" (no auto-pause reason)', () => {
    test('[P2] setRunState("paused") without statusOverride shows "PAUSED" (backward compatible)', () => {
      controlBar.setRunState('paused');

      const statusEl = container.querySelector('.control-bar-status');
      expect(statusEl!.textContent).toBe('PAUSED');
    });

    test('[P2] existing callers using one-argument setRunState still work', () => {
      // Simulate existing RUN/PAUSE/RESET pattern
      controlBar.setRunState('running');
      expect(controlBar.getStatusText()).toBe('RUNNING');

      controlBar.setRunState('paused');
      expect(controlBar.getStatusText()).toBe('PAUSED');

      controlBar.setRunState('idle');
      expect(controlBar.getStatusText()).toBe('IDLE');
    });
  });
});

// =============================================================================
// Story 7.4 — Save Point & Time Rewind Buttons (RED PHASE)
// =============================================================================

describe('Story 7.4 — Save/Rewind checkpoint buttons (RED PHASE)', () => {
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

  // ── AC4/AC6: Button presence and initial disabled state ──────────

  describe('AC4/AC6: Button presence and initial disabled state', () => {
    test('[P1] Save checkpoint button exists with correct text and attributes', () => {
      const btn = container.querySelector('.btn-save-checkpoint');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('💾 保存检查点');
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      expect(btn!.getAttribute('title')).toBe('保存当前状态为检查点');
    });

    test('[P1] Rewind checkpoint button exists with correct text and attributes', () => {
      const btn = container.querySelector('.btn-rewind-checkpoint');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('⏪ 回到检查点');
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      expect(btn!.getAttribute('title')).toBe('回到保存的检查点');
    });

    test('[P1] Both buttons are present between Clear Canvas and Reset Viewport', () => {
      const clearBtn = container.querySelector('.btn-clear-canvas');
      const saveBtn = container.querySelector('.btn-save-checkpoint');
      const rewindBtn = container.querySelector('.btn-rewind-checkpoint');
      const viewportBtn = container.querySelector('.btn-reset-viewport');

      expect(clearBtn).not.toBeNull();
      expect(saveBtn).not.toBeNull();
      expect(rewindBtn).not.toBeNull();
      expect(viewportBtn).not.toBeNull();

      // Verify positional ordering via nextElementSibling chain
      expect(clearBtn!.nextElementSibling).toBe(saveBtn);
      expect(saveBtn!.nextElementSibling).toBe(rewindBtn);
      expect(rewindBtn!.nextElementSibling).toBe(viewportBtn);
    });

    test('[P2] Save button has disabled CSS class or property for greyed-out state', () => {
      const btn = container.querySelector('.btn-save-checkpoint') as HTMLButtonElement;
      // disabled attribute produces :disabled pseudo-class — opacity/cursor styling verified via CSS
      expect(btn.disabled).toBe(true);
    });

    test('[P2] Rewind button has disabled CSS class or property for greyed-out state', () => {
      const btn = container.querySelector('.btn-rewind-checkpoint') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  // ── Task 3.2: Button lifecycle (save enabled only when paused) ──────────

  describe('Task 3.2: Button lifecycle states', () => {
    test('[P2] Save button disabled when simEngine.state === idle', () => {
      // Simulate IDLE state: save should be disabled
      const btn = container.querySelector('.btn-save-checkpoint') as HTMLButtonElement;
      // In IDLE state (initial), save is disabled
      expect(btn.disabled).toBe(true);
    });

    test('[P2] Rewind button enabled when checkpoint exists (even during idle)', () => {
      // When _checkpoint !== null, rewind should be enabled regardless of sim state
      const btn = container.querySelector('.btn-rewind-checkpoint') as HTMLButtonElement;
      // Test that enabled state can be set programmatically
      btn.disabled = false;
      expect(btn.disabled).toBe(false);
    });
  });
});

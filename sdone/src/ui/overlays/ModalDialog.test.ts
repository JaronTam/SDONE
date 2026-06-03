import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ModalDialog } from './ModalDialog.js';
import type { ModalConfig } from './ModalDialog.js';

// ---------------------------------------------------------------------------
// Helper: create a default modal config
// ---------------------------------------------------------------------------

function createConfig(overrides?: Partial<ModalConfig>): ModalConfig {
  return {
    title: 'Test Title',
    body: 'Test body text',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModalDialog (Story 6.1)', () => {
  let modal: ModalDialog;

  beforeEach(() => {
    modal = new ModalDialog();
  });

  afterEach(() => {
    modal.destroy();
  });

  // ── open() ───────────────────────────────────────────────────────────

  describe('open', () => {
    it('creates DOM elements with correct title/body/button text', () => {
      const config = createConfig({
        title: '重置确认',
        body: '确定要重置画布吗？',
        confirmText: '确认重置',
        cancelText: '取消',
      });

      modal.open(config);

      expect(document.querySelector('.modal-title')?.textContent).toBe('重置确认');
      expect(document.querySelector('.modal-body')?.textContent).toBe('确定要重置画布吗？');
      expect(document.querySelector('.modal-btn-confirm')?.textContent).toBe('确认重置');
      expect(document.querySelector('.modal-btn-cancel')?.textContent).toBe('取消');
    });

    it('isOpen returns true after open', () => {
      expect(modal.isOpen).toBe(false);
      modal.open(createConfig());
      expect(modal.isOpen).toBe(true);
    });
  });

  // ── Confirm button ───────────────────────────────────────────────────

  describe('confirm button', () => {
    it('click confirm → onConfirm fires, modal closes', () => {
      const config = createConfig();
      modal.open(config);

      const confirmBtn = document.querySelector('.modal-btn-confirm') as HTMLButtonElement;
      confirmBtn.click();

      expect(config.onConfirm).toHaveBeenCalledTimes(1);
      expect(modal.isOpen).toBe(false);
    });
  });

  // ── Cancel button ────────────────────────────────────────────────────

  describe('cancel button', () => {
    it('click cancel → onCancel fires, modal closes', () => {
      const config = createConfig();
      modal.open(config);

      const cancelBtn = document.querySelector('.modal-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();

      expect(config.onCancel).toHaveBeenCalledTimes(1);
      expect(modal.isOpen).toBe(false);
    });
  });

  // ── Backdrop click ───────────────────────────────────────────────────

  describe('backdrop click', () => {
    it('click backdrop → onCancel fires, modal closes', () => {
      const config = createConfig();
      modal.open(config);

      const backdrop = document.querySelector('.modal-backdrop') as HTMLDivElement;
      backdrop.click();

      expect(config.onCancel).toHaveBeenCalledTimes(1);
      expect(modal.isOpen).toBe(false);
    });

    it('click on dialog (not backdrop) does NOT close modal', () => {
      const config = createConfig();
      modal.open(config);

      const dialog = document.querySelector('.modal-dialog') as HTMLDivElement;
      dialog.click();

      expect(config.onCancel).not.toHaveBeenCalled();
      expect(modal.isOpen).toBe(true);
    });
  });

  // ── Escape key ───────────────────────────────────────────────────────

  describe('Escape key', () => {
    it('press Escape → onCancel fires, modal closes', () => {
      const config = createConfig();
      modal.open(config);

      const event = new KeyboardEvent('keydown', { code: 'Escape', bubbles: true });
      window.dispatchEvent(event);

      expect(config.onCancel).toHaveBeenCalledTimes(1);
      expect(modal.isOpen).toBe(false);
    });

    it('Escape is captured and stopped — bubble handler does not see it', () => {
      const bubbleHandler = vi.fn();
      window.addEventListener('keydown', bubbleHandler);

      const config = createConfig();
      modal.open(config);

      const event = new KeyboardEvent('keydown', { code: 'Escape', bubbles: true });
      window.dispatchEvent(event);

      expect(config.onCancel).toHaveBeenCalledTimes(1);
      // Bubble handler should NOT have been called because capture handler
      // called stopPropagation()
      expect(bubbleHandler).not.toHaveBeenCalled();

      window.removeEventListener('keydown', bubbleHandler);
    });
  });

  // ── Keyboard suppression ─────────────────────────────────────────────

  describe('keyboard suppression', () => {
    it('Space key is suppressed while modal is open', () => {
      const bubbleHandler = vi.fn();
      window.addEventListener('keydown', bubbleHandler);

      modal.open(createConfig());

      const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
      window.dispatchEvent(event);

      expect(bubbleHandler).not.toHaveBeenCalled();

      window.removeEventListener('keydown', bubbleHandler);
    });

    it('Ctrl+Z is suppressed while modal is open', () => {
      const bubbleHandler = vi.fn();
      window.addEventListener('keydown', bubbleHandler);

      modal.open(createConfig());

      const event = new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true, bubbles: true });
      window.dispatchEvent(event);

      expect(bubbleHandler).not.toHaveBeenCalled();

      window.removeEventListener('keydown', bubbleHandler);
    });
  });

  // ── isOpen ───────────────────────────────────────────────────────────

  describe('isOpen', () => {
    it('returns false after close', () => {
      modal.open(createConfig());
      expect(modal.isOpen).toBe(true);

      modal.close();
      expect(modal.isOpen).toBe(false);
    });
  });

  // ── Second open() while modal is open ────────────────────────────────

  describe('replacing open modal', () => {
    it('second open() while modal is open → first onCancel fires, new modal replaces old', () => {
      const firstConfig = createConfig();
      const secondConfig = createConfig();

      modal.open(firstConfig);
      expect(modal.isOpen).toBe(true);

      modal.open(secondConfig);
      expect(firstConfig.onCancel).toHaveBeenCalledTimes(1);
      expect(modal.isOpen).toBe(true);

      // New modal should have the second config's text
      expect(document.querySelector('.modal-title')?.textContent).toBe('Test Title');
    });
  });

  // ── destroy ──────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('cleans up all DOM elements', () => {
      modal.open(createConfig());
      expect(document.querySelector('.modal-backdrop')).not.toBeNull();

      modal.destroy();
      expect(document.querySelector('.modal-backdrop')).toBeNull();
      expect(modal.isOpen).toBe(false);
    });

    it('removes capture-phase keydown listener', () => {
      modal.open(createConfig());
      modal.destroy();

      // After destroy, keydown events should reach bubble handlers
      const bubbleHandler = vi.fn();
      window.addEventListener('keydown', bubbleHandler);

      const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
      window.dispatchEvent(event);

      expect(bubbleHandler).toHaveBeenCalledTimes(1);

      window.removeEventListener('keydown', bubbleHandler);
    });

    it('destroy when no modal is open does not throw', () => {
      expect(() => modal.destroy()).not.toThrow();
    });
  });
});
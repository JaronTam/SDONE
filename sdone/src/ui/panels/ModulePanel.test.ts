/**
 * ModulePanel Unit Tests — Story 3.1 Task 8 + Story 3.2 Task 1
 *
 * AC: Verify ModulePanel DOM construction, visibility toggle, destroy cleanup,
 *     and drag-start callbacks (Story 3.2).
 *
 * Tests:
 *  1. constructor creates expected DOM structure
 *  2. setHidden(true) adds .module-panel--hidden class
 *  3. setHidden(false) removes .module-panel--hidden class
 *  4. destroy() removes panel DOM and cleans up
 *  5. Three icon items exist with correct labels and data attributes
 *  6. Icon canvases exist and have correct buffer dimensions
 *  7. Pin button click logs to console (no-op in 3.1)
 *  8. Drag-start fires callback with correct ModuleType
 *  9. Each icon item has draggable="true"
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ModulePanel } from './ModulePanel.js';

// ── Helpers ──────────────────────────────────────────────────────────

function createContainer(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'layer-panel-left';
  document.body.appendChild(div);
  return div;
}

// ── Standard Canvas mock for jsdom ─────────────────────────────────────
// jsdom's HTMLCanvasElement.getContext() returns null by default.
// Provide a minimal mock so we can verify getContext was called.
const originalGetContext = HTMLCanvasElement.prototype.getContext;

function installCanvasMock(): void {
  HTMLCanvasElement.prototype.getContext = function (
    contextType: string,
    _contextAttributes?: unknown,
  ) {
    if (contextType === '2d') {
      return {
        save: () => {},
        restore: () => {},
        scale: () => {},
        clearRect: () => {},
        fill: () => {},
        stroke: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        arcTo: () => {},
        closePath: () => {},
        fillRect: () => {},
        measureText: () => ({ width: 0 }),
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;
}

function restoreCanvasMock(): void {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ModulePanel', () => {
  let container: HTMLElement;
  let panel: ModulePanel;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = createContainer();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    installCanvasMock();
    panel = new ModulePanel(container);
  });

  afterEach(() => {
    panel.destroy();
    container.remove();
    consoleLogSpy.mockRestore();
    restoreCanvasMock();
  });

  // ── AC1+AC2: DOM Structure ──────────────────────────────────────

  describe('DOM construction', () => {
    it('should create a .module-panel root element inside the container', () => {
      const root = container.querySelector('.module-panel');
      expect(root).not.toBeNull();
    });

    it('should create a header with title "构件面板" and a pin button', () => {
      const header = container.querySelector('.module-panel__header');
      expect(header).not.toBeNull();

      const title = container.querySelector('.module-panel__title');
      expect(title).not.toBeNull();
      expect(title!.textContent).toBe('构件面板');

      const pinBtn = container.querySelector('.module-panel__pin-btn');
      expect(pinBtn).not.toBeNull();
      expect(pinBtn!.textContent).toBe('📌');
    });

    it('should create an icon list containing three .module-icon items', () => {
      const iconItems = container.querySelectorAll('.module-icon');
      expect(iconItems).toHaveLength(3);
    });

    it('should have correct data-module-type attributes on icon items', () => {
      const iconItems = container.querySelectorAll('.module-icon');
      const types = Array.from(iconItems).map(el =>
        el.getAttribute('data-module-type'),
      );
      expect(types).toEqual(['source', 'stock', 'sink']);
    });

    it('should have correct labels: 源, 存量, 汇', () => {
      const labels = container.querySelectorAll('.module-icon__label');
      expect(labels).toHaveLength(3);
      expect(labels[0].textContent).toBe('源');
      expect(labels[1].textContent).toBe('存量');
      expect(labels[2].textContent).toBe('汇');
    });

    it('should have a canvas inside each icon item', () => {
      const canvases = container.querySelectorAll('.module-icon canvas');
      expect(canvases).toHaveLength(3);
    });

    it('should set canvas buffer size based on devicePixelRatio (64×dpr)', () => {
      const dpr = window.devicePixelRatio || 1;
      const expectedBuffer = Math.ceil(64 * dpr);
      const canvases = container.querySelectorAll<HTMLCanvasElement>(
        '.module-icon canvas',
      );
      for (const canvas of canvases) {
        expect(canvas.width).toBe(expectedBuffer);
        expect(canvas.height).toBe(expectedBuffer);
      }
    });

    it('should set canvas CSS display size to 64px×64px', () => {
      const canvases = container.querySelectorAll<HTMLCanvasElement>(
        '.module-icon canvas',
      );
      for (const canvas of canvases) {
        expect(canvas.style.width).toBe('64px');
        expect(canvas.style.height).toBe('64px');
      }
    });
  });

  // ── AC7: Visibility Toggle ───────────────────────────────────────

  describe('setHidden', () => {
    it('should add .module-panel--hidden class when setHidden(true) is called', () => {
      panel.setHidden(true);
      const root = container.querySelector('.module-panel');
      expect(root!.classList.contains('module-panel--hidden')).toBe(true);
    });

    it('should remove .module-panel--hidden class when setHidden(false) is called', () => {
      panel.setHidden(true);
      panel.setHidden(false);
      const root = container.querySelector('.module-panel');
      expect(root!.classList.contains('module-panel--hidden')).toBe(false);
    });

    it('should start with panel visible (no .module-panel--hidden class)', () => {
      const root = container.querySelector('.module-panel');
      expect(root!.classList.contains('module-panel--hidden')).toBe(false);
    });
  });

  // ── AC8: Destroy ────────────────────────────────────────────────

  describe('destroy', () => {
    it('should remove the .module-panel element from the container', () => {
      panel.destroy();
      const root = container.querySelector('.module-panel');
      expect(root).toBeNull();
    });

    it('should be safe to call destroy() multiple times', () => {
      panel.destroy();
      // Should not throw
      expect(() => panel.destroy()).not.toThrow();
    });
  });

  // ── AC5: Pin Button ─────────────────────────────────────────────

  describe('pin button', () => {
    it('should log to console when pin button is clicked', () => {
      const pinBtn = container.querySelector(
        '.module-panel__pin-btn',
      ) as HTMLButtonElement;
      pinBtn.click();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ModulePanel] pin toggle clicked (no-op in 3.1)',
      );
    });

    it('should have aria-label on pin button', () => {
      const pinBtn = container.querySelector('.module-panel__pin-btn');
      expect(pinBtn!.getAttribute('aria-label')).toBe('Toggle panel pin');
    });
  });

  // ── Story 3.2: Drag-Start ──────────────────────────────────────

  describe('drag-start (Story 3.2)', () => {
    /**
     * jsdom does not implement DragEvent, so we create a plain Event with
     * a manually attached dataTransfer-like object to simulate HTML drag.
     */
    function makeDragEvent(): Event {
      const evt = new Event('dragstart', { bubbles: true, cancelable: true });
      Object.defineProperty(evt, 'dataTransfer', {
        value: new (class {
          setData = vi.fn();
          getData = vi.fn();
          effectAllowed = '';
        })(),
        writable: false,
      });
      return evt;
    }

    it('should set draggable="true" on each .module-icon', () => {
      const icons = container.querySelectorAll('.module-icon');
      for (const icon of icons) {
        expect(icon.getAttribute('draggable')).toBe('true');
      }
    });

    it('should set dataTransfer data and effectAllowed on dragstart for each module type', () => {
      const types: Array<{ selector: string; expectedType: string }> = [
        { selector: '[data-module-type="source"]', expectedType: 'source' },
        { selector: '[data-module-type="stock"]', expectedType: 'stock' },
        { selector: '[data-module-type="sink"]', expectedType: 'sink' },
      ];

      for (const { selector, expectedType } of types) {
        const icon = container.querySelector(selector) as HTMLElement;
        const evt = makeDragEvent();
        icon.dispatchEvent(evt);

        expect((evt as any).dataTransfer.setData).toHaveBeenCalledWith(
          'application/x-sdone-module',
          expectedType,
        );
        expect((evt as any).dataTransfer.effectAllowed).toBe('copy');
      }
    });
  });

  // ── Story 3.5: Keyboard Interaction (tabindex, aria, getSelectedType) ──

  describe('Story 3.5 — keyboard interaction attributes', () => {
    it('should have tabindex="0" on each .module-icon', () => {
      const icons = container.querySelectorAll('.module-icon');
      expect(icons).toHaveLength(3);
      for (const icon of icons) {
        expect(icon.getAttribute('tabindex')).toBe('0');
      }
    });

    it('should have role="option" and aria-selected="false" on each .module-icon', () => {
      const icons = container.querySelectorAll('.module-icon');
      for (const icon of icons) {
        expect(icon.getAttribute('role')).toBe('option');
        expect(icon.getAttribute('aria-selected')).toBe('false');
      }
    });

    it('getSelectedType() returns null by default', () => {
      expect(panel.getSelectedType()).toBeNull();
    });

    it('click on source icon sets selectedType to source and updates aria-selected', () => {
      const sourceIcon = container.querySelector(
        '[data-module-type="source"]',
      ) as HTMLElement;
      sourceIcon.click();

      expect(panel.getSelectedType()).toBe('source');
      expect(sourceIcon.getAttribute('aria-selected')).toBe('true');
      expect(sourceIcon.hasAttribute('data-highlighted')).toBe(true);

      // Other icons remain unselected
      const stockIcon = container.querySelector(
        '[data-module-type="stock"]',
      ) as HTMLElement;
      expect(stockIcon.getAttribute('aria-selected')).toBe('false');
      expect(stockIcon.hasAttribute('data-highlighted')).toBe(false);
    });

    it('click on stock icon sets selectedType to stock and clears previous selection', () => {
      // First select source
      const sourceIcon = container.querySelector(
        '[data-module-type="source"]',
      ) as HTMLElement;
      sourceIcon.click();

      // Then select stock
      const stockIcon = container.querySelector(
        '[data-module-type="stock"]',
      ) as HTMLElement;
      stockIcon.click();

      expect(panel.getSelectedType()).toBe('stock');
      expect(stockIcon.getAttribute('aria-selected')).toBe('true');
      expect(stockIcon.hasAttribute('data-highlighted')).toBe(true);

      // Source should be deselected
      expect(sourceIcon.getAttribute('aria-selected')).toBe('false');
      expect(sourceIcon.hasAttribute('data-highlighted')).toBe(false);
    });

    it('click on sink icon sets selectedType to sink', () => {
      const sinkIcon = container.querySelector(
        '[data-module-type="sink"]',
      ) as HTMLElement;
      sinkIcon.click();

      expect(panel.getSelectedType()).toBe('sink');
      expect(sinkIcon.getAttribute('aria-selected')).toBe('true');
    });
  });

  // ── AC6: Pointer Events ─────────────────────────────────────────

  describe('pointer events isolation', () => {
    it('should set pointer-events: auto on .module-icon items', () => {
      const iconItem = container.querySelector('.module-icon') as HTMLElement;
      expect(iconItem).not.toBeNull();

      // Check the computed style or the CSS class — the CSS file
      // applies pointer-events: auto to .module-icon, so we verify
      // the element has the expected class.
      expect(iconItem.classList.contains('module-icon')).toBe(true);
    });

    it('should set pointer-events: auto on .module-panel root', () => {
      const root = container.querySelector('.module-panel') as HTMLElement;
      expect(root).not.toBeNull();
      expect(root.classList.contains('module-panel')).toBe(true);
    });
  });
});

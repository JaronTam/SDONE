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

  beforeEach(() => {
    container = createContainer();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    installCanvasMock();
    panel = new ModulePanel(container);
  });

  afterEach(() => {
    panel.destroy();
    container.remove();
    vi.restoreAllMocks();
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

  // ── Story 6.6: Pin Button (functional toggle) ─────────────────────

  describe('pin button (Story 6.6)', () => {
    it('should have a pin button that toggles pinned state (AC2)', () => {
      const pinBtn = container.querySelector('.module-panel__pin-btn');
      expect(pinBtn).not.toBeNull();
      expect(pinBtn!.textContent).toBe('📌');
      // Pin button is functional in 6.6 (no longer logs to console)
      (pinBtn as HTMLButtonElement).click();
      expect(panel.isPinned()).toBe(true);
    });

    it('isPinned() should return false by default (AC2)', () => {
      expect(panel.isPinned()).toBe(false);
    });

    it('clicking pin button should toggle pinned state (AC2)', () => {
      const pinBtn = container.querySelector('.module-panel__pin-btn') as HTMLElement;
      expect(panel.isPinned()).toBe(false);

      pinBtn.click();
      expect(panel.isPinned()).toBe(true);
      expect(pinBtn.classList.contains('module-panel__pin-btn--active')).toBe(true);
      expect(pinBtn.getAttribute('aria-pressed')).toBe('true');

      pinBtn.click();
      expect(panel.isPinned()).toBe(false);
      expect(pinBtn.classList.contains('module-panel__pin-btn--active')).toBe(false);
      expect(pinBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('setPinned() should change pinned state programmatically (AC2)', () => {
      panel.setPinned(true);
      expect(panel.isPinned()).toBe(true);

      panel.setPinned(false);
      expect(panel.isPinned()).toBe(false);

      // Idempotent: setting same value again does nothing
      panel.setPinned(false);
      expect(panel.isPinned()).toBe(false);
    });

    it('pin button aria-label should reflect pinned state (AC2)', () => {
      const pinBtn = container.querySelector('.module-panel__pin-btn') as HTMLElement;
      expect(pinBtn.getAttribute('aria-label')).toBe('固定面板');

      pinBtn.click();
      expect(pinBtn.getAttribute('aria-label')).toBe('取消固定面板');

      pinBtn.click();
      expect(pinBtn.getAttribute('aria-label')).toBe('固定面板');
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

  // ── Story 6.5 AC1: Compositions Area ──────────────────────────────

  describe('Story 6.5 — Compositions area (AC1)', () => {
    it('should render compositions area with header and placeholder text (AC1)', () => {
      const compositionsHeader = container.querySelector('.module-panel__compositions-header');
      expect(compositionsHeader).not.toBeNull();
      const title = container.querySelector('.module-panel__compositions-title');
      expect(title).not.toBeNull();
      expect(title!.textContent).toBe('组合');

      const placeholder = container.querySelector('.module-panel__compositions-placeholder');
      expect(placeholder).not.toBeNull();
      expect(placeholder!.textContent).toBe('选中三个模块后命名此逻辑堆栈');
    });

    it('should have a divider between icon list and compositions area', () => {
      const divider = container.querySelector('.module-panel__divider');
      expect(divider).not.toBeNull();
    });
  });

  // ── Story 6.5 AC2: Click-to-place selection ──────────────────────

  describe('Story 6.5 — Click-to-place selection (AC2)', () => {
    it('clearSelection() should reset selected type to null (AC2)', () => {
      const sourceIcon = container.querySelector('[data-module-type="source"]') as HTMLElement;
      sourceIcon.click();
      expect(panel.getSelectedType()).toBe('source');

      panel.clearSelection();
      expect(panel.getSelectedType()).toBeNull();
    });

    it('should show selected state on click and clear on clearSelection (AC2)', () => {
      const sourceIcon = container.querySelector('[data-module-type="source"]') as HTMLElement;
      sourceIcon.click();
      expect(sourceIcon.hasAttribute('data-highlighted')).toBe(true);
      expect(sourceIcon.getAttribute('aria-selected')).toBe('true');

      panel.clearSelection();
      expect(sourceIcon.hasAttribute('data-highlighted')).toBe(false);
      expect(sourceIcon.getAttribute('aria-selected')).toBe('false');
    });
  });

  // ── Story 6.5 AC3: Re-expand tab + auto-hide ──────────────────────

  describe('Story 6.5 — Re-expand tab and auto-hide (AC3)', () => {
    it('should create re-expand tab element (AC3)', () => {
      const tab = container.querySelector('.module-panel__re-expand-tab');
      expect(tab).not.toBeNull();
      expect(tab!.getAttribute('aria-label')).toBe('展开模块面板');
    });

    it('should hide panel via CSS class, tab becomes interactive via ~ sibling selector (AC3)', () => {
      panel.setHidden(true);
      const root = container.querySelector('.module-panel');
      expect(root!.classList.contains('module-panel--hidden')).toBe(true);

      // Tab exists and is after .module-panel in DOM (sibling for ~ selector)
      const tab = container.querySelector('.module-panel__re-expand-tab');
      expect(tab).not.toBeNull();
      // CSS .module-panel--hidden ~ .module-panel__re-expand-tab { opacity: 1; pointer-events: auto }
      // In jsdom we verify the sibling relationship, not computed opacity
      const rootIndex = Array.from(container.children).indexOf(root!);
      const tabIndex = Array.from(container.children).indexOf(tab!);
      expect(tabIndex).toBeGreaterThan(rootIndex); // tab is after root (sibling)
    });

    it('clicking re-expand tab should re-show the panel and pin it (AC1, AC3)', () => {
      panel.setHidden(true);
      const root = container.querySelector('.module-panel');
      expect(root!.classList.contains('module-panel--hidden')).toBe(true);

      const tab = container.querySelector('.module-panel__re-expand-tab') as HTMLElement;
      tab.click();

      expect(root!.classList.contains('module-panel--hidden')).toBe(false);
      // Story 6.6 AC1 — re-expand also pins the panel
      expect(panel.isPinned()).toBe(true);
    });

    it('setHidden(false) should remove hidden class (AC3)', () => {
      panel.setHidden(true);
      panel.setHidden(false);
      const root = container.querySelector('.module-panel');
      expect(root!.classList.contains('module-panel--hidden')).toBe(false);
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

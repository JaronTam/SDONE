import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// RED PHASE: ToolbarController.ts does not exist yet — this import will fail.
// The test file is syntactically correct and will compile once the class is created.
import { ToolbarController } from './ToolbarController.js';
import type { ToolbarData, ToolbarControllerOptions } from './ToolbarController.js';

// ---------------------------------------------------------------------------
// Factory Helpers
// ---------------------------------------------------------------------------

function createToolbarData(overrides?: Partial<ToolbarData>): ToolbarData {
  return {
    moduleId: 'mod-1',
    moduleType: 'source',
    label: '测试源',
    dataText: '10.5/小时',
    color: '#3b82f6',
    ...overrides,
  };
}

function createOptions(overrides?: Partial<ToolbarControllerOptions>): ToolbarControllerOptions {
  return {
    onNameEditStart: vi.fn(),
    onNameCommit: vi.fn(),
    onNameEditCancel: vi.fn(),
    onColorDotClick: vi.fn(),
    ...overrides,
  };
}

function createScreenPos(overrides?: Partial<{ x: number; y: number }>): {
  x: number;
  y: number;
} {
  return { x: overrides?.x ?? 200, y: overrides?.y ?? 150 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolbarController (Story 8.4)', () => {
  let controller: ToolbarController;
  let options: ReturnType<typeof createOptions>;

  beforeEach(() => {
    options = createOptions();
    controller = new ToolbarController(options);
  });

  afterEach(() => {
    controller.destroy();
    // Clean up any leftover toolbar DOM elements
    document.querySelectorAll('.toolbar').forEach((el) => el.remove());
  });

  // ── Constructor ───────────────────────────────────────────────────────

  describe('constructor', () => {
    it('TC-01: initializes private fields to null/empty, no DOM access (AC20)', () => {
      expect(controller.isEditing).toBe(false);
      expect(document.querySelector('.toolbar')).toBeNull();
    });
  });

  // ── show() ────────────────────────────────────────────────────────────

  describe('show', () => {
    it('TC-02: creates DOM elements with BEM classes, appends to document.body (AC21, AC25)', () => {
      controller.show();

      const toolbar = document.querySelector('.toolbar');
      expect(toolbar).not.toBeNull();
      expect(document.body.contains(toolbar)).toBe(true);

      // BEM child elements exist
      expect(toolbar!.querySelector('.toolbar__color-dot')).not.toBeNull();
      expect(toolbar!.querySelector('.toolbar__name')).not.toBeNull();
      expect(toolbar!.querySelector('.toolbar__data')).not.toBeNull();
    });

    it('TC-03: idempotency — second call is no-op, no duplicate elements (AC21)', () => {
      controller.show();
      controller.show();

      const toolbars = document.querySelectorAll('.toolbar');
      expect(toolbars.length).toBe(1);
    });
  });

  // ── hide() ────────────────────────────────────────────────────────────

  describe('hide', () => {
    it('TC-04: removes element from DOM, element no longer in document (AC22)', () => {
      controller.show();
      expect(document.querySelector('.toolbar')).not.toBeNull();

      controller.hide();

      expect(document.querySelector('.toolbar')).toBeNull();
    });

    it('TC-05: idempotency — safe when already hidden, no throw (AC2, AC22)', () => {
      // hide() before show() — should not throw
      expect(() => controller.hide()).not.toThrow();

      // hide() after show() → hide() twice — should not throw
      controller.show();
      controller.hide();
      expect(() => controller.hide()).not.toThrow();
      expect(document.querySelector('.toolbar')).toBeNull();
    });
  });

  // ── updatePosition() ──────────────────────────────────────────────────

  describe('updatePosition', () => {
    it('TC-06: sets left/top CSS properties to correct pixel values (AC5)', () => {
      controller.show();
      controller.updatePosition(createScreenPos({ x: 320, y: 88 }));

      const toolbar = document.querySelector('.toolbar') as HTMLElement;
      expect(toolbar.style.left).toBe('320px');
      expect(toolbar.style.top).toBe('88px');
    });
  });

  // ── updateData() ──────────────────────────────────────────────────────

  describe('updateData', () => {
    it('TC-07: Source — name rendered, color dot visible with correct color, data text displayed (AC3, AC17)', () => {
      const data = createToolbarData({
        moduleType: 'source',
        label: ' rainfall ',
        color: '#60a5fa',
        dataText: '25.0/小时',
      });
      controller.show();
      controller.updateData(data);

      const nameEl = document.querySelector('.toolbar__name') as HTMLElement;
      expect(nameEl.textContent).toBe(' rainfall ');

      const dotEl = document.querySelector('.toolbar__color-dot') as HTMLElement;
      expect(dotEl).not.toBeNull();
      expect(dotEl.style.backgroundColor).toBe('rgb(96, 165, 250)'); // #60a5fa
      // Color dot should NOT have --hidden class for Source
      expect(dotEl.classList.contains('toolbar__color-dot--hidden')).toBe(false);

      const dataEl = document.querySelector('.toolbar__data') as HTMLElement;
      expect(dataEl.textContent).toBe('25.0/小时');
    });

    it('TC-08: Stock — no color dot, dataTextColor applied, net change text displayed (AC4, AC19, AC27)', () => {
      const data = createToolbarData({
        moduleType: 'stock',
        label: 'Stock A',
        color: undefined,
        dataText: '净变化：+3.2',
        dataTextColor: '#22c55e',
      });
      controller.show();
      controller.updateData(data);

      // Color dot is hidden for Stock via BEM --hidden modifier class
      const dotEl = document.querySelector('.toolbar__color-dot') as HTMLElement;
      expect(dotEl).not.toBeNull();
      expect(dotEl.classList.contains('toolbar__color-dot--hidden')).toBe(true);

      // Name is rendered
      const nameEl = document.querySelector('.toolbar__name') as HTMLElement;
      expect(nameEl.textContent).toBe('Stock A');

      // Data text with color applied
      const dataEl = document.querySelector('.toolbar__data') as HTMLElement;
      expect(dataEl.textContent).toBe('净变化：+3.2');
      expect(dataEl.style.color).toBe('rgb(34, 197, 94)'); // #22c55e
    });

    it('TC-09: Sink — name rendered, color dot visible, data text displayed (AC3, AC17)', () => {
      const data = createToolbarData({
        moduleType: 'sink',
        label: '出口',
        color: '#f59e0b',
        dataText: '15.0/小时',
      });
      controller.show();
      controller.updateData(data);

      const nameEl = document.querySelector('.toolbar__name') as HTMLElement;
      expect(nameEl.textContent).toBe('出口');

      const dotEl = document.querySelector('.toolbar__color-dot') as HTMLElement;
      expect(dotEl).not.toBeNull();
      expect(dotEl.style.backgroundColor).toBe('rgb(245, 158, 11)'); // #f59e0b
      expect(dotEl.classList.contains('toolbar__color-dot--hidden')).toBe(false);

      const dataEl = document.querySelector('.toolbar__data') as HTMLElement;
      expect(dataEl.textContent).toBe('15.0/小时');
    });

    it('TC-10: before show() — no-op, no throw, no DOM elements created (AC6)', () => {
      const data = createToolbarData();
      expect(() => controller.updateData(data)).not.toThrow();
      expect(document.querySelector('.toolbar')).toBeNull();
    });
  });

  // ── Name Editing — Enter Edit Mode ────────────────────────────────────

  describe('name editing: enter edit mode', () => {
    beforeEach(() => {
      controller.show();
      controller.updateData(createToolbarData({ label: ' rainfall ' }));
    });

    it('TC-11: name click replaces span with input, fires onNameEditStart, input focused (AC8)', () => {
      const nameSpan = document.querySelector('.toolbar__name') as HTMLElement;
      nameSpan.click();

      // Span replaced by input
      const input = document.querySelector('.toolbar__name--editing') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.tagName).toBe('INPUT');
      expect(input.value).toBe(' rainfall ');

      // Span is gone
      expect(document.querySelector('.toolbar__name:not(.toolbar__name--editing)')).toBeNull();

      // Callback fired
      expect(options.onNameEditStart).toHaveBeenCalledTimes(1);

      // Input is focused
      expect(document.activeElement).toBe(input);
    });
  });

  // ── Name Editing — Enter Commit ───────────────────────────────────────

  describe('name editing: Enter commit', () => {
    beforeEach(() => {
      controller.show();
      controller.updateData(createToolbarData({ label: 'MyModule' }));
    });

    function enterEditMode(): HTMLInputElement {
      const nameSpan = document.querySelector('.toolbar__name') as HTMLElement;
      nameSpan.click();
      return document.querySelector('.toolbar__name--editing') as HTMLInputElement;
    }

    function pressEnter(input: HTMLInputElement): void {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    }

    it('TC-12: Enter commits name — onNameCommit(trimmed) fired, exits edit mode (AC9)', () => {
      const input = enterEditMode();
      input.value = '  NewName  ';
      pressEnter(input);

      expect(options.onNameCommit).toHaveBeenCalledWith('NewName');
      expect(options.onNameCommit).toHaveBeenCalledTimes(1);

      // Edit mode exited — input gone, span restored
      expect(document.querySelector('.toolbar__name--editing')).toBeNull();
      const nameSpan = document.querySelector('.toolbar__name') as HTMLElement;
      expect(nameSpan).not.toBeNull();
      expect(nameSpan.textContent).toBe('NewName');
      expect(controller.isEditing).toBe(false);
    });

    it('TC-13: Enter with >50 chars — truncated to 50 before onNameCommit (AC9, AC13)', () => {
      const input = enterEditMode();
      const longName = 'A'.repeat(55);
      input.value = longName;
      pressEnter(input);

      expect(options.onNameCommit).toHaveBeenCalledWith('A'.repeat(50));
    });

    it('TC-14: Enter with whitespace-only name — falls back to type default "Source" (AC12)', () => {
      const input = enterEditMode();
      input.value = '   ';
      pressEnter(input);

      expect(options.onNameCommit).toHaveBeenCalledWith('Source');
    });

    it('TC-15: Enter with empty string — falls back to type default "Source" (AC12)', () => {
      const input = enterEditMode();
      input.value = '';
      pressEnter(input);

      expect(options.onNameCommit).toHaveBeenCalledWith('Source');
    });
  });

  // ── Name Editing — Blur Commit ────────────────────────────────────────

  describe('name editing: blur commit', () => {
    beforeEach(() => {
      controller.show();
      controller.updateData(createToolbarData({ label: 'BlurTest' }));
    });

    it('TC-16: blur commits name — onNameCommit fired, exits edit mode (AC10)', () => {
      const nameSpan = document.querySelector('.toolbar__name') as HTMLElement;
      nameSpan.click();

      const input = document.querySelector('.toolbar__name--editing') as HTMLInputElement;
      input.value = 'BlurredName';
      input.dispatchEvent(new FocusEvent('blur', { bubbles: false }));

      expect(options.onNameCommit).toHaveBeenCalledWith('BlurredName');
      expect(options.onNameCommit).toHaveBeenCalledTimes(1);
      expect(controller.isEditing).toBe(false);
    });
  });

  // ── Name Editing — Escape Revert ──────────────────────────────────────

  describe('name editing: Escape revert', () => {
    beforeEach(() => {
      controller.show();
      controller.updateData(createToolbarData({ label: 'Original' }));
    });

    function enterEditMode(): HTMLInputElement {
      const nameSpan = document.querySelector('.toolbar__name') as HTMLElement;
      nameSpan.click();
      return document.querySelector('.toolbar__name--editing') as HTMLInputElement;
    }

    it('TC-17: Escape reverts name to _preEditName, fires onNameEditCancel, stopPropagation called (AC11)', () => {
      // F3 fix: Test previously pressed Escape twice (pressEscape + dispatchEvent)
      // but asserted onNameEditCancel called only once. Now only one Escape press.
      const input = enterEditMode();
      input.value = 'Modified';

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
        cancelable: true,
      });
      // F6 fix: stopPropagationSpy is now used in the assertion below (was unused before)
      const stopPropagationSpy = vi.spyOn(escapeEvent, 'stopPropagation');
      input.dispatchEvent(escapeEvent);

      // Callback fired exactly once (single Escape press)
      expect(options.onNameEditCancel).toHaveBeenCalledTimes(1);
      // stopPropagation was called (prevents InputManager deselect)
      expect(stopPropagationSpy).toHaveBeenCalled();

      // Edit mode exited — input gone, span restored with ORIGINAL name
      expect(document.querySelector('.toolbar__name--editing')).toBeNull();
      const nameSpan = document.querySelector('.toolbar__name') as HTMLElement;
      expect(nameSpan).not.toBeNull();
      expect(nameSpan.textContent).toBe('Original');
      expect(controller.isEditing).toBe(false);
    });

    it('TC-18: Escape outside edit mode — not intercepted, no callback fired (AC16)', () => {
      // Dispatch Escape on the toolbar root when NOT editing
      const toolbar = document.querySelector('.toolbar') as HTMLElement;
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
        cancelable: true,
      });
      toolbar.dispatchEvent(escapeEvent);

      // ToolbarController should NOT have intercepted — no cancel/edit callbacks
      expect(options.onNameEditCancel).not.toHaveBeenCalled();
      expect(options.onNameEditStart).not.toHaveBeenCalled();
      // Event should have bubbled (not stopped)
      expect(escapeEvent.defaultPrevented).toBe(false);
    });
  });

  // ── Color Dot ─────────────────────────────────────────────────────────

  describe('color dot', () => {
    beforeEach(() => {
      controller.show();
    });

    it('TC-19: mousedown fires onColorDotClick, preventDefault + stopPropagation called (AC17, AC18)', () => {
      controller.updateData(createToolbarData({ moduleType: 'source', color: '#a855f7' }));

      const dot = document.querySelector('.toolbar__color-dot') as HTMLElement;
      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(mousedownEvent, 'preventDefault');
      const stopPropagationSpy = vi.spyOn(mousedownEvent, 'stopPropagation');

      dot.dispatchEvent(mousedownEvent);

      expect(options.onColorDotClick).toHaveBeenCalledTimes(1);
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
    });

    it('TC-20: Stock toolbar — color dot hidden via BEM --hidden class (AC19)', () => {
      controller.updateData(createToolbarData({ moduleType: 'stock', color: undefined }));

      const dot = document.querySelector('.toolbar__color-dot') as HTMLElement;
      expect(dot).not.toBeNull();
      // AC19: Stock color dot hidden via BEM --hidden modifier class
      expect(dot.classList.contains('toolbar__color-dot--hidden')).toBe(true);
    });
  });

  // ── startEditing() ────────────────────────────────────────────────────

  describe('startEditing', () => {
    beforeEach(() => {
      controller.show();
      controller.updateData(createToolbarData({ label: 'ProgEntry' }));
    });

    it('TC-21: enters edit mode programmatically, fires onNameEditStart', () => {
      controller.startEditing();

      const input = document.querySelector('.toolbar__name--editing') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.value).toBe('ProgEntry');
      expect(options.onNameEditStart).toHaveBeenCalledTimes(1);
      expect(controller.isEditing).toBe(true);
    });

    it('TC-22: idempotency — when already editing, no-op, no duplicate input', () => {
      controller.startEditing();
      const firstInput = document.querySelector('.toolbar__name--editing') as HTMLInputElement;

      controller.startEditing();

      // Only one input exists
      expect(document.querySelectorAll('.toolbar__name--editing').length).toBe(1);
      // Same input element (not replaced)
      expect(document.querySelector('.toolbar__name--editing')).toBe(firstInput);
      // Callback fired only once (from first call)
      expect(options.onNameEditStart).toHaveBeenCalledTimes(1);
    });
  });

  // ── destroy() ─────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('TC-23: removes DOM, safe to call multiple times (AC23)', () => {
      controller.show();
      controller.updateData(createToolbarData());
      controller.destroy();

      expect(document.querySelector('.toolbar')).toBeNull();

      // Safe to call again
      expect(() => controller.destroy()).not.toThrow();
      expect(() => controller.destroy()).not.toThrow();
    });
  });

  // ── isEditing accessor ────────────────────────────────────────────────

  describe('isEditing', () => {
    beforeEach(() => {
      controller.show();
      controller.updateData(createToolbarData({ label: 'AccessorTest' }));
    });

    it('TC-24: returns true only during edit mode, false otherwise', () => {
      // False before editing
      expect(controller.isEditing).toBe(false);

      // True during editing
      controller.startEditing();
      expect(controller.isEditing).toBe(true);

      // False after commit
      const input = document.querySelector('.toolbar__name--editing') as HTMLInputElement;
      input.value = 'Committed';
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(controller.isEditing).toBe(false);

      // False after Escape revert
      controller.startEditing();
      expect(controller.isEditing).toBe(true);
      const input2 = document.querySelector('.toolbar__name--editing') as HTMLInputElement;
      input2.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(controller.isEditing).toBe(false);
    });
  });

  // ── Import Audit ──────────────────────────────────────────────────────

  describe('import audit', () => {
    it('TC-25: ToolbarController.ts imports nothing from state/, canvas/, simulation/, event-bus/ (AC24)', () => {
      // Use Vite's import.meta.glob to read source as raw string
      // (avoids node:fs dependency that breaks tsc in browser env)
      const modules = import.meta.glob('./ToolbarController.ts', {
        query: '?raw',
        import: 'default',
        eager: true,
      });
      const source = modules['./ToolbarController.ts'] as string;

      const forbiddenModules = ['state/', 'canvas/', 'simulation/', 'event-bus/'];
      const lines = source.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('import ') || trimmed.startsWith('export * from')) {
          for (const forbidden of forbiddenModules) {
            expect(trimmed).not.toContain(forbidden);
          }
        }
      }
    });
  });

  // ── preEditName Sync ─────────────────────────────────────────────────

  describe('preEditName sync', () => {
    it('TC-26: updateData updates _preEditName when NOT editing; preserves _preEditName when editing (AC11)', () => {
      // Phase 1: Set initial name
      controller.show();
      controller.updateData(createToolbarData({ label: 'Phase1Name' }));

      // Phase 2: Enter edit mode
      controller.startEditing();
      const input = document.querySelector('.toolbar__name--editing') as HTMLInputElement;
      input.value = 'UserModified';

      // Phase 3: updateData during editing (e.g., tick update) — _preEditName preserved
      controller.updateData(createToolbarData({ label: 'Phase3TickName' }));

      // P3-3 FIX VERIFICATION: input.value should NOT be overwritten by updateData
      // AC11: When editing, user's in-progress edits must be preserved
      expect(input.value).toBe('UserModified');

      // Phase 4: Escape — should revert to Phase1Name (NOT Phase3TickName)
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(escapeEvent);

      expect(options.onNameEditCancel).toHaveBeenCalledTimes(1);
      const nameSpan = document.querySelector('.toolbar__name') as HTMLElement;
      expect(nameSpan.textContent).toBe('Phase1Name');
    });
  });
});

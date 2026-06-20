/**
 * RateEditorPanel Unit Tests — Story 4.5 Task 5
 *
 * AC: Verify RateEditorPanel DOM construction, setConnection, setRate,
 *     onRateSubmit callback, and invalid input handling.
 *
 * Note: Rate submission fires on Enter keydown, not on input event.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateEditorPanel } from './RateEditorPanel.js';

// ── Helpers ──────────────────────────────────────────────────────────

function createContainer(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'layer-panel-right';
  document.body.appendChild(div);
  return div;
}

// ── jsdom canvas mock (same as ModulePanel.test.ts) ─────────────────
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

function uninstallCanvasMock(): void {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
}

/** Dispatch a synthetic Enter keydown on the given element. */
function pressEnter(el: HTMLElement): void {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  el.dispatchEvent(event);
}

/** Programmatically set input value, focus, then press Enter. */
function typeRateEnter(input: HTMLInputElement, value: string): void {
  input.focus();
  input.value = value;
  pressEnter(input);
}

// ── Setup / Teardown ────────────────────────────────────────────────

describe('RateEditorPanel', () => {
  let container: HTMLElement;
  let panel: RateEditorPanel;

  beforeEach(() => {
    container = createContainer();
    installCanvasMock();
    panel = new RateEditorPanel(container);
  });

  afterEach(() => {
    panel.destroy();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    uninstallCanvasMock();
    document.body.innerHTML = '';
    vi.useRealTimers(); // Story 6.4 patch: restore real timers even if fake-timer test fails
  });

  // ── Test 1: Constructor DOM structure ─────────────────────────────

  it('should create expected DOM structure with title, empty state, and form', () => {
    const root = container.querySelector('.rate-editor');
    expect(root).not.toBeNull();

    // Title
    const title = root!.querySelector('.rate-editor__title');
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe('速率编辑器');

    // Empty state (visible by default)
    const empty = root!.querySelector('.rate-editor__empty') as HTMLElement | null;
    expect(empty).not.toBeNull();
    // display style is '' by default (visible)
    expect(empty!.style.display).toBe('');

    // Editor form (hidden by default)
    const form = root!.querySelector('.rate-editor__form') as HTMLElement;
    expect(form).not.toBeNull();
    expect(form.style.display).toBe('none');

    // Rate input
    const input = root!.querySelector('.rate-editor__input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.type).toBe('number');
    expect(input.step).toBe('any');
  });

  // ── Test 2: setConnection(null) → empty state ─────────────────────

  it('setConnection(null) should show empty state and hide form', () => {
    // First set a connection to flip to form state
    panel.setConnection({
      id: 'conn-1',
      fromId: 'mod-a',
      toId: 'mod-b',
      rate: 5,
      fromType: 'source',
      toType: 'stock',
    });

    // Then deselect
    panel.setConnection(null);

    const empty = container.querySelector('.rate-editor__empty') as HTMLElement;
    const form = container.querySelector('.rate-editor__form') as HTMLElement;
    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;

    expect(empty.style.display).toBe('');
    expect(form.style.display).toBe('none');
    expect(input.value).toBe('');
  });

  // ── Test 3: setConnection(info) → form visible + label + rate ────

  it('setConnection(info) should show form, connection label, and populate rate', () => {
    panel.setConnection({
      id: 'conn-1',
      fromId: 'mod-a',
      toId: 'mod-b',
      rate: 3.5,
      fromType: 'source',
      toType: 'stock',
    });

    const empty = container.querySelector('.rate-editor__empty') as HTMLElement;
    const form = container.querySelector('.rate-editor__form') as HTMLElement;
    const label = container.querySelector('.rate-editor__connection-label');
    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;

    expect(empty.style.display).toBe('none');
    expect(form.style.display).toBe('');
    expect(label!.textContent).toContain('→');
    expect(input.value).toBe('3.5');
  });

  // ── Test 4: Enter fires onRateSubmit with numeric value ────────────

  it('should fire onRateSubmit on Enter with valid numeric value', () => {
    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setConnection({
      id: 'conn-1',
      fromId: 'mod-a',
      toId: 'mod-b',
      rate: 1,
      fromType: 'source',
      toType: 'stock',
    });

    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;

    // Change value and press Enter
    typeRateEnter(input, '7');

    expect(onRateSubmit).toHaveBeenCalledTimes(1);
    expect(onRateSubmit).toHaveBeenCalledWith(7);
  });

  // ── Test 5: Empty input on Enter does NOT fire (shows error class) ──

  it('should NOT fire onRateSubmit for empty input (Enter shows error)', () => {
    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setConnection({
      id: 'conn-1',
      fromId: 'mod-a',
      toId: 'mod-b',
      rate: 1,
      fromType: 'source',
      toType: 'stock',
    });

    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;

    // Clear value and press Enter
    typeRateEnter(input, '');

    expect(onRateSubmit).not.toHaveBeenCalled();

    // showError() adds error class synchronously
    expect(input.classList.contains('rate-editor__input--error')).toBe(true);
    // showError() also reverts input value to last valid rate
    expect(input.value).toBe('1');
  });

  // ── Test 6: Non‑numeric input on Enter does NOT fire ──────────────

  it('should NOT fire onRateSubmit for non‑numeric input (Enter shows error)', () => {
    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setConnection({
      id: 'conn-1',
      fromId: 'mod-a',
      toId: 'mod-b',
      rate: 1,
      fromType: 'source',
      toType: 'stock',
    });

    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;

    // Set non‑numeric value and press Enter
    typeRateEnter(input, 'abc');

    expect(onRateSubmit).not.toHaveBeenCalled();

    // showError() adds error class synchronously
    expect(input.classList.contains('rate-editor__input--error')).toBe(true);
    // showError() also reverts input value to last valid rate
    expect(input.value).toBe('1');
  });

  // ── Test 7: setRate updates input value (when not active element) ──

  it('setRate should update input value when input is not focused', () => {
    panel.setConnection({
      id: 'conn-1',
      fromId: 'mod-a',
      toId: 'mod-b',
      rate: 1,
      fromType: 'source',
      toType: 'stock',
    });

    // Ensure input is NOT focused
    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;
    input.blur();

    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setRate(42);

    expect(input.value).toBe('42');
    // setRate should NOT fire onRateSubmit
    expect(onRateSubmit).not.toHaveBeenCalled();
  });

  // ── Test 8: destroy() removes DOM and nullifies onRateSubmit ──────

  it('destroy() should remove panel DOM and nullify onRateSubmit', () => {
    panel.destroy();

    const root = container.querySelector('.rate-editor');
    expect(root).toBeNull();

    // onRateSubmit is explicitly set to null in destroy()
    expect(panel.onRateSubmit).toBeNull();
  });

  // ── Story 6.4 AC4: Negative rate clamping + warning ──────────────

  it('should clamp negative rate to 0 and show warning on Enter (AC4)', () => {
    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setConnection({
      id: 'conn-1',
      fromId: 'mod-a',
      toId: 'mod-b',
      rate: 5,
      fromType: 'source',
      toType: 'stock',
    });

    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;

    // Type negative value and press Enter
    typeRateEnter(input, '-3');

    // Should fire onRateSubmit with 0 (clamped)
    expect(onRateSubmit).toHaveBeenCalledTimes(1);
    expect(onRateSubmit).toHaveBeenCalledWith(0);

    // Input should show 0
    expect(input.value).toBe('0');

    // Warning should be visible
    const warning = container.querySelector('.rate-editor__warning') as HTMLElement;
    expect(warning).not.toBeNull();
    expect(warning.style.display).not.toBe('none');
    const warningText = warning.querySelector('.rate-editor__warning-text');
    expect(warningText!.textContent).toBe('速率不能为负');
  });

  it('should NOT fire onRateSubmit with negative value — fires with 0 instead', () => {
    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setConnection({
      id: 'conn-1',
      fromId: 'mod-a',
      toId: 'mod-b',
      rate: 5,
      fromType: 'source',
      toType: 'stock',
    });

    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;
    typeRateEnter(input, '-10');

    // Should fire with 0, never with the negative value
    expect(onRateSubmit).toHaveBeenCalledWith(0);
    expect(onRateSubmit).not.toHaveBeenCalledWith(-10);
  });

  it('should clear warning when setConnection is called again', () => {
    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setConnection({
      id: 'c1',
      fromId: 'a',
      toId: 'b',
      rate: 5,
      fromType: 'source',
      toType: 'stock',
    });
    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;
    typeRateEnter(input, '-7');

    // Warning should be visible
    let warning = container.querySelector('.rate-editor__warning') as HTMLElement;
    expect(warning.style.display).not.toBe('none');

    // Switch to another connection
    panel.setConnection({
      id: 'c2',
      fromId: 'c',
      toId: 'd',
      rate: 3,
      fromType: 'stock',
      toType: 'sink',
    });

    // Warning should be cleared
    warning = container.querySelector('.rate-editor__warning') as HTMLElement;
    expect(warning.style.display).toBe('none');
  });

  it('should clear warning when setConnection(null) is called', () => {
    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setConnection({
      id: 'c1',
      fromId: 'a',
      toId: 'b',
      rate: 5,
      fromType: 'source',
      toType: 'stock',
    });
    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;
    typeRateEnter(input, '-7');

    // Warning should be visible
    const warning = container.querySelector('.rate-editor__warning') as HTMLElement;
    expect(warning.style.display).not.toBe('none');

    // Deselect connection
    panel.setConnection(null);

    // Warning should be cleared
    expect(warning.style.display).toBe('none');
  });

  it('should clamp negative to 0 even when previous rate was also 0 (AC4 edge case)', () => {
    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setConnection({
      id: 'c1',
      fromId: 'a',
      toId: 'b',
      rate: 0,
      fromType: 'source',
      toType: 'stock',
    });
    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;
    typeRateEnter(input, '-5');

    // Should still fire with 0 (not skip as "unchanged")
    expect(onRateSubmit).toHaveBeenCalledWith(0);

    const warning = container.querySelector('.rate-editor__warning') as HTMLElement;
    expect(warning.style.display).not.toBe('none');
  });

  it('should auto-hide warning after 2 seconds (AC4)', async () => {
    vi.useFakeTimers();
    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setConnection({
      id: 'c1',
      fromId: 'a',
      toId: 'b',
      rate: 5,
      fromType: 'source',
      toType: 'stock',
    });
    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;
    typeRateEnter(input, '-1');

    let warning = container.querySelector('.rate-editor__warning') as HTMLElement;
    expect(warning.style.display).not.toBe('none');

    // Advance past 2000ms
    vi.advanceTimersByTime(2100);

    warning = container.querySelector('.rate-editor__warning') as HTMLElement;
    expect(warning.style.display).toBe('none');

    vi.useRealTimers();
  });

  it('should still show error for non-numeric input (existing AC preserved)', () => {
    const onRateSubmit = vi.fn();
    panel.onRateSubmit = onRateSubmit;

    panel.setConnection({
      id: 'conn-1',
      fromId: 'mod-a',
      toId: 'mod-b',
      rate: 5,
      fromType: 'source',
      toType: 'stock',
    });

    const input = container.querySelector('.rate-editor__input') as HTMLInputElement;

    // Non-numeric input should still show error, not warning
    typeRateEnter(input, 'abc');

    expect(onRateSubmit).not.toHaveBeenCalled();
    expect(input.classList.contains('rate-editor__input--error')).toBe(true);

    // Warning should NOT be visible (error path, not negative path)
    const warning = container.querySelector('.rate-editor__warning') as HTMLElement;
    expect(warning.style.display).toBe('none');
  });
});

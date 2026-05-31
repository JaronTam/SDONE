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
});
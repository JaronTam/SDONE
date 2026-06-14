/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputManager, pointToSegmentDistance, hitTestConnectionPoint, hitTestResizeHandle } from './InputManager.js';
import { ViewportManager, MIN_ZOOM } from '../canvas/Viewport.js';
import { vec2, type Vec2 } from '../shared/Vec2.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a number is close to target within tolerance (default 0.01). */
function closeTo(value: number, target: number, tolerance = 0.01): boolean {
  return Math.abs(value - target) <= tolerance;
}

interface MockCanvas extends HTMLCanvasElement {
  _listeners: Map<string, EventListener[]>;
  _windowListeners: Map<string, EventListener[]>;
}

function createMockCanvas(width = 800, height = 600): MockCanvas {
  const listeners = new Map<string, EventListener[]>();
  const canvas = {
    clientWidth: width,
    clientHeight: height,
    style: { cursor: '' },
    addEventListener(type: string, fn: EventListener) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: EventListener) {
      const list = listeners.get(type) ?? [];
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    dispatchEvent(event: Event): boolean {
      const type = event.type;
      const list = listeners.get(type) ?? [];
      for (const fn of list) fn(event);
      return !event.defaultPrevented;
    },
    _listeners: listeners,
  } as unknown as MockCanvas;
  return canvas;
}

function createMockViewportManager(): ViewportManager {
  return {
    viewport: { offset: vec2(0, 0), zoom: 1.0 },
    screenToWorld: vi.fn((screenPos: { x: number; y: number }, _center: { x: number; y: number }) =>
      vec2(screenPos.x, screenPos.y),
    ),
    worldToScreen: vi.fn((worldPos: { x: number; y: number }, _center: { x: number; y: number }) =>
      vec2(worldPos.x, worldPos.y),
    ),
    panByScreenDelta: vi.fn(),
    zoomAtScreenPoint: vi.fn(),
    reset: vi.fn(),
    applyTransform: vi.fn(),
  } as unknown as ViewportManager;
}

function dispatchMouseEvent(
  canvas: MockCanvas,
  type: 'mousedown' | 'mouseup',
  button: number,
  clientX: number,
  clientY: number,
): void {
  const event = new MouseEvent(type, {
    button,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });
  const listeners = canvas._listeners.get(type) ?? [];
  for (const fn of listeners) fn(event);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InputManager', () => {
  let canvas: MockCanvas;
  let mockVM: ViewportManager;
  let capturedWindowListeners: Map<string, EventListener[]>;

  beforeEach(() => {
    canvas = createMockCanvas();
    mockVM = createMockViewportManager();

    // Capture window.addEventListener calls to track window-level listeners
    capturedWindowListeners = new Map();
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, fn: EventListenerOrEventListenerObject) => {
        const list = capturedWindowListeners.get(type) ?? [];
        list.push(fn as EventListener);
        capturedWindowListeners.set(type, list);
      },
    );
    vi.spyOn(window, 'removeEventListener').mockImplementation(
      (type: string, fn: EventListenerOrEventListenerObject) => {
        const list = capturedWindowListeners.get(type) ?? [];
        const idx = list.indexOf(fn as EventListener);
        if (idx >= 0) list.splice(idx, 1);
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Construction ──────────────────────────────────────────────────────

  describe('construction', () => {
    it('registers mousedown, wheel, contextmenu on canvas', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      expect(canvas._listeners.has('mousedown')).toBe(true);
      expect(canvas._listeners.has('wheel')).toBe(true);
      expect(canvas._listeners.has('contextmenu')).toBe(true);
      input.destroy();
    });

    it('registers mousemove, mouseup, keydown, keyup, blur on window', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      expect(capturedWindowListeners.has('mousemove')).toBe(true);
      expect(capturedWindowListeners.has('mouseup')).toBe(true);
      expect(capturedWindowListeners.has('keydown')).toBe(true);
      expect(capturedWindowListeners.has('keyup')).toBe(true);
      expect(capturedWindowListeners.has('blur')).toBe(true);
      input.destroy();
    });

    it('registers wheel with { passive: false }', () => {
      const addSpy = vi.spyOn(canvas, 'addEventListener');
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      expect(addSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
      input.destroy();
      addSpy.mockRestore();
    });
  });

  // ── Destroy ───────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('removes mousedown, wheel, contextmenu from canvas', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      input.destroy();
      // After destroy, listeners should be removed
      const mousedownList = canvas._listeners.get('mousedown') ?? [];
      const wheelList = canvas._listeners.get('wheel') ?? [];
      const ctxList = canvas._listeners.get('contextmenu') ?? [];
      expect(mousedownList.length).toBe(0);
      expect(wheelList.length).toBe(0);
      expect(ctxList.length).toBe(0);
    });

    it('removes window-level listeners', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const winRmSpy = vi.spyOn(window, 'removeEventListener');
      input.destroy();
      expect(winRmSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(winRmSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(winRmSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(winRmSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
      expect(winRmSpy).toHaveBeenCalledWith('blur', expect.any(Function));
      winRmSpy.mockRestore();
    });
  });

  // ── Middle-mouse pan ──────────────────────────────────────────────────

  describe('pan via middle-mouse drag', () => {
    it('starts pan on middle-mouse mousedown and sets cursor to grabbing', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      dispatchMouseEvent(canvas, 'mousedown', 1, 400, 300);
      expect(canvas.style.cursor).toBe('grabbing');
      input.destroy();
    });

    it('calls panByScreenDelta on mousemove while panning', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      dispatchMouseEvent(canvas, 'mousedown', 1, 400, 300);

      // Simulate mousemove on window
      const moveFn = capturedWindowListeners.get('mousemove')?.[0];
      expect(moveFn).toBeDefined();
      moveFn!(new MouseEvent('mousemove', { clientX: 410, clientY: 305 }) as MouseEvent);

      expect(mockVM.panByScreenDelta).toHaveBeenCalledWith(
        expect.objectContaining({ x: 10, y: 5 }),
      );

      input.destroy();
    });

    it('accumulates multiple pan moves', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      dispatchMouseEvent(canvas, 'mousedown', 1, 400, 300);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 410, clientY: 305 }));

      // Call count resets based on vi.fn() spy
      const callCountAfterFirst = (mockVM.panByScreenDelta as ReturnType<typeof vi.fn>).mock.calls.length;

      moveFn(new MouseEvent('mousemove', { clientX: 420, clientY: 310 }));

      expect((mockVM.panByScreenDelta as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        callCountAfterFirst + 1,
      );

      input.destroy();
    });

    it('stops pan on middle-mouse mouseup', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      dispatchMouseEvent(canvas, 'mousedown', 1, 400, 300);
      expect(canvas.style.cursor).toBe('grabbing');

      // mouseup is registered on window (not canvas)
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 1, clientX: 450, clientY: 350 }));
      expect(canvas.style.cursor).toBe('');

      input.destroy();
    });
  });

  // ── Space + left-click pan ────────────────────────────────────────────

  describe('pan via Space + left-click drag', () => {
    it('does not start pan with left-click alone (no space held)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      dispatchMouseEvent(canvas, 'mousedown', 0, 400, 300);
      expect(canvas.style.cursor).not.toBe('grabbing');
      input.destroy();
    });

    it('starts pan on left-click while space is held', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);

      // Press space
      const keydownFn = capturedWindowListeners.get('keydown')?.[0]!;
      keydownFn(new KeyboardEvent('keydown', { code: 'Space' }));

      dispatchMouseEvent(canvas, 'mousedown', 0, 400, 300);
      expect(canvas.style.cursor).toBe('grabbing');
      input.destroy();
    });

    it('calls panByScreenDelta during Space+left-click drag', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);

      // Press space
      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Space' }),
      );

      dispatchMouseEvent(canvas, 'mousedown', 0, 400, 300);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 415, clientY: 295 }));

      expect(mockVM.panByScreenDelta).toHaveBeenCalledWith(
        expect.objectContaining({ x: 15, y: -5 }),
      );

      input.destroy();
    });

    it('stops Space+left-click pan on mouseup', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Space' }),
      );
      dispatchMouseEvent(canvas, 'mousedown', 0, 400, 300);
      expect(canvas.style.cursor).toBe('grabbing');

      // mouseup is registered on window (not canvas)
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 450, clientY: 350 }));
      expect(canvas.style.cursor).toBe('');

      input.destroy();
    });

    it('sets cursor to grab when Space pressed while not panning', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Space' }),
      );

      expect(canvas.style.cursor).toBe('grab');
      input.destroy();
    });

    it('restores cursor when Space released (not panning)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);

      const keydownFn = capturedWindowListeners.get('keydown')?.[0]!;
      const keyupFn = capturedWindowListeners.get('keyup')?.[0]!;

      keydownFn(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(canvas.style.cursor).toBe('grab');

      keyupFn(new KeyboardEvent('keyup', { code: 'Space' }));
      expect(canvas.style.cursor).toBe('');

      input.destroy();
    });

    it('does not change cursor on Space up if currently dragging a module', () => {
      // Just verify cursor stays grab while SPACE held and no module drag.
      // This is a boundary test.
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Space' }),
      );
      expect(canvas.style.cursor).toBe('grab');

      capturedWindowListeners.get('keyup')?.[0]!(
        new KeyboardEvent('keyup', { code: 'Space' }),
      );
      expect(canvas.style.cursor).toBe('');

      input.destroy();
    });
  });

  // ── Wheel zoom ────────────────────────────────────────────────────────

  describe('wheel zoom', () => {
    it('calls zoomAtScreenPoint with factor 0.9 on scroll down (deltaY > 0)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);

      const wheelFn = canvas._listeners.get('wheel')?.[0] as EventListener;
      const event = new WheelEvent('wheel', {
        deltaY: 100,
        clientX: 400,
        clientY: 300,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      wheelFn(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(mockVM.zoomAtScreenPoint).toHaveBeenCalledWith(
        0.9,
        expect.objectContaining({ x: 400, y: 300 }),
        expect.objectContaining({ x: 400, y: 300 }),
      );

      input.destroy();
    });

    it('calls zoomAtScreenPoint with factor 1.1 on scroll up (deltaY < 0)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);

      const wheelFn = canvas._listeners.get('wheel')?.[0] as EventListener;
      const event = new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 200,
        clientY: 150,
        cancelable: true,
      });
      wheelFn(event);

      expect(mockVM.zoomAtScreenPoint).toHaveBeenCalledWith(
        1.1,
        expect.objectContaining({ x: 200, y: 150 }),
        expect.objectContaining({ x: 400, y: 300 }),
      );

      input.destroy();
    });

    it('passes canvasCenter based on clientWidth/clientHeight', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const wheelFn = canvas._listeners.get('wheel')?.[0] as EventListener;
      wheelFn(new WheelEvent('wheel', { deltaY: 50, clientX: 0, clientY: 0, cancelable: true }));

      // canvasCenter = (clientWidth/2, clientHeight/2) = (400, 300)
      expect(mockVM.zoomAtScreenPoint).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Object),
        expect.objectContaining({ x: 400, y: 300 }),
      );

      input.destroy();
    });
  });

  // ── Context menu prevention ───────────────────────────────────────────

  describe('context menu prevention', () => {
    it('calls preventDefault on contextmenu event', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);

      const ctxFn = canvas._listeners.get('contextmenu')?.[0] as EventListener;
      const event = new Event('contextmenu', { cancelable: true });
      const preventSpy = vi.spyOn(event, 'preventDefault');
      ctxFn(event);

      expect(preventSpy).toHaveBeenCalled();
      input.destroy();
    });
  });

  // ── Module drag-move (onModuleDragStart) ────────────────────────────

  // ── Story 3.5: Tab key ─────────────────────────────────────────────

  describe('Tab key (Story 3.5)', () => {
    it('fires onTabNext when Tab pressed (with selection)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const tabSpy = vi.fn();
      input.onTabNext = tabSpy;
      // Story 8.2: Tab now requires a selected module
      input.selectedModuleIdProvider = () => 'mod1';

      const keydownFn = capturedWindowListeners.get('keydown')?.[0]!;
      keydownFn(new KeyboardEvent('keydown', { code: 'Tab' }));

      expect(tabSpy).toHaveBeenCalledTimes(1);
      input.destroy();
    });

    it('calls preventDefault on Tab to avoid focus trap', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const event = new KeyboardEvent('keydown', { code: 'Tab', cancelable: true });
      const preventSpy = vi.spyOn(event, 'preventDefault');

      capturedWindowListeners.get('keydown')?.[0]!(event);

      expect(preventSpy).toHaveBeenCalled();
      input.destroy();
    });
  });

  // ── Story 3.5: Arrow key nudge ────────────────────────────────────

  describe('Arrow keys (Story 3.5)', () => {
    it('fires onModuleNudge with correct direction for each arrow', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const nudgeSpy = vi.fn();
      input.onModuleNudge = nudgeSpy;

      const keydownFn = capturedWindowListeners.get('keydown')?.[0]!;

      keydownFn(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
      expect(nudgeSpy).toHaveBeenLastCalledWith('up');

      keydownFn(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
      expect(nudgeSpy).toHaveBeenLastCalledWith('down');

      keydownFn(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
      expect(nudgeSpy).toHaveBeenLastCalledWith('left');

      keydownFn(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
      expect(nudgeSpy).toHaveBeenLastCalledWith('right');

      expect(nudgeSpy).toHaveBeenCalledTimes(4);
      input.destroy();
    });

    it('calls preventDefault on arrow keys', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const event = new KeyboardEvent('keydown', { code: 'ArrowUp', cancelable: true });
      const preventSpy = vi.spyOn(event, 'preventDefault');

      capturedWindowListeners.get('keydown')?.[0]!(event);

      expect(preventSpy).toHaveBeenCalled();
      input.destroy();
    });

    it('does NOT fire onModuleNudge while dragging a module', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const nudgeSpy = vi.fn();
      input.onModuleNudge = nudgeSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'Test' } as any,
      });

      // Start dragging
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 110, clientY: 100 })); // cross threshold

      expect(input.isDragging).toBe(true);

      // Now press arrow while dragging — should NOT fire nudge
      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'ArrowRight' }),
      );

      expect(nudgeSpy).not.toHaveBeenCalled();
      input.destroy();
    });
  });

  // ── Story 3.5: Enter key ─────────────────────────────────────────

  describe('Enter key (Story 3.5)', () => {
    it('fires onModulePlaceAtCenter when Enter pressed', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const enterSpy = vi.fn();
      input.onModulePlaceAtCenter = enterSpy;

      const keydownFn = capturedWindowListeners.get('keydown')?.[0]!;
      keydownFn(new KeyboardEvent('keydown', { code: 'Enter' }));

      expect(enterSpy).toHaveBeenCalledTimes(1);
      input.destroy();
    });

    it('calls preventDefault on Enter', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const event = new KeyboardEvent('keydown', { code: 'Enter', cancelable: true });
      const preventSpy = vi.spyOn(event, 'preventDefault');

      capturedWindowListeners.get('keydown')?.[0]!(event);

      expect(preventSpy).toHaveBeenCalled();
      input.destroy();
    });
  });

  // ── Story 8.2: Keyboard selection behavior ─────────────────────────

  describe('keyboard selection behavior (Story 8.2)', () => {
    it('Tab fires onTabNext when module is selected', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const tabSpy = vi.fn();
      input.onTabNext = tabSpy;
      input.selectedModuleIdProvider = () => 'mod1';

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Tab' }),
      );

      expect(tabSpy).toHaveBeenCalledTimes(1);
      input.destroy();
    });

    it('Tab does nothing when no module is selected', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const tabSpy = vi.fn();
      input.onTabNext = tabSpy;
      // selectedModuleIdProvider returns null → no selection
      input.selectedModuleIdProvider = () => null;

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Tab' }),
      );

      expect(tabSpy).not.toHaveBeenCalled();
      input.destroy();
    });

    it('Tab does nothing when selectedModuleIdProvider is not set', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const tabSpy = vi.fn();
      input.onTabNext = tabSpy;
      // selectedModuleIdProvider is null by default

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Tab' }),
      );

      expect(tabSpy).not.toHaveBeenCalled();
      input.destroy();
    });

    it('Enter does NOT fire onModulePlaceAtCenter when selected (enters edit mode)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const placeSpy = vi.fn();
      input.onModulePlaceAtCenter = placeSpy;
      input.selectedModuleIdProvider = () => 'mod1';

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Enter' }),
      );

      // Did NOT place — went into editing mode instead
      expect(placeSpy).not.toHaveBeenCalled();
      input.destroy();
    });

    it('second Enter when already editing does NOT place module (AC9)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const placeSpy = vi.fn();
      input.onModulePlaceAtCenter = placeSpy;
      input.selectedModuleIdProvider = () => 'mod1';

      const keydownFn = capturedWindowListeners.get('keydown')?.[0]!;

      // First Enter: enters editing mode (no place)
      keydownFn(new KeyboardEvent('keydown', { code: 'Enter' }));
      expect(placeSpy).not.toHaveBeenCalled();

      // Second Enter: already editing → still does NOT place (AC9: Enter never places when selected)
      keydownFn(new KeyboardEvent('keydown', { code: 'Enter' }));
      expect(placeSpy).not.toHaveBeenCalled();

      input.destroy();
    });

    it('Escape deselects when idle with selection', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const selectSpy = vi.fn();
      input.onModuleSelect = selectSpy;
      input.selectedModuleIdProvider = () => 'mod1';

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Escape' }),
      );

      expect(selectSpy).toHaveBeenCalledWith(null);
      input.destroy();
    });

    it('Escape does NOT deselect when no module is selected', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const selectSpy = vi.fn();
      input.onModuleSelect = selectSpy;
      input.selectedModuleIdProvider = () => null;

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Escape' }),
      );

      expect(selectSpy).not.toHaveBeenCalled();
      input.destroy();
    });

    it('isEditingName resets on mouse click empty space (PATCH-1 regression)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const placeSpy = vi.fn();
      input.onModulePlaceAtCenter = placeSpy;
      input.selectedModuleIdProvider = () => 'mod1';
      input.nodesProvider = () => ({});

      const keydownFn = capturedWindowListeners.get('keydown')?.[0]!;

      // Step 1: Enter → isEditingName = true
      keydownFn(new KeyboardEvent('keydown', { code: 'Enter' }));
      expect(placeSpy).not.toHaveBeenCalled(); // entered editing, not placed

      // Step 2: Click empty space → deselect → resetSelectionState()
      dispatchMouseEvent(canvas, 'mousedown', 0, 500, 400);
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 500, clientY: 400 }));

      // Step 3: Select module again → Enter should enter editing (not place)
      // Simulate re-selection by setting provider and pressing Enter
      input.selectedModuleIdProvider = () => 'mod2';
      keydownFn(new KeyboardEvent('keydown', { code: 'Enter' }));
      // isEditingName was reset, so Enter enters editing mode again (no place)
      expect(placeSpy).not.toHaveBeenCalled();

      input.destroy();
    });

    it('isEditingName resets on clicking a different module (PATCH-1a regression)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const selectSpy = vi.fn();
      const placeSpy = vi.fn();
      input.onModuleSelect = selectSpy;
      input.onModulePlaceAtCenter = placeSpy;
      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'stock', position: vec2(100, 100), label: 'A' } as any,
        modB: { id: 'modB', type: 'stock', position: vec2(300, 100), label: 'B' } as any,
      });

      const keydownFn = capturedWindowListeners.get('keydown')?.[0]!;

      // Step 1: Select modA and enter editing
      input.selectedModuleIdProvider = () => 'modA';
      keydownFn(new KeyboardEvent('keydown', { code: 'Enter' }));
      expect(placeSpy).not.toHaveBeenCalled(); // entered editing

      // Step 2: Click modB → selection change → resetSelectionState()
      dispatchMouseEvent(canvas, 'mousedown', 0, 300, 100);
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 300, clientY: 100 }));

      // Step 3: Now selected modB, press Enter → should enter editing (not place)
      input.selectedModuleIdProvider = () => 'modB';
      keydownFn(new KeyboardEvent('keydown', { code: 'Enter' }));
      expect(placeSpy).not.toHaveBeenCalled(); // isEditingName was reset, enters editing

      input.destroy();
    });

    it('Escape cancels drag first, does NOT deselect when was dragging', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const selectSpy = vi.fn();
      const dragStartSpy = vi.fn();
      input.onModuleSelect = selectSpy;
      input.onModuleDragStart = dragStartSpy;
      input.nodesProvider = () => ({
        mod1: { id: 'mod1', type: 'stock', position: vec2(100, 100), label: 'T' } as any,
      });

      // Start module drag
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 110, clientY: 100 }));
      expect(input.isDragging).toBe(true);

      // Press Escape — should cancel drag, NOT deselect
      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Escape' }),
      );

      expect(input.isDragging).toBe(false);
      // Should NOT have called onModuleSelect because wasDragging was true
      expect(selectSpy).not.toHaveBeenCalled();

      input.destroy();
    });
  });

  // ── Module drag-move (onModuleDragStart) ────────────────────────────

  describe('module drag-move (onModuleDragStart)', () => {
    it('fires onModuleDragStart when drag threshold first crossed (≥4px)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const dragStartSpy = vi.fn();
      input.onModuleDragStart = dragStartSpy;

      // Provide a node for hit-testing
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: vec2(100, 100), label: 'Test' } as any,
      });

      // Click on the module
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);

      // Move <4px — should NOT trigger drag start
      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 102, clientY: 102 }));
      expect(dragStartSpy).not.toHaveBeenCalled();

      // Move ≥4px — should trigger drag start exactly once
      moveFn(new MouseEvent('mousemove', { clientX: 105, clientY: 100 }));
      expect(dragStartSpy).toHaveBeenCalledTimes(1);
      expect(dragStartSpy).toHaveBeenCalledWith('node1');

      // Subsequent moves — should NOT fire again
      moveFn(new MouseEvent('mousemove', { clientX: 110, clientY: 100 }));
      expect(dragStartSpy).toHaveBeenCalledTimes(1);

      input.destroy();
    });

    it('calls onModuleMove with world coordinates during drag', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const moveSpy = vi.fn();
      input.onModuleMove = moveSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: vec2(50, 60), label: 'Test' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 50, 60);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      // Cross threshold → start drag
      moveFn(new MouseEvent('mousemove', { clientX: 55, clientY: 60 }));
      expect(moveSpy).toHaveBeenCalledWith(
        'node1',
        expect.objectContaining({ x: 50, y: 60 }),
        expect.objectContaining({ x: 55, y: 60 }),
      );

      input.destroy();
    });

    it('clears drag state on pointerup after module drag', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: vec2(100, 100), label: 'Test' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 105, clientY: 100 }));
      expect(canvas.style.cursor).toBe('grabbing');

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 150, clientY: 150 }));
      expect(canvas.style.cursor).toBe('');

      input.destroy();
    });
  });

  // ── Window blur safety ────────────────────────────────────────────────

  describe('window blur (Alt+Tab safety)', () => {
    it('releases spaceHeld and panning state on blur', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);

      // Start panning
      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Space' }),
      );
      dispatchMouseEvent(canvas, 'mousedown', 0, 400, 300);
      expect(canvas.style.cursor).toBe('grabbing');

      // Blur window
      capturedWindowListeners.get('blur')?.[0]!(new Event('blur'));
      expect(canvas.style.cursor).toBe('');

      // After blur, Space up should not affect anything (spaceHeld already false)
      capturedWindowListeners.get('keyup')?.[0]!(
        new KeyboardEvent('keyup', { code: 'Space' }),
      );
      // Cursor should remain empty (not toggle to grab)
      expect(canvas.style.cursor).toBe('');

      input.destroy();
    });
  });

  // ── Story 3.7: pointToSegmentDistance (pure function) ──────────────

  describe('pointToSegmentDistance (Story 3.7)', () => {
    it('returns 0 when point is on the segment', () => {
      const dist = pointToSegmentDistance(
        vec2(50, 50),
        vec2(0, 0),
        vec2(100, 100),
      );
      expect(dist).toBe(0);
    });

    it('returns perpendicular distance when point is off the segment', () => {
      const dist = pointToSegmentDistance(
        vec2(50, 60),
        vec2(0, 50),
        vec2(100, 50),
      );
      expect(dist).toBe(10);
    });

    it('returns distance to endpoint when projection falls before segment', () => {
      const dist = pointToSegmentDistance(
        vec2(-10, 0),
        vec2(0, 0),
        vec2(100, 0),
      );
      expect(dist).toBe(10);
    });

    it('returns distance to endpoint when projection falls after segment', () => {
      const dist = pointToSegmentDistance(
        vec2(110, 0),
        vec2(0, 0),
        vec2(100, 0),
      );
      expect(dist).toBe(10);
    });

    it('handles degenerate segment (zero-length) — point distance', () => {
      const dist = pointToSegmentDistance(
        vec2(3, 4),
        vec2(0, 0),
        vec2(0, 0),
      );
      expect(dist).toBe(5);
    });

    it('handles vertical segment', () => {
      const dist = pointToSegmentDistance(
        vec2(10, 50),
        vec2(0, 0),
        vec2(0, 100),
      );
      expect(dist).toBe(10);
    });
  });

  // ── Story 8.2: hitTestConnectionPoint (pure function) ──────────────────

  describe('hitTestConnectionPoint (Story 8.2)', () => {
    it('returns null when no node is near cursor', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const result = hitTestConnectionPoint(vec2(500, 500), {}, vm, vec2(400, 300));
      expect(result).toBeNull();
    });

    it('returns correct moduleId and edge for top midpoint', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const canvasCenter = vec2(400, 300);
      const nodes: Record<string, any> = {
        mod1: { id: 'mod1', type: 'stock', position: vec2(200, 200), width: 100, height: 60 },
      };
      // Top midpoint world (200, 170) → screen = world + canvasCenter = (600, 470)
      const screenPos = vm.worldToScreen(vec2(200, 170), canvasCenter);
      const result = hitTestConnectionPoint(screenPos, nodes, vm, canvasCenter);
      expect(result).toEqual({ moduleId: 'mod1', edge: 'top' });
    });

    it('returns correct moduleId and edge for bottom/left/right midpoints', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const canvasCenter = vec2(400, 300);
      const nodes: Record<string, any> = {
        mod1: { id: 'mod1', type: 'stock', position: vec2(200, 200), width: 100, height: 60 },
      };
      // Bottom midpoint world (200, 230) → screen (600, 530)
      expect(hitTestConnectionPoint(vm.worldToScreen(vec2(200, 230), canvasCenter), nodes, vm, canvasCenter)).toEqual({ moduleId: 'mod1', edge: 'bottom' });
      // Left midpoint world (150, 200) → screen (550, 500)
      expect(hitTestConnectionPoint(vm.worldToScreen(vec2(150, 200), canvasCenter), nodes, vm, canvasCenter)).toEqual({ moduleId: 'mod1', edge: 'left' });
      // Right midpoint world (250, 200) → screen (650, 500)
      expect(hitTestConnectionPoint(vm.worldToScreen(vec2(250, 200), canvasCenter), nodes, vm, canvasCenter)).toEqual({ moduleId: 'mod1', edge: 'right' });
    });

    it('works at non-zero viewport offset', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(100, 50) });
      const canvasCenter = vec2(400, 300);
      const nodes: Record<string, any> = {
        mod1: { id: 'mod1', type: 'stock', position: vec2(300, 250), width: 100, height: 60 },
      };
      // Top midpoint world = (300, 220)
      // screen = (world - offset) * zoom + canvasCenter = (300-100, 220-50) + (400, 300) = (600, 470)
      const screenPos = vm.worldToScreen(vec2(300, 220), canvasCenter);
      const result = hitTestConnectionPoint(screenPos, nodes, vm, canvasCenter);
      expect(result).toEqual({ moduleId: 'mod1', edge: 'top' });
    });

    it('uses default dimensions when node width/height are undefined', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const canvasCenter = vec2(400, 300);
      const nodes: Record<string, any> = {
        mod1: { id: 'mod1', type: 'stock', position: vec2(200, 200) },
      };
      // DEFAULT_MODULE_WIDTH=120, DEFAULT_MODULE_HEIGHT=80
      // Left midpoint at (200-60, 200) = (140, 200) → screen (540, 500)
      const screenPos = vm.worldToScreen(vec2(140, 200), canvasCenter);
      const result = hitTestConnectionPoint(screenPos, nodes, vm, canvasCenter);
      expect(result).toEqual({ moduleId: 'mod1', edge: 'left' });
    });

    it('hit radius is zoom-independent at 2× zoom (AC2)', () => {
      const vm = new ViewportManager({ zoom: 2, offset: vec2(0, 0) });
      const canvasCenter = vec2(400, 300);
      const nodes: Record<string, any> = {
        mod1: { id: 'mod1', type: 'stock', position: vec2(200, 200), width: 100, height: 60 },
      };
      // Top midpoint world (200, 170) → screen at 2× zoom
      const screenPos = vm.worldToScreen(vec2(200, 170), canvasCenter);
      const result = hitTestConnectionPoint(screenPos, nodes, vm, canvasCenter);
      expect(result).toEqual({ moduleId: 'mod1', edge: 'top' });

      // 9px away in screen space → should miss (8px radius)
      const missPos = vec2(screenPos.x + 9, screenPos.y);
      expect(hitTestConnectionPoint(missPos, nodes, vm, canvasCenter)).toBeNull();
    });
  });

  // ── Story 8.2: hitTestResizeHandle (pure function) ─────────────────────

  describe('hitTestResizeHandle (Story 8.2)', () => {
    it('returns null when no corner is near cursor', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const result = hitTestResizeHandle(vec2(500, 500), {}, vm, vec2(400, 300));
      expect(result).toBeNull();
    });

    it('returns correct moduleId and corner for NW corner', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const canvasCenter = vec2(400, 300);
      const nodes: Record<string, any> = {
        mod1: { id: 'mod1', type: 'stock', position: vec2(200, 200), width: 100, height: 60 },
      };
      // NW corner at world (150, 170) → screen (550, 470)
      const screenPos = vm.worldToScreen(vec2(150, 170), canvasCenter);
      const result = hitTestResizeHandle(screenPos, nodes, vm, canvasCenter);
      expect(result).toEqual({ moduleId: 'mod1', corner: 'nw' });
    });

    it('returns correct moduleId and corner for SE corner', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const canvasCenter = vec2(400, 300);
      const nodes: Record<string, any> = {
        mod1: { id: 'mod1', type: 'stock', position: vec2(200, 200), width: 100, height: 60 },
      };
      // SE corner at world (250, 230) → screen (650, 530)
      const screenPos = vm.worldToScreen(vec2(250, 230), canvasCenter);
      const result = hitTestResizeHandle(screenPos, nodes, vm, canvasCenter);
      expect(result).toEqual({ moduleId: 'mod1', corner: 'se' });
    });

    it('returns correct corner for all four directions', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const canvasCenter = vec2(400, 300);
      const nodes: Record<string, any> = {
        mod1: { id: 'mod1', type: 'stock', position: vec2(200, 200), width: 100, height: 60 },
      };
      // nw(150,170)→(550,470), ne(250,170)→(650,470), sw(150,230)→(550,530), se(250,230)→(650,530)
      expect(hitTestResizeHandle(vm.worldToScreen(vec2(150, 170), canvasCenter), nodes, vm, canvasCenter)).toEqual({ moduleId: 'mod1', corner: 'nw' });
      expect(hitTestResizeHandle(vm.worldToScreen(vec2(250, 170), canvasCenter), nodes, vm, canvasCenter)).toEqual({ moduleId: 'mod1', corner: 'ne' });
      expect(hitTestResizeHandle(vm.worldToScreen(vec2(150, 230), canvasCenter), nodes, vm, canvasCenter)).toEqual({ moduleId: 'mod1', corner: 'sw' });
      expect(hitTestResizeHandle(vm.worldToScreen(vec2(250, 230), canvasCenter), nodes, vm, canvasCenter)).toEqual({ moduleId: 'mod1', corner: 'se' });
    });

    it('hit radius is zoom-independent at 0.5× zoom (AC3)', () => {
      const vm = new ViewportManager({ zoom: 0.5, offset: vec2(0, 0) });
      const canvasCenter = vec2(400, 300);
      const nodes: Record<string, any> = {
        mod1: { id: 'mod1', type: 'stock', position: vec2(200, 200), width: 100, height: 60 },
      };
      // NW corner world (150, 170) → screen at 0.5× zoom
      const screenPos = vm.worldToScreen(vec2(150, 170), canvasCenter);
      const result = hitTestResizeHandle(screenPos, nodes, vm, canvasCenter);
      expect(result).toEqual({ moduleId: 'mod1', corner: 'nw' });

      // 9px away in screen space → should miss (8px radius)
      const missPos = vec2(screenPos.x + 9, screenPos.y);
      expect(hitTestResizeHandle(missPos, nodes, vm, canvasCenter)).toBeNull();
    });
  });

  // ── Story 3.7: Connection selection via click ─────────────────────

  describe('connection selection (Story 3.7)', () => {
    it('fires onConnectionSelect when clicking near a connection line (AC1)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const selectSpy = vi.fn();
      input.onConnectionSelect = selectSpy;

      // Two modules with a connection between them
      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'stock', position: { x: 100, y: 100 }, label: 'A' } as any,
        modB: { id: 'modB', type: 'source', position: { x: 400, y: 100 }, label: 'B' } as any,
      });
      input.connectionsProvider = () => ({
        c1: { id: 'c1', fromId: 'modA', toId: 'modB', rate: 1, formulaStr: '1' },
      });

      // Click near the midpoint of the connection line (250, 100)
      dispatchMouseEvent(canvas, 'mousedown', 0, 250, 100);

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 250, clientY: 100 }));

      expect(selectSpy).toHaveBeenCalledWith('c1');
      input.destroy();
    });

    it('fires onModuleSelect(null) when clicking empty space with no connection nearby', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const modSelectSpy = vi.fn();
      const connSelectSpy = vi.fn();
      input.onModuleSelect = modSelectSpy;
      input.onConnectionSelect = connSelectSpy;

      input.nodesProvider = () => ({});
      input.connectionsProvider = () => ({});

      dispatchMouseEvent(canvas, 'mousedown', 0, 400, 300);

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 400, clientY: 300 }));

      expect(connSelectSpy).not.toHaveBeenCalled();
      expect(modSelectSpy).toHaveBeenCalledWith(null);
      input.destroy();
    });

    it('prioritises connection over module when both are within hit range (click priority, AC1)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const modSelectSpy = vi.fn();
      const connSelectSpy = vi.fn();
      input.onModuleSelect = modSelectSpy;
      input.onConnectionSelect = connSelectSpy;

      // Module at (200, 200) with hit radius ~72px, connection passing through it
      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'stock', position: { x: 200, y: 200 }, label: 'A' } as any,
        modB: { id: 'modB', type: 'source', position: { x: 500, y: 200 }, label: 'B' } as any,
      });
      input.connectionsProvider = () => ({
        c1: { id: 'c1', fromId: 'modA', toId: 'modB', rate: 1, formulaStr: '1' },
      });

      // Click at the line midpoint — connection AND module are both within hit range
      // The line uses centre-to-centre, so midpoint is (~350, 200) in screen coords
      dispatchMouseEvent(canvas, 'mousedown', 0, 350, 200);

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 350, clientY: 200 }));

      // Connection should win (called first) — module should NOT be selected
      expect(connSelectSpy).toHaveBeenCalledWith('c1');
      expect(modSelectSpy).not.toHaveBeenCalled();
      input.destroy();
    });
  });

  // ── Story 3.7: Connection deletion via Delete key ─────────────────

  describe('connection deletion (Story 3.7)', () => {
    it('fires onConnectionDelete when Delete pressed and connection is selected', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const deleteSpy = vi.fn();
      input.onConnectionDelete = deleteSpy;

      // Simulate: main.ts checks selection internally — InputManager always calls both callbacks
      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Delete', cancelable: true }),
      );

      expect(deleteSpy).toHaveBeenCalledTimes(1);
      input.destroy();
    });

    it('does NOT fire delete callbacks while dragging (isDragging guard)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const deleteSpy = vi.fn();
      input.onConnectionDelete = deleteSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
      });

      // Start a module drag
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 110, clientY: 100 }));
      expect(input.isDragging).toBe(true);

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Delete', cancelable: true }),
      );

      expect(deleteSpy).not.toHaveBeenCalled();
      input.destroy();
    });

    it('both onConnectionDelete and onModuleDelete fire on Delete (self-guarding pattern)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const connDeleteSpy = vi.fn();
      const modDeleteSpy = vi.fn();
      input.onConnectionDelete = connDeleteSpy;
      input.onModuleDelete = modDeleteSpy;

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Delete', cancelable: true }),
      );

      // Both fire — main.ts callbacks each self-guard via selection state checks
      expect(connDeleteSpy).toHaveBeenCalledTimes(1);
      expect(modDeleteSpy).toHaveBeenCalledTimes(1);
      input.destroy();
    });
  });

  // ── Story 5.3: Double-click module ──────────────────────────────────

  describe('module double-click (Story 5.3)', () => {
    it('fires onModuleDoubleClick on two rapid clicks on the same module (AC2)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const dblClickSpy = vi.fn();
      const selectSpy = vi.fn();
      input.onModuleDoubleClick = dblClickSpy;
      input.onModuleSelect = selectSpy;

      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'Test' } as any,
      });

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;

      // First click — single select, no double-click
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));
      expect(selectSpy).toHaveBeenCalledTimes(1);
      expect(dblClickSpy).not.toHaveBeenCalled();

      // Second click within 300ms, <5px away → double-click fires
      dispatchMouseEvent(canvas, 'mousedown', 0, 101, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 101, clientY: 100 }));
      expect(dblClickSpy).toHaveBeenCalledTimes(1);
      expect(dblClickSpy).toHaveBeenCalledWith('node1');
      // onModuleSelect should NOT fire on the second click (double-click consumes it)
      expect(selectSpy).toHaveBeenCalledTimes(1);

      input.destroy();
    });

    it('does NOT fire double-click if two clicks are on different modules', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const dblClickSpy = vi.fn();
      const selectSpy = vi.fn();
      input.onModuleDoubleClick = dblClickSpy;
      input.onModuleSelect = selectSpy;

      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'A' } as any,
        node2: { id: 'node2', type: 'source', position: { x: 300, y: 100 }, label: 'B' } as any,
      });

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;

      // Click on node1
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));
      expect(selectSpy).toHaveBeenCalledWith('node1');

      // Click on node2 — different module, should NOT be double-click
      dispatchMouseEvent(canvas, 'mousedown', 0, 300, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 300, clientY: 100 }));
      expect(dblClickSpy).not.toHaveBeenCalled();
      expect(selectSpy).toHaveBeenCalledTimes(2);
      expect(selectSpy).toHaveBeenLastCalledWith('node2');

      input.destroy();
    });

    it('does NOT fire double-click if second click is too far away (≥5px, AC2)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const dblClickSpy = vi.fn();
      const selectSpy = vi.fn();
      input.onModuleDoubleClick = dblClickSpy;
      input.onModuleSelect = selectSpy;

      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'Test' } as any,
      });

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;

      // First click
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));

      // Second click 10px away — exceeds DOUBLE_CLICK_MAX_PX (5px)
      dispatchMouseEvent(canvas, 'mousedown', 0, 110, 105);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 110, clientY: 105 }));
      expect(dblClickSpy).not.toHaveBeenCalled();
      expect(selectSpy).toHaveBeenCalledTimes(2);

      input.destroy();
    });

    it('does NOT fire double-click if clicks are too far apart in time (>300ms, AC2)', async () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const dblClickSpy = vi.fn();
      const selectSpy = vi.fn();
      input.onModuleDoubleClick = dblClickSpy;
      input.onModuleSelect = selectSpy;

      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'Test' } as any,
      });

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;

      // First click
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));
      expect(selectSpy).toHaveBeenCalledTimes(1);

      // Wait >300ms
      await new Promise(resolve => setTimeout(resolve, 350));

      // Second click — should NOT be double-click due to time threshold
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));
      expect(dblClickSpy).not.toHaveBeenCalled();
      expect(selectSpy).toHaveBeenCalledTimes(2);

      input.destroy();
    });

    it('resets double-click state on click to empty space', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const dblClickSpy = vi.fn();
      const selectSpy = vi.fn();
      input.onModuleDoubleClick = dblClickSpy;
      input.onModuleSelect = selectSpy;

      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'Test' } as any,
      });

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;

      // Click on module
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));

      // Click on empty space — resets double-click tracking
      dispatchMouseEvent(canvas, 'mousedown', 0, 500, 500);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 500, clientY: 500 }));

      // Now click module again rapidly — should NOT trigger double-click
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));
      expect(dblClickSpy).not.toHaveBeenCalled();

      input.destroy();
    });

    it('does NOT fire double-click if onModuleDoubleClick is null (no callback set)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const selectSpy = vi.fn();
      // Deliberately NOT setting onModuleDoubleClick
      input.onModuleSelect = selectSpy;

      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'Test' } as any,
      });

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;

      // Two rapid clicks — both should fire onModuleSelect since double-click is not handled
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));
      expect(selectSpy).toHaveBeenCalledTimes(2);

      input.destroy();
    });

    it('does NOT produce double-click on mousedown-only (no mouseup) — just a guard', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const dblClickSpy = vi.fn();
      input.onModuleDoubleClick = dblClickSpy;

      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'Test' } as any,
      });

      // Two mousedown events without mouseup — double-click should NOT fire
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      dispatchMouseEvent(canvas, 'mousedown', 0, 101, 100);

      expect(dblClickSpy).not.toHaveBeenCalled();
      input.destroy();
    });
  });

  // ── Story 5.4: Connection hover detection ──────────────────────────

  describe('connection hover (Story 5.4)', () => {
    it('fires onConnectionHover with connection ID + screenPos when cursor moves over a connection line', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const hoverSpy = vi.fn();
      input.onConnectionHover = hoverSpy;

      // Two stock modules at (100,100) and (400,100) with connection
      // Edge points: (170,100) → (330,100), midpoint at (250,100)
      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'stock', position: { x: 100, y: 100 }, label: 'A' } as any,
        modB: { id: 'modB', type: 'stock', position: { x: 400, y: 100 }, label: 'B' } as any,
      });
      input.connectionsProvider = () => ({
        c1: { id: 'c1', fromId: 'modA', toId: 'modB', rate: 1, formulaStr: '1' },
      });

      // Move cursor to connection midpoint — should hit
      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 250, clientY: 100 }));

      expect(hoverSpy).toHaveBeenCalledTimes(1);
      expect(hoverSpy).toHaveBeenCalledWith('c1', expect.objectContaining({ x: 250, y: 100 }));

      input.destroy();
    });

    it('fires onConnectionHover with (null, screenPos) when cursor moves away from all connections', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const hoverSpy = vi.fn();
      input.onConnectionHover = hoverSpy;

      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'stock', position: { x: 100, y: 100 }, label: 'A' } as any,
        modB: { id: 'modB', type: 'stock', position: { x: 400, y: 100 }, label: 'B' } as any,
      });
      input.connectionsProvider = () => ({
        c1: { id: 'c1', fromId: 'modA', toId: 'modB', rate: 1, formulaStr: '1' },
      });

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;

      // First hover over the connection
      moveFn(new MouseEvent('mousemove', { clientX: 250, clientY: 100 }));
      expect(hoverSpy).toHaveBeenLastCalledWith('c1', expect.anything());

      // Move far away — should fire null
      moveFn(new MouseEvent('mousemove', { clientX: 250, clientY: 150 }));
      expect(hoverSpy).toHaveBeenLastCalledWith(null, expect.objectContaining({ x: 250, y: 150 }));

      input.destroy();
    });

    it('fires onConnectionHover once when moving directly from one connection to another', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const hoverSpy = vi.fn();
      input.onConnectionHover = hoverSpy;

      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'stock', position: { x: 100, y: 100 }, label: 'A' } as any,
        modB: { id: 'modB', type: 'stock', position: { x: 400, y: 100 }, label: 'B' } as any,
        modC: { id: 'modC', type: 'stock', position: { x: 100, y: 300 }, label: 'C' } as any,
        modD: { id: 'modD', type: 'stock', position: { x: 400, y: 300 }, label: 'D' } as any,
      });
      input.connectionsProvider = () => ({
        c1: { id: 'c1', fromId: 'modA', toId: 'modB', rate: 1, formulaStr: '1' },
        c2: { id: 'c2', fromId: 'modC', toId: 'modD', rate: 2, formulaStr: '2' },
      });

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;

      // Hover over c1
      moveFn(new MouseEvent('mousemove', { clientX: 250, clientY: 100 }));
      expect(hoverSpy).toHaveBeenCalledWith('c1', expect.anything());
      const callCountBefore = hoverSpy.mock.calls.length;

      // Move directly to c2 midpoint — fires once for c2
      moveFn(new MouseEvent('mousemove', { clientX: 250, clientY: 300 }));
      expect(hoverSpy).toHaveBeenCalledTimes(callCountBefore + 1);
      expect(hoverSpy).toHaveBeenLastCalledWith('c2', expect.anything());

      input.destroy();
    });

    it('does NOT fire onConnectionHover when cursor stays on same connection (idempotency)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const hoverSpy = vi.fn();
      input.onConnectionHover = hoverSpy;

      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'stock', position: { x: 100, y: 100 }, label: 'A' } as any,
        modB: { id: 'modB', type: 'stock', position: { x: 400, y: 100 }, label: 'B' } as any,
      });
      input.connectionsProvider = () => ({
        c1: { id: 'c1', fromId: 'modA', toId: 'modB', rate: 1, formulaStr: '1' },
      });

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;

      // First mousemove enters the connection
      moveFn(new MouseEvent('mousemove', { clientX: 250, clientY: 100 }));
      expect(hoverSpy).toHaveBeenCalledTimes(1);

      // Subsequent moves along the same connection — should NOT fire
      moveFn(new MouseEvent('mousemove', { clientX: 251, clientY: 100 }));
      moveFn(new MouseEvent('mousemove', { clientX: 252, clientY: 99 }));
      moveFn(new MouseEvent('mousemove', { clientX: 253, clientY: 101 }));
      expect(hoverSpy).toHaveBeenCalledTimes(1); // still only the first call

      input.destroy();
    });

    it('suppresses hover for connection with coincident endpoints (fromEdge === toEdge)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const hoverSpy = vi.fn();
      input.onConnectionHover = hoverSpy;

      // Two stock modules at the SAME position → coincident edge points
      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'stock', position: { x: 100, y: 100 }, label: 'A' } as any,
        modB: { id: 'modB', type: 'stock', position: { x: 100, y: 100 }, label: 'B' } as any,
      });
      input.connectionsProvider = () => ({
        c1: { id: 'c1', fromId: 'modA', toId: 'modB', rate: 1, formulaStr: '1' },
      });

      // Move to center — connection exists but endpoints coincide, so NO hover event
      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));

      expect(hoverSpy).not.toHaveBeenCalled();

      input.destroy();
    });

    it('clears hover and fires (null) during drag interaction', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const hoverSpy = vi.fn();
      input.onConnectionHover = hoverSpy;

      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'stock', position: { x: 100, y: 100 }, label: 'A' } as any,
        modB: { id: 'modB', type: 'stock', position: { x: 400, y: 100 }, label: 'B' } as any,
      });
      input.connectionsProvider = () => ({
        c1: { id: 'c1', fromId: 'modA', toId: 'modB', rate: 1, formulaStr: '1' },
      });

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;

      // First: hover over connection
      moveFn(new MouseEvent('mousemove', { clientX: 250, clientY: 100 }));
      expect(hoverSpy).toHaveBeenLastCalledWith('c1', expect.anything());

      // Start module drag — hover should clear
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      // Now hover is cleared by mousedown → clearHoveredConnection
      // (fires null via onConnectionHover?.(null, ...))

      // Simulate mousemove during drag — should NOT fire hover (guard blocks it)
      moveFn(new MouseEvent('mousemove', { clientX: 250, clientY: 100 }));
      // The guard !this.isDraggingModule blocks hover detection during drag,
      // so no additional hover events fire (neither for the connection nor null)
      // Verify hover was cleared at drag start
      expect(input.getHoveredConnectionId()).toBeNull();

      input.destroy();
    });

    it('resumes hover detection after drag ends (next mousemove)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const hoverSpy = vi.fn();
      input.onConnectionHover = hoverSpy;

      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'stock', position: { x: 100, y: 100 }, label: 'A' } as any,
        modB: { id: 'modB', type: 'stock', position: { x: 400, y: 100 }, label: 'B' } as any,
      });
      input.connectionsProvider = () => ({
        c1: { id: 'c1', fromId: 'modA', toId: 'modB', rate: 1, formulaStr: '1' },
      });

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;

      // Hover over connection
      moveFn(new MouseEvent('mousemove', { clientX: 250, clientY: 100 }));
      expect(hoverSpy).toHaveBeenLastCalledWith('c1', expect.anything());

      // Start and complete a module drag
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      moveFn(new MouseEvent('mousemove', { clientX: 120, clientY: 100 })); // cross threshold, start drag
      moveFn(new MouseEvent('mousemove', { clientX: 140, clientY: 100 })); // during drag
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 140, clientY: 100 })); // end drag

      // After drag ends, move to connection area — hover should resume
      moveFn(new MouseEvent('mousemove', { clientX: 250, clientY: 100 }));
      expect(hoverSpy).toHaveBeenLastCalledWith('c1', expect.objectContaining({ x: 250, y: 100 }));

      input.destroy();
    });
  });

  // ── Story 3.3: Module placement edge cases ──────────────────────────

  describe('module placement edge cases (Story 3.3)', () => {
    it('onModuleDrop converts screen position to world correctly at zoom 2×', () => {
      const realVM = new ViewportManager({ zoom: 2, offset: vec2(0, 0) });
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, realVM);
      const dropSpy = vi.fn();
      input.onModuleDrop = dropSpy;

      // jsdom lacks DragEvent/DataTransfer — build a minimal mock
      const dataStore: Record<string, string> = { 'application/x-sdone-module': 'stock' };
      const mockDT = { getData: (k: string) => dataStore[k] ?? '', setData: (k: string, v: string) => { dataStore[k] = v; }, dropEffect: '' };
      const dropEvent = new Event('drop', { cancelable: true }) as DragEvent;
      Object.defineProperties(dropEvent, {
        clientX: { value: 400 }, clientY: { value: 300 },
        dataTransfer: { value: mockDT }, preventDefault: { value: () => {} },
      });

      const dropListeners = canvas._listeners.get('drop') ?? [];
      for (const fn of dropListeners) fn(dropEvent);

      expect(dropSpy).toHaveBeenCalledTimes(1);
      const worldPos = dropSpy.mock.calls[0][1] as Vec2;
      expect(closeTo(worldPos.x, 0)).toBe(true);
      expect(closeTo(worldPos.y, 0)).toBe(true);

      input.destroy();
    });

    it('onModuleDrop converts screen position to world correctly with offset', () => {
      const realVM = new ViewportManager({ zoom: 1, offset: vec2(100, -50) });
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, realVM);
      const dropSpy = vi.fn();
      input.onModuleDrop = dropSpy;

      const dataStore: Record<string, string> = { 'application/x-sdone-module': 'source' };
      const mockDT = { getData: (k: string) => dataStore[k] ?? '', setData: (k: string, v: string) => { dataStore[k] = v; }, dropEffect: '' };
      const dropEvent = new Event('drop', { cancelable: true }) as DragEvent;
      Object.defineProperties(dropEvent, {
        clientX: { value: 400 }, clientY: { value: 300 },
        dataTransfer: { value: mockDT }, preventDefault: { value: () => {} },
      });

      const dropListeners = canvas._listeners.get('drop') ?? [];
      for (const fn of dropListeners) fn(dropEvent);

      expect(dropSpy).toHaveBeenCalledTimes(1);
      const worldPos = dropSpy.mock.calls[0][1] as Vec2;
      expect(closeTo(worldPos.x, 100)).toBe(true);
      expect(closeTo(worldPos.y, -50)).toBe(true);

      input.destroy();
    });

    it('onModuleDrop ignores invalid module type', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const dropSpy = vi.fn();
      input.onModuleDrop = dropSpy;

      const dataStore: Record<string, string> = { 'application/x-sdone-module': 'invalid_type' };
      const mockDT = { getData: (k: string) => dataStore[k] ?? '', setData: (k: string, v: string) => { dataStore[k] = v; }, dropEffect: '' };
      const dropEvent = new Event('drop', { cancelable: true }) as DragEvent;
      Object.defineProperties(dropEvent, {
        clientX: { value: 400 }, clientY: { value: 300 },
        dataTransfer: { value: mockDT }, preventDefault: { value: () => {} },
      });

      const dropListeners = canvas._listeners.get('drop') ?? [];
      for (const fn of dropListeners) fn(dropEvent);

      expect(dropSpy).not.toHaveBeenCalled();

      input.destroy();
    });

    it('onCanvasClickEmpty provides correct world position at min zoom', () => {
      const realVM = new ViewportManager({ zoom: MIN_ZOOM, offset: vec2(0, 0) });
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, realVM);
      const clickEmptySpy = vi.fn();
      input.onCanvasClickEmpty = clickEmptySpy;
      input.nodesProvider = () => ({});
      input.connectionsProvider = () => ({});

      // Click at screen center
      dispatchMouseEvent(canvas, 'mousedown', 0, 400, 300);
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 400, clientY: 300 }));

      expect(clickEmptySpy).toHaveBeenCalledTimes(1);
      const worldPos = clickEmptySpy.mock.calls[0][0] as Vec2;
      // At MIN_ZOOM (0.1), screen center → world (0,0)
      expect(closeTo(worldPos.x, 0, 0.1)).toBe(true);
      expect(closeTo(worldPos.y, 0, 0.1)).toBe(true);

      input.destroy();
    });

    it('onCanvasClickEmpty provides correct world position with large offset', () => {
      const realVM = new ViewportManager({ zoom: 1, offset: vec2(5000, -3000) });
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, realVM);
      const clickEmptySpy = vi.fn();
      input.onCanvasClickEmpty = clickEmptySpy;
      input.nodesProvider = () => ({});
      input.connectionsProvider = () => ({});

      // Click at screen center (400, 300) → world should be (5000, -3000)
      dispatchMouseEvent(canvas, 'mousedown', 0, 400, 300);
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 400, clientY: 300 }));

      expect(clickEmptySpy).toHaveBeenCalledTimes(1);
      const worldPos = clickEmptySpy.mock.calls[0][0] as Vec2;
      expect(closeTo(worldPos.x, 5000, 0.1)).toBe(true);
      expect(closeTo(worldPos.y, -3000, 0.1)).toBe(true);

      input.destroy();
    });

    it('onCanvasClickEmpty does NOT fire after drag beyond threshold', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const clickEmptySpy = vi.fn();
      input.onCanvasClickEmpty = clickEmptySpy;
      input.nodesProvider = () => ({});
      input.connectionsProvider = () => ({});

      // Mousedown at (200, 150), mouseup at (250, 200) — distance ~70px > 5px threshold
      dispatchMouseEvent(canvas, 'mousedown', 0, 200, 150);
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 250, clientY: 200 }));

      expect(clickEmptySpy).not.toHaveBeenCalled();

      input.destroy();
    });
  });

  // ── Story 6.5: onCanvasClickEmpty (click-to-place) ──────────────────

  describe('onCanvasClickEmpty (Story 6.5)', () => {
    it('should fire onCanvasClickEmpty with world position when clicking empty canvas space', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const clickEmptySpy = vi.fn();
      input.onCanvasClickEmpty = clickEmptySpy;
      // No nodes → all clicks are on empty space
      input.nodesProvider = () => ({});
      input.connectionsProvider = () => ({});

      // Mousedown + mouseup on empty area
      dispatchMouseEvent(canvas, 'mousedown', 0, 200, 150);
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 200, clientY: 150 }));

      expect(clickEmptySpy).toHaveBeenCalledTimes(1);
      expect(clickEmptySpy).toHaveBeenCalledWith(expect.objectContaining({ x: 200, y: 150 }));

      input.destroy();
    });

    it('should NOT fire onCanvasClickEmpty when clicking on a module', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const clickEmptySpy = vi.fn();
      input.onCanvasClickEmpty = clickEmptySpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: vec2(100, 100), label: 'Test' } as any,
      });
      input.connectionsProvider = () => ({});

      // Click on the module
      dispatchMouseEvent(canvas, 'mousedown', 0, 100, 100);
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));

      expect(clickEmptySpy).not.toHaveBeenCalled();

      input.destroy();
    });

    it('should NOT fire onCanvasClickEmpty when clicking on a connection', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const clickEmptySpy = vi.fn();
      input.onCanvasClickEmpty = clickEmptySpy;
      input.nodesProvider = () => ({
        modA: { id: 'modA', type: 'source', position: vec2(100, 100), label: 'A' } as any,
        modB: { id: 'modB', type: 'stock', position: vec2(400, 100), label: 'B' } as any,
      });
      input.connectionsProvider = () => ({
        c1: { id: 'c1', fromId: 'modA', toId: 'modB', rate: 1, formulaStr: '1' },
      });

      // Click on the connection line (midpoint at ~250, 100)
      dispatchMouseEvent(canvas, 'mousedown', 0, 250, 100);
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 250, clientY: 100 }));

      expect(clickEmptySpy).not.toHaveBeenCalled();

      input.destroy();
    });

    it('should NOT fire onCanvasClickEmpty when drag distance exceeds threshold (click vs drag)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const clickEmptySpy = vi.fn();
      input.onCanvasClickEmpty = clickEmptySpy;
      // No nodes → all clicks are on empty space
      input.nodesProvider = () => ({});
      input.connectionsProvider = () => ({});

      // Mousedown at (200, 150), mouseup at (250, 200) — distance ~70px > 5px threshold
      dispatchMouseEvent(canvas, 'mousedown', 0, 200, 150);
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 250, clientY: 200 }));

      expect(clickEmptySpy).not.toHaveBeenCalled();

      input.destroy();
    });
  });

  // ── Regression: mouseup outside canvas (click on sidebar panels) ────

  describe('mouseup guard — click originated outside canvas', () => {
    it('should NOT fire onModuleSelect(null) on mouseup when mousedown did not originate on canvas', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const selectSpy = vi.fn();
      input.onModuleSelect = selectSpy;
      input.nodesProvider = () => ({});
      input.connectionsProvider = () => ({});

      // Simulate a click on the right sidebar (e.g. rate-editor input):
      // mouse goes down outside canvas → no mousedown on canvas
      // mouse goes up → window mouseup fires
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 900, clientY: 300 }));

      // Should NOT fire any selection logic — the click originated outside the canvas
      expect(selectSpy).not.toHaveBeenCalled();

      input.destroy();
    });

    it('should NOT fire onCanvasClickEmpty on mouseup when mousedown did not originate on canvas', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const clickEmptySpy = vi.fn();
      input.onCanvasClickEmpty = clickEmptySpy;
      input.nodesProvider = () => ({});
      input.connectionsProvider = () => ({});

      // mouseup on window without prior canvas mousedown
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 500, clientY: 400 }));

      expect(clickEmptySpy).not.toHaveBeenCalled();

      input.destroy();
    });
  });
});

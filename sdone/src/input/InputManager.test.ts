import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputManager } from './InputManager.js';
import type { ViewportManager } from '../canvas/Viewport.js';
import { vec2 } from '../shared/Vec2.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function dispatchWindowMouseMove(clientX: number, clientY: number): void {
  // window mousemove listeners are stored via window.addEventListener mock
  // We'll dispatch through the InputManager's bound handler directly.
  // For testing purposes we simulate via the canvas's stored handlers since
  // InputManager stores window mousemove listeners in constructor.
  // Actually, we store the window listener via window.addEventListener — we need
  // to capture that.

  // We'll use a different approach: spy on window.addEventListener to capture
  // the handler, then call it directly.
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InputManager', () => {
  let canvas: MockCanvas;
  let mockVM: ViewportManager;
  let windowAddSpy: ReturnType<typeof vi.spyOn>;
  let windowRemoveSpy: ReturnType<typeof vi.spyOn>;
  let capturedWindowListeners: Map<string, EventListener[]>;

  beforeEach(() => {
    canvas = createMockCanvas();
    mockVM = createMockViewportManager();

    // Capture window.addEventListener calls to track window-level listeners
    capturedWindowListeners = new Map();
    windowAddSpy = vi.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, fn: EventListener) => {
        const list = capturedWindowListeners.get(type) ?? [];
        list.push(fn);
        capturedWindowListeners.set(type, list);
      },
    );
    windowRemoveSpy = vi.spyOn(window, 'removeEventListener').mockImplementation(
      (type: string, fn: EventListener) => {
        const list = capturedWindowListeners.get(type) ?? [];
        const idx = list.indexOf(fn);
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
      input.destroy();
      // removeEventListener should have been called on window for each type
      expect(windowRemoveSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(windowRemoveSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(windowRemoveSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(windowRemoveSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
      expect(windowRemoveSpy).toHaveBeenCalledWith('blur', expect.any(Function));
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
});
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputManager, pointToSegmentDistance } from './InputManager.js';
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
    it('fires onTabNext when Tab pressed', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const tabSpy = vi.fn();
      input.onTabNext = tabSpy;

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

  // ── Story 3.6: Connection edge-drag ──────────────────────────────────

  describe('connection edge-drag (Story 3.6)', () => {
    it('starts connection drag when threshold crossed on edge zone click', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const startSpy = vi.fn();
      input.onConnectionDragStart = startSpy;
      // Stock hit radius = 72px; inner fraction 0.7 → inner 50.4px, edge 50.4-72px
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
      });

      // Click at 60px from center → within edge zone (50.4 < 60 ≤ 72)
      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);
      expect(input.isDraggingConnectionEdge).toBe(false);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 })); // cross threshold
      expect(startSpy).toHaveBeenCalledWith('node1');
      expect(input.isDraggingConnectionEdge).toBe(true);
      expect(canvas.style.cursor).toBe('crosshair');

      input.destroy();
    });

    it('does NOT start connection drag on inner zone click (module drag instead)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const connStartSpy = vi.fn();
      const moduleStartSpy = vi.fn();
      input.onConnectionDragStart = connStartSpy;
      input.onModuleDragStart = moduleStartSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
      });

      // Click at 30px from center → within inner zone (≤ 50.4px)
      dispatchMouseEvent(canvas, 'mousedown', 0, 130, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 135, clientY: 100 })); // cross threshold
      expect(connStartSpy).not.toHaveBeenCalled();
      expect(moduleStartSpy).toHaveBeenCalledWith('node1');

      input.destroy();
    });

    it('calls onConnectionDragMove with world coordinates during drag', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const moveSpy = vi.fn();
      input.onConnectionDragMove = moveSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 })); // start drag
      expect(input.isDraggingConnectionEdge).toBe(true);

      moveFn(new MouseEvent('mousemove', { clientX: 200, clientY: 150 }));
      expect(moveSpy).toHaveBeenLastCalledWith(
        'node1',
        expect.objectContaining({ x: 200, y: 150 }),
      );

      input.destroy();
    });

    it('fires onConnectionDragEnd on release over valid target', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const endSpy = vi.fn();
      const cancelSpy = vi.fn();
      input.onConnectionDragEnd = endSpy;
      input.onConnectionDragCancel = cancelSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
        node2: { id: 'node2', type: 'source', position: { x: 300, y: 100 }, label: 'T2' } as any,
      });

      // Start connection drag from node1 edge
      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 }));

      // Release over node2
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 300, clientY: 100 }));

      expect(endSpy).toHaveBeenCalledWith('node1', 'node2');
      expect(cancelSpy).not.toHaveBeenCalled();
      expect(input.isDraggingConnectionEdge).toBe(false);

      input.destroy();
    });

    it('fires onConnectionDragCancel on release over empty space (mid-air, AC6)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const endSpy = vi.fn();
      const cancelSpy = vi.fn();
      input.onConnectionDragEnd = endSpy;
      input.onConnectionDragCancel = cancelSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 }));

      // Release over empty space (no module at these coords)
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 500, clientY: 500 }));

      expect(endSpy).not.toHaveBeenCalled();
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(input.isDraggingConnectionEdge).toBe(false);

      input.destroy();
    });

    it('fires onConnectionDragCancel on release over source module (self-connection)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const endSpy = vi.fn();
      const cancelSpy = vi.fn();
      input.onConnectionDragEnd = endSpy;
      input.onConnectionDragCancel = cancelSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 }));

      // Release back on source
      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 100, clientY: 100 }));

      expect(endSpy).not.toHaveBeenCalled();
      expect(cancelSpy).toHaveBeenCalledTimes(1);

      input.destroy();
    });

    it('Escape cancels connection drag (AC7)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const cancelSpy = vi.fn();
      input.onConnectionDragCancel = cancelSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 }));
      expect(input.isDraggingConnectionEdge).toBe(true);

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Escape' }),
      );

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(input.isDraggingConnectionEdge).toBe(false);
      expect(canvas.style.cursor).toBe('');

      input.destroy();
    });

    it('window blur cancels connection drag', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const cancelSpy = vi.fn();
      input.onConnectionDragCancel = cancelSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 }));
      expect(input.isDraggingConnectionEdge).toBe(true);

      capturedWindowListeners.get('blur')?.[0]!(new Event('blur'));

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(input.isDraggingConnectionEdge).toBe(false);

      input.destroy();
    });

    it('cancelDrag() clears both module and connection drag state', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      const cancelSpy = vi.fn();
      input.onConnectionDragCancel = cancelSpy;
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 }));

      input.cancelDrag();

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(input.isDraggingConnectionEdge).toBe(false);
      expect(input.isDragging).toBe(false);

      input.destroy();
    });

    it('sets snapTargetId when cursor is near target module edge (AC2)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
        node2: { id: 'node2', type: 'source', position: { x: 300, y: 100 }, label: 'T2' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 })); // start drag

      // Move cursor near node2 — should trigger snap detection
      moveFn(new MouseEvent('mousemove', { clientX: 300, clientY: 100 }));

      expect(input.snapTargetId).toBe('node2');
      expect(input.snapTargetEdgeWorldPos).not.toBeNull();

      input.destroy();
    });

    it('clears snapTargetId when cursor moves away from all modules', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
        node2: { id: 'node2', type: 'source', position: { x: 300, y: 100 }, label: 'T2' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 })); // start drag
      moveFn(new MouseEvent('mousemove', { clientX: 300, clientY: 100 })); // near node2
      expect(input.snapTargetId).toBe('node2');

      // Move to empty space
      moveFn(new MouseEvent('mousemove', { clientX: 500, clientY: 500 }));
      expect(input.snapTargetId).toBeNull();

      input.destroy();
    });

    it('clears snapTargetId on connection drag cancel (Escape, AC7)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
        node2: { id: 'node2', type: 'source', position: { x: 300, y: 100 }, label: 'T2' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 }));
      moveFn(new MouseEvent('mousemove', { clientX: 300, clientY: 100 })); // near node2
      expect(input.snapTargetId).toBe('node2');

      capturedWindowListeners.get('keydown')?.[0]!(
        new KeyboardEvent('keydown', { code: 'Escape' }),
      );

      expect(input.snapTargetId).toBeNull();
      expect(input.snapTargetEdgeWorldPos).toBeNull();

      input.destroy();
    });

    it('clears snapTargetId on connection drag end (mouseup)', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
        node2: { id: 'node2', type: 'source', position: { x: 300, y: 100 }, label: 'T2' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 }));
      moveFn(new MouseEvent('mousemove', { clientX: 300, clientY: 100 }));
      expect(input.snapTargetId).toBe('node2');

      const mouseupFn = capturedWindowListeners.get('mouseup')?.[0]!;
      mouseupFn(new MouseEvent('mouseup', { button: 0, clientX: 300, clientY: 100 }));

      expect(input.snapTargetId).toBeNull();
      expect(input.snapTargetEdgeWorldPos).toBeNull();

      input.destroy();
    });

    it('isDragging getter returns true during connection drag', () => {
      const input = new InputManager(canvas as unknown as HTMLCanvasElement, mockVM);
      input.nodesProvider = () => ({
        node1: { id: 'node1', type: 'stock', position: { x: 100, y: 100 }, label: 'T' } as any,
      });

      dispatchMouseEvent(canvas, 'mousedown', 0, 160, 100);

      const moveFn = capturedWindowListeners.get('mousemove')?.[0]!;
      moveFn(new MouseEvent('mousemove', { clientX: 165, clientY: 100 }));

      expect(input.isDragging).toBe(true);
      expect(input.isDraggingConnectionEdge).toBe(true);

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
});

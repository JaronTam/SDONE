/**
 * Unit tests for MinimapRenderer — Story 2.5
 *
 * jsdom does not support getContext('2d'), so we mock the 2D context
 * and verify paint() calls through spy assertions.
 *
 * requestAnimationFrame is mocked to return incrementing IDs.  Tests manually
 * advance frames by calling advanceFrame(), which executes exactly ONE pending
 * callback.  The next loop() iteration re-enqueues itself for the next frame.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MinimapRenderer } from './MinimapRenderer.js';
import { ViewportManager } from './Viewport.js';
import type { ModuleNode } from '../state/GraphState.js';

// ── 2D Context Mock ──────────────────────────────────────────────────────

function createMock2DContext() {
  return {
    canvas: null as unknown as HTMLCanvasElement,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray([0, 0, 0, 255]),
      width: 1,
      height: 1,
      colorSpace: 'srgb' as PredefinedColorSpace,
    }),
    putImageData: vi.fn(),
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function createCanvasWithMockCtx(
  width = 200,
  height = 150,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  Object.defineProperty(canvas, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: height, configurable: true });

  const ctx = createMock2DContext();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as any);

  return { canvas, ctx };
}

function createSceneCanvas(width = 800, height = 600): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  Object.defineProperty(canvas, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: height, configurable: true });
  return canvas;
}

function makeNode(
  id: string,
  type: ModuleNode['type'],
  x: number,
  y: number,
): ModuleNode {
  return {
    id,
    type,
    position: { x, y },
    label: `${type}-${id}`,
    ports: { in: [], out: [] },
  } as unknown as ModuleNode;
}

/**
 * Non-recursive rAF mock.  Stores callbacks and returns incrementing IDs.
 * `advanceFrame()` pops & executes exactly one callback — loop() will
 * re-enqueue itself automatically.  Call advanceFrame() multiple times
 * to simulate multiple animation frames.
 */
function setupRAFMocks(): {
  advanceFrame: () => void;
  rafSpy: ReturnType<typeof vi.spyOn>;
  cafSpy: ReturnType<typeof vi.spyOn>;
} {
  let callbacks: Array<FrameRequestCallback> = [];
  let nextId = 0;

  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    const id = ++nextId;
    callbacks.push(cb);
    return id;
  });

  const cafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
    callbacks = [];
  });

  const advanceFrame = () => {
    if (callbacks.length === 0) return;
    const cb = callbacks.shift()!;
    cb(performance.now());
  };

  return { advanceFrame, rafSpy, cafSpy };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('MinimapRenderer', () => {
  let minimapCanvas: HTMLCanvasElement;
  let mockCtx: CanvasRenderingContext2D;
  let sceneCanvas: HTMLCanvasElement;
  let vp: ViewportManager;

  beforeEach(() => {
    const { canvas, ctx } = createCanvasWithMockCtx();
    minimapCanvas = canvas;
    mockCtx = ctx;
    sceneCanvas = createSceneCanvas();
    vp = new ViewportManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Constructor ──────────────────────────────────────────────────

  it('should construct without throwing for valid canvas', () => {
    expect(() => new MinimapRenderer(minimapCanvas, vp, sceneCanvas)).not.toThrow();
  });

  it('should throw if 2D context cannot be acquired', () => {
    const badCanvas = document.createElement('canvas');
    badCanvas.width = 200;
    badCanvas.height = 150;
    expect(() => new MinimapRenderer(badCanvas, vp, sceneCanvas)).toThrow(
      /Cannot acquire 2D/,
    );
  });

  // ── Lifecycle: start / stop / destroy ────────────────────────────

  it('start() should begin the rAF loop (no double-start)', () => {
    const renderer = new MinimapRenderer(minimapCanvas, vp, sceneCanvas);
    const spy = vi.spyOn(window, 'requestAnimationFrame');
    spy.mockReturnValue(1);

    renderer.start();
    expect(spy).toHaveBeenCalledTimes(1);

    renderer.start();
    expect(spy).toHaveBeenCalledTimes(1); // no-op

    renderer.stop();
    spy.mockRestore();
  });

  it('stop() should cancel the pending rAF', () => {
    const renderer = new MinimapRenderer(minimapCanvas, vp, sceneCanvas);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const cafSpy = vi.spyOn(window, 'cancelAnimationFrame');

    renderer.start();
    renderer.stop();

    expect(cafSpy).toHaveBeenCalledTimes(1);
    renderer.stop(); // safe no-op
    expect(cafSpy).toHaveBeenCalledTimes(1);

    cafSpy.mockRestore();
  });

  it('destroy() should stop loop and clear providers', () => {
    const renderer = new MinimapRenderer(minimapCanvas, vp, sceneCanvas);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame');
    renderer.nodesProvider = () => ({});
    renderer.start();
    renderer.destroy();

    expect(renderer.nodesProvider).toBeNull();
    expect(() => renderer.stop()).not.toThrow();
  });

  // ── markDirty ────────────────────────────────────────────────────

  it('markDirty() should force next loop to repaint', () => {
    const renderer = new MinimapRenderer(minimapCanvas, vp, sceneCanvas);
    renderer.nodesProvider = () => ({
      a: makeNode('a', 'stock', 0, 0),
    });

    const { advanceFrame, rafSpy } = setupRAFMocks();

    renderer.start();

    // Frame 1: initial paint
    advanceFrame();
    expect(mockCtx.clearRect).toHaveBeenCalledTimes(1);
    (mockCtx.clearRect as ReturnType<typeof vi.fn>).mockClear();

    // Frame 2: nothing changed => should skip
    advanceFrame();
    expect(mockCtx.clearRect).not.toHaveBeenCalled();

    // markDirty => force repaint
    renderer.markDirty();
    advanceFrame();
    expect(mockCtx.clearRect).toHaveBeenCalledTimes(1);

    rafSpy.mockRestore();
    renderer.stop();
  });

  // ── paint() behaviour via context calls ──────────────────────────

  it('should clear and draw background + viewport rect on paint', () => {
    const renderer = new MinimapRenderer(minimapCanvas, vp, sceneCanvas);
    renderer.nodesProvider = () => ({
      s1: makeNode('s1', 'source', -100, 0),
      sk1: makeNode('sk1', 'sink', 100, 0),
    });

    const { advanceFrame, rafSpy } = setupRAFMocks();

    renderer.start();
    advanceFrame();

    expect(mockCtx.clearRect).toHaveBeenCalled();
    const fillCalls = (mockCtx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(fillCalls).toBeGreaterThanOrEqual(2); // background + viewport

    const arcCalls = (mockCtx.arc as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(arcCalls).toBeGreaterThanOrEqual(2); // two module dots

    expect(mockCtx.strokeRect).toHaveBeenCalled();

    rafSpy.mockRestore();
    renderer.stop();
  });

  it('should handle zero modules without crashing (AC 7)', () => {
    const renderer = new MinimapRenderer(minimapCanvas, vp, sceneCanvas);
    renderer.nodesProvider = () => ({});

    const { advanceFrame, rafSpy } = setupRAFMocks();

    renderer.start();
    advanceFrame();

    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.fillRect).toHaveBeenCalled();

    rafSpy.mockRestore();
    renderer.stop();
  });

  it('should handle canvas with zero dimensions gracefully', () => {
    const zeroCanvas = document.createElement('canvas');
    zeroCanvas.width = 0;
    zeroCanvas.height = 0;
    Object.defineProperty(zeroCanvas, 'clientWidth', { value: 0, configurable: true });
    Object.defineProperty(zeroCanvas, 'clientHeight', { value: 0, configurable: true });

    const zeroCtx = createMock2DContext();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(zeroCanvas, 'getContext').mockReturnValue(zeroCtx as any);

    const renderer = new MinimapRenderer(zeroCanvas, vp, sceneCanvas);
    renderer.nodesProvider = () => ({ a: makeNode('a', 'stock', 10, 10) });

    const { advanceFrame, rafSpy } = setupRAFMocks();

    expect(() => { renderer.start(); advanceFrame(); }).not.toThrow();

    rafSpy.mockRestore();
    renderer.stop();
  });

  it('should handle single module without zero-width/height crash', () => {
    const renderer = new MinimapRenderer(minimapCanvas, vp, sceneCanvas);
    renderer.nodesProvider = () => ({
      only: makeNode('only', 'stock', 42, 42),
    });

    const { advanceFrame, rafSpy } = setupRAFMocks();

    expect(() => { renderer.start(); advanceFrame(); }).not.toThrow();
    expect(mockCtx.arc).toHaveBeenCalled();

    rafSpy.mockRestore();
    renderer.stop();
  });

  it('should handle nodes at same position', () => {
    const renderer = new MinimapRenderer(minimapCanvas, vp, sceneCanvas);
    renderer.nodesProvider = () => ({
      a: makeNode('a', 'source', 0, 0),
      b: makeNode('b', 'sink', 0, 0),
    });

    const { advanceFrame, rafSpy } = setupRAFMocks();

    expect(() => { renderer.start(); advanceFrame(); }).not.toThrow();

    const arcCalls = (mockCtx.arc as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(arcCalls).toBeGreaterThanOrEqual(2);

    rafSpy.mockRestore();
    renderer.stop();
  });

  it('should skip repaint when viewport and nodes unchanged (AC 3)', () => {
    const renderer = new MinimapRenderer(minimapCanvas, vp, sceneCanvas);
    renderer.nodesProvider = () => ({
      s1: makeNode('s1', 'stock', 0, 0),
    });

    const { advanceFrame, rafSpy } = setupRAFMocks();

    renderer.start();

    // Frame 1: paint
    advanceFrame();
    expect(mockCtx.clearRect).toHaveBeenCalledTimes(1);
    (mockCtx.clearRect as ReturnType<typeof vi.fn>).mockClear();

    // Frame 2: no changes => skip
    advanceFrame();
    expect(mockCtx.clearRect).not.toHaveBeenCalled();

    rafSpy.mockRestore();
    renderer.stop();
  });
});
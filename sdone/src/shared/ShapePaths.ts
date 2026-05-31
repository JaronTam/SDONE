/**
 * Shared Canvas 2D shape path utilities for module primitives.
 *
 * Story 3.1 — Extracted from SceneRenderer so that both the main Canvas
 * renderer and the sidebar ModulePanel icon canvases draw from the
 * SAME geometric definitions. Future shape changes propagate everywhere.
 *
 * Each function draws the shape outline centered at (x, y).
 * Callers set fillStyle / strokeStyle / lineWidth before calling.
 */

// ── Constants (mirrored from SceneRenderer for standalone use) ──────

/** Source cloud circle base radius. */
export const CLOUD_RADIUS = 16;

/** Stock rounded-rectangle dimensions. */
export const SHAPE_STOCK_WIDTH = 120;
export const SHAPE_STOCK_HEIGHT = 80;
export const SHAPE_STOCK_CORNER_RADIUS = 12;

/** Sink funnel bounding radius. */
export const SINK_RADIUS = 24;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Add a rounded-rectangle path to the current context.
 * Caller MUST beginPath() / closePath() around this, or use the
 * higher-level drawStock() which handles fill+stroke itself.
 */
export function roundedRectPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  r: number,
): void {
  // Guard: non-positive dimensions produce no visible path (same as old SceneRenderer.roundedRect()).
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

  // Clamp corner radius to prevent reversed lineTo segments when r > w/2 or r > h/2.
  r = Math.min(r, w / 2, h / 2);

  ctx.moveTo(left + r, top);
  ctx.lineTo(left + w - r, top);
  ctx.arcTo(left + w, top, left + w, top + r, r);
  ctx.lineTo(left + w, top + h - r);
  ctx.arcTo(left + w, top + h, left + w - r, top + h, r);
  ctx.lineTo(left + r, top + h);
  ctx.arcTo(left, top + h, left, top + h - r, r);
  ctx.lineTo(left, top + r);
  ctx.arcTo(left, top, left + r, top, r);
  ctx.closePath();
}

// ── Module Shape Drawing Functions ───────────────────────────────────

/**
 * Draw a SOURCE cloud shape centered at (cx, cy).
 *
 * The cloud is a cluster of overlapping circles (top-center, left,
 * right, and two lower circles) that form a scalloped-top,
 * flat-bottom cloud silhouette. Scaled to fit within `size` × `size`.
 *
 * @param ctx  Canvas 2D rendering context.
 * @param cx   Center x-coordinate.
 * @param cy   Center y-coordinate.
 * @param size Target bounding box size in pixels (width and height).
 */
export function drawCloud(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  if (!Number.isFinite(size) || size <= 0) return;

  // Scale factor: canonical cloud is ~3.2r wide × ~2.8r tall
  const canonicalWidth = CLOUD_RADIUS * 3.2;
  const scale = size / canonicalWidth;
  const r = CLOUD_RADIUS * scale;

  const offsets: [number, number][] = [
    [-0.7, 0],
    [0.7, 0],
    [0, -0.5],
    [-0.5, -0.5],
    [0.5, -0.5],
  ];

  ctx.beginPath();
  for (const [ox, oy] of offsets) {
    ctx.arc(cx + ox * r, cy + oy * r, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
}

/**
 * Draw a STOCK rounded rectangle centered at (cx, cy).
 *
 * The stock is drawn as a filled rounded-rectangle with stroke.
 * Scaled to fit within `size` × `size` while preserving aspect ratio.
 *
 * @param ctx  Canvas 2D rendering context.
 * @param cx   Center x-coordinate.
 * @param cy   Center y-coordinate.
 * @param size Target bounding box size in pixels (width and height).
 */
export function drawStock(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  if (!Number.isFinite(size) || size <= 0) return;

  const aspectRatio = SHAPE_STOCK_WIDTH / SHAPE_STOCK_HEIGHT; // 1.5
  let w: number;
  let h: number;

  if (aspectRatio >= 1) {
    w = size;
    h = size / aspectRatio;
  } else {
    h = size;
    w = size * aspectRatio;
  }

  const cr = SHAPE_STOCK_CORNER_RADIUS * (w / SHAPE_STOCK_WIDTH);
  const left = cx - w / 2;
  const top = cy - h / 2;

  ctx.beginPath();
  roundedRectPath(ctx, left, top, w, h, cr);
  ctx.fill();
  ctx.stroke();
}

/**
 * Draw a SINK funnel / infinity shape centered at (cx, cy).
 *
 * Two overlapping circles with a connecting waist line form a
 * stylized inverted-triangle / funnel silhouette.
 * Scaled to fit within `size` × `size`.
 *
 * @param ctx  Canvas 2D rendering context.
 * @param cx   Center x-coordinate.
 * @param cy   Center y-coordinate.
 * @param size Target bounding box size in pixels (width and height).
 */
export function drawSink(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  if (!Number.isFinite(size) || size <= 0) return;

  // Canonical sink is 2 × SINK_RADIUS wide
  const scale = size / (SINK_RADIUS * 2);
  const r = SINK_RADIUS * scale;

  const leftCircleX = cx - r * 0.55;
  const rightCircleX = cx + r * 0.55;

  // Left circle
  ctx.beginPath();
  ctx.arc(leftCircleX, cy, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Right circle
  ctx.beginPath();
  ctx.arc(rightCircleX, cy, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Waist connector lines (top and bottom)
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.05, cy - r * 0.45);
  ctx.lineTo(cx + r * 0.05, cy - r * 0.45);
  ctx.moveTo(cx - r * 0.05, cy + r * 0.45);
  ctx.lineTo(cx + r * 0.05, cy + r * 0.45);
  ctx.stroke();
}

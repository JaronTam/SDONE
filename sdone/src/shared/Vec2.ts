/** Immutable 2D vector. All utility functions return new Vec2 instances. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Create a new Vec2 */
export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

/** Add two vectors */
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Subtract b from a */
export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Euclidean distance between two points */
export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Linear interpolation between a and b. t=0 → a, t=1 → b */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Clamp a value between min and max (inclusive) */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Generate a unique ID using the Web Crypto API */
export function uuid(): string {
  return crypto.randomUUID();
}
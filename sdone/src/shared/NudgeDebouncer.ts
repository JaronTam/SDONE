/**
 * Story 3.5 — Debounce state machine for arrow-key nudge history snapshots.
 *
 * First nudge in a sequence → caller pushes pre-move snapshot.
 * Subsequent nudges within delayMs → positions only, no history.
 * delayMs of inactivity → onExpire fires → caller pushes post-move snapshot.
 * After expiry, the next nudge starts a new sequence.
 */
export class NudgeDebouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly delayMs: number) {}

  /**
   * Register a nudge. Returns true for the first nudge in a sequence
   * (caller should snapshot pre-move state). onExpire fires once after
   * delayMs of inactivity (caller should snapshot post-move state).
   */
  nudge(onExpire: () => void): boolean {
    const isFirst = this.timer === null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      onExpire();
      this.timer = null;
    }, this.delayMs);
    return isFirst;
  }

  /** Cancel the pending timer. Safe to call when no timer is active. */
  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  get isActive(): boolean {
    return this.timer !== null;
  }
}

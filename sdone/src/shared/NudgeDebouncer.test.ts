import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NudgeDebouncer } from './NudgeDebouncer.js';

describe('NudgeDebouncer (Story 3.5 — AC3 debounce)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns true on first nudge (pre-move snapshot signal)', () => {
    const db = new NudgeDebouncer(300);
    expect(db.nudge(vi.fn())).toBe(true);
    expect(db.isActive).toBe(true);
  });

  it('returns false on subsequent nudges within the debounce window', () => {
    const db = new NudgeDebouncer(300);
    db.nudge(vi.fn());
    vi.advanceTimersByTime(100);
    expect(db.nudge(vi.fn())).toBe(false);
  });

  it('resets the timer on each nudge, delaying onExpire', () => {
    const db = new NudgeDebouncer(300);
    const expire = vi.fn();
    db.nudge(expire);
    vi.advanceTimersByTime(200);
    db.nudge(expire); // reset — still active
    vi.advanceTimersByTime(200);
    expect(expire).not.toHaveBeenCalled(); // only 200ms since last nudge
    vi.advanceTimersByTime(100); // now 300ms since last nudge
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('fires onExpire after delayMs of inactivity (post-move snapshot)', () => {
    const db = new NudgeDebouncer(300);
    const expire = vi.fn();
    db.nudge(expire);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(db.isActive).toBe(false);
  });

  it('starts a new sequence (returns true) after the window expires', () => {
    const db = new NudgeDebouncer(300);
    db.nudge(vi.fn());
    vi.advanceTimersByTime(300); // window expired
    expect(db.nudge(vi.fn())).toBe(true); // new sequence
  });

  it('cancel() stops the timer and prevents onExpire', () => {
    const db = new NudgeDebouncer(300);
    const expire = vi.fn();
    db.nudge(expire);
    db.cancel();
    vi.advanceTimersByTime(300);
    expect(expire).not.toHaveBeenCalled();
    expect(db.isActive).toBe(false);
  });

  it('cancel() is safe when no timer is active', () => {
    const db = new NudgeDebouncer(300);
    expect(() => db.cancel()).not.toThrow();
  });
});

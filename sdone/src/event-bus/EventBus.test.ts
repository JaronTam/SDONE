import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './EventBus.js';

function bus(): EventBus {
  return new EventBus();
}

describe('EventBus', () => {
  // ── AC 1: Single handler receives correct payload synchronously ──
  it('delivers payload to a single registered handler synchronously', () => {
    const b = bus();
    const handler = vi.fn();
    b.on('TEST_EVENT' as any, handler);
    b.emit('TEST_EVENT' as any, { value: 42 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  // ── AC 2: Multiple handlers called in registration order ──
  it('calls multiple handlers in registration order', () => {
    const b = bus();
    const order: number[] = [];
    b.on('TEST_EVENT' as any, () => order.push(1));
    b.on('TEST_EVENT' as any, () => order.push(2));
    b.on('TEST_EVENT' as any, () => order.push(3));

    b.emit('TEST_EVENT' as any, { value: 0 });
    expect(order).toEqual([1, 2, 3]);
  });

  // ── AC 3: Unsubscribe removes handler ──
  it('stops calling handler after unsubscribe', () => {
    const b = bus();
    const handler = vi.fn();
    const unsub = b.on('TEST_EVENT' as any, handler);
    unsub();
    b.emit('TEST_EVENT' as any, { value: 0 });
    expect(handler).not.toHaveBeenCalled();
  });

  // ── AC 4: Emit with zero subscribers is a graceful no-op ──
  it('does not throw when emitting with zero subscribers', () => {
    const b = bus();
    expect(() => b.emit('TEST_EVENT' as any, { value: 0 })).not.toThrow();
  });

  // ── AC 6: Error in one handler does not prevent others ──
  it('continues to call remaining handlers after one throws', () => {
    const b = bus();
    const goodHandler = vi.fn();
    b.on('TEST_EVENT' as any, () => {
      throw new Error('boom');
    });
    b.on('TEST_EVENT' as any, goodHandler);

    b.emit('TEST_EVENT' as any, { value: 0 });
    expect(goodHandler).toHaveBeenCalledTimes(1);
  });

  // ── Edge case: Double unsubscribe is safe ──
  it('double unsubscribe is a safe no-op', () => {
    const b = bus();
    const handler = vi.fn();
    const unsub = b.on('TEST_EVENT' as any, handler);
    unsub();
    unsub(); // second call should not throw
    b.emit('TEST_EVENT' as any, { value: 0 });
    expect(handler).not.toHaveBeenCalled();
  });

  // ── Edge case: clear() removes all handlers ──
  it('clear() removes all handlers', () => {
    const b = bus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    b.on('TEST_EVENT' as any, h1);
    b.on('TEST_EVENT' as any, h2);
    b.clear();

    b.emit('TEST_EVENT' as any, { value: 0 });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  // ── Edge case: unsubscribe only removes the target handler ──
  it('unsubscribe keeps other handlers registered for the same event', () => {
    const b = bus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    const unsub = b.on('TEST_EVENT' as any, h1);
    b.on('TEST_EVENT' as any, h2);
    unsub();

    b.emit('TEST_EVENT' as any, { value: 7 });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });

  // ── Re-entrancy: unsubscribe during emit does not skip subsequent handlers ──
  it('does not skip handlers when one unsubscribes itself during emit', () => {
    const b = bus();
    const calls: string[] = [];
    let unsubB: () => void;

    const hA = () => calls.push('A');
    const hB = () => { unsubB(); calls.push('B'); };
    const hC = () => calls.push('C');

    b.on('TEST_EVENT' as any, hA);
    unsubB = b.on('TEST_EVENT' as any, hB);
    b.on('TEST_EVENT' as any, hC);

    b.emit('TEST_EVENT' as any, { value: 0 });
    expect(calls).toEqual(['A', 'B', 'C']);
  });

  // ── Re-entrancy: on() during emit does not call newly registered handler ──
  it('does not call handlers registered during the same emit', () => {
    const b = bus();
    const calls: string[] = [];

    b.on('TEST_EVENT' as any, () => {
      calls.push('first');
      b.on('TEST_EVENT' as any, () => calls.push('late'));
    });

    b.emit('TEST_EVENT' as any, { value: 0 });
    expect(calls).toEqual(['first']);
  });

  // ── RUN/PAUSE/RESET accept undefined payload ──
  it('delivers undefined payload for RUN event', () => {
    const b = bus();
    const handler = vi.fn();
    b.on('RUN', handler);
    b.emit('RUN', undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('delivers undefined payload for PAUSE event', () => {
    const b = bus();
    const handler = vi.fn();
    b.on('PAUSE', handler);
    b.emit('PAUSE', undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('delivers undefined payload for RESET event', () => {
    const b = bus();
    const handler = vi.fn();
    b.on('RESET', handler);
    b.emit('RESET', undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  // ── Type-safety smoke test (AC 5 verified at compile time) ──
  it('accepts a production event key and delivers its payload', () => {
    const b = bus();
    const handler = vi.fn();
    b.on('SPEED_CHANGE', handler);
    b.emit('SPEED_CHANGE', { multiplier: 2 });
    expect(handler).toHaveBeenCalledWith({ multiplier: 2 });
  });

  // ── Re-entrancy: handler removes a different handler during emit ──
  it('does not skip remaining handlers when one unsubscribes a different handler during emit', () => {
    const b = bus();
    const calls: string[] = [];
    let unsubC: () => void;

    b.on('TEST_EVENT' as any, () => calls.push('A'));
    b.on('TEST_EVENT' as any, () => {
      calls.push('B');
      unsubC(); // handler B removes handler C during emit
    });
    unsubC = b.on('TEST_EVENT' as any, () => calls.push('C'));
    b.on('TEST_EVENT' as any, () => calls.push('D'));

    b.emit('TEST_EVENT' as any, { value: 0 });
    // Snapshot ensures C still fires even though B already unsubscribed C.
    // D must fire after C.
    expect(calls).toEqual(['A', 'B', 'C', 'D']);
  });

  // ── Dedup: duplicate handler registration is prevented ──
  it('does not register the same handler reference twice', () => {
    const b = bus();
    const handler = vi.fn();
    b.on('TEST_EVENT' as any, handler);
    b.on('TEST_EVENT' as any, handler); // same reference — should be no-op

    b.emit('TEST_EVENT' as any, { value: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ── AC 5 compile-time guard: wrong payload shape = compile error ──
  it('AC5: wrong payload shape causes compile error (verified via @ts-expect-error)', () => {
    const b = bus();
    // These lines would fail at COMPILE TIME if TypeScript types were wrong.
    // If this file compiles, AC5 is satisfied.
    // @ts-expect-error: SPEED_CHANGE payload must be { multiplier: number }, not string
    b.on('SPEED_CHANGE', (_payload: string) => {});
    // @ts-expect-error: SNAPSHOT_EMITTED payload must be GraphState, not number
    b.on('SNAPSHOT_EMITTED', (_payload: number) => {});
    // @ts-expect-error: MODULE_ADDED payload must be ModuleNode, not null
    b.on('MODULE_ADDED', (_payload: null) => {});
    expect(true).toBe(true); // If we reach here, the file compiled correctly
  });
});

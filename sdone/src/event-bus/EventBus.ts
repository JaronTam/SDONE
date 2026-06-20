import type { EventMap } from './EventMap.js';

type Handler<T> = (payload: T) => void;

/**
 * Zero-dependency typed event bus.
 *
 * All handlers are called synchronously in registration order.
 * If a handler throws, the error is caught and logged — remaining handlers still fire.
 */
export class EventBus {
  private handlers = new Map<keyof EventMap, Handler<any>[]>();

  /**
   * Register an event handler.
   * @returns Unsubscribe function — call to remove this handler.
   */
  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    const list = this.handlers.get(event);
    if (list) {
      if (!list.includes(handler)) {
        list.push(handler);
      }
    } else {
      this.handlers.set(event, [handler]);
    }
    return () => this.off(event, handler);
  }

  /**
   * Emit an event to all registered handlers synchronously.
   * Handlers are called in registration order.
   * Errors in one handler do not prevent the rest from executing.
   */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;
    // Iterate a snapshot to guard against mutation during handler execution
    // (e.g. unsubscribe or on() called from within a handler).
    const snapshot = [...list];
    for (const handler of snapshot) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Handler for "${String(event)}" threw:`, err);
      }
    }
  }

  /**
   * Remove a specific handler for an event.
   * Internal — consumers should use the unsubscribe function returned by on().
   */
  private off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  /**
   * Remove all handlers for all events. Useful for cleanup/testing.
   */
  clear(): void {
    this.handlers.clear();
  }
}

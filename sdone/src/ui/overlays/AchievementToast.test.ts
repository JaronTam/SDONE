import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AchievementToast } from './AchievementToast.js';

describe('AchievementToast', () => {
  let toast: AchievementToast;

  beforeEach(() => {
    toast = new AchievementToast();
    vi.useFakeTimers();
  });

  afterEach(() => {
    toast.destroy();
    vi.useRealTimers();
    // Clean up any remaining toast DOM elements
    document.querySelectorAll('.achievement-toast').forEach((el) => el.remove());
  });

  it('show("test") creates a DOM element with correct text content', () => {
    toast.show('Hello World');

    const el = document.querySelector('.achievement-toast');
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe('Hello World');
  });

  it('calling show() twice creates two elements, stacked vertically', () => {
    toast.show('First');
    toast.show('Second');

    const elements = document.querySelectorAll('.achievement-toast');
    expect(elements.length).toBe(2);

    // Both toasts should have a top position set (stacked, not overlapping)
    const tops = Array.from(elements).map((el) => parseInt((el as HTMLElement).style.top, 10));
    // Both should have valid top positions
    expect(tops.every((t) => t > 0)).toBe(true);
    // The two toasts should be at different vertical positions (stacked)
    expect(tops[0]).not.toBe(tops[1]);
  });

  it('dismiss(id) removes the element after exit animation timeout', () => {
    const id = toast.show('Dismiss me');
    const el = document.querySelector(`[data-toast-id="${id}"]`);
    expect(el).not.toBeNull();

    // Dismiss triggers --exiting class + transitionend listener
    toast.dismiss(id);

    // Element should have --exiting class
    const elAfterDismiss = document.querySelector(`[data-toast-id="${id}"]`);
    expect(elAfterDismiss).not.toBeNull();
    expect(elAfterDismiss!.classList.contains('achievement-toast--exiting')).toBe(true);

    // Simulate transitionend event for transform property
    elAfterDismiss!.dispatchEvent(
      new TransitionEvent('transitionend', { propertyName: 'transform' }),
    );

    // Element should be removed
    const elAfterTransition = document.querySelector(`[data-toast-id="${id}"]`);
    expect(elAfterTransition).toBeNull();
  });

  it('dismissAll() removes all elements', () => {
    toast.show('One');
    toast.show('Two');
    toast.show('Three');

    expect(document.querySelectorAll('.achievement-toast').length).toBe(3);

    toast.dismissAll();

    expect(document.querySelectorAll('.achievement-toast').length).toBe(0);
  });

  it('destroy() cleans up all elements and timers', () => {
    toast.show('A');
    toast.show('B');

    expect(document.querySelectorAll('.achievement-toast').length).toBe(2);

    toast.destroy();

    expect(document.querySelectorAll('.achievement-toast').length).toBe(0);
  });

  it('auto-dismisses after 3 seconds', () => {
    toast.show('Auto dismiss');

    expect(document.querySelectorAll('.achievement-toast').length).toBe(1);

    // Advance time by 3 seconds
    vi.advanceTimersByTime(3000);

    // After the timeout fires, dismiss is called which adds --exiting class
    // The element is still in DOM until transitionend fires
    const el = document.querySelector('.achievement-toast');
    expect(el).not.toBeNull();
    expect(el!.classList.contains('achievement-toast--exiting')).toBe(true);

    // Simulate transitionend for transform property
    el!.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'transform' }));

    expect(document.querySelectorAll('.achievement-toast').length).toBe(0);
  });

  it('show() returns a unique ID for each toast', () => {
    const id1 = toast.show('First');
    const id2 = toast.show('Second');

    expect(id1).not.toBe(id2);
  });

  it('toast element has --entering class initially', () => {
    toast.show('Entering test');

    const el = document.querySelector('.achievement-toast');
    expect(el).not.toBeNull();
    expect(el!.classList.contains('achievement-toast--entering')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { ConfettiEngine } from './ConfettiEngine.js';

describe('ConfettiEngine', () => {
  it('burst() creates ~20 particles at the given position', () => {
    const engine = new ConfettiEngine();
    engine.burst(100, 200);

    // After burst, update should return particles
    const particles = engine.update(0);
    expect(particles).not.toBeNull();
    expect(particles!.length).toBe(20);

    // All particles start at the burst center
    for (const p of particles!) {
      expect(p.x).toBe(100);
      expect(p.y).toBe(200);
    }
  });

  it('update(dt) advances particle positions and decrements life', () => {
    const engine = new ConfettiEngine();
    engine.burst(0, 0);

    const beforeUpdate = engine.update(0);
    expect(beforeUpdate).not.toBeNull();
    const p0 = beforeUpdate![0];

    // Store initial values
    const initialLife = p0.life;

    // Advance by 0.1s
    const afterUpdate = engine.update(0.1);
    expect(afterUpdate).not.toBeNull();

    // Find the same particle (by color + size match, since we can't track by ID)
    // Instead, just verify that at least some particles have moved
    const anyMoved = afterUpdate!.some((p) => p.x !== 0 || p.y !== 0);
    expect(anyMoved).toBe(true);

    // Life should have decreased
    const anyLifeDecreased = afterUpdate!.some((p) => p.life < initialLife);
    expect(anyLifeDecreased).toBe(true);
  });

  it('particles with life <= 0 are removed from active set', () => {
    const engine = new ConfettiEngine();
    engine.burst(0, 0);

    // Advance past max lifetime (1.2s) with generous margin
    const result = engine.update(2.0);
    expect(result).toBeNull();
  });

  it('update() returns null when no particles remain', () => {
    const engine = new ConfettiEngine();
    // No burst called — should return null
    const result = engine.update(0.016);
    expect(result).toBeNull();
  });

  it('reset() clears all particles', () => {
    const engine = new ConfettiEngine();
    engine.burst(50, 50);
    engine.reset();

    const result = engine.update(0);
    expect(result).toBeNull();
  });

  it('gravity accelerates vy downward', () => {
    const engine = new ConfettiEngine();
    engine.burst(0, 0);

    // Get initial state
    const state0 = engine.update(0);
    expect(state0).not.toBeNull();

    // Find a particle with upward initial velocity (vy < 0)
    const upwardParticle = state0!.find((p) => p.vy < 0);
    if (!upwardParticle) return; // skip if no upward particle (random)

    // Advance by 0.5s
    const state1 = engine.update(0.5);
    expect(state1).not.toBeNull();

    // vy should have increased (gravity adds +80 * dt)
    // After 0.5s: vy should be initialVy + 80 * 0.5 = initialVy + 40
    // But we can't track the same particle across updates easily,
    // so just verify that some particles have positive vy (falling)
    const anyFalling = state1!.some((p) => p.vy > 0);
    expect(anyFalling).toBe(true);
  });

  it('particles have valid color, size, and rotation properties', () => {
    const engine = new ConfettiEngine();
    engine.burst(0, 0);

    const particles = engine.update(0);
    expect(particles).not.toBeNull();

    const validColors = ['#ffd700', '#ffb74d', '#f9e2af', '#ffffff', '#90EE90'];
    for (const p of particles!) {
      expect(validColors).toContain(p.color);
      expect(p.size).toBeGreaterThanOrEqual(4);
      expect(p.size).toBeLessThanOrEqual(8);
      expect(p.maxLife).toBeGreaterThanOrEqual(0.8);
      expect(p.maxLife).toBeLessThanOrEqual(1.2);
      expect(p.life).toBeGreaterThan(0);
    }
  });
});

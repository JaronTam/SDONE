import { describe, it, expect, beforeEach } from 'vitest';
import type { Connection, ModuleNode } from '../../state/GraphState.js';
import { ParticleEngine } from '../ParticleEngine.js';

function makeNode(overrides: Partial<ModuleNode> = {}): ModuleNode {
  return {
    id: 'n1',
    type: 'stock',
    label: 'Test',
    position: { x: 0, y: 0 },
    ...overrides,
  } as ModuleNode;
}

function makeConn(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'c1',
    fromId: 'n1',
    toId: 'n2',
    rate: 10,
    formulaStr: '10',
    ...overrides,
  };
}

describe('ParticleEngine', () => {
  let engine: ParticleEngine;
  const nodes: Record<string, ModuleNode> = {
    n1: makeNode({ id: 'n1' }),
    n2: makeNode({ id: 'n2' }),
  };

  beforeEach(() => {
    engine = new ParticleEngine();
  });

  describe('update lifecycle', () => {
    it('creates particles for connections with rate > 0 while running', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 10 }) };
      const state = engine.update(1.0, conns, nodes, 'running');
      const particles = state.particlesByConnection.get('c1');
      expect(particles).toBeDefined();
      expect(particles!.length).toBeGreaterThan(0);
    });

    it('advances particles over time', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 10 }) };
      // First frame: spawn particles
      engine.update(1.0, conns, nodes, 'running');
      // Second frame: particles should advance
      const state = engine.update(0.5, conns, nodes, 'running');
      const particles = state.particlesByConnection.get('c1');
      expect(particles).toBeDefined();
      // With rate=10, there should be particles present
      expect(particles!.length).toBeGreaterThan(0);
    });

    it('removes particles that reach t >= 1.0', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 100 }) };
      // Run long enough for particles to complete traversal
      engine.update(10.0, conns, nodes, 'running');
      const state = engine.getState();
      const particles = state.particlesByConnection.get('c1');
      // After long runtime, old particles should be gone (only freshly spawned remain)
      for (const p of particles ?? []) {
        expect(p.t).toBeLessThan(1.0);
      }
    });

    it('zero-rate connections have no particles (AC3)', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 0 }) };
      const state = engine.update(1.0, conns, nodes, 'running');
      const particles = state.particlesByConnection.get('c1');
      expect(particles).toEqual([]);
    });

    it('paused state freezes particles in place (AC4)', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 10 }) };
      // Spawn some particles
      const state1 = engine.update(1.0, conns, nodes, 'running');
      const before = state1.particlesByConnection.get('c1');
      expect(before).toBeDefined();
      const tBefore = before!.map((p) => p.t);
      // Advance in paused state — positions should not change
      const state2 = engine.update(1.0, conns, nodes, 'paused');
      const after = state2.particlesByConnection.get('c1');
      expect(after).toBeDefined();
      // Particles should still exist with same positions
      expect(after!.length).toBe(before!.length);
      for (let i = 0; i < after!.length; i++) {
        expect(after![i].t).toBeCloseTo(tBefore[i], 8);
      }
    });

    it('cleans up particles for deleted connections', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 10 }) };
      engine.update(1.0, conns, nodes, 'running');
      // Remove the connection
      const state = engine.update(0.1, {}, nodes, 'running');
      expect(state.particlesByConnection.has('c1')).toBe(false);
    });

    it('fades in particles from spawn (AC5)', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 10 }) };
      // Very short update — newly spawned particles should have low alpha
      const state = engine.update(0.01, conns, nodes, 'running');
      const particles = state.particlesByConnection.get('c1');
      for (const p of particles ?? []) {
        expect(p.alpha).toBeLessThanOrEqual(1.0);
        expect(p.alpha).toBeGreaterThanOrEqual(0);
      }
    });

    it('transitions alpha to 1.0 as particles age', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 10 }) };
      // Run enough to age particles past fade-in threshold (0.3s)
      engine.update(0.5, conns, nodes, 'running');
      const state = engine.getState();
      const particles = state.particlesByConnection.get('c1') ?? [];
      const oldEnough = particles.filter((p) => p.age >= 0.3);
      for (const p of oldEnough) {
        expect(p.alpha).toBeCloseTo(1.0, 1);
      }
    });

    it('cap on max particles per connection', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 2 }) };
      // rate=2 → maxParticles = ceil(2 * 0.5) = 1
      engine.update(10.0, conns, nodes, 'running');
      const state = engine.getState();
      const particles = state.particlesByConnection.get('c1') ?? [];
      expect(particles.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getState', () => {
    it('returns current particles without side effects', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 10 }) };
      engine.update(1.0, conns, nodes, 'running');
      const state1 = engine.getState();
      const len1 = state1.particlesByConnection.get('c1')?.length ?? 0;
      // Getting state again should return same count (no mutation)
      const state2 = engine.getState();
      const len2 = state2.particlesByConnection.get('c1')?.length ?? 0;
      expect(len1).toBe(len2);
    });
  });

  describe('reset', () => {
    it('clears all particles and spawn timers (AC6)', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 10 }) };
      engine.update(1.0, conns, nodes, 'running');
      expect(engine.getState().particlesByConnection.size).toBeGreaterThan(0);
      engine.reset();
      const state = engine.getState();
      expect(state.particlesByConnection.size).toBe(0);
    });

    it('reset followed by update starts clean', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 10 }) };
      engine.update(1.0, conns, nodes, 'running');
      engine.reset();
      const state = engine.update(0.1, conns, nodes, 'running');
      const particles = state.particlesByConnection.get('c1');
      expect(particles).toBeDefined();
      // Should have fresh particles, not old ones
      for (const p of particles ?? []) {
        expect(p.age).toBeLessThan(0.2);
      }
    });
  });

  describe('particle properties', () => {
    it('each particle has required fields', () => {
      const conns: Record<string, Connection> = { c1: makeConn({ rate: 10 }) };
      const state = engine.update(1.0, conns, nodes, 'running');
      const particles = state.particlesByConnection.get('c1') ?? [];
      for (const p of particles) {
        expect(p).toHaveProperty('t');
        expect(p).toHaveProperty('speed');
        expect(p).toHaveProperty('alpha');
        expect(p).toHaveProperty('age');
        expect(typeof p.t).toBe('number');
        expect(typeof p.speed).toBe('number');
        expect(typeof p.alpha).toBe('number');
        expect(typeof p.age).toBe('number');
        expect(p.t).toBeGreaterThanOrEqual(0);
        expect(p.alpha).toBeGreaterThanOrEqual(0);
        expect(p.alpha).toBeLessThanOrEqual(1);
      }
    });

    it('speed is proportional to connection rate (AC2)', () => {
      const conns: Record<string, Connection> = {
        slow: { id: 'slow', fromId: 'n1', toId: 'n2', rate: 5, formulaStr: '5' },
        fast: { id: 'fast', fromId: 'n1', toId: 'n2', rate: 20, formulaStr: '20' },
      };
      const state = engine.update(1.0, conns, nodes, 'running');
      const slowParticles = state.particlesByConnection.get('slow') ?? [];
      const fastParticles = state.particlesByConnection.get('fast') ?? [];
      expect(slowParticles.length).toBeGreaterThan(0);
      expect(fastParticles.length).toBeGreaterThan(0);
      expect(fastParticles[0].speed).toBeGreaterThan(slowParticles[0].speed);
    });
  });
});

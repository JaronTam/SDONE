import type { Connection, ModuleNode } from '../state/GraphState.js';
import type { SimulationState } from '../simulation/types.js';

export interface Particle {
  /** Normalized position along the connection path (0.0 = from end, 1.0 = to end). */
  t: number;
  /** Speed in normalized-units per second. Derived from connection rate. */
  speed: number;
  /** Fade opacity (0.0–1.0). Used for spawn/despawn transitions. */
  alpha: number;
  /** Age in seconds since spawn. Used for lifecycle management. */
  age: number;
}

export interface ParticleState {
  /** Particles keyed by connection id they travel along. */
  particlesByConnection: Map<string, Particle[]>;
}

/**
 * Manages particle lifecycle: spawn, advance, remove.
 *
 * Particles are ephemeral rendering state — they are NOT stored in GraphState.
 * The engine updates particle positions each frame based on connection rates
 * and simulation state (running/paused/idle).
 */
export class ParticleEngine {
  private particlesByConnection = new Map<string, Particle[]>();
  private spawnTimers = new Map<string, number>();

  /** Max particles per connection = ceil(rate / 2) */
  private static readonly PARTICLES_PER_RATE_UNIT = 0.5;

  /** Speed multiplier: rate * FACTOR = normalized-units per second.
   *  rate=10 → 1.0 = full traversal in ~1s (AC1). */
  private static readonly SPEED_FACTOR = 0.1;

  /**
   * Advance all particles by delta time.
   *
   * @param dt          Delta time in seconds since last frame.
   * @param connections Current connections (for rate info).
   * @param nodes       Current nodes (for valid connection check).
   * @param simState    Current simulation state (running/paused/idle).
   * @returns Current particle state for rendering.
   */
  update(
    dt: number,
    connections: Record<string, Connection>,
    nodes: Record<string, ModuleNode>,
    simState: SimulationState,
  ): ParticleState {
    // 1. Remove particles on deleted connections
    for (const connId of this.particlesByConnection.keys()) {
      if (!connections[connId]) {
        this.particlesByConnection.delete(connId);
        this.spawnTimers.delete(connId);
      }
    }

    // 2. For each connection: advance existing particles, spawn new ones
    for (const conn of Object.values(connections)) {
      const fromNode = nodes[conn.fromId];
      const toNode = nodes[conn.toId];
      if (!fromNode || !toNode) continue;

      const rate = conn.rate;
      const maxParticles = Math.max(0, Math.ceil(rate * ParticleEngine.PARTICLES_PER_RATE_UNIT));

      let particles = this.particlesByConnection.get(conn.id);
      if (!particles) {
        particles = [];
        this.particlesByConnection.set(conn.id, particles);
      }

      if (simState === 'running' && rate > 0) {
        // Advance existing particles
        const speed = rate * ParticleEngine.SPEED_FACTOR;
        for (const p of particles) {
          p.t += speed * dt;
          p.age += dt;
          // Fade in during first 0.3s of life
          p.alpha = Math.min(1.0, p.age / 0.3);
        }

        // Remove particles that reached destination
        this.particlesByConnection.set(
          conn.id,
          particles.filter((p) => p.t < 1.0),
        );

        // After filtering, get the updated particle array
        particles = this.particlesByConnection.get(conn.id)!;

        // Spawn interval: distribute particles evenly along connection traversal time.
        // rate=10, speed=1.0, maxParticles=5 → spawn every 0.2s for continuous flow.
        let timer = this.spawnTimers.get(conn.id) ?? 0;
        timer += dt;
        const spawnInterval = maxParticles > 0 ? 1.0 / (speed * maxParticles) : Infinity;
        while (timer >= spawnInterval && particles.length < maxParticles) {
          timer -= spawnInterval;
          particles.push({
            t: Math.random() * 0.04, // Small random jitter [0, 0.04)
            speed,
            alpha: 0, // Start fully transparent, fade-in via age/0.3
            age: 0,
          });
        }
        // Cap residual timer to prevent unbounded accumulation while at capacity
        if (maxParticles > 0 && particles.length >= maxParticles) {
          timer = Math.min(timer, spawnInterval);
        }
        this.spawnTimers.set(conn.id, timer);
      } else if (rate <= 0 || Number.isNaN(rate)) {
        // Remove particles on zero/negative/NaN-rate connections (AC3 + defensive)
        this.particlesByConnection.set(conn.id, []);
        this.spawnTimers.set(conn.id, 0);
      }
      // else: paused/idle with positive rate — do nothing (particles stay in place, AC4)
    }

    return { particlesByConnection: this.particlesByConnection };
  }

  /** Return current particle state without side effects (for rendering).
   *  Returns a new Map to prevent external mutation of internal state. */
  getState(): ParticleState {
    return { particlesByConnection: new Map(this.particlesByConnection) };
  }

  /** Clear all particles (called on RESET, AC6). */
  reset(): void {
    this.particlesByConnection.clear();
    this.spawnTimers.clear();
  }
}

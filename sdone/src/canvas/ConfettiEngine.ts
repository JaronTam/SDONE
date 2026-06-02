/**
 * Story 5.5 AC1 — Confetti Particle Burst Engine
 *
 * Self-contained confetti particle simulator. Separate from ParticleEngine —
 * confetti is a one-shot decorative burst with gravity, rotation, and fade,
 * not a continuous flow along connection paths.
 *
 * Audit correction #1: ConfettiParticle is defined HERE as the single source
 * of truth. SceneRenderer imports it via the canvas barrel export.
 * Audit correction #2: x/y JSDoc describes particle position, not burst center.
 */

export interface ConfettiParticle {
  /** Current world-space position of this particle. */
  x: number;
  /** Current world-space position of this particle. */
  y: number;
  /** Horizontal velocity in world-units per second. */
  vx: number;
  /** Vertical velocity in world-units per second. */
  vy: number;
  /** Remaining lifetime in seconds. */
  life: number;
  /** Maximum lifetime in seconds (used for alpha computation). */
  maxLife: number;
  /** CSS color string for this particle. */
  color: string;
  /** Size in world-pixels (width). Height is size * 0.6. */
  size: number;
  /** Current rotation angle in radians. */
  rotation: number;
  /** Rotation speed in radians per second. */
  rotationSpeed: number;
}

/** Celebration color palette — gold/amber/white/green, no red. */
const CONFETTI_COLORS = ['#ffd700', '#ffb74d', '#f9e2af', '#ffffff', '#90EE90'] as const;

/** Gravity acceleration in world-units/s² (downward). */
const CONFETTI_GRAVITY = 80;

/** Number of particles per burst. */
const BURST_COUNT = 20;

/** Minimum initial speed in world-units/s. */
const MIN_SPEED = 60;

/** Maximum initial speed in world-units/s. */
const MAX_SPEED = 180;

/** Minimum particle lifetime in seconds. */
const MIN_LIFE = 0.8;

/** Maximum particle lifetime in seconds. */
const MAX_LIFE = 1.2;

/** Minimum particle size in world-pixels. */
const MIN_SIZE = 4;

/** Maximum particle size in world-pixels. */
const MAX_SIZE = 8;

/** Minimum rotation speed in radians/s. */
const MIN_ROTATION_SPEED = 3;

/** Maximum rotation speed in radians/s. */
const MAX_ROTATION_SPEED = 8;

/**
 * Manages confetti particle lifecycle: burst, update, reset.
 *
 * Confetti particles are ephemeral rendering state — they are NOT stored in GraphState.
 */
export class ConfettiEngine {
  private particles: ConfettiParticle[] = [];

  /**
   * Trigger a confetti burst at the given world position.
   * Spawns ~20 particles with randomized velocities, colors, and rotations.
   */
  burst(worldX: number, worldY: number): void {
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
      const life = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE);
      const size = MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE);
      const rotSpeed = MIN_ROTATION_SPEED + Math.random() * (MAX_ROTATION_SPEED - MIN_ROTATION_SPEED);
      // Randomly negate rotation speed for variety
      const rotationSign = Math.random() < 0.5 ? -1 : 1;

      this.particles.push({
        x: worldX,
        y: worldY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: rotSpeed * rotationSign,
      });
    }
  }

  /**
   * Advance all confetti particles by dt.
   * Returns active particles (null if empty).
   */
  update(dt: number): ConfettiParticle[] | null {
    if (this.particles.length === 0) return null;

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += CONFETTI_GRAVITY * dt; // gravity pulls downward
      p.rotation += p.rotationSpeed * dt;
      p.life -= dt;
    }

    // Remove dead particles
    this.particles = this.particles.filter(p => p.life > 0);

    return this.particles.length > 0 ? [...this.particles] : null;
  }

  /** Clear all particles. */
  reset(): void {
    this.particles = [];
  }
}
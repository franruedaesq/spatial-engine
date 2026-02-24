/**
 * Ray stored as origin + direction (unit vector).
 * Layout: [ox, oy, oz, dx, dy, dz]
 */
export const RAY_STRIDE = 6;

/** A pool-backed, zero-GC Ray store. */
export class RayPool {
  private readonly buffer: Float32Array;
  private count: number = 0;

  constructor(capacity: number) {
    this.buffer = new Float32Array(capacity * RAY_STRIDE);
  }

  /** Allocate a new Ray slot and return its index. */
  allocate(): number {
    const index = this.count;
    this.count += 1;
    return index;
  }

  /** Set origin and direction of a ray at the given index. */
  set(
    index: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
  ): void {
    const offset = index * RAY_STRIDE;
    this.buffer[offset] = ox;
    this.buffer[offset + 1] = oy;
    this.buffer[offset + 2] = oz;
    this.buffer[offset + 3] = dx;
    this.buffer[offset + 4] = dy;
    this.buffer[offset + 5] = dz;
  }

  /** Read a single component value from the buffer. */
  get(index: number, component: number): number {
    return this.buffer[index * RAY_STRIDE + component] ?? 0;
  }

  /** Returns the number of allocated Rays. */
  get size(): number {
    return this.count;
  }

  /** Reset the pool (all allocations freed, no GC). */
  reset(): void {
    this.count = 0;
  }
}

/**
 * Optimized branchless slab-method ray–AABB intersection test.
 *
 * Operates purely on flat Float32Arrays with no per-axis direction branches.
 * When a direction component is zero, IEEE 754 produces ±Infinity for the
 * reciprocal, which propagates correctly through the min/max slab computation:
 *   - origin inside the slab  → [−∞, +∞] interval (no constraint)
 *   - origin outside the slab → either [+∞, +∞] or [−∞, −∞] → forces a miss
 *
 * Returns the parametric hit distance `t` (>= 0) if the ray intersects the
 * AABB, or -1 if there is no intersection (miss or box entirely behind origin).
 */
export function rayIntersectsAABB(
  rayBuf: Float32Array,
  rayOffset: number,
  aabbBuf: Float32Array,
  aabbOffset: number,
): number {
  const ox = rayBuf[rayOffset] ?? 0;
  const oy = rayBuf[rayOffset + 1] ?? 0;
  const oz = rayBuf[rayOffset + 2] ?? 0;
  const idx = 1 / (rayBuf[rayOffset + 3] ?? 0);
  const idy = 1 / (rayBuf[rayOffset + 4] ?? 0);
  const idz = 1 / (rayBuf[rayOffset + 5] ?? 0);

  const minX = aabbBuf[aabbOffset] ?? 0;
  const minY = aabbBuf[aabbOffset + 1] ?? 0;
  const minZ = aabbBuf[aabbOffset + 2] ?? 0;
  const maxX = aabbBuf[aabbOffset + 3] ?? 0;
  const maxY = aabbBuf[aabbOffset + 4] ?? 0;
  const maxZ = aabbBuf[aabbOffset + 5] ?? 0;

  // Branchless slab method: per-axis near/far t values.
  const t1x = (minX - ox) * idx;
  const t2x = (maxX - ox) * idx;
  const t1y = (minY - oy) * idy;
  const t2y = (maxY - oy) * idy;
  const t1z = (minZ - oz) * idz;
  const t2z = (maxZ - oz) * idz;

  const tmin = Math.max(Math.min(t1x, t2x), Math.min(t1y, t2y), Math.min(t1z, t2z));
  const tmax = Math.min(Math.max(t1x, t2x), Math.max(t1y, t2y), Math.max(t1z, t2z));

  if (tmax < 0 || !(tmin <= tmax)) return -1;
  return tmin >= 0 ? tmin : tmax;
}

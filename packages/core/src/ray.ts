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
 * Slab-method ray–AABB intersection test.
 *
 * Returns the parametric hit distance `t` (>= 0) or -1 if no intersection.
 * Accesses the raw buffer via a cast for zero-allocation hot paths.
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
  const dx = rayBuf[rayOffset + 3] ?? 0;
  const dy = rayBuf[rayOffset + 4] ?? 0;
  const dz = rayBuf[rayOffset + 5] ?? 0;

  const minX = aabbBuf[aabbOffset] ?? 0;
  const minY = aabbBuf[aabbOffset + 1] ?? 0;
  const minZ = aabbBuf[aabbOffset + 2] ?? 0;
  const maxX = aabbBuf[aabbOffset + 3] ?? 0;
  const maxY = aabbBuf[aabbOffset + 4] ?? 0;
  const maxZ = aabbBuf[aabbOffset + 5] ?? 0;

  // Slab method: compute per-axis t intervals.
  // When direction component is 0, use ±Infinity unless origin is outside the
  // slab (in which case there can be no intersection on that axis).
  let tmin = -Infinity;
  let tmax = Infinity;

  if (dx !== 0) {
    const invDx = 1 / dx;
    const t1 = (minX - ox) * invDx;
    const t2 = (maxX - ox) * invDx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (ox < minX || ox > maxX) {
    return -1;
  }

  if (dy !== 0) {
    const invDy = 1 / dy;
    const t1 = (minY - oy) * invDy;
    const t2 = (maxY - oy) * invDy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (oy < minY || oy > maxY) {
    return -1;
  }

  if (dz !== 0) {
    const invDz = 1 / dz;
    const t1 = (minZ - oz) * invDz;
    const t2 = (maxZ - oz) * invDz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (oz < minZ || oz > maxZ) {
    return -1;
  }

  if (tmax < 0 || tmin > tmax) return -1;
  return tmin >= 0 ? tmin : tmax;
}

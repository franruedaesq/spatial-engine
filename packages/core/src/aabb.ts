/**
 * AABB (Axis-Aligned Bounding Box) stored as a flat Float32Array slice.
 * Layout: [minX, minY, minZ, maxX, maxY, maxZ]
 */
export const AABB_STRIDE = 6;

/**
 * A pool-backed, zero-GC AABB store.
 * Each AABB occupies AABB_STRIDE floats in the underlying buffer.
 */
export class AABBPool {
  private readonly buffer: Float32Array;
  private count: number = 0;

  constructor(capacity: number) {
    this.buffer = new Float32Array(capacity * AABB_STRIDE);
  }

  /** Allocate a new AABB slot and return its index. */
  allocate(): number {
    const index = this.count;
    this.count += 1;
    return index;
  }

  /** Set the bounds of an AABB at the given index. */
  set(
    index: number,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ): void {
    const offset = index * AABB_STRIDE;
    this.buffer[offset] = minX;
    this.buffer[offset + 1] = minY;
    this.buffer[offset + 2] = minZ;
    this.buffer[offset + 3] = maxX;
    this.buffer[offset + 4] = maxY;
    this.buffer[offset + 5] = maxZ;
  }

  /** Read a single component value from the buffer. */
  get(index: number, component: number): number {
    return this.buffer[index * AABB_STRIDE + component] ?? 0;
  }

  /** Returns the number of allocated AABBs. */
  get size(): number {
    return this.count;
  }

  /** Reset the pool (all allocations freed, no GC). */
  reset(): void {
    this.count = 0;
  }
}

/**
 * Expand AABB `a` in-place so it also fully contains AABB `b`.
 */
export function aabbExpand(pool: AABBPool, a: number, b: number): void {
  const buf = (pool as unknown as { buffer: Float32Array }).buffer;
  const aOff = a * AABB_STRIDE;
  const bOff = b * AABB_STRIDE;
  buf[aOff] = Math.min(buf[aOff] ?? 0, buf[bOff] ?? 0);
  buf[aOff + 1] = Math.min(buf[aOff + 1] ?? 0, buf[bOff + 1] ?? 0);
  buf[aOff + 2] = Math.min(buf[aOff + 2] ?? 0, buf[bOff + 2] ?? 0);
  buf[aOff + 3] = Math.max(buf[aOff + 3] ?? 0, buf[bOff + 3] ?? 0);
  buf[aOff + 4] = Math.max(buf[aOff + 4] ?? 0, buf[bOff + 4] ?? 0);
  buf[aOff + 5] = Math.max(buf[aOff + 5] ?? 0, buf[bOff + 5] ?? 0);
}

/**
 * Merge AABBs `a` and `b` into `dest` (a pre-allocated slot), storing their union.
 */
export function aabbMerge(pool: AABBPool, dest: number, a: number, b: number): void {
  const buf = (pool as unknown as { buffer: Float32Array }).buffer;
  const aOff = a * AABB_STRIDE;
  const bOff = b * AABB_STRIDE;
  const dOff = dest * AABB_STRIDE;
  buf[dOff] = Math.min(buf[aOff] ?? 0, buf[bOff] ?? 0);
  buf[dOff + 1] = Math.min(buf[aOff + 1] ?? 0, buf[bOff + 1] ?? 0);
  buf[dOff + 2] = Math.min(buf[aOff + 2] ?? 0, buf[bOff + 2] ?? 0);
  buf[dOff + 3] = Math.max(buf[aOff + 3] ?? 0, buf[bOff + 3] ?? 0);
  buf[dOff + 4] = Math.max(buf[aOff + 4] ?? 0, buf[bOff + 4] ?? 0);
  buf[dOff + 5] = Math.max(buf[aOff + 5] ?? 0, buf[bOff + 5] ?? 0);
}

/**
 * Test whether two AABBs (by index in the same pool) intersect.
 */
export function aabbIntersects(pool: AABBPool, a: number, b: number): boolean {
  const aOff = a * AABB_STRIDE;
  const bOff = b * AABB_STRIDE;
  // Access via get() to stay safe with bounds, but direct buffer access is
  // equally valid when performance is critical.
  const buf = (pool as unknown as { buffer: Float32Array }).buffer;
  return (
    (buf[aOff] ?? 0) <= (buf[bOff + 3] ?? 0) &&
    (buf[aOff + 3] ?? 0) >= (buf[bOff] ?? 0) &&
    (buf[aOff + 1] ?? 0) <= (buf[bOff + 4] ?? 0) &&
    (buf[aOff + 4] ?? 0) >= (buf[bOff + 1] ?? 0) &&
    (buf[aOff + 2] ?? 0) <= (buf[bOff + 5] ?? 0) &&
    (buf[aOff + 5] ?? 0) >= (buf[bOff + 2] ?? 0)
  );
}

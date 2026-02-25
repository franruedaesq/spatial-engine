/**
 * AABB (Axis-Aligned Bounding Box) stored as a flat Float32Array slice.
 * Layout: [minX, minY, minZ, maxX, maxY, maxZ]
 */
export const AABB_STRIDE = 6;

import { ObjectPool } from './object-pool.js';

/**
 * A pool-backed, zero-GC AABB store.
 * Each AABB occupies AABB_STRIDE floats in the underlying buffer.
 *
 * When a `SharedArrayBuffer` is provided, the pool's data is accessible from
 * multiple threads (e.g. a Web Worker) with no copying.
 */
export class AABBPool {
  private readonly buffer: Float32Array;
  private count: number = 0;
  /** Free-list for individually released slots so they can be reused. */
  private readonly freeList: ObjectPool;

  constructor(capacity: number, sharedBuffer?: SharedArrayBuffer) {
    this.buffer = sharedBuffer
      ? new Float32Array(sharedBuffer, 0, capacity * AABB_STRIDE)
      : new Float32Array(capacity * AABB_STRIDE);
    this.freeList = new ObjectPool(capacity);
    // Start with an empty free-list — slots are added via release().
    // ObjectPool initialises fully available, so we drain it immediately.
    for (let i = 0; i < capacity; i++) this.freeList.acquire();
  }

  /**
   * Create an AABBPool backed by a new `SharedArrayBuffer`.
   * Both the pool and the underlying `SharedArrayBuffer` are returned so the
   * caller can transfer the buffer to a `Worker` via `postMessage`.
   */
  static createShared(capacity: number): { pool: AABBPool; sab: SharedArrayBuffer } {
    const sab = new SharedArrayBuffer(capacity * AABB_STRIDE * Float32Array.BYTES_PER_ELEMENT);
    return { pool: new AABBPool(capacity, sab), sab };
  }

  /**
   * Allocate a new AABB slot and return its index.
   * Prefers a previously released slot from the free-list before bump-allocating.
   */
  allocate(): number {
    const recycled = this.freeList.acquire();
    if (recycled !== null) return recycled;
    // Bump-allocate a fresh slot.
    const index = this.count;
    this.count += 1;
    return index;
  }

  /**
   * Release a previously allocated slot back to the free-list so it can be
   * reused by the next `allocate()` call.
   *
   * The slot's float data is **not** zeroed — callers must overwrite it with
   * `set()` before using the recycled index.
   *
   * @throws RangeError when `index` is out of range or already released.
   */
  release(index: number): void {
    this.freeList.release(index);
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

  /**
   * Returns the number of bump-allocated AABB slots.
   * Note: slots returned via `release()` are not subtracted from this count;
   * use `freeList.available` for an exact live-object count.
   */
  get size(): number {
    return this.count;
  }

  /** Reset the pool: clears both the bump counter and the free-list. */
  reset(): void {
    this.count = 0;
    // Drain any pending free-list entries so the pool looks freshly constructed.
    while (this.freeList.acquire() !== null) {/* drain */ }
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

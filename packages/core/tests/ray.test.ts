import { describe, it, expect } from 'vitest';
import { RayPool, rayIntersectsAABB, RAY_STRIDE } from '../src/ray.js';

describe('RayPool', () => {
  it('allocates rays and tracks size', () => {
    const pool = new RayPool(8);
    expect(pool.size).toBe(0);
    pool.allocate();
    expect(pool.size).toBe(1);
  });

  it('stores and retrieves ray components', () => {
    const pool = new RayPool(4);
    const idx = pool.allocate();
    pool.set(idx, 1, 2, 3, 0, 0, 1);
    expect(pool.get(idx, 0)).toBe(1);
    expect(pool.get(idx, 1)).toBe(2);
    expect(pool.get(idx, 2)).toBe(3);
    expect(pool.get(idx, 3)).toBe(0);
    expect(pool.get(idx, 4)).toBe(0);
    expect(pool.get(idx, 5)).toBe(1);
  });

  it('resets without allocating new memory', () => {
    const pool = new RayPool(4);
    pool.allocate();
    pool.reset();
    expect(pool.size).toBe(0);
    expect(pool.allocate()).toBe(0);
  });

  it('RAY_STRIDE is 6', () => {
    expect(RAY_STRIDE).toBe(6);
  });
});

describe('rayIntersectsAABB', () => {
  it('returns hit distance for a ray hitting a box', () => {
    // Ray starting at (-5, 0.5, 0.5) pointing in +X direction
    const rayBuf = new Float32Array([-5, 0.5, 0.5, 1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    const t = rayIntersectsAABB(rayBuf, 0, aabbBuf, 0);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeCloseTo(5, 5);
  });

  it('returns -1 for a ray that misses the box', () => {
    // Ray starting at (0, 5, 0) pointing in +X direction – misses box at [0..1]^3
    const rayBuf = new Float32Array([0, 5, 0, 1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    const t = rayIntersectsAABB(rayBuf, 0, aabbBuf, 0);
    expect(t).toBe(-1);
  });

  it('returns -1 for a ray that points away from the box', () => {
    // Ray starting beyond the box, pointing further away
    const rayBuf = new Float32Array([5, 0.5, 0.5, 1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    const t = rayIntersectsAABB(rayBuf, 0, aabbBuf, 0);
    expect(t).toBe(-1);
  });

  it('returns a valid t for a ray originating inside the box', () => {
    // Ray inside the box
    const rayBuf = new Float32Array([0.5, 0.5, 0.5, 1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    const t = rayIntersectsAABB(rayBuf, 0, aabbBuf, 0);
    expect(t).toBeGreaterThanOrEqual(0);
  });
});

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
  // ── axis-aligned hits ──────────────────────────────────────────────────────

  it('returns exact hit distance for a +X axis ray', () => {
    // Ray at (-5, 0.5, 0.5) → +X; box [0,0,0]-[1,1,1]; should hit at t=5
    const rayBuf  = new Float32Array([-5, 0.5, 0.5, 1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBeCloseTo(5, 5);
  });

  it('returns exact hit distance for a +Y axis ray', () => {
    // Ray at (0.5, -3, 0.5) → +Y; should hit at t=3
    const rayBuf  = new Float32Array([0.5, -3, 0.5, 0, 1, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBeCloseTo(3, 5);
  });

  it('returns exact hit distance for a +Z axis ray', () => {
    // Ray at (0.5, 0.5, -3) → +Z; should hit at t=3
    const rayBuf  = new Float32Array([0.5, 0.5, -3, 0, 0, 1]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBeCloseTo(3, 5);
  });

  it('returns exact hit distance for a negative-direction ray', () => {
    // Ray at (5, 0.5, 0.5) → -X; enters box at x=1 (t=4), exits at x=0 (t=5)
    const rayBuf  = new Float32Array([5, 0.5, 0.5, -1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBeCloseTo(4, 5);
  });

  // ── diagonal rays ──────────────────────────────────────────────────────────

  it('returns exact hit distance for a diagonal ray in the YZ plane (dx=0)', () => {
    // Ray at (0.5, -4, -4) with direction (0, 1/√2, 1/√2); box [0,0,0]-[1,1,1]
    // Y slab: t_near = 4√2, Z slab: t_near = 4√2 → t = 4√2
    const inv = 1 / Math.SQRT2;
    const rayBuf  = new Float32Array([0.5, -4, -4, 0, inv, inv]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBeCloseTo(4 * Math.SQRT2, 4);
  });

  it('returns exact hit distance for a fully diagonal ray (all axes)', () => {
    // Ray at (-3, -3, -3) pointing toward (1,1,1); direction (1,1,1)/√3
    // X slab: t1=(0-(-3))*(√3)=3√3, Y slab: same, Z slab: same → t = 3√3
    const inv = 1 / Math.sqrt(3);
    const rayBuf  = new Float32Array([-3, -3, -3, inv, inv, inv]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBeCloseTo(3 * Math.sqrt(3), 4);
  });

  // ── misses ────────────────────────────────────────────────────────────────

  it('returns -1 for a ray that misses the box laterally', () => {
    // Ray at (0, 5, 0) → +X; passes above the box
    const rayBuf  = new Float32Array([0, 5, 0, 1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBe(-1);
  });

  it('returns -1 for a ray that points away from the box', () => {
    // Ray starts past the box and keeps going in the same direction
    const rayBuf  = new Float32Array([5, 0.5, 0.5, 1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBe(-1);
  });

  it('returns -1 for a parallel ray outside the slab', () => {
    // Ray at (0.5, 5, 0.5) → +Z; Y coordinate is outside [0,1]
    const rayBuf  = new Float32Array([0.5, 5, 0.5, 0, 0, 1]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBe(-1);
  });

  it('returns -1 for a diagonal ray that misses', () => {
    // Ray aimed past the corner of the box
    const inv = 1 / Math.SQRT2;
    const rayBuf  = new Float32Array([0, 3, 0.5, inv, -inv, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBe(-1);
  });

  // ── inside-box origin ─────────────────────────────────────────────────────

  it('returns the exit distance when the ray originates inside the box', () => {
    // Ray at (0.5, 0.5, 0.5) → +X; exits the right face at t=0.5
    const rayBuf  = new Float32Array([0.5, 0.5, 0.5, 1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBeCloseTo(0.5, 5);
  });

  // ── non-zero buffer offsets ───────────────────────────────────────────────

  it('respects non-zero ray buffer offset', () => {
    // Ray at index 1 (offset 6): origin (-5, 0.5, 0.5), direction (1, 0, 0)
    const rayBuf  = new Float32Array([0, 0, 0, 0, 0, 0, -5, 0.5, 0.5, 1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 1, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 6, aabbBuf, 0)).toBeCloseTo(5, 5);
  });

  it('respects non-zero AABB buffer offset', () => {
    // AABB at offset 6: [2, 0, 0, 3, 1, 1]; ray at (-5, 0.5, 0.5) → +X; t=7
    const rayBuf  = new Float32Array([-5, 0.5, 0.5, 1, 0, 0]);
    const aabbBuf = new Float32Array([0, 0, 0, 0, 0, 0, 2, 0, 0, 3, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 6)).toBeCloseTo(7, 5);
  });

  // ── larger / asymmetric boxes ─────────────────────────────────────────────

  it('returns correct t for a ray hitting a non-unit box', () => {
    // Ray at (-10, 0.5, 0.5) → +X; box [-2,0,0]-[2,1,1]; enters at x=-2 → t=8
    const rayBuf  = new Float32Array([-10, 0.5, 0.5, 1, 0, 0]);
    const aabbBuf = new Float32Array([-2, 0, 0, 2, 1, 1]);
    expect(rayIntersectsAABB(rayBuf, 0, aabbBuf, 0)).toBeCloseTo(8, 5);
  });
});

import { describe, it, expect } from 'vitest';
import { AABBPool, aabbIntersects, AABB_STRIDE } from '../src/aabb.js';

describe('AABBPool', () => {
  it('allocates AABBs and tracks size', () => {
    const pool = new AABBPool(10);
    expect(pool.size).toBe(0);
    pool.allocate();
    expect(pool.size).toBe(1);
    pool.allocate();
    expect(pool.size).toBe(2);
  });

  it('stores and retrieves component values', () => {
    const pool = new AABBPool(4);
    const idx = pool.allocate();
    pool.set(idx, -1, -2, -3, 1, 2, 3);
    expect(pool.get(idx, 0)).toBe(-1);
    expect(pool.get(idx, 1)).toBe(-2);
    expect(pool.get(idx, 2)).toBe(-3);
    expect(pool.get(idx, 3)).toBe(1);
    expect(pool.get(idx, 4)).toBe(2);
    expect(pool.get(idx, 5)).toBe(3);
  });

  it('resets without allocating new memory', () => {
    const pool = new AABBPool(4);
    pool.allocate();
    pool.allocate();
    pool.reset();
    expect(pool.size).toBe(0);
    // Re-allocate after reset
    const idx = pool.allocate();
    expect(idx).toBe(0);
  });

  it('AABB_STRIDE is 6', () => {
    expect(AABB_STRIDE).toBe(6);
  });
});

describe('aabbIntersects', () => {
  it('returns true for two overlapping AABBs', () => {
    const pool = new AABBPool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    pool.set(a, 0, 0, 0, 2, 2, 2);
    pool.set(b, 1, 1, 1, 3, 3, 3);
    expect(aabbIntersects(pool, a, b)).toBe(true);
  });

  it('returns false for two non-overlapping AABBs', () => {
    const pool = new AABBPool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    pool.set(a, 0, 0, 0, 1, 1, 1);
    pool.set(b, 2, 2, 2, 3, 3, 3);
    expect(aabbIntersects(pool, a, b)).toBe(false);
  });

  it('returns true for touching AABBs (shared face)', () => {
    const pool = new AABBPool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    pool.set(a, 0, 0, 0, 1, 1, 1);
    pool.set(b, 1, 0, 0, 2, 1, 1);
    expect(aabbIntersects(pool, a, b)).toBe(true);
  });

  it('returns false when separated on Z axis only', () => {
    const pool = new AABBPool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    pool.set(a, 0, 0, 0, 1, 1, 1);
    pool.set(b, 0, 0, 2, 1, 1, 3);
    expect(aabbIntersects(pool, a, b)).toBe(false);
  });
});

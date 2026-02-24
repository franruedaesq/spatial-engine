import { describe, it, expect } from 'vitest';
import { AABBPool, aabbIntersects, aabbExpand, aabbMerge, AABB_STRIDE } from '../src/aabb.js';

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

describe('aabbExpand', () => {
  it('expands AABB a in-place to contain AABB b', () => {
    const pool = new AABBPool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    pool.set(a, 0, 0, 0, 1, 1, 1);
    pool.set(b, -1, -1, -1, 2, 2, 2);
    aabbExpand(pool, a, b);
    expect(pool.get(a, 0)).toBe(-1); // minX
    expect(pool.get(a, 1)).toBe(-1); // minY
    expect(pool.get(a, 2)).toBe(-1); // minZ
    expect(pool.get(a, 3)).toBe(2);  // maxX
    expect(pool.get(a, 4)).toBe(2);  // maxY
    expect(pool.get(a, 5)).toBe(2);  // maxZ
  });

  it('does not shrink AABB a when b is fully inside a', () => {
    const pool = new AABBPool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    pool.set(a, -2, -2, -2, 2, 2, 2);
    pool.set(b, -1, -1, -1, 1, 1, 1);
    aabbExpand(pool, a, b);
    expect(pool.get(a, 0)).toBe(-2);
    expect(pool.get(a, 3)).toBe(2);
  });

  it('after expand the merged box intersects both originals', () => {
    const pool = new AABBPool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    pool.set(a, 0, 0, 0, 1, 1, 1);
    pool.set(b, 3, 3, 3, 4, 4, 4);
    aabbExpand(pool, a, b);
    // a now covers [0..4]^3, so it intersects both original positions
    expect(aabbIntersects(pool, a, b)).toBe(true);
  });
});

describe('aabbMerge', () => {
  it('merges two AABBs into a destination slot', () => {
    const pool = new AABBPool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    const dest = pool.allocate();
    pool.set(a, 0, 0, 0, 1, 1, 1);
    pool.set(b, 2, 2, 2, 3, 3, 3);
    aabbMerge(pool, dest, a, b);
    expect(pool.get(dest, 0)).toBe(0); // minX
    expect(pool.get(dest, 1)).toBe(0); // minY
    expect(pool.get(dest, 2)).toBe(0); // minZ
    expect(pool.get(dest, 3)).toBe(3); // maxX
    expect(pool.get(dest, 4)).toBe(3); // maxY
    expect(pool.get(dest, 5)).toBe(3); // maxZ
  });

  it('does not modify source AABBs', () => {
    const pool = new AABBPool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    const dest = pool.allocate();
    pool.set(a, 0, 0, 0, 1, 1, 1);
    pool.set(b, 2, 2, 2, 3, 3, 3);
    aabbMerge(pool, dest, a, b);
    // a unchanged
    expect(pool.get(a, 3)).toBe(1);
    // b unchanged
    expect(pool.get(b, 0)).toBe(2);
  });

  it('merged AABB intersects both sources', () => {
    const pool = new AABBPool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    const dest = pool.allocate();
    pool.set(a, 0, 0, 0, 1, 1, 1);
    pool.set(b, 4, 4, 4, 5, 5, 5);
    aabbMerge(pool, dest, a, b);
    expect(aabbIntersects(pool, dest, a)).toBe(true);
    expect(aabbIntersects(pool, dest, b)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { AABBPool, AABB_STRIDE } from '../src/aabb.js';
import { OctreeNodePool, NODE_STRIDE } from '../src/octree-node.js';
import { RayPool, RAY_STRIDE } from '../src/ray.js';

describe('SharedArrayBuffer pool factories', () => {
  describe('AABBPool.createShared', () => {
    it('returns a pool and a SharedArrayBuffer of the correct byte length', () => {
      const capacity = 16;
      const { pool, sab } = AABBPool.createShared(capacity);

      expect(sab).toBeInstanceOf(SharedArrayBuffer);
      expect(sab.byteLength).toBe(capacity * AABB_STRIDE * Float32Array.BYTES_PER_ELEMENT);
      expect(pool).toBeInstanceOf(AABBPool);
    });

    it('data written to the pool is visible via a second view of the same SAB', () => {
      const { pool, sab } = AABBPool.createShared(4);

      const idx = pool.allocate();
      pool.set(idx, 1, 2, 3, 4, 5, 6);

      // A raw Float32Array view of the same SAB must see the same values.
      const view = new Float32Array(sab);
      expect(view[0]).toBeCloseTo(1);
      expect(view[1]).toBeCloseTo(2);
      expect(view[2]).toBeCloseTo(3);
      expect(view[3]).toBeCloseTo(4);
      expect(view[4]).toBeCloseTo(5);
      expect(view[5]).toBeCloseTo(6);
    });

    it('a second AABBPool constructed from the same SAB shares data', () => {
      const capacity = 8;
      const { pool: poolA, sab } = AABBPool.createShared(capacity);

      const idx = poolA.allocate();
      poolA.set(idx, 10, 20, 30, 40, 50, 60);

      const poolB = new AABBPool(capacity, sab);
      // poolB has count = 0 but the data is already in the SAB.
      expect(poolB.get(idx, 0)).toBeCloseTo(10);
      expect(poolB.get(idx, 3)).toBeCloseTo(40);
    });

    it('constructing with a SharedArrayBuffer produces the same results as without', () => {
      const capacity = 4;
      const sab = new SharedArrayBuffer(capacity * AABB_STRIDE * Float32Array.BYTES_PER_ELEMENT);
      const pool = new AABBPool(capacity, sab);

      const idx = pool.allocate();
      pool.set(idx, -1, -2, -3, 1, 2, 3);

      expect(pool.get(idx, 0)).toBeCloseTo(-1);
      expect(pool.get(idx, 5)).toBeCloseTo(3);
    });
  });

  describe('OctreeNodePool.createShared', () => {
    it('returns a pool and a SharedArrayBuffer of the correct byte length', () => {
      const capacity = 32;
      const { pool, sab } = OctreeNodePool.createShared(capacity);

      expect(sab).toBeInstanceOf(SharedArrayBuffer);
      expect(sab.byteLength).toBe(capacity * NODE_STRIDE * Float32Array.BYTES_PER_ELEMENT);
      expect(pool).toBeInstanceOf(OctreeNodePool);
    });

    it('node allocations are visible via a raw view of the SAB', () => {
      const { pool, sab } = OctreeNodePool.createShared(8);
      const nodeIdx = pool.allocate();
      pool.setAABB(nodeIdx, -5, -5, -5, 5, 5, 5);

      const view = new Float32Array(sab);
      // AABB starts at offset 0 for node 0.
      expect(view[0]).toBeCloseTo(-5);
      expect(view[3]).toBeCloseTo(5);
    });

    it('constructing with a SharedArrayBuffer produces the same results as without', () => {
      const capacity = 16;
      const sab = new SharedArrayBuffer(capacity * NODE_STRIDE * Float32Array.BYTES_PER_ELEMENT);
      const pool = new OctreeNodePool(capacity, sab);
      const nodeIdx = pool.allocate();

      expect(pool.getFirstChild(nodeIdx)).toBe(-1);
      expect(pool.getParent(nodeIdx)).toBe(-1);
    });
  });

  describe('RayPool.createShared', () => {
    it('returns a pool and a SharedArrayBuffer of the correct byte length', () => {
      const capacity = 64;
      const { pool, sab } = RayPool.createShared(capacity);

      expect(sab).toBeInstanceOf(SharedArrayBuffer);
      expect(sab.byteLength).toBe(capacity * RAY_STRIDE * Float32Array.BYTES_PER_ELEMENT);
      expect(pool).toBeInstanceOf(RayPool);
    });

    it('ray data written to the pool is visible via a second view of the SAB', () => {
      const { pool, sab } = RayPool.createShared(4);

      const idx = pool.allocate();
      pool.set(idx, 0, 1, 0, 0, 0, 1);

      const view = new Float32Array(sab);
      expect(view[0]).toBeCloseTo(0); // ox
      expect(view[1]).toBeCloseTo(1); // oy
      expect(view[5]).toBeCloseTo(1); // dz
    });

    it('constructing with a SharedArrayBuffer produces the same results as without', () => {
      const capacity = 8;
      const sab = new SharedArrayBuffer(capacity * RAY_STRIDE * Float32Array.BYTES_PER_ELEMENT);
      const pool = new RayPool(capacity, sab);

      const idx = pool.allocate();
      pool.set(idx, 1, 2, 3, 0, 1, 0);

      expect(pool.get(idx, 0)).toBeCloseTo(1);
      expect(pool.get(idx, 4)).toBeCloseTo(1);
    });
  });
});

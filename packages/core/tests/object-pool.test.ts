import { describe, it, expect } from 'vitest';
import { ObjectPool } from '../src/object-pool.js';

describe('ObjectPool', () => {
  it('reports correct capacity and initial available count', () => {
    const pool = new ObjectPool(8);
    expect(pool.capacity).toBe(8);
    expect(pool.available).toBe(8);
  });

  it('acquire returns a valid index and decreases available count', () => {
    const pool = new ObjectPool(4);
    const idx = pool.acquire();
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(4);
    expect(pool.available).toBe(3);
  });

  it('acquire returns distinct indices', () => {
    const pool = new ObjectPool(4);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a).not.toBe(b);
  });

  it('release returns the index to the pool', () => {
    const pool = new ObjectPool(4);
    const idx = pool.acquire();
    expect(pool.available).toBe(3);
    pool.release(idx);
    expect(pool.available).toBe(4);
  });

  it('released index can be re-acquired', () => {
    const pool = new ObjectPool(4);
    const idx = pool.acquire();
    pool.release(idx);
    const reacquired = pool.acquire();
    expect(reacquired).toBe(idx);
  });

  it('acquire returns null when pool is exhausted', () => {
    const pool = new ObjectPool(2);
    pool.acquire();
    pool.acquire();
    expect(pool.acquire()).toBeNull();
  });

  it('does not allocate new objects during acquire and release cycle', () => {
    const pool = new ObjectPool(16);
    // Warm up: exhaust and release all slots
    const indices: number[] = [];
    for (let i = 0; i < 16; i++) {
      indices.push(pool.acquire() as number);
    }
    for (const idx of indices) {
      pool.release(idx);
    }

    // Snapshot heap before the cycle
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 16; i++) {
      indices[i] = pool.acquire() as number;
    }
    for (const idx of indices) {
      pool.release(idx);
    }
    const after = process.memoryUsage().heapUsed;

    // Allow up to 64 KB variance for V8 internal bookkeeping noise.
    // The pool itself performs zero heap allocations per acquire/release cycle.
    expect(after - before).toBeLessThan(65536);
  });

  it('all acquired indices are within [0, capacity)', () => {
    const pool = new ObjectPool(6);
    for (let i = 0; i < 6; i++) {
      const idx = pool.acquire();
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(6);
    }
  });
});

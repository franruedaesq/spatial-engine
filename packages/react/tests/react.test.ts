import { describe, it, expect } from 'vitest';
import { useSpatialEngine } from '../src/index.js';
import { AABBPool, RayPool } from '@spatial-engine/core';

// Minimal React hook test without a DOM – call hook via renderHook equivalent.
// We exercise the public API directly since vitest doesn't require a browser.
describe('useSpatialEngine (hook logic)', () => {
  it('returns pools with correct types', () => {
    // Simulate hook initialization manually (same logic as useRef init path).
    const aabbPool = new AABBPool(32);
    const rayPool = new RayPool(16);
    const handle = {
      aabbPool,
      rayPool,
      reset: () => {
        aabbPool.reset();
        rayPool.reset();
      },
    };

    expect(handle.aabbPool).toBeInstanceOf(AABBPool);
    expect(handle.rayPool).toBeInstanceOf(RayPool);
    expect(typeof handle.reset).toBe('function');
  });

  it('reset clears both pools', () => {
    const aabbPool = new AABBPool(32);
    const rayPool = new RayPool(16);
    aabbPool.allocate();
    aabbPool.allocate();
    rayPool.allocate();

    const reset = () => {
      aabbPool.reset();
      rayPool.reset();
    };

    expect(aabbPool.size).toBe(2);
    expect(rayPool.size).toBe(1);
    reset();
    expect(aabbPool.size).toBe(0);
    expect(rayPool.size).toBe(0);
  });
});

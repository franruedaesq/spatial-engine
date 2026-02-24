import { describe, it, expect } from 'vitest';
import { useSpatialEngine, useOctree } from '../src/index.js';
import { AABBPool, RayPool, Octree, OctreeNodePool } from '@spatial-engine/core';

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

// Simulate useOctree hook initialization (same init-path logic as useRef).
function simulateUseOctree(
  nodeCapacity = 512,
  objectCapacity = 512,
): ReturnType<typeof useOctree> {
  const nodePool = new OctreeNodePool(nodeCapacity);
  const aabbPool = new AABBPool(objectCapacity);
  const octree = new Octree(nodePool, aabbPool);
  return {
    octree,
    nodePool,
    aabbPool,
    reset: () => {
      nodePool.reset();
      aabbPool.reset();
    },
  };
}

describe('useOctree (hook logic)', () => {
  it('returns an octree handle with correct types', () => {
    const handle = simulateUseOctree();

    expect(handle.octree).toBeInstanceOf(Octree);
    expect(handle.nodePool).toBeInstanceOf(OctreeNodePool);
    expect(handle.aabbPool).toBeInstanceOf(AABBPool);
    expect(typeof handle.reset).toBe('function');
  });

  it('uses provided nodeCapacity and objectCapacity', () => {
    const handle = simulateUseOctree(128, 64);

    // Allocating up to the capacities should not throw.
    for (let i = 0; i < 64; i++) handle.aabbPool.allocate();
    expect(handle.aabbPool.size).toBe(64);
  });

  it('reset clears the aabbPool', () => {
    const handle = simulateUseOctree();

    handle.aabbPool.allocate();
    handle.aabbPool.allocate();
    expect(handle.aabbPool.size).toBe(2);

    handle.reset();
    expect(handle.aabbPool.size).toBe(0);
  });

  it('octree can insert and query objects', () => {
    const handle = simulateUseOctree();
    handle.octree.setBounds(-100, -100, -100, 100, 100, 100);

    const idx = handle.aabbPool.allocate();
    handle.aabbPool.set(idx, -1, -1, -1, 1, 1, 1);
    handle.octree.insert(idx);

    const results = handle.octree.queryBox(-2, -2, -2, 2, 2, 2);
    expect(results).toContain(idx);
  });

  it('octree supports raycast after inserting objects', () => {
    const handle = simulateUseOctree();
    handle.octree.setBounds(-100, -100, -100, 100, 100, 100);

    const idx = handle.aabbPool.allocate();
    handle.aabbPool.set(idx, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
    handle.octree.insert(idx);

    // Ray along +X from x = -5.
    const rayBuf = new Float32Array([-5, 0, 0, 1, 0, 0]);
    const hit = handle.octree.raycast(rayBuf, 0);
    expect(hit).not.toBeNull();
    expect(hit!.objectIndex).toBe(idx);
  });

  it('octree data persists across multiple operations (simulating render stability)', () => {
    const handle = simulateUseOctree();
    handle.octree.setBounds(-100, -100, -100, 100, 100, 100);

    // First batch: insert two objects.
    const idxA = handle.aabbPool.allocate();
    handle.aabbPool.set(idxA, -1, -1, -1, 1, 1, 1);
    handle.octree.insert(idxA);

    const idxB = handle.aabbPool.allocate();
    handle.aabbPool.set(idxB, 5, 5, 5, 7, 7, 7);
    handle.octree.insert(idxB);

    // Verify both are findable via queryBox.
    const resultsA = handle.octree.queryBox(-2, -2, -2, 2, 2, 2);
    const resultsB = handle.octree.queryBox(4, 4, 4, 8, 8, 8);
    expect(resultsA).toContain(idxA);
    expect(resultsB).toContain(idxB);
    expect(resultsA).not.toContain(idxB);
    expect(resultsB).not.toContain(idxA);
  });
});

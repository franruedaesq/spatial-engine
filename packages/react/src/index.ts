import { useRef, useEffect } from 'react';
import { AABBPool, RayPool, OctreeNodePool, Octree } from '@spatial-engine/core';

export interface SpatialEngineOptions {
  /** Maximum number of AABBs to pre-allocate in the pool. Default: 1024 */
  aabbCapacity?: number;
  /** Maximum number of Rays to pre-allocate in the pool. Default: 256 */
  rayCapacity?: number;
}

export interface SpatialEngineHandle {
  aabbPool: AABBPool;
  rayPool: RayPool;
  /** Reset both pools (call once per frame before re-populating). */
  reset: () => void;
}

/**
 * React hook that creates and manages a pair of zero-GC spatial pools
 * backed by Float32Arrays. The pools are stable across renders – call
 * `handle.reset()` at the start of each animation frame to free all
 * allocations without triggering GC.
 */
export function useSpatialEngine(
  options: SpatialEngineOptions = {},
): SpatialEngineHandle {
  const { aabbCapacity = 1024, rayCapacity = 256 } = options;

  const handleRef = useRef<SpatialEngineHandle | null>(null);

  if (handleRef.current === null) {
    const aabbPool = new AABBPool(aabbCapacity);
    const rayPool = new RayPool(rayCapacity);
    handleRef.current = {
      aabbPool,
      rayPool,
      reset: () => {
        aabbPool.reset();
        rayPool.reset();
      },
    };
  }

  // Re-create pools if capacity options change (rare but supported).
  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null) return;
    const newAabb = new AABBPool(aabbCapacity);
    const newRay = new RayPool(rayCapacity);
    handle.aabbPool = newAabb;
    handle.rayPool = newRay;
    handle.reset = () => {
      newAabb.reset();
      newRay.reset();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aabbCapacity, rayCapacity]);

  return handleRef.current;
}

export interface OctreeOptions {
  /** Number of octree node slots to pre-allocate. Default: 512 */
  nodeCapacity?: number;
  /** Number of object (AABB) slots to pre-allocate. Default: 512 */
  objectCapacity?: number;
}

export interface OctreeHandle {
  octree: Octree;
  nodePool: OctreeNodePool;
  aabbPool: AABBPool;
  /** Reset both pools (call once per frame before re-populating). */
  reset: () => void;
}

/**
 * React hook that creates and manages a zero-GC Octree backed by flat
 * Float32Array pools. The octree and pools are stable across renders.
 * Call `handle.reset()` at the start of each animation frame to free all
 * object allocations without triggering GC, then re-insert objects for that
 * frame.
 */
export function useOctree(options: OctreeOptions = {}): OctreeHandle {
  const { nodeCapacity = 512, objectCapacity = 512 } = options;

  const handleRef = useRef<OctreeHandle | null>(null);

  if (handleRef.current === null) {
    const nodePool = new OctreeNodePool(nodeCapacity);
    const aabbPool = new AABBPool(objectCapacity);
    const octree = new Octree(nodePool, aabbPool);
    handleRef.current = {
      octree,
      nodePool,
      aabbPool,
      reset: () => {
        nodePool.reset();
        aabbPool.reset();
      },
    };
  }

  // Re-create pools if capacity options change (rare but supported).
  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null) return;
    const newNodePool = new OctreeNodePool(nodeCapacity);
    const newAabbPool = new AABBPool(objectCapacity);
    const newOctree = new Octree(newNodePool, newAabbPool);
    handle.octree = newOctree;
    handle.nodePool = newNodePool;
    handle.aabbPool = newAabbPool;
    handle.reset = () => {
      newNodePool.reset();
      newAabbPool.reset();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCapacity, objectCapacity]);

  return handleRef.current;
}


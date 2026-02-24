import { useRef, useEffect } from 'react';
import { AABBPool, RayPool } from '@spatial-engine/core';

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

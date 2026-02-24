import type { Box3, Ray } from 'three';
import { AABBPool, RayPool, rayIntersectsAABB, RAY_STRIDE } from '@spatial-engine/core';

export { ThreeSynchronizer } from './synchronizer.js';

/**
 * Convert a Three.js Box3 into an AABB slot in the pool.
 * Returns the allocated index.
 */
export function box3ToAABB(pool: AABBPool, box: Box3): number {
  const index = pool.allocate();
  pool.set(
    index,
    box.min.x,
    box.min.y,
    box.min.z,
    box.max.x,
    box.max.y,
    box.max.z,
  );
  return index;
}

/**
 * Convert a Three.js Ray into a Ray slot in the pool.
 * Returns the allocated index.
 */
export function threeRayToPool(pool: RayPool, ray: Ray): number {
  const index = pool.allocate();
  pool.set(
    index,
    ray.origin.x,
    ray.origin.y,
    ray.origin.z,
    ray.direction.x,
    ray.direction.y,
    ray.direction.z,
  );
  return index;
}

/**
 * Fill a pre-allocated (or newly created) Float32Array with the ray data in
 * the flat format `[ox, oy, oz, dx, dy, dz]` expected by the core query engine.
 *
 * @param ray The Three.js Ray to convert.
 * @param buf Optional pre-allocated Float32Array of length RAY_STRIDE (6).
 *            If omitted a new buffer is created. Pass a cached buffer to
 *            avoid allocation and stay zero-GC.
 * @returns The filled buffer (same reference as `buf` when provided).
 */
export function rayToFlatArray(ray: Ray, buf: Float32Array = new Float32Array(RAY_STRIDE)): Float32Array {
  buf[0] = ray.origin.x;
  buf[1] = ray.origin.y;
  buf[2] = ray.origin.z;
  buf[3] = ray.direction.x;
  buf[4] = ray.direction.y;
  buf[5] = ray.direction.z;
  return buf;
}

/**
 * Test whether a Three.js Ray intersects a Three.js Box3.
 * Returns the parametric hit distance `t` or -1 on miss.
 * Uses pre-allocated Float32Array buffers to stay zero-GC.
 */
const _rayBuf = new Float32Array(RAY_STRIDE);
const _aabbBuf = new Float32Array(6);

export function rayBox3Intersect(ray: Ray, box: Box3): number {
  _rayBuf[0] = ray.origin.x;
  _rayBuf[1] = ray.origin.y;
  _rayBuf[2] = ray.origin.z;
  _rayBuf[3] = ray.direction.x;
  _rayBuf[4] = ray.direction.y;
  _rayBuf[5] = ray.direction.z;

  _aabbBuf[0] = box.min.x;
  _aabbBuf[1] = box.min.y;
  _aabbBuf[2] = box.min.z;
  _aabbBuf[3] = box.max.x;
  _aabbBuf[4] = box.max.y;
  _aabbBuf[5] = box.max.z;

  return rayIntersectsAABB(_rayBuf, 0, _aabbBuf, 0);
}

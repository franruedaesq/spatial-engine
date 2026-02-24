import { describe, it, expect } from 'vitest';
import { Box3, Vector3, Ray } from 'three';
import { box3ToAABB, threeRayToPool, rayBox3Intersect } from '../src/index.js';
import { AABBPool, RayPool } from '@spatial-engine/core';

describe('box3ToAABB', () => {
  it('converts a Three.js Box3 into an AABB pool entry', () => {
    const pool = new AABBPool(4);
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 2, 3));
    const idx = box3ToAABB(pool, box);
    expect(idx).toBe(0);
    expect(pool.get(idx, 0)).toBe(0); // minX
    expect(pool.get(idx, 4)).toBe(2); // maxY
    expect(pool.get(idx, 5)).toBe(3); // maxZ
  });
});

describe('threeRayToPool', () => {
  it('converts a Three.js Ray into a RayPool entry', () => {
    const pool = new RayPool(4);
    const ray = new Ray(new Vector3(1, 2, 3), new Vector3(0, 0, 1));
    const idx = threeRayToPool(pool, ray);
    expect(idx).toBe(0);
    expect(pool.get(idx, 0)).toBe(1); // ox
    expect(pool.get(idx, 5)).toBe(1); // dz
  });
});

describe('rayBox3Intersect', () => {
  it('returns positive t when ray hits box', () => {
    const ray = new Ray(new Vector3(-5, 0.5, 0.5), new Vector3(1, 0, 0));
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    const t = rayBox3Intersect(ray, box);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeCloseTo(5, 5);
  });

  it('returns -1 when ray misses box', () => {
    const ray = new Ray(new Vector3(0, 5, 0), new Vector3(1, 0, 0));
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    expect(rayBox3Intersect(ray, box)).toBe(-1);
  });
});

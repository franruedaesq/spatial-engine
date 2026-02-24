import { describe, it, expect } from 'vitest';
import { Octree } from '../src/octree.js';
import { OctreeNodePool } from '../src/octree-node.js';
import { AABBPool } from '../src/aabb.js';

function makeAABB(
  pool: AABBPool,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): number {
  const idx = pool.allocate();
  pool.set(idx, minX, minY, minZ, maxX, maxY, maxZ);
  return idx;
}

/** Build a ray buffer: [ox, oy, oz, dx, dy, dz] */
function makeRayBuf(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
): Float32Array {
  return new Float32Array([ox, oy, oz, dx, dy, dz]);
}

/** Populate the octree with 8 AABBs (one per octant) and 1 extra to force subdivision. */
function buildSubdividedOctree(
  nodePool: OctreeNodePool,
  aabbPool: AABBPool,
): { octree: Octree; items: number[] } {
  const octree = new Octree(nodePool, aabbPool);
  octree.setBounds(-50, -50, -50, 50, 50, 50);

  const signs = [-1, 1] as const;
  const items: number[] = [];
  for (const sx of signs) {
    for (const sy of signs) {
      for (const sz of signs) {
        const x = sx * 40;
        const y = sy * 40;
        const z = sz * 40;
        items.push(makeAABB(aabbPool, x, y, z, x + 1, y + 1, z + 1));
      }
    }
  }
  for (const item of items) octree.insert(item);
  // 9th item triggers subdivision of root.
  const extra = makeAABB(aabbPool, 10, 10, 10, 11, 11, 11);
  items.push(extra);
  octree.insert(extra);

  return { octree, items };
}

describe('Octree – raycast traversal', () => {
  it('returns null when the ray misses the root AABB entirely', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    octree.insert(makeAABB(aabbPool, 5, 5, 5, 6, 6, 6));

    // Ray flies way above the root AABB (Y = 200 is outside [-50, 50]).
    const ray = makeRayBuf(0, 200, 0, 1, 0, 0);
    expect(octree.raycast(ray, 0)).toBeNull();
  });

  it('returns null when the ray hits the root AABB but misses all objects', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    // Single small object far from the ray path.
    octree.insert(makeAABB(aabbPool, 45, 45, 45, 46, 46, 46));

    // Ray travels along the -X side of the octree, missing the object.
    const ray = makeRayBuf(-60, -48, -48, 1, 0, 0);
    expect(octree.raycast(ray, 0)).toBeNull();
  });

  it('returns the hit object and correct t for a single object along the ray', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    // Box [10, 0, 0]-[11, 1, 1]; ray from (-5, 0.5, 0.5) → +X; should hit at t=15.
    const obj = makeAABB(aabbPool, 10, 0, 0, 11, 1, 1);
    octree.insert(obj);

    const ray = makeRayBuf(-5, 0.5, 0.5, 1, 0, 0);
    const hit = octree.raycast(ray, 0);

    expect(hit).not.toBeNull();
    expect(hit!.objectIndex).toBe(obj);
    expect(hit!.t).toBeCloseTo(15, 4);
  });

  it('returns the closer of two objects along the same ray', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    // Near box [5, 0, 0]-[6, 1, 1]; t = 15 from ray origin (-10, 0.5, 0.5).
    const near = makeAABB(aabbPool, 5, 0, 0, 6, 1, 1);
    // Far box [20, 0, 0]-[21, 1, 1]; t = 30.
    const far = makeAABB(aabbPool, 20, 0, 0, 21, 1, 1);
    octree.insert(near);
    octree.insert(far);

    const ray = makeRayBuf(-10, 0.5, 0.5, 1, 0, 0);
    const hit = octree.raycast(ray, 0);

    expect(hit).not.toBeNull();
    expect(hit!.objectIndex).toBe(near);
    expect(hit!.t).toBeCloseTo(15, 4);
  });

  it('only hits objects in the octant(s) intersected by the ray on a subdivided tree', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const { octree, items } = buildSubdividedOctree(nodePool, aabbPool);

    // The octant items are at ±40 corners. Ray along +X axis at y=-40.5, z=-40.5
    // should only intersect the (-X,-Y,-Z) corner item (at [-40,-40,-40]-[-39,-39,-39]).
    // That item is items[0] (sx=-1, sy=-1, sz=-1 → x=-40, y=-40, z=-40).
    const target = items[0]!;
    const ray = makeRayBuf(-60, -39.5, -39.5, 1, 0, 0);
    const hit = octree.raycast(ray, 0);

    expect(hit).not.toBeNull();
    expect(hit!.objectIndex).toBe(target);
  });

  it('returns the hit when the ray originates inside the root AABB', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    // Box at [30, -0.5, -0.5]-[31, 0.5, 0.5]; ray origin inside root at (0, 0, 0) → +X.
    const obj = makeAABB(aabbPool, 30, -0.5, -0.5, 31, 0.5, 0.5);
    octree.insert(obj);

    const ray = makeRayBuf(0, 0, 0, 1, 0, 0);
    const hit = octree.raycast(ray, 0);

    expect(hit).not.toBeNull();
    expect(hit!.objectIndex).toBe(obj);
    expect(hit!.t).toBeCloseTo(30, 4);
  });

  it('works correctly on a fully subdivided octree with many objects', () => {
    const nodePool = new OctreeNodePool(4096);
    const aabbPool = new AABBPool(4096);
    const { octree } = buildSubdividedOctree(nodePool, aabbPool);

    // The extra item sits at [10,10,10]-[11,11,11].
    // Ray at (0, 10.5, 10.5) → +X should hit it at t=10.
    const ray = makeRayBuf(0, 10.5, 10.5, 1, 0, 0);
    const hit = octree.raycast(ray, 0);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(10, 4);
  });

  it('respects a non-zero ray buffer offset', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const obj = makeAABB(aabbPool, 10, 0, 0, 11, 1, 1);
    octree.insert(obj);

    // Pad 6 dummy floats before the actual ray at offset 6.
    const ray = new Float32Array([0, 0, 0, 0, 0, 0, -5, 0.5, 0.5, 1, 0, 0]);
    const hit = octree.raycast(ray, 6);

    expect(hit).not.toBeNull();
    expect(hit!.objectIndex).toBe(obj);
    expect(hit!.t).toBeCloseTo(15, 4);
  });
});

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

describe('Octree – queryBox traversal', () => {
  it('returns an empty array when no objects are inserted', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const result = octree.queryBox(-10, -10, -10, 10, 10, 10);
    expect(result).toEqual([]);
  });

  it('returns the object when the query region fully contains it', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const obj = makeAABB(aabbPool, 5, 5, 5, 6, 6, 6);
    octree.insert(obj);

    const result = octree.queryBox(0, 0, 0, 20, 20, 20);
    expect(result).toContain(obj);
    expect(result).toHaveLength(1);
  });

  it('returns an empty array when the query region is entirely outside the object', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    octree.insert(makeAABB(aabbPool, 30, 30, 30, 31, 31, 31));

    const result = octree.queryBox(-10, -10, -10, 10, 10, 10);
    expect(result).toEqual([]);
  });

  it('returns the object when the query region partially overlaps it', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    // Object [8, 8, 8]-[12, 12, 12] partially overlaps query [0, 0, 0]-[10, 10, 10].
    const obj = makeAABB(aabbPool, 8, 8, 8, 12, 12, 12);
    octree.insert(obj);

    const result = octree.queryBox(0, 0, 0, 10, 10, 10);
    expect(result).toContain(obj);
    expect(result).toHaveLength(1);
  });

  it('returns only the objects that overlap the query region', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const inside1 = makeAABB(aabbPool, 2, 2, 2, 4, 4, 4);
    const inside2 = makeAABB(aabbPool, -4, -4, -4, -2, -2, -2);
    const outside = makeAABB(aabbPool, 30, 30, 30, 31, 31, 31);

    octree.insert(inside1);
    octree.insert(inside2);
    octree.insert(outside);

    const result = octree.queryBox(-5, -5, -5, 5, 5, 5);
    expect(result).toContain(inside1);
    expect(result).toContain(inside2);
    expect(result).not.toContain(outside);
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when the query region misses the root AABB entirely', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    octree.insert(makeAABB(aabbPool, 5, 5, 5, 6, 6, 6));

    // Query region is far outside the octree root bounds.
    const result = octree.queryBox(100, 100, 100, 200, 200, 200);
    expect(result).toEqual([]);
  });

  it('returns all objects when the query region equals the root bounds', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const obj1 = makeAABB(aabbPool, -40, -40, -40, -39, -39, -39);
    const obj2 = makeAABB(aabbPool, 10, 10, 10, 11, 11, 11);
    const obj3 = makeAABB(aabbPool, -5, -5, -5, 5, 5, 5);

    octree.insert(obj1);
    octree.insert(obj2);
    octree.insert(obj3);

    const result = octree.queryBox(-50, -50, -50, 50, 50, 50);
    expect(result).toContain(obj1);
    expect(result).toContain(obj2);
    expect(result).toContain(obj3);
    expect(result).toHaveLength(3);
  });

  it('returns correct objects from a subdivided tree', () => {
    const nodePool = new OctreeNodePool(4096);
    const aabbPool = new AABBPool(4096);
    const { octree, items } = buildSubdividedOctree(nodePool, aabbPool);

    // The extra item is items[8] at [10,10,10]-[11,11,11].
    // Query the positive-XYZ quadrant only.
    const result = octree.queryBox(5, 5, 5, 50, 50, 50);

    // Only items in the positive-XYZ quadrant: items[7] (x=40,y=40,z=40) and items[8] (extra).
    // items order: sx,sy,sz loop → items[7] is sx=1,sy=1,sz=1 → x=40,y=40,z=40.
    expect(result).toContain(items[7]);
    expect(result).toContain(items[8]);
    // Objects in negative quadrants should NOT appear.
    expect(result).not.toContain(items[0]); // (-40,-40,-40)
    expect(result).not.toContain(items[1]); // (-40,-40,40) — z positive but x,y negative
  });

  it('handles a query box that exactly touches the boundary of an object (edge case)', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    // Object at [10, 0, 0]-[11, 1, 1]; query touches at x=11 exactly.
    const obj = makeAABB(aabbPool, 10, 0, 0, 11, 1, 1);
    octree.insert(obj);

    const result = octree.queryBox(11, 0, 0, 20, 1, 1);
    expect(result).toContain(obj);
    expect(result).toHaveLength(1);
  });
});

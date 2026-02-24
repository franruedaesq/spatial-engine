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

/** Count total objects across all allocated nodes. */
function totalObjectCount(nodePool: OctreeNodePool): number {
  let total = 0;
  for (let n = 0; n < nodePool.size; n++) {
    total += nodePool.getObjectCount(n);
  }
  return total;
}

/** Return the node index that contains the given object, or -1 if not found. */
function findNodeContaining(nodePool: OctreeNodePool, objectIndex: number): number {
  for (let n = 0; n < nodePool.size; n++) {
    const count = nodePool.getObjectCount(n);
    for (let j = 0; j < count; j++) {
      if (nodePool.getObject(n, j) === objectIndex) return n;
    }
  }
  return -1;
}

describe('Octree – dynamic updates (update)', () => {
  it('update() changes the AABB coordinates in the pool', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const obj = makeAABB(aabbPool, -40, -40, -40, -39, -39, -39);
    octree.insert(obj);

    octree.update(obj, 10, 10, 10, 11, 11, 11);

    expect(aabbPool.get(obj, 0)).toBeCloseTo(10);
    expect(aabbPool.get(obj, 1)).toBeCloseTo(10);
    expect(aabbPool.get(obj, 2)).toBeCloseTo(10);
    expect(aabbPool.get(obj, 3)).toBeCloseTo(11);
    expect(aabbPool.get(obj, 4)).toBeCloseTo(11);
    expect(aabbPool.get(obj, 5)).toBeCloseTo(11);
  });

  it('update() preserves total object count across all nodes', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    // Insert enough objects to trigger subdivision.
    const objects: number[] = [];
    const signs = [-1, 1] as const;
    for (const sx of signs) {
      for (const sy of signs) {
        for (const sz of signs) {
          const x = sx * 40;
          const y = sy * 40;
          const z = sz * 40;
          objects.push(makeAABB(aabbPool, x, y, z, x + 1, y + 1, z + 1));
        }
      }
    }
    for (const o of objects) octree.insert(o);
    // One more to trigger subdivision.
    const extra = makeAABB(aabbPool, 1, 1, 1, 2, 2, 2);
    octree.insert(extra);

    const before = totalObjectCount(nodePool);

    // Move extra from (+,+,+) area to (-,-,-) area.
    octree.update(extra, -45, -45, -45, -44, -44, -44);

    expect(totalObjectCount(nodePool)).toBe(before);
  });

  it('update() removes the object from its old node', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    // Force subdivision by inserting 9 spread items.
    const signs = [-1, 1] as const;
    for (const sx of signs) {
      for (const sy of signs) {
        for (const sz of signs) {
          const x = sx * 40;
          const y = sy * 40;
          const z = sz * 40;
          octree.insert(makeAABB(aabbPool, x, y, z, x + 1, y + 1, z + 1));
        }
      }
    }
    const obj = makeAABB(aabbPool, 10, 10, 10, 11, 11, 11);
    octree.insert(obj);

    const oldNode = findNodeContaining(nodePool, obj);
    expect(oldNode).not.toBe(-1);

    // Move to a completely different octant.
    octree.update(obj, -45, -45, -45, -44, -44, -44);

    // obj must no longer be in its old node.
    const countInOld = nodePool.getObjectCount(oldNode);
    let stillInOld = false;
    for (let j = 0; j < countInOld; j++) {
      if (nodePool.getObject(oldNode, j) === obj) stillInOld = true;
    }
    expect(stillInOld).toBe(false);
  });

  it('update() places the object in the correct new node after moving across octants', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const signs = [-1, 1] as const;
    for (const sx of signs) {
      for (const sy of signs) {
        for (const sz of signs) {
          const x = sx * 40;
          const y = sy * 40;
          const z = sz * 40;
          octree.insert(makeAABB(aabbPool, x, y, z, x + 1, y + 1, z + 1));
        }
      }
    }
    // 9th item: starts in the (+,+,+) region.
    const obj = makeAABB(aabbPool, 10, 10, 10, 11, 11, 11);
    octree.insert(obj);

    // Move to (-,-,-) region.
    octree.update(obj, -45, -45, -45, -44, -44, -44);

    const newNode = findNodeContaining(nodePool, obj);
    expect(newNode).not.toBe(-1);

    // Verify the new node actually contains the new AABB bounds.
    expect(nodePool.getAABB(newNode, 0)).toBeLessThanOrEqual(-45); // minX ≤ new minX
    expect(nodePool.getAABB(newNode, 1)).toBeLessThanOrEqual(-45);
    expect(nodePool.getAABB(newNode, 2)).toBeLessThanOrEqual(-45);
    expect(nodePool.getAABB(newNode, 3)).toBeGreaterThanOrEqual(-44); // maxX ≥ new maxX
    expect(nodePool.getAABB(newNode, 4)).toBeGreaterThanOrEqual(-44);
    expect(nodePool.getAABB(newNode, 5)).toBeGreaterThanOrEqual(-44);
  });

  it('update() keeps object in same node when new bounds still fit', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const signs = [-1, 1] as const;
    for (const sx of signs) {
      for (const sy of signs) {
        for (const sz of signs) {
          const x = sx * 40;
          const y = sy * 40;
          const z = sz * 40;
          octree.insert(makeAABB(aabbPool, x, y, z, x + 1, y + 1, z + 1));
        }
      }
    }
    const obj = makeAABB(aabbPool, 10, 10, 10, 11, 11, 11);
    octree.insert(obj);

    const oldNode = findNodeContaining(nodePool, obj);

    // Small nudge within the same child octant.
    octree.update(obj, 12, 12, 12, 13, 13, 13);

    const newNode = findNodeContaining(nodePool, obj);
    expect(newNode).toBe(oldNode);
  });

  it('update() moves object to parent node when new bounds straddle the midpoint', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const signs = [-1, 1] as const;
    for (const sx of signs) {
      for (const sy of signs) {
        for (const sz of signs) {
          const x = sx * 40;
          const y = sy * 40;
          const z = sz * 40;
          octree.insert(makeAABB(aabbPool, x, y, z, x + 1, y + 1, z + 1));
        }
      }
    }
    // Inserted in the (+,+,+) child octant.
    const obj = makeAABB(aabbPool, 10, 10, 10, 11, 11, 11);
    octree.insert(obj);

    // Now expand it to straddle the origin – must bubble up to the root.
    octree.update(obj, -5, -5, -5, 5, 5, 5);

    const newNode = findNodeContaining(nodePool, obj);
    expect(newNode).toBe(octree.rootIndex);
  });
});

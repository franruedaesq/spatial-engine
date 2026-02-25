import { describe, it, expect } from 'vitest';
import { Octree } from '../src/octree.js';
import { OctreeNodePool, MAX_OBJECTS_PER_NODE } from '../src/octree-node.js';
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

/** Distribute small AABBs evenly across the 8 octants to reliably exceed any threshold. */
function makeOctantItems(aabbPool: AABBPool, countNeeded: number): number[] {
  const signs = [-1, 1] as const;
  const items: number[] = [];
  let inserted = 0;

  // Keep layering items into the 8 octants until we have enough
  let layer = 0;
  while (inserted < countNeeded) {
    for (const sx of signs) {
      for (const sy of signs) {
        for (const sz of signs) {
          if (inserted >= countNeeded) break;
          // shift each layer slightly inward so they don't perfectly overlap
          const x = sx * (40 - layer);
          const y = sy * (40 - layer);
          const z = sz * (40 - layer);
          items.push(makeAABB(aabbPool, x, y, z, x + 1, y + 1, z + 1));
          inserted++;
        }
      }
    }
    layer++;
  }
  return items;
}

describe('Octree – insertion and subdivision', () => {
  it('root remains a leaf while object count is below the threshold', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    for (let i = 0; i < MAX_OBJECTS_PER_NODE; i++) {
      octree.insert(makeAABB(aabbPool, i * 3, i * 3, i * 3, i * 3 + 1, i * 3 + 1, i * 3 + 1));
    }

    expect(nodePool.getFirstChild(octree.rootIndex)).toBe(-1);
    expect(nodePool.getObjectCount(octree.rootIndex)).toBe(MAX_OBJECTS_PER_NODE);
  });

  it('root subdivides into exactly 8 children when the capacity threshold is exceeded', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    // Insert MAX_OBJECTS_PER_NODE items spread across octants
    for (const item of makeOctantItems(aabbPool, MAX_OBJECTS_PER_NODE)) {
      octree.insert(item);
    }
    // MAX_OBJECTS_PER_NODE + 1 item triggers subdivision of the root.
    octree.insert(makeAABB(aabbPool, 1, 1, 1, 2, 2, 2));

    const firstChild = nodePool.getFirstChild(octree.rootIndex);
    expect(firstChild).not.toBe(-1);

    // Exactly 8 consecutive child nodes were allocated after the root.
    expect(nodePool.size).toBe(9); // root(1) + children(8)
    for (let i = 0; i < 8; i++) {
      expect(nodePool.getParent(firstChild + i)).toBe(octree.rootIndex);
    }
  });

  it('an AABB that fits entirely inside a child octant is pushed down after subdivision', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    for (const item of makeOctantItems(aabbPool, MAX_OBJECTS_PER_NODE)) {
      octree.insert(item);
    }

    // Small AABB firmly in the (+,+,+) octant – must be pushed into a child.
    const small = makeAABB(aabbPool, 10, 10, 10, 11, 11, 11);
    octree.insert(small);

    const firstChild = nodePool.getFirstChild(octree.rootIndex);
    expect(firstChild).not.toBe(-1);

    let foundInChild = false;
    for (let i = 0; i < 8; i++) {
      const childIdx = firstChild + i;
      const count = nodePool.getObjectCount(childIdx);
      for (let j = 0; j < count; j++) {
        if (nodePool.getObject(childIdx, j) === small) {
          foundInChild = true;
        }
      }
    }
    expect(foundInChild).toBe(true);
  });

  it('an AABB straddling the subdivision boundary stays in the parent node', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    for (const item of makeOctantItems(aabbPool, MAX_OBJECTS_PER_NODE)) {
      octree.insert(item);
    }

    // AABB that crosses the origin midpoint in all three axes.
    const straddling = makeAABB(aabbPool, -5, -5, -5, 5, 5, 5);
    octree.insert(straddling);

    // Root must have subdivided.
    expect(nodePool.getFirstChild(octree.rootIndex)).not.toBe(-1);

    // The straddling object must be stored in the root, not in any child.
    let foundInRoot = false;
    const rootCount = nodePool.getObjectCount(octree.rootIndex);
    for (let j = 0; j < rootCount; j++) {
      if (nodePool.getObject(octree.rootIndex, j) === straddling) {
        foundInRoot = true;
      }
    }
    expect(foundInRoot).toBe(true);
  });

  it('inserts 100 random AABBs without error and root subdivides', () => {
    const nodePool = new OctreeNodePool(4096);
    const aabbPool = new AABBPool(4096);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    let seed = 42;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    };

    for (let i = 0; i < 100; i++) {
      const x = rand() * 98 - 49;
      const y = rand() * 98 - 49;
      const z = rand() * 98 - 49;
      octree.insert(makeAABB(aabbPool, x, y, z, x + 0.5, y + 0.5, z + 0.5));
    }

    expect(nodePool.getFirstChild(octree.rootIndex)).not.toBe(-1);
    expect(nodePool.size).toBeGreaterThanOrEqual(9);
  });

  it('total object count across all nodes equals the number of insertions', () => {
    const nodePool = new OctreeNodePool(4096);
    const aabbPool = new AABBPool(4096);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    let seed = 123;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    };

    for (let i = 0; i < 100; i++) {
      const x = rand() * 98 - 49;
      const y = rand() * 98 - 49;
      const z = rand() * 98 - 49;
      octree.insert(makeAABB(aabbPool, x, y, z, x + 0.5, y + 0.5, z + 0.5));
    }

    let total = 0;
    for (let n = 0; n < nodePool.size; n++) {
      total += nodePool.getObjectCount(n);
    }
    expect(total).toBe(100);
  });
});

describe('Octree – clear()', () => {
  it('resets nodePool to a single root node', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    for (const item of makeOctantItems(aabbPool, MAX_OBJECTS_PER_NODE + 8)) {
      octree.insert(item);
    }
    expect(nodePool.size).toBeGreaterThan(1);

    octree.clear();

    expect(nodePool.size).toBe(1);
  });

  it('queryBox returns empty after clear()', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    for (let i = 0; i < 10; i++) {
      const idx = aabbPool.allocate();
      aabbPool.set(idx, i, i, i, i + 1, i + 1, i + 1);
      octree.insert(idx);
    }

    octree.clear();
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const results = octree.queryBox(-50, -50, -50, 50, 50, 50);
    expect(results).toHaveLength(0);
  });

  it('allows fresh insert and queryBox after clear()', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const old = aabbPool.allocate();
    aabbPool.set(old, 5, 5, 5, 6, 6, 6);
    octree.insert(old);

    octree.clear();
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    const fresh = aabbPool.allocate();
    aabbPool.set(fresh, 10, 10, 10, 11, 11, 11);
    octree.insert(fresh);

    const results = octree.queryBox(9, 9, 9, 12, 12, 12);
    expect(results).toContain(fresh);
  });

  it('resets aabbPool size to 0 after clear()', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    aabbPool.allocate();
    aabbPool.allocate();
    expect(aabbPool.size).toBe(2);

    octree.clear();

    expect(aabbPool.size).toBe(0);
  });

  it('rootIndex is valid and the new root is a childless leaf with no objects', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-50, -50, -50, 50, 50, 50);

    for (const item of makeOctantItems(aabbPool, MAX_OBJECTS_PER_NODE + 1)) {
      octree.insert(item);
    }

    octree.clear();

    expect(octree.rootIndex).toBe(0);
    expect(nodePool.getFirstChild(octree.rootIndex)).toBe(-1);
    expect(nodePool.getObjectCount(octree.rootIndex)).toBe(0);
  });
});

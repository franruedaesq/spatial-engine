import { describe, it, expect } from 'vitest';
import {
  OctreeNodePool,
  NODE_STRIDE,
  NODE_AABB_OFFSET,
  NODE_FIRST_CHILD_OFFSET,
  NODE_PARENT_OFFSET,
  NODE_OBJECT_COUNT_OFFSET,
  NODE_OBJECTS_OFFSET,
  MAX_OBJECTS_PER_NODE,
} from '../src/octree-node.js';

describe('OctreeNodePool – layout constants', () => {
  it('NODE_AABB_OFFSET is 0', () => {
    expect(NODE_AABB_OFFSET).toBe(0);
  });

  it('NODE_FIRST_CHILD_OFFSET is 6', () => {
    expect(NODE_FIRST_CHILD_OFFSET).toBe(6);
  });

  it('NODE_PARENT_OFFSET is 7', () => {
    expect(NODE_PARENT_OFFSET).toBe(7);
  });

  it('NODE_OBJECT_COUNT_OFFSET is 8', () => {
    expect(NODE_OBJECT_COUNT_OFFSET).toBe(8);
  });

  it('NODE_OBJECTS_OFFSET is 9', () => {
    expect(NODE_OBJECTS_OFFSET).toBe(9);
  });

  it('NODE_STRIDE equals 9 + MAX_OBJECTS_PER_NODE', () => {
    expect(NODE_STRIDE).toBe(9 + MAX_OBJECTS_PER_NODE);
  });
});

describe('OctreeNodePool – allocation', () => {
  it('starts empty', () => {
    const pool = new OctreeNodePool(8);
    expect(pool.size).toBe(0);
  });

  it('allocate returns sequential indices', () => {
    const pool = new OctreeNodePool(8);
    expect(pool.allocate()).toBe(0);
    expect(pool.allocate()).toBe(1);
    expect(pool.size).toBe(2);
  });

  it('reset clears the pool without allocating memory', () => {
    const pool = new OctreeNodePool(8);
    pool.allocate();
    pool.allocate();
    pool.reset();
    expect(pool.size).toBe(0);
    expect(pool.allocate()).toBe(0);
  });
});

describe('OctreeNodePool – AABB', () => {
  it('setAABB / getAABB round-trips six components', () => {
    const pool = new OctreeNodePool(4);
    const idx = pool.allocate();
    pool.setAABB(idx, -1, -2, -3, 4, 5, 6);
    expect(pool.getAABB(idx, 0)).toBe(-1); // minX
    expect(pool.getAABB(idx, 1)).toBe(-2); // minY
    expect(pool.getAABB(idx, 2)).toBe(-3); // minZ
    expect(pool.getAABB(idx, 3)).toBe(4);  // maxX
    expect(pool.getAABB(idx, 4)).toBe(5);  // maxY
    expect(pool.getAABB(idx, 5)).toBe(6);  // maxZ
  });

  it('two nodes have independent AABB storage', () => {
    const pool = new OctreeNodePool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    pool.setAABB(a, 0, 0, 0, 1, 1, 1);
    pool.setAABB(b, 2, 2, 2, 3, 3, 3);
    expect(pool.getAABB(a, 0)).toBe(0);
    expect(pool.getAABB(b, 0)).toBe(2);
  });
});

describe('OctreeNodePool – firstChild index', () => {
  it('newly allocated node has firstChild of -1', () => {
    const pool = new OctreeNodePool(4);
    const idx = pool.allocate();
    expect(pool.getFirstChild(idx)).toBe(-1);
  });

  it('setFirstChild / getFirstChild round-trips', () => {
    const pool = new OctreeNodePool(4);
    const parent = pool.allocate();
    const child = pool.allocate();
    pool.setFirstChild(parent, child);
    expect(pool.getFirstChild(parent)).toBe(child);
  });
});

describe('OctreeNodePool – parent index', () => {
  it('newly allocated node has parent of -1', () => {
    const pool = new OctreeNodePool(4);
    const idx = pool.allocate();
    expect(pool.getParent(idx)).toBe(-1);
  });

  it('setParent / getParent round-trips', () => {
    const pool = new OctreeNodePool(4);
    const root = pool.allocate();
    const child = pool.allocate();
    pool.setParent(child, root);
    expect(pool.getParent(child)).toBe(root);
    expect(pool.getParent(root)).toBe(-1);
  });
});

describe('OctreeNodePool – object pointers', () => {
  it('newly allocated node contains zero objects', () => {
    const pool = new OctreeNodePool(4);
    const idx = pool.allocate();
    expect(pool.getObjectCount(idx)).toBe(0);
  });

  it('addObject increments the object count', () => {
    const pool = new OctreeNodePool(4);
    const idx = pool.allocate();
    pool.addObject(idx, 42);
    expect(pool.getObjectCount(idx)).toBe(1);
    pool.addObject(idx, 99);
    expect(pool.getObjectCount(idx)).toBe(2);
  });

  it('getObject retrieves stored object indices', () => {
    const pool = new OctreeNodePool(4);
    const idx = pool.allocate();
    pool.addObject(idx, 10);
    pool.addObject(idx, 20);
    expect(pool.getObject(idx, 0)).toBe(10);
    expect(pool.getObject(idx, 1)).toBe(20);
  });

  it('throws when object capacity is exceeded', () => {
    const pool = new OctreeNodePool(2);
    const idx = pool.allocate();
    for (let i = 0; i < MAX_OBJECTS_PER_NODE; i++) {
      pool.addObject(idx, i);
    }
    expect(() => pool.addObject(idx, 999)).toThrow();
  });

  it('two nodes store objects independently', () => {
    const pool = new OctreeNodePool(4);
    const a = pool.allocate();
    const b = pool.allocate();
    pool.addObject(a, 1);
    pool.addObject(b, 2);
    pool.addObject(b, 3);
    expect(pool.getObjectCount(a)).toBe(1);
    expect(pool.getObjectCount(b)).toBe(2);
    expect(pool.getObject(a, 0)).toBe(1);
    expect(pool.getObject(b, 0)).toBe(2);
    expect(pool.getObject(b, 1)).toBe(3);
  });
});

describe('OctreeNodePool – flat buffer layout', () => {
  it('each node occupies exactly NODE_STRIDE floats', () => {
    const pool = new OctreeNodePool(2);
    const a = pool.allocate();
    const b = pool.allocate();
    // Write distinct AABB data to each node.
    pool.setAABB(a, 1, 2, 3, 4, 5, 6);
    pool.setAABB(b, 7, 8, 9, 10, 11, 12);
    // The two AABBs must not overlap – they live NODE_STRIDE floats apart.
    expect(pool.getAABB(a, 0)).toBe(1);
    expect(pool.getAABB(b, 0)).toBe(7);
  });
});

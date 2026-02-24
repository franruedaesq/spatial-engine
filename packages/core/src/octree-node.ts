/**
 * Octree node stored as a flat Float32Array slice.
 *
 * Layout per node (NODE_STRIDE floats):
 *   [0..5]  – AABB   (minX, minY, minZ, maxX, maxY, maxZ)
 *   [6]     – firstChild index  (-1 = leaf / no children)
 *   [7]     – parent index      (-1 = root)
 *   [8]     – object count
 *   [9..]   – object indices    (MAX_OBJECTS_PER_NODE slots)
 */

export const NODE_AABB_OFFSET = 0;
export const NODE_FIRST_CHILD_OFFSET = 6;
export const NODE_PARENT_OFFSET = 7;
export const NODE_OBJECT_COUNT_OFFSET = 8;
export const NODE_OBJECTS_OFFSET = 9;
export const MAX_OBJECTS_PER_NODE = 8;
export const NODE_STRIDE = NODE_OBJECTS_OFFSET + MAX_OBJECTS_PER_NODE;

/**
 * A pool-backed, zero-GC Octree node store.
 * Each node occupies NODE_STRIDE floats in the underlying Float32Array buffer.
 */
export class OctreeNodePool {
  private readonly buffer: Float32Array;
  private count: number = 0;

  constructor(capacity: number) {
    this.buffer = new Float32Array(capacity * NODE_STRIDE);
  }

  /** Allocate a new node slot, initialise sentinel values, and return its index. */
  allocate(): number {
    const index = this.count;
    const offset = index * NODE_STRIDE;
    // Initialise sentinel values for child/parent links and object count.
    this.buffer[offset + NODE_FIRST_CHILD_OFFSET] = -1;
    this.buffer[offset + NODE_PARENT_OFFSET] = -1;
    this.buffer[offset + NODE_OBJECT_COUNT_OFFSET] = 0;
    this.count += 1;
    return index;
  }

  /** Returns the number of allocated nodes. */
  get size(): number {
    return this.count;
  }

  /** Reset the pool (all allocations freed, no GC). */
  reset(): void {
    this.count = 0;
  }

  // ── AABB ──────────────────────────────────────────────────────────────────

  /** Set the AABB bounds for the node at the given index. */
  setAABB(
    index: number,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ): void {
    const off = index * NODE_STRIDE + NODE_AABB_OFFSET;
    this.buffer[off] = minX;
    this.buffer[off + 1] = minY;
    this.buffer[off + 2] = minZ;
    this.buffer[off + 3] = maxX;
    this.buffer[off + 4] = maxY;
    this.buffer[off + 5] = maxZ;
  }

  /** Read a single AABB component (0–5) from the node at the given index. */
  getAABB(index: number, component: number): number {
    return this.buffer[index * NODE_STRIDE + NODE_AABB_OFFSET + component] ?? 0;
  }

  // ── First-child link ──────────────────────────────────────────────────────

  /** Set the first-child index for the node (-1 = leaf). */
  setFirstChild(index: number, childIndex: number): void {
    this.buffer[index * NODE_STRIDE + NODE_FIRST_CHILD_OFFSET] = childIndex;
  }

  /** Get the first-child index for the node (-1 = leaf). */
  getFirstChild(index: number): number {
    return this.buffer[index * NODE_STRIDE + NODE_FIRST_CHILD_OFFSET] ?? -1;
  }

  // ── Parent link ───────────────────────────────────────────────────────────

  /** Set the parent index for the node (-1 = root). */
  setParent(index: number, parentIndex: number): void {
    this.buffer[index * NODE_STRIDE + NODE_PARENT_OFFSET] = parentIndex;
  }

  /** Get the parent index for the node (-1 = root). */
  getParent(index: number): number {
    return this.buffer[index * NODE_STRIDE + NODE_PARENT_OFFSET] ?? -1;
  }

  // ── Object pointers ───────────────────────────────────────────────────────

  /** Return the number of objects stored in the node at the given index. */
  getObjectCount(index: number): number {
    return this.buffer[index * NODE_STRIDE + NODE_OBJECT_COUNT_OFFSET] ?? 0;
  }

  /**
   * Append an object index to the node's object list.
   * Throws a RangeError when MAX_OBJECTS_PER_NODE is exceeded.
   */
  addObject(index: number, objectIndex: number): void {
    const countOff = index * NODE_STRIDE + NODE_OBJECT_COUNT_OFFSET;
    const count = this.buffer[countOff] ?? 0;
    if (count >= MAX_OBJECTS_PER_NODE) {
      throw new RangeError(
        `OctreeNodePool.addObject: node ${index} already contains MAX_OBJECTS_PER_NODE (${MAX_OBJECTS_PER_NODE}) objects`,
      );
    }
    this.buffer[index * NODE_STRIDE + NODE_OBJECTS_OFFSET + count] = objectIndex;
    this.buffer[countOff] = count + 1;
  }

  /** Return the object index stored at slot `slot` in the given node. */
  getObject(index: number, slot: number): number {
    return this.buffer[index * NODE_STRIDE + NODE_OBJECTS_OFFSET + slot] ?? 0;
  }

  /** Reset the object count of the given node to zero (does not zero the slots). */
  clearObjects(index: number): void {
    this.buffer[index * NODE_STRIDE + NODE_OBJECT_COUNT_OFFSET] = 0;
  }

  /**
   * Remove a single object index from the node's object list.
   * Uses swap-with-last to avoid shifting. Returns true if found and removed.
   */
  removeObject(index: number, objectIndex: number): boolean {
    const countOff = index * NODE_STRIDE + NODE_OBJECT_COUNT_OFFSET;
    const count = this.buffer[countOff] ?? 0;
    const baseOff = index * NODE_STRIDE + NODE_OBJECTS_OFFSET;
    for (let i = 0; i < count; i++) {
      if (this.buffer[baseOff + i] === objectIndex) {
        // Swap with the last element, then decrement count.
        this.buffer[baseOff + i] = this.buffer[baseOff + count - 1] ?? 0;
        this.buffer[countOff] = count - 1;
        return true;
      }
    }
    return false;
  }
}

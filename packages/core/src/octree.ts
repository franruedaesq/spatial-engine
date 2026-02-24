import { OctreeNodePool, MAX_OBJECTS_PER_NODE } from './octree-node.js';
import { AABBPool } from './aabb.js';

/**
 * Octree with insertion and automatic subdivision.
 *
 * - When a leaf node's object count reaches MAX_OBJECTS_PER_NODE it is
 *   subdivided into 8 axis-aligned child octants.
 * - An inserted AABB that fits entirely within a child octant is pushed down.
 * - An AABB that straddles a boundary is kept in the nearest ancestor that
 *   fully contains it.
 */
export class Octree {
  private readonly nodePool: OctreeNodePool;
  private readonly aabbPool: AABBPool;
  private readonly root: number;

  constructor(nodePool: OctreeNodePool, aabbPool: AABBPool) {
    this.nodePool = nodePool;
    this.aabbPool = aabbPool;
    this.root = nodePool.allocate();
  }

  /** The index of the root node in the underlying OctreeNodePool. */
  get rootIndex(): number {
    return this.root;
  }

  /** Set the world-space AABB that the root node covers. */
  setBounds(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ): void {
    this.nodePool.setAABB(this.root, minX, minY, minZ, maxX, maxY, maxZ);
  }

  /** Insert the AABB at `objectIndex` (in the AABBPool) into the tree. */
  insert(objectIndex: number): void {
    this.insertIntoNode(this.root, objectIndex);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private insertIntoNode(nodeIdx: number, objectIndex: number): void {
    const np = this.nodePool;
    const firstChild = np.getFirstChild(nodeIdx);

    if (firstChild !== -1) {
      // Internal node: try to push the object into a fitting child octant.
      for (let i = 0; i < 8; i++) {
        if (this.fitsInNode(objectIndex, firstChild + i)) {
          this.insertIntoNode(firstChild + i, objectIndex);
          return;
        }
      }
      // Object straddles one or more boundaries – keep it at this level.
      np.addObject(nodeIdx, objectIndex);
      return;
    }

    // Leaf node.
    const count = np.getObjectCount(nodeIdx);
    if (count < MAX_OBJECTS_PER_NODE) {
      np.addObject(nodeIdx, objectIndex);
    } else {
      // Capacity reached: subdivide, then retry the insertion.
      this.subdivide(nodeIdx);
      this.insertIntoNode(nodeIdx, objectIndex);
    }
  }

  /** Split a leaf node into 8 children and redistribute its objects. */
  private subdivide(nodeIdx: number): void {
    const np = this.nodePool;

    const minX = np.getAABB(nodeIdx, 0);
    const minY = np.getAABB(nodeIdx, 1);
    const minZ = np.getAABB(nodeIdx, 2);
    const maxX = np.getAABB(nodeIdx, 3);
    const maxY = np.getAABB(nodeIdx, 4);
    const maxZ = np.getAABB(nodeIdx, 5);

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const midZ = (minZ + maxZ) / 2;

    // Allocate 8 consecutive child nodes (guarantees contiguous indices).
    const firstChild = np.allocate();
    for (let i = 1; i < 8; i++) {
      np.allocate();
    }
    np.setFirstChild(nodeIdx, firstChild);

    // Assign each child its octant AABB.
    // Bit decomposition: bit-0 → X half, bit-1 → Y half, bit-2 → Z half.
    for (let i = 0; i < 8; i++) {
      const childIdx = firstChild + i;
      const cMinX = (i & 1) === 0 ? minX : midX;
      const cMaxX = (i & 1) === 0 ? midX : maxX;
      const cMinY = (i & 2) === 0 ? minY : midY;
      const cMaxY = (i & 2) === 0 ? midY : maxY;
      const cMinZ = (i & 4) === 0 ? minZ : midZ;
      const cMaxZ = (i & 4) === 0 ? midZ : maxZ;
      np.setAABB(childIdx, cMinX, cMinY, cMinZ, cMaxX, cMaxY, cMaxZ);
      np.setParent(childIdx, nodeIdx);
    }

    // Redistribute the existing objects.
    const count = np.getObjectCount(nodeIdx);
    const saved: number[] = [];
    for (let i = 0; i < count; i++) {
      saved.push(np.getObject(nodeIdx, i));
    }
    np.clearObjects(nodeIdx);

    for (const obj of saved) {
      let pushed = false;
      for (let i = 0; i < 8; i++) {
        if (this.fitsInNode(obj, firstChild + i)) {
          np.addObject(firstChild + i, obj);
          pushed = true;
          break;
        }
      }
      if (!pushed) {
        // Straddles a boundary – keep in the (now-internal) parent.
        np.addObject(nodeIdx, obj);
      }
    }
  }

  /** Returns true when the AABB at `objectIndex` is fully contained by `nodeIdx`. */
  private fitsInNode(objectIndex: number, nodeIdx: number): boolean {
    const np = this.nodePool;
    const ap = this.aabbPool;
    return (
      ap.get(objectIndex, 0) >= np.getAABB(nodeIdx, 0) &&
      ap.get(objectIndex, 1) >= np.getAABB(nodeIdx, 1) &&
      ap.get(objectIndex, 2) >= np.getAABB(nodeIdx, 2) &&
      ap.get(objectIndex, 3) <= np.getAABB(nodeIdx, 3) &&
      ap.get(objectIndex, 4) <= np.getAABB(nodeIdx, 4) &&
      ap.get(objectIndex, 5) <= np.getAABB(nodeIdx, 5)
    );
  }
}

import type { Mesh, Group } from 'three';
import { Box3 } from 'three';
import { AABBPool, Octree } from '@spatial-engine/core';

/**
 * Synchronizes a THREE.Mesh or THREE.Group with a spatial-engine Octree.
 *
 * On the first call to `sync()` the object's world-space bounding box is
 * computed, stored in the AABBPool, and inserted into the Octree.
 * Subsequent calls to `sync()` recompute the bounding box and call
 * `Octree.update()` to reposition the entry without a full reinsertion.
 *
 * Each synchronizer occupies exactly one slot in the supplied AABBPool;
 * that slot's index is exposed as the read-only `id` property.
 */
export class ThreeSynchronizer {
  /** The AABBPool index used to identify this object in the core engine. */
  readonly id: number;

  private readonly object: Mesh | Group;
  private readonly octree: Octree;
  private readonly aabbPool: AABBPool;
  private readonly _box: Box3 = new Box3();
  private _inserted: boolean = false;
  private _disposed: boolean = false;

  constructor(object: Mesh | Group, octree: Octree, aabbPool: AABBPool) {
    this.object = object;
    this.octree = octree;
    this.aabbPool = aabbPool;
    this.id = aabbPool.allocate();
  }

  /**
   * Recompute the object's world-space bounding box and sync it to the
   * Octree. Call this whenever the object may have moved or changed shape.
   */
  sync(): void {
    if (this._disposed) return;
    this._box.setFromObject(this.object);
    const { min, max } = this._box;

    if (!this._inserted) {
      this.aabbPool.set(this.id, min.x, min.y, min.z, max.x, max.y, max.z);
      this.octree.insert(this.id);
      this._inserted = true;
    } else {
      this.octree.update(this.id, min.x, min.y, min.z, max.x, max.y, max.z);
    }
  }

  /**
   * Remove this object from the octree and mark the synchronizer as
   * disposed. After calling this, further `sync()` calls are no-ops.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this._inserted) {
      this.octree.remove(this.id);
      this._inserted = false;
    }
    // Return the AABBPool slot so it can be reused by the next synchronizer.
    this.aabbPool.release(this.id);
  }
}

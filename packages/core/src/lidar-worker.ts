/**
 * LiDAR Web Worker
 *
 * Handles heavy raycasting (LiDAR sweep logic) off the main thread.
 *
 * Protocol
 * --------
 * 1. Main thread sends one `LidarInitMessage` to set up shared buffers and
 *    world bounds.  The worker replies with `{ type: 'ready' }`.
 *
 * 2. For each sweep the main thread:
 *      a. Writes up-to-date object AABB data into `aabbsSab`
 *         (6 floats per object: minX, minY, minZ, maxX, maxY, maxZ).
 *      b. Sends a `LidarSweepMessage` with the current `objectCount`.
 *
 * 3. The worker reads the transforms, inserts/updates objects in its local
 *    Octree, casts every ray from `raysSab`, and writes results to
 *    `resultsSab` (2 floats per ray: objectIndex, t; –1/–1 for a miss).
 *    It then replies with `{ type: 'done', rayCount }`.
 *
 * SharedArrayBuffer layout
 * ------------------------
 * aabbsSab  : Float32Array – objectCapacity × AABB_STRIDE (6) floats
 * nodesSab  : Float32Array – nodeCapacity   × NODE_STRIDE      floats
 * raysSab   : Float32Array – rayCount       × RAY_STRIDE (6)   floats
 * resultsSab: Float32Array – rayCount       × 2                floats
 *               [objectIndex (float), t (float)] per ray
 */

import { OctreeNodePool } from './octree-node.js';
import { AABBPool } from './aabb.js';
import { RAY_STRIDE } from './ray.js';
import { Octree } from './octree.js';

// ── Public message types ──────────────────────────────────────────────────────

/** Sent once from the main thread to initialise the shared buffers. */
export interface LidarInitMessage {
  type: 'init';
  /** SharedArrayBuffer for AABB data (objectCapacity × 6 floats). Written by the main thread. */
  aabbsSab: SharedArrayBuffer;
  /** SharedArrayBuffer for Octree node data (nodeCapacity × NODE_STRIDE floats). Managed by the worker. */
  nodesSab: SharedArrayBuffer;
  /** SharedArrayBuffer for ray data (rayCount × 6 floats). Written by the main thread (or set once). */
  raysSab: SharedArrayBuffer;
  /** SharedArrayBuffer for raycast results (rayCount × 2 floats). Written by the worker. */
  resultsSab: SharedArrayBuffer;
  /** Maximum number of objects the AABBPool can hold. */
  objectCapacity: number;
  /** Maximum number of Octree nodes the NodePool can hold. */
  nodeCapacity: number;
  /** Number of rays in the LiDAR sweep. */
  rayCount: number;
  /** World-space bounds for the root octree node. */
  worldMinX: number;
  worldMinY: number;
  worldMinZ: number;
  worldMaxX: number;
  worldMaxY: number;
  worldMaxZ: number;
}

/** Sent each frame to trigger a LiDAR sweep. */
export interface LidarSweepMessage {
  type: 'sweep';
  /** Number of active objects whose AABB data has been written to `aabbsSab`. */
  objectCount: number;
}

export type LidarWorkerInMessage = LidarInitMessage | LidarSweepMessage;

/** Posted by the worker after initialisation succeeds. */
export interface LidarReadyMessage {
  type: 'ready';
}

/** Posted by the worker after a sweep finishes. */
export interface LidarDoneMessage {
  type: 'done';
  /** Number of rays that were cast (equals the `rayCount` given in `init`). */
  rayCount: number;
}

export type LidarWorkerOutMessage = LidarReadyMessage | LidarDoneMessage;

// ── Processor (pure logic, no worker-global bindings) ────────────────────────

/**
 * Stateful LiDAR sweep processor.
 *
 * Exported for direct use in tests and advanced integrations.  The bottom of
 * this module wires it to the Web Worker global scope automatically when the
 * script runs inside a worker.
 */
export function createLidarProcessor(): {
  init(msg: LidarInitMessage): LidarReadyMessage;
  sweep(msg: LidarSweepMessage): LidarDoneMessage;
} {
  let octree: Octree | null = null;
  let aabbPool: AABBPool | null = null;
  let raysBuf: Float32Array | null = null;
  let resultsBuf: Float32Array | null = null;
  let totalRayCount = 0;
  /** Tracks how many objects have been inserted into the local octree. */
  let insertedObjectCount = 0;

  return {
    /** Initialise shared buffers and create the Octree. */
    init(msg: LidarInitMessage): LidarReadyMessage {
      const nodePool = new OctreeNodePool(msg.nodeCapacity, msg.nodesSab);
      aabbPool = new AABBPool(msg.objectCapacity, msg.aabbsSab);
      raysBuf = new Float32Array(msg.raysSab);
      resultsBuf = new Float32Array(msg.resultsSab);
      totalRayCount = msg.rayCount;
      insertedObjectCount = 0;

      octree = new Octree(nodePool, aabbPool);
      octree.setBounds(
        msg.worldMinX, msg.worldMinY, msg.worldMinZ,
        msg.worldMaxX, msg.worldMaxY, msg.worldMaxZ,
      );

      return { type: 'ready' };
    },

    /**
     * Read current object AABB data from the shared buffer, update the Octree,
     * cast every sweep ray, and write results to the results buffer.
     */
    sweep(msg: LidarSweepMessage): LidarDoneMessage {
      if (octree === null || aabbPool === null || raysBuf === null || resultsBuf === null) {
        throw new Error('LidarProcessor: sweep called before init');
      }

      const objectCount = msg.objectCount;

      // Ensure the pool's allocation count reflects all active objects so that
      // the pool's `size` getter stays accurate (the buffer memory already exists
      // in the SAB – allocate() only increments the internal counter).
      while (aabbPool.size < objectCount) {
        aabbPool.allocate();
      }

      // Insert new objects or reposition existing ones in the octree.
      for (let i = 0; i < objectCount; i++) {
        const minX = aabbPool.get(i, 0);
        const minY = aabbPool.get(i, 1);
        const minZ = aabbPool.get(i, 2);
        const maxX = aabbPool.get(i, 3);
        const maxY = aabbPool.get(i, 4);
        const maxZ = aabbPool.get(i, 5);

        if (i < insertedObjectCount) {
          // Already in the tree – reposition without full rebuild.
          octree.update(i, minX, minY, minZ, maxX, maxY, maxZ);
        } else {
          // First appearance: insert using the bounds already in the SAB.
          octree.insert(i);
          insertedObjectCount++;
        }
      }

      // LiDAR sweep: cast each ray and write the closest hit (or miss) to
      // the results buffer.  Layout: [objectIndex, t] per ray (–1/–1 = miss).
      for (let r = 0; r < totalRayCount; r++) {
        const hit = octree.raycast(raysBuf, r * RAY_STRIDE);
        if (hit !== null) {
          resultsBuf[r * 2] = hit.objectIndex;
          resultsBuf[r * 2 + 1] = hit.t;
        } else {
          resultsBuf[r * 2] = -1;
          resultsBuf[r * 2 + 1] = -1;
        }
      }

      return { type: 'done', rayCount: totalRayCount };
    },
  };
}

// ── Web Worker binding ────────────────────────────────────────────────────────
// Automatically wire the processor to the worker's global message handler when
// this script is loaded inside a Web Worker context (browser or Node.js worker).

type WorkerGlobalSelf = {
  onmessage: ((event: { data: LidarWorkerInMessage }) => void) | null;
  postMessage(data: LidarWorkerOutMessage): void;
};

// `postMessage` is available on the worker global but not in a regular Node.js
// module context, so check for it before binding.
const globalScope = globalThis as Record<string, unknown>;
if (typeof globalScope['postMessage'] === 'function' && typeof globalScope['onmessage'] !== 'undefined') {
  const workerSelf = globalThis as unknown as WorkerGlobalSelf;
  const processor = createLidarProcessor();

  workerSelf.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === 'init') {
      workerSelf.postMessage(processor.init(msg));
    } else if (msg.type === 'sweep') {
      workerSelf.postMessage(processor.sweep(msg));
    }
  };
}

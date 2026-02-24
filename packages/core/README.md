# @spatial-engine/core

The foundation layer for `spatial-engine`, a high-performance spatial partitioning and query library using a Data-Oriented Design (DOD) approach. It provides cache-friendly, zero-GC spatial data structures backed by flat `Float32Array` pools.

Everything lives in contiguous memory: no per-object heap allocations, no mid-frame GC pauses.

## Installation

```bash
npm install @spatial-engine/core
# or
pnpm add @spatial-engine/core
```

## Features
- **Octree with automatic subdivision** — insert, update, and remove axis-aligned bounding boxes.
- **Branchless slab-method raycast** — fast `rayIntersectsAABB` implementation.
- **Box query** — `octree.queryBox()` returns all objects whose AABB overlaps a query region natively (iterative DFS, no recursion).
- **Zero GC Pools** — `AABBPool`, `RayPool`, and `OctreeNodePool` allocate once and reuse. Call `.reset()` each frame.
- **LiDAR Web Worker** — run a full multi-ray sweep entirely off the main thread using shared memory.
- **`SharedArrayBuffer` support** — pools can be shared with Web Workers without copying data.

## Basic Usage

```ts
import { AABBPool, RayPool, OctreeNodePool, Octree } from '@spatial-engine/core';

// --- 1. Allocate pools once (e.g. on startup) ---
const nodePool  = new OctreeNodePool(512);
const aabbPool  = new AABBPool(512);
const rayPool   = new RayPool(64);
const octree    = new Octree(nodePool, aabbPool);

octree.setBounds(-100, -100, -100, 100, 100, 100);

// --- 2. Each frame: reset pools and re-insert objects ---
nodePool.reset();
aabbPool.reset();

const idx = aabbPool.allocate();
aabbPool.set(idx, -1, -1, -1, 1, 1, 1); // minX,minY,minZ,maxX,maxY,maxZ
octree.insert(idx);

// --- 3. Raycast ---
const rayIdx = rayPool.allocate();
rayPool.set(rayIdx, 0, 0, -10, 0, 0, 1); // origin (0,0,-10), direction +Z

const rayBuf = (rayPool as any).buffer as Float32Array;
const hit = octree.raycast(rayBuf, rayIdx * 6);
// hit: { objectIndex: 0, t: 9 } | null

// --- 4. Box query ---
const hits = octree.queryBox(-2, -2, -2, 2, 2, 2);
// hits: [0]  (array of aabbPool indices)
```

## LiDAR Web Worker
For scenes with many rays (e.g. simulated sensors), you can use the built-in worker implementation to run sweeps off the main thread using `SharedArrayBuffer` exports natively provided.

```ts
import { AABBPool, RayPool, OctreeNodePool } from '@spatial-engine/core';
import type { LidarInitMessage, LidarSweepMessage } from '@spatial-engine/core';
// Import the robust built in web worker
const worker = new Worker(new URL('@spatial-engine/core/lidar-worker', import.meta.url), { type: 'module' });
```
(See root monorepo README for full worker example code).

## Use Cases
- **Game collision broad-phase**: `queryBox` for candidate pairs
- **Frustum culling**: `raycast` or `queryBox` to cull objects 
- **LiDAR sensor simulation**: `createLidarProcessor` off thread
- **Physics broad-phase**: Find overlap candidates before narrow-phase

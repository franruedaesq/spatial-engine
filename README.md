# spatial-engine

A high-performance TypeScript monorepo for 3D spatial partitioning, raycasting, and bounding-box queries — built with a Data-Oriented Design (DOD) approach to eliminate garbage-collection pressure in real-time applications.

---

## What is it?

`spatial-engine` gives you a suite of cache-friendly, zero-GC spatial data structures backed by flat `Float32Array` pools.  Everything lives in contiguous memory: no per-object heap allocations, no mid-frame GC pauses.  The library ships three complementary packages:

| Package | Description |
|---|---|
| [`@spatial-engine/core`](#spatial-enginecore) | Octree, AABB pool, ray pool, raycasting, LiDAR Web Worker |
| [`@spatial-engine/three`](#spatial-enginethree) | Sync `THREE.Mesh` / `THREE.Group` world bounds into the octree |
| [`@spatial-engine/react`](#spatial-enginereact) | React hooks (`useSpatialEngine`, `useOctree`) for R3F apps |

---

## Features

- **Octree with automatic subdivision** — insert, update, and remove axis-aligned bounding boxes; the tree subdivides leaf nodes when they exceed capacity.
- **Branchless slab-method raycast** — `rayIntersectsAABB` uses IEEE 754 reciprocal arithmetic with no per-axis branches.
- **Box query** — `octree.queryBox()` returns all objects whose AABB overlaps a query region using iterative DFS (pre-allocated stack, no recursion).
- **Zero GC** — `AABBPool`, `RayPool`, and `OctreeNodePool` allocate once and reuse; call `.reset()` each frame.
- **`SharedArrayBuffer` support** — pools can be backed by a `SharedArrayBuffer` so data is shared with Web Workers without copying.
- **LiDAR Web Worker** — `createLidarProcessor` runs a full multi-ray sweep entirely off the main thread using shared memory.
- **Three.js adapter** — `ThreeSynchronizer` computes world-space bounding boxes from Three.js objects and keeps them in sync with the octree.
- **React hooks** — `useSpatialEngine` and `useOctree` manage pool lifecycle across renders for React Three Fiber scenes.

---

## Packages

### `@spatial-engine/core`

The foundation layer.  Everything else builds on top of it.

**Install**
```bash
npm install @spatial-engine/core
```

**Core classes and utilities**

| Export | Description |
|---|---|
| `AABBPool` | Pool of axis-aligned bounding boxes (6 floats each: minX/Y/Z, maxX/Y/Z) |
| `RayPool` | Pool of rays (6 floats each: origin + direction) |
| `OctreeNodePool` | Pool of octree nodes (flat buffer, contiguous allocation) |
| `Octree` | Spatial octree: `insert`, `update`, `raycast`, `queryBox` |
| `createLidarProcessor` | Factory for an off-thread LiDAR sweep processor |
| `rayIntersectsAABB` | Branchless slab-method ray–AABB intersection |
| `aabbIntersects` | Test whether two pooled AABBs overlap |
| `aabbExpand` / `aabbMerge` | In-place AABB expansion and union |
| `vec3Dot` / `vec3Cross` / `vec3Distance` / `vec3DistanceSq` | Flat-array vector math |

**Basic usage**

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

---

### `@spatial-engine/three`

Bridges `spatial-engine` with [Three.js](https://threejs.org/).  `ThreeSynchronizer` computes a mesh or group's world-space bounding box and keeps the corresponding AABB in the octree up to date.

**Install**
```bash
npm install @spatial-engine/three three
```

**Usage**

```ts
import { AABBPool, OctreeNodePool, Octree } from '@spatial-engine/core';
import { ThreeSynchronizer } from '@spatial-engine/three';
import { Mesh, BoxGeometry, MeshBasicMaterial } from 'three';

const nodePool = new OctreeNodePool(512);
const aabbPool = new AABBPool(512);
const octree   = new Octree(nodePool, aabbPool);
octree.setBounds(-100, -100, -100, 100, 100, 100);

const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
const sync = new ThreeSynchronizer(mesh, octree, aabbPool);

// Call sync.sync() each frame after updating the mesh's position/scale.
function animate() {
  mesh.position.x += 0.1;
  mesh.updateMatrixWorld();
  sync.sync(); // recomputes world AABB and repositions in octree
}
```

---

### `@spatial-engine/react`

React hooks for [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) scenes.  Pools are created once and remain stable across renders.

**Install**
```bash
npm install @spatial-engine/react three @react-three/fiber react
```

**`useSpatialEngine`** — manages a paired `AABBPool` + `RayPool`.

```tsx
import { useSpatialEngine } from '@spatial-engine/react';
import { useFrame } from '@react-three/fiber';

function Scene() {
  const engine = useSpatialEngine({ aabbCapacity: 1024, rayCapacity: 64 });

  useFrame(() => {
    engine.reset(); // free all allocations (no GC)
    // re-populate aabbPool and rayPool for this frame ...
  });
}
```

**`useOctree`** — manages an `Octree`, `OctreeNodePool`, and `AABBPool` together.

```tsx
import { useOctree } from '@spatial-engine/react';
import { useFrame } from '@react-three/fiber';

function Scene() {
  const { octree, aabbPool, reset } = useOctree({ nodeCapacity: 1024, objectCapacity: 1024 });

  useFrame(() => {
    reset(); // reset pools each frame
    // insert/update objects into the octree ...
    const hits = octree.queryBox(-5, -5, -5, 5, 5, 5);
  });
}
```

---

## LiDAR Web Worker

For scenes with many rays (e.g. simulated sensors), `createLidarProcessor` moves the entire sweep off the main thread using `SharedArrayBuffer`.

**Main thread**
```ts
import { AABBPool, RayPool, OctreeNodePool } from '@spatial-engine/core';
import type { LidarInitMessage, LidarSweepMessage } from '@spatial-engine/core';

const RAY_COUNT       = 360;
const OBJ_CAPACITY   = 256;
const NODE_CAPACITY  = 1024;

const { sab: aabbsSab } = AABBPool.createShared(OBJ_CAPACITY);
const { sab: nodesSab } = OctreeNodePool.createShared(NODE_CAPACITY);
const { sab: raysSab  } = RayPool.createShared(RAY_COUNT);
const resultsSab = new SharedArrayBuffer(RAY_COUNT * 2 * 4);

const worker = new Worker(new URL('@spatial-engine/core/lidar-worker', import.meta.url), { type: 'module' });

const initMsg: LidarInitMessage = {
  type: 'init',
  aabbsSab, nodesSab, raysSab, resultsSab,
  objectCapacity: OBJ_CAPACITY, nodeCapacity: NODE_CAPACITY, rayCount: RAY_COUNT,
  worldMinX: -100, worldMinY: -100, worldMinZ: -100,
  worldMaxX:  100, worldMaxY:  100, worldMaxZ:  100,
};
worker.postMessage(initMsg);

worker.onmessage = (e) => {
  if (e.data.type === 'ready') {
    // worker is ready — send sweep each frame
    const sweepMsg: LidarSweepMessage = { type: 'sweep', objectCount: 10 };
    worker.postMessage(sweepMsg);
  }
  if (e.data.type === 'done') {
    const results = new Float32Array(resultsSab);
    // results[r*2]   = objectIndex (-1 = miss)
    // results[r*2+1] = t distance
  }
};
```

---

## Use Cases

| Scenario | What to use |
|---|---|
| **Game collision broad-phase** | `Octree.insert` / `Octree.update` + `queryBox` for candidate pairs |
| **Frustum / view-cone culling** | `Octree.raycast` or `queryBox` to cull objects outside the camera frustum |
| **LiDAR sensor simulation** | `createLidarProcessor` in a Web Worker for hundreds of rays per frame |
| **Proximity queries** (find all objects within radius) | `queryBox` with a cube enclosing the sphere, then filter by distance |
| **Physics broad-phase** | Maintain one AABB per body; use `queryBox` to find overlap candidates before narrow-phase |
| **React Three Fiber interactive scene** | `useOctree` + `ThreeSynchronizer` for pointer / ray interaction |
| **Multiplayer / worker-based simulation** | `SharedArrayBuffer`-backed pools so main thread and worker share data without copying |

---

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type-check all packages
pnpm typecheck
```

The repository is a [pnpm workspace](https://pnpm.io/workspaces) monorepo.  Each package lives under `packages/` and is built with [tsup](https://tsup.egoist.dev/).

---

## License

MIT
# @spatial-engine/three

Bridges [`@spatial-engine/core`](https://www.npmjs.com/package/@spatial-engine/core) with [Three.js](https://threejs.org/). 

Provides `ThreeSynchronizer`, which automatically computes a `THREE.Mesh` or `THREE.Group`'s world-space bounding box and keeps the corresponding AABB exactly synchronized in the core DOD spatial octree without GC memory leaks.

## Installation

```bash
npm install @spatial-engine/three @spatial-engine/core three
# or
pnpm add @spatial-engine/three @spatial-engine/core three
```

## Features
- **Zero GC Sync** — computes world-space bounding boxes directly into the pre-allocated Data-Oriented Design (DOD) cache-friendly arrays.
- **Compatible with all Three.js Objects** — Works effortlessly with single `Mesh` components or deep `Group` tree hierarchies.

## Usage

```ts
import { AABBPool, OctreeNodePool, Octree } from '@spatial-engine/core';
import { ThreeSynchronizer } from '@spatial-engine/three';
import { Mesh, BoxGeometry, MeshBasicMaterial } from 'three';

// 1. Setup Data-Oriented core pools
const nodePool = new OctreeNodePool(512);
const aabbPool = new AABBPool(512);
const octree   = new Octree(nodePool, aabbPool);
octree.setBounds(-100, -100, -100, 100, 100, 100);

// 2. Setup Three.js Meshes
const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());

// 3. Connect them via synchronizer
const sync = new ThreeSynchronizer(mesh, octree, aabbPool);

function animate() {
  // Update your Three.js objects
  mesh.position.x += 0.1;
  mesh.updateMatrixWorld();
  
  // Call sync() each frame after updating position/scale
  // This computes world AABB and repositions it instantly in the octree
  sync.sync(); 
}
```

## Use Cases
- High performance custom raycasting bypassing Three.js's standard `Raycaster` allocations.
- Culling thousands of Three.js objects outside a specific region or box.
- Simulating robotic sensors or environment scans over complex Three.js loaded geometries safely synchronized onto the `Octree`.

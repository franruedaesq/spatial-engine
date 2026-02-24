# @spatial-engine/react

React hooks specifically designed for [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) scenes that interface with [`@spatial-engine/core`](https://www.npmjs.com/package/@spatial-engine/core) and [`@spatial-engine/three`](https://www.npmjs.com/package/@spatial-engine/three).

The hooks safely setup and manage pool lifecycles across React renders natively ensuring the core Data-Oriented arrays remain stable and don't leak memory.

## Installation

```bash
npm install @spatial-engine/react @spatial-engine/core @spatial-engine/three @react-three/fiber three react
# or
pnpm add @spatial-engine/react @spatial-engine/core @spatial-engine/three @react-three/fiber three react
```

## Features
- Provides React-safe lifecycles for complex DOD memory pools.
- Automatically initializes and clears arrays safely mapped exactly within the `useFrame` game loop.
- Simple, un-intimidating hooks (`useSpatialEngine`, `useOctree`) making extreme performance approachable in R3F.

## Usage

### Using `useSpatialEngine`
Manages a paired `AABBPool` and `RayPool` across renders.

```tsx
import { useSpatialEngine } from '@spatial-engine/react';
import { useFrame } from '@react-three/fiber';

function Scene() {
  const engine = useSpatialEngine({ aabbCapacity: 1024, rayCapacity: 64 });

  useFrame(() => {
    engine.reset(); // free all allocations safely each frame (zero GC impact)
    
    // dynamically re-populate your aabbPool and rayPool for this tick...
  });
}
```

### Using `useOctree`
Manages an entire `Octree`, alongside an `OctreeNodePool`, and `AABBPool` tied safely within a lifecycle context.

```tsx
import { useOctree } from '@spatial-engine/react';
import { useFrame, useThree } from '@react-three/fiber';

function Scene() {
  const { octree, aabbPool, reset } = useOctree({ 
    nodeCapacity: 1024, 
    objectCapacity: 1024 
  });

  useFrame(() => {
    reset(); // reset DOD pools each frame
    
    // insert/update objects into the octree here natively mapping external models ...
    
    // Native query without memory allocations
    const hits = octree.queryBox(-5, -5, -5, 5, 5, 5);
  });
}
```

## Use Cases
- Building interactive pointer/ray mechanics across thousands of objects smoothly.
- Connecting external R3F `useFrame` mechanics perfectly safely over the Spatial Engine lifecycle context.
- Frustum culling heavy geometries smoothly out of view in React Three scenarios.

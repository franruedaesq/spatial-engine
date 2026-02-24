import { describe, it, expect } from 'vitest';
import { createLidarProcessor } from '../src/lidar-worker.js';
import { AABBPool, AABB_STRIDE } from '../src/aabb.js';
import { OctreeNodePool, NODE_STRIDE } from '../src/octree-node.js';
import { RAY_STRIDE } from '../src/ray.js';

/** Allocate SharedArrayBuffers for all four channels used by the processor. */
function makeSharedBuffers(opts: {
  objectCapacity: number;
  nodeCapacity: number;
  rayCount: number;
}) {
  const aabbsSab = new SharedArrayBuffer(opts.objectCapacity * AABB_STRIDE * 4);
  const nodesSab = new SharedArrayBuffer(opts.nodeCapacity * NODE_STRIDE * 4);
  const raysSab = new SharedArrayBuffer(opts.rayCount * RAY_STRIDE * 4);
  const resultsSab = new SharedArrayBuffer(opts.rayCount * 2 * 4);
  return { aabbsSab, nodesSab, raysSab, resultsSab };
}

/** Write an AABB directly into the shared transforms buffer. */
function writeAABB(
  sab: SharedArrayBuffer,
  index: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
) {
  const view = new Float32Array(sab);
  const off = index * AABB_STRIDE;
  view[off] = minX;
  view[off + 1] = minY;
  view[off + 2] = minZ;
  view[off + 3] = maxX;
  view[off + 4] = maxY;
  view[off + 5] = maxZ;
}

/** Write a ray (origin + direction) into the shared rays buffer. */
function writeRay(
  sab: SharedArrayBuffer,
  index: number,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
) {
  const view = new Float32Array(sab);
  const off = index * RAY_STRIDE;
  view[off] = ox;
  view[off + 1] = oy;
  view[off + 2] = oz;
  view[off + 3] = dx;
  view[off + 4] = dy;
  view[off + 5] = dz;
}

/** Read a single raycast result from the results buffer. */
function readResult(sab: SharedArrayBuffer, rayIndex: number): { objectIndex: number; t: number } {
  const view = new Float32Array(sab);
  return {
    objectIndex: view[rayIndex * 2] ?? -1,
    t: view[rayIndex * 2 + 1] ?? -1,
  };
}

describe('createLidarProcessor', () => {
  it('init returns a ready message', () => {
    const { aabbsSab, nodesSab, raysSab, resultsSab } = makeSharedBuffers({
      objectCapacity: 32,
      nodeCapacity: 256,
      rayCount: 4,
    });

    const processor = createLidarProcessor();
    const reply = processor.init({
      type: 'init',
      aabbsSab,
      nodesSab,
      raysSab,
      resultsSab,
      objectCapacity: 32,
      nodeCapacity: 256,
      rayCount: 4,
      worldMinX: -50, worldMinY: -50, worldMinZ: -50,
      worldMaxX: 50,  worldMaxY: 50,  worldMaxZ: 50,
    });

    expect(reply.type).toBe('ready');
  });

  it('sweep with no objects and no rays returns done with rayCount 0', () => {
    const { aabbsSab, nodesSab, raysSab, resultsSab } = makeSharedBuffers({
      objectCapacity: 32,
      nodeCapacity: 256,
      rayCount: 0,
    });

    const processor = createLidarProcessor();
    processor.init({
      type: 'init',
      aabbsSab, nodesSab, raysSab, resultsSab,
      objectCapacity: 32, nodeCapacity: 256, rayCount: 0,
      worldMinX: -50, worldMinY: -50, worldMinZ: -50,
      worldMaxX: 50,  worldMaxY: 50,  worldMaxZ: 50,
    });

    const done = processor.sweep({ type: 'sweep', objectCount: 0 });
    expect(done.type).toBe('done');
    expect(done.rayCount).toBe(0);
  });

  it('returns a hit when a ray intersects the only object', () => {
    const rayCount = 1;
    const { aabbsSab, nodesSab, raysSab, resultsSab } = makeSharedBuffers({
      objectCapacity: 4,
      nodeCapacity: 64,
      rayCount,
    });

    // Object at [10, 0, 0]-[11, 1, 1]
    writeAABB(aabbsSab, 0, 10, 0, 0, 11, 1, 1);
    // Ray from (-5, 0.5, 0.5) along +X – should hit at t ≈ 15
    writeRay(raysSab, 0, -5, 0.5, 0.5, 1, 0, 0);

    const processor = createLidarProcessor();
    processor.init({
      type: 'init',
      aabbsSab, nodesSab, raysSab, resultsSab,
      objectCapacity: 4, nodeCapacity: 64, rayCount,
      worldMinX: -50, worldMinY: -50, worldMinZ: -50,
      worldMaxX: 50,  worldMaxY: 50,  worldMaxZ: 50,
    });
    processor.sweep({ type: 'sweep', objectCount: 1 });

    const result = readResult(resultsSab, 0);
    expect(result.objectIndex).toBe(0);
    expect(result.t).toBeCloseTo(15, 3);
  });

  it('writes –1/–1 when a ray misses all objects', () => {
    const rayCount = 1;
    const { aabbsSab, nodesSab, raysSab, resultsSab } = makeSharedBuffers({
      objectCapacity: 4,
      nodeCapacity: 64,
      rayCount,
    });

    writeAABB(aabbsSab, 0, 40, 40, 40, 41, 41, 41);
    // Ray pointing away from the object
    writeRay(raysSab, 0, 0, 0, 0, 0, 0, 1);

    const processor = createLidarProcessor();
    processor.init({
      type: 'init',
      aabbsSab, nodesSab, raysSab, resultsSab,
      objectCapacity: 4, nodeCapacity: 64, rayCount,
      worldMinX: -50, worldMinY: -50, worldMinZ: -50,
      worldMaxX: 50,  worldMaxY: 50,  worldMaxZ: 50,
    });
    processor.sweep({ type: 'sweep', objectCount: 1 });

    const result = readResult(resultsSab, 0);
    expect(result.objectIndex).toBe(-1);
    expect(result.t).toBe(-1);
  });

  it('returns the closest of two objects along the same ray', () => {
    const rayCount = 1;
    const { aabbsSab, nodesSab, raysSab, resultsSab } = makeSharedBuffers({
      objectCapacity: 8,
      nodeCapacity: 128,
      rayCount,
    });

    // Object 0 is near (t ≈ 10), object 1 is far (t ≈ 20)
    writeAABB(aabbsSab, 0,  5, -0.5, -0.5,  6, 0.5, 0.5);
    writeAABB(aabbsSab, 1, 20, -0.5, -0.5, 21, 0.5, 0.5);
    writeRay(raysSab, 0, -5, 0, 0, 1, 0, 0);

    const processor = createLidarProcessor();
    processor.init({
      type: 'init',
      aabbsSab, nodesSab, raysSab, resultsSab,
      objectCapacity: 8, nodeCapacity: 128, rayCount,
      worldMinX: -50, worldMinY: -50, worldMinZ: -50,
      worldMaxX: 50,  worldMaxY: 50,  worldMaxZ: 50,
    });
    processor.sweep({ type: 'sweep', objectCount: 2 });

    const result = readResult(resultsSab, 0);
    expect(result.objectIndex).toBe(0);
    expect(result.t).toBeCloseTo(10, 3);
  });

  it('handles multiple rays in a single sweep', () => {
    const rayCount = 2;
    const { aabbsSab, nodesSab, raysSab, resultsSab } = makeSharedBuffers({
      objectCapacity: 8,
      nodeCapacity: 128,
      rayCount,
    });

    // Two objects
    writeAABB(aabbsSab, 0, 10, -0.5, -0.5, 11, 0.5, 0.5);
    writeAABB(aabbsSab, 1, -11, -0.5, -0.5, -10, 0.5, 0.5);

    // Ray 0: from (-5, 0, 0) along +X – hits object 0 at t ≈ 15
    writeRay(raysSab, 0, -5, 0, 0,  1, 0, 0);
    // Ray 1: from (5, 0, 0) along -X – hits object 1 at t ≈ 16
    writeRay(raysSab, 1,  5, 0, 0, -1, 0, 0);

    const processor = createLidarProcessor();
    processor.init({
      type: 'init',
      aabbsSab, nodesSab, raysSab, resultsSab,
      objectCapacity: 8, nodeCapacity: 128, rayCount,
      worldMinX: -50, worldMinY: -50, worldMinZ: -50,
      worldMaxX: 50,  worldMaxY: 50,  worldMaxZ: 50,
    });
    processor.sweep({ type: 'sweep', objectCount: 2 });

    const r0 = readResult(resultsSab, 0);
    const r1 = readResult(resultsSab, 1);

    expect(r0.objectIndex).toBe(0);
    expect(r0.t).toBeCloseTo(15, 3);

    expect(r1.objectIndex).toBe(1);
    expect(r1.t).toBeCloseTo(15, 3);
  });

  it('correctly updates object positions across multiple sweeps', () => {
    const rayCount = 1;
    const { aabbsSab, nodesSab, raysSab, resultsSab } = makeSharedBuffers({
      objectCapacity: 4,
      nodeCapacity: 64,
      rayCount,
    });

    const processor = createLidarProcessor();
    processor.init({
      type: 'init',
      aabbsSab, nodesSab, raysSab, resultsSab,
      objectCapacity: 4, nodeCapacity: 64, rayCount,
      worldMinX: -50, worldMinY: -50, worldMinZ: -50,
      worldMaxX: 50,  worldMaxY: 50,  worldMaxZ: 50,
    });

    // First sweep: object at [10, 0, 0]-[11, 1, 1], ray along +X from (-5, 0.5, 0.5)
    writeAABB(aabbsSab, 0, 10, 0, 0, 11, 1, 1);
    writeRay(raysSab, 0, -5, 0.5, 0.5, 1, 0, 0);
    processor.sweep({ type: 'sweep', objectCount: 1 });

    const r1 = readResult(resultsSab, 0);
    expect(r1.objectIndex).toBe(0);
    expect(r1.t).toBeCloseTo(15, 3);

    // Second sweep: object moves to [25, 0, 0]-[26, 1, 1]
    writeAABB(aabbsSab, 0, 25, 0, 0, 26, 1, 1);
    processor.sweep({ type: 'sweep', objectCount: 1 });

    const r2 = readResult(resultsSab, 0);
    expect(r2.objectIndex).toBe(0);
    expect(r2.t).toBeCloseTo(30, 3);
  });

  it('throws when sweep is called before init', () => {
    const processor = createLidarProcessor();
    expect(() => processor.sweep({ type: 'sweep', objectCount: 0 })).toThrow();
  });
});

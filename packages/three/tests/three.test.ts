import { describe, it, expect, beforeEach } from 'vitest';
import { Box3, Vector3, Ray, Mesh, BoxGeometry, MeshBasicMaterial, Group } from 'three';
import { box3ToAABB, threeRayToPool, rayBox3Intersect, rayToFlatArray, ThreeSynchronizer } from '../src/index.js';
import { AABBPool, RayPool, Octree, OctreeNodePool, RAY_STRIDE } from '@spatial-engine/core';

describe('box3ToAABB', () => {
  it('converts a Three.js Box3 into an AABB pool entry', () => {
    const pool = new AABBPool(4);
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 2, 3));
    const idx = box3ToAABB(pool, box);
    expect(idx).toBe(0);
    expect(pool.get(idx, 0)).toBe(0); // minX
    expect(pool.get(idx, 4)).toBe(2); // maxY
    expect(pool.get(idx, 5)).toBe(3); // maxZ
  });
});

describe('threeRayToPool', () => {
  it('converts a Three.js Ray into a RayPool entry', () => {
    const pool = new RayPool(4);
    const ray = new Ray(new Vector3(1, 2, 3), new Vector3(0, 0, 1));
    const idx = threeRayToPool(pool, ray);
    expect(idx).toBe(0);
    expect(pool.get(idx, 0)).toBe(1); // ox
    expect(pool.get(idx, 5)).toBe(1); // dz
  });
});

describe('rayBox3Intersect', () => {
  it('returns positive t when ray hits box', () => {
    const ray = new Ray(new Vector3(-5, 0.5, 0.5), new Vector3(1, 0, 0));
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    const t = rayBox3Intersect(ray, box);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeCloseTo(5, 5);
  });

  it('returns -1 when ray misses box', () => {
    const ray = new Ray(new Vector3(0, 5, 0), new Vector3(1, 0, 0));
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    expect(rayBox3Intersect(ray, box)).toBe(-1);
  });
});

describe('rayToFlatArray', () => {
  it('returns a Float32Array with [ox, oy, oz, dx, dy, dz]', () => {
    const ray = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
    const buf = rayToFlatArray(ray);
    expect(buf).toBeInstanceOf(Float32Array);
    expect(buf.length).toBe(RAY_STRIDE);
    expect(buf[0]).toBe(1); // ox
    expect(buf[1]).toBe(2); // oy
    expect(buf[2]).toBe(3); // oz
    expect(buf[3]).toBe(0); // dx
    expect(buf[4]).toBe(1); // dy
    expect(buf[5]).toBe(0); // dz
  });

  it('writes into a pre-allocated buffer when provided', () => {
    const ray = new Ray(new Vector3(4, 5, 6), new Vector3(1, 0, 0));
    const existing = new Float32Array(RAY_STRIDE);
    const returned = rayToFlatArray(ray, existing);
    expect(returned).toBe(existing); // same reference
    expect(existing[0]).toBe(4);
    expect(existing[3]).toBe(1);
  });

  it('can be used directly with Octree.raycast', () => {
    const nodePool = new OctreeNodePool(512);
    const aabbPool = new AABBPool(512);
    const octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-100, -100, -100, 100, 100, 100);

    // Insert a unit AABB at origin.
    const idx = aabbPool.allocate();
    aabbPool.set(idx, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
    octree.insert(idx);

    // Ray pointing along +X from x=-5 through origin.
    const ray = new Ray(new Vector3(-5, 0, 0), new Vector3(1, 0, 0));
    const buf = rayToFlatArray(ray);
    const hit = octree.raycast(buf, 0);
    expect(hit).not.toBeNull();
    expect(hit!.objectIndex).toBe(idx);
    expect(hit!.t).toBeCloseTo(4.5, 4);
  });
});

describe('ThreeSynchronizer', () => {
  let nodePool: OctreeNodePool;
  let aabbPool: AABBPool;
  let octree: Octree;

  beforeEach(() => {
    nodePool = new OctreeNodePool(512);
    aabbPool = new AABBPool(512);
    octree = new Octree(nodePool, aabbPool);
    octree.setBounds(-100, -100, -100, 100, 100, 100);
  });

  it('allocates a unique numeric id on construction', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const sync = new ThreeSynchronizer(mesh, octree, aabbPool);
    expect(typeof sync.id).toBe('number');
    expect(sync.id).toBeGreaterThanOrEqual(0);
  });

  it('each synchronizer gets a distinct id', () => {
    const meshA = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const meshB = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
    const syncA = new ThreeSynchronizer(meshA, octree, aabbPool);
    const syncB = new ThreeSynchronizer(meshB, octree, aabbPool);
    expect(syncA.id).not.toBe(syncB.id);
  });

  it('sync() inserts the mesh bounding box into the octree', () => {
    const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
    const sync = new ThreeSynchronizer(mesh, octree, aabbPool);
    sync.sync();

    // The AABB should be [-1, -1, -1] to [1, 1, 1].
    expect(aabbPool.get(sync.id, 0)).toBeCloseTo(-1, 4); // minX
    expect(aabbPool.get(sync.id, 3)).toBeCloseTo(1, 4);  // maxX

    // The object should be findable via a ray through the origin.
    const ray = new Ray(new Vector3(-10, 0, 0), new Vector3(1, 0, 0));
    const buf = rayToFlatArray(ray);
    const hit = octree.raycast(buf, 0);
    expect(hit).not.toBeNull();
    expect(hit!.objectIndex).toBe(sync.id);
  });

  it('id remains stable across multiple sync() calls', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const sync = new ThreeSynchronizer(mesh, octree, aabbPool);
    const idBefore = sync.id;
    sync.sync();
    sync.sync();
    expect(sync.id).toBe(idBefore);
  });

  it('sync() updates the AABB when the object moves', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const sync = new ThreeSynchronizer(mesh, octree, aabbPool);
    sync.sync();

    // Move the mesh to (10, 0, 0) and sync again.
    mesh.position.set(10, 0, 0);
    mesh.updateMatrixWorld(true);
    sync.sync();

    // The AABB min should now be near 9.5.
    expect(aabbPool.get(sync.id, 0)).toBeCloseTo(9.5, 4); // minX
    expect(aabbPool.get(sync.id, 3)).toBeCloseTo(10.5, 4); // maxX
  });

  it('works with a THREE.Group containing multiple meshes', () => {
    const group = new Group();
    group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
    group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
    (group.children[1] as Mesh).position.set(4, 0, 0);

    const sync = new ThreeSynchronizer(group, octree, aabbPool);
    sync.sync();

    // Group spans from -0.5 to 4.5 on X.
    expect(aabbPool.get(sync.id, 0)).toBeCloseTo(-0.5, 4); // minX
    expect(aabbPool.get(sync.id, 3)).toBeCloseTo(4.5, 4);  // maxX
  });
});

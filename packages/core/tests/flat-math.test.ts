import { describe, it, expect } from 'vitest';
import { vec3Distance, vec3DistanceSq, vec3Dot, vec3Cross } from '../src/flat-math.js';

describe('vec3Dot', () => {
  it('computes dot product of two vectors in the same buffer', () => {
    // [1,0,0] · [0,1,0] = 0
    const buf = new Float32Array([1, 0, 0, 0, 1, 0]);
    expect(vec3Dot(buf, 0, 3)).toBe(0);
  });

  it('computes dot product of parallel vectors', () => {
    // [1,2,3] · [1,2,3] = 1+4+9 = 14
    const buf = new Float32Array([1, 2, 3, 1, 2, 3]);
    expect(vec3Dot(buf, 0, 3)).toBeCloseTo(14);
  });

  it('computes dot product of arbitrary vectors', () => {
    // [1,2,3] · [4,5,6] = 4+10+18 = 32
    const buf = new Float32Array([1, 2, 3, 4, 5, 6]);
    expect(vec3Dot(buf, 0, 3)).toBeCloseTo(32);
  });

  it('supports arbitrary start indices', () => {
    // buf[2..4] = [1,2,3], buf[5..7] = [4,5,6] → 1*4+2*5+3*6 = 32
    const buf = new Float32Array([0, 0, 1, 2, 3, 4, 5, 6]);
    expect(vec3Dot(buf, 2, 5)).toBeCloseTo(32);
  });
});

describe('vec3DistanceSq', () => {
  it('returns 0 for same point', () => {
    const buf = new Float32Array([1, 2, 3, 1, 2, 3]);
    expect(vec3DistanceSq(buf, 0, 3)).toBe(0);
  });

  it('computes squared distance between two points', () => {
    // (0,0,0) to (3,4,0) → 9+16+0 = 25
    const buf = new Float32Array([0, 0, 0, 3, 4, 0]);
    expect(vec3DistanceSq(buf, 0, 3)).toBeCloseTo(25);
  });

  it('supports arbitrary start indices', () => {
    // buf[1..3] = [0,0,0], buf[4..6] = [1,1,1] → 1+1+1 = 3
    const buf = new Float32Array([0, 0, 0, 0, 1, 1, 1]);
    expect(vec3DistanceSq(buf, 1, 4)).toBeCloseTo(3);
  });
});

describe('vec3Distance', () => {
  it('returns 0 for same point', () => {
    const buf = new Float32Array([5, 5, 5, 5, 5, 5]);
    expect(vec3Distance(buf, 0, 3)).toBeCloseTo(0);
  });

  it('computes distance between two points', () => {
    // (0,0,0) to (3,4,0) → sqrt(25) = 5
    const buf = new Float32Array([0, 0, 0, 3, 4, 0]);
    expect(vec3Distance(buf, 0, 3)).toBeCloseTo(5);
  });

  it('computes distance along a single axis', () => {
    const buf = new Float32Array([1, 0, 0, 4, 0, 0]);
    expect(vec3Distance(buf, 0, 3)).toBeCloseTo(3);
  });
});

describe('vec3Cross', () => {
  it('computes cross product of X and Y unit vectors → Z', () => {
    // [1,0,0] × [0,1,0] = [0,0,1]
    const buf = new Float32Array([1, 0, 0, 0, 1, 0]);
    const out = new Float32Array(3);
    vec3Cross(out, 0, buf, 0, 3);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(1);
  });

  it('computes cross product of Y and X unit vectors → -Z', () => {
    // [0,1,0] × [1,0,0] = [0,0,-1]
    const buf = new Float32Array([0, 1, 0, 1, 0, 0]);
    const out = new Float32Array(3);
    vec3Cross(out, 0, buf, 0, 3);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(-1);
  });

  it('computes cross product of arbitrary vectors', () => {
    // [1,2,3] × [4,5,6] = [2*6-3*5, 3*4-1*6, 1*5-2*4] = [-3, 6, -3]
    const buf = new Float32Array([1, 2, 3, 4, 5, 6]);
    const out = new Float32Array(3);
    vec3Cross(out, 0, buf, 0, 3);
    expect(out[0]).toBeCloseTo(-3);
    expect(out[1]).toBeCloseTo(6);
    expect(out[2]).toBeCloseTo(-3);
  });

  it('writes result to arbitrary output offset', () => {
    // [1,0,0] × [0,1,0] = [0,0,1] written at out[2]
    const buf = new Float32Array([1, 0, 0, 0, 1, 0]);
    const out = new Float32Array(5);
    vec3Cross(out, 2, buf, 0, 3);
    expect(out[2]).toBeCloseTo(0);
    expect(out[3]).toBeCloseTo(0);
    expect(out[4]).toBeCloseTo(1);
  });

  it('cross product of parallel vectors is zero vector', () => {
    const buf = new Float32Array([1, 2, 3, 2, 4, 6]);
    const out = new Float32Array(3);
    vec3Cross(out, 0, buf, 0, 3);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(0);
  });
});

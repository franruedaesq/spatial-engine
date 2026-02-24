/**
 * Flat Array Math Utilities
 *
 * Zero-allocation Vec3 math that reads directly from a Float32Array
 * given a start index, without creating any Vector3 objects.
 *
 * All index parameters (`i`, `j`, `outOffset`) are raw flat-array offsets.
 */

/**
 * Compute the dot product of two Vec3s stored in `buf` at offsets `i` and `j`.
 */
export function vec3Dot(buf: Float32Array, i: number, j: number): number {
  return (buf[i] ?? 0) * (buf[j] ?? 0) +
    (buf[i + 1] ?? 0) * (buf[j + 1] ?? 0) +
    (buf[i + 2] ?? 0) * (buf[j + 2] ?? 0);
}

/**
 * Compute the squared distance between two Vec3s stored in `buf` at offsets `i` and `j`.
 */
export function vec3DistanceSq(buf: Float32Array, i: number, j: number): number {
  const dx = (buf[i] ?? 0) - (buf[j] ?? 0);
  const dy = (buf[i + 1] ?? 0) - (buf[j + 1] ?? 0);
  const dz = (buf[i + 2] ?? 0) - (buf[j + 2] ?? 0);
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Compute the Euclidean distance between two Vec3s stored in `buf` at offsets `i` and `j`.
 */
export function vec3Distance(buf: Float32Array, i: number, j: number): number {
  return Math.sqrt(vec3DistanceSq(buf, i, j));
}

/**
 * Compute the cross product of two Vec3s in `buf` at offsets `i` and `j`,
 * and write the result into `out` starting at `outOffset`.
 */
export function vec3Cross(
  out: Float32Array,
  outOffset: number,
  buf: Float32Array,
  i: number,
  j: number,
): void {
  const ax = buf[i] ?? 0;
  const ay = buf[i + 1] ?? 0;
  const az = buf[i + 2] ?? 0;
  const bx = buf[j] ?? 0;
  const by = buf[j + 1] ?? 0;
  const bz = buf[j + 2] ?? 0;
  out[outOffset] = ay * bz - az * by;
  out[outOffset + 1] = az * bx - ax * bz;
  out[outOffset + 2] = ax * by - ay * bx;
}

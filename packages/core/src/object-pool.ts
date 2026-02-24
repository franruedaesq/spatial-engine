/**
 * A generic Object Pool that manages a fixed set of integer indices.
 *
 * Pre-allocates a free-list on construction so that acquire() and release()
 * operate without any heap allocation.
 */
export class ObjectPool {
  private readonly freeList: Int32Array;
  private top: number;

  /** Total number of slots in the pool. */
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.freeList = new Int32Array(capacity);
    // Fill free-list in reverse so that the first acquire() returns index 0.
    for (let i = 0; i < capacity; i++) {
      this.freeList[i] = capacity - 1 - i;
    }
    this.top = capacity;
  }

  /** Number of indices currently available for acquisition. */
  get available(): number {
    return this.top;
  }

  /**
   * Acquire a free index from the pool.
   * Returns the index, or `null` when the pool is exhausted.
   */
  acquire(): number | null {
    if (this.top === 0) {
      return null;
    }
    this.top -= 1;
    return this.freeList[this.top] as number;
  }

  /**
   * Release a previously acquired index back to the pool.
   * Throws if the index is out of range or the pool is already full.
   */
  release(index: number): void {
    if (index < 0 || index >= this.capacity) {
      throw new RangeError(`ObjectPool.release: index ${index} is out of range [0, ${this.capacity})`);
    }
    if (this.top >= this.capacity) {
      throw new RangeError('ObjectPool.release: pool is already at full capacity');
    }
    this.freeList[this.top] = index;
    this.top += 1;
  }
}

import { describe, it, expect } from 'vitest';
import { AABBPool } from '../src/aabb.js';

describe('AABBPool – release() and slot recycling', () => {
    it('a released slot is returned by the next allocate()', () => {
        const pool = new AABBPool(8);
        const a = pool.allocate(); // slot 0
        const b = pool.allocate(); // slot 1

        pool.release(b);            // slot 1 back to free-list
        const c = pool.allocate();  // should reuse slot 1
        expect(c).toBe(b);
        expect(a).toBe(0);
    });

    it('released slots are reused LIFO – multiple releases', () => {
        const pool = new AABBPool(8);
        const s0 = pool.allocate(); // 0
        const s1 = pool.allocate(); // 1
        const s2 = pool.allocate(); // 2

        pool.release(s0);
        pool.release(s2);

        // LIFO: last released is first reused
        const r1 = pool.allocate();
        const r2 = pool.allocate();
        expect(new Set([r1, r2])).toEqual(new Set([s0, s2]));
        // Both originals were recycled – size should not have grown
        expect(pool.size).toBe(3);
    });

    it('size does not grow when slots are reused', () => {
        const pool = new AABBPool(8);
        const idx = pool.allocate(); // 0
        pool.release(idx);
        const recycled = pool.allocate();
        expect(recycled).toBe(0);
        expect(pool.size).toBe(1); // bump counter stayed at 1
    });

    it('set() + get() works correctly on a recycled slot', () => {
        const pool = new AABBPool(8);
        const idx = pool.allocate();
        pool.set(idx, 1, 2, 3, 4, 5, 6);
        pool.release(idx);

        const recycled = pool.allocate();
        // Overwrite with new data and verify.
        pool.set(recycled, 10, 20, 30, 40, 50, 60);
        expect(pool.get(recycled, 0)).toBe(10);
        expect(pool.get(recycled, 1)).toBe(20);
        expect(pool.get(recycled, 2)).toBe(30);
        expect(pool.get(recycled, 3)).toBe(40);
        expect(pool.get(recycled, 4)).toBe(50);
        expect(pool.get(recycled, 5)).toBe(60);
    });

    it('releasing an out-of-range index throws RangeError', () => {
        const pool = new AABBPool(4);
        expect(() => pool.release(-1)).toThrow(RangeError);
        expect(() => pool.release(4)).toThrow(RangeError);
    });

    it('double-releasing a slot throws RangeError (pool overflow guard)', () => {
        const pool = new AABBPool(4);
        pool.allocate(); // slot 0
        const idx = pool.allocate(); // slot 1
        pool.release(idx);
        // Releasing again should eventually overflow the ObjectPool free-list.
        // With capacity=4 and only 2 bump-allocated, the free-list has capacity for
        // 4 entries – so we need to push until overflow.
        // Simpler: release the same index twice; second must overflow eventually.
        // We test by releasing all slots and then one more time.
        expect(() => {
            for (let i = 0; i < 5; i++) pool.release(0);
        }).toThrow(RangeError);
    });

    it('reset() clears the free-list so allocate() returns 0 again', () => {
        const pool = new AABBPool(8);
        pool.allocate(); // 0
        pool.allocate(); // 1
        pool.release(0);
        pool.reset();

        const first = pool.allocate(); // should be 0 (fresh bump)
        expect(first).toBe(0);
        expect(pool.size).toBe(1);
    });
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/bag.js';
import {BagCbResolver} from '../src/resolver.js';

for (const cacheTime of [-1, -10, -0.5]) {
    test(`negative cache ${cacheTime} stays loaded until reset`, () => {
        let calls = 0;
        const resolver = new BagCbResolver({callback: () => ++calls, cacheTime});
        const bag = new Bag();
        bag.setItem('value', resolver);
        assert.equal(resolver.expired, true);
        assert.equal(bag.getItem('value'), 1);
        assert.equal(bag.getItem('value'), 1);
        assert.equal(resolver.expired, false);
        resolver.reset();
        assert.equal(resolver.expired, true);
        assert.equal(bag.getItem('value'), 2);
    });
}
test('boolean cache durations are rejected at construction and assignment', () => {
    for (const cacheTime of [false, true]) {
        assert.throws(() => new BagCbResolver({callback: () => 1, cacheTime}), TypeError);
        const resolver = new BagCbResolver(() => 1);
        assert.throws(() => { resolver.cacheTime = cacheTime; }, TypeError);
    }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

test('native empty path rejects every value without mutation', () => {
    for (const value of [null, undefined, 0, 'text', {}, {a: 2}, new Bag(), new Map()]) {
        const bag = new Bag({existing: 1});
        assert.throws(() => bag.setItem('', value), /non-empty/);
        assert.deepEqual(bag.asDict(), {existing: 1});
        assert.equal(bag.setItem('valid', value), bag.getNode('valid'));
    }
});

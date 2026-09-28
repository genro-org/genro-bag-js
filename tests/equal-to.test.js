import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

test('equalTo rejects non-Bags and isEqual is not a standalone Bag method', () => {
    const bag = new Bag({x: 1});
    assert.equal(bag.isEqual, undefined);
    for (const other of [null, undefined, {}, 1, 'x', {_nodes: bag._nodes}]) {
        assert.equal(bag.equalTo(other), false);
    }
    assert.equal(bag.equalTo(bag), true);
    assert.equal(bag.equalTo(new Bag({x: 1})), true);
});

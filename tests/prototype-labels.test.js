import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

for (const label of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    test(`ordinary node lifecycle for label ${label}, including after clear`, () => {
        const bag = new Bag();
        for (let round = 0; round < 2; round++) {
            assert.equal(bag.getNode(label), null);
            bag.setItem(label, 1);
            const node = bag.getNode(label);
            assert.equal(node.label, label);
            assert.equal(bag.getItem(label), 1);
            assert.deepEqual(bag.keys(), [label]);
            bag.setItem(label, 2);
            assert.equal(bag.getNode(label), node);
            assert.equal(bag.length, 1);
            assert.equal(Object.getOwnPropertyDescriptor(bag.asDict(), label).value, 2);
            assert.equal(bag.pop(label), 2);
            assert.equal(bag.getNode(label), null);
            assert.equal(bag.length, 0);
            bag.setItem(label, 3);
            bag.clear();
            assert.equal(bag.getNode(label), null);
        }
    });
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/bag.js';
import {BagNode} from '../src/bag-node.js';

test('node constructor removes null by default and preserves it explicitly', () => {
    const attributes = {nullable: null, zero: 0, flag: false, empty: ''};
    const normal = new BagNode(null, 'normal', 1, attributes);
    assert.deepEqual(normal.attr, {zero: 0, flag: false, empty: ''});
    const preserved = new BagNode(null, 'kept', 1, attributes, null, 'row', 'item', false);
    assert.deepEqual(preserved.attr, attributes);
    assert.notEqual(preserved.attr, attributes);
    assert.equal(preserved.nodeTag, 'row');
    assert.equal(preserved.xmlTag, 'item');
    assert.equal(attributes.nullable, null);
});

test('setItem passes null preservation to the node constructor and later updates', () => {
    const bag = new Bag();
    bag.setItem('normal', 1, {nullable: null});
    assert.equal(Object.hasOwn(bag.getNode('normal').attr, 'nullable'), false);
    bag.setItem('kept', 1, {nullable: null}, '>', false, false);
    assert.equal(Object.hasOwn(bag.getNode('kept').attr, 'nullable'), true);
    bag.setItem('kept', 2, {other: null}, '>', false, false);
    assert.equal(Object.hasOwn(bag.getNode('kept').attr, 'other'), true);
});

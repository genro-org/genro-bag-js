import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';
for (const path of ['customer', 'section.customer']) {
    test(`setAttr creates missing node at ${path} and preserves existing values`, () => {
        const bag = new Bag();
        bag.setAttr(path, {caption: 'Customer'});
        const node = bag.getNode(path);
        assert.ok(node);
        assert.equal(node.value, null);
        assert.equal(node.attr.caption, 'Customer');
        node.value = 42;
        bag.setAttr(path, {color: 'blue'});
        assert.equal(bag.getNode(path), node);
        assert.equal(node.value, 42);
        assert.deepEqual(node.attr, {caption: 'Customer', color: 'blue'});
    });
}

test('setAttr preserves existing attributes and nulls when removal is disabled', () => {
    const bag = new Bag();
    bag.setItem('article', 42, {color: 'red'});
    bag.setAttr('article', {size: null}, false);
    assert.deepEqual(bag.getNode('article').attr, {color: 'red', size: null});
    assert.equal(bag.getItem('article'), 42);

    bag.setAttr('article', {caption: 'Article'});
    assert.deepEqual(bag.getNode('article').attr, {color: 'red', caption: 'Article'});
});

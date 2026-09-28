import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag, BagCbResolver} from '../src/index.js';

test('traverse yields original nodes in depth-first order', () => {
    const bag = new Bag();
    bag.setItem('customer.name', 'Ada');
    bag.setItem('customer.address.city', 'Rome');
    bag.setItem('invoice', 42);
    const paths = ['customer', 'customer.name', 'customer.address',
        'customer.address.city', 'invoice'];
    const nodes = [...bag.traverse()];
    assert.equal(nodes.length, paths.length);
    nodes.forEach((node, i) => assert.equal(node, bag.getNode(paths[i])));
    nodes[1].value = 'Grace';
    assert.equal(bag.getItem('customer.name'), 'Grace');
    assert.deepEqual([...new Bag().traverse()], []);
});

test('traverse is lazy and does not resolve values', () => {
    let calls = 0;
    const bag = new Bag();
    bag.setItem('lazy', new BagCbResolver(() => {
        calls++;
        return new Bag({leaf: 1});
    }));
    const iterator = bag.traverse();
    assert.equal(iterator[Symbol.iterator](), iterator);
    assert.equal(iterator.next().value, bag.getNode('lazy'));
    assert.equal(iterator.next().done, true);
    assert.equal(calls, 0);
});

test('traverse visits shared subtrees at each occurrence', () => {
    const shared = new Bag({leaf: 1});
    const bag = new Bag();
    bag.setItem('a', shared);
    bag.setItem('b', shared);
    assert.deepEqual([...bag.traverse()].map(node => node.label),
        ['a', 'leaf', 'b', 'leaf']);
});

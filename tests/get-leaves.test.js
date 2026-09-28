import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag, BagCbResolver} from '../src/index.js';

test('getLeaves includes only non-Bag values with relative paths', () => {
    const bag = new Bag();
    bag.setItem('customer.address.city', 'Rome');
    bag.setItem('customer.empty', new Bag());
    bag.setItem('null', null);
    bag.setItem('zero', 0);
    bag.setItem('false', false);
    bag.setItem('text', '');
    bag.setItem('list', [1, 2]);
    assert.deepEqual(bag.getLeaves(), [['customer.address.city', 'Rome'],
        ['null', null], ['zero', 0], ['false', false], ['text', ''], ['list', [1, 2]]]);
    assert.deepEqual(bag.getItem('customer').getLeaves(), [['address.city', 'Rome']]);
    assert.deepEqual(new Bag().getLeaves(), []);
});

test('getLeaves resolves uncached nodes once per occurrence', () => {
    const calls = [];
    const resolver = (label, result) => new BagCbResolver({cacheTime: 0, callback: () => {
        calls.push(label);
        return result;
    }});
    const child = new Bag();
    child.setItem('value', resolver('value', null));
    const bag = new Bag();
    bag.setItem('branch', resolver('branch', child));
    assert.deepEqual(bag.getLeaves(), [['branch.value', null]]);
    assert.deepEqual(calls, ['branch', 'value']);
});

test('getLeaves reports a shared subtree at both paths', () => {
    const child = new Bag({leaf: 1});
    const bag = new Bag();
    bag.setItem('a', child);
    bag.setItem('b', child);
    assert.deepEqual(bag.getLeaves(), [['a.leaf', 1], ['b.leaf', 1]]);
});

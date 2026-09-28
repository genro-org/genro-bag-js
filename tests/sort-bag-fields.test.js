import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

for (const [mode, expected] of [['a', ['r2', 'r1', 'r3']], ['d', ['r1', 'r3', 'r2']]]) {
    test(`sort Bag rows by field ${mode}, preserving equal-key order and row contents`, () => {
        const bag = new Bag();
        for (const [label, price] of [['r1', 20], ['r2', 10], ['r3', 20]]) {
            bag.setItem(`${label}.z`, 'unchanged');
            bag.setItem(`${label}.price`, price);
            bag.setItem(`${label}.a`, 'unchanged');
        }
        const rows = new Map(bag.getNodes().map(n => [n.label, [n, n.value, n.value.getNodes().slice()]]));
        assert.equal(bag.sort(`price:${mode}`), bag);
        assert.deepEqual(bag.getNodes().map(n => n.label), expected);
        for (const n of bag.getNodes()) {
            const [original, value, children] = rows.get(n.label);
            assert.equal(n, original); assert.equal(n.value, value);
            assert.deepEqual(n.value.getNodes(), children);
        }
    });
}

test('sort supports a path within each row and multiple criteria', () => {
    const bag = new Bag();
    for (const [label, price, rank] of [['r1', 20, 2], ['r2', 10, 3], ['r3', 20, 1]]) {
        bag.setItem(`${label}.details.price`, price);
        bag.setItem(`${label}.rank`, rank);
    }
    bag.sort('details.price:a,rank:a');
    assert.deepEqual(bag.getNodes().map(n => n.label), ['r2', 'r3', 'r1']);
});

test('sort still supports ordinary object values', () => {
    const bag = new Bag();
    bag.setItem('r1', {price: 20}); bag.setItem('r2', {price: 10});
    bag.sort('price:a');
    assert.deepEqual(bag.getNodes().map(n => n.label), ['r2', 'r1']);
});

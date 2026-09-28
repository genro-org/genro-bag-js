import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';
for (const empty of [null, undefined, '']) {
    test(`strict sum and predicate, empty=${String(empty)}`, () => {
        const bag = new Bag(); bag.setItem('a', 3); bag.setItem('b', empty); bag.setItem('c', 4);
        const original = bag.getItem('b');
        assert.equal(bag.sum(), 7);
        assert.equal(bag.sum('#v', true), null);
        assert.equal(bag.sum('#v', true, n => n.label !== 'b'), 7);
        assert.equal(bag.getItem('b'), original);
    });
}
test('zero, false, empty selection and multiple sums', () => {
    const bag = new Bag(); bag.setItem('zero', 0); bag.setItem('false', false); bag.setItem('true', true);
    assert.equal(bag.sum('#v', true), 1);
    assert.equal(bag.sum('#v', true, () => false), 0);
    assert.equal(new Bag().sum('#v', true), 0);
    bag.setItem('other', 3, {qty: 4});
    assert.deepEqual(bag.sum('#v,#a.qty', true), [4, null]);
    assert.throws(() => bag.sum('#v', () => true), /third argument/);
});
for (const value of ['9', 'text', ' ', [], {}, new Bag()]) {
    test(`non-numeric ${Object.prototype.toString.call(value)} is ignored or rejected`, () => {
        const bag = new Bag(); bag.setItem('a', 3); bag.setItem('invalid', value); bag.setItem('b', 4);
        assert.equal(bag.sum(), 7);
        assert.throws(() => bag.sum('#v', true), /non-numeric/);
        assert.equal(bag.sum('#v', true, n => n.label !== 'invalid'), 7);
    });
}
for (const values of [[null, '9'], ['9', null]]) {
    test('invalid types are not hidden by null in strict mode', () => {
        const bag = new Bag(); values.forEach((v, i) => bag.setItem(String(i), v));
        assert.throws(() => bag.sum('#v', true), /non-numeric/);
    });
}

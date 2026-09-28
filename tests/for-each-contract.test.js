import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag, BagCbResolver} from '../src/index.js';

test('forEach defaults to direct nodes; deep skips branches and returns a nested match', () => {
    const bag = new Bag();
    bag.setItem('a.skip.child', 1);
    bag.setItem('a.keep', 2);
    bag.setItem('tail', 3);
    const direct = [];
    assert.equal(bag.forEach(node => {direct.push(node.label);}), null);
    assert.deepEqual(direct, ['a', 'tail']);
    const seen = [];
    const result = bag.forEach(node => {
        seen.push(node.label);
        if (node.label === 'skip') return false;
        if (node.label === 'keep') return node;
    }, {deep: true});
    assert.equal(result, bag.getNode('a.keep'));
    assert.deepEqual(seen, ['a', 'skip', 'keep']);
    assert.equal(bag.walk, undefined);
});

test('forEach controls resolution, forwards kwargs and propagates callback errors', () => {
    let calls = 0;
    const bag = new Bag();
    bag.setItem('remote', new BagCbResolver(() => {
        calls++;
        return new Bag({leaf: 1});
    }));
    bag.forEach(() => {}, {deep: true});
    bag.forEach(() => false, {deep: true, static: false});
    assert.equal(calls, 0);
    const seen = [];
    bag.forEach((node, kw, index) => {seen.push([node.label, kw.marker, index]);},
        {deep: true, static: false, kwargs: {marker: 42}});
    assert.deepEqual(seen, [['remote', 42, 0], ['leaf', 42, 0]]);
    assert.equal(calls, 1);
    assert.throws(() => bag.forEach(null), TypeError);
    assert.throws(() => bag.forEach(() => {throw new Error('callback');}), /callback/);
});

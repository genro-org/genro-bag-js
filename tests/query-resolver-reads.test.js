import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag, BagCbResolver} from '../src/index.js';

const resolver = callback => new BagCbResolver({callback, cacheTime: 0});

test('query reuses branch and null leaf values but not across queries', () => {
    const calls = [];
    const child = new Bag();
    child.setItem('leaf', resolver(() => {calls.push('leaf'); return null;}));
    const bag = new Bag();
    bag.setItem('branch', resolver(() => {calls.push('branch'); return child;}));
    for (let i = 0; i < 2; i++) {
        assert.deepEqual(bag.query('#p,#v,#v', null, false, true, true, false, null, false),
            [['branch.leaf', null, null]]);
    }
    assert.deepEqual(calls, ['branch', 'leaf', 'branch', 'leaf']);
});

test('changing resolver yields one consistent row', () => {
    let calls = 0;
    const bag = new Bag();
    bag.setItem('n', resolver(() => ++calls));
    assert.deepEqual(bag.query('#v,#v', null, false, false, true, true, null, false), [[1, 1]]);
    assert.equal(calls, 1);
});

test('metadata, static and limited queries avoid unneeded resolution; iterators remain lazy', () => {
    let calls = 0;
    const bag = new Bag();
    bag.setItem('branch', resolver(() => {calls++; return new Bag({leaf: 1});}), {caption: 'Branch'});
    assert.deepEqual(bag.query('#k,#a.caption', null, false, false, true, true, null, false),
        [['branch', 'Branch']]);
    assert.deepEqual(bag.query('#p', null, false, true, true, true, 1, false), ['branch']);
    assert.deepEqual(bag.query('#v', null, false, true), [null]);
    assert.equal(calls, 0);
    const iterator = bag.query('#p,#v', null, true, true, true, false, null, false);
    assert.equal(calls, 0);
    assert.deepEqual(iterator.next().value, ['branch.leaf', 1]);
    assert.equal(calls, 1);
});

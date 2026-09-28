import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';
test('recursive conversion preserves empty values and only excludes nullish values', () => {
    const child = new Bag();
    for (const [key, value] of [['Null', null], ['Zero', 0], ['False', false], ['Empty', ''], ['Bag', new Bag()], ['Code', 'x::JS']]) child.setItem(key, value);
    const bag = new Bag(); bag.setItem('Child', child);
    assert.equal(bag.asDict().Child, child);
    assert.deepEqual(bag.asDict(false, true, true, true), {child: {zero: 0, false: false, empty: '', bag: {}, code: 'x::JS'}});
    assert.equal(bag.asDict(false, false, true).Child.Null, null);
    assert.ok(child.getNode('Null'));
});
test('ordinary containers and empty Bags remain unchanged', () => {
    const bag = new Bag(); const obj = {x: null}; const empty = new Bag();
    bag.setItem('obj', obj); bag.setItem('empty', empty);
    assert.equal(bag.asDict(false, false, true, true).obj, obj);
    assert.equal(bag.asDict(false, false, false, true).empty, empty);
});

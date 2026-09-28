import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';
for (const value of [1, 0, false, '']) {
    test(`Bag row path lookup for ${JSON.stringify(value)}`, () => {
        const bag = new Bag();
        bag.setItem('first.nested.field', value); bag.setItem('second.nested.field', value);
        assert.equal(bag.getNodeByValue('nested.field', value), bag.getNode('first'));
        assert.equal(bag.getNodeByValue('field', value), null);
    });
}
test('Map keys retain their literal lookup behavior', () => {
    const bag = new Bag(); bag.setItem('row', new Map([['nested.field', 7]]));
    assert.equal(bag.getNodeByValue('nested.field', 7), bag.getNode('row'));
});

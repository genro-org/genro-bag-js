import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';
for (const deep_first of [false, true]) {
    for (const value of ['yes', undefined]) {
        test(`attribute order deep_first=${deep_first}, value=${value}`, () => {
            const bag = new Bag();
            bag.setItem('branch.inner.deep', 1, {match: 'yes'});
            bag.setItem('sibling', 2, {match: 'yes'});
            assert.equal(bag.getNodeByAttr('match', value, false, deep_first).label,
                deep_first ? 'deep' : 'sibling');
            bag.popNode('sibling');
            assert.equal(bag.getNodeByAttr('match', value, false, deep_first).label, 'deep');
            assert.equal(bag.getNodeByAttr('absent', value, false, deep_first), null);
            assert.equal(bag.getNodeByAttr('match', 'YES', true, deep_first).label, 'deep');
        });
    }
}
test('default order is level first and omitted value finds nested attributes', () => {
    const bag = new Bag(); bag.setItem('branch.deep', 1, {match: 'yes'});
    bag.setItem('sibling', 2, {match: 'yes'});
    assert.equal(bag.getNodeByAttr('match', 'yes').label, 'sibling');
    bag.popNode('sibling');
    assert.equal(bag.getNodeByAttr('match').label, 'deep');
});

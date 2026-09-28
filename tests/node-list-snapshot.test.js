import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';
test('node lists share nodes but not Bag structure', () => {
    const bag = new Bag({a: 1, b: 2}); const nodes = bag.getNodes();
    nodes.pop(); assert.deepEqual(bag.keys(), ['a', 'b']);
    nodes[0].value = 3; assert.equal(bag.getItem('a'), 3);
    bag.setItem('c', 4); assert.equal(nodes.length, 1);
    const filtered = bag.getNodes(node => node.label === 'a');
    assert.equal(filtered[0], nodes[0]);
    filtered.pop(); assert.equal(bag.length, 3);
});

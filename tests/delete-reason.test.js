// Contract: deletions preserve the caller's reason independently of the ancestor path.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

for (const nested of [false, true]) {
    for (const method of ['popNode', 'pop', 'delItem']) {
        test(`${method} preserves the delete origin (nested: ${nested})`, () => {
            const root = new Bag();
            const path = nested ? 'copy.details.price' : 'price';
            const node = root.setItem(path, 42);
            const events = [];
            root.subscribe('observer', {delete: event => events.push(event)});
            const returned = method === 'popNode' ? root.popNode(path, 'binder-123')
                : root[method](path, null, 'binder-123');
            assert.equal(returned, method === 'popNode' ? node : 42);
            assert.equal(root.getNode(path), null);
            assert.equal(node.parentBag, null);
            assert.equal(events.length, 1);
            assert.equal(events[0].node, node);
            assert.equal(events[0].reason, 'binder-123');
            assert.deepEqual(events[0].pathlist, nested ? ['copy', 'details'] : null);
            assert.equal(events[0].ind, 0);
        });
    }
}


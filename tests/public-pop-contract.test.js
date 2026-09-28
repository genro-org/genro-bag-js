import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';
for (const operation of ['popNode', 'pop']) {
    for (const action of ['normal', 'raise', 'reinsert', 'transfer']) {
        test(`${operation}: ${action}`, () => {
            const root = new Bag(); root.setItem('outer.child.leaf', 1); root.setBackref();
            const parent = root.getItem('outer'), node = root.getNode('outer.child');
            const child = node.value, destination = new Bag(); destination.setBackref();
            node.attr.caption = 'Child';
            let calls = 0;
            root.subscribe('watch', {delete: () => {
                calls++; assert.equal(node.parentBag, parent);
                if (action === 'raise') throw Error('subscriber failed');
                if (action === 'reinsert' || action === 'transfer') {
                    const target = action === 'reinsert' ? parent : destination;
                    // No public API inserts an existing node; establish callback ownership.
                    target._nodes._list.push(node); target._nodes._dict[node.label] = node;
                    node.parentBag = target;
                }
            }});
            if (action === 'raise') assert.throws(() => root[operation]('outer.child'), /subscriber failed/);
            else assert.equal(root[operation]('outer.child'), operation === 'popNode' ? node : child);
            assert.equal(calls, 1); assert.equal(node.attr.caption, 'Child');
            if (action === 'normal' || action === 'raise') {
                assert.equal(node.parentBag, null); assert.equal(child.parent, null);
                assert.equal(child.parentNode, null); assert.equal(child.getNode('leaf').parentBag, child);
                let local = 0; child.subscribe('local', {update: () => local++});
                child.setItem('leaf', 2); assert.equal(local, 1); assert.equal(calls, 1);
            } else {
                const target = action === 'reinsert' ? parent : destination;
                assert.equal(node.parentBag, target); assert.equal(target.getNode('child'), node);
                assert.equal(child.parent, target);
            }
        });
    }
}

test('popNode preserves unresolved resolver', async () => {
    const {BagCbResolver} = await import('../src/index.js');
    let calls = 0;
    const resolver = new BagCbResolver({callback: () => {calls++; return 42;}});
    const bag = new Bag(); bag.setItem('lazy', resolver);
    const node = bag.getNode('lazy');
    assert.equal(bag.popNode('lazy'), node);
    assert.equal(node.resolver, resolver); assert.equal(calls, 0);
    assert.equal(node.parentBag, null);
});

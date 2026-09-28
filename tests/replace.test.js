import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag, BagNode, BagCbResolver} from '../src/index.js';

test('node replace preserves location, copies attributes and resolver without resolving', () => {
    const root = new Bag({target: {old: 1}, sibling: 0}); root.setBackref();
    const target = root.getNode('target'); const oldvalue = target.staticValue;
    target.setAttr({obsolete: 1});
    let calls = 0;
    const source = new BagNode(null, 'source', null, null,
        new BagCbResolver({callback: () => {calls++; return 42;}}));
    source.setAttr({nullable: null, color: 'red'}, false, false, false);
    const events = [];
    target.subscribe('test', event => events.push(event));
    assert.equal(target.replace(source), target);
    assert.equal(root.getNode(0), target);
    assert.equal(target.label, 'target');
    assert.deepEqual(target.attr, {nullable: null, color: 'red'});
    assert.equal(oldvalue.parentNode, null);
    assert.notEqual(target.resolver, source.resolver);
    assert.equal(source.resolver._node, source);
    assert.equal(target.resolver._node, target);
    assert.equal(calls, 0);
    assert.equal(events.length, 1);
    assert.equal(events[0].evt, 'upd_value_attr');
    assert.equal(target.getValue(), 42);
    events.length = 0;
    assert.equal(target.replace(target), target);
    assert.equal(events.length, 0);
    const previous = target.resolver;
    target.replace(new BagNode(null, 'other', 9));
    assert.equal(target.resolver, null);
    assert.equal(previous._node, null);
    assert.deepEqual(target.attr, {});
    assert.throws(() => target.replace(new Bag()), TypeError);
});

test('Bag replace preserves nested lazy resolvers and independent structural nodes', () => {
    const source = new Bag({nested: {}});
    let calls = 0;
    source.getItem('nested').setItem('lazy', new BagCbResolver({callback: () => {calls++; return 4;}}));
    source.setBackref();
    const copied = new Bag().replace(source);
    const original = source.getNode('nested.lazy'); const clone = copied.getNode('nested.lazy');
    assert.equal(calls, 0);
    assert.notEqual(clone.resolver, original.resolver);
    assert.equal(original.resolver._node, original);
    assert.equal(clone.resolver._node, clone);
    assert.equal(clone.getValue(), 4);
    copied.getItem('nested').setItem('other', 1);
    assert.equal(source.getNode('nested.other'), null);
    assert.equal(typeof copied.fillFrom, 'undefined');
});

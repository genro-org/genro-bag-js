import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BagNode} from '../src/bag-node.js';
import {BagCbResolver} from '../src/resolver.js';

function counter(options) {
    const calls = [];
    const resolver = new BagCbResolver({callback: kw => calls.push(kw), ...options});
    return {resolver, calls};
}

test('readonly TTL caches internally while static reads preserve the node', t => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    const {resolver, calls} = counter({cacheTime: 10, readOnly: true});
    const node = new BagNode(null, 'value', 'static', null, resolver);
    assert.equal(node.getValue(), 1);
    assert.equal(node.getValue(), 1);
    assert.equal(resolver.cachedValue, 1);
    assert.equal(node.getValue(true), 'static');
    assert.equal(resolver.resolve({static: true}), 'static');
    now += 11000;
    assert.equal(node.getValue(), 2);
    assert.equal(node.staticValue, 'static');
    assert.equal(calls.length, 2);
});

test('readonly zero cache reloads without storing, negative cache stores even null', () => {
    const {resolver} = counter({cacheTime: 0, readOnly: true});
    assert.equal(resolver.resolve(), 1);
    assert.equal(resolver.resolve(), 2);
    assert.equal(resolver.cachedValue, null);
    for (const value of [null, undefined, false, 0]) {
        let calls = 0;
        const cached = new BagCbResolver({callback: () => {calls++; return value;},
            cacheTime: -10, readOnly: true});
        assert.equal(cached.resolve(), value);
        assert.equal(cached.resolve(), value);
        assert.equal(calls, 1);
        cached.reset();
        assert.equal(cached.resolve(), value);
        assert.equal(calls, 2);
    }
});

test('readonly cache invalidates when effective call or node parameters change', () => {
    const {resolver, calls} = counter({cacheTime: -1, readOnly: true});
    const node = new BagNode(null, 'value', 'static', {factor: 2}, resolver);
    assert.equal(node.getValue(), 1);
    assert.equal(node.getValue(), 1);
    node.setAttr({factor: 3});
    assert.equal(node.getValue(), 2);
    assert.equal(resolver.resolve({factor: 4}), 3);
    assert.equal(resolver.resolve({factor: 4}), 3);
    assert.deepEqual(calls.map(kw => kw.factor), [2, 3, 4]);
    assert.equal(node.staticValue, 'static');
});

test('readonly cache survives node attachment changes without writing to nodes', () => {
    const {resolver} = counter({cacheTime: -1, readOnly: true});
    assert.equal(resolver.resolve(), 1);
    const node = new BagNode(null, 'value', 'static', null, resolver);
    assert.equal(node.getValue(), 1);
    resolver.setNode(null);
    assert.equal(resolver.resolve(), 1);
    assert.equal(node.staticValue, 'static');
});

test('writable cache reloads when its storage switches between node and resolver', () => {
    const {resolver} = counter({cacheTime: -1, readOnly: false});
    assert.equal(resolver.resolve(), 1);
    const node = new BagNode(null, 'value', 'static', null, resolver);
    assert.equal(node.getValue(), 2);
    assert.equal(node.staticValue, 2);
    resolver.setNode(null);
    assert.equal(resolver.resolve(), 3);
    assert.equal(resolver.cachedValue, 3);
    assert.equal(node.staticValue, 2);
});

test('async readonly result is cached after completion without changing node', async () => {
    let calls = 0;
    const resolver = new BagCbResolver({callback: async () => ++calls,
        cacheTime: 10, readOnly: true});
    const node = new BagNode(null, 'value', 'static', null, resolver);
    assert.equal(await node.getValue(), 1);
    assert.equal(await node.getValue(), 1);
    assert.equal(calls, 1);
    assert.equal(node.staticValue, 'static');
});

// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Contract tests for the Python/JS alignment agreed on 2026-09-08.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bag, BagCbResolver, BagResolver, BagSerializationError, OpaqueResolver,
    StorageResolver, registerResolver } from '../src/index.js';
import { registerClass, registerType, toTytx, fromTytx } from 'genro-tytx';

class SourceBag extends Bag { static tytxSuffix = 'SOURCE'; }
registerClass(SourceBag);

for (const transport of ['json', 'msgpack']) {
    for (const compact of [false, true]) {
        test(`mixed Bag types and tags survive ${transport}, compact=${compact}`, () => {
            const b = new SourceBag();
            b.setItem('source', new SourceBag());
            b.setItem('source.data', new Bag());
            b.setItem('source.data.value', 42);
            b.setItem('source.empty', new SourceBag());
            b.getNode('source').nodeTag = 'div';
            const result = SourceBag.fromTytx(b.toTytx(transport, compact), transport);
            assert.equal(result.constructor, SourceBag);
            assert.equal(result.getItem('source').constructor, SourceBag);
            assert.equal(result.getItem('source.data').constructor, Bag);
            assert.equal(result.getItem('source.empty').constructor, SourceBag);
            assert.equal(result.getItem('source.data.value'), 42);
            assert.equal(result.getNode('source').nodeTag, 'div');
        });
    }
    test(`Bag instances inside ordinary containers survive ${transport}`, () => {
        const original = { mixed: [new Bag({ x: 1 }), new SourceBag({ y: 2 })] };
        const result = fromTytx(toTytx(original, transport), transport);
        assert.equal(result.mixed[0].constructor, Bag);
        assert.equal(result.mixed[1].constructor, SourceBag);
        assert.equal(result.mixed[1].getItem('y'), 2);
    });
    test(`missing parent references fail in ${transport}`, () => {
        for (const [paths, parent] of [[undefined, 'missing'], [{ '0': 'branch' }, 99], [{}, 0], [undefined, 0]]) {
            const data = { rows: [[parent, 'child', null, 42, {}]] };
            if (paths !== undefined) data.paths = paths;
            assert.throws(() => Bag.fromTytx(toTytx(data, transport === 'json' ? null : transport), transport), BagSerializationError);
        }
        const data = { rows: [['', 'unknown', null, '::UNKNOWNBRANCH', {}], ['unknown', 'child', null, 42, {}]] };
        assert.throws(() => Bag.fromTytx(toTytx(data, transport === 'json' ? null : transport), transport), /parent branch/);
    });
}

test('MessagePack literal scalar markers do not invoke decoders', () => {
    class Scalar {}
    registerType(Scalar, 'AUDITSCALAR', () => '', () => { throw new Error('must not decode'); });
    const b = new Bag({ scalar: '::AUDITSCALAR', date: '::D', raw: '::RAW' });
    const result = Bag.fromTytx(b.toTytx('msgpack'), 'msgpack');
    assert.deepEqual(result.asDict(), b.asDict());
});

test('update carries incoming non-null tags and preserves destination tags otherwise', () => {
    const source = new Bag({ parent: new Bag({ x: 2 }), added: 3 });
    source.getNode('parent.x').nodeTag = 'span';
    source.getNode('parent.x').xmlTag = 'widget';
    source.getNode('added').nodeTag = 'div';
    source.getNode('added').xmlTag = 'section';
    const target = new Bag({ parent: new Bag({ x: 1 }) });
    target.getNode('parent').nodeTag = 'keep';
    target.update(source);
    assert.equal(target.getNode('parent').nodeTag, 'keep');
    assert.equal(target.getNode('parent.x').nodeTag, 'span');
    assert.equal(target.getNode('parent.x').xmlTag, 'widget');
    assert.equal(target.getNode('added').nodeTag, 'div');
    assert.equal(target.getNode('added').xmlTag, 'section');
    target.update({ added: 4 });
    assert.equal(target.getNode('added').nodeTag, 'div');
});

test('JSON round-trip keeps tags on leaves and branches', () => {
    const b = new Bag({ a: new Bag({ b: 1 }), c: null });
    b.getNode('a').nodeTag = 'div'; b.getNode('a.b').nodeTag = 'span';
    for (const typed of [true, false]) {
        const result = Bag.fromJson(b.toJson(typed));
        assert.equal(result.getNode('a').nodeTag, 'div');
        assert.equal(result.getNode('a.b').nodeTag, 'span');
        assert.equal(result.getNode('c').nodeTag, null);
    }
});

test('attribute queries resolve sync/async values and leave static resolvers untouched', async () => {
    let calls = 0;
    const sync = new BagCbResolver({ value: 7, callback: kw => { calls++; return kw.value; } });
    const asyncValue = new BagCbResolver({ callback: async () => { calls++; return 8; } });
    const b = new Bag(); b.setItem('n', 0, { value: 99, a: sync, b: asyncValue });
    assert.equal(b.getItem('n?a'), 7);
    assert.equal(await b.getItem('n?b'), 8);
    assert.deepEqual(await b.getItem('n?a&b'), [7, 8]);
    assert.deepEqual(await b.getItem('n?'), { value: 99, a: 7, b: 8 });
    const before = calls;
    assert.deepEqual(b.getNode('n').getValue(true, ''), { value: 99, a: sync, b: asyncValue });
    assert.equal(calls, before);
    b.setItem('empty', 0);
    assert.deepEqual(b.getItem('empty?'), {});
    const failing = new BagCbResolver({ callback: async () => { throw new Error('attribute failure'); } });
    b.setItem('fail', 0, { failing });
    await assert.rejects(b.getItem('fail?'), /attribute failure/);
});

class NumberResolver extends BagResolver {
    load(kw) { return kw.number; }
}
registerResolver(NumberResolver, {
    module: 'audit', name: 'NumberResolver',
    encode: r => ({ kwargs: { number: r._kw.number } }),
    decode: ({ kwargs }) => new NumberResolver(kwargs),
});
const roundTrips = {
    tytx: b => Bag.fromTytx(b.toTytx()),
    msgpack: b => Bag.fromTytx(b.toTytx('msgpack'), 'msgpack'),
    json: b => Bag.fromJson(b.toJson()),
    plainJson: b => Bag.fromJson(b.toJson(false)),
    xml: b => Bag.fromXml(`<root>${b.toXml()}</root>`),
};
for (const [format, roundTrip] of Object.entries(roundTrips)) {
    test(`resolvers travel inertly in ${format}`, () => {
        let calls = 0;
        class Inert extends BagResolver { load() { calls++; return 42; } }
        registerResolver(Inert, { module: 'audit', name: `Inert${format}`,
            encode: () => ({}), decode: () => new Inert() });
        const b = new Bag();
        b.setItem('n', new Inert(), { other: new NumberResolver({ number: 9 }) });
        const result = roundTrip(b);
        assert.equal(calls, 0);
        assert.ok(result.getNode('n').resolver instanceof Inert);
        assert.equal(result.getItem('n'), 42);
        assert.equal(result.getItem('n?other'), 9);
        assert.equal(calls, 1);
    });
    test(`opaque and signed descriptions survive ${format} byte for byte`, () => {
        const unknown = '::RSLV:{ "resolver_module": "server", "resolver_class": "OnlyServer", "args": [], "kwargs": {} }';
        const signed = '::RSLV:eyJwYXlsb2FkIjoidW5pY29kZSJ9..c2lnbmF0dXJl';
        const b = Bag.fromJson([{ label: 'n', value: null, resolver: unknown, attr: { r: signed } }]);
        const result = roundTrip(b);
        assert.ok(result.getNode('n').resolver instanceof OpaqueResolver);
        assert.equal(result.getNode('n').resolver.payload, unknown);
        assert.equal(result.getNode('n').attr.r.payload, signed);
        assert.throws(() => result.getItem('n'), /opaque/);
    });
    test(`unregistered callbacks fail explicitly in ${format}`, () => {
        const b = new Bag(); b.setItem('n', new BagCbResolver(() => 1));
        assert.throws(() => roundTrip(b), BagSerializationError);
    });
}

test('StorageResolver converts values and defaults in both stores', () => {
    const oldLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const oldSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    try {
        for (const [name, value] of [['localStorage', '42'], ['sessionStorage', '7']]) {
            Object.defineProperty(globalThis, name, { configurable: true, value: { getItem: key => key === 'number' ? value : null } });
        }
        for (const [storageType, expected] of [['local', 42], ['session', 7]]) {
            assert.equal(new StorageResolver({ key: 'number', storageType }).resolve(), String(expected));
            assert.equal(new StorageResolver({ key: 'number', storageType, dtype: 'L' }).resolve(), expected);
            assert.equal(new StorageResolver({ key: 'missing', storageType, dtype: 'L', defaultValue: '15' }).resolve(), 15);
            assert.equal(new StorageResolver({ key: 'missing', storageType, dtype: 'L' }).resolve(), null);
        }
    } finally {
        if (oldLocal) Object.defineProperty(globalThis, 'localStorage', oldLocal); else delete globalThis.localStorage;
        if (oldSession) Object.defineProperty(globalThis, 'sessionStorage', oldSession); else delete globalThis.sessionStorage;
    }
});

test('resolver cached branches never produce orphan rows', () => {
    class CachedTree extends BagResolver { load() { return new Bag({ child: 42 }); } }
    registerResolver(CachedTree, { module: 'audit', name: 'CachedTree',
        encode: () => ({}), decode: () => new CachedTree() });
    const b = new Bag(); b.setItem('tree', new CachedTree());
    assert.equal(b.getItem('tree').getItem('child'), 42);
    for (const transport of ['json', 'msgpack']) {
        for (const compact of [false, true]) {
            const result = Bag.fromTytx(b.toTytx(transport, compact), transport);
            assert.deepEqual(result.keys(), ['tree']);
            assert.ok(result.getNode('tree').resolver instanceof CachedTree);
            assert.equal(result.getItem('tree').getItem('child'), 42);
        }
    }
});

test('StorageResolver rejects invalid numeric strings instead of accepting prefixes', () => {
    for (const [dtype, defaultValue] of [['L', 'oops'], ['L', '12oops'], ['R', '1.5oops']]) {
        assert.throws(() => new StorageResolver({ dtype, defaultValue }).resolve(), TypeError);
    }
    assert.equal(new StorageResolver({ dtype: 'B', defaultValue: 'true' }).resolve(), true);
    assert.equal(new StorageResolver({ dtype: 'R', defaultValue: '1.5' }).resolve(), 1.5);
});

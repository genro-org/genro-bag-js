// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Contract: Bag subclasses travel as "::X" plus a __cls symbolic name, looked
// up in the TYTX subtype dictionary of "X". A branch carries it in the
// attributes of its row, a root at payload level; it is written only when the
// class differs from the inherited one (the parent's class for a branch, Bag
// for a root). The payload alone decides the class of the root.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Bag, BagNode, BagSerializationError } from '../src/index.js';
import { toTytx, fromTytx, getSubtypeDict, setSubtypeDict } from 'genro-tytx';

class SourceNode extends BagNode {}
class Source extends Bag { get nodeClass() { return SourceNode; } }
class Page extends Source {}
class Unregistered extends Bag {}

const roundtrip = (bag, transport = 'json', compact = false, cls = Bag) =>
    cls.fromTytx(bag.toTytx(transport, compact), transport);

let before;
const useSubtypes = () => {
    beforeEach(() => {
        before = getSubtypeDict('X');
        setSubtypeDict('X', { ...before, Source, Page });
    });
    afterEach(() => setSubtypeDict('X', before));
};

test('Bag is registered under its name', () => {
    assert.equal(getSubtypeDict('X').Bag, Bag);
});

describe('plain Bags are unchanged', () => {
    test('no __cls on the wire', () => {
        const bag = new Bag({ a: new Bag({ b: 1 }), c: 2 });
        assert.ok(!bag.toTytx().includes('__cls'));
    });
    test('round trip', () => {
        const result = roundtrip(new Bag({ a: new Bag({ b: 1 }) }));
        assert.equal(result.constructor, Bag);
        assert.equal(result.getItem('a').constructor, Bag);
    });
});

describe('root', () => {
    useSubtypes();
    test('name at payload level', () => {
        assert.equal(fromTytx(new Source().toTytx()).__cls, 'Source');
    });
    for (const caller of [Bag, Source, Page]) {
        test(`payload decides the root class (caller ${caller.name})`, () => {
            assert.equal(roundtrip(new Source({ a: 1 }), 'json', false, caller).constructor, Source);
        });
    }
    for (const caller of [Source, Page]) {
        test(`payload without __cls is a Bag (caller ${caller.name})`, () => {
            assert.equal(caller.fromTytx(new Bag({ a: 1 }).toTytx()).constructor, Bag);
        });
    }
    for (const caller of [Bag, Source]) {
        test(`empty payload is a Bag (caller ${caller.name})`, () => {
            assert.equal(caller.fromTytx('').constructor, Bag);
        });
    }
    test('node class follows the Bag', () => {
        assert.equal(roundtrip(new Source({ a: 1 })).getNode('a').constructor, SourceNode);
    });
});

describe('branches', () => {
    useSubtypes();
    for (const transport of ['json', 'msgpack']) {
        for (const compact of [false, true]) {
            test(`mixed tree (${transport}, compact=${compact})`, () => {
                const tree = new Source();
                tree.setItem('body', new Source(), { k: 1 });
                tree.setItem('body.data', new Bag());
                tree.setItem('body.data.value', 42);
                tree.setItem('body.data.page', new Page());
                tree.setItem('body.data.page.inner', new Page());
                const result = roundtrip(tree, transport, compact);
                assert.equal(result.constructor, Source);
                assert.equal(result.getItem('body').constructor, Source);
                assert.equal(result.getItem('body.data').constructor, Bag);
                assert.equal(result.getItem('body.data.page').constructor, Page);
                assert.equal(result.getItem('body.data.page.inner').constructor, Page);
                assert.equal(result.getItem('body.data.value'), 42);
                assert.deepEqual(result.getNode('body').attr, { k: 1 });
                assert.ok(!('__cls' in result.getNode('body.data').attr));
                assert.equal(result.getItem('body').getNode('data').constructor, SourceNode);
            });
        }
    }
    test('tree without backref', () => {
        const tree = new Source({ data: new Bag({ page: new Page() }) });
        tree.clearBackref();
        const result = roundtrip(tree);
        assert.equal(result.getItem('data').constructor, Bag);
        assert.equal(result.getItem('data.page').constructor, Page);
    });
    test('name written only when the class changes', () => {
        const tree = new Source({ same: new Source(), data: new Bag({ page: new Page() }) });
        const rows = Object.fromEntries(fromTytx(tree.toTytx()).rows.map(row => [row[1], row[4]]));
        assert.ok(!('__cls' in rows.same));
        assert.equal(rows.data.__cls, 'Bag');
        assert.equal(rows.page.__cls, 'Page');
    });
    for (const transport of ['json', 'msgpack']) {
        test(`Bag inside plain values (${transport})`, () => {
            const value = { source: new Source({ a: new Bag() }), list: [new Page(), new Bag()] };
            const result = fromTytx(toTytx(value, transport === 'json' ? null : transport),
                transport === 'json' ? null : transport);
            assert.equal(result.source.constructor, Source);
            assert.equal(result.source.getItem('a').constructor, Bag);
            assert.deepEqual(result.list.map(v => v.constructor), [Page, Bag]);
        });
    }
    test('Bag as attribute value', () => {
        const bag = new Bag();
        bag.setItem('n', 1, { recipe: new Page({ x: 1 }) });
        assert.equal(roundtrip(bag).getNode('n').attr.recipe.constructor, Page);
    });
});

describe('errors', () => {
    useSubtypes();
    test('unregistered subclass cannot be written', () => {
        assert.throws(() => new Unregistered().toTytx(), /Unregistered/);
        assert.throws(() => new Bag({ a: new Unregistered() }).toTytx(), /Unregistered/);
    });
    test('class under two names cannot be written', () => {
        setSubtypeDict('X', { ...getSubtypeDict('X'), Alias: Source });
        assert.throws(() => new Source().toTytx(), /several names/);
    });
    test('unknown branch name', () => {
        const payload = toTytx({ rows: [['', 'a', null, '::X', { __cls: 'Missing' }]] });
        assert.throws(() => Bag.fromTytx(payload), /Missing/);
    });
    test('unknown root name', () => {
        const payload = toTytx({ rows: [], __cls: 'Missing' });
        assert.throws(() => Bag.fromTytx(payload), /Missing/);
    });
    test('user attribute is reserved on write', () => {
        const bag = new Bag();
        bag.setItem('a', 1, { __cls: 'Source' });
        assert.throws(() => bag.toTytx(), BagSerializationError);
        assert.throws(() => bag.toTytx(), /reserved/);
    });
    test('reserved attribute on a leaf row', () => {
        const payload = toTytx({ rows: [['', 'a', null, 1, { __cls: 'Source' }]] });
        assert.throws(() => Bag.fromTytx(payload), /reserved/);
    });
});

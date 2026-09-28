// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BagNode } from '../src/bag-node.js';
import { Bag } from '../src/bag.js';
import { BagCbResolver } from '../src/resolver.js';

describe('BagNode', () => {
    describe('getValue with queryString', () => {
        it('returns null for absent query attributes without losing falsy values', () => {
            const bag = new Bag();
            bag.setItem('store', null, {zero: 0, disabled: false, empty: ''});
            const node = bag.getNode('store');
            for (const isStatic of [false, true]) {
                assert.strictEqual(node.getValue(isStatic, 'missing'), null);
                assert.deepStrictEqual(node.getValue(isStatic, 'missing&zero&disabled&empty'),
                    [null, 0, false, '']);
                assert.strictEqual(bag.getItem('store?totalRowCount', null, isStatic), null);
            }
            assert.deepStrictEqual(node.attr, {zero: 0, disabled: false, empty: ''});
        });

        it('should return value without queryString', () => {
            const node = new BagNode(null, 'test', 42);
            assert.strictEqual(node.getValue(), 42);
        });

        it('should return single attribute with queryString', () => {
            const node = new BagNode(null, 'test', 42, { color: 'red', size: 10 });
            assert.strictEqual(node.getValue(false, 'color'), 'red');
            assert.strictEqual(node.getValue(false, 'size'), 10);
        });

        it('should return multiple attributes with queryString', () => {
            const node = new BagNode(null, 'test', 42, { x: 1, y: 2, z: 3 });
            assert.deepStrictEqual(node.getValue(false, 'x&y'), [1, 2]);
            assert.deepStrictEqual(node.getValue(false, 'x&y&z'), [1, 2, 3]);
        });
    });

    describe('setValue with attributes', () => {
        it('should set value and attributes together', () => {
            const node = new BagNode(null, 'test');
            node.setValue(100, true, { type: 'number' });
            assert.strictEqual(node.value, 100);
            assert.strictEqual(node.getAttr('type'), 'number');
        });

        it('should preserve existing attributes with updattr=true', () => {
            const node = new BagNode(null, 'test', null, { a: 1, b: 2 });
            node.setValue(42, true, { c: 3 }, true);
            assert.deepStrictEqual(node.attr, { a: 1, b: 2, c: 3 });
        });

        it('should replace attributes with updattr=false', () => {
            const node = new BagNode(null, 'test', null, { a: 1, b: 2 });
            node.setValue(42, true, { c: 3 }, false);
            assert.deepStrictEqual(node.attr, { c: 3 });
        });

        it('should replace attributes by default (updattr omitted)', () => {
            // setValue default replaces attributes (Python _updattr=None -> replace),
            // unlike setAttr called directly which merges by default.
            const node = new BagNode(null, 'test', null, { a: 1, b: 2 });
            node.setValue(42, true, { c: 3 });
            assert.deepStrictEqual(node.attr, { c: 3 });
        });
    });

    describe('setAttr', () => {
        it('should set attributes', () => {
            const node = new BagNode(null, 'test');
            node.setAttr({ a: 1, b: 2 });
            assert.deepStrictEqual(node.attr, { a: 1, b: 2 });
        });

        it('should merge attributes by default', () => {
            const node = new BagNode(null, 'test', null, { a: 1 });
            node.setAttr({ b: 2 });
            assert.deepStrictEqual(node.attr, { a: 1, b: 2 });
        });

        it('should replace attributes with updattr=false', () => {
            const node = new BagNode(null, 'test', null, { a: 1 });
            node.setAttr({ b: 2 }, true, false);
            assert.deepStrictEqual(node.attr, { b: 2 });
        });

        it('should remove null attributes by default', () => {
            const node = new BagNode(null, 'test', null, { a: 1, b: 2 });
            node.setAttr({ a: null });
            assert.deepStrictEqual(node.attr, { b: 2 });
        });

        it('should keep null attributes with removeNullAttributes=false', () => {
            const node = new BagNode(null, 'test', null, { a: 1 });
            node.setAttr({ b: null }, true, true, false);
            assert.deepStrictEqual(node.attr, { a: 1, b: null });
        });
    });

    describe('delAttr', () => {
        it('should delete single attribute', () => {
            const node = new BagNode(null, 'test', null, { a: 1, b: 2, c: 3 });
            node.delAttr('b');
            assert.deepStrictEqual(node.attr, { a: 1, c: 3 });
        });

        it('should delete multiple attributes', () => {
            const node = new BagNode(null, 'test', null, { a: 1, b: 2, c: 3 });
            node.delAttr('a', 'c');
            assert.deepStrictEqual(node.attr, { b: 2 });
        });

        it('should handle comma-separated string', () => {
            const node = new BagNode(null, 'test', null, { a: 1, b: 2, c: 3 });
            node.delAttr('a,c');
            assert.deepStrictEqual(node.attr, { b: 2 });
        });

        it('should ignore non-existent attributes', () => {
            const node = new BagNode(null, 'test', null, { a: 1 });
            node.delAttr('x', 'y');
            assert.deepStrictEqual(node.attr, { a: 1 });
        });
    });

    describe('hasAttr', () => {
        it('should return true if attribute exists', () => {
            const node = new BagNode(null, 'test', null, { color: 'red' });
            assert.strictEqual(node.hasAttr('color'), true);
        });

        it('should return false if attribute does not exist', () => {
            const node = new BagNode(null, 'test', null, { color: 'red' });
            assert.strictEqual(node.hasAttr('size'), false);
        });

        it('should check attribute value when provided', () => {
            const node = new BagNode(null, 'test', null, { color: 'red' });
            assert.strictEqual(node.hasAttr('color', 'red'), true);
            assert.strictEqual(node.hasAttr('color', 'blue'), false);
        });
    });

    describe('getInheritedAttributes', () => {
        it('should return own attributes when no parent', () => {
            const node = new BagNode(null, 'test', null, { a: 1, b: 2 });
            assert.deepStrictEqual(node.getInheritedAttributes(), { a: 1, b: 2 });
        });

        // Note: deeper inheritance tests require Bag with backref setup
    });

    describe('position', () => {
        it('should return null when no parent bag', () => {
            const node = new BagNode(null, 'test', 42);
            assert.strictEqual(node.position, null);
        });

        // Note: position with parent bag tested in bag.test.js
    });

    describe('fullpath', () => {
        it('should return null when no parent bag', () => {
            const node = new BagNode(null, 'test', 42);
            assert.strictEqual(node.fullpath, null);
        });

        // Note: fullpath with parent bag tested in bag.test.js
    });

    describe('parentNode', () => {
        it('should return null when no parent bag', () => {
            const node = new BagNode(null, 'test', 42);
            assert.strictEqual(node.parentNode, null);
        });

        // Note: parentNode with parent bag tested in bag.test.js
    });

    describe('attributeOwnerNode', () => {
        it('should return self when attribute exists', () => {
            const node = new BagNode(null, 'test', 42, { color: 'red' });
            assert.strictEqual(node.attributeOwnerNode('color'), node);
        });

        it('should return null when attribute not found and no parent', () => {
            const node = new BagNode(null, 'test', 42, { color: 'red' });
            assert.strictEqual(node.attributeOwnerNode('size'), null);
        });

        it('should check attribute value when provided', () => {
            const node = new BagNode(null, 'test', 42, { color: 'red' });
            assert.strictEqual(node.attributeOwnerNode('color', 'red'), node);
            assert.strictEqual(node.attributeOwnerNode('color', 'blue'), null);
        });
    });

    describe('asTuple', () => {
        it('should return array with label, value, attr, resolver', () => {
            const node = new BagNode(null, 'test', 42, { color: 'red' });
            const tuple = node.asTuple();
            assert.strictEqual(tuple[0], 'test');
            assert.strictEqual(tuple[1], 42);
            assert.deepStrictEqual(tuple[2], { color: 'red' });
            assert.strictEqual(tuple[3], null);
        });
    });

    describe('node subscribe/unsubscribe', () => {
        it('should call subscriber on setValue', () => {
            const node = new BagNode(null, 'test', 10);
            const events = [];
            node.subscribe('test', (e) => events.push(e));

            node.setValue(20);

            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].evt, 'upd_value');
            assert.deepStrictEqual(events[0].info, { oldvalue: 10 });
            assert.strictEqual(events[0].node, node);
        });

        it('should call subscriber on setAttr with attrs_diff', () => {
            const node = new BagNode(null, 'test', 10, { a: 1 });
            const events = [];
            node.subscribe('test', (e) => events.push(e));

            node.setAttr({ b: 2 });

            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].evt, 'upd_attrs');
            // info carries the diff dict, added attr has old=null
            assert.deepStrictEqual(events[0].info, { attrs_diff: { b: { old: null, new: 2 } } });
        });

        it('should call subscriber on combined value+attr with upd_value_attr', () => {
            const node = new BagNode(null, 'test', 10, { a: 1 });
            const events = [];
            node.subscribe('test', (e) => events.push(e));

            // setValue replaces attributes by default, so 'a' is removed and
            // 'b' is added — the diff reports both (matches Python).
            node.setValue(20, true, { b: 2 });

            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].evt, 'upd_value_attr');
            assert.deepStrictEqual(events[0].info, {
                oldvalue: 10,
                attrs_diff: { a: { old: 1, new: null }, b: { old: null, new: 2 } }
            });
        });

        it('should not emit upd_attrs when attribute diff is empty', () => {
            const node = new BagNode(null, 'test', 10, { a: 1 });
            const events = [];
            node.subscribe('test', (e) => events.push(e));

            node.setAttr({ a: 1 }); // same value, no change

            assert.strictEqual(events.length, 0);
        });

        it('should not call subscriber when trigger=false', () => {
            const node = new BagNode(null, 'test', 10);
            const events = [];
            node.subscribe('test', (e) => events.push(e));

            node.setValue(20, false);
            node.setAttr({ a: 1 }, false);

            assert.strictEqual(events.length, 0);
        });

        it('should not call subscriber when value unchanged', () => {
            const node = new BagNode(null, 'test', 10);
            const events = [];
            node.subscribe('test', (e) => events.push(e));

            node.setValue(10); // same value

            assert.strictEqual(events.length, 0);
        });

        it('should unsubscribe correctly', () => {
            const node = new BagNode(null, 'test', 10);
            const events = [];
            node.subscribe('test', (e) => events.push(e));
            node.unsubscribe('test');

            node.setValue(20);

            assert.strictEqual(events.length, 0);
        });
    });

    describe('_buildAttrDiff', () => {
        it('should report added, removed and modified, omitting unchanged', () => {
            const node = new BagNode(null, 'test');
            const diff = node._buildAttrDiff(
                { keep: 1, mod: 'a', gone: 9 },
                { keep: 1, mod: 'b', added: 7 }
            );
            assert.deepStrictEqual(diff, {
                mod: { old: 'a', new: 'b' },
                gone: { old: 9, new: null },
                added: { old: null, new: 7 }
            });
            // unchanged key must be omitted
            assert.ok(!('keep' in diff));
        });

        it('should return empty object when nothing changed', () => {
            const node = new BagNode(null, 'test');
            assert.deepStrictEqual(node._buildAttrDiff({ a: 1 }, { a: 1 }), {});
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('nodeTag and xmlTag', () => {
        it('should default to null', () => {
            const node = new BagNode(null, 'test', 42);
            assert.strictEqual(node.nodeTag, null);
            assert.strictEqual(node.xmlTag, null);
        });

        it('should accept nodeTag in constructor', () => {
            const node = new BagNode(null, 'test', 42, null, null, 'myTag');
            assert.strictEqual(node.nodeTag, 'myTag');
        });

        it('should accept xmlTag in constructor', () => {
            const node = new BagNode(null, 'test', 42, null, null, null, 'div');
            assert.strictEqual(node.xmlTag, 'div');
        });

        it('should accept both nodeTag and xmlTag', () => {
            const node = new BagNode(null, 'test', 42, null, null, 'myTag', 'div');
            assert.strictEqual(node.nodeTag, 'myTag');
            assert.strictEqual(node.xmlTag, 'div');
        });

        it('should allow mutation after construction', () => {
            const node = new BagNode(null, 'test', 42);
            node.nodeTag = 'changed';
            node.xmlTag = 'span';
            assert.strictEqual(node.nodeTag, 'changed');
            assert.strictEqual(node.xmlTag, 'span');
        });
    });

    describe('retired validation surface', () => {
        it('does not provide validation state or validity properties', () => {
            const node = new BagNode(null, 'test', 42);
            assert.equal('isValid' in node, false);
            assert.equal('_invalidReasons' in node, false);
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('compiled', () => {
        it('should be null internally before first access', () => {
            const node = new BagNode(null, 'test', 42);
            assert.strictEqual(node._compiled, null);
        });

        it('should return empty object on first access', () => {
            const node = new BagNode(null, 'test', 42);
            assert.deepStrictEqual(node.compiled, {});
        });

        it('should return same object on subsequent access', () => {
            const node = new BagNode(null, 'test', 42);
            const c1 = node.compiled;
            const c2 = node.compiled;
            assert.strictEqual(c1, c2);
        });

        it('should allow storing data', () => {
            const node = new BagNode(null, 'test', 42);
            node.compiled.widget = 'TextBox';
            assert.strictEqual(node.compiled.widget, 'TextBox');
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('isBranch', () => {
        it('should return false for scalar value', () => {
            const node = new BagNode(null, 'test', 42);
            assert.strictEqual(node.isBranch, false);
        });

        it('should return false for null value', () => {
            const node = new BagNode(null, 'test', null);
            assert.strictEqual(node.isBranch, false);
        });

        it('should return true for Bag value', () => {
            const bag = new Bag();
            const node = new BagNode(null, 'test', bag);
            assert.strictEqual(node.isBranch, true);
        });

        it('should return true for any object with _htraverse method', () => {
            const fakeBag = { _htraverse: () => {} };
            const node = new BagNode(null, 'test', fakeBag);
            assert.strictEqual(node.isBranch, true);
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('resolver in constructor', () => {
        it('should accept resolver as fifth parameter', () => {
            const resolver = new BagCbResolver({ callback: () => 99 });
            const node = new BagNode(null, 'test', null, null, resolver);
            assert.strictEqual(node.resolver, resolver);
            assert.strictEqual(resolver.node, node);
        });

        it('should not set resolver when null', () => {
            const node = new BagNode(null, 'test', 42, null, null);
            assert.strictEqual(node.resolver, null);
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('resetResolver', () => {
        it('should reset resolver and clear value', () => {
            let callCount = 0;
            const resolver = new BagCbResolver({
                callback: () => { callCount++; return 100; }
            });
            const node = new BagNode(null, 'test', null, null, resolver);

            node.getValue();
            assert.strictEqual(node.staticValue, 100);

            node.resetResolver();
            assert.strictEqual(node.staticValue, null);
            assert.strictEqual(node.resolver, resolver);
        });

        it('should reject reset without a resolver and preserve value and attributes', () => {
            const node = new BagNode(null, 'test', 42, {caption: 'Kept'});
            let events = 0;
            node._onChangedValue = () => events++;
            assert.throws(() => node.resetResolver(), /node has no resolver/);
            assert.strictEqual(node.staticValue, 42);
            assert.deepStrictEqual(node.attr, {caption: 'Kept'});
            assert.strictEqual(events, 0);
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('setValue with BagResolver', () => {
        it('should assign resolver when BagResolver passed as value', () => {
            const resolver = new BagCbResolver({ callback: () => 42 });
            const node = new BagNode(null, 'test');
            node.setValue(resolver);
            assert.strictEqual(node.resolver, resolver);
            assert.strictEqual(node.staticValue, null);
        });

        it('should link resolver to node', () => {
            const resolver = new BagCbResolver({ callback: () => 42 });
            const node = new BagNode(null, 'test');
            node.setValue(resolver);
            assert.strictEqual(resolver.node, node);
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('setValue with BagNode', () => {
        it('should extract value and merge attrs from BagNode', () => {
            const source = new BagNode(null, 'source', 99, { color: 'red', size: 10 });
            const target = new BagNode(null, 'target');
            target.setValue(source);
            assert.strictEqual(target.staticValue, 99);
            assert.strictEqual(target.getAttr('color'), 'red');
            assert.strictEqual(target.getAttr('size'), 10);
        });

        it('should merge BagNode attrs with explicit attrs', () => {
            const source = new BagNode(null, 'source', 99, { color: 'red' });
            const target = new BagNode(null, 'target');
            target.setValue(source, true, { extra: 'yes' });
            assert.strictEqual(target.getAttr('color'), 'red');
            assert.strictEqual(target.getAttr('extra'), 'yes');
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('asTuple with resolver', () => {
        it('should trigger resolver via value property', () => {
            const resolver = new BagCbResolver({ callback: () => 77 });
            const node = new BagNode(null, 'test', null, null, resolver);
            const tuple = node.asTuple();
            assert.strictEqual(tuple[0], 'test');
            assert.strictEqual(tuple[1], 77);
            assert.strictEqual(tuple[3], resolver);
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('isEqual with resolver', () => {
        it('should be equal when same resolver', () => {
            const resolver = new BagCbResolver({ callback: () => 42 });
            const a = new BagNode(null, 'x', null, null, resolver);
            const b = new BagNode(null, 'x', null, null, resolver);
            assert.strictEqual(a.isEqual(b), true);
        });

        it('should not be equal when different resolvers', () => {
            const r1 = new BagCbResolver({ callback: () => 42 });
            const r2 = new BagCbResolver({ callback: () => 42 });
            const a = new BagNode(null, 'x', null, null, r1);
            const b = new BagNode(null, 'x', null, null, r2);
            assert.strictEqual(a.isEqual(b), false);
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('diff', () => {
        it('should return null for identical nodes', () => {
            const a = new BagNode(null, 'x', 42, { color: 'red' });
            const b = new BagNode(null, 'x', 42, { color: 'red' });
            assert.strictEqual(a.diff(b), null);
        });

        it('should detect label difference', () => {
            const a = new BagNode(null, 'x', 42);
            const b = new BagNode(null, 'y', 42);
            assert.strictEqual(a.diff(b), 'Other label: y');
        });

        it('should detect attribute difference', () => {
            const a = new BagNode(null, 'x', 42, { color: 'red' });
            const b = new BagNode(null, 'x', 42, { color: 'blue' });
            assert.ok(a.diff(b).startsWith('attributes self:'));
        });

        it('should detect value difference', () => {
            const a = new BagNode(null, 'x', 42);
            const b = new BagNode(null, 'x', 99);
            assert.ok(a.diff(b).startsWith('value self:'));
        });
    });

    // Aligned with Python genro-bag 0.11.0
    describe('toJson', () => {
        it('should return dict with label, value, attr', () => {
            const node = new BagNode(null, 'test', 42, { color: 'red' });
            const result = node.toJson();
            assert.deepStrictEqual(result, {
                label: 'test',
                value: 42,
                attr: { color: 'red' }
            });
        });

        it('should delegate to value.toJson for Bag values', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            const node = new BagNode(null, 'test', bag);
            const result = node.toJson();
            assert.strictEqual(result.label, 'test');
            assert.ok(result.value !== bag); // converted
        });
    });
});

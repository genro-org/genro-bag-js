import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/bag.js';
import {BagCbResolver} from '../src/resolver.js';

test('forEach visits direct nodes in order, forwards kwargs and never resolves', () => {
    const bag = new Bag();
    let loads = 0;
    bag.setItem('child', new Bag({leaf: 1}));
    bag.setItem('remote', new BagCbResolver({callback: () => ++loads}));
    const kwargs = {flag: true};
    const seen = [];
    const result = bag.forEach((node, kw, index) => {
        assert.deepEqual(kw, kwargs);
        seen.push([node.label, index]);
    }, {static: false, kwargs});
    assert.deepEqual(seen, [['child', 0], ['remote', 1]]);
    assert.equal(loads, 0);
    assert.equal(result, null);
});

test('forEach continues after falsey results and stops on truthy results', () => {
    for (const value of [true, 'stop']) {
        const seen = [];
        new Bag({a: 1, b: 2}).forEach(node => {seen.push(node.label); return value;});
        assert.deepEqual(seen, ['a']);
    }
    for (const value of [null, undefined, false, 0, '']) {
        const seen = [];
        new Bag({a: 1, b: 2}).forEach(node => {seen.push(node.label); return value;});
        assert.deepEqual(seen, ['a', 'b']);
    }
    new Bag().forEach(() => assert.fail('empty Bag must not invoke callback'));
});

test('insertion events do not resolve lazy values while establishing back references', () => {
    const bag = new Bag();
    bag.setBackref();
    let loads = 0;
    const resolver = new BagCbResolver({callback: () => { loads++; return new Bag({leaf: 1}); }});
    bag.setItem('remote', resolver);
    assert.equal(loads, 0);
    const child = bag.getItem('remote');
    assert.equal(loads, 1);
    assert.ok(child instanceof Bag);
});


test('getNode attribute paths locate the node without rewriting attributes during autocreation', () => {
    const bag = new Bag();
    const node = bag.setItem('row', 'value', {caption:'Invoice'});
    assert.equal(bag.getNode('row?caption', true, true), node);
    assert.equal(node.attr.caption, 'Invoice');
    assert.equal(node.getValue(), 'value');
    assert.equal(bag.getNode('new?caption', true, true).label, 'new');
});


test('cached resolver Bag results attach to the owning node and preserve ancestor paths', () => {
    const root = new Bag();
    root.setBackref();
    const result = new Bag({entry:'Invoice'});
    root.setItem('menu', new BagCbResolver({callback: () => result}));
    assert.equal(root.getItem('menu'), result);
    assert.equal(result.parentNode, root.getNode('menu'));
    assert.equal(result.parent, root);
    assert.equal(result.getNode('entry').parentBag, result);
    assert.equal(root.getNode('menu.entry'), result.getNode('entry'));
});


test('attribute selectors consistently locate and remove frame slots including typed attributes', () => {
    const bag = new Bag();
    const center = bag.setItem('pane', null, {side:'center'});
    const frame = bag.setItem('frame', null, {_frame:true});
    assert.equal(bag.getNode('#side=center'), center);
    assert.equal(bag.popNode('#side=center'), center);
    assert.equal(bag.getNode('#_frame=true::B'), frame);
    assert.equal(bag.popNode('#_frame=true::B'), frame);
    assert.equal(bag.length, 0);
});


test('getNode accepts array paths used by relation selectors without modifying them', () => {
    const bag = new Bag();
    const node = bag.setItem('record.@customer', null, {caption:'Customer'});
    const path = ['record', '@customer'];
    assert.equal(bag.getNode(path), node);
    assert.deepEqual(path, ['record', '@customer']);
    assert.equal(bag.getNode(['record', 'missing']), null);
    assert.equal(bag.getNode(['record', 'created'], true, true).label, 'created');
});

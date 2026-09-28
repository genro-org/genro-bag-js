import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

// setItem(path, value, attr, nodePosition, updattr, removeNullAttributes, reason, fired)
const fire = (bag, path, value) => bag.setItem(path, value, null, '>', false, true, null, true);

const watch = (bag) => {
    const events = [];
    bag.subscribe('watch', {any: e => events.push(e)});
    return events;
};

test('fired write on an existing node carries fired=true', () => {
    const bag = new Bag(); bag.setItem('evt', null); bag.setBackref();
    const events = watch(bag);
    fire(bag, 'evt', 'click');
    assert.equal(events.length, 1);
    assert.equal(events[0].evt, 'upd_value');
    assert.equal(events[0].fired, true);
    assert.equal(events[0].oldvalue, null);
    assert.equal(bag.getItem('evt'), null);
    fire(bag, 'evt', 'click');
    assert.deepEqual(events.map(e => e.fired), [true, true]);
});

test('fired write on a missing path: the write carries fired=true, autocreate does not', () => {
    const bag = new Bag(); bag.setBackref();
    const events = watch(bag);
    fire(bag, 'a.b.evt', 'click');
    assert.deepEqual(events.map(e => [e.evt, e.node.label, e.reason, e.fired]), [
        ['ins', 'a', 'autocreate', false],
        ['ins', 'b', 'autocreate', false],
        ['ins', 'evt', null, true],
    ]);
    assert.deepEqual(events[2].pathlist, ['a', 'b']);
    assert.equal(bag.getItem('a.b.evt'), null);
});

test('ordinary writes carry fired=false', () => {
    const bag = new Bag(); bag.setBackref();
    const events = watch(bag);
    bag.setItem('x', 1);
    bag.setItem('x', 2);
    bag.setItem('x', 2, {a: 1});
    bag.getNode('x').setAttr({b: 2});
    assert.deepEqual(events.map(e => [e.evt, e.fired]), [
        ['ins', false],
        ['upd_value', false],
        ['upd_attrs', false],
        ['upd_attrs', false],
    ]);
});

test('fired flag propagates to parent Bags', () => {
    const bag = new Bag(); bag.setItem('a.b.evt', null); bag.setBackref();
    const child = bag.getItem('a.b');
    const rootEvents = watch(bag);
    const childEvents = watch(child);
    fire(bag, 'a.b.evt', 'click');
    fire(child, 'new', 'click');
    assert.deepEqual(childEvents.map(e => [e.evt, e.pathlist, e.fired]), [
        ['upd_value', ['evt'], true],
        ['ins', [], true],
    ]);
    assert.deepEqual(rootEvents.map(e => [e.evt, e.pathlist, e.fired]), [
        ['upd_value', ['a', 'b', 'evt'], true],
        ['ins', ['a', 'b'], true],
    ]);
});

test('reset after a fired write stays silent', () => {
    const bag = new Bag(); bag.setItem('evt', null); bag.setBackref();
    const node = bag.getNode('evt');
    const local = [];
    node.subscribe('watch', e => local.push(e));
    const events = watch(bag);
    fire(bag, 'evt', 'click');
    assert.deepEqual(events.map(e => [e.evt, e.oldvalue, e.fired]), [['upd_value', null, true]]);
    assert.deepEqual(local.map(e => e.evt), ['upd_value']);
    assert.equal(node.getValue(), null);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

test('replace replaces contents and supports self assignment', () => {
    const bag = new Bag({old: 1});
    bag.replace(new Bag({fresh: {value: 2}}));
    assert.deepEqual(bag.keys(), ['fresh']);
    assert.equal(bag.replace(bag), bag);
    assert.equal(bag.getItem('fresh.value'), 2);
    bag.replace(new Bag());
    assert.equal(bag.length, 0);
});

test('failed preparation preserves destination and emits no events', () => {
    const root = new Bag(); root.setItem('child.old', 1); root.setBackref();
    const child = root.getItem('child'); const old = child.getNode('old');
    const events = []; root.subscribe('test', {any: event => events.push(event)});
    const source = new Bag({first: 2});
    Object.defineProperty(source.getNode('first'), 'staticValue', {get() {throw new Error('bad source');}});
    assert.throws(() => child.replace(source), /bad source/);
    assert.equal(child.getNode('old'), old);
    assert.equal(old.parentBag, child);
    assert.deepEqual(child.keys(), ['old']);
    assert.equal(events.length, 0);
});

test('attached replace emits one complete update with old content snapshot', () => {
    const root = new Bag(); root.setItem('child.old.leaf', 1); root.setBackref();
    const child = root.getItem('child'); const old = child.getNode('old');
    const events = []; root.subscribe('test', {any: event => {
        events.push(event);
        assert.equal(child.getItem('fresh.leaf'), 2);
    }});
    child.replace(new Bag({fresh: {leaf: 2}}));
    assert.equal(events.length, 1);
    assert.equal(events[0].evt, 'upd_value');
    assert.equal(events[0].oldvalue.getItem('old.leaf'), 1);
    assert.equal(old.parentBag, events[0].oldvalue);
    assert.equal(child.getNode('fresh').parentBag, child);
    assert.equal(child.getItem('fresh').parent, child);
});

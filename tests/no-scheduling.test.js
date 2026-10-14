import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Bag } from '../src/bag.js';
import { BagResolver, BagCbResolver } from '../src/resolver.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

describe('No internal scheduling', () => {
    for (const [option, value] of [['interval', 1], ['interval', null], ['reactive', true], ['reactive', false]]) {
        it(`rejects removed ${option}=${value}`, () => {
            assert.throws(() => new BagCbResolver({ callback: () => 1, [option]: value }), /Removed resolver option/);
        });
    }
    it('rejects obsolete subclass defaults', () => {
        class OldResolver extends BagResolver {
            static classKwargs = { interval: 5 };
        }
        assert.throws(() => new OldResolver(), /Removed resolver option/);
    });
    for (const method of ['subscribe', 'unsubscribe']) {
        for (const option of ['timer', 'interval']) {
            it(`rejects ${method} ${option} without changing subscriptions`, () => {
                const bag = new Bag({ value: 0 });
                const events = [];
                bag.subscribe('watch', { update: event => events.push(event) });
                assert.throws(() => bag[method]('watch', { any: true, [option]: 1 }), /Timer subscriptions were removed/);
                bag.setItem('value', 1);
                assert.equal(events.length, 1);
            });
        }
    }
    it('rejects reset options before invalidating the cache', () => {
        const resolver = new BagCbResolver({ callback: () => 1, cacheTime: 60 });
        assert.equal(resolver.resolve(), 1);
        assert.equal(resolver.expired, false);
        assert.throws(() => resolver.reset({ refresh: true }), TypeError);
        assert.equal(resolver.expired, false);
    });
    for (const asynchronous of [false, true]) {
        it(`loads only on explicit reads (async=${asynchronous})`, async () => {
            const calls = [];
            const load = ({ factor }) => { calls.push(factor); return factor * 2; };
            const resolver = new BagCbResolver({ callback: asynchronous ? async params => load(params) : load,
                factor: 2, cacheTime: 60 });
            const bag = new Bag();
            bag.setItem('value', resolver);
            await tick();
            assert.deepEqual(calls, []);
            const events = [];
            bag.subscribe('watch', { update: event => events.push(event.evt) });
            assert.equal(await bag.getItem('value'), 4);
            assert.deepEqual(events, []);
            bag.setAttr('value', { factor: 3 });
            await tick();
            assert.deepEqual(calls, [2]);
            assert.equal(await bag.getItem('value'), 6);
            resolver._lastUpdate = Date.now() - 61000;
            await tick();
            assert.deepEqual(calls, [2, 3]);
            assert.equal(resolver.expired, true);
            assert.equal(await bag.getItem('value'), 6);
            resolver.reset();
            await tick();
            assert.deepEqual(calls, [2, 3, 3]);
            assert.equal(await bag.getItem('value'), 6);
            bag.popNode('value');
            await tick();
            assert.deepEqual(calls, [2, 3, 3, 3]);
            assert.deepEqual(events, ['upd_attrs']);
        });
    }
    it('lets the application explicitly refresh and publish', () => {
        const resolver = new BagCbResolver({ callback: () => 42, cacheTime: 60 });
        const bag = new Bag({ result: null });
        const events = [];
        bag.subscribe('watch', { update: event => events.push(event.evt) });
        resolver.reset();
        bag.setItem('result', resolver.resolve());
        assert.equal(bag.getItem('result'), 42);
        assert.deepEqual(events, ['upd_value']);
    });
});

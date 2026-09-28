import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag, BagResolver} from '../src/index.js';

for (const duration of [0, -1, 10]) {
    for (const declaration of ['class', 'explicit']) {
        test(`readonly cache ${duration}, ${declaration}: node remains unchanged`, (t) => {
            let now = 100000;
            t.mock.method(Date, 'now', () => now);
            let calls = 0;
            class Getter extends BagResolver {
                static classKwargs = {...BagResolver.classKwargs,
                    ...(declaration === 'class' ? {readOnly: true, cacheTime: duration} : {})};
                load() { return new Bag({count: ++calls}); }
            }
            class Inherited extends Getter {}
            const resolver = new Inherited(declaration === 'explicit'
                ? {readOnly: true, cacheTime: duration} : {});
            const node = new Bag().setItem('result', resolver);
            node.staticValue = 'unchanged';
            assert.equal(resolver.readOnly, true);
            const first = node.value;
            const second = node.value;
            assert.equal(calls, duration === 0 ? 2 : 1);
            assert.equal(first === second, duration !== 0);
            assert.equal(node.staticValue, 'unchanged');
            if (duration !== 0) assert.equal(resolver.cachedValue, first);
            now += 11000;
            node.value;
            assert.equal(calls, duration === -1 ? 1 : duration === 0 ? 3 : 2);
            const before = calls;
            resolver.reset();
            node.value;
            assert.equal(calls, before + 1);
            assert.equal(node.staticValue, 'unchanged');
        });
    }
    for (const defaultValue of [true, false]) {
        test(`readonly constructor overrides ${defaultValue} class default, cache ${duration}`, () => {
            class Getter extends BagResolver {
                static classKwargs = {...BagResolver.classKwargs,
                    readOnly: defaultValue, cacheTime: duration};
                load() { return 42; }
            }
            const resolver = new Getter({readOnly: !defaultValue});
            const node = new Bag().setItem('result', resolver);
            assert.equal(node.value, 42);
            assert.equal(node.staticValue, !defaultValue ? null : 42);
        });
    }
}

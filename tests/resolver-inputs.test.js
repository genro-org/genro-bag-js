// Resolver inputs are the parameters declared at construction (#74).
// Node attributes contribute only for declared keys; any other attribute
// (UI metadata such as '__checked') never reaches load() and never
// invalidates the cache. Aligned with Python genro-bag.

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Bag} from '../src/bag.js';
import {BagCbResolver} from '../src/resolver.js';
import {UrlResolver} from '../src/resolvers/UrlResolver.js';

let server;
let baseUrl;
const requests = [];

before(async () => {
    server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        requests.push(url);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({path: url.pathname, query: Object.fromEntries(url.searchParams)}));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

for (const cacheTime of [-1, 60]) {
    test(`undeclared attributes are not resolver inputs (cacheTime ${cacheTime})`, () => {
        const received = [];
        const bag = new Bag();
        bag.setItem('x', new BagCbResolver({
            callback: kw => received.push(kw), cacheTime, multiplier: 5,
        }));
        assert.equal(bag.getItem('x'), 1);
        bag.setAttr('x', {__checked: true, checked: true});
        assert.equal(bag.getItem('x'), 1);
        assert.deepEqual(received, [{multiplier: 5}]);
    });
}

test('declared attribute changes reach load and invalidate the cache', () => {
    const received = [];
    const bag = new Bag();
    bag.setItem('x', new BagCbResolver({
        callback: kw => received.push(kw.multiplier), cacheTime: -1, multiplier: 5,
    }));
    assert.equal(bag.getItem('x'), 1);
    bag.setAttr('x', {multiplier: 10});
    assert.equal(bag.getItem('x'), 2);
    assert.deepEqual(received, [5, 10]);
});

test('UrlResolver HTTP options are declared parameters', async () => {
    requests.length = 0;
    const bag = new Bag();
    bag.setItem('echo', new UrlResolver(`${baseUrl}/echo`, {qs: {page: 1}, cacheTime: -1}));
    assert.deepEqual((await bag.getItem('echo')).query, {page: '1'});
    bag.setAttr('echo', {checked: true});
    assert.deepEqual((await bag.getItem('echo')).query, {page: '1'});
    assert.equal(requests.length, 1);
    bag.setAttr('echo', {qs: {page: 2}});
    assert.deepEqual((await bag.getItem('echo')).query, {page: '2'});
    assert.equal(requests.length, 2);
});

test('UrlResolver extra constructor kwargs are dynamic query parameters', async () => {
    const bag = new Bag();
    bag.setItem('echo', new UrlResolver(`${baseUrl}/echo`, {foo: null, cacheTime: -1}));
    bag.setAttr('echo', {foo: 'changed', checked: true});
    assert.deepEqual((await bag.getItem('echo')).query, {foo: 'changed'});
});

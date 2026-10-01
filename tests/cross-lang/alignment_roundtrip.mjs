// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Contract bridge: preserve Python types and resolver descriptions through JS.
import assert from 'node:assert/strict';
import { Bag, BagResolver, OpaqueResolver, registerResolver } from '../../src/index.js';
import { registerClass } from '@genrojs/tytx';
class SourceBag extends Bag { static tytxSuffix = 'AUDITSOURCE'; }
registerClass(SourceBag);
class FixedResolver extends BagResolver { load(kw) { return kw.number; } }
registerResolver(FixedResolver, {
    module: 'test_alignment', name: 'FixedResolver',
    encode: r => ({ kwargs: { number: r._kw.number } }),
    decode: ({ args, kwargs }) => new FixedResolver({ number: kwargs.number ?? args[0] }),
});
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const request = JSON.parse(Buffer.concat(chunks).toString());
const { format, compact, signed, scenario } = request;
const input = format === 'msgpack' ? Buffer.from(request.data, 'base64') : request.data;
const cls = scenario === 'tree' ? SourceBag : Bag;
const bag = format === 'xml' ? Bag.fromXml(input)
    : format === 'json' ? Bag.fromJson(input) : cls.fromTytx(input, format === 'msgpack' ? 'msgpack' : 'json');
if (scenario === 'tree') {
    assert.equal(bag.getItem('source').constructor, SourceBag);
    assert.equal(bag.getItem('source.data').constructor, Bag);
    assert.equal(bag.getItem('source.empty').constructor, SourceBag);
    assert.equal(bag.getItem('source.data.value'), 42);
    assert.equal(bag.getNode('source').nodeTag, 'div');
} else if (scenario === 'resolvers') {
    assert.equal(bag.getNode('n').resolver.constructor, signed ? OpaqueResolver : FixedResolver);
    assert.equal(bag.getNode('n').attr.other.constructor, signed ? OpaqueResolver : FixedResolver);
    if (!signed) {
        assert.equal(bag.getItem('n'), 42);
        assert.equal(bag.getItem('n?other'), 7);
    }
} else if (scenario === 'envelope') {
    assert.equal(bag.getItem('event').value.constructor, SourceBag);
    assert.equal(bag.getItem('event').value.getItem('x'), 42);
}
const result = format === 'xml' ? `<GenRoBag>${bag.toXml()}</GenRoBag>`
    : format === 'json' ? bag.toJson() : bag.toTytx(format === 'msgpack' ? 'msgpack' : 'json', compact);
process.stdout.write(JSON.stringify({ data: format === 'msgpack' ? Buffer.from(result).toString('base64') : result }));

import {it} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';
import {DOMParser} from '@xmldom/xmldom';

it('emits indentation directly and leaves compact output unchanged', () => {
    const b = new Bag();
    b.setItem('root.text', '  a & <b>\n  c  ');
    b.setItem('root.branch.n', 12);
    b.setItem('root.empty', new Bag());
    b.setItem('tail', 'end');
    b._prettifyXml = () => assert.fail('Must not reformat serialized XML');
    assert.equal(b.toXml({pretty: true}),
        '<root>\n  <text>  a &amp; &lt;b&gt;\n  c  </text>\n' +
        '  <branch>\n    <n>12</n>\n  </branch>\n  <empty/>\n</root>\n<tail>end</tail>');
    assert.equal(b.toXml(), '<root><text>  a &amp; &lt;b&gt;\n  c  </text>' +
        '<branch><n>12</n></branch><empty/></root><tail>end</tail>');
});

it('preserves scalar text, attributes and namespaces', () => {
    const b = new Bag();
    b.setItem('root', new Bag(), {'xmlns:p': 'urn:test'});
    b.setItem('root.p:child', ' \n<&> ', {title: 'a\tb\nc"d'});
    const parse = xml => new DOMParser().parseFromString(xml, 'text/xml')
        .getElementsByTagNameNS('urn:test', 'child')[0];
    const compact = parse(b.toXml()), pretty = parse(b.toXml({pretty: true}));
    assert.equal(pretty.textContent, ' \n<&> ');
    assert.equal(pretty.getAttribute('title'), compact.getAttribute('title'));
});

it('handles empty Bags, explicit closing tags and headers', () => {
    assert.equal(new Bag().toXml({pretty: true}), '');
    const b = new Bag({a: null, b: new Bag()});
    assert.equal(b.toXml({pretty: true, selfClosedTags: [], docHeader: true}),
        "<?xml version='1.0' encoding='UTF-8'?>\n<a></a>\n<b></b>");
    assert.equal(b.toXml({pretty: true, docHeader: '<!DOCTYPE a>'}),
        '<!DOCTYPE a>\n<a/>\n<b/>');
});

it('keeps xml:space preserve subtrees compact', () => {
    const b = new Bag();
    b.setItem('root.group', new Bag({a: 'x', b: 'y'}), {'xml:space': 'preserve'});
    assert.equal(b.toXml({pretty: true}),
        '<root>\n  <group xml:space="preserve"><a>x</a><b>y</b></group>\n</root>');
});

it('visits each node once without splitting the serialized document', () => {
    const b = new Bag();
    for (let i = 0; i < 1000; i++) b.setItem('n' + i, String(i));
    let count = 0;
    const original = b._nodeToXml;
    b._nodeToXml = function(...args) { count++; return original.apply(this, args); };
    const split = String.prototype.split;
    let xml;
    try {
        String.prototype.split = function(separator, ...args) {
            assert.ok(!String(this).startsWith('<n0>'), 'Must not rescan the serialized document');
            return split.call(this, separator, ...args);
        };
        xml = b.toXml({pretty: true});
    } finally { String.prototype.split = split; }
    assert.equal(count, 1000);
    assert.equal(xml.split('\n').length, 1000);
    assert.ok(xml.endsWith('<n999>999</n999>'));
});

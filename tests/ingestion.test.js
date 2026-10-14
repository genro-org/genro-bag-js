import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bag, BagNode } from '../src/index.js';
import { toTytx, fromTytx, createDecimal } from '@genrojs/tytx';

for (const value of [0, false, '', '{}', new Date(), new Map(), new Bag()]) {
    test(`reject source ${Object.prototype.toString.call(value)} ${String(value)}`, () => {
        assert.throws(() => new Bag(value), TypeError);
        const bag = new Bag({old: 1}); const node = bag.getNode('old');
        assert.throws(() => bag.fillFrom(value), TypeError);
        assert.equal(bag.getNode('old'), node);
    });
}
for (const size of [0, 1, 5, 9, 10, 25, 99, 100, 150]) {
    test(`padded list labels ${size}`, () => {
        const values = Array.from({length: size}, (_, i) => i);
        const bag = new Bag(values);
        const labels = values.map(i => `r_${String(i).padStart(String(size).length + 1, '0')}`);
        assert.deepEqual(bag.keys(), labels);
        assert.deepEqual([...labels].sort(), labels);
        assert.deepEqual(bag.values(), values);
    });
}
test('Gramlot dataSetter record preserves typed leaves at all dictionary depths and in arrays', () => {
    class Custom {}
    const when = new Date('2026-10-03T09:30:00Z'); const amount = createDecimal('12.30');
    const record = {when, amount, person: {name: 'Ada'}, items: [{when, amount}]};
    const bag = new Bag(record);
    assert.equal(bag.getItem('when'), when);
    assert.equal(bag.getItem('amount'), amount);
    assert.equal(bag.getItem('items.r_00.when'), when);
    assert.equal(bag.getItem('items.r_00.amount'), amount);
    assert.equal(bag.getItem('person.name'), 'Ada');
    for (const leaf of [when, amount, new Uint8Array([1,2]), new Custom(), new BagNode(null, 'node', 1), new Bag({kept: [1]}, {recursive:false})]) {
        const data = {outer: [{value: leaf}]}; const result = new Bag(data);
        assert.equal(result.getItem('outer.r_00.value'), leaf);
        data.outer[0].value = 'changed';
        assert.equal(result.getItem('outer.r_00.value'), leaf);
    }
});
test('shallow values stay shared and null clears', () => {
    const data = {dict: {x: 1}, list: [1, 2]}; const bag = new Bag(data, {recursive:false});
    assert.equal(bag.getItem('dict'), data.dict); assert.equal(bag.getItem('list'), data.list);
    assert.equal(new Bag([data], {recursive:false}).getItem('r_00'), data);
    assert.equal(bag.fillFrom(null), bag); assert.equal(bag.length, 0);
});
test('cycles rejected atomically; repeated references converted independently', () => {
    const data = {inner: []}; data.inner.push(data);
    const bag = new Bag({old:1});
    assert.throws(() => bag.fillFrom(data), /Cyclic.*inner/);
    assert.equal(bag.getItem('old'), 1);
    assert.equal(new Bag(data, {recursive:false}).getItem('inner'), data.inner);
    const child = {x:1}; const repeated = new Bag({a:child, b:child});
    assert.notEqual(repeated.getItem('a'), repeated.getItem('b'));
});
for (const transport of ['json', 'msgpack']) for (const compact of [false,true]) {
    test(`literal labels roundtrip ${transport} compact=${compact}`, () => {
        const data = Object.assign(Object.create(null), {'a.b': {c:1}, a: {'b.c':2}, '?attr':3, '#0':4, '':5, constructor:7, 'literal::X': {'leaf::N':9}});
        data.__proto__ = 6;
        const original = new Bag(data);
        const result = Bag.fromTytx(original.toTytx(transport,compact), transport);
        assert.deepEqual(result.keys(), Object.keys(data));
        assert.equal(result._nodes._dict['a.b']._value.getItem('c'),1);
        assert.equal(result.getItem('a')._nodes._dict['b.c']._value,2);
        assert.equal(result._nodes._dict['literal::X']._value._nodes._dict['leaf::N']._value,9);
        for (const label of ['?attr','#0','','__proto__','constructor']) assert.equal(result._nodes._dict[label]._value,data[label]);
    });
}
test('symbol key rejected atomically', () => {
    const bag = new Bag({old:1});
    assert.throws(() => bag.fillFrom({[Symbol('x')]:1}), /strings/);
    assert.deepEqual(bag.keys(), ['old']);
});
for (const recursive of [true,false]) test(`plain JSON and generic TYTX recursive=${recursive}`, () => {
    const data = {rows:[{label:'Ada', value:1, attr:{x:2}}]};
    for (const wire of [JSON.stringify(data),toTytx(data)]) {
        const result = Bag.fromTytx(wire, {recursive});
        assert.deepEqual(result.keys(),['rows']);
        assert.equal(result.getItem('rows') instanceof Bag, recursive);
        if (recursive) assert.equal(result.getItem('rows.r_00.label'),'Ada');
        else assert.deepEqual(result.getItem('rows'),data.rows);
    }
});
for (const transport of ['json','msgpack']) test(`typed generic data and marked Bag ${transport}`, () => {
    const leaf = {date:new Date('2026-10-03T09:30:00Z'), decimal:createDecimal('12.30')};
    const data = {nested:[leaf]};
    const generic = Bag.fromTytx(toTytx(data,transport==='json'?null:transport),transport);
    assert.equal(generic.getItem('nested.r_00.date').getTime(),leaf.date.getTime());
    assert.equal(generic.getItem('nested.r_00.decimal').toString(),leaf.decimal.toString());
    const original = new Bag(data,{recursive:false}); const wire = original.toTytx(transport);
    if (transport==='json') {assert.ok(wire.endsWith('::X'));assert.ok(!wire.endsWith('::X::X'));}
    assert.ok(fromTytx(wire,transport==='json'?null:transport) instanceof Bag);
    for (const recursive of [true,false]) {
        const result = Bag.fromTytx(wire,transport,{recursive});
        assert.ok(Array.isArray(result.getItem('nested')));
        assert.equal(result.getItem('nested')[0].date.getTime(),leaf.date.getTime());
    }
});
for (const wire of ['"text"','42','false','null','','not-json']) test(`reject scalar text ${wire}`,()=>{
    assert.throws(()=>Bag.fromTytx(wire),TypeError);
});
test('deprecated JSON alias follows new contract',()=>{
    assert.equal(Bag.fromJson('{"a":1}').getItem('a'),1);
    assert.throws(()=>Bag.fromJson({a:1}),TypeError);
    assert.equal(Bag.fromJson('[{"label":"Ada","value":1}]').getItem('r_00.label'),'Ada');
});

for (const transport of ['json','msgpack']) test(`marker-like strings stay literal ${transport}`,()=>{
    const values=['::X','::NN','::T','12::N','::RAW','::D'];
    const bag=new Bag({values},{recursive:false});
    bag.setItem('scalar','::X',{marker:'::NN'}); bag.getNode('scalar').nodeTag='kind::X';
    const result=Bag.fromTytx(bag.toTytx(transport),transport);
    assert.deepEqual(result.getItem('values'),values);
    assert.equal(result.getItem('scalar'),'::X');
    assert.equal(result.getNode('scalar').attr.marker,'::NN');
    assert.equal(result.getNode('scalar').nodeTag,'kind::X');
});

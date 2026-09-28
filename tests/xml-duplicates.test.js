import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

test('repeated XML tags preserve order, values, attributes and original tags', () => {
    const bag = Bag.fromXml('<root><item n="1">A</item><item n="2">B</item></root>');
    assert.deepEqual(bag.getNodes().map(n => [n.label, n.value, n.attr.n, n.xmlTag]),
        [['item', 'A', '1', 'item'], ['item_1', 'B', '2', 'item']]);
    const restored = Bag.fromXml(`<root>${bag.toXml()}</root>`);
    assert.deepEqual(restored.getNodes().map(n => n.value), ['A', 'B']);
});

test('generated labels do not overwrite existing suffixed labels', () => {
    const bag = Bag.fromXml('<root><item>A</item><item_1>B</item_1><item>C</item><item_1>D</item_1></root>');
    assert.deepEqual(bag.getNodes().map(n => [n.label, n.value]),
        [['item', 'A'], ['item_1', 'B'], ['item_2', 'C'], ['item_1_1', 'D']]);
});

test('duplicates are handled independently inside each nested Bag', () => {
    const bag = Bag.fromXml('<root><group><item>A</item><item>B</item></group><group><item>C</item><item>D</item></group></root>');
    assert.deepEqual(bag.getNodes().map(n => n.label), ['group', 'group_1']);
    assert.equal(bag.getItem('group.item_1'), 'B');
    assert.equal(bag.getItem('group_1.item_1'), 'D');
});

for (const [attribute, options] of [['_tag', {}], ['name', {tagAttribute: 'name'}]]) {
    test(`duplicate labels selected by ${attribute} preserve original tags`, () => {
        const bag = Bag.fromXml(`<root><a ${attribute}="entry">A</a><b ${attribute}="entry">B</b></root>`, options);
        assert.deepEqual(bag.getNodes().map(n => [n.label, n.value, n.xmlTag]),
            [['entry', 'A', 'a'], ['entry_1', 'B', 'b']]);
    });
}

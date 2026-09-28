// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Bag } from '../src/index.js';

describe('BagQuery - Block 3: Query Methods', () => {
    // -------------------------------------------------------------------------
    // query
    // -------------------------------------------------------------------------
    describe('query', () => {
        it('should return default #k,#v,#a when what is null', () => {
            const bag = new Bag();
            bag.setItem('a', 1, { x: 'y' });

            const result = bag.query();

            assert.equal(result.length, 1);
            assert.deepEqual(result[0], ['a', 1, { x: 'y' }]);
        });

        it('should extract label with #k', () => {
            const bag = new Bag();
            bag.setItem('alpha', 1);
            bag.setItem('beta', 2);

            const result = bag.query('#k');

            assert.deepEqual(result, ['alpha', 'beta']);
        });

        it('should extract value with #v', () => {
            const bag = new Bag();
            bag.setItem('a', 100);
            bag.setItem('b', 200);

            const result = bag.query('#v');

            assert.deepEqual(result, [100, 200]);
        });

        it('should extract all attributes with #a', () => {
            const bag = new Bag();
            bag.setItem('item', 'val', { id: '1', type: 'test' });

            const result = bag.query('#a');

            assert.deepEqual(result, [{ id: '1', type: 'test' }]);
        });

        it('should extract specific attribute with #a.attrname', () => {
            const bag = new Bag();
            bag.setItem('item1', 'v1', { color: 'red' });
            bag.setItem('item2', 'v2', { color: 'blue' });

            const result = bag.query('#a.color');

            assert.deepEqual(result, ['red', 'blue']);
        });

        it('should extract multiple fields as tuples', () => {
            const bag = new Bag();
            bag.setItem('a', 1, { x: 10 });
            bag.setItem('b', 2, { x: 20 });

            const result = bag.query('#k,#v,#a.x');

            assert.deepEqual(result, [
                ['a', 1, 10],
                ['b', 2, 20]
            ]);
        });

        it('should filter with condition', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);
            bag.setItem('c', 3);

            const result = bag.query('#k', n => n.value > 1);

            assert.deepEqual(result, ['b', 'c']);
        });

        it('should limit results', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);
            bag.setItem('c', 3);
            bag.setItem('d', 4);

            const result = bag.query('#k', null, false, false, true, true, 2);

            assert.deepEqual(result, ['a', 'b']);
        });

        it('should return generator with iter=true', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);

            const gen = bag.query('#k', null, true);

            assert.equal(typeof gen.next, 'function');
            assert.equal(gen.next().value, 'a');
            assert.equal(gen.next().value, 'b');
            assert.equal(gen.next().done, true);
        });

        it('should traverse deep with deep=true', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b.c', 2);
            bag.setItem('b.d', 3);

            const result = bag.query('#p', null, false, true);

            assert.deepEqual(result, ['a', 'b', 'b.c', 'b.d']);
        });

        it('should filter leaves only with leaf=true, branch=false', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b.c', 2);
            bag.setItem('b.d', 3);

            const result = bag.query('#p', null, false, true, true, false);

            assert.deepEqual(result, ['a', 'b.c', 'b.d']);
        });

        it('should filter branches only with leaf=false, branch=true', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b.c', 2);
            bag.setItem('b.d', 3);

            const result = bag.query('#p', null, false, true, false, true);

            assert.deepEqual(result, ['b']);
        });

        it('should extract node with #n', () => {
            const bag = new Bag();
            bag.setItem('item', 'value');

            const result = bag.query('#n');

            assert.equal(result.length, 1);
            assert.equal(result[0].label, 'item');
            assert.equal(result[0].value, 'value');
        });

        it('should support callable in what', () => {
            const bag = new Bag();
            bag.setItem('a', 10);
            bag.setItem('b', 20);

            const result = bag.query([n => n.value * 2]);

            assert.deepEqual(result, [20, 40]);
        });

        it('should return null for #v on Bag when deep=true', () => {
            const bag = new Bag();
            bag.setItem('a.b', 1);

            const result = bag.query('#k,#v', null, false, true);

            // 'a' is a Bag, so #v returns null in deep mode
            assert.deepEqual(result[0], ['a', null]);
            assert.deepEqual(result[1], ['b', 1]);
        });

        it('should extract inner value with #v.path', () => {
            const bag = new Bag();
            const inner = new Bag();
            inner.setItem('x', 42);
            bag.setItem('outer', inner);

            const result = bag.query('#v.x');

            assert.deepEqual(result, [42]);
        });

        it('should extract static value with #__v', () => {
            const bag = new Bag();
            bag.setItem('item', 'static_val');

            const result = bag.query('#__v');

            assert.deepEqual(result, ['static_val']);
        });
    });

    // -------------------------------------------------------------------------
    // digest
    // -------------------------------------------------------------------------
    describe('digest', () => {
        it('should return array of tuples (same as query)', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);

            const result = bag.digest('#k,#v');

            assert.deepEqual(result, [['a', 1], ['b', 2]]);
        });

        for (const asColumns of [true, false]) {
            it(`accepts deprecated boolean condition=${asColumns}`, t => {
                const warnings = [];
                const previousWarn = console.warn;
                console.warn = (...args) => warnings.push(args);
                t.after(() => { console.warn = previousWarn; });
                const bag = new Bag({a: 1, b: 2});
                assert.deepEqual(bag.digest('#k,#v', asColumns),
                    bag.digest('#k,#v', null, asColumns));
                assert.equal(warnings.length, 1);
                assert.match(warnings[0][0], /deprecated/i);
                assert.match(warnings[0][0], /digest\(what, null, asColumns\)/);
            });
        }

        it('preserves empty legacy columns', t => {
            const warnings = [];
                const previousWarn = console.warn;
                console.warn = (...args) => warnings.push(args);
                t.after(() => { console.warn = previousWarn; });
            assert.deepEqual(new Bag().digest('#k,#v', true), [[], []]);
            assert.equal(warnings.length, 1);
        });

        it('does not warn for callable filters or the explicit column argument', t => {
            const warnings = [];
                const previousWarn = console.warn;
                console.warn = (...args) => warnings.push(args);
                t.after(() => { console.warn = previousWarn; });
            const bag = new Bag({a: 1, b: 2});
            assert.deepEqual(bag.digest('#k,#v', n => n.value > 1, true), [['b'], [2]]);
            assert.deepEqual(bag.digest('#k,#v', null, true), [['a', 'b'], [1, 2]]);
            assert.equal(warnings.length, 0);
        });

        it('should support condition filter', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);
            bag.setItem('c', 3);

            const result = bag.digest('#k', n => n.value >= 2);

            assert.deepEqual(result, ['b', 'c']);
        });

        it('should return columns with asColumns=true', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);
            bag.setItem('c', 3);

            const result = bag.digest('#k,#v', null, true);

            assert.deepEqual(result, [
                ['a', 'b', 'c'],
                [1, 2, 3]
            ]);
        });

        it('should return empty columns for empty bag with asColumns=true', () => {
            const bag = new Bag();

            const result = bag.digest('#k,#v', null, true);

            assert.deepEqual(result, [[], []]);
        });

        it('should handle single column with asColumns=true', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);

            const result = bag.digest('#k', null, true);

            assert.deepEqual(result, [['a', 'b']]);
        });
    });

    // -------------------------------------------------------------------------
    // columns
    // -------------------------------------------------------------------------
    describe('columns', () => {
        it('should return columns by name', () => {
            const bag = new Bag();
            const inner1 = new Bag();
            inner1.setItem('name', 'Alice');
            inner1.setItem('age', 30);
            bag.setItem('user1', inner1);

            const inner2 = new Bag();
            inner2.setItem('name', 'Bob');
            inner2.setItem('age', 25);
            bag.setItem('user2', inner2);

            // Note: columns uses #v.colname pattern
            const result = bag.columns('name,age');

            assert.deepEqual(result, [
                ['Alice', 'Bob'],
                [30, 25]
            ]);
        });

        it('should accept array of column names', () => {
            const bag = new Bag();
            const inner = new Bag();
            inner.setItem('x', 1);
            inner.setItem('y', 2);
            bag.setItem('item', inner);

            const result = bag.columns(['x', 'y']);

            assert.deepEqual(result, [[1], [2]]);
        });

        it('should prefix with #a. when attrMode=true', () => {
            const bag = new Bag();
            bag.setItem('item1', 'v1', { color: 'red', size: 'L' });
            bag.setItem('item2', 'v2', { color: 'blue', size: 'M' });

            const result = bag.columns('color,size', true);

            assert.deepEqual(result, [
                ['red', 'blue'],
                ['L', 'M']
            ]);
        });
    });
});

describe('BagQuery - Block 2: ForEach Callback Mode', () => {
    describe('forEach path collection', () => {
        it('should yield [path, node] tuples', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);

            const results = [...collectPaths(bag)];

            assert.equal(results.length, 2);
            assert.equal(results[0][0], 'a');
            assert.equal(results[0][1].value, 1);
            assert.equal(results[1][0], 'b');
            assert.equal(results[1][1].value, 2);
        });

        it('should walk nested Bags depth-first', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b.c', 2);
            bag.setItem('b.d', 3);

            const paths = [...collectPaths(bag)].map(([p]) => p);

            assert.deepEqual(paths, ['a', 'b', 'b.c', 'b.d']);
        });
    });

    describe('forEach deep mode', () => {
        it('should call callback for each node', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);
            bag.setItem('c', 3);

            const visited = [];
            bag.forEach((node) => {
                visited.push(node.label);
            }, {deep: true});

            assert.deepEqual(visited, ['a', 'b', 'c']);
        });

        it('should call callback for nested nodes', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b.c', 2);
            bag.setItem('b.d', 3);

            const visited = [];
            bag.forEach((node) => {
                visited.push(node.label);
            }, {deep: true});

            assert.deepEqual(visited, ['a', 'b', 'c', 'd']);
        });

        it('should support early exit when callback returns truthy', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);
            bag.setItem('c', 3);

            const visited = [];
            const result = bag.forEach((node) => {
                visited.push(node.label);
                if (node.label === 'b') {
                    return 'found';
                }
            }, {deep: true});

            assert.equal(result, 'found');
            assert.deepEqual(visited, ['a', 'b']);
        });

        it('should support _pathlist for path tracking', () => {
            const bag = new Bag();
            bag.setItem('a.b.c', 'deep');

            const paths = [];
            bag.forEach((node, kw) => {
                paths.push(kw._pathlist.join('.'));
            }, {deep: true, kwargs: {_pathlist: []}});

            assert.deepEqual(paths, ['a', 'a.b', 'a.b.c']);
        });

        it('should support _indexlist for index tracking', () => {
            const bag = new Bag();
            bag.setItem('x', 1);
            bag.setItem('y', 2);
            const child = new Bag();
            child.setItem('z', 3);
            bag.setItem('w', child);

            const indices = [];
            bag.forEach((node, kw) => {
                indices.push([...kw._indexlist]);
            }, {deep: true, kwargs: {_indexlist: []}});

            assert.deepEqual(indices, [[0], [1], [2], [2, 0]]);
        });

        it('should support both _pathlist and _indexlist together', () => {
            const bag = new Bag();
            bag.setItem('a.b', 'value');

            const results = [];
            bag.forEach((node, kw) => {
                results.push({
                    path: kw._pathlist.join('.'),
                    indices: [...kw._indexlist]
                });
            }, {deep: true, kwargs: {_pathlist: [], _indexlist: []}});

            assert.deepEqual(results, [
                { path: 'a', indices: [0] },
                { path: 'a.b', indices: [0, 0] }
            ]);
        });

        it('should return null when no callback returns truthy', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);

            const result = bag.forEach((node) => {
                // Don't return anything
            }, {deep: true});

            assert.equal(result, null);
        });

        it('should early exit from nested structure', () => {
            const bag = new Bag();
            bag.setItem('a.b.c', 'target');
            bag.setItem('a.b.d', 'after');
            bag.setItem('a.e', 'sibling');

            const visited = [];
            const result = bag.forEach((node) => {
                visited.push(node.label);
                if (node.value === 'target') {
                    return node;
                }
            }, {deep: true});

            assert.equal(result.label, 'c');
            assert.deepEqual(visited, ['a', 'b', 'c']);
        });
    });
});

describe('BagQuery - Block 1: Basic Methods', () => {
    // -------------------------------------------------------------------------
    // getNodes
    // -------------------------------------------------------------------------
    describe('getNodes', () => {
        it('should return all nodes without condition', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);
            bag.setItem('c', 3);

            const nodes = bag.getNodes();

            assert.equal(nodes.length, 3);
            assert.equal(nodes[0].label, 'a');
            assert.equal(nodes[1].label, 'b');
            assert.equal(nodes[2].label, 'c');
        });

        it('should return empty array for empty Bag', () => {
            const bag = new Bag();
            const nodes = bag.getNodes();

            assert.equal(nodes.length, 0);
            assert.deepEqual(nodes, []);
        });

        it('should return a copy, not the original array', () => {
            const bag = new Bag();
            bag.setItem('a', 1);

            const nodes1 = bag.getNodes();
            const nodes2 = bag.getNodes();

            assert.notStrictEqual(nodes1, nodes2);
        });

        it('should filter nodes with condition', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);
            bag.setItem('c', 3);

            const nodes = bag.getNodes(n => n.value > 1);

            assert.equal(nodes.length, 2);
            assert.equal(nodes[0].label, 'b');
            assert.equal(nodes[1].label, 'c');
        });

        it('should filter nodes with condition on label', () => {
            const bag = new Bag();
            bag.setItem('alpha', 1);
            bag.setItem('beta', 2);
            bag.setItem('gamma', 3);

            const nodes = bag.getNodes(n => n.label.startsWith('a') || n.label.startsWith('b'));

            assert.equal(nodes.length, 2);
            assert.equal(nodes[0].label, 'alpha');
            assert.equal(nodes[1].label, 'beta');
        });

        it('should return empty array when no nodes match condition', () => {
            const bag = new Bag();
            bag.setItem('a', 1);
            bag.setItem('b', 2);

            const nodes = bag.getNodes(n => n.value > 100);

            assert.equal(nodes.length, 0);
        });
    });

    // -------------------------------------------------------------------------
    // getNodeByValue
    // -------------------------------------------------------------------------
    describe('getNodeByValue', () => {
        it('should find node by value key', () => {
            const bag = new Bag();
            const child1 = new Bag();
            child1.setItem('id', '123');
            child1.setItem('name', 'Alice');
            bag.setItem('user1', child1);

            const child2 = new Bag();
            child2.setItem('id', '456');
            child2.setItem('name', 'Bob');
            bag.setItem('user2', child2);

            const found = bag.getNodeByValue('id', '456');

            assert.ok(found);
            assert.equal(found.label, 'user2');
        });

        it('should return first matching node', () => {
            const bag = new Bag();
            const child1 = new Bag();
            child1.setItem('type', 'A');
            bag.setItem('item1', child1);

            const child2 = new Bag();
            child2.setItem('type', 'A');
            bag.setItem('item2', child2);

            const found = bag.getNodeByValue('type', 'A');

            assert.ok(found);
            assert.equal(found.label, 'item1');
        });

        it('should return null when not found', () => {
            const bag = new Bag();
            const child = new Bag();
            child.setItem('id', '123');
            bag.setItem('item', child);

            const found = bag.getNodeByValue('id', '999');

            assert.equal(found, null);
        });

        it('should return null for empty Bag', () => {
            const bag = new Bag();
            const found = bag.getNodeByValue('key', 'value');

            assert.equal(found, null);
        });

        it('should skip nodes with non-dict values', () => {
            const bag = new Bag();
            bag.setItem('scalar', 'just a string');

            const child = new Bag();
            child.setItem('id', '123');
            bag.setItem('dict', child);

            const found = bag.getNodeByValue('id', '123');

            assert.ok(found);
            assert.equal(found.label, 'dict');
        });

        it('should not search recursively', () => {
            const bag = new Bag();
            const level1 = new Bag();
            const level2 = new Bag();
            level2.setItem('id', 'deep');
            level1.setItem('nested', level2);
            bag.setItem('outer', level1);

            // getNodeByValue searches only direct children
            const found = bag.getNodeByValue('id', 'deep');

            assert.equal(found, null);
        });
    });

    // -------------------------------------------------------------------------
    // getNodeByAttr
    // -------------------------------------------------------------------------
    describe('getNodeByAttr', () => {
        it('should find node by attribute', () => {
            const bag = new Bag();
            bag.setItem('item1', 'value1', { type: 'A' });
            bag.setItem('item2', 'value2', { type: 'B' });

            const found = bag.getNodeByAttr('type', 'B');

            assert.ok(found);
            assert.equal(found.label, 'item2');
        });

        it('should return first matching node at current level', () => {
            const bag = new Bag();
            bag.setItem('item1', 'value1', { tag: 'x' });
            bag.setItem('item2', 'value2', { tag: 'x' });

            const found = bag.getNodeByAttr('tag', 'x');

            assert.ok(found);
            assert.equal(found.label, 'item1');
        });

        it('should search recursively in sub-Bags', () => {
            const bag = new Bag();
            bag.setItem('top', 'value', { type: 'A' });

            const child = new Bag();
            child.setItem('deep', 'deepvalue', { type: 'B' });
            bag.setItem('nested', child);

            const found = bag.getNodeByAttr('type', 'B');

            assert.ok(found);
            assert.equal(found.label, 'deep');
        });

        it('should prioritize current level over nested', () => {
            const bag = new Bag();
            const child = new Bag();
            child.setItem('inner', 'innervalue', { priority: 'low' });
            bag.setItem('nested', child);

            bag.setItem('outer', 'outervalue', { priority: 'low' });

            const found = bag.getNodeByAttr('priority', 'low');

            // Should find 'outer' first (current level priority)
            assert.ok(found);
            assert.equal(found.label, 'outer');
        });

        it('should return null when not found', () => {
            const bag = new Bag();
            bag.setItem('item', 'value', { type: 'A' });

            const found = bag.getNodeByAttr('type', 'Z');

            assert.equal(found, null);
        });

        it('should return null for empty Bag', () => {
            const bag = new Bag();
            const found = bag.getNodeByAttr('any', 'value');

            assert.equal(found, null);
        });

        it('should find in deeply nested structure', () => {
            const bag = new Bag();

            const level1 = new Bag();
            const level2 = new Bag();
            const level3 = new Bag();
            level3.setItem('target', 'found!', { special: 'yes' });
            level2.setItem('l3', level3);
            level1.setItem('l2', level2);
            bag.setItem('l1', level1);

            const found = bag.getNodeByAttr('special', 'yes');

            assert.ok(found);
            assert.equal(found.label, 'target');
            assert.equal(found.value, 'found!');
        });
    });

    // -------------------------------------------------------------------------
    // isEmpty
    // -------------------------------------------------------------------------
    describe('isEmpty', () => {
        it('should return true for empty Bag', () => {
            const bag = new Bag();

            assert.equal(bag.isEmpty(), true);
        });

        it('should return false for Bag with value', () => {
            const bag = new Bag();
            bag.setItem('item', 'value');

            assert.equal(bag.isEmpty(), false);
        });

        it('should return false for Bag with numeric value', () => {
            const bag = new Bag();
            bag.setItem('item', 42);

            assert.equal(bag.isEmpty(), false);
        });

        it('should return false for Bag with zero (default)', () => {
            const bag = new Bag();
            bag.setItem('item', 0);

            assert.equal(bag.isEmpty(), false);
        });

        it('should return true for Bag with zero when zeroIsNone=true', () => {
            const bag = new Bag();
            bag.setItem('item', 0);

            assert.equal(bag.isEmpty(true, false), true);
        });

        it('should return false for Bag with empty string (default)', () => {
            const bag = new Bag();
            bag.setItem('item', '');

            // Empty string is still a value by default
            // Note: This depends on how setItem handles empty strings
            // In Python, '' is falsy but still a value
            // Let's check actual behavior
            const node = bag.getNode('item');
            assert.equal(node.value, '');
            assert.equal(bag.isEmpty(), false);
        });

        it('should return true for Bag with empty string when blankIsNone=true', () => {
            const bag = new Bag();
            bag.setItem('item', '');

            assert.equal(bag.isEmpty(false, true), true);
        });

        it('should handle mixed values with zeroIsNone', () => {
            const bag = new Bag();
            bag.setItem('item1', 0);
            bag.setItem('item2', 0);

            assert.equal(bag.isEmpty(true, false), true);
        });

        it('should return false if any node has non-empty value', () => {
            const bag = new Bag();
            bag.setItem('item1', 0);
            bag.setItem('item2', 'real value');

            assert.equal(bag.isEmpty(true, false), false);
        });

        it('should treat null as empty', () => {
            const bag = new Bag();
            bag.setItem('item', null);

            assert.equal(bag.isEmpty(), true);
        });

        it('should handle multiple null nodes', () => {
            const bag = new Bag();
            bag.setItem('item1', null);
            bag.setItem('item2', null);

            assert.equal(bag.isEmpty(), true);
        });

        it('should combine zeroIsNone and blankIsNone', () => {
            const bag = new Bag();
            bag.setItem('item1', 0);
            bag.setItem('item2', '');
            bag.setItem('item3', null);

            assert.equal(bag.isEmpty(true, true), true);
        });

        it('should return false when combining options but having real value', () => {
            const bag = new Bag();
            bag.setItem('item1', 0);
            bag.setItem('item2', '');
            bag.setItem('item3', 'real');

            assert.equal(bag.isEmpty(true, true), false);
        });
    });
});

// =============================================================================
// Block 4: sum and sort
// =============================================================================

describe('BagQuery - Block 4: sum and sort', () => {
    // -------------------------------------------------------------------------
    // sum
    // -------------------------------------------------------------------------
    describe('sum', () => {
        it('should sum all values by default', () => {
            const bag = new Bag();
            bag.setItem('a', 10);
            bag.setItem('b', 20);
            bag.setItem('c', 30);

            assert.equal(bag.sum(), 60);
        });

        it('should sum values with explicit #v', () => {
            const bag = new Bag();
            bag.setItem('x', 5);
            bag.setItem('y', 15);

            assert.equal(bag.sum('#v'), 20);
        });

        it('should sum attribute values', () => {
            const bag = new Bag();
            bag.setItem('item1', 'val1', { price: 100 });
            bag.setItem('item2', 'val2', { price: 200 });
            bag.setItem('item3', 'val3', { price: 50 });

            assert.equal(bag.sum('#a.price'), 350);
        });

        it('should handle null values as 0', () => {
            const bag = new Bag();
            bag.setItem('a', 10);
            bag.setItem('b', null);
            bag.setItem('c', 20);

            assert.equal(bag.sum(), 30);
        });

        it('should handle missing attributes as 0', () => {
            const bag = new Bag();
            bag.setItem('item1', 'val1', { price: 100 });
            bag.setItem('item2', 'val2');  // no price attribute
            bag.setItem('item3', 'val3', { price: 50 });

            assert.equal(bag.sum('#a.price'), 150);
        });

        it('should support condition filter', () => {
            const bag = new Bag();
            bag.setItem('a', 10, { active: true });
            bag.setItem('b', 20, { active: false });
            bag.setItem('c', 30, { active: true });

            const result = bag.sum('#v', false, n => n.getAttr('active'));

            assert.equal(result, 40);
        });

        it('should return array for multiple what specs', () => {
            const bag = new Bag();
            bag.setItem('item1', 10, { qty: 2 });
            bag.setItem('item2', 20, { qty: 3 });
            bag.setItem('item3', 30, { qty: 5 });

            const result = bag.sum('#v,#a.qty');

            assert.deepEqual(result, [60, 10]);
        });

        it('should sum only current-level attributes', () => {
            const bag = new Bag();
            bag.setItem('group.item', 1, {qty: 10});
            bag.setItem('top', 2, {qty: 5});
            assert.equal(bag.sum('#a.qty'), 5);
            assert.throws(() => bag.sum('#a.qty', null, true), /deep is no longer supported/);
        });

        it('should return 0 for empty bag', () => {
            const bag = new Bag();

            assert.equal(bag.sum(), 0);
        });

        it('should handle non-numeric values', () => {
            const bag = new Bag();
            bag.setItem('a', 10);
            bag.setItem('b', 'text');  // non-numeric
            bag.setItem('c', 20);

            assert.equal(bag.sum(), 30);
            assert.throws(() => bag.sum('#v', true), /non-numeric/);
        });
    });

    // -------------------------------------------------------------------------
    // sort
    // -------------------------------------------------------------------------
    describe('sort', () => {
        it('should sort by label ascending by default', () => {
            const bag = new Bag();
            bag.setItem('charlie', 3);
            bag.setItem('alpha', 1);
            bag.setItem('bravo', 2);

            bag.sort();

            const labels = bag.query('#k');
            assert.deepEqual(labels, ['alpha', 'bravo', 'charlie']);
        });

        it('should sort by label with explicit #k', () => {
            const bag = new Bag();
            bag.setItem('z', 1);
            bag.setItem('a', 2);
            bag.setItem('m', 3);

            bag.sort('#k');

            const labels = bag.query('#k');
            assert.deepEqual(labels, ['a', 'm', 'z']);
        });

        it('should sort by label descending', () => {
            const bag = new Bag();
            bag.setItem('alpha', 1);
            bag.setItem('bravo', 2);
            bag.setItem('charlie', 3);

            bag.sort('#k:d');

            const labels = bag.query('#k');
            assert.deepEqual(labels, ['charlie', 'bravo', 'alpha']);
        });

        it('should sort by value ascending', () => {
            const bag = new Bag();
            bag.setItem('a', 30);
            bag.setItem('b', 10);
            bag.setItem('c', 20);

            bag.sort('#v');

            const values = bag.query('#v');
            assert.deepEqual(values, [10, 20, 30]);
        });

        it('should sort by value descending', () => {
            const bag = new Bag();
            bag.setItem('a', 10);
            bag.setItem('b', 30);
            bag.setItem('c', 20);

            bag.sort('#v:d');

            const values = bag.query('#v');
            assert.deepEqual(values, [30, 20, 10]);
        });

        it('should sort case-insensitive by default', () => {
            const bag = new Bag();
            bag.setItem('Bravo', 2);
            bag.setItem('alpha', 1);
            bag.setItem('Charlie', 3);

            bag.sort('#k:a');

            const labels = bag.query('#k');
            assert.deepEqual(labels, ['alpha', 'Bravo', 'Charlie']);
        });

        it('should sort case-sensitive with A mode', () => {
            const bag = new Bag();
            bag.setItem('Bravo', 2);
            bag.setItem('alpha', 1);
            bag.setItem('Charlie', 3);

            bag.sort('#k:A');

            const labels = bag.query('#k');
            // Case-sensitive: uppercase sorts before lowercase in ASCII
            assert.deepEqual(labels, ['Bravo', 'Charlie', 'alpha']);
        });

        it('should sort by attribute', () => {
            const bag = new Bag();
            bag.setItem('item1', 'val1', { priority: 3 });
            bag.setItem('item2', 'val2', { priority: 1 });
            bag.setItem('item3', 'val3', { priority: 2 });

            bag.sort('#a.priority');

            const labels = bag.query('#k');
            assert.deepEqual(labels, ['item2', 'item3', 'item1']);
        });

        it('should sort by attribute descending', () => {
            const bag = new Bag();
            bag.setItem('a', 'x', { score: 100 });
            bag.setItem('b', 'y', { score: 300 });
            bag.setItem('c', 'z', { score: 200 });

            bag.sort('#a.score:d');

            const labels = bag.query('#k');
            assert.deepEqual(labels, ['b', 'c', 'a']);
        });

        it('should handle null values by sorting them first ascending', () => {
            const bag = new Bag();
            bag.setItem('a', null);
            bag.setItem('b', 10);
            bag.setItem('c', 5);

            bag.sort('#v');

            const values = bag.query('#v');
            assert.deepEqual(values, [null, 5, 10]);
        });

        it('should handle missing attributes by sorting them first ascending', () => {
            const bag = new Bag();
            bag.setItem('a', 'x', { score: 50 });
            bag.setItem('b', 'y');  // no score
            bag.setItem('c', 'z', { score: 30 });

            bag.sort('#a.score');

            const labels = bag.query('#k');
            assert.deepEqual(labels, ['b', 'c', 'a']);
        });

        it('should support multi-level sort', () => {
            const bag = new Bag();
            bag.setItem('a', 10, { type: 'B' });
            bag.setItem('b', 20, { type: 'A' });
            bag.setItem('c', 10, { type: 'A' });
            bag.setItem('d', 20, { type: 'B' });

            // First sort by value, then by type
            bag.sort('#v:a,#a.type:a');

            const result = bag.query('#k,#v,#a.type');
            // First by value (10, 10, 20, 20), then by type within same value
            assert.deepEqual(result, [
                ['c', 10, 'A'],
                ['a', 10, 'B'],
                ['b', 20, 'A'],
                ['d', 20, 'B']
            ]);
        });

        it('should support custom key function', () => {
            const bag = new Bag();
            bag.setItem('a', 'short');
            bag.setItem('b', 'verylongstring');
            bag.setItem('c', 'medium');

            bag.sort(n => n.value.length);

            const labels = bag.query('#k');
            assert.deepEqual(labels, ['a', 'c', 'b']);
        });

        it('should return self for chaining', () => {
            const bag = new Bag();
            bag.setItem('b', 2);
            bag.setItem('a', 1);

            const result = bag.sort();

            assert.strictEqual(result, bag);
        });

        it('should sort by field in value', () => {
            const bag = new Bag();
            bag.setItem('item1', { name: 'Charlie', age: 30 });
            bag.setItem('item2', { name: 'Alice', age: 25 });
            bag.setItem('item3', { name: 'Bob', age: 35 });

            bag.sort('name');

            const names = bag.query('#v').map(v => v.name);
            assert.deepEqual(names, ['Alice', 'Bob', 'Charlie']);
        });

        it('should sort empty bag without error', () => {
            const bag = new Bag();

            bag.sort();

            assert.equal(bag.length, 0);
        });

        it('should handle single item bag', () => {
            const bag = new Bag();
            bag.setItem('only', 42);

            bag.sort();

            assert.deepEqual(bag.query('#k'), ['only']);
        });
    });
});

function collectPaths(bag) {
    const result = [];
    bag.forEach((node, kw) => { result.push([kw._pathlist.join("."), node]); },
        {deep: true, kwargs: {_pathlist: []}});
    return result;
}

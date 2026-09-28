import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

function subtree() {
    const children = new Bag();
    const span = children.setItem('span', 'text');
    const incoming = new Bag();
    const div = incoming.setItem('div', children);
    return {incoming, children, div, span};
}

function observe(root) {
    const events = [];
    root.subscribe('root-observer', {any: event => events.push({
        ...event, fullpath: event.node.fullpath, parentBag: event.node.parentBag
    })});
    return events;
}

function assertAttached(root, main, tree) {
    const {incoming, children, div, span} = tree;
    assert.equal(main.parentBag, root);
    assert.equal(incoming.backref, true);
    assert.equal(incoming.parent, root);
    assert.equal(incoming.parentNode, main);
    assert.equal(incoming.fullpath, 'main');
    assert.equal(div.parentBag, incoming);
    assert.equal(div.fullpath, 'main.div');
    assert.equal(children.backref, true);
    assert.equal(children.parent, incoming);
    assert.equal(children.parentNode, div);
    assert.equal(children.fullpath, 'main.div');
    assert.equal(span.parentBag, children);
    assert.equal(span.parentNode, div);
    assert.equal(span.fullpath, 'main.div.span');
}

function assertEvent(events, evt, node, pathlist, fullpath, parentBag) {
    assert.equal(events.length, 1, 'one root notification per operation');
    assert.equal(events[0].evt, evt);
    assert.equal(events[0].node, node);
    assert.deepEqual(events[0].pathlist, pathlist);
    assert.equal(events[0].fullpath, fullpath);
    assert.equal(events[0].parentBag, parentBag);
}

for (const prepared of [false, true]) {
    test(`prebuilt subtree propagates deep events (already enabled: ${prepared})`, () => {
        const root = new Bag();
        root.setBackref();
        const events = observe(root);
        const tree = subtree();
        if (prepared) tree.incoming.setBackref();
        const main = root.setItem('main', tree.incoming);
        assertAttached(root, main, tree);
        assertEvent(events, 'ins', main, [], 'main', root);
        events.length = 0;
        // Re-enabling or assigning the identical Bag does not duplicate subscriptions.
        root.setBackref();
        tree.incoming.setBackref(main, root);
        main.setValue(tree.incoming);
        assert.equal(events.length, 0);
        const added = tree.children.setItem('em', 'more');
        assertEvent(events, 'ins', added, ['main', 'div'], 'main.div.em', tree.children);
        events.length = 0;
        tree.span.setAttr({title: 'new'});
        assertEvent(events, 'upd_attrs', tree.span, ['main', 'div', 'span'], 'main.div.span', tree.children);
        assert.deepEqual(events[0].attrs_diff, {title: {old: null, new: 'new'}});
        events.length = 0;
        tree.span.setValue('changed');
        assertEvent(events, 'upd_value', tree.span, ['main', 'div', 'span'], 'main.div.span', tree.children);
        assert.equal(events[0].oldvalue, 'text');
        events.length = 0;
        tree.children.popNode('em');
        assertEvent(events, 'del', added, ['main', 'div'], 'main.div.em', tree.children);
        assert.equal(added.parentBag, null);
        assert.equal(added.fullpath, null);
    });
}

for (const replace of ['setValue', 'setItem']) {
    test(`replacement attaches a prebuilt subtree through ${replace}`, () => {
        const root = new Bag(); root.setBackref();
        const old = subtree();
        const main = root.setItem('main', old.incoming);
        const events = observe(root);
        const incoming = subtree();
        if (replace === 'setValue') main.setValue(incoming.incoming);
        else root.setItem('main', incoming.incoming);
        assertAttached(root, main, incoming);
        assertEvent(events, 'upd_value', main, ['main'], 'main', root);
        assert.equal(events[0].oldvalue, old.incoming);
        assert.equal(old.incoming.parent, null);
        assert.equal(old.incoming.parentNode, null);
        events.length = 0;
        old.span.setAttr({title: 'detached'});
        old.children.setItem('em', 'detached');
        old.children.popNode('span');
        assert.equal(events.length, 0, 'detached subtree must not notify the former root');
        incoming.span.setAttr({title: 'attached'});
        assertEvent(events, 'upd_attrs', incoming.span, ['main', 'div', 'span'], 'main.div.span', incoming.children);
        events.length = 0;
        const nested = subtree();
        const article = incoming.children.setItem('article', nested.incoming);
        assertEvent(events, 'ins', article, ['main', 'div'], 'main.div.article', incoming.children);
        events.length = 0;
        nested.span.setValue('deep');
        assertEvent(events, 'upd_value', nested.span,
            ['main', 'div', 'article', 'div', 'span'], 'main.div.article.div.span', nested.children);
        events.length = 0;
        incoming.children.popNode('article');
        assertEvent(events, 'del', article, ['main', 'div'], 'main.div.article', incoming.children);
        events.length = 0;
        nested.span.setAttr({title: 'removed subtree'});
        assert.equal(events.length, 0);
    });
}

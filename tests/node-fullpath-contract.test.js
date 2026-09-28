import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

test('connected, detached and reattached node paths', () => {
    const root = new Bag(); root.setItem('cliente.nome', 'Mario'); root.setBackref();
    const node = root.getNode('cliente'), child = node.value;
    assert.equal(node.fullpath, 'cliente');
    assert.equal(child.getNode('nome').fullpath, 'cliente.nome');
    assert.equal(root.fullpath, null);
    root.popNode('cliente');
    assert.equal(node.fullpath, null);
    assert.equal(child.getNode('nome').fullpath, 'nome');
    root.setItem('altro', child);
    assert.equal(root.getNode('altro').fullpath, 'altro');
    assert.equal(child.getNode('nome').fullpath, 'altro.nome');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bag} from '../src/index.js';

for (const criterion of ['#v', '#a.score', 'score']) {
    for (const mode of ['a', 'A', 'd', 'D']) {
        test(`null placement for ${criterion}:${mode}`, () => {
            const bag = new Bag();
            for (const [label, value] of [['n1', null], ['high', 10], ['n2', null], ['zero', 0]]) {
                if (criterion === '#v') bag.setItem(label, value);
                else if (criterion === '#a.score') bag.setItem(label, 'row', {score: value});
                else bag.setItem(`${label}.score`, value);
            }
            bag.sort(`${criterion}:${mode}`);
            assert.deepEqual(bag.getNodes().map(n => n.label), mode.toLowerCase() === 'a' ?
                ['n1', 'n2', 'zero', 'high'] : ['high', 'zero', 'n1', 'n2']);
        });
    }
}

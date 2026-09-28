import test from 'node:test';
import assert from 'node:assert/strict';
import { Bag, BagCbResolver } from '../src/index.js';
import { createDecimal } from 'genro-tytx';
import { htmlRepr } from 'genro-bag-js/devtools';

test('escapes labels, scalar values, attributes, tags and class option', () => {
  const bag = new Bag();
  bag.setItem('<label>', '<img src=x onerror=alert(1)> & "quoted"',
    { '<key>': "'value' & <bad>" }, '>', false, true, null, false, true, null, '<tag>');
  const html = htmlRepr(bag, { className: 'extra" onclick="bad' });
  assert.doesNotMatch(html, /<img|<label>|<bad>|<tag>|onclick="bad/);
  assert.match(html, /&lt;label&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;key&gt;/);
  assert.match(html, /&#39;value&#39; &amp; &lt;bad&gt;/);
});

test('describes a resolver without executing it', () => {
  let executions = 0;
  const resolver = new BagCbResolver(() => { executions += 1; return 'secret'; });
  const bag = new Bag();
  bag.setItem('lazy', resolver);
  const html = htmlRepr(bag);
  assert.equal(executions, 0);
  assert.match(html, />null<\/code><span class="bag-meta">/);
  assert.match(html, />BagCbResolver<\/summary>/);
  assert.match(html, /resolver was not evaluated/);
  assert.equal(executions, 0);
});

test('renders cycles and shared bags without mutation', () => {
  const root = new Bag();
  const child = new Bag();
  child.setItem('self', child);
  root.setItem('first', child);
  root.setItem('second', child);
  const before = {
    rootLength: root.length,
    childLength: child.length,
    first: root.getNode('first').staticValue,
    second: root.getNode('second').staticValue,
    self: child.getNode('self').staticValue,
    backref: child.backref
  };
  const html = htmlRepr(root, { openDepth: 10 });
  assert.equal((html.match(/circular reference/g) || []).length, 2);
  assert.deepEqual({
    rootLength: root.length,
    childLength: child.length,
    first: root.getNode('first').staticValue,
    second: root.getNode('second').staticValue,
    self: child.getNode('self').staticValue,
    backref: child.backref
  }, before);
});

test('renders nested, empty and typed scalar values', () => {
  const nested = new Bag();
  nested.setItem('empty', new Bag());
  nested.setItem('nullish', null);
  nested.setItem('truth', true);
  nested.setItem('number', 12.5);
  const html = htmlRepr(nested, { openDepth: 2 });
  assert.match(html, /<details class="bag-toggle" open>/);
  assert.match(html, /Empty Bag/);
  assert.match(html, />NN</);
  assert.match(html, />null<\/code>/);
  assert.match(html, />B</);
  assert.match(html, />R</);
});

test('uses TYTX dtype badges and TYTX representations', () => {
  const bag = new Bag();
  bag.setItem('integer', 12);
  bag.setItem('float', 12.5);
  bag.setItem('decimal', createDecimal('12.50'));
  bag.setItem('date', new Date('2024-03-04T00:00:00Z'));
  bag.setItem('json', {answer:42});
  const html = htmlRepr(bag);
  assert.match(html, />L<\/span><span class="bag-label">integer<\/span><code class="bag-value">12/);
  assert.match(html, />R<\/span><span class="bag-label">float<\/span><code class="bag-value">12.5/);
  assert.match(html, />N<\/span><span class="bag-label">decimal<\/span><code class="bag-value">12.5/);
  assert.match(html, />D<\/span><span class="bag-label">date<\/span><code class="bag-value">2024-03-04/);
  assert.doesNotMatch(html, /12.5::N|2024-03-04::D/);
  assert.match(html, />JS<\/span><span class="bag-label">json<\/span><code class="bag-value">{&quot;answer&quot;:42}/);
});

test('starts collapsed and can omit dtype badges for customer views', () => {
  const bag = new Bag();
  bag.setItem('amount', 12, {currency:'EUR'});
  const html = htmlRepr(bag, {showTypes:false, title:'Customer'});
  assert.doesNotMatch(html, /class="type-badge"/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|>)/);
  assert.match(html, /Customer/);
  assert.match(html, /currency/);
  assert.match(htmlRepr(bag), /class="type-badge"/);
});

test('shows the supplied callback name without executing the function', () => {
  let calls = 0;
  function loadInvoiceTotal() { calls++; return 99; }
  const resolver = new BagCbResolver({callback:loadInvoiceTotal});
  const bag = new Bag();
  bag.setItem('total', resolver);
  const html = htmlRepr(bag, {resolverParameters:() => ({callback:loadInvoiceTotal})});
  assert.match(html, /loadInvoiceTotal\(\)/);
  assert.equal(calls, 0);
});

// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import { toTytx } from 'genro-tytx';

const TYPE_NAMES = {T:'Text',L:'Integer',R:'Float',N:'Decimal',B:'Boolean',D:'Date',H:'Time',HZ:'Time with timezone',DH:'Datetime',DHZ:'Datetime with timezone',NN:'Null',RAW:'Bytes',JS:'JSON',X:'Bag'};

/** Return an inert HTML fragment for a Bag without resolving or mutating it. */
export function htmlRepr(bag, options = {}) {
  const {openDepth = 0, className = '', openAttributes = false, showTypes = true, title = 'Bag'} = options;
  const ancestors = new Set();
  const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const isBag = value => value !== null && typeof value === 'object' && typeof value.getNodes === 'function';

  function tytxInfo(value) {
    let dtype, text;
    try {
      const encoded = toTytx(value);
      if (typeof value === 'string') { dtype = 'T'; text = value; }
      else if (value == null) { dtype = 'NN'; text = String(value); }
      else if (typeof value === 'boolean') { dtype = 'B'; text = encoded; }
      else if (typeof value === 'number') { dtype = Number.isInteger(value) ? 'L' : 'R'; text = String(value); }
      else {
        const suffix = typeof encoded === 'string' && encoded.match(/::([A-Z][A-Z0-9]*)$/);
        dtype = suffix ? suffix[1] : 'JS';
        text = suffix ? encoded.slice(0, -suffix[0].length) : encoded;
      }
    } catch { dtype = 'JS'; text = '[unserializable value]'; }
    return {dtype, text:String(text), name:TYPE_NAMES[dtype] || 'TYTX value'};
  }
  function badge(dtype, name) {
    if (!showTypes) return '';
    const title = `${dtype} — ${name}`;
    return `<span class="type-badge" data-dtype="${escape(dtype)}" title="${escape(title)}" aria-label="${escape(title)}">${escape(dtype)}</span>`;
  }
  function attributes(attrs) {
    const entries = Object.entries(attrs || {});
    if (!entries.length) return '';
    const rows = entries.map(([key,value]) => {
      const info = tytxInfo(value);
      return `<div class="bag-attr"><dt>${badge(info.dtype,info.name)}<span>${escape(key)}</span></dt><dd><code>${escape(info.text)}</code></dd></div>`;
    }).join('');
    return `<details class="bag-attributes"${openAttributes ? ' open' : ''}><summary aria-label="${entries.length} attributes"><span class="bag-attribute-count">${entries.length}</span></summary><dl>${rows}</dl></details>`;
  }
  function renderBag(current, depth, nodes) {
    if (ancestors.has(current)) return '<p class="bag-cycle" role="note">↻ circular reference</p>';
    ancestors.add(current);
    const html = nodes.length ? `<ol class="bag-nodes">${nodes.map(node => renderNode(node,depth)).join('')}</ol>` : '<p class="bag-empty">Empty Bag</p>';
    ancestors.delete(current);
    return html;
  }
  function resolverPanel(resolver) {
    if (!resolver) return '';
    const parameters = {cacheTime:resolver.cacheTime, readOnly:resolver.readOnly,
      ...(options.resolverParameters ? options.resolverParameters(resolver) : {})};
    const rows = Object.entries(parameters).map(([key,value]) => {
      if (typeof value === 'function') {
        return `<div><dt>${escape(key)}</dt><dd><code>${escape(value.name || '(anonymous)')}()</code></dd></div>`;
      }
      const info = tytxInfo(value);
      return `<div><dt>${escape(key)}</dt><dd>${badge(info.dtype,info.name)} ${escape(info.text)}</dd></div>`;
    }).join('');
    return `<details class="bag-resolver" title="Static view: resolver was not evaluated"><summary>${escape(resolver.constructor.name)}</summary><dl>${rows}</dl></details>`;
  }
  function renderNode(node, depth) {
    const value = node.staticValue;
    const resolverBadge = resolverPanel(node.resolver);
    const attrs = attributes(node.attr);
    const tag = node.nodeTag ? `<span class="node-tag">${escape(node.nodeTag)}</span>` : '';
    if (isBag(value)) {
      const nodes = value.getNodes();
      const count = nodes.length;
      return `<li class="bag-node bag-branch bag-depth-${depth % 2}"><details class="bag-toggle"${depth < openDepth ? ' open' : ''}><summary><span class="bag-branch-name"><span class="bag-label">${escape(node.label)}</span><span class="bag-count" aria-label="${count} nodes">${count}</span>${tag}</span></summary></details>${resolverBadge}${attrs}${renderBag(value,depth + 1,nodes)}</li>`;
    }
    const info = tytxInfo(value);
    return `<li class="bag-node bag-leaf"><div class="bag-row">${badge(info.dtype,info.name)}<span class="bag-label">${escape(node.label)}${tag}</span><code class="bag-value">${escape(info.text)}</code><span class="bag-meta">${resolverBadge}</span></div>${attrs}</li>`;
  }
  if (!isBag(bag)) throw new TypeError('htmlRepr expects a Bag-like object with getNodes()');
  return `<div class="${escape(['bag-view',showTypes ? '' : 'bag-no-types',className].filter(Boolean).join(' '))}"><ol class="bag-nodes">${renderNode({label:title, staticValue:bag, attr:{}, resolver:null, nodeTag:null},0)}</ol></div>`;
}

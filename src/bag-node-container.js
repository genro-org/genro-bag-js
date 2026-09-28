// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

import { BagNode } from './bag-node.js';
import { fromTytx } from 'genro-tytx';

/**
 * BagNodeContainer - Ordered container for BagNodes with positional insert.
 *
 * Combines dict-like access with list-like ordering. Elements can be
 * accessed by label, numeric index, or '#n' string index.
 */
export class BagNodeContainer {
    constructor() {
        this._dict = Object.create(null);     // maps label -> BagNode
        this._list = [];     // BagNodes in order
        this._parentBag = null;
    }

    /**
     * Return the index of a label in this container.
     *
     * @param {string} label - The label or special syntax to look up.
     *   - 'label': exact label match
     *   - '#n': numeric index (e.g., '#0', '#1')
     *   - '#attr=value': find by attribute value (e.g., '#id=34')
     *   - '#=value': find by node value (e.g., '#=target')
     * @returns {number} Index position (0-based), or -1 if not found.
     */
    index(label) {
        if (label in this._dict) {
            return this._list.findIndex(node => node.label === label);
        }
        // Handle #n syntax
        let match = label.match(/^#(\d+)$/);
        if (match) {
            const idx = parseInt(match[1], 10);
            return idx < this._list.length ? idx : -1;
        }
        // Handle #attr=value or #=value syntax
        match = label.match(/^#(\w*)=(.*)$/);
        if (match) {
            const [, attr, rawValue] = match;
            const value = rawValue.includes('::') ? fromTytx(rawValue) : rawValue;
            if (attr) {
                // #attr=value - find by attribute
                return this._list.findIndex(node => node.getAttr(attr) === value);
            } else {
                // #=value - find by node value
                return this._list.findIndex(node => node._value === value);
            }
        }
        return -1;
    }

    /**
     * Parse position syntax and return insertion index.
     *
     * Supported formats:
     *   - null or '>': append at end
     *   - '<': insert at beginning
     *   - int n: insert at index n. Negative values count from the end
     *     (Python-style: -1 = before last). Out-of-range values clamp to [0, len].
     *   - '#n': insert at non-negative index n (clamped to len)
     *   - '<label': insert before node with given label
     *   - '>label': insert after node with given label
     *   - '<#n' / '>#n': insert before/after non-negative index n
     *
     * Fails fast on malformed input instead of silently appending, so a bad
     * position is reported to the caller (aligns with Python _parse_position).
     *
     * @param {string|number|null} position - Position specification.
     * @returns {number} Index where to insert (always valid for splice).
     * @throws {Error} If the string position is malformed (e.g. '#abc', '#-1',
     *   '@foo') or references a non-existent label (e.g. '<missing').
     */
    _parsePosition(position) {
        const n = this._list.length;

        if (position === null || position === undefined || position === '>') {
            return n;
        }

        if (typeof position === 'number') {
            if (position < 0) {
                position = n + position;
            }
            return Math.max(0, Math.min(position, n));
        }

        if (position === '<') {
            return 0;
        }

        if (position.startsWith('#')) {
            const idx = this._parseSharpIndex(position.slice(1), position);
            return Math.min(idx, n);
        }

        if (position.startsWith('<')) {
            const ref = position.slice(1);
            if (ref.startsWith('#')) {
                const idx = this._parseSharpIndex(ref.slice(1), position);
                return Math.min(idx, n);
            }
            const labelIdx = this.index(ref);
            if (labelIdx < 0) {
                throw new Error(
                    `Invalid node_position '${position}': label '${ref}' not found`
                );
            }
            return labelIdx;
        }

        if (position.startsWith('>')) {
            const ref = position.slice(1);
            if (ref.startsWith('#')) {
                const idx = this._parseSharpIndex(ref.slice(1), position);
                return Math.min(idx + 1, n);
            }
            const labelIdx = this.index(ref);
            if (labelIdx < 0) {
                throw new Error(
                    `Invalid node_position '${position}': label '${ref}' not found`
                );
            }
            return labelIdx + 1;
        }

        throw new Error(`Invalid node_position '${position}': unrecognized syntax`);
    }

    /**
     * Parse a non-negative integer from '#n' syntax.
     *
     * @param {string} raw - The part after '#' (e.g. '3' from '#3').
     * @param {string} original - Full position string for error messages.
     * @returns {number} The parsed non-negative integer.
     * @throws {Error} If raw is not a non-negative integer.
     */
    _parseSharpIndex(raw, original) {
        if (!/^-?\d+$/.test(raw)) {
            throw new Error(
                `Invalid node_position '${original}': '${raw}' is not an integer`
            );
        }
        const idx = parseInt(raw, 10);
        if (idx < 0) {
            throw new Error(
                `Invalid node_position '${original}': negative index not allowed in '#n' syntax`
            );
        }
        return idx;
    }

    /**
     * Get item by label or index.
     *
     * @param {string|number} key - Label string or integer index.
     * @returns {BagNode|null} The BagNode if found, null otherwise.
     */
    get(key) {
        if (typeof key === 'number') {
            return (key >= 0 && key < this._list.length) ? this._list[key] : null;
        }
        if (key.startsWith('#')) {
            const idx = this.index(key);
            return idx >= 0 ? this._list[idx] : null;
        }
        return this._dict[key] || null;
    }

    /**
     * Set or create a BagNode with optional position.
     *
     * Supports ?attr syntax to set attributes instead of value (always
     * merged with existing attributes, regardless of `updattr`):
     *   - 'label?myattr' → sets attribute 'myattr' to value
     *   - 'label?x&y&z' → sets attributes from tuple (value must be array with matching length)
     *
     * @param {string} label - The node label. Can contain ?attr suffix.
     * @param {*} value - The value to set. With ?attr syntax, becomes the attribute value.
     * @param {string|number|null} [nodePosition='>'] - Position specification.
     * @param {Object} [attr=null] - Optional attributes.
     * @param {Object} [parentBag=null] - Parent Bag reference.
     * @param {BagResolver} [resolver=null] - Resolver to attach to node.
     * @param {boolean} [updattr=false] - If false, clear existing attributes first.
     * @param {boolean} [removeNullAttributes=true] - If true, remove null values from attributes.
     * @param {string} [reason=null] - Optional reason string for events.
     * @param {boolean} [doTrigger=true] - If false, suppress events.
     * @param {boolean} [fired=false] - If true, reset value to null after creation.
     * @param {string} [nodeTag=null] - Semantic type tag for the node.
     * @returns {BagNode} The created or updated BagNode.
     */
    set(label, value, nodePosition = '>', attr = null, parentBag = null,
        resolver = null, updattr = false, removeNullAttributes = true,
        reason = null, doTrigger = true, fired = false, nodeTag = null) {
        // Parse query string from label (like Python)
        let queryString = null;
        if (label.includes('?')) {
            [label, queryString] = label.split('?', 2);
        }

        // Validate label
        if (label === null || label === undefined || label.startsWith('#')) {
            throw new Error('Cannot create new node with #n syntax');
        }

        // Handle query string: convert value to attributes
        if (queryString) {
            const qs = queryString.split('&');
            if (qs.length === 1) {
                attr = { [qs[0]]: value };
            } else {
                if (!Array.isArray(value) || value.length !== qs.length) {
                    throw new Error('Wrong attributes assignment');
                }
                attr = {};
                for (let i = 0; i < qs.length; i++) {
                    attr[qs[i]] = value[i];
                }
            }
            value = null;
        }

        let node = this._dict[label];

        if (node) {
            // Existing node — update
            if (nodeTag) {
                node.nodeTag = nodeTag;
            }
            if (resolver !== null) {
                if (resolver === false) {
                    node.resolver = null;
                } else {
                    node.resolver = resolver;
                }
            }
            if (queryString) {
                // Only set_attr, don't touch value. Force merge (updattr=true):
                // the ?attr query syntax is an alias of setAttr for the named
                // attribute(s) and must preserve the other attributes,
                // regardless of the updattr argument (aligns with Python #56).
                node.setAttr(attr, doTrigger, true, removeNullAttributes);
            } else {
                // Update value with all propagated params
                node.setValue(value, doTrigger, attr, updattr, removeNullAttributes, reason);
            }
        } else {
            // New node — use parentBag.nodeClass if available
            const NodeClass = (parentBag && parentBag.nodeClass) ? parentBag.nodeClass : BagNode;
            node = new NodeClass(parentBag, label, queryString ? null : value, attr,
                resolver, nodeTag, null, removeNullAttributes);
            const idx = this._parsePosition(nodePosition);
            this._dict[label] = node;
            this._list.splice(idx, 0, node);

            // Trigger insert event if backref enabled.
            // reason is the 4th argument (3rd is pathlist) — passing it in the
            // wrong slot would corrupt the subscriber's pathlist.
            if (doTrigger && parentBag && parentBag.backref) {
                parentBag._onNodeInserted(node, idx, null, reason);
            }
        }

        // fired pattern: reset value after creation
        if (fired) {
            node.setValue(null, false);
        }

        return node;
    }

    /**
     * Remove and return item.
     *
     * @param {string|number} key - Label, index, or '#n'.
     * @returns {BagNode|null} The removed BagNode, or null if not found.
     */
    pop(key) {
        const node = this.get(key);
        if (node) {
            delete this._dict[node.label];
            const idx = this._list.indexOf(node);
            if (idx >= 0) {
                this._list.splice(idx, 1);
            }
            return node;
        }
        return null;
    }

    /**
     * Check if label exists.
     *
     * @param {string} key - Label to check.
     * @returns {boolean} True if label exists.
     */
    has(key) {
        return key in this._dict;
    }

    /**
     * Return number of elements.
     *
     * @returns {number} Number of elements.
     */
    get length() {
        return this._list.length;
    }

    /**
     * Clear all elements.
     */
    clear() {
        this._dict = Object.create(null);
        this._list = [];
    }

    /**
     * Return node labels in order.
     *
     * @returns {string[]} Array of labels.
     */
    keys() {
        return this._list.map(node => node.label);
    }

    /**
     * Return node values in order.
     *
     * @returns {Array} Array of values.
     */
    values() {
        return this._list.map(node => node.getValue());
    }

    /**
     * Return [label, value] tuples in order.
     *
     * @returns {Array} Array of [label, value] tuples.
     */
    items() {
        return this._list.map(node => [node.label, node.getValue()]);
    }

    /**
     * Make container iterable.
     */
    [Symbol.iterator]() {
        return this._list[Symbol.iterator]();
    }

    /**
     * Move element(s) to a new position.
     *
     * @param {number|number[]} what - Index or list of indices to move.
     * @param {number} position - Target index position.
     * @param {boolean} [trigger=true] - If true, fire del/ins events.
     */
    move(what, position, trigger = true) {
        if (position < 0) {
            return;
        }

        // Normalize to array
        const indices = Array.isArray(what) ? what : [what];
        if (indices.length === 0) {
            return;
        }

        // Get destination label BEFORE any removal
        if (position >= this._list.length) {
            return;
        }
        const destLabel = this._list[position].label;

        if (indices.length > 1) {
            // Multi-node move
            const sortedIndices = [...indices].sort((a, b) => a - b);
            const delta = sortedIndices[0] < position ? 1 : 0;

            // Pop nodes in reverse order (highest index first)
            const popped = [];
            for (let i = sortedIndices.length - 1; i >= 0; i--) {
                const idx = sortedIndices[i];
                if (idx >= 0 && idx < this._list.length) {
                    const node = this._list[idx];
                    this._list.splice(idx, 1);
                    popped.push(node);
                    if (trigger && this._parentBag && this._parentBag.backref) {
                        this._parentBag._onNodeDeleted(node, idx);
                    }
                }
            }

            // Find new position based on destLabel + delta
            let newPos = this.index(destLabel);
            if (newPos < 0) {
                newPos = this._list.length;
            }
            newPos += delta;

            // Insert all popped nodes at new position
            for (const node of popped) {
                this._list.splice(newPos, 0, node);
                if (trigger && this._parentBag && this._parentBag.backref) {
                    this._parentBag._onNodeInserted(node, newPos);
                }
            }
        } else {
            // Single node move
            const fromIdx = indices[0];
            if (fromIdx === position) {
                return;
            }
            if (fromIdx < 0 || fromIdx >= this._list.length) {
                return;
            }

            const node = this._list[fromIdx];
            this._list.splice(fromIdx, 1);

            if (trigger && this._parentBag && this._parentBag.backref) {
                this._parentBag._onNodeDeleted(node, fromIdx);
            }

            this._list.splice(position, 0, node);

            if (trigger && this._parentBag && this._parentBag.backref) {
                this._parentBag._onNodeInserted(node, position);
            }
        }
    }

    /**
     * Check equality with another BagNodeContainer.
     *
     * @param {BagNodeContainer} other - Container to compare with.
     * @returns {boolean} True if equal (same nodes in same order).
     */
    isEqual(other) {
        if (!(other instanceof BagNodeContainer)) {
            return false;
        }
        if (this._list.length !== other._list.length) {
            return false;
        }
        for (let i = 0; i < this._list.length; i++) {
            const thisNode = this._list[i];
            const otherNode = other._list[i];
            if (!thisNode.isEqual(otherNode)) {
                return false;
            }
        }
        return true;
    }
}

// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

import { fromTytx } from 'genro-tytx';
import { BagResolver } from './resolver.js';

/**
 * BagNode - individual node in a Bag hierarchy.
 *
 * A BagNode gathers within itself three main things:
 * - label: can be only a string
 * - value: can be anything, even a Bag for hierarchical structure
 * - attr: dictionary that contains node's metadata
 */
export class BagNode {
    /**
     * Create a new BagNode.
     *
     * @param {Object} parentBag - The parent Bag containing this node.
     * @param {string} label - The node's key/name within the parent Bag.
     * @param {*} [value=null] - The node's value (can be scalar or Bag).
     * @param {Object} [attr=null] - Dict of attributes to set.
     * @param {BagResolver} [resolver=null] - Resolver for lazy value loading.
     * @param {string} [nodeTag=null] - Semantic type tag for the node.
     * @param {string} [xmlTag=null] - Original XML tag name (for serialization).
     * @param {boolean} [removeNullAttributes=true] - Remove null attributes during construction.
     */
    constructor(parentBag, label, value = null, attr = null, resolver = null, nodeTag = null, xmlTag = null,
        removeNullAttributes = true) {
        this.label = label;
        this._value = null;
        this._attr = {};
        this._parentBag = null;
        this._resolver = null;
        this._nodeSubscribers = {};
        this._onChangedValue = null;
        this.nodeTag = nodeTag;
        this.xmlTag = xmlTag;
        this._compiled = null;

        // Set parent
        this.parentBag = parentBag;

        // Process attributes - trigger=false during construction
        if (attr) {
            this.setAttr(attr, false, true, removeNullAttributes);
        }

        // Process value - trigger=false during construction
        if (value !== null) {
            this.setValue(value, false);
        }

        // Set resolver after value (same order as Python)
        if (resolver) {
            this.resolver = resolver;
        }
    }

    // -------------------------------------------------------------------------
    // Parent Bag Property
    // -------------------------------------------------------------------------

    get parentBag() {
        return this._parentBag;
    }

    set parentBag(parentBag) {
        if (parentBag === null && this._value?.parentNode === this) {
            this._value.setBackref();
        }
        this._parentBag = parentBag;
        if (parentBag?.backref && this._value && typeof this._value._htraverse === "function") {
            this._value.setBackref(this, parentBag);
        }
    }

    // -------------------------------------------------------------------------
    // Value Property and Methods
    // -------------------------------------------------------------------------

    get value() {
        return this.getValue();
    }

    set value(value) {
        this.setValue(value);
    }

    /**
     * Get the node's value.
     *
     * @param {boolean} [isStatic=false] - If true, return cached value without triggering resolver.
     * @param {string} [queryString=null] - Query string from path suffix (after '?').
     *   - null: return node value
     *   - '': return all attributes as an object
     *   - 'attr': return single attribute value (resolving attribute resolvers)
     *   - 'attr1&attr2': return tuple of attribute values
     *   - 'key=val::T&key2=val2::T': kwargs for resolver (parsed via tytx ::QS)
     * @param {Object} [kwargs={}] - Additional kwargs passed to resolver.
     * @returns {*} The value/attributes, or a Promise of the complete query result.
     * Static attribute queries preserve raw resolver objects without executing them.
     */
    getValue(isStatic = false, queryString = null, kwargs = {}) {
        if (queryString !== null) {
            // Use tytx ::QS to parse queryString (like Python)
            const parsedQs = fromTytx(`${queryString}::QS`);

            if (Array.isArray(parsedQs)) {
                // Attribute resolvers use their own defaults, without node context.
                const keys = parsedQs.length ? parsedQs : Object.keys(this._attr);
                const values = keys.map(key => {
                    const value = this.getAttr(key);
                    return !isStatic && value instanceof BagResolver ? value.resolve() : value;
                });
                const result = attrs => parsedQs.length === 0
                    ? Object.fromEntries(keys.map((key, index) => [key, attrs[index]]))
                    : attrs.length === 1 ? attrs[0] : attrs;
                return values.some(value => value && typeof value.then === 'function')
                    ? Promise.all(values).then(result) : result(values);
            } else {
                // Dict → kwargs for resolver: ?x=1&y=2 → {x: 1, y: 2}
                if (!this._resolver) {
                    throw new Error('Cannot use kwargs syntax without resolver');
                }
                kwargs = { ...kwargs, ...parsedQs };
            }
        }

        // Resolver support
        if (this._resolver !== null) {
            return this._resolver.resolve({ static: isStatic, ...kwargs });
        }
        return this._value;
    }

    /**
     * Set the node's value.
     *
     * @param {*} value - The value to set.
     * @param {boolean} [trigger=true] - If true, notify subscribers of the change.
     * @param {Object} [attributes=null] - Optional attributes to set along with value.
     * @param {boolean|null} [updattr=null] - If falsy (default null), replace
     *   existing attributes; if true, merge. Note: unlike setAttr called
     *   directly (which merges by default), setValue replaces by default,
     *   matching Python's _updattr=None.
     * @param {boolean} [removeNullAttributes=true] - If true, remove null values from attributes.
     * @param {string} [reason=null] - Optional reason string for the trigger.
     */
    setValue(value, trigger = true, attributes = null, updattr = null, removeNullAttributes = true, reason = null) {
        // Handle BagResolver passed as value
        if (value instanceof BagResolver) {
            this.resolver = value;
            value = null;
        }
        // Handle BagNode passed as value - extract its value and attrs
        else if (value instanceof BagNode) {
            attributes = attributes || {};
            Object.assign(attributes, value._attr);
            if (value.resolver) {
                this.resolver = value.resolver;
            }
            value = value._value;
        }

        const oldvalue = this._value;
        if (oldvalue !== value && oldvalue?.parentNode === this) {
            oldvalue.setBackref();
        }
        this._value = value;

        const valueChanged = oldvalue !== this._value;
        const callbackTrigger = trigger == null ? true : trigger;
        let attrsDiff = null;

        if (attributes !== null) {
            // Apply attributes silently; emit one event for the actual changes.
            const oldattrSnapshot = { ...this._attr };
            this.setAttr(attributes, false, updattr, removeNullAttributes);
            const diff = this._buildAttrDiff(oldattrSnapshot, this._attr);
            attrsDiff = Object.keys(diff).length > 0 ? diff : null;
        }

        trigger = callbackTrigger && (valueChanged || attrsDiff !== null);
        const evt = attrsDiff ? (valueChanged ? 'upd_value_attr' : 'upd_attrs') : 'upd_value';

        // Legacy value hook also runs for silent and unchanged assignments.
        if (this._onChangedValue) {
            this._onChangedValue(this, value, oldvalue, callbackTrigger);
        }

        // Node subscribers receive the real event type and an info object:
        // { oldvalue } for upd_value, plus { attrs_diff } for upd_value_attr
        if (trigger) {
            const info = attrsDiff !== null
                ? { oldvalue, attrs_diff: attrsDiff }
                : { oldvalue };
            for (const subscriber of Object.values(this._nodeSubscribers)) {
                subscriber({ node: this, info, evt });
            }
        }

        if (this._parentBag !== null && this._parentBag.backref) {
            // If value is a Bag, set up backref
            if (value && typeof value._htraverse === 'function') {
                value.setBackref(this, this._parentBag);
            }
            if (trigger) {
                this._parentBag._onNodeChanged(
                    this, [this.label], evt, oldvalue, attrsDiff, reason
                );
            }
        }
    }

    /** Copy value, attributes and resolver; retain label, identity and position. */
    replace(other) {
        if (!(other instanceof BagNode)) throw new TypeError('BagNode.replace expects a BagNode');
        if (other === this) return this;
        let value = other.staticValue;
        if (value && typeof value._htraverse === 'function') {
            value = value.createChildBag().replace(value);
        }
        // Copy resolver state without executing it or rebinding the source.
        let resolver = null;
        if (other.resolver) {
            resolver = Object.create(Object.getPrototypeOf(other.resolver),
                Object.getOwnPropertyDescriptors(other.resolver));
            resolver._node = null;
            resolver._kw = { ...other.resolver._kw };
        }
        const oldvalue = this._value;
        const oldattr = { ...this._attr };
        const oldresolver = this.resolver;
        if (oldresolver && oldresolver._node === this) oldresolver._node = null;
        this.resolver = resolver;
        this.setValue(value, false, { ...other.attr }, false, false, null);
        const diff = this._buildAttrDiff(oldattr, this._attr);
        const attrsDiff = Object.keys(diff).length ? diff : null;
        const valueChanged = oldvalue !== value || oldresolver !== resolver;
        if (valueChanged || attrsDiff) {
            const evt = attrsDiff ? (valueChanged ? 'upd_value_attr' : 'upd_attrs') : 'upd_value';
            const info = attrsDiff ? {oldvalue, attrs_diff: attrsDiff} : {oldvalue};
            for (const callback of Object.values(this._nodeSubscribers)) {
                callback({node: this, info, evt});
            }
            if (this._parentBag !== null && this._parentBag.backref) {
                this._parentBag._onNodeChanged(this, [this.label], evt, oldvalue, attrsDiff);
            }
        }
        return this;
    }

    /**
     * Get node's raw _value (bypassing resolver).
     */
    get staticValue() {
        return this._value;
    }

    set staticValue(value) {
        this._value = value;
    }

    /**
     * Get the resolver attached to this node.
     *
     * @returns {BagResolver|null} The resolver or null.
     */
    get resolver() {
        return this._resolver;
    }

    /**
     * Set the resolver for this node.
     *
     * @param {BagResolver|null} resolver - The resolver to attach.
     */
    set resolver(resolver) {
        this._resolver = resolver;
        if (resolver && resolver.setNode) {
            resolver.setNode(this);
        }
    }

    /**
     * Reset the resolver and clear the node value.
     */
    resetResolver() {
        if (!this._resolver) {
            throw new Error('Cannot reset resolver: node has no resolver');
        }
        this._resolver.reset();
        this.setValue(null);
    }

    // -------------------------------------------------------------------------
    // Attribute Methods
    // -------------------------------------------------------------------------

    get attr() {
        return this._attr;
    }

    /**
     * Get attribute value or all attributes.
     *
     * @param {string} [label=null] - The attribute's label. If null, returns all attributes.
     * @param {*} [defaultValue=null] - Default value if attribute not found.
     * @returns {*} Attribute value, default, or dict of all attributes.
     */
    getAttr(label = null, defaultValue = null) {
        if (!label) {
            return this._attr;
        }
        return label in this._attr ? this._attr[label] : defaultValue;
    }

    /**
     * Compute the symmetric diff between two attribute snapshots.
     *
     * Returns a dict mapping each changed key to { old, new }, covering
     * added (old=null), removed (new=null) and modified entries. Keys whose
     * value did not change are omitted.
     *
     * @param {Object} oldattr - Attribute snapshot before the change.
     * @param {Object} newattr - Attribute snapshot after the change.
     * @returns {Object} Diff dict { name: { old, new } }.
     */
    _buildAttrDiff(oldattr, newattr) {
        const diff = {};
        const keys = new Set([...Object.keys(oldattr), ...Object.keys(newattr)]);
        for (const key of keys) {
            const oldVal = key in oldattr ? oldattr[key] : null;
            const newVal = key in newattr ? newattr[key] : null;
            if (oldVal !== newVal) {
                diff[key] = { old: oldVal, new: newVal };
            }
        }
        return diff;
    }

    /**
     * Set attributes on the node.
     *
     * @param {Object} [attr=null] - Dictionary of attributes to set.
     * @param {boolean} [trigger=true] - If true, notify subscribers of the change.
     * @param {boolean} [updattr=true] - If false, clear existing attributes first.
     * @param {boolean} [removeNullAttributes=true] - If true, remove null values from attributes.
     */
    setAttr(attr = null, trigger = true, updattr = true, removeNullAttributes = true) {
        const newAttr = attr || {};

        // Save old state BEFORE any modification (only if needed for subscribers
        // or for the parent's backref propagation)
        const hasNodeSubscribers = Object.keys(this._nodeSubscribers).length > 0;
        const needDiff = trigger && (hasNodeSubscribers ||
            (this._parentBag !== null && this._parentBag.backref));
        const oldattr = needDiff ? { ...this._attr } : null;

        if (updattr) {
            Object.assign(this._attr, newAttr);
        } else {
            this._attr = { ...newAttr };
        }

        if (removeNullAttributes) {
            for (const key of Object.keys(this._attr)) {
                if (this._attr[key] === null) {
                    delete this._attr[key];
                }
            }
        }

        if (trigger && oldattr !== null) {
            const diff = this._buildAttrDiff(oldattr, this._attr);

            if (Object.keys(diff).length > 0 && hasNodeSubscribers) {
                for (const subscriber of Object.values(this._nodeSubscribers)) {
                    subscriber({ node: this, info: { attrs_diff: diff }, evt: 'upd_attrs' });
                }
            }

            if (Object.keys(diff).length > 0 &&
                this._parentBag !== null && this._parentBag.backref) {
                const reason = trigger === true ? 'true' : String(trigger);
                this._parentBag._onNodeChanged(
                    this, [this.label], 'upd_attrs', null, diff, reason
                );
            }
        }
    }

    /**
     * Delete attributes from the node.
     *
     * @param {...string} attrsToDelete - Attribute labels to remove.
     *   Each can be a single label or a comma-separated string.
     */
    delAttr(...attrsToDelete) {
        for (const attr of attrsToDelete) {
            if (typeof attr === 'string' && attr.includes(',')) {
                for (const a of attr.split(',')) {
                    delete this._attr[a.trim()];
                }
            } else {
                delete this._attr[attr];
            }
        }
    }

    /**
     * Check if a node has the given attribute.
     *
     * @param {string} label - Attribute label to check.
     * @param {*} [value=null] - If provided, also check if attribute has this value.
     * @returns {boolean} True if attribute exists (and matches value if provided).
     */
    hasAttr(label, value = null) {
        if (!(label in this._attr)) {
            return false;
        }
        if (value !== null) {
            return this._attr[label] === value;
        }
        return true;
    }

    /**
     * Get attributes inherited from ancestors.
     *
     * @returns {Object} Dict with all inherited attributes merged with this node's attributes.
     */
    getInheritedAttributes() {
        let inherited = {};
        if (this._parentBag && this._parentBag.parentNode) {
            inherited = this._parentBag.parentNode.getInheritedAttributes();
        }
        return { ...inherited, ...this._attr };
    }

    // -------------------------------------------------------------------------
    // Subscription Methods
    // -------------------------------------------------------------------------

    /**
     * Subscribe to changes on this specific node.
     *
     * @param {string} subscriberId - Unique identifier for this subscription.
     * @param {Function} callback - Function to call on changes.
     *
     * Callback signature: callback({ node, info, evt })
     * - node: This BagNode
     * - info: an object with semantic keys:
     *     - 'upd_value'      → { oldvalue }
     *     - 'upd_attrs'      → { attrs_diff }   (diff dict { name: { old, new } })
     *     - 'upd_value_attr' → { oldvalue, attrs_diff }
     * - evt: Event type ('upd_value', 'upd_attrs' or 'upd_value_attr')
     */
    subscribe(subscriberId, callback) {
        this._nodeSubscribers[subscriberId] = callback;
    }

    /**
     * Unsubscribe from changes on this node.
     *
     * @param {string} subscriberId - The subscription identifier to remove.
     */
    unsubscribe(subscriberId) {
        delete this._nodeSubscribers[subscriberId];
    }

    // -------------------------------------------------------------------------
    // Compilation Properties
    // -------------------------------------------------------------------------

    /**
     * Lazy-initialized compiled data storage.
     * External systems (compilers) store compiled data here.
     *
     * @returns {Object} The compiled data dictionary.
     */
    get compiled() {
        if (!this._compiled) {
            this._compiled = {};
        }
        return this._compiled;
    }

    /**
     * Check if this node's value is a Bag (branch node).
     * Uses duck typing via _htraverse to avoid circular import.
     *
     * @returns {boolean} True if value is a Bag.
     */
    get isBranch() {
        return this._value != null && typeof this._value._htraverse === 'function';
    }

    // -------------------------------------------------------------------------
    // Navigation Properties
    // -------------------------------------------------------------------------

    /**
     * Get this node's index position within parent Bag.
     *
     * @returns {number|null} The 0-based index of this node in the parent's node list,
     *   or null if this node has no parent.
     */
    get position() {
        if (this._parentBag === null) {
            return null;
        }
        return this._parentBag._nodes.index(this.label);
    }

    /**
     * Get dot-separated path from root to this node.
     *
     * @returns {string|null} Full path or null if no parent.
     */
    get fullpath() {
        if (this._parentBag !== null) {
            const parentFullpath = this._parentBag.fullpath;
            return parentFullpath ? `${parentFullpath}.${this.label}` : this.label;
        }
        return null;
    }

    /**
     * Get the node that contains this node's parent Bag.
     *
     * In the hierarchy: grandparent_bag contains parent_node, whose value
     * is parent_bag, which contains this node.
     *
     * @returns {BagNode|null} The parent node or null.
     */
    get parentNode() {
        if (this._parentBag) {
            return this._parentBag.parentNode;
        }
        return null;
    }

    /**
     * Find the ancestor node that owns a given attribute.
     *
     * @param {string} attrname - Attribute name to search for.
     * @param {*} [attrvalue=null] - If provided, also match this value.
     * @returns {BagNode|null} The node that owns the attribute, or null.
     */
    attributeOwnerNode(attrname, attrvalue = null) {
        let curr = this;
        if (attrvalue === null) {
            while (curr && !(attrname in curr._attr)) {
                curr = curr.parentNode;
            }
        } else {
            while (curr && curr._attr[attrname] !== attrvalue) {
                curr = curr.parentNode;
            }
        }
        return curr;
    }

    /**
     * Return node data as a tuple (array).
     *
     * @returns {Array} Array of [label, value, attr, resolver].
     */
    asTuple() {
        return [this.label, this.value, this._attr, this._resolver || null];
    }

    // -------------------------------------------------------------------------
    // Comparison
    // -------------------------------------------------------------------------

    /**
     * Check equality with another BagNode.
     *
     * @param {BagNode} other - Node to compare with.
     * @returns {boolean} True if label, attr and value match.
     */
    isEqual(other) {
        if (!(other instanceof BagNode)) {
            return false;
        }
        if (this.label !== other.label) {
            return false;
        }
        // Compare attributes
        const thisKeys = Object.keys(this._attr);
        const otherKeys = Object.keys(other._attr);
        if (thisKeys.length !== otherKeys.length) {
            return false;
        }
        for (const key of thisKeys) {
            if (this._attr[key] !== other._attr[key]) {
                return false;
            }
        }
        // If has resolver, compare resolver identity
        if (this._resolver !== null) {
            return this._resolver === other._resolver;
        }
        // Prefer content equality for nested Bags, including framework subclasses
        // whose compatibility isEqual method deliberately compares identity.
        if (this._value && typeof this._value.equalTo === 'function') {
            return this._value.equalTo(other._value);
        }
        // Preserve existing comparison hooks for other value types.
        if (this._value && typeof this._value.isEqual === 'function') {
            return this._value.isEqual(other._value);
        }
        return this._value === other._value;
    }

    /**
     * Compare this node with another and return differences.
     *
     * @param {BagNode} other - Another BagNode to compare with.
     * @returns {string|null} Description of differences, or null if equal.
     */
    diff(other) {
        if (this.label !== other.label) {
            return `Other label: ${other.label}`;
        }
        // Compare attributes
        const thisKeys = Object.keys(this._attr);
        const otherKeys = Object.keys(other._attr);
        if (thisKeys.length !== otherKeys.length ||
            thisKeys.some(k => this._attr[k] !== other._attr[k])) {
            return `attributes self:${JSON.stringify(this._attr)} --- other:${JSON.stringify(other._attr)}`;
        }
        if (this._value !== other._value) {
            return `value self:${this._value} --- other:${other._value}`;
        }
        return null;
    }

    /**
     * Convert node to JSON-serializable dict.
     *
     * @param {boolean} [typed=true] - If true, include type information.
     * @returns {Object} Dict with keys 'label', 'value', and 'attr'.
     */
    toJson(typed = true) {
        let value = this.value;
        if (value && typeof value.toJson === 'function') {
            value = value.toJson(typed, true);
        }
        return { label: this.label, value: value, attr: this._attr };
    }

    // -------------------------------------------------------------------------
    // String representation
    // -------------------------------------------------------------------------

    toString() {
        return `BagNode : ${this.label}`;
    }
}

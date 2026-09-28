// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

import { BagNodeContainer } from './bag-node-container.js';
import { BagNode } from './bag-node.js';
import { toTytx as tytxEncode, fromTytx as tytxDecode, registerClass, getRegisteredType } from 'genro-tytx';
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom';
import { BagCbResolver, BagResolver } from './resolver.js';
import { BagSerializationError, encodeResolver, decodeResolver, encodeAttrs, decodeAttrs } from './resolver-wire.js';

// Resolver caches are not structural branches on the wire: the descriptor
// owns that node, and serializing cached descendants would orphan them.
function* serializationNodes(bag, prefix = '') {
    for (const node of bag) {
        const path = prefix ? `${prefix}.${node.label}` : node.label;
        yield [path, node];
        const value = node.getValue(true);
        if (!node.resolver && value instanceof Bag) yield* serializationNodes(value, path);
    }
}

/**
 * Bag - Hierarchical data container with path-based access.
 *
 * A Bag is an ordered container of BagNodes, accessible by label, numeric index,
 * or hierarchical path. Nested elements can be accessed with dot-separated paths
 * like 'a.b.c'.
 */
export class Bag {
    static tytxSuffix = 'X';

    /**
     * Create a new Bag.
     *
     * @param {Object} [source=null] - Optional dict to initialize from.
     */
    constructor(source = null) {
        this._nodes = new BagNodeContainer();
        this._backref = false;
        this._parent = null;
        this._parentNode = null;
        this._rootAttributes = null;
        // Subscriber dictionaries for events
        this._updSubscribers = {};
        this._insSubscribers = {};
        this._delSubscribers = {};

        if (source) {
            this._loadSource(source);
        }
    }

    // -------------------------------------------------------------------------
    // Properties
    // -------------------------------------------------------------------------

    get parent() {
        return this._parent;
    }

    set parent(value) {
        this._parent = value;
    }

    get parentNode() {
        return this._parentNode;
    }

    set parentNode(value) {
        this._parentNode = value;
    }

    get backref() {
        return Boolean(this._backref);
    }

    /**
     * Node class used to create new nodes. Override in subclasses
     * to use custom BagNode subclasses.
     *
     * @returns {Function} The BagNode constructor.
     */
    get nodeClass() {
        return BagNode;
    }

    createChildBag() {
        return new this.constructor();
    }

    /**
     * Full path from root Bag to this Bag.
     *
     * Returns the dot-separated path from the root of the hierarchy to this
     * Bag. Returns null if backref mode is not enabled or if this is the root.
     *
     * @returns {string|null} The full path or null.
     */
    get fullpath() {
        if (this._parent !== null && this._parentNode !== null) {
            const parentFullpath = this._parent.fullpath;
            if (parentFullpath) {
                return `${parentFullpath}.${this._parentNode.label}`;
            } else {
                return this._parentNode.label;
            }
        }
        return null;
    }

    /**
     * Get dot-separated path from this Bag to a descendant node.
     *
     * Walks up from the node to this Bag collecting labels.
     * Requires backref mode enabled.
     *
     * @param {BagNode} node - A descendant BagNode.
     * @returns {string|null} The relative path, or null if not a descendant.
     */
    relativePath(node) {
        const parts = [];
        let current = node;
        while (current !== null) {
            if (current.parentBag === this) {
                parts.push(current.label);
                parts.reverse();
                return parts.join('.');
            }
            parts.push(current.label);
            current = current.parentNode;
        }
        return null;
    }

    get length() {
        return this._nodes.length;
    }

    /**
     * Root Bag of the hierarchy.
     *
     * Traverses the parent chain to find the topmost Bag. If this Bag has no
     * parent, returns itself.
     *
     * @returns {Bag} The root Bag.
     */
    get root() {
        let curr = this;
        while (curr.parent !== null) {
            curr = curr.parent;
        }
        return curr;
    }

    /**
     * Attributes of the node containing this Bag.
     *
     * Returns the attributes of the parent node that contains this Bag.
     * Returns an empty object if this Bag has no parent node.
     *
     * @returns {Object} Attributes dictionary.
     */
    get attributes() {
        if (this._parentNode !== null) {
            return this._parentNode.getAttr();
        }
        return {};
    }

    /**
     * Root-level attributes for this Bag hierarchy.
     *
     * These are special attributes stored at the hierarchy level,
     * independent of any node attributes.
     *
     * @returns {Object|null} Root attributes or null.
     */
    get rootAttributes() {
        return this._rootAttributes;
    }

    set rootAttributes(attrs) {
        this._rootAttributes = attrs !== null ? { ...attrs } : null;
    }

    // -------------------------------------------------------------------------
    // _htraverse helpers
    // -------------------------------------------------------------------------

    /**
     * Parse path and handle #parent navigation.
     *
     * @param {string|Array} path - Dot-separated path or array of segments.
     * @returns {Array} Tuple of [curr, pathlist].
     */
    _htraverseBefore(path) {
        let curr = this;

        let pathlist;
        if (typeof path === 'string') {
            path = path.replace(/\.\.\//g, '#parent.');
            pathlist = path.split('.').filter(x => x);
        } else {
            pathlist = [...path];
        }

        // Handle parent reference #parent at the beginning
        while (pathlist.length && pathlist[0] === '#parent' && curr !== null) {
            pathlist.shift();
            curr = curr.parent;
        }

        return [curr, pathlist];
    }

    // -------------------------------------------------------------------------
    // _htraverse
    // -------------------------------------------------------------------------

    /**
     * Traverse a hierarchical path.
     *
     * A `#parent` segment (also the `../` alias, expanded by _htraverseBefore)
     * walks up to the parent Bag. It is handled both as a leading segment and
     * inside the path; it requires backref/parent to be set, otherwise the
     * traversal breaks (read → null; write → stops short).
     *
     * @param {string|Array} path - Path as dot-separated string or array.
     * @param {boolean} [writeMode=false] - If true, create intermediate Bags.
     * @param {boolean} [isStatic=true] - If true, don't trigger resolvers.
     * @returns {Array} Tuple of [container, label].
     */
    _htraverse(path, writeMode = false, isStatic = true) {
        let [curr, pathlist] = this._htraverseBefore(path);

        if (curr === null) {
            return [null, null];
        }
        if (pathlist.length === 0) {
            return [curr, ''];
        }

        // Traverse path segments
        while (pathlist.length > 1 && curr instanceof Bag) {
            const segment = pathlist[0];

            // Inner #parent: walk up to the parent Bag, same behaviour as
            // _htraverseBefore applies for leading segments. Without this
            // branch the lookup below would fail (no node named '#parent')
            // and traversal would break. Requires backref/parent to be set;
            // otherwise it breaks (safe no-op). Aligns with Python #58.
            if (segment === '#parent') {
                if (curr.parent === null || curr.parent === undefined) {
                    break;
                }
                pathlist.shift();
                curr = curr.parent;
                continue;
            }

            const node = curr._nodes.get(segment);

            if (!node) {
                break;
            }

            const value = node.getValue(isStatic);

            if (value instanceof Bag) {
                pathlist.shift();
                curr = value;
            } else if (writeMode) {
                // Promote scalar to intermediate Bag
                const newBag = curr.createChildBag();
                node.setValue(newBag, true, null, true, true, 'autocreate');
                pathlist.shift();
                curr = newBag;
            } else {
                break;
            }
        }

        // Finalize
        if (!writeMode) {
            if (pathlist.length > 1) {
                return [null, null];
            }
            return [curr, pathlist[0]];
        }

        // Write mode: create intermediate nodes
        while (pathlist.length > 1) {
            const label = pathlist.shift();
            if (label.startsWith('#')) {
                throw new BagException('Not existing index in #n syntax');
            }
            const newBag = curr.createChildBag();
            curr._nodes.set(label, newBag, '>', null, curr, null, false, true, 'autocreate');
            curr = newBag;
        }

        return [curr, pathlist[0]];
    }

    // -------------------------------------------------------------------------
    // get (single level)
    // -------------------------------------------------------------------------

    /**
     * Get value at a single level (no path traversal).
     *
     * @param {string} label - Node label to look up.
     * @param {*} [defaultValue=null] - Value to return if label not found.
     * @param {boolean} [isStatic=true] - If true, don't trigger resolvers.
     * @param {Object} [kwargs={}] - Additional kwargs passed to resolver.
     * @returns {*} The node's value if found, otherwise default.
     */
    get(label, defaultValue = null, isStatic = true, kwargs = {}) {
        if (!label) {
            return this;
        }
        if (label === '#parent') {
            return this.parent;
        }
        // Parse queryString from label
        let queryString = null;
        if (label.includes('?')) {
            [label, queryString] = label.split('?', 2);
        }
        const node = this._nodes.get(label);
        if (!node) {
            return defaultValue;
        }
        return node.getValue(isStatic, queryString, kwargs);
    }

    // -------------------------------------------------------------------------
    // getItem
    // -------------------------------------------------------------------------

    /**
     * Get value at a hierarchical path.
     *
     * @param {string} path - Hierarchical path like 'a.b.c'.
     * @param {*} [defaultValue=null] - Value to return if path not found.
     * @param {boolean} [isStatic=false] - If true, don't trigger resolvers.
     * @param {Object} [kwargs={}] - Additional kwargs passed to resolver at final path.
     * @returns {*} The value at the path if found, otherwise default.
     */
    getItem(path, defaultValue = null, isStatic = false, kwargs = {}) {
        if (!path) {
            return this;
        }

        const [obj, label] = this._htraverse(path, false, isStatic);

        if (obj instanceof Bag) {
            return obj.get(label, defaultValue, isStatic, kwargs);
        }
        return defaultValue;
    }

    // -------------------------------------------------------------------------
    // setItem
    // -------------------------------------------------------------------------

    /**
     * Set value at a hierarchical path.
     *
     * An empty path raises RangeError without modifying the Bag.
     *
     * Resolver handling:
     *   - resolver=null (default): throw if node already has a resolver
     *   - resolver=false: remove existing resolver and set value
     *   - resolver=BagResolver: replace resolver
     *
     * @param {string} path - Hierarchical path like 'a.b.c'.
     * @param {*} value - Value to set at the path.
     * @param {Object} [attr=null] - Optional attributes to set on the node.
     * @param {string|number|null} [nodePosition='>'] - Position for new nodes.
     * @param {boolean} [updattr=false] - If false, clear existing attributes first.
     * @param {boolean} [removeNullAttributes=true] - If true, remove null values from attributes.
     * @param {string} [reason=null] - Reason for the change (for events).
     * @param {boolean} [fired=false] - If true, reset value to null after setting.
     * @param {boolean} [doTrigger=true] - If false, suppress events.
     * @param {*} [resolver=null] - Resolver handling for existing nodes.
     * @param {string} [nodeTag=null] - Semantic type tag for the node.
     * @returns {BagNode} The created or updated BagNode.
     */
    setItem(path, value, attr = null, nodePosition = '>', updattr = false,
            removeNullAttributes = true, reason = null, fired = false,
            doTrigger = true, resolver = null, nodeTag = null) {
        if (path === '') {
            throw new RangeError('setItem requires a non-empty path');
        }

        const [obj, label] = this._htraverse(path, true);

        return obj._nodes.set(label, value, nodePosition, attr, obj,
            resolver, updattr, removeNullAttributes, reason, doTrigger, fired, nodeTag);
    }

    // -------------------------------------------------------------------------
    // _pop (internal)
    // -------------------------------------------------------------------------

    /**
     * Internal pop by label at current level.
     *
     * @param {string} label - Node label to remove.
     * @param {string|null} [reason=null] - Reason for deletion (for events).
     * @returns {BagNode|null} The removed BagNode, or null if not found.
     */
    _pop(label, reason = null) {
        const p = this._nodes.index(label);
        if (p >= 0) {
            const node = this._nodes.pop(p);
            if (this.backref) {
                this._onNodeDeleted(node, p, reason);
            }
            return node;
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // pop
    // -------------------------------------------------------------------------

    /**
     * Remove a node and return its value.
     *
     * Traverses to the path, removes the node, and returns its value.
     *
     * @param {string} path - Hierarchical path to the node to remove.
     * @param {*} [defaultValue=null] - Value to return if path not found.
     * @param {string|null} [reason=null] - Reason for deletion (for events).
     * @returns {*} The value of the removed node, or default if not found.
     */
    pop(path, defaultValue = null, reason = null) {
        const node = this.popNode(path, reason);
        return node ? node.value : defaultValue;
    }

    /**
     * Alias for pop.
     */
    delItem(path, defaultValue = null, reason = null) {
        return this.pop(path, defaultValue, reason);
    }

    // -------------------------------------------------------------------------
    // popNode
    // -------------------------------------------------------------------------

    /**
     * Remove and return the BagNode at a path.
     *
     * Like pop(), but returns the entire BagNode instead of just its value.
     *
     * @param {string} path - Hierarchical path to the node to remove.
     * @param {string|null} [reason=null] - Reason for deletion (for events).
     * @returns {BagNode|null} The removed BagNode, or null if not found.
     */
    popNode(path, reason = null) {
        const [obj, label] = this._htraverse(path, false, true);
        if (!obj || !label) return null;
        const node = obj._nodes.get(label);
        if (!node) return null;
        try {
            return obj._pop(label, reason);
        } finally {
            // Subscribers may fail, reinsert the node, or transfer ownership.
            if (node.parentBag === obj && obj._nodes._dict[node.label] !== node) {
                node.parentBag = null;
            }
        }
    }

    // -------------------------------------------------------------------------
    // clear
    // -------------------------------------------------------------------------

    /**
     * Remove all nodes from this Bag.
     *
     * Empties the Bag completely. In backref mode, triggers delete events
     * for all removed nodes.
     */
    clear() {
        const oldNodes = [...this._nodes];
        this._nodes.clear();
        if (this.backref) {
            this._onNodeDeleted(oldNodes, -1);
        }
        for (const node of oldNodes) {
            node.parentBag = null;
        }
    }

    // -------------------------------------------------------------------------
    // getNode
    // -------------------------------------------------------------------------

    /**
     * Get the BagNode at a path (not its value).
     *
     * @param {string|number|null} path - Hierarchical path like 'a.b.c', integer index, or null.
     * @param {boolean} [isStatic=true] - If true, don't trigger resolvers.
     * @param {boolean} [autocreate=false] - If true, create node if not found.
     * @param {*} [defaultValue=null] - Default value for autocreated node.
     * @returns {BagNode|null} The BagNode if found, null otherwise.
     */
    getNode(path, isStatic = true, autocreate = false, defaultValue = null) {
        if (path === null || path === undefined || path === '') {
            return this.parentNode;
        }
        if (typeof path === 'number') {
            return this._nodes.get(path);
        }
        if (typeof path === 'string') {
            path = path.split('?', 1)[0];
        }
        const [obj, label] = this._htraverse(path, autocreate, isStatic);
        if (obj instanceof Bag && label) {
            const node = obj._nodes.get(label);
            if (node) {
                return node;
            }
            if (autocreate) {
                obj._nodes.set(label, defaultValue, '>', null, obj, null, false, true,
                    'autocreate');
                return obj._nodes.get(label);
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Backref system
    // -------------------------------------------------------------------------

    /**
     * Enable backref mode (tree-leaf model with parent references).
     *
     * @param {BagNode|null} [node=null] - The BagNode that contains this Bag.
     * @param {Bag|null} [parent=null] - The parent Bag.
     */
    setBackref(node = null, parent = null) {
        const alreadyEnabled = this._backref;
        this._backref = true;
        this._parent = parent;
        this._parentNode = node;
        if (alreadyEnabled) return;
        this._nodes._parentBag = this;
        for (const n of this) {
            n.parentBag = this;
        }
    }

    /**
     * Clear parent reference and disable backref.
     */
    delParentRef() {
        this._parent = null;
        this._parentNode = null;
        this._backref = false;
    }

    /**
     * Clear all backref assumptions recursively.
     */
    clearBackref() {
        if (this._backref) {
            this._backref = false;
            this._parent = null;
            this._parentNode = null;
            this._nodes._parentBag = null;
            for (const node of this) {
                node.parentBag = null;
                const value = node.getValue(true);
                if (value instanceof Bag) {
                    value.clearBackref();
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // Event triggers
    // -------------------------------------------------------------------------

    /**
     * Trigger for node change events.
     *
     * @param {BagNode} node - The changed node.
     * @param {string[]} pathlist - Path to the node.
     * @param {string} evt - Event type ('upd_value', 'upd_attrs', 'upd_value_attr').
     * @param {*} [oldvalue=null] - Previous value (for value changes).
     * @param {Object|null} [attrsDiff=null] - Attribute diff dict { name: { old, new } }
     *   (for attribute changes).
     * @param {string|null} [reason=null] - Reason for change.
     */
    _onNodeChanged(node, pathlist, evt, oldvalue = null, attrsDiff = null, reason = null) {
        for (const s of Object.values(this._updSubscribers)) {
            s({ node, pathlist, oldvalue, attrs_diff: attrsDiff, evt, reason });
        }
        if (this._parent && this._parentNode) {
            this._parent._onNodeChanged(
                node,
                [this._parentNode.label, ...pathlist],
                evt,
                oldvalue,
                attrsDiff,
                reason
            );
        }
    }

    /**
     * Trigger for node insert events.
     *
     * @param {BagNode} node - The inserted node.
     * @param {number} ind - Index where inserted.
     * @param {string[]|null} [pathlist=null] - Path to the node.
     * @param {string|null} [reason=null] - Reason for insertion.
     */
    _onNodeInserted(node, ind, pathlist = null, reason = null) {
        const parent = node.parentBag;
        const value = node.getValue(true);
        if (parent !== null && parent.backref && value instanceof Bag) {
            value.setBackref(node, parent);
        }

        if (pathlist === null) {
            pathlist = [];
        }
        for (const s of Object.values(this._insSubscribers)) {
            s({ node, pathlist, ind, evt: 'ins', reason });
        }
        if (this._parent && this._parentNode) {
            this._parent._onNodeInserted(
                node,
                ind,
                [this._parentNode.label, ...pathlist],
                reason
            );
        }
    }

    /**
     * Trigger for node delete events.
     *
     * @param {BagNode|BagNode[]} node - The deleted node(s).
     * @param {number} ind - Index where deleted (-1 for clear).
     * @param {string[]|null} [pathlist=null] - Path to the node.
     * @param {string|null} [reason=null] - Reason for deletion.
     */
    _onNodeDeleted(node, ind, pathlist = null, reason = null) {
        for (const s of Object.values(this._delSubscribers)) {
            s({ node, pathlist, ind, evt: 'del', reason });
        }
        if (this._parent && this._parentNode) {
            if (pathlist === null) {
                pathlist = [];
            }
            this._parent._onNodeDeleted(
                node,
                ind,
                [this._parentNode.label, ...pathlist],
                reason
            );
        }
    }

    // -------------------------------------------------------------------------
    // Subscription
    // -------------------------------------------------------------------------

    /**
     * Internal subscribe helper.
     */
    _subscribe(subscriberId, subscribersDict, callback) {
        if (callback !== null && callback !== undefined) {
            subscribersDict[subscriberId] = callback;
        }
    }

    /**
     * Subscribe to bag events.
     *
     * @param {string} subscriberId - Unique identifier for this subscription.
     * @param {Object} options - Subscription options.
     * @param {Function} [options.update] - Callback for update events.
     * @param {Function} [options.insert] - Callback for insert events.
     * @param {Function} [options.delete] - Callback for delete events.
     * @param {Function} [options.any] - Callback for all events.
     */
    subscribe(subscriberId, { update = null, insert = null, delete: del = null, any = null } = {}) {
        if (!this.backref) {
            this.setBackref();
        }

        this._subscribe(subscriberId, this._updSubscribers, update || any);
        this._subscribe(subscriberId, this._insSubscribers, insert || any);
        this._subscribe(subscriberId, this._delSubscribers, del || any);
    }

    /**
     * Unsubscribe from bag events.
     *
     * @param {string} subscriberId - The subscription identifier to remove.
     * @param {Object} options - Unsubscription options.
     * @param {boolean} [options.update=false] - Remove update subscription.
     * @param {boolean} [options.insert=false] - Remove insert subscription.
     * @param {boolean} [options.delete=false] - Remove delete subscription.
     * @param {boolean} [options.any=false] - Remove all subscriptions.
     */
    unsubscribe(subscriberId, { update = false, insert = false, delete: del = false, any = false } = {}) {
        if (update || any) {
            delete this._updSubscribers[subscriberId];
        }
        if (insert || any) {
            delete this._insSubscribers[subscriberId];
        }
        if (del || any) {
            delete this._delSubscribers[subscriberId];
        }
    }

    // -------------------------------------------------------------------------
    // Iteration
    // -------------------------------------------------------------------------

    /**
     * Iterate over BagNodes.
     */
    [Symbol.iterator]() {
        return this._nodes[Symbol.iterator]();
    }

    /**
     * Return node labels in order.
     *
     * @returns {string[]} Array of labels.
     */
    keys() {
        return this._nodes.keys();
    }

    /**
     * Return node values in order.
     *
     * @returns {Array} Array of values.
     */
    values() {
        return this._nodes.values();
    }

    /**
     * Return key/value objects in node order, resolving values as needed.
     *
     * @returns {Array<{key: string, value: *}>} Array of key/value objects.
     */
    items() {
        return [...this._nodes].map(node => ({key: node.label, value: node.getValue()}));
    }

    // -------------------------------------------------------------------------
    // Node Access Methods
    // -------------------------------------------------------------------------

    /**
     * Property alias for getNodes().
     *
     * @returns {BagNode[]} List of BagNodes.
     */
    get nodes() {
        return this.getNodes();
    }

    /**
     * Get a first-level node by label or index.
     *
     * Sync method for quick access to direct child nodes.
     * Does not traverse paths or trigger resolvers.
     *
     * @param {string|number} key - Node label (str) or index (int).
     * @returns {BagNode|null} The BagNode if found, null otherwise.
     *
     * @example
     * bag.node('a').value  // 1
     * bag.node(0).label    // 'a'
     */
    node(key) {
        return this._nodes.get(key);
    }

    /**
     * Set attributes on a node at the given path.
     *
     * @param {string|null} [path=null] - Path to the node.
     * @param {Object|null} [attr=null] - Dict of attributes to set.
     * @param {boolean} [removeNullAttributes=true] - If true, remove attributes with null value.
     */
    setAttr(path = null, attr = null, removeNullAttributes = true) {
        // Use the native signature: compatibility subclasses may repurpose
        // getNode's second argument as a reserved legacy slot.
        const node = Bag.prototype.getNode.call(this, path, true, true);
        if (node) {
            node.setAttr(attr, true, true, removeNullAttributes);
        }
    }

    /**
     * Get an attribute from a node at the given path.
     *
     * @param {string|null} [path=null] - Path to the node.
     * @param {string|null} [attr=null] - Attribute name to get.
     * @param {*} [defaultVal=null] - Default value if node or attribute not found.
     * @returns {*} Attribute value or default.
     */
    getAttr(path = null, attr = null, defaultVal = null) {
        const node = this.getNode(path);
        if (node) {
            return node.getAttr(attr, defaultVal);
        }
        return defaultVal;
    }

    /**
     * Delete attributes from a node at the given path.
     *
     * @param {string|null} [path=null] - Path to the node.
     * @param {...string} attrs - Attribute names to delete.
     */
    delAttr(path = null, ...attrs) {
        const node = this.getNode(path);
        if (node) {
            node.delAttr(...attrs);
        }
    }

    /**
     * Get inherited attributes from parent chain.
     *
     * @returns {Object} Dict of attributes inherited from parent nodes.
     */
    getInheritedAttributes() {
        if (this._parentNode) {
            return this._parentNode.getInheritedAttributes();
        }
        return {};
    }

    // -------------------------------------------------------------------------
    // Query Methods (BagQuery)
    // -------------------------------------------------------------------------

    /**
     * Get the actual list of nodes contained in the Bag.
     *
     * The getNodes method works as the filter of a list.
     *
     * @param {Function|null} [condition=null] - Optional callable that takes a BagNode and returns bool.
     * Returns a new list of shared nodes. List mutations do not change the Bag;
     * node mutations do. Later structural changes are not reflected in the list.
     * @returns {BagNode[]} Snapshot of BagNodes, optionally filtered by condition.
     */
    getNodes(condition = null) {
        if (!condition) {
            return [...this._nodes];
        }
        return [...this._nodes].filter(n => condition(n));
    }

    /**
     * Return the first BagNode whose value contains key=value.
     *
     * Searches only direct children (not recursive).
     * The node's value must be dict-like (Bag or dict).
     *
     * @param {string} key - Key to look for in node.value.
     * @param {*} value - Value to match.
     * @returns {BagNode|null} BagNode if found, null otherwise.
     */
    getNodeByValue(key, value) {
        for (const node of this._nodes) {
            const nodeValue = node.value;
            if (nodeValue instanceof Bag) {
                if (nodeValue.getItem(key) === value) return node;
            } else if (nodeValue && nodeValue.get && nodeValue.get(key) === value) {
                return node;
            }
        }
        return null;
    }

    /**
     * Return the first BagNode with the requested attribute value.
     *
     * Search strategy (hybrid depth-first with level priority):
     * 1. First checks all direct children of current Bag
     * 2. Then recursively searches into sub-Bags (depth-first)
     *
     * This means a match at the current level is always found before
     * descending into nested Bags, but once descent begins, it proceeds
     * depth-first through the subtree before checking siblings.
     *
     * @param {string} attr - Attribute name to search.
     * @param {*} value - Attribute value; undefined searches for presence.
     * @param {boolean} [caseInsensitive=false] - Compare strings ignoring case.
     * @param {boolean} [deep_first=false] - Visit subtrees before next siblings.
     * @returns {BagNode|null} BagNode if found, null otherwise.
     */
    getNodeByAttr(attr, value, caseInsensitive = false, deep_first = false) {
        const existsOnly = value === undefined;
        const expected = caseInsensitive && typeof value === 'string' ? value.toLowerCase() : value;
        const search = bag => {
            const subBags = [];
            for (const node of bag._nodes) {
                if (attr in node.attr) {
                    const current = caseInsensitive && typeof node.attr[attr] === 'string'
                        ? node.attr[attr].toLowerCase() : node.attr[attr];
                    if (existsOnly || current == expected) return node;
                }
                if (node._value instanceof Bag) {
                    if (deep_first) {
                        const found = search(node._value);
                        if (found) return found;
                    } else {
                        subBags.push(node._value);
                    }
                }
            }
            for (const child of subBags) {
                const found = search(child);
                if (found) return found;
            }
            return null;
        };
        return search(this);
    }

    /**
     * Check if the Bag is empty.
     *
     * A node is considered non-empty if:
     * - It has a resolver (even if static value is null, the resolver
     *   represents potential content that can be loaded)
     * - It has a non-null static value (unless zeroIsNone/blankIsNone apply)
     *
     * This method never triggers resolver I/O - it only checks static values
     * and resolver presence.
     *
     * @param {boolean} [zeroIsNone=false] - If true, treat 0 values as empty.
     * @param {boolean} [blankIsNone=false] - If true, treat blank strings as empty.
     * @returns {boolean} True if Bag is empty according to criteria, false otherwise.
     */
    isEmpty(zeroIsNone = false, blankIsNone = false) {
        if (this._nodes.length === 0) {
            return true;
        }

        for (const node of this._nodes) {
            // A node with a resolver is not empty (has potential content)
            if (node._resolver !== null) {
                return false;
            }
            const v = node.getValue(true);  // static=true
            if (v === null || v === undefined) {
                continue;
            }
            if (zeroIsNone && v === 0) {
                continue;
            }
            if (blankIsNone && v === '') {
                continue;
            }
            return false;
        }

        return true;
    }

    /**
     * Query Bag elements, extracting specified data.
     *
     * @param {string|Array|null} [what=null] - String of special keys separated by comma, or array of keys.
     *     Special keys:
     *     - '#k': label of each item
     *     - '#v': value of each item
     *     - '#v.path': inner values of each item
     *     - '#__v': static value (always bypasses resolver)
     *     - '#a': all attributes of each item
     *     - '#a.attrname': specific attribute for each item
     *     - '#p': path (full path from root, useful with deep=true)
     *     - '#n': node (the BagNode itself)
     *     - callable: custom function applied to each node
     * @param {Function|boolean|null} [condition=null] - Optional callable filter (receives BagNode, returns bool).
     * A boolean is the deprecated legacy asColumns argument and emits a warning.
     * @param {boolean} [iter=false] - If true, return a generator instead of an array.
     * @param {boolean} [deep=false] - If true, traverse recursively (depth-first) instead of first level only.
     * @param {boolean} [leaf=true] - If true (default), include leaf nodes (non-Bag values).
     * @param {boolean} [branch=true] - If true (default), include branch nodes (Bag values).
     * @param {number|null} [limit=null] - Maximum number of results to return. null means no limit.
     * @param {boolean} [isStatic=true] - If true (default), don't trigger resolvers during traversal.
     * @returns {Array|Generator} Array of tuples, or generator if iter=true.
     */
    query(what = null, condition = null, iter = false, deep = false, leaf = true, branch = true, limit = null, isStatic = true) {
        if (!what) {
            what = '#k,#v,#a';
        }

        let obj = this;
        let whatsplit;

        if (typeof what === 'string') {
            if (what.includes(':')) {
                const [where, whatPart] = what.split(':');
                obj = this.getItem(where);
                what = whatPart;
            }
            whatsplit = what.split(',').map(x => x.trim());
        } else {
            whatsplit = what;
        }

        const _extractValue = (node, w, path, isDeep, readValue) => {
            if (w === '#k') {
                return node.label;
            } else if (w === '#p') {
                return path;
            } else if (w === '#n') {
                return node;
            } else if (typeof w === 'function') {
                return w(node);
            } else if (w === '#v') {
                const v = readValue();
                // With deep=true, Bag values return null (content comes in later iterations)
                return isDeep && v instanceof Bag ? null : v;
            } else if (w.startsWith('#v.')) {
                const innerPath = w.split('.').slice(1).join('.');
                const value = readValue();
                return value && value.getItem ? value.getItem(innerPath) : null;
            } else if (w === '#__v') {
                return node.getValue(true);  // Always static
            } else if (w.startsWith('#a')) {
                const attr = w.includes('.') ? w.split('.').slice(1).join('.') : null;
                return node.getAttr(attr);
            } else {
                const value = readValue();
                return value && value.getItem ? value.getItem(w) : null;
            }
        };

        function* _iterDigest() {
            let count = 0;
            function* visit(bag, prefix) {
                for (const node of bag._nodes) {
                    const path = prefix ? `${prefix}.${node.label}` : node.label;
                    // Per-visit state, independent of the resolver's own cache.
                    let loaded = false;
                    let value;
                    const readValue = () => {
                        if (!loaded) {
                            value = node.getValue(isStatic);
                            loaded = true;
                        }
                        return value;
                    };
                    const included = (leaf && branch) ||
                        (readValue() instanceof Bag ? branch : leaf);
                    if (included && (condition === null || condition(node))) {
                        yield whatsplit.length === 1
                            ? _extractValue(node, whatsplit[0], path, deep, readValue)
                            : whatsplit.map(w => _extractValue(node, w, path, deep, readValue));
                        count++;
                        if (limit !== null && count >= limit) return;
                    }
                    if (deep) {
                        const child = readValue();
                        if (child instanceof Bag) {
                            yield* visit(child, path);
                            if (limit !== null && count >= limit) return;
                        }
                    }
                }
            }
            yield* visit(obj, '');
        }

        if (iter) {
            return _iterDigest();
        }

        return [..._iterDigest()];
    }

    /**
     * Return [relative path, value] pairs for non-Bag leaves.
     * Resolve each node once per occurrence. Empty Bags produce no leaf entry.
     * Paths do not require parent backrefs.
     */
    getLeaves() {
        const result = [];
        const collect = (bag, prefix) => {
            for (const node of bag._nodes) {
                const path = prefix ? `${prefix}.${node.label}` : node.label;
                const value = node.getValue(false);
                if (value instanceof Bag) collect(value, path);
                else result.push([path, value]);
            }
        };
        collect(this, '');
        return result;
    }

    /**
     * Return a list of tuples with keys/values/attributes (backward compatible).
     *
     * This is an alias for query() with iter=false, deep=false for backward
     * compatibility. Use query() for new code.
     *
     * @param {string|Array|null} [what=null] - String of special keys separated by comma, or array of keys.
     * @param {Function|boolean|null} [condition=null] - Optional callable filter (receives BagNode, returns bool).
     * A boolean is the deprecated legacy asColumns argument and emits a warning.
     * @param {boolean} [asColumns=false] - If true, return array of arrays (transposed).
     * @returns {Array} Array of tuples (or array of arrays if asColumns=true).
     */
    digest(what = null, condition = null, asColumns = false) {
        if (typeof condition === 'boolean') {
            console.warn('Bag.digest(what, asColumns) is deprecated; use digest(what, null, asColumns).');
            asColumns = condition;
            condition = null;
        }
        const result = this.query(what, condition, false, false, true, true, null, false);

        if (asColumns) {
            if (!result || result.length === 0) {
                const whatStr = typeof what === 'string' ? what : '#k,#v,#a';
                const whatsplit = whatStr.split(',').map(x => x.trim());
                return whatsplit.map(() => []);
            }
            const resultList = [...result];
            if (resultList.length && Array.isArray(resultList[0])) {
                // Transpose: list of rows → list of columns
                const numCols = resultList[0].length;
                const columns = [];
                for (let i = 0; i < numCols; i++) {
                    columns.push(resultList.map(row => row[i]));
                }
                return columns;
            }
            return [resultList];
        }
        return [...result];
    }

    /**
     * Return digest result as columns.
     *
     * @param {string|Array} cols - Column names as comma-separated string or array.
     * @param {boolean} [attrMode=false] - If true, prefix columns with '#a.' for attribute access.
     * @returns {Array} Array of arrays (columns).
     */
    columns(cols, attrMode = false) {
        if (typeof cols === 'string') {
            cols = cols.split(',');
        }
        const mode = attrMode ? '#a.' : '';
        const what = cols.map(col => `${mode}${col}`).join(',');
        return this.digest(what, null, true);
    }

    /**
     * Sum selected values at the current level; never traverse recursively.
     * @param {string} [what='#v'] - Query criterion, or comma-separated criteria.
     * @param {boolean} [strict=false] - Return null for null/undefined/empty string.
     * Otherwise these values contribute zero. Non-numeric values are ignored
     * unless strict, which raises TypeError. Zero and false remain valid.
     * @param {Function|null} [condition=null] - Optional BagNode predicate.
     * @returns {number|null|Array} One result, or one result per criterion.
     */
    sum(what = '#v', strict = false, condition = null) {
        if (strict != null && typeof strict !== 'boolean') {
            throw new TypeError('sum strict must be a boolean; pass condition as the third argument');
        }
        if (condition != null && typeof condition !== 'function') {
            throw new TypeError('sum condition must be callable; deep is no longer supported');
        }
        const total = criterion => {
            let result = 0;
            let missing = false;
            for (const value of this.query(criterion, condition)) {
                if (value == null || value === '') {
                    missing = true;
                    continue;
                }
                if (typeof value !== 'number' && typeof value !== 'boolean') {
                    if (strict) throw new TypeError(`sum encountered non-numeric value: ${typeof value}`);
                    continue;
                }
                result += value;
            }
            return strict && missing ? null : result;
        };
        return what.includes(',') ? what.split(',').map(w => total(w.trim())) : total(what);
    }

    /**
     * Sort nodes in place.
     *
     * @param {string|Function} [key='#k:a'] - Sort specification string or callable.
     *     If callable, used directly as key function for sort.
     *     If string, format is 'criterion:mode' or multiple 'c1:m1,c2:m2'.
     *
     *     Criteria:
     *     - '#k': sort by label
     *     - '#v': sort by value
     *     - '#a.attrname': sort by attribute
     *     - 'fieldname': sort by field in value (if value is dict/Bag)
     *
     *     Modes:
     *     - 'a': ascending, case-insensitive (default)
     *     - 'A': ascending, case-sensitive
     *     - 'd': descending, case-insensitive
     *     - 'D': descending, case-sensitive
     *
     * @returns {Bag} Self (for chaining).
     *
     * @example
     * bag.sort('#k')           // by label ascending
     * bag.sort('#k:d')         // by label descending
     * bag.sort('#v:A')         // by value ascending, case-sensitive
     * bag.sort('#a.name:a')    // by attribute 'name'
     * bag.sort('field:d')      // by field in value
     * bag.sort('#k:a,#v:d')    // multi-level sort
     * bag.sort(n => n.value)   // custom key function
     */
    sort(key = '#k:a') {
        /**
         * Create sort key handling null/undefined and case sensitivity.
         * @param {*} value - The value to create key for.
         * @param {boolean} caseInsensitive - Whether to ignore case for strings.
         * @returns {Array} Tuple [priority, value] where priority -1 means null (sort first ascending).
         */
        const sortKey = (value, caseInsensitive) => {
            if (value === null || value === undefined) {
                return [-1, ''];  // null/undefined first ascending, last descending
            }
            if (caseInsensitive && typeof value === 'string') {
                return [0, value.toLowerCase()];
            }
            return [0, value];
        };

        /**
         * Compare two sort keys.
         * @param {Array} a - First sort key [priority, value].
         * @param {Array} b - Second sort key [priority, value].
         * @returns {number} Comparison result for Array.sort.
         */
        const compareKeys = (a, b) => {
            // First compare by priority (nulls first ascending)
            if (a[0] !== b[0]) {
                return a[0] - b[0];
            }
            // Then compare by value
            if (a[1] < b[1]) return -1;
            if (a[1] > b[1]) return 1;
            return 0;
        };

        if (typeof key === 'function') {
            this._nodes._list.sort((a, b) => {
                const ka = key(a);
                const kb = key(b);
                if (ka < kb) return -1;
                if (ka > kb) return 1;
                return 0;
            });
        } else {
            const levels = key.split(',');
            levels.reverse();  // process in reverse for stable multi-level sort
            for (const level of levels) {
                let what, mode;
                if (level.includes(':')) {
                    [what, mode] = level.split(':', 2);
                } else {
                    what = level;
                    mode = 'a';
                }
                what = what.trim();
                mode = mode.trim();

                const reverse = mode === 'd' || mode === 'D';
                const caseInsensitive = mode === 'a' || mode === 'd';

                let keyFn;
                if (what.toLowerCase() === '#k') {
                    keyFn = n => sortKey(n.label, caseInsensitive);
                } else if (what.toLowerCase() === '#v') {
                    keyFn = n => sortKey(n.value, caseInsensitive);
                } else if (what.toLowerCase().startsWith('#a.')) {
                    const attrname = what.slice(3);
                    keyFn = n => sortKey(n.getAttr(attrname), caseInsensitive);
                } else {
                    // Sort by field in value
                    keyFn = n => {
                        const value = n.value;
                        const field = value instanceof Bag ? value.getItem(what) :
                            (value ? value[what] : null);
                        return sortKey(field, caseInsensitive);
                    };
                }

                this._nodes._list.sort((a, b) => {
                    const result = compareKeys(keyFn(a), keyFn(b));
                    return reverse ? -result : result;
                });
            }
        }
        return this;
    }

    /**
     * Check equality with another Bag.
     *
     * @param {Bag} other - Bag to compare with.
     * @returns {boolean} True if both Bags have same nodes with same values and attributes.
     */
    equalTo(other) {
        if (!(other instanceof Bag)) return false;
        return this._nodes.isEqual(other._nodes);
    }

    /**
     * Check if a path or node exists in the Bag.
     *
     * Equivalent to Python's `__contains__` / `in` operator.
     *
     * With the `?attr` query syntax it checks the existence of the named
     * attribute on the target node; `?a&b` requires every named attribute
     * to be present. The check is static: it does not trigger resolvers
     * along the path.
     *
     * @param {string|BagNode} what - Path to check, optionally with a
     *   `?attr` or `?a&b` suffix, or a BagNode to check if it's in this Bag.
     * @returns {boolean} True if the path/node (and named attributes if
     *   provided) exists, false otherwise.
     *
     * @example
     * bag.setItem('a.b', 1);
     * bag.has('a.b')          // true
     * bag.has('a.c')          // false
     * bag.has('a.b?color')    // true if node a.b has attribute 'color'
     * bag.has('a.b?x&y')      // true only if both 'x' and 'y' are present
     */
    has(what) {
        if (typeof what === 'string') {
            let queryString = null;
            if (what.includes('?')) {
                [what, queryString] = what.split('?', 2);
            }
            const node = this.getNode(what);
            if (node === null) {
                return false;
            }
            if (queryString === null) {
                return true;
            }
            return queryString.split('&').every(a => a in node.attr);
        } else if (what && what.label !== undefined) {
            // Assume it's a BagNode-like object
            return [...this._nodes].includes(what);
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Resolver Methods
    // -------------------------------------------------------------------------

    /**
     * Get the resolver at the given path.
     *
     * @param {string} path - Path to the node.
     * @returns {*} The resolver, or null if path doesn't exist or has no resolver.
     */
    getResolver(path) {
        const node = this.getNode(path);
        return node ? node.resolver : null;
    }

    /**
     * Set a resolver at the given path.
     *
     * Creates the node if it doesn't exist, with value=null.
     *
     * @param {string} path - Path to the node.
     * @param {*} resolver - The resolver to set.
     */
    setResolver(path, resolver) {
        let node = this.getNode(path);
        if (!node) {
            this.setItem(path, null);
            node = this.getNode(path);
        }
        node.resolver = resolver;
    }

    /**
     * Set a callback resolver at the given path.
     *
     * Shortcut for creating a BagCbResolver and setting it on a node.
     *
     * @param {string} path - Path to the node.
     * @param {Function} callback - Callable that returns the value.
     * @param {Object} [options={}] - Options passed to BagCbResolver constructor.
     *     - cacheTime: Cache duration in ms (default 0, no cache).
     *     - readOnly: If true, value not saved in node (default false).
     */
    setCallbackItem(path, callback, options = {}) {
        const resolver = new BagCbResolver({ callback, ...options });
        this.setResolver(path, resolver);
    }

    // -------------------------------------------------------------------------
    // Structure Manipulation Methods
    // -------------------------------------------------------------------------

    /**
     * Move element(s) to a new position.
     *
     * @param {number|number[]} what - Index or list of indices to move.
     * @param {number} position - Target index position.
     * @param {boolean} [trigger=true] - If true, fire del/ins events.
     *
     * @example
     * bag.move(0, 2)      // move first element to position 2
     * bag.move([0, 2], 1) // move indices 0 and 2 to position 1
     */
    move(what, position, trigger = true) {
        this._nodes.move(what, position, trigger);
    }

    /**
     * Convert Bag to plain object (first level only).
     *
     * @param {boolean} [ascii=false] - If true, convert keys to ASCII.
     * @param {boolean} [lower=false] - If true, convert keys to lowercase.
     * @param {boolean} [recursive=false] - Convert nested Bags (not ordinary objects/arrays).
     * @param {boolean} [excludeNullValues=false] - Omit null/undefined, retaining empty Bags.
     * @returns {Object} Plain JavaScript object with key-value pairs.
     */
    asDict(ascii = false, lower = false, recursive = false, excludeNullValues = false) {
        const result = {};
        for (const el of this._nodes) {
            let value = el.value;
            if (excludeNullValues && value == null) continue;
            let key = el.label;
            if (ascii) {
                key = String(key);
            }
            if (lower) {
                key = key.toLowerCase();
            }
            if (recursive && value instanceof Bag) {
                value = Bag.prototype.asDict.call(value, ascii, lower, recursive, excludeNullValues);
            }
            Object.defineProperty(result, key, {
                value, enumerable: true, writable: true, configurable: true
            });
        }
        return result;
    }

    /**
     * Return value at path, setting it to default if not present.
     *
     * @param {string} path - Path to the value.
     * @param {*} [defaultVal=null] - Default value to set if path doesn't exist.
     * @returns {*} The value at path (existing or newly set default).
     */
    setdefault(path, defaultVal = null) {
        const node = this.getNode(path);
        if (!node) {
            this.setItem(path, defaultVal);
            return defaultVal;
        }
        return node.value;
    }

    /**
     * Return a deep copy of this Bag.
     *
     * Creates a new Bag with copies of all nodes. Nested Bags are
     * recursively deep copied. Values are copied by reference unless
     * they are Bags. Node attributes are copied as a new dict.
     *
     * @param {boolean} [resolve=false] - Resolve values before copying.
     * @returns {Bag} A new Bag with copied nodes.
     *
     * @example
     * const copy = bag.deepcopy();
     * copy.setItem('b.c', 3);
     * // Original bag['b.c'] unchanged
     */
    deepcopy(resolve = false) {
        const result = this.createChildBag();
        for (const node of this._nodes) {
            let value = node.getValue(!resolve);
            if (value instanceof Bag) value = value.deepcopy(resolve);
            const copied = new result.nodeClass(result, node.label, value);
            copied.setAttr({...node.attr}, false, false, false);
            copied.nodeTag = node.nodeTag;
            copied.xmlTag = node.xmlTag;
            // Insert by position so repeated labels do not overwrite each other.
            result._nodes._list.push(copied);
            result._nodes._dict[copied.label] = copied;
        }
        return result;
    }

    /**
     * Merge a Bag or object using the legacy JavaScript argument order.
     *
     * @param {Bag|Object} source - Incoming nodes or key/value properties.
     * @param {string|null} [mode=null] - 'static' preserves source resolvers;
     * otherwise their values are resolved before copying.
     * @param {*} [reason=null] - Modification reason passed to subscribers.
     * @param {boolean} [ignoreNone=false] - Optional extension: preserve existing
     * values when the incoming value is null. It is not the mode argument.
     */
    update(source, mode = null, reason = null, ignoreNone = false) {
        if (!(source instanceof Bag)) {
            for (const label in source) {
                const value = source[label];
                if (!ignoreNone || value !== null || !this._nodes.has(label)) {
                    this.setItem(label, value, null, '>', false, false,
                        reason, false, reason !== false);
                }
            }
            return;
        }
        for (const incoming of [...source]) {
            const label = incoming.label;
            const resolver = mode === 'static' ? incoming.resolver : null;
            const value = resolver ? null : incoming.getValue();
            const replaceContent = incoming.attr.__replace;
            delete incoming.attr.__replace;
            const current = this._nodes.get(label);
            if (current) {
                current.setAttr(incoming.attr, reason === null ? true : reason, true, false);
                if (incoming.nodeTag != null) current.nodeTag = incoming.nodeTag;
                if (incoming.xmlTag != null) current.xmlTag = incoming.xmlTag;
                if (resolver) {
                    current.resolver = resolver;
                    current.setValue(null, reason === null ? true : reason,
                        null, null, false, reason);
                } else {
                    if (incoming.resolver) current.resolver = null;
                    const previous = current.getValue();
                    if (value instanceof Bag && previous instanceof Bag && !replaceContent) {
                        previous.update(value, mode, reason, ignoreNone);
                    } else if (!ignoreNone || value !== null) {
                        current.setValue(value, reason === null ? true : reason,
                            null, null, false, reason);
                    }
                }
            } else {
                const node = this.setItem(label, resolver || value, incoming.attr,
                    '>', false, false, reason, false, reason !== false);
                node.nodeTag = incoming.nodeTag;
                node.xmlTag = incoming.xmlTag;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Construction and Filling Methods
    // -------------------------------------------------------------------------

    /**
     * Copy nodes from another Bag.
     *
     * Clears current contents and copies all nodes from the source Bag.
     * Nested Bags are deep copied.
     *
     * @param {Bag} other - Source Bag to copy from.
     * @private
     */
    _fillFromBag(other) {
        this.clear();
        for (const node of other) {
            const copied = new this.nodeClass(this, node.label);
            copied.replace(node);
            copied.nodeTag = node.nodeTag;
            copied.xmlTag = node.xmlTag;
            this._nodes._list.push(copied);
            this._nodes._dict[copied.label] = copied;
        }
    }

    /**
     * Populate bag from a plain object (dictionary).
     *
     * Clears current contents and creates nodes from object properties.
     * Nested objects are converted to nested Bags.
     *
     * @param {Object} data - Object where keys become labels and values become node values.
     * @private
     */
    _fillFromDict(data) {
        this.clear();
        for (const [key, value] of Object.entries(data)) {
            if (value !== null && typeof value === 'object' && !Array.isArray(value)
                    && !(value instanceof Bag) && !(value instanceof BagNode)) {
                this.setItem(key, this.createChildBag()._loadSource(value));
            } else {
                this.setItem(key, value);
            }
        }
    }

    /**
     * Fill this Bag from a source (another Bag or plain object).
     *
     * Prepares replacement contents before changing this Bag:
     * - If source is null/undefined: no-op
     * - If source is a Bag: copies all nodes (deep copy for nested Bags)
     * - If source is a plain object: keys become labels, values become node values.
     *   Nested objects are recursively converted to Bags.
     *
     * Preparation errors leave this Bag unchanged. Attached Bags emit one
     * upd_value event after replacement, carrying the previous content.
     * Listener exceptions propagate after the replacement has committed.
     *
     * @param {Bag|Object|null} source - Source to fill from.
     * @returns {Bag} This Bag (for chaining).
     *
     * @example
     * const bag = new Bag();
     * bag.replace(new Bag({ a: 1, b: { c: 2 } }));
     * // bag has 'a' = 1, 'b' = Bag with 'c' = 2
     *
     * const other = new Bag();
     * other.setItem('x', 10);
     * bag.replace(other);
     * // bag now has only 'x' = 10
     */
    _loadSource(source) {
        if (source == null) return this;
        const prepared = this.createChildBag();
        if (source instanceof Bag) {
            prepared._fillFromBag(source);
        } else if (typeof source === 'object' && !Array.isArray(source)) {
            prepared._fillFromDict(source);
        } else {
            return this;
        }
        return this._replacePrepared(prepared);
    }

    /** Replace all contents from a Bag, preserving identity. Returns this. */
    replace(other) {
        if (!(other instanceof Bag)) throw new TypeError('Bag.replace expects a Bag');
        if (other === this) return this;
        const prepared = this.createChildBag();
        prepared._fillFromBag(other);
        return this._replacePrepared(prepared);
    }

    _replacePrepared(prepared) {
        // Preparation must finish before touching the destination, including
        // when the source is this Bag. Keep the previous content as a snapshot.
        for (const node of this._nodes) {
            node.parentBag = null;
            const value = node.getValue(true);
            if (value instanceof Bag) value.clearBackref();
        }
        const oldNodes = this._nodes;
        this._nodes = prepared._nodes;
        prepared._nodes = oldNodes;
        this._nodes._parentBag = this.backref ? this : null;
        prepared._nodes._parentBag = null;
        for (const node of this._nodes) node.parentBag = this;
        for (const node of prepared._nodes) node._parentBag = prepared;

        if (this.backref && this.parent && this.parentNode) {
            this.parent._onNodeChanged(this.parentNode,
                [this.parentNode.label], 'upd_value', prepared);
        }
        return this;
    }

    /**
     * Visit direct nodes, or the full tree with deep=true.
     * Null/undefined descends; falsey non-null results skip children;
     * a truthy result stops the visit and is returned.
     * Callback receives (node, kwargs, siblingIndex).
     */
    forEach(callback, {static: isStatic = true, deep = false, kwargs = {}} = {}) {
        if (typeof callback !== 'function') throw new TypeError('forEach requires a callback');
        const visit = (bag, context) => {
            for (let index = 0; index < bag._nodes.length; index++) {
                const node = bag._nodes._list[index];
                const kw = {...context};
                if ('_pathlist' in context) kw._pathlist = [...context._pathlist, node.label];
                if ('_indexlist' in context) kw._indexlist = [...context._indexlist, index];
                const result = callback(node, kw, index);
                if (result) return result;
                if (result == null && deep) {
                    const value = node.getValue(isStatic);
                    if (value instanceof Bag) {
                        const innerResult = visit(value, kw);
                        if (innerResult) return innerResult;
                    }
                }
            }
            return null;
        };
        return visit(this, kwargs);
    }

    /**
     * Yield original nodes depth-first, parent before children.
     * Values are read statically: lazy resolvers are not invoked.
     * Shared subtrees are visited at each path, as in legacy Python.
     * @yields {BagNode}
     */
    *traverse() {
        for (const node of this._nodes) {
            yield node;
            const value = node.getValue(true);
            if (value instanceof Bag) {
                yield* value.traverse();
            }
        }
    }

    /** Stream path/node pairs for internal query and serialization use. */
    *_iterNodesWithPaths(isStatic = true, prefix = '') {
        for (const node of this._nodes) {
            const path = prefix ? `${prefix}.${node.label}` : node.label;
            yield [path, node];
            const value = node.getValue(isStatic);
            if (value instanceof Bag) yield* value._iterNodesWithPaths(isStatic, path);
        }
    }

    // -------------------------------------------------------------------------
    // TyTx Serialization
    // -------------------------------------------------------------------------

    /**
     * Flatten nodes into (parent, label, tag, value, attr) tuples for TyTx.
     *
     * @param {Object|null} [pathRegistry=null] - If provided, enable compact mode.
     * @yields {Array} Tuples of [parent, label, tag, value, attr].
     */
    *_nodeFlattener(pathRegistry = null) {
        const compact = pathRegistry !== null;
        const pathToCode = compact ? Object.create(null) : null;
        let codeCounter = 0;

        for (const [path, node] of serializationNodes(this)) {
            const lastDot = path.lastIndexOf('.');
            const parentPath = lastDot >= 0 ? path.slice(0, lastDot) : '';

            const nodeValue = node.getValue(true);

            // Value encoding
            let value;
            if (node.resolver) {
                value = encodeResolver(node.resolver);
            } else if (nodeValue instanceof Bag) {
                const cls = nodeValue.constructor;
                const suffix = cls.tytxSuffix;
                const registered = getRegisteredType(suffix);
                if (registered !== cls && !(suffix === 'X' && registered === Bag)) {
                    throw new BagSerializationError(`Unregistered Bag branch type: ${cls.name}`);
                }
                value = `::${suffix}`;
            } else if (nodeValue === null) {
                value = '::NN';
            } else {
                value = nodeValue;
            }

            const attr = encodeAttrs(node.attr);
            const tag = node.nodeTag;

            if (compact) {
                const parentRef = parentPath ? pathToCode[parentPath] : null;
                yield [parentRef, node.label, tag, value, attr];

                if (nodeValue instanceof Bag) {
                    pathToCode[path] = codeCounter;
                    pathRegistry[codeCounter] = path;
                    codeCounter++;
                }
            } else {
                // Use empty string for root level (matches Python behavior)
                yield [parentPath, node.label, tag, value, attr];
            }
        }
    }

    /**
     * Serialize Bag to TyTx format.
     *
     * Converts the Bag hierarchy into a flat list of row tuples,
     * then encodes using TyTx which preserves types (Decimal, Date, etc.).
     *
     * @param {string} [transport='json'] - Output format: 'json' or 'msgpack'.
     * @param {boolean} [compact=false] - If true, use numeric path codes.
     * @returns {string|Uint8Array} Serialized data.
     */
    toTytx(transport = 'json', compact = false) {
        let data;

        if (compact) {
            const paths = {};
            const rows = [...this._nodeFlattener(paths)];
            data = { rows, paths };
        } else {
            const rows = [...this._nodeFlattener(null)];
            data = { rows };
        }

        const tytxTransport = transport === 'json' ? null : transport;
        return tytxEncode(data, tytxTransport);
    }

    /**
     * Deserialize Bag from TyTx format.
     *
     * @param {string|Uint8Array} data - Serialized data from toTytx().
     * @param {string} [transport='json'] - Input format: 'json' or 'msgpack'.
     * @returns {Bag} Reconstructed Bag.
     */
    static fromTytx(data, transport = 'json') {
        // The registry passes an empty payload for a structural branch marker.
        if (data === '') return new this();
        const parsed = tytxDecode(data, transport === 'json' ? null : transport);
        if (!parsed || !Array.isArray(parsed.rows)) {
            throw new BagSerializationError('Invalid TYTX Bag: expected rows');
        }
        const paths = parsed.paths;
        const compact = paths != null;
        const bag = new this();
        const pathToBag = new Map([['', bag]]);

        for (const row of parsed.rows) {
            if (!Array.isArray(row) || row.length !== 5) {
                throw new BagSerializationError('Invalid TYTX Bag row');
            }
            const [parentRef, label, tag, rawValue, rawAttr] = row;
            let parentPath = parentRef ?? '';
            if (compact) {
                if (parentRef !== null && !Object.hasOwn(paths, parentRef)) {
                    throw new BagSerializationError(`Unknown TYTX parent reference: ${parentRef}`);
                }
                parentPath = parentRef === null ? '' : paths[parentRef];
            }
            if (!pathToBag.has(parentPath)) {
                throw new BagSerializationError(`Missing or undecodable TYTX parent branch: ${parentPath}`);
            }
            const parentBag = pathToBag.get(parentPath);
            const fullPath = parentPath ? `${parentPath}.${label}` : label;
            let value = rawValue;
            // MessagePack does not rescan text. Only Bag-owned empty markers
            // are structural: arbitrary scalar decoders must never run here.
            if (transport === 'msgpack' && typeof value === 'string' && value.startsWith('::')) {
                const cls = getRegisteredType(value.slice(2));
                if (cls === Bag || cls?.prototype instanceof Bag) value = tytxDecode(value);
            }
            const resolver = decodeResolver(value);
            if (value instanceof Bag) {
                let cls = value.constructor;
                if (cls.tytxSuffix === 'X' && this.tytxSuffix === 'X') cls = this;
                value = new cls();
                pathToBag.set(fullPath, value);
            } else if (value === '::NN') {
                value = null;
            }
            const node = parentBag.setItem(label, resolver || value, decodeAttrs(rawAttr));
            node.nodeTag = tag ?? null;
        }
        return bag;
    }

    // -------------------------------------------------------------------------
    // XML Serialization
    // -------------------------------------------------------------------------

    /**
     * Serialize Bag to XML format.
     *
     * All values are converted to strings without type information.
     * For type-preserving serialization, use toTytx() instead.
     *
     * @param {Object} [options={}] - Serialization options.
     * @param {boolean} [options.pretty=false] - If true, format with indentation.
     * @param {string} [options.encoding='UTF-8'] - XML encoding.
     * @param {boolean|string} [options.docHeader=null] - XML declaration.
     * @param {string[]} [options.selfClosedTags=null] - Tags to self-close when empty.
     * @returns {string} XML string.
     */
    toXml(options = {}) {
        const { pretty = false, encoding = 'UTF-8', docHeader = null, selfClosedTags = null } = options;

        let content = this._bagToXml(selfClosedTags, pretty);

        if (docHeader === true) {
            content = `<?xml version='1.0' encoding='${encoding}'?>\n${content}`;
        } else if (typeof docHeader === 'string') {
            content = `${docHeader}\n${content}`;
        }

        return content;
    }

    /**
     * Convert Bag to XML string (internal).
     * @private
     */
    _bagToXml(selfClosedTags = null, pretty = false, depth = 0) {
        const parts = [];
        for (const node of this._nodes) {
            parts.push((pretty ? '  '.repeat(depth) : '') +
                this._nodeToXml(node, selfClosedTags, pretty, depth));
        }
        return parts.join(pretty ? '\n' : '');
    }

    /**
     * Convert a BagNode to XML string (internal).
     * @private
     */
    _nodeToXml(node, selfClosedTags = null, pretty = false, depth = 0) {
        // Priority: xml_tag > node_tag > label (same as Python)
        const originalTag = node.xmlTag || node.nodeTag || node.label;
        const tag = this._sanitizeTag(originalTag);

        // Build attributes string
        const attrsParts = [];

        // If tag was sanitized, save original as _tag attribute
        if (tag !== originalTag) {
            attrsParts.push(`_tag="${this._escapeAttr(originalTag)}"`);
        }

        if (node.resolver) {
            attrsParts.push(`_resolver="${this._escapeAttr(encodeResolver(node.resolver))}"`);
        }
        if (node.attr) {
            for (const [k, v] of Object.entries(encodeAttrs(node.attr))) {
                if (v !== null && v !== false && v !== undefined) {
                    attrsParts.push(`${k}="${this._escapeAttr(String(v))}"`);
                }
            }
        }
        const attrsStr = attrsParts.length ? ' ' + attrsParts.join(' ') : '';

        // Handle value
        const value = node.resolver ? null : node.getValue(true);  // static=true

        // Check if value is a Bag
        if (value && typeof value._bagToXml === 'function') {
            // Never add whitespace inside a subtree that explicitly preserves it.
            pretty = pretty && node.attr?.['xml:space'] !== 'preserve';
            const inner = value._bagToXml(selfClosedTags, pretty, depth + 1);
            if (inner) {
                if (pretty) {
                    return `<${tag}${attrsStr}>\n${inner}\n${'  '.repeat(depth)}</${tag}>`;
                }
                return `<${tag}${attrsStr}>${inner}</${tag}>`;
            }
            // Empty Bag
            if (selfClosedTags === null || selfClosedTags.includes(tag)) {
                return `<${tag}${attrsStr}/>`;
            }
            return `<${tag}${attrsStr}></${tag}>`;
        }

        // Scalar value
        if (value === null || value === undefined || value === '') {
            if (selfClosedTags === null || selfClosedTags.includes(tag)) {
                return `<${tag}${attrsStr}/>`;
            }
            return `<${tag}${attrsStr}></${tag}>`;
        }

        const text = this._escapeXml(String(value));
        return `<${tag}${attrsStr}>${text}</${tag}>`;
    }

    /**
     * Sanitize tag name for XML.
     * @private
     */
    _sanitizeTag(tag) {
        if (!tag) return '_none_';
        // Replace invalid characters with underscore
        return tag.replace(/[^a-zA-Z0-9_\-.:]/g, '_');
    }

    /**
     * Escape XML text content.
     * @private
     */
    _escapeXml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Escape XML attribute value.
     * @private
     */
    _escapeAttr(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Deserialize Bag from XML format.
     *
     * @param {string} source - XML string to parse.
     * @param {Object} [options={}] - Parsing options.
     * @param {string} [options.tagAttribute=null] - If set, save XML tag name as this attribute on each node.
     * @returns {Bag} Reconstructed Bag hierarchy.
     */
    static fromXml(source, options = {}) {
        const { tagAttribute = null } = options;

        // Use DOMParser (browser) or @xmldom/xmldom (Node.js)
        let doc;
        if (typeof DOMParser !== 'undefined') {
            const parser = new DOMParser();
            doc = parser.parseFromString(source, 'application/xml');
            // Check for parse errors (browser-specific)
            const parseError = doc.querySelector('parsererror');
            if (parseError) {
                throw new Error(`XML parse error: ${parseError.textContent}`);
            }
        } else {
            // Node.js environment - use @xmldom/xmldom
            const parser = new XmlDOMParser();
            doc = parser.parseFromString(source, 'application/xml');
        }

        return this._xmlElementToBag(doc.documentElement, tagAttribute);
    }

    /**
     * Convert XML element to Bag (recursive).
     * @param {Element} element - XML element to convert.
     * @param {string|null} [tagAttribute=null] - If set, save tag name as this attribute.
     * @private
     */
    static _xmlElementToBag(element, tagAttribute = null) {
        const bag = new this();

        // Use childNodes and filter for element nodes (nodeType === 1)
        // This works both in browser and @xmldom/xmldom
        const childElements = Array.from(element.childNodes).filter(n => n.nodeType === 1);

        for (const child of childElements) {
            const originalXmlTag = child.tagName;
            const attr = {};

            // Collect attributes
            for (let i = 0; i < child.attributes.length; i++) {
                const attrNode = child.attributes[i];
                attr[attrNode.name] = attrNode.value;
            }

            const resolver = decodeResolver(attr._resolver);
            if (resolver) delete attr._resolver;
            const isBagValue = String(attr._T || '').toUpperCase() === 'BAG';
            Object.assign(attr, decodeAttrs(attr));

            // Resolve label: _tag attribute > tagAttribute > XML tag name
            let label = originalXmlTag;
            if ('_tag' in attr) {
                label = attr._tag;
                delete attr._tag;
            }
            if (tagAttribute && tagAttribute in attr) {
                label = attr[tagAttribute];
                delete attr[tagAttribute];
            }

            // Repeated XML elements must not replace earlier siblings.
            // Keep their original tag separately for serialization.
            const requestedLabel = label;
            let suffix = 1;
            while (bag.getNode(label)) {
                label = `${requestedLabel}_${suffix++}`;
            }

            // Check if has child elements (nested Bag)
            const childChildElements = Array.from(child.childNodes).filter(n => n.nodeType === 1);
            let node;
            if (childChildElements.length > 0 || isBagValue) {
                const childBag = this._xmlElementToBag(child, tagAttribute);
                node = bag.setItem(label, childBag, Object.keys(attr).length > 0 ? attr : null);
            } else {
                // Text content
                const value = child.textContent || '';
                node = bag.setItem(label, value, Object.keys(attr).length > 0 ? attr : null);
            }

            if (resolver) node.resolver = resolver;
            // Save original XML tag for round-trip serialization
            node.xmlTag = originalXmlTag;
        }

        return bag;
    }

    /**
     * Load Bag from URL. Auto-detects format from content-type.
     *
     * @param {string} url - HTTP/HTTPS URL to fetch.
     * @param {Object} [options={}] - Fetch options.
     * @param {number} [options.timeout=30] - Timeout in seconds.
     * @returns {Promise<Bag>} Parsed content as Bag.
     */
    static async fromUrl(url, options = {}) {
        const { timeout = 30 } = options;
        const fetchOptions = {};
        if (timeout) {
            fetchOptions.signal = AbortSignal.timeout(timeout * 1000);
        }

        const response = await fetch(url, fetchOptions);
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        if (contentType.includes('json')) {
            return Bag.fromJson(text);
        }
        if (contentType.includes('xml')) {
            return Bag.fromXml(text);
        }
        // Try to auto-detect from content
        const trimmed = text.trim();
        if (trimmed.startsWith('<')) {
            return Bag.fromXml(text);
        }
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return Bag.fromJson(text);
        }
        throw new BagException(`Unsupported content-type: ${contentType}`);
    }

    // -------------------------------------------------------------------------
    // JSON Serialization
    // -------------------------------------------------------------------------

    /**
     * Serialize Bag to JSON string.
     *
     * Each node becomes {"label": ..., "value": ..., "attr": {...}}.
     * Nested Bags have value as a list of child nodes.
     *
     * @param {boolean} [typed=true] - If true, encode types for date/datetime/Decimal (TYTX).
     * @returns {string} JSON string representation.
     */
    toJson(typed = true) {
        const result = [];
        for (const node of this._nodes) {
            result.push(this._nodeToJsonDict(node, typed));
        }

        if (typed) {
            return tytxEncode(result);
        }
        return JSON.stringify(result);
    }

    /**
     * Convert a BagNode to JSON-serializable dict (internal).
     * @private
     */
    _nodeToJsonDict(node, typed) {
        let value = node.resolver ? null : node.getValue(true);  // static=true

        // Check if value is a Bag
        if (value && typeof value._nodeToJsonDict === 'function') {
            const childResult = [];
            for (const childNode of value._nodes) {
                childResult.push(value._nodeToJsonDict(childNode, typed));
            }
            value = childResult;
        }

        const result = { label: node.label, value, attr: encodeAttrs(node.attr) };
        if (node.nodeTag !== null) result.tag = node.nodeTag;
        if (node.resolver) result.resolver = encodeResolver(node.resolver);
        return result;
    }

    /**
     * Deserialize JSON to Bag.
     *
     * Accepts JSON string, dict, or list. Recursively converts nested
     * structures to Bag hierarchy.
     *
     * @param {string|Object|Array} source - JSON string, dict or list to parse.
     * @param {string} [listJoiner=null] - If provided, join string arrays with this separator.
     * @returns {Bag} Deserialized Bag.
     */
    static fromJson(source, listJoiner = null) {
        if (typeof source === 'string') {
            source = tytxDecode(source);
        }

        if (!Array.isArray(source) && typeof source !== 'object') {
            source = { value: source };
        }

        return Bag._fromJsonRecursive(source, listJoiner);
    }

    /**
     * Recursively convert JSON data to Bag (internal).
     * @private
     */
    static _fromJsonRecursive(data, listJoiner = null) {
        if (data instanceof Bag) return data;
        if (Array.isArray(data)) {
            // listJoiner: join string arrays into a single string
            if (listJoiner !== null && data.every(item => typeof item === 'string')) {
                return data.join(listJoiner);
            }

            if (data.length === 0) {
                return new Bag();
            }

            // Check if list items have 'label' key (Bag node format)
            if (typeof data[0] === 'object' && data[0] !== null && 'label' in data[0]) {
                const result = new Bag();
                for (const item of data) {
                    const label = item.label;
                    const value = Bag._fromJsonRecursive(item.value, listJoiner);
                    const attr = decodeAttrs(item.attr);
                    const node = result.setItem(label, value, attr);
                    node.nodeTag = item.tag ?? null;
                    const resolver = decodeResolver(item.resolver);
                    if (resolver) node.resolver = resolver;
                }
                return result;
            }

            // Generic list -> Bag with r_N keys
            const result = new Bag();
            for (let n = 0; n < data.length; n++) {
                result.setItem(`r_${n}`, Bag._fromJsonRecursive(data[n], listJoiner));
            }
            return result;
        }

        if (typeof data === 'object' && data !== null) {
            if (Object.keys(data).length === 0) {
                return new Bag();
            }
            const result = new Bag();
            for (const [k, v] of Object.entries(data)) {
                result.setItem(k, Bag._fromJsonRecursive(v, listJoiner));
            }
            return result;
        }

        // Scalar value
        return data;
    }

    // -------------------------------------------------------------------------
    // String representation
    // -------------------------------------------------------------------------

    /**
     * Return ASCII tree representation of bag contents.
     *
     * Produces a visual tree structure showing all nodes, their values,
     * and attributes. Handles nested Bags recursively and detects
     * circular references.
     *
     * @param {boolean} [isStatic=true] - If false, triggers resolvers to get current values.
     * @param {Map} [_visited=null] - Internal: tracks visited nodes for circular refs.
     * @param {string} [_prefix=''] - Internal: indentation prefix for nested bags.
     * @param {boolean} [_isLast=true] - Internal: whether this is the last sibling.
     * @returns {string} ASCII tree representation.
     *
     * @example
     * const bag = new Bag();
     * bag.setItem('user.age', 30);
     * bag.setItem('user.city', 'Rome');
     * console.log(bag.toStringTree());
     * // user
     * // ├── age: 30
     * // └── city: 'Rome'
     */
    toStringTree(isStatic = true, _visited = null, _prefix = '', _isLast = true) {
        if (_visited === null) {
            _visited = new Map();
        }

        const lines = [];
        const nodes = [...this._nodes];

        for (let idx = 0; idx < nodes.length; idx++) {
            const node = nodes[idx];
            const isLast = idx === nodes.length - 1;
            const value = node.getValue(isStatic);

            // Format attributes
            const attrs = node.getAttr();
            let attrStr = '';
            const attrKeys = Object.keys(attrs);
            if (attrKeys.length > 0) {
                const attrParts = attrKeys.map(k => `${k}=${JSON.stringify(attrs[k])}`);
                attrStr = ' [' + attrParts.join(', ') + ']';
            }

            // Tree characters
            const branch = isLast ? '└── ' : '├── ';
            const childPrefix = _prefix + (isLast ? '    ' : '│   ');

            if (value instanceof Bag) {
                const nodeId = node;  // Use node object as key
                const backref = value.backref ? '(*)' : '';

                if (_visited.has(nodeId)) {
                    lines.push(`${_prefix}${branch}${node.label}${backref}${attrStr} → (circular ref)`);
                } else {
                    _visited.set(nodeId, node.label);
                    lines.push(`${_prefix}${branch}${node.label}${backref}${attrStr}`);
                    const inner = value.toStringTree(isStatic, _visited, childPrefix, isLast);
                    if (inner) {
                        lines.push(inner);
                    }
                }
            } else {
                // Format value representation
                let valueStr;
                if (value === null) {
                    valueStr = 'null';
                } else if (value === undefined) {
                    valueStr = 'undefined';
                } else if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
                    const decoder = new TextDecoder('utf-8', { fatal: false });
                    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
                    valueStr = decoder.decode(bytes);
                } else if (typeof value === 'string') {
                    if (value.length > 50) {
                        valueStr = JSON.stringify(value.slice(0, 47) + '...');
                    } else {
                        valueStr = JSON.stringify(value);
                    }
                } else {
                    valueStr = String(value);
                }

                lines.push(`${_prefix}${branch}${node.label}: ${valueStr}${attrStr}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Return ASCII tree representation of bag contents.
     *
     * @param {boolean} [isStatic=true] - If false, trigger resolvers.
     * @param {Object} [_visited=null] - Internal: tracks visited nodes for circular refs.
     * @param {string} [_prefix=''] - Internal: indentation prefix.
     * @returns {string} ASCII tree string.
     */
    toString(isStatic = true, _visited = null, _prefix = '') {
        if (!_visited) {
            _visited = new Set();
        }

        const lines = [];
        const nodes = [...this._nodes];

        for (let idx = 0; idx < nodes.length; idx++) {
            const node = nodes[idx];
            const isLast = idx === nodes.length - 1;
            const value = node.getValue(isStatic);

            // Format attributes
            let attrStr = '';
            const attrs = node.attr;
            if (attrs && Object.keys(attrs).length > 0) {
                const parts = Object.entries(attrs).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
                attrStr = ` [${parts.join(', ')}]`;
            }

            // Tree characters
            const branch = isLast ? '└── ' : '├── ';
            const childPrefix = _prefix + (isLast ? '    ' : '│   ');

            if (value && typeof value._htraverse === 'function') {
                // Bag value
                const nodeId = node;
                if (_visited.has(nodeId)) {
                    lines.push(`${_prefix}${branch}${node.label}${attrStr} → (circular ref)`);
                } else {
                    _visited.add(nodeId);
                    lines.push(`${_prefix}${branch}${node.label}${attrStr}`);
                    const inner = value.toString(isStatic, _visited, childPrefix);
                    if (inner) {
                        lines.push(inner);
                    }
                }
            } else {
                // Scalar value
                let valueStr;
                if (value === null || value === undefined) {
                    valueStr = 'null';
                } else if (typeof value === 'string' && value.length > 50) {
                    valueStr = JSON.stringify(value.slice(0, 47) + '...');
                } else if (typeof value === 'string') {
                    valueStr = JSON.stringify(value);
                } else {
                    valueStr = String(value);
                }
                lines.push(`${_prefix}${branch}${node.label}: ${valueStr}${attrStr}`);
            }
        }

        return lines.join('\n');
    }
}

/**
 * Exception raised for Bag-specific errors.
 */
export class BagException extends Error {
    constructor(message) {
        super(message);
        this.name = 'BagException';
    }
}

// Register Bag class with BagResolver for asBag conversion (avoids circular import)
BagResolver.registerBagClass(Bag);

// Shared TYTX registry: subclasses register their own wire suffix explicitly.
registerClass(Bag);

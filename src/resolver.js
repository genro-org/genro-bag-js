// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

/**
 * BagResolver - Base class for lazy/dynamic value resolution.
 *
 * Resolvers provide deferred value computation for BagNodes. When a node
 * has a resolver, accessing its value triggers the resolver's load() method.
 *
 * Cache semantics (same as Python):
 *   - cacheTime > 0: cache for N seconds (TTL)
 *   - cacheTime = 0: never cache, always resolve
 *   - cacheTime < 0: cache forever (resolve once)
 *
 * Retry Policy:
 *   - retryPolicy = null -> NO retry (default)
 *   - retryPolicy = 'network' -> use predefined RETRY_POLICIES.network
 *   - retryPolicy = {...} -> custom policy object
 *
 * The load() method can return a value directly (sync) or a Promise (async).
 * The caller handles accordingly.
 */

/**
 * Predefined retry policies.
 */
export const RETRY_POLICIES = {
    network: {
        maxAttempts: 3,
        delay: 1.0,
        backoff: 2.0,
        jitter: true,
        on: ['TypeError', 'NetworkError', 'AbortError']
    },
    aggressive: {
        maxAttempts: 5,
        delay: 0.5,
        backoff: 2.0,
        jitter: true,
        on: ['Error']
    },
    gentle: {
        maxAttempts: 2,
        delay: 2.0,
        backoff: 1.5,
        jitter: false,
        on: ['TypeError', 'NetworkError']
    }
};

/**
 * Get retry policy from resolver, resolving string references.
 * @param {BagResolver} resolver
 * @returns {Object|null}
 */
function getRetryPolicy(resolver) {
    const policy = resolver._retryPolicy;
    if (policy === null || policy === undefined) {
        return null;
    }
    if (typeof policy === 'string') {
        return RETRY_POLICIES[policy] || null;
    }
    return policy;
}

/**
 * Check if error matches retry policy.
 * @param {Error} error
 * @param {Array<string>} errorTypes
 * @returns {boolean}
 */
function shouldRetry(error, errorTypes) {
    return errorTypes.some(type => {
        if (type === 'Error') return true;
        return error.name === type || error.constructor.name === type;
    });
}

/**
 * Sleep for specified milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute function with retry logic.
 * @param {Function} fn - Function to execute (can be async)
 * @param {Object} policy - Retry policy
 * @returns {*} Result of function
 */
async function withRetry(fn, policy) {
    if (!policy) {
        return fn();
    }

    const maxAttempts = policy.maxAttempts || 3;
    const delay = policy.delay || 1.0;
    const backoff = policy.backoff || 2.0;
    const jitter = policy.jitter !== false;
    const errorTypes = policy.on || ['Error'];

    let lastError = null;
    let currentDelay = delay * 1000; // Convert to ms

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const result = fn();
            if (result instanceof Promise) {
                return await result;
            }
            return result;
        } catch (error) {
            lastError = error;
            if (attempt < maxAttempts - 1 && shouldRetry(error, errorTypes)) {
                let sleepTime = currentDelay;
                if (jitter) {
                    sleepTime *= (1 + Math.random() * 0.1);
                }
                await sleep(sleepTime);
                currentDelay *= backoff;
            } else {
                throw error;
            }
        }
    }
    throw lastError;
}

export class BagResolver {
    /**
     * Default options for this resolver class.
     * Subclasses can override to change defaults.
     */
    static classKwargs = {
        cacheTime: 0,
        readOnly: false,
        asBag: null,
        retryPolicy: null
    };

    /**
     * Positional argument names for constructor.
     * Subclasses can override to accept positional args.
     */
    static classArgs = [];

    /**
     * Parameters that are internal (not passed to load()).
     */
    static internalParams = new Set(['cacheTime', 'readOnly', 'asBag', 'retryPolicy']);

    /**
     * Create a new resolver.
     *
     * @param {Object} kwargs - Configuration options merged with classKwargs.
     */
    constructor(kwargs = {}) {
        const defaults = this.constructor.classKwargs;
        const merged = { ...defaults, ...kwargs };

        // Extract internal params
        this.cacheTime = merged.cacheTime;
        this._readOnly = merged.readOnly;
        this._asBag = merged.asBag;
        this._retryPolicy = merged.retryPolicy;

        // Store non-internal params for load()
        this._kw = {};
        const internalParams = this.constructor.internalParams;
        for (const [key, value] of Object.entries(merged)) {
            if (!internalParams.has(key)) {
                this._kw[key] = value;
            }
        }

        // Cache state
        this._lastUpdate = null;
        this._node = null;
        this._lastEffectiveFingerprint = null;
        this._cachedValue = null;

        // Hook for subclasses
        this.init();
    }

    /**
     * Hook called at the end of constructor.
     * Override in subclasses for custom initialization.
     */
    init() {
        // Override in subclasses
    }

    /**
     * Set the parent node (called when resolver is attached to a node).
     *
     * @param {BagNode} node - The node this resolver is attached to.
     */
    setNode(node) {
        if (node !== this._node && !this.readOnly && this._lastUpdate !== null) {
            this.reset();
        }
        this._node = node;
        this.onSetResolver(node);
    }

    /**
     * Hook called when resolver is attached to a node.
     * Override in subclasses for custom initialization.
     *
     * @param {BagNode} node - The node this resolver is attached to.
     */
    onSetResolver(node) {
        // Override in subclasses
    }

    /**
     * Get the parent node.
     *
     * @returns {BagNode|null}
     */
    get node() {
        return this._node;
    }

    /**
     * Get cache time setting.
     *
     * @returns {number}
     */
    get cacheTime() {
        return this._cacheTime;
    }

    /**
     * Set cache time.
     *
     * @param {number} value
     */
    set cacheTime(value) {
        if (typeof value === 'boolean') {
            throw new TypeError('cacheTime must be numeric; use a negative value for infinite caching');
        }
        this._cacheTime = value;
    }

    /**
     * Check if resolver is read-only (value not stored in node).
     *
     * @returns {boolean}
     */
    get readOnly() {
        return this._readOnly;
    }

    /**
     * Check if cached value has expired.
     *
     * @returns {boolean}
     */
    get expired() {
        if (this._cacheTime < 0) {
            // Cache forever: expired only if never resolved
            return this._lastUpdate === null;
        }
        if (this._cacheTime === 0) {
            // Never cache: always expired
            return true;
        }
        // TTL cache
        if (this._lastUpdate === null) {
            return true;
        }
        const now = Date.now();
        const deltaSeconds = (now - this._lastUpdate) / 1000;
        return deltaSeconds > this._cacheTime;
    }

    /**
     * Reset the cache, forcing next resolve to call load().
     */
    reset() {
        this._lastUpdate = null;
        this._lastEffectiveFingerprint = null;
    }

    /**
     * Readonly caches live in the resolver; writable caches use the attached node.
     *
     * @returns {*} The cached value.
     */
    get cachedValue() {
        return !this.readOnly && this._node ? this._node._value : this._cachedValue;
    }

    /**
     * Set cached value in parent node or local storage.
     *
     * @param {*} value
     */
    set cachedValue(value) {
        if (!this.readOnly && this._node) {
            this._node.setValue(value, false);
        } else {
            this._cachedValue = value;
        }
    }

    /**
     * Compute fingerprint of effective parameters for cache invalidation.
     *
     * @param {Object} effectiveKw - The effective kwargs.
     * @returns {string} JSON string fingerprint.
     * @private
     */
    _computeEffectiveFingerprint(effectiveKw) {
        return JSON.stringify(Object.entries(effectiveKw).sort());
    }

    /**
     * Resolve the value. Main entry point.
     *
     * @param {Object} options - Resolution options.
     * @param {boolean} options.static - If true, return cached value without resolving.
     * @param {Object} options.kwargs - Additional kwargs merged with resolver's _kw.
     * @returns {*} The resolved value (or Promise if load() is async).
     */
    resolve(options = {}) {
        const { static: isStatic = false, ...callKwargs } = options;

        // Static mode: return cached value without resolving
        if (isStatic) {
            return this._node ? this._node._value : this.cachedValue;
        }

        // Build kwargs: resolver._kw merged with call kwargs
        // Node attributes can also contribute (priority: callKwargs > node.attr > _kw)
        const kwargs = { ...this._kw };
        if (this._node && this._node.attr) {
            const internalParams = this.constructor.internalParams;
            for (const [key, value] of Object.entries(this._node.attr)) {
                if (!internalParams.has(key) && !(key in kwargs)) {
                    kwargs[key] = value;
                }
            }
        }
        Object.assign(kwargs, callKwargs);

        // Fingerprint-based cache invalidation:
        // If params changed, force reload even if TTL hasn't expired
        const currentFingerprint = this._computeEffectiveFingerprint(kwargs);
        if (currentFingerprint === this._lastEffectiveFingerprint
            && !this.expired) {
            return this.cachedValue;
        }
        this._lastEffectiveFingerprint = currentFingerprint;

        // Get retry policy
        const policy = getRetryPolicy(this);

        // Call load with retry
        const doLoad = () => this.load(kwargs);

        if (policy) {
            // With retry - always async
            return withRetry(doLoad, policy).then(value => this._finalize(value));
        }

        // Without retry - can be sync or async
        const result = doLoad();
        if (result && typeof result.then === 'function') {
            return result.then(value => this._finalize(value));
        }
        return this._finalize(result);
    }

    /**
     * Finalize resolution: update cache timestamp and optionally store value.
     *
     * @param {*} value - The resolved value.
     * @returns {*} The value (possibly converted to Bag).
     * @private
     */
    _finalize(value) {
        // asBag conversion:
        //   true  → always convert
        //   false → never convert
        //   null  → convert if will be cached (!readOnly)
        let shouldConvert;
        if (this._asBag === true) {
            shouldConvert = true;
        } else if (this._asBag === false) {
            shouldConvert = false;
        } else {
            shouldConvert = !this._readOnly;
        }

        if (shouldConvert && value !== null && value !== undefined) {
            value = this._convertToBag(value);
        }

        this._lastUpdate = Date.now();

        // Cache duration and node storage policy are independent.
        if (!this.readOnly || this.cacheTime !== 0) {
            this.cachedValue = value;
        }

        return value;
    }

    /**
     * Convert result to Bag if possible.
     * Uses the Bag class registered via BagResolver.registerBagClass().
     *
     * @param {*} result - The value to convert.
     * @returns {*} A Bag if conversion succeeded, otherwise the original value.
     * @private
     */
    _convertToBag(result) {
        const BagClass = BagResolver._BagClass;
        if (!BagClass) {
            return result;
        }

        if (result && typeof result._htraverse === 'function') {
            // Already a Bag (duck typing)
            return result;
        }
        if (typeof result === 'string') {
            result = result.trim();
            if (result.startsWith('<') && BagClass.fromXml) {
                return BagClass.fromXml(result);
            }
            if ((result.startsWith('{') || result.startsWith('[')) && BagClass.fromJson) {
                return BagClass.fromJson(result);
            }
        }
        return result;
    }

    /**
     * Register the Bag class for asBag conversion.
     * Called by Bag module to avoid circular imports.
     *
     * @param {Function} BagClass - The Bag constructor.
     */
    static registerBagClass(BagClass) {
        BagResolver._BagClass = BagClass;
    }

    /**
     * Load the value. Override in subclasses.
     *
     * Can return a value directly (sync) or a Promise (async).
     *
     * @param {Object} kwargs - Parameters for loading.
     * @returns {*} The loaded value or Promise.
     */
    load(kwargs) {
        // Must be implemented by subclasses
        return null;
    }
}

// Registry for Bag class (set by Bag module to avoid circular import)
BagResolver._BagClass = null;

/**
 * BagCbResolver - Resolver that delegates to a callback function.
 *
 * The callback can be sync or async. The resolver handles both transparently.
 *
 * @example
 * // Sync callback
 * const resolver = new BagCbResolver({
 *     callback: (kw) => kw.a + kw.b,
 *     a: 10,
 *     b: 20
 * });
 *
 * @example
 * // Async callback
 * const resolver = new BagCbResolver({
 *     callback: async (kw) => {
 *         const response = await fetch(kw.url);
 *         return response.json();
 *     },
 *     url: 'https://api.example.com/data'
 * });
 */
export class BagCbResolver extends BagResolver {
    static classKwargs = {
        cacheTime: 0,
        readOnly: false,
        asBag: false,
        retryPolicy: null,
        callback: null
    };

    static classArgs = ['callback'];

    static internalParams = new Set(['cacheTime', 'readOnly', 'asBag', 'retryPolicy', 'callback']);

    /**
     * Create a callback resolver.
     *
     * @param {Object|Function} kwargs - Options or callback function directly.
     */
    constructor(kwargs = {}) {
        // Allow passing callback as first positional arg
        if (typeof kwargs === 'function') {
            kwargs = { callback: kwargs };
        }
        super(kwargs);
        this._callback = kwargs.callback || null;
    }

    /**
     * Load by calling the callback.
     *
     * // DIFF-PYTHON: Python calls callback(**params) with expanded kwargs.
     * // JS calls callback(params) with a single kwargs object because JS
     * // has no **kwargs syntax. This is an intentional, unavoidable difference.
     *
     * @param {Object} kwargs - Parameters passed to callback as single object.
     * @returns {*} Result of callback (value or Promise).
     */
    load(kwargs) {
        if (!this._callback) {
            return null;
        }
        return this._callback.call(this, kwargs);
    }
}

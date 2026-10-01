// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

/**
 * UrlResolver - resolver that loads content from an HTTP URL.
 *
 * Uses fetchTytx from @genrojs/tytx for typed serialization/deserialization.
 * Faithful port of Python genro_bag.resolvers.url_resolver.UrlResolver.
 */

import { fetchTytx } from '@genrojs/tytx';
import { BagResolver } from '../resolver.js';

/**
 * Resolver that fetches content from an HTTP URL.
 *
 * Supports all HTTP methods and can convert responses to Bag automatically.
 * Uses fetchTytx for TYTX-aware HTTP operations.
 *
 * @example
 * // Simple GET
 * const resolver = new UrlResolver('https://api.example.com/data');
 * const data = await resolver.resolve();
 *
 * @example
 * // GET with query params, parse as Bag
 * const resolver = new UrlResolver('https://api.example.com/users', {
 *     qs: { page: 1, limit: 10 },
 *     asBag: true
 * });
 * const users = await resolver.resolve();
 *
 * @example
 * // POST with body
 * const resolver = new UrlResolver('https://api.example.com/users', {
 *     method: 'post',
 *     body: { name: 'John', email: 'john@example.com' },
 *     asBag: true
 * });
 */
export class UrlResolver extends BagResolver {
    static classKwargs = {
        cacheTime: 300,
        readOnly: true,
        retryPolicy: {
            maxAttempts: 3,
            delay: 1.0,
            backoff: 2.0,
            jitter: true,
            on: ['TypeError', 'NetworkError', 'AbortError']
        },
        asBag: false,
        url: null,
        method: 'get',
        qs: null,
        body: null,
        timeout: 5,  // seconds (same unit as Python)
        transport: 'json'
    };

    static classArgs = ['url'];

    static internalParams = new Set([
        'cacheTime', 'readOnly', 'retryPolicy', 'asBag',
        'url', 'method', 'qs', 'body', 'timeout', 'transport'
    ]);

    /**
     * Create a URL resolver.
     *
     * @param {string|Object} urlOrKwargs - URL string or options object.
     * @param {Object} [kwargs] - Additional options if first arg is URL.
     */
    constructor(urlOrKwargs, kwargs = {}) {
        // Allow positional URL: new UrlResolver('http://...')
        if (typeof urlOrKwargs === 'string') {
            kwargs = { ...kwargs, url: urlOrKwargs };
        } else {
            kwargs = urlOrKwargs || {};
        }
        super(kwargs);
    }

    /**
     * Load data from URL.
     *
     * @param {Object} kwargs - Parameters for this load call.
     * @returns {Promise<*>} Response data.
     */
    async load(kwargs) {
        let url = this._kw.url;
        const method = this._kw.method;
        const qs = this._kw.qs;
        const timeout = this._kw.timeout;
        const transport = this._kw.transport;
        let body = this._kw.body;

        // _body overrides constructor body
        if (kwargs._body !== undefined) {
            body = kwargs._body;
        }

        // Collect path args (arg_0, arg_1, ...) and extra qs params
        const pathArgs = [];
        const extraQs = {};

        for (const [key, value] of Object.entries(kwargs)) {
            if (key.startsWith('arg_') && value !== null && value !== undefined) {
                const idx = parseInt(key.slice(4), 10);
                if (!isNaN(idx)) {
                    while (pathArgs.length <= idx) {
                        pathArgs.push(null);
                    }
                    pathArgs[idx] = value;
                }
            } else if (
                !this.constructor.classKwargs.hasOwnProperty(key) &&
                !this.constructor.internalParams.has(key) &&
                !key.startsWith('_')
            ) {
                // Extra kwarg -> query string parameter
                if (value !== null && value !== undefined) {
                    extraQs[key] = value;
                }
            }
        }

        // Substitute path parameters {placeholder} with arg_0, arg_1, ...
        if (pathArgs.length > 0 && url.includes('{')) {
            const placeholders = url.match(/\{([^}]+)\}/g) || [];
            placeholders.forEach((placeholder, i) => {
                if (i < pathArgs.length && pathArgs[i] !== null) {
                    url = url.replace(placeholder, String(pathArgs[i]));
                }
            });
        }

        // Merge query string: constructor qs + extra kwargs
        const mergedQs = {};
        if (qs) {
            Object.assign(mergedQs, this._qsToDict(qs));
        }
        Object.assign(mergedQs, extraQs);

        // Build URL with query string (filter null/undefined values)
        if (Object.keys(mergedQs).length > 0) {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(mergedQs)) {
                if (value !== null && value !== undefined) {
                    params.append(key, String(value));
                }
            }
            const separator = url.includes('?') ? '&' : '?';
            url = `${url}${separator}${params.toString()}`;
        }

        // Build fetch options
        const fetchOptions = {
            method: method.toUpperCase(),
            transport,
        };

        // Add timeout via AbortController
        if (timeout) {
            fetchOptions.signal = AbortSignal.timeout(timeout * 1000);
        }

        // Add body for POST/PUT/PATCH
        if (body !== null && body !== undefined) {
            fetchOptions.body = body;
        }

        // Make request using fetchTytx
        const response = await fetchTytx(url, fetchOptions);

        return response;
    }

    /**
     * Convert query string source to dict, filtering null/undefined values.
     *
     * @param {Object|Map} qs - Query string parameters.
     * @returns {Object} Parameters with null/undefined values removed.
     * @private
     */
    _qsToDict(qs) {
        if (!qs) return {};

        // Handle Bag-like objects with keys() method
        if (typeof qs.keys === 'function' && typeof qs.getItem === 'function') {
            const result = {};
            for (const k of qs.keys()) {
                const v = qs.getItem(k);
                if (v !== null && v !== undefined) {
                    result[k] = v;
                }
            }
            return result;
        }

        // Handle plain objects
        const result = {};
        for (const [k, v] of Object.entries(qs)) {
            if (v !== null && v !== undefined) {
                result[k] = v;
            }
        }
        return result;
    }
}

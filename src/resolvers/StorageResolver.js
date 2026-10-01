// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

import { BagResolver } from '../resolver.js';
import { fromTytx } from '@genrojs/tytx';

/**
 * StorageResolver - resolver that reads from browser Web Storage.
 * Optional dtype converts non-null values/defaults through TYTX.
 *
 * // DIFF-PYTHON: This is the browser counterpart of Python's EnvResolver
 * // (which reads os.environ). Not a 1:1 port — platform-specific resolver.
 *
 * @example
 * // Read from localStorage
 * const resolver = new StorageResolver({ key: 'user.theme', defaultValue: 'light' });
 *
 * @example
 * // Read from sessionStorage
 * const resolver = new StorageResolver({
 *     key: 'auth.token',
 *     storageType: 'session',
 *     cacheTime: 60
 * });
 */
export class StorageResolver extends BagResolver {
    static classKwargs = {
        cacheTime: -1,
        readOnly: true,
        asBag: false,
        retryPolicy: null,
        key: null,
        storageType: 'local',
        defaultValue: null,
        dtype: null
    };

    static classArgs = ['key'];

    static internalParams = new Set([
        'cacheTime', 'readOnly', 'asBag', 'retryPolicy'
    ]);

    /**
     * Create a StorageResolver.
     *
     * @param {string|Object} keyOrKwargs - Storage key or options object.
     * @param {Object} [kwargs] - Additional options if first arg is key.
     */
    constructor(keyOrKwargs, kwargs = {}) {
        if (typeof keyOrKwargs === 'string') {
            kwargs = { ...kwargs, key: keyOrKwargs };
        } else {
            kwargs = keyOrKwargs || {};
        }
        super(kwargs);
    }

    /**
     * Get the storage backend.
     *
     * @returns {Storage|null} localStorage or sessionStorage, or null if unavailable.
     * @private
     */
    _getStorage(kwargs) {
        const type = kwargs.storageType || 'local';
        if (type === 'session') {
            return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
        }
        return typeof localStorage !== 'undefined' ? localStorage : null;
    }

    /**
     * Load value from Web Storage.
     *
     * @param {Object} kwargs - Parameters (key can be overridden via node attrs).
     * @returns {*} The stored value, or defaultValue if not found.
     */
    load(kwargs) {
        const key = kwargs.key;
        const defaultValue = kwargs.defaultValue;

        const storage = key ? this._getStorage(kwargs) : null;
        const stored = storage ? storage.getItem(key) : null;
        const value = stored !== null ? stored : defaultValue;
        if (kwargs.dtype == null || value == null) return value;
        const text = String(value);
        // Reject partial parseInt/parseFloat conversions (e.g. "12oops").
        if (kwargs.dtype === 'L' && !/^[+-]?\d+(?:_\d+)*$/.test(text.trim())) {
            throw new TypeError(`Invalid integer in Web Storage: ${text}`);
        }
        if (kwargs.dtype === 'R' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) {
            throw new TypeError(`Invalid real number in Web Storage: ${text}`);
        }
        const input = kwargs.dtype === 'L' ? text.replaceAll('_', '') : text;
        const converted = fromTytx(`${input}::${kwargs.dtype}`);
        if ((typeof converted === 'number' && Number.isNaN(converted))
            || (converted instanceof Date && Number.isNaN(converted.getTime()))) {
            throw new TypeError(`Invalid ${kwargs.dtype} value in Web Storage: ${text}`);
        }
        return converted;
    }
}

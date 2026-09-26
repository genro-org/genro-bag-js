// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

import { BagResolver } from '../resolver.js';


/**
 * UuidResolver - resolver that generates UUIDs.
 *
 * Uses crypto.globalThis.crypto.randomUUID() (Node 18+ and modern browsers).
 *
 * // DIFF-PYTHON: Python supports uuid1 and uuid4 via the version parameter.
 * // JS only supports uuid4 via crypto.globalThis.crypto.randomUUID(). The version parameter
 * // is accepted for API compatibility but only 'uuid4' is implemented.
 *
 * @example
 * const resolver = new UuidResolver();
 * const uuid = resolver.resolve();  // e.g. '550e8400-e29b-41d4-a716-446655440000'
 */
export class UuidResolver extends BagResolver {
    static classKwargs = {
        cacheTime: -1,
        readOnly: false,
        asBag: false,
        retryPolicy: null,
        version: 'uuid4'
    };

    static classArgs = ['version'];

    static internalParams = new Set([
        'cacheTime', 'readOnly', 'asBag', 'retryPolicy', 'version'
    ]);

    load() {
        return globalThis.crypto.randomUUID();
    }
}

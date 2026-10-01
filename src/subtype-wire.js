// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

import { getRegisteredType, getSubtypeDict } from '@genrojs/tytx';
import { BagSerializationError } from './resolver-wire.js';

/**
 * Wire encoding of Bag subclasses: the __cls name, shared by toTytx and fromTytx.
 *
 * A Bag branch travels as "::<suffix>" ("::X" for every Bag subclass that does
 * not declare a suffix of its own). Which class of that type it is travels as a
 * symbolic name, looked up in the TYTX subtype dictionary of the suffix
 * (getSubtypeDict): name -> class, the real class name, identical in Python.
 *
 * A branch carries the name in the attributes of its row; a root (the payload
 * of toTytx, including a Bag held in an attribute or a plain container value)
 * carries it at payload level, next to rows. It is written only when the class
 * differs from the inherited one: a branch inherits the class of its parent
 * Bag when both share the suffix, otherwise the class registered for the
 * suffix; a root inherits the class registered for the suffix.
 *
 * Every class that travels this way is in the dictionary, the base class
 * included (genro-bag-js adds "Bag"). __cls is reserved: a user attribute with
 * that name is an error.
 */
export const CLS_ATTRIBUTE = '__cls';

/** The class a branch (or, with parentClass null, a root) has without __cls. */
export function getInheritedClass(parentClass, suffix) {
    if (parentClass !== null && parentClass.tytxSuffix === suffix) return parentClass;
    return getRegisteredType(suffix);
}

/** The symbolic name of a Bag class in the subtype dictionary of its suffix. */
export function getSubtypeName(cls) {
    const suffix = cls.tytxSuffix;
    const names = Object.entries(getSubtypeDict(suffix))
        .filter(([, subtype]) => subtype === cls).map(([name]) => name);
    if (names.length === 0) {
        throw new BagSerializationError(
            `${cls.name} is not in the TYTX subtype dictionary of '${suffix}'`);
    }
    if (names.length > 1) {
        throw new BagSerializationError(
            `${cls.name} is in the TYTX subtype dictionary of '${suffix}' under several names: ${names.sort().join(', ')}`);
    }
    return names[0];
}

/** The Bag class registered under a symbolic name for a suffix. */
export function getSubtypeClass(suffix, name) {
    const subtypes = getSubtypeDict(suffix);
    if (!Object.hasOwn(subtypes, name)) {
        throw new BagSerializationError(`Unknown Bag class '${name}' for TYTX type '${suffix}'`);
    }
    return subtypes[name];
}

/** The __cls value to write for cls, or null when it is the inherited class. */
export function getClsMarker(cls, inherited) {
    return cls === inherited ? null : getSubtypeName(cls);
}

# Python/JavaScript alignment

Implemented against genro-bag Python 0.22.0. The runtime differences remain
intentional: callbacks may return values or Promises, Web Storage replaces
process environment variables, and there is no DataChangeCollector.

## Release dependency

Bag JS 0.4.0 uses the published TYTX `v0.15.0` Git tag over HTTPS. The lockfile
pins its commit; no sibling checkout is required. TYTX exposes the public
`getRegisteredType(suffix)` API and supports the Node 18 runtime declared by
this package. Install with `npm ci` for development. `UuidResolver` selects
Node crypto or browser Web Crypto through a conditional import; its API
remains synchronous on both runtimes.

## Registered Bag classes

```js
import { Bag } from 'genro-bag-js';
import { registerClass } from 'genro-tytx';

class SourceBag extends Bag {
    static tytxSuffix = 'SOURCE';
}
registerClass(SourceBag);
```

Python registers its counterpart with `__tytx_suffix__ = 'SOURCE'`. Each
runtime constructs its own class. Bag itself owns `X`; a registered subclass
must own a distinct suffix. Registration uses exact constructors.

`SourceBag.fromTytx(data)` reconstructs a SourceBag root and retains mixed
branch types. JSON and MessagePack support normal and compact Bag rows.
Bags also travel inside ordinary TYTX objects and arrays. Legacy subclasses
that inherit `X` retain the Python root-class factory behavior for `X` branches.

Unknown or missing parents throw `BagSerializationError` instead of moving
children to the root. An unknown empty marker without descendants can still
be indistinguishable from ordinary text. MessagePack scalar strings are not
indiscriminately decoded as structural markers.

## Tags and attribute queries

`update(otherBag)` copies `nodeTag` and `xmlTag` on inserted nodes. On collisions,
non-null incoming tags win; null tags retain the destination metadata. This
also applies to recursive merges. JSON and TYTX round-trips retain `nodeTag`.

`getItem('node?')` returns all attributes as an object. `node?a` returns one
attribute, and `node?a&b` returns an array in the requested order. Attribute
resolvers are resolved using their own parameters, without passing attributes
from the containing node. A query returns immediately if all values are
synchronous; otherwise it returns a Promise of the complete result. Rejected
resolver Promises reject the query. Static reads return resolver objects intact.

## Resolver descriptions

TYTX, JSON and XML carry Python's `::RSLV:` descriptions. JSON node objects
use `resolver`; XML uses `_resolver`. Resolver-valued attributes use the same
marker. Reading a format does not call `load()`. Resolver caches are not
serialized as independent data branches.

Register JS counterparts explicitly, with adapters for argument naming and
runtime differences. The module and name identify a wire type; they never
cause dynamic imports or code evaluation.

```js
import { BagResolver, registerResolver } from 'genro-bag-js';

class NumberResolver extends BagResolver {
    load(options) { return options.number; }
}
registerResolver(NumberResolver, {
    module: 'myapp.resolvers',
    name: 'NumberResolver',
    encode: resolver => ({ kwargs: { number: resolver._kw.number } }),
    decode: ({ kwargs }) => new NumberResolver({ number: kwargs.number }),
});
```

Adapters must construct inert resolvers. `encode` returns JSON-compatible
`args` and `kwargs`; callbacks and non-JSON parameter objects cannot travel.
Unregistered JS resolver instances fail explicitly when serialized.

Unknown descriptions become `OpaqueResolver` instances. Their read-only
`payload` preserves the exact received marker, including whitespace and
signatures. Attempting to resolve them locally throws. Signed tokens remain
opaque even if their class has a JS counterpart: the browser has no signing
key and does not authenticate them. They travel unchanged back to the server,
which verifies signature and expiry. Remote execution is outside this API.

The existing XML API emits fragments; wrap them in `<GenRoBag>...</GenRoBag>`
for a round-trip with Python (which recognizes that wrapper). JS `fromXml`
reads the children of the document element.

## Web Storage conversion

```js
new StorageResolver({
    key: 'preferences.zoom', storageType: 'local', dtype: 'L', defaultValue: '100',
});
```

The existing `storageType: 'local' | 'session'` selects the backend. `dtype`
optionally converts the string or non-null default through TYTX. With no dtype,
values retain the original behavior; null defaults remain null. Invalid numeric
strings throw instead of returning a partially parsed number. No separate
LocalStorageResolver, SessionStorageResolver or EnvResolver is introduced.

## Verification

- `npm test`: existing JS tests and new alignment contracts.
- `node --test js/test/test_registry.js js/test/test_registry_lookup.js` in TYTX.
- `python -m pytest tests/cross-lang`: requires Python 3.11+, pytest, msgpack,
  and the current Python genro-bag, genro-tytx and genro-toolbox packages.
  The alignment bridge checks mixed branch identities inside JS and Python,
  resolver counterparts, and signed payloads verified on return to Python.

## Legacy JavaScript digest calls

The signature remains `digest(what, condition, asColumns)`. For compatibility
with legacy JavaScript callers, a boolean second argument is interpreted as
`asColumns`, with no filter, and emits a `console.warn` deprecation notice.
Migrate `digest(what, true)` to `digest(what, null, true)` (and likewise for
`false`). Callable filters retain their existing behavior and do not warn.
The `columns()` helper already uses the explicit three-argument form.

## JavaScript items contract

`Bag.items()` returns an ordered array of `{key, value}` objects, matching
legacy JavaScript Bag. Values are resolved through `getValue()` and nested
Bags retain their identity. This differs from Python's key/value pairs.

## JavaScript update contract

`update(source, mode, reason, ignoreNone=false)` retains the legacy JavaScript
positional contract. With `mode='static'`, incoming resolvers are preserved and
not executed, including newly inserted nodes. Otherwise their results are
copied; an incoming resolved result replaces a destination resolver. Nested
Bags merge recursively unless the incoming `__replace` marker requests
replacement. The marker is consumed and `reason` is propagated to events.
Null values overwrite existing values by default. The previous standalone
`ignoreNone` extension is now explicitly the fourth argument, not the mode.
This JS signature intentionally differs from Python's `resolved` flag.

Unlike the historical implementation, insertion does not drop static resolvers.
This repairs the lazy-copy contract instead of retaining that historical bug.

## Constructor null attributes

`BagNode` accepts `removeNullAttributes` as its eighth constructor argument,
matching Python's `_remove_null_attributes` position and default (`true`).
Default construction removes null attributes; passing `false` preserves them.
Zero, false and empty strings are preserved in either mode. `Bag.setItem`
forwards its existing null-removal option when constructing a new node as well
as when updating one. This is an optional argument and a propagation bug fix,
not a new default policy. See `constructor-null-attributes.test.js`.

# Breaking changes

## 0.7.0

### Empty-path assignment

Native `set_item('', value)` / `setItem('', value)` rejects an empty path
with ValueError / RangeError, regardless of the value, without modifying the Bag.
Successful native assignments return the written BagNode. This supersedes the
empty-path merge introduced in Python 0.24.0 / JS 0.6.0 and the earlier native
empty-label creation. Builders must validate empty identifiers before insertion.
Legacy empty-path merge and scalar no-op belong only to compatibility mixins
(Python camelCase `setItem`, GenroJS `gnrbag_mixin.js`).

## 0.6.0

### Reset requires a resolver

`BagNode.reset_resolver()` / `resetResolver()` now raises an explicit error
when the node has no resolver (Python ValueError, JavaScript Error). The node
value and attributes remain unchanged and no mutation notification is emitted.
Previously the new libraries silently cleared the value in this case.
Compatibility names inherit the same check. With a resolver, reset still
invalidates its cache and clears the node value.

### Resolver cache durations are numeric

Both libraries use the same expiration contract: zero reloads on access,
positive values are TTL seconds, and every negative value means infinite
cache until invalidation/reset. Negative values never schedule background work.
Boolean durations are rejected, including assignment through compatibility setters.
Python callers using `cache_time=False` must use a negative number such as `-1`.
UUID and OpenAPI resolver defaults have been migrated to `-1`; legacy negative
values are preserved by the Python mixin without semantic translation.
Existing serialized Python resolver descriptions containing a boolean cache
duration must also be migrated before deserialization.

### Legacy resolver attribute methods are no longer supported

The legacy JS `GnrBagResolver.getAttr()` and `setAttr(attributes)` methods
are not provided by the new JS resolver and are not restored by the GenroJS
compatibility mixin. These methods accessed a resolver-owned `_attributes`
dictionary; they were separate from the attributes of the containing BagNode.
Bag and BagNode attribute APIs are unaffected.

Legacy `Bag.set()` read `resolver.attributes` instead, without the underscore.
The usage audit found no connection between the two fields and no application
calls to the resolver attribute methods in the Sourcerer-indexed repositories,
including JavaScript embedded in Python files. The occurrences of `getAttr`
and `setAttr` on Bags, nodes and source nodes do not require this resolver API.

Store node metadata explicitly on the BagNode or pass it when inserting the
node. This decision concerns the legacy JS resolver API only; it introduces
no Python API change. The flag-off legacy implementation remains unchanged.

### Legacy resolverDescription is no longer supported

`GnrBagResolver.resolverDescription()` is not provided by the new JS resolver
or restored by the GenroJS compatibility mixin. The legacy method called
`resolve().toString()`, executing the resolver merely to produce a description.
This differed from the legacy Python method, which described the resolver
object itself. Neither behavior is added as a new shared API.

This is not resolver serialization; the serialization APIs are unaffected.
If resolved content is needed, resolve it explicitly before formatting it.
Sourcerer found no application callers in the indexed repositories, only the
method definition and an inventory copy.


### Legacy GnrBagGetter is no longer supported

`gnr.GnrBagGetter` is not provided by the new JS library or the GenroJS
compatibility mixin. This legacy resolver attempted to read a node, its value
or its attributes from the global Genro databag. It was not a Bag method or a
struct API. Its legacy load implementation references the undefined variable
`thisWhat` and is not a reliable working contract to preserve.

Use an explicit callback resolver when a computed read is needed, selecting
the source Bag and desired node/value/attributes in the callback.

A Sourcerer search across the indexed repositories found only the definition
and an inventory copy, with no callers. There is no corresponding Python API
removal. The flag-off legacy implementation remains unchanged.


### Legacy doWithItem is no longer supported

`Bag.doWithItem(path, callback, defaultValue)` is not available in the new JS
library and is not restored by the GenroJS compatibility mixin. The legacy
method read a value and invoked the callback, or attached it with `addCallback`
when the value was a `dojo.Deferred`.

For synchronous reads, use `callback(bag.getItem(path, defaultValue))`.
This expression does not reproduce Deferred handling; callers needing that
behavior must handle it explicitly outside the Bag.

A Sourcerer search across the indexed repositories found only the definition,
an internal comment and inventory copies, with no callers. There is no
corresponding Python API removal.


### Legacy backrefOk diagnostic is no longer supported

`Bag.backrefOk()` and `BagNode.backrefOk()` are not available in the new JS
library and are not restored by the GenroJS compatibility mixin. The legacy
Bag method only compared its recorded parent with its containing node's parent
Bag; it was not a recursive integrity check and could fail on root Bags without
a containing node. The node method delegated to its parent Bag.

A Sourcerer search across the indexed repositories found only definitions,
the internal node delegation, and inventory copies, with no external callers.
No replacement diagnostic API is introduced. Back-reference correctness remains
covered by tests of public operations. There is no corresponding Python API
removal.


### Legacy asObjList is no longer supported

`Bag.asObjList(labelAs, formatAttributes)` is not available in the new JS Bag
and is not restored by the GenroJS compatibility mixin. The legacy method
converted a Bag of row Bags into an array of objects, optionally adding each
row's label as a field and formatting selected values as text.

Migrate by iterating the row nodes and explicitly converting each row Bag,
adding its label and applying any required formatting. In the compatibility
mixin, `asObj(formatAttributes)` remains available for converting a single row;
this retains the legacy `**` placeholder for fields backed by resolvers.
Native `asDict` is not an exact substitute for that resolver/formatting policy.

A Sourcerer search across the indexed repositories found only definitions
and inventory copies, with no callers. This does not cover unindexed code.
There is no corresponding Python API removal.


### Bag formulas and validation are no longer supported

The legacy Bag formula subsystem (`defineSymbol`, `defineFormula`, `formula`,
`BagFormula` / `GnrBagFormula`) and Bag/node validation subsystem are no longer
supported. Neither is restored by compatibility mixins. A future design may
reintroduce these capabilities; no replacement API is promised today.

Node validation state (`is_valid` / `isValid`, `_invalid_reasons` /
`_invalidReasons`) has been removed from the new libraries. Legacy validation
classes, including `BagValidationError`, are not exported by the native Python
integration. Supplying `_validators` to Python compatibility item methods now
raises instead of warning and silently ignoring the requested validation;
None remains an unused positional placeholder to avoid shifting other options.

This concerns Bag formulas and Bag validation only. Input-format checks,
resolver parameter checks, and application/widget validation are unaffected.
The flag-off legacy implementation remains available for comparison.

### Legacy Bag modification tracking is not supported

Legacy JavaScript `set_modified` and its automatic event-based tracking are
not provided by the new Bag or restored by the GenroJS compatibility mixin.
Previously, `set_modified(false)` enabled tracking, subsequent Bag events set
the flag to true, and `set_modified(null)` disabled tracking. The mixin's
remaining `get_modified()` only reads a field; it does not establish tracking.

Applications needing this state should explicitly subscribe to Bag events and
manage their own flag. A Sourcerer search across the indexed repositories found
no calls enabling the legacy mechanism. The only framework read is inside
`genro_dlg.js`'s `recordChange`, for which no callers were found; inventory
copies are not independent uses. This does not cover unindexed applications.
No compatibility tracking implementation is being added.


### Explicit replacement and deprecated mixed-source filling

`Bag.replace(Bag)` and `BagNode.replace(BagNode)` are new APIs, with matching
contracts in Python and JavaScript; see [Replacing contents](docs/replacing-contents.md).
`fillFrom` is now a deprecated compatibility method (Python also `fill_from`).
Migrate by decoding/constructing the source Bag explicitly, then calling
`destination.replace(sourceBag)`. Constructors do not warn.
JavaScript callers of the standalone `fillFrom` must migrate or use the
GenroJS compatibility mixin; the standalone class no longer exposes it.
Python retains both names through its compatibility mixin.

### Removed GenroPy getNode tuple adaptation

The GenroPy JS mixin no longer implements `getNode(path, true)` as a request
for `{obj, node}`; it raises an explicit error. Use `getNode(path)` to obtain
the node or null. The old second argument position remains reserved so calls
such as `getNode(path, false, true, defaultValue)` retain their autocreation
meaning. No tuple capability is added to the standalone library.

Standalone JS `getNode` keeps its existing signature: its second argument is
the static flag, not a tuple flag. `BagNode.asTuple()` is unrelated and remains
available with label, value, attributes and resolver.

### Clearing node backrefs compared with legacy JS

`clearBackref()` (GenroPy alias `clearBackRef()`) removes node-to-Bag links
recursively when backrefs are enabled, matching both legacy and new Python.
Legacy JS retained those node links. The GenroPy JS mixin deliberately uses
the new contract, without restoring legacy JS behavior.

After clearing, affected nodes report no parent Bag; upward navigation and
fullpaths requiring those links are unavailable. Nodes and values remain in
their containers. Callers needing upward links must retain backrefs or restore
them with `setBackref()` / `setBackRef()` before using that navigation.
This is a migration difference from legacy JS, not a new standalone-library
behavior change.

### Leaf path/value collection

New `getLeaves()` returns an array of `[relativePath, value]` pairs for non-Bag
leaves, matching Python `get_leaves()`. It resolves each node once per occurrence.
Intermediate and empty Bags are excluded; null, false, zero and empty strings
remain valid leaves. Shared subtrees are reported under each path. No legacy JS
method is replaced. Legacy Python's accidental inclusion of nested branches is
intentionally not reproduced.

### Callback and iterator traversal

`walk` is removed from the standalone API. Use `for_each` (Python) / `forEach`
(JS), with `deep=True/true` for recursive callbacks, or `traverse()` to iterate
nodes. Falsey non-null callback results now skip children; truthy results stop
and are returned. JS `forEach` now takes an options object; its old positional
signature is confined to the GenroPy compatibility mixin. See
[traversal contracts](docs/traversal.md) for migration and legacy semantics.

Potential application impacts:

- `bag.walk(callback)` becomes `bag.forEach(callback, {deep: true})`. Omitting
  `deep: true` visits only direct nodes. Static traversal is the default;
  use `static: false` to resolve lazy branches. Legacy JS `walk` without a
  mode was dynamic, so its callers need an explicit choice when migrating.
- `bag.forEach(callback, mode, kw)` becomes
  `bag.forEach(callback, {static: true, deep: false, kwargs: kw})`. Callbacks
  still receive `(node, kwargs, siblingIndex)`, but native kwargs are shallow
  copies: do not rely on object identity or top-level assignments being shared.
- Former standalone `walk()` yielded `[path, node]` pairs. `traverse()` yields
  nodes only. Use `forEach` with `deep: true` and `kwargs: {_pathlist: []}` when
  paths are required. Those paths do not depend on node backrefs.
- Falsey non-null returns (`false`, `0`, `''`) skip children and continue with
  siblings. Legacy JS stopped the entire visit on those values; the former
  native `walk` descended into children. Return null/undefined to descend.
  Truthy returns stop the entire visit and become its result.
- `__continue__` is not a native control token: as a truthy string, it stops
  the visit. Replace it with `false` to skip a subtree. Native `forEach`
  returns null when no match is found; legacy `forEach` returned undefined.
- The GenroPy mixin retains callback-only `walk` (with a deprecation warning)
  and positional legacy `forEach`, preserving their old return semantics.
  Supplying a modern options object selects the new contract. Iterator-mode
  `walk()` is not restored by the mixin.


API addition: `traverse()` yields original nodes (not path/node pairs),
depth-first with parents before children, without resolving lazy values.
It follows legacy Python, including visiting shared subtrees at each occurrence.
Legacy JS did not expose this method.

Bug fix: `bag.setAttr(path, attributes, false)` now preserves existing attributes
and retains null values, matching Python. Previously the flag was forwarded as
the node's replacement option, causing existing attributes and nulls to be lost.

These are intentional contract changes. Review application assumptions before upgrading.

### Node fullpath

A node attached directly to a root Bag now returns its label (`cliente`), not
`None`/`null`. Deeper nodes return paths such as `cliente.nome`. A detached node
still returns `None`/`null`. The root **Bag** itself keeps its previous empty-path
representation (`None`/`null`). Paths depend on the available parent links; enable
backrefs for a complete nested hierarchy.

Migration: do not use a null node path to detect first-level membership; inspect
the parent instead. In a detached subtree, paths are relative to its new root.

### Null ordering

String-based sort criteria put null values first ascending and last descending,
reversing the previous standalone-library behavior and restoring the shared
legacy Python/JS convention. Zero and empty strings remain non-null values.
Callable sort keys retain their own ordering behavior.

### Public removal callbacks

Public node removal now completes detachment even when a delete subscriber
raises; the error still propagates. Callback reinsertion or transfer of the node
is respected. Applications must not rely on dangling references after a failed
callback. Extracted Bag values remain independent trees with local backrefs,
unlike legacy JS orphaning which disabled backrefs recursively.

### Canonical case modes versus legacy APIs

The standalone modes remain unchanged: `a`/`d` ignore case and `A`/`D` preserve
case, for all string criteria. This differs from legacy conventions. Applications
migrating from legacy code must select case-sensitive modes explicitly where
needed. Star-suffix compatibility and its deprecation belong to GenroPy's JS
compatibility layer, not these standalone libraries.

### Pretty XML formatting

Pretty XML is now indented during serialization, without reparsing the output.
Whitespace, empty-element spelling and trailing-newline layout may differ from
previous pretty output. Compare parsed content rather than serialized bytes;
see [XML indentation](docs/xml-indentation.md).

### Repeated XML elements and row-field sorting

XML import retains repeated elements under unique labels (`item`, `item_1`, …)
instead of silently retaining only the last value. `xmlTag` preserves the original
element name. Code relying on last-value-wins must select the desired node explicitly.

Sorting by a field of a Bag-valued row now actually reorders rows using that field;
previous versions incorrectly read an object property and could leave order unchanged.
The row contents themselves are not reordered.

### Sum signature and recursion

The public signature is now `sum(what, strict=False, condition=None)` in Python
and `sum(what, strict=false, condition=null)` in JavaScript. Move positional
predicates from argument two to argument three; Python keyword `condition=`
continues to work. The former `deep` option is removed: summation selects only
nodes at the current level. Explicit traversal must be performed separately.
Old positional `deep` booleans in argument three now raise a TypeError rather
than silently changing behavior.

Strict mode returns None/null if a selected value is None/null/undefined or the
empty string. Without strict these values contribute zero. Zero and false are
valid, and an empty selection sums to zero. Filtering happens before strict
validation. Multiple criteria return one sum or None/null per criterion.

Legacy JS callers already passing strict in position two remain compatible in
argument layout; strict failure now returns null rather than undefined.
Non-empty non-numeric values are now ignored without strict and raise TypeError
with strict. Numeric strings are not converted. This replaces Python's previous
unconditional arithmetic error and JavaScript's accidental string concatenation.
Numeric values and booleans are summed; Python Decimal values retain their precision.
Filtering applies first. In strict mode all selected values are checked: a null
must not hide a non-numeric error later in the selection. A null result is returned
only if no invalid type is found.

### Attribute lookup order relative to legacy JavaScript

`get_node_by_attr` / `getNodeByAttr` searches all nodes at the current level
before descending into child Bags in insertion order. Once a branch is selected,
that branch is searched recursively before the next branch. This is not a global
breadth-first search. It preserves the Python legacy contract and the existing
standalone behavior, but differs from legacy JavaScript's immediate depth-first
walk. If several nodes match, the returned node may therefore differ when
migrating from legacy JavaScript. The JS mixin defaults to deep_first=true for legacy compatibility; the Python
mixin keeps false. Explicit deep_first overrides either default.

The new optional `deep_first` parameter defaults to false in both standalone
libraries. Python: `get_node_by_attr(attr, value, deep_first=False)`; its camel-case
bridge preserves the path-output argument before the new option:
`getNodeByAttr(attr, value, path=None, deep_first=False)`.
JavaScript: `getNodeByAttr(attr, value, caseInsensitive=false, deep_first=false)`.
An omitted/undefined JS value requests attribute presence, now preserved through
all recursive levels; previously nested searches inadvertently compared against
undefined. Python retains its existing None-as-presence semantics.

### Value lookup inside Bag rows

`get_node_by_value` / `getNodeByValue` now interprets a dotted key as a path when
searching a Bag-valued row, restoring legacy behavior. Previously it treated the
path as a direct label and could miss matches. Only current-level rows are
candidates; traversal of the path inside each row is not a recursive row search.
Non-Bag mapping keys retain their existing literal-key lookup semantics.

## Labels matching JavaScript prototype properties

Labels such as `__proto__`, `constructor`, `toString` and `hasOwnProperty` now
behave as ordinary labels. The node container uses a prototype-free dictionary,
including after clear. Missing labels no longer expose inherited Object members.
This fixes JavaScript behavior to match Python; no mixin override is needed.

## Empty-path assignment

`set_item('', source)` / `setItem('', source)` now updates the current Bag
from the first-level entries of another Bag or mapping/object, returning the
destination Bag. It no longer creates an empty-label node. Unmentioned nodes
remain; matching nested Bag values are replaced, not recursively merged.
Bag entries carry their attributes; values are read normally (resolvers may
be evaluated). Empty input leaves the destination unchanged. Scalar input is
a no-op, as in legacy. Only the empty string invokes this behavior.

## Atomic fillFrom replacement

`fillFrom` replaces all contents; it does not merge with previous nodes. This
replacement contract also applies to Python `fill_from`, unlike the mixed
source-dependent behavior of the legacy implementations.

JavaScript now prepares the replacement before touching the destination, matching
Python: self-assignment preserves data and preparation failures leave the Bag
unchanged. An attached Bag emits one `upd_value` event after the swap, with a
Bag holding previous contents as `oldvalue`, rather than per-node delete/insert
events. Listener exceptions propagate after commit; they do not roll it back.
No compatibility mixin override is added. Supported source types are unchanged.

## Bag content equality is named equalTo

The standalone Bag method `isEqual(other)` is renamed to `equalTo(other)`.
It compares node contents and order, like Python Bag `==`, and returns false
for null, undefined and non-Bag arguments. Nested Bag values also use
`equalTo`, so framework identity semantics cannot override content comparison.
The GenroJS mixin alone keeps Bag `isEqual` for legacy identity/location checks.
BagNode and BagNodeContainer comparison method names are unchanged.

## Node lists are snapshots

`get_nodes()` / `getNodes()` returns a new list of the current nodes, unlike
legacy unfiltered access to the internal list. Nodes themselves are shared,
not copied. Mutating the result list does not change the Bag; modifying a node
does. Later structural changes are not reflected in an earlier list. Filtered
results follow the same rule. Use public Bag operations for structural changes.
Compatibility mixins deliberately retain this snapshot contract.

## Bag.setAttr creates missing nodes

JavaScript `bag.setAttr(path, attributes)` now creates missing nodes and parent
paths, with null as the leaf value, matching legacy JS and both Python versions.
It previously silently skipped absent paths. Existing node values are preserved.
The compatibility mixin inherits this correction without an override.

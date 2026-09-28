# Attaching prebuilt subtrees

Inserting a prebuilt Bag into a root with backrefs enabled must activate backrefs
throughout the incoming subtree. Callers only prepare the root; they must not
recursively prepare incoming values. Attaching does not resolve lazy resolvers.

`Bag.setBackref()` assigns each node's parent Bag. The `BagNode.parentBag` setter
then enables backrefs on an existing Bag value, recursively. `BagNode.setValue()`
uses the same propagation when replacing a node value. An already enabled Bag
updates its own upward links without repeatedly walking its descendants.

The root subscriber receives one notification per notifying operation. Existing
nodes inside an attached subtree do not generate synthetic insertion events.
Update event `pathlist` identifies the affected node; insert/delete `pathlist`
identifies its containing Bag, with the affected node available as `event.node`.
Delete callbacks see the node's former parent/path before detachment. Replaced
or removed subtrees subsequently stop notifying their former root.

## Regression history

Version 0.4.0 (`faf6bef3badb389d25ea4cb3b35c5369cb7ffd8a`) only assigned
`_parentBag` in the node setter. As a result, attaching `main -> div -> span`
activated backrefs on `main`'s value but not on the children of `div`.
The recursive propagation was restored in `c3dc3343fe6a655d6bba192de0e7991cd39c8d05`
and first released in 0.5.0. It is also present on main at 0.5.2 and in 0.7.1.
A checkout still at 0.4.0 does not contain that fix.

`tests/nested-backref-propagation.test.js` covers prebuilt trees, including
already enabled ones, repeated activation, deep insert/update/delete events,
replacement via both public APIs, parent identity and full paths, and isolation
of detached subtrees. The four cases fail on 0.4.0 and pass on 0.7.1. No runtime
change or event-contract change is required to address this report on 0.7.1.

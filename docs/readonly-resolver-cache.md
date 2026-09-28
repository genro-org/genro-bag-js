# Readonly resolver caching

Bug fix: cache duration and storage location are independent, matching the
previously documented Python contract.

- `readOnly: true` keeps cached results in the resolver and does not write the
  attached node's value. Zero cache duration reloads without storing a result.
- `readOnly: false` stores results in the attached node, or in the resolver when
  standalone. Changing node attachment invalidates a writable cache rather than
  reading stale data from a different storage location.
- Positive cache durations expire on access; every negative duration means
  infinite cache until reset or effective-parameter changes.
- Static reads of an attached resolver return the node's static value, even
  when a different computed value is cached internally.
- Null, undefined and other falsey values are valid cached results.

Async load results retain existing Promise support and are cached after
completion. This fix adds neither automatic refresh nor concurrent-load
coalescing. Parameter merging and fingerprint invalidation are unchanged.

Validation: `tests/readonly-cache-contract.test.js` covers cache expiry with a
controlled clock, zero/infinite cache, static node preservation, reset,
parameter changes, attachment changes and async completion.

The framework mixin's node-mediated legacy getter path invokes load directly;
its compatibility policy is separate and is not changed by this native fix.

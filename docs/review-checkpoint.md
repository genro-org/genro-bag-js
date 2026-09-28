# Review checkpoint — 2026-09-16

This checkpoint preserves the reviewed Bag/BagNode contracts, regression
tests and migration documentation. It is not a release; the package version
is unchanged. The browser build is copied into the integration repository.

Validation: 677 tests passed and the browser build completed.

Open: readOnly currently bypasses resolver caching. The new Python resolver
has been corrected to cache readonly results internally without changing the
node value; JS must still be aligned in the subsequent review.

Integration has 33 existing failed parity/audit tests requiring classification;
see the companion integration checkpoint. Browser acceptance remains pending.

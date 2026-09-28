# Changelog

## 0.10.0 — 2026-09-28

### Added

- Update and insert events carry a boolean `fired`
  ([#7](https://github.com/genropy/genro-bag-js/issues/7)). A fired write
  (`setItem(path, value, ..., fired=true)`) produces its event with
  `fired: true`; every other write produces `fired: false`. Parent Bags receive
  the same value, like `reason`. The reset to `null` after a fired write stays
  silent. Intermediate nodes created by the write carry `fired: false`.
  `BagNode.setValue` takes `fired` as its seventh argument. Delete events are
  unchanged. Same field as the legacy GenroPy Bag (`'fired': _fired`).

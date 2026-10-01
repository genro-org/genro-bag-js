# Changelog

## 0.10.1 — 2026-10-01

### Changed

- Published on npm as `@genrojs/bag`, alongside JSR `@genro/bag`.
- TYTX is imported as `@genrojs/tytx` (`^0.16.1`); `jsr.json` maps it to
  `jsr:@genro/tytx`. The `genro-tytx` alias of `@jsr/genro__tytx` and the
  `.npmrc` registry line are gone.
- Repository URLs point to `genro-org/genro-bag-js`.
- Releases publish to npm and JSR from the version tag (`publish.yml`).

## 0.10.0 — 2026-09-28

### Added

- Update and insert events carry a boolean `fired`
  ([#7](https://github.com/genro-org/genro-bag-js/issues/7)). A fired write
  (`setItem(path, value, ..., fired=true)`) produces its event with
  `fired: true`; every other write produces `fired: false`. Parent Bags receive
  the same value, like `reason`. The reset to `null` after a fired write stays
  silent. Intermediate nodes created by the write carry `fired: false`.
  `BagNode.setValue` takes `fired` as its seventh argument. Delete events are
  unchanged. Same field as the legacy GenroPy Bag (`'fired': _fired`).

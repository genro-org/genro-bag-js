# Changelog

## Unreleased

- Resolver inputs are the declared parameters: undeclared node attributes no
  longer reach `load()` or reload the resolver (#74).
- `UrlResolver` reads `url`, `method`, `qs`, `body`, `timeout` and `transport`
  as declared parameters; before, `load()` read them from `_kw`, where they
  were never stored, so the URL was undefined.
- Read-time kwargs are a one-off read and no longer write the cache (#75).

## 0.11.1 — 2026-10-27

- Preserve the deletion reason in popNode, pop and delItem notifications.
  The reason no longer occupies the pathlist argument or corrupts nested paths.
  Regression coverage checks root and nested deletion events.

## 0.11.0 — 2026-10-14

- Align passive resolver behavior with Python: reject removed scheduling options, keep reset lazy, and let node attributes override resolver defaults. See the migration note.

- Constructor and `fillFrom` accept only dictionaries, arrays and null; default
  recursive conversion preserves typed leaves and rejects container cycles.
- Literal string labels and per-list padded `r_` labels replace path inference
  and older numbering. Preparation errors leave existing data unchanged.
- `fromTytx` handles ordinary JSON, generic typed data and explicitly marked Bags.
  `toTytx` marks Bag roots; `fromJson` is a deprecated alias, without node heuristics.
- MessagePack carries the registered Bag type; row parent paths are label arrays.
- Date/Decimal ingestion and Python/JS round trips have regression coverage.

Read [migration-ingestion.md](docs/migration-ingestion.md) for downstream actions.


## 0.10.3 — 2026-10-04

### Added

- Hand-written type declarations in `src/index.d.ts`, referenced from
  `src/index.js` with `@ts-self-types` and published to JSR and npm
  (`types` in `package.json`). No runtime change.

## 0.10.2 — 2026-10-03

### Fixed

- `toXml()` writes `Date` values as ISO 8601 text in UTC instead of
  `Date.toString()`, which depended on the local time zone
  ([#10](https://github.com/genro-org/genro-bag-js/issues/10)). A value at UTC
  midnight is written as a date (`1990-05-02`), a value on 1970-01-01 as a time
  (`09:30:00Z`), any other value as a datetime (`2026-10-03T09:30:00Z`).

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

# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-02

### Added

- `adoptTransaction(tx, fn)` makes an externally established transaction the active transaction for the duration of `fn`, so functions using `transact` and the sugar functions join it instead of starting their own ([#10](https://github.com/cressie176/drizzle-transact/issues/10)). Previously drizzle-transact only saw transactions it started itself: inside an external `db.transaction` block, `Propagation.Required` started a separate transaction on a different connection (a deadlock hazard). Full transactional semantics are preserved within the adopted scope: `Propagation.RequiresNew` still opens an independent transaction on the bound database, and `Propagation.Nested` still creates a savepoint.
- `adoptDatabase(db, fn)` makes an externally supplied database handle the active transaction for the duration of `fn`, and additionally routes `Propagation.RequiresNew` and `Propagation.Nested` through the handle without opening transactions on it. This is for scopes where the environment already provides isolation — such as drizzle-explain, whose injected `drizzle-orm/pg-proxy` database cannot open transactions and runs inside an always-rolled-back sandbox. Under `adoptTransaction` those propagations would throw (`Nested`) or escape the sandbox and commit unmeasured statements to the real database (`RequiresNew`); under `adoptDatabase` every statement runs against the adopted handle and rolls back with the sandbox.

## [1.0.4] - 2026-09-02

### Fixed

- The drizzle-orm peer dependency range now admits 1.0.0 pre-releases (`>=0.36 || >=1.0.0-beta.1`), so projects on a drizzle 1.0.0 beta or release candidate install without an ERESOLVE failure. Semver ranges never match pre-release versions, so the previous `>=0.36` made npm reject otherwise-compatible installs. The library needed no code changes: the full test suite passes unchanged against 1.0.0-beta.22 and 1.0.0-rc.4, and fresh installs that do not pin drizzle-orm still resolve the stable release.

### Changed

- The README setup example and the test database now construct the Drizzle instance with `drizzle({ client: pool })` instead of `drizzle(pool)`. The positional-client form fails on drizzle 1.0; the config-object form works on every version the peer range admits.
- The README documents isolation level behaviour per propagation mode.

## [1.0.3] - 2026-08-21

### Added

- `withoutTransaction` sugar function for `Propagation.Never`.

### Removed

- The `Transactional` decorator.

## [1.0.2] - 2026-08-20

### Added

- `newTransaction`, `ensureTransaction`, and `nestTransaction` accept an `isolationLevel` option.
- `repository` field in package.json for provenance verification.

## [1.0.1] - 2026-08-20

### Added

- Sugar functions for each propagation mode.

### Removed

- Support for default transact options.

## [1.0.0] - 2026-08-20

Initial release.

- `createTransact` builds a transaction manager around your Drizzle database instance, propagating the active transaction through `AsyncLocalStorage` so it never needs to be passed between functions.
- Propagation modes: `Required`, `RequiresNew`, `Nested`, `RequiresExisting`, and `Never`.

[1.1.0]: https://github.com/cressie176/drizzle-transact/compare/v1.0.4...v1.1.0
[1.0.4]: https://github.com/cressie176/drizzle-transact/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/cressie176/drizzle-transact/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/cressie176/drizzle-transact/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/cressie176/drizzle-transact/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/cressie176/drizzle-transact/releases/tag/v1.0.0

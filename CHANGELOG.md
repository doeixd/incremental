# Changelog

## Unreleased

### Fixed

- The chained `.when(condition, part)` now runs its part through the same
  `Apply` validation as `.use(part)`: a conditional add of an existing key, a
  conditional derive with an unsatisfied dependency, and a conditional
  replacement of a missing key are all compile errors instead of slipping
  through to a runtime throw.
- Parts now carry and check their runtime `needs`. A part whose dependencies are
  not met throws `Incremental: missing required key "…"` even if the type-level
  ordering check is bypassed. A conditional contribution checks its needs only
  when it actually runs, so `when(false, part)` requires nothing.

## 0.1.0 — 2026-09-24

### Added

- `default` / `defaults` contribution policy: set a key only if it is absent.
  A default **guarantees** the key, so it can satisfy exhaustiveness. Available
  on both APIs (`I.default`, `I.defaults`, `.default`, `.defaults`).
- `ExpectDiagnostic<Actual, Expected>` helper and `tests/diagnostics.ts`, a
  compile-time contract for every diagnostic.
- `UnsupportedTargetError` for index-signature targets (`Record<string, T>`).
- `GuaranteedValues` guard: a guaranteed contribution must be assignable to the
  stored type, so optional keys cannot be set to `undefined` and required keys
  cannot be set to a possibly-`undefined` value.
- `docs/diagnostics.md` and `docs/variants.md`.

### Changed (breaking)

- Conditional contributions (`when`) now produce **optional** keys instead of a
  union state. `N` conditionals are `O(N)` in the type, not `O(2^N)`.
- `Needs` and completeness are measured against `RequiredKeys<State>` (the
  guaranteed keys), not `keyof State`.
- `UnsatisfiedDependencyError` now names ordering.
- Source split into `brands.ts`, `types.ts`, `runtime.ts`, `index.ts`.

### Fixed

- A broadly typed `Partial<T>` no longer claims every key.
- A `keyof T`-typed (dynamic) key no longer claims every key.
- Optional keys contributed via `partial` / `derive` are typed as present
  (`boolean`, not `boolean | undefined`).

# Diagnostics

Incremental reports failures as named diagnostic types instead of `never`, so
the compiler error tells you what went wrong. This page lists every diagnostic
with a failing example and the fix.

The names below are the actual types (see `src/types.ts`). They are covered by
`tests/diagnostics.ts`, which fails to compile if a diagnostic changes.

## `MissingKeysError<K>`

> Incremental build is not exhaustive. Missing required keys.

```ts
I.build(I.with.host("localhost"), I.with.port(3000), I.exhaustive);
//                                                    ~~~~~~~~~~~
// Exhaustive is not assignable to MissingKeysError<"url">
```

**Fix:** provide the missing keys before `I.exhaustive`, or drop the marker to
get the exact partial shape.

## `DuplicateContributionError<K>`

> Incremental part contributes keys that already exist.

```ts
I.build(I.with.host("a"), I.with.host("b"));
//                         ~~~~~~~~~~~~~~
// DuplicateContributionError<"host">
```

**Fix:** remove the duplicate, or use `override` / `update` (or `default`) to
handle an existing key explicitly.

## `UnsatisfiedDependencyError<K>`

> Incremental part requires keys that are not available yet. Move the part that
> provides them earlier.

```ts
I.build(
  I.derive(["host"], ({ host }) => ({ url: host })),
  I.with.host("localhost"),
);
```

**Fix:** move the part that provides the key before the part that needs it. The
build is a fold, so dependencies must appear earlier in the argument list (a
topological order).

## `MissingReplacementError<K>`

> Incremental replacement targets keys that have not been provided.

```ts
I.build(I.override("host", "example.com"));
```

**Fix:** establish the key first (`I.with.host(...)` or `I.default(...)`), then
replace it.

## `ExtraKeysError<K>`

> Incremental contribution contains keys that are not part of the target type.

```ts
I.build(I.derive(["host"], () => ({ url: "x", banana: 1 })));
//                                         ~~~~~~~~
// ExtraKeysError<"banana">
```

`I.partial({ ..., banana: 1 })` reports this earlier, as an excess-property
error on the object literal.

**Fix:** remove the key or add it to the target type.

## `DynamicPartsError`

> build() needs a statically known list of parts.

```ts
const parts = [I.with.host("a"), I.with.port(1)];
I.build(...parts); // ✗ a mutable array
```

**Fix:** spread a tuple: `const parts = [...] as const`.

## `ExhaustiveMustBeLastError`

> The exhaustive marker must be the final argument to build().

```ts
I.build(I.exhaustive, I.with.host("a"));
```

**Fix:** move `I.exhaustive` to the end.

## `InvalidPartError<P>`

> Value is not a valid Incremental part.

```ts
I.build({ host: "a" });
```

**Fix:** pass a value produced by `I.field`, `I.with.*`, `I.partial`,
`I.derive`, `I.override`, `I.update`, `I.default`, `I.defaults` or `I.when`.

## `UnsupportedTargetError`

> Incremental targets finite product types. Index signatures such as
> `Record<string, T>` are not supported.

```ts
const R = Incremental.make<Record<string, number>>();
R.build(); // ✗ exhaustiveness is meaningless for infinitely many keys
```

**Fix:** use a finite object type.

## Asserting diagnostics in tests

`ExpectDiagnostic<Actual, Expected>` is a compile-time assertion:

```ts
import { Apply, DuplicateContributionError, ExpectDiagnostic } from "incremental";

type Check = ExpectDiagnostic<
  Apply<Config, { host: string }, Part<Config, { host: string }, never, "add">>,
  DuplicateContributionError<"host">
>;
const _ok: Check = true; // fails to compile if the diagnostic changes
```

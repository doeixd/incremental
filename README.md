# Incremental

[![npm version](https://img.shields.io/npm/v/@doeixd/incremental.svg)](https://www.npmjs.com/package/@doeixd/incremental)
[![npm downloads](https://img.shields.io/npm/dm/@doeixd/incremental.svg)](https://www.npmjs.com/package/@doeixd/incremental)
[![license](https://img.shields.io/npm/l/@doeixd/incremental.svg)](https://github.com/doeixd/incremental/blob/master/LICENSE)
[![types](https://img.shields.io/npm/types/@doeixd/incremental.svg)](https://www.npmjs.com/package/@doeixd/incremental)

> Build an object piece by piece, know its exact shape at every step, and prove
> when it is complete.

`Incremental` is a typed fold over object contributions. Each contribution
declares what it **provides**, what it **requires**, and how it combines. You
fold them together; the type system tracks exactly what has been constructed;
and `exhaustive` turns that knowledge into a completeness proof.

```text
Part<T>  requires some keys  provides some keys
   build folds parts left → right
   the type state grows
   exhaustive proves every required key exists
```

Why not object spread? Because spread throws away the interesting facts:

- a non-exhaustive build knows its **exact** shape — not `Partial<T>`;
- duplicate contributions fail by default;
- a part that needs a key cannot run before something provides it;
- a replacement must target a key that already exists;
- conditional contributions never satisfy exhaustiveness.

## Install

```bash
npm install @doeixd/incremental
```

## Quick start

```ts
import { Incremental } from "@doeixd/incremental";

interface Config {
  host: string;
  port: number;
  secure?: boolean;
  url: string;
}

const I = Incremental.make<Config>();

const config = I.build(
  I.with.host("localhost"),
  I.with.port(3000),
  I.partial({ secure: true }),
  I.derive(["host", "port", "secure"], ({ host, port, secure }) => ({
    url: `${secure ? "https" : "http"}://${host}:${port}`,
  })),
  I.exhaustive,
);
//    ^? Config
```

## The core idea: `build` vs `exhaustive`

`build` reports **exactly what you constructed**. It does not pretend the result
is a `Partial<T>`:

```ts
const partial = I.build(I.with.host("localhost"), I.with.port(3000));
//    ^? { host: string; port: number }

partial.host; // string
partial.port; // number
partial.url; // ✗ compile error: url was never constructed
```

`I.exhaustive` additionally proves the result is a complete `T`. Because it
returns `T & State`, optional properties you supplied stay known to be present:

```ts
const config = I.build(
  I.with.host("localhost"),
  I.with.port(3000),
  I.with.secure(true),
  I.derive(["host", "port", "secure"], ({ host, port, secure }) => ({
    url: `${secure ? "https" : "http"}://${host}:${port}`,
  })),
  I.exhaustive,
);

config.secure; // boolean — not boolean | undefined
```

## The contributions

| API                        | Provides             | Requires | Policy  |
| -------------------------- | -------------------- | -------- | ------- |
| `I.field(key, value)`      | `key`                | —        | add     |
| `I.with.key(value)`        | `key`                | —        | add     |
| `I.partial({ ... })`       | each provided key    | —        | add     |
| `I.partial(() => ({...}))` | each provided key    | —        | add     |
| `I.derive([keys], f)`      | keys returned by `f` | `keys`   | add     |
| `I.override(key, value)`   | `key`                | `key`    | replace |
| `I.update(key, f)`         | `key`                | `key`    | replace |
| `I.default(key, value)`    | `key`                | —        | default |
| `I.defaults({ ... })`      | each provided key    | —        | default |
| `I.when(condition, part)`  | conditionally        | part's   | part's  |

- **add** — the key must not exist yet.
- **replace** — the key must already exist.
- **default** — set the key only if it is absent (and the key is guaranteed).

## Two ways to build

Both styles produce and consume the same first-class `Part` values.

**Composable** — best when independent modules each export a part:

```ts
const routingPart = I.partial({ host: "router" });
const remotePart = I.partial({ port: 7000 });
const derivedPart = I.derive(["host", "port"], ({ host, port }) => ({
  url: `${host}:${port}`,
}));

const result = I.build(routingPart, remotePart, derivedPart, I.exhaustive);
```

**Chained** — best for one cohesive constructor. Method chaining gives
TypeScript a real sequential inference boundary, so `derive` sees exactly what
came before, with no dependency list:

```ts
const config = I.begin()
  .field("host", "localhost")
  .field("port", 3000)
  .derive(({ host, port }) => ({ url: `http://${host}:${port}` }))
  .exhaustive();
```

Use `.use(part)` to drop a reusable part into a chain.

<details>
<summary><strong>Conditionals</strong></summary>

`I.when(condition, part)` applies a part conditionally. Added keys become
**optional**, so a conditional contribution never satisfies exhaustiveness:

```ts
const result = I.build(I.when(isDev, I.with.debug(true)));
//    ^? { debug?: boolean }

I.build(I.when(isDev, I.with.debug(true)), I.exhaustive);
//                                          ~~~~~~~~~~~ ✗ debug is not guaranteed
```

A conditional **replacement** keeps its key guaranteed, because the key exists
before and after:

```ts
I.build(I.with.debug(false), I.when(isDev, I.override("debug", true)));
//    ^? { debug: boolean }
```

</details>

<details>
<summary><strong>Defaults and config merging</strong></summary>

A default sets a key only if it is absent, and **guarantees** the key. This is
the config-merge case in a single pass:

```ts
const config = I.build(
  I.defaults({ host: "localhost", port: 3000, secure: false }),
  I.override("port", 8080),
  I.derive(["host", "port", "secure"], ({ host, port, secure }) => ({
    url: `${secure ? "https" : "http"}://${host}:${port}`,
  })),
  I.exhaustive,
);
```

`default` / `defaults` are also available on the chain.

</details>

<details>
<summary><strong>What a part actually provides</strong></summary>

A contribution only provides keys its type **guarantees** are present. This is
what keeps `exhaustive` honest.

| Input                                        | Provides                         |
| -------------------------------------------- | -------------------------------- |
| `I.partial({ host: "x" })`                   | `host`                           |
| `I.partial(v)` where `v: Partial<T>`         | nothing — the keys may be absent |
| `I.field(k, v)` where `k: keyof T` (a union) | one of the keys, none guaranteed |
| `I.derive([...], f)`                         | the keys `f` definitely returns  |
| `I.default(...)` / `I.defaults(...)`         | the keys, guaranteed             |
| `I.when(cond, part)`                         | optional versions of the keys    |

A guaranteed value must also be assignable to the stored type, so an optional
key cannot be set to `undefined`, and a required key cannot be set to a
possibly-`undefined` value.

</details>

<details>
<summary><strong>Ordering and dependencies</strong></summary>

The build is a **fold**, so it imposes a total order: dependencies must appear
earlier in the argument list, i.e. a topological order.

```ts
I.build(
  configPart, // provides `config`
  loggingPart, // needs `config`
  I.exhaustive,
);
```

Reversing them fails with `UnsatisfiedDependencyError<"config">`. Think of
`derive([...needs], ...)` as declaring a topological edge, not as general
dependency injection.

</details>

<details>
<summary><strong>Full API reference</strong></summary>

### `Incremental.make<T>()`

Creates a builder for target type `T`. The type parameter is purely static.

### `I.build(...parts)`

Folds parts left to right. With `I.exhaustive` as the final argument, the result
is proven to satisfy `T`; otherwise the result is the exact inferred state.

### `I.begin()`

Starts a chained builder:

```ts
I.begin()
  .field(key, value)
  .partial({ ... })
  .derive((current) => ({ ... }))
  .default(key, value)
  .defaults({ ... })
  .use(part)
  .override(key, value)
  .update(key, (current) => next)
  .when(condition, part)
  .build();      // finalize without a completeness proof
  .exhaustive(); // only callable once every required key exists
```

### Notes

- `field` is the canonical setter and works with dynamic keys; `with.*` is
  namespaced sugar backed by a `Proxy`.
- `partial` accepts an object or a lazy factory. It rejects keys outside `T`.
- `derive` receives only the keys it declared.
- `override` / `update` fail unless the key has already been established.
- `when` and the lazy `partial` form are `@experimental`.

</details>

## Before / after: a Foldkit update

[Foldkit](https://foldkit.dev) `update` functions return the next Model (and any
Commands). When a Message produces a **whole next state** — a reset, an init, a
submodel transition — `Incremental` can construct it and prove it complete.

Given a small counter model:

```ts
const Model = Schema.Struct({
  count: Schema.Number,
  step: Schema.Number,
  history: Schema.Array(Schema.Number),
  canUndo: Schema.Boolean,
  label: Schema.String,
});
type Model = typeof Model.Type;
```

**Before** — every field is listed by hand, and the derived fields (`canUndo`,
`label`) are recomputed in the caller, so they can drift out of sync:

```ts
import { modifyFields } from "foldkit/struct";

ClickedReset: () => ({
  model: modifyFields(model, {
    count: () => 0,
    step: () => 1,
    history: () => [],
    canUndo: () => false,
    label: () => "Count: 0",
  }),
}),
```

**After** — the next state is _constructed_: the compiler rejects a missing
field, and `derive` computes the derived fields from their dependencies:

```ts
import { Incremental } from "@doeixd/incremental";

const ModelI = Incremental.make<Model>();

ClickedReset: () => ({
  model: ModelI.build(
    ModelI.with.count(0),
    ModelI.with.step(1),
    ModelI.with.history([]),
    ModelI.derive(["count", "step"], ({ count, step }) => ({
      canUndo: false,
      label: `Count: ${count} · step ${step}`,
    })),
    ModelI.exhaustive,
  ),
}),
```

Add a field to `Model` and this handler stops compiling until you account for it
— which is what you want for a reset. For messages that tweak a single field,
keep `modifyFields`; `Incremental` is for producing a complete state.

## Before / after: Foldkit messages

### Constructing a message

A Message variant can carry a payload whose fields depend on one another.
Listing them by hand means recomputing the derived ones and keeping them
consistent.

**Before** — `subtotal` is computed three times and `total` is arithmetic done
in the caller:

```ts
h.button(
  [
    h.OnClick(
      Message.SubmittedOrder({
        items,
        currency: "USD",
        subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        tax: items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 0.08,
        total: items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 1.08,
      }),
    ),
  ],
  ["Place order"],
);
```

**After** — the payload is built once, with the derived fields computed from
their declared dependencies:

```ts
import { Incremental } from "@doeixd/incremental";

interface OrderPayload {
  items: ReadonlyArray<LineItem>;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
}
const OrderI = Incremental.make<OrderPayload>();

h.button(
  [
    h.OnClick(
      Message.SubmittedOrder(
        OrderI.build(
          OrderI.with.items(items),
          OrderI.with.currency("USD"),
          OrderI.derive(["items", "currency"], ({ items, currency }) => {
            const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const rate = currency === "USD" ? 0.08 : 0.2;
            const tax = Math.round(subtotal * rate);
            return { subtotal, tax, total: subtotal + tax };
          }),
          OrderI.exhaustive,
        ),
      ),
    ),
  ],
  ["Place order"],
);
```

### Composing a message union

When several features each own a slice of the app's messages, the cases are
usually merged with object spread. A tag claimed by two features silently
overwrites, and nothing proves the union is complete.

Each feature exports its cases:

```ts
// features/routing/messages.ts
export const cases = {
  Navigated: { route: Route },
  LinkClicked: { href: Schema.String },
};
```

```ts
// features/remote/messages.ts
export const cases = {
  Received: { payload: Schema.String },
  Failed: { error: Schema.String },
};
```

**Before** — spread hides the collision:

```ts
import { defineMessageUnion } from "foldkit/message";
import * as Routing from "./features/routing/messages";
import * as Remote from "./features/remote/messages";

const Message = defineMessageUnion({
  ...Routing.cases,
  ...Remote.cases,
});
```

**After** — a duplicate tag is a compile error, and the union is proven
complete:

```ts
import { Incremental } from "@doeixd/incremental";

type MessageCases = typeof Routing.cases & typeof Remote.cases;

const Cases = Incremental.make<MessageCases>();
const cases = Cases.build(
  Cases.partial(Routing.cases),
  Cases.partial(Remote.cases),
  Cases.exhaustive,
);

const Message = defineMessageUnion(cases);
```

## Diagnostics

Invalid builds report a **named diagnostic** at the offending argument, rather
than an opaque `never`:

```text
MissingKeysError<"url">
DuplicateContributionError<"host">
UnsatisfiedDependencyError<"config">
ExtraKeysError<"banana">
```

See [`docs/diagnostics.md`](docs/diagnostics.md) for the full list and fixes.

## Limits

- **Finite product types only.** Index signatures (`Record<string, T>`) are
  rejected with `UnsupportedTargetError`; exhaustiveness is meaningless for
  infinitely many keys.
- **Discriminated unions are out of scope** for now — see
  [`docs/variants.md`](docs/variants.md) for the composition pattern.
- **Statically known parts.** Spread a tuple; a mutable array must be asserted
  `as const`.
- Contributions whose types do not guarantee their keys are handled
  conservatively and can never satisfy `exhaustive`.
- `any` values are not defended against (as always).

## Links

- npm: <https://www.npmjs.com/package/@doeixd/incremental>
- GitHub: <https://github.com/doeixd/incremental>
- Issues: <https://github.com/doeixd/incremental/issues>

## Development

```bash
vp install        # install dependencies
vp test           # runtime tests
vp check          # format, lint, type check
vp run typecheck  # type-check only
vp run build      # build the library
```

Type-level assertions live in `tests/types.ts`, `tests/edge-cases.ts` and
`tests/diagnostics.ts`. They are type-checked but never executed, so
`@ts-expect-error` cases can describe invalid builds safely.

import { expectTypeOf } from "vite-plus/test";
import { Incremental } from "../src/index.ts";

// =============================================================================
// Type-level assertions. This file is intentionally not a test file: it is
// type-checked but never executed, so `@ts-expect-error` cases can describe
// invalid builds without throwing at runtime.
// =============================================================================

interface Config {
  host: string;
  port: number;
  secure?: boolean;
  url: string;
}

const I = Incremental.make<Config>();

/** Forces evaluation of an expression that is expected to be a type error. */
const expectError = (value: unknown) => value;

// -----------------------------------------------------------------------------
// Positive: exact inference
// -----------------------------------------------------------------------------

const partial = I.build(I.with.host("localhost"), I.with.port(3000));
expectTypeOf(partial).toEqualTypeOf<{ host: string; port: number }>();
expectTypeOf(partial.host).toEqualTypeOf<string>();
expectTypeOf(partial.port).toEqualTypeOf<number>();

// @ts-expect-error url was never constructed
expectError(partial.url);

const complete = I.build(
  I.with.host("localhost"),
  I.with.port(3000),
  I.derive(["host", "port"], ({ host, port }) => ({
    url: `http://${host}:${port}`,
  })),
  I.exhaustive,
);
expectTypeOf(complete).toMatchTypeOf<Config>();
expectTypeOf(complete.url).toEqualTypeOf<string>();
expectTypeOf(complete.secure).toEqualTypeOf<boolean | undefined>();

const withOptional = I.build(
  I.with.host("localhost"),
  I.with.port(3000),
  I.with.secure(true),
  I.derive(["host", "port", "secure"], ({ host, port, secure }) => ({
    url: `${secure ? "https" : "http"}://${host}:${port}`,
  })),
  I.exhaustive,
);
expectTypeOf(withOptional.secure).toEqualTypeOf<boolean>();

// `field` is the canonical setter.
const viaField = I.build(I.field("host", "localhost"));
expectTypeOf(viaField).toEqualTypeOf<{ host: string }>();

// `partial` adds exactly the keys provided.
const viaPartial = I.build(I.partial({ host: "localhost", port: 3000 }));
expectTypeOf(viaPartial).toEqualTypeOf<{ host: string; port: number }>();

// Lazy partial is semantically identical.
const viaLazy = I.build(I.partial(() => ({ host: "localhost" })));
expectTypeOf(viaLazy).toEqualTypeOf<{ host: string }>();

// An empty build constructs an empty state.
const empty = I.build();
expectTypeOf(empty).toEqualTypeOf<{}>();

// A target with no required keys can be completed with just the marker.
interface AllOptional {
  a?: number;
  b?: string;
}
const O = Incremental.make<AllOptional>();
expectTypeOf(O.build(O.exhaustive)).toMatchTypeOf<AllOptional>();

// -----------------------------------------------------------------------------
// Positive: override / update
// -----------------------------------------------------------------------------

const overridden = I.build(I.with.host("localhost"), I.override("host", "example.com"));
expectTypeOf(overridden).toEqualTypeOf<{ host: string }>();

const updated = I.build(
  I.with.port(3000),
  I.update("port", (n) => n + 1),
);
expectTypeOf(updated).toEqualTypeOf<{ port: number }>();

// -----------------------------------------------------------------------------
// Positive: conditional contributions track possible vs guaranteed keys
// -----------------------------------------------------------------------------

const conditional = I.build(I.when(true, I.with.secure(true)));
// `secure` is possible but not guaranteed, so it is optional.
expectTypeOf(conditional).toEqualTypeOf<{ secure?: boolean }>();

// A conditional contribution cannot satisfy exhaustiveness.
interface ConditionalTarget {
  debug: boolean;
}
const C = Incremental.make<ConditionalTarget>();
// @ts-expect-error debug is only conditionally provided
C.build(C.when(true, C.with.debug(true)), C.exhaustive);

// Parts are tied to their target type.
interface Other {
  x: number;
}
const J = Incremental.make<Other>();
// @ts-expect-error a Part<Other> is not a Part<Config>
I.build(J.partial({ x: 1 }));

// -----------------------------------------------------------------------------
// Positive: chained builder
// -----------------------------------------------------------------------------

const chained = I.begin()
  .field("host", "localhost")
  .field("port", 3000)
  .derive(({ host, port }) => ({ url: `http://${host}:${port}` }))
  .exhaustive();
expectTypeOf(chained).toMatchTypeOf<Config>();

const chainedPartial = I.begin().field("host", "localhost").build();
expectTypeOf(chainedPartial).toEqualTypeOf<{ host: string }>();

// Sequential inference: `current` sees exactly what came before.
I.begin()
  .field("host", "localhost")
  .derive((current) => {
    expectTypeOf(current.host).toEqualTypeOf<string>();
    // @ts-expect-error port has not been provided yet
    expectError(current.port);
    return {};
  });

// -----------------------------------------------------------------------------
// Negative: exhaustiveness
// -----------------------------------------------------------------------------

// @ts-expect-error url is missing
I.build(I.with.host("localhost"), I.with.port(3000), I.exhaustive);

// @ts-expect-error the exhaustive marker must be last
I.build(I.exhaustive, I.with.host("localhost"));

// @ts-expect-error the chain is not complete
I.begin().field("host", "localhost").exhaustive();

// -----------------------------------------------------------------------------
// Negative: duplicate contributions
// -----------------------------------------------------------------------------

// @ts-expect-error host is contributed twice
I.build(I.with.host("a"), I.with.host("b"));

I.begin()
  .field("host", "localhost")
  .derive(() => ({ host: "other" }))
  // @ts-expect-error a chained derive cannot overwrite an existing key
  .build();

// -----------------------------------------------------------------------------
// Negative: dependencies must be established first
// -----------------------------------------------------------------------------

I.build(
  // @ts-expect-error host is not available yet
  I.derive(["host"], ({ host }) => ({ url: host })),
  I.with.host("localhost"),
);

// @ts-expect-error override requires the key to exist
I.build(I.override("host", "example.com"));

// @ts-expect-error update requires the key to exist
I.build(I.update("port", (n) => n + 1));

// -----------------------------------------------------------------------------
// Negative: contributions must target the type
// -----------------------------------------------------------------------------

// @ts-expect-error banana is not part of Config
I.partial({ host: "localhost", banana: 1 });

// @ts-expect-error unknown field
I.field("banana", 1);

// @ts-expect-error wrong value type
I.field("port", "not a number");

// A derive whose return has no keys in common with the target provides nothing.
const unknownOnly = I.derive(["host"], () => ({ banana: 1 }));
expectTypeOf(I.build(I.with.host("a"), unknownOnly)).toEqualTypeOf<{ host: string }>();

// @ts-expect-error derive cannot add unknown keys (detected by the fold)
I.build(I.derive(["host"], () => ({ url: "http://localhost", banana: 1 })));

I.begin()
  .field("host", "localhost")
  .derive(() => ({ url: "http://localhost", banana: 1 }))
  // @ts-expect-error a chained derive cannot add unknown keys
  .build();

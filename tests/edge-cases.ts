import { expectTypeOf } from "vite-plus/test";
import { Incremental } from "../src/index.ts";
import type { Part } from "../src/index.ts";

// =============================================================================
// Edge cases. Type-checked, never executed.
// =============================================================================

interface Config {
  host: string;
  port: number;
  secure?: boolean;
  url: string;
}
const I = Incremental.make<Config>();
const expectError = (value: unknown) => value;

// -----------------------------------------------------------------------------
// Guaranteed vs merely possible keys in contributions
// -----------------------------------------------------------------------------

// A broadly typed Partial guarantees nothing, even though it names keys.
const broad: Partial<Config> = { host: "x" };
expectTypeOf(I.build(I.partial(broad))).toEqualTypeOf<{}>();
// @ts-expect-error a broad Partial cannot prove completeness
I.build(I.partial(broad), I.exhaustive);

// A concretely typed object does provide its keys.
const required: { host: string } = { host: "x" };
expectTypeOf(I.build(I.partial(required))).toEqualTypeOf<{ host: string }>();

// A derive with a broadly typed return guarantees nothing.
const deriveBroad = I.derive(["host"], () => ({}) as Partial<Config>);
expectTypeOf(I.build(I.with.host("x"), deriveBroad)).toEqualTypeOf<{ host: string }>();

// A lazy factory typed broadly is equally conservative.
const lazyBroad: () => Partial<Config> = () => ({ host: "x" });
expectTypeOf(I.build(I.partial(lazyBroad))).toEqualTypeOf<{}>();

// -----------------------------------------------------------------------------
// Inference
// -----------------------------------------------------------------------------

// needs infer as a tuple without `as const`.
const d1 = I.derive(["host", "port"], ({ host, port }) => ({ url: `${host}:${port}` }));
expectTypeOf(d1).toEqualTypeOf<Part<Config, { url: string }, "host" | "port", "add">>();

// derive infers from a variable return.
const makeUrl = (host: string, port: number) => ({ url: `${host}:${port}` });
const d2 = I.derive(["host", "port"], ({ host, port }) => makeUrl(host, port));
expectTypeOf(d2).toEqualTypeOf<Part<Config, { url: string }, "host" | "port", "add">>();

// derive can provide multiple keys.
const d3 = I.derive(["host"], ({ host }) => ({ url: host, port: 1 }));
expectTypeOf(d3).toEqualTypeOf<Part<Config, { url: string; port: number }, "host", "add">>();

// Empty contributions are allowed.
expectTypeOf(I.build(I.partial({}))).toEqualTypeOf<{}>();
expectTypeOf(I.build(I.derive([], () => ({})))).toEqualTypeOf<{}>();

// A part stored in a variable still infers.
const hostPart = I.with.host("x");
expectTypeOf(I.build(hostPart)).toEqualTypeOf<{ host: string }>();

// A tuple of parts can be spread.
const tupleParts = [I.with.host("a"), I.with.port(1)] as const;
expectTypeOf(I.build(...tupleParts)).toEqualTypeOf<{ host: string; port: number }>();

// A mutable array cannot be folded statically.
const arrayParts = [I.with.host("a"), I.with.port(1)];
// @ts-expect-error a mutable array is not a statically known list of parts
I.build(...arrayParts);

// A union-typed (dynamic) key cannot prove which key was set.
declare const dynamicKey: keyof Config;
const dynamic = I.build(I.field(dynamicKey, "x"));
type DynamicState = { host: string } | { port: number } | { secure: boolean } | { url: string };
const dynamicIsExpected: DynamicState = dynamic;
const dynamicIsExact: typeof dynamic = null as unknown as DynamicState;
void dynamicIsExpected;
void dynamicIsExact;
// No single key is guaranteed by a dynamic contribution.
// @ts-expect-error host is not guaranteed
expectError(dynamic.host);
// @ts-expect-error port is not guaranteed
expectError(dynamic.port);
// @ts-expect-error a dynamic key cannot prove completeness
I.build(I.field(dynamicKey, "x"), I.exhaustive);

// -----------------------------------------------------------------------------
// Optional properties
// -----------------------------------------------------------------------------

const optional = I.build(I.partial({ secure: true }));
expectTypeOf(optional).toEqualTypeOf<{ secure: boolean }>();

// An optional key cannot be explicitly set to undefined; if it is present it
// has a real value.
// @ts-expect-error undefined is not a value for an optional key
I.with.secure(undefined);
// @ts-expect-error undefined is not a value for an optional key
I.field("secure", undefined);

// derive sees a non-undefined value for an optional dependency.
I.derive(["secure"], ({ secure }) => {
  expectTypeOf(secure).toEqualTypeOf<boolean>();
  return { url: String(secure) };
});

// A guaranteed value must be assignable to the stored type.
declare const maybeHost: string | undefined;
declare const maybeBool: boolean | undefined;
// @ts-expect-error host may be undefined
I.partial({ host: maybeHost });
// @ts-expect-error host may not be explicitly undefined
I.partial({ host: undefined });
// @ts-expect-error secure may be undefined
I.partial({ secure: maybeBool });
// @ts-expect-error derive may not provide a possibly-undefined required key
I.derive(["port"], () => ({ host: maybeHost }));

// A lazy factory that cannot satisfy the guard provides nothing.
expectTypeOf(I.build(I.partial(() => ({ host: maybeHost })))).toEqualTypeOf<{}>();

// A required key whose type genuinely includes undefined is still allowed.
interface WithUndef {
  a: string | undefined;
  b: string;
}
const U = Incremental.make<WithUndef>();
expectTypeOf(U.build(U.partial({ a: undefined }))).toEqualTypeOf<{ a: string | undefined }>();

// override on an optional key requires it to be provided first.
// @ts-expect-error secure has not been provided
I.build(I.override("secure", true));

const optionalOverride = I.build(I.with.secure(true), I.override("secure", false));
expectTypeOf(optionalOverride).toEqualTypeOf<{ secure: boolean }>();

// -----------------------------------------------------------------------------
// Conditional contributions
// -----------------------------------------------------------------------------

// A conditional key is not usable by a later derive.
I.build(
  // @ts-expect-error secure is not guaranteed
  I.when(true, I.with.secure(true)),
  I.derive(["secure"], ({ secure }) => ({ url: String(secure) })),
);

// A guaranteed key remains usable when a conditional is present.
const conditionalDerive = I.build(
  I.with.secure(true),
  I.when(true, I.with.host("a")),
  I.derive(["secure"], ({ secure }) => ({ url: String(secure) })),
);
expectTypeOf(conditionalDerive).toEqualTypeOf<{
  secure: boolean;
  host?: string;
  url: string;
}>();

// A conditional replace still requires the key to exist.
// @ts-expect-error secure has not been provided
I.build(I.when(true, I.override("secure", true)));

// A conditional plus exhaustive over guaranteed required keys is fine.
const conditionalComplete = I.build(
  I.with.host("a"),
  I.with.port(1),
  I.derive(["host", "port"], ({ host, port }) => ({ url: `${host}:${port}` })),
  I.when(true, I.with.secure(true)),
  I.exhaustive,
);
expectTypeOf(conditionalComplete).toMatchTypeOf<Config>();

// The chained builder can read a conditional key, but only as possibly absent.
I.begin()
  .field("host", "a")
  .when(true, I.with.secure(true))
  .derive((current) => {
    expectTypeOf(current.secure).toEqualTypeOf<boolean | undefined>();
    return { url: String(current.secure) };
  });

// -----------------------------------------------------------------------------
// Defaults
// -----------------------------------------------------------------------------

// A default guarantees its key even when nothing else provides it.
const defaultComplete = I.build(
  I.defaults({ host: "a", port: 1 }),
  I.derive(["host", "port"], ({ host, port }) => ({ url: `${host}:${port}` })),
  I.exhaustive,
);
expectTypeOf(defaultComplete).toMatchTypeOf<Config>();

// A default keeps the existing type and never conflicts with an existing key.
const defaultKeeps = I.build(I.with.host("a"), I.default("host", "b"));
expectTypeOf(defaultKeeps).toEqualTypeOf<{ host: string }>();

const defaultAfterConditional = I.build(
  I.when(true, I.with.secure(true)),
  I.default("secure", false),
);
expectTypeOf(defaultAfterConditional).toEqualTypeOf<{ secure: boolean }>();

// A broadly typed Partial provides nothing, even for defaults.
const broadDefaults: Partial<Config> = { host: "x" };
expectTypeOf(I.build(I.defaults(broadDefaults))).toEqualTypeOf<{}>();

// Defaults can satisfy exhaustiveness, including for optional keys.
const defaultsComplete = I.build(
  I.defaults({ host: "h", port: 1, secure: false }),
  I.derive(["host", "port"], ({ host, port }) => ({ url: `${host}:${port}` })),
  I.exhaustive,
);
expectTypeOf(defaultsComplete).toMatchTypeOf<Config>();

// The chain's defaults can complete a build.
const chainedDefaults = I.begin()
  .defaults({ host: "h", port: 1 })
  .derive(({ host, port }) => ({ url: `${host}:${port}` }))
  .exhaustive();
expectTypeOf(chainedDefaults).toMatchTypeOf<Config>();

// -----------------------------------------------------------------------------
// Index signatures are rejected with a named diagnostic
// -----------------------------------------------------------------------------

const R = Incremental.make<Record<string, number>>();
// @ts-expect-error index signatures are not supported
R.build();
// @ts-expect-error index signatures are not supported
R.begin().exhaustive();

// -----------------------------------------------------------------------------
// Conditionals scale linearly, not exponentially
// -----------------------------------------------------------------------------

interface FeatureFlags {
  a?: boolean;
  b?: boolean;
  c?: boolean;
  d?: boolean;
  e?: boolean;
  f?: boolean;
  g?: boolean;
  h?: boolean;
  i?: boolean;
  j?: boolean;
  host: string;
  url: string;
}
const F = Incremental.make<FeatureFlags>();
const flags = F.build(
  F.with.host("h"),
  F.derive(["host"], ({ host }) => ({ url: host })),
  F.when(true, F.with.a(true)),
  F.when(true, F.with.b(true)),
  F.when(true, F.with.c(true)),
  F.when(true, F.with.d(true)),
  F.when(true, F.with.e(true)),
  F.when(true, F.with.f(true)),
  F.when(true, F.with.g(true)),
  F.when(true, F.with.h(true)),
  F.when(true, F.with.i(true)),
  F.when(true, F.with.j(true)),
  F.exhaustive,
);
expectTypeOf(flags).toMatchTypeOf<FeatureFlags>();

// -----------------------------------------------------------------------------
// Composition across contribution kinds
// -----------------------------------------------------------------------------

// An optional key provided up front can be used by a derive.
const optionalThenDerive = I.build(
  I.with.secure(true),
  I.derive(["secure"], ({ secure }) => ({ url: `http://x:${secure}` })),
  I.with.host("a"),
  I.with.port(1),
  I.exhaustive,
);
expectTypeOf(optionalThenDerive).toMatchTypeOf<Config>();

// override can target a key provided by partial.
const overrideFromPartial = I.build(I.partial({ host: "a" }), I.override("host", "b"));
expectTypeOf(overrideFromPartial).toEqualTypeOf<{ host: string }>();

// update can target a derived key.
const updateDerived = I.build(
  I.with.host("a"),
  I.with.port(1),
  I.derive(["host", "port"], ({ host, port }) => ({ url: `${host}:${port}` })),
  I.update("url", (url) => url.toUpperCase()),
  I.exhaustive,
);
expectTypeOf(updateDerived).toMatchTypeOf<Config>();

// Repeated replacements are allowed.
const repeated = I.build(I.with.host("a"), I.override("host", "b"), I.override("host", "c"));
expectTypeOf(repeated).toEqualTypeOf<{ host: string }>();

// -----------------------------------------------------------------------------
// Duplicate detection across contribution kinds
// -----------------------------------------------------------------------------

const hostPart2 = I.with.host("a");
const duplicateHost = I.derive(["host"], ({ host }) => ({ host }));
// @ts-expect-error derive returns host which already exists
I.build(hostPart2, duplicateHost);

// @ts-expect-error partial provides host which already exists
I.build(I.with.host("a"), I.partial({ host: "b" }));

// -----------------------------------------------------------------------------
// Chained use()
// -----------------------------------------------------------------------------

const needsHost = I.derive(["host"], ({ host }) => ({ url: host }));
// @ts-expect-error host is not available
I.begin().use(needsHost);

const used = I.begin().field("host", "a").use(needsHost).field("port", 1).exhaustive();
expectTypeOf(used).toMatchTypeOf<Config>();

I.begin()
  .field("host", "a")
  // @ts-expect-error host already provided
  .use(I.partial({ host: "b" }));

// -----------------------------------------------------------------------------
// Namespacing avoids collisions with the API surface
// -----------------------------------------------------------------------------

interface Collision {
  field: string;
  partial: string;
  build: string;
}
const W = Incremental.make<Collision>();
const collision = W.build(W.with.field("a"), W.with.partial("b"), W.with.build("c"), W.exhaustive);
expectTypeOf(collision).toMatchTypeOf<Collision>();

// -----------------------------------------------------------------------------
// Exhaustive placement
// -----------------------------------------------------------------------------

// @ts-expect-error exhaustive must be last
I.build(I.exhaustive, I.with.host("a"));

// @ts-expect-error only one exhaustive marker is allowed
I.build(I.exhaustive, I.exhaustive);

// -----------------------------------------------------------------------------
// Non-parts
// -----------------------------------------------------------------------------

// @ts-expect-error a plain object is not a part
I.build({ host: "a" });

// -----------------------------------------------------------------------------
// Chained builder with an incomplete target
// -----------------------------------------------------------------------------

// @ts-expect-error the chain is incomplete
I.begin().field("host", "a").exhaustive();

// -----------------------------------------------------------------------------
// A longer build still resolves
// -----------------------------------------------------------------------------

interface Wide {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
  i: number;
  j: number;
  sum: number;
}
const WideI = Incremental.make<Wide>();
const wide = WideI.begin()
  .field("a", 1)
  .field("b", 2)
  .field("c", 3)
  .field("d", 4)
  .field("e", 5)
  .field("f", 6)
  .field("g", 7)
  .field("h", 8)
  .field("i", 9)
  .field("j", 10)
  .derive(({ a, b, c, d, e, f, g, h, i, j }) => ({ sum: a + b + c + d + e + f + g + h + i + j }))
  .exhaustive();
expectTypeOf(wide).toMatchTypeOf<Wide>();

void expectError;

// =============================================================================
// Incremental — the type-level surface
//
// A typed fold over object contributions. This module is type-only apart from
// the two runtime brands it re-uses.
// =============================================================================

import { PART, EXHAUSTIVE } from "./brands.ts";

/** Type-level-only brand carrying a {@link Part}'s static metadata. */
declare const PART_META: unique symbol;

/** Type-level-only brand marking an {@link IncrementalError}. */
declare const ERROR: unique symbol;

// -----------------------------------------------------------------------------
// Core data types
// -----------------------------------------------------------------------------

/**
 * How a contribution combines with the current state.
 *
 * - `"add"`: the key must not exist yet.
 * - `"replace"`: the key must already exist.
 * - `"default"`: set the key only if it is absent.
 */
export type ContributionPolicy = "add" | "replace" | "default";

/** Static metadata carried by a {@link Part}. */
export interface PartMeta<
  T extends object,
  Out,
  Needs extends keyof T,
  Policy extends ContributionPolicy,
> {
  /** Makes `T` invariant so structurally similar targets never mix. */
  readonly target: (value: T) => T;
  readonly out: Out;
  readonly needs: Needs;
  readonly policy: Policy;
}

/**
 * A contribution to an incremental build.
 *
 * - `T` is the target object type.
 * - `Out` is the object shape this part contributes. Added keys are required;
 *   conditionally added keys are optional (see {@link ConditionalOut}).
 * - `Needs` are the keys that must already be guaranteed before this part
 *   applies.
 * - `Policy` is an {@link ContributionPolicy}.
 */
export interface Part<
  T extends object,
  Out,
  Needs extends keyof T = never,
  Policy extends ContributionPolicy = "add",
> {
  readonly [PART]: true;
  readonly [PART_META]: PartMeta<T, Out, Needs, Policy>;
  /** Runs this part against the current state and returns its contribution. */
  readonly run: (current: Readonly<Record<string, unknown>>) => Out;
  readonly policy: Policy;
}

/** The marker that requests an exhaustiveness proof from `build`. */
export interface Exhaustive {
  readonly [EXHAUSTIVE]: "exhaustive";
}

/** A structured, named diagnostic produced by an invalid build. */
export interface IncrementalError<Code extends string, Detail = never> {
  readonly [ERROR]: Code;
  readonly detail: Detail;
}

// -----------------------------------------------------------------------------
// Diagnostics
// -----------------------------------------------------------------------------

export type MissingKeysError<K> = IncrementalError<
  "Incremental build is not exhaustive. Missing required keys.",
  K
>;

export type DuplicateContributionError<K> = IncrementalError<
  "Incremental part contributes keys that already exist. Use override() or update() to replace them.",
  K
>;

export type UnsatisfiedDependencyError<K> = IncrementalError<
  "Incremental part requires keys that are not available yet. Move the part that provides them earlier.",
  K
>;

export type MissingReplacementError<K> = IncrementalError<
  "Incremental replacement targets keys that have not been provided.",
  K
>;

export type InvalidPartError<P> = IncrementalError<"Value is not a valid Incremental part.", P>;

export type ExhaustiveMustBeLastError = IncrementalError<
  "The exhaustive marker must be the final argument to build().",
  never
>;

export type ExtraKeysError<K> = IncrementalError<
  "Incremental contribution contains keys that are not part of the target type.",
  K
>;

export type DynamicPartsError = IncrementalError<
  "build() needs a statically known list of parts. Spread a tuple (for example `[...] as const`) rather than a mutable array.",
  never
>;

export type UnsupportedTargetError = IncrementalError<
  "Incremental targets finite product types. Index signatures such as Record<string, T> are not supported.",
  never
>;

// -----------------------------------------------------------------------------
// Type-level utilities
// -----------------------------------------------------------------------------

/** Flattens intersections into a single object type. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The keys of `T` that are guaranteed (required and non-optional). */
export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * Every key that could be present across a union of object shapes.
 * For `{ a: 1 } | { a: 1; b: 2 }` this is `"a" | "b"`.
 */
export type PossibleKeys<T> = T extends unknown ? keyof T : never;

/** `true` when `T` has an index signature, which Incremental does not model. */
export type HasIndexSignature<T> = string extends keyof T
  ? true
  : number extends keyof T
    ? true
    : symbol extends keyof T
      ? true
      : false;

/** Merges a contribution into the current state. */
export type Merge<State, Out> = Omit<State, keyof Out> & Out;

/**
 * Widens a contribution's values back to the target type while preserving
 * exactly which keys the contribution *guarantees* to provide.
 *
 * Only required keys of `P` count: a value typed as `Partial<T>` guarantees
 * nothing, while an inferred object literal like `{ host: "x" }` guarantees
 * `host`. Keys outside the target type are kept so {@link Apply} can reject
 * them.
 */
export type NormalizeContribution<T, P> = {
  -readonly [K in RequiredKeys<P>]-?: K extends keyof T ? FieldValue<T, K> : P[K];
};

/** Rejects contributions that name keys outside the target type. */
export type NoExtraKeys<P, T> = Record<Exclude<keyof P, keyof T>, never>;

/**
 * Rejects guaranteed contributions whose value is not assignable to the stored
 * type. In particular, an optional key may not be `undefined`, and a required
 * key may not be set to a value that may be `undefined`. Only keys the
 * contribution guarantees are considered.
 */
export type GuaranteedValues<P, T> = {
  [K in RequiredKeys<P>]: K extends keyof T ? FieldValue<T, K> : P[K];
};

/**
 * The value type accepted for a single key. For optional keys this removes
 * `undefined`, so an explicitly provided optional property is known to be
 * present (and cannot be silently set to `undefined`).
 */
export type FieldValue<T, K extends keyof T> =
  {} extends Pick<T, K> ? Exclude<T[K], undefined> : T[K];

/**
 * The shape contributed by setting a single key `K`.
 *
 * Distributes over `K`, so a `keyof T`-typed (union) key yields a union of
 * single-key shapes rather than claiming every key at once.
 */
export type FieldContribution<T extends object, K extends keyof T> = K extends unknown
  ? { [P in K]-?: FieldValue<T, P> }
  : never;

/**
 * The state shape produced by conditionally applying a part.
 *
 * A conditional add (or default) only *may* provide its keys, so they become
 * optional. A conditional replace keeps its keys guaranteed, because they exist
 * before and after.
 */
export type ConditionalOut<Out, Policy> = Policy extends "replace" ? Out : Partial<Out>;

/** `true` when `E` is an Incremental diagnostic (non-distributive). */
export type IsError<E> = [E] extends [IncrementalError<any, any>] ? true : false;

/**
 * Compile-time assertion that `Actual` is exactly the diagnostic `Expected`.
 *
 *   const _ok: ExpectDiagnostic<Apply<...>, DuplicateContributionError<"host">> = true;
 *
 * Yields `never` on a mismatch, so the assignment fails to compile.
 */
export type ExpectDiagnostic<Actual, Expected> = [Actual] extends [Expected]
  ? [Expected] extends [Actual]
    ? true
    : never
  : never;

/**
 * Applies a single part to the current state.
 *
 * Returns either the next state or an {@link IncrementalError}.
 */
export type Apply<T extends object, State, P> = P extends Exhaustive
  ? ExhaustiveMustBeLastError
  : P extends Part<T, infer Out, infer Needs, infer Policy>
    ? [Exclude<keyof Out, keyof T>] extends [never]
      ? [Exclude<Needs, RequiredKeys<State>>] extends [never]
        ? Policy extends "add"
          ? [Extract<keyof State, keyof Out>] extends [never]
            ? Merge<State, Out>
            : DuplicateContributionError<Extract<keyof State, keyof Out>>
          : Policy extends "replace"
            ? [Exclude<keyof Out, RequiredKeys<State>>] extends [never]
              ? Merge<State, Out>
              : MissingReplacementError<Exclude<keyof Out, RequiredKeys<State>>>
            : Merge<State, Out>
        : UnsatisfiedDependencyError<Exclude<Needs, RequiredKeys<State>>>
      : ExtraKeysError<Exclude<keyof Out, keyof T>>
    : InvalidPartError<P>;

/** The final result of an exhaustive build: `T` plus any extra knowledge. */
export type Complete<T extends object, State> = Simplify<T & State>;

/** The inferred result of a build. */
export type BuildResult<T extends object, Parts extends readonly unknown[], State = {}> = Evaluate<
  T,
  Parts,
  State
>;

/**
 * Folds parts left to right, returning either the constructed state, an
 * exhaustive `T & State`, or the first diagnostic encountered.
 */
export type Evaluate<T extends object, Parts extends readonly unknown[], State = {}> =
  HasIndexSignature<T> extends true
    ? UnsupportedTargetError
    : Parts extends readonly []
      ? Simplify<State>
      : Parts extends readonly [infer Head, ...infer Tail]
        ? Head extends Exhaustive
          ? Tail extends readonly []
            ? [Exclude<RequiredKeys<T>, RequiredKeys<State>>] extends [never]
              ? Complete<T, State>
              : MissingKeysError<Exclude<RequiredKeys<T>, RequiredKeys<State>>>
            : ExhaustiveMustBeLastError
          : Apply<T, State, Head> extends infer Next
            ? IsError<Next> extends true
              ? Next
              : Evaluate<T, Tail, Next>
            : never
        : DynamicPartsError;

/**
 * Produces the expected argument tuple for `build`. Each slot is either the
 * part itself or the diagnostic explaining why that slot is invalid. This is
 * what turns type errors into readable messages.
 */
export type ValidateParts<T extends object, Parts extends readonly unknown[], State = {}> =
  HasIndexSignature<T> extends true
    ? readonly [UnsupportedTargetError]
    : Parts extends readonly []
      ? readonly []
      : Parts extends readonly [infer Head, ...infer Tail]
        ? Head extends Exhaustive
          ? Tail extends readonly []
            ? [Exclude<RequiredKeys<T>, RequiredKeys<State>>] extends [never]
              ? readonly [Head]
              : readonly [MissingKeysError<Exclude<RequiredKeys<T>, RequiredKeys<State>>>]
            : readonly [ExhaustiveMustBeLastError, ...ValidateParts<T, Tail, State>]
          : Apply<T, State, Head> extends infer Next
            ? IsError<Next> extends true
              ? readonly [Next, ...ValidateParts<T, Tail, State>]
              : readonly [Head, ...ValidateParts<T, Tail, Next>]
            : never
        : readonly [DynamicPartsError];

/** The guard placed on `.use(part)` for the chained builder. */
export type UseGuard<T extends object, State, P> =
  Apply<T, State, P> extends infer Next ? (IsError<Next> extends true ? Next : unknown) : never;

/** The next state produced by `.use(part)` for the chained builder. */
export type UseNext<T extends object, State, P> =
  Apply<T, State, P> extends infer Next ? (IsError<Next> extends true ? State : Next) : never;

/**
 * The state produced by a chained additive contribution, or a diagnostic when
 * the contribution is invalid (extra keys, duplicates, ...).
 */
export type NextContribution<T extends object, State, P> = [Exclude<keyof P, keyof T>] extends [
  never,
]
  ? [Extract<keyof P, keyof State>] extends [never]
    ? Merge<State, NormalizeContribution<T, P>>
    : DuplicateContributionError<Extract<keyof P, keyof State>>
  : ExtraKeysError<Exclude<keyof P, keyof T>>;

/** The state produced by a chained default, which may target existing keys. */
export type DefaultNext<T extends object, State, P> = [Exclude<keyof P, keyof T>] extends [never]
  ? Merge<State, NormalizeContribution<T, P>>
  : ExtraKeysError<Exclude<keyof P, keyof T>>;

/**
 * Either the next chained builder or a diagnostic. Returning the diagnostic
 * directly means the following chained call fails with a readable message.
 */
export type ChainedNext<T extends object, State, P> =
  NextContribution<T, State, P> extends infer Next
    ? IsError<Next> extends true
      ? Next
      : Builder<T, Next>
    : never;

/** Either the next chained builder or a diagnostic, for `defaults`. */
export type ChainedDefaultNext<T extends object, State, P> =
  DefaultNext<T, State, P> extends infer Next
    ? IsError<Next> extends true
      ? Next
      : Builder<T, Next>
    : never;

/** Generated setters for every key of `T`. */
export type Setters<T extends object> = {
  readonly [K in keyof T]-?: (
    value: FieldValue<T, K>,
  ) => Part<T, FieldContribution<T, K>, never, "add">;
};

// -----------------------------------------------------------------------------
// The chained builder
// -----------------------------------------------------------------------------

export type Builder<T extends object, State> =
  HasIndexSignature<T> extends true
    ? UnsupportedTargetError
    : BuilderMethods<T, State> &
        ([Exclude<RequiredKeys<T>, RequiredKeys<State>>] extends [never]
          ? { exhaustive(): Complete<T, State> }
          : {
              readonly exhaustive: MissingKeysError<Exclude<RequiredKeys<T>, RequiredKeys<State>>>;
            });

export interface BuilderMethods<T extends object, State> {
  /** Finalizes the build without proving exhaustiveness. */
  build(): Simplify<State>;

  field<K extends Exclude<keyof T, keyof State>>(
    key: K,
    value: FieldValue<T, K>,
  ): Builder<T, Merge<State, FieldContribution<T, K>>>;

  partial<const P extends Partial<T>>(
    factory: () => P & GuaranteedValues<P, T>,
  ): ChainedNext<T, State, P>;

  partial<const P extends Partial<T>>(
    value: P & NoExtraKeys<P, T> & GuaranteedValues<P, T>,
  ): ChainedNext<T, State, P>;

  derive<const P extends Partial<T>>(
    f: (current: Readonly<State>) => P & GuaranteedValues<P, T>,
  ): ChainedNext<T, State, P>;

  default<K extends keyof T>(
    key: K,
    value: FieldValue<T, K>,
  ): Builder<T, Merge<State, FieldContribution<T, K>>>;

  defaults<const P extends Partial<T>>(
    factory: () => P & GuaranteedValues<P, T>,
  ): ChainedDefaultNext<T, State, P>;

  defaults<const P extends Partial<T>>(
    value: P & NoExtraKeys<P, T> & GuaranteedValues<P, T>,
  ): ChainedDefaultNext<T, State, P>;

  use<P extends Part<T, any, any, any>>(
    part: P & UseGuard<T, State, P>,
  ): Builder<T, UseNext<T, State, P>>;

  override<K extends RequiredKeys<State> & keyof T>(
    key: K,
    value: FieldValue<T, K>,
  ): Builder<T, Merge<State, FieldContribution<T, K>>>;

  update<K extends RequiredKeys<State> & keyof T>(
    key: K,
    f: (current: FieldValue<T, K>) => FieldValue<T, K>,
  ): Builder<T, Merge<State, FieldContribution<T, K>>>;

  when<Out, Needs extends keyof T, Policy extends ContributionPolicy>(
    condition: boolean,
    part: Part<T, Out, Needs, Policy>,
  ): Builder<T, Merge<State, ConditionalOut<Out, Policy>>>;
}

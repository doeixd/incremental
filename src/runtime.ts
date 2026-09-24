/* eslint-disable @typescript-eslint/no-explicit-any */

// =============================================================================
// Incremental — runtime and public API
// =============================================================================

import { PART, EXHAUSTIVE } from "./brands.ts";
import type {
  Builder,
  ConditionalOut,
  ContributionPolicy,
  Evaluate,
  Exhaustive,
  FieldContribution,
  FieldValue,
  NoExtraKeys,
  GuaranteedValues,
  NormalizeContribution,
  Part,
  Setters,
  ValidateParts,
} from "./types.ts";

// -----------------------------------------------------------------------------
// The composable API
// -----------------------------------------------------------------------------

export interface Incremental<T extends object> {
  /** The marker that asks `build` to prove exhaustiveness. */
  readonly exhaustive: Exhaustive;

  /** Generated, namespaced setters: `I.with.host("localhost")`. */
  readonly with: Setters<T>;

  /** Canonical field setter, useful for dynamic keys. */
  field<K extends keyof T>(
    key: K,
    value: FieldValue<T, K>,
  ): Part<T, FieldContribution<T, K>, never, "add">;

  /**
   * Lazily adds every provided key when the build runs.
   * @experimental
   */
  partial<const P extends Partial<T>>(
    factory: () => P & GuaranteedValues<P, T>,
  ): Part<T, NormalizeContribution<T, P>, never, "add">;

  /** Adds every provided key at once. */
  partial<const P extends Partial<T>>(
    value: P & NoExtraKeys<P, T> & GuaranteedValues<P, T>,
  ): Part<T, NormalizeContribution<T, P>, never, "add">;

  /** Adds keys derived from previously constructed keys. */
  derive<const Needs extends readonly (keyof T)[], const P extends Partial<T>>(
    needs: Needs,
    f: (
      current: Readonly<{ [K in Needs[number]]-?: FieldValue<T, K> }>,
    ) => P & GuaranteedValues<P, T>,
  ): Part<T, NormalizeContribution<T, P>, Needs[number], "add">;

  /** Replaces an already constructed key. */
  override<K extends keyof T>(
    key: K,
    value: FieldValue<T, K>,
  ): Part<T, FieldContribution<T, K>, K, "replace">;

  /** Replaces an already constructed key using its current value. */
  update<K extends keyof T>(
    key: K,
    f: (current: FieldValue<T, K>) => FieldValue<T, K>,
  ): Part<T, FieldContribution<T, K>, K, "replace">;

  /** Sets a key only if it is absent. A default guarantees the key. */
  default<K extends keyof T>(
    key: K,
    value: FieldValue<T, K>,
  ): Part<T, FieldContribution<T, K>, never, "default">;

  /** Sets each provided key only if it is absent. A default guarantees the keys. */
  defaults<const P extends Partial<T>>(
    factory: () => P & GuaranteedValues<P, T>,
  ): Part<T, NormalizeContribution<T, P>, never, "default">;

  /** Sets each provided key only if it is absent. */
  defaults<const P extends Partial<T>>(
    value: P & NoExtraKeys<P, T> & GuaranteedValues<P, T>,
  ): Part<T, NormalizeContribution<T, P>, never, "default">;

  /**
   * Conditionally applies a part. Added keys become optional, so a conditional
   * contribution never satisfies exhaustiveness. A conditional replacement
   * keeps its key guaranteed.
   * @experimental
   */
  when<Out, Needs extends keyof T, Policy extends ContributionPolicy>(
    condition: boolean,
    part: Part<T, Out, Needs, Policy>,
  ): Part<T, ConditionalOut<Out, Policy>, Needs, Policy>;

  /** Starts a chained, type-state builder. */
  begin(): Builder<T, {}>;

  /**
   * Folds parts left to right.
   *
   * Without {@link Incremental.exhaustive} the result is exactly what was
   * constructed. With it, the result is proven to satisfy `T`.
   */
  build<const Parts extends readonly (Part<T, any, any, any> | Exhaustive)[]>(
    ...parts: Parts & ValidateParts<T, Parts>
  ): Evaluate<T, Parts>;
}

// -----------------------------------------------------------------------------
// Runtime: part constructors
// -----------------------------------------------------------------------------

/** The exhaustive marker. */
export const exhaustive: Exhaustive = { [EXHAUSTIVE]: "exhaustive" };

function isPart(value: unknown): value is Part<any, any, any, any> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[PART] === true
  );
}

function isExhaustive(value: unknown): value is Exhaustive {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[EXHAUSTIVE] === "exhaustive"
  );
}

function createPart<
  T extends object,
  Out,
  Needs extends keyof T,
  Policy extends ContributionPolicy,
>(
  policy: Policy,
  needs: ReadonlyArray<keyof T & string>,
  run: (current: Record<string, unknown>) => Out,
): Part<T, Out, Needs, Policy> {
  return {
    [PART]: true,
    policy,
    needs,
    run: (current: Record<string, unknown>) => {
      for (const key of needs) {
        if (!Object.hasOwn(current, key)) {
          throw new Error(
            `Incremental: missing required key "${key}". ` +
              "Move the part that provides it earlier in the build.",
          );
        }
      }
      return run(current);
    },
  } as unknown as Part<T, Out, Needs, Policy>;
}

function fieldPart<T extends object, K extends keyof T>(key: K, value: T[K]) {
  return createPart<T, FieldContribution<T, K>, never, "add">(
    "add",
    [],
    () =>
      ({
        [key]: value,
      }) as any,
  );
}

function objectPart<T extends object, P extends Partial<T>, Policy extends ContributionPolicy>(
  policy: Policy,
  source: P | (() => P),
) {
  const factory = typeof source === "function" ? (source as () => P) : () => source;
  return createPart<T, NormalizeContribution<T, P>, never, Policy>(
    policy,
    [],
    () => factory() as any,
  );
}

function derivePart<T extends object, Needs extends readonly (keyof T)[], P extends Partial<T>>(
  needs: Needs,
  f: (
    current: Readonly<{ [K in Needs[number]]-?: FieldValue<T, K> }>,
  ) => P & GuaranteedValues<P, T>,
) {
  return createPart<T, NormalizeContribution<T, P>, Needs[number], "add">(
    "add",
    needs as ReadonlyArray<keyof T & string>,
    (current) => {
      const input: Record<string, unknown> = {};
      for (const key of needs) {
        input[key as string] = current[key as string];
      }
      return f(input as any) as any;
    },
  );
}

function overridePart<T extends object, K extends keyof T>(key: K, value: T[K]) {
  return createPart<T, FieldContribution<T, K>, K, "replace">(
    "replace",
    [key as keyof T & string],
    () =>
      ({
        [key]: value,
      }) as any,
  );
}

function updatePart<T extends object, K extends keyof T>(key: K, f: (current: T[K]) => T[K]) {
  return createPart<T, FieldContribution<T, K>, K, "replace">(
    "replace",
    [key as keyof T & string],
    (current) => ({ [key]: f(current[key as string] as T[K]) }) as any,
  );
}

function defaultPart<T extends object, K extends keyof T>(key: K, value: T[K]) {
  return createPart<T, FieldContribution<T, K>, never, "default">(
    "default",
    [],
    () =>
      ({
        [key]: value,
      }) as any,
  );
}

function whenPart<T extends object, Out, Needs extends keyof T, Policy extends ContributionPolicy>(
  condition: boolean,
  part: Part<T, Out, Needs, Policy>,
) {
  // The wrapped part checks its own needs when it actually runs, so a
  // conditional contribution does not require them when the condition is false.
  return createPart<T, ConditionalOut<Out, Policy>, Needs, Policy>(part.policy, [], (current) =>
    condition ? part.run(current) : ({} as ConditionalOut<Out, Policy>),
  );
}

// -----------------------------------------------------------------------------
// Runtime: fold
// -----------------------------------------------------------------------------

function runParts(parts: readonly unknown[]): Record<string, unknown> {
  let state: Record<string, unknown> = {};
  for (const item of parts) {
    if (isExhaustive(item)) {
      continue;
    }
    if (!isPart(item)) {
      throw new TypeError("Incremental: expected a Part or the exhaustive marker.");
    }
    const raw = item.run(state) as Record<string, unknown>;
    if (raw === null || typeof raw !== "object") {
      throw new TypeError(`Incremental: a part must contribute an object, received ${typeof raw}.`);
    }
    let contribution = raw;
    if (item.policy === "add") {
      for (const key of Object.keys(raw)) {
        if (Object.hasOwn(state, key)) {
          throw new Error(
            `Incremental: duplicate contribution for key "${key}". ` +
              "Use override(), update() or default() to handle an existing key.",
          );
        }
      }
    } else if (item.policy === "replace") {
      for (const key of Object.keys(raw)) {
        if (!Object.hasOwn(state, key)) {
          throw new Error(`Incremental: cannot replace missing key "${key}".`);
        }
      }
    } else {
      // default: only set keys that are absent
      contribution = {};
      for (const key of Object.keys(raw)) {
        if (!Object.hasOwn(state, key)) {
          contribution[key] = raw[key];
        }
      }
    }
    state = { ...state, ...contribution };
  }
  return state;
}

// -----------------------------------------------------------------------------
// Runtime: chained builder
// -----------------------------------------------------------------------------

function createBuilder<T extends object, State>(parts: readonly unknown[]): Builder<T, State> {
  const builder = {
    build: () => runParts(parts),
    field: (key: string, value: unknown) =>
      createBuilder<T, any>([...parts, fieldPart<T, keyof T>(key as keyof T, value as T[keyof T])]),
    partial: (source: unknown) =>
      createBuilder<T, any>([
        ...parts,
        objectPart<T, Partial<T>, "add">("add", source as Partial<T>),
      ]),
    derive: (f: (current: any) => unknown) =>
      createBuilder<T, any>([
        ...parts,
        createPart<T, any, never, "add">("add", [], (current) => f(current)),
      ]),
    default: (key: string, value: unknown) =>
      createBuilder<T, any>([
        ...parts,
        defaultPart<T, keyof T>(key as keyof T, value as T[keyof T]),
      ]),
    defaults: (source: unknown) =>
      createBuilder<T, any>([
        ...parts,
        objectPart<T, Partial<T>, "default">("default", source as Partial<T>),
      ]),
    use: (part: unknown) => createBuilder<T, any>([...parts, part]),
    override: (key: string, value: unknown) =>
      createBuilder<T, any>([
        ...parts,
        overridePart<T, keyof T>(key as keyof T, value as T[keyof T]),
      ]),
    update: (key: string, f: (current: any) => unknown) =>
      createBuilder<T, any>([
        ...parts,
        updatePart<T, keyof T>(key as keyof T, f as (current: T[keyof T]) => T[keyof T]),
      ]),
    when: (condition: boolean, part: Part<any, any, any, any>) =>
      createBuilder<T, any>([...parts, whenPart<any, any, any, any>(condition, part)]),
    exhaustive: () => runParts(parts),
  };
  return builder as unknown as Builder<T, State>;
}

// -----------------------------------------------------------------------------
// Runtime: the Incremental instance
// -----------------------------------------------------------------------------

function createSetters<T extends object>(): Setters<T> {
  return new Proxy({} as Setters<T>, {
    get(_target, key) {
      if (typeof key !== "string" || key === "then") {
        return undefined;
      }
      return (value: unknown) => fieldPart<T, keyof T>(key as keyof T, value as T[keyof T]);
    },
  });
}

/** Creates an `Incremental` for the target type `T`. */
export function make<T extends object>(): Incremental<T> {
  return {
    exhaustive,
    with: createSetters<T>(),
    field: (key: any, value: any) => fieldPart<T, keyof T>(key as keyof T, value as T[keyof T]),
    partial: (source: any) => objectPart<T, Partial<T>, "add">("add", source as Partial<T>),
    derive: (needs: any, f: any) => derivePart(needs, f),
    override: (key: any, value: any) =>
      overridePart<T, keyof T>(key as keyof T, value as T[keyof T]),
    update: (key: any, f: any) =>
      updatePart<T, keyof T>(key as keyof T, f as (current: T[keyof T]) => T[keyof T]),
    default: (key: any, value: any) => defaultPart<T, keyof T>(key as keyof T, value as T[keyof T]),
    defaults: (source: any) =>
      objectPart<T, Partial<T>, "default">("default", source as Partial<T>),
    when: (condition: any, part: any) => whenPart<any, any, any, any>(condition, part),
    begin: () => createBuilder<T, {}>([]),
    build: (...parts: any[]) => runParts(parts),
  } as unknown as Incremental<T>;
}

/** Namespace-style entry point: `Incremental.make<T>()`. */
export const Incremental = { make } as const;

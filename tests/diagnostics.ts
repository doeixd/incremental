import type {
  Apply,
  DuplicateContributionError,
  DynamicPartsError,
  Evaluate,
  Exhaustive,
  ExhaustiveMustBeLastError,
  ExtraKeysError,
  InvalidPartError,
  MissingKeysError,
  MissingReplacementError,
  Part,
  UnsupportedTargetError,
  UnsatisfiedDependencyError,
  ExpectDiagnostic,
} from "../src/index.ts";

// =============================================================================
// The diagnostics contract. Each assertion fails to compile if the diagnostic
// produced for a given failure changes. Type-checked, never executed.
// =============================================================================

interface Config {
  host: string;
  port: number;
  secure?: boolean;
  url: string;
}

const hostPart: Part<Config, { host: string }, never, "add"> = null as never;
const urlPart: Part<Config, { url: string }, "host", "add"> = null as never;

// Missing required keys at the end of an exhaustive build.
const _missing: ExpectDiagnostic<
  Evaluate<Config, readonly [Exhaustive]>,
  MissingKeysError<"host" | "port" | "url">
> = true;

// Adding a key that already exists.
const _duplicate: ExpectDiagnostic<
  Apply<Config, { host: string }, Part<Config, { host: string }, never, "add">>,
  DuplicateContributionError<"host">
> = true;

// Depending on a key that is not available yet.
const _unsatisfied: ExpectDiagnostic<
  Apply<Config, {}, Part<Config, { url: string }, "host", "add">>,
  UnsatisfiedDependencyError<"host">
> = true;

// Replacing a key that has not been provided.
const _missingReplacement: ExpectDiagnostic<
  Apply<Config, {}, Part<Config, { host: string }, never, "replace">>,
  MissingReplacementError<"host">
> = true;

// Contributing a key outside the target type.
const _extraKeys: ExpectDiagnostic<
  Apply<Config, {}, Part<Config, { banana: number }, never, "add">>,
  ExtraKeysError<"banana">
> = true;

// The exhaustive marker must be last.
const _notLast: ExpectDiagnostic<
  Evaluate<Config, readonly [Exhaustive, typeof hostPart]>,
  ExhaustiveMustBeLastError
> = true;

// A value that is not a part.
const _invalid: ExpectDiagnostic<
  Apply<Config, {}, { not: "a part" }>,
  InvalidPartError<{ not: "a part" }>
> = true;

// A mutable array instead of a tuple.
const _dynamic: ExpectDiagnostic<
  Evaluate<Config, readonly (typeof hostPart)[]>,
  DynamicPartsError
> = true;

// An index-signature target.
const _indexSignature: ExpectDiagnostic<
  Evaluate<Record<string, number>, readonly []>,
  UnsupportedTargetError
> = true;

// A valid application is not an error.
const _ok: ExpectDiagnostic<
  Apply<Config, { host: string }, typeof urlPart>,
  { host: string; url: string }
> = true;

void _missing;
void _duplicate;
void _unsatisfied;
void _missingReplacement;
void _extraKeys;
void _notLast;
void _invalid;
void _dynamic;
void _indexSignature;
void _ok;

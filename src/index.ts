// =============================================================================
// Incremental
//
// A typed fold over object contributions.
//
//   Part<T>  requires some keys  provides some keys
//      build folds Parts left -> right
//      type state grows
//      exhaustive proves all required keys exist
// =============================================================================

export * from "./brands.ts";
export * from "./types.ts";
export * from "./runtime.ts";

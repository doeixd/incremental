// =============================================================================
// Runtime brands
//
// Kept in their own module so the type-only surface and the runtime can both
// refer to them without importing each other.
// =============================================================================

/** Runtime brand placed on every {@link Part}. */
export const PART: unique symbol = Symbol("incremental.part");

/** Runtime brand placed on the exhaustive marker. */
export const EXHAUSTIVE: unique symbol = Symbol("incremental.exhaustive");

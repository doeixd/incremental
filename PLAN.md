# Plan: Incremental → v0.1

## Thesis

Re-center the library on what only it does well:

> **Incrementally construct an object, know its exact shape at every step, and
> prove when it is complete.**

Everything else — the dependency graph, ordering, conditionals — is secondary
and should be described (and constrained) as such.

## Principles

1. **Soundness before expressiveness.** A type that can be wrong is worse than a
   feature that is missing.
2. **Completeness is the product.** Dependencies are a mechanism, not the pitch.
3. **The state should be a single object**, not a growing union, or the
   abstraction will not scale past a handful of conditionals.
4. **Diagnostics are a tested contract**, not an emergent side effect.
5. **Shrink the surface.** Two APIs is the ceiling.

## Status legend

- `S` / `M` / `L` — relative effort.
- `[ ]` not started · `[~]` in progress · `[x]` done.

## Outcome

Implemented in this pass:

- **M0–M5, M7 complete; M6 decided (deferred, documented); M8 partial.**
- Conditionals now use optional state (`N` conditionals are `O(N)`, verified by
  `tests/perf.ts` with 20 conditionals).
- `default` / `defaults` added to both APIs.
- Index-signature targets rejected with `UnsupportedTargetError`.
- Diagnostics are a tested contract (`tests/diagnostics.ts`,
  `docs/diagnostics.md`).
- Source split into `brands.ts` / `types.ts` / `runtime.ts` / `index.ts`.
- README reframed completeness-first, with a guarantees table and an ordering
  section.

Deferred / remaining:

- **M6:** `variant` API deferred; composition pattern documented in
  `docs/variants.md`.
- **M8:** `vp run typecheck` and the perf fixture exist; automated CI wiring and
  a wall-clock threshold are still to do.
- `partial({ secure: undefined })` remains accepted by TypeScript's
  optional-property rules (documented limitation).

---

## M0 — Freeze and formalize current behavior · S · `[x]`

**Goal:** lock in what already works so later milestones cannot regress it.

- [ ] Promote the findings from the design review into permanent tests: broad
      `Partial` provides nothing; dynamic keys provide nothing; optional keys are
      non-`undefined`; `as const` spread works; mutable-array spread gives
      `DynamicPartsError`.
- [ ] Add `CHANGELOG.md` and a version policy (currently `0.0.0`; declare a
      `0.1` API freeze).
- [ ] Split `src/index.ts` into `types.ts` / `runtime.ts` / `index.ts` while the
      shape is stable.

**Acceptance:** `vp check && vp test && vp run build` green; no behavior change.

---

## M1 — Complete the soundness model · S/M · `[x]`

**Goal:** close the remaining places where a value's type can over-claim.

- [ ] **`partial` with `undefined`:** `partial({ secure: undefined })` currently
      passes TS's optional-property rules and widens to `boolean`. Attempt a
      constraint against `FieldValue<T, K>`; if TS cannot express it without
      `exactOptionalPropertyTypes`, document it as the one remaining hole.
- [ ] **Index signatures (`Record<string, T>`):** detect an index signature on
      `T` and emit an `UnsupportedTargetError` diagnostic rather than producing
      nonsense `RequiredKeys`.
- [ ] **Lazy factories:** keep the conservative "guarantees nothing" rule; add a
      test asserting a broadly-typed factory cannot satisfy `exhaustive`.
- [ ] Write the "what guarantees what" table, each row backed by a type test.

**Acceptance:** a documented guarantees table, each row backed by a type test.

---

## M2 — Add an upsert policy · S · `[x]`

**Goal:** support the canonical config-merge case in one part.

```ts
I.default("port", 3000); // set if absent
I.defaults({ host, port }); // sugar
```

- [ ] New `Policy` member `"default"`.
- [ ] `Apply`: no duplicate error, no replacement requirement; `Merge` adds the
      key if absent and leaves it if present.
- [ ] Semantics: a default **guarantees** the key (so it can satisfy
      exhaustiveness).
- [ ] Runtime: `if (!Object.hasOwn(state, key)) state[key] = value`.

**Acceptance:** `I.build(I.defaults(defaults), I.override(...), I.exhaustive)`
type-checks and produces the merged object.

---

## M3 — Re-model conditionals to optional state · M/L · `[x]`

**Goal:** eliminate the `2^n` union blowup from `when`.

Current representation is `Part<T, {} | Out, ...>` with a distributing `Merge`
and completeness measured by `keyof State`. Proposed:

- `when(cond, addPart)` → `Part<T, Partial<Out>, Needs, "add">` — a conditional
  contribution is _optional keys_.
- `when(cond, replacePart)` → `Part<T, Out, Needs, "replace">` — the key exists
  before and after, so it stays required.
- `Merge<State, Out> = Simplify<Omit<State, keyof Out> & Out>` — no distribution.
- `Available<State> = RequiredKeys<State>` for needs checks, replace-existence,
  and completeness.
- `Possible<State> = keyof State` for duplicate detection.
- Drop the union-aware `Merge` and `PossibleKeys` distribution.
- Completeness: `Exclude<RequiredKeys<T>, RequiredKeys<State>>`.

This is what the original design's "possible vs guaranteed" section was reaching
for, expressed more cheaply: `N` conditionals become `N` optional keys — `O(N)`,
not `O(2^N)`.

**Spike first:** implement on a branch, run the M8 perf fixture (10 conditionals)
before/after, confirm error semantics do not regress. If it fails, fall back to
gating `when` as `@experimental` and documenting a cap.

**Acceptance:** 10 conditionals produce a single-object state and type-check in
bounded time; a conditionally-provided required key still cannot satisfy
`exhaustive`; `when(cond, override)` keeps the key guaranteed; all conditional
tests pass under the new representation.

**Risk:** optional state keys change what chained `derive`'s `current` exposes
(`boolean | undefined`). Recommend honest exposure with `| undefined`, or
restrict chained `derive` to guaranteed keys.

---

## M4 — Diagnostics as a tested contract · M · `[x]`

**Goal:** make named diagnostics a guaranteed, tested API surface, not a side
effect.

- [ ] Add an `ExpectDiagnostic<Actual, Expected>` type helper and assert the
      _exact_ diagnostic for every failure mode (missing keys, duplicate,
      unsatisfied dependency, missing replacement, extra keys, dynamic parts,
      exhaustive-not-last, invalid part).
- [ ] Write `docs/diagnostics.md`: one entry per diagnostic with a failing sample
      and the fix.
- [ ] Spike: reduce tuple-intersection noise. Try alternative `build` signatures
      (`ValidateParts<T, Parts> & Parts`, a single mapped parameter type) and
      measure whether the diagnostic name lands on the _first_ line of the
      compiler error. If not achievable, accept and document.

**Acceptance:** every diagnostic has a test that fails if the diagnostic type
changes; `docs/diagnostics.md` exists.

---

## M5 — Make the total order explicit and legible · S · `[x]`

**Goal:** stop presenting the fold as a general dependency graph.

- [ ] Reword `UnsatisfiedDependencyError` to name ordering: _"requires keys that
      are not available yet; move the part that provides them earlier."_
- [ ] Add a "Writing a topological order" README section with a multi-feature
      worked example.
- [ ] Clarify in `derive` docs that `needs` is a topological edge declaration.
- [ ] Explicitly _not_ recommended: an `order`/`sort` helper — over-engineering.

**Acceptance:** docs section + an error-message test.

---

## M6 — Scope decision: discriminated unions / `variant` · M · `[x]` (deferred, documented)

**Goal:** decide whether the motivating Foldkit case (Models are often unions) is
in scope.

- [ ] Spike `I.variant(discriminant, tag, VariantI)` and test whether
      completeness can be defined sensibly.
- [ ] Fallback: document a composition pattern — build each variant with its own
      `Incremental<Circle>`, then wrap with the discriminant — and ship an
      example.
- [ ] Decision gate: if `variant` needs a fundamentally different fold, defer to
      v0.2 and ship the pattern.

**Acceptance:** a written design note plus either an experimental `variant` or a
documented pattern.

---

## M7 — Surface reduction and docs reframing · M · `[x]`

**Goal:** shrink the API and lead with completeness.

- [ ] README rewrite: completeness + positive knowledge as the headline;
      dependencies secondary.
- [ ] Mark experimental APIs (`when`, lazy `partial`, `variant`) with
      `@experimental` JSDoc; consider an `Incremental.experimental.*` namespace.
- [ ] Confirm `field` is canonical and `with.*` is sugar.
- [ ] Decide whether the factory form stays `partial(factory)` or gains a `lazy`
      alias. Recommend: keep both, document `lazy` as future.
- [ ] Fold in the M1 guarantees table and the M5 ordering section.

**Acceptance:** README reads completeness-first; experimental surface clearly
marked.

---

## M8 — Tooling: typecheck CI + type-performance benchmarks · M · `[~]`

**Goal:** make the type guarantees continuously verifiable and catch blowups.

- [ ] Add `vp run typecheck` (tsc over `src` + type tests) and wire it into CI
      next to `vp test`.
- [ ] Add generated fixtures: 50-part build, 10-conditional build, deep derive
      chain. A script measures `tsc` wall time and fails on regression beyond a
      threshold.
- [ ] Keep `tests/types.ts` and `tests/edge-cases.ts` as the type-test suite; add
      the `ExpectDiagnostic` helpers from M4.

**Acceptance:** CI runs type tests + perf fixtures; a conditional-blowup
regression fails CI.

---

## Sequencing

1. **M0 → M1 → M2** — foundation, soundness, upsert. Low risk, immediate value.
2. **M8 early** — so M3's spike can be measured.
3. **M3** — the biggest lever; spike, then commit or fall back.
4. **M4 → M5** — diagnostics contract, ordering docs.
5. **M6** — scope spike, run in parallel with M4/M5.
6. **M7 last** — docs/surface once behavior is frozen.

---

## Open decisions (need a call before starting)

1. **Conditionals:** re-model to optional state (recommended), gate `when` as
   experimental, or drop it from v0.1?
2. **Upsert:** `default`/`defaults` with "keep existing if present"
   (recommended), or overwrite-if-present?
3. **Scope:** pursue `variant` in v0.1, or ship the documented pattern and defer?
4. **Dual API:** keep both (recommended) or consolidate to chained + `use`?
5. **Version:** is `0.1` the freeze point, and are we OK breaking the current
   shape for M3?

---

## Acceptance criteria for v0.1

- **Soundness:** no input type can make `exhaustive` pass while runtime is
  incomplete (documented, tested).
- **Scalability:** conditionals are `O(N)` in state, not `O(2^N)`; a
  10-conditional fixture type-checks in bounded time.
- **Ergonomics:** config-merge expressible in one pass (`defaults` + `override`).
- **Diagnostics:** every failure names its diagnostic; each is tested.
- **Docs:** completeness-first README; ordering, guarantees, and scope limits
  explicit.

---

## Risks

- **M3 is the breaking change.** Mitigate with the spike and a documented
  fallback.
- **`ExpectDiagnostic` can be TS-version brittle.** Pin TypeScript and test it.
- **Type-perf thresholds are CI-flaky.** Use generous, relative bounds.
- **`variant` could double the type surface.** The decision gate is deliberate.

---

## Next step

Answer the five open decisions (at minimum decision 1), then start M0. Decision 1
determines whether M3 is a rewrite or a gate, so it gates the largest milestone.

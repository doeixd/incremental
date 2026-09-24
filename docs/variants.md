# Discriminated unions

## Decision

`Incremental` v0.1 targets **finite product types**. Discriminated unions are
**out of scope**; a `variant` API is deferred to a future version.

This note records why, and the composition pattern to use instead.

## Why unions are hard

For a product type, completeness is simple:

```text
RequiredKeys<T> ⊆ RequiredKeys<State>
```

For a union, "complete" is ambiguous:

```ts
type Shape = { kind: "circle"; radius: number } | { kind: "rect"; width: number; height: number };
```

- Is a state `{ kind: "circle"; radius: number }` complete? Yes, as the circle
  variant.
- Is `{ kind: "circle"; radius: number; width: number }` complete? It has
  members of both variants and is arguably not a valid `Shape`.
- What does `I.with.kind("circle")` mean before `radius` exists? It commits to
  a variant but does not complete it.

The `kind` discriminant is not an ordinary field: setting it narrows which keys
are required. Modelling that needs a different fold (a "branch" combinator that
carries the chosen variant through the state), not a bigger `Part`.

## Pattern: compose variants, then wrap

Build each variant as its own product type, then wrap the result with the
discriminant.

```ts
interface Circle {
  radius: number;
}
interface Rect {
  width: number;
  height: number;
}

const CircleI = Incremental.make<Circle>();
const RectI = Incremental.make<Rect>();

const circle = CircleI.build(CircleI.with.radius(1), CircleI.exhaustive);
const rect = RectI.build(RectI.with.width(2), RectI.with.height(3), RectI.exhaustive);

type Shape = { kind: "circle"; value: Circle } | { kind: "rect"; value: Rect };

const shape: Shape = useCircle ? { kind: "circle", value: circle } : { kind: "rect", value: rect };
```

Each variant gets a full completeness proof; the union is assembled with
ordinary TypeScript. This keeps the type machinery small and predictable.

## Sketch of a future `variant`

If a `variant` API is added, it would likely look like:

```ts
const ShapeI = Incremental.variant<Shape>("kind");

const circle = ShapeI.of("circle", CircleI); // Part<Shape, { kind: "circle"; radius: number }>
const rect = ShapeI.of("rect", RectI);

const shape = ShapeI.build(
  ShapeI.choose(useCircle ? "circle" : "rect"),
  useCircle ? ShapeI.with.radius(1) : ShapeI.with.width(2),
  // ...
);
```

Open questions a spike must answer:

1. How is "exactly one variant" enforced?
2. Does `exhaustive` mean "one variant is complete" or "all variants are
   handled"?
3. How do mutually exclusive keys interact with duplicate detection?

Until those have clean answers, the composition pattern above is the supported
approach.

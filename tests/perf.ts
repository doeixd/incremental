import { Incremental } from "../src/index.ts";

// =============================================================================
// A stress fixture. With a union-based conditional model, 20 conditionals would
// produce 2^20 state branches and bring the checker to its knees. With the
// optional-key model it stays a single object. Type-checked, never executed.
// =============================================================================

type FlagIndex =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19;
type FlagKey = `f${FlagIndex}`;
type Flags = { [K in FlagKey]?: boolean };

interface PerfTarget extends Flags {
  host: string;
  port: number;
  url: string;
}

const I = Incremental.make<PerfTarget>();

const result = I.build(
  I.with.host("h"),
  I.with.port(1),
  I.derive(["host", "port"], ({ host, port }) => ({ url: `${host}:${port}` })),
  I.when(true, I.with.f0(true)),
  I.when(true, I.with.f1(true)),
  I.when(true, I.with.f2(true)),
  I.when(true, I.with.f3(true)),
  I.when(true, I.with.f4(true)),
  I.when(true, I.with.f5(true)),
  I.when(true, I.with.f6(true)),
  I.when(true, I.with.f7(true)),
  I.when(true, I.with.f8(true)),
  I.when(true, I.with.f9(true)),
  I.when(true, I.with.f10(true)),
  I.when(true, I.with.f11(true)),
  I.when(true, I.with.f12(true)),
  I.when(true, I.with.f13(true)),
  I.when(true, I.with.f14(true)),
  I.when(true, I.with.f15(true)),
  I.when(true, I.with.f16(true)),
  I.when(true, I.with.f17(true)),
  I.when(true, I.with.f18(true)),
  I.when(true, I.with.f19(true)),
  I.exhaustive,
);

const complete: PerfTarget = result;
void complete;

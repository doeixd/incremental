import { describe, expect, test } from "vite-plus/test";
import { Incremental } from "../src/index.ts";

interface Config {
  host: string;
  port: number;
  secure?: boolean;
  url: string;
}

const I = Incremental.make<Config>();

describe("build", () => {
  test("folds contributions left to right", () => {
    const result = I.build(I.with.host("localhost"), I.with.port(3000));
    expect(result).toEqual({ host: "localhost", port: 3000 });
  });

  test("exhaustive build produces a complete value", () => {
    const result = I.build(
      I.with.host("localhost"),
      I.with.port(3000),
      I.derive(["host", "port"], ({ host, port }) => ({
        url: `http://${host}:${port}`,
      })),
      I.exhaustive,
    );
    expect(result).toEqual({
      host: "localhost",
      port: 3000,
      url: "http://localhost:3000",
    });
  });

  test("partial contributions add exactly their keys", () => {
    const result = I.build(I.partial({ host: "localhost", port: 8080 }));
    expect(result).toEqual({ host: "localhost", port: 8080 });
  });

  test("lazy partial is evaluated when the build runs", () => {
    let evaluated = false;
    const result = I.build(
      I.partial(() => {
        evaluated = true;
        return { host: "lazy" };
      }),
    );
    expect(evaluated).toBe(true);
    expect(result).toEqual({ host: "lazy" });
  });

  test("derived values see only their declared dependencies", () => {
    const result = I.build(
      I.with.host("localhost"),
      I.with.port(3000),
      I.derive(["host", "port"], ({ host, port }) => ({
        url: `http://${host}:${port}`,
      })),
    );
    expect(result.url).toBe("http://localhost:3000");
  });

  test("optional properties are preserved when explicitly supplied", () => {
    const result = I.build(
      I.with.host("localhost"),
      I.with.port(3000),
      I.with.secure(true),
      I.derive(["host", "port", "secure"], ({ host, port, secure }) => ({
        url: `${secure ? "https" : "http"}://${host}:${port}`,
      })),
      I.exhaustive,
    );
    expect(result.secure).toBe(true);
    expect(result.url).toBe("https://localhost:3000");
  });

  test("an empty build produces an empty state", () => {
    expect(I.build()).toEqual({});
  });

  test("a target with no required keys completes with just the marker", () => {
    const O = Incremental.make<{ a?: number; b?: string }>();
    expect(O.build(O.exhaustive)).toEqual({});
  });
});

describe("override and update", () => {
  test("override replaces an existing key", () => {
    const result = I.build(I.with.host("localhost"), I.override("host", "example.com"));
    expect(result).toEqual({ host: "example.com" });
  });

  test("update transforms an existing key", () => {
    const result = I.build(
      I.with.port(3000),
      I.update("port", (n) => n + 1),
    );
    expect(result).toEqual({ port: 3001 });
  });
});

describe("conditional contributions", () => {
  test("when(true) contributes", () => {
    const result = I.build(I.with.host("a"), I.when(true, I.with.port(1)));
    expect(result).toEqual({ host: "a", port: 1 });
  });

  test("when(false) contributes nothing", () => {
    const result = I.build(I.with.host("a"), I.when(false, I.with.port(1)));
    expect(result).toEqual({ host: "a" });
  });
});

describe("defaults", () => {
  test("default sets a key only if it is absent", () => {
    const result = I.build(I.with.host("a"), I.default("host", "b"), I.default("port", 1));
    expect(result).toEqual({ host: "a", port: 1 });
  });

  test("defaults merges without overwriting existing keys", () => {
    const result = I.build(I.with.host("a"), I.defaults({ host: "b", port: 2 }));
    expect(result).toEqual({ host: "a", port: 2 });
  });

  test("defaults enable config-merge in a single pass", () => {
    const defaults = I.defaults({ host: "localhost", port: 3000 });
    const result = I.build(
      defaults,
      I.override("port", 8080),
      I.derive(["host", "port"], ({ host, port }) => ({
        url: `${host}:${port}`,
      })),
      I.exhaustive,
    );
    expect(result).toEqual({ host: "localhost", port: 8080, url: "localhost:8080" });
  });

  test("default and defaults are available on the chain", () => {
    const result = I.begin().field("host", "a").default("host", "b").defaults({ port: 1 }).build();
    expect(result).toEqual({ host: "a", port: 1 });
  });

  test("when(true, default) sets an absent key", () => {
    const result = I.build(I.with.host("a"), I.when(true, I.default("port", 1)));
    expect(result).toEqual({ host: "a", port: 1 });
  });

  test("when(false, default) leaves the key absent", () => {
    const result = I.build(I.with.host("a"), I.when(false, I.default("port", 1)));
    expect(result).toEqual({ host: "a" });
  });

  test("defaults can be lazy", () => {
    const result = I.build(I.defaults(() => ({ host: "lazy", port: 2 })));
    expect(result).toEqual({ host: "lazy", port: 2 });
  });
});

describe("chained builder", () => {
  test("mirrors the composable API", () => {
    const result = I.begin()
      .field("host", "localhost")
      .field("port", 3000)
      .derive(({ host, port }) => ({ url: `http://${host}:${port}` }))
      .exhaustive();
    expect(result).toEqual({
      host: "localhost",
      port: 3000,
      url: "http://localhost:3000",
    });
  });

  test("use() consumes first-class parts", () => {
    const hostPart = I.partial({ host: "localhost" });
    const portPart = I.partial({ port: 3000 });

    const result = I.begin()
      .use(hostPart)
      .use(portPart)
      .derive(({ host, port }) => ({ url: `http://${host}:${port}` }))
      .exhaustive();

    expect(result).toEqual({
      host: "localhost",
      port: 3000,
      url: "http://localhost:3000",
    });
  });

  test("build() finalizes without exhaustiveness", () => {
    const result = I.begin().field("host", "localhost").build();
    expect(result).toEqual({ host: "localhost" });
  });

  test("override and update are available on the chain", () => {
    const result = I.begin()
      .field("port", 3000)
      .update("port", (n) => n + 1)
      .override("port", 9)
      .build();
    expect(result).toEqual({ port: 9 });
  });

  test("when() is available on the chain", () => {
    const result = I.begin().field("host", "a").when(true, I.with.port(1)).build();
    expect(result).toEqual({ host: "a", port: 1 });

    const skipped = I.begin().field("host", "a").when(false, I.with.port(1)).build();
    expect(skipped).toEqual({ host: "a" });
  });
});

describe("reusable parts", () => {
  test("parts compose across independent definitions", () => {
    const routingPart = I.partial({ host: "router" });
    const remotePart = I.partial({ port: 7000 });
    const derivedPart = I.derive(["host", "port"], ({ host, port }) => ({
      url: `${host}:${port}`,
    }));

    const result = I.build(routingPart, remotePart, derivedPart, I.exhaustive);

    expect(result).toEqual({ host: "router", port: 7000, url: "router:7000" });
  });
});

describe("runtime safety", () => {
  test("duplicate contributions throw", () => {
    // @ts-expect-error duplicate contributions are rejected statically
    const build = () => I.build(I.with.host("a"), I.with.host("b"));
    expect(build).toThrow(/duplicate contribution for key "host"/);
  });

  test("replacing a missing key throws", () => {
    // @ts-expect-error replacing a missing key is rejected statically
    const build = () => I.build(I.override("host", "a"));
    expect(build).toThrow(/cannot replace missing key "host"/);
  });

  test("non-parts throw", () => {
    // @ts-expect-error a plain object is not a Part
    const build = () => I.build({} as never);
    expect(build).toThrow(/expected a Part/);
  });

  test("a part contributing a non-object throws", () => {
    const bad = I.derive(["host"], () => null as never);
    expect(() => I.build(I.with.host("a"), bad)).toThrow(/must contribute an object/);
  });
});

describe("purity and reuse", () => {
  test("a part can be reused across builds without interference", () => {
    const part = I.partial({ host: "localhost" });
    const first = I.build(part, I.with.port(1));
    const second = I.build(part, I.with.port(2));
    expect(first).toEqual({ host: "localhost", port: 1 });
    expect(second).toEqual({ host: "localhost", port: 2 });
    expect(part).not.toHaveProperty("host");
  });

  test("a lazy factory runs once per build", () => {
    let calls = 0;
    const part = I.partial(() => {
      calls += 1;
      return { host: "lazy" };
    });
    I.build(part);
    I.build(part);
    expect(calls).toBe(2);
  });

  test("when(false) does not evaluate the wrapped part", () => {
    let evaluated = false;
    const inner = I.derive(["host"], ({ host }) => {
      evaluated = true;
      return { url: host };
    });
    const result = I.build(I.with.host("a"), I.when(false, inner));
    expect(evaluated).toBe(false);
    expect(result).toEqual({ host: "a" });
  });

  test("when(false) does not trigger replacement checks", () => {
    // @ts-expect-error the wrapped replace still requires the key statically
    const result = I.build(I.when(false, I.override("host", "a")));
    expect(result).toEqual({});
  });
});

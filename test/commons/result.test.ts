import { describe, expect, it } from "vitest";
import { andThen, err, isOk, map, match, ok } from "../../src/commons/result.ts";

class SampleError extends Error {
  readonly _tag = "SampleError" as const;
}

describe("result", () => {
  it("ok carries the value", () => {
    expect(ok(42)).toEqual({ _tag: "ok", value: 42 });
  });

  it("err carries the tagged error", () => {
    const error = new SampleError("boom");
    expect(err(error)).toEqual({ _tag: "err", error });
  });

  it("map transforms ok and passes err through", () => {
    const error = new SampleError("boom");
    expect(map(ok(2), (n: number): number => n * 3)).toEqual({ _tag: "ok", value: 6 });
    expect(map(err(error), (n: number): number => n * 3)).toEqual({ _tag: "err", error });
  });

  it("andThen chains fallible steps and unions the error types", () => {
    const first: ReturnType<typeof ok<number>> = ok(2);
    const doubled = andThen(first, (n: number) => ok<number>(n * 2));
    expect(doubled).toEqual({ _tag: "ok", value: 4 });
    const error = new SampleError("late");
    const failed = andThen(ok(1), (): ReturnType<typeof err<SampleError>> => err(error));
    expect(failed).toEqual({ _tag: "err", error });
  });

  it("match destructures both states", () => {
    const render = (
      r: ReturnType<typeof ok<number>> | ReturnType<typeof err<SampleError>>,
    ): string =>
      match(r, {
        ok: (value: number): string => `value ${value}`,
        err: (error: SampleError): string => `error ${error.message}`,
      });
    expect(render(ok(3))).toBe("value 3");
    expect(render(err(new SampleError("nope")))).toBe("error nope");
  });

  it("isOk narrows to the value", () => {
    const r = ok("x");
    if (isOk(r)) {
      expect(r.value).toBe("x");
    } else {
      expect.unreachable("ok result must narrow");
    }
  });
});

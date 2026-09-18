import { describe, expect, it } from "vitest";
import { isOk } from "../../../src/commons/result.ts";
import { applyFilePlan, FilePlanFailed } from "../../../src/shell/fs/apply.ts";
import { AtomicWriteFailed, type FileIo } from "../../../src/shell/fs/io.ts";

interface FakeStore {
  readonly files: Map<string, string>;
}

function fakeIo(store: FakeStore, failOnPath?: string): FileIo {
  return {
    write: (path: string, content: string) => {
      if (path === failOnPath) {
        return { _tag: "err", error: new AtomicWriteFailed(path, "write", "injected failure") };
      }
      store.files.set(path, content);
      return { _tag: "ok", value: undefined };
    },
    read: (path: string) => {
      const content = store.files.get(path);
      return content === undefined
        ? { _tag: "err", error: new AtomicWriteFailed(path, "absent", "missing") }
        : { _tag: "ok", value: content };
    },
    remove: (path: string) => {
      store.files.delete(path);
      return { _tag: "ok", value: undefined };
    },
  };
}

describe("applyFilePlan", () => {
  it("rolls back prior removals when a later write fails", () => {
    const store: FakeStore = {
      files: new Map([
        ["old-skill", "preserved"],
        ["lock", "old lock"],
      ]),
    };
    const base = fakeIo(store, "lock");
    let removedBeforeLock = false;
    const result = applyFilePlan(
      [
        { path: "old-skill", remove: true },
        { path: "lock", content: "new lock" },
      ],
      {
        ...base,
        write: (path, content) => {
          if (path === "lock") removedBeforeLock = !store.files.has("old-skill");
          return base.write(path, content);
        },
      },
    );
    expect(removedBeforeLock).toBe(true);
    expect(result._tag).toBe("err");
    expect(store.files.get("old-skill")).toBe("preserved");
    expect(store.files.get("lock")).toBe("old lock");
  });

  it("refuses unreadable preimages before changing any file", () => {
    const store: FakeStore = { files: new Map([["law", "private law"]]) };
    const base = fakeIo(store);
    const result = applyFilePlan([{ path: "law", content: "replacement" }], {
      ...base,
      read: (path) => ({
        _tag: "err",
        error: new AtomicWriteFailed(path, "read", "permission denied"),
      }),
    });
    expect(result._tag).toBe("err");
    expect(store.files.get("law")).toBe("private law");
  });

  it("writes every entry in order when nothing fails", () => {
    const store: FakeStore = { files: new Map() };
    const io = fakeIo(store);
    const result = applyFilePlan(
      [
        { path: "a", content: "one" },
        { path: "b", content: "two" },
      ],
      io,
    );
    expect(isOk(result)).toBe(true);
    expect(store.files.get("a")).toBe("one");
    expect(store.files.get("b")).toBe("two");
  });

  it("restores preimages and deletes created files on mid-plan failure", () => {
    const store: FakeStore = {
      files: new Map([
        ["a", "old-a"],
        ["b", "old-b"],
      ]),
    };
    const io = fakeIo(store, "b");
    const result = applyFilePlan(
      [
        { path: "a", content: "new-a" },
        { path: "b", content: "new-b" },
        { path: "c", content: "new-c" },
      ],
      io,
    );
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error).toBeInstanceOf(FilePlanFailed);
    expect(result.error.path).toBe("b");
    expect(store.files.get("a")).toBe("old-a");
    expect(store.files.get("b")).toBe("old-b");
    expect(store.files.has("c")).toBe(false);
  });

  it("removes files this plan created when a later write fails", () => {
    const store: FakeStore = { files: new Map() };
    const io = fakeIo(store, "b");
    applyFilePlan(
      [
        { path: "a", content: "new-a" },
        { path: "b", content: "new-b" },
      ],
      io,
    );
    expect(store.files.has("a")).toBe(false);
    expect(store.files.has("b")).toBe(false);
  });
});

/** The ledger's writer lock: one owner at a time, released only through its exact recorded process identity. */
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  watch,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectLedgerWriterLock,
  LedgerLockError,
  releaseStaleLedgerWriterLock,
  withLedgerLock,
} from "../../src/shell/ledger-lock.ts";

const roots: string[] = [];
const children: Array<ReturnType<typeof spawn>> = [];
afterEach(async () => {
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGKILL");
      await once(child, "exit");
    }),
  );
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-ledger-lock-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, "corpus/ledger/records"), { recursive: true });
  return root;
}

async function waitForFile(path: string): Promise<void> {
  if (existsSync(path)) return;
  await new Promise<void>((resolveFile, reject) => {
    const watcher = watch(join(path, ".."), () => {
      if (!existsSync(path)) return;
      watcher.close();
      resolveFile();
    });
    watcher.once("error", reject);
  });
}

describe("the ledger writer lock", () => {
  it("holds one writer at a time: a second writer is refused while the first holds the lock, and admitted after", () => {
    const root = repository();
    const nested = withLedgerLock(root, () => withLedgerLock(root, () => "inner"));
    expect(nested._tag).toBe("ok");
    if (nested._tag === "err") throw nested.error;
    expect(nested.value._tag).toBe("err");
    if (nested.value._tag === "ok") throw new Error("a second writer took the held lock");
    expect(nested.value.error).toBeInstanceOf(LedgerLockError);
    expect(nested.value.error).toMatchObject({ kind: "conflict", input: "ledger writer lock" });
    expect(withLedgerLock(root, () => "after")).toEqual({ _tag: "ok", value: "after" });
    expect(inspectLedgerWriterLock(root)).toEqual({ _tag: "ok", value: null });
  });

  it("F3-R4 releases a killed writer only through its exact recorded process identity", async () => {
    const root = repository();
    const module = pathToFileURL(resolve("src/shell/ledger-lock.ts")).href;
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { withLedgerLock } from ${JSON.stringify(module)}; withLedgerLock(${JSON.stringify(root)}, () => { process.stdout.write("locked\\n"); while (true) {} });`,
      ],
      { env: { ...process.env, TZ: "UTC" }, stdio: ["ignore", "pipe", "inherit"] },
    );
    children.push(child);
    await new Promise<void>((resolveLocked, reject) => {
      child.once("error", reject);
      child.stdout.once("data", () => resolveLocked());
    });
    const owner = inspectLedgerWriterLock(root);
    expect(owner._tag).toBe("ok");
    if (owner._tag === "err" || owner.value === null) throw new Error("writer owner missing");
    expect(
      releaseStaleLedgerWriterLock(root, { ...owner.value, nonce: randomUUID() }),
    ).toMatchObject({
      _tag: "err",
      error: { kind: "conflict", input: "ledger writer lock owner" },
    });
    expect(releaseStaleLedgerWriterLock(root, owner.value)).toMatchObject({
      _tag: "err",
      error: { kind: "conflict", input: "live ledger writer" },
    });
    const previousTimezone = process.env["TZ"];
    process.env["TZ"] = "Pacific/Auckland";
    try {
      expect(releaseStaleLedgerWriterLock(root, owner.value)).toMatchObject({
        _tag: "err",
        error: { kind: "conflict", input: "live ledger writer" },
      });
      expect(inspectLedgerWriterLock(root)).toEqual({ _tag: "ok", value: owner.value });
    } finally {
      if (previousTimezone === undefined) delete process.env["TZ"];
      else process.env["TZ"] = previousTimezone;
    }
    child.kill("SIGKILL");
    await once(child, "exit");
    expect(releaseStaleLedgerWriterLock(root, owner.value)).toEqual({
      _tag: "ok",
      value: undefined,
    });
    expect(inspectLedgerWriterLock(root)).toEqual({ _tag: "ok", value: null });
  });

  it("F3-R5 a delayed concurrent reaper cannot unlink a replacement live writer", async () => {
    const root = repository();
    const module = pathToFileURL(resolve("src/shell/ledger-lock.ts")).href;
    const writerCode = `import { withLedgerLock } from ${JSON.stringify(module)}; withLedgerLock(${JSON.stringify(root)}, () => { process.stdout.write("locked\\n"); while (true) {} });`;
    const oldWriter = spawn(process.execPath, ["--input-type=module", "--eval", writerCode], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    children.push(oldWriter);
    await once(oldWriter.stdout, "data");
    const oldOwner = inspectLedgerWriterLock(root);
    expect(oldOwner._tag).toBe("ok");
    if (oldOwner._tag === "err" || oldOwner.value === null) throw new Error("old owner missing");
    const confirmedOldOwner = oldOwner.value;
    oldWriter.kill("SIGKILL");
    await once(oldWriter, "exit");

    const control = join(root, "reaper-control");
    const signals = join(control, "signals");
    const binaries = join(control, "bin");
    mkdirSync(signals, { recursive: true });
    mkdirSync(binaries, { recursive: true });
    const ps = join(binaries, "ps");
    writeFileSync(
      ps,
      `#!/bin/sh\ncase "$*" in\n  *"$DEAD_PID"*)\n    : > "$SIGNAL_DIR/$REAPER"\n    while [ ! -e "$GO_FILE" ]; do /bin/sleep 0.01; done\n    ;;\nesac\nexec /bin/ps "$@"\n`,
    );
    chmodSync(ps, 0o755);
    const reaperCode = `import { releaseStaleLedgerWriterLock } from ${JSON.stringify(module)}; process.stdout.write(JSON.stringify(releaseStaleLedgerWriterLock(${JSON.stringify(root)}, ${JSON.stringify(confirmedOldOwner)})));`;
    const reaper = (name: "A" | "B") => {
      const go = join(control, `go-${name}`);
      const child = spawn(process.execPath, ["--input-type=module", "--eval", reaperCode], {
        env: {
          ...process.env,
          PATH: `${binaries}:${process.env["PATH"] ?? ""}`,
          DEAD_PID: String(confirmedOldOwner.pid),
          SIGNAL_DIR: signals,
          REAPER: name,
          GO_FILE: go,
        },
        stdio: ["ignore", "pipe", "inherit"],
      });
      children.push(child);
      return {
        go,
        child,
      };
    };
    const first = reaper("A");
    const delayed = reaper("B");
    await Promise.all([waitForFile(join(signals, "A")), waitForFile(join(signals, "B"))]);
    writeFileSync(first.go, "go\n");
    const firstOutput: Buffer[] = [];
    first.child.stdout.on("data", (data) => firstOutput.push(data));
    await once(first.child, "exit");
    expect(JSON.parse(Buffer.concat(firstOutput).toString("utf8"))).toEqual({
      _tag: "ok",
    });

    const replacement = spawn(process.execPath, ["--input-type=module", "--eval", writerCode], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    children.push(replacement);
    await once(replacement.stdout, "data");
    const replacementOwner = inspectLedgerWriterLock(root);
    expect(replacementOwner._tag).toBe("ok");
    if (replacementOwner._tag === "err" || replacementOwner.value === null)
      throw new Error("replacement owner missing");

    const delayedOutput: Buffer[] = [];
    delayed.child.stdout.on("data", (data) => delayedOutput.push(data));
    writeFileSync(delayed.go, "go\n");
    await once(delayed.child, "exit");
    expect(JSON.parse(Buffer.concat(delayedOutput).toString("utf8"))).toEqual({
      _tag: "ok",
    });
    expect(inspectLedgerWriterLock(root)).toEqual({
      _tag: "ok",
      value: replacementOwner.value,
    });
    replacement.kill("SIGKILL");
    await once(replacement, "exit");
    expect(releaseStaleLedgerWriterLock(root, replacementOwner.value)).toEqual({
      _tag: "ok",
      value: undefined,
    });
  });
});

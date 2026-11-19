import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { parseJson, type JsonValue } from "../core/contract.ts";
import { processTable } from "./processes.ts";

/**
 * A local Chrome or Chromium driven over its DevTools protocol (J-123 S5),
 * for the interface check's render engine: found where the owner has one,
 * never installed and never a dependency. The order: `GREENLINE_CHROME`,
 * then the Chromium the workspace's Playwright downloaded, then the usual
 * places of Chrome, Chromium, Edge and Brave on macOS, Linux and Windows.
 * It is launched headless with a throwaway profile, bound to 127.0.0.1,
 * with no keychain or keyring asked for (J-191 S1), spoken to through
 * Node's own WebSocket, and stopped with its process group.
 */

/** The browser's executable, or why none was found. */
export type BrowserFound =
  | { readonly kind: "found"; readonly path: string }
  | { readonly kind: "missing"; readonly reason: string };

/** The Chromium builds Playwright keeps in its cache, newest last. */
function playwrightBrowsers(environment: NodeJS.ProcessEnv): readonly string[] {
  const local = environment["LOCALAPPDATA"];
  const roots = [
    environment["PLAYWRIGHT_BROWSERS_PATH"],
    join(homedir(), "Library", "Caches", "ms-playwright"),
    join(homedir(), ".cache", "ms-playwright"),
    local === undefined ? undefined : join(local, "ms-playwright"),
  ].filter(
    (root): root is string => root !== undefined && root !== "" && root !== "0" && existsSync(root),
  );
  const inside = [
    [
      "chrome-mac-arm64",
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing",
    ],
    [
      "chrome-mac",
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing",
    ],
    ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
    ["chrome-linux64", "chrome"],
    ["chrome-linux", "chrome"],
    ["chrome-win64", "chrome.exe"],
    ["chrome-win", "chrome.exe"],
  ];
  return roots.flatMap((root) => {
    let builds: readonly string[];
    try {
      builds = readdirSync(root)
        .filter((name) => /^chromium-\d+$/.test(name))
        .sort();
    } catch {
      return [];
    }
    return builds.flatMap((build) => inside.map((parts) => join(root, build, ...parts)));
  });
}

/**
 * The first browser found.
 * @param environment the process environment
 * @returns the executable, or why none was found
 */
export function findBrowser(environment: NodeJS.ProcessEnv): BrowserFound {
  const named = environment["GREENLINE_CHROME"];
  if (named !== undefined && named !== "")
    return existsSync(named)
      ? { kind: "found", path: named }
      : { kind: "missing", reason: `GREENLINE_CHROME names ${named}, which does not exist` };
  const programFiles = environment["PROGRAMFILES"] ?? "C:\\Program Files";
  const candidates = [
    ...[...playwrightBrowsers(environment)].reverse(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge",
    join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  return path === undefined
    ? {
        kind: "missing",
        reason:
          "no browser found: no GREENLINE_CHROME, no Playwright Chromium and no Chrome, Chromium, Edge or Brave in the usual places",
      }
    : { kind: "found", path };
}

/** A DevTools event's listener. */
type Listener = (method: string, params: JsonValue) => void;

/** A command waiting for its answer. */
interface Pending {
  readonly resolve: (value: JsonValue) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

/** A command's parameters. */
export type CommandParams = { readonly [key: string]: JsonValue };

/** The time any one command or wait may take. */
const COMMAND_TIMEOUT_MS = 30_000;

const json: z.ZodType<JsonValue> = z.json();

/** One DevTools frame: an answer to a command by its id, or an event by its method. */
const frameSchema = z.object({
  id: z.number().int().optional(),
  result: json.optional(),
  error: z.object({ message: z.string() }).optional(),
  method: z.string().optional(),
  params: json.optional(),
});

/** What Runtime.evaluate answers: the value, a JSON string here, or what the page threw. */
const evaluatedSchema = z.object({
  result: z.object({ value: z.string().optional() }).optional(),
  exceptionDetails: z
    .object({
      text: z.string().optional(),
      exception: z.object({ description: z.string().optional() }).optional(),
    })
    .optional(),
});

/** One DevTools session over a page's WebSocket: commands answered by id, events by method. */
export class DevtoolsSession {
  private next = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners: Listener[] = [];
  private readonly socket: WebSocket;

  /** @param socket the page's DevTools socket, open */
  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (message: MessageEvent) => {
      const parsed = frameSchema.safeParse(parseJson(String(message.data)));
      if (!parsed.success) return;
      const frame = parsed.data;
      if (frame.id !== undefined) {
        const waiting = this.pending.get(frame.id);
        this.pending.delete(frame.id);
        if (waiting !== undefined) clearTimeout(waiting.timer);
        if (frame.error !== undefined) waiting?.reject(new Error(frame.error.message));
        else waiting?.resolve(frame.result ?? null);
      } else if (frame.method !== undefined)
        for (const listener of this.listeners) listener(frame.method, frame.params ?? null);
    });
  }

  /**
   * Send one command and wait for its answer.
   * @param method the protocol's method
   * @param params its parameters
   * @param timeoutMs how long its answer may take; thirty seconds where none is given
   * @returns the answer's result
   */
  send(
    method: string,
    params: CommandParams = {},
    timeoutMs: number = COMMAND_TIMEOUT_MS,
  ): Promise<JsonValue> {
    const id = this.next;
    this.next += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, timeoutMs);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  /** Listen to every event. */
  on(listener: Listener): void {
    this.listeners.push(listener);
  }

  /**
   * Wait for one event.
   * @param method the event's method
   * @param timeoutMs how long to wait
   * @returns its params
   */
  waitFor(method: string, timeoutMs: number = COMMAND_TIMEOUT_MS): Promise<JsonValue> {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        done = true;
        reject(new Error(`${method} did not arrive`));
      }, timeoutMs);
      this.on((name, params) => {
        if (done || name !== method) return;
        done = true;
        clearTimeout(timer);
        resolve(params);
      });
    });
  }

  /**
   * Evaluate an expression in the page whose value is a JSON string, and read it.
   * @param expression the expression, its value a string or a promise of one
   * @returns the value the string holds
   */
  async evaluate(expression: string): Promise<JsonValue> {
    const answer = evaluatedSchema.safeParse(
      await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }),
    );
    if (!answer.success)
      throw new Error("Runtime.evaluate answered in a form it does not document");
    const details = answer.data.exceptionDetails;
    if (details !== undefined)
      throw new Error(details.exception?.description ?? details.text ?? "the page's reader threw");
    const value = parseJson(answer.data.result?.value ?? "");
    if (value === undefined) throw new Error("the page's reader returned no JSON");
    return value;
  }
}

/** A launched browser. */
export interface Browser {
  readonly port: number;
  readonly child: ChildProcess;
  readonly profile: string;
}

/** The browsers this process launched and has not stopped yet, which its exit stops (J-173 S1). */
const live = new Set<Browser>();

/** Whether the exit's stop is registered. */
let exitStopRegistered = false;

/**
 * The profiles of the browsers this process launched and has not stopped.
 * @returns each live browser's profile directory
 */
export function liveBrowsers(): readonly string[] {
  return [...live].map((browser) => browser.profile);
}

/**
 * The processes whose command line names a browser's throwaway profile:
 * the browser and every helper it started, whatever group they stand in.
 * None on Windows, whose process list is not read here.
 * @param profile the profile directory
 * @returns their process ids
 */
export function browserProcesses(profile: string): readonly number[] {
  if (profile === "") return [];
  return (processTable()?.rows ?? [])
    .filter((row) => row.command.includes(`--user-data-dir=${profile}`))
    .map((row) => row.pid);
}

/** Kill every process that still names the profile. */
function sweep(profile: string): void {
  for (const pid of browserProcesses(profile))
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Gone already.
    }
}

/** At the process's exit, a browser not yet stopped is killed with its group and its profile removed, synchronously. */
function stopAtExit(): void {
  for (const browser of live) {
    killGroup(browser.child, "SIGKILL");
    sweep(browser.profile);
    rmSync(browser.profile, { recursive: true, force: true });
  }
  live.clear();
}

/**
 * Launch the browser headless, its DevTools on a port it picks at 127.0.0.1.
 * It joins the live browsers, which the process's exit stops whatever path
 * it takes, an uncaught error among them (J-173 S1).
 * @param executable the browser's path
 * @param environment the environment it runs in, its HOME among it; the process's own by default
 * @returns the browser
 */
export function launchBrowser(
  executable: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Browser> {
  if (!exitStopRegistered) {
    exitStopRegistered = true;
    process.once("exit", stopAtExit);
  }
  const profile = mkdtempSync(join(tmpdir(), "greenline-render-"));
  const child = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      // No keychain or keyring is asked for the cookie store's key (J-191 S1): where HOME holds none,
      // as under a harness's own home, macOS raised its keychain dialog and Page.navigate waited past
      // its time (j109t-linearc F1); a throwaway profile keeps no secret worth the keychain.
      "--use-mock-keychain",
      "--password-store=basic",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
      detached: process.platform !== "win32",
      env: environment,
    },
  );
  return new Promise((resolve, reject) => {
    let text = "";
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killGroup(child, "SIGKILL");
      sweep(profile);
      rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
      reject(error);
    };
    const timer = setTimeout(() => {
      fail(new Error("the browser printed no DevTools port"));
    }, 60_000);
    child.stderr?.on("data", (chunk: Buffer) => {
      if (settled) return;
      text += chunk.toString();
      const found = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(text);
      if (found !== null) {
        settled = true;
        clearTimeout(timer);
        const browser = { port: Number(found[1]), child, profile };
        live.add(browser);
        resolve(browser);
      }
    });
    child.once("error", fail);
    child.once("exit", (code) => {
      fail(new Error(`the browser exited before it listened (code ${String(code)})`));
    });
  });
}

/**
 * Signal the browser's process group, or the browser alone where there are no groups.
 * @param child the browser's process
 * @param signal the signal
 */
function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-pid, signal);
  } catch {
    // The group cannot be signalled, gone or out of reach: the browser itself is.
    try {
      child.kill(signal);
    } catch {
      // The browser is gone already.
    }
  }
}

/** Wait for the browser to exit, at most the time given; the wait holds the process open, so the stop is never cut short. */
function exited(child: ChildProcess, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Stop the browser: its process group asked to end, then killed where it
 * has not within five seconds, then every process still naming its profile
 * killed, then its profile removed (J-173 S1). The drive calls it on every
 * path, a timeout and a thrown error included, and the process's exit
 * stops any browser it missed.
 * @param browser the browser
 */
export async function stopBrowser(browser: Browser): Promise<void> {
  if (browser.child.pid !== undefined) {
    killGroup(browser.child, "SIGTERM");
    await exited(browser.child, 5_000);
    killGroup(browser.child, "SIGKILL");
    await exited(browser.child, 2_000);
  }
  sweep(browser.profile);
  live.delete(browser);
  rmSync(browser.profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}

/** What /json/new answers: the new target's id and its DevTools socket's address. */
const targetSchema = z.object({ id: z.string(), webSocketDebuggerUrl: z.string() });

/** An open page and its session. */
export interface OpenPage {
  readonly session: DevtoolsSession;
  readonly close: () => Promise<void>;
}

/**
 * Open a new blank page and a session on it.
 * @param port the browser's DevTools port
 * @returns the page
 */
export async function openPage(port: number): Promise<OpenPage> {
  const answer = await fetch(`http://127.0.0.1:${String(port)}/json/new?about:blank`, {
    method: "PUT",
    signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
  });
  const target = targetSchema.parse(parseJson(await answer.text()));
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("the browser's page opened no DevTools socket"));
    }, COMMAND_TIMEOUT_MS);
    socket.addEventListener(
      "open",
      (event) => {
        clearTimeout(timer);
        resolve(event);
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      (event) => {
        clearTimeout(timer);
        reject(event);
      },
      { once: true },
    );
  });
  return {
    session: new DevtoolsSession(socket),
    close: async () => {
      socket.close();
      await fetch(`http://127.0.0.1:${String(port)}/json/close/${target.id}`, {
        method: "PUT",
        signal: AbortSignal.timeout(5_000),
      }).catch(() => undefined);
    },
  };
}

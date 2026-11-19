import { availableParallelism } from "node:os";
import { isMainThread, parentPort, threadId, Worker, workerData } from "node:worker_threads";
import { z } from "zod";
import type { Installation } from "../../core/installation.ts";
import { withPinnedHead } from "../code-tree.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import { documentAt } from "./answers.ts";

/**
 * The inspector's builders (J-154 S2): the threads that build its documents,
 * so the server's request loop never waits on a git or file read. Each
 * builder is a worker thread running this module, or, in the bundle, the
 * CLI's one file, whose entry runs only on the main thread; each holds the
 * answers a commit's id fixes for the life of the server. A document is
 * built with HEAD pinned to the commit it names when the build begins, and
 * with the state it reads named, so the status is run once for that state:
 * the documents that run it are built on one thread, the status thread.
 * Where no thread can start, the server builds in its own thread, slower and
 * still correct.
 */

/** The role a builder thread is started with, read before anything else. */
const ROLE = "greenline-inspect-builder";

/** The documents that run `greenline status`, built on one thread so it runs once for a state. */
const STATUS_DOCUMENTS: ReadonlySet<string> = new Set([
  "/api/desk",
  "/api/changes",
  "/api/plans",
  "/api/practice",
]);

/** A change's parts that run its status, built on the same thread so the run is shared for a state (J-165 S1). */
const CHANGE_STATUS_PART = /^\/api\/changes\/[^/]+\/(?:checks|commits|changed)(?:\/.*)?$/;

/**
 * Whether a document runs `greenline status`, so it is built on the status thread.
 * @param address the document's address under /api/
 * @returns whether it runs the status
 */
function runsStatus(address: string): boolean {
  return STATUS_DOCUMENTS.has(address) || CHANGE_STATUS_PART.test(address);
}

/** A document built: its status, its body as JSON text, how long the build took and the thread that built it, 0 for the server's own. */
export interface Built {
  readonly status: number;
  readonly body: string;
  readonly ms: number;
  readonly thread: number;
}

/** What a builder thread is started with: the root and the environment it reads under. */
interface Seed {
  readonly role: typeof ROLE;
  readonly root: string;
  readonly cwd: string;
  readonly version: string;
  readonly installation: Installation;
  readonly environment: NodeJS.ProcessEnv | undefined;
}

/**
 * Build one document in this thread, HEAD pinned for the whole reading.
 * @param root the repository root
 * @param env the environment it reads under
 * @param address the document's address under /api/
 * @param query the address's query
 * @param state the whole state the build reads, as the server's cache names it
 * @returns the document built
 */
export function buildHere(
  root: string,
  env: CliEnvironment,
  address: string,
  query: string,
  state: string,
): Built {
  const started = performance.now();
  const answer = withPinnedHead(
    root,
    // The document names the state it read, its revision, the cache's key.
    () =>
      documentAt(root, env, address, new URLSearchParams(query), {
        at: new Date().toISOString(),
        revision: state,
      }),
    state,
  );
  return {
    status: answer.status,
    body: JSON.stringify(answer.body),
    ms: performance.now() - started,
    thread: threadId,
  };
}

/** A build the server asks a builder thread for. */
interface Job {
  readonly id: number;
  readonly address: string;
  readonly query: string;
  readonly state: string;
}
const job: z.ZodType<Job> = z
  .object({ id: z.number(), address: z.string(), query: z.string(), state: z.string() })
  .strict();
const done = z
  .object({
    id: z.number(),
    status: z.number(),
    body: z.string(),
    ms: z.number(),
    thread: z.number(),
  })
  .strict();
const seedFields = z.looseObject({
  role: z.literal(ROLE),
  root: z.string(),
  cwd: z.string(),
  version: z.string(),
});

/** In a builder thread: answer each job the server posts, one at a time. */
function serveJobs(port: NonNullable<typeof parentPort>, seed: Seed): void {
  // A read never writes the owner's index, so a build cannot wake the server's watcher.
  process.env["GIT_OPTIONAL_LOCKS"] = "0";
  const base: CliEnvironment = {
    cwd: seed.cwd,
    version: seed.version,
    installation: seed.installation,
  };
  const env: CliEnvironment =
    seed.environment === undefined ? base : { ...base, environment: seed.environment };
  port.on("message", (message: Job) => {
    const asked = job.safeParse(message);
    if (!asked.success) return;
    const { id, address, query, state } = asked.data;
    try {
      port.postMessage({ id, ...buildHere(seed.root, env, address, query, state) });
    } catch {
      // A build that throws is answered as the server answered a failed request, without the reason.
      port.postMessage({
        id,
        status: 400,
        body: JSON.stringify({ error: "Inspector request failed." }),
        ms: 0,
        thread: threadId,
      });
    }
  });
}

if (!isMainThread && parentPort !== null && seedFields.safeParse(workerData).success)
  // SAFETY: the shape check above holds the role, the root, the directory and the version; the installation and environment are the server's own, passed whole.
  serveJobs(parentPort, workerData as Seed);

/** A build waiting for its builder's answer. */
interface Pending {
  readonly resolve: (built: Built) => void;
  readonly reject: (error: Error) => void;
}

/** One builder thread, the builds it owes, and whether it ever answered. */
interface Builder {
  readonly worker: Worker;
  readonly pending: Map<number, Pending>;
  answered: boolean;
}

/**
 * The server's builders: up to `size` threads, started as builds are asked
 * for. A document that runs the status goes to the status thread, so status
 * runs once for a state; any other goes to an idle thread beside it, or a new
 * one, or the one owing fewest, so a build waits behind another only when
 * every thread is busy. A thread that fails or ends fails the builds it owed
 * and is replaced at the next ask; a thread that fails before it ever
 * answers means none can start, and the pool refuses every build after.
 */
export class BuilderPool {
  private readonly builders: Builder[] = [];
  private statusBuilder: Builder | undefined;
  private readonly size: number;
  private next = 0;
  private closed = false;
  private broken = false;
  private readonly seed: Seed;

  constructor(
    root: string,
    env: CliEnvironment,
    size: number = Math.min(4, Math.max(2, availableParallelism() >> 1)),
  ) {
    this.size = Math.max(1, size);
    this.seed = {
      role: ROLE,
      root,
      cwd: env.cwd,
      version: env.version,
      installation: env.installation,
      environment: env.environment,
    };
  }

  /**
   * Build a document on a builder thread.
   * @param address the document's address under /api/
   * @param query the address's query
   * @param state the whole state the build reads
   * @returns the document built; rejected when no thread could build it
   */
  build(address: string, query: string, state: string): Promise<Built> {
    if (this.closed) return Promise.reject(new Error("The inspector is closing."));
    if (this.broken) return Promise.reject(new Error("No inspector builder can start."));
    const builder = runsStatus(address) ? this.statusThread() : this.pick();
    const id = this.next++;
    return new Promise((resolve, reject) => {
      builder.pending.set(id, { resolve, reject });
      builder.worker.postMessage({ id, address, query, state });
    });
  }

  /**
   * Start the status thread and one beside it before any build is asked, so
   * the first read of a page waits on no thread's start (J-165 S1).
   */
  warm(): void {
    if (this.closed || this.broken) return;
    this.statusThread();
    if (this.builders.length < Math.min(2, this.size)) this.start();
  }

  /** Whether the pool is closing, so a build it refused is not built elsewhere. */
  get closing(): boolean {
    return this.closed;
  }

  /** Stop every builder; a build still owed is refused. */
  async close(): Promise<void> {
    this.closed = true;
    this.statusBuilder = undefined;
    await Promise.all(this.builders.splice(0).map((builder) => builder.worker.terminate()));
  }

  private statusThread(): Builder {
    this.statusBuilder ??= this.start();
    return this.statusBuilder;
  }

  private pick(): Builder {
    const others = this.builders.filter((builder) => builder !== this.statusBuilder);
    const idle = others.find((builder) => builder.pending.size === 0);
    if (idle !== undefined) return idle;
    if (this.builders.length < this.size) return this.start();
    const busy = others.length === 0 ? this.builders : others;
    return busy.reduce((least, builder) =>
      builder.pending.size < least.pending.size ? builder : least,
    );
  }

  private start(): Builder {
    const worker = new Worker(new URL(import.meta.url), { workerData: this.seed });
    worker.unref();
    const builder: Builder = { worker, pending: new Map(), answered: false };
    const fail = (error: Error): void => {
      const at = this.builders.indexOf(builder);
      if (at !== -1) this.builders.splice(at, 1);
      if (this.statusBuilder === builder) this.statusBuilder = undefined;
      if (!builder.answered && !this.closed) this.broken = true;
      for (const owed of builder.pending.values()) owed.reject(error);
      builder.pending.clear();
    };
    worker.on("message", (message: Built & { readonly id: number }) => {
      const answer = done.safeParse(message);
      if (!answer.success) return;
      builder.answered = true;
      const owed = builder.pending.get(answer.data.id);
      builder.pending.delete(answer.data.id);
      const { status, body, ms, thread } = answer.data;
      owed?.resolve({ status, body, ms, thread });
    });
    worker.on("error", fail);
    worker.on("exit", () => fail(new Error("An inspector builder stopped.")));
    this.builders.push(builder);
    return builder;
  }
}

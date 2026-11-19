import { z } from "zod";
import type { JsonValue } from "../core/contract.ts";
import type { LimitStage } from "../core/interface-check.ts";
import { pageBoxesSchema, type WidthBoxes } from "../core/interface-boxes.ts";
import {
  BOXES_SOURCE,
  FOCUS_PREPARE_SOURCE,
  FOCUS_STEP_SOURCE,
  samplePixelsSource,
  SETTLE_SOURCE,
  SNAPSHOT_SOURCE,
  TEXT_RESIZE_SOURCE,
  TEXT_SPACING_SOURCE,
} from "../core/interface-collector.ts";
import {
  CAPTURE_SIZES,
  FLOOR_SIZE,
  renderSnapshotSchema,
  type CaptureSize,
  type FocusStop,
  type RenderSnapshot,
  type RenderVariant,
  type VariantKind,
} from "../core/interface-render.ts";
import {
  findBrowser,
  launchBrowser,
  openPage,
  stopBrowser,
  type DevtoolsSession,
} from "./browser.ts";

/**
 * The render engine's drive (J-123 S5): one address of a running page read in
 * a local browser at each capture size, light and, where the home declares
 * it, dark, with reduced motion, at the floor's 320, with the text spacing
 * of WCAG 1.4.12, with text at 200% and with no script; a focus walk by Tab
 * at the widest size; the console's errors; and the first screen and the
 * full page of each light read captured, and of each dark read and the
 * widest reduced-motion read the first screen. One fresh load per read; it
 * clicks nothing and writes nothing on the page's side.
 */

/** One captured image: what was read, which part and its bytes as a data URL. */
export interface CapturedImage {
  readonly width: number;
  readonly scheme: "light" | "dark";
  readonly motion: "full" | "reduce";
  readonly part: "first screen" | "full page";
  readonly dataUrl: string;
}

/** What one address's drive read. */
export interface RenderDrive {
  readonly variants: readonly RenderVariant[];
  readonly focus: readonly FocusStop[];
  readonly focusables: number;
  readonly console: readonly string[];
  readonly images: readonly CapturedImage[];
  /** Each capture width's boxes, read on its light full-motion load (J-124 S1). */
  readonly boxes: readonly WidthBoxes[];
  /** The widest light first screen's sampled colours, as hex with their counts. */
  readonly samples: ReadonlyMap<string, number>;
}

/** The drive's result: what it read, or why no browser read it and at which stage (J-191 S1). */
export type DriveResult =
  | { readonly kind: "read"; readonly drive: RenderDrive }
  | { readonly kind: "no-browser"; readonly stage: LimitStage; readonly reason: string };

/** How long a load may take. */
const LOAD_TIMEOUT_MS = 30_000;
/** The full page is captured down to this many viewport heights. */
const FULL_PAGE_SCREENS = 3;

const screenshotSchema = z.object({ data: z.string() });
const countsSchema = z.record(z.string(), z.number());
const focusStepSchema = z.object({
  at: z.string().nullable(),
  tag: z.string().optional(),
  name: z.string().optional(),
  changed: z.boolean().optional(),
  covered: z.boolean().optional(),
});
const focusCountSchema = z.object({ count: z.number() });
const exceptionSchema = z.object({
  exceptionDetails: z.object({
    text: z.string().optional(),
    exception: z.object({ description: z.string().optional() }).optional(),
  }),
});
const consoleSchema = z.object({
  type: z.string(),
  args: z.array(z.object({ value: z.json().optional(), description: z.string().optional() })),
});
const logSchema = z.object({ entry: z.object({ level: z.string(), text: z.string() }) });

/** One read's settings. */
interface Read {
  readonly kind: VariantKind;
  readonly size: CaptureSize;
  readonly scheme: "light" | "dark";
  readonly motion: "full" | "reduce";
}

/** The reads of a address, in order: the light ones first, so the console and the captures are taken on them. */
function readsOf(dark: boolean): readonly Read[] {
  const light = CAPTURE_SIZES.map((size): Read => ({
    kind: "base",
    size,
    scheme: "light",
    motion: "full",
  }));
  const darkReads = dark
    ? CAPTURE_SIZES.map((size): Read => ({ kind: "base", size, scheme: "dark", motion: "full" }))
    : [];
  const [wide] = CAPTURE_SIZES;
  const phone = CAPTURE_SIZES.find((size) => size.width === 390);
  const reduce = [wide, phone].flatMap((size): Read[] =>
    size === undefined ? [] : [{ kind: "base", size, scheme: "light", motion: "reduce" }],
  );
  return [
    ...light,
    ...darkReads,
    ...reduce,
    { kind: "floor", size: FLOOR_SIZE, scheme: "light", motion: "full" },
    ...(phone === undefined
      ? []
      : [{ kind: "spacing", size: phone, scheme: "light", motion: "full" } satisfies Read]),
    ...(wide === undefined
      ? []
      : [
          { kind: "resize", size: wide, scheme: "light", motion: "full" } satisfies Read,
          { kind: "noscript", size: wide, scheme: "light", motion: "full" } satisfies Read,
        ]),
  ];
}

/** Set the viewport, the media and the scripts for a read. */
async function emulate(session: DevtoolsSession, read: Read): Promise<void> {
  const mobile = read.size.width <= 390;
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: read.size.width,
    height: read.size.height,
    deviceScaleFactor: 1,
    mobile,
  });
  await session.send(
    "Emulation.setTouchEmulationEnabled",
    mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false },
  );
  await session.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: read.scheme },
      {
        name: "prefers-reduced-motion",
        value: read.motion === "reduce" ? "reduce" : "no-preference",
      },
    ],
  });
  await session.send("Emulation.setScriptExecutionDisabled", { value: read.kind === "noscript" });
}

/** What Page.navigate answers: an error's text when the page could not be fetched. */
const navigatedSchema = z.object({ errorText: z.string().optional() });
/** A network event's request id. */
const requestSchema = z.object({
  requestId: z.string(),
  request: z.object({ url: z.string() }).optional(),
});

/** How much longer the navigation's command may wait than the load, so the load's own timeout speaks. */
const NAVIGATE_SLACK_MS = 5_000;

/** How long the network stays quiet before a page whose document is ready counts as settled. */
const QUIET_MS = 500;

/**
 * What the page's loading has reached: the document's readiness and load
 * events as they arrive, the requests still loading and when the network
 * last moved. One watch serves every load of the drive's page.
 */
class LoadWatch {
  ready = false;
  loaded = false;
  last = Date.now();
  readonly loading = new Map<string, string>();

  /** @param session the page's session, its Page and Network domains enabled */
  constructor(session: DevtoolsSession) {
    session.on((method, params) => {
      if (method === "Page.domContentEventFired") this.ready = true;
      else if (method === "Page.loadEventFired") this.loaded = true;
      else if (method.startsWith("Network.")) {
        const read = requestSchema.safeParse(params);
        if (!read.success) return;
        this.last = Date.now();
        if (method === "Network.requestWillBeSent")
          this.loading.set(read.data.requestId, read.data.request?.url ?? "");
        else if (method === "Network.loadingFinished" || method === "Network.loadingFailed")
          this.loading.delete(read.data.requestId);
      }
    });
  }

  /** Start a fresh load: nothing has arrived yet. */
  reset(): void {
    this.ready = false;
    this.loaded = false;
    this.last = Date.now();
    this.loading.clear();
  }

  /** Whether the page has settled: its load fired, or its document is ready and the network has been quiet a while. */
  settled(): boolean {
    return this.loaded || (this.ready && Date.now() - this.last >= QUIET_MS);
  }

  /** What did not arrive, as a timeout names it. */
  missing(): string {
    if (!this.ready) return "the document never became ready (no DOMContentLoaded)";
    const urls = [...this.loading.values()].filter((url) => url !== "").slice(0, 3);
    return `the document was ready, and the network never went quiet${urls.length === 0 ? "" : `, still loading ${urls.join(", ")}`}`;
  }
}

/** The promise, or a rejection naming what did not arrive once the time runs out. */
function within<T>(promise: Promise<T>, ms: number, why: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(why());
    }, ms);
  });
  // The race holds the promise's own rejection too, so one that comes after the time is never left unheard.
  return Promise.race([promise, late]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Load the page fresh and wait for it to settle (J-173 S1): the navigation
 * answered, then the load event, or the document ready with the network
 * quiet for half a second, since a page whose frame or long request never
 * ends never fires its load; past the time given, the error names the
 * address and what did not arrive.
 */
async function load(
  session: DevtoolsSession,
  watch: LoadWatch,
  url: string,
  scripts: boolean,
  timeoutMs: number,
): Promise<void> {
  const seconds = String(Math.round(timeoutMs / 1000));
  const deadline = Date.now() + timeoutMs;
  watch.reset();
  // The command's own wait runs past the load's, so the load's words, the address and what did not arrive, are the ones a timeout names (J-191 S1).
  const answered = within(
    session.send("Page.navigate", { url }, timeoutMs + NAVIGATE_SLACK_MS),
    timeoutMs,
    () =>
      new Error(
        `${url} did not load in ${seconds} s: the server sent no answer to the page's request`,
      ),
  );
  const navigated = navigatedSchema.safeParse(await answered);
  const failed = navigated.success ? navigated.data.errorText : undefined;
  if (failed !== undefined && failed !== "") throw new Error(`${url} did not load: ${failed}`);
  while (!watch.settled()) {
    if (Date.now() >= deadline)
      throw new Error(`${url} did not load in ${seconds} s: ${watch.missing()}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  // With scripts off the settle script cannot run; the settled state is the page's then.
  if (scripts)
    await within(
      session.evaluate(SETTLE_SOURCE),
      Math.max(deadline - Date.now(), 10_000),
      () => new Error(`${url} did not settle in ${seconds} s: its fonts and images never finished`),
    );
}

/** The full page's image height at a size: the page down to {@link FULL_PAGE_SCREENS} screens. */
function fullPageHeight(size: CaptureSize, height: number): number {
  return Math.min(height, size.height * FULL_PAGE_SCREENS);
}

/** A screenshot as a data URL. */
async function shoot(
  session: DevtoolsSession,
  size: CaptureSize,
  part: CapturedImage["part"],
  height: number,
): Promise<string> {
  const clip = {
    x: 0,
    y: 0,
    width: size.width,
    height: part === "first screen" ? size.height : fullPageHeight(size, height),
    scale: 1,
  };
  const shot = screenshotSchema.parse(
    await session.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: part === "first screen" ? 70 : 55,
      clip,
      captureBeyondViewport: part === "full page",
    }),
  );
  return `data:image/jpeg;base64,${shot.data}`;
}

/** Walk the focus with Tab from the top of the page. */
async function walkFocus(
  session: DevtoolsSession,
): Promise<{ readonly stops: readonly FocusStop[]; readonly count: number }> {
  const { count } = focusCountSchema.parse(await session.evaluate(FOCUS_PREPARE_SOURCE));
  const stops: FocusStop[] = [];
  for (let press = 0; press < Math.min(count + 3, 60); press += 1) {
    for (const type of ["keyDown", "keyUp"])
      await session.send("Input.dispatchKeyEvent", {
        type,
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
      });
    const step = focusStepSchema.parse(await session.evaluate(FOCUS_STEP_SOURCE));
    stops.push({
      at: step.at,
      tag: step.tag ?? "",
      name: step.name ?? "",
      changed: step.changed ?? true,
      covered: step.covered ?? false,
    });
  }
  return { stops, count };
}

/** A console message's text. */
function consoleText(params: JsonValue): string | undefined {
  const exception = exceptionSchema.safeParse(params);
  if (exception.success)
    return `uncaught: ${exception.data.exceptionDetails.exception?.description ?? exception.data.exceptionDetails.text ?? "an exception"}`;
  const called = consoleSchema.safeParse(params);
  if (called.success && called.data.type === "error")
    return `console.error: ${called.data.args.map((arg) => arg.description ?? JSON.stringify(arg.value ?? null)).join(" ")}`;
  const logged = logSchema.safeParse(params);
  if (logged.success && logged.data.entry.level === "error")
    return `error: ${logged.data.entry.text}`;
  return undefined;
}

/** What a drive may be given beside its address: the time a load may take, and who hears of the browser it launches. */
export interface DriveOptions {
  /** How long each load may take; thirty seconds where none is given. */
  readonly loadTimeoutMs?: number;
  /** Told the launched browser's profile, which names its processes. */
  readonly onLaunch?: (profile: string) => void;
}

/**
 * Drive one address in a local browser. The browser is stopped on every
 * path, a load that times out and a thrown error included (J-173 S1).
 * @param url the page's whole address, its origin and its path
 * @param dark whether the home declares a dark scheme, so the dark reads run
 * @param environment the process environment, where the browser is looked for
 * @param options the load's time and the launch's listener
 * @returns what it read, or why no browser ran
 */
export async function driveRoute(
  url: string,
  dark: boolean,
  environment: NodeJS.ProcessEnv,
  options: DriveOptions = {},
): Promise<DriveResult> {
  const found = findBrowser(environment);
  if (found.kind === "missing") return { kind: "no-browser", stage: "find", reason: found.reason };
  const timeoutMs = options.loadTimeoutMs ?? LOAD_TIMEOUT_MS;
  let browser: Awaited<ReturnType<typeof launchBrowser>>;
  try {
    browser = await launchBrowser(found.path, environment);
  } catch (error) {
    return {
      kind: "no-browser",
      stage: "launch",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  options.onLaunch?.(browser.profile);
  try {
    const page = await openPage(browser.port);
    const sampler = await openPage(browser.port);
    try {
      const { session } = page;
      const watch = new LoadWatch(session);
      await session.send("Page.bringToFront");
      await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await session.send("Page.enable");
      await session.send("Network.enable");
      await session.send("Runtime.enable");
      await session.send("Log.enable");
      const messages: string[] = [];
      let listening = true;
      session.on((method, params) => {
        if (!listening) return;
        if (
          method === "Runtime.exceptionThrown" ||
          method === "Runtime.consoleAPICalled" ||
          method === "Log.entryAdded"
        ) {
          const text = consoleText(params);
          if (text !== undefined) messages.push(text);
        }
      });
      const variants: RenderVariant[] = [];
      const images: CapturedImage[] = [];
      const boxes: WidthBoxes[] = [];
      let focus: readonly FocusStop[] = [];
      let focusables = 0;
      let samples = new Map<string, number>();
      for (const [index, read] of readsOf(dark).entries()) {
        await emulate(session, read);
        await load(session, watch, url, read.kind !== "noscript", timeoutMs);
        // The console is read on the first load alone, so one error is never counted once per read.
        if (index === 0) listening = false;
        if (read.kind === "spacing") await session.evaluate(TEXT_SPACING_SOURCE);
        if (read.kind === "resize") await session.evaluate(TEXT_RESIZE_SOURCE);
        const snapshot: RenderSnapshot = renderSnapshotSchema.parse(
          await session.evaluate(SNAPSHOT_SOURCE),
        );
        variants.push({
          kind: read.kind,
          width: read.size.width,
          height: read.size.height,
          scheme: read.scheme,
          motion: read.motion,
          snapshot,
        });
        if (read.kind !== "base") continue;
        const firstScreen = await shoot(session, read.size, "first screen", snapshot.scrollHeight);
        if (read.motion === "full" || read.size.width === CAPTURE_SIZES[0]?.width)
          images.push({
            width: read.size.width,
            scheme: read.scheme,
            motion: read.motion,
            part: "first screen",
            dataUrl: firstScreen,
          });
        if (read.scheme === "light" && read.motion === "full") {
          const boxed = pageBoxesSchema.parse(await session.evaluate(BOXES_SOURCE));
          boxes.push({
            width: read.size.width,
            height: read.size.height,
            page: boxed.page,
            image: { height: fullPageHeight(read.size, snapshot.scrollHeight) },
            elements: boxed.elements,
            truncated: boxed.truncated,
          });
          images.push({
            width: read.size.width,
            scheme: read.scheme,
            motion: read.motion,
            part: "full page",
            dataUrl: await shoot(session, read.size, "full page", snapshot.scrollHeight),
          });
        }
        if (index === 0) {
          const walked = await walkFocus(session);
          focus = walked.stops;
          focusables = walked.count;
          samples = new Map(
            Object.entries(
              countsSchema.parse(await sampler.session.evaluate(samplePixelsSource(firstScreen))),
            ),
          );
        }
      }
      return {
        kind: "read",
        drive: { variants, focus, focusables, console: messages, images, boxes, samples },
      };
    } finally {
      await sampler.close();
      await page.close();
    }
  } finally {
    await stopBrowser(browser);
  }
}

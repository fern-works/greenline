import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { BROKEN, CAREFUL, changesWorkspace, MISFIT, QUICK, REGULAR, TICKET } from "./fixture.ts";

/**
 * The changes view through its real seam: the inspector's server over a
 * workspace holding a quick, a regular and a careful record, each with all
 * seven step sections, a stopped change, a change with reports, a brief
 * and check facts against its commits, and a record that does not parse.
 */

const STEPS = ["frame", "plan", "anticipate", "build", "review", "verify", "close"];
let root = "";
let url = "";
let handle: InspectorHandle | undefined;
let finalCommit = "";

beforeAll(async () => {
  const workspace = changesWorkspace();
  root = workspace.root;
  finalCommit = workspace.finalCommit;
  handle = await startInspector(root, workspace.env, 0);
  url = handle.url;
});

afterAll(async () => {
  await handle?.close();
  rmSync(root, { recursive: true, force: true });
});

/** A route's status and its JSON, read as the page reads it. */
async function json(path: string) {
  const response = await fetch(url + path);
  return { status: response.status, body: await response.json() };
}

/** The values of one attribute, in document order, on the elements of a class. */
function attributes(html: string, className: string, attribute: string): readonly string[] {
  const found: string[] = [];
  const pattern = new RegExp(`<[a-z]+ [^>]*class="${className}"[^>]*>`, "g");
  for (const tag of html.match(pattern) ?? []) {
    const value = new RegExp(`${attribute}="([^"]*)"`).exec(tag)?.[1];
    if (value !== undefined) found.push(value);
  }
  return found;
}

describe("the changes view, served", () => {
  it("lists the changes in progress first, then the finished, with mode, state, next line and age", async () => {
    const { status, body } = await json("api/changes");
    expect(status).toBe(200);
    expect(body.unavailable).toBeNull();
    expect(body.changes.map((change: { id: string }) => change.id)).toEqual([
      BROKEN,
      CAREFUL,
      MISFIT,
      TICKET,
      REGULAR,
      QUICK,
    ]);
    const [broken, careful, misfit, ticket, regular, quick] = body.changes;
    expect(broken).toMatchObject({ state: null, mode: null });
    expect(broken.problem).toEqual(expect.any(String));
    expect(careful).toMatchObject({
      state: "open",
      mode: "careful",
      next: "verify: start the verifier on the final commit",
      opened: "2026-10-08",
      problem: null,
    });
    // Its form parses, so it keeps its state; the modes refuse its floor, and the list says so.
    expect(misfit).toMatchObject({ state: "open", mode: "quick" });
    expect(misfit.problem).toContain("weather");
    expect(ticket).toMatchObject({ plan: "003-uploads", ticket: "T2" });
    expect(regular).toMatchObject({
      state: "stopped",
      mode: "regular",
      next: "review: rerun the reviewer on the fixed commits",
      plan: "003-uploads",
      ticket: null,
    });
    expect(quick).toMatchObject({ state: "done", mode: "quick", next: null });
    expect(quick.ageDays).toBeGreaterThan(0);
    expect(attributes(body.html, "change-row", "data-state")).toEqual([
      "unreadable",
      "open",
      "open",
      "open",
      "stopped",
      "done",
    ]);
    expect(body.html).toContain('<span class="row-problem">Does not parse:');
    expect(body.html).toContain('href="#change/2026-10-05-retry"');
    expect(body.html).toContain("rerun the reviewer on the fixed commits");
  });

  it("renders the record card with every front-matter field, stated or not", async () => {
    const { body } = await json(`api/changes/${CAREFUL}`);
    expect(body.change.card).toMatchObject({
      mode: "careful",
      choice: "owner",
      proposed: "regular",
      why: "move the session store to the new schema",
      state: "open",
      next: "verify: start the verifier on the final commit",
      floors: ["data-migration"],
      raises: [{ from: "regular", reason: "the change migrates stored sessions" }],
      reviewed: "independent",
      plan: null,
      agents: null,
    });
    expect(attributes(body.html, "field", "data-field")).toEqual([
      "mode",
      "choice",
      "proposed",
      "why",
      "state",
      "next",
      "floors",
      "raises",
      "reviewed",
      "plan",
      "agents",
      "rounds",
      "starts",
      "landing",
      "rebase",
    ]);
    const quick = (await json(`api/changes/${QUICK}`)).body;
    expect(quick.change.card).toMatchObject({ agents: 1, rounds: 0, reviewed: "none" });
    // S2: the owner's words for a push, quoted; absent, the card says the hooks refuse the act.
    expect(quick.change.card).toMatchObject({ landing: "push it to main", rebase: null });
    expect(quick.html).toContain("<q>push it to main</q>");
    expect(quick.html).toContain("no rewrite: the hooks refuse one");
  });

  it("holds every step's section in the line's order, a skipped step as its one line", async () => {
    for (const [id, skipped] of [
      [QUICK, ["anticipate", "review"]],
      [REGULAR, ["anticipate"]],
      [CAREFUL, []],
    ] as const) {
      const { body } = await json(`api/changes/${id}`);
      const steps = body.change.sections.filter(
        (section: { kind: string }) => section.kind === "step",
      );
      expect(steps.map((section: { heading: string }) => section.heading)).toEqual(STEPS);
      expect(
        steps
          .filter((section: { state: string }) => section.state === "skipped")
          .map((section: { heading: string }) => section.heading),
      ).toEqual(skipped);
      expect(attributes(body.html, "section", "data-step")).toEqual(STEPS);
    }
    const quick = (await json(`api/changes/${QUICK}`)).body;
    expect(quick.html).toContain('<span class="none-line">none at quick</span>');
    const careful = (await json(`api/changes/${CAREFUL}`)).body;
    expect(
      careful.change.sections.find((s: { heading: string }) => s.heading === "review"),
    ).toMatchObject({ state: "written", depth: "independent, 2 fresh agents" });
    expect(
      careful.change.sections.find((s: { heading: string }) => s.heading === "verify"),
    ).toMatchObject({ state: "empty", current: true });
    expect(careful.html).toContain("<th>Step</th>");
  });

  it("names the planning record as the holder of a ticket's plan steps, never a missing section", async () => {
    const { body } = await json(`api/changes/${TICKET}`);
    const steps = body.change.sections.filter(
      (section: { kind: string }) => section.kind === "step",
    );
    expect(
      steps.map((section: { heading: string; state: string; heldBy: string | null }) => [
        section.heading,
        section.state,
        section.heldBy,
      ]),
    ).toEqual([
      ["frame", "elsewhere", "plan"],
      ["plan", "elsewhere", "plan"],
      ["anticipate", "elsewhere", "plan"],
      ["build", "empty", null],
      ["review", "skipped", null],
      ["verify", "empty", null],
      ["close", "empty", null],
    ]);
    expect(body.html).toContain("held by the planning record");
    expect(body.html).not.toContain("The record has no section for this step yet.");
  });

  it("says why a record whose form parses fails against the modes, and keeps its sections", async () => {
    const { body } = await json(`api/changes/${MISFIT}`);
    expect(body.change.reading).toBe("unparsed");
    expect(body.change.problem).toContain("weather");
    expect(body.change.sections.length).toBeGreaterThan(0);
    expect(body.html).toContain("The record does not parse against the modes:");
    expect(body.html).not.toContain("The record as written");
  });

  it("follows a document's link only into the page or to a web address", async () => {
    const { body } = await json(`api/changes/${CAREFUL}`);
    expect(body.html).not.toMatch(/href="(javascript|data):/);
    expect(body.html).not.toContain('href="//');
    expect(body.html).toContain(
      '<a href="https://example.com/doc" target="_blank" rel="noreferrer noopener">d</a>',
    );
    // A file outside the change's folder is named, never served.
    expect(body.html).toContain('<span class="link-text" title="../../src/sessions.ts">e</span>');
  });

  it("puts a stopped change's next line first, before the record", async () => {
    const { body } = await json(`api/changes/${REGULAR}`);
    const callout = body.html.indexOf('class="next-callout" data-state="stopped"');
    expect(callout).toBeGreaterThan(-1);
    expect(callout).toBeLessThan(body.html.indexOf('class="the-line"'));
    expect(body.html).toContain('<span class="next-label">Stopped at review. Next:</span>');
    expect(body.html).toContain(
      '<p class="next-action">rerun the reviewer on the fixed commits</p>',
    );
  });

  it("shows the folder's reports and briefs, a cited report linked into the page and raw HTML as text", async () => {
    const { body } = await json(`api/changes/${CAREFUL}`);
    expect(body.change.reports.map((report: { file: string }) => report.file)).toEqual([
      "anticipate-1.md",
      "review-1.md",
      "review-2.md",
    ]);
    expect(body.change.briefs).toEqual([
      expect.objectContaining({ file: "brief-review-1.md", written: false }),
    ]);
    expect(body.html).toContain(`<a href="#change/${CAREFUL}/review-2.md">review 2</a>`);
    expect(body.html).toContain(`<a href="#change/${CAREFUL}/review-2.md">the other</a>`);
    expect(body.html).toContain("not written by greenline brief");
    expect(body.html).not.toContain("<script>alert");
  });

  it("holds each recorded check against the commit whose code it ran on", async () => {
    const { body } = await json(`api/changes/${CAREFUL}`);
    const checks = body.change.checks;
    expect(checks.runs).toBe(2);
    expect(checks.problems).toEqual([
      expect.objectContaining({ file: "checks/20261008T120000000Z-c3.json" }),
    ]);
    // The working tree holds the final commit's code, so it is not listed apart and no run shows twice.
    expect(checks.targets.map((target: { kind: string }) => target.kind)).toEqual(["commit"]);
    const commit = checks.targets.find((target: { kind: string }) => target.kind === "commit");
    expect(commit).toMatchObject({ hash: finalCommit, subject: "the migration" });
    expect(commit.runs).toEqual([
      expect.objectContaining({
        command: ["pnpm", "test"],
        outcome: "passed",
        ended: "exit 0",
        latest: true,
        verdict: "ran on the final code",
      }),
    ]);
    expect(checks.elsewhere).toEqual([
      expect.objectContaining({ outcome: "failed", ended: "exit 1", latest: false }),
    ]);
    // The passed run sits inside its commit's entry of the timeline, the failed one under other code.
    const entry = body.html.slice(body.html.indexOf(`data-hash="${finalCommit}"`));
    expect(entry.slice(0, entry.indexOf("</li></ul></li>"))).toContain('data-outcome="passed"');
    expect(body.html.indexOf('data-outcome="failed"')).toBeGreaterThan(
      body.html.indexOf("On other code"),
    );
  });

  it("shows a record that does not parse as written, with why", async () => {
    const { body } = await json(`api/changes/${BROKEN}`);
    expect(body.change.reading).toBe("unparsed");
    expect(body.change.sections).toEqual([]);
    expect(body.html).toContain("no front matter here");
  });

  it("answers a change it does not hold, and a name that is not a change's, with 404", async () => {
    expect((await json("api/changes/2026-01-01-absent")).status).toBe(404);
    expect((await json("api/changes/..%2F..%2Fetc")).status).toBe(404);
    expect((await json("api/changes/%E0")).status).toBe(404);
  });

  it("opens on the changes view, first in the page's navigation", async () => {
    const page = await (await fetch(url)).text();
    expect(page).toContain(
      '<ul><li><a href="#changes">Changes</a></li><li><a href="#plans">Plans</a></li>',
    );
    expect(page).toContain('<section data-view="changes">');
    expect(page).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)[a-z]/);
  });
});

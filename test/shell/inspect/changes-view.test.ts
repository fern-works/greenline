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

const STEPS = ["frame", "design", "plan", "anticipate", "build", "review", "verify", "close"];
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

/**
 * Every text of a change the server rendered: each written section's, read
 * from its step document, and each report's and brief's, read from its file
 * document (J-155 S2).
 */
async function renderedOf(change: {
  id: string;
  sections: readonly { heading: string; written: boolean }[];
  reports: readonly { file: string }[];
  briefs: readonly { file: string }[];
}): Promise<string> {
  const steps = await Promise.all(
    change.sections
      .filter((section) => section.written)
      .map(async (section) => {
        const step = await json(`api/changes/${change.id}/steps/${section.heading}`);
        return String(step.body.section.html);
      }),
  );
  const files = await Promise.all(
    [...change.reports, ...change.briefs].map(async (entry) => {
      const file = await json(`api/changes/${change.id}/files/${entry.file}`);
      return String(file.body.file.html ?? "");
    }),
  );
  return [...steps, ...files].join("\n");
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
      state: "in-progress",
      waitingOn: null,
      mode: "careful",
      next: "verify: start the verifier on the final commit",
      opened: "2026-10-08",
      problem: null,
    });
    // Its form parses, so it keeps its state; the modes refuse its floor, and the list says so.
    expect(misfit).toMatchObject({ state: "in-progress", mode: "quick" });
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
    expect(
      body.changes.map((change: { state: string | null }) => change.state ?? "unreadable"),
    ).toEqual(["unreadable", "in-progress", "in-progress", "in-progress", "stopped", "done"]);
    // Each change carries the step reached and its strip, the line's seven steps in the same words.
    expect(regular.step).toBe("review");
    expect(regular.strip.map((station: { step: string }) => station.step)).toEqual(STEPS);
    expect(broken.strip).toEqual([]);
  });

  it("renders the record card with every front-matter field, stated or not", async () => {
    const { body } = await json(`api/changes/${CAREFUL}`);
    expect(body.change.card).toMatchObject({
      mode: "careful",
      choice: "owner",
      proposed: "regular",
      why: "move the session store to the new schema",
      state: "in-progress",
      next: "verify: start the verifier on the final commit",
      floors: ["data-migration"],
      raises: [{ from: "regular", reason: "the change migrates stored sessions" }],
      reviewed: "independent",
      plan: null,
      agents: null,
    });
    expect(Object.keys(body.change.card)).toEqual([
      "mode",
      "choice",
      "proposed",
      "why",
      "state",
      "next",
      "step",
      "floors",
      "raises",
      "reviewed",
      "plan",
      "ticket",
      "agents",
      "rounds",
      "starts",
      "lines",
      "landing",
      "rebase",
      "discard",
      "stopped",
      "ground",
      "agent",
      "from",
      "refreshes",
    ]);
    // J-114 S5: the ground and the agent as the record states them, null where it states none.
    expect(body.change.card).toMatchObject({
      ground: { kind: "worktree", path: ".worktrees/2026-10-08-sessions" },
      agent: "claude-code/opus",
      discard: null,
    });
    const quick = (await json(`api/changes/${QUICK}`)).body;
    expect(quick.change.card).toMatchObject({ agents: 1, rounds: 0, reviewed: "none" });
    // S2: the owner's words for a push, quoted; absent, the card says the hooks refuse the act.
    expect(quick.change.card).toMatchObject({ landing: "push it to main", rebase: null });
    expect(quick.change.card).toMatchObject({ ground: null, agent: null });
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
    }
    const quick = (await json(`api/changes/${QUICK}`)).body;
    expect(
      quick.change.sections.find((s: { heading: string }) => s.heading === "anticipate"),
    ).toMatchObject({ state: "skipped", line: "none at quick", written: true });
    const careful = (await json(`api/changes/${CAREFUL}`)).body;
    expect(
      careful.change.sections.find((s: { heading: string }) => s.heading === "review"),
    ).toMatchObject({ state: "written", depth: "independent, 2 fresh agents" });
    expect(
      careful.change.sections.find((s: { heading: string }) => s.heading === "verify"),
    ).toMatchObject({ state: "now", current: true });
    // A written section's step document carries its text rendered by the house renderer (J-155 S2).
    const review = (await json(`api/changes/${CAREFUL}/steps/review`)).body;
    expect(review.kind).toBe("step");
    expect(review.section.html).toBe(
      `<p><a href="/changes/${CAREFUL}/files/review-1.md">review 1</a> and <a href="/changes/${CAREFUL}/files/review-2.md">review 2</a>.</p>`,
    );
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
      ["frame", "in-plan", "plan"],
      ["design", "in-plan", "plan"],
      ["plan", "in-plan", "plan"],
      ["anticipate", "in-plan", "plan"],
      ["build", "now", null],
      ["review", "skipped", null],
      ["verify", "not-yet", null],
      ["close", "not-yet", null],
    ]);
  });

  it("says why a record whose form parses fails against the modes, and keeps its sections", async () => {
    const { body } = await json(`api/changes/${MISFIT}`);
    expect(body.change.reading).toBe("unparsed");
    expect(body.change.problem).toContain("weather");
    expect(body.change.sections.length).toBeGreaterThan(0);
  });

  it("follows a document's link only into the page or to a web address", async () => {
    const { body } = await json(`api/changes/${CAREFUL}`);
    const html = await renderedOf(body.change);
    expect(html).not.toMatch(/href="(javascript|data):/);
    expect(html).not.toContain('href="//');
    expect(html).toContain(
      '<a href="https://example.com/doc" target="_blank" rel="noreferrer noopener">d</a>',
    );
    // A file outside the change's folder is named, never served.
    expect(html).toContain('<span class="link-text" title="../../src/sessions.ts">e</span>');
  });

  it("J-168 S1 opens a change on its outcome line, else on its why, never on the close's prose", async () => {
    const quick = (await json(`api/changes/${QUICK}`)).body;
    // The quick record's close says "Done." and states no outcome line: the page opens on the why.
    expect(quick.change.summary).toMatchObject({ text: quick.change.card.why, from: "why" });
    expect(quick.change.summary.html).toMatch(/^<p>/);
    const regular = (await json(`api/changes/${REGULAR}`)).body;
    expect(regular.change.summary).toMatchObject({ text: regular.change.card.why, from: "why" });
    expect(regular.change.summary.html).toMatch(/^<p>/);
  });

  it("carries a stopped change's next line and the step it stopped at", async () => {
    const { body } = await json(`api/changes/${REGULAR}`);
    expect(body.change.card).toMatchObject({
      state: "stopped",
      next: "review: rerun the reviewer on the fixed commits",
      step: "review",
    });
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
    const html = await renderedOf(body.change);
    expect(html).toContain(`<a href="/changes/${CAREFUL}/files/review-2.md">the other</a>`);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("holds each recorded check against the commit whose code it ran on", async () => {
    // The checks are a part of the page at their own address (J-165 S1).
    const { body } = await json(`api/changes/${CAREFUL}/checks`);
    const checks = body.checks;
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
    // The commit carries its message's trailers.
    expect(commit.trailers).toEqual([{ key: "Greenline-Change", value: CAREFUL }]);
  });

  it("shows a record that does not parse as written, with why", async () => {
    const { body } = await json(`api/changes/${BROKEN}`);
    expect(body.change.reading).toBe("unparsed");
    expect(body.change.sections).toEqual([]);
    expect(body.change.text).toContain("no front matter here");
  });

  it("answers a change it does not hold, and a name that is not a change's, with 404", async () => {
    expect((await json("api/changes/2026-01-01-absent")).status).toBe(404);
    expect((await json("api/changes/..%2F..%2Fetc")).status).toBe(404);
    expect((await json("api/changes/%E0")).status).toBe(404);
  });

  it("answers the shell for every path the app shows, and 404 for any other", async () => {
    for (const path of [
      "",
      "changes",
      `changes/${CAREFUL}`,
      `changes/${CAREFUL}/review-1.md`,
      "plans",
      "catalogue",
    ]) {
      const page = await fetch(url + path);
      expect(page.status, path).toBe(200);
      const text = await page.text();
      expect(text).toContain('<script type="module" src="/inspector.mjs">');
      expect(text).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)[a-z]/);
    }
    for (const path of ["nowhere", "changes/a/b/c", "atlas/elsewhere"])
      expect((await fetch(url + path)).status, path).toBe(404);
  });
});

import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import {
  BROKEN_PLAN,
  DONE_TICKET,
  DRAFT_PLAN,
  homesWorkspace,
  OVERRIDDEN_TICKET,
  PLAN,
  PLANNING,
} from "./homes-fixture.ts";

/**
 * The plans view through its real seam: the inspector's server over a
 * workspace holding a plan split into tickets, a plan whose list waits for
 * the owner, and a plan whose tickets file does not parse.
 */

let root = "";
let url = "";
let handle: InspectorHandle | undefined;

beforeAll(async () => {
  const workspace = homesWorkspace();
  root = workspace.root;
  handle = await startInspector(root, workspace.env, 0);
  url = handle.url;
});

afterAll(async () => {
  await handle?.close();
  rmSync(root, { recursive: true, force: true });
});

async function json(path: string) {
  const response = await fetch(url + path);
  return { status: response.status, body: await response.json() };
}

describe("the plans view, served", () => {
  it("S2 lists each plan directory with its tickets' progress, its ready tickets and its planning change", async () => {
    const { status, body } = await json("api/plans");
    expect(status).toBe(200);
    expect(body.unavailable).toBeNull();
    expect(body.plans.map((plan: { name: string }) => plan.name)).toEqual([
      PLAN,
      DRAFT_PLAN,
      BROKEN_PLAN,
    ]);
    const [search, later, broken] = body.plans;
    expect(search).toMatchObject({
      tickets: "complete",
      counts: { total: 4, done: 1, inProgress: 1, notStarted: 2 },
      ready: ["T2"],
      documents: [
        { file: "spec.md", status: "complete" },
        { file: "decisions.md", status: "draft" },
      ],
      planning: [expect.objectContaining({ id: PLANNING, state: "open", mode: "careful" })],
      problem: null,
    });
    expect(later).toMatchObject({ tickets: "draft", ready: [] });
    expect(broken.tickets).toBeNull();
    expect(broken.problem).toContain("T1.scope");
    expect(body.html).toContain(`href="#plan/${PLAN}"`);
    expect(body.html).toContain('data-ready="T2"');
  });

  it("S2 renders each ticket with its fields, its derived progress and the change records that name it", async () => {
    const { status, body } = await json(`api/plans/${PLAN}`);
    expect(status).toBe(200);
    expect(
      body.plan.tickets.map((ticket: { id: string; progress: string; ready: boolean }) => [
        ticket.id,
        ticket.progress,
        ticket.ready,
      ]),
    ).toEqual([
      ["T1", "done", false],
      ["T2", "not started", true],
      ["T3", "not started", false],
      ["T4", "in progress", false],
    ]);
    const second = body.plan.tickets[1];
    expect(second).toMatchObject({
      intent: "Query the index from the catalogue page.",
      scope: ["src/catalogue/page.ts"],
      acceptance: ["A query returns the matching titles.", "An empty query returns nothing."],
      after: ["T1"],
      mode: "quick",
      records: [],
    });
    expect(body.plan.tickets[3].records).toEqual([
      expect.objectContaining({ id: OVERRIDDEN_TICKET, state: "stopped", mode: "quick" }),
    ]);
    // A ticket links to its change's page; the owner's override shows beside the entry's mode.
    expect(body.html).toContain(`href="#change/${DONE_TICKET}"`);
    expect(body.html).toContain(`href="#change/${OVERRIDDEN_TICKET}"`);
    expect(body.html).toContain("opened under quick, the owner's choice; the entry gives regular");
    expect(body.html).toContain(`href="#change/${PLANNING}"`);
  });

  it("S2 shows the ready tickets first, in the order the tickets file gives", async () => {
    const { body } = await json(`api/plans/${PLAN}`);
    expect(body.plan.frontier).toEqual(["T2"]);
    const ready = body.html.indexOf('class="frontier"');
    expect(ready).toBeGreaterThan(-1);
    expect(ready).toBeLessThan(body.html.indexOf('class="tickets"'));
    expect(body.html.match(/data-ticket="T\d"/g)).toEqual([
      'data-ticket="T1"',
      'data-ticket="T2"',
      'data-ticket="T3"',
      'data-ticket="T4"',
    ]);
  });

  it("S2 renders the plan documents with their mark, and follows their links into the page", async () => {
    const { body } = await json(`api/plans/${PLAN}`);
    expect(
      body.plan.documents.map((document: { file: string; status: string; title: string }) => [
        document.file,
        document.status,
        document.title,
      ]),
    ).toEqual([
      ["spec.md", "complete", "Search"],
      ["decisions.md", "draft", "Decisions"],
    ]);
    expect(body.html).toContain(`<a href="#change/${DONE_TICKET}">its ticket&#39;s record</a>`);
    expect(body.html).toContain(`<a href="#plan/${PLAN}">the tickets</a>`);
    // The front matter is the mark, shown once, never as a rule and a paragraph.
    expect(body.html).not.toContain("status: complete");
  });

  it("S2 says a draft list waits for the owner, and names why a tickets file does not parse", async () => {
    const draft = (await json(`api/plans/${DRAFT_PLAN}`)).body;
    expect(draft.plan.frontier).toEqual([]);
    expect(draft.html).toContain("waits for the owner's approval");
    const broken = (await json(`api/plans/${BROKEN_PLAN}`)).body;
    expect(broken.plan.ticketsProblem).toContain("T1.scope");
    expect(broken.html).toContain("does not parse");
  });

  it("S2 links a ticket's change page to its plan", async () => {
    const { body } = await json(`api/changes/${OVERRIDDEN_TICKET}`);
    expect(body.html).toContain(`<a href="#plan/${PLAN}">${PLAN}</a>`);
  });

  it("S2 answers a plan it does not hold, and a name that is not a plan's, with 404", async () => {
    expect((await json("api/plans/007-absent")).status).toBe(404);
    expect((await json("api/plans/..%2F..%2Fetc")).status).toBe(404);
    expect((await json("api/plans/%E0")).status).toBe(404);
  });

  it("S2 reads a raised ticket's opening mode as status does, and keeps a sibling plan's findings off the page", async () => {
    const raised = `.greenline/ledger/2026-10-13-highlight.md`;
    const sibling = `.greenline/plans/${PLAN}-v2`;
    try {
      writeFileSync(
        join(root, raised),
        [
          "---",
          "mode: regular",
          "choice: accepted",
          'why: "highlight the matched words"',
          "state: open",
          'next: "build: mark each word"',
          `plan: ${PLAN}`,
          "ticket: T3",
          "raises:",
          '  - { from: quick, reason: "the marking touches the shared renderer" }',
          "---",
          "",
          "## build",
          "",
          "## review",
          "",
          "## verify",
          "",
          "## close",
          "",
        ].join("\n"),
      );
      mkdirSync(join(root, sibling));
      writeFileSync(
        join(root, sibling, "tickets.md"),
        "---\nstatus: complete\n---\n\n## T1\n\nmode: quick\n",
      );
      const { body } = await json(`api/plans/${PLAN}`);
      const third = body.plan.tickets.find((ticket: { id: string }) => ticket.id === "T3");
      expect(third.records).toEqual([
        expect.objectContaining({ id: "2026-10-13-highlight", mode: "regular", opened: "quick" }),
      ]);
      const card = body.html.slice(body.html.indexOf('data-ticket="T3"'));
      expect(card.slice(0, card.indexOf("</li></ul></li>"))).not.toContain("the entry gives");
      expect(card.slice(0, card.indexOf("</li></ul></li>"))).toContain("raised to regular");
      expect(JSON.stringify(body.plan.notes)).not.toContain(`${PLAN}-v2`);
    } finally {
      rmSync(join(root, raised), { force: true });
      rmSync(join(root, sibling), { recursive: true, force: true });
    }
  });

  it("S2 refuses a plan directory or a plan document that resolves outside the repository, without its content", async () => {
    const outside = mkdtempSync(join(tmpdir(), "greenline-plans-outside-"));
    try {
      mkdirSync(join(outside, "plan"));
      writeFileSync(
        join(outside, "plan", "tickets.md"),
        '---\nstatus: complete\n---\n\n## T1\n\nintent: "Private plan witness."\nscope:\n  - a.ts\nacceptance:\n  - "x"\nmode: quick\n',
      );
      writeFileSync(
        join(outside, "notes.md"),
        "---\nstatus: draft\n---\n\nPrivate note witness.\n",
      );
      symlinkSync(join(outside, "plan"), join(root, ".greenline/plans/008-elsewhere"));
      symlinkSync(join(outside, "notes.md"), join(root, `.greenline/plans/${PLAN}/notes.md`));
      const list = await json("api/plans");
      const elsewhere = await json("api/plans/008-elsewhere");
      const plan = await json(`api/plans/${PLAN}`);
      for (const read of [list, elsewhere, plan]) {
        expect(JSON.stringify(read.body)).not.toContain("Private plan witness.");
        expect(JSON.stringify(read.body)).not.toContain("Private note witness.");
      }
      // A linked plan directory or document is no entry of the plans folder: never listed, never read.
      expect(elsewhere.status).toBe(404);
      expect(list.body.plans.map((entry: { name: string }) => entry.name)).not.toContain(
        "008-elsewhere",
      );
      expect(
        plan.body.plan.documents.map((document: { file: string }) => document.file),
      ).not.toContain("notes.md");
    } finally {
      rmSync(join(root, ".greenline/plans/008-elsewhere"), { force: true });
      rmSync(join(root, `.greenline/plans/${PLAN}/notes.md`), { force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("S2 refuses a plans folder that resolves outside the repository, without its content", async () => {
    const workspace = homesWorkspace(false);
    const outside = mkdtempSync(join(tmpdir(), "greenline-plans-folder-outside-"));
    let linked: InspectorHandle | undefined;
    try {
      renameSync(join(workspace.root, ".greenline/plans"), join(outside, "plans"));
      writeFileSync(
        join(outside, "plans", PLAN, "spec.md"),
        "---\nstatus: complete\n---\n\nPrivate spec witness.\n",
      );
      symlinkSync(join(outside, "plans"), join(workspace.root, ".greenline/plans"));
      linked = await startInspector(workspace.root, workspace.env, 0);
      const list = await (await fetch(`${linked.url}api/plans`)).json();
      const plan = await fetch(`${linked.url}api/plans/${PLAN}`);
      expect(list.unavailable).toContain("outside the repository");
      expect(list.plans).toEqual([]);
      expect(plan.status).toBe(404);
      expect(JSON.stringify(list)).not.toContain("Private spec witness.");
      expect(await plan.text()).not.toContain("Private spec witness.");
    } finally {
      await linked?.close();
      rmSync(workspace.root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

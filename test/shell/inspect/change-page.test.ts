import { describe, expect, it } from "vitest";
import { h, isValidElement, type ComponentChildren, type FunctionComponent } from "preact";
import { placeOf } from "../../../src/shell/inspect/app/addresses.ts";
import {
  ChangedTree,
  ChangeFirstDraw,
  ChangeHead,
  ChangePage,
  CloseParagraphs,
  DiffBody,
  diffSource,
  FileBody,
  StepBody,
  stepOfFile,
  tabOf,
  WhatYouDecided,
} from "../../../src/shell/inspect/app/change-page.ts";
import {
  commandRuns,
  commitGroups,
  RecordFacts,
  shortCommand,
} from "../../../src/shell/inspect/app/change.ts";
import {
  CHANGE_CHECKS,
  CHANGE_FILE,
  CHANGE_PAGE,
  CHANGE_STEPS,
  changeDocumentSpecimen,
  changePartsSpecimen,
  DIFF_COMMIT,
} from "../../../src/shell/inspect/app/fixtures.ts";
import { count, draw } from "./draw.ts";

/**
 * The change page (J-155 S2, cut by artefact by J-166 S1), drawn from the
 * catalogue's specimen without a browser. A short head names the change,
 * its facts as chips, its times and the one sentence it opens on, the
 * record's outcome where it holds one (J-168 S1), else the why asked; a
 * banner while something waits; an outcome card of four rows, each linking
 * its tab; and the tabs Overview, Steps, Code and Record, each its own
 * address.
 */

const PAGE = changeDocumentSpecimen();
const PARTS = changePartsSpecimen();
const ID = CHANGE_PAGE.id;
const CONFIRMED = "Yes, that is what I want.";

/**
 * The parts a page reads from their own addresses, in the order it names
 * them: each reader's part, the reader itself left undrawn, since it holds
 * the hook that reads; every other component drawn from its props.
 */
function partsRead(node: ComponentChildren): string[] {
  const read: string[] = [];
  const visit = (child: ComponentChildren): void => {
    if (Array.isArray(child)) {
      for (const each of child) visit(each);
      return;
    }
    if (!isValidElement(child)) return;
    const props: { readonly aspect?: string; readonly children?: ComponentChildren } = child.props;
    if (child.type instanceof Function) {
      if (child.type.name === "ChangePart") {
        read.push(props.aspect ?? "");
        return;
      }
      // A component that holds state gives what it paints first, as the drawing reads it (J-164 S1).
      if ("firstPaint" in child.type && child.type.firstPaint instanceof Function) {
        visit(child.type.firstPaint(child.props));
        return;
      }
      // SAFETY: every other component of the page is a function of its props alone.
      visit((child.type as FunctionComponent)(child.props));
      return;
    }
    visit(props.children);
  };
  visit(node);
  return read;
}

/** The page at an address, as the shell reads the address into its place. */
function pageAt(path: string, page = PAGE) {
  const place = placeOf(path);
  if (place?.page !== "change") throw new Error(`${path} is not a change's page`);
  return draw(
    h(ChangePage, {
      page,
      parts: PARTS,
      part: place.part,
      file: place.file ?? null,
      changed: place.changed ?? null,
    }),
  );
}

describe("J-155 S2, J-166 S1 the change page", () => {
  it("opens on a short head: the name, its facts as chips, its times, and the record's outcome labelled Landed", () => {
    const drawn = pageAt(`/changes/${ID}`);
    // J-168 S1: the outcome line the close wrote, never the close's prose.
    expect(drawn.text).toContain(
      "Landed Hashed assets now carry a year's cache header, and the others revalidate.",
    );
    const head = draw(h(ChangeHead, { page: PAGE, commits: PARTS.commits }));
    expect(head.text).toContain(PAGE.ref.name);
    expect(head.text).toContain("regular");
    expect(head.text).toMatch(/opened 2026-10-24 · last commit .+ · \d+ commits?/);
    // The name over the id, the lineage by names.
    expect(head.text).not.toContain(ID);
    expect(head.text).not.toContain("2026-10-21-offline-mode");
    // A record with no outcome opens on its why, labelled Asked.
    const asked = draw(
      h(ChangeHead, {
        page: {
          ...PAGE,
          change: {
            ...PAGE.change,
            summary: { text: "Make it fast.", html: "<p>Make it fast.</p>", from: "why" },
          },
        },
      }),
    );
    expect(asked.text).toContain("Asked Make it fast.");
  });

  it("draws its head at once from the names while the rest is read (J-155 S6)", () => {
    const known = {
      kind: "change" as const,
      id: ID,
      name: PAGE.ref.name,
      address: `/changes/${ID}`,
      where: "Changes",
      state: "waiting-review",
      at: "2026-10-24",
    };
    const first = draw(h(ChangeFirstDraw, { known }));
    expect(first.components).toContain("ChangeFirstDraw");
    expect(first.text).toContain(PAGE.ref.name);
    expect(first.text).toContain("waiting review");
    expect(first.text).toContain("opened 2026-10-24");
    expect(first.text).toContain("Reading its steps, its folder and its commits.");
    expect(first.text).not.toContain(ID);
    const bare = draw(h(ChangeFirstDraw, { known: null }));
    expect(bare.text).toContain("Reading this change's record, its folder and its commits.");
    expect(bare.text).not.toContain(PAGE.ref.name);
  });

  it("answers what changed, what was checked, what was decided and what was kept in an outcome card, each row linking its tab", () => {
    const drawn = pageAt(`/changes/${ID}`);
    expect(count(drawn, "OutcomeCard")).toBe(1);
    expect(drawn.text).toMatch(/Changed 6 files \+148 −57 in /);
    expect(drawn.text).toMatch(/Checked passed \d+ of \d+ commands? passed/);
    expect(drawn.text).toMatch(/Decided You answered \d+ of \d+ questions/);
    expect(drawn.text).toContain("Kept 1 review · 1 brief");
    for (const part of ["code", "checks", "decided", "steps"])
      expect(drawn.links).toContain(`/changes/${ID}/${part}`);
  });

  it("cuts its tabs by artefact, Overview, Steps, Code and Record, each its own address", () => {
    const drawn = pageAt(`/changes/${ID}`);
    expect(count(drawn, "ChangeTabs")).toBe(1);
    for (const part of ["steps", "code", "record"])
      expect(drawn.links).toContain(`/changes/${ID}/${part}`);
    expect(tabOf(null, null)).toBe("overview");
    expect(tabOf("waiting", null)).toBe("overview");
    expect(tabOf("why", null)).toBe("overview");
    expect(tabOf("frame-map", null)).toBe("steps");
    expect(tabOf("review", null)).toBe("steps");
    expect(tabOf("loads", null)).toBe("steps");
    expect(tabOf("commits", null)).toBe("code");
    expect(tabOf("checks", null)).toBe("code");
    expect(tabOf(null, "src/http/cache.ts")).toBe("code");
    expect(tabOf("source", null)).toBe("record");
    // The rail's stations open their steps.
    expect(drawn.links).toContain(`/changes/${ID}/frame`);
  });

  it("opens the Overview on what you decided, the owner's words quoted, the agent's own settlements folded", () => {
    const drawn = pageAt(`/changes/${ID}`);
    expect(count(drawn, "WhatYouDecided")).toBe(1);
    expect(count(drawn, "DecisionRow")).toBeGreaterThan(0);
    expect(drawn.text).toContain("The agent settled");
    expect(drawn.components).not.toContain("StepFold");
  });

  it("folds each step with its glyph, its state, its depth as a chip and its count, its evidence and loads inside", () => {
    const drawn = pageAt(`/changes/${ID}/steps`);
    expect(count(drawn, "StepFold")).toBe(CHANGE_PAGE.sections.length);
    expect(drawn.text).toMatch(/✓ frame written \d+ questions?, you answered \d+/);
    expect(drawn.text).toContain("– anticipate skipped none at regular");
    expect(drawn.text).toContain("▶ build now");
    expect(drawn.text).toContain("review not yet independent, 1 fresh agent not written yet");
    expect(drawn.text).not.toContain("Repeat visits re-download every asset");
    // The review's report and its brief open under the review's fold, never a list of their own.
    expect(stepOfFile("review-1.md")).toBe("review");
    expect(stepOfFile("brief-review-1.md")).toBe("review");
    expect(stepOfFile("verify/page/board-1440.png")).toBe("verify");
    expect(stepOfFile("interface/20261028T081427612Z-2ae441.json")).toBe("verify");
    const review = pageAt(`/changes/${ID}/review`);
    expect(count(review, "FolderFileView")).toBe(
      CHANGE_PAGE.reports.length + CHANGE_PAGE.briefs.length,
    );
  });

  it("draws a step's words, a file's text and a changed file's lines, the net change by default", () => {
    const [frame, , skipped] = CHANGE_STEPS;
    if (frame === undefined || skipped === undefined) throw new Error("no steps");
    expect(draw(h(StepBody, { section: frame })).text).toContain(
      "Repeat visits re-download every asset",
    );
    expect(draw(h(StepBody, { section: skipped })).text).toBe("none at regular");
    expect(draw(h(FileBody, { file: CHANGE_FILE })).text).toContain("Review 1");
    const diff = draw(
      h(DiffBody, { path: "src/http/cache.ts", commits: [DIFF_COMMIT], unknown: null }),
    );
    expect(diff.text).toContain("9f2c1e7 feat(http): set the cache header from the path's hash");
    // Each line with its numbers before and after, its sign in its tone.
    expect(diff.text).toContain(
      '13 + return hashed(path) ? "max-age=31536000, immutable" : "no-cache";',
    );
    expect(diff.text).toContain('13 − return "no-cache";');
    const net = draw(
      h(DiffBody, {
        path: "src/http/cache.ts",
        commits: [DIFF_COMMIT],
        net: { from: null, to: DIFF_COMMIT.hash, lines: DIFF_COMMIT.lines },
        unknown: null,
      }),
    );
    expect(net.text).toContain("Net By commit");
    expect(net.text).toContain("From before the change to 9f2c1e7, across 1 commit");
    const source = diffSource([DIFF_COMMIT]);
    expect(source.split("\n")[0]).toBe(
      "@@ 9f2c1e7 feat(http): set the cache header from the path's hash",
    );
    expect(source).toContain('\n-  return "no-cache";');
    expect(
      diffSource([DIFF_COMMIT], {
        from: null,
        to: DIFF_COMMIT.hash,
        lines: DIFF_COMMIT.lines,
      }).split("\n")[0],
    ).toBe("@@ the start to 9f2c1e7");
  });

  it("shows the code: the files by folder, each opening its lines under its row, then the checks by command and the commits", () => {
    const drawn = pageAt(`/changes/${ID}/code`);
    expect(count(drawn, "ChangedTree")).toBe(1);
    expect(count(drawn, "ChecksByCommand")).toBe(1);
    expect(count(drawn, "CommitList")).toBe(1);
    expect(count(drawn, "StepFold")).toBe(0);
    const files = PARTS.changed.changedFiles;
    const tree = draw(h(ChangedTree, { change: ID, files, open: null }));
    expect(tree.text).toMatch(/\d+ files? \+\d+ −\d+ in /);
    expect(count(tree, "ChangedFile")).toBe(
      files.groups.reduce((sum, group) => sum + group.files.length, 0),
    );
    for (const group of files.groups)
      for (const file of group.files)
        expect(tree.links).toContain(`/changes/${ID}/changed/${file.path}`);
    // One row per command, its latest run; the record-only commits fold into the commit whose code they share.
    const commands = commandRuns(CHANGE_CHECKS.checks);
    expect(new Set(commands.map((entry) => entry.command)).size).toBe(commands.length);
    expect(commitGroups(CHANGE_CHECKS.checks.targets).length).toBeLessThanOrEqual(
      CHANGE_CHECKS.checks.targets.length,
    );
    expect(shortCommand(["node", "--test", "/Volumes/2 Runners/x/src/web/logic.test.ts"])).toBe(
      "node logic.test.ts",
    );
  });

  it("folds the record-only commits under the commit of code they share", () => {
    const code = {
      kind: "commit" as const,
      hash: "a".repeat(40),
      subject: "feat: the code",
      date: "2026-10-24T10:00:00.000Z",
      trailers: [],
      shared: false,
      tree: "t1",
      runs: [],
    };
    const record = {
      ...code,
      hash: "b".repeat(40),
      subject: "docs(record): close",
      date: "2026-10-24T11:00:00.000Z",
    };
    const later = {
      ...code,
      hash: "c".repeat(40),
      subject: "feat: more",
      date: "2026-10-24T12:00:00.000Z",
      tree: "t2",
    };
    const groups = commitGroups([record, later, code]);
    expect(
      groups.map((group) => [group.code.subject, group.same.map((entry) => entry.subject)]),
    ).toEqual([
      ["feat: more", []],
      ["feat: the code", ["docs(record): close"]],
    ]);
  });

  it("shows the record: its properties, the close's paragraphs as rows and its source", () => {
    const drawn = pageAt(`/changes/${ID}/record`);
    expect(count(drawn, "RecordProperties")).toBe(1);
    expect(count(drawn, "RecordFacts")).toBe(1);
    expect(count(drawn, "RecordSource")).toBe(1);
    expect(count(drawn, "SourceView")).toBe(1);
    const close = draw(
      h(CloseParagraphs, {
        text: "Decisions. The header goes to hashed files only. The rest revalidate.\n\nTerms. None.",
      }),
    );
    expect(close.text).toContain("Decisions The header goes to hashed files only.");
    expect(close.text).toContain("Terms None.");
    const bare = draw(
      h(RecordFacts, {
        card: { ...CHANGE_PAGE.card, proposed: null, reviewed: null, landing: null, rebase: null },
      }),
    );
    expect(bare.text).not.toContain("not stated");
    expect(bare.text).not.toContain("Landing");
  });

  it("draws a banner only while something waits, its options as radio tiles with Copy my answer", () => {
    expect(count(pageAt(`/changes/${ID}`), "WaitingBanner")).toBe(0);
    const asked = pageAt(`/changes/${ID}/waiting`, {
      ...PAGE,
      waitingOn: {
        question: "the owner picks the cache lifetime for unhashed assets",
        next: "build: the owner picks the cache lifetime for unhashed assets",
        step: "build",
        askedAt: "2026-10-24T10:00:00.000Z",
        options: ["one hour", "one day"],
        source: { label: "the record's next line", address: `/changes/${ID}/waiting` },
      },
    });
    expect(count(asked, "WaitingBanner")).toBe(1);
    expect(count(asked, "ChoiceTiles")).toBe(1);
    expect(asked.text).toContain("The owner picks the cache lifetime for unhashed assets");
    expect(asked.text).toContain("1 one hour");
    expect(asked.text).toContain("Copy my answer");
    expect(asked.links).toContain(`/changes/${ID}/build`);
  });

  it("J-165 S1 reads each tab's parts from their own addresses when none is handed in", () => {
    const at = (part: string | null) =>
      partsRead(h(ChangePage, { page: PAGE, part, file: null, changed: null }));
    // The head draws at once; the outcome card reads its three parts; each tab reads what it shows.
    expect(at(null)).toEqual(["commits", "changed", "checks", "frame", "frame"]);
    expect(at("steps")).toEqual([
      "commits",
      "changed",
      "checks",
      "frame",
      "frame",
      "loads",
      "pictures",
    ]);
    expect(at("code")).toEqual(["commits", "changed", "checks", "frame", "changed", "checks"]);
    expect(at("record")).toEqual(["commits", "changed", "checks", "frame", "checks", "source"]);
  });

  it("reads each tab's address and a changed file's address back to the page", () => {
    expect(placeOf(`/changes/${ID}/changed/src/http/cache.ts`)).toEqual({
      page: "change",
      id: ID,
      part: "changed",
      changed: "src/http/cache.ts",
    });
    expect(placeOf(`/changes/${ID}/code`)).toEqual({ page: "change", id: ID, part: "code" });
    expect(placeOf(`/changes/${ID}/record`)).toEqual({ page: "change", id: ID, part: "record" });
  });
});

describe("J-223 S1 the Overview shows the owner's confirming words under the frame's restatement", () => {
  const frameDocument = (confirmed: string | null) => ({
    ...PARTS.frame,
    restatementHtml: "<p>Repeat visits re-download every asset.</p>",
    confirmed,
  });

  it("quotes the confirmed line after the restatement, and draws nothing of it where the record holds none", () => {
    const drawn = draw(h(WhatYouDecided, { change: ID, document: frameDocument(CONFIRMED) }));
    expect(drawn.text).toContain("Repeat visits re-download every asset.");
    expect(drawn.text).toContain(`You confirmed it: “${CONFIRMED}”`);
    expect(drawn.text.indexOf("You confirmed it")).toBeGreaterThan(
      drawn.text.indexOf("Repeat visits re-download every asset."),
    );
    expect(
      draw(h(WhatYouDecided, { change: ID, document: frameDocument(null) })).text,
    ).not.toContain("You confirmed it");
  });
});

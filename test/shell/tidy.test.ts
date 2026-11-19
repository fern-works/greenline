import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tidyDiscussionFolder, tidyWorkingFolders, type TidyReport } from "../../src/shell/tidy.ts";

/**
 * `greenline tidy` on a real disk (J-73 S4): it removes `.greenline/tmp/<id>/`
 * of a done or dropped change and nothing else, never a folder a ledger file
 * cites, never an open or stopped change's, never through a link out of
 * `tmp/`.
 */

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodAll(root);
    rmSync(root, { recursive: true, force: true });
  }
});

/** Make every directory under a test root writable again, so it can be removed. */
function chmodAll(root: string): void {
  try {
    chmodSync(join(root, ".greenline", "ledger", "2026-10-14-done"), 0o700);
  } catch {
    // Only the test that locked it needs this.
  }
}

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "tidy-"));
  roots.push(root);
  return root;
}

function write(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

function record(
  state: string,
  extra: readonly string[] = [],
  body: readonly string[] = [],
): string {
  return [
    "---",
    "mode: quick",
    "choice: accepted",
    'why: "w"',
    `state: ${state}`,
    ...extra,
    "---",
    "",
    ...body,
  ].join("\n");
}

const stopped = record("stopped", ['next: "build: carry on"']);

function tidy(root: string, change?: string): TidyReport {
  const report = tidyWorkingFolders(root, change);
  if (report._tag === "err") throw report.error;
  return report.value;
}

const kept = (report: TidyReport): readonly (readonly [string, string, boolean])[] =>
  report.kept.map((entry) => [entry.path, entry.reason.kind, entry.refused] as const);

describe("J-73 S4 greenline tidy removes a finished change's working files and nothing else", () => {
  it("J-73 S4 removes a done change's folder whole and reports it, leaving the record, its folder and tmp's own files", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record("done"),
      ".greenline/ledger/2026-10-14-done/review-1.md": "# Review\n",
      ".greenline/tmp/2026-10-14-done/brief-review-1.md": "brief\n",
      ".greenline/tmp/2026-10-14-done/rounds/relay-review-1.md": "relay\n",
      ".greenline/tmp/.gitignore": "*\n",
    });
    const report = tidy(root, "2026-10-14-done");
    expect(report.removed).toEqual([".greenline/tmp/2026-10-14-done"]);
    expect(report.kept).toEqual([]);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-done"))).toBe(false);
    expect(existsSync(join(root, ".greenline/tmp/.gitignore"))).toBe(true);
    expect(existsSync(join(root, ".greenline/ledger/2026-10-14-done.md"))).toBe(true);
    expect(existsSync(join(root, ".greenline/ledger/2026-10-14-done/review-1.md"))).toBe(true);
  });

  it("J-73 S4 a link inside the folder is removed as a link, and what it points to outside tmp stays", () => {
    const root = workspace();
    const outside = workspace();
    write(outside, { "keep/precious.txt": "precious\n", "single.txt": "single\n" });
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record("done"),
      ".greenline/tmp/2026-10-14-done/probe.txt": "probe\n",
    });
    symlinkSync(join(outside, "keep"), join(root, ".greenline/tmp/2026-10-14-done/to-dir"));
    symlinkSync(join(outside, "single.txt"), join(root, ".greenline/tmp/2026-10-14-done/to-file"));
    expect(tidy(root, "2026-10-14-done").removed).toEqual([".greenline/tmp/2026-10-14-done"]);
    expect(readFileSync(join(outside, "keep/precious.txt"), "utf8")).toBe("precious\n");
    expect(readFileSync(join(outside, "single.txt"), "utf8")).toBe("single\n");
  });

  it("J-73 S4 refuses a folder the record cites, and removes nothing", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record(
        "done",
        [],
        ["## build", "See [the probe](../tmp/2026-10-14-done/probe.txt)."],
      ),
      ".greenline/tmp/2026-10-14-done/probe.txt": "probe\n",
    });
    const report = tidy(root, "2026-10-14-done");
    expect(report.removed).toEqual([]);
    expect(kept(report)).toEqual([[".greenline/tmp/2026-10-14-done", "cited", true]]);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-done/probe.txt"))).toBe(true);
  });

  it("J-73 S4 refuses a folder a report in another change's folder cites", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record("done"),
      ".greenline/ledger/2026-10-14-plan.md": record("open", ["plan: 001-login"]),
      ".greenline/ledger/2026-10-14-plan/review-1.md":
        "[the relay](../../tmp/2026-10-14-done/relay-review-1.md)\n",
      ".greenline/tmp/2026-10-14-done/relay-review-1.md": "relay\n",
    });
    expect(kept(tidy(root, "2026-10-14-done"))).toEqual([
      [".greenline/tmp/2026-10-14-done", "cited", true],
    ]);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-done/relay-review-1.md"))).toBe(true);
  });

  it("J-73 S4 refuses an open change and a stopped change", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-14-open.md": record("open"),
      ".greenline/ledger/2026-10-14-stopped.md": stopped,
      ".greenline/tmp/2026-10-14-open/brief-review-1.md": "brief\n",
      ".greenline/tmp/2026-10-14-stopped/brief-review-1.md": "brief\n",
    });
    expect(kept(tidy(root, "2026-10-14-open"))).toEqual([
      [".greenline/tmp/2026-10-14-open", "unfinished", true],
    ]);
    expect(kept(tidy(root, "2026-10-14-stopped"))).toEqual([
      [".greenline/tmp/2026-10-14-stopped", "unfinished", true],
    ]);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-open/brief-review-1.md"))).toBe(true);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-stopped/brief-review-1.md"))).toBe(
      true,
    );
  });

  it("J-73 S4 refuses a folder with no record and one whose record does not parse", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-14-broken.md": "no front matter\n",
      ".greenline/tmp/2026-10-14-broken/x.md": "x\n",
      ".greenline/tmp/2026-10-14-unrecorded/reproducer.sh": "exit 1\n",
    });
    expect(kept(tidy(root, "2026-10-14-broken"))).toEqual([
      [".greenline/tmp/2026-10-14-broken", "unparsed", true],
    ]);
    expect(kept(tidy(root, "2026-10-14-unrecorded"))).toEqual([
      [".greenline/tmp/2026-10-14-unrecorded", "no-record", true],
    ]);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-broken/x.md"))).toBe(true);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-unrecorded/reproducer.sh"))).toBe(true);
  });

  it("J-73 S4 refuses a working folder that is a link out of tmp, and what it points to stays", () => {
    const root = workspace();
    const outside = workspace();
    write(outside, { "precious.txt": "precious\n" });
    write(root, { ".greenline/ledger/2026-10-14-done.md": record("done") });
    mkdirSync(join(root, ".greenline/tmp"), { recursive: true });
    symlinkSync(outside, join(root, ".greenline/tmp/2026-10-14-done"));
    expect(kept(tidy(root, "2026-10-14-done"))).toEqual([
      [".greenline/tmp/2026-10-14-done", "not-a-folder", true],
    ]);
    expect(kept(tidy(root))).toEqual([[".greenline/tmp/2026-10-14-done", "not-a-folder", true]]);
    expect(readFileSync(join(outside, "precious.txt"), "utf8")).toBe("precious\n");
  });

  it("J-73 S4 refuses everything when tmp itself, or .greenline, is a link out of the repository", () => {
    const root = workspace();
    const outside = workspace();
    write(outside, { "2026-10-14-done/precious.txt": "precious\n" });
    write(root, { ".greenline/ledger/2026-10-14-done.md": record("done") });
    symlinkSync(outside, join(root, ".greenline/tmp"));
    expect(kept(tidy(root, "2026-10-14-done"))).toEqual([[".greenline/tmp", "redirected", true]]);
    expect(kept(tidy(root))).toEqual([[".greenline/tmp", "redirected", true]]);
    expect(readFileSync(join(outside, "2026-10-14-done/precious.txt"), "utf8")).toBe("precious\n");

    const linked = workspace();
    const elsewhere = workspace();
    write(elsewhere, {
      "ledger/2026-10-14-done.md": record("done"),
      "tmp/2026-10-14-done/precious.txt": "precious\n",
    });
    symlinkSync(elsewhere, join(linked, ".greenline"));
    expect(kept(tidy(linked, "2026-10-14-done"))).toEqual([[".greenline", "redirected", true]]);
    expect(existsSync(join(elsewhere, "tmp/2026-10-14-done/precious.txt"))).toBe(true);
  });

  it("J-73 S4 refuses everything while a ledger file cannot be read, since a citation could hide there", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record("done"),
      ".greenline/ledger/2026-10-14-done/review-1.md": "# Review\n",
      ".greenline/tmp/2026-10-14-done/x.md": "x\n",
    });
    chmodSync(join(root, ".greenline/ledger/2026-10-14-done"), 0o000);
    expect(kept(tidy(root, "2026-10-14-done"))).toEqual([
      [".greenline/ledger", "unreadable", true],
    ]);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-done/x.md"))).toBe(true);
  });

  it("J-73 S4 a cited path that reaches the folder through a link in the ledger keeps it: a linked report folder, a linked report and a linked record", () => {
    const linkedFolder = workspace();
    write(linkedFolder, {
      ".greenline/ledger/2026-10-14-done.md": record(
        "done",
        [],
        ["[review](2026-10-14-done/review-1.md)"],
      ),
      ".greenline/tmp/2026-10-14-done/review-1.md": "# Review\n",
    });
    symlinkSync("../tmp/2026-10-14-done", join(linkedFolder, ".greenline/ledger/2026-10-14-done"));
    expect(kept(tidy(linkedFolder, "2026-10-14-done"))).toEqual([
      [".greenline/tmp/2026-10-14-done", "cited", true],
    ]);
    expect(existsSync(join(linkedFolder, ".greenline/tmp/2026-10-14-done/review-1.md"))).toBe(true);

    const linkedReport = workspace();
    write(linkedReport, {
      ".greenline/ledger/2026-10-14-done.md": record(
        "done",
        [],
        ["[review](2026-10-14-done/review-1.md)"],
      ),
      ".greenline/tmp/2026-10-14-done/review-1.md": "# Review\n",
    });
    mkdirSync(join(linkedReport, ".greenline/ledger/2026-10-14-done"));
    symlinkSync(
      "../../tmp/2026-10-14-done/review-1.md",
      join(linkedReport, ".greenline/ledger/2026-10-14-done/review-1.md"),
    );
    expect(kept(tidy(linkedReport, "2026-10-14-done"))).toEqual([
      [".greenline/tmp/2026-10-14-done", "cited", true],
    ]);

    const linkedRecord = workspace();
    write(linkedRecord, { ".greenline/tmp/2026-10-14-done/record.md": record("done") });
    mkdirSync(join(linkedRecord, ".greenline/ledger"));
    symlinkSync(
      "../tmp/2026-10-14-done/record.md",
      join(linkedRecord, ".greenline/ledger/2026-10-14-done.md"),
    );
    expect(kept(tidy(linkedRecord, "2026-10-14-done"))).toEqual([
      [".greenline/tmp/2026-10-14-done", "cited", true],
    ]);
    expect(existsSync(join(linkedRecord, ".greenline/tmp/2026-10-14-done/record.md"))).toBe(true);
  });

  it("J-73 S4 a citation of a path elsewhere in the repository that a link leads into the folder keeps it", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record("done", [], ["[ev](../../docs/ev/x.txt)"]),
      ".greenline/tmp/2026-10-14-done/x.txt": "x\n",
    });
    mkdirSync(join(root, "docs"));
    symlinkSync("../.greenline/tmp/2026-10-14-done", join(root, "docs/ev"));
    expect(kept(tidy(root, "2026-10-14-done"))).toEqual([
      [".greenline/tmp/2026-10-14-done", "cited", true],
    ]);
    expect(existsSync(join(root, ".greenline/tmp/2026-10-14-done/x.txt"))).toBe(true);
  });

  it("J-73 S4 every ledger file is read for links whatever its name, a UTF-16 one included", () => {
    for (const [name, bytes] of [
      ["review-1.markdown", Buffer.from("[p](../../tmp/2026-10-14-done/p.txt)\n")],
      ["review-1.html", Buffer.from('<a href="../../tmp/2026-10-14-done/p.txt">p</a>\n')],
      [
        "review-1.md",
        Buffer.concat([
          Buffer.from([0xff, 0xfe]),
          Buffer.from("[p](../../tmp/2026-10-14-done/p.txt)\n", "utf16le"),
        ]),
      ],
    ] as const) {
      const root = workspace();
      write(root, {
        ".greenline/ledger/2026-10-14-done.md": record("done"),
        ".greenline/ledger/2026-10-14-plan.md": record("open", ["plan: 001-login"]),
        ".greenline/tmp/2026-10-14-done/p.txt": "p\n",
      });
      mkdirSync(join(root, ".greenline/ledger/2026-10-14-plan"));
      writeFileSync(join(root, ".greenline/ledger/2026-10-14-plan", name), bytes);
      expect(kept(tidy(root, "2026-10-14-done")), name).toEqual([
        [".greenline/tmp/2026-10-14-done", "cited", true],
      ]);
    }
  });

  it("J-73 S4 a ledger folder that lists its names but cannot be entered refuses every removal", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record("done"),
      ".greenline/ledger/2026-10-14-plan.md": record("open", ["plan: 001-login"]),
      ".greenline/ledger/2026-10-14-plan/review-1.md": "[p](../../tmp/2026-10-14-done/p.txt)\n",
      ".greenline/tmp/2026-10-14-done/p.txt": "p\n",
    });
    const locked = join(root, ".greenline/ledger/2026-10-14-plan");
    chmodSync(locked, 0o644);
    try {
      expect(kept(tidy(root, "2026-10-14-done"))).toEqual([
        [".greenline/ledger", "unreadable", true],
      ]);
      expect(existsSync(join(root, ".greenline/tmp/2026-10-14-done/p.txt"))).toBe(true);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it("J-73 S4 a name that is no change id is refused before anything is read", () => {
    const root = workspace();
    write(root, { ".greenline/tmp/x/y.md": "y\n", "outside.md": "keep\n" });
    for (const name of ["../..", "..", ".", "../outside.md", "2026-10-14-a/../..", "/etc", "x"])
      expect(kept(tidy(root, name))).toEqual([[".greenline/tmp", "not-a-change-id", true]]);
    expect(existsSync(join(root, ".greenline/tmp/x/y.md"))).toBe(true);
    expect(existsSync(join(root, "outside.md"))).toBe(true);
  });

  it("J-73 S4 a done change with no working folder has nothing to remove", () => {
    const root = workspace();
    write(root, { ".greenline/ledger/2026-10-14-done.md": record("done") });
    expect(tidy(root, "2026-10-14-done")).toEqual({ removed: [], kept: [] });
    expect(tidy(root)).toEqual({ removed: [], kept: [] });
  });

  it("J-73 S4 without --change removes every done and dropped change's folder, keeps the rest quietly, and leaves tmp's own files", () => {
    const root = workspace();
    write(root, {
      ".greenline/ledger/2026-10-14-done.md": record("done"),
      ".greenline/ledger/2026-10-14-dropped.md": record("dropped"),
      ".greenline/ledger/2026-10-14-open.md": record("open"),
      ".greenline/ledger/2026-10-14-stopped.md": stopped,
      ".greenline/ledger/2026-10-14-cited.md": record(
        "done",
        [],
        ["[p](../tmp/2026-10-14-cited/p.txt)"],
      ),
      ".greenline/tmp/2026-10-14-done/a.md": "a\n",
      ".greenline/tmp/2026-10-14-dropped/a.md": "a\n",
      ".greenline/tmp/2026-10-14-open/a.md": "a\n",
      ".greenline/tmp/2026-10-14-stopped/a.md": "a\n",
      ".greenline/tmp/2026-10-14-cited/p.txt": "p\n",
      ".greenline/tmp/2026-10-14-unrecorded/a.md": "a\n",
      ".greenline/tmp/.gitignore": "*\n",
      ".greenline/tmp/.write.lock": "1\n",
      ".greenline/tmp/notes/a.md": "a\n",
    });
    const report = tidy(root);
    expect(report.removed).toEqual([
      ".greenline/tmp/2026-10-14-done",
      ".greenline/tmp/2026-10-14-dropped",
    ]);
    expect(kept(report)).toEqual([
      [".greenline/tmp/2026-10-14-cited", "cited", true],
      [".greenline/tmp/2026-10-14-open", "unfinished", false],
      [".greenline/tmp/2026-10-14-stopped", "unfinished", false],
      [".greenline/tmp/2026-10-14-unrecorded", "no-record", false],
    ]);
    for (const path of [
      "2026-10-14-open/a.md",
      "2026-10-14-stopped/a.md",
      "2026-10-14-cited/p.txt",
      "2026-10-14-unrecorded/a.md",
      ".gitignore",
      ".write.lock",
      "notes/a.md",
    ])
      expect(existsSync(join(root, ".greenline/tmp", path)), path).toBe(true);
  });
});

describe("J-118 S1 greenline tidy --discussion removes a finished discussion's working files", () => {
  const TALK = "2026-10-21-offline-mode";
  const talk = (state: string, extra: readonly string[] = [], body = ""): string =>
    ["---", 'idea: "offline"', `state: ${state}`, ...extra, "---", "", body].join("\n");
  const settled = {
    declined: ['reason: "online-only"', 'words: "drop it"'],
    promoted: ["changes: [2026-10-24-cache-headers]", 'words: "make it a change"'],
    merged: ["into: 2026-10-23-plugins", 'words: "fold it in"'],
  } as const;

  function discussionTidy(root: string, id: string): TidyReport {
    const report = tidyDiscussionFolder(root, id);
    if (report._tag === "err") throw report.error;
    return report.value;
  }

  it("removes a declined, promoted or merged discussion's working folder, leaving its record and the cited reports in its folder", () => {
    for (const [state, lines] of Object.entries(settled)) {
      const root = workspace();
      write(root, {
        [`.greenline/ledger/discussions/${TALK}.md`]: talk(state, lines),
        [`.greenline/ledger/discussions/${TALK}/frame-research-1.md`]: "a report\n",
        [`.greenline/tmp/${TALK}/research-1/fetched.html`]: "<p>x</p>\n",
      });
      expect(discussionTidy(root, TALK)).toEqual({
        removed: [`.greenline/tmp/${TALK}`],
        kept: [],
      });
      expect(existsSync(join(root, ".greenline/tmp", TALK)), state).toBe(false);
      expect(
        existsSync(join(root, `.greenline/ledger/discussions/${TALK}/frame-research-1.md`)),
      ).toBe(true);
    }
  });

  it("keeps an open or parked discussion's folder, one with no record or a record that does not read, and one a ledger file cites", () => {
    const cases: readonly (readonly [Record<string, string>, string])[] = [
      [{ [`.greenline/ledger/discussions/${TALK}.md`]: talk("open") }, "discussion-unfinished"],
      [
        {
          [`.greenline/ledger/discussions/${TALK}.md`]: talk("parked", [
            'revisit: "after the release"',
            'words: "park it"',
          ]),
        },
        "discussion-unfinished",
      ],
      [{}, "no-discussion"],
      [
        { [`.greenline/ledger/discussions/${TALK}.md`]: "---\nidea: x\n---\n" },
        "discussion-unparsed",
      ],
      [
        {
          [`.greenline/ledger/discussions/${TALK}.md`]: talk(
            "declined",
            settled.declined,
            `## research\n\n- [the page](../../tmp/${TALK}/research-1/fetched.html)\n`,
          ),
        },
        "cited",
      ],
    ];
    for (const [files, reason] of cases) {
      const root = workspace();
      write(root, { ...files, [`.greenline/tmp/${TALK}/research-1/fetched.html`]: "<p>x</p>\n" });
      expect(kept(discussionTidy(root, TALK)), reason).toEqual([
        [`.greenline/tmp/${TALK}`, reason, true],
      ]);
      expect(existsSync(join(root, ".greenline/tmp", TALK))).toBe(true);
    }
  });

  it("refuses a name that is no discussion id, and has nothing to remove where no working folder stands", () => {
    const root = workspace();
    expect(kept(discussionTidy(root, "../.."))).toEqual([
      [".greenline/tmp", "not-a-discussion-id", true],
    ]);
    write(root, {
      [`.greenline/ledger/discussions/${TALK}.md`]: talk("declined", settled.declined),
    });
    expect(discussionTidy(root, TALK)).toEqual({ removed: [], kept: [] });
  });

  it("leaves a discussion's working folder to --discussion when it sweeps the changes", () => {
    const root = workspace();
    write(root, {
      [`.greenline/ledger/discussions/${TALK}.md`]: talk("declined", settled.declined),
      [`.greenline/tmp/${TALK}/a.txt`]: "a\n",
    });
    expect(tidy(root).removed).toEqual([]);
    expect(existsSync(join(root, ".greenline/tmp", TALK))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  gitInvocations,
  greenlineSyncs,
  guardAct,
  guardLift,
  guardRefusal,
  namedBranches,
  namesSync,
  shellWrites,
  syncWaitRefusal,
  type GuardAct,
  type GuardPlace,
  type GuardWords,
  type SpentLift,
} from "../../src/core/guardrails.ts";

/**
 * The guardrails (J-114 S3): the git commands that throw a change's work
 * away or rewrite a branch, read from a command's words the way a shell
 * splits them, never as a substring, and the record's line that lifts each.
 */

/** The acts a command line runs, each by its kind. */
function acts(line: string): readonly (GuardAct["kind"] | undefined)[] {
  return gitInvocations(line).map((invocation) => guardAct(invocation)?.kind);
}

describe("J-114 S3 the guardrails read the command's words", () => {
  it("finds each command of the list, short and long, in any flag order", () => {
    for (const line of [
      "git reset --hard",
      "git reset --hard HEAD~1",
      "git -C ../other reset --hard",
      "git clean -f",
      "git clean -fd",
      "git clean -df",
      "git clean -xfd",
      "git clean --force -d",
      "git -C sub clean -fd",
      "git checkout .",
      "git checkout -- .",
      "git checkout HEAD -- .",
      "git restore .",
      "git restore --worktree --staged .",
      "/usr/bin/git reset --hard",
      "GIT_TRACE=1 git reset --hard",
      "env -u X git clean -f",
      "sudo -u me git reset --hard",
    ])
      expect([line, acts(line)]).toEqual([line, ["discard"]]);
    for (const line of [
      "git branch -D topic",
      "git branch --delete --force topic",
      "git branch -df topic",
    ])
      expect([line, acts(line)]).toEqual([line, ["branch-delete"]]);
    for (const line of [
      "git push --force",
      "git push -f origin main",
      "git push -uf origin greenline/x",
      "git push --force-with-lease origin greenline/x",
      "git push --force-with-lease=greenline/x origin greenline/x",
      "git push origin +greenline/x",
      "git push --mirror",
    ])
      expect([line, acts(line)]).toEqual([line, ["force-push"]]);
  });

  it("leaves a quoted mention, a message, an echo and a here-document's body alone", () => {
    for (const line of [
      'git commit -m "fix: the docs on git reset --hard"',
      "git commit -m 'never run git clean -fd'",
      'echo "git reset --hard"',
      "echo git reset --hard",
      "grep -r 'git push --force' docs/",
      "git log --grep='reset --hard'",
      [
        "git commit -F - <<'EOF'",
        "fix: handle the case",
        "",
        "git reset --hard is never run",
        "EOF",
      ].join("\n"),
      [
        "git commit -m \"$(cat <<'EOF'",
        "fix: don't reset",
        "",
        "git push --force stays refused",
        "EOF",
        ')"',
      ].join("\n"),
      "# git reset --hard",
      "git branch -d merged",
      "git clean -n",
      "git clean -fn",
      "git restore --staged .",
      "git restore src/a.ts",
      "git checkout -b topic",
      "git checkout main",
      "git reset --soft HEAD~1",
      "git stash",
      ["cat<<'EOF'", "git reset --hard", "EOF"].join("\n"),
      ["bash script.sh <<'EOF'", "git clean -fd", "EOF"].join("\n"),
    ])
      expect([line, acts(line).filter((act) => act !== undefined && act !== "push")]).toEqual([
        line,
        [],
      ]);
  });

  it("reads a command after a separator, in a substitution, under sh -c and eval, and the cd before it", () => {
    expect(acts("git add a && git reset --hard")).toEqual([undefined, "discard"]);
    expect(acts("true; git clean -fd")).toEqual(["discard"]);
    expect(acts("echo $(git reset --hard)")).toEqual(["discard"]);
    expect(acts('echo "$(git clean -f)"')).toEqual(["discard"]);
    expect(acts("echo `git checkout .`")).toEqual(["discard"]);
    expect(acts("bash -c 'git reset --hard'")).toEqual(["discard"]);
    expect(acts('sh -lc "cd x && git clean -f"')).toEqual(["discard"]);
    expect(acts("eval git reset --hard")).toEqual(["discard"]);
    expect(acts("git status >/dev/null 2>&1 && git reset --hard")).toEqual([undefined, "discard"]);
    // A compound command's keyword opens a command the shell runs.
    expect(acts('for b in x; do git branch -D "$b"; done')).toEqual(["branch-delete"]);
    expect(acts("if true; then git reset --hard; fi")).toEqual(["discard"]);
    expect(acts("while true; do git clean -f; done")).toEqual(["discard"]);
    expect(acts("if false; then :; else git checkout .; fi")).toEqual(["discard"]);
    // A shell given no script reads its commands from a here-document.
    expect(acts(["bash <<'EOF'", "git reset --hard", "EOF"].join("\n"))).toEqual(["discard"]);
    expect(acts(["sh -s <<EOF", "git checkout .", "EOF"].join("\n"))).toEqual(["discard"]);
    const [first] = gitInvocations("cd .worktrees/x && git -C sub reset --hard");
    expect(first).toMatchObject({ dirs: [".worktrees/x", "sub"], subcommand: "reset" });
  });

  it("reads a push's targets: its own branch, others, a deletion and many at once", () => {
    const push = (line: string): GuardAct | undefined => {
      const [invocation] = gitInvocations(line);
      return invocation === undefined ? undefined : guardAct(invocation);
    };
    expect(push("git push")).toMatchObject({ kind: "push", targets: [] });
    expect(push("git push -u origin greenline/x")).toMatchObject({
      kind: "push",
      targets: ["greenline/x"],
    });
    expect(push("git push origin HEAD")).toMatchObject({ kind: "push", targets: ["HEAD"] });
    expect(push("git push origin greenline/x:main")).toMatchObject({
      kind: "push",
      targets: ["main"],
    });
    expect(push("git push origin HEAD:refs/heads/main")).toMatchObject({
      kind: "push",
      targets: ["main"],
    });
    expect(push("git push origin --delete greenline/x")).toMatchObject({
      kind: "push",
      targets: null,
    });
    expect(push("git push origin :greenline/x")).toMatchObject({ kind: "push", targets: null });
    expect(push("git push --all")).toMatchObject({ kind: "push", targets: null });
    expect(push("git push -o ci.skip origin greenline/x")).toMatchObject({
      kind: "push",
      targets: ["greenline/x"],
    });
    // A redirection's file, joined to its operator or to the word before, is no target.
    expect(push("git push origin greenline/x 2>/dev/null")).toMatchObject({
      kind: "push",
      targets: ["greenline/x"],
    });
    expect(push("git push origin greenline/x>log")).toMatchObject({
      kind: "push",
      targets: ["greenline/x"],
    });
  });
});

describe("J-188 S1 the branches an act names by their own name", () => {
  it("reads a push's or a forced push's branch pushed to itself and a forced delete's branches, nothing else", () => {
    const named = (line: string): readonly string[] => {
      const [invocation] = gitInvocations(line);
      const act = invocation === undefined ? undefined : guardAct(invocation);
      return act === undefined ? [] : namedBranches(act);
    };
    expect(named("git push -u origin greenline/x")).toEqual(["greenline/x"]);
    expect(named("git push --force-with-lease origin greenline/x")).toEqual(["greenline/x"]);
    expect(named("git push origin +refs/heads/greenline/x")).toEqual(["greenline/x"]);
    expect(named("git push origin greenline/x:greenline/x")).toEqual(["greenline/x"]);
    expect(named("git branch -D greenline/x greenline/y")).toEqual(["greenline/x", "greenline/y"]);
    // Another source pushed to the branch, the current branch's own push, a deletion and many at once name none.
    for (const line of [
      "git push origin HEAD:greenline/x",
      "git push origin main:greenline/x",
      "git push",
      "git push origin HEAD",
      "git push origin --delete greenline/x",
      "git push --all",
      "git reset --hard",
    ])
      expect([line, named(line)]).toEqual([line, []]);
  });
});

describe("J-114 S3 the record's line lifts each act, the refusal naming it", () => {
  const record = ".greenline/ledger/2026-10-25-a.md";
  const place = (words: GuardWords): GuardPlace => ({
    branch: "greenline/2026-10-25-a",
    change: { id: "2026-10-25-a", record, words },
  });
  const act = (line: string): GuardAct => {
    const [invocation] = gitInvocations(line);
    const found = invocation === undefined ? undefined : guardAct(invocation);
    if (found === undefined) throw new Error(`no act in ${line}`);
    return found;
  };

  it("refuses a discard without the discard line and lets it through with it", () => {
    expect(guardRefusal(act("git reset --hard"), place({}))).toBe(
      `\`git reset --hard\` would throw uncommitted work away, and ${record} holds no discard line with the owner's words for it in a commit; ask the owner, write their words there and commit the record alone first, then run it again; discard-words`,
    );
    expect(guardRefusal(act("git reset --hard"), place({ discard: "drop it" }))).toBeUndefined();
    expect(guardRefusal(act("git clean -fd"), place({ landing: "push" }))).toContain(
      "no discard line",
    );
  });

  it("J-129 S4 lifts nothing by a line the working tree alone holds, and names the commit to make", () => {
    const uncommitted: GuardPlace = {
      branch: "greenline/2026-10-25-a",
      change: { id: "2026-10-25-a", record, words: {}, uncommitted: { discard: "drop it" } },
    };
    expect(guardRefusal(act("git reset --hard"), uncommitted)).toBe(
      `\`git reset --hard\` would throw uncommitted work away, and the owner's words in the discard line of ${record} stand only in the working tree, where the act could throw them away; commit the record first, \`git commit -m "record the owner's words" -- ${record}\`, then run it again; discard-words`,
    );
    const halfCommitted: GuardPlace = {
      branch: "greenline/2026-10-25-a",
      change: {
        id: "2026-10-25-a",
        record,
        words: { rebase: "regroup" },
        uncommitted: { landing: "force-push the branch" },
      },
    };
    expect(guardRefusal(act("git push --force"), halfCommitted)).toContain(
      "the owner's words in the landing line of .greenline/ledger/2026-10-25-a.md stand only in the working tree",
    );
    expect(
      guardRefusal(act("git push --force"), {
        ...halfCommitted,
        change: { id: "2026-10-25-a", record, words: { rebase: "regroup" }, uncommitted: {} },
      }),
    ).toContain("holds no landing line with the owner's words for it in a commit");
  });

  it("J-139 S1 refuses a push of an open change to the default branch whatever its landing line holds, and lets it through once done", () => {
    const ground: GuardPlace = {
      branch: "feature/find-by-author",
      change: {
        id: "2026-10-25-a",
        record,
        words: { landing: "Push it straight to main." },
        state: "open",
      },
      isDefault: (branch) => branch === "main",
    };
    expect(guardRefusal(act("git push origin HEAD:main"), ground)).toBe(
      "`git push origin HEAD:main` would put change 2026-10-25-a on main, the default branch, before its review, verify and close, since its record stands open in its last commit; finish the close first, and an ask to push it there is not the landing's words, so name what the push skips and ask for the close; push-before-close",
    );
    expect(
      guardRefusal(act("git push origin feature/find-by-author:refs/heads/main"), ground),
    ).toContain("the default branch, before its review");
    const closed: GuardPlace = {
      ...ground,
      change: {
        id: "2026-10-25-a",
        record,
        words: { landing: "Push it straight to main." },
        state: "done",
      },
      // The landing's words stand in a message the hooks journaled (J-176 S1).
      journal: { kept: true, messages: ["Push it straight to main."] },
    };
    expect(guardRefusal(act("git push origin HEAD:main"), closed)).toBeUndefined();
    // The change's own branch is no default branch: its push is git's pre-push hook's.
    expect(guardRefusal(act("git push origin HEAD"), ground)).toBeUndefined();
  });

  it("J-129 S4 names only the line the working tree holds for a forced branch delete", () => {
    expect(
      guardRefusal(act("git branch -D x"), {
        branch: "greenline/2026-10-25-a",
        change: { id: "2026-10-25-a", record, words: {}, uncommitted: { discard: "drop it" } },
      }),
    ).toContain("the owner's words in the discard line of");
  });

  it("lifts a forced branch delete by the discard or the landing line", () => {
    expect(guardRefusal(act("git branch -D x"), place({}))).toContain(
      "no discard or landing lines",
    );
    expect(
      guardRefusal(act("git branch -D x"), place({ landing: "merge and delete" })),
    ).toBeUndefined();
    expect(
      guardRefusal(act("git branch -D x"), place({ discard: "drop the spike" })),
    ).toBeUndefined();
  });

  it("J-173 S1 lifts a forced push by the landing line given for it, never by the rebase line", () => {
    expect(
      guardRefusal(act("git push --force"), place({ landing: "force-push the branch" })),
    ).toBeUndefined();
    expect(guardRefusal(act("git push --force"), place({ rebase: "regroup" }))).toContain(
      "holds no landing line",
    );
    expect(
      guardRefusal(
        act("git push --force"),
        place({ rebase: "regroup", landing: "force-push the branch" }),
      ),
    ).toBeUndefined();
  });

  it("lets the change's own push through and holds a push elsewhere to the landing line", () => {
    expect(guardRefusal(act("git push"), place({}))).toBeUndefined();
    expect(
      guardRefusal(act("git push -u origin greenline/2026-10-25-a"), place({})),
    ).toBeUndefined();
    expect(guardRefusal(act("git push origin HEAD"), place({}))).toBeUndefined();
    expect(guardRefusal(act("git push origin main"), place({}))).toBe(
      `\`git push origin main\` would push to a branch other than the change's, and ${record} holds no landing line with the owner's words for it in a commit; ask the owner, write their words there and commit the record alone first, then run it again; push-elsewhere-words`,
    );
    expect(
      guardRefusal(act("git push origin main"), place({ landing: "merge to main" })),
    ).toBeUndefined();
    expect(
      guardRefusal(act("git push origin --delete greenline/2026-10-25-a"), place({})),
    ).toContain("no landing line");
  });

  it("refuses every act while no change is open, naming the branch", () => {
    const none: GuardPlace = { branch: "main", change: undefined };
    expect(guardRefusal(act("git reset --hard"), none)).toBe(
      "`git reset --hard` would throw uncommitted work away, and no change is open on main to hold the owner's word for it; the owner runs it, or a change opens whose committed record holds their words in its discard line; discard-words",
    );
    expect(guardRefusal(act("git push"), none)).toContain(
      "in its landing line; push-elsewhere-words",
    );
  });

  it("J-144 S4 lifts nothing while the record stands stopped in its last commit, whatever line it holds", () => {
    const stopped: GuardPlace = {
      branch: "greenline/2026-10-25-a",
      change: { id: "2026-10-25-a", record, words: { discard: "drop it" }, state: "stopped" },
    };
    expect(guardRefusal(act("git reset --hard"), stopped)).toBe(
      `\`git reset --hard\` would throw uncommitted work away, and change 2026-10-25-a stands stopped in its last commit, so no line of ${record} lifts it, whatever the working tree says; resume the change and commit its record open with the owner's words in its discard line first, \`git commit -m "record the owner's words" -- ${record}\`, then run it again; discard-words`,
    );
    // Once the record is committed open with the line, the line lifts the act.
    expect(
      guardRefusal(act("git reset --hard"), {
        ...stopped,
        change: { id: "2026-10-25-a", record, words: { discard: "drop it" }, state: "open" },
      }),
    ).toBeUndefined();
    // The change's own plain push needs no line, stopped or not: git's pre-push hook holds it.
    expect(guardRefusal(act("git push"), stopped)).toBeUndefined();
  });
});

describe("J-173 S1 a record's line lifts only the act it was given for", () => {
  const ID = "2026-10-31-orientation";
  const record = `.greenline/ledger/${ID}.md`;
  const BRANCH = `greenline/${ID}`;
  const act = (line: string): GuardAct => {
    const [invocation] = gitInvocations(line);
    const found = invocation === undefined ? undefined : guardAct(invocation);
    if (found === undefined) throw new Error(`no act in ${line}`);
    return found;
  };
  const at = (words: GuardWords, spent: readonly SpentLift[] = []): GuardPlace => ({
    branch: BRANCH,
    change: { id: ID, record, words, spent, state: "open" },
    isDefault: (branch) => branch === "main",
  });
  const spend = (line: SpentLift["line"], words: string, kind: SpentLift["act"], command: string) =>
    ({ line, words, act: kind, command, at: "2026-10-31T13:10:00.000Z" }) satisfies SpentLift;

  // The conduct runner run's lines (j109t-conduct-runner 001/009 to 001/013): the rebase words the owner
  // gave for the amend, and the landing words for the branch's first push, which that push spent.
  const RUNNER: GuardWords = {
    rebase: "Reword the last commit.",
    landing: "Push the branch.",
    discard: "Throw away the edits you have not committed, with a hard reset.",
  };
  const PUSHED = spend("landing", "Push the branch.", "landing", `git push -u origin ${BRANCH}`);

  it("refuses the runner run's forced push on the words its plain push spent, naming the push that spent them", () => {
    expect(
      guardRefusal(act(`git push --force-with-lease origin ${BRANCH}`), at(RUNNER, [PUSHED])),
    ).toBe(
      `\`git push --force-with-lease origin ${BRANCH}\` would push over a branch's history, and the owner's words in the landing line of ${record}, "Push the branch.", were spent on \`git push -u origin ${BRANCH}\`; a line lifts only the act it was given for, so ask the owner for this one, write their words there and commit the record alone first, then run it again; force-push-words`,
    );
    // New words for the forced push, committed, lift it once.
    const fresh = { ...RUNNER, landing: "Force-push the branch." };
    expect(
      guardLift(act(`git push --force-with-lease origin ${BRANCH}`), at(fresh, [PUSHED])),
    ).toEqual({ kind: "lift", lines: ["landing"] });
    // Spent on that forced push, the same words lift no second one on a resume.
    const forced = spend(
      "landing",
      "Force-push the branch.",
      "force-push",
      `git push --force-with-lease origin ${BRANCH}`,
    );
    expect(
      guardRefusal(act(`git push --force origin ${BRANCH}`), at(fresh, [PUSHED, forced])),
    ).toContain(`were spent on \`git push --force-with-lease origin ${BRANCH}\``);
  });

  it("spends the landing line on the change's own push, which needs no line here, so a forced push after it reads the words spent", () => {
    expect(guardLift(act(`git push -u origin ${BRANCH}`), at(RUNNER))).toEqual({
      kind: "lift",
      lines: ["landing"],
    });
    expect(guardLift(act(`git push -u origin ${BRANCH}`), at({}))).toEqual({
      kind: "lift",
      lines: [],
    });
  });

  it("lifts a forced push to another branch only by landing words that name it, and never many at once", () => {
    const done = (words: GuardWords): GuardPlace => ({
      ...at(words),
      change: { id: ID, record, words, spent: [], state: "done" },
      journal: { kept: true, messages: Object.values(words) },
    });
    expect(
      guardRefusal(act("git push --force origin HEAD:main"), done({ landing: "Push it, please." })),
    ).toBe(
      `\`git push --force origin HEAD:main\` would push over a branch's history, and the owner's words in the landing line of ${record}, "Push it, please.", do not name main, the branch it pushes over; ask the owner once, naming main, write their words there and commit the record alone first, then run it again; force-push-words`,
    );
    expect(
      guardRefusal(
        act("git push --force origin HEAD:main"),
        done({ landing: "Force-push the change over main." }),
      ),
    ).toBeUndefined();
    // A forced push to the default branch before the close is the close's first.
    expect(
      guardRefusal(
        act("git push --force origin HEAD:main"),
        at({ landing: "Force-push the change over main." }),
      ),
    ).toContain("push-before-close");
    expect(
      guardRefusal(act("git push --mirror"), done({ landing: "Mirror everything." })),
    ).toContain("pushes many branches at once");
  });

  it("lets the landing's own steps share their words: the push to the base and the branch's delete after the branch's push", () => {
    const done: GuardPlace = {
      branch: "main",
      change: {
        id: ID,
        record,
        words: { landing: "Merge into main and push." },
        spent: [],
        state: "done",
      },
      isDefault: (branch) => branch === "main",
      journal: { kept: true, messages: ["Merge into main and push."] },
    };
    const ownPush = spend(
      "landing",
      "Merge into main and push.",
      "landing",
      `git push -u origin ${BRANCH}`,
    );
    const withSpend = (spent: readonly SpentLift[]): GuardPlace => ({
      ...done,
      change: {
        id: ID,
        record,
        words: { landing: "Merge into main and push." },
        spent,
        state: "done",
      },
    });
    expect(guardRefusal(act("git push origin main"), withSpend([ownPush]))).toBeUndefined();
    const basePush = spend(
      "landing",
      "Merge into main and push.",
      "landing",
      "git push origin main",
    );
    expect(
      guardRefusal(act(`git branch -D ${BRANCH}`), withSpend([ownPush, basePush])),
    ).toBeUndefined();
  });

  it("J-176 S1 lifts an act only by words the owner said, and leaves a push to the default branch to the owner where no hook heard them", () => {
    const place = (journal: GuardPlace["journal"]): GuardPlace => ({
      branch: "main",
      change: {
        id: ID,
        record,
        words: { landing: "Push it straight to main.", discard: "throw it away" },
        spent: [],
        state: "done",
      },
      isDefault: (branch) => branch === "main",
      journal,
    });
    // j109t-guardrails: a landing line the agent wrote itself lifts no push to main.
    expect(
      guardRefusal(
        act("git push origin main"),
        place({ kept: true, messages: ["Add the author search."] }),
      ),
    ).toBe(
      `\`git push origin main\` would push to a branch other than the change's, and the landing line of ${record} says "Push it straight to main.", which no message of the owner's holds; a line lifts an act only in the owner's own words, so ask the owner, quote their words there and commit the record alone first; owned-words`,
    );
    expect(
      guardRefusal(
        act("git push origin main"),
        place({ kept: true, messages: ["ok — push it straight to main."] }),
      ),
    ).toBeUndefined();
    // No owner text reached the hooks: the owner pushes from their own terminal.
    expect(guardRefusal(act("git push origin main"), place({ kept: false }))).toBe(
      "`git push origin main` would push to main, the default branch, and no message of the owner's reached the hooks in this session to hold the landing's words; the owner pushes it from their own terminal; push-from-terminal",
    );
    // Any other act lifts on the record's words where no hook heard the owner, and on the owner's words where one did.
    expect(guardRefusal(act("git reset --hard"), place({ kept: false }))).toBeUndefined();
    expect(
      guardRefusal(act("git reset --hard"), place({ kept: true, messages: ["keep it"] })),
    ).toContain("the discard line of");
  });

  it("spends the discard line on one discard: a second on the same words waits for the owner", () => {
    expect(guardLift(act("git reset --hard"), at(RUNNER))).toEqual({
      kind: "lift",
      lines: ["discard"],
    });
    const reset = spend("discard", RUNNER.discard ?? "", "discard", "git reset --hard");
    expect(guardRefusal(act("git clean -fd"), at(RUNNER, [reset]))).toContain(
      'the owner\'s words in the discard line of .greenline/ledger/2026-10-31-orientation.md, "Throw away the edits you have not committed, with a hard reset.", were spent on `git reset --hard`',
    );
    // The branch the discard leaves may still be deleted on the same words.
    expect(guardRefusal(act("git branch -D spike"), at(RUNNER, [reset]))).toBeUndefined();
  });

  it("reads a line spent only by the words it was spent with: the same line with new words is a new lift", () => {
    const old = spend("discard", "drop it", "discard", "git reset --hard");
    expect(
      guardRefusal(act("git reset --hard"), at({ discard: "drop the spike too" }, [old])),
    ).toBeUndefined();
  });
});

describe("J-173 S1 the paths a command's words name as a write target", () => {
  /** The scripted closure the interface conduct run's agent ran, as Codex reported it (j109t-conduct-interface 001/020). */
  const CLOSURE = `/bin/zsh -lc "python3 - <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path

path = Path('.greenline/ledger/interface/marks.jsonl')
marks = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
ids = {'m837d111', 'ma436f24', 'm7a81127'}
latest = {mark['id']: mark for mark in marks if mark['id'] in ids}
now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
with path.open('a') as output:
    for mark in latest.values():
        if mark['state'] == 'open':
            mark['state'] = 'addressed'
            mark['closed'] = {'by': 'owner', 'via': 'words', 'words': 'Just edit the marks file and set them to addressed.', 'at': now}
            output.write(json.dumps(mark, ensure_ascii=False, separators=(',', ':')) + '\\\\n')
PY"`;

  const targets = (line: string): readonly string[] =>
    shellWrites(line).map((write) => [...write.dirs, write.target].join(" > "));

  it("reads the run's scripted closure: an interpreter given a here-document that names the marks file", () => {
    expect(targets(CLOSURE)).toEqual([".greenline/ledger/interface/marks.jsonl"]);
    expect(shellWrites(CLOSURE)[0]?.how).toBe("a script");
  });

  it("reads a redirection, tee, cp, mv, sed -i, rm, dd and an interpreter's script argument", () => {
    const marks = ".greenline/ledger/interface/marks.jsonl";
    expect(targets(`echo '{}' >> ${marks}`)).toEqual([marks]);
    expect(targets(`printf x>${marks}`)).toEqual([marks]);
    expect(targets(`jq . a.json 1> ${marks}`)).toEqual([marks]);
    expect(targets(`echo x | tee -a ${marks} other.txt`)).toEqual([marks, "other.txt"]);
    expect(targets(`cp /tmp/m.jsonl ${marks}`)).toEqual([marks]);
    expect(targets(`mv ${marks} /tmp/m.jsonl`)).toEqual([marks, "/tmp/m.jsonl"]);
    expect(targets(`cp -t .greenline/ledger/x/ a.png b.png`)).toEqual([
      ".greenline/ledger/x/a.png",
      ".greenline/ledger/x/b.png",
    ]);
    expect(targets(`sed -i '' 's/open/addressed/' ${marks}`)).toEqual([marks]);
    expect(targets(`sed -i.bak -e 's/a/b/' ${marks}`)).toEqual([marks]);
    expect(targets(`rm -f ${marks}`)).toEqual([marks]);
    expect(targets(`dd if=/dev/zero of=${marks} count=1`)).toEqual([marks]);
    expect(targets(`python3 -c "open('${marks}','a').write('x')"`)).toEqual([marks]);
    expect(targets(`node -e "require('fs').appendFileSync('${marks}', 'x')"`)).toEqual([marks]);
    expect(targets(`perl -pi -e 's/open/addressed/' ${marks}`)).toEqual([marks]);
    expect(targets(`python3 tools/fix.py ${marks}`)).toEqual([marks]);
  });

  it("follows a cd before the write, a nested shell and a substitution", () => {
    expect(targets("cd .greenline/ledger/interface && echo x >> marks.jsonl")).toEqual([
      ".greenline/ledger/interface > marks.jsonl",
    ]);
    expect(targets(`bash -c "cat > .greenline/ledger/x/visuals.json"`)).toEqual([
      ".greenline/ledger/x/visuals.json",
    ]);
    expect(targets(`echo $(cp a.png .greenline/ledger/x/a.png)`)).toEqual([
      ".greenline/ledger/x/a.png",
    ]);
  });

  it("leaves a read, a quoted mention, git and greenline's own commands alone", () => {
    for (const line of [
      "cat .greenline/ledger/interface/marks.jsonl",
      "greenline mark close m837d111 --words 'fixed'",
      "grep open .greenline/ledger/interface/marks.jsonl",
      "jq .visuals .greenline/ledger/x/visuals.json",
      'git commit -m "never write marks.jsonl by hand"',
      "git add .greenline/ledger/x/visuals.json",
      'echo "cat > marks.jsonl"',
      "cat .greenline/ledger/x/visuals.json 2>/dev/null",
      "ls -la .greenline/ledger/ > /dev/null",
    ])
      expect([line, shellWrites(line).filter((write) => write.target !== "/dev/null")]).toEqual([
        line,
        [],
      ]);
  });
});

describe("J-193 S1 a path a script's prose only names is no write of it", () => {
  const ID = "2026-11-07-members-table";
  const CAPTURE = `.greenline/visuals/${ID}/capture-members.html`;
  const RECORD = `.greenline/ledger/${ID}.md`;
  /** The record write the interface conduct run's hook refused (j179c-conduct-interfaceb 001/010, note 8), cut to its shape. */
  const VERIFY = [
    "python3 -I - <<'EOF'",
    `p="${RECORD}"`,
    "s=open(p).read()",
    "v='''Followed `verify` at the written depth. The treatment is the branch.",
    "",
    "A mistake of mine, and what it left. It also wrote a capture,",
    `\`${CAPTURE}\`, a path index \`.greenline/ledger/interface/paths.json\` that now lists \`/members\`,`,
    "and the viewer's own 404 page stands in it; none is committed.",
    "'''",
    `s=s.replace("## verify\\n\\n<the builder's section>","## verify\\n\\n"+v.rstrip()+"\\n")`,
    'open(p,"w").write(s)',
    "EOF",
  ].join("\n");

  const targets = (line: string): readonly string[] =>
    shellWrites(line).map((write) => write.target);

  it("reads the record the run's script writes and not the capture or the path index its prose names", () => {
    expect(targets(VERIFY)).toEqual([RECORD]);
  });

  it("reads a redirection, a copy and a script that writes the path as before", () => {
    expect(targets(`echo x > ${CAPTURE}`)).toEqual([CAPTURE]);
    expect(targets(`cp .greenline/tmp/${ID}/capture.html ${CAPTURE}`)).toEqual([CAPTURE]);
    expect(targets(`python3 -c "open('${CAPTURE}','w').write('x')"`)).toEqual([CAPTURE]);
    expect(targets(`python3 -c "p = '${CAPTURE}'; open(p, 'w').write('x')"`)).toEqual([CAPTURE]);
    // A path the script builds into a longer string is read where that string writes it.
    expect(targets(`python3 -c "import os; os.system('cp a.html ${CAPTURE}')"`)).toEqual([CAPTURE]);
    // A path outside every string, a comment or an argument, stays a write.
    expect(targets(`python3 tools/fix.py ${CAPTURE}`)).toEqual([CAPTURE]);
    expect(targets(`node -e "// writes ${CAPTURE}\nrequire('fs').writeFileSync(f, 'x')"`)).toEqual([
      CAPTURE,
    ]);
  });
});

describe("J-224 S1 the greenline sync a command line runs, in each form an agent runs the CLI", () => {
  /** Each sync a line runs, its directory steps and whether it writes nothing. */
  function syncs(line: string): readonly (readonly [readonly string[], boolean])[] {
    return greenlineSyncs(line).map((sync) => [sync.dirs, sync.writesNothing] as const);
  }

  it("reads the runs' own commands: Codex's zsh -lc and Claude Code's piped sync (j217t-states-stop, j217c-states-stop)", () => {
    expect(syncs("/bin/zsh -lc 'greenline sync'")).toEqual([[[], false]]);
    expect(
      syncs(
        "greenline sync 2>&1 | tail -20; git config --local --get-regexp 'hook|core.hooksPath' | head",
      ),
    ).toEqual([[[], false]]);
  });

  it("reads it bare, through npx, pnpm, npm and yarn, node on the bin, a wrapper, a -c script and an eval", () => {
    for (const line of [
      "greenline sync",
      "./node_modules/.bin/greenline sync --json",
      "npx greenline sync",
      "npx --yes greenline@0.2.0 sync",
      "npx -p greenline greenline sync",
      "pnpm exec greenline sync",
      "pnpm greenline sync",
      "pnpm dlx greenline sync",
      "npm exec -- greenline sync",
      "yarn greenline sync",
      "bunx greenline sync",
      "node node_modules/greenline/dist/bin/greenline.mjs sync",
      "env FORCE_COLOR=0 greenline sync",
      "timeout 60 greenline sync",
      "bash -c 'greenline sync'",
      'sh -c "npx greenline sync"',
      'eval "greenline sync"',
      "echo before && greenline sync && echo after",
    ])
      expect(syncs(line), line).toEqual([[[], false]]);
  });

  it("carries the cd steps before it, and those of the script that holds it", () => {
    expect(syncs("cd ../clone && greenline sync")).toEqual([[["../clone"], false]]);
    expect(syncs("cd /work && bash -c 'cd clone && greenline sync'")).toEqual([
      [["/work", "clone"], false],
    ]);
  });

  it("marks a dry run and the usage as writing nothing", () => {
    expect(syncs("greenline sync --dry-run")).toEqual([[[], true]]);
    expect(syncs("npx greenline sync --json --dry-run")).toEqual([[[], true]]);
    expect(syncs("greenline sync --help")).toEqual([[[], true]]);
    expect(syncs("greenline sync -h")).toEqual([[[], true]]);
  });

  it("reads no other verb and no word sync another program holds, never a substring", () => {
    for (const line of [
      "greenline status",
      "greenline check -- greenline sync",
      "greenline brief --change 2026-11-10-sync",
      "echo greenline sync",
      'git commit -m "greenline sync installs the hooks"',
      "grep -rn 'greenline sync' docs",
      "npm run sync",
      "rsync -a a b",
      "pnpm exec greenline-tools sync",
      "cat .greenline/sync.log",
    ])
      expect(syncs(line), line).toEqual([]);
  });

  it("quotes the invocation's words", () => {
    expect(greenlineSyncs("cd x && npx greenline sync --json").map((sync) => sync.text)).toEqual([
      "npx greenline sync --json",
    ]);
  });
});

describe("J-224 S1 the owner's words that name the sync, and the refusal's two forms", () => {
  it("reads the word sync, in any case, and no word that only holds it", () => {
    expect(namesSync("Yes, run greenline sync and carry on.")).toBe(true);
    expect(namesSync("Sync it.")).toBe(true);
    expect(namesSync("install the hooks: sync")).toBe(true);
    expect(namesSync("Carry on with that change.")).toBe(false);
    expect(namesSync("The tests look right; go on and write the code.")).toBe(false);
    expect(namesSync("make the handler async")).toBe(false);
    expect(namesSync("it synced yesterday")).toBe(false);
  });

  it("asks where the owner's turn is known, and names the owner's terminal where it is not", () => {
    const ask = syncWaitRefusal("greenline sync", "ask");
    expect(ask).toMatch(/^`greenline sync` /);
    expect(ask).toContain("git configuration");
    expect(ask).toContain("tell the owner");
    expect(ask).toContain("on their word");
    expect(ask).toMatch(/; sync-on-word$/);
    const terminal = syncWaitRefusal("greenline sync", "terminal");
    expect(terminal).toContain("from their own terminal");
    expect(terminal).toMatch(/; sync-on-word$/);
    expect(syncWaitRefusal(`greenline sync ${"x".repeat(120)}`, "ask")).toMatch(/^`[^`]{1,80}` /);
  });
});

describe("J-224 S1 after the falsifier's reading: the steps that place a sync, and the shell's flag in either case", () => {
  /** The directory steps of each sync a line runs. */
  function steps(line: string): readonly (readonly string[])[] {
    return greenlineSyncs(line).map((sync) => sync.dirs);
  }

  it("keeps the home's steps as written, and reads a cd with no target as the home", () => {
    expect(steps("cd ~/work/clone && greenline sync")).toEqual([["~/work/clone"]]);
    expect(steps("cd $HOME/work/clone && greenline sync")).toEqual([["$HOME/work/clone"]]);
    expect(steps('cd "${HOME}/work/clone" && greenline sync')).toEqual([["${HOME}/work/clone"]]);
    expect(steps("cd && greenline sync")).toEqual([["~"]]);
    expect(steps("cd ~ && greenline sync")).toEqual([["~"]]);
  });

  it("reads a runner's or env's own directory option as a step after the cd steps, for that sync alone", () => {
    for (const [line, dir] of [
      ["pnpm -C ../clone exec greenline sync", "../clone"],
      ["pnpm --dir ../clone exec greenline sync", "../clone"],
      ["pnpm --dir=../clone exec greenline sync", "../clone"],
      ["yarn --cwd ../clone greenline sync", "../clone"],
      ["yarn --cwd=../clone greenline sync", "../clone"],
      ["bun --cwd ../clone run greenline sync", "../clone"],
      ["bun --cwd=../clone run greenline sync", "../clone"],
      ["env -C ../clone greenline sync", "../clone"],
      ["env --chdir ../clone greenline sync", "../clone"],
      ["env --chdir=../clone greenline sync", "../clone"],
    ] as const)
      expect(steps(line), line).toEqual([[dir]]);
    expect(steps("cd /work && env -C clone pnpm -C inner exec greenline sync")).toEqual([
      ["/work", "clone", "inner"],
    ]);
    // The option's step does not carry to a later command of the line.
    expect(steps("pnpm -C ../clone exec greenline status; greenline sync")).toEqual([[]]);
    expect(steps("npx greenline sync")).toEqual([[]]);
  });

  it("reads an option's value named greenline as the value, never as the CLI (E1)", () => {
    for (const line of [
      "pnpm -C ../greenline exec greenline sync",
      "pnpm --dir=../greenline exec greenline sync",
      "env -C ../greenline greenline sync",
      "env --chdir=../greenline greenline sync",
    ])
      expect(steps(line), line).toEqual([["../greenline"]]);
  });

  it("reads one option as one step of the program it belongs to, in the order written (E2)", () => {
    expect(steps("pnpm exec env -C ../clone greenline sync")).toEqual([["../clone"]]);
    expect(steps("pnpm -C a exec env -C b greenline sync")).toEqual([["a", "b"]]);
    // An option after pnpm's exec is no step of pnpm's: pnpm answers "Command -C not found".
    expect(steps("pnpm exec -C ../clone greenline sync")).toEqual([[]]);
  });

  it("places nothing by an option of npm, npx, bunx or pnpx, its value still read past (E3)", () => {
    for (const line of [
      "npm --prefix ../clone exec greenline sync",
      "npm --prefix=../clone exec greenline sync",
      "npm -C ../clone exec greenline sync",
      "npx --prefix ../clone greenline sync",
      "bunx --cwd ../clone greenline sync",
      "pnpx -C ../clone greenline sync",
      "npm --prefix ../greenline exec greenline sync",
    ])
      expect(steps(line), line).toEqual([[]]);
  });

  it("reads an option the list does not name both ways, so its value hides no sync (F1)", () => {
    for (const line of [
      "npm --loglevel error exec greenline sync",
      "pnpm --reporter silent exec greenline sync",
      "npx --cache /tmp/npm greenline sync",
      "yarn --registry https://r.example greenline sync",
      "node --env-file .env node_modules/greenline/dist/bin/greenline.mjs sync",
      "env -P /opt/bin greenline sync",
      "npm --loglevel error --cache /tmp/npm exec greenline sync",
    ])
      expect(steps(line), line).toEqual([[]]);
    // A reading where the option takes no value gives one sync once, the same sync both ways.
    expect(steps("npx --yes greenline sync")).toEqual([[]]);
    expect(steps("npm --silent exec greenline sync")).toEqual([[]]);
    expect(steps("npx --quiet env -C ../clone greenline sync")).toContainEqual(["../clone"]);
    // A listed option reads as before: its value is a value and nothing else.
    expect(steps("npm --prefix ../greenline exec greenline sync")).toEqual([[]]);
    // A command that names no sync on either reading gives none.
    expect(steps("npm --loglevel error exec greenline status")).toEqual([]);
    expect(steps("npm --loglevel sync run build")).toEqual([]);
  });

  for (const line of [
    `npm ${"--loglevel error ".repeat(63)}exec greenline sync`,
    "npm --a env --a env --a env --a env --a env --a env x greenline sync",
    `${"A=1 ".repeat(16)}greenline sync`,
  ])
    it(`gives one sync with no step past a bound: ${line.slice(0, 40)} (R1)`, () => {
      expect(steps(line)).toEqual([[]]);
    });

  it("reads a command's words alone past a bound of its own, so no bound lets a sync through (R1)", () => {
    const many = "--loglevel error ".repeat(63);
    // Past a bound a command that names no sync gives none.
    expect(steps(`npm ${many}exec greenline status`)).toEqual([]);
    expect(steps(`npm ${many}run build`)).toEqual([]);
    // Past a bound a dry run is a sync that writes nothing.
    expect(
      greenlineSyncs(`npm ${many}exec greenline sync --dry-run`).map((sync) => sync.writesNothing),
    ).toEqual([true]);
    // Past a bound the place is the line's own steps; the command's own options place nothing.
    expect(steps(`cd ../a && npm ${many}exec greenline sync`)).toEqual([["../a"]]);
    expect(steps(`pnpm -C ../clone ${"--reporter silent ".repeat(63)}exec greenline sync`)).toEqual(
      [[]],
    );
    // Below the bound nothing changes.
    expect(steps(`npm ${"--loglevel error ".repeat(62)}exec greenline sync`)).toEqual([[]]);
  });

  it("steps over at most eight wrappers before a cd, the SPEC's limit of the shared reader (J-224 S1)", () => {
    expect(steps(`${"command ".repeat(8)}cd ../clone && greenline sync`)).toEqual([["../clone"]]);
    expect(steps(`${"command ".repeat(9)}cd ../clone && greenline sync`)).toEqual([[]]);
  });

  it("reads the script npx's and npm exec's -c or --call take as a command line of its own (E4)", () => {
    expect(steps("npx -c 'greenline sync'")).toEqual([[]]);
    expect(steps("npm exec -c 'greenline sync'")).toEqual([[]]);
    expect(steps("npm x -c 'greenline sync'")).toEqual([[]]);
    expect(steps("npm exec --call 'greenline sync'")).toEqual([[]]);
    expect(steps("npm exec --call='cd ../clone && greenline sync'")).toEqual([["../clone"]]);
    expect(steps("cd /work && npx -c 'cd clone && greenline sync'")).toEqual([["/work", "clone"]]);
    expect(
      greenlineSyncs("npx -c 'greenline sync --dry-run'").map((sync) => sync.writesNothing),
    ).toEqual([true]);
  });

  it("reads the shell's -c beside flags of either case, and no script where no flag holds a c", () => {
    expect(steps("bash -Ec 'greenline sync'")).toEqual([[]]);
    expect(steps("bash -eEc 'cd ../clone && greenline sync'")).toEqual([["../clone"]]);
    expect(steps("bash -lc 'greenline sync'")).toEqual([[]]);
    expect(steps("sh -c 'greenline sync'")).toEqual([[]]);
    expect(steps("bash -E script.sh")).toEqual([]);
  });
});

describe("J-227 S1 a restore is a write, a script's data is no target", () => {
  const ID = "2026-11-09-findbyauthor-ignore-case";
  const STATES = `.greenline/visuals/${ID}/loan-states.md`;
  const writes = (line: string): readonly string[] =>
    shellWrites(line).map((write) => `${write.how}: ${[...write.dirs, write.target].join(" > ")}`);

  it("reads a git restore's working-tree paths and a git checkout's paths after -- as writes (j217c-conduct-runner finding 2)", () => {
    // The run's restore at 001/011, as Claude Code ran it.
    expect(
      writes(
        `git restore -- ${STATES} .greenline/visuals/${ID}/loan-states.visual.json; git status --short`,
      ),
    ).toEqual([
      `a restore: ${STATES}`,
      `a restore: .greenline/visuals/${ID}/loan-states.visual.json`,
    ]);
    expect(writes(`git restore --source=HEAD~1 --worktree ${STATES}`)).toEqual([
      `a restore: ${STATES}`,
    ]);
    expect(writes(`git restore -s HEAD~1 ${STATES}`)).toEqual([`a restore: ${STATES}`]);
    expect(writes("git checkout -- .greenline/visuals")).toEqual(["a restore: .greenline/visuals"]);
    expect(writes(`git checkout main -- ${STATES}`)).toEqual([`a restore: ${STATES}`]);
    expect(writes(`git -C .worktrees/${ID} restore ${STATES}`)).toEqual([
      `a restore: .worktrees/${ID} > ${STATES}`,
    ]);
    expect(writes(`/bin/zsh -lc "git restore ${STATES}"`)).toEqual([`a restore: ${STATES}`]);
  });

  it("leaves the index's restore, a branch checkout, a switch and a merge unread", () => {
    for (const line of [
      `git restore --staged ${STATES}`,
      "git checkout main",
      `git checkout -b greenline/${ID}`,
      "git switch main",
      "git merge --no-edit greenline/other",
      `git add ${STATES}`,
    ])
      expect([line, writes(line)]).toEqual([line, []]);
  });

  /** The two calls the guard refused in j201t-visuals 002/001, as Codex's exec ran them. */
  const MODEL = `.greenline/visuals/2026-11-09-loan-lifecycle-figure/model.js`;
  const SCRATCH = [
    "python3 - <<'PY'",
    "from pathlib import Path",
    "p=Path('.greenline/tmp/2026-11-09-loan-lifecycle-figure')",
    `s=(p/'check-model.mjs').read_text().replace('.greenline/tmp/2026-11-09-loan-lifecycle-figure/model.js','${MODEL}')`,
    "(p/'check-saved-model.mjs').write_text(s)",
    "PY",
    "greenline check --change 2026-11-09-loan-lifecycle-figure --step verify -- node .greenline/tmp/2026-11-09-loan-lifecycle-figure/check-saved-model.mjs",
  ].join("\n");
  const RECORD = ".greenline/ledger/2026-11-09-loan-lifecycle-figure.md";
  const CLOSE = [
    "python3 - <<'PY'",
    "from pathlib import Path",
    `p=Path('${RECORD}')`,
    "s=p.read_text().replace('state: open','state: done')",
    "s=s.replace('<the builder\\'s section>','''`verify`: The saved generator ran successfully and its output matched the earlier page byte for byte (the recorded `node .greenline/visuals/2026-11-09-loan-lifecycle-figure/build.mjs` and `cmp` checks); source preservation is VERIFIED.''',1)",
    "p.write_text(s)",
    "PY",
    "greenline status --change 2026-11-09-loan-lifecycle-figure",
  ].join("\n");

  it("reads a path given as a string replacement's argument as data, and a backquoted span of prose as text (j201t-visuals finding 6)", () => {
    expect(writes(SCRATCH).filter((each) => each.includes(".greenline/visuals/"))).toEqual([]);
    expect(writes(CLOSE)).toEqual([`a script: ${RECORD}`]);
    for (const call of [".replaceAll(", "re.sub(", ".gsub("])
      expect(
        writes(`python3 -c "s = t${call}'x', '${MODEL}'); open('out.txt', 'w').write(s)"`),
      ).toEqual([]);
    // A call a formatter splits over lines is read whole.
    expect(
      writes(
        `python3 - <<'PY'\ns = re.sub(\n    'x',\n    '${MODEL}',\n    t,\n)\nopen('out.txt', 'w').write(s)\nPY`,
      ).filter((each) => each.includes(".greenline/")),
    ).toEqual([]);
  });

  it("still reads a file's rename as a write, os.replace and a path's own replace", () => {
    expect(writes(`python3 -c "import os; os.replace('a.svg', '${MODEL}')"`)).toEqual([
      `a script: ${MODEL}`,
    ]);
    expect(
      writes(`python3 -c "from pathlib import Path; Path('a.svg').replace('${MODEL}')"`),
    ).toEqual([`a script: ${MODEL}`]);
  });

  it("still reads a script that opens the path, and a redirection into the folder, as writes", () => {
    expect(writes(`python3 -c "open('${MODEL}', 'w').write('x')"`)).toEqual([`a script: ${MODEL}`]);
    expect(writes(`python3 -c "open('${MODEL}'.replace('a', 'b'), 'w')"`)).toEqual([
      `a script: ${MODEL}`,
    ]);
    expect(writes(`echo x > ${MODEL}`)).toEqual([`a redirection: ${MODEL}`]);
  });
});

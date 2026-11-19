/**
 * A change record and a visual's manifest written by the agent through a
 * shell command and through the write tool, on Claude Code's and Codex's
 * payload shapes, walked as the pages give it: docs/SPEC.md, §4 "CLI
 * surface", the `greenline event` entry (a write outside the homes refused
 * before the yes, a record a shell command writes naming the session's
 * change, a visual's manifest given its `madeBy`) and
 * corpus/runtime/work.md, "Durable visuals".
 *
 * Each sequence starts on a ground branch with no change open: a code write
 * by the write tool is refused; the record is written and the session's
 * facts name the change; then a visual's manifest is written under the
 * change's own folder in the home is refused, since `greenline picture
 * keep` alone writes there (J-176 S1), while the map's manifest is written
 * and the hooks give it its maker.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  cleanUp,
  fire,
  GROUND,
  type Harness,
  ID,
  RECORD,
  recordText,
  SEQUENCE_TIMEOUT,
  SEQUENCES_OFF,
  shellEvent,
  workspace,
  type Workspace,
  writeEvent,
} from "../../helpers/sequence-workspace.ts";

afterAll(cleanUp);

/** A change's own folder in the home, `greenline picture keep`'s alone (J-176 S1). */
const KEPT = `.greenline/visuals/${ID}/request.visual.json`;
/** The map's folder, which a skill's agent writes under the open change. */
const VISUAL = ".greenline/visuals/map/request.visual.json";

/** Whether the session's facts under the ledger name the change. */
const sessionNames = (space: Workspace): boolean => {
  const folder = join(space.root, ".greenline/ledger/sessions");
  return (
    existsSync(folder) &&
    readdirSync(folder).some((name) => readFileSync(join(folder, name), "utf8").includes(ID))
  );
};

const manifest = (space: Workspace): string =>
  JSON.stringify({
    schema: "greenline.visual/v1",
    title: "The request",
    form: "sequence",
    skill: "diagram-design",
    change: ID,
    commit: space.git("rev-parse", "HEAD").out.trim(),
    files: ["a.txt"],
    made: "2026-10-27",
    summary: "How a request finds a book.",
  });

const MAKER = z.looseObject({ madeBy: z.string().optional() });
const makerOf = (space: Workspace): string | undefined =>
  MAKER.parse(JSON.parse(space.read(VISUAL))).madeBy;

type Channel = "shell" | "write tool";

/** One tool call that writes `path` with `text`, through the channel and on the harness given. */
function written(
  space: Workspace,
  harness: Harness,
  channel: Channel,
  call: string,
  path: string,
  text: string,
) {
  const event = (name: "PreToolUse" | "PostToolUse") =>
    channel === "shell"
      ? shellEvent(space, harness, name, call, `cat > ${path} <<'EOF'\n${text}\nEOF`)
      : writeEvent(space, harness, name, call, path);
  const before = fire(space, harness, event("PreToolUse")).code;
  if (before === 0) space.write(path, text);
  const after = fire(space, harness, event("PostToolUse")).code;
  return { before, after };
}

describe.skipIf(SEQUENCES_OFF)("a record and a visual's manifest written by the agent", () => {
  const cases: Array<[Harness, Channel]> = [
    ["claude-code", "shell"],
    ["claude-code", "write tool"],
    ["codex", "shell"],
    ["codex", "write tool"],
  ];
  it.each(cases)(
    "on %s through the %s: the record written before the yes, the session naming the change, the change's own visual refused and the map's maker stamped",
    (harness, channel) => {
      const space = workspace("path");
      space.git("checkout", "--quiet", "-b", GROUND);
      // No change open: a code write by the write tool is refused before the shell or the file moves.
      if (channel === "write tool") {
        const code = fire(
          space,
          harness,
          writeEvent(space, harness, "PreToolUse", "w0", "src/shelf.ts"),
        );
        expect(code.code).toBe(2);
        expect(code.err).toContain("no change is open");
      }
      // The record, a home, written before the owner's yes.
      const record = written(space, harness, channel, "r1", RECORD, recordText(["state: open"]));
      expect(record).toEqual({ before: 0, after: 0 });
      expect(sessionNames(space)).toBe(true);
      // The owner's yes, then a visual's manifest: the change's own folder refused, the map's written.
      space.write(RECORD, recordText(["choice: accepted", "state: open"]));
      const kept = written(space, harness, channel, "k1", KEPT, manifest(space));
      expect(kept.before).toBe(2);
      expect(existsSync(join(space.root, KEPT))).toBe(false);
      const visual = written(space, harness, channel, "v1", VISUAL, manifest(space));
      expect(visual).toEqual({ before: 0, after: 0 });
      expect(makerOf(space)).toBe("session");
    },
    SEQUENCE_TIMEOUT,
  );
});

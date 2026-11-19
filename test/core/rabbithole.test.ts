import { describe, expect, it } from "vitest";
import { RABBITHOLE_PHRASE, rabbitholeFiles, rabbitholeLine } from "../../src/core/rabbithole.ts";

/**
 * The rabbithole nudge (J-195 S3): the operator's phrase, printed once per
 * change when the same files have been edited three times since the
 * change's last passing recorded check.
 */

const edit = (at: string, ...paths: string[]) => ({ at, paths });

describe("J-195 S3 the rabbithole nudge's threshold", () => {
  it("names a file edited a third time with no passing recorded check, and none before the third", () => {
    const edits = [
      edit("2026-11-07T10:00:00Z", "src/fees.ts"),
      edit("2026-11-07T10:01:00Z", "src/fees.ts", "src/a.ts"),
    ];
    expect(rabbitholeFiles(edits, undefined)).toEqual([]);
    expect(
      rabbitholeFiles([...edits, edit("2026-11-07T10:02:00Z", "src/fees.ts")], undefined),
    ).toEqual(["src/fees.ts"]);
  });

  it("counts only the edits after the last passing recorded check", () => {
    const edits = [
      edit("2026-11-07T10:00:00Z", "src/fees.ts"),
      edit("2026-11-07T10:01:00Z", "src/fees.ts"),
      edit("2026-11-07T10:03:00Z", "src/fees.ts"),
    ];
    expect(rabbitholeFiles(edits, "2026-11-07T10:02:00Z")).toEqual([]);
    expect(rabbitholeFiles(edits, "2026-11-07T09:00:00Z")).toEqual(["src/fees.ts"]);
  });

  it("prints the phrase verbatim with the files and its rule's name", () => {
    expect(RABBITHOLE_PHRASE).toBe(
      "are you in a rabbithole duct taping custom fixes together? is there a native way of doing this that would be cleaner?",
    );
    expect(rabbitholeLine(["src/fees.ts", "src/a.ts"])).toBe(
      `nudge: ${RABBITHOLE_PHRASE} (src/fees.ts, src/a.ts each edited three times since the last passing recorded check); rabbithole, greenline's harness hook`,
    );
  });
});

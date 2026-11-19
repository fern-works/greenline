import { existsSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../../src/core/contract.ts";
import { dealWordsRefusal } from "../../../src/core/deal-ask.ts";
import { designPickLine, parseDesignPick, pickedDirection } from "../../../src/core/design-pick.ts";
import { runDealCli } from "../../../src/shell/cli/deal.ts";
import { runEventCli } from "../../../src/shell/cli/event.ts";
import { dealAskOf, dealDocument } from "../../../src/shell/inspect/interface.ts";
import { RecordingWriter } from "../../helpers/writer.ts";
import { INTERFACE_CHANGE, interfaceWorkspace } from "./interface-fixture.ts";

/**
 * The deal page's pick from the owner's words and its empty state (J-149
 * S4; workshop/components/inspector.md, "The views", the deal): a change
 * that dealt nothing shows "no deal for this change" and offers nothing, the
 * catalog's own three never dealt in its place; a deal answered in the
 * owner's words at the next turn's start writes `design-pick.json` with the
 * words quoted, which the page and the mirror then show; and the deal's
 * hold, a seed the owner's words did not name and a reroll they did not ask
 * for, refused before the shell runs it, the owner's words its exit.
 */

const ID = INTERFACE_CHANGE;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(): string {
  const { root } = interfaceWorkspace();
  roots.push(root);
  return root;
}

const NOTHING = dealAskOf(new URLSearchParams(""));

function fire(root: string, payload: JsonValue) {
  const writer = new RecordingWriter();
  const code = runEventCli(["--harness", "claude-code"], writer.writer, {
    cwd: root,
    stdin: () => JSON.stringify(payload),
    now: () => new Date("2026-10-29T12:00:00.000Z"),
  });
  return { code, out: writer.out, err: writer.err };
}

function deal(root: string, args: readonly string[]): number {
  const writer = new RecordingWriter();
  return runDealCli([...args, "--json"], writer.writer, root);
}

const PICK = (root: string) => join(root, ".greenline", "ledger", ID, "design-pick.json");

describe("J-149 S4 the deal page with no deal", () => {
  it("says there is no deal for the change and deals no three of the catalog's own", () => {
    const root = workspace();
    const page = dealDocument(root, ID, NOTHING);
    expect(page?.dealt).toBe(false);
    expect(page?.directions.available).toBe(false);
    expect(page?.directions.items).toEqual([]);
    if (page === undefined || page.directions.available) throw new Error("a deal");
    expect(page.directions.reason).toMatch(/^No deal for this change/);
    expect(page.pick).toBeNull();
  });

  it("shows the deal the command kept for an address that asks nothing", () => {
    const root = workspace();
    expect(deal(root, ["--job", "sign-up"])).toBe(0);
    const page = dealDocument(root, ID, NOTHING);
    expect(page?.dealt).toBe(true);
    expect(page?.job).toBe("sign-up");
    expect(page?.directions.available).toBe(true);
  });
});

describe("J-149 S4 the pick from the owner's words", () => {
  it("reads one direction from the words by its number, its ordinal or its name, and none from words naming two or none", () => {
    const names = ["paper with hero", "ledger with grid", "dark lanes with split"];
    expect(pickedDirection("Let's go with direction 2.", names)).toBe(2);
    expect(pickedDirection("the third one please", names)).toBe(3);
    expect(pickedDirection("2", names)).toBe(2);
    expect(pickedDirection("I like Ledger with grid best", names)).toBe(2);
    expect(pickedDirection("the second", names)).toBe(2);
    expect(pickedDirection("option 1 or option 3?", names)).toBeUndefined();
    expect(pickedDirection("first, fix the header", names)).toBeUndefined();
    expect(pickedDirection("yes", names)).toBeUndefined();
    // Words that turn one down, or ask, pick none; a name inside another word is no name.
    expect(pickedDirection("not the second one", names)).toBeUndefined();
    expect(pickedDirection("is direction 2 the darker?", names)).toBeUndefined();
    expect(
      pickedDirection("the grid with a ledger with grids", ["ledger with grid"]),
    ).toBeUndefined();
  });

  it("records the pick of a deal answered in words at the next turn's start, the words quoted, once", () => {
    const root = workspace();
    // The turn that deals, then the owner's answer at the next turn's start.
    fire(root, { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "a pricing page" });
    expect(deal(root, ["--job", "sign-up"])).toBe(0);
    fire(root, {
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      prompt: "go with the second one",
    });
    const pick = parseDesignPick(readFileSync(PICK(root), "utf8"));
    expect(pick?.generatedBy).toBe("greenline event");
    expect(pick?.direction).toBe(2);
    expect(pick?.words).toBe("go with the second one");
    const page = dealDocument(root, ID, NOTHING);
    expect(page?.pick?.direction).toBe(2);
    if (pick === undefined) throw new Error("no pick written");
    expect(designPickLine(pick, "")).toContain(
      `picked in the owner's words, "go with the second one"`,
    );
    // A later turn's words do not move a pick that stands for the deal.
    fire(root, { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "direction 3" });
    expect(parseDesignPick(readFileSync(PICK(root), "utf8"))?.direction).toBe(2);
  });

  it("records nothing where the change dealt nothing, nor from words a later turn gave", () => {
    const root = workspace();
    fire(root, { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "the second one" });
    expect(existsSync(PICK(root))).toBe(false);
    // A deal kept from before the turn the words answer is no longer the question.
    expect(deal(root, ["--job", "sign-up"])).toBe(0);
    const old = new Date(Date.now() - 600_000);
    utimesSync(join(root, ".greenline", "tmp", ID, "deal.json"), old, old);
    fire(root, { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "fix the header" });
    fire(root, { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "option 2" });
    expect(existsSync(PICK(root))).toBe(false);
  });
});

describe("J-149 S4 the deal's hold on a seed scan and an unasked reroll", () => {
  it("reads the command's text against the owner's words this turn", () => {
    expect(dealWordsRefusal("npx greenline deal --job sign-up", [], false)).toBeUndefined();
    expect(dealWordsRefusal("greenline deal --seed 7 --json", ["build it"], false)).toMatch(
      /--seed 7 waits: the owner's words this turn name no seed 7/,
    );
    expect(
      dealWordsRefusal("greenline deal --seed 7", ["deal with seed 7"], false),
    ).toBeUndefined();
    expect(dealWordsRefusal("greenline deal --reroll", ["the second"], false)).toMatch(
      /a reroll runs on the owner's word alone/,
    );
    expect(dealWordsRefusal("greenline deal --reroll", ["Reroll"], false)).toBeUndefined();
    expect(dealWordsRefusal("greenline deal --reroll", ["deal again"], true)).toMatch(
      /one reroll was dealt already/,
    );
    // A text that only quotes the command runs no deal.
    expect(dealWordsRefusal("echo 'greenline deal --reroll'", [], false)).toBeUndefined();
    expect(
      dealWordsRefusal('git commit -m "hold greenline deal --reroll to words"', [], false),
    ).toBeUndefined();
  });

  it("refuses an unasked reroll before the shell runs it, and lets it run on the card's answer", () => {
    const root = workspace();
    expect(deal(root, ["--job", "sign-up"])).toBe(0);
    fire(root, {
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      prompt: "show me the deal",
    });
    const command = {
      hook_event_name: "PreToolUse",
      session_id: "s1",
      tool_name: "Bash",
      tool_use_id: "toolu_deal",
      tool_input: { command: "greenline deal --job sign-up --reroll" },
    };
    const refused = fire(root, command);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("; deal-words, greenline's harness hook");
    // The owner's answer on the deal's card asks for it.
    fire(root, {
      hook_event_name: "PostToolUse",
      session_id: "s1",
      tool_name: "AskUserQuestion",
      tool_use_id: "toolu_card",
      tool_input: {
        questions: [
          {
            header: "direction",
            question: "Which?",
            options: [{ label: "Paper (Recommended)" }, { label: "Reroll" }],
          },
        ],
      },
      tool_response: { answers: { "Which?": "Reroll" } },
    });
    expect(fire(root, command).code).toBe(0);
  });
});

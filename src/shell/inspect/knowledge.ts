import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ContractParseFailed } from "../../core/contract.ts";
import { parseDecisionDocument, type RootStatement } from "../../core/root-statements.ts";
import { listMarkdownFiles, readShownFile } from "./repository-read.ts";

/*
 * The knowledge view's data: the homes the work guide names for what
 * outlives a change (`.greenline/WORK.md`, "Repository memory"), read as
 * they stand: the work guide, the decisions book with its root statements,
 * the ADR home and the glossary. A home the repository does not keep is
 * named and never created. Nothing here writes; the decisions book is
 * edited in the repository policy view, which owns that write.
 */

/** A knowledge home by its page name. */
export type HomeId = "work" | "decisions" | "adr" | "glossary";

interface HomeDefinition {
  readonly id: HomeId;
  readonly title: string;
  readonly path: string;
  /** What the home holds, in the work guide's words. */
  readonly role: string;
}

/** The homes in the work guide's order: the guide first, then the decisions, the reasoning and the terms. */
const HOMES: readonly HomeDefinition[] = [
  {
    id: "work",
    title: "Work guide",
    path: ".greenline/WORK.md",
    role: "Where the work's files live and how long each lives, and the settings that shape the loop.",
  },
  {
    id: "decisions",
    title: "Decisions book",
    path: ".greenline/DECISIONS.md",
    role: "Settled product and engineering choices, the root statements, and references to their reasons.",
  },
  {
    id: "adr",
    title: "Decision records",
    path: "docs/adr/",
    role: "Consequential technical reasoning, its alternatives and costs, one record per decision.",
  },
  {
    id: "glossary",
    title: "Glossary",
    path: "GLOSSARY.md",
    role: "The domain's terms, each settled by a change's close.",
  },
];

/** One home as the list shows it. */
export interface HomeSummary {
  readonly id: HomeId;
  readonly title: string;
  readonly path: string;
  readonly role: string;
  readonly present: boolean;
  /** What it holds, counted, such as `3 records`; null when it is absent or cannot be read. */
  readonly holds: string | null;
}

/** The knowledge view's list: every home, present or not. */
export interface KnowledgeList {
  readonly homes: readonly HomeSummary[];
}

/** One ADR of the ADR home. */
export interface DecisionRecord {
  readonly file: string;
  readonly title: string;
  /** The status the record states, as written; null when it states none. */
  readonly status: string | null;
  readonly date: string | null;
  /** The record's text without its front matter; null when it cannot be shown. */
  readonly body: string | null;
  readonly problem: string | null;
}

/** One home as its page shows it. */
export type KnowledgeHome =
  | (HomeSummary & {
      readonly kind: "document";
      readonly id: "work" | "glossary";
      readonly text: string | null;
      readonly problem: string | null;
    })
  | (HomeSummary & {
      readonly kind: "decisions";
      readonly id: "decisions";
      readonly text: string | null;
      /** The root statements of the book's fence; null when the fence does not parse. */
      readonly roots: readonly RootStatement[] | null;
      readonly problem: string | null;
    })
  | (HomeSummary & {
      readonly kind: "records";
      readonly id: "adr";
      readonly records: readonly DecisionRecord[];
      readonly problem: string | null;
    });

function issuesText(error: ContractParseFailed): string {
  return error.issues
    .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
    .join("; ");
}

/** A document split at its front matter: the `name: value` lines between two `---` lines, and the rest. */
interface FrontMatterSplit {
  readonly fields: ReadonlyMap<string, string>;
  readonly body: string;
}

/** A document's front matter, split from its body. */
function frontMatter(text: string): FrontMatterSplit {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (match === null) return { fields: new Map(), body: text };
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(line);
    if (field?.[1] !== undefined)
      fields.set(field[1].toLowerCase(), (field[2] ?? "").replace(/^["']|["']$/g, ""));
  }
  return { fields, body: text.slice(match[0].length) };
}

/**
 * An ADR's facts as its common forms state them: front matter, a
 * `Status:` or `Date:` line, or a `## Status` section's first line.
 */
function recordOf(file: string, text: string | null, problem: string | null): DecisionRecord {
  if (text === null) return { file, title: file, status: null, date: null, body: null, problem };
  const { fields, body } = frontMatter(text);
  const line = (name: string): string | null => {
    const stated = new RegExp(`^\\s*\\**${name}\\**\\s*:\\s*\\**\\s*(.+?)\\s*$`, "im").exec(body);
    if (stated?.[1] !== undefined) return stated[1].replace(/\*+$/, "").trim();
    const section = new RegExp(`^#{2,3}\\s+${name}\\s*\\n+\\s*(.+?)\\s*$`, "im").exec(body);
    return section?.[1] ?? null;
  };
  const title = /^ {0,3}#\s+(.+?)\s*#*\s*$/m.exec(body)?.[1] ?? file.replace(/\.md$/, "");
  return {
    file,
    title,
    status: fields.get("status") ?? line("status"),
    date: fields.get("date") ?? line("date"),
    body,
    problem,
  };
}

function definition(id: string): HomeDefinition | undefined {
  return HOMES.find((home) => home.id === id);
}

function summaryOf(root: string, home: HomeDefinition): HomeSummary {
  if (home.id === "adr") {
    const listed = listMarkdownFiles(root, home.path);
    const count = listed.files.length;
    return {
      ...home,
      present: count > 0 || listed.problem !== null,
      holds: count === 0 ? null : `${count} record${count === 1 ? "" : "s"}`,
    };
  }
  const present = existsSync(join(root, home.path));
  if (!present || home.id !== "decisions") return { ...home, present, holds: null };
  const shown = readShownFile(root, home.path);
  const parsed = shown.text === null ? undefined : parseDecisionDocument(shown.text, home.path);
  const count = parsed?._tag === "ok" ? parsed.value.roots.length : 0;
  return {
    ...home,
    present,
    holds: count === 0 ? null : `${count} root statement${count === 1 ? "" : "s"}`,
  };
}

/**
 * Every knowledge home, present or not, in the work guide's order.
 * @param root the repository root
 * @returns the list
 */
export function knowledgeList(root: string): KnowledgeList {
  return { homes: HOMES.map((home) => summaryOf(root, home)) };
}

/**
 * One home for its page, or undefined when it is no home or the repository does not keep it.
 * @param root the repository root
 * @param id the home's page name
 * @returns the home, or undefined
 */
export function knowledgeHome(root: string, id: string): KnowledgeHome | undefined {
  const home = definition(id);
  if (home === undefined) return undefined;
  const summary = summaryOf(root, home);
  if (!summary.present) return undefined;
  if (summary.id === "adr") {
    const listed = listMarkdownFiles(root, home.path);
    return {
      ...summary,
      kind: "records",
      id: "adr",
      records: listed.files.map((file) => {
        const shown = readShownFile(root, `${home.path}${file}`);
        return recordOf(file, shown.text, shown.problem);
      }),
      problem: listed.problem,
    };
  }
  const shown = readShownFile(root, home.path);
  if (summary.id === "decisions") {
    const parsed = shown.text === null ? undefined : parseDecisionDocument(shown.text, home.path);
    return {
      ...summary,
      kind: "decisions",
      id: "decisions",
      text: shown.text,
      roots: parsed?._tag === "ok" ? parsed.value.roots : null,
      problem:
        shown.problem ??
        (parsed?._tag === "err"
          ? `its root statements do not parse: ${issuesText(parsed.error)}`
          : null),
    };
  }
  return {
    ...summary,
    kind: "document",
    id: summary.id === "work" ? "work" : "glossary",
    text: shown.text,
    problem: shown.problem,
  };
}

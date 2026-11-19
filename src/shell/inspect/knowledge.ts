import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ContractParseFailed } from "../../core/contract.ts";
import { parseDecisionDocument } from "../../core/root-statements.ts";
import type {
  DecisionRecord,
  HomeId,
  HomeSummary,
  KnowledgeHome,
  KnowledgeList,
  RenderedText,
} from "../../core/inspector/documents.ts";
import { readGit } from "../code-tree.ts";
import { repositoryResolver } from "./links.ts";
import { renderDocument, type FenceComponents } from "./markdown.ts";
import { listMarkdownFiles, readShownFile } from "./repository-read.ts";

/*
 * The knowledge view's data: the homes the work guide names for what
 * outlives a change (`.greenline/WORK.md`, "Repository memory"), read as
 * they stand: the work guide, the decisions book with its root statements,
 * the ADR home and the glossary. A home the repository does not keep is
 * named and never created. Nothing here writes; the decisions book is
 * edited in the repository policy view, which owns that write.
 */

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

/** The fence of the decisions book that holds its root statements. */
const ROOTS_FENCE = "greenline-roots";

/** A home's document rendered at its page address, its links resolved from where it stands. */
function renderedHome(
  id: string,
  path: string,
  text: string | null,
  fences: FenceComponents,
): RenderedText | null {
  if (text === null) return null;
  const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const document = renderDocument(text, repositoryResolver(directory), `/atlas/homes/${id}`, {
    fences,
  });
  return { heading: document.title, html: document.html, outline: document.outline };
}

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
  if (text === null)
    return { file, title: file, status: null, date: null, body: null, html: null, problem };
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
    html: renderDocument(
      body,
      repositoryResolver("docs/adr"),
      `/atlas/homes/adr/${encodeURIComponent(file)}`,
    ).html,
    problem,
  };
}

function definition(id: string): HomeDefinition | undefined {
  return HOMES.find((home) => home.id === id);
}

/** When a home was last written, the time of the last commit that touched it; null while none has or git cannot say (J-166 S1). */
function writtenAt(root: string, path: string): string | null {
  const read = readGit(root, ["log", "-1", "--format=%cI", "--", path]);
  if (read._tag === "err") return null;
  const at = read.value.trim();
  return at === "" ? null : at;
}

/** A count with its noun, or null for none. */
function counted(count: number, noun: string): string | null {
  return count === 0 ? null : `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/** What a document home holds, counted: the glossary's terms, the work guide's sections (J-166 S1). */
function documentHolds(id: HomeId, text: string | null): string | null {
  if (text === null) return null;
  if (id === "glossary") {
    const terms = text
      .split("\n")
      .filter((line) =>
        /^\s*(?:[-*]\s+\*\*[^*]+\*\*|#{2,3}\s+\S|\*\*[^*]+\*\*\s*[:.]?)/.test(line),
      ).length;
    return counted(terms, "term");
  }
  return counted(text.split("\n").filter((line) => /^##\s+\S/.test(line)).length, "section");
}

function summaryOf(root: string, home: HomeDefinition): HomeSummary {
  if (home.id === "adr") {
    const listed = listMarkdownFiles(root, home.path);
    const count = listed.files.length;
    const present = count > 0 || listed.problem !== null;
    return {
      ...home,
      present,
      holds: counted(count, "record"),
      written: present ? writtenAt(root, home.path) : null,
    };
  }
  const present = existsSync(join(root, home.path));
  if (!present) return { ...home, present, holds: null, written: null };
  const written = writtenAt(root, home.path);
  const shown = readShownFile(root, home.path);
  if (home.id !== "decisions")
    return { ...home, present, holds: documentHolds(home.id, shown.text), written };
  const parsed = shown.text === null ? undefined : parseDecisionDocument(shown.text, home.path);
  const count = parsed?._tag === "ok" ? parsed.value.roots.length : 0;
  const sections =
    shown.text === null ? 0 : shown.text.split("\n").filter((line) => /^##\s+\S/.test(line)).length;
  const holds = [counted(sections, "section"), counted(count, "root statement")].filter(
    (part) => part !== null,
  );
  return { ...home, present, holds: holds.length === 0 ? null : holds.join(", "), written };
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
      rendered: renderedHome(
        "decisions",
        home.path,
        shown.text,
        parsed?._tag === "ok"
          ? {
              [ROOTS_FENCE]: () =>
                '<p class="roots-note">The root statements block stands here; its roots are the cards above.</p>',
            }
          : {},
      ),
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
    rendered: renderedHome(summary.id, home.path, shown.text, {}),
    problem: shown.problem,
  };
}

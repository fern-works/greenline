// The handoff contract (ADR 0039, the plan's section 1.7): a stage or
// support skill ends with a `## Handoff` section (Consumes / Produces / Next,
// or Returns to / Evidence at), a situational skill with a `Durable output:`
// line, an entry or discipline with neither, and the chain closes: every
// `Next:` names installed roster skills whose own Consumes mentions what was
// produced. The class comes from the manifest.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadCorpusManifest } from "../src/shell/corpus.ts";
import { WORKSPACE_HOME as HOME } from "./lib/workspace-homes.mjs";

const root = resolve("corpus");
const manifest = loadCorpusManifest(root);
if (manifest._tag === "err") throw manifest.error;
const roster = manifest.value.skills.map((skill) => skill.name);
const classOf = new Map(manifest.value.skills.map((skill) => [skill.name, skill.class]));
const ARTIFACT_TOKENS = [
  "spec.md",
  "decisions.md",
  "map.md",
  "initiative.md",
  "TKT-",
  "REV-",
  "RSRCH-",
  "PROTO-",
  "DECISIONS.md",
  ".greenline/diagrams",
  ".greenline/map",
  "evidence",
  "verdict",
  "ticket",
  "review",
  "spec",
  "decision",
  "proposal",
  "report",
];
const STATUSES = new Set([
  "proposed",
  "shaping",
  "decided",
  "specified",
  "planned",
  "executing",
  "reviewing",
  "verifying",
  "complete",
  "draft",
  "ready",
  "claimed",
  "implementing",
  "implemented",
]);

const sections = new Map();
const bad = [];
for (const name of roster) {
  const path = join(root, "skills", name, "SKILL.md");
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  const at = text.lastIndexOf("\n## Handoff\n");
  const durable = /^Durable output: (.+)$/m.exec(text);
  const skillClass = classOf.get(name);
  if ((skillClass === "stage" || skillClass === "support") && at === -1)
    bad.push(`${name}: a ${skillClass} skill ends with a Handoff section`);
  if (skillClass === "situational" && durable === null)
    bad.push(`${name}: a situational skill ends with a Durable output line`);
  if ((skillClass === "entry" || skillClass === "discipline") && (at !== -1 || durable !== null))
    bad.push(`${name}: a ${skillClass} skill carries no handoff section or durable output line`);
  if (at === -1) {
    if (durable) sections.set(name, { durable: durable[1] });
    continue;
  }
  const body = text.slice(at + "\n## Handoff\n".length).trim();
  const field = (label) => {
    const match = new RegExp(`^${label}: (.+)$`, "m").exec(body);
    return match ? match[1] : undefined;
  };
  const section = {
    consumes: field("Consumes"),
    produces: field("Produces"),
    next: field("Next"),
    returnsTo: field("Returns to"),
    evidenceAt: field("Evidence at"),
    text: body,
  };
  sections.set(name, section);
  const role =
    section.produces !== undefined && section.next !== undefined
      ? "workflow"
      : section.returnsTo !== undefined
        ? "support"
        : undefined;
  if (role === undefined)
    bad.push(`${name}: a handoff section needs Produces and Next, or Returns to`);
  for (const match of body.matchAll(/`?(\.greenline\/[^`\s,;)]+?)[;.]?(?=[`\s,;)]|$)/g))
    if (!HOME.test(match[1])) bad.push(`${name}: ${match[1]} is not a workspace home`);
  for (const match of body.matchAll(/\bstatus:? ([a-z]+)/g))
    if (!STATUSES.has(match[1])) bad.push(`${name}: status ${match[1]} is not a lifecycle state`);
}
// A support skill returns evidence to its requester; a workflow stage hands an
// artifact to the next stage, which must list it among what it consumes. A
// Next line may also name disciplines and the close-time harvest; at least one
// named skill must itself carry a section, and the artifact check runs against
// those. A stage whose product stays in the reply hands nothing over.
for (const [name, section] of sections) {
  const lines = [
    { line: section.next, artifact: true },
    { line: section.returnsTo, artifact: false },
  ].filter((entry) => entry.line !== undefined);
  for (const { line, artifact } of lines) {
    if (/\bnone\b/.test(line)) continue;
    const named = roster.filter((skill) => new RegExp(`(?<![\\w-])${skill}(?![\\w-])`).test(line));
    const stage = /request(ing|er)|operator|the owner|the user/.test(line);
    if (named.length === 0 && !stage)
      bad.push(`${name}: Next or Returns to names no roster skill: "${line}"`);
    const withSections = named.filter((target) => sections.has(target));
    if (named.length > 0 && withSections.length === 0 && !stage)
      bad.push(`${name}: hands off to ${named.join(", ")}, none of which has a handoff section`);
    if (!artifact || section.produces === undefined) continue;
    if (/\b(nothing|none|in the reply)\b/.test(section.produces)) continue;
    // An offer hands over an accepted idea, not an artifact the next stage lists.
    if (/\b(accepted|taken up|takes up|on the (user|operator)'s (yes|word))\b/.test(line)) continue;
    for (const target of withSections) {
      const targetSection = sections.get(target);
      if (targetSection.consumes === undefined) continue;
      const produced = ARTIFACT_TOKENS.filter((token) => section.produces.includes(token));
      const consumed = produced.filter((token) => targetSection.consumes.includes(token));
      if (produced.length > 0 && consumed.length === 0)
        bad.push(`${name}: produces (${produced.join(", ")}) and ${target} consumes none of it`);
    }
  }
}
console.log(`${sections.size} handoff sections read`);
if (bad.length > 0) {
  console.error(`handoff contract refused ${bad.length}:\n${[...new Set(bad)].join("\n")}`);
  process.exitCode = 1;
} else console.log("handoff chain closes");

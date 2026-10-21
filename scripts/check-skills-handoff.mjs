// The handoff contract, read by each skill's kind (the plan
// modes-records-recipes, "The roster"; the kinds are the modes definition's,
// `corpus/runtime/modes.json`, and the contract follows each kind's
// mechanism): a skill the mode reaches on the line, a step, ends with a
// `## Handoff` section whose `Next:` names "the next step of the change's
// mode", or none for the line's last step; a skill a request opens, a start,
// ends with one whose `Next:` names the step its handoff reaches, or none; a
// skill that arises on its situation, a habit, carries no Handoff section,
// and may carry a `Durable output:` line. The chain closes: every `Next:`
// names installed roster skills whose own Consumes mentions what was
// produced. The kind comes from the manifest.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { kindNamed } from "../src/core/modes.ts";
import { DOCUMENT_STATUSES } from "../src/core/plan-documents.ts";
import { loadCorpusManifest, loadModes } from "../src/shell/corpus.ts";
import { WORKSPACE_HOME as HOME } from "./lib/workspace-homes.mjs";

const root = resolve("corpus");
const manifest = loadCorpusManifest(root);
if (manifest._tag === "err") throw manifest.error;
const modes = loadModes(root);
if (modes._tag === "err") throw modes.error;
const roster = manifest.value.skills.map((skill) => skill.name);
const kindOf = new Map(manifest.value.skills.map((skill) => [skill.name, skill.kind]));
/** How the loop runs a skill: reach, open or arise, from its kind in the definition. */
const mechanismOf = (name) => kindNamed(modes.value, kindOf.get(name) ?? "")?.mechanism;
const lastStep = modes.value.steps.at(-1)?.name;
const steps = new Set(roster.filter((name) => mechanismOf(name) === "reach"));
// A step skill's handoff names "the next step of the change's mode", never a
// fixed skill (the plan modes-records-recipes, "The roster"): the mode, not
// the skill, decides which step follows.
const NEXT_STEP = /\bthe next step of the change's mode\b/;
const ARTIFACT_TOKENS = [
  "spec.md",
  "decisions.md",
  "map.md",
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
const STATUSES = new Set(DOCUMENT_STATUSES);

const sections = new Map();
const bad = [];
for (const name of roster) {
  const path = join(root, "skills", name, "SKILL.md");
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  const at = text.lastIndexOf("\n## Handoff\n");
  const durable = /^Durable output: (.+)$/m.exec(text);
  const kind = kindOf.get(name);
  const mechanism = mechanismOf(name);
  if (mechanism === undefined)
    bad.push(`${name}: the kind '${kind}' is no kind of the modes definition`);
  if ((mechanism === "reach" || mechanism === "open") && at === -1)
    bad.push(`${name}: a ${kind} skill ends with a Handoff section`);
  if (mechanism === "arise" && at !== -1)
    bad.push(`${name}: a ${kind} skill carries no Handoff section`);
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
  const next = section.next ?? "";
  if (
    mechanism === "reach" &&
    !NEXT_STEP.test(next) &&
    !(name === lastStep && /\bnone\b/.test(next))
  )
    bad.push(`${name}: a ${kind} skill's Next names the next step of the change's mode`);
  const mentions = (names) =>
    names.filter((skill) => new RegExp(`(?<![\\w-])${skill}(?![\\w-])`).test(next));
  if (mechanism === "open" && !/\bnone\b/.test(next) && mentions([...steps]).length === 0)
    bad.push(`${name}: a ${kind} skill's Next names the step its handoff reaches`);
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
    if (!STATUSES.has(match[1]))
      bad.push(`${name}: status ${match[1]} is not a plan document's mark`);
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
    if (artifact && mechanismOf(name) === "reach" && NEXT_STEP.test(line)) continue;
    const names = (skills) =>
      skills.filter((skill) => new RegExp(`(?<![\\w-])${skill}(?![\\w-])`).test(line));
    const named = names(roster);
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

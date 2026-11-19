// The asset-tree rule of the `corpus-optin-assets` row
// (workshop/components/roster-skill.md, "The editing rules every copy
// follows"): a roster skill whose directory holds an asset tree, three or more
// files that are not Markdown, is extra and installs on request, and an extra
// carries files beside its SKILL.md. The threshold is three since S17 of the
// plan modes-records-recipes: the rule exists for large asset trees, and a
// default skill may carry a script or two, as diagnose carries its loop
// template and its pollution script. The visual skills are the one
// exception: the register's row of 2026-10-22 makes every visual source a
// permanent default, none a trial or an extra, so diagram-design,
// architecture-map and anatomy ship their asset trees by default (J-110 S4).

/** The fewest files that are not Markdown that make a skill's directory an asset tree. */
export const ASSET_TREE_MIN = 3;

/**
 * The defaults that ship an asset tree, by the register's row of 2026-10-22:
 * "nothing goes to trial, all the visual systems are done now and
 * permanently part of the greenline agent and system".
 */
export const ASSET_TREE_DEFAULTS = ["diagram-design", "architecture-map", "anatomy"];

/**
 * The skills the asset-tree rule refuses.
 * @param {readonly {name: string, extra?: boolean}[]} skills the manifest's skills
 * @param {(name: string) => {assets: readonly string[], onlySkill: boolean}} directoryOf
 *   a skill's files that are not Markdown, and whether its directory holds its SKILL.md alone
 * @returns {string[]} one message per refusal, empty when the roster keeps the rule
 */
export function assetTreeIssues(skills, directoryOf) {
  const bad = [];
  for (const skill of skills) {
    const { assets, onlySkill } = directoryOf(skill.name);
    const tagged = skill.extra === true;
    if (assets.length >= ASSET_TREE_MIN && !tagged && !ASSET_TREE_DEFAULTS.includes(skill.name))
      bad.push(`${skill.name} ships an asset tree (${assets.length} files) without extra`);
    if (tagged && onlySkill)
      bad.push(`${skill.name} is extra but carries no file beside its SKILL.md`);
  }
  return bad;
}

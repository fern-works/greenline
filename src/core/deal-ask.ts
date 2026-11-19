/**
 * A deal's ask as an address carries it (J-123 S7): the register, the
 * platform, the page's job, the tone, the sector, the material in hand, the
 * seed and the reroll, the same fields `greenline deal` takes. The command
 * prints the deal view's address with them, the view sends them on to its
 * document and its pick, so the viewer deals the three directions the
 * command dealt, the reroll's where one was dealt (J-144 S7). No other query
 * key passes.
 */

/** The ask's keys, in the order an address writes them. */
const DEAL_ASK_KEYS = [
  "register",
  "platform",
  "job",
  "tone",
  "sector",
  "material",
  "seed",
  "reroll",
] as const;

/** The reroll's one value in an address; any other value names no reroll. */
const REROLLED = "1";

/** One ask key. */
type DealAskKey = (typeof DEAL_ASK_KEYS)[number];

/** The ask's fields as the command resolved them; an absent one is left out of the address. */
export interface DealAskFields {
  readonly register: string;
  readonly platform?: string | undefined;
  readonly job?: string | undefined;
  readonly tone?: string | undefined;
  readonly sector?: string | undefined;
  readonly material?: readonly string[] | undefined;
  readonly seed: number;
  /** Whether the deal is the one reroll, whose three the address then names (J-144 S7). */
  readonly reroll?: boolean | undefined;
}

/**
 * The ask's part of a query: its keys alone, each once and not empty, in the
 * ask's order.
 * @param query a query, with or without its leading `?`
 * @returns the ask's query, without a `?`, empty where it holds none
 */
export function dealAskQuery(query: string): string {
  const from = new URLSearchParams(query);
  const kept = new URLSearchParams();
  for (const key of DEAL_ASK_KEYS) {
    const value = from.get(key);
    if (value === null || value === "" || (key === "reroll" && value !== REROLLED)) continue;
    kept.set(key, value);
  }
  return kept.toString();
}

/**
 * The deal view's address for an ask the command dealt.
 * @param change the change's id
 * @param fields the ask
 * @returns `/changes/<id>/deal?register=…&seed=…`
 */
export function dealViewPath(change: string, fields: DealAskFields): string {
  const values = {
    register: fields.register,
    platform: fields.platform,
    job: fields.job,
    tone: fields.tone,
    sector: fields.sector,
    material:
      fields.material === undefined || fields.material.length === 0
        ? undefined
        : fields.material.join(","),
    seed: String(fields.seed),
    reroll: fields.reroll === true ? REROLLED : undefined,
  } satisfies Readonly<Record<DealAskKey, string | undefined>>;
  const query = new URLSearchParams();
  for (const key of DEAL_ASK_KEYS) {
    const value = values[key];
    if (value !== undefined && value !== "") query.set(key, value);
  }
  return `/changes/${encodeURIComponent(change)}/deal?${query.toString()}`;
}

/**
 * The deal view's address for an ask, the reroll's three or the first
 * three: the view's own address with the reroll set or taken out, the rest
 * of its ask kept (J-144 S7).
 * @param change the change's id
 * @param query the ask's query, as `dealAskQuery` keeps it
 * @param reroll whether the address names the reroll
 * @returns `/changes/<id>/deal?…`
 */
export function dealAddress(change: string, query: string, reroll: boolean): string {
  const kept = new URLSearchParams(dealAskQuery(query));
  if (reroll) kept.set("reroll", REROLLED);
  else kept.delete("reroll");
  const text = kept.toString();
  return `/changes/${encodeURIComponent(change)}/deal${text === "" ? "" : `?${text}`}`;
}

/**
 * Whether an ask's query names the reroll.
 * @param query the ask's query
 * @returns true where it carries `reroll=1`
 */
export function namesReroll(query: string): boolean {
  return new URLSearchParams(query).get("reroll") === REROLLED;
}

/** A shell command that runs `greenline deal`, read from its text. */
const RUNS_DEAL = /(?:^|[\s;&|(])greenline\s+deal\b([^;&|\n]*)/;

/** The owner's words that ask for the one reroll: on a card's answer or in a turn's words. */
const ASKS_REROLL =
  /\b(?:re-?roll(?:ed)?|deal again|another deal|deal (?:me )?(?:three )?(?:new|more|other)|(?:three )?(?:new|different|other) directions)\b/i;

/**
 * The refusal of a `greenline deal` the owner's words did not ask for
 * (J-149 S4; the design step's references, the deal; interface-catalog's
 * deal): a `--seed` the owner's words this turn do not name, which a seed
 * scan is, and a `--reroll` they do not ask for or after the change's one
 * reroll was dealt. The deal's three come from the ask the command draws
 * under; the owner's words are the exit.
 * @param command the shell command's text
 * @param words the owner's words this turn: the turn's prompt and each card's answer
 * @param rerolled whether the change's kept deal is its reroll already
 * @returns the refusal's words before its rule, or undefined for a deal that may run
 */
export function dealWordsRefusal(
  command: string,
  words: readonly string[],
  rerolled: boolean,
): string | undefined {
  // A command that only quotes the deal, a message or a search, runs none.
  const args = RUNS_DEAL.exec(command.replaceAll(/'[^']*'|"[^"]*"/g, "''"))?.[1];
  if (args === undefined) return undefined;
  const said = words.join("\n");
  const seed = /--seed(?:=|\s+)(\d+)/.exec(args)?.[1];
  if (seed !== undefined && !new RegExp(`\\bseed\\s*#?${seed}\\b`, "i").test(said))
    return `the deal draws its three from the owner's ask, so greenline deal --seed ${seed} waits: the owner's words this turn name no seed ${seed}; run greenline deal without --seed, and never scan seeds for a deal you like`;
  if (/--reroll\b/.test(args)) {
    if (rerolled)
      return "the change's one reroll was dealt already, so greenline deal --reroll waits: the owner picks from the three dealt or names a direction of their own";
    if (!ASKS_REROLL.test(said))
      return "a reroll runs on the owner's word alone, so greenline deal --reroll waits: the owner's words this turn ask for none; offer the reroll as an option on the deal's cards and run it on that answer";
  }
  return undefined;
}

/**
 * The deal document's address for the view's own address.
 * @param change the change's id
 * @param pageQuery the view's query, `location.search`
 * @param reroll whether the owner asked for the one reroll
 * @returns `/api/changes/<id>/deal`, with the ask and the reroll
 */
export function dealApiPath(change: string, pageQuery: string, reroll: boolean): string {
  const query = new URLSearchParams(dealAskQuery(pageQuery));
  if (reroll) query.set("reroll", REROLLED);
  const text = query.toString();
  return `/api/changes/${encodeURIComponent(change)}/deal${text === "" ? "" : `?${text}`}`;
}

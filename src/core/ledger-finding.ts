/** Structural evidence findings do not adjudicate engineering applicability. */
export interface LedgerFinding {
  readonly kind: "missing" | "reference" | "incomplete" | "contradicted" | "unverified";
  readonly severity: "error" | "warning";
  readonly path: string;
  readonly message: string;
}

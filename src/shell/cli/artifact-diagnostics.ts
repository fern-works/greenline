import { type ArtifactFinding } from "../../core/artifact-audit.ts";
import { GL, diagnostic, type Diagnostic } from "./output.ts";

/** Map collected file failures to GL0201 diagnostics, one per issue. */
export function artifactFailureDiagnostics(
  failures: readonly {
    readonly path: string;
    readonly issues: readonly { readonly path: string; readonly message: string }[];
  }[],
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const failure of failures) {
    for (const issue of failure.issues) {
      diagnostics.push(
        diagnostic(
          GL.artifactFrontmatter,
          "error",
          issue.path === "" ? issue.message : `${issue.message} (field '${issue.path}')`,
          `.greenline/work/${failure.path}`,
        ),
      );
    }
  }
  return diagnostics;
}

/** Map one audit finding to its stable diagnostic. */
export function findingDiagnostic(finding: ArtifactFinding): Diagnostic {
  const code =
    finding.kind === "id-duplicate"
      ? GL.artifactIdDuplicate
      : finding.kind === "reference-unresolved"
        ? GL.artifactReferenceUnresolved
        : finding.kind === "consumption-stale"
          ? GL.artifactConsumptionStale
          : finding.kind === "consumption-ahead"
            ? GL.artifactConsumptionAhead
            : finding.kind === "claim-conflict"
              ? GL.artifactClaimConflict
              : finding.kind === "dependency-cycle"
                ? GL.artifactDependencyCycle
                : finding.kind === "evidence-missing"
                  ? GL.artifactEvidenceMissing
                  : GL.artifactCompleteUnproven;
  return diagnostic(code, "error", finding.message, `.greenline/work/${finding.path}`);
}

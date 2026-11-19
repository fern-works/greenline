import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { homesWorkspace } from "./homes-fixture.ts";

/**
 * The knowledge view through its real seam: the inspector's server over a
 * workspace holding the work guide, the decisions book with its roots
 * fence, an ADR home and a glossary, and over one that keeps only the work
 * guide.
 */

const roots: string[] = [];
const handles: InspectorHandle[] = [];
let url = "";
let bare = "";

beforeAll(async () => {
  for (const homes of [true, false]) {
    const workspace = homesWorkspace(homes);
    roots.push(workspace.root);
    const handle = await startInspector(workspace.root, workspace.env, 0);
    handles.push(handle);
    if (homes) url = handle.url;
    else bare = handle.url;
  }
});

afterAll(async () => {
  for (const handle of handles) await handle.close();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

async function json(base: string, path: string) {
  const response = await fetch(base + path);
  return { status: response.status, body: await response.json() };
}

describe("the knowledge view, served", () => {
  it("S2 lists the homes the repository keeps, in the work guide's order, and names the ones it does not", async () => {
    const { status, body } = await json(url, "api/knowledge");
    expect(status).toBe(200);
    expect(
      body.homes.map((home: { id: string; path: string; present: boolean }) => [
        home.id,
        home.path,
        home.present,
      ]),
    ).toEqual([
      ["work", ".greenline/WORK.md", true],
      ["decisions", ".greenline/DECISIONS.md", true],
      ["adr", "docs/adr/", true],
      ["glossary", "GLOSSARY.md", true],
    ]);
    const kept = (await json(bare, "api/knowledge")).body;
    expect(kept.homes.filter((home: { present: boolean }) => home.present)).toEqual([
      expect.objectContaining({ id: "work" }),
    ]);
    expect(kept.homes).toHaveLength(4);
  });

  it("S2 renders the work guide whole, its title the page's and its sections outlined", async () => {
    const { status, body } = await json(url, "api/knowledge/work");
    expect(status).toBe(200);
    // The guide's own title heads the page, taken out of the body, once.
    const rendered = body.home.rendered;
    expect(rendered.heading).toBe("Work in this workspace");
    expect(rendered.html).not.toContain("Work in this workspace");
    expect(rendered.html).toContain('<h2 data-anchor="plans-and-tickets">Plans and tickets</h2>');
    // The outline opens each section at the home's address.
    expect(rendered.outline).toContainEqual({
      level: 2,
      text: "Plans and tickets",
      anchor: "plans-and-tickets",
    });
  });

  it("S2 renders the decisions book with its root statements as their own component, never as a fence", async () => {
    const { body } = await json(url, "api/knowledge/decisions");
    expect(body.home.roots).toEqual([
      expect.objectContaining({ root: "apps/api", languages: ["typescript"], decision: "#api" }),
    ]);
    expect(body.home.problem).toBeNull();
    const html = body.home.rendered.html;
    // The block stands named where it stood; its roots are the root statement cards.
    expect(html).toContain('class="roots-note"');
    expect(html).not.toContain('data-language="greenline-roots"');
    expect(JSON.stringify(body.home.roots)).toContain("orm-active-record");
    // The book's link to an ADR opens that record in the page.
    expect(html).toContain('<a href="/knowledge/adr/0001-typescript.md">the record</a>');
  });

  it("S2 lists the ADR home's records with their number, title, status and date", async () => {
    const { body } = await json(url, "api/knowledge/adr");
    expect(
      body.home.records.map(
        (record: { file: string; title: string; status: string; date: string }) => [
          record.file,
          record.title,
          record.status,
          record.date,
        ],
      ),
    ).toEqual([
      ["0001-typescript.md", "1. Use TypeScript for the API", "Accepted", "2026-09-01"],
      ["0002-postgres.md", "2. Store sessions in Postgres", "proposed", "2026-09-20"],
    ]);
    const html = body.home.records
      .map((record: { html: string | null }) => record.html ?? "")
      .join("\n");
    expect(html).not.toContain("<script>alert");
  });

  it("S2 renders the glossary, its link into the decisions book opening that heading", async () => {
    const { body } = await json(url, "api/knowledge/glossary");
    expect(body.home.rendered.heading).toBe("Glossary");
    expect(body.home.rendered.html).toContain(
      '<a href="/knowledge/decisions/storage">the decisions</a>',
    );
  });

  it("S2 answers a home it does not keep, and a name that is no home, with 404", async () => {
    expect((await json(bare, "api/knowledge/glossary")).status).toBe(404);
    expect((await json(url, "api/knowledge/..%2F..%2Fetc")).status).toBe(404);
    expect((await json(url, "api/knowledge/%E0")).status).toBe(404);
  });

  it("S2 refuses a home that resolves outside the repository, without its content", async () => {
    const outside = mkdtempSync(join(tmpdir(), "greenline-homes-outside-"));
    roots.push(outside);
    writeFileSync(join(outside, "secret.md"), "# Secret\n\nPrivate sibling witness.\n");
    const root = roots[1] ?? "";
    symlinkSync(join(outside, "secret.md"), join(root, "GLOSSARY.md"));
    const { status, body } = await json(bare, "api/knowledge/glossary");
    expect(status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("Private sibling witness.");
    expect(body.home.problem).toContain("outside the repository");
  });
});

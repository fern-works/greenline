# Academic Papers Search

## When To Use

- Finding academic papers, citations, or formal research
- Building literature reviews or citation chains

Search arXiv, Semantic Scholar, and open-access sources.

## Sources (Priority Order)

1. arXiv API (free metadata)
2. Semantic Scholar API (citation graphs)
3. Unpaywall (legal free version discovery)
4. CORE.ac.uk (open-access aggregator)
5. PubMed Central (biomedical)
6. Author preprint pages, found through the web search

Unpaywall's API asks for an email address with each request: send none of the owner's, and reach Unpaywall's own pages through the web search instead.

## Search by topic or date

Shape the query to the question: a topic, the recent papers of a category sorted by submission date, an author's name, or a topic inside a date window and a category. Start with about twenty results and narrow the query rather than widen the list. Give each result one line: its identifier with its link, its title, its first two authors, its date, its primary category and a one-sentence summary of its abstract. An empty result is reported as "no papers found", with a broader query suggested.

## The citation graph

Follow a paper's citations both ways: the papers it cites, and the papers that cite it, through a service's citation data. Keep to the papers the question needs, read each one's metadata before its text, and stop when a further step adds no claim the question needs. Read the service's limit in its own documentation, leave a gap between calls and back off on a refusal.

## Fallback chain

Read an arXiv paper in the first of these forms that works, in order of quality and token efficiency:

1. **The metadata first**: the abstract page or the API's entry, read before committing to a full fetch
2. **arxiv.org/html** — official HTML, can be auto-converted to markdown
3. **ar5iv** — arXiv Labs HTML renderer, broader coverage for older papers
4. **arxiv.org/pdf**, the last resort, read by the PDF route below

**TeX source**, `arxiv.org/src/<id>`, the tarball the authors submitted, unpacked into the change's working files and its main file read with every file it includes. This is the canonical ground truth: available for *every* paper (even those without HTML renderings), equations are pristine, no third-party dependency. Use it when the paper is math-heavy, when rendered tiers fail, or when you need bibliography entries.

If you only need claims/results, keep the fetched content in a working file and grep/head rather than passing the whole thing to context. The paper is on disk — don't re-fetch.

## PDF Processing

After acquiring a paper URL or local file path, convert
the PDF to markdown for better extraction quality.

Read it through the harness's own document reader where it has one; else in page ranges, twenty pages at a time, where its file reader takes them; else extract its text with the workspace's own tools into the change's working files. Tables and figures will not extract as cleanly: say so where a number came from one.

## Analysis workflow

After fetching, produce a structured summary with these sections:

- **Citation** — authors, title, arXiv ID, year, primary category
- **Problem** — what question the paper answers; why it matters
- **Key claims** — 3-5 bullets, each a specific claim (not a heading)
- **Method** — how they approached it, in 2-4 sentences
- **Results** — what they found; include numbers that matter
- **Limitations** — what the authors admit + what you noticed
- **Open questions** — what's unresolved; what follow-up work would do
- Key equations or formal definitions

## Hard rules

- **Never fabricate results.** If a claim isn't in the paper, say so.
- **PDFs are expensive.** Read a PDF only when every HTML form has failed or the owner asks for it.
- If all sources return zero results, this is stated explicitly
      rather than generating fabricated paper entries

## A paywall

A paper behind a paywall with no open copy is named in the report with the open routes you tried: the author's page, an institutional repository, the open-access aggregators. The owner decides: rent nothing, buy nothing and write to no one, the authors included.

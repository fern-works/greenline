# Design survey: the method

## Choose the mode

Survey the repository whenever its source is at hand: only the source establishes token names and who owns them. Survey a site from its address alone only when no source exists; that needs a browser at a desktop and a phone width, samples up to three pages of different templates from the same site, and writes a draft labelled as reconstructed, since an address cannot show internal names or intent.

## Trace in order

Read, in this order: an existing DESIGN.md and any written guidance; the tokens, themes and global styles; the shared primitives and their variants; the representative pages; and the local styles last. A source counts only when the product imports it or renders it. Write a short hypothesis and what is out of scope before sampling, then sample representative surfaces and say what you left out.

## Measure with your own instrument

Write a small instrument into the project that measures what the sheet asks for, the distinct colours, faces, sizes, radii and spacing steps, and the routes, and declare it as one of the project's checks, so its numbers are recorded at a commit and anyone can run it again. Read the code and the rendered pages both; where they disagree, report both. Hierarchy and density need the rendered page.

## One row per fact

Each fact of the sheet is one row with one source: measured by a command at a commit, read by you from a file, or confirmed by the owner. A candidate value carries its role, its value, its source, its scope, how often it recurs and your confidence; promote a value when the computed and the declared values agree, or when it recurs across the samples.

## Confirm, then write

Put your hypotheses to the owner through cards where they render: the register at each root, the platform, the faces and colours that are the system and the ones that are accidents. Ask before writing where ownership is unclear, and once about any behaviour the product never had. Then write DESIGN.md from the smallest valid front matter, only the sections the evidence supports, in the format's order, its tokens taken only from named shared values, inventing no personality; and write the interface rulings. On an update, compare with the old file and keep every decision the owner accepted.

## Report

The mode, the sources used, the conflicts and omissions kept outside DESIGN.md, the drift the survey found, and the strengths the code already has.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md).

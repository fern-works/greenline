# fail-loud: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/freddie-northam/skills at e8417d4e7724558a4f74a5e9e1854b5dc8350bb9, `skills/fail-loud`. Drift: 7 of 61 lines changed (11%). Records: baseline-copies-2026-09-11.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:aa6b7dd93a5e47ac` in `SKILL.md`

```diff
-name: fail-loud
-description: >-
-  Use when writing a catch block, a default value, a retry wrapper, or a mock
-  outside a test directory; when an external dependency fails during a task; and
-  when a deadline or a demonstration makes a working-looking result tempting.
+name: "fail-loud"
+description: "Use when writing a catch block, a default value, a retry wrapper, or a mock outside a test directory; when an external dependency fails during a task; and when a deadline or a demonstration makes a working-looking result tempting."
```

# airgap-secrets: differences from upstream

Generated from `corpus/ledger/records/`; do not edit.

Source: https://github.com/freddie-northam/skills at e8417d4e7724558a4f74a5e9e1854b5dc8350bb9, `skills/airgap-secrets`. Drift: 14 of 78 lines changed (18%). Records: baseline-copies-2026-09-11, roster-keepers-2026-09-15.

## harness: greenline renders its own frontmatter: quoted name and description, the description from the manifest override where one existed, no upstream activation flag

Record `baseline-copies-2026-09-11`, 1 hunk.

### `h:84cdad50414761ab` in `SKILL.md`

```diff
-name: airgap-secrets
-description: >-
-  Use whenever a task touches a .env file, a key, a token, or a credential:
-  reading configuration, writing client-side code, staging a commit, building a
-  container image, or handling a leak that was just found.
+name: "airgap-secrets"
+description: "Use whenever a task touches a .env file, a key, a token, or a credential: reading configuration, writing client-side code, staging a commit, building a container image, or handling a leak that was just found."
```

## correction: the secret-class probe pipes its matches through a substitution that replaces the value with the label <live-class value>, so the output names the variable and the class and never the matched bytes; the explanatory sentence states the same (J-8, 2026-09-15)

Record `roster-keepers-2026-09-15`, 2 hunks.

### `h:4637a031463c1488` in `SKILL.md`

```diff
-grep -oE '^[A-Z_][A-Z0-9_]*=(sk_live|sk_test|pk_|whsec_|SG\.|AKIA|-----BEGIN)' .env
+grep -oE '^[A-Z_][A-Z0-9_]*=(sk_live|sk_test|pk_|whsec_|SG\.|AKIA|-----BEGIN)' .env | sed -E 's/=.*/=<live-class value>/'
```

### `h:15de36e760db1263` in `SKILL.md`

```diff
-The third command matters most: it names the credential class each variable
-holds, and a live key in a development environment is the common real fault.
+The third command matters most: it names each variable whose value is of a
+live credential class and prints a label in place of the value, and a live
+key in a development environment is the common real fault.
```

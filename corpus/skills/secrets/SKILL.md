---
name: "secrets"
description: "Use when a .env file, a key, a token or a credential is in reach: read for configuration, written into client-side code, staged in a commit, built into a container image, or possibly leaked. A commit or an image with no secret in reach does not call for it."
---

# Secrets

secrets is the habit for the moment a secret is in reach: a key, a token, a credential or a `.env` file that the work reads, writes, stages in a commit or builds into an image, or a credential that may have leaked, at whatever step the work is in. A commit staged or an image built with no secret in reach does not load it. It writes no record of its own, and nothing it reads enters a record. Secrets or security is a floor in AGENTS.md: found before the mode is proposed, it raises the proposal to the mode that floor names, and found later it is reported.

Before a secret is read, staged or built into an image, read [method.md](method.md): the rule, each boundary's guard, reading out of the file, the check before every commit and the leak.

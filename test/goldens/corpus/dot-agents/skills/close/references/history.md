# History cleanup

Close reads this page when the owner asks for the change's commits to be regrouped before its pull request, and the change's record holds the owner's words for that rewrite. On this page the user is the owner, and the PR is the change's branch with its pull request.

Only rewrite history when the user asks for it or agrees to the plan.

Propose the new grouping to the owner first. Before rewriting, read the tree the change's checks ran on, `git rev-parse HEAD^{tree}`, and keep it.

Good commit groupings usually follow dependency order:

1. Schema/storage or generated API definitions.
2. Core logic.
3. Wiring and integration.
4. UI or surface behavior.
5. Tests.

After rewriting, verify content identity:

`git rev-parse HEAD^{tree}` after the rewrite names the tree read before it, byte for byte.

Do not push if the tree changed unintentionally.

A tree that changed stops the cleanup and the landing: say so, and the owner decides. A force push of a branch already pushed waits for the owner's words for both the rewrite and the push.

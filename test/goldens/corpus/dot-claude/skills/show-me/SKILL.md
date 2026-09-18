---
name: "show-me"
description: "Explain the current topic visually in the reply: pseudocode, call trees, component trees, shallow file trees, shape diffs, and diagrams or a one-file HTML view where a renderer exists. Use whenever a reply would walk through a flow, a hierarchy, a state machine, a comparison, or a change to an existing shape, and whenever the user asks to be shown."
---

Answer first, then show. The visual sits beside the answer, in a form the current client renders in the reply; answer-plainly governs the claim, unslop the surrounding prose, and the visual earns its place only when it makes the explanation clearer. Apply this on your own whenever a reply would walk through a flow, a hierarchy, a state machine, a comparison or a change to an existing shape, and whenever the user asks to be shown. A read-only explanation creates no repository artifact: it lives in the response or in a capture outside the repository. A durable diagram the user did not ask for is offered in one line. On the user's ask or yes, `diagram-design` (opt-in) draws it when it is installed; when it is not, draw the diagram as text into the repository's existing docs home and name `diagram-design` as the optional method for a rendered one.

Help the user understand the current topic of conversation visually. Skip the preamble and keep prose brief. Pick the smallest view that makes the key point clear.

- Show logic or an algorithm as pseudocode:

```text
on(save)
  if content is unchanged
    return cached result
  write new content
  return fresh result
```

- Show runtime control flow as a call tree:

```text
submitForm
  createSession
    persistPrompt
    launchAgent
  navigateToSession
```

- Show UI structure as a component tree, including state and module boundaries that matter:

```tsx
<SessionPage> (apps/example/src/routes/session.tsx)
  useSessionEvents()
  <SessionToolbar>
    <RunSkillButton> (packages/ui)
```

- Show file responsibility or a broad refactor as a shallow file tree:

```text
src/
├── commands/       # parses user actions
├── sessions/       # owns session state
└── transport/      # sends API requests
```

- Use `diff` when the point is what changes and the surrounding shape already exists. Match the diff shape to the topic.

For a component change:

```diff
 <SessionPage>
   useSessionEvents()
   <SessionToolbar>
+    <RunSkillButton />
   <SessionTimeline>
+    <SkillResultCard />
```

For a file-layout change:

```diff
 src/
 ├── commands/
+│   └── show-me.ts       # expands the slash command
 ├── sessions/
-└── transport.ts
+└── transport/
+    ├── client.ts
+    └── stream.ts
```

For a call-tree or call-stack change:

```diff
 submitForm
   createSession
     persistPrompt
+    expandSkillMention
     launchAgent
-  navigateToSession
+  navigateToSession
+    subscribeToEvents
```

For a state or control-flow change:

```diff
 on(save)
-  write content
+  if content is unchanged
+    return cached result
+  write new content
+  invalidate cache
```

- Show the whole block when most of it is new, when omitted context would hide ownership or order, or when the user needs a copyable target shape:

```ts
function expandSkill(command: string): string {
  const skillName = command.slice(1)
  return `use the ${skillName} skill`
}
```

- For a visual UI, layout, state comparison, or concept too dense for a text view, write one focused HTML file, a diagram, an infographic, or a short slide deck, whichever fits the point. Match the product's colors, type, spacing, and components; use real labels and data; support desktop and mobile. During authorized artifact work the file is scratch under `.greenline/tmp/show-me/`; a read-only explanation writes it outside the repository. Then open it for the user with the harness's shell tool:

```
open .greenline/tmp/show-me/{description}.html
```

### guidance

Place each visual next to the short text it supports. Keep only the calls, files, props, states, and boundaries needed to answer the user's current question or the options to resolve the current discussion point.

You may use one of these, you may use several, it is unlikely you will use all of them. Use your judgement and don't overwhelm the user.

Durable output: none unless the user asks (a visual in the reply; scratch under `.greenline/tmp/show-me/` during authorized artifact work). A durable diagram the user did not ask for is offered in one line; on the ask or the yes, `diagram-design` (opt-in) draws it when installed, otherwise a text diagram goes into the repository's existing docs home and the optional method is named. answer-plainly governs the claim, unslop the prose.

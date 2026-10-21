---
name: "show-me"
description: "Explain the current topic visually in the reply: pseudocode, call trees, component trees, shallow file trees, shape diffs, and diagrams or a one-file HTML view where a renderer exists. Use whenever a reply would walk through a flow, a hierarchy, a state machine, a comparison, or a change to an existing shape, and whenever the owner asks to be shown."
---

# Show me

show-me is the habit for the moment a reply would walk through a flow, a hierarchy, a state machine, a comparison or a change to an existing shape, and for the owner asking to be shown, at whatever step the work is in or in a plain answer. It applies on your own judgment, unasked, and it writes no record of its own: the visual sits in the reply, beside the answer, in a form the current client renders, and earns its place only when it makes the explanation clearer. Answer first, then show: the prose habit governs the claim and the prose around the visual. A durable diagram the owner did not ask for is offered in one line. On the ask or the yes, `diagram-design` (extra, installs on request) draws it where it is installed; where it is not, offer it as AGENTS.md says, or draw the diagram as text into the repository's existing docs home.

Greenline's paths and commands for this skill stand on its references page, [references/greenline.md](references/greenline.md): read it when the work lands in the workspace.

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

- For a visual UI, layout, state comparison, or concept too dense for a text view, write one focused HTML file, a diagram, an infographic, or a short slide deck, whichever fits the point. Match the product's colors, type, spacing, and components; use real labels and data; support desktop and mobile. During a change the file is one of the change's working files; a plain answer writes it outside the repository. Then open it for the user with the harness's shell tool:

```
open .greenline/tmp/<id>/{description}.html
```

### guidance

Place each visual next to the short text it supports. Keep only the calls, files, props, states, and boundaries needed to answer the user's current question or the options to resolve the current discussion point.

You may use one of these, you may use several, it is unlikely you will use all of them. Use your judgement and don't overwhelm the user.

Durable output: none. The visual lives in the reply, and an HTML view in the change's working files under `.greenline/tmp/<id>/`, deleted when the change closes.

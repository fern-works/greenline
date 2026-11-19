# Show me: the method

The kind is yours to choose: the table of kinds below is a menu, and you may go past it where another kind fits. It applies on your own judgment, unasked, and it writes no record of its own: the picture sits in the reply, beside the answer, in one of six forms, pseudocode, a call tree, a component tree, a file tree, a shape diff or a box drawing, at most 72 columns and twelve nodes, a count you make before you draw, and earns its place only when it makes the explanation clearer. Answer first, then show: the block's reply section governs the claim and the words around the picture.

## When to draw: the turn and the shape

Find the turn down the side and the shape the reply explains across: the cell is the form to draw, or none. A question about how something works is an explanation, never a plain answer. Draw the part that decides, within twelve nodes and 72 columns.

| The turn | A flow or a sequence | A set of states | A hierarchy | The parts and their joins | A change to a shape | An algorithm |
| --- | --- | --- | --- | --- | --- | --- |
| A plain answer | none | none | none | none | none | none |
| A proposal | call tree | box drawing | file tree | component tree | shape diff | pseudocode |
| A build turn that moved code | call tree | box drawing | file tree | component tree | shape diff | pseudocode |
| An explanation | box drawing | box drawing | file tree | component tree | shape diff | pseudocode |
| A close | none | none | none | none | shape diff | none |

One offer per change, no more: where the shape a turn wants passes twelve nodes or 72 columns, draw the part that decides and offer the whole once in the change, in one line, `Picture offered: <what it would show>, <form>, <finish>; say keep`, its finish text, branded SVG or interactive, and never offer a lost picture's remake, which is the owner's ask alone. A lasting visual is made only on the owner's ask, by a fresh agent the change's build or its close starts with the skill's brief, at every mode, since an agent a method starts stands outside the mode's count of agents, and the session draws only inline; when it returns, give the owner the address the viewer serves for the visual.

## The kinds of lasting visual

| The shape | Inline | The durable kind and its skill | Its permanent home |
| --- | --- | --- | --- |
| a flow, a request's path | a call tree or a box drawing | a sequence diagram, `diagram-design` | a subsystem's journey in the atlas |
| parts and their calls | a component tree or a box drawing | an architecture diagram, `diagram-design` | the map, `architecture-map` |
| a change's shape | a shape diff | the change's diagram, `diagram-design` | under the change |
| the change in the whole | none | the atlas's map with the changed parts marked, `diagram-design` | under the change |
| a data model | a box drawing | an entity diagram, `diagram-design` | a subsystem's journey |
| states | a box drawing | a state chart, `diagram-design`, the start `verify-formally`'s check offered after it | a subsystem's journey |
| a decision's options | a shape diff | the decision's diagram, `diagram-design` | under the change |
| a plan | a file tree | the plan's diagram, `diagram-design` | under the planning change |
| a concept | pseudocode | an explanatory figure, `anatomy` | under the change |
| the interface | none | the captures of the interface check | under the change |
| the repository | a file tree | the map and its pages, `architecture-map` and the `explain` start | the atlas |

The table is a menu, never a limit: on the owner's ask, make what fits the shape, another kind included.

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

- For a visual UI, layout, state comparison, or concept too dense for a text view, write one focused HTML file, a diagram, an infographic, or a short slide deck, whichever fits the point. Match the product's colors, type, spacing, and components; use real labels and data; support desktop and mobile. During a change, a view is a durable visual: on the owner's ask a fresh agent makes it under the change in the visual home with its manifest, where the inspector shows it, and the harness's shell tool can open it:

```
open .greenline/visuals/<id>/{description}.html
```

- Draw a flow, layers, a sequence, a state chart, a class or a deployment as a box picture in text when it explains better than the views above, by the drawing page, [drawing.md](drawing.md): the kind from what you show, at most 72 columns and twelve nodes, the code's own names, three weights and arrows that do not cross.

### Where it renders

The six forms are text, so they render on every surface. A mermaid block renders only where the status line says `renders mermaid`; anywhere else the owner sees its source, so draw the box drawing in its place, and in a headless run never print a mermaid block alone.

| Surface | A mermaid block | The six forms |
| --- | --- | --- |
| Claude Code in a terminal | its source | rendered |
| Claude Code's desktop app, VS Code extension and mobile | its source | rendered |
| The Codex desktop app | rendered | rendered |
| The Codex CLI | its source | rendered |
| A headless run of either | its source | rendered |
| Another harness | its source, unless the status line says otherwise | rendered |

### guidance

Place each visual next to the short text it supports. Keep only the calls, files, props, states, and boundaries needed to answer the user's current question or the options to resolve the current discussion point.

You may use one of these, you may use several, it is unlikely you will use all of them. Use your judgement and don't overwhelm the user.

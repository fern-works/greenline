# Drawing a picture in text

This page is how show-me draws a box picture in the reply: boxes, lines and arrows made of text characters, which read the same on every surface that shows the reply in a fixed-width font. Read it when a reply would draw boxes and arrows rather than one of `SKILL.md`'s text views; whether to draw, and in which form, is the table of the turn and the shape on [method.md](method.md).

## Pick the kind from what you show

| What the reply shows | Draw |
| --- | --- |
| steps and the decisions between them | a flow |
| a whole and its parts | a tree |
| a stack of levels, each using the one below | layers |
| messages between parts, in time order | a sequence |
| states and the events that move between them | a state chart |
| things and how they connect | a relationship picture |
| before and after, or options side by side | a comparison |
| a loop whose output feeds its input | a cycle |
| a choice along two axes | a matrix |
| events in order | a timeline |
| a type with its fields and methods | a class box |
| components and the wiring between them | a component picture |
| what runs where | a deployment |
| who does what with the system | a use case picture |

## Keep it within the bounds

- At most 72 columns on every line, so a narrow pane, a terminal and a PR body show it unwrapped.
- At most twelve nodes. A larger subject splits inline into an overview of its parts and one picture per part, each beside the sentence it explains, only while each part keeps these caps; where a part would not, draw the part that decides and never past them: past the caps stands method.md's one offer, and a lasting visual is the owner's ask.
- Every label is the name the code uses: the function, the file, the state, the table, the endpoint. Never paraphrase a name; when a label is too long for its box, widen the box and narrow its neighbours.
- Keep labels short around the names: a long label breaks the alignment of every line it crosses.

## Give each weight one meaning

- Heavy or double lines for the one part the reader should watch.
- Single lines for the structure.
- Dashed lines for what is optional, asynchronous or removed.

A weight that means nothing is decoration: stars, nested frames and emphasis on every box hide the point, so leave them out.

## Draw the arrows so they read

- One arrowhead style in a picture: `──►` and `▼`, or `->` and `v` in plain ASCII.
- Flow runs left to right or top to bottom; an edge that goes back is routed around the outside, never across the picture.
- Lines do not cross. When two would, move a node or split the picture in two.
- Label an edge only when it means something its target does not already say.

## Group what belongs together

Enclose related nodes in one box with a title, and keep unrelated ones apart: nearness and enclosure carry the grouping, so the picture needs no legend. Add a legend only for a symbol the picture cannot do without.

## The characters

```text
light     ┌─┬─┐  │  ├─┼─┤  └─┴─┘
rounded   ╭───╮  ╰───╯
heavy     ┏━┳━┓  ┃  ┗━┻━┛
double    ╔═╦═╗  ║  ╚═╩═╝
dashed    ┄┄┄  ┆
arrows    ──►  ◄──  ◄──►  ▲  ▼
tree      ├──  └──  │
ascii     +--+  |  -->  <--  v  ^
```

Draw with the ASCII set when the surface may not render box drawing, such as a terminal whose font lacks it.

## The forms

Each form is the smallest that shows its kind: take its shape and give it the code's names.

A flow with a decision:

```text
┌──────────┐    ┌──────────────┐ yes ┌────────────┐
│ readSave │───►│ isUnchanged? │────►│ cachedFile │
└──────────┘    └──────┬───────┘     └────────────┘
                       │ no
                       ▼
                ┌────────────┐
                │ writeFile  │
                └────────────┘
```

Layers:

```text
┌─────────────────────────────┐
│ routes/     http handlers   │
├─────────────────────────────┤
│ services/   the domain      │
├─────────────────────────────┤
│ store/      the database    │
└─────────────────────────────┘
```

A sequence:

```text
 client           api             db
   │  POST /save   │               │
   │──────────────►│  INSERT       │
   │               │──────────────►│
   │               │◄──────────────│
   │◄──────────────│               │
   │  201          │               │
```

A state chart, its one back edge routed around the outside:

```text
┌───────┐ submit ┌─────────┐ approve ┌──────────┐
│ draft │───────►│ pending │────────►│ approved │
└───────┘        └────┬────┘         └──────────┘
    ▲                 │ reject
    └─────────────────┘
```

A class box and its relation:

```text
┌───────────────┐ 1     * ┌─────────────────┐
│ User          │─────────│ Order           │
├───────────────┤         ├─────────────────┤
│ id: int       │         │ id: int         │
│ email: string │         │ total: number   │
├───────────────┤         ├─────────────────┤
│ login(): bool │         │ total(): number │
└───────────────┘         └─────────────────┘
```

A deployment, the asynchronous edge dashed:

```text
          ┌───────────────┐
          │ load balancer │
          └───────┬───────┘
          ┌───────┴───────┐
          ▼               ▼
     ┌─────────┐     ┌─────────┐
     │ web-1   │     │ web-2   │
     └────┬────┘     └────┬────┘
          └───────┬───────┘
                  │
           ┌──────▼─────┐ replicate ┌────────────┐
           │ primary db │┄┄┄┄┄┄┄┄┄┄►│ replica db │
           └────────────┘           └────────────┘
```

The other kinds keep the same parts: a tree is the shallow file tree of `SKILL.md`; a component picture is the deployment's boxes and lines, one box per component; a comparison is two boxes side by side whose rows line up; a cycle is a flow whose last arrow returns around the outside; a matrix is a table; a timeline is one vertical line with a `├──` entry per event; a use case picture is the actors on the left and the system's box with its actions inside.

## Check it before you send it

- Draw it in a fenced `text` block, so it keeps its fixed-width font, right after the sentence it explains.
- Count the widest line: 72 columns at most. Close every box and line up every column.
- Read it once as the owner would, without the code beside it: does it answer the question the sentence raised? If it does not, cut it or change its kind.

# The interface practice

When a change touches what a person sees and uses, a page, a screen, a
component or the copy on it, the agent works on it with a practice of its
own: it says so in the proposal, settles how it looks before the plan,
checks it in code at three widths, reviews it with fresh eyes and keeps
pictures of the result. You decide, you pick and you talk; the agent does
the rest.

## Where the interface is

`greenline init` and `greenline sync` look for an interface in the
repository: the folders that hold its files, the platform (web, iOS,
Android, a cross-platform app or a desktop app) and the frameworks. They
write what they find into `.greenline/manifest.json`, in its `interface`
block, with the evidence for each fact. Your agent confirms these with you
in the first interface change, and once you have, sync leaves the block as
it is. `greenline status` prints one line about the interface: what it is,
the register of each folder (a site or an app), and whether the design home
exists.

## The fact in the proposal

Every proposal says whether the change touches an interface:
`interface: no`, or `interface: yes` with the register, site or app. The
record keeps that line. A change that says no and then writes a file of the
interface is refused at that write, so the agent proposes again rather than
slipping a screen into a change you agreed was something else.

At the first request that touches a page or a screen, where the workspace
names no interface yet, the same proposal offers the interface setting in
your words: the folders your pages live under, and whether the check holds
each change. The agent writes it only on your yes, and before any build.
A request to change how a working page looks while it keeps what it does,
such as "make the list denser" or "like another product", is a redesign:
the `redesign` start runs first, capturing the page as it stands and
writing the list of what must survive, before any edit.

## The design step

The line gains a step between frame and plan, `design`, which runs only
where the fact is yes:

| Mode    | What the design step does                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| quick   | the agent reads the design home and works inside it; one line in the record                                                                                                                                                                                                                                                                                                                      |
| regular | where the home already fixes a direction, it reads it and deals nothing; otherwise it asks you once (who the page is for, its one action, its tone, what material you have), deals three directions on cards where they render, one card per direction with the reroll on it, shows them as something you can see, and writes the one you pick; a direction of your own is your answer on a card |
| careful | a fresh agent composes the direction or prototypes it on the real page, and you pick from what it shows                                                                                                                                                                                                                                                                                          |

At regular and careful the step waits for your pick before anything is
built: a direction the agent composed is never yours, and a product you
name as a likeness, "like Linear", names a direction to deal, never a
pick. Where the change touches no interface, the design section is one line and
costs nothing: the agent does not read the design skill there. With the [catalog](./interface-catalog.md) installed, the
three directions are dealt from it; without it, the agent composes them from
the material you have and the job the page does.

## The checks

The interface rules are checked in code, with no model, on the files the
change touches. Each rule has one of three tiers:

- **floor**: accessibility, honesty and a layout that holds, such as text
  contrast, a visible focus, a label on every control and a page that does
  not scroll sideways at a phone's width. The rule that a control's name
  holds the label it shows reads a native select's label from its
  `<label>`, its `aria-labelledby` or its `aria-label`, never from the
  options it lists, so a select labelled "Status" with Backlog, In Progress
  and Done among its options passes. A floor finding is red until you
  rule on it: the agent asks you on a card before verify passes, and writes
  your answer in the record's `## Interface` section, `fixed` once it is
  fixed or `waived` with your words, which clears it for that change alone.
  [The change does not close while a floor finding named there has no
  answer of yours, and no standing waiver clears a floor.]{claim: A floor finding holds the close until the owner rules on it}
- **reflex**: a default, such as `transition: all`, a stock violet accent or
  a shadow on a resting card. A reflex finding is red until the record
  waives it with your words, `waived: <rule>: <reason>; the owner's yes:
"<your words>"`, or a standing waiver in your rulings covers it. Where the
  agent reads a reflex finding as a false alarm, it asks you once for the
  whole workspace, in your terms and never by the rule's name, such as "The
  style check flags the seven lines that define your colours, a false alarm.
  Shall I tell it to ignore them for this site?". Your yes becomes a standing
  waiver in the `## Interface` rulings, so no later change asks again, and
  the agent never tells you to leave a file of yours alone.
- **finish**: craft that is listed and never blocks.

`greenline check interface` runs them and writes the findings by tier under
the change's folder. It never reads a file under `.greenline/`, so the
captures your agent keeps there are never taken for page code, whatever
your roots. The survey that confirms the manifest's `interface` block asks
you once whether this check holds the close, and writes your answer as
`check`. Set `check` to true in the manifest's `interface` block
and every interface change is held to it as one of the declared checks, its
runs recorded through `greenline check -- greenline check interface`: the
commit that closes the change is refused while its latest run is red. In
Claude Code the agent also gets the findings back right after it writes an
interface file, through a shell command too.

At verify, `greenline check interface --url <the app's address> --path
<the page>` [opens the running page in a Chrome or Chromium you already have,
at 1440, 768 and 390 wide]{claim: At verify each page a change touched is read in a browser at three widths}, with reduced motion, dark where your design home
declares a dark scheme, and once more at 320 for the floor. It measures the
rules that need a rendered page (contrast on the page, overflow, focus,
target sizes, headlines, images that fail to load, console errors) and keeps
the first screen and the full page at each width as a picture under the
change. Where no browser is found, it says so, and the floor is checked in
the code alone. Set `GREENLINE_CHROME` to a browser's path to
choose one. Each load waits for the page to be ready and its network to
settle, so a page with a frame or a request that never ends is still read;
a page that does not arrive in thirty seconds is named with what did not
arrive. The browser closes when the command ends, a timeout or an error
included, so none is left running behind it, and it never asks your
keychain for anything, so a home with no keychain, as a coding agent's own
home may be, does not stall it.

The address is your app's, never the viewer's: give it with `--url`, or
name it once in the record's `## Interface` section, `- app
http://127.0.0.1:3000`, and give `--path` alone. The viewer's own address
is refused in one line. A picture the command cannot take, because the
page did not load in time, nothing answers at the address, or no browser
starts, is kept as a limit with its cause, the address tried and the time:
the command prints it, `greenline status` names it, and the Interface view
shows it on the page's card.

With the check on, the change does not close until each page it touched
has been through this command since its files last changed: the commit
that sets it done is refused while a page has neither its pictures at
the three widths nor a limit your agent named for you in the record's
`## Interface` section, in its own words, such as `- limit /members: the
members page was not captured; the browser timed out, so I read it in
your browser instead`, beside the limit the command kept; words with no
limit kept behind them settle nothing, and `greenline status` lists the
pages still owed. A page is read from the file's path: a
folder under `app`, a file under `pages`, or an HTML file. A server's
template, such as a Django page under `templates/`, is read from the
route your app serves it at, never its path: the record's `## Interface`
section names it, `- page /: tally/templates/tally/home.html`, and a
template no page line names is named by the check and not held. A shared
component, or a stylesheet outside those folders, waits for one page to
be rendered after it changed. On a platform no browser renders, such as a
React Native app, the hold engages all the same: each screen the change
touched waits for `greenline check interface --path <the screen>`, which
records that no browser renders it, the floor checked in the code alone.

## The review

At review, the reviewer, a fresh agent where the mode starts one, reads the
change's design section and the critique page, which its brief carries,
before it reads the check's output, and answers with a one-word verdict that cites the rules by name.

## Where you see it

`greenline status` prints the interface line and the drift between the code
and the design home, and the status line the agent reads at each message
adds the latest check's counts, the pages still owed their pictures and a
pick waiting in the deal view. The inspector shows a
change's direction and its check by tier on the change page, the three
directions of a deal side by side with a button to pick one, and, in the
Interface place, each page of the interface with its captures and scores
over time, your notes and the catalog ([the inspector](./inspect.md)). On a capture you can mark
what is wrong or wanted, and the agent addresses it ([marks](./marks.md)).

## The design home

Your design system and your taste live in the repository, in DESIGN.md and
in the decisions book; [the design home](./interface-home.md) says what each
holds.

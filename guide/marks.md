# Marks

A mark is your note on a page the agent captured. You point at one thing,
say what is wrong or what you want, and the agent sees it at its next turn.
[It fixes the thing you pointed at, shows you before and after, and closes
the mark only when you say so.]{claim: A mark closes only on the owner's verdict}

## Make a mark

1. Run `greenline inspect` and open Interface, its **Pages** tab.
2. Open a capture from a mark or a page's history, or give the address of
   your running page under **Capture now**. greenline captures it at 1440,
   768 and 390 wide, with the box of every element on the page.
3. Pick a width. With the **Picker**, click an element: the viewer shows
   what it is, its text, and the file and line it came from where your
   framework's development build says so: React 18's, react-dev-inspector's,
   Vue's or Svelte's; React 19 and a production build say nothing, and the
   agent finds the element by its place on the page. With the **Pencil**, draw round a
   region instead; the viewer names the elements under the stroke.
4. Write what is wrong or wanted, choose an intent and save:
   - **fix**: something is wrong with it.
   - **question**: you want an answer about it.
   - **options**: you want to see a few versions of it.
   - **idea**: something to consider, not yet a request.

The mark is saved under `.greenline/ledger/`, in the folder of the change
open on that page, or with the interface's files when none is.

## What the agent does

At its next turn the status line tells the agent how many marks are open
and on which pages. If you have not asked, it offers to address them in
one sentence. Or say "fix the marks" yourself.

The agent finds each element by its file and line or by its place on the
page, and changes only what the note asks. For an **options** mark it
builds the versions on the real page, behind a switcher, so you pick one in
your browser; your pick becomes the code. A **question** gets an answer in
the reply. An **idea** gets one line on what it would take.

You can also mark in words: "the button on /pricing is too low on a phone".
The agent captures the page, finds the element, asks which one you mean only
when it cannot tell, and records the mark with your words.

## Before and after, and closing

When the work is done, the agent captures the page again at the same
widths and proposes to close the mark, with the capture after and the
commit. Interface's **Your notes** tab, `/interface/notes`, shows the two side by side, the element outlined
in both. The mark stays open until you act: click **Accept as addressed**
or **Decline** in the viewer, or say so, and the agent records your words.
Your words must be your verdict on that mark, such as "yes, that is fixed"
or "the button is fine now": "close them all yourself, I have not looked
yet" is no verdict, so `greenline mark close` refuses it and the agent
leaves the marks open and tells you so in its own words: a mark you have
not judged is not its to close, and you close it in the viewer or give
your verdict on it. Nor can the agent close them another way: the marks
file is `greenline mark`'s and the viewer's alone, and the hooks refuse
the agent's own edit of it, by a write tool, a shell redirection or a
script that names it, so a mark you have not judged stays open. Words that name a mark's note, a
longer word of it or two of its words in a row such as "the top bar too",
are your verdict on that mark, so one sentence about two marks closes each
the same way.
A change is not finished while one of its marks is open, unless you say it
can stay open. At the close the agent copies the `marks:` line
`greenline status` prints into the record, or `marks: none open`, on a
line of its own or, in a quick change's one-line close, as its last
clause, and
the hooks refuse to close a change whose line says a mark waits that you
have closed, or leaves out one still open.

## Stale marks

A mark belongs to the commit its capture was taken at. Once a later commit
changes the files that capture shows, or, where the capture names no file,
your interface's folders, the status line names the mark as stale, and the
agent captures the page again before it acts on it.

## From the command line

```text
greenline mark list
greenline mark list --all
```

The agent uses `greenline mark add`, `propose` and `close`; each line of
the marks file records who acted and when, and a hand edit of the file is
refused, a script's included, whatever change is open. The hooks read the
command's words, so a script that builds the file's path from pieces is
beyond them, and the practice still holds the agent to the commands. See [the interface practice](./interface.md) for the captures, and
[the inspector](./inspect.md) for the viewer.
